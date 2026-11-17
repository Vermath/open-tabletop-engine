import { describe, expect, it } from "vitest";
import { computeFogRevealPolygon, computeLightVisionPolygons, computeTokenVisionPolygons, isPointVisibleInSceneVision, seedState } from "./index.js";
import type { Scene, Token } from "./types.js";

function fixture() {
  const state = seedState();
  const scene: Scene = { ...state.scenes[0]!, width: 600, height: 400, visibilityMode: "dynamic", walls: [], fog: [], lights: [] };
  const token: Token = { ...state.tokens[0]!, x: 75, y: 175, width: 50, height: 50, visionEnabled: true, visionRadius: 500, senses: [] };
  const visible = (x: number, y = 200) => isPointVisibleInSceneVision({ x, y }, {
    visibilityMode: scene.visibilityMode,
    fogActive: scene.fog.length > 0,
    polygons: [...computeTokenVisionPolygons(scene, token), ...scene.lights.flatMap((light) => computeLightVisionPolygons(scene, light)), ...scene.fog.flatMap((fog) => { const polygon = computeFogRevealPolygon(scene, fog); return polygon ? [polygon] : []; })]
  });
  return { scene, token, visible };
}

describe("dynamic scene visibility", () => {
  it("requires illumination and owned token sight even without authored fog", () => {
    const { scene, token, visible } = fixture();
    expect(visible(200)).toBe(false);
    scene.lights = [{ id: "lamp", x: 200, y: 200, radius: 90, color: "#ffffff" }];
    expect(visible(200)).toBe(true);
    expect(visible(200, 350)).toBe(false);
    token.visionEnabled = false;
    expect(visible(200)).toBe(false);
  });

  it("clips both sight and light at closed doors, and allows open doors and transparent windows", () => {
    const { scene, visible } = fixture();
    scene.lights = [{ id: "lamp", x: 400, y: 200, radius: 500, color: "#ffffff" }];
    scene.walls = [{ id: "portal", x1: 300, y1: 0, x2: 300, y2: 400, kind: "door", blocksVision: true, open: false }];
    expect(visible(400)).toBe(false); // A visible lamp cannot grant sight through a closed door.
    expect(visible(200)).toBe(false); // Light on the far side cannot pass through it either.
    scene.walls[0]!.open = true;
    expect(visible(400)).toBe(true);
    expect(visible(200)).toBe(true);
    Object.assign(scene.walls[0]!, { kind: "window", blocksVision: false, open: false });
    expect(visible(400)).toBe(true);
  });

  it("lets a shadowless light pass walls without granting sight through them", () => {
    const { scene, visible } = fixture();
    scene.walls = [{ id: "wall", x1: 300, y1: 0, x2: 300, y2: 400, kind: "wall", blocksVision: true }];
    scene.lights = [{ id: "lamp", x: 400, y: 200, radius: 500, color: "#ffffff" }];
    expect(visible(200)).toBe(false); // By default the wall shadows the near side.
    scene.lights = [{ id: "lamp", x: 400, y: 200, radius: 500, color: "#ffffff", shadows: false }];
    expect(visible(200)).toBe(true); // The light now reaches the token's side of the wall.
    expect(visible(400)).toBe(false); // The token still cannot see past the wall.
  });

  it("keeps each sense within range and preserves magical darkness exceptions", () => {
    const { scene, token, visible } = fixture();
    token.senses = [{ type: "darkvision", range: 150 }];
    expect(visible(200)).toBe(true);
    expect(visible(300)).toBe(false);
    scene.lights = [{ id: "darkness", x: 200, y: 200, radius: 40, color: "#000000", kind: "darkness", magical: true }];
    expect(visible(200)).toBe(false);
    token.senses = [{ type: "blindsight", range: 150 }];
    expect(visible(200)).toBe(true);
  });

  it("ignores reveal fog as a dynamic override while hide fog still conceals sensed areas", () => {
    const { scene, token, visible } = fixture();
    scene.fog = [{ id: "reveal", x: 200, y: 200, radius: 100, hidden: false, mode: "reveal" }];
    expect(visible(200)).toBe(false);
    token.senses = [{ type: "darkvision", range: 150 }];
    expect(visible(200)).toBe(true);
    scene.fog.push({ id: "hide", x: 200, y: 200, radius: 30, hidden: false, mode: "hide" });
    expect(visible(200)).toBe(false);
  });

  it.each([undefined, "fog"] as const)("preserves legacy authored fog when mode is %s", (mode) => {
    const { scene, token, visible } = fixture();
    scene.visibilityMode = mode;
    token.visionEnabled = false;
    expect(visible(500)).toBe(true);
    scene.fog = [{ id: "reveal", x: 200, y: 200, radius: 40, hidden: false, mode: "reveal" }];
    expect(visible(500)).toBe(false);
    expect(visible(200)).toBe(true);
  });
});
