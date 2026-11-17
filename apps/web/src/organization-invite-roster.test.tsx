import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationInviteInfo } from "./api.js";
import { filterOrganizationInvites, OrganizationInviteRoster } from "./organization-invite-roster.js";

const timestamp = "2026-07-17T00:00:00.000Z";

function inviteFixture(index: number, status: OrganizationInviteInfo["status"] = "pending"): OrganizationInviteInfo {
  return {
    id: `invite-${index}`,
    campaignId: `campaign-${index % 3}`,
    campaign: { id: `campaign-${index % 3}`, name: `Campaign ${index % 3}` },
    email: `player-${String(index).padStart(3, "0")}@example.com`,
    role: index % 2 === 0 ? "observer" : "player",
    invitedByUserId: "owner-1",
    expiresAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
  };
}

describe("organization invite roster", () => {
  const invites = Array.from({ length: 40 }, (_, index) => inviteFixture(index + 1));

  it("renders every invite above the former eight-record cap", () => {
    const html = renderToStaticMarkup(<OrganizationInviteRoster invites={invites} onRevoke={vi.fn()} />);

    expect(html).toContain("40 invites");
    expect(html).toContain("player-040@example.com");
    expect(html.match(/aria-label="Revoke invite"/g)).toHaveLength(40);
  });

  it("searches the entire invite roster and keeps late matches reachable", () => {
    expect(filterOrganizationInvites(invites, "player-040").map((invite) => invite.id)).toEqual(["invite-40"]);
    const html = renderToStaticMarkup(<OrganizationInviteRoster invites={invites} defaultSearch="player-040" onRevoke={vi.fn()} />);

    expect(html).toContain("1 of 40 invites");
    expect(html).toContain("player-040@example.com");
    expect(html).not.toContain("player-039@example.com");
  });

  it("keeps non-pending invites visible with revoke disabled", () => {
    const html = renderToStaticMarkup(<OrganizationInviteRoster invites={[inviteFixture(1, "accepted")]} onRevoke={vi.fn()} />);
    expect(html).toContain("accepted");
    expect(html).toContain("disabled");
  });
});
