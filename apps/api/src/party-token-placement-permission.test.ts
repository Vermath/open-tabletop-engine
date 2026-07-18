import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

describe("party token placement permission boundary", () => {
  it("denies the helper's token-create shape without token.create and leaves the scene untouched", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((candidate) => candidate.id === "scn_vault_entry")!;
    const actor = store.state.actors.find((candidate) => candidate.campaignId === scene.campaignId)!;
    const beforeSceneRevision = scene.updatedAt;
    const beforeTokenIds = store.state.tokens.map((token) => token.id);
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${scene.id}/tokens`,
        headers: {
          "x-user-id": "usr_demo_player",
          "idempotency-key": `party-place:${scene.id}:${actor.id}:permission-test`,
        },
        payload: {
          actorId: actor.id,
          name: actor.name,
          disposition: "friendly",
          layer: "player",
          x: 350,
          y: 500,
          width: scene.gridSize,
          height: scene.gridSize,
          expectedUpdatedAt: beforeSceneRevision,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ message: "Missing permission: token.create" });
      expect(store.state.tokens.map((token) => token.id)).toEqual(beforeTokenIds);
      expect(scene.updatedAt).toBe(beforeSceneRevision);
    } finally {
      await app.close();
    }
  });
});
