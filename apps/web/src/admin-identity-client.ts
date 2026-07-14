import type { EmailOutboxMessage } from "@open-tabletop/core";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  type AdminEmailOutboxRetryAllResult,
  type AdminPasswordResetInfo,
  type AdminSessionInfo,
  type AdminUserInfo,
} from "./api.js";

interface MutationOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
  body?: unknown;
}

export interface AdminIdentityTransport {
  get<T>(path: string, options?: MutationOptions): Promise<T>;
  post<T>(path: string, body: unknown, options?: MutationOptions): Promise<T>;
  patch<T>(path: string, body: unknown, options?: MutationOptions): Promise<T>;
  delete<T>(path: string, options?: MutationOptions): Promise<T>;
}

export interface OperatorTargetSetPlan<T> {
  generatedAt: string;
  targetSetHash: string;
  matched: number;
  sessions?: T[];
}

export interface AdminIdentityMutationClient {
  updateUser(user: AdminUserInfo, patch: Omit<Partial<AdminUserInfo>, "id" | "createdAt" | "updatedAt">, signal?: AbortSignal): Promise<AdminUserInfo>;
  issuePasswordReset(user: AdminUserInfo, returnTo: string, signal?: AbortSignal): Promise<AdminPasswordResetInfo>;
  revokeUserSessions(user: AdminUserInfo, signal?: AbortSignal): Promise<{ revoked: number; targetSetHash: string }>;
  revokeSession(session: AdminSessionInfo, signal?: AbortSignal): Promise<{ ok: boolean }>;
  revokeRiskSessions(staleDays: number, signal?: AbortSignal): Promise<{ matched: number; revoked: number; remainingRiskSessionCount: number; targetSetHash: string }>;
  pruneExpiredPasswordResets(signal?: AbortSignal): Promise<{ matched: number; pruned: number; expiredRemaining: number; targetSetHash: string }>;
  retryEmail(email: EmailOutboxMessage, signal?: AbortSignal): Promise<EmailOutboxMessage>;
  retryAllEmails(signal?: AbortSignal): Promise<AdminEmailOutboxRetryAllResult & { targetSetHash: string; batchDeliveryId?: string }>;
}

const defaultTransport: AdminIdentityTransport = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  delete: apiDelete,
};

export function createAdminIdentityMutationClient(transport: AdminIdentityTransport = defaultTransport): AdminIdentityMutationClient {
  return {
    updateUser: (user, patch, signal) => transport.patch<AdminUserInfo>(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, {
      ...patch,
      expectedUpdatedAt: user.updatedAt,
    }, operatorOptions("admin-user-update", user.id, signal)),

    issuePasswordReset: (user, returnTo, signal) => transport.post<AdminPasswordResetInfo>(`/api/v1/admin/users/${encodeURIComponent(user.id)}/password-reset`, {
      expectedUpdatedAt: user.updatedAt,
      returnTo,
    }, operatorOptions("admin-password-reset", user.id, signal)),

    revokeUserSessions: async (user, signal) => {
      const path = `/api/v1/admin/users/${encodeURIComponent(user.id)}/sessions`;
      const plan = await transport.get<OperatorTargetSetPlan<AdminSessionInfo>>(`${path}/revocation-plan`, { signal });
      return transport.delete<{ revoked: number; targetSetHash: string }>(path, {
        signal,
        body: { targetSetHash: plan.targetSetHash },
        idempotencyKey: operatorMutationKey("admin-user-sessions", user.id),
      });
    },

    revokeSession: (session, signal) => transport.delete<{ ok: boolean }>(`/api/v1/admin/sessions/${encodeURIComponent(session.id)}`, {
      signal,
      body: { expectedUpdatedAt: session.updatedAt },
      idempotencyKey: operatorMutationKey("admin-session-revoke", session.id),
    }),

    revokeRiskSessions: async (staleDays, signal) => {
      const input = { staleDays, reasons: ["expired", "stale", "disabled_user", "unknown_user"] };
      const preview = await transport.post<{ targetSetHash: string }>("/api/v1/admin/sessions/risk/revoke", { ...input, dryRun: true }, operatorOptions("admin-risk-preview", String(staleDays), signal));
      return transport.post("/api/v1/admin/sessions/risk/revoke", { ...input, dryRun: false, targetSetHash: preview.targetSetHash }, operatorOptions("admin-risk-execute", preview.targetSetHash, signal));
    },

    pruneExpiredPasswordResets: async (signal) => {
      const input = { includeExpired: true, includeUsed: false };
      const preview = await transport.post<{ targetSetHash: string }>("/api/v1/admin/password-resets/prune", { ...input, dryRun: true }, operatorOptions("admin-reset-prune-preview", "expired", signal));
      return transport.post("/api/v1/admin/password-resets/prune", { ...input, dryRun: false, targetSetHash: preview.targetSetHash }, operatorOptions("admin-reset-prune-execute", preview.targetSetHash, signal));
    },

    retryEmail: (email, signal) => transport.post<EmailOutboxMessage>(`/api/v1/admin/email-outbox/${encodeURIComponent(email.id)}/retry`, {
      expectedUpdatedAt: email.updatedAt,
    }, operatorOptions("admin-email-retry", email.id, signal)),

    retryAllEmails: async (signal) => {
      const preview = await transport.post<{ targetSetHash: string }>("/api/v1/admin/email-outbox/retry-all", { status: "retryable", dryRun: true }, operatorOptions("admin-email-batch-preview", "retryable", signal));
      return transport.post("/api/v1/admin/email-outbox/retry-all", {
        status: "retryable",
        dryRun: false,
        targetSetHash: preview.targetSetHash,
      }, operatorOptions("admin-email-batch-execute", preview.targetSetHash, signal));
    },
  };
}

export function operatorMutationKey(operation: string, target: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${operation}:${target}:${random}`.slice(0, 160);
}

function operatorOptions(operation: string, target: string, signal?: AbortSignal): MutationOptions {
  return { signal, idempotencyKey: operatorMutationKey(operation, target) };
}
