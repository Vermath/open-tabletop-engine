import { describe, expect, it, vi } from "vitest";

import {
  createAdminPluginMutationClient,
  type AdminPluginTransport,
} from "./admin-plugin-client.js";
import type { AdminPluginReviewInfo } from "./api.js";

const updatedAt = "2026-07-13T12:00:00.000Z";
const registryRevision =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture() {
  const calls: Array<{
    method: string;
    path: string;
    body: Record<string, unknown>;
    options?: { idempotencyKey?: string };
  }> = [];
  const transport: AdminPluginTransport = {
    post: vi.fn(async (path, body, options) => {
      calls.push({
        method: "POST",
        path,
        body: body as Record<string, unknown>,
        options,
      });
      return { registryRevision } as never;
    }),
    patch: vi.fn(async (path, body, options) => {
      calls.push({
        method: "PATCH",
        path,
        body: body as Record<string, unknown>,
        options,
      });
      return body as never;
    }),
  };
  return { client: createAdminPluginMutationClient(transport), calls };
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
    const { client, calls } = fixture();
    await client.updateReview(review, "approved");

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
    const { client, calls } = fixture();
    await client.syncAdminRegistry(registryRevision);
    await client.syncCampaignRegistry("camp/one", registryRevision);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.options?.idempotencyKey).toBeTruthy();
      expect(call.body.expectedRegistryRevision).toBe(registryRevision);
    }
    expect(calls[1]?.body.campaignId).toBe("camp/one");
  });
});
