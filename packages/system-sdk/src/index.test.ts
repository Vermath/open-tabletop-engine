import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyGenericFantasyAdvancement, applyGenericFantasyCondition, applyStellarFrontiersAdvancement, applyStellarFrontiersCondition, genericFantasyActorConditions, genericFantasyAdvancementOptions, genericFantasyCharacterTemplate, genericFantasyCompendiumEntry, genericFantasyEncounterPlan, genericFantasyEncounterThreats, genericFantasyQuickRolls, genericFantasySheet, removeGenericFantasyCondition, removeStellarFrontiersCondition, stellarFrontiersActorConditions, stellarFrontiersAdvancementOptions, stellarFrontiersCharacterTemplate, stellarFrontiersCompendiumEntry, stellarFrontiersEncounterPlan, stellarFrontiersEncounterThreats, stellarFrontiersQuickRolls, stellarFrontiersSheet } from "./index.js";

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
        data: {},
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
        data: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(genericFantasyCompendiumEntry("healing-word")).toEqual(expect.objectContaining({ type: "spell", name: "Healing Word" }));
    const sheet = genericFantasySheet(actor, items);
    expect(sheet.inventory.map((item) => item.name)).toEqual(["Longsword"]);
    expect(sheet.spells.map((item) => item.name)).toEqual(["Healing Word"]);
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
        data: {},
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
        data: {},
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      }
    ];

    expect(stellarFrontiersCompendiumEntry("laser-carbine")).toEqual(expect.objectContaining({ type: "gear", name: "Laser Carbine" }));
    const sheet = stellarFrontiersSheet(pilot, items);
    expect(sheet.summary).toContain("Nova Quill");
    expect(sheet.inventory.map((item) => item.name)).toEqual(["Laser Carbine"]);
    expect(sheet.talents.map((item) => item.name)).toEqual(["Overclock"]);
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
});
