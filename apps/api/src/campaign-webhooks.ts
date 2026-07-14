import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type {
  CampaignWebhookDelivery,
  CampaignWebhookEnvelopeV1,
  CampaignWebhookEventType,
  EngineEvent,
} from "@open-tabletop/core";

export const campaignWebhookEventTypes = [
  "campaign.updated",
  "campaign.session.created",
  "campaign.session.updated",
  "campaign.session.started",
  "campaign.session.completed",
  "campaign.session.deleted",
  "world.created",
  "world.updated",
  "world.deleted",
  "scene.created",
  "scene.updated",
  "scene.deleted",
  "scene.activated",
  "token.created",
  "token.updated",
  "token.moved",
  "token.deleted",
  "actor.created",
  "actor.updated",
  "actor.deleted",
  "item.created",
  "item.updated",
  "item.deleted",
  "journal.created",
  "journal.updated",
  "journal.deleted",
  "handout.created",
  "handout.updated",
  "handout.deleted",
  "asset.created",
  "asset.updated",
  "asset.deleted",
  "audio.updated",
  "audio.deleted",
  "combat.started",
  "combat.roundAdvanced",
  "combat.turnChanged",
  "combat.ended",
  "encounter.created",
  "encounter.updated",
  "encounter.deleted",
  "proposal.created",
  "proposal.updated",
  "proposal.approved",
  "proposal.rejected",
  "proposal.applied",
  "proposal.reverted",
] as const satisfies readonly CampaignWebhookEventType[];

const campaignWebhookEventTypeSet = new Set<string>(campaignWebhookEventTypes);
const defaultTimeoutMs = 5_000;
const maxRequestBytes = 32 * 1024;
const maxResponseBytes = 64 * 1024;

export type CampaignWebhookSafeErrorCode =
  | "invalid_target"
  | "insecure_target"
  | "blocked_target"
  | "dns_error"
  | "timeout"
  | "network_error"
  | "redirect_rejected"
  | "request_too_large"
  | "response_too_large"
  | "http_error";

export type CampaignWebhookTargetValidation =
  | { ok: true; normalizedUrl: string; resolvedAddresses: string[] }
  | { ok: false; errorCode: CampaignWebhookSafeErrorCode; message: string };

export interface CampaignWebhookTransportInput {
  url: string;
  body: string;
  headers: Readonly<Record<string, string>>;
}

export interface CampaignWebhookTransportResult {
  ok: boolean;
  responseStatus?: number;
  responseBytes?: number;
  errorCode?: CampaignWebhookSafeErrorCode;
}

export interface CampaignWebhookTransport {
  validateTarget(url: string): Promise<CampaignWebhookTargetValidation>;
  send(input: CampaignWebhookTransportInput): Promise<CampaignWebhookTransportResult>;
}

export interface CampaignWebhookTransportOptions {
  production?: boolean;
  timeoutMs?: number;
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

export function createCampaignWebhookTransport(options: CampaignWebhookTransportOptions = {}): CampaignWebhookTransport {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;

  const validateWithDeadline = (url: string, deadline: number) => validateCampaignWebhookTarget(url, {
    production,
    resolveHostname: (hostname) => settleBeforeDeadline(resolveHostname(hostname), deadline),
  });
  const validateTarget = (url: string) => validateWithDeadline(url, Date.now() + timeoutMs);
  return {
    validateTarget,
    async send(input) {
      const deadline = Date.now() + timeoutMs;
      const validation = await validateWithDeadline(input.url, deadline);
      if (!validation.ok) return { ok: false, errorCode: validation.errorCode };
      if (Buffer.byteLength(input.body, "utf8") > maxRequestBytes) return { ok: false, errorCode: "request_too_large" };
      const pinnedAddress = validation.resolvedAddresses[0];
      if (!pinnedAddress) return { ok: false, errorCode: "dns_error" };
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return { ok: false, errorCode: "timeout" };
      return sendPinnedCampaignWebhook(validation.normalizedUrl, pinnedAddress, input, remainingMs);
    },
  };
}

export async function validateCampaignWebhookTarget(
  value: string,
  options: { production: boolean; resolveHostname?: (hostname: string) => Promise<string[]> },
): Promise<CampaignWebhookTargetValidation> {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) return invalidTarget("Webhook URL must be 1-2048 characters");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return invalidTarget("Webhook URL must be an absolute HTTP(S) URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return invalidTarget("Webhook URL must use HTTP or HTTPS");
  if (options.production && url.protocol !== "https:") {
    return { ok: false, errorCode: "insecure_target", message: "Production webhook URLs must use HTTPS" };
  }
  if (url.username || url.password) return invalidTarget("Webhook URL must not contain credentials");
  if (url.search || url.hash) return invalidTarget("Webhook URL must not contain a query string or fragment");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".lan")) {
    return blockedTarget();
  }
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) return blockedTarget();
    url.hostname = hostname;
    return { ok: true, normalizedUrl: url.toString(), resolvedAddresses: [hostname] };
  } else {
    let addresses: string[];
    try {
      addresses = await (options.resolveHostname ?? defaultResolveHostname)(hostname);
    } catch (error) {
      if (error instanceof CampaignWebhookDeadlineError) return { ok: false, errorCode: "timeout", message: "Webhook target validation timed out" };
      return { ok: false, errorCode: "dns_error", message: "Webhook hostname could not be resolved" };
    }
    if (addresses.length === 0) return { ok: false, errorCode: "dns_error", message: "Webhook hostname did not resolve to an address" };
    if (addresses.some((address) => !isPublicAddress(address))) return blockedTarget();
    url.hostname = hostname;
    return { ok: true, normalizedUrl: url.toString(), resolvedAddresses: addresses };
  }
}

export function isCampaignWebhookEventType(value: unknown): value is CampaignWebhookEventType {
  return typeof value === "string" && campaignWebhookEventTypeSet.has(value);
}

/** Converts an internal event to a fixed metadata envelope and never inspects payload. */
export function campaignWebhookEnvelope(event: EngineEvent): CampaignWebhookEnvelopeV1 | undefined {
  if (!isCampaignWebhookEventType(event.type)) return undefined;
  const resourceType = webhookResourceType(event.type);
  return {
    version: "1.0",
    eventId: event.id,
    eventType: event.type,
    occurredAt: event.timestamp,
    campaignId: event.campaignId,
    ...(resourceType && event.targetId ? { resource: { type: resourceType, id: event.targetId } } : {}),
  };
}

export function campaignWebhookEnvelopeFromDelivery(delivery: CampaignWebhookDelivery): CampaignWebhookEnvelopeV1 {
  return {
    version: "1.0",
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    occurredAt: delivery.occurredAt,
    campaignId: delivery.campaignId,
    ...(delivery.resourceType && delivery.resourceId ? { resource: { type: delivery.resourceType, id: delivery.resourceId } } : {}),
  };
}

export function campaignWebhookSignedRequest(
  envelope: CampaignWebhookEnvelopeV1,
  signingSecret: string,
  timestamp = Math.floor(Date.now() / 1_000).toString(),
): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(envelope);
  const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return {
    body,
    headers: {
      "content-type": "application/json",
      "user-agent": "OpenTabletop-Webhook/1.0",
      "x-open-tabletop-event-id": envelope.eventId,
      "x-open-tabletop-timestamp": timestamp,
      "x-open-tabletop-signature": `v1=${signature}`,
    },
  };
}

function webhookResourceType(type: CampaignWebhookEventType): string | undefined {
  if (type.startsWith("campaign.session.")) return "campaign_session";
  const prefix = type.split(".")[0];
  return prefix === "campaign" ? "campaign" : prefix;
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

function invalidTarget(message: string): CampaignWebhookTargetValidation {
  return { ok: false, errorCode: "invalid_target", message };
}

function blockedTarget(): CampaignWebhookTargetValidation {
  return { ok: false, errorCode: "blocked_target", message: "Webhook targets must resolve only to public internet addresses" };
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return defaultTimeoutMs;
  return Math.max(500, Math.min(15_000, Math.floor(value!)));
}

function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? address.toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;
  if (normalized.startsWith("::ffff:")) return isPublicIpv4(normalized.slice(7));
  const numeric = ipv6ToBigInt(normalized);
  if (numeric === undefined) return false;
  // Outbound integrations accept only assigned global-unicast space. This
  // rejects loopback, ULA, link/site-local, multicast, NAT64, and transition
  // ranges by construction, then removes special-use holes within 2000::/3.
  if (numeric >> 125n !== 1n) return false;
  if (ipv6InPrefix(numeric, "2001::", 23)) return false;
  if (ipv6InPrefix(numeric, "2001:db8::", 32)) return false;
  if (ipv6InPrefix(numeric, "2002::", 16)) return false;
  if (ipv6InPrefix(numeric, "3fff::", 20)) return false;
  return true;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  const c = parts[2]!;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function sendPinnedCampaignWebhook(
  normalizedUrl: string,
  pinnedAddress: string,
  input: CampaignWebhookTransportInput,
  timeoutMs: number,
): Promise<CampaignWebhookTransportResult> {
  const target = new URL(normalizedUrl);
  const requestImpl = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: CampaignWebhookTransportResult) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      resolve(result);
    };
    const request = requestImpl({
      protocol: target.protocol,
      hostname: pinnedAddress,
      port: target.port || undefined,
      path: target.pathname || "/",
      method: "POST",
      servername: isIP(target.hostname) ? undefined : target.hostname,
      headers: {
        ...input.headers,
        host: target.host,
        "content-length": Buffer.byteLength(input.body, "utf8"),
      },
    }, (response) => {
      const responseStatus = response.statusCode ?? 0;
      if (responseStatus >= 300 && responseStatus < 400) {
        response.destroy();
        finish({ ok: false, responseStatus, errorCode: "redirect_rejected" });
        return;
      }
      const declaredLength = Number(response.headers["content-length"]);
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        response.destroy();
        finish({ ok: false, responseStatus, errorCode: "response_too_large" });
        return;
      }
      let responseBytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        responseBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
        if (responseBytes > maxResponseBytes) {
          response.destroy();
          finish({ ok: false, responseStatus, errorCode: "response_too_large" });
        }
      });
      response.on("end", () => {
        if (settled) return;
        if (responseStatus < 200 || responseStatus >= 300) finish({ ok: false, responseStatus, responseBytes, errorCode: "http_error" });
        else finish({ ok: true, responseStatus, responseBytes });
      });
      response.on("error", () => finish({ ok: false, responseStatus, errorCode: "network_error" }));
      response.on("aborted", () => finish({ ok: false, responseStatus, errorCode: timedOut ? "timeout" : "network_error" }));
    });
    deadlineTimer = setTimeout(() => {
      timedOut = true;
      request.destroy();
      finish({ ok: false, errorCode: "timeout" });
    }, Math.max(1, timeoutMs));
    request.on("error", () => finish({ ok: false, errorCode: timedOut ? "timeout" : "network_error" }));
    request.end(input.body);
  });
}

class CampaignWebhookDeadlineError extends Error {
  constructor() {
    super("Campaign webhook deadline exceeded");
    this.name = "CampaignWebhookDeadlineError";
  }
}

function settleBeforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new CampaignWebhookDeadlineError());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CampaignWebhookDeadlineError()), remainingMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function ipv6InPrefix(value: bigint, prefix: string, prefixLength: number): boolean {
  const prefixValue = ipv6ToBigInt(prefix);
  if (prefixValue === undefined) return false;
  const shift = BigInt(128 - prefixLength);
  return value >> shift === prefixValue >> shift;
}

function ipv6ToBigInt(address: string): bigint | undefined {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(lastColon + 1);
    const parts = ipv4.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
    normalized = `${normalized.slice(0, lastColon)}:${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  const words = [...left, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return undefined;
  return words.reduce((result, word) => (result << 16n) | BigInt(`0x${word}`), 0n);
}
