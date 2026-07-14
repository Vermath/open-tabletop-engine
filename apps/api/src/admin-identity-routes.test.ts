import { emptyState, type EmailOutboxMessage, type PasswordResetToken, type User, type UserSession } from "@open-tabletop/core";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAdminIdentityRoutes } from "./admin-identity-routes.js";
import { MemoryStateStore } from "./store.js";

const timestamp = "2026-07-14T12:00:00.000Z";

function user(id: string, overrides: Partial<User> = {}): User {
  return { id, displayName: id, email: `${id}@example.com`, createdAt: timestamp, updatedAt: timestamp, ...overrides };
}

function session(id: string, userId: string, expiresAt = "2026-07-20T12:00:00.000Z"): UserSession {
  return { id, userId, tokenHash: `sha256:${id}`, expiresAt, lastSeenAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
}

function reset(id: string): PasswordResetToken {
  return { id, userId: "usr_player", email: "usr_player@example.com", tokenHash: `sha256:${id}`, expiresAt: "2026-01-01T00:00:00.000Z", createdAt: timestamp, updatedAt: timestamp };
}

function email(id: string): EmailOutboxMessage {
  return { id, to: "usr_player@example.com", subject: "Reset", text: "Use opr_secret", status: "failed", provider: "webhook", createdAt: timestamp, updatedAt: timestamp };
}

async function fixture() {
  const store = new MemoryStateStore(emptyState());
  store.state.users.push(user("usr_admin", { serverAdmin: true }), user("usr_player"));
  const audits: Array<{ action: string; after?: unknown }> = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));
  const app = Fastify();
  registerAdminIdentityRoutes(app, {
    store,
    requireServerAdmin: () => "usr_admin",
    adminUserInfo: (entry) => ({ ...entry, disabled: Boolean(entry.disabledAt), membershipCount: 0, identityCount: 0, sessionCount: store.state.sessions.filter((candidate) => candidate.userId === entry.id).length }),
    publicUser: (entry) => ({ id: entry.id, displayName: entry.displayName, createdAt: entry.createdAt, updatedAt: entry.updatedAt }),
    appendAudit: (_actor, audit) => audits.push(audit),
    appendReadAudit: (_actor, audit) => audits.push(audit),
    emailDeliveryOptions: { webhookUrl: "https://mail.example.test", fetchImpl },
  });
  await app.ready();
  return { app, store, audits, fetchImpl };
}

const apps: Array<Awaited<ReturnType<typeof fixture>>["app"]> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("admin identity routes", () => {
  it("enforces K+R on user updates", async () => {
    const setup = await fixture();
    apps.push(setup.app);
    const missingKey = await setup.app.inject({ method: "PATCH", url: "/api/v1/admin/users/usr_player", payload: { expectedUpdatedAt: timestamp, displayName: "Player" } });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json()).toMatchObject({ code: "idempotency_key_required" });

    const stale = await setup.app.inject({ method: "PATCH", url: "/api/v1/admin/users/usr_player", headers: { "Idempotency-Key": "user-update-1" }, payload: { expectedUpdatedAt: "2026-07-14T11:00:00.000Z", displayName: "Player" } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "stale_write", currentUpdatedAt: timestamp });

    const updated = await setup.app.inject({ method: "PATCH", url: "/api/v1/admin/users/usr_player", headers: { "Idempotency-Key": "user-update-2" }, payload: { expectedUpdatedAt: timestamp, displayName: "Player" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: "usr_player", displayName: "Player" });
  });

  it("requires a prepared unchanged target set for reset pruning and all-user session revocation", async () => {
    const setup = await fixture();
    apps.push(setup.app);
    setup.store.state.passwordResetTokens.push(reset("reset_a"));
    setup.store.state.sessions.push(session("session_a", "usr_player"));

    const resetPreview = await setup.app.inject({ method: "POST", url: "/api/v1/admin/password-resets/prune", headers: { "Idempotency-Key": "reset-preview" }, payload: { dryRun: true } });
    expect(resetPreview.statusCode).toBe(200);
    const resetPlan = resetPreview.json() as { targetSetHash: string };
    setup.store.state.passwordResetTokens[0]!.updatedAt = "2026-07-14T12:01:00.000Z";
    const resetExecute = await setup.app.inject({ method: "POST", url: "/api/v1/admin/password-resets/prune", headers: { "Idempotency-Key": "reset-execute" }, payload: { targetSetHash: resetPlan.targetSetHash } });
    expect(resetExecute.statusCode).toBe(409);

    const sessionPreview = await setup.app.inject({ method: "GET", url: "/api/v1/admin/users/usr_player/sessions/revocation-plan" });
    const sessionPlan = sessionPreview.json() as { targetSetHash: string };
    setup.store.state.sessions.push(session("session_b", "usr_player"));
    const revoke = await setup.app.inject({ method: "DELETE", url: "/api/v1/admin/users/usr_player/sessions", headers: { "Idempotency-Key": "session-revoke" }, payload: { targetSetHash: sessionPlan.targetSetHash } });
    expect(revoke.statusCode).toBe(409);
    expect(revoke.json()).toMatchObject({ code: "target_set_changed" });
  });

  it("deduplicates password reset creation without generic secret replay", async () => {
    const setup = await fixture();
    apps.push(setup.app);
    const request = {
      method: "POST" as const,
      url: "/api/v1/admin/users/usr_player/password-reset",
      headers: { "Idempotency-Key": "reset-user-once" },
      payload: { expectedUpdatedAt: timestamp, returnTo: "http://localhost:5173/reset-password" },
    };
    const first = await setup.app.inject(request);
    const replay = await setup.app.inject(request);

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["x-open-tabletop-operation-deduplicated"]).toBe("true");
    expect(replay.headers["idempotency-replayed"]).toBeUndefined();
    expect(setup.store.state.passwordResetTokens).toHaveLength(1);
    expect(setup.store.state.emailOutbox).toHaveLength(1);
    expect(setup.store.state.idempotencyRecords).toEqual([]);
    expect(setup.fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.json()).toMatchObject({ reset: { id: setup.store.state.passwordResetTokens[0]!.id }, email: { deliveryId: setup.store.state.emailOutbox[0]!.deliveryId } });
  });

  it("enforces R for one email and P for bulk email while forwarding stable X headers", async () => {
    const setup = await fixture();
    apps.push(setup.app);
    setup.store.state.emailOutbox.push(email("email_a"), email("email_b"));

    const stale = await setup.app.inject({ method: "POST", url: "/api/v1/admin/email-outbox/email_a/retry", headers: { "Idempotency-Key": "email-one-stale" }, payload: { expectedUpdatedAt: "2026-07-14T11:00:00.000Z" } });
    expect(stale.statusCode).toBe(409);
    const single = await setup.app.inject({ method: "POST", url: "/api/v1/admin/email-outbox/email_a/retry", headers: { "Idempotency-Key": "email-one" }, payload: { expectedUpdatedAt: timestamp } });
    expect(single.statusCode).toBe(200);
    const singleReplay = await setup.app.inject({ method: "POST", url: "/api/v1/admin/email-outbox/email_a/retry", headers: { "Idempotency-Key": "email-one" }, payload: { expectedUpdatedAt: timestamp } });
    expect(singleReplay.statusCode).toBe(200);
    expect(singleReplay.headers["x-open-tabletop-operation-deduplicated"]).toBe("true");

    const preview = await setup.app.inject({ method: "POST", url: "/api/v1/admin/email-outbox/retry-all", headers: { "Idempotency-Key": "email-preview" }, payload: { dryRun: true, status: "failed" } });
    const plan = preview.json() as { targetSetHash: string };
    const bulk = await setup.app.inject({ method: "POST", url: "/api/v1/admin/email-outbox/retry-all", headers: { "Idempotency-Key": "email-bulk" }, payload: { status: "failed", targetSetHash: plan.targetSetHash } });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json()).toMatchObject({ retried: 1, delivered: 1 });
    for (const call of setup.fetchImpl.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe(headers["X-Open-Tabletop-Delivery-Id"]);
    }
  });
});
