import type { Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };

describe("reviewed typed damage combat synchronization", () => {
  it("applies critical-at-zero Death Saves and combatant lifecycle in one revisioned, undoable mutation", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
        headers: { ...headers, "idempotency-key": "typed-damage-combat:create" },
        payload: { templateId: "fighter", name: "Critical Target", ownerUserId: "usr_demo_gm" }
      });
      expect(created.statusCode).toBe(200);
      const actor = store.state.actors.find((candidate) => candidate.id === created.json().actor.id)!;
      actor.data = {
        ...actor.data,
        hp: { ...(actor.data.hp as Record<string, unknown>), current: 0 },
        conditions: [{ id: "unconscious" }],
        deathSaves: { successes: 1, failures: 0 },
        lifeState: "unconscious",
        defeated: false
      };
      actor.updatedAt = bumpedRevision(actor.updatedAt);
      const actorDataBefore = structuredClone(actor.data);

      store.state.combats = store.state.combats.map((combat) => combat.campaignId === actor.campaignId ? { ...combat, active: false } : combat);
      const combat: Combat = {
        id: "combat_typed_damage_sync",
        campaignId: actor.campaignId,
        active: true,
        round: 2,
        turnIndex: 0,
        combatants: [{
          id: "combatant_critical_target",
          tokenId: "token_critical_target",
          actorId: actor.id,
          name: actor.name,
          initiative: 14,
          defeated: false,
          conditions: ["unconscious"],
          deathSaveSuccesses: 1,
          deathSaveFailures: 0
        }],
        createdAt: actor.updatedAt,
        updatedAt: actor.updatedAt
      };
      store.state.combats.push(combat);
      const combatBefore = structuredClone(combat);
      const route = `/api/v1/campaigns/${actor.campaignId}/systems/dnd-5e-srd/actors/${actor.id}`;

      const firstPreview = await prepareCriticalDamage(app, route, "typed-damage-combat:first-preview");
      expect(firstPreview.preparation).toEqual(expect.objectContaining({
        combatId: combat.id,
        combatUpdatedAt: combat.updatedAt
      }));
      expect(firstPreview.batch.targets[0].preview.proposedData).toEqual(expect.objectContaining({
        deathSaves: { successes: 1, failures: 2 },
        lifeState: "unconscious"
      }));

      const missingCombatRevision = await app.inject({
        method: "POST",
        url: `${route}/typed-damage/apply`,
        headers: { ...headers, "idempotency-key": "typed-damage-combat:missing-revision" },
        payload: {
          preparedPreviewKey: firstPreview.preparation.preparedPreviewKey,
          expectedActorUpdatedAt: firstPreview.preparation.actorUpdatedAt,
          expectedItemUpdatedAt: firstPreview.preparation.itemUpdatedAt
        }
      });
      expect(missingCombatRevision.statusCode).toBe(409);
      expect(actor.data).toEqual(actorDataBefore);
      expect(combat).toEqual(combatBefore);

      combat.updatedAt = bumpedRevision(combat.updatedAt);
      const staleCombatRevision = await app.inject({
        method: "POST",
        url: `${route}/typed-damage/apply`,
        headers: { ...headers, "idempotency-key": "typed-damage-combat:stale-revision" },
        payload: {
          preparedPreviewKey: firstPreview.preparation.preparedPreviewKey,
          expectedActorUpdatedAt: firstPreview.preparation.actorUpdatedAt,
          expectedItemUpdatedAt: firstPreview.preparation.itemUpdatedAt,
          expectedCombatUpdatedAt: firstPreview.preparation.combatUpdatedAt
        }
      });
      expect(staleCombatRevision.statusCode).toBe(409);
      expect(actor.data).toEqual(actorDataBefore);
      expect(combat.combatants).toEqual(combatBefore.combatants);

      const preview = await prepareCriticalDamage(app, route, "typed-damage-combat:preview");
      const applied = await app.inject({
        method: "POST",
        url: `${route}/typed-damage/apply`,
        headers: { ...headers, "idempotency-key": "typed-damage-combat:apply" },
        payload: {
          preparedPreviewKey: preview.preparation.preparedPreviewKey,
          expectedActorUpdatedAt: preview.preparation.actorUpdatedAt,
          expectedItemUpdatedAt: preview.preparation.itemUpdatedAt,
          expectedCombatUpdatedAt: preview.preparation.combatUpdatedAt
        }
      });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(applied.json().actor.data).toEqual(expect.objectContaining({
        hp: expect.objectContaining({ current: 0 }),
        deathSaves: { successes: 1, failures: 2 },
        lifeState: "unconscious"
      }));
      expect(applied.json().combat).toEqual(expect.objectContaining({
        id: combat.id,
        updatedAt: expect.not.stringMatching(preview.preparation.combatUpdatedAt),
        combatants: [expect.objectContaining({
          actorId: actor.id,
          defeated: false,
          conditions: ["unconscious"],
          deathSaveSuccesses: 1,
          deathSaveFailures: 2
        })]
      }));
      expect(applied.json().undo).toEqual(expect.objectContaining({
        mutationId: applied.json().rulesMutationId,
        expectedCombatUpdatedAt: applied.json().combat.updatedAt
      }));

      const mutation = store.state.dndRulesMutations.find((candidate) => candidate.id === applied.json().rulesMutationId)!;
      expect(mutation.roots.combat).toEqual(expect.objectContaining({
        combatId: combat.id,
        before: expect.objectContaining({ combatants: combatBefore.combatants }),
        afterRevision: applied.json().combat.updatedAt
      }));
      const audit = store.state.auditLogs.find((entry) => entry.action === "system.actor.typedDamageApplied" && entry.targetId === actor.id)!;
      expect(audit.before).toEqual(expect.objectContaining({ combat: expect.objectContaining({ combatId: combat.id, combatants: combatBefore.combatants }) }));
      expect(audit.after).toEqual(expect.objectContaining({ combat: expect.objectContaining({ combatId: combat.id, updatedAt: applied.json().combat.updatedAt }) }));

      const undo = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/dnd/rules-mutations/${mutation.id}/undo`,
        headers: { ...headers, "idempotency-key": "typed-damage-combat:undo" },
        payload: {
          expectedActorUpdatedAt: applied.json().undo.expectedActorUpdatedAt,
          expectedItemUpdatedAt: applied.json().undo.expectedItemUpdatedAt,
          expectedCombatUpdatedAt: applied.json().undo.expectedCombatUpdatedAt
        }
      });
      expect(undo.statusCode, undo.body).toBe(200);
      expect(undo.json().actors[0].data).toEqual(actorDataBefore);
      expect(undo.json().combat.combatants).toEqual(combatBefore.combatants);
      expect(store.state.dndRulesMutations.find((candidate) => candidate.id === mutation.id)?.status).toBe("undone");
    } finally {
      await app.close();
    }
  });
});

async function prepareCriticalDamage(app: Awaited<ReturnType<typeof buildApp>>, route: string, key: string) {
  const response = await app.inject({
    method: "POST",
    url: `${route}/rules-preview`,
    headers: { ...headers, "idempotency-key": key },
    payload: { operation: "typed-damage", prepare: true, amount: 1, damageType: "slashing", criticalHit: true }
  });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.json().status, JSON.stringify(response.json().blockers)).toBe("ready");
  return response.json();
}

function bumpedRevision(revision: string): string {
  return new Date(Date.parse(revision) + 1).toISOString();
}
