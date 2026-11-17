import { describe, expect, it } from "vitest";
import {
  DND_5E_SRD_ABILITIES,
  DND_5E_SRD_STANDARD_ARRAY,
  dnd5eSrdCharacterTemplate,
  dnd5eSrdValidateStandardArrayAssignment,
  previewDnd5eSrdStandardArrayAssignment
} from "./index.js";

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]));
}

describe("D&D standard-array assignment", () => {
  it("accepts every one-to-one assignment and returns canonical ability order", () => {
    const all = permutations(DND_5E_SRD_STANDARD_ARRAY);
    expect(all).toHaveLength(720);
    for (const scores of all) {
      const shuffledInput = Object.fromEntries([...DND_5E_SRD_ABILITIES].reverse().map((ability, index) => [ability, scores[5 - index]]));
      const result = dnd5eSrdValidateStandardArrayAssignment(shuffledInput);
      expect(result.ok, JSON.stringify(result.issues)).toBe(true);
      expect(Object.keys(result.assignment!)).toEqual(DND_5E_SRD_ABILITIES);
      expect([...Object.values(result.assignment!)].sort((left, right) => right - left)).toEqual(DND_5E_SRD_STANDARD_ARRAY);
    }
  });

  it.each([
    [null, "invalid_type"],
    [[], "invalid_type"],
    [{ strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10 }, "missing_ability"],
    [{ strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 10 }, "invalid_array"],
    [{ strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8, luck: 7 }, "invalid_ability"],
    [{ strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8.5 }, "invalid_array"]
  ])("rejects malformed assignment %#", (assignment, code) => {
    expect(dnd5eSrdValidateStandardArrayAssignment(assignment).issues).toContainEqual(expect.objectContaining({ code }));
  });

  it("normalizes ability keys without mutating the template and records auditable provenance", () => {
    const template = dnd5eSrdCharacterTemplate("fighter")!;
    const before = JSON.stringify(template);
    const preview = previewDnd5eSrdStandardArrayAssignment(template, { Strength: 15, Dexterity: 14, Constitution: 13, Intelligence: 12, Wisdom: 10, Charisma: 8 });
    expect(preview.ok).toBe(true);
    expect(preview.proposedData).toEqual(expect.objectContaining({
      attributes: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
      origin: expect.objectContaining({ abilityScoreMethod: "standard-array", standardArrayAssignment: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 } })
    }));
    expect(preview.changes).toEqual(expect.arrayContaining([expect.objectContaining({ ability: "strength", after: 15 }), expect.objectContaining({ ability: "charisma", after: 8 })]));
    expect(JSON.stringify(template)).toBe(before);
  });
});
