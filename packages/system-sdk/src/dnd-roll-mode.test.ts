import { describe, expect, it } from "vitest";
import { combineDnd5eSrdD20RollMode } from "./dnd-roll-mode.js";

describe("D&D d20 roll-mode combiner", () => {
  it("rolls two dice for either mode and keeps the correct one", () => {
    expect(combineDnd5eSrdD20RollMode(["Danger Sense"])).toMatchObject({ mode: "advantage", d20: "2d20kh1" });
    expect(combineDnd5eSrdD20RollMode([], ["Restrained"])).toMatchObject({ mode: "disadvantage", d20: "2d20kl1" });
  });

  it("deduplicates same-mode sources and cancels whenever both modes have a source", () => {
    expect(combineDnd5eSrdD20RollMode(["Danger Sense", "Danger Sense", "Other feature"])).toEqual({
      mode: "advantage",
      d20: "2d20kh1",
      advantageSources: ["Danger Sense", "Other feature"],
      disadvantageSources: [],
    });
    expect(combineDnd5eSrdD20RollMode(["Danger Sense", "Other feature"], ["Restrained"])).toEqual({
      mode: "normal",
      d20: "1d20",
      advantageSources: ["Danger Sense", "Other feature"],
      disadvantageSources: ["Restrained"],
    });
  });
});
