import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { basename, extname } from "node:path";
import {
  createTimestamped,
  nowIso,
  type AssetSecurityFinding,
  type AssetSecurityScan,
  type AuditLog,
  type Campaign,
  type MapAsset,
} from "@open-tabletop/core";
import { type FastifyReply } from "fastify";
import {
  createAssetStorageForProvider,
  type AssetStorage,
} from "./asset-storage.js";
import type { BuiltAssetRendition } from "./asset-renditions.js";
import { operatorTargetSetHash } from "./operator-mutation.js";
import { type StateStore } from "./store.js";
import type {
  AssetSnapshotProvider,
  SqliteBackupOptions,
  SqliteRestoreDrillOptions,
} from "./sqlite-store.js";

const DEFAULT_ASSET_QUOTA_BYTES = 1024 * 1024 * 1024;

interface AssetS3RuntimeConfig {
  configuredProvider: string;
  active: boolean;
  bucketConfigured: boolean;
  endpointConfigured: boolean;
  endpointValid: boolean;
  endpointInsecureInProduction: boolean;
  regionConfigured: boolean;
  forcePathStyle: boolean;
  explicitCredentialsConfigured: boolean;
  partialExplicitCredentials: boolean;
}

interface ExclusiveMutationCoordinator {
  runExclusive<T>(operation: () => Promise<T> | T): Promise<T>;
}

interface AdminStorageCapableStore extends StateStore {
  storageOperations(): Record<string, unknown>;
  createBackup(options?: SqliteBackupOptions): {
    status: string;
    fileName: string;
    sizeBytes: number;
    createdAt: string;
    reason?: string;
    recoveryPoint?: unknown;
    [key: string]: unknown;
  };
  runRestoreDrill(options?: SqliteRestoreDrillOptions): Record<string, unknown>;
}

interface ServerAuditLogInput {
  campaignId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}

function appendServerAuditLog(
  store: StateStore,
  adminUserId: string,
  input: ServerAuditLogInput,
): AuditLog {
  const log = createTimestamped("audit", {
    campaignId: input.campaignId,
    actorUserId: adminUserId,
    actorType: "user" as const,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
  }) satisfies AuditLog;
  store.state.auditLogs.push(log);
  return log;
}

function asAdminStorageCapableStore(
  store: StateStore,
): AdminStorageCapableStore | undefined {
  const candidate = store as Partial<AdminStorageCapableStore>;
  if (
    typeof candidate.storageOperations !== "function" ||
    typeof candidate.createBackup !== "function" ||
    typeof candidate.runRestoreDrill !== "function"
  )
    return undefined;
  return candidate as AdminStorageCapableStore;
}

function flushStore(store: StateStore): void {
  store.flush?.();
}

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envNumber(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromRecord(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFromRecord(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string")
    return error.message;
  return String(error);
}

function checksumForBuffer(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 1000
    : 0;
}

function sortTimestampsDesc(
  left: { createdAt: string },
  right: { createdAt: string },
): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function assetRecordForRendition(
  asset: MapAsset,
  rendition: Pick<
    BuiltAssetRendition,
    "kind" | "mimeType" | "sizeBytes" | "checksum" | "width" | "height"
  > & { storage?: MapAsset["storage"] },
): MapAsset {
  return {
    ...asset,
    id: `${asset.id}_${rendition.kind}`,
    name: `${asset.name} (${rendition.kind})`,
    url: "",
    mimeType: rendition.mimeType,
    sizeBytes: rendition.sizeBytes,
    checksum: rendition.checksum,
    storage: rendition.storage,
    image: { width: rendition.width, height: rendition.height },
    renditions: undefined,
  };
}

function mapAssetFromRecord(
  value: Record<string, unknown>,
): MapAsset | undefined {
  if (
    typeof value.id !== "string" ||
    typeof value.campaignId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.url !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.sizeBytes !== "number" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  )
    return undefined;
  return value as unknown as MapAsset;
}

export const assetSecurityScanner = "builtin-asset-scanner";
export const externalAssetSecurityScanner = "external-asset-scanner";
export const eicarSignature = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";
export const disallowedAssetMimeTypes = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-sh",
  "application/x-bat",
  "application/java-archive",
]);
export const disallowedAssetExtensions = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".com",
  ".scr",
  ".jar",
]);

export interface AssetSecurityScanResult {
  scanner: string;
  findings: AssetSecurityFinding[];
  blocked: boolean;
  security?: AssetSecurityScan;
}

export interface ExternalAssetScannerResponse {
  status?: string;
  scanner?: string;
  findings?: unknown[];
}

export async function scanUploadedAsset(
  body: Buffer,
  mimeType: string,
  sourceName: string,
): Promise<AssetSecurityScanResult> {
  const builtin = scanUploadedAssetBuiltIn(body, mimeType, sourceName);
  if (builtin.blocked) return builtin;
  const external = await scanUploadedAssetExternal(body, mimeType, sourceName);
  if (!external) return builtin;
  if (external.blocked) return external;
  return {
    scanner: combinedAssetSecurityScanner(builtin.scanner, external.scanner),
    findings: [...builtin.findings, ...external.findings],
    blocked: false,
    security: {
      status: "clean",
      scanner: combinedAssetSecurityScanner(builtin.scanner, external.scanner),
      scannedAt: nowIso(),
      findings: [...builtin.findings, ...external.findings],
    },
  };
}

export function scanUploadedAssetBuiltIn(
  body: Buffer,
  mimeType: string,
  sourceName: string,
): AssetSecurityScanResult {
  const findings: AssetSecurityFinding[] = [];
  const extension = extname(sourceName).toLowerCase();
  // Binary maps can be tens of megabytes. Avoid decoding and lowercasing the
  // entire file unless it is actually text-like; Buffer#indexOf still scans
  // the complete upload for the byte-exact malware test signature.
  const prefixLowerText = body
    .subarray(0, Math.min(body.length, 64 * 1024))
    .toString("utf8")
    .toLowerCase();
  const svgUpload = isSvgUpload(mimeType, extension, prefixLowerText);
  const lowerText = svgUpload
    ? body.toString("utf8").toLowerCase()
    : prefixLowerText;

  if (body.includes(Buffer.from(eicarSignature, "ascii"))) {
    findings.push({
      code: "malware_signature",
      severity: "high",
      message: "Upload matched the EICAR malware test signature",
    });
  }

  if (
    disallowedAssetMimeTypes.has(mimeType) ||
    disallowedAssetExtensions.has(extension) ||
    looksLikeExecutableMarkup(lowerText)
  ) {
    findings.push({
      code: "disallowed_asset_type",
      severity: "high",
      message:
        "Executable, script, or HTML uploads are not allowed as map assets",
    });
  }

  if (svgUpload && hasActiveSvgContent(lowerText)) {
    findings.push({
      code: "active_svg_content",
      severity: "high",
      message:
        "SVG uploads cannot contain scripts, event handlers, javascript URLs, or foreignObject content",
    });
  }

  if (findings.length > 0) {
    return { scanner: assetSecurityScanner, findings, blocked: true };
  }

  return {
    scanner: assetSecurityScanner,
    findings: [],
    blocked: false,
    security: {
      status: "clean",
      scanner: assetSecurityScanner,
      scannedAt: nowIso(),
      findings: [],
    },
  };
}

export async function scanUploadedAssetExternal(
  body: Buffer,
  mimeType: string,
  sourceName: string,
): Promise<AssetSecurityScanResult | undefined> {
  const url = process.env.OTTE_ASSET_TRUST_WEBHOOK_URL?.trim();
  if (!url) return undefined;
  const scanner =
    process.env.OTTE_ASSET_TRUST_SCANNER_NAME?.trim() ||
    externalAssetSecurityScanner;
  try {
    const response = await postExternalAssetScan(
      url,
      body,
      mimeType,
      sourceName,
    );
    return externalAssetScanResult(response, scanner);
  } catch (error) {
    const finding: AssetSecurityFinding = {
      code: "external_scanner_unavailable",
      severity: "high",
      message: `External asset scanner failed: ${errorMessage(error)}`,
    };
    if (assetTrustFailClosed()) {
      return {
        scanner,
        findings: [finding],
        blocked: true,
      };
    }
    return {
      scanner,
      findings: [{ ...finding, severity: "medium" }],
      blocked: false,
      security: {
        status: "clean",
        scanner,
        scannedAt: nowIso(),
        findings: [{ ...finding, severity: "medium" }],
      },
    };
  }
}

export async function postExternalAssetScan(
  url: string,
  body: Buffer,
  mimeType: string,
  sourceName: string,
): Promise<ExternalAssetScannerResponse> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    assetTrustWebhookTimeoutMs(),
  );
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const token = process.env.OTTE_ASSET_TRUST_WEBHOOK_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        name: sourceName,
        mimeType,
        sizeBytes: body.length,
        checksum: checksumForBuffer(body),
        contentBase64: body.toString("base64"),
      }),
    });
    if (!response.ok) throw new Error(`scanner_http_${response.status}`);
    return (await response.json()) as ExternalAssetScannerResponse;
  } finally {
    clearTimeout(timer);
  }
}

export function externalAssetScanResult(
  response: ExternalAssetScannerResponse,
  fallbackScanner: string,
): AssetSecurityScanResult {
  const scanner =
    typeof response.scanner === "string" && response.scanner.trim()
      ? response.scanner.trim().slice(0, 80)
      : fallbackScanner;
  const findings = normalizeExternalAssetFindings(response.findings);
  const status = response.status?.trim().toLowerCase();
  if (status !== "clean" && status !== "blocked")
    throw new Error("scanner_invalid_status");
  if (
    status === "blocked" ||
    findings.some((finding) => finding.severity === "high")
  ) {
    return {
      scanner,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                code: "external_scanner_blocked",
                severity: "high",
                message: "External asset scanner blocked upload",
              },
            ],
      blocked: true,
    };
  }
  return {
    scanner,
    findings,
    blocked: false,
    security: {
      status: "clean",
      scanner,
      scannedAt: nowIso(),
      findings,
    },
  };
}

export function normalizeExternalAssetFindings(
  value: unknown[] | undefined,
): AssetSecurityFinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .map((item): AssetSecurityFinding | undefined => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const severity = normalizeAssetSecuritySeverity(record.severity);
      const code =
        typeof record.code === "string" && record.code.trim()
          ? record.code.trim().slice(0, 80)
          : "external_scanner_finding";
      const message =
        typeof record.message === "string" && record.message.trim()
          ? record.message.trim().slice(0, 240)
          : "External asset scanner finding";
      return { code, severity, message };
    })
    .filter((finding): finding is AssetSecurityFinding => Boolean(finding));
}

export function normalizeAssetSecuritySeverity(
  value: unknown,
): AssetSecurityFinding["severity"] {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "low" ||
    normalized === "medium" ||
    normalized === "high"
    ? normalized
    : "high";
}

export function combinedAssetSecurityScanner(
  left: string,
  right: string,
): string {
  return left === right ? left : `${left}+${right}`;
}

export function assetTrustWebhookTimeoutMs(): number {
  const configured = Number(process.env.OTTE_ASSET_TRUST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.floor(configured), 30_000)
    : 5_000;
}

export function assetRuntimeNumberEnv(name: string): {
  name: string;
  configured: boolean;
  value?: number;
} {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return { name, configured: false };
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0
    ? { name, configured: true, value }
    : { name, configured: true };
}

export function invalidAssetRuntimeConfigEnvNames(): string[] {
  return [
    "OTTE_ASSET_QUOTA_BYTES",
    "OTTE_ASSET_RETENTION_DAYS",
    "OTTE_ASSET_URL_TTL_SECONDS",
    "OTTE_ASSET_URL_MAX_TTL_SECONDS",
    "OTTE_ASSET_CDN_PURGE_TIMEOUT_MS",
    "OTTE_ASSET_TRUST_TIMEOUT_MS",
    "OTTE_ASSET_CLEANUP_GRACE_DAYS",
    "OTTE_ASSET_CLEANUP_INTERVAL_SECONDS",
  ]
    .map(assetRuntimeNumberEnv)
    .filter((item) => item.configured && item.value === undefined)
    .map((item) => item.name);
}

export function assetRuntimeUrlEnv(name: string): {
  name: string;
  configured: boolean;
  valid: boolean;
} {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return { name, configured: false, valid: true };
  try {
    const url = new URL(rawValue);
    return {
      name,
      configured: true,
      valid: url.protocol === "http:" || url.protocol === "https:",
    };
  } catch {
    return { name, configured: true, valid: false };
  }
}

export function isLocalhostRuntimeUrl(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

export function invalidAssetRuntimeUrlEnvNames(): string[] {
  return [
    "OTTE_ASSET_CDN_BASE_URL",
    "OTTE_PUBLIC_URL",
    "OTTE_ASSET_CDN_PURGE_WEBHOOK_URL",
    "OTTE_ASSET_TRUST_WEBHOOK_URL",
  ]
    .map(assetRuntimeUrlEnv)
    .filter((item) => item.configured && !item.valid)
    .map((item) => item.name);
}

export function insecureProductionAssetRuntimeUrlEnvNames(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return [
    "OTTE_ASSET_CDN_BASE_URL",
    "OTTE_PUBLIC_URL",
    "OTTE_ASSET_CDN_PURGE_WEBHOOK_URL",
    "OTTE_ASSET_TRUST_WEBHOOK_URL",
  ].filter((name) => {
    const rawValue = process.env[name]?.trim();
    if (!rawValue) return false;
    try {
      const url = new URL(rawValue);
      return url.protocol === "http:" && !isLocalhostRuntimeUrl(url);
    } catch {
      return false;
    }
  });
}

export function assetRuntimeTokenMissingEnvNames(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const tokenPairs = [
    {
      urlEnv: "OTTE_ASSET_CDN_PURGE_WEBHOOK_URL",
      tokenEnv: "OTTE_ASSET_CDN_PURGE_WEBHOOK_TOKEN",
    },
    {
      urlEnv: "OTTE_ASSET_TRUST_WEBHOOK_URL",
      tokenEnv: "OTTE_ASSET_TRUST_WEBHOOK_TOKEN",
    },
  ];
  return tokenPairs
    .filter(({ urlEnv, tokenEnv }) => {
      const urlConfig = assetRuntimeUrlEnv(urlEnv);
      return urlConfig.configured && urlConfig.valid && !envText(tokenEnv);
    })
    .map(({ tokenEnv }) => tokenEnv);
}

export function configuredAssetStorageProvider(): string {
  return (process.env.OTTE_ASSET_STORAGE ?? "local").toLowerCase();
}

export function assetS3RuntimeEnvRelevant(
  activeStorage: AssetStorage,
): boolean {
  const configuredProvider = configuredAssetStorageProvider();
  return (
    activeStorage.provider === "s3" &&
    (configuredProvider === "s3" ||
      configuredProvider === "minio" ||
      Boolean(envText("OTTE_S3_BUCKET")) ||
      Boolean(envText("OTTE_S3_ENDPOINT")) ||
      Boolean(envText("OTTE_S3_ACCESS_KEY_ID")) ||
      Boolean(envText("OTTE_S3_SECRET_ACCESS_KEY")))
  );
}

export function assetS3EndpointRuntimeConfig(): {
  configured: boolean;
  valid: boolean;
  insecureInProduction: boolean;
} {
  const endpoint = envText("OTTE_S3_ENDPOINT");
  if (!endpoint)
    return { configured: false, valid: true, insecureInProduction: false };
  try {
    const url = new URL(endpoint);
    const valid = url.protocol === "http:" || url.protocol === "https:";
    const insecureInProduction =
      process.env.NODE_ENV === "production" &&
      url.protocol === "http:" &&
      !isLocalhostRuntimeUrl(url);
    return { configured: true, valid, insecureInProduction };
  } catch {
    return { configured: true, valid: false, insecureInProduction: false };
  }
}

export function assetS3RuntimeConfig(
  activeStorage: AssetStorage,
): AssetS3RuntimeConfig | undefined {
  if (
    activeStorage.provider !== "s3" &&
    configuredAssetStorageProvider() !== "s3" &&
    configuredAssetStorageProvider() !== "minio"
  )
    return undefined;
  const endpoint = assetS3EndpointRuntimeConfig();
  const accessKeyConfigured = Boolean(envText("OTTE_S3_ACCESS_KEY_ID"));
  const secretKeyConfigured = Boolean(envText("OTTE_S3_SECRET_ACCESS_KEY"));
  return {
    configuredProvider: configuredAssetStorageProvider(),
    active: activeStorage.provider === "s3",
    bucketConfigured: Boolean(envText("OTTE_S3_BUCKET")),
    endpointConfigured: endpoint.configured,
    endpointValid: endpoint.valid,
    endpointInsecureInProduction: endpoint.insecureInProduction,
    regionConfigured: Boolean(envText("OTTE_S3_REGION")),
    forcePathStyle: envBoolean("OTTE_S3_FORCE_PATH_STYLE", endpoint.configured),
    explicitCredentialsConfigured: accessKeyConfigured && secretKeyConfigured,
    partialExplicitCredentials: accessKeyConfigured !== secretKeyConfigured,
  };
}

export function assetTrustFailClosed(): boolean {
  return envBoolean("OTTE_ASSET_TRUST_FAIL_CLOSED", true);
}

export function assetSecurityBlocked(
  reply: FastifyReply,
  result: AssetSecurityScanResult,
): FastifyReply {
  return reply.code(422).send({
    error: "asset_security_blocked",
    message: "Asset upload failed security scan",
    scanner: result.scanner,
    findings: result.findings,
  });
}

export function isSvgUpload(
  mimeType: string,
  extension: string,
  lowerText: string,
): boolean {
  return (
    mimeType === "image/svg+xml" ||
    extension === ".svg" ||
    lowerText.includes("<svg")
  );
}

export function hasActiveSvgContent(lowerText: string): boolean {
  return (
    lowerText.includes("<script") ||
    /\son[a-z]+\s*=/.test(lowerText) ||
    lowerText.includes("javascript:") ||
    lowerText.includes("<foreignobject")
  );
}

export function looksLikeExecutableMarkup(lowerText: string): boolean {
  return (
    /^\s*<!doctype\s+html\b/.test(lowerText) ||
    /^\s*<html\b/.test(lowerText) ||
    /^\s*<script\b/.test(lowerText)
  );
}

export interface AssetOperationOptions {
  campaignId?: string;
  assetIds?: string[];
  dryRun?: boolean;
  expectedTargetSetHash?: string;
}

export interface AssetMigrationOptions extends AssetOperationOptions {
  includeDeleted?: boolean;
  overwrite?: boolean;
}

export interface AssetCleanupOptions extends AssetOperationOptions {
  includeDeleted?: boolean;
  includeExpired?: boolean;
  graceDays?: number;
}

export interface AssetIntegrityOptions extends AssetOperationOptions {
  includeDeleted?: boolean;
  includeExpired?: boolean;
}

export interface AssetCdnPurgeOptions {
  reason?: string;
  deliveryId?: string;
}

export class AssetOperationTargetSetConflict extends Error {
  readonly currentTargetSetHash: string;

  constructor(currentTargetSetHash: string) {
    super("Asset operation targets changed after the operation was prepared");
    this.name = "AssetOperationTargetSetConflict";
    this.currentTargetSetHash = currentTargetSetHash;
  }
}

export type AssetCdnPurgeStatus = "purged" | "failed" | "not_configured";

export type AssetCleanupSchedulerTrigger = "startup" | "interval";

export interface AssetCleanupSchedulerRun {
  trigger: AssetCleanupSchedulerTrigger;
  status: "succeeded" | "failed" | "skipped";
  startedAt: string;
  completedAt: string;
  assetCount?: number;
  deleted?: number;
  missingMarked?: number;
  planned?: number;
  skipped?: number;
  failed?: number;
  changed?: boolean;
  error?: string;
}

export interface AssetCleanupSchedulerStatus {
  enabled: boolean;
  running: boolean;
  runOnStart: boolean;
  dryRun: boolean;
  includeDeleted: boolean;
  includeExpired: boolean;
  graceDays: number;
  updatedByUserId: string;
  intervalSeconds?: number;
  campaignId?: string;
  lastRun?: AssetCleanupSchedulerRun;
}

export interface AssetCleanupScheduler {
  start(): void;
  stop(): void;
  status(): AssetCleanupSchedulerStatus;
}

export type StorageBackupSchedulerTrigger = "startup" | "interval";

export interface StorageBackupSchedulerRun {
  trigger: StorageBackupSchedulerTrigger;
  status: "succeeded" | "failed" | "skipped";
  startedAt: string;
  completedAt: string;
  fileName?: string;
  sizeBytes?: number;
  reason?: string;
  error?: string;
}

export interface StorageBackupSchedulerStatus {
  enabled: boolean;
  running: boolean;
  runOnStart: boolean;
  reason: string;
  intervalSeconds?: number;
  lastRun?: StorageBackupSchedulerRun;
}

export interface StorageBackupScheduler {
  start(): void;
  stop(): void;
  status(): StorageBackupSchedulerStatus;
}

export type AssetStorageOperationsSummary = Record<string, unknown> & {
  actionRequired: boolean;
  actionReasons: string[];
};

export type AssetStorageRuntimeInfo = Record<string, unknown> & {
  provider: string;
};

export type GlobalAssetStorageInfo = Record<string, unknown> & {
  assetCount: number;
  activeAssetCount: number;
  usedBytes: number;
  allBytes: number;
  runtime: AssetStorageRuntimeInfo;
  operations: AssetStorageOperationsSummary;
};

export interface AssetOperationItem {
  operationId: string;
  assetId: string;
  name: string;
  campaignId: string;
  fromProvider?: string;
  toProvider?: string;
  status:
    | "migrated"
    | "deleted"
    | "planned"
    | "skipped"
    | "failed"
    | "missing_marked"
    | "archived";
  reason?: string;
  sizeBytes?: number;
  storage?: MapAsset["storage"];
}

export interface AssetIntegrityItem {
  assetId: string;
  name: string;
  campaignId: string;
  updatedAt: string;
  provider: string;
  status:
    | "verified"
    | "missing"
    | "mismatched"
    | "cleanup_eligible"
    | "skipped"
    | "failed";
  reason?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  expectedChecksum?: string;
  actualChecksum?: string;
  storage?: MapAsset["storage"];
}

export type AssetIntegrityReport = Record<string, unknown> & {
  provider: string;
  assetCount: number;
  verified: number;
  missing: number;
  mismatched: number;
  cleanupEligible: number;
  skipped: number;
  failed: number;
  actionRequired: number;
  actionReasons: string[];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
  healthy: boolean;
  results: AssetIntegrityItem[];
};

export async function purgeAssetCdnCache(
  store: StateStore,
  asset: MapAsset,
  adminUserId: string,
  options: AssetCdnPurgeOptions,
): Promise<Record<string, unknown> & { status: AssetCdnPurgeStatus }> {
  const webhookUrl = envText("OTTE_ASSET_CDN_PURGE_WEBHOOK_URL");
  const cdnUrl = assetCdnBlobUrl(asset);
  const reason = sanitizeAssetCdnPurgeReason(options.reason);
  const base = {
    assetId: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    cdnUrl,
    reason,
    deliveryId: options.deliveryId,
  };
  if (!webhookUrl) {
    appendServerAuditLog(store, adminUserId, {
      campaignId: asset.campaignId,
      action: "admin.asset.cdnPurge",
      targetType: "asset",
      targetId: asset.id,
      after: {
        status: "not_configured",
        cdnConfigured: Boolean(envText("OTTE_ASSET_CDN_BASE_URL")),
        deliveryId: options.deliveryId,
      },
    });
    return {
      ...base,
      status: "not_configured",
      error: "asset_cdn_purge_not_configured",
    };
  }

  try {
    await postAssetCdnPurgeWebhook(
      webhookUrl,
      asset,
      adminUserId,
      reason,
      cdnUrl,
      options.deliveryId,
    );
    appendServerAuditLog(store, adminUserId, {
      campaignId: asset.campaignId,
      action: "admin.asset.cdnPurge",
      targetType: "asset",
      targetId: asset.id,
      after: {
        status: "purged",
        cdnUrl,
        reason,
        deliveryId: options.deliveryId,
      },
    });
    return { ...base, status: "purged", purgedAt: nowIso() };
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    appendServerAuditLog(store, adminUserId, {
      campaignId: asset.campaignId,
      action: "admin.asset.cdnPurge",
      targetType: "asset",
      targetId: asset.id,
      after: {
        status: "failed",
        cdnUrl,
        reason,
        deliveryId: options.deliveryId,
        error: message,
      },
    });
    return { ...base, status: "failed", error: message };
  }
}

export async function postAssetCdnPurgeWebhook(
  webhookUrl: string,
  asset: MapAsset,
  adminUserId: string,
  reason: string | undefined,
  cdnUrl: string | undefined,
  deliveryId?: string,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token = envText("OTTE_ASSET_CDN_PURGE_WEBHOOK_TOKEN");
  if (token) headers.authorization = `Bearer ${token}`;
  if (deliveryId) {
    headers["idempotency-key"] = deliveryId;
    headers["x-open-tabletop-delivery-id"] = deliveryId;
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(assetCdnPurgeWebhookTimeoutMs()),
    body: JSON.stringify({
      assetId: asset.id,
      campaignId: asset.campaignId,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum,
      blobPath: `/api/v1/assets/${asset.id}/blob`,
      cdnUrl,
      lifecycleStatus: asset.lifecycle?.status ?? "active",
      reason,
      deliveryId,
      requestedByUserId: adminUserId,
      requestedAt: nowIso(),
    }),
  });
  if (!response.ok) throw new Error(`asset_cdn_purge_http_${response.status}`);
}

export function assetCdnBlobUrl(asset: MapAsset): string | undefined {
  const cdnBaseUrl = envText("OTTE_ASSET_CDN_BASE_URL");
  if (!cdnBaseUrl) return undefined;
  return `${cdnBaseUrl.replace(/\/+$/, "")}/api/v1/assets/${asset.id}/blob`;
}

export function sanitizeAssetCdnPurgeReason(
  reason: string | undefined,
): string | undefined {
  const value = reason?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 160) : undefined;
}

export function sanitizeAssetQuarantineReason(
  reason: string | undefined,
): string | undefined {
  const value = reason?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 160) : undefined;
}

export function assetCdnPurgeWebhookTimeoutMs(): number {
  const configured = Number(process.env.OTTE_ASSET_CDN_PURGE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(Math.max(Math.floor(configured), 500), 30_000)
    : 5_000;
}

export async function migrateStoredAssets(
  store: StateStore,
  targetStorage: AssetStorage,
  uploadDir: string,
  options: AssetMigrationOptions,
): Promise<Record<string, unknown>> {
  const assets = selectAssetOperationTargets(store, options);
  const targetSetHash = assetOperationTargetSetHash(assets, undefined, {
    operation: "migrate",
    targetProvider: targetStorage.provider,
    includeDeleted: options.includeDeleted === true,
    overwrite: options.overwrite === true,
  });
  assertAssetOperationTargetSet(options.expectedTargetSetHash, targetSetHash);
  const results: AssetOperationItem[] = [];
  let migrated = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;
  let changed = false;

  for (const asset of assets) {
    const fromProvider = asset.storage?.provider ?? "unmanaged";
    const base = assetOperationBase(
      asset,
      fromProvider,
      targetStorage.provider,
      `migrate:${targetStorage.provider}`,
      targetSetHash,
    );
    if (!asset.url.startsWith("/api/v1/assets/")) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "external_asset_url",
      });
      continue;
    }
    if (asset.lifecycle?.status === "deleted" && !options.includeDeleted) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "deleted_asset" });
      continue;
    }
    if (asset.lifecycle?.storageDeletedAt) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "storage_already_deleted",
      });
      continue;
    }
    if (!options.overwrite && fromProvider === targetStorage.provider) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "already_on_target" });
      continue;
    }

    try {
      const sourceStorage = sourceStorageForAsset(
        asset,
        targetStorage,
        uploadDir,
      );
      const body = await sourceStorage.read(asset);
      if (!body) {
        failed++;
        results.push({
          ...base,
          status: "failed",
          reason: "asset_bytes_missing",
        });
        continue;
      }
      const checksum = checksumForBuffer(body);
      if (
        body.length !== asset.sizeBytes ||
        (asset.checksum && asset.checksum !== checksum)
      ) {
        failed++;
        results.push({
          ...base,
          status: "failed",
          reason: "asset_integrity_mismatch",
          sizeBytes: body.length,
        });
        continue;
      }
      if (options.dryRun) {
        planned++;
        results.push({
          ...base,
          status: "planned",
          reason: "migration_verified",
          sizeBytes: body.length,
        });
        continue;
      }
      const previousStorage = asset.storage;
      asset.storage = undefined;
      try {
        asset.storage = await targetStorage.put(asset, body, {
          operationId: base.operationId,
        });
      } catch (error) {
        asset.storage = previousStorage;
        throw error;
      }
      asset.url = `/api/v1/assets/${asset.id}/blob`;
      asset.updatedAt = nowIso();
      changed = true;
      migrated++;
      results.push({
        ...base,
        toProvider: targetStorage.provider,
        status: "migrated",
        sizeBytes: body.length,
        storage: asset.storage,
      });
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    targetSetHash,
    targetProvider: targetStorage.provider,
    assetCount: assets.length,
    migrated,
    planned,
    skipped,
    failed,
    changed,
    results,
  };
}

export async function cleanupStoredAssets(
  store: StateStore,
  activeStorage: AssetStorage,
  uploadDir: string,
  options: AssetCleanupOptions,
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const assets = selectAssetOperationTargets(store, options);
  const graceDays = assetCleanupGraceDays(options.graceDays);
  const cutoffMs = Date.now() - graceDays * 24 * 60 * 60 * 1000;
  const cleanupReasons = new Map(
    assets.map((asset) => [
      asset.id,
      assetCleanupReason(asset, options, cutoffMs),
    ]),
  );
  const targetSetHash = assetOperationTargetSetHash(
    assets,
    (asset) => ({ cleanupReason: cleanupReasons.get(asset.id) ?? null }),
    {
      operation: "cleanup",
      includeDeleted: options.includeDeleted ?? true,
      includeExpired: options.includeExpired ?? true,
      graceDays,
    },
  );
  assertAssetOperationTargetSet(options.expectedTargetSetHash, targetSetHash);
  const results: AssetOperationItem[] = [];
  let deleted = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;
  let missingMarked = 0;
  let changed = false;

  for (const asset of assets) {
    const base = assetOperationBase(
      asset,
      asset.storage?.provider ?? "unmanaged",
      activeStorage.provider,
      `cleanup:${graceDays}:${options.includeDeleted ?? true}:${options.includeExpired ?? true}`,
      targetSetHash,
    );
    const cleanupReason = cleanupReasons.get(asset.id);
    if (!cleanupReason) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "not_cleanup_eligible",
      });
      continue;
    }
    if (!asset.storage) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "no_storage_ref" });
      continue;
    }
    if (asset.lifecycle?.storageDeletedAt) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "storage_already_deleted",
      });
      continue;
    }
    if (options.dryRun) {
      planned++;
      results.push({ ...base, status: "planned", reason: cleanupReason });
      continue;
    }

    try {
      const objectDeleted = await deleteStoredAssetObjects(
        asset,
        activeStorage,
        uploadDir,
      );
      markAssetStorageDeleted(asset, cleanupReason, adminUserId);
      changed = true;
      if (objectDeleted) {
        deleted++;
        results.push({ ...base, status: "deleted", reason: cleanupReason });
      } else {
        missingMarked++;
        results.push({
          ...base,
          status: "missing_marked",
          reason: cleanupReason,
        });
      }
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    targetSetHash,
    graceDays,
    assetCount: assets.length,
    deleted,
    missingMarked,
    planned,
    skipped,
    failed,
    changed,
    results,
  };
}

export async function quarantineAssetIntegrityFailures(
  store: StateStore,
  activeStorage: AssetStorage,
  uploadDir: string,
  options: AssetOperationOptions & { reason?: string },
  adminUserId: string,
): Promise<Record<string, unknown>> {
  const integrity = await auditStoredAssetIntegrity(
    store,
    activeStorage,
    uploadDir,
    {
      campaignId: options.campaignId,
      assetIds: options.assetIds,
      includeDeleted: false,
      includeExpired: false,
    },
  );
  const actionable = new Map(
    integrity.results
      .filter(
        (item) => item.status === "missing" || item.status === "mismatched",
      )
      .map((item) => [item.assetId, item]),
  );
  const assets = selectAssetOperationTargets(store, options);
  const reason =
    sanitizeAssetQuarantineReason(options.reason) ?? "asset_integrity_failure";
  const targetSetHash = assetOperationTargetSetHash(
    assets.filter((asset) => actionable.has(asset.id)),
    (asset) => {
      const item = actionable.get(asset.id)!;
      return { integrityStatus: item.status, reason: item.reason };
    },
    { operation: "quarantine", reason },
  );
  assertAssetOperationTargetSet(options.expectedTargetSetHash, targetSetHash);
  const results: AssetOperationItem[] = [];
  let archived = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;
  let changed = false;

  for (const asset of assets) {
    const integrityItem = actionable.get(asset.id);
    const base = assetOperationBase(
      asset,
      asset.storage?.provider ?? "unmanaged",
      activeStorage.provider,
      `quarantine:${reason}`,
      targetSetHash,
    );
    if (!integrityItem) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "no_integrity_failure",
      });
      continue;
    }
    if (asset.lifecycle?.status === "deleted") {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "deleted_asset" });
      continue;
    }
    if (asset.lifecycle?.status === "archived") {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "already_archived" });
      continue;
    }
    if (options.dryRun) {
      planned++;
      results.push({
        ...base,
        status: "planned",
        reason: integrityItem.reason ?? integrityItem.status,
      });
      continue;
    }

    try {
      asset.lifecycle = {
        status: "archived",
        expiresAt: asset.lifecycle?.expiresAt,
        updatedAt: nowIso(),
        updatedByUserId: adminUserId,
        reason,
      };
      asset.updatedAt = nowIso();
      changed = true;
      archived++;
      results.push({
        ...base,
        status: "archived",
        reason: integrityItem.reason ?? integrityItem.status,
      });
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  return {
    dryRun: Boolean(options.dryRun),
    targetSetHash,
    assetCount: assets.length,
    matched: actionable.size,
    archived,
    planned,
    skipped,
    failed,
    changed,
    reason,
    results,
  };
}

export function assetOperationAuditSummary(result: Record<string, unknown>) {
  return {
    dryRun: result.dryRun,
    targetSetHash: result.targetSetHash,
    assetCount: result.assetCount,
    matched: result.matched,
    changed: result.changed,
    migrated: result.migrated,
    archived: result.archived,
    planned: result.planned,
    deleted: result.deleted,
    missingMarked: result.missingMarked,
    skipped: result.skipped,
    failed: result.failed,
    targetProvider: result.targetProvider,
    graceDays: result.graceDays,
    reason: result.reason,
  };
}

export async function auditStoredAssetIntegrity(
  store: StateStore,
  activeStorage: AssetStorage,
  uploadDir: string,
  options: AssetIntegrityOptions,
): Promise<AssetIntegrityReport> {
  const assets = selectAssetOperationTargets(store, options);
  const results: AssetIntegrityItem[] = [];
  const cutoffMs = Date.now();
  let verified = 0;
  let missing = 0;
  let mismatched = 0;
  let cleanupEligible = 0;
  let skipped = 0;
  let failed = 0;

  for (const asset of assets) {
    const base = assetIntegrityBase(asset);
    const cleanupReason = assetCleanupReason(
      asset,
      {
        includeDeleted: options.includeDeleted ?? true,
        includeExpired: options.includeExpired ?? true,
      },
      cutoffMs,
    );
    if (!asset.url.startsWith("/api/v1/assets/")) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "external_asset_url",
      });
      continue;
    }
    if (
      asset.lifecycle?.status === "deleted" &&
      options.includeDeleted === false
    ) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "deleted_asset" });
      continue;
    }
    const expiresAt = asset.lifecycle?.expiresAt
      ? Date.parse(asset.lifecycle.expiresAt)
      : Number.NaN;
    if (
      Number.isFinite(expiresAt) &&
      expiresAt <= cutoffMs &&
      options.includeExpired === false
    ) {
      skipped++;
      results.push({ ...base, status: "skipped", reason: "expired_asset" });
      continue;
    }
    if (asset.lifecycle?.storageDeletedAt) {
      skipped++;
      results.push({
        ...base,
        status: "skipped",
        reason: "storage_already_deleted",
      });
      continue;
    }
    if (cleanupReason) {
      cleanupEligible++;
      results.push({
        ...base,
        status: "cleanup_eligible",
        reason: cleanupReason,
      });
      continue;
    }
    if (!asset.storage) {
      missing++;
      results.push({ ...base, status: "missing", reason: "no_storage_ref" });
      continue;
    }

    try {
      const sourceStorage = sourceStorageForAsset(
        asset,
        activeStorage,
        uploadDir,
      );
      const body = await sourceStorage.read(asset);
      if (!body) {
        missing++;
        results.push({
          ...base,
          status: "missing",
          reason: "asset_bytes_missing",
        });
        continue;
      }
      const checksum = checksumForBuffer(body);
      if (
        body.length !== asset.sizeBytes ||
        (asset.checksum && asset.checksum !== checksum)
      ) {
        mismatched++;
        results.push({
          ...base,
          status: "mismatched",
          reason: "asset_integrity_mismatch",
          actualSizeBytes: body.length,
          actualChecksum: checksum,
        });
        continue;
      }
      verified++;
      results.push({
        ...base,
        status: "verified",
        actualSizeBytes: body.length,
        actualChecksum: checksum,
      });
    } catch (error) {
      failed++;
      results.push({ ...base, status: "failed", reason: errorMessage(error) });
    }
  }

  const actionRequired = missing + mismatched + cleanupEligible + failed;
  const actionReasons = assetIntegrityActionReasons({
    missing,
    mismatched,
    cleanupEligible,
    failed,
  });
  const remediationQueue = assetIntegrityRemediationQueue(results);
  return {
    provider: activeStorage.provider,
    assetCount: assets.length,
    verified,
    missing,
    mismatched,
    cleanupEligible,
    skipped,
    failed,
    actionRequired,
    actionReasons,
    remediationQueue,
    healthy: missing === 0 && mismatched === 0 && failed === 0,
    results,
  };
}

export function assetIntegrityActionReasons(input: {
  missing: number;
  mismatched: number;
  cleanupEligible: number;
  failed: number;
}): string[] {
  return [
    input.missing > 0 ? "missing_asset_bytes" : undefined,
    input.mismatched > 0 ? "asset_integrity_mismatches" : undefined,
    input.cleanupEligible > 0 ? "cleanup_eligible_assets" : undefined,
    input.failed > 0 ? "asset_integrity_scan_failures" : undefined,
  ].filter((reason): reason is string => Boolean(reason));
}

export function assetIntegrityRemediationQueue(results: AssetIntegrityItem[]) {
  const remediations: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }> = [];
  const missing = results.filter((item) => item.status === "missing");
  if (missing.length > 0) {
    remediations.push({
      code: "restore_missing_asset_bytes",
      severity: "error",
      action:
        "Restore missing stored bytes from backup or re-upload affected managed assets before maps or handouts break for players.",
      affectedCount: missing.length,
      samples: missing.slice(0, 4).map(assetIntegrityRemediationSample),
    });
  }
  const mismatched = results.filter((item) => item.status === "mismatched");
  if (mismatched.length > 0) {
    remediations.push({
      code: "repair_asset_integrity_mismatches",
      severity: "error",
      action:
        "Re-upload or quarantine assets whose stored bytes no longer match recorded size or checksum metadata.",
      affectedCount: mismatched.length,
      samples: mismatched.slice(0, 4).map(assetIntegrityRemediationSample),
    });
  }
  const failed = results.filter((item) => item.status === "failed");
  if (failed.length > 0) {
    remediations.push({
      code: "resolve_asset_integrity_scan_failures",
      severity: "error",
      action:
        "Fix storage provider access or object read errors, then rerun asset integrity inspection.",
      affectedCount: failed.length,
      samples: failed.slice(0, 4).map(assetIntegrityRemediationSample),
    });
  }
  const cleanupEligible = results.filter(
    (item) => item.status === "cleanup_eligible",
  );
  if (cleanupEligible.length > 0) {
    remediations.push({
      code: "run_asset_byte_cleanup",
      severity: "warning",
      action:
        "Run asset byte cleanup for deleted or expired assets that are still occupying object storage.",
      affectedCount: cleanupEligible.length,
      samples: cleanupEligible.slice(0, 4).map(assetIntegrityRemediationSample),
    });
  }
  return remediations
    .sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        right.affectedCount - left.affectedCount ||
        left.code.localeCompare(right.code),
    )
    .slice(0, 6);
}

export function assetIntegrityRemediationSample(
  item: AssetIntegrityItem,
): Record<string, unknown> {
  return {
    assetId: item.assetId,
    campaignId: item.campaignId,
    name: item.name,
    provider: item.provider,
    reason: item.reason,
    expectedSizeBytes: item.expectedSizeBytes,
    actualSizeBytes: item.actualSizeBytes,
  };
}

export function createAssetCleanupScheduler(
  store: StateStore,
  activeStorage: AssetStorage,
  uploadDir: string,
  coordinator: ExclusiveMutationCoordinator,
): AssetCleanupScheduler {
  const intervalSeconds = assetCleanupIntervalSeconds();
  const runOnStart = envBoolean("OTTE_ASSET_CLEANUP_RUN_ON_START", false);
  const enabled = runOnStart || intervalSeconds !== undefined;
  const options = scheduledAssetCleanupOptions();
  const updatedByUserId =
    envText("OTTE_ASSET_CLEANUP_USER_ID") ?? "system_asset_cleanup";
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let lastRun: AssetCleanupSchedulerRun | undefined;

  const run = async (trigger: AssetCleanupSchedulerTrigger): Promise<void> => {
    const startedAt = nowIso();
    if (running) {
      lastRun = {
        trigger,
        status: "skipped",
        startedAt,
        completedAt: nowIso(),
        error: "asset_cleanup_already_running",
      };
      return;
    }
    running = true;
    try {
      await coordinator.runExclusive(async () => {
        const result = await cleanupStoredAssets(
          store,
          activeStorage,
          uploadDir,
          options,
          updatedByUserId,
        );
        const shouldAudit = shouldAuditScheduledAssetCleanup(result);
        if (shouldAudit) {
          appendServerAuditLog(store, updatedByUserId, {
            action: "system.assets.cleanupScheduled",
            targetType: "asset_storage",
            after: {
              trigger,
              status: "succeeded",
              ...assetOperationAuditSummary(result),
            },
          });
        }
        if (result.changed || shouldAudit) {
          store.save();
          flushStore(store);
        }
        lastRun = assetCleanupSchedulerSuccess(trigger, startedAt, result);
      });
    } catch (error) {
      await coordinator.runExclusive(() => {
        appendServerAuditLog(store, updatedByUserId, {
          action: "system.assets.cleanupScheduled",
          targetType: "asset_storage",
          after: {
            trigger,
            status: "failed",
            error: errorMessage(error),
          },
        });
        store.save();
        flushStore(store);
        lastRun = {
          trigger,
          status: "failed",
          startedAt,
          completedAt: nowIso(),
          error: errorMessage(error),
        };
      });
    } finally {
      running = false;
    }
  };

  return {
    start(): void {
      if (!enabled) return;
      if (runOnStart) void run("startup");
      if (intervalSeconds === undefined) return;
      timer = setInterval(
        () => {
          void run("interval");
        },
        Math.max(100, Math.round(intervalSeconds * 1000)),
      );
      unrefTimer(timer);
    },
    stop(): void {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    status(): AssetCleanupSchedulerStatus {
      const status: AssetCleanupSchedulerStatus = {
        enabled,
        running,
        runOnStart,
        dryRun: Boolean(options.dryRun),
        includeDeleted: options.includeDeleted ?? true,
        includeExpired: options.includeExpired ?? true,
        graceDays: assetCleanupGraceDays(options.graceDays),
        updatedByUserId,
      };
      if (intervalSeconds !== undefined)
        status.intervalSeconds = intervalSeconds;
      if (options.campaignId) status.campaignId = options.campaignId;
      if (lastRun) status.lastRun = lastRun;
      return status;
    },
  };
}

export function createStorageBackupScheduler(
  store: StateStore,
  assetProvider: AssetSnapshotProvider,
  coordinator: ExclusiveMutationCoordinator,
  observeRun?: (run: StorageBackupSchedulerRun) => void,
): StorageBackupScheduler {
  const intervalSeconds = sqliteBackupIntervalSeconds();
  const runOnStart = envBoolean("OTTE_SQLITE_BACKUP_RUN_ON_START", false);
  const reason = envText("OTTE_SQLITE_BACKUP_REASON") ?? "scheduled-backup";
  const enabled = runOnStart || intervalSeconds !== undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let lastRun: StorageBackupSchedulerRun | undefined;

  const run = async (trigger: StorageBackupSchedulerTrigger): Promise<void> => {
    const startedAt = nowIso();
    if (running) {
      lastRun = {
        trigger,
        status: "skipped",
        startedAt,
        completedAt: nowIso(),
        reason,
        error: "sqlite_backup_already_running",
      };
      observeRun?.({ ...lastRun });
      return;
    }
    running = true;
    try {
      await coordinator.runExclusive(() => {
        const storageStore = asAdminStorageCapableStore(store);
        if (!storageStore)
          throw new Error(
            "SQLite storage backup is not available for the active store",
          );
        const backup = storageStore.createBackup({
          reason: `${reason}:${trigger}`,
          assetProvider,
        });
        appendServerAuditLog(store, "system_storage_backup", {
          action: "system.storage.backupScheduled",
          targetType: "storage_backup",
          targetId: backup.fileName,
          after: {
            trigger,
            status: backup.status,
            fileName: backup.fileName,
            sizeBytes: backup.sizeBytes,
            reason: backup.reason,
            recoveryPoint: backup.recoveryPoint,
          },
        });
        store.save();
        flushStore(store);
        lastRun = {
          trigger,
          status: "succeeded",
          startedAt,
          completedAt: nowIso(),
          fileName: backup.fileName,
          sizeBytes: backup.sizeBytes,
          reason: backup.reason,
        };
        observeRun?.({ ...lastRun });
      });
    } catch (error) {
      await coordinator.runExclusive(() => {
        appendServerAuditLog(store, "system_storage_backup", {
          action: "system.storage.backupScheduled",
          targetType: "storage_backup",
          after: {
            trigger,
            status: "failed",
            error: errorMessage(error),
          },
        });
        store.save();
        flushStore(store);
        lastRun = {
          trigger,
          status: "failed",
          startedAt,
          completedAt: nowIso(),
          reason,
          error: errorMessage(error),
        };
        observeRun?.({ ...lastRun });
      });
    } finally {
      running = false;
    }
  };

  return {
    start(): void {
      if (!enabled) return;
      if (runOnStart) void run("startup");
      if (intervalSeconds === undefined) return;
      timer = setInterval(
        () => {
          void run("interval");
        },
        Math.max(100, Math.round(intervalSeconds * 1000)),
      );
      unrefTimer(timer);
    },
    stop(): void {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    status(): StorageBackupSchedulerStatus {
      const status: StorageBackupSchedulerStatus = {
        enabled,
        running,
        runOnStart,
        reason,
      };
      if (intervalSeconds !== undefined)
        status.intervalSeconds = intervalSeconds;
      if (lastRun) status.lastRun = lastRun;
      return status;
    },
  };
}

export function scheduledAssetCleanupOptions(): AssetCleanupOptions {
  const options: AssetCleanupOptions = {
    dryRun: envBoolean("OTTE_ASSET_CLEANUP_DRY_RUN", false),
    includeDeleted: envBoolean("OTTE_ASSET_CLEANUP_INCLUDE_DELETED", true),
    includeExpired: envBoolean("OTTE_ASSET_CLEANUP_INCLUDE_EXPIRED", true),
    graceDays: assetCleanupGraceDays(undefined),
  };
  const campaignId = envText("OTTE_ASSET_CLEANUP_CAMPAIGN_ID");
  if (campaignId) options.campaignId = campaignId;
  return options;
}

export function assetCleanupIntervalSeconds(): number | undefined {
  const seconds = envNumber("OTTE_ASSET_CLEANUP_INTERVAL_SECONDS");
  return seconds && seconds > 0 ? seconds : undefined;
}

export function sqliteBackupIntervalSeconds(): number | undefined {
  const seconds = envNumber("OTTE_SQLITE_BACKUP_INTERVAL_SECONDS");
  return seconds && seconds > 0 ? seconds : undefined;
}

export function assetCleanupSchedulerSuccess(
  trigger: AssetCleanupSchedulerTrigger,
  startedAt: string,
  result: Record<string, unknown>,
): AssetCleanupSchedulerRun {
  const run: AssetCleanupSchedulerRun = {
    trigger,
    status: "succeeded",
    startedAt,
    completedAt: nowIso(),
  };
  const assetCount = resultNumber(result.assetCount);
  const deleted = resultNumber(result.deleted);
  const missingMarked = resultNumber(result.missingMarked);
  const planned = resultNumber(result.planned);
  const skipped = resultNumber(result.skipped);
  const failed = resultNumber(result.failed);
  if (assetCount !== undefined) run.assetCount = assetCount;
  if (deleted !== undefined) run.deleted = deleted;
  if (missingMarked !== undefined) run.missingMarked = missingMarked;
  if (planned !== undefined) run.planned = planned;
  if (skipped !== undefined) run.skipped = skipped;
  if (failed !== undefined) run.failed = failed;
  if (typeof result.changed === "boolean") run.changed = result.changed;
  return run;
}

export function shouldAuditScheduledAssetCleanup(
  result: Record<string, unknown>,
): boolean {
  if (result.changed === true) return true;
  return [
    result.planned,
    result.deleted,
    result.missingMarked,
    result.failed,
  ].some((value) => typeof value === "number" && value > 0);
}

export function resultNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function unrefTimer(timer: ReturnType<typeof setInterval>): void {
  if (
    typeof timer === "object" &&
    "unref" in timer &&
    typeof timer.unref === "function"
  )
    timer.unref();
}

export function selectAssetOperationTargets(
  store: StateStore,
  options: AssetOperationOptions,
): MapAsset[] {
  const assetIds = new Set(
    (options.assetIds ?? []).filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ),
  );
  return store.state.assets.filter((asset) => {
    if (options.campaignId && asset.campaignId !== options.campaignId)
      return false;
    if (assetIds.size > 0 && !assetIds.has(asset.id)) return false;
    return true;
  });
}

export function assetOperationTargetSetHash(
  assets: readonly MapAsset[],
  evidence?: (asset: MapAsset) => Record<string, unknown>,
  preparation?: Record<string, unknown>,
): string {
  const targets = assets
    .map((asset) => ({
      id: asset.id,
      campaignId: asset.campaignId,
      updatedAt: asset.updatedAt,
      url: asset.url,
      sizeBytes: asset.sizeBytes,
      checksum: asset.checksum,
      storage: asset.storage,
      lifecycle: asset.lifecycle,
      ...(evidence?.(asset) ?? {}),
    }))
    .sort(
      (left, right) =>
        left.campaignId.localeCompare(right.campaignId) ||
        left.id.localeCompare(right.id),
    );
  return operatorTargetSetHash(
    preparation === undefined ? targets : { preparation, targets },
  );
}

export function assertAssetOperationTargetSet(
  expectedTargetSetHash: string | undefined,
  currentTargetSetHash: string,
): void {
  if (
    expectedTargetSetHash !== undefined &&
    expectedTargetSetHash !== currentTargetSetHash
  ) {
    throw new AssetOperationTargetSetConflict(currentTargetSetHash);
  }
}

export function sourceStorageForAsset(
  asset: MapAsset,
  activeStorage: AssetStorage,
  uploadDir: string,
): AssetStorage {
  if (!asset.storage || asset.storage.provider === activeStorage.provider)
    return activeStorage;
  return createAssetStorageForProvider(asset.storage.provider, { uploadDir });
}

export async function deleteStoredAssetObjects(
  asset: MapAsset,
  activeStorage: AssetStorage,
  uploadDir: string,
): Promise<boolean> {
  // Renditions are cache objects, but deleting them first prevents orphaned bytes if original cleanup succeeds.
  for (const rendition of asset.renditions ?? []) {
    const renditionAsset = assetRecordForRendition(asset, rendition);
    const renditionStorage = sourceStorageForAsset(
      renditionAsset,
      activeStorage,
      uploadDir,
    );
    await renditionStorage.delete(renditionAsset);
  }
  const sourceStorage = sourceStorageForAsset(asset, activeStorage, uploadDir);
  return sourceStorage.delete(asset);
}

export function assetOperationBase(
  asset: MapAsset,
  fromProvider: string,
  toProvider: string,
  operation: string,
  targetSetHash: string,
): Omit<AssetOperationItem, "status"> {
  return {
    operationId: assetObjectOperationId(operation, targetSetHash, asset),
    assetId: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    fromProvider,
    toProvider,
    sizeBytes: asset.sizeBytes,
    storage: asset.storage,
  };
}

export function assetObjectOperationId(
  operation: string,
  targetSetHash: string,
  asset: Pick<MapAsset, "campaignId" | "id">,
): string {
  const digest = createHash("sha256")
    .update(operation)
    .update("\0")
    .update(targetSetHash)
    .update("\0")
    .update(asset.campaignId)
    .update("\0")
    .update(asset.id)
    .digest("hex");
  return `assetop_${digest.slice(0, 32)}`;
}

export function assetIntegrityBase(
  asset: MapAsset,
): Omit<AssetIntegrityItem, "status"> {
  return {
    assetId: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    updatedAt: asset.updatedAt,
    provider: asset.storage?.provider ?? "unmanaged",
    expectedSizeBytes: asset.sizeBytes,
    expectedChecksum: asset.checksum,
    storage: asset.storage,
  };
}

export function assetCleanupReason(
  asset: MapAsset,
  options: AssetCleanupOptions,
  cutoffMs: number,
): string | undefined {
  const includeDeleted = options.includeDeleted ?? true;
  const includeExpired = options.includeExpired ?? true;
  if (
    includeDeleted &&
    asset.lifecycle?.status === "deleted" &&
    lifecycleChangeTime(asset) <= cutoffMs
  )
    return "deleted_asset";
  const expiresAt = asset.lifecycle?.expiresAt
    ? Date.parse(asset.lifecycle.expiresAt)
    : Number.NaN;
  if (includeExpired && Number.isFinite(expiresAt) && expiresAt <= cutoffMs)
    return "expired_asset";
  return undefined;
}

export function lifecycleChangeTime(asset: MapAsset): number {
  return Date.parse(
    asset.lifecycle?.updatedAt ?? asset.updatedAt ?? asset.createdAt,
  );
}

export function assetCleanupGraceDays(requested: number | undefined): number {
  const configured =
    requested ?? Number(process.env.OTTE_ASSET_CLEANUP_GRACE_DAYS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 3650)
    : 0;
}

export function markAssetStorageDeleted(
  asset: MapAsset,
  cleanupReason: string,
  adminUserId: string,
): void {
  const updatedAt = nowIso();
  asset.lifecycle = {
    status: asset.lifecycle?.status ?? "active",
    ...asset.lifecycle,
    updatedAt,
    updatedByUserId: adminUserId,
    storageDeletedAt: updatedAt,
    cleanupReason,
  };
  asset.updatedAt = updatedAt;
}

export function defaultAssetLifecycle(): NonNullable<MapAsset["lifecycle"]> {
  return {
    status: "active",
    expiresAt: assetRetentionExpiresAt(),
  };
}

export function assetAuditSummary(asset: MapAsset): Record<string, unknown> {
  return {
    id: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    storedBytes: assetStoredBytes(asset),
    checksum: asset.checksum,
    folder: asset.folder,
    tags: asset.tags ?? [],
    storageProvider: asset.storage?.provider ?? "external",
    lifecycle: asset.lifecycle ? { ...asset.lifecycle } : undefined,
    securityStatus: asset.security?.status,
    securityFindingCount: asset.security?.findings.length ?? 0,
    image: asset.image ? { ...asset.image } : undefined,
    renditions:
      asset.renditions?.map((rendition) => ({
        kind: rendition.kind,
        mimeType: rendition.mimeType,
        sizeBytes: rendition.sizeBytes,
        checksum: rendition.checksum,
        width: rendition.width,
        height: rendition.height,
        storageProvider: rendition.storage.provider,
      })) ?? [],
  };
}

export function assetRetentionExpiresAt(): string | undefined {
  const days = assetRetentionDays();
  if (!days) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeAssetLifecycleStatus(
  value: string | undefined,
): NonNullable<MapAsset["lifecycle"]>["status"] | undefined {
  return value === "active" || value === "archived" || value === "deleted"
    ? value
    : undefined;
}

export function normalizeOptionalIsoDate(
  value: string | null | undefined,
): string | undefined {
  if (value === undefined || value === null || value.trim() === "")
    return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function normalizeAssetSizeBytes(
  value: number | undefined,
): number | undefined {
  if (value === undefined) return 0;
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export function isAssetDeliverable(asset: MapAsset): boolean {
  if (asset.lifecycle?.status === "deleted") return false;
  return (
    !asset.lifecycle?.expiresAt ||
    Date.parse(asset.lifecycle.expiresAt) > Date.now()
  );
}

export function assetQuotaExceeded(
  store: StateStore,
  campaignId: string,
  incomingBytes: number,
):
  | {
      error: string;
      message: string;
      quotaBytes: number;
      usedBytes: number;
      incomingBytes: number;
    }
  | undefined {
  const quotaBytes = assetQuotaBytes();
  if (!quotaBytes) return undefined;
  const usedBytes = campaignAssetBytes(store, campaignId);
  if (usedBytes + incomingBytes <= quotaBytes) return undefined;
  return {
    error: "asset_quota_exceeded",
    message: `Campaign asset quota of ${quotaBytes} bytes would be exceeded`,
    quotaBytes,
    usedBytes,
    incomingBytes,
  };
}

export function assetQuotaBytes(): number | undefined {
  const value = Number(process.env.OTTE_ASSET_QUOTA_BYTES);
  if (Number.isFinite(value) && value > 0) return value;
  return DEFAULT_ASSET_QUOTA_BYTES;
}

export function assetRetentionDays(): number | undefined {
  const value = Number(process.env.OTTE_ASSET_RETENTION_DAYS);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, 3650);
}

export function campaignAssetBytes(
  store: StateStore,
  campaignId: string,
): number {
  const countedAssetIds = new Set<string>();
  const storedBytes = store.state.assets
    .filter(
      (asset) =>
        asset.campaignId === campaignId &&
        asset.lifecycle?.status !== "deleted",
    )
    .reduce((total, asset) => {
      countedAssetIds.add(asset.id);
      return total + assetStoredBytes(asset);
    }, 0);
  const pendingBytes = pendingProposalAssetsForCampaign(store, campaignId)
    .filter(
      (asset) =>
        !countedAssetIds.has(asset.id) && asset.lifecycle?.status !== "deleted",
    )
    .reduce((total, asset) => total + assetStoredBytes(asset), 0);
  return storedBytes + pendingBytes;
}

export function assetStoredBytes(asset: MapAsset): number {
  return (
    asset.sizeBytes +
    (asset.renditions?.reduce(
      (total, rendition) => total + rendition.sizeBytes,
      0,
    ) ?? 0)
  );
}

export function pendingProposalAssetsForCampaign(
  store: StateStore,
  campaignId: string,
): MapAsset[] {
  const assets: MapAsset[] = [];
  const seenAssetIds = new Set<string>();
  for (const proposal of store.state.proposals) {
    if (
      proposal.campaignId !== campaignId ||
      (proposal.status !== "pending" && proposal.status !== "approved")
    )
      continue;
    for (const change of proposal.changesJson) {
      if (change.entity !== "asset" || change.action !== "create") continue;
      const asset = mapAssetFromRecord(change.data);
      if (
        !asset ||
        asset.campaignId !== campaignId ||
        seenAssetIds.has(asset.id)
      )
        continue;
      seenAssetIds.add(asset.id);
      assets.push(asset);
    }
  }
  return assets;
}

export function campaignAssetStorageInfo(
  store: StateStore,
  campaignId: string,
  activeStorage?: AssetStorage,
): Record<string, unknown> {
  const assets = store.state.assets.filter(
    (asset) => asset.campaignId === campaignId,
  );
  const pendingProposalAssets = pendingProposalAssetsForCampaign(
    store,
    campaignId,
  ).filter(
    (asset) => !assets.some((storedAsset) => storedAsset.id === asset.id),
  );
  const quotaBytes = assetQuotaBytes();
  const usedBytes = campaignAssetBytes(store, campaignId);
  const lifecycleCounts = countBy(
    assets,
    (asset) => asset.lifecycle?.status ?? "active",
  );
  const providerCounts = countBy(
    assets,
    (asset) => asset.storage?.provider ?? "external",
  );
  return {
    campaignId,
    assetCount: assets.length,
    activeAssetCount: assets.filter(
      (asset) => asset.lifecycle?.status !== "deleted",
    ).length,
    pendingProposalAssetCount: pendingProposalAssets.length,
    pendingProposalAssetBytes: pendingProposalAssets.reduce(
      (total, asset) => total + assetStoredBytes(asset),
      0,
    ),
    usedBytes,
    allBytes: assets.reduce(
      (total, asset) => total + assetStoredBytes(asset),
      0,
    ),
    quotaBytes,
    remainingBytes:
      quotaBytes === undefined
        ? undefined
        : Math.max(0, quotaBytes - usedBytes),
    lifecycleCounts,
    providerCounts,
    delivery: activeStorage
      ? campaignAssetDeliveryInfo(assets, activeStorage)
      : undefined,
    largestAssets: assets
      .slice()
      .sort((left, right) => assetStoredBytes(right) - assetStoredBytes(left))
      .slice(0, 10)
      .map((asset) => ({
        id: asset.id,
        campaignId: asset.campaignId,
        name: asset.name,
        sizeBytes: asset.sizeBytes,
        storedBytes: assetStoredBytes(asset),
        renditionBytes: assetStoredBytes(asset) - asset.sizeBytes,
        renditionCount: asset.renditions?.length ?? 0,
        provider: asset.storage?.provider ?? "external",
        lifecycleStatus: asset.lifecycle?.status ?? "active",
        expiresAt: asset.lifecycle?.expiresAt,
      })),
  };
}

export function campaignAssetDeliveryInfo(
  assets: MapAsset[],
  activeStorage: AssetStorage,
): Record<string, unknown> {
  const runtime = assetStorageRuntimeInfo(activeStorage)["delivery"] as Record<
    string,
    unknown
  >;
  const warnings = assetDeliveryOperationWarnings(activeStorage);
  const managedAssets = assets.filter((asset) =>
    asset.url.startsWith("/api/v1/assets/"),
  );
  const posture = assetDeliveryPostureSummary(managedAssets);
  const actionReasons = [
    ...warnings
      .map((warning) => stringFromRecord(warning, "code"))
      .filter((code): code is string => Boolean(code)),
    posture.undeliverableActiveAssetCount > 0
      ? "undeliverable_active_assets"
      : undefined,
    posture.expiredActiveAssetCount > 0 ? "expired_active_assets" : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    ...runtime,
    actionRequired: actionReasons.length > 0,
    actionReasons,
    warnings: warnings.map((warning) => ({
      code: stringFromRecord(warning, "code") ?? "asset_delivery_warning",
      severity: stringFromRecord(warning, "severity") ?? "warning",
      message:
        stringFromRecord(warning, "message") ??
        "Asset delivery configuration warning.",
      env: Array.isArray(warning["env"])
        ? warning["env"].filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    })),
    posture: {
      activeManagedAssetCount: posture.activeManagedAssetCount,
      deliverableActiveAssetCount: posture.deliverableActiveAssetCount,
      undeliverableActiveAssetCount: posture.undeliverableActiveAssetCount,
      expiredActiveAssetCount: posture.expiredActiveAssetCount,
      deliverableCoverageRate: posture.deliverableCoverageRate,
      cdnEligibleAssetCount: posture.cdnEligibleAssetCount,
      signedUrlEligibleAssetCount: posture.signedUrlEligibleAssetCount,
    },
  };
}

export function globalAssetStorageInfo(
  store: StateStore,
  activeStorage: AssetStorage,
  cleanupScheduler?: AssetCleanupSchedulerStatus,
): GlobalAssetStorageInfo {
  const campaignIds = [
    ...new Set([
      ...store.state.assets.map((asset) => asset.campaignId),
      ...store.state.proposals
        .filter(
          (proposal) =>
            proposal.status === "pending" || proposal.status === "approved",
        )
        .map((proposal) => proposal.campaignId),
    ]),
  ].sort();
  const campaigns = campaignIds.map((campaignId) =>
    campaignAssetStorageInfo(store, campaignId, activeStorage),
  );
  const usedBytes = campaignIds.reduce(
    (total, campaignId) => total + campaignAssetBytes(store, campaignId),
    0,
  );
  const pendingProposalAssetCount = campaignIds.reduce(
    (total, campaignId) =>
      total + pendingProposalAssetsForCampaign(store, campaignId).length,
    0,
  );
  return {
    assetCount: store.state.assets.length,
    activeAssetCount: store.state.assets.filter(
      (asset) => asset.lifecycle?.status !== "deleted",
    ).length,
    pendingProposalAssetCount,
    usedBytes,
    allBytes: store.state.assets.reduce(
      (total, asset) => total + assetStoredBytes(asset),
      0,
    ),
    providerCounts: countBy(
      store.state.assets,
      (asset) => asset.storage?.provider ?? "external",
    ),
    lifecycleCounts: countBy(
      store.state.assets,
      (asset) => asset.lifecycle?.status ?? "active",
    ),
    runtime: assetStorageRuntimeInfo(activeStorage, cleanupScheduler),
    operations: assetStorageOperationsSummary(
      store,
      activeStorage,
      cleanupScheduler,
    ),
    cleanupScheduler,
    campaigns,
  };
}

export function assetStorageOperationsSummary(
  store: StateStore,
  activeStorage: AssetStorage,
  cleanupScheduler?: AssetCleanupSchedulerStatus,
): AssetStorageOperationsSummary {
  const nowMs = Date.now();
  const quotaBytes = assetQuotaBytes();
  const managedAssets = store.state.assets.filter((asset) =>
    asset.url.startsWith("/api/v1/assets/"),
  );
  const migrationPendingAssets = managedAssets.filter(
    (asset) =>
      asset.storage?.provider &&
      asset.storage.provider !== activeStorage.provider &&
      !asset.lifecycle?.storageDeletedAt,
  );
  const cleanupPendingAssets = managedAssets.filter(
    (asset) =>
      Boolean(
        assetCleanupReason(
          asset,
          { includeDeleted: true, includeExpired: true },
          nowMs,
        ),
      ) && !asset.lifecycle?.storageDeletedAt,
  );
  const oldestCleanupEligibleAt = cleanupPendingAssets
    .map((asset) => assetCleanupEligibilityTime(asset, nowMs))
    .filter((eligibleAt): eligibleAt is number => eligibleAt !== undefined)
    .sort((left, right) => left - right)[0];
  const missingStorageRefAssets = managedAssets.filter(
    (asset) => !asset.storage && !asset.lifecycle?.storageDeletedAt,
  );
  const unscannedAssetRows = managedAssets.filter((asset) => !asset.security);
  const trustWarningAssetRows = managedAssets.filter(assetHasTrustWarnings);
  const missingStorageRefs = missingStorageRefAssets.length;
  const unscannedAssets = unscannedAssetRows.length;
  const trustWarningAssets = trustWarningAssetRows.length;
  const deliveryWarnings = assetDeliveryOperationWarnings(
    activeStorage,
    cleanupScheduler,
  );
  const deliveryPosture = assetDeliveryPostureSummary(managedAssets);
  const deliveryRuntime = assetDeliveryRuntimeOperationsSummary(store);
  const maintenanceOperations = assetMaintenanceOperationsSummary(store);
  const quotaAtRiskCampaigns =
    quotaBytes === undefined
      ? []
      : [
          ...new Set([
            ...store.state.assets.map((asset) => asset.campaignId),
            ...store.state.proposals
              .filter(
                (proposal) =>
                  proposal.status === "pending" ||
                  proposal.status === "approved",
              )
              .map((proposal) => proposal.campaignId),
          ]),
        ]
          .map((campaignId) => {
            const usedBytes = campaignAssetBytes(store, campaignId);
            return {
              campaignId,
              usedBytes,
              quotaBytes,
              usageRatio: ratio(usedBytes, quotaBytes),
              remainingBytes: Math.max(0, quotaBytes - usedBytes),
            };
          })
          .filter((campaign) => campaign.usageRatio >= 0.8)
          .sort((left, right) => right.usageRatio - left.usageRatio)
          .slice(0, 10);
  const actionReasons = assetStorageOperationActionReasons({
    quotaAtRiskCampaignCount: quotaAtRiskCampaigns.length,
    cleanupBacklogCount: cleanupPendingAssets.length,
    migrationBacklogCount: migrationPendingAssets.length,
    missingStorageRefs,
    unscannedAssets,
    trustWarningAssets,
    deliveryWarningCount: deliveryWarnings.length,
    undeliverableActiveAssetCount:
      deliveryPosture.undeliverableActiveAssetCount,
    deliveryFailureCount: deliveryRuntime.failureCount,
    maintenanceFailureCount: maintenanceOperations.failedRunCount,
  });

  return {
    actionRequired: actionReasons.length > 0,
    actionReasons,
    remediationQueue: assetStorageRemediationQueue({
      quotaAtRiskCampaigns,
      cleanupPendingAssets,
      migrationPendingAssets,
      missingStorageRefAssets,
      unscannedAssetRows,
      trustWarningAssetRows,
      missingStorageRefs,
      unscannedAssets,
      trustWarningAssets,
      deliveryWarnings,
      deliveryPosture,
      deliveryRuntime,
      maintenanceOperations,
      activeStorage,
      cleanupScheduler,
      nowMs,
    }),
    quota: {
      enabled: quotaBytes !== undefined,
      quotaBytes,
      atRiskCampaigns: quotaAtRiskCampaigns,
    },
    cleanupBacklog: {
      assetCount: cleanupPendingAssets.length,
      bytes: cleanupPendingAssets.reduce(
        (total, asset) => total + assetStoredBytes(asset),
        0,
      ),
      oldestEligibleAgeSeconds:
        oldestCleanupEligibleAt === undefined
          ? undefined
          : Math.max(0, Math.floor((nowMs - oldestCleanupEligibleAt) / 1000)),
      deletedAssetCount: cleanupPendingAssets.filter(
        (asset) => asset.lifecycle?.status === "deleted",
      ).length,
      expiredAssetCount: cleanupPendingAssets.filter((asset) => {
        const expiresAt = asset.lifecycle?.expiresAt
          ? Date.parse(asset.lifecycle.expiresAt)
          : Number.NaN;
        return Number.isFinite(expiresAt) && expiresAt <= nowMs;
      }).length,
      assets: cleanupPendingAssets
        .map((asset) => {
          const eligibleAt = assetCleanupEligibilityTime(asset, nowMs);
          return {
            assetId: asset.id,
            name: asset.name,
            campaignId: asset.campaignId,
            provider: asset.storage?.provider ?? "external",
            sizeBytes: asset.sizeBytes,
            reason:
              assetCleanupReason(
                asset,
                { includeDeleted: true, includeExpired: true },
                nowMs,
              ) ?? "unknown",
            lifecycleStatus: asset.lifecycle?.status ?? "active",
            expiresAt: asset.lifecycle?.expiresAt,
            eligibleAgeSeconds:
              eligibleAt === undefined
                ? undefined
                : Math.max(0, Math.floor((nowMs - eligibleAt) / 1000)),
          };
        })
        .sort(
          (left, right) =>
            (right.eligibleAgeSeconds ?? 0) - (left.eligibleAgeSeconds ?? 0) ||
            right.sizeBytes - left.sizeBytes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 10),
    },
    migrationBacklog: {
      targetProvider: activeStorage.provider,
      assetCount: migrationPendingAssets.length,
      bytes: migrationPendingAssets.reduce(
        (total, asset) => total + assetStoredBytes(asset),
        0,
      ),
      providerCounts: countBy(
        migrationPendingAssets,
        (asset) => asset.storage?.provider ?? "unknown",
      ),
      assets: migrationPendingAssets
        .map((asset) => ({
          assetId: asset.id,
          name: asset.name,
          campaignId: asset.campaignId,
          fromProvider: asset.storage?.provider ?? "unknown",
          toProvider: activeStorage.provider,
          sizeBytes: asset.sizeBytes,
          lifecycleStatus: asset.lifecycle?.status ?? "active",
          reason: "provider_drift",
        }))
        .sort(
          (left, right) =>
            right.sizeBytes - left.sizeBytes ||
            left.fromProvider.localeCompare(right.fromProvider) ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 10),
    },
    hygiene: {
      managedAssetCount: managedAssets.length,
      missingStorageRefs,
      unscannedAssets,
      trustWarningAssets,
      trustWarningSamples: trustWarningAssetRows
        .slice()
        .sort(
          (left, right) =>
            assetTrustWarningRank(right) - assetTrustWarningRank(left) ||
            right.sizeBytes - left.sizeBytes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 10)
        .map(assetTrustWarningSample),
    },
    maintenanceOperations,
    delivery: {
      warnings: deliveryWarnings,
      posture: deliveryPosture,
      runtime: deliveryRuntime,
      purgeOperations: assetCdnPurgeOperationsSummary(store),
    },
  };
}

export function assetStorageRemediationQueue(input: {
  quotaAtRiskCampaigns: Array<{
    campaignId: string;
    usedBytes: number;
    quotaBytes: number;
    usageRatio: number;
    remainingBytes: number;
  }>;
  cleanupPendingAssets: MapAsset[];
  migrationPendingAssets: MapAsset[];
  missingStorageRefAssets: MapAsset[];
  unscannedAssetRows: MapAsset[];
  trustWarningAssetRows: MapAsset[];
  missingStorageRefs: number;
  unscannedAssets: number;
  trustWarningAssets: number;
  deliveryWarnings: Array<Record<string, unknown>>;
  deliveryPosture: ReturnType<typeof assetDeliveryPostureSummary>;
  deliveryRuntime: ReturnType<typeof assetDeliveryRuntimeOperationsSummary>;
  maintenanceOperations: ReturnType<typeof assetMaintenanceOperationsSummary>;
  activeStorage: AssetStorage;
  cleanupScheduler?: AssetCleanupSchedulerStatus;
  nowMs: number;
}) {
  const remediations: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    bytes?: number;
    samples?: Array<Record<string, unknown>>;
  }> = [];
  if (input.deliveryWarnings.length > 0) {
    remediations.push({
      code: "fix_asset_delivery_configuration",
      severity: input.deliveryWarnings.some(
        (warning) => warning.severity === "error",
      )
        ? "error"
        : "warning",
      action:
        "Configure signing secrets, CDN purge webhooks, or production storage before relying on asset delivery in production.",
      affectedCount: input.deliveryWarnings.length,
      samples: input.deliveryWarnings.slice(0, 5).map((warning) => ({
        code: warning.code,
        severity: warning.severity,
        message: warning.message,
        env: Array.isArray(warning.env) ? warning.env : undefined,
      })),
    });
  }
  if (input.deliveryPosture.undeliverableActiveAssetCount > 0) {
    remediations.push({
      code: "repair_asset_delivery_refs",
      severity: "error",
      action:
        "Repair active managed assets that cannot be served because their storage reference or object bytes have been removed.",
      affectedCount: input.deliveryPosture.undeliverableActiveAssetCount,
      bytes: input.deliveryPosture.undeliverableActiveBytes,
      samples: input.deliveryPosture.undeliverableSamples.slice(0, 5),
    });
  }
  if (input.deliveryRuntime.failureCount > 0) {
    remediations.push({
      code: "investigate_asset_delivery_failures",
      severity: "error",
      action:
        "Investigate recent denied, unavailable, or missing-byte asset delivery events before relying on CDN or signed delivery.",
      affectedCount: input.deliveryRuntime.failureCount,
      bytes: input.deliveryRuntime.failedBytes,
      samples: input.deliveryRuntime.recentFailures
        .slice(0, 5)
        .map((event) => ({
          assetId: event.assetId,
          campaignId: event.campaignId,
          status: event.status,
          accessMode: event.accessMode,
          reason: event.reason,
          createdAt: event.createdAt,
        })),
    });
  }
  if (input.maintenanceOperations.failedRunCount > 0) {
    remediations.push({
      code: "review_asset_maintenance_failures",
      severity: "error",
      action:
        "Review failed asset migration, cleanup, or quarantine runs before retrying production storage maintenance.",
      affectedCount: input.maintenanceOperations.failedRunCount,
      samples: input.maintenanceOperations.recentRuns
        .filter((run) => run.failed > 0)
        .slice(0, 5)
        .map((run) => ({
          id: run.id,
          operation: run.operation,
          campaignId: run.campaignId,
          dryRun: run.dryRun,
          assetCount: run.assetCount,
          failed: run.failed,
          createdAt: run.createdAt,
        })),
    });
  }
  if (input.quotaAtRiskCampaigns.length > 0) {
    remediations.push({
      code: "reduce_asset_quota_pressure",
      severity: "warning",
      action:
        "Review largest assets in quota-risk campaigns, remove unused uploads, or raise the configured campaign quota.",
      affectedCount: input.quotaAtRiskCampaigns.length,
      bytes: input.quotaAtRiskCampaigns.reduce(
        (total, campaign) => total + campaign.usedBytes,
        0,
      ),
      samples: input.quotaAtRiskCampaigns.slice(0, 5).map((campaign) => ({
        campaignId: campaign.campaignId,
        usageRatio: campaign.usageRatio,
        remainingBytes: campaign.remainingBytes,
      })),
    });
  }
  if (input.cleanupPendingAssets.length > 0) {
    if (
      process.env.NODE_ENV === "production" &&
      !input.cleanupScheduler?.enabled
    ) {
      remediations.push({
        code: "configure_asset_cleanup_scheduler",
        severity: "warning",
        action:
          "Configure scheduled asset cleanup so deleted or expired object bytes are reclaimed automatically in production.",
        affectedCount: input.cleanupPendingAssets.length,
        bytes: input.cleanupPendingAssets.reduce(
          (total, asset) => total + assetStoredBytes(asset),
          0,
        ),
        samples: input.cleanupPendingAssets
          .slice()
          .sort(
            (left, right) =>
              (assetCleanupEligibilityTime(left, input.nowMs) ?? input.nowMs) -
              (assetCleanupEligibilityTime(right, input.nowMs) ?? input.nowMs),
          )
          .slice(0, 5)
          .map((asset) => ({
            assetId: asset.id,
            campaignId: asset.campaignId,
            name: asset.name,
            reason:
              assetCleanupReason(
                asset,
                { includeDeleted: true, includeExpired: true },
                input.nowMs,
              ) ?? "unknown",
            sizeBytes: asset.sizeBytes,
          })),
      });
    }
    remediations.push({
      code: "run_asset_cleanup",
      severity: "warning",
      action:
        "Run stored-byte cleanup for deleted or expired assets after confirming the cleanup candidate list.",
      affectedCount: input.cleanupPendingAssets.length,
      bytes: input.cleanupPendingAssets.reduce(
        (total, asset) => total + assetStoredBytes(asset),
        0,
      ),
      samples: input.cleanupPendingAssets
        .slice()
        .sort(
          (left, right) =>
            (assetCleanupEligibilityTime(left, input.nowMs) ?? input.nowMs) -
            (assetCleanupEligibilityTime(right, input.nowMs) ?? input.nowMs),
        )
        .slice(0, 5)
        .map((asset) => ({
          assetId: asset.id,
          campaignId: asset.campaignId,
          name: asset.name,
          reason:
            assetCleanupReason(
              asset,
              { includeDeleted: true, includeExpired: true },
              input.nowMs,
            ) ?? "unknown",
          sizeBytes: asset.sizeBytes,
        })),
    });
  }
  if (input.migrationPendingAssets.length > 0) {
    remediations.push({
      code: "migrate_asset_storage_provider",
      severity: "warning",
      action: `Migrate managed asset bytes to the active ${input.activeStorage.provider} storage provider.`,
      affectedCount: input.migrationPendingAssets.length,
      bytes: input.migrationPendingAssets.reduce(
        (total, asset) => total + assetStoredBytes(asset),
        0,
      ),
      samples: input.migrationPendingAssets.slice(0, 5).map((asset) => ({
        assetId: asset.id,
        campaignId: asset.campaignId,
        name: asset.name,
        fromProvider: asset.storage?.provider ?? "unknown",
        toProvider: input.activeStorage.provider,
        sizeBytes: asset.sizeBytes,
      })),
    });
  }
  if (input.missingStorageRefs > 0) {
    remediations.push({
      code: "repair_missing_asset_storage_refs",
      severity: "error",
      action:
        "Run asset integrity inspection and repair or re-upload managed assets that lack storage references.",
      affectedCount: input.missingStorageRefs,
      samples: input.missingStorageRefAssets
        .slice()
        .sort(
          (left, right) =>
            right.sizeBytes - left.sizeBytes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 5)
        .map((asset) => ({
          assetId: asset.id,
          campaignId: asset.campaignId,
          name: asset.name,
          sizeBytes: asset.sizeBytes,
          lifecycleStatus: asset.lifecycle?.status ?? "active",
          reason: asset.lifecycle?.storageDeletedAt
            ? "storage_deleted"
            : "missing_storage_ref",
        })),
    });
  }
  if (input.unscannedAssets > 0) {
    remediations.push({
      code: "scan_unverified_assets",
      severity: "warning",
      action:
        "Run asset trust scanning or re-upload assets so every managed upload has security scan metadata.",
      affectedCount: input.unscannedAssets,
      samples: input.unscannedAssetRows
        .slice()
        .sort(
          (left, right) =>
            right.sizeBytes - left.sizeBytes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 5)
        .map((asset) => ({
          assetId: asset.id,
          campaignId: asset.campaignId,
          name: asset.name,
          sizeBytes: asset.sizeBytes,
          lifecycleStatus: asset.lifecycle?.status ?? "active",
          provider: asset.storage?.provider ?? "missing",
        })),
    });
  }
  if (input.trustWarningAssets > 0) {
    remediations.push({
      code: "review_asset_trust_warnings",
      severity: "warning",
      action:
        "Review managed assets with persisted medium or high trust-scan findings, then rescan, replace, or archive risky uploads.",
      affectedCount: input.trustWarningAssets,
      samples: input.trustWarningAssetRows
        .slice()
        .sort(
          (left, right) =>
            assetTrustWarningRank(right) - assetTrustWarningRank(left) ||
            right.sizeBytes - left.sizeBytes ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 5)
        .map(assetTrustWarningSample),
    });
  }
  return remediations
    .sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        right.affectedCount - left.affectedCount ||
        left.code.localeCompare(right.code),
    )
    .slice(0, 8);
}

export function assetHasTrustWarnings(asset: MapAsset): boolean {
  if (!asset.url.startsWith("/api/v1/assets/")) return false;
  if (asset.lifecycle?.status === "deleted") return false;
  return (asset.security?.findings ?? []).some(
    (finding) => finding.severity === "medium" || finding.severity === "high",
  );
}

export function assetTrustWarningRank(asset: MapAsset): number {
  const findings = asset.security?.findings ?? [];
  if (findings.some((finding) => finding.severity === "high")) return 2;
  if (findings.some((finding) => finding.severity === "medium")) return 1;
  return 0;
}

export function assetTrustWarningSample(
  asset: MapAsset,
): Record<string, unknown> {
  const findings = (asset.security?.findings ?? []).filter(
    (finding) => finding.severity === "medium" || finding.severity === "high",
  );
  return {
    assetId: asset.id,
    campaignId: asset.campaignId,
    name: asset.name,
    sizeBytes: asset.sizeBytes,
    lifecycleStatus: asset.lifecycle?.status ?? "active",
    provider: asset.storage?.provider ?? "missing",
    scanner: asset.security?.scanner,
    scannedAt: asset.security?.scannedAt,
    findingCount: findings.length,
    highestSeverity: findings.some((finding) => finding.severity === "high")
      ? "high"
      : "medium",
    findingCodes: [...new Set(findings.map((finding) => finding.code))].slice(
      0,
      5,
    ),
  };
}

export function severityRank(severity: "warning" | "error"): number {
  return severity === "error" ? 2 : 1;
}

export function assetCdnPurgeOperationsSummary(store: StateStore) {
  const purgeLogs = store.state.auditLogs
    .filter((log) => log.action === "admin.asset.cdnPurge")
    .sort(sortTimestampsDesc);
  const recent = purgeLogs.slice(0, 10).map((log) => {
    const after = isRecord(log.after) ? log.after : {};
    const status = stringFromRecord(after, "status") ?? "unknown";
    const error = stringFromRecord(after, "error");
    const reason = stringFromRecord(after, "reason");
    const cdnUrl = stringFromRecord(after, "cdnUrl");
    const deliveryId = stringFromRecord(after, "deliveryId");
    return {
      id: log.id,
      assetId: log.targetId,
      campaignId: log.campaignId,
      requestedByUserId: log.actorUserId,
      status,
      reason,
      cdnUrl,
      deliveryId,
      error,
      createdAt: log.createdAt,
    };
  });
  return {
    totalCount: purgeLogs.length,
    purgedCount: purgeLogs.filter(
      (log) =>
        stringFromRecord(isRecord(log.after) ? log.after : {}, "status") ===
        "purged",
    ).length,
    failedCount: purgeLogs.filter(
      (log) =>
        stringFromRecord(isRecord(log.after) ? log.after : {}, "status") ===
        "failed",
    ).length,
    notConfiguredCount: purgeLogs.filter(
      (log) =>
        stringFromRecord(isRecord(log.after) ? log.after : {}, "status") ===
        "not_configured",
    ).length,
    recent,
  };
}

export function assetMaintenanceOperationsSummary(store: StateStore) {
  const logs = store.state.auditLogs
    .filter(
      (log) =>
        log.action === "admin.assets.migrate" ||
        log.action === "admin.assets.cleanup" ||
        log.action === "admin.assets.integrityQuarantine",
    )
    .sort(sortTimestampsDesc);
  const runs = logs.map(assetMaintenanceRunFromAuditLog);
  const migrationRuns = runs.filter((run) => run.operation === "migration");
  const cleanupRuns = runs.filter((run) => run.operation === "cleanup");
  const quarantineRuns = runs.filter((run) => run.operation === "quarantine");
  return {
    totalRunCount: runs.length,
    dryRunCount: runs.filter((run) => run.dryRun).length,
    mutationRunCount: runs.filter((run) => !run.dryRun).length,
    changedRunCount: runs.filter((run) => run.changed).length,
    failedRunCount: runs.filter((run) => run.failed > 0).length,
    latestRunAt: runs[0]?.createdAt,
    migration: assetMaintenanceOperationRollup(migrationRuns),
    cleanup: assetMaintenanceOperationRollup(cleanupRuns),
    quarantine: assetMaintenanceOperationRollup(quarantineRuns),
    recentRuns: runs.slice(0, 10),
  };
}

export function assetMaintenanceOperationRollup(
  runs: ReturnType<typeof assetMaintenanceRunFromAuditLog>[],
) {
  return {
    runCount: runs.length,
    dryRunCount: runs.filter((run) => run.dryRun).length,
    mutationRunCount: runs.filter((run) => !run.dryRun).length,
    changedRunCount: runs.filter((run) => run.changed).length,
    failedRunCount: runs.filter((run) => run.failed > 0).length,
    assetCount: runs.reduce((total, run) => total + run.assetCount, 0),
    matched: runs.reduce((total, run) => total + run.matched, 0),
    migrated: runs.reduce((total, run) => total + run.migrated, 0),
    archived: runs.reduce((total, run) => total + run.archived, 0),
    deleted: runs.reduce((total, run) => total + run.deleted, 0),
    missingMarked: runs.reduce((total, run) => total + run.missingMarked, 0),
    planned: runs.reduce((total, run) => total + run.planned, 0),
    skipped: runs.reduce((total, run) => total + run.skipped, 0),
    failed: runs.reduce((total, run) => total + run.failed, 0),
    latestRunAt: runs[0]?.createdAt,
    recentRuns: runs.slice(0, 5),
  };
}

export function assetMaintenanceRunFromAuditLog(log: AuditLog) {
  const after = isRecord(log.after) ? log.after : {};
  return {
    id: log.id,
    operation: assetMaintenanceOperationFromAction(log.action),
    campaignId: log.campaignId ?? log.targetId,
    requestedByUserId: log.actorUserId,
    dryRun: after.dryRun === true,
    changed: after.changed === true,
    assetCount:
      numberFromRecord(after, "assetCount", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    matched:
      numberFromRecord(after, "matched", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    migrated:
      numberFromRecord(after, "migrated", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    archived:
      numberFromRecord(after, "archived", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    deleted:
      numberFromRecord(after, "deleted", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    missingMarked:
      numberFromRecord(after, "missingMarked", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    planned:
      numberFromRecord(after, "planned", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    skipped:
      numberFromRecord(after, "skipped", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    failed: numberFromRecord(after, "failed", 0, Number.MAX_SAFE_INTEGER) ?? 0,
    targetProvider: stringFromRecord(after, "targetProvider"),
    graceDays: numberFromRecord(after, "graceDays", 0, Number.MAX_SAFE_INTEGER),
    reason: stringFromRecord(after, "reason"),
    createdAt: log.createdAt,
  };
}

export function assetMaintenanceOperationFromAction(
  action: string,
): "migration" | "cleanup" | "quarantine" {
  if (action === "admin.assets.migrate") return "migration";
  if (action === "admin.assets.cleanup") return "cleanup";
  return "quarantine";
}

export function assetDeliveryRuntimeOperationsSummary(store: StateStore) {
  const deliveryLogs = store.state.auditLogs
    .filter((log) => log.action === "asset.delivery")
    .sort(sortTimestampsDesc);
  const events = deliveryLogs.map(assetDeliveryAuditEvent);
  const failures = events.filter((event) => event.status !== "served");
  return {
    totalCount: events.length,
    servedCount: events.filter((event) => event.status === "served").length,
    deniedCount: events.filter((event) => event.status === "denied").length,
    unavailableCount: events.filter((event) => event.status === "unavailable")
      .length,
    missingBytesCount: events.filter(
      (event) => event.status === "missing_bytes",
    ).length,
    signingFailedCount: events.filter(
      (event) => event.status === "signing_failed",
    ).length,
    failureCount: failures.length,
    servedBytes: events
      .filter((event) => event.status === "served")
      .reduce((total, event) => total + event.bytes, 0),
    failedBytes: failures.reduce((total, event) => total + event.bytes, 0),
    statusCounts: countBy(events, (event) => event.status),
    accessModeCounts: countBy(events, (event) => event.accessMode),
    recent: events.slice(0, 10),
    recentFailures: failures.slice(0, 10),
  };
}

export function assetDeliveryAuditEvent(log: AuditLog) {
  const after = isRecord(log.after) ? log.after : {};
  const status = stringFromRecord(after, "status") ?? "unknown";
  const accessMode = stringFromRecord(after, "accessMode") ?? "unknown";
  const bytes =
    numberFromRecord(after, "bytes", 0, Number.MAX_SAFE_INTEGER) ?? 0;
  return {
    id: log.id,
    assetId: log.targetId,
    campaignId: log.campaignId,
    status,
    accessMode,
    reason: stringFromRecord(after, "reason"),
    provider: stringFromRecord(after, "provider"),
    lifecycleStatus: stringFromRecord(after, "lifecycleStatus"),
    bytes,
    createdAt: log.createdAt,
  };
}

export function assetDeliveryPostureSummary(managedAssets: MapAsset[]) {
  const nowMs = Date.now();
  const activeAssets = managedAssets.filter(
    (asset) => asset.lifecycle?.status !== "deleted",
  );
  const expiredActiveAssets = activeAssets.filter((asset) => {
    const expiresAt = asset.lifecycle?.expiresAt
      ? Date.parse(asset.lifecycle.expiresAt)
      : Number.NaN;
    return Number.isFinite(expiresAt) && expiresAt <= nowMs;
  });
  const deliverableAssets = activeAssets.filter(
    (asset) =>
      asset.storage &&
      !asset.lifecycle?.storageDeletedAt &&
      !expiredActiveAssets.includes(asset),
  );
  const undeliverableAssets = activeAssets.filter(
    (asset) => !asset.storage || Boolean(asset.lifecycle?.storageDeletedAt),
  );
  const cdnBaseUrl = envText("OTTE_ASSET_CDN_BASE_URL");
  const signingSecretConfigured = Boolean(
    envText("OTTE_ASSET_URL_SIGNING_SECRET"),
  );
  const samples = (assets: MapAsset[]) =>
    assets
      .slice()
      .sort(
        (left, right) =>
          right.sizeBytes - left.sizeBytes ||
          left.name.localeCompare(right.name),
      )
      .slice(0, 10)
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        campaignId: asset.campaignId,
        provider: asset.storage?.provider ?? "missing",
        sizeBytes: asset.sizeBytes,
        lifecycleStatus: asset.lifecycle?.status ?? "active",
        expiresAt: asset.lifecycle?.expiresAt,
        storageDeletedAt: asset.lifecycle?.storageDeletedAt,
        reason: !asset.storage
          ? "missing_storage_ref"
          : asset.lifecycle?.storageDeletedAt
            ? "storage_deleted"
            : "delivery_ready",
      }));
  return {
    mode: cdnBaseUrl ? "cdn" : "signed_blob",
    cdnConfigured: Boolean(cdnBaseUrl),
    signingSecretConfigured,
    activeManagedAssetCount: activeAssets.length,
    deliverableActiveAssetCount: deliverableAssets.length,
    undeliverableActiveAssetCount: undeliverableAssets.length,
    expiredActiveAssetCount: expiredActiveAssets.length,
    deliverableActiveBytes: deliverableAssets.reduce(
      (total, asset) => total + assetStoredBytes(asset),
      0,
    ),
    undeliverableActiveBytes: undeliverableAssets.reduce(
      (total, asset) => total + assetStoredBytes(asset),
      0,
    ),
    deliverableCoverageRate: ratio(
      deliverableAssets.length,
      activeAssets.length,
    ),
    cdnEligibleAssetCount: cdnBaseUrl ? deliverableAssets.length : 0,
    signedUrlEligibleAssetCount: signingSecretConfigured
      ? deliverableAssets.length
      : 0,
    undeliverableSamples: samples(undeliverableAssets),
    deliverableSamples: samples(deliverableAssets),
  };
}

export function assetStorageOperationActionReasons(input: {
  quotaAtRiskCampaignCount: number;
  cleanupBacklogCount: number;
  migrationBacklogCount: number;
  missingStorageRefs: number;
  unscannedAssets: number;
  trustWarningAssets: number;
  deliveryWarningCount: number;
  undeliverableActiveAssetCount: number;
  deliveryFailureCount: number;
  maintenanceFailureCount: number;
}) {
  return [
    input.quotaAtRiskCampaignCount > 0 ? "quota_at_risk" : undefined,
    input.cleanupBacklogCount > 0 ? "cleanup_backlog" : undefined,
    input.migrationBacklogCount > 0 ? "migration_backlog" : undefined,
    input.missingStorageRefs > 0 ? "missing_storage_refs" : undefined,
    input.unscannedAssets > 0 ? "unscanned_assets" : undefined,
    input.trustWarningAssets > 0 ? "asset_trust_warnings" : undefined,
    input.deliveryWarningCount > 0
      ? "delivery_configuration_warnings"
      : undefined,
    input.undeliverableActiveAssetCount > 0
      ? "undeliverable_active_assets"
      : undefined,
    input.deliveryFailureCount > 0 ? "asset_delivery_failures" : undefined,
    input.maintenanceFailureCount > 0
      ? "asset_maintenance_failures"
      : undefined,
  ].filter((reason): reason is string => Boolean(reason));
}

export function assetCleanupEligibilityTime(
  asset: MapAsset,
  cutoffMs: number,
): number | undefined {
  const cleanupReason = assetCleanupReason(
    asset,
    { includeDeleted: true, includeExpired: true },
    cutoffMs,
  );
  if (cleanupReason === "deleted_asset") return lifecycleChangeTime(asset);
  if (cleanupReason === "expired_asset") {
    const expiresAt = asset.lifecycle?.expiresAt
      ? Date.parse(asset.lifecycle.expiresAt)
      : Number.NaN;
    return Number.isFinite(expiresAt) ? expiresAt : undefined;
  }
  return undefined;
}

export function assetDeliveryOperationWarnings(
  activeStorage: AssetStorage,
  cleanupScheduler?: AssetCleanupSchedulerStatus,
): Array<Record<string, unknown>> {
  const warnings: Array<Record<string, unknown>> = [];
  const invalidConfig = invalidAssetRuntimeConfigEnvNames();
  const invalidUrlConfig = invalidAssetRuntimeUrlEnvNames();
  const insecureUrlConfig = insecureProductionAssetRuntimeUrlEnvNames();
  const missingTokenConfig = assetRuntimeTokenMissingEnvNames();
  const s3Runtime = assetS3RuntimeConfig(activeStorage);
  if (invalidConfig.length > 0) {
    warnings.push({
      code: "asset_runtime_config_invalid",
      severity: "warning",
      message: `Asset numeric runtime settings are invalid: ${invalidConfig.join(", ")}.`,
      env: invalidConfig,
    });
  }
  if (invalidUrlConfig.length > 0) {
    warnings.push({
      code: "asset_runtime_url_config_invalid",
      severity: "warning",
      message: `Asset runtime URL settings are invalid: ${invalidUrlConfig.join(", ")}.`,
      env: invalidUrlConfig,
    });
  }
  if (insecureUrlConfig.length > 0) {
    warnings.push({
      code: "asset_runtime_url_insecure",
      severity: "warning",
      message: `Production asset runtime URL settings should use HTTPS: ${insecureUrlConfig.join(", ")}.`,
      env: insecureUrlConfig,
    });
  }
  if (missingTokenConfig.length > 0) {
    warnings.push({
      code: "asset_runtime_token_missing",
      severity: "warning",
      message: `Production asset webhook token settings are missing: ${missingTokenConfig.join(", ")}.`,
      env: missingTokenConfig,
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    !assetRuntimeNumberEnv("OTTE_ASSET_RETENTION_DAYS").configured
  ) {
    warnings.push({
      code: "asset_retention_policy_missing_in_production",
      severity: "warning",
      message:
        "Production asset uploads do not have a default retention policy.",
      env: ["OTTE_ASSET_RETENTION_DAYS"],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    !assetRuntimeNumberEnv("OTTE_ASSET_QUOTA_BYTES").configured
  ) {
    warnings.push({
      code: "asset_quota_policy_missing_in_production",
      severity: "warning",
      message:
        "Production asset uploads do not have a per-campaign quota policy.",
      env: ["OTTE_ASSET_QUOTA_BYTES"],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    cleanupScheduler?.enabled &&
    cleanupScheduler.dryRun
  ) {
    warnings.push({
      code: "asset_cleanup_scheduler_dry_run_in_production",
      severity: "warning",
      message: "Production scheduled asset cleanup is enabled in dry-run mode.",
      env: ["OTTE_ASSET_CLEANUP_DRY_RUN"],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    cleanupScheduler?.enabled &&
    !cleanupScheduler.includeDeleted &&
    !cleanupScheduler.includeExpired
  ) {
    warnings.push({
      code: "asset_cleanup_scheduler_no_targets",
      severity: "warning",
      message:
        "Scheduled asset cleanup is enabled without deleted or expired asset targets.",
      env: [
        "OTTE_ASSET_CLEANUP_INCLUDE_DELETED",
        "OTTE_ASSET_CLEANUP_INCLUDE_EXPIRED",
      ],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    assetRuntimeUrlEnv("OTTE_ASSET_TRUST_WEBHOOK_URL").configured &&
    assetRuntimeUrlEnv("OTTE_ASSET_TRUST_WEBHOOK_URL").valid &&
    !assetTrustFailClosed()
  ) {
    warnings.push({
      code: "asset_trust_fail_open_in_production",
      severity: "warning",
      message:
        "Production external asset trust scanning is configured to fail open.",
      env: ["OTTE_ASSET_TRUST_FAIL_CLOSED"],
    });
  }
  if (
    assetS3RuntimeEnvRelevant(activeStorage) &&
    s3Runtime?.bucketConfigured === false
  ) {
    warnings.push({
      code: "asset_s3_bucket_missing",
      severity: "error",
      message: "S3 asset storage is selected without OTTE_S3_BUCKET.",
      env: ["OTTE_S3_BUCKET"],
    });
  }
  if (
    assetS3RuntimeEnvRelevant(activeStorage) &&
    s3Runtime?.endpointValid === false
  ) {
    warnings.push({
      code: "asset_s3_endpoint_invalid",
      severity: "warning",
      message: "S3 asset storage endpoint must be an HTTP(S) URL.",
      env: ["OTTE_S3_ENDPOINT"],
    });
  }
  if (
    assetS3RuntimeEnvRelevant(activeStorage) &&
    s3Runtime?.endpointInsecureInProduction === true
  ) {
    warnings.push({
      code: "asset_s3_endpoint_insecure",
      severity: "warning",
      message:
        "Production S3 asset storage endpoints should use HTTPS unless they are localhost.",
      env: ["OTTE_S3_ENDPOINT"],
    });
  }
  if (
    assetS3RuntimeEnvRelevant(activeStorage) &&
    s3Runtime?.partialExplicitCredentials === true
  ) {
    warnings.push({
      code: "asset_s3_credentials_partial",
      severity: "warning",
      message:
        "S3 asset storage has only one explicit credential variable configured.",
      env: ["OTTE_S3_ACCESS_KEY_ID", "OTTE_S3_SECRET_ACCESS_KEY"],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    !envText("OTTE_ASSET_URL_SIGNING_SECRET")
  ) {
    warnings.push({
      code: "asset_signing_secret_missing",
      severity: "error",
      message:
        "Production asset delivery should configure OTTE_ASSET_URL_SIGNING_SECRET.",
      env: ["OTTE_ASSET_URL_SIGNING_SECRET"],
    });
  }
  if (
    envText("OTTE_ASSET_CDN_BASE_URL") &&
    !envText("OTTE_ASSET_CDN_PURGE_WEBHOOK_URL")
  ) {
    warnings.push({
      code: "asset_cdn_purge_unconfigured",
      severity: "warning",
      message: "CDN delivery is configured without a purge webhook.",
      env: ["OTTE_ASSET_CDN_PURGE_WEBHOOK_URL"],
    });
  }
  if (
    process.env.NODE_ENV === "production" &&
    activeStorage.provider === "local"
  ) {
    warnings.push({
      code: "asset_local_storage_in_production",
      severity: "warning",
      message: "Production asset storage is still using the local provider.",
      env: ["OTTE_ASSET_STORAGE"],
    });
  }
  return warnings;
}

export function assetStorageRuntimeInfo(
  activeStorage: AssetStorage,
  cleanupScheduler?: AssetCleanupSchedulerStatus,
): AssetStorageRuntimeInfo {
  const cdnBaseUrl = envText("OTTE_ASSET_CDN_BASE_URL");
  const publicUrl = envText("OTTE_PUBLIC_URL");
  const quotaBytes = assetQuotaBytes();
  return {
    provider: activeStorage.provider,
    migrationTargetProvider: activeStorage.provider,
    invalidConfig: invalidAssetRuntimeConfigEnvNames(),
    invalidUrlConfig: invalidAssetRuntimeUrlEnvNames(),
    insecureUrlConfig: insecureProductionAssetRuntimeUrlEnvNames(),
    missingTokenConfig: assetRuntimeTokenMissingEnvNames(),
    s3: assetS3RuntimeConfig(activeStorage),
    quota: {
      enabled: quotaBytes !== undefined,
      quotaBytes,
      quotaPolicyMissingInProduction:
        process.env.NODE_ENV === "production" &&
        !assetRuntimeNumberEnv("OTTE_ASSET_QUOTA_BYTES").configured,
    },
    lifecycle: {
      retentionDays: assetRetentionDays(),
      retentionPolicyMissingInProduction:
        process.env.NODE_ENV === "production" &&
        !assetRuntimeNumberEnv("OTTE_ASSET_RETENTION_DAYS").configured,
    },
    delivery: {
      mode: cdnBaseUrl ? "cdn" : "signed_blob",
      cdnConfigured: Boolean(cdnBaseUrl),
      publicUrlConfigured: Boolean(publicUrl),
      signingSecretConfigured: Boolean(
        envText("OTTE_ASSET_URL_SIGNING_SECRET"),
      ),
      signingSecretRequired: process.env.NODE_ENV === "production",
      defaultTtlSeconds: assetUrlDefaultTtlSeconds(),
      maxTtlSeconds: assetUrlMaxTtlSeconds(),
      purgeWebhookConfigured: Boolean(
        envText("OTTE_ASSET_CDN_PURGE_WEBHOOK_URL"),
      ),
      purgeWebhookTokenConfigured: Boolean(
        envText("OTTE_ASSET_CDN_PURGE_WEBHOOK_TOKEN"),
      ),
      purgeTimeoutMs: assetCdnPurgeWebhookTimeoutMs(),
    },
    trustScanner: {
      builtinEnabled: true,
      externalConfigured: Boolean(envText("OTTE_ASSET_TRUST_WEBHOOK_URL")),
      tokenConfigured: Boolean(envText("OTTE_ASSET_TRUST_WEBHOOK_TOKEN")),
      failClosed: assetTrustFailClosed(),
      timeoutMs: assetTrustWebhookTimeoutMs(),
    },
    cleanup: {
      enabled: Boolean(cleanupScheduler?.enabled),
      running: Boolean(cleanupScheduler?.running),
      dryRun: cleanupScheduler?.dryRun,
      includeDeleted: cleanupScheduler?.includeDeleted,
      includeExpired: cleanupScheduler?.includeExpired,
      graceDays: cleanupScheduler?.graceDays,
      intervalSeconds: cleanupScheduler?.intervalSeconds,
      runOnStart: cleanupScheduler?.runOnStart,
      riskyConfig: assetCleanupSchedulerRiskConfig(cleanupScheduler),
    },
  };
}

export function assetCleanupSchedulerRiskConfig(
  cleanupScheduler?: AssetCleanupSchedulerStatus,
): string[] {
  if (process.env.NODE_ENV !== "production" || !cleanupScheduler?.enabled)
    return [];
  return [
    cleanupScheduler.dryRun ? "OTTE_ASSET_CLEANUP_DRY_RUN" : undefined,
    !cleanupScheduler.includeDeleted && !cleanupScheduler.includeExpired
      ? "OTTE_ASSET_CLEANUP_INCLUDE_DELETED"
      : undefined,
    !cleanupScheduler.includeDeleted && !cleanupScheduler.includeExpired
      ? "OTTE_ASSET_CLEANUP_INCLUDE_EXPIRED"
      : undefined,
  ].filter((name): name is string => Boolean(name));
}

export function countBy<T>(
  items: T[],
  keyForItem: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function topCountEntries(
  counts: Record<string, number>,
  limit: number,
): Array<{ code: string; count: number }> {
  return Object.entries(counts)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, limit)
    .map(([code, count]) => ({ code, count }));
}

export function signedAssetDelivery(
  asset: MapAsset,
  headers: Record<string, string | string[] | undefined>,
  requestedTtlSeconds: number | undefined,
  disposition: "inline" | "attachment" | undefined,
): Record<string, string | number | undefined> {
  const ttlSeconds = assetUrlTtlSeconds(requestedTtlSeconds);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const safeDisposition = normalizeAssetDisposition(disposition) ?? "inline";
  const signature = signAssetUrl(asset.id, expiresAt, safeDisposition);
  const url = new URL(
    `${assetDeliveryBase(headers)}/api/v1/assets/${asset.id}/blob`,
  );
  url.searchParams.set("expiresAt", expiresAt);
  url.searchParams.set("signature", signature);
  if (safeDisposition !== "inline")
    url.searchParams.set("disposition", safeDisposition);
  return {
    assetId: asset.id,
    url: url.toString(),
    expiresAt,
    ttlSeconds,
    cacheControl: signedAssetCacheControl(expiresAt),
    delivery: process.env.OTTE_ASSET_CDN_BASE_URL?.trim()
      ? "cdn"
      : "signed_blob",
  };
}

export function assetDeliveryBase(
  headers: Record<string, string | string[] | undefined>,
): string {
  const configured =
    process.env.OTTE_ASSET_CDN_BASE_URL?.trim() ||
    process.env.OTTE_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const protocol = headerValue(headers["x-forwarded-proto"]) ?? "http";
  const host = headerValue(headers.host) ?? "localhost";
  return `${protocol}://${host}`;
}

export function assetUrlTtlSeconds(requested: number | undefined): number {
  const fallback = assetUrlDefaultTtlSeconds();
  const max = assetUrlMaxTtlSeconds();
  const value =
    Number.isFinite(requested) && requested! > 0 ? requested! : fallback;
  return Math.max(30, Math.min(Math.floor(value), Math.min(max, 24 * 60 * 60)));
}

export function assetUrlDefaultTtlSeconds(): number {
  const value = Number(process.env.OTTE_ASSET_URL_TTL_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 300;
}

export function assetUrlMaxTtlSeconds(): number {
  const value = Number(process.env.OTTE_ASSET_URL_MAX_TTL_SECONDS);
  return Number.isFinite(value) && value > 0 ? value : 3600;
}

export function signAssetUrl(
  assetId: string,
  expiresAt: string,
  disposition: string,
): string {
  return createHmac("sha256", assetSigningSecret())
    .update(assetSignaturePayload(assetId, expiresAt, disposition))
    .digest("base64url");
}

export function isValidAssetSignature(
  assetId: string,
  expiresAt: string | undefined,
  signature: string | undefined,
  disposition: string | undefined,
): boolean {
  if (!expiresAt || !signature) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  const maxExpiresAtMs = Date.now() + assetUrlMaxTtlSeconds() * 1000;
  if (expiresAtMs > maxExpiresAtMs) return false;
  const safeDisposition = normalizeAssetDisposition(disposition);
  if (!safeDisposition) return false;
  try {
    const expected = signAssetUrl(assetId, expiresAt, safeDisposition);
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(signature);
    return (
      expectedBytes.length === actualBytes.length &&
      timingSafeEqual(expectedBytes, actualBytes)
    );
  } catch {
    return false;
  }
}

export function assetSignaturePayload(
  assetId: string,
  expiresAt: string,
  disposition: string,
): string {
  return JSON.stringify({ assetId, expiresAt, disposition });
}

export function normalizeAssetDisposition(
  disposition: string | undefined,
): "inline" | "attachment" | undefined {
  if (!disposition) return "inline";
  return disposition === "inline" || disposition === "attachment"
    ? disposition
    : undefined;
}

export function assetSigningSecret(): string {
  const configured = process.env.OTTE_ASSET_URL_SIGNING_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "OTTE_ASSET_URL_SIGNING_SECRET is required for signed asset URLs in production",
    );
  return "development-asset-signing-secret";
}

export function signedAssetCacheControl(expiresAt: string | undefined): string {
  const remainingSeconds = expiresAt
    ? Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
    : 0;
  return `public, max-age=${Math.min(remainingSeconds, 3600)}`;
}

export function safeDownloadFileName(name: string): string {
  return basename(name).replace(/["\r\n]/g, "_") || "asset.bin";
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
