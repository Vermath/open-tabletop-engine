import type { Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyActiveSceneIdentity, applyAuthoritativeScene } from "./active-scene-state.js";

function scene(id: string, campaignId: string, active: boolean, updatedAt = "2026-07-18T12:00:00.000Z"): Scene {
  return {
    id,
    campaignId,
    name: id,
    active,
    sortOrder: 0,
    width: 1200,
    height: 800,
    gridType: "square",
    gridSize: 50,
    fog: [],
    walls: [],
    lights: [],
    annotations: [],
    metadata: {},
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("active scene state", () => {
  it("applies a session-start activation identity in one immutable update", () => {
    const previous = scene("scene-old", "campaign-one", true);
    const requested = scene("scene-next", "campaign-one", false);
    const otherCampaign = scene("scene-other", "campaign-two", true);
    const scenes = [previous, requested, otherCampaign];

    const next = applyActiveSceneIdentity(scenes, "campaign-one", requested.id);

    expect(next.filter((candidate) => candidate.campaignId === "campaign-one" && candidate.active).map((candidate) => candidate.id)).toEqual([requested.id]);
    expect(next.find((candidate) => candidate.id === otherCampaign.id)?.active).toBe(true);
    expect(scenes.map((candidate) => candidate.active)).toEqual([true, false, true]);
  });

  it("uses an authoritative activation response and clears the prior scene immediately", () => {
    const previous = scene("scene-old", "campaign-one", true);
    const target = scene("scene-next", "campaign-one", false);
    const authoritative = {
      ...target,
      active: true,
      updatedAt: "2026-07-18T12:05:00.000Z",
      activationHistory: [{
        id: "activation-one",
        sceneId: target.id,
        activatedAt: "2026-07-18T12:05:00.000Z",
        previousActiveSceneId: previous.id,
        deactivatedSceneIds: [previous.id],
        source: "activate" as const,
      }],
    };

    const next = applyAuthoritativeScene([previous, target], authoritative);

    expect(next.find((candidate) => candidate.id === previous.id)?.active).toBe(false);
    expect(next.find((candidate) => candidate.id === target.id)).toBe(authoritative);
    expect(next.filter((candidate) => candidate.active)).toHaveLength(1);
  });
});
