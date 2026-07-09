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
      updatedAt: "2026-07-05T00:00:00.000Z"
    });
    state.aiMemory.push(
      memoryFact("aim_public", "public", "The entry hall is mapped."),
      memoryFact("aim_gm", "gm_only", "The hidden door opens at moonrise.")
    );

    const context = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: ["campaign.read", "journal.readSecret"]
    });

    expect(context.memory).toEqual([{ text: "The entry hall is mapped.", visibility: "public", sourceIds: [] }]);
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
        updatedAt: "2026-07-05T00:00:00.000Z"
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
        updatedAt: "2026-07-05T00:00:00.000Z"
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
        updatedAt: "2026-07-05T00:00:00.000Z"
      }
    );

    const context = buildPermissionFilteredContext({
      state,
      campaignId: "camp_demo",
      userId: "usr_demo_player",
      permissions: ["actor.read"]
    });

    expect(context.actors).toEqual([
      expect.objectContaining({ id: "act_owned", summary: "Owned Hero (7/10 HP)", privateDataVisible: true }),
      expect.objectContaining({ id: "act_private", summary: "Private Rival", privateDataVisible: false }),
      expect.objectContaining({ id: "act_granted", summary: "Granted Ally (4/8 HP)", privateDataVisible: true })
    ]);
    expect(JSON.stringify(context.actors?.find((actor) => actor.id === "act_private"))).not.toContain("99");
  });
});

function memoryFact(id: string, visibility: AiMemoryFact["visibility"], text: string): AiMemoryFact {
  return {
    id,
    campaignId: "camp_demo",
    text,
    visibility,
    sourceIds: [],
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z"
  };
}
