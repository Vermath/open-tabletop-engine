import type { Actor, Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdCombatRules, dnd5eSrdQuickRolls, resolveDnd5eSrdAction } from "./index.js";

const updatedAt = "2026-07-15T20:00:00.000Z";

function fighter(data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_fighter",
    campaignId: "camp_action_economy",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Action Fighter",
    data: {
      class: "Fighter",
      level: 5,
      attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 30, max: 30 },
      resources: { actionSurge: { current: 1, max: 1, recovery: "short" } },
      conditions: [],
      ...data,
    },
    permissions: {},
    createdAt: updatedAt,
    updatedAt,
  };
}

function combat(round = 1, turnIndex = 0): Combat {
  return {
    id: "cmb_action_economy",
    campaignId: "camp_action_economy",
    active: true,
    round,
    turnIndex,
    combatants: [
      { id: "cmbt_fighter", tokenId: "tok_fighter", actorId: "act_fighter", name: "Action Fighter", initiative: 20, defeated: false },
      { id: "cmbt_other", tokenId: "tok_other", actorId: "act_other", name: "Other", initiative: 10, defeated: false },
    ],
    createdAt: updatedAt,
    updatedAt,
  };
}

function afterSource(actor: Actor, resolution: ReturnType<typeof resolveDnd5eSrdAction>): Actor {
  const update = resolution.actorUpdates.find((candidate) => candidate.actorId === actor.id);
  return update ? { ...actor, data: update.after } : actor;
}

describe("D&D standard Action economy", () => {
  it("consumes one Action for an atomic multiattack and blocks a second ordinary Action", () => {
    const actor = fighter();
    const attack = { id: "item-sword-attack", label: "Sword Attack", formula: "1d20+6", metadata: { attackType: "weapon", attacksPerAction: 2 } };
    const targetA = { ...fighter(), id: "act_target_a", name: "Target A" };
    const targetB = { ...fighter(), id: "act_target_b", name: "Target B" };

    const first = resolveDnd5eSrdAction({ actor, roll: attack, combat: combat(), targets: [{ actor: targetA }, { actor: targetB }] });

    expect(first.blocked).toBeUndefined();
    expect(first.rolls).toHaveLength(2);
    expect(first.action.ledger).toMatchObject({ actionsUsed: 1, actionSurgeGrants: 0, uses: [{ rollId: attack.id }] });
    expect(first.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ code: "action.used" })]));
    expect(resolveDnd5eSrdAction({ actor: afterSource(actor, first), roll: attack, combat: combat() }).blocked).toMatchObject({ code: "action_already_used" });
  });

  it("spends Action Surge once, grants exactly one additional Action, and resets on the next turn", () => {
    const actor = fighter();
    const action = { id: "test-standard-action", label: "Standard Action", formula: "1d20+6", metadata: { action: "Action" } };
    const first = resolveDnd5eSrdAction({ actor, roll: action, combat: combat() });
    const afterFirst = afterSource(actor, first);
    const surgeRoll = dnd5eSrdQuickRolls(afterFirst).find((roll) => roll.id === "feature-action-surge")!;

    const surge = resolveDnd5eSrdAction({ actor: afterFirst, roll: surgeRoll, combat: combat(), options: { consumeResources: true } });

    expect(surge.blocked).toBeUndefined();
    expect(surge.resourceConsumption).toEqual([expect.objectContaining({ key: "actionSurge", remaining: 0 })]);
    expect(surge.action).toMatchObject({ kind: "free", ledger: { actionsUsed: 1, actionSurgeGrants: 1 } });
    expect(surge.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ code: "action-surge.granted" })]));

    const afterSurge = afterSource(afterFirst, surge);
    const extra = resolveDnd5eSrdAction({ actor: afterSurge, roll: action, combat: combat() });
    expect(extra.blocked).toBeUndefined();
    expect(extra.action.ledger).toMatchObject({ actionsUsed: 2, actionSurgeGrants: 1 });
    const afterExtra = afterSource(afterSurge, extra);
    expect(resolveDnd5eSrdAction({ actor: afterExtra, roll: action, combat: combat() }).blocked).toMatchObject({ code: "action_already_used" });

    const refreshed = advanceDnd5eSrdCombatRules({ actors: [afterExtra], combat: combat(2), phase: "start_turn", now: "2026-07-15T20:01:00.000Z" });
    const refreshedActor = { ...afterExtra, data: refreshed.actorUpdates[0]!.after };
    expect((refreshedActor.data.rulesEngine as { actionEconomy: { standardActions: unknown } }).actionEconomy.standardActions).toEqual({});
    expect(resolveDnd5eSrdAction({ actor: refreshedActor, roll: action, combat: combat(2) }).blocked).toBeUndefined();
  });

  it("keeps free, Bonus Action, Reaction, out-of-turn, and incapacitated behavior distinct", () => {
    const actor = fighter();
    const free = resolveDnd5eSrdAction({ actor, roll: { id: "free", label: "Free", formula: "0" }, combat: combat() });
    expect(free.action.kind).toBe("free");
    expect(free.action.ledger).toBeUndefined();
    expect(resolveDnd5eSrdAction({ actor, roll: { id: "bonus", label: "Bonus", formula: "0", metadata: { action: "Bonus Action" } }, combat: combat() }).action.kind).toBe("bonusAction");
    expect(resolveDnd5eSrdAction({ actor, roll: { id: "reaction", label: "Reaction", formula: "0", metadata: { action: "Reaction" } }, combat: combat() }).action.kind).toBe("reaction");
    expect(resolveDnd5eSrdAction({ actor, roll: { id: "action", label: "Action", formula: "1", metadata: { action: "Action" } }, combat: combat(1, 1) }).blocked).toMatchObject({ code: "action_out_of_turn" });

    const incapacitated = fighter({ conditions: [{ id: "incapacitated" }] });
    expect(resolveDnd5eSrdAction({ actor: incapacitated, roll: { id: "action", label: "Action", formula: "1", metadata: { action: "Action" } }, combat: combat() }).blocked).toMatchObject({ code: "action_blocked" });
  });
});
