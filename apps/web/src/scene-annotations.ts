import type { SceneAnnotation, VisionPoint } from "@open-tabletop/core";

function distanceBetween(left: VisionPoint, right: VisionPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function templateConePointList(annotation: SceneAnnotation): [VisionPoint, VisionPoint, VisionPoint] | undefined {
  const [origin, edge] = annotation.points;
  if (!origin || !edge) return undefined;
  const radius = annotation.radius ?? distanceBetween(origin, edge);
  if (radius <= 0) return undefined;

  const dx = edge.x - origin.x;
  const dy = edge.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return undefined;

  const unitX = dx / length;
  const unitY = dy / length;
  const halfWidth = radius;
  const left = { x: edge.x - unitY * halfWidth, y: edge.y + unitX * halfWidth };
  const right = { x: edge.x + unitY * halfWidth, y: edge.y - unitX * halfWidth };
  return [origin, left, right];
}

export function templateConePoints(annotation: SceneAnnotation): string | undefined {
  return templateConePointList(annotation)
    ?.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)
    .join(" ");
}
