import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminPanel } from "./admin-panel.js";
import type { AdminSnapshot } from "./api.js";

const noop = async () => {};

describe("coordinated recovery admin surface", () => {
  it("shows exact provider-snapshot pairing and preserves an explicit unpaired warning", () => {
    const html = renderToStaticMarkup(
      <AdminPanel
        admin={adminSnapshot()}
        campaigns={[]}
        systems={[]}
        organizationMembers={[]}
        currentUserId="usr_admin"
        workspaceKey="recovery-test"
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

    expect(html).toContain("Asset snapshot ID");
    expect(html).toContain("Asset snapshot created at");
    expect(html).toContain("The API records and validates the pair; it never creates provider snapshots.");
    expect(html).toContain("database-only or unpaired recovery point");
    expect(html).toContain("Restore that provider snapshot separately");
  });
});

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
