import type { FogRegion, LightSource, Scene, Token, VisionPoint, VisionPolygon, Wall } from "./types.js";

const FULL_CIRCLE = Math.PI * 2;
const ANGLE_EPSILON = 0.0002;
const GEOMETRY_EPSILON = 0.000001;
const DEFAULT_RAY_COUNT = 128;
const DEFAULT_CIRCLE_POINTS = 72;

interface Segment {
  a: VisionPoint;
  b: VisionPoint;
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
  return {
    id: `fog_${fog.id}`,
    source: "fog",
    sourceId: fog.id,
    radius: fog.radius,
    points: computeCirclePolygon(scene, { x: fog.x, y: fog.y }, fog.radius)
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
