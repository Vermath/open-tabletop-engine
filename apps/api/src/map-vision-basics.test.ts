import type { Token, VisionSnapshot } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("map vision basics", () => {
  it("authors typed doors and windows with explicit scene permissions and open-state behavior", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const denied = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/walls",
        headers: playerHeaders,
        payload: { x1: 100, y1: 100, x2: 200, y2: 100, kind: "door" }
      });
      expect(denied.statusCode).toBe(403);

      const door = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/walls",
        headers: { ...gmHeaders, "idempotency-key": "vision-wall-create-door" },
        payload: {
          expectedUpdatedAt: store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt,
          x1: 200,
          y1: 300,
          x2: 450,
          y2: 300,
          kind: "door"
        }
      });
      expect(door.statusCode).toBe(200);
      expect(door.json().walls.at(-1)).toEqual(expect.objectContaining({ kind: "door", open: false, blocksVision: true, blocksMovement: true }));
      const doorId = door.json().walls.at(-1).id as string;

      const opened = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/scn_vault_entry/walls/${doorId}`,
        headers: { ...gmHeaders, "idempotency-key": "vision-wall-open-door" },
        payload: { open: true, expectedUpdatedAt: door.json().updatedAt }
      });
      expect(opened.statusCode).toBe(200);
      expect(opened.json().walls.find((wall: { id: string }) => wall.id === doorId)).toEqual(expect.objectContaining({ kind: "door", open: true }));

      const window = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/walls",
        headers: { ...gmHeaders, "idempotency-key": "vision-wall-create-window" },
        payload: { x1: 500, y1: 300, x2: 700, y2: 300, kind: "window", expectedUpdatedAt: opened.json().updatedAt }
      });
      expect(window.statusCode).toBe(200);
      expect(window.json().walls.at(-1)).toEqual(expect.objectContaining({ kind: "window", open: false, blocksVision: false, blocksMovement: true }));

      const invalidOpen = await app.inject({
        method: "PATCH",
        url: "/api/v1/scenes/scn_vault_entry/walls/wall_north",
        headers: { ...gmHeaders, "idempotency-key": "vision-wall-invalid-open" },
        payload: { open: true, expectedUpdatedAt: window.json().updatedAt }
      });
      expect(invalidOpen.statusCode).toBe(400);
      expect(invalidOpen.json()).toMatchObject({ message: "Only doors and windows can be opened" });
    } finally {
      await app.close();
    }
  });

  it("validates typed senses, applies magical darkness, and gates cross-user player vision previews", async () => {
    const store = new MemoryStateStore();
    const baseToken = store.state.tokens.find((token) => token.id === "tok_valen")!;
    const timestamp = "2026-07-13T00:00:00.000Z";
    store.state.tokens.push({
      ...baseToken,
      id: "tok_darkness_target",
      actorId: undefined,
      name: "Darkness Target",
      x: 410,
      y: 350,
      visionEnabled: false,
      visionRadius: 0,
      disposition: "hostile",
      ownerUserIds: [],
      createdAt: timestamp,
      updatedAt: timestamp
    } satisfies Token);
    const app = await buildApp({ store });
    try {
      const invalidSenses = await app.inject({
        method: "PATCH",
        url: "/api/v1/tokens/tok_valen",
        headers: { ...gmHeaders, "idempotency-key": "vision-token-invalid-senses" },
        payload: {
          expectedUpdatedAt: baseToken.updatedAt,
          senses: [{ type: "darkvision", range: 60 }, { type: "darkvision", range: 120 }]
        }
      });
      expect(invalidSenses.statusCode).toBe(400);

      const darkvision = await app.inject({
        method: "PATCH",
        url: "/api/v1/tokens/tok_valen",
        headers: { ...gmHeaders, "idempotency-key": "vision-token-darkvision" },
        payload: { expectedUpdatedAt: baseToken.updatedAt, senses: [{ type: "darkvision", range: 180 }] }
      });
      expect(darkvision.statusCode).toBe(200);
      expect(darkvision.json()).toMatchObject({ senses: [{ type: "darkvision", range: 180 }] });

      const darkness = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/lights",
        headers: { ...gmHeaders, "idempotency-key": "vision-light-magical-darkness" },
        payload: {
          expectedUpdatedAt: store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt,
          x: 430,
          y: 375,
          radius: 150,
          color: "#111827",
          intensity: 0.86,
          kind: "darkness",
          magical: true
        }
      });
      expect(darkness.statusCode).toBe(200);
      const darknessId = darkness.json().lights.at(-1).id as string;
      expect(darkness.json().lights.at(-1)).toEqual(expect.objectContaining({ kind: "darkness", magical: true }));

      const hiddenWithDarkvision = await app.inject({ method: "GET", url: "/api/v1/scenes/scn_vault_entry/tokens", headers: playerHeaders });
      expect(hiddenWithDarkvision.statusCode).toBe(200);
      expect(hiddenWithDarkvision.json().map((token: Token) => token.id)).not.toContain("tok_darkness_target");

      const blindsight = await app.inject({
        method: "PATCH",
        url: "/api/v1/tokens/tok_valen",
        headers: { ...gmHeaders, "idempotency-key": "vision-token-blindsight" },
        payload: { expectedUpdatedAt: darkvision.json().updatedAt, senses: [{ type: "blindsight", range: 180 }] }
      });
      expect(blindsight.statusCode).toBe(200);
      const visibleWithBlindsight = await app.inject({ method: "GET", url: "/api/v1/scenes/scn_vault_entry/tokens", headers: playerHeaders });
      expect(visibleWithBlindsight.json().map((token: Token) => token.id)).toContain("tok_darkness_target");

      const deniedPreview = await app.inject({
        method: "GET",
        url: "/api/v1/scenes/scn_vault_entry/vision?previewUserId=usr_demo_gm",
        headers: playerHeaders
      });
      expect(deniedPreview.statusCode).toBe(403);

      const invalidPreview = await app.inject({
        method: "GET",
        url: "/api/v1/scenes/scn_vault_entry/vision?previewUserId=usr_outsider",
        headers: gmHeaders
      });
      expect(invalidPreview.statusCode).toBe(400);

      const preview = await app.inject({
        method: "GET",
        url: "/api/v1/scenes/scn_vault_entry/vision?previewUserId=usr_demo_player",
        headers: gmHeaders
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json() as VisionSnapshot).toMatchObject({ sceneId: "scn_vault_entry", userId: "usr_demo_player", fogActive: true });
      expect((preview.json() as VisionSnapshot).polygons).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: "token", sourceId: "tok_valen", senseType: "blindsight", radius: 180 }),
        expect.objectContaining({ source: "light", sourceId: darknessId, lightingEffect: "darkness", magical: true })
      ]));
    } finally {
      await app.close();
    }
  });
});
