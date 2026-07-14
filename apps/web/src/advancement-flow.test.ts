import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advancementAbilityAllocationStatus, advancementPreviewPath, advancementPreviewValue, advancementWeaponMasterySelectionStatus, type AdvancementFeatInfo, type AdvancementWeaponMasteryInfo } from "./advancement-flow.js";

const actor = {
  id: "actor-1",
  systemId: "dnd-5e-srd",
  data: {
    attributes: {
      strength: 19,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 8
    }
  }
} as unknown as Actor;

const abilityScoreImprovement: AdvancementFeatInfo = {
  id: "ability-score-improvement",
  name: "Ability Score Improvement",
  category: "general",
  summary: "Allocate two ability points.",
  abilityPoints: 2,
  abilityChoices: [],
  maximumScore: 20
};

describe("advancement ability allocation", () => {
  it("requires the exact metadata-defined point budget", () => {
    const incomplete = advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { dexterity: 1 });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.error).toContain("Allocate 1 more");

    const complete = advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { dexterity: 1, constitution: 1 });
    expect(complete.complete).toBe(true);
    expect(complete.pointsSpent).toBe(2);
  });

  it("enforces allowed abilities and the feat maximum score", () => {
    const grappler: AdvancementFeatInfo = {
      id: "grappler",
      name: "Grappler",
      category: "general",
      summary: "Increase Strength or Dexterity.",
      abilityPoints: 1,
      abilityChoices: ["strength", "dexterity"],
      maximumScore: 20
    };

    expect(advancementAbilityAllocationStatus(actor, grappler, { wisdom: 1 }).error).toContain("cannot increase Wisdom");
    expect(advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { strength: 2 }).error).toContain("cannot exceed 20");
    expect(advancementAbilityAllocationStatus(actor, grappler, { strength: 1 }).complete).toBe(true);
  });

  it("treats feats with no ability increase as fully allocated", () => {
    const feat = { ...abilityScoreImprovement, id: "alert", name: "Alert", abilityPoints: 0 };
    expect(advancementAbilityAllocationStatus(actor, feat, {}).complete).toBe(true);
  });

  it("formats sourced preview changes without hiding structured values", () => {
    expect(advancementPreviewPath("/hp/max")).toBe("Hp · Max");
    expect(advancementPreviewPath("")).toBe("Actor data");
    expect(advancementPreviewValue(undefined)).toBe("not set");
    expect(advancementPreviewValue({ current: 12, max: 20 })).toBe('{"current":12,"max":20}');
  });

  it("requires the exact eligible Weapon Mastery replacement set", () => {
    const mastery: AdvancementWeaponMasteryInfo = {
      className: "Fighter",
      nextClassLevel: 2,
      requiredCount: 3,
      requiresSelection: true,
      selectedWeaponIds: [],
      options: [
        { id: "greatsword", name: "Greatsword", mastery: "graze" },
        { id: "longbow", name: "Longbow", mastery: "slow" },
        { id: "longsword", name: "Longsword", mastery: "sap" }
      ]
    };

    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow"]).error).toContain("exactly 3");
    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow", "unknown"]).error).toContain("not an eligible");
    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow", "longsword"])).toMatchObject({ complete: true, selectedCount: 3 });
  });
});
