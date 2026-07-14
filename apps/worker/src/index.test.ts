import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  describeJob,
  runLeasedWorkerJob,
  runLeasedWorkerLoop,
  runWorkerCli,
  runWorkerJob,
  type WorkerJob,
} from "./index";

describe("worker job runner", () => {
  it("exports campaigns with a scoped worker principal and job binding", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const job: WorkerJob = {
      id: "job_export",
      type: "campaign.export",
      payload: { campaignId: "camp_demo" },
    };
    const result = await runWorkerJob(job, {
      apiBaseUrl: "http://api.test/",
      workerToken: "worker_secret",
      workerId: "worker-a",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            format: "ottx",
            data: { campaigns: [{ id: "camp_demo" }] },
          }),
          { status: 200 },
        );
      },
    });

    expect(describeJob(job)).toBe("campaign.export:job_export");
    expect(calls[0]!.url).toBe(
      "http://api.test/api/v1/campaigns/camp_demo/export",
    );
    expect(calls[0]!.init!.method).toBe("GET");
    const headers = new Headers(calls[0]!.init!.headers);
    expect(headers.get("authorization")).toBe("Worker worker_secret");
    expect(headers.get("x-otte-worker-id")).toBe("worker-a");
    expect(headers.get("x-otte-worker-job-id")).toBe("job_export");
    expect(result).toEqual({
      id: "job_export",
      type: "campaign.export",
      status: "succeeded",
      output: { format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } },
    });
  });

  it("binds every supported dispatch class to its exact job id", async () => {
    const jobs: WorkerJob[] = [
      {
        id: "job_export",
        type: "campaign.export",
        payload: { campaignId: "camp-a" },
      },
      {
        id: "job_import",
        type: "campaign.import",
        payload: {
          archive: { format: "ottx" },
          mode: "reject_conflicts",
          expectedUpdatedAt: "2026-07-14T17:34:56.789Z",
        },
      },
      {
        id: "job_migrate",
        type: "asset.storage.migrate",
        payload: { campaignId: "camp-a", dryRun: true },
      },
      {
        id: "job_cleanup",
        type: "asset.storage.cleanup",
        payload: { campaignId: "camp-a", includeExpired: true },
      },
      {
        id: "job_backup",
        type: "storage.backup",
        payload: { reason: "scheduled" },
      },
      {
        id: "job_drill",
        type: "storage.restoreDrill",
        payload: { backupFileName: "backup.sqlite" },
      },
      {
        id: "job_memory",
        type: "ai.memory.extract",
        payload: { campaignId: "camp-a", sourceText: "A fact" },
      },
      {
        id: "job_recap",
        type: "ai.session.recap",
        payload: { campaignId: "camp-a", transcript: "A recap" },
      },
      {
        id: "job_report",
        type: "report.bundle",
        payload: { campaignId: "camp-a" },
      },
    ];
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];

    for (const job of jobs) {
      await runWorkerJob(job, {
        apiBaseUrl: "http://api.test",
        workerToken: "worker_secret",
        workerId: "worker-a",
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      });
    }

    expect(calls).toHaveLength(jobs.length);
    calls.forEach((call, index) => {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("authorization")).toBe("Worker worker_secret");
      expect(headers.get("x-otte-worker-id")).toBe("worker-a");
      expect(headers.get("x-otte-worker-job-id")).toBe(jobs[index]!.id);
    });
  });

  it("hard-refuses deprecated worker session credentials in production", async () => {
    await expect(
      runWorkerJob(
        {
          id: "job_export",
          type: "campaign.export",
          payload: { campaignId: "camp-a" },
        },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_legacy",
          allowLegacySessionToken: true,
          environment: "production",
          fetch: async () =>
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
        },
      ),
    ).rejects.toThrow(
      "Legacy worker session tokens are disabled in production",
    );
  });

  it("builds redacted campaign report bundles through the authenticated API route", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const job: WorkerJob = {
      id: "job_report",
      type: "report.bundle",
      payload: { campaignId: "camp dogfood" },
    };
    const result = await runWorkerJob(job, {
      apiBaseUrl: "http://api.test/",
      sessionToken: "ots_reporter",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({
            format: "otte-dogfood-report-bundle",
            privacy: { mode: "redacted" },
          }),
          { status: 200 },
        );
      },
    });

    expect(describeJob(job)).toBe("report.bundle:job_report");
    expect(calls[0]!.url).toBe(
      "http://api.test/api/v1/campaigns/camp%20dogfood/dogfood-report-bundle",
    );
    expect(calls[0]!.init!.method).toBe("GET");
    expect(calls[0]!.init!.body).toBeUndefined();
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe(
      "Bearer ots_reporter",
    );
    expect(result).toEqual({
      id: "job_report",
      type: "report.bundle",
      status: "succeeded",
      output: {
        format: "otte-dogfood-report-bundle",
        privacy: { mode: "redacted" },
      },
    });
  });

  it("runs AI memory extraction jobs with bearer auth", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const result = await runWorkerJob(
      {
        id: "job_memory",
        type: "ai.memory.extract",
        payload: {
          campaignId: "camp_demo",
          sourceText: "The sapphire lens opens the vault.",
        },
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_worker",
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(
            JSON.stringify({
              memory: { text: "The sapphire lens opens the vault." },
            }),
            { status: 200 },
          );
        },
      },
    );

    expect(calls[0]!.url).toBe(
      "http://api.test/api/v1/campaigns/camp_demo/ai/memory/extract",
    );
    expect(calls[0]!.init!.method).toBe("POST");
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe(
      "Bearer ots_worker",
    );
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      sourceText: "The sapphire lens opens the vault.",
    });
    expect(result.output).toEqual({
      memory: { text: "The sapphire lens opens the vault." },
    });
  });

  it("rejects x-user-id fallback auth before dispatching API requests", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];

    await expect(
      runWorkerJob(
        {
          id: "job_memory",
          type: "ai.memory.extract",
          payload: {
            campaignId: "camp_demo",
            sourceText: "The sapphire lens opens the vault.",
          },
        },
        {
          apiBaseUrl: "http://api.test",
          userId: "usr_demo_gm",
          fetch: async (url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          },
        },
      ),
    ).rejects.toThrow("Worker API token is required");
    expect(calls).toHaveLength(0);
  });

  it("runs asset storage migration and cleanup jobs through admin API routes", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const migrate = await runWorkerJob(
      {
        id: "job_asset_migrate",
        type: "asset.storage.migrate",
        payload: {
          campaignId: "camp_demo",
          assetIds: ["asset_a"],
          dryRun: false,
          expectedTargetSetHash: `sha256:${"a".repeat(64)}`,
          overwrite: true,
        },
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl,
      },
    );
    const cleanup = await runWorkerJob(
      {
        id: "job_asset_cleanup",
        type: "asset.storage.cleanup",
        payload: {
          assetIds: ["asset_a"],
          dryRun: false,
          expectedTargetSetHash: `sha256:${"b".repeat(64)}`,
          includeExpired: true,
          graceDays: 7,
        },
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl,
      },
    );

    expect(
      describeJob({
        id: "job_asset_migrate",
        type: "asset.storage.migrate",
        payload: {},
      }),
    ).toBe("asset.storage.migrate:job_asset_migrate");
    expect(calls[0]!.url).toBe("http://api.test/api/v1/admin/assets/migrate");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      campaignId: "camp_demo",
      assetIds: ["asset_a"],
      dryRun: false,
      expectedTargetSetHash: `sha256:${"a".repeat(64)}`,
      overwrite: true,
    });
    expect(calls[1]!.url).toBe("http://api.test/api/v1/admin/assets/cleanup");
    expect(calls[1]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({
      assetIds: ["asset_a"],
      dryRun: false,
      expectedTargetSetHash: `sha256:${"b".repeat(64)}`,
      includeExpired: true,
      graceDays: 7,
    });
    expect(migrate.output).toEqual({ ok: true });
    expect(cleanup.output).toEqual({ ok: true });
  });

  it("runs SQLite backup and restore-drill jobs through admin API routes", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url, init });
      if (String(url).endsWith("/backup")) {
        return new Response(
          JSON.stringify({
            status: "created",
            fileName: "opentabletop-test.sqlite",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ status: "passed", recordCount: 12 }),
        { status: 200 },
      );
    };

    const backup = await runWorkerJob(
      {
        id: "job_storage_backup",
        type: "storage.backup",
        payload: { reason: "scheduled-nightly" },
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl,
      },
    );
    const drill = await runWorkerJob(
      {
        id: "job_storage_drill",
        type: "storage.restoreDrill",
        payload: { backupFileName: "opentabletop-test.sqlite" },
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl,
      },
    );

    expect(
      describeJob({
        id: "job_storage_backup",
        type: "storage.backup",
        payload: {},
      }),
    ).toBe("storage.backup:job_storage_backup");
    expect(calls[0]!.url).toBe("http://api.test/api/v1/admin/storage/backup");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      reason: "scheduled-nightly",
    });
    expect(calls[1]!.url).toBe(
      "http://api.test/api/v1/admin/storage/restore-drill",
    );
    expect(calls[1]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({
      backupFileName: "opentabletop-test.sqlite",
    });
    expect(backup.output).toEqual({
      status: "created",
      fileName: "opentabletop-test.sqlite",
    });
    expect(drill.output).toEqual({ status: "passed", recordCount: 12 });
  });

  it("surfaces failed API responses", async () => {
    await expect(
      runWorkerJob(
        {
          id: "job_recap",
          type: "ai.session.recap",
          payload: { campaignId: "camp_demo" },
        },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_player",
          fetch: async () =>
            new Response(JSON.stringify({ error: "forbidden" }), {
              status: 403,
            }),
        },
      ),
    ).rejects.toThrow(
      "Worker API request failed with 403 POST /api/v1/campaigns/camp_demo/ai/session-recap",
    );
  });

  it("times out stalled API requests", async () => {
    let requestSignal: AbortSignal | undefined;
    await expect(
      runWorkerJob(
        {
          id: "job_recap",
          type: "ai.session.recap",
          payload: { campaignId: "camp_demo" },
        },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_worker",
          requestTimeoutMs: 5,
          fetch: async (_url, init) => {
            requestSignal = init?.signal as AbortSignal | undefined;
            return new Promise<Response>(() => undefined);
          },
        },
      ),
    ).rejects.toThrow("Worker API request timed out after 5ms");
    expect(requestSignal?.aborted).toBe(true);
    expect(requestSignal?.reason).toEqual(
      expect.objectContaining({
        message: "Worker API request timed out after 5ms",
      }),
    );
  });

  it("keeps the request timeout active while reading the response body", async () => {
    let requestSignal: AbortSignal | undefined;
    await expect(
      runWorkerJob(
        {
          id: "job_recap",
          type: "ai.session.recap",
          payload: { campaignId: "camp_demo" },
        },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_worker",
          requestTimeoutMs: 5,
          fetch: async (_url, init) => {
            requestSignal = init?.signal as AbortSignal | undefined;
            return {
              ok: true,
              status: 200,
              text: () => new Promise<string>(() => undefined),
            } as Response;
          },
        },
      ),
    ).rejects.toThrow("Worker API request timed out after 5ms");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("preserves status and response text when an upstream error is not JSON", async () => {
    await expect(
      runWorkerJob(
        {
          id: "job_recap",
          type: "ai.session.recap",
          payload: { campaignId: "camp_demo" },
        },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_worker",
          fetch: async () =>
            new Response("upstream gateway unavailable", { status: 502 }),
        },
      ),
    ).rejects.toThrow(
      "Worker API request failed with 502 POST /api/v1/campaigns/camp_demo/ai/session-recap: upstream gateway unavailable",
    );
  });

  it("leases the next queued admin job and records success", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      workerToken: "worker_secret",
      workerId: "worker-a",
      leaseSeconds: 45,
      leaseRequestId: "lease-export-1",
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(
            JSON.stringify({
              id: "job_export",
              type: "campaign.export",
              leaseRevision: 1,
              payload: { campaignId: "camp_demo" },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(
            JSON.stringify({
              format: "ottx",
              data: { campaigns: [{ id: "camp_demo" }] },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
    });

    expect(result).toEqual({
      id: "job_export",
      type: "campaign.export",
      status: "succeeded",
      output: { format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } },
    });
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["PATCH", "http://api.test/api/v1/admin/jobs/job_export"],
    ]);
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      workerId: "worker-a",
      leaseSeconds: 45,
      leaseRequestId: "lease-export-1",
    });
    expect(JSON.parse(calls[1]!.init!.body as string)).toMatchObject({
      workerId: "worker-a",
      leaseRevision: 1,
      leaseSeconds: 45,
    });
    expect(JSON.parse(calls[3]!.init!.body as string)).toMatchObject({
      status: "succeeded",
      progress: { percent: 100, message: "Worker dispatch completed" },
    });
    expect(
      new Headers(calls[0]!.init!.headers).get("x-otte-worker-job-id"),
    ).toBeNull();
    expect(new Headers(calls[0]!.init!.headers).get("idempotency-key")).toBe(
      "lease-export-1",
    );
    for (const call of calls.slice(1)) {
      const headers = new Headers(call.init?.headers);
      expect(headers.get("authorization")).toBe("Worker worker_secret");
      expect(headers.get("x-otte-worker-id")).toBe("worker-a");
      expect(headers.get("x-otte-worker-job-id")).toBe("job_export");
      expect(headers.get("x-otte-worker-lease-revision")).toBe("1");
    }
  });

  it("leases campaign imports with an exact expected revision", async () => {
    const expectedUpdatedAt = "2026-07-14T12:34:56.789-05:00";
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      workerToken: "worker_secret",
      workerId: "worker-import",
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(
            JSON.stringify({
              id: "job_import",
              type: "campaign.import",
              leaseRevision: 4,
              payload: {
                archive: { format: "ottx", version: "0.2.0" },
                mode: "reject_conflicts",
                expectedUpdatedAt,
              },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_import/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/import/campaign") {
          return new Response(
            JSON.stringify({ importedCampaignIds: ["camp_demo"] }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_import") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
    });

    expect(result).toEqual({
      id: "job_import",
      type: "campaign.import",
      status: "succeeded",
      output: { importedCampaignIds: ["camp_demo"] },
    });
    const importCall = calls.find((call) =>
      String(call.url).endsWith("/api/v1/import/campaign"),
    );
    expect(importCall?.init?.method).toBe("POST");
    expect(JSON.parse(importCall?.init?.body as string)).toEqual({
      archive: { format: "ottx", version: "0.2.0" },
      mode: "reject_conflicts",
      expectedUpdatedAt,
    });
  });

  it.each([undefined, "not-a-date"])(
    "rejects leased campaign imports with invalid expectedUpdatedAt %s",
    async (expectedUpdatedAt) => {
      let fetchCalls = 0;
      await expect(
        runLeasedWorkerJob({
          apiBaseUrl: "http://api.test",
          workerToken: "worker_secret",
          workerId: "worker-import",
          fetch: async () => {
            fetchCalls += 1;
            return new Response(
              JSON.stringify({
                id: "job_import",
                type: "campaign.import",
                leaseRevision: 4,
                payload: {
                  archive: { format: "ottx", version: "0.2.0" },
                  mode: "upsert",
                  ...(expectedUpdatedAt === undefined
                    ? {}
                    : { expectedUpdatedAt }),
                },
              }),
              { status: 200 },
            );
          },
        }),
      ).rejects.toThrow(
        "Worker job payload field expectedUpdatedAt must be a valid date-time",
      );
      expect(fetchCalls).toBe(1);
    },
  );

  it("leases report bundle jobs and records their normal progress and result", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      workerToken: "worker_secret",
      workerId: "worker-report",
      leaseSeconds: 45,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(
            JSON.stringify({
              id: "job_report",
              type: "report.bundle",
              leaseRevision: 3,
              payload: { campaignId: "camp_demo" },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_report/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/dogfood-report-bundle") {
          return new Response(
            JSON.stringify({
              format: "otte-dogfood-report-bundle",
              privacy: { mode: "redacted" },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_report") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
    });

    expect(result).toEqual({
      id: "job_report",
      type: "report.bundle",
      status: "succeeded",
      output: {
        format: "otte-dogfood-report-bundle",
        privacy: { mode: "redacted" },
      },
    });
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_report/heartbeat"],
      [
        "GET",
        "http://api.test/api/v1/campaigns/camp_demo/dogfood-report-bundle",
      ],
      ["PATCH", "http://api.test/api/v1/admin/jobs/job_report"],
    ]);
    expect(JSON.parse(calls[1]!.init!.body as string)).toMatchObject({
      workerId: "worker-report",
      leaseRevision: 3,
      progress: { percent: 0, message: "Worker dispatch started" },
    });
    expect(JSON.parse(calls[3]!.init!.body as string)).toMatchObject({
      status: "succeeded",
      output: {
        format: "otte-dogfood-report-bundle",
        privacy: { mode: "redacted" },
      },
      progress: { percent: 100, message: "Worker dispatch completed" },
    });
  });

  it("returns idle when no queued admin job can be leased", async () => {
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      fetch: async () => new Response(null, { status: 204 }),
    });

    expect(result).toEqual({ status: "idle" });
  });

  it("falls back to a sanitized host worker id when the compose worker id is blank", async () => {
    const previousHostName = process.env.HOSTNAME;
    const previousComputerName = process.env.COMPUTERNAME;
    const previousWorkerId = process.env.OTTE_WORKER_ID;
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    process.env.HOSTNAME = "compose worker 1";
    process.env.OTTE_WORKER_ID = "";
    delete process.env.COMPUTERNAME;
    try {
      const result = await runLeasedWorkerJob({
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        workerId: " ",
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(null, { status: 204 });
        },
      });

      expect(result).toEqual({ status: "idle" });
      expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({
        workerId: "compose-worker-1",
        leaseRequestId: expect.any(String),
      });
    } finally {
      if (previousHostName === undefined) delete process.env.HOSTNAME;
      else process.env.HOSTNAME = previousHostName;
      if (previousComputerName === undefined) delete process.env.COMPUTERNAME;
      else process.env.COMPUTERNAME = previousComputerName;
      if (previousWorkerId === undefined) delete process.env.OTTE_WORKER_ID;
      else process.env.OTTE_WORKER_ID = previousWorkerId;
    }
  });

  it("aborts in-flight leased jobs when heartbeats observe cancellation", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    let heartbeatCount = 0;
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      workerToken: "worker_secret",
      workerId: "worker-cancel",
      leaseSeconds: 30,
      heartbeatIntervalMs: 1,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(
            JSON.stringify({
              id: "job_export",
              type: "campaign.export",
              leaseRevision: 2,
              payload: { campaignId: "camp_demo" },
            }),
            { status: 200 },
          );
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          heartbeatCount += 1;
          if (heartbeatCount === 1)
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          return new Response(
            JSON.stringify({
              error: "conflict",
              message: "Only running jobs can receive heartbeats",
            }),
            { status: 409 },
          );
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          const signal = init?.signal as AbortSignal | undefined;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason ?? new Error("aborted")),
              { once: true },
            );
          });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
    });

    expect(result).toMatchObject({
      id: "job_export",
      type: "campaign.export",
      status: "cancelled",
    });
    expect(result.status === "cancelled" ? result.error : "").toContain(
      "heartbeat rejected",
    );
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
    ]);
    const mutatingCalls = calls.filter((call) => call.init?.method !== "GET");
    const operationKeys = mutatingCalls.map((call) =>
      new Headers(call.init?.headers).get("idempotency-key"),
    );
    expect(operationKeys.every(Boolean)).toBe(true);
    expect(new Set(operationKeys).size).toBe(operationKeys.length);
    const heartbeatCalls = calls.filter((call) =>
      String(call.url).endsWith("/heartbeat"),
    );
    expect(
      heartbeatCalls.map((call) =>
        new Headers(call.init?.headers).get("x-otte-worker-lease-revision"),
      ),
    ).toEqual(["2", "2"]);
    expect(
      heartbeatCalls.map((call) => JSON.parse(call.init?.body as string)),
    ).toEqual([
      expect.objectContaining({
        workerId: "worker-cancel",
        leaseRevision: 2,
        progress: { percent: 0, message: "Worker dispatch started" },
      }),
      expect.objectContaining({
        workerId: "worker-cancel",
        leaseRevision: 2,
        progress: { message: "Worker dispatch heartbeat" },
      }),
    ]);
  });

  it("uses the caller lease request identity as the stable lease idempotency key", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      workerToken: "worker_secret",
      workerId: "worker-stable",
      leaseRequestId: "lease-request-stable-1",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      },
    });

    expect(result).toEqual({ status: "idle" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({
      workerId: "worker-stable",
      leaseRequestId: "lease-request-stable-1",
    });
    expect(new Headers(calls[0]!.init!.headers).get("idempotency-key")).toBe(
      "lease-request-stable-1",
    );
  });

  it("stops leasing and records an outcome-unknown failure when SIGTERM interrupts a long response", async () => {
    const signals = new EventEmitter();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let stdoutText = "";
    let stderrText = "";
    let leaseCalls = 0;
    let patchBody: Record<string, unknown> | undefined;
    let dispatchStartedResolve!: () => void;
    const dispatchStarted = new Promise<void>((resolve) => {
      dispatchStartedResolve = resolve;
    });
    stdout.setEncoding("utf8");
    stderr.setEncoding("utf8");
    stdout.on("data", (chunk: string) => {
      stdoutText += chunk;
    });
    stderr.on("data", (chunk: string) => {
      stderrText += chunk;
    });

    const server = createServer((request, response) => {
      void (async () => {
        const path = request.url ?? "";
        if (request.method === "POST" && path === "/api/v1/admin/jobs/lease") {
          leaseCalls += 1;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              id: "job_shutdown",
              type: "campaign.export",
              leaseRevision: 1,
              payload: { campaignId: "camp_slow" },
            }),
          );
          return;
        }
        if (
          request.method === "POST" &&
          path === "/api/v1/admin/jobs/job_shutdown/heartbeat"
        ) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        if (
          request.method === "GET" &&
          path === "/api/v1/campaigns/camp_slow/export"
        ) {
          dispatchStartedResolve();
          response.writeHead(200, { "content-type": "application/json" });
          response.write('{"format":"ottx","data":');
          return;
        }
        if (
          request.method === "PATCH" &&
          path === "/api/v1/admin/jobs/job_shutdown"
        ) {
          const chunks: Buffer[] = [];
          for await (const chunk of request)
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          patchBody = JSON.parse(
            Buffer.concat(chunks).toString("utf8"),
          ) as Record<string, unknown>;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "unexpected route" }));
      })().catch((error) => {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Worker integration server did not expose a TCP port");
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const cli = runWorkerCli(
        {
          OTTE_WORKER_LEASE_POLL: "true",
          OTTE_API_URL: `http://127.0.0.1:${address.port}`,
          OTTE_SESSION_TOKEN: "ots_worker",
          OTTE_WORKER_ID: "worker-shutdown",
          OTTE_WORKER_POLL_INTERVAL_MS: "0",
        },
        stdin,
        stdout,
        stderr,
        { signalSource: signals, shutdownTimeoutMs: 500 },
      );
      await dispatchStarted;
      signals.emit("SIGTERM");
      const exitCode = await Promise.race([
        cli,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Worker CLI did not drain after SIGTERM")),
            1_500,
          );
        }),
      ]);

      expect(exitCode).toBe(0);
      expect(leaseCalls).toBe(1);
      expect(patchBody).toMatchObject({
        status: "failed",
        progress: { message: "Worker shutdown interrupted dispatch" },
        log: { level: "warning" },
      });
      expect(String(patchBody?.error)).toContain(
        "Worker shutdown requested by SIGTERM",
      );
      expect(String(patchBody?.error)).toContain(
        "dispatch outcome is unknown and requires operator review",
      );
      expect(stdoutText).toContain('"status":"failed"');
      expect(stderrText).toBe("");
      expect(signals.listenerCount("SIGINT")).toBe(0);
      expect(signals.listenerCount("SIGTERM")).toBe(0);
    } finally {
      if (deadline) clearTimeout(deadline);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("polls leased admin jobs until the configured idle threshold", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const observed: string[] = [];
    let leaseAttempts = 0;
    const result = await runLeasedWorkerLoop({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-loop",
      leaseSeconds: 30,
      pollIntervalMs: 0,
      maxIdlePolls: 2,
      maxRetainedResults: 10,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          leaseAttempts += 1;
          if (leaseAttempts === 1)
            return new Response(
              JSON.stringify({
                id: "job_export",
                type: "campaign.export",
                leaseRevision: 1,
                payload: { campaignId: "camp_demo" },
              }),
              { status: 200 },
            );
          return new Response(null, { status: 204 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(JSON.stringify({ format: "ottx" }), {
            status: 200,
          });
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
      onResult: (leaseResult) => {
        observed.push(leaseResult.status);
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 1,
      failures: 0,
      idlePolls: 2,
    });
    expect(result.results.map((leaseResult) => leaseResult.status)).toEqual([
      "succeeded",
      "idle",
      "idle",
    ]);
    expect(observed).toEqual(["succeeded", "idle", "idle"]);
    expect(
      calls.filter((call) =>
        String(call.url).endsWith("/api/v1/admin/jobs/lease"),
      ),
    ).toHaveLength(3);
    expect(JSON.parse(calls[0]!.init!.body as string)).toMatchObject({
      workerId: "worker-loop",
      leaseSeconds: 30,
      leaseRequestId: expect.any(String),
    });
  });

  it("rejects a leased loop with no session token before polling", async () => {
    let fetchCalls = 0;

    await expect(
      runLeasedWorkerLoop({
        apiBaseUrl: "http://api.test",
        sessionToken: "   ",
        fetch: async () => {
          fetchCalls += 1;
          return new Response(null, { status: 204 });
        },
      }),
    ).rejects.toThrow("Worker API token is required");
    expect(fetchCalls).toBe(0);
  });

  it("backs off and retries when a leased loop poll throws", async () => {
    const observed: string[] = [];
    const sleepDelays: number[] = [];
    let leaseAttempts = 0;
    const result = await runLeasedWorkerLoop({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-loop",
      pollIntervalMs: 25,
      maxIdlePolls: 1,
      maxRetainedResults: 10,
      fetch: async () => {
        leaseAttempts += 1;
        if (leaseAttempts === 1) throw new Error("socket hang up");
        return new Response(null, { status: 204 });
      },
      sleep: async (milliseconds) => {
        sleepDelays.push(milliseconds);
      },
      onResult: (leaseResult) => {
        observed.push(
          leaseResult.status === "failed"
            ? leaseResult.error
            : leaseResult.status,
        );
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 0,
      failures: 1,
      idlePolls: 1,
    });
    expect(result.results).toMatchObject([
      { status: "failed", error: "socket hang up" },
      { status: "idle" },
    ]);
    expect(observed).toEqual(["socket hang up", "idle"]);
    expect(sleepDelays).toEqual([25]);
    expect(leaseAttempts).toBe(2);
  });

  it("backs off and retries when a leased job status PATCH fails", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> =
      [];
    const sleepDelays: number[] = [];
    let leaseAttempts = 0;
    const result = await runLeasedWorkerLoop({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-loop",
      leaseSeconds: 30,
      pollIntervalMs: 10,
      maxIdlePolls: 1,
      maxRetainedResults: 10,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          leaseAttempts += 1;
          if (leaseAttempts === 1)
            return new Response(
              JSON.stringify({
                id: "job_export",
                type: "campaign.export",
                leaseRevision: 1,
                payload: { campaignId: "camp_demo" },
              }),
              { status: 200 },
            );
          return new Response(null, { status: 204 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(JSON.stringify({ error: "upstream timeout" }), {
            status: 500,
          });
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(
            JSON.stringify({ error: "status store unavailable" }),
            { status: 503 },
          );
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
          status: 500,
        });
      },
      sleep: async (milliseconds) => {
        sleepDelays.push(milliseconds);
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 0,
      failures: 1,
      idlePolls: 1,
    });
    expect(result.results[0]).toMatchObject({ status: "failed" });
    expect(
      result.results[0]?.status === "failed" ? result.results[0].error : "",
    ).toContain(
      "Worker API request failed with 503 PATCH /api/v1/admin/jobs/job_export",
    );
    expect(result.results[1]).toEqual({ status: "idle" });
    expect(sleepDelays).toEqual([10]);
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["PATCH", "http://api.test/api/v1/admin/jobs/job_export"],
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
    ]);
  });

  it("streams leased loop results without retaining an unbounded daemon history by default", async () => {
    const observed: string[] = [];
    const result = await runLeasedWorkerLoop({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-daemon",
      leaseSeconds: 30,
      pollIntervalMs: 0,
      maxIdlePolls: 2,
      fetch: async () => new Response(null, { status: 204 }),
      onResult: (leaseResult) => {
        observed.push(leaseResult.status);
      },
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-daemon",
      jobsRun: 0,
      failures: 0,
      idlePolls: 2,
      results: [],
    });
    expect(observed).toEqual(["idle", "idle"]);
  });
});
