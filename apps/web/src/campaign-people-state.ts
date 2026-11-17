import type { Campaign } from "@open-tabletop/core";
import type { InviteCreateInfo, OrganizationInviteInfo } from "./api.js";

export function campaignPeopleCount(members: readonly unknown[]): number {
  return members.length;
}

export function reconcileInviteCreation<
  TSnapshot extends {
    campaigns: Campaign[];
    organizationInvites: OrganizationInviteInfo[];
  },
>(
  snapshot: TSnapshot,
  campaignId: string,
  result: Pick<InviteCreateInfo, "campaignUpdatedAt">,
  organizationInvites: OrganizationInviteInfo[],
): TSnapshot {
  return {
    ...snapshot,
    campaigns: result.campaignUpdatedAt
      ? snapshot.campaigns.map((campaign) =>
          campaign.id === campaignId
            ? { ...campaign, updatedAt: result.campaignUpdatedAt! }
            : campaign,
        )
      : snapshot.campaigns,
    organizationInvites,
  };
}
