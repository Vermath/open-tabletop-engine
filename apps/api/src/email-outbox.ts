import { createHash } from "node:crypto";
import { nowIso, type EmailOutboxMessage } from "@open-tabletop/core";
import { normalizeOperatorDeliveryId, operatorTargetSetHash } from "./operator-mutation.js";
import type { StateStore } from "./store.js";

const OPERATOR_RECEIPTS_METADATA_KEY = "_operatorReceiptsV1";
const OPERATOR_RECEIPT_LIMIT = 32;

export type EmailOperatorOperation = "password_reset_issue" | "retry" | "retry_all";

export interface EmailOperatorReceipt {
  operation: EmailOperatorOperation;
  actorUserId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  deliveryId: string;
  startedAt: string;
  completedAt?: string;
}

export interface EmailDeliveryOptions {
  webhookUrl?: string;
  webhookToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  preferredDeliveryId?: string;
  beforeDispatch?: (message: EmailOutboxMessage) => void | Promise<void>;
}

export interface EmailRetryContext {
  actorUserId: string;
  idempotencyKey: string;
  expectedUpdatedAt?: string;
}

export interface AdminEmailOutboxRetryAllBody {
  dryRun?: boolean;
  status?: "pending" | "failed" | "retryable";
  limit?: number;
  targetSetHash?: string;
}

export interface EmailRetryMessageSummary {
  id: string;
  deliveryId?: string;
  to: string;
  subject: string;
  before: EmailOutboxMessage["status"];
  after: EmailOutboxMessage["status"];
  provider: EmailOutboxMessage["provider"];
  error?: string;
}

export interface EmailRetryAllResult {
  generatedAt: string;
  dryRun: boolean;
  deduplicated: boolean;
  batchDeliveryId?: string;
  targetSetHash: string;
  limit: number;
  statuses: EmailOutboxMessage["status"][];
  matched: number;
  retried: number;
  planned: number;
  delivered: number;
  failed: number;
  skipped: number;
  messages: EmailRetryMessageSummary[];
}

export class EmailOperatorMutationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EmailOperatorMutationError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  response(): Record<string, unknown> {
    return { error: this.code, code: this.code, message: this.message, ...this.details };
  }
}

/**
 * The downstream transport sees the same identifier on every attempt for one
 * logical message. Providers can therefore suppress a duplicate caused by an
 * API or worker crash after dispatch but before the local result is persisted.
 */
export function ensureEmailDeliveryId(message: EmailOutboxMessage, preferredDeliveryId?: string): string {
  const existing = normalizeOperatorDeliveryId(message.deliveryId);
  if (existing) return existing;
  const preferred = normalizeOperatorDeliveryId(preferredDeliveryId);
  const deliveryId = preferred ?? `email_${createHash("sha256").update(message.id).digest("hex").slice(0, 32)}`;
  message.deliveryId = deliveryId;
  return deliveryId;
}

export async function deliverEmailMessage(message: EmailOutboxMessage, options: EmailDeliveryOptions = {}): Promise<void> {
  const webhookUrl = options.webhookUrl ?? emailWebhookUrl();
  if (!webhookUrl) return;
  const deliveryId = ensureEmailDeliveryId(message, options.preferredDeliveryId);
  const attemptedAt = nowIso();
  message.deliveryAttempts = Math.max(0, Math.floor(message.deliveryAttempts ?? 0)) + 1;
  message.lastDeliveryAttemptAt = attemptedAt;
  message.updatedAt = attemptedAt;
  await options.beforeDispatch?.(message);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "Idempotency-Key": deliveryId,
      "X-Open-Tabletop-Delivery-Id": deliveryId,
    };
    const token = options.webhookToken ?? process.env.OTTE_EMAIL_WEBHOOK_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await (options.fetchImpl ?? fetch)(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(publicEmailOutboxMessage(message)),
      signal: AbortSignal.timeout(options.timeoutMs ?? emailWebhookTimeoutMs()),
    });
    if (!response.ok) throw new Error(`Email webhook returned ${response.status}`);
    message.status = "delivered";
    message.sentAt = nowIso();
    message.error = undefined;
  } catch (error) {
    message.status = "failed";
    message.error = emailErrorMessage(error).slice(0, 500);
  }
  message.updatedAt = nowIso();
}

export async function retryEmailOutboxMessage(
  store: StateStore,
  message: EmailOutboxMessage,
  context: EmailRetryContext,
  options: EmailDeliveryOptions = {},
): Promise<{ message: EmailOutboxMessage; deduplicated: boolean }> {
  const keyHash = emailOperatorIdempotencyKeyHash(context.actorUserId, context.idempotencyKey);
  const requestHash = operatorTargetSetHash({ operation: "retry", messageId: message.id });
  const existingReceipts = findEmailOperatorReceipts(store.state.emailOutbox, "retry", context.actorUserId, keyHash);
  if (existingReceipts.length > 0) {
    const existing = existingReceipts[0]!;
    if (existing.message.id !== message.id || existing.receipt.requestHash !== requestHash) throw emailIdempotencyConflict();
    return { message, deduplicated: true };
  }
  if (message.status === "delivered") {
    throw new EmailOperatorMutationError(409, "conflict", "Email message has already been delivered", {
      resourceType: "email_outbox",
      resourceId: message.id,
      currentUpdatedAt: message.updatedAt,
    });
  }
  assertEmailRevision(message, context.expectedUpdatedAt);

  const deliveryId = ensureEmailDeliveryId(message);
  appendEmailOperatorReceipt(message, {
    operation: "retry",
    actorUserId: context.actorUserId,
    idempotencyKeyHash: keyHash,
    requestHash,
    deliveryId,
    startedAt: nowIso(),
  });
  store.save();
  await deliverEmailMessage(message, { ...options, preferredDeliveryId: deliveryId, beforeDispatch: () => store.save() });
  completeEmailOperatorReceipt(message, "retry", context.actorUserId, keyHash);
  store.save();
  return { message, deduplicated: false };
}

export async function retryEmailOutboxMessages(
  store: StateStore,
  body: AdminEmailOutboxRetryAllBody,
  context: EmailRetryContext,
  options: EmailDeliveryOptions = {},
): Promise<EmailRetryAllResult> {
  const dryRun = body.dryRun === true;
  const statuses = normalizeEmailOutboxRetryStatuses(body.status);
  const limit = normalizeEmailOutboxRetryLimit(body.limit);
  const keyHash = emailOperatorIdempotencyKeyHash(context.actorUserId, context.idempotencyKey);
  const requestHash = operatorTargetSetHash({
    operation: "retry_all",
    status: body.status ?? "retryable",
    limit,
    targetSetHash: body.targetSetHash,
  });

  if (!dryRun) {
    const receipts = findEmailOperatorReceipts(store.state.emailOutbox, "retry_all", context.actorUserId, keyHash);
    if (receipts.length > 0) {
      if (receipts.some(({ receipt }) => receipt.requestHash !== requestHash)) throw emailIdempotencyConflict();
      const selected = receipts
        .map(({ message }) => message)
        .sort((left, right) => left.id.localeCompare(right.id));
      return emailRetryAllResult({
        dryRun: false,
        deduplicated: true,
        batchDeliveryId: batchDeliveryId(context.actorUserId, context.idempotencyKey),
        targetSetHash: body.targetSetHash ?? operatorTargetSetHash(emailRevisionTargets(selected)),
        limit,
        statuses,
        matched: selected.length,
        skipped: 0,
        selected,
        beforeStatuses: new Map(selected.map((message) => [message.id, message.status])),
      });
    }
  }

  const retryable = store.state.emailOutbox
    .filter((message) => statuses.includes(message.status))
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  const selected = retryable.slice(0, limit);
  const targetSetHash = operatorTargetSetHash(emailRevisionTargets(selected));
  if (!dryRun) assertEmailTargetSet(body.targetSetHash, targetSetHash);
  const skipped = Math.max(0, retryable.length - selected.length);
  const beforeStatuses = new Map(selected.map((message) => [message.id, message.status]));
  const batchId = dryRun ? undefined : batchDeliveryId(context.actorUserId, context.idempotencyKey);

  if (!dryRun) {
    for (const message of selected) {
      const deliveryId = ensureEmailDeliveryId(message);
      appendEmailOperatorReceipt(message, {
        operation: "retry_all",
        actorUserId: context.actorUserId,
        idempotencyKeyHash: keyHash,
        requestHash,
        deliveryId,
        startedAt: nowIso(),
      });
    }
    // Persist the stable logical identities before any external dispatch.
    store.save();
    for (const message of selected) {
      await deliverEmailMessage(message, { ...options, beforeDispatch: () => store.save() });
      completeEmailOperatorReceipt(message, "retry_all", context.actorUserId, keyHash);
      store.save();
    }
  }

  return emailRetryAllResult({
    dryRun,
    deduplicated: false,
    batchDeliveryId: batchId,
    targetSetHash,
    limit,
    statuses,
    matched: retryable.length,
    skipped,
    selected,
    beforeStatuses,
  });
}

export function publicEmailOutboxMessage(message: EmailOutboxMessage): EmailOutboxMessage {
  const metadata = message.metadata
    ? Object.fromEntries(Object.entries(message.metadata).filter(([key]) => key !== OPERATOR_RECEIPTS_METADATA_KEY))
    : undefined;
  return {
    ...message,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function emailOperatorIdempotencyKeyHash(actorUserId: string, idempotencyKey: string): string {
  return operatorTargetSetHash({ actorUserId, idempotencyKey });
}

export function appendEmailOperatorReceipt(message: EmailOutboxMessage, receipt: EmailOperatorReceipt): void {
  const retained = emailOperatorReceipts(message)
    .filter((candidate) => !(candidate.operation === receipt.operation && candidate.actorUserId === receipt.actorUserId && candidate.idempotencyKeyHash === receipt.idempotencyKeyHash));
  retained.push(receipt);
  writeEmailOperatorReceipts(message, retained.slice(-OPERATOR_RECEIPT_LIMIT));
}

export function completeEmailOperatorReceipt(
  message: EmailOutboxMessage,
  operation: EmailOperatorOperation,
  actorUserId: string,
  idempotencyKeyHash: string,
): void {
  const receipts = emailOperatorReceipts(message);
  const receipt = receipts.find((candidate) => candidate.operation === operation && candidate.actorUserId === actorUserId && candidate.idempotencyKeyHash === idempotencyKeyHash);
  if (receipt) receipt.completedAt = nowIso();
  writeEmailOperatorReceipts(message, receipts);
}

export function findEmailOperatorReceipt(
  message: EmailOutboxMessage,
  operation: EmailOperatorOperation,
  actorUserId: string,
  idempotencyKeyHash: string,
): EmailOperatorReceipt | undefined {
  return emailOperatorReceipts(message).find((candidate) => candidate.operation === operation && candidate.actorUserId === actorUserId && candidate.idempotencyKeyHash === idempotencyKeyHash);
}

export function findEmailOperatorReceipts(
  messages: EmailOutboxMessage[],
  operation: EmailOperatorOperation,
  actorUserId: string,
  idempotencyKeyHash: string,
): Array<{ message: EmailOutboxMessage; receipt: EmailOperatorReceipt }> {
  return messages.flatMap((message) => {
    const receipt = findEmailOperatorReceipt(message, operation, actorUserId, idempotencyKeyHash);
    return receipt ? [{ message, receipt }] : [];
  });
}

export function emailWebhookUrl(): string | undefined {
  return process.env.OTTE_EMAIL_WEBHOOK_URL?.trim() || undefined;
}

export function emailWebhookTimeoutMs(): number {
  const value = Number(process.env.OTTE_EMAIL_WEBHOOK_TIMEOUT_MS);
  return Number.isFinite(value) ? Math.max(500, Math.min(30_000, value)) : 5_000;
}

function emailOperatorReceipts(message: EmailOutboxMessage): EmailOperatorReceipt[] {
  const raw = message.metadata?.[OPERATOR_RECEIPTS_METADATA_KEY];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEmailOperatorReceipt).slice(-OPERATOR_RECEIPT_LIMIT);
  } catch {
    return [];
  }
}

function writeEmailOperatorReceipts(message: EmailOutboxMessage, receipts: EmailOperatorReceipt[]): void {
  message.metadata = {
    ...(message.metadata ?? {}),
    [OPERATOR_RECEIPTS_METADATA_KEY]: JSON.stringify(receipts.slice(-OPERATOR_RECEIPT_LIMIT)),
  };
}

function isEmailOperatorReceipt(value: unknown): value is EmailOperatorReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.operation === "password_reset_issue" || record.operation === "retry" || record.operation === "retry_all")
    && typeof record.actorUserId === "string"
    && typeof record.idempotencyKeyHash === "string"
    && typeof record.requestHash === "string"
    && typeof record.deliveryId === "string"
    && typeof record.startedAt === "string"
    && (record.completedAt === undefined || typeof record.completedAt === "string");
}

function normalizeEmailOutboxRetryStatuses(status: AdminEmailOutboxRetryAllBody["status"]): EmailOutboxMessage["status"][] {
  if (status === "pending") return ["pending"];
  if (status === "failed") return ["failed"];
  return ["pending", "failed"];
}

function normalizeEmailOutboxRetryLimit(value: unknown): number {
  const limit = Number(value ?? 25);
  if (!Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function emailRevisionTargets(messages: EmailOutboxMessage[]): Array<{ id: string; updatedAt: string }> {
  return messages
    .map((message) => ({ id: message.id, updatedAt: message.updatedAt }))
    .sort((left, right) => left.id.localeCompare(right.id) || left.updatedAt.localeCompare(right.updatedAt));
}

function assertEmailTargetSet(expected: unknown, current: string): void {
  if (typeof expected !== "string" || expected.trim() === "") {
    throw new EmailOperatorMutationError(400, "precondition_required", "Email retry execution requires the targetSetHash returned by a dry run", { currentTargetSetHash: current });
  }
  if (expected.trim().toLowerCase() !== current) {
    throw new EmailOperatorMutationError(409, "target_set_changed", "The retryable email target set changed after preview. Run a new dry run before retrying.", {
      expectedTargetSetHash: expected,
      currentTargetSetHash: current,
    });
  }
}

function batchDeliveryId(actorUserId: string, idempotencyKey: string): string {
  return `email_batch_${createHash("sha256").update(`${actorUserId}\0${idempotencyKey}`).digest("hex").slice(0, 32)}`;
}

function emailRetryAllResult(input: {
  dryRun: boolean;
  deduplicated: boolean;
  batchDeliveryId?: string;
  targetSetHash: string;
  limit: number;
  statuses: EmailOutboxMessage["status"][];
  matched: number;
  skipped: number;
  selected: EmailOutboxMessage[];
  beforeStatuses: Map<string, EmailOutboxMessage["status"]>;
}): EmailRetryAllResult {
  return {
    generatedAt: nowIso(),
    dryRun: input.dryRun,
    deduplicated: input.deduplicated,
    batchDeliveryId: input.batchDeliveryId,
    targetSetHash: input.targetSetHash,
    limit: input.limit,
    statuses: input.statuses,
    matched: input.matched,
    retried: input.dryRun ? 0 : input.selected.length,
    planned: input.dryRun ? input.selected.length : 0,
    delivered: input.dryRun ? 0 : input.selected.filter((message) => message.status === "delivered").length,
    failed: input.dryRun ? 0 : input.selected.filter((message) => message.status === "failed").length,
    skipped: input.skipped,
    messages: input.selected.map((message) => ({
      id: message.id,
      deliveryId: message.deliveryId,
      to: message.to,
      subject: message.subject,
      before: input.beforeStatuses.get(message.id) ?? message.status,
      after: message.status,
      provider: message.provider,
      error: message.error,
    })),
  };
}

function emailIdempotencyConflict(): EmailOperatorMutationError {
  return new EmailOperatorMutationError(409, "idempotency_conflict", "Idempotency-Key was already used for a different email operation");
}

function assertEmailRevision(message: EmailOutboxMessage, expectedUpdatedAt: unknown): void {
  if (typeof expectedUpdatedAt !== "string" || expectedUpdatedAt.trim() === "") {
    throw new EmailOperatorMutationError(400, "precondition_required", "Email retry requires expectedUpdatedAt", {
      resourceType: "email_outbox",
      resourceId: message.id,
      currentUpdatedAt: message.updatedAt,
    });
  }
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new EmailOperatorMutationError(400, "invalid_precondition", "Email expectedUpdatedAt must be a valid date-time", {
      resourceType: "email_outbox",
      resourceId: message.id,
      currentUpdatedAt: message.updatedAt,
    });
  }
  if (expectedUpdatedAt !== message.updatedAt) {
    throw new EmailOperatorMutationError(409, "stale_write", "Email message changed after it was loaded. Review the current revision and retry.", {
      resourceType: "email_outbox",
      resourceId: message.id,
      expectedUpdatedAt,
      currentUpdatedAt: message.updatedAt,
      current: { id: message.id, updatedAt: message.updatedAt },
    });
  }
}

function emailErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
