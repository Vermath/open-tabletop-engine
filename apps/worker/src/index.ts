import { pathToFileURL } from "node:url";
import { hostname } from "node:os";
import type { Readable, Writable } from "node:stream";

export type WorkerJob =
  | { id: string; type: "campaign.export"; payload: { campaignId: string } }
  | { id: string; type: "campaign.import"; payload: { archive: unknown; mode?: "upsert" | "reject_conflicts" } }
  | { id: string; type: "asset.storage.migrate"; payload: { campaignId?: string; assetIds?: string[]; dryRun?: boolean; includeDeleted?: boolean; overwrite?: boolean } }
  | { id: string; type: "asset.storage.cleanup"; payload: { campaignId?: string; assetIds?: string[]; dryRun?: boolean; includeDeleted?: boolean; includeExpired?: boolean; graceDays?: number } }
  | { id: string; type: "storage.backup"; payload: { reason?: string } }
  | { id: string; type: "storage.restoreDrill"; payload: { backupFileName?: string } }
  | { id: string; type: "ai.memory.extract"; payload: { campaignId: string; sourceText?: string } }
  | { id: string; type: "ai.session.recap"; payload: { campaignId: string; transcript?: string } };

export interface WorkerOptions {
  apiBaseUrl: string;
  sessionToken?: string;
  userId?: string;
  workerId?: string;
  leaseSeconds?: number;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export interface WorkerLoopOptions extends WorkerOptions {
  pollIntervalMs?: number;
  maxIdlePolls?: number;
  maxJobs?: number;
  maxRetainedResults?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onResult?: (result: WorkerLeaseResult) => void | Promise<void>;
}

export interface WorkerResult {
  id: string;
  type: WorkerJob["type"];
  status: "succeeded";
  output: unknown;
}

export type WorkerLeaseResult =
  | WorkerResult
  | { status: "idle" }
  | { status: "failed"; error: string }
  | { id: string; type: WorkerJob["type"]; status: "cancelled"; error: string }
  | { id: string; type: WorkerJob["type"]; status: "failed"; error: string };

export interface WorkerLoopResult {
  status: "completed";
  workerId: string;
  jobsRun: number;
  failures: number;
  idlePolls: number;
  results: WorkerLeaseResult[];
}

export function describeJob(job: WorkerJob): string {
  return `${job.type}:${job.id}`;
}

export async function runWorkerJob(job: WorkerJob, options: WorkerOptions): Promise<WorkerResult> {
  const fetchImpl = options.fetch ?? fetch;
  const output = await dispatchJob(job, options, fetchImpl);
  return {
    id: job.id,
    type: job.type,
    status: "succeeded",
    output
  };
}

export async function runLeasedWorkerJob(options: WorkerOptions): Promise<WorkerLeaseResult> {
  const fetchImpl = options.fetch ?? fetch;
  const leased = await fetchJson(fetchImpl, options, "POST", "/api/v1/admin/jobs/lease", compactPayload({ workerId: workerId(options), leaseSeconds: options.leaseSeconds }));
  if (leased === undefined) return { status: "idle" };
  const job = parseWorkerJob(leased);
  const abortController = new AbortController();
  await fetchJson(fetchImpl, options, "POST", `/api/v1/admin/jobs/${encodeURIComponent(job.id)}/heartbeat`, {
    workerId: workerId(options),
    leaseSeconds: options.leaseSeconds,
    progress: { percent: 0, message: "Worker dispatch started" },
    log: { level: "info", message: "Worker dispatch started" }
  });
  const stopHeartbeatMonitor = startLeasedJobHeartbeatMonitor(job, options, fetchImpl, abortController);
  try {
    const result = await runWorkerJob(job, { ...options, fetch: fetchImpl, signal: abortController.signal });
    if (abortController.signal.aborted) throw cancellationError(abortController);
    await fetchJson(fetchImpl, options, "PATCH", `/api/v1/admin/jobs/${encodeURIComponent(job.id)}`, {
      status: "succeeded",
      output: result.output,
      progress: { percent: 100, message: "Worker dispatch completed" },
      log: { level: "info", message: "Worker dispatch completed" }
    });
    return result;
  } catch (error) {
    if (abortController.signal.aborted) {
      const message = cancellationError(abortController).message;
      return {
        id: job.id,
        type: job.type,
        status: "cancelled",
        error: message
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    await fetchJson(fetchImpl, options, "PATCH", `/api/v1/admin/jobs/${encodeURIComponent(job.id)}`, {
      status: "failed",
      error: message,
      log: { level: "error", message }
    });
    return {
      id: job.id,
      type: job.type,
      status: "failed",
      error: message
    };
  } finally {
    stopHeartbeatMonitor();
  }
}

export async function runLeasedWorkerLoop(options: WorkerLoopOptions): Promise<WorkerLoopResult> {
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 5000);
  const maxIdlePolls = options.maxIdlePolls ?? Number.POSITIVE_INFINITY;
  const maxJobs = options.maxJobs ?? Number.POSITIVE_INFINITY;
  const requestedMaxRetainedResults = options.maxRetainedResults ?? (Number.isFinite(maxIdlePolls) && Number.isFinite(maxJobs) ? 100 : 0);
  const maxRetainedResults = Number.isFinite(requestedMaxRetainedResults) ? Math.max(0, Math.floor(requestedMaxRetainedResults)) : 0;
  const sleep = options.sleep ?? defaultSleep;
  const results: WorkerLeaseResult[] = [];
  let jobsRun = 0;
  let failures = 0;
  let idlePolls = 0;

  while (jobsRun < maxJobs && idlePolls < maxIdlePolls) {
    let result: WorkerLeaseResult;
    try {
      result = await runLeasedWorkerJob(options);
    } catch (error) {
      result = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    if (maxRetainedResults > 0) {
      results.push(result);
      if (results.length > maxRetainedResults) results.splice(0, results.length - maxRetainedResults);
    }
    await options.onResult?.(result);
    if (result.status === "idle") {
      idlePolls += 1;
    } else {
      if ("id" in result) jobsRun += 1;
      idlePolls = 0;
      if (result.status === "failed") failures += 1;
    }
    if (jobsRun >= maxJobs || idlePolls >= maxIdlePolls) break;
    if (pollIntervalMs > 0) await sleep(pollIntervalMs);
  }

  return {
    status: "completed",
    workerId: workerId(options),
    jobsRun,
    failures,
    idlePolls,
    results
  };
}

export async function runWorkerCli(
  env: Record<string, string | undefined> = process.env,
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
  stderr: Writable = process.stderr
): Promise<number> {
  try {
    if (env.OTTE_WORKER_LEASE_POLL === "true") {
      const result = await runLeasedWorkerLoop({
        apiBaseUrl: env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
        sessionToken: env.OTTE_SESSION_TOKEN,
        userId: env.OTTE_USER_ID,
        workerId: env.OTTE_WORKER_ID,
        leaseSeconds: envNumber(env.OTTE_WORKER_LEASE_SECONDS),
        pollIntervalMs: envNumber(env.OTTE_WORKER_POLL_INTERVAL_MS),
        maxIdlePolls: envNumber(env.OTTE_WORKER_MAX_IDLE_POLLS),
        maxJobs: envNumber(env.OTTE_WORKER_MAX_JOBS),
        onResult: (leaseResult) => {
          stdout.write(`${JSON.stringify(leaseResult)}\n`);
        }
      });
      stdout.write(`${JSON.stringify(result)}\n`);
      return result.failures > 0 ? 1 : 0;
    }
    if (env.OTTE_WORKER_LEASE_ONCE === "true") {
      const result = await runLeasedWorkerJob({
        apiBaseUrl: env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
        sessionToken: env.OTTE_SESSION_TOKEN,
        userId: env.OTTE_USER_ID,
        workerId: env.OTTE_WORKER_ID,
        leaseSeconds: envNumber(env.OTTE_WORKER_LEASE_SECONDS)
      });
      stdout.write(`${JSON.stringify(result)}\n`);
      return result.status === "failed" ? 1 : 0;
    }
    const job = parseWorkerJob(JSON.parse(await readAll(stdin)) as unknown);
    const result = await runWorkerJob(job, {
      apiBaseUrl: env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
      sessionToken: env.OTTE_SESSION_TOKEN,
      userId: env.OTTE_USER_ID
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${JSON.stringify({ status: "failed", error: message })}\n`);
    return 1;
  }
}

async function dispatchJob(job: WorkerJob, options: WorkerOptions, fetchImpl: typeof fetch): Promise<unknown> {
  switch (job.type) {
    case "campaign.export":
      return fetchJson(fetchImpl, options, "GET", `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/export`);
    case "campaign.import":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/import/campaign", {
        archive: job.payload.archive,
        mode: job.payload.mode ?? "upsert"
      });
    case "asset.storage.migrate":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/admin/assets/migrate", compactPayload(job.payload));
    case "asset.storage.cleanup":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/admin/assets/cleanup", compactPayload(job.payload));
    case "storage.backup":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/admin/storage/backup", compactPayload(job.payload));
    case "storage.restoreDrill":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/admin/storage/restore-drill", compactPayload(job.payload));
    case "ai.memory.extract":
      return fetchJson(fetchImpl, options, "POST", `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/ai/memory/extract`, {
        sourceText: job.payload.sourceText
      });
    case "ai.session.recap":
      return fetchJson(fetchImpl, options, "POST", `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/ai/session-recap`, {
        transcript: job.payload.transcript
      });
  }
}

async function fetchJson(fetchImpl: typeof fetch, options: WorkerOptions, method: string, path: string, body?: unknown): Promise<unknown> {
  const timeoutMs = Math.max(1, options.requestTimeoutMs ?? 30_000);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Response>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`Worker API request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  const requestPromise = fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: workerHeaders(options, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal
  });
  const response = await Promise.race([requestPromise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Worker API request failed with ${response.status} ${method} ${path}: ${detail.slice(0, 500)}`);
  }
  return payload;
}

function startLeasedJobHeartbeatMonitor(job: WorkerJob, options: WorkerOptions, fetchImpl: typeof fetch, abortController: AbortController): () => void {
  const heartbeatIntervalMs = Math.max(1, options.heartbeatIntervalMs ?? Math.floor((options.leaseSeconds ?? 120) * 500));
  let active = false;
  const timer = setInterval(() => {
    if (active || abortController.signal.aborted) return;
    active = true;
    fetchJson(fetchImpl, { ...options, signal: undefined }, "POST", `/api/v1/admin/jobs/${encodeURIComponent(job.id)}/heartbeat`, {
      workerId: workerId(options),
      leaseSeconds: options.leaseSeconds,
      progress: { message: "Worker dispatch heartbeat" },
      log: { level: "info", message: "Worker dispatch heartbeat" }
    })
      .catch((error) => abortController.abort(new Error(`Worker job cancelled or heartbeat rejected: ${error instanceof Error ? error.message : String(error)}`)))
      .finally(() => {
        active = false;
      });
  }, heartbeatIntervalMs);
  return () => clearInterval(timer);
}

function cancellationError(abortController: AbortController): Error {
  return abortController.signal.reason instanceof Error ? abortController.signal.reason : new Error("Worker job cancelled");
}

function workerHeaders(options: WorkerOptions, hasBody: boolean): Headers {
  const headers = new Headers();
  if (hasBody) headers.set("content-type", "application/json");
  if (!options.sessionToken) throw new Error("Worker API session token is required");
  headers.set("authorization", `Bearer ${options.sessionToken}`);
  return headers;
}

function workerId(options: WorkerOptions): string {
  return sanitizeWorkerId(options.workerId) ?? sanitizeWorkerId(process.env.OTTE_WORKER_ID) ?? sanitizeWorkerId(process.env.HOSTNAME) ?? sanitizeWorkerId(process.env.COMPUTERNAME) ?? sanitizeWorkerId(hostname()) ?? "otte-worker";
}

function sanitizeWorkerId(value: string | undefined): string | undefined {
  const sanitized = value?.trim().replace(/\s+/g, "-");
  return sanitized ? sanitized.slice(0, 80) : undefined;
}

function envNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseWorkerJob(value: unknown): WorkerJob {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string" || !isRecord(value.payload)) {
    throw new Error("Worker job requires string id, string type, and object payload");
  }
  switch (value.type) {
    case "campaign.export":
      return { id: value.id, type: value.type, payload: { campaignId: requiredString(value.payload, "campaignId") } };
    case "campaign.import":
      return { id: value.id, type: value.type, payload: { archive: value.payload.archive, mode: importMode(value.payload.mode) } };
    case "asset.storage.migrate":
      return {
        id: value.id,
        type: value.type,
        payload: {
          campaignId: optionalString(value.payload, "campaignId"),
          assetIds: optionalStringArray(value.payload, "assetIds"),
          dryRun: optionalBoolean(value.payload, "dryRun"),
          includeDeleted: optionalBoolean(value.payload, "includeDeleted"),
          overwrite: optionalBoolean(value.payload, "overwrite")
        }
      };
    case "asset.storage.cleanup":
      return {
        id: value.id,
        type: value.type,
        payload: {
          campaignId: optionalString(value.payload, "campaignId"),
          assetIds: optionalStringArray(value.payload, "assetIds"),
          dryRun: optionalBoolean(value.payload, "dryRun"),
          includeDeleted: optionalBoolean(value.payload, "includeDeleted"),
          includeExpired: optionalBoolean(value.payload, "includeExpired"),
          graceDays: optionalNumber(value.payload, "graceDays")
        }
      };
    case "storage.backup":
      return { id: value.id, type: value.type, payload: { reason: optionalString(value.payload, "reason") } };
    case "storage.restoreDrill":
      return { id: value.id, type: value.type, payload: { backupFileName: optionalString(value.payload, "backupFileName") } };
    case "ai.memory.extract":
      return { id: value.id, type: value.type, payload: { campaignId: requiredString(value.payload, "campaignId"), sourceText: optionalString(value.payload, "sourceText") } };
    case "ai.session.recap":
      return { id: value.id, type: value.type, payload: { campaignId: requiredString(value.payload, "campaignId"), transcript: optionalString(value.payload, "transcript") } };
    default:
      throw new Error(`Unsupported worker job type: ${value.type}`);
  }
}

function importMode(value: unknown): "upsert" | "reject_conflicts" | undefined {
  if (value === undefined) return undefined;
  if (value === "upsert" || value === "reject_conflicts") return value;
  throw new Error("campaign.import mode must be upsert or reject_conflicts");
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Worker job payload requires ${key}`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Worker job payload field ${key} must be a string`);
  return value;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`Worker job payload field ${key} must be a string array`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Worker job payload field ${key} must be a boolean`);
  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Worker job payload field ${key} must be a finite number`);
  return value;
}

function compactPayload(payload: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function readAll(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runWorkerCli();
}
