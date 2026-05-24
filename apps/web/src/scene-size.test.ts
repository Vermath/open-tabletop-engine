import { describe, expect, it } from "vitest";
import { sceneDimensionsFromCells, sceneGridCellSummary, sceneSizePresets } from "./scene-size.js";

describe("scene size helpers", () => {
  it("turns scene size presets into pixel dimensions using the active grid size", () => {
    expect(sceneDimensionsFromCells({ columns: 48, rows: 32 }, 50)).toEqual({ width: 2400, height: 1600 });
    expect(sceneDimensionsFromCells({ columns: 72, rows: 48 }, 40)).toEqual({ width: 2880, height: 1920 });
  });

  it("summarizes existing scene dimensions as grid cells", () => {
    expect(sceneGridCellSummary(2400, 1600, 50)).toBe("48 x 32 squares");
    expect(sceneGridCellSummary(1800, 1800, 40)).toBe("45 x 45 squares");
  });

  it("offers larger-than-default presets", () => {
    expect(sceneSizePresets.map((preset) => preset.id)).toEqual(["standard", "large", "huge", "square"]);
    expect(sceneSizePresets.find((preset) => preset.id === "large")).toMatchObject({ columns: 48, rows: 32 });
    expect(sceneSizePresets.find((preset) => preset.id === "huge")).toMatchObject({ columns: 72, rows: 48 });
  });
});
