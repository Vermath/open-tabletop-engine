import { createTimestamped, type Actor, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { dnd5eSrdCalculationExplanation, dnd5eSrdSavingThrow, resolveDnd5eSrdAction } from "./index.js";

function actor(data: Record<string, unknown>): Actor {
  return createTimestamped("act", {
    id: "act-save-feature",
    campaignId: "camp-save-feature",
    systemId: "dnd-5e-srd",
    ownerUserId: "user-save-feature",
    type: "character" as const,
    name: "Save Feature Hero",
    permissions: {},
    data: {
      attributes: { strength: 10, dexterity: 12, constitution: 10, intelligence: 14, wisdom: 16, charisma: 8 },
      ...data,
    },
  }) satisfies Actor;
}

describe("D&D save-feature Advantage", () => {
  it("uses Barbarian class level for Danger Sense and retains imported-feature compatibility", () => {
    const barbarianOne = actor({ classes: [{ className: "Fighter", level: 8 }, { className: "Barbarian", level: 1 }] });
    expect(dnd5eSrdSavingThrow(barbarianOne, "dexterity")).toMatchObject({ formula: "1d20+1" });

    const barbarianTwo = actor({ classes: [{ className: "Fighter", level: 8 }, { className: "Barbarian", level: 2 }] });
    expect(dnd5eSrdSavingThrow(barbarianTwo, "dexterity")).toMatchObject({
      formula: "2d20kh1+1",
      metadata: { d20Mode: "advantage", advantageSources: ["Danger Sense"], disadvantageSources: [], advantage: true, feature: "Danger Sense", exceptConditions: ["Incapacitated"] },
    });
    const ward = createTimestamped("itm", { campaignId: barbarianTwo.campaignId, systemId: barbarianTwo.systemId, actorId: barbarianTwo.id, type: "item" as const, name: "Save Ward", data: { equipped: true, savingThrowBonus: 2 } }) satisfies Item;
    expect(dnd5eSrdSavingThrow(barbarianTwo, "dexterity", [ward])).toMatchObject({ formula: "2d20kh1+3", metadata: expect.objectContaining({ itemBonus: 2 }) });

    const imported = actor({ class: "Fighter", level: 1, features: ["Danger Sense"] });
    expect(dnd5eSrdSavingThrow(imported, "dexterity").formula).toBe("2d20kh1+1");
  });

  it("applies Gnomish Cunning only to Intelligence, Wisdom, and Charisma saves", () => {
    const gnome = actor({ species: "Gnome" });
    for (const ability of ["intelligence", "wisdom", "charisma"]) {
      expect(dnd5eSrdSavingThrow(gnome, ability)).toMatchObject({
        formula: expect.stringMatching(/^2d20kh1/),
        metadata: expect.objectContaining({ d20Mode: "advantage", advantageSources: ["Gnomish Cunning"], feature: "Gnomish Cunning" }),
      });
    }
    expect(dnd5eSrdSavingThrow(gnome, "dexterity").formula).toBe("1d20+1");
  });

  it("disables Danger Sense while Incapacitated and cancels it once against Disadvantage without losing other terms", () => {
    const incapacitated = actor({ class: "Barbarian", level: 2, conditions: [{ id: "incapacitated" }] });
    expect(dnd5eSrdSavingThrow(incapacitated, "dexterity")).toMatchObject({ formula: "1d20+1" });
    expect(dnd5eSrdSavingThrow(incapacitated, "dexterity").metadata?.advantageSources).toBeUndefined();

    const cancelled = actor({ class: "Barbarian", level: 2, conditions: [{ id: "restrained" }, { id: "blessed" }, { id: "exhaustion", level: 2 }] });
    expect(dnd5eSrdSavingThrow(cancelled, "dexterity")).toMatchObject({
      formula: "1d20-3+1d4",
      metadata: expect.objectContaining({
        d20Mode: "normal",
        advantageSources: ["Danger Sense"],
        disadvantageSources: ["Restrained"],
        conditionRollMode: "disadvantage",
        advantageCancelledByDisadvantage: true,
        exhaustionLevel: 2,
      }),
    });
  });

  it("keeps the quick roll, calculation explanation, and reviewed resolution sourced and identical", () => {
    const barbarian = actor({ classes: [{ className: "Wizard", level: 3 }, { className: "Barbarian", level: 2 }] });
    const quickRoll = dnd5eSrdSavingThrow(barbarian, "dexterity");
    const explanation = dnd5eSrdCalculationExplanation(barbarian, []);
    const field = explanation.fields.find((candidate) => candidate.id === "saving-throw.dexterity");
    expect(field).toMatchObject({
      result: quickRoll.formula,
      terms: expect.arrayContaining([expect.objectContaining({ formula: "2d20kh1", source: expect.objectContaining({ kind: "feature", name: "Danger Sense" }) })]),
    });

    const resolution = resolveDnd5eSrdAction({ actor: barbarian, roll: quickRoll });
    expect(resolution.rolls[0]).toEqual(expect.objectContaining({
      formula: quickRoll.formula,
      d20Mode: "advantage",
      advantageSources: ["Danger Sense"],
      disadvantageSources: [],
    }));
  });
});
