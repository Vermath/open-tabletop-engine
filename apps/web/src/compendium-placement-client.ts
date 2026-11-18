import type { Actor, CompendiumMonsterPlacement, CompendiumMonsterPlacementInput, CompendiumPlacementHistoryResult, Scene, Token, VisionPoint } from "@open-tabletop/api-contracts";
import { ApiError, apiPost } from "./api.js";
import { tokenCoordinatesFromCenter } from "./scene-canvas.js";
import { isStaleWriteError } from "./shared-mutation.js";
import type { WorkspaceBoundRequest } from "./workspace-bound-action.js";
import type { BoardHistoryAction, BoardHistoryDirection } from "./board-history.js";

export interface MonsterPlacementHistory {
  kind: "monster.place";
  sceneId: string;
  placementId: string;
  pending?: { revision: string; key: string };
  busy?: boolean;
}
export type BoardAction = BoardHistoryAction | MonsterPlacementHistory;
export type PlacementAttempts = Map<string, { sceneId: string; input: CompendiumMonsterPlacementInput; key: string }>;
type PairSnapshot = { actors: Actor[]; tokens: Token[] };

interface PlacementOptions {
  scene?: Scene;
  canPlace: boolean;
  attempts: PlacementAttempts;
  currentScene(): Scene | undefined;
  run<T>(task: (request: WorkspaceBoundRequest) => Promise<T>, apply: (result: T) => void): Promise<void>;
  reconcile(scene: Scene): Promise<PairSnapshot>;
  applyScene(scene: Scene): void;
  applyPair(actor: Actor, token: Token): void;
  removePair(actorId: string, tokenId: string): void;
  remember(action: MonsterPlacementHistory): void;
  status(message: string): void;
}

function placementPath(sceneId: string): string {
  return `/api/v1/scenes/${encodeURIComponent(sceneId)}/compendium-monster-placements`;
}

export function compendiumPlacementActions(options: PlacementOptions) {
  async function post<T extends { scene: Scene }>(request: WorkspaceBoundRequest, path: string, payload: unknown, key: string, rejected: (error: unknown) => void) {
    let replayed = false;
    const result = await apiPost<T>(path, payload, { signal: request.controller.signal, idempotencyKey: key, onReplay: () => { replayed = true; } }).catch((error: unknown) => {
      rejected(error);
      throw error;
    });
    const current = options.currentScene();
    const snapshot = current?.id === result.scene.id && (replayed || current.updatedAt > result.scene.updatedAt)
      ? await options.reconcile(current) : undefined;
    return { result, snapshot };
  }

  async function place(entryId: string, gestureId: string, point?: VisionPoint) {
    const scene = options.currentScene();
    if (!options.canPlace || !scene || scene.id !== options.scene?.id) throw new Error("Choose a scene where you can create actors and tokens.");
    let attempt = options.attempts.get(gestureId);
    if (attempt && attempt.sceneId !== scene.id) throw new Error("The placement started on a different scene.");
    if (!attempt) {
      const size = scene.gridSize || 50;
      const coordinates = tokenCoordinatesFromCenter(scene, Math.min(size, scene.width), Math.min(size, scene.height), point?.x ?? scene.width / 2, point?.y ?? scene.height / 2);
      attempt = { sceneId: scene.id, input: { entryId, ...coordinates, expectedUpdatedAt: scene.updatedAt }, key: "monster-place:" + crypto.randomUUID() };
      options.attempts.set(gestureId, attempt);
    }
    const { input, key } = attempt;
    await options.run((request) =>
      post<CompendiumMonsterPlacement>(request, placementPath(scene.id), input, key, (error) => {
        if (isStaleWriteError(error) || (error instanceof ApiError && [400, 403, 404].includes(error.status))) options.attempts.delete(gestureId);
      }), ({ result, snapshot }) => {
      options.attempts.delete(gestureId);
      if (options.currentScene()?.id !== scene.id) return;
      if (!snapshot) options.applyScene(result.scene);
      const actor = snapshot ? snapshot.actors.find((a) => a.id === result.actor.id) : result.actor;
      const token = snapshot ? snapshot.tokens.find((t) => t.id === result.sceneToken.id) : result.sceneToken;
      if (!actor || token?.actorId !== actor.id || token.sceneId !== scene.id) {
        options.status("The earlier placement is no longer on this map");
        return;
      }
      options.applyPair(actor, token);
      options.remember({ kind: "monster.place", sceneId: scene.id, placementId: result.placementId });
      options.status(actor.name + " placed on " + scene.name);
    });
  }

  async function change(action: MonsterPlacementHistory, direction: BoardHistoryDirection) {
    const scene = options.currentScene();
    if (!scene || scene.id !== action.sceneId || action.busy) return false;
    const attempt = action.pending ?? { revision: scene.updatedAt, key: "monster-history:" + crypto.randomUUID() };
    action.pending = attempt;
    action.busy = true;
    let applied = false;
    try {
      await options.run((request) =>
        post<CompendiumPlacementHistoryResult>(request, `${placementPath(scene.id)}/${encodeURIComponent(action.placementId)}/history`,
          { direction, expectedUpdatedAt: attempt.revision }, attempt.key, (error) => {
            if (error instanceof ApiError && error.status < 500) action.pending = undefined;
          }), ({ result, snapshot }) => {
        action.pending = undefined;
        if (options.currentScene()?.id !== scene.id) return;
        if (!snapshot) options.applyScene(result.scene);
        if (result.direction === "undo") {
          if (snapshot?.actors.some((actor) => actor.id === result.actorId) || snapshot?.tokens.some((token) => token.id === result.tokenId)) {
            options.status("The monster has since been restored");
            return;
          }
          options.removePair(result.actorId, result.tokenId);
        } else {
          const actor = snapshot ? snapshot.actors.find((a) => a.id === result.actor.id) : result.actor;
          const token = snapshot ? snapshot.tokens.find((t) => t.id === result.sceneToken.id) : result.sceneToken;
          if (!actor || token?.actorId !== actor.id || token.sceneId !== scene.id) {
            options.status("The restored placement is no longer on this map");
            return;
          }
          options.applyPair(actor, token);
        }
        options.status(direction === "undo" ? "Monster placement undone" : "Monster placement redone");
        applied = true;
      });
      return applied;
    } finally {
      action.busy = false;
    }
  }
  return { place, change };
}
