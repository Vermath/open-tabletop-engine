import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultCampaignSetupDraft } from "./campaign-setup-state.js";
import { CampaignSetupSteps, deriveFirstSessionSetupSteps, FirstSessionSetupChecklist } from "./campaign-setup-steps.js";

const callbacks = {
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  onKeep: vi.fn(),
  onDiscardDraft: vi.fn()
};

describe("campaign setup steps", () => {
  it("renders one ordered task at a time and keeps advanced settings reachable", () => {
    const sceneDraft = { ...defaultCampaignSetupDraft(), route: { step: "scene" as const, skipped: [] } };
    const html = renderToStaticMarkup(<CampaignSetupSteps draft={sceneDraft} systems={[]} busy={false} recoveryPending={false} {...callbacks} />);
    expect(html).toContain("Campaign setup steps");
    expect(html).toContain("Prepare the first scene");
    expect(html).toContain("Advanced scene and onboarding settings");
    expect(html).toContain("Setup scene grid type");
    expect(html).toContain("Skip for now");
    expect(html).not.toContain("Name the campaign");
  });

  it("shows stale-draft recovery and durable partial-progress retry states", () => {
    const draft = { ...defaultCampaignSetupDraft(), name: "Recovered table", route: { step: "review" as const, skipped: ["invitation" as const] } };
    const html = renderToStaticMarkup(<CampaignSetupSteps draft={draft} systems={[]} busy={false} recoveryPending draftNotice="This setup draft expired." {...callbacks} />);
    expect(html).toContain("This setup draft expired.");
    expect(html).toContain("Start fresh");
    expect(html).toContain("Retry Campaign Setup");
    expect(html).toContain("Keep campaign as-is");
    expect(html).toContain("Invitation (skipped)");
  });
});

describe("first-session authoritative steps", () => {
  const base = { actors: [], currentUserId: "user-one", canCreateCharacter: true, memberCount: 1, pendingInviteCount: 0, scenes: [], tokens: [], encounterCount: 0 };
  const readyScene = { id: "scene-one", backgroundAssetId: "asset-one", gridType: "square" as const, metadata: { mapCalibrationComplete: true } };

  it("derives an empty and completed GM path from campaign records", () => {
    expect(deriveFirstSessionSetupSteps({ ...base, canManage: true }).map((step) => [step.id, step.complete])).toEqual([
      ["character", false], ["invitation", false], ["scene", false], ["encounter", false], ["play", false]
    ]);
    const complete = deriveFirstSessionSetupSteps({
      ...base,
      canManage: true,
      actors: [{ id: "actor-one", type: "character", ownerUserId: "user-two" }],
      memberCount: 2,
      scenes: [readyScene],
      tokens: [{ sceneId: "scene-one" }],
      encounterCount: 1
    });
    expect(complete.slice(0, 4).every((step) => step.complete)).toBe(true);
    expect(complete.find((step) => step.id === "play")?.complete).toBe(true);
  });

  it("requires the map and token to share one playable scene", () => {
    const steps = deriveFirstSessionSetupSteps({
      ...base,
      canManage: true,
      actors: [{ id: "actor-one", type: "character", ownerUserId: "user-two" }],
      scenes: [{ id: "mapped", backgroundAssetId: "asset-one", gridType: "square", metadata: { mapCalibrationComplete: true } }, { id: "tokens", backgroundAssetId: undefined, gridType: "square", metadata: {} }],
      tokens: [{ sceneId: "tokens" }]
    });
    expect(steps.find((step) => step.id === "scene")).toMatchObject({ complete: false, detail: "Put a map and token together on the same scene." });
    expect(steps.find((step) => step.id === "play")?.complete).toBe(false);
  });

  it("limits invited players to their own character and table readiness", () => {
    const player = deriveFirstSessionSetupSteps({ ...base, canManage: false, actors: [{ id: "other", type: "character", ownerUserId: "user-two" }] });
    expect(player.map((step) => step.id)).toEqual(["character", "play"]);
    expect(player[0]?.complete).toBe(false);
    const html = renderToStaticMarkup(<FirstSessionSetupChecklist {...base} canManage={false} onOpen={vi.fn()} />);
    expect(html).toContain("Your character");
    expect(html).not.toContain("Invite players");
    expect(html).not.toContain("Prepare an encounter");
  });

  it("requires a player's character plus a co-located map and non-map token", () => {
    const player = deriveFirstSessionSetupSteps({
      ...base,
      canManage: false,
      actors: [{ id: "mine", type: "character", ownerUserId: "user-one" }],
      scenes: [readyScene],
      tokens: [{ sceneId: "scene-one", layer: "map" }]
    });
    expect(player.find((step) => step.id === "play")?.complete).toBe(false);
    const ready = deriveFirstSessionSetupSteps({ ...base, canManage: false, actors: [{ id: "mine", type: "character", ownerUserId: "user-one" }], scenes: [readyScene], tokens: [{ sceneId: "scene-one", layer: "player" }] });
    expect(ready.find((step) => step.id === "play")?.complete).toBe(true);
  });

  it("does not mark a square-grid map ready until calibration is confirmed", () => {
    const tokens = [{ sceneId: "scene-one", layer: "player" as const }];
    const uncalibrated = deriveFirstSessionSetupSteps({
      ...base,
      canManage: true,
      scenes: [{ id: "scene-one", backgroundAssetId: "asset-one", gridType: "square", metadata: {} }],
      tokens
    });
    expect(uncalibrated.find((step) => step.id === "scene")?.complete).toBe(false);
    expect(uncalibrated.find((step) => step.id === "scene")?.detail).toContain("map calibration");

    const gridless = deriveFirstSessionSetupSteps({
      ...base,
      canManage: true,
      scenes: [{ id: "scene-one", backgroundAssetId: "asset-one", gridType: "gridless", metadata: {} }],
      tokens
    });
    expect(gridless.find((step) => step.id === "scene")?.complete).toBe(true);
  });

  it("gives a player without actor-create permission a truthful assignment action", () => {
    const player = deriveFirstSessionSetupSteps({ ...base, canManage: false, canCreateCharacter: false });
    expect(player[0]?.detail).toBe("Ask the GM to assign your character.");
  });
});
