import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CampaignMemberInfo } from "./api.js";
import { CampaignMemberRemovalReview, CampaignMembersPanel, campaignMemberManagementReason } from "./campaign-members-panel.js";

const at = "2026-07-15T00:00:00.000Z";

function member(overrides: Partial<CampaignMemberInfo> = {}): CampaignMemberInfo {
  return {
    id: "member-1",
    campaignId: "campaign-1",
    userId: "user-1",
    role: "player",
    user: { id: "user-1", displayName: "Mira Vale", email: "mira@example.com" },
    active: true,
    permissions: ["campaign.read"],
    createdAt: at,
    updatedAt: at,
    ...overrides
  };
}

describe("campaign member management", () => {
  it("protects owner, current-user, SCIM, and read-only memberships", () => {
    expect(campaignMemberManagementReason(member({ role: "owner" }), "someone-else", true)).toContain("ownership transfer");
    expect(campaignMemberManagementReason(member(), "user-1", true)).toContain("locking yourself out");
    expect(campaignMemberManagementReason(member({ source: { type: "scim_group", mappingId: "mapping-1", groupId: "group-1" } }), "someone-else", true)).toContain("SCIM");
    expect(campaignMemberManagementReason(member(), "someone-else", false)).toContain("view campaign members");
    expect(campaignMemberManagementReason(member(), "someone-else", true)).toBeUndefined();
  });

  it("renders role controls only for safely manageable members", () => {
    const html = renderToStaticMarkup(
      <CampaignMembersPanel campaignId="campaign-1" currentUserId="owner-1" members={[member(), member({ id: "owner-member", userId: "owner-1", role: "owner", user: { id: "owner-1", displayName: "Owner", email: "owner@example.com" } })]} canManage onMemberUpdated={vi.fn()} onMemberRemoved={vi.fn()} onRefresh={vi.fn()} onStatus={vi.fn()} />
    );
    expect(html).toContain("Campaign Members");
    expect(html).toContain("Campaign role for Mira Vale");
    expect(html).toContain("Review removal");
    expect(html).toContain("Use campaign ownership transfer");
  });

  it("uses an explicit impact review instead of a native confirmation", () => {
    const html = renderToStaticMarkup(<CampaignMemberRemovalReview member={member()} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("immediately ends campaign access");
    expect(html).toContain("organization role are unchanged");
    expect(html).toContain("Remove campaign member");
    expect(html).toContain("Keep member");
  });
});
