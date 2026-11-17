import { describe, expect, it } from "vitest";
import { boundCampaignSnapshotHistory, DEFAULT_SNAPSHOT_HISTORY_LIMIT, MAX_SNAPSHOT_HISTORY_LIMIT, snapshotHistoryLimit } from "./snapshot-history.js";

describe("campaign snapshot history bounds", () => {
  it("defaults invalid limits and caps oversized requests", () => {
    expect(snapshotHistoryLimit(undefined)).toBe(DEFAULT_SNAPSHOT_HISTORY_LIMIT);
    expect(snapshotHistoryLimit("not-a-number")).toBe(DEFAULT_SNAPSHOT_HISTORY_LIMIT);
    expect(snapshotHistoryLimit(0)).toBe(DEFAULT_SNAPSHOT_HISTORY_LIMIT);
    expect(snapshotHistoryLimit(String(MAX_SNAPSHOT_HISTORY_LIMIT + 100))).toBe(MAX_SNAPSHOT_HISTORY_LIMIT);
    expect(snapshotHistoryLimit("12")).toBe(12);
  });

  it("keeps the newest history records while preserving source order", () => {
    const snapshot = {
      chat: [
        { id: "old", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "newest", createdAt: "2026-01-03T00:00:00.000Z" },
        { id: "middle", createdAt: "2026-01-02T00:00:00.000Z" }
      ],
      rolls: [],
      bundled: { aiThreads: [{ id: "one", createdAt: "2026-01-01T00:00:00.000Z" }, { id: "two", createdAt: "2026-01-02T00:00:00.000Z" }] }
    };

    const bounded = boundCampaignSnapshotHistory(snapshot, 2);

    expect(bounded.chat.map((record) => record.id)).toEqual(["newest", "middle"]);
    expect(bounded.bundled.aiThreads.map((record) => record.id)).toEqual(["one", "two"]);
    expect(bounded.history).toEqual({
      limit: 2,
      collections: {
        chat: { total: 3, returned: 2, truncated: true },
        rolls: { total: 0, returned: 0, truncated: false },
        "bundled.aiThreads": { total: 2, returned: 2, truncated: false }
      }
    });
  });

  it("prioritizes actionable state ahead of newer completed history", () => {
    const snapshot = {
      campaignSessions: [
        { id: "live-old", status: "live", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "completed-new", status: "completed", createdAt: "2026-01-03T00:00:00.000Z" },
        { id: "completed-middle", status: "completed", createdAt: "2026-01-02T00:00:00.000Z" }
      ],
      combats: [
        { id: "active-old", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "ended-new", active: false, createdAt: "2026-01-03T00:00:00.000Z" },
        { id: "ended-middle", active: false, createdAt: "2026-01-02T00:00:00.000Z" }
      ],
      bundled: {
        aiThreads: [
          { id: "running-old", status: "running", createdAt: "2026-01-01T00:00:00.000Z" },
          { id: "complete-new", status: "completed", createdAt: "2026-01-03T00:00:00.000Z" },
          { id: "complete-middle", status: "completed", createdAt: "2026-01-02T00:00:00.000Z" }
        ]
      }
    };

    const bounded = boundCampaignSnapshotHistory(snapshot, 2);

    expect(bounded.campaignSessions.map((record) => record.id)).toEqual(["live-old", "completed-new"]);
    expect(bounded.combats.map((record) => record.id)).toEqual(["active-old", "ended-new"]);
    expect(bounded.bundled.aiThreads.map((record) => record.id)).toEqual(["running-old", "complete-new"]);
  });
});
