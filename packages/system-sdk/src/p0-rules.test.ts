import type { Actor, Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  applyDnd5eSrdAdvancement,
  applyDnd5eSrdAttunement,
  applyDnd5eSrdConcentrationCleanup,
  applyDnd5eSrdFeat,
  applyDnd5eSrdMulticlassLevel,
  applyDnd5eSrdRest,
  applyDnd5eSrdWeaponMasteryAdvancement,
  DND_5E_SRD_SUBCLASS_OPTIONS,
  dnd5eSrdAdvancementClassName,
  dnd5eSrdAttunementState,
  dnd5eSrdCanMulticlassInto,
  dnd5eSrdClassHitDieSize,
  dnd5eSrdClassFeaturesForLevel,
  dnd5eSrdCompendiumEntry,
  dnd5eSrdCommunicationCompatibility,
  dnd5eSrdCreatureTypeMatches,
  dnd5eSrdConcentrationCleanupActorUpdates,
  dnd5eSrdMonsterActorData,
  dnd5eSrdQuickRolls,
  dnd5eSrdRechargeProfile,
  dnd5eSrdRecoverRechargeState,
  dnd5eSrdSheet,
  dnd5eSrdCriticalDamageFormula,
  dnd5eSrdEvaluateVision,
  dnd5eSrdCanGrappleOrShove,
  dnd5eSrdSubclassFeatures,
  dnd5eSrdWeaponMasteryChoiceCount,
  grantDnd5eSrdHeroicInspiration,
  resolveDnd5eSrdAction,
  resolveDnd5eSrdConcentrationDamage,
  resolveDnd5eSrdDamageComponents,
  spendDnd5eSrdHeroicInspiration,
  useDnd5eSrdAction
} from "./index.js";

const fighter: Actor = {
  id: "act_fighter",
  campaignId: "camp_rules",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Rules Fighter",
  data: {
    ruleset: "SRD 5.2.1",
    class: "Fighter",
    level: 1,
    attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: { current: 12, max: 12 },
    hitDice: { current: 1, max: 1, size: "d10" },
    features: ["Fighting Style", "Second Wind", "Weapon Mastery"],
    conditions: []
  },
  permissions: {},
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z"
};

function damageTarget(data: Record<string, unknown>): Actor {
  return {
    ...fighter,
    id: "act_target",
    name: "Rules Target",
    data: { ...fighter.data, hp: { current: 20, max: 20 }, ...data }
  };
}

function applyDamage(target: Actor, amount: number, damageType: string, items: Item[] = []) {
  return resolveDnd5eSrdAction({
    actor: fighter,
    roll: { id: `test-${damageType}-damage`, label: `${damageType} Damage`, formula: String(amount), metadata: { damageType } },
    targets: [{ actor: target, items, rollTotal: amount }],
    options: { applyEffect: true },
    now: "2026-07-12T00:00:01.000Z"
  });
}

describe("D&D SRD P0 rules regressions", () => {
  it("publishes every base-class and selected-subclass advancement schedule through level 20", () => {
    const capstones: Record<string, string> = {
      Barbarian: "Primal Champion",
      Bard: "Words of Creation",
      Cleric: "Greater Divine Intervention",
      Druid: "Archdruid",
      Fighter: "Three Extra Attacks",
      Monk: "Body and Mind",
      Paladin: "Aura Expansion",
      Ranger: "Foe Slayer",
      Rogue: "Stroke of Luck",
      Sorcerer: "Arcane Apotheosis",
      Warlock: "Eldritch Master",
      Wizard: "Signature Spells"
    };
    for (const [className, capstone] of Object.entries(capstones)) {
      expect(dnd5eSrdClassFeaturesForLevel(className, 20), className).toEqual(expect.arrayContaining([capstone, "Ability Score Improvement", "Epic Boon"]));
    }
    for (const subclass of DND_5E_SRD_SUBCLASS_OPTIONS) {
      const latest = subclass.features.at(-1)!;
      expect(dnd5eSrdSubclassFeatures(subclass, latest.level), subclass.name).toEqual(expect.arrayContaining([subclass.name, ...latest.names]));
    }
  });

  it("tracks Pact Magic separately from multiclass Spellcasting and recovers only Pact slots on a Short Rest", () => {
    const caster: Actor = {
      ...fighter,
      id: "act_pact_multiclass",
      name: "Pact Multiclass",
      data: {
        ...fighter.data,
        class: "Warlock",
        level: 5,
        classes: [{ className: "Warlock", level: 3 }, { className: "Wizard", level: 2 }],
        attributes: { ...fighter.data.attributes as Record<string, number>, intelligence: 13, charisma: 14 },
        spellSlots: { level1: { current: 3, max: 3, recovery: "long" } },
        pactSlots: { level2: { current: 2, max: 2, recovery: "short" } },
        features: ["Pact Magic", "Spellcasting"]
      }
    };
    const spell: Item = {
      id: "itm_hex",
      campaignId: caster.campaignId,
      systemId: caster.systemId,
      actorId: caster.id,
      type: "spell",
      name: "Hex",
      data: { level: 1, prepared: true },
      createdAt: caster.createdAt,
      updatedAt: caster.updatedAt
    };
    const rollId = `spell-${spell.id}-effect`;
    const pact = useDnd5eSrdAction(caster, [spell], rollId, { usePactSlot: true });
    expect(pact).toMatchObject({ slotLevel: 2, slotPool: "pactSlots", consumed: [{ type: "pactSlot", key: "level2", remaining: 1 }] });
    expect((pact.data.spellSlots as Record<string, unknown>)).toEqual(caster.data.spellSlots);
    const ordinary = useDnd5eSrdAction(caster, [spell], rollId, { spellSlotLevel: 1 });
    expect(ordinary).toMatchObject({ slotLevel: 1, slotPool: "spellSlots", consumed: [{ type: "spellSlot", key: "level1", remaining: 2 }] });
    expect(ordinary.data.pactSlots).toEqual(caster.data.pactSlots);

    const spent: Actor = { ...caster, data: { ...caster.data, spellSlots: ordinary.data.spellSlots, pactSlots: pact.data.pactSlots } };
    const rested = applyDnd5eSrdRest(spent, "short");
    expect(rested.data.pactSlots).toEqual({ level2: expect.objectContaining({ current: 2, max: 2, recovery: "short" }) });
    expect(rested.data.spellSlots).toEqual(ordinary.data.spellSlots);

    const singleWarlock: Actor = {
      ...fighter,
      id: "act_single_warlock",
      name: "Single Warlock",
      data: {
        ...fighter.data,
        class: "Warlock",
        level: 1,
        attributes: { ...fighter.data.attributes as Record<string, number>, charisma: 14 },
        features: ["Pact Magic"],
        spellSlots: { level1: { current: 0, max: 1, recovery: "short" } }
      }
    };
    const migrated = applyDnd5eSrdMulticlassLevel(singleWarlock, "Fighter");
    expect(migrated.spellSlots).toEqual({});
    expect(migrated.pactSlots).toEqual({ level1: expect.objectContaining({ current: 0, max: 1, recovery: "short" }) });
  });

  it("requires complete Weapon Mastery selections at scaling levels and only exposes selected weapon masteries", () => {
    expect(dnd5eSrdWeaponMasteryChoiceCount("Fighter", 1)).toBe(3);
    expect(dnd5eSrdWeaponMasteryChoiceCount("Fighter", 4)).toBe(4);
    expect(dnd5eSrdWeaponMasteryChoiceCount("Fighter", 10)).toBe(5);
    expect(dnd5eSrdWeaponMasteryChoiceCount("Fighter", 16)).toBe(6);
    expect(dnd5eSrdWeaponMasteryChoiceCount("Barbarian", 10)).toBe(4);
    const levelThree: Actor = {
      ...fighter,
      data: applyDnd5eSrdWeaponMasteryAdvancement({ ...fighter, data: { ...fighter.data, level: 3, subclasses: { Fighter: "champion" } } }, "Fighter", 3, ["longsword", "longbow", "maul"])
    };
    expect(() => applyDnd5eSrdAdvancement(levelThree, "level-up")).toThrow("explicit complete selection of 4");
    const advanced = applyDnd5eSrdAdvancement(levelThree, "level-up", { weaponMasteryChoices: ["longsword", "longbow", "maul", "rapier"] });
    expect((advanced.weaponMasteries as unknown[])).toHaveLength(4);

    const longsword: Item = { id: "itm_mastered", campaignId: fighter.campaignId, systemId: fighter.systemId, actorId: levelThree.id, type: "item", name: "Longsword", data: { ...dnd5eSrdCompendiumEntry("longsword")!.data, compendiumId: "longsword" }, createdAt: fighter.createdAt, updatedAt: fighter.updatedAt };
    const greataxe: Item = { ...longsword, id: "itm_unmastered", name: "Greataxe", data: { ...dnd5eSrdCompendiumEntry("greataxe")!.data, compendiumId: "greataxe" } };
    const rolls = dnd5eSrdQuickRolls(levelThree, [longsword, greataxe]);
    expect(rolls.find((roll) => roll.id === `item-${longsword.id}-attack`)?.metadata?.mastery).toBe("sap");
    expect(rolls.find((roll) => roll.id === `item-${greataxe.id}-attack`)?.metadata?.mastery).toBeUndefined();
  });

  it("handles Heroic Inspiration state and critical dice without doubling flat modifiers", () => {
    const grant = grantDnd5eSrdHeroicInspiration(fighter);
    expect(grant).toMatchObject({ awardedTo: "actor", actorData: { heroicInspiration: true } });
    expect(spendDnd5eSrdHeroicInspiration({ ...fighter, data: grant.actorData }).heroicInspiration).toBe(false);
    const recipient: Actor = { ...fighter, id: "act_recipient", data: { ...fighter.data, heroicInspiration: false } };
    expect(grantDnd5eSrdHeroicInspiration({ ...fighter, data: { ...fighter.data, heroicInspiration: true } }, recipient)).toMatchObject({ awardedTo: "recipient", recipientData: { heroicInspiration: true } });
    expect(dnd5eSrdCriticalDamageFormula("2d6+1d8+5")).toBe("4d6+2d8+5");
    expect(dnd5eSrdCriticalDamageFormula("d10+@attributes.strength")).toBe("2d10+@attributes.strength");
  });

  it("applies deterministic senses, light, language, size, and creature-type consequences", () => {
    const elf: Actor = { ...fighter, data: { ...fighter.data, senses: ["Darkvision 60 ft"], languages: ["Common", "Elvish"], size: "Medium", creatureType: "Humanoid" } };
    expect(dnd5eSrdEvaluateVision(elf, { light: "darkness", distanceFt: 30 })).toMatchObject({ canSee: true, senseUsed: "darkvision", visibility: "lightly-obscured", sightPerception: "disadvantage", colorVision: false });
    expect(dnd5eSrdEvaluateVision(elf, { light: "darkness", distanceFt: 30, magicalDarkness: true })).toMatchObject({ canSee: false, visibility: "heavily-obscured" });
    const bat: Actor = { ...fighter, id: "act_bat", data: { ...fighter.data, senses: { blindsight: 60 }, languages: ["Common"], size: "Tiny", creatureType: "Beast" } };
    expect(dnd5eSrdEvaluateVision(bat, { light: "darkness", distanceFt: 30, magicalDarkness: true })).toMatchObject({ canSee: true, senseUsed: "blindsight" });
    expect(dnd5eSrdCommunicationCompatibility(elf, bat)).toEqual({ canCommunicate: true, sharedLanguages: ["common"], method: "shared-language" });
    expect(dnd5eSrdCreatureTypeMatches(bat, ["Undead", "Beast"])).toBe(true);
    const huge: Actor = { ...fighter, id: "act_huge", data: { ...fighter.data, size: "Huge" } };
    expect(dnd5eSrdCanGrappleOrShove(elf, huge)).toMatchObject({ eligible: false, attackerSize: "Medium", targetSize: "Huge" });
    expect(dnd5eSrdCanGrappleOrShove({ ...elf, data: { ...elf.data, size: "Large" } }, huge).eligible).toBe(true);
  });

  it("enforces one Bonus Action per own turn and one Reaction until the actor's next turn", () => {
    const combat: Combat = {
      id: "cmb_economy",
      campaignId: fighter.campaignId,
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: "cmbt_fighter", tokenId: "tok_fighter", actorId: fighter.id, name: fighter.name, initiative: 20, defeated: false },
        { id: "cmbt_other", tokenId: "tok_other", actorId: "act_other", name: "Other", initiative: 10, defeated: false }
      ],
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt
    };
    const bonusRoll = { id: "test-bonus-action", label: "Test Bonus Action", formula: "0", metadata: { action: "bonus action", effectType: "utility" } };
    const firstBonus = resolveDnd5eSrdAction({ actor: fighter, roll: bonusRoll, combat });
    expect(firstBonus.blocked).toBeUndefined();
    const afterBonus: Actor = { ...fighter, data: firstBonus.actorUpdates[0]!.after };
    expect(resolveDnd5eSrdAction({ actor: afterBonus, roll: bonusRoll, combat }).blocked).toMatchObject({ code: "bonus_action_already_used" });
    expect(resolveDnd5eSrdAction({ actor: fighter, roll: bonusRoll, combat: { ...combat, turnIndex: 1 } }).blocked).toMatchObject({ code: "bonus_action_out_of_turn" });

    const reactionRoll = { id: "test-reaction", label: "Test Reaction", formula: "0", metadata: { action: "reaction", effectType: "utility" } };
    const firstReaction = resolveDnd5eSrdAction({ actor: fighter, roll: reactionRoll, combat });
    expect(firstReaction.blocked).toBeUndefined();
    const afterReaction: Actor = { ...fighter, data: firstReaction.actorUpdates[0]!.after };
    expect(resolveDnd5eSrdAction({ actor: afterReaction, roll: reactionRoll, combat: { ...combat, round: 2 } }).blocked).toMatchObject({ code: "reaction_already_used" });
    expect(resolveDnd5eSrdAction({ actor: fighter, roll: reactionRoll }).actorUpdates).toEqual([]);
  });

  it("exports the class Hit Point Die and plain level-up class selection", () => {
    expect(dnd5eSrdClassHitDieSize("Wizard")).toBe("d6");
    expect(dnd5eSrdClassHitDieSize("Rogue")).toBe("d8");
    expect(dnd5eSrdClassHitDieSize("Fighter")).toBe("d10");
    expect(dnd5eSrdClassHitDieSize("Barbarian")).toBe("d12");
    const tied: Actor = { ...fighter, data: { ...fighter.data, class: "Fighter", level: 4, classes: [{ className: "Wizard", level: 2 }, { className: "Fighter", level: 2 }] } };
    expect(dnd5eSrdAdvancementClassName(tied)).toBe("Wizard");
  });

  it("advances a single class with class HP and no invented ability increase", () => {
    const fixed = applyDnd5eSrdAdvancement(fighter, "level-up");
    expect(fixed).toEqual(expect.objectContaining({ level: 2, hp: { current: 20, max: 20 }, hitDice: { current: 2, max: 2, size: "d10" } }));
    expect(fixed.attributes).toEqual(fighter.data.attributes);
    expect(fixed.features).not.toContain("Fighter Level 2");

    const rolled = applyDnd5eSrdAdvancement(fighter, "level-up", { hitPointRoll: 1 });
    expect(rolled.hp).toEqual({ current: 15, max: 15 });
    expect(() => applyDnd5eSrdAdvancement(fighter, "level-up", { hitPointRoll: 11 })).toThrow("from 1 to 10");
  });

  it("requires explicit, budget-valid ASI and feat ability choices", () => {
    const featEligibleFighter: Actor = { ...fighter, data: { ...fighter.data, level: 4 } };
    expect(() => applyDnd5eSrdFeat(featEligibleFighter, "ability-score-improvement")).toThrow("requires explicit ability choices");
    const chosen = applyDnd5eSrdFeat(featEligibleFighter, "ability-score-improvement", { abilities: { strength: 1, dexterity: 1 } });
    expect(chosen.attributes).toEqual(expect.objectContaining({ strength: 17, dexterity: 13 }));
    expect(() => applyDnd5eSrdFeat(featEligibleFighter, "ability-score-improvement", { abilities: { strength: 2, dexterity: 1 } })).toThrow("only 2 ability points");
    expect(() => applyDnd5eSrdFeat(featEligibleFighter, "grappler", { abilities: { wisdom: 1 } })).toThrow("cannot increase Wisdom");
  });

  it("spends only explicitly selected Short Rest dice and restores all dice on a Long Rest", () => {
    const wounded: Actor = { ...fighter, data: { ...fighter.data, hp: { current: 3, max: 12 } } };
    const noSpend = applyDnd5eSrdRest(wounded, "short");
    expect(noSpend.data).toEqual(expect.objectContaining({ hp: { current: 3, max: 12 }, hitDice: { current: 1, max: 1, size: "d10" } }));
    expect(noSpend.recovered).not.toHaveProperty("hitDiceSpent");

    const spent = applyDnd5eSrdRest(wounded, "short", { hitDice: [{ roll: 6 }] });
    expect(spent.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 12 }, hitDice: { current: 0, max: 1, size: "d10" } }));
    expect(spent.recovered).toEqual(expect.objectContaining({ hp: 8, hitDiceSpent: 1, hitDice: [{ className: "Fighter", size: "d10", roll: 6, modifier: 2, healed: 8 }] }));
    expect(() => applyDnd5eSrdRest(wounded, "short", { hitDice: [{ roll: 11 }] })).toThrow("from 1 to 10");

    const depleted: Actor = { ...fighter, data: { ...fighter.data, level: 4, hp: { current: 3, max: 30 }, hitDice: { current: 0, max: 4, size: "d10" } } };
    const longRest = applyDnd5eSrdRest(depleted, "long");
    expect(longRest.data).toEqual(expect.objectContaining({ hp: { current: 30, max: 30 }, hitDice: { current: 4, max: 4, size: "d10" } }));
    expect(longRest.recovered).toEqual(expect.objectContaining({ hp: 27, hitDiceRecovered: 4 }));
  });

  it("restores a reduced Hit Point maximum before completing Long Rest recovery", () => {
    const reduced: Actor = {
      ...fighter,
      data: {
        ...fighter.data,
        hp: { current: 5, max: 20, unreducedMax: 30, maxReduction: 10 },
        temporaryHitPoints: 7,
        conditions: [{ id: "exhaustion", level: 2 }]
      }
    };

    const longRest = applyDnd5eSrdRest(reduced, "long");

    expect(longRest.data.hp).toEqual(expect.objectContaining({ current: 30, max: 30, maxReduction: 0 }));
    expect(longRest.data.temporaryHitPoints).toBe(0);
    expect(longRest.data.conditions).toContainEqual(expect.objectContaining({ id: "exhaustion", level: 1 }));
    expect(longRest.recovered).toEqual(expect.objectContaining({
      hp: 25,
      hitPointMaximumRestored: 10,
      temporaryHitPointsCleared: 7,
      exhaustionReducedBy: 1
    }));
  });

  it("spends the selected multiclass Hit Point Die pool", () => {
    const multiclass: Actor = {
      ...fighter,
      data: {
        ...fighter.data,
        class: "Fighter",
        level: 3,
        attributes: { ...fighter.data.attributes as Record<string, number>, intelligence: 13 },
        classes: [{ className: "Fighter", level: 2 }, { className: "Wizard", level: 1 }],
        hp: { current: 8, max: 24 },
        hitDice: { current: 3, max: 3, size: "d10" },
        hitDicePools: [{ className: "Fighter", size: "d10", current: 2, max: 2 }, { className: "Wizard", size: "d6", current: 1, max: 1 }]
      }
    };
    expect(() => applyDnd5eSrdRest(multiclass, "short", { hitDice: [{ roll: 3 }] })).toThrow("className is required");
    const rest = applyDnd5eSrdRest(multiclass, "short", { hitDice: [{ className: "Wizard", roll: 3 }] });
    expect(rest.data.hitDicePools).toEqual([{ className: "Fighter", size: "d10", current: 2, max: 2 }, { className: "Wizard", size: "d6", current: 0, max: 1 }]);
    expect(rest.data.hitDice).toEqual({ current: 2, max: 3, size: "d10" });
    expect(rest.data.hp).toEqual({ current: 13, max: 24 });

    const wizardLevel = applyDnd5eSrdMulticlassLevel(multiclass, "Wizard", { hitPointRoll: 1 });
    expect(wizardLevel.hp).toEqual({ current: 11, max: 27 });
    expect(() => applyDnd5eSrdMulticlassLevel(multiclass, "Wizard", { hitPointRoll: 7 })).toThrow("from 1 to 6");

    const primaryClassLevel = applyDnd5eSrdAdvancement(multiclass, "level-up", { hitPointRoll: 1, subclassId: "champion" });
    expect(primaryClassLevel.hp).toEqual({ current: 11, max: 27 });
    expect(() => applyDnd5eSrdAdvancement(multiclass, "level-up", { hitPointRoll: 11, subclassId: "champion" })).toThrow("from 1 to 10");

    expect(dnd5eSrdCanMulticlassInto(multiclass, "Wizard")).toEqual({ eligible: true, reasons: [] });
    expect(wizardLevel.classes).toEqual([{ className: "Fighter", level: 2 }, { className: "Wizard", level: 2 }]);
    const ineligibleHeldClass: Actor = { ...multiclass, data: { ...multiclass.data, attributes: { ...multiclass.data.attributes as Record<string, number>, intelligence: 12 } } };
    expect(dnd5eSrdCanMulticlassInto(ineligibleHeldClass, "Wizard").eligible).toBe(false);
    expect(() => applyDnd5eSrdMulticlassLevel(ineligibleHeldClass, "Wizard")).toThrow("Current class Wizard requires Intelligence 13");
  });

  it("applies typed defenses before temporary Hit Points and normal Hit Points", () => {
    const resistant = applyDamage(damageTarget({ temporaryHitPoints: 5, resistances: ["fire"] }), 10, "fire");
    expect(resistant.effects).toContainEqual(expect.objectContaining({ type: "damage", amount: 5, resistance: ["fire"], before: 20, after: 20 }));
    expect(resistant.actorUpdates[0]?.after).toEqual(expect.objectContaining({ hp: { current: 20, max: 20 }, temporaryHitPoints: 0 }));

    const vulnerable = applyDamage(damageTarget({ temporaryHitPoints: 2, vulnerabilities: ["cold"] }), 5, "cold");
    expect(vulnerable.effects).toContainEqual(expect.objectContaining({ amount: 10, vulnerability: ["cold"], before: 20, after: 12 }));
    expect(vulnerable.actorUpdates[0]?.after).toEqual(expect.objectContaining({ hp: { current: 12, max: 20 }, temporaryHitPoints: 0 }));

    const immune = applyDamage(damageTarget({ immunities: ["poison"] }), 99, "poison");
    expect(immune.effects).toContainEqual(expect.objectContaining({ amount: 0, immunity: ["poison"], before: 20, after: 20 }));
    expect(immune.actorUpdates).toEqual([]);
  });

  it("tracks every shipped recharge form, multiple daily uses, and rest recovery", () => {
    expect(dnd5eSrdRechargeProfile("4-6")).toMatchObject({ kind: "roll", minimumRoll: 4, maximumRoll: 6 });
    expect(dnd5eSrdRechargeProfile("6")).toMatchObject({ kind: "roll", minimumRoll: 6, maximumRoll: 6 });
    expect(dnd5eSrdRechargeProfile("3/day")).toMatchObject({ kind: "uses", maxUses: 3, recovery: "long" });
    expect(dnd5eSrdRechargeProfile("Short/Long Rest")).toMatchObject({ kind: "uses", maxUses: 1, recovery: "short" });
    expect(dnd5eSrdRechargeProfile("when the moon agrees")).toBeUndefined();

    const daily = { id: "monster-roar-effect", label: "Roar", formula: "0", metadata: { recharge: "2/day", effectType: "utility" } };
    const first = resolveDnd5eSrdAction({ actor: { ...fighter, type: "monster" }, roll: daily, now: "2026-07-12T00:01:00.000Z" });
    expect(first.blocked).toBeUndefined();
    expect(first.actorUpdates[0]?.after.rulesEngine).toEqual(expect.objectContaining({ recharge: { "monster-roar-effect": expect.objectContaining({ remaining: 1, maxUses: 2, available: true }) } }));
    const afterFirst: Actor = { ...fighter, type: "monster", data: first.actorUpdates[0]!.after };
    const second = resolveDnd5eSrdAction({ actor: afterFirst, roll: daily, now: "2026-07-12T00:02:00.000Z" });
    expect(second.actorUpdates[0]?.after.rulesEngine).toEqual(expect.objectContaining({ recharge: { "monster-roar-effect": expect.objectContaining({ remaining: 0, available: false }) } }));
    const afterSecond: Actor = { ...afterFirst, data: second.actorUpdates[0]!.after };
    expect(resolveDnd5eSrdAction({ actor: afterSecond, roll: daily }).blocked).toEqual(expect.objectContaining({ code: "recharge_unavailable" }));

    expect(dnd5eSrdRecoverRechargeState(afterSecond.data, "short").recoveredActionIds).toEqual([]);
    const recovered = dnd5eSrdRecoverRechargeState(afterSecond.data, "long");
    expect(recovered.recoveredActionIds).toEqual(["monster-roar-effect"]);
    expect((recovered.data.rulesEngine as Record<string, any>).recharge["monster-roar-effect"]).toEqual(expect.objectContaining({ remaining: 2, available: true, recoveredBy: "long" }));
  });

  it("uses typed monster-trait defenses from the shipped SRD data", () => {
    const monster: Actor = { ...damageTarget({}), type: "monster", data: dnd5eSrdMonsterActorData("skeleton")! };
    const result = applyDamage(monster, 5, "bludgeoning");
    expect(result.effects).toContainEqual(expect.objectContaining({ amount: 10, vulnerability: ["bludgeoning"], before: 13, after: 3 }));
  });

  it("uses only equipped and actively attuned item damage defenses", () => {
    const target = damageTarget({ rulesEngine: { attunedItemIds: ["itm_defense"] } });
    const defenseItem: Item = {
      id: "itm_defense",
      campaignId: target.campaignId,
      systemId: target.systemId,
      actorId: target.id,
      type: "item",
      name: "Elemental Ward",
      data: { equipped: true, requiresAttunement: true, resistance: ["fire"], damageImmunity: ["poison"], vulnerability: ["cold"] },
      createdAt: target.createdAt,
      updatedAt: target.updatedAt
    };
    expect(applyDamage(target, 10, "fire", [defenseItem]).effects).toContainEqual(expect.objectContaining({ amount: 5, resistance: ["fire"] }));
    expect(applyDamage(target, 10, "poison", [defenseItem]).effects).toContainEqual(expect.objectContaining({ amount: 0, immunity: ["poison"] }));
    expect(applyDamage(target, 5, "cold", [defenseItem]).effects).toContainEqual(expect.objectContaining({ amount: 10, vulnerability: ["cold"] }));
    expect(applyDamage(damageTarget({}), 10, "fire", [defenseItem]).effects).toContainEqual(expect.objectContaining({ amount: 10 }));
    const stowed = { ...defenseItem, data: { ...defenseItem.data, equipped: false } };
    expect(applyDamage(target, 10, "fire", [stowed]).effects).toContainEqual(expect.objectContaining({ amount: 10 }));
  });

  it("applies Resistance before Vulnerability when both cover the same damage type", () => {
    // SRD 5.2.1 damage order: halve for Resistance first, then double for Vulnerability.
    const both = damageTarget({ resistances: ["fire"], vulnerabilities: ["fire"] });
    expect(applyDamage(both, 23, "fire").effects).toContainEqual(
      expect.objectContaining({ amount: 22, resistance: ["fire"], vulnerability: ["fire"], before: 20, after: 0 })
    );
    expect(applyDamage(both, 10, "fire").effects).toContainEqual(
      expect.objectContaining({ amount: 10, resistance: ["fire"], vulnerability: ["fire"] })
    );
    // Immunity dominates both other defenses.
    const immune = damageTarget({ resistances: ["fire"], vulnerabilities: ["fire"], immunities: ["fire"] });
    expect(applyDamage(immune, 23, "fire").effects).toContainEqual(expect.objectContaining({ amount: 0, immunity: ["fire"] }));
  });

  it("defaults monsters to dead at 0 HP with an explicit per-instance knockout exception", () => {
    const base = { hitPoints: { current: 8, max: 8 }, components: [{ amount: 9, damageType: "slashing" }] };
    const dead = resolveDnd5eSrdDamageComponents({ actor: { type: "monster" }, ...base });
    expect(dead.lifecycle).toMatchObject({ state: "defeated", conditionIds: ["dead"] });
    const spared = resolveDnd5eSrdDamageComponents({ actor: { type: "monster", data: { zeroHpBehavior: "knockout" } }, ...base });
    expect(spared.lifecycle).toMatchObject({ state: "defeated", conditionIds: ["unconscious"] });
    // Characters keep the death-save exception rather than dying outright.
    const character = resolveDnd5eSrdDamageComponents({ actor: { type: "character" }, ...base });
    expect(character.lifecycle).toMatchObject({ state: "unconscious", conditionIds: ["unconscious"] });
  });

  it("resolves ordinary weapon rolls as typed damage without requiring duplicate quick-roll metadata", () => {
    const longsword: Item = {
      id: "itm_typed_longsword",
      campaignId: fighter.campaignId,
      systemId: fighter.systemId,
      actorId: fighter.id,
      type: "item",
      name: "Longsword",
      data: dnd5eSrdCompendiumEntry("longsword")!.data,
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt
    };
    const roll = dnd5eSrdQuickRolls(fighter, [longsword]).find((candidate) => candidate.id === `item-${longsword.id}-damage`)!;
    expect(roll.metadata?.damageType).toBeUndefined();
    const target = damageTarget({ resistances: ["slashing"], temporaryHitPoints: 2 });

    const result = resolveDnd5eSrdAction({
      actor: fighter,
      items: [longsword],
      roll,
      targets: [{ actor: target, rollTotal: 8 }],
      options: { applyEffect: true },
      now: "2026-07-12T00:00:02.000Z"
    });

    expect(result.action.metadata).toEqual(expect.objectContaining({ damageType: "slashing" }));
    expect(result.effects).toContainEqual(expect.objectContaining({
      damageType: "slashing",
      amount: 4,
      resistance: ["slashing"],
      before: 20,
      after: 18
    }));
    expect(result.actorUpdates).toContainEqual(expect.objectContaining({
      actorId: target.id,
      after: expect.objectContaining({ hp: { current: 18, max: 20 }, temporaryHitPoints: 0 })
    }));
  });

  it("requires manual component totals before applying multi-type damage", () => {
    const flameStrike: Item = {
      id: "itm_flame_strike",
      campaignId: fighter.campaignId,
      systemId: fighter.systemId,
      actorId: fighter.id,
      type: "spell",
      name: "Flame Strike",
      data: dnd5eSrdCompendiumEntry("flame-strike")!.data,
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt
    };
    const roll = dnd5eSrdQuickRolls(fighter, [flameStrike]).find((candidate) => candidate.id === `spell-${flameStrike.id}-damage`)!;
    expect(roll.metadata).toEqual(expect.objectContaining({ damageBreakdown: { fire: "5d6", radiant: "5d6" } }));
    const target = damageTarget({ resistances: ["fire"] });
    const result = resolveDnd5eSrdAction({
      actor: fighter,
      items: [flameStrike],
      roll,
      targets: [{ actor: target, rollTotal: 40, saveOutcome: "failure" }],
      options: { applyEffect: true },
      now: "2026-07-12T00:00:01.000Z"
    });
    expect(result.manualResolutionRequired?.reason).toContain("multiple typed damage components");
    expect(result.effects).toEqual([]);
    expect(result.actorUpdates).toEqual([]);

    const combinedTypeResult = resolveDnd5eSrdAction({
      actor: fighter,
      roll: {
        id: "venom-blade-damage",
        label: "Venom Blade Damage",
        formula: "2d6",
        metadata: { damageType: "piercing/poison" }
      },
      targets: [{ actor: target, rollTotal: 12 }],
      options: { applyEffect: true },
      now: "2026-07-12T00:00:02.000Z"
    });
    expect(combinedTypeResult.manualResolutionRequired?.reason).toContain("multiple typed damage components");
    expect(combinedTypeResult.effects).toEqual([]);
    expect(combinedTypeResult.actorUpdates).toEqual([]);
  });

  it("requires manual resolution for unsupported damage types", () => {
    const result = applyDamage(damageTarget({}), 9, "shadow");
    expect(result.manualResolutionRequired?.reason).toContain("unsupported damage type shadow");
    expect(result.effects).toEqual([]);
    expect(result.actorUpdates).toEqual([]);
  });

  it("gates attunement-dependent item modifiers", () => {
    const cloak: Item = {
      id: "itm_cloak",
      campaignId: fighter.campaignId,
      systemId: fighter.systemId,
      actorId: fighter.id,
      type: "item",
      name: "Cloak of Protection",
      data: { equipped: true, requiresAttunement: true, armorClassBonus: 1, savingThrowBonus: 1 },
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt
    };
    expect(dnd5eSrdSheet(fighter, [cloak]).data.armorClass).toBe(11);
    const attuned: Actor = { ...fighter, data: { ...fighter.data, rulesEngine: { attunedItemIds: [cloak.id] } } };
    expect(dnd5eSrdSheet(attuned, [cloak]).data.armorClass).toBe(12);
    expect(dnd5eSrdQuickRolls(fighter, [cloak]).find((roll) => roll.id === "save-strength")?.formula).toBe("1d20+5");
    expect(dnd5eSrdQuickRolls(attuned, [cloak]).find((roll) => roll.id === "save-strength")?.formula).toBe("1d20+6");

    const staff: Item = { ...cloak, id: "itm_staff", name: "Staff of Striking", data: { equipped: true, requiresAttunement: true, weaponKind: "melee", weaponCategory: "martial", damage: "1d6", ability: "strength", attackBonus: 3, damageBonus: 3 } };
    expect(dnd5eSrdQuickRolls(fighter, [staff]).find((roll) => roll.id === `item-${staff.id}-damage`)).toBeUndefined();
    const staffAttuned: Actor = { ...fighter, data: { ...fighter.data, rulesEngine: { attunedItemIds: [staff.id] } } };
    expect(dnd5eSrdQuickRolls(staffAttuned, [staff]).find((roll) => roll.id === `item-${staff.id}-damage`)?.formula).toBe("1d6+6");
  });

  it("keeps over-limit attunements inactive unless a reasoned override is recorded", () => {
    const items = ["one", "two", "three", "four"].map((suffix): Item => ({
      id: `itm_${suffix}`,
      campaignId: fighter.campaignId,
      systemId: fighter.systemId,
      actorId: fighter.id,
      type: "item",
      name: `Protection ${suffix}`,
      data: { equipped: true, requiresAttunement: true, armorClassBonus: 1 },
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt
    }));
    const rawOverLimit: Actor = { ...fighter, data: { ...fighter.data, rulesEngine: { attunedItemIds: items.map((item) => item.id) } } };
    expect(dnd5eSrdAttunementState(rawOverLimit)).toEqual(expect.objectContaining({ activeAttunedItemIds: items.slice(0, 3).map((item) => item.id), inactiveAttunedItemIds: [items[3]!.id], overLimitBy: 1 }));
    expect(dnd5eSrdSheet(rawOverLimit, items).data.armorClass).toBe(14);
    const legacyFive: Actor = { ...rawOverLimit, data: { ...rawOverLimit.data, rulesEngine: { attunedItemIds: [...items.map((item) => item.id), "itm_five"] } } };
    const legacyFifthItem: Item = { ...items[0]!, id: "itm_five", name: "Protection five" };
    const reducedLegacyData = applyDnd5eSrdAttunement(legacyFive, legacyFifthItem, false);
    expect(dnd5eSrdAttunementState({ ...legacyFive, data: reducedLegacyData })).toEqual(expect.objectContaining({ overLimitBy: 1, activeAttunedItemIds: items.slice(0, 3).map((item) => item.id) }));

    let data = fighter.data;
    for (const item of items.slice(0, 3)) data = applyDnd5eSrdAttunement({ ...fighter, data }, item, true);
    expect(() => applyDnd5eSrdAttunement({ ...fighter, data }, items[3]!, true)).toThrow("override reason is required");
    const overriddenData = applyDnd5eSrdAttunement({ ...fighter, data }, items[3]!, true, { overrideReason: "Campaign boon approved by the GM" });
    const overridden: Actor = { ...fighter, data: overriddenData };
    expect(dnd5eSrdAttunementState(overridden)).toEqual(expect.objectContaining({ activeAttunedItemIds: items.map((item) => item.id), overrideReason: "Campaign boon approved by the GM" }));
    expect(dnd5eSrdSheet(overridden, items).data.armorClass).toBe(15);
  });

  it("cleans up the caster-local concentration effect on a failed save", () => {
    const concentrating: Actor = {
      ...fighter,
      data: {
        ...fighter.data,
        rulesEngine: {
          concentration: { rollId: "spell-bless-effect", label: "Bless", sourceActorId: fighter.id, startedAt: "2026-07-12T00:00:00.000Z", targetActorIds: ["act_target"] },
          activeEffects: [{ id: "spell-bless-effect:now", rollId: "spell-bless-effect", sourceActorId: fighter.id, startedAt: "2026-07-12T00:00:00.000Z", concentration: true }, { id: "other", label: "Other" }]
        }
      }
    };
    const result = resolveDnd5eSrdConcentrationDamage(concentrating, 10, "failure");
    expect(result.data.rulesEngine).toEqual({ activeEffects: [{ id: "other", label: "Other" }] });
    expect(result.cleanup).toEqual({ sourceActorId: fighter.id, rollId: "spell-bless-effect", startedAt: "2026-07-12T00:00:00.000Z", targetActorIds: ["act_target"], reason: "broken" });

    const target = damageTarget({
      conditions: [{ id: "frightened", name: "Frightened", appliedAt: "2026-07-12T00:00:00.000Z" }],
      rulesEngine: {
        activeEffects: [
          { id: "owned", sourceActorId: fighter.id, rollId: "spell-bless-effect", startedAt: "2026-07-12T00:00:00.000Z", conditionIds: ["frightened"], ownedConditionIds: ["frightened"] },
          { id: "new-cast", sourceActorId: fighter.id, rollId: "spell-bless-effect", startedAt: "2026-07-12T00:00:02.000Z" },
          { id: "other-source", sourceActorId: "act_other", rollId: "spell-bless-effect", resistance: ["fire"] }
        ]
      }
    });
    const cleanup = applyDnd5eSrdConcentrationCleanup(target, result.cleanup!);
    expect(cleanup.removedEffectIds).toEqual(["owned"]);
    expect(cleanup.removedConditionIds).toEqual(["frightened"]);
    expect(cleanup.data).toEqual(expect.objectContaining({ conditions: [], rulesEngine: { activeEffects: [expect.objectContaining({ id: "new-cast" }), expect.objectContaining({ id: "other-source" })] } }));
    expect(dnd5eSrdConcentrationCleanupActorUpdates([target], [result.cleanup!])).toEqual([expect.objectContaining({ actorId: target.id, after: cleanup.data })]);

    const replacement = resolveDnd5eSrdAction({
      actor: concentrating,
      roll: { id: "spell-new-effect", label: "New Concentration", formula: "0", metadata: { concentration: true, duration: "1 minute" } },
      targets: [{ actor: damageTarget({}) }],
      now: "2026-07-12T00:00:02.000Z"
    });
    expect(replacement.concentrationCleanups).toEqual([{ sourceActorId: fighter.id, rollId: "spell-bless-effect", startedAt: "2026-07-12T00:00:00.000Z", targetActorIds: ["act_target"], reason: "replaced" }]);
  });
});
