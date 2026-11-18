import type { Actor, Scene, Token } from "@open-tabletop/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiPost } from "./api.js";
import { compendiumPlacementActions, type MonsterPlacementHistory, type PlacementAttempts } from "./compendium-placement-client.js";
import type { WorkspaceBoundRequest } from "./workspace-bound-action.js";

vi.mock("./api.js", async (importOriginal) => ({ ...await importOriginal<typeof import("./api.js")>(), apiPost: vi.fn() }));
const command = vi.mocked(apiPost);
beforeEach(() => command.mockReset());

function setup() {
  let scene = { id: "scene/one", width: 500, height: 500, gridSize: 50, updatedAt: "revision-1" } as Scene;
  const actor = { id: "actor", name: "Aboleth" } as Actor;
  const token = { id: "token", actorId: actor.id, sceneId: scene.id } as Token;
  const snapshot = { actors: [actor], tokens: [token] };
  const options = {
    scene, canPlace: true, attempts: new Map() as PlacementAttempts, currentScene: () => scene,
    run: async <T,>(task: (r: WorkspaceBoundRequest) => Promise<T>, apply: (result: T) => void) => {
      apply(await task({ controller: new AbortController() } as WorkspaceBoundRequest));
    },
    reconcile: vi.fn(async () => snapshot), applyScene: vi.fn(), applyPair: vi.fn(),
    removePair: vi.fn(), remember: vi.fn(), status: vi.fn(),
  };
  const result = () => ({ placementId: "placement", actor, sceneToken: token, scene });
  return { options, snapshot, result, actions: compendiumPlacementActions(options), advance() { scene = { ...scene, updatedAt: "revision-2" }; } };
}

describe("compendium gesture retries", () => {
  it("retains an uncertain write across rerenders and discards a definitively stale precondition", async () => {
    const { options, actions, advance, result } = setup();
    command.mockRejectedValueOnce(new TypeError("connection reset"));
    await expect(actions.place("srd-monster:aboleth", "gesture")).rejects.toThrow("connection reset");
    advance();
    command.mockRejectedValueOnce(new ApiError("stale", 409, { code: "stale_write" }, ""));
    await expect(compendiumPlacementActions(options).place("srd-monster:aboleth", "gesture")).rejects.toThrow("stale");
    const first = command.mock.calls[0]!;
    expect(first[0]).toBe("/api/v1/scenes/scene%2Fone/compendium-monster-placements");
    const retry = command.mock.calls[1]!;
    expect(retry[1]).toEqual(first[1]);
    expect(retry[2]?.idempotencyKey).toBe(first[2]?.idempotencyKey);
    command.mockResolvedValueOnce(result());
    await actions.place("srd-monster:aboleth", "gesture");
    expect(command.mock.calls[2]![1]).toMatchObject({ expectedUpdatedAt: "revision-2" });
    expect(command.mock.calls[2]![2]?.idempotencyKey).not.toBe(first[2]?.idempotencyKey);
  });

  it("does not recreate a missing pair from a historical placement response", async () => {
    const { options, actions, result, snapshot } = setup();
    snapshot.actors = [];
    snapshot.tokens = [];
    command.mockImplementationOnce(async (_url, _payload, request) => { request?.onReplay?.(); return result(); });
    await actions.place("srd-monster:aboleth", "gesture");
    expect(options.reconcile).toHaveBeenCalledOnce();
    expect(options.applyPair).not.toHaveBeenCalled();
    expect(options.remember).not.toHaveBeenCalled();
  });

  it("leaves a restored pair visible when a delayed undo receipt is replayed", async () => {
    const { options, actions, result } = setup();
    command.mockImplementationOnce(async (_url, _payload, request) => {
      request?.onReplay?.();
      return { direction: "undo", actorId: "actor", tokenId: "token", scene: result().scene };
    });
    const history: MonsterPlacementHistory = { kind: "monster.place", sceneId: "scene/one", placementId: "placement?one" };
    expect(await actions.change(history, "undo")).toBe(false);
    expect(command.mock.calls[0]![0]).toBe("/api/v1/scenes/scene%2Fone/compendium-monster-placements/placement%3Fone/history");
    expect(options.removePair).not.toHaveBeenCalled();
  });
});
