import { describe, expect, it } from "vitest";
import { describeJob, runLeasedWorkerJob, runLeasedWorkerLoop, runWorkerJob, type WorkerJob } from "./index";

describe("worker job runner", () => {
  it("exports campaigns through the API with bearer auth", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const job: WorkerJob = { id: "job_export", type: "campaign.export", payload: { campaignId: "camp_demo" } };
    const result = await runWorkerJob(job, {
      apiBaseUrl: "http://api.test/",
      sessionToken: "ots_test",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } }), { status: 200 });
      }
    });

    expect(describeJob(job)).toBe("campaign.export:job_export");
    expect(calls[0]!.url).toBe("http://api.test/api/v1/campaigns/camp_demo/export");
    expect(calls[0]!.init!.method).toBe("GET");
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe("Bearer ots_test");
    expect(result).toEqual({
      id: "job_export",
      type: "campaign.export",
      status: "succeeded",
      output: { format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } }
    });
  });

  it("runs AI memory extraction jobs with bearer auth", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const result = await runWorkerJob(
      {
        id: "job_memory",
        type: "ai.memory.extract",
        payload: { campaignId: "camp_demo", sourceText: "The sapphire lens opens the vault." }
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_worker",
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(JSON.stringify({ memory: { text: "The sapphire lens opens the vault." } }), { status: 200 });
        }
      }
    );

    expect(calls[0]!.url).toBe("http://api.test/api/v1/campaigns/camp_demo/ai/memory/extract");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe("Bearer ots_worker");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ sourceText: "The sapphire lens opens the vault." });
    expect(result.output).toEqual({ memory: { text: "The sapphire lens opens the vault." } });
  });

  it("rejects x-user-id fallback auth before dispatching API requests", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

    await expect(
      runWorkerJob(
        {
          id: "job_memory",
          type: "ai.memory.extract",
          payload: { campaignId: "camp_demo", sourceText: "The sapphire lens opens the vault." }
        },
        {
          apiBaseUrl: "http://api.test",
          userId: "usr_demo_gm",
          fetch: async (url, init) => {
            calls.push({ url, init });
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          }
        }
      )
    ).rejects.toThrow("Worker API session token is required");
    expect(calls).toHaveLength(0);
  });

  it("runs asset storage migration and cleanup jobs through admin API routes", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const migrate = await runWorkerJob(
      {
        id: "job_asset_migrate",
        type: "asset.storage.migrate",
        payload: { campaignId: "camp_demo", assetIds: ["asset_a"], dryRun: true, overwrite: true }
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl
      }
    );
    const cleanup = await runWorkerJob(
      {
        id: "job_asset_cleanup",
        type: "asset.storage.cleanup",
        payload: { assetIds: ["asset_a"], includeExpired: true, graceDays: 7 }
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl
      }
    );

    expect(describeJob({ id: "job_asset_migrate", type: "asset.storage.migrate", payload: {} })).toBe("asset.storage.migrate:job_asset_migrate");
    expect(calls[0]!.url).toBe("http://api.test/api/v1/admin/assets/migrate");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ campaignId: "camp_demo", assetIds: ["asset_a"], dryRun: true, overwrite: true });
    expect(calls[1]!.url).toBe("http://api.test/api/v1/admin/assets/cleanup");
    expect(calls[1]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ assetIds: ["asset_a"], includeExpired: true, graceDays: 7 });
    expect(migrate.output).toEqual({ ok: true });
    expect(cleanup.output).toEqual({ ok: true });
  });

  it("runs SQLite backup and restore-drill jobs through admin API routes", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, init });
      if (String(url).endsWith("/backup")) {
        return new Response(JSON.stringify({ status: "created", fileName: "opentabletop-test.sqlite" }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "passed", recordCount: 12 }), { status: 200 });
    };

    const backup = await runWorkerJob(
      {
        id: "job_storage_backup",
        type: "storage.backup",
        payload: { reason: "scheduled-nightly" }
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl
      }
    );
    const drill = await runWorkerJob(
      {
        id: "job_storage_drill",
        type: "storage.restoreDrill",
        payload: { backupFileName: "opentabletop-test.sqlite" }
      },
      {
        apiBaseUrl: "http://api.test",
        sessionToken: "ots_admin",
        fetch: fetchImpl
      }
    );

    expect(describeJob({ id: "job_storage_backup", type: "storage.backup", payload: {} })).toBe("storage.backup:job_storage_backup");
    expect(calls[0]!.url).toBe("http://api.test/api/v1/admin/storage/backup");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ reason: "scheduled-nightly" });
    expect(calls[1]!.url).toBe("http://api.test/api/v1/admin/storage/restore-drill");
    expect(calls[1]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ backupFileName: "opentabletop-test.sqlite" });
    expect(backup.output).toEqual({ status: "created", fileName: "opentabletop-test.sqlite" });
    expect(drill.output).toEqual({ status: "passed", recordCount: 12 });
  });

  it("surfaces failed API responses", async () => {
    await expect(
      runWorkerJob(
        { id: "job_recap", type: "ai.session.recap", payload: { campaignId: "camp_demo" } },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_player",
          fetch: async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
        }
      )
    ).rejects.toThrow("Worker API request failed with 403 POST /api/v1/campaigns/camp_demo/ai/session-recap");
  });

  it("times out stalled API requests", async () => {
    await expect(
      runWorkerJob(
        { id: "job_recap", type: "ai.session.recap", payload: { campaignId: "camp_demo" } },
        {
          apiBaseUrl: "http://api.test",
          sessionToken: "ots_worker",
          requestTimeoutMs: 5,
          fetch: async () => new Promise<Response>(() => undefined)
        }
      )
    ).rejects.toThrow("Worker API request timed out after 5ms");
  });

  it("leases the next queued admin job and records success", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-a",
      leaseSeconds: 45,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(JSON.stringify({ id: "job_export", type: "campaign.export", payload: { campaignId: "camp_demo" } }), { status: 200 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(JSON.stringify({ format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } }), { status: 200 });
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      }
    });

    expect(result).toEqual({
      id: "job_export",
      type: "campaign.export",
      status: "succeeded",
      output: { format: "ottx", data: { campaigns: [{ id: "camp_demo" }] } }
    });
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["PATCH", "http://api.test/api/v1/admin/jobs/job_export"]
    ]);
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ workerId: "worker-a", leaseSeconds: 45 });
    expect(JSON.parse(calls[1]!.init!.body as string)).toMatchObject({ workerId: "worker-a", leaseSeconds: 45 });
    expect(JSON.parse(calls[3]!.init!.body as string)).toMatchObject({
      status: "succeeded",
      progress: { percent: 100, message: "Worker dispatch completed" }
    });
  });

  it("returns idle when no queued admin job can be leased", async () => {
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      fetch: async () => new Response(null, { status: 204 })
    });

    expect(result).toEqual({ status: "idle" });
  });

  it("falls back to a sanitized host worker id when the compose worker id is blank", async () => {
    const previousHostName = process.env.HOSTNAME;
    const previousComputerName = process.env.COMPUTERNAME;
    const previousWorkerId = process.env.OTTE_WORKER_ID;
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
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
        }
      });

      expect(result).toEqual({ status: "idle" });
      expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ workerId: "compose-worker-1" });
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
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    let heartbeatCount = 0;
    const result = await runLeasedWorkerJob({
      apiBaseUrl: "http://api.test",
      sessionToken: "ots_admin",
      workerId: "worker-cancel",
      leaseSeconds: 30,
      heartbeatIntervalMs: 1,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const path = String(url).replace("http://api.test", "");
        if (path === "/api/v1/admin/jobs/lease") {
          return new Response(JSON.stringify({ id: "job_export", type: "campaign.export", payload: { campaignId: "camp_demo" } }), { status: 200 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          heartbeatCount += 1;
          if (heartbeatCount === 1) return new Response(JSON.stringify({ ok: true }), { status: 200 });
          return new Response(JSON.stringify({ error: "conflict", message: "Only running jobs can receive heartbeats" }), { status: 409 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          const signal = init?.signal as AbortSignal | undefined;
          return new Promise<Response>((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason ?? new Error("aborted")), { once: true });
          });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      }
    });

    expect(result).toMatchObject({
      id: "job_export",
      type: "campaign.export",
      status: "cancelled"
    });
    expect(result.status === "cancelled" ? result.error : "").toContain("heartbeat rejected");
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"]
    ]);
  });

  it("polls leased admin jobs until the configured idle threshold", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
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
          if (leaseAttempts === 1) return new Response(JSON.stringify({ id: "job_export", type: "campaign.export", payload: { campaignId: "camp_demo" } }), { status: 200 });
          return new Response(null, { status: 204 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(JSON.stringify({ format: "ottx" }), { status: 200 });
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      },
      onResult: (leaseResult) => {
        observed.push(leaseResult.status);
      }
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 1,
      failures: 0,
      idlePolls: 2
    });
    expect(result.results.map((leaseResult) => leaseResult.status)).toEqual(["succeeded", "idle", "idle"]);
    expect(observed).toEqual(["succeeded", "idle", "idle"]);
    expect(calls.filter((call) => String(call.url).endsWith("/api/v1/admin/jobs/lease"))).toHaveLength(3);
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ workerId: "worker-loop", leaseSeconds: 30 });
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
        observed.push(leaseResult.status === "failed" ? leaseResult.error : leaseResult.status);
      }
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 0,
      failures: 1,
      idlePolls: 1
    });
    expect(result.results).toMatchObject([{ status: "failed", error: "socket hang up" }, { status: "idle" }]);
    expect(observed).toEqual(["socket hang up", "idle"]);
    expect(sleepDelays).toEqual([25]);
    expect(leaseAttempts).toBe(2);
  });

  it("backs off and retries when a leased job status PATCH fails", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
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
          if (leaseAttempts === 1) return new Response(JSON.stringify({ id: "job_export", type: "campaign.export", payload: { campaignId: "camp_demo" } }), { status: 200 });
          return new Response(null, { status: 204 });
        }
        if (path === "/api/v1/admin/jobs/job_export/heartbeat") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === "/api/v1/campaigns/camp_demo/export") {
          return new Response(JSON.stringify({ error: "upstream timeout" }), { status: 500 });
        }
        if (path === "/api/v1/admin/jobs/job_export") {
          return new Response(JSON.stringify({ error: "status store unavailable" }), { status: 503 });
        }
        return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
      },
      sleep: async (milliseconds) => {
        sleepDelays.push(milliseconds);
      }
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-loop",
      jobsRun: 0,
      failures: 1,
      idlePolls: 1
    });
    expect(result.results[0]).toMatchObject({ status: "failed" });
    expect(result.results[0]?.status === "failed" ? result.results[0].error : "").toContain("Worker API request failed with 503 PATCH /api/v1/admin/jobs/job_export");
    expect(result.results[1]).toEqual({ status: "idle" });
    expect(sleepDelays).toEqual([10]);
    expect(calls.map((call) => [call.init?.method, String(call.url)])).toEqual([
      ["POST", "http://api.test/api/v1/admin/jobs/lease"],
      ["POST", "http://api.test/api/v1/admin/jobs/job_export/heartbeat"],
      ["GET", "http://api.test/api/v1/campaigns/camp_demo/export"],
      ["PATCH", "http://api.test/api/v1/admin/jobs/job_export"],
      ["POST", "http://api.test/api/v1/admin/jobs/lease"]
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
      }
    });

    expect(result).toMatchObject({
      status: "completed",
      workerId: "worker-daemon",
      jobsRun: 0,
      failures: 0,
      idlePolls: 2,
      results: []
    });
    expect(observed).toEqual(["idle", "idle"]);
  });
});
