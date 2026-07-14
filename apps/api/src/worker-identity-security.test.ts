import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AiProvider } from "@open-tabletop/ai-core";
import { makeArchive } from "@open-tabletop/core";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";
import {
  activeWorkerLeaseError,
  authenticateWorkerPrincipal,
  expectedWorkerDispatch,
  workerDispatchMatches,
  workerIdentityRuntimePosture,
  workerIdempotencyAuthorizationHash,
  workerLeaseRevisionFromHeaders,
  type WorkerPrincipal,
} from "./worker-identity.js";
import type { WorkerJobRecord } from "@open-tabletop/core";

const envKeys = [
  "NODE_ENV",
  "OTTE_ADMIN_USER_IDS",
  "OTTE_WORKER_PROFILE_ENABLED",
  "OTTE_WORKER_TOKEN_HASHES",
  "OTTE_ASSET_URL_SIGNING_SECRET",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function workerHash(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function configureWorker(token = "worker-secret", workerId = "worker-a"): void {
  process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
  process.env.OTTE_WORKER_PROFILE_ENABLED = "true";
  process.env.OTTE_WORKER_TOKEN_HASHES = `${workerId}=${workerHash(token)}`;
}

function workerHeaders(
  token = "worker-secret",
  workerId = "worker-a",
  jobId?: string,
): Record<string, string> {
  return {
    authorization: `Worker ${token}`,
    "x-otte-worker-id": workerId,
    ...(jobId
      ? {
          "x-otte-worker-job-id": jobId,
          "x-otte-worker-lease-revision": "1",
          "idempotency-key": `worker-${jobId}`,
        }
      : {}),
  };
}

function job(overrides: Partial<WorkerJobRecord> = {}): WorkerJobRecord {
  const now = new Date().toISOString();
  return {
    id: "job-a",
    type: "campaign.export",
    status: "running",
    payload: { campaignId: "camp_demo" },
    attempts: 1,
    maxAttempts: 3,
    queuedAt: now,
    startedAt: now,
    leasedBy: "worker-a",
    leaseRequestId: "lease-request-a",
    leaseRequestHash: "lease-request-hash-a",
    leaseRevision: 1,
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    lastHeartbeatAt: now,
    createdByUserId: "usr_demo_gm",
    logs: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function testStorageBackupSummary(fileName: string) {
  return {
    fileName,
    sizeBytes: 128,
    createdAt: new Date().toISOString(),
    recoveryPoint: {
      manifestFileName: `${fileName}.recovery.json`,
      manifestStatus: "present" as const,
      paired: true,
      actionRequired: false,
      actionReasons: [] as string[],
    },
  };
}

class WorkerSecurityTestStore extends MemoryStateStore {
  readiness() {
    return { ok: true };
  }

  storageOperations() {
    return {
      provider: "test-sqlite",
      supported: true,
      actionRequired: false,
      actionReasons: [] as string[],
    };
  }

  createBackup(options?: { reason?: string }) {
    const backup = testStorageBackupSummary("worker-test.sqlite");
    return {
      status: "created",
      ...backup,
      reason: options?.reason,
    };
  }

  runRestoreDrill(options?: { backupFileName?: string }) {
    return {
      status: "passed",
      checkedAt: new Date().toISOString(),
      backup: testStorageBackupSummary(
        options?.backupFileName ?? "worker-test.sqlite",
      ),
      actionRequired: false,
      actionReasons: [] as string[],
    };
  }

  restoreBackup(options: { backupFileName: string; reason?: string }) {
    return {
      status: "passed",
      checkedAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
      backup: testStorageBackupSummary(options.backupFileName),
      reason: options.reason,
      actionRequired: false,
      actionReasons: [] as string[],
    };
  }
}

const workerTestAiProvider: AiProvider = {
  id: "worker-test-ai",
  label: "Worker security test provider",
  async *stream() {
    yield {
      type: "message.completed" as const,
      content: JSON.stringify({
        playerRecap: "The party secured the vault.",
        gmRecap: "The vault remains unstable.",
        timelineEvents: [],
        unresolvedHooks: [],
        prepSuggestions: [],
      }),
    };
  },
};

describe("scoped worker identity", () => {
  it("supports safe rotation with multiple hashes for one stable identity and rejects identity confusion", () => {
    process.env.OTTE_WORKER_TOKEN_HASHES = [
      `worker-a=${workerHash("new-secret")}`,
      `worker-a=${workerHash("old-secret")}`,
      `worker-b=${workerHash("other-secret")}`,
    ].join(",");

    expect(authenticateWorkerPrincipal(workerHeaders("new-secret"))).toEqual({
      ok: true,
      principal: { workerId: "worker-a" },
    });
    expect(authenticateWorkerPrincipal(workerHeaders("old-secret"))).toEqual({
      ok: true,
      principal: { workerId: "worker-a" },
    });
    expect(
      authenticateWorkerPrincipal(workerHeaders("new-secret", "worker-b")),
    ).toMatchObject({ ok: false, statusCode: 403 });
    expect(
      authenticateWorkerPrincipal(workerHeaders("unknown-secret")),
    ).toMatchObject({ ok: false, statusCode: 403 });
    expect(JSON.stringify(workerIdentityRuntimePosture())).not.toMatch(
      /new-secret|old-secret|other-secret|sha256:[a-f0-9]{64}/,
    );
  });

  it("requires an active exact lease and exact operation/resource binding", () => {
    configureWorker();
    const principal: WorkerPrincipal = { workerId: "worker-a" };
    const active = job();
    expect(
      activeWorkerLeaseError(active, principal, active.id, 1),
    ).toBeUndefined();
    expect(activeWorkerLeaseError(active, principal, undefined)).toBeDefined();
    expect(
      activeWorkerLeaseError(active, principal, active.id, undefined),
    ).toBeDefined();
    expect(
      activeWorkerLeaseError(active, principal, active.id, 2),
    ).toBeDefined();
    expect(
      activeWorkerLeaseError(active, { workerId: "worker-b" }, active.id, 1),
    ).toBeDefined();
    expect(
      activeWorkerLeaseError(
        { ...active, leaseExpiresAt: new Date(Date.now() - 1).toISOString() },
        principal,
        active.id,
        1,
      ),
    ).toBeDefined();
    expect(
      activeWorkerLeaseError(
        { ...active, status: "cancelled" },
        principal,
        active.id,
        1,
      ),
    ).toBeDefined();
    expect(
      workerLeaseRevisionFromHeaders({ "x-otte-worker-lease-revision": "1" }),
    ).toBe(1);
    expect(
      workerLeaseRevisionFromHeaders({ "x-otte-worker-lease-revision": "1.5" }),
    ).toBeUndefined();
    expect(
      workerIdempotencyAuthorizationHash(
        workerHeaders("worker-secret", "worker-a"),
      ),
    ).toMatchObject({
      workerId: "worker-a",
      authorizationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(
      workerDispatchMatches(active, {
        method: "GET",
        path: "/api/v1/campaigns/camp_demo/export",
      }),
    ).toBe(true);
    expect(
      workerDispatchMatches(active, {
        method: "GET",
        path: "/api/v1/campaigns/camp_other/export",
      }),
    ).toBe(false);
    expect(
      workerDispatchMatches(active, {
        method: "POST",
        path: "/api/v1/campaigns/camp_demo/export",
        body: {},
      }),
    ).toBe(false);
  });

  it("defines an exact request for every supported dispatch class", () => {
    const importRevision = "2026-07-14T12:00:00.000Z";
    const jobs = [
      job({
        id: "export",
        type: "campaign.export",
        payload: { campaignId: "camp_demo" },
      }),
      job({
        id: "import",
        type: "campaign.import",
        payload: {
          archive: { format: "ottx" },
          mode: "upsert",
          expectedUpdatedAt: importRevision,
        },
      }),
      job({
        id: "migrate",
        type: "asset.storage.migrate",
        payload: {
          campaignId: "camp_demo",
          dryRun: false,
          expectedTargetSetHash: `sha256:${"a".repeat(64)}`,
        },
      }),
      job({
        id: "cleanup",
        type: "asset.storage.cleanup",
        payload: {
          campaignId: "camp_demo",
          dryRun: false,
          expectedTargetSetHash: `sha256:${"b".repeat(64)}`,
          includeExpired: true,
        },
      }),
      job({
        id: "backup",
        type: "storage.backup",
        payload: { reason: "scheduled" },
      }),
      job({
        id: "drill",
        type: "storage.restoreDrill",
        payload: { backupFileName: "backup.sqlite" },
      }),
      job({
        id: "memory",
        type: "ai.memory.extract",
        payload: { campaignId: "camp_demo", sourceText: "Fact" },
      }),
      job({
        id: "recap",
        type: "ai.session.recap",
        payload: { campaignId: "camp_demo", transcript: "Transcript" },
      }),
      job({
        id: "report",
        type: "report.bundle",
        payload: { campaignId: "camp_demo" },
      }),
    ];
    expect(jobs.map(expectedWorkerDispatch)).toEqual([
      { method: "GET", path: "/api/v1/campaigns/camp_demo/export" },
      {
        method: "POST",
        path: "/api/v1/import/campaign",
        body: {
          archive: { format: "ottx" },
          mode: "upsert",
          expectedUpdatedAt: importRevision,
        },
      },
      {
        method: "POST",
        path: "/api/v1/admin/assets/migrate",
        body: {
          campaignId: "camp_demo",
          dryRun: false,
          expectedTargetSetHash: `sha256:${"a".repeat(64)}`,
        },
      },
      {
        method: "POST",
        path: "/api/v1/admin/assets/cleanup",
        body: {
          campaignId: "camp_demo",
          dryRun: false,
          expectedTargetSetHash: `sha256:${"b".repeat(64)}`,
          includeExpired: true,
        },
      },
      {
        method: "POST",
        path: "/api/v1/admin/storage/backup",
        body: { reason: "scheduled" },
      },
      {
        method: "POST",
        path: "/api/v1/admin/storage/restore-drill",
        body: { backupFileName: "backup.sqlite" },
      },
      {
        method: "POST",
        path: "/api/v1/campaigns/camp_demo/ai/memory/extract",
        body: { sourceText: "Fact" },
      },
      {
        method: "POST",
        path: "/api/v1/campaigns/camp_demo/ai/session-recap",
        body: { transcript: "Transcript" },
      },
      {
        method: "GET",
        path: "/api/v1/campaigns/camp_demo/dogfood-report-bundle",
      },
    ]);
    expect(
      expectedWorkerDispatch(
        job({
          id: "invalid-asset-plan",
          type: "asset.storage.cleanup",
          payload: { dryRun: false, expectedTargetSetHash: "invalid" },
        }),
      ),
    ).toBeUndefined();
    expect(
      expectedWorkerDispatch(
        job({
          id: "missing-import-revision",
          type: "campaign.import",
          payload: { archive: { format: "ottx" }, mode: "upsert" },
        }),
      ),
    ).toBeUndefined();
    expect(
      expectedWorkerDispatch(
        job({
          id: "invalid-import-revision",
          type: "campaign.import",
          payload: {
            archive: { format: "ottx" },
            mode: "upsert",
            expectedUpdatedAt: "not-a-date",
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("accepts each supported dispatch handler only under its matching active lease", async () => {
    configureWorker();
    const store = new WorkerSecurityTestStore();
    const archive = makeArchive(store.state, "camp_demo");
    const importRevision = store.state.campaigns.find(
      (campaign) => campaign.id === "camp_demo",
    )!.updatedAt;
    const jobs = [
      job({
        id: "dispatch-export",
        type: "campaign.export",
        payload: { campaignId: "camp_demo" },
      }),
      job({
        id: "dispatch-import",
        type: "campaign.import",
        payload: {
          archive,
          mode: "upsert",
          expectedUpdatedAt: importRevision,
        },
      }),
      job({
        id: "dispatch-migrate",
        type: "asset.storage.migrate",
        payload: { campaignId: "camp_demo", dryRun: true },
      }),
      job({
        id: "dispatch-cleanup",
        type: "asset.storage.cleanup",
        payload: { campaignId: "camp_demo", dryRun: true },
      }),
      job({
        id: "dispatch-backup",
        type: "storage.backup",
        payload: { reason: "worker test" },
      }),
      job({
        id: "dispatch-drill",
        type: "storage.restoreDrill",
        payload: { backupFileName: "worker-test.sqlite" },
      }),
      job({
        id: "dispatch-memory",
        type: "ai.memory.extract",
        payload: { campaignId: "camp_demo", sourceText: "The vault opened." },
      }),
      job({
        id: "dispatch-recap",
        type: "ai.session.recap",
        payload: {
          campaignId: "camp_demo",
          transcript: "The party secured the vault.",
        },
      }),
      job({
        id: "dispatch-report",
        type: "report.bundle",
        payload: { campaignId: "camp_demo" },
      }),
    ];
    store.state.jobs.push(...jobs);
    const app = await buildApp({ store, aiProvider: workerTestAiProvider });
    try {
      for (const workerJob of jobs) {
        const expected = expectedWorkerDispatch(workerJob)!;
        const response =
          expected.body === undefined
            ? await app.inject({
                method: expected.method,
                url: expected.path,
                headers: workerHeaders(
                  "worker-secret",
                  "worker-a",
                  workerJob.id,
                ),
              })
            : await app.inject({
                method: expected.method,
                url: expected.path,
                headers: workerHeaders(
                  "worker-secret",
                  "worker-a",
                  workerJob.id,
                ),
                payload: expected.body as Record<string, unknown>,
              });
        expect(
          response.statusCode,
          `${workerJob.type}: ${response.body}`,
        ).toBeLessThan(400);
      }
      expect(
        jobs.every((workerJob) =>
          Boolean(
            store.state.jobs.find((candidate) => candidate.id === workerJob.id)
              ?.dispatchStartedAt,
          ),
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("rejects campaign import jobs that cannot carry an exact revision fence", async () => {
    configureWorker();
    const store = new WorkerSecurityTestStore();
    const app = await buildApp({ store });
    const archive = makeArchive(store.state, "camp_demo");
    try {
      for (const [idempotencyKey, payload, expectedMessage] of [
        ["missing-import-job-revision", { archive, mode: "upsert" }, "expectedUpdatedAt"],
        [
          "invalid-import-job-revision",
          { archive, mode: "upsert", expectedUpdatedAt: "not-a-date" },
          "expectedUpdatedAt",
        ],
        [
          "inexact-import-job-payload",
          {
            archive,
            mode: "upsert",
            expectedUpdatedAt: store.state.campaigns[0]!.updatedAt,
            ignoredRevision: "must-not-be-silently-dropped",
          },
          "additional properties",
        ],
      ] as const) {
        const response = await app.inject({
          method: "POST",
          url: "/api/v1/admin/jobs",
          headers: {
            "x-user-id": "usr_demo_gm",
            "idempotency-key": idempotencyKey,
          },
          payload: { type: "campaign.import", payload },
        });
        expect(response.statusCode, response.body).toBe(400);
        expect(response.json().message).toContain(expectedMessage);
      }

      const expectedUpdatedAt = store.state.campaigns[0]!.updatedAt;
      const accepted = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs",
        headers: {
          "x-user-id": "usr_demo_gm",
          "idempotency-key": "valid-import-job-revision",
        },
        payload: {
          type: "campaign.import",
          payload: { archive, mode: "upsert", expectedUpdatedAt },
        },
      });
      expect(accepted.statusCode, accepted.body).toBe(201);
      expect(store.state.jobs.at(-1)?.payload).toEqual({
        archive,
        mode: "upsert",
        expectedUpdatedAt,
      });
    } finally {
      await app.close();
    }
  });

  it("cannot use a worker token as a user, plugin operator, server admin, or arbitrary campaign reader", async () => {
    configureWorker();
    const app = await buildApp({ store: new MemoryStateStore() });
    try {
      for (const url of [
        "/api/v1/admin/users",
        "/api/v1/admin/plugins/operations",
        "/api/v1/campaigns/camp_demo/snapshot",
        "/api/v1/admin/jobs",
      ]) {
        const response = await app.inject({
          method: "GET",
          url,
          headers: workerHeaders(),
        });
        expect(response.statusCode, url).toBeGreaterThanOrEqual(401);
      }
    } finally {
      await app.close();
    }
  });

  it("leases, heartbeats, dispatches, and completes one job without exposing the token", async () => {
    const secret = "worker-secret-that-must-never-be-logged";
    configureWorker(secret);
    const logLines: string[] = [];
    const store = new MemoryStateStore();
    const app = await buildApp({
      store,
      requestLogStream: {
        write(message) {
          logLines.push(message);
        },
      },
    });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs",
        headers: {
          "x-user-id": "usr_demo_gm",
          "idempotency-key": "worker-security-create",
        },
        payload: {
          type: "campaign.export",
          payload: { campaignId: "camp_demo" },
        },
      });
      expect(created.statusCode).toBe(201);
      const jobId = created.json().id as string;

      const leased = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: {
          ...workerHeaders(secret),
          "idempotency-key": "worker-security-lease",
        },
        payload: {
          workerId: "worker-a",
          leaseSeconds: 30,
          leaseRequestId: "worker-security-lease",
        },
      });
      expect(leased.statusCode).toBe(200);
      expect(leased.json()).toMatchObject({
        id: jobId,
        leasedBy: "worker-a",
        status: "running",
      });
      const leaseRevision = leased.json().leaseRevision as number;

      const heartbeat = await app.inject({
        method: "POST",
        url: `/api/v1/admin/jobs/${jobId}/heartbeat`,
        headers: {
          ...workerHeaders(secret, "worker-a", jobId),
          "x-otte-worker-lease-revision": String(leaseRevision),
          "idempotency-key": "worker-security-heartbeat",
        },
        payload: {
          workerId: "worker-a",
          leaseRevision,
          leaseSeconds: 30,
          progress: { percent: 10 },
        },
      });
      expect(heartbeat.statusCode).toBe(200);

      const dispatched = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: {
          ...workerHeaders(secret, "worker-a", jobId),
          "x-otte-worker-lease-revision": String(leaseRevision),
        },
      });
      expect(dispatched.statusCode).toBe(200);
      expect(
        store.state.jobs.find((candidate) => candidate.id === jobId)
          ?.dispatchStartedAt,
      ).toBeDefined();

      const completed = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/jobs/${jobId}`,
        headers: {
          ...workerHeaders(secret, "worker-a", jobId),
          "x-otte-worker-lease-revision": String(leaseRevision),
          "idempotency-key": "worker-security-settle",
        },
        payload: {
          leaseRevision,
          status: "succeeded",
          output: { format: "ottx" },
        },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({
        id: jobId,
        status: "succeeded",
      });

      const serializedState = JSON.stringify(store.state);
      expect(serializedState).not.toContain(secret);
      expect(logLines.join("\n")).not.toContain(secret);
      expect(
        store.state.auditLogs.filter(
          (audit) => audit.actorType === "system" && audit.targetId === jobId,
        ).length,
      ).toBeGreaterThanOrEqual(4);
    } finally {
      await app.close();
    }
  });

  it("rejects missing, mismatched, expired, cancelled, replayed, cross-job, and cross-campaign execution", async () => {
    configureWorker();
    const store = new MemoryStateStore();
    store.state.jobs.push(
      job(),
      job({ id: "job-b", payload: { campaignId: "camp_other" } }),
    );
    const app = await buildApp({ store });
    try {
      const missingJob = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders(),
      });
      expect(missingJob.statusCode).toBe(403);

      const mismatchedWorker = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-b", "job-a"),
      });
      expect(mismatchedWorker.statusCode).toBe(403);

      const crossJob = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-b"),
      });
      expect(crossJob.statusCode).toBe(403);

      const crossCampaign = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_other/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-a"),
      });
      expect(crossCampaign.statusCode).toBe(403);

      store.state.jobs[0]!.leaseExpiresAt = new Date(
        Date.now() - 1000,
      ).toISOString();
      const expired = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-a"),
      });
      expect(expired.statusCode).toBe(403);

      store.state.jobs[0]!.leaseExpiresAt = new Date(
        Date.now() + 60_000,
      ).toISOString();
      store.state.jobs[0]!.status = "cancelled";
      const cancelled = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-a"),
      });
      expect(cancelled.statusCode).toBe(403);

      store.state.jobs[0]!.status = "running";
      const first = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-a"),
      });
      expect(first.statusCode).toBe(200);
      const replay = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: workerHeaders("worker-secret", "worker-a", "job-a"),
      });
      expect(replay.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("fails production readiness when the worker profile lacks valid principal hashes", async () => {
    process.env.NODE_ENV = "production";
    process.env.OTTE_WORKER_PROFILE_ENABLED = "true";
    process.env.OTTE_ASSET_URL_SIGNING_SECRET = "worker-readiness-test-secret";
    delete process.env.OTTE_WORKER_TOKEN_HASHES;
    let app: Awaited<ReturnType<typeof buildApp>> | undefined = await buildApp({
      store: new WorkerSecurityTestStore(),
    });
    try {
      const missing = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(missing.statusCode).toBe(503);
      expect(missing.json()).toMatchObject({
        ok: false,
        error: "worker_principal_configuration_invalid",
      });

      process.env.OTTE_WORKER_TOKEN_HASHES =
        "worker-a=plaintext-is-not-accepted";
      const invalid = await app.inject({
        method: "GET",
        url: "/api/v1/health",
      });
      expect(invalid.statusCode).toBe(503);
      expect(invalid.json().workerPrincipals).toMatchObject({
        invalidEntryCount: 1,
        invalidInProduction: true,
      });

      process.env.OTTE_WORKER_TOKEN_HASHES = `worker-a=${workerHash("ready-secret")}`;
      await app.close();
      app = await buildApp({ store: new WorkerSecurityTestStore() });
      const ready = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({ ok: true });
    } finally {
      await app?.close();
    }
  });

  it("surfaces missing production worker principals in auth operations without secret material", async () => {
    process.env.NODE_ENV = "production";
    process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
    process.env.OTTE_WORKER_PROFILE_ENABLED = "true";
    delete process.env.OTTE_WORKER_TOKEN_HASHES;
    const adminToken = "admin-session-for-worker-posture-test";
    const now = new Date().toISOString();
    const store = new MemoryStateStore();
    store.state.sessions.push({
      id: "sess-worker-posture",
      userId: "usr_demo_gm",
      tokenHash: workerHash(adminToken),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const app = await buildApp({ store });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/admin/auth/operations",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        actionRequired: true,
        runtime: {
          workerPrincipals: {
            profileEnabled: true,
            configured: false,
            missingInProduction: true,
          },
        },
      });
      expect(response.json().actionReasons).toContain(
        "worker_principal_unconfigured_in_production",
      );
      expect(response.json().remediationQueue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "configure_worker_principals" }),
        ]),
      );
      expect(response.body).not.toContain(adminToken);
    } finally {
      await app.close();
    }
  });
});
