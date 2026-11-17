import type { Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { formatFeet, snappedTokenCoordinates, tokenResizeFrameFromPoint } from "./scene-canvas.js";

describe("gridless scene interactions", () => {
  it("keeps gridless movement and resizing freeform while preserving square snapping", () => {
    const token = { width: 50, height: 50 };
    expect(snappedTokenCoordinates({ width: 1000, height: 800, gridSize: 50, gridType: "gridless" }, token, 73, 88)).toEqual({ x: 73, y: 88 });
    expect(snappedTokenCoordinates({ width: 1000, height: 800, gridSize: 50, gridType: "square" }, token, 73, 88)).toEqual({ x: 50, y: 100 });

    const origin = { x: 50, y: 50, width: 50, height: 50 };
    expect(tokenResizeFrameFromPoint({ width: 1000, height: 800, gridSize: 50, gridType: "gridless" }, origin, "se", { x: 137, y: 143 })).toEqual({ x: 50, y: 50, width: 87, height: 93 });
    expect(tokenResizeFrameFromPoint({ width: 1000, height: 800, gridSize: 50, gridType: "square" }, origin, "se", { x: 137, y: 143 })).toEqual({ x: 50, y: 50, width: 100, height: 100 });
  });

  it("does not present pixel-derived feet as authoritative on gridless scenes", () => {
    expect(formatFeet(100, { gridType: "gridless", gridSize: 50 } as Scene)).toBe("Manual distance");
    expect(formatFeet(100, { gridType: "square", gridSize: 50 } as Scene)).toBe("10 ft");
  });
});
