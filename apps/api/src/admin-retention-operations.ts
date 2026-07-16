import { createHash } from "node:crypto";
import type { EngineState } from "@open-tabletop/core";

export const operationalRetentionRecordClasses = ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] as const;
export type OperationalRetentionRecordClass = (typeof operationalRetentionRecordClasses)[number];

export interface OperationalRetentionRequest {
  recordClasses?: readonly OperationalRetentionRecordClass[];
  olderThanDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  targetSetHash?: string;
  reason?: string;
}

export interface OperationalRetentionCandidate {
  recordClass: OperationalRetentionRecordClass;
  id: string;
  completedAt: string;
}

export interface OperationalRetentionPlan {
  policyVersion: 1;
  preservationDefault: true;
  dryRun: boolean;
  cutoffAt: string;
  olderThanDays: number;
  recordClasses: OperationalRetentionRecordClass[];
  batchSize: number;
  eligibleCount: number;
  selectedCount: number;
  remainingCount: number;
  targetSetHash: string;
  selected: OperationalRetentionCandidate[];
  counts: Record<OperationalRetentionRecordClass, number>;
  exemptions: readonly ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"];
}

export interface OperationalRetentionResult extends OperationalRetentionPlan {
  deletedCount: number;
  reason?: string;
}

export class OperationalRetentionError extends Error {
  constructor(public readonly code: "invalid_request" | "target_set_changed", message: string) {
    super(message);
    this.name = "OperationalRetentionError";
  }
}

const maintenanceJobTypes = new Set(["asset.storage.cleanup", "asset.storage.migrate", "storage.backup", "storage.restoreDrill"]);

export function operationalRetentionDiagnostics(state: EngineState, nowMs = Date.now()) {
  const counts = {
    delivered_emails: state.emailOutbox.filter((entry) => entry.status === "delivered").length,
    delivered_webhooks: state.campaignWebhookDeliveries.filter((entry) => entry.status === "delivered").length,
    maintenance_jobs: state.jobs.filter((entry) => maintenanceJobTypes.has(entry.type) && (entry.status === "succeeded" || entry.status === "cancelled")).length,
  } satisfies Record<OperationalRetentionRecordClass, number>;
  return {
    policyVersion: 1 as const,
    generatedAt: new Date(nowMs).toISOString(),
    preservationDefault: true as const,
    supportedRecordClasses: [...operationalRetentionRecordClasses],
    counts,
    totalEligibleTerminalRecords: Object.values(counts).reduce((total, count) => total + count, 0),
    exemptions: ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"] as const,
  };
}

export function planOperationalRetention(state: EngineState, request: OperationalRetentionRequest, nowMs = Date.now()): OperationalRetentionPlan {
  const olderThanDays = integerInRange(request.olderThanDays, 1, 3_650, "olderThanDays");
  const batchSize = request.batchSize === undefined ? 100 : integerInRange(request.batchSize, 1, 1_000, "batchSize");
  const recordClasses = normalizeRecordClasses(request.recordClasses);
  const cutoffAt = new Date(nowMs - olderThanDays * 86_400_000).toISOString();
  const candidates = eligibleCandidates(state, new Set(recordClasses), Date.parse(cutoffAt));
  const targetSetHash = hashCandidates(candidates);
  const selected = candidates.slice(0, batchSize);
  const counts = Object.fromEntries(operationalRetentionRecordClasses.map((recordClass) => [recordClass, candidates.filter((candidate) => candidate.recordClass === recordClass).length])) as Record<OperationalRetentionRecordClass, number>;
  return {
    policyVersion: 1,
    preservationDefault: true,
    dryRun: request.dryRun !== false,
    cutoffAt,
    olderThanDays,
    recordClasses,
    batchSize,
    eligibleCount: candidates.length,
    selectedCount: selected.length,
    remainingCount: Math.max(0, candidates.length - selected.length),
    targetSetHash,
    selected,
    counts,
    exemptions: ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"],
  };
}

export function applyOperationalRetention(state: EngineState, request: OperationalRetentionRequest, nowMs = Date.now()): OperationalRetentionResult {
  const plan = planOperationalRetention(state, request, nowMs);
  if (plan.dryRun) return { ...plan, deletedCount: 0 };
  const reason = normalizedReason(request.reason);
  if (!request.targetSetHash || request.targetSetHash !== plan.targetSetHash) {
    throw new OperationalRetentionError("target_set_changed", "Retention target set changed; run a new dry run before deleting records.");
  }
  const selected = new Set(plan.selected.map((candidate) => `${candidate.recordClass}:${candidate.id}`));
  state.emailOutbox = state.emailOutbox.filter((entry) => !selected.has(`delivered_emails:${entry.id}`));
  state.campaignWebhookDeliveries = state.campaignWebhookDeliveries.filter((entry) => !selected.has(`delivered_webhooks:${entry.id}`));
  state.jobs = state.jobs.filter((entry) => !selected.has(`maintenance_jobs:${entry.id}`));
  return { ...plan, deletedCount: plan.selectedCount, reason };
}

function eligibleCandidates(state: EngineState, classes: Set<OperationalRetentionRecordClass>, cutoffMs: number): OperationalRetentionCandidate[] {
  const candidates: OperationalRetentionCandidate[] = [];
  if (classes.has("delivered_emails")) {
    for (const entry of state.emailOutbox) {
      const completedAt = entry.sentAt ?? entry.updatedAt;
      if (entry.status === "delivered" && isBefore(completedAt, cutoffMs)) candidates.push({ recordClass: "delivered_emails", id: entry.id, completedAt });
    }
  }
  if (classes.has("delivered_webhooks")) {
    for (const entry of state.campaignWebhookDeliveries) {
      const completedAt = entry.deliveredAt ?? entry.updatedAt;
      if (entry.status === "delivered" && isBefore(completedAt, cutoffMs)) candidates.push({ recordClass: "delivered_webhooks", id: entry.id, completedAt });
    }
  }
  if (classes.has("maintenance_jobs")) {
    for (const entry of state.jobs) {
      const completedAt = entry.completedAt ?? entry.cancelledAt ?? entry.updatedAt;
      if (maintenanceJobTypes.has(entry.type) && (entry.status === "succeeded" || entry.status === "cancelled") && isBefore(completedAt, cutoffMs)) {
        candidates.push({ recordClass: "maintenance_jobs", id: entry.id, completedAt });
      }
    }
  }
  return candidates.sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.recordClass.localeCompare(right.recordClass) || left.id.localeCompare(right.id));
}

function normalizeRecordClasses(value: readonly OperationalRetentionRecordClass[] | undefined): OperationalRetentionRecordClass[] {
  if (!Array.isArray(value) || value.length === 0) throw new OperationalRetentionError("invalid_request", "recordClasses must name at least one supported operational record class.");
  const unique = [...new Set(value)];
  if (unique.some((entry) => !operationalRetentionRecordClasses.includes(entry))) throw new OperationalRetentionError("invalid_request", "recordClasses contains an unsupported record class.");
  return unique.sort();
}

function integerInRange(value: number | undefined, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || value! < minimum || value! > maximum) throw new OperationalRetentionError("invalid_request", `${field} must be an integer from ${minimum} to ${maximum}.`);
  return value!;
}

function normalizedReason(value: string | undefined): string {
  const reason = value?.trim();
  if (!reason || reason.length < 10 || reason.length > 500) throw new OperationalRetentionError("invalid_request", "reason must contain 10 to 500 characters for a retention execution.");
  return reason;
}

function hashCandidates(candidates: OperationalRetentionCandidate[]): string {
  return createHash("sha256").update(JSON.stringify(candidates.map(({ recordClass, id, completedAt }) => [recordClass, id, completedAt]))).digest("hex");
}

function isBefore(value: string, cutoffMs: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < cutoffMs;
}
