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
