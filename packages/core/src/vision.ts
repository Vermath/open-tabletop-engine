import type { FogRegion, LightSource, Scene, Token, VisionPoint, VisionPolygon, Wall } from "./types.js";

const FULL_CIRCLE = Math.PI * 2;
const ANGLE_EPSILON = 0.0002;
const GEOMETRY_EPSILON = 0.000001;
const DEFAULT_RAY_COUNT = 128;
const DEFAULT_CIRCLE_POINTS = 72;
const DEFAULT_BRUSH_RADIUS = 70;
const DEFAULT_BRUSH_MAX_POINTS = 64;
const DEFAULT_BRUSH_MAX_RAW_POINTS = 512;

interface Segment {
  a: VisionPoint;
  b: VisionPoint;
}

export interface SmoothFogBrushOptions {
  radius?: number;
  minPointDistance?: number;
  maxPolygonPoints?: number;
  smoothingPasses?: number;
}

export function tokenCenter(token: Pick<Token, "x" | "y" | "width" | "height">): VisionPoint {
  return {
    x: token.x + token.width / 2,
    y: token.y + token.height / 2
  };
}

export function computeTokenVisionPolygon(scene: Pick<Scene, "width" | "height" | "walls">, token: Pick<Token, "id" | "x" | "y" | "width" | "height" | "visionEnabled" | "visionRadius">): VisionPolygon | undefined {
  if (!token.visionEnabled || token.visionRadius <= 0) return undefined;
  return {
    id: `vision_${token.id}`,
    source: "token",
    sourceId: token.id,
    radius: token.visionRadius,
    points: computeVisibilityPolygon(scene, tokenCenter(token), token.visionRadius)
  };
}

export function computeLightVisionPolygon(scene: Pick<Scene, "width" | "height" | "walls">, light: LightSource): VisionPolygon {
  return {
    id: `light_${light.id}`,
    source: "light",
    sourceId: light.id,
    radius: light.radius,
    color: light.color,
    opacity: Math.max(0.05, Math.min(0.7, light.intensity ?? 0.28)),
    points: computeVisibilityPolygon(scene, { x: light.x, y: light.y }, light.radius)
  };
}

export function computeFogRevealPolygon(scene: Pick<Scene, "width" | "height">, fog: FogRegion): VisionPolygon | undefined {
  if (fog.hidden) return undefined;
  const points = fog.shape === "polygon" && fog.points?.length ? computePolygonRegion(scene, fog.points) : computeCirclePolygon(scene, { x: fog.x, y: fog.y }, fog.radius);
  if (points.length < 3) return undefined;
  return {
    id: `fog_${fog.id}`,
    source: "fog",
    sourceId: fog.id,
    mode: fog.mode ?? "reveal",
    radius: fog.radius,
    points
  };
}

export function computeVisibilityPolygon(scene: Pick<Scene, "width" | "height" | "walls">, origin: VisionPoint, radius: number): VisionPoint[] {
  if (radius <= 0) return [];
  const segments = [...sceneBounds(scene.width, scene.height), ...visionBlockingWallSegments(scene.walls)];
  const angles = candidateAngles(origin, radius, segments);
  const hits = angles.map((angle) => castRay(origin, radius, angle, segments)).sort((a, b) => a.angle - b.angle);
  return compactPolygon(hits.map((hit) => clampPoint(hit.point, scene.width, scene.height)));
}

export function isPointInsideVisionPolygon(point: VisionPoint, polygon: VisionPolygon | VisionPoint[]): boolean {
  const points = Array.isArray(polygon) ? polygon : polygon.points;
  if (points.length < 3) return false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    if (distanceToSegment(point, a, b) <= 0.5) return true;
  }
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    const crosses = currentPoint.y > point.y !== previousPoint.y > point.y && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function isPointInsideVisionPolygons(point: VisionPoint, polygons: VisionPolygon[]): boolean {
  return polygons.some((polygon) => isPointInsideVisionPolygon(point, polygon));
}

export function buildSmoothFogBrushPolygon(scene: Pick<Scene, "width" | "height">, rawPoints: VisionPoint[], options: SmoothFogBrushOptions = {}): { points: VisionPoint[]; radius: number } | undefined {
  const radius = normalizePositiveNumber(options.radius, DEFAULT_BRUSH_RADIUS, Math.max(scene.width, scene.height));
  const maxPolygonPoints = Math.max(12, Math.min(DEFAULT_BRUSH_MAX_POINTS, Math.floor(options.maxPolygonPoints ?? DEFAULT_BRUSH_MAX_POINTS)));
  const minPointDistance = normalizePositiveNumber(options.minPointDistance, Math.max(4, radius * 0.18), Math.max(scene.width, scene.height));
  const smoothingPasses = Math.max(0, Math.min(3, Math.floor(options.smoothingPasses ?? 2)));
  const cleaned = compactStroke(rawPoints.slice(0, DEFAULT_BRUSH_MAX_RAW_POINTS).filter(isFinitePoint).map((point) => clampPoint(point, scene.width, scene.height)), minPointDistance);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length === 1 || pathLength(cleaned) <= radius * 0.35) {
    return { points: limitPolygonPoints(computeCirclePolygon(scene, cleaned[0]!, radius), maxPolygonPoints), radius };
  }

  const smoothed = smoothOpenPolyline(cleaned, smoothingPasses);
  const maxCenterlinePoints = Math.max(2, Math.floor(maxPolygonPoints / 2));
  const centerline = resamplePolyline(smoothed, maxCenterlinePoints);
  if (centerline.length < 2) return { points: limitPolygonPoints(computeCirclePolygon(scene, cleaned[0]!, radius), maxPolygonPoints), radius };

  const left: VisionPoint[] = [];
  const right: VisionPoint[] = [];
  for (let index = 0; index < centerline.length; index += 1) {
    const normal = normalForStrokePoint(centerline, index);
    const point = centerline[index]!;
    left.push(clampPoint({ x: point.x + normal.x * radius, y: point.y + normal.y * radius }, scene.width, scene.height));
    right.push(clampPoint({ x: point.x - normal.x * radius, y: point.y - normal.y * radius }, scene.width, scene.height));
  }

  const polygon = compactPolygon([...left, ...right.reverse()]);
  return polygon.length >= 3 ? { points: limitPolygonPoints(polygon, maxPolygonPoints), radius } : undefined;
}

function computeCirclePolygon(scene: Pick<Scene, "width" | "height">, center: VisionPoint, radius: number): VisionPoint[] {
  const points: VisionPoint[] = [];
  for (let index = 0; index < DEFAULT_CIRCLE_POINTS; index += 1) {
    const angle = (index / DEFAULT_CIRCLE_POINTS) * FULL_CIRCLE;
    points.push(
      clampPoint(
        {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        },
        scene.width,
        scene.height
      )
    );
  }
  return compactPolygon(points);
}

function computePolygonRegion(scene: Pick<Scene, "width" | "height">, points: VisionPoint[]): VisionPoint[] {
  return compactPolygon(points.map((point) => clampPoint(point, scene.width, scene.height)));
}

function candidateAngles(origin: VisionPoint, radius: number, segments: Segment[]): number[] {
  const angles = new Map<number, number>();
  for (let index = 0; index < DEFAULT_RAY_COUNT; index += 1) {
    addAngle(angles, (index / DEFAULT_RAY_COUNT) * FULL_CIRCLE);
  }
  for (const segment of segments) {
    for (const point of [segment.a, segment.b]) {
      const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
      addAngle(angles, angle - ANGLE_EPSILON);
      addAngle(angles, angle);
      addAngle(angles, angle + ANGLE_EPSILON);
    }
  }
  return [...angles.values()].sort((a, b) => a - b);
}

function addAngle(angles: Map<number, number>, angle: number): void {
  const normalized = normalizeAngle(angle);
  angles.set(Math.round(normalized * 1_000_000), normalized);
}

function normalizeAngle(angle: number): number {
  const normalized = angle % FULL_CIRCLE;
  return normalized < 0 ? normalized + FULL_CIRCLE : normalized;
}

function castRay(origin: VisionPoint, radius: number, angle: number, segments: Segment[]): { angle: number; point: VisionPoint } {
  const rayEnd = {
    x: origin.x + Math.cos(angle) * radius,
    y: origin.y + Math.sin(angle) * radius
  };
  let closest = { t: 1, point: rayEnd };
  for (const segment of segments) {
    const hit = raySegmentIntersection(origin, rayEnd, segment.a, segment.b);
    if (hit && hit.t >= -GEOMETRY_EPSILON && hit.t < closest.t) closest = hit;
  }
  return { angle, point: closest.point };
}

function raySegmentIntersection(origin: VisionPoint, rayEnd: VisionPoint, a: VisionPoint, b: VisionPoint): { t: number; point: VisionPoint } | undefined {
  const ray = { x: rayEnd.x - origin.x, y: rayEnd.y - origin.y };
  const segment = { x: b.x - a.x, y: b.y - a.y };
  const denominator = cross(ray, segment);
  if (Math.abs(denominator) < GEOMETRY_EPSILON) return undefined;
  const fromOriginToSegment = { x: a.x - origin.x, y: a.y - origin.y };
  const t = cross(fromOriginToSegment, segment) / denominator;
  const u = cross(fromOriginToSegment, ray) / denominator;
  if (t < -GEOMETRY_EPSILON || t > 1 + GEOMETRY_EPSILON || u < -GEOMETRY_EPSILON || u > 1 + GEOMETRY_EPSILON) return undefined;
  return {
    t,
    point: {
      x: origin.x + ray.x * t,
      y: origin.y + ray.y * t
    }
  };
}

function cross(a: VisionPoint, b: VisionPoint): number {
  return a.x * b.y - a.y * b.x;
}

function sceneBounds(width: number, height: number): Segment[] {
  return [
    { a: { x: 0, y: 0 }, b: { x: width, y: 0 } },
    { a: { x: width, y: 0 }, b: { x: width, y: height } },
    { a: { x: width, y: height }, b: { x: 0, y: height } },
    { a: { x: 0, y: height }, b: { x: 0, y: 0 } }
  ];
}

function visionBlockingWallSegments(walls: Wall[]): Segment[] {
  return walls.filter((wall) => wall.blocksVision).map((wall) => ({ a: { x: wall.x1, y: wall.y1 }, b: { x: wall.x2, y: wall.y2 } }));
}

function clampPoint(point: VisionPoint, width: number, height: number): VisionPoint {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y))
  };
}

function isFinitePoint(point: unknown): point is VisionPoint {
  return typeof point === "object" && point !== null && "x" in point && "y" in point && Number.isFinite((point as VisionPoint).x) && Number.isFinite((point as VisionPoint).y);
}

function normalizePositiveNumber(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.min(max, value));
}

function compactStroke(points: VisionPoint[], minPointDistance: number): VisionPoint[] {
  const compacted: VisionPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = compacted.at(-1);
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) >= minPointDistance) compacted.push(roundPoint(point));
  }
  const last = points.at(-1);
  const previous = compacted.at(-1);
  if (last && previous && Math.hypot(previous.x - last.x, previous.y - last.y) >= 1) compacted.push(roundPoint(last));
  return compacted;
}

function limitPolygonPoints(points: VisionPoint[], maxPoints: number): VisionPoint[] {
  if (points.length <= maxPoints) return points;
  const limited: VisionPoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    limited.push(points[Math.floor((index / maxPoints) * points.length)]!);
  }
  return limited;
}

function smoothOpenPolyline(points: VisionPoint[], passes: number): VisionPoint[] {
  let smoothed = points;
  for (let pass = 0; pass < passes; pass += 1) {
    if (smoothed.length < 3) break;
    const next: VisionPoint[] = [smoothed[0]!];
    for (let index = 0; index < smoothed.length - 1; index += 1) {
      const a = smoothed[index]!;
      const b = smoothed[index + 1]!;
      next.push(roundPoint({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }));
      next.push(roundPoint({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }));
    }
    next.push(smoothed.at(-1)!);
    smoothed = next;
  }
  return smoothed;
}

function resamplePolyline(points: VisionPoint[], maxPoints: number): VisionPoint[] {
  if (points.length <= maxPoints) return points.map(roundPoint);
  const totalLength = pathLength(points);
  if (totalLength <= 0) return [roundPoint(points[0]!)];
  const resampled: VisionPoint[] = [roundPoint(points[0]!)];
  let segmentIndex = 0;
  let segmentStartDistance = 0;
  for (let sampleIndex = 1; sampleIndex < maxPoints - 1; sampleIndex += 1) {
    const targetDistance = (totalLength * sampleIndex) / (maxPoints - 1);
    while (segmentIndex < points.length - 2) {
      const segmentLength = distance(points[segmentIndex]!, points[segmentIndex + 1]!);
      if (segmentStartDistance + segmentLength >= targetDistance) break;
      segmentStartDistance += segmentLength;
      segmentIndex += 1;
    }
    const a = points[segmentIndex]!;
    const b = points[segmentIndex + 1]!;
    const segmentLength = Math.max(distance(a, b), GEOMETRY_EPSILON);
    const t = Math.max(0, Math.min(1, (targetDistance - segmentStartDistance) / segmentLength));
    resampled.push(roundPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
  }
  resampled.push(roundPoint(points.at(-1)!));
  return resampled;
}

function pathLength(points: VisionPoint[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += distance(points[index]!, points[index + 1]!);
  }
  return total;
}

function normalForStrokePoint(points: VisionPoint[], index: number): VisionPoint {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}

function distance(a: VisionPoint, b: VisionPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function compactPolygon(points: VisionPoint[]): VisionPoint[] {
  const compacted: VisionPoint[] = [];
  for (const point of points) {
    const previous = compacted.at(-1);
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.5) compacted.push(roundPoint(point));
  }
  const first = compacted[0];
  const last = compacted.at(-1);
  if (first && last && Math.hypot(first.x - last.x, first.y - last.y) <= 0.5) compacted.pop();
  return compacted;
}

function roundPoint(point: VisionPoint): VisionPoint {
  return {
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000
  };
}

function distanceToSegment(point: VisionPoint, a: VisionPoint, b: VisionPoint): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared));
  return Math.hypot(point.x - (a.x + (b.x - a.x) * t), point.y - (a.y + (b.y - a.y) * t));
}
