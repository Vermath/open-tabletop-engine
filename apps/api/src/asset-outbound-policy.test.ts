import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapAsset } from "@open-tabletop/core";

import { postAssetCdnPurgeWebhook, postExternalAssetScan } from "./asset-operations.js";
import type { CampaignWebhookTransport } from "./campaign-webhooks.js";

const purgeAsset: MapAsset = {
  id: "asset_outbound_policy",
  campaignId: "camp_outbound_policy",
  name: "map.png",
  url: "/uploads/map.png",
  mimeType: "image/png",
  sizeBytes: 4,
  checksum: "sha256:c092df87ad240efa9f032f792b57f5d3812a833b47de33172f59cf70ee2f01c4",
  storage: { provider: "local", key: "camp_outbound_policy/asset_outbound_policy" },
  lifecycle: { status: "active" },
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

describe("external asset scanner outbound policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "http://127.0.0.1:9000/scan",
    "http://169.254.169.254/latest/meta-data",
    "https://localhost:9443/scan",
    "https://scanner.example.test/scan?token=secret",
    "https://user:secret@scanner.example.test/scan",
  ])("rejects unsafe scanner target %s before transport", async (url) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(postExternalAssetScan(url, Buffer.from("safe"), "image/png", "map.png")).rejects.toThrow(/scanner_(blocked|invalid)_target/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("asset CDN purge outbound policy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "http://127.0.0.1:9000/purge",
    "http://169.254.169.254/latest/meta-data",
    "https://localhost:9443/purge",
    "https://operator.example.test/purge?token=secret",
    "https://user:secret@operator.example.test/purge",
  ])("rejects unsafe purge target %s before transport", async (url) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      postAssetCdnPurgeWebhook(url, purgeAsset, "usr_admin", undefined, undefined),
    ).rejects.toThrow(/asset_cdn_purge_(blocked|invalid)_target/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("revalidates each redirect and blocks a private redirect target", async () => {
    const send = vi.fn<CampaignWebhookTransport["send"]>(async () => ({
      ok: false,
      responseStatus: 307,
      errorCode: "redirect_rejected",
      redirectLocation: "http://127.0.0.1/internal-purge",
    }));
    const validateTarget = vi.fn<CampaignWebhookTransport["validateTarget"]>(async () => ({
      ok: false,
      errorCode: "blocked_target",
      message: "blocked",
    }));
    const transport: CampaignWebhookTransport = { send, validateTarget };

    await expect(
      postAssetCdnPurgeWebhook(
        "https://operator.example.test/purge",
        purgeAsset,
        "usr_admin",
        undefined,
        undefined,
        undefined,
        transport,
      ),
    ).rejects.toThrow("asset_cdn_purge_blocked_target");
    expect(validateTarget).toHaveBeenCalledWith("http://127.0.0.1/internal-purge");
    expect(send).toHaveBeenCalledOnce();
  });
});
