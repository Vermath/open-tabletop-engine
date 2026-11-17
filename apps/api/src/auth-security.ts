import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const maxPasswordHashBytes = 128;

export type PasswordVerificationStatus = "match" | "mismatch" | "invalid_hash" | "saturated";
export interface PasswordVerificationResult { status: PasswordVerificationStatus; ok: boolean }
export type PasswordHashStatus = "hashed" | "saturated" | "failed";
export type PasswordHashResult =
  | { status: "hashed"; hash: string }
  | { status: "saturated" | "failed" };

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptBytes(password, salt, 32);
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

export async function verifyPasswordAsync(password: unknown, storedHash: string): Promise<PasswordVerificationResult> {
  if (typeof password !== "string") return { status: "mismatch", ok: false };
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) return { status: "invalid_hash", ok: false };
  const actual = await scryptBytes(password, parsed.salt, parsed.expected.length);
  const ok = actual.length === parsed.expected.length && timingSafeEqual(actual, parsed.expected);
  return { status: ok ? "match" : "mismatch", ok };
}

export interface BoundedPasswordVerifierOptions {
  maxConcurrent?: number;
  maxQueue?: number;
  maxQueueWaitMs?: number;
  verify?: (password: unknown, storedHash: string) => Promise<PasswordVerificationResult>;
  hash?: (password: string) => Promise<string>;
}

/** Keeps all expensive password work off the event loop and caps libuv queue pressure. */
export class BoundedPasswordVerifier {
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly maxQueueWaitMs: number;
  private readonly verifyWork: (password: unknown, storedHash: string) => Promise<PasswordVerificationResult>;
  private readonly hashWork: (password: string) => Promise<string>;
  private active = 0;
  private completedVerifications = 0;
  private completedHashes = 0;
  private saturationCount = 0;
  private queueTimeoutCount = 0;
  private failureCount = 0;
  private readonly queue: Array<{
    start: () => void;
    saturate: () => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(options: BoundedPasswordVerifierOptions = {}) {
    this.maxConcurrent = boundedInteger(options.maxConcurrent, 2, 1, 16);
    this.maxQueue = boundedInteger(options.maxQueue, 32, 0, 1_000);
    this.maxQueueWaitMs = boundedInteger(options.maxQueueWaitMs, 2_000, 50, 30_000);
    this.verifyWork = options.verify ?? verifyPasswordAsync;
    this.hashWork = options.hash ?? hashPasswordAsync;
  }

  verify(password: unknown, storedHash: string): Promise<PasswordVerificationResult> {
    return this.enqueue(async () => {
      try {
        const result = await this.verifyWork(password, storedHash);
        this.completedVerifications += 1;
        return result;
      } catch {
        this.failureCount += 1;
        return { status: "invalid_hash", ok: false };
      }
    }, { status: "saturated", ok: false });
  }

  hash(password: string): Promise<PasswordHashResult> {
    return this.enqueue<PasswordHashResult>(async () => {
      try {
        const hash = await this.hashWork(password);
        this.completedHashes += 1;
        return { status: "hashed", hash };
      } catch {
        this.failureCount += 1;
        return { status: "failed" };
      }
    }, { status: "saturated" });
  }

  status(): {
    active: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
    completedVerifications: number;
    completedHashes: number;
    saturationCount: number;
    queueTimeoutCount: number;
    failureCount: number;
  } {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
      completedVerifications: this.completedVerifications,
      completedHashes: this.completedHashes,
      saturationCount: this.saturationCount,
      queueTimeoutCount: this.queueTimeoutCount,
      failureCount: this.failureCount,
    };
  }

  private enqueue<T>(work: () => Promise<T>, saturatedResult: T): Promise<T> {
    if (this.active < this.maxConcurrent) return this.run(work);
    if (this.queue.length >= this.maxQueue) {
      this.saturationCount += 1;
      return Promise.resolve(saturatedResult);
    }
    return new Promise<T>((resolve) => {
      const queued = {
        start: () => { void this.run(work).then(resolve); },
        saturate: () => resolve(saturatedResult),
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      queued.timer = setTimeout(() => {
        const index = this.queue.indexOf(queued);
        if (index < 0) return;
        this.queue.splice(index, 1);
        this.saturationCount += 1;
        this.queueTimeoutCount += 1;
        queued.saturate();
      }, this.maxQueueWaitMs);
      queued.timer.unref?.();
      this.queue.push(queued);
    });
  }

  private async run<T>(work: () => Promise<T>): Promise<T> {
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timer);
      next.start();
    }
  }
}

export interface ProxyClientIdentityInput {
  remoteAddress?: string;
  forwardedFor?: string | string[];
  trustedProxyHops?: number;
}

export interface ProxyClientIdentity {
  ip: string;
  source: "socket" | "forwarded";
  forwardedChainValid: boolean;
}

/** Uses only the right-most explicitly trusted proxy hops; attacker prefixes are ignored. */
export function proxyClientIdentity(input: ProxyClientIdentityInput): ProxyClientIdentity {
  const remote = normalizedIp(input.remoteAddress) ?? "unknown";
  const trustedHops = boundedInteger(input.trustedProxyHops, 0, 0, 8);
  if (trustedHops === 0) return { ip: remote, source: "socket", forwardedChainValid: true };
  const forwardedClient = forwardedClientIp(input.forwardedFor, trustedHops);
  if (!forwardedClient || remote === "unknown") return { ip: remote, source: "socket", forwardedChainValid: false };
  return { ip: forwardedClient, source: "forwarded", forwardedChainValid: true };
}

export interface LoginThrottleConfig {
  windowMs: number;
  accountMaxAttempts: number;
  networkMaxAttempts: number;
  accountNetworkMaxAttempts: number;
  maxBuckets: number;
}

export interface LoginThrottleInput { account?: string; network: string }
export interface LoginThrottleDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  limitedBy: Array<"account" | "network" | "account_network">;
  /** Persist at most the first crossing for each bounded bucket/window. */
  auditRecommended: boolean;
}

type ThrottleBucket = { count: number; resetAt: number; pairAccount?: string };

/** Dual-dimension login limiter: distributed attacks hit account limits, NAT abuse hits network limits. */
export class LoginAttemptThrottle {
  private readonly buckets = new Map<string, ThrottleBucket>();
  private readonly pairKeysByAccount = new Map<string, Set<string>>();
  private consumedAttempts = 0;
  private limitedAttempts = 0;
  constructor(private readonly config: LoginThrottleConfig = loginThrottleConfigFromEnv()) {}

  consume(input: LoginThrottleInput, now = Date.now()): LoginThrottleDecision {
    this.consumedAttempts += 1;
    this.prune(now, 64);
    const account = accountThrottleKey(input.account);
    const network = networkThrottleKey(input.network);
    const currentAccountBucket = account ? this.buckets.get(`account:${account}`) : undefined;
    const accountWillBeLimited = Boolean(currentAccountBucket && currentAccountBucket.resetAt > now && currentAccountBucket.count >= this.config.accountMaxAttempts);
    const dimensions: Array<{ kind: LoginThrottleDecision["limitedBy"][number]; key: string; limit: number; pairAccount?: string }> = [
      { kind: "network", key: `network:${network}`, limit: this.config.networkMaxAttempts },
      ...(account ? [
        { kind: "account" as const, key: `account:${account}`, limit: this.config.accountMaxAttempts },
        ...(!accountWillBeLimited ? [{ kind: "account_network" as const, key: `pair:${account}:${network}`, limit: this.config.accountNetworkMaxAttempts, pairAccount: account }] : []),
      ] : []),
    ];
    const limitedBy: LoginThrottleDecision["limitedBy"] = [];
    let auditRecommended = false;
    let retryAfterMs = 0;
    for (const dimension of dimensions) {
      const current = this.buckets.get(dimension.key);
      const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + this.config.windowMs, ...(dimension.pairAccount ? { pairAccount: dimension.pairAccount } : {}) };
      bucket.count += 1;
      // Refresh insertion order so bounded eviction is O(1) LRU instead of a
      // synchronous full-map sort during an attack.
      if (current) this.buckets.delete(dimension.key);
      this.buckets.set(dimension.key, bucket);
      if (dimension.pairAccount) {
        const keys = this.pairKeysByAccount.get(dimension.pairAccount) ?? new Set<string>();
        keys.add(dimension.key);
        this.pairKeysByAccount.set(dimension.pairAccount, keys);
      }
      if (bucket.count > dimension.limit) {
        limitedBy.push(dimension.kind);
        if (bucket.count === dimension.limit + 1) auditRecommended = true;
        retryAfterMs = Math.max(retryAfterMs, bucket.resetAt - now);
      }
    }
    this.enforceBound();
    if (limitedBy.length > 0) this.limitedAttempts += 1;
    return { allowed: limitedBy.length === 0, retryAfterSeconds: limitedBy.length ? Math.max(1, Math.ceil(retryAfterMs / 1_000)) : 0, limitedBy, auditRecommended };
  }

  resetAccount(accountValue: string | undefined): void {
    const account = accountThrottleKey(accountValue);
    if (!account) return;
    this.evict(`account:${account}`);
    for (const key of this.pairKeysByAccount.get(account) ?? []) this.evict(key);
    this.pairKeysByAccount.delete(account);
  }

  size(): number { return this.buckets.size; }

  status(): { bucketCount: number; maxBuckets: number; consumedAttempts: number; limitedAttempts: number } {
    return { bucketCount: this.buckets.size, maxBuckets: this.config.maxBuckets, consumedAttempts: this.consumedAttempts, limitedAttempts: this.limitedAttempts };
  }

  private prune(now: number, budget: number): void {
    let inspected = 0;
    for (const [key, bucket] of this.buckets) {
      if (inspected++ >= budget) break;
      if (bucket.resetAt <= now) this.evict(key);
    }
  }

  private enforceBound(): void {
    while (this.buckets.size > this.config.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.evict(oldestKey);
    }
  }

  private evict(key: string): void {
    const bucket = this.buckets.get(key);
    this.buckets.delete(key);
    if (!bucket?.pairAccount) return;
    const keys = this.pairKeysByAccount.get(bucket.pairAccount);
    keys?.delete(key);
    if (keys?.size === 0) this.pairKeysByAccount.delete(bucket.pairAccount);
  }
}

export function loginThrottleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LoginThrottleConfig {
  const configuredWindowSeconds = numberEnv(env.OTTE_LOGIN_RATE_LIMIT_WINDOW_SECONDS);
  return {
    windowMs: boundedInteger(configuredWindowSeconds === undefined ? undefined : configuredWindowSeconds * 1_000, 60_000, 1_000, 3_600_000),
    accountMaxAttempts: boundedInteger(numberEnv(env.OTTE_LOGIN_RATE_LIMIT_ACCOUNT_MAX), 10, 1, 10_000),
    networkMaxAttempts: boundedInteger(numberEnv(env.OTTE_LOGIN_RATE_LIMIT_NETWORK_MAX), 60, 1, 100_000),
    accountNetworkMaxAttempts: boundedInteger(numberEnv(env.OTTE_LOGIN_RATE_LIMIT_PAIR_MAX), 5, 1, 10_000),
    maxBuckets: boundedInteger(numberEnv(env.OTTE_LOGIN_RATE_LIMIT_MAX_BUCKETS), 50_000, 100, 1_000_000),
  };
}

export function trustedProxyHopsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return boundedInteger(numberEnv(env.OTTE_TRUSTED_PROXY_HOPS), 0, 0, 8);
}

function parsePasswordHash(storedHash: string): { salt: string; expected: Buffer } | undefined {
  const [algorithm, salt, expectedText, extra] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedText || extra !== undefined || salt.length > 128) return undefined;
  const expected = Buffer.from(expectedText, "base64url");
  if (expected.length < 16 || expected.length > maxPasswordHashBytes) return undefined;
  return { salt, expected };
}

async function scryptBytes(password: string, salt: string, length: number): Promise<Buffer> {
  return await scryptAsync(password, salt, length) as Buffer;
}

function forwardedClientIp(value: string | string[] | undefined, trustedHops: number): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.length !== 1) return undefined;
  const raw = Array.isArray(value) ? value[0]! : value;
  const values = raw.split(",");
  const clientIndex = values.length - trustedHops;
  if (clientIndex < 0 || clientIndex >= values.length) return undefined;
  // Only the right-most trusted segment is security-relevant. Nginx appends
  // the actual peer to attacker-supplied prefixes, so malformed/long prefixes
  // must not collapse all callers onto the shared proxy socket bucket.
  const trustedSegment = values.slice(clientIndex).map((entry) => normalizedIp(entry.trim()));
  if (trustedSegment.some((entry) => !entry)) return undefined;
  return trustedSegment[0];
}

function normalizedIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim().replace(/^\[|\]$/g, "").split("%")[0]!;
  if (candidate.toLowerCase().startsWith("::ffff:")) {
    const mapped = candidate.slice(7);
    return isIP(mapped) === 4 ? mapped : undefined;
  }
  return isIP(candidate) ? candidate.toLowerCase() : undefined;
}

function accountThrottleKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : undefined;
}

function networkThrottleKey(value: string): string {
  return normalizedIp(value) ?? "unknown";
}

function numberEnv(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(value!)));
}
