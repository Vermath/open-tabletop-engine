import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

describe("token rotation and elevation", () => {
  it("normalizes rotation and preserves elevation through create and update", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const sceneRevision = store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt;
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: { ...gmHeaders, "idempotency-key": "token-transform-create" },
        payload: { name: "Flying Scout", rotation: 450, elevation: 15, expectedUpdatedAt: sceneRevision }
      });

      expect(created.statusCode).toBe(200);
      expect(created.json()).toEqual(expect.objectContaining({ rotation: 90, elevation: 15 }));

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/tokens/${created.json().id}`,
        headers: { ...gmHeaders, "idempotency-key": "token-transform-update" },
        payload: { rotation: -30, elevation: -20, expectedUpdatedAt: created.json().updatedAt }
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toEqual(expect.objectContaining({ rotation: 330, elevation: -20 }));
    } finally {
      await app.close();
    }
  });

  it("rejects non-numeric rotation and elevation outside the supported range", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const sceneRevision = store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt;
      const invalidRotation = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: { ...gmHeaders, "idempotency-key": "token-transform-invalid-rotation" },
        payload: { name: "Invalid Rotation", rotation: "north", expectedUpdatedAt: sceneRevision }
      });
      expect(invalidRotation.statusCode).toBe(400);
      expect(invalidRotation.json().message).toContain("rotation");

      const invalidElevation = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: { ...gmHeaders, "idempotency-key": "token-transform-invalid-elevation" },
        payload: { name: "Invalid Elevation", elevation: 1_000_001, expectedUpdatedAt: sceneRevision }
      });
      expect(invalidElevation.statusCode).toBe(400);
      expect(invalidElevation.json().message).toContain("elevation");
    } finally {
      await app.close();
    }
  });
});
