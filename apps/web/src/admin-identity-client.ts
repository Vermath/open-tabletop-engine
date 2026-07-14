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

export function updateAdminUser(
  user: AdminUserInfo,
  patch: Omit<Partial<AdminUserInfo>, "id" | "createdAt" | "updatedAt">,
  signal?: AbortSignal,
): Promise<AdminUserInfo> {
  return apiPatch<AdminUserInfo>(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, {
    ...patch,
    expectedUpdatedAt: user.updatedAt,
  }, operatorOptions("admin-user-update", user.id, signal));
}

export function issueAdminPasswordReset(user: AdminUserInfo, returnTo: string, signal?: AbortSignal): Promise<AdminPasswordResetInfo> {
  return apiPost<AdminPasswordResetInfo>(`/api/v1/admin/users/${encodeURIComponent(user.id)}/password-reset`, {
    expectedUpdatedAt: user.updatedAt,
    returnTo,
  }, operatorOptions("admin-password-reset", user.id, signal));
}

export async function revokeAdminUserSessions(user: AdminUserInfo, signal?: AbortSignal): Promise<{ revoked: number; targetSetHash: string }> {
  const path = `/api/v1/admin/users/${encodeURIComponent(user.id)}/sessions`;
  const plan = await apiGet<{ targetSetHash: string }>(`${path}/revocation-plan`, { signal });
  return apiDelete<{ revoked: number; targetSetHash: string }>(path, {
    signal,
    body: { targetSetHash: plan.targetSetHash },
    idempotencyKey: operatorMutationKey("admin-user-sessions", user.id),
  });
}

export function revokeAdminSession(session: AdminSessionInfo, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/v1/admin/sessions/${encodeURIComponent(session.id)}`, {
    signal,
    body: { expectedUpdatedAt: session.updatedAt },
    idempotencyKey: operatorMutationKey("admin-session-revoke", session.id),
  });
}

export async function revokeAdminRiskSessions(staleDays: number, signal?: AbortSignal): Promise<{ matched: number; revoked: number; remainingRiskSessionCount: number; targetSetHash: string }> {
  const input = { staleDays, reasons: ["expired", "stale", "disabled_user", "unknown_user"] };
  const preview = await apiPost<{ targetSetHash: string }>("/api/v1/admin/sessions/risk/revoke", { ...input, dryRun: true }, operatorOptions("admin-risk-preview", String(staleDays), signal));
  return apiPost<{ matched: number; revoked: number; remainingRiskSessionCount: number; targetSetHash: string }>("/api/v1/admin/sessions/risk/revoke", { ...input, dryRun: false, targetSetHash: preview.targetSetHash }, operatorOptions("admin-risk-execute", preview.targetSetHash, signal));
}

export async function pruneExpiredPasswordResets(signal?: AbortSignal): Promise<{ matched: number; pruned: number; expiredRemaining: number; targetSetHash: string }> {
  const input = { includeExpired: true, includeUsed: false };
  const preview = await apiPost<{ targetSetHash: string }>("/api/v1/admin/password-resets/prune", { ...input, dryRun: true }, operatorOptions("admin-reset-prune-preview", "expired", signal));
  return apiPost<{ matched: number; pruned: number; expiredRemaining: number; targetSetHash: string }>("/api/v1/admin/password-resets/prune", { ...input, dryRun: false, targetSetHash: preview.targetSetHash }, operatorOptions("admin-reset-prune-execute", preview.targetSetHash, signal));
}

export function retryAdminEmail(email: EmailOutboxMessage, signal?: AbortSignal): Promise<EmailOutboxMessage> {
  return apiPost<EmailOutboxMessage>(`/api/v1/admin/email-outbox/${encodeURIComponent(email.id)}/retry`, {
    expectedUpdatedAt: email.updatedAt,
  }, operatorOptions("admin-email-retry", email.id, signal));
}

export async function retryAllAdminEmails(signal?: AbortSignal): Promise<AdminEmailOutboxRetryAllResult & { targetSetHash: string; batchDeliveryId?: string }> {
  const preview = await apiPost<{ targetSetHash: string }>("/api/v1/admin/email-outbox/retry-all", { status: "retryable", dryRun: true }, operatorOptions("admin-email-batch-preview", "retryable", signal));
  return apiPost<AdminEmailOutboxRetryAllResult & { targetSetHash: string; batchDeliveryId?: string }>("/api/v1/admin/email-outbox/retry-all", {
    status: "retryable",
    dryRun: false,
    targetSetHash: preview.targetSetHash,
  }, operatorOptions("admin-email-batch-execute", preview.targetSetHash, signal));
}

export function operatorMutationKey(operation: string, target: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${operation}:${target}:${random}`.slice(0, 160);
}

function operatorOptions(operation: string, target: string, signal?: AbortSignal): MutationOptions {
  return { signal, idempotencyKey: operatorMutationKey(operation, target) };
}
