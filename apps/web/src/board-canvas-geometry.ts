/**
 * Geometry for the canvas-drawn board layer.
 *
 * The canvas does not cover the whole board. It covers the visible part plus
 * a margin, scrolls with the board like any other child, and is moved and
 * redrawn only when scrolling comes close to its edge. That keeps its size
 * bounded by the view rather than by the map and the zoom level.
 */

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ClientRectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Extra board drawn around the visible area, in CSS pixels. */
export const boardCanvasMargin = 256;
/** How close scrolling may come to the drawn edge before the canvas moves. */
export const boardCanvasSlack = 64;
/** Upper bound on the canvas's backing store. */
export const boardCanvasMaxPixels = 8_000_000;
/**
 * Largest map (in image pixels, 4096 x 4096) that is kept decoded in memory
 * for drawing. A map the browser no longer paints as an element can have its
 * decoded pixels discarded, and decoding a large image again stalls a draw.
 * Above this size the memory cost outweighs that, and the image element is
 * drawn directly.
 */
export const boardCanvasPinnedImageMaxPixels = 4096 * 4096;

/** True when a map of this size should be kept decoded for drawing. */
export function boardCanvasPinsImage(naturalWidth: number, naturalHeight: number, maxPixels = boardCanvasPinnedImageMaxPixels): boolean {
  const pixels = naturalWidth * naturalHeight;
  return Number.isFinite(pixels) && pixels > 0 && pixels <= maxPixels;
}

/** How far a drawn canvas may be stretched or shrunk while zooming before it is redrawn. */
export const boardCanvasStretchRange = { min: 0.4, max: 3 } as const;
/** Standard deviation of the CSS blur the DOM light glows use, by light kind. */
export const lightGlowBlur = { light: 22, darkness: 14 } as const;

/** The part of the board inside the scroll viewport, in board-local CSS pixels. */
export function visibleBoardRect(viewport: ClientRectLike, board: ClientRectLike): BoardRect | null {
  const left = Math.max(0, viewport.left - board.left);
  const top = Math.max(0, viewport.top - board.top);
  const right = Math.min(board.width, viewport.right - board.left);
  const bottom = Math.min(board.height, viewport.bottom - board.top);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** The area to draw: the visible rectangle grown by the margin, clamped to the board, on whole pixels. */
export function boardCanvasWindow(visible: BoardRect, boardWidth: number, boardHeight: number, margin = boardCanvasMargin): BoardRect {
  const left = Math.max(0, Math.floor(visible.left - margin));
  const top = Math.max(0, Math.floor(visible.top - margin));
  const right = Math.min(Math.ceil(boardWidth), Math.ceil(visible.left + visible.width + margin));
  const bottom = Math.min(Math.ceil(boardHeight), Math.ceil(visible.top + visible.height + margin));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** True while the drawn window still surrounds the visible area with slack, or already reaches the board's edge. */
export function boardCanvasWindowCovers(drawn: BoardRect, visible: BoardRect, boardWidth: number, boardHeight: number, slack = boardCanvasSlack): boolean {
  const drawnRight = drawn.left + drawn.width;
  const drawnBottom = drawn.top + drawn.height;
  const visibleRight = visible.left + visible.width;
  const visibleBottom = visible.top + visible.height;
  return (drawn.left <= 0 || drawn.left <= visible.left - slack)
    && (drawn.top <= 0 || drawn.top <= visible.top - slack)
    && (drawnRight >= Math.ceil(boardWidth) || drawnRight >= visibleRight + slack)
    && (drawnBottom >= Math.ceil(boardHeight) || drawnBottom >= visibleBottom + slack);
}

/** A rectangle after the board has been resized by `scale` (a zoom step), in the resized board's pixels. */
export function scaleBoardRect(rect: BoardRect, scale: number): BoardRect {
  return { left: rect.left * scale, top: rect.top * scale, width: rect.width * scale, height: rect.height * scale };
}

/**
 * The board's padding box in client coordinates. The board's children (the
 * map image, tokens, this canvas) are positioned inside its border, so that
 * box, not the border box `getBoundingClientRect` reports, is the board.
 */
export function boardPaddingBox(bounds: ClientRectLike, border: { left: number; top: number; right: number; bottom: number }): ClientRectLike {
  const width = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const left = bounds.left + width(border.left);
  const top = bounds.top + width(border.top);
  const right = Math.max(left, bounds.right - width(border.right));
  const bottom = Math.max(top, bounds.bottom - width(border.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * How far to nudge the canvas so its pixels land on device pixels. The board
 * is centred and scaled, so its edge is usually at a fractional position; a
 * canvas placed there is resampled by the browser and the map goes soft. The
 * result is at most half a device pixel in either direction.
 */
export function devicePixelSnapOffset(boardClientEdge: number, devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (!Number.isFinite(boardClientEdge)) return 0;
  return Math.round(boardClientEdge * ratio) / ratio - boardClientEdge;
}

/** Backing-store pixels per CSS pixel: the device ratio, reduced when the canvas would exceed the pixel budget. */
export function boardCanvasPixelRatio(width: number, height: number, devicePixelRatio: number, maxPixels = boardCanvasMaxPixels): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = Math.max(1, width * height);
  return Math.min(ratio, Math.sqrt(maxPixels / area));
}

/** Where the map image sits on the board: `object-fit: contain; object-position: top left`. */
export function containedImageRect(naturalWidth: number, naturalHeight: number, boardWidth: number, boardHeight: number): BoardRect {
  if (naturalWidth <= 0 || naturalHeight <= 0) return { left: 0, top: 0, width: 0, height: 0 };
  const scale = Math.min(boardWidth / naturalWidth, boardHeight / naturalHeight);
  return { left: 0, top: 0, width: naturalWidth * scale, height: naturalHeight * scale };
}

/**
 * Source rectangle in image pixels and destination rectangle in window-local
 * CSS pixels for the part of the map inside the drawn window, or null when the
 * map does not reach the window.
 */
export function imageDrawRects(natural: { width: number; height: number }, image: BoardRect, drawn: BoardRect): { source: BoardRect; destination: BoardRect } | null {
  if (image.width <= 0 || image.height <= 0) return null;
  const left = Math.max(image.left, drawn.left);
  const top = Math.max(image.top, drawn.top);
  const right = Math.min(image.left + image.width, drawn.left + drawn.width);
  const bottom = Math.min(image.top + image.height, drawn.top + drawn.height);
  if (right <= left || bottom <= top) return null;
  const scaleX = natural.width / image.width;
  const scaleY = natural.height / image.height;
  return {
    source: { left: (left - image.left) * scaleX, top: (top - image.top) * scaleY, width: (right - left) * scaleX, height: (bottom - top) * scaleY },
    destination: { left: left - drawn.left, top: top - drawn.top, width: right - left, height: bottom - top }
  };
}

export interface LightGlow {
  /** Centre in window-local CSS pixels. */
  x: number;
  y: number;
  /** Radius the gradient is drawn to. */
  outerRadius: number;
  /** Gradient stops from the centre (offset 0) to the outer radius (offset 1); `alpha` multiplies the light colour's own alpha. */
  stops: Array<{ offset: number; alpha: number }>;
  opacity: number;
}

/** Number of gradient steps used to follow the blurred glow's falloff. */
export const lightGlowSteps = 16;
/** How many standard deviations of blur the canvas glow extends past the disc. */
const glowBlurReach = 2.5;

/**
 * Alpha of a DOM light glow before its blur, at `distance` from the centre: a
 * disc of `radius` filled with `radial-gradient(circle, color 0%, color 22%,
 * transparent 72%)`. The gradient of a square box runs to its corner, so the
 * percentages are of radius * sqrt(2), and the disc clips what lies beyond it.
 */
function unblurredGlowAlpha(distance: number, radius: number): number {
  if (radius <= 0 || distance > radius) return 0;
  const solid = 0.22 * Math.SQRT2 * radius;
  const clear = 0.72 * Math.SQRT2 * radius;
  return distance <= solid ? 1 : Math.max(0, (clear - distance) / (clear - solid));
}

const glowKernel = [-2.5, -1.875, -1.25, -0.625, 0, 0.625, 1.25, 1.875, 2.5].map((offset) => ({ offset, weight: Math.exp(-(offset * offset) / 2) }));
const glowKernelTotal = glowKernel.reduce((sum, entry) => sum + entry.weight, 0) ** 2;

/**
 * The falloff of a DOM light glow after its Gaussian blur, as gradient stops.
 * Each stop is the blur's weighted average of the unblurred glow around that
 * distance, so the canvas glow follows the DOM one instead of guessing a shape.
 */
export function lightGlowStops(radius: number, blur: number, steps = lightGlowSteps): Array<{ offset: number; alpha: number }> {
  const outerRadius = radius + blur * glowBlurReach;
  if (!(outerRadius > 0)) return [{ offset: 0, alpha: 0 }, { offset: 1, alpha: 0 }];
  return Array.from({ length: steps + 1 }, (_, index) => {
    const distance = (index / steps) * outerRadius;
    let alpha = 0;
    if (blur > 0) {
      for (const across of glowKernel) {
        for (const along of glowKernel) alpha += across.weight * along.weight * unblurredGlowAlpha(Math.hypot(distance + across.offset * blur, along.offset * blur), radius);
      }
      alpha /= glowKernelTotal;
    } else {
      alpha = unblurredGlowAlpha(distance, radius);
    }
    return { offset: index / steps, alpha: index === steps ? 0 : Math.min(1, Math.max(0, alpha)) };
  });
}

/** Canvas equivalent of a DOM light glow: where it is in the drawn window, how far it reaches, and how it fades. */
export function lightGlow(light: { x: number; y: number; radius: number; intensity?: number; kind?: string }, scene: { width: number; height: number }, boardWidth: number, boardHeight: number, drawn: BoardRect): LightGlow {
  const radius = Math.max(0, light.radius) * (boardWidth / scene.width);
  const blur = light.kind === "darkness" ? lightGlowBlur.darkness : lightGlowBlur.light;
  return {
    x: (light.x / scene.width) * boardWidth - drawn.left,
    y: (light.y / scene.height) * boardHeight - drawn.top,
    outerRadius: radius + blur * glowBlurReach,
    stops: lightGlowStops(radius, blur),
    opacity: light.intensity ?? 0.18
  };
}

/** True when any part of the glow falls inside the drawn window. */
export function lightGlowIsDrawn(glow: LightGlow, drawn: BoardRect): boolean {
  return glow.outerRadius > 0
    && glow.x + glow.outerRadius >= 0 && glow.x - glow.outerRadius <= drawn.width
    && glow.y + glow.outerRadius >= 0 && glow.y - glow.outerRadius <= drawn.height;
}
