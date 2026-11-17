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
      resources: { secondWind: { current: 2, max: 2, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } },
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
  it("allows Second Wind and Tactical Mind resource spends before the same-turn Attack", async () => {
    const store = new MemoryStateStore();
    const { actor, attackRollId } = fixtures(store);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;

    try {
      const secondWindPrepared = await prepare(app, route, "action-ledger-second-wind", { rollId: "feature-second-wind-healing", consumeResources: true });
      expect(secondWindPrepared.statusCode).toBe(200);
      expect(secondWindPrepared.json().resolution).toMatchObject({
        action: { kind: "bonusAction", metadata: { action: "Bonus Action" } },
        resourceConsumption: [{ key: "secondWind", amount: 1, remaining: 1 }],
        auditEvents: expect.arrayContaining([expect.objectContaining({ code: "bonus_action.used" })]),
      });
      const secondWindCommitted = await commit(app, route, "action-ledger-second-wind", secondWindPrepared.json() as PreparedActionBody);
      expect(secondWindCommitted.statusCode).toBe(200);
      expect(secondWindCommitted.json().usage.consumed).toContainEqual(expect.objectContaining({ key: "secondWind", amount: 1, remaining: 1 }));

      const failedCheck = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "ability-strength" } });
      expect(failedCheck.statusCode).toBe(200);
      const failedRoll = failedCheck.json().roll as { id: string; total: number };
      const tacticalMindPrepared = await prepare(app, route, "action-ledger-tactical-mind", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: failedRoll.id, dc: failedRoll.total + 1 } });
      expect(tacticalMindPrepared.statusCode).toBe(200);
      expect(tacticalMindPrepared.json().resolution).toMatchObject({
        action: { kind: "free", metadata: { activation: "free" } },
        resourceConsumption: [{ key: "secondWind", amount: 1, remaining: 0 }],
        tacticalMind: { failedCheckRollId: failedRoll.id, success: true, resourceSpent: true },
      });
      expect(tacticalMindPrepared.json().resolution.auditEvents).not.toContainEqual(expect.objectContaining({ code: "action.used" }));
      expect(tacticalMindPrepared.json().resolution.auditEvents).not.toContainEqual(expect.objectContaining({ code: "bonus_action.used" }));
      const tacticalMindCommitted = await commit(app, route, "action-ledger-tactical-mind", tacticalMindPrepared.json() as PreparedActionBody);
      expect(tacticalMindCommitted.statusCode).toBe(200);
      expect(tacticalMindCommitted.json().usage.consumed).toContainEqual(expect.objectContaining({ key: "secondWind", amount: 1, remaining: 0 }));

      const attackPrepared = await prepare(app, route, "action-ledger-after-features", { rollId: attackRollId });
      expect(attackPrepared.statusCode).toBe(200);
      expect(attackPrepared.json().resolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } });
      const attackCommitted = await commit(app, route, "action-ledger-after-features", attackPrepared.json() as PreparedActionBody);
      expect(attackCommitted.statusCode).toBe(200);
      expect(attackCommitted.json().resolution.action.ledger).toMatchObject({ actionsUsed: 1, actionSurgeGrants: 0 });
    } finally {
      await app.close();
    }
  });

  it("refunds a failed Tactical Mind attempt, records it once, and spends only on a later success", async () => {
    const store = new MemoryStateStore();
    const { actor } = fixtures(store);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;

    try {
      const withoutResource = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "feature-tactical-mind-bonus" } });
      expect(withoutResource.statusCode).toBe(400);
      expect(withoutResource.json().message).toContain("reviewed Second Wind resource use");
      const withoutContext = await prepare(app, route, "tactical-mind-no-context", { rollId: "feature-tactical-mind-bonus", consumeResources: true });
      expect(withoutContext.statusCode).toBe(400);
      expect(withoutContext.json().message).toContain("failed ability check");
      const savingThrow = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "save-strength" } });
      expect(savingThrow.statusCode).toBe(200);
      const savingThrowRoll = savingThrow.json().roll as { id: string; total: number };
      const nonCheckContext = await prepare(app, route, "tactical-mind-saving-throw", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: savingThrowRoll.id, dc: savingThrowRoll.total + 1 } });
      expect(nonCheckContext.statusCode).toBe(400);
      expect(nonCheckContext.json().message).toContain("ability, skill, or tool check");

      const earlierCheck = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "ability-dexterity" } });
      const failedCheck = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "skill-athletics" } });
      expect(earlierCheck.statusCode).toBe(200);
      expect(failedCheck.statusCode).toBe(200);
      const earlierRoll = earlierCheck.json().roll as { id: string; total: number };
      const failedRoll = failedCheck.json().roll as { id: string; total: number };
      const staleContext = await prepare(app, route, "tactical-mind-stale-check", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: earlierRoll.id, dc: earlierRoll.total + 1 } });
      expect(staleContext.statusCode).toBe(409);
      expect(staleContext.json().message).toContain("most recent ability check");

      const failedPrepared = await prepare(app, route, "tactical-mind-refund", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: failedRoll.id, dc: failedRoll.total + 11 } });
      expect(failedPrepared.statusCode).toBe(200);
      expect(failedPrepared.json().resolution).toMatchObject({
        resourceConsumption: [],
        tacticalMind: { failedCheckRollId: failedRoll.id, success: false, resourceSpent: false },
        auditEvents: expect.arrayContaining([expect.objectContaining({ code: "tactical-mind.failed-refund" })]),
      });
      const failedCommitted = await commit(app, route, "tactical-mind-refund", failedPrepared.json() as PreparedActionBody);
      expect(failedCommitted.statusCode).toBe(200);
      expect(failedCommitted.json().usage.consumed).toEqual([]);
      expect(((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.resources as Record<string, { current: number }>).secondWind?.current)).toBe(2);
      expect((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.rulesEngine as { tacticalMindAttempts: Record<string, unknown> }).tacticalMindAttempts).toHaveProperty(failedRoll.id);
      const retry = await prepare(app, route, "tactical-mind-refund-retry", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: failedRoll.id, dc: failedRoll.total + 11 } });
      expect(retry.statusCode).toBe(409);
      expect(retry.json().message).toContain("already attempted");

      const nextCheck = await app.inject({ method: "POST", url: route, headers: gm, payload: { rollId: "ability-wisdom" } });
      expect(nextCheck.statusCode).toBe(200);
      const nextRoll = nextCheck.json().roll as { id: string; total: number };
      const successPrepared = await prepare(app, route, "tactical-mind-success", { rollId: "feature-tactical-mind-bonus", consumeResources: true, tacticalMindCheck: { failedCheckRollId: nextRoll.id, dc: nextRoll.total + 1 } });
      expect(successPrepared.statusCode).toBe(200);
      expect(successPrepared.json().resolution).toMatchObject({ resourceConsumption: [{ key: "secondWind", remaining: 1 }], tacticalMind: { success: true, resourceSpent: true } });
      const successCommitted = await commit(app, route, "tactical-mind-success", successPrepared.json() as PreparedActionBody);
      expect(successCommitted.statusCode).toBe(200);
      expect(successCommitted.json().usage.consumed).toEqual([expect.objectContaining({ key: "secondWind", remaining: 1 })]);
      const replayedCommit = await commit(app, route, "tactical-mind-success", successPrepared.json() as PreparedActionBody);
      expect(replayedCommit.statusCode).toBe(200);
      expect(((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.resources as Record<string, { current: number }>).secondWind?.current)).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("spends one slot for a bonus-action spell attack and no second slot for its on-hit damage", async () => {
    const store = new MemoryStateStore();
    const { actor, attackRollId } = fixtures(store);
    Object.assign(actor.data, {
      ...actor.data,
      class: "Cleric",
      attributes: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
      spellSlots: { level2: { current: 2, max: 2, recovery: "long" } },
    });
    const spell = createTimestamped("itm", {
      id: "itm_action_ledger_spiritual_weapon",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      actorId: actor.id,
      type: "spell" as const,
      name: "Spiritual Weapon",
      data: { level: 2, action: "bonus", damageFormula: "1d8+@spellcasting", damageType: "force", spellAttack: true, spellcastingAbility: "wisdom", prepared: true },
    }) satisfies Item;
    store.state.items.push(spell);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;

    try {
      const spellAttackId = `spell-${spell.id}-attack`;
      const spellDamageId = `spell-${spell.id}-damage`;
      const directDamage = await prepare(app, route, "spell-economy-direct-damage", { rollId: spellDamageId, consumeResources: true });
      expect(directDamage.statusCode).toBe(409);
      expect(directDamage.json().message).toContain("matching predecessor");
      const attackPrepared = await prepare(app, route, "spell-economy-attack", { rollId: spellAttackId, consumeResources: true });
      expect(attackPrepared.statusCode).toBe(200);
      expect(attackPrepared.json().resolution).toMatchObject({
        action: { kind: "bonusAction" },
        resourceConsumption: [{ type: "spellSlot", key: "level2", remaining: 1 }],
      });
      expect((await commit(app, route, "spell-economy-attack", attackPrepared.json() as PreparedActionBody)).statusCode).toBe(200);

      const damagePrepared = await prepare(app, route, "spell-economy-damage", { rollId: spellDamageId, consumeResources: true });
      expect(damagePrepared.statusCode).toBe(200);
      expect(damagePrepared.json().resolution).toMatchObject({ action: { kind: "free", metadata: { activation: "on-hit" } }, resourceConsumption: [], auditEvents: expect.arrayContaining([expect.objectContaining({ code: "continuation.consumed" })]) });
      expect((await commit(app, route, "spell-economy-damage", damagePrepared.json() as PreparedActionBody)).statusCode).toBe(200);
      expect(((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.spellSlots as Record<string, { current: number }>).level2?.current)).toBe(1);
      const damageReplay = await prepare(app, route, "spell-economy-damage-replay", { rollId: spellDamageId, consumeResources: true });
      expect(damageReplay.statusCode).toBe(409);
      expect(damageReplay.json().message).toContain("unused matching predecessor");

      const ordinaryAttack = await prepare(app, route, "spell-economy-ordinary-attack", { rollId: attackRollId });
      expect(ordinaryAttack.statusCode).toBe(200);
      expect(ordinaryAttack.json().resolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1 } });
    } finally {
      await app.close();
    }
  });

  it("binds Chromatic Orb damage to one reviewed attack and the attack's spell-slot level", async () => {
    const store = new MemoryStateStore();
    const { actor } = fixtures(store);
    Object.assign(actor.data, { ...actor.data, class: "Wizard", attributes: { strength: 10, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 }, spellSlots: { level1: { current: 2, max: 2, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } } });
    const spell = createTimestamped("itm", { id: "itm_action_ledger_chromatic_orb", campaignId: actor.campaignId, systemId: actor.systemId, actorId: actor.id, type: "spell" as const, name: "Chromatic Orb", data: { level: 1, action: "action", damageFormula: "3d8", upcastFormula: "1d8", damageType: "acid", spellAttack: true, spellcastingAbility: "intelligence", prepared: true } }) satisfies Item;
    store.state.items.push(spell);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/roll`;
    const attackId = `spell-${spell.id}-attack`;
    const damageId = `spell-${spell.id}-damage`;

    try {
      const attackPrepared = await prepare(app, route, "chromatic-continuation-attack", { rollId: attackId, spellSlotLevel: 2, consumeResources: true });
      expect(attackPrepared.statusCode).toBe(200);
      expect(attackPrepared.json().resolution.resourceConsumption).toEqual([expect.objectContaining({ type: "spellSlot", key: "level2", remaining: 1 })]);
      expect((await commit(app, route, "chromatic-continuation-attack", attackPrepared.json() as PreparedActionBody)).statusCode).toBe(200);

      const wrongSlot = await prepare(app, route, "chromatic-continuation-wrong-slot", { rollId: damageId, spellSlotLevel: 1, consumeResources: true });
      expect(wrongSlot.statusCode).toBe(409);
      expect(wrongSlot.json().message).toContain("matching predecessor");

      const damagePrepared = await prepare(app, route, "chromatic-continuation-damage", { rollId: damageId, spellSlotLevel: 2, consumeResources: true });
      expect(damagePrepared.statusCode).toBe(200);
      expect(damagePrepared.json().resolution).toMatchObject({ action: { kind: "free", metadata: { activation: "on-hit" } }, resourceConsumption: [] });
      expect((await commit(app, route, "chromatic-continuation-damage", damagePrepared.json() as PreparedActionBody)).statusCode).toBe(200);
      expect(((store.state.actors.find((candidate) => candidate.id === actor.id)!.data.spellSlots as Record<string, { current: number }>).level2?.current)).toBe(1);

      const replay = await prepare(app, route, "chromatic-continuation-replay", { rollId: damageId, spellSlotLevel: 2, consumeResources: true });
      expect(replay.statusCode).toBe(409);
      expect(replay.json().message).toContain("unused matching predecessor");
    } finally {
      await app.close();
    }
  });

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
