import { createTimestamped, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };

function fixtures(store: MemoryStateStore) {
  const actor = createTimestamped("act", {
    id: "act_action_ledger",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character" as const,
    name: "Ledger Fighter",
    permissions: {},
    data: {
      class: "Fighter",
      level: 5,
      attributes: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 44, max: 44 },
      armorClass: 18,
      resources: { actionSurge: { current: 1, max: 1, recovery: "short" } },
    },
  }) satisfies Actor;
  const weapon = createTimestamped("itm", {
    id: "itm_action_ledger_longsword",
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "item" as const,
    name: "Longsword",
    data: { category: "weapon", damage: "1d8", versatileDamage: "1d10", ability: "strength", equipped: true },
  }) satisfies Item;
  const combat = createTimestamped("cmb", {
    id: "cmb_action_ledger",
    campaignId: actor.campaignId,
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [{ id: "cmbt_action_ledger", tokenId: "tok_action_ledger", actorId: actor.id, name: actor.name, initiative: 20, defeated: false, conditions: [] }],
  }) satisfies Combat;
  store.state.actors.push(actor);
  store.state.items.push(weapon);
  store.state.combats.push(combat);
  return { actor, combat, attackRollId: `item-${weapon.id}-attack` };
}

async function prepare(
  app: Awaited<ReturnType<typeof buildApp>>,
  route: string,
  key: string,
  payload: Record<string, unknown>,
) {
  return app.inject({ method: "POST", url: route, headers: { ...gm, "idempotency-key": `${key}-prepare` }, payload: { ...payload, prepare: true } });
}

type PreparedActionBody = {
  preparation: {
    preparedPreviewKey: string;
    sourceActorId: string;
    revisions: { actorUpdatedAt: Record<string, string> };
  };
};

async function commit(
  app: Awaited<ReturnType<typeof buildApp>>,
  route: string,
  key: string,
  body: PreparedActionBody,
) {
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...gm, "idempotency-key": `${key}-commit` },
    payload: {
      preparedPreviewKey: body.preparation.preparedPreviewKey,
      expectedUpdatedAt: body.preparation.revisions.actorUpdatedAt[body.preparation.sourceActorId],
    },
  });
}

describe("server-owned D&D standard Action ledger", () => {
  it("serializes Action use, Action Surge, replay, exhaustion, and turn reset through prepare/commit", async () => {
    const store = new MemoryStateStore();
    const { actor, combat, attackRollId } = fixtures(store);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;

    try {
      const unprepared = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: attackRollId } });
      expect(unprepared.statusCode).toBe(409);
      expect(unprepared.json().message).toContain("prepare");

      const firstPrepared = await prepare(app, route, "action-ledger-first", { rollId: attackRollId });
      expect(firstPrepared.statusCode).toBe(200);
      expect(firstPrepared.json()).toMatchObject({
        status: "ready",
        resolution: { action: { kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } } },
      });
      const firstCommitted = await commit(app, route, "action-ledger-first", firstPrepared.json() as PreparedActionBody);
      expect(firstCommitted.statusCode).toBe(200);
      expect(firstCommitted.json().resolution.action.ledger).toMatchObject({ actionsUsed: 1, actionSurgeGrants: 0 });
      const firstRevision = store.state.actors.find((candidate) => candidate.id === actor.id)!.updatedAt;

      const firstReplay = await commit(app, route, "action-ledger-first", firstPrepared.json() as PreparedActionBody);
      expect(firstReplay.statusCode).toBe(200);
      expect(firstReplay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.actors.find((candidate) => candidate.id === actor.id)!.updatedAt).toBe(firstRevision);

      const exhausted = await prepare(app, route, "action-ledger-exhausted", { rollId: attackRollId });
      expect(exhausted.statusCode).toBe(409);
      expect(exhausted.json().message).toContain("Standard Action already used");

      const surgePrepared = await prepare(app, route, "action-ledger-surge", { rollId: "feature-action-surge", consumeResources: true });
      expect(surgePrepared.statusCode).toBe(200);
      expect(surgePrepared.json().resolution.action.ledger).toMatchObject({ actionsUsed: 1, actionSurgeGrants: 1 });
      const surgeCommitted = await commit(app, route, "action-ledger-surge", surgePrepared.json() as PreparedActionBody);
      expect(surgeCommitted.statusCode).toBe(200);
      expect(surgeCommitted.json().usage.consumed).toContainEqual(expect.objectContaining({ key: "actionSurge", amount: 1, remaining: 0 }));
      expect(surgeCommitted.json().resolution.auditEvents).toContainEqual(expect.objectContaining({ code: "action-surge.granted" }));

      const extraPrepared = await prepare(app, route, "action-ledger-extra", { rollId: attackRollId });
      expect(extraPrepared.statusCode).toBe(200);
      expect(extraPrepared.json().resolution.action.ledger).toMatchObject({ actionsUsed: 2, actionSurgeGrants: 1 });
      const extraCommitted = await commit(app, route, "action-ledger-extra", extraPrepared.json() as PreparedActionBody);
      expect(extraCommitted.statusCode).toBe(200);

      const third = await prepare(app, route, "action-ledger-third", { rollId: attackRollId });
      expect(third.statusCode).toBe(409);
      expect(third.json().message).toContain("Standard Action already used");

      const advanced = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${combat.id}`,
        headers: { ...gm, "idempotency-key": "action-ledger-next-round" },
        payload: { round: 2, turnIndex: 0, expectedUpdatedAt: combat.updatedAt },
      });
      expect(advanced.statusCode).toBe(200);
      const afterReset = await prepare(app, route, "action-ledger-next-turn", { rollId: attackRollId });
      expect(afterReset.statusCode).toBe(200);
      expect(afterReset.json().resolution.action.ledger).toMatchObject({ round: 2, actionsUsed: 1, actionSurgeGrants: 0 });
    } finally {
      await app.close();
    }
  });
});
