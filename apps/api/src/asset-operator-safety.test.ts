import {
  emptyState,
  type AssetStorageRef,
  type MapAsset,
} from "@open-tabletop/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AssetOperationTargetSetConflict,
  assetObjectOperationId,
  assetOperationTargetSetHash,
  cleanupStoredAssets,
  migrateStoredAssets,
  postAssetCdnPurgeWebhook,
} from "./asset-operations.js";
import type { AssetStorage } from "./asset-storage.js";
import type { CampaignWebhookTransport } from "./campaign-webhooks.js";
import { MemoryStateStore } from "./store.js";

class RecordingAssetStorage implements AssetStorage {
  readonly provider = "local" as const;
  reads = 0;
  puts = 0;
  operationIds: Array<string | undefined> = [];
  deletes = 0;

  async put(
    asset: MapAsset,
    _body: Buffer,
    options?: { operationId?: string },
  ): Promise<AssetStorageRef> {
    this.puts += 1;
    this.operationIds.push(options?.operationId);
    return { provider: "local", key: `${asset.campaignId}/${asset.id}` };
  }

  async read(): Promise<Buffer | undefined> {
    this.reads += 1;
    return Buffer.from("asset-bytes");
  }

  async delete(): Promise<boolean> {
    this.deletes += 1;
    return true;
  }
}

function asset(overrides: Partial<MapAsset> = {}): MapAsset {
  return {
    id: "asset_operator",
    campaignId: "camp_operator",
    name: "Operator map",
    url: "/api/v1/assets/asset_operator/blob",
    mimeType: "image/png",
    sizeBytes: 11,
    checksum:
      "sha256:c092df87ad240efa9f032f792b57f5d3812a833b47de33172f59cf70ee2f01c4",
    storage: { provider: "local", key: "camp_operator/asset_operator" },
    lifecycle: { status: "active" },
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("asset operator mutation safety", () => {
  it("binds prepared operations to the exact asset revisions and storage state", () => {
    const original = asset();
    const preparedHash = assetOperationTargetSetHash([original]);

    expect(assetOperationTargetSetHash([{ ...original }])).toBe(preparedHash);
    expect(
      assetOperationTargetSetHash([
        { ...original, updatedAt: "2026-07-13T00:01:00.000Z" },
      ]),
    ).not.toBe(preparedHash);
    expect(
      assetOperationTargetSetHash([
        { ...original, storage: { provider: "s3", key: "changed" } },
      ]),
    ).not.toBe(preparedHash);
    expect(
      assetOperationTargetSetHash([
        { ...original, lifecycle: { status: "archived" } },
      ]),
    ).not.toBe(preparedHash);

    const operationId = assetObjectOperationId(
      "migrate:s3",
      preparedHash,
      original,
    );
    expect(assetObjectOperationId("migrate:s3", preparedHash, original)).toBe(
      operationId,
    );
    expect(
      assetObjectOperationId("migrate:local", preparedHash, original),
    ).not.toBe(operationId);
    expect(
      assetOperationTargetSetHash([original], undefined, {
        operation: "migrate",
        overwrite: false,
      }),
    ).not.toBe(
      assetOperationTargetSetHash([original], undefined, {
        operation: "migrate",
        overwrite: true,
      }),
    );
  });

  it("keeps per-object operation identities stable from preview through execution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    const state = emptyState();
    state.assets.push(asset());
    const store = new MemoryStateStore(state);
    const storage = new RecordingAssetStorage();

    const preview = await migrateStoredAssets(store, storage, ".", {
      dryRun: true,
      overwrite: true,
    });
    const execute = await migrateStoredAssets(store, storage, ".", {
      dryRun: false,
      overwrite: true,
      expectedTargetSetHash: preview.targetSetHash as string,
    });
    const previewItems = preview.results as Array<{ operationId: string }>;
    const executeItems = execute.results as Array<{ operationId: string }>;

    expect(previewItems[0]?.operationId).toMatch(/^assetop_[a-f0-9]{32}$/);
    expect(executeItems[0]?.operationId).toBe(previewItems[0]?.operationId);
    expect(storage.reads).toBe(2);
    expect(storage.puts).toBe(1);
    expect(storage.operationIds).toEqual([previewItems[0]?.operationId]);
  });

  it("invalidates a cleanup preparation when time changes eligibility", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    const state = emptyState();
    state.assets.push(
      asset({
        lifecycle: {
          status: "deleted",
          updatedAt: "2026-07-14T00:00:00.000Z",
        },
      }),
    );
    const store = new MemoryStateStore(state);
    const storage = new RecordingAssetStorage();
    const preview = await cleanupStoredAssets(
      store,
      storage,
      ".",
      { dryRun: true, includeDeleted: true, graceDays: 0 },
      "usr_admin",
    );
    expect(preview.planned).toBe(0);

    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
    await expect(
      cleanupStoredAssets(
        store,
        storage,
        ".",
        {
          dryRun: false,
          includeDeleted: true,
          graceDays: 0,
          expectedTargetSetHash: preview.targetSetHash as string,
        },
        "usr_admin",
      ),
    ).rejects.toBeInstanceOf(AssetOperationTargetSetConflict);
    expect(storage.deletes).toBe(0);
  });

  it("rejects stale migration and cleanup plans before reading or deleting bytes", async () => {
    const state = emptyState();
    state.assets.push(asset());
    const store = new MemoryStateStore(state);
    const storage = new RecordingAssetStorage();
    const staleHash = assetOperationTargetSetHash([
      asset({ updatedAt: "2026-07-12T23:59:00.000Z" }),
    ]);

    await expect(
      migrateStoredAssets(store, storage, ".", {
        campaignId: "camp_operator",
        expectedTargetSetHash: staleHash,
      }),
    ).rejects.toMatchObject({
      name: "AssetOperationTargetSetConflict",
      currentTargetSetHash: assetOperationTargetSetHash(
        store.state.assets,
        undefined,
        {
          operation: "migrate",
          targetProvider: storage.provider,
          includeDeleted: false,
          overwrite: false,
        },
      ),
    });
    await expect(
      cleanupStoredAssets(
        store,
        storage,
        ".",
        {
          campaignId: "camp_operator",
          includeDeleted: true,
          expectedTargetSetHash: staleHash,
        },
        "usr_admin",
      ),
    ).rejects.toBeInstanceOf(AssetOperationTargetSetConflict);

    expect(storage.reads).toBe(0);
    expect(storage.deletes).toBe(0);
    expect(store.state.assets[0]).toMatchObject({
      lifecycle: { status: "active" },
    });
  });

  it("forwards a stable delivery identity to the CDN boundary", async () => {
    const send = vi.fn<CampaignWebhookTransport["send"]>(async () => ({
      ok: true,
      responseStatus: 202,
    }));
    const transport: CampaignWebhookTransport = {
      validateTarget: vi.fn(),
      send,
    };

    await postAssetCdnPurgeWebhook(
      "https://cdn-operator.example.test/purge",
      asset(),
      "usr_admin",
      "replace stale object",
      "https://cdn.example.test/api/v1/assets/asset_operator/blob",
      "delivery_asset_operator_01",
      transport,
    );

    expect(send).toHaveBeenCalledOnce();
    const [request] = send.mock.calls[0]!;
    expect(request).toMatchObject({
      url: "https://cdn-operator.example.test/purge",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "delivery_asset_operator_01",
        "x-open-tabletop-delivery-id": "delivery_asset_operator_01",
      },
    });
    expect(JSON.parse(request.body)).toMatchObject({
      assetId: "asset_operator",
      deliveryId: "delivery_asset_operator_01",
      requestedByUserId: "usr_admin",
    });
  });
});
