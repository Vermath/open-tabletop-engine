import { describe, expect, it } from "vitest";
import { describeJob, runWorkerJob, type WorkerJob } from "./index";

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

  it("runs AI memory extraction jobs with x-user-id fallback auth", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const result = await runWorkerJob(
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
          return new Response(JSON.stringify({ memory: { text: "The sapphire lens opens the vault." } }), { status: 200 });
        }
      }
    );

    expect(calls[0]!.url).toBe("http://api.test/api/v1/campaigns/camp_demo/ai/memory/extract");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(new Headers(calls[0]!.init!.headers).get("x-user-id")).toBe("usr_demo_gm");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ sourceText: "The sapphire lens opens the vault." });
    expect(result.output).toEqual({ memory: { text: "The sapphire lens opens the vault." } });
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

  it("surfaces failed API responses", async () => {
    await expect(
      runWorkerJob(
        { id: "job_recap", type: "ai.session.recap", payload: { campaignId: "camp_demo" } },
        {
          apiBaseUrl: "http://api.test",
          userId: "usr_demo_player",
          fetch: async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
        }
      )
    ).rejects.toThrow("Worker API request failed with 403 POST /api/v1/campaigns/camp_demo/ai/session-recap");
  });
});
