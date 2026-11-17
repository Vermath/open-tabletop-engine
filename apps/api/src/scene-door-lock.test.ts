import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };
const sceneId = "scn_vault_entry";
const wallsUrl = "/api/v1/scenes/" + sceneId + "/walls";

describe("scene door locks", () => {
  it("closes a door when locked, enforces editor permission, and restores its lock from an archive", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const scene = () => store.state.scenes.find((candidate) => candidate.id === sceneId)!;
    let wallId = "";
    const patchDoor = (userId: string, payload: Record<string, boolean>) => app.inject({
      method: "PATCH", url: wallsUrl + "/" + wallId,
      headers: { "x-user-id": userId, "idempotency-key": crypto.randomUUID() },
      payload: { ...payload, expectedUpdatedAt: scene().updatedAt },
    });
    try {
      const invalid = await app.inject({ method: "POST", url: wallsUrl, headers: { ...headers, "idempotency-key": "locked-window" },
        payload: { x1: 200, y1: 220, x2: 280, y2: 220, kind: "window", locked: true, expectedUpdatedAt: scene().updatedAt },
      });
      expect(invalid.statusCode).toBe(400);
      const created = await app.inject({ method: "POST", url: wallsUrl, headers: { ...headers, "idempotency-key": "open-door" },
        payload: { x1: 200, y1: 220, x2: 280, y2: 220, kind: "door", open: true, expectedUpdatedAt: scene().updatedAt },
      });
      expect(created.statusCode, created.body).toBe(200);
      wallId = scene().walls.find((wall) => wall.kind === "door")!.id;
      expect((await patchDoor("usr_demo_player", { locked: true })).statusCode).toBe(403);
      expect((await patchDoor("usr_demo_gm", { locked: true })).statusCode).toBe(200);
      expect(scene().walls.find(({ id }) => id === wallId)).toMatchObject({ open: false, locked: true });
      expect((await patchDoor("usr_demo_gm", { open: true })).statusCode).toBe(400);

      const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers });
      expect(exported.statusCode, exported.body).toBe(200);
      const importedStore = new MemoryStateStore();
      const restored = await buildApp({ store: importedStore });
      try {
        const imported = await restored.inject({ method: "POST", url: "/api/v1/import/campaign", headers, payload: exported.json() });
        expect(imported.statusCode, imported.body).toBe(200);
        expect(importedStore.state.scenes.find(({ id }) => id === sceneId)?.walls.find(({ id }) => id === wallId)).toMatchObject({ open: false, locked: true });
      } finally {
        await restored.close();
      }
      expect((await patchDoor("usr_demo_gm", { locked: false, open: true })).statusCode).toBe(200);
      expect(scene().walls.find(({ id }) => id === wallId)).toMatchObject({ open: true, locked: false });
    } finally {
      await app.close();
    }
  });
});
