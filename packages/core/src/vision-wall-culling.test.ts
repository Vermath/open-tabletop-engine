import { describe, expect, it } from "vitest";
import type { Wall } from "./index.js";
import { computeVisibilityPolygon, isPointInsideVisionPolygon } from "./vision.js";

function wall(id: string, x1: number, y1: number, x2: number, y2: number): Wall {
  return { id, x1, y1, x2, y2, blocksVision: true, blocksMovement: true, kind: "wall" } as Wall;
}

describe("vision wall culling", () => {
  const origin = { x: 1000, y: 1000 };
  const radius = 300;
  const nearWalls = [wall("near-a", 1100, 900, 1100, 1100), wall("crossing", 700, 1250, 1600, 1250)];
  const farWalls = Array.from({ length: 400 }, (_, index) => wall(`far-${index}`, 2000 + (index % 20) * 40, 2000 + Math.floor(index / 20) * 40, 2020 + (index % 20) * 40, 2030 + Math.floor(index / 20) * 40));

  it("gives the same visible area whether or not walls outside the radius are present", () => {
    const withoutFar = computeVisibilityPolygon({ width: 4000, height: 4000, walls: nearWalls }, origin, radius);
    const withFar = computeVisibilityPolygon({ width: 4000, height: 4000, walls: [...nearWalls, ...farWalls] }, origin, radius);
    for (let x = 680; x <= 1320; x += 16) {
      for (let y = 680; y <= 1320; y += 16) {
        const point = { x, y };
        expect(isPointInsideVisionPolygon(point, withFar), `${x},${y}`).toBe(isPointInsideVisionPolygon(point, withoutFar));
      }
    }
  });

  it("still blocks sight with walls that only cross the radius", () => {
    const polygon = computeVisibilityPolygon({ width: 4000, height: 4000, walls: nearWalls }, origin, radius);
    expect(isPointInsideVisionPolygon({ x: 1050, y: 1000 }, polygon)).toBe(true);
    expect(isPointInsideVisionPolygon({ x: 1200, y: 1000 }, polygon)).toBe(false);
    expect(isPointInsideVisionPolygon({ x: 1000, y: 1280 }, polygon)).toBe(false);
  });
});
