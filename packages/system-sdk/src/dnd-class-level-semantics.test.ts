import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import {
  dnd5eSrdActionFormula,
  dnd5eSrdActorClassLevels,
  dnd5eSrdCharacterLevel,
  dnd5eSrdClassLevel,
  dnd5eSrdQuickRolls,
  dnd5eSrdSheet,
  useDnd5eSrdAction
} from "./index.js";

const timestamp = "2026-07-15T00:00:00.000Z";

function multiclassActor(classes: Array<{ className: string; level: number }>, primary = classes[0]!.className): Actor {
  return {
    id: `act_${classes.map((entry) => entry.className.toLowerCase()).join("_")}`,
    campaignId: "camp_class_levels",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Multiclass Test",
    data: {
      ruleset: "SRD 5.2.1",
      class: primary,
      level: classes.reduce((sum, entry) => sum + entry.level, 0),
      classes,
      attributes: { strength: 16, dexterity: 14, constitution: 16, intelligence: 14, wisdom: 16, charisma: 16 },
      hp: { current: 40, max: 40 },
      hitDice: { current: 1, max: 1, size: "d10" },
      features: [],
      resources: {},
      conditions: []
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function quickRoll(actor: Actor, rollId: string) {
  return dnd5eSrdQuickRolls(actor).find((roll) => roll.id === rollId);
}

describe("D&D class-local runtime semantics", () => {
  it("uses one case-insensitive per-class lookup with legacy and custom-class compatibility", () => {
    const actor = multiclassActor([{ className: "Fighter", level: 2 }, { className: "Chronomancer", level: 3 }]);
    expect(dnd5eSrdActorClassLevels(actor)).toEqual([{ className: "Fighter", level: 2 }, { className: "Chronomancer", level: 3 }]);
    expect(dnd5eSrdClassLevel(actor, "fighter")).toBe(2);
    expect(dnd5eSrdClassLevel(actor, "CHRONOMANCER")).toBe(3);
    expect(dnd5eSrdCharacterLevel(actor)).toBe(5);

    const legacy = { ...actor, data: { ...actor.data, class: "Wizard", level: 7, classes: undefined } };
    expect(dnd5eSrdActorClassLevels(legacy)).toEqual([{ className: "Wizard", level: 7 }]);
    expect(dnd5eSrdClassLevel(legacy, "Wizard")).toBe(7);
  });

  it("does not unlock Fighter 2 features from total character level and does unlock them for a non-primary Fighter", () => {
    const fighterOne = multiclassActor([{ className: "Fighter", level: 1 }, { className: "Wizard", level: 19 }], "Fighter");
    expect(quickRoll(fighterOne, "feature-action-surge")).toBeUndefined();
    expect(quickRoll(fighterOne, "feature-tactical-mind-bonus")).toBeUndefined();

    const fighterTwo = multiclassActor([{ className: "Wizard", level: 18 }, { className: "Fighter", level: 2 }], "Wizard");
    expect(quickRoll(fighterTwo, "feature-action-surge")).toEqual(expect.objectContaining({ formula: "0" }));
    expect(quickRoll(fighterTwo, "feature-tactical-mind-bonus")).toEqual(expect.objectContaining({ formula: "1d10" }));
  });

  it("scales class formulas and resource defaults from the granting class", () => {
    const actor = multiclassActor([
      { className: "Fighter", level: 15 },
      { className: "Barbarian", level: 1 },
      { className: "Bard", level: 1 },
      { className: "Paladin", level: 1 },
      { className: "Monk", level: 1 }
    ]);

    expect(dnd5eSrdActionFormula(actor, [], "feature-rage-damage-bonus")).toBe("2");
    expect(dnd5eSrdActionFormula(actor, [], "feature-bardic-inspiration")).toBe("1d6");
    expect(dnd5eSrdActionFormula(actor, [], "feature-martial-arts-damage")).toBe("1d6+2");
    expect(quickRoll(actor, "feature-lay-on-hands-healing")?.metadata).toEqual(expect.objectContaining({ pool: 5 }));

    const rage = useDnd5eSrdAction(actor, [], "feature-rage");
    expect(rage.consumed).toEqual([expect.objectContaining({ key: "rage", amount: 1, remaining: 1 })]);
    expect((rage.data.resources as Record<string, { max: number }>).rage?.max).toBe(2);
  });

  it("takes the best Extra Attack progression without treating total level as Fighter level", () => {
    const actor = multiclassActor([
      { className: "Fighter", level: 4 },
      { className: "Barbarian", level: 3 },
      { className: "Wizard", level: 3 }
    ]);
    const weapon: Item = {
      id: "itm_longsword",
      campaignId: actor.campaignId,
      systemId: actor.systemId,
      actorId: actor.id,
      type: "item",
      name: "Longsword",
      data: { category: "weapon", weaponCategory: "martial", damage: "1d8", ability: "strength" },
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const attack = dnd5eSrdQuickRolls(actor, [weapon]).find((roll) => roll.id === `item-${weapon.id}-attack`);
    expect(attack?.metadata?.attacksPerAction).toBeUndefined();

    const fighterFive = { ...actor, data: { ...actor.data, level: 11, classes: [{ className: "Fighter", level: 5 }, { className: "Barbarian", level: 3 }, { className: "Wizard", level: 3 }] } };
    expect(dnd5eSrdQuickRolls(fighterFive, [weapon]).find((roll) => roll.id === `item-${weapon.id}-attack`)?.metadata?.attacksPerAction).toBe(2);
  });

  it("offers non-primary Unarmored Defense with the correct shield restrictions in either class order", () => {
    const monkFirst = multiclassActor([{ className: "Monk", level: 1 }, { className: "Fighter", level: 4 }], "Fighter");
    const monkLast = multiclassActor([{ className: "Fighter", level: 4 }, { className: "Monk", level: 1 }], "Fighter");
    expect(dnd5eSrdSheet(monkFirst).data.armorClass).toBe(15);
    expect(dnd5eSrdSheet(monkLast).data.armorClass).toBe(15);

    const barbarian = multiclassActor([{ className: "Fighter", level: 4 }, { className: "Barbarian", level: 1 }], "Fighter");
    expect(dnd5eSrdSheet(barbarian).data.armorClass).toBe(15);

    const shield: Item = {
      id: "itm_shield",
      campaignId: monkLast.campaignId,
      systemId: monkLast.systemId,
      actorId: monkLast.id,
      type: "item",
      name: "Shield",
      data: { equipped: true, armorBonus: 2 },
      createdAt: timestamp,
      updatedAt: timestamp
    };
    expect(dnd5eSrdSheet(monkLast, [shield]).data.armorClass).toBe(14);
    expect(dnd5eSrdSheet({ ...barbarian, id: monkLast.id }, [shield]).data.armorClass).toBe(17);
  });
});
