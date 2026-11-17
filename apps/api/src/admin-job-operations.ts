import { createHash } from "node:crypto";
import {
  nowIso,
  type JobLogEntry,
  type JobProgress,
  type JobStatus,
  type JobType,
  type WorkerJobRecord
} from "@open-tabletop/core";

export const ADMIN_JOB_TYPES = [
  "campaign.export",
  "campaign.import",
  "asset.storage.migrate",
  "asset.storage.cleanup",
  "storage.backup",
  "storage.restoreDrill",
  "ai.memory.extract",
  "ai.session.recap",
  "report.bundle"
] as const satisfies readonly JobType[];

const ADMIN_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const satisfies readonly JobStatus[];
const ADMIN_JOB_DEFAULT_MAX_ATTEMPTS = 3;
const ADMIN_JOB_MAX_ATTEMPTS = 10;
const ADMIN_JOB_MAX_LOGS = 100;
const ADMIN_JOB_DEFAULT_LEASE_SECONDS = 120;
const ADMIN_JOB_MAX_LEASE_SECONDS = 3600;
const ADMIN_JOB_STALE_HEARTBEAT_MS = 5 * 60 * 1000;
const ADMIN_JOB_STALE_QUEUED_MS = 15 * 60 * 1000;

export type PublicJobInfo = Omit<WorkerJobRecord, "payload" | "output"> & {
  payload: unknown;
  output?: unknown;
};

export type AdminJobLeaseResult =
  | { status: "leased" | "replayed"; job: WorkerJobRecord }
  | { status: "idle" }
  | { status: "conflict"; error: string };

export function normalizeJobType(value: string): JobType | undefined {
  return ADMIN_JOB_TYPES.find((type) => type === value);
}

export function normalizeJobStatus(value: string): JobStatus | undefined {
  return ADMIN_JOB_STATUSES.find((status) => status === value);
}

export function normalizeAdminJobLimit(value: string | undefined): number | undefined {
  if (value === undefined) return 100;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : undefined;
}

export function normalizeAdminJobMaxAttempts(value: unknown): number | undefined {
  if (value === undefined) return ADMIN_JOB_DEFAULT_MAX_ATTEMPTS;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ADMIN_JOB_MAX_ATTEMPTS ? parsed : undefined;
}

export function normalizeAdminJobLeaseSeconds(value: unknown): number | undefined {
  if (value === undefined) return ADMIN_JOB_DEFAULT_LEASE_SECONDS;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= ADMIN_JOB_MAX_LEASE_SECONDS ? parsed : undefined;
}

export function normalizeWorkerId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 120);
  return normalized || undefined;
}

export function normalizeJobLeaseRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || /[^\x21-\x7e]/.test(normalized)) return undefined;
  return normalized;
}

export function normalizeJobLeaseRevision(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export function normalizeJobExpectedUpdatedAt(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

export function normalizeJobTypeFilter(value: unknown): { value?: Set<JobType> } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (!Array.isArray(value)) return { error: "types must be an array of supported job types" };
  const types = new Set<JobType>();
  for (const item of value) {
    if (typeof item !== "string") return { error: "types must contain only supported job types" };
    const type = normalizeJobType(item);
    if (!type) return { error: "types must contain only supported job types" };
    types.add(type);
  }
  return { value: types };
}

export function jobLeaseRequestHash(input: { workerId: string; leaseSeconds: number; types?: Set<JobType> }): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ workerId: input.workerId, leaseSeconds: input.leaseSeconds, types: [...(input.types ?? [])].sort() }))
    .digest("hex")}`;
}

export function leaseNextAdminJob(
  jobs: WorkerJobRecord[],
  input: { workerId: string; leaseSeconds: number; leaseRequestId: string; leaseRequestHash: string; adminUserId?: string; types?: Set<JobType> }
): AdminJobLeaseResult {
  const replay = jobs.find((job) => job.leaseRequestId === input.leaseRequestId);
  if (replay) {
    if (replay.leasedBy !== input.workerId || replay.leaseRequestHash !== input.leaseRequestHash || !replay.leaseRevision) {
      return { status: "conflict", error: "leaseRequestId was already used for a different lease transition" };
    }
    return { status: "replayed", job: replay };
  }

  const nowMs = Date.now();
  const candidates = jobs
    .filter((job) => !input.types || input.types.has(job.type))
    .filter((job) => job.attempts < job.maxAttempts)
    .filter((job) => job.status === "queued" || (job.status === "running" && job.leaseExpiresAt !== undefined && Date.parse(job.leaseExpiresAt) <= nowMs))
    .sort((left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt));
  const job = candidates[0];
  if (!job) return { status: "idle" };
  const now = nowIso();
  const wasExpiredLease = job.status === "running";
  job.status = "running";
  job.startedAt = job.startedAt ?? now;
  job.attempts += 1;
  job.leasedBy = input.workerId;
  job.leaseRequestId = input.leaseRequestId;
  job.leaseRequestHash = input.leaseRequestHash;
  job.leaseRevision = (job.leaseRevision ?? 0) + 1;
  job.lastHeartbeatAt = now;
  job.dispatchStartedAt = undefined;
  job.leaseExpiresAt = new Date(Date.parse(now) + input.leaseSeconds * 1000).toISOString();
  job.updatedAt = now;
  if (input.adminUserId) job.updatedByUserId = input.adminUserId;
  appendJobLog(job, {
    at: now,
    level: wasExpiredLease ? "warning" : "info",
    message: wasExpiredLease ? `Expired lease reclaimed by ${input.workerId}` : `Job leased by ${input.workerId}`
  });
  return { status: "leased", job };
}

export function adminJobOperations(jobs: WorkerJobRecord[]) {
  const generatedAt = nowIso();
  const nowMs = Date.parse(generatedAt);
  const byStatus = Object.fromEntries(ADMIN_JOB_STATUSES.map((status) => [status, jobs.filter((job) => job.status === status).length])) as Record<JobStatus, number>;
  const byType = Object.fromEntries(ADMIN_JOB_TYPES.map((type) => [type, jobs.filter((job) => job.type === type).length])) as Record<JobType, number>;
  const queuedJobs = jobs.filter((job) => job.status === "queued").sort((left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt));
  const runningJobs = jobs.filter((job) => job.status === "running");
  const failedJobs = jobs.filter((job) => job.status === "failed");
  const retryableJobs = jobs.filter((job) => (job.status === "failed" || job.status === "cancelled") && job.attempts < job.maxAttempts);
  const exhaustedJobs = jobs.filter((job) => job.attempts >= job.maxAttempts && job.status !== "succeeded");
  const expiredLeaseJobs = runningJobs.filter((job) => job.leaseExpiresAt !== undefined && Date.parse(job.leaseExpiresAt) <= nowMs);
  const staleHeartbeatJobs = runningJobs.filter((job) => job.lastHeartbeatAt === undefined || nowMs - Date.parse(job.lastHeartbeatAt) > ADMIN_JOB_STALE_HEARTBEAT_MS);
  const staleQueuedJobs = queuedJobs.filter((job) => nowMs - Date.parse(job.queuedAt) > ADMIN_JOB_STALE_QUEUED_MS);
  const actionReasons = [
    failedJobs.length > 0 ? "failed_jobs" : undefined,
    expiredLeaseJobs.length > 0 ? "expired_job_leases" : undefined,
    staleHeartbeatJobs.length > 0 ? "stale_job_heartbeats" : undefined,
    exhaustedJobs.length > 0 ? "retry_exhausted_jobs" : undefined,
    staleQueuedJobs.length > 0 ? "stale_queued_jobs" : undefined
  ].filter((reason): reason is string => Boolean(reason));
  const workerIds = Array.from(new Set(runningJobs.map((job) => job.leasedBy).filter((workerId): workerId is string => Boolean(workerId)))).sort();
  const workers = workerIds.map((workerId) => {
    const workerJobs = runningJobs.filter((job) => job.leasedBy === workerId);
    const lastHeartbeatAt = workerJobs.reduce<string | undefined>((latest, job) => {
      if (!job.lastHeartbeatAt) return latest;
      return !latest || Date.parse(job.lastHeartbeatAt) > Date.parse(latest) ? job.lastHeartbeatAt : latest;
    }, undefined);
    return {
      workerId,
      runningCount: workerJobs.length,
      lastHeartbeatAt,
      expiredLeaseCount: workerJobs.filter((job) => job.leaseExpiresAt !== undefined && Date.parse(job.leaseExpiresAt) <= nowMs).length,
      staleHeartbeatCount: workerJobs.filter((job) => job.lastHeartbeatAt === undefined || nowMs - Date.parse(job.lastHeartbeatAt) > ADMIN_JOB_STALE_HEARTBEAT_MS).length
    };
  });
  const oldestQueuedAt = queuedJobs[0]?.queuedAt;
  const newestCompletedAt = jobs.reduce<string | undefined>((latest, job) => {
    if (!job.completedAt) return latest;
    return !latest || Date.parse(job.completedAt) > Date.parse(latest) ? job.completedAt : latest;
  }, undefined);
  const remediationQueue = [
    failedJobs.length ? remediation("retry_or_inspect_failed_jobs", "error", "Inspect failed job errors, retry safe jobs, or cancel jobs that should not run.", failedJobs) : undefined,
    expiredLeaseJobs.length ? remediation("reclaim_expired_job_leases", "error", "Start healthy workers or retry jobs whose worker lease has expired.", expiredLeaseJobs) : undefined,
    staleHeartbeatJobs.length ? remediation("investigate_stale_job_workers", "warning", "Check worker processes whose running jobs have not heartbeated recently.", staleHeartbeatJobs) : undefined,
    exhaustedJobs.length ? remediation("resolve_retry_exhausted_jobs", "error", "Inspect exhausted jobs before increasing attempts or recreating work.", exhaustedJobs) : undefined,
    staleQueuedJobs.length ? remediation("increase_job_worker_capacity", "warning", "Start workers or reduce queued work whose queue age exceeds the operations threshold.", staleQueuedJobs) : undefined
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    generatedAt,
    actionRequired: actionReasons.length > 0,
    actionReasons,
    thresholds: { staleHeartbeatSeconds: ADMIN_JOB_STALE_HEARTBEAT_MS / 1000, staleQueuedSeconds: ADMIN_JOB_STALE_QUEUED_MS / 1000 },
    totals: { totalCount: jobs.length, byStatus, byType, retryableCount: retryableJobs.length, exhaustedCount: exhaustedJobs.length },
    queue: {
      oldestQueuedAt,
      maxQueueAgeSeconds: oldestQueuedAt ? Math.max(0, Math.floor((nowMs - Date.parse(oldestQueuedAt)) / 1000)) : 0,
      staleQueuedCount: staleQueuedJobs.length,
      recentQueued: queuedJobs.slice(0, 10).map(jobOperationSample)
    },
    leases: {
      runningCount: runningJobs.length,
      leasedWorkerCount: workerIds.length,
      expiredCount: expiredLeaseJobs.length,
      staleHeartbeatCount: staleHeartbeatJobs.length,
      workers,
      expired: expiredLeaseJobs.slice(0, 10).map(jobOperationSample),
      staleHeartbeats: staleHeartbeatJobs.slice(0, 10).map(jobOperationSample)
    },
    failures: {
      failedCount: failedJobs.length,
      retryableCount: retryableJobs.length,
      exhaustedCount: exhaustedJobs.length,
      recentFailed: failedJobs.slice().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 10).map(jobOperationSample)
    },
    throughput: { succeededCount: byStatus.succeeded, cancelledCount: byStatus.cancelled, newestCompletedAt },
    remediationQueue
  };
}

function remediation(code: string, severity: "warning" | "error", action: string, jobs: WorkerJobRecord[]) {
  return { code, severity, action, affectedCount: jobs.length, samples: jobs.slice(0, 5).map(jobOperationSample) };
}

function jobOperationSample(job: WorkerJobRecord): Record<string, unknown> {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    queuedAt: job.queuedAt,
    updatedAt: job.updatedAt,
    leasedBy: job.leasedBy,
    leaseRequestId: job.leaseRequestId,
    leaseRevision: job.leaseRevision,
    leaseExpiresAt: job.leaseExpiresAt,
    lastHeartbeatAt: job.lastHeartbeatAt,
    error: job.error
  };
}

export function adminJobMetrics(jobs: WorkerJobRecord[]): string {
  const operations = adminJobOperations(jobs);
  const lines = [
    "# HELP otte_admin_jobs_total Total persisted server-admin job ledger records.",
    "# TYPE otte_admin_jobs_total gauge",
    `otte_admin_jobs_total ${operations.totals.totalCount}`,
    "# HELP otte_admin_jobs_by_status Server-admin jobs by lifecycle status.",
    "# TYPE otte_admin_jobs_by_status gauge"
  ];
  for (const [status, count] of Object.entries(operations.totals.byStatus)) lines.push(`otte_admin_jobs_by_status{status="${metricLabel(status)}"} ${count}`);
  lines.push("# HELP otte_admin_jobs_by_type Server-admin jobs by job type.", "# TYPE otte_admin_jobs_by_type gauge");
  for (const [type, count] of Object.entries(operations.totals.byType)) lines.push(`otte_admin_jobs_by_type{type="${metricLabel(type)}"} ${count}`);
  lines.push(
    "# HELP otte_admin_jobs_retryable Failed or cancelled jobs with attempts remaining.",
    "# TYPE otte_admin_jobs_retryable gauge",
    `otte_admin_jobs_retryable ${operations.totals.retryableCount}`,
    "# HELP otte_admin_jobs_retry_exhausted Jobs that exhausted retry attempts before success.",
    "# TYPE otte_admin_jobs_retry_exhausted gauge",
    `otte_admin_jobs_retry_exhausted ${operations.totals.exhaustedCount}`,
    "# HELP otte_admin_jobs_queue_max_age_seconds Age in seconds of the oldest queued job.",
    "# TYPE otte_admin_jobs_queue_max_age_seconds gauge",
    `otte_admin_jobs_queue_max_age_seconds ${operations.queue.maxQueueAgeSeconds}`,
    "# HELP otte_admin_jobs_queue_stale Queued jobs older than the operations threshold.",
    "# TYPE otte_admin_jobs_queue_stale gauge",
    `otte_admin_jobs_queue_stale ${operations.queue.staleQueuedCount}`,
    "# HELP otte_admin_jobs_leases_expired Running jobs whose worker lease has expired.",
    "# TYPE otte_admin_jobs_leases_expired gauge",
    `otte_admin_jobs_leases_expired ${operations.leases.expiredCount}`,
    "# HELP otte_admin_jobs_heartbeats_stale Running jobs with missing or stale worker heartbeats.",
    "# TYPE otte_admin_jobs_heartbeats_stale gauge",
    `otte_admin_jobs_heartbeats_stale ${operations.leases.staleHeartbeatCount}`,
    "# HELP otte_admin_jobs_workers Workers currently holding running job leases.",
    "# TYPE otte_admin_jobs_workers gauge",
    `otte_admin_jobs_workers ${operations.leases.leasedWorkerCount}`,
    "# HELP otte_admin_jobs_action_required Whether job operations posture requires operator action.",
    "# TYPE otte_admin_jobs_action_required gauge",
    `otte_admin_jobs_action_required ${operations.actionRequired ? 1 : 0}`,
    "# HELP otte_admin_jobs_remediation_items Remediation rows currently generated from job posture.",
    "# TYPE otte_admin_jobs_remediation_items gauge",
    `otte_admin_jobs_remediation_items ${operations.remediationQueue.length}`,
    ""
  );
  return lines.join("\n");
}

export async function deliverJobAlert(
  operations: ReturnType<typeof adminJobOperations>,
  input: { dryRun: boolean; force: boolean; reason?: string; adminUserId: string; deliveryId: string }
) {
  const configured = Boolean(jobAlertWebhookUrl());
  const base = {
    deliveryId: input.deliveryId,
    configured,
    actionRequired: operations.actionRequired,
    actionReasons: operations.actionReasons,
    remediationCount: operations.remediationQueue.length,
    generatedAt: operations.generatedAt
  };
  if (!operations.actionRequired && !input.force) return { ...base, status: "skipped" as const, reason: "no_action_required" };
  if (input.dryRun) return { ...base, status: "dry_run" as const, reason: input.reason };
  const webhookUrl = jobAlertWebhookUrl();
  if (!webhookUrl) return { ...base, status: "failed" as const, error: "OTTE_JOB_ALERT_WEBHOOK_URL is not configured" };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": input.deliveryId,
    "x-open-tabletop-delivery-id": input.deliveryId
  };
  const token = envText("OTTE_JOB_ALERT_WEBHOOK_TOKEN");
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(jobAlertWebhookTimeoutMs()),
      body: JSON.stringify({
        kind: "open_tabletop.job_operations_alert",
        deliveryId: input.deliveryId,
        requestedAt: nowIso(),
        requestedByUserId: input.adminUserId,
        reason: input.reason,
        operations
      })
    });
    if (!response.ok) return { ...base, status: "failed" as const, webhookStatus: response.status, error: `Job alert webhook returned ${response.status}` };
    return { ...base, status: "delivered" as const, deliveredAt: nowIso(), webhookStatus: response.status, reason: input.reason };
  } catch (error) {
    return { ...base, status: "failed" as const, error: errorMessage(error).slice(0, 500) };
  }
}

export function jobAlertWebhookUrl(): string | undefined {
  return envText("OTTE_JOB_ALERT_WEBHOOK_URL");
}

export function publicJobInfo(job: WorkerJobRecord): PublicJobInfo {
  const { payload: _payload, output: _output, leaseRequestHash: _leaseRequestHash, ...rest } = job;
  return {
    ...rest,
    payload: redactJobValue(job.payload),
    ...(job.output !== undefined ? { output: redactJobValue(job.output) } : {})
  };
}

export function leasedJobInfo(job: WorkerJobRecord): WorkerJobRecord {
  const { leaseRequestHash: _leaseRequestHash, ...safe } = job;
  return { ...safe, logs: job.logs.map((log) => ({ ...log, details: log.details ? { ...log.details } : undefined })) };
}

export function normalizeJobProgress(value: unknown): { value: JobProgress } | { error: string } {
  if (!isRecord(value)) return { error: "Job progress must be an object" };
  const progress: JobProgress = {};
  for (const field of ["current", "total", "percent"] as const) {
    if (value[field] === undefined) continue;
    const parsed = Number(value[field]);
    if (!Number.isFinite(parsed) || parsed < 0) return { error: `Job progress ${field} must be a non-negative number` };
    progress[field] = parsed;
  }
  if (value.message !== undefined) {
    if (typeof value.message !== "string") return { error: "Job progress message must be a string" };
    progress.message = value.message.slice(0, 240);
  }
  if (progress.percent !== undefined && progress.percent > 100) return { error: "Job progress percent must be between 0 and 100" };
  return { value: progress };
}

export function normalizeJobLogEntry(value: unknown): { value: JobLogEntry } | { error: string } {
  if (!isRecord(value)) return { error: "Job log must be an object" };
  const level = typeof value.level === "string" && ["info", "warning", "error"].includes(value.level) ? value.level as JobLogEntry["level"] : undefined;
  if (!level) return { error: "Job log level must be info, warning, or error" };
  if (typeof value.message !== "string" || !value.message.trim()) return { error: "Job log message is required" };
  return {
    value: {
      at: nowIso(),
      level,
      message: value.message.trim().slice(0, 500),
      ...(isRecord(value.details) ? { details: redactJobValue(value.details) as Record<string, unknown> } : {})
    }
  };
}

export function transitionAdminJob(job: WorkerJobRecord, nextStatus: JobStatus, adminUserId?: string): { ok: true } | { error: string } {
  if (job.status === nextStatus) return { ok: true };
  const allowed: Record<JobStatus, JobStatus[]> = {
    queued: ["running", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: []
  };
  if (!allowed[job.status].includes(nextStatus)) return { error: `Cannot transition job from ${job.status} to ${nextStatus}` };
  if (nextStatus === "cancelled" && !adminUserId) return { error: "Only a server admin may cancel a job" };
  const now = nowIso();
  if (nextStatus === "running") {
    if (job.attempts >= job.maxAttempts) return { error: "Job has exhausted its retry attempts" };
    job.startedAt = now;
    job.attempts += 1;
  }
  job.status = nextStatus;
  if (nextStatus === "succeeded" || nextStatus === "failed") job.completedAt = now;
  if (nextStatus === "cancelled") {
    job.cancelledAt = now;
    job.completedAt = now;
    job.cancelledByUserId = adminUserId!;
  }
  if (["succeeded", "failed", "cancelled"].includes(nextStatus)) {
    job.leasedBy = undefined;
    job.leaseExpiresAt = undefined;
    job.lastHeartbeatAt = undefined;
  }
  appendJobLog(job, { at: now, level: nextStatus === "failed" || nextStatus === "cancelled" ? "warning" : "info", message: `Job marked ${nextStatus}` });
  return { ok: true };
}

export function appendJobLog(job: WorkerJobRecord, log: JobLogEntry): void {
  job.logs = [...job.logs, log].slice(-ADMIN_JOB_MAX_LOGS);
}

function redactJobValue(value: unknown, key?: string): unknown {
  if (key && ["archive", "sourceText", "transcript", "html", "text", "token", "password"].includes(key)) {
    return { redacted: true, field: key, ...(typeof value === "string" ? { length: value.length } : {}) };
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactJobValue(item));
  if (!isRecord(value)) return { redacted: true, kind: typeof value };
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([entryKey, entryValue]) => [entryKey, redactJobValue(entryValue, entryKey)]));
}

function metricLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function jobAlertWebhookTimeoutMs(): number {
  const value = Number(process.env.OTTE_JOB_ALERT_WEBHOOK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

function envText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
