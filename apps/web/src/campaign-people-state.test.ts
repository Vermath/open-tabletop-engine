import type { Campaign } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import type { OrganizationInviteInfo } from "./api.js";
import {
  campaignPeopleCount,
  reconcileInviteCreation,
} from "./campaign-people-state.js";

describe("campaign people state", () => {
  it("counts accepted campaign members instead of pending invites", () => {
    expect(campaignPeopleCount([{}, {}, {}, {}])).toBe(4);
    expect(campaignPeopleCount([])).toBe(0);
  });

  it("carries the authoritative campaign revision into the next invite request", () => {
    const campaign = {
      id: "camp-one",
      updatedAt: "2026-07-18T10:00:00.000Z",
    } as Campaign;
    const invite = {
      id: "invite-one",
      campaignId: campaign.id,
      campaign: { id: campaign.id, name: "Campaign" },
      status: "pending",
    } as OrganizationInviteInfo;
    const before = {
      campaigns: [campaign],
      organizationInvites: [] as OrganizationInviteInfo[],
      untouched: true,
    };

    const after = reconcileInviteCreation(
      before,
      campaign.id,
      { campaignUpdatedAt: "2026-07-18T10:00:01.000Z" },
      [invite],
    );

    expect(after).toMatchObject({
      campaigns: [{ id: campaign.id, updatedAt: "2026-07-18T10:00:01.000Z" }],
      organizationInvites: [invite],
      untouched: true,
    });
    expect(before.campaigns[0]?.updatedAt).toBe("2026-07-18T10:00:00.000Z");
  });
});
