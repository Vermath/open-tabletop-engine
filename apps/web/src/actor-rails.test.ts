import type { Actor, Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { actorForSelection, adversaryActorsForSceneBoard } from "./actor-rails";

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
  it("preserves explicit actor selection and fallbacks when no token is selected", () => {
    const actors = [
      actor({ id: "act_other_system", name: "Other System", systemId: "other-system" }),
      actor({ id: "act_active_system", name: "Active System" }),
      actor({ id: "act_off_board", name: "Off Board" })
    ];

    expect(actorForSelection(actors, "act_off_board", undefined, "generic-fantasy")?.id).toBe("act_off_board");
    expect(actorForSelection(actors, "", undefined, "generic-fantasy")?.id).toBe("act_active_system");
    expect(actorForSelection(actors, "act_missing", undefined, "generic-fantasy")?.id).toBe("act_active_system");
    expect(actorForSelection(actors, "", undefined, "missing-system")?.id).toBe("act_other_system");
  });

  it.each(["act_off_board", "", "act_missing"])("keeps an unlinked selected token actorless with actor selection %j", (selectedActorId) => {
    const actors = [
      actor({ id: "act_default", name: "Default" }),
      actor({ id: "act_off_board", name: "Off Board" })
    ];

    expect(actorForSelection(actors, selectedActorId, {}, "generic-fantasy")).toBeUndefined();
  });

  it.each(["act_off_board", "", "act_missing"])("keeps a selected token actorless when its linked actor is unavailable with actor selection %j", (selectedActorId) => {
    const actors = [
      actor({ id: "act_default", name: "Default" }),
      actor({ id: "act_off_board", name: "Off Board" })
    ];

    expect(actorForSelection(actors, selectedActorId, { actorId: "act_unavailable" }, "generic-fantasy")).toBeUndefined();
  });

  it("prefers the selected token's linked actor over an explicitly selected actor", () => {
    const actors = [
      actor({ id: "act_off_board", name: "Off Board" }),
      actor({ id: "act_on_board", name: "On Board" })
    ];

    expect(actorForSelection(actors, "act_off_board", { actorId: "act_on_board" }, "generic-fantasy")?.id).toBe("act_on_board");
  });

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
