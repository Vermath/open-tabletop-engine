import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyDnd5eSrdAdvancement, applyDnd5eSrdCondition, applyDnd5eSrdRest, applyGenericFantasyAdvancement, applyGenericFantasyCondition, applyGenericFantasyRest, applyMysticNoirAdvancement, applyMysticNoirCondition, applyMysticNoirRest, applyStellarFrontiersAdvancement, applyStellarFrontiersCondition, applyStellarFrontiersRest, dnd5eSrdActionFormula, dnd5eSrdAdvancementOptions, dnd5eSrdApplyCharacterOrigins, dnd5eSrdCharacterImport, dnd5eSrdCharacterOrigins, dnd5eSrdCharacterTemplate, dnd5eSrdCompendiumEntry, dnd5eSrdEncounterPlan, dnd5eSrdEncounterThreats, dnd5eSrdEncounterXpBudgets, dnd5eSrdEquipmentPurchase, dnd5eSrdMonsterActorData, dnd5eSrdQuickRolls, dnd5eSrdSheet, genericFantasyActorConditions, genericFantasyAdvancementOptions, genericFantasyCharacterImport, genericFantasyCharacterTemplate, genericFantasyCompendiumEntry, genericFantasyEncounterPlan, genericFantasyEncounterThreats, genericFantasyQuickRolls, genericFantasySheet, mysticNoirActorConditions, mysticNoirAdvancementOptions, mysticNoirCharacterImport, mysticNoirCharacterTemplate, mysticNoirCompendiumEntry, mysticNoirEncounterPlan, mysticNoirEncounterThreats, mysticNoirQuickRolls, mysticNoirSheet, removeGenericFantasyCondition, removeMysticNoirCondition, removeStellarFrontiersCondition, stellarFrontiersActorConditions, stellarFrontiersAdvancementOptions, stellarFrontiersCharacterImport, stellarFrontiersCharacterTemplate, stellarFrontiersCompendiumEntry, stellarFrontiersEncounterPlan, stellarFrontiersEncounterThreats, stellarFrontiersQuickRolls, stellarFrontiersSheet, useDnd5eSrdAction, useGenericFantasyAction, useMysticNoirAction, useStellarFrontiersAction } from "./index.js";

const actor: Actor = {
  id: "act_test",
  campaignId: "camp_demo",
  systemId: "generic-fantasy",
  ownerUserId: "usr_demo_player",
  type: "character",
  name: "Test Hero",
  data: {
    attributes: { strength: 14, dexterity: 12, constitution: 13, intelligence: 11, wisdom: 10, charisma: 15 },
    hp: { current: 8, max: 12 },
    conditions: []
  },
  permissions: {},
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

describe("generic fantasy rules", () => {
  it("adds compendium-backed condition effects to quick rolls", () => {
    const blessedData = applyGenericFantasyCondition(actor, "blessed", "2026-05-01T00:00:00.000Z");
    const blessedActor = { ...actor, data: blessedData };

    expect(genericFantasyActorConditions(blessedActor)).toContainEqual(expect.objectContaining({ id: "blessed", name: "Blessed" }));
    expect(genericFantasyQuickRolls(blessedActor).find((roll) => roll.id === "ability-charisma")?.formula).toBe("1d20+2+1d4");

    const poisonedData = applyGenericFantasyCondition(blessedActor, "poisoned", "2026-05-01T00:00:01.000Z");
    const poisonedActor = { ...actor, data: poisonedData };
    expect(genericFantasyQuickRolls(poisonedActor).find((roll) => roll.id === "ability-charisma")?.formula).toBe("2d20kl1+2+1d4");

    const clearedActor = { ...actor, data: removeGenericFantasyCondition(poisonedActor, "poisoned") };
    expect(genericFantasyActorConditions(clearedActor).map((condition) => condition.id)).toEqual(["blessed"]);
  });

  it("builds sheets with inventory, spells, and compendium entries", () => {
    const items: Item[] = [
      {
        id: "itm_longsword",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        actorId: actor.id,
        type: "item",
        name: "Longsword",
        data: { damage: "1d8", versatileDamage: "1d10", ability: "strength", compendiumId: "longsword" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "itm_healing_word",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        actorId: actor.id,
        type: "spell",
        name: "Healing Word",
        data: { healingFormula: "1d4+@attributes.charisma", compendiumId: "healing-word" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(genericFantasyCompendiumEntry("healing-word")).toEqual(expect.objectContaining({ type: "spell", name: "Healing Word" }));
    const sheet = genericFantasySheet(actor, items);
    expect(sheet.inventory.map((item) => item.name)).toEqual(["Longsword"]);
    expect(sheet.spells.map((item) => item.name)).toEqual(["Healing Word"]);
    expect(sheet.quickRolls).toEqual(
      expect.arrayContaining([
        { id: "item-itm_longsword-damage", label: "Longsword Damage", formula: "1d8+2" },
        { id: "item-itm_longsword-versatile-damage", label: "Longsword Versatile Damage", formula: "1d10+2" },
        { id: "spell-itm_healing_word-healing", label: "Healing Word Healing", formula: "1d4+2" }
      ])
    );
  });

  it("spends spell slots for leveled fantasy spell actions", () => {
    const spell: Item = {
      id: "itm_cure_wounds",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      actorId: actor.id,
      type: "spell",
      name: "Cure Wounds",
      data: { level: 1, healingFormula: "1d8+@attributes.wisdom", compendiumId: "cure-wounds" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const caster: Actor = {
      ...actor,
      data: {
        ...actor.data,
        spellSlots: { level1: { current: 1, max: 2, recovery: "long" } }
      }
    };

    const used = useGenericFantasyAction(caster, [spell], `spell-${spell.id}-healing`);
    expect(used.consumed).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
    expect(used.data.spellSlots).toEqual({ level1: { current: 0, max: 2, recovery: "long" } });
    expect(() => useGenericFantasyAction({ ...caster, data: used.data }, [spell], `spell-${spell.id}-healing`)).toThrow("Insufficient level 1 spell slot");
  });

  it("provides guided character templates and level advancement", () => {
    const guardian = genericFantasyCharacterTemplate("guardian");
    expect(guardian).toEqual(expect.objectContaining({ name: "Guardian", actorType: "character" }));
    expect(guardian?.items).toEqual([{ entryId: "longsword" }]);

    const builtActor = { ...actor, data: guardian!.data };
    expect(genericFantasyAdvancementOptions(builtActor)).toContainEqual(expect.objectContaining({ id: "level-up", nextValue: 2 }));
    const advancedData = applyGenericFantasyAdvancement(builtActor, "level-up");
    expect(advancedData.level).toBe(2);
    expect(advancedData.hp).toEqual({ current: 17, max: 17 });
    expect((advancedData.attributes as Record<string, number>).strength).toBe(17);
    expect(advancedData.features).toEqual(expect.arrayContaining(["Guardian Level 2"]));

    const mender = genericFantasyCharacterTemplate("mender");
    const menderActor = {
      ...actor,
      data: {
        ...mender!.data,
        level: 2,
        spellSlots: { level1: { current: 1, max: 2, recovery: "long" } }
      }
    };
    const advancedMender = applyGenericFantasyAdvancement(menderActor, "level-up");
    expect(advancedMender.spellSlots).toEqual({ level1: { current: 1, max: 3, recovery: "long" } });
  });

  it("applies fantasy short and long rest recovery rules", () => {
    const depletedActor: Actor = {
      ...actor,
      data: {
        ...actor.data,
        class: "Mender",
        level: 2,
        hp: { current: 2, max: 12 },
        hitDice: { current: 1, max: 2, size: "d8" },
        resources: {
          fieldPrayer: { current: 0, max: 1, recovery: "long" },
          secondWind: { current: 0, max: 1, recovery: "short" }
        },
        spellSlots: { level1: { current: 0, max: 3, recovery: "long" } },
        conditions: [{ id: "blessed" }, { id: "poisoned" }, { id: "restrained" }]
      }
    };

    const shortRest = applyGenericFantasyRest(depletedActor, "short");
    expect(shortRest.data.hp).toEqual({ current: 8, max: 12 });
    expect(shortRest.data.hitDice).toEqual({ current: 0, max: 2, size: "d8" });
    expect(shortRest.data.resources).toEqual({
      fieldPrayer: { current: 0, max: 1, recovery: "long" },
      secondWind: { current: 1, max: 1, recovery: "short" }
    });
    expect(shortRest.data.spellSlots).toEqual({ level1: { current: 0, max: 3, recovery: "long" } });
    expect(shortRest.data.conditions).toEqual([{ id: "blessed" }, { id: "poisoned" }]);
    expect(shortRest.removedConditions.map((condition) => condition.id)).toEqual(["restrained"]);

    const longRest = applyGenericFantasyRest(depletedActor, "long");
    expect(longRest.data.hp).toEqual({ current: 12, max: 12 });
    expect(longRest.data.hitDice).toEqual({ current: 2, max: 2, size: "d8" });
    expect(longRest.data.resources).toEqual({
      fieldPrayer: { current: 1, max: 1, recovery: "long" },
      secondWind: { current: 1, max: 1, recovery: "short" }
    });
    expect(longRest.data.spellSlots).toEqual({ level1: { current: 3, max: 3, recovery: "long" } });
    expect(longRest.data.conditions).toEqual([{ id: "blessed" }]);
    expect(longRest.removedConditions.map((condition) => condition.id)).toEqual(["poisoned", "restrained"]);
  });

  it("calculates encounter budgets from threat selections", () => {
    expect(genericFantasyEncounterThreats().map((threat) => threat.id)).toContain("skeletal-guard");
    const plan = genericFantasyEncounterPlan([{ ...actor, data: { ...actor.data, level: 2 } }], [{ id: "skeletal-guard", count: 2 }]);
    expect(plan).toMatchObject({
      systemId: "generic-fantasy",
      partyRating: 200,
      threatBudget: 150,
      difficulty: "standard"
    });
    expect(plan.summary).toContain("2x Skeletal Guard");
  });

  it("normalizes imported fantasy characters", () => {
    const imported = genericFantasyCharacterImport({
      name: "Imported Mender",
      data: {
        level: 3,
        class: "Mender",
        hp: { current: 14, max: 18 },
        attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
        features: ["Field Prayer"],
        conditions: ["blessed", "missing-condition"],
        items: ["healing-word", "longsword", "missing-item"]
      }
    });

    expect(imported).toMatchObject({
      systemId: "generic-fantasy",
      actorType: "character",
      name: "Imported Mender",
      data: {
        level: 3,
        class: "Mender",
        hp: { current: 14, max: 18 },
        conditions: [{ id: "blessed" }]
      },
      items: [{ entryId: "healing-word" }, { entryId: "longsword" }]
    });
    expect(imported.warnings).toEqual(["Unknown condition skipped: missing-condition", "Unknown compendium entry skipped: missing-item"]);
  });
});

describe("dnd 5.5e srd rules", () => {
  const srdActor: Actor = {
    ...actor,
    systemId: "dnd-5e-srd",
    data: {
      ...actor.data,
      ruleset: "SRD 5.2.1",
      class: "Cleric",
      species: "Human",
      background: "Sage",
      attributes: { strength: 10, dexterity: 12, constitution: 13, intelligence: 11, wisdom: 16, charisma: 10 },
      skillProficiencies: ["medicine", "religion"],
      toolProficiencies: ["calligraphers-supplies"],
      currency: { gp: 50, sp: 0, cp: 0 },
      spellSlots: { level1: { current: 1, max: 2, recovery: "long" }, level2: { current: 1, max: 1, recovery: "long" } }
    }
  };

  it("exposes first-class SRD templates, compendium entries, and quick rolls", () => {
    const cleric = dnd5eSrdCharacterTemplate("cleric");
    const fighter = dnd5eSrdCharacterTemplate("fighter");
    const barbarian = dnd5eSrdCharacterTemplate("barbarian");
    const bard = dnd5eSrdCharacterTemplate("bard");
    const wizard = dnd5eSrdCharacterTemplate("wizard");
    const paladin = dnd5eSrdCharacterTemplate("paladin");
    const druid = dnd5eSrdCharacterTemplate("druid");
    const ranger = dnd5eSrdCharacterTemplate("ranger");
    const monk = dnd5eSrdCharacterTemplate("monk");
    const sorcerer = dnd5eSrdCharacterTemplate("sorcerer");
    const warlock = dnd5eSrdCharacterTemplate("warlock");
    const rogue = dnd5eSrdCharacterTemplate("rogue");
    expect(cleric).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Cleric" }));
    expect(cleric?.data.saveProficiencies).toEqual(["wisdom", "charisma"]);
    expect(cleric?.data.skillProficiencies).toEqual(["medicine", "religion"]);
    expect(cleric?.data.toolProficiencies).toEqual(["calligraphers-supplies"]);
    expect(cleric?.data.currency).toEqual({ gp: 50, sp: 0, cp: 0 });
    expect(cleric?.data.features).toEqual(["Spellcasting", "Divine Order"]);
    expect(dnd5eSrdCharacterTemplate("fighter")?.data.toolProficiencies).toEqual(["gaming-set"]);
    expect(fighter?.data.resources).toEqual({ secondWind: { current: 2, max: 2, recovery: "short" } });
    expect(barbarian).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Barbarian" }));
    expect(barbarian?.data.features).toEqual(["Rage", "Unarmored Defense", "Weapon Mastery"]);
    expect(barbarian?.data.hitDice).toEqual({ current: 1, max: 1, size: "d12" });
    expect(barbarian?.data.resources).toEqual({ rage: { current: 2, max: 2, recovery: "short" } });
    expect(barbarian?.items.map((item) => item.entryId)).toEqual(["spear"]);
    expect(bard).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Bard" }));
    expect(bard?.data.features).toEqual(["Bardic Inspiration", "Spellcasting"]);
    expect(bard?.data.saveProficiencies).toEqual(["dexterity", "charisma"]);
    expect(bard?.data.skillProficiencies).toEqual(["performance", "persuasion", "perception"]);
    expect(bard?.data.hitDice).toEqual({ current: 1, max: 1, size: "d8" });
    expect(bard?.data.resources).toEqual({ bardicInspiration: { current: 3, max: 3, recovery: "long" } });
    expect(bard?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(bard?.items.map((item) => item.entryId)).toEqual(["healing-word", "dagger"]);
    expect(paladin).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Paladin" }));
    expect(paladin?.data.features).toEqual(["Lay On Hands", "Spellcasting", "Weapon Mastery"]);
    expect(paladin?.data.saveProficiencies).toEqual(["wisdom", "charisma"]);
    expect(paladin?.data.skillProficiencies).toEqual(["athletics", "persuasion"]);
    expect(paladin?.data.hitDice).toEqual({ current: 1, max: 1, size: "d10" });
    expect(paladin?.data.resources).toEqual({ layOnHands: { current: 5, max: 5, recovery: "long" } });
    expect(paladin?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(paladin?.items.map((item) => item.entryId)).toEqual(["longsword", "cure-wounds"]);
    expect(druid).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Druid" }));
    expect(druid?.data.features).toEqual(["Spellcasting", "Druidic", "Primal Order"]);
    expect(druid?.data.saveProficiencies).toEqual(["intelligence", "wisdom"]);
    expect(druid?.data.skillProficiencies).toEqual(["nature", "survival"]);
    expect(druid?.data.hitDice).toEqual({ current: 1, max: 1, size: "d8" });
    expect(druid?.data.resources).toEqual({});
    expect(druid?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(druid?.items.map((item) => item.entryId)).toEqual(["cure-wounds", "quarterstaff"]);
    expect(ranger).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Ranger" }));
    expect(ranger?.data.features).toEqual(["Spellcasting", "Favored Enemy", "Weapon Mastery"]);
    expect(ranger?.data.saveProficiencies).toEqual(["strength", "dexterity"]);
    expect(ranger?.data.skillProficiencies).toEqual(["nature", "perception", "survival"]);
    expect(ranger?.data.hitDice).toEqual({ current: 1, max: 1, size: "d10" });
    expect(ranger?.data.resources).toEqual({ favoredEnemy: { current: 2, max: 2, recovery: "long" } });
    expect(ranger?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(ranger?.items.map((item) => item.entryId)).toEqual(["hunters-mark", "cure-wounds", "longbow", "scimitar", "shortsword", "studded-leather-armor"]);
    expect(monk).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Monk" }));
    expect(monk?.data.features).toEqual(["Martial Arts", "Unarmored Defense"]);
    expect(monk?.data.saveProficiencies).toEqual(["strength", "dexterity"]);
    expect(monk?.data.skillProficiencies).toEqual(["acrobatics", "stealth"]);
    expect(monk?.data.hitDice).toEqual({ current: 1, max: 1, size: "d8" });
    expect(monk?.data.resources).toEqual({});
    expect(monk?.data.spellSlots).toEqual({});
    expect(monk?.items.map((item) => item.entryId)).toEqual(["spear", "dagger", "musical-instrument"]);
    expect(sorcerer).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Sorcerer" }));
    expect(sorcerer?.data.features).toEqual(["Spellcasting", "Innate Sorcery"]);
    expect(sorcerer?.data.saveProficiencies).toEqual(["constitution", "charisma"]);
    expect(sorcerer?.data.skillProficiencies).toEqual(["arcana", "persuasion"]);
    expect(sorcerer?.data.hitDice).toEqual({ current: 1, max: 1, size: "d6" });
    expect(sorcerer?.data.resources).toEqual({ innateSorcery: { current: 2, max: 2, recovery: "long" } });
    expect(sorcerer?.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(sorcerer?.items.map((item) => item.entryId)).toEqual(["sorcerous-burst", "chromatic-orb", "shield", "spear", "dagger", "arcane-focus"]);
    expect(warlock).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd", name: "Warlock" }));
    expect(warlock?.data.features).toEqual(["Eldritch Invocations", "Pact Magic"]);
    expect(warlock?.data.saveProficiencies).toEqual(["wisdom", "charisma"]);
    expect(warlock?.data.skillProficiencies).toEqual(["arcana", "intimidation"]);
    expect(warlock?.data.hitDice).toEqual({ current: 1, max: 1, size: "d8" });
    expect(warlock?.data.resources).toEqual({});
    expect(warlock?.data.spellSlots).toEqual({ level1: { current: 1, max: 1, recovery: "short" } });
    expect(warlock?.items.map((item) => item.entryId)).toEqual(["eldritch-blast", "hex", "leather-armor", "sickle", "dagger", "arcane-focus"]);
    expect(wizard?.data.features).toEqual(["Spellcasting", "Arcane Recovery"]);
    expect(wizard?.data.resources).toEqual({ arcaneRecovery: { current: 1, max: 1, recovery: "long" } });
    expect(rogue?.data.features).toEqual(["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"]);
    expect(rogue?.data.saveProficiencies).toEqual(["dexterity", "intelligence"]);
    expect(rogue?.data.skillExpertise).toEqual(["stealth", "sleight-of-hand"]);
    expect(rogue?.items.map((item) => item.entryId)).toEqual(["dagger", "shortbow"]);
    expect(cleric?.items.map((item) => item.entryId)).toEqual(["healing-word", "cure-wounds"]);
    expect(dnd5eSrdCompendiumEntry("magic-initiate")).toEqual(expect.objectContaining({ name: "Magic Initiate" }));
    expect(dnd5eSrdCompendiumEntry("longsword")?.data).toEqual(expect.objectContaining({ costGp: 15, weightLb: 3 }));
    expect(dnd5eSrdCompendiumEntry("shield-armor")?.data).toEqual(expect.objectContaining({ costGp: 10, armorBonus: 2 }));
    expect(dnd5eSrdCompendiumEntry("leather-armor")?.data).toEqual(expect.objectContaining({ armorBase: 11, armorType: "light", costGp: 10, weightLb: 10 }));
    expect(dnd5eSrdCompendiumEntry("chain-mail")?.data).toEqual(expect.objectContaining({ armorBase: 16, armorType: "heavy", dexBonus: false, strengthRequirement: 13, stealthDisadvantage: true, costGp: 75, weightLb: 55 }));
    expect(dnd5eSrdCompendiumEntry("chromatic-orb")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "3d8", upcastFormula: "1d8" }));
    expect(dnd5eSrdCompendiumEntry("ice-knife")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d10", secondaryDamageFormula: "2d6", secondaryUpcastFormula: "1d6" }));
    expect(dnd5eSrdCompendiumEntry("ray-of-sickness")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d8", upcastFormula: "1d8" }));
    expect(dnd5eSrdCompendiumEntry("divine-smite")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d8", upcastFormula: "1d8", damageType: "radiant" }));
    expect(dnd5eSrdCompendiumEntry("hunters-mark")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", damageType: "force", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("sorcerous-burst")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d8", damageType: "choice" }));
    expect(dnd5eSrdCompendiumEntry("eldritch-blast")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d10", damageType: "force" }));
    expect(dnd5eSrdCompendiumEntry("hex")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", damageType: "necrotic", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("dagger")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 2, damageType: "piercing" }));
    expect(dnd5eSrdCompendiumEntry("sickle")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 1, damageType: "slashing" }));
    expect(dnd5eSrdCompendiumEntry("quarterstaff")?.data).toEqual(expect.objectContaining({ damage: "1d6", versatileDamage: "1d8", costGp: 0.2 }));
    expect(dnd5eSrdCompendiumEntry("shortbow")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 25, damageType: "piercing" }));
    expect(dnd5eSrdCompendiumEntry("longbow")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 50, damageType: "piercing" }));
    expect(dnd5eSrdCompendiumEntry("scimitar")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 25, damageType: "slashing" }));
    expect(dnd5eSrdCompendiumEntry("shortsword")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 10, damageType: "piercing" }));
    expect(dnd5eSrdCompendiumEntry("studded-leather-armor")?.data).toEqual(expect.objectContaining({ armorBase: 12, armorType: "light", costGp: 45, weightLb: 13 }));
    expect(dnd5eSrdCompendiumEntry("spear")?.data).toEqual(expect.objectContaining({ damage: "1d6", versatileDamage: "1d8", costGp: 1 }));
    expect(dnd5eSrdCompendiumEntry("musical-instrument")?.data).toEqual(expect.objectContaining({ toolId: "musical-instrument", costGp: 2 }));
    expect(dnd5eSrdCompendiumEntry("arcane-focus")?.data).toEqual(expect.objectContaining({ focusType: "arcane", costGp: 10 }));

    const spell: Item = {
      id: "itm_healing_word",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Healing Word",
      data: { level: 1, healingFormula: "1d4+@attributes.wisdom", upcastFormula: "2d4", compendiumId: "healing-word" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const chromaticOrb: Item = {
      id: "itm_chromatic_orb",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Chromatic Orb",
      data: { ...dnd5eSrdCompendiumEntry("chromatic-orb")!.data, compendiumId: "chromatic-orb" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const iceKnife: Item = {
      id: "itm_ice_knife",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Ice Knife",
      data: { ...dnd5eSrdCompendiumEntry("ice-knife")!.data, compendiumId: "ice-knife" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const shortbow: Item = {
      id: "itm_shortbow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Shortbow",
      data: { ...dnd5eSrdCompendiumEntry("shortbow")!.data, compendiumId: "shortbow" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const leatherArmor: Item = {
      id: "itm_leather_armor",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Leather Armor",
      data: { ...dnd5eSrdCompendiumEntry("leather-armor")!.data, compendiumId: "leather-armor" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const chainMail: Item = {
      id: "itm_chain_mail",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Chain Mail",
      data: { ...dnd5eSrdCompendiumEntry("chain-mail")!.data, compendiumId: "chain-mail" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const shield: Item = {
      id: "itm_shield",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Shield",
      data: { ...dnd5eSrdCompendiumEntry("shield-armor")!.data, compendiumId: "shield-armor" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdSheet(srdActor, [spell]).spells.map((item) => item.name)).toEqual(["Healing Word"]);
    expect(dnd5eSrdSheet(srdActor, [leatherArmor, shield]).data).toEqual(
      expect.objectContaining({
        armorClass: 14,
        armorClassDetails: expect.objectContaining({ value: 14, base: 11, dexModifier: 1, armorName: "Leather Armor", shieldBonus: 2, speedPenalty: 0 })
      })
    );
    expect(dnd5eSrdSheet(srdActor, [chainMail, shield]).data).toEqual(
      expect.objectContaining({
        armorClass: 18,
        armorClassDetails: expect.objectContaining({ value: 18, base: 16, dexModifier: 0, armorName: "Chain Mail", shieldBonus: 2, stealthDisadvantage: true, strengthRequirement: 13, speedPenalty: -10 })
      })
    );
    expect(dnd5eSrdQuickRolls(srdActor, [spell, chromaticOrb, iceKnife, shortbow])).toEqual(
      expect.arrayContaining([
        { id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" },
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+2" },
        { id: "save-strength", label: "Strength Save", formula: "1d20+0" },
        { id: "skill-medicine", label: "Medicine Check", formula: "1d20+5" },
        { id: "skill-religion", label: "Religion Check", formula: "1d20+2" },
        { id: "skill-perception", label: "Perception Check", formula: "1d20+3" },
        { id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+3" },
        { id: "spell-itm_healing_word-healing", label: "Healing Word Healing", formula: "1d4+3" },
        { id: "spell-itm_chromatic_orb-damage", label: "Chromatic Orb Damage", formula: "3d8" },
        { id: "spell-itm_ice_knife-damage", label: "Ice Knife Damage", formula: "1d10" },
        { id: "spell-itm_ice_knife-secondary-damage", label: "Ice Knife Secondary Damage", formula: "2d6" },
        { id: "item-itm_shortbow-damage", label: "Shortbow Damage", formula: "1d6+1" }
      ])
    );
    const clericActor: Actor = { ...srdActor, data: { ...cleric!.data } };
    const levelTwoClericData = applyDnd5eSrdAdvancement(clericActor, "level-up");
    const levelTwoClericActor: Actor = { ...clericActor, data: levelTwoClericData };
    expect(levelTwoClericData.features).toEqual(expect.arrayContaining(["Channel Divinity", "Divine Spark", "Turn Undead"]));
    expect(levelTwoClericData.resources).toEqual({ channelDivinity: { current: 2, max: 2, recovery: "short" } });
    expect(dnd5eSrdQuickRolls(levelTwoClericActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-divine-spark-healing", label: "Divine Spark Healing", formula: "1d8+3", metadata: expect.objectContaining({ resource: "channelDivinity", rangeFt: 30 }) }),
        expect.objectContaining({ id: "feature-divine-spark-damage", label: "Divine Spark Damage", formula: "1d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 13, success: "half" } }) }),
        expect.objectContaining({ id: "feature-turn-undead", label: "Turn Undead", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 13 } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelTwoClericActor, [], "feature-divine-spark-healing")).toBe("1d8+3");
    expect(dnd5eSrdActionFormula(levelTwoClericActor, [], "feature-divine-spark-damage")).toBe("1d8+3");
    expect(dnd5eSrdActionFormula(levelTwoClericActor, [], "feature-turn-undead")).toBe("0");
    let levelFiveClericData = clericActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelFiveClericData }, "level-up");
    }
    const levelFiveClericActor: Actor = { ...clericActor, data: levelFiveClericData };
    expect(levelFiveClericData.features).toEqual(expect.arrayContaining(["Channel Divinity", "Divine Spark", "Turn Undead", "Sear Undead"]));
    expect(levelFiveClericData.resources).toEqual({ channelDivinity: { current: 2, max: 2, recovery: "short" } });
    expect(dnd5eSrdQuickRolls(levelFiveClericActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-turn-undead", formula: "0", metadata: expect.objectContaining({ searUndead: { formula: "5d8", damageType: "Radiant" } }) }),
        expect.objectContaining({ id: "feature-sear-undead-damage", label: "Sear Undead Damage", formula: "5d8", metadata: expect.objectContaining({ trigger: "Turn Undead failed save", damageType: "Radiant" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveClericActor, [], "feature-sear-undead-damage")).toBe("5d8");
    const fighterActor: Actor = { ...srdActor, data: { ...fighter!.data } };
    expect(dnd5eSrdQuickRolls(fighterActor, [])).toEqual(
      expect.arrayContaining([{ id: "feature-second-wind-healing", label: "Second Wind Healing", formula: "1d10+1" }])
    );
    expect(dnd5eSrdActionFormula({ ...fighterActor, data: { ...fighterActor.data, level: 3 } }, [], "feature-second-wind-healing")).toBe("1d10+3");
    const levelTwoFighterData = applyDnd5eSrdAdvancement(fighterActor, "level-up");
    const levelTwoFighterActor: Actor = { ...fighterActor, data: levelTwoFighterData };
    expect(levelTwoFighterData.features).toEqual(expect.arrayContaining(["Action Surge", "Tactical Mind"]));
    expect(levelTwoFighterData.resources).toEqual({
      secondWind: { current: 2, max: 2, recovery: "short" },
      actionSurge: { current: 1, max: 1, recovery: "short" }
    });
    expect(dnd5eSrdQuickRolls(levelTwoFighterActor, [])).toEqual(
      expect.arrayContaining([
        { id: "feature-action-surge", label: "Action Surge", formula: "0" },
        { id: "feature-tactical-mind-bonus", label: "Tactical Mind Bonus", formula: "1d10" }
      ])
    );
    expect(dnd5eSrdActionFormula(levelTwoFighterActor, [], "feature-action-surge")).toBe("0");
    expect(dnd5eSrdActionFormula(levelTwoFighterActor, [], "feature-tactical-mind-bonus")).toBe("1d10");
    let levelFiveFighterData = fighterActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveFighterData = applyDnd5eSrdAdvancement({ ...fighterActor, data: levelFiveFighterData }, "level-up");
    }
    const levelFiveFighterActor: Actor = { ...fighterActor, data: levelFiveFighterData };
    const fighterLongsword: Item = {
      id: "itm_fighter_longsword",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: fighterActor.id,
      type: "item",
      name: "Longsword",
      data: { ...dnd5eSrdCompendiumEntry("longsword")!.data, compendiumId: "longsword" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(levelFiveFighterData.features).toEqual(expect.arrayContaining(["Extra Attack", "Tactical Shift"]));
    expect(levelFiveFighterData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2, tacticalShift: { movementFt: 15, opportunityAttacks: false } }));
    expect(dnd5eSrdQuickRolls(levelFiveFighterActor, []).find((roll) => roll.id === "feature-second-wind-healing")).toEqual(
      expect.objectContaining({ formula: "1d10+5", metadata: { tacticalShift: { movementFt: 15, opportunityAttacks: false } } })
    );
    expect(dnd5eSrdQuickRolls(levelFiveFighterActor, [fighterLongsword])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "item-itm_fighter_longsword-damage",
          label: "Longsword Damage",
          formula: "1d8+5",
          metadata: { attacksPerAction: 2, feature: "Extra Attack" }
        })
      ])
    );
    const barbarianActor: Actor = { ...srdActor, data: { ...barbarian!.data } };
    const barbarianSpear: Item = {
      id: "itm_barbarian_spear",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: barbarianActor.id,
      type: "item",
      name: "Spear",
      data: { ...dnd5eSrdCompendiumEntry("spear")!.data, compendiumId: "spear" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(barbarianActor, [barbarianSpear])).toEqual(
      expect.arrayContaining([
        { id: "save-strength", label: "Strength Save", formula: "1d20+5" },
        { id: "skill-athletics", label: "Athletics Check", formula: "1d20+5" },
        { id: "feature-rage", label: "Rage", formula: "0", metadata: expect.objectContaining({ resource: "rage", damageBonus: 2, damageBonusRollId: "feature-rage-damage-bonus" }) },
        { id: "feature-rage-damage-bonus", label: "Rage Damage Bonus", formula: "2", metadata: expect.objectContaining({ bonusDamage: 2, damageType: "Weapon" }) },
        { id: "item-itm_barbarian_spear-damage", label: "Spear Damage", formula: "1d6+3" }
      ])
    );
    expect(dnd5eSrdActionFormula(barbarianActor, [], "feature-rage")).toBe("0");
    expect(dnd5eSrdActionFormula(barbarianActor, [], "feature-rage-damage-bonus")).toBe("2");
    const levelTwoBarbarianData = applyDnd5eSrdAdvancement(barbarianActor, "level-up");
    const levelTwoBarbarianActor: Actor = { ...barbarianActor, data: levelTwoBarbarianData };
    expect(levelTwoBarbarianData.features).toEqual(expect.arrayContaining(["Danger Sense", "Reckless Attack"]));
    expect(dnd5eSrdQuickRolls(levelTwoBarbarianActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "save-dexterity", formula: "1d20+1", metadata: { advantage: true, feature: "Danger Sense", exceptConditions: ["Incapacitated"] } }),
        expect.objectContaining({ id: "feature-reckless-attack", label: "Reckless Attack", formula: "0", metadata: expect.objectContaining({ drawback: "attack rolls against you have Advantage during that time" }) })
      ])
    );
    let levelFiveBarbarianData = barbarianActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveBarbarianData = applyDnd5eSrdAdvancement({ ...barbarianActor, data: levelFiveBarbarianData }, "level-up");
    }
    const levelFiveBarbarianActor: Actor = { ...barbarianActor, data: levelFiveBarbarianData };
    expect(levelFiveBarbarianData.features).toEqual(expect.arrayContaining(["Rage", "Danger Sense", "Reckless Attack", "Extra Attack", "Fast Movement"]));
    expect(levelFiveBarbarianData.resources).toEqual({ rage: { current: 2, max: 3, recovery: "short" } });
    expect(levelFiveBarbarianData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2, fastMovement: { bonusFt: 10, armorRestriction: "not wearing Heavy armor" } }));
    expect(dnd5eSrdQuickRolls(levelFiveBarbarianActor, [barbarianSpear])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-rage-damage-bonus", formula: "2", metadata: expect.objectContaining({ bonusDamage: 2 }) }),
        expect.objectContaining({
          id: "item-itm_barbarian_spear-damage",
          label: "Spear Damage",
          formula: "1d6+5",
          metadata: { attacksPerAction: 2, feature: "Extra Attack" }
        })
      ])
    );
    const bardActor: Actor = { ...srdActor, data: { ...bard!.data } };
    const bardHealingWord: Item = {
      id: "itm_bard_healing_word",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: bardActor.id,
      type: "spell",
      name: "Healing Word",
      data: { ...dnd5eSrdCompendiumEntry("healing-word")!.data, compendiumId: "healing-word" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const bardDagger: Item = {
      id: "itm_bard_dagger",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: bardActor.id,
      type: "item",
      name: "Dagger",
      data: { ...dnd5eSrdCompendiumEntry("dagger")!.data, compendiumId: "dagger" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(bardActor, [bardHealingWord, bardDagger])).toEqual(
      expect.arrayContaining([
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+5" },
        { id: "save-dexterity", label: "Dexterity Save", formula: "1d20+4" },
        { id: "skill-performance", label: "Performance Check", formula: "1d20+5" },
        expect.objectContaining({ id: "feature-bardic-inspiration", label: "Bardic Inspiration", formula: "1d6", metadata: expect.objectContaining({ resource: "bardicInspiration", die: "d6", recovery: "long" }) }),
        { id: "spell-itm_bard_healing_word-healing", label: "Healing Word Healing", formula: "1d4+3" },
        { id: "item-itm_bard_dagger-damage", label: "Dagger Damage", formula: "1d4+2" }
      ])
    );
    expect(dnd5eSrdActionFormula(bardActor, [], "feature-bardic-inspiration")).toBe("1d6");
    const levelTwoBardData = applyDnd5eSrdAdvancement(bardActor, "level-up");
    const levelTwoBardActor: Actor = { ...bardActor, data: levelTwoBardData };
    expect(levelTwoBardData.features).toEqual(expect.arrayContaining(["Expertise", "Jack of All Trades"]));
    expect(dnd5eSrdQuickRolls(levelTwoBardActor, []).find((roll) => roll.id === "skill-athletics")).toEqual(
      expect.objectContaining({ formula: "1d20+0", metadata: { feature: "Jack of All Trades", bonus: 1 } })
    );
    let levelFiveBardData = bardActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveBardData = applyDnd5eSrdAdvancement({ ...bardActor, data: levelFiveBardData }, "level-up");
    }
    const levelFiveBardActor: Actor = { ...bardActor, data: levelFiveBardData };
    expect(levelFiveBardData.features).toEqual(expect.arrayContaining(["Bardic Inspiration", "Jack of All Trades", "Font of Inspiration"]));
    expect(levelFiveBardData.resources).toEqual({ bardicInspiration: { current: 3, max: 5, recovery: "short" } });
    expect(levelFiveBardData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 3, recovery: "long" },
      level3: { current: 2, max: 2, recovery: "long" }
    });
    expect(dnd5eSrdQuickRolls(levelFiveBardActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-bardic-inspiration", label: "Bardic Inspiration", formula: "1d8", metadata: expect.objectContaining({ die: "d8", recovery: "short" }) }),
        expect.objectContaining({ id: "feature-font-of-inspiration", label: "Font of Inspiration", formula: "0", metadata: expect.objectContaining({ resource: "bardicInspiration" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveBardActor, [], "feature-bardic-inspiration")).toBe("1d8");
    expect(dnd5eSrdActionFormula(levelFiveBardActor, [], "feature-font-of-inspiration")).toBe("0");
    const paladinActor: Actor = { ...srdActor, data: { ...paladin!.data } };
    const paladinLongsword: Item = {
      id: "itm_paladin_longsword",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: paladinActor.id,
      type: "item",
      name: "Longsword",
      data: { ...dnd5eSrdCompendiumEntry("longsword")!.data, compendiumId: "longsword" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(paladinActor, [paladinLongsword])).toEqual(
      expect.arrayContaining([
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+4" },
        { id: "skill-athletics", label: "Athletics Check", formula: "1d20+5" },
        expect.objectContaining({ id: "feature-lay-on-hands-healing", label: "Lay On Hands Healing", formula: "5", metadata: expect.objectContaining({ resource: "layOnHands", pool: 5, chooseAmount: true }) }),
        { id: "item-itm_paladin_longsword-damage", label: "Longsword Damage", formula: "1d8+3" }
      ])
    );
    expect(dnd5eSrdActionFormula(paladinActor, [], "feature-lay-on-hands-healing")).toBe("5");
    expect(dnd5eSrdActionFormula(paladinActor, [], "feature-lay-on-hands-healing", { resourceAmount: 3 })).toBe("3");
    let levelFivePaladinData = paladinActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFivePaladinData = applyDnd5eSrdAdvancement({ ...paladinActor, data: levelFivePaladinData }, "level-up");
    }
    const levelFivePaladinActor: Actor = { ...paladinActor, data: levelFivePaladinData };
    expect(levelFivePaladinData.features).toEqual(expect.arrayContaining(["Lay On Hands", "Paladin's Smite", "Extra Attack", "Faithful Steed"]));
    expect(levelFivePaladinData.resources).toEqual({
      layOnHands: { current: 5, max: 25, recovery: "long" },
      paladinsSmite: { current: 1, max: 1, recovery: "long" },
      faithfulSteed: { current: 1, max: 1, recovery: "long" }
    });
    expect(levelFivePaladinData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 2, recovery: "long" }
    });
    expect(levelFivePaladinData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2 }));
    expect(dnd5eSrdQuickRolls(levelFivePaladinActor, [paladinLongsword])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-divine-smite-damage", label: "Divine Smite Damage", formula: "2d8", metadata: expect.objectContaining({ freeCastResource: "paladinsSmite", creatureTypeBonus: { types: ["Fiend", "Undead"], formula: "1d8" } }) }),
        expect.objectContaining({ id: "feature-faithful-steed", label: "Faithful Steed", formula: "0", metadata: expect.objectContaining({ resource: "faithfulSteed", spell: "Find Steed" }) }),
        expect.objectContaining({ id: "item-itm_paladin_longsword-damage", formula: "1d8+3", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFivePaladinActor, [], "feature-divine-smite-damage", { spellSlotLevel: 2 })).toBe("3d8");
    const druidActor: Actor = { ...srdActor, data: { ...druid!.data } };
    const druidCureWounds: Item = {
      id: "itm_druid_cure_wounds",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: druidActor.id,
      type: "spell",
      name: "Cure Wounds",
      data: { ...dnd5eSrdCompendiumEntry("cure-wounds")!.data, compendiumId: "cure-wounds" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(druidActor, [druidCureWounds])).toEqual(
      expect.arrayContaining([
        { id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" },
        { id: "skill-nature", label: "Nature Check", formula: "1d20+3" },
        { id: "skill-survival", label: "Survival Check", formula: "1d20+5" },
        { id: "spell-itm_druid_cure_wounds-healing", label: "Cure Wounds Healing", formula: "2d8+3" }
      ])
    );
    let levelFiveDruidData = druidActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveDruidData = applyDnd5eSrdAdvancement({ ...druidActor, data: levelFiveDruidData }, "level-up");
    }
    const levelFiveDruidActor: Actor = { ...druidActor, data: levelFiveDruidData };
    expect(levelFiveDruidData.features).toEqual(expect.arrayContaining(["Wild Shape", "Wild Companion", "Druid Subclass", "Wild Resurgence"]));
    expect(levelFiveDruidData.resources).toEqual({
      wildShape: { current: 2, max: 2, recovery: "short" },
      wildResurgence: { current: 1, max: 1, recovery: "long" }
    });
    expect(levelFiveDruidData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 3, recovery: "long" },
      level3: { current: 2, max: 2, recovery: "long" }
    });
    expect(dnd5eSrdQuickRolls(levelFiveDruidActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-wild-shape", label: "Wild Shape", formula: "0", metadata: expect.objectContaining({ resource: "wildShape", maxUses: 2, knownForms: 6, maxChallengeRating: "1/2", temporaryHitPoints: 5 }) }),
        expect.objectContaining({ id: "feature-wild-companion", label: "Wild Companion", formula: "0", metadata: expect.objectContaining({ spell: "Find Familiar", resource: "wildShape" }) }),
        expect.objectContaining({ id: "feature-wild-resurgence-wild-shape", label: "Wild Resurgence: Wild Shape", formula: "0", metadata: expect.objectContaining({ restores: "wildShape", cost: "spell slot" }) }),
        expect.objectContaining({ id: "feature-wild-resurgence-spell-slot", label: "Wild Resurgence: Spell Slot", formula: "0", metadata: expect.objectContaining({ resource: "wildResurgence", restores: "level1 spell slot" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-shape")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-companion")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-resurgence-wild-shape")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-resurgence-spell-slot")).toBe("0");
    const rangerActor: Actor = { ...srdActor, data: { ...ranger!.data } };
    const rangerLongbow: Item = {
      id: "itm_ranger_longbow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: rangerActor.id,
      type: "item",
      name: "Longbow",
      data: { ...dnd5eSrdCompendiumEntry("longbow")!.data, compendiumId: "longbow" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(rangerActor, [rangerLongbow])).toEqual(
      expect.arrayContaining([
        { id: "save-strength", label: "Strength Save", formula: "1d20+2" },
        { id: "save-dexterity", label: "Dexterity Save", formula: "1d20+5" },
        { id: "skill-perception", label: "Perception Check", formula: "1d20+4" },
        { id: "skill-survival", label: "Survival Check", formula: "1d20+4" },
        expect.objectContaining({ id: "feature-hunters-mark-damage", label: "Hunter's Mark Damage", formula: "1d6", metadata: expect.objectContaining({ resource: "favoredEnemy", freeUses: 2, damageType: "Force" }) }),
        { id: "item-itm_ranger_longbow-damage", label: "Longbow Damage", formula: "1d8+3" }
      ])
    );
    expect(dnd5eSrdActionFormula(rangerActor, [], "feature-hunters-mark-damage")).toBe("1d6");
    let levelFiveRangerData = rangerActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveRangerData = applyDnd5eSrdAdvancement({ ...rangerActor, data: levelFiveRangerData }, "level-up");
    }
    const levelFiveRangerActor: Actor = { ...rangerActor, data: levelFiveRangerData };
    expect(levelFiveRangerData.features).toEqual(expect.arrayContaining(["Favored Enemy", "Deft Explorer", "Fighting Style", "Ranger Subclass", "Extra Attack"]));
    expect(levelFiveRangerData.resources).toEqual({ favoredEnemy: { current: 2, max: 3, recovery: "long" } });
    expect(levelFiveRangerData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 2, recovery: "long" }
    });
    expect(levelFiveRangerData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2 }));
    expect(dnd5eSrdQuickRolls(levelFiveRangerActor, [rangerLongbow])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-hunters-mark-damage", formula: "1d6", metadata: expect.objectContaining({ freeUses: 3, upcastDuration: { level3: "up to 8 hours", level5: "up to 24 hours" } }) }),
        expect.objectContaining({ id: "item-itm_ranger_longbow-damage", formula: "1d8+3", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
      ])
    );
    const monkActor: Actor = { ...srdActor, data: { ...monk!.data } };
    const monkSpear: Item = {
      id: "itm_monk_spear",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: monkActor.id,
      type: "item",
      name: "Spear",
      data: { ...dnd5eSrdCompendiumEntry("spear")!.data, compendiumId: "spear" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdSheet(monkActor, [monkSpear]).data).toEqual(expect.objectContaining({ armorClass: 15, armorClassDetails: expect.objectContaining({ armorName: "Unarmored Defense", value: 15 }) }));
    expect(dnd5eSrdQuickRolls(monkActor, [monkSpear])).toEqual(
      expect.arrayContaining([
        { id: "save-strength", label: "Strength Save", formula: "1d20+2" },
        { id: "save-dexterity", label: "Dexterity Save", formula: "1d20+5" },
        { id: "skill-acrobatics", label: "Acrobatics Check", formula: "1d20+5" },
        { id: "skill-stealth", label: "Stealth Check", formula: "1d20+5" },
        { id: "tool-musical-instrument", label: "Musical Instrument Check", formula: "1d20+2" },
        expect.objectContaining({ id: "feature-martial-arts-damage", label: "Martial Arts Damage", formula: "1d6+3", metadata: expect.objectContaining({ martialArtsDie: "d6", dexterousAttacks: true }) }),
        expect.objectContaining({ id: "item-itm_monk_spear-damage", label: "Spear Damage", formula: "1d6+3", metadata: expect.objectContaining({ martialArts: { die: "d6", dexterousAttacks: true } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(monkActor, [monkSpear], "feature-martial-arts-damage")).toBe("1d6+3");
    expect(dnd5eSrdActionFormula(monkActor, [monkSpear], "item-itm_monk_spear-damage")).toBe("1d6+3");
    let levelFiveMonkData = monkActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveMonkData = applyDnd5eSrdAdvancement({ ...monkActor, data: levelFiveMonkData }, "level-up");
    }
    const levelFiveMonkActor: Actor = { ...monkActor, data: levelFiveMonkData };
    expect(levelFiveMonkData.features).toEqual(expect.arrayContaining(["Monk's Focus", "Flurry of Blows", "Patient Defense", "Step of the Wind", "Uncanny Metabolism", "Deflect Attacks", "Monk Subclass", "Extra Attack", "Stunning Strike"]));
    expect(levelFiveMonkData.resources).toEqual({
      focus: { current: 2, max: 5, recovery: "short" },
      uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
    });
    expect(levelFiveMonkData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2, unarmoredMovement: { bonusFt: 10, armorRestriction: "not wearing armor or wielding a Shield" } }));
    expect(dnd5eSrdQuickRolls(levelFiveMonkActor, [monkSpear])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-martial-arts-damage", formula: "1d8+5", metadata: expect.objectContaining({ martialArtsDie: "d8" }) }),
        expect.objectContaining({ id: "feature-flurry-of-blows", formula: "0", metadata: expect.objectContaining({ resource: "focus", unarmedStrikes: 2 }) }),
        expect.objectContaining({ id: "feature-patient-defense", formula: "0", metadata: expect.objectContaining({ resource: "focus", focusedAction: ["Disengage", "Dodge"] }) }),
        expect.objectContaining({ id: "feature-step-of-the-wind", formula: "0", metadata: expect.objectContaining({ resource: "focus", jumpDistance: "doubled for the turn" }) }),
        expect.objectContaining({ id: "feature-uncanny-metabolism-healing", formula: "1d8+5", metadata: expect.objectContaining({ resource: "uncannyMetabolism", focusRestoredTo: 5 }) }),
        expect.objectContaining({ id: "feature-deflect-attacks-damage", formula: "2d8+5", metadata: expect.objectContaining({ resource: "focus", reductionFormula: "1d10+5+5", save: { ability: "dexterity", dc: 13 } }) }),
        expect.objectContaining({ id: "feature-stunning-strike", formula: "0", metadata: expect.objectContaining({ resource: "focus", save: { ability: "constitution", dc: 13 } }) }),
        expect.objectContaining({ id: "item-itm_monk_spear-damage", formula: "1d8+5", metadata: expect.objectContaining({ attacksPerAction: 2, feature: "Extra Attack", martialArts: { die: "d8", dexterousAttacks: true } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveMonkActor, [monkSpear], "feature-deflect-attacks-damage")).toBe("2d8+5");
    expect(dnd5eSrdActionFormula(levelFiveMonkActor, [monkSpear], "feature-uncanny-metabolism-healing")).toBe("1d8+5");
    const sorcererActor: Actor = { ...srdActor, data: { ...sorcerer!.data } };
    const sorcerousBurst: Item = {
      id: "itm_sorcerous_burst",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: sorcererActor.id,
      type: "spell",
      name: "Sorcerous Burst",
      data: { ...dnd5eSrdCompendiumEntry("sorcerous-burst")!.data, compendiumId: "sorcerous-burst" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const sorcererChromaticOrb: Item = {
      id: "itm_sorcerer_chromatic_orb",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: sorcererActor.id,
      type: "spell",
      name: "Chromatic Orb",
      data: { ...dnd5eSrdCompendiumEntry("chromatic-orb")!.data, compendiumId: "chromatic-orb" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(sorcererActor, [sorcerousBurst, sorcererChromaticOrb])).toEqual(
      expect.arrayContaining([
        { id: "save-constitution", label: "Constitution Save", formula: "1d20+4" },
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+5" },
        { id: "skill-arcana", label: "Arcana Check", formula: "1d20+2" },
        { id: "skill-persuasion", label: "Persuasion Check", formula: "1d20+5" },
        { id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+4" },
        expect.objectContaining({ id: "feature-innate-sorcery", label: "Innate Sorcery", formula: "0", metadata: expect.objectContaining({ resource: "innateSorcery", spellSaveDc: 14, spellAttackAdvantage: true }) }),
        { id: "spell-itm_sorcerous_burst-damage", label: "Sorcerous Burst Damage", formula: "1d8" },
        { id: "spell-itm_sorcerer_chromatic_orb-damage", label: "Chromatic Orb Damage", formula: "3d8" }
      ])
    );
    expect(dnd5eSrdActionFormula(sorcererActor, [], "feature-innate-sorcery")).toBe("0");
    let levelFiveSorcererData = sorcererActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveSorcererData = applyDnd5eSrdAdvancement({ ...sorcererActor, data: levelFiveSorcererData }, "level-up");
    }
    const levelFiveSorcererActor: Actor = { ...sorcererActor, data: levelFiveSorcererData };
    expect(levelFiveSorcererData.features).toEqual(expect.arrayContaining(["Font of Magic", "Metamagic", "Sorcerer Subclass", "Ability Score Improvement", "Sorcerous Restoration"]));
    expect(levelFiveSorcererData.resources).toEqual({
      innateSorcery: { current: 2, max: 2, recovery: "long" },
      sorceryPoints: { current: 2, max: 5, recovery: "long" },
      sorcerousRestoration: { current: 1, max: 1, recovery: "long" }
    });
    expect(levelFiveSorcererData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 3, recovery: "long" },
      level3: { current: 2, max: 2, recovery: "long" }
    });
    expect(dnd5eSrdQuickRolls(levelFiveSorcererActor, [sorcerousBurst, sorcererChromaticOrb])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-innate-sorcery", metadata: expect.objectContaining({ spellSaveDc: 17 }) }),
        expect.objectContaining({ id: "feature-convert-spell-slot-to-sorcery-points", metadata: expect.objectContaining({ max: 5, availableSlotLevels: [1, 2, 3] }) }),
        expect.objectContaining({ id: "feature-create-spell-slot", metadata: expect.objectContaining({ availableSlotLevels: [1, 2, 3] }) }),
        expect.objectContaining({ id: "feature-metamagic-empowered-spell", metadata: expect.objectContaining({ cost: 1, rerollDamageDiceUpTo: 5 }) }),
        expect.objectContaining({ id: "feature-metamagic-quickened-spell", metadata: expect.objectContaining({ cost: 2, castingTime: "Bonus Action" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveSorcererActor, [], "feature-metamagic-quickened-spell")).toBe("0");
    const rogueActor: Actor = { ...srdActor, data: { ...rogue!.data } };
    const rogueDagger: Item = {
      id: "itm_rogue_dagger",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: rogueActor.id,
      type: "item",
      name: "Dagger",
      data: { ...dnd5eSrdCompendiumEntry("dagger")!.data, compendiumId: "dagger" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdQuickRolls(rogueActor, [rogueDagger])).toEqual(
      expect.arrayContaining([
        { id: "save-dexterity", label: "Dexterity Save", formula: "1d20+5" },
        { id: "skill-stealth", label: "Stealth Check", formula: "1d20+7" },
        { id: "tool-thieves-tools", label: "Thieves' Tools Check", formula: "1d20+5" },
        expect.objectContaining({ id: "feature-sneak-attack-damage", label: "Sneak Attack Damage", formula: "1d6", metadata: expect.objectContaining({ limit: "once per turn" }) }),
        { id: "item-itm_rogue_dagger-damage", label: "Dagger Damage", formula: "1d4+3" }
      ])
    );
    expect(dnd5eSrdActionFormula(rogueActor, [], "feature-sneak-attack-damage")).toBe("1d6");
    let levelFiveRogueData = rogueActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveRogueData = applyDnd5eSrdAdvancement({ ...rogueActor, data: levelFiveRogueData }, "level-up");
    }
    const levelFiveRogueActor: Actor = { ...rogueActor, data: levelFiveRogueData };
    expect(levelFiveRogueData.features).toEqual(expect.arrayContaining(["Cunning Action", "Steady Aim", "Cunning Strike", "Uncanny Dodge"]));
    expect(dnd5eSrdQuickRolls(levelFiveRogueActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-sneak-attack-damage", formula: "3d6", metadata: expect.objectContaining({ cunningStrike: expect.objectContaining({ saveDc: 16, reducedSneakAttackFormula: "2d6" }) }) }),
        expect.objectContaining({ id: "feature-cunning-strike", label: "Cunning Strike", formula: "0", metadata: expect.objectContaining({ saveDc: 16, sneakAttackDice: 3 }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveRogueActor, [], "feature-cunning-strike")).toBe("0");
    expect(dnd5eSrdSheet(srdActor, [spell]).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" },
        { id: "skill-medicine", label: "Medicine Check", formula: "1d20+5" },
        { id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+3" }
      ])
    );
    const poisonedActor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "poisoned" }] } };
    expect(dnd5eSrdQuickRolls(poisonedActor, []).find((roll) => roll.id === "skill-medicine")?.formula).toBe("2d20kl1+5");
    expect(dnd5eSrdQuickRolls(poisonedActor, []).find((roll) => roll.id === "tool-calligraphers-supplies")?.formula).toBe("2d20kl1+3");
    expect(dnd5eSrdActionFormula(srdActor, [spell], "spell-itm_healing_word-healing", { spellSlotLevel: 2 })).toBe("1d4+3+2d4");
    expect(dnd5eSrdActionFormula(srdActor, [chromaticOrb], "spell-itm_chromatic_orb-damage", { spellSlotLevel: 2 })).toBe("3d8+1d8");
    expect(dnd5eSrdActionFormula(srdActor, [iceKnife], "spell-itm_ice_knife-secondary-damage", { spellSlotLevel: 2 })).toBe("2d6+1d6");

    const purchased = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("longsword")!, 2);
    expect(purchased).toEqual(expect.objectContaining({ entryId: "longsword", quantity: 2, unitCostGp: 15, totalCostGp: 30, currency: { gp: 20, sp: 0, cp: 0 } }));
    expect(purchased.itemData).toEqual(expect.objectContaining({ compendiumId: "longsword", quantity: 2, purchasedForGp: 30 }));
    const purchasedShortbow = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("shortbow")!, 1);
    expect(purchasedShortbow).toEqual(expect.objectContaining({ entryId: "shortbow", quantity: 1, unitCostGp: 25, totalCostGp: 25, currency: { gp: 25, sp: 0, cp: 0 } }));
    expect(purchasedShortbow.itemData).toEqual(expect.objectContaining({ compendiumId: "shortbow", quantity: 1, purchasedForGp: 25, damage: "1d6" }));
    const purchasedLeather = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("leather-armor")!, 1);
    expect(purchasedLeather).toEqual(expect.objectContaining({ entryId: "leather-armor", quantity: 1, unitCostGp: 10, totalCostGp: 10, currency: { gp: 40, sp: 0, cp: 0 } }));
    expect(purchasedLeather.itemData).toEqual(expect.objectContaining({ compendiumId: "leather-armor", quantity: 1, purchasedForGp: 10, armorBase: 11 }));
    expect(() => dnd5eSrdEquipmentPurchase({ ...srdActor, data: { ...srdActor.data, currency: { gp: 1 } } }, dnd5eSrdCompendiumEntry("longsword")!, 1)).toThrow("Insufficient currency");
    expect(() => dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("magic-initiate")!, 1)).toThrow("not purchasable");
  });

  it("automates SRD Warlock Pact Magic, Magical Cunning, and invocation metadata", () => {
    const template = dnd5eSrdCharacterTemplate("warlock")!;
    const warlockActor: Actor = { ...srdActor, data: { ...template.data } };
    const eldritchBlast: Item = {
      id: "itm_eldritch_blast",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: warlockActor.id,
      type: "spell",
      name: "Eldritch Blast",
      data: { ...dnd5eSrdCompendiumEntry("eldritch-blast")!.data, compendiumId: "eldritch-blast" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const hex: Item = {
      id: "itm_hex",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: warlockActor.id,
      type: "spell",
      name: "Hex",
      data: { ...dnd5eSrdCompendiumEntry("hex")!.data, compendiumId: "hex" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };

    expect(dnd5eSrdQuickRolls(warlockActor, [eldritchBlast, hex])).toEqual(
      expect.arrayContaining([
        { id: "save-wisdom", label: "Wisdom Save", formula: "1d20+2" },
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+5" },
        { id: "skill-intimidation", label: "Intimidation Check", formula: "1d20+5" },
        expect.objectContaining({ id: "feature-eldritch-invocations", label: "Eldritch Invocations", formula: "0", metadata: expect.objectContaining({ known: 1, pactOptions: ["Pact of the Blade", "Pact of the Chain", "Pact of the Tome"] }) }),
        { id: "spell-itm_eldritch_blast-damage", label: "Eldritch Blast Damage", formula: "1d10" },
        { id: "spell-itm_hex-damage", label: "Hex Damage", formula: "1d6" }
      ])
    );

    let levelFiveWarlockData = warlockActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveWarlockData = applyDnd5eSrdAdvancement({ ...warlockActor, data: levelFiveWarlockData }, "level-up");
    }
    const levelFiveWarlockActor: Actor = { ...warlockActor, data: levelFiveWarlockData };
    expect(levelFiveWarlockData.features).toEqual(expect.arrayContaining(["Eldritch Invocations", "Pact Magic", "Magical Cunning", "Warlock Subclass", "Ability Score Improvement"]));
    expect(levelFiveWarlockData.resources).toEqual({ magicalCunning: { current: 1, max: 1, recovery: "long" } });
    expect(levelFiveWarlockData.spellSlots).toEqual({ level3: { current: 2, max: 2, recovery: "short" } });
    expect(dnd5eSrdQuickRolls(levelFiveWarlockActor, [hex])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-eldritch-invocations", formula: "0", metadata: expect.objectContaining({ known: 5 }) }),
        expect.objectContaining({ id: "feature-magical-cunning", formula: "0", metadata: expect.objectContaining({ maxRecoveredSlots: 1, pactMagic: { slotLevel: 3, maxSlots: 2, recovery: "short" } }) })
      ])
    );

    const hexUsage = useDnd5eSrdAction(levelFiveWarlockActor, [hex], "spell-itm_hex-damage");
    expect(hexUsage).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 3,
        consumed: [{ type: "spellSlot", key: "level3", label: "Level 3 Spell Slot", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ spellSlots: { level3: { current: 1, max: 2, recovery: "short" } } })
      })
    );

    const cunningActor: Actor = { ...levelFiveWarlockActor, data: { ...levelFiveWarlockData, spellSlots: { level3: { current: 0, max: 2, recovery: "short" } } } };
    const magicalCunning = useDnd5eSrdAction(cunningActor, [], "feature-magical-cunning");
    expect(magicalCunning).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "magicalCunning", label: "Magical Cunning", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: { magicalCunning: { current: 0, max: 1, recovery: "long" } },
          spellSlots: { level3: { current: 1, max: 2, recovery: "short" } }
        })
      })
    );
    expect(() => useDnd5eSrdAction({ ...cunningActor, data: { ...cunningActor.data, resources: { magicalCunning: { current: 0, max: 1, recovery: "long" } } } }, [], "feature-magical-cunning")).toThrow("Insufficient magical cunning");

    expect(applyDnd5eSrdRest(cunningActor, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ spellSlots: { level3: 2 } }),
        data: expect.objectContaining({
          resources: { magicalCunning: { current: 1, max: 1, recovery: "long" } },
          spellSlots: { level3: { current: 2, max: 2, recovery: "short" } }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...cunningActor, data: { ...cunningActor.data, resources: { magicalCunning: { current: 0, max: 1, recovery: "long" } } } }, "long").data).toEqual(
      expect.objectContaining({
        resources: { magicalCunning: { current: 1, max: 1, recovery: "long" } },
        spellSlots: { level3: { current: 2, max: 2, recovery: "short" } }
      })
    );
  });

  it("applies SRD character origin choices to template actors", () => {
    const origins = dnd5eSrdCharacterOrigins();
    expect(origins.backgrounds.map((background) => background.id)).toEqual(["acolyte", "criminal", "sage", "soldier"]);
    expect(origins.species.map((species) => species.id)).toEqual(["dragonborn", "dwarf", "elf", "gnome", "goliath", "halfling", "human", "orc", "tiefling"]);
    expect(dnd5eSrdCompendiumEntry("alert")).toEqual(expect.objectContaining({ name: "Alert" }));
    expect(dnd5eSrdCompendiumEntry("thieves-tools")?.data).toEqual(expect.objectContaining({ toolId: "thieves-tools", costGp: 25 }));

    const built = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, {
      backgroundId: "criminal",
      speciesId: "orc",
      abilityScoreIncreases: { dexterity: 2, constitution: 1 }
    });
    expect(built.background).toEqual(expect.objectContaining({ id: "criminal", feat: "Alert" }));
    expect(built.species).toEqual(expect.objectContaining({ id: "orc", speed: 30, traits: expect.arrayContaining(["Adrenaline Rush", "Relentless Endurance"]) }));
    expect(built.data).toEqual(
      expect.objectContaining({
        background: "Criminal",
        species: "Orc",
        skillProficiencies: ["sleight-of-hand", "stealth"],
        toolProficiencies: ["thieves-tools"],
        feats: ["Alert"],
        currency: { gp: 50, sp: 0, cp: 0 },
        senses: ["Darkvision 120 ft."]
      })
    );
    expect(built.data.origin).toEqual(expect.objectContaining({ backgroundId: "criminal", speciesId: "orc", abilityScoreIncreases: { dexterity: 2, constitution: 1 } }));
    expect(built.data.attributes).toEqual(expect.objectContaining({ dexterity: 16, constitution: 15 }));
    expect(built.data.resources).toEqual(expect.objectContaining({ adrenalineRush: { current: 2, max: 2, recovery: "short" }, relentlessEndurance: { current: 1, max: 1, recovery: "long" } }));
    const actor: Actor = { ...srdActor, data: built.data };
    expect(dnd5eSrdSheet(actor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "skill-stealth", label: "Stealth Check", formula: "1d20+5" },
        { id: "tool-thieves-tools", label: "Thieves' Tools Check", formula: "1d20+5" }
      ])
    );
    expect(() =>
      dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, {
        backgroundId: "criminal",
        abilityScoreIncreases: { strength: 2, constitution: 1 }
      })
    ).toThrow("Criminal ability increases");
  });

  it("uses SRD system ids for advancement, rests, actions, imports, and encounter planning", () => {
    expect(dnd5eSrdAdvancementOptions(srdActor)).toContainEqual(expect.objectContaining({ systemId: "dnd-5e-srd", id: "level-up" }));
    const advanced = applyDnd5eSrdAdvancement(srdActor, "level-up");
    expect(advanced).toEqual(expect.objectContaining({ ruleset: "SRD 5.2.1", level: 2 }));
    expect((advanced.attributes as Record<string, number>).wisdom).toBe(17);
    expect(applyDnd5eSrdRest(srdActor, "long")).toEqual(expect.objectContaining({ systemId: "dnd-5e-srd" }));
    expect(dnd5eSrdEncounterThreats().map((threat) => threat.id)).toContain("goblin-minion");
    expect(dnd5eSrdEncounterThreats()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "goblin-boss", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 17, hitPoints: 21, xp: 200 }) }),
        expect.objectContaining({ id: "tough-boss", budget: 1100, challengeRating: "4", data: expect.objectContaining({ actions: expect.arrayContaining([expect.objectContaining({ name: "Warhammer" })]) }) })
      ])
    );
    expect(dnd5eSrdEncounterXpBudgets([{ ...srdActor, data: { ...srdActor.data, level: 2 } }])).toEqual({ easy: 100, standard: 150, hard: 200 });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 2 } }], [{ id: "goblin-boss", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 200,
      threatBudget: 200,
      difficulty: "hard",
      difficultyBudgets: { easy: 100, standard: 150, hard: 200 },
      threats: [expect.objectContaining({ id: "goblin-boss", budgetEach: 200, budgetTotal: 200, challengeRating: "1" })]
    });
    const goblinBossActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Goblin Boss",
      data: dnd5eSrdMonsterActorData("goblin-boss")!
    };
    expect(goblinBossActor.data).toEqual(expect.objectContaining({ hp: { current: 21, max: 21 }, armorClass: 17, challengeRating: "1", xp: 200 }));
    expect(dnd5eSrdSheet(goblinBossActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-scimitar-attack", label: "Scimitar Attack", formula: "1d20+4" },
        { id: "monster-scimitar-damage", label: "Scimitar Damage", formula: "1d6+2" },
        { id: "monster-shortbow-attack", label: "Shortbow Attack", formula: "1d20+4" },
        { id: "monster-shortbow-damage", label: "Shortbow Damage", formula: "1d6+2" }
      ])
    );

    const spell: Item = {
      id: "itm_cure_wounds",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Cure Wounds",
      data: { level: 1, healingFormula: "2d8+@attributes.wisdom", upcastFormula: "2d8", compendiumId: "cure-wounds" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdActionFormula(srdActor, [spell], `spell-${spell.id}-healing`, { spellSlotLevel: 2 })).toBe("2d8+3+2d8");
    expect(useDnd5eSrdAction(srdActor, [spell], `spell-${spell.id}-healing`, { spellSlotLevel: 2 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 0 }]
      })
    );
    const clericActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("cleric")!.data } };
    const levelTwoClericActor: Actor = { ...clericActor, data: applyDnd5eSrdAdvancement(clericActor, "level-up") };
    expect(useDnd5eSrdAction(levelTwoClericActor, [], "feature-divine-spark-healing")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { channelDivinity: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(useDnd5eSrdAction(levelTwoClericActor, [], "feature-turn-undead")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }]
      })
    );
    expect(() =>
      useDnd5eSrdAction({ ...levelTwoClericActor, data: { ...levelTwoClericActor.data, resources: { channelDivinity: { current: 0, max: 2, recovery: "short" } } } }, [], "feature-divine-spark-damage")
    ).toThrow("Insufficient channel divinity");
    let levelFiveClericData = clericActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelFiveClericData }, "level-up");
    }
    expect(useDnd5eSrdAction({ ...clericActor, data: levelFiveClericData }, [], "feature-sear-undead-damage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ resources: { channelDivinity: { current: 2, max: 2, recovery: "short" } } })
      })
    );
    const paladinActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("paladin")!.data } };
    const layOnHands = useDnd5eSrdAction(paladinActor, [], "feature-lay-on-hands-healing", { resourceAmount: 3 });
    expect(layOnHands).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "layOnHands", label: "Lay On Hands", amount: 3, remaining: 2 }],
        data: expect.objectContaining({ resources: { layOnHands: { current: 2, max: 5, recovery: "long" } } })
      })
    );
    expect(() => useDnd5eSrdAction({ ...paladinActor, data: layOnHands.data }, [], "feature-lay-on-hands-healing", { resourceAmount: 3 })).toThrow("Insufficient lay on hands");
    let levelFivePaladinData = paladinActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFivePaladinData = applyDnd5eSrdAdvancement({ ...paladinActor, data: levelFivePaladinData }, "level-up");
    }
    const levelFivePaladinActor: Actor = { ...paladinActor, data: levelFivePaladinData };
    expect(useDnd5eSrdAction(levelFivePaladinActor, [], "feature-divine-smite-damage", { spellSlotLevel: 2 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 1, max: 2, recovery: "long" }
          }
        })
      })
    );
    expect(useDnd5eSrdAction(levelFivePaladinActor, [], "feature-divine-smite-damage", { useFreeResource: true })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "resource", key: "paladinsSmite", label: "Paladin's Smite", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: {
            layOnHands: { current: 5, max: 25, recovery: "long" },
            paladinsSmite: { current: 0, max: 1, recovery: "long" },
            faithfulSteed: { current: 1, max: 1, recovery: "long" }
          }
        })
      })
    );
    const faithfulSteed = useDnd5eSrdAction(levelFivePaladinActor, [], "feature-faithful-steed");
    expect(faithfulSteed.consumed).toEqual([{ type: "resource", key: "faithfulSteed", label: "Faithful Steed", amount: 1, remaining: 0 }]);
    const paladinLongRest = applyDnd5eSrdRest(
      {
        ...levelFivePaladinActor,
        data: {
          ...levelFivePaladinData,
          resources: {
            layOnHands: { current: 0, max: 25, recovery: "long" },
            paladinsSmite: { current: 0, max: 1, recovery: "long" },
            faithfulSteed: { current: 0, max: 1, recovery: "long" }
          },
          spellSlots: {
            level1: { current: 0, max: 4, recovery: "long" },
            level2: { current: 0, max: 2, recovery: "long" }
          }
        }
      },
      "long"
    );
    expect(paladinLongRest.data.resources).toEqual({
      layOnHands: { current: 25, max: 25, recovery: "long" },
      paladinsSmite: { current: 1, max: 1, recovery: "long" },
      faithfulSteed: { current: 1, max: 1, recovery: "long" }
    });
    expect(paladinLongRest.data.spellSlots).toEqual({
      level1: { current: 4, max: 4, recovery: "long" },
      level2: { current: 2, max: 2, recovery: "long" }
    });
    const rangerActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("ranger")!.data } };
    let levelFiveRangerData = rangerActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveRangerData = applyDnd5eSrdAdvancement({ ...rangerActor, data: levelFiveRangerData }, "level-up");
    }
    const levelFiveRangerActor: Actor = { ...rangerActor, data: levelFiveRangerData };
    expect(useDnd5eSrdAction(levelFiveRangerActor, [], "feature-hunters-mark-damage", { useFreeResource: true })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "resource", key: "favoredEnemy", label: "Favored Enemy", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { favoredEnemy: { current: 1, max: 3, recovery: "long" } } })
      })
    );
    expect(useDnd5eSrdAction(levelFiveRangerActor, [], "feature-hunters-mark-damage", { spellSlotLevel: 2 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          spellSlots: {
            level1: { current: 2, max: 4, recovery: "long" },
            level2: { current: 1, max: 2, recovery: "long" }
          }
        })
      })
    );
    expect(() => useDnd5eSrdAction({ ...levelFiveRangerActor, data: { ...levelFiveRangerData, resources: { favoredEnemy: { current: 0, max: 3, recovery: "long" } } } }, [], "feature-hunters-mark-damage", { useFreeResource: true })).toThrow("Insufficient favored enemy");
    expect(applyDnd5eSrdRest({ ...levelFiveRangerActor, data: { ...levelFiveRangerData, resources: { favoredEnemy: { current: 0, max: 3, recovery: "long" } }, spellSlots: { level1: { current: 0, max: 4, recovery: "long" }, level2: { current: 0, max: 2, recovery: "long" } } } }, "long").data).toEqual(
      expect.objectContaining({
        resources: { favoredEnemy: { current: 3, max: 3, recovery: "long" } },
        spellSlots: { level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }
      })
    );
    const monkActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("monk")!.data } };
    let levelFiveMonkData = monkActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveMonkData = applyDnd5eSrdAdvancement({ ...monkActor, data: levelFiveMonkData }, "level-up");
    }
    const levelFiveMonkActor: Actor = { ...monkActor, data: levelFiveMonkData };
    expect(useDnd5eSrdAction(levelFiveMonkActor, [], "feature-flurry-of-blows")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "focus", label: "Focus Point", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { focus: { current: 1, max: 5, recovery: "short" }, uncannyMetabolism: { current: 1, max: 1, recovery: "long" } } })
      })
    );
    expect(useDnd5eSrdAction(levelFiveMonkActor, [], "feature-stunning-strike")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "focus", label: "Focus Point", amount: 1, remaining: 1 }]
      })
    );
    expect(useDnd5eSrdAction(levelFiveMonkActor, [], "feature-uncanny-metabolism-healing")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "uncannyMetabolism", label: "Uncanny Metabolism", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ resources: { focus: { current: 5, max: 5, recovery: "short" }, uncannyMetabolism: { current: 0, max: 1, recovery: "long" } } })
      })
    );
    expect(() => useDnd5eSrdAction({ ...levelFiveMonkActor, data: { ...levelFiveMonkData, resources: { focus: { current: 0, max: 5, recovery: "short" }, uncannyMetabolism: { current: 1, max: 1, recovery: "long" } } } }, [], "feature-flurry-of-blows")).toThrow("Insufficient focus point");
    expect(applyDnd5eSrdRest({ ...levelFiveMonkActor, data: { ...levelFiveMonkData, resources: { focus: { current: 0, max: 5, recovery: "short" }, uncannyMetabolism: { current: 0, max: 1, recovery: "long" } } } }, "short").data.resources).toEqual({
      focus: { current: 5, max: 5, recovery: "short" },
      uncannyMetabolism: { current: 0, max: 1, recovery: "long" }
    });
    expect(applyDnd5eSrdRest({ ...levelFiveMonkActor, data: { ...levelFiveMonkData, resources: { focus: { current: 0, max: 5, recovery: "short" }, uncannyMetabolism: { current: 0, max: 1, recovery: "long" } } } }, "long").data.resources).toEqual({
      focus: { current: 5, max: 5, recovery: "short" },
      uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
    });
    const sorcererActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("sorcerer")!.data } };
    let levelFiveSorcererData = sorcererActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveSorcererData = applyDnd5eSrdAdvancement({ ...sorcererActor, data: levelFiveSorcererData }, "level-up");
    }
    const levelFiveSorcererActor: Actor = { ...sorcererActor, data: levelFiveSorcererData };
    expect(useDnd5eSrdAction(levelFiveSorcererActor, [], "feature-innate-sorcery")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "innateSorcery", label: "Innate Sorcery", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          resources: expect.objectContaining({ innateSorcery: { current: 1, max: 2, recovery: "long" } })
        })
      })
    );
    expect(useDnd5eSrdAction(levelFiveSorcererActor, [], "feature-metamagic-quickened-spell")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "sorceryPoints", label: "Sorcery Points", amount: 2, remaining: 0 }]
      })
    );
    expect(useDnd5eSrdAction(levelFiveSorcererActor, [], "feature-create-spell-slot", { spellSlotLevel: 1 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "resource", key: "sorceryPoints", label: "Sorcery Points", amount: 2, remaining: 0 }],
        data: expect.objectContaining({
          spellSlots: {
            level1: { current: 3, max: 4, recovery: "long" },
            level2: { current: 2, max: 3, recovery: "long" },
            level3: { current: 2, max: 2, recovery: "long" }
          }
        })
      })
    );
    expect(useDnd5eSrdAction({ ...levelFiveSorcererActor, data: { ...levelFiveSorcererData, resources: { innateSorcery: { current: 2, max: 2, recovery: "long" }, sorceryPoints: { current: 3, max: 5, recovery: "long" }, sorcerousRestoration: { current: 1, max: 1, recovery: "long" } } } }, [], "feature-convert-spell-slot-to-sorcery-points", { spellSlotLevel: 2 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          resources: {
            innateSorcery: { current: 2, max: 2, recovery: "long" },
            sorceryPoints: { current: 5, max: 5, recovery: "long" },
            sorcerousRestoration: { current: 1, max: 1, recovery: "long" }
          }
        })
      })
    );
    expect(() => useDnd5eSrdAction({ ...levelFiveSorcererActor, data: { ...levelFiveSorcererData, resources: { innateSorcery: { current: 2, max: 2, recovery: "long" }, sorceryPoints: { current: 1, max: 5, recovery: "long" }, sorcerousRestoration: { current: 1, max: 1, recovery: "long" } } } }, [], "feature-metamagic-quickened-spell")).toThrow("Insufficient sorcery points");
    expect(applyDnd5eSrdRest({ ...levelFiveSorcererActor, data: { ...levelFiveSorcererData, resources: { innateSorcery: { current: 0, max: 2, recovery: "long" }, sorceryPoints: { current: 0, max: 5, recovery: "long" }, sorcerousRestoration: { current: 1, max: 1, recovery: "long" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: { sorceryPoints: 2 }, sorcerousRestoration: { restoredSorceryPoints: 2, limit: 2 }, resourcesSpent: { sorcerousRestoration: 1 } }),
        data: expect.objectContaining({
          resources: {
            innateSorcery: { current: 0, max: 2, recovery: "long" },
            sorceryPoints: { current: 2, max: 5, recovery: "long" },
            sorcerousRestoration: { current: 0, max: 1, recovery: "long" }
          }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...levelFiveSorcererActor, data: { ...levelFiveSorcererData, resources: { innateSorcery: { current: 0, max: 2, recovery: "long" }, sorceryPoints: { current: 0, max: 5, recovery: "long" }, sorcerousRestoration: { current: 0, max: 1, recovery: "long" } } } }, "long").data.resources).toEqual({
      innateSorcery: { current: 2, max: 2, recovery: "long" },
      sorceryPoints: { current: 5, max: 5, recovery: "long" },
      sorcerousRestoration: { current: 1, max: 1, recovery: "long" }
    });
    const druidActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("druid")!.data } };
    let levelFiveDruidData = druidActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveDruidData = applyDnd5eSrdAdvancement({ ...druidActor, data: levelFiveDruidData }, "level-up");
    }
    const levelFiveDruidActor: Actor = { ...druidActor, data: levelFiveDruidData };
    expect(useDnd5eSrdAction(levelFiveDruidActor, [], "feature-wild-shape")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          resources: {
            wildShape: { current: 1, max: 2, recovery: "short" },
            wildResurgence: { current: 1, max: 1, recovery: "long" }
          }
        })
      })
    );
    expect(useDnd5eSrdAction(levelFiveDruidActor, [], "feature-wild-companion")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          spellSlots: {
            level1: { current: 1, max: 4, recovery: "long" },
            level2: { current: 2, max: 3, recovery: "long" },
            level3: { current: 2, max: 2, recovery: "long" }
          }
        })
      })
    );
    expect(useDnd5eSrdAction(levelFiveDruidActor, [], "feature-wild-companion", { useFreeResource: true })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 1 }]
      })
    );
    expect(() =>
      useDnd5eSrdAction({ ...levelFiveDruidActor, data: { ...levelFiveDruidData, resources: { wildShape: { current: 0, max: 2, recovery: "short" }, wildResurgence: { current: 1, max: 1, recovery: "long" } } } }, [], "feature-wild-shape")
    ).toThrow("Insufficient wild shape");
    expect(
      useDnd5eSrdAction(
        {
          ...levelFiveDruidActor,
          data: {
            ...levelFiveDruidData,
            resources: { wildShape: { current: 0, max: 2, recovery: "short" }, wildResurgence: { current: 1, max: 1, recovery: "long" } },
            spellSlots: { level1: { current: 1, max: 4, recovery: "long" }, level2: { current: 2, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }
          }
        },
        [],
        "feature-wild-resurgence-wild-shape"
      )
    ).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: {
            wildShape: { current: 1, max: 2, recovery: "short" },
            wildResurgence: { current: 1, max: 1, recovery: "long" }
          }
        })
      })
    );
    expect(
      useDnd5eSrdAction(
        {
          ...levelFiveDruidActor,
          data: {
            ...levelFiveDruidData,
            resources: { wildShape: { current: 1, max: 2, recovery: "short" }, wildResurgence: { current: 1, max: 1, recovery: "long" } },
            spellSlots: { level1: { current: 3, max: 4, recovery: "long" }, level2: { current: 2, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }
          }
        },
        [],
        "feature-wild-resurgence-spell-slot"
      )
    ).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [
          { type: "resource", key: "wildShape", label: "Wild Shape", amount: 1, remaining: 0 },
          { type: "resource", key: "wildResurgence", label: "Wild Resurgence", amount: 1, remaining: 0 }
        ],
        data: expect.objectContaining({
          resources: {
            wildShape: { current: 0, max: 2, recovery: "short" },
            wildResurgence: { current: 0, max: 1, recovery: "long" }
          },
          spellSlots: {
            level1: { current: 4, max: 4, recovery: "long" },
            level2: { current: 2, max: 3, recovery: "long" },
            level3: { current: 2, max: 2, recovery: "long" }
          }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...levelFiveDruidActor, data: { ...levelFiveDruidData, resources: { wildShape: { current: 0, max: 2, recovery: "short" }, wildResurgence: { current: 0, max: 1, recovery: "long" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ wildShape: 1 }) }),
        data: expect.objectContaining({
          resources: {
            wildShape: { current: 1, max: 2, recovery: "short" },
            wildResurgence: { current: 0, max: 1, recovery: "long" }
          }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...levelFiveDruidActor, data: { ...levelFiveDruidData, resources: { wildShape: { current: 0, max: 2, recovery: "short" }, wildResurgence: { current: 0, max: 1, recovery: "long" } } } }, "long").data.resources).toEqual({
      wildShape: { current: 2, max: 2, recovery: "short" },
      wildResurgence: { current: 1, max: 1, recovery: "long" }
    });
    const wizardActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("wizard")!.data, spellSlots: { level1: { current: 0, max: 2, recovery: "long" } } } };
    const wizardShortRest = applyDnd5eSrdRest(wizardActor, "short", { arcaneRecovery: { level1: 1 } });
    expect(wizardShortRest.recovered).toEqual(
      expect.objectContaining({
        spellSlots: { level1: 1 },
        arcaneRecovery: { totalLevels: 1, limit: 1 },
        resourcesSpent: { arcaneRecovery: 1 }
      })
    );
    expect(wizardShortRest.data).toEqual(
      expect.objectContaining({
        resources: { arcaneRecovery: { current: 0, max: 1, recovery: "long" } },
        spellSlots: { level1: { current: 1, max: 2, recovery: "long" } }
      })
    );
    expect(() => applyDnd5eSrdRest({ ...wizardActor, data: wizardShortRest.data }, "short", { arcaneRecovery: { level1: 1 } })).toThrow("Arcane Recovery is unavailable");
    expect(applyDnd5eSrdRest({ ...wizardActor, data: wizardShortRest.data }, "long").data).toEqual(
      expect.objectContaining({
        resources: { arcaneRecovery: { current: 1, max: 1, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } }
      })
    );
    const barbarianActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("barbarian")!.data } };
    expect(useDnd5eSrdAction(barbarianActor, [], "feature-rage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "rage", label: "Rage", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { rage: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(() => useDnd5eSrdAction({ ...barbarianActor, data: { ...barbarianActor.data, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, [], "feature-rage")).toThrow("Insufficient rage");
    expect(useDnd5eSrdAction(barbarianActor, [], "feature-rage-damage-bonus")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Rage"]) })
      })
    );
    const levelTwoBarbarianActor: Actor = { ...barbarianActor, data: applyDnd5eSrdAdvancement(barbarianActor, "level-up") };
    expect(useDnd5eSrdAction(levelTwoBarbarianActor, [], "feature-reckless-attack")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Reckless Attack"]) })
      })
    );
    expect(applyDnd5eSrdRest({ ...barbarianActor, data: { ...barbarianActor.data, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ rage: 1 }) }),
        data: expect.objectContaining({ resources: { rage: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(applyDnd5eSrdRest({ ...barbarianActor, data: { ...barbarianActor.data, level: 3, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, "long").data.resources).toEqual({ rage: { current: 3, max: 3, recovery: "short" } });
    const bardActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("bard")!.data } };
    expect(useDnd5eSrdAction(bardActor, [], "feature-bardic-inspiration")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "bardicInspiration", label: "Bardic Inspiration", amount: 1, remaining: 2 }],
        data: expect.objectContaining({ resources: { bardicInspiration: { current: 2, max: 3, recovery: "long" } } })
      })
    );
    expect(() =>
      useDnd5eSrdAction({ ...bardActor, data: { ...bardActor.data, resources: { bardicInspiration: { current: 0, max: 3, recovery: "long" } } } }, [], "feature-bardic-inspiration")
    ).toThrow("Insufficient bardic inspiration");
    expect(applyDnd5eSrdRest({ ...bardActor, data: { ...bardActor.data, resources: { bardicInspiration: { current: 0, max: 3, recovery: "long" } } } }, "short").data.resources).toEqual({
      bardicInspiration: { current: 0, max: 3, recovery: "long" }
    });
    let levelFiveBardData = bardActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveBardData = applyDnd5eSrdAdvancement({ ...bardActor, data: levelFiveBardData }, "level-up");
    }
    const levelFiveBardActor: Actor = { ...bardActor, data: levelFiveBardData };
    expect(applyDnd5eSrdRest({ ...levelFiveBardActor, data: { ...levelFiveBardActor.data, resources: { bardicInspiration: { current: 0, max: 5, recovery: "short" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ bardicInspiration: 5 }) }),
        data: expect.objectContaining({ resources: { bardicInspiration: { current: 5, max: 5, recovery: "short" } } })
      })
    );
    expect(
      useDnd5eSrdAction(
        {
          ...levelFiveBardActor,
          data: {
            ...levelFiveBardActor.data,
            resources: { bardicInspiration: { current: 4, max: 5, recovery: "short" } },
            spellSlots: { level1: { current: 1, max: 4, recovery: "long" } }
          }
        },
        [],
        "feature-font-of-inspiration"
      )
    ).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: { bardicInspiration: { current: 5, max: 5, recovery: "short" } },
          spellSlots: { level1: { current: 0, max: 4, recovery: "long" }, level2: { current: 3, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }
        })
      })
    );
    expect(() =>
      useDnd5eSrdAction({ ...levelFiveBardActor, data: { ...levelFiveBardActor.data, resources: { bardicInspiration: { current: 5, max: 5, recovery: "short" } } } }, [], "feature-font-of-inspiration")
    ).toThrow("Bardic Inspiration is already full");
    const rogueActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("rogue")!.data } };
    expect(useDnd5eSrdAction(rogueActor, [], "feature-sneak-attack-damage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Sneak Attack"]) })
      })
    );
    let levelFiveRogueData = rogueActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveRogueData = applyDnd5eSrdAdvancement({ ...rogueActor, data: levelFiveRogueData }, "level-up");
    }
    expect(useDnd5eSrdAction({ ...rogueActor, data: levelFiveRogueData }, [], "feature-cunning-strike")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Cunning Strike"]) })
      })
    );
    const fighterActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("fighter")!.data } };
    expect(useDnd5eSrdAction(fighterActor, [], "feature-second-wind-healing")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { secondWind: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(() => useDnd5eSrdAction({ ...fighterActor, data: { ...fighterActor.data, resources: { secondWind: { current: 0, max: 2, recovery: "short" } } } }, [], "feature-second-wind-healing")).toThrow("Insufficient second wind");
    const levelTwoFighterActor: Actor = { ...fighterActor, data: applyDnd5eSrdAdvancement(fighterActor, "level-up") };
    expect(useDnd5eSrdAction(levelTwoFighterActor, [], "feature-action-surge")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "actionSurge", label: "Action Surge", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: {
            secondWind: { current: 2, max: 2, recovery: "short" },
            actionSurge: { current: 0, max: 1, recovery: "short" }
          }
        })
      })
    );
    expect(() =>
      useDnd5eSrdAction(
        { ...levelTwoFighterActor, data: { ...levelTwoFighterActor.data, resources: { secondWind: { current: 2, max: 2, recovery: "short" }, actionSurge: { current: 0, max: 1, recovery: "short" } } } },
        [],
        "feature-action-surge"
      )
    ).toThrow("Insufficient action surge");
    expect(useDnd5eSrdAction(levelTwoFighterActor, [], "feature-tactical-mind-bonus")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }],
        data: expect.objectContaining({
          resources: {
            secondWind: { current: 1, max: 2, recovery: "short" },
            actionSurge: { current: 1, max: 1, recovery: "short" }
          }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...fighterActor, data: { ...fighterActor.data, resources: { secondWind: { current: 0, max: 2, recovery: "short" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ secondWind: 1 }) }),
        data: expect.objectContaining({ resources: { secondWind: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(applyDnd5eSrdRest({ ...levelTwoClericActor, data: { ...levelTwoClericActor.data, resources: { channelDivinity: { current: 0, max: 2, recovery: "short" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ channelDivinity: 1 }) }),
        data: expect.objectContaining({ resources: { channelDivinity: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(
      applyDnd5eSrdRest(
        {
          ...levelTwoFighterActor,
          data: {
            ...levelTwoFighterActor.data,
            resources: {
              secondWind: { current: 0, max: 2, recovery: "short" },
              actionSurge: { current: 0, max: 1, recovery: "short" }
            }
          }
        },
        "short"
      )
    ).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ secondWind: 1, actionSurge: 1 }) }),
        data: expect.objectContaining({
          resources: {
            secondWind: { current: 1, max: 2, recovery: "short" },
            actionSurge: { current: 1, max: 1, recovery: "short" }
          }
        })
      })
    );
    expect(applyDnd5eSrdRest({ ...fighterActor, data: { ...fighterActor.data, resources: { secondWind: { current: 0, max: 2, recovery: "short" } } } }, "long").data.resources).toEqual({ secondWind: { current: 2, max: 2, recovery: "short" } });
    expect(applyDnd5eSrdRest({ ...fighterActor, data: { ...fighterActor.data, resources: { secondWind: { current: 0, max: 1, recovery: "short" } } } }, "long").data.resources).toEqual({ secondWind: { current: 2, max: 2, recovery: "short" } });
    expect(applyDnd5eSrdRest({ ...levelTwoClericActor, data: { ...levelTwoClericActor.data, resources: { channelDivinity: { current: 0, max: 2, recovery: "short" } } } }, "long").data.resources).toEqual({ channelDivinity: { current: 2, max: 2, recovery: "short" } });
    expect(
      applyDnd5eSrdRest(
        { ...fighterActor, data: { ...fighterActor.data, level: 4, resources: { secondWind: { current: 0, max: 2, recovery: "short" }, actionSurge: { current: 0, max: 1, recovery: "short" } } } },
        "long"
      ).data.resources
    ).toEqual({
      secondWind: { current: 3, max: 3, recovery: "short" },
      actionSurge: { current: 1, max: 1, recovery: "short" }
    });

    const conditioned = applyDnd5eSrdCondition(srdActor, "magic-initiate", "2026-05-01T00:00:00.000Z");
    expect(dnd5eSrdSheet({ ...srdActor, data: conditioned }, []).conditions).toContainEqual(expect.objectContaining({ id: "magic-initiate", name: "Magic Initiate" }));

    const imported = dnd5eSrdCharacterImport({
      name: "Imported SRD Cleric",
      data: {
        level: 3,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        conditions: ["magic-initiate", "missing-condition"],
        items: ["healing-word", "longsword", "missing-item"]
      }
    });
    expect(imported).toMatchObject({
      systemId: "dnd-5e-srd",
      name: "Imported SRD Cleric",
      data: {
        ruleset: "SRD 5.2.1",
        class: "Cleric",
        species: "Human",
        background: "Sage",
        conditions: [{ id: "magic-initiate" }],
        saveProficiencies: ["wisdom", "charisma"],
        skillProficiencies: ["medicine", "religion"],
        toolProficiencies: ["calligraphers-supplies"],
        spellSlots: { level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }
      },
      items: [{ entryId: "healing-word" }, { entryId: "longsword" }]
    });
    expect(imported.warnings).toEqual(["Unknown condition skipped: missing-condition", "Unknown compendium entry skipped: missing-item"]);
  });
});

const pilot: Actor = {
  id: "act_pilot",
  campaignId: "camp_demo",
  systemId: "stellar-frontiers",
  ownerUserId: "usr_demo_player",
  type: "character",
  name: "Nova Quill",
  data: {
    aptitudes: { combat: 2, tech: 3, pilot: 1, science: 2, charm: 0 },
    strain: { current: 3, max: 6 },
    conditions: []
  },
  permissions: {},
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

describe("stellar frontiers rules", () => {
  it("adds sci-fi condition effects to aptitude rolls", () => {
    const focusedData = applyStellarFrontiersCondition(pilot, "locked-in", "2026-05-01T00:00:00.000Z");
    const focusedPilot = { ...pilot, data: focusedData };

    expect(stellarFrontiersActorConditions(focusedPilot)).toContainEqual(expect.objectContaining({ id: "locked-in", name: "Locked In" }));
    expect(stellarFrontiersQuickRolls(focusedPilot).find((roll) => roll.id === "aptitude-tech")?.formula).toBe("1d20+3+1d6");

    const jammedData = applyStellarFrontiersCondition(focusedPilot, "jammed", "2026-05-01T00:00:01.000Z");
    const jammedPilot = { ...pilot, data: jammedData };
    expect(stellarFrontiersQuickRolls(jammedPilot).find((roll) => roll.id === "aptitude-tech")?.formula).toBe("2d20kl1+3+1d6");

    const clearedPilot = { ...pilot, data: removeStellarFrontiersCondition(jammedPilot, "jammed") };
    expect(stellarFrontiersActorConditions(clearedPilot).map((condition) => condition.id)).toEqual(["locked-in"]);
  });

  it("builds sci-fi sheets with gear, talents, and compendium entries", () => {
    const items: Item[] = [
      {
        id: "itm_carbine",
        campaignId: "camp_demo",
        systemId: "stellar-frontiers",
        actorId: pilot.id,
        type: "gear",
        name: "Laser Carbine",
        data: { damage: "1d8", aptitude: "combat", compendiumId: "laser-carbine" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "itm_overclock",
        campaignId: "camp_demo",
        systemId: "stellar-frontiers",
        actorId: pilot.id,
        type: "talent",
        name: "Overclock",
        data: { bonusFormula: "1d6", aptitude: "tech", compendiumId: "overclock" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(stellarFrontiersCompendiumEntry("laser-carbine")).toEqual(expect.objectContaining({ type: "gear", name: "Laser Carbine" }));
    const sheet = stellarFrontiersSheet(pilot, items);
    expect(sheet.summary).toContain("Nova Quill");
    expect(sheet.inventory.map((item) => item.name)).toEqual(["Laser Carbine"]);
    expect(sheet.talents.map((item) => item.name)).toEqual(["Overclock"]);
    expect(sheet.quickRolls).toEqual(
      expect.arrayContaining([
        { id: "gear-itm_carbine-damage", label: "Laser Carbine Damage", formula: "1d8+2" },
        { id: "talent-itm_overclock-boost", label: "Overclock Boost", formula: "1d6+3" }
      ])
    );
  });

  it("spends sci-fi strain and consumable gear charges", () => {
    const overclock: Item = {
      id: "itm_overclock",
      campaignId: "camp_demo",
      systemId: "stellar-frontiers",
      actorId: pilot.id,
      type: "talent",
      name: "Overclock",
      data: { strainCost: 1, bonusFormula: "1d6", aptitude: "tech", compendiumId: "overclock" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const medPatch: Item = {
      id: "itm_med_patch",
      campaignId: "camp_demo",
      systemId: "stellar-frontiers",
      actorId: pilot.id,
      type: "gear",
      name: "Med Patch",
      data: { category: "consumable", healingFormula: "1d6+2", quantity: 1, compendiumId: "med-patch" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };

    const strained = useStellarFrontiersAction(pilot, [overclock], `talent-${overclock.id}-boost`);
    expect(strained.consumed).toEqual([{ type: "strain", key: "strain", label: "Strain", amount: 1, remaining: 2 }]);
    expect(strained.data.strain).toEqual({ current: 2, max: 6 });

    const patched = useStellarFrontiersAction(pilot, [medPatch], `gear-${medPatch.id}-healing`);
    expect(patched.consumed).toEqual([{ type: "itemQuantity", key: "itm_med_patch", label: "Med Patch", amount: 1, remaining: 0 }]);
    expect(patched.items).toEqual([expect.objectContaining({ id: "itm_med_patch", data: expect.objectContaining({ quantity: 0 }) })]);
    expect(() => useStellarFrontiersAction(pilot, patched.items, `gear-${medPatch.id}-healing`)).toThrow("Med Patch has no remaining uses");
  });

  it("provides guided sci-fi templates and rank advancement", () => {
    const shipTech = stellarFrontiersCharacterTemplate("ship-tech");
    expect(shipTech).toEqual(expect.objectContaining({ name: "Ship Tech", actorType: "character" }));
    expect(shipTech?.items.map((item) => item.entryId)).toEqual(["med-patch", "overclock"]);

    const builtPilot = { ...pilot, data: shipTech!.data };
    expect(stellarFrontiersAdvancementOptions(builtPilot)).toContainEqual(expect.objectContaining({ id: "rank-up", nextValue: 2 }));
    const advancedData = applyStellarFrontiersAdvancement(builtPilot, "rank-up");
    expect(advancedData.rank).toBe(2);
    expect(advancedData.strain).toEqual({ current: 4, max: 7 });
    expect((advancedData.aptitudes as Record<string, number>).tech).toBe(4);
    expect(advancedData.milestones).toEqual(expect.arrayContaining(["Rank 2 Field Promotion"]));
  });

  it("applies sci-fi rest recovery rules", () => {
    const depletedPilot: Actor = {
      ...pilot,
      data: {
        ...pilot.data,
        strain: { current: 1, max: 6 },
        resources: {
          evasiveBurst: { current: 0, max: 1, recovery: "short" },
          fieldRepair: { current: 0, max: 2, recovery: "long" }
        },
        conditions: [{ id: "locked-in" }, { id: "jammed" }, { id: "vacuum-exposed" }]
      }
    };

    const shortRest = applyStellarFrontiersRest(depletedPilot, "short");
    expect(shortRest.data.strain).toEqual({ current: 3, max: 6 });
    expect(shortRest.data.resources).toEqual({
      evasiveBurst: { current: 1, max: 1, recovery: "short" },
      fieldRepair: { current: 0, max: 2, recovery: "long" }
    });
    expect(shortRest.data.conditions).toEqual([{ id: "vacuum-exposed" }]);
    expect(shortRest.removedConditions.map((condition) => condition.id)).toEqual(["locked-in", "jammed"]);

    const longRest = applyStellarFrontiersRest(depletedPilot, "long");
    expect(longRest.data.strain).toEqual({ current: 6, max: 6 });
    expect(longRest.data.resources).toEqual({
      evasiveBurst: { current: 1, max: 1, recovery: "short" },
      fieldRepair: { current: 2, max: 2, recovery: "long" }
    });
    expect(longRest.data.conditions).toEqual([]);
    expect(longRest.removedConditions.map((condition) => condition.id)).toEqual(["locked-in", "jammed", "vacuum-exposed"]);
  });

  it("calculates sci-fi encounter budgets from threat selections", () => {
    expect(stellarFrontiersEncounterThreats().map((threat) => threat.id)).toContain("void-raider");
    const plan = stellarFrontiersEncounterPlan([{ ...pilot, data: { ...pilot.data, rank: 2 } }], [
      { id: "boarding-drone", count: 2 },
      { id: "void-raider", count: 1 }
    ]);
    expect(plan).toMatchObject({
      systemId: "stellar-frontiers",
      partyRating: 180,
      threatBudget: 160,
      difficulty: "standard"
    });
    expect(plan.summary).toContain("2x Boarding Drone");
  });

  it("normalizes imported sci-fi characters", () => {
    const imported = stellarFrontiersCharacterImport({
      name: "Imported Ace",
      data: {
        rank: 4,
        background: "Corsair Defector",
        aptitudes: { combat: 3, tech: 2, pilot: 4, science: 1, charm: 1 },
        strain: { current: 5, max: 8 },
        milestones: ["Defected at Dawn"],
        conditions: ["locked-in"],
        items: ["laser-carbine", "overclock", "vacuum-exposed"]
      }
    });

    expect(imported).toMatchObject({
      systemId: "stellar-frontiers",
      actorType: "character",
      name: "Imported Ace",
      data: {
        rank: 4,
        background: "Corsair Defector",
        strain: { current: 5, max: 8 },
        conditions: [{ id: "locked-in" }, { id: "vacuum-exposed" }]
      },
      items: [{ entryId: "laser-carbine" }, { entryId: "overclock" }]
    });
    expect(imported.warnings).toEqual([]);
  });
});

const investigator: Actor = {
  id: "act_investigator",
  campaignId: "camp_demo",
  systemId: "mystic-noir",
  ownerUserId: "usr_demo_player",
  type: "character",
  name: "Mara Vale",
  data: {
    rank: 1,
    archetype: "Field Investigator",
    skills: { investigation: 3, resolve: 2, influence: 1, stealth: 2, occult: 1 },
    composure: { current: 4, max: 6 },
    conditions: []
  },
  permissions: {},
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

describe("mystic noir rules", () => {
  it("adds investigation condition effects to skill rolls", () => {
    const focusedData = applyMysticNoirCondition(investigator, "focused", "2026-05-01T00:00:00.000Z");
    const focusedInvestigator = { ...investigator, data: focusedData };

    expect(mysticNoirActorConditions(focusedInvestigator)).toContainEqual(expect.objectContaining({ id: "focused", name: "Focused" }));
    expect(mysticNoirQuickRolls(focusedInvestigator).find((roll) => roll.id === "skill-investigation")?.formula).toBe("1d20+3+1d4");

    const shakenData = applyMysticNoirCondition(focusedInvestigator, "shaken", "2026-05-01T00:00:01.000Z");
    const shakenInvestigator = { ...investigator, data: shakenData };
    expect(mysticNoirQuickRolls(shakenInvestigator).find((roll) => roll.id === "skill-investigation")?.formula).toBe("2d20kl1+3+1d4");

    const clearedInvestigator = { ...investigator, data: removeMysticNoirCondition(shakenInvestigator, "shaken") };
    expect(mysticNoirActorConditions(clearedInvestigator).map((condition) => condition.id)).toEqual(["focused"]);
  });

  it("builds investigation sheets with clues, rituals, and compendium entries", () => {
    const items: Item[] = [
      {
        id: "itm_notebook",
        campaignId: "camp_demo",
        systemId: "mystic-noir",
        actorId: investigator.id,
        type: "clue",
        name: "Case Notebook",
        data: { bonusFormula: "1d4", skill: "investigation", compendiumId: "case-notebook" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "itm_warding_rite",
        campaignId: "camp_demo",
        systemId: "mystic-noir",
        actorId: investigator.id,
        type: "ritual",
        name: "Warding Rite",
        data: { protectionFormula: "1d6", skill: "resolve", compendiumId: "warding-rite" },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(mysticNoirCompendiumEntry("case-notebook")).toEqual(expect.objectContaining({ type: "clue", name: "Case Notebook" }));
    const sheet = mysticNoirSheet(investigator, items);
    expect(sheet.summary).toContain("Mara Vale");
    expect(sheet.clues.map((item) => item.name)).toEqual(["Case Notebook"]);
    expect(sheet.rituals.map((item) => item.name)).toEqual(["Warding Rite"]);
    expect(sheet.quickRolls).toEqual(
      expect.arrayContaining([
        { id: "clue-itm_notebook-insight", label: "Case Notebook Insight", formula: "1d4+3" },
        { id: "ritual-itm_warding_rite-ward", label: "Warding Rite Ward", formula: "1d6+2" }
      ])
    );
  });

  it("spends investigation resources for clue and ritual actions", () => {
    const notebook: Item = {
      id: "itm_notebook",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "clue",
      name: "Case Notebook",
      data: { bonusFormula: "1d4", skill: "investigation", resourceCost: { resource: "lead", amount: 1 }, compendiumId: "case-notebook" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const resourcefulInvestigator: Actor = {
      ...investigator,
      data: {
        ...investigator.data,
        resources: { lead: { current: 1, max: 2, recovery: "long" } }
      }
    };

    const used = useMysticNoirAction(resourcefulInvestigator, [notebook], `clue-${notebook.id}-insight`);
    expect(used.consumed).toEqual([{ type: "resource", key: "lead", label: "Lead", amount: 1, remaining: 0 }]);
    expect(used.data.resources).toEqual({ lead: { current: 0, max: 2, recovery: "long" } });
    expect(() => useMysticNoirAction({ ...resourcefulInvestigator, data: used.data }, [notebook], `clue-${notebook.id}-insight`)).toThrow("Insufficient lead");
  });

  it("provides guided investigation templates and case advancement", () => {
    const fieldInvestigator = mysticNoirCharacterTemplate("field-investigator");
    expect(fieldInvestigator).toEqual(expect.objectContaining({ name: "Field Investigator", actorType: "character" }));
    expect(fieldInvestigator?.items).toEqual([{ entryId: "case-notebook" }]);

    const builtInvestigator = { ...investigator, data: fieldInvestigator!.data };
    expect(mysticNoirAdvancementOptions(builtInvestigator)).toContainEqual(expect.objectContaining({ id: "case-breakthrough", nextValue: 2 }));
    const advancedData = applyMysticNoirAdvancement(builtInvestigator, "case-breakthrough");
    expect(advancedData.rank).toBe(2);
    expect(advancedData.composure).toEqual({ current: 5, max: 7 });
    expect((advancedData.skills as Record<string, number>).investigation).toBe(4);
    expect(advancedData.breakthroughs).toEqual(expect.arrayContaining(["Case 2 Breakthrough"]));
  });

  it("applies investigation rest recovery rules", () => {
    const depletedInvestigator: Actor = {
      ...investigator,
      data: {
        ...investigator.data,
        composure: { current: 1, max: 6 },
        resources: {
          ward: { current: 0, max: 1, recovery: "short" },
          lead: { current: 0, max: 2, recovery: "long" }
        },
        conditions: [{ id: "focused" }, { id: "shaken" }, { id: "marked" }]
      }
    };

    const shortRest = applyMysticNoirRest(depletedInvestigator, "short");
    expect(shortRest.data.composure).toEqual({ current: 3, max: 6 });
    expect(shortRest.data.resources).toEqual({
      ward: { current: 1, max: 1, recovery: "short" },
      lead: { current: 0, max: 2, recovery: "long" }
    });
    expect(shortRest.data.conditions).toEqual([{ id: "marked" }]);
    expect(shortRest.removedConditions.map((condition) => condition.id)).toEqual(["focused", "shaken"]);

    const longRest = applyMysticNoirRest(depletedInvestigator, "long");
    expect(longRest.data.composure).toEqual({ current: 6, max: 6 });
    expect(longRest.data.resources).toEqual({
      ward: { current: 1, max: 1, recovery: "short" },
      lead: { current: 2, max: 2, recovery: "long" }
    });
    expect(longRest.data.conditions).toEqual([]);
    expect(longRest.removedConditions.map((condition) => condition.id)).toEqual(["focused", "shaken", "marked"]);
  });

  it("calculates investigation encounter budgets from threat selections", () => {
    expect(mysticNoirEncounterThreats().map((threat) => threat.id)).toContain("masked-agent");
    const plan = mysticNoirEncounterPlan([{ ...investigator, data: { ...investigator.data, rank: 2 } }], [
      { id: "arcane-ward", count: 2 },
      { id: "masked-agent", count: 1 }
    ]);
    expect(plan).toMatchObject({
      systemId: "mystic-noir",
      partyRating: 160,
      threatBudget: 140,
      difficulty: "standard"
    });
    expect(plan.summary).toContain("2x Arcane Ward");
  });

  it("normalizes imported investigation characters", () => {
    const imported = mysticNoirCharacterImport({
      name: "Imported Investigator",
      data: {
        rank: 3,
        archetype: "Occult Scholar",
        skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
        composure: { current: 4, max: 7 },
        breakthroughs: ["Solved the First Case"],
        conditions: ["focused", "missing-condition"],
        items: ["case-notebook", "warding-rite", "marked", "missing-item"]
      }
    });

    expect(imported).toMatchObject({
      systemId: "mystic-noir",
      actorType: "character",
      name: "Imported Investigator",
      data: {
        rank: 3,
        archetype: "Occult Scholar",
        composure: { current: 4, max: 7 },
        conditions: [{ id: "focused" }, { id: "marked" }]
      },
      items: [{ entryId: "case-notebook" }, { entryId: "warding-rite" }]
    });
    expect(imported.warnings).toEqual(["Unknown condition skipped: missing-condition", "Unknown compendium entry skipped: missing-item"]);
  });
});
