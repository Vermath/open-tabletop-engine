import type { MapAsset } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetBlobUrl } from "./api.js";

describe("assetBlobUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => (key === "otte:sessionToken" ? "ots_test/token" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 1
    } satisfies Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("adds the active session token to managed asset blob URLs when no signed delivery URL is present", () => {
    const asset = assetFixture({
      id: "asset_generated_map",
      url: "/api/v1/assets/asset_generated_map/blob"
    });

    expect(assetBlobUrl(asset)).toBe("/api/v1/assets/asset_generated_map/blob?sessionToken=ots_test%2Ftoken");
  });

  it("prefers the active session URL over signed delivery URLs for managed in-app images", () => {
    const asset = assetFixture({
      id: "asset_signed_map",
      url: "/api/v1/assets/asset_signed_map/blob",
      deliveryUrl: "https://assets.example.test/api/v1/assets/asset_signed_map/blob?expiresAt=2026-05-24T16%3A00%3A00.000Z&signature=sig"
    });

    expect(assetBlobUrl(asset)).toBe("/api/v1/assets/asset_signed_map/blob?sessionToken=ots_test%2Ftoken");
  });

  it("normalizes trailing API base URLs for authenticated managed asset blob URLs", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/");
    vi.resetModules();
    const { assetBlobUrl: assetBlobUrlWithBase } = await import("./api.js");
    const asset = assetFixture({
      id: "asset_railway_map",
      url: "/api/v1/assets/asset_railway_map/blob"
    });

    expect(assetBlobUrlWithBase(asset)).toBe("https://api.example.test/api/v1/assets/asset_railway_map/blob?sessionToken=ots_test%2Ftoken");
  });
});

function assetFixture(overrides: Partial<MapAsset> & { deliveryUrl?: string } = {}): MapAsset & { deliveryUrl?: string } {
  return {
    id: "asset_fixture",
    campaignId: "camp_demo",
    name: "Fixture Map",
    url: "/api/v1/assets/asset_fixture/blob",
    mimeType: "image/png",
    sizeBytes: 68,
    checksum: "sha256:test",
    createdAt: "2026-05-24T10:00:00.000Z",
    updatedAt: "2026-05-24T10:00:00.000Z",
    ...overrides
  };
}
