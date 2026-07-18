import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPanel } from "./admin-panel.js";
import type { AdminSnapshot } from "./api.js";

const noop = async () => {};

function renderAdmin(admin: AdminSnapshot, workspaceKey: string): string {
  return renderToStaticMarkup(
    <AdminPanel
      admin={admin}
      campaigns={[]}
      systems={[]}
      organizationMembers={[]}
      currentUserId="usr_admin"
      workspaceKey={workspaceKey}
      status="ready"
      onRefresh={noop}
      onDisableUser={noop}
      onEnableUser={noop}
      onRequireReset={noop}
      onIssueReset={noop}
      onRevokeUserSessions={noop}
      onRevokeSession={noop}
      onRevokeRiskSessions={noop}
      onPruneExpiredPasswordResets={noop}
      onRetryEmail={noop}
      onRetryAllEmails={noop}
      onRetryAiToolCall={noop}
      onFailStaleAiThreads={noop}
      onFailStaleAiToolCalls={noop}
      onRejectStaleAiProposals={noop}
      onCleanupStoredAssetBytes={noop}
      onMigrateStoredAssetBytes={noop}
      onQuarantineAssetIntegrityFailures={noop}
      onPurgeAssetCdnCache={noop}
      onUpdatePluginReview={noop}
      onSyncPluginRegistries={noop}
      onUpdateWorkspaceDefaults={noop}
      onAddOrganizationMember={noop}
      onUpdateOrganizationMember={noop}
      onRemoveOrganizationMember={noop}
      onCreateScimMapping={noop}
      onDeleteScimMapping={noop}
    />
  );
}

describe("coordinated recovery admin surface", () => {
  it("shows exact app-managed snapshot pairing and keeps unpaired legacy backups unrestorable", () => {
    const paired = adminSnapshot();
    paired.storageOperations!.actionRequired = false;
    paired.storageOperations!.actionReasons = [];
    paired.storageOperations!.backups!.latest!.recoveryPoint = {
      manifestFileName: "opentabletop-paired.sqlite.recovery.json",
      manifestStatus: "present",
      paired: true,
      actionRequired: false,
      actionReasons: [],
      manifest: {
        kind: "open-tabletop-recovery-point",
        version: 1,
        createdAt: "2026-07-17T12:00:00.000Z",
        database: { fileName: "opentabletop-paired.sqlite", sizeBytes: 4096, checksumAlgorithm: "sha256", checksum: "a".repeat(64) },
        assetInventory: { provider: "local", assetCount: 2, objectCount: 2, sizeBytes: 512, digestAlgorithm: "sha256", digest: "b".repeat(64) },
        assetSnapshot: { provider: "local", snapshotId: `sha256:${"c".repeat(64)}`, createdAt: "2026-07-17T12:00:00.000Z" },
      },
    };
    const pairedHtml = renderAdmin(paired, "recovery-paired");
    const unpairedHtml = renderAdmin(adminSnapshot(), "recovery-unpaired");

    expect(pairedHtml).toContain("Paired asset snapshot");
    expect(pairedHtml).toContain(`local:sha256:${"c".repeat(64)}`);
    expect(pairedHtml).toContain("exact app-managed asset snapshot as one verified recovery point");
    expect(unpairedHtml).toContain("database-only or unpaired recovery point");
    expect(unpairedHtml).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Restore Backup/);
    expect(unpairedHtml).not.toContain("Restore that provider snapshot separately");
  });

  it("shows bounded hosted metrics and directs failures to the runbook", () => {
    const snapshot = adminSnapshot();
    snapshot.operationsMetrics = operationsMetrics();
    snapshot.retentionOperations = {
      policyVersion: 1,
      generatedAt: "2026-07-15T12:01:00.000Z",
      preservationDefault: true,
      supportedRecordClasses: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"],
      counts: { delivered_emails: 4, delivered_webhooks: 5, maintenance_jobs: 6 },
      totalEligibleTerminalRecords: 15,
      exemptions: ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"],
    };
    const html = renderAdmin(snapshot, "operations-test");

    expect(html).toContain("Hosted Operations");
    expect(html).toContain("privacy-safe dimensions");
    expect(html).toContain("No campaign IDs, user IDs, credentials, or private tabletop content");
    expect(html).toContain("Durable writes failed");
    expect(html).toContain("Recovery work failed");
    expect(html).toContain("Realtime delivery dropped a connection");
    expect(html).toContain("Measured Retention");
    expect(html).toContain("Canonical campaign state, audit logs, active idempotency protection");
    expect(html).toContain("Preview exact impact");
    expect(html).toContain("Delete reviewed batch");
  });
});

function operationsMetrics(): AdminSnapshot["operationsMetrics"] {
  const latencyMs = { count: 1, totalMs: 12, maxMs: 12, buckets: [{ le: 25 as const, count: 1 }, { le: "infinity" as const, count: 1 }] };
  return {
    version: 1,
    enabled: true,
    startedAt: "2026-07-15T12:00:00.000Z",
    generatedAt: "2026-07-15T12:01:00.000Z",
    privacy: { boundedDimensions: true, containsCampaignIds: false, containsUserIds: false, containsCredentials: false, containsPrivateContent: false },
    http: {
      requests: 9,
      errorResponses: 1,
      staleWriteConflicts: 2,
      methods: { GET: 3, POST: 6, PATCH: 0, PUT: 0, DELETE: 0, OTHER: 0 },
      statusClasses: { "2xx": 6, "3xx": 0, "4xx": 2, "5xx": 1 },
      latencyMs,
    },
    realtime: { connectionsOpened: 3, disconnections: 1, revokedConnections: 0, sendFailures: 1, activeConnections: 2, heartbeatGapMs: latencyMs },
    persistence: { attempts: 2, succeeded: 1, failed: 1, latencyMs },
    recovery: {
      backup: { attempts: 1, succeeded: 0, failed: 1, latencyMs },
      restore_drill: { attempts: 1, succeeded: 0, failed: 1, latencyMs },
      restore: { attempts: 0, succeeded: 0, failed: 0, latencyMs: { count: 0, totalMs: 0, maxMs: 0, buckets: [] } },
    },
  };
}

function adminSnapshot(): AdminSnapshot {
  return {
    users: [],
    sessions: [],
    emailOutbox: [],
    audit: {
      count: 0,
      auditLogs: [],
      summary: {
        actionRequired: false,
        actionReasons: [],
        remediationQueue: [],
        byAction: [],
        byTargetType: [],
        byActorType: [],
        byCampaign: [],
        adminActionCount: 0,
        truncated: false,
      },
    },
    jobs: [],
    storageOperations: {
      provider: "sqlite-json-records",
      supported: true,
      backups: {
        directoryName: "backups",
        latest: {
          fileName: "opentabletop-2026-07-13T18-30-00-000Z.sqlite",
          sizeBytes: 4096,
          createdAt: "2026-07-13T18:30:00.000Z",
          recoveryPoint: {
            manifestFileName: "opentabletop-2026-07-13T18-30-00-000Z.sqlite.recovery.json",
            manifestStatus: "present",
            paired: false,
            actionRequired: true,
            actionReasons: ["asset_snapshot_unpaired"],
          },
        },
      },
      actionRequired: true,
      actionReasons: ["asset_snapshot_unpaired"],
    },
  } as unknown as AdminSnapshot;
}
