import type { Actor, Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { adversaryActorsForSceneBoard } from "./actor-rails";

function actor(input: Partial<Actor> & Pick<Actor, "id" | "name">): Actor {
  const { id, name, ...rest } = input;
  return {
    id,
    campaignId: "camp_demo",
    systemId: "generic-fantasy",
    type: "character",
    name,
    data: {},
    permissions: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...rest
  };
}

function token(input: Partial<Token> & Pick<Token, "id" | "sceneId" | "name">): Token {
  const { id, sceneId, name, ...rest } = input;
  return {
    id,
    sceneId,
    name,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player",
    hidden: false,
    locked: false,
    visionEnabled: false,
    visionRadius: 0,
    disposition: "neutral",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...rest
  };
}

describe("actor rails", () => {
  it("shows only adversaries placed as board tokens in the selected scene", () => {
    const actors = [
      actor({ id: "act_goblin", name: "Scene Goblin", type: "monster" }),
      actor({ id: "act_bandit", name: "Scene Bandit", data: { role: "adversary" } }),
      actor({ id: "act_guard", name: "Hostile Guard" }),
      actor({ id: "act_orc", name: "Off-scene Orc", type: "monster" }),
      actor({ id: "act_skeleton", name: "Library Skeleton", type: "monster" }),
      actor({ id: "act_statue", name: "Map Statue", type: "monster" }),
      actor({ id: "act_ally", name: "Friendly Ally" })
    ];
    const tokens = [
      token({ id: "tok_goblin", sceneId: "scn_current", name: "Scene Goblin", actorId: "act_goblin", disposition: "hostile" }),
      token({ id: "tok_bandit", sceneId: "scn_current", name: "Scene Bandit", actorId: "act_bandit", layer: "gm" }),
      token({ id: "tok_guard", sceneId: "scn_current", name: "Hostile Guard", actorId: "act_guard", disposition: "hostile" }),
      token({ id: "tok_orc", sceneId: "scn_other", name: "Off-scene Orc", actorId: "act_orc", disposition: "hostile" }),
      token({ id: "tok_statue", sceneId: "scn_current", name: "Map Statue", actorId: "act_statue", layer: "map", disposition: "hostile" }),
      token({ id: "tok_ally", sceneId: "scn_current", name: "Friendly Ally", actorId: "act_ally", disposition: "friendly" })
    ];

    expect(adversaryActorsForSceneBoard(actors, tokens, "scn_current").map((item) => item.name)).toEqual(["Scene Goblin", "Scene Bandit", "Hostile Guard"]);
  });

  it("shows no adversaries when there is no selected scene", () => {
    const actors = [actor({ id: "act_goblin", name: "Scene Goblin", type: "monster" })];
    const tokens = [token({ id: "tok_goblin", sceneId: "scn_current", name: "Scene Goblin", actorId: "act_goblin", disposition: "hostile" })];

    expect(adversaryActorsForSceneBoard(actors, tokens, undefined)).toEqual([]);
  });
});
