import { tokenCenter, type LightSource, type Token, type Wall } from "@open-tabletop/core";

export const MAX_SCENE_WALLS = 512;
export const MAX_SCENE_LIGHTS = 256;
const MAX_RAY_SEGMENT_CHECKS = 2_000_000;

export class SceneVisionBudgetError extends Error {
  constructor() {
    super("Scene exceeds the vision geometry budget. Reduce walls, lights, or token vision sources.");
  }
}

export function tokenVisionPolygonCount(token: Pick<Token, "visionEnabled" | "visionRadius" | "dimVisionRadius" | "brightVisionRadius" | "senses">): number {
  if (!token.visionEnabled) return 0;
  const dim = token.dimVisionRadius && token.dimVisionRadius > 0 ? token.dimVisionRadius : (token.visionRadius ?? 0);
  const bright = token.brightVisionRadius ?? 0;
  return Number(dim > 0 || bright > 0) + Number(bright > 0 && bright < dim) + (token.senses?.length ?? 0);
}

function sourceWork(walls: readonly Wall[], x: number, y: number, radius: number, polygons: number): number {
  // The core ray caster culls segments beyond radius + 1. Count every segment whose
  // bounding box overlaps the enclosing square, including walls crossing the square.
  const reach = radius + 1;
  let segments = 4; // Scene edges always participate.
  for (const wall of walls) {
    if (Math.max(wall.x1, wall.x2) < x - reach || Math.min(wall.x1, wall.x2) > x + reach ||
        Math.max(wall.y1, wall.y2) < y - reach || Math.min(wall.y1, wall.y2) > y + reach) continue;
    segments++;
  }
  // Each polygon scans the walls once, then tests 128 base directions and up to
  // six endpoint directions per remaining segment against every remaining segment.
  return polygons * (walls.length + segments * (128 + 6 * segments));
}

export function exceedsSceneVisionBudget(walls: readonly Wall[], lights: readonly LightSource[], tokens: readonly Token[], sceneId?: string, proposedTokens: readonly Token[] = []): boolean {
  if (walls.length > MAX_SCENE_WALLS || lights.length > MAX_SCENE_LIGHTS) return true;
  let work = 0;
  for (const light of lights) {
    const radius = Math.max(light.radius ?? 0, light.brightRadius ?? 0, light.dimRadius ?? 0);
    work += sourceWork(light.shadows === false ? [] : walls, light.x, light.y, radius, 2) + walls.length;
    if (work > MAX_RAY_SEGMENT_CHECKS) return true;
  }
  const replaced = new Set(proposedTokens.map((token) => token.id));
  function chargeToken(token: Token): boolean {
    const polygons = tokenVisionPolygonCount(token);
    if (!polygons) return false;
    if ((token.senses?.length ?? 0) > 10) return true;
    const radius = Math.max(token.visionRadius ?? 0, token.brightVisionRadius ?? 0, token.dimVisionRadius ?? 0, ...(token.senses ?? []).map((sense) => sense.range));
    const center = tokenCenter(token);
    work += sourceWork(walls, center.x, center.y, radius, polygons);
    return work > MAX_RAY_SEGMENT_CHECKS;
  }
  return tokens.some((token) => (sceneId === undefined || token.sceneId === sceneId) && !replaced.has(token.id) && chargeToken(token)) || proposedTokens.some(chargeToken);
}
