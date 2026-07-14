import type { CampaignPresence, RealtimePresenceEnvelope } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyPresenceEnvelope, realtimeSequenceDecision } from "./realtime-sequence.js";

const presence = (userId: string, displayName = userId): CampaignPresence => ({
  campaignId: "campaign-one",
  userId,
  displayName,
  role: "player",
  connectionCount: 1,
  connectedAt: "2026-07-13T00:00:00.000Z",
  lastSeenAt: "2026-07-13T00:00:01.000Z",
  activeSceneIds: ["scene-one"],
});

describe("realtimeSequenceDecision", () => {
  it("accepts only the next authoritative event and detects duplicates and gaps", () => {
    expect(realtimeSequenceDecision(JSON.stringify({ type: "scene.updated", sequence: 8 }), 7)).toMatchObject({ kind: "contiguous", sequence: 8 });
    expect(realtimeSequenceDecision({ type: "scene.updated", sequence: 7 }, 7)).toMatchObject({ kind: "duplicate", sequence: 7 });
    expect(realtimeSequenceDecision({ type: "scene.updated", sequence: 10 }, 7)).toEqual({
      kind: "gap",
      event: { type: "scene.updated", sequence: 10 },
      expectedSequence: 8,
      sequence: 10,
    });
  });

  it("keeps unsequenced channels compatible without assigning a fake cursor", () => {
    expect(realtimeSequenceDecision({ type: "ai.message.delta", payload: {} }, 7)).toMatchObject({ kind: "legacy" });
    expect(realtimeSequenceDecision("not-json", 7)).toEqual({ kind: "legacy", event: "not-json" });
  });

  it("routes presence outside the persisted event sequence", () => {
    const envelope = { channel: "presence", type: "presence.updated", campaignId: "campaign-one", timestamp: "2026-07-13T00:00:01.000Z", presence: presence("user-one") } satisfies RealtimePresenceEnvelope;
    expect(realtimeSequenceDecision(JSON.stringify(envelope), 7)).toEqual({ kind: "presence", envelope });
  });
});

describe("applyPresenceEnvelope", () => {
  it("replaces from snapshots, upserts updates, and removes departures", () => {
    const snapshot = { channel: "presence", type: "presence.snapshot", campaignId: "campaign-one", timestamp: "2026-07-13T00:00:00.000Z", presences: [presence("user-two", "Zara"), presence("user-one", "Ari")] } satisfies RealtimePresenceEnvelope;
    expect(applyPresenceEnvelope([], snapshot).map((item) => item.userId)).toEqual(["user-one", "user-two"]);

    const updated = { channel: "presence", type: "presence.updated", campaignId: "campaign-one", timestamp: "2026-07-13T00:00:02.000Z", presence: { ...presence("user-two", "Bea"), connectionCount: 2 } } satisfies RealtimePresenceEnvelope;
    const current = applyPresenceEnvelope(snapshot.presences, updated);
    expect(current.find((item) => item.userId === "user-two")?.connectionCount).toBe(2);

    const left = { ...updated, type: "presence.left" } satisfies RealtimePresenceEnvelope;
    expect(applyPresenceEnvelope(current, left).map((item) => item.userId)).toEqual(["user-one"]);
  });
});
