import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CampaignMemberInfo } from "./api.js";
import { ApiError } from "./api.js";
import { describe, expect, it } from "vitest";
import {
  campaignOwnershipConfirmationPhrase,
  campaignOwnershipTransferErrorMessage,
  eligibleCampaignOwnershipTargets
} from "./campaign-ownership-transfer.js";

const componentSource = readFileSync(resolve(__dirname, "campaign-ownership-transfer.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

function member(input: Partial<CampaignMemberInfo> & Pick<CampaignMemberInfo, "id" | "userId">): CampaignMemberInfo {
  return {
    campaignId: "camp_1",
    role: "player",
    user: { id: input.userId, displayName: input.userId },
    permissions: [],
    active: true,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...input
  };
}

describe("campaign ownership transfer surface", () => {
  it("only offers active, direct members other than the current owner", () => {
    const eligible = member({ id: "mem_player", userId: "usr_player" });
    const disabled = member({ id: "mem_disabled", userId: "usr_disabled", active: false });
    const managed = member({
      id: "mem_managed",
      userId: "usr_managed",
      source: { type: "scim_group", groupId: "grp_1", mappingId: "map_1" }
    });
    const current = member({ id: "mem_owner", userId: "usr_owner", role: "owner" });

    expect(eligibleCampaignOwnershipTargets([eligible, disabled, managed, current], current.userId)).toEqual([eligible]);
  });

  it("requires the campaign-specific transfer phrase and maps concurrency policy errors", () => {
    expect(campaignOwnershipConfirmationPhrase("Ember Vault")).toBe("TRANSFER Ember Vault");
    expect(campaignOwnershipTransferErrorMessage(new ApiError("stale", 409, { code: "stale_write" }, ""))).toContain("refreshed campaign");
    expect(campaignOwnershipTransferErrorMessage(new ApiError("archived", 409, { code: "campaign_read_only" }, ""))).toContain("archived");
    expect(campaignOwnershipTransferErrorMessage(new ApiError("forbidden", 403, {}, ""))).toContain("current campaign owner");
  });

  it("keeps one idempotency key per reviewed intent and refreshes account and campaign state", () => {
    expect(componentSource).toContain("props.campaign.ownerUserId !== props.currentUserId");
    expect(componentSource).toContain("attemptRef.current?.fingerprint !== fingerprint");
    expect(componentSource).toContain("campaign-owner-transfer:${window.crypto.randomUUID()}");
    expect(componentSource).toContain("expectedUpdatedAt: props.campaign.updatedAt");
    expect(componentSource).toContain("[props.campaign.id, props.campaign.updatedAt]");
    expect(componentSource).toContain('aria-label="Confirm campaign ownership transfer"');
    expect(appSource).toContain("transferCampaignOwnership(reviewedCampaign.id, input, idempotencyKey");
    expect(appSource).toContain("await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false })");
    expect(appSource).toContain("error.status === 403 || error.status === 409");
  });
});
