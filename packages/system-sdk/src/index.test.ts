import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyDnd5eSrdAdvancement, applyDnd5eSrdCondition, applyDnd5eSrdRest, applyGenericFantasyAdvancement, applyGenericFantasyCondition, applyGenericFantasyRest, applyMysticNoirAdvancement, applyMysticNoirCondition, applyMysticNoirRest, applyStellarFrontiersAdvancement, applyStellarFrontiersCondition, applyStellarFrontiersRest, dnd5eSrdActionFormula, dnd5eSrdAdvancementOptions, dnd5eSrdApplyCharacterOrigins, dnd5eSrdAttunementLimit, dnd5eSrdCharacterImport, dnd5eSrdCharacterOrigins, dnd5eSrdCharacterTemplate, dnd5eSrdCompendium, dnd5eSrdCompendiumEntry, dnd5eSrdEncounterPlan, dnd5eSrdEncounterThreats, dnd5eSrdEncounterXpBudgets, dnd5eSrdEquipmentPurchase, dnd5eSrdMonsterActorData, dnd5eSrdQuickRolls, dnd5eSrdSheet, genericFantasyActorConditions, genericFantasyAdvancementOptions, genericFantasyCharacterImport, genericFantasyCharacterTemplate, genericFantasyCompendiumEntry, genericFantasyEncounterPlan, genericFantasyEncounterThreats, genericFantasyQuickRolls, genericFantasySheet, mysticNoirActorConditions, mysticNoirAdvancementOptions, mysticNoirCharacterImport, mysticNoirCharacterTemplate, mysticNoirCompendiumEntry, mysticNoirEncounterPlan, mysticNoirEncounterThreats, mysticNoirQuickRolls, mysticNoirSheet, removeGenericFantasyCondition, removeMysticNoirCondition, removeStellarFrontiersCondition, resolveDnd5eSrdAction, resolveDnd5eSrdConcentrationDamage, stellarFrontiersActorConditions, stellarFrontiersAdvancementOptions, stellarFrontiersCharacterImport, stellarFrontiersCharacterTemplate, stellarFrontiersCompendiumEntry, stellarFrontiersEncounterPlan, stellarFrontiersEncounterThreats, stellarFrontiersQuickRolls, stellarFrontiersSheet, useDnd5eSrdAction, useGenericFantasyAction, useMysticNoirAction, useStellarFrontiersAction } from "./index.js";

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

  it("applies resource-backed fantasy condition cleanup actions", () => {
    const fieldPrayer: Item = {
      id: "itm_field_prayer",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      actorId: actor.id,
      type: "spell",
      name: "Field Prayer",
      data: genericFantasyCompendiumEntry("field-prayer")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const guardianRally: Item = {
      id: "itm_guardian_rally",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      actorId: actor.id,
      type: "item",
      name: "Guardian Rally",
      data: genericFantasyCompendiumEntry("guardian-rally")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const readyActor: Actor = {
      ...actor,
      data: {
        ...actor.data,
        resources: {
          fieldPrayer: { current: 1, max: 1, recovery: "long" },
          secondWind: { current: 1, max: 1, recovery: "short" }
        },
        conditions: [{ id: "poisoned" }]
      }
    };

    expect(genericFantasyQuickRolls(readyActor, [fieldPrayer, guardianRally])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "spell-itm_field_prayer-healing",
          label: "Field Prayer Healing",
          formula: "1d6+0",
          metadata: expect.objectContaining({ resourceCost: { resource: "fieldPrayer", amount: 1 }, clearsCondition: "poisoned" })
        }),
        expect.objectContaining({
          id: "item-itm_guardian_rally-healing",
          label: "Guardian Rally Healing",
          formula: "1d6+1",
          metadata: expect.objectContaining({ resourceCost: { resource: "secondWind", amount: 1 }, appliesCondition: "blessed" })
        })
      ])
    );

    const prayed = useGenericFantasyAction(readyActor, [fieldPrayer], "spell-itm_field_prayer-healing");
    expect(prayed.consumed).toEqual([{ type: "resource", key: "fieldPrayer", label: "Field Prayer", amount: 1, remaining: 0 }]);
    expect(prayed.data.resources).toEqual({
      fieldPrayer: { current: 0, max: 1, recovery: "long" },
      secondWind: { current: 1, max: 1, recovery: "short" }
    });
    expect(prayed.data.conditions).toEqual([]);

    const rallied = useGenericFantasyAction({ ...readyActor, data: { ...readyActor.data, conditions: [] } }, [guardianRally], "item-itm_guardian_rally-healing");
    expect(rallied.consumed).toEqual([{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 0 }]);
    expect(rallied.data.resources).toEqual({
      fieldPrayer: { current: 1, max: 1, recovery: "long" },
      secondWind: { current: 0, max: 1, recovery: "short" }
    });
    expect(rallied.data.conditions).toEqual([{ id: "blessed" }]);
    expect(() =>
      useGenericFantasyAction({ ...readyActor, data: { ...readyActor.data, resources: { fieldPrayer: { current: 0, max: 1, recovery: "long" } } } }, [fieldPrayer], "spell-itm_field_prayer-healing")
    ).toThrow("Insufficient field prayer");
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

  it("keeps magic item spell references backed by compendium spell entries", () => {
    const spells = new Set(dnd5eSrdCompendium().filter((entry) => entry.type === "spell").map((entry) => entry.id));
    const missingReferences = dnd5eSrdCompendium()
      .filter((entry) => entry.type === "item")
      .flatMap((entry) => {
        const data = entry.data as Record<string, unknown>;
        const spell = typeof data.spell === "string" ? [data.spell] : [];
        const spellsData = Array.isArray(data.spells) ? data.spells : [];
        const spellIds = spellsData.map((spellData) => (spellData && typeof spellData === "object" && "id" in spellData ? (spellData as { id?: unknown }).id : undefined)).filter((id): id is string => typeof id === "string");
        return [...spell, ...spellIds].filter((spellId) => !spells.has(spellId)).map((spellId) => `${entry.id}:${spellId}`);
      });

    expect(missingReferences).toEqual([]);
  });

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
    const officialSrdConditionIds = [
      "blinded",
      "charmed",
      "deafened",
      "exhaustion",
      "frightened",
      "grappled",
      "incapacitated",
      "invisible",
      "paralyzed",
      "petrified",
      "poisoned",
      "prone",
      "restrained",
      "stunned",
      "unconscious"
    ];
    expect(dnd5eSrdCompendium().filter((entry) => entry.type === "condition").map((entry) => entry.id)).toEqual(expect.arrayContaining([...officialSrdConditionIds, "blessed", "magic-initiate"]));
    expect(dnd5eSrdCompendiumEntry("blinded")?.data).toEqual(expect.objectContaining({ sightBlocked: true, sightChecksFail: true, attacksAgainst: "advantage" }));
    expect(dnd5eSrdCompendiumEntry("exhaustion")?.data).toEqual(expect.objectContaining({ stackable: true, maxLevel: 6, d20TestPenaltyPerLevel: 2, speedPenaltyFtPerLevel: 5 }));
    expect(dnd5eSrdCompendiumEntry("paralyzed")?.data).toEqual(expect.objectContaining({ includes: ["incapacitated"], savingThrowsFail: ["strength", "dexterity"], closeHitsCritical: true }));
    expect(dnd5eSrdCompendiumEntry("poisoned")?.data).toEqual(expect.objectContaining({ attackRolls: "disadvantage", abilityChecks: "disadvantage" }));
    expect(dnd5eSrdCompendiumEntry("restrained")?.data).toEqual(expect.objectContaining({ speedSetTo: 0, attacksAgainst: "advantage", savingThrowsDisadvantage: ["dexterity"] }));
    expect(dnd5eSrdCompendiumEntry("unconscious")?.data).toEqual(expect.objectContaining({ includes: ["incapacitated", "prone"], dropsHeldItems: true, unaware: true }));
    expect(dnd5eSrdCompendiumEntry("magic-initiate")).toEqual(expect.objectContaining({ name: "Magic Initiate" }));
    expect(dnd5eSrdCompendiumEntry("longsword")?.data).toEqual(expect.objectContaining({ costGp: 15, weightLb: 3, weaponCategory: "martial", weaponKind: "melee", mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("shield-armor")?.data).toEqual(expect.objectContaining({ costGp: 10, armorBonus: 2 }));
    expect(dnd5eSrdCompendiumEntry("padded-armor")?.data).toEqual(expect.objectContaining({ armorBase: 11, armorType: "light", stealthDisadvantage: true, costGp: 5, weightLb: 8 }));
    expect(dnd5eSrdCompendiumEntry("leather-armor")?.data).toEqual(expect.objectContaining({ armorBase: 11, armorType: "light", costGp: 10, weightLb: 10 }));
    expect(dnd5eSrdCompendiumEntry("hide-armor")?.data).toEqual(expect.objectContaining({ armorBase: 12, armorType: "medium", dexCap: 2, costGp: 10, weightLb: 12 }));
    expect(dnd5eSrdCompendiumEntry("chain-shirt")?.data).toEqual(expect.objectContaining({ armorBase: 13, armorType: "medium", dexCap: 2, costGp: 50, weightLb: 20 }));
    expect(dnd5eSrdCompendiumEntry("scale-mail")?.data).toEqual(expect.objectContaining({ armorBase: 14, armorType: "medium", dexCap: 2, stealthDisadvantage: true, costGp: 50, weightLb: 45 }));
    expect(dnd5eSrdCompendiumEntry("breastplate")?.data).toEqual(expect.objectContaining({ armorBase: 14, armorType: "medium", dexCap: 2, costGp: 400, weightLb: 20 }));
    expect(dnd5eSrdCompendiumEntry("half-plate-armor")?.data).toEqual(expect.objectContaining({ armorBase: 15, armorType: "medium", dexCap: 2, stealthDisadvantage: true, costGp: 750, weightLb: 40 }));
    expect(dnd5eSrdCompendiumEntry("ring-mail")?.data).toEqual(expect.objectContaining({ armorBase: 14, armorType: "heavy", dexBonus: false, stealthDisadvantage: true, costGp: 30, weightLb: 40 }));
    expect(dnd5eSrdCompendiumEntry("chain-mail")?.data).toEqual(expect.objectContaining({ armorBase: 16, armorType: "heavy", dexBonus: false, strengthRequirement: 13, stealthDisadvantage: true, costGp: 75, weightLb: 55 }));
    expect(dnd5eSrdCompendiumEntry("splint-armor")?.data).toEqual(expect.objectContaining({ armorBase: 17, armorType: "heavy", dexBonus: false, strengthRequirement: 15, costGp: 200, weightLb: 60 }));
    expect(dnd5eSrdCompendiumEntry("plate-armor")?.data).toEqual(expect.objectContaining({ armorBase: 18, armorType: "heavy", dexBonus: false, strengthRequirement: 15, costGp: 1500, weightLb: 65 }));
    expect(dnd5eSrdCompendiumEntry("acid-arrow")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "4d4", upcastFormula: "1d4", secondaryDamageFormula: "2d4", secondaryUpcastFormula: "1d4", spellAttack: true }));
    expect(dnd5eSrdCompendiumEntry("acid-splash")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d6", damageType: "acid", save: { ability: "dexterity" }, cantripScaling: { level5: "2d6", level11: "3d6", level17: "4d6" } }));
    expect(dnd5eSrdCompendiumEntry("alarm")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, area: "up to 20-foot cube", alarmOptions: ["audible", "mental"] }));
    expect(dnd5eSrdCompendiumEntry("aid")?.data).toEqual(expect.objectContaining({ level: 2, healingFormula: "5", upcastFormula: "5", hitPointMaximumIncreaseFormula: "5", targetCount: 3 }));
    expect(dnd5eSrdCompendiumEntry("alter-self")?.data).toEqual(expect.objectContaining({ level: 2, concentration: true, swimSpeedEqualsSpeed: true, naturalWeaponDamageFormula: "1d6" }));
    expect(dnd5eSrdCompendiumEntry("animal-friendship")?.data).toEqual(expect.objectContaining({ level: 1, targetCreatureType: "Beast", condition: "Charmed", save: { ability: "wisdom" }, upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("animal-messenger")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, targetCreatureType: "Tiny Beast", save: { ability: "charisma" }, upcastDurationHours: 48 }));
    expect(dnd5eSrdCompendiumEntry("animal-shapes")?.data).toEqual(expect.objectContaining({ level: 8, beastChallengeRatingMax: 4, beastSizeMax: "Large", preventsSpellcasting: true }));
    expect(dnd5eSrdCompendiumEntry("animate-dead")?.data).toEqual(expect.objectContaining({ level: 3, creates: ["skeleton", "zombie"], commandAction: "bonus", upcastCreatedOrControlled: { base: 1, perSlotAbove: 2 } }));
    expect(dnd5eSrdCompendiumEntry("animate-objects")?.data).toEqual(expect.objectContaining({ level: 5, targetCountFormula: "@spellcasting", commandRangeFt: 500, summon: expect.objectContaining({ statBlock: "Animated Object", armorClass: 15 }) }));
    expect(dnd5eSrdCompendiumEntry("antilife-shell")?.data).toEqual(expect.objectContaining({ level: 5, area: "10-foot emanation", blocksCreatureTypesExcept: ["Construct", "Undead"] }));
    expect(dnd5eSrdCompendiumEntry("antimagic-field")?.data).toEqual(expect.objectContaining({ level: 8, suppressesSpells: true, blocksTeleportation: true, suppressesMagicItems: true }));
    expect(dnd5eSrdCompendiumEntry("antipathysympathy")?.data).toEqual(expect.objectContaining({ level: 8, triggerRangeFt: 120, antipathyCondition: "Frightened", sympathyCondition: "Charmed" }));
    expect(dnd5eSrdCompendiumEntry("arcane-eye")?.data).toEqual(expect.objectContaining({ level: 4, sensor: "Invisible, invulnerable hovering eye", darkvisionFt: 30, moveAction: "bonus" }));
    expect(dnd5eSrdCompendiumEntry("arcane-hand")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "5d8", upcastFormula: "2d8", spellAttack: true, grappleCondition: "Grappled" }));
    expect(dnd5eSrdCompendiumEntry("arcane-lock")?.data).toEqual(expect.objectContaining({ level: 2, consumedMaterialCostGp: 25, preventsNonmagicalUnlocking: true, passwordUnlockDuration: "1 minute" }));
    expect(dnd5eSrdCompendiumEntry("arcane-sword")?.data).toEqual(expect.objectContaining({ level: 7, damageFormula: "4d12+@spellcasting", spellAttack: true, repeatAttackAction: "bonus" }));
    expect(dnd5eSrdCompendiumEntry("arcanists-magic-aura")?.data).toEqual(expect.objectContaining({ level: 2, options: ["Mask", "False Aura"], permanentAfterDailyCasts: 30 }));
    expect(dnd5eSrdCompendiumEntry("astral-projection")?.data).toEqual(expect.objectContaining({ level: 9, consumedMaterialCostGp: 1100, targetCount: 9, bodyCondition: "Unconscious" }));
    expect(dnd5eSrdCompendiumEntry("augury")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, forecastWindowMinutes: 30, repeatBeforeLongRestFailureChancePercent: 25 }));
    expect(dnd5eSrdCompendiumEntry("awaken")?.data).toEqual(expect.objectContaining({ level: 5, consumedMaterialCostGp: 1000, intelligenceSetTo: 10, condition: "Charmed" }));
    expect(dnd5eSrdCompendiumEntry("banishment")?.data).toEqual(expect.objectContaining({ level: 4, save: { ability: "charisma" }, condition: "Incapacitated", upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("barkskin")?.data).toEqual(expect.objectContaining({ level: 2, action: "bonus", baseArmorClass: 17, armorClassFloor: 17 }));
    expect(dnd5eSrdCompendiumEntry("beacon-of-hope")?.data).toEqual(expect.objectContaining({ level: 3, savingThrowAdvantage: ["wisdom"], deathSavingThrowAdvantage: true, healingReceivedMaximized: true }));
    expect(dnd5eSrdCompendiumEntry("befuddlement")?.data).toEqual(expect.objectContaining({ level: 8, damageFormula: "10d12", save: { ability: "intelligence", success: "half" }, preventsSpellcasting: true }));
    expect(dnd5eSrdCompendiumEntry("bestow-curse")?.data).toEqual(expect.objectContaining({ level: 3, condition: "Cursed", damageFormula: "1d8", upcastDuration: expect.objectContaining({ level9: "until dispelled without concentration" }) }));
    expect(dnd5eSrdCompendiumEntry("black-tentacles")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "3d6", condition: "Restrained", terrain: "Difficult Terrain", save: { ability: "strength" } }));
    expect(dnd5eSrdCompendiumEntry("blade-barrier")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "6d10", cover: "Three-Quarters Cover", save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("blight")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "8d8", upcastFormula: "1d8", plantCreaturesAutoFail: true }));
    expect(dnd5eSrdCompendiumEntry("blindnessdeafness")?.data).toEqual(expect.objectContaining({ level: 2, conditionOptions: ["Blinded", "Deafened"], upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("blink")?.data).toEqual(expect.objectContaining({ level: 3, blinkRoll: { die: "1d6", success: "4-6" }, destinationPlane: "Ethereal Plane" }));
    expect(dnd5eSrdCompendiumEntry("blur")?.data).toEqual(expect.objectContaining({ level: 2, attacksAgainst: "disadvantage", bypassedBySenses: ["Blindsight", "Truesight"] }));
    expect(dnd5eSrdCompendiumEntry("call-lightning")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "3d10", upcastFormula: "1d10", stormBonusFormula: "1d10" }));
    expect(dnd5eSrdCompendiumEntry("calm-emotions")?.data).toEqual(expect.objectContaining({ level: 2, targetCreatureType: "Humanoid", suppressedConditions: ["Charmed", "Frightened"], save: { ability: "charisma" } }));
    expect(dnd5eSrdCompendiumEntry("chain-lightning")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "10d8", secondaryTargetCount: 3, upcastSecondaryTargets: { base: 3, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("charm-person")?.data).toEqual(expect.objectContaining({ level: 1, targetCreatureType: "Humanoid", condition: "Charmed", hostileTargetSaveAdvantage: true }));
    expect(dnd5eSrdCompendiumEntry("circle-of-death")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "8d8", upcastFormula: "2d8", area: "60-foot-radius sphere", save: { ability: "constitution", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("clone")?.data).toEqual(expect.objectContaining({ level: 8, growthDays: 120, soulTransferOnDeath: true, consumedMaterialCostGp: 1000, vesselCostGp: 2000 }));
    expect(dnd5eSrdCompendiumEntry("cloudkill")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "5d8", upcastFormula: "1d8", heavilyObscured: true, movesAtStartOfCasterTurn: { distanceFt: 10, direction: "away from caster" } }));
    expect(dnd5eSrdCompendiumEntry("commune")?.data).toEqual(expect.objectContaining({ level: 5, ritual: true, questionCount: 3, repeatBeforeLongRestFailureChancePercent: 25 }));
    expect(dnd5eSrdCompendiumEntry("commune-with-nature")?.data).toEqual(expect.objectContaining({ level: 5, ritual: true, outdoorRadiusMiles: 3, undergroundRadiusFt: 300, factCount: 3 }));
    expect(dnd5eSrdCompendiumEntry("comprehend-languages")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, understandsSpokenLanguages: true, requiresTouchForWriting: true }));
    expect(dnd5eSrdCompendiumEntry("compulsion")?.data).toEqual(expect.objectContaining({ level: 4, condition: "Charmed", forcedMovementAction: "bonus", repeatSave: { timing: "after forced movement", success: "ends" } }));
    expect(dnd5eSrdCompendiumEntry("cone-of-cold")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "8d8", upcastFormula: "1d8", killedCreatureBecomesFrozenStatue: true }));
    expect(dnd5eSrdCompendiumEntry("confusion")?.data).toEqual(expect.objectContaining({ level: 4, behaviorRoll: "1d10", preventsBonusActions: true, preventsReactions: true, upcastArea: { baseRadiusFt: 10, radiusIncreaseFt: 5, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("conjure-animals")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "3d10", upcastFormula: "1d10", summon: expect.objectContaining({ form: "Large spectral intangible animal pack" }) }));
    expect(dnd5eSrdCompendiumEntry("conjure-celestial")?.data).toEqual(expect.objectContaining({ level: 7, healingFormula: "4d12+@spellcasting", damageFormula: "6d12", area: "10-foot-radius, 40-foot-high cylinder" }));
    expect(dnd5eSrdCompendiumEntry("conjure-elemental")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "8d8", ongoingDamageFormula: "4d8", condition: "Restrained" }));
    expect(dnd5eSrdCompendiumEntry("conjure-fey")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "3d12+@spellcasting", spellAttack: true, condition: "Frightened" }));
    expect(dnd5eSrdCompendiumEntry("conjure-minor-elementals")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "2d8", damageTypeOptions: ["acid", "cold", "fire", "lightning"], enemyTerrain: "Difficult Terrain" }));
    expect(dnd5eSrdCompendiumEntry("conjure-woodland-beings")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "5d8", bonusAction: "Disengage", save: { ability: "wisdom", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("contact-other-plane")?.data).toEqual(expect.objectContaining({ level: 5, ritual: true, selfSave: { ability: "intelligence", dc: 15 }, failedSaveCondition: "Incapacitated" }));
    expect(dnd5eSrdCompendiumEntry("contagion")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "11d8", condition: "Poisoned", chosenAbilitySaveDisadvantage: true }));
    expect(dnd5eSrdCompendiumEntry("contingency")?.data).toEqual(expect.objectContaining({ level: 6, contingentSpellMaxLevel: 5, expendsBothSpellSlots: true, oneContingencyAtATime: true }));
    expect(dnd5eSrdCompendiumEntry("continual-flame")?.data).toEqual(expect.objectContaining({ level: 2, consumedMaterialCostGp: 50, brightLightFt: 20, createsNoHeat: true }));
    expect(dnd5eSrdCompendiumEntry("control-water")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "2d8", effectOptions: ["Flood", "Part Water", "Redirect Flow", "Whirlpool"] }));
    expect(dnd5eSrdCompendiumEntry("control-weather")?.data).toEqual(expect.objectContaining({ level: 8, area: "5-mile radius", requiresOutdoors: true, changeDelay: "1d4 x 10 minutes" }));
    expect(dnd5eSrdCompendiumEntry("create-food-and-water")?.data).toEqual(expect.objectContaining({ level: 3, foodPounds: 45, waterGallons: 30, foodSpoilsAfterHours: 24 }));
    expect(dnd5eSrdCompendiumEntry("create-or-destroy-water")?.data).toEqual(expect.objectContaining({ level: 1, waterGallons: 10, area: "30-foot cube", upcastCubeIncreaseFt: 5 }));
    expect(dnd5eSrdCompendiumEntry("create-undead")?.data).toEqual(expect.objectContaining({ level: 6, creates: ["ghoul"], commandAction: "bonus", controlDurationHours: 24 }));
    expect(dnd5eSrdCompendiumEntry("creation")?.data).toEqual(expect.objectContaining({ level: 5, objectSize: "5-foot cube", failsAsMaterialComponent: true, upcastCubeIncreaseFt: 5 }));
    expect(dnd5eSrdCompendiumEntry("darkvision")?.data).toEqual(expect.objectContaining({ level: 2, grantsSense: "Darkvision", darkvisionFt: 150 }));
    expect(dnd5eSrdCompendiumEntry("daylight")?.data).toEqual(expect.objectContaining({ level: 3, brightLightFt: 60, lightType: "sunlight", dispelsDarknessSpellLevel: 3 }));
    expect(dnd5eSrdCompendiumEntry("death-ward")?.data).toEqual(expect.objectContaining({ level: 4, preventsFirstDropToZero: true, dropToHpInstead: 1, negatesInstantDeathEffect: true }));
    expect(dnd5eSrdCompendiumEntry("delayed-blast-fireball")?.data).toEqual(expect.objectContaining({ level: 7, damageFormula: "12d6", upcastFormula: "1d6", accumulatedDamageIncrease: { timing: "end of each caster turn while spell has not ended", formula: "1d6" } }));
    expect(dnd5eSrdCompendiumEntry("demiplane")?.data).toEqual(expect.objectContaining({ level: 8, roomDimensionsFt: { width: 30, length: 30, height: 30 }, contentsPersistAfterDoorVanishes: true }));
    expect(dnd5eSrdCompendiumEntry("detect-evil-and-good")?.data).toEqual(expect.objectContaining({ level: 1, senseRangeFt: 30, detectsSpell: "Hallow", detectsCreatureTypes: expect.arrayContaining(["Fiend"]) }));
    expect(dnd5eSrdCompendiumEntry("detect-poison-and-disease")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, detects: expect.arrayContaining(["magical contagions"]), learnsKind: true }));
    expect(dnd5eSrdCompendiumEntry("dimension-door")?.data).toEqual(expect.objectContaining({ level: 4, teleportFt: 500, canBringWillingCreature: true, failureDamageFormula: "4d6" }));
    expect(dnd5eSrdCompendiumEntry("disguise-self")?.data).toEqual(expect.objectContaining({ level: 1, heightChangeFt: 1, failsPhysicalInspection: true, discernAction: "Study" }));
    expect(dnd5eSrdCompendiumEntry("disintegrate")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "10d6+40", upcastFormula: "3d6", disintegratesAtZeroHp: true }));
    expect(dnd5eSrdCompendiumEntry("dispel-evil-and-good")?.data).toEqual(expect.objectContaining({ level: 5, attacksAgainstCaster: "disadvantage", affectedCreatureTypes: expect.arrayContaining(["Undead"]) }));
    expect(dnd5eSrdCompendiumEntry("divination")?.data).toEqual(expect.objectContaining({ level: 4, ritual: true, consumedMaterialCostGp: 25, forecastWindowDays: 7 }));
    expect(dnd5eSrdCompendiumEntry("divine-favor")?.data).toEqual(expect.objectContaining({ level: 1, action: "bonus", damageFormula: "1d4", trigger: "hit with a weapon attack" }));
    expect(dnd5eSrdCompendiumEntry("divine-word")?.data).toEqual(expect.objectContaining({ level: 7, save: { ability: "charisma" }, banishmentDurationHours: 24 }));
    expect(dnd5eSrdCompendiumEntry("dominate-beast")?.data).toEqual(expect.objectContaining({ level: 4, targetCreatureType: "Beast", condition: "Charmed", telepathicLink: true }));
    expect(dnd5eSrdCompendiumEntry("dominate-monster")?.data).toEqual(expect.objectContaining({ level: 8, targetCreatureType: "creature", condition: "Charmed", upcastDuration: { level9: "up to 8 hours" } }));
    expect(dnd5eSrdCompendiumEntry("dominate-person")?.data).toEqual(expect.objectContaining({ level: 5, targetCreatureType: "Humanoid", condition: "Charmed", telepathicLink: true }));
    expect(dnd5eSrdCompendiumEntry("dream")?.data).toEqual(expect.objectContaining({ level: 5, messengerState: { condition: "Incapacitated", speed: 0 }, terrifyingMessenger: expect.objectContaining({ damageFormula: "3d6" }) }));
    expect(dnd5eSrdCompendiumEntry("earthquake")?.data).toEqual(expect.objectContaining({ level: 8, area: "100-foot-radius circle", structureDamage: 50, collapseDamageFormula: "12d6" }));
    expect(dnd5eSrdCompendiumEntry("enlargereduce")?.data).toEqual(expect.objectContaining({ level: 2, aliases: ["enlarge-reduce"], damageBonusFormula: "1d4", damagePenaltyFormula: "1d4" }));
    expect(dnd5eSrdCompendiumEntry("entangle")?.data).toEqual(expect.objectContaining({ level: 1, area: "20-foot square", condition: "Restrained", save: { ability: "strength" } }));
    expect(dnd5eSrdCompendiumEntry("enthrall")?.data).toEqual(expect.objectContaining({ level: 2, penalty: -10, affectedChecks: ["Wisdom (Perception)", "Passive Perception"] }));
    expect(dnd5eSrdCompendiumEntry("etherealness")?.data).toEqual(expect.objectContaining({ level: 7, destinationPlane: "Border Ethereal", upcastTargets: { base: 1, perSlotAbove: 3, willingCreaturesWithinFt: 10 } }));
    expect(dnd5eSrdCompendiumEntry("expeditious-retreat")?.data).toEqual(expect.objectContaining({ level: 1, action: "bonus", immediateAction: "Dash", bonusActionGranted: "Dash" }));
    expect(dnd5eSrdCompendiumEntry("eyebite")?.data).toEqual(expect.objectContaining({ level: 6, targetRangeFt: 60, repeatAction: "magic", effectOptions: expect.arrayContaining([expect.objectContaining({ name: "Panicked", condition: "Frightened" })]) }));
    expect(dnd5eSrdCompendiumEntry("fabricate")?.data).toEqual(expect.objectContaining({ level: 4, objectSize: "Large or smaller", toolProficiencyRequiredForSkilledItems: true }));
    expect(dnd5eSrdCompendiumEntry("faithful-hound")?.data).toEqual(expect.objectContaining({ level: 4, truesightFt: 30, damageFormula: "4d8", damageType: "force" }));
    expect(dnd5eSrdCompendiumEntry("feather-fall")?.data).toEqual(expect.objectContaining({ level: 1, action: "reaction", targetCount: 5, preventsFallDamage: true }));
    expect(dnd5eSrdCompendiumEntry("find-familiar")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, telepathyFt: 100, touchSpellDelivery: true }));
    expect(dnd5eSrdCompendiumEntry("find-steed")?.data).toEqual(expect.objectContaining({ level: 2, summon: "Otherworldly Steed", sharesInitiative: true, upcastUsesSlotLevelInStatBlock: true }));
    expect(dnd5eSrdCompendiumEntry("find-the-path")?.data).toEqual(expect.objectContaining({ level: 6, duration: "up to 1 day", revealsDistanceAndDirection: true }));
    expect(dnd5eSrdCompendiumEntry("find-traps")?.data).toEqual(expect.objectContaining({ level: 2, requiresLineOfSight: true, doesNotRevealLocation: true }));
    expect(dnd5eSrdCompendiumEntry("finger-of-death")?.data).toEqual(expect.objectContaining({ level: 7, damageFormula: "7d8+30", killedHumanoidBecomes: "Zombie" }));
    expect(dnd5eSrdCompendiumEntry("fire-shield")?.data).toEqual(expect.objectContaining({ level: 4, shieldOptions: expect.arrayContaining([expect.objectContaining({ name: "warm", resistance: ["cold"] })]) }));
    expect(dnd5eSrdCompendiumEntry("fire-storm")?.data).toEqual(expect.objectContaining({ level: 7, damageFormula: "7d10", cubeCount: 10 }));
    expect(dnd5eSrdCompendiumEntry("flame-blade")?.data).toEqual(expect.objectContaining({ level: 2, spellAttack: true, damageFormula: "3d6+@spellcasting", upcastFormula: "1d6" }));
    expect(dnd5eSrdCompendiumEntry("flame-strike")?.data).toEqual(expect.objectContaining({ level: 5, damageBreakdown: { fire: "5d6", radiant: "5d6" }, upcastFormula: "1d6 fire + 1d6 radiant" }));
    expect(dnd5eSrdCompendiumEntry("flaming-sphere")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d6", moveAction: "bonus", brightLightFt: 20 }));
    expect(dnd5eSrdCompendiumEntry("flesh-to-stone")?.data).toEqual(expect.objectContaining({ level: 6, condition: "Restrained", finalCondition: "Petrified", failuresToPetrify: 3 }));
    expect(dnd5eSrdCompendiumEntry("floating-disk")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, carryingCapacityPounds: 500 }));
    expect(dnd5eSrdCompendiumEntry("fog-cloud")?.data).toEqual(expect.objectContaining({ level: 1, condition: "Heavily Obscured", upcastRadiusIncreaseFt: 20 }));
    expect(dnd5eSrdCompendiumEntry("forbiddance")?.data).toEqual(expect.objectContaining({ level: 6, wardAreaSqFt: 40000, blocksTeleportation: true, permanentAfterDailyCastings: 30 }));
    expect(dnd5eSrdCompendiumEntry("forcecage")?.data).toEqual(expect.objectContaining({ level: 7, consumedMaterialCostGp: 1500, extendsIntoEtherealPlane: true, blocksDispelMagic: true }));
    expect(dnd5eSrdCompendiumEntry("foresight")?.data).toEqual(expect.objectContaining({ level: 9, advantageOn: ["D20 Tests"], attacksAgainstTarget: "disadvantage" }));
    expect(dnd5eSrdCompendiumEntry("freedom-of-movement")?.data).toEqual(expect.objectContaining({ level: 4, ignoresDifficultTerrain: true, blockedConditions: ["Paralyzed", "Restrained"], upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("freezing-sphere")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "10d6", upcastFormula: "1d6", freezesWater: expect.objectContaining({ swimmingCreaturesCondition: "Restrained" }) }));
    expect(dnd5eSrdCompendiumEntry("gate")?.data).toEqual(expect.objectContaining({ level: 9, materialCostGp: 5000, namedCreatureCall: true }));
    expect(dnd5eSrdCompendiumEntry("geas")?.data).toEqual(expect.objectContaining({ level: 5, condition: "Charmed", damageFormula: "5d10", upcastDuration: expect.objectContaining({ level9: "until ended by listed spells" }) }));
    expect(dnd5eSrdCompendiumEntry("gentle-repose")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, preventsDecay: true, extendsRaiseDeadTimeLimits: true }));
    expect(dnd5eSrdCompendiumEntry("giant-insect")?.data).toEqual(expect.objectContaining({ level: 4, summon: expect.objectContaining({ statBlock: "Giant Insect" }), upcastUsesSlotLevelInStatBlock: true }));
    expect(dnd5eSrdCompendiumEntry("glibness")?.data).toEqual(expect.objectContaining({ level: 8, charismaCheckMinimumRoll: 15, magicalTruthDetectionReadsTruthful: true }));
    expect(dnd5eSrdCompendiumEntry("globe-of-invulnerability")?.data).toEqual(expect.objectContaining({ level: 6, area: "10-foot emanation", blocksOutsideSpellLevel: 5 }));
    expect(dnd5eSrdCompendiumEntry("glyph-of-warding")?.data).toEqual(expect.objectContaining({ level: 3, consumedMaterialCostGp: 200, explosiveRune: expect.objectContaining({ damageFormula: "5d8" }) }));
    expect(dnd5eSrdCompendiumEntry("goodberry")?.data).toEqual(expect.objectContaining({ level: 1, berryCount: 10, healingFormula: "1", consumeAction: "bonus" }));
    expect(dnd5eSrdCompendiumEntry("grease")?.data).toEqual(expect.objectContaining({ level: 1, terrain: "Difficult Terrain", condition: "Prone", save: { ability: "dexterity" } }));
    expect(dnd5eSrdCompendiumEntry("greater-invisibility")?.data).toEqual(expect.objectContaining({ level: 4, condition: "Invisible", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("greater-restoration")?.data).toEqual(expect.objectContaining({ level: 5, consumedMaterialCostGp: 100, removesOne: expect.arrayContaining(["Petrified"]) }));
    expect(dnd5eSrdCompendiumEntry("guardian-of-faith")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "20", totalDamageBeforeVanishes: 60 }));
    expect(dnd5eSrdCompendiumEntry("guards-and-wards")?.data).toEqual(expect.objectContaining({ level: 6, wardAreaSqFt: 2500, permanentAfterDailyCastings: 365 }));
    expect(dnd5eSrdCompendiumEntry("guidance")?.data).toEqual(expect.objectContaining({ level: 0, bonusFormula: "1d4", affectedRolls: ["ability check using chosen skill"] }));
    expect(dnd5eSrdCompendiumEntry("gust-of-wind")?.data).toEqual(expect.objectContaining({ level: 2, pushFt: 15, movementCostMultiplierTowardCaster: 2 }));
    expect(dnd5eSrdCompendiumEntry("hallow")?.data).toEqual(expect.objectContaining({ level: 5, radiusFt: 60, extraEffectOptions: expect.arrayContaining(["Extradimensional Interference"]) }));
    expect(dnd5eSrdCompendiumEntry("hallucinatory-terrain")?.data).toEqual(expect.objectContaining({ level: 4, area: "150-foot cube", discernAction: "Study" }));
    expect(dnd5eSrdCompendiumEntry("harm")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "14d6", reducesHitPointMaximumByDamageTaken: true }));
    expect(dnd5eSrdCompendiumEntry("heal")?.data).toEqual(expect.objectContaining({ level: 6, healingFormula: "70", upcastHealingIncrease: 10, conditionsEnded: ["Blinded", "Deafened", "Poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("heat-metal")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d8", repeatDamageAction: "bonus", failedSaveEffect: "drop object if possible" }));
    expect(dnd5eSrdCompendiumEntry("heroes-feast")?.data).toEqual(expect.objectContaining({ level: 6, targetCount: 12, hitPointMaximumIncreaseFormula: "2d10", immunity: ["Frightened", "Poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("heroism")?.data).toEqual(expect.objectContaining({ level: 1, immunity: ["Frightened"], temporaryHitPointsFormula: "@spellcasting" }));
    expect(dnd5eSrdCompendiumEntry("hideous-laughter")?.data).toEqual(expect.objectContaining({ level: 1, conditions: ["Prone", "Incapacitated"], damageTriggeredSaveAdvantage: true }));
    expect(dnd5eSrdCompendiumEntry("hold-monster")?.data).toEqual(expect.objectContaining({ level: 5, condition: "Paralyzed", upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("holy-aura")?.data).toEqual(expect.objectContaining({ level: 8, area: "30-foot emanation", retaliationCondition: "Blinded" }));
    expect(dnd5eSrdCompendiumEntry("ice-storm")?.data).toEqual(expect.objectContaining({ level: 4, damageBreakdown: { bludgeoning: "2d10", cold: "4d6" }, terrain: "Difficult Terrain" }));
    expect(dnd5eSrdCompendiumEntry("illusory-script")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, truesightReadsHiddenMessage: true }));
    expect(dnd5eSrdCompendiumEntry("imprisonment")?.data).toEqual(expect.objectContaining({ level: 9, prisonOptions: expect.arrayContaining(["Minimus Containment"]), dispelMagicRequiresSlotLevel: 9 }));
    expect(dnd5eSrdCompendiumEntry("incendiary-cloud")?.data).toEqual(expect.objectContaining({ level: 8, damageFormula: "10d8", cloudMoveFt: 10, condition: "Heavily Obscured" }));
    expect(dnd5eSrdCompendiumEntry("inflict-wounds")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d10", upcastFormula: "1d10" }));
    expect(dnd5eSrdCompendiumEntry("insect-plague")?.data).toEqual(expect.objectContaining({ level: 5, damageFormula: "4d10", terrain: "Difficult Terrain", condition: "Lightly Obscured" }));
    expect(dnd5eSrdCompendiumEntry("instant-summons")?.data).toEqual(expect.objectContaining({ level: 6, ritual: true, targetObjectWeightMaxPounds: 10, heldObjectNotTransported: true }));
    expect(dnd5eSrdCompendiumEntry("irresistible-dance")?.data).toEqual(expect.objectContaining({ level: 6, condition: "Charmed", repeatSaveAction: "action" }));
    expect(dnd5eSrdCompendiumEntry("jump")?.data).toEqual(expect.objectContaining({ level: 1, action: "bonus", jumpFt: 30, upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("knock")?.data).toEqual(expect.objectContaining({ level: 2, unlocksOneLock: true, audibleFt: 300 }));
    expect(dnd5eSrdCompendiumEntry("legend-lore")?.data).toEqual(expect.objectContaining({ level: 5, targetMustBeFamous: true, accurateButFigurative: true }));
    expect(dnd5eSrdCompendiumEntry("levitate")?.data).toEqual(expect.objectContaining({ level: 2, riseFt: 20, objectWeightMaxPounds: 500, floatsDownAtEnd: true }));
    expect(dnd5eSrdCompendiumEntry("light")?.data).toEqual(expect.objectContaining({ level: 0, brightLightFt: 20, dimLightFt: 20, endsIfCastAgain: true }));
    expect(dnd5eSrdCompendiumEntry("locate-animals-or-plants")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, searchRadiusMiles: 5, revealsDirectionAndDistance: true }));
    expect(dnd5eSrdCompendiumEntry("locate-creature")?.data).toEqual(expect.objectContaining({ level: 4, concentration: true, searchRadiusFt: 1000, blockedBy: ["any thickness of lead"] }));
    expect(dnd5eSrdCompendiumEntry("locate-object")?.data).toEqual(expect.objectContaining({ level: 2, concentration: true, searchRadiusFt: 1000, targetKinds: ["known object", "nearest object kind"] }));
    expect(dnd5eSrdCompendiumEntry("mage-hand")?.data).toEqual(expect.objectContaining({ level: 0, moveFt: 30, carryCapacityLb: 10, restrictions: expect.arrayContaining(["can't attack"]) }));
    expect(dnd5eSrdCompendiumEntry("magic-circle")?.data).toEqual(expect.objectContaining({ level: 3, materialCostGp: 100, area: { shape: "cylinder", radiusFt: 10, heightFt: 20 }, save: { ability: "charisma" } }));
    expect(dnd5eSrdCompendiumEntry("magic-jar")?.data).toEqual(expect.objectContaining({ level: 6, materialCostGp: 500, possessionRangeFt: 100, save: { ability: "charisma" } }));
    expect(dnd5eSrdCompendiumEntry("magic-mouth")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, messageWordLimit: 25, triggerRadiusFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("magic-weapon")?.data).toEqual(expect.objectContaining({ level: 2, action: "bonus", attackBonus: 1, damageBonus: 1, upcastBonus: [{ slotLevels: "3-5", bonus: 2 }, { slotLevels: "6+", bonus: 3 }] }));
    expect(dnd5eSrdCompendiumEntry("magnificent-mansion")?.data).toEqual(expect.objectContaining({ level: 7, servantCount: 100, banquetCapacity: 100, expelsContentsAtEnd: true }));
    expect(dnd5eSrdCompendiumEntry("major-image")?.data).toEqual(expect.objectContaining({ level: 3, illusionSize: "20-foot cube", sensoryQualities: ["visual", "audible", "smell", "temperature"], upcastPermanentAtSlotLevel: 4 }));
    expect(dnd5eSrdCompendiumEntry("mass-heal")?.data).toEqual(expect.objectContaining({ level: 9, healingPool: 700, conditionsEnded: ["Blinded", "Deafened", "Poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("mass-suggestion")?.data).toEqual(expect.objectContaining({ level: 6, targetCount: 12, suggestionWordLimit: 25, save: { ability: "wisdom" } }));
    expect(dnd5eSrdCompendiumEntry("maze")?.data).toEqual(expect.objectContaining({ level: 8, banishesTo: "labyrinthine demiplane", escapeCheck: { ability: "intelligence", skill: "investigation", dc: 20 } }));
    expect(dnd5eSrdCompendiumEntry("meld-into-stone")?.data).toEqual(expect.objectContaining({ level: 3, ritual: true, partialDestructionDamageFormula: "6d6", fullDestructionDamage: 50, expelledCondition: "Prone" }));
    expect(dnd5eSrdCompendiumEntry("message")?.data).toEqual(expect.objectContaining({ level: 0, range: "120 ft", targetCanReply: true, blockedBy: expect.arrayContaining(["magical silence"]) }));
    expect(dnd5eSrdCompendiumEntry("meteor-swarm")?.data).toEqual(expect.objectContaining({ level: 9, pointCount: 4, damageFormula: "20d6", secondaryDamageFormula: "20d6", save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("mind-blank")?.data).toEqual(expect.objectContaining({ level: 8, immunity: ["Psychic", "Charmed"], blocks: expect.arrayContaining(["thought reading"]) }));
    expect(dnd5eSrdCompendiumEntry("mirage-arcane")?.data).toEqual(expect.objectContaining({ level: 7, area: { shape: "square", sizeMiles: 1 }, canCreateDifficultTerrain: true, truesightRevealsTerrain: true }));
    expect(dnd5eSrdCompendiumEntry("mirror-image")?.data).toEqual(expect.objectContaining({ level: 2, duplicateCount: 3, redirectThreshold: 3, unaffectedBy: expect.arrayContaining(["Truesight"]) }));
    expect(dnd5eSrdCompendiumEntry("mislead")?.data).toEqual(expect.objectContaining({ level: 5, condition: "Invisible", createsDouble: true, doubleMoveMultiplier: 2 }));
    expect(dnd5eSrdCompendiumEntry("modify-memory")?.data).toEqual(expect.objectContaining({ level: 5, save: { ability: "wisdom" }, additionalCondition: "Incapacitated", baseMemoryAgeHours: 24, upcastMemoryAge: expect.objectContaining({ 9: "any time in the target's past" }) }));
    expect(dnd5eSrdCompendiumEntry("moonbeam")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d10", upcastFormula: "1d10", revertsShapeShifters: true }));
    expect(dnd5eSrdCompendiumEntry("move-earth")?.data).toEqual(expect.objectContaining({ level: 6, area: { shape: "square", sizeFt: 40 }, changeCompletionMinutes: 10, cannotManipulate: ["natural stone", "stone construction"] }));
    expect(dnd5eSrdCompendiumEntry("nondetection")?.data).toEqual(expect.objectContaining({ level: 3, materialCostGp: 25, consumesMaterial: true, blocks: ["Divination spell targeting", "magical scrying sensors"] }));
    expect(dnd5eSrdCompendiumEntry("passwall")?.data).toEqual(expect.objectContaining({ level: 5, openingMaxFt: { width: 5, height: 8, depth: 20 }, ejectsContentsAtEnd: true }));
    expect(dnd5eSrdCompendiumEntry("phantasmal-killer")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "4d10", upcastFormula: "1d10", save: { ability: "wisdom", success: "half and ends" } }));
    expect(dnd5eSrdCompendiumEntry("phantom-steed")?.data).toEqual(expect.objectContaining({ level: 3, ritual: true, speedFt: 100, travelMilesPerHour: 13 }));
    expect(dnd5eSrdCompendiumEntry("planar-ally")?.data).toEqual(expect.objectContaining({ level: 6, summonedTypes: ["Celestial", "Elemental", "Fiend"], underCompulsion: false, paymentGuidelinesGp: { perMinute: 100, perHour: 1000, perDay: 10000 } }));
    expect(dnd5eSrdCompendiumEntry("planar-binding")?.data).toEqual(expect.objectContaining({ level: 5, materialCostGp: 1000, save: { ability: "charisma" }, upcastDuration: expect.objectContaining({ 9: "366 days" }) }));
    expect(dnd5eSrdCompendiumEntry("plane-shift")?.data).toEqual(expect.objectContaining({ level: 7, materialCostGp: 250, willingCreatureCount: 9, requiresLinkedHands: true }));
    expect(dnd5eSrdCompendiumEntry("plant-growth")?.data).toEqual(expect.objectContaining({ level: 3, modes: ["Overgrowth", "Enrichment"], movementCostMultiplier: 4, enrichmentDurationDays: 365 }));
    expect(dnd5eSrdCompendiumEntry("polymorph")?.data).toEqual(expect.objectContaining({ level: 4, targetForm: "Beast", save: { ability: "wisdom" }, grantsTemporaryHitPointsFromForm: true }));
    expect(dnd5eSrdCompendiumEntry("power-word-kill")?.data).toEqual(expect.objectContaining({ level: 9, hitPointThreshold: 100, effectAtOrBelowThreshold: "dies", damageFormula: "12d12" }));
    expect(dnd5eSrdCompendiumEntry("power-word-stun")?.data).toEqual(expect.objectContaining({ level: 8, hitPointThreshold: 150, condition: "Stunned", otherwiseSpeedFt: 0 }));
    expect(dnd5eSrdCompendiumEntry("prismatic-spray")?.data).toEqual(expect.objectContaining({ level: 7, rayRollFormula: "1d8", rayDamageFormula: "12d6", specialRays: expect.arrayContaining(["two rays"]) }));
    expect(dnd5eSrdCompendiumEntry("prismatic-wall")?.data).toEqual(expect.objectContaining({ level: 9, layerCount: 7, layerDamageFormula: "12d6", layerCounters: expect.arrayContaining(["Dispel Magic"]) }));
    expect(dnd5eSrdCompendiumEntry("private-sanctum")?.data).toEqual(expect.objectContaining({ level: 4, permanentAfterDays: 365, upcastSizeIncreaseFt: 100, securityOptions: expect.arrayContaining(["block teleportation"]) }));
    expect(dnd5eSrdCompendiumEntry("produce-flame")?.data).toEqual(expect.objectContaining({ level: 0, action: "bonus", attackRangeFt: 60, damageFormula: "1d8", cantripScaling: { 5: "2d8", 11: "3d8", 17: "4d8" } }));
    expect(dnd5eSrdCompendiumEntry("programmed-illusion")?.data).toEqual(expect.objectContaining({ level: 6, illusionSize: "30-foot cube", performanceDurationMinutes: 5, dormantAfterTriggerMinutes: 10 }));
    expect(dnd5eSrdCompendiumEntry("project-image")?.data).toEqual(expect.objectContaining({ level: 7, range: "500 miles", createsCopyOfSelf: true, moveFt: 60 }));
    expect(dnd5eSrdCompendiumEntry("protection-from-energy")?.data).toEqual(expect.objectContaining({ level: 3, concentration: true, resistanceChoices: ["Acid", "Cold", "Fire", "Lightning", "Thunder"] }));
    expect(dnd5eSrdCompendiumEntry("protection-from-evil-and-good")?.data).toEqual(expect.objectContaining({ level: 1, materialCostGp: 25, protectedCreatureTypes: expect.arrayContaining(["Fiend"]), advantageAgainstExistingEffects: ["possessed", "Charmed", "Frightened"] }));
    expect(dnd5eSrdCompendiumEntry("protection-from-poison")?.data).toEqual(expect.objectContaining({ level: 2, conditionsEnded: ["Poisoned"], resistance: ["Poison"] }));
    expect(dnd5eSrdCompendiumEntry("purify-food-and-drink")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, area: { shape: "sphere", radiusFt: 5 }, removes: ["poison", "rot"] }));
    expect(dnd5eSrdCompendiumEntry("raise-dead")?.data).toEqual(expect.objectContaining({ level: 5, materialCostGp: 500, deathAgeLimitDays: 10, returnsWithHitPoints: 1 }));
    expect(dnd5eSrdCompendiumEntry("ray-of-frost")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d8", damageType: "cold", speedReductionFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("regenerate")?.data).toEqual(expect.objectContaining({ level: 7, healingFormula: "4d8+15", regenerationPerTurn: 1, regrowsBodyPartsAfterMinutes: 2 }));
    expect(dnd5eSrdCompendiumEntry("reincarnate")?.data).toEqual(expect.objectContaining({ level: 5, materialCostGp: 1000, speciesRollFormula: "1d10", replacesSpeciesTraits: true }));
    expect(dnd5eSrdCompendiumEntry("remove-curse")?.data).toEqual(expect.objectContaining({ level: 3, endsCurses: true, breaksCursedItemAttunement: true }));
    expect(dnd5eSrdCompendiumEntry("resilient-sphere")?.data).toEqual(expect.objectContaining({ level: 4, targetSizeMax: "Large", immuneToAllDamage: true, destroyedBy: ["Disintegrate"] }));
    expect(dnd5eSrdCompendiumEntry("resistance")?.data).toEqual(expect.objectContaining({ level: 0, resistanceReductionFormula: "1d4", oncePerTurn: true, damageTypeChoices: expect.arrayContaining(["Thunder"]) }));
    expect(dnd5eSrdCompendiumEntry("resurrection")?.data).toEqual(expect.objectContaining({ level: 7, materialCostGp: 1000, deathAgeLimitYears: 100, returnsWithAllHitPoints: true }));
    expect(dnd5eSrdCompendiumEntry("reverse-gravity")?.data).toEqual(expect.objectContaining({ level: 7, area: { shape: "cylinder", radiusFt: 50, heightFt: 100 }, fallDirection: "upward" }));
    expect(dnd5eSrdCompendiumEntry("rope-trick")?.data).toEqual(expect.objectContaining({ level: 2, portalInvisible: true, blocksAttacksSpellsAndEffects: true, contentsDropAtEnd: true }));
    expect(dnd5eSrdCompendiumEntry("sacred-flame")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d8", save: { ability: "dexterity" }, ignoresCover: ["Half Cover", "Three-Quarters Cover"] }));
    expect(dnd5eSrdCompendiumEntry("sanctuary")?.data).toEqual(expect.objectContaining({ level: 1, action: "bonus", save: { ability: "wisdom" }, doesNotProtectFromAreas: true }));
    expect(dnd5eSrdCompendiumEntry("scrying")?.data).toEqual(expect.objectContaining({ level: 5, materialCostGp: 1000, knowledgeSaveModifiers: { secondhand: 5, firsthand: 0, extensive: -5 }, retryImmunityHours: 24 }));
    expect(dnd5eSrdCompendiumEntry("secret-chest")?.data).toEqual(expect.objectContaining({ level: 4, chestCostGp: 5000, replicaCostGp: 50, capacityCubicFt: 12 }));
    expect(dnd5eSrdCompendiumEntry("seeming")?.data).toEqual(expect.objectContaining({ level: 5, targetCount: "any number of seen creatures", save: { ability: "charisma" }, heightChangeLimitFt: 1 }));
    expect(dnd5eSrdCompendiumEntry("sending")?.data).toEqual(expect.objectContaining({ level: 3, range: "unlimited", messageWordLimit: 25, crossPlanarFailureChancePercent: 5 }));
    expect(dnd5eSrdCompendiumEntry("sequester")?.data).toEqual(expect.objectContaining({ level: 7, materialCostGp: 5000, condition: "Invisible", creatureCondition: "Unconscious", endsOnDamage: true }));
    expect(dnd5eSrdCompendiumEntry("shapechange")?.data).toEqual(expect.objectContaining({ level: 9, materialCostGp: 1500, excludedCreatureTypes: ["Construct", "Undead"], canChangeFormWithMagicAction: true }));
    expect(dnd5eSrdCompendiumEntry("shield-of-faith")?.data).toEqual(expect.objectContaining({ level: 1, action: "bonus", armorClassBonus: 2 }));
    expect(dnd5eSrdCompendiumEntry("shillelagh")?.data).toEqual(expect.objectContaining({ level: 0, targetWeapons: ["Club", "Quarterstaff"], useSpellcastingAbilityForWeapon: true, cantripDamageDieScaling: { 5: "d10", 11: "d12", 17: "2d6" } }));
    expect(dnd5eSrdCompendiumEntry("shining-smite")?.data).toEqual(expect.objectContaining({ level: 2, extraDamageFormula: "2d6", upcastFormula: "1d6", attacksAgainstTarget: "advantage" }));
    expect(dnd5eSrdCompendiumEntry("shocking-grasp")?.data).toEqual(expect.objectContaining({ level: 0, attackType: "melee spell", damageFormula: "1d8", blocksOpportunityAttacksUntil: "start of target's next turn" }));
    expect(dnd5eSrdCompendiumEntry("silent-image")?.data).toEqual(expect.objectContaining({ level: 1, illusionSize: "15-foot cube", sensoryQualities: ["visual"], moveWithMagicAction: true }));
    expect(dnd5eSrdCompendiumEntry("simulacrum")?.data).toEqual(expect.objectContaining({ level: 7, materialCostGp: 1500, createdCreatureType: "Construct", hitPointMaximumMultiplier: 0.5 }));
    expect(dnd5eSrdCompendiumEntry("sleep")?.data).toEqual(expect.objectContaining({ level: 1, firstFailedSaveCondition: "Incapacitated", secondFailedSaveCondition: "Unconscious", unaffectedBy: expect.arrayContaining(["creatures that don't sleep"]) }));
    expect(dnd5eSrdCompendiumEntry("sleet-storm")?.data).toEqual(expect.objectContaining({ level: 3, condition: "Heavily Obscured", terrain: "Difficult Terrain", failedSaveEffects: ["Prone", "lose Concentration"] }));
    expect(dnd5eSrdCompendiumEntry("spare-the-dying")?.data).toEqual(expect.objectContaining({ level: 0, targetRequirement: "creature at 0 Hit Points that isn't dead", effect: "Stable", cantripRangeScaling: { 5: "30 ft", 11: "60 ft", 17: "120 ft" } }));
    expect(dnd5eSrdCompendiumEntry("speak-with-dead")?.data).toEqual(expect.objectContaining({ level: 3, questionLimit: 5, retryLockoutDays: 10, doesNotReturnSoul: true }));
    expect(dnd5eSrdCompendiumEntry("speak-with-plants")?.data).toEqual(expect.objectContaining({ level: 3, area: "30-foot emanation", canConvertPlantDifficultTerrain: true, canCreatePlantDifficultTerrain: true }));
    expect(dnd5eSrdCompendiumEntry("spider-climb")?.data).toEqual(expect.objectContaining({ level: 2, climbSpeedEqualsSpeed: true, upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("spike-growth")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d4", damagePerDistanceFt: 5, terrain: "Difficult Terrain" }));
    expect(dnd5eSrdCompendiumEntry("stone-shape")?.data).toEqual(expect.objectContaining({ level: 4, maxHinges: 2, canAddLatch: true, finerMechanicalDetailPossible: false }));
    expect(dnd5eSrdCompendiumEntry("stoneskin")?.data).toEqual(expect.objectContaining({ level: 4, materialCostGp: 100, resistance: ["Bludgeoning", "Piercing", "Slashing"] }));
    expect(dnd5eSrdCompendiumEntry("storm-of-vengeance")?.data).toEqual(expect.objectContaining({ level: 9, initialDamageFormula: "2d6", turnEffects: expect.objectContaining({ 3: expect.objectContaining({ boltCount: 6, damageFormula: "10d6" }) }) }));
    expect(dnd5eSrdCompendiumEntry("sunbeam")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "6d8", condition: "Blinded", repeatAction: "Magic" }));
    expect(dnd5eSrdCompendiumEntry("sunburst")?.data).toEqual(expect.objectContaining({ level: 8, damageFormula: "12d6", condition: "Blinded", dispelsDarknessSpellsInArea: true }));
    expect(dnd5eSrdCompendiumEntry("symbol")?.data).toEqual(expect.objectContaining({ level: 7, materialCostGp: 1000, symbolEffects: ["Death", "Discord", "Fear", "Pain", "Sleep", "Stunning"], deathDamageFormula: "10d10" }));
    expect(dnd5eSrdCompendiumEntry("telekinesis")?.data).toEqual(expect.objectContaining({ level: 5, targetSizeMax: "Huge", moveFt: 30, creatureCondition: "Restrained" }));
    expect(dnd5eSrdCompendiumEntry("telepathic-bond")?.data).toEqual(expect.objectContaining({ level: 5, ritual: true, targetCount: 8, blockedAcrossPlanes: true }));
    expect(dnd5eSrdCompendiumEntry("teleport")?.data).toEqual(expect.objectContaining({ level: 7, willingCreatureCount: 9, outcomeRoll: "1d100", mishapDamageFormula: "3d10" }));
    expect(dnd5eSrdCompendiumEntry("teleportation-circle")?.data).toEqual(expect.objectContaining({ level: 5, materialCostGp: 50, circleRadiusFt: 5, permanentCircleAfterDays: 365 }));
    expect(dnd5eSrdCompendiumEntry("time-stop")?.data).toEqual(expect.objectContaining({ level: 9, extraTurnsFormula: "1d4+1", maxDistanceFromCastFt: 1000 }));
    expect(dnd5eSrdCompendiumEntry("tiny-hut")?.data).toEqual(expect.objectContaining({ level: 3, ritual: true, blocksSpellsAtOrBelowLevel: 3, endsIfCasterLeaves: true }));
    expect(dnd5eSrdCompendiumEntry("tongues")?.data).toEqual(expect.objectContaining({ level: 3, understandsLanguages: ["spoken", "signed"], makesSpeechAndSigningUnderstandable: true }));
    expect(dnd5eSrdCompendiumEntry("transport-via-plants")?.data).toEqual(expect.objectContaining({ level: 6, plantSizeMin: "Large", samePlaneOnly: true, movementCostFt: 5 }));
    expect(dnd5eSrdCompendiumEntry("tree-stride")?.data).toEqual(expect.objectContaining({ level: 5, treeRangeFt: 500, requiresSameKind: true, usesPerTurn: 1 }));
    expect(dnd5eSrdCompendiumEntry("true-polymorph")?.data).toEqual(expect.objectContaining({ level: 9, lastsUntilDispelledAfterFullDuration: true, objectIntoCreatureMaxCr: 9 }));
    expect(dnd5eSrdCompendiumEntry("true-resurrection")?.data).toEqual(expect.objectContaining({ level: 9, materialCostGp: 25000, deathAgeLimitYears: 200, canProvideNewBody: true }));
    expect(dnd5eSrdCompendiumEntry("true-seeing")?.data).toEqual(expect.objectContaining({ level: 6, sense: "Truesight", senseRangeFt: 120 }));
    expect(dnd5eSrdCompendiumEntry("true-strike")?.data).toEqual(expect.objectContaining({ level: 0, usesSpellcastingAbilityForWeapon: true, cantripExtraDamageScaling: { 5: "1d6", 11: "2d6", 17: "3d6" } }));
    expect(dnd5eSrdCompendiumEntry("unseen-servant")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, createdServant: expect.objectContaining({ ac: 10, hp: 1, strength: 2 }), commandMoveFt: 15 }));
    expect(dnd5eSrdCompendiumEntry("vampiric-touch")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "3d6", healingFromDamage: "half necrotic damage dealt", repeatAction: "Magic" }));
    expect(dnd5eSrdCompendiumEntry("vicious-mockery")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d6", nextAttackRollDisadvantage: true }));
    expect(dnd5eSrdCompendiumEntry("wall-of-fire")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "5d8", damagingSideDistanceFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("wall-of-force")?.data).toEqual(expect.objectContaining({ level: 5, immuneToAllDamage: true, cannotBeDispelled: true, blocksEtherealTravel: true }));
    expect(dnd5eSrdCompendiumEntry("wall-of-ice")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "10d6", secondaryDamageFormula: "5d6", wallAc: 12 }));
    expect(dnd5eSrdCompendiumEntry("wall-of-stone")?.data).toEqual(expect.objectContaining({ level: 5, wallAc: 15, hpPerInchThickness: 30, permanentAfterFullDuration: true }));
    expect(dnd5eSrdCompendiumEntry("wall-of-thorns")?.data).toEqual(expect.objectContaining({ level: 6, damageFormula: "7d8", secondaryDamageFormula: "7d8", movementCostMultiplier: 4 }));
    expect(dnd5eSrdCompendiumEntry("warding-bond")?.data).toEqual(expect.objectContaining({ level: 2, effectArmorClassBonus: 1, savingThrowBonus: 1, casterTakesMatchingDamage: true }));
    expect(dnd5eSrdCompendiumEntry("water-breathing")?.data).toEqual(expect.objectContaining({ level: 3, ritual: true, targetCount: 10, grantsWaterBreathing: true }));
    expect(dnd5eSrdCompendiumEntry("water-walk")?.data).toEqual(expect.objectContaining({ level: 3, ritual: true, treatsLiquidAsSolidGround: true, liquidTransitionAction: "bonus" }));
    expect(dnd5eSrdCompendiumEntry("weird")?.data).toEqual(expect.objectContaining({ level: 9, damageFormula: "10d10", secondaryDamageFormula: "5d10", condition: "Frightened" }));
    expect(dnd5eSrdCompendiumEntry("wind-walk")?.data).toEqual(expect.objectContaining({ level: 6, flySpeedFt: 300, canHover: true, transformationCondition: "Stunned" }));
    expect(dnd5eSrdCompendiumEntry("wind-wall")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "4d8", blocksGases: true, deflectsOrdinaryProjectiles: true }));
    expect(dnd5eSrdCompendiumEntry("wish")?.data).toEqual(expect.objectContaining({ level: 9, duplicatesSpellLevelMax: 8, wishOptions: expect.arrayContaining(["Reshape Reality"]), objectValueLimitGp: 25000 }));
    expect(dnd5eSrdCompendiumEntry("word-of-recall")?.data).toEqual(expect.objectContaining({ level: 6, teleports: true, targetCount: 6, noEffectWithoutPreparedSanctuary: true }));
    expect(dnd5eSrdCompendiumEntry("zone-of-truth")?.data).toEqual(expect.objectContaining({ level: 2, save: { ability: "charisma" }, casterKnowsSaveResult: true, canBeEvasiveWhileTruthful: true }));
    expect(dnd5eSrdCompendiumEntry("bane")?.data).toEqual(expect.objectContaining({ level: 1, penaltyFormula: "1d4", save: { ability: "charisma" }, upcastTargets: { base: 3, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("bless")?.data).toEqual(expect.objectContaining({ level: 1, bonusFormula: "1d4", affectedRolls: ["attack", "save"], upcastTargets: { base: 3, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("burning-hands")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "3d6", upcastFormula: "1d6", damageType: "fire", save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("chromatic-orb")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "3d8", upcastFormula: "1d8" }));
    expect(dnd5eSrdCompendiumEntry("clairvoyance")?.data).toEqual(expect.objectContaining({ level: 3, materialCostGp: 100, sensor: "Invisible, intangible, invulnerable sensor", senseOptions: ["seeing", "hearing"] }));
    expect(dnd5eSrdCompendiumEntry("color-spray")?.data).toEqual(expect.objectContaining({ level: 1, condition: "Blinded", save: { ability: "constitution" } }));
    expect(dnd5eSrdCompendiumEntry("command")?.data).toEqual(expect.objectContaining({ level: 1, save: { ability: "wisdom" }, commandOptions: expect.arrayContaining(["Grovel"]) }));
    expect(dnd5eSrdCompendiumEntry("counterspell")?.data).toEqual(expect.objectContaining({ level: 3, action: "reaction", save: { ability: "constitution" }, interruptsSpell: true }));
    expect(dnd5eSrdCompendiumEntry("detect-thoughts")?.data).toEqual(expect.objectContaining({ level: 2, thoughtDetectionRangeFt: 30, save: { ability: "wisdom" }, blockedBy: expect.arrayContaining(["thin sheet of lead"]) }));
    expect(dnd5eSrdCompendiumEntry("dispel-magic")?.data).toEqual(expect.objectContaining({ level: 3, dispelsSpellLevel: 3, spellcastingAbilityCheck: { dcFormula: "10+spell level", appliesAboveSpellLevel: 3 } }));
    expect(dnd5eSrdCompendiumEntry("fear")?.data).toEqual(expect.objectContaining({ level: 3, condition: "Frightened", save: { ability: "wisdom" }, effects: expect.arrayContaining(["drop held objects"]) }));
    expect(dnd5eSrdCompendiumEntry("fireball")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "8d6", upcastFormula: "1d6", damageType: "fire", save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("fly")?.data).toEqual(expect.objectContaining({ level: 3, flySpeedFt: 60, canHover: true, upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("gaseous-form")?.data).toEqual(expect.objectContaining({ level: 3, flySpeedFt: 10, canHover: true, resistance: expect.arrayContaining(["bludgeoning"]), immunity: ["Prone"], preventsAttacks: true }));
    expect(dnd5eSrdCompendiumEntry("ice-knife")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d10", secondaryDamageFormula: "2d6", secondaryUpcastFormula: "1d6" }));
    expect(dnd5eSrdCompendiumEntry("identify")?.data).toEqual(expect.objectContaining({ level: 1, ritual: true, materialCostGp: 100, effects: expect.arrayContaining(["learn magic item properties"]) }));
    expect(dnd5eSrdCompendiumEntry("invisibility")?.data).toEqual(expect.objectContaining({ level: 2, condition: "Invisible", upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("lesser-restoration")?.data).toEqual(expect.objectContaining({ level: 2, action: "bonus", conditionsEnded: ["Blinded", "Deafened", "Paralyzed", "Poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("lightning-bolt")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "8d6", upcastFormula: "1d6", damageType: "lightning", save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("mage-armor")?.data).toEqual(expect.objectContaining({ level: 1, baseArmorClass: 13, baseArmorClassAbility: "dexterity", requiresNoArmor: true }));
    expect(dnd5eSrdCompendiumEntry("mass-healing-word")?.data).toEqual(expect.objectContaining({ level: 3, healingFormula: "2d4+@spellcasting", upcastFormula: "1d4", targetCount: 6 }));
    expect(dnd5eSrdCompendiumEntry("prayer-of-healing")?.data).toEqual(expect.objectContaining({ level: 2, action: "10 minutes", healingFormula: "2d8", upcastFormula: "1d8", targetCount: 5, shortRestBenefit: true }));
    expect(dnd5eSrdCompendiumEntry("ray-of-sickness")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d8", upcastFormula: "1d8" }));
    expect(dnd5eSrdCompendiumEntry("revivify")?.data).toEqual(expect.objectContaining({ level: 3, healing: "reviveWith1HitPoint", revivesDead: true, consumedMaterialCostGp: 300 }));
    expect(dnd5eSrdCompendiumEntry("divine-smite")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d8", upcastFormula: "1d8", damageType: "radiant" }));
    expect(dnd5eSrdCompendiumEntry("hunters-mark")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", damageType: "force", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("spirit-guardians")?.data).toEqual(expect.objectContaining({ level: 3, damageFormula: "3d8", upcastFormula: "1d8", save: { ability: "wisdom", success: "half" }, speedMultiplier: 0.5 }));
    expect(dnd5eSrdCompendiumEntry("spiritual-weapon")?.data).toEqual(expect.objectContaining({ level: 2, spellAttack: true, damageFormula: "1d8+@spellcasting", upcastFormula: "1d8", summonedWeaponMoveFt: 20 }));
    expect(dnd5eSrdCompendiumEntry("sorcerous-burst")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d8", damageType: "choice" }));
    expect(dnd5eSrdCompendiumEntry("eldritch-blast")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d10", damageType: "force" }));
    expect(dnd5eSrdCompendiumEntry("hex")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", damageType: "necrotic", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("dissonant-whispers")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "3d6", upcastFormula: "1d6", damageType: "psychic", save: { ability: "wisdom", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("enhance-ability")?.data).toEqual(expect.objectContaining({ level: 2, advantageAbilityChecks: expect.arrayContaining(["strength", "charisma"]), upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("enlarge-reduce")?.data).toEqual(expect.objectContaining({ level: 2, sizeChange: "increase or decrease one size category", damageBonusFormula: "1d4", damagePenaltyFormula: "1d4", save: { ability: "constitution" } }));
    expect(dnd5eSrdCompendiumEntry("dragons-breath")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "3d6", upcastFormula: "1d6", damageType: "choice", damageTypes: expect.arrayContaining(["fire"]), concentration: true, save: { ability: "dexterity", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("mind-spike")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "3d8", upcastFormula: "1d8", damageType: "psychic", concentration: true }));
    expect(dnd5eSrdCompendiumEntry("misty-step")?.data).toEqual(expect.objectContaining({ level: 2, action: "bonus", teleportsFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("ensnaring-strike")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", upcastFormula: "1d6", condition: "Restrained", save: { ability: "strength" } }));
    expect(dnd5eSrdCompendiumEntry("starry-wisp")?.data).toEqual(expect.objectContaining({ level: 0, damageFormula: "1d8", damageType: "radiant", spellAttack: true }));
    expect(dnd5eSrdCompendiumEntry("guiding-bolt")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "4d6", upcastFormula: "1d6", damageType: "radiant", spellAttack: true }));
    expect(dnd5eSrdCompendiumEntry("aura-of-life")?.data).toEqual(expect.objectContaining({ level: 4, recurringHealingFormula: "1", resistance: ["necrotic"], concentration: true }));
    expect(dnd5eSrdCompendiumEntry("haste")?.data).toEqual(expect.objectContaining({ level: 3, speedMultiplier: 2, effectArmorClassBonus: 2, savingThrowAdvantage: ["dexterity"] }));
    expect(dnd5eSrdCompendiumEntry("hypnotic-pattern")?.data).toEqual(expect.objectContaining({ level: 3, condition: "Charmed", additionalConditions: ["Incapacitated"], save: { ability: "wisdom" } }));
    expect(dnd5eSrdCompendiumEntry("charm-monster")?.data).toEqual(expect.objectContaining({ level: 4, condition: "Charmed", save: { ability: "wisdom" }, upcastTargets: { base: 1, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("elementalism")?.data).toEqual(expect.objectContaining({ level: 0, effects: expect.arrayContaining(["Sculpt Element"]) }));
    expect(dnd5eSrdCompendiumEntry("phantasmal-force")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d8", damageType: "psychic", save: { ability: "intelligence" } }));
    expect(dnd5eSrdCompendiumEntry("magic-missile")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "3d4+3", upcastFormula: "1d4+1", automaticHit: true }));
    expect(dnd5eSrdCompendiumEntry("mass-cure-wounds")?.data).toEqual(expect.objectContaining({ level: 5, healingFormula: "5d8+@spellcasting", upcastFormula: "1d8", targetCount: 6, area: "30-foot-radius sphere" }));
    expect(dnd5eSrdCompendiumEntry("power-word-heal")?.data).toEqual(expect.objectContaining({ level: 9, healing: "all hit points", conditionsEnded: expect.arrayContaining(["Stunned"]) }));
    expect(dnd5eSrdCompendiumEntry("scorching-ray")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "2d6", spellAttack: true, rayCount: 3, upcastRays: { base: 3, perSlotAbove: 1 } }));
    expect(dnd5eSrdCompendiumEntry("see-invisibility")?.data).toEqual(expect.objectContaining({ level: 2, effects: expect.arrayContaining(["see into the Ethereal Plane"]) }));
    expect(dnd5eSrdCompendiumEntry("searing-smite")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "1d6", upcastFormula: "1d6", recurringSave: { ability: "constitution", success: "ends" } }));
    expect(dnd5eSrdCompendiumEntry("shield")?.data).toEqual(expect.objectContaining({ level: 1, action: "reaction", effectArmorClassBonus: 5, blocksDamageFrom: ["magic-missile"] }));
    expect(dnd5eSrdCompendiumEntry("shatter")?.data).toEqual(expect.objectContaining({ level: 2, damageFormula: "3d8", upcastFormula: "1d8", constructSaveDisadvantage: true, save: { ability: "constitution", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("silence")?.data).toEqual(expect.objectContaining({ level: 2, ritual: true, condition: "Deafened", immunity: ["thunder"], blocksVerbalComponents: true }));
    expect(dnd5eSrdCompendiumEntry("slow")?.data).toEqual(expect.objectContaining({ level: 3, targetCount: 6, save: { ability: "wisdom" }, armorClassPenalty: 2, preventsReactions: true }));
    expect(dnd5eSrdCompendiumEntry("stinking-cloud")?.data).toEqual(expect.objectContaining({ level: 3, condition: "Poisoned", obscurement: "Heavily Obscured", preventsActions: true, preventsBonusActions: true }));
    expect(dnd5eSrdCompendiumEntry("suggestion")?.data).toEqual(expect.objectContaining({ level: 2, condition: "Charmed", suggestionLimit: "25 words", save: { ability: "wisdom" } }));
    expect(dnd5eSrdCompendiumEntry("summon-dragon")?.data).toEqual(expect.objectContaining({ level: 5, summon: expect.objectContaining({ statBlock: "Draconic Spirit", breathWeaponFormula: "2d6" }) }));
    expect(dnd5eSrdCompendiumEntry("tsunami")?.data).toEqual(expect.objectContaining({ level: 8, damageFormula: "6d10", secondaryDamageFormula: "5d10", save: { ability: "strength", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("thunderwave")?.data).toEqual(expect.objectContaining({ level: 1, damageFormula: "2d8", upcastFormula: "1d8", damageType: "thunder", save: { ability: "constitution", success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("vitriolic-sphere")?.data).toEqual(expect.objectContaining({ level: 4, damageFormula: "10d4", upcastFormula: "2d4", secondaryDamageFormula: "5d4", save: { ability: "dexterity", success: "half initial damage only" } }));
    expect(dnd5eSrdCompendiumEntry("web")?.data).toEqual(expect.objectContaining({ level: 2, condition: "Restrained", secondaryDamageFormula: "2d4", save: { ability: "dexterity" } }));
    expect(dnd5eSrdCompendiumEntry("club")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 0.1, damageType: "bludgeoning", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("dagger")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 2, damageType: "piercing", mastery: "nick", range: "20/60" }));
    expect(dnd5eSrdCompendiumEntry("greatclub")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 0.2, properties: ["two-handed"], mastery: "push" }));
    expect(dnd5eSrdCompendiumEntry("handaxe")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 5, properties: ["light", "thrown"], mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("javelin")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 0.5, range: "30/120", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("light-hammer")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 2, range: "20/60", mastery: "nick" }));
    expect(dnd5eSrdCompendiumEntry("mace")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 5, mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("sickle")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 1, damageType: "slashing", mastery: "nick" }));
    expect(dnd5eSrdCompendiumEntry("quarterstaff")?.data).toEqual(expect.objectContaining({ damage: "1d6", versatileDamage: "1d8", costGp: 0.2, mastery: "topple" }));
    expect(dnd5eSrdCompendiumEntry("dart")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 0.05, weaponKind: "ranged", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("light-crossbow")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 25, range: "80/320", ammunition: "bolt", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("shortbow")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 25, damageType: "piercing", range: "80/320", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("sling")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 0.1, range: "30/120", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("battleaxe")?.data).toEqual(expect.objectContaining({ damage: "1d8", versatileDamage: "1d10", costGp: 10, mastery: "topple" }));
    expect(dnd5eSrdCompendiumEntry("flail")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 10, damageType: "bludgeoning", mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("glaive")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 20, properties: ["heavy", "reach", "two-handed"], mastery: "graze" }));
    expect(dnd5eSrdCompendiumEntry("greataxe")?.data).toEqual(expect.objectContaining({ damage: "1d12", costGp: 30, mastery: "cleave" }));
    expect(dnd5eSrdCompendiumEntry("greatsword")?.data).toEqual(expect.objectContaining({ damage: "2d6", costGp: 50, damageType: "slashing", mastery: "graze" }));
    expect(dnd5eSrdCompendiumEntry("halberd")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 20, mastery: "cleave" }));
    expect(dnd5eSrdCompendiumEntry("lance")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 10, special: "two-handed unless mounted", mastery: "topple" }));
    expect(dnd5eSrdCompendiumEntry("longbow")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 50, damageType: "piercing", range: "150/600", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("maul")?.data).toEqual(expect.objectContaining({ damage: "2d6", costGp: 10, damageType: "bludgeoning", mastery: "topple" }));
    expect(dnd5eSrdCompendiumEntry("morningstar")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 15, damageType: "piercing", mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("pike")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 5, properties: ["heavy", "reach", "two-handed"], mastery: "push" }));
    expect(dnd5eSrdCompendiumEntry("rapier")?.data).toEqual(expect.objectContaining({ damage: "1d8", costGp: 25, properties: ["finesse"], mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("scimitar")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 25, damageType: "slashing", mastery: "nick" }));
    expect(dnd5eSrdCompendiumEntry("shortsword")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 10, damageType: "piercing", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("studded-leather-armor")?.data).toEqual(expect.objectContaining({ armorBase: 12, armorType: "light", costGp: 45, weightLb: 13 }));
    expect(dnd5eSrdCompendiumEntry("spear")?.data).toEqual(expect.objectContaining({ damage: "1d6", versatileDamage: "1d8", costGp: 1, mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("trident")?.data).toEqual(expect.objectContaining({ damage: "1d8", versatileDamage: "1d10", costGp: 5, mastery: "topple" }));
    expect(dnd5eSrdCompendiumEntry("warhammer")?.data).toEqual(expect.objectContaining({ damage: "1d8", versatileDamage: "1d10", costGp: 15, mastery: "push" }));
    expect(dnd5eSrdCompendiumEntry("war-pick")?.data).toEqual(expect.objectContaining({ damage: "1d8", versatileDamage: "1d10", costGp: 5, mastery: "sap" }));
    expect(dnd5eSrdCompendiumEntry("whip")?.data).toEqual(expect.objectContaining({ damage: "1d4", costGp: 2, properties: ["finesse", "reach"], mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("blowgun")?.data).toEqual(expect.objectContaining({ damage: "1", costGp: 10, range: "25/100", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("hand-crossbow")?.data).toEqual(expect.objectContaining({ damage: "1d6", costGp: 75, range: "30/120", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("heavy-crossbow")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 50, range: "100/400", mastery: "push" }));
    expect(dnd5eSrdCompendiumEntry("musket")?.data).toEqual(expect.objectContaining({ damage: "1d12", costGp: 500, range: "40/120", mastery: "slow" }));
    expect(dnd5eSrdCompendiumEntry("pistol")?.data).toEqual(expect.objectContaining({ damage: "1d10", costGp: 250, range: "30/90", mastery: "vex" }));
    expect(dnd5eSrdCompendiumEntry("musical-instrument")?.data).toEqual(expect.objectContaining({ toolId: "musical-instrument", costGp: 2 }));
    expect(dnd5eSrdCompendiumEntry("arcane-focus")?.data).toEqual(expect.objectContaining({ focusType: "arcane", costGp: 10 }));
    const srdToolEntryIds = [
      "alchemists-supplies",
      "brewers-supplies",
      "carpenters-tools",
      "cartographers-tools",
      "cobblers-tools",
      "cooks-utensils",
      "glassblowers-tools",
      "jewelers-tools",
      "leatherworkers-tools",
      "masons-tools",
      "painters-supplies",
      "potters-tools",
      "smiths-tools",
      "tinkers-tools",
      "weavers-tools",
      "woodcarvers-tools",
      "disguise-kit",
      "forgery-kit",
      "gaming-set",
      "dice-set",
      "dragonchess-set",
      "playing-cards",
      "three-dragon-ante-set",
      "herbalism-kit",
      "bagpipes",
      "drum",
      "dulcimer",
      "flute",
      "horn",
      "lute",
      "lyre",
      "pan-flute",
      "shawm",
      "viol",
      "navigators-tools",
      "poisoners-kit"
    ];
    const srdAdventuringGearEntryIds = [
      "acid",
      "alchemists-fire",
      "antitoxin",
      "arrows",
      "crossbow-bolts",
      "firearm-bullets",
      "sling-bullets",
      "blowgun-needles",
      "arcane-focus-crystal",
      "arcane-focus-orb",
      "arcane-focus-rod",
      "arcane-focus-staff",
      "arcane-focus-wand",
      "backpack",
      "ball-bearings",
      "barrel",
      "basket",
      "bedroll",
      "bell",
      "blanket",
      "block-and-tackle",
      "book",
      "glass-bottle",
      "bucket",
      "burglars-pack",
      "caltrops",
      "candle",
      "crossbow-bolt-case",
      "map-or-scroll-case",
      "chain",
      "chest",
      "climbers-kit",
      "fine-clothes",
      "travelers-clothes",
      "component-pouch",
      "costume",
      "crowbar",
      "diplomats-pack",
      "druidic-focus-sprig-of-mistletoe",
      "druidic-focus-wooden-staff",
      "druidic-focus-yew-wand",
      "dungeoneers-pack",
      "entertainers-pack",
      "explorers-pack",
      "flask",
      "grappling-hook",
      "healers-kit",
      "holy-symbol-amulet",
      "holy-symbol-emblem",
      "holy-symbol-reliquary",
      "holy-water",
      "hunting-trap",
      "ink",
      "ink-pen",
      "jug",
      "ladder",
      "lamp",
      "bullseye-lantern",
      "hooded-lantern",
      "lock",
      "magnifying-glass",
      "manacles",
      "map",
      "mirror",
      "net",
      "oil",
      "paper",
      "parchment",
      "perfume",
      "basic-poison",
      "pole",
      "iron-pot",
      "potion-of-healing",
      "pouch",
      "priests-pack",
      "quiver",
      "portable-ram",
      "rations",
      "robe",
      "rope",
      "sack",
      "scholars-pack",
      "shovel",
      "signal-whistle",
      "spell-scroll-cantrip",
      "spell-scroll-level-1",
      "iron-spikes",
      "spyglass",
      "string",
      "tent",
      "tinderbox",
      "torch",
      "vial",
      "waterskin"
    ];
    const srdMagicItemEntryIds = [
      "adamantine-armor",
      "ammunition-plus-1",
      "ammunition-plus-2",
      "ammunition-plus-3",
      "ammunition-of-slaying",
      "ammunition-1-2-or-3",
      "amulet-of-health",
      "amulet-of-proof-against-detection-and-location",
      "amulet-of-the-planes",
      "animated-shield",
      "apparatus-of-the-crab",
      "armor-plus-1",
      "armor-plus-2",
      "armor-plus-3",
      "armor-1-2-or-3",
      "armor-of-invulnerability",
      "armor-of-resistance",
      "armor-of-vulnerability",
      "arrow-catching-shield",
      "bag-of-beans",
      "bag-of-devouring",
      "bag-of-holding",
      "bag-of-tricks",
      "bead-of-force",
      "bead-of-nourishment",
      "belt-of-dwarvenkind",
      "belt-of-giant-strength",
      "berserker-axe",
      "boots-of-elvenkind",
      "boots-of-levitation",
      "boots-of-speed",
      "boots-of-striding-and-springing",
      "boots-of-the-winterlands",
      "bowl-of-commanding-water-elementals",
      "bracers-of-archery",
      "bracers-of-defense",
      "brazier-of-commanding-fire-elementals",
      "brooch-of-shielding",
      "broom-of-flying",
      "candle-of-invocation",
      "cape-of-the-mountebank",
      "carpet-of-flying",
      "censer-of-controlling-air-elementals",
      "chime-of-opening",
      "circlet-of-blasting",
      "cloak-of-arachnida",
      "cloak-of-displacement",
      "cloak-of-elvenkind",
      "cloak-of-invisibility",
      "cloak-of-protection",
      "cloak-of-the-bat",
      "cloak-of-the-manta-ray",
      "crystal-ball",
      "crystal-ball-of-mind-reading",
      "crystal-ball-of-telepathy",
      "crystal-ball-of-true-seeing",
      "cube-of-force",
      "cubic-gate",
      "dagger-of-venom",
      "dancing-sword",
      "decanter-of-endless-water",
      "deck-of-illusions",
      "defender",
      "demon-armor",
      "dimensional-shackles",
      "dragon-orb",
      "dragon-scale-mail",
      "dragon-slayer",
      "dust-of-disappearance",
      "dust-of-dryness",
      "dust-of-sneezing-and-choking",
      "dwarven-plate",
      "dwarven-thrower",
      "efficient-quiver",
      "efreeti-bottle",
      "elemental-gem",
      "elixir-of-health",
      "elven-chain",
      "energy-bow",
      "eversmoking-bottle",
      "eyes-of-charming",
      "eyes-of-minute-seeing",
      "eyes-of-the-eagle",
      "feather-token",
      "figurine-of-wondrous-power",
      "flame-tongue",
      "folding-boat",
      "frost-brand",
      "gauntlets-of-ogre-power",
      "gem-of-brightness",
      "gem-of-seeing",
      "giant-slayer",
      "glamoured-studded-leather",
      "gloves-of-missile-snaring",
      "gloves-of-swimming-and-climbing",
      "gloves-of-thievery",
      "goggles-of-night",
      "hammer-of-thunderbolts",
      "handy-haversack",
      "hat-of-disguise",
      "hat-of-many-spells",
      "headband-of-intellect",
      "helm-of-brilliance",
      "helm-of-comprehending-languages",
      "helm-of-telepathy",
      "helm-of-teleportation",
      "holy-avenger",
      "horn-of-blasting",
      "horn-of-valhalla",
      "horseshoes-of-a-zephyr",
      "horseshoes-of-speed",
      "immovable-rod",
      "instant-fortress",
      "ioun-stone",
      "iron-bands",
      "iron-flask",
      "javelin-of-lightning",
      "lantern-of-revealing",
      "luck-blade",
      "mace-of-disruption",
      "mace-of-smiting",
      "mace-of-terror",
      "mantle-of-spell-resistance",
      "manual-of-bodily-health",
      "manual-of-gainful-exercise",
      "manual-of-golems",
      "manual-of-quickness-of-action",
      "marvelous-pigments",
      "medallion-of-thoughts",
      "mirror-of-life-trapping",
      "mysterious-deck",
      "necklace-of-adaptation",
      "necklace-of-fireballs",
      "necklace-of-prayer-beads",
      "nine-lives-stealer",
      "oathbow",
      "oil-of-etherealness",
      "oil-of-sharpness",
      "oil-of-slipperiness",
      "pearl-of-power",
      "periapt-of-health",
      "periapt-of-proof-against-poison",
      "periapt-of-wound-closure",
      "philter-of-love",
      "pipes-of-haunting",
      "pipes-of-the-sewers",
      "plate-armor-of-etherealness",
      "portable-hole",
      "potion-of-giant-strength",
      "potions-of-healing",
      "quarterstaff-of-the-acrobatweapon-quarterstaff-very-rare-requires-attunement",
      "ring-of-animal-influence",
      "ring-of-djinni-summoning",
      "ring-of-elemental-command",
      "ring-of-evasion",
      "ring-of-feather-falling",
      "ring-of-jumping",
      "ring-of-mind-shielding",
      "ring-of-shooting-stars",
      "ring-of-spell-storing",
      "ring-of-spell-turning",
      "ring-of-swimming",
      "ring-of-telekinesis",
      "ring-of-the-ram",
      "ring-of-three-wishes",
      "ring-of-warmth",
      "ring-of-water-walking",
      "ring-of-x-ray-vision",
      "robe-of-eyes",
      "robe-of-scintillating-colors",
      "robe-of-stars",
      "robe-of-the-archmagi",
      "robe-of-useful-items",
      "rod-of-absorption",
      "rod-of-alertness",
      "rod-of-lordly-might",
      "rod-of-resurrection",
      "rod-of-rulership",
      "rod-of-security",
      "rope-of-climbing",
      "rope-of-entanglement",
      "scarab-of-protection",
      "scimitar-of-speed",
      "sending-stones",
      "sentinel-shield",
      "shield-1-2-or-3",
      "shield-of-missile-attraction",
      "shield-of-the-cavalier",
      "slippers-of-spider-climbing",
      "sovereign-glue",
      "spellguard-shield",
      "spell-scroll",
      "sphere-of-annihilation",
      "staff-of-charming",
      "staff-of-fire",
      "staff-of-frost",
      "staff-of-swarming-insects",
      "staff-of-the-magi",
      "staff-of-the-python",
      "staff-of-the-woodlands",
      "staff-of-thunder-and-lightning",
      "staff-of-withering",
      "stone-of-controlling-earth-elementals",
      "stone-of-good-luck-luckstone",
      "sun-blade",
      "sword-of-life-stealing",
      "sword-of-sharpness",
      "sword-of-wounding",
      "talisman-of-pure-good",
      "talisman-of-the-sphere",
      "talisman-of-ultimate-evil",
      "thunderous-greatclub",
      "tome-of-clear-thought",
      "tome-of-leadership-and-influence",
      "tome-of-understanding",
      "trident-of-fish-command",
      "universal-solvent",
      "vicious-weapon",
      "vorpal-sword",
      "wand-of-binding",
      "wand-of-enemy-detection",
      "wand-of-fear",
      "wand-of-paralysis",
      "wand-of-polymorph",
      "wand-of-secrets",
      "wand-of-the-war-mage-1-2-or-3",
      "wand-of-web",
      "wand-of-wonder",
      "weapon-1-2-or-3",
      "well-of-many-worlds",
      "wind-fan",
      "winged-boots",
      "wings-of-flying",
      "potion-of-animal-friendship",
      "potion-of-clairvoyance",
      "potion-of-climbing",
      "potion-of-diminution",
      "potion-of-flying",
      "potion-of-gaseous-form",
      "potion-of-giant-strength-hill",
      "potion-of-giant-strength-frost-or-stone",
      "potion-of-giant-strength-fire",
      "potion-of-giant-strength-cloud",
      "potion-of-giant-strength-storm",
      "potion-of-growth",
      "potion-of-healing-greater",
      "potion-of-healing-superior",
      "potion-of-healing-supreme",
      "potion-of-heroism",
      "potion-of-invisibility",
      "potion-of-invulnerability",
      "potion-of-longevity",
      "potion-of-mind-reading",
      "potion-of-poison",
      "potion-of-resistance",
      "potion-of-speed",
      "potion-of-vitality",
      "potion-of-water-breathing",
      "ring-of-free-action",
      "ring-of-invisibility",
      "ring-of-protection",
      "ring-of-regeneration",
      "ring-of-resistance",
      "shield-plus-1",
      "shield-plus-2",
      "shield-plus-3",
      "spell-scroll-level-2",
      "spell-scroll-level-3",
      "spell-scroll-level-4",
      "spell-scroll-level-5",
      "spell-scroll-level-6",
      "spell-scroll-level-7",
      "spell-scroll-level-8",
      "spell-scroll-level-9",
      "staff-of-healing",
      "staff-of-power",
      "staff-of-striking",
      "wand-of-fireballs",
      "wand-of-lightning-bolts",
      "wand-of-magic-detection",
      "wand-of-magic-missiles",
      "wand-of-the-war-mage-plus-1",
      "wand-of-the-war-mage-plus-2",
      "wand-of-the-war-mage-plus-3",
      "weapon-plus-1",
      "weapon-plus-2",
      "weapon-plus-3",
      "weapon-of-warning"
    ];
    expect([...srdToolEntryIds, ...srdAdventuringGearEntryIds, ...srdMagicItemEntryIds].filter((entryId) => !dnd5eSrdCompendiumEntry(entryId))).toEqual([]);
    expect(dnd5eSrdCompendiumEntry("alchemists-supplies")?.data).toEqual(expect.objectContaining({ category: "tool", toolId: "alchemists-supplies", ability: "intelligence", costGp: 50, weightLb: 8 }));
    expect(dnd5eSrdCompendiumEntry("dice-set")?.data).toEqual(expect.objectContaining({ toolGroup: "gaming-set", variantOf: "gaming-set", costGp: 0.1, weightLb: 0 }));
    expect(dnd5eSrdCompendiumEntry("flute")?.data).toEqual(expect.objectContaining({ toolGroup: "musical-instrument", variantOf: "musical-instrument", costGp: 2, weightLb: 1 }));
    expect(dnd5eSrdCompendiumEntry("navigators-tools")?.data).toEqual(expect.objectContaining({ toolId: "navigators-tools", ability: "wisdom", costGp: 25, weightLb: 2 }));
    expect(dnd5eSrdCompendiumEntry("arrows")?.data).toEqual(expect.objectContaining({ ammunition: "arrow", amountPerPurchase: 20, storage: "quiver", costGp: 1 }));
    expect(dnd5eSrdCompendiumEntry("burglars-pack")?.data).toEqual(expect.objectContaining({ pack: true, costGp: 16, weightLb: 42, contents: expect.arrayContaining(["backpack", "crowbar", "hooded-lantern"]) }));
    expect(dnd5eSrdCompendiumEntry("healers-kit")?.data).toEqual(expect.objectContaining({ uses: 10, action: "utilize", stabilizesAtZeroHp: true, costGp: 5 }));
    expect(dnd5eSrdCompendiumEntry("potion-of-healing")?.data).toEqual(expect.objectContaining({ magicItem: true, healingFormula: "2d4+2", costGp: 50 }));
    expect(dnd5eSrdCompendiumEntry("spell-scroll-level-1")?.data).toEqual(expect.objectContaining({ magicItem: true, scrollLevel: 1, spellSaveDc: 13, spellAttackBonus: 5 }));
    expect(dnd5eSrdCompendiumEntry("ammunition-of-slaying")?.data).toEqual(expect.objectContaining({ magicItem: true, rarity: "very rare", extraDamageFormula: "6d10", save: { ability: "constitution", dc: 17, success: "half" } }));
    expect(dnd5eSrdCompendiumEntry("ammunition-1-2-or-3")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ bonus: 3, rarity: "very rare" })]), becomesNonmagicalOnHit: true }));
    expect(dnd5eSrdCompendiumEntry("amulet-of-the-planes")?.data).toEqual(expect.objectContaining({ spell: "plane-shift", check: { ability: "intelligence", skill: "arcana", dc: 15 }, randomDestinationTable: "1d100 creature-type planes" }));
    expect(dnd5eSrdCompendiumEntry("apparatus-of-the-crab")?.data).toEqual(expect.objectContaining({ vehicle: true, ac: 20, hp: 200, maxDepthFt: 900, clawAttack: expect.objectContaining({ attackBonus: 8 }) }));
    expect(dnd5eSrdCompendiumEntry("armor-1-2-or-3")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ bonus: 2, rarity: "very rare" })]) }));
    expect(dnd5eSrdCompendiumEntry("armor-of-vulnerability")?.data).toEqual(expect.objectContaining({ cursed: true, resistanceChoice: ["bludgeoning", "piercing", "slashing"], vulnerabilityToOtherPhysicalDamageTypes: true }));
    expect(dnd5eSrdCompendiumEntry("bag-of-beans")?.data).toEqual(expect.objectContaining({ chargesFormula: "3d4 beans", dumpExplosion: expect.objectContaining({ damageFormula: "5d4" }), plantedEffectTable: "1d100" }));
    expect(dnd5eSrdCompendiumEntry("bag-of-devouring")?.data).toEqual(expect.objectContaining({ extradimensionalCreature: true, pullInsideChancePercent: 50, devoursCreaturesAtTurnStart: true }));
    expect(dnd5eSrdCompendiumEntry("bead-of-force")?.data).toEqual(expect.objectContaining({ consumable: true, thrownRangeFt: 60, damageFormula: "5d4", forceSphereDuration: "1 minute" }));
    expect(dnd5eSrdCompendiumEntry("belt-of-dwarvenkind")?.data).toEqual(expect.objectContaining({ languageProficiency: ["dwarvish"], abilityScoreIncrease: { constitution: 2, max: 20 } }));
    expect(dnd5eSrdCompendiumEntry("belt-of-giant-strength")?.data).toEqual(expect.objectContaining({ variants: expect.arrayContaining([expect.objectContaining({ giantType: "storm", strength: 29 })]) }));
    expect(dnd5eSrdCompendiumEntry("berserker-axe")?.data).toEqual(expect.objectContaining({ magicBonus: 1, hitPointMaximumBonusPerLevel: 1, cursed: true, berserkSave: expect.objectContaining({ dc: 15 }) }));
    expect(dnd5eSrdCompendiumEntry("boots-of-levitation")?.data).toEqual(expect.objectContaining({ spell: "levitate", target: "self" }));
    expect(dnd5eSrdCompendiumEntry("bowl-of-commanding-water-elementals")?.data).toEqual(expect.objectContaining({ summons: "Water Elemental", recovery: "next dawn", capacityGallons: 3 }));
    expect(dnd5eSrdCompendiumEntry("brazier-of-commanding-fire-elementals")?.data).toEqual(expect.objectContaining({ summons: "Fire Elemental", recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("brooch-of-shielding")?.data).toEqual(expect.objectContaining({ resistance: ["force"], immunityFromSpell: "magic-missile" }));
    expect(dnd5eSrdCompendiumEntry("broom-of-flying")?.data).toEqual(expect.objectContaining({ flySpeedFt: 50, capacityLb: 400, soloTravelRangeMiles: 1 }));
    expect(dnd5eSrdCompendiumEntry("candle-of-invocation")?.data).toEqual(expect.objectContaining({ burnDurationHours: 4, d20TestAdvantageInLight: true, spell: "gate" }));
    expect(dnd5eSrdCompendiumEntry("cape-of-the-mountebank")?.data).toEqual(expect.objectContaining({ spell: "dimension-door", recovery: "next dawn", teleportSmoke: true }));
    expect(dnd5eSrdCompendiumEntry("carpet-of-flying")?.data).toEqual(expect.objectContaining({ controlRangeFt: 30, variants: expect.arrayContaining([expect.objectContaining({ capacityLb: 800, flySpeedFt: 30 })]) }));
    expect(dnd5eSrdCompendiumEntry("censer-of-controlling-air-elementals")?.data).toEqual(expect.objectContaining({ summons: "Air Elemental", recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("chime-of-opening")?.data).toEqual(expect.objectContaining({ spell: "knock", uses: 10, audibleRangeFt: 300 }));
    expect(dnd5eSrdCompendiumEntry("circlet-of-blasting")?.data).toEqual(expect.objectContaining({ spell: "scorching-ray", spellAttackBonus: 5 }));
    expect(dnd5eSrdCompendiumEntry("cloak-of-arachnida")?.data).toEqual(expect.objectContaining({ resistance: ["poison"], spell: "web", saveDc: 13, spellAreaMultiplier: 2 }));
    expect(dnd5eSrdCompendiumEntry("cloak-of-the-bat")?.data).toEqual(expect.objectContaining({ flySpeedFt: 40, spell: "polymorph", shapeShiftForm: "Bat" }));
    expect(dnd5eSrdCompendiumEntry("cloak-of-the-manta-ray")?.data).toEqual(expect.objectContaining({ waterBreathing: true, swimSpeedFt: 60 }));
    expect(dnd5eSrdCompendiumEntry("crystal-ball")?.data).toEqual(expect.objectContaining({ spell: "scrying", saveDc: 17 }));
    expect(dnd5eSrdCompendiumEntry("crystal-ball-of-mind-reading")?.data).toEqual(expect.objectContaining({ secondarySpell: "detect-thoughts", sensorRangeFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("crystal-ball-of-telepathy")?.data).toEqual(expect.objectContaining({ secondarySpell: "suggestion", telepathyRangeFromSensorFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("crystal-ball-of-true-seeing")?.data).toEqual(expect.objectContaining({ sense: "Truesight", senseRangeFt: 120 }));
    expect(dnd5eSrdCompendiumEntry("cube-of-force")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 10 }), faces: expect.arrayContaining([expect.objectContaining({ spell: "wall-of-force", chargeCost: 5 })]) }));
    expect(dnd5eSrdCompendiumEntry("cubic-gate")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), spells: expect.arrayContaining([expect.objectContaining({ id: "plane-shift" })]) }));
    expect(dnd5eSrdCompendiumEntry("dagger-of-venom")?.data).toEqual(expect.objectContaining({ magicBonus: 1, poisonDamageFormula: "2d10", condition: "Poisoned" }));
    expect(dnd5eSrdCompendiumEntry("dancing-sword")?.data).toEqual(expect.objectContaining({ hover: true, flySpeedFt: 30, attackCountBeforeReturn: 4 }));
    expect(dnd5eSrdCompendiumEntry("decanter-of-endless-water")?.data).toEqual(expect.objectContaining({ commandOptions: expect.arrayContaining([expect.objectContaining({ command: "Geyser", damageFormula: "1d4" })]) }));
    expect(dnd5eSrdCompendiumEntry("deck-of-illusions")?.data).toEqual(expect.objectContaining({ fullDeckCards: 34, illusionTable: "1d100", investigationCheck: expect.objectContaining({ dc: 15 }) }));
    expect(dnd5eSrdCompendiumEntry("defender")?.data).toEqual(expect.objectContaining({ magicBonus: 3, transferableArmorClassBonus: 3 }));
    expect(dnd5eSrdCompendiumEntry("demon-armor")?.data).toEqual(expect.objectContaining({ armorClassBonus: 1, languageProficiency: ["abyssal"], unarmedStrikeDamageFormula: "1d8", cursed: true }));
    expect(dnd5eSrdCompendiumEntry("dimensional-shackles")?.data).toEqual(expect.objectContaining({ blocksTeleportation: true, escapeCheck: expect.objectContaining({ dc: 30, intervalDays: 30 }) }));
    expect(dnd5eSrdCompendiumEntry("dragon-orb")?.data).toEqual(expect.objectContaining({ rarity: "artifact", craftable: false, charges: expect.objectContaining({ max: 7 }), callDragonsRangeMiles: 40 }));
    expect(dnd5eSrdCompendiumEntry("dragon-scale-mail")?.data).toEqual(expect.objectContaining({ armorClassBonus: 1, breathWeaponSaveAdvantageAgainst: "Dragons", locateDragonRangeMiles: 30 }));
    expect(dnd5eSrdCompendiumEntry("dragon-slayer")?.data).toEqual(expect.objectContaining({ magicBonus: 1, extraDamageAgainst: "Dragon", extraDamageFormula: "3d6" }));
    expect(dnd5eSrdCompendiumEntry("dust-of-disappearance")?.data).toEqual(expect.objectContaining({ consumable: true, area: "10-foot Emanation", condition: "Invisible", durationFormula: "2d4 minutes" }));
    expect(dnd5eSrdCompendiumEntry("dust-of-dryness")?.data).toEqual(expect.objectContaining({ pinchQuantityFormula: "1d6+4", waterAbsorptionCubeFt: 15, elementalDamageFormula: "10d6" }));
    expect(dnd5eSrdCompendiumEntry("dust-of-sneezing-and-choking")?.data).toEqual(expect.objectContaining({ save: expect.objectContaining({ dc: 15 }), condition: "Incapacitated", suffocating: true }));
    expect(dnd5eSrdCompendiumEntry("dwarven-plate")?.data).toEqual(expect.objectContaining({ armorClassBonus: 2, forcedMovementReductionFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("dwarven-thrower")?.data).toEqual(expect.objectContaining({ magicBonus: 3, thrownRange: "20/60", extraGiantDamageFormula: "2d8" }));
    expect(dnd5eSrdCompendiumEntry("efficient-quiver")?.data).toEqual(expect.objectContaining({ extradimensionalStorage: true, compartments: expect.arrayContaining([expect.objectContaining({ capacity: 60 })]) }));
    expect(dnd5eSrdCompendiumEntry("efreeti-bottle")?.data).toEqual(expect.objectContaining({ summons: "Efreeti", firstOpeningTable: "1d10", wishResultOn10: true }));
    expect(dnd5eSrdCompendiumEntry("elemental-gem")?.data).toEqual(expect.objectContaining({ consumable: true, summons: "Elemental", variants: expect.arrayContaining([expect.objectContaining({ summons: "Earth Elemental" })]) }));
    expect(dnd5eSrdCompendiumEntry("elixir-of-health")?.data).toEqual(expect.objectContaining({ consumable: true, curesMagicalContagions: true, endsConditions: expect.arrayContaining(["Paralyzed"]) }));
    expect(dnd5eSrdCompendiumEntry("elven-chain")?.data).toEqual(expect.objectContaining({ armorClassBonus: 1, grantsArmorTraining: ["medium", "heavy"] }));
    expect(dnd5eSrdCompendiumEntry("energy-bow")?.data).toEqual(expect.objectContaining({ magicBonus: 1, damageTypeOverride: "force", arrowOfRestraint: expect.objectContaining({ condition: "Restrained" }) }));
    expect(dnd5eSrdCompendiumEntry("eversmoking-bottle")?.data).toEqual(expect.objectContaining({ heavilyObscured: true, startingEmanationFt: 60, maxEmanationFt: 120 }));
    expect(dnd5eSrdCompendiumEntry("eyes-of-charming")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), spell: "charm-person", saveDc: 13 }));
    expect(dnd5eSrdCompendiumEntry("eyes-of-minute-seeing")?.data).toEqual(expect.objectContaining({ darkvisionFt: 1, investigationAdvantageRangeFt: 1 }));
    expect(dnd5eSrdCompendiumEntry("eyes-of-the-eagle")?.data).toEqual(expect.objectContaining({ perceptionSightAdvantage: true, distantDetailMinimumObjectSizeFt: 2 }));
    expect(dnd5eSrdCompendiumEntry("feather-token")?.data).toEqual(expect.objectContaining({ sourceRarity: "varies", tokenTable: "1d100", variants: expect.arrayContaining([expect.objectContaining({ token: "Whip", attackBonus: 9 })]) }));
    expect(dnd5eSrdCompendiumEntry("figurine-of-wondrous-power")?.data).toEqual(expect.objectContaining({ sourceRarity: "varies", throwRangeFt: 60, variants: expect.arrayContaining([expect.objectContaining({ figurine: "Obsidian Steed", summons: "Nightmare" })]) }));
    expect(dnd5eSrdCompendiumEntry("flame-tongue")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "2d6", extraDamageType: "fire", light: expect.objectContaining({ brightFt: 40 }) }));
    expect(dnd5eSrdCompendiumEntry("folding-boat")?.data).toEqual(expect.objectContaining({ boxDimensionsInches: expect.objectContaining({ length: 12 }), commandWords: expect.arrayContaining([expect.objectContaining({ transformsInto: "Keelboat" })]) }));
    expect(dnd5eSrdCompendiumEntry("frost-brand")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "1d6", resistance: ["fire"], extinguishNonmagicalFlamesRangeFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("gauntlets-of-ogre-power")?.data).toEqual(expect.objectContaining({ abilityScoreSet: { strength: 19 }, noEffectIfAbilityAtLeastScore: true }));
    expect(dnd5eSrdCompendiumEntry("gem-of-brightness")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 50 }), beamCommand: expect.objectContaining({ condition: "Blinded" }) }));
    expect(dnd5eSrdCompendiumEntry("gem-of-seeing")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), sense: "Truesight", senseRangeFt: 120 }));
    expect(dnd5eSrdCompendiumEntry("giant-slayer")?.data).toEqual(expect.objectContaining({ magicBonus: 1, extraDamageAgainst: "Giant", condition: "Prone" }));
    expect(dnd5eSrdCompendiumEntry("glamoured-studded-leather")?.data).toEqual(expect.objectContaining({ armorClassBonus: 1, illusoryAppearance: true }));
    expect(dnd5eSrdCompendiumEntry("gloves-of-missile-snaring")?.data).toEqual(expect.objectContaining({ damageReductionFormula: "1d10+dexterity", catchesMissileWhenReducedToZero: true }));
    expect(dnd5eSrdCompendiumEntry("gloves-of-swimming-and-climbing")?.data).toEqual(expect.objectContaining({ climbSpeedEqualsSpeed: true, swimSpeedEqualsSpeed: true, skillBonus: expect.objectContaining({ bonus: 5 }) }));
    expect(dnd5eSrdCompendiumEntry("gloves-of-thievery")?.data).toEqual(expect.objectContaining({ imperceptibleWhileWorn: true, skillBonus: expect.objectContaining({ skill: "sleight-of-hand", bonus: 5 }) }));
    expect(dnd5eSrdCompendiumEntry("goggles-of-night")?.data).toEqual(expect.objectContaining({ darkvisionFt: 60, darkvisionRangeIncreaseFt: 60 }));
    expect(dnd5eSrdCompendiumEntry("hammer-of-thunderbolts")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 5 }), condition: "Stunned", giantCriticalEffect: "dies" }));
    expect(dnd5eSrdCompendiumEntry("handy-haversack")?.data).toEqual(expect.objectContaining({ extradimensionalStorage: true, centralPouch: expect.objectContaining({ capacityLb: 500 }), nestingHazardRadiusFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("hat-of-disguise")?.data).toEqual(expect.objectContaining({ spell: "disguise-self", endsWhenRemoved: true }));
    expect(dnd5eSrdCompendiumEntry("hat-of-many-spells")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Wizard", unknownSpellCasting: true, failureTable: "1d100" }));
    expect(dnd5eSrdCompendiumEntry("headband-of-intellect")?.data).toEqual(expect.objectContaining({ abilityScoreSet: { intelligence: 19 }, noEffectIfAbilityAtLeastScore: true }));
    expect(dnd5eSrdCompendiumEntry("helm-of-brilliance")?.data).toEqual(expect.objectContaining({ gems: expect.objectContaining({ diamonds: "1d10" }), spells: expect.arrayContaining([expect.objectContaining({ id: "wall-of-fire" })]), catastropheAreaFt: 60 }));
    expect(dnd5eSrdCompendiumEntry("helm-of-comprehending-languages")?.data).toEqual(expect.objectContaining({ spell: "comprehend-languages" }));
    expect(dnd5eSrdCompendiumEntry("helm-of-telepathy")?.data).toEqual(expect.objectContaining({ telepathyRangeFt: 30, spells: expect.arrayContaining([expect.objectContaining({ id: "suggestion", saveDc: 13 })]) }));
    expect(dnd5eSrdCompendiumEntry("helm-of-teleportation")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), spell: "teleport" }));
    expect(dnd5eSrdCompendiumEntry("holy-avenger")?.data).toEqual(expect.objectContaining({ magicBonus: 3, extraDamageFormula: "2d10", paladinLevel17AuraFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("horn-of-blasting")?.data).toEqual(expect.objectContaining({ damageFormula: "5d8", condition: "Deafened", explosionChancePercent: 20 }));
    expect(dnd5eSrdCompendiumEntry("horn-of-valhalla")?.data).toEqual(expect.objectContaining({ sourceRarity: "varies", recoveryDays: 7, variants: expect.arrayContaining([expect.objectContaining({ horn: "Iron", spirits: 5 })]) }));
    expect(dnd5eSrdCompendiumEntry("horseshoes-of-a-zephyr")?.data).toEqual(expect.objectContaining({ floatHeightInches: 4, ignoresDifficultTerrain: true, extendedTravelHoursPerDayWithoutExhaustion: 12 }));
    expect(dnd5eSrdCompendiumEntry("horseshoes-of-speed")?.data).toEqual(expect.objectContaining({ setCount: 4, speedBonusFt: 30 }));
    expect(dnd5eSrdCompendiumEntry("immovable-rod")?.data).toEqual(expect.objectContaining({ capacityLb: 8000, moveCheck: expect.objectContaining({ dc: 30 }) }));
    expect(dnd5eSrdCompendiumEntry("instant-fortress")?.data).toEqual(expect.objectContaining({ towerDimensionsFt: expect.objectContaining({ side: 20 }), immuneFromSpell: "knock", repairSpell: "wish" }));
    expect(dnd5eSrdCompendiumEntry("ioun-stone")?.data).toEqual(expect.objectContaining({ sourceRarity: "varies", maxOrbitingStones: 3, variants: expect.arrayContaining([expect.objectContaining({ stone: "Mastery", proficiencyBonusIncrease: 1 })]) }));
    expect(dnd5eSrdCompendiumEntry("iron-bands")?.data).toEqual(expect.objectContaining({ thrownRangeFt: 60, condition: "Restrained", escapeCheck: expect.objectContaining({ dc: 20 }) }));
    expect(dnd5eSrdCompendiumEntry("iron-flask")?.data).toEqual(expect.objectContaining({ targetRangeFt: 60, save: expect.objectContaining({ dc: 17 }), capacityCreatures: 1 }));
    expect(dnd5eSrdCompendiumEntry("javelin-of-lightning")?.data).toEqual(expect.objectContaining({ lightningBoltRangeFt: 120, lightningBoltDamageFormula: "4d6", recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("lantern-of-revealing")?.data).toEqual(expect.objectContaining({ burnDurationHours: 6, revealsInvisibleInBrightLight: true, hoodedLight: expect.objectContaining({ dimFt: 5 }) }));
    expect(dnd5eSrdCompendiumEntry("luck-blade")?.data).toEqual(expect.objectContaining({ savingThrowBonus: 1, luckReroll: true, spell: "wish" }));
    expect(dnd5eSrdCompendiumEntry("mace-of-disruption")?.data).toEqual(expect.objectContaining({ extraDamageAgainst: ["Fiend", "Undead"], destroyThresholdHp: 25, light: expect.objectContaining({ brightFt: 20 }) }));
    expect(dnd5eSrdCompendiumEntry("mace-of-smiting")?.data).toEqual(expect.objectContaining({ magicBonus: 1, constructAttackBonus: 3, constructCriticalExtraDamage: 14 }));
    expect(dnd5eSrdCompendiumEntry("mace-of-terror")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), condition: "Frightened", preventsOpportunityAttacks: true }));
    expect(dnd5eSrdCompendiumEntry("mantle-of-spell-resistance")?.data).toEqual(expect.objectContaining({ savingThrowAdvantageAgainst: ["spells"] }));
    expect(dnd5eSrdCompendiumEntry("manual-of-bodily-health")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { constitution: 2, max: 30 }, magicRecoveryYears: 100 }));
    expect(dnd5eSrdCompendiumEntry("manual-of-gainful-exercise")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { strength: 2, max: 30 }, studyHours: 48 }));
    expect(dnd5eSrdCompendiumEntry("manual-of-golems")?.data).toEqual(expect.objectContaining({ requiredLevel5SpellSlots: 2, misuseDamageFormula: "6d6", variants: expect.arrayContaining([expect.objectContaining({ golem: "iron", timeDays: 120, costGp: 100000 })]) }));
    expect(dnd5eSrdCompendiumEntry("manual-of-quickness-of-action")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { dexterity: 2, max: 30 }, losesMagicAfterUse: true }));
    expect(dnd5eSrdCompendiumEntry("marvelous-pigments")?.data).toEqual(expect.objectContaining({ chargesFormula: "1d4 pots", area: "20-foot Cube", maxTotalValueGp: 500 }));
    expect(dnd5eSrdCompendiumEntry("medallion-of-thoughts")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 5 }), spell: "detect-thoughts", spellSaveDc: 13 }));
    expect(dnd5eSrdCompendiumEntry("mirror-of-life-trapping")?.data).toEqual(expect.objectContaining({ trapCapacity: 12, save: { ability: "charisma", dc: 15 }, planarTravelEscapes: true }));
    expect(dnd5eSrdCompendiumEntry("mysterious-deck")?.data).toEqual(expect.objectContaining({ rarity: "legendary", cardCounts: [13, 22], possibleCards: expect.arrayContaining(["Balance", "Void"]) }));
    expect(dnd5eSrdCompendiumEntry("necklace-of-adaptation")?.data).toEqual(expect.objectContaining({ breatheNormallyInAnyEnvironment: true, savingThrowAdvantageAgainst: ["poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("necklace-of-fireballs")?.data).toEqual(expect.objectContaining({ chargesFormula: "1d6+3 beads", spell: "fireball", spellSaveDc: 15, maxDamageFormula: "12d6" }));
    expect(dnd5eSrdCompendiumEntry("necklace-of-prayer-beads")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Cleric, Druid, or Paladin", variants: expect.arrayContaining([expect.objectContaining({ bead: "wind walking", spell: "wind-walk" })]) }));
    expect(dnd5eSrdCompendiumEntry("nine-lives-stealer")?.data).toEqual(expect.objectContaining({ magicBonus: 2, charges: expect.objectContaining({ maxFormula: "1d8+1" }), instantDeathOnFailedSave: true }));
    expect(dnd5eSrdCompendiumEntry("oathbow")?.data).toEqual(expect.objectContaining({ swornEnemyLimit: 1, attackAdvantageAgainstSwornEnemy: true, extraDamageFormula: "3d6" }));
    expect(dnd5eSrdCompendiumEntry("oil-of-etherealness")?.data).toEqual(expect.objectContaining({ consumable: true, spell: "etherealness", duration: "1 hour" }));
    expect(dnd5eSrdCompendiumEntry("oil-of-sharpness")?.data).toEqual(expect.objectContaining({ consumable: true, temporaryMagicBonus: 3, attackBonus: 3, damageBonus: 3 }));
    expect(dnd5eSrdCompendiumEntry("oil-of-slipperiness")?.data).toEqual(expect.objectContaining({ spell: "freedom-of-movement", duration: "8 hours", alternateGroundArea: "10-foot square" }));
    expect(dnd5eSrdCompendiumEntry("pearl-of-power")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Spellcaster", maxRestoredSlotLevel: 3, recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("periapt-of-health")?.data).toEqual(expect.objectContaining({ healingFormula: "2d4+2", savingThrowAdvantageAgainst: ["poisoned"] }));
    expect(dnd5eSrdCompendiumEntry("periapt-of-proof-against-poison")?.data).toEqual(expect.objectContaining({ conditionImmunity: ["Poisoned"], damageImmunity: ["poison"] }));
    expect(dnd5eSrdCompendiumEntry("periapt-of-wound-closure")?.data).toEqual(expect.objectContaining({ deathSavingThrowMinimum: 10, hitPointDieHealingMultiplier: 2 }));
    expect(dnd5eSrdCompendiumEntry("pipes-of-haunting")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), save: { ability: "wisdom", dc: 15 }, condition: "Frightened" }));
    expect(dnd5eSrdCompendiumEntry("pipes-of-the-sewers")?.data).toEqual(expect.objectContaining({ requiresAttunement: true, summons: "swarm-of-rats", controlRangeFt: 30, chargeCostRange: [1, 3] }));
    expect(dnd5eSrdCompendiumEntry("plate-armor-of-etherealness")?.data).toEqual(expect.objectContaining({ spell: "etherealness", appliesTo: ["half plate armor", "plate armor"], recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("portable-hole")?.data).toEqual(expect.objectContaining({ extradimensionalStorage: true, depthFt: 10, airSupplyHours: 1, astralRiftRadiusFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("potion-of-giant-strength")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, sourceRarity: "varies", variants: expect.arrayContaining([expect.objectContaining({ giantType: "storm", strength: 29, rarity: "legendary" })]) }));
    expect(dnd5eSrdCompendiumEntry("potions-of-healing")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ potion: "potion-of-healing-supreme", healingFormula: "10d4+20" })]) }));
    expect(dnd5eSrdCompendiumEntry("quarterstaff-of-the-acrobatweapon-quarterstaff-very-rare-requires-attunement")?.data).toEqual(expect.objectContaining({ magicBonus: 2, skillAdvantage: ["dexterity-acrobatics"], reactionArmorClassBonus: 5, returnsAfterRangedAttack: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-animal-influence")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), spellSaveDc: 13, spells: ["animal-friendship", "fear", "speak-with-animals"] }));
    expect(dnd5eSrdCompendiumEntry("ring-of-djinni-summoning")?.data).toEqual(expect.objectContaining({ summons: "djinni", summonRangeFt: 120, requiresConcentration: true, becomesNonmagicalIfSummonDies: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-elemental-command")?.data).toEqual(expect.objectContaining({ linkedPlanes: ["air", "earth", "fire", "water"], spellSaveDc: 18, planeProperties: expect.objectContaining({ water: expect.objectContaining({ swimSpeedFt: 60 }) }) }));
    expect(dnd5eSrdCompendiumEntry("ring-of-evasion")?.data).toEqual(expect.objectContaining({ reaction: "turn failed Dexterity saving throw into a success", chargeCost: 1 }));
    expect(dnd5eSrdCompendiumEntry("ring-of-feather-falling")?.data).toEqual(expect.objectContaining({ fallDescentFtPerRound: 60, preventsFallDamage: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-jumping")?.data).toEqual(expect.objectContaining({ spell: "jump", targetRestriction: "self only" }));
    expect(dnd5eSrdCompendiumEntry("ring-of-mind-shielding")?.data).toEqual(expect.objectContaining({ thoughtReadingImmunity: true, soulStorageOnDeath: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-shooting-stars")?.data).toEqual(expect.objectContaining({ atWillSpells: ["dancing-lights", "light"], lightningSpheres: expect.objectContaining({ maxSpheres: 4 }), shootingStars: expect.objectContaining({ damageType: "radiant" }) }));
    expect(dnd5eSrdCompendiumEntry("ring-of-spell-storing")?.data).toEqual(expect.objectContaining({ maxStoredSpellLevels: 5, acceptsSpellLevels: [1, 2, 3, 4, 5], storesOriginalCasterDcAttackAndAbility: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-spell-turning")?.data).toEqual(expect.objectContaining({ savingThrowAdvantageAgainst: ["spells"], noEffectOnSuccessfulSaveSpellLevelMax: 7, reactionReflectSingleTargetSpell: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-swimming")?.data).toEqual(expect.objectContaining({ swimSpeedFt: 40 }));
    expect(dnd5eSrdCompendiumEntry("ring-of-telekinesis")?.data).toEqual(expect.objectContaining({ spell: "telekinesis" }));
    expect(dnd5eSrdCompendiumEntry("ring-of-the-ram")?.data).toEqual(expect.objectContaining({ rangedSpellAttackBonus: 7, damageFormulaPerCharge: "2d10", pushFtPerCharge: 5 }));
    expect(dnd5eSrdCompendiumEntry("ring-of-three-wishes")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), spell: "wish", becomesNonmagicalWhenChargesEmpty: true }));
    expect(dnd5eSrdCompendiumEntry("ring-of-warmth")?.data).toEqual(expect.objectContaining({ damageReduction: { damageType: "cold", formula: "2d8" }, protectsAgainstExtremeColdFahrenheit: 0 }));
    expect(dnd5eSrdCompendiumEntry("ring-of-water-walking")?.data).toEqual(expect.objectContaining({ spell: "water-walk", targetRestriction: "self only" }));
    expect(dnd5eSrdCompendiumEntry("ring-of-x-ray-vision")?.data).toEqual(expect.objectContaining({ xRayVisionRangeFt: 30, repeatedUseBeforeLongRestSave: { ability: "constitution", dc: 15 }, failedSaveExhaustionLevels: 1 }));
    expect(dnd5eSrdCompendiumEntry("robe-of-eyes")?.data).toEqual(expect.objectContaining({ senses: { darkvisionFt: 120, truesightFt: 120 }, daylightSpellDrawback: expect.objectContaining({ condition: "Blinded" }) }));
    expect(dnd5eSrdCompendiumEntry("robe-of-scintillating-colors")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 3 }), condition: "Stunned", incomingAttackDisadvantageFromVisibleCreatures: true }));
    expect(dnd5eSrdCompendiumEntry("robe-of-stars")?.data).toEqual(expect.objectContaining({ savingThrowBonus: 1, spell: "magic-missile", spellLevel: 5, astralPlaneTravel: true }));
    expect(dnd5eSrdCompendiumEntry("robe-of-the-archmagi")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Sorcerer, Warlock, or Wizard", unarmoredBaseArmorClass: 15, spellSaveDcBonus: 2, spellAttackBonus: 2 }));
    expect(dnd5eSrdCompendiumEntry("robe-of-useful-items")?.data).toEqual(expect.objectContaining({ basePatchPairs: expect.arrayContaining(["bullseye-lantern", "rope"]), extraPatchesFormula: "4d4" }));
    expect(dnd5eSrdCompendiumEntry("rod-of-absorption")?.data).toEqual(expect.objectContaining({ maxLifetimeStoredSpellLevels: 50, maxCreatedSlotLevel: 5, becomesNonmagicalWhenExhausted: true }));
    expect(dnd5eSrdCompendiumEntry("rod-of-alertness")?.data).toEqual(expect.objectContaining({ initiativeAdvantage: true, spells: expect.arrayContaining(["detect-magic"]), protectiveAura: expect.objectContaining({ armorClassBonus: 1 }) }));
    expect(dnd5eSrdCompendiumEntry("rod-of-lordly-might")?.data).toEqual(expect.objectContaining({ magicBonus: 3, buttonForms: expect.arrayContaining(["battleaxe", "spear"]), additionalProperties: expect.arrayContaining(["drain life"]) }));
    expect(dnd5eSrdCompendiumEntry("rod-of-resurrection")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 5 }), spells: expect.arrayContaining([expect.objectContaining({ spell: "resurrection", charges: 5 })]) }));
    expect(dnd5eSrdCompendiumEntry("rod-of-rulership")?.data).toEqual(expect.objectContaining({ rangeFt: 120, condition: "Charmed", duration: "8 hours" }));
    expect(dnd5eSrdCompendiumEntry("rod-of-security")?.data).toEqual(expect.objectContaining({ transportsToDemiplane: true, maxAdditionalCreatures: 199, recoveryDays: 10 }));
    expect(dnd5eSrdCompendiumEntry("rope-of-climbing")?.data).toEqual(expect.objectContaining({ lengthFt: 60, capacityLb: 3000, climbCheckAdvantageWhenKnotted: true }));
    expect(dnd5eSrdCompendiumEntry("rope-of-entanglement")?.data).toEqual(expect.objectContaining({ rangeFt: 20, condition: "Restrained", escapeCheckOptions: expect.arrayContaining([expect.objectContaining({ skill: "athletics", dc: 15 })]) }));
    expect(dnd5eSrdCompendiumEntry("scarab-of-protection")?.data).toEqual(expect.objectContaining({ armorClassBonus: 1, charges: expect.objectContaining({ max: 12 }), savingThrowAdvantageAgainst: ["spells"] }));
    expect(dnd5eSrdCompendiumEntry("scimitar-of-speed")?.data).toEqual(expect.objectContaining({ magicBonus: 2, bonusActionAttack: true }));
    expect(dnd5eSrdCompendiumEntry("sending-stones")?.data).toEqual(expect.objectContaining({ pairedItem: true, spell: "sending", pairRecovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("sentinel-shield")?.data).toEqual(expect.objectContaining({ initiativeAdvantage: true, skillAdvantage: ["wisdom-perception"] }));
    expect(dnd5eSrdCompendiumEntry("shield-1-2-or-3")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ bonus: 3, rarity: "very rare" })]) }));
    expect(dnd5eSrdCompendiumEntry("shield-of-missile-attraction")?.data).toEqual(expect.objectContaining({ cursed: true, redirectRangedWeaponAttacksWithinFt: 10 }));
    expect(dnd5eSrdCompendiumEntry("shield-of-the-cavalier")?.data).toEqual(expect.objectContaining({ shieldEnhancementBonus: 2, forcefulBash: expect.objectContaining({ damageType: "force" }), protectiveField: expect.objectContaining({ recovery: "next dawn" }) }));
    expect(dnd5eSrdCompendiumEntry("slippers-of-spider-climbing")?.data).toEqual(expect.objectContaining({ climbSpeedEqualsSpeed: true, handsFreeClimbing: true }));
    expect(dnd5eSrdCompendiumEntry("sovereign-glue")?.data).toEqual(expect.objectContaining({ chargesFormula: "1d6+1 ounces", permanentBond: true }));
    expect(dnd5eSrdCompendiumEntry("spellguard-shield")?.data).toEqual(expect.objectContaining({ savingThrowAdvantageAgainst: ["spells", "magical effects"], incomingSpellAttackDisadvantage: true }));
    expect(dnd5eSrdCompendiumEntry("spell-scroll")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ scrollLevel: 9, spellSaveDc: 19, spellAttackBonus: 11 })]) }));
    expect(dnd5eSrdCompendiumEntry("sphere-of-annihilation")?.data).toEqual(expect.objectContaining({ controlCheck: expect.objectContaining({ dc: 25 }), touchDamageFormula: "8d10", obliteratesMatter: true }));
    expect(dnd5eSrdCompendiumEntry("staff-of-charming")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 10 }), spells: expect.arrayContaining([expect.objectContaining({ spell: "command" })]) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-fire")?.data).toEqual(expect.objectContaining({ resistance: ["fire"], spells: expect.arrayContaining([expect.objectContaining({ spell: "wall-of-fire", charges: 4 })]) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-frost")?.data).toEqual(expect.objectContaining({ resistance: ["cold"], spells: expect.arrayContaining([expect.objectContaining({ spell: "cone-of-cold", charges: 5 })]) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-swarming-insects")?.data).toEqual(expect.objectContaining({ insectCloud: expect.objectContaining({ heavilyObscuredForOthers: true }), spells: expect.arrayContaining([expect.objectContaining({ spell: "insect-plague" })]) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-the-magi")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 50 }), spellAbsorptionReaction: true, spells: expect.arrayContaining([expect.objectContaining({ spell: "plane-shift", charges: 7 })]) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-the-python")?.data).toEqual(expect.objectContaining({ summons: "giant-constrictor-snake", commandRangeFt: 60, destroyedIfSnakeReducedToZero: true }));
    expect(dnd5eSrdCompendiumEntry("staff-of-the-woodlands")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Druid", charges: expect.objectContaining({ max: 6 }), treeForm: expect.objectContaining({ heightFt: 60 }) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-thunder-and-lightning")?.data).toEqual(expect.objectContaining({ lightningExtraDamageFormula: "2d6", thunderCondition: "Stunned", lightningStrike: expect.objectContaining({ damageFormula: "9d6" }) }));
    expect(dnd5eSrdCompendiumEntry("staff-of-withering")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "2d10", save: { ability: "constitution", dc: 15 }, duration: "1 hour" }));
    expect(dnd5eSrdCompendiumEntry("stone-of-controlling-earth-elementals")?.data).toEqual(expect.objectContaining({ summons: "earth-elemental", summonRangeFt: 30, recovery: "next dawn" }));
    expect(dnd5eSrdCompendiumEntry("stone-of-good-luck-luckstone")?.data).toEqual(expect.objectContaining({ abilityCheckBonus: 1, savingThrowBonus: 1 }));
    expect(dnd5eSrdCompendiumEntry("sun-blade")?.data).toEqual(expect.objectContaining({ magicBonus: 2, damageTypeOverride: "radiant", extraDamageAgainst: ["Undead"], light: expect.objectContaining({ sunlight: true }) }));
    expect(dnd5eSrdCompendiumEntry("sword-of-life-stealing")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "15", extraDamageType: "necrotic", temporaryHitPointsEqualDamageTaken: true }));
    expect(dnd5eSrdCompendiumEntry("sword-of-sharpness")?.data).toEqual(expect.objectContaining({ maximizeWeaponDamageDiceAgainstObjects: true, criticalExtraDamage: 14, criticalExhaustionLevels: 1 }));
    expect(dnd5eSrdCompendiumEntry("sword-of-wounding")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "2d6", failedSavePreventsHealing: true, repeatSave: "end of each turn" }));
    expect(dnd5eSrdCompendiumEntry("talisman-of-pure-good")?.data).toEqual(expect.objectContaining({ attunementRequirement: "Cleric or Paladin", contactDamageAgainst: ["Fiend", "Undead"], charges: expect.objectContaining({ max: 7 }), saveDisadvantageFor: ["Fiend", "Undead"] }));
    expect(dnd5eSrdCompendiumEntry("talisman-of-the-sphere")?.data).toEqual(expect.objectContaining({ controlsItem: "sphere-of-annihilation", controlCheckAdvantage: true }));
    expect(dnd5eSrdCompendiumEntry("talisman-of-ultimate-evil")?.data).toEqual(expect.objectContaining({ contactDamageType: "necrotic", charges: expect.objectContaining({ max: 6 }), saveDisadvantageFor: ["Celestial"] }));
    expect(dnd5eSrdCompendiumEntry("thunderous-greatclub")?.data).toEqual(expect.objectContaining({ abilityScoreSet: { strength: 20 }, extraDamageType: "thunder", earthquake: expect.objectContaining({ structureDamage: 50 }) }));
    expect(dnd5eSrdCompendiumEntry("tome-of-clear-thought")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { intelligence: 2, max: 30 }, magicRecoveryYears: 100 }));
    expect(dnd5eSrdCompendiumEntry("tome-of-leadership-and-influence")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { charisma: 2, max: 30 }, studyHours: 48 }));
    expect(dnd5eSrdCompendiumEntry("tome-of-understanding")?.data).toEqual(expect.objectContaining({ abilityScoreIncrease: { wisdom: 2, max: 30 }, losesMagicAfterUse: true }));
    expect(dnd5eSrdCompendiumEntry("trident-of-fish-command")?.data).toEqual(expect.objectContaining({ spell: "dominate-beast", spellSaveDc: 15, targetRestriction: "Beast with a Swim Speed" }));
    expect(dnd5eSrdCompendiumEntry("universal-solvent")?.data).toEqual(expect.objectContaining({ chargesFormula: "1d6+1 ounces", dissolvesItems: ["sovereign-glue"] }));
    expect(dnd5eSrdCompendiumEntry("vicious-weapon")?.data).toEqual(expect.objectContaining({ extraDamageFormula: "2d6", extraDamageType: "same as weapon" }));
    expect(dnd5eSrdCompendiumEntry("vorpal-sword")?.data).toEqual(expect.objectContaining({ magicBonus: 3, decapitatesIfPossible: true, criticalExtraDamageFormulaIfNoHead: "6d8" }));
    expect(dnd5eSrdCompendiumEntry("wand-of-binding")?.data).toEqual(expect.objectContaining({ spellSaveDc: 17, spells: expect.arrayContaining([expect.objectContaining({ spell: "hold-monster", charges: 5 })]) }));
    expect(dnd5eSrdCompendiumEntry("wand-of-enemy-detection")?.data).toEqual(expect.objectContaining({ detectsNearestHostileDirectionWithinFt: 60, detectsInvisibleEtherealDisguisedHidden: true }));
    expect(dnd5eSrdCompendiumEntry("wand-of-fear")?.data).toEqual(expect.objectContaining({ spellSaveDc: 15, spells: expect.arrayContaining([expect.objectContaining({ spell: "fear", charges: 3 })]) }));
    expect(dnd5eSrdCompendiumEntry("wand-of-paralysis")?.data).toEqual(expect.objectContaining({ condition: "Paralyzed", save: { ability: "constitution", dc: 15 }, repeatSave: "end of each turn" }));
    expect(dnd5eSrdCompendiumEntry("wand-of-polymorph")?.data).toEqual(expect.objectContaining({ spell: "polymorph", spellSaveDc: 15, chargeCost: 1 }));
    expect(dnd5eSrdCompendiumEntry("wand-of-secrets")?.data).toEqual(expect.objectContaining({ detectsNearestSecretDoorOrTrapWithinFt: 60, charges: expect.objectContaining({ max: 3 }) }));
    expect(dnd5eSrdCompendiumEntry("wand-of-the-war-mage-1-2-or-3")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ bonus: 3, rarity: "very rare" })]), ignoresCover: ["half"] }));
    expect(dnd5eSrdCompendiumEntry("wand-of-web")?.data).toEqual(expect.objectContaining({ spell: "web", spellSaveDc: 13, charges: expect.objectContaining({ max: 7 }) }));
    expect(dnd5eSrdCompendiumEntry("wand-of-wonder")?.data).toEqual(expect.objectContaining({ effectTable: "1d100 Wand of Wonder Effects", randomEffect: true, spellSaveDc: 13 }));
    expect(dnd5eSrdCompendiumEntry("weapon-1-2-or-3")?.data).toEqual(expect.objectContaining({ sourceHeadingAlias: true, variants: expect.arrayContaining([expect.objectContaining({ bonus: 3, rarity: "very rare" })]) }));
    expect(dnd5eSrdCompendiumEntry("well-of-many-worlds")?.data).toEqual(expect.objectContaining({ portal: true, twoWayPortal: true, recoveryFormulaHours: "1d8" }));
    expect(dnd5eSrdCompendiumEntry("wind-fan")?.data).toEqual(expect.objectContaining({ spell: "gust-of-wind", spellSaveDc: 13, cumulativeFailureChanceBeforeDawnPercent: 20 }));
    expect(dnd5eSrdCompendiumEntry("winged-boots")?.data).toEqual(expect.objectContaining({ charges: expect.objectContaining({ max: 4 }), flySpeedFt: 30, descentFtPerRoundAfterExpiration: 30 }));
    expect(dnd5eSrdCompendiumEntry("wings-of-flying")?.data).toEqual(expect.objectContaining({ flySpeedFt: 60, duration: "1 hour", recoveryFormulaHours: "1d12" }));
    expect(dnd5eSrdCompendiumEntry("weapon-plus-2")?.data).toEqual(expect.objectContaining({ magicItemCategory: "weapon", rarity: "rare", attackBonus: 2, damageBonus: 2, craftingCostGp: 2000 }));
    expect(dnd5eSrdCompendiumEntry("shield-plus-3")?.data).toEqual(expect.objectContaining({ magicItemCategory: "armor", rarity: "very rare", armorBonus: 5, shieldEnhancementBonus: 3 }));
    expect(dnd5eSrdCompendiumEntry("cloak-of-protection")?.data).toEqual(expect.objectContaining({ requiresAttunement: true, armorClassBonus: 1, savingThrowBonus: 1 }));
    expect(dnd5eSrdCompendiumEntry("bracers-of-defense")?.data).toEqual(expect.objectContaining({ armorClassBonus: 2, requiresNoArmorOrShield: true }));
    expect(dnd5eSrdCompendiumEntry("bag-of-holding")?.data).toEqual(expect.objectContaining({ capacityLb: 500, capacityCubicFt: 64, extradimensionalStorage: true }));
    expect(dnd5eSrdCompendiumEntry("wand-of-magic-missiles")?.data).toEqual(expect.objectContaining({ magicItemCategory: "wand", rarity: "uncommon", spell: "magic-missile", charges: expect.objectContaining({ max: 7 }) }));
    expect(dnd5eSrdCompendiumEntry("potion-of-climbing")?.data).toEqual(expect.objectContaining({ magicItemCategory: "potion", rarity: "common", consumable: true, climbSpeedEqualsSpeed: true, craftingCostGp: 25 }));
    expect(dnd5eSrdCompendiumEntry("potion-of-giant-strength-storm")?.data).toEqual(expect.objectContaining({ rarity: "legendary", abilityScoreSet: { strength: 29 }, duration: "1 hour" }));
    expect(dnd5eSrdCompendiumEntry("potion-of-healing-superior")?.data).toEqual(expect.objectContaining({ healingFormula: "8d4+8", rarity: "rare", craftingCostGp: 1000 }));
    expect(dnd5eSrdCompendiumEntry("potion-of-poison")?.data).toEqual(expect.objectContaining({ damageFormula: "4d6", damageType: "poison", save: { ability: "constitution", dc: 13 }, condition: "Poisoned" }));
    expect(dnd5eSrdCompendiumEntry("potion-of-resistance")?.data).toEqual(expect.objectContaining({ resistanceChoice: expect.arrayContaining(["acid", "fire", "thunder"]), duration: "1 hour" }));
    expect(dnd5eSrdCompendiumEntry("spell-scroll-level-9")?.data).toEqual(expect.objectContaining({ magicItemCategory: "scroll", rarity: "legendary", scrollLevel: 9, spellSaveDc: 19, spellAttackBonus: 11, craftingCostGp: 50000 }));

    const cloakOfProtection: Item = {
      id: "itm_cloak_of_protection",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Cloak of Protection",
      data: { ...dnd5eSrdCompendiumEntry("cloak-of-protection")!.data, compendiumId: "cloak-of-protection" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const ringOfProtection: Item = {
      id: "itm_ring_of_protection",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Ring of Protection",
      data: { ...dnd5eSrdCompendiumEntry("ring-of-protection")!.data, compendiumId: "ring-of-protection" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const bracersOfDefense: Item = {
      id: "itm_bracers_of_defense",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Bracers of Defense",
      data: { ...dnd5eSrdCompendiumEntry("bracers-of-defense")!.data, compendiumId: "bracers-of-defense" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const bracersChainMail: Item = {
      id: "itm_bracers_chain_mail",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Chain Mail",
      data: { ...dnd5eSrdCompendiumEntry("chain-mail")!.data, compendiumId: "chain-mail" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const staffOfStriking: Item = {
      id: "itm_staff_of_striking",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Staff of Striking",
      data: { ...dnd5eSrdCompendiumEntry("staff-of-striking")!.data, compendiumId: "staff-of-striking" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const superiorHealingPotion: Item = {
      id: "itm_superior_healing_potion",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Potion of Healing (superior)",
      data: { ...dnd5eSrdCompendiumEntry("potion-of-healing-superior")!.data, compendiumId: "potion-of-healing-superior" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const levelNineScroll: Item = {
      id: "itm_spell_scroll_level_9",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Spell Scroll, Level 9",
      data: { ...dnd5eSrdCompendiumEntry("spell-scroll-level-9")!.data, compendiumId: "spell-scroll-level-9" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const wandOfTheWarMage: Item = {
      id: "itm_wand_of_the_war_mage_plus_1",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Wand of the War Mage, +1",
      data: { ...dnd5eSrdCompendiumEntry("wand-of-the-war-mage-plus-1")!.data, compendiumId: "wand-of-the-war-mage-plus-1" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const potionOfInvisibility: Item = {
      id: "itm_potion_of_invisibility",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Potion of Invisibility",
      data: { ...dnd5eSrdCompendiumEntry("potion-of-invisibility")!.data, compendiumId: "potion-of-invisibility", quantity: 1 },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const ballBearings: Item = {
      id: "itm_ball_bearings",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Ball Bearings",
      data: { ...dnd5eSrdCompendiumEntry("ball-bearings")!.data, compendiumId: "ball-bearings" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const potionEffectItems: Item[] = [
      "potion-of-climbing",
      "potion-of-flying",
      "potion-of-giant-strength-storm",
      "potion-of-invulnerability",
      "potion-of-resistance",
      "potion-of-speed",
      "potion-of-vitality",
      "potion-of-water-breathing"
    ].map((entryId) => {
      const entry = dnd5eSrdCompendiumEntry(entryId)!;
      return {
        id: `itm_${entryId.replaceAll("-", "_")}`,
        campaignId: "camp_demo",
        systemId: "dnd-5e-srd",
        actorId: srdActor.id,
        type: "item" as const,
        name: entry.name,
        data: { ...entry.data, compendiumId: entryId, quantity: 1 },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      };
    });
    const protectedSheet = dnd5eSrdSheet(srdActor, [cloakOfProtection, ringOfProtection]);
    expect(protectedSheet.data.armorClass).toBe(13);
    expect(protectedSheet.data.armorClassDetails).toEqual(expect.objectContaining({ value: 13, armorClassBonus: 2, armorClassBonusItemIds: ["itm_cloak_of_protection", "itm_ring_of_protection"] }));
    expect(protectedSheet.quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "save-dexterity", formula: "1d20+3", metadata: expect.objectContaining({ itemBonus: 2 }) }),
        expect.objectContaining({ id: "save-wisdom", formula: "1d20+7", metadata: expect.objectContaining({ itemBonus: 2 }) })
      ])
    );
    expect(dnd5eSrdSheet(srdActor, [bracersOfDefense]).data.armorClass).toBe(13);
    expect(dnd5eSrdSheet(srdActor, [bracersOfDefense, bracersChainMail]).data.armorClass).toBe(16);
    expect(dnd5eSrdSheet(srdActor, [staffOfStriking]).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "item-itm_staff_of_striking-attack", formula: "1d20+5", metadata: expect.objectContaining({ attackType: "weapon", itemBonus: 3, proficiencyBonus: 2 }) }),
        expect.objectContaining({ id: "item-itm_staff_of_striking-damage", formula: "1d6+3" }),
        expect.objectContaining({ id: "item-itm_staff_of_striking-versatile-damage", formula: "1d8+3" })
      ])
    );
    expect(dnd5eSrdSheet(srdActor, [superiorHealingPotion, levelNineScroll]).quickRolls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "item-itm_superior_healing_potion-healing", formula: "8d4+8" })])
    );
    expect(dnd5eSrdSheet(srdActor, [potionOfInvisibility, ballBearings]).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "item-itm_potion_of_invisibility-effect", label: "Potion of Invisibility Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", action: "bonus", condition: "Invisible", duration: "1 hour", endsWhen: ["make an attack roll", "deal damage", "cast a spell"] }) }),
        expect.objectContaining({ id: "item-itm_ball_bearings-effect", label: "Ball Bearings Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", action: "utilize", area: "10-foot square", condition: "prone", save: { ability: "dexterity", dc: 10 }, saveDc: 10 }) })
      ])
    );
    expect(dnd5eSrdSheet(srdActor, potionEffectItems).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "item-itm_potion_of_climbing-effect", label: "Potion of Climbing Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", climbSpeedEqualsSpeed: true, skillAdvantage: ["strength-athletics-climb"], duration: "1 hour" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_flying-effect", label: "Potion of Flying Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", flySpeedEqualsSpeed: true, canHover: true, duration: "1 hour" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_giant_strength_storm-effect", label: "Potion of Giant Strength (storm) Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", abilityScoreSet: { strength: 29 }, giantType: "storm", duration: "1 hour" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_invulnerability-effect", label: "Potion of Invulnerability Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", resistance: ["all"], duration: "1 minute" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_resistance-effect", label: "Potion of Resistance Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", resistanceChoice: expect.arrayContaining(["acid", "fire", "thunder"]), duration: "1 hour" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_speed-effect", label: "Potion of Speed Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", spell: "haste", noLethargyOnEnd: true, duration: "1 minute" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_vitality-effect", label: "Potion of Vitality Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", removesExhaustion: true, endsCondition: "Poisoned", maximizeHitDiceHealing: true, duration: "24 hours" }) }),
        expect.objectContaining({ id: "item-itm_potion_of_water_breathing-effect", label: "Potion of Water Breathing Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", waterBreathing: true, duration: "24 hours" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(srdActor, potionEffectItems, "item-itm_potion_of_speed-effect")).toBe("0");
    expect(levelNineScroll.data).toEqual(expect.objectContaining({ scrollLevel: 9, spellSaveDc: 19, spellAttackBonus: 11 }));

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
    const acidArrow: Item = {
      id: "itm_acid_arrow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Acid Arrow",
      data: { ...dnd5eSrdCompendiumEntry("acid-arrow")!.data, compendiumId: "acid-arrow" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const acidSplash: Item = {
      id: "itm_acid_splash",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Acid Splash",
      data: { ...dnd5eSrdCompendiumEntry("acid-splash")!.data, compendiumId: "acid-splash" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const aid: Item = {
      id: "itm_aid",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Aid",
      data: { ...dnd5eSrdCompendiumEntry("aid")!.data, compendiumId: "aid" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const bane: Item = {
      id: "itm_bane",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Bane",
      data: { ...dnd5eSrdCompendiumEntry("bane")!.data, compendiumId: "bane" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const bless: Item = {
      id: "itm_bless",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Bless",
      data: { ...dnd5eSrdCompendiumEntry("bless")!.data, compendiumId: "bless" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const colorSpray: Item = {
      id: "itm_color_spray",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Color Spray",
      data: { ...dnd5eSrdCompendiumEntry("color-spray")!.data, compendiumId: "color-spray" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const command: Item = {
      id: "itm_command",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Command",
      data: { ...dnd5eSrdCompendiumEntry("command")!.data, compendiumId: "command" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const burningHands: Item = {
      id: "itm_burning_hands",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Burning Hands",
      data: { ...dnd5eSrdCompendiumEntry("burning-hands")!.data, compendiumId: "burning-hands" },
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
    const guidingBolt: Item = {
      id: "itm_guiding_bolt",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Guiding Bolt",
      data: { ...dnd5eSrdCompendiumEntry("guiding-bolt")!.data, compendiumId: "guiding-bolt" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const magicMissile: Item = {
      id: "itm_magic_missile",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Magic Missile",
      data: { ...dnd5eSrdCompendiumEntry("magic-missile")!.data, compendiumId: "magic-missile" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const dissonantWhispers: Item = {
      id: "itm_dissonant_whispers",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Dissonant Whispers",
      data: { ...dnd5eSrdCompendiumEntry("dissonant-whispers")!.data, compendiumId: "dissonant-whispers" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const dragonsBreath: Item = {
      id: "itm_dragons_breath",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Dragon's Breath",
      data: { ...dnd5eSrdCompendiumEntry("dragons-breath")!.data, compendiumId: "dragons-breath" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const mindSpike: Item = {
      id: "itm_mind_spike",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Mind Spike",
      data: { ...dnd5eSrdCompendiumEntry("mind-spike")!.data, compendiumId: "mind-spike" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const phantasmalForce: Item = {
      id: "itm_phantasmal_force",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Phantasmal Force",
      data: { ...dnd5eSrdCompendiumEntry("phantasmal-force")!.data, compendiumId: "phantasmal-force" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const searingSmite: Item = {
      id: "itm_searing_smite",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Searing Smite",
      data: { ...dnd5eSrdCompendiumEntry("searing-smite")!.data, compendiumId: "searing-smite" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const tsunami: Item = {
      id: "itm_tsunami",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Tsunami",
      data: { ...dnd5eSrdCompendiumEntry("tsunami")!.data, compendiumId: "tsunami" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const vitriolicSphere: Item = {
      id: "itm_vitriolic_sphere",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Vitriolic Sphere",
      data: { ...dnd5eSrdCompendiumEntry("vitriolic-sphere")!.data, compendiumId: "vitriolic-sphere" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const charmMonster: Item = {
      id: "itm_charm_monster",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Charm Monster",
      data: { ...dnd5eSrdCompendiumEntry("charm-monster")!.data, compendiumId: "charm-monster" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const clairvoyance: Item = {
      id: "itm_clairvoyance",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Clairvoyance",
      data: { ...dnd5eSrdCompendiumEntry("clairvoyance")!.data, compendiumId: "clairvoyance" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const animalFriendship: Item = {
      id: "itm_animal_friendship",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Animal Friendship",
      data: { ...dnd5eSrdCompendiumEntry("animal-friendship")!.data, compendiumId: "animal-friendship" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const counterspell: Item = {
      id: "itm_counterspell",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Counterspell",
      data: { ...dnd5eSrdCompendiumEntry("counterspell")!.data, compendiumId: "counterspell" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const dispelMagic: Item = {
      id: "itm_dispel_magic",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Dispel Magic",
      data: { ...dnd5eSrdCompendiumEntry("dispel-magic")!.data, compendiumId: "dispel-magic" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const detectThoughts: Item = {
      id: "itm_detect_thoughts",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Detect Thoughts",
      data: { ...dnd5eSrdCompendiumEntry("detect-thoughts")!.data, compendiumId: "detect-thoughts" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const fireball: Item = {
      id: "itm_fireball",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Fireball",
      data: { ...dnd5eSrdCompendiumEntry("fireball")!.data, compendiumId: "fireball" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const fly: Item = {
      id: "itm_fly",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Fly",
      data: { ...dnd5eSrdCompendiumEntry("fly")!.data, compendiumId: "fly" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const gaseousForm: Item = {
      id: "itm_gaseous_form",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Gaseous Form",
      data: { ...dnd5eSrdCompendiumEntry("gaseous-form")!.data, compendiumId: "gaseous-form" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const haste: Item = {
      id: "itm_haste",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Haste",
      data: { ...dnd5eSrdCompendiumEntry("haste")!.data, compendiumId: "haste" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const hypnoticPattern: Item = {
      id: "itm_hypnotic_pattern",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Hypnotic Pattern",
      data: { ...dnd5eSrdCompendiumEntry("hypnotic-pattern")!.data, compendiumId: "hypnotic-pattern" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const invisibility: Item = {
      id: "itm_invisibility",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Invisibility",
      data: { ...dnd5eSrdCompendiumEntry("invisibility")!.data, compendiumId: "invisibility" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const lightningBolt: Item = {
      id: "itm_lightning_bolt",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Lightning Bolt",
      data: { ...dnd5eSrdCompendiumEntry("lightning-bolt")!.data, compendiumId: "lightning-bolt" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const identify: Item = {
      id: "itm_identify",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Identify",
      data: { ...dnd5eSrdCompendiumEntry("identify")!.data, compendiumId: "identify" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const lesserRestoration: Item = {
      id: "itm_lesser_restoration",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Lesser Restoration",
      data: { ...dnd5eSrdCompendiumEntry("lesser-restoration")!.data, compendiumId: "lesser-restoration" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const mageArmor: Item = {
      id: "itm_mage_armor",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Mage Armor",
      data: { ...dnd5eSrdCompendiumEntry("mage-armor")!.data, compendiumId: "mage-armor" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const massHealingWord: Item = {
      id: "itm_mass_healing_word",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Mass Healing Word",
      data: { ...dnd5eSrdCompendiumEntry("mass-healing-word")!.data, compendiumId: "mass-healing-word" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const massCureWounds: Item = {
      id: "itm_mass_cure_wounds",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Mass Cure Wounds",
      data: { ...dnd5eSrdCompendiumEntry("mass-cure-wounds")!.data, compendiumId: "mass-cure-wounds" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const prayerOfHealing: Item = {
      id: "itm_prayer_of_healing",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Prayer of Healing",
      data: { ...dnd5eSrdCompendiumEntry("prayer-of-healing")!.data, compendiumId: "prayer-of-healing" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const revivify: Item = {
      id: "itm_revivify",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Revivify",
      data: { ...dnd5eSrdCompendiumEntry("revivify")!.data, compendiumId: "revivify" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const enhanceAbility: Item = {
      id: "itm_enhance_ability",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Enhance Ability",
      data: { ...dnd5eSrdCompendiumEntry("enhance-ability")!.data, compendiumId: "enhance-ability" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const enlargeReduce: Item = {
      id: "itm_enlarge_reduce",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Enlarge/Reduce",
      data: { ...dnd5eSrdCompendiumEntry("enlarge-reduce")!.data, compendiumId: "enlarge-reduce" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const scorchingRay: Item = {
      id: "itm_scorching_ray",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Scorching Ray",
      data: { ...dnd5eSrdCompendiumEntry("scorching-ray")!.data, compendiumId: "scorching-ray" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const fear: Item = {
      id: "itm_fear",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Fear",
      data: { ...dnd5eSrdCompendiumEntry("fear")!.data, compendiumId: "fear" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const mistyStep: Item = {
      id: "itm_misty_step",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Misty Step",
      data: { ...dnd5eSrdCompendiumEntry("misty-step")!.data, compendiumId: "misty-step" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const seeInvisibility: Item = {
      id: "itm_see_invisibility",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "See Invisibility",
      data: { ...dnd5eSrdCompendiumEntry("see-invisibility")!.data, compendiumId: "see-invisibility" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const stinkingCloud: Item = {
      id: "itm_stinking_cloud",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Stinking Cloud",
      data: { ...dnd5eSrdCompendiumEntry("stinking-cloud")!.data, compendiumId: "stinking-cloud" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const suggestion: Item = {
      id: "itm_suggestion",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Suggestion",
      data: { ...dnd5eSrdCompendiumEntry("suggestion")!.data, compendiumId: "suggestion" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const shieldSpell: Item = {
      id: "itm_shield_spell",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Shield",
      data: { ...dnd5eSrdCompendiumEntry("shield")!.data, compendiumId: "shield" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const spiritGuardians: Item = {
      id: "itm_spirit_guardians",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Spirit Guardians",
      data: { ...dnd5eSrdCompendiumEntry("spirit-guardians")!.data, compendiumId: "spirit-guardians" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const spiritualWeapon: Item = {
      id: "itm_spiritual_weapon",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Spiritual Weapon",
      data: { ...dnd5eSrdCompendiumEntry("spiritual-weapon")!.data, compendiumId: "spiritual-weapon" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const shatter: Item = {
      id: "itm_shatter",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Shatter",
      data: { ...dnd5eSrdCompendiumEntry("shatter")!.data, compendiumId: "shatter" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const silence: Item = {
      id: "itm_silence",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Silence",
      data: { ...dnd5eSrdCompendiumEntry("silence")!.data, compendiumId: "silence" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const slow: Item = {
      id: "itm_slow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Slow",
      data: { ...dnd5eSrdCompendiumEntry("slow")!.data, compendiumId: "slow" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const thunderwave: Item = {
      id: "itm_thunderwave",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Thunderwave",
      data: { ...dnd5eSrdCompendiumEntry("thunderwave")!.data, compendiumId: "thunderwave" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const web: Item = {
      id: "itm_web",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Web",
      data: { ...dnd5eSrdCompendiumEntry("web")!.data, compendiumId: "web" },
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
    const halfPlateArmor: Item = {
      id: "itm_half_plate_armor",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Half Plate Armor",
      data: { ...dnd5eSrdCompendiumEntry("half-plate-armor")!.data, compendiumId: "half-plate-armor" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const plateArmor: Item = {
      id: "itm_plate_armor",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Plate Armor",
      data: { ...dnd5eSrdCompendiumEntry("plate-armor")!.data, compendiumId: "plate-armor" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const lightCrossbow: Item = {
      id: "itm_light_crossbow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Light Crossbow",
      data: { ...dnd5eSrdCompendiumEntry("light-crossbow")!.data, compendiumId: "light-crossbow" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const greatsword: Item = {
      id: "itm_greatsword",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Greatsword",
      data: { ...dnd5eSrdCompendiumEntry("greatsword")!.data, compendiumId: "greatsword" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(dnd5eSrdSheet(srdActor, [levelNineScroll, chromaticOrb]).quickRolls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "spell-itm_chromatic_orb-attack", formula: "1d20+5", metadata: expect.not.objectContaining({ itemBonus: 11 }) })])
    );
    expect(dnd5eSrdSheet(srdActor, [wandOfTheWarMage, chromaticOrb]).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_chromatic_orb-attack", formula: "1d20+6", metadata: expect.objectContaining({ itemBonus: 1, itemBonusItemIds: ["itm_wand_of_the_war_mage_plus_1"] }) })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [bane, bless, colorSpray, command, charmMonster])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_bane-effect", label: "Bane Effect", formula: "1d4", metadata: expect.objectContaining({ effectType: "penalty", save: { ability: "charisma", dc: 13 }, upcastTargets: { base: 3, perSlotAbove: 1 } }) }),
        expect.objectContaining({ id: "spell-itm_bless-effect", label: "Bless Effect", formula: "1d4", metadata: expect.objectContaining({ effectType: "bonus", targetCount: 3, affectedRolls: ["attack", "save"] }) }),
        expect.objectContaining({ id: "spell-itm_color_spray-effect", label: "Color Spray Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Blinded", save: { ability: "constitution", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_command-effect", label: "Command Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", save: { ability: "wisdom", dc: 13 }, commandOptions: ["Approach", "Drop", "Flee", "Grovel", "Halt"] }) }),
        expect.objectContaining({ id: "spell-itm_charm_monster-effect", label: "Charm Monster Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", spellLevel: 4, condition: "Charmed", save: { ability: "wisdom", dc: 13 } }) })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [fireball, invisibility, lightningBolt, scorchingRay, shatter, web])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_fireball-damage", label: "Fireball Damage", formula: "8d6" }),
        expect.objectContaining({ id: "spell-itm_invisibility-effect", label: "Invisibility Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Invisible", upcastTargets: { base: 1, perSlotAbove: 1 } }) }),
        expect.objectContaining({ id: "spell-itm_lightning_bolt-damage", label: "Lightning Bolt Damage", formula: "8d6" }),
        expect.objectContaining({ id: "spell-itm_scorching_ray-attack", label: "Scorching Ray Attack", formula: "1d20+5", metadata: expect.objectContaining({ attackType: "spell", range: "120 ft", damageType: "fire" }) }),
        expect.objectContaining({ id: "spell-itm_scorching_ray-damage", label: "Scorching Ray Damage", formula: "2d6" }),
        expect.objectContaining({ id: "spell-itm_shatter-damage", label: "Shatter Damage", formula: "3d8" }),
        expect.objectContaining({ id: "spell-itm_web-effect", label: "Web Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Restrained", save: { ability: "dexterity", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_web-secondary-damage", label: "Web Secondary Damage", formula: "2d4" })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [fear, mistyStep, stinkingCloud, suggestion])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_fear-effect", label: "Fear Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Frightened", area: "30-foot cone", save: { ability: "wisdom", dc: 13 }, effects: expect.arrayContaining(["drop held objects"]) }) }),
        expect.objectContaining({ id: "spell-itm_misty_step-effect", label: "Misty Step Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", teleportsFt: 30, effects: expect.arrayContaining(["teleport up to 30 feet to an unoccupied space you can see"]) }) }),
        expect.objectContaining({ id: "spell-itm_stinking_cloud-effect", label: "Stinking Cloud Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Poisoned", obscurement: "Heavily Obscured", preventsActions: true, preventsBonusActions: true, save: { ability: "constitution", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_suggestion-effect", label: "Suggestion Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Charmed", suggestionLimit: "25 words", targetMustHearAndUnderstand: true, save: { ability: "wisdom", dc: 13 } }) })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [animalFriendship, clairvoyance, detectThoughts, enlargeReduce, gaseousForm, massCureWounds])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_animal_friendship-effect", label: "Animal Friendship Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Charmed", targetCreatureType: "Beast", save: { ability: "wisdom", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_clairvoyance-effect", label: "Clairvoyance Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", materialCostGp: 100, sensor: "Invisible, intangible, invulnerable sensor", senseOptions: ["seeing", "hearing"], canSwitchSenseAsBonusAction: true }) }),
        expect.objectContaining({ id: "spell-itm_detect_thoughts-effect", label: "Detect Thoughts Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", thoughtDetectionRangeFt: 30, blockedBy: expect.arrayContaining(["thin sheet of lead"]), save: { ability: "wisdom", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_enlarge_reduce-effect", label: "Enlarge/Reduce Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", sizeChange: "increase or decrease one size category", damageBonusFormula: "1d4", damagePenaltyFormula: "1d4", save: { ability: "constitution", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_gaseous_form-effect", label: "Gaseous Form Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", flySpeedFt: 10, canHover: true, resistance: expect.arrayContaining(["bludgeoning"]), immunity: ["Prone"], preventsAttacks: true, preventsSpellcasting: true }) }),
        expect.objectContaining({ id: "spell-itm_mass_cure_wounds-healing", label: "Mass Cure Wounds Healing", formula: "5d8+3" })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [counterspell, dispelMagic, fly, haste, hypnoticPattern, slow])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_counterspell-effect", label: "Counterspell Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "reaction", save: { ability: "constitution", dc: 13 }, interruptsSpell: true }) }),
        expect.objectContaining({ id: "spell-itm_dispel_magic-effect", label: "Dispel Magic Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", spellcastingAbilityCheck: { dcFormula: "10+spell level", appliesAboveSpellLevel: 3 } }) }),
        expect.objectContaining({ id: "spell-itm_fly-effect", label: "Fly Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", flySpeedFt: 60, canHover: true, upcastTargets: { base: 1, perSlotAbove: 1 } }) }),
        expect.objectContaining({ id: "spell-itm_haste-effect", label: "Haste Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", armorClassBonus: 2, speedMultiplier: 2 }) }),
        expect.objectContaining({ id: "spell-itm_hypnotic_pattern-effect", label: "Hypnotic Pattern Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Charmed", save: { ability: "wisdom", dc: 13 } }) }),
        expect.objectContaining({ id: "spell-itm_slow-effect", label: "Slow Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", targetCount: 6, save: { ability: "wisdom", dc: 13 }, armorClassPenalty: 2 }) })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [lesserRestoration, prayerOfHealing, spiritualWeapon, spiritGuardians, revivify, massHealingWord])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_lesser_restoration-effect", label: "Lesser Restoration Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonus", conditionsEnded: ["Blinded", "Deafened", "Paralyzed", "Poisoned"] }) }),
        expect.objectContaining({ id: "spell-itm_prayer_of_healing-healing", label: "Prayer of Healing Healing", formula: "2d8" }),
        expect.objectContaining({ id: "spell-itm_spiritual_weapon-attack", label: "Spiritual Weapon Attack", formula: "1d20+5", metadata: expect.objectContaining({ attackType: "spell", ability: "wisdom", range: "60 ft", damageType: "force" }) }),
        expect.objectContaining({ id: "spell-itm_spiritual_weapon-damage", label: "Spiritual Weapon Damage", formula: "1d8+3" }),
        expect.objectContaining({ id: "spell-itm_spirit_guardians-damage", label: "Spirit Guardians Damage", formula: "3d8" }),
        expect.objectContaining({ id: "spell-itm_revivify-effect", label: "Revivify Effect", formula: "0", metadata: expect.objectContaining({ effectType: "healing", healing: "reviveWith1HitPoint", revivesDead: true, reviveHitPoints: 1, consumedMaterialCostGp: 300 }) }),
        expect.objectContaining({ id: "spell-itm_mass_healing_word-healing", label: "Mass Healing Word Healing", formula: "2d4+3" })
      ])
    );
    expect(dnd5eSrdQuickRolls(srdActor, [identify, mageArmor, shieldSpell, silence, enhanceAbility, seeInvisibility])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "spell-itm_identify-effect", label: "Identify Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", ritual: true, materialCostGp: 100, effects: expect.arrayContaining(["learn magic item properties"]) }) }),
        expect.objectContaining({ id: "spell-itm_mage_armor-effect", label: "Mage Armor Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", baseArmorClass: 13, baseArmorClassAbility: "dexterity", requiresNoArmor: true }) }),
        expect.objectContaining({ id: "spell-itm_shield_spell-effect", label: "Shield Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "reaction", armorClassBonus: 5, blocksDamageFrom: ["magic-missile"], includesTriggeringAttack: true }) }),
        expect.objectContaining({ id: "spell-itm_silence-effect", label: "Silence Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", condition: "Deafened", immunity: ["thunder"], blocksVerbalComponents: true, ritual: true }) }),
        expect.objectContaining({ id: "spell-itm_enhance_ability-effect", label: "Enhance Ability Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", advantageAbilityChecks: expect.arrayContaining(["strength", "charisma"]), upcastTargets: { base: 1, perSlotAbove: 1 } }) }),
        expect.objectContaining({ id: "spell-itm_see_invisibility-effect", label: "See Invisibility Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", effects: expect.arrayContaining(["see into the Ethereal Plane"]) }) })
      ])
    );
    expect(dnd5eSrdSheet(srdActor, [spell]).spells.map((item) => item.name)).toEqual(["Healing Word"]);
    expect(dnd5eSrdSheet(srdActor, [leatherArmor, shield]).data).toEqual(
      expect.objectContaining({
        armorClass: 14,
        armorClassDetails: expect.objectContaining({ value: 14, base: 11, dexModifier: 1, armorName: "Leather Armor", shieldBonus: 2, speedPenalty: 0 }),
        effectiveSpeed: 30,
        speedDetails: expect.objectContaining({ value: 30, base: 30, armorPenalty: 0, conditionPenalty: 0, conditionMultiplier: 1, conditionSources: [] })
      })
    );
    expect(dnd5eSrdSheet(srdActor, [chainMail, shield]).data).toEqual(
      expect.objectContaining({
        armorClass: 18,
        armorClassDetails: expect.objectContaining({ value: 18, base: 16, dexModifier: 0, armorName: "Chain Mail", shieldBonus: 2, stealthDisadvantage: true, strengthRequirement: 13, speedPenalty: -10 }),
        effectiveSpeed: 20,
        speedDetails: expect.objectContaining({ value: 20, base: 30, armorPenalty: -10 })
      })
    );
    const exhaustedChainMailActor: Actor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "exhaustion", level: 2 }] } };
    expect(dnd5eSrdSheet(exhaustedChainMailActor, [chainMail, shield]).data).toEqual(
      expect.objectContaining({
        effectiveSpeed: 10,
        speedDetails: expect.objectContaining({ value: 10, base: 30, armorPenalty: -10, conditionPenalty: -10, conditionSources: ["exhaustion"] })
      })
    );
    const restrainedChainMailActor: Actor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "restrained" }, { id: "exhaustion", level: 2 }] } };
    expect(dnd5eSrdSheet(restrainedChainMailActor, [chainMail, shield]).data).toEqual(
      expect.objectContaining({
        effectiveSpeed: 0,
        speedDetails: expect.objectContaining({ value: 0, base: 30, armorPenalty: -10, conditionPenalty: -10, conditionSetTo: 0, conditionMultiplier: 0, conditionSources: ["restrained", "exhaustion"] })
      })
    );
    const dexterousActor: Actor = { ...srdActor, data: { ...srdActor.data, attributes: { ...(srdActor.data.attributes as Record<string, unknown>), dexterity: 18 } } };
    expect(dnd5eSrdSheet(dexterousActor, [halfPlateArmor]).data).toEqual(
      expect.objectContaining({
        armorClass: 17,
        armorClassDetails: expect.objectContaining({ value: 17, base: 15, dexModifier: 2, armorName: "Half Plate Armor", stealthDisadvantage: true })
      })
    );
    expect(dnd5eSrdSheet(dexterousActor, [plateArmor]).data).toEqual(
      expect.objectContaining({
        armorClass: 18,
        armorClassDetails: expect.objectContaining({ value: 18, base: 18, dexModifier: 0, armorName: "Plate Armor", stealthDisadvantage: true, strengthRequirement: 15, speedPenalty: -10 })
      })
    );
    expect(dnd5eSrdQuickRolls(srdActor, [spell, chromaticOrb, iceKnife, shortbow, lightCrossbow])).toEqual(
      expect.arrayContaining([
        { id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" },
        { id: "save-charisma", label: "Charisma Save", formula: "1d20+2" },
        { id: "save-strength", label: "Strength Save", formula: "1d20+0" },
        { id: "skill-medicine", label: "Medicine Check", formula: "1d20+5" },
        { id: "skill-religion", label: "Religion Check", formula: "1d20+2" },
        { id: "skill-perception", label: "Perception Check", formula: "1d20+3" },
        { id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+3" },
        { id: "spell-itm_healing_word-healing", label: "Healing Word Healing", formula: "1d4+3" },
        expect.objectContaining({ id: "spell-itm_chromatic_orb-attack", label: "Chromatic Orb Attack", formula: "1d20+5", metadata: expect.objectContaining({ attackType: "spell", ability: "wisdom", proficiencyBonus: 2 }) }),
        { id: "spell-itm_chromatic_orb-damage", label: "Chromatic Orb Damage", formula: "3d8" },
        { id: "spell-itm_ice_knife-damage", label: "Ice Knife Damage", formula: "1d10" },
        { id: "spell-itm_ice_knife-secondary-damage", label: "Ice Knife Secondary Damage", formula: "2d6" },
        expect.objectContaining({ id: "item-itm_shortbow-attack", label: "Shortbow Attack", formula: "1d20+3", metadata: expect.objectContaining({ attackType: "weapon", ability: "dexterity", proficient: true, proficiencyBonus: 2 }) }),
        { id: "item-itm_shortbow-damage", label: "Shortbow Damage", formula: "1d6+1" },
        { id: "item-itm_light_crossbow-damage", label: "Light Crossbow Damage", formula: "1d8+1" }
      ])
    );
    const clericActor: Actor = { ...srdActor, data: { ...cleric!.data } };
    const clericCureWounds: Item = {
      id: "itm_life_cure_wounds",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: clericActor.id,
      type: "spell",
      name: "Cure Wounds",
      data: { level: 1, healingFormula: "1d8+@spellcasting", upcastFormula: "1d8" },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z"
    };
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
    let levelThreeClericData = levelTwoClericData;
    levelThreeClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelThreeClericData }, "level-up");
    const levelThreeClericActor: Actor = { ...clericActor, data: levelThreeClericData };
    expect(levelThreeClericData.features).toEqual(expect.arrayContaining(["Life Domain", "Disciple of Life", "Life Domain Spells", "Preserve Life"]));
    expect(dnd5eSrdQuickRolls(levelThreeClericActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-life-disciple-of-life", formula: "3", metadata: expect.objectContaining({ healingBonus: "2 + spell slot level" }) }),
        expect.objectContaining({ id: "feature-life-preserve-life", formula: "15", metadata: expect.objectContaining({ resource: "channelDivinity", target: "Bloodied creatures", maximumPerTarget: "half Hit Point maximum" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelThreeClericActor, [], "feature-life-preserve-life")).toBe("15");
    expect(dnd5eSrdActionFormula(levelThreeClericActor, [clericCureWounds], "spell-itm_life_cure_wounds-healing")).toBe("1d8+4+3");
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
        expect.objectContaining({ id: "feature-sear-undead-damage", label: "Sear Undead Damage", formula: "5d8", metadata: expect.objectContaining({ trigger: "Turn Undead failed save", damageType: "Radiant" }) }),
        expect.objectContaining({ id: "feature-life-preserve-life", formula: "25" })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveClericActor, [], "feature-sear-undead-damage")).toBe("5d8");
    expect(dnd5eSrdActionFormula(levelFiveClericActor, [clericCureWounds], "spell-itm_life_cure_wounds-healing", { spellSlotLevel: 3 })).toBe("1d8+5+2d8+5");
    let levelSixClericData = levelFiveClericData;
    levelSixClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelSixClericData }, "level-up");
    const levelSixClericActor: Actor = { ...clericActor, data: levelSixClericData };
    expect(levelSixClericData.features).toEqual(expect.arrayContaining(["Blessed Healer"]));
    expect(dnd5eSrdQuickRolls(levelSixClericActor, [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "feature-life-blessed-healer", formula: "3", metadata: expect.objectContaining({ selfHealing: "2 + spell slot level" }) })])
    );
    expect(dnd5eSrdActionFormula(levelSixClericActor, [], "feature-life-blessed-healer", { spellSlotLevel: 3 })).toBe("5");
    let levelSeventeenClericData = levelSixClericData;
    for (let level = 7; level <= 17; level += 1) {
      levelSeventeenClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelSeventeenClericData }, "level-up");
    }
    const levelSeventeenClericActor: Actor = { ...clericActor, data: levelSeventeenClericData };
    expect(levelSeventeenClericData.features).toEqual(expect.arrayContaining(["Supreme Healing"]));
    expect(dnd5eSrdQuickRolls(levelSeventeenClericActor, [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "feature-life-supreme-healing", formula: "0", metadata: expect.objectContaining({ maximizeHealingDice: true }) })])
    );
    expect(dnd5eSrdActionFormula(levelSeventeenClericActor, [clericCureWounds], "spell-itm_life_cure_wounds-healing", { spellSlotLevel: 3 })).toBe("8+11+16+5");
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
    expect(levelFiveFighterData.features).toEqual(expect.arrayContaining(["Champion", "Improved Critical", "Remarkable Athlete", "Extra Attack", "Tactical Shift"]));
    expect(levelFiveFighterData.combat).toEqual(expect.objectContaining({ attacksPerAction: 2, tacticalShift: { movementFt: 15, opportunityAttacks: false } }));
    expect(dnd5eSrdQuickRolls(levelFiveFighterActor, []).find((roll) => roll.id === "feature-second-wind-healing")).toEqual(
      expect.objectContaining({ formula: "1d10+5", metadata: { tacticalShift: { movementFt: 15, opportunityAttacks: false } } })
    );
    expect(dnd5eSrdQuickRolls(levelFiveFighterActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "initiative", label: "Initiative", formula: "2d20kh1+1", metadata: expect.objectContaining({ feature: "Remarkable Athlete", advantage: true }) }),
        expect.objectContaining({ id: "skill-athletics", label: "Athletics Check", formula: "2d20kh1+8", metadata: expect.objectContaining({ feature: "Remarkable Athlete", advantage: true }) }),
        expect.objectContaining({ id: "feature-champion-critical-range", label: "Improved Critical", formula: "0", metadata: expect.objectContaining({ minimumD20: 19, range: "19-20" }) }),
        expect.objectContaining({ id: "feature-champion-remarkable-athlete", label: "Remarkable Athlete", formula: "0", metadata: expect.objectContaining({ initiativeAdvantage: true, athleticsAdvantage: true }) })
      ])
    );
    expect(dnd5eSrdQuickRolls(levelFiveFighterActor, [fighterLongsword, { ...greatsword, actorId: levelFiveFighterActor.id }])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "item-itm_fighter_longsword-attack",
          label: "Longsword Attack",
          formula: "1d20+8",
          metadata: expect.objectContaining({ attacksPerAction: 2, feature: "Extra Attack", attackType: "weapon", proficiencyBonus: 3, criticalHitOn: "19-20", criticalRange: expect.objectContaining({ feature: "Improved Critical", minimumD20: 19 }) })
        }),
        expect.objectContaining({
          id: "item-itm_fighter_longsword-damage",
          label: "Longsword Damage",
          formula: "1d8+5",
          metadata: { attacksPerAction: 2, feature: "Extra Attack" }
        }),
        expect.objectContaining({
          id: "item-itm_greatsword-damage",
          label: "Greatsword Damage",
          formula: "2d6+5",
          metadata: { attacksPerAction: 2, feature: "Extra Attack" }
        })
      ])
    );
    let levelFifteenFighterData = levelFiveFighterData;
    for (let level = 6; level <= 15; level += 1) {
      levelFifteenFighterData = applyDnd5eSrdAdvancement({ ...fighterActor, data: levelFifteenFighterData }, "level-up");
    }
    const levelFifteenFighterActor: Actor = { ...fighterActor, data: levelFifteenFighterData };
    expect(levelFifteenFighterData.features).toEqual(expect.arrayContaining(["Additional Fighting Style", "Heroic Warrior", "Superior Critical"]));
    expect(dnd5eSrdQuickRolls(levelFifteenFighterActor, [fighterLongsword])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-champion-critical-range", label: "Superior Critical", metadata: expect.objectContaining({ minimumD20: 18, range: "18-20" }) }),
        expect.objectContaining({ id: "feature-champion-heroic-warrior", label: "Heroic Warrior", metadata: expect.objectContaining({ grantsHeroicInspiration: true }) }),
        expect.objectContaining({ id: "item-itm_fighter_longsword-attack", metadata: expect.objectContaining({ criticalHitOn: "18-20", criticalRange: expect.objectContaining({ feature: "Superior Critical", minimumD20: 18 }) }) })
      ])
    );
    let levelEighteenFighterData = levelFifteenFighterData;
    for (let level = 16; level <= 18; level += 1) {
      levelEighteenFighterData = applyDnd5eSrdAdvancement({ ...fighterActor, data: levelEighteenFighterData }, "level-up");
    }
    const levelEighteenFighterActor: Actor = { ...fighterActor, data: levelEighteenFighterData };
    expect(levelEighteenFighterData.features).toEqual(expect.arrayContaining(["Survivor"]));
    expect(dnd5eSrdQuickRolls(levelEighteenFighterActor, [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "feature-champion-survivor", label: "Survivor Rally", formula: "7", metadata: expect.objectContaining({ deathSavingThrows: { advantage: true, d20RollsCountingAs20: "18-20" } }) })])
    );
    expect(dnd5eSrdActionFormula(levelEighteenFighterActor, [], "feature-champion-survivor")).toBe("7");
    expect(useDnd5eSrdAction(levelEighteenFighterActor, [], "feature-champion-survivor").consumed).toEqual([]);
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
    let levelThreeBardData = bardActor.data;
    for (let level = 2; level <= 3; level += 1) {
      levelThreeBardData = applyDnd5eSrdAdvancement({ ...bardActor, data: levelThreeBardData }, "level-up");
    }
    const levelThreeBardActor: Actor = { ...bardActor, data: levelThreeBardData };
    expect(levelThreeBardData.features).toEqual(expect.arrayContaining(["College of Lore", "Bonus Proficiencies", "Cutting Words"]));
    expect(dnd5eSrdQuickRolls(levelThreeBardActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-lore-cutting-words", label: "Cutting Words", formula: "1d6", metadata: expect.objectContaining({ resource: "bardicInspiration", action: "Reaction", range: 60, die: "d6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelThreeBardActor, [], "feature-lore-cutting-words")).toBe("1d6");
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
    const cuttingWordsUse = useDnd5eSrdAction({ ...levelFiveBardActor, data: { ...levelFiveBardActor.data, resources: { bardicInspiration: { current: 5, max: 5, recovery: "short" } } } }, [], "feature-lore-cutting-words");
    expect(cuttingWordsUse.consumed).toEqual([{ type: "resource", key: "bardicInspiration", label: "Bardic Inspiration", amount: 1, remaining: 4 }]);
    let levelSixBardData = levelFiveBardData;
    levelSixBardData = applyDnd5eSrdAdvancement({ ...bardActor, data: levelSixBardData }, "level-up");
    const levelSixBardActor: Actor = { ...bardActor, data: levelSixBardData };
    expect(levelSixBardData.features).toEqual(expect.arrayContaining(["Magical Discoveries"]));
    expect(dnd5eSrdQuickRolls(levelSixBardActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-lore-magical-discoveries", label: "Magical Discoveries", formula: "0", metadata: expect.objectContaining({ spellCount: 2, sources: ["Cleric", "Druid", "Wizard"], maxSpellLevel: 3 }) })
      ])
    );
    let levelFourteenBardData = levelSixBardData;
    for (let level = 7; level <= 14; level += 1) {
      levelFourteenBardData = applyDnd5eSrdAdvancement({ ...bardActor, data: levelFourteenBardData }, "level-up");
    }
    const levelFourteenBardActor: Actor = { ...bardActor, data: levelFourteenBardData };
    expect(levelFourteenBardData.features).toEqual(expect.arrayContaining(["Peerless Skill"]));
    expect(dnd5eSrdQuickRolls(levelFourteenBardActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-lore-cutting-words", formula: "1d10", metadata: expect.objectContaining({ die: "d10" }) }),
        expect.objectContaining({ id: "feature-lore-peerless-skill", label: "Peerless Skill", formula: "1d10", metadata: expect.objectContaining({ resource: "bardicInspiration", conditionalExpenditure: expect.any(String) }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFourteenBardActor, [], "feature-lore-peerless-skill")).toBe("1d10");
    const berserkerActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("barbarian")!.data } };
    let levelThreeBarbarianData = berserkerActor.data;
    for (let level = 2; level <= 3; level += 1) {
      levelThreeBarbarianData = applyDnd5eSrdAdvancement({ ...berserkerActor, data: levelThreeBarbarianData }, "level-up");
    }
    const levelThreeBarbarianActor: Actor = { ...berserkerActor, data: levelThreeBarbarianData };
    expect(levelThreeBarbarianData.features).toEqual(expect.arrayContaining(["Path of the Berserker", "Frenzy"]));
    expect(dnd5eSrdQuickRolls(levelThreeBarbarianActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "feature-berserker-frenzy-damage",
          label: "Berserker Frenzy Damage",
          formula: "2d6",
          metadata: expect.objectContaining({ diceEqualToRageDamageBonus: 2, requires: ["Rage active", "Reckless Attack"] })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(levelThreeBarbarianActor, [], "feature-berserker-frenzy-damage")).toBe("2d6");
    let levelSixBarbarianData = levelThreeBarbarianData;
    for (let level = 4; level <= 6; level += 1) {
      levelSixBarbarianData = applyDnd5eSrdAdvancement({ ...berserkerActor, data: levelSixBarbarianData }, "level-up");
    }
    const levelSixBarbarianActor: Actor = { ...berserkerActor, data: levelSixBarbarianData };
    expect(levelSixBarbarianData.features).toEqual(expect.arrayContaining(["Mindless Rage"]));
    expect(dnd5eSrdQuickRolls(levelSixBarbarianActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-berserker-mindless-rage", label: "Mindless Rage", formula: "0", metadata: expect.objectContaining({ immunity: ["Charmed", "Frightened"] }) })
      ])
    );
    let levelTenBarbarianData = levelSixBarbarianData;
    for (let level = 7; level <= 10; level += 1) {
      levelTenBarbarianData = applyDnd5eSrdAdvancement({ ...berserkerActor, data: levelTenBarbarianData }, "level-up");
    }
    const levelTenBarbarianActor: Actor = { ...berserkerActor, data: levelTenBarbarianData };
    expect(levelTenBarbarianData.features).toEqual(expect.arrayContaining(["Retaliation"]));
    expect(dnd5eSrdQuickRolls(levelTenBarbarianActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-berserker-frenzy-damage", formula: "3d6", metadata: expect.objectContaining({ diceEqualToRageDamageBonus: 3 }) }),
        expect.objectContaining({ id: "feature-berserker-retaliation", label: "Retaliation", formula: "0", metadata: expect.objectContaining({ actionEconomy: "Reaction", rangeFt: 5 }) })
      ])
    );
    let levelFourteenBarbarianData = levelTenBarbarianData;
    for (let level = 11; level <= 14; level += 1) {
      levelFourteenBarbarianData = applyDnd5eSrdAdvancement({ ...berserkerActor, data: levelFourteenBarbarianData }, "level-up");
    }
    const levelFourteenBarbarianActor: Actor = { ...berserkerActor, data: levelFourteenBarbarianData };
    expect(levelFourteenBarbarianData.features).toEqual(expect.arrayContaining(["Intimidating Presence"]));
    expect(dnd5eSrdQuickRolls(levelFourteenBarbarianActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "feature-berserker-intimidating-presence",
          label: "Intimidating Presence",
          formula: "0",
          metadata: expect.objectContaining({ actionEconomy: "Bonus Action", area: { type: "Emanation", rangeFt: 30 }, save: expect.objectContaining({ ability: "wisdom" }), restoreUse: { resource: "rage", actionRequired: false } })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFourteenBarbarianActor, [], "feature-berserker-intimidating-presence")).toBe("0");
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
    expect(levelFivePaladinData.features).toEqual(expect.arrayContaining(["Lay On Hands", "Paladin's Smite", "Oath of Devotion", "Sacred Weapon", "Extra Attack", "Faithful Steed"]));
    expect(levelFivePaladinData.resources).toEqual({
      layOnHands: { current: 5, max: 25, recovery: "long" },
      paladinsSmite: { current: 1, max: 1, recovery: "long" },
      channelDivinity: { current: 2, max: 2, recovery: "short" },
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
        expect.objectContaining({ id: "feature-devotion-sacred-weapon", label: "Sacred Weapon", formula: "0", metadata: expect.objectContaining({ resource: "channelDivinity", attackBonus: 4, light: { bright: 20, dim: 20 } }) }),
        expect.objectContaining({ id: "item-itm_paladin_longsword-damage", formula: "1d8+3", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFivePaladinActor, [], "feature-divine-smite-damage", { spellSlotLevel: 2 })).toBe("3d8");
    expect(useDnd5eSrdAction(levelFivePaladinActor, [], "feature-devotion-sacred-weapon").consumed).toEqual([{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }]);
    let levelSevenPaladinData = levelFivePaladinData;
    for (let level = 6; level <= 7; level += 1) {
      levelSevenPaladinData = applyDnd5eSrdAdvancement({ ...paladinActor, data: levelSevenPaladinData }, "level-up");
    }
    const levelSevenPaladinActor: Actor = { ...paladinActor, data: levelSevenPaladinData };
    expect(levelSevenPaladinData.features).toEqual(expect.arrayContaining(["Aura of Protection", "Aura of Devotion"]));
    expect(dnd5eSrdQuickRolls(levelSevenPaladinActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-devotion-aura", label: "Aura of Devotion", formula: "0", metadata: expect.objectContaining({ conditionImmunity: "Charmed", aura: "Aura of Protection" }) })
      ])
    );
    let levelFifteenPaladinData = levelSevenPaladinData;
    for (let level = 8; level <= 15; level += 1) {
      levelFifteenPaladinData = applyDnd5eSrdAdvancement({ ...paladinActor, data: levelFifteenPaladinData }, "level-up");
    }
    const levelFifteenPaladinActor: Actor = { ...paladinActor, data: levelFifteenPaladinData };
    expect(levelFifteenPaladinData.features).toEqual(expect.arrayContaining(["Smite of Protection"]));
    expect(dnd5eSrdQuickRolls(levelFifteenPaladinActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-devotion-smite-of-protection", label: "Smite of Protection", formula: "0", metadata: expect.objectContaining({ benefit: "Half Cover" }) }),
        expect.objectContaining({ id: "feature-divine-smite-damage", metadata: expect.objectContaining({ smiteOfProtection: expect.objectContaining({ benefit: "Half Cover" }) }) })
      ])
    );
    let levelTwentyPaladinData = levelFifteenPaladinData;
    for (let level = 16; level <= 20; level += 1) {
      levelTwentyPaladinData = applyDnd5eSrdAdvancement({ ...paladinActor, data: levelTwentyPaladinData }, "level-up");
    }
    const levelTwentyPaladinActor: Actor = { ...paladinActor, data: levelTwentyPaladinData };
    expect(levelTwentyPaladinData.features).toEqual(expect.arrayContaining(["Holy Nimbus"]));
    expect(levelTwentyPaladinData.resources).toEqual(expect.objectContaining({ holyNimbus: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelTwentyPaladinActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-devotion-holy-nimbus-damage", label: "Holy Nimbus Radiant Damage", formula: "17", metadata: expect.objectContaining({ resource: "holyNimbus", action: "Bonus Action", damageType: "Radiant", restoreUse: { spellSlotLevel: 5, actionRequired: false } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelTwentyPaladinActor, [], "feature-devotion-holy-nimbus-damage")).toBe("17");
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
    expect(levelFiveDruidData.features).toEqual(expect.arrayContaining(["Wild Shape", "Wild Companion", "Druid Subclass", "Circle of the Moon", "Circle Forms", "Circle of the Moon Spells", "Wild Resurgence"]));
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
        expect.objectContaining({ id: "feature-wild-shape", label: "Wild Shape", formula: "0", metadata: expect.objectContaining({ resource: "wildShape", maxUses: 2, knownForms: 6, maxChallengeRating: "1", temporaryHitPoints: 15 }) }),
        expect.objectContaining({ id: "feature-wild-companion", label: "Wild Companion", formula: "0", metadata: expect.objectContaining({ spell: "Find Familiar", resource: "wildShape" }) }),
        expect.objectContaining({ id: "feature-wild-resurgence-wild-shape", label: "Wild Resurgence: Wild Shape", formula: "0", metadata: expect.objectContaining({ restores: "wildShape", cost: "spell slot" }) }),
        expect.objectContaining({ id: "feature-wild-resurgence-spell-slot", label: "Wild Resurgence: Spell Slot", formula: "0", metadata: expect.objectContaining({ resource: "wildResurgence", restores: "level1 spell slot" }) }),
        expect.objectContaining({ id: "feature-moon-circle-forms", formula: "0", metadata: expect.objectContaining({ maxChallengeRating: "1", armorClassFloor: 18, temporaryHitPoints: 15, castCircleSpellsInWildShape: true }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-shape")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-companion")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-resurgence-wild-shape")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveDruidActor, [], "feature-wild-resurgence-spell-slot")).toBe("0");
    let levelFourteenDruidData = levelFiveDruidData;
    for (let level = 6; level <= 14; level += 1) {
      levelFourteenDruidData = applyDnd5eSrdAdvancement({ ...druidActor, data: levelFourteenDruidData }, "level-up");
    }
    const levelFourteenDruidActor: Actor = { ...druidActor, data: levelFourteenDruidData };
    expect(levelFourteenDruidData.features).toEqual(expect.arrayContaining(["Improved Circle Forms", "Moonlight Step", "Lunar Form"]));
    expect(levelFourteenDruidData.resources).toEqual(expect.objectContaining({ moonlightStep: { current: 7, max: 9, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelFourteenDruidActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-moon-improved-circle-forms", metadata: expect.objectContaining({ concentrationSaveBonus: 9 }) }),
        expect.objectContaining({ id: "feature-moon-moonlight-step", formula: "0", metadata: expect.objectContaining({ resource: "moonlightStep", maxUses: 9, teleportFt: 30 }) }),
        expect.objectContaining({ id: "feature-moon-lunar-form-damage", formula: "2d10", metadata: expect.objectContaining({ damageType: "Radiant", sharedMoonlight: { trigger: "Moonlight Step", willingCreatureWithinFt: 10 } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFourteenDruidActor, [], "feature-moon-lunar-form-damage")).toBe("2d10");
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
        expect.objectContaining({ id: "feature-hunter-lore", formula: "0", metadata: expect.objectContaining({ reveals: ["Immunities", "Resistances", "Vulnerabilities"] }) }),
        expect.objectContaining({ id: "feature-hunter-prey", formula: "1d8", metadata: expect.objectContaining({ swapsOnRest: ["short", "long"] }) }),
        expect.objectContaining({ id: "feature-hunters-mark-damage", formula: "1d6", metadata: expect.objectContaining({ freeUses: 3, upcastDuration: { level3: "up to 8 hours", level5: "up to 24 hours" } }) }),
        expect.objectContaining({ id: "item-itm_ranger_longbow-damage", formula: "1d8+3", metadata: { attacksPerAction: 2, feature: "Extra Attack" } })
      ])
    );
    let levelFifteenRangerData = levelFiveRangerData;
    for (let level = 6; level <= 15; level += 1) {
      levelFifteenRangerData = applyDnd5eSrdAdvancement({ ...rangerActor, data: levelFifteenRangerData }, "level-up");
    }
    const levelFifteenRangerActor: Actor = { ...rangerActor, data: levelFifteenRangerData };
    expect(levelFifteenRangerData.features).toEqual(expect.arrayContaining(["Hunter", "Hunter's Lore", "Hunter's Prey", "Defensive Tactics", "Superior Hunter's Prey", "Superior Hunter's Defense"]));
    expect(dnd5eSrdQuickRolls(levelFifteenRangerActor, [rangerLongbow])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-hunter-defensive-tactics", formula: "0", metadata: expect.objectContaining({ choices: expect.arrayContaining([expect.objectContaining({ id: "escape-the-horde" }), expect.objectContaining({ id: "multiattack-defense" })]) }) }),
        expect.objectContaining({ id: "feature-hunter-superior-prey", formula: "1d6", metadata: expect.objectContaining({ secondaryTarget: { rangeFt: 30, requiresSight: true }, damageType: "Force" }) }),
        expect.objectContaining({ id: "feature-hunter-superior-defense", formula: "0", metadata: expect.objectContaining({ actionEconomy: "Reaction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFifteenRangerActor, [], "feature-hunter-superior-prey")).toBe("1d6");
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
    expect(levelFiveMonkData.features).toEqual(expect.arrayContaining(["Monk's Focus", "Flurry of Blows", "Patient Defense", "Step of the Wind", "Uncanny Metabolism", "Deflect Attacks", "Monk Subclass", "Warrior of the Open Hand", "Open Hand Technique", "Extra Attack", "Stunning Strike"]));
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
        expect.objectContaining({ id: "feature-open-hand-technique", formula: "0", metadata: expect.objectContaining({ flurryOfBlowsRollId: "feature-flurry-of-blows", options: expect.arrayContaining([expect.objectContaining({ name: "Addle" }), expect.objectContaining({ name: "Push", save: { ability: "strength", dc: 13 } }), expect.objectContaining({ name: "Topple", save: { ability: "dexterity", dc: 13 }, condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "item-itm_monk_spear-damage", formula: "1d8+5", metadata: expect.objectContaining({ attacksPerAction: 2, feature: "Extra Attack", martialArts: { die: "d8", dexterousAttacks: true } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveMonkActor, [monkSpear], "feature-deflect-attacks-damage")).toBe("2d8+5");
    expect(dnd5eSrdActionFormula(levelFiveMonkActor, [monkSpear], "feature-uncanny-metabolism-healing")).toBe("1d8+5");
    let levelSeventeenMonkData = levelFiveMonkData;
    for (let level = 6; level <= 17; level += 1) {
      levelSeventeenMonkData = applyDnd5eSrdAdvancement({ ...monkActor, data: levelSeventeenMonkData }, "level-up");
    }
    const levelSeventeenMonkActor: Actor = { ...monkActor, data: levelSeventeenMonkData };
    expect(levelSeventeenMonkData.features).toEqual(expect.arrayContaining(["Warrior of the Open Hand", "Open Hand Technique", "Wholeness of Body", "Fleet Step", "Quivering Palm"]));
    expect(levelSeventeenMonkData.resources).toEqual(expect.objectContaining({
      focus: { current: 2, max: 17, recovery: "short" },
      uncannyMetabolism: { current: 1, max: 1, recovery: "long" },
      wholenessOfBody: { current: 2, max: 2, recovery: "long" }
    }));
    expect(dnd5eSrdQuickRolls(levelSeventeenMonkActor, [monkSpear])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-open-hand-wholeness-of-body", formula: "1d12+2", metadata: expect.objectContaining({ resource: "wholenessOfBody", maxUses: 2 }) }),
        expect.objectContaining({ id: "feature-open-hand-fleet-step", formula: "0", metadata: expect.objectContaining({ followupAction: "Step of the Wind" }) }),
        expect.objectContaining({ id: "feature-open-hand-quivering-palm-damage", formula: "10d12", metadata: expect.objectContaining({ resource: "focus", cost: 4, save: { ability: "constitution", dc: 16 }, damageType: "Force" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelSeventeenMonkActor, [monkSpear], "feature-open-hand-wholeness-of-body")).toBe("1d12+2");
    expect(dnd5eSrdActionFormula(levelSeventeenMonkActor, [monkSpear], "feature-open-hand-quivering-palm-damage")).toBe("10d12");
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
        expect.objectContaining({ id: "spell-itm_sorcerous_burst-damage", label: "Sorcerous Burst Damage", formula: "1d8", metadata: expect.objectContaining({ damageType: "choice", damageTypes: expect.arrayContaining(["fire"]) }) }),
        { id: "spell-itm_sorcerer_chromatic_orb-damage", label: "Chromatic Orb Damage", formula: "3d8" }
      ])
    );
    expect(dnd5eSrdActionFormula(sorcererActor, [], "feature-innate-sorcery")).toBe("0");
    let levelFiveSorcererData = sorcererActor.data;
    for (let level = 2; level <= 5; level += 1) {
      levelFiveSorcererData = applyDnd5eSrdAdvancement({ ...sorcererActor, data: levelFiveSorcererData }, "level-up");
    }
    const levelFiveSorcererActor: Actor = { ...sorcererActor, data: levelFiveSorcererData };
    expect(levelFiveSorcererData.features).toEqual(expect.arrayContaining(["Font of Magic", "Metamagic", "Sorcerer Subclass", "Draconic Sorcery", "Draconic Resilience", "Draconic Spells", "Ability Score Improvement", "Sorcerous Restoration"]));
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
        expect.objectContaining({ id: "feature-metamagic-quickened-spell", metadata: expect.objectContaining({ cost: 2, castingTime: "Bonus Action" }) }),
        expect.objectContaining({ id: "feature-draconic-resilience", formula: "0", metadata: expect.objectContaining({ hitPointMaximumBonus: 5, unarmoredArmorClass: 17, draconicSpells: expect.arrayContaining([expect.objectContaining({ sorcererLevel: 3, spells: ["alter-self", "chromatic-orb", "command", "dragons-breath"] })]) }) })
      ])
    );
    let levelEighteenSorcererData = levelFiveSorcererData;
    for (let level = 6; level <= 18; level += 1) {
      levelEighteenSorcererData = applyDnd5eSrdAdvancement({ ...sorcererActor, data: levelEighteenSorcererData }, "level-up");
    }
    const levelEighteenSorcererActor: Actor = { ...sorcererActor, data: levelEighteenSorcererData };
    expect(levelEighteenSorcererData.features).toEqual(expect.arrayContaining(["Elemental Affinity", "Dragon Wings", "Dragon Companion"]));
    expect(levelEighteenSorcererData.resources).toEqual(expect.objectContaining({
      dragonWings: { current: 1, max: 1, recovery: "long" },
      dragonCompanion: { current: 1, max: 1, recovery: "long" }
    }));
    expect(dnd5eSrdSheet(levelEighteenSorcererActor, []).data.armorClassDetails).toEqual(expect.objectContaining({ armorName: "Draconic Resilience", value: 23 }));
    expect(dnd5eSrdQuickRolls(levelEighteenSorcererActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-draconic-resilience", metadata: expect.objectContaining({ hitPointMaximumBonus: 18, unarmoredArmorClass: 23 }) }),
        expect.objectContaining({ id: "feature-draconic-elemental-affinity", formula: "11", metadata: expect.objectContaining({ damageBonus: 11, damageTypeChoices: ["Acid", "Cold", "Fire", "Lightning", "Poison"] }) }),
        expect.objectContaining({ id: "feature-draconic-wings", formula: "0", metadata: expect.objectContaining({ resource: "dragonWings", flySpeedFt: 60, restoreUse: { resource: "sorceryPoints", cost: 3, actionRequired: false } }) }),
        expect.objectContaining({ id: "feature-draconic-companion", formula: "0", metadata: expect.objectContaining({ resource: "dragonCompanion", spell: "summon-dragon", canRemoveConcentration: true }) })
      ])
    );
    const dragonWings = useDnd5eSrdAction(levelEighteenSorcererActor, [], "feature-draconic-wings");
    expect(dragonWings).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "dragonWings", label: "Dragon Wings", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ dragonWings: { current: 0, max: 1, recovery: "long" } }) })
      })
    );
    const dragonCompanion = useDnd5eSrdAction(levelEighteenSorcererActor, [], "feature-draconic-companion");
    expect(dragonCompanion).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "dragonCompanion", label: "Dragon Companion", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ dragonCompanion: { current: 0, max: 1, recovery: "long" } }) })
      })
    );
    const dragonWingsRestoration = useDnd5eSrdAction(
      { ...levelEighteenSorcererActor, data: { ...levelEighteenSorcererData, resources: { ...(levelEighteenSorcererData.resources as Record<string, unknown>), dragonWings: { current: 0, max: 1, recovery: "long" }, sorceryPoints: { current: 3, max: 18, recovery: "long" } } } },
      [],
      "feature-draconic-wings",
      { resourceAmount: 3 }
    );
    expect(dragonWingsRestoration).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "sorceryPoints", label: "Sorcery Points", amount: 3, remaining: 0 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ dragonWings: { current: 1, max: 1, recovery: "long" }, sorceryPoints: { current: 0, max: 18, recovery: "long" } }) })
      })
    );
    expect(dnd5eSrdActionFormula(levelFiveSorcererActor, [acidSplash], "spell-itm_acid_splash-damage")).toBe("2d6");
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
    expect(levelFiveRogueData.features).toEqual(expect.arrayContaining(["Thief", "Fast Hands", "Second-Story Work", "Cunning Action", "Steady Aim", "Cunning Strike", "Uncanny Dodge"]));
    expect(dnd5eSrdQuickRolls(levelFiveRogueActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-sneak-attack-damage", formula: "3d6", metadata: expect.objectContaining({ cunningStrike: expect.objectContaining({ saveDc: 16, reducedSneakAttackFormula: "2d6" }) }) }),
        expect.objectContaining({ id: "feature-cunning-strike", label: "Cunning Strike", formula: "0", metadata: expect.objectContaining({ saveDc: 16, sneakAttackDice: 3 }) }),
        expect.objectContaining({ id: "feature-thief-fast-hands", label: "Fast Hands", formula: "0", metadata: expect.objectContaining({ actionEconomy: "Bonus Action", grantedBy: "Cunning Action" }) }),
        expect.objectContaining({ id: "feature-thief-second-story-work", label: "Second-Story Work", formula: "0", metadata: expect.objectContaining({ climbSpeedFt: 30, jumpDistanceBonusFt: 5 }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFiveRogueActor, [], "feature-cunning-strike")).toBe("0");
    expect(dnd5eSrdActionFormula(levelFiveRogueActor, [], "feature-thief-fast-hands")).toBe("0");
    let levelThirteenRogueData = levelFiveRogueData;
    for (let level = 6; level <= 13; level += 1) {
      levelThirteenRogueData = applyDnd5eSrdAdvancement({ ...rogueActor, data: levelThirteenRogueData }, "level-up");
    }
    const levelThirteenRogueActor: Actor = { ...rogueActor, data: levelThirteenRogueData };
    expect(levelThirteenRogueData.features).toEqual(expect.arrayContaining(["Supreme Sneak", "Use Magic Device"]));
    expect(dnd5eSrdQuickRolls(levelThirteenRogueActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-thief-supreme-sneak", label: "Supreme Sneak", formula: "0", metadata: expect.objectContaining({ stealthAdvantage: true, movementLimitFt: 15 }) }),
        expect.objectContaining({ id: "feature-thief-use-magic-device", label: "Use Magic Device", formula: "1d6", metadata: expect.objectContaining({ attunementLimit: 4, charges: { die: "1d6", noChargeExpendedOn: 6 } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(levelThirteenRogueActor, [], "feature-thief-use-magic-device")).toBe("1d6");
    let levelSeventeenRogueData = levelThirteenRogueData;
    for (let level = 14; level <= 17; level += 1) {
      levelSeventeenRogueData = applyDnd5eSrdAdvancement({ ...rogueActor, data: levelSeventeenRogueData }, "level-up");
    }
    const levelSeventeenRogueActor: Actor = { ...rogueActor, data: levelSeventeenRogueData };
    expect(levelSeventeenRogueData.features).toEqual(expect.arrayContaining(["Thief's Reflexes"]));
    expect(dnd5eSrdQuickRolls(levelSeventeenRogueActor, [])).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "feature-thief-reflexes", label: "Thief's Reflexes", formula: "0", metadata: expect.objectContaining({ trigger: "first round of combat" }) })])
    );
    expect(useDnd5eSrdAction(levelSeventeenRogueActor, [], "feature-thief-reflexes").consumed).toEqual([]);
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
    expect(dnd5eSrdQuickRolls(poisonedActor, [shortbow]).find((roll) => roll.id === "item-itm_shortbow-attack")).toEqual(
      expect.objectContaining({ formula: "2d20kl1+3", metadata: expect.objectContaining({ conditionRollMode: "disadvantage", conditionSources: ["poisoned"] }) })
    );
    const exhaustedPoisonedActor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "poisoned" }, { id: "exhaustion", level: 2 }] } };
    expect(dnd5eSrdQuickRolls(exhaustedPoisonedActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ability-wisdom", formula: "2d20kl1-1", metadata: expect.objectContaining({ conditionRollMode: "disadvantage", exhaustionLevel: 2, conditionPenalty: -4 }) }),
        expect.objectContaining({ id: "skill-medicine", formula: "2d20kl1+1", metadata: expect.objectContaining({ conditionSources: ["poisoned", "exhaustion"] }) }),
        expect.objectContaining({ id: "tool-calligraphers-supplies", formula: "2d20kl1-1" })
      ])
    );
    expect(dnd5eSrdQuickRolls(exhaustedPoisonedActor, [shortbow]).find((roll) => roll.id === "item-itm_shortbow-attack")).toEqual(
      expect.objectContaining({ formula: "2d20kl1-1", metadata: expect.objectContaining({ exhaustionLevel: 2, conditionPenalty: -4 }) })
    );
    const restrainedActor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "restrained" }] } };
    expect(dnd5eSrdQuickRolls(restrainedActor, []).find((roll) => roll.id === "save-dexterity")).toEqual(
      expect.objectContaining({ formula: "2d20kl1+1", metadata: expect.objectContaining({ conditionRollMode: "disadvantage", conditionSources: ["restrained"] }) })
    );
    const paralyzedActor = { ...srdActor, data: { ...srdActor.data, conditions: [{ id: "paralyzed" }] } };
    expect(dnd5eSrdQuickRolls(paralyzedActor, []).find((roll) => roll.id === "save-dexterity")).toEqual(
      expect.objectContaining({ formula: "0", metadata: expect.objectContaining({ automaticFailure: true, conditionSources: ["paralyzed"] }) })
    );
    const toolSpecialistActor: Actor = {
      ...srdActor,
      data: { ...srdActor.data, toolProficiencies: ["herbalism-kit", "flute", "navigators-tools"], toolExpertise: ["navigators-tools"] }
    };
    expect(dnd5eSrdQuickRolls(toolSpecialistActor, [])).toEqual(
      expect.arrayContaining([
        { id: "tool-herbalism-kit", label: "Herbalism Kit Check", formula: "1d20+2" },
        { id: "tool-flute", label: "Flute Check", formula: "1d20+2" },
        { id: "tool-navigators-tools", label: "Navigator's Tools Check", formula: "1d20+7" }
      ])
    );
    expect(dnd5eSrdActionFormula(srdActor, [spell], "spell-itm_healing_word-healing", { spellSlotLevel: 2 })).toBe("1d4+3+2d4");
    expect(dnd5eSrdActionFormula(srdActor, [chromaticOrb], "spell-itm_chromatic_orb-attack")).toBe("1d20+5");
    expect(dnd5eSrdActionFormula(poisonedActor, [shortbow], "item-itm_shortbow-attack")).toBe("2d20kl1+3");
    expect(dnd5eSrdActionFormula(srdActor, [bane], "spell-itm_bane-effect")).toBe("1d4");
    expect(dnd5eSrdActionFormula(srdActor, [command], "spell-itm_command-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [counterspell], "spell-itm_counterspell-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [dispelMagic], "spell-itm_dispel_magic-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [animalFriendship], "spell-itm_animal_friendship-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [acidArrow], "spell-itm_acid_arrow-damage", { spellSlotLevel: 3 })).toBe("4d4+1d4");
    expect(dnd5eSrdActionFormula(srdActor, [acidArrow], "spell-itm_acid_arrow-secondary-damage", { spellSlotLevel: 3 })).toBe("2d4+1d4");
    expect(dnd5eSrdActionFormula(srdActor, [acidSplash], "spell-itm_acid_splash-damage")).toBe("1d6");
    expect(dnd5eSrdActionFormula(srdActor, [aid], "spell-itm_aid-healing", { spellSlotLevel: 4 })).toBe("5+10");
    expect(dnd5eSrdActionFormula(srdActor, [burningHands], "spell-itm_burning_hands-damage", { spellSlotLevel: 2 })).toBe("3d6+1d6");
    expect(dnd5eSrdActionFormula(srdActor, [chromaticOrb], "spell-itm_chromatic_orb-damage", { spellSlotLevel: 2 })).toBe("3d8+1d8");
    expect(dnd5eSrdActionFormula(srdActor, [iceKnife], "spell-itm_ice_knife-secondary-damage", { spellSlotLevel: 2 })).toBe("2d6+1d6");
    expect(dnd5eSrdActionFormula(srdActor, [dissonantWhispers], "spell-itm_dissonant_whispers-damage", { spellSlotLevel: 3 })).toBe("3d6+2d6");
    expect(dnd5eSrdActionFormula(srdActor, [dragonsBreath], "spell-itm_dragons_breath-damage", { spellSlotLevel: 3 })).toBe("3d6+1d6");
    expect(dnd5eSrdActionFormula(srdActor, [enhanceAbility], "spell-itm_enhance_ability-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [enlargeReduce], "spell-itm_enlarge_reduce-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [fear], "spell-itm_fear-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [fireball], "spell-itm_fireball-damage", { spellSlotLevel: 5 })).toBe("8d6+2d6");
    expect(dnd5eSrdActionFormula(srdActor, [fly], "spell-itm_fly-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [gaseousForm], "spell-itm_gaseous_form-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [guidingBolt], "spell-itm_guiding_bolt-damage", { spellSlotLevel: 3 })).toBe("4d6+2d6");
    expect(dnd5eSrdActionFormula(srdActor, [haste], "spell-itm_haste-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [hypnoticPattern], "spell-itm_hypnotic_pattern-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [identify], "spell-itm_identify-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [invisibility], "spell-itm_invisibility-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [lesserRestoration], "spell-itm_lesser_restoration-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [lightningBolt], "spell-itm_lightning_bolt-damage", { spellSlotLevel: 4 })).toBe("8d6+1d6");
    expect(dnd5eSrdActionFormula(srdActor, [mageArmor], "spell-itm_mage_armor-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [magicMissile], "spell-itm_magic_missile-damage", { spellSlotLevel: 3 })).toBe("3d4+3+2d4+2");
    expect(dnd5eSrdActionFormula(srdActor, [massCureWounds], "spell-itm_mass_cure_wounds-healing", { spellSlotLevel: 6 })).toBe("5d8+3+1d8");
    expect(dnd5eSrdActionFormula(srdActor, [massHealingWord], "spell-itm_mass_healing_word-healing", { spellSlotLevel: 5 })).toBe("2d4+3+2d4");
    expect(dnd5eSrdActionFormula(srdActor, [mindSpike], "spell-itm_mind_spike-damage", { spellSlotLevel: 4 })).toBe("3d8+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [mistyStep], "spell-itm_misty_step-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [detectThoughts], "spell-itm_detect_thoughts-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [clairvoyance], "spell-itm_clairvoyance-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [phantasmalForce], "spell-itm_phantasmal_force-damage")).toBe("2d8");
    expect(dnd5eSrdActionFormula(srdActor, [prayerOfHealing], "spell-itm_prayer_of_healing-healing", { spellSlotLevel: 4 })).toBe("2d8+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [revivify], "spell-itm_revivify-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [scorchingRay], "spell-itm_scorching_ray-damage", { spellSlotLevel: 3 })).toBe("2d6");
    expect(dnd5eSrdActionFormula(srdActor, [seeInvisibility], "spell-itm_see_invisibility-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [searingSmite], "spell-itm_searing_smite-damage", { spellSlotLevel: 3 })).toBe("1d6+2d6");
    expect(dnd5eSrdActionFormula(srdActor, [shieldSpell], "spell-itm_shield_spell-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [shatter], "spell-itm_shatter-damage", { spellSlotLevel: 4 })).toBe("3d8+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [silence], "spell-itm_silence-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [slow], "spell-itm_slow-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [spiritGuardians], "spell-itm_spirit_guardians-damage", { spellSlotLevel: 5 })).toBe("3d8+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [spiritualWeapon], "spell-itm_spiritual_weapon-damage", { spellSlotLevel: 4 })).toBe("1d8+3+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [stinkingCloud], "spell-itm_stinking_cloud-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [suggestion], "spell-itm_suggestion-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [tsunami], "spell-itm_tsunami-damage")).toBe("6d10");
    expect(dnd5eSrdActionFormula(srdActor, [tsunami], "spell-itm_tsunami-secondary-damage")).toBe("5d10");
    expect(dnd5eSrdActionFormula(srdActor, [thunderwave], "spell-itm_thunderwave-damage", { spellSlotLevel: 3 })).toBe("2d8+2d8");
    expect(dnd5eSrdActionFormula(srdActor, [vitriolicSphere], "spell-itm_vitriolic_sphere-damage", { spellSlotLevel: 5 })).toBe("10d4+2d4");
    expect(dnd5eSrdActionFormula(srdActor, [vitriolicSphere], "spell-itm_vitriolic_sphere-secondary-damage", { spellSlotLevel: 5 })).toBe("5d4");
    expect(dnd5eSrdActionFormula(srdActor, [web], "spell-itm_web-effect")).toBe("0");
    expect(dnd5eSrdActionFormula(srdActor, [web], "spell-itm_web-secondary-damage")).toBe("2d4");

    const purchased = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("longsword")!, 2);
    expect(purchased).toEqual(expect.objectContaining({ entryId: "longsword", quantity: 2, unitCostGp: 15, totalCostGp: 30, currency: { gp: 20, sp: 0, cp: 0 } }));
    expect(purchased.itemData).toEqual(expect.objectContaining({ compendiumId: "longsword", quantity: 2, purchasedForGp: 30 }));
    const purchasedShortbow = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("shortbow")!, 1);
    expect(purchasedShortbow).toEqual(expect.objectContaining({ entryId: "shortbow", quantity: 1, unitCostGp: 25, totalCostGp: 25, currency: { gp: 25, sp: 0, cp: 0 } }));
    expect(purchasedShortbow.itemData).toEqual(expect.objectContaining({ compendiumId: "shortbow", quantity: 1, purchasedForGp: 25, damage: "1d6" }));
    const purchasedLeather = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("leather-armor")!, 1);
    expect(purchasedLeather).toEqual(expect.objectContaining({ entryId: "leather-armor", quantity: 1, unitCostGp: 10, totalCostGp: 10, currency: { gp: 40, sp: 0, cp: 0 } }));
    expect(purchasedLeather.itemData).toEqual(expect.objectContaining({ compendiumId: "leather-armor", quantity: 1, purchasedForGp: 10, armorBase: 11 }));
    const purchasedScaleMail = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("scale-mail")!, 1);
    expect(purchasedScaleMail).toEqual(expect.objectContaining({ entryId: "scale-mail", quantity: 1, unitCostGp: 50, totalCostGp: 50, currency: { gp: 0, sp: 0, cp: 0 } }));
    expect(purchasedScaleMail.itemData).toEqual(expect.objectContaining({ compendiumId: "scale-mail", quantity: 1, purchasedForGp: 50, armorBase: 14, dexCap: 2, stealthDisadvantage: true }));
    const purchasedHandaxes = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("handaxe")!, 2);
    expect(purchasedHandaxes).toEqual(expect.objectContaining({ entryId: "handaxe", quantity: 2, unitCostGp: 5, totalCostGp: 10, currency: { gp: 40, sp: 0, cp: 0 } }));
    expect(purchasedHandaxes.itemData).toEqual(expect.objectContaining({ compendiumId: "handaxe", quantity: 2, purchasedForGp: 10, damage: "1d6", mastery: "vex" }));
    const purchasedHealersKit = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("healers-kit")!, 1);
    expect(purchasedHealersKit).toEqual(expect.objectContaining({ entryId: "healers-kit", quantity: 1, unitCostGp: 5, totalCostGp: 5, currency: { gp: 45, sp: 0, cp: 0 } }));
    expect(purchasedHealersKit.itemData).toEqual(expect.objectContaining({ compendiumId: "healers-kit", quantity: 1, purchasedForGp: 5, uses: 10, stabilizesAtZeroHp: true }));
    const purchasedArrows = dnd5eSrdEquipmentPurchase(srdActor, dnd5eSrdCompendiumEntry("arrows")!, 2);
    expect(purchasedArrows).toEqual(expect.objectContaining({ entryId: "arrows", quantity: 2, unitCostGp: 1, totalCostGp: 2, currency: { gp: 48, sp: 0, cp: 0 } }));
    expect(purchasedArrows.itemData).toEqual(expect.objectContaining({ compendiumId: "arrows", quantity: 2, purchasedForGp: 2, ammunition: "arrow", amountPerPurchase: 20, storage: "quiver" }));
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
    expect(levelFiveWarlockData.features).toEqual(expect.arrayContaining(["Eldritch Invocations", "Pact Magic", "Magical Cunning", "Warlock Subclass", "Fiend Patron", "Dark One's Blessing", "Fiend Spells", "Ability Score Improvement"]));
    expect(levelFiveWarlockData.resources).toEqual({ magicalCunning: { current: 1, max: 1, recovery: "long" } });
    expect(levelFiveWarlockData.spellSlots).toEqual({ level3: { current: 2, max: 2, recovery: "short" } });
    expect(dnd5eSrdQuickRolls(levelFiveWarlockActor, [hex])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-eldritch-invocations", formula: "0", metadata: expect.objectContaining({ known: 5 }) }),
        expect.objectContaining({ id: "feature-magical-cunning", formula: "0", metadata: expect.objectContaining({ maxRecoveredSlots: 1, pactMagic: { slotLevel: 3, maxSlots: 2, recovery: "short" } }) }),
        expect.objectContaining({ id: "feature-fiend-dark-ones-blessing", formula: "10", metadata: expect.objectContaining({ temporaryHitPoints: 10, patronSpells: expect.arrayContaining([expect.objectContaining({ warlockLevel: 3, spells: ["burning-hands", "command", "scorching-ray", "suggestion"] })]) }) })
      ])
    );

    let levelFourteenWarlockData = levelFiveWarlockData;
    for (let level = 6; level <= 14; level += 1) {
      levelFourteenWarlockData = applyDnd5eSrdAdvancement({ ...warlockActor, data: levelFourteenWarlockData }, "level-up");
    }
    const levelFourteenWarlockActor: Actor = { ...warlockActor, data: levelFourteenWarlockData };
    expect(levelFourteenWarlockData.features).toEqual(expect.arrayContaining(["Dark One's Own Luck", "Fiendish Resilience", "Hurl Through Hell"]));
    expect(levelFourteenWarlockData.resources).toEqual(expect.objectContaining({
      fiendLuck: { current: 5, max: 9, recovery: "long" },
      hurlThroughHell: { current: 1, max: 1, recovery: "long" }
    }));
    expect(dnd5eSrdQuickRolls(levelFourteenWarlockActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-fiend-dark-ones-own-luck", formula: "1d10", metadata: expect.objectContaining({ resource: "fiendLuck", maxUses: 9 }) }),
        expect.objectContaining({ id: "feature-fiendish-resilience", formula: "0", metadata: expect.objectContaining({ excludedDamageTypes: ["Force"] }) }),
        expect.objectContaining({ id: "feature-fiend-hurl-through-hell-damage", formula: "8d10", metadata: expect.objectContaining({ resource: "hurlThroughHell", damageType: "Psychic", save: { ability: "charisma", dc: 22 } }) })
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

    const darkLuck = useDnd5eSrdAction(levelFourteenWarlockActor, [], "feature-fiend-dark-ones-own-luck");
    expect(darkLuck).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "fiendLuck", label: "Dark One's Own Luck", amount: 1, remaining: 4 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ fiendLuck: { current: 4, max: 9, recovery: "long" } }) })
      })
    );
    const hurlThroughHell = useDnd5eSrdAction(levelFourteenWarlockActor, [], "feature-fiend-hurl-through-hell-damage");
    expect(hurlThroughHell).toEqual(
      expect.objectContaining({
        consumed: [{ type: "resource", key: "hurlThroughHell", label: "Hurl Through Hell", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ hurlThroughHell: { current: 0, max: 1, recovery: "long" } }) })
      })
    );
    const hurlRestoration = useDnd5eSrdAction(
      { ...levelFourteenWarlockActor, data: { ...levelFourteenWarlockData, resources: { ...(levelFourteenWarlockData.resources as Record<string, unknown>), hurlThroughHell: { current: 0, max: 1, recovery: "long" } }, spellSlots: { level5: { current: 1, max: 3, recovery: "short" } } } },
      [],
      "feature-fiend-hurl-through-hell-damage",
      { spellSlotLevel: 5 }
    );
    expect(hurlRestoration).toEqual(
      expect.objectContaining({
        consumed: [{ type: "spellSlot", key: "level5", label: "Level 5 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          resources: expect.objectContaining({ hurlThroughHell: { current: 1, max: 1, recovery: "long" } }),
          spellSlots: { level5: { current: 0, max: 3, recovery: "short" } }
        })
      })
    );

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
    const materializeItems = (actorForItems: Actor, templateItems: ReturnType<typeof dnd5eSrdApplyCharacterOrigins>["items"]): Item[] =>
      templateItems.flatMap((templateItem) => {
        const entry = dnd5eSrdCompendiumEntry(templateItem.entryId);
        if (!entry || entry.type === "condition") return [];
        return [
          {
            id: `itm_${templateItem.entryId.replace(/-/g, "_")}`,
            campaignId: "camp_demo",
            systemId: "dnd-5e-srd",
            actorId: actorForItems.id,
            type: entry.type,
            name: entry.name,
            data: { ...entry.data, ...(templateItem.data ?? {}), compendiumId: entry.id },
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z"
          }
        ];
      });

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
        { id: "tool-thieves-tools", label: "Thieves' Tools Check", formula: "1d20+5" },
        expect.objectContaining({ id: "species-orc-adrenaline-rush", label: "Adrenaline Rush", formula: "2", metadata: expect.objectContaining({ temporaryHitPoints: 2, recovery: "short" }) }),
        expect.objectContaining({ id: "species-orc-relentless-endurance", label: "Relentless Endurance", formula: "0", metadata: expect.objectContaining({ result: "drop to 1 HP instead", recovery: "long" }) })
      ])
    );
    const adrenalineRush = useDnd5eSrdAction(actor, [], "species-orc-adrenaline-rush");
    expect(adrenalineRush.consumed).toEqual([{ type: "resource", key: "adrenalineRush", label: "Adrenaline Rush", amount: 1, remaining: 1 }]);
    expect(applyDnd5eSrdRest({ ...actor, data: adrenalineRush.data }, "short").data.resources).toEqual(expect.objectContaining({ adrenalineRush: { current: 2, max: 2, recovery: "short" } }));

    const dwarf = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "dwarf" });
    expect(dwarf.data.hp).toEqual({ current: 13, max: 13 });
    expect(dwarf.data.resources).toEqual(expect.objectContaining({ stonecunning: { current: 2, max: 2, recovery: "long" } }));
    const dwarfActor: Actor = { ...srdActor, data: dwarf.data };
    expect(dnd5eSrdQuickRolls(dwarfActor, [])).toEqual(expect.arrayContaining([expect.objectContaining({ id: "species-dwarf-stonecunning", metadata: expect.objectContaining({ sense: "Tremorsense", rangeFt: 60 }) })]));
    const advancedDwarf = applyDnd5eSrdAdvancement(dwarfActor, "level-up");
    expect(advancedDwarf.hp).toEqual({ current: 19, max: 19 });

    const dragonborn = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "dragonborn" });
    const levelFiveDragonbornActor: Actor = { ...srdActor, data: Array.from({ length: 4 }).reduce((data) => applyDnd5eSrdAdvancement({ ...srdActor, data: data as Record<string, unknown> }, "level-up"), dragonborn.data) as Record<string, unknown> };
    expect(levelFiveDragonbornActor.data.resources).toEqual(expect.objectContaining({ breathWeapon: { current: 2, max: 3, recovery: "long" }, draconicFlight: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelFiveDragonbornActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-dragonborn-breath-weapon", formula: "2d10", metadata: expect.objectContaining({ save: expect.objectContaining({ ability: "dexterity", dc: 13 }) }) }),
        expect.objectContaining({ id: "species-draconic-flight", metadata: expect.objectContaining({ flySpeed: 30, recovery: "long" }) })
      ])
    );
    expect(useDnd5eSrdAction(levelFiveDragonbornActor, [], "species-dragonborn-breath-weapon").consumed).toEqual([{ type: "resource", key: "breathWeapon", label: "Breath Weapon", amount: 1, remaining: 1 }]);

    const goliath = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("barbarian")!, { speciesId: "goliath" });
    const levelFiveGoliathActor: Actor = { ...srdActor, data: Array.from({ length: 4 }).reduce((data) => applyDnd5eSrdAdvancement({ ...srdActor, data: data as Record<string, unknown> }, "level-up"), goliath.data) as Record<string, unknown> };
    expect(levelFiveGoliathActor.data.resources).toEqual(expect.objectContaining({ giantAncestry: { current: 2, max: 3, recovery: "long" }, largeForm: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelFiveGoliathActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-goliath-giant-ancestry", metadata: expect.objectContaining({ options: expect.arrayContaining([expect.objectContaining({ name: "Stone's Endurance", reductionFormula: "1d12+2" })]) }) }),
        expect.objectContaining({ id: "species-goliath-large-form", metadata: expect.objectContaining({ size: "Large", speedWhileActive: 45 }) })
      ])
    );

    const human = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "human", skillProficiency: "perception", originFeat: "Skilled" });
    expect(human.data.origin).toEqual(expect.objectContaining({ speciesId: "human", humanSkillProficiency: "perception", humanOriginFeat: "Skilled", resourceful: true }));
    expect(human.data.skillProficiencies).toEqual(["athletics", "intimidation", "perception"]);
    expect(human.data.feats).toEqual(["Savage Attacker", "Skilled"]);
    const humanActor: Actor = { ...srdActor, data: { ...human.data, heroicInspiration: false } };
    expect(dnd5eSrdQuickRolls(humanActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-human-resourceful", formula: "0", metadata: expect.objectContaining({ grants: "Heroic Inspiration" }) }),
        expect.objectContaining({ id: "species-human-skillful", formula: "0", metadata: expect.objectContaining({ skillProficiency: "perception", selected: true }) }),
        expect.objectContaining({ id: "species-human-versatile", formula: "0", metadata: expect.objectContaining({ originFeat: "Skilled" }) }),
        expect.objectContaining({ id: "skill-perception", formula: "1d20+2" })
      ])
    );
    expect(dnd5eSrdActionFormula(humanActor, [], "species-human-resourceful")).toBe("0");
    expect(useDnd5eSrdAction(humanActor, [], "species-human-resourceful").consumed).toEqual([]);
    const humanRest = applyDnd5eSrdRest(humanActor, "long");
    expect(humanRest.data.heroicInspiration).toBe(true);
    expect(humanRest.recovered).toEqual(expect.objectContaining({ heroicInspiration: true }));
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "orc", skillProficiency: "perception" })).toThrow("Skillful");

    const drowElf = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, { speciesId: "elf", elfLineage: "drow", speciesSpellcastingAbility: "intelligence" });
    expect(drowElf.data.origin).toEqual(
      expect.objectContaining({
        speciesId: "elf",
        elfLineage: "drow",
        speciesSpellcastingAbility: "intelligence",
        elfCantrip: "dancing-lights",
        elfLevel3Spell: "faerie-fire",
        elfLevel5Spell: "darkness"
      })
    );
    expect(drowElf.data.senses).toEqual(["Darkvision 120 ft."]);
    expect(drowElf.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "dancing-lights", data: expect.objectContaining({ trait: "Elven Lineage", speciesSpell: true }) }),
        expect.objectContaining({ entryId: "faerie-fire", data: expect.objectContaining({ minimumCharacterLevel: 3, speciesSpellResource: "elfLineageLevel3" }) }),
        expect.objectContaining({ entryId: "darkness", data: expect.objectContaining({ minimumCharacterLevel: 5, speciesSpellResource: "elfLineageLevel5" }) })
      ])
    );
    const drowElfActor: Actor = { ...srdActor, data: drowElf.data };
    const drowElfItems = materializeItems(drowElfActor, drowElf.items);
    expect(dnd5eSrdCompendiumEntry("faerie-fire")).toEqual(expect.objectContaining({ name: "Faerie Fire", data: expect.objectContaining({ save: expect.objectContaining({ ability: "dexterity" }) }) }));
    expect(dnd5eSrdQuickRolls(drowElfActor, drowElfItems)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-elf-elven-lineage", formula: "0", metadata: expect.objectContaining({ lineage: "drow", cantrip: "dancing-lights" }) }),
        expect.objectContaining({ id: "species-elf-fey-ancestry", formula: "0", metadata: expect.objectContaining({ savingThrows: ["avoid or end Charmed"] }) }),
        expect.objectContaining({ id: "species-elf-trance", formula: "0", metadata: expect.objectContaining({ longRestHours: 4 }) }),
        expect.objectContaining({ id: "spell-itm_dancing_lights-effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdQuickRolls(drowElfActor, drowElfItems).map((roll) => roll.id)).not.toContain("spell-itm_faerie_fire-effect");
    const levelThreeElfActor: Actor = {
      ...drowElfActor,
      data: Array.from({ length: 2 }).reduce((data) => applyDnd5eSrdAdvancement({ ...drowElfActor, data: data as Record<string, unknown> }, "level-up"), drowElf.data) as Record<string, unknown>
    };
    expect(levelThreeElfActor.data.resources).toEqual(expect.objectContaining({ elfLineageLevel3: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelThreeElfActor, drowElfItems)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spell-itm_faerie_fire-effect", formula: "0" })]));
    const faerieFireCast = useDnd5eSrdAction(levelThreeElfActor, drowElfItems, "spell-itm_faerie_fire-effect", { useFreeResource: true });
    expect(faerieFireCast.consumed).toEqual([{ type: "resource", key: "elfLineageLevel3", label: "Elf Level 3 Lineage Spell", amount: 1, remaining: 0 }]);
    expect(applyDnd5eSrdRest({ ...levelThreeElfActor, data: faerieFireCast.data }, "long").data.resources).toEqual(expect.objectContaining({ elfLineageLevel3: { current: 1, max: 1, recovery: "long" } }));
    const highElf = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, { speciesId: "elf", elfLineage: "high", elfCantrip: "fire-bolt", speciesSpellcastingAbility: "charisma" });
    expect(highElf.data.origin).toEqual(expect.objectContaining({ elfLineage: "high-elf", elfCantrip: "fire-bolt", elfLevel3Spell: "detect-magic", elfLevel5Spell: "misty-step", speciesSpellcastingAbility: "charisma" }));
    const woodElf = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("ranger")!, { speciesId: "elf", elfLineage: "wood", speciesSpellcastingAbility: "wisdom" });
    expect(woodElf.data.speed).toBe(35);
    expect(woodElf.data.origin).toEqual(expect.objectContaining({ elfLineage: "wood-elf", elfCantrip: "druidcraft", elfLevel5Spell: "pass-without-trace" }));

    const forestGnome = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, { speciesId: "gnome", gnomeLineage: "forest", speciesSpellcastingAbility: "wisdom" });
    expect(forestGnome.data.origin).toEqual(
      expect.objectContaining({
        speciesId: "gnome",
        gnomeLineage: "forest-gnome",
        speciesSpellcastingAbility: "wisdom",
        gnomeCantrips: ["minor-illusion"],
        gnomeSpell: "speak-with-animals"
      })
    );
    expect(forestGnome.data.resources).toEqual(expect.objectContaining({ gnomeSpeakWithAnimals: { current: 2, max: 2, recovery: "long" } }));
    const forestGnomeActor: Actor = { ...srdActor, data: forestGnome.data };
    const forestGnomeItems = materializeItems(forestGnomeActor, forestGnome.items);
    expect(dnd5eSrdQuickRolls(forestGnomeActor, forestGnomeItems)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-gnome-gnomish-cunning", formula: "0", metadata: expect.objectContaining({ savingThrows: ["intelligence", "wisdom", "charisma"] }) }),
        expect.objectContaining({ id: "species-gnome-lineage", formula: "0", metadata: expect.objectContaining({ lineage: "forest-gnome", freeCastResource: "gnomeSpeakWithAnimals" }) }),
        expect.objectContaining({ id: "spell-itm_minor_illusion-effect", formula: "0" }),
        expect.objectContaining({ id: "spell-itm_speak_with_animals-effect", formula: "0" }),
        expect.objectContaining({ id: "save-wisdom", metadata: expect.objectContaining({ feature: "Gnomish Cunning" }) })
      ])
    );
    const speakWithAnimals = useDnd5eSrdAction(forestGnomeActor, forestGnomeItems, "spell-itm_speak_with_animals-effect", { useFreeResource: true });
    expect(speakWithAnimals.consumed).toEqual([{ type: "resource", key: "gnomeSpeakWithAnimals", label: "Gnome Speak with Animals", amount: 1, remaining: 1 }]);
    const rockGnome = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, { speciesId: "gnome", gnomeLineage: "rock" });
    expect(rockGnome.data.origin).toEqual(expect.objectContaining({ gnomeLineage: "rock-gnome", gnomeCantrips: ["mending", "prestidigitation"], gnomeClockworkDevice: true }));
    expect(rockGnome.data.resources).not.toHaveProperty("gnomeSpeakWithAnimals");

    const halfling = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("rogue")!, { speciesId: "halfling" });
    const halflingActor: Actor = { ...srdActor, data: halfling.data };
    expect(dnd5eSrdQuickRolls(halflingActor, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-halfling-luck", formula: "0", metadata: expect.objectContaining({ trigger: "roll a 1 on a D20 Test" }) }),
        expect.objectContaining({ id: "species-halfling-brave", formula: "0", metadata: expect.objectContaining({ savingThrows: ["avoid or end Frightened"] }) }),
        expect.objectContaining({ id: "species-halfling-nimbleness", formula: "0", metadata: expect.objectContaining({ movement: "move through the space of any creature larger than you" }) }),
        expect.objectContaining({ id: "species-halfling-naturally-stealthy", formula: "0", metadata: expect.objectContaining({ action: "Hide" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(halflingActor, [], "species-halfling-luck")).toBe("0");
    expect(useDnd5eSrdAction(halflingActor, [], "species-halfling-luck").consumed).toEqual([]);
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "human", elfLineage: "drow" })).toThrow("Elven Lineage");
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "elf", elfLineage: "drow", elfCantrip: "fire-bolt" })).toThrow("High Elf");
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "gnome", gnomeLineage: "deep" })).toThrow("Gnomish Lineage");

    const tiefling = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "tiefling", tieflingLegacy: "abyssal", speciesSpellcastingAbility: "charisma" });
    expect(tiefling.data.origin).toEqual(
      expect.objectContaining({
        speciesId: "tiefling",
        tieflingLegacy: "abyssal",
        speciesSpellcastingAbility: "charisma",
        tieflingResistance: "poison",
        tieflingCantrip: "poison-spray",
        tieflingLevel3Spell: "ray-of-sickness",
        tieflingLevel5Spell: "hold-person"
      })
    );
    expect(tiefling.data.resistances).toEqual(["poison"]);
    expect(tiefling.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: "thaumaturgy", data: expect.objectContaining({ speciesSpell: true, spellcastingAbility: "charisma" }) }),
        expect.objectContaining({ entryId: "poison-spray", data: expect.objectContaining({ trait: "Fiendish Legacy" }) }),
        expect.objectContaining({ entryId: "ray-of-sickness", data: expect.objectContaining({ minimumCharacterLevel: 3, speciesSpellResource: "tieflingLegacyLevel3" }) }),
        expect.objectContaining({ entryId: "hold-person", data: expect.objectContaining({ minimumCharacterLevel: 5, speciesSpellResource: "tieflingLegacyLevel5" }) })
      ])
    );
    const tieflingActor: Actor = { ...srdActor, data: tiefling.data };
    const tieflingItems = materializeItems(tieflingActor, tiefling.items);
    expect(dnd5eSrdCompendiumEntry("poison-spray")).toEqual(expect.objectContaining({ name: "Poison Spray", data: expect.objectContaining({ damageFormula: "1d12", cantripScaling: expect.objectContaining({ level5: "2d12" }) }) }));
    expect(dnd5eSrdCompendiumEntry("chill-touch")).toEqual(expect.objectContaining({ name: "Chill Touch", data: expect.objectContaining({ range: "touch", damageType: "necrotic" }) }));
    expect(dnd5eSrdCompendiumEntry("thaumaturgy")).toEqual(expect.objectContaining({ name: "Thaumaturgy", data: expect.objectContaining({ effects: expect.arrayContaining(["Booming Voice"]) }) }));
    expect(dnd5eSrdQuickRolls(tieflingActor, tieflingItems)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "species-tiefling-fiendish-legacy", formula: "0", metadata: expect.objectContaining({ legacy: "abyssal", damageResistance: "poison" }) }),
        expect.objectContaining({ id: "species-tiefling-otherworldly-presence", formula: "0", metadata: expect.objectContaining({ cantrip: "thaumaturgy", spellcastingAbility: "charisma" }) }),
        expect.objectContaining({ id: "spell-itm_poison_spray-attack", formula: "1d20+3", metadata: expect.objectContaining({ speciesSpell: true, ability: "charisma" }) }),
        expect.objectContaining({ id: "spell-itm_poison_spray-damage", formula: "1d12" }),
        expect.objectContaining({ id: "spell-itm_thaumaturgy-effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdQuickRolls(tieflingActor, tieflingItems).map((roll) => roll.id)).not.toContain("spell-itm_ray_of_sickness-damage");
    const levelThreeTieflingActor: Actor = {
      ...tieflingActor,
      data: Array.from({ length: 2 }).reduce((data) => applyDnd5eSrdAdvancement({ ...tieflingActor, data: data as Record<string, unknown> }, "level-up"), tiefling.data) as Record<string, unknown>
    };
    expect(levelThreeTieflingActor.data.resources).toEqual(expect.objectContaining({ tieflingLegacyLevel3: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelThreeTieflingActor, tieflingItems)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "spell-itm_ray_of_sickness-damage", formula: "2d8" })]));
    const tieflingFreeCast = useDnd5eSrdAction(levelThreeTieflingActor, tieflingItems, "spell-itm_ray_of_sickness-damage", { useFreeResource: true });
    expect(tieflingFreeCast.consumed).toEqual([{ type: "resource", key: "tieflingLegacyLevel3", label: "Tiefling Level 3 Legacy Spell", amount: 1, remaining: 0 }]);
    expect(applyDnd5eSrdRest({ ...levelThreeTieflingActor, data: tieflingFreeCast.data }, "long").data.resources).toEqual(expect.objectContaining({ tieflingLegacyLevel3: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdActionFormula(tieflingActor, [], "species-tiefling-fiendish-legacy")).toBe("0");
    expect(useDnd5eSrdAction(tieflingActor, [], "species-tiefling-otherworldly-presence").consumed).toEqual([]);
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "human", tieflingLegacy: "abyssal" })).toThrow("Fiendish Legacy");
    expect(() => dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, { speciesId: "tiefling", speciesSpellcastingAbility: "strength" })).toThrow("spellcasting ability");

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
    expect(dnd5eSrdEncounterThreats().map((threat) => threat.id)).toEqual(
      expect.arrayContaining([
        "aboleth",
        "animated-armor",
        "flying-sword",
        "rug-of-smothering",
        "allosaurus",
        "ankylosaurus",
        "ape",
        "archelon",
        "ankheg",
        "assassin",
        "awakened-shrub",
        "awakened-tree",
        "axe-beak",
        "azer-sentinel",
        "behir",
        "baboon",
        "badger",
        "berserker",
        "bat",
        "blood-hawk",
        "black-pudding",
        "blink-dog",
        "boar",
        "bugbear-stalker",
        "bugbear-warrior",
        "bulette",
        "camel",
        "cat",
        "centaur-trooper",
        "chimera",
        "chuul",
        "clay-golem",
        "cloaker",
        "cloud-giant",
        "commoner",
        "swarm-of-crawling-claws",
        "cultist",
        "cultist-fanatic",
        "constrictor-snake",
        "crab",
        "crocodile",
        "darkmantle",
        "death-dog",
        "djinni",
        "doppelganger",
        "dragon-turtle",
        "drider",
        "druid",
        "dryad",
        "efreeti",
        "ettercap",
        "ettin",
        "flesh-golem",
        "frost-giant",
        "fire-giant",
        "shrieker-fungus",
        "violet-fungus",
        "gargoyle",
        "deer",
        "draft-horse",
        "eagle",
        "elephant",
        "elk",
        "flying-snake",
        "frog",
        "giant-badger",
        "giant-bat",
        "giant-boar",
        "giant-centipede",
        "giant-constrictor-snake",
        "giant-crab",
        "giant-crocodile",
        "giant-elk",
        "giant-fire-beetle",
        "giant-frog",
        "giant-goat",
        "giant-hyena",
        "giant-lizard",
        "giant-octopus",
        "giant-owl",
        "giant-scorpion",
        "giant-seahorse",
        "giant-shark",
        "giant-toad",
        "giant-venomous-snake",
        "giant-vulture",
        "giant-wasp",
        "giant-weasel",
        "ghost",
        "giant-wolf-spider",
        "goat",
        "hawk",
        "jackal",
        "killer-whale",
        "lion",
        "lizard",
        "gibbering-mouther",
        "glabrezu",
        "gladiator",
        "gnoll-warrior",
        "gold-dragon-wyrmling",
        "young-gold-dragon",
        "adult-gold-dragon",
        "ancient-gold-dragon",
        "gorgon",
        "gray-ooze",
        "green-hag",
        "grick",
        "griffon",
        "grimlock",
        "guardian-naga",
        "half-dragon",
        "harpy",
        "hell-hound",
        "hezrou",
        "hill-giant",
        "hippogriff",
        "hippopotamus",
        "hobgoblin-warrior",
        "homunculus",
        "hunter-shark",
        "hyena",
        "ice-mephit",
        "magma-mephit",
        "steam-mephit",
        "merfolk-skirmisher",
        "merrow",
        "mimic",
        "nalfeshnee",
        "night-hag",
        "nightmare",
        "noble",
        "ochre-jelly",
        "oni",
        "otyugh",
        "pegasus",
        "phase-spider",
        "pirate",
        "pirate-captain",
        "planetar",
        "plesiosaurus",
        "priest",
        "pseudodragon",
        "rat",
        "raven",
        "swarm-of-bats",
        "swarm-of-insects",
        "swarm-of-piranhas",
        "swarm-of-rats",
        "swarm-of-ravens",
        "swarm-of-venomous-snakes",
        "reef-shark",
        "rhinoceros",
        "riding-horse",
        "roc",
        "roper",
        "saber-toothed-tiger",
        "scorpion",
        "seahorse",
        "spider",
        "tiger",
        "triceratops",
        "tyrannosaurus-rex",
        "venomous-snake",
        "vulture",
        "warhorse",
        "weasel",
        "wight",
        "will-o-wisp",
        "winter-wolf",
        "worg",
        "ogre-zombie",
        "scout",
        "sea-hag",
        "bandit-captain",
        "guard",
        "guard-captain",
        "knight",
        "kobold-warrior",
        "kraken",
        "lamia",
        "mage",
        "mammoth",
        "mastiff",
        "mule",
        "octopus",
        "owl",
        "panther",
        "piranha",
        "polar-bear",
        "pony",
        "pteranodon",
        "spy",
        "warrior-veteran",
        "black-bear",
        "brown-bear",
        "giant-rat",
        "giant-spider",
        "gelatinous-cube",
        "giant-ape",
        "giant-eagle",
        "couatl",
        "deva",
        "skeleton",
        "zombie",
        "ghoul",
        "ghast",
        "specter",
        "sphinx-of-wonder",
        "sphinx-of-lore",
        "sphinx-of-valor",
        "wraith",
        "air-elemental",
        "earth-elemental",
        "fire-elemental",
        "water-elemental",
        "basilisk",
        "cockatrice",
        "manticore",
        "minotaur-of-baphomet",
        "rust-monster",
        "sahuagin-warrior",
        "salamander",
        "satyr",
        "shadow",
        "shambling-mound",
        "shield-guardian",
        "brass-dragon-wyrmling",
        "young-brass-dragon",
        "adult-brass-dragon",
        "ancient-brass-dragon",
        "bronze-dragon-wyrmling",
        "young-bronze-dragon",
        "adult-bronze-dragon",
        "ancient-bronze-dragon",
        "copper-dragon-wyrmling",
        "young-copper-dragon",
        "adult-copper-dragon",
        "ancient-copper-dragon",
        "silver-dragon-wyrmling",
        "young-silver-dragon",
        "adult-silver-dragon",
        "ancient-silver-dragon",
        "solar",
        "sprite",
        "stone-giant",
        "stone-golem",
        "storm-giant",
        "succubus",
        "balor",
        "dretch",
        "quasit",
        "vrock",
        "lemure",
        "imp",
        "incubus",
        "invisible-stalker",
        "iron-golem",
        "bearded-devil",
        "barbed-devil",
        "bone-devil",
        "chain-devil",
        "horned-devil",
        "ice-devil",
        "erinyes",
        "werebear",
        "wereboar",
        "wererat",
        "weretiger",
        "werewolf",
        "xorn",
        "wolf",
        "dire-wolf",
        "ogre",
        "owlbear",
        "mummy",
        "red-dragon-wyrmling",
        "troll",
        "remorhaz",
        "purple-worm",
        "mummy-lord",
        "lich",
        "vampire-spawn",
        "vampire",
        "medusa",
        "hydra",
        "wyvern",
        "blue-dragon-wyrmling",
        "young-blue-dragon",
        "adult-blue-dragon",
        "ancient-blue-dragon",
        "green-dragon-wyrmling",
        "young-green-dragon",
        "adult-green-dragon",
        "ancient-green-dragon",
        "black-dragon-wyrmling",
        "young-black-dragon",
        "adult-black-dragon",
        "ancient-black-dragon",
        "white-dragon-wyrmling",
        "young-white-dragon",
        "adult-white-dragon",
        "ancient-white-dragon",
        "young-red-dragon",
        "adult-red-dragon",
        "ancient-red-dragon"
      ])
    );
    expect(dnd5eSrdEncounterThreats()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "aboleth", budget: 5900, challengeRating: "10", data: expect.objectContaining({ armorClass: 17, hitPoints: 150, traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Mucus Cloud" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Tentacle", damageFormula: "2d6+5", condition: "Grappled" }), expect.objectContaining({ name: "Dominate Mind", save: { ability: "wisdom", dc: 16 }, condition: "Charmed" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "animated-armor", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 18, hitPoints: 33, traits: expect.arrayContaining([expect.objectContaining({ name: "Antimagic Susceptibility" }), expect.objectContaining({ name: "False Appearance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 4, damageFormula: "1d6+2" })]) }) }),
        expect.objectContaining({ id: "flying-sword", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 17, hitPoints: 14, speed: "5 ft., Fly 50 ft. (hover)", actions: expect.arrayContaining([expect.objectContaining({ name: "Slash", attackBonus: 4, damageFormula: "1d8+2" })]) }) }),
        expect.objectContaining({ id: "rug-of-smothering", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 27, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Transfer" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Smother", attackBonus: 5, damageFormula: "2d6+3", condition: "Blinded/Restrained" })]) }) }),
        expect.objectContaining({ id: "allosaurus", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 51, skills: expect.objectContaining({ perception: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "2d10+4" }), expect.objectContaining({ name: "Claws", attackBonus: 6, damageFormula: "1d8+4", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "ankylosaurus", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 15, hitPoints: 68, actions: expect.arrayContaining([expect.objectContaining({ name: "Multiattack" }), expect.objectContaining({ name: "Tail", attackBonus: 6, damageFormula: "1d10+4", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "ape", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 12, hitPoints: 19, speed: "30 ft., Climb 30 ft.", skills: expect.objectContaining({ athletics: 5, perception: 3 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Fist", attackBonus: 5, damageFormula: "1d4+3" }), expect.objectContaining({ name: "Rock", attackBonus: 5, damageFormula: "2d6+3", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "archelon", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 17, hitPoints: 90, speed: "20 ft., Swim 80 ft.", skills: expect.objectContaining({ stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "3d6+4" })]) }) }),
        expect.objectContaining({ id: "ankheg", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 14, hitPoints: 45, speed: "30 ft., Burrow 10 ft.", actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "2d6+3+1d6", condition: "Grappled" }), expect.objectContaining({ name: "Acid Spray", damageFormula: "4d6", save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "6" })]) }) }),
        expect.objectContaining({ id: "assassin", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 16, hitPoints: 97, skills: expect.objectContaining({ acrobatics: 7, perception: 6, stealth: 10 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Resistance" }), expect.objectContaining({ name: "Evasion" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Shortsword", attackBonus: 7, damageFormula: "1d6+4+5d6" }), expect.objectContaining({ name: "Light Crossbow", attackBonus: 7, damageFormula: "1d8+4+6d6" }), expect.objectContaining({ name: "Cunning Action", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "awakened-shrub", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 9, hitPoints: 10, traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Vulnerability" }), expect.objectContaining({ name: "Piercing Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rake", attackBonus: 1, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "awakened-tree", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 59, traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Vulnerability" }), expect.objectContaining({ name: "Bludgeoning and Piercing Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 6, damageFormula: "3d6+4" })]) }) }),
        expect.objectContaining({ id: "axe-beak", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 11, hitPoints: 19, speed: "50 ft.", actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 4, damageFormula: "1d8+2" })]) }) }),
        expect.objectContaining({ id: "azer-sentinel", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 17, hitPoints: 39, traits: expect.arrayContaining([expect.objectContaining({ name: "Fire and Poison Immunity" }), expect.objectContaining({ name: "Fire Aura" }), expect.objectContaining({ name: "Illumination" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Burning Hammer", attackBonus: 5, damageFormula: "1d10+3+1d6" })]) }) }),
        expect.objectContaining({ id: "behir", budget: 7200, challengeRating: "11", data: expect.objectContaining({ armorClass: 17, hitPoints: 168, skills: expect.objectContaining({ perception: 6, stealth: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Lightning Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 10, damageFormula: "2d12+6+2d10" }), expect.objectContaining({ name: "Constrict", damageFormula: "5d8+6", save: { ability: "strength", dc: 18 }, condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Lightning Breath", damageFormula: "12d10", recharge: "5-6" }), expect.objectContaining({ name: "Swallow", kind: "bonusAction", damageFormula: "6d6" })]) }) }),
        expect.objectContaining({ id: "baboon", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 3, speed: "30 ft., Climb 30 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 1, damageFormula: "1d4-1" })]) }) }),
        expect.objectContaining({ id: "badger", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 5, speed: "20 ft., Burrow 5 ft.", skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 2, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "berserker", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 67, traits: expect.arrayContaining([expect.objectContaining({ name: "Bloodied Frenzy" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Greataxe", attackBonus: 5, damageFormula: "1d12+3" })]) }) }),
        expect.objectContaining({ id: "bat", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 1, speed: "5 ft., Fly 30 ft.", senses: expect.arrayContaining(["Blindsight 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "blood-hawk", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 12, hitPoints: 7, speed: "10 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "black-pudding", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 7, hitPoints: 68, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Immunities" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Amorphous" }), expect.objectContaining({ name: "Corrosive Form" }), expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Dissolving Pseudopod", attackBonus: 5, damageFormula: "4d6+3" }), expect.objectContaining({ name: "Split", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "blink-dog", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 22, skills: expect.objectContaining({ perception: 5, stealth: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d4+3" }), expect.objectContaining({ name: "Teleport", kind: "bonusAction", recharge: "4-6" })]) }) }),
        expect.objectContaining({ id: "boar", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 11, hitPoints: 13, speed: "40 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Bloodied Fury" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 3, damageFormula: "1d6+1", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "bugbear-stalker", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 15, hitPoints: 65, skills: expect.objectContaining({ stealth: 6, survival: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Abduct" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Javelin", attackBonus: 5, damageFormula: "3d6+3" }), expect.objectContaining({ name: "Morningstar", attackBonus: 5, damageFormula: "2d8+3" }), expect.objectContaining({ name: "Quick Grapple", kind: "bonusAction", save: { ability: "dexterity", dc: 13 }, condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "bugbear-warrior", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 14, hitPoints: 33, skills: expect.objectContaining({ stealth: 6, survival: 2 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Abduct" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Grab", attackBonus: 4, damageFormula: "2d6+2", condition: "Grappled" }), expect.objectContaining({ name: "Light Hammer", attackBonus: 4, damageFormula: "3d4+2" })]) }) }),
        expect.objectContaining({ id: "bulette", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 17, hitPoints: 94, speed: "40 ft., Burrow 40 ft.", skills: expect.objectContaining({ perception: 6 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 7, damageFormula: "2d12+4" }), expect.objectContaining({ name: "Deadly Leap", damageFormula: "3d12", save: { ability: "dexterity", dc: 15, success: "half" }, condition: "Prone" }), expect.objectContaining({ name: "Leap", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "camel", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 10, hitPoints: 17, speed: "50 ft.", senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "cat", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 2, speed: "40 ft., Climb 40 ft.", skills: expect.objectContaining({ perception: 3, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Jumper" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Scratch", attackBonus: 4, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "centaur-trooper", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 16, hitPoints: 45, skills: expect.objectContaining({ athletics: 6, perception: 3 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Pike", attackBonus: 6, damageFormula: "1d10+4" }), expect.objectContaining({ name: "Longbow", attackBonus: 4, damageFormula: "1d8+2" }), expect.objectContaining({ name: "Trampling Charge", kind: "bonusAction", damageFormula: "1d6+4", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "chimera", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 14, hitPoints: 114, skills: expect.objectContaining({ perception: 8 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 7, damageFormula: "1d12+4", condition: "Prone" }), expect.objectContaining({ name: "Bite", attackBonus: 7, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Claw", attackBonus: 7, damageFormula: "1d6+4" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "7d8", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "chuul", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 16, hitPoints: 76, skills: expect.objectContaining({ perception: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Immunity" }), expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Sense Magic" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Pincer", attackBonus: 6, damageFormula: "1d10+4", condition: "Grappled" }), expect.objectContaining({ name: "Paralyzing Tentacles", save: { ability: "constitution", dc: 13 }, condition: "Poisoned/Paralyzed" })]) }) }),
        expect.objectContaining({ id: "clay-golem", budget: 5000, challengeRating: "9", data: expect.objectContaining({ armorClass: 14, hitPoints: 123, traits: expect.arrayContaining([expect.objectContaining({ name: "Acid Absorption" }), expect.objectContaining({ name: "Berserk" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 9, damageFormula: "1d10+5+1d12" }), expect.objectContaining({ name: "Hasten", kind: "bonusAction", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "cloaker", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 14, hitPoints: 91, skills: expect.objectContaining({ stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Frightened Immunity" }), expect.objectContaining({ name: "Light Sensitivity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Attach", attackBonus: 6, damageFormula: "3d6+3", condition: "Blinded" }), expect.objectContaining({ name: "Tail", attackBonus: 6, damageFormula: "1d10+3" }), expect.objectContaining({ name: "Moan", kind: "bonusAction", condition: "Frightened" }), expect.objectContaining({ name: "Phantasms", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "cloud-giant", budget: 5000, challengeRating: "9", data: expect.objectContaining({ armorClass: 14, hitPoints: 200, skills: expect.objectContaining({ insight: 7, perception: 11 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Thunderous Mace", attackBonus: 12, damageFormula: "3d8+8+2d6" }), expect.objectContaining({ name: "Thundercloud", attackBonus: 12, damageFormula: "3d6+8", condition: "Incapacitated" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Misty Step", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "commoner", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 10, hitPoints: 4, traits: expect.arrayContaining([expect.objectContaining({ name: "Training" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Club", attackBonus: 2, damageFormula: "1d4" })]) }) }),
        expect.objectContaining({ id: "swarm-of-crawling-claws", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 12, hitPoints: 49, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Swarm of Grasping Hands", attackBonus: 4, damageFormula: "4d8+2", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "cultist", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 12, hitPoints: 9, skills: expect.objectContaining({ deception: 2, religion: 2 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Ritual Sickle", attackBonus: 3, damageFormula: "1d4+1+1" })]) }) }),
        expect.objectContaining({ id: "cultist-fanatic", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 44, skills: expect.objectContaining({ deception: 3, persuasion: 3, religion: 2 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Pact Blade", attackBonus: 4, damageFormula: "1d8+2+2d6" }), expect.objectContaining({ name: "Spellcasting", attackBonus: 4, save: { ability: "wisdom", dc: 12 } }), expect.objectContaining({ name: "Spiritual Weapon", kind: "bonusAction", recharge: "2/day" })]) }) }),
        expect.objectContaining({ id: "constrictor-snake", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 13, speed: "30 ft., Swim 30 ft.", skills: expect.objectContaining({ perception: 2, stealth: 4 }), senses: expect.arrayContaining(["Blindsight 10 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d8+2" }), expect.objectContaining({ name: "Constrict", damageFormula: "3d4", save: { ability: "strength", dc: 12 }, condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "crab", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 3, speed: "20 ft., Swim 20 ft.", skills: expect.objectContaining({ stealth: 2 }), senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 2, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "crocodile", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 12, hitPoints: 13, speed: "20 ft., Swim 30 ft.", skills: expect.objectContaining({ stealth: 2 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d8+2", condition: "Grappled/Restrained" })]) }) }),
        expect.objectContaining({ id: "darkmantle", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 22, speed: "10 ft., Fly 30 ft.", skills: expect.objectContaining({ stealth: 3 }), senses: expect.arrayContaining(["Blindsight 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Crush", attackBonus: 5, damageFormula: "1d6+3", condition: "Blinded/Suffocating" }), expect.objectContaining({ name: "Darkness Aura", recharge: "1/day" })]) }) }),
        expect.objectContaining({ id: "death-dog", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 12, hitPoints: 39, speed: "40 ft.", skills: expect.objectContaining({ perception: 5, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d4+2", condition: "Poisoned", save: { ability: "constitution", dc: 12 } })]) }) }),
        expect.objectContaining({ id: "djinni", budget: 7200, challengeRating: "11", data: expect.objectContaining({ armorClass: 17, hitPoints: 218, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Immunities" }), expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Wishes" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Storm Blade", attackBonus: 9, damageFormula: "2d6+5+2d6" }), expect.objectContaining({ name: "Storm Bolt", attackBonus: 9, damageFormula: "3d8", condition: "Prone" }), expect.objectContaining({ name: "Create Whirlwind", damageFormula: "6d6", save: { ability: "strength", dc: 17 }, condition: "Restrained" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "charisma", dc: 17 } })]) }) }),
        expect.objectContaining({ id: "doppelganger", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 14, hitPoints: 52, skills: expect.objectContaining({ deception: 6, insight: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Charmed Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 6, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Read Thoughts" }), expect.objectContaining({ name: "Unsettling Visage", condition: "Frightened", recharge: "6" }), expect.objectContaining({ name: "Shape-Shift" })]) }) }),
        expect.objectContaining({ id: "dragon-turtle", budget: 18000, challengeRating: "17", data: expect.objectContaining({ armorClass: 20, hitPoints: 356, speed: "20 ft., Swim 50 ft.", senses: expect.arrayContaining(["Darkvision 120 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 13, damageFormula: "3d10+7+2d6" }), expect.objectContaining({ name: "Tail", attackBonus: 13, damageFormula: "2d10+7", condition: "Prone" }), expect.objectContaining({ name: "Steam Breath", damageFormula: "16d6", save: { ability: "constitution", dc: 19, success: "half" }, recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "drider", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 19, hitPoints: 123, speed: "30 ft., Climb 30 ft.", skills: expect.objectContaining({ perception: 6, stealth: 10 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Sunlight Sensitivity" }), expect.objectContaining({ name: "Web Walker" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Foreleg", attackBonus: 7, damageFormula: "2d8+4" }), expect.objectContaining({ name: "Poison Burst", attackBonus: 6, damageFormula: "3d6+3" }), expect.objectContaining({ name: "Magic of the Spider Queen", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "druid", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 44, skills: expect.objectContaining({ medicine: 5, nature: 3, perception: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Vine Staff", attackBonus: 5, damageFormula: "1d8+3+1d4" }), expect.objectContaining({ name: "Verdant Wisp", attackBonus: 5, damageFormula: "3d6" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "wisdom", dc: 13 } })]) }) }),
        expect.objectContaining({ id: "dryad", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 16, hitPoints: 22, skills: expect.objectContaining({ perception: 4, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Speak with Beasts and Plants" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Vine Lash", attackBonus: 6, damageFormula: "1d8+4" }), expect.objectContaining({ name: "Thorn Burst", attackBonus: 6, damageFormula: "1d6+4" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "charisma", dc: 14 } }), expect.objectContaining({ name: "Tree Stride" })]) }) }),
        expect.objectContaining({ id: "efreeti", budget: 7200, challengeRating: "11", data: expect.objectContaining({ armorClass: 17, hitPoints: 212, traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" }), expect.objectContaining({ name: "Elemental Restoration" }), expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Wishes" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Heated Blade", attackBonus: 10, damageFormula: "2d6+6+2d12" }), expect.objectContaining({ name: "Hurl Flame", attackBonus: 8, damageFormula: "7d6" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "charisma", dc: 16 } })]) }) }),
        expect.objectContaining({ id: "ettercap", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 44, speed: "30 ft., Climb 30 ft.", skills: expect.objectContaining({ perception: 3, stealth: 4, survival: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Web Walker" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d6+2+1d4", condition: "Poisoned" }), expect.objectContaining({ name: "Claw", attackBonus: 4, damageFormula: "2d4+2" }), expect.objectContaining({ name: "Web Strand", save: { ability: "dexterity", dc: 12 }, condition: "Restrained", recharge: "5-6" }), expect.objectContaining({ name: "Reel", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "ettin", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 12, hitPoints: 85, skills: expect.objectContaining({ perception: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Battleaxe", attackBonus: 7, damageFormula: "2d8+5", condition: "Prone" }), expect.objectContaining({ name: "Morningstar", attackBonus: 7, damageFormula: "2d8+5" })]) }) }),
        expect.objectContaining({ id: "flesh-golem", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 9, hitPoints: 127, traits: expect.arrayContaining([expect.objectContaining({ name: "Lightning and Poison Immunity" }), expect.objectContaining({ name: "Aversion to Fire" }), expect.objectContaining({ name: "Berserk" }), expect.objectContaining({ name: "Lightning Absorption" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 7, damageFormula: "2d8+4+1d8" })]) }) }),
        expect.objectContaining({ id: "frost-giant", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 15, hitPoints: 149, skills: expect.objectContaining({ athletics: 9, perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Cold Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Frost Axe", attackBonus: 9, damageFormula: "2d12+6+2d8" }), expect.objectContaining({ name: "Great Bow", attackBonus: 9, damageFormula: "2d10+6+2d6" }), expect.objectContaining({ name: "War Cry", kind: "bonusAction", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "fire-giant", budget: 5000, challengeRating: "9", data: expect.objectContaining({ armorClass: 18, hitPoints: 162, skills: expect.objectContaining({ athletics: 11, perception: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Flame Sword", attackBonus: 11, damageFormula: "4d6+7+3d6" }), expect.objectContaining({ name: "Hammer Throw", attackBonus: 11, damageFormula: "3d10+7+1d8" })]) }) }),
        expect.objectContaining({ id: "shrieker-fungus", budget: 0, challengeRating: "0", data: expect.objectContaining({ armorClass: 5, hitPoints: 13, senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Shriek", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "violet-fungus", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 5, hitPoints: 18, senses: expect.arrayContaining(["Blindsight 30 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rotting Touch", attackBonus: 2, damageFormula: "1d8" })]) }) }),
        expect.objectContaining({ id: "gargoyle", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 15, hitPoints: 67, skills: expect.objectContaining({ stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" }), expect.objectContaining({ name: "Poison Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 4, damageFormula: "2d4+2" })]) }) }),
        expect.objectContaining({ id: "deer", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 4, speed: "50 ft.", skills: expect.objectContaining({ perception: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Agile" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 2, damageFormula: "1d4" })]) }) }),
        expect.objectContaining({ id: "draft-horse", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 10, hitPoints: 15, speed: "40 ft.", actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 6, damageFormula: "1d4+4" })]) }) }),
        expect.objectContaining({ id: "eagle", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 4, speed: "10 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 6 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Talons", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "elephant", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 12, hitPoints: 76, speed: "40 ft.", actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 8, damageFormula: "2d8+6", condition: "Prone" }), expect.objectContaining({ name: "Trample", kind: "bonusAction", damageFormula: "2d10+6", save: { ability: "dexterity", dc: 16, success: "half" } })]) }) }),
        expect.objectContaining({ id: "elk", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 10, hitPoints: 11, speed: "50 ft.", skills: expect.objectContaining({ perception: 2 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 5, damageFormula: "1d6+3", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "flying-snake", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 14, hitPoints: 5, speed: "30 ft., Fly 60 ft., Swim 30 ft.", senses: expect.arrayContaining(["Blindsight 10 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1+2d4" })]) }) }),
        expect.objectContaining({ id: "frog", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 1, speed: "20 ft., Swim 20 ft.", skills: expect.objectContaining({ perception: 1, stealth: 3 }), senses: expect.arrayContaining(["Darkvision 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 3, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "giant-badger", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 15, speed: "30 ft., Burrow 10 ft.", skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 3, damageFormula: "2d4+1" })]) }) }),
        expect.objectContaining({ id: "giant-bat", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 22, speed: "10 ft., Fly 60 ft.", senses: expect.arrayContaining(["Blindsight 120 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d6+3" })]) }) }),
        expect.objectContaining({ id: "giant-boar", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 42, speed: "40 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Bloodied Fury" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 5, damageFormula: "2d6+3", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "giant-centipede", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 14, hitPoints: 9, speed: "30 ft., Climb 30 ft.", senses: expect.arrayContaining(["Blindsight 30 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d4+2", condition: "Poisoned" })]) }) }),
        expect.objectContaining({ id: "giant-constrictor-snake", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 60, speed: "30 ft., Swim 30 ft.", skills: expect.objectContaining({ perception: 2 }), senses: expect.arrayContaining(["Blindsight 10 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Constrict", damageFormula: "2d8+4", save: { ability: "strength", dc: 14 }, condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "giant-crab", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 15, hitPoints: 13, speed: "30 ft., Swim 30 ft.", skills: expect.objectContaining({ stealth: 3 }), senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 3, damageFormula: "1d6+1", condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "giant-crocodile", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 14, hitPoints: 85, speed: "30 ft., Swim 50 ft.", skills: expect.objectContaining({ stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 8, damageFormula: "3d10+5", condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Tail", attackBonus: 8, damageFormula: "3d8+5", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "giant-elk", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 14, hitPoints: 42, speed: "60 ft.", skills: expect.objectContaining({ perception: 4 }), senses: expect.arrayContaining(["Darkvision 90 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Radiant and Necrotic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 6, damageFormula: "2d6+4+2d4", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "giant-fire-beetle", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 4, speed: "30 ft., Climb 30 ft.", senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Illumination" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 1, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "giant-frog", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 11, hitPoints: 18, speed: "30 ft., Swim 30 ft.", skills: expect.objectContaining({ perception: 2, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 3, damageFormula: "1d6+2", condition: "Grappled" }), expect.objectContaining({ name: "Swallow", damageFormula: "2d4", condition: "Blinded/Restrained/Prone" })]) }) }),
        expect.objectContaining({ id: "giant-goat", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 19, speed: "40 ft., Climb 30 ft.", skills: expect.objectContaining({ perception: 3 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 5, damageFormula: "1d6+3+2d4", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "giant-hyena", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 12, hitPoints: 45, speed: "50 ft.", skills: expect.objectContaining({ perception: 3 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "2d6+3" }), expect.objectContaining({ name: "Rampage", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "giant-lizard", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 12, hitPoints: 19, speed: "40 ft., Climb 40 ft.", senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d8+2" })]) }) }),
        expect.objectContaining({ id: "giant-octopus", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 11, hitPoints: 45, speed: "10 ft., Swim 60 ft.", skills: expect.objectContaining({ perception: 4, stealth: 5 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Tentacles", attackBonus: 5, damageFormula: "2d6+3", condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Ink Cloud", kind: "reaction", recharge: "1/day" })]) }) }),
        expect.objectContaining({ id: "giant-owl", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 12, hitPoints: 19, creatureType: "Celestial", speed: "5 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 6, stealth: 6 }), senses: expect.arrayContaining(["Darkvision 120 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Talons", attackBonus: 4, damageFormula: "1d10+2" }), expect.objectContaining({ name: "Spellcasting" })]) }) }),
        expect.objectContaining({ id: "giant-scorpion", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 15, hitPoints: 52, senses: expect.arrayContaining(["Blindsight 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 5, damageFormula: "1d6+3", condition: "Grappled" }), expect.objectContaining({ name: "Sting", attackBonus: 5, damageFormula: "1d8+3+2d10", damageType: "piercing/poison" })]) }) }),
        expect.objectContaining({ id: "giant-seahorse", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 14, hitPoints: 16, speed: "5 ft., Swim 40 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 4, damageFormula: "2d6+2" }), expect.objectContaining({ name: "Bubble Dash", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "giant-shark", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 13, hitPoints: 92, speed: "5 ft., Swim 60 ft.", skills: expect.objectContaining({ perception: 3 }), senses: expect.arrayContaining(["Blindsight 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 9, damageFormula: "3d10+6" })]) }) }),
        expect.objectContaining({ id: "giant-toad", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 11, hitPoints: 39, speed: "30 ft., Swim 30 ft.", senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d6+2+2d4", condition: "Grappled" }), expect.objectContaining({ name: "Swallow", damageFormula: "3d6", condition: "Blinded/Restrained/Prone" })]) }) }),
        expect.objectContaining({ id: "giant-venomous-snake", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 14, hitPoints: 11, speed: "40 ft., Swim 40 ft.", skills: expect.objectContaining({ perception: 2 }), senses: expect.arrayContaining(["Blindsight 10 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "1d4+4+1d8" })]) }) }),
        expect.objectContaining({ id: "giant-vulture", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 10, hitPoints: 25, creatureType: "Monstrosity", speed: "10 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 3 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Necrotic Resistance" }), expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Gouge", attackBonus: 4, damageFormula: "2d6+2", condition: "Poisoned" })]) }) }),
        expect.objectContaining({ id: "giant-wasp", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 13, hitPoints: 22, speed: "10 ft., Fly 50 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Sting", attackBonus: 4, damageFormula: "1d6+2+2d4" })]) }) }),
        expect.objectContaining({ id: "giant-weasel", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 13, hitPoints: 9, speed: "40 ft., Climb 30 ft.", skills: expect.objectContaining({ acrobatics: 5, perception: 3, stealth: 5 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d4+3" })]) }) }),
        expect.objectContaining({ id: "giant-wolf-spider", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 11, speed: "40 ft., Climb 40 ft.", skills: expect.objectContaining({ perception: 3, stealth: 7 }), senses: expect.arrayContaining(["Blindsight 10 ft.", "Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d4+3+2d4" })]) }) }),
        expect.objectContaining({ id: "goat", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 10, hitPoints: 4, speed: "40 ft., Climb 30 ft.", skills: expect.objectContaining({ perception: 2 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ram", attackBonus: 2, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "hawk", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 1, speed: "10 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 6 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Talons", attackBonus: 5, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "jackal", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 3, speed: "40 ft.", skills: expect.objectContaining({ perception: 5, stealth: 4 }), senses: expect.arrayContaining(["Darkvision 90 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 1, damageFormula: "1d4-1" })]) }) }),
        expect.objectContaining({ id: "killer-whale", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 12, hitPoints: 90, speed: "5 ft., Swim 60 ft.", skills: expect.objectContaining({ perception: 3, stealth: 4 }), senses: expect.arrayContaining(["Blindsight 120 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "5d6+4" })]) }) }),
        expect.objectContaining({ id: "lion", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 12, hitPoints: 22, speed: "50 ft.", skills: expect.objectContaining({ perception: 3, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" }), expect.objectContaining({ name: "Running Leap" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 5, damageFormula: "1d8+3" }), expect.objectContaining({ name: "Roar", save: { ability: "wisdom", dc: 11 }, condition: "Frightened" })]) }) }),
        expect.objectContaining({ id: "lizard", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 10, hitPoints: 2, speed: "20 ft., Climb 20 ft.", senses: expect.arrayContaining(["Darkvision 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 2, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "ghost", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 11, hitPoints: 45, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Incorporeal Movement" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Withering Touch", attackBonus: 5, damageFormula: "3d10+3" }), expect.objectContaining({ name: "Horrific Visage", damageFormula: "2d6+3", save: { ability: "wisdom", dc: 13 }, condition: "Frightened" }), expect.objectContaining({ name: "Possession", save: { ability: "charisma", dc: 13 }, condition: "Incapacitated/Possessed" })]) }) }),
        expect.objectContaining({ id: "gibbering-mouther", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 9, hitPoints: 67, speed: "20 ft., Swim 20 ft.", senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Aberrant Ground" }), expect.objectContaining({ name: "Gibbering" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 2, damageFormula: "4d6" }), expect.objectContaining({ name: "Blinding Spittle", save: { ability: "dexterity", dc: 13 }, condition: "Blinded", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "glabrezu", budget: 5000, challengeRating: "9", data: expect.objectContaining({ armorClass: 17, hitPoints: 157, skills: expect.objectContaining({ perception: 7 }), senses: expect.arrayContaining(["Truesight 120 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Pincer", attackBonus: 9, damageFormula: "2d10+5", condition: "Grappled" }), expect.objectContaining({ name: "Fist", attackBonus: 9, damageFormula: "2d4+5" }), expect.objectContaining({ name: "Spellcasting" })]) }) }),
        expect.objectContaining({ id: "gladiator", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 16, hitPoints: 112, skills: expect.objectContaining({ athletics: 7, intimidation: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Spear", attackBonus: 7, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Shield Bash", damageFormula: "2d4+4", condition: "Prone" }), expect.objectContaining({ name: "Parry", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "gnoll-warrior", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 15, hitPoints: 22, senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Spear", attackBonus: 4, damageFormula: "1d8+2" }), expect.objectContaining({ name: "Longbow", attackBonus: 3, damageFormula: "1d8+1" })]) }) }),
        expect.objectContaining({ id: "brass-dragon-wyrmling", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 15, hitPoints: 22, speed: "30 ft., Burrow 15 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 4, stealth: 2 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 4, damageFormula: "1d10+2" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "4d6", save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Sleep Breath", condition: "Incapacitated/Unconscious" })]) }) }),
        expect.objectContaining({ id: "young-brass-dragon", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 17, hitPoints: 110, skills: expect.objectContaining({ perception: 6, persuasion: 5, stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 7, damageFormula: "2d10+4" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "11d6", save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Sleep Breath", condition: "Incapacitated/Unconscious" })]) }) }),
        expect.objectContaining({ id: "adult-brass-dragon", budget: 10000, challengeRating: "13", data: expect.objectContaining({ armorClass: 18, hitPoints: 172, skills: expect.objectContaining({ history: 7, perception: 11, persuasion: 8, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 11, damageFormula: "2d10+6+1d8" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "10d8", save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Sleep Breath", condition: "Incapacitated/Unconscious" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "ancient-brass-dragon", budget: 25000, challengeRating: "20", data: expect.objectContaining({ armorClass: 20, hitPoints: 332, skills: expect.objectContaining({ history: 9, perception: 14, persuasion: 12, stealth: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 14, damageFormula: "2d10+8+2d6" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "13d8", save: { ability: "dexterity", dc: 21, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Sleep Breath", condition: "Incapacitated/Unconscious" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "bronze-dragon-wyrmling", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 15, hitPoints: 39, speed: "30 ft., Fly 60 ft., Swim 30 ft.", traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Lightning Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 5, damageFormula: "1d10+3" }), expect.objectContaining({ name: "Lightning Breath", damageFormula: "3d10", save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Repulsion Breath", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "young-bronze-dragon", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 17, hitPoints: 142, skills: expect.objectContaining({ insight: 4, perception: 7, stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Lightning Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 8, damageFormula: "2d10+5" }), expect.objectContaining({ name: "Lightning Breath", damageFormula: "9d10", save: { ability: "dexterity", dc: 15, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Repulsion Breath", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "adult-bronze-dragon", budget: 13000, challengeRating: "15", data: expect.objectContaining({ armorClass: 18, hitPoints: 212, skills: expect.objectContaining({ insight: 7, perception: 12, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Lightning Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 12, damageFormula: "2d8+7+1d10" }), expect.objectContaining({ name: "Lightning Breath", damageFormula: "10d10", save: { ability: "dexterity", dc: 19, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Repulsion Breath", condition: "Prone" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "ancient-bronze-dragon", budget: 41000, challengeRating: "22", data: expect.objectContaining({ armorClass: 22, hitPoints: 444, skills: expect.objectContaining({ insight: 10, perception: 17, stealth: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Lightning Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 16, damageFormula: "2d8+9+2d8" }), expect.objectContaining({ name: "Lightning Breath", damageFormula: "15d10", save: { ability: "dexterity", dc: 23, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Repulsion Breath", condition: "Prone" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "copper-dragon-wyrmling", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 16, hitPoints: 22, speed: "30 ft., Climb 30 ft., Fly 60 ft.", skills: expect.objectContaining({ perception: 4, stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Acid Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 4, damageFormula: "1d10+2" }), expect.objectContaining({ name: "Acid Breath", damageFormula: "4d8", save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Slowing Breath", condition: "Slowed" })]) }) }),
        expect.objectContaining({ id: "young-copper-dragon", budget: 2900, challengeRating: "7", data: expect.objectContaining({ armorClass: 17, hitPoints: 119, skills: expect.objectContaining({ deception: 5, perception: 7, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Acid Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 7, damageFormula: "2d10+4" }), expect.objectContaining({ name: "Acid Breath", damageFormula: "9d8", save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Slowing Breath", condition: "Slowed" })]) }) }),
        expect.objectContaining({ id: "adult-copper-dragon", budget: 11500, challengeRating: "14", data: expect.objectContaining({ armorClass: 18, hitPoints: 184, skills: expect.objectContaining({ deception: 9, perception: 12, stealth: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Acid Immunity" }), expect.objectContaining({ name: "Legendary Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 11, damageFormula: "2d10+6+1d8" }), expect.objectContaining({ name: "Acid Breath", damageFormula: "12d8", save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Slowing Breath", condition: "Slowed" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "ancient-copper-dragon", budget: 33000, challengeRating: "21", data: expect.objectContaining({ armorClass: 21, hitPoints: 367, skills: expect.objectContaining({ deception: 13, perception: 17, stealth: 8 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Acid Immunity" }), expect.objectContaining({ name: "Legendary Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 15, damageFormula: "2d10+8+2d8" }), expect.objectContaining({ name: "Acid Breath", damageFormula: "14d8", save: { ability: "dexterity", dc: 22, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Slowing Breath", condition: "Slowed" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "gold-dragon-wyrmling", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 17, hitPoints: 60, creatureType: "Dragon (Metallic)", skills: expect.objectContaining({ perception: 4, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "1d10+4" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "7d6", save: { ability: "dexterity", dc: 13, success: "half" }, recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "young-gold-dragon", budget: 5900, challengeRating: "10", data: expect.objectContaining({ armorClass: 18, hitPoints: 178, skills: expect.objectContaining({ insight: 5, perception: 9, persuasion: 9, stealth: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 11, damageFormula: "2d10+7" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "10d6", save: { ability: "dexterity", dc: 17, success: "half" }, recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "adult-gold-dragon", budget: 18000, challengeRating: "17", data: expect.objectContaining({ armorClass: 19, hitPoints: 243, skills: expect.objectContaining({ insight: 8, perception: 14, persuasion: 13, stealth: 8 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 14, damageFormula: "2d8+8+1d8" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "12d10", save: { ability: "dexterity", dc: 21, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Weakening Breath", condition: "Weakened" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "ancient-gold-dragon", budget: 62000, challengeRating: "24", data: expect.objectContaining({ armorClass: 22, hitPoints: 546, skills: expect.objectContaining({ insight: 10, perception: 17, persuasion: 16, stealth: 9 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 17, damageFormula: "2d8+10+2d8" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "13d10", save: { ability: "dexterity", dc: 24, success: "half" }, recharge: "5-6" }), expect.objectContaining({ name: "Weakening Breath", condition: "Weakened" }), expect.objectContaining({ name: "Legendary Actions" })]) }) }),
        expect.objectContaining({ id: "gorgon", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 19, hitPoints: 114, creatureType: "Construct", skills: expect.objectContaining({ perception: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 8, damageFormula: "2d12+5", condition: "Prone" }), expect.objectContaining({ name: "Petrifying Breath", condition: "Restrained/Petrified", recharge: "5-6" }), expect.objectContaining({ name: "Trample", kind: "bonusAction", damageFormula: "2d10+5" })]) }) }),
        expect.objectContaining({ id: "gray-ooze", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 9, hitPoints: 22, skills: expect.objectContaining({ stealth: 2 }), senses: expect.arrayContaining(["Blindsight 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amorphous" }), expect.objectContaining({ name: "Corrosive Form" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Pseudopod", attackBonus: 3, damageFormula: "2d8+1" })]) }) }),
        expect.objectContaining({ id: "green-hag", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 17, hitPoints: 82, creatureType: "Fey", skills: expect.objectContaining({ arcana: 5, deception: 4, perception: 4, stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Coven Magic" }), expect.objectContaining({ name: "Mimicry" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 6, damageFormula: "1d8+4+1d6" }), expect.objectContaining({ name: "Spellcasting" })]) }) }),
        expect.objectContaining({ id: "grick", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 14, hitPoints: 54, creatureType: "Aberration", skills: expect.objectContaining({ stealth: 4 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 4, damageFormula: "2d6+2" }), expect.objectContaining({ name: "Tentacles", attackBonus: 4, damageFormula: "1d10+2", condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "griffon", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 59, creatureType: "Monstrosity", skills: expect.objectContaining({ perception: 5 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 6, damageFormula: "1d8+4", condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "grimlock", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 11, hitPoints: 11, skills: expect.objectContaining({ athletics: 5, perception: 3, stealth: 5 }), senses: expect.arrayContaining(["Blindsight 30 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bone Cudgel", attackBonus: 5, damageFormula: "1d6+3+1d4" })]) }) }),
        expect.objectContaining({ id: "guardian-naga", budget: 5900, challengeRating: "10", data: expect.objectContaining({ armorClass: 18, hitPoints: 136, creatureType: "Celestial", skills: expect.objectContaining({ arcana: 11, history: 11, religion: 11 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Celestial Restoration" }), expect.objectContaining({ name: "Poison Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 8, damageFormula: "2d12+4+4d10" }), expect.objectContaining({ name: "Poisonous Spittle", damageFormula: "7d8", condition: "Blinded" }), expect.objectContaining({ name: "Spellcasting" })]) }) }),
        expect.objectContaining({ id: "half-dragon", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 18, hitPoints: 105, creatureType: "Dragon", skills: expect.objectContaining({ athletics: 7, perception: 5, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Draconic Origin" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 7, damageFormula: "1d4+4+2d6" }), expect.objectContaining({ name: "Dragon's Breath", damageFormula: "8d6", recharge: "5-6" }), expect.objectContaining({ name: "Leap", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "harpy", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 11, hitPoints: 38, actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 3, damageFormula: "2d4+1" }), expect.objectContaining({ name: "Luring Song", condition: "Charmed/Incapacitated" })]) }) }),
        expect.objectContaining({ id: "hell-hound", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 15, hitPoints: 58, skills: expect.objectContaining({ perception: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" }), expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d8+3+1d6" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "5d6", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "hezrou", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 18, hitPoints: 157, traits: expect.arrayContaining([expect.objectContaining({ name: "Demonic Restoration" }), expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Stench" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 7, damageFormula: "1d4+4+2d8" }), expect.objectContaining({ name: "Leap", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "hill-giant", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 13, hitPoints: 105, creatureType: "Giant", skills: expect.objectContaining({ perception: 2 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Tree Club", attackBonus: 8, damageFormula: "3d8+5", condition: "Prone" }), expect.objectContaining({ name: "Trash Lob", attackBonus: 8, damageFormula: "2d10+5", condition: "Poisoned" })]) }) }),
        expect.objectContaining({ id: "hippogriff", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 11, hitPoints: 26, creatureType: "Monstrosity", skills: expect.objectContaining({ perception: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 5, damageFormula: "1d8+3" })]) }) }),
        expect.objectContaining({ id: "hippopotamus", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 14, hitPoints: 82, creatureType: "Beast", skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 7, damageFormula: "2d10+5" })]) }) }),
        expect.objectContaining({ id: "hobgoblin-warrior", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 18, hitPoints: 11, creatureType: "Fey (Goblinoid)", traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Longsword", attackBonus: 3, damageFormula: "2d10+1" }), expect.objectContaining({ name: "Longbow", attackBonus: 3, damageFormula: "1d8+1+3d4" })]) }) }),
        expect.objectContaining({ id: "homunculus", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 4, creatureType: "Construct", traits: expect.arrayContaining([expect.objectContaining({ name: "Telepathic Bond" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1", condition: "Poisoned/Unconscious" })]) }) }),
        expect.objectContaining({ id: "hunter-shark", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 45, skills: expect.objectContaining({ perception: 2 }), senses: expect.arrayContaining(["Blindsight 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "3d6+4" })]) }) }),
        expect.objectContaining({ id: "hyena", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 5, skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 2, damageFormula: "1d6" })]) }) }),
        expect.objectContaining({ id: "ice-mephit", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 21, creatureType: "Elemental", skills: expect.objectContaining({ perception: 2, stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Death Burst" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 3, damageFormula: "1d4+1+1d4" }), expect.objectContaining({ name: "Fog Cloud", recharge: "1/day" }), expect.objectContaining({ name: "Frost Breath", damageFormula: "3d4", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "magma-mephit", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 18, creatureType: "Elemental", skills: expect.objectContaining({ stealth: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Cold Vulnerability" }), expect.objectContaining({ name: "Death Burst" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 3, damageFormula: "1d4+1+1d6" }), expect.objectContaining({ name: "Fire Breath", damageFormula: "2d6", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "steam-mephit", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 10, hitPoints: 17, creatureType: "Elemental", skills: expect.objectContaining({ stealth: 2 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Blurred Form" }), expect.objectContaining({ name: "Death Burst" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 2, damageFormula: "1d4+1d4" }), expect.objectContaining({ name: "Steam Breath", damageFormula: "2d4", condition: "Slowed", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "merfolk-skirmisher", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 11, hitPoints: 11, creatureType: "Elemental", traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Ocean Spear", attackBonus: 2, damageFormula: "1d6+1d4", condition: "Slowed" })]) }) }),
        expect.objectContaining({ id: "merrow", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 45, creatureType: "Monstrosity", traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "1d4+4", condition: "Poisoned" }), expect.objectContaining({ name: "Claw", damageFormula: "2d4+4" }), expect.objectContaining({ name: "Harpoon", damageFormula: "2d6+4" })]) }) }),
        expect.objectContaining({ id: "mimic", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 58, creatureType: "Monstrosity", skills: expect.objectContaining({ stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Adhesive" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d8+3+1d8" }), expect.objectContaining({ name: "Pseudopod", condition: "Grappled" }), expect.objectContaining({ name: "Shape-Shift", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "nalfeshnee", budget: 10000, challengeRating: "13", data: expect.objectContaining({ armorClass: 18, hitPoints: 184, creatureType: "Fiend (Demon)", senses: expect.arrayContaining(["Truesight 120 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Demonic Restoration" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 10, damageFormula: "2d10+5+2d10" }), expect.objectContaining({ name: "Horror Nimbus", kind: "bonusAction", damageFormula: "8d6", recharge: "5-6" }), expect.objectContaining({ name: "Pursuit", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "night-hag", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 17, hitPoints: 112, creatureType: "Fiend", skills: expect.objectContaining({ deception: 6, perception: 5, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Soul Bag" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 7, damageFormula: "2d8+4" }), expect.objectContaining({ name: "Nightmare Haunting", recharge: "1/day" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Shape-Shift", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "nightmare", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 13, hitPoints: 68, creatureType: "Fiend", traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" }), expect.objectContaining({ name: "Illumination" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 6, damageFormula: "2d8+4+3d6" }), expect.objectContaining({ name: "Ethereal Stride" })]) }) }),
        expect.objectContaining({ id: "noble", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 15, hitPoints: 9, creatureType: "Humanoid", skills: expect.objectContaining({ deception: 5, insight: 4, persuasion: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Rapier", attackBonus: 3, damageFormula: "1d8+1" }), expect.objectContaining({ name: "Parry", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "ochre-jelly", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 8, hitPoints: 52, creatureType: "Ooze", senses: expect.arrayContaining(["Blindsight 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Amorphous" }), expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Pseudopod", attackBonus: 4, damageFormula: "3d6+2" }), expect.objectContaining({ name: "Split", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "oni", budget: 2900, challengeRating: "7", data: expect.objectContaining({ armorClass: 17, hitPoints: 119, creatureType: "Fiend", skills: expect.objectContaining({ arcana: 5, deception: 8, perception: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Regeneration" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 7, damageFormula: "1d12+4+2d8" }), expect.objectContaining({ name: "Nightmare Ray", condition: "Frightened" }), expect.objectContaining({ name: "Invisibility", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "otyugh", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 14, hitPoints: 104, creatureType: "Aberration", actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, condition: "Poisoned" }), expect.objectContaining({ name: "Tentacle", condition: "Grappled" }), expect.objectContaining({ name: "Tentacle Slam", damageFormula: "3d8+3", condition: "Stunned" })]) }) }),
        expect.objectContaining({ id: "pegasus", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 59, creatureType: "Celestial", skills: expect.objectContaining({ perception: 6 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 6, damageFormula: "1d6+4+2d4" })]) }) }),
        expect.objectContaining({ id: "phase-spider", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 14, hitPoints: 45, creatureType: "Monstrosity", skills: expect.objectContaining({ stealth: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Ethereal Sight" }), expect.objectContaining({ name: "Web Walker" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d10+3+2d8", condition: "Poisoned/Paralyzed" }), expect.objectContaining({ name: "Ethereal Jaunt", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "pirate", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 14, hitPoints: 33, actions: expect.arrayContaining([expect.objectContaining({ name: "Dagger", attackBonus: 5, damageFormula: "1d4+3" }), expect.objectContaining({ name: "Enthralling Panache", condition: "Charmed" })]) }) }),
        expect.objectContaining({ id: "pirate-captain", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 17, hitPoints: 84, skills: expect.objectContaining({ acrobatics: 7, perception: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Rapier", attackBonus: 7, damageFormula: "2d8+4" }), expect.objectContaining({ name: "Pistol", damageFormula: "2d10+4" }), expect.objectContaining({ name: "Captain's Charm", kind: "bonusAction" }), expect.objectContaining({ name: "Riposte", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "planetar", budget: 15000, challengeRating: "16", data: expect.objectContaining({ armorClass: 19, hitPoints: 262, creatureType: "Celestial (Angel)", skills: expect.objectContaining({ perception: 11 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Exalted Restoration" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Radiant Sword", attackBonus: 12, damageFormula: "2d6+7+4d8" }), expect.objectContaining({ name: "Holy Burst", damageFormula: "7d6" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Divine Aid", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "plesiosaurus", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 68, creatureType: "Beast (Dinosaur)", skills: expect.objectContaining({ perception: 3, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "2d6+4" })]) }) }),
        expect.objectContaining({ id: "priest", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 38, creatureType: "Humanoid (Cleric)", skills: expect.objectContaining({ medicine: 7, perception: 5, religion: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Mace", attackBonus: 5, damageFormula: "1d6+3+2d4" }), expect.objectContaining({ name: "Radiant Flame", damageFormula: "2d10" }), expect.objectContaining({ name: "Spellcasting" }), expect.objectContaining({ name: "Divine Aid", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "pseudodragon", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 14, hitPoints: 10, creatureType: "Dragon", skills: expect.objectContaining({ perception: 5, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d4+2" }), expect.objectContaining({ name: "Sting", damageFormula: "2d4", condition: "Poisoned/Unconscious" })]) }) }),
        expect.objectContaining({ id: "rat", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 10, hitPoints: 1, skills: expect.objectContaining({ perception: 2 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Agile" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 2, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "raven", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 2, skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Mimicry" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 4, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "swarm-of-bats", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 12, hitPoints: 11, senses: expect.arrayContaining(["Blindsight 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bites", attackBonus: 4, damageFormula: "2d4" })]) }) }),
        expect.objectContaining({ id: "swarm-of-insects", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 19, senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bites", attackBonus: 3, damageFormula: "2d4+1", damageType: "poison" })]) }) }),
        expect.objectContaining({ id: "swarm-of-piranhas", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 13, hitPoints: 28, senses: expect.arrayContaining(["Darkvision 60 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Swarm" }), expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bites", attackBonus: 5, damageFormula: "2d4+3" })]) }) }),
        expect.objectContaining({ id: "swarm-of-rats", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 10, hitPoints: 14, senses: expect.arrayContaining(["Darkvision 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bites", attackBonus: 2, damageFormula: "2d4" })]) }) }),
        expect.objectContaining({ id: "swarm-of-ravens", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 12, hitPoints: 11, skills: expect.objectContaining({ perception: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Beaks", attackBonus: 4, damageFormula: "1d6+2" })]) }) }),
        expect.objectContaining({ id: "swarm-of-venomous-snakes", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 14, hitPoints: 36, senses: expect.arrayContaining(["Blindsight 10 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Swarm" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bites", attackBonus: 6, damageFormula: "1d8+4+3d6", damageType: "piercing/poison" })]) }) }),
        expect.objectContaining({ id: "reef-shark", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 12, hitPoints: 22, senses: expect.arrayContaining(["Blindsight 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" }), expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "2d4+2" })]) }) }),
        expect.objectContaining({ id: "rhinoceros", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 45, actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 7, damageFormula: "2d8+5", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "riding-horse", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 11, hitPoints: 13, actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 5, damageFormula: "1d8+3" })]) }) }),
        expect.objectContaining({ id: "roc", budget: 7200, challengeRating: "11", data: expect.objectContaining({ armorClass: 15, hitPoints: 248, skills: expect.objectContaining({ perception: 8 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 13, damageFormula: "3d12+9" }), expect.objectContaining({ name: "Talons", condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Swoop", kind: "bonusAction", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "roper", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 20, hitPoints: 93, skills: expect.objectContaining({ perception: 6, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", damageFormula: "3d8+4" }), expect.objectContaining({ name: "Tentacle", condition: "Grappled/Poisoned" }), expect.objectContaining({ name: "Reel" })]) }) }),
        expect.objectContaining({ id: "saber-toothed-tiger", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 13, hitPoints: 52, skills: expect.objectContaining({ perception: 5, stealth: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Running Leap" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 6, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Nimble Escape", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "scorpion", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 1, senses: expect.arrayContaining(["Blindsight 10 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Sting", attackBonus: 2, damageFormula: "1+1d6" })]) }) }),
        expect.objectContaining({ id: "seahorse", budget: 0, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 1, skills: expect.objectContaining({ perception: 2, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bubble Dash" })]) }) }),
        expect.objectContaining({ id: "spider", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 1, skills: expect.objectContaining({ stealth: 4 }), senses: expect.arrayContaining(["Darkvision 30 ft."]), traits: expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Web Walker" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1+1d4" })]) }) }),
        expect.objectContaining({ id: "tiger", budget: 200, challengeRating: "1", data: expect.objectContaining({ armorClass: 13, hitPoints: 30, skills: expect.objectContaining({ perception: 3, stealth: 7 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 5, damageFormula: "2d6+3", condition: "Prone" }), expect.objectContaining({ name: "Nimble Escape", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "triceratops", budget: 1800, challengeRating: "5", data: expect.objectContaining({ armorClass: 14, hitPoints: 114, creatureType: "Beast (Dinosaur)", actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 9, damageFormula: "2d12+6", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "tyrannosaurus-rex", budget: 3900, challengeRating: "8", data: expect.objectContaining({ armorClass: 13, hitPoints: 136, creatureType: "Beast (Dinosaur)", skills: expect.objectContaining({ perception: 4 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 10, damageFormula: "4d12+7", condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Tail", attackBonus: 10, damageFormula: "4d8+7", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "venomous-snake", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 12, hitPoints: 5, senses: expect.arrayContaining(["Blindsight 10 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d4+2+1d6" })]) }) }),
        expect.objectContaining({ id: "vulture", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 10, hitPoints: 5, skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Beak", attackBonus: 2, damageFormula: "1d4" })]) }) }),
        expect.objectContaining({ id: "warhorse", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 11, hitPoints: 19, actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 6, damageFormula: "2d4+4", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "weasel", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 1, skills: expect.objectContaining({ acrobatics: 5, perception: 3, stealth: 5 }), senses: expect.arrayContaining(["Darkvision 60 ft."]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "wight", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 14, hitPoints: 82, skills: expect.objectContaining({ perception: 3, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Necrotic Resistance" }), expect.objectContaining({ name: "Poison Immunity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Necrotic Sword", attackBonus: 4, damageFormula: "1d8+2+1d8" }), expect.objectContaining({ name: "Life Drain", save: expect.objectContaining({ ability: "constitution", dc: 13 }) })]) }) }),
        expect.objectContaining({ id: "will-o-wisp", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 19, hitPoints: 27, traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Immunities" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Incorporeal Movement" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Shock", attackBonus: 4, damageFormula: "2d8+2" }), expect.objectContaining({ name: "Consume Life", kind: "bonusAction" }), expect.objectContaining({ name: "Vanish", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "winter-wolf", budget: 700, challengeRating: "3", data: expect.objectContaining({ armorClass: 13, hitPoints: 75, skills: expect.objectContaining({ perception: 5, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Cold Immunity" }), expect.objectContaining({ name: "Pack Tactics" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 6, damageFormula: "2d6+4", condition: "Prone" }), expect.objectContaining({ name: "Cold Breath", damageFormula: "4d8", recharge: "5-6" })]) }) }),
        expect.objectContaining({ id: "worg", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 13, hitPoints: 26, creatureType: "Fey", skills: expect.objectContaining({ perception: 4 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1d8+3" })]) }) }),
        expect.objectContaining({ id: "ogre-zombie", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 8, hitPoints: 85, traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Immunity" }), expect.objectContaining({ name: "Undead Fortitude" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Slam", attackBonus: 6, damageFormula: "2d8+4" })]) }) }),
        expect.objectContaining({ id: "scout", budget: 100, challengeRating: "1/2", data: expect.objectContaining({ armorClass: 13, hitPoints: 16, skills: expect.objectContaining({ nature: 4, perception: 5, stealth: 6, survival: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Shortsword", attackBonus: 4, damageFormula: "1d6+2" }), expect.objectContaining({ name: "Longbow", damageFormula: "1d8+2" })]) }) }),
        expect.objectContaining({ id: "sea-hag", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 14, hitPoints: 52, creatureType: "Fey", traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Coven Magic" }), expect.objectContaining({ name: "Vile Appearance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", damageFormula: "2d6+3" }), expect.objectContaining({ name: "Death Glare", damageFormula: "3d8", recharge: "5-6" }), expect.objectContaining({ name: "Illusory Appearance" })]) }) }),
        expect.objectContaining({ id: "incubus", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 15, hitPoints: 66, skills: expect.objectContaining({ deception: 9, perception: 5, persuasion: 9, stealth: 7 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Succubus Form" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Restless Touch", attackBonus: 7, damageFormula: "3d6+5", condition: "Cursed" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "charisma", dc: 15 } }), expect.objectContaining({ name: "Nightmare", kind: "bonusAction", damageFormula: "4d8", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "invisible-stalker", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 14, hitPoints: 97, skills: expect.objectContaining({ perception: 8, stealth: 10 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Air Form" }), expect.objectContaining({ name: "Invisibility" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Wind Swipe", attackBonus: 7, damageFormula: "2d6+4" }), expect.objectContaining({ name: "Vortex", damageFormula: "1d8+3", save: { ability: "constitution", dc: 14 }, condition: "Grappled" })]) }) }),
        expect.objectContaining({ id: "iron-golem", budget: 15000, challengeRating: "16", data: expect.objectContaining({ armorClass: 20, hitPoints: 252, traits: expect.arrayContaining([expect.objectContaining({ name: "Fire Absorption" }), expect.objectContaining({ name: "Magic Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bladed Arm", attackBonus: 12, damageFormula: "3d8+7+3d6" }), expect.objectContaining({ name: "Fiery Bolt", attackBonus: 10, damageFormula: "8d8" }), expect.objectContaining({ name: "Poison Breath", damageFormula: "10d10", recharge: "6" })]) }) }),
        expect.objectContaining({ id: "kobold-warrior", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 14, hitPoints: 7, creatureType: "Dragon", traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" }), expect.objectContaining({ name: "Sunlight Sensitivity" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Dagger", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "kraken", budget: 50000, challengeRating: "23", data: expect.objectContaining({ armorClass: 18, hitPoints: 481, creatureType: "Monstrosity (Titan)", skills: expect.objectContaining({ history: 13, perception: 11 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Siege Monster" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Tentacle", attackBonus: 17, damageFormula: "4d6+10", condition: "Grappled/Restrained" }), expect.objectContaining({ name: "Fling", damageFormula: "4d8", save: { ability: "dexterity", dc: 25, success: "half" }, condition: "Prone" }), expect.objectContaining({ name: "Lightning Strike", damageFormula: "6d10", save: { ability: "dexterity", dc: 23, success: "half" } }), expect.objectContaining({ name: "Swallow", damageFormula: "3d8+10+7d6", condition: "Restrained" }), expect.objectContaining({ name: "Toxic Ink", condition: "Blinded/Poisoned" })]) }) }),
        expect.objectContaining({ id: "lamia", budget: 1100, challengeRating: "4", data: expect.objectContaining({ armorClass: 13, hitPoints: 97, creatureType: "Fiend", skills: expect.objectContaining({ deception: 7, insight: 4, stealth: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Claw", attackBonus: 5, damageFormula: "1d8+3+2d6" }), expect.objectContaining({ name: "Corrupting Touch", damageFormula: "3d8", save: { ability: "wisdom", dc: 13 }, condition: "Charmed/Poisoned" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "charisma", dc: 13 } }), expect.objectContaining({ name: "Leap", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "mage", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 15, hitPoints: 81, creatureType: "Humanoid (Wizard)", skills: expect.objectContaining({ arcana: 6, history: 6, perception: 4 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Arcane Burst", attackBonus: 6, damageFormula: "3d8+3" }), expect.objectContaining({ name: "Spellcasting", save: { ability: "intelligence", dc: 14 } })]) }) }),
        expect.objectContaining({ id: "mammoth", budget: 2300, challengeRating: "6", data: expect.objectContaining({ armorClass: 13, hitPoints: 126, creatureType: "Beast", actions: expect.arrayContaining([expect.objectContaining({ name: "Gore", attackBonus: 10, damageFormula: "2d10+7", condition: "Prone" }), expect.objectContaining({ name: "Trample", kind: "bonusAction", damageFormula: "4d10+7", save: { ability: "dexterity", dc: 18, success: "half" } })]) }) }),
        expect.objectContaining({ id: "mastiff", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 12, hitPoints: 5, skills: expect.objectContaining({ perception: 5 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 3, damageFormula: "1d6+1", condition: "Prone" })]) }) }),
        expect.objectContaining({ id: "mule", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 10, hitPoints: 11, traits: expect.arrayContaining([expect.objectContaining({ name: "Beast of Burden" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "octopus", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 12, hitPoints: 3, skills: expect.objectContaining({ perception: 2, stealth: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Compression" }), expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Tentacles", attackBonus: 4, damageFormula: "1" }), expect.objectContaining({ name: "Ink Cloud", kind: "reaction" })]) }) }),
        expect.objectContaining({ id: "owl", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 11, hitPoints: 1, skills: expect.objectContaining({ perception: 5, stealth: 5 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Talons", attackBonus: 3, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "panther", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 13, skills: expect.objectContaining({ perception: 4, stealth: 7 }), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 5, damageFormula: "1d6+3" }), expect.objectContaining({ name: "Nimble Escape", kind: "bonusAction" })]) }) }),
        expect.objectContaining({ id: "piranha", budget: 10, challengeRating: "0", data: expect.objectContaining({ armorClass: 13, hitPoints: 1, traits: expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 5, damageFormula: "1" })]) }) }),
        expect.objectContaining({ id: "polar-bear", budget: 450, challengeRating: "2", data: expect.objectContaining({ armorClass: 12, hitPoints: 42, skills: expect.objectContaining({ perception: 5, stealth: 4 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Cold Resistance" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Rend", attackBonus: 7, damageFormula: "1d8+5" })]) }) }),
        expect.objectContaining({ id: "pony", budget: 25, challengeRating: "1/8", data: expect.objectContaining({ armorClass: 10, hitPoints: 11, actions: expect.arrayContaining([expect.objectContaining({ name: "Hooves", attackBonus: 4, damageFormula: "1d4+2" })]) }) }),
        expect.objectContaining({ id: "pteranodon", budget: 50, challengeRating: "1/4", data: expect.objectContaining({ armorClass: 13, hitPoints: 13, creatureType: "Beast (Dinosaur)", skills: expect.objectContaining({ perception: 1 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]), actions: expect.arrayContaining([expect.objectContaining({ name: "Bite", attackBonus: 4, damageFormula: "1d8+2" })]) }) })
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
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 2 } }], [{ id: "gelatinous-cube", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 450,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "gelatinous-cube", budgetEach: 450, budgetTotal: 450, challengeRating: "2" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 2 } }], [{ id: "ghast", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 450,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "ghast", budgetEach: 450, budgetTotal: 450, challengeRating: "2" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 5 } }], [{ id: "wraith", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 1800,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "wraith", budgetEach: 1800, budgetTotal: 1800, challengeRating: "5" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 5 } }], [{ id: "air-elemental", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 1800,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "air-elemental", budgetEach: 1800, budgetTotal: 1800, challengeRating: "5" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 3 } }], [{ id: "basilisk", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 700,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "basilisk", budgetEach: 700, budgetTotal: 700, challengeRating: "3" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 5 } }], [{ id: "xorn", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 1800,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "xorn", budgetEach: 1800, budgetTotal: 1800, challengeRating: "5" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 10 } }], [{ id: "young-red-dragon", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 3100,
      threatBudget: 5900,
      difficulty: "deadly",
      difficultyBudgets: { easy: 1600, standard: 2300, hard: 3100 },
      threats: [expect.objectContaining({ id: "young-red-dragon", budgetEach: 5900, budgetTotal: 5900, challengeRating: "10" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 11 } }], [{ id: "remorhaz", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 4100,
      threatBudget: 7200,
      difficulty: "deadly",
      difficultyBudgets: { easy: 1900, standard: 2900, hard: 4100 },
      threats: [expect.objectContaining({ id: "remorhaz", budgetEach: 7200, budgetTotal: 7200, challengeRating: "11" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 15 } }], [{ id: "purple-worm", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 13000,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "purple-worm", budgetEach: 13000, budgetTotal: 13000, challengeRating: "15" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 15 } }], [{ id: "mummy-lord", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 13000,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "mummy-lord", budgetEach: 13000, budgetTotal: 13000, challengeRating: "15" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 20 } }], [{ id: "lich", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 33000,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "lich", budgetEach: 33000, budgetTotal: 33000, challengeRating: "21" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 5 } }], [{ id: "vampire-spawn", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 1800,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "vampire-spawn", budgetEach: 1800, budgetTotal: 1800, challengeRating: "5" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 13 } }], [{ id: "vampire", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 10000,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "vampire", budgetEach: 10000, budgetTotal: 10000, challengeRating: "13" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 6 } }], [{ id: "medusa", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 2300,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "medusa", budgetEach: 2300, budgetTotal: 2300, challengeRating: "6" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 8 } }], [{ id: "hydra", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 3900,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "hydra", budgetEach: 3900, budgetTotal: 3900, challengeRating: "8" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 6 } }], [{ id: "wyvern", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 2300,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "wyvern", budgetEach: 2300, budgetTotal: 2300, challengeRating: "6" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 17 } }], [{ id: "adult-red-dragon", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 11700,
      threatBudget: 18000,
      difficulty: "deadly",
      difficultyBudgets: { easy: 4500, standard: 7200, hard: 11700 },
      threats: [expect.objectContaining({ id: "adult-red-dragon", budgetEach: 18000, budgetTotal: 18000, challengeRating: "17" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 20 } }], [{ id: "ancient-red-dragon", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 22000,
      threatBudget: 62000,
      difficulty: "deadly",
      difficultyBudgets: { easy: 6400, standard: 13200, hard: 22000 },
      threats: [expect.objectContaining({ id: "ancient-red-dragon", budgetEach: 62000, budgetTotal: 62000, challengeRating: "24" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 7 } }], [{ id: "giant-ape", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      partyRating: 1700,
      threatBudget: 2900,
      difficulty: "deadly",
      difficultyBudgets: { easy: 750, standard: 1300, hard: 1700 },
      threats: [expect.objectContaining({ id: "giant-ape", budgetEach: 2900, budgetTotal: 2900, challengeRating: "7" })]
    });
    expect(dnd5eSrdEncounterPlan([{ ...srdActor, data: { ...srdActor.data, level: 10 } }], [{ id: "aboleth", count: 1 }])).toMatchObject({
      systemId: "dnd-5e-srd",
      threatBudget: 5900,
      difficulty: "deadly",
      threats: [expect.objectContaining({ id: "aboleth", budgetEach: 5900, budgetTotal: 5900, challengeRating: "10" })]
    });
    const abolethActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Aboleth",
      data: dnd5eSrdMonsterActorData("aboleth")!
    };
    expect(abolethActor.data).toEqual(expect.objectContaining({ hp: { current: 150, max: 150 }, armorClass: 17, challengeRating: "10", xp: 5900 }));
    expect(dnd5eSrdSheet(abolethActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-tentacle-attack", label: "Tentacle Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-tentacle-damage", label: "Tentacle Damage", formula: "2d6+5", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        expect.objectContaining({ id: "monster-consume-memories-damage", label: "Consume Memories Damage", formula: "3d6", metadata: expect.objectContaining({ save: { ability: "intelligence", dc: 16, success: "half" } }) }),
        expect.objectContaining({ id: "monster-dominate-mind-effect", label: "Dominate Mind Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", save: { ability: "wisdom", dc: 16 }, condition: "Charmed" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ effects: expect.arrayContaining([expect.stringContaining("legendary actions")]) }) })
      ])
    );
    expect(dnd5eSrdActionFormula(abolethActor, [], "monster-dominate-mind-effect")).toBe("0");
    const rugActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Rug of Smothering",
      data: dnd5eSrdMonsterActorData("rug-of-smothering")!
    };
    expect(rugActor.data).toEqual(expect.objectContaining({ hp: { current: 27, max: 27 }, armorClass: 12, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(rugActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-smother-attack", label: "Smother Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-smother-damage", label: "Smother Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Blinded/Restrained", summary: expect.stringContaining("smothered") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(rugActor, [], "monster-smother-damage")).toBe("2d6+3");
    const allosaurusActor: Actor = { ...srdActor, type: "monster", name: "Allosaurus", data: dnd5eSrdMonsterActorData("allosaurus")! };
    expect(allosaurusActor.data).toEqual(expect.objectContaining({ hp: { current: 51, max: 51 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(allosaurusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "2d10+4" }, expect.objectContaining({ id: "monster-claws-damage", label: "Claws Damage", formula: "1d8+4", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const ankylosaurusActor: Actor = { ...srdActor, type: "monster", name: "Ankylosaurus", data: dnd5eSrdMonsterActorData("ankylosaurus")! };
    expect(ankylosaurusActor.data).toEqual(expect.objectContaining({ hp: { current: 68, max: 68 }, armorClass: 15, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(ankylosaurusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-tail-damage", label: "Tail Damage", formula: "1d10+4", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const apeActor: Actor = { ...srdActor, type: "monster", name: "Ape", data: dnd5eSrdMonsterActorData("ape")! };
    expect(apeActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 12, challengeRating: "1/2", xp: 100, skillProficiencies: ["athletics", "perception"] }));
    expect(dnd5eSrdSheet(apeActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-fist-attack", label: "Fist Attack", formula: "1d20+5" }, { id: "monster-fist-damage", label: "Fist Damage", formula: "1d4+3" }, expect.objectContaining({ id: "monster-rock-damage", label: "Rock Damage", formula: "2d6+3", metadata: expect.objectContaining({ recharge: "6" }) })]));
    const archelonActor: Actor = { ...srdActor, type: "monster", name: "Archelon", data: dnd5eSrdMonsterActorData("archelon")! };
    expect(archelonActor.data).toEqual(expect.objectContaining({ hp: { current: 90, max: 90 }, armorClass: 17, challengeRating: "4", xp: 1100, skillProficiencies: ["stealth"] }));
    expect((archelonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]));
    expect(dnd5eSrdSheet(archelonActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "3d6+4" }]));
    const ankhegActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ankheg",
      data: dnd5eSrdMonsterActorData("ankheg")!
    };
    expect(dnd5eSrdSheet(ankhegActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+3+1d6", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        expect.objectContaining({ id: "monster-acid-spray-damage", label: "Acid Spray Damage", formula: "4d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "6" }) })
      ])
    );
    const assassinActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Assassin",
      data: dnd5eSrdMonsterActorData("assassin")!
    };
    expect(dnd5eSrdSheet(assassinActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-shortsword-attack", label: "Shortsword Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-shortsword-damage", label: "Shortsword Damage", formula: "1d6+4+5d6", metadata: expect.objectContaining({ condition: "Poisoned" }) }),
        { id: "monster-light-crossbow-attack", label: "Light Crossbow Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-light-crossbow-damage", label: "Light Crossbow Damage", formula: "1d8+4+6d6" }),
        expect.objectContaining({ id: "monster-cunning-action-effect", label: "Cunning Action Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction" }) })
      ])
    );
    const awakenedShrubActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Awakened Shrub",
      data: dnd5eSrdMonsterActorData("awakened-shrub")!
    };
    expect(awakenedShrubActor.data).toEqual(expect.objectContaining({ hp: { current: 10, max: 10 }, armorClass: 9, challengeRating: "0", xp: 10 }));
    expect(dnd5eSrdSheet(awakenedShrubActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rake-attack", label: "Rake Attack", formula: "1d20+1" },
        { id: "monster-rake-damage", label: "Rake Damage", formula: "1" }
      ])
    );
    const awakenedTreeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Awakened Tree",
      data: dnd5eSrdMonsterActorData("awakened-tree")!
    };
    expect(awakenedTreeActor.data).toEqual(expect.objectContaining({ hp: { current: 59, max: 59 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(awakenedTreeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+6" },
        { id: "monster-slam-damage", label: "Slam Damage", formula: "3d6+4" }
      ])
    );
    const axeBeakActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Axe Beak",
      data: dnd5eSrdMonsterActorData("axe-beak")!
    };
    expect(axeBeakActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 11, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(axeBeakActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+4" },
        { id: "monster-beak-damage", label: "Beak Damage", formula: "1d8+2" }
      ])
    );
    const azerSentinelActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Azer Sentinel",
      data: dnd5eSrdMonsterActorData("azer-sentinel")!
    };
    expect(azerSentinelActor.data).toEqual(expect.objectContaining({ hp: { current: 39, max: 39 }, armorClass: 17, challengeRating: "2", xp: 450 }));
    expect((azerSentinelActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Fire Aura" }), expect.objectContaining({ name: "Illumination" })])
    );
    expect(dnd5eSrdSheet(azerSentinelActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-burning-hammer-attack", label: "Burning Hammer Attack", formula: "1d20+5" },
        { id: "monster-burning-hammer-damage", label: "Burning Hammer Damage", formula: "1d10+3+1d6" }
      ])
    );
    expect(dnd5eSrdActionFormula(azerSentinelActor, [], "monster-burning-hammer-damage")).toBe("1d10+3+1d6");
    const behirActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Behir",
      data: dnd5eSrdMonsterActorData("behir")!
    };
    expect(behirActor.data).toEqual(expect.objectContaining({ hp: { current: 168, max: 168 }, armorClass: 17, challengeRating: "11", xp: 7200, skillProficiencies: ["perception", "stealth"] }));
    expect((behirActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Lightning Immunity" })]));
    expect(dnd5eSrdSheet(behirActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+10" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d12+6+2d10", metadata: expect.objectContaining({ damageType: "piercing/lightning" }) }),
        expect.objectContaining({ id: "monster-constrict-damage", label: "Constrict Damage", formula: "5d8+6", metadata: expect.objectContaining({ condition: "Grappled/Restrained", save: { ability: "strength", dc: 18 } }) }),
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "12d10", metadata: expect.objectContaining({ recharge: "5-6", save: { ability: "dexterity", dc: 16, success: "half" } }) }),
        expect.objectContaining({ id: "monster-swallow-damage", label: "Swallow Damage", formula: "6d6", metadata: expect.objectContaining({ action: "bonusAction", condition: "Blinded/Restrained", save: { ability: "dexterity", dc: 18 } }) })
      ])
    );
    const baboonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Baboon",
      data: dnd5eSrdMonsterActorData("baboon")!
    };
    expect(baboonActor.data).toEqual(expect.objectContaining({ hp: { current: 3, max: 3 }, armorClass: 12, challengeRating: "0", xp: 10 }));
    expect((baboonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]));
    expect(dnd5eSrdSheet(baboonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+1" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4-1" }
      ])
    );
    const badgerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Badger",
      data: dnd5eSrdMonsterActorData("badger")!
    };
    expect(badgerActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 11, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect((badgerActor.data.monster as { statBlock: { skills: Record<string, number>; traits: Array<{ name: string }> } }).statBlock).toEqual(
      expect.objectContaining({ skills: expect.objectContaining({ perception: 3 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Poison Resistance" })]) })
    );
    expect(dnd5eSrdSheet(badgerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+2" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    const berserkerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Berserker",
      data: dnd5eSrdMonsterActorData("berserker")!
    };
    expect(berserkerActor.data).toEqual(expect.objectContaining({ hp: { current: 67, max: 67 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect((berserkerActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Bloodied Frenzy" })]));
    expect(dnd5eSrdSheet(berserkerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-greataxe-attack", label: "Greataxe Attack", formula: "1d20+5" },
        { id: "monster-greataxe-damage", label: "Greataxe Damage", formula: "1d12+3" }
      ])
    );
    const batActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bat",
      data: dnd5eSrdMonsterActorData("bat")!
    };
    expect(batActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 12, challengeRating: "0", xp: 10 }));
    expect((batActor.data.monster as { statBlock: { senses: string[] } }).statBlock.senses).toEqual(expect.arrayContaining(["Blindsight 60 ft."]));
    expect(dnd5eSrdSheet(batActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    const bloodHawkActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Blood Hawk",
      data: dnd5eSrdMonsterActorData("blood-hawk")!
    };
    expect(bloodHawkActor.data).toEqual(expect.objectContaining({ hp: { current: 7, max: 7 }, armorClass: 12, challengeRating: "1/8", xp: 25, skillProficiencies: ["perception"] }));
    expect((bloodHawkActor.data.monster as { statBlock: { skills: Record<string, number>; traits: Array<{ name: string }> } }).statBlock).toEqual(
      expect.objectContaining({ skills: expect.objectContaining({ perception: 6 }), traits: expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]) })
    );
    expect(dnd5eSrdSheet(bloodHawkActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-beak-damage", label: "Beak Damage", formula: "1d4+2", metadata: expect.objectContaining({ summary: expect.stringContaining("Bloodied") }) })
      ])
    );
    const blackPuddingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Black Pudding",
      data: dnd5eSrdMonsterActorData("black-pudding")!
    };
    expect(blackPuddingActor.data).toEqual(expect.objectContaining({ hp: { current: 68, max: 68 }, armorClass: 7, challengeRating: "4", xp: 1100 }));
    expect((blackPuddingActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Damage Immunities" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Corrosive Form" })])
    );
    expect(dnd5eSrdSheet(blackPuddingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-dissolving-pseudopod-attack", label: "Dissolving Pseudopod Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-dissolving-pseudopod-damage", label: "Dissolving Pseudopod Damage", formula: "4d6+3", metadata: expect.objectContaining({ damageType: "acid" }) }),
        expect.objectContaining({ id: "monster-split-effect", label: "Split Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })
      ])
    );
    const blinkDogActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Blink Dog",
      data: dnd5eSrdMonsterActorData("blink-dog")!
    };
    expect(blinkDogActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(blinkDogActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+3" },
        expect.objectContaining({ id: "monster-teleport-effect", label: "Teleport Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", recharge: "4-6" }) })
      ])
    );
    const boarActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Boar",
      data: dnd5eSrdMonsterActorData("boar")!
    };
    expect(boarActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 11, challengeRating: "1/4", xp: 50 }));
    expect((boarActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Bloodied Fury" })]));
    expect(dnd5eSrdSheet(boarActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "1d6+1", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("extra 1d6") }) })
      ])
    );
    const bugbearStalkerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bugbear Stalker",
      data: dnd5eSrdMonsterActorData("bugbear-stalker")!
    };
    expect(bugbearStalkerActor.data).toEqual(expect.objectContaining({ hp: { current: 65, max: 65 }, armorClass: 15, challengeRating: "3", xp: 700, skillProficiencies: ["stealth", "survival"] }));
    expect((bugbearStalkerActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Abduct" })]));
    expect(dnd5eSrdSheet(bugbearStalkerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-javelin-attack", label: "Javelin Attack", formula: "1d20+5" },
        { id: "monster-javelin-damage", label: "Javelin Damage", formula: "3d6+3" },
        { id: "monster-morningstar-attack", label: "Morningstar Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-quick-grapple-effect", label: "Quick Grapple Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", condition: "Grappled", save: { ability: "dexterity", dc: 13 } }) })
      ])
    );
    const bugbearWarriorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bugbear Warrior",
      data: dnd5eSrdMonsterActorData("bugbear-warrior")!
    };
    expect(bugbearWarriorActor.data).toEqual(expect.objectContaining({ hp: { current: 33, max: 33 }, armorClass: 14, challengeRating: "1", xp: 200, skillProficiencies: ["stealth", "survival"] }));
    expect((bugbearWarriorActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Abduct" })]));
    expect(dnd5eSrdSheet(bugbearWarriorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-grab-attack", label: "Grab Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-grab-damage", label: "Grab Damage", formula: "2d6+2", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        { id: "monster-light-hammer-attack", label: "Light Hammer Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-light-hammer-damage", label: "Light Hammer Damage", formula: "3d4+2" })
      ])
    );
    const buletteActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bulette",
      data: dnd5eSrdMonsterActorData("bulette")!
    };
    expect(buletteActor.data).toEqual(expect.objectContaining({ hp: { current: 94, max: 94 }, armorClass: 17, challengeRating: "5", xp: 1800, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(buletteActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+7" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d12+4" },
        expect.objectContaining({ id: "monster-deadly-leap-damage", label: "Deadly Leap Damage", formula: "3d12", metadata: expect.objectContaining({ condition: "Prone", save: { ability: "dexterity", dc: 15, success: "half" } }) }),
        expect.objectContaining({ id: "monster-leap-effect", label: "Leap Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })
      ])
    );
    const camelActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Camel",
      data: dnd5eSrdMonsterActorData("camel")!
    };
    expect(camelActor.data).toEqual(expect.objectContaining({ hp: { current: 17, max: 17 }, armorClass: 10, challengeRating: "1/8", xp: 25 }));
    expect(dnd5eSrdSheet(camelActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+2" }
      ])
    );
    const catActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cat",
      data: dnd5eSrdMonsterActorData("cat")!
    };
    expect(catActor.data).toEqual(expect.objectContaining({ hp: { current: 2, max: 2 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["perception", "stealth"] }));
    expect((catActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Jumper" })]));
    expect(dnd5eSrdSheet(catActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-scratch-attack", label: "Scratch Attack", formula: "1d20+4" },
        { id: "monster-scratch-damage", label: "Scratch Damage", formula: "1" }
      ])
    );
    const centaurTrooperActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Centaur Trooper",
      data: dnd5eSrdMonsterActorData("centaur-trooper")!
    };
    expect(centaurTrooperActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 16, challengeRating: "2", xp: 450, skillProficiencies: ["athletics", "perception"] }));
    expect(dnd5eSrdSheet(centaurTrooperActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pike-attack", label: "Pike Attack", formula: "1d20+6" },
        { id: "monster-pike-damage", label: "Pike Damage", formula: "1d10+4" },
        { id: "monster-longbow-attack", label: "Longbow Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-trampling-charge-damage", label: "Trampling Charge Damage", formula: "1d6+4", metadata: expect.objectContaining({ action: "bonusAction", recharge: "5-6", condition: "Prone" }) })
      ])
    );
    const chimeraActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Chimera",
      data: dnd5eSrdMonsterActorData("chimera")!
    };
    expect(chimeraActor.data).toEqual(expect.objectContaining({ hp: { current: 114, max: 114 }, armorClass: 14, challengeRating: "6", xp: 2300, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(chimeraActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "1d12+4", metadata: expect.objectContaining({ condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+4" }),
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1d6+4" },
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "7d8", metadata: expect.objectContaining({ recharge: "5-6", save: { ability: "dexterity", dc: 15, success: "half" } }) })
      ])
    );
    const chuulActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Chuul",
      data: dnd5eSrdMonsterActorData("chuul")!
    };
    expect(chuulActor.data).toEqual(expect.objectContaining({ hp: { current: 76, max: 76 }, armorClass: 16, challengeRating: "4", xp: 1100, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(chuulActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pincer-attack", label: "Pincer Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-pincer-damage", label: "Pincer Damage", formula: "1d10+4", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        expect.objectContaining({ id: "monster-paralyzing-tentacles-effect", label: "Paralyzing Tentacles Effect", formula: "0", metadata: expect.objectContaining({ condition: "Poisoned/Paralyzed", save: { ability: "constitution", dc: 13 } }) })
      ])
    );
    const clayGolemActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Clay Golem",
      data: dnd5eSrdMonsterActorData("clay-golem")!
    };
    expect(clayGolemActor.data).toEqual(expect.objectContaining({ hp: { current: 123, max: 123 }, armorClass: 14, challengeRating: "9", xp: 5000, skillProficiencies: [] }));
    expect(dnd5eSrdSheet(clayGolemActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-slam-damage", label: "Slam Damage", formula: "1d10+5+1d12" }),
        expect.objectContaining({ id: "monster-hasten-effect", label: "Hasten Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", recharge: "5-6" }) })
      ])
    );
    const cloakerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cloaker",
      data: dnd5eSrdMonsterActorData("cloaker")!
    };
    expect(cloakerActor.data).toEqual(expect.objectContaining({ hp: { current: 91, max: 91 }, armorClass: 14, challengeRating: "8", xp: 3900, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(cloakerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-attach-attack", label: "Attach Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-attach-damage", label: "Attach Damage", formula: "3d6+3", metadata: expect.objectContaining({ condition: "Blinded" }) }),
        { id: "monster-tail-damage", label: "Tail Damage", formula: "1d10+3" },
        expect.objectContaining({ id: "monster-moan-effect", label: "Moan Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", condition: "Frightened" }) }),
        expect.objectContaining({ id: "monster-phantasms-effect", label: "Phantasms Effect", formula: "0" })
      ])
    );
    const cloudGiantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cloud Giant",
      data: dnd5eSrdMonsterActorData("cloud-giant")!
    };
    expect(cloudGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 200, max: 200 }, armorClass: 14, challengeRating: "9", xp: 5000, skillProficiencies: ["insight", "perception"] }));
    expect(dnd5eSrdSheet(cloudGiantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-thunderous-mace-attack", label: "Thunderous Mace Attack", formula: "1d20+12" },
        expect.objectContaining({ id: "monster-thunderous-mace-damage", label: "Thunderous Mace Damage", formula: "3d8+8+2d6" }),
        { id: "monster-thundercloud-attack", label: "Thundercloud Attack", formula: "1d20+12" },
        expect.objectContaining({ id: "monster-thundercloud-damage", label: "Thundercloud Damage", formula: "3d6+8", metadata: expect.objectContaining({ condition: "Incapacitated" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-misty-step-effect", label: "Misty Step Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })
      ])
    );
    const commonerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Commoner",
      data: dnd5eSrdMonsterActorData("commoner")!
    };
    expect(commonerActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 10, challengeRating: "0", xp: 10, skillProficiencies: [] }));
    expect(dnd5eSrdSheet(commonerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-club-attack", label: "Club Attack", formula: "1d20+2" },
        { id: "monster-club-damage", label: "Club Damage", formula: "1d4" }
      ])
    );
    const crawlingClawsActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Swarm of Crawling Claws",
      data: dnd5eSrdMonsterActorData("swarm-of-crawling-claws")!
    };
    expect(crawlingClawsActor.data).toEqual(expect.objectContaining({ hp: { current: 49, max: 49 }, armorClass: 12, challengeRating: "3", xp: 700, skillProficiencies: [] }));
    expect(dnd5eSrdSheet(crawlingClawsActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-swarm-of-grasping-hands-attack", label: "Swarm of Grasping Hands Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-swarm-of-grasping-hands-damage", label: "Swarm of Grasping Hands Damage", formula: "4d8+2", metadata: expect.objectContaining({ condition: "Prone" }) })
      ])
    );
    const cultistActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cultist",
      data: dnd5eSrdMonsterActorData("cultist")!
    };
    expect(cultistActor.data).toEqual(expect.objectContaining({ hp: { current: 9, max: 9 }, armorClass: 12, challengeRating: "1/8", xp: 25, skillProficiencies: ["deception", "religion"] }));
    expect(dnd5eSrdSheet(cultistActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ritual-sickle-attack", label: "Ritual Sickle Attack", formula: "1d20+3" },
        { id: "monster-ritual-sickle-damage", label: "Ritual Sickle Damage", formula: "1d4+1+1" }
      ])
    );
    const cultistFanaticActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cultist Fanatic",
      data: dnd5eSrdMonsterActorData("cultist-fanatic")!
    };
    expect(cultistFanaticActor.data).toEqual(expect.objectContaining({ hp: { current: 44, max: 44 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["deception", "persuasion", "religion"] }));
    expect(dnd5eSrdSheet(cultistFanaticActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pact-blade-attack", label: "Pact Blade Attack", formula: "1d20+4" },
        { id: "monster-pact-blade-damage", label: "Pact Blade Damage", formula: "1d8+2+2d6" },
        { id: "monster-spellcasting-attack", label: "Spellcasting Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 12 } }) }),
        expect.objectContaining({ id: "monster-spiritual-weapon-effect", label: "Spiritual Weapon Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", recharge: "2/day" }) })
      ])
    );
    const constrictorSnakeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Constrictor Snake",
      data: dnd5eSrdMonsterActorData("constrictor-snake")!
    };
    expect(constrictorSnakeActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(constrictorSnakeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+2" },
        expect.objectContaining({ id: "monster-constrict-damage", label: "Constrict Damage", formula: "3d4", metadata: expect.objectContaining({ save: { ability: "strength", dc: 12 }, condition: "Grappled" }) })
      ])
    );
    const crabActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Crab",
      data: dnd5eSrdMonsterActorData("crab")!
    };
    expect(crabActor.data).toEqual(expect.objectContaining({ hp: { current: 3, max: 3 }, armorClass: 11, challengeRating: "0", xp: 10, skillProficiencies: ["stealth"] }));
    expect((crabActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]));
    expect(dnd5eSrdSheet(crabActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+2" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1" }
      ])
    );
    const crocodileActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Crocodile",
      data: dnd5eSrdMonsterActorData("crocodile")!
    };
    expect(crocodileActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 12, challengeRating: "1/2", xp: 100, skillProficiencies: ["stealth"] }));
    expect((crocodileActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]));
    expect(dnd5eSrdSheet(crocodileActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+2", metadata: expect.objectContaining({ condition: "Grappled/Restrained", summary: expect.stringContaining("Restrained") }) })
      ])
    );
    const darkmantleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Darkmantle",
      data: dnd5eSrdMonsterActorData("darkmantle")!
    };
    expect(darkmantleActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 11, challengeRating: "1/2", xp: 100, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(darkmantleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-crush-attack", label: "Crush Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-crush-damage", label: "Crush Damage", formula: "1d6+3", metadata: expect.objectContaining({ condition: "Blinded/Suffocating" }) }),
        expect.objectContaining({ id: "monster-darkness-aura-effect", label: "Darkness Aura Effect", formula: "0", metadata: expect.objectContaining({ recharge: "1/day" }) })
      ])
    );
    const deathDogActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Death Dog",
      data: dnd5eSrdMonsterActorData("death-dog")!
    };
    expect(deathDogActor.data).toEqual(expect.objectContaining({ hp: { current: 39, max: 39 }, armorClass: 12, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect((deathDogActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]));
    expect(dnd5eSrdSheet(deathDogActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+2", metadata: expect.objectContaining({ condition: "Poisoned", save: { ability: "constitution", dc: 12 } }) })
      ])
    );
    const djinniActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Djinni",
      data: dnd5eSrdMonsterActorData("djinni")!
    };
    expect(djinniActor.data).toEqual(expect.objectContaining({ hp: { current: 218, max: 218 }, armorClass: 17, challengeRating: "11", xp: 7200, skillProficiencies: [] }));
    expect(dnd5eSrdSheet(djinniActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-storm-blade-attack", label: "Storm Blade Attack", formula: "1d20+9" },
        { id: "monster-storm-blade-damage", label: "Storm Blade Damage", formula: "2d6+5+2d6" },
        { id: "monster-storm-bolt-attack", label: "Storm Bolt Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-storm-bolt-damage", label: "Storm Bolt Damage", formula: "3d8", metadata: expect.objectContaining({ condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-create-whirlwind-damage", label: "Create Whirlwind Damage", formula: "6d6", metadata: expect.objectContaining({ save: { ability: "strength", dc: 17 }, condition: "Restrained" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "charisma", dc: 17 } }) })
      ])
    );
    const doppelgangerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Doppelganger",
      data: dnd5eSrdMonsterActorData("doppelganger")!
    };
    expect(doppelgangerActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 14, challengeRating: "3", xp: 700, skillProficiencies: ["deception", "insight"] }));
    expect(dnd5eSrdSheet(doppelgangerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-slam-damage", label: "Slam Damage", formula: "2d6+4" }),
        expect.objectContaining({ id: "monster-read-thoughts-effect", label: "Read Thoughts Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-unsettling-visage-effect", label: "Unsettling Visage Effect", formula: "0", metadata: expect.objectContaining({ condition: "Frightened", recharge: "6" }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" })
      ])
    );
    const dragonTurtleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Dragon Turtle",
      data: dnd5eSrdMonsterActorData("dragon-turtle")!
    };
    expect(dragonTurtleActor.data).toEqual(expect.objectContaining({ hp: { current: 356, max: 356 }, armorClass: 20, challengeRating: "17", xp: 18000 }));
    expect((dragonTurtleActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Resistance" })]));
    expect(dnd5eSrdSheet(dragonTurtleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+13" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "3d10+7+2d6", metadata: expect.objectContaining({ damageType: "piercing/fire" }) }),
        { id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+13" },
        expect.objectContaining({ id: "monster-tail-damage", label: "Tail Damage", formula: "2d10+7", metadata: expect.objectContaining({ condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-steam-breath-damage", label: "Steam Breath Damage", formula: "16d6", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 19, success: "half" }, recharge: "5-6" }) })
      ])
    );
    const driderActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Drider",
      data: dnd5eSrdMonsterActorData("drider")!
    };
    expect(driderActor.data).toEqual(expect.objectContaining({ hp: { current: 123, max: 123 }, armorClass: 19, challengeRating: "6", xp: 2300, skillProficiencies: ["perception", "stealth"] }));
    expect((driderActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Sunlight Sensitivity" }), expect.objectContaining({ name: "Web Walker" })]));
    expect(dnd5eSrdSheet(driderActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-foreleg-attack", label: "Foreleg Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-foreleg-damage", label: "Foreleg Damage", formula: "2d8+4" }),
        { id: "monster-poison-burst-attack", label: "Poison Burst Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-poison-burst-damage", label: "Poison Burst Damage", formula: "3d6+3" }),
        expect.objectContaining({ id: "monster-magic-of-the-spider-queen-effect", label: "Magic of the Spider Queen Effect", formula: "0", metadata: expect.objectContaining({ recharge: "5-6", save: { ability: "wisdom", dc: 14 } }) })
      ])
    );
    const druidMonsterActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Druid",
      data: dnd5eSrdMonsterActorData("druid")!
    };
    expect(druidMonsterActor.data).toEqual(expect.objectContaining({ hp: { current: 44, max: 44 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["medicine", "nature", "perception"] }));
    expect(dnd5eSrdSheet(druidMonsterActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-vine-staff-attack", label: "Vine Staff Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-vine-staff-damage", label: "Vine Staff Damage", formula: "1d8+3+1d4" }),
        { id: "monster-verdant-wisp-attack", label: "Verdant Wisp Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-verdant-wisp-damage", label: "Verdant Wisp Damage", formula: "3d6" }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 13 } }) })
      ])
    );
    const dryadActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Dryad",
      data: dnd5eSrdMonsterActorData("dryad")!
    };
    expect(dryadActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 16, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect((dryadActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Speak with Beasts and Plants" })]));
    expect(dnd5eSrdSheet(dryadActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-vine-lash-attack", label: "Vine Lash Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-vine-lash-damage", label: "Vine Lash Damage", formula: "1d8+4" }),
        { id: "monster-thorn-burst-attack", label: "Thorn Burst Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-thorn-burst-damage", label: "Thorn Burst Damage", formula: "1d6+4" }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "charisma", dc: 14 } }) }),
        expect.objectContaining({ id: "monster-tree-stride-effect", label: "Tree Stride Effect", formula: "0" })
      ])
    );
    const efreetiActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Efreeti",
      data: dnd5eSrdMonsterActorData("efreeti")!
    };
    expect(efreetiActor.data).toEqual(expect.objectContaining({ hp: { current: 212, max: 212 }, armorClass: 17, challengeRating: "11", xp: 7200 }));
    expect((efreetiActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" }), expect.objectContaining({ name: "Magic Resistance" }), expect.objectContaining({ name: "Wishes" })]));
    expect(dnd5eSrdSheet(efreetiActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-heated-blade-attack", label: "Heated Blade Attack", formula: "1d20+10" },
        expect.objectContaining({ id: "monster-heated-blade-damage", label: "Heated Blade Damage", formula: "2d6+6+2d12" }),
        { id: "monster-hurl-flame-attack", label: "Hurl Flame Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-hurl-flame-damage", label: "Hurl Flame Damage", formula: "7d6" }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "charisma", dc: 16 } }) })
      ])
    );
    const ettercapActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ettercap",
      data: dnd5eSrdMonsterActorData("ettercap")!
    };
    expect(ettercapActor.data).toEqual(expect.objectContaining({ hp: { current: 44, max: 44 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth", "survival"] }));
    expect((ettercapActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Web Walker" })]));
    expect(dnd5eSrdSheet(ettercapActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d6+2+1d4", metadata: expect.objectContaining({ condition: "Poisoned" }) }),
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-claw-damage", label: "Claw Damage", formula: "2d4+2" }),
        expect.objectContaining({ id: "monster-web-strand-effect", label: "Web Strand Effect", formula: "0", metadata: expect.objectContaining({ condition: "Restrained", recharge: "5-6", save: { ability: "dexterity", dc: 12 } }) }),
        expect.objectContaining({ id: "monster-reel-effect", label: "Reel Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })
      ])
    );
    const ettinActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ettin",
      data: dnd5eSrdMonsterActorData("ettin")!
    };
    expect(ettinActor.data).toEqual(expect.objectContaining({ hp: { current: 85, max: 85 }, armorClass: 12, challengeRating: "4", xp: 1100, skillProficiencies: ["perception"] }));
    expect((ettinActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Condition Immunities" })]));
    expect(dnd5eSrdSheet(ettinActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-battleaxe-attack", label: "Battleaxe Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-battleaxe-damage", label: "Battleaxe Damage", formula: "2d8+5", metadata: expect.objectContaining({ condition: "Prone" }) }),
        { id: "monster-morningstar-attack", label: "Morningstar Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-morningstar-damage", label: "Morningstar Damage", formula: "2d8+5", metadata: expect.objectContaining({ summary: expect.stringContaining("Disadvantage") }) })
      ])
    );
    const fleshGolemActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Flesh Golem",
      data: dnd5eSrdMonsterActorData("flesh-golem")!
    };
    expect(fleshGolemActor.data).toEqual(expect.objectContaining({ hp: { current: 127, max: 127 }, armorClass: 9, challengeRating: "5", xp: 1800 }));
    expect((fleshGolemActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Lightning and Poison Immunity" }), expect.objectContaining({ name: "Aversion to Fire" }), expect.objectContaining({ name: "Berserk" }), expect.objectContaining({ name: "Lightning Absorption" }), expect.objectContaining({ name: "Magic Resistance" })]));
    expect(dnd5eSrdSheet(fleshGolemActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-slam-damage", label: "Slam Damage", formula: "2d8+4+1d8", metadata: expect.objectContaining({ damageType: "bludgeoning/lightning" }) })
      ])
    );
    const frostGiantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Frost Giant",
      data: dnd5eSrdMonsterActorData("frost-giant")!
    };
    expect(frostGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 149, max: 149 }, armorClass: 15, challengeRating: "8", xp: 3900, skillProficiencies: ["athletics", "perception"] }));
    expect((frostGiantActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cold Immunity" })]));
    expect(dnd5eSrdSheet(frostGiantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-frost-axe-attack", label: "Frost Axe Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-frost-axe-damage", label: "Frost Axe Damage", formula: "2d12+6+2d8", metadata: expect.objectContaining({ damageType: "slashing/cold" }) }),
        { id: "monster-great-bow-attack", label: "Great Bow Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-great-bow-damage", label: "Great Bow Damage", formula: "2d10+6+2d6", metadata: expect.objectContaining({ damageType: "piercing/cold", summary: expect.stringContaining("Speed decreases") }) }),
        expect.objectContaining({ id: "monster-war-cry-effect", label: "War Cry Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", recharge: "5-6" }) })
      ])
    );
    const fireGiantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Fire Giant",
      data: dnd5eSrdMonsterActorData("fire-giant")!
    };
    expect(fireGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 162, max: 162 }, armorClass: 18, challengeRating: "9", xp: 5000, skillProficiencies: ["athletics", "perception"] }));
    expect((fireGiantActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fire Immunity" })]));
    expect(dnd5eSrdSheet(fireGiantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-flame-sword-attack", label: "Flame Sword Attack", formula: "1d20+11" },
        { id: "monster-flame-sword-damage", label: "Flame Sword Damage", formula: "4d6+7+3d6" },
        { id: "monster-hammer-throw-attack", label: "Hammer Throw Attack", formula: "1d20+11" },
        expect.objectContaining({ id: "monster-hammer-throw-damage", label: "Hammer Throw Damage", formula: "3d10+7+1d8", metadata: expect.objectContaining({ damageType: "bludgeoning/fire" }) })
      ])
    );
    const shriekerFungusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Shrieker Fungus",
      data: dnd5eSrdMonsterActorData("shrieker-fungus")!
    };
    expect(shriekerFungusActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 5, challengeRating: "0", xp: 0 }));
    expect((shriekerFungusActor.data.monster as { statBlock: { traits: Array<{ name: string }>; senses: string[] } }).statBlock.senses).toEqual(expect.arrayContaining(["Blindsight 30 ft."]));
    expect(dnd5eSrdSheet(shriekerFungusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-shriek-effect", label: "Shriek Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })
      ])
    );
    const violetFungusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Violet Fungus",
      data: dnd5eSrdMonsterActorData("violet-fungus")!
    };
    expect(violetFungusActor.data).toEqual(expect.objectContaining({ hp: { current: 18, max: 18 }, armorClass: 5, challengeRating: "1/4", xp: 50 }));
    expect((violetFungusActor.data.monster as { statBlock: { senses: string[] } }).statBlock.senses).toEqual(expect.arrayContaining(["Blindsight 30 ft."]));
    expect(dnd5eSrdSheet(violetFungusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rotting-touch-attack", label: "Rotting Touch Attack", formula: "1d20+2" },
        { id: "monster-rotting-touch-damage", label: "Rotting Touch Damage", formula: "1d8" }
      ])
    );
    const gargoyleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gargoyle",
      data: dnd5eSrdMonsterActorData("gargoyle")!
    };
    expect(gargoyleActor.data).toEqual(expect.objectContaining({ hp: { current: 67, max: 67 }, armorClass: 15, challengeRating: "2", xp: 450, skillProficiencies: ["stealth"] }));
    expect((gargoyleActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flyby" }), expect.objectContaining({ name: "Poison Immunity" })]));
    expect(dnd5eSrdSheet(gargoyleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+4" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "2d4+2" }
      ])
    );
    const deerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Deer",
      data: dnd5eSrdMonsterActorData("deer")!
    };
    expect(deerActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 13, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect((deerActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Agile" })]));
    expect(dnd5eSrdSheet(deerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+2" },
        { id: "monster-ram-damage", label: "Ram Damage", formula: "1d4" }
      ])
    );
    const draftHorseActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Draft Horse",
      data: dnd5eSrdMonsterActorData("draft-horse")!
    };
    expect(draftHorseActor.data).toEqual(expect.objectContaining({ hp: { current: 15, max: 15 }, armorClass: 10, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(draftHorseActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+6" },
        { id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d4+4" }
      ])
    );
    const eagleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Eagle",
      data: dnd5eSrdMonsterActorData("eagle")!
    };
    expect(eagleActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(eagleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-talons-attack", label: "Talons Attack", formula: "1d20+4" },
        { id: "monster-talons-damage", label: "Talons Damage", formula: "1d4+2" }
      ])
    );
    const elephantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Elephant",
      data: dnd5eSrdMonsterActorData("elephant")!
    };
    expect(elephantActor.data).toEqual(expect.objectContaining({ hp: { current: 76, max: 76 }, armorClass: 12, challengeRating: "4", xp: 1100 }));
    expect(dnd5eSrdSheet(elephantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d8+6", metadata: expect.objectContaining({ condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-trample-damage", label: "Trample Damage", formula: "2d10+6", metadata: expect.objectContaining({ action: "bonusAction", save: { ability: "dexterity", dc: 16, success: "half" } }) })
      ])
    );
    const elkActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Elk",
      data: dnd5eSrdMonsterActorData("elk")!
    };
    expect(elkActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 10, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(elkActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "1d6+3", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("extra 1d6") }) })
      ])
    );
    const flyingSnakeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Flying Snake",
      data: dnd5eSrdMonsterActorData("flying-snake")!
    };
    expect(flyingSnakeActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 14, challengeRating: "1/8", xp: 25 }));
    expect((flyingSnakeActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]));
    expect(dnd5eSrdSheet(flyingSnakeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1+2d4", metadata: expect.objectContaining({ damageType: "piercing/poison" }) })
      ])
    );
    const frogActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Frog",
      data: dnd5eSrdMonsterActorData("frog")!
    };
    expect(frogActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 11, challengeRating: "0", xp: 10, skillProficiencies: ["perception", "stealth"] }));
    expect((frogActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]));
    expect(dnd5eSrdSheet(frogActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+3" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    const giantBadgerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Badger",
      data: dnd5eSrdMonsterActorData("giant-badger")!
    };
    expect(giantBadgerActor.data).toEqual(expect.objectContaining({ hp: { current: 15, max: 15 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception"] }));
    expect((giantBadgerActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Poison Resistance" })]));
    expect(dnd5eSrdSheet(giantBadgerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+3" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d4+1" }
      ])
    );
    const giantBatActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Bat",
      data: dnd5eSrdMonsterActorData("giant-bat")!
    };
    expect(giantBatActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 13, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(giantBatActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d6+3" }
      ])
    );
    const giantBoarActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Boar",
      data: dnd5eSrdMonsterActorData("giant-boar")!
    };
    expect(giantBoarActor.data).toEqual(expect.objectContaining({ hp: { current: 42, max: 42 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect((giantBoarActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Bloodied Fury" })]));
    expect(dnd5eSrdSheet(giantBoarActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("extra 2d6") }) })
      ])
    );
    const giantCentipedeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Centipede",
      data: dnd5eSrdMonsterActorData("giant-centipede")!
    };
    expect(giantCentipedeActor.data).toEqual(expect.objectContaining({ hp: { current: 9, max: 9 }, armorClass: 14, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(giantCentipedeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+2", metadata: expect.objectContaining({ condition: "Poisoned" }) })
      ])
    );
    const giantConstrictorSnakeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Constrictor Snake",
      data: dnd5eSrdMonsterActorData("giant-constrictor-snake")!
    };
    expect(giantConstrictorSnakeActor.data).toEqual(expect.objectContaining({ hp: { current: 60, max: 60 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(giantConstrictorSnakeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+4" },
        expect.objectContaining({ id: "monster-constrict-damage", label: "Constrict Damage", formula: "2d8+4", metadata: expect.objectContaining({ condition: "Grappled", save: { ability: "strength", dc: 14 } }) })
      ])
    );
    const giantCrabActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Crab",
      data: dnd5eSrdMonsterActorData("giant-crab")!
    };
    expect(giantCrabActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 15, challengeRating: "1/8", xp: 25, skillProficiencies: ["stealth"] }));
    expect((giantCrabActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })]));
    expect(dnd5eSrdSheet(giantCrabActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-claw-damage", label: "Claw Damage", formula: "1d6+1", metadata: expect.objectContaining({ condition: "Grappled" }) })
      ])
    );
    const giantCrocodileActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Crocodile",
      data: dnd5eSrdMonsterActorData("giant-crocodile")!
    };
    expect(giantCrocodileActor.data).toEqual(expect.objectContaining({ hp: { current: 85, max: 85 }, armorClass: 14, challengeRating: "5", xp: 1800, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(giantCrocodileActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "3d10+5", metadata: expect.objectContaining({ condition: "Grappled/Restrained" }) }),
        { id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-tail-damage", label: "Tail Damage", formula: "3d8+5", metadata: expect.objectContaining({ condition: "Prone" }) })
      ])
    );
    const giantElkActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Elk",
      data: dnd5eSrdMonsterActorData("giant-elk")!
    };
    expect(giantElkActor.data).toEqual(expect.objectContaining({ hp: { current: 42, max: 42 }, armorClass: 14, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect((giantElkActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Radiant and Necrotic Resistance" })]));
    expect(dnd5eSrdSheet(giantElkActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "2d6+4+2d4", metadata: expect.objectContaining({ condition: "Prone", damageType: "bludgeoning/radiant" }) })
      ])
    );
    const giantFireBeetleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Fire Beetle",
      data: dnd5eSrdMonsterActorData("giant-fire-beetle")!
    };
    expect(giantFireBeetleActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 13, challengeRating: "0", xp: 10 }));
    expect((giantFireBeetleActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fire Resistance" }), expect.objectContaining({ name: "Illumination" })]));
    expect(dnd5eSrdSheet(giantFireBeetleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+1" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    const giantFrogActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Frog",
      data: dnd5eSrdMonsterActorData("giant-frog")!
    };
    expect(giantFrogActor.data).toEqual(expect.objectContaining({ hp: { current: 18, max: 18 }, armorClass: 11, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect((giantFrogActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]));
    expect(dnd5eSrdSheet(giantFrogActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d6+2", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        expect.objectContaining({ id: "monster-swallow-damage", label: "Swallow Damage", formula: "2d4", metadata: expect.objectContaining({ condition: "Blinded/Restrained/Prone", damageType: "acid" }) })
      ])
    );
    const giantGoatActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Goat",
      data: dnd5eSrdMonsterActorData("giant-goat")!
    };
    expect(giantGoatActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 11, challengeRating: "1/2", xp: 100, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(giantGoatActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "1d6+3+2d4", metadata: expect.objectContaining({ condition: "Prone" }) })
      ])
    );
    const giantHyenaActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Hyena",
      data: dnd5eSrdMonsterActorData("giant-hyena")!
    };
    expect(giantHyenaActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 12, challengeRating: "1", xp: 200, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(giantHyenaActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+3" },
        expect.objectContaining({ id: "monster-rampage-effect", label: "Rampage Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", effectType: "utility" }) })
      ])
    );
    const giantLizardActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Lizard",
      data: dnd5eSrdMonsterActorData("giant-lizard")!
    };
    expect(giantLizardActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 12, challengeRating: "1/4", xp: 50 }));
    expect((giantLizardActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]));
    expect(dnd5eSrdSheet(giantLizardActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+2" }
      ])
    );
    const giantOctopusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Octopus",
      data: dnd5eSrdMonsterActorData("giant-octopus")!
    };
    expect(giantOctopusActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 11, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect((giantOctopusActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(giantOctopusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-tentacles-attack", label: "Tentacles Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-tentacles-damage", label: "Tentacles Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Grappled/Restrained" }) }),
        expect.objectContaining({ id: "monster-ink-cloud-effect", label: "Ink Cloud Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction", recharge: "1/day" }) })
      ])
    );
    const giantOwlActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Owl",
      data: dnd5eSrdMonsterActorData("giant-owl")!
    };
    expect(giantOwlActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 12, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect((giantOwlActor.data.monster as { statBlock: { creatureType: string; traits: Array<{ name: string }> } }).statBlock).toEqual(expect.objectContaining({ creatureType: "Celestial", traits: expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]) }));
    expect(dnd5eSrdSheet(giantOwlActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-talons-attack", label: "Talons Attack", formula: "1d20+4" },
        { id: "monster-talons-damage", label: "Talons Damage", formula: "1d10+2" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ action: "action", effectType: "utility" }) })
      ])
    );
    const giantScorpionActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Scorpion",
      data: dnd5eSrdMonsterActorData("giant-scorpion")!
    };
    expect(giantScorpionActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 15, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(giantScorpionActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-claw-damage", label: "Claw Damage", formula: "1d6+3", metadata: expect.objectContaining({ condition: "Grappled" }) }),
        { id: "monster-sting-attack", label: "Sting Attack", formula: "1d20+5" },
        { id: "monster-sting-damage", label: "Sting Damage", formula: "1d8+3+2d10" }
      ])
    );
    const giantSeahorseActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Seahorse",
      data: dnd5eSrdMonsterActorData("giant-seahorse")!
    };
    expect(giantSeahorseActor.data).toEqual(expect.objectContaining({ hp: { current: 16, max: 16 }, armorClass: 14, challengeRating: "1/2", xp: 100 }));
    expect((giantSeahorseActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(giantSeahorseActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "2d6+2" }),
        expect.objectContaining({ id: "monster-bubble-dash-effect", label: "Bubble Dash Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", effectType: "utility" }) })
      ])
    );
    const giantSharkActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Shark",
      data: dnd5eSrdMonsterActorData("giant-shark")!
    };
    expect(giantSharkActor.data).toEqual(expect.objectContaining({ hp: { current: 92, max: 92 }, armorClass: 13, challengeRating: "5", xp: 1800, skillProficiencies: ["perception"] }));
    expect((giantSharkActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(giantSharkActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "3d10+6" })
      ])
    );
    const giantToadActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Toad",
      data: dnd5eSrdMonsterActorData("giant-toad")!
    };
    expect(giantToadActor.data).toEqual(expect.objectContaining({ hp: { current: 39, max: 39 }, armorClass: 11, challengeRating: "1", xp: 200 }));
    expect((giantToadActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Standing Leap" })]));
    expect(dnd5eSrdSheet(giantToadActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d6+2+2d4" }),
        expect.objectContaining({ id: "monster-swallow-damage", label: "Swallow Damage", formula: "3d6", metadata: expect.objectContaining({ action: "action", damageType: "acid", condition: "Blinded/Restrained/Prone" }) })
      ])
    );
    const giantVenomousSnakeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Venomous Snake",
      data: dnd5eSrdMonsterActorData("giant-venomous-snake")!
    };
    expect(giantVenomousSnakeActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 14, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(giantVenomousSnakeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+4+1d8" }
      ])
    );
    const giantVultureActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Vulture",
      data: dnd5eSrdMonsterActorData("giant-vulture")!
    };
    expect(giantVultureActor.data).toEqual(expect.objectContaining({ hp: { current: 25, max: 25 }, armorClass: 10, challengeRating: "1", xp: 200, skillProficiencies: ["perception"] }));
    expect((giantVultureActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Necrotic Resistance" }), expect.objectContaining({ name: "Pack Tactics" })]));
    expect(dnd5eSrdSheet(giantVultureActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gouge-attack", label: "Gouge Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-gouge-damage", label: "Gouge Damage", formula: "2d6+2" })
      ])
    );
    const giantWaspActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Wasp",
      data: dnd5eSrdMonsterActorData("giant-wasp")!
    };
    expect(giantWaspActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 13, challengeRating: "1/2", xp: 100 }));
    expect((giantWaspActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]));
    expect(dnd5eSrdSheet(giantWaspActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-sting-attack", label: "Sting Attack", formula: "1d20+4" },
        { id: "monster-sting-damage", label: "Sting Damage", formula: "1d6+2+2d4" }
      ])
    );
    const giantWeaselActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Weasel",
      data: dnd5eSrdMonsterActorData("giant-weasel")!
    };
    expect(giantWeaselActor.data).toEqual(expect.objectContaining({ hp: { current: 9, max: 9 }, armorClass: 13, challengeRating: "1/8", xp: 25, skillProficiencies: ["acrobatics", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(giantWeaselActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+3" }
      ])
    );
    const giantWolfSpiderActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Wolf Spider",
      data: dnd5eSrdMonsterActorData("giant-wolf-spider")!
    };
    expect(giantWolfSpiderActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect((giantWolfSpiderActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]));
    expect(dnd5eSrdSheet(giantWolfSpiderActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+3+2d4" }
      ])
    );
    const goatActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Goat",
      data: dnd5eSrdMonsterActorData("goat")!
    };
    expect(goatActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 10, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(goatActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ram-attack", label: "Ram Attack", formula: "1d20+2" },
        expect.objectContaining({ id: "monster-ram-damage", label: "Ram Damage", formula: "1", metadata: expect.objectContaining({ summary: expect.stringContaining("1d4") }) })
      ])
    );
    const hawkActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Hawk",
      data: dnd5eSrdMonsterActorData("hawk")!
    };
    expect(hawkActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 13, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hawkActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-talons-attack", label: "Talons Attack", formula: "1d20+5" },
        { id: "monster-talons-damage", label: "Talons Damage", formula: "1" }
      ])
    );
    const jackalActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Jackal",
      data: dnd5eSrdMonsterActorData("jackal")!
    };
    expect(jackalActor.data).toEqual(expect.objectContaining({ hp: { current: 3, max: 3 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(jackalActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+1" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4-1" }
      ])
    );
    const killerWhaleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Killer Whale",
      data: dnd5eSrdMonsterActorData("killer-whale")!
    };
    expect(killerWhaleActor.data).toEqual(expect.objectContaining({ hp: { current: 90, max: 90 }, armorClass: 12, challengeRating: "3", xp: 700, skillProficiencies: ["perception", "stealth"] }));
    expect((killerWhaleActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]));
    expect(dnd5eSrdSheet(killerWhaleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "5d6+4" }
      ])
    );
    const lionActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Lion",
      data: dnd5eSrdMonsterActorData("lion")!
    };
    expect(lionActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 12, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect((lionActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" }), expect.objectContaining({ name: "Running Leap" })]));
    expect(dnd5eSrdSheet(lionActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+3" },
        expect.objectContaining({ id: "monster-roar-effect", label: "Roar Effect", formula: "0", metadata: expect.objectContaining({ action: "action", range: "15 ft.", save: { ability: "wisdom", dc: 11 }, condition: "Frightened" }) })
      ])
    );
    const lizardActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Lizard",
      data: dnd5eSrdMonsterActorData("lizard")!
    };
    expect(lizardActor.data).toEqual(expect.objectContaining({ hp: { current: 2, max: 2 }, armorClass: 10, challengeRating: "0", xp: 10 }));
    expect((lizardActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" })]));
    expect(dnd5eSrdSheet(lizardActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+2" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    const ghostActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ghost",
      data: dnd5eSrdMonsterActorData("ghost")!
    };
    expect(ghostActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 11, challengeRating: "4", xp: 1100 }));
    expect((ghostActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Incorporeal Movement" })]));
    expect(dnd5eSrdSheet(ghostActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-withering-touch-attack", label: "Withering Touch Attack", formula: "1d20+5" },
        { id: "monster-withering-touch-damage", label: "Withering Touch Damage", formula: "3d10+3" },
        expect.objectContaining({ id: "monster-etherealness-effect", label: "Etherealness Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-horrific-visage-damage", label: "Horrific Visage Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Frightened" }) }),
        expect.objectContaining({ id: "monster-possession-effect", label: "Possession Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Possessed" }) })
      ])
    );
    const gibberingMoutherActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gibbering Mouther",
      data: dnd5eSrdMonsterActorData("gibbering-mouther")!
    };
    expect(gibberingMoutherActor.data).toEqual(expect.objectContaining({ hp: { current: 67, max: 67 }, armorClass: 9, challengeRating: "2", xp: 450 }));
    expect((gibberingMoutherActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Aberrant Ground" }), expect.objectContaining({ name: "Gibbering" })]));
    expect(dnd5eSrdSheet(gibberingMoutherActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+2" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "4d6" },
        expect.objectContaining({ id: "monster-blinding-spittle-effect", label: "Blinding Spittle Effect", formula: "0", metadata: expect.objectContaining({ action: "action", range: "15-foot cone", save: { ability: "dexterity", dc: 13 }, condition: "Blinded", recharge: "5-6" }) })
      ])
    );
    const glabrezuActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Glabrezu",
      data: dnd5eSrdMonsterActorData("glabrezu")!
    };
    expect(glabrezuActor.data).toEqual(expect.objectContaining({ hp: { current: 157, max: 157 }, armorClass: 17, challengeRating: "9", xp: 5000, skillProficiencies: ["perception"] }));
    expect((glabrezuActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Magic Resistance" })]));
    expect(dnd5eSrdSheet(glabrezuActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pincer-attack", label: "Pincer Attack", formula: "1d20+9" },
        expect.objectContaining({ id: "monster-pincer-damage", label: "Pincer Damage", formula: "2d10+5" }),
        { id: "monster-fist-attack", label: "Fist Attack", formula: "1d20+9" },
        { id: "monster-fist-damage", label: "Fist Damage", formula: "2d4+5" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ action: "action", effectType: "utility" }) })
      ])
    );
    const gladiatorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gladiator",
      data: dnd5eSrdMonsterActorData("gladiator")!
    };
    expect(gladiatorActor.data).toEqual(expect.objectContaining({ hp: { current: 112, max: 112 }, armorClass: 16, challengeRating: "5", xp: 1800, skillProficiencies: ["athletics", "intimidation"] }));
    expect(dnd5eSrdSheet(gladiatorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-spear-attack", label: "Spear Attack", formula: "1d20+7" },
        { id: "monster-spear-damage", label: "Spear Damage", formula: "2d6+4" },
        expect.objectContaining({ id: "monster-shield-bash-damage", label: "Shield Bash Damage", formula: "2d4+4", metadata: expect.objectContaining({ save: { ability: "strength", dc: 15 }, condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-parry-effect", label: "Parry Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction", effectType: "utility" }) })
      ])
    );
    const gnollWarriorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gnoll Warrior",
      data: dnd5eSrdMonsterActorData("gnoll-warrior")!
    };
    expect(gnollWarriorActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 15, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(gnollWarriorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-spear-attack", label: "Spear Attack", formula: "1d20+4" },
        { id: "monster-spear-damage", label: "Spear Damage", formula: "1d8+2" },
        { id: "monster-longbow-attack", label: "Longbow Attack", formula: "1d20+3" },
        { id: "monster-longbow-damage", label: "Longbow Damage", formula: "1d8+1" }
      ])
    );
    const goldDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gold Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("gold-dragon-wyrmling")!
    };
    expect(goldDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 60, max: 60 }, armorClass: 17, challengeRating: "3", xp: 700, skillProficiencies: ["perception", "stealth"] }));
    expect((goldDragonWyrmlingActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Immunity" })]));
    expect(dnd5eSrdSheet(goldDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d10+4" },
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "7d6", metadata: expect.objectContaining({ action: "action", damageType: "fire", save: { ability: "dexterity", dc: 13, success: "half" }, recharge: "5-6" }) })
      ])
    );
    const youngGoldDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Gold Dragon",
      data: dnd5eSrdMonsterActorData("young-gold-dragon")!
    };
    expect(youngGoldDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 178, max: 178 }, armorClass: 18, challengeRating: "10", xp: 5900, skillProficiencies: ["insight", "perception", "persuasion", "stealth"] }));
    expect((youngGoldDragonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Fire Immunity" })]));
    expect(dnd5eSrdSheet(youngGoldDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+7" },
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "10d6", metadata: expect.objectContaining({ action: "action", damageType: "fire", save: { ability: "dexterity", dc: 17, success: "half" }, recharge: "5-6" }) })
      ])
    );
    const adultGoldDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Gold Dragon",
      data: dnd5eSrdMonsterActorData("adult-gold-dragon")!
    };
    expect(adultGoldDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 243, max: 243 }, armorClass: 19, challengeRating: "17", xp: 18000, skillProficiencies: ["insight", "perception", "persuasion", "stealth"] }));
    expect((adultGoldDragonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]));
    expect(dnd5eSrdSheet(adultGoldDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+14" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+8+1d8" }),
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "12d10", metadata: expect.objectContaining({ damageType: "fire", save: { ability: "dexterity", dc: 21, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-weakening-breath-effect", label: "Weakening Breath Effect", formula: "0", metadata: expect.objectContaining({ action: "action", condition: "Weakened", save: { ability: "strength", dc: 21 } }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const ancientGoldDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Gold Dragon",
      data: dnd5eSrdMonsterActorData("ancient-gold-dragon")!
    };
    expect(ancientGoldDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 546, max: 546 }, armorClass: 22, challengeRating: "24", xp: 62000, skillProficiencies: ["insight", "perception", "persuasion", "stealth"] }));
    expect((ancientGoldDragonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Fire Immunity" })]));
    expect(dnd5eSrdSheet(ancientGoldDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+17" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+10+2d8" }),
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "13d10", metadata: expect.objectContaining({ damageType: "fire", save: { ability: "dexterity", dc: 24, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-weakening-breath-effect", label: "Weakening Breath Effect", formula: "0", metadata: expect.objectContaining({ action: "action", condition: "Weakened", save: { ability: "strength", dc: 24 } }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const gorgonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gorgon",
      data: dnd5eSrdMonsterActorData("gorgon")!
    };
    expect(gorgonActor.data).toEqual(expect.objectContaining({ hp: { current: 114, max: 114 }, armorClass: 19, challengeRating: "5", xp: 1800, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(gorgonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d12+5" }),
        expect.objectContaining({ id: "monster-petrifying-breath-effect", label: "Petrifying Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Restrained/Petrified", recharge: "5-6", save: { ability: "constitution", dc: 15 } }) }),
        expect.objectContaining({ id: "monster-trample-damage", label: "Trample Damage", formula: "2d10+5", metadata: expect.objectContaining({ action: "bonusAction", save: { ability: "dexterity", dc: 16, success: "half" } }) })
      ])
    );
    const grayOozeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gray Ooze",
      data: dnd5eSrdMonsterActorData("gray-ooze")!
    };
    expect(grayOozeActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 9, challengeRating: "1/2", xp: 100, skillProficiencies: ["stealth"] }));
    expect((grayOozeActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amorphous" }), expect.objectContaining({ name: "Corrosive Form" })]));
    expect(dnd5eSrdSheet(grayOozeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pseudopod-attack", label: "Pseudopod Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-pseudopod-damage", label: "Pseudopod Damage", formula: "2d8+1" })
      ])
    );
    const greenHagActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Green Hag",
      data: dnd5eSrdMonsterActorData("green-hag")!
    };
    expect(greenHagActor.data).toEqual(expect.objectContaining({ hp: { current: 82, max: 82 }, armorClass: 17, challengeRating: "3", xp: 700, skillProficiencies: ["arcana", "deception", "perception", "stealth"] }));
    expect((greenHagActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Coven Magic" }), expect.objectContaining({ name: "Mimicry" })]));
    expect(dnd5eSrdSheet(greenHagActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+6" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1d8+4+1d6" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "action" }) })
      ])
    );
    const grickActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Grick",
      data: dnd5eSrdMonsterActorData("grick")!
    };
    expect(grickActor.data).toEqual(expect.objectContaining({ hp: { current: 54, max: 54 }, armorClass: 14, challengeRating: "2", xp: 450, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(grickActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-beak-damage", label: "Beak Damage", formula: "2d6+2" }),
        { id: "monster-tentacles-attack", label: "Tentacles Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-tentacles-damage", label: "Tentacles Damage", formula: "1d10+2", metadata: expect.objectContaining({ condition: "Grappled" }) })
      ])
    );
    const griffonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Griffon",
      data: dnd5eSrdMonsterActorData("griffon")!
    };
    expect(griffonActor.data).toEqual(expect.objectContaining({ hp: { current: 59, max: 59 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(griffonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+4", metadata: expect.objectContaining({ condition: "Grappled" }) })
      ])
    );
    const grimlockActor: Actor = { ...srdActor, type: "monster", name: "Grimlock", data: dnd5eSrdMonsterActorData("grimlock")! };
    expect(grimlockActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 11, challengeRating: "1/4", xp: 50, skillProficiencies: ["athletics", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(grimlockActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bone-cudgel-attack", label: "Bone Cudgel Attack", formula: "1d20+5" }, { id: "monster-bone-cudgel-damage", label: "Bone Cudgel Damage", formula: "1d6+3+1d4" }]));
    const guardianNagaActor: Actor = { ...srdActor, type: "monster", name: "Guardian Naga", data: dnd5eSrdMonsterActorData("guardian-naga")! };
    expect(guardianNagaActor.data).toEqual(expect.objectContaining({ hp: { current: 136, max: 136 }, armorClass: 18, challengeRating: "10", xp: 5900, skillProficiencies: ["arcana", "history", "religion"] }));
    expect(dnd5eSrdSheet(guardianNagaActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+8" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d12+4+4d10" }), expect.objectContaining({ id: "monster-poisonous-spittle-damage", label: "Poisonous Spittle Damage", formula: "7d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 16, success: "half" }, condition: "Blinded" }) }), expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" })]));
    const halfDragonActor: Actor = { ...srdActor, type: "monster", name: "Half-Dragon", data: dnd5eSrdMonsterActorData("half-dragon")! };
    expect(halfDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 105, max: 105 }, armorClass: 18, challengeRating: "5", xp: 1800, skillProficiencies: ["athletics", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(halfDragonActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+7" }, expect.objectContaining({ id: "monster-claw-damage", label: "Claw Damage", formula: "1d4+4+2d6" }), expect.objectContaining({ id: "monster-dragon-s-breath-damage", label: "Dragon's Breath Damage", formula: "8d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }) }), expect.objectContaining({ id: "monster-leap-effect", label: "Leap Effect", formula: "0" })]));
    const harpyActor: Actor = { ...srdActor, type: "monster", name: "Harpy", data: dnd5eSrdMonsterActorData("harpy")! };
    expect(dnd5eSrdSheet(harpyActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+3" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "2d4+1" }, expect.objectContaining({ id: "monster-luring-song-effect", label: "Luring Song Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 11 }, condition: "Charmed/Incapacitated" }) })]));
    const hellHoundActor: Actor = { ...srdActor, type: "monster", name: "Hell Hound", data: dnd5eSrdMonsterActorData("hell-hound")! };
    expect(hellHoundActor.data).toEqual(expect.objectContaining({ hp: { current: 58, max: 58 }, armorClass: 15, challengeRating: "3", xp: 700, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hellHoundActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+3+1d6" }), expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "5d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "5-6" }) })]));
    const hezrouActor: Actor = { ...srdActor, type: "monster", name: "Hezrou", data: dnd5eSrdMonsterActorData("hezrou")! };
    expect(hezrouActor.data).toEqual(expect.objectContaining({ hp: { current: 157, max: 157 }, armorClass: 18, challengeRating: "8", xp: 3900 }));
    expect(dnd5eSrdSheet(hezrouActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" }, expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "1d4+4+2d8" }), expect.objectContaining({ id: "monster-leap-effect", label: "Leap Effect", formula: "0" })]));
    const hillGiantActor: Actor = { ...srdActor, type: "monster", name: "Hill Giant", data: dnd5eSrdMonsterActorData("hill-giant")! };
    expect(hillGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 105, max: 105 }, armorClass: 13, challengeRating: "5", xp: 1800, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hillGiantActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-tree-club-attack", label: "Tree Club Attack", formula: "1d20+8" }, expect.objectContaining({ id: "monster-tree-club-damage", label: "Tree Club Damage", formula: "3d8+5", metadata: expect.objectContaining({ condition: "Prone" }) }), { id: "monster-trash-lob-attack", label: "Trash Lob Attack", formula: "1d20+8" }, expect.objectContaining({ id: "monster-trash-lob-damage", label: "Trash Lob Damage", formula: "2d10+5", metadata: expect.objectContaining({ condition: "Poisoned" }) })]));
    const hippogriffActor: Actor = { ...srdActor, type: "monster", name: "Hippogriff", data: dnd5eSrdMonsterActorData("hippogriff")! };
    expect(hippogriffActor.data).toEqual(expect.objectContaining({ hp: { current: 26, max: 26 }, armorClass: 11, challengeRating: "1", xp: 200, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hippogriffActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" }, { id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+3" }]));
    const hippopotamusActor: Actor = { ...srdActor, type: "monster", name: "Hippopotamus", data: dnd5eSrdMonsterActorData("hippopotamus")! };
    expect(hippopotamusActor.data).toEqual(expect.objectContaining({ hp: { current: 82, max: 82 }, armorClass: 14, challengeRating: "4", xp: 1100, skillProficiencies: ["perception"] }));
    expect((hippopotamusActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Hold Breath" })]));
    expect(dnd5eSrdSheet(hippopotamusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+7" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "2d10+5" }]));
    const hobgoblinWarriorActor: Actor = { ...srdActor, type: "monster", name: "Hobgoblin Warrior", data: dnd5eSrdMonsterActorData("hobgoblin-warrior")! };
    expect(hobgoblinWarriorActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 18, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(hobgoblinWarriorActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-longsword-attack", label: "Longsword Attack", formula: "1d20+3" }, { id: "monster-longsword-damage", label: "Longsword Damage", formula: "2d10+1" }, { id: "monster-longbow-attack", label: "Longbow Attack", formula: "1d20+3" }, { id: "monster-longbow-damage", label: "Longbow Damage", formula: "1d8+1+3d4" }]));
    const homunculusActor: Actor = { ...srdActor, type: "monster", name: "Homunculus", data: dnd5eSrdMonsterActorData("homunculus")! };
    expect(homunculusActor.data).toEqual(expect.objectContaining({ hp: { current: 4, max: 4 }, armorClass: 13, challengeRating: "0", xp: 10 }));
    expect(dnd5eSrdSheet(homunculusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 12 }, condition: "Poisoned/Unconscious" }) })]));
    const hunterSharkActor: Actor = { ...srdActor, type: "monster", name: "Hunter Shark", data: dnd5eSrdMonsterActorData("hunter-shark")! };
    expect(hunterSharkActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hunterSharkActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "3d6+4", metadata: expect.objectContaining({ summary: expect.stringContaining("Advantage") }) })]));
    const hyenaActor: Actor = { ...srdActor, type: "monster", name: "Hyena", data: dnd5eSrdMonsterActorData("hyena")! };
    expect(hyenaActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 11, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(hyenaActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+2" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1d6" }]));
    const iceMephitActor: Actor = { ...srdActor, type: "monster", name: "Ice Mephit", data: dnd5eSrdMonsterActorData("ice-mephit")! };
    expect(iceMephitActor.data).toEqual(expect.objectContaining({ hp: { current: 21, max: 21 }, armorClass: 11, challengeRating: "1/2", xp: 100, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(iceMephitActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+3" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "1d4+1+1d4" }, expect.objectContaining({ id: "monster-fog-cloud-effect", label: "Fog Cloud Effect", formula: "0", metadata: expect.objectContaining({ action: "action", recharge: "1/day" }) }), expect.objectContaining({ id: "monster-frost-breath-damage", label: "Frost Breath Damage", formula: "3d4", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 10, success: "half" }, recharge: "6" }) })]));
    const magmaMephitActor: Actor = { ...srdActor, type: "monster", name: "Magma Mephit", data: dnd5eSrdMonsterActorData("magma-mephit")! };
    expect(magmaMephitActor.data).toEqual(expect.objectContaining({ hp: { current: 18, max: 18 }, armorClass: 11, challengeRating: "1/2", xp: 100, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(magmaMephitActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+3" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "1d4+1+1d6" }, expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "2d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "6" }) })]));
    const steamMephitActor: Actor = { ...srdActor, type: "monster", name: "Steam Mephit", data: dnd5eSrdMonsterActorData("steam-mephit")! };
    expect(steamMephitActor.data).toEqual(expect.objectContaining({ hp: { current: 17, max: 17 }, armorClass: 10, challengeRating: "1/4", xp: 50, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(steamMephitActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+2" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "1d4+1d4" }, expect.objectContaining({ id: "monster-steam-breath-damage", label: "Steam Breath Damage", formula: "2d4", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 10, success: "half" }, condition: "Slowed", recharge: "6" }) })]));
    const merfolkSkirmisherActor: Actor = { ...srdActor, type: "monster", name: "Merfolk Skirmisher", data: dnd5eSrdMonsterActorData("merfolk-skirmisher")! };
    expect(merfolkSkirmisherActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 11, challengeRating: "1/8", xp: 25 }));
    expect(dnd5eSrdSheet(merfolkSkirmisherActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-ocean-spear-attack", label: "Ocean Spear Attack", formula: "1d20+2" }, expect.objectContaining({ id: "monster-ocean-spear-damage", label: "Ocean Spear Damage", formula: "1d6+1d4", metadata: expect.objectContaining({ condition: "Slowed" }) })]));
    const merrowActor: Actor = { ...srdActor, type: "monster", name: "Merrow", data: dnd5eSrdMonsterActorData("merrow")! };
    expect(merrowActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(merrowActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+4", metadata: expect.objectContaining({ condition: "Poisoned" }) }), { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+6" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "2d4+4" }, { id: "monster-harpoon-attack", label: "Harpoon Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-harpoon-damage", label: "Harpoon Damage", formula: "2d6+4", metadata: expect.objectContaining({ summary: expect.stringContaining("pulls") }) })]));
    const mimicActor: Actor = { ...srdActor, type: "monster", name: "Mimic", data: dnd5eSrdMonsterActorData("mimic")! };
    expect(mimicActor.data).toEqual(expect.objectContaining({ hp: { current: 58, max: 58 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(mimicActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+3+1d8", metadata: expect.objectContaining({ summary: expect.stringContaining("Advantage") }) }), { id: "monster-pseudopod-attack", label: "Pseudopod Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-pseudopod-damage", label: "Pseudopod Damage", formula: "1d8+3+1d8", metadata: expect.objectContaining({ condition: "Grappled" }) }), expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const nalfeshneeActor: Actor = { ...srdActor, type: "monster", name: "Nalfeshnee", data: dnd5eSrdMonsterActorData("nalfeshnee")! };
    expect(nalfeshneeActor.data).toEqual(expect.objectContaining({ hp: { current: 184, max: 184 }, armorClass: 18, challengeRating: "13", xp: 10000 }));
    expect(dnd5eSrdSheet(nalfeshneeActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+10" }, { id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+5+2d10" }, expect.objectContaining({ id: "monster-teleport-effect", label: "Teleport Effect", formula: "0" }), expect.objectContaining({ id: "monster-horror-nimbus-damage", label: "Horror Nimbus Damage", formula: "8d6", metadata: expect.objectContaining({ action: "bonusAction", condition: "Frightened", recharge: "5-6" }) }), expect.objectContaining({ id: "monster-pursuit-effect", label: "Pursuit Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })]));
    const nightHagActor: Actor = { ...srdActor, type: "monster", name: "Night Hag", data: dnd5eSrdMonsterActorData("night-hag")! };
    expect(nightHagActor.data).toEqual(expect.objectContaining({ hp: { current: 112, max: 112 }, armorClass: 17, challengeRating: "5", xp: 1800, skillProficiencies: ["deception", "insight", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(nightHagActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+7" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "2d8+4" }, expect.objectContaining({ id: "monster-nightmare-haunting-effect", label: "Nightmare Haunting Effect", formula: "0", metadata: expect.objectContaining({ recharge: "1/day" }) }), expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }), expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const nightmareActor: Actor = { ...srdActor, type: "monster", name: "Nightmare", data: dnd5eSrdMonsterActorData("nightmare")! };
    expect(nightmareActor.data).toEqual(expect.objectContaining({ hp: { current: 68, max: 68 }, armorClass: 13, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(nightmareActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+6" }, { id: "monster-hooves-damage", label: "Hooves Damage", formula: "2d8+4+3d6" }, expect.objectContaining({ id: "monster-ethereal-stride-effect", label: "Ethereal Stride Effect", formula: "0" })]));
    const nobleActor: Actor = { ...srdActor, type: "monster", name: "Noble", data: dnd5eSrdMonsterActorData("noble")! };
    expect(nobleActor.data).toEqual(expect.objectContaining({ hp: { current: 9, max: 9 }, armorClass: 15, challengeRating: "1/8", xp: 25, skillProficiencies: ["deception", "insight", "persuasion"] }));
    expect(dnd5eSrdSheet(nobleActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rapier-attack", label: "Rapier Attack", formula: "1d20+3" }, { id: "monster-rapier-damage", label: "Rapier Damage", formula: "1d8+1" }, expect.objectContaining({ id: "monster-parry-effect", label: "Parry Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })]));
    const ochreJellyActor: Actor = { ...srdActor, type: "monster", name: "Ochre Jelly", data: dnd5eSrdMonsterActorData("ochre-jelly")! };
    expect(ochreJellyActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 8, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(ochreJellyActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-pseudopod-attack", label: "Pseudopod Attack", formula: "1d20+4" }, { id: "monster-pseudopod-damage", label: "Pseudopod Damage", formula: "3d6+2" }, expect.objectContaining({ id: "monster-split-effect", label: "Split Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })]));
    const oniActor: Actor = { ...srdActor, type: "monster", name: "Oni", data: dnd5eSrdMonsterActorData("oni")! };
    expect(oniActor.data).toEqual(expect.objectContaining({ hp: { current: 119, max: 119 }, armorClass: 17, challengeRating: "7", xp: 2900, skillProficiencies: ["arcana", "deception", "perception"] }));
    expect(dnd5eSrdSheet(oniActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+7" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "1d12+4+2d8" }, expect.objectContaining({ id: "monster-nightmare-ray-damage", label: "Nightmare Ray Damage", formula: "2d6+2", metadata: expect.objectContaining({ condition: "Frightened" }) }), expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" }), expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }), expect.objectContaining({ id: "monster-invisibility-effect", label: "Invisibility Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const otyughActor: Actor = { ...srdActor, type: "monster", name: "Otyugh", data: dnd5eSrdMonsterActorData("otyugh")! };
    expect(otyughActor.data).toEqual(expect.objectContaining({ hp: { current: 104, max: 104 }, armorClass: 14, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(otyughActor, []).quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 15 }, condition: "Poisoned" }) }), expect.objectContaining({ id: "monster-tentacle-damage", label: "Tentacle Damage", formula: "2d8+3", metadata: expect.objectContaining({ condition: "Grappled" }) }), expect.objectContaining({ id: "monster-tentacle-slam-damage", label: "Tentacle Slam Damage", formula: "3d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 14, success: "half" }, condition: "Stunned" }) })]));
    const pegasusActor: Actor = { ...srdActor, type: "monster", name: "Pegasus", data: dnd5eSrdMonsterActorData("pegasus")! };
    expect(pegasusActor.data).toEqual(expect.objectContaining({ hp: { current: 59, max: 59 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(pegasusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+6" }, { id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d6+4+2d4" }]));
    const phaseSpiderActor: Actor = { ...srdActor, type: "monster", name: "Phase Spider", data: dnd5eSrdMonsterActorData("phase-spider")! };
    expect(phaseSpiderActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 14, challengeRating: "3", xp: 700, skillProficiencies: ["stealth"] }));
    expect(dnd5eSrdSheet(phaseSpiderActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d10+3+2d8", metadata: expect.objectContaining({ condition: "Poisoned/Paralyzed" }) }), expect.objectContaining({ id: "monster-ethereal-jaunt-effect", label: "Ethereal Jaunt Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const pirateActor: Actor = { ...srdActor, type: "monster", name: "Pirate", data: dnd5eSrdMonsterActorData("pirate")! };
    expect(pirateActor.data).toEqual(expect.objectContaining({ hp: { current: 33, max: 33 }, armorClass: 14, challengeRating: "1", xp: 200 }));
    expect(dnd5eSrdSheet(pirateActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-dagger-attack", label: "Dagger Attack", formula: "1d20+5" }, { id: "monster-dagger-damage", label: "Dagger Damage", formula: "1d4+3" }, expect.objectContaining({ id: "monster-enthralling-panache-effect", label: "Enthralling Panache Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 12 }, condition: "Charmed" }) })]));
    const pirateCaptainActor: Actor = { ...srdActor, type: "monster", name: "Pirate Captain", data: dnd5eSrdMonsterActorData("pirate-captain")! };
    expect(pirateCaptainActor.data).toEqual(expect.objectContaining({ hp: { current: 84, max: 84 }, armorClass: 17, challengeRating: "6", xp: 2300, skillProficiencies: ["acrobatics", "perception"] }));
    expect(dnd5eSrdSheet(pirateCaptainActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rapier-attack", label: "Rapier Attack", formula: "1d20+7" }, expect.objectContaining({ id: "monster-rapier-damage", label: "Rapier Damage", formula: "2d8+4", metadata: expect.objectContaining({ summary: expect.stringContaining("Advantage") }) }), { id: "monster-pistol-attack", label: "Pistol Attack", formula: "1d20+7" }, { id: "monster-pistol-damage", label: "Pistol Damage", formula: "2d10+4" }, expect.objectContaining({ id: "monster-captain-s-charm-effect", label: "Captain's Charm Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", condition: "Charmed" }) }), expect.objectContaining({ id: "monster-riposte-effect", label: "Riposte Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })]));
    const planetarActor: Actor = { ...srdActor, type: "monster", name: "Planetar", data: dnd5eSrdMonsterActorData("planetar")! };
    expect(planetarActor.data).toEqual(expect.objectContaining({ hp: { current: 262, max: 262 }, armorClass: 19, challengeRating: "16", xp: 15000, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(planetarActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-radiant-sword-attack", label: "Radiant Sword Attack", formula: "1d20+12" }, { id: "monster-radiant-sword-damage", label: "Radiant Sword Damage", formula: "2d6+7+4d8" }, expect.objectContaining({ id: "monster-holy-burst-damage", label: "Holy Burst Damage", formula: "7d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 20, success: "half" } }) }), expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }), expect.objectContaining({ id: "monster-divine-aid-effect", label: "Divine Aid Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const plesiosaurusActor: Actor = { ...srdActor, type: "monster", name: "Plesiosaurus", data: dnd5eSrdMonsterActorData("plesiosaurus")! };
    expect(plesiosaurusActor.data).toEqual(expect.objectContaining({ hp: { current: 68, max: 68 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(plesiosaurusActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+4" }]));
    const priestActor: Actor = { ...srdActor, type: "monster", name: "Priest", data: dnd5eSrdMonsterActorData("priest")! };
    expect(priestActor.data).toEqual(expect.objectContaining({ hp: { current: 38, max: 38 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["medicine", "perception", "religion"] }));
    expect(dnd5eSrdSheet(priestActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-mace-attack", label: "Mace Attack", formula: "1d20+5" }, { id: "monster-mace-damage", label: "Mace Damage", formula: "1d6+3+2d4" }, { id: "monster-radiant-flame-attack", label: "Radiant Flame Attack", formula: "1d20+5" }, { id: "monster-radiant-flame-damage", label: "Radiant Flame Damage", formula: "2d10" }, expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }), expect.objectContaining({ id: "monster-divine-aid-effect", label: "Divine Aid Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const pseudodragonActor: Actor = { ...srdActor, type: "monster", name: "Pseudodragon", data: dnd5eSrdMonsterActorData("pseudodragon")! };
    expect(pseudodragonActor.data).toEqual(expect.objectContaining({ hp: { current: 10, max: 10 }, armorClass: 14, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(pseudodragonActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+2" }, expect.objectContaining({ id: "monster-sting-damage", label: "Sting Damage", formula: "2d4", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 12 }, condition: "Poisoned/Unconscious" }) })]));
    const ratActor: Actor = { ...srdActor, type: "monster", name: "Rat", data: dnd5eSrdMonsterActorData("rat")! };
    expect(ratActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 10, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(ratActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+2" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }]));
    const ravenActor: Actor = { ...srdActor, type: "monster", name: "Raven", data: dnd5eSrdMonsterActorData("raven")! };
    expect(ravenActor.data).toEqual(expect.objectContaining({ hp: { current: 2, max: 2 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(ravenActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+4" }, { id: "monster-beak-damage", label: "Beak Damage", formula: "1" }]));
    const swarmOfBatsActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Bats", data: dnd5eSrdMonsterActorData("swarm-of-bats")! };
    expect(swarmOfBatsActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 12, challengeRating: "1/4", xp: 50 }));
    expect((swarmOfBatsActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Swarm" })]));
    expect(dnd5eSrdSheet(swarmOfBatsActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bites-attack", label: "Bites Attack", formula: "1d20+4" }, expect.objectContaining({ id: "monster-bites-damage", label: "Bites Damage", formula: "2d4", metadata: expect.objectContaining({ summary: expect.stringContaining("Bloodied") }) })]));
    const swarmOfInsectsActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Insects", data: dnd5eSrdMonsterActorData("swarm-of-insects")! };
    expect(swarmOfInsectsActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 11, challengeRating: "1/2", xp: 100 }));
    expect((swarmOfInsectsActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Swarm" })]));
    expect(dnd5eSrdSheet(swarmOfInsectsActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bites-attack", label: "Bites Attack", formula: "1d20+3" }, expect.objectContaining({ id: "monster-bites-damage", label: "Bites Damage", formula: "2d4+1", metadata: expect.objectContaining({ damageType: "poison", summary: expect.stringContaining("Bloodied") }) })]));
    const swarmOfPiranhasActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Piranhas", data: dnd5eSrdMonsterActorData("swarm-of-piranhas")! };
    expect(swarmOfPiranhasActor.data).toEqual(expect.objectContaining({ hp: { current: 28, max: 28 }, armorClass: 13, challengeRating: "1", xp: 200 }));
    expect((swarmOfPiranhasActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Condition Immunities" }), expect.objectContaining({ name: "Swarm" }), expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(swarmOfPiranhasActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bites-attack", label: "Bites Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-bites-damage", label: "Bites Damage", formula: "2d4+3", metadata: expect.objectContaining({ summary: expect.stringContaining("Advantage") }) })]));
    const swarmOfRatsActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Rats", data: dnd5eSrdMonsterActorData("swarm-of-rats")! };
    expect(swarmOfRatsActor.data).toEqual(expect.objectContaining({ hp: { current: 14, max: 14 }, armorClass: 10, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(swarmOfRatsActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bites-attack", label: "Bites Attack", formula: "1d20+2" }, expect.objectContaining({ id: "monster-bites-damage", label: "Bites Damage", formula: "2d4", metadata: expect.objectContaining({ summary: expect.stringContaining("Bloodied") }) })]));
    const swarmOfRavensActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Ravens", data: dnd5eSrdMonsterActorData("swarm-of-ravens")! };
    expect(swarmOfRavensActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 12, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(swarmOfRavensActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-beaks-attack", label: "Beaks Attack", formula: "1d20+4" }, expect.objectContaining({ id: "monster-beaks-damage", label: "Beaks Damage", formula: "1d6+2", metadata: expect.objectContaining({ summary: expect.stringContaining("Bloodied") }) })]));
    const swarmOfVenomousSnakesActor: Actor = { ...srdActor, type: "monster", name: "Swarm of Venomous Snakes", data: dnd5eSrdMonsterActorData("swarm-of-venomous-snakes")! };
    expect(swarmOfVenomousSnakesActor.data).toEqual(expect.objectContaining({ hp: { current: 36, max: 36 }, armorClass: 14, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(swarmOfVenomousSnakesActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bites-attack", label: "Bites Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-bites-damage", label: "Bites Damage", formula: "1d8+4+3d6", metadata: expect.objectContaining({ damageType: "piercing/poison", summary: expect.stringContaining("Bloodied") }) })]));
    const reefSharkActor: Actor = { ...srdActor, type: "monster", name: "Reef Shark", data: dnd5eSrdMonsterActorData("reef-shark")! };
    expect(reefSharkActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 12, challengeRating: "1/2", xp: 100, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(reefSharkActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "2d4+2" }]));
    const rhinocerosActor: Actor = { ...srdActor, type: "monster", name: "Rhinoceros", data: dnd5eSrdMonsterActorData("rhinoceros")! };
    expect(rhinocerosActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(rhinocerosActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+7" }, expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d8+5", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const ridingHorseActor: Actor = { ...srdActor, type: "monster", name: "Riding Horse", data: dnd5eSrdMonsterActorData("riding-horse")! };
    expect(ridingHorseActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 11, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(ridingHorseActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+5" }, { id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d8+3" }]));
    const rocActor: Actor = { ...srdActor, type: "monster", name: "Roc", data: dnd5eSrdMonsterActorData("roc")! };
    expect(rocActor.data).toEqual(expect.objectContaining({ hp: { current: 248, max: 248 }, armorClass: 15, challengeRating: "11", xp: 7200, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(rocActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+13" }, { id: "monster-beak-damage", label: "Beak Damage", formula: "3d12+9" }, expect.objectContaining({ id: "monster-talons-damage", label: "Talons Damage", formula: "4d6+9", metadata: expect.objectContaining({ condition: "Grappled/Restrained" }) }), expect.objectContaining({ id: "monster-swoop-effect", label: "Swoop Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", recharge: "5-6" }) })]));
    const roperActor: Actor = { ...srdActor, type: "monster", name: "Roper", data: dnd5eSrdMonsterActorData("roper")! };
    expect(roperActor.data).toEqual(expect.objectContaining({ hp: { current: 93, max: 93 }, armorClass: 20, challengeRating: "5", xp: 1800, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(roperActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+7" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "3d8+4" }, { id: "monster-tentacle-attack", label: "Tentacle Attack", formula: "1d20+7" }, expect.objectContaining({ id: "monster-tentacle-effect", label: "Tentacle Effect", formula: "0", metadata: expect.objectContaining({ condition: "Grappled/Poisoned" }) }), expect.objectContaining({ id: "monster-reel-effect", label: "Reel Effect", formula: "0" })]));
    const saberToothedTigerActor: Actor = { ...srdActor, type: "monster", name: "Saber-Toothed Tiger", data: dnd5eSrdMonsterActorData("saber-toothed-tiger")! };
    expect(saberToothedTigerActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 13, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(saberToothedTigerActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+6" }, { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+4" }, expect.objectContaining({ id: "monster-nimble-escape-effect", label: "Nimble Escape Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const scorpionActor: Actor = { ...srdActor, type: "monster", name: "Scorpion", data: dnd5eSrdMonsterActorData("scorpion")! };
    expect(scorpionActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 11, challengeRating: "0", xp: 10 }));
    expect(dnd5eSrdSheet(scorpionActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-sting-attack", label: "Sting Attack", formula: "1d20+2" }, { id: "monster-sting-damage", label: "Sting Damage", formula: "1+1d6" }]));
    const seahorseActor: Actor = { ...srdActor, type: "monster", name: "Seahorse", data: dnd5eSrdMonsterActorData("seahorse")! };
    expect(seahorseActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 12, challengeRating: "0", xp: 0, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(seahorseActor, []).quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "monster-bubble-dash-effect", label: "Bubble Dash Effect", formula: "0" })]));
    const spiderActor: Actor = { ...srdActor, type: "monster", name: "Spider", data: dnd5eSrdMonsterActorData("spider")! };
    expect(spiderActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["stealth"] }));
    expect((spiderActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Web Walker" })]));
    expect(dnd5eSrdSheet(spiderActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1+1d4" }]));
    const tigerActor: Actor = { ...srdActor, type: "monster", name: "Tiger", data: dnd5eSrdMonsterActorData("tiger")! };
    expect(tigerActor.data).toEqual(expect.objectContaining({ hp: { current: 30, max: 30 }, armorClass: 13, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(tigerActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Prone" }) }), expect.objectContaining({ id: "monster-nimble-escape-effect", label: "Nimble Escape Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })]));
    const triceratopsActor: Actor = { ...srdActor, type: "monster", name: "Triceratops", data: dnd5eSrdMonsterActorData("triceratops")! };
    expect(triceratopsActor.data).toEqual(expect.objectContaining({ hp: { current: 114, max: 114 }, armorClass: 14, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(triceratopsActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+9" }, expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d12+6", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const tyrannosaurusRexActor: Actor = { ...srdActor, type: "monster", name: "Tyrannosaurus Rex", data: dnd5eSrdMonsterActorData("tyrannosaurus-rex")! };
    expect(tyrannosaurusRexActor.data).toEqual(expect.objectContaining({ hp: { current: 136, max: 136 }, armorClass: 13, challengeRating: "8", xp: 3900, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(tyrannosaurusRexActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+10" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "4d12+7", metadata: expect.objectContaining({ condition: "Grappled/Restrained" }) }), { id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+10" }, expect.objectContaining({ id: "monster-tail-damage", label: "Tail Damage", formula: "4d8+7", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const venomousSnakeActor: Actor = { ...srdActor, type: "monster", name: "Venomous Snake", data: dnd5eSrdMonsterActorData("venomous-snake")! };
    expect(venomousSnakeActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 12, challengeRating: "1/8", xp: 25 }));
    expect(dnd5eSrdSheet(venomousSnakeActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1d4+2+1d6" }]));
    const vultureActor: Actor = { ...srdActor, type: "monster", name: "Vulture", data: dnd5eSrdMonsterActorData("vulture")! };
    expect(vultureActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 10, challengeRating: "0", xp: 10, skillProficiencies: ["perception"] }));
    expect((vultureActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })]));
    expect(dnd5eSrdSheet(vultureActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-beak-attack", label: "Beak Attack", formula: "1d20+2" }, { id: "monster-beak-damage", label: "Beak Damage", formula: "1d4" }]));
    const warhorseActor: Actor = { ...srdActor, type: "monster", name: "Warhorse", data: dnd5eSrdMonsterActorData("warhorse")! };
    expect(warhorseActor.data).toEqual(expect.objectContaining({ hp: { current: 19, max: 19 }, armorClass: 11, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(warhorseActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+6" }, expect.objectContaining({ id: "monster-hooves-damage", label: "Hooves Damage", formula: "2d4+4", metadata: expect.objectContaining({ condition: "Prone" }) })]));
    const weaselActor: Actor = { ...srdActor, type: "monster", name: "Weasel", data: dnd5eSrdMonsterActorData("weasel")! };
    expect(weaselActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 13, challengeRating: "0", xp: 10, skillProficiencies: ["acrobatics", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(weaselActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" }, { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }]));
    const wightActor: Actor = { ...srdActor, type: "monster", name: "Wight", data: dnd5eSrdMonsterActorData("wight")! };
    expect(wightActor.data).toEqual(expect.objectContaining({ hp: { current: 82, max: 82 }, armorClass: 14, challengeRating: "3", xp: 700, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(wightActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-necrotic-sword-attack", label: "Necrotic Sword Attack", formula: "1d20+4" }, { id: "monster-necrotic-sword-damage", label: "Necrotic Sword Damage", formula: "1d8+2+1d8" }, expect.objectContaining({ id: "monster-life-drain-damage", label: "Life Drain Damage", formula: "1d8+2", metadata: expect.objectContaining({ save: expect.objectContaining({ ability: "constitution", dc: 13 }) }) })]));
    const willOWispActor: Actor = { ...srdActor, type: "monster", name: "Will-o'-Wisp", data: dnd5eSrdMonsterActorData("will-o-wisp")! };
    expect(willOWispActor.data).toEqual(expect.objectContaining({ hp: { current: 27, max: 27 }, armorClass: 19, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(willOWispActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-shock-attack", label: "Shock Attack", formula: "1d20+4" }, { id: "monster-shock-damage", label: "Shock Damage", formula: "2d8+2" }, expect.objectContaining({ id: "monster-consume-life-effect", label: "Consume Life Effect", formula: "0" }), expect.objectContaining({ id: "monster-vanish-effect", label: "Vanish Effect", formula: "0" })]));
    const winterWolfActor: Actor = { ...srdActor, type: "monster", name: "Winter Wolf", data: dnd5eSrdMonsterActorData("winter-wolf")! };
    expect(winterWolfActor.data).toEqual(expect.objectContaining({ hp: { current: 75, max: 75 }, armorClass: 13, challengeRating: "3", xp: 700, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(winterWolfActor, []).quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+4", metadata: expect.objectContaining({ condition: "Prone" }) }), expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "4d8", metadata: expect.objectContaining({ recharge: "5-6" }) })]));
    const worgActor: Actor = { ...srdActor, type: "monster", name: "Worg", data: dnd5eSrdMonsterActorData("worg")! };
    expect(worgActor.data).toEqual(expect.objectContaining({ hp: { current: 26, max: 26 }, armorClass: 13, challengeRating: "1/2", xp: 100, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(worgActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" }, expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+3" })]));
    const ogreZombieActor: Actor = { ...srdActor, type: "monster", name: "Ogre Zombie", data: dnd5eSrdMonsterActorData("ogre-zombie")! };
    expect(ogreZombieActor.data).toEqual(expect.objectContaining({ hp: { current: 85, max: 85 }, armorClass: 8, challengeRating: "2", xp: 450 }));
    expect((ogreZombieActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Undead Fortitude" })]));
    expect(dnd5eSrdSheet(ogreZombieActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+6" }, { id: "monster-slam-damage", label: "Slam Damage", formula: "2d8+4" }]));
    const scoutActor: Actor = { ...srdActor, type: "monster", name: "Scout", data: dnd5eSrdMonsterActorData("scout")! };
    expect(scoutActor.data).toEqual(expect.objectContaining({ hp: { current: 16, max: 16 }, armorClass: 13, challengeRating: "1/2", xp: 100, skillProficiencies: ["nature", "perception", "stealth", "survival"] }));
    expect(dnd5eSrdSheet(scoutActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-shortsword-attack", label: "Shortsword Attack", formula: "1d20+4" }, { id: "monster-shortsword-damage", label: "Shortsword Damage", formula: "1d6+2" }, { id: "monster-longbow-attack", label: "Longbow Attack", formula: "1d20+4" }, { id: "monster-longbow-damage", label: "Longbow Damage", formula: "1d8+2" }]));
    const seaHagActor: Actor = { ...srdActor, type: "monster", name: "Sea Hag", data: dnd5eSrdMonsterActorData("sea-hag")! };
    expect(seaHagActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 14, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(seaHagActor, []).quickRolls).toEqual(expect.arrayContaining([{ id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+5" }, { id: "monster-claw-damage", label: "Claw Damage", formula: "2d6+3" }, expect.objectContaining({ id: "monster-death-glare-damage", label: "Death Glare Damage", formula: "3d8", metadata: expect.objectContaining({ recharge: "5-6" }) }), expect.objectContaining({ id: "monster-illusory-appearance-effect", label: "Illusory Appearance Effect", formula: "0" })]));
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
    const poisonedGoblinBossActor: Actor = { ...goblinBossActor, data: { ...goblinBossActor.data, conditions: [{ id: "poisoned" }] } };
    expect(dnd5eSrdSheet(poisonedGoblinBossActor, []).quickRolls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "monster-scimitar-attack", formula: "2d20kl1+4", metadata: expect.objectContaining({ conditionRollMode: "disadvantage", conditionSources: ["poisoned"] }) })])
    );
    const invisibleGoblinBossActor: Actor = { ...goblinBossActor, data: { ...goblinBossActor.data, conditions: [{ id: "invisible" }] } };
    expect(dnd5eSrdSheet(invisibleGoblinBossActor, []).quickRolls).toEqual(expect.arrayContaining([expect.objectContaining({ id: "monster-scimitar-attack", formula: "2d20kh1+4" })]));
    const contestedGoblinBossActor: Actor = { ...goblinBossActor, data: { ...goblinBossActor.data, conditions: [{ id: "poisoned" }, { id: "invisible" }] } };
    expect(dnd5eSrdSheet(contestedGoblinBossActor, []).quickRolls).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "monster-scimitar-attack", formula: "1d20+4", metadata: expect.objectContaining({ conditionRollMode: "normal", conditionSources: ["invisible", "poisoned"] }) })])
    );
    const banditCaptainActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bandit Captain",
      data: dnd5eSrdMonsterActorData("bandit-captain")!
    };
    expect(banditCaptainActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 15, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(banditCaptainActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-scimitar-attack", label: "Scimitar Attack", formula: "1d20+5" },
        { id: "monster-scimitar-damage", label: "Scimitar Damage", formula: "1d6+3" },
        { id: "monster-pistol-attack", label: "Pistol Attack", formula: "1d20+5" },
        { id: "monster-pistol-damage", label: "Pistol Damage", formula: "1d10+3" }
      ])
    );
    const giantSpiderActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Spider",
      data: dnd5eSrdMonsterActorData("giant-spider")!
    };
    expect(giantSpiderActor.data).toEqual(expect.objectContaining({ hp: { current: 26, max: 26 }, armorClass: 14, challengeRating: "1", xp: 200 }));
    const giantSpiderStatBlock = (giantSpiderActor.data.monster as { statBlock: { actions: unknown[] } }).statBlock;
    expect(giantSpiderStatBlock.actions).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Web", save: { ability: "dexterity", dc: 13 }, condition: "Restrained" })]));
    expect(dnd5eSrdSheet(giantSpiderActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+3+2d6" },
        expect.objectContaining({ id: "monster-web-effect", label: "Web Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", action: "action", range: "60 ft.", save: { ability: "dexterity", dc: 13 }, condition: "Restrained", recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(giantSpiderActor, [], "monster-web-effect")).toBe("0");
    const giantApeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Giant Ape",
      data: dnd5eSrdMonsterActorData("giant-ape")!
    };
    expect(dnd5eSrdSheet(giantApeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-fist-attack", label: "Fist Attack", formula: "1d20+9" },
        { id: "monster-fist-damage", label: "Fist Damage", formula: "3d10+6" },
        expect.objectContaining({
          id: "monster-boulder-toss-damage",
          label: "Boulder Toss Damage",
          formula: "7d6",
          metadata: expect.objectContaining({
            action: "action",
            range: "90 ft.",
            damageType: "bludgeoning",
            save: { ability: "dexterity", dc: 17, success: "half" },
            condition: "Prone",
            recharge: "6",
            summary: "A Large or smaller target that fails also has the Prone condition."
          })
        })
      ])
    );
    const mummyActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mummy",
      data: dnd5eSrdMonsterActorData("mummy")!
    };
    expect(mummyActor.data).toEqual(expect.objectContaining({ hp: { current: 58, max: 58 }, armorClass: 11, challengeRating: "3", xp: 700 }));
    expect((mummyActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Fire Vulnerability" }), expect.objectContaining({ name: "Undead Immunities" })])
    );
    expect(dnd5eSrdSheet(mummyActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rotting-fist-attack", label: "Rotting Fist Attack", formula: "1d20+5" },
        { id: "monster-rotting-fist-damage", label: "Rotting Fist Damage", formula: "1d10+3+3d6" },
        expect.objectContaining({
          id: "monster-dreadful-glare-effect",
          label: "Dreadful Glare Effect",
          formula: "0",
          metadata: expect.objectContaining({
            effectType: "condition",
            action: "action",
            range: "60 ft.",
            save: { ability: "wisdom", dc: 11 },
            condition: "Frightened"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(mummyActor, [], "monster-rotting-fist-damage")).toBe("1d10+3+3d6");
    expect(dnd5eSrdActionFormula(mummyActor, [], "monster-dreadful-glare-effect")).toBe("0");
    const gelatinousCubeActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Gelatinous Cube",
      data: dnd5eSrdMonsterActorData("gelatinous-cube")!
    };
    expect(gelatinousCubeActor.data).toEqual(expect.objectContaining({ hp: { current: 63, max: 63 }, armorClass: 6, challengeRating: "2", xp: 450 }));
    expect((gelatinousCubeActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Ooze Cube" }), expect.objectContaining({ name: "Transparent" })])
    );
    expect(dnd5eSrdSheet(gelatinousCubeActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-pseudopod-attack", label: "Pseudopod Attack", formula: "1d20+4" },
        { id: "monster-pseudopod-damage", label: "Pseudopod Damage", formula: "3d6+2" },
        expect.objectContaining({
          id: "monster-engulf-damage",
          label: "Engulf Damage",
          formula: "3d6",
          metadata: expect.objectContaining({
            action: "action",
            range: "Speed",
            damageType: "acid",
            save: { ability: "dexterity", dc: 12, success: "half" },
            condition: "Restrained"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(gelatinousCubeActor, [], "monster-pseudopod-damage")).toBe("3d6+2");
    expect(dnd5eSrdActionFormula(gelatinousCubeActor, [], "monster-engulf-damage")).toBe("3d6");
    const ghastActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ghast",
      data: dnd5eSrdMonsterActorData("ghast")!
    };
    expect(ghastActor.data).toEqual(expect.objectContaining({ hp: { current: 36, max: 36 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect((ghastActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Stench" }), expect.objectContaining({ name: "Necrotic Resistance" })])
    );
    expect(dnd5eSrdSheet(ghastActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+3+2d8" },
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+5" },
        expect.objectContaining({
          id: "monster-claw-damage",
          label: "Claw Damage",
          formula: "2d6+3",
          metadata: expect.objectContaining({
            action: "action",
            range: "reach 5 ft.",
            damageType: "slashing",
            save: { ability: "constitution", dc: 10 },
            condition: "Paralyzed"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(ghastActor, [], "monster-bite-damage")).toBe("1d8+3+2d8");
    expect(dnd5eSrdActionFormula(ghastActor, [], "monster-claw-damage")).toBe("2d6+3");
    const sphinxOfWonderActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Sphinx of Wonder",
      data: dnd5eSrdMonsterActorData("sphinx-of-wonder")!
    };
    expect(sphinxOfWonderActor.data).toEqual(expect.objectContaining({ hp: { current: 24, max: 24 }, armorClass: 13, challengeRating: "1", xp: 200, skillProficiencies: ["arcana", "religion", "stealth"] }));
    expect(dnd5eSrdSheet(sphinxOfWonderActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d4+3+2d6" },
        expect.objectContaining({ id: "monster-burst-of-ingenuity-effect", label: "Burst of Ingenuity Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction", range: "30 ft.", summary: expect.stringContaining("adds 2") }) })
      ])
    );
    const sphinxOfLoreActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Sphinx of Lore",
      data: dnd5eSrdMonsterActorData("sphinx-of-lore")!
    };
    expect(sphinxOfLoreActor.data).toEqual(expect.objectContaining({ hp: { current: 170, max: 170 }, armorClass: 17, challengeRating: "11", xp: 7200, skillProficiencies: ["arcana", "history", "perception", "religion"] }));
    expect(dnd5eSrdSheet(sphinxOfLoreActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+8" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "3d6+4" },
        expect.objectContaining({ id: "monster-mind-rending-roar-damage", label: "Mind-Rending Roar Damage", formula: "10d6", metadata: expect.objectContaining({ damageType: "psychic", save: { ability: "wisdom", dc: 16 }, condition: "Incapacitated", recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const sphinxOfValorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Sphinx of Valor",
      data: dnd5eSrdMonsterActorData("sphinx-of-valor")!
    };
    expect(sphinxOfValorActor.data).toEqual(expect.objectContaining({ hp: { current: 199, max: 199 }, armorClass: 17, challengeRating: "17", xp: 18000, skillProficiencies: ["arcana", "perception", "religion"] }));
    expect(dnd5eSrdSheet(sphinxOfValorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+12" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "4d6+6" },
        expect.objectContaining({ id: "monster-roar-damage", label: "Roar Damage", formula: "8d10", metadata: expect.objectContaining({ damageType: "thunder", save: { ability: "constitution", dc: 20, success: "half" }, condition: "Frightened/Paralyzed/Prone", recharge: "3/day" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const wraithActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Wraith",
      data: dnd5eSrdMonsterActorData("wraith")!
    };
    expect(wraithActor.data).toEqual(expect.objectContaining({ hp: { current: 67, max: 67 }, armorClass: 13, challengeRating: "5", xp: 1800 }));
    expect((wraithActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Incorporeal Movement" }), expect.objectContaining({ name: "Sunlight Sensitivity" })])
    );
    expect(dnd5eSrdSheet(wraithActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-life-drain-attack", label: "Life Drain Attack", formula: "1d20+6" },
        expect.objectContaining({
          id: "monster-life-drain-damage",
          label: "Life Drain Damage",
          formula: "4d8+3",
          metadata: expect.objectContaining({
            action: "action",
            range: "reach 5 ft.",
            damageType: "necrotic",
            summary: expect.stringContaining("Hit Point maximum decreases")
          })
        }),
        expect.objectContaining({
          id: "monster-create-specter-effect",
          label: "Create Specter Effect",
          formula: "0",
          metadata: expect.objectContaining({
            effectType: "utility",
            action: "action",
            range: "10 ft.; Humanoid corpse dead no longer than 1 minute",
            effects: expect.arrayContaining([expect.stringContaining("Raises a Specter")])
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(wraithActor, [], "monster-life-drain-damage")).toBe("4d8+3");
    expect(dnd5eSrdActionFormula(wraithActor, [], "monster-create-specter-effect")).toBe("0");
    const airElementalActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Air Elemental",
      data: dnd5eSrdMonsterActorData("air-elemental")!
    };
    expect(airElementalActor.data).toEqual(expect.objectContaining({ hp: { current: 90, max: 90 }, armorClass: 15, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(airElementalActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-thunderous-slam-attack", label: "Thunderous Slam Attack", formula: "1d20+8" },
        { id: "monster-thunderous-slam-damage", label: "Thunderous Slam Damage", formula: "2d8+5" },
        expect.objectContaining({ id: "monster-whirlwind-damage", label: "Whirlwind Damage", formula: "4d10+2", metadata: expect.objectContaining({ action: "action", damageType: "thunder", save: { ability: "strength", dc: 13, success: "half" }, condition: "Prone", recharge: "4-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(airElementalActor, [], "monster-whirlwind-damage")).toBe("4d10+2");
    const earthElementalActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Earth Elemental",
      data: dnd5eSrdMonsterActorData("earth-elemental")!
    };
    expect(earthElementalActor.data).toEqual(expect.objectContaining({ hp: { current: 147, max: 147 }, armorClass: 17, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(earthElementalActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+8" },
        { id: "monster-slam-damage", label: "Slam Damage", formula: "2d8+5" },
        expect.objectContaining({ id: "monster-rock-launch-attack", label: "Rock Launch Attack", formula: "1d20+8" }),
        expect.objectContaining({ id: "monster-rock-launch-damage", label: "Rock Launch Damage", formula: "1d6+5", metadata: expect.objectContaining({ action: "action", range: "60 ft.", damageType: "bludgeoning", condition: "Prone" }) })
      ])
    );
    const fireElementalActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Fire Elemental",
      data: dnd5eSrdMonsterActorData("fire-elemental")!
    };
    expect(fireElementalActor.data).toEqual(expect.objectContaining({ hp: { current: 93, max: 93 }, armorClass: 13, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(fireElementalActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-burn-attack", label: "Burn Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-burn-damage", label: "Burn Damage", formula: "2d6+3", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "fire", summary: expect.stringContaining("starts burning") }) })
      ])
    );
    const waterElementalActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Water Elemental",
      data: dnd5eSrdMonsterActorData("water-elemental")!
    };
    expect(waterElementalActor.data).toEqual(expect.objectContaining({ hp: { current: 114, max: 114 }, armorClass: 14, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(waterElementalActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-slam-damage", label: "Slam Damage", formula: "2d8+4", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "bludgeoning", condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-whelm-damage", label: "Whelm Damage", formula: "4d8+4", metadata: expect.objectContaining({ action: "action", range: "elemental's space", damageType: "bludgeoning", save: { ability: "strength", dc: 15, success: "half" }, condition: "Grappled", recharge: "4-6", summary: expect.stringContaining("Restrained") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(waterElementalActor, [], "monster-whelm-damage")).toBe("4d8+4");
    const basiliskActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Basilisk",
      data: dnd5eSrdMonsterActorData("basilisk")!
    };
    expect(basiliskActor.data).toEqual(expect.objectContaining({ hp: { current: 52, max: 52 }, armorClass: 15, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(basiliskActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d6+3+2d6" },
        expect.objectContaining({ id: "monster-petrifying-gaze-effect", label: "Petrifying Gaze Effect", formula: "0", metadata: expect.objectContaining({ effectType: "condition", action: "bonusAction", range: "30-foot Cone", save: { ability: "constitution", dc: 12 }, condition: "Restrained", recharge: "4-6", summary: expect.stringContaining("Petrified") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(basiliskActor, [], "monster-petrifying-gaze-effect")).toBe("0");
    const cockatriceActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Cockatrice",
      data: dnd5eSrdMonsterActorData("cockatrice")!
    };
    expect(cockatriceActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 11, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(cockatriceActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-petrifying-bite-attack", label: "Petrifying Bite Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-petrifying-bite-damage", label: "Petrifying Bite Damage", formula: "1d4+1", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "piercing", save: { ability: "constitution", dc: 11 }, condition: "Restrained", summary: expect.stringContaining("24 hours") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(cockatriceActor, [], "monster-petrifying-bite-damage")).toBe("1d4+1");
    const manticoreActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Manticore",
      data: dnd5eSrdMonsterActorData("manticore")!
    };
    expect(manticoreActor.data).toEqual(expect.objectContaining({ hp: { current: 68, max: 68 }, armorClass: 14, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(manticoreActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+3" },
        { id: "monster-tail-spike-attack", label: "Tail Spike Attack", formula: "1d20+5" },
        { id: "monster-tail-spike-damage", label: "Tail Spike Damage", formula: "1d8+3" }
      ])
    );
    const minotaurActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Minotaur of Baphomet",
      data: dnd5eSrdMonsterActorData("minotaur-of-baphomet")!
    };
    expect(minotaurActor.data).toEqual(expect.objectContaining({ hp: { current: 85, max: 85 }, armorClass: 14, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(minotaurActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-abyssal-glaive-attack", label: "Abyssal Glaive Attack", formula: "1d20+6" },
        { id: "monster-abyssal-glaive-damage", label: "Abyssal Glaive Damage", formula: "1d12+4+3d6" },
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "4d6+4", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "piercing", condition: "Prone", recharge: "5-6", summary: expect.stringContaining("extra 3d6") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(minotaurActor, [], "monster-gore-damage")).toBe("4d6+4");
    const rustMonsterActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Rust Monster",
      data: dnd5eSrdMonsterActorData("rust-monster")!
    };
    expect(rustMonsterActor.data).toEqual(expect.objectContaining({ hp: { current: 33, max: 33 }, armorClass: 14, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(rustMonsterActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+3" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+1" },
        expect.objectContaining({ id: "monster-antennae-effect", label: "Antennae Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "action", range: "5 ft.; nonmagical metal armor or weapon", save: { ability: "dexterity", dc: 11 }, effects: expect.arrayContaining([expect.stringContaining("-1 penalty")]) }) }),
        expect.objectContaining({ id: "monster-reflexive-antennae-effect", label: "Reflexive Antennae Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction", save: { ability: "dexterity", dc: 11 } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(rustMonsterActor, [], "monster-antennae-effect")).toBe("0");
    const sahuaginActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Sahuagin Warrior",
      data: dnd5eSrdMonsterActorData("sahuagin-warrior")!
    };
    expect(sahuaginActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 12, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(sahuaginActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+3" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1d6+1" },
        expect.objectContaining({ id: "monster-aquatic-charge-effect", label: "Aquatic Charge Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction", range: "Swim Speed", effects: expect.arrayContaining([expect.stringContaining("Swims up to its Swim Speed")]) }) })
      ])
    );
    const salamanderActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Salamander",
      data: dnd5eSrdMonsterActorData("salamander")!
    };
    expect(salamanderActor.data).toEqual(expect.objectContaining({ hp: { current: 90, max: 90 }, armorClass: 15, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(salamanderActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-flame-spear-attack", label: "Flame Spear Attack", formula: "1d20+7" },
        { id: "monster-flame-spear-damage", label: "Flame Spear Damage", formula: "2d8+4+2d6" },
        expect.objectContaining({ id: "monster-constrict-damage", label: "Constrict Damage", formula: "2d6+4+2d6", metadata: expect.objectContaining({ action: "action", range: "10 ft.; one Large or smaller creature", damageType: "bludgeoning/fire", save: { ability: "strength", dc: 15 }, condition: "Grappled", summary: expect.stringContaining("Restrained") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(salamanderActor, [], "monster-constrict-damage")).toBe("2d6+4+2d6");
    const satyrActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Satyr",
      data: dnd5eSrdMonsterActorData("satyr")!
    };
    expect(satyrActor.data).toEqual(expect.objectContaining({ hp: { current: 31, max: 31 }, armorClass: 13, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(satyrActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d4+3", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "bludgeoning", summary: expect.stringContaining("pushes") }) }),
        expect.objectContaining({ id: "monster-mockery-damage", label: "Mockery Damage", formula: "1d6+2", metadata: expect.objectContaining({ action: "action", range: "90 ft.", damageType: "psychic", save: { ability: "wisdom", dc: 12 } }) })
      ])
    );
    const shadowActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Shadow",
      data: dnd5eSrdMonsterActorData("shadow")!
    };
    expect(shadowActor.data).toEqual(expect.objectContaining({ hp: { current: 27, max: 27 }, armorClass: 12, challengeRating: "1/2", xp: 100 }));
    expect(dnd5eSrdSheet(shadowActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-draining-swipe-attack", label: "Draining Swipe Attack", formula: "1d20+4" },
        expect.objectContaining({ id: "monster-draining-swipe-damage", label: "Draining Swipe Damage", formula: "1d6+2", metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "necrotic", summary: expect.stringContaining("Strength score decreases") }) }),
        expect.objectContaining({ id: "monster-shadow-stealth-effect", label: "Shadow Stealth Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction", range: "Dim Light or Darkness" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(shadowActor, [], "monster-draining-swipe-damage")).toBe("1d6+2");
    const shamblingMoundActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Shambling Mound",
      data: dnd5eSrdMonsterActorData("shambling-mound")!
    };
    expect(shamblingMoundActor.data).toEqual(expect.objectContaining({ hp: { current: 110, max: 110 }, armorClass: 15, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(shamblingMoundActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-charged-tendril-attack", label: "Charged Tendril Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-charged-tendril-damage", label: "Charged Tendril Damage", formula: "1d6+4+2d4", metadata: expect.objectContaining({ action: "action", range: "reach 10 ft.", damageType: "bludgeoning/lightning", summary: expect.stringContaining("pulls") }) }),
        expect.objectContaining({ id: "monster-engulf-damage", label: "Engulf Damage", formula: "3d6", metadata: expect.objectContaining({ action: "action", range: "5 ft.; one Medium or smaller creature", damageType: "lightning", save: { ability: "strength", dc: 15 }, condition: "Grappled", summary: expect.stringContaining("Blinded and Restrained") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(shamblingMoundActor, [], "monster-engulf-damage")).toBe("3d6");
    const shieldGuardianActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Shield Guardian",
      data: dnd5eSrdMonsterActorData("shield-guardian")!
    };
    expect(shieldGuardianActor.data).toEqual(expect.objectContaining({ hp: { current: 142, max: 142 }, armorClass: 17, challengeRating: "7", xp: 2900 }));
    expect(dnd5eSrdSheet(shieldGuardianActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-fist-attack", label: "Fist Attack", formula: "1d20+7" },
        { id: "monster-fist-damage", label: "Fist Damage", formula: "2d6+4+2d6" },
        expect.objectContaining({ id: "monster-protection-effect", label: "Protection Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "reaction", range: "5 ft.; amulet wearer", effects: expect.arrayContaining([expect.stringContaining("+5 bonus to AC")]) }) })
      ])
    );
    expect(dnd5eSrdActionFormula(shieldGuardianActor, [], "monster-protection-effect")).toBe("0");
    const brassDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Brass Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("brass-dragon-wyrmling")!
    };
    expect(brassDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 15, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(brassDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+4" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+2" },
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "4d6", metadata: expect.objectContaining({ damageType: "fire", save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-sleep-breath-effect", label: "Sleep Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Unconscious", save: { ability: "constitution", dc: 11 } }) })
      ])
    );
    const youngBrassDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Brass Dragon",
      data: dnd5eSrdMonsterActorData("young-brass-dragon")!
    };
    expect(youngBrassDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 110, max: 110 }, armorClass: 17, challengeRating: "6", xp: 2300, skillProficiencies: ["perception", "persuasion", "stealth"] }));
    expect(dnd5eSrdSheet(youngBrassDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+4" },
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "11d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-sleep-breath-effect", label: "Sleep Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Unconscious", save: { ability: "constitution", dc: 14 } }) })
      ])
    );
    const adultBrassDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Brass Dragon",
      data: dnd5eSrdMonsterActorData("adult-brass-dragon")!
    };
    expect(adultBrassDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 172, max: 172 }, armorClass: 18, challengeRating: "13", xp: 10000, skillProficiencies: ["history", "perception", "persuasion", "stealth"] }));
    expect(dnd5eSrdSheet(adultBrassDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+6+1d8" }),
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "10d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-sleep-breath-effect", label: "Sleep Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Unconscious", save: { ability: "constitution", dc: 18 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const ancientBrassDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Brass Dragon",
      data: dnd5eSrdMonsterActorData("ancient-brass-dragon")!
    };
    expect(ancientBrassDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 332, max: 332 }, armorClass: 20, challengeRating: "20", xp: 25000, skillProficiencies: ["history", "perception", "persuasion", "stealth"] }));
    expect(dnd5eSrdSheet(ancientBrassDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+14" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+8+2d6" }),
        expect.objectContaining({ id: "monster-fire-breath-damage", label: "Fire Breath Damage", formula: "13d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 21, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-sleep-breath-effect", label: "Sleep Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Unconscious", save: { ability: "constitution", dc: 21 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const bronzeDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bronze Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("bronze-dragon-wyrmling")!
    };
    expect(bronzeDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 39, max: 39 }, armorClass: 15, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(bronzeDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+3" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "3d10", metadata: expect.objectContaining({ damageType: "lightning", save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-repulsion-breath-effect", label: "Repulsion Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Prone", save: { ability: "strength", dc: 12 } }) })
      ])
    );
    const youngBronzeDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Bronze Dragon",
      data: dnd5eSrdMonsterActorData("young-bronze-dragon")!
    };
    expect(youngBronzeDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 142, max: 142 }, armorClass: 17, challengeRating: "8", xp: 3900, skillProficiencies: ["insight", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(youngBronzeDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+8" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+5" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "9d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 15, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-repulsion-breath-effect", label: "Repulsion Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Prone", save: { ability: "strength", dc: 15 } }) })
      ])
    );
    const adultBronzeDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Bronze Dragon",
      data: dnd5eSrdMonsterActorData("adult-bronze-dragon")!
    };
    expect(adultBronzeDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 212, max: 212 }, armorClass: 18, challengeRating: "15", xp: 13000, skillProficiencies: ["insight", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(adultBronzeDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+12" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+7+1d10" }),
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "10d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 19, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-repulsion-breath-effect", label: "Repulsion Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Prone", save: { ability: "strength", dc: 19 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const ancientBronzeDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Bronze Dragon",
      data: dnd5eSrdMonsterActorData("ancient-bronze-dragon")!
    };
    expect(ancientBronzeDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 444, max: 444 }, armorClass: 22, challengeRating: "22", xp: 41000, skillProficiencies: ["insight", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(ancientBronzeDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+16" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+9+2d8" }),
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "15d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 23, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-repulsion-breath-effect", label: "Repulsion Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Prone", save: { ability: "strength", dc: 23 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const copperDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Copper Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("copper-dragon-wyrmling")!
    };
    expect(copperDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 22, max: 22 }, armorClass: 16, challengeRating: "1", xp: 200, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(copperDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+4" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+2" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "4d8", metadata: expect.objectContaining({ damageType: "acid", save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-slowing-breath-effect", label: "Slowing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Slowed", save: { ability: "constitution", dc: 11 } }) })
      ])
    );
    const youngCopperDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Copper Dragon",
      data: dnd5eSrdMonsterActorData("young-copper-dragon")!
    };
    expect(youngCopperDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 119, max: 119 }, armorClass: 17, challengeRating: "7", xp: 2900, skillProficiencies: ["deception", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(youngCopperDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+4" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "9d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-slowing-breath-effect", label: "Slowing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Slowed", save: { ability: "constitution", dc: 14 } }) })
      ])
    );
    const adultCopperDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Copper Dragon",
      data: dnd5eSrdMonsterActorData("adult-copper-dragon")!
    };
    expect(adultCopperDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 184, max: 184 }, armorClass: 18, challengeRating: "14", xp: 11500, skillProficiencies: ["deception", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(adultCopperDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+6+1d8" }),
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "12d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-slowing-breath-effect", label: "Slowing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Slowed", save: { ability: "constitution", dc: 18 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const ancientCopperDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Copper Dragon",
      data: dnd5eSrdMonsterActorData("ancient-copper-dragon")!
    };
    expect(ancientCopperDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 367, max: 367 }, armorClass: 21, challengeRating: "21", xp: 33000, skillProficiencies: ["deception", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(ancientCopperDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+15" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d10+8+2d8" }),
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "14d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 22, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-slowing-breath-effect", label: "Slowing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Slowed", save: { ability: "constitution", dc: 22 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const silverDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Silver Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("silver-dragon-wyrmling")!
    };
    expect(silverDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 45, max: 45 }, armorClass: 17, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(silverDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+6" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+4" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "4d8", metadata: expect.objectContaining({ damageType: "cold", save: { ability: "constitution", dc: 13, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-paralyzing-breath-effect", label: "Paralyzing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Paralyzed", save: { ability: "constitution", dc: 13 } }) })
      ])
    );
    const youngSilverDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Silver Dragon",
      data: dnd5eSrdMonsterActorData("young-silver-dragon")!
    };
    expect(youngSilverDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 168, max: 168 }, armorClass: 18, challengeRating: "9", xp: 5000, skillProficiencies: ["history", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(youngSilverDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+10" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+6" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "11d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 17, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-paralyzing-breath-effect", label: "Paralyzing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Paralyzed", save: { ability: "constitution", dc: 17 } }) })
      ])
    );
    const adultSilverDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Silver Dragon",
      data: dnd5eSrdMonsterActorData("adult-silver-dragon")!
    };
    expect(adultSilverDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 216, max: 216 }, armorClass: 19, challengeRating: "16", xp: 15000, skillProficiencies: ["history", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(adultSilverDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+13" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+8+1d8" }),
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "12d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 20, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-paralyzing-breath-effect", label: "Paralyzing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Paralyzed", save: { ability: "constitution", dc: 20 } }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const ancientSilverDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Silver Dragon",
      data: dnd5eSrdMonsterActorData("ancient-silver-dragon")!
    };
    expect(ancientSilverDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 468, max: 468 }, armorClass: 22, challengeRating: "23", xp: 50000, skillProficiencies: ["history", "perception", "stealth"] }));
    expect(dnd5eSrdSheet(ancientSilverDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+17" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+10+2d8" }),
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "15d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 24, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-paralyzing-breath-effect", label: "Paralyzing Breath Effect", formula: "0", metadata: expect.objectContaining({ condition: "Incapacitated/Paralyzed", save: { ability: "constitution", dc: 24 } }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const solarActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Solar",
      data: dnd5eSrdMonsterActorData("solar")!
    };
    expect(solarActor.data).toEqual(expect.objectContaining({ hp: { current: 297, max: 297 }, armorClass: 21, challengeRating: "21", xp: 33000, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(solarActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-flying-sword-attack", label: "Flying Sword Attack", formula: "1d20+15" },
        expect.objectContaining({ id: "monster-flying-sword-damage", label: "Flying Sword Damage", formula: "4d6+8+8d8", metadata: expect.objectContaining({ damageType: "slashing/radiant", summary: expect.stringContaining("returns") }) }),
        expect.objectContaining({ id: "monster-slaying-bow-damage", label: "Slaying Bow Damage", formula: "4d8+6+8d8", metadata: expect.objectContaining({ damageType: "piercing/radiant", condition: "Slain", save: { ability: "dexterity", dc: 21 } }) }),
        expect.objectContaining({ id: "monster-divine-aid-effect", label: "Divine Aid Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction", summary: expect.stringContaining("Cure Wounds") }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" })
      ])
    );
    const spriteActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Sprite",
      data: dnd5eSrdMonsterActorData("sprite")!
    };
    expect(spriteActor.data).toEqual(expect.objectContaining({ hp: { current: 10, max: 10 }, armorClass: 15, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(spriteActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-needle-sword-attack", label: "Needle Sword Attack", formula: "1d20+6" },
        { id: "monster-needle-sword-damage", label: "Needle Sword Damage", formula: "1d4+4" },
        expect.objectContaining({ id: "monster-enchanting-bow-attack", label: "Enchanting Bow Attack", formula: "1d20+6" }),
        expect.objectContaining({ id: "monster-enchanting-bow-damage", label: "Enchanting Bow Damage", formula: "1", metadata: expect.objectContaining({ action: "action", range: "40/160 ft.", condition: "Charmed", summary: expect.stringContaining("Charmed") }) }),
        expect.objectContaining({ id: "monster-heart-sight-effect", label: "Heart Sight Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "action", range: "5 ft.; one creature the sprite can see", save: { ability: "charisma", dc: 10 } }) }),
        expect.objectContaining({ id: "monster-invisibility-effect", label: "Invisibility Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "action" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(spriteActor, [], "monster-heart-sight-effect")).toBe("0");
    const stoneGiantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Stone Giant",
      data: dnd5eSrdMonsterActorData("stone-giant")!
    };
    expect(stoneGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 126, max: 126 }, armorClass: 17, challengeRating: "7", xp: 2900 }));
    expect(dnd5eSrdSheet(stoneGiantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-stone-club-attack", label: "Stone Club Attack", formula: "1d20+9" },
        { id: "monster-stone-club-damage", label: "Stone Club Damage", formula: "3d10+6" },
        expect.objectContaining({ id: "monster-boulder-damage", label: "Boulder Damage", formula: "2d8+6", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("Prone") }) }),
        expect.objectContaining({ id: "monster-deflect-missile-damage", label: "Deflect Missile Damage", formula: "1d10+6", metadata: expect.objectContaining({ action: "reaction", range: "60 ft.; one creature the giant can see", damageType: "force", save: { ability: "dexterity", dc: 17 }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(stoneGiantActor, [], "monster-deflect-missile-damage")).toBe("1d10+6");
    const stoneGolemActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Stone Golem",
      data: dnd5eSrdMonsterActorData("stone-golem")!
    };
    expect(stoneGolemActor.data).toEqual(expect.objectContaining({ hp: { current: 220, max: 220 }, armorClass: 18, challengeRating: "10", xp: 5900 }));
    expect(dnd5eSrdSheet(stoneGolemActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-slam-attack", label: "Slam Attack", formula: "1d20+10" },
        { id: "monster-slam-damage", label: "Slam Damage", formula: "2d8+6+2d8" },
        { id: "monster-force-bolt-attack", label: "Force Bolt Attack", formula: "1d20+9" },
        { id: "monster-force-bolt-damage", label: "Force Bolt Damage", formula: "4d10" },
        expect.objectContaining({ id: "monster-slow-effect", label: "Slow Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction", range: "spell save DC 17", recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(stoneGolemActor, [], "monster-slow-effect")).toBe("0");
    const stormGiantActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Storm Giant",
      data: dnd5eSrdMonsterActorData("storm-giant")!
    };
    expect(stormGiantActor.data).toEqual(expect.objectContaining({ hp: { current: 230, max: 230 }, armorClass: 16, challengeRating: "13", xp: 10000 }));
    expect(dnd5eSrdSheet(stormGiantActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-storm-sword-attack", label: "Storm Sword Attack", formula: "1d20+14" },
        { id: "monster-storm-sword-damage", label: "Storm Sword Damage", formula: "4d6+9+3d8" },
        expect.objectContaining({ id: "monster-thunderbolt-damage", label: "Thunderbolt Damage", formula: "2d12+9", metadata: expect.objectContaining({ condition: "Blinded/Deafened", summary: expect.stringContaining("Blinded and Deafened") }) }),
        expect.objectContaining({ id: "monster-lightning-storm-damage", label: "Lightning Storm Damage", formula: "10d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(stormGiantActor, [], "monster-lightning-storm-damage")).toBe("10d10");
    const succubusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Succubus",
      data: dnd5eSrdMonsterActorData("succubus")!
    };
    expect(succubusActor.data).toEqual(expect.objectContaining({ hp: { current: 71, max: 71 }, armorClass: 15, challengeRating: "4", xp: 1100 }));
    expect(dnd5eSrdSheet(succubusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-fiendish-touch-attack", label: "Fiendish Touch Attack", formula: "1d20+7" },
        { id: "monster-fiendish-touch-damage", label: "Fiendish Touch Damage", formula: "2d10+5" },
        expect.objectContaining({ id: "monster-charm-effect", label: "Charm Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "action", range: "spell save DC 15" }) }),
        expect.objectContaining({ id: "monster-draining-kiss-damage", label: "Draining Kiss Damage", formula: "3d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 15, success: "half" }, summary: expect.stringContaining("Hit Point maximum decreases") }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(succubusActor, [], "monster-draining-kiss-damage")).toBe("3d8");
    const balorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Balor",
      data: dnd5eSrdMonsterActorData("balor")!
    };
    expect(balorActor.data).toEqual(expect.objectContaining({ hp: { current: 287, max: 287 }, armorClass: 19, challengeRating: "19", xp: 22000 }));
    expect(dnd5eSrdSheet(balorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-flame-whip-attack", label: "Flame Whip Attack", formula: "1d20+14" },
        expect.objectContaining({ id: "monster-flame-whip-damage", label: "Flame Whip Damage", formula: "3d6+8+5d6", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("pulled up to 25 feet") }) }),
        { id: "monster-lightning-blade-attack", label: "Lightning Blade Attack", formula: "1d20+14" },
        expect.objectContaining({ id: "monster-lightning-blade-damage", label: "Lightning Blade Damage", formula: "3d8+8+4d10", metadata: expect.objectContaining({ summary: expect.stringContaining("can't take Reactions") }) }),
        expect.objectContaining({ id: "monster-teleport-effect", label: "Teleport Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("willing nearby demon") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(balorActor, [], "monster-flame-whip-damage")).toBe("3d6+8+5d6");
    const werebearActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Werebear",
      data: dnd5eSrdMonsterActorData("werebear")!
    };
    expect(werebearActor.data).toEqual(expect.objectContaining({ hp: { current: 135, max: 135 }, armorClass: 15, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(werebearActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d12+4", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 14 }, summary: expect.stringContaining("curses") }) }),
        { id: "monster-handaxe-attack", label: "Handaxe Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+4" },
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(werebearActor, [], "monster-bite-damage")).toBe("2d12+4");
    const wereboarActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Wereboar",
      data: dnd5eSrdMonsterActorData("wereboar")!
    };
    expect(wereboarActor.data).toEqual(expect.objectContaining({ hp: { current: 97, max: 97 }, armorClass: 15, challengeRating: "4", xp: 1100 }));
    expect(dnd5eSrdSheet(wereboarActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 12 }, summary: expect.stringContaining("Wereboar") }) }),
        { id: "monster-javelin-damage", label: "Javelin Damage", formula: "3d6+3" },
        expect.objectContaining({ id: "monster-tusk-damage", label: "Tusk Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Prone", summary: expect.stringContaining("2d6 Piercing") }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdActionFormula(wereboarActor, [], "monster-gore-damage")).toBe("2d8+3");
    const wereratActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Wererat",
      data: dnd5eSrdMonsterActorData("wererat")!
    };
    expect(wereratActor.data).toEqual(expect.objectContaining({ hp: { current: 60, max: 60 }, armorClass: 13, challengeRating: "2", xp: 450 }));
    expect(dnd5eSrdSheet(wereratActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d4+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 11 } }) }),
        { id: "monster-scratch-damage", label: "Scratch Damage", formula: "1d6+3" },
        { id: "monster-hand-crossbow-attack", label: "Hand Crossbow Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdActionFormula(wereratActor, [], "monster-hand-crossbow-damage")).toBe("1d6+3");
    const weretigerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Weretiger",
      data: dnd5eSrdMonsterActorData("weretiger")!
    };
    expect(weretigerActor.data).toEqual(expect.objectContaining({ hp: { current: 120, max: 120 }, armorClass: 12, challengeRating: "4", xp: 1100 }));
    expect(dnd5eSrdSheet(weretigerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 13 } }) }),
        { id: "monster-longbow-damage", label: "Longbow Damage", formula: "2d8+2" },
        expect.objectContaining({ id: "monster-prowl-effect", label: "Prowl Effect", formula: "0", metadata: expect.objectContaining({ effectType: "utility", action: "bonusAction", effects: expect.arrayContaining([expect.stringContaining("Hide action")]) }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdActionFormula(weretigerActor, [], "monster-prowl-effect")).toBe("0");
    const werewolfActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Werewolf",
      data: dnd5eSrdMonsterActorData("werewolf")!
    };
    expect(werewolfActor.data).toEqual(expect.objectContaining({ hp: { current: 71, max: 71 }, armorClass: 15, challengeRating: "3", xp: 700 }));
    expect((werewolfActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" })])
    );
    expect(dnd5eSrdSheet(werewolfActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "2d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 12 }, summary: expect.stringContaining("Werewolf") }) }),
        { id: "monster-scratch-attack", label: "Scratch Attack", formula: "1d20+5" },
        { id: "monster-longbow-damage", label: "Longbow Damage", formula: "2d8+2" },
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0" })
      ])
    );
    expect(dnd5eSrdActionFormula(werewolfActor, [], "monster-bite-damage")).toBe("2d8+3");
    const xornActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Xorn",
      data: dnd5eSrdMonsterActorData("xorn")!
    };
    expect(xornActor.data).toEqual(expect.objectContaining({ hp: { current: 84, max: 84 }, armorClass: 19, challengeRating: "5", xp: 1800 }));
    expect((xornActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Earth Glide" }), expect.objectContaining({ name: "Treasure Sense" })])
    );
    expect(dnd5eSrdSheet(xornActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+6" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "4d6+3" },
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+6" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1d10+3" },
        expect.objectContaining({
          id: "monster-charge-effect",
          label: "Charge Effect",
          formula: "0",
          metadata: expect.objectContaining({
            effectType: "utility",
            action: "bonusAction",
            range: "Speed or Burrow Speed",
            effects: expect.arrayContaining([expect.stringContaining("Moves up to its Speed or Burrow Speed")])
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(xornActor, [], "monster-bite-damage")).toBe("4d6+3");
    expect(dnd5eSrdActionFormula(xornActor, [], "monster-claw-damage")).toBe("1d10+3");
    expect(dnd5eSrdActionFormula(xornActor, [], "monster-charge-effect")).toBe("0");
    const blueDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Blue Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("blue-dragon-wyrmling")!
    };
    expect(blueDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 65, max: 65 }, armorClass: 17, challengeRating: "3", xp: 700 }));
    expect((blueDragonWyrmlingActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Lightning Immunity" })])
    );
    expect(dnd5eSrdSheet(blueDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+3+1d6" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "6d6", metadata: expect.objectContaining({ damageType: "lightning", save: { ability: "dexterity", dc: 12, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(blueDragonWyrmlingActor, [], "monster-lightning-breath-damage")).toBe("6d6");
    const youngBlueDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Blue Dragon",
      data: dnd5eSrdMonsterActorData("young-blue-dragon")!
    };
    expect(youngBlueDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 152, max: 152 }, armorClass: 18, challengeRating: "9", xp: 5000 }));
    expect(dnd5eSrdSheet(youngBlueDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+9" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+5+1d10" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "10d10", metadata: expect.objectContaining({ range: "60-foot line", save: { ability: "dexterity", dc: 16, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(youngBlueDragonActor, [], "monster-lightning-breath-damage")).toBe("10d10");
    const adultBlueDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Blue Dragon",
      data: dnd5eSrdMonsterActorData("adult-blue-dragon")!
    };
    expect(adultBlueDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 212, max: 212 }, armorClass: 19, challengeRating: "16", xp: 15000 }));
    expect((adultBlueDragonActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Lightning Immunity" })])
    );
    expect(dnd5eSrdSheet(adultBlueDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+12" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+7+1d10" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "11d10", metadata: expect.objectContaining({ range: "90-foot line", save: { ability: "dexterity", dc: 19, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Sonic Boom") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(adultBlueDragonActor, [], "monster-lightning-breath-damage")).toBe("11d10");
    const ancientBlueDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Blue Dragon",
      data: dnd5eSrdMonsterActorData("ancient-blue-dragon")!
    };
    expect(ancientBlueDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 481, max: 481 }, armorClass: 22, challengeRating: "23", xp: 50000 }));
    expect(dnd5eSrdSheet(ancientBlueDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+16" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+9+2d10" },
        expect.objectContaining({ id: "monster-lightning-breath-damage", label: "Lightning Breath Damage", formula: "16d10", metadata: expect.objectContaining({ range: "120-foot line", save: { ability: "dexterity", dc: 23, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Cloaked Flight") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(ancientBlueDragonActor, [], "monster-lightning-breath-damage")).toBe("16d10");
    const greenDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Green Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("green-dragon-wyrmling")!
    };
    expect(greenDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 38, max: 38 }, armorClass: 17, challengeRating: "2", xp: 450 }));
    expect((greenDragonWyrmlingActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Poison Immunity" })])
    );
    expect(dnd5eSrdSheet(greenDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+4" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+2+1d6" },
        expect.objectContaining({ id: "monster-poison-breath-damage", label: "Poison Breath Damage", formula: "6d6", metadata: expect.objectContaining({ damageType: "poison", save: { ability: "constitution", dc: 11, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(greenDragonWyrmlingActor, [], "monster-poison-breath-damage")).toBe("6d6");
    const youngGreenDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Green Dragon",
      data: dnd5eSrdMonsterActorData("young-green-dragon")!
    };
    expect(youngGreenDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 136, max: 136 }, armorClass: 18, challengeRating: "8", xp: 3900 }));
    expect(dnd5eSrdSheet(youngGreenDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+4+2d6" },
        expect.objectContaining({ id: "monster-poison-breath-damage", label: "Poison Breath Damage", formula: "12d6", metadata: expect.objectContaining({ range: "30-foot cone", save: { ability: "constitution", dc: 14, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(youngGreenDragonActor, [], "monster-poison-breath-damage")).toBe("12d6");
    const adultGreenDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Green Dragon",
      data: dnd5eSrdMonsterActorData("adult-green-dragon")!
    };
    expect(adultGreenDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 207, max: 207 }, armorClass: 19, challengeRating: "15", xp: 13000 }));
    expect(dnd5eSrdSheet(adultGreenDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+6+2d6" },
        expect.objectContaining({ id: "monster-poison-breath-damage", label: "Poison Breath Damage", formula: "16d6", metadata: expect.objectContaining({ range: "60-foot cone", save: { ability: "constitution", dc: 18, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Noxious Miasma") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(adultGreenDragonActor, [], "monster-poison-breath-damage")).toBe("16d6");
    const ancientGreenDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Green Dragon",
      data: dnd5eSrdMonsterActorData("ancient-green-dragon")!
    };
    expect(ancientGreenDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 402, max: 402 }, armorClass: 21, challengeRating: "22", xp: 41000 }));
    expect(dnd5eSrdSheet(ancientGreenDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+15" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+8+3d6" },
        expect.objectContaining({ id: "monster-poison-breath-damage", label: "Poison Breath Damage", formula: "22d6", metadata: expect.objectContaining({ range: "90-foot cone", save: { ability: "constitution", dc: 22, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Mind Invasion") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(ancientGreenDragonActor, [], "monster-poison-breath-damage")).toBe("22d6");
    const dretchActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Dretch",
      data: dnd5eSrdMonsterActorData("dretch")!
    };
    expect(dretchActor.data).toEqual(expect.objectContaining({ hp: { current: 18, max: 18 }, armorClass: 11, challengeRating: "1/4", xp: 50 }));
    expect(dnd5eSrdSheet(dretchActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+3" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d6+1" },
        expect.objectContaining({ id: "monster-fetid-cloud-effect", label: "Fetid Cloud Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 11 }, condition: "Poisoned", summary: expect.stringContaining("Once per day") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(dretchActor, [], "monster-fetid-cloud-effect")).toBe("0");
    const quasitActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Quasit",
      data: dnd5eSrdMonsterActorData("quasit")!
    };
    expect(quasitActor.data).toEqual(expect.objectContaining({ hp: { current: 25, max: 25 }, armorClass: 13, challengeRating: "1", xp: 200 }));
    expect(dnd5eSrdSheet(quasitActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-rend-damage", label: "Rend Damage", formula: "1d4+3", metadata: expect.objectContaining({ condition: "Poisoned", summary: expect.stringContaining("quasit's next turn") }) }),
        expect.objectContaining({ id: "monster-invisibility-effect", label: "Invisibility Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Casts Invisibility") }) }),
        expect.objectContaining({ id: "monster-scare-effect", label: "Scare Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 10 }, condition: "Frightened" }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("centipede") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(quasitActor, [], "monster-rend-damage")).toBe("1d4+3");
    const vrockActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Vrock",
      data: dnd5eSrdMonsterActorData("vrock")!
    };
    expect(vrockActor.data).toEqual(expect.objectContaining({ hp: { current: 152, max: 152 }, armorClass: 15, challengeRating: "6", xp: 2300 }));
    expect(dnd5eSrdSheet(vrockActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-shred-attack", label: "Shred Attack", formula: "1d20+6" },
        { id: "monster-shred-damage", label: "Shred Damage", formula: "2d6+3+3d6" },
        expect.objectContaining({ id: "monster-spores-damage", label: "Spores Damage", formula: "1d10", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 15 }, condition: "Poisoned", recharge: "6", summary: expect.stringContaining("Holy Water") }) }),
        expect.objectContaining({ id: "monster-stunning-screech-damage", label: "Stunning Screech Damage", formula: "3d6", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 15 }, condition: "Stunned", summary: expect.stringContaining("Once per day") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(vrockActor, [], "monster-stunning-screech-damage")).toBe("3d6");
    const lemureActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Lemure",
      data: dnd5eSrdMonsterActorData("lemure")!
    };
    expect(lemureActor.data).toEqual(expect.objectContaining({ hp: { current: 9, max: 9 }, armorClass: 9, challengeRating: "0", xp: 10 }));
    expect(dnd5eSrdSheet(lemureActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-vile-slime-attack", label: "Vile Slime Attack", formula: "1d20+2" },
        { id: "monster-vile-slime-damage", label: "Vile Slime Damage", formula: "1d4" }
      ])
    );
    expect(dnd5eSrdActionFormula(lemureActor, [], "monster-vile-slime-damage")).toBe("1d4");
    const impActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Imp",
      data: dnd5eSrdMonsterActorData("imp")!
    };
    expect(impActor.data).toEqual(expect.objectContaining({ hp: { current: 21, max: 21 }, armorClass: 13, challengeRating: "1", xp: 200 }));
    expect(dnd5eSrdSheet(impActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-sting-attack", label: "Sting Attack", formula: "1d20+5" },
        { id: "monster-sting-damage", label: "Sting Damage", formula: "1d6+3+2d6" },
        expect.objectContaining({ id: "monster-invisibility-effect", label: "Invisibility Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Casts Invisibility") }) }),
        expect.objectContaining({ id: "monster-shape-shift-effect", label: "Shape-Shift Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("rat") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(impActor, [], "monster-sting-damage")).toBe("1d6+3+2d6");
    const incubusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Incubus",
      data: dnd5eSrdMonsterActorData("incubus")!
    };
    expect(incubusActor.data).toEqual(expect.objectContaining({ hp: { current: 66, max: 66 }, armorClass: 15, challengeRating: "4", xp: 1100, skillProficiencies: ["deception", "insight", "perception", "persuasion", "stealth"] }));
    expect((incubusActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Damage Resistances" }), expect.objectContaining({ name: "Succubus Form" })]));
    expect(dnd5eSrdSheet(incubusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-restless-touch-attack", label: "Restless Touch Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-restless-touch-damage", label: "Restless Touch Damage", formula: "3d6+5", metadata: expect.objectContaining({ condition: "Cursed" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "charisma", dc: 15 } }) }),
        expect.objectContaining({ id: "monster-nightmare-damage", label: "Nightmare Damage", formula: "4d8", metadata: expect.objectContaining({ action: "bonusAction", condition: "Unconscious", recharge: "6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(incubusActor, [], "monster-nightmare-damage")).toBe("4d8");
    const invisibleStalkerActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Invisible Stalker",
      data: dnd5eSrdMonsterActorData("invisible-stalker")!
    };
    expect(invisibleStalkerActor.data).toEqual(expect.objectContaining({ hp: { current: 97, max: 97 }, armorClass: 14, challengeRating: "6", xp: 2300, skillProficiencies: ["perception", "stealth"] }));
    expect((invisibleStalkerActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Air Form" }), expect.objectContaining({ name: "Invisibility" })]));
    expect(dnd5eSrdSheet(invisibleStalkerActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-wind-swipe-attack", label: "Wind Swipe Attack", formula: "1d20+7" },
        { id: "monster-wind-swipe-damage", label: "Wind Swipe Damage", formula: "2d6+4" },
        expect.objectContaining({ id: "monster-vortex-damage", label: "Vortex Damage", formula: "1d8+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 14 }, condition: "Grappled" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(invisibleStalkerActor, [], "monster-vortex-damage")).toBe("1d8+3");
    const ironGolemActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Iron Golem",
      data: dnd5eSrdMonsterActorData("iron-golem")!
    };
    expect(ironGolemActor.data).toEqual(expect.objectContaining({ hp: { current: 252, max: 252 }, armorClass: 20, challengeRating: "16", xp: 15000 }));
    expect((ironGolemActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Fire Absorption" }), expect.objectContaining({ name: "Magic Resistance" })]));
    expect(dnd5eSrdSheet(ironGolemActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bladed-arm-attack", label: "Bladed Arm Attack", formula: "1d20+12" },
        { id: "monster-bladed-arm-damage", label: "Bladed Arm Damage", formula: "3d8+7+3d6" },
        { id: "monster-fiery-bolt-attack", label: "Fiery Bolt Attack", formula: "1d20+10" },
        { id: "monster-fiery-bolt-damage", label: "Fiery Bolt Damage", formula: "8d8" },
        expect.objectContaining({ id: "monster-poison-breath-damage", label: "Poison Breath Damage", formula: "10d10", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 18, success: "half" }, recharge: "6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(ironGolemActor, [], "monster-poison-breath-damage")).toBe("10d10");
    const koboldWarriorActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Kobold Warrior",
      data: dnd5eSrdMonsterActorData("kobold-warrior")!
    };
    expect(koboldWarriorActor.data).toEqual(expect.objectContaining({ hp: { current: 7, max: 7 }, armorClass: 14, challengeRating: "1/8", xp: 25 }));
    expect((koboldWarriorActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pack Tactics" }), expect.objectContaining({ name: "Sunlight Sensitivity" })]));
    expect(dnd5eSrdSheet(koboldWarriorActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-dagger-attack", label: "Dagger Attack", formula: "1d20+4" },
        { id: "monster-dagger-damage", label: "Dagger Damage", formula: "1d4+2" }
      ])
    );
    expect(dnd5eSrdActionFormula(koboldWarriorActor, [], "monster-dagger-damage")).toBe("1d4+2");
    const krakenActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Kraken",
      data: dnd5eSrdMonsterActorData("kraken")!
    };
    expect(krakenActor.data).toEqual(expect.objectContaining({ hp: { current: 481, max: 481 }, armorClass: 18, challengeRating: "23", xp: 50000, skillProficiencies: ["history", "perception"] }));
    expect((krakenActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Amphibious" }), expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Siege Monster" })]));
    expect(dnd5eSrdSheet(krakenActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-tentacle-attack", label: "Tentacle Attack", formula: "1d20+17" },
        expect.objectContaining({ id: "monster-tentacle-damage", label: "Tentacle Damage", formula: "4d6+10", metadata: expect.objectContaining({ condition: "Grappled/Restrained" }) }),
        expect.objectContaining({ id: "monster-fling-damage", label: "Fling Damage", formula: "4d8", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 25, success: "half" }, condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-lightning-strike-damage", label: "Lightning Strike Damage", formula: "6d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 23, success: "half" } }) }),
        expect.objectContaining({ id: "monster-swallow-damage", label: "Swallow Damage", formula: "3d8+10+7d6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 25 }, condition: "Restrained" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0" }),
        expect.objectContaining({ id: "monster-storm-bolt-damage", label: "Storm Bolt Damage", formula: "6d10", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 23, success: "half" } }) }),
        expect.objectContaining({ id: "monster-toxic-ink-effect", label: "Toxic Ink Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 23 }, condition: "Blinded/Poisoned" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(krakenActor, [], "monster-swallow-damage")).toBe("3d8+10+7d6");
    expect(dnd5eSrdActionFormula(krakenActor, [], "monster-toxic-ink-effect")).toBe("0");
    const lamiaActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Lamia",
      data: dnd5eSrdMonsterActorData("lamia")!
    };
    expect(lamiaActor.data).toEqual(expect.objectContaining({ hp: { current: 97, max: 97 }, armorClass: 13, challengeRating: "4", xp: 1100, skillProficiencies: ["deception", "insight", "stealth"] }));
    expect(dnd5eSrdSheet(lamiaActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+5" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "1d8+3+2d6" },
        expect.objectContaining({ id: "monster-corrupting-touch-damage", label: "Corrupting Touch Damage", formula: "3d8", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 13 }, condition: "Charmed/Poisoned" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "charisma", dc: 13 } }) }),
        expect.objectContaining({ id: "monster-leap-effect", label: "Leap Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(lamiaActor, [], "monster-corrupting-touch-damage")).toBe("3d8");
    const mageActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mage",
      data: dnd5eSrdMonsterActorData("mage")!
    };
    expect(mageActor.data).toEqual(expect.objectContaining({ hp: { current: 81, max: 81 }, armorClass: 15, challengeRating: "6", xp: 2300, skillProficiencies: ["arcana", "history", "perception"] }));
    expect(dnd5eSrdSheet(mageActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-arcane-burst-attack", label: "Arcane Burst Attack", formula: "1d20+6" },
        { id: "monster-arcane-burst-damage", label: "Arcane Burst Damage", formula: "3d8+3" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "intelligence", dc: 14 } }) })
      ])
    );
    expect(dnd5eSrdActionFormula(mageActor, [], "monster-arcane-burst-damage")).toBe("3d8+3");
    const mammothActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mammoth",
      data: dnd5eSrdMonsterActorData("mammoth")!
    };
    expect(mammothActor.data).toEqual(expect.objectContaining({ hp: { current: 126, max: 126 }, armorClass: 13, challengeRating: "6", xp: 2300 }));
    expect(dnd5eSrdSheet(mammothActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-gore-attack", label: "Gore Attack", formula: "1d20+10" },
        expect.objectContaining({ id: "monster-gore-damage", label: "Gore Damage", formula: "2d10+7", metadata: expect.objectContaining({ condition: "Prone" }) }),
        expect.objectContaining({ id: "monster-trample-damage", label: "Trample Damage", formula: "4d10+7", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 18, success: "half" }, action: "bonusAction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(mammothActor, [], "monster-trample-damage")).toBe("4d10+7");
    const mastiffActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mastiff",
      data: dnd5eSrdMonsterActorData("mastiff")!
    };
    expect(mastiffActor.data).toEqual(expect.objectContaining({ hp: { current: 5, max: 5 }, armorClass: 12, challengeRating: "1/8", xp: 25, skillProficiencies: ["perception"] }));
    expect(dnd5eSrdSheet(mastiffActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+3" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d6+1", metadata: expect.objectContaining({ condition: "Prone" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(mastiffActor, [], "monster-bite-damage")).toBe("1d6+1");
    const muleActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mule",
      data: dnd5eSrdMonsterActorData("mule")!
    };
    expect(muleActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 10, challengeRating: "1/8", xp: 25 }));
    expect((muleActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Beast of Burden" })]));
    expect(dnd5eSrdSheet(muleActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+4" },
        { id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d4+2" }
      ])
    );
    expect(dnd5eSrdActionFormula(muleActor, [], "monster-hooves-damage")).toBe("1d4+2");
    const octopusActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Octopus",
      data: dnd5eSrdMonsterActorData("octopus")!
    };
    expect(octopusActor.data).toEqual(expect.objectContaining({ hp: { current: 3, max: 3 }, armorClass: 12, challengeRating: "0", xp: 10, skillProficiencies: ["perception", "stealth"] }));
    expect((octopusActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Compression" }), expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(octopusActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-tentacles-attack", label: "Tentacles Attack", formula: "1d20+4" },
        { id: "monster-tentacles-damage", label: "Tentacles Damage", formula: "1" },
        expect.objectContaining({ id: "monster-ink-cloud-effect", label: "Ink Cloud Effect", formula: "0", metadata: expect.objectContaining({ action: "reaction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(octopusActor, [], "monster-ink-cloud-effect")).toBe("0");
    const owlActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Owl",
      data: dnd5eSrdMonsterActorData("owl")!
    };
    expect(owlActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 11, challengeRating: "0", xp: 10, skillProficiencies: ["perception", "stealth"] }));
    expect((owlActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]));
    expect(dnd5eSrdSheet(owlActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-talons-attack", label: "Talons Attack", formula: "1d20+3" },
        { id: "monster-talons-damage", label: "Talons Damage", formula: "1" }
      ])
    );
    expect(dnd5eSrdActionFormula(owlActor, [], "monster-talons-damage")).toBe("1");
    const pantherActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Panther",
      data: dnd5eSrdMonsterActorData("panther")!
    };
    expect(pantherActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception", "stealth"] }));
    expect(dnd5eSrdSheet(pantherActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+5" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d6+3" },
        expect.objectContaining({ id: "monster-nimble-escape-effect", label: "Nimble Escape Effect", formula: "0", metadata: expect.objectContaining({ action: "bonusAction" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(pantherActor, [], "monster-rend-damage")).toBe("1d6+3");
    const piranhaActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Piranha",
      data: dnd5eSrdMonsterActorData("piranha")!
    };
    expect(piranhaActor.data).toEqual(expect.objectContaining({ hp: { current: 1, max: 1 }, armorClass: 13, challengeRating: "0", xp: 10 }));
    expect((piranhaActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Water Breathing" })]));
    expect(dnd5eSrdSheet(piranhaActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+5" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1" }
      ])
    );
    expect(dnd5eSrdActionFormula(piranhaActor, [], "monster-bite-damage")).toBe("1");
    const polarBearActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Polar Bear",
      data: dnd5eSrdMonsterActorData("polar-bear")!
    };
    expect(polarBearActor.data).toEqual(expect.objectContaining({ hp: { current: 42, max: 42 }, armorClass: 12, challengeRating: "2", xp: 450, skillProficiencies: ["perception", "stealth"] }));
    expect((polarBearActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Cold Resistance" })]));
    expect(dnd5eSrdSheet(polarBearActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+5" }
      ])
    );
    expect(dnd5eSrdActionFormula(polarBearActor, [], "monster-rend-damage")).toBe("1d8+5");
    const ponyActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Pony",
      data: dnd5eSrdMonsterActorData("pony")!
    };
    expect(ponyActor.data).toEqual(expect.objectContaining({ hp: { current: 11, max: 11 }, armorClass: 10, challengeRating: "1/8", xp: 25 }));
    expect(dnd5eSrdSheet(ponyActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-hooves-attack", label: "Hooves Attack", formula: "1d20+4" },
        { id: "monster-hooves-damage", label: "Hooves Damage", formula: "1d4+2" }
      ])
    );
    expect(dnd5eSrdActionFormula(ponyActor, [], "monster-hooves-damage")).toBe("1d4+2");
    const pteranodonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Pteranodon",
      data: dnd5eSrdMonsterActorData("pteranodon")!
    };
    expect(pteranodonActor.data).toEqual(expect.objectContaining({ hp: { current: 13, max: 13 }, armorClass: 13, challengeRating: "1/4", xp: 50, skillProficiencies: ["perception"] }));
    expect((pteranodonActor.data.monster as { statBlock: { traits: Array<{ name: string }> } }).statBlock.traits).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Flyby" })]));
    expect(dnd5eSrdSheet(pteranodonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+4" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d8+2" }
      ])
    );
    expect(dnd5eSrdActionFormula(pteranodonActor, [], "monster-bite-damage")).toBe("1d8+2");
    const beardedDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bearded Devil",
      data: dnd5eSrdMonsterActorData("bearded-devil")!
    };
    expect(beardedDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 58, max: 58 }, armorClass: 13, challengeRating: "3", xp: 700 }));
    expect(dnd5eSrdSheet(beardedDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-beard-attack", label: "Beard Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-beard-damage", label: "Beard Damage", formula: "1d8+3", metadata: expect.objectContaining({ condition: "Poisoned", summary: expect.stringContaining("can't regain Hit Points") }) }),
        { id: "monster-infernal-glaive-attack", label: "Infernal Glaive Attack", formula: "1d20+5" },
        expect.objectContaining({ id: "monster-infernal-glaive-damage", label: "Infernal Glaive Damage", formula: "1d10+3", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 12 }, summary: expect.stringContaining("infernal wound") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(beardedDevilActor, [], "monster-infernal-glaive-damage")).toBe("1d10+3");
    const barbedDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Barbed Devil",
      data: dnd5eSrdMonsterActorData("barbed-devil")!
    };
    expect(barbedDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 110, max: 110 }, armorClass: 15, challengeRating: "5", xp: 1800 }));
    expect(dnd5eSrdSheet(barbedDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claws-attack", label: "Claws Attack", formula: "1d20+6" },
        expect.objectContaining({ id: "monster-claws-damage", label: "Claws Damage", formula: "2d6+3", metadata: expect.objectContaining({ condition: "Grappled", summary: expect.stringContaining("Grappled") }) }),
        { id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+6" },
        { id: "monster-tail-damage", label: "Tail Damage", formula: "2d10+3" },
        { id: "monster-hurl-flame-attack", label: "Hurl Flame Attack", formula: "1d20+5" },
        { id: "monster-hurl-flame-damage", label: "Hurl Flame Damage", formula: "5d6" }
      ])
    );
    expect(dnd5eSrdActionFormula(barbedDevilActor, [], "monster-hurl-flame-damage")).toBe("5d6");
    const boneDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Bone Devil",
      data: dnd5eSrdMonsterActorData("bone-devil")!
    };
    expect(boneDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 161, max: 161 }, armorClass: 16, challengeRating: "9", xp: 5000 }));
    expect(dnd5eSrdSheet(boneDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+8" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "2d8+4" },
        { id: "monster-infernal-sting-attack", label: "Infernal Sting Attack", formula: "1d20+8" },
        expect.objectContaining({ id: "monster-infernal-sting-damage", label: "Infernal Sting Damage", formula: "2d10+4+4d8", metadata: expect.objectContaining({ condition: "Poisoned", summary: expect.stringContaining("can't regain Hit Points") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(boneDevilActor, [], "monster-infernal-sting-damage")).toBe("2d10+4+4d8");
    const chainDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Chain Devil",
      data: dnd5eSrdMonsterActorData("chain-devil")!
    };
    expect(chainDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 85, max: 85 }, armorClass: 15, challengeRating: "8", xp: 3900 }));
    expect(dnd5eSrdSheet(chainDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-chain-attack", label: "Chain Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-chain-damage", label: "Chain Damage", formula: "2d6+4", metadata: expect.objectContaining({ condition: "Grappled/Restrained", summary: expect.stringContaining("escape DC 14") }) }),
        expect.objectContaining({ id: "monster-conjure-infernal-chain-damage", label: "Conjure Infernal Chain Damage", formula: "2d4+4", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 15 }, condition: "Restrained" }) }),
        expect.objectContaining({ id: "monster-unnerving-gaze-effect", label: "Unnerving Gaze Effect", formula: "0", metadata: expect.objectContaining({ save: { ability: "wisdom", dc: 15 }, condition: "Frightened" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(chainDevilActor, [], "monster-unnerving-gaze-effect")).toBe("0");
    const hornedDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Horned Devil",
      data: dnd5eSrdMonsterActorData("horned-devil")!
    };
    expect(hornedDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 199, max: 199 }, armorClass: 18, challengeRating: "11", xp: 7200 }));
    expect(dnd5eSrdSheet(hornedDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-searing-fork-attack", label: "Searing Fork Attack", formula: "1d20+10" },
        { id: "monster-searing-fork-damage", label: "Searing Fork Damage", formula: "2d8+6+2d8" },
        { id: "monster-hurl-flame-attack", label: "Hurl Flame Attack", formula: "1d20+8" },
        { id: "monster-hurl-flame-damage", label: "Hurl Flame Damage", formula: "5d8+4" },
        expect.objectContaining({ id: "monster-infernal-tail-damage", label: "Infernal Tail Damage", formula: "1d8+6", metadata: expect.objectContaining({ save: { ability: "dexterity", dc: 17 }, summary: expect.stringContaining("infernal wound") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(hornedDevilActor, [], "monster-infernal-tail-damage")).toBe("1d8+6");
    const iceDevilActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ice Devil",
      data: dnd5eSrdMonsterActorData("ice-devil")!
    };
    expect(iceDevilActor.data).toEqual(expect.objectContaining({ hp: { current: 228, max: 228 }, armorClass: 18, challengeRating: "14", xp: 11500 }));
    expect(dnd5eSrdSheet(iceDevilActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-ice-spear-attack", label: "Ice Spear Attack", formula: "1d20+10" },
        expect.objectContaining({ id: "monster-ice-spear-damage", label: "Ice Spear Damage", formula: "2d8+5+3d6", metadata: expect.objectContaining({ summary: expect.stringContaining("can't take a Bonus Action") }) }),
        { id: "monster-tail-attack", label: "Tail Attack", formula: "1d20+10" },
        { id: "monster-tail-damage", label: "Tail Damage", formula: "3d6+5+4d8" },
        expect.objectContaining({ id: "monster-ice-wall-effect", label: "Ice Wall Effect", formula: "0", metadata: expect.objectContaining({ effects: expect.arrayContaining([expect.stringContaining("Wall of Ice")]) }) })
      ])
    );
    expect(dnd5eSrdActionFormula(iceDevilActor, [], "monster-ice-wall-effect")).toBe("0");
    const erinyesActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Erinyes",
      data: dnd5eSrdMonsterActorData("erinyes")!
    };
    expect(erinyesActor.data).toEqual(expect.objectContaining({ hp: { current: 178, max: 178 }, armorClass: 18, challengeRating: "12", xp: 8400 }));
    expect(dnd5eSrdSheet(erinyesActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-withering-sword-attack", label: "Withering Sword Attack", formula: "1d20+8" },
        { id: "monster-withering-sword-damage", label: "Withering Sword Damage", formula: "2d8+4+2d10" },
        expect.objectContaining({ id: "monster-entangling-rope-damage", label: "Entangling Rope Damage", formula: "4d6", metadata: expect.objectContaining({ save: { ability: "strength", dc: 16 }, condition: "Restrained", summary: expect.stringContaining("Requires Magic Rope") }) }),
        expect.objectContaining({ id: "monster-parry-effect", label: "Parry Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Adds 4 AC") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(erinyesActor, [], "monster-entangling-rope-damage")).toBe("4d6");
    const couatlActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Couatl",
      data: dnd5eSrdMonsterActorData("couatl")!
    };
    expect(couatlActor.data).toEqual(expect.objectContaining({ hp: { current: 60, max: 60 }, armorClass: 19, challengeRating: "4", xp: 1100 }));
    expect(dnd5eSrdSheet(couatlActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+7" },
        expect.objectContaining({ id: "monster-bite-damage", label: "Bite Damage", formula: "1d12+5", metadata: expect.objectContaining({ condition: "Poisoned", summary: expect.stringContaining("couatl's next turn") }) }),
        expect.objectContaining({ id: "monster-constrict-damage", label: "Constrict Damage", formula: "1d6+5", metadata: expect.objectContaining({ save: { ability: "strength", dc: 15 }, condition: "Grappled/Restrained" }) }),
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("spell save DC 15") }) }),
        expect.objectContaining({ id: "monster-divine-aid-effect", label: "Divine Aid Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Bless") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(couatlActor, [], "monster-constrict-damage")).toBe("1d6+5");
    const devaActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Deva",
      data: dnd5eSrdMonsterActorData("deva")!
    };
    expect(devaActor.data).toEqual(expect.objectContaining({ hp: { current: 229, max: 229 }, armorClass: 17, challengeRating: "10", xp: 5900 }));
    expect(dnd5eSrdSheet(devaActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-holy-mace-attack", label: "Holy Mace Attack", formula: "1d20+8" },
        { id: "monster-holy-mace-damage", label: "Holy Mace Damage", formula: "1d6+4+4d8" },
        expect.objectContaining({ id: "monster-spellcasting-effect", label: "Spellcasting Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("spell save DC 17") }) }),
        expect.objectContaining({ id: "monster-divine-aid-effect", label: "Divine Aid Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Cure Wounds") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(devaActor, [], "monster-holy-mace-damage")).toBe("1d6+4+4d8");
    const blackDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Black Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("black-dragon-wyrmling")!
    };
    expect(blackDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 33, max: 33 }, armorClass: 17, challengeRating: "2", xp: 450 }));
    expect((blackDragonWyrmlingActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Amphibious" })])
    );
    expect(dnd5eSrdSheet(blackDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+4" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d6+2+1d4" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "5d8", metadata: expect.objectContaining({ damageType: "acid", save: { ability: "dexterity", dc: 11, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(blackDragonWyrmlingActor, [], "monster-acid-breath-damage")).toBe("5d8");
    const youngBlackDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Black Dragon",
      data: dnd5eSrdMonsterActorData("young-black-dragon")!
    };
    expect(youngBlackDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 127, max: 127 }, armorClass: 18, challengeRating: "7", xp: 2900 }));
    expect(dnd5eSrdSheet(youngBlackDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d4+4+1d6" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "14d6", metadata: expect.objectContaining({ range: "30-foot line", save: { ability: "dexterity", dc: 14, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(youngBlackDragonActor, [], "monster-acid-breath-damage")).toBe("14d6");
    const adultBlackDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Black Dragon",
      data: dnd5eSrdMonsterActorData("adult-black-dragon")!
    };
    expect(adultBlackDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 195, max: 195 }, armorClass: 19, challengeRating: "14", xp: 11500 }));
    expect((adultBlackDragonActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Amphibious" })])
    );
    expect(dnd5eSrdSheet(adultBlackDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+6+1d8" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "12d8", metadata: expect.objectContaining({ range: "60-foot line", save: { ability: "dexterity", dc: 18, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Cloud of Insects") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(adultBlackDragonActor, [], "monster-acid-breath-damage")).toBe("12d8");
    const ancientBlackDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Black Dragon",
      data: dnd5eSrdMonsterActorData("ancient-black-dragon")!
    };
    expect(ancientBlackDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 367, max: 367 }, armorClass: 22, challengeRating: "21", xp: 33000 }));
    expect(dnd5eSrdSheet(ancientBlackDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+15" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+8+2d8" },
        expect.objectContaining({ id: "monster-acid-breath-damage", label: "Acid Breath Damage", formula: "15d8", metadata: expect.objectContaining({ range: "90-foot line", save: { ability: "dexterity", dc: 22, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Pounce") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(ancientBlackDragonActor, [], "monster-acid-breath-damage")).toBe("15d8");
    const whiteDragonWyrmlingActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "White Dragon Wyrmling",
      data: dnd5eSrdMonsterActorData("white-dragon-wyrmling")!
    };
    expect(whiteDragonWyrmlingActor.data).toEqual(expect.objectContaining({ hp: { current: 32, max: 32 }, armorClass: 16, challengeRating: "2", xp: 450 }));
    expect((whiteDragonWyrmlingActor.data.monster as { statBlock: { traits: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Ice Walk" })])
    );
    expect(dnd5eSrdSheet(whiteDragonWyrmlingActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+4" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d8+2+1d4" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "5d8", metadata: expect.objectContaining({ damageType: "cold", save: { ability: "constitution", dc: 12, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(whiteDragonWyrmlingActor, [], "monster-cold-breath-damage")).toBe("5d8");
    const youngWhiteDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young White Dragon",
      data: dnd5eSrdMonsterActorData("young-white-dragon")!
    };
    expect(youngWhiteDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 123, max: 123 }, armorClass: 17, challengeRating: "6", xp: 2300 }));
    expect(dnd5eSrdSheet(youngWhiteDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+7" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d4+4+1d4" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "9d8", metadata: expect.objectContaining({ save: { ability: "constitution", dc: 15, success: "half" }, recharge: "5-6" }) })
      ])
    );
    expect(dnd5eSrdActionFormula(youngWhiteDragonActor, [], "monster-cold-breath-damage")).toBe("9d8");
    const adultWhiteDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult White Dragon",
      data: dnd5eSrdMonsterActorData("adult-white-dragon")!
    };
    expect(adultWhiteDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 200, max: 200 }, armorClass: 18, challengeRating: "13", xp: 10000 }));
    expect((adultWhiteDragonActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Ice Walk" })])
    );
    expect(dnd5eSrdSheet(adultWhiteDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+11" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+6+1d8" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "12d8", metadata: expect.objectContaining({ range: "60-foot cone", save: { ability: "constitution", dc: 19, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Freezing Burst") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(adultWhiteDragonActor, [], "monster-cold-breath-damage")).toBe("12d8");
    const ancientWhiteDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient White Dragon",
      data: dnd5eSrdMonsterActorData("ancient-white-dragon")!
    };
    expect(ancientWhiteDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 333, max: 333 }, armorClass: 20, challengeRating: "20", xp: 25000 }));
    expect(dnd5eSrdSheet(ancientWhiteDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+14" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+8+2d6" },
        expect.objectContaining({ id: "monster-cold-breath-damage", label: "Cold Breath Damage", formula: "14d8", metadata: expect.objectContaining({ range: "90-foot cone", save: { ability: "constitution", dc: 22, success: "half" }, recharge: "5-6" }) }),
        expect.objectContaining({ id: "monster-legendary-actions-effect", label: "Legendary Actions Effect", formula: "0", metadata: expect.objectContaining({ summary: expect.stringContaining("Pounce") }) })
      ])
    );
    expect(dnd5eSrdActionFormula(ancientWhiteDragonActor, [], "monster-cold-breath-damage")).toBe("14d8");
    const youngRedDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Young Red Dragon",
      data: dnd5eSrdMonsterActorData("young-red-dragon")!
    };
    expect(youngRedDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 178, max: 178 }, armorClass: 18, challengeRating: "10", xp: 5900 }));
    expect(dnd5eSrdSheet(youngRedDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+10" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d6+6+1d6" },
        expect.objectContaining({
          id: "monster-fire-breath-damage",
          label: "Fire Breath Damage",
          formula: "16d6",
          metadata: expect.objectContaining({
            action: "action",
            range: "30-foot cone",
            damageType: "fire",
            save: { ability: "dexterity", dc: 17, success: "half" },
            recharge: "5-6"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(youngRedDragonActor, [], "monster-fire-breath-damage")).toBe("16d6");
    const adultRedDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Adult Red Dragon",
      data: dnd5eSrdMonsterActorData("adult-red-dragon")!
    };
    expect(adultRedDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 256, max: 256 }, armorClass: 19, challengeRating: "17", xp: 18000 }));
    expect((adultRedDragonActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" })])
    );
    expect(dnd5eSrdSheet(adultRedDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+14" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "1d10+8+2d4" },
        expect.objectContaining({
          id: "monster-fire-breath-damage",
          label: "Fire Breath Damage",
          formula: "17d6",
          metadata: expect.objectContaining({
            action: "action",
            range: "60-foot cone",
            damageType: "fire",
            save: { ability: "dexterity", dc: 21, success: "half" },
            recharge: "5-6"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(adultRedDragonActor, [], "monster-fire-breath-damage")).toBe("17d6");
    const remorhazActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Remorhaz",
      data: dnd5eSrdMonsterActorData("remorhaz")!
    };
    expect(remorhazActor.data).toEqual(expect.objectContaining({ hp: { current: 195, max: 195 }, armorClass: 17, challengeRating: "11", xp: 7200 }));
    expect((remorhazActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Heat Aura" })])
    );
    expect(dnd5eSrdSheet(remorhazActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+11" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d10+7+4d6" },
        expect.objectContaining({
          id: "monster-swallow-damage",
          label: "Swallow Damage",
          formula: "3d6+3d6",
          metadata: expect.objectContaining({
            action: "bonusAction",
            range: "one Large or smaller Grappled creature",
            damageType: "acid/fire",
            save: { ability: "strength", dc: 19 }
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(remorhazActor, [], "monster-swallow-damage")).toBe("3d6+3d6");
    const purpleWormActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Purple Worm",
      data: dnd5eSrdMonsterActorData("purple-worm")!
    };
    expect(purpleWormActor.data).toEqual(expect.objectContaining({ hp: { current: 247, max: 247 }, armorClass: 18, challengeRating: "15", xp: 13000 }));
    expect((purpleWormActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Tunneler" })])
    );
    expect(dnd5eSrdSheet(purpleWormActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+14" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "3d8+9" },
        { id: "monster-tail-stinger-attack", label: "Tail Stinger Attack", formula: "1d20+14" },
        { id: "monster-tail-stinger-damage", label: "Tail Stinger Damage", formula: "2d6+9+10d6" },
        expect.objectContaining({
          id: "monster-swallow-damage",
          label: "Swallow Damage",
          formula: "5d6",
          metadata: expect.objectContaining({
            action: "bonusAction",
            range: "one Large or smaller Grappled creature",
            damageType: "acid",
            save: { ability: "strength", dc: 19 }
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(purpleWormActor, [], "monster-tail-stinger-damage")).toBe("2d6+9+10d6");
    expect(dnd5eSrdActionFormula(purpleWormActor, [], "monster-swallow-damage")).toBe("5d6");
    const mummyLordActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Mummy Lord",
      data: dnd5eSrdMonsterActorData("mummy-lord")!
    };
    expect(mummyLordActor.data).toEqual(expect.objectContaining({ hp: { current: 187, max: 187 }, armorClass: 17, challengeRating: "15", xp: 13000 }));
    expect((mummyLordActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Magic Resistance" })])
    );
    expect(dnd5eSrdSheet(mummyLordActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rotting-fist-attack", label: "Rotting Fist Attack", formula: "1d20+9" },
        { id: "monster-rotting-fist-damage", label: "Rotting Fist Damage", formula: "2d10+4+3d6" },
        { id: "monster-channel-negative-energy-attack", label: "Channel Negative Energy Attack", formula: "1d20+9" },
        { id: "monster-channel-negative-energy-damage", label: "Channel Negative Energy Damage", formula: "6d6+4" },
        expect.objectContaining({
          id: "monster-dreadful-glare-damage",
          label: "Dreadful Glare Damage",
          formula: "6d6+4",
          metadata: expect.objectContaining({
            action: "action",
            range: "60 ft.",
            damageType: "psychic",
            save: { ability: "wisdom", dc: 17 },
            condition: "Paralyzed"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(mummyLordActor, [], "monster-channel-negative-energy-damage")).toBe("6d6+4");
    expect(dnd5eSrdActionFormula(mummyLordActor, [], "monster-dreadful-glare-damage")).toBe("6d6+4");
    const lichActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Lich",
      data: dnd5eSrdMonsterActorData("lich")!
    };
    expect(lichActor.data).toEqual(expect.objectContaining({ hp: { current: 315, max: 315 }, armorClass: 20, challengeRating: "21", xp: 33000 }));
    expect((lichActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Spirit Jar" })])
    );
    expect(dnd5eSrdSheet(lichActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-paralyzing-touch-attack", label: "Paralyzing Touch Attack", formula: "1d20+12" },
        expect.objectContaining({
          id: "monster-paralyzing-touch-damage",
          label: "Paralyzing Touch Damage",
          formula: "3d6+5",
          metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "cold", condition: "Paralyzed" })
        }),
        { id: "monster-deathly-teleport-damage", label: "Deathly Teleport Damage", formula: "2d10" },
        expect.objectContaining({
          id: "monster-disrupt-life-damage",
          label: "Disrupt Life Damage",
          formula: "9d6",
          metadata: expect.objectContaining({ action: "action", range: "20-foot emanation", damageType: "necrotic", save: { ability: "constitution", dc: 20, success: "half" } })
        }),
        expect.objectContaining({
          id: "monster-frightening-gaze-effect",
          label: "Frightening Gaze Effect",
          formula: "0",
          metadata: expect.objectContaining({ effectType: "condition", action: "action", range: "Fear spell", save: { ability: "wisdom", dc: 20 }, condition: "Frightened" })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(lichActor, [], "monster-paralyzing-touch-damage")).toBe("3d6+5");
    expect(dnd5eSrdActionFormula(lichActor, [], "monster-deathly-teleport-damage")).toBe("2d10");
    expect(dnd5eSrdActionFormula(lichActor, [], "monster-disrupt-life-damage")).toBe("9d6");
    expect(dnd5eSrdActionFormula(lichActor, [], "monster-frightening-gaze-effect")).toBe("0");
    const vampireSpawnActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Vampire Spawn",
      data: dnd5eSrdMonsterActorData("vampire-spawn")!
    };
    expect(vampireSpawnActor.data).toEqual(expect.objectContaining({ hp: { current: 90, max: 90 }, armorClass: 16, challengeRating: "5", xp: 1800 }));
    expect((vampireSpawnActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Spider Climb" }), expect.objectContaining({ name: "Vampire Weakness" })])
    );
    expect(dnd5eSrdSheet(vampireSpawnActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "monster-claw-attack",
          label: "Claw Attack",
          formula: "1d20+6"
        }),
        expect.objectContaining({
          id: "monster-claw-damage",
          label: "Claw Damage",
          formula: "2d4+3",
          metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "slashing", condition: "Grappled" })
        }),
        expect.objectContaining({
          id: "monster-bite-damage",
          label: "Bite Damage",
          formula: "1d4+3+3d6",
          metadata: expect.objectContaining({ action: "action", range: "5 ft.; willing, Grappled, Incapacitated, or Restrained creature", damageType: "piercing/necrotic", save: { ability: "constitution", dc: 14 } })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(vampireSpawnActor, [], "monster-claw-damage")).toBe("2d4+3");
    expect(dnd5eSrdActionFormula(vampireSpawnActor, [], "monster-bite-damage")).toBe("1d4+3+3d6");
    const vampireActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Vampire",
      data: dnd5eSrdMonsterActorData("vampire")!
    };
    expect(vampireActor.data).toEqual(expect.objectContaining({ hp: { current: 195, max: 195 }, armorClass: 16, challengeRating: "13", xp: 10000 }));
    expect((vampireActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Resistance" }), expect.objectContaining({ name: "Misty Escape" })])
    );
    expect(dnd5eSrdSheet(vampireActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-grave-strike-attack", label: "Grave Strike Attack", formula: "1d20+9" },
        expect.objectContaining({
          id: "monster-grave-strike-damage",
          label: "Grave Strike Damage",
          formula: "1d8+4+2d6",
          metadata: expect.objectContaining({ action: "action", range: "reach 5 ft.", damageType: "bludgeoning/necrotic", condition: "Grappled" })
        }),
        expect.objectContaining({
          id: "monster-bite-damage",
          label: "Bite Damage",
          formula: "1d4+4+3d8",
          metadata: expect.objectContaining({ action: "action", range: "5 ft.; willing, Grappled, Incapacitated, or Restrained creature", damageType: "piercing/necrotic", save: { ability: "constitution", dc: 17 } })
        }),
        expect.objectContaining({
          id: "monster-charm-effect",
          label: "Charm Effect",
          formula: "0",
          metadata: expect.objectContaining({ effectType: "condition", action: "bonusAction", range: "30 ft.", save: { ability: "wisdom", dc: 17 }, condition: "Charmed", recharge: "5-6" })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(vampireActor, [], "monster-grave-strike-damage")).toBe("1d8+4+2d6");
    expect(dnd5eSrdActionFormula(vampireActor, [], "monster-bite-damage")).toBe("1d4+4+3d8");
    expect(dnd5eSrdActionFormula(vampireActor, [], "monster-charm-effect")).toBe("0");
    const medusaActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Medusa",
      data: dnd5eSrdMonsterActorData("medusa")!
    };
    expect(medusaActor.data).toEqual(expect.objectContaining({ hp: { current: 127, max: 127 }, armorClass: 15, challengeRating: "6", xp: 2300 }));
    expect((medusaActor.data.monster as { statBlock: { actions: unknown[] } }).statBlock.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Petrifying Gaze", save: { ability: "constitution", dc: 13 }, condition: "Restrained", recharge: "5-6" })])
    );
    expect(dnd5eSrdSheet(medusaActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-claw-attack", label: "Claw Attack", formula: "1d20+6" },
        { id: "monster-claw-damage", label: "Claw Damage", formula: "2d6+3" },
        { id: "monster-snake-hair-attack", label: "Snake Hair Attack", formula: "1d20+6" },
        { id: "monster-snake-hair-damage", label: "Snake Hair Damage", formula: "1d4+3+4d6" },
        { id: "monster-poison-ray-attack", label: "Poison Ray Attack", formula: "1d20+5" },
        { id: "monster-poison-ray-damage", label: "Poison Ray Damage", formula: "2d8+2" },
        expect.objectContaining({
          id: "monster-petrifying-gaze-effect",
          label: "Petrifying Gaze Effect",
          formula: "0",
          metadata: expect.objectContaining({
            effectType: "condition",
            action: "bonusAction",
            range: "30-foot cone",
            save: { ability: "constitution", dc: 13 },
            condition: "Restrained",
            recharge: "5-6"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(medusaActor, [], "monster-snake-hair-damage")).toBe("1d4+3+4d6");
    expect(dnd5eSrdActionFormula(medusaActor, [], "monster-poison-ray-damage")).toBe("2d8+2");
    expect(dnd5eSrdActionFormula(medusaActor, [], "monster-petrifying-gaze-effect")).toBe("0");
    const hydraActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Hydra",
      data: dnd5eSrdMonsterActorData("hydra")!
    };
    expect(hydraActor.data).toEqual(expect.objectContaining({ hp: { current: 184, max: 184 }, armorClass: 15, challengeRating: "8", xp: 3900 }));
    expect((hydraActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.traits).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Multiple Heads" }), expect.objectContaining({ name: "Reactive Heads" })])
    );
    expect(dnd5eSrdSheet(hydraActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+8" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "1d10+5" }
      ])
    );
    expect(dnd5eSrdActionFormula(hydraActor, [], "monster-bite-damage")).toBe("1d10+5");
    const wyvernActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Wyvern",
      data: dnd5eSrdMonsterActorData("wyvern")!
    };
    expect(wyvernActor.data).toEqual(expect.objectContaining({ hp: { current: 127, max: 127 }, armorClass: 14, challengeRating: "6", xp: 2300 }));
    expect((wyvernActor.data.monster as { statBlock: { actions: unknown[] } }).statBlock.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Sting", damageFormula: "2d6+4+7d6", condition: "Poisoned" })])
    );
    expect(dnd5eSrdSheet(wyvernActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-bite-attack", label: "Bite Attack", formula: "1d20+7" },
        { id: "monster-bite-damage", label: "Bite Damage", formula: "2d8+4" },
        { id: "monster-sting-attack", label: "Sting Attack", formula: "1d20+7" },
        expect.objectContaining({
          id: "monster-sting-damage",
          label: "Sting Damage",
          formula: "2d6+4+7d6",
          metadata: expect.objectContaining({ action: "action", range: "reach 10 ft.", damageType: "piercing/poison", condition: "Poisoned" })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(wyvernActor, [], "monster-bite-damage")).toBe("2d8+4");
    expect(dnd5eSrdActionFormula(wyvernActor, [], "monster-sting-damage")).toBe("2d6+4+7d6");
    const ancientRedDragonActor: Actor = {
      ...srdActor,
      type: "monster",
      name: "Ancient Red Dragon",
      data: dnd5eSrdMonsterActorData("ancient-red-dragon")!
    };
    expect(ancientRedDragonActor.data).toEqual(expect.objectContaining({ hp: { current: 507, max: 507 }, armorClass: 22, challengeRating: "24", xp: 62000 }));
    expect((ancientRedDragonActor.data.monster as { statBlock: { traits: unknown[]; actions: unknown[] } }).statBlock.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Legendary Actions" })])
    );
    expect(dnd5eSrdSheet(ancientRedDragonActor, []).quickRolls).toEqual(
      expect.arrayContaining([
        { id: "monster-rend-attack", label: "Rend Attack", formula: "1d20+17" },
        { id: "monster-rend-damage", label: "Rend Damage", formula: "2d8+10+3d6" },
        expect.objectContaining({
          id: "monster-fire-breath-damage",
          label: "Fire Breath Damage",
          formula: "26d6",
          metadata: expect.objectContaining({
            action: "action",
            range: "90-foot cone",
            damageType: "fire",
            save: { ability: "dexterity", dc: 24, success: "half" },
            recharge: "5-6"
          })
        })
      ])
    );
    expect(dnd5eSrdActionFormula(ancientRedDragonActor, [], "monster-fire-breath-damage")).toBe("26d6");

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
    const potion: Item = {
      id: "itm_superior_healing",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Potion of Healing (superior)",
      data: { ...dnd5eSrdCompendiumEntry("potion-of-healing-superior")!.data, compendiumId: "potion-of-healing-superior", quantity: 1 },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(useDnd5eSrdAction(srdActor, [potion], `item-${potion.id}-healing`)).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "itemQuantity", key: potion.id, label: "Potion of Healing (superior)", amount: 1, remaining: 0 }],
        items: [expect.objectContaining({ id: potion.id, data: expect.objectContaining({ quantity: 0 }) })]
      })
    );
    expect(() => useDnd5eSrdAction(srdActor, [{ ...potion, data: { ...potion.data, quantity: 0 } }], `item-${potion.id}-healing`)).toThrow("Potion of Healing (superior) has no remaining uses");
    const invisibilityPotion: Item = {
      id: "itm_potion_of_invisibility",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Potion of Invisibility",
      data: { ...dnd5eSrdCompendiumEntry("potion-of-invisibility")!.data, compendiumId: "potion-of-invisibility", quantity: 1 },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(useDnd5eSrdAction(srdActor, [invisibilityPotion], `item-${invisibilityPotion.id}-effect`)).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "itemQuantity", key: invisibilityPotion.id, label: "Potion of Invisibility", amount: 1, remaining: 0 }],
        items: [expect.objectContaining({ id: invisibilityPotion.id, data: expect.objectContaining({ quantity: 0 }) })]
      })
    );
    expect(() => useDnd5eSrdAction(srdActor, [{ ...invisibilityPotion, data: { ...invisibilityPotion.data, quantity: 0 } }], `item-${invisibilityPotion.id}-effect`)).toThrow("Potion of Invisibility has no remaining uses");
    const climbingPotion: Item = {
      id: "itm_potion_of_climbing",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Potion of Climbing",
      data: { ...dnd5eSrdCompendiumEntry("potion-of-climbing")!.data, compendiumId: "potion-of-climbing", quantity: 1 },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(useDnd5eSrdAction(srdActor, [climbingPotion], `item-${climbingPotion.id}-effect`)).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "itemQuantity", key: climbingPotion.id, label: "Potion of Climbing", amount: 1, remaining: 0 }],
        items: [expect.objectContaining({ id: climbingPotion.id, data: expect.objectContaining({ quantity: 0 }) })]
      })
    );
    expect(() => useDnd5eSrdAction(srdActor, [{ ...climbingPotion, data: { ...climbingPotion.data, quantity: 0 } }], `item-${climbingPotion.id}-effect`)).toThrow("Potion of Climbing has no remaining uses");
    const bane: Item = {
      id: "itm_bane",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Bane",
      data: { ...dnd5eSrdCompendiumEntry("bane")!.data, compendiumId: "bane" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(useDnd5eSrdAction(srdActor, [bane], `spell-${bane.id}-effect`)).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 1,
        consumed: [{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ spellSlots: expect.objectContaining({ level1: { current: 0, max: 2, recovery: "long" } }) })
      })
    );
    expect(useDnd5eSrdAction(srdActor, [bane], `spell-${bane.id}-effect`, { spellSlotLevel: 2 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({ spellSlots: expect.objectContaining({ level2: { current: 0, max: 1, recovery: "long" } }) })
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
    const levelThreeClericActor: Actor = { ...clericActor, data: applyDnd5eSrdAdvancement(levelTwoClericActor, "level-up") };
    expect(useDnd5eSrdAction(levelThreeClericActor, [], "feature-life-preserve-life")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "channelDivinity", label: "Channel Divinity", amount: 1, remaining: 1 }]
      })
    );
    expect(useDnd5eSrdAction(levelThreeClericActor, [], "feature-life-disciple-of-life").consumed).toEqual([]);
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
    let levelSixClericData = levelFiveClericData;
    levelSixClericData = applyDnd5eSrdAdvancement({ ...clericActor, data: levelSixClericData }, "level-up");
    expect(useDnd5eSrdAction({ ...clericActor, data: levelSixClericData }, [], "feature-life-blessed-healer").consumed).toEqual([]);
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
            channelDivinity: { current: 2, max: 2, recovery: "short" },
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
            channelDivinity: { current: 0, max: 2, recovery: "short" },
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
      channelDivinity: { current: 2, max: 2, recovery: "short" },
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
    let levelFifteenRangerData = levelFiveRangerData;
    for (let level = 6; level <= 15; level += 1) {
      levelFifteenRangerData = applyDnd5eSrdAdvancement({ ...rangerActor, data: levelFifteenRangerData }, "level-up");
    }
    const levelFifteenRangerActor: Actor = { ...rangerActor, data: levelFifteenRangerData };
    expect(useDnd5eSrdAction(levelFifteenRangerActor, [], "feature-hunter-superior-defense")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        rollId: "feature-hunter-superior-defense",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Superior Hunter's Defense"]) })
      })
    );
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
    expect(useDnd5eSrdAction(levelFiveMonkActor, [], "feature-open-hand-technique")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        rollId: "feature-open-hand-technique",
        consumed: []
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
    let levelSeventeenMonkData = levelFiveMonkData;
    for (let level = 6; level <= 17; level += 1) {
      levelSeventeenMonkData = applyDnd5eSrdAdvancement({ ...monkActor, data: levelSeventeenMonkData }, "level-up");
    }
    const levelSeventeenMonkActor: Actor = { ...monkActor, data: levelSeventeenMonkData };
    const restedLevelSeventeenMonkActor: Actor = {
      ...levelSeventeenMonkActor,
      data: { ...levelSeventeenMonkData, resources: { focus: { current: 17, max: 17, recovery: "short" }, uncannyMetabolism: { current: 1, max: 1, recovery: "long" }, wholenessOfBody: { current: 2, max: 2, recovery: "long" } } }
    };
    expect(useDnd5eSrdAction(restedLevelSeventeenMonkActor, [], "feature-open-hand-wholeness-of-body")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "wholenessOfBody", label: "Wholeness of Body", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ wholenessOfBody: { current: 1, max: 2, recovery: "long" } }) })
      })
    );
    expect(useDnd5eSrdAction(restedLevelSeventeenMonkActor, [], "feature-open-hand-fleet-step")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        rollId: "feature-open-hand-fleet-step",
        consumed: []
      })
    );
    expect(useDnd5eSrdAction(restedLevelSeventeenMonkActor, [], "feature-open-hand-quivering-palm-damage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "focus", label: "Focus Point", amount: 4, remaining: 13 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ focus: { current: 13, max: 17, recovery: "short" } }) })
      })
    );
    expect(applyDnd5eSrdRest({ ...levelSeventeenMonkActor, data: { ...levelSeventeenMonkData, resources: { focus: { current: 0, max: 17, recovery: "short" }, uncannyMetabolism: { current: 0, max: 1, recovery: "long" }, wholenessOfBody: { current: 0, max: 2, recovery: "long" } } } }, "long").data.resources).toEqual({
      focus: { current: 17, max: 17, recovery: "short" },
      uncannyMetabolism: { current: 1, max: 1, recovery: "long" },
      wholenessOfBody: { current: 2, max: 2, recovery: "long" }
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
    let levelFourteenDruidData = levelFiveDruidData;
    for (let level = 6; level <= 14; level += 1) {
      levelFourteenDruidData = applyDnd5eSrdAdvancement({ ...druidActor, data: levelFourteenDruidData }, "level-up");
    }
    const levelFourteenDruidActor: Actor = { ...druidActor, data: levelFourteenDruidData };
    expect(useDnd5eSrdAction(levelFourteenDruidActor, [], "feature-moon-moonlight-step")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "moonlightStep", label: "Moonlight Step", amount: 1, remaining: 6 }],
        data: expect.objectContaining({ resources: expect.objectContaining({ moonlightStep: { current: 6, max: 9, recovery: "long" } }) })
      })
    );
    expect(
      useDnd5eSrdAction(
        {
          ...levelFourteenDruidActor,
          data: {
            ...levelFourteenDruidData,
            resources: { ...(levelFourteenDruidData.resources as Record<string, unknown>), moonlightStep: { current: 0, max: 9, recovery: "long" } },
            spellSlots: { ...(levelFourteenDruidData.spellSlots as Record<string, unknown>), level2: { current: 3, max: 3, recovery: "long" } }
          }
        },
        [],
        "feature-moon-moonlight-step",
        { spellSlotLevel: 2 }
      )
    ).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 2,
        consumed: [{ type: "spellSlot", key: "level2", label: "Level 2 Spell Slot", amount: 1, remaining: 2 }],
        data: expect.objectContaining({
          resources: expect.objectContaining({ moonlightStep: { current: 1, max: 9, recovery: "long" } }),
          spellSlots: expect.objectContaining({ level2: { current: 2, max: 3, recovery: "long" } })
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
    let levelNineWizardData = dnd5eSrdCharacterTemplate("wizard")!.data;
    for (let level = 2; level <= 9; level += 1) {
      levelNineWizardData = applyDnd5eSrdAdvancement({ ...wizardActor, data: levelNineWizardData }, "level-up");
    }
    const levelNineWizardActor: Actor = { ...wizardActor, data: levelNineWizardData };
    expect(levelNineWizardData.spellSlots).toEqual({
      level1: { current: 2, max: 4, recovery: "long" },
      level2: { current: 2, max: 3, recovery: "long" },
      level3: { current: 2, max: 3, recovery: "long" },
      level4: { current: 1, max: 3, recovery: "long" },
      level5: { current: 1, max: 1, recovery: "long" }
    });
    const levelNineVitriolicSphere: Item = {
      id: "itm_level_nine_vitriolic_sphere",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: levelNineWizardActor.id,
      type: "spell",
      name: "Vitriolic Sphere",
      data: { ...dnd5eSrdCompendiumEntry("vitriolic-sphere")!.data, compendiumId: "vitriolic-sphere" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(useDnd5eSrdAction(levelNineWizardActor, [levelNineVitriolicSphere], "spell-itm_level_nine_vitriolic_sphere-damage", { spellSlotLevel: 5 })).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        slotLevel: 5,
        consumed: [{ type: "spellSlot", key: "level5", label: "Level 5 Spell Slot", amount: 1, remaining: 0 }],
        data: expect.objectContaining({
          spellSlots: expect.objectContaining({ level5: { current: 0, max: 1, recovery: "long" } })
        })
      })
    );
    let levelFourteenWizardData = levelNineWizardData;
    for (let level = 10; level <= 14; level += 1) {
      levelFourteenWizardData = applyDnd5eSrdAdvancement({ ...wizardActor, data: levelFourteenWizardData }, "level-up");
    }
    const levelFourteenWizardActor: Actor = { ...wizardActor, data: levelFourteenWizardData };
    const levelFourteenMagicMissile: Item = {
      id: "itm_level_fourteen_magic_missile",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: levelFourteenWizardActor.id,
      type: "spell",
      name: "Magic Missile",
      data: { ...dnd5eSrdCompendiumEntry("magic-missile")!.data, compendiumId: "magic-missile" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const web: Item = {
      id: "itm_web",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Web",
      data: { ...dnd5eSrdCompendiumEntry("web")!.data, compendiumId: "web" },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(levelFourteenWizardData.features).toEqual(expect.arrayContaining(["Evoker", "Evocation Savant", "Potent Cantrip", "Sculpt Spells", "Empowered Evocation", "Overchannel"]));
    expect(levelFourteenWizardData.resources).toEqual(expect.objectContaining({ overchannel: { current: 1, max: 1, recovery: "long" } }));
    expect(dnd5eSrdQuickRolls(levelFourteenWizardActor, [levelFourteenMagicMissile])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-evoker-potent-cantrip", label: "Potent Cantrip", formula: "0", metadata: expect.objectContaining({ saveDc: 22 }) }),
        expect.objectContaining({ id: "feature-evoker-sculpt-spells", label: "Sculpt Spells", formula: "0", metadata: expect.objectContaining({ protectedCreatures: "1 + spell level" }) }),
        expect.objectContaining({ id: "feature-evoker-empowered-evocation", label: "Empowered Evocation", formula: "9", metadata: expect.objectContaining({ damageBonus: 9 }) }),
        expect.objectContaining({ id: "feature-evoker-overchannel", label: "Overchannel", formula: "0", metadata: expect.objectContaining({ resource: "overchannel", maximizesDamageDice: true }) }),
        expect.objectContaining({ id: "spell-itm_level_fourteen_magic_missile-damage", label: "Magic Missile Damage", formula: "3d4+3+9" })
      ])
    );
    expect(dnd5eSrdActionFormula(levelFourteenWizardActor, [levelFourteenMagicMissile], "spell-itm_level_fourteen_magic_missile-damage", { spellSlotLevel: 2 })).toBe("3d4+3+1d4+1+9");
    expect(useDnd5eSrdAction(levelFourteenWizardActor, [], "feature-evoker-overchannel").consumed).toEqual([{ type: "resource", key: "overchannel", label: "Overchannel", amount: 1, remaining: 0 }]);
    const barbarianActionActor: Actor = { ...srdActor, data: { ...dnd5eSrdCharacterTemplate("barbarian")!.data } };
    expect(useDnd5eSrdAction(barbarianActionActor, [], "feature-rage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [{ type: "resource", key: "rage", label: "Rage", amount: 1, remaining: 1 }],
        data: expect.objectContaining({ resources: { rage: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(() => useDnd5eSrdAction({ ...barbarianActionActor, data: { ...barbarianActionActor.data, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, [], "feature-rage")).toThrow("Insufficient rage");
    expect(useDnd5eSrdAction(barbarianActionActor, [], "feature-rage-damage-bonus")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Rage"]) })
      })
    );
    const actionLevelTwoBarbarianActor: Actor = { ...barbarianActionActor, data: applyDnd5eSrdAdvancement(barbarianActionActor, "level-up") };
    expect(useDnd5eSrdAction(actionLevelTwoBarbarianActor, [], "feature-reckless-attack")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Reckless Attack"]) })
      })
    );
    const actionLevelThreeBarbarianActor: Actor = { ...barbarianActionActor, data: applyDnd5eSrdAdvancement(actionLevelTwoBarbarianActor, "level-up") };
    expect(useDnd5eSrdAction(actionLevelThreeBarbarianActor, [], "feature-berserker-frenzy-damage")).toEqual(
      expect.objectContaining({
        systemId: "dnd-5e-srd",
        consumed: [],
        data: expect.objectContaining({ features: expect.arrayContaining(["Frenzy"]) })
      })
    );
    let actionLevelFourteenBarbarianData = actionLevelThreeBarbarianActor.data;
    for (let level = 4; level <= 14; level += 1) {
      actionLevelFourteenBarbarianData = applyDnd5eSrdAdvancement({ ...barbarianActionActor, data: actionLevelFourteenBarbarianData }, "level-up");
    }
    const actionLevelFourteenBarbarianActor: Actor = { ...barbarianActionActor, data: actionLevelFourteenBarbarianData };
    expect(useDnd5eSrdAction(actionLevelFourteenBarbarianActor, [], "feature-berserker-mindless-rage").consumed).toEqual([]);
    expect(useDnd5eSrdAction(actionLevelFourteenBarbarianActor, [], "feature-berserker-retaliation").consumed).toEqual([]);
    expect(useDnd5eSrdAction(actionLevelFourteenBarbarianActor, [], "feature-berserker-intimidating-presence").consumed).toEqual([]);
    expect(applyDnd5eSrdRest({ ...barbarianActionActor, data: { ...barbarianActionActor.data, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, "short")).toEqual(
      expect.objectContaining({
        recovered: expect.objectContaining({ resources: expect.objectContaining({ rage: 1 }) }),
        data: expect.objectContaining({ resources: { rage: { current: 1, max: 2, recovery: "short" } } })
      })
    );
    expect(applyDnd5eSrdRest({ ...barbarianActionActor, data: { ...barbarianActionActor.data, level: 3, resources: { rage: { current: 0, max: 2, recovery: "short" } } } }, "long").data.resources).toEqual({ rage: { current: 3, max: 3, recovery: "short" } });
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
    const paralyzedConditioned = applyDnd5eSrdCondition({ ...srdActor, data: conditioned }, "paralyzed", "2026-05-02T00:00:00.000Z");
    expect(dnd5eSrdSheet({ ...srdActor, data: paralyzedConditioned }, []).conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "magic-initiate", name: "Magic Initiate" }),
        expect.objectContaining({ id: "paralyzed", name: "Paralyzed", summary: expect.stringContaining("Strength and Dexterity saves") })
      ])
    );
    const duplicateParalyzed = applyDnd5eSrdCondition({ ...srdActor, data: paralyzedConditioned }, "paralyzed", "2026-05-02T00:01:00.000Z");
    expect((duplicateParalyzed["conditions"] as Array<{ id: string }>).filter((condition) => condition.id === "paralyzed")).toHaveLength(1);
    const exhausted = applyDnd5eSrdCondition(srdActor, "exhaustion", "2026-05-02T00:02:00.000Z", { level: 2 });
    expect(dnd5eSrdSheet({ ...srdActor, data: exhausted }, []).conditions).toContainEqual(expect.objectContaining({ id: "exhaustion", level: 2 }));
    const exhaustedAgain = applyDnd5eSrdCondition({ ...srdActor, data: exhausted }, "exhaustion", "2026-05-02T00:03:00.000Z");
    expect(exhaustedAgain.conditions).toEqual([{ id: "exhaustion", appliedAt: "2026-05-02T00:03:00.000Z", level: 3 }]);

    const imported = dnd5eSrdCharacterImport({
      name: "Imported SRD Cleric",
      data: {
        level: 3,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        conditions: ["magic-initiate", "paralyzed", "unconscious", "missing-condition"],
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
        conditions: [{ id: "magic-initiate" }, { id: "paralyzed" }, { id: "unconscious" }],
        saveProficiencies: ["wisdom", "charisma"],
        skillProficiencies: ["medicine", "religion"],
        toolProficiencies: ["calligraphers-supplies"],
        spellSlots: { level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }
      },
      items: [{ entryId: "healing-word" }, { entryId: "longsword" }]
    });
    expect(imported.warnings).toEqual(["Unknown condition skipped: missing-condition", "Unknown compendium entry skipped: missing-item"]);
  });

  it("resolves D&D actions with target-aware rolls, engine state, and manual prompts", () => {
    const attacker: Actor = {
      ...srdActor,
      id: "act_rules_attacker",
      name: "Rules Attacker",
      data: { ...srdActor.data, conditions: [{ id: "poisoned" }] }
    };
    const target: Actor = {
      ...srdActor,
      id: "act_rules_target",
      name: "Restrained Target",
      data: { ...srdActor.data, conditions: [{ id: "restrained" }] }
    };
    const shortbow: Item = {
      id: "itm_rules_shortbow",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: attacker.id,
      type: "item",
      name: "Shortbow",
      data: dnd5eSrdCompendiumEntry("shortbow")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const shortbowAttack = dnd5eSrdQuickRolls(attacker, [shortbow]).find((roll) => roll.id === "item-itm_rules_shortbow-attack")!;
    const targetAwareAttack = resolveDnd5eSrdAction({ actor: attacker, items: [shortbow], roll: shortbowAttack, targets: [{ actor: target }] });
    expect(targetAwareAttack.rolls[0]).toEqual(
      expect.objectContaining({
        formula: "1d20+3",
        d20Mode: "normal",
        advantageSources: ["Restrained Target: Restrained"],
        disadvantageSources: ["Poisoned"]
      })
    );
    const exposedTarget: Actor = { ...target, id: "act_rules_exposed_target", name: "Exposed Target", data: { ...target.data, conditions: [] } };
    const multiTargetAttack = resolveDnd5eSrdAction({ actor: attacker, items: [shortbow], roll: shortbowAttack, targets: [{ actor: target }, { actor: exposedTarget }] });
    expect(multiTargetAttack.rolls).toEqual([
      expect.objectContaining({ targetActorId: target.id, formula: "1d20+3", d20Mode: "normal" }),
      expect.objectContaining({ targetActorId: exposedTarget.id, formula: "2d20kl1+3", d20Mode: "disadvantage" })
    ]);

    const fighterActor: Actor = {
      ...srdActor,
      id: "act_rules_fighter",
      name: "Rules Fighter",
      data: { ...dnd5eSrdCharacterTemplate("fighter")!.data, hp: { current: 1, max: 12 }, resources: { secondWind: { current: 2, max: 2, recovery: "short" } } }
    };
    const secondWindRoll = dnd5eSrdQuickRolls(fighterActor, []).find((roll) => roll.id === "feature-second-wind-healing")!;
    const selfHealing = resolveDnd5eSrdAction({
      actor: fighterActor,
      roll: secondWindRoll,
      targets: [{ actor: fighterActor, rollTotal: 5 }],
      options: { consumeResources: true, applyEffect: true }
    });
    expect(selfHealing.effects).toContainEqual(expect.objectContaining({ type: "healing", targetActorId: fighterActor.id, before: 1, after: 6, amount: 5 }));
    expect(selfHealing.actorUpdates).toContainEqual(
      expect.objectContaining({
        actorId: fighterActor.id,
        after: expect.objectContaining({ hp: { current: 6, max: 12 }, resources: { secondWind: { current: 1, max: 2, recovery: "short" } } })
      })
    );

    const stunned = resolveDnd5eSrdAction({ actor: { ...attacker, data: { ...attacker.data, conditions: [{ id: "stunned" }] } }, items: [shortbow], roll: shortbowAttack });
    expect(stunned.blocked).toEqual(expect.objectContaining({ code: "action_blocked", reason: expect.stringContaining("Stunned") }));

    const bless: Item = {
      id: "itm_rules_bless",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Bless",
      data: dnd5eSrdCompendiumEntry("bless")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const blessRoll = dnd5eSrdQuickRolls(srdActor, [bless]).find((roll) => roll.id === "spell-itm_rules_bless-effect")!;
    const concentration = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [bless],
      roll: blessRoll,
      targets: [{ actor: target }],
      options: { consumeResources: true },
      now: "2026-05-02T00:00:00.000Z"
    });
    expect(concentration.resourceConsumption).toEqual([{ type: "spellSlot", key: "level1", label: "Level 1 Spell Slot", amount: 1, remaining: 0 }]);
    expect(concentration.conditions).toContainEqual(expect.objectContaining({ operation: "startConcentration", actorId: srdActor.id }));
    expect(concentration.actorUpdates[0]?.after.rulesEngine).toEqual(
      expect.objectContaining({
        concentration: expect.objectContaining({ rollId: "spell-itm_rules_bless-effect", targetActorIds: [target.id] })
      })
    );

    const concentrationBreak = resolveDnd5eSrdConcentrationDamage(
      { ...srdActor, data: concentration.actorUpdates[0]!.after },
      24,
      "failure",
      "2026-05-02T00:00:01.000Z",
      "monster-claw-damage"
    );
    expect(concentrationBreak.condition).toEqual(expect.objectContaining({ operation: "breakConcentration", reason: expect.stringContaining("DC 12") }));
    expect((concentrationBreak.data.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();

    const wand: Item = {
      id: "itm_rules_wand",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "item",
      name: "Wand of Paralysis",
      data: dnd5eSrdCompendiumEntry("wand-of-paralysis")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const paralysisRoll = dnd5eSrdQuickRolls(srdActor, [wand]).find((roll) => roll.id === "item-itm_rules_wand-effect")!;
    const pendingParalysis = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [wand],
      roll: paralysisRoll,
      targets: [{ actor: target }],
      options: { applyEffect: true },
      now: "2026-05-02T00:00:02.000Z"
    });
    expect(pendingParalysis.pendingSaves).toContainEqual(expect.objectContaining({ actorId: target.id, ability: "constitution", dc: 15, requiredForCommit: true }));
    expect(pendingParalysis.effects).toEqual([]);
    expect(pendingParalysis.actorUpdates.find((update) => update.actorId === target.id)).toBeUndefined();

    const paralysis = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [wand],
      roll: paralysisRoll,
      targets: [{ actor: target }],
      combat: { id: "cmb_rules", campaignId: "camp_demo", active: true, round: 3, turnIndex: 0, combatants: [], createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
      options: { applyEffect: true, saveOutcomes: { [target.id]: "failure" } },
      now: "2026-05-02T00:00:02.000Z"
    });
    expect(paralysis.conditions).toContainEqual(expect.objectContaining({ operation: "apply", actorId: target.id, conditionId: "paralyzed", durationRounds: 10, expiresAtRound: 13, repeatSave: "end of each turn" }));
    expect(paralysis.pendingSaves).toContainEqual(expect.objectContaining({ actorId: target.id, recurring: true, timing: "end of each turn", conditionIds: ["paralyzed"] }));
    expect(paralysis.effects).toContainEqual(expect.objectContaining({ type: "condition", targetActorId: target.id, conditionId: "paralyzed" }));
    expect(paralysis.actorUpdates.find((update) => update.actorId === target.id)?.after.rulesEngine).toEqual(
      expect.objectContaining({
        activeEffects: expect.arrayContaining([expect.objectContaining({ rollId: "item-itm_rules_wand-effect", conditionIds: ["paralyzed"], durationRounds: 10, repeatSave: "end of each turn" })])
      })
    );
    expect(paralysis.actorUpdates.find((update) => update.actorId === target.id)?.after.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "paralyzed" })]));

    const dragonsBreath: Item = {
      id: "itm_rules_dragons_breath",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Dragon's Breath",
      data: dnd5eSrdCompendiumEntry("dragons-breath")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const dragonsBreathRoll = dnd5eSrdQuickRolls(srdActor, [dragonsBreath]).find((roll) => roll.id === "spell-itm_rules_dragons_breath-damage")!;
    const pendingDragonChoice = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [dragonsBreath],
      roll: dragonsBreathRoll,
      targets: [{ actor: target, rollTotal: 10 }],
      options: { applyEffect: true, saveOutcomes: { [target.id]: "failure" } }
    });
    expect(pendingDragonChoice.pendingChoice).toEqual(expect.objectContaining({ kind: "damageType", options: expect.arrayContaining(["fire"]) }));
    const fireBreath = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [dragonsBreath],
      roll: dragonsBreathRoll,
      targets: [{ actor: target, rollTotal: 10 }],
      options: { applyEffect: true, effectChoice: "fire", saveOutcomes: { [target.id]: "failure" } }
    });
    expect(fireBreath.pendingChoice).toBeUndefined();
    expect(fireBreath.effects).toContainEqual(expect.objectContaining({ type: "damage", targetActorId: target.id, damageType: "fire", effectChoice: "fire", choiceKind: "damageType" }));

    const protectionFromEnergy: Item = {
      id: "itm_rules_protection_from_energy",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Protection from Energy",
      data: dnd5eSrdCompendiumEntry("protection-from-energy")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const protectionRoll = dnd5eSrdQuickRolls(srdActor, [protectionFromEnergy]).find((roll) => roll.id === "spell-itm_rules_protection_from_energy-effect")!;
    const pendingProtectionChoice = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [protectionFromEnergy],
      roll: protectionRoll,
      targets: [{ actor: target }],
      options: { applyEffect: true }
    });
    expect(pendingProtectionChoice.pendingChoice).toEqual(expect.objectContaining({ kind: "resistance", options: expect.arrayContaining(["Fire"]) }));
    const fireProtection = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [protectionFromEnergy],
      roll: protectionRoll,
      targets: [{ actor: target }],
      options: { applyEffect: true, effectChoice: "Fire" },
      now: "2026-05-02T00:00:03.000Z"
    });
    expect(fireProtection.pendingChoice).toBeUndefined();
    expect(fireProtection.manualResolutionRequired).toBeUndefined();
    expect(fireProtection.effects).toContainEqual(expect.objectContaining({ type: "utility", targetActorId: target.id, resistance: ["fire"], effectChoice: "Fire", choiceKind: "resistance" }));
    expect(fireProtection.actorUpdates.find((update) => update.actorId === target.id)?.after.rulesEngine).toEqual(
      expect.objectContaining({
        activeEffects: expect.arrayContaining([expect.objectContaining({ rollId: "spell-itm_rules_protection_from_energy-effect", resistance: ["fire"], effectChoice: "Fire" })])
      })
    );

    const eyebite: Item = {
      id: "itm_rules_eyebite",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Eyebite",
      data: dnd5eSrdCompendiumEntry("eyebite")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const eyebiteRoll = dnd5eSrdQuickRolls(srdActor, [eyebite]).find((roll) => roll.id === "spell-itm_rules_eyebite-effect")!;
    const panickedEyebite = resolveDnd5eSrdAction({
      actor: srdActor,
      items: [eyebite],
      roll: eyebiteRoll,
      targets: [{ actor: target }],
      options: { applyEffect: true, effectChoice: "Panicked", saveOutcomes: { [target.id]: "failure" } }
    });
    expect(panickedEyebite.pendingChoice).toBeUndefined();
    expect(panickedEyebite.effects).toContainEqual(expect.objectContaining({ type: "condition", targetActorId: target.id, conditionId: "frightened", effectChoice: "Panicked", choiceKind: "effect" }));

    const dragon: Actor = {
      ...srdActor,
      id: "act_rules_dragon",
      type: "monster",
      name: "Young Red Dragon",
      data: dnd5eSrdMonsterActorData("young-red-dragon")!
    };
    const breath = dnd5eSrdQuickRolls(dragon, []).find((roll) => roll.id === "monster-fire-breath-damage")!;
    expect(resolveDnd5eSrdAction({ actor: dragon, roll: breath, options: { rechargeCheck: 3 } }).blocked).toEqual(expect.objectContaining({ code: "recharge_unavailable" }));
    const spentBreath = resolveDnd5eSrdAction({ actor: dragon, roll: breath, options: { rechargeCheck: 5 } });
    expect(spentBreath.warnings).toEqual(expect.arrayContaining([expect.stringContaining("need recharge 5-6")]));
    expect(spentBreath.actorUpdates[0]?.after.rulesEngine).toEqual(expect.objectContaining({ recharge: expect.objectContaining({ "monster-fire-breath-damage": expect.objectContaining({ available: false }) }) }));

    const thief: Actor = {
      ...srdActor,
      data: { ...srdActor.data, class: "Rogue", subclass: "Thief", level: 13, features: ["Use Magic Device"] }
    };
    expect(dnd5eSrdAttunementLimit(thief)).toBe(4);
    const overAttuned = resolveDnd5eSrdAction({
      actor: { ...srdActor, data: { ...srdActor.data, rulesEngine: { attunedItemIds: ["a", "b", "c", "d"] } } },
      roll: { id: "feature-thief-use-magic-device", label: "Use Magic Device", formula: "1d6" }
    });
    expect(overAttuned.attunement).toEqual(expect.objectContaining({ limit: 3, overLimitBy: 1 }));

    const command: Item = {
      id: "itm_rules_command",
      campaignId: "camp_demo",
      systemId: "dnd-5e-srd",
      actorId: srdActor.id,
      type: "spell",
      name: "Command",
      data: dnd5eSrdCompendiumEntry("command")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const commandRoll = dnd5eSrdQuickRolls(srdActor, [command]).find((roll) => roll.id === "spell-itm_rules_command-effect")!;
    expect(resolveDnd5eSrdAction({ actor: srdActor, items: [command], roll: commandRoll }).manualResolutionRequired).toEqual(
      expect.objectContaining({ reason: expect.stringContaining("needs GM/manual resolution") })
    );
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
        expect.objectContaining({ id: "gear-itm_carbine-damage", label: "Laser Carbine Damage", formula: "1d8+2" }),
        expect.objectContaining({ id: "talent-itm_overclock-boost", label: "Overclock Boost", formula: "1d6+3" })
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

  it("applies Stellar Frontiers resource-backed condition cleanup actions", () => {
    const evasiveBurst: Item = {
      id: "itm_evasive",
      campaignId: "camp_demo",
      systemId: "stellar-frontiers",
      actorId: pilot.id,
      type: "talent",
      name: "Evasive Burst",
      data: stellarFrontiersCompendiumEntry("evasive-burst")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const hullSealant: Item = {
      id: "itm_sealant",
      campaignId: "camp_demo",
      systemId: "stellar-frontiers",
      actorId: pilot.id,
      type: "gear",
      name: "Hull Sealant",
      data: stellarFrontiersCompendiumEntry("hull-sealant")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const fieldRepair: Item = {
      id: "itm_field_repair",
      campaignId: "camp_demo",
      systemId: "stellar-frontiers",
      actorId: pilot.id,
      type: "talent",
      name: "Field Repair",
      data: stellarFrontiersCompendiumEntry("field-repair")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const readyPilot: Actor = {
      ...pilot,
      data: {
        ...pilot.data,
        resources: {
          evasiveBurst: { current: 1, max: 1, recovery: "short" },
          fieldRepair: { current: 1, max: 2, recovery: "long" }
        },
        conditions: [{ id: "jammed" }, { id: "vacuum-exposed" }]
      }
    };

    expect(stellarFrontiersSheet(readyPilot, [evasiveBurst, hullSealant, fieldRepair]).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "talent-itm_evasive-boost",
          formula: "1d8+1",
          metadata: expect.objectContaining({ resourceCost: { resource: "evasiveBurst", amount: 1 }, clearsCondition: "jammed" })
        }),
        expect.objectContaining({
          id: "gear-itm_sealant-healing",
          formula: "1d4+1",
          metadata: expect.objectContaining({ consumable: true, clearsCondition: "vacuum-exposed" })
        }),
        expect.objectContaining({
          id: "talent-itm_field_repair-healing",
          formula: "1d6+3",
          metadata: expect.objectContaining({ resourceCost: { resource: "fieldRepair", amount: 1 }, clearsCondition: "jammed", aptitude: "tech" })
        })
      ])
    );

    const maneuvered = useStellarFrontiersAction(readyPilot, [evasiveBurst], "talent-itm_evasive-boost");
    expect(maneuvered.consumed).toEqual([{ type: "resource", key: "evasiveBurst", label: "Evasive Burst", amount: 1, remaining: 0 }]);
    expect(maneuvered.data.resources).toEqual({
      evasiveBurst: { current: 0, max: 1, recovery: "short" },
      fieldRepair: { current: 1, max: 2, recovery: "long" }
    });
    expect(maneuvered.data.conditions).toEqual([{ id: "vacuum-exposed" }]);

    const sealed = useStellarFrontiersAction({ ...readyPilot, data: maneuvered.data }, [hullSealant], "gear-itm_sealant-healing");
    expect(sealed.consumed).toEqual([{ type: "itemQuantity", key: "itm_sealant", label: "Hull Sealant", amount: 1, remaining: 0 }]);
    expect(sealed.data.conditions).toEqual([]);
    expect(sealed.items).toEqual([expect.objectContaining({ id: "itm_sealant", data: expect.objectContaining({ quantity: 0 }) })]);

    const repaired = useStellarFrontiersAction(readyPilot, [fieldRepair], "talent-itm_field_repair-healing");
    expect(repaired.consumed).toEqual([{ type: "resource", key: "fieldRepair", label: "Field Repair", amount: 1, remaining: 0 }]);
    expect(repaired.data.resources).toEqual({
      evasiveBurst: { current: 1, max: 1, recovery: "short" },
      fieldRepair: { current: 0, max: 2, recovery: "long" }
    });
    expect(repaired.data.conditions).toEqual([{ id: "vacuum-exposed" }]);
  });

  it("provides guided sci-fi templates and rank advancement", () => {
    const shipTech = stellarFrontiersCharacterTemplate("ship-tech");
    expect(shipTech).toEqual(expect.objectContaining({ name: "Ship Tech", actorType: "character" }));
    expect(shipTech?.items.map((item) => item.entryId)).toEqual(["med-patch", "overclock", "field-repair"]);

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
        expect.objectContaining({ id: "clue-itm_notebook-insight", label: "Case Notebook Insight", formula: "1d4+3" }),
        expect.objectContaining({ id: "ritual-itm_warding_rite-ward", label: "Warding Rite Ward", formula: "1d6+2" })
      ])
    );
  });

  it("adds case-pressure condition automation and deeper clue and ritual rolls", () => {
    const exposedData = applyMysticNoirCondition(investigator, "exposed", "2026-05-01T00:00:00.000Z");
    const pressuredInvestigator = { ...investigator, data: exposedData };
    const stealthRoll = mysticNoirQuickRolls(pressuredInvestigator).find((roll) => roll.id === "skill-stealth");
    expect(stealthRoll).toEqual(
      expect.objectContaining({
        formula: "2d20kl1+2",
        metadata: expect.objectContaining({ conditionRollMode: "disadvantage", conditionSources: ["exposed"] })
      })
    );
    expect(mysticNoirQuickRolls(pressuredInvestigator).find((roll) => roll.id === "skill-investigation")?.formula).toBe("1d20+3");

    const bolsteredData = applyMysticNoirCondition(investigator, "bolstered", "2026-05-01T00:00:01.000Z");
    const bolsteredInvestigator = { ...investigator, data: bolsteredData };
    expect(mysticNoirQuickRolls(bolsteredInvestigator).find((roll) => roll.id === "skill-occult")).toEqual(
      expect.objectContaining({
        formula: "1d20+1+1d6",
        metadata: expect.objectContaining({ conditionBonusSources: ["bolstered"], conditionSources: ["bolstered"] })
      })
    );

    const informant: Item = {
      id: "itm_informant",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "clue",
      name: "Informant Network",
      data: mysticNoirCompendiumEntry("informant-network")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const sigil: Item = {
      id: "itm_sigil",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "ritual",
      name: "Banishing Sigil",
      data: mysticNoirCompendiumEntry("banishing-sigil")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const stakeout: Item = {
      id: "itm_stakeout",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "clue",
      name: "Midnight Stakeout",
      data: mysticNoirCompendiumEntry("midnight-stakeout")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const mantra: Item = {
      id: "itm_mantra",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "ritual",
      name: "Grounding Mantra",
      data: mysticNoirCompendiumEntry("grounding-mantra")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    expect(mysticNoirCompendiumEntry("banishing-sigil")).toEqual(expect.objectContaining({ type: "ritual", name: "Banishing Sigil" }));
    expect(mysticNoirSheet(investigator, [informant, sigil, stakeout, mantra]).quickRolls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "clue-itm_informant-insight",
          formula: "1d6+1",
          metadata: expect.objectContaining({ pressureCondition: "marked", resourceCost: { resource: "lead", amount: 1 } })
        }),
        expect.objectContaining({
          id: "ritual-itm_sigil-pressure",
          formula: "2d6+1",
          metadata: expect.objectContaining({ clearsCondition: "exposed", resourceCost: { resource: "ward", amount: 1 } })
        }),
        expect.objectContaining({
          id: "clue-itm_stakeout-insight",
          formula: "1d4+2",
          metadata: expect.objectContaining({ composureCost: 1, pressureCondition: "exposed" })
        }),
        expect.objectContaining({
          id: "ritual-itm_mantra-ward",
          formula: "1d4+2",
          metadata: expect.objectContaining({ composureHeal: 2, clearsCondition: "shaken" })
        })
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

  it("applies Mystic Noir clue pressure and ritual condition cleanup", () => {
    const informant: Item = {
      id: "itm_informant",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "clue",
      name: "Informant Network",
      data: mysticNoirCompendiumEntry("informant-network")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const sigil: Item = {
      id: "itm_sigil",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "ritual",
      name: "Banishing Sigil",
      data: mysticNoirCompendiumEntry("banishing-sigil")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const readyInvestigator: Actor = {
      ...investigator,
      data: {
        ...investigator.data,
        resources: {
          lead: { current: 1, max: 2, recovery: "long" },
          ward: { current: 1, max: 1, recovery: "short" }
        },
        conditions: [{ id: "exposed" }]
      }
    };

    const pressured = useMysticNoirAction(readyInvestigator, [informant], `clue-${informant.id}-insight`);
    expect(pressured.consumed).toEqual([{ type: "resource", key: "lead", label: "Lead", amount: 1, remaining: 0 }]);
    expect(pressured.data.conditions).toEqual([{ id: "exposed" }, { id: "marked" }]);

    const cleansed = useMysticNoirAction({ ...readyInvestigator, data: pressured.data }, [sigil], `ritual-${sigil.id}-pressure`);
    expect(cleansed.consumed).toEqual([{ type: "resource", key: "ward", label: "Ward", amount: 1, remaining: 0 }]);
    expect(cleansed.data.conditions).toEqual([{ id: "marked" }]);
  });

  it("applies Mystic Noir composure costs and recovery from clue and ritual actions", () => {
    const stakeout: Item = {
      id: "itm_stakeout",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "clue",
      name: "Midnight Stakeout",
      data: mysticNoirCompendiumEntry("midnight-stakeout")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const mantra: Item = {
      id: "itm_mantra",
      campaignId: "camp_demo",
      systemId: "mystic-noir",
      actorId: investigator.id,
      type: "ritual",
      name: "Grounding Mantra",
      data: mysticNoirCompendiumEntry("grounding-mantra")!.data,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    };
    const readyInvestigator: Actor = {
      ...investigator,
      data: {
        ...investigator.data,
        composure: { current: 2, max: 6 },
        resources: {
          lead: { current: 1, max: 2, recovery: "long" },
          ward: { current: 1, max: 1, recovery: "short" }
        },
        conditions: [{ id: "shaken" }]
      }
    };

    const exposed = useMysticNoirAction(readyInvestigator, [stakeout], `clue-${stakeout.id}-insight`);
    expect(exposed.consumed).toEqual([
      { type: "resource", key: "lead", label: "Lead", amount: 1, remaining: 0 },
      { type: "composure", key: "composure", label: "Composure", amount: 1, remaining: 1 }
    ]);
    expect(exposed.data.composure).toEqual({ current: 1, max: 6 });
    expect(exposed.data.conditions).toEqual([{ id: "shaken" }, { id: "exposed" }]);

    const grounded = useMysticNoirAction({ ...readyInvestigator, data: exposed.data }, [mantra], `ritual-${mantra.id}-ward`);
    expect(grounded.consumed).toEqual([{ type: "resource", key: "ward", label: "Ward", amount: 1, remaining: 0 }]);
    expect(grounded.data.composure).toEqual({ current: 3, max: 6 });
    expect(grounded.data.conditions).toEqual([{ id: "exposed" }]);
    expect(() => useMysticNoirAction({ ...readyInvestigator, data: { ...readyInvestigator.data, composure: { current: 0, max: 6 } } }, [stakeout], `clue-${stakeout.id}-insight`)).toThrow("Insufficient composure");
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
