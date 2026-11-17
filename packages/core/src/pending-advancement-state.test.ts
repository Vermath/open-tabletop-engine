import { describe, expect, it } from "vitest";

import { emptyState, makeArchive, normalizeEngineState, seedState } from "./state.js";
import type { Dnd5eSrdPendingAdvancement } from "./types.js";

const pendingAdvancement: Dnd5eSrdPendingAdvancement = {
  id: "adv_pending_valen_2",
  campaignId: "camp_demo",
  actorId: "act_valen",
  systemId: "dnd-5e-srd",
  status: "ready",
  request: {
    targetLevel: 2,
    choices: {
      hitPoints: "fixed"
    }
  },
  preparedPreviewKey: "preview_key_2",
  actorUpdatedAt: "2026-07-13T16:00:00.000Z",
  createdByUserId: "usr_demo_player",
  createdAt: "2026-07-13T16:01:00.000Z",
  updatedAt: "2026-07-13T16:01:00.000Z"
};

describe("pending advancement state", () => {
  it("defaults the durable collection in new and legacy engine state", () => {
    expect(emptyState().pendingAdvancements).toEqual([]);

    const { pendingAdvancements: _pendingAdvancements, ...legacy } = seedState();

    expect(normalizeEngineState(legacy).pendingAdvancements).toEqual([]);
  });

  it("preserves pending advancement fields through normalization", () => {
    const state = seedState();
    state.pendingAdvancements.push(pendingAdvancement);

    const normalized = normalizeEngineState(state);

    expect(normalized.pendingAdvancements).toEqual([pendingAdvancement]);
  });

  it("archives only the campaign pending advancements as a detached snapshot", () => {
    const state = seedState();
    state.pendingAdvancements.push(
      pendingAdvancement,
      {
        ...pendingAdvancement,
        id: "adv_pending_other",
        campaignId: "camp_other",
        actorId: "act_other",
        preparedPreviewKey: "preview_key_other"
      }
    );

    const archive = makeArchive(state, "camp_demo");

    expect(archive.data.pendingAdvancements).toEqual([pendingAdvancement]);
    archive.data.pendingAdvancements[0]!.request.targetLevel = 3;
    expect(state.pendingAdvancements[0]!.request.targetLevel).toBe(2);

    const restored = normalizeEngineState(archive.data);
    expect(restored.pendingAdvancements).toEqual(archive.data.pendingAdvancements);
  });
});
