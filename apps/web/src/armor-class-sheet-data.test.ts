import { describe, expect, it } from "vitest";
import { actorCoreStatistics } from "./actor-sheet-data.js";

describe("authoritative Armor Class sheet data", () => {
  it("keeps derived, override, and legacy-review provenance from the server sheet", () => {
    expect(actorCoreStatistics({ data: { armorClass: 15, armorClassDetails: { value: 15, armorName: "Leather Armor" } } }).armorClass).toEqual({ value: 15, label: "Leather Armor" });
    expect(actorCoreStatistics({ data: { armorClass: 20, armorClassDetails: { value: 20, armorName: "Unarmored", calculationOverride: true, calculationOverrideBaseValue: 12, calculationOverrideReason: "Temporary sanctuary ward" } } }).armorClass).toEqual({ value: 20, label: "Unarmored; override 12 -> 20: Temporary sanctuary ward", calculationOverride: true, baseValue: 12, overrideReason: "Temporary sanctuary ward" });
    expect(actorCoreStatistics({ data: { armorClass: 12, armorClassDetails: { value: 12, armorName: "Unarmored", requiresReview: true, legacyStoredValue: 19, reviewReason: "Review legacy AC" } } }).armorClass).toEqual({ value: 12, label: "Unarmored; legacy AC 19 requires review: Review legacy AC", requiresReview: true, legacyStoredValue: 19, reviewReason: "Review legacy AC" });
  });
});
