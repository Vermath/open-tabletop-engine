import { createTimestamped, type Actor, type Combat, type Item } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

vi.mock("./fair-dice.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fair-dice.js")>();
  return {
    ...actual,
    // This seed resolves 1d20 to 19, exercising Champion's expanded range.
    rollFormulaWithFairness: (formula: string, options: { clientSeed?: unknown; serverSeed?: string } = {}) =>
      actual.rollFormulaWithFairness(formula, { ...options, serverSeed: "stable" })
  };
});

const gm = { "x-user-id": "usr_demo_gm" };

function actor(id: string, name: string, data: Record<string, unknown>): Actor {
  return createTimestamped("act", { id, campaignId: "camp_demo", systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm", type: "character" as const, name, data, permissions: {} }) satisfies Actor;
}

async function prepare(app: Awaited<ReturnType<typeof buildApp>>, route: string, key: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: route, headers: { ...gm, "idempotency-key": key }, payload: { ...payload, prepare: true } });
}

async function commit(app: Awaited<ReturnType<typeof buildApp>>, route: string, key: string, prepared: Record<string, any>) {
  return app.inject({
    method: "POST",
    url: route,
    headers: { ...gm, "idempotency-key": key },
    payload: {
      preparedPreviewKey: prepared.preparation.preparedPreviewKey,
      expectedUpdatedAt: prepared.preparation.revisions.actorUpdatedAt[prepared.preparation.sourceActorId]
    }
  });
}

describe("critical attack-to-damage API continuation", () => {
  it("preserves expanded-range and negated verdicts through prepare, commit, audit, replay, and undo", async () => {
    const store = new MemoryStateStore();
    const champion = actor("act_critical_champion", "Champion", {
      class: "Fighter",
      classes: [{ className: "Fighter", level: 5, hitDie: "d10" }],
      subclasses: { Fighter: "champion" },
      subclass: "champion",
      level: 5,
      attributes: { strength: 18, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 44, max: 44 }
    });
    const ordinaryTarget = actor("act_critical_target", "Ordinary Target", { attributes: { dexterity: 10 }, hp: { current: 80, max: 80 }, armorClass: 30 });
    const protectedTarget = actor("act_critical_protected", "Protected Target", { attributes: { dexterity: 10 }, hp: { current: 80, max: 80 }, armorClass: 30 });
    const weapon = createTimestamped("itm", { id: "itm_critical_longsword", campaignId: "camp_demo", systemId: "dnd-5e-srd", actorId: champion.id, type: "item" as const, name: "Longsword", data: { category: "weapon", damage: "1d8", damageType: "slashing", ability: "strength", equipped: true } }) satisfies Item;
    const adamantine = createTimestamped("itm", { id: "itm_critical_adamantine", campaignId: "camp_demo", systemId: "dnd-5e-srd", actorId: protectedTarget.id, type: "item" as const, name: "Adamantine Armor", data: { category: "armor", equipped: true, criticalHitsBecomeNormalHits: true } }) satisfies Item;
    const combat = createTimestamped("cmb", {
      id: "cmb_critical_continuation", campaignId: "camp_demo", active: true, round: 1, turnIndex: 0,
      combatants: [champion, ordinaryTarget, protectedTarget].map((entry, index) => ({ id: `cmbt_critical_${index}`, tokenId: `tok_critical_${index}`, actorId: entry.id, name: entry.name, initiative: 20 - index, defeated: false }))
    }) satisfies Combat;
    store.state.actors.push(champion, ordinaryTarget, protectedTarget);
    store.state.items.push(weapon, adamantine);
    store.state.combats.push(combat);
    const app = await buildApp({ store });
    const route = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${champion.id}/roll`;
    const targetActorIds = [ordinaryTarget.id, protectedTarget.id];

    try {
      const attackPreview = await prepare(app, route, "critical-attack-preview", { rollId: `item-${weapon.id}-attack`, targetActorIds });
      expect(attackPreview.statusCode, attackPreview.body).toBe(200);
      const attackBody = attackPreview.json() as Record<string, any>;
      const continuationId = attackBody.resolution.action.metadata.continuationId as string;
      expect(continuationId).toBeTruthy();
      expect(attackBody.resolution.action.metadata.criticalOutcomes).toEqual([
        expect.objectContaining({ targetActorId: ordinaryTarget.id, naturalD20: 19, criticalMinimum: 19, outcome: "critical-hit", criticalNegated: false, finalCritical: true }),
        expect.objectContaining({ targetActorId: protectedTarget.id, naturalD20: 19, criticalMinimum: 19, outcome: "critical-hit", criticalNegated: true, finalCritical: false })
      ]);
      const attackCommit = await commit(app, route, "critical-attack-commit", attackBody);
      expect(attackCommit.statusCode, attackCommit.body).toBe(200);
      expect(attackCommit.json().resolution.action.metadata).toMatchObject({ continuationId, criticalOutcomes: attackBody.resolution.action.metadata.criticalOutcomes });

      const wrongTicket = await prepare(app, route, "critical-damage-wrong-ticket", { rollId: `item-${weapon.id}-damage`, targetActorIds, applyEffect: true, continuationId: `${continuationId}:wrong` });
      expect(wrongTicket.statusCode).toBe(409);
      expect(wrongTicket.json().message).toContain("matching predecessor");

      const damagePreview = await prepare(app, route, "critical-damage-preview", { rollId: `item-${weapon.id}-damage`, targetActorIds, applyEffect: true, continuationId });
      expect(damagePreview.statusCode, damagePreview.body).toBe(200);
      const damageBody = damagePreview.json() as Record<string, any>;
      expect(damageBody.resolution.action.metadata).toMatchObject({ continuationId, criticalOutcomes: attackBody.resolution.action.metadata.criticalOutcomes });
      expect(damageBody.rolls).toEqual([
        expect.objectContaining({ targetActorId: ordinaryTarget.id, formula: "2d8+4" }),
        expect.objectContaining({ targetActorId: protectedTarget.id, formula: "1d8+4" })
      ]);

      const damageCommit = await commit(app, route, "critical-damage-commit", damageBody);
      expect(damageCommit.statusCode, damageCommit.body).toBe(200);
      const committedBody = damageCommit.json() as Record<string, any>;
      expect(committedBody.resolution.action.metadata).toMatchObject({ continuationId, criticalOutcomes: attackBody.resolution.action.metadata.criticalOutcomes });
      const revisionAfterCommit = store.state.actors.find((candidate) => candidate.id === champion.id)!.updatedAt;
      const replay = await commit(app, route, "critical-damage-commit", damageBody);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json().resolution.action.metadata).toEqual(committedBody.resolution.action.metadata);
      expect(store.state.actors.find((candidate) => candidate.id === champion.id)!.updatedAt).toBe(revisionAfterCommit);

      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({
        action: "system.actor.roll",
        targetId: champion.id,
        after: expect.objectContaining({ continuationId, criticalOutcomes: attackBody.resolution.action.metadata.criticalOutcomes })
      }));

      const undo = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/dnd/rules-mutations/${committedBody.rulesMutationId}/undo`,
        headers: { ...gm, "idempotency-key": "critical-damage-undo" },
        payload: {
          expectedActorUpdatedAt: committedBody.undo.expectedActorUpdatedAt,
          expectedItemUpdatedAt: committedBody.undo.expectedItemUpdatedAt,
          ...(committedBody.undo.expectedCombatUpdatedAt ? { expectedCombatUpdatedAt: committedBody.undo.expectedCombatUpdatedAt } : {})
        }
      });
      expect(undo.statusCode, undo.body).toBe(200);
      const afterUndo = await prepare(app, route, "critical-damage-after-undo", { rollId: `item-${weapon.id}-damage`, targetActorIds, applyEffect: true, continuationId });
      expect(afterUndo.statusCode, afterUndo.body).toBe(200);
      expect(afterUndo.json().resolution.action.metadata.criticalOutcomes).toEqual(attackBody.resolution.action.metadata.criticalOutcomes);
      expect(afterUndo.json().rolls.map((roll: { formula: string }) => roll.formula)).toEqual(["2d8+4", "1d8+4"]);
    } finally {
      await app.close();
    }
  }, 20_000);
});
