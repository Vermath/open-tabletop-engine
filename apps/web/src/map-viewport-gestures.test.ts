import { describe, expect, it } from "vitest";
import { anchorScrollDelta, exceedsPanThreshold, scrollKeepingViewCentre, pinchZoom, pointerDistance, pointerMidpoint, wheelEventZoomsMap, wheelZoomFactor, zoomAnchorAt } from "./map-viewport-gestures.js";

describe("wheel zoom", () => {
  it("zooms in when scrolling up and out when scrolling down, symmetrically", () => {
    const zoomIn = wheelZoomFactor(-100);
    const zoomOut = wheelZoomFactor(100);
    expect(zoomIn).toBeGreaterThan(1);
    expect(zoomOut).toBeLessThan(1);
    expect(zoomIn * zoomOut).toBeCloseTo(1, 10);
  });

  it("limits a single event to a 25% change and ignores empty or invalid deltas", () => {
    expect(wheelZoomFactor(-100_000)).toBe(1.25);
    expect(wheelZoomFactor(100_000)).toBe(0.8);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });

  it("treats line and page deltas as larger steps than pixel deltas", () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48, 0), 10);
    expect(wheelZoomFactor(-1, 2)).toBe(1.25);
  });

  it("zooms on vertical wheel and pinch, but leaves sideways scrolling to the viewport", () => {
    const base = { deltaX: 0, deltaY: -100, shiftKey: false, ctrlKey: false, metaKey: false };
    expect(wheelEventZoomsMap(base)).toBe(true);
    expect(wheelEventZoomsMap({ ...base, shiftKey: true })).toBe(false);
    expect(wheelEventZoomsMap({ ...base, deltaX: 240, deltaY: 10 })).toBe(false);
    expect(wheelEventZoomsMap({ ...base, deltaX: 240, deltaY: 10, ctrlKey: true })).toBe(true);
    expect(wheelEventZoomsMap({ ...base, shiftKey: true, metaKey: true })).toBe(true);
  });
});

describe("zoom anchoring", () => {
  it("records the board fraction under the pointer, clamped to the board", () => {
    const board = { left: 100, top: 50, width: 800, height: 400 };
    expect(zoomAnchorAt(board, 300, 150)).toEqual({ u: 0.25, v: 0.25, clientX: 300, clientY: 150 });
    expect(zoomAnchorAt(board, 0, 9_999)).toMatchObject({ u: 0, v: 1 });
    expect(zoomAnchorAt({ ...board, width: 0, height: 0 }, 300, 150)).toMatchObject({ u: 0.5, v: 0.5 });
  });

  it("scrolls so the anchored point returns to the pointer after the board doubles in size", () => {
    const anchor = zoomAnchorAt({ left: 100, top: 50, width: 800, height: 400 }, 300, 150);
    // The board grew from its top-left corner; the anchored point is now further right and down.
    const delta = anchorScrollDelta({ left: 100, top: 50, width: 1600, height: 800 }, anchor);
    expect(delta).toEqual({ x: 200, y: 100 });
    // After scrolling by that delta the board has moved left/up by the same amount.
    expect(anchorScrollDelta({ left: 100 - delta.x, top: 50 - delta.y, width: 1600, height: 800 }, anchor)).toEqual({ x: 0, y: 0 });
  });

  it("keeps the centre of the view fixed when the toolbar doubles the zoom", () => {
    const viewport = { width: 800, height: 600 };
    // A 1000x800 board at offset 10,10 scrolled so its centre (510,410) is mid-view.
    const next = scrollKeepingViewCentre({ left: 10, top: 10, width: 1000, height: 800 }, { left: 10, top: 10, width: 2000, height: 1600 }, { x: 110, y: 110 }, viewport);
    expect(next).toEqual({ x: 610, y: 510 }); // the doubled board's centre (1010,810) is mid-view again
    expect(scrollKeepingViewCentre({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 500, height: 500 }, { x: 5, y: 6 }, viewport)).toEqual({ x: 5, y: 6 });
  });

  it("needs no scroll when nothing changed", () => {
    const board = { left: 12, top: 34, width: 640, height: 480 };
    expect(anchorScrollDelta(board, zoomAnchorAt(board, 200, 200))).toEqual({ x: 0, y: 0 });
  });
});

describe("touch gestures", () => {
  it("measures the distance and midpoint between two pointers", () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointerMidpoint({ x: 0, y: 10 }, { x: 20, y: 30 })).toEqual({ x: 10, y: 20 });
  });

  it("scales zoom by how far the fingers have spread and survives degenerate input", () => {
    expect(pinchZoom(1, 100, 250)).toBe(2.5);
    expect(pinchZoom(2, 200, 100)).toBe(1);
    expect(pinchZoom(1.5, 0, 100)).toBe(1.5);
    expect(pinchZoom(1.5, 100, 0)).toBe(1.5);
  });

  it("treats small pointer movement as a click, not a drag", () => {
    expect(exceedsPanThreshold({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false);
    expect(exceedsPanThreshold({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true);
  });
});
