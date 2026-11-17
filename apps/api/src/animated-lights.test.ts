import { makeArchive } from "@open-tabletop/core";
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
      expect(JSON.stringify(makeArchive(store.state, "camp_demo"))).toContain('"animation":"flicker"');
    } finally {
      await app.close();
    }
  });
});
