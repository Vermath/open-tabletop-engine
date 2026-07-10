import { emptyState, type AiMemoryFact } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildPermissionFilteredContext } from "./index.js";

describe("buildPermissionFilteredContext", () => {
  it("does not expose GM AI memory through journal secret permission alone", () => {
    const state = emptyState();
    state.campaigns.push({
      id: "camp_demo",
      ownerUserId: "usr_demo_gm",
      name: "The Ember Vault",
      description: "",
      defaultSystemId: "dnd-5e-srd",
      visibility: "private",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    state.aiMemory.push(
      memoryFact("aim_public", "public", "The entry hall is mapped."),
      memoryFact("aim_gm", "gm_only", "The hidden door opens at moonrise."),
    );

    const context = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: ["campaign.read", "journal.readSecret"],
    });

    expect(context.memory).toEqual([
      {
        text: "The entry hall is mapped.",
        visibility: "public",
        sourceIds: [],
      },
    ]);
  });

  it("only includes private actor summaries for globally allowed, owning, or explicitly granted users", () => {
    const state = emptyState();
    state.actors.push(
      {
        id: "act_owned",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        ownerUserId: "usr_demo_player",
        type: "character",
        name: "Owned Hero",
        data: { hp: { current: 7, max: 10 } },
        permissions: {},
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      },
      {
        id: "act_private",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        ownerUserId: "usr_demo_gm",
        type: "npc",
        name: "Private Rival",
        data: { hp: { current: 99, max: 99 } },
        permissions: {},
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      },
      {
        id: "act_granted",
        campaignId: "camp_demo",
        systemId: "generic-fantasy",
        ownerUserId: "usr_demo_gm",
        type: "npc",
        name: "Granted Ally",
        data: { hp: { current: 4, max: 8 } },
        permissions: { usr_demo_player: ["actor.readPrivate"] },
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      },
    );

    const context = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: ["actor.read", "actor.update"],
    });

    expect(context.actors).toEqual([
      expect.objectContaining({
        id: "act_owned",
        summary: "Owned Hero (7/10 HP)",
        privateDataVisible: true,
      }),
      expect.objectContaining({
        id: "act_private",
        summary: "Private Rival",
        privateDataVisible: false,
      }),
      expect.objectContaining({
        id: "act_granted",
        summary: "Granted Ally (4/8 HP)",
        privateDataVisible: true,
      }),
    ]);
    expect(
      JSON.stringify(
        context.actors?.find((actor) => actor.id === "act_private"),
      ),
    ).not.toContain("99");
  });

  it("does not send hidden prep scenes, encounters, or unexposed actors to a player-facing provider", () => {
    const state = emptyState();
    state.campaigns.push({
      id: "camp_demo",
      ownerUserId: "usr_demo_gm",
      name: "The Ember Vault",
      description: "",
      defaultSystemId: "generic-fantasy",
      visibility: "private",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    state.scenes.push(
      scene("scn_live", "Revealed Hall", true),
      scene("scn_prep", "Secret Finale", false),
    );
    state.actors.push(
      actor("act_owned", "Owned Hero", "usr_demo_player"),
      actor("act_revealed", "Revealed Guide", "usr_demo_gm"),
      actor("act_secret", "Secret Final Boss", "usr_demo_gm"),
    );
    state.tokens.push(
      token("tok_revealed", "scn_live", "act_revealed", false),
      token("tok_hidden", "scn_live", "act_secret", true),
      token("tok_prep", "scn_prep", "act_secret", false),
    );
    state.encounters.push({
      id: "enc_secret",
      campaignId: "camp_demo",
      name: "Secret Finale Encounter",
      summary: "Hidden prep",
      tokenIds: ["tok_prep"],
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });

    const player = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: ["campaign.read", "scene.read", "actor.read"],
    });
    expect(player.scenes).toEqual([
      { id: "scn_live", name: "Revealed Hall", active: true },
    ]);
    expect(player.actors?.map((entry) => entry.id)).toEqual([
      "act_owned",
      "act_revealed",
    ]);
    expect(player.encounters).toEqual([]);
    expect(JSON.stringify(player)).not.toContain("Secret Finale");
    expect(JSON.stringify(player)).not.toContain("Secret Final Boss");

    const sceneEditor = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: [
        "campaign.read",
        "scene.read",
        "scene.update",
        "actor.read",
      ],
    });
    expect(sceneEditor.scenes?.map((entry) => entry.id)).toEqual([
      "scn_live",
      "scn_prep",
    ]);
    expect(sceneEditor.actors?.map((entry) => entry.id)).toEqual([
      "act_owned",
      "act_revealed",
    ]);
    expect(sceneEditor.encounters).toEqual([]);

    const gm = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_gm",
      permissions: [
        "campaign.read",
        "campaign.update",
        "scene.read",
        "actor.read",
        "combat.manage",
      ],
    });
    expect(gm.scenes?.map((entry) => entry.id)).toEqual([
      "scn_live",
      "scn_prep",
    ]);
    expect(gm.actors?.map((entry) => entry.id)).toEqual([
      "act_owned",
      "act_revealed",
      "act_secret",
    ]);
    expect(gm.encounters?.map((entry) => entry.id)).toEqual(["enc_secret"]);
  });
});

function memoryFact(
  id: string,
  visibility: AiMemoryFact["visibility"],
  text: string,
): AiMemoryFact {
  return {
    id,
    campaignId: "camp_demo",
    text,
    visibility,
    sourceIds: [],
    status: "approved",
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };
}

function scene(id: string, name: string, active: boolean) {
  return {
    id,
    campaignId: "camp_demo",
    name,
    width: 1000,
    height: 1000,
    gridType: "square" as const,
    gridSize: 50,
    active,
    sortOrder: active ? 0 : 1,
    fog: [],
    walls: [],
    lights: [],
    annotations: [],
    metadata: {},
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };
}

function actor(id: string, name: string, ownerUserId: string) {
  return {
    id,
    campaignId: "camp_demo",
    systemId: "generic-fantasy",
    ownerUserId,
    type: "character",
    name,
    data: {},
    permissions: {},
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };
}

function token(id: string, sceneId: string, actorId: string, hidden: boolean) {
  return {
    id,
    sceneId,
    actorId,
    name: id,
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player" as const,
    hidden,
    locked: false,
    visionEnabled: false,
    visionRadius: 0,
    disposition: "neutral" as const,
    metadata: {},
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  };
}
