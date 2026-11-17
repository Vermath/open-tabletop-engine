import type { EmailOutboxMessage } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { issueAdminPasswordReset, pruneExpiredPasswordResets, retryAdminEmail, retryAllAdminEmails, revokeAdminRiskSessions, revokeAdminSession, revokeAdminUserSessions, updateAdminUser } from "./admin-identity-client.js";
import { apiDelete, apiGet, apiPatch, apiPost, type AdminSessionInfo, type AdminUserInfo } from "./api.js";

vi.mock("./api.js", () => ({
  apiDelete: vi.fn(), apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn(),
}));

const timestamp = "2026-07-14T12:00:00.000Z";

function fixture() {
  vi.clearAllMocks();
  const calls: Array<{ method: string; path: string; body?: unknown; options?: { idempotencyKey?: string; body?: unknown } }> = [];
  vi.mocked(apiGet).mockImplementation(async (path, options) => {
    calls.push({ method: "GET", path, options });
    return { targetSetHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", matched: 1 } as never;
  });
  vi.mocked(apiPost).mockImplementation(async (path, body, options) => {
    calls.push({ method: "POST", path, body, options });
    if ((body as { dryRun?: boolean }).dryRun) return { targetSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } as never;
    return { ok: true, targetSetHash: (body as { targetSetHash?: string }).targetSetHash } as never;
  });
  vi.mocked(apiPatch).mockImplementation(async (path, body, options) => {
    calls.push({ method: "PATCH", path, body, options });
    return body as never;
  });
  vi.mocked(apiDelete).mockImplementation(async (path, options) => {
    calls.push({ method: "DELETE", path, options });
    return { ok: true, revoked: 1, targetSetHash: (options?.body as { targetSetHash?: string })?.targetSetHash } as never;
  });
  return { calls };
}

const user = {
  id: "usr_player",
  displayName: "Player",
  email: "player@example.com",
  disabled: false,
  membershipCount: 1,
  identityCount: 1,
  sessionCount: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies AdminUserInfo;

describe("admin identity mutation client", () => {
  it("sends K+R for user, reset, session, and email entity mutations", async () => {
    const { calls } = fixture();
    const session = { id: "session_1", userId: user.id, expiresAt: timestamp, lastSeenAt: timestamp, createdAt: timestamp, updatedAt: timestamp, user } satisfies AdminSessionInfo;
    const email = { id: "email_1", to: "player@example.com", subject: "Reset", text: "secret", status: "failed", provider: "webhook", createdAt: timestamp, updatedAt: timestamp } satisfies EmailOutboxMessage;

    await updateAdminUser(user, { disabled: true });
    await issueAdminPasswordReset(user, "http://localhost:5173/reset-password");
    await revokeAdminSession(session);
    await retryAdminEmail(email);

    expect(calls).toHaveLength(4);
    for (const call of calls) expect(call.options?.idempotencyKey).toBeTruthy();
    expect(calls[0]?.body).toMatchObject({ disabled: true, expectedUpdatedAt: timestamp });
    expect(calls[1]?.body).toMatchObject({ expectedUpdatedAt: timestamp });
    expect(calls[2]?.options?.body).toEqual({ expectedUpdatedAt: timestamp });
    expect(calls[3]?.body).toEqual({ expectedUpdatedAt: timestamp });
  });

  it("prepares P and then executes with the exact targetSetHash", async () => {
    const { calls } = fixture();
    await revokeAdminUserSessions(user);
    await revokeAdminRiskSessions(30);
    await pruneExpiredPasswordResets();
    await retryAllAdminEmails();

    expect(calls.filter((call) => call.method === "GET")).toHaveLength(1);
    const mutationCalls = calls.filter((call) => call.method !== "GET");
    for (const call of mutationCalls) expect(call.options?.idempotencyKey).toBeTruthy();
    const executions = calls.filter((call) => call.method === "DELETE" || (call.method === "POST" && (call.body as { dryRun?: boolean })?.dryRun === false));
    expect(executions).toHaveLength(4);
    for (const execution of executions) {
      const targetSetHash = execution.method === "DELETE"
        ? (execution.options?.body as { targetSetHash?: string }).targetSetHash
        : (execution.body as { targetSetHash?: string }).targetSetHash;
      expect(targetSetHash).toMatch(/^sha256:/);
    }
  });
});
