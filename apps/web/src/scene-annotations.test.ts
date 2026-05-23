import type { SceneAnnotation } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { templateConePointList, templateConePoints } from "./scene-annotations.js";

function coneAnnotation(points: SceneAnnotation["points"], radius?: number): SceneAnnotation {
  return {
    id: "cone",
    sceneId: "scene",
    kind: "template",
    createdByUserId: "user",
    color: "#fb7185",
    templateShape: "cone",
    points,
    radius,
    createdAt: "",
    updatedAt: ""
  };
}

describe("templateConePointList", () => {
  it("uses the drag endpoint as the center of the cone far edge", () => {
    const points = templateConePointList(coneAnnotation([{ x: 0, y: 0 }, { x: 100, y: 0 }], 100));

    expect(points).toHaveLength(3);
    const [, left, right] = points!;
    expect((left!.x + right!.x) / 2).toBeCloseTo(100);
    expect((left!.y + right!.y) / 2).toBeCloseTo(0);
    expect(Math.max(left!.x, right!.x)).toBeLessThanOrEqual(100);
  });

  it("serializes rounded SVG polygon points", () => {
    expect(templateConePoints(coneAnnotation([{ x: 0, y: 0 }, { x: 100, y: 0 }], 100))).toBe("0,0 100,100 100,-100");
  });
});
