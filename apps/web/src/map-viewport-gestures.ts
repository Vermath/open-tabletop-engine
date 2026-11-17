/**
 * Pure maths for map zoom and pan gestures. The scene canvas owns the DOM and
 * pointer state; everything here is deterministic so it can be unit-tested.
 */

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A point on the board, as a fraction of its width and height, pinned to a screen position. */
export interface ZoomAnchor {
  u: number;
  v: number;
  clientX: number;
  clientY: number;
}

/** Pointer movement, in CSS pixels, before a press counts as a drag instead of a click. */
export const panDragThresholdPx = 4;

const wheelZoomSensitivity = 0.0015;
const wheelLineHeightPx = 16;
const wheelPageHeightPx = 400;
const maxWheelStepFactor = 1.25;

/**
 * Converts one wheel event into a multiplicative zoom factor. Scrolling up
 * (negative deltaY) zooms in. One event never changes zoom by more than 25%,
 * so a free-spinning wheel cannot jump the whole range in a single frame.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const pixels = deltaMode === 1 ? deltaY * wheelLineHeightPx : deltaMode === 2 ? deltaY * wheelPageHeightPx : deltaY;
  const factor = Math.exp(-pixels * wheelZoomSensitivity);
  return Math.max(1 / maxWheelStepFactor, Math.min(maxWheelStepFactor, factor));
}

/**
 * A wheel event zooms the map unless it is a sideways scroll: Shift+wheel or
 * a mostly-horizontal trackpad swipe keeps scrolling the viewport natively.
 */
export function wheelEventZoomsMap(event: { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (event.ctrlKey || event.metaKey) return true;
  if (event.shiftKey) return false;
  return Math.abs(event.deltaY) > Math.abs(event.deltaX);
}

/** Captures which point of the board sits under a screen position, so zoom can keep it there. */
export function zoomAnchorAt(board: BoardRect, clientX: number, clientY: number): ZoomAnchor {
  const u = board.width > 0 ? (clientX - board.left) / board.width : 0.5;
  const v = board.height > 0 ? (clientY - board.top) / board.height : 0.5;
  return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)), clientX, clientY };
}

/**
 * How far the viewport must scroll, after the board has been resized, to put
 * the anchored board point back under its screen position.
 */
export function anchorScrollDelta(board: BoardRect, anchor: ZoomAnchor): ViewportPoint {
  return {
    x: board.left + anchor.u * board.width - anchor.clientX,
    y: board.top + anchor.v * board.height - anchor.clientY
  };
}

export function pointerDistance(first: ViewportPoint, second: ViewportPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function pointerMidpoint(first: ViewportPoint, second: ViewportPoint): ViewportPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

/** Zoom for a two-finger pinch: the starting zoom scaled by how far the fingers have spread. */
export function pinchZoom(startZoom: number, startDistance: number, currentDistance: number): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return startZoom;
  return startZoom * (currentDistance / startDistance);
}

export function exceedsPanThreshold(start: ViewportPoint, current: ViewportPoint): boolean {
  return pointerDistance(start, current) > panDragThresholdPx;
}

/**
 * Scroll position that keeps the centre of the view over the same board point
 * after the board changes size (toolbar zoom, which has no pointer to anchor to).
 * Rectangles are the board's offset box inside the scrollable viewport.
 */
export function scrollKeepingViewCentre(previous: BoardRect, next: BoardRect, scroll: ViewportPoint, viewport: { width: number; height: number }): ViewportPoint {
  if (!(previous.width > 0) || !(previous.height > 0)) return scroll;
  const u = Math.max(0, Math.min(1, (scroll.x + viewport.width / 2 - previous.left) / previous.width));
  const v = Math.max(0, Math.min(1, (scroll.y + viewport.height / 2 - previous.top) / previous.height));
  return {
    x: next.left + u * next.width - viewport.width / 2,
    y: next.top + v * next.height - viewport.height / 2
  };
}
