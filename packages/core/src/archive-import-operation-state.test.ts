import { describe, expect, it } from "vitest";
import { makeArchive, normalizeEngineState, seedState } from "./state.js";

describe("campaign archive import operation state", () => {
  it("normalizes the operational ledger and never writes it into OTTX data", () => {
    expect(normalizeEngineState({}).campaignArchiveImportOperations).toEqual([]);
    const state = seedState();
    const at = "2026-07-15T12:00:00.000Z";
    state.campaignArchiveImportOperations.push({
      id: "arcimp_private",
      campaignIds: ["camp_demo"],
      createdByUserId: "usr_demo_gm",
      status: "applied",
      mode: "upsert",
      scope: "all",
      collections: ["actors"],
      campaignRevisions: { camp_demo: state.campaigns[0]!.updatedAt },
      recordSteps: [],
      assetSteps: [],
      createdAt: at,
      updatedAt: at,
    });

    expect(makeArchive(state, "camp_demo").data.campaignArchiveImportOperations).toEqual([]);
  });
});
