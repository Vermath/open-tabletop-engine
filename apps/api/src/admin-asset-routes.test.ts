import { createHash } from "node:crypto";
import {
  emptyState,
  type AssetStorageRef,
  type MapAsset,
} from "@open-tabletop/core";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerAdminAssetRoutes,
  type AdminAssetRouteDependencies,
} from "./admin-asset-routes.js";
import type { AssetCleanupScheduler } from "./asset-operations.js";
import type { AssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

const body = Buffer.from("asset-bytes");

class MemoryAssetStorage implements AssetStorage {
  readonly provider = "local" as const;
  missing = false;
  reads = 0;
  puts = 0;
  deletes = 0;

  async put(asset: MapAsset): Promise<AssetStorageRef> {
    this.puts += 1;
    return { provider: "local", key: `${asset.campaignId}/${asset.id}` };
  }

  async read(): Promise<Buffer | undefined> {
    this.reads += 1;
    return this.missing ? undefined : Buffer.from(body);
  }

  async delete(): Promise<boolean> {
    this.deletes += 1;
    return true;
  }
}

function asset(): MapAsset {
  return {
    id: "asset_operator_route",
    campaignId: "camp_operator",
    name: "Operator map",
    url: "/api/v1/assets/asset_operator_route/blob",
    mimeType: "image/png",
    sizeBytes: body.length,
    checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    storage: {
      provider: "local",
      key: "camp_operator/asset_operator_route",
    },
    lifecycle: { status: "active" },
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

const scheduler: AssetCleanupScheduler = {
  start() {},
  stop() {},
  status: () => ({
    enabled: false,
    running: false,
    runOnStart: false,
    dryRun: true,
    includeDeleted: true,
    includeExpired: true,
    graceDays: 7,
    updatedByUserId: "system",
  }),
};

type WorkerExecution = { jobId: string };

async function fixture(
  overrides: Partial<AdminAssetRouteDependencies<WorkerExecution>> = {},
) {
  const state = emptyState();
  state.assets.push(asset());
  const store = new MemoryStateStore(state);
  const assetStorage = new MemoryAssetStorage();
  const app = Fastify();
  const dependencies: AdminAssetRouteDependencies<WorkerExecution> = {
    store,
    assetStorage,
    uploadDir: ".",
    assetCleanupScheduler: scheduler,
    requireServerAdmin: () => "usr_admin",
    appendReadAudit: () => {},
    appendAudit: () => {},
    workerAuthorizationRequested: () => false,
    authorizeWorker: () => {
      throw new Error("worker authorization should not run");
    },
    workerExecutionUserId: () => "usr_admin",
    appendWorkerAudit: () => {},
    ...overrides,
  };
  registerAdminAssetRoutes(app, dependencies);
  await app.ready();
  return { app, store, assetStorage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OTTE_ASSET_CDN_PURGE_WEBHOOK_URL;
});

describe("admin asset operator routes", () => {
  it("requires K and a prepared target-set hash before an asset-set mutation", async () => {
    const { app, store } = await fixture();
    try {
      const missingKey = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        payload: { dryRun: true },
      });
      expect(missingKey.statusCode).toBe(400);

      const missingPlan = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: { "idempotency-key": "asset-migrate-no-plan" },
        payload: { dryRun: false },
      });
      expect(missingPlan.statusCode).toBe(400);
      expect(missingPlan.json()).toMatchObject({
        error: "precondition_required",
      });

      const preview = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: { "idempotency-key": "asset-migrate-preview" },
        payload: { dryRun: true },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().targetSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);

      store.state.assets[0]!.updatedAt = "2026-07-13T00:01:00.000Z";
      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: { "idempotency-key": "asset-migrate-execute" },
        payload: {
          dryRun: false,
          expectedTargetSetHash: preview.json().targetSetHash,
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        error: "stale_target_set",
        currentTargetSetHash: expect.stringMatching(/^sha256:/),
      });
    } finally {
      await app.close();
    }
  });

  it("requires K+P for quarantine and cleanup and rejects changed integrity evidence", async () => {
    const { app, assetStorage } = await fixture();
    try {
      for (const url of [
        "/api/v1/admin/assets/integrity/quarantine",
        "/api/v1/admin/assets/cleanup",
      ]) {
        const missingKey = await app.inject({
          method: "POST",
          url,
          payload: { dryRun: true },
        });
        expect(missingKey.statusCode).toBe(400);

        const preview = await app.inject({
          method: "POST",
          url,
          headers: { "idempotency-key": `preview:${url}` },
          payload: { dryRun: true },
        });
        expect(preview.statusCode).toBe(200);
        expect(preview.json().targetSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);

        const execute = await app.inject({
          method: "POST",
          url,
          headers: { "idempotency-key": `execute:${url}` },
          payload: {
            dryRun: false,
            expectedTargetSetHash: preview.json().targetSetHash,
          },
        });
        expect(execute.statusCode).toBe(200);
      }

      const quarantinePreview = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/integrity/quarantine",
        headers: { "idempotency-key": "quarantine-preview-evidence" },
        payload: { dryRun: true, reason: "integrity evidence" },
      });
      assetStorage.missing = true;
      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/integrity/quarantine",
        headers: { "idempotency-key": "quarantine-execute-stale" },
        payload: {
          dryRun: false,
          reason: "integrity evidence",
          expectedTargetSetHash: quarantinePreview.json().targetSetHash,
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ error: "stale_target_set" });
    } finally {
      await app.close();
    }
  });

  it("authenticates before parsing and preserves exact worker dispatch authorization", async () => {
    const deniedAdmin = vi.fn(
      (
        reply: Parameters<
          AdminAssetRouteDependencies<WorkerExecution>["requireServerAdmin"]
        >[0],
      ) =>
        reply
          .code(403)
          .send({ error: "forbidden", message: "Server admin required" }),
    );
    const denied = await fixture({ requireServerAdmin: deniedAdmin });
    try {
      const response = await denied.app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: { "idempotency-key": "asset-denied" },
        payload: { dryRun: "invalid" },
      });
      expect(response.statusCode).toBe(403);
      expect(denied.assetStorage.reads).toBe(0);
    } finally {
      await denied.app.close();
    }

    const requireServerAdmin = vi.fn(() => "usr_admin");
    const authorizeWorker = vi.fn(() => ({
      ok: true as const,
      execution: { jobId: "job_asset_preview" },
    }));
    const appendWorkerAudit = vi.fn();
    const worker = await fixture({
      requireServerAdmin,
      workerAuthorizationRequested: () => true,
      authorizeWorker,
      appendWorkerAudit,
    });
    try {
      const response = await worker.app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/migrate",
        headers: { "idempotency-key": "worker-asset-preview" },
        payload: {
          campaignId: "camp_operator",
          dryRun: true,
          overwrite: true,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(requireServerAdmin).not.toHaveBeenCalled();
      expect(authorizeWorker).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {
          method: "POST",
          path: "/api/v1/admin/assets/migrate",
          body: {
            campaignId: "camp_operator",
            dryRun: true,
            overwrite: true,
          },
        },
      );
      expect(appendWorkerAudit).toHaveBeenCalledWith(
        { jobId: "job_asset_preview" },
        expect.objectContaining({ action: "admin.assets.migrate" }),
      );
    } finally {
      await worker.app.close();
    }
  });

  it("rejects malformed and unknown operator inputs without side effects", async () => {
    const { app, assetStorage } = await fixture();
    try {
      const cases = [
        { url: "/api/v1/admin/assets/migrate", payload: [] },
        {
          url: "/api/v1/admin/assets/migrate",
          payload: { dryRun: true, unexpected: true },
        },
        {
          url: "/api/v1/admin/assets/cleanup",
          payload: { dryRun: true, graceDays: 3651 },
        },
        {
          url: "/api/v1/admin/assets/integrity/quarantine",
          payload: { dryRun: true, assetIds: ["duplicate", "duplicate"] },
        },
        {
          url: "/api/v1/admin/assets/cleanup",
          payload: { dryRun: true, assetIds: [] },
        },
      ];
      for (const [index, input] of cases.entries()) {
        const response = await app.inject({
          method: "POST",
          url: input.url,
          headers: { "idempotency-key": `malformed-asset-${index}` },
          payload: input.payload,
        });
        expect(response.statusCode).toBe(400);
      }
      expect(assetStorage.puts).toBe(0);
      expect(assetStorage.deletes).toBe(0);
    } finally {
      await app.close();
    }
  });

  it("requires the exact asset revision and forwards X to CDN delivery", async () => {
    process.env.OTTE_ASSET_CDN_PURGE_WEBHOOK_URL =
      "https://cdn.example.test/purge";
    const fetchMock = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => new Response(undefined, { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { app, store } = await fixture();
    try {
      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/asset_operator_route/purge-cache",
        headers: { "idempotency-key": "asset-purge-stale" },
        payload: {
          expectedUpdatedAt: "2026-07-12T23:59:00.000Z",
          deliveryId: "asset-purge-stale",
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(fetchMock).not.toHaveBeenCalled();

      const missingDelivery = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/asset_operator_route/purge-cache",
        headers: { "idempotency-key": "asset-purge-no-delivery" },
        payload: { expectedUpdatedAt: store.state.assets[0]!.updatedAt },
      });
      expect(missingDelivery.statusCode).toBe(400);
      expect(missingDelivery.json()).toMatchObject({
        error: "invalid_delivery_id",
      });

      const mismatchedDelivery = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/asset_operator_route/purge-cache",
        headers: { "idempotency-key": "asset-purge-mismatch" },
        payload: {
          expectedUpdatedAt: store.state.assets[0]!.updatedAt,
          deliveryId: "different-downstream-delivery",
        },
      });
      expect(mismatchedDelivery.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();

      const purge = await app.inject({
        method: "POST",
        url: "/api/v1/admin/assets/asset_operator_route/purge-cache",
        headers: { "idempotency-key": "asset-purge-current" },
        payload: {
          reason: "replace stale cache object",
          expectedUpdatedAt: store.state.assets[0]!.updatedAt,
          deliveryId: "asset-purge-current",
        },
      });
      expect(purge.statusCode).toBe(200);
      expect(purge.json()).toMatchObject({
        status: "purged",
        deliveryId: "asset-purge-current",
      });
      const [, init] = fetchMock.mock.calls[0]!;
      expect(init?.headers).toMatchObject({
        "idempotency-key": "asset-purge-current",
        "x-open-tabletop-delivery-id": "asset-purge-current",
      });
    } finally {
      await app.close();
    }
  });
});
