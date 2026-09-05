import type { Actor, Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdCombatRules, applyDnd5eSrdStandardActionUse, consumeDnd5eSrdContinuation, grantDnd5eSrdActionSurge, grantDnd5eSrdContinuations, resolveDnd5eSrdAction } from "./index.js";

const now = "2026-09-05T12:00:00.000Z";
const actor: Actor = {
  id: "hero", campaignId: "campaign", systemId: "dnd-5e-srd", ownerUserId: "gm", type: "character", name: "Hero", permissions: {},
  data: { hp: { current: 20, max: 20 }, conditions: [] }, createdAt: now, updatedAt: now
};
const combat: Combat = {
  id: "combat", campaignId: "campaign", active: true, round: 1, turnIndex: 0,
  combatants: [{ id: "hero-token", tokenId: "hero-token", actorId: actor.id, name: "Hero", initiative: 10, defeated: false }],
  createdAt: now, updatedAt: now
};
const shifted: Combat = {
  ...combat, turnIndex: 1, combatants: [
    { id: "other-token", tokenId: "other-token", actorId: "other", name: "Other", initiative: 20, defeated: false },
    ...combat.combatants
  ]
};

function atActualTurnStart(data: Actor["data"], current: Combat): Actor {
  const currentActor = { ...actor, data };
  const progression = advanceDnd5eSrdCombatRules({ actors: [currentActor], combat: current, phase: "start_turn", now });
  return { ...currentActor, data: progression.actorDataPatches.find((patch) => patch.actorId === actor.id)?.data ?? data };
}

describe("resource identity across combat roster changes", () => {
  it("keeps standard Actions and Action Surge spent across reindexing, then refreshes on an actual same-round turn", () => {
    const first = applyDnd5eSrdStandardActionUse(actor.data, actor.id, "attack", combat, now);
    expect(first.blocked).toBeUndefined();
    expect(applyDnd5eSrdStandardActionUse(first.data, actor.id, "attack", shifted, now).blocked?.code).toBe("action_already_used");
    const surge = grantDnd5eSrdActionSurge(first.data, actor.id, "surge", shifted, now);
    expect(surge.blocked).toBeUndefined();
    const extra = applyDnd5eSrdStandardActionUse(surge.data, actor.id, "attack", combat, now);
    expect(extra.ledger).toMatchObject({ actionsUsed: 2, actionSurgeGrants: 1 });
    expect(applyDnd5eSrdStandardActionUse(extra.data, actor.id, "attack", shifted, now).blocked?.code).toBe("action_already_used");
    expect(grantDnd5eSrdActionSurge(extra.data, actor.id, "surge", shifted, now).blocked?.code).toBe("action_surge_already_used");
    const refreshed = atActualTurnStart(extra.data, shifted);
    expect(applyDnd5eSrdStandardActionUse(refreshed.data, actor.id, "attack", shifted, now).blocked).toBeUndefined();
    expect(grantDnd5eSrdActionSurge(refreshed.data, actor.id, "surge", shifted, now).blocked).toBeUndefined();
  });

  it("keeps Bonus Actions spent across reindexing until a real turn starts", () => {
    const roll = { id: "bonus", label: "Bonus", formula: "0", metadata: { action: "Bonus Action" } };
    const spent = resolveDnd5eSrdAction({ actor, roll, combat });
    expect(spent.blocked).toBeUndefined();
    const spentActor = { ...actor, data: spent.actorUpdates.find((update) => update.actorId === actor.id)!.after };
    expect(resolveDnd5eSrdAction({ actor: spentActor, roll, combat: shifted }).blocked?.code).toBe("bonus_action_already_used");
    expect(resolveDnd5eSrdAction({ actor: atActualTurnStart(spentActor.data, shifted), roll, combat: shifted }).blocked).toBeUndefined();
  });

  it("retains exact continuations and once-per-turn consumption through reindexing", () => {
    const grant = { sourceRollId: "attack", allowances: [{ rollId: "sneak-attack", oncePerTurn: true }], targetActorIds: ["target"] };
    const armed = grantDnd5eSrdContinuations(actor.data, actor.id, grant, combat, now);
    const consumed = consumeDnd5eSrdContinuation(armed.data, actor.id, "sneak-attack", ["target"], shifted, undefined, armed.continuationId);
    expect(consumed.blocked).toBeUndefined();
    expect(consumed.continuationId).toBe(armed.continuationId);
    expect(consumeDnd5eSrdContinuation(consumed.data, actor.id, "sneak-attack", ["target"], combat, undefined, armed.continuationId).blocked?.code).toBe("continuation_missing");
    expect(grantDnd5eSrdContinuations(consumed.data, actor.id, grant, combat, now).continuationId).toBeUndefined();
    const refreshed = atActualTurnStart(consumed.data, shifted);
    expect(consumeDnd5eSrdContinuation(refreshed.data, actor.id, "sneak-attack", ["target"], shifted, undefined, armed.continuationId).blocked?.code).toBe("continuation_missing");
    expect(grantDnd5eSrdContinuations(refreshed.data, actor.id, grant, shifted, now).continuationId).toBeDefined();
  });
});
