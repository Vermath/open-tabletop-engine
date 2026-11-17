import { createHash, timingSafeEqual } from "node:crypto";
import type { JobType, WorkerJobRecord } from "@open-tabletop/core";

export const supportedWorkerJobTypes = [
  "campaign.export",
  "campaign.import",
  "asset.storage.migrate",
  "asset.storage.cleanup",
  "storage.backup",
  "storage.restoreDrill",
  "ai.memory.extract",
  "ai.session.recap",
  "report.bundle",
] as const satisfies readonly JobType[];

export interface WorkerPrincipal {
  workerId: string;
}

export interface WorkerIdentityRuntimePosture {
  profileEnabled: boolean;
  configured: boolean;
  ready: boolean;
  identityCount: number;
  tokenHashCount: number;
  invalidEntryCount: number;
  missingInProduction: boolean;
  invalidInProduction: boolean;
}

export interface WorkerDispatchRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

export interface CampaignImportWorkerPayload {
  archive: unknown;
  mode: "upsert" | "reject_conflicts";
  expectedUpdatedAt: string;
}

export type WorkerAuthenticationResult =
  | { ok: true; principal: WorkerPrincipal }
  | { ok: false; statusCode: 401 | 403; message: string };

interface WorkerTokenHashRecord {
  workerId: string;
  tokenHash: string;
}

interface WorkerTokenHashConfig {
  records: WorkerTokenHashRecord[];
  invalidEntryCount: number;
}

export function workerAuthorizationRequested(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return /^Worker\s+/i.test(headerValue(headers, "authorization") ?? "");
}

export function authenticateWorkerPrincipal(
  headers: Record<string, string | string[] | undefined>,
): WorkerAuthenticationResult {
  const authorization = headerValue(headers, "authorization") ?? "";
  const match = /^Worker\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim();
  if (!token || token.length > 512)
    return {
      ok: false,
      statusCode: 401,
      message: "Worker authentication required",
    };

  const requestedWorkerId = normalizeWorkerId(
    headerValue(headers, "x-otte-worker-id"),
  );
  if (!requestedWorkerId)
    return {
      ok: false,
      statusCode: 401,
      message: "Worker authentication required",
    };

  const config = workerTokenHashConfig();
  const candidateHash = hashWorkerToken(token);
  const matchingWorkerIds = new Set<string>();
  // Intentionally evaluate every configured hash. This prevents the location of a
  // match in the rotation list from becoming an early-return timing signal.
  for (const record of config.records) {
    if (constantTimeTextEqual(record.tokenHash, candidateHash))
      matchingWorkerIds.add(record.workerId);
  }
  if (
    matchingWorkerIds.size !== 1 ||
    !matchingWorkerIds.has(requestedWorkerId)
  ) {
    return {
      ok: false,
      statusCode: 403,
      message: "Worker authentication rejected",
    };
  }
  return { ok: true, principal: { workerId: requestedWorkerId } };
}

export function workerIdentityRuntimePosture(): WorkerIdentityRuntimePosture {
  const profileEnabled = process.env.OTTE_WORKER_PROFILE_ENABLED === "true";
  const config = workerTokenHashConfig();
  const identityCount = new Set(config.records.map((record) => record.workerId))
    .size;
  const configured = config.records.length > 0;
  const ready =
    !profileEnabled || (configured && config.invalidEntryCount === 0);
  const production = process.env.NODE_ENV === "production";
  return {
    profileEnabled,
    configured,
    ready,
    identityCount,
    tokenHashCount: config.records.length,
    invalidEntryCount: config.invalidEntryCount,
    missingInProduction: production && profileEnabled && !configured,
    invalidInProduction:
      production && profileEnabled && config.invalidEntryCount > 0,
  };
}

export function workerJobIdFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const value = headerValue(headers, "x-otte-worker-job-id")?.trim();
  return value && value.length <= 160 ? value : undefined;
}

export function workerLeaseRevisionFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): number | undefined {
  const value = headerValue(headers, "x-otte-worker-lease-revision")?.trim();
  if (!value || !/^\d+$/.test(value)) return undefined;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : undefined;
}

export function workerIdempotencyAuthorizationHash(
  headers: Record<string, string | string[] | undefined>,
): { workerId: string; authorizationHash: string } | undefined {
  const authentication = authenticateWorkerPrincipal(headers);
  if (!authentication.ok) return undefined;
  return {
    workerId: authentication.principal.workerId,
    authorizationHash: createHash("sha256")
      .update(
        `open-tabletop-worker-idempotency-v1\0${authentication.principal.workerId}`,
      )
      .digest("hex"),
  };
}

export function activeWorkerLeaseError(
  job: WorkerJobRecord,
  principal: WorkerPrincipal,
  presentedJobId: string | undefined,
  presentedLeaseRevision?: number,
  nowMs = Date.now(),
): string | undefined {
  if (!presentedJobId || presentedJobId !== job.id)
    return "Worker job lease rejected";
  if (job.status !== "running") return "Worker job lease rejected";
  if (job.leasedBy !== principal.workerId) return "Worker job lease rejected";
  if (
    job.leaseRevision !== undefined &&
    presentedLeaseRevision !== job.leaseRevision
  )
    return "Worker job lease rejected";
  const leaseExpiresAt = job.leaseExpiresAt
    ? Date.parse(job.leaseExpiresAt)
    : Number.NaN;
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= nowMs)
    return "Worker job lease rejected";
  return undefined;
}

export function expectedWorkerDispatch(
  job: WorkerJobRecord,
): WorkerDispatchRequest | undefined {
  if (!isRecord(job.payload) || !supportedWorkerJobTypes.includes(job.type))
    return undefined;
  const payload = job.payload;
  switch (job.type) {
    case "campaign.export": {
      const campaignId = requiredString(payload.campaignId);
      return campaignId
        ? {
            method: "GET",
            path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/export`,
          }
        : undefined;
    }
    case "campaign.import": {
      const importPayload = normalizeCampaignImportWorkerPayload(payload);
      if (!importPayload) return undefined;
      return {
        method: "POST",
        path: "/api/v1/import/campaign",
        body: importPayload,
      };
    }
    case "asset.storage.migrate": {
      const body = exactOptionalPayload(payload, {
        campaignId: "string",
        assetIds: "string[]",
        dryRun: "boolean",
        expectedTargetSetHash: "targetSetHash",
        includeDeleted: "boolean",
        overwrite: "boolean",
      });
      return body
        ? { method: "POST", path: "/api/v1/admin/assets/migrate", body }
        : undefined;
    }
    case "asset.storage.cleanup": {
      const body = exactOptionalPayload(payload, {
        campaignId: "string",
        assetIds: "string[]",
        dryRun: "boolean",
        expectedTargetSetHash: "targetSetHash",
        includeDeleted: "boolean",
        includeExpired: "boolean",
        graceDays: "number",
      });
      return body
        ? { method: "POST", path: "/api/v1/admin/assets/cleanup", body }
        : undefined;
    }
    case "storage.backup": {
      const body = exactOptionalPayload(payload, { reason: "string" });
      return body
        ? { method: "POST", path: "/api/v1/admin/storage/backup", body }
        : undefined;
    }
    case "storage.restoreDrill": {
      const body = exactOptionalPayload(payload, { backupFileName: "string" });
      return body
        ? { method: "POST", path: "/api/v1/admin/storage/restore-drill", body }
        : undefined;
    }
    case "ai.memory.extract": {
      const campaignId = requiredString(payload.campaignId);
      const expectedUpdatedAt = requiredDateTime(payload.expectedUpdatedAt);
      if (
        !campaignId ||
        !expectedUpdatedAt ||
        !optionalValueMatches(payload.sourceText, "string") ||
        (payload.visibility !== undefined &&
          payload.visibility !== "public" &&
          payload.visibility !== "gm_only")
      )
        return undefined;
      return {
        method: "POST",
        path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/ai/memory/extract`,
        body: compactRecord({
          sourceText: payload.sourceText,
          visibility: payload.visibility,
          expectedUpdatedAt,
        }),
      };
    }
    case "ai.session.recap": {
      const campaignId = requiredString(payload.campaignId);
      const expectedUpdatedAt = requiredDateTime(payload.expectedUpdatedAt);
      if (
        !campaignId ||
        !expectedUpdatedAt ||
        !optionalValueMatches(payload.sessionId, "string") ||
        !optionalValueMatches(payload.transcript, "string") ||
        !optionalValueMatches(payload.manualNotes, "string")
      )
        return undefined;
      return {
        method: "POST",
        path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/ai/session-recap`,
        body: compactRecord({
          sessionId: payload.sessionId,
          transcript: payload.transcript,
          manualNotes: payload.manualNotes,
          expectedUpdatedAt,
        }),
      };
    }
    case "report.bundle": {
      const campaignId = requiredString(payload.campaignId);
      return campaignId
        ? {
            method: "GET",
            path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dogfood-report-bundle`,
          }
        : undefined;
    }
  }
}

export function normalizeCampaignImportWorkerPayload(
  value: unknown,
): CampaignImportWorkerPayload | undefined {
  if (!isRecord(value) || !("archive" in value)) return undefined;
  if (
    Object.keys(value).some(
      (key) => !["archive", "mode", "expectedUpdatedAt"].includes(key),
    )
  )
    return undefined;
  if (
    value.mode !== undefined &&
    value.mode !== "upsert" &&
    value.mode !== "reject_conflicts"
  )
    return undefined;
  const expectedUpdatedAt = requiredDateTime(value.expectedUpdatedAt);
  if (!expectedUpdatedAt) return undefined;
  return {
    archive: value.archive,
    mode: value.mode ?? "upsert",
    expectedUpdatedAt,
  };
}

export function workerDispatchMatches(
  job: WorkerJobRecord,
  request: WorkerDispatchRequest,
): boolean {
  const expected = expectedWorkerDispatch(job);
  return Boolean(
    expected &&
    expected.method === request.method &&
    expected.path === request.path &&
    stableJson(expected.body) === stableJson(request.body),
  );
}

function workerTokenHashConfig(): WorkerTokenHashConfig {
  const raw = process.env.OTTE_WORKER_TOKEN_HASHES ?? "";
  const entries = raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const records: WorkerTokenHashRecord[] = [];
  let invalidEntryCount = 0;
  for (const entry of entries.slice(0, 64)) {
    const separator = entry.indexOf("=");
    const workerId = normalizeWorkerId(
      separator > 0 ? entry.slice(0, separator) : undefined,
    );
    const tokenHash =
      separator > 0
        ? entry
            .slice(separator + 1)
            .trim()
            .toLowerCase()
        : "";
    if (!workerId || !/^sha256:[a-f0-9]{64}$/.test(tokenHash)) {
      invalidEntryCount += 1;
      continue;
    }
    records.push({ workerId, tokenHash });
  }
  invalidEntryCount += Math.max(0, entries.length - 64);
  return { records, invalidEntryCount };
}

function hashWorkerToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    // Compare same-sized digests even for malformed values without accepting them.
    const padded = Buffer.alloc(rightBytes.length);
    leftBytes.copy(padded, 0, 0, Math.min(leftBytes.length, padded.length));
    timingSafeEqual(padded, rightBytes);
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

function normalizeWorkerId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
  )
    return undefined;
  return normalized;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name];
  const value =
    direct ??
    Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredDateTime(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Date.parse(value))
      ? value
      : undefined;
}

type OptionalPayloadKind =
  "string" | "string[]" | "boolean" | "number" | "targetSetHash";

function exactOptionalPayload(
  payload: Record<string, unknown>,
  shape: Record<string, OptionalPayloadKind>,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(shape)) {
    const value = payload[key];
    if (!optionalValueMatches(value, kind)) return undefined;
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function optionalValueMatches(
  value: unknown,
  kind: OptionalPayloadKind,
): boolean {
  if (value === undefined) return true;
  if (kind === "string") return typeof value === "string";
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (kind === "targetSetHash")
    return (
      typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value.trim())
    );
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function compactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined || typeof item === "function" || typeof item === "symbol" ? "null" : stableJson(item))).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      // Match JSON transport semantics: object properties whose values cannot
      // be represented in JSON are omitted before Fastify receives the body.
      .filter(
        (key) =>
          value[key] !== undefined &&
          typeof value[key] !== "function" &&
          typeof value[key] !== "symbol",
      )
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
