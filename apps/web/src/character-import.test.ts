import { describe, expect, it } from "vitest";
import { characterImportHasDuplicateName, parseCharacterImportJson } from "./character-import.js";

describe("character import review", () => {
  it("normalizes a direct character document and strips server-owned fields", () => {
    const review = parseCharacterImportJson(JSON.stringify({
      id: "actor-from-another-table",
      campaignId: "campaign-from-another-table",
      ownerUserId: "user-from-another-table",
      name: "  Mira Vale  ",
      data: { level: 3, class: "Fighter" },
      items: ["longsword"],
      conditions: ["blinded"]
    }));

    expect(review.payload).toEqual({
      name: "Mira Vale",
      data: { level: 3, class: "Fighter" },
      items: ["longsword"],
      conditions: ["blinded"]
    });
    expect(review.ignoredFields).toEqual(["campaignId", "id", "ownerUserId"]);
    expect(review).toMatchObject({ dataFieldCount: 2, itemCount: 1, conditionCount: 1 });
  });

  it("accepts an exported actor wrapper while keeping root item arrays", () => {
    const review = parseCharacterImportJson(JSON.stringify({
      actor: { id: "act_1", name: "Wrapped Hero", data: { rank: 2 }, level: 4, class: "Operative" },
      items: [{ entryId: "laser-carbine" }],
      effects: [{ id: "unsupported-root-effect" }]
    }));

    expect(review.payload).toEqual({
      name: "Wrapped Hero",
      data: { level: 4, class: "Operative", rank: 2 },
      items: [{ entryId: "laser-carbine" }]
    });
    expect(review.ignoredFields).toEqual(["id"]);
    expect(review.normalizedFields).toEqual(["class", "level"]);
    expect(review.unsupportedFields).toEqual(["root.effects"]);
  });

  it("preserves supported flattened character fields as actor data", () => {
    const review = parseCharacterImportJson(JSON.stringify({ name: "Flat Hero", class: "Cleric", level: 3, ownerUserId: "ignored" }));

    expect(review.payload).toEqual({ name: "Flat Hero", data: { class: "Cleric", level: 3 } });
    expect(review.ignoredFields).toEqual(["ownerUserId"]);
    expect(review.normalizedFields).toEqual(["class", "level"]);
  });

  it("rejects malformed and structurally unsafe documents before upload", () => {
    expect(() => parseCharacterImportJson("not-json")).toThrow("not valid JSON");
    expect(() => parseCharacterImportJson("[]")).toThrow("one object");
    expect(() => parseCharacterImportJson('{"name":"No Data","data":[]}')).toThrow("data must be an object");
    expect(() => parseCharacterImportJson('{"name":"No Items","items":{}}')).toThrow("items must be an array");
    expect(() => parseCharacterImportJson('{"data":{"level":1}}')).toThrow("non-empty name");
  });

  it("matches duplicate names without case or surrounding-space differences", () => {
    expect(characterImportHasDuplicateName("Mira Vale", [" mira vale ", "Other Hero"])).toBe(true);
    expect(characterImportHasDuplicateName("Mira Vale", ["Mira Vales"])).toBe(false);
  });
});
