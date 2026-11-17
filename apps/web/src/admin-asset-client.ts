import { apiPost } from "./api.js";
import { operatorMutationKey } from "./admin-identity-client.js";

interface AdminAssetOperationResult {
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

interface AdminAssetRevision {
  assetId: string;
  updatedAt: string;
}

async function preparedOperation(
  path: string,
  operation: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<AdminAssetOperationResult> {
  const preview = await apiPost<AdminAssetOperationResult>(
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
  return apiPost<AdminAssetOperationResult>(
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

export function quarantineAdminAssetIntegrityFailures(reason: string, signal?: AbortSignal): Promise<AdminAssetOperationResult> {
  return preparedOperation("/api/v1/admin/assets/integrity/quarantine", "asset-quarantine", { reason }, signal);
}

export function migrateAdminStoredAssets(signal?: AbortSignal): Promise<AdminAssetOperationResult> {
  return preparedOperation("/api/v1/admin/assets/migrate", "asset-migrate", {}, signal);
}

export function cleanupAdminStoredAssets(signal?: AbortSignal): Promise<AdminAssetOperationResult> {
  return preparedOperation("/api/v1/admin/assets/cleanup", "asset-cleanup", { includeDeleted: true, includeExpired: true }, signal);
}

export function purgeAdminAssetCdnCache(
  asset: AdminAssetRevision,
  reason: string,
  signal?: AbortSignal,
): Promise<{ status: string; deliveryId: string }> {
  const deliveryId = operatorMutationKey("asset-cdn-delivery", asset.assetId);
  return apiPost<{ status: string; deliveryId: string }>(
    `/api/v1/admin/assets/${encodeURIComponent(asset.assetId)}/purge-cache`,
    {
      reason,
      expectedUpdatedAt: asset.updatedAt,
      deliveryId,
    },
    { signal, idempotencyKey: deliveryId },
  );
}
