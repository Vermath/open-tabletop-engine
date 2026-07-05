export const relayLimits = {
  tableTtlMs: 12 * 60 * 60 * 1000,
  maxRequestBodyBytes: 8 * 1024 * 1024,
  maxClientWebSocketsPerTable: 64,
  maxHttpWaitMs: 30_000,
  rateLimitWindowMs: 60_000,
  maxRequestsPerWindow: 120
} as const;

export interface RelayTableRecord {
  slug: string;
  hostToken: string;
  publicUrl: string;
  expiresAt: string;
}

export interface RelayTableStatus {
  slug: string;
  hostConnected: boolean;
  expired: boolean;
  expiresAt: string;
}

export function createRelayTable(input: { nowMs?: number; publicBaseUrl: string }): RelayTableRecord {
  const nowMs = input.nowMs ?? Date.now();
  const slug = `tbl_${randomUrlToken(18)}`;
  return {
    slug,
    hostToken: `ott_host_${randomUrlToken(32)}`,
    publicUrl: `${input.publicBaseUrl.replace(/\/+$/, "")}/t/${slug}`,
    expiresAt: new Date(nowMs + relayLimits.tableTtlMs).toISOString()
  };
}

export function relayTableStatus(input: { slug: string; expiresAt: string; hostConnected: boolean }, nowMs = Date.now()): RelayTableStatus {
  return {
    slug: input.slug,
    hostConnected: input.hostConnected,
    expired: Date.parse(input.expiresAt) <= nowMs,
    expiresAt: input.expiresAt
  };
}

export async function verifyHostToken(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(provided)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

export async function hostTokenHash(hostToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(hostToken));
  return bytesToBase64Url(new Uint8Array(hash));
}

export async function verifyHostTokenHash(provided: string, expectedHash: string): Promise<boolean> {
  return timingSafeEqual(asciiBytes(await hostTokenHash(provided)), asciiBytes(expectedHash));
}

export function requestIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class MemoryRateLimiter {
  private readonly buckets = new Map<string, { resetAt: number; count: number }>();

  constructor(private readonly options: { windowMs: number; maxRequests: number }) {}

  check(key: string, nowMs = Date.now()): RateLimitDecision {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= nowMs) {
      this.buckets.set(key, { resetAt: nowMs + this.options.windowMs, count: 1 });
      return { allowed: true, remaining: this.options.maxRequests - 1, retryAfterMs: 0 };
    }
    current.count += 1;
    const remaining = Math.max(0, this.options.maxRequests - current.count);
    return {
      allowed: current.count <= this.options.maxRequests,
      remaining,
      retryAfterMs: Math.max(0, current.resetAt - nowMs)
    };
  }
}

function randomUrlToken(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index]! ^ right[index]!;
  return diff === 0;
}
