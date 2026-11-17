import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { OperationsObservability } from "./operations-observability.js";
import { SqliteStateStore } from "./sqlite-store.js";

describe("operations observability API", () => {
  it("reports a stale conflict, durable writes, and recovery without exposing private dimensions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-operations-metrics-"));
    const store = new SqliteStateStore(join(directory, "state.sqlite"));
    store.state.users.find((user) => user.id === "usr_demo_gm")!.serverAdmin = true;
    store.save();
    store.flush();
    const operationsObservability = new OperationsObservability();
    const app = await buildApp({ store, operationsObservability });
    try {
      const denied = await app.inject({ method: "GET", url: "/api/v1/admin/operations/metrics", headers: { "x-user-id": "usr_demo_player" } });
      expect(denied.statusCode).toBe(403);

      const journal = store.state.journals.find((entry) => entry.id === "jnl_hook")!;
      const observedRevision = journal.updatedAt;
      const first = await app.inject({
        method: "PATCH",
        url: "/api/v1/journal/jnl_hook",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "operations-first-write" },
        payload: { expectedUpdatedAt: observedRevision, title: "Operations metric write" },
      });
      expect(first.statusCode).toBe(200);
      const stale = await app.inject({
        method: "PATCH",
        url: "/api/v1/journal/jnl_hook",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "operations-stale-write" },
        payload: { expectedUpdatedAt: observedRevision, title: "Private stale value" },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write" });

      const backup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/backup",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "operations-backup" },
        payload: { reason: "operations-metric-test" },
      });
      expect(backup.statusCode).toBe(200);

      const createBackup = vi.spyOn(store, "createBackup").mockImplementationOnce(() => {
        throw new Error("simulated backup provider failure");
      });
      const failedBackup = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/backup",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "operations-failed-backup" },
        payload: { reason: "operations-failure-metric-test" },
      });
      createBackup.mockRestore();
      expect(failedBackup.statusCode).toBe(500);

      const response = await app.inject({ method: "GET", url: "/api/v1/admin/operations/metrics", headers: { "x-user-id": "usr_demo_gm" } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        enabled: true,
        http: { staleWriteConflicts: 1, errorResponses: 1 },
        persistence: { attempts: expect.any(Number), succeeded: expect.any(Number), failed: 0 },
        recovery: { backup: { attempts: 2, succeeded: 1, failed: 1 } },
        privacy: { boundedDimensions: true, containsCampaignIds: false, containsUserIds: false, containsCredentials: false, containsPrivateContent: false },
      });
      expect(response.json().persistence.succeeded).toBeGreaterThan(0);
      expect(JSON.stringify(response.json())).not.toContain("Private stale value");
      expect(JSON.stringify(response.json())).not.toContain("usr_demo_gm");
    } finally {
      await app.close();
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
