import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";
import * as budget from "./scene-vision-budget.js";

describe("scene vision work budget", () => {
  it("reserves rays for dense walls and combines light, bright, dim and typed token polygons", () => {
    const store = new MemoryStateStore();
    const token = { ...store.state.tokens[0]!, visionEnabled: true, visionRadius: 80, brightVisionRadius: 20, senses: [{ type: "darkvision" as const, range: 120 }] };
    expect(budget.tokenVisionPolygonCount(token)).toBe(3);
    expect(budget.tokenVisionPolygonCount({ ...token, visionEnabled: false })).toBe(0);
    const x = token.x + token.width / 2;
    const y = token.y + token.height / 2;
    const wall = { ...store.state.scenes[0]!.walls[0]!, x1: x, x2: x + 20, y1: y, y2: y };
    const walls = Array(200).fill(wall);
    const lights = Array(3).fill({ x, y, radius: 50 });
    expect(budget.exceedsSceneVisionBudget(walls, lights, [token], "other")).toBe(false);
    expect(budget.exceedsSceneVisionBudget(walls, lights, [token], token.sceneId)).toBe(true);
    expect(budget.exceedsSceneVisionBudget(walls.slice(0, 10), lights, [token], token.sceneId)).toBe(false);
  });

  it("accepts the default 4096 by 3072 board performance fixture with 300 spread-out walls, 12 lights and 50 tokens", () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes[0]!;
    const walls = Array.from({ length: 300 }, (_, index) => {
      const x = 120 + (index % 18) * (4096 - 240) / 18;
      const y = 120 + Math.floor(index / 18) * (3072 - 240) / 18;
      return { ...scene.walls[0]!, x1: x, y1: y, x2: x + (index % 2 === 0 ? 150 : 0), y2: y + (index % 2 === 0 ? 0 : 150) };
    });
    const lights = Array.from({ length: 12 }, (_, index) => ({ ...scene.lights[0]!, radius: 420, x: 300 + (index % 4) * 1024, y: 300 + Math.floor(index / 4) * 1024 }));
    const tokens = Array.from({ length: 50 }, (_, index) => ({ ...store.state.tokens[0]!, visionEnabled: true, visionRadius: 160, width: 64, height: 64, x: 500 + (index % 10) * 300, y: 500 + Math.floor(index / 10) * 400 }));
    expect(budget.exceedsSceneVisionBudget([...scene.walls, ...walls], [...scene.lights, ...lights], [...store.state.tokens, ...tokens], scene.id)).toBe(false);
  });

  it("handles a rejected budget before vision, point sampling, diagnostics and geometry writes", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scene = store.state.scenes[0]!;
    const original = structuredClone(scene);
    const base = `/api/v1/scenes/${scene.id}`;
    const guard = vi.spyOn(budget, "exceedsSceneVisionBudget").mockReturnValue(true);
    const headers = { "x-user-id": "usr_demo_gm" };
    try {
      for (const path of ["/vision", "/vision?includeTokens=true", "/vision/sample?x=20&y=20"]) {
        const response = await app.inject({ method: "GET", url: base + path, headers });
        expect(response.statusCode).toBe(422);
        expect(response.json().error).toBe("scene_vision_budget_exceeded");
      }
      const diagnostics = await app.inject({ method: "GET", url: base + "/rendering/diagnostics", headers });
      expect(diagnostics.json().issues).toEqual([expect.objectContaining({ code: "scene_vision_budget_exceeded" })]);
      for (const [index, fields] of [{ walls: [] }, { lights: [] }].entries()) {
        const response = await app.inject({ method: "PATCH", url: base, headers: { ...headers, "idempotency-key": `geometry-replacement-${index}` }, payload: { ...fields, expectedUpdatedAt: scene.updatedAt } });
        expect(response.statusCode).toBe(422);
        expect(guard).toHaveBeenLastCalledWith(fields.walls ?? scene.walls, fields.lights ?? scene.lights, store.state.tokens, scene.id);
      }
      expect(scene).toEqual(original);
    } finally {
      guard.mockRestore();
      await app.close();
    }
  }, 15_000);
});
