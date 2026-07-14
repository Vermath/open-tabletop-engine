import { describe, expect, it } from "vitest";
import { OpenTabletopClient } from "./index.js";

describe("OpenTabletopClient campaign webhooks", () => {
  it("calls all nine routes with exact revisions and replay keys", async () => {
    const requests: Array<{
      method: string;
      url: URL;
      headers: Headers;
      body?: string;
    }> = [];
    const client = new OpenTabletopClient("https://api.test", {
      token: "session-token",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? "GET",
          url: new URL(input.toString()),
          headers: new Headers(init?.headers),
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    await client.campaignWebhooks("campaign/one");
    await client.createCampaignWebhook(
      "campaign/one",
      {
        name: "Rules relay",
        url: "https://hooks.example.test/open-tabletop",
        eventTypes: ["campaign.updated"],
        expectedCampaignUpdatedAt: "2026-07-13T12:00:00.000Z",
      },
      "create-key",
    );
    await client.updateCampaignWebhook(
      "campaign/one",
      "hook?one",
      { enabled: true, expectedUpdatedAt: "2026-07-13T12:01:00.000Z" },
      "update-key",
    );
    await client.disableCampaignWebhook(
      "campaign/one",
      "hook?one",
      "2026-07-13T12:02:00.000Z",
      "disable-key",
    );
    await client.deleteCampaignWebhook(
      "campaign/one",
      "hook?one",
      "2026-07-13T12:03:00.000Z",
      "delete-key",
    );
    await client.rotateCampaignWebhookSecret(
      "campaign/one",
      "hook?one",
      "2026-07-13T12:04:00.000Z",
      "rotate-key",
    );
    await client.campaignWebhookDeliveries("campaign/one", "hook?one", 25);
    await client.testCampaignWebhook(
      "campaign/one",
      "hook?one",
      "2026-07-13T12:05:00.000Z",
      "test-key",
    );
    await client.retryCampaignWebhookDelivery(
      "campaign/one",
      "hook?one",
      "delivery#one",
      "2026-07-13T12:06:00.000Z",
      "retry-key",
    );

    expect(requests.map(({ method, url }) => `${method} ${url.pathname}${url.search}`)).toEqual([
      "GET /api/v1/campaigns/campaign%2Fone/webhooks",
      "POST /api/v1/campaigns/campaign%2Fone/webhooks",
      "PATCH /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone",
      "POST /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/disable",
      "DELETE /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone",
      "POST /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/rotate-secret",
      "GET /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/deliveries?limit=25",
      "POST /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/test",
      "POST /api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/deliveries/delivery%23one/retry",
    ]);
    expect(requests.map(({ headers }) => headers.get("idempotency-key"))).toEqual([
      null,
      "create-key",
      "update-key",
      "disable-key",
      "delete-key",
      "rotate-key",
      null,
      "test-key",
      "retry-key",
    ]);
    expect(requests[1]?.body).toBe(
      JSON.stringify({
        name: "Rules relay",
        url: "https://hooks.example.test/open-tabletop",
        eventTypes: ["campaign.updated"],
        expectedCampaignUpdatedAt: "2026-07-13T12:00:00.000Z",
      }),
    );
    expect(requests[4]?.body).toBe(
      JSON.stringify({ expectedUpdatedAt: "2026-07-13T12:03:00.000Z" }),
    );
    expect(requests.every(({ headers }) => headers.get("authorization") === "Bearer session-token")).toBe(true);
  });
});
