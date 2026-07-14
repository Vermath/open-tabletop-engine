import { describe, expect, it, vi } from "vitest";

import {
  createAdminAssetMutationClient,
  type AdminAssetTransport,
} from "./admin-asset-client.js";

const targetSetHash =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function fixture() {
  const calls: Array<{
    path: string;
    body: Record<string, unknown>;
    options?: { idempotencyKey?: string };
  }> = [];
  const transport: AdminAssetTransport = {
    post: vi.fn(async (path, body, options) => {
      calls.push({
        path,
        body: body as Record<string, unknown>,
        options,
      });
      if ((body as { dryRun?: boolean }).dryRun) {
        return {
          dryRun: true,
          targetSetHash,
          assetCount: 2,
          changed: false,
          planned: 2,
          skipped: 0,
          failed: 0,
        } as never;
      }
      return {
        dryRun: false,
        targetSetHash,
        changed: true,
        deliveryId: (body as { deliveryId?: string }).deliveryId,
        status: "purged",
      } as never;
    }),
  };
  return { client: createAdminAssetMutationClient(transport), calls };
}

describe("admin asset mutation client", () => {
  it("previews and executes every set operation with K+P", async () => {
    const { client, calls } = fixture();

    await client.quarantineIntegrityFailures("integrity repair");
    await client.migrateStoredAssets();
    await client.cleanupStoredAssets();

    expect(calls).toHaveLength(6);
    for (const call of calls) expect(call.options?.idempotencyKey).toBeTruthy();
    for (let index = 0; index < calls.length; index += 2) {
      expect(calls[index]?.body).toMatchObject({ dryRun: true });
      expect(calls[index + 1]?.body).toMatchObject({
        dryRun: false,
        expectedTargetSetHash: targetSetHash,
      });
    }
  });

  it("uses the exact asset revision and one stable downstream delivery identity", async () => {
    const { client, calls } = fixture();
    const result = await client.purgeCdnCache(
      {
        assetId: "asset/one",
        name: "Map",
        updatedAt: "2026-07-13T12:00:00.000Z",
      },
      "replace stale object",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: "/api/v1/admin/assets/asset%2Fone/purge-cache",
      body: {
        reason: "replace stale object",
        expectedUpdatedAt: "2026-07-13T12:00:00.000Z",
      },
    });
    expect(calls[0]?.body.deliveryId).toBe(calls[0]?.options?.idempotencyKey);
    expect(result.deliveryId).toBe(calls[0]?.body.deliveryId);
  });

  it("refuses to execute when the preview does not contain a valid preparation token", async () => {
    let callCount = 0;
    const transport: AdminAssetTransport = {
      async post<T>() {
        callCount++;
        return {
          dryRun: true,
          targetSetHash: "not-a-target-set-hash",
        } as T;
      },
    };
    const client = createAdminAssetMutationClient(transport);

    await expect(client.migrateStoredAssets()).rejects.toThrow(
      "Asset operation asset-migrate preview did not return a valid target-set hash",
    );
    expect(callCount).toBe(1);
  });
});
