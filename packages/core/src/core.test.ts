import { describe, expect, it } from "vitest";
import { approveProposal, applyProposal, hasPermission, seedState } from "./index.js";

describe("core permissions", () => {
  it("gives owners full campaign authority and keeps observers read-only", () => {
    const state = seedState();
    expect(
      hasPermission({
        userId: "usr_demo_gm",
        campaignId: "camp_demo",
        permission: "ai.applyChanges",
        members: state.members,
        grants: state.permissionGrants
      })
    ).toBe(true);
  });
});

describe("proposal application", () => {
  it("requires approval before mutating state", () => {
    const state = seedState();
    const proposal = {
      id: "prop_test",
      campaignId: "camp_demo",
      createdByType: "ai" as const,
      title: "Add note",
      summary: "Draft a note",
      status: "pending" as const,
      approvalRequired: true,
      changesJson: [
        {
          entity: "journal" as const,
          action: "create" as const,
          data: {
            id: "jnl_new",
            campaignId: "camp_demo",
            title: "New note",
            body: "Text",
            visibility: "gm_only",
            visibleToUserIds: [],
            visibleToActorIds: [],
            tags: [],
            createdBy: "usr_demo_gm",
            updatedBy: "usr_demo_gm",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        }
      ],
      diffJson: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };

    expect(() => applyProposal(state, proposal)).toThrow("approved");
    const approved = approveProposal(proposal, "usr_demo_gm");
    expect(applyProposal({ ...state, proposals: [approved] }, approved).journals).toHaveLength(2);
  });
});
