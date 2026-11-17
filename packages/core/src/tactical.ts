import type { DifficultTerrainRegion, ScenePathMeasurement, VisionPoint } from "./types.js";

const EPSILON = 1e-9;

export interface ScenePathMeasurementOptions {
  /** Scene-space units per grid square. Omit to keep results in scene units. */
  gridSize?: number;
  /** Display distance represented by one grid square. Defaults to 5 when gridSize is supplied. */
  distancePerGrid?: number;
  sceneId?: string;
}

/**
 * Measures an authored polyline against authored difficult-terrain polygons.
 * This is advisory math only: it does not validate movement or mutate tokens.
 */
export function measureScenePath(
  points: readonly VisionPoint[],
  regions: readonly Pick<DifficultTerrainRegion, "points">[],
  options: ScenePathMeasurementOptions = {}
): ScenePathMeasurement {
  let normalSceneDistance = 0;
  let difficultSceneDistance = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (!Number.isFinite(segmentLength) || segmentLength <= EPSILON) continue;

    const cuts = [0, 1];
    for (const region of regions) {
      if (region.points.length < 3) continue;
      for (let edgeIndex = 0; edgeIndex < region.points.length; edgeIndex += 1) {
        const left = region.points[edgeIndex]!;
        const right = region.points[(edgeIndex + 1) % region.points.length]!;
        const intersection = segmentIntersectionParameter(start, end, left, right);
        if (intersection !== undefined) cuts.push(intersection);
      }
    }

    const orderedCuts = [...new Set(cuts.map((value) => Math.round(value * 1e9) / 1e9))].sort((left, right) => left - right);
    for (let cutIndex = 1; cutIndex < orderedCuts.length; cutIndex += 1) {
      const from = orderedCuts[cutIndex - 1]!;
      const to = orderedCuts[cutIndex]!;
      if (to - from <= EPSILON) continue;
      const midpoint = pointAlongSegment(start, end, (from + to) / 2);
      const intervalDistance = segmentLength * (to - from);
      if (regions.some((region) => pointInPolygon(midpoint, region.points))) difficultSceneDistance += intervalDistance;
      else normalSceneDistance += intervalDistance;
    }
  }

  const scale = options.gridSize && options.gridSize > 0
    ? (options.distancePerGrid ?? 5) / options.gridSize
    : 1;
  const normalDistance = roundedDistance(normalSceneDistance * scale);
  const difficultTerrainDistance = roundedDistance(difficultSceneDistance * scale);
  const totalDistance = roundedDistance((normalSceneDistance + difficultSceneDistance) * scale);
  const movementCostDistance = roundedDistance((normalSceneDistance + difficultSceneDistance * 2) * scale);
  return {
    sceneId: options.sceneId ?? "",
    points: points.map((point) => ({ ...point })),
    normalDistance,
    difficultTerrainDistance,
    totalDistance,
    movementCostDistance,
    unit: options.gridSize && options.gridSize > 0 ? "feet" : "scene"
  };
}

function pointAlongSegment(start: VisionPoint, end: VisionPoint, parameter: number): VisionPoint {
  return {
    x: start.x + (end.x - start.x) * parameter,
    y: start.y + (end.y - start.y) * parameter
  };
}

function segmentIntersectionParameter(start: VisionPoint, end: VisionPoint, left: VisionPoint, right: VisionPoint): number | undefined {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const edgeX = right.x - left.x;
  const edgeY = right.y - left.y;
  const denominator = segmentX * edgeY - segmentY * edgeX;
  if (Math.abs(denominator) <= EPSILON) return undefined;
  const offsetX = left.x - start.x;
  const offsetY = left.y - start.y;
  const segmentParameter = (offsetX * edgeY - offsetY * edgeX) / denominator;
  const edgeParameter = (offsetX * segmentY - offsetY * segmentX) / denominator;
  if (segmentParameter < -EPSILON || segmentParameter > 1 + EPSILON || edgeParameter < -EPSILON || edgeParameter > 1 + EPSILON) return undefined;
  return Math.min(1, Math.max(0, segmentParameter));
}

function pointInPolygon(point: VisionPoint, polygon: readonly VisionPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const left = polygon[current]!;
    const right = polygon[previous]!;
    if (pointOnSegment(point, left, right)) return true;
    const crosses = (left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: VisionPoint, start: VisionPoint, end: VisionPoint): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < -EPSILON) return false;
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= squaredLength + EPSILON;
}

function roundedDistance(value: number): number {
  return Math.round(value * 100) / 100;
}
