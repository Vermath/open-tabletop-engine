import { describe, expect, it } from "vitest";
import { scenePointFromClient } from "./board-geometry";

describe("scenePointFromClient", () => {
  it("allows measurement drags to extend beyond the board instead of clamping at the edge", () => {
    expect(
      scenePointFromClient(
        { left: 10, top: 20, width: 100, height: 50 },
        { width: 1000, height: 500 },
        160,
        45,
        { clamp: false }
      )
    ).toEqual({ x: 1500, y: 250 });
  });
});
