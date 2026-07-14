import type { Scene, Token } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TacticalMapAids, coverLevelLabel, sceneCoverOverrideBetween, terrainRectanglePoints } from "./tactical-map-aids.js";

const timestamp = "2026-07-13T00:00:00.000Z";
const tokens = [
  { id: "tok_source", sceneId: "scn_test", name: "Archer" },
  { id: "tok_target", sceneId: "scn_test", name: "Guard" }
] as Token[];
const scene = {
  id: "scn_test",
  campaignId: "camp_test",
  name: "Test",
  width: 1000,
  height: 800,
  gridType: "square",
  gridSize: 50,
  active: true,
  sortOrder: 1,
  fog: [],
  walls: [],
  lights: [],
  annotations: [{ id: "ruler", sceneId: "scn_test", kind: "ruler", createdByUserId: "usr", color: "#fff", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], createdAt: timestamp, updatedAt: timestamp }],
  difficultTerrain: [{ id: "terrain", sceneId: "scn_test", label: "Rubble", color: "#d97706", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }], createdByUserId: "usr", createdAt: timestamp, updatedAt: timestamp }],
  coverOverrides: [{ id: "cover", sceneId: "scn_test", sourceTokenId: "tok_source", targetTokenId: "tok_target", level: "three_quarters", note: "Arrow slit", createdByUserId: "usr", createdAt: timestamp, updatedAt: timestamp }],
  metadata: {},
  createdAt: timestamp,
  updatedAt: timestamp
} as Scene;

describe("TacticalMapAids", () => {
  it("renders advisory measurement, authored terrain, and explicit cover controls", () => {
    const html = renderToStaticMarkup(<TacticalMapAids scene={scene} tokens={tokens} canManage={false} canMoveTokens={false} onSceneChange={vi.fn()} onTokenChange={vi.fn()} onStatus={vi.fn()} />);
    expect(html).toContain("Terrain &amp; cover");
    expect(html).toContain("commit the ruler endpoint as an explicit token move");
    expect(html).toContain("Walls and collisions remain board rulings");
    expect(html).toContain("Rubble");
    expect(html).toContain("Three-quarters cover");
    expect(html).toContain("no geometry is inferred");
    expect(html).toMatch(/Add rectangle<\/button>/);
    expect(html).toContain("disabled");
  });

  it("keeps rectangle math and source-target cover lookup pure", () => {
    expect(terrainRectanglePoints(10, 20, 30, 40)).toEqual([{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 }]);
    expect(terrainRectanglePoints(10, 20, 0, 40)).toBeUndefined();
    expect(sceneCoverOverrideBetween(scene, "tok_source", "tok_target")?.id).toBe("cover");
    expect(sceneCoverOverrideBetween(scene, "tok_target", "tok_source")).toBeUndefined();
    expect(coverLevelLabel("three_quarters")).toBe("Three-quarters cover");
  });
});
