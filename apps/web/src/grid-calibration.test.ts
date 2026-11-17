import { describe, expect, it } from "vitest";
import { gridCalibrationResult } from "./grid-calibration.js";
import { keyboardTokenPositions, snapTokenAxisToGrid, snappedTokenCoordinates, tokenCoordinatesFromCenter, tokenResizeFrameFromPoint } from "./scene-canvas.js";

const scene = { width: 600, height: 400, gridType: "square" as const, gridSize: 37.5, gridOrigin: { x: 8.25, y: 12.5 } };

describe("calibrated map grid", () => {
  it("derives fractional size and both origin axes from measured intersections", () => {
    expect(gridCalibrationResult([{ x: 83.25, y: 125 }, { x: 270.75, y: 125 }], 5)).toEqual({ distance: 187.5, cellsBetween: 5, gridSize: 37.5, gridOrigin: { x: 8.25, y: 12.5 } });
    expect(gridCalibrationResult([{ x: 83.25, y: 275 }, { x: 83.25, y: 125 }], 4)?.gridOrigin).toEqual(scene.gridOrigin);
  });

  it("rejects diagonal, coincident, and invalid cell measurements", () => {
    expect(gridCalibrationResult([{ x: 10, y: 10 }, { x: 60, y: 60 }], 1)).toBeUndefined();
    expect(gridCalibrationResult([{ x: 10, y: 10 }, { x: 10, y: 10 }], 1)).toBeUndefined();
    expect(gridCalibrationResult([{ x: 10, y: 10 }, { x: 60, y: 10 }], 0)).toBeUndefined();
  });

  it("keeps pointer drops, resize and repeated keyboard moves on the same fractional grid", () => {
    const token = { id: "hero", x: 83.25, y: 87.5, width: 37.5, height: 37.5 };
    expect(snappedTokenCoordinates(scene, token, 86, 89)).toEqual({ x: 83.25, y: 87.5 });
    expect(tokenCoordinatesFromCenter(scene, token.width, token.height, 103, 107)).toEqual({ x: 83.25, y: 87.5 });
    expect(tokenResizeFrameFromPoint(scene, token, "se", { x: 160, y: 165 })).toEqual({ x: 83.25, y: 87.5, width: 75, height: 75 });
    let moved = token;
    for (let step = 0; step < 10; step += 1) moved = { ...moved, ...keyboardTokenPositions(scene, [moved], { x: 37.5, y: 0 }).hero! };
    expect(moved.x).toBe(458.25);
    expect(moved.y).toBe(87.5);
  });

  it("centers sub-cell artwork without rounding the cell or changing the footprint", () => {
    expect(snapTokenAxisToGrid(75, 20, 600, 37.5, 8.25)).toBe(92);
    expect(snappedTokenCoordinates({ ...scene, gridType: "gridless" }, { width: 37.5, height: 37.5 }, 81.25, 91.75)).toEqual({ x: 81.25, y: 91.75 });
  });
});
