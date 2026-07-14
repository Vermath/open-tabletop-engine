import { createHash, randomBytes } from "node:crypto";
import {
  createTimestamped,
  nowIso,
  type EmailOutboxMessage,
  type PasswordResetToken,
  type User,
  type UserPreferences,
  type UserSession,
} from "@open-tabletop/core";
import {
  EmailOperatorMutationError,
  appendEmailOperatorReceipt,
  completeEmailOperatorReceipt,
  deliverEmailMessage,
  emailOperatorIdempotencyKeyHash,
  ensureEmailDeliveryId,
  findEmailOperatorReceipts,
  publicEmailOutboxMessage,
  type EmailDeliveryOptions,
} from "./email-outbox.js";
import { operatorTargetSetHash } from "./operator-mutation.js";
import type { StateStore } from "./store.js";

export type AdminSessionRiskReason = "expired" | "stale" | "disabled_user" | "unknown_user";

export interface AdminUserPatchBody {
  expectedUpdatedAt?: string;
  displayName?: string;
  email?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  passwordResetRequired?: boolean;
}

export interface AdminSessionRiskRevokeBody {
  staleDays?: string | number;
  dryRun?: boolean;
  reasons?: AdminSessionRiskReason[];
  targetSetHash?: string;
}

export interface AdminSessionPruneBody {
  dryRun?: boolean;
  targetSetHash?: string;
}

export interface AdminPasswordResetPruneBody {
  dryRun?: boolean;
  includeExpired?: boolean;
  includeUsed?: boolean;
  targetSetHash?: string;
}

export interface AdminPasswordResetIssueInput {
  expectedUpdatedAt?: string;
  returnTo?: string;
}

export interface AdminPasswordResetIssueContext {
  actorUserId: string;
  idempotencyKey: string;
}

export class AdminIdentityMutationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AdminIdentityMutationError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  response(): Record<string, unknown> {
    return { error: this.code, code: this.code, message: this.message, ...this.details };
  }
}

export function assertExpectedOperatorRevision(record: { id: string; updatedAt: string }, expectedUpdatedAt: unknown, resourceType: string): void {
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt.trim() === "") {
    throw new AdminIdentityMutationError(400, "precondition_required", `${resourceType} mutations require expectedUpdatedAt`, {
      resourceType,
      resourceId: record.id,
      currentUpdatedAt: record.updatedAt,
    });
  }
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new AdminIdentityMutationError(400, "invalid_precondition", `${resourceType} expectedUpdatedAt must be a valid date-time`, {
      resourceType,
      resourceId: record.id,
      currentUpdatedAt: record.updatedAt,
    });
  }
  if (expectedUpdatedAt !== record.updatedAt) {
    throw new AdminIdentityMutationError(409, "stale_write", `${resourceType} changed after it was loaded. Review the current revision and retry.`, {
      resourceType,
      resourceId: record.id,
      expectedUpdatedAt,
      currentUpdatedAt: record.updatedAt,
      current: { id: record.id, updatedAt: record.updatedAt },
    });
  }
}

export function updateAdminUser(store: StateStore, user: User, adminUserId: string, body: AdminUserPatchBody): User {
  assertExpectedOperatorRevision(user, body.expectedUpdatedAt, "user");
  if (body.displayName !== undefined) {
    const displayName = normalizeDisplayName(body.displayName);
    if (!displayName) throw new AdminIdentityMutationError(400, "invalid_request", "A valid displayName is required");
    user.displayName = displayName;
  }
  if (body.email !== undefined) {
    const email = body.email === null ? undefined : normalizeEmail(body.email);
    if (body.email !== null && !email) throw new AdminIdentityMutationError(400, "invalid_request", "A valid email is required");
    if (email && store.state.users.some((candidate) => candidate.id !== user.id && normalizeEmail(candidate.email) === email)) {
      throw new AdminIdentityMutationError(409, "conflict", "Email is already registered");
    }
    user.email = email;
  }
  if (body.passwordResetRequired !== undefined) user.passwordResetRequired = body.passwordResetRequired;
  if (body.disabled !== undefined) {
    if (body.disabled && user.id === adminUserId) throw new AdminIdentityMutationError(400, "invalid_request", "Admins cannot disable their own account");
    setUserDisabled(store, user, body.disabled, adminUserId, body.disabledReason);
  }
  user.updatedAt = nowIso();
  return user;
}

export function setUserDisabled(store: StateStore, user: User, disabled: boolean, adminUserId: string, reason: string | undefined): void {
  const now = nowIso();
  if (disabled) {
    user.disabledAt = user.disabledAt ?? now;
    user.disabledByUserId = adminUserId;
    user.disabledReason = normalizeDisplayName(reason) ?? reason?.trim().slice(0, 160);
    store.state.sessions = store.state.sessions.filter((session) => session.userId !== user.id);
  } else {
    user.disabledAt = undefined;
    user.disabledByUserId = undefined;
    user.disabledReason = undefined;
  }
  user.updatedAt = now;
}

export async function issuePasswordReset(
  store: StateStore,
  user: User,
  requestedByUserId: string | undefined,
  requestedReturnTo: string | undefined,
  options: EmailDeliveryOptions = {},
): Promise<{ reset: PasswordResetToken; email: EmailOutboxMessage; token: string; deduplicated: false }> {
  const issued = createPasswordResetRecords(store, user, requestedByUserId, requestedReturnTo, options);
  store.save();
  await deliverEmailMessage(issued.email, { ...options, beforeDispatch: () => store.save() });
  return { ...issued, deduplicated: false };
}

/**
 * Password-reset responses remain outside generic response replay because the
 * persisted email body contains a reset credential. This route-specific
 * receipt deduplicates creation without putting that response into the generic
 * idempotency ledger.
 */
export async function issueAdminPasswordReset(
  store: StateStore,
  user: User,
  input: AdminPasswordResetIssueInput,
  context: AdminPasswordResetIssueContext,
  options: EmailDeliveryOptions = {},
): Promise<{ reset: PasswordResetToken; email: EmailOutboxMessage; token: string; deduplicated: boolean }> {
  const keyHash = emailOperatorIdempotencyKeyHash(context.actorUserId, context.idempotencyKey);
  const requestHash = operatorTargetSetHash({
    operation: "password_reset_issue",
    userId: user.id,
    expectedUpdatedAt: input.expectedUpdatedAt,
    returnTo: input.returnTo,
  });
  const existingReceipts = findEmailOperatorReceipts(store.state.emailOutbox, "password_reset_issue", context.actorUserId, keyHash);
  if (existingReceipts.length > 0) {
    const existing = existingReceipts[0]!;
    if (existing.receipt.requestHash !== requestHash) throw new AdminIdentityMutationError(409, "idempotency_conflict", "Idempotency-Key was already used for a different password-reset request");
    const resetId = existing.message.metadata?.resetId;
    const reset = store.state.passwordResetTokens.find((candidate) => candidate.id === resetId);
    if (!reset) throw new AdminIdentityMutationError(409, "idempotency_receipt_unavailable", "The original password-reset receipt no longer has its reset record. Use a new Idempotency-Key.");
    return { reset, email: existing.message, token: "", deduplicated: true };
  }

  assertExpectedOperatorRevision(user, input.expectedUpdatedAt, "user");
  if (isDisabledUser(user)) throw new AdminIdentityMutationError(403, "forbidden", "User account is disabled");
  if (!user.email) throw new AdminIdentityMutationError(400, "invalid_request", "User does not have an email address");
  const deliveryId = `email_${createHash("sha256").update(`${context.actorUserId}\0${context.idempotencyKey}`).digest("hex").slice(0, 32)}`;
  const issued = createPasswordResetRecords(store, user, context.actorUserId, input.returnTo, { ...options, preferredDeliveryId: deliveryId });
  appendEmailOperatorReceipt(issued.email, {
    operation: "password_reset_issue",
    actorUserId: context.actorUserId,
    idempotencyKeyHash: keyHash,
    requestHash,
    deliveryId: ensureEmailDeliveryId(issued.email, deliveryId),
    startedAt: issued.email.createdAt,
  });
  // Persist both the receipt and delivery identity before external dispatch.
  store.save();
  await deliverEmailMessage(issued.email, { ...options, preferredDeliveryId: deliveryId, beforeDispatch: () => store.save() });
  completeEmailOperatorReceipt(issued.email, "password_reset_issue", context.actorUserId, keyHash);
  store.save();
  return { ...issued, deduplicated: false };
}

export function publicPasswordResetToken(reset: PasswordResetToken): Omit<PasswordResetToken, "tokenHash"> {
  const { tokenHash: _tokenHash, ...safeReset } = reset;
  return safeReset;
}

export function publicSession(session: UserSession): Pick<UserSession, "id" | "userId" | "activeOrganizationId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {
  return {
    id: session.id,
    userId: session.userId,
    activeOrganizationId: session.activeOrganizationId,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function adminSessionRiskReport(store: StateStore, staleDays: number, nowMs = Date.now()) {
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const sessions: Array<{
    session: ReturnType<typeof publicSession>;
    user: ReturnType<typeof publicIdentityUser> | { id: string; displayName: string };
    reasons: AdminSessionRiskReason[];
    lastSeenAgeDays?: number;
    expiresInMs: number;
  }> = [];
  const totals = {
    totalSessionCount: store.state.sessions.length,
    activeSessionCount: 0,
    expiredSessionCount: 0,
    staleSessionCount: 0,
    disabledUserSessionCount: 0,
    unknownUserSessionCount: 0,
    riskSessionCount: 0,
  };

  for (const session of store.state.sessions) {
    const user = store.state.users.find((candidate) => candidate.id === session.userId);
    const expiresAt = Date.parse(session.expiresAt);
    const lastSeenAt = Date.parse(session.lastSeenAt);
    const expired = !Number.isFinite(expiresAt) || expiresAt <= nowMs;
    const lastSeenAgeMs = Number.isFinite(lastSeenAt) ? nowMs - lastSeenAt : undefined;
    const stale = !expired && lastSeenAgeMs !== undefined && lastSeenAgeMs >= staleMs;
    const reasons: AdminSessionRiskReason[] = [];
    if (expired) {
      totals.expiredSessionCount += 1;
      reasons.push("expired");
    } else {
      totals.activeSessionCount += 1;
    }
    if (stale) {
      totals.staleSessionCount += 1;
      reasons.push("stale");
    }
    if (user && isDisabledUser(user)) {
      totals.disabledUserSessionCount += 1;
      reasons.push("disabled_user");
    }
    if (!user) {
      totals.unknownUserSessionCount += 1;
      reasons.push("unknown_user");
    }
    if (reasons.length === 0) continue;
    sessions.push({
      session: publicSession(session),
      user: user ? publicIdentityUser(user) : { id: session.userId, displayName: "Unknown user" },
      reasons,
      lastSeenAgeDays: lastSeenAgeMs === undefined ? undefined : Math.max(0, Math.floor(lastSeenAgeMs / (24 * 60 * 60 * 1000))),
      expiresInMs: Number.isFinite(expiresAt) ? expiresAt - nowMs : 0,
    });
  }
  totals.riskSessionCount = sessions.length;
  return { generatedAt: nowIso(), staleDays, totals, sessions };
}

export function normalizeSessionRiskStaleDays(value: string | number | undefined): number | undefined {
  if (value === undefined || value === "") return 30;
  const staleDays = Number(value);
  if (!Number.isInteger(staleDays) || staleDays < 1 || staleDays > 365) return undefined;
  return staleDays;
}

export function normalizeSessionRiskReasons(value: unknown): Set<AdminSessionRiskReason> | undefined {
  const allowed: AdminSessionRiskReason[] = ["expired", "stale", "disabled_user", "unknown_user"];
  if (value === undefined) return new Set(allowed);
  if (!Array.isArray(value)) return undefined;
  const reasons = new Set<AdminSessionRiskReason>();
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item as AdminSessionRiskReason)) return undefined;
    reasons.add(item as AdminSessionRiskReason);
  }
  return reasons;
}

export function revokeRiskSessions(store: StateStore, staleDays: number, reasons: Set<AdminSessionRiskReason>, input: { dryRun?: boolean; targetSetHash?: string }, nowMs = Date.now()) {
  const dryRun = input.dryRun === true;
  const report = adminSessionRiskReport(store, staleDays, nowMs);
  const matchedSessions = report.sessions.filter((item) => item.reasons.some((reason) => reasons.has(reason)));
  const targets = sessionRevisionTargets(matchedSessions.map((item) => item.session));
  const targetSetHash = operatorTargetSetHash(targets);
  if (!dryRun) assertTargetSet(input.targetSetHash, targetSetHash, "risk-session revocation");
  const matchedSessionIds = new Set(matchedSessions.map((item) => item.session.id));
  if (!dryRun && matchedSessionIds.size > 0) store.state.sessions = store.state.sessions.filter((session) => !matchedSessionIds.has(session.id));
  return {
    generatedAt: nowIso(),
    staleDays,
    dryRun,
    targetSetHash,
    reasons: [...reasons],
    matched: matchedSessionIds.size,
    revoked: dryRun ? 0 : matchedSessionIds.size,
    remainingRiskSessionCount: dryRun ? report.totals.riskSessionCount : adminSessionRiskReport(store, staleDays, nowMs).totals.riskSessionCount,
    sessions: matchedSessions.map((item) => ({ session: item.session, user: item.user, reasons: item.reasons })),
  };
}

export function pruneSessionsForAdmin(store: StateStore, input: AdminSessionPruneBody, nowMs = Date.now()) {
  const dryRun = input.dryRun === true;
  const matchedSessions = store.state.sessions.filter((session) => Date.parse(session.expiresAt) <= nowMs);
  const targetSetHash = operatorTargetSetHash(sessionRevisionTargets(matchedSessions));
  if (!dryRun) assertTargetSet(input.targetSetHash, targetSetHash, "expired-session pruning");
  if (!dryRun && matchedSessions.length > 0) {
    const matchedIds = new Set(matchedSessions.map((session) => session.id));
    store.state.sessions = store.state.sessions.filter((session) => !matchedIds.has(session.id));
  }
  return {
    generatedAt: nowIso(),
    dryRun,
    targetSetHash,
    matched: matchedSessions.length,
    pruned: dryRun ? 0 : matchedSessions.length,
    activeRemaining: store.state.sessions.filter((session) => Date.parse(session.expiresAt) > nowMs).length,
    expiredRemaining: store.state.sessions.filter((session) => Date.parse(session.expiresAt) <= nowMs).length,
    sessions: matchedSessions.map(publicSession),
  };
}

export function prunePasswordResetTokensForAdmin(store: StateStore, input: AdminPasswordResetPruneBody, nowMs = Date.now()) {
  const includeExpired = input.includeExpired ?? true;
  const includeUsed = input.includeUsed ?? true;
  const dryRun = input.dryRun === true;
  const matchedResets = store.state.passwordResetTokens.filter((reset) => {
    if (includeUsed && reset.usedAt) return true;
    return includeExpired && Date.parse(reset.expiresAt) <= nowMs;
  });
  const targetSetHash = operatorTargetSetHash(resetRevisionTargets(matchedResets));
  if (!dryRun) assertTargetSet(input.targetSetHash, targetSetHash, "password-reset pruning");
  if (!dryRun && matchedResets.length > 0) {
    const matchedIds = new Set(matchedResets.map((reset) => reset.id));
    store.state.passwordResetTokens = store.state.passwordResetTokens.filter((reset) => !matchedIds.has(reset.id));
  }
  return {
    generatedAt: nowIso(),
    dryRun,
    targetSetHash,
    includeExpired,
    includeUsed,
    matched: matchedResets.length,
    pruned: dryRun ? 0 : matchedResets.length,
    activeRemaining: store.state.passwordResetTokens.filter((reset) => !reset.usedAt && Date.parse(reset.expiresAt) > nowMs).length,
    expiredRemaining: store.state.passwordResetTokens.filter((reset) => !reset.usedAt && Date.parse(reset.expiresAt) <= nowMs).length,
    usedRemaining: store.state.passwordResetTokens.filter((reset) => Boolean(reset.usedAt)).length,
    resets: matchedResets.map(publicPasswordResetToken),
  };
}

export function userSessionRevocationPlan(store: StateStore, userId: string) {
  const sessions = store.state.sessions.filter((session) => session.userId === userId).sort((left, right) => left.id.localeCompare(right.id));
  return {
    generatedAt: nowIso(),
    userId,
    targetSetHash: operatorTargetSetHash(sessionRevisionTargets(sessions)),
    matched: sessions.length,
    sessions: sessions.map(publicSession),
  };
}

export function revokeUserSessions(store: StateStore, userId: string, targetSetHash: unknown) {
  const plan = userSessionRevocationPlan(store, userId);
  assertTargetSet(targetSetHash, plan.targetSetHash, "user-session revocation");
  const sessionIds = new Set(plan.sessions.map((session) => session.id));
  store.state.sessions = store.state.sessions.filter((session) => !sessionIds.has(session.id));
  return { generatedAt: nowIso(), userId, targetSetHash: plan.targetSetHash, revoked: sessionIds.size, sessions: plan.sessions };
}

export function revokeSingleSession(store: StateStore, session: UserSession, expectedUpdatedAt: unknown) {
  assertExpectedOperatorRevision(session, expectedUpdatedAt, "session");
  const before = publicSession(session);
  store.state.sessions = store.state.sessions.filter((candidate) => candidate.id !== session.id);
  return { ok: true as const, session: before };
}

export function pruneExpiredPasswordResetTokens(store: StateStore, nowMs = Date.now()): void {
  store.state.passwordResetTokens = store.state.passwordResetTokens.filter((reset) => !reset.usedAt && Date.parse(reset.expiresAt) > nowMs);
}

export { publicEmailOutboxMessage, EmailOperatorMutationError };

function assertTargetSet(expected: unknown, currentTargetSetHash: string, operation: string): void {
  if (typeof expected !== "string" || expected.trim() === "") {
    throw new AdminIdentityMutationError(400, "precondition_required", `${operation} requires the targetSetHash returned by a dry run`, { currentTargetSetHash });
  }
  if (expected.trim().toLowerCase() !== currentTargetSetHash) {
    throw new AdminIdentityMutationError(409, "target_set_changed", `The ${operation} target set changed after preview. Run a new dry run and review the current targets.`, {
      expectedTargetSetHash: expected,
      currentTargetSetHash,
    });
  }
}

function sessionRevisionTargets(sessions: Array<Pick<UserSession, "id" | "updatedAt">>): Array<{ id: string; updatedAt: string }> {
  return sessions.map(({ id, updatedAt }) => ({ id, updatedAt })).sort(compareRevisionTargets);
}

function resetRevisionTargets(resets: Array<Pick<PasswordResetToken, "id" | "updatedAt">>): Array<{ id: string; updatedAt: string }> {
  return resets.map(({ id, updatedAt }) => ({ id, updatedAt })).sort(compareRevisionTargets);
}

function compareRevisionTargets(left: { id: string; updatedAt: string }, right: { id: string; updatedAt: string }): number {
  return left.id.localeCompare(right.id) || left.updatedAt.localeCompare(right.updatedAt);
}

function publicIdentityUser(user: User) {
  const { passwordHash: _passwordHash, mfa, scim: _scim, ...safeUser } = user;
  return {
    ...safeUser,
    preferences: { ...defaultUserPreferences(), ...user.preferences },
    ...(mfa ? {
      mfa: {
        totpEnabled: Boolean(mfa.totpSecret && mfa.totpEnabledAt),
        totpPending: Boolean(mfa.totpSecret && mfa.totpPendingAt && !mfa.totpEnabledAt),
        recoveryCodeCount: mfa.recoveryCodeHashes?.length ?? 0,
        enabledAt: mfa.totpEnabledAt,
        lastVerifiedAt: mfa.lastVerifiedAt,
      },
    } : {}),
  };
}

function defaultUserPreferences(): UserPreferences {
  return { theme: "midnight", dice3dEnabled: true, reducedMotion: false, chatNotifications: "mentions" };
}

function normalizeEmail(value: unknown): string | undefined {
  const email = typeof value === "string" ? value.trim().toLowerCase() : undefined;
  if (!email || !email.includes("@") || email.length > 254) return undefined;
  return email;
}

function normalizeDisplayName(value: unknown): string | undefined {
  const displayName = typeof value === "string" ? value.trim() : undefined;
  return displayName && displayName.length <= 80 ? displayName : undefined;
}

function isDisabledUser(user: User): boolean {
  return Boolean(user.disabledAt);
}

function hashOpaqueToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function passwordResetTtlMs(): number {
  const value = Number(process.env.OTTE_PASSWORD_RESET_TTL_MINUTES);
  const minutes = Number.isFinite(value) ? Math.max(5, Math.min(24 * 60, value)) : 60;
  return minutes * 60 * 1000;
}

function passwordResetUrl(token: string, requestedReturnTo: string | undefined): string | undefined {
  const configured = process.env.OTTE_PASSWORD_RESET_URL?.trim();
  const returnTo = configured || sanitizeReturnTo(requestedReturnTo) || (process.env.OTTE_WEB_ORIGIN ? `${process.env.OTTE_WEB_ORIGIN.replace(/\/+$/, "")}/reset-password` : undefined);
  if (!returnTo) return undefined;
  try {
    const url = new URL(returnTo);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizeReturnTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const allowedOrigins = new Set([
      process.env.OTTE_WEB_ORIGIN,
      ...(process.env.OTTE_OIDC_ALLOWED_RETURN_ORIGINS?.split(",") ?? []),
    ].map((origin) => origin?.trim().replace(/\/+$/, "")).filter((origin): origin is string => Boolean(origin)));
    if (isLocalhostUrl(url) || allowedOrigins.has(url.origin)) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function isLocalhostUrl(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

function emailWebhookConfigured(options: EmailDeliveryOptions): boolean {
  return Boolean(options.webhookUrl ?? process.env.OTTE_EMAIL_WEBHOOK_URL?.trim());
}

function createPasswordResetRecords(
  store: StateStore,
  user: User,
  requestedByUserId: string | undefined,
  requestedReturnTo: string | undefined,
  options: EmailDeliveryOptions,
): { reset: PasswordResetToken; email: EmailOutboxMessage; token: string } {
  if (!user.email) throw new AdminIdentityMutationError(400, "invalid_request", "User does not have an email address");
  pruneExpiredPasswordResetTokens(store);
  const token = `opr_${randomBytes(32).toString("base64url")}`;
  const reset = createTimestamped("reset", {
    userId: user.id,
    email: normalizeEmail(user.email)!,
    tokenHash: hashOpaqueToken(token),
    expiresAt: new Date(Date.now() + passwordResetTtlMs()).toISOString(),
    requestedByUserId,
  }) satisfies PasswordResetToken;
  store.state.passwordResetTokens.push(reset);
  const resetUrl = passwordResetUrl(token, requestedReturnTo);
  const email = createTimestamped("email", {
    to: reset.email,
    subject: "Reset your OpenTabletop password",
    text: [
      `A password reset was requested for ${user.displayName}.`,
      resetUrl ? `Open this link to reset your password: ${resetUrl}` : `Use this reset token: ${token}`,
      "If you did not request this, you can ignore this message.",
    ].join("\n\n"),
    status: "pending" as const,
    provider: emailWebhookConfigured(options) ? "webhook" as const : "outbox" as const,
    metadata: { kind: "password_reset", userId: user.id, resetId: reset.id },
  }) satisfies EmailOutboxMessage;
  ensureEmailDeliveryId(email, options.preferredDeliveryId);
  store.state.emailOutbox.push(email);
  return { reset, email, token };
}
