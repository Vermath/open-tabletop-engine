import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Token, TokenMoveBatchEventPayload } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { realtimeSequenceDecision } from "./realtime-sequence.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("realtime fast path wiring", () => {
  it("wires realtime events through a ref-backed local apply handler", () => {
    expect(appSource).toContain("realtimeApplyRef");
    expect(appSource).toContain("applyRealtimeEvent: (data) => realtimeApplyRef.current(data)");
  });

  it("guards against applying redacted realtime payloads", () => {
    expect(appSource).toContain("payload.redacted !== true");
  });

  it("falls back to authoritative snapshots for cascade-sensitive deletions", () => {
    expect(appSource).toContain('if (event.type === "world.deleted") return "snapshot"');
    expect(appSource).toContain('if (event.type === "combat.ended") return "snapshot"');
  });

  it("applies a sequenced batch as one snapshot change and ignores older or duplicate envelopes", () => {
    const token = (id: string, x: number, updatedAt: string): Token => ({
      id,
      sceneId: "scene_one",
      name: id,
      x,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      hidden: false,
      locked: false,
      visionEnabled: false,
      visionRadius: 0,
      disposition: "friendly",
      metadata: {},
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt
    });
    const current = [token("token_a", 0, "2026-07-17T00:00:00.000Z"), token("token_b", 1, "2026-07-17T00:00:00.000Z")];
    const payload: TokenMoveBatchEventPayload = {
      sceneId: "scene_one",
      movedAt: "2026-07-17T00:00:01.000Z",
      tokens: [token("token_a", 5, "2026-07-17T00:00:01.000Z"), token("token_b", 6, "2026-07-17T00:00:01.000Z")]
    };
    const events = [
      { campaignId: "campaign_one", type: "token.moved.batch", sequence: 8, payload },
      { campaignId: "campaign_one", type: "token.moved.batch", sequence: 8, payload },
      { campaignId: "campaign_one", type: "token.moved.batch", sequence: 7, payload }
    ];
    let lastSequence = 7;
    let snapshot = current;
    const applySnapshot = vi.fn((tokens: Token[]) => tokens);

    for (const event of events) {
      const decision = realtimeSequenceDecision(event, lastSequence);
      if (decision.kind !== "contiguous") continue;
      lastSequence = decision.sequence;
      snapshot = applySnapshot(payload.tokens);
    }

    expect(applySnapshot).toHaveBeenCalledTimes(1);
    expect(applySnapshot).toHaveBeenCalledWith(payload.tokens);
    expect(snapshot.map(({ id, x }) => ({ id, x }))).toEqual([{ id: "token_a", x: 5 }, { id: "token_b", x: 6 }]);
    const batchBranch = appSource.match(/if \(event\.type === "token\.moved\.batch"\)[^\n]*/)?.[0] ?? "";
    expect(batchBranch.match(/applyTokensToSnapshot/g)).toHaveLength(1);
    expect(batchBranch).toContain("applyTokensToSnapshot(batch.tokens as unknown as Token[])");
  });
});
