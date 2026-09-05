import type { Scene, VisionPoint } from "./types.js";

/** A common delta identifies translation without confusing it with vertex edits. */
export function annotationTranslationDelta(original: readonly VisionPoint[], points: readonly VisionPoint[]): VisionPoint | undefined {
  if (original.length === 0 || original.length !== points.length) return undefined;
  const first = points[0];
  if (!first || !Number.isFinite(first.x) || !Number.isFinite(first.y)) return undefined;
  const delta = { x: first.x - original[0]!.x, y: first.y - original[0]!.y };
  return points.every((point, index) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x - original[index]!.x - delta.x) < 1e-9
    && Math.abs(point.y - original[index]!.y - delta.y) < 1e-9) ? delta : undefined;
}

/** Snap one translation, then cap it at the scene edge without deforming geometry. */
export function translatedAnnotationPoints(
  scene: Pick<Scene, "width" | "height"> & Partial<Pick<Scene, "gridSize" | "gridType">>,
  points: readonly VisionPoint[],
  delta: VisionPoint,
  snapToGrid = false
): VisionPoint[] {
  if (points.length === 0) return [];
  const step = snapToGrid && scene.gridType === "square" ? Math.max(1, Math.round(scene.gridSize || 1)) : 1;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const boundedDelta = (value: number, min: number, max: number) => {
    // An edge may lie between grid lines. Preserve an already capped delta so
    // submitting the canvas result to the API cannot snap it a second time.
    if (Math.abs(value - min) < 1e-9 || Math.abs(value - max) < 1e-9) return value;
    return Math.max(min, Math.min(max, Math.round(value / step) * step));
  };
  const deltaX = boundedDelta(delta.x, -minX, scene.width - maxX);
  const deltaY = boundedDelta(delta.y, -minY, scene.height - maxY);
  return points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }));
}
