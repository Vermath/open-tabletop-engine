import type { Actor, Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("D&D combat-vitals mutations", () => {
  it("recovers a real zero-HP actor and combatant atomically, replays once, undoes exactly, and keeps temporary HP nonstacking", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
    actor.data = {
      ...actor.data,
      hp: { current: 0, max: 18 },
      conditions: ["unconscious", { id: "stable", source: "death-saves" }, { id: "poisoned" }],
      deathSaves: { successes: 2, failures: 1 },
      lifeState: "stable",
      defeated: true,
    };
    actor.updatedAt = bumpedRevision(actor.updatedAt);

    const ally: Actor = {
      ...structuredClone(actor),
      id: "act_vitals_ally",
      name: "Unaffected Ally",
      data: {
        ...actor.data,
        hp: { current: 11, max: 14 },
        conditions: [{ id: "blinded" }],
        deathSaves: { successes: 0, failures: 0 },
        lifeState: "conscious",
        defeated: false,
      },
      updatedAt: bumpedRevision(actor.updatedAt),
    };
    store.state.actors.push(ally);
    for (const existing of store.state.combats) existing.active = false;
    const combat: Combat = {
      id: "combat_vitals_recovery",
      campaignId: actor.campaignId,
      active: true,
      round: 3,
      turnIndex: 0,
      combatants: [
        {
          id: "combatant_vitals_target",
          tokenId: "tok_valen",
          actorId: actor.id,
          name: actor.name,
          initiative: 17,
          defeated: true,
          conditions: ["unconscious", "stable", "blinded"],
          deathSaveSuccesses: 2,
          deathSaveFailures: 1,
          deathSaveOutcome: "stable",
        },
        {
          id: "combatant_vitals_ally",
          tokenId: "tok_vitals_ally",
          actorId: ally.id,
          name: ally.name,
          initiative: 12,
          defeated: false,
          conditions: ["blinded"],
        },
      ],
      createdAt: actor.updatedAt,
      updatedAt: bumpedRevision(ally.updatedAt),
    };
    store.state.combats.push(combat);

    const actorBefore = structuredClone(actor);
    const combatBefore = structuredClone(combat);
    const allyCombatantBefore = structuredClone(combat.combatants[1]);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/${actor.campaignId}/systems/dnd-5e-srd/actors/${actor.id}/combat-vitals`;
    const recoveryBody = {
      kind: "healing",
      amount: 4,
      expectedActorUpdatedAt: actor.updatedAt,
      expectedCombatUpdatedAt: combat.updatedAt,
    };

    try {
      const unauthorized = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "combat-vitals:unauthorized" },
        payload: recoveryBody,
      });
      expect(unauthorized.statusCode, unauthorized.body).toBe(403);
      expect(unauthorized.json()).toMatchObject({ error: "forbidden", message: expect.stringContaining("combat.manage") });
      expect(actor).toEqual(actorBefore);
      expect(combat).toEqual(combatBefore);

      const missingCombatRevision = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:missing-combat-revision" },
        payload: { kind: "healing", amount: 4, expectedActorUpdatedAt: actor.updatedAt },
      });
      expect(missingCombatRevision.statusCode, missingCombatRevision.body).toBe(400);
      expect(actor).toEqual(actorBefore);
      expect(combat).toEqual(combatBefore);

      const staleCombatRevision = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:stale-combat-revision" },
        payload: { ...recoveryBody, expectedCombatUpdatedAt: bumpedRevision(combat.updatedAt) },
      });
      expect(staleCombatRevision.statusCode, staleCombatRevision.body).toBe(409);
      expect(staleCombatRevision.json()).toMatchObject({ error: "conflict", code: "stale_write", resourceType: "combat", resourceId: combat.id });
      expect(actor).toEqual(actorBefore);
      expect(combat).toEqual(combatBefore);

      const auditCountBefore = store.state.auditLogs.filter((entry) => entry.action === "system.actor.combatVitalsAdjusted").length;
      const mutationCountBefore = store.state.dndRulesMutations.length;
      const applied = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:recover" },
        payload: recoveryBody,
      });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(applied.json().adjustment).toEqual({
        kind: "healing",
        pool: "hp",
        requestedAmount: 4,
        appliedAmount: 4,
        before: 0,
        after: 4,
        max: 18,
        recoveredFromZero: true,
      });
      expect(applied.json().actor.data).toMatchObject({
        hp: { current: 4, max: 18 },
        deathSaves: { successes: 0, failures: 0 },
        lifeState: "conscious",
        defeated: false,
      });
      expect(applied.json().actor.data.conditions).toEqual([{ id: "poisoned" }]);
      expect(applied.json().combat.updatedAt).toBe(applied.json().actor.updatedAt);
      expect(applied.json().combat.combatants[0]).toEqual(expect.objectContaining({
        id: "combatant_vitals_target",
        defeated: false,
        conditions: ["blinded"],
      }));
      expect(applied.json().combat.combatants[0]).not.toHaveProperty("deathSaveSuccesses");
      expect(applied.json().combat.combatants[0]).not.toHaveProperty("deathSaveFailures");
      expect(applied.json().combat.combatants[0]).not.toHaveProperty("deathSaveOutcome");
      expect(applied.json().combat.combatants[1]).toEqual(allyCombatantBefore);
      expect(store.state.dndRulesMutations).toHaveLength(mutationCountBefore + 1);
      expect(store.state.auditLogs.filter((entry) => entry.action === "system.actor.combatVitalsAdjusted")).toHaveLength(auditCountBefore + 1);
      const mutation = store.state.dndRulesMutations.find((candidate) => candidate.id === applied.json().rulesMutationId)!;
      expect(mutation).toMatchObject({ kind: "vitals", status: "applied", preparedPreviewKey: "combat-vitals:recover" });
      expect(mutation.roots.combat).toEqual(expect.objectContaining({ combatId: combat.id, before: combatBefore, afterRevision: applied.json().combat.updatedAt }));

      const actorAfterApply = structuredClone(actor);
      const combatAfterApply = structuredClone(combat);
      const replay = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:recover" },
        payload: recoveryBody,
      });
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(applied.json());
      expect(actor).toEqual(actorAfterApply);
      expect(combat).toEqual(combatAfterApply);
      expect(store.state.dndRulesMutations).toHaveLength(mutationCountBefore + 1);
      expect(store.state.auditLogs.filter((entry) => entry.action === "system.actor.combatVitalsAdjusted")).toHaveLength(auditCountBefore + 1);

      const undo = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/dnd/rules-mutations/${mutation.id}/undo`,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:undo" },
        payload: {
          expectedActorUpdatedAt: applied.json().undo.expectedActorUpdatedAt,
          expectedItemUpdatedAt: applied.json().undo.expectedItemUpdatedAt,
          expectedCombatUpdatedAt: applied.json().undo.expectedCombatUpdatedAt,
        },
      });
      expect(undo.statusCode, undo.body).toBe(200);
      expect({ ...undo.json().actors[0], updatedAt: actorBefore.updatedAt }).toEqual(actorBefore);
      expect({ ...undo.json().combat, updatedAt: combatBefore.updatedAt }).toEqual(combatBefore);
      expect(undo.json().combat.combatants[1]).toEqual(allyCombatantBefore);
      expect(store.state.dndRulesMutations.find((candidate) => candidate.id === mutation.id)?.status).toBe("undone");

      const restoredActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const restoredCombat = store.state.combats.find((candidate) => candidate.id === combat.id)!;
      const strongerTempHp = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:temp-hp-stronger" },
        payload: { kind: "temporaryHitPoints", amount: 7, expectedActorUpdatedAt: restoredActor.updatedAt, expectedCombatUpdatedAt: restoredCombat.updatedAt },
      });
      expect(strongerTempHp.statusCode, strongerTempHp.body).toBe(200);
      expect(strongerTempHp.json().adjustment).toMatchObject({ kind: "temporaryHitPoints", before: 0, after: 7, appliedAmount: 7 });
      expect(strongerTempHp.json().actor.data.temporaryHitPoints).toBe(7);

      const lowerTempHp = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "combat-vitals:temp-hp-lower" },
        payload: { kind: "temporaryHitPoints", amount: 3, expectedActorUpdatedAt: strongerTempHp.json().actor.updatedAt, expectedCombatUpdatedAt: restoredCombat.updatedAt },
      });
      expect(lowerTempHp.statusCode, lowerTempHp.body).toBe(200);
      expect(lowerTempHp.json().adjustment).toMatchObject({ kind: "temporaryHitPoints", before: 7, after: 7, appliedAmount: 0 });
      expect(lowerTempHp.json().actor.data.temporaryHitPoints).toBe(7);
      expect(lowerTempHp.json().combat.combatants[1]).toEqual(allyCombatantBefore);
    } finally {
      await app.close();
    }
  });

  it("requires explicit revival authority before dead state can be healed", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
    actor.data = { ...actor.data, hp: { current: 0, max: 18 }, conditions: [{ id: "dead" }, { id: "poisoned" }], deathSaves: { successes: 0, failures: 3 }, lifeState: "dead", defeated: true };
    actor.updatedAt = bumpedRevision(actor.updatedAt);
    for (const combat of store.state.combats) combat.active = false;
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/${actor.campaignId}/systems/dnd-5e-srd/actors/${actor.id}/combat-vitals`;
    const before = structuredClone(actor);
    try {
      const ordinary = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "dead-ordinary-healing" }, payload: { kind: "healing", amount: 4, expectedActorUpdatedAt: actor.updatedAt } });
      expect(ordinary.statusCode).toBe(400);
      expect(ordinary.json().message).toContain("cannot revive a dead actor");
      expect(actor).toEqual(before);

      const unauthorizedRevival = await app.inject({ method: "POST", url: route, headers: { ...playerHeaders, "idempotency-key": "dead-player-revival" }, payload: { kind: "healing", amount: 1, revivesDead: true, expectedActorUpdatedAt: actor.updatedAt } });
      expect(unauthorizedRevival.statusCode).toBe(403);
      expect(actor).toEqual(before);

      const revival = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "dead-explicit-revival" }, payload: { kind: "healing", amount: 1, revivesDead: true, expectedActorUpdatedAt: actor.updatedAt } });
      expect(revival.statusCode, revival.body).toBe(200);
      expect(revival.json().actor.data).toMatchObject({ hp: { current: 1, max: 18 }, conditions: [{ id: "poisoned" }], deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious", defeated: false });
    } finally {
      await app.close();
    }
  });
});

function bumpedRevision(revision: string): string {
  return new Date(Date.parse(revision) + 1).toISOString();
}
