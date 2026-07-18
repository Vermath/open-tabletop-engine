import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dnd5eCreatorAbilities,
  dnd5eCreatorStandardArray,
  previewCreatorAbilityScores,
  swapCreatorStandardArrayScore,
  validCreatorStandardArrayAssignment
} from "./character-creator-dialog.js";

const source = readFileSync(resolve(__dirname, "character-creator-dialog.tsx"), "utf8");

describe("character creator standard array", () => {
  it("accepts all 720 one-to-one assignments and rejects duplicates", () => {
    const permutations = permute([...dnd5eCreatorStandardArray]);
    expect(permutations).toHaveLength(720);
    for (const scores of permutations) {
      expect(validCreatorStandardArrayAssignment(Object.fromEntries(dnd5eCreatorAbilities.map((ability, index) => [ability, scores[index]])))).toBe(true);
    }
    expect(validCreatorStandardArrayAssignment({ strength: 15, dexterity: 15, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 })).toBe(false);
  });

  it("swaps a used score instead of creating an invalid duplicate", () => {
    const initial = Object.fromEntries(dnd5eCreatorAbilities.map((ability, index) => [ability, dnd5eCreatorStandardArray[index]])) as Parameters<typeof swapCreatorStandardArrayScore>[0];
    const swapped = swapCreatorStandardArrayScore(initial, "charisma", 15);
    expect(swapped.charisma).toBe(15);
    expect(swapped.strength).toBe(8);
    expect(validCreatorStandardArrayAssignment(swapped)).toBe(true);
  });

  it("previews background boosts and modifiers from the submitted assignment", () => {
    const assignment = { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 };
    const preview = previewCreatorAbilityScores(assignment, { strength: 2, constitution: 1 });
    expect(preview.strength).toEqual({ base: 15, increase: 2, score: 17, modifier: 3 });
    expect(preview.constitution).toEqual({ base: 13, increase: 1, score: 14, modifier: 2 });
    expect(preview.charisma).toEqual({ base: 8, increase: 0, score: 8, modifier: -1 });
  });

  it("wires the method discriminator, accessible six-score controls, and final preview into submit", () => {
    expect(source).toContain('input.abilityScoreMethod = "standard-array"');
    expect(source).toContain("input.standardArrayAssignment = { ...standardArrayAssignment }");
    expect(source).toContain("standard array score`}");
    expect(source).toContain('aria-label="Final ability score preview"');
  });
});

function permute(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permute([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [value, ...rest]));
}
