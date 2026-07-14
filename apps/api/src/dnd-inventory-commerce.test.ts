import { createTimestamped, makeArchive, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { DND5E_INVENTORY_METADATA_KEY, DND5E_LOOT_DATA_KEY } from "@open-tabletop/system-sdk";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

function addActor(store: MemoryStateStore, id: string, ownerUserId = "usr_demo_gm"): Actor {
  const actor = createTimestamped("act", {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId,
    type: "character",
    name: `Inventory ${id}`,
    data: {
      ruleset: "SRD 5.2.1",
      class: "Fighter",
      level: 1,
      attributes: { strength: 12, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 10, max: 10 },
      hitDice: { current: 1, max: 1, size: "d10" },
      conditions: [],
      currency: { gp: 20, sp: 0, cp: 0 }
    },
    permissions: {}
  }) satisfies Actor;
  store.state.actors.push(actor);
  return actor;
}

function addItem(store: MemoryStateStore, actor: Actor, id: string, name: string, data: Record<string, unknown>): Item {
  const item = createTimestamped("itm", {
    id,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "gear",
    name,
    data
  }) satisfies Item;
  store.state.items.push(item);
  return item;
}

async function createStash(app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStateStore, key = "stash-create") {
  const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/dnd/party-stash",
    headers: { ...gmHeaders, "idempotency-key": key },
    payload: { name: "Shared loot", capacityLb: 500, expectedCampaignUpdatedAt: campaign.updatedAt }
  });
  expect(response.statusCode).toBe(201);
  return store.state.items.find((item) => item.id === response.json().partyStash.id)!;
}

describe("strict D&D inventory and commerce API", () => {
  it("creates replay-safe stash and merchant catalogs, then buys and sells without partial writes", async () => {
    const store = new MemoryStateStore();
    const actor = addActor(store, "act_commerce");
    const app = await buildApp({ store });
    try {
      const stash = await createStash(app, store);
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const merchantPayload = {
        name: "Quartermaster",
        description: "Field supplies",
        buybackRate: 0.5,
        currency: { gp: 50 },
        catalog: [{ id: "arrow", compendiumEntryId: "arrows", unitPriceGp: 0.05, availableQuantity: 40 }],
        expectedCampaignUpdatedAt: campaign.updatedAt
      };
      const merchantHeaders = { ...gmHeaders, "idempotency-key": "merchant-create" };
      const created = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/dnd/merchants", headers: merchantHeaders, payload: merchantPayload });
      expect(created.statusCode).toBe(201);
      const merchant = store.state.items.find((item) => item.id === created.json().merchant.id)!;
      const replayed = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/dnd/merchants", headers: merchantHeaders, payload: merchantPayload });
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.items.filter((item) => item.type === "dnd5e-merchant")).toHaveLength(1);

      const buyPayload = { actorId: actor.id, catalogEntryId: "arrow", quantity: 20, expectedActorUpdatedAt: actor.updatedAt, expectedMerchantUpdatedAt: merchant.updatedAt };
      const bought = await app.inject({ method: "POST", url: `/api/v1/campaigns/camp_demo/dnd/merchants/${merchant.id}/buy`, headers: { ...gmHeaders, "idempotency-key": "merchant-buy" }, payload: buyPayload });
      expect(bought.statusCode).toBe(200);
      expect(bought.json()).toMatchObject({ purchase: { quantity: 20, totalPriceGp: 1 }, actor: { data: { currency: { gp: 19 } } }, item: { data: { quantity: 20 } } });
      const arrows = store.state.items.find((item) => item.data.merchantCatalogEntryId === "arrow")!;
      const commerceAudits = () => store.state.auditLogs.filter((entry) => entry.action !== "auth.legacyUserHeader");
      const stateBeforeStale = structuredClone({ actor, merchant, arrows, audits: commerceAudits() });
      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/merchants/${merchant.id}/sell`,
        headers: { ...gmHeaders, "idempotency-key": "merchant-sell-stale" },
        payload: { actorId: actor.id, itemId: arrows.id, quantity: 5, expectedActorUpdatedAt: "2020-01-01T00:00:00.000Z", expectedMerchantUpdatedAt: merchant.updatedAt, expectedItemUpdatedAt: arrows.updatedAt }
      });
      expect(stale.statusCode).toBe(409);
      expect({ actor, merchant, arrows, audits: commerceAudits() }).toEqual(stateBeforeStale);

      const sold = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/merchants/${merchant.id}/sell`,
        headers: { ...gmHeaders, "idempotency-key": "merchant-sell" },
        payload: { actorId: actor.id, itemId: arrows.id, quantity: 5, expectedActorUpdatedAt: actor.updatedAt, expectedMerchantUpdatedAt: merchant.updatedAt, expectedItemUpdatedAt: arrows.updatedAt }
      });
      expect(sold.statusCode).toBe(200);
      expect(sold.json()).toMatchObject({ sale: { quantity: 5, totalPriceGp: 0.13 }, item: { data: { quantity: 15 } } });
      expect(stash.type).toBe("dnd5e-party-stash");
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining(["dnd.partyStashCreated", "dnd.merchantCreated", "dnd.merchantPurchase", "dnd.merchantSale"]));
    } finally {
      await app.close();
    }
  });

  it("does not trust player-edited item names or commerce valuation provenance", async () => {
    const store = new MemoryStateStore();
    const actor = addActor(store, "act_commerce_player", "usr_demo_player");
    const item = addItem(store, actor, "itm_commerce_pebble", "Pebble", { quantity: 1, weightLb: 0, costGp: 1 });
    const app = await buildApp({ store });
    try {
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/dnd/merchants",
        headers: { ...gmHeaders, "idempotency-key": "merchant-valuation-create" },
        payload: {
          name: "Gem Broker",
          buybackRate: 0.5,
          catalog: [{ id: "ruby", name: "Ruby", type: "gear", unitPriceGp: 1_000, sellPriceGp: 1_000 }],
          expectedCampaignUpdatedAt: campaign.updatedAt
        }
      });
      expect(created.statusCode).toBe(201);
      const merchant = store.state.items.find((candidate) => candidate.id === created.json().merchant.id)!;

      const forgedValue = await app.inject({
        method: "PATCH",
        url: `/api/v1/items/${item.id}`,
        headers: playerHeaders,
        payload: { data: { ...item.data, costGp: 1_000, merchantId: merchant.id, merchantCatalogEntryId: "ruby" }, expectedUpdatedAt: item.updatedAt }
      });
      expect(forgedValue.statusCode).toBe(409);
      expect(item.data).toMatchObject({ costGp: 1 });
      expect(item.data).not.toHaveProperty("merchantCatalogEntryId");

      const renamed = await app.inject({
        method: "PATCH",
        url: `/api/v1/items/${item.id}`,
        headers: playerHeaders,
        payload: { name: "Ruby", expectedUpdatedAt: item.updatedAt }
      });
      expect(renamed.statusCode).toBe(200);

      const sold = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/merchants/${merchant.id}/sell`,
        headers: { ...playerHeaders, "idempotency-key": "merchant-valuation-sell" },
        payload: {
          actorId: actor.id,
          itemId: item.id,
          quantity: 1,
          expectedActorUpdatedAt: actor.updatedAt,
          expectedMerchantUpdatedAt: merchant.updatedAt,
          expectedItemUpdatedAt: item.updatedAt
        }
      });
      expect(sold.statusCode).toBe(200);
      expect(sold.json()).toMatchObject({ sale: { quantity: 1, unitPriceGp: 0.5, totalPriceGp: 0.5 } });
    } finally {
      await app.close();
    }
  });

  it("guards container graphs, transfers full subtrees, and consumes only linked matching ammunition", async () => {
    const store = new MemoryStateStore();
    const actor = addActor(store, "act_inventory_graph");
    const pack = addItem(store, actor, "itm_pack", "Backpack", { weightLb: 5, capacityLb: 30, quantity: 1 });
    const pouch = addItem(store, actor, "itm_pouch", "Pouch", { weightLb: 1, capacityLb: 6, quantity: 1 });
    const bow = addItem(store, actor, "itm_bow", "Shortbow", { weightLb: 2, ammunition: "arrow", quantity: 1 });
    const arrows = addItem(store, actor, "itm_arrows", "Arrows", { weightLb: 0.05, ammunition: "arrow", quantity: 20 });
    const app = await buildApp({ store });
    try {
      const stash = await createStash(app, store, "stash-graph");
      const parentPouch = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaigns/camp_demo/dnd/inventory/items/${pouch.id}`,
        headers: { ...gmHeaders, "idempotency-key": "pouch-parent" },
        payload: { parentItemId: pack.id, expectedUpdatedAt: pouch.updatedAt, expectedOwnerUpdatedAt: actor.updatedAt }
      });
      expect(parentPouch.statusCode).toBe(200);
      const consequentialAudits = () => store.state.auditLogs.filter((entry) => entry.action !== "auth.legacyUserHeader");
      const beforeCycle = structuredClone({ pack, pouch, actor, audits: consequentialAudits() });
      const cycle = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaigns/camp_demo/dnd/inventory/items/${pack.id}`,
        headers: { ...gmHeaders, "idempotency-key": "pack-cycle" },
        payload: { parentItemId: pouch.id, expectedUpdatedAt: pack.updatedAt, expectedOwnerUpdatedAt: actor.updatedAt }
      });
      expect(cycle.statusCode).toBe(400);
      expect({ pack, pouch, actor, audits: consequentialAudits() }).toEqual(beforeCycle);

      const partial = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/inventory/items/${pack.id}/transfer`,
        headers: { ...gmHeaders, "idempotency-key": "pack-partial" },
        payload: { quantity: 0, destination: { kind: "party_stash", stashId: stash.id }, expectedUpdatedAt: pack.updatedAt, expectedSourceUpdatedAt: actor.updatedAt, expectedDestinationUpdatedAt: stash.updatedAt }
      });
      expect(partial.statusCode).toBe(400);
      const moved = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/inventory/items/${pack.id}/transfer`,
        headers: { ...gmHeaders, "idempotency-key": "pack-full" },
        payload: { quantity: 1, destination: { kind: "party_stash", stashId: stash.id }, expectedUpdatedAt: pack.updatedAt, expectedSourceUpdatedAt: actor.updatedAt, expectedDestinationUpdatedAt: stash.updatedAt }
      });
      expect(moved.statusCode).toBe(200);
      expect(pack.actorId).toBeUndefined();
      expect(pouch.actorId).toBeUndefined();
      expect((pouch.data[DND5E_INVENTORY_METADATA_KEY] as Record<string, unknown>).parentItemId).toBe(pack.id);

      const consumed = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/inventory/items/${bow.id}/consume-ammunition`,
        headers: { ...gmHeaders, "idempotency-key": "arrow-consume" },
        payload: { ammunitionItemId: arrows.id, amount: 2, expectedUpdatedAt: bow.updatedAt, expectedAmmunitionUpdatedAt: arrows.updatedAt, expectedActorUpdatedAt: actor.updatedAt }
      });
      expect(consumed.statusCode).toBe(200);
      expect(consumed.json()).toMatchObject({ consumed: 2, remaining: 18 });
      expect(arrows.data.quantity).toBe(18);
    } finally {
      await app.close();
    }
  });

  it("records typed combat loot, supports owner claims and GM assignment, and archives the full lifecycle", async () => {
    const store = new MemoryStateStore();
    const actor = addActor(store, "act_loot_player", "usr_demo_player");
    const combat: Combat = createTimestamped("cmb", { id: "cmb_loot", campaignId: actor.campaignId, active: true, round: 1, turnIndex: 0, combatants: [] });
    store.state.combats.push(combat);
    const app = await buildApp({ store });
    try {
      const stash = await createStash(app, store, "stash-loot");
      const recordPayload = { stashId: stash.id, items: [{ name: "Vault key", type: "gear", quantity: 1, weightLb: 0.1 }], note: "Guardian cache", expectedUpdatedAt: combat.updatedAt, expectedStashUpdatedAt: stash.updatedAt };
      const recorded = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/dnd/loot`, headers: { ...gmHeaders, "idempotency-key": "loot-record" }, payload: recordPayload });
      expect(recorded.statusCode).toBe(201);
      const loot = store.state.items.find((item) => item.id === recorded.json().lootItems[0].id)!;
      expect(combat.rewards?.[0]?.lootItemIds).toEqual([loot.id]);
      expect(loot.data[DND5E_LOOT_DATA_KEY]).toMatchObject({ status: "available", combatId: combat.id });

      const claim = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/loot/${loot.id}/claim`,
        headers: { ...playerHeaders, "idempotency-key": "loot-claim" },
        payload: { actorId: actor.id, expectedUpdatedAt: loot.updatedAt, expectedStashUpdatedAt: stash.updatedAt, expectedActorUpdatedAt: actor.updatedAt }
      });
      expect(claim.statusCode).toBe(200);
      expect(claim.json().claim).toMatchObject({ status: "claimed", claimedForActorId: actor.id });

      const lootAudits = () => store.state.auditLogs.filter((entry) => entry.action !== "auth.legacyUserHeader");
      const beforeForbidden = structuredClone({ loot, stash, actor, audits: lootAudits() });
      const forbidden = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/loot/${loot.id}/assignment`,
        headers: { ...playerHeaders, "idempotency-key": "loot-assign-player" },
        payload: { action: "assign", actorId: actor.id, expectedUpdatedAt: loot.updatedAt, expectedStashUpdatedAt: stash.updatedAt, expectedActorUpdatedAt: actor.updatedAt }
      });
      expect(forbidden.statusCode).toBe(403);
      expect({ loot, stash, actor, audits: lootAudits() }).toEqual(beforeForbidden);

      const assigned = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/loot/${loot.id}/assignment`,
        headers: { ...gmHeaders, "idempotency-key": "loot-assign-gm" },
        payload: { action: "assign", actorId: actor.id, expectedUpdatedAt: loot.updatedAt, expectedStashUpdatedAt: stash.updatedAt, expectedActorUpdatedAt: actor.updatedAt }
      });
      expect(assigned.statusCode).toBe(200);
      expect(loot.actorId).toBe(actor.id);
      expect(assigned.json().loot).toMatchObject({ status: "assigned", assignedToActorId: actor.id });

      const archive = makeArchive(store.state, actor.campaignId);
      expect(archive.data.items.find((item) => item.id === loot.id)?.data[DND5E_LOOT_DATA_KEY]).toMatchObject({ status: "assigned" });
      expect(archive.data.combats.find((entry) => entry.id === combat.id)?.rewards?.[0]?.lootItemIds).toEqual([loot.id]);
      const archiveValidation = validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 });
      expect(archiveValidation, JSON.stringify(archiveValidation)).toMatchObject({ ok: true });
    } finally {
      await app.close();
    }
  });
});
