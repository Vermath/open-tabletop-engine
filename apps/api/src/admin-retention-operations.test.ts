import { emptyState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { OperationalRetentionError, applyOperationalRetention, operationalRetentionDiagnostics, planOperationalRetention } from "./admin-retention-operations.js";

const old = "2024-01-01T00:00:00.000Z";
const recent = "2026-07-14T00:00:00.000Z";
const now = Date.parse("2026-07-15T00:00:00.000Z");

describe("operational retention", () => {
  it("measures eligible terminal ledgers while preserving canonical, audit, active, failed and recovery records", () => {
    const state = fixture();
    const diagnostics = operationalRetentionDiagnostics(state, now);
    expect(diagnostics.counts).toEqual({ delivered_emails: 2, delivered_webhooks: 2, maintenance_jobs: 2 });
    const plan = planOperationalRetention(state, { recordClasses: ["maintenance_jobs", "delivered_webhooks", "delivered_emails"], olderThanDays: 30 }, now);
    expect(plan).toMatchObject({ preservationDefault: true, dryRun: true, eligibleCount: 3, selectedCount: 3, remainingCount: 0 });
    expect(plan.selected.map((entry) => `${entry.recordClass}:${entry.id}`)).toEqual(["delivered_emails:email_old", "delivered_webhooks:webhook_old", "maintenance_jobs:job_old"]);
    expect(state.auditLogs).toHaveLength(1);
    expect(state.idempotencyRecords).toHaveLength(1);
    expect(state.campaignArchiveImportOperations).toHaveLength(1);
    expect(state.jobs.some((job) => job.id === "job_failed")).toBe(true);
  });

  it("requires an unchanged exact target set and a recorded reason", () => {
    const state = fixture();
    const input = { recordClasses: ["delivered_emails"] as const, olderThanDays: 30, dryRun: false, reason: "Measured cleanup after verified recovery point." };
    const preview = planOperationalRetention(state, { ...input, dryRun: true }, now);
    state.emailOutbox.push({ id: "email_changed", to: "redacted@example.test", subject: "done", text: "done", status: "delivered", provider: "outbox", sentAt: old, createdAt: old, updatedAt: old });
    expect(() => applyOperationalRetention(state, { ...input, targetSetHash: preview.targetSetHash }, now)).toThrowError(OperationalRetentionError);
    const refreshed = planOperationalRetention(state, { ...input, dryRun: true }, now);
    expect(() => applyOperationalRetention(state, { ...input, targetSetHash: refreshed.targetSetHash, reason: "short" }, now)).toThrow(/10 to 500/);
  });

  it("deletes one bounded batch, reports exact ids, and resumes through a new preview", () => {
    const state = fixture();
    const request = { recordClasses: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] as const, olderThanDays: 30, batchSize: 2 };
    const preview = planOperationalRetention(state, request, now);
    expect(preview).toMatchObject({ eligibleCount: 3, selectedCount: 2, remainingCount: 1 });
    const first = applyOperationalRetention(state, { ...request, dryRun: false, targetSetHash: preview.targetSetHash, reason: "Measured terminal-ledger cleanup after recovery proof." }, now);
    expect(first).toMatchObject({ deletedCount: 2, remainingCount: 1 });
    expect(state.emailOutbox.some((entry) => entry.id === "email_old")).toBe(false);
    expect(state.campaignWebhookDeliveries.some((entry) => entry.id === "webhook_old")).toBe(false);
    expect(state.jobs.some((entry) => entry.id === "job_old")).toBe(true);
    const resumed = planOperationalRetention(state, request, now);
    expect(resumed).toMatchObject({ eligibleCount: 1, selectedCount: 1, remainingCount: 0 });
  });
});

function fixture() {
  const state = emptyState();
  state.emailOutbox.push(
    { id: "email_old", to: "redacted@example.test", subject: "done", text: "done", status: "delivered", provider: "outbox", sentAt: old, createdAt: old, updatedAt: old },
    { id: "email_recent", to: "redacted@example.test", subject: "done", text: "done", status: "delivered", provider: "outbox", sentAt: recent, createdAt: recent, updatedAt: recent },
    { id: "email_failed", to: "redacted@example.test", subject: "failed", text: "failed", status: "failed", provider: "outbox", createdAt: old, updatedAt: old },
  );
  state.campaignWebhookDeliveries.push(
    { id: "webhook_old", campaignId: "camp", webhookId: "hook", eventId: "event_old", eventType: "campaign.updated", occurredAt: old, attempt: 1, status: "delivered", deliveredAt: old, createdAt: old, updatedAt: old },
    { id: "webhook_recent", campaignId: "camp", webhookId: "hook", eventId: "event_recent", eventType: "campaign.updated", occurredAt: recent, attempt: 1, status: "delivered", deliveredAt: recent, createdAt: recent, updatedAt: recent },
    { id: "webhook_failed", campaignId: "camp", webhookId: "hook", eventId: "event_failed", eventType: "campaign.updated", occurredAt: old, attempt: 1, status: "failed", failedAt: old, createdAt: old, updatedAt: old },
  );
  state.jobs.push(
    { id: "job_old", type: "storage.restoreDrill", status: "succeeded", payload: {}, attempts: 1, maxAttempts: 2, queuedAt: old, completedAt: old, logs: [], createdAt: old, updatedAt: old },
    { id: "job_recent", type: "storage.backup", status: "cancelled", payload: {}, attempts: 1, maxAttempts: 2, queuedAt: recent, cancelledAt: recent, logs: [], createdAt: recent, updatedAt: recent },
    { id: "job_failed", type: "storage.backup", status: "failed", payload: {}, attempts: 2, maxAttempts: 3, queuedAt: old, completedAt: old, logs: [], createdAt: old, updatedAt: old },
    { id: "job_archive", type: "campaign.export", status: "succeeded", payload: {}, attempts: 1, maxAttempts: 1, queuedAt: old, completedAt: old, logs: [], createdAt: old, updatedAt: old },
  );
  state.auditLogs.push({ id: "audit_keep", actorUserId: "admin", actorType: "user", action: "test", targetType: "test", createdAt: old, updatedAt: old });
  state.idempotencyRecords.push({ key: "keep", method: "POST", path: "/test", requestHash: "r", authorizationHash: "a", statusCode: 200, responseBody: "{}", createdAt: old, updatedAt: old });
  state.campaignArchiveImportOperations.push({ id: "import_keep", campaignId: "camp", importedByUserId: "admin", mode: "upsert", scope: "all", regenerateIds: false, archiveCampaignId: "camp", archiveVersion: "1.0", archiveChecksum: "sha256:test", manifestChecksum: "sha256:test", status: "applied", inverse: { deleted: {}, restored: {} }, impact: { created: {}, updated: {}, skipped: {} }, createdAt: old, updatedAt: old } as never);
  return state;
}
