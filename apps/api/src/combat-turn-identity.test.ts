import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyDnd5eSrdStandardActionUse } from "@open-tabletop/system-sdk";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const headers = (key: string, user = gm) => ({ ...user, "idempotency-key": key });

function fixture() {
  const store = new MemoryStateStore();
  const actors = ["a", "b"].map((id) => createTimestamped("act", {
    id: `act_identity_${id}`, campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm",
    type: "character" as const, name: id.toUpperCase(), permissions: {},
    data: {
      hp: { current: 20, max: 20 }, conditions: id === "a" ? [{ id: "poisoned" }] : [],
      features: ["Heroic Warrior"], heroicInspiration: false,
      rulesEngine: {
        reactions: { cmb_identity: { rollId: "spent-reaction", round: 1 } },
        actionEconomy: {
          bonusActions: { cmb_identity: { rollId: "spent-bonus", round: 1, turnIndex: 0 } },
          standardActions: { cmb_identity: { actorId: `act_identity_${id}`, actionsUsed: 1, round: 1, turnIndex: 0 } }
        },
        activeEffects: id === "a" ? [{
          id: "identity_poison", label: "Persistent poison", ownedConditionIds: ["poisoned"],
          schedule: { timing: "end_turn", anchorActorId: "act_identity_a", nextRound: 1, repeatSave: { ability: "constitution", dc: 15, endsOn: "success" } }
        }] : []
      }
    }
  }) satisfies Actor);
  const combat: Combat = createTimestamped("cmb", {
    id: "cmb_identity", campaignId: "camp_demo", active: true, round: 1, turnIndex: 0,
    combatants: actors.map((actor, index) => ({
      id: `cmbt_identity_${index === 0 ? "a" : "b"}`, tokenId: `tok_identity_${index}`, actorId: actor.id,
      name: actor.name, initiative: index === 0 ? 10 : 5, defeated: false,
      conditions: index === 0 ? ["poisoned"] : [], resourceUsed: true, resourceSpent: true
    }))
  }) satisfies Combat;
  store.state.actors.push(...actors);
  store.state.combats.push(combat);
  return { store, combat, actors };
}

function expectNoTurnEffects(store: MemoryStateStore, combat: Combat, actors: Actor[], beforeActors: Actor[]) {
  expect(actors.map((actor) => store.state.actors.find((candidate) => candidate.id === actor.id))).toEqual(beforeActors);
  const activeActor = actors.find((actor) => actor.id === combat.combatants[combat.turnIndex]?.actorId);
  if (activeActor) expect(applyDnd5eSrdStandardActionUse(activeActor.data, activeActor.id, "another-action", combat, combat.updatedAt).blocked?.code).toBe("action_already_used");
  expect(combat.effectScheduleEvents ?? []).toEqual([]);
  expect(combat.combatants.filter((combatant) => combatant.actorId).every((combatant) => combatant.resourceUsed && combatant.resourceSpent)).toBe(true);
  expect(store.state.auditLogs.filter((log) => log.targetId === combat.id).every((log) => !(log.after as Record<string, unknown>)?.rulesProgression)).toBe(true);
}

describe("combat turn identity during roster and initiative edits", () => {
  it.each([true, false])("adds a faster combatant without ending the current turn (explicit index: %s)", async (explicitIndex) => {
    const { store, combat, actors } = fixture();
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers(`identity-add-${explicitIndex}`), payload: {
        combatants: [...combat.combatants, { id: "cmbt_identity_c", tokenId: "tok_identity_c", name: "C", initiative: 20, defeated: false }],
        ...(explicitIndex ? { turnIndex: 1 } : {}), expectedUpdatedAt: combat.updatedAt
      } });
      expect(response.statusCode, response.body).toBe(200);
      expect(combat.combatants.map((combatant) => combatant.name)).toEqual(["C", "A", "B"]);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("A");
      expectNoTurnEffects(store, combat, actors, beforeActors);
    } finally { await app.close(); }
  });

  it.each(["a", "b"])("preserves the active actor when %s's initiative changes", async (id) => {
    const { store, combat, actors } = fixture();
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}/combatants/cmbt_identity_${id}`, headers: headers(`identity-initiative-${id}`), payload: {
        initiative: id === "a" ? 1 : 20, expectedUpdatedAt: combat.updatedAt
      } });
      expect(response.statusCode, response.body).toBe(200);
      expect(combat.combatants.map((combatant) => combatant.name)).toEqual(["B", "A"]);
      expect(combat.turnIndex).toBe(1);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("A");
      expectNoTurnEffects(store, combat, actors, beforeActors);
    } finally { await app.close(); }
  });

  it("preserves the active actor and spent actions when rerolled NPC initiative moves ahead", async () => {
    const { store, combat, actors } = fixture();
    const npc = store.state.actors.find((actor) => actor.id === actors[1]!.id)!;
    npc.type = "npc";
    npc.data = { ...npc.data, monster: { statBlock: { initiative: 30 } } };
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "POST", url: `/api/v1/combats/${combat.id}/initiative/roll-npcs`, headers: headers("identity-npc-reroll"), payload: { expectedUpdatedAt: combat.updatedAt } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().rolls).toHaveLength(1);
      expect(combat.combatants.map((combatant) => combatant.name)).toEqual(["B", "A"]);
      expect(combat.turnIndex).toBe(1);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("A");
      expectNoTurnEffects(store, combat, actors, beforeActors);
    } finally { await app.close(); }
  });

  it("preserves manual order and current identity, and removes current or earlier members without turn effects", async () => {
    const { store, combat, actors } = fixture();
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const reorder = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-manual"), payload: {
        manualTurnOrder: true, combatants: [...combat.combatants].reverse(), expectedUpdatedAt: combat.updatedAt
      } });
      expect(reorder.statusCode, reorder.body).toBe(200);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("A");
      const initiative = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}/combatants/cmbt_identity_a`, headers: headers("identity-manual-initiative"), payload: { initiative: 99, expectedUpdatedAt: combat.updatedAt } });
      expect(initiative.statusCode, initiative.body).toBe(200);
      expect(combat.combatants.map((combatant) => combatant.name)).toEqual(["B", "A"]);
      for (const id of ["cmbt_identity_b", "cmbt_identity_a"]) {
        const removed = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers(`identity-remove-${id}`), payload: {
          combatants: combat.combatants.filter((combatant) => combatant.id !== id), expectedUpdatedAt: combat.updatedAt
        } });
        expect(removed.statusCode, removed.body).toBe(200);
        expect(combat.turnIndex).toBe(0);
        expectNoTurnEffects(store, combat, actors, beforeActors);
      }
      expect(combat.combatants).toEqual([]);
    } finally { await app.close(); }
  });

  it("does not restore spent actions when removing and readding the same actor in one round", async () => {
    const { store, combat, actors } = fixture();
    const beforeActors = structuredClone(actors);
    const removedCombatant = structuredClone(combat.combatants[0]!);
    const app = await buildApp({ store });
    try {
      for (const [key, combatants] of [
        ["remove", combat.combatants.slice(1)],
        ["readd", [...combat.combatants.slice(1), removedCombatant]]
      ] as const) {
        const response = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers(`identity-${key}-same-actor`), payload: { combatants, expectedUpdatedAt: combat.updatedAt } });
        expect(response.statusCode, response.body).toBe(200);
        expectNoTurnEffects(store, combat, actors, beforeActors);
      }
      const rewind = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-rewind-readded"), payload: { turnIndex: 0, expectedUpdatedAt: combat.updatedAt } });
      expect(rewind.statusCode, rewind.body).toBe(200);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("A");
      expectNoTurnEffects(store, combat, actors, beforeActors);
    } finally { await app.close(); }
  });

  it.each([
    { wasActive: true, active: false },
    { wasActive: false, active: false },
    { wasActive: false, active: true }
  ])("allows final or setup positions outside continuing active combat: %j", async ({ wasActive, active }) => {
    const { store, combat, actors } = fixture();
    combat.active = wasActive;
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers(`identity-lifecycle-${wasActive}-${active}`), payload: {
        active, round: 2, turnIndex: 0, manualTurnOrder: true,
        combatants: [...combat.combatants].reverse(), expectedUpdatedAt: combat.updatedAt
      } });
      expect(response.statusCode, response.body).toBe(200);
      expect(combat).toMatchObject({ active, round: 2, turnIndex: 0, manualTurnOrder: true });
      expect(combat.combatants[combat.turnIndex]?.name).toBe("B");
      expect(actors.map((actor) => store.state.actors.find((candidate) => candidate.id === actor.id))).toEqual(beforeActors);
      expect(combat.effectScheduleEvents ?? []).toEqual([]);
      expect(combat.combatants.every((combatant) => combatant.resourceUsed && combatant.resourceSpent)).toBe(true);
      expect(store.state.auditLogs.filter((log) => log.targetId === combat.id).every((log) => !(log.after as Record<string, unknown>)?.rulesProgression)).toBe(true);
    } finally { await app.close(); }
  });

  it.each([{ turnIndex: 2 }, { round: 2 }, { turnIndex: 0 }])("rejects a simultaneous roster and turn change: %j", async (turnPatch) => {
    const { store, combat, actors } = fixture();
    const beforeCombat = structuredClone(combat);
    const beforeActors = structuredClone(actors);
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-mixed-change"), payload: {
        combatants: [...combat.combatants, { id: "cmbt_identity_c", tokenId: "tok_identity_c", name: "C", initiative: 20, defeated: false }],
        ...turnPatch, expectedUpdatedAt: combat.updatedAt
      } });
      expect(response.statusCode, response.body).toBe(400);
      expect(combat).toEqual(beforeCombat);
      expectNoTurnEffects(store, combat, actors, beforeActors);
    } finally { await app.close(); }
  });

  it("requires actor permission and due save outcomes for real progression, then refreshes only the next actor", async () => {
    const { store, combat, actors } = fixture();
    const beforeActors = structuredClone(actors);
    store.state.permissionGrants.push(createTimestamped("grant", {
      subjectType: "user" as const, subjectId: "usr_demo_player", campaignId: combat.campaignId, permissions: ["combat.manage"]
    }));
    const app = await buildApp({ store });
    try {
      const denied = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-progression-denied", { "x-user-id": "usr_demo_player" }), payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt } });
      expect(denied.statusCode, denied.body).toBe(403);
      const blocked = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-progression-save"), payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt } });
      expect(blocked.statusCode, blocked.body).toBe(422);
      expectNoTurnEffects(store, combat, actors, beforeActors);
      const eventId = blocked.json().unresolvedEventIds[0] as string;
      const advanced = await app.inject({ method: "PATCH", url: `/api/v1/combats/${combat.id}`, headers: headers("identity-progression-success"), payload: { turnIndex: 1, expectedUpdatedAt: combat.updatedAt, saveOutcomes: { [eventId]: "success" } } });
      expect(advanced.statusCode, advanced.body).toBe(200);
      expect(combat.combatants[combat.turnIndex]?.name).toBe("B");
      expect(actors[1]?.data).toMatchObject({ heroicInspiration: true, rulesEngine: { reactions: {}, actionEconomy: { bonusActions: {}, standardActions: {} } } });
      expect(actors[0]?.data.rulesEngine).toMatchObject({ reactions: { cmb_identity: { rollId: "spent-reaction" } } });
      expect(combat.effectScheduleEvents).toContainEqual(expect.objectContaining({ id: eventId, status: "save_succeeded" }));
    } finally { await app.close(); }
  });
});
