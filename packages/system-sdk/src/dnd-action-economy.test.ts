import type { Actor, Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdCombatRules, dnd5eSrdActionClassificationIssues, dnd5eSrdActionKind, dnd5eSrdActionRolls, dnd5eSrdClassFeatureRolls, dnd5eSrdMonsterActionRolls, dnd5eSrdQuickRolls, dnd5eSrdSpeciesTraitRolls, resolveDnd5eSrdAction } from "./index.js";

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
      resources: { secondWind: { current: 2, max: 2, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } },
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

function actionItem(id: string, type: "item" | "spell", data: Record<string, unknown>): Item {
  return {
    id,
    campaignId: "camp_action_economy",
    systemId: "dnd-5e-srd",
    actorId: "act_fighter",
    type,
    name: id,
    data,
    createdAt: updatedAt,
    updatedAt,
  };
}

function classFeatureRoll(className: string, level: number, rollId: string, subclass?: string) {
  const actor = fighter({
    class: className,
    level,
    ...(subclass ? { subclass, subclasses: { [className]: subclass } } : {}),
  });
  const roll = dnd5eSrdClassFeatureRolls(actor).find((candidate) => candidate.id === rollId);
  if (!roll) throw new Error(`Missing ${rollId} for ${className} ${level}`);
  return roll;
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

  it("lets Second Wind spend its Bonus Action and resource without consuming the standard Action", () => {
    const actor = fighter();
    const secondWindRoll = dnd5eSrdQuickRolls(actor).find((roll) => roll.id === "feature-second-wind-healing")!;
    const attack = { id: "item-sword-attack", label: "Sword Attack", formula: "1d20+6", metadata: { attackType: "weapon" } };

    const secondWind = resolveDnd5eSrdAction({ actor, roll: secondWindRoll, combat: combat(), options: { consumeResources: true } });

    expect(secondWind.blocked).toBeUndefined();
    expect(secondWind.action).toMatchObject({ kind: "bonusAction", metadata: { action: "Bonus Action" } });
    expect(secondWind.action.ledger).toBeUndefined();
    expect(secondWind.resourceConsumption).toEqual([expect.objectContaining({ key: "secondWind", amount: 1, remaining: 1 })]);
    expect(secondWind.auditEvents).toContainEqual(expect.objectContaining({ code: "bonus_action.used" }));
    const afterSecondWind = afterSource(actor, secondWind);
    expect(resolveDnd5eSrdAction({ actor: afterSecondWind, roll: secondWindRoll, combat: combat(), options: { consumeResources: true } }).blocked).toMatchObject({ code: "bonus_action_already_used" });

    const attackAfterSecondWind = resolveDnd5eSrdAction({ actor: afterSecondWind, roll: attack, combat: combat() });
    expect(attackAfterSecondWind.blocked).toBeUndefined();
    expect(attackAfterSecondWind.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } });
  });

  it("keeps Tactical Mind free and spends Second Wind only when its d10 turns failure into success", () => {
    const actor = fighter();
    const tacticalMindRoll = dnd5eSrdQuickRolls(actor).find((roll) => roll.id === "feature-tactical-mind-bonus")!;
    const attack = { id: "item-sword-attack", label: "Sword Attack", formula: "1d20+6", metadata: { attackType: "weapon" } };
    const failedCheck = { failedCheckRollId: "roll_failed_once", total: 10, dc: 15 };

    expect(resolveDnd5eSrdAction({ actor, roll: tacticalMindRoll, combat: combat(), options: { consumeResources: true } }).blocked).toMatchObject({ code: "tactical_mind_check_required" });
    const refunded = resolveDnd5eSrdAction({ actor, roll: tacticalMindRoll, combat: combat(), options: { consumeResources: true, tacticalMindCheck: failedCheck, selfRollResult: { total: 4 } } });

    expect(refunded.blocked).toBeUndefined();
    expect(refunded.action).toMatchObject({ kind: "free", metadata: { activation: "free" } });
    expect(refunded.action.ledger).toBeUndefined();
    expect(refunded.resourceConsumption).toEqual([]);
    expect(refunded.tacticalMind).toMatchObject({ bonus: 4, finalTotal: 14, success: false, resourceSpent: false });
    expect(refunded.auditEvents).toContainEqual(expect.objectContaining({ code: "tactical-mind.failed-refund" }));
    const afterRefund = afterSource(actor, refunded);
    expect((afterRefund.data.resources as { secondWind: { current: number } }).secondWind.current).toBe(2);
    expect(resolveDnd5eSrdAction({ actor: afterRefund, roll: tacticalMindRoll, combat: combat(), options: { consumeResources: true, tacticalMindCheck: failedCheck, selfRollResult: { total: 10 } } }).blocked).toMatchObject({ code: "tactical_mind_already_attempted" });

    const tacticalMind = resolveDnd5eSrdAction({ actor: afterRefund, roll: tacticalMindRoll, combat: combat(), options: { consumeResources: true, tacticalMindCheck: { failedCheckRollId: "roll_failed_twice", total: 10, dc: 15 }, selfRollResult: { total: 5 } } });
    expect(tacticalMind.blocked).toBeUndefined();
    expect(tacticalMind.resourceConsumption).toEqual([expect.objectContaining({ key: "secondWind", amount: 1, remaining: 1 })]);
    expect(tacticalMind.tacticalMind).toMatchObject({ bonus: 5, finalTotal: 15, success: true, resourceSpent: true });
    expect(tacticalMind.auditEvents).toContainEqual(expect.objectContaining({ code: "tactical-mind.succeeded" }));
    expect(tacticalMind.auditEvents).not.toContainEqual(expect.objectContaining({ code: "action.used" }));
    expect(tacticalMind.auditEvents).not.toContainEqual(expect.objectContaining({ code: "bonus_action.used" }));

    const attackAfterTacticalMind = resolveDnd5eSrdAction({ actor: afterSource(afterRefund, tacticalMind), roll: attack, combat: combat() });
    expect(attackAfterTacticalMind.blocked).toBeUndefined();
    expect(attackAfterTacticalMind.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } });
  });

  it("keeps paired weapon damage, versatile damage, and secondary damage inside the Attack action", () => {
    const actor = fighter();
    const weapon = actionItem("weapon-longsword", "item", {
      category: "weapon",
      damage: "1d8",
      versatileDamage: "1d10",
      secondaryDamageFormula: "1d6",
      ability: "strength",
      equipped: true,
    });
    const rolls = dnd5eSrdActionRolls(actor, [weapon]);
    const attack = rolls.find((roll) => roll.id === `item-${weapon.id}-attack`)!;
    const pairedDamageIds = [
      `item-${weapon.id}-damage`,
      `item-${weapon.id}-versatile-damage`,
      `item-${weapon.id}-secondary-damage`,
    ];
    for (const rollId of pairedDamageIds) {
      const roll = rolls.find((candidate) => candidate.id === rollId)!;
      expect(roll.metadata).toMatchObject({ activation: rollId.endsWith("-secondary-damage") ? "follow-up" : "on-hit" });
      expect(dnd5eSrdActionKind(roll)).toBe("free");
    }

    expect(resolveDnd5eSrdAction({ actor, items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat() }).blocked).toMatchObject({ code: "continuation_missing" });
    const armoredMonster: Actor = {
      ...fighter({ armorClass: 15, attributes: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 } }),
      id: "act_armored_monster",
      type: "monster",
      name: "Armored Monster",
    };
    const missedAttack = resolveDnd5eSrdAction({ actor, items: [weapon], roll: attack, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 13, naturalD20: 7 }] });
    expect(resolveDnd5eSrdAction({ actor: afterSource(actor, missedAttack), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 8 }] }).blocked).toMatchObject({ code: "continuation_missing" });
    const naturalOneAttack = resolveDnd5eSrdAction({ actor, items: [weapon], roll: attack, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 99, naturalD20: 1 }] });
    expect(resolveDnd5eSrdAction({ actor: afterSource(actor, naturalOneAttack), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 8 }] }).blocked).toMatchObject({ code: "continuation_missing" });
    const boundaryHit = resolveDnd5eSrdAction({ actor, items: [weapon], roll: attack, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 15, naturalD20: 9 }] });
    expect(resolveDnd5eSrdAction({ actor: afterSource(actor, boundaryHit), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat(), targets: [{ actor: armoredMonster, rollTotal: 8 }] }).blocked).toBeUndefined();
    const attackResolution = resolveDnd5eSrdAction({ actor, items: [weapon], roll: attack, combat: combat() });
    expect(resolveDnd5eSrdAction({ actor: afterSource(actor, attackResolution), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat(1, 1) }).blocked).toMatchObject({ code: "continuation_out_of_turn" });
    const damageResolution = resolveDnd5eSrdAction({ actor: afterSource(actor, attackResolution), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat() });
    expect(attackResolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1 } });
    expect(damageResolution.blocked).toBeUndefined();
    expect(damageResolution.action).toMatchObject({ kind: "free", metadata: { activation: "on-hit" } });
    const afterDamage = afterSource(afterSource(actor, attackResolution), damageResolution);
    expect(resolveDnd5eSrdAction({ actor: afterDamage, items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[0])!, combat: combat() }).blocked).toMatchObject({ code: "continuation_missing" });
    const secondaryResolution = resolveDnd5eSrdAction({ actor: afterDamage, items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[2])!, combat: combat() });
    expect(secondaryResolution.blocked).toBeUndefined();
    expect(resolveDnd5eSrdAction({ actor: afterSource(afterDamage, secondaryResolution), items: [weapon], roll: rolls.find((roll) => roll.id === pairedDamageIds[2])!, combat: combat() }).blocked).toMatchObject({ code: "continuation_missing" });
  });

  it("uses a bonus-action spell attack once and keeps its damage inside that cast", () => {
    const actor = fighter({ spellSlots: { level2: { current: 2, max: 2, recovery: "long" } } });
    const spell = actionItem("spiritual-weapon", "spell", {
      action: "bonus",
      level: 2,
      damageFormula: "2d6",
      damageType: "radiant",
      spellAttack: true,
      spellcastingAbility: "intelligence",
      prepared: true,
    });
    const rolls = dnd5eSrdActionRolls(actor, [spell]);
    const attack = rolls.find((roll) => roll.id === `spell-${spell.id}-attack`)!;
    const damage = rolls.find((roll) => roll.id === `spell-${spell.id}-damage`)!;
    expect(attack.metadata).toMatchObject({ action: "bonus" });
    expect(dnd5eSrdActionKind(attack)).toBe("bonusAction");
    expect(damage.metadata).toMatchObject({ activation: "on-hit" });
    expect(dnd5eSrdActionKind(damage)).toBe("free");

    const attackResolution = resolveDnd5eSrdAction({ actor, items: [spell], roll: attack, combat: combat(), options: { consumeResources: true } });
    const afterAttack = afterSource(actor, attackResolution);
    const damageResolution = resolveDnd5eSrdAction({ actor: afterAttack, items: [spell], roll: damage, combat: combat(), options: { consumeResources: true } });
    expect(attackResolution.action).toMatchObject({ kind: "bonusAction" });
    expect(attackResolution.resourceConsumption).toEqual([expect.objectContaining({ type: "spellSlot", key: "level2", remaining: 1 })]);
    expect(damageResolution.blocked).toBeUndefined();
    expect(damageResolution.action).toMatchObject({ kind: "free", metadata: { activation: "on-hit" } });
    expect(damageResolution.resourceConsumption).toEqual([]);

    const ordinaryAttack = { id: "item-sword-attack", label: "Sword Attack", formula: "1d20+6", metadata: { attackType: "weapon" } };
    const ordinaryResolution = resolveDnd5eSrdAction({ actor: afterSource(afterAttack, damageResolution), roll: ordinaryAttack, combat: combat() });
    expect(ordinaryResolution.blocked).toBeUndefined();
    expect(ordinaryResolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1 } });
  });

  it("spends one slot for save-only spell damage and keeps secondary damage as a free follow-up", () => {
    const actor = fighter({ spellSlots: { level1: { current: 1, max: 1, recovery: "long" } } });
    const spell = actionItem("save-spell", "spell", {
      action: "Action",
      level: 1,
      damageFormula: "3d6",
      secondaryDamageFormula: "1d6",
      secondaryDamageType: "fire",
      damageType: "fire",
      save: { ability: "dexterity", dc: 13, success: "half" },
      prepared: true,
    });
    const rolls = dnd5eSrdActionRolls(actor, [spell]);
    const damage = rolls.find((roll) => roll.id === `spell-${spell.id}-damage`)!;
    const secondaryDamage = rolls.find((roll) => roll.id === `spell-${spell.id}-secondary-damage`)!;
    expect(damage.metadata).not.toHaveProperty("activation", "on-hit");
    expect(dnd5eSrdActionKind(damage)).toBe("action");
    expect(secondaryDamage.metadata).toMatchObject({ activation: "follow-up" });
    expect(dnd5eSrdActionKind(secondaryDamage)).toBe("free");

    const resolution = resolveDnd5eSrdAction({ actor, items: [spell], roll: damage, combat: combat(), options: { consumeResources: true } });
    expect(resolution.blocked).toBeUndefined();
    expect(resolution.action).toMatchObject({ kind: "action", metadata: { action: "Action" }, ledger: { actionsUsed: 1 } });
    expect(resolution.resourceConsumption).toEqual([expect.objectContaining({ type: "spellSlot", key: "level1", remaining: 0 })]);
    const secondaryResolution = resolveDnd5eSrdAction({ actor: afterSource(actor, resolution), items: [spell], roll: secondaryDamage, combat: combat(), options: { consumeResources: true } });
    expect(secondaryResolution.blocked).toBeUndefined();
    expect(secondaryResolution.action).toMatchObject({ kind: "free", metadata: expect.objectContaining({ activation: "follow-up" }) });
    expect(secondaryResolution.resourceConsumption).toEqual([]);
  });

  it("does not make an unpaired custom weapon damage formula free", () => {
    const actor = fighter();
    const weapon = actionItem("unpaired-weapon", "item", {
      category: "weapon",
      damageFormula: "2d6",
      damageType: "fire",
      equipped: true,
    });
    const rolls = dnd5eSrdActionRolls(actor, [weapon]);
    expect(rolls.find((roll) => roll.id === `item-${weapon.id}-attack`)).toBeUndefined();
    const damage = rolls.find((roll) => roll.id === `item-${weapon.id}-damage`)!;
    expect(damage.metadata).not.toHaveProperty("activation", "on-hit");
    expect(dnd5eSrdActionKind(damage)).toBe("action");
  });

  it("charges a consumable weapon and its resource once across attack and damage", () => {
    const actor = fighter({ resources: { ...fighter().data.resources as Record<string, unknown>, charges: { current: 2, max: 2, recovery: "long" } } });
    const weapon = actionItem("charged-bomb", "item", {
      category: "weapon",
      damage: "1d6",
      damageType: "fire",
      ability: "dexterity",
      equipped: true,
      consumable: true,
      quantity: 2,
      resourceCost: { resource: "charges", label: "Charges", amount: 1 },
    });
    const rolls = dnd5eSrdActionRolls(actor, [weapon]);
    const attack = rolls.find((roll) => roll.id === `item-${weapon.id}-attack`)!;
    const damage = rolls.find((roll) => roll.id === `item-${weapon.id}-damage`)!;
    const attackResolution = resolveDnd5eSrdAction({ actor, items: [weapon], roll: attack, combat: combat(), options: { consumeResources: true } });
    expect(attackResolution.resourceConsumption).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "itemQuantity", key: weapon.id, remaining: 1 }),
      expect.objectContaining({ type: "resource", key: "charges", remaining: 1 }),
    ]));
    const updatedWeapon = attackResolution.itemUpdates.find((item) => item.id === weapon.id)!;
    const afterAttack = afterSource(actor, attackResolution);
    const damageResolution = resolveDnd5eSrdAction({ actor: afterAttack, items: [updatedWeapon], roll: damage, combat: combat(), options: { consumeResources: true } });
    expect(damageResolution.blocked).toBeUndefined();
    expect(damageResolution.action.kind).toBe("free");
    expect(damageResolution.resourceConsumption).toEqual([]);
    expect(damageResolution.itemUpdates).toEqual([]);
  });

  it("preserves a direct-damage bonus spell's declared activation", () => {
    const actor = fighter();
    const mark = actionItem("hunters-mark", "spell", {
      action: "bonus",
      level: 1,
      damageFormula: "1d6",
      damageType: "force",
      prepared: true,
    });
    const damage = dnd5eSrdActionRolls(actor, [mark]).find((roll) => roll.id === `spell-${mark.id}-damage`)!;
    expect(damage.metadata).toMatchObject({ action: "bonus" });
    expect(dnd5eSrdActionKind(damage)).toBe("bonusAction");
  });

  it("preserves simple spell healing casting times and reaction spell effects", () => {
    const actor = fighter();
    const healingWord = actionItem("healing-word", "spell", {
      action: "bonus",
      healingFormula: "1d4+@spellcasting",
      prepared: true,
    });
    const cureWounds = actionItem("cure-wounds", "spell", {
      action: "action",
      healingFormula: "2d8+@spellcasting",
      prepared: true,
    });
    const shield = actionItem("shield", "spell", {
      action: "reaction",
      effectArmorClassBonus: 5,
      prepared: true,
    });
    const rolls = dnd5eSrdActionRolls(actor, [healingWord, cureWounds, shield]);
    const healingWordRoll = rolls.find((roll) => roll.id === `spell-${healingWord.id}-healing`)!;
    const cureWoundsRoll = rolls.find((roll) => roll.id === `spell-${cureWounds.id}-healing`)!;
    const shieldRoll = rolls.find((roll) => roll.id === `spell-${shield.id}-effect`)!;

    expect(healingWordRoll.metadata).toMatchObject({ action: "bonus" });
    expect(dnd5eSrdActionKind(healingWordRoll)).toBe("bonusAction");
    expect(cureWoundsRoll.metadata).toMatchObject({ action: "action" });
    expect(dnd5eSrdActionKind(cureWoundsRoll)).toBe("action");
    expect(shieldRoll.metadata).toMatchObject({ action: "reaction", armorClassBonus: 5 });
    expect(dnd5eSrdActionKind(shieldRoll)).toBe("reaction");

    const healingWordResolution = resolveDnd5eSrdAction({ actor, items: [healingWord], roll: healingWordRoll, combat: combat() });
    expect(healingWordResolution.action.kind).toBe("bonusAction");
    expect(healingWordResolution.auditEvents).toContainEqual(expect.objectContaining({ code: "bonus_action.used" }));
    const cureWoundsResolution = resolveDnd5eSrdAction({ actor, items: [cureWounds], roll: cureWoundsRoll, combat: combat() });
    expect(cureWoundsResolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1 } });
    const shieldResolution = resolveDnd5eSrdAction({ actor, items: [shield], roll: shieldRoll, combat: combat() });
    expect(shieldResolution.action.kind).toBe("reaction");
    expect(shieldResolution.auditEvents).toContainEqual(expect.objectContaining({ code: "reaction.used" }));
  });

  it("keeps monster attack-bound damage and effects inside their declared attack economy", () => {
    const actor: Actor = {
      ...fighter(),
      type: "monster",
      data: {
        ...fighter().data,
        monster: {
          statBlock: {
            actions: [
              { name: "Bite", kind: "action", attackBonus: 5, damageFormula: "1d8+3", damageType: "piercing" },
              { name: "Grasp", kind: "action", attackBonus: 5, condition: "Grappled", effects: ["The target is Grappled."] },
              { name: "Venom Burst", kind: "bonusAction", damageFormula: "2d6", damageType: "poison", save: { ability: "constitution", dc: 13 }, recharge: "5-6" },
              { name: "Ash Step", kind: "bonusAction", damageFormula: "1d4", damageType: "fire" },
              { name: "Spite", kind: "reaction", damageFormula: "1d6", damageType: "psychic" },
            ],
          },
        },
      },
    };
    const rolls = dnd5eSrdMonsterActionRolls(actor);
    const biteAttack = rolls.find((roll) => roll.id === "monster-bite-attack")!;
    const biteDamage = rolls.find((roll) => roll.id === "monster-bite-damage")!;
    const graspAttack = rolls.find((roll) => roll.id === "monster-grasp-attack")!;
    const graspEffect = rolls.find((roll) => roll.id === "monster-grasp-effect")!;
    const venomBurst = rolls.find((roll) => roll.id === "monster-venom-burst-damage")!;
    const ashStep = rolls.find((roll) => roll.id === "monster-ash-step-damage")!;
    const spite = rolls.find((roll) => roll.id === "monster-spite-damage")!;

    expect(dnd5eSrdActionKind(biteAttack)).toBe("action");
    expect(biteDamage.metadata).toMatchObject({ activation: "on-hit" });
    expect(dnd5eSrdActionKind(biteDamage)).toBe("free");
    expect(dnd5eSrdActionKind(graspAttack)).toBe("action");
    expect(graspEffect.metadata).toMatchObject({ activation: "on-hit" });
    expect(dnd5eSrdActionKind(graspEffect)).toBe("free");
    expect(venomBurst.metadata).not.toHaveProperty("activation", "on-hit");
    expect(dnd5eSrdActionKind(venomBurst)).toBe("bonusAction");
    expect(ashStep.metadata).toMatchObject({ action: "bonusAction" });
    expect(dnd5eSrdActionKind(ashStep)).toBe("bonusAction");
    expect(spite.metadata).toMatchObject({ action: "reaction" });
    expect(dnd5eSrdActionKind(spite)).toBe("reaction");

    expect(resolveDnd5eSrdAction({ actor, roll: biteDamage, combat: combat() }).blocked).toMatchObject({ code: "continuation_missing" });
    expect(resolveDnd5eSrdAction({ actor, roll: graspEffect, combat: combat() }).blocked).toMatchObject({ code: "continuation_missing" });
    const biteResolution = resolveDnd5eSrdAction({ actor, roll: biteAttack, combat: combat() });
    const biteDamageResolution = resolveDnd5eSrdAction({ actor: afterSource(actor, biteResolution), roll: biteDamage, combat: combat() });
    expect(biteResolution.action).toMatchObject({ kind: "action", ledger: { actionsUsed: 1 } });
    expect(biteDamageResolution.blocked).toBeUndefined();
    expect(biteDamageResolution.action.kind).toBe("free");

    const graspResolution = resolveDnd5eSrdAction({ actor, roll: graspAttack, combat: combat() });
    const graspEffectResolution = resolveDnd5eSrdAction({ actor: afterSource(actor, graspResolution), roll: graspEffect, combat: combat() });
    expect(graspEffectResolution.blocked).toBeUndefined();
    expect(graspEffectResolution.action.kind).toBe("free");
  });

  it("normalizes activation metadata already emitted by class and species feature builders", () => {
    const classCases = [
      { roll: classFeatureRoll("Barbarian", 14, "feature-berserker-intimidating-presence", "path-of-the-berserker"), kind: "bonusAction" },
      { roll: classFeatureRoll("Barbarian", 3, "feature-rage-damage-bonus"), kind: "free" },
      { roll: classFeatureRoll("Barbarian", 3, "feature-berserker-frenzy-damage", "path-of-the-berserker"), kind: "free" },
      { roll: classFeatureRoll("Bard", 3, "feature-bardic-inspiration", "college-of-lore"), kind: "bonusAction" },
      { roll: classFeatureRoll("Bard", 14, "feature-lore-peerless-skill", "college-of-lore"), kind: "free" },
      { roll: classFeatureRoll("Cleric", 2, "feature-divine-spark-damage"), kind: "action" },
      { roll: classFeatureRoll("Cleric", 2, "feature-turn-undead"), kind: "action" },
      { roll: classFeatureRoll("Cleric", 5, "feature-sear-undead-damage"), kind: "free" },
      { roll: classFeatureRoll("Cleric", 3, "feature-life-disciple-of-life", "life-domain"), kind: "free" },
      { roll: classFeatureRoll("Cleric", 6, "feature-life-blessed-healer", "life-domain"), kind: "free" },
      { roll: classFeatureRoll("Fighter", 18, "feature-champion-survivor", "champion"), kind: "free" },
      { roll: classFeatureRoll("Monk", 1, "feature-martial-arts-damage"), kind: "bonusAction" },
      { roll: classFeatureRoll("Monk", 2, "feature-uncanny-metabolism-healing"), kind: "free" },
      { roll: classFeatureRoll("Monk", 5, "feature-stunning-strike"), kind: "free" },
      { roll: classFeatureRoll("Paladin", 1, "feature-lay-on-hands-healing"), kind: "bonusAction" },
      { roll: classFeatureRoll("Paladin", 2, "feature-divine-smite-damage"), kind: "bonusAction" },
      { roll: classFeatureRoll("Paladin", 5, "feature-faithful-steed"), kind: "action" },
      { roll: classFeatureRoll("Ranger", 1, "feature-hunters-mark-damage"), kind: "bonusAction" },
      { roll: classFeatureRoll("Ranger", 3, "feature-hunter-prey", "hunter"), kind: "free" },
      { roll: classFeatureRoll("Ranger", 11, "feature-hunter-superior-prey", "hunter"), kind: "free" },
      { roll: classFeatureRoll("Rogue", 3, "feature-sneak-attack-damage", "thief"), kind: "free" },
      { roll: classFeatureRoll("Rogue", 5, "feature-cunning-strike", "thief"), kind: "free" },
      { roll: classFeatureRoll("Rogue", 13, "feature-thief-use-magic-device", "thief"), kind: "free" },
      { roll: classFeatureRoll("Sorcerer", 6, "feature-draconic-elemental-affinity", "draconic-sorcery"), kind: "free" },
      { roll: classFeatureRoll("Sorcerer", 18, "feature-draconic-companion", "draconic-sorcery"), kind: "action" },
      { roll: classFeatureRoll("Warlock", 3, "feature-fiend-dark-ones-blessing", "fiend-patron"), kind: "free" },
      { roll: classFeatureRoll("Warlock", 6, "feature-fiend-dark-ones-own-luck", "fiend-patron"), kind: "free" },
      { roll: classFeatureRoll("Warlock", 14, "feature-fiend-hurl-through-hell-damage", "fiend-patron"), kind: "free" },
      { roll: classFeatureRoll("Wizard", 10, "feature-evoker-empowered-evocation", "evoker"), kind: "free" },
      { roll: classFeatureRoll("Ranger", 15, "feature-hunter-superior-defense", "hunter"), kind: "reaction" },
      { roll: classFeatureRoll("Druid", 10, "feature-moon-moonlight-step", "circle-of-the-moon"), kind: "bonusAction" },
      { roll: classFeatureRoll("Druid", 20, "feature-moon-lunar-form-damage", "circle-of-the-moon"), kind: "free" },
      { roll: classFeatureRoll("Rogue", 3, "feature-thief-fast-hands", "thief"), kind: "bonusAction" },
      { roll: classFeatureRoll("Monk", 3, "feature-deflect-attacks-damage", "warrior-of-the-open-hand"), kind: "reaction" },
      { roll: classFeatureRoll("Sorcerer", 2, "feature-convert-spell-slot-to-sorcery-points"), kind: "free" },
    ] as const;
    for (const { roll, kind } of classCases) expect(dnd5eSrdActionKind(roll), roll.id).toBe(kind);

    const rogue = fighter({ class: "Rogue", level: 3, subclass: "thief", subclasses: { Rogue: "thief" } });
    const dagger = actionItem("sneak-dagger", "item", { category: "weapon", weaponKind: "melee", properties: ["finesse", "light"], damage: "1d4", damageType: "piercing", ability: "dexterity", equipped: true });
    const sneakAttack = dnd5eSrdClassFeatureRolls(rogue).find((roll) => roll.id === "feature-sneak-attack-damage")!;
    const target = { ...fighter(), id: "act_sneak_target", name: "Sneak Target" };
    expect(resolveDnd5eSrdAction({ actor: rogue, roll: sneakAttack, combat: combat(), targets: [{ actor: target, rollTotal: 7 }], options: { applyEffect: true } }).blocked).toMatchObject({ code: "continuation_missing" });
    const attack = dnd5eSrdActionRolls(rogue, [dagger]).find((roll) => roll.id === `item-${dagger.id}-attack`)!;
    const unqualifiedAttack = resolveDnd5eSrdAction({ actor: rogue, items: [dagger], roll: attack, combat: combat(), targets: [{ actor: target, rollTotal: 99 }] });
    expect(resolveDnd5eSrdAction({ actor: afterSource(rogue, unqualifiedAttack), items: [dagger], roll: sneakAttack, combat: combat(), targets: [{ actor: target, rollTotal: 7 }], options: { applyEffect: true } }).blocked).toMatchObject({ code: "continuation_missing" });
    const attackResolution = resolveDnd5eSrdAction({ actor: rogue, items: [dagger], roll: attack, combat: combat(), targets: [{ actor: target, rollTotal: 99 }], options: { sneakAttackEligible: true } });
    const wrongTarget = { ...target, id: "act_wrong_sneak_target", name: "Wrong Sneak Target" };
    expect(resolveDnd5eSrdAction({ actor: afterSource(rogue, attackResolution), items: [dagger], roll: sneakAttack, combat: combat(), targets: [{ actor: wrongTarget, rollTotal: 7 }], options: { applyEffect: true } }).blocked).toMatchObject({ code: "continuation_missing" });
    const resolvedSneakAttack = resolveDnd5eSrdAction({ actor: afterSource(rogue, attackResolution), items: [dagger], roll: sneakAttack, combat: combat(), targets: [{ actor: target, rollTotal: 7 }], options: { applyEffect: true } });
    expect(resolvedSneakAttack.manualResolutionRequired).toBeUndefined();
    expect(resolvedSneakAttack.action).toMatchObject({ kind: "free", metadata: { activation: "on-hit", damageType: "piercing" } });
    expect(resolvedSneakAttack.effects).toContainEqual(expect.objectContaining({ type: "damage", targetActorId: target.id, damageType: "piercing", effectChoice: "piercing", choiceKind: "damageType" }));
    expect(resolveDnd5eSrdAction({ actor: afterSource(afterSource(rogue, attackResolution), resolvedSneakAttack), items: [dagger], roll: sneakAttack, combat: combat(), targets: [{ actor: target, rollTotal: 7 }], options: { applyEffect: true } }).blocked).toMatchObject({ code: "continuation_missing" });

    const ancestryKinds = {
      cloud: "bonusAction",
      fire: "free",
      frost: "free",
      hill: "free",
      stone: "reaction",
      storm: "reaction",
    } as const;
    for (const [giantAncestry, kind] of Object.entries(ancestryKinds)) {
      const actor = fighter({ species: "Goliath", origin: { giantAncestry } });
      const roll = dnd5eSrdSpeciesTraitRolls(actor).find((candidate) => candidate.id === "species-goliath-giant-ancestry")!;
      expect(dnd5eSrdActionKind(roll), `${giantAncestry}:${roll.id}`).toBe(kind);
    }

    expect(dnd5eSrdActionKind({ id: "unknown-nonzero", formula: "1d20" })).toBe("action");
    expect(dnd5eSrdActionKind({ id: "unknown-zero-with-activation", formula: "0", metadata: { activation: "unknown" } })).toBe("action");
    expect(dnd5eSrdActionClassificationIssues({ id: "unknown-nonzero", formula: "1d20" })).toEqual([{ field: "classification", value: "missing" }]);
    expect(dnd5eSrdActionClassificationIssues({ id: "unknown-zero-with-activation", formula: "0", metadata: { activation: "unknown" } })).toEqual([{ field: "activation", value: "unknown" }]);
  });
});
