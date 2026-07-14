import { apiPost } from "./api.js";
import { operatorMutationKey } from "./admin-identity-client.js";

interface MutationOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export interface AdminAssetTransport {
  post<T>(path: string, body: unknown, options?: MutationOptions): Promise<T>;
}

export interface AdminAssetOperationResult {
  dryRun: boolean;
  targetSetHash: string;
  assetCount: number;
  changed: boolean;
  planned: number;
  skipped: number;
  failed: number;
  matched?: number;
  archived?: number;
  migrated?: number;
  deleted?: number;
  missingMarked?: number;
  targetProvider?: string;
  reason?: string;
}

export interface AdminAssetRevision {
  assetId: string;
  name: string;
  updatedAt: string;
}

export interface AdminAssetMutationClient {
  quarantineIntegrityFailures(
    reason: string,
    signal?: AbortSignal,
  ): Promise<AdminAssetOperationResult>;
  migrateStoredAssets(signal?: AbortSignal): Promise<AdminAssetOperationResult>;
  cleanupStoredAssets(signal?: AbortSignal): Promise<AdminAssetOperationResult>;
  purgeCdnCache(
    asset: AdminAssetRevision,
    reason: string,
    signal?: AbortSignal,
  ): Promise<{ status: string; deliveryId: string }>;
}

const defaultTransport: AdminAssetTransport = { post: apiPost };

export function createAdminAssetMutationClient(
  transport: AdminAssetTransport = defaultTransport,
): AdminAssetMutationClient {
  async function preparedOperation(
    path: string,
    operation: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<AdminAssetOperationResult> {
    const preview = await transport.post<AdminAssetOperationResult>(
      path,
      { ...input, dryRun: true },
      {
        signal,
        idempotencyKey: operatorMutationKey(`${operation}-preview`, "all"),
      },
    );
    if (
      preview.dryRun !== true ||
      !/^sha256:[a-f0-9]{64}$/.test(preview.targetSetHash)
    ) {
      throw new Error(
        `Asset operation ${operation} preview did not return a valid target-set hash`,
      );
    }
    return transport.post<AdminAssetOperationResult>(
      path,
      {
        ...input,
        dryRun: false,
        expectedTargetSetHash: preview.targetSetHash,
      },
      {
        signal,
        idempotencyKey: operatorMutationKey(
          `${operation}-execute`,
          preview.targetSetHash,
        ),
      },
    );
  }

  return {
    quarantineIntegrityFailures: (reason, signal) =>
      preparedOperation(
        "/api/v1/admin/assets/integrity/quarantine",
        "asset-quarantine",
        { reason },
        signal,
      ),

    migrateStoredAssets: (signal) =>
      preparedOperation(
        "/api/v1/admin/assets/migrate",
        "asset-migrate",
        {},
        signal,
      ),

    cleanupStoredAssets: (signal) =>
      preparedOperation(
        "/api/v1/admin/assets/cleanup",
        "asset-cleanup",
        { includeDeleted: true, includeExpired: true },
        signal,
      ),

    purgeCdnCache: (asset, reason, signal) => {
      const deliveryId = operatorMutationKey(
        "asset-cdn-delivery",
        asset.assetId,
      );
      return transport.post(
        `/api/v1/admin/assets/${encodeURIComponent(asset.assetId)}/purge-cache`,
        {
          reason,
          expectedUpdatedAt: asset.updatedAt,
          deliveryId,
        },
        { signal, idempotencyKey: deliveryId },
      );
    },
  };
}
