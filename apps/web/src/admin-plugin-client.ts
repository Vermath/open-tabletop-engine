import { apiPatch, apiPost, type AdminPluginReviewInfo } from "./api.js";
import { operatorMutationKey } from "./admin-identity-client.js";

interface MutationOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export interface AdminPluginTransport {
  post<T>(path: string, body: unknown, options?: MutationOptions): Promise<T>;
  patch<T>(path: string, body: unknown, options?: MutationOptions): Promise<T>;
}

export interface PluginRegistrySyncResult {
  previousRegistryRevision: string;
  registryRevision: string;
  registries: unknown[];
  plugins: unknown[];
}

export interface AdminPluginMutationClient {
  updateReview(
    review: AdminPluginReviewInfo,
    status: "pending" | "approved" | "rejected",
    signal?: AbortSignal,
  ): Promise<AdminPluginReviewInfo>;
  syncAdminRegistry(
    expectedRegistryRevision: string,
    signal?: AbortSignal,
  ): Promise<PluginRegistrySyncResult>;
  syncCampaignRegistry(
    campaignId: string,
    expectedRegistryRevision: string,
    signal?: AbortSignal,
  ): Promise<PluginRegistrySyncResult>;
}

const defaultTransport: AdminPluginTransport = {
  post: apiPost,
  patch: apiPatch,
};

export function createAdminPluginMutationClient(
  transport: AdminPluginTransport = defaultTransport,
): AdminPluginMutationClient {
  return {
    updateReview: (review, status, signal) =>
      transport.patch(
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
      ),

    syncAdminRegistry: (expectedRegistryRevision, signal) =>
      transport.post(
        "/api/v1/admin/plugins/registry/sync",
        { expectedRegistryRevision },
        {
          signal,
          idempotencyKey: operatorMutationKey(
            "admin-plugin-registry-sync",
            expectedRegistryRevision,
          ),
        },
      ),

    syncCampaignRegistry: (campaignId, expectedRegistryRevision, signal) =>
      transport.post(
        "/api/v1/plugins/registry/sync",
        { campaignId, expectedRegistryRevision },
        {
          signal,
          idempotencyKey: operatorMutationKey(
            "plugin-registry-sync",
            `${campaignId}:${expectedRegistryRevision}`,
          ),
        },
      ),
  };
}
