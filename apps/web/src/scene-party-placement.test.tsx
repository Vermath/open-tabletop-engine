import type { Actor, Scene, Token } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScenePartyPlacementControl, placeMissingPartyTokens, planMissingPartyTokenPlacements, type MissingPartyTokenCreateOptions } from "./scene-party-placement.js";

const timestamp = "2026-07-18T00:00:00.000Z";

function actor(id: string, name = id): Actor {
  return {
    id,
    campaignId: "camp-party",
    systemId: "dnd-5e-srd",
    type: "character",
    name,
    data: {},
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const scene: Scene = {
  id: "scn-bridge",
  campaignId: "camp-party",
  name: "Furnace Bridge",
  width: 300,
  height: 200,
  gridSize: 50,
  gridType: "square",
  active: false,
  sortOrder: 0,
  fog: [],
  walls: [],
  lights: [],
  annotations: [],
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};

function token(input: Partial<Token> & Pick<Token, "id" | "actorId" | "x" | "y">): Token {
  return {
    id: input.id,
    sceneId: scene.id,
    actorId: input.actorId,
    name: input.name ?? input.actorId ?? input.id,
    x: input.x,
    y: input.y,
    width: input.width ?? 50,
    height: input.height ?? 50,
    rotation: 0,
    layer: input.layer ?? "player",
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 160,
    disposition: input.disposition ?? "friendly",
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("selected-scene party placement", () => {
  it("plans only missing actors and never overlaps or relocates existing tokens", () => {
    const aric = actor("act-aric", "Aric");
    const maelin = actor("act-maelin", "Maelin");
    const ilyra = actor("act-ilyra", "Ilyra");
    const existingAric = token({ id: "tok-aric", actorId: aric.id, x: 100, y: 100 });
    const occupiedEnemy = token({ id: "tok-enemy", actorId: "act-enemy", x: 50, y: 100, disposition: "hostile" });

    const plan = planMissingPartyTokenPlacements(scene, [aric, maelin, ilyra, maelin], [existingAric, occupiedEnemy]);

    expect(plan.missingActorIds).toEqual([maelin.id, ilyra.id]);
    expect(plan.blockedActorIds).toEqual([]);
    expect(plan.placements.map((placement) => placement.actorId)).toEqual([maelin.id, ilyra.id]);
    expect(existingAric).toEqual(expect.objectContaining({ x: 100, y: 100 }));

    const plannedRectangles = plan.placements.map((placement) => ({
      x: placement.centerX - placement.width / 2,
      y: placement.centerY - placement.height / 2,
      width: placement.width,
      height: placement.height,
    }));
    const occupiedRectangles = [existingAric, occupiedEnemy];
    for (const [index, placement] of plannedRectangles.entries()) {
      for (const occupied of occupiedRectangles) expect(overlaps(placement, occupied)).toBe(false);
      for (const other of plannedRectangles.slice(index + 1)) expect(overlaps(placement, other)).toBe(false);
    }
  });

  it.each([
    { x: 8.25, y: 12.5 },
    { x: -29.25, y: 125 },
  ])("fills only complete fractional cells for grid origin %j without moving existing tokens", (gridOrigin) => {
    const fractionalScene = { ...scene, width: 121, height: 125, gridSize: 37.5, gridOrigin };
    const aric = actor("act-aric");
    const missingParty = Array.from({ length: 8 }, (_, index) => actor(`act-missing-${index}`));
    const existingAric = token({ id: "tok-aric", actorId: aric.id, x: 45.75, y: 50, width: 37.5, height: 37.5 });
    const occupiedEnemy = token({ id: "tok-enemy", actorId: "act-enemy", x: 8.25, y: 12.5, width: 37.5, height: 37.5 });
    const existingTokens = [existingAric, occupiedEnemy];
    const originalTokens = structuredClone(existingTokens);

    const plan = planMissingPartyTokenPlacements(fractionalScene, [aric, ...missingParty], existingTokens);

    expect(plan.missingActorIds).toEqual(missingParty.map((member) => member.id));
    expect(plan.blockedActorIds).toEqual([missingParty[7]!.id]);
    expect(plan.placements).toHaveLength(7);
    expect(existingTokens).toEqual(originalTokens);
    const rectangles = plan.placements.map((placement) => ({
      x: placement.centerX - placement.width / 2,
      y: placement.centerY - placement.height / 2,
      width: placement.width,
      height: placement.height,
    }));
    expect(rectangles.map(({ x, y }) => `${x},${y}`).sort()).toEqual([
      "45.75,12.5", "83.25,12.5", "8.25,50", "83.25,50", "8.25,87.5", "45.75,87.5", "83.25,87.5",
    ].sort());
    for (const [index, rectangle] of rectangles.entries()) {
      expect(rectangle.width).toBe(37.5);
      expect(rectangle.height).toBe(37.5);
      expect(rectangle.x).toBeGreaterThanOrEqual(0);
      expect(rectangle.y).toBeGreaterThanOrEqual(0);
      expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(fractionalScene.width);
      expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(fractionalScene.height);
      for (const occupied of existingTokens) expect(overlaps(rectangle, occupied)).toBe(false);
      for (const other of rectangles.slice(index + 1)) expect(overlaps(rectangle, other)).toBe(false);
    }
  });

  it("ignores grid origin when staging fractional tokens in a gridless scene", () => {
    const gridlessScene: Scene = { ...scene, width: 75, height: 75, gridSize: 37.5, gridType: "gridless", gridOrigin: { x: 8.25, y: 12.5 } };
    const party = Array.from({ length: 4 }, (_, index) => actor(`act-${index}`));

    const plan = planMissingPartyTokenPlacements(gridlessScene, party, []);

    expect(plan.blockedActorIds).toEqual([]);
    expect(plan.placements).toHaveLength(4);
    expect(plan.placements.map(({ centerX, centerY }) => `${centerX},${centerY}`).sort()).toEqual([
      "18.75,18.75", "56.25,18.75", "18.75,56.25", "56.25,56.25",
    ].sort());
    for (const placement of plan.placements) {
      expect(placement.width).toBe(37.5);
      expect(placement.height).toBe(37.5);
    }
  });
  it("ignores decorative map-layer assets but reports actors that cannot fit without overlap", () => {
    const smallScene = { ...scene, width: 100, height: 50 };
    const decorativeMap = token({ id: "tok-map", actorId: undefined, x: 0, y: 0, width: 100, height: 50, layer: "map" });
    const first = actor("act-first");
    const second = actor("act-second");
    const third = actor("act-third");

    const plan = planMissingPartyTokenPlacements(smallScene, [first, second, third], [decorativeMap]);

    expect(plan.placements.map((placement) => placement.actorId)).toEqual([first.id, second.id]);
    expect(plan.blockedActorIds).toEqual([third.id]);
  });

  it("feeds each authoritative scene revision into the next serial token create", async () => {
    const party = [actor("act-aric", "Aric"), actor("act-maelin", "Maelin")];
    const firstRevision = { ...scene, updatedAt: "2026-07-18T00:00:01.000Z" };
    const secondRevision = { ...scene, updatedAt: "2026-07-18T00:00:02.000Z" };
    const createToken = vi.fn(async (options: MissingPartyTokenCreateOptions) => {
      const revision = createToken.mock.calls.length === 1 ? firstRevision : secondRevision;
      options.onSceneRevision(revision);
      return token({
        id: `tok-${options.actorId}`,
        actorId: options.actorId,
        x: options.x - options.width / 2,
        y: options.y - options.height / 2,
        width: options.width,
        height: options.height,
      });
    });

    const result = await placeMissingPartyTokens({
      scene,
      partyActors: party,
      tokens: [],
      placementAttemptId: "attempt-1",
      createToken,
    });

    expect(result).toEqual({ placed: 2, sceneName: "Furnace Bridge" });
    expect(createToken).toHaveBeenCalledTimes(2);
    expect(createToken.mock.calls[0]![0]).toEqual(expect.objectContaining({
      actorId: party[0]!.id,
      width: scene.gridSize,
      height: scene.gridSize,
      targetSceneRevision: scene,
      idempotencyKey: `party-place:${scene.id}:${party[0]!.id}:attempt-1`,
    }));
    expect(createToken.mock.calls[1]![0]).toEqual(expect.objectContaining({
      actorId: party[1]!.id,
      targetSceneRevision: firstRevision,
      idempotencyKey: `party-place:${scene.id}:${party[1]!.id}:attempt-1`,
    }));
  });

  it("exposes an explicit permission-disabled selected-scene action", () => {
    const party = [actor("act-aric", "Aric"), actor("act-maelin", "Maelin")];
    const denied = renderToStaticMarkup(
      <ScenePartyPlacementControl scene={scene} partyActors={party} tokens={[]} canCreateToken={false} onPlaceMissingParty={vi.fn()} />
    );
    const ready = renderToStaticMarkup(
      <ScenePartyPlacementControl scene={scene} partyActors={party} tokens={[]} canCreateToken onPlaceMissingParty={vi.fn()} />
    );

    expect(denied).toContain("Place missing party (2)");
    expect(denied).toContain("Requires token.create");
    expect(denied).toContain("disabled");
    expect(ready).toContain("Place 2 missing party tokens on Furnace Bridge without moving existing tokens");
    expect(ready).not.toContain("disabled");
  });

  it("disables the action when every party actor is already represented", () => {
    const aric = actor("act-aric", "Aric");
    const html = renderToStaticMarkup(
      <ScenePartyPlacementControl scene={scene} partyActors={[aric]} tokens={[token({ id: "tok-aric", actorId: aric.id, x: 0, y: 0 })]} canCreateToken onPlaceMissingParty={vi.fn()} />
    );

    expect(html).toContain("Party already placed");
    expect(html).toContain("Every party actor already has a token on Furnace Bridge");
    expect(html).toContain("disabled");
  });
});

function overlaps(
  left: Pick<Token, "x" | "y" | "width" | "height">,
  right: Pick<Token, "x" | "y" | "width" | "height">
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}
