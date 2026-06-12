import { describe, expect, it } from "vitest";
import type { Proposal } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";
import { applyProposalChangesToSnapshot, proposalReviewActionLabel, proposalReviewSteps, visibleAiAgentProposals } from "./proposal-review.js";

describe("proposal review helpers", () => {
  it("approves pending proposals before applying them", () => {
    expect(proposalReviewSteps({ status: "pending" })).toEqual(["approve", "apply"]);
    expect(proposalReviewActionLabel({ status: "pending" })).toBe("Approve and apply");
  });

  it("applies already-approved proposals without trying to approve them again", () => {
    expect(proposalReviewSteps({ status: "approved" })).toEqual(["apply"]);
    expect(proposalReviewActionLabel({ status: "approved" })).toBe("Apply");
  });

  it("does not offer a review action for terminal proposal states", () => {
    expect(proposalReviewSteps({ status: "applied" })).toEqual([]);
    expect(proposalReviewActionLabel({ status: "applied" })).toBe("Applied");
    expect(proposalReviewSteps({ status: "rejected" })).toEqual([]);
    expect(proposalReviewActionLabel({ status: "rejected" })).toBe("Rejected");
  });

  it("hides agent proposals as soon as an action starts", () => {
    const pending = proposalFixture({ id: "prop_pending", status: "pending", title: "Pending board edit" });
    const approved = proposalFixture({ id: "prop_approved", status: "approved", title: "Approved board edit" });

    const visible = visibleAiAgentProposals([pending, approved], [{ proposalIds: ["prop_pending", "prop_approved"] }], new Set(["prop_pending"]));

    expect(visible.map((proposal) => proposal.id)).toEqual(["prop_approved"]);
  });

  it("does not keep terminal proposals in the agent action list", () => {
    const applied = proposalFixture({ id: "prop_applied", status: "applied", title: "Applied board edit" });
    const rejected = proposalFixture({ id: "prop_rejected", status: "rejected", title: "Rejected board edit" });

    const visible = visibleAiAgentProposals([applied, rejected], [{ proposalIds: ["prop_applied", "prop_rejected"] }]);

    expect(visible).toEqual([]);
  });

  it("applies returned proposal changes into the local snapshot", () => {
    const proposal = proposalFixture({
      id: "prop_apply",
      status: "applied",
      updatedAt: "2026-05-24T04:00:00.000Z",
      changesJson: [
        { entity: "scene", action: "update", id: "scn_demo", data: { name: "AI-built chamber", backgroundAssetId: "asset_map" } },
        { entity: "token", action: "create", data: { id: "tok_ai", sceneId: "scn_demo", name: "AI Guard", x: 200, y: 240 } },
        { entity: "diceMacro", action: "create", data: { id: "mac_ai", campaignId: "camp_demo", name: "AI Damage", formula: "1d8+2", visibility: "public" } },
        { entity: "fogPreset", action: "create", data: { id: "fogp_ai", campaignId: "camp_demo", name: "AI Fog", regions: [] } }
      ]
    });
    const snapshot = snapshotFixture({
      scenes: [{ id: "scn_demo", name: "Old chamber", backgroundAssetId: undefined } as Snapshot["scenes"][number]],
      tokens: [],
      proposals: [proposalFixture({ id: "prop_apply", status: "approved" })]
    });

    const next = applyProposalChangesToSnapshot(snapshot, proposal);

    expect(next.scenes.find((scene) => scene.id === "scn_demo")).toMatchObject({ name: "AI-built chamber", backgroundAssetId: "asset_map", updatedAt: "2026-05-24T04:00:00.000Z" });
    expect(next.tokens).toEqual([expect.objectContaining({ id: "tok_ai", sceneId: "scn_demo", name: "AI Guard" })]);
    expect(next.diceMacros).toEqual([expect.objectContaining({ id: "mac_ai", name: "AI Damage" })]);
    expect(next.fogPresets).toEqual([expect.objectContaining({ id: "fogp_ai", name: "AI Fog" })]);
    expect(next.proposals.find((item) => item.id === "prop_apply")).toMatchObject({ status: "applied" });
  });
});

function proposalFixture(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "prop_fixture",
    campaignId: "camp_demo",
    createdByType: "ai",
    title: "Proposal fixture",
    summary: "Fixture proposal",
    status: "pending",
    changesJson: [],
    diffJson: {},
    approvalRequired: true,
    createdAt: "2026-05-24T03:00:00.000Z",
    updatedAt: "2026-05-24T03:00:00.000Z",
    ...overrides
  };
}

function snapshotFixture(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    campaigns: [],
    organizations: [],
    organizationMembers: [],
    organizationInvites: [],
    members: [],
    scenes: [],
    fogPresets: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    journals: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    audioTracks: [],
    encounters: [],
    combats: [],
    combatAudit: [],
    proposals: [],
    contentImports: [],
    memory: [],
    aiThreads: [],
    aiToolCalls: [],
    plugins: [],
    systems: [],
    characterTemplates: [],
    ...overrides
  };
}
