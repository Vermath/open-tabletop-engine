import { describe, expect, it } from "vitest";
import { measureScenePath } from "./tactical.js";

describe("tactical path measurement", () => {
  it("splits a path into normal and difficult distance without double-counting overlaps", () => {
    const result = measureScenePath(
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [
        { points: [{ x: 50, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 100 }, { x: 50, y: 100 }] },
        { points: [{ x: 100, y: 0 }, { x: 175, y: 0 }, { x: 175, y: 100 }, { x: 100, y: 100 }] }
      ],
      { sceneId: "scn_test", gridSize: 50, distancePerGrid: 5 }
    );

    expect(result).toMatchObject({
      sceneId: "scn_test",
      unit: "feet",
      normalDistance: 7.5,
      difficultTerrainDistance: 12.5,
      totalDistance: 20,
      movementCostDistance: 32.5
    });
  });

  it("sums waypoint segments and leaves input untouched", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 40 }];
    const result = measureScenePath(points, []);
    expect(result).toMatchObject({ normalDistance: 80, difficultTerrainDistance: 0, totalDistance: 80, movementCostDistance: 80, unit: "scene" });
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 60, y: 40 }]);
  });
});
