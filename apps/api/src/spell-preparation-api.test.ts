import { createTimestamped, type Actor, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

function addWizard(store: MemoryStateStore): { actor: Actor; alarm: Item; burningHands: Item } {
  const actor = createTimestamped("act", {
    id: "act_preparation_wizard",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Prepared Wizard",
    data: {
      level: 1,
      spellcasting: {
        className: "Wizard",
        preparedSpellCapacity: 4,
        preparedSpellCapacityLevel: 1,
        preparedSpells: ["alarm"],
        spellbookSpells: ["alarm", "burning-hands"],
        changeTiming: "long-rest"
      }
    },
    permissions: {}
  }) satisfies Actor;
  const spell = (id: string, name: string, compendiumId: string, prepared: boolean): Item => createTimestamped("itm", {
    id,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "spell",
    name,
    data: {
      level: 1,
      ...(id === "itm_preparation_burning_hands" ? { compendiumEntryId: compendiumId } : { compendiumId }),
      classSpell: true,
      inSpellbook: true,
      prepared,
      spellSources: [{ kind: "class", className: "Wizard", selection: "spellbook", selectedAtLevel: 1 }]
    }
  });
  const alarm = spell("itm_preparation_alarm", "Alarm", "alarm", true);
  const burningHands = spell("itm_preparation_burning_hands", "Burning Hands", "burning-hands", false);
  store.state.actors.push(actor);
  store.state.items.push(alarm, burningHands);
  return { actor, alarm, burningHands };
}

function revisions(actor: Actor, items: Item[]) {
  return {
    expectedActorUpdatedAt: actor.updatedAt,
    expectedItemUpdatedAt: Object.fromEntries(items.map((item) => [item.id, item.updatedAt]))
  };
}

describe("D&D spell preparation API", () => {
  it("does not allow an always-prepared spell to be switched off", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
    const item = createTimestamped("itm", {
      id: "itm_always_prepared",
      campaignId: actor.campaignId,
      systemId: "dnd-5e-srd",
      actorId: actor.id,
      type: "spell",
      name: "Always Prepared Spell",
      data: { prepared: true, alwaysPrepared: true, damageFormula: "1d8", damageType: "radiant" }
    }) satisfies Item;
    store.state.items.push(item);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/items/${item.id}`,
        headers: { ...gmHeaders, "idempotency-key": "spell-generic-patch-always-prepared" },
        payload: { data: { ...item.data, prepared: false }, expectedUpdatedAt: item.updatedAt, manualOverrideReason: "Test invariant enforcement" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe("An always-prepared spell cannot be unprepared");
      expect(item.data.prepared).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("does not allow generic item PATCH to bypass rules-managed class preparation", async () => {
    const store = new MemoryStateStore();
    const { alarm } = addWizard(store);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/items/${alarm.id}`,
        headers: { ...gmHeaders, "idempotency-key": "spell-generic-patch-rules-managed" },
        payload: { data: { ...alarm.data, prepared: false }, expectedUpdatedAt: alarm.updatedAt, manualOverrideReason: "Test invariant enforcement" }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe("Rules-managed D&D class spell preparation requires a reviewed preview and apply");
      expect(alarm.data.prepared).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("previews and atomically applies exact server-calculated changes with idempotent replay", async () => {
    const store = new MemoryStateStore();
    const { actor, alarm, burningHands } = addWizard(store);
    const app = await buildApp({ store });
    const baseUrl = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/spell-preparation`;
    try {
      const preview = await app.inject({
        method: "POST",
        url: `${baseUrl}/preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-preview-1" },
        payload: {
          selectedSpellIds: [burningHands.id],
          timing: "long-rest",
          ...revisions(actor, [alarm, burningHands])
        }
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(expect.objectContaining({
        status: "ready",
        preparedPreviewKey: "spell-preview-1",
        capacity: expect.objectContaining({ limit: 4, selected: 1 }),
        changes: [
          expect.objectContaining({ itemId: alarm.id, fromPrepared: true, toPrepared: false }),
          expect.objectContaining({ itemId: burningHands.id, fromPrepared: false, toPrepared: true })
        ]
      }));

      const applyPayload = {
        preparedPreviewKey: "spell-preview-1",
        ...revisions(actor, [alarm, burningHands])
      };
      const apply = await app.inject({
        method: "POST",
        url: `${baseUrl}/apply`,
        headers: { ...gmHeaders, "idempotency-key": "spell-apply-1" },
        payload: applyPayload
      });

      expect(apply.statusCode).toBe(200);
      expect(apply.json()).toEqual(expect.objectContaining({ applied: true, actor: expect.objectContaining({ id: actor.id }) }));
      expect(alarm.data.prepared).toBe(false);
      expect(burningHands.data.prepared).toBe(true);
      expect((actor.data.spellcasting as Record<string, unknown>).preparedSpells).toEqual(["burning-hands"]);
      expect(actor.updatedAt).toBe(alarm.updatedAt);
      expect(actor.updatedAt).toBe(burningHands.updatedAt);

      const replay = await app.inject({
        method: "POST",
        url: `${baseUrl}/apply`,
        headers: { ...gmHeaders, "idempotency-key": "spell-apply-1" },
        payload: applyPayload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.body).toBe(apply.body);
      expect(store.state.auditLogs.filter((entry) => entry.action === "system.actor.spellPreparationApplied" && entry.targetId === actor.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("rejects stale spell revisions before mutating actor or items", async () => {
    const store = new MemoryStateStore();
    const { actor, alarm, burningHands } = addWizard(store);
    const app = await buildApp({ store });
    const baseUrl = `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/spell-preparation`;
    try {
      const initialRevisions = revisions(actor, [alarm, burningHands]);
      const preview = await app.inject({
        method: "POST",
        url: `${baseUrl}/preview`,
        headers: { ...gmHeaders, "idempotency-key": "spell-preview-stale" },
        payload: { selectedSpellIds: [burningHands.id], timing: "long-rest", ...initialRevisions }
      });
      expect(preview.statusCode).toBe(200);

      burningHands.updatedAt = "2026-07-13T23:59:59.000Z";
      const apply = await app.inject({
        method: "POST",
        url: `${baseUrl}/apply`,
        headers: { ...gmHeaders, "idempotency-key": "spell-apply-stale" },
        payload: { preparedPreviewKey: "spell-preview-stale", ...initialRevisions }
      });

      expect(apply.statusCode).toBe(409);
      expect(apply.json()).toEqual(expect.objectContaining({ code: "stale_write", resourceId: burningHands.id }));
      expect(alarm.data.prepared).toBe(true);
      expect(burningHands.data.prepared).toBe(false);
      expect(store.state.auditLogs.some((entry) => entry.action === "system.actor.spellPreparationApplied" && entry.targetId === actor.id)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("requires actor-update authority for preview and apply", async () => {
    const store = new MemoryStateStore();
    const { actor, alarm, burningHands } = addWizard(store);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/systems/${actor.systemId}/actors/${actor.id}/spell-preparation/preview`,
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "spell-preview-forbidden" },
        payload: {
          selectedSpellIds: [burningHands.id],
          timing: "long-rest",
          ...revisions(actor, [alarm, burningHands])
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe("Missing permission: actor.update");
    } finally {
      await app.close();
    }
  });
});
