import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upsertNewestRealtimeRecord } from "./realtime-snapshot-delta.js";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("combat-critical revision wiring", () => {
  it("sends reviewed actor and combat revisions on critical mutations", () => {
    expect(appSource).toContain("expectedUpdatedAt: actor.updatedAt");
    expect(appSource).toContain("{ ...patch, expectedUpdatedAt: latest.updatedAt }");
    expect(appSource).toContain("{ ...patch, syncActorSheet, expectedUpdatedAt: latest.updatedAt");
    expect(appSource).toContain("expectedActorUpdatedAt: actor.updatedAt");
    expect(appSource).toContain("expectedUpdatedAt: combat.updatedAt,");
  });

  it("loads the authoritative conflict resource and surfaces a retry message", () => {
    expect(appSource).toContain('body.code !== "stale_write"');
    expect(appSource).toContain("Latest state loaded; review and retry.");
    expect(appSource).toContain("reconcileStaleWriteConflict(error)");
  });

  it("keeps the newest authoritative combat revision when HTTP and realtime results reorder", () => {
    const current = { id: "combat-1", updatedAt: "2026-07-17T12:00:02.000Z", round: 2 };
    const stale = { id: "combat-1", updatedAt: "2026-07-17T12:00:01.000Z", round: 1 };
    const authoritative = { id: "combat-1", updatedAt: "2026-07-17T12:00:03.000Z", round: 3 };

    expect(upsertNewestRealtimeRecord([current], stale)).toEqual([current]);
    expect(upsertNewestRealtimeRecord([current], authoritative)).toEqual([authoritative]);
  });
});
