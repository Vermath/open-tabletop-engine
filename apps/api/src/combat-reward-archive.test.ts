import { emptyState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { validateCampaignArchiveShape } from "./archive-validation.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function rewardArchive(reward: Record<string, unknown>) {
  const data = emptyState() as unknown as Record<string, unknown[]>;
  data.combats = [{
    id: "cmb_reward_archive",
    campaignId: "camp_reward_archive",
    active: false,
    round: 2,
    turnIndex: 0,
    combatants: [],
    rewards: [reward],
    createdAt: timestamp,
    updatedAt: timestamp
  }];
  return {
    format: "ottx",
    version: "0.2.0",
    exportedAt: timestamp,
    manifest: { campaignId: "camp_reward_archive", name: "Reward archive", schemaVersion: "0.3.0", assetCount: 0, assetFileCount: 0 },
    data,
    files: []
  };
}

describe("combat reward archive validation", () => {
  it("accepts complete reward history and rejects partial reward records", () => {
    const reward = {
      id: "rwrd_archive",
      campaignId: "camp_reward_archive",
      combatId: "cmb_reward_archive",
      awardedByUserId: "usr_gm",
      recipientActorIds: [],
      totalXp: 0,
      xpPerActor: 0,
      unallocatedXp: 0,
      totalGp: 0,
      gpPerActor: 0,
      unallocatedGp: 0,
      loot: ["Recovered key"],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    expect(validateCampaignArchiveShape(rewardArchive(reward), { maxAssetBytes: 1024 }).ok).toBe(true);
    expect(validateCampaignArchiveShape(rewardArchive({ ...reward, totalGp: -1 }), { maxAssetBytes: 1024 })).toEqual({
      ok: false,
      error: "Campaign archive combats record cmb_reward_archive: rewards entry 1 field totalGp must be a non-negative integer"
    });
  });
});
