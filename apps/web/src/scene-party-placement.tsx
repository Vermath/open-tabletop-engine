import type { Actor, Scene, Token } from "@open-tabletop/core";
import { Users } from "lucide-react";

export interface PartyTokenPlacement {
  actorId: string;
  name: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface PartyTokenPlacementPlan {
  placements: PartyTokenPlacement[];
  missingActorIds: string[];
  blockedActorIds: string[];
}

export interface MissingPartyTokenCreateOptions {
  actorId: string;
  name: string;
  disposition: "friendly";
  layer: "player";
  x: number;
  y: number;
  width: number;
  height: number;
  targetSceneRevision: Scene;
  onSceneRevision(scene: Scene): void;
  idempotencyKey: string;
}

export interface MissingPartyPlacementResult {
  placed: number;
  sceneName: string;
}

interface TokenRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Plans only tokens that are absent from the selected scene. Existing tokens are
 * treated as immutable occupied space, so this helper never doubles or relocates
 * a party member while filling a new map.
 */
export function planMissingPartyTokenPlacements(
  scene: Pick<Scene, "id" | "width" | "height" | "gridSize">,
  partyActors: readonly Actor[],
  tokens: readonly Token[]
): PartyTokenPlacementPlan {
  const sceneTokens = tokens.filter((token) => token.sceneId === scene.id && token.layer !== "map");
  const representedActorIds = new Set(sceneTokens.flatMap((token) => token.actorId ? [token.actorId] : []));
  const uniquePartyActors = uniqueActors(partyActors);
  const missingActors = uniquePartyActors.filter((actor) => !representedActorIds.has(actor.id));
  const tokenSize = Math.max(1, Math.round(scene.gridSize) || 1);
  const candidates = stagingCandidates(scene, tokenSize);
  const occupied: TokenRectangle[] = sceneTokens.map(tokenRectangle);
  const placements: PartyTokenPlacement[] = [];
  const blockedActorIds: string[] = [];

  for (const actor of missingActors) {
    const candidateIndex = candidates.findIndex((candidate) => occupied.every((rectangle) => !rectanglesOverlap(candidate, rectangle)));
    if (candidateIndex < 0) {
      blockedActorIds.push(actor.id);
      continue;
    }
    const [candidate] = candidates.splice(candidateIndex, 1);
    if (!candidate) {
      blockedActorIds.push(actor.id);
      continue;
    }
    occupied.push(candidate);
    placements.push({
      actorId: actor.id,
      name: actor.name,
      centerX: candidate.x + candidate.width / 2,
      centerY: candidate.y + candidate.height / 2,
      width: candidate.width,
      height: candidate.height,
    });
  }

  return {
    placements,
    missingActorIds: missingActors.map((actor) => actor.id),
    blockedActorIds,
  };
}

/**
 * Executes a preflighted plan serially. Each authoritative scene revision is
 * passed to the next token create, so a multi-token action does not conflict
 * with its own optimistic-concurrency guard.
 */
export async function placeMissingPartyTokens(input: {
  scene: Scene;
  partyActors: readonly Actor[];
  tokens: readonly Token[];
  placementAttemptId: string;
  createToken(options: MissingPartyTokenCreateOptions): Promise<Token | undefined>;
}): Promise<MissingPartyPlacementResult> {
  const plan = planMissingPartyTokenPlacements(input.scene, input.partyActors, input.tokens);
  if (plan.blockedActorIds.length > 0) {
    const blockedNames = plan.blockedActorIds.map((actorId) => input.partyActors.find((actor) => actor.id === actorId)?.name ?? actorId);
    throw new Error(`No overlap-free staging space for ${blockedNames.join(", ")} on ${input.scene.name}.`);
  }
  let sceneRevision = input.scene;
  let placed = 0;
  for (const placement of plan.placements) {
    let nextSceneRevision = sceneRevision;
    const token = await input.createToken({
      actorId: placement.actorId,
      name: placement.name,
      disposition: "friendly",
      layer: "player",
      x: placement.centerX,
      y: placement.centerY,
      width: placement.width,
      height: placement.height,
      targetSceneRevision: sceneRevision,
      onSceneRevision: (scene) => { nextSceneRevision = scene; },
      idempotencyKey: `party-place:${input.scene.id}:${placement.actorId}:${input.placementAttemptId}`,
    });
    if (!token) throw new Error(`${placement.name} could not be placed on ${input.scene.name}.`);
    sceneRevision = nextSceneRevision;
    placed += 1;
  }
  return { placed, sceneName: input.scene.name };
}

export function ScenePartyPlacementControl({
  scene,
  partyActors,
  tokens,
  canCreateToken,
  busy = false,
  onPlaceMissingParty,
}: {
  scene?: Pick<Scene, "id" | "name" | "width" | "height" | "gridSize">;
  partyActors: readonly Actor[];
  tokens: readonly Token[];
  canCreateToken: boolean;
  busy?: boolean;
  onPlaceMissingParty(placementAttemptId: string): void;
}) {
  const plan = scene
    ? planMissingPartyTokenPlacements(scene, partyActors, tokens)
    : { placements: [], missingActorIds: [], blockedActorIds: [] };
  const missingCount = plan.missingActorIds.length;
  const lacksSpace = plan.blockedActorIds.length > 0;
  const disabled = busy || !scene || !canCreateToken || missingCount === 0 || lacksSpace;
  const label = busy
    ? "Placing party..."
    : missingCount === 0
      ? "Party already placed"
      : `Place missing party (${missingCount})`;
  const title = !scene
    ? "Select a scene before placing the party"
    : !canCreateToken
      ? "Requires token.create"
      : lacksSpace
        ? `No overlap-free staging space for ${plan.blockedActorIds.length} party ${plan.blockedActorIds.length === 1 ? "token" : "tokens"}`
        : missingCount === 0
          ? `Every party actor already has a token on ${scene.name}`
          : `Place ${missingCount} missing party ${missingCount === 1 ? "token" : "tokens"} on ${scene.name} without moving existing tokens`;

  return (
    <button
      className="ghost-button"
      type="button"
      disabled={disabled}
      title={title}
      aria-label={scene ? `${label} on ${scene.name}` : label}
      data-missing-party-count={missingCount}
      onClick={() => onPlaceMissingParty(globalThis.crypto.randomUUID())}
    >
      <Users size={14} aria-hidden="true" /> {label}
    </button>
  );
}

function uniqueActors(actors: readonly Actor[]): Actor[] {
  const seen = new Set<string>();
  return actors.filter((actor) => {
    if (seen.has(actor.id)) return false;
    seen.add(actor.id);
    return true;
  });
}

function stagingCandidates(
  scene: Pick<Scene, "width" | "height" | "gridSize">,
  tokenSize: number
): TokenRectangle[] {
  const maxX = Math.floor((scene.width - tokenSize) / tokenSize) * tokenSize;
  const maxY = Math.floor((scene.height - tokenSize) / tokenSize) * tokenSize;
  if (maxX < 0 || maxY < 0) return [];

  const preferredX = clampToGrid(scene.width * 0.35 - tokenSize / 2, 0, maxX, tokenSize);
  const preferredY = clampToGrid(scene.height * 0.65 - tokenSize / 2, 0, maxY, tokenSize);
  const candidates: TokenRectangle[] = [];
  for (let y = 0; y <= maxY; y += tokenSize) {
    for (let x = 0; x <= maxX; x += tokenSize) {
      candidates.push({ x, y, width: tokenSize, height: tokenSize });
    }
  }
  return candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.x - preferredX) + Math.abs(left.y - preferredY);
    const rightDistance = Math.abs(right.x - preferredX) + Math.abs(right.y - preferredY);
    return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
  });
}

function clampToGrid(value: number, minimum: number, maximum: number, gridSize: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value / gridSize) * gridSize));
}

function tokenRectangle(token: Pick<Token, "x" | "y" | "width" | "height">): TokenRectangle {
  return {
    x: token.x,
    y: token.y,
    width: Math.max(1, token.width),
    height: Math.max(1, token.height),
  };
}

function rectanglesOverlap(left: TokenRectangle, right: TokenRectangle): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}
