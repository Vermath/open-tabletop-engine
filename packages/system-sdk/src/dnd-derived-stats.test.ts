import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { dnd5eSrdSpeed } from "./index.js";

const timestamp = "2026-07-17T00:00:00.000Z";
function actor(classes: Array<{ className: string; level: number }>): Actor {
  return {
    id: "actor-speed",
    campaignId: "campaign-speed",
    systemId: "dnd-5e-srd",
    type: "character",
    name: "Speed Test",
    data: {
      class: classes[0]?.className,
      level: classes.reduce((sum, entry) => sum + entry.level, 0),
      classes,
      speed: 30,
      attributes: { strength: 16, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 },
      conditions: []
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function equipment(id: string, data: Record<string, unknown>): Item {
  return { id, campaignId: "campaign-speed", actorId: "actor-speed", systemId: "dnd-5e-srd", type: "item", name: id, data: { quantity: 1, equipped: true, equipmentCategory: "armor", ...data }, createdAt: timestamp, updatedAt: timestamp };
}

describe("D&D effective class speed", () => {
  it.each([
    [1, 0], [2, 10], [5, 10], [6, 15], [10, 20], [14, 25], [18, 30]
  ])("applies Monk Unarmored Movement at level %i", (level, expectedBonus) => {
    expect(dnd5eSrdSpeed(actor([{ className: "Monk", level }]))).toEqual(expect.objectContaining({ value: 30 + expectedBonus, classBonus: expectedBonus }));
  });

  it("removes Monk movement for armor or a shield", () => {
    const monk = actor([{ className: "Monk", level: 10 }]);
    expect(dnd5eSrdSpeed(monk, [equipment("leather", { armorBase: 11, armorType: "light" })])).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
    expect(dnd5eSrdSpeed(monk, [equipment("shield", { armorBonus: 2, armorType: "shield" })])).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
  });

  it("uses the same structural armor predicate for legacy items without equipmentCategory", () => {
    const monk = actor([{ className: "Monk", level: 10 }]);
    expect(dnd5eSrdSpeed(monk, [equipment("legacy-leather", { equipmentCategory: undefined, armorBase: 11, armorType: "light" })])).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
    expect(dnd5eSrdSpeed(monk, [equipment("legacy-shield", { equipmentCategory: undefined, armorBonus: 2, armorType: "shield" })])).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
  });

  it("applies Barbarian Fast Movement from level 5 unless wearing heavy armor", () => {
    expect(dnd5eSrdSpeed(actor([{ className: "Barbarian", level: 4 }]))).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
    const barbarian = actor([{ className: "Barbarian", level: 5 }]);
    expect(dnd5eSrdSpeed(barbarian)).toEqual(expect.objectContaining({ value: 40, classBonus: 10, classSources: ["barbarian-fast-movement"] }));
    expect(dnd5eSrdSpeed(barbarian, [equipment("scale-mail", { armorBase: 14, armorType: "medium" })])).toEqual(expect.objectContaining({ value: 40, classBonus: 10 }));
    expect(dnd5eSrdSpeed(barbarian, [equipment("chain-mail", { armorBase: 16, armorType: "heavy", strengthRequirement: 13 })])).toEqual(expect.objectContaining({ value: 30, classBonus: 0 }));
  });

  it("stacks independently eligible multiclass movement features before condition penalties", () => {
    const multiclass = actor([{ className: "Monk", level: 6 }, { className: "Barbarian", level: 5 }]);
    expect(dnd5eSrdSpeed(multiclass)).toEqual(expect.objectContaining({
      value: 55,
      classBonus: 25,
      classSources: ["barbarian-fast-movement", "monk-unarmored-movement"]
    }));
    const exhausted = { ...multiclass, data: { ...multiclass.data, conditions: [{ id: "exhaustion", level: 2 }] } };
    expect(dnd5eSrdSpeed(exhausted)).toEqual(expect.objectContaining({ value: 45, classBonus: 25, conditionPenalty: -10 }));
  });
});
