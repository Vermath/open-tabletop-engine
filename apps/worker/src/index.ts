import { pathToFileURL } from "node:url";
import type { Readable, Writable } from "node:stream";

export type WorkerJob =
  | { id: string; type: "campaign.export"; payload: { campaignId: string } }
  | { id: string; type: "campaign.import"; payload: { archive: unknown; mode?: "upsert" | "reject_conflicts" } }
  | { id: string; type: "ai.memory.extract"; payload: { campaignId: string; sourceText?: string } }
  | { id: string; type: "ai.session.recap"; payload: { campaignId: string; transcript?: string } };

export interface WorkerOptions {
  apiBaseUrl: string;
  sessionToken?: string;
  userId?: string;
  fetch?: typeof fetch;
}

export interface WorkerResult {
  id: string;
  type: WorkerJob["type"];
  status: "succeeded";
  output: unknown;
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

export async function runWorkerCli(
  env: Record<string, string | undefined> = process.env,
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
  stderr: Writable = process.stderr
): Promise<number> {
  try {
    const job = parseWorkerJob(JSON.parse(await readAll(stdin)) as unknown);
    const result = await runWorkerJob(job, {
      apiBaseUrl: env.OTTE_API_URL ?? env.API_URL ?? "http://127.0.0.1:4000",
      sessionToken: env.OTTE_SESSION_TOKEN,
      userId: env.OTTE_USER_ID ?? "usr_demo_gm"
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
  const response = await fetchImpl(`${options.apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: workerHeaders(options, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`Worker API request failed with ${response.status} ${method} ${path}: ${detail.slice(0, 500)}`);
  }
  return payload;
}

function workerHeaders(options: WorkerOptions, hasBody: boolean): Headers {
  const headers = new Headers();
  if (hasBody) headers.set("content-type", "application/json");
  if (options.sessionToken) {
    headers.set("authorization", `Bearer ${options.sessionToken}`);
  } else if (options.userId) {
    headers.set("x-user-id", options.userId);
  }
  return headers;
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
