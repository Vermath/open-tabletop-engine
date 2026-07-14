import { emptyState, type PasswordResetToken, type User, type UserSession } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import {
  AdminIdentityMutationError,
  issueAdminPasswordReset,
  prunePasswordResetTokensForAdmin,
  pruneSessionsForAdmin,
  revokeRiskSessions,
  revokeSingleSession,
  revokeUserSessions,
  updateAdminUser,
  userSessionRevocationPlan,
} from "./admin-identity-operations.js";
import { MemoryStateStore } from "./store.js";

const timestamp = "2026-07-14T12:00:00.000Z";
const later = "2026-07-14T12:01:00.000Z";
const nowMs = Date.parse("2026-07-14T13:00:00.000Z");

function user(id: string, overrides: Partial<User> = {}): User {
  return { id, displayName: id, email: `${id}@example.com`, createdAt: timestamp, updatedAt: timestamp, ...overrides };
}

function session(id: string, userId: string, expiresAt: string, overrides: Partial<UserSession> = {}): UserSession {
  return {
    id,
    userId,
    tokenHash: `sha256:${id}`,
    expiresAt,
    lastSeenAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function reset(id: string, expiresAt: string, overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return {
    id,
    userId: "usr_player",
    email: "player@example.com",
    tokenHash: `sha256:${id}`,
    expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("admin identity operator mutation guards", () => {
  it("requires the exact user revision before an admin update", () => {
    const store = new MemoryStateStore(emptyState());
    const target = user("usr_player");
    store.state.users.push(user("usr_admin", { serverAdmin: true }), target);

    expect(() => updateAdminUser(store, target, "usr_admin", { expectedUpdatedAt: later, displayName: "Changed" }))
      .toThrowError(AdminIdentityMutationError);
    expect(target.displayName).toBe("usr_player");

    updateAdminUser(store, target, "usr_admin", { expectedUpdatedAt: timestamp, displayName: "Changed" });
    expect(target.displayName).toBe("Changed");
    expect(target.updatedAt).not.toBe(timestamp);
  });

  it("rejects changed password-reset and expired-session target sets", () => {
    const store = new MemoryStateStore(emptyState());
    store.state.passwordResetTokens.push(reset("reset_a", timestamp), reset("reset_b", timestamp));
    store.state.sessions.push(
      session("session_a", "usr_player", timestamp),
      session("session_b", "usr_player", timestamp),
    );

    const resetPreview = prunePasswordResetTokensForAdmin(store, { dryRun: true }, nowMs);
    const sessionPreview = pruneSessionsForAdmin(store, { dryRun: true }, nowMs);
    store.state.passwordResetTokens[0]!.updatedAt = later;
    store.state.sessions[0]!.updatedAt = later;

    expect(() => prunePasswordResetTokensForAdmin(store, { targetSetHash: resetPreview.targetSetHash }, nowMs)).toThrowError(/target set changed/i);
    expect(() => pruneSessionsForAdmin(store, { targetSetHash: sessionPreview.targetSetHash }, nowMs)).toThrowError(/target set changed/i);
    expect(store.state.passwordResetTokens).toHaveLength(2);
    expect(store.state.sessions).toHaveLength(2);
  });

  it("publishes and enforces the exact target set for all-user and risk revocation", () => {
    const store = new MemoryStateStore(emptyState());
    store.state.users.push(user("usr_player"));
    store.state.sessions.push(
      session("session_expired", "usr_player", timestamp),
      session("session_active", "usr_player", "2026-07-20T12:00:00.000Z", { lastSeenAt: "2026-07-01T12:00:00.000Z" }),
    );

    const userPlan = userSessionRevocationPlan(store, "usr_player");
    store.state.sessions.push(session("session_new", "usr_player", "2026-07-20T12:00:00.000Z"));
    expect(() => revokeUserSessions(store, "usr_player", userPlan.targetSetHash)).toThrowError(/target set changed/i);

    const reasons = new Set(["expired"] as const);
    const riskPreview = revokeRiskSessions(store, 30, reasons, { dryRun: true }, nowMs);
    store.state.sessions.find((candidate) => candidate.id === "session_expired")!.updatedAt = later;
    expect(() => revokeRiskSessions(store, 30, reasons, { targetSetHash: riskPreview.targetSetHash }, nowMs)).toThrowError(/target set changed/i);
  });

  it("requires the exact revision for a single-session revoke", () => {
    const store = new MemoryStateStore(emptyState());
    const target = session("session_one", "usr_player", "2026-07-20T12:00:00.000Z");
    store.state.sessions.push(target);

    expect(() => revokeSingleSession(store, target, later)).toThrowError(/changed after it was loaded/i);
    expect(store.state.sessions).toHaveLength(1);
    expect(revokeSingleSession(store, target, timestamp)).toMatchObject({ ok: true });
    expect(store.state.sessions).toHaveLength(0);
  });

  it("deduplicates secret-bearing password reset issuance outside the generic replay ledger", async () => {
    const store = new MemoryStateStore(emptyState());
    const target = user("usr_player");
    store.state.users.push(user("usr_admin", { serverAdmin: true }), target);
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 204 }));
    const input = { expectedUpdatedAt: timestamp, returnTo: "http://localhost:5173/reset-password" };
    const context = { actorUserId: "usr_admin", idempotencyKey: "password-reset-once" };

    const first = await issueAdminPasswordReset(store, target, input, context, { webhookUrl: "https://mail.example.test", fetchImpl });
    const replay = await issueAdminPasswordReset(store, target, input, context, { webhookUrl: "https://mail.example.test", fetchImpl });

    expect(first.deduplicated).toBe(false);
    expect(replay.deduplicated).toBe(true);
    expect(replay.reset.id).toBe(first.reset.id);
    expect(replay.email.id).toBe(first.email.id);
    expect(store.state.passwordResetTokens).toHaveLength(1);
    expect(store.state.emailOutbox).toHaveLength(1);
    expect(store.state.idempotencyRecords).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(first.email.deliveryId);
    expect(headers["X-Open-Tabletop-Delivery-Id"]).toBe(first.email.deliveryId);
  });
});
