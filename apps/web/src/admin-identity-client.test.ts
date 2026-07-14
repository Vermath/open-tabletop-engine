import type { EmailOutboxMessage } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import { createAdminIdentityMutationClient, type AdminIdentityTransport } from "./admin-identity-client.js";
import type { AdminSessionInfo, AdminUserInfo } from "./api.js";

const timestamp = "2026-07-14T12:00:00.000Z";

function fixture() {
  const calls: Array<{ method: string; path: string; body?: unknown; options?: { idempotencyKey?: string; body?: unknown } }> = [];
  const transport: AdminIdentityTransport = {
    get: vi.fn(async (path, options) => {
      calls.push({ method: "GET", path, options });
      return { targetSetHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", matched: 1 } as never;
    }),
    post: vi.fn(async (path, body, options) => {
      calls.push({ method: "POST", path, body, options });
      if ((body as { dryRun?: boolean }).dryRun) return { targetSetHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } as never;
      return { ok: true, targetSetHash: (body as { targetSetHash?: string }).targetSetHash } as never;
    }),
    patch: vi.fn(async (path, body, options) => {
      calls.push({ method: "PATCH", path, body, options });
      return body as never;
    }),
    delete: vi.fn(async (path, options) => {
      calls.push({ method: "DELETE", path, options });
      return { ok: true, revoked: 1, targetSetHash: (options?.body as { targetSetHash?: string })?.targetSetHash } as never;
    }),
  };
  return { client: createAdminIdentityMutationClient(transport), calls };
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
    const { client, calls } = fixture();
    const session = { id: "session_1", userId: user.id, expiresAt: timestamp, lastSeenAt: timestamp, createdAt: timestamp, updatedAt: timestamp, user } satisfies AdminSessionInfo;
    const email = { id: "email_1", to: "player@example.com", subject: "Reset", text: "secret", status: "failed", provider: "webhook", createdAt: timestamp, updatedAt: timestamp } satisfies EmailOutboxMessage;

    await client.updateUser(user, { disabled: true });
    await client.issuePasswordReset(user, "http://localhost:5173/reset-password");
    await client.revokeSession(session);
    await client.retryEmail(email);

    expect(calls).toHaveLength(4);
    for (const call of calls) expect(call.options?.idempotencyKey).toBeTruthy();
    expect(calls[0]?.body).toMatchObject({ disabled: true, expectedUpdatedAt: timestamp });
    expect(calls[1]?.body).toMatchObject({ expectedUpdatedAt: timestamp });
    expect(calls[2]?.options?.body).toEqual({ expectedUpdatedAt: timestamp });
    expect(calls[3]?.body).toEqual({ expectedUpdatedAt: timestamp });
  });

  it("prepares P and then executes with the exact targetSetHash", async () => {
    const { client, calls } = fixture();
    await client.revokeUserSessions(user);
    await client.revokeRiskSessions(30);
    await client.pruneExpiredPasswordResets();
    await client.retryAllEmails();

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
