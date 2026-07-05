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
      permissions: ["campaign.read", "journal.readSecret"]
    });

    expect(context.memory).toEqual([{ text: "The entry hall is mapped.", visibility: "public", sourceIds: [] }]);
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
