import { describe, expect, it } from "vitest";
import type { Token } from "@open-tabletop/core";
import { computeTokenMovements, formatGridDistance, tokenCenterPoint } from "./board-animation.js";

function token(overrides: Partial<Token> & { id: string }): Token {
  return {
    sceneId: "scn_1",
    name: "Token",
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player",
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 0,
    disposition: "neutral",
    conditions: [],
    auras: [],
    targetedByUserIds: [],
    metadata: {},
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

describe("board animation", () => {
  it("computes center points from the token frame", () => {
    expect(tokenCenterPoint({ x: 100, y: 200, width: 50, height: 50 })).toEqual({ x: 125, y: 225 });
  });

  it("detects moved tokens and measures the delta from center to center", () => {
    const previous = [token({ id: "tok_1", x: 0, y: 0 }), token({ id: "tok_2", x: 300, y: 300 })];
    const next = [token({ id: "tok_1", x: 150, y: 0 }), token({ id: "tok_2", x: 300, y: 300 })];

    const movements = computeTokenMovements(previous, next);

    expect(movements).toEqual([{ tokenId: "tok_1", from: { x: 25, y: 25 }, to: { x: 175, y: 25 }, distancePx: 150 }]);
  });

  it("ignores new, removed, and scene-switched tokens", () => {
    const previous = [token({ id: "tok_1", x: 0, y: 0, sceneId: "scn_a" }), token({ id: "tok_gone", x: 10, y: 10 })];
    const next = [token({ id: "tok_1", x: 80, y: 0, sceneId: "scn_b" }), token({ id: "tok_new", x: 500, y: 500 })];

    expect(computeTokenMovements(previous, next)).toEqual([]);
  });

  it("respects the minimum distance threshold", () => {
    const previous = [token({ id: "tok_1", x: 0, y: 0 })];
    const next = [token({ id: "tok_1", x: 0, y: 1 })];

    expect(computeTokenMovements(previous, next, { minDistancePx: 5 })).toEqual([]);
    expect(computeTokenMovements(previous, next, { minDistancePx: 0.5 })).toHaveLength(1);
  });

  it("formats grid distance in feet, defaulting to 5 ft per square", () => {
    expect(formatGridDistance(100, 50)).toBe("10 ft");
    expect(formatGridDistance(50, 50)).toBe("5 ft");
    expect(formatGridDistance(0, 50)).toBe("0 ft");
    expect(formatGridDistance(100, 0)).toBe("0 ft");
  });
});
