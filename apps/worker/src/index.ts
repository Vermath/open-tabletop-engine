import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hostname } from "node:os";
import type { Readable, Writable } from "node:stream";

export type WorkerJob = (
  | { id: string; type: "campaign.export"; payload: { campaignId: string } }
  | {
      id: string;
      type: "campaign.import";
      payload: {
        archive: unknown;
        mode?: "upsert" | "reject_conflicts";
        expectedUpdatedAt: string;
      };
    }
  | {
      id: string;
      type: "asset.storage.migrate";
      payload: {
        campaignId?: string;
        assetIds?: string[];
        dryRun?: boolean;
        expectedTargetSetHash?: string;
        includeDeleted?: boolean;
        overwrite?: boolean;
      };
    }
  | {
      id: string;
      type: "asset.storage.cleanup";
      payload: {
        campaignId?: string;
        assetIds?: string[];
        dryRun?: boolean;
        expectedTargetSetHash?: string;
        includeDeleted?: boolean;
        includeExpired?: boolean;
        graceDays?: number;
      };
    }
  | { id: string; type: "storage.backup"; payload: { reason?: string } }
  | {
      id: string;
      type: "storage.restoreDrill";
      payload: { backupFileName?: string };
    }
  | {
      id: string;
      type: "ai.memory.extract";
      payload: {
        campaignId: string;
        sourceText?: string;
        visibility?: "public" | "gm_only";
        expectedUpdatedAt: string;
      };
    }
  | {
      id: string;
      type: "ai.session.recap";
      payload: {
        campaignId: string;
        sessionId?: string;
        transcript?: string;
        manualNotes?: string;
        expectedUpdatedAt: string;
      };
    }
  | { id: string; type: "report.bundle"; payload: { campaignId: string } }
) & {
  /** Present for jobs acquired through the lease API. */
  leaseRevision?: number;
};

export interface WorkerOptions {
  apiBaseUrl: string;
  workerToken?: string;
  /** @deprecated Use workerToken. Session credentials are accepted only by the explicit non-production compatibility bridge. */
  sessionToken?: string;
  userId?: string;
  workerId?: string;
  allowLegacySessionToken?: boolean;
  environment?: string;
  leaseSeconds?: number;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  /** Internal lease binding forwarded as x-otte-worker-job-id. */
  jobId?: string;
  /** Durable caller identity for a single lease request. Reuse only to retry that exact request. */
  leaseRequestId?: string;
  /** Internal current lease epoch forwarded as x-otte-worker-lease-revision. */
  leaseRevision?: number;
  /** Internal stable identity for one mutating HTTP operation. */
  idempotencyKey?: string;
}

export interface WorkerLoopOptions extends WorkerOptions {
  pollIntervalMs?: number;
  maxIdlePolls?: number;
  maxJobs?: number;
  maxRetainedResults?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  onResult?: (result: WorkerLeaseResult) => void | Promise<void>;
}

export type WorkerShutdownSignal = "SIGINT" | "SIGTERM";

export interface WorkerSignalSource {
  once(signal: WorkerShutdownSignal, listener: () => void): unknown;
  off(signal: WorkerShutdownSignal, listener: () => void): unknown;
}

export interface WorkerCliRuntimeOptions {
  signalSource?: WorkerSignalSource;
  shutdownTimeoutMs?: number;
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

const workerSettlementTimeoutMs = 5_000;
const workerShutdownTimeoutMs = 25_000;

interface WorkerHeartbeatMonitor {
  stop(): Promise<void>;
}

interface WorkerShutdownController {
  signal: AbortSignal;
  dispose(): void;
}

export function describeJob(job: WorkerJob): string {
  return `${job.type}:${job.id}`;
}

export async function runWorkerJob(
  job: WorkerJob,
  options: WorkerOptions,
): Promise<WorkerResult> {
  const fetchImpl = options.fetch ?? fetch;
  const output = await dispatchJob(
    job,
    { ...options, jobId: job.id },
    fetchImpl,
  );
  return {
    id: job.id,
    type: job.type,
    status: "succeeded",
    output,
  };
}

export async function runLeasedWorkerJob(
  options: WorkerOptions,
): Promise<WorkerLeaseResult> {
  const fetchImpl = options.fetch ?? fetch;
  if (options.signal?.aborted) throw workerShutdownError(options.signal.reason);
  const leaseRequestId =
    normalizedOperationId(options.leaseRequestId) ?? workerOperationId("lease");
  if (
    options.leaseRequestId !== undefined &&
    leaseRequestId !== options.leaseRequestId.trim()
  ) {
    throw new Error(
      "leaseRequestId must be a non-empty opaque value of 160 characters or fewer",
    );
  }
  const leased = await fetchJson(
    fetchImpl,
    { ...options, idempotencyKey: leaseRequestId },
    "POST",
    "/api/v1/admin/jobs/lease",
    compactPayload({
      workerId: workerId(options),
      leaseSeconds: options.leaseSeconds,
      leaseRequestId,
    }),
  );
  if (leased === undefined) return { status: "idle" };
  const job = parseLeasedWorkerJob(leased);
  const leaseOptions = {
    ...options,
    jobId: job.id,
    leaseRevision: job.leaseRevision,
  };
  const leaseAbortController = new AbortController();
  const dispatchSignal = composeWorkerAbortSignals(
    options.signal,
    leaseAbortController.signal,
  );
  let heartbeatMonitor: WorkerHeartbeatMonitor | undefined;
  try {
    await fetchJson(
      fetchImpl,
      {
        ...leaseOptions,
        idempotencyKey: workerOperationId("heartbeat-start"),
        signal: dispatchSignal.signal,
      },
      "POST",
      `/api/v1/admin/jobs/${encodeURIComponent(job.id)}/heartbeat`,
      {
        workerId: workerId(options),
        leaseRevision: job.leaseRevision,
        leaseSeconds: options.leaseSeconds,
        progress: { percent: 0, message: "Worker dispatch started" },
        log: { level: "info", message: "Worker dispatch started" },
      },
    );
    heartbeatMonitor = startLeasedJobHeartbeatMonitor(
      job,
      leaseOptions,
      fetchImpl,
      leaseAbortController,
    );
    const result = await runWorkerJob(job, {
      ...leaseOptions,
      fetch: fetchImpl,
      signal: dispatchSignal.signal,
    });
    await heartbeatMonitor.stop();
    if (options.signal?.aborted)
      return settleInterruptedWorkerJob(job, options, fetchImpl);
    if (leaseAbortController.signal.aborted)
      throw cancellationError(leaseAbortController);
    await fetchJson(
      fetchImpl,
      { ...leaseOptions, idempotencyKey: workerOperationId("settle-success") },
      "PATCH",
      `/api/v1/admin/jobs/${encodeURIComponent(job.id)}`,
      {
        leaseRevision: job.leaseRevision,
        status: "succeeded",
        output: result.output,
        progress: { percent: 100, message: "Worker dispatch completed" },
        log: { level: "info", message: "Worker dispatch completed" },
      },
    );
    return result;
  } catch (error) {
    await heartbeatMonitor?.stop();
    if (options.signal?.aborted)
      return settleInterruptedWorkerJob(job, options, fetchImpl);
    if (leaseAbortController.signal.aborted) {
      const message = cancellationError(leaseAbortController).message;
      return {
        id: job.id,
        type: job.type,
        status: "cancelled",
        error: message,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    await fetchJson(
      fetchImpl,
      { ...leaseOptions, idempotencyKey: workerOperationId("settle-failure") },
      "PATCH",
      `/api/v1/admin/jobs/${encodeURIComponent(job.id)}`,
      {
        leaseRevision: job.leaseRevision,
        status: "failed",
        error: message,
        log: { level: "error", message },
      },
    );
    return {
      id: job.id,
      type: job.type,
      status: "failed",
      error: message,
    };
  } finally {
    dispatchSignal.dispose();
    await heartbeatMonitor?.stop();
  }
}

export async function runLeasedWorkerLoop(
  options: WorkerLoopOptions,
): Promise<WorkerLoopResult> {
  requireWorkerCredential(options);
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? 5000);
  const maxIdlePolls = options.maxIdlePolls ?? Number.POSITIVE_INFINITY;
  const maxJobs = options.maxJobs ?? Number.POSITIVE_INFINITY;
  const requestedMaxRetainedResults =
    options.maxRetainedResults ??
    (Number.isFinite(maxIdlePolls) && Number.isFinite(maxJobs) ? 100 : 0);
  const maxRetainedResults = Number.isFinite(requestedMaxRetainedResults)
    ? Math.max(0, Math.floor(requestedMaxRetainedResults))
    : 0;
  const sleep = options.sleep ?? defaultSleep;
  const results: WorkerLeaseResult[] = [];
  let jobsRun = 0;
  let failures = 0;
  let idlePolls = 0;

  while (
    jobsRun < maxJobs &&
    idlePolls < maxIdlePolls &&
    !options.signal?.aborted
  ) {
    let result: WorkerLeaseResult;
    try {
      result = await runLeasedWorkerJob(options);
    } catch (error) {
      if (options.signal?.aborted) break;
      result = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (maxRetainedResults > 0) {
      results.push(result);
      if (results.length > maxRetainedResults)
        results.splice(0, results.length - maxRetainedResults);
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
    if (options.signal?.aborted) break;
    if (
      pollIntervalMs > 0 &&
      !(await workerPollDelay(sleep, pollIntervalMs, options.signal))
    )
      break;
  }

  return {
    status: "completed",
    workerId: workerId(options),
    jobsRun,
    failures,
    idlePolls,
    results,
  };
}

export async function runWorkerCli(
  env: Record<string, string | undefined> = process.env,
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
  stderr: Writable = process.stderr,
  runtimeOptions: WorkerCliRuntimeOptions = {},
): Promise<number> {
  const shutdown = workerShutdownController(
    runtimeOptions.signalSource ?? process,
  );
  const shutdownTimeout = normalizedWorkerShutdownTimeout(
    runtimeOptions.shutdownTimeoutMs ??
      envNumber(env.OTTE_WORKER_SHUTDOWN_TIMEOUT_MS),
  );
  try {
    if (env.OTTE_WORKER_LEASE_POLL === "true") {
      const result = await drainWorkerOnShutdown(
        runLeasedWorkerLoop({
          apiBaseUrl:
            env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
          ...workerCredentialOptions(env),
          userId: env.OTTE_USER_ID,
          workerId: env.OTTE_WORKER_ID,
          leaseSeconds: envNumber(env.OTTE_WORKER_LEASE_SECONDS),
          pollIntervalMs: envNumber(env.OTTE_WORKER_POLL_INTERVAL_MS),
          maxIdlePolls: envNumber(env.OTTE_WORKER_MAX_IDLE_POLLS),
          maxJobs: envNumber(env.OTTE_WORKER_MAX_JOBS),
          signal: shutdown.signal,
          onResult: (leaseResult) => {
            stdout.write(`${JSON.stringify(leaseResult)}\n`);
          },
        }),
        shutdown.signal,
        shutdownTimeout,
      );
      stdout.write(`${JSON.stringify(result)}\n`);
      return shutdown.signal.aborted ? 0 : result.failures > 0 ? 1 : 0;
    }
    if (env.OTTE_WORKER_LEASE_ONCE === "true") {
      const result = await drainWorkerOnShutdown(
        runLeasedWorkerJob({
          apiBaseUrl:
            env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
          ...workerCredentialOptions(env),
          userId: env.OTTE_USER_ID,
          workerId: env.OTTE_WORKER_ID,
          leaseSeconds: envNumber(env.OTTE_WORKER_LEASE_SECONDS),
          signal: shutdown.signal,
        }),
        shutdown.signal,
        shutdownTimeout,
      );
      stdout.write(`${JSON.stringify(result)}\n`);
      return shutdown.signal.aborted ? 0 : result.status === "failed" ? 1 : 0;
    }
    const job = parseWorkerJob(JSON.parse(await readAll(stdin)) as unknown);
    const result = await drainWorkerOnShutdown(
      runWorkerJob(job, {
        apiBaseUrl: env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
        ...workerCredentialOptions(env),
        userId: env.OTTE_USER_ID,
        signal: shutdown.signal,
      }),
      shutdown.signal,
      shutdownTimeout,
    );
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    if (
      shutdown.signal.aborted &&
      !(error instanceof Error && error.name === "WorkerShutdownTimeoutError")
    ) {
      stdout.write(
        `${JSON.stringify({ status: "stopped", reason: shutdownReason(shutdown.signal.reason) })}\n`,
      );
      return 0;
    }
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${JSON.stringify({ status: "failed", error: message })}\n`);
    return 1;
  } finally {
    shutdown.dispose();
  }
}

async function dispatchJob(
  job: WorkerJob,
  options: WorkerOptions,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  switch (job.type) {
    case "campaign.export":
      return fetchJson(
        fetchImpl,
        options,
        "GET",
        `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/export`,
      );
    case "campaign.import":
      return fetchJson(fetchImpl, options, "POST", "/api/v1/import/campaign", {
        archive: job.payload.archive,
        mode: job.payload.mode ?? "upsert",
        expectedUpdatedAt: job.payload.expectedUpdatedAt,
      });
    case "asset.storage.migrate":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        "/api/v1/admin/assets/migrate",
        compactPayload(job.payload),
      );
    case "asset.storage.cleanup":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        "/api/v1/admin/assets/cleanup",
        compactPayload(job.payload),
      );
    case "storage.backup":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        "/api/v1/admin/storage/backup",
        compactPayload(job.payload),
      );
    case "storage.restoreDrill":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        "/api/v1/admin/storage/restore-drill",
        compactPayload(job.payload),
      );
    case "ai.memory.extract":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/ai/memory/extract`,
        {
          sourceText: job.payload.sourceText,
          visibility: job.payload.visibility,
          expectedUpdatedAt: job.payload.expectedUpdatedAt,
        },
      );
    case "ai.session.recap":
      return fetchJson(
        fetchImpl,
        options,
        "POST",
        `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/ai/session-recap`,
        {
          sessionId: job.payload.sessionId,
          transcript: job.payload.transcript,
          manualNotes: job.payload.manualNotes,
          expectedUpdatedAt: job.payload.expectedUpdatedAt,
        },
      );
    case "report.bundle":
      return fetchJson(
        fetchImpl,
        options,
        "GET",
        `/api/v1/campaigns/${encodeURIComponent(job.payload.campaignId)}/dogfood-report-bundle`,
      );
  }
}

async function fetchJson(
  fetchImpl: typeof fetch,
  options: WorkerOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const configuredTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const timeoutMs = Number.isFinite(configuredTimeoutMs)
    ? Math.max(1, Math.floor(configuredTimeoutMs))
    : 30_000;
  const headers = workerHeaders(options, body !== undefined);
  if (options.idempotencyKey && method !== "GET") {
    headers.set("idempotency-key", options.idempotencyKey);
  } else if (options.jobId && method !== "GET") {
    const requestHash = createHash("sha256")
      .update(`${method.toUpperCase()} ${path}`)
      .digest("hex")
      .slice(0, 16);
    headers.set(
      "idempotency-key",
      `worker-${options.jobId}-${requestHash}`.slice(0, 160),
    );
  }
  const requestAbortController = new AbortController();
  const forwardAbort = () =>
    requestAbortController.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  let rejectForAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectForAbort = () => {
      const reason = requestAbortController.signal.reason;
      reject(
        reason instanceof Error
          ? reason
          : new Error("Worker API request aborted"),
      );
    };
    if (requestAbortController.signal.aborted) rejectForAbort();
    else
      requestAbortController.signal.addEventListener("abort", rejectForAbort, {
        once: true,
      });
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(
        `Worker API request timed out after ${timeoutMs}ms`,
      );
      requestAbortController.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const requestPromise = Promise.resolve().then(() =>
    fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestAbortController.signal,
    }),
  );
  try {
    const response = await Promise.race([
      requestPromise,
      timeoutPromise,
      abortPromise,
    ]);
    const text = await Promise.race([
      response.text(),
      timeoutPromise,
      abortPromise,
    ]);
    let payload: unknown;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const detail =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(
        `Worker API request failed with ${response.status} ${method} ${path}: ${(detail ?? "").slice(0, 500)}`,
      );
    }
    return payload;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
    if (rejectForAbort)
      requestAbortController.signal.removeEventListener(
        "abort",
        rejectForAbort,
      );
  }
}

function startLeasedJobHeartbeatMonitor(
  job: WorkerJob,
  options: WorkerOptions,
  fetchImpl: typeof fetch,
  abortController: AbortController,
): WorkerHeartbeatMonitor {
  const heartbeatIntervalMs = Math.max(
    1,
    options.heartbeatIntervalMs ??
      Math.floor((options.leaseSeconds ?? 120) * 500),
  );
  const requestAbortController = new AbortController();
  let active: Promise<void> | undefined;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped || active || abortController.signal.aborted) return;
    const heartbeat = fetchJson(
      fetchImpl,
      {
        ...options,
        jobId: job.id,
        idempotencyKey: workerOperationId("heartbeat"),
        signal: requestAbortController.signal,
      },
      "POST",
      `/api/v1/admin/jobs/${encodeURIComponent(job.id)}/heartbeat`,
      {
        workerId: workerId(options),
        leaseRevision: job.leaseRevision,
        leaseSeconds: options.leaseSeconds,
        progress: { message: "Worker dispatch heartbeat" },
        log: { level: "info", message: "Worker dispatch heartbeat" },
      },
    )
      .then(() => undefined)
      .catch((error) => {
        if (!stopped)
          abortController.abort(
            new Error(
              `Worker job cancelled or heartbeat rejected: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      })
      .finally(() => {
        if (active === heartbeat) active = undefined;
      });
    active = heartbeat;
  }, heartbeatIntervalMs);
  timer.unref?.();
  return {
    async stop(): Promise<void> {
      if (!stopped) {
        stopped = true;
        clearInterval(timer);
        requestAbortController.abort(
          new Error("Worker heartbeat monitor stopped"),
        );
      }
      await active;
    },
  };
}

async function settleInterruptedWorkerJob(
  job: WorkerJob,
  options: WorkerOptions,
  fetchImpl: typeof fetch,
): Promise<WorkerLeaseResult> {
  const reason = shutdownReason(options.signal?.reason);
  const message = `${reason}; dispatch outcome is unknown and requires operator review`;
  const configuredTimeoutMs =
    options.requestTimeoutMs ?? workerSettlementTimeoutMs;
  const requestTimeoutMs = Math.min(
    workerSettlementTimeoutMs,
    Math.max(
      1,
      Number.isFinite(configuredTimeoutMs)
        ? Math.floor(configuredTimeoutMs)
        : workerSettlementTimeoutMs,
    ),
  );
  try {
    await fetchJson(
      fetchImpl,
      {
        ...options,
        jobId: job.id,
        leaseRevision: job.leaseRevision,
        idempotencyKey: workerOperationId("settle-interrupted"),
        signal: undefined,
        requestTimeoutMs,
      },
      "PATCH",
      `/api/v1/admin/jobs/${encodeURIComponent(job.id)}`,
      {
        leaseRevision: job.leaseRevision,
        status: "failed",
        error: message,
        progress: { message: "Worker shutdown interrupted dispatch" },
        log: { level: "warning", message },
      },
    );
    return {
      id: job.id,
      type: job.type,
      status: "failed",
      error: message,
    };
  } catch (error) {
    const settlementError =
      error instanceof Error ? error.message : String(error);
    return {
      id: job.id,
      type: job.type,
      status: "failed",
      error: `${message}; failed to record terminal job state: ${settlementError}`,
    };
  }
}

function composeWorkerAbortSignals(
  ...signals: Array<AbortSignal | undefined>
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const listener = () => controller.abort(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push({ signal, listener });
  }
  return {
    signal: controller.signal,
    dispose(): void {
      for (const entry of listeners)
        entry.signal.removeEventListener("abort", entry.listener);
    },
  };
}

function workerShutdownController(
  signalSource: WorkerSignalSource,
): WorkerShutdownController {
  const controller = new AbortController();
  const handlers = new Map<WorkerShutdownSignal, () => void>();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = () => {
      if (!controller.signal.aborted)
        controller.abort(
          workerShutdownError(`Worker shutdown requested by ${signal}`),
        );
    };
    handlers.set(signal, handler);
    signalSource.once(signal, handler);
  }
  return {
    signal: controller.signal,
    dispose(): void {
      for (const [signal, handler] of handlers)
        signalSource.off(signal, handler);
    },
  };
}

function workerShutdownError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(
    typeof reason === "string" && reason.trim()
      ? reason
      : "Worker shutdown requested",
  );
  error.name = "WorkerShutdownError";
  return error;
}

function shutdownReason(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : typeof reason === "string" && reason.trim()
      ? reason
      : "Worker shutdown requested";
}

function normalizedWorkerShutdownTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.floor(value))
    : workerShutdownTimeoutMs;
}

async function workerPollDelay(
  sleep: (milliseconds: number) => Promise<void>,
  milliseconds: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!signal) {
    await sleep(milliseconds);
    return true;
  }
  if (signal.aborted) return false;
  return new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(sleep(milliseconds)).then(
      () => finish(true),
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function drainWorkerOnShutdown<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      timeout = setTimeout(() => {
        const error = new Error(
          `Worker shutdown did not drain within ${timeoutMs}ms`,
        );
        error.name = "WorkerShutdownTimeoutError";
        reject(error);
      }, timeoutMs);
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function cancellationError(abortController: AbortController): Error {
  return abortController.signal.reason instanceof Error
    ? abortController.signal.reason
    : new Error("Worker job cancelled");
}

function workerHeaders(options: WorkerOptions, hasBody: boolean): Headers {
  const headers = new Headers();
  if (hasBody) headers.set("content-type", "application/json");
  const credential = requireWorkerCredential(options);
  if (credential.kind === "worker") {
    headers.set("authorization", `Worker ${credential.token}`);
    headers.set("x-otte-worker-id", workerId(options));
    if (options.jobId) headers.set("x-otte-worker-job-id", options.jobId);
    if (options.leaseRevision !== undefined)
      headers.set(
        "x-otte-worker-lease-revision",
        String(options.leaseRevision),
      );
  } else {
    headers.set("authorization", `Bearer ${credential.token}`);
  }
  return headers;
}

function requireWorkerCredential(options: WorkerOptions): {
  kind: "worker" | "legacy_session";
  token: string;
} {
  const workerToken = options.workerToken?.trim();
  if (workerToken) return { kind: "worker", token: workerToken };
  const sessionToken = options.sessionToken?.trim();
  const environment =
    options.environment ?? process.env.NODE_ENV ?? "development";
  const legacyAllowed =
    environment === "test" ||
    (environment !== "production" && options.allowLegacySessionToken === true);
  if (sessionToken && legacyAllowed)
    return { kind: "legacy_session", token: sessionToken };
  if (sessionToken && environment === "production")
    throw new Error(
      "Legacy worker session tokens are disabled in production; configure OTTE_WORKER_TOKEN",
    );
  if (sessionToken)
    throw new Error(
      "Legacy worker session token compatibility is disabled; configure OTTE_WORKER_TOKEN or explicitly enable the non-production bridge",
    );
  throw new Error("Worker API token is required");
}

function workerCredentialOptions(
  env: Record<string, string | undefined>,
): Pick<
  WorkerOptions,
  "workerToken" | "sessionToken" | "allowLegacySessionToken" | "environment"
> {
  return {
    workerToken: env.OTTE_WORKER_TOKEN,
    sessionToken: env.OTTE_WORKER_SESSION_TOKEN ?? env.OTTE_SESSION_TOKEN,
    allowLegacySessionToken:
      env.OTTE_WORKER_ALLOW_LEGACY_SESSION_TOKEN === "true",
    environment: env.NODE_ENV,
  };
}

function workerId(options: WorkerOptions): string {
  return (
    sanitizeWorkerId(options.workerId) ??
    sanitizeWorkerId(process.env.OTTE_WORKER_ID) ??
    sanitizeWorkerId(process.env.HOSTNAME) ??
    sanitizeWorkerId(process.env.COMPUTERNAME) ??
    sanitizeWorkerId(hostname()) ??
    "otte-worker"
  );
}

function sanitizeWorkerId(value: string | undefined): string | undefined {
  const sanitized = value
    ?.trim()
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "");
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
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !isRecord(value.payload)
  ) {
    throw new Error(
      "Worker job requires string id, string type, and object payload",
    );
  }
  switch (value.type) {
    case "campaign.export":
      return {
        id: value.id,
        type: value.type,
        payload: { campaignId: requiredString(value.payload, "campaignId") },
      };
    case "campaign.import":
      return {
        id: value.id,
        type: value.type,
        payload: {
          archive: value.payload.archive,
          mode: importMode(value.payload.mode),
          expectedUpdatedAt: requiredDateTime(
            value.payload,
            "expectedUpdatedAt",
          ),
        },
      };
    case "asset.storage.migrate":
      return {
        id: value.id,
        type: value.type,
        payload: {
          campaignId: optionalString(value.payload, "campaignId"),
          assetIds: optionalStringArray(value.payload, "assetIds"),
          dryRun: optionalBoolean(value.payload, "dryRun"),
          includeDeleted: optionalBoolean(value.payload, "includeDeleted"),
          overwrite: optionalBoolean(value.payload, "overwrite"),
        },
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
          graceDays: optionalNumber(value.payload, "graceDays"),
        },
      };
    case "storage.backup":
      return {
        id: value.id,
        type: value.type,
        payload: { reason: optionalString(value.payload, "reason") },
      };
    case "storage.restoreDrill":
      return {
        id: value.id,
        type: value.type,
        payload: {
          backupFileName: optionalString(value.payload, "backupFileName"),
        },
      };
    case "ai.memory.extract":
      return {
        id: value.id,
        type: value.type,
        payload: {
          campaignId: requiredString(value.payload, "campaignId"),
          sourceText: optionalString(value.payload, "sourceText"),
          visibility: optionalEnum(value.payload, "visibility", [
            "public",
            "gm_only",
          ]),
          expectedUpdatedAt: requiredDateTime(
            value.payload,
            "expectedUpdatedAt",
          ),
        },
      };
    case "ai.session.recap":
      return {
        id: value.id,
        type: value.type,
        payload: {
          campaignId: requiredString(value.payload, "campaignId"),
          sessionId: optionalString(value.payload, "sessionId"),
          transcript: optionalString(value.payload, "transcript"),
          manualNotes: optionalString(value.payload, "manualNotes"),
          expectedUpdatedAt: requiredDateTime(
            value.payload,
            "expectedUpdatedAt",
          ),
        },
      };
    case "report.bundle":
      return {
        id: value.id,
        type: value.type,
        payload: { campaignId: requiredString(value.payload, "campaignId") },
      };
    default:
      throw new Error(`Unsupported worker job type: ${value.type}`);
  }
}

function parseLeasedWorkerJob(
  value: unknown,
): WorkerJob & { leaseRevision: number } {
  const job = parseWorkerJob(value);
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.leaseRevision) ||
    Number(value.leaseRevision) < 1
  ) {
    throw new Error(
      "Leased worker job requires a positive integer leaseRevision",
    );
  }
  return { ...job, leaseRevision: Number(value.leaseRevision) };
}

function normalizedOperationId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= 160 ? normalized : undefined;
}

function workerOperationId(operation: string): string {
  return `worker-${operation}-${randomUUID()}`.slice(0, 160);
}

function importMode(value: unknown): "upsert" | "reject_conflicts" | undefined {
  if (value === undefined) return undefined;
  if (value === "upsert" || value === "reject_conflicts") return value;
  throw new Error("campaign.import mode must be upsert or reject_conflicts");
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Worker job payload requires ${key}`);
  return value;
}

function requiredDateTime(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Worker job payload field ${key} must be a valid date-time`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new Error(`Worker job payload field ${key} must be a string`);
  return value;
}

function optionalEnum<const Value extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly Value[],
): Value | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw new Error(
      `Worker job payload field ${key} must be one of ${allowed.join(", ")}`,
    );
  }
  return value as Value;
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error(`Worker job payload field ${key} must be a string array`);
  return value;
}

function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean")
    throw new Error(`Worker job payload field ${key} must be a boolean`);
  return value;
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Worker job payload field ${key} must be a finite number`);
  return value;
}

function compactPayload(payload: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function readAll(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runWorkerCli();
}
