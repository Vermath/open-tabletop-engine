import type { Scene, Token, VisionSnapshot } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const player = { "x-user-id": "usr_demo_player" };
const sceneId = "scn_vault_entry";

function fixture() {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((entry) => entry.id === sceneId)!;
  Object.assign(scene, { width: 600, height: 400, visibilityMode: "dynamic", fog: [], walls: [{ id: "door", x1: 300, y1: 0, x2: 300, y2: 400, kind: "door", open: false, blocksVision: true, blocksMovement: true }], lights: [{ id: "near-lamp", x: 200, y: 200, radius: 70, color: "#ffffff" }, { id: "far-lamp", x: 400, y: 200, radius: 70, color: "#ffffff" }] } satisfies Partial<Scene>);
  const owned: Token = { ...store.state.tokens.find((entry) => entry.id === "tok_valen")!, actorId: undefined, x: 75, y: 175, width: 50, height: 50, visionEnabled: true, visionRadius: 500, senses: [], ownerUserIds: ["usr_demo_player"] };
  store.state.tokens = [owned, ...[
    { id: "lit", x: 175, y: 175 }, { id: "blocked", x: 375, y: 175 }, { id: "unlit", x: 175, y: 325 }
  ].map((entry): Token => ({ ...owned, ...entry, name: entry.id, ownerUserIds: [], visionEnabled: false }))];
  return { store, scene, owned };
}

describe("dynamic player visibility boundary", () => {
  it("filters token APIs, snapshots and GM player preview by light and live door state", async () => {
    const { store, scene } = fixture();
    const app = await buildApp({ store });
    try {
      const readTokens = async (headers = player) => (await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/tokens`, headers })).json<Token[]>();
      expect((await readTokens()).map((token) => token.id)).toEqual(["tok_valen", "lit"]);
      expect((await readTokens(gm)).map((token) => token.id)).toEqual(["tok_valen", "lit", "blocked", "unlit"]);
      const snapshot = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/snapshot?sceneId=${sceneId}`, headers: player });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().tokens.map((token: Token) => token.id)).toEqual(["tok_valen", "lit"]);
      const vision = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/vision`, headers: player });
      expect(vision.json<VisionSnapshot>()).toMatchObject({ fogActive: true, userId: "usr_demo_player" });
      const preview = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/vision?previewUserId=usr_demo_player`, headers: gm });
      expect(preview.json()).toEqual(vision.json());
      const gmVision = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/vision`, headers: gm });
      expect(gmVision.json()).toMatchObject({ fogActive: false });
      const sample = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/vision/sample?x=400&y=200`, headers: player });
      expect(sample.statusCode).toBe(200);
      expect(sample.json()).toMatchObject({ visible: false });
      const opened = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${sceneId}/walls/door`, headers: gm, payload: { open: true, expectedUpdatedAt: scene.updatedAt } });
      expect(opened.statusCode).toBe(200);
      expect((await readTokens()).map((token) => token.id)).toEqual(["tok_valen", "lit", "blocked"]);
      const current = store.state.scenes.find((entry) => entry.id === sceneId)!;
      const transparent = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${sceneId}/walls/door`, headers: gm, payload: { kind: "window", blocksVision: false, open: false, expectedUpdatedAt: current.updatedAt } });
      expect(transparent.statusCode).toBe(200);
      expect((await readTokens()).map((token) => token.id)).toContain("blocked");
    } finally { await app.close(); }
  });

  it("does not grant another scene's, hidden, or unowned token sight", async () => {
    const { store, owned } = fixture();
    owned.visionEnabled = false;
    store.state.tokens.push({ ...owned, id: "other-scene-eyes", sceneId: "scn_other", visionEnabled: true, senses: [{ type: "darkvision", range: 500 }] });
    store.state.tokens.push({ ...owned, id: "hidden-eyes", hidden: true, visionEnabled: true, senses: [{ type: "darkvision", range: 500 }] });
    store.state.tokens.push({ ...owned, id: "unowned-eyes", ownerUserIds: [], visionEnabled: true, senses: [{ type: "darkvision", range: 500 }] });
    const app = await buildApp({ store });
    try {
      const response = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/tokens`, headers: player });
      expect(response.json<Token[]>().map((token) => token.id)).toEqual(["tok_valen"]);
    } finally { await app.close(); }
  });

  it("validates the field, enforces mutation permissions, and restores the exact mode on undo", async () => {
    const { store } = fixture();
    const app = await buildApp({ store });
    try {
      expect((await app.inject({ method: "PATCH", url: `/api/v1/scenes/${sceneId}`, headers: player, payload: { visibilityMode: "fog" } })).statusCode).toBe(403);
      expect((await app.inject({ method: "PATCH", url: `/api/v1/scenes/${sceneId}`, headers: gm, payload: { visibilityMode: "off" } })).statusCode).toBe(400);
      const changed = await app.inject({ method: "PATCH", url: `/api/v1/scenes/${sceneId}`, headers: gm, payload: { visibilityMode: "fog" } });
      expect(changed.statusCode).toBe(200);
      expect(changed.json()).toMatchObject({ visibilityMode: "fog" });
      const legacy = await app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/tokens`, headers: player });
      expect(legacy.json<Token[]>().map((token) => token.id)).toContain("unlit");
      const undone = await app.inject({ method: "POST", url: `/api/v1/scenes/${sceneId}/undo`, headers: gm });
      expect(undone.statusCode).toBe(200);
      expect(undone.json()).toMatchObject({ visibilityMode: "dynamic" });
      const created = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/scenes", headers: gm, payload: { name: "Dynamic room", visibilityMode: "dynamic" } });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toMatchObject({ visibilityMode: "dynamic" });
    } finally { await app.close(); }
  });
});
