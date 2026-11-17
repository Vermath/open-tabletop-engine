import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const envKeys = [
  "NODE_ENV",
  "OTTE_ADMIN_USER_IDS",
  "OTTE_WORKER_PROFILE_ENABLED",
  "OTTE_WORKER_TOKEN_HASHES",
  "OTTE_JOB_ALERT_WEBHOOK_URL",
  "OTTE_JOB_ALERT_WEBHOOK_TOKEN"
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<(typeof envKeys)[number], string | undefined>;

function tokenHash(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function adminHeaders(idempotencyKey: string): Record<string, string> {
  return { "x-user-id": "usr_demo_gm", "idempotency-key": idempotencyKey };
}

function workerHeaders(input: { idempotencyKey: string; jobId?: string; leaseRevision?: number }): Record<string, string> {
  return {
    authorization: "Worker worker-secret",
    "x-otte-worker-id": "worker-a",
    "idempotency-key": input.idempotencyKey,
    ...(input.jobId ? { "x-otte-worker-job-id": input.jobId } : {}),
    ...(input.leaseRevision ? { "x-otte-worker-lease-revision": String(input.leaseRevision) } : {})
  };
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.OTTE_ADMIN_USER_IDS = "usr_demo_gm";
  process.env.OTTE_WORKER_PROFILE_ENABLED = "true";
  process.env.OTTE_WORKER_TOKEN_HASHES = `worker-a=${tokenHash("worker-secret")}`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("admin job mutation concurrency", () => {
  // This scenario boots three app instances; leave headroom for full-suite shared-process load.
  it("durably replays one caller lease transition across app restarts without claiming another job", async () => {
    const firstStore = new MemoryStateStore();
    const firstApp = await buildApp({ store: firstStore });
    let firstJobId = "";
    try {
      for (const key of ["create-job-one", "create-job-two"]) {
        const created = await firstApp.inject({
          method: "POST",
          url: "/api/v1/admin/jobs",
          headers: adminHeaders(key),
          payload: { type: "campaign.export", payload: { campaignId: "camp_demo" } }
        });
        expect(created.statusCode, created.body).toBe(201);
      }
      const leased = await firstApp.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: workerHeaders({ idempotencyKey: "lease-transition-one" }),
        payload: { workerId: "worker-a", leaseSeconds: 30, leaseRequestId: "lease-transition-one" }
      });
      expect(leased.statusCode, leased.body).toBe(200);
      expect(leased.json()).toMatchObject({ status: "running", leasedBy: "worker-a", leaseRequestId: "lease-transition-one", leaseRevision: 1 });
      firstJobId = leased.json().id as string;
    } finally {
      await firstApp.close();
    }

    const restartedStore = new MemoryStateStore(structuredClone(firstStore.state));
    const restartedApp = await buildApp({ store: restartedStore });
    try {
      const replay = await restartedApp.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: workerHeaders({ idempotencyKey: "lease-transition-one" }),
        payload: { workerId: "worker-a", leaseSeconds: 30, leaseRequestId: "lease-transition-one" }
      });
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toMatchObject({ id: firstJobId, leaseRevision: 1 });
      expect(restartedStore.state.jobs.filter((job) => job.status === "running")).toHaveLength(1);
      expect(restartedStore.state.jobs.filter((job) => job.status === "queued")).toHaveLength(1);
    } finally {
      await restartedApp.close();
    }

    const ledgerRecoveryStore = new MemoryStateStore(structuredClone(restartedStore.state));
    ledgerRecoveryStore.state.idempotencyRecords = [];
    const ledgerRecoveryApp = await buildApp({ store: ledgerRecoveryStore });
    try {
      const replay = await ledgerRecoveryApp.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: workerHeaders({ idempotencyKey: "lease-transition-one" }),
        payload: { workerId: "worker-a", leaseSeconds: 30, leaseRequestId: "lease-transition-one" }
      });
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toMatchObject({ id: firstJobId, leaseRevision: 1 });
      expect(ledgerRecoveryStore.state.jobs.filter((job) => job.status === "queued")).toHaveLength(1);
    } finally {
      await ledgerRecoveryApp.close();
    }
  }, 15_000);

  it("rejects stale lease epochs after reclaim and replays only the exact current heartbeat", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs",
        headers: adminHeaders("create-reclaim-job"),
        payload: { type: "campaign.export", payload: { campaignId: "camp_demo" } }
      });
      const jobId = created.json().id as string;
      const firstLease = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: workerHeaders({ idempotencyKey: "lease-epoch-one" }),
        payload: { workerId: "worker-a", leaseSeconds: 30, leaseRequestId: "lease-epoch-one" }
      });
      expect(firstLease.json().leaseRevision).toBe(1);
      store.state.jobs.find((job) => job.id === jobId)!.leaseExpiresAt = new Date(Date.now() - 1_000).toISOString();

      const reclaimed = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs/lease",
        headers: workerHeaders({ idempotencyKey: "lease-epoch-two" }),
        payload: { workerId: "worker-a", leaseSeconds: 30, leaseRequestId: "lease-epoch-two" }
      });
      expect(reclaimed.statusCode, reclaimed.body).toBe(200);
      expect(reclaimed.json()).toMatchObject({ id: jobId, leaseRevision: 2, attempts: 2 });

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/admin/jobs/${jobId}/heartbeat`,
        headers: workerHeaders({ idempotencyKey: "heartbeat-stale", jobId, leaseRevision: 1 }),
        payload: { workerId: "worker-a", leaseRevision: 1, leaseSeconds: 30 }
      });
      expect(stale.statusCode).toBe(403);

      const heartbeatRequest = {
        method: "POST" as const,
        url: `/api/v1/admin/jobs/${jobId}/heartbeat`,
        headers: workerHeaders({ idempotencyKey: "heartbeat-current", jobId, leaseRevision: 2 }),
        payload: { workerId: "worker-a", leaseRevision: 2, leaseSeconds: 30, progress: { percent: 25 } }
      };
      const current = await app.inject(heartbeatRequest);
      expect(current.statusCode, current.body).toBe(200);
      const replay = await app.inject(heartbeatRequest);
      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(current.body);

      const settled = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/jobs/${jobId}`,
        headers: workerHeaders({ idempotencyKey: "settle-current", jobId, leaseRevision: 2 }),
        payload: { leaseRevision: 2, status: "failed", error: "expected test failure" }
      });
      expect(settled.statusCode, settled.body).toBe(200);
      expect(settled.json().status).toBe("failed");
      const released = await app.inject({ ...heartbeatRequest, headers: workerHeaders({ idempotencyKey: "heartbeat-released", jobId, leaseRevision: 2 }) });
      expect(released.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("fences admin retry/cancel state and forwards a stable alert delivery identity downstream", async () => {
    process.env.OTTE_JOB_ALERT_WEBHOOK_URL = "https://alerts.test/jobs";
    process.env.OTTE_JOB_ALERT_WEBHOOK_TOKEN = "alert-secret";
    let downstreamRequest: { input: string | URL | Request; init?: RequestInit } | undefined;
    const downstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      downstreamRequest = { input, init };
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", downstream);
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/admin/jobs",
        headers: adminHeaders("create-admin-fence-job"),
        payload: { type: "storage.backup" }
      });
      const jobId = created.json().id as string;
      const job = store.state.jobs.find((candidate) => candidate.id === jobId)!;
      const staleUpdatedAt = job.updatedAt;
      job.status = "failed";
      job.attempts = 1;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date(Date.now() + 1_000).toISOString();

      const staleRetry = await app.inject({
        method: "POST",
        url: `/api/v1/admin/jobs/${jobId}/retry`,
        headers: adminHeaders("retry-stale"),
        payload: { expectedUpdatedAt: staleUpdatedAt }
      });
      expect(staleRetry.statusCode).toBe(409);
      const retryRequest = {
        method: "POST" as const,
        url: `/api/v1/admin/jobs/${jobId}/retry`,
        headers: adminHeaders("retry-current"),
        payload: { expectedUpdatedAt: job.updatedAt }
      };
      const retried = await app.inject(retryRequest);
      expect(retried.statusCode, retried.body).toBe(200);
      const retryReplay = await app.inject(retryRequest);
      expect(retryReplay.headers["idempotency-replayed"]).toBe("true");

      const cancelled = await app.inject({
        method: "POST",
        url: `/api/v1/admin/jobs/${jobId}/cancel`,
        headers: adminHeaders("cancel-current"),
        payload: { expectedUpdatedAt: retried.json().updatedAt, reason: "operator test" }
      });
      expect(cancelled.statusCode, cancelled.body).toBe(200);

      const alertRequest = {
        method: "POST" as const,
        url: "/api/v1/admin/jobs/alerts",
        headers: adminHeaders("alert-api-operation"),
        payload: { deliveryId: "job-alert-delivery-1", force: true, reason: "operator test" }
      };
      const delivered = await app.inject(alertRequest);
      expect(delivered.statusCode, delivered.body).toBe(200);
      expect(delivered.json()).toMatchObject({ status: "delivered", deliveryId: "job-alert-delivery-1", webhookStatus: 202 });
      expect(downstream).toHaveBeenCalledTimes(1);
      const init = downstreamRequest!.init!;
      const headers = new Headers(init.headers);
      expect(headers.get("idempotency-key")).toBe("job-alert-delivery-1");
      expect(headers.get("x-open-tabletop-delivery-id")).toBe("job-alert-delivery-1");
      expect(JSON.parse(init.body as string)).toMatchObject({ deliveryId: "job-alert-delivery-1" });

      const replay = await app.inject(alertRequest);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(downstream).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
