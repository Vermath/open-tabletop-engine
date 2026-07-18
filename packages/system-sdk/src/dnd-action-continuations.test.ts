import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  dnd5eSrdActionRolls,
  dnd5eSrdClassFeatureRolls,
  dnd5eSrdContinuationGrantForRoll,
  dnd5eSrdSpeciesTraitRolls,
  dnd5eSrdUnarmedStrike,
  startDnd5eSrdRage
} from "./index.js";

const timestamp = "2026-07-17T12:00:00.000Z";
const target = { actorId: "act_target", rollTotal: 18, naturalD20: 12, armorClass: 14 };

function character(data: Record<string, unknown>): Actor {
  return {
    id: "act_continuation",
    campaignId: "camp_continuation",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Continuation Character",
    data: {
      class: "Fighter",
      level: 5,
      attributes: { strength: 16, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 16 },
      hp: { current: 30, max: 30 },
      conditions: [],
      ...data
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function actionItem(actor: Actor, id: string, type: "item" | "spell", data: Record<string, unknown>): Item {
  return {
    id,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type,
    name: id,
    data,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function attackRoll(actor: Actor, item: Item) {
  return dnd5eSrdActionRolls(actor, [item]).find((roll) => roll.id === `${item.type === "spell" ? "spell" : "item"}-${item.id}-attack`)!;
}

function allowanceIds(source: ReturnType<typeof attackRoll>, available: ReturnType<typeof dnd5eSrdClassFeatureRolls>, requestedItem?: Item): string[] {
  return dnd5eSrdContinuationGrantForRoll({
    roll: source,
    available,
    ...(requestedItem ? { requestedItem } : {}),
    targets: [target]
  })?.allowances.map((allowance) => allowance.rollId) ?? [];
}

describe("D&D continuation source triggers", () => {
  it("arms Divine Smite only after a melee weapon or confirmed Unarmed Strike hit", () => {
    const paladin = character({ class: "Paladin", level: 2 });
    const longsword = actionItem(paladin, "longsword", "item", { category: "weapon", weaponKind: "melee", weaponCategory: "martial", damage: "1d8", damageType: "slashing", ability: "strength", equipped: true });
    const longbow = actionItem(paladin, "longbow", "item", { category: "weapon", weaponKind: "ranged", weaponCategory: "martial", damage: "1d8", damageType: "piercing", ability: "dexterity", equipped: true });
    const fireBolt = actionItem(paladin, "fire-bolt", "spell", { prepared: true, level: 0, spellAttack: true, damageFormula: "1d10", damageType: "fire", spellcastingAbility: "charisma" });
    const smite = dnd5eSrdClassFeatureRolls(paladin).filter((roll) => roll.id === "feature-divine-smite-damage");

    expect(allowanceIds(attackRoll(paladin, longsword), smite, longsword)).toContain("feature-divine-smite-damage");
    expect(allowanceIds(attackRoll(paladin, longbow), smite, longbow)).not.toContain("feature-divine-smite-damage");
    expect(allowanceIds(attackRoll(paladin, fireBolt), smite, fireBolt)).not.toContain("feature-divine-smite-damage");

    const unarmedGrant = dnd5eSrdContinuationGrantForRoll({
      roll: dnd5eSrdUnarmedStrike(paladin),
      available: smite,
      targets: [target]
    });
    expect(unarmedGrant).toMatchObject({
      sourceRollId: "unarmed-strike",
      allowances: [{ rollId: "feature-divine-smite-damage" }],
      targetActorIds: [target.actorId]
    });
  });

  it("enforces strength/rage, weapon, and Monk-weapon feature triggers", () => {
    const barbarianBase = character({
      class: "Barbarian",
      level: 3,
      subclass: "path-of-the-berserker",
      subclasses: { Barbarian: "path-of-the-berserker" },
      resources: { rage: { current: 2, max: 3, recovery: "long" } }
    });
    const barbarian = { ...barbarianBase, data: startDnd5eSrdRage({ actor: barbarianBase, now: timestamp }).data };
    const greataxe = actionItem(barbarian, "greataxe", "item", { category: "weapon", weaponKind: "melee", weaponCategory: "martial", damage: "1d12", damageType: "slashing", ability: "strength", equipped: true });
    const longbow = actionItem(barbarian, "longbow", "item", { category: "weapon", weaponKind: "ranged", weaponCategory: "martial", damage: "1d8", damageType: "piercing", ability: "dexterity", equipped: true });
    const barbarianContinuations = dnd5eSrdClassFeatureRolls(barbarian).filter((roll) => ["feature-rage-damage-bonus", "feature-berserker-frenzy-damage"].includes(roll.id));
    expect(allowanceIds(attackRoll(barbarian, greataxe), barbarianContinuations, greataxe)).toEqual(expect.arrayContaining(["feature-rage-damage-bonus", "feature-berserker-frenzy-damage"]));
    expect(allowanceIds(attackRoll(barbarian, longbow), barbarianContinuations, longbow)).toEqual([]);

    const ranger = character({ class: "Ranger", level: 3, subclass: "hunter", subclasses: { Ranger: "hunter" } });
    const rangerBow = actionItem(ranger, "ranger-bow", "item", { category: "weapon", weaponKind: "ranged", damage: "1d8", damageType: "piercing", ability: "dexterity", equipped: true });
    const rangerSpell = actionItem(ranger, "ranger-spell", "spell", { prepared: true, level: 0, spellAttack: true, damageFormula: "1d8", damageType: "force", spellcastingAbility: "wisdom" });
    const huntersPrey = dnd5eSrdClassFeatureRolls(ranger).filter((roll) => roll.id === "feature-hunter-prey");
    expect(allowanceIds(attackRoll(ranger, rangerBow), huntersPrey, rangerBow)).toContain("feature-hunter-prey");
    expect(allowanceIds(attackRoll(ranger, rangerSpell), huntersPrey, rangerSpell)).not.toContain("feature-hunter-prey");

    const monk = character({ class: "Monk", level: 5 });
    const quarterstaff = actionItem(monk, "quarterstaff", "item", { category: "weapon", weaponKind: "melee", weaponCategory: "simple", properties: ["versatile"], damage: "1d6", versatileDamage: "1d8", damageType: "bludgeoning", ability: "strength", equipped: true });
    const monkBow = actionItem(monk, "monk-bow", "item", { category: "weapon", weaponKind: "ranged", weaponCategory: "martial", damage: "1d8", damageType: "piercing", ability: "dexterity", equipped: true });
    const stunningStrike = dnd5eSrdClassFeatureRolls(monk).filter((roll) => roll.id === "feature-stunning-strike");
    expect(allowanceIds(attackRoll(monk, quarterstaff), stunningStrike, quarterstaff)).toContain("feature-stunning-strike");
    expect(allowanceIds(attackRoll(monk, monkBow), stunningStrike, monkBow)).not.toContain("feature-stunning-strike");
    expect(dnd5eSrdContinuationGrantForRoll({ roll: dnd5eSrdUnarmedStrike(monk), available: stunningStrike, targets: [target] })?.allowances.map((allowance) => allowance.rollId)).toContain("feature-stunning-strike");
  });

  it("preserves broad attack-hit triggers for Hunter's Mark, Hurl Through Hell, and Goliath ancestry", () => {
    const ranger = character({ class: "Ranger", level: 1 });
    const forceBolt = actionItem(ranger, "force-bolt", "spell", { prepared: true, level: 0, spellAttack: true, damageFormula: "1d8", damageType: "force", spellcastingAbility: "wisdom" });
    const huntersMark = dnd5eSrdClassFeatureRolls(ranger).filter((roll) => roll.id === "feature-hunters-mark-damage");
    expect(allowanceIds(attackRoll(ranger, forceBolt), huntersMark, forceBolt)).toContain("feature-hunters-mark-damage");

    const warlock = character({ class: "Warlock", level: 14, subclass: "fiend-patron", subclasses: { Warlock: "fiend-patron" } });
    const eldritchBlast = actionItem(warlock, "eldritch-blast", "spell", { prepared: true, level: 0, spellAttack: true, damageFormula: "1d10", damageType: "force", spellcastingAbility: "charisma" });
    const hurlThroughHell = dnd5eSrdClassFeatureRolls(warlock).filter((roll) => roll.id === "feature-fiend-hurl-through-hell-damage");
    expect(allowanceIds(attackRoll(warlock, eldritchBlast), hurlThroughHell, eldritchBlast)).toContain("feature-fiend-hurl-through-hell-damage");

    const goliath = character({ species: "Goliath", origin: { giantAncestry: "fire" } });
    const goliathBolt = actionItem(goliath, "goliath-bolt", "spell", { prepared: true, level: 0, spellAttack: true, damageFormula: "1d10", damageType: "fire", spellcastingAbility: "intelligence" });
    const giantAncestry = dnd5eSrdSpeciesTraitRolls(goliath).filter((roll) => roll.id === "species-goliath-giant-ancestry");
    expect(allowanceIds(attackRoll(goliath, goliathBolt), giantAncestry, goliathBolt)).toContain("species-goliath-giant-ancestry");
  });

  it("does not arm a source-specific follow-up after unrelated damage", () => {
    const cleric = character({ class: "Cleric", level: 5 });
    const searUndead = dnd5eSrdClassFeatureRolls(cleric).filter((roll) => roll.id === "feature-sear-undead-damage");
    const unrelatedDamage = {
      id: "item-mace-damage",
      label: "Mace Damage",
      formula: "1d6+3",
      metadata: { effectKind: "damage", continuation: { role: "primary", family: "item:mace" } }
    };
    expect(dnd5eSrdContinuationGrantForRoll({ roll: unrelatedDamage, available: searUndead, targets: [target] })).toBeUndefined();
  });
});
