import { describe, expect, it, vi } from "vitest";

import {
  syncAdminPluginRegistry,
  syncCampaignPluginRegistry,
  updateAdminPluginReview,
} from "./admin-plugin-client.js";
import { apiPatch, apiPost, type AdminPluginReviewInfo } from "./api.js";

vi.mock("./api.js", () => ({ apiPatch: vi.fn(), apiPost: vi.fn() }));

const updatedAt = "2026-07-13T12:00:00.000Z";
const registryRevision =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture() {
  vi.clearAllMocks();
  const calls: Array<{
    method: string;
    path: string;
    body: Record<string, unknown>;
    options?: { idempotencyKey?: string };
  }> = [];
  vi.mocked(apiPost).mockImplementation(async (path, body, options) => {
    calls.push({
      method: "POST",
      path,
      body: body as Record<string, unknown>,
      options,
    });
    return { registryRevision } as never;
  });
  vi.mocked(apiPatch).mockImplementation(async (path, body, options) => {
    calls.push({
      method: "PATCH",
      path,
      body: body as Record<string, unknown>,
      options,
    });
    return body as never;
  });
  return { calls };
}

const review = {
  review: {
    id: "review_01",
    reviewKey: "review/key",
    pluginId: "example",
    packageId: "example-1",
    version: "1.0.0",
    checksum: "sha256:example",
    sourceType: "registry",
    status: "pending",
    createdAt: updatedAt,
    updatedAt,
  },
  plugin: {
    id: "example",
    name: "Example",
    version: "1.0.0",
    permissions: [],
  },
  source: {
    type: "registry",
    packageId: "example-1",
    manifestPath: "example/plugin.manifest.json",
    manifestChecksum: "sha256:example",
    sandbox: "vm",
  },
  distribution: { availableVersions: ["1.0.0"], latestVersion: "1.0.0" },
  trust: {
    status: "trusted",
    policy: "require_trusted",
    required: true,
    installable: true,
    errors: [],
  },
  installable: false,
} satisfies AdminPluginReviewInfo;

describe("admin plugin mutation client", () => {
  it("uses K+R for review changes", async () => {
    const { calls } = fixture();
    await updateAdminPluginReview(review, "approved");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: "/api/v1/admin/plugins/reviews/review%2Fkey",
      body: {
        status: "approved",
        expectedUpdatedAt: updatedAt,
      },
    });
    expect(calls[0]?.options?.idempotencyKey).toBeTruthy();
  });

  it("uses K+R for both registry sync entrypoints", async () => {
    const { calls } = fixture();
    await syncAdminPluginRegistry(registryRevision);
    await syncCampaignPluginRegistry("camp/one", registryRevision);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.options?.idempotencyKey).toBeTruthy();
      expect(call.body.expectedRegistryRevision).toBe(registryRevision);
    }
    expect(calls[1]?.body.campaignId).toBe("camp/one");
  });
});
