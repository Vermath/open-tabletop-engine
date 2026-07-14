import { createTimestamped, type Actor, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

async function createFighter(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
    headers: { ...gmHeaders, "idempotency-key": "attunement-create-fighter" },
    payload: { templateId: "fighter", name: "Attunement Fighter", ownerUserId: "usr_demo_gm" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().actor as Actor;
}

function addMagicItem(store: MemoryStateStore, actor: Actor, id: string, data: Record<string, unknown> = {}): Item {
  const item = createTimestamped("itm", {
    id,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "item",
    name: `Attunement Wand ${id}`,
    data: { requiresAttunement: true, damageFormula: "1d6", damageType: "force", ...data }
  }) satisfies Item;
  store.state.items.push(item);
  return item;
}

describe("D&D attunement API transaction", () => {
  it("requires an authorized, documented curse break before a cursed item can be unattuned", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === created.id)!;
      const cursed = addMagicItem(store, actor, "itm_cursed_attunement", { cursed: true });
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/attunement`;
      const attuned = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-cursed-add" },
        payload: { itemId: cursed.id, attuned: true, expectedUpdatedAt: actor.updatedAt }
      });
      expect(attuned.statusCode).toBe(200);

      const withoutBreak = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-cursed-remove-blocked" },
        payload: { itemId: cursed.id, attuned: false, expectedUpdatedAt: actor.updatedAt }
      });
      expect(withoutBreak.statusCode).toBe(400);
      expect(withoutBreak.json().message).toContain("curse is broken");

      const missingReason = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-cursed-remove-no-reason" },
        payload: { itemId: cursed.id, attuned: false, breakCurse: true, expectedUpdatedAt: actor.updatedAt }
      });
      expect(missingReason.statusCode).toBe(400);
      expect(missingReason.json().message).toContain("documented overrideReason");

      actor.ownerUserId = "usr_demo_player";
      const ownerBreak = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "attunement-cursed-remove-owner" },
        payload: { itemId: cursed.id, attuned: false, breakCurse: true, overrideReason: "Remove Curse", expectedUpdatedAt: actor.updatedAt }
      });
      expect(ownerBreak.statusCode).toBe(403);

      const observedRevision = actor.updatedAt;
      const broken = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-cursed-remove-manager" },
        payload: { itemId: cursed.id, attuned: false, breakCurse: true, overrideReason: "Remove Curse cast by the party cleric", expectedUpdatedAt: observedRevision }
      });
      expect(broken.statusCode).toBe(200);
      expect(broken.json().attunement.attunedItemIds).not.toContain(cursed.id);
      expect(store.state.auditLogs.find((entry) => entry.action === "actor.itemUnattuned" && entry.targetId === actor.id)).toMatchObject({
        after: { itemId: cursed.id, attuned: false, breakCurse: true, overrideReason: "Remove Curse cast by the party cleric" }
      });
    } finally {
      await app.close();
    }
  });

  it("validates ownership and item eligibility before changing actor state", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === created.id)!;
      const mundane = addMagicItem(store, actor, "itm_mundane", { requiresAttunement: false });
      const foreign = addMagicItem(store, { ...actor, id: "act_other", name: "Other" }, "itm_foreign");
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/attunement`;
      const before = structuredClone(actor);

      for (const itemId of ["itm_missing", mundane.id, foreign.id]) {
        const response = await app.inject({
          method: "POST",
          url: route,
          headers: { ...gmHeaders, "idempotency-key": `attunement-invalid-${itemId}` },
          payload: { itemId, attuned: true, expectedUpdatedAt: actor.updatedAt }
        });
        expect(response.statusCode).toBe(400);
      }
      expect(actor).toEqual(before);

      const forbidden = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "attunement-forbidden-player" },
        payload: { itemId: mundane.id, attuned: true, expectedUpdatedAt: actor.updatedAt }
      });
      expect(forbidden.statusCode).toBe(403);
      expect(actor).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("is optimistic, audited, and replay-safe while enforcing the active-item limit", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === created.id)!;
      const items = [1, 2, 3, 4].map((index) => addMagicItem(store, actor, `itm_attune_${index}`));
      const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/attunement`;
      const firstExpectedUpdatedAt = actor.updatedAt;
      const firstPayload = { itemId: items[0]!.id, attuned: true, expectedUpdatedAt: firstExpectedUpdatedAt };
      const idempotentHeaders = { ...gmHeaders, "idempotency-key": "attunement-first-item" };

      const first = await app.inject({ method: "POST", url: route, headers: idempotentHeaders, payload: firstPayload });
      expect(first.statusCode).toBe(200);
      expect(first.json().attunement).toEqual(expect.objectContaining({ activeAttunedItemIds: [items[0]!.id], limit: 3 }));
      expect(actor.updatedAt).not.toBe(firstExpectedUpdatedAt);

      const retry = await app.inject({ method: "POST", url: route, headers: idempotentHeaders, payload: firstPayload });
      expect(retry.statusCode).toBe(200);
      expect(retry.headers["idempotency-replayed"]).toBe("true");
      expect(retry.json()).toEqual(first.json());
      expect(store.state.auditLogs.filter((entry) => entry.action === "actor.itemAttuned" && entry.targetId === actor.id && (entry.after as { itemId?: string } | undefined)?.itemId === items[0]!.id)).toHaveLength(1);

      const stale = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-stale-second-item" },
        payload: { itemId: items[1]!.id, attuned: true, expectedUpdatedAt: firstExpectedUpdatedAt }
      });
      expect(stale.statusCode).toBe(409);
      expect((actor.data.rulesEngine as { attunedItemIds: string[] }).attunedItemIds).toEqual([items[0]!.id]);

      for (const [index, item] of items.slice(1, 3).entries()) {
        const response = await app.inject({
          method: "POST",
          url: route,
          headers: { ...gmHeaders, "idempotency-key": `attunement-valid-${index + 2}` },
          payload: { itemId: item.id, attuned: true, expectedUpdatedAt: actor.updatedAt }
        });
        expect(response.statusCode).toBe(200);
      }

      const fourthWithoutOverride = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-fourth-without-override" },
        payload: { itemId: items[3]!.id, attuned: true, expectedUpdatedAt: actor.updatedAt }
      });
      expect(fourthWithoutOverride.statusCode).toBe(400);
      expect((actor.data.rulesEngine as { attunedItemIds: string[] }).attunedItemIds).toEqual(items.slice(0, 3).map((item) => item.id));

      const fourthWithOverride = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "attunement-fourth-with-override" },
        payload: { itemId: items[3]!.id, attuned: true, expectedUpdatedAt: actor.updatedAt, overrideReason: "Explicit campaign boon" }
      });
      expect(fourthWithOverride.statusCode).toBe(200);
      expect(fourthWithOverride.json().attunement).toEqual(expect.objectContaining({
        activeAttunedItemIds: items.map((item) => item.id),
        overLimitBy: 1,
        overrideReason: "Explicit campaign boon"
      }));
    } finally {
      await app.close();
    }
  });

  it("rejects a stale unattuned action and enables it only after attunement", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await createFighter(app);
      const actor = store.state.actors.find((candidate) => candidate.id === created.id)!;
      const wand = addMagicItem(store, actor, "itm_action_wand");
      const rollId = `item-${wand.id}-damage`;
      const rollRoute = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;

      const unavailable = await app.inject({
        method: "POST",
        url: rollRoute,
        headers: { ...gmHeaders, "idempotency-key": "attunement-unavailable-roll" },
        payload: { rollId, targetActorId: actor.id, applyEffect: false, consumeResources: false, commit: false }
      });
      expect(unavailable.statusCode).toBe(404);

      const attuned = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/attunement`,
        headers: { ...gmHeaders, "idempotency-key": "attunement-action-wand" },
        payload: { itemId: wand.id, attuned: true, expectedUpdatedAt: actor.updatedAt }
      });
      expect(attuned.statusCode).toBe(200);

      const available = await app.inject({
        method: "POST",
        url: rollRoute,
        headers: { ...gmHeaders, "idempotency-key": "attunement-available-roll" },
        payload: { rollId, targetActorId: actor.id, applyEffect: false, consumeResources: false, commit: false }
      });
      expect(available.statusCode).toBe(200);
      expect(available.json().resolution).toEqual(expect.objectContaining({ rollId }));
      expect(available.json().resolution.blocked).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
