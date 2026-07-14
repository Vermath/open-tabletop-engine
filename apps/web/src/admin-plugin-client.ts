import { apiPatch, apiPost, type AdminPluginReviewInfo } from "./api.js";
import { operatorMutationKey } from "./admin-identity-client.js";

interface PluginRegistrySyncResult {
  previousRegistryRevision: string;
  registryRevision: string;
  registries: unknown[];
  plugins: unknown[];
}

export function updateAdminPluginReview(
  review: AdminPluginReviewInfo,
  status: "pending" | "approved" | "rejected",
  signal?: AbortSignal,
): Promise<AdminPluginReviewInfo> {
  return apiPatch<AdminPluginReviewInfo>(
    `/api/v1/admin/plugins/reviews/${encodeURIComponent(review.review.reviewKey)}`,
    {
      status,
      expectedUpdatedAt: review.review.updatedAt,
      notes:
        status === "approved"
          ? "Approved from admin console"
          : status === "rejected"
            ? "Rejected from admin console"
            : undefined,
    },
    {
      signal,
      idempotencyKey: operatorMutationKey(
        "admin-plugin-review",
        review.review.reviewKey,
      ),
    },
  );
}

export function syncAdminPluginRegistry(
  expectedRegistryRevision: string,
  signal?: AbortSignal,
): Promise<PluginRegistrySyncResult> {
  return apiPost<PluginRegistrySyncResult>(
    "/api/v1/admin/plugins/registry/sync",
    { expectedRegistryRevision },
    {
      signal,
      idempotencyKey: operatorMutationKey(
        "admin-plugin-registry-sync",
        expectedRegistryRevision,
      ),
    },
  );
}

export function syncCampaignPluginRegistry(
  campaignId: string,
  expectedRegistryRevision: string,
  signal?: AbortSignal,
): Promise<PluginRegistrySyncResult> {
  return apiPost<PluginRegistrySyncResult>(
    "/api/v1/plugins/registry/sync",
    { campaignId, expectedRegistryRevision },
    {
      signal,
      idempotencyKey: operatorMutationKey(
        "plugin-registry-sync",
        `${campaignId}:${expectedRegistryRevision}`,
      ),
    },
  );
}
