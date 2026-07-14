import { createTimestamped, type Actor, type CampaignArchive, type CompendiumProvenance, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function userProvenance(systemId: string, contentVersion = "1.0.0"): CompendiumProvenance {
  return {
    sourceKind: "user",
    sourceName: "Vault Homebrew",
    sourceVersion: "1.0.0",
    contentVersion,
    systemId,
    systemVersion: "0.1.0",
    rulesVersion: "House rules 1.0",
    license: {
      name: "Private home game",
      usage: "private_home_game",
      attribution: "Created by the campaign GM."
    }
  };
}

function addDndPurchaser(store: MemoryStateStore): Actor {
  const actor = createTimestamped("act", {
    id: "act_compendium_purchaser",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Compendium Purchaser",
    data: {
      level: 1,
      class: "Fighter",
      hp: { current: 12, max: 12 },
      currency: { pp: 0, gp: 20, ep: 0, sp: 0, cp: 0 }
    },
    permissions: {}
  }) satisfies Actor;
  store.state.actors.push(actor);
  return actor;
}

describe("campaign compendium provenance and conflict safety", () => {
  it("filters the standalone catalog, reports provenance, protects homebrew, and archives its metadata", async () => {
    const store = new MemoryStateStore();
    const homebrew = createTimestamped("itm", {
      id: "itm_homebrew_vault_key",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      type: "item",
      name: "Vault Key",
      data: {
        summary: "A campaign-owned key with explicit authorship.",
        rarity: "unique",
        compendiumProvenance: userProvenance("generic-fantasy")
      }
    }) satisfies Item;
    const unprovenanced = createTimestamped("itm", {
      id: "itm_hidden_homebrew",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      type: "item",
      name: "Unprovenanced Secret",
      data: { summary: "Must never enter the compendium." }
    }) satisfies Item;
    store.state.items.push(homebrew, unprovenanced);
    const app = await buildApp({ store });

    try {
      const gmCatalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/compendium?q=vault&type=item",
        headers: gmHeaders
      });
      expect(gmCatalog.statusCode).toBe(200);
      expect(gmCatalog.json()).toMatchObject({
        systemId: "generic-fantasy",
        filters: { q: "vault", types: ["item"] },
        provenanceSummary: { filteredEntries: 1 }
      });
      expect(gmCatalog.json().entries).toEqual([
        expect.objectContaining({
          id: `campaign-item:${homebrew.id}`,
          name: "Vault Key",
          provenance: expect.objectContaining({ sourceKind: "user", contentVersion: "1.0.0" })
        })
      ]);

      const playerCatalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/compendium?q=vault&type=item",
        headers: playerHeaders
      });
      expect(playerCatalog.statusCode).toBe(200);
      expect(playerCatalog.json().entries).toEqual([]);

      const srdCatalog = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/compendium?q=longsword&types=item",
        headers: playerHeaders
      });
      expect(srdCatalog.statusCode).toBe(200);
      expect(srdCatalog.json().entries).toEqual([
        expect.objectContaining({
          id: "longsword",
          provenance: expect.objectContaining({
            sourceKind: "srd",
            sourceVersion: "5.2.1",
            contentVersion: "5.2.1",
            license: expect.objectContaining({ usage: "srd" })
          })
        })
      ]);
      expect(srdCatalog.json().provenanceSummary.sources).toEqual([
        expect.objectContaining({ sourceKind: "srd", contentVersion: "5.2.1", entryCount: 1 })
      ]);

      const archiveResponse = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: gmHeaders });
      expect(archiveResponse.statusCode).toBe(200);
      const archive = archiveResponse.json() as CampaignArchive;
      expect(archive.data.items.find((item) => item.id === homebrew.id)?.data.compendiumProvenance).toEqual(userProvenance("generic-fantasy"));
    } finally {
      await app.close();
    }
  });

  it("requires replay and revision guards and replaces imports in place after explicit conflict choices", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.id === "act_generic_demo")!;
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/${actor.id}/compendium`;

    try {
      const observedRevision = actor.updatedAt;
      const missingKey = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "" },
        payload: { entryId: "longsword", expectedUpdatedAt: observedRevision }
      });
      expect(missingKey.statusCode).toBe(400);

      const addedPayload = { entryId: "longsword", expectedUpdatedAt: observedRevision };
      const addedHeaders = { ...playerHeaders, "idempotency-key": "compendium-add-longsword" };
      const added = await app.inject({ method: "POST", url: route, headers: addedHeaders, payload: addedPayload });
      expect(added.statusCode).toBe(200);
      expect(added.json()).toMatchObject({ resolution: "added", entry: { id: "longsword" } });
      const importedItemId = added.json().item.id as string;
      expect(store.state.items.filter((item) => item.actorId === actor.id && item.data.compendiumId === "longsword")).toHaveLength(1);
      expect(store.state.items.find((item) => item.id === importedItemId)?.data.compendiumProvenance).toMatchObject({ contentVersion: "0.1.0" });

      const replayed = await app.inject({ method: "POST", url: route, headers: addedHeaders, payload: addedPayload });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.items.filter((item) => item.actorId === actor.id && item.data.compendiumId === "longsword")).toHaveLength(1);

      const stale = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "compendium-add-stale" },
        payload: addedPayload
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceId: actor.id });

      const exactConflictPayload = { entryId: "longsword", expectedUpdatedAt: actor.updatedAt };
      const exactConflict = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "compendium-add-conflict" },
        payload: exactConflictPayload
      });
      expect(exactConflict.statusCode).toBe(409);
      expect(exactConflict.json()).toMatchObject({
        code: "compendium_conflict",
        conflict: { kind: "exact_duplicate", existingItemId: importedItemId, choices: ["keep_existing", "replace_existing"] }
      });

      const unsafeMerge = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "compendium-add-unsafe-merge" },
        payload: { ...exactConflictPayload, conflictChoice: "merge_existing" }
      });
      expect(unsafeMerge.statusCode).toBe(409);

      const replaced = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "compendium-add-replace" },
        payload: { ...exactConflictPayload, conflictChoice: "replace_existing" }
      });
      expect(replaced.statusCode).toBe(200);
      expect(replaced.json()).toMatchObject({ resolution: "replaced_existing", item: { id: importedItemId } });
      expect(store.state.items.filter((item) => item.actorId === actor.id && item.data.compendiumId === "longsword")).toHaveLength(1);

      const importedItem = store.state.items.find((item) => item.id === importedItemId)!;
      importedItem.data.compendiumProvenance = {
        ...(importedItem.data.compendiumProvenance as CompendiumProvenance),
        contentVersion: "0.0.9"
      };
      const versionConflict = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "compendium-add-version-conflict" },
        payload: { entryId: "longsword", expectedUpdatedAt: actor.updatedAt }
      });
      expect(versionConflict.statusCode).toBe(409);
      expect(versionConflict.json()).toMatchObject({
        conflict: { kind: "version_conflict", existingVersion: "0.0.9", requestedVersion: "0.1.0", existingItemId: importedItemId }
      });
      expect(store.state.items.find((item) => item.id === importedItemId)?.data.compendiumProvenance).toMatchObject({ contentVersion: "0.0.9" });
      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining(["actor.compendiumItemAdded", "actor.compendiumItemReplaced"]));
    } finally {
      await app.close();
    }
  });

  it("never spends or stacks equipment until an explicit merge or replace choice, and preserves the item id", async () => {
    const store = new MemoryStateStore();
    const actor = addDndPurchaser(store);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/purchase`;

    try {
      const firstPayload = { entryId: "bedroll", quantity: 2, expectedUpdatedAt: actor.updatedAt };
      const firstHeaders = { ...gmHeaders, "idempotency-key": "compendium-purchase-bedroll" };
      const purchased = await app.inject({ method: "POST", url: route, headers: firstHeaders, payload: firstPayload });
      expect(purchased.statusCode).toBe(200);
      expect(purchased.json()).toMatchObject({ resolution: "purchased", purchase: { totalCostGp: 2 }, item: { data: { quantity: 2 } } });
      const purchasedItemId = purchased.json().item.id as string;
      expect((actor.data.currency as Record<string, number>).gp).toBe(18);

      const replayed = await app.inject({ method: "POST", url: route, headers: firstHeaders, payload: firstPayload });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect((actor.data.currency as Record<string, number>).gp).toBe(18);
      expect(store.state.items.find((item) => item.id === purchasedItemId)?.data.quantity).toBe(2);

      const duplicatePayload = { entryId: "bedroll", quantity: 3, expectedUpdatedAt: actor.updatedAt };
      const duplicate = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "compendium-purchase-duplicate" },
        payload: duplicatePayload
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({
        conflict: { kind: "exact_duplicate", existingItemId: purchasedItemId, choices: ["keep_existing", "merge_existing"] }
      });
      expect((actor.data.currency as Record<string, number>).gp).toBe(18);
      expect(store.state.items.find((item) => item.id === purchasedItemId)?.data.quantity).toBe(2);

      const mergedHeaders = { ...gmHeaders, "idempotency-key": "compendium-purchase-merge" };
      const mergedPayload = { ...duplicatePayload, conflictChoice: "merge_existing" };
      const merged = await app.inject({ method: "POST", url: route, headers: mergedHeaders, payload: mergedPayload });
      expect(merged.statusCode).toBe(200);
      expect(merged.json()).toMatchObject({ resolution: "merged_existing", item: { id: purchasedItemId, data: { quantity: 5 } } });
      expect((actor.data.currency as Record<string, number>).gp).toBe(15);
      expect(store.state.items.filter((item) => item.actorId === actor.id && item.data.compendiumId === "bedroll")).toHaveLength(1);

      const mergedReplay = await app.inject({ method: "POST", url: route, headers: mergedHeaders, payload: mergedPayload });
      expect(mergedReplay.statusCode).toBe(200);
      expect(mergedReplay.headers["idempotency-replayed"]).toBe("true");
      expect((actor.data.currency as Record<string, number>).gp).toBe(15);
      expect(store.state.items.find((item) => item.id === purchasedItemId)?.data.quantity).toBe(5);

      const purchasedItem = store.state.items.find((item) => item.id === purchasedItemId)!;
      purchasedItem.data.compendiumProvenance = {
        ...(purchasedItem.data.compendiumProvenance as CompendiumProvenance),
        contentVersion: "5.2.0"
      };
      const versionConflictPayload = { entryId: "bedroll", quantity: 1, expectedUpdatedAt: actor.updatedAt };
      const versionConflict = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "compendium-purchase-version-conflict" },
        payload: versionConflictPayload
      });
      expect(versionConflict.statusCode).toBe(409);
      expect(versionConflict.json()).toMatchObject({
        conflict: { kind: "version_conflict", existingVersion: "5.2.0", requestedVersion: "5.2.1", choices: ["keep_existing", "replace_existing"] }
      });
      expect((actor.data.currency as Record<string, number>).gp).toBe(15);

      const replaced = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "compendium-purchase-version-replace" },
        payload: { ...versionConflictPayload, conflictChoice: "replace_existing" }
      });
      expect(replaced.statusCode).toBe(200);
      expect(replaced.json()).toMatchObject({ resolution: "replaced_existing", item: { id: purchasedItemId, data: { quantity: 1, purchasedForGp: 1 } } });
      expect((actor.data.currency as Record<string, number>).gp).toBe(14);
      expect(store.state.items.filter((item) => item.actorId === actor.id && item.data.compendiumId === "bedroll")).toHaveLength(1);
      expect(store.state.auditLogs.map((log) => log.action)).toEqual(expect.arrayContaining([
        "actor.compendiumEquipmentPurchased",
        "actor.compendiumEquipmentMerged",
        "actor.compendiumEquipmentReplaced"
      ]));
    } finally {
      await app.close();
    }
  });
});
