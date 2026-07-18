import { describe, expect, it } from "vitest";

import {
  boardCaptureMaxPixelRatio,
  boardCaptureMaxPixels,
  boundedBoardCapturePixelRatio
} from "./board-capture.js";

describe("boundedBoardCapturePixelRatio", () => {
  it("preserves ordinary viewport captures up to the quality ceiling", () => {
    expect(boundedBoardCapturePixelRatio(1_000, 700, 2)).toBe(2);
    expect(boundedBoardCapturePixelRatio(1_000, 700, 3)).toBe(boardCaptureMaxPixelRatio);
  });

  it("caps zoomed and high-DPI boards to the raster pixel budget", () => {
    const ratio = boundedBoardCapturePixelRatio(4_000, 3_000, 3);
    expect(4_000 * 3_000 * ratio * ratio).toBeLessThanOrEqual(boardCaptureMaxPixels + 1);
    expect(ratio).toBeCloseTo(Math.sqrt(boardCaptureMaxPixels / 12_000_000));
  });

  it("fails bounded for malformed dimensions and extreme boards", () => {
    expect(boundedBoardCapturePixelRatio(Number.NaN, 0, Number.POSITIVE_INFINITY)).toBe(1);
    const extremeRatio = boundedBoardCapturePixelRatio(100_000, 100_000, 4);
    expect(100_000 * 100_000 * extremeRatio * extremeRatio).toBeLessThanOrEqual(boardCaptureMaxPixels + 1);
  });
});
