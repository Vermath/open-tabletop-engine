import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api.js";
import {
  CampaignWebhooksPanel,
  campaignWebhookErrorMessage,
  campaignWebhookPaths,
} from "./campaign-webhooks-panel.js";

describe("CampaignWebhooksPanel", () => {
  it("renders an accessible human-confirmed outbound manager", () => {
    const html = renderToStaticMarkup(
      <CampaignWebhooksPanel
        campaignId="campaign/one"
        campaignUpdatedAt="2026-07-13T12:00:00.000Z"
        onCampaignUpdatedAt={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    expect(html).toContain("Outbound Webhooks");
    expect(html).toContain("Create webhook");
    expect(html).toContain("metadata-only campaign events");
    expect(html).toContain("never accept inbound campaign mutations");
    expect(html).toContain("HTTPS endpoint URL");
    expect(html).toContain("Event subscriptions (1 selected)");
    expect(html).toContain("Reload campaign webhooks");
  });

  it("encodes campaign, webhook, and delivery identifiers", () => {
    expect(campaignWebhookPaths.collection("campaign/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/webhooks",
    );
    expect(campaignWebhookPaths.webhook("campaign/one", "hook?one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone",
    );
    expect(campaignWebhookPaths.retry("campaign/one", "hook?one", "delivery#one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone/deliveries/delivery%23one/retry",
    );
  });

  it("turns stale and forbidden responses into local recovery guidance", () => {
    expect(campaignWebhookErrorMessage(new ApiError("Conflict", 409, {}, ""))).toContain(
      "Reload the list",
    );
    expect(campaignWebhookErrorMessage(new ApiError("Forbidden", 403, {}, ""))).toBe(
      "You no longer have permission to manage campaign webhooks.",
    );
  });
});
