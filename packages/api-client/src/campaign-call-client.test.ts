import { describe, expect, it } from "vitest";
import { OpenTabletopClient, type CampaignCallResponse } from "./index.js";

describe("campaign call client", () => {
  it("encodes the campaign and returns the room, or that the call is off", async () => {
    const answers: CampaignCallResponse[] = [
      { enabled: true, provider: "Jitsi", origin: "https://meet.example.test", url: "https://meet.example.test/otte-0123456789abcdef" },
      { enabled: false },
    ];
    const paths: string[] = [];
    const client = new OpenTabletopClient("https://api.test", {
      fetch: (async (input: RequestInfo | URL) => {
        paths.push(new URL(input.toString()).pathname);
        return new Response(JSON.stringify(answers[paths.length - 1]), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });

    expect(await client.campaignCall("camp/?&=")).toEqual(answers[0]);
    expect(await client.campaignCall("camp_demo")).toEqual({ enabled: false });
    expect(paths).toEqual(["/api/v1/campaigns/camp%2F%3F%26%3D/call", "/api/v1/campaigns/camp_demo/call"]);
  });
});
