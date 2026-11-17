import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTimestamped,
  seedState,
  type CampaignInvite,
  type PluginReview,
  type SystemInstallation,
  type UserSession,
} from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  SqliteStateStore,
  type SqliteRestoreFaultPhase,
} from "./sqlite-store.js";

const createdDirectories: string[] = [];
const createdStores: SqliteStateStore[] = [];
const crashHelperPath = fileURLToPath(
  new URL("./sqlite-store-crash-helper.ts", import.meta.url),
);

function trackStore(store: SqliteStateStore): SqliteStateStore {
  createdStores.push(store);
  return store;
}

function testStore(
  options: {
    restoreFaultInjector?: (phase: SqliteRestoreFaultPhase) => void;
  } = {},
): { directory: string; path: string; store: SqliteStateStore } {
  const directory = mkdtempSync(join(tmpdir(), "otte-restore-safety-"));
  createdDirectories.push(directory);
  const path = join(directory, "state.sqlite");
  const store = trackStore(
    new SqliteStateStore(path, {
      seedDemo: false,
      ...options,
    }),
  );
  store.state = seedState();
  store.save();
  store.flush();
  return { directory, path, store };
}

afterEach(() => {
  for (const store of createdStores.splice(0).reverse()) {
    try {
      store.close();
    } catch {
      // Cleanup must continue so Windows does not retain handles to temp databases.
    }
  }
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("atomic destructive SQLite restore", () => {
  it("preserves the live security plane and quarantines pre-restore side effects", () => {
    const { path, store } = testStore();
    const campaign = store.state.campaigns[0]!;
    const admin =
      store.state.users.find((user) => user.serverAdmin) ??
      store.state.users[0]!;
    admin.serverAdmin = true;
    admin.passwordHash = "old-password-hash";
    const timestamp = "2026-07-13T12:00:00.000Z";
    store.state.sessions = [
      createTimestamped("sess", {
        userId: admin.id,
        tokenHash: "sha256:revoked-session",
        expiresAt: "2027-07-13T12:00:00.000Z",
        lastSeenAt: timestamp,
      }),
    ];
    store.state.oauthStates = [
      createTimestamped("oauth", {
        provider: "oidc" as const,
        issuer: "https://id.example.test",
        stateHash: "sha256:consumed-state",
        codeVerifier: "consumed-verifier",
        nonceHash: "sha256:consumed-nonce",
        redirectUri: "https://table.example.test/api/v1/auth/oidc/callback",
        expiresAt: "2027-07-13T12:00:00.000Z",
      }),
    ];
    store.state.passwordResetTokens = [
      createTimestamped("reset", {
        userId: admin.id,
        email: admin.email ?? "admin@example.test",
        tokenHash: "sha256:consumed-reset",
        expiresAt: "2027-07-13T12:00:00.000Z",
      }),
    ];
    const invite: CampaignInvite = createTimestamped("inv", {
      campaignId: campaign.id,
      tokenHash: "sha256:revoked-invite",
      role: "player" as const,
      invitedByUserId: admin.id,
      expiresAt: "2027-07-13T12:00:00.000Z",
    });
    store.state.invites.push(invite);
    const email = createTimestamped("email", {
      to: admin.email ?? "admin@example.test",
      subject: "Old queued mail",
      text: "Must not be redelivered after restore",
      status: "pending" as const,
      provider: "webhook" as const,
    });
    store.state.emailOutbox.push(email);
    const webhook = createTimestamped("wh", {
      campaignId: campaign.id,
      name: "Old outbound hook",
      url: "https://hooks.example.test/table",
      eventTypes: ["campaign.updated" as const],
      enabled: true,
      signingSecret: "restore-test-signing-secret",
      secretHint: "cret",
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
    });
    store.state.campaignWebhooks.push(webhook);
    const delivery = createTimestamped("whd", {
      campaignId: campaign.id,
      webhookId: webhook.id,
      eventId: "evt_restore_test",
      eventType: "campaign.updated" as const,
      occurredAt: timestamp,
      attempt: 0,
      status: "queued" as const,
    });
    store.state.campaignWebhookDeliveries.push(delivery);
    const job = createTimestamped("job", {
      type: "campaign.import" as const,
      status: "queued" as const,
      payload: { campaignId: campaign.id },
      attempts: 0,
      maxAttempts: 3,
      queuedAt: timestamp,
      createdByUserId: admin.id,
      updatedByUserId: admin.id,
      logs: [
        {
          at: timestamp,
          level: "info" as const,
          message: "Queued before recovery point",
        },
      ],
    });
    store.state.jobs.push(job);
    store.state.idempotencyRecords.push({
      key: "old-side-effect",
      method: "POST",
      path: `/api/v1/campaigns/${campaign.id}/scenes`,
      userId: admin.id,
      requestHash: "old-request",
      authorizationHash: "old-authorization",
      statusCode: 201,
      responseBody: "{}",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const pluginReview: PluginReview = createTimestamped("plugrev", {
      reviewKey: "restore-safety-plugin@1.0.0",
      pluginId: "restore-safety-plugin",
      packageId: "restore-safety-package",
      version: "1.0.0",
      checksum: "sha256:backup-review",
      sourceType: "local" as const,
      status: "pending" as const,
    });
    store.state.pluginReviews.push(pluginReview);
    const systemInstallation: SystemInstallation = createTimestamped(
      "sysinst",
      {
        manifest: {
          id: "restore-safety-system",
          name: "Restore Safety System",
          version: "1.0.0",
          compatibleCore: "*",
          entrypoints: { server: "dist/server.js" },
          schemas: { actor: "schemas/actor.json", item: "schemas/item.json" },
          permissions: [],
          capabilities: [],
        },
        installedByUserId: admin.id,
        authorizedByCampaignId: campaign.id,
        source: "api" as const,
      },
    );
    store.state.systemInstallations.push(systemInstallation);
    store.save();
    store.flush();
    const backup = store.createBackup({ reason: "security fence baseline" });

    admin.passwordHash = "current-password-hash";
    store.state.sessions = [
      createTimestamped("sess", {
        userId: admin.id,
        tokenHash: "sha256:current-admin-session",
        expiresAt: "2027-07-13T12:00:00.000Z",
        lastSeenAt: timestamp,
      }),
    ];
    store.state.oauthStates = [];
    store.state.passwordResetTokens = [];
    invite.revokedAt = "2026-07-13T12:05:00.000Z";
    invite.updatedAt = invite.revokedAt;
    campaign.name = "State written after recovery point";
    pluginReview.status = "approved";
    pluginReview.checksum = "sha256:current-reviewed-package";
    pluginReview.notes = "Approved after the recovery point";
    pluginReview.reviewedByUserId = admin.id;
    pluginReview.reviewedAt = "2026-07-13T12:06:00.000Z";
    pluginReview.updatedAt = pluginReview.reviewedAt;
    systemInstallation.manifest.version = "2.0.0";
    systemInstallation.updatedAt = "2026-07-13T12:06:00.000Z";
    store.save();
    store.flush();

    const expectedStateRevision =
      store.storageOperations().restoreStateRevision;
    const restored = store.restoreBackup({
      backupFileName: backup.fileName,
      expectedStateRevision,
      recoveryAdminUserId: admin.id,
    });

    expect(restored).toMatchObject({
      status: "passed",
      reconciliation: {
        policy: "preserve-live-security-plane",
        sessionsPreserved: 1,
        oauthStatesCleared: 1,
        passwordResetTokensCleared: 1,
        pendingEmailsQuarantined: 1,
        webhooksDisabled: 1,
        pendingWebhookDeliveriesQuarantined: 1,
        jobsCancelled: 1,
      },
    });
    expect(
      store.state.campaigns.find((item) => item.id === campaign.id)?.name,
    ).not.toBe("State written after recovery point");
    expect(
      store.state.users.find((user) => user.id === admin.id)?.passwordHash,
    ).toBe("current-password-hash");
    expect(store.state.sessions.map((session) => session.tokenHash)).toEqual([
      "sha256:current-admin-session",
    ]);
    expect(store.state.oauthStates).toEqual([]);
    expect(store.state.passwordResetTokens).toEqual([]);
    expect(
      store.state.invites.find((item) => item.id === invite.id)?.revokedAt,
    ).toBe("2026-07-13T12:05:00.000Z");
    expect(
      store.state.emailOutbox.find((item) => item.id === email.id),
    ).toMatchObject({
      status: "failed",
      error: "quarantined_by_storage_restore",
    });
    expect(
      store.state.campaignWebhooks.find((item) => item.id === webhook.id)
        ?.enabled,
    ).toBe(false);
    expect(
      store.state.campaignWebhookDeliveries.find(
        (item) => item.id === delivery.id,
      ),
    ).toMatchObject({
      status: "failed",
      errorCode: "quarantined_by_storage_restore",
    });
    expect(store.state.jobs.find((item) => item.id === job.id)).toMatchObject({
      status: "cancelled",
      error: "quarantined_by_storage_restore",
    });
    expect(store.state.idempotencyRecords).toEqual([]);
    expect(
      store.state.pluginReviews.find((review) => review.id === pluginReview.id),
    ).toMatchObject({
      status: "approved",
      checksum: "sha256:current-reviewed-package",
      notes: "Approved after the recovery point",
    });
    expect(
      store.state.systemInstallations.find(
        (installation) => installation.id === systemInstallation.id,
      )?.manifest.version,
    ).toBe("2.0.0");

    store.close();
    const reopened = trackStore(
      new SqliteStateStore(path, { seedDemo: false }),
    );
    expect(
      reopened.state.users.find((user) => user.id === admin.id)?.passwordHash,
    ).toBe("current-password-hash");
    expect(reopened.state.sessions.map((session) => session.tokenHash)).toEqual(
      ["sha256:current-admin-session"],
    );
    expect(reopened.state.jobs.find((item) => item.id === job.id)?.status).toBe(
      "cancelled",
    );
    expect(
      reopened.state.pluginReviews.find(
        (review) => review.id === pluginReview.id,
      )?.status,
    ).toBe("approved");
    expect(
      reopened.state.systemInstallations.find(
        (installation) => installation.id === systemInstallation.id,
      )?.manifest.version,
    ).toBe("2.0.0");
    reopened.close();
  });

  it("rejects a stale confirmation without touching live state", () => {
    const { store } = testStore();
    const backup = store.createBackup();
    const staleRevision = store.storageOperations().restoreStateRevision;
    store.state.campaigns[0]!.name = "Concurrent write that must survive";
    store.save();
    store.flush();

    expect(
      store.restoreBackup({
        backupFileName: backup.fileName,
        expectedStateRevision: staleRevision,
      }),
    ).toMatchObject({
      status: "failed",
      actionReasons: ["restore_state_revision_mismatch"],
    });
    expect(store.state.campaigns[0]!.name).toBe(
      "Concurrent write that must survive",
    );
    store.close();
  });

  it("uses a canonical restore revision that ignores session telemetry but retains session security fields", () => {
    const { store } = testStore();
    const user = store.state.users[0]!;
    const session: UserSession = createTimestamped("sess", {
      userId: user.id,
      tokenHash: "sha256:security-token",
      activeOrganizationId: store.state.organizations[0]?.id,
      expiresAt: "2027-07-13T12:00:00.000Z",
      lastSeenAt: "2026-07-13T12:00:00.000Z",
    });
    store.state.sessions = [session];
    const baseline = store.storageOperations().restoreStateRevision;

    session.lastSeenAt = "2026-07-13T12:01:00.000Z";
    session.updatedAt = "2026-07-13T12:01:00.000Z";
    expect(store.storageOperations().restoreStateRevision).toBe(baseline);

    session.expiresAt = "2027-07-13T12:02:00.000Z";
    expect(store.storageOperations().restoreStateRevision).not.toBe(baseline);
    const expiryRevision = store.storageOperations().restoreStateRevision;
    session.tokenHash = "sha256:rotated-security-token";
    expect(store.storageOperations().restoreStateRevision).not.toBe(
      expiryRevision,
    );
  });

  it("rolls the original live file back after every injected swap failure", () => {
    const phases: SqliteRestoreFaultPhase[] = [
      "after_intent_recorded",
      "after_stage",
      "after_live_renamed",
      "after_candidate_promoted",
      "after_candidate_open",
      "after_candidate_migrate",
      "after_candidate_load",
      "after_reconciliation",
    ];
    for (const faultPhase of phases) {
      const { directory, path, store } = testStore({
        restoreFaultInjector(phase) {
          if (phase === faultPhase) throw new Error(`injected:${phase}`);
        },
      });
      const backup = store.createBackup();
      store.state.campaigns[0]!.name = `Live state for ${faultPhase}`;
      store.save();
      store.flush();
      const revision = store.storageOperations().restoreStateRevision;

      expect(
        store.restoreBackup({
          backupFileName: backup.fileName,
          expectedStateRevision: revision,
          recoveryAdminUserId: store.state.users[0]!.id,
        }),
      ).toMatchObject({ status: "failed", error: `injected:${faultPhase}` });
      expect(store.state.campaigns[0]!.name).toBe(
        `Live state for ${faultPhase}`,
      );
      expect(
        readdirSync(directory).filter(
          (name) =>
            name.includes(".restore-") &&
            (name.endsWith(".stage") || name.endsWith(".rollback")),
        ),
      ).toEqual([]);

      store.close();
      const reopened = trackStore(
        new SqliteStateStore(path, { seedDemo: false }),
      );
      expect(reopened.state.campaigns[0]!.name).toBe(
        `Live state for ${faultPhase}`,
      );
      reopened.close();
    }
  });

  it.each([
    "after_intent_recorded",
    "after_stage",
    "after_live_renamed",
    "after_candidate_promoted",
    "after_candidate_open",
    "after_candidate_migrate",
    "after_candidate_load",
    "after_reconciliation",
    "after_rollback_recorded",
  ] satisfies SqliteRestoreFaultPhase[])(
    "recovers the original live database after process death at %s",
    (faultPhase) => {
      const { directory, path, store } = testStore();
      const backup = store.createBackup();
      const liveName = `Live state surviving process death at ${faultPhase}`;
      store.state.campaigns[0]!.name = liveName;
      store.save();
      store.flush();
      const revision = store.storageOperations().restoreStateRevision;
      const recoveryAdminUserId = store.state.users[0]!.id;
      store.close();

      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          crashHelperPath,
          path,
          backup.fileName,
          revision,
          faultPhase,
          recoveryAdminUserId,
        ],
        { cwd: dirname(crashHelperPath), encoding: "utf8", timeout: 30_000 },
      );
      expect(child.error).toBeUndefined();
      expect(child.status, `${child.stdout}\n${child.stderr}`).toBe(86);
      expect(
        readdirSync(directory).some((name) =>
          name.includes(".restore-intent."),
        ),
      ).toBe(true);

      const reopened = trackStore(
        new SqliteStateStore(path, { seedDemo: false }),
      );
      expect(reopened.state.campaigns[0]!.name).toBe(liveName);
      expect(
        readdirSync(directory).filter(
          (name) =>
            name.includes(".restore-") && !name.endsWith(".recovery.json"),
        ),
      ).toEqual([]);
    },
    45_000,
  );

  it("finishes a journal-committed restore after process death before rollback cleanup", () => {
    const { directory, path, store } = testStore();
    const backupCampaignName = store.state.campaigns[0]!.name;
    const backup = store.createBackup();
    const admin = store.state.users[0]!;
    store.state.campaigns[0]!.name =
      "Live state replaced by committed recovery point";
    admin.passwordHash = "live-security-hash";
    store.save();
    store.flush();
    const revision = store.storageOperations().restoreStateRevision;
    store.close();

    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        crashHelperPath,
        path,
        backup.fileName,
        revision,
        "after_commit_recorded",
        admin.id,
      ],
      { cwd: dirname(crashHelperPath), encoding: "utf8", timeout: 30_000 },
    );
    expect(child.error).toBeUndefined();
    expect(child.status, `${child.stdout}\n${child.stderr}`).toBe(86);

    const reopened = trackStore(
      new SqliteStateStore(path, { seedDemo: false }),
    );
    expect(reopened.state.campaigns[0]!.name).toBe(backupCampaignName);
    expect(
      reopened.state.users.find((user) => user.id === admin.id)?.passwordHash,
    ).toBe("live-security-hash");
    expect(
      readdirSync(directory).filter(
        (name) =>
          name.includes(".restore-") && !name.endsWith(".recovery.json"),
      ),
    ).toEqual([]);
  }, 45_000);
});
