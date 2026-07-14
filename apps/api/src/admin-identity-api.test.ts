import { createTimestamped, type EmailOutboxMessage, type PasswordResetToken, type UserSession } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const adminHeaders = { "x-user-id": "usr_demo_gm" };
const timestamp = "2026-07-14T12:00:00.000Z";
const previousWebhookUrl = process.env.OTTE_EMAIL_WEBHOOK_URL;

beforeEach(() => {
  process.env.OTTE_EMAIL_WEBHOOK_URL = "https://mail.example.test/deliver";
});

afterEach(() => {
  if (previousWebhookUrl === undefined) delete process.env.OTTE_EMAIL_WEBHOOK_URL;
  else process.env.OTTE_EMAIL_WEBHOOK_URL = previousWebhookUrl;
  vi.unstubAllGlobals();
});

function operatorHeaders(key: string) {
  return { ...adminHeaders, "Idempotency-Key": key };
}

async function fixture() {
  const store = new MemoryStateStore();
  store.state.users.find((user) => user.id === "usr_demo_gm")!.serverAdmin = true;
  const app = await buildApp({ store, rateLimit: { enabled: false } });
  return { app, store };
}

describe("admin identity API operator guarantees", () => {
  it("enforces K+R for user and single-session mutations under strict runtime contracts", async () => {
    const { app, store } = await fixture();
    try {
      const user = store.state.users.find((candidate) => candidate.id === "usr_demo_player")!;
      const missingKey = await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${user.id}`, headers: adminHeaders, payload: { expectedUpdatedAt: user.updatedAt, displayName: "Player" } });
      expect(missingKey.statusCode).toBe(400);

      const stale = await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${user.id}`, headers: operatorHeaders("identity-user-stale"), payload: { expectedUpdatedAt: timestamp, displayName: "Player" } });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", currentUpdatedAt: user.updatedAt });

      const updated = await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${user.id}`, headers: operatorHeaders("identity-user-update"), payload: { expectedUpdatedAt: user.updatedAt, displayName: "Player Updated" } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: user.id, displayName: "Player Updated" });

      const session = createTimestamped("session", {
        userId: user.id,
        tokenHash: "sha256:identity-session",
        expiresAt: "2026-07-20T12:00:00.000Z",
        lastSeenAt: timestamp,
      }) satisfies UserSession;
      store.state.sessions.push(session);
      const revoked = await app.inject({ method: "DELETE", url: `/api/v1/admin/sessions/${session.id}`, headers: operatorHeaders("identity-session-delete"), payload: { expectedUpdatedAt: session.updatedAt } });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });

  it("requires unchanged P target sets for pruning, risk revoke, and all-user revoke", async () => {
    const { app, store } = await fixture();
    try {
      const user = store.state.users.find((candidate) => candidate.id === "usr_demo_player")!;
      const expired = createTimestamped("session", {
        userId: user.id,
        tokenHash: "sha256:expired",
        expiresAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      }) satisfies UserSession;
      store.state.sessions.push(expired);
      const reset = createTimestamped("reset", {
        userId: user.id,
        email: user.email!,
        tokenHash: "sha256:expired-reset",
        expiresAt: "2026-01-01T00:00:00.000Z",
      }) satisfies PasswordResetToken;
      store.state.passwordResetTokens.push(reset);

      const resetPreview = await app.inject({ method: "POST", url: "/api/v1/admin/password-resets/prune", headers: operatorHeaders("identity-reset-preview"), payload: { dryRun: true } });
      expect(resetPreview.statusCode).toBe(200);
      const resetHash = resetPreview.json<{ targetSetHash: string }>().targetSetHash;
      reset.updatedAt = "2026-07-14T12:01:00.000Z";
      const resetChanged = await app.inject({ method: "POST", url: "/api/v1/admin/password-resets/prune", headers: operatorHeaders("identity-reset-execute"), payload: { targetSetHash: resetHash } });
      expect(resetChanged.statusCode).toBe(409);
      expect(resetChanged.json()).toMatchObject({ code: "target_set_changed" });

      const riskPreview = await app.inject({ method: "POST", url: "/api/v1/admin/sessions/risk/revoke", headers: operatorHeaders("identity-risk-preview"), payload: { dryRun: true, staleDays: 30, reasons: ["expired"] } });
      expect(riskPreview.statusCode).toBe(200);
      const riskHash = riskPreview.json<{ targetSetHash: string }>().targetSetHash;
      expired.updatedAt = "2026-07-14T12:02:00.000Z";
      const riskChanged = await app.inject({ method: "POST", url: "/api/v1/admin/sessions/risk/revoke", headers: operatorHeaders("identity-risk-execute"), payload: { staleDays: 30, reasons: ["expired"], targetSetHash: riskHash } });
      expect(riskChanged.statusCode).toBe(409);

      const userPlan = await app.inject({ method: "GET", url: `/api/v1/admin/users/${user.id}/sessions/revocation-plan`, headers: adminHeaders });
      expect(userPlan.statusCode).toBe(200);
      const userHash = userPlan.json<{ targetSetHash: string }>().targetSetHash;
      store.state.sessions.push(createTimestamped("session", { userId: user.id, tokenHash: "sha256:new", expiresAt: "2026-07-20T12:00:00.000Z", lastSeenAt: timestamp }) satisfies UserSession);
      const userChanged = await app.inject({ method: "DELETE", url: `/api/v1/admin/users/${user.id}/sessions`, headers: operatorHeaders("identity-user-sessions"), payload: { targetSetHash: userHash } });
      expect(userChanged.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  it("deduplicates secret reset/email operations without generic response replay and forwards stable X identity", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchImpl);
    const { app, store } = await fixture();
    try {
      const user = store.state.users.find((candidate) => candidate.id === "usr_demo_player")!;
      const resetRequest = {
        method: "POST" as const,
        url: `/api/v1/admin/users/${user.id}/password-reset`,
        headers: operatorHeaders("identity-reset-once"),
        payload: { expectedUpdatedAt: user.updatedAt, returnTo: "http://localhost:5173/reset-password" },
      };
      const resetFirst = await app.inject(resetRequest);
      const resetReplay = await app.inject(resetRequest);
      expect(resetFirst.statusCode).toBe(200);
      expect(resetReplay.statusCode).toBe(200);
      expect(resetReplay.headers["x-open-tabletop-operation-deduplicated"]).toBe("true");
      expect(resetReplay.headers["idempotency-replayed"]).toBeUndefined();
      expect(store.state.passwordResetTokens).toHaveLength(1);
      expect(store.state.emailOutbox).toHaveLength(1);
      expect(store.state.idempotencyRecords.some((record) => record.path.includes("password-reset"))).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const legacyEmail: EmailOutboxMessage = createTimestamped("email", {
        to: user.email!,
        subject: "Retry",
        text: "Use opr_secret",
        status: "failed" as const,
        provider: "webhook" as const,
      }) satisfies EmailOutboxMessage;
      store.state.emailOutbox.push(legacyEmail);
      const retryRequest = {
        method: "POST" as const,
        url: `/api/v1/admin/email-outbox/${legacyEmail.id}/retry`,
        headers: operatorHeaders("identity-email-once"),
        payload: { expectedUpdatedAt: legacyEmail.updatedAt },
      };
      const emailFirst = await app.inject(retryRequest);
      const emailReplay = await app.inject(retryRequest);
      expect(emailFirst.statusCode).toBe(200);
      expect(emailReplay.statusCode).toBe(200);
      expect(emailReplay.headers["x-open-tabletop-operation-deduplicated"]).toBe("true");
      expect(emailReplay.headers["idempotency-replayed"]).toBeUndefined();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const headers = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe(legacyEmail.deliveryId);
      expect(headers["X-Open-Tabletop-Delivery-Id"]).toBe(legacyEmail.deliveryId);
    } finally {
      await app.close();
    }
  });
});
