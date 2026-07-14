import { describe, expect, it } from "vitest";
import { normalizeEngineState, seedState } from "./state.js";
import type { CalculationOverride, WorldRecord, WorldRelation } from "./types.js";

const now = "2026-07-13T12:00:00.000Z";

function worldRecord(overrides: Partial<WorldRecord> & Pick<WorldRecord, "id" | "campaignId">): WorldRecord {
  return {
    kind: "npc",
    name: "Known NPC",
    summary: "",
    description: "",
    lifecycle: "active",
    visibility: "public",
    tags: [],
    metadata: {},
    createdByUserId: "usr_demo_gm",
    updatedByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function worldRelation(overrides: Partial<WorldRelation> & Pick<WorldRelation, "id" | "campaignId" | "sourceRecordId" | "targetRecordId">): WorldRelation {
  return {
    type: "related_to",
    visibility: "public",
    createdByUserId: "usr_demo_gm",
    updatedByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function calculationOverride(overrides: Partial<CalculationOverride> & Pick<CalculationOverride, "id" | "campaignId" | "actorId">): CalculationOverride {
  return {
    fieldId: "armor-class",
    source: "gm_manual",
    baseValue: 15,
    effectiveValue: 16,
    reason: "A documented table ruling",
    createdByUserId: "usr_demo_gm",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("world graph and calculation override persistence normalization", () => {
  it("drops cross-campaign and dangling graph edges and normalizes invalid visibility/world references", () => {
    const state = seedState();
    const campaign = state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    state.campaigns.push({ ...campaign, id: "camp_other", name: "Other campaign" });
    state.worlds.push({ id: "world_known", campaignId: campaign.id, name: "Known world", description: "", createdAt: now, updatedAt: now });
    state.worldRecords.push(
      worldRecord({ id: "wrec_public_one", campaignId: campaign.id, worldId: "world_known" }),
      worldRecord({ id: "wrec_public_two", campaignId: campaign.id, worldId: "world_missing", visibility: "invalid" as WorldRecord["visibility"] }),
    );
    state.worldRelations.push(
      worldRelation({ id: "wrel_valid", campaignId: campaign.id, sourceRecordId: "wrec_public_one", targetRecordId: "wrec_public_two", worldId: "world_missing", visibility: "invalid" as WorldRelation["visibility"] }),
      worldRelation({ id: "wrel_cross_campaign", campaignId: "camp_other", sourceRecordId: "wrec_public_one", targetRecordId: "wrec_public_two" }),
      worldRelation({ id: "wrel_dangling", campaignId: campaign.id, sourceRecordId: "wrec_public_one", targetRecordId: "wrec_missing" }),
    );

    const normalized = normalizeEngineState(state);

    expect(normalized.worldRecords.find((record) => record.id === "wrec_public_two")).toEqual(expect.objectContaining({
      visibility: "gm_only",
      worldId: undefined,
    }));
    expect(normalized.worldRelations.map((relation) => relation.id)).toContain("wrel_valid");
    expect(normalized.worldRelations.map((relation) => relation.id)).not.toContain("wrel_cross_campaign");
    expect(normalized.worldRelations.map((relation) => relation.id)).not.toContain("wrel_dangling");
    expect(normalized.worldRelations.find((relation) => relation.id === "wrel_valid")).toEqual(expect.objectContaining({
      visibility: "gm_only",
      worldId: undefined,
    }));
  });

  it("retains only finite, attributed overrides whose actor belongs to the same campaign", () => {
    const state = seedState();
    state.calculationOverrides.push(
      calculationOverride({ id: "calc_valid", campaignId: "camp_demo", actorId: "act_valen" }),
      calculationOverride({ id: "calc_wrong_campaign", campaignId: "camp_missing", actorId: "act_valen" }),
      calculationOverride({ id: "calc_missing_actor", campaignId: "camp_demo", actorId: "act_missing" }),
      calculationOverride({ id: "calc_non_finite", campaignId: "camp_demo", actorId: "act_valen", effectiveValue: Number.POSITIVE_INFINITY }),
      calculationOverride({ id: "calc_bad_source", campaignId: "camp_demo", actorId: "act_valen", source: "forged" as CalculationOverride["source"] }),
      calculationOverride({ id: "calc_incomplete_clear", campaignId: "camp_demo", actorId: "act_valen", clearedAt: now }),
    );

    const normalized = normalizeEngineState(state);

    expect(normalized.calculationOverrides.map((override) => override.id)).toEqual(["calc_valid"]);
  });
});
