import { describe, expect, it } from "vitest";
import {
  boardCanvasMargin,
  boardCanvasPinnedImageMaxPixels,
  boardCanvasPinsImage,
  boardCanvasPixelRatio,
  boardPaddingBox,
  boardCanvasSlack,
  boardCanvasWindow,
  boardCanvasWindowCovers,
  containedImageRect,
  devicePixelSnapOffset,
  imageDrawRects,
  lightGlow,
  lightGlowBlur,
  lightGlowIsDrawn,
  lightGlowSteps,
  lightGlowStops,
  scaleBoardRect,
  visibleBoardRect
} from "./board-canvas-geometry.js";

const clientRect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe("visible board rectangle", () => {
  it("is the whole board when the board fits inside the viewport", () => {
    expect(visibleBoardRect(clientRect(0, 0, 1000, 800), clientRect(100, 50, 600, 400))).toEqual({ left: 0, top: 0, width: 600, height: 400 });
  });

  it("is the scrolled-to part when the board overflows the viewport", () => {
    // Board scrolled 500 right and 300 down inside a 1000 x 800 viewport.
    expect(visibleBoardRect(clientRect(20, 10, 1000, 800), clientRect(-480, -290, 4000, 3000))).toEqual({ left: 500, top: 300, width: 1000, height: 800 });
  });

  it("is null when the board is entirely outside the viewport", () => {
    expect(visibleBoardRect(clientRect(0, 0, 1000, 800), clientRect(1200, 0, 600, 400))).toBeNull();
  });
});

describe("drawn window", () => {
  it("grows the visible area by the margin and stays inside the board", () => {
    expect(boardCanvasWindow({ left: 500, top: 300, width: 1000, height: 800 }, 4000, 3000)).toEqual({ left: 500 - boardCanvasMargin, top: 300 - boardCanvasMargin, width: 1000 + 2 * boardCanvasMargin, height: 800 + 2 * boardCanvasMargin });
    expect(boardCanvasWindow({ left: 0, top: 0, width: 600, height: 400 }, 600, 400)).toEqual({ left: 0, top: 0, width: 600, height: 400 });
    expect(boardCanvasWindow({ left: 3200, top: 2400, width: 800, height: 600 }, 4000, 3000)).toEqual({ left: 3200 - boardCanvasMargin, top: 2400 - boardCanvasMargin, width: 800 + boardCanvasMargin, height: 600 + boardCanvasMargin });
  });

  it("does not depend on the board's size, only on the view", () => {
    const visible = { left: 5000, top: 4000, width: 1000, height: 800 };
    const small = boardCanvasWindow(visible, 12_000, 9000);
    const large = boardCanvasWindow(visible, 48_000, 36_000);
    expect(small).toEqual(large);
    expect(small.width * small.height).toBeLessThan(2_100_000);
  });

  it("lands on whole pixels for fractional scroll positions", () => {
    const drawn = boardCanvasWindow({ left: 500.4, top: 300.6, width: 999.3, height: 800.2 }, 4000.5, 3000.5);
    for (const value of Object.values(drawn)) expect(Number.isInteger(value)).toBe(true);
    expect(drawn.left).toBeLessThanOrEqual(500.4 - boardCanvasMargin);
    expect(drawn.left + drawn.width).toBeGreaterThanOrEqual(500.4 + 999.3 + boardCanvasMargin);
  });
});

describe("re-windowing", () => {
  const board = { width: 4000, height: 3000 };
  const drawn = boardCanvasWindow({ left: 500, top: 300, width: 1000, height: 800 }, board.width, board.height);

  it("keeps the drawn window while scrolling stays clear of its edge", () => {
    const travel = boardCanvasMargin - boardCanvasSlack;
    expect(boardCanvasWindowCovers(drawn, { left: 500 + travel, top: 300 + travel, width: 1000, height: 800 }, board.width, board.height)).toBe(true);
    expect(boardCanvasWindowCovers(drawn, { left: 500 - travel, top: 300 - travel, width: 1000, height: 800 }, board.width, board.height)).toBe(true);
  });

  it("asks for a redraw once scrolling comes within the slack of any edge", () => {
    const travel = boardCanvasMargin - boardCanvasSlack + 1;
    expect(boardCanvasWindowCovers(drawn, { left: 500 + travel, top: 300, width: 1000, height: 800 }, board.width, board.height)).toBe(false);
    expect(boardCanvasWindowCovers(drawn, { left: 500 - travel, top: 300, width: 1000, height: 800 }, board.width, board.height)).toBe(false);
    expect(boardCanvasWindowCovers(drawn, { left: 500, top: 300 + travel, width: 1000, height: 800 }, board.width, board.height)).toBe(false);
    expect(boardCanvasWindowCovers(drawn, { left: 500, top: 300 - travel, width: 1000, height: 800 }, board.width, board.height)).toBe(false);
  });

  it("never asks for a redraw at a board edge the window already reaches", () => {
    const whole = boardCanvasWindow({ left: 0, top: 0, width: 600, height: 400 }, 600, 400);
    expect(boardCanvasWindowCovers(whole, { left: 0, top: 0, width: 600, height: 400 }, 600, 400)).toBe(true);
    const corner = boardCanvasWindow({ left: 3000, top: 2200, width: 1000, height: 800 }, board.width, board.height);
    expect(boardCanvasWindowCovers(corner, { left: 3000, top: 2200, width: 1000, height: 800 }, board.width, board.height)).toBe(true);
  });

  it("covers a zoomed view exactly when the stretched window still surrounds it", () => {
    // Zooming in by 1.5 about the view centre: the old window stretches past the view on every side.
    const zoomedIn = scaleBoardRect(drawn, 1.5);
    expect(zoomedIn).toEqual({ left: drawn.left * 1.5, top: drawn.top * 1.5, width: drawn.width * 1.5, height: drawn.height * 1.5 });
    expect(boardCanvasWindowCovers(zoomedIn, { left: 1000, top: 650, width: 1000, height: 800 }, 6000, 4500, 0)).toBe(true);
    // Zooming out by half: the old window shrinks inside the view, so it must be redrawn.
    const zoomedOut = scaleBoardRect(drawn, 0.5);
    expect(boardCanvasWindowCovers(zoomedOut, { left: 0, top: 0, width: 1000, height: 800 }, 2000, 1500, 0)).toBe(false);
  });
});

describe("backing store size", () => {
  it("uses the device pixel ratio while the canvas fits the pixel budget", () => {
    expect(boardCanvasPixelRatio(1500, 1300, 1)).toBe(1);
    expect(boardCanvasPixelRatio(1500, 1300, 2)).toBe(2);
  });

  it("lowers the ratio so a very large view stays inside the budget", () => {
    const ratio = boardCanvasPixelRatio(4096, 2400, 3, 8_000_000);
    expect(ratio).toBeLessThan(3);
    expect(4096 * ratio * 2400 * ratio).toBeLessThanOrEqual(8_000_000 + 1);
  });

  it("falls back to one for a missing or invalid device ratio", () => {
    expect(boardCanvasPixelRatio(800, 600, Number.NaN)).toBe(1);
    expect(boardCanvasPixelRatio(800, 600, 0)).toBe(1);
  });
});

describe("keeping the map decoded", () => {
  it("pins maps up to 4096 x 4096 and draws larger ones from the image element", () => {
    expect(boardCanvasPinnedImageMaxPixels).toBe(16_777_216);
    expect(boardCanvasPinsImage(4096, 3072)).toBe(true);
    expect(boardCanvasPinsImage(4096, 4096)).toBe(true);
    expect(boardCanvasPinsImage(8192, 8192)).toBe(false);
    expect(boardCanvasPinsImage(4097, 4096)).toBe(false);
  });

  it("does not pin an image that has not loaded", () => {
    expect(boardCanvasPinsImage(0, 0)).toBe(false);
    expect(boardCanvasPinsImage(Number.NaN, 100)).toBe(false);
  });
});

describe("board box", () => {
  it("is the area inside the border, where the map image and tokens are laid out", () => {
    expect(boardPaddingBox(clientRect(20, 10, 764, 570), { left: 1, top: 1, right: 1, bottom: 1 })).toEqual(clientRect(21, 11, 762, 568));
    expect(boardPaddingBox(clientRect(20, 10, 764, 570), { left: 2, top: 0, right: 4, bottom: 6 })).toEqual(clientRect(22, 10, 758, 564));
  });

  it("is the client rectangle when there is no border or the border is unreadable", () => {
    expect(boardPaddingBox(clientRect(20, 10, 764, 570), { left: 0, top: 0, right: 0, bottom: 0 })).toEqual(clientRect(20, 10, 764, 570));
    expect(boardPaddingBox(clientRect(20, 10, 764, 570), { left: Number.NaN, top: Number.NaN, right: Number.NaN, bottom: Number.NaN })).toEqual(clientRect(20, 10, 764, 570));
  });

  it("never has a negative size", () => {
    expect(boardPaddingBox(clientRect(20, 10, 2, 2), { left: 4, top: 4, right: 4, bottom: 4 })).toMatchObject({ width: 0, height: 0 });
  });
});

describe("device pixel alignment", () => {
  it("moves a fractional board edge to the nearest device pixel", () => {
    expect(devicePixelSnapOffset(20.5, 1)).toBeCloseTo(0.5, 10);
    expect(devicePixelSnapOffset(20.25, 1)).toBeCloseTo(-0.25, 10);
    expect(devicePixelSnapOffset(-479.75, 1)).toBeCloseTo(-0.25, 10);
    expect(devicePixelSnapOffset(20, 1)).toBe(0);
  });

  it("uses device pixels, not CSS pixels, on a high-density display", () => {
    expect(devicePixelSnapOffset(20.5, 2)).toBe(0);
    expect(devicePixelSnapOffset(20.3, 2)).toBeCloseTo(0.2, 10);
    for (const edge of [0.1, 7.77, 123.456, -55.5]) expect(Math.abs(devicePixelSnapOffset(edge, 1.5))).toBeLessThanOrEqual(0.5 / 1.5 + 1e-9);
  });

  it("does nothing for invalid input", () => {
    expect(devicePixelSnapOffset(Number.NaN, 1)).toBe(0);
    expect(devicePixelSnapOffset(20.5, 0)).toBeCloseTo(0.5, 10);
  });
});

describe("map image placement", () => {
  it("matches object-fit: contain anchored top left", () => {
    expect(containedImageRect(1200, 800, 600, 400)).toEqual({ left: 0, top: 0, width: 600, height: 400 });
    // A square image on a 3:2 board fills the height and leaves the right side empty.
    expect(containedImageRect(1500, 1500, 1200, 800)).toEqual({ left: 0, top: 0, width: 800, height: 800 });
    // A wide image fills the width and leaves the bottom empty.
    expect(containedImageRect(2000, 500, 1200, 800)).toEqual({ left: 0, top: 0, width: 1200, height: 300 });
    expect(containedImageRect(0, 0, 1200, 800)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it("maps the drawn window to the matching part of the image", () => {
    // 4000 x 3000 image on an 8000 x 6000 board (zoomed in 2x); window is a 1000 x 800 region.
    const rects = imageDrawRects({ width: 4000, height: 3000 }, { left: 0, top: 0, width: 8000, height: 6000 }, { left: 2000, top: 1000, width: 1000, height: 800 });
    expect(rects).toEqual({ source: { left: 1000, top: 500, width: 500, height: 400 }, destination: { left: 0, top: 0, width: 1000, height: 800 } });
  });

  it("clips to the image where the board is wider than the map", () => {
    const rects = imageDrawRects({ width: 1500, height: 1500 }, { left: 0, top: 0, width: 800, height: 800 }, { left: 600, top: 0, width: 600, height: 800 });
    expect(rects?.destination).toEqual({ left: 0, top: 0, width: 200, height: 800 });
    expect(rects?.source).toEqual({ left: 1125, top: 0, width: 375, height: 1500 });
  });

  it("draws nothing when the window is beside the image or the image has no size", () => {
    expect(imageDrawRects({ width: 1500, height: 1500 }, { left: 0, top: 0, width: 800, height: 800 }, { left: 900, top: 0, width: 300, height: 800 })).toBeNull();
    expect(imageDrawRects({ width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 300, height: 800 })).toBeNull();
  });
});

describe("light glow", () => {
  const scene = { width: 1200, height: 800 };

  it("scales with the board and is placed relative to the drawn window", () => {
    const glow = lightGlow({ x: 600, y: 400, radius: 150 }, scene, 2400, 1600, { left: 1000, top: 500, width: 1000, height: 800 });
    expect(glow.x).toBe(200);
    expect(glow.y).toBe(300);
    expect(glow.outerRadius).toBe(300 + lightGlowBlur.light * 2.5);
    expect(glow.opacity).toBe(0.18);
    expect(glow.stops).toEqual(lightGlowStops(300, lightGlowBlur.light));
  });

  it("uses the light's own intensity and the tighter blur for darkness", () => {
    const glow = lightGlow({ x: 0, y: 0, radius: 100, intensity: 0.7, kind: "darkness" }, scene, 1200, 800, { left: 0, top: 0, width: 600, height: 400 });
    expect(glow.opacity).toBe(0.7);
    expect(glow.outerRadius).toBe(100 + lightGlowBlur.darkness * 2.5);
    expect(glow.stops).toEqual(lightGlowStops(100, lightGlowBlur.darkness));
  });

  it("is drawn only when it reaches the window", () => {
    const drawn = { left: 0, top: 0, width: 600, height: 400 };
    const stops = lightGlowStops(80, 10);
    expect(lightGlowIsDrawn({ x: 300, y: 200, outerRadius: 100, stops, opacity: 0.2 }, drawn)).toBe(true);
    expect(lightGlowIsDrawn({ x: -50, y: 200, outerRadius: 100, stops, opacity: 0.2 }, drawn)).toBe(true);
    expect(lightGlowIsDrawn({ x: -150, y: 200, outerRadius: 100, stops, opacity: 0.2 }, drawn)).toBe(false);
    expect(lightGlowIsDrawn({ x: 300, y: 550, outerRadius: 100, stops, opacity: 0.2 }, drawn)).toBe(false);
    expect(lightGlowIsDrawn({ x: 300, y: 200, outerRadius: 0, stops, opacity: 0.2 }, drawn)).toBe(false);
  });
});

describe("light glow falloff", () => {
  it("gives valid, ordered gradient stops that end fully transparent", () => {
    for (const [radius, blur] of [[300, 22], [140, 14], [4, 22], [0, 22], [-5, 14], [1000, 0]] as const) {
      const stops = lightGlowStops(radius, blur);
      expect(stops[0]!.offset).toBe(0);
      expect(stops.at(-1)).toEqual({ offset: 1, alpha: 0 });
      for (const [index, stop] of stops.entries()) {
        expect(stop.offset).toBeGreaterThanOrEqual(0);
        expect(stop.offset).toBeLessThanOrEqual(1);
        expect(stop.alpha).toBeGreaterThanOrEqual(0);
        expect(stop.alpha).toBeLessThanOrEqual(1);
        if (index > 0) expect(stop.offset).toBeGreaterThan(stops[index - 1]!.offset);
      }
    }
    expect(lightGlowStops(300, 22)).toHaveLength(lightGlowSteps + 1);
  });

  it("is brightest at the centre and never brightens outwards for a large light", () => {
    const stops = lightGlowStops(300, 22);
    expect(stops[0]!.alpha).toBeGreaterThan(0.95);
    for (let index = 1; index < stops.length; index += 1) expect(stops[index]!.alpha).toBeLessThanOrEqual(stops[index - 1]!.alpha + 1e-9);
  });

  it("follows the unblurred gradient away from its ends", () => {
    // Without blur: solid to 0.22 * sqrt(2) of the radius, then linear to zero at 0.72 * sqrt(2), clipped at the radius.
    const radius = 1000;
    const sharp = lightGlowStops(radius, 0, 100);
    const at = (fraction: number) => sharp[Math.round(fraction * 100)]!.alpha;
    expect(at(0.2)).toBe(1);
    expect(at(0.3)).toBe(1);
    const solid = 0.22 * Math.SQRT2, clear = 0.72 * Math.SQRT2;
    expect(at(0.5)).toBeCloseTo((clear - 0.5) / (clear - solid), 6);
    expect(at(0.9)).toBeCloseTo((clear - 0.9) / (clear - solid), 6);
    // Halfway down the ramp a symmetric blur leaves a linear ramp where it was.
    const blurred = lightGlowStops(radius, 22, 100);
    const outer = radius + 22 * 2.5;
    const midway = blurred[Math.round((0.65 * radius / outer) * 100)]!;
    expect(midway.alpha).toBeCloseTo((clear - midway.offset * outer / radius) / (clear - solid), 2);
  });

  it("dims a light smaller than its blur instead of drawing it at full strength", () => {
    expect(lightGlowStops(4, 22)[0]!.alpha).toBeLessThan(0.1);
    expect(lightGlowStops(0, 22).every((stop) => stop.alpha === 0)).toBe(true);
  });
});
