import type { Token } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";

const visibilityComputationCounts = vi.hoisted(() => ({
  fog: 0,
  tokenVision: 0
}));

vi.mock("@open-tabletop/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-tabletop/core")>();
  return {
    ...actual,
    computeFogRevealPolygon: (...args: Parameters<typeof actual.computeFogRevealPolygon>) => {
      visibilityComputationCounts.fog += 1;
      return actual.computeFogRevealPolygon(...args);
    },
    computeTokenVisionPolygons: (...args: Parameters<typeof actual.computeTokenVisionPolygons>) => {
      visibilityComputationCounts.tokenVision += 1;
      return actual.computeTokenVisionPolygons(...args);
    }
  };
});

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const playerHeaders = { "x-user-id": "usr_demo_player" };
const timestamp = "2026-05-01T00:00:00.000Z";

function probeToken(id: string, x: number, y: number): Token {
  return {
    id,
    sceneId: "scn_vault_entry",
    name: id,
    x,
    y,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player",
    hidden: false,
    locked: false,
    visionEnabled: false,
    visionRadius: 0,
    disposition: "hostile",
    notes: "",
    conditions: [],
    auras: [],
    targetedByUserIds: [],
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("token visibility caching", () => {
  it("reuses scene fog and owned vision computations across repeated token checks in one list request", async () => {
    visibilityComputationCounts.fog = 0;
    visibilityComputationCounts.tokenVision = 0;
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    scene.fog = [{ id: "fog_cache_probe", x: 540, y: 360, radius: 80, hidden: false }];
    scene.walls = [];
    store.state.tokens.push(
      probeToken("tok_cache_probe_1", 900, 100),
      probeToken("tok_cache_probe_2", 960, 160),
      probeToken("tok_cache_probe_3", 1020, 220),
      probeToken("tok_cache_probe_4", 1080, 280)
    );
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: playerHeaders
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().map((token: { id: string }) => token.id)).toEqual(["tok_valen"]);
      expect(visibilityComputationCounts.fog).toBe(1);
      expect(visibilityComputationCounts.tokenVision).toBe(1);

      scene.updatedAt = "2026-05-01T00:00:01.000Z";
      const afterSceneChange = await app.inject({
        method: "GET",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: playerHeaders
      });

      expect(afterSceneChange.statusCode).toBe(200);
      expect(visibilityComputationCounts.fog).toBe(2);
      expect(visibilityComputationCounts.tokenVision).toBe(2);
    } finally {
      await app.close();
    }
  });
});
