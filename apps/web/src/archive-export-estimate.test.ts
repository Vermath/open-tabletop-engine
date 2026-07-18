import { describe, expect, it } from "vitest";
import { archiveExportMinimumRecordCount, type ArchiveExportEstimateInput } from "./archive-export-estimate.js";

function estimateInput(overrides: Partial<ArchiveExportEstimateInput> = {}): ArchiveExportEstimateInput {
  return {
    campaignId: "camp-one",
    scope: "campaign",
    worldId: "",
    collections: ["actors"],
    worlds: [{ id: "world-one", campaignId: "camp-one", name: "One", description: "", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
    handouts: [{ id: "handout-one", campaignId: "camp-one", title: "One", body: "", visibility: "public", visibleToUserIds: [], visibleToActorIds: [], assetIds: [], tags: [], readByUserIds: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
    snapshot: {
      campaigns: [{ id: "camp-one" }],
      members: [{ id: "member-one", campaignId: "camp-one" }],
      history: { limit: 1, collections: { chat: { total: 5, returned: 1, truncated: true }, "bundled.aiThreads": { total: 3, returned: 1, truncated: true } } },
      worldRecords: [{ id: "record-one" }],
      worldRelations: [],
      scenes: [{ id: "scene-one" }, { id: "scene-two" }, { id: "scene-three" }],
      fogPresets: [],
      assets: [],
      tokens: [],
      actors: [{ id: "actor-one" }, { id: "actor-two" }],
      calculationOverrides: [],
      items: [],
      journals: [],
      chat: [{ id: "chat-one" }],
      rolls: [],
      diceMacros: [],
      audioTracks: [{ id: "audio-one" }],
      encounters: [],
      campaignSessions: [],
      combats: [],
      combatAudit: [],
      proposals: [],
      contentImports: [],
      memory: [],
      aiThreads: [{ id: "thread-one" }],
      aiToolCalls: []
    } as unknown as ArchiveExportEstimateInput["snapshot"],
    ...overrides
  };
}

describe("archive export record minimum", () => {
  it("counts every known campaign collection and bounded-history totals", () => {
    expect(archiveExportMinimumRecordCount(estimateInput())).toBe(19);
  });

  it("uses only the selected collection totals instead of the full campaign count", () => {
    expect(archiveExportMinimumRecordCount(estimateInput({ scope: "selected_collections", collections: ["actors"] }))).toBe(4);
    expect(archiveExportMinimumRecordCount(estimateInput({ scope: "selected_collections", collections: ["actors", "scenes"] }))).toBe(7);
    expect(archiveExportMinimumRecordCount(estimateInput({ scope: "selected_collections", collections: ["chat"] }))).toBe(7);
  });
});
