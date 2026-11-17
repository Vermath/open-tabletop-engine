import type { Token } from "@open-tabletop/core";

export interface TokenMovementPoint {
  x: number;
  y: number;
}

export interface TokenMovement {
  tokenId: string;
  from: TokenMovementPoint;
  to: TokenMovementPoint;
  distancePx: number;
}

export function tokenCenterPoint(token: Pick<Token, "x" | "y" | "width" | "height">): TokenMovementPoint {
  return { x: token.x + token.width / 2, y: token.y + token.height / 2 };
}

/**
 * Detects tokens whose position changed between two renders so the board can
 * animate the move and surface a measured-distance trail. New, removed, and
 * scene-switched tokens are ignored — only in-place movement counts.
 */
export function computeTokenMovements(previous: readonly Token[], next: readonly Token[], options: { minDistancePx?: number } = {}): TokenMovement[] {
  const minDistancePx = options.minDistancePx ?? 1;
  const previousById = new Map(previous.map((token) => [token.id, token]));
  const movements: TokenMovement[] = [];
  for (const token of next) {
    const before = previousById.get(token.id);
    if (!before || before.sceneId !== token.sceneId) continue;
    if (before.x === token.x && before.y === token.y) continue;
    const from = tokenCenterPoint(before);
    const to = tokenCenterPoint(token);
    const distancePx = Math.hypot(to.x - from.x, to.y - from.y);
    if (distancePx < minDistancePx) continue;
    movements.push({ tokenId: token.id, from, to, distancePx });
  }
  return movements;
}

/** Converts a pixel distance into a grid-aware feet label (5 ft per square by default). */
export function formatGridDistance(distancePx: number, gridSize: number, feetPerSquare = 5): string {
  if (!Number.isFinite(distancePx) || distancePx <= 0 || !Number.isFinite(gridSize) || gridSize <= 0) return "0 ft";
  const squares = distancePx / gridSize;
  const feet = Math.round(squares * feetPerSquare);
  return `${feet} ft`;
}
