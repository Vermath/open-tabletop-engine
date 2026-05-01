import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyGenericFantasyAdvancement, applyGenericFantasyCondition, applyGenericFantasyRest, applyMysticNoirAdvancement, applyMysticNoirCondition, applyMysticNoirRest, applyStellarFrontiersAdvancement, applyStellarFrontiersCondition, applyStellarFrontiersRest, genericFantasyActorConditions, genericFantasyAdvancementOptions, genericFantasyCharacterImport, genericFantasyCharacterTemplate, genericFantasyCompendiumEntry, genericFantasyEncounterPlan, genericFantasyEncounterThreats, genericFantasyQuickRolls, genericFantasySheet, mysticNoirActorConditions, mysticNoirAdvancementOptions, mysticNoirCharacterImport, mysticNoirCharacterTemplate, mysticNoirCompendiumEntry, mysticNoirEncounterPlan, mysticNoirEncounterThreats, mysticNoirQuickRolls, mysticNoirSheet, removeGenericFantasyCondition, removeMysticNoirCondition, removeStellarFrontiersCondition, stellarFrontiersActorConditions, stellarFrontiersAdvancementOptions, stellarFrontiersCharacterImport, stellarFrontiersCharacterTemplate, stellarFrontiersCompendiumEntry, stellarFrontiersEncounterPlan, stellarFrontiersEncounterThreats, stellarFrontiersQuickRolls, stellarFrontiersSheet } from "./index.js";

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
