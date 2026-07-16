import { emptyState } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const old = "2024-01-01T00:00:00.000Z";

describe("admin operational retention API", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it("is server-admin-only and requires exact preview evidence before an audited bounded prune", async () => {
    const store = new MemoryStateStore(emptyState());
    store.state.users.push(
      { id: "admin", displayName: "Admin", serverAdmin: true, createdAt: old, updatedAt: old },
      { id: "player", displayName: "Player", createdAt: old, updatedAt: old },
    );
    store.state.emailOutbox.push(
      { id: "old_delivery", to: "redacted@example.test", subject: "done", text: "done", status: "delivered", provider: "outbox", sentAt: old, createdAt: old, updatedAt: old },
      { id: "failed_delivery", to: "redacted@example.test", subject: "failed", text: "failed", status: "failed", provider: "outbox", createdAt: old, updatedAt: old },
    );
    const app = await buildApp({ store });
    apps.push(app);

    const denied = await app.inject({ method: "GET", url: "/api/v1/admin/retention/operations", headers: { "x-user-id": "player" } });
    expect(denied.statusCode).toBe(403);

    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/admin/retention/prune",
      headers: { "x-user-id": "admin", "idempotency-key": "retention-preview" },
      payload: { dryRun: true, olderThanDays: 30, recordClasses: ["delivered_emails"], batchSize: 25 },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ preservationDefault: true, eligibleCount: 1, selected: [{ recordClass: "delivered_emails", id: "old_delivery" }] });
    expect(store.state.emailOutbox).toHaveLength(2);

    const stale = await app.inject({
      method: "POST",
      url: "/api/v1/admin/retention/prune",
      headers: { "x-user-id": "admin", "idempotency-key": "retention-stale" },
      payload: { dryRun: false, olderThanDays: 30, recordClasses: ["delivered_emails"], targetSetHash: "0".repeat(64), reason: "Measured cleanup after a verified recovery point." },
    });
    expect(stale.statusCode).toBe(409);
    expect(store.state.emailOutbox).toHaveLength(2);

    const execute = await app.inject({
      method: "POST",
      url: "/api/v1/admin/retention/prune",
      headers: { "x-user-id": "admin", "idempotency-key": "retention-execute" },
      payload: { dryRun: false, olderThanDays: 30, recordClasses: ["delivered_emails"], batchSize: 25, targetSetHash: preview.json().targetSetHash, reason: "Measured cleanup after a verified recovery point." },
    });
    expect(execute.statusCode).toBe(200);
    expect(execute.json()).toMatchObject({ deletedCount: 1, remainingCount: 0 });
    expect(store.state.emailOutbox.map((entry) => entry.id)).toEqual(["failed_delivery"]);
    expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ actorUserId: "admin", action: "admin.retention.prune", after: expect.objectContaining({ deletedCount: 1, reason: "Measured cleanup after a verified recovery point." }) }));
  });
});
