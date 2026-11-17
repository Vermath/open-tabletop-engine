import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  AssetOperationTargetSetConflict,
  assetOperationAuditSummary,
  auditStoredAssetIntegrity,
  cleanupStoredAssets,
  globalAssetStorageInfo,
  migrateStoredAssets,
  purgeAssetCdnCache,
  quarantineAssetIntegrityFailures,
  type AssetCleanupScheduler,
  type AssetCleanupOptions,
  type AssetMigrationOptions,
  type AssetOperationOptions,
} from "./asset-operations.js";
import type { AssetStorage } from "./asset-storage.js";
import type { CampaignWebhookTransport } from "./campaign-webhooks.js";
import {
  normalizeOperatorDeliveryId,
  normalizeOperatorTargetSetHash,
} from "./operator-mutation.js";
import type { StateStore } from "./store.js";

type RequestHeaders = Record<string, string | string[] | undefined>;

export interface AdminAssetAuditInput {
  campaignId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  after?: Record<string, unknown>;
}

export interface AdminAssetWorkerRequest {
  method: "POST";
  path: string;
  body: unknown;
}

export type AdminAssetWorkerAuthorization<TWorkerExecution> =
  | { ok: true; execution: TWorkerExecution }
  | { ok: false; response: FastifyReply };

export interface AdminAssetRouteDependencies<TWorkerExecution> {
  store: StateStore;
  assetStorage: AssetStorage;
  uploadDir: string;
  assetCleanupScheduler: AssetCleanupScheduler;
  /** Test/local adapter seam; production uses the SSRF-hardened default transport. */
  assetCdnPurgeTransport?: CampaignWebhookTransport;
  requireServerAdmin(
    reply: FastifyReply,
    headers: RequestHeaders,
  ): string | FastifyReply;
  appendReadAudit(adminUserId: string, input: AdminAssetAuditInput): void;
  appendAudit(adminUserId: string, input: AdminAssetAuditInput): void;
  workerAuthorizationRequested(headers: RequestHeaders): boolean;
  authorizeWorker(
    reply: FastifyReply,
    headers: RequestHeaders,
    request: AdminAssetWorkerRequest,
  ): AdminAssetWorkerAuthorization<TWorkerExecution>;
  workerExecutionUserId(
    reply: FastifyReply,
    execution: TWorkerExecution,
  ): string | FastifyReply;
  appendWorkerAudit(
    execution: TWorkerExecution,
    input: AdminAssetAuditInput,
  ): void;
}

interface AssetSetOperationBody {
  campaignId?: string;
  assetIds?: string[];
  dryRun?: boolean;
  expectedTargetSetHash?: string;
}

interface AssetQuarantineBody extends AssetSetOperationBody {
  reason?: string;
}

interface AssetMigrationBody extends AssetSetOperationBody {
  includeDeleted?: boolean;
  overwrite?: boolean;
}

interface AssetCleanupBody extends AssetSetOperationBody {
  includeDeleted?: boolean;
  includeExpired?: boolean;
  graceDays?: number;
}

interface AssetPurgeBody {
  reason?: string;
  expectedUpdatedAt?: string;
  deliveryId?: string;
}

type AssetSetOperationKind = "quarantine" | "migration" | "cleanup";

export function registerAdminAssetRoutes<TWorkerExecution>(
  app: FastifyInstance,
  dependencies: AdminAssetRouteDependencies<TWorkerExecution>,
): void {
  const {
    store,
    assetStorage,
    uploadDir,
    assetCleanupScheduler,
    assetCdnPurgeTransport,
    requireServerAdmin,
    appendReadAudit,
    appendAudit,
    workerAuthorizationRequested,
    authorizeWorker,
    workerExecutionUserId,
    appendWorkerAudit,
  } = dependencies;

  app.get("/api/v1/admin/assets/storage", async (request, reply) => {
    const adminUserId = requireServerAdmin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const storage = globalAssetStorageInfo(
      store,
      assetStorage,
      assetCleanupScheduler.status(),
    );
    appendReadAudit(adminUserId, {
      action: "admin.assets.storageInspect",
      targetType: "asset_storage",
      after: {
        provider: storage.runtime.provider,
        assetCount: storage.assetCount,
        activeAssetCount: storage.activeAssetCount,
        usedBytes: storage.usedBytes,
        allBytes: storage.allBytes,
        operations: {
          actionRequired: storage.operations.actionRequired,
          actionReasons: storage.operations.actionReasons,
        },
      },
    });
    return storage;
  });

  app.get<{
    Querystring: {
      campaignId?: string;
      includeDeleted?: string;
      includeExpired?: string;
    };
  }>("/api/v1/admin/assets/integrity", async (request, reply) => {
    const adminUserId = requireServerAdmin(reply, request.headers);
    if (typeof adminUserId !== "string") return adminUserId;
    const campaignId = normalizeOptionalText(request.query.campaignId, 160);
    if (request.query.campaignId !== undefined && !campaignId)
      return reply.code(400).send({
        error: "bad_request",
        message:
          "campaignId must be a non-empty string of 160 characters or fewer",
      });
    const includeDeleted = queryBoolean(request.query.includeDeleted, true);
    const includeExpired = queryBoolean(request.query.includeExpired, true);
    if (includeDeleted === undefined || includeExpired === undefined)
      return reply.code(400).send({
        error: "bad_request",
        message:
          "includeDeleted and includeExpired must be booleans when provided",
      });
    const options = {
      campaignId,
      includeDeleted,
      includeExpired,
    };
    const integrity = await auditStoredAssetIntegrity(
      store,
      assetStorage,
      uploadDir,
      options,
    );
    appendReadAudit(adminUserId, {
      action: "admin.assets.integrityInspect",
      targetType: "asset_storage",
      targetId: options.campaignId,
      after: {
        campaignId: options.campaignId,
        includeDeleted: options.includeDeleted,
        includeExpired: options.includeExpired,
        provider: integrity.provider,
        assetCount: integrity.assetCount,
        verified: integrity.verified,
        missing: integrity.missing,
        mismatched: integrity.mismatched,
        cleanupEligible: integrity.cleanupEligible,
        skipped: integrity.skipped,
        failed: integrity.failed,
        actionRequired: integrity.actionRequired,
        actionReasons: integrity.actionReasons,
        healthy: integrity.healthy,
      },
    });
    return integrity;
  });

  app.post<{ Body: AssetQuarantineBody }>(
    "/api/v1/admin/assets/integrity/quarantine",
    async (request, reply) => {
      if (!requireIdempotencyKey(request, reply, "Asset quarantine"))
        return reply;
      const adminUserId = requireServerAdmin(reply, request.headers);
      if (typeof adminUserId !== "string") return adminUserId;
      const options = preparedAssetOptions<AssetQuarantineBody>(
        request.body,
        reply,
        "quarantine",
      );
      if (!options) return reply;
      try {
        const result = await quarantineAssetIntegrityFailures(
          store,
          assetStorage,
          uploadDir,
          options,
          adminUserId,
        );
        appendAudit(adminUserId, {
          action: "admin.assets.integrityQuarantine",
          targetType: "asset_storage",
          targetId: options.campaignId,
          after: assetOperationAuditSummary(result),
        });
        store.save();
        return result;
      } catch (error) {
        return assetOperationError(reply, error);
      }
    },
  );

  app.post<{ Body: AssetMigrationBody }>(
    "/api/v1/admin/assets/migrate",
    async (request, reply) => {
      if (!requireIdempotencyKey(request, reply, "Asset migration"))
        return reply;
      const authorization = authorizeAssetOperation(
        request,
        reply,
        dependencies,
      );
      if (!authorization.ok) return authorization.response;
      const options = preparedAssetOptions<AssetMigrationBody>(
        request.body,
        reply,
        "migration",
      );
      if (!options) return reply;
      try {
        const result = await migrateStoredAssets(
          store,
          assetStorage,
          uploadDir,
          options,
        );
        const audit = {
          action: "admin.assets.migrate",
          targetType: "asset_storage",
          after: assetOperationAuditSummary(result),
        } satisfies AdminAssetAuditInput;
        if (authorization.workerExecution)
          appendWorkerAudit(authorization.workerExecution, audit);
        else appendAudit(authorization.adminUserId, audit);
        store.save();
        return result;
      } catch (error) {
        return assetOperationError(reply, error);
      }
    },
  );

  app.post<{ Body: AssetCleanupBody }>(
    "/api/v1/admin/assets/cleanup",
    async (request, reply) => {
      if (!requireIdempotencyKey(request, reply, "Asset cleanup")) return reply;
      const authorization = authorizeAssetOperation(
        request,
        reply,
        dependencies,
      );
      if (!authorization.ok) return authorization.response;
      const options = preparedAssetOptions<AssetCleanupBody>(
        request.body,
        reply,
        "cleanup",
      );
      if (!options) return reply;
      let actorUserId = authorization.adminUserId;
      if (authorization.workerExecution) {
        const creatorUserId = workerExecutionUserId(
          reply,
          authorization.workerExecution,
        );
        if (typeof creatorUserId !== "string") return creatorUserId;
        actorUserId = creatorUserId;
      }
      try {
        const result = await cleanupStoredAssets(
          store,
          assetStorage,
          uploadDir,
          options,
          actorUserId,
        );
        const audit = {
          action: "admin.assets.cleanup",
          targetType: "asset_storage",
          after: assetOperationAuditSummary(result),
        } satisfies AdminAssetAuditInput;
        if (authorization.workerExecution)
          appendWorkerAudit(authorization.workerExecution, audit);
        else appendAudit(actorUserId, audit);
        store.save();
        return result;
      } catch (error) {
        return assetOperationError(reply, error);
      }
    },
  );

  app.post<{ Params: { assetId: string }; Body: AssetPurgeBody }>(
    "/api/v1/admin/assets/:assetId/purge-cache",
    async (request, reply) => {
      const idempotencyKey = requireIdempotencyKey(
        request,
        reply,
        "Asset CDN purge",
      );
      if (!idempotencyKey) return reply;
      const adminUserId = requireServerAdmin(reply, request.headers);
      if (typeof adminUserId !== "string") return adminUserId;
      const asset = store.state.assets.find(
        (item) => item.id === request.params.assetId,
      );
      if (!asset)
        return reply
          .code(404)
          .send({ error: "not_found", message: "Asset not found" });
      const body = preparedAssetPurgeBody(request.body, reply, asset.updatedAt);
      if (!body) return reply;
      if (body.deliveryId !== idempotencyKey)
        return reply.code(400).send({
          error: "invalid_delivery_id",
          message:
            "Asset CDN purge deliveryId must match the Idempotency-Key header",
        });
      const expectedUpdatedAt = body.expectedUpdatedAt;
      if (expectedUpdatedAt !== asset.updatedAt) {
        return reply.code(409).send({
          error: "stale_write",
          message:
            "Asset changed after it was loaded. Review the current revision and retry.",
          expectedUpdatedAt,
          currentUpdatedAt: asset.updatedAt,
        });
      }
      const result = await purgeAssetCdnCache(
        store,
        asset,
        adminUserId,
        {
          reason: body.reason,
          deliveryId: body.deliveryId,
        },
        assetCdnPurgeTransport,
      );
      store.save();
      if (result.status === "not_configured")
        return reply.code(400).send(result);
      if (result.status === "failed") return reply.code(502).send(result);
      return result;
    },
  );
}

function preparedAssetOptions<T extends AssetSetOperationBody>(
  rawBody: unknown,
  reply: FastifyReply,
  operation: AssetSetOperationKind,
): T | undefined {
  if (!isRecord(rawBody)) {
    reply.code(400).send({
      error: "bad_request",
      message: "Asset operation body must be a JSON object",
    });
    return undefined;
  }
  const allowedFields = new Set([
    "campaignId",
    "assetIds",
    "dryRun",
    "expectedTargetSetHash",
    ...(operation === "quarantine" ? ["reason"] : []),
    ...(operation === "migration" ? ["includeDeleted", "overwrite"] : []),
    ...(operation === "cleanup"
      ? ["includeDeleted", "includeExpired", "graceDays"]
      : []),
  ]);
  const unknownFields = Object.keys(rawBody).filter(
    (field) => !allowedFields.has(field),
  );
  if (unknownFields.length > 0) {
    reply.code(400).send({
      error: "bad_request",
      message: `Unknown asset operation fields: ${unknownFields.sort().join(", ")}`,
    });
    return undefined;
  }
  const body = rawBody as Record<string, unknown>;
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
    reply.code(400).send({
      error: "bad_request",
      message: "dryRun must be a boolean",
    });
    return undefined;
  }
  const campaignId = normalizeOptionalText(body.campaignId, 160);
  if (body.campaignId !== undefined && !campaignId) {
    reply.code(400).send({
      error: "bad_request",
      message:
        "campaignId must be a non-empty string of 160 characters or fewer",
    });
    return undefined;
  }
  const assetIds = normalizeAssetIds(body.assetIds);
  if (body.assetIds !== undefined && !assetIds) {
    reply.code(400).send({
      error: "bad_request",
      message:
        "assetIds must contain 1 to 1000 unique, non-empty strings of 160 characters or fewer",
    });
    return undefined;
  }
  for (const field of ["includeDeleted", "overwrite", "includeExpired"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      reply.code(400).send({
        error: "bad_request",
        message: `${field} must be a boolean`,
      });
      return undefined;
    }
  }
  if (
    body.graceDays !== undefined &&
    (typeof body.graceDays !== "number" ||
      !Number.isInteger(body.graceDays) ||
      body.graceDays < 0 ||
      body.graceDays > 3650)
  ) {
    reply.code(400).send({
      error: "bad_request",
      message: "graceDays must be an integer from 0 through 3650",
    });
    return undefined;
  }
  const reason = normalizeOptionalText(body.reason, 160);
  if (body.reason !== undefined && !reason) {
    reply.code(400).send({
      error: "bad_request",
      message: "reason must be a non-empty string of 160 characters or fewer",
    });
    return undefined;
  }
  const expectedTargetSetHash = normalizeOperatorTargetSetHash(
    body.expectedTargetSetHash,
  );
  if (body.expectedTargetSetHash !== undefined && !expectedTargetSetHash) {
    reply.code(400).send({
      error: "invalid_precondition",
      message: "expectedTargetSetHash must be a sha256 target-set hash",
    });
    return undefined;
  }
  if (body.dryRun !== true && !expectedTargetSetHash) {
    reply.code(400).send({
      error: "precondition_required",
      message:
        "Executing an asset operation requires expectedTargetSetHash from a dry-run preview",
    });
    return undefined;
  }
  return {
    ...(campaignId ? { campaignId } : {}),
    ...(assetIds ? { assetIds } : {}),
    ...(body.dryRun !== undefined ? { dryRun: body.dryRun } : {}),
    ...(expectedTargetSetHash ? { expectedTargetSetHash } : {}),
    ...(reason ? { reason } : {}),
    ...(body.includeDeleted !== undefined
      ? { includeDeleted: body.includeDeleted }
      : {}),
    ...(body.overwrite !== undefined ? { overwrite: body.overwrite } : {}),
    ...(body.includeExpired !== undefined
      ? { includeExpired: body.includeExpired }
      : {}),
    ...(body.graceDays !== undefined ? { graceDays: body.graceDays } : {}),
  } as T;
}

function preparedAssetPurgeBody(
  rawBody: unknown,
  reply: FastifyReply,
  currentUpdatedAt: string,
):
  | (Required<Pick<AssetPurgeBody, "expectedUpdatedAt" | "deliveryId">> &
      Pick<AssetPurgeBody, "reason">)
  | undefined {
  if (!isRecord(rawBody)) {
    reply.code(400).send({
      error: "bad_request",
      message: "Asset CDN purge body must be a JSON object",
    });
    return undefined;
  }
  const unknownFields = Object.keys(rawBody).filter(
    (field) => !["reason", "expectedUpdatedAt", "deliveryId"].includes(field),
  );
  if (unknownFields.length > 0) {
    reply.code(400).send({
      error: "bad_request",
      message: `Unknown Asset CDN purge fields: ${unknownFields.sort().join(", ")}`,
    });
    return undefined;
  }
  const expectedUpdatedAt = normalizeOptionalText(
    rawBody.expectedUpdatedAt,
    64,
  );
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    reply.code(400).send({
      error: "precondition_required",
      message: "Asset CDN purge requires a valid expectedUpdatedAt",
      currentUpdatedAt,
    });
    return undefined;
  }
  const deliveryId = normalizeOperatorDeliveryId(rawBody.deliveryId);
  if (!deliveryId) {
    reply.code(400).send({
      error: "invalid_delivery_id",
      message: "Asset CDN purge requires a valid deliveryId",
    });
    return undefined;
  }
  const reason = normalizeOptionalText(rawBody.reason, 160);
  if (rawBody.reason !== undefined && !reason) {
    reply.code(400).send({
      error: "bad_request",
      message: "reason must be a non-empty string of 160 characters or fewer",
    });
    return undefined;
  }
  return { expectedUpdatedAt, deliveryId, reason };
}

function authorizeAssetOperation<TWorkerExecution>(
  request: FastifyRequest<{ Body: AssetMigrationBody | AssetCleanupBody }>,
  reply: FastifyReply,
  dependencies: AdminAssetRouteDependencies<TWorkerExecution>,
):
  | {
      ok: true;
      adminUserId: string;
      workerExecution?: TWorkerExecution;
    }
  | { ok: false; response: FastifyReply } {
  if (dependencies.workerAuthorizationRequested(request.headers)) {
    const authorization = dependencies.authorizeWorker(reply, request.headers, {
      method: "POST",
      path: request.url,
      body: request.body ?? {},
    });
    if (!authorization.ok) return authorization;
    return {
      ok: true,
      adminUserId: "worker",
      workerExecution: authorization.execution,
    };
  }
  const adminUserId = dependencies.requireServerAdmin(reply, request.headers);
  if (typeof adminUserId !== "string")
    return { ok: false, response: adminUserId };
  return { ok: true, adminUserId };
}

function requireIdempotencyKey(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: string,
): string | undefined {
  const header = request.headers["idempotency-key"];
  const key = normalizeOperatorDeliveryId(
    Array.isArray(header) ? header[0] : header,
  );
  if (key) return key;
  reply.code(400).send({
    error: "bad_request",
    message: `${operation} requires an Idempotency-Key header`,
  });
  return undefined;
}

function assetOperationError(
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof AssetOperationTargetSetConflict) {
    return reply.code(409).send({
      error: "stale_target_set",
      message: error.message,
      currentTargetSetHash: error.currentTargetSetHash,
    });
  }
  throw error;
}

function queryBoolean(
  value: string | boolean | undefined,
  fallback: boolean,
): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function normalizeAssetIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000)
    return undefined;
  const ids = value.map((item) => normalizeOptionalText(item, 160));
  if (ids.some((id) => !id)) return undefined;
  const unique = [...new Set(ids as string[])];
  return unique.length === ids.length ? unique : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export type AdminAssetPreparedOperation =
  AssetOperationOptions | AssetMigrationOptions | AssetCleanupOptions;
