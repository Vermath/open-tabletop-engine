import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

describe("shared mutation concurrency guard", () => {
  it("rejects missing guards and returns a safe current revision on stale writes", async () => {
    const store = new MemoryStateStore();
    const world = store.state.scenes.find((candidate) => candidate.campaignId === "camp_demo")!;
    const app = await buildApp({ store });
    try {
      const missingKey = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${world.id}`,
        headers: { "x-user-id": "usr_demo_gm" },
        payload: { name: "Missing key", expectedUpdatedAt: world.updatedAt },
      });
      expect(missingKey.statusCode).toBe(400);

      const missingRevision = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${world.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "world-missing-revision" },
        payload: { name: "Missing revision" },
      });
      expect(missingRevision.statusCode).toBe(400);

      const invalidRevision = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${world.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "world-invalid-revision" },
        payload: { name: "Invalid revision", expectedUpdatedAt: "not-a-date" },
      });
      expect(invalidRevision.statusCode).toBe(400);
      expect(invalidRevision.json().message).toBe('body/expectedUpdatedAt must match format "date-time"');

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${world.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "world-stale-revision" },
        payload: { name: "Stale", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        code: "stale_write",
        resourceType: "scene",
        resourceId: world.id,
        currentUpdatedAt: world.updatedAt,
        current: { id: world.id, updatedAt: world.updatedAt },
      }));

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/scenes/${world.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "world-exact-revision" },
        payload: { name: "Revision guarded world", expectedUpdatedAt: world.updatedAt },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().name).toBe("Revision guarded world");
    } finally {
      await app.close();
    }
  });

  it("binds token creation to the exact parent scene revision", async () => {
    const store = new MemoryStateStore();
    const scene = store.state.scenes.find((candidate) => candidate.campaignId === "camp_demo")!;
    const app = await buildApp({ store });
    try {
      const missing = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${scene.id}/tokens`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "token-create-missing-scene-rev" },
        payload: { name: "No revision" },
      });
      expect(missing.statusCode).toBe(400);

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/scenes/${scene.id}/tokens`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "token-create-stale-scene-rev" },
        payload: { name: "Stale revision", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ resourceType: "scene", currentUpdatedAt: scene.updatedAt });
    } finally {
      await app.close();
    }
  });

  it("requires, advances, and replays the exact existing-campaign revision for archive imports", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const exported = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: { "x-user-id": "usr_demo_gm" },
      });
      expect(exported.statusCode).toBe(200);
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const archive = exported.json();

      const missing = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "archive-import-missing-revision" },
        payload: { archive, mode: "upsert" },
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().message).toContain("Campaign import expectedUpdatedAt must be a valid date-time");

      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "archive-import-stale-revision" },
        payload: { archive, mode: "upsert", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        code: "stale_write",
        resourceType: "campaign",
        resourceId: campaign.id,
        currentUpdatedAt: campaign.updatedAt,
      });

      const request = { archive, mode: "upsert", expectedUpdatedAt: campaign.updatedAt };
      const auditCount = store.state.auditLogs.filter((entry) => entry.action === "campaign.import").length;
      const imported = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "archive-import-exact-revision" },
        payload: request,
      });
      expect(imported.statusCode).toBe(200);
      expect(store.state.campaigns.find((candidate) => candidate.id === campaign.id)?.updatedAt).not.toBe(campaign.updatedAt);
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.import")).toHaveLength(auditCount + 1);

      const replay = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "archive-import-exact-revision" },
        payload: request,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.body).toBe(imported.body);
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.import")).toHaveLength(auditCount + 1);
    } finally {
      await app.close();
    }
  });
});
