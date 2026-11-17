import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

describe("scene light animation", () => {
  it("persists a valid visual effect and includes it in campaign archives", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const path = "/api/v1/scenes/scn_vault_entry/lights/light_brazier";
      const edit = (animation: string) => app.inject({
        method: "PATCH", url: path,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "animated-light:" + animation },
        payload: { animation, expectedUpdatedAt: store.state.scenes.find((scene) => scene.id === "scn_vault_entry")?.updatedAt },
      });
      expect((await edit("spin")).statusCode).toBe(400);
      const valid = await edit("flicker");
      expect(valid.statusCode).toBe(200);
      expect(valid.json().lights[0]).toMatchObject({ animation: "flicker", radius: 180 });
      const headers = { "x-user-id": "usr_demo_gm" };
      const archive = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers });
      expect(archive.statusCode).toBe(200);
      const restoredStore = new MemoryStateStore();
      const restored = await buildApp({ store: restoredStore });
      try {
        const imported = await restored.inject({ method: "POST", url: "/api/v1/import/campaign", headers, payload: archive.json() });
        expect(imported.statusCode, imported.body).toBe(200);
        expect(restoredStore.state.scenes.find((scene) => scene.id === "scn_vault_entry")?.lights[0]).toMatchObject({ animation: "flicker", radius: 180 });
      } finally {
        await restored.close();
      }
    } finally {
      await app.close();
    }
  });
});
