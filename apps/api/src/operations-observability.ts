const LATENCY_BUCKET_LIMITS_MS = [25, 100, 250, 1_000, 5_000] as const;

export type RealtimeMetricEvent = "connected" | "disconnected" | "revoked" | "send_failure";
export type RecoveryMetricOperation = "backup" | "restore_drill" | "restore";
export type MetricOutcome = "succeeded" | "failed";

interface LatencyState {
  count: number;
  totalMs: number;
  maxMs: number;
  buckets: number[];
}

export interface OperationsMetricsSnapshot {
  version: 1;
  enabled: boolean;
  startedAt: string;
  generatedAt: string;
  privacy: {
    boundedDimensions: true;
    containsCampaignIds: false;
    containsUserIds: false;
    containsCredentials: false;
    containsPrivateContent: false;
  };
  http: {
    requests: number;
    errorResponses: number;
    staleWriteConflicts: number;
    methods: Record<"GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "OTHER", number>;
    statusClasses: Record<"2xx" | "3xx" | "4xx" | "5xx", number>;
    latencyMs: LatencySnapshot;
  };
  realtime: {
    connectionsOpened: number;
    disconnections: number;
    revokedConnections: number;
    sendFailures: number;
    activeConnections: number;
    heartbeatGapMs: LatencySnapshot;
  };
  persistence: {
    attempts: number;
    succeeded: number;
    failed: number;
    latencyMs: LatencySnapshot;
  };
  recovery: Record<RecoveryMetricOperation, { attempts: number; succeeded: number; failed: number; latencyMs: LatencySnapshot }>;
}

interface LatencySnapshot {
  count: number;
  totalMs: number;
  maxMs: number;
  buckets: Array<{ le: number | "infinity"; count: number }>;
}

const emptyLatency = (): LatencyState => ({ count: 0, totalMs: 0, maxMs: 0, buckets: Array(LATENCY_BUCKET_LIMITS_MS.length + 1).fill(0) as number[] });
const emptyOutcome = () => ({ attempts: 0, succeeded: 0, failed: 0, latency: emptyLatency() });

export class OperationsObservability {
  private readonly enabled: boolean;
  private readonly now: () => Date;
  private readonly startedAt: string;
  private readonly httpLatency = emptyLatency();
  private readonly persistenceLatency = emptyLatency();
  private readonly methods = { GET: 0, POST: 0, PATCH: 0, PUT: 0, DELETE: 0, OTHER: 0 };
  private readonly statusClasses = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  private readonly recovery = { backup: emptyOutcome(), restore_drill: emptyOutcome(), restore: emptyOutcome() };
  private requests = 0;
  private errorResponses = 0;
  private staleWriteConflicts = 0;
  private connectionsOpened = 0;
  private disconnections = 0;
  private revokedConnections = 0;
  private sendFailures = 0;
  private activeConnections = 0;
  private readonly realtimeHeartbeatGap = emptyLatency();
  private persistenceSucceeded = 0;
  private persistenceFailed = 0;

  constructor(options: { enabled?: boolean; now?: () => Date } = {}) {
    this.enabled = options.enabled ?? true;
    this.now = options.now ?? (() => new Date());
    this.startedAt = this.now().toISOString();
  }

  recordHttp(method: string, statusCode: number, durationMs: number): void {
    if (!this.enabled) return;
    this.requests += 1;
    this.methods[httpMethod(method)] += 1;
    this.statusClasses[statusClass(statusCode)] += 1;
    if (statusCode >= 500) this.errorResponses += 1;
    observe(this.httpLatency, durationMs);
  }

  recordStaleWriteConflict(): void {
    if (this.enabled) this.staleWriteConflicts += 1;
  }

  recordRealtime(event: RealtimeMetricEvent): void {
    if (!this.enabled) return;
    if (event === "connected") {
      this.connectionsOpened += 1;
      this.activeConnections += 1;
      return;
    }
    this.disconnections += 1;
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    if (event === "revoked") this.revokedConnections += 1;
    if (event === "send_failure") this.sendFailures += 1;
  }

  recordRealtimeHeartbeat(gapMs: number): void {
    if (this.enabled) observe(this.realtimeHeartbeatGap, gapMs);
  }

  recordPersistence(outcome: MetricOutcome, durationMs: number): void {
    if (!this.enabled) return;
    if (outcome === "succeeded") this.persistenceSucceeded += 1;
    else this.persistenceFailed += 1;
    observe(this.persistenceLatency, durationMs);
  }

  recordRecovery(operation: RecoveryMetricOperation, outcome: MetricOutcome, durationMs: number): void {
    if (!this.enabled) return;
    const state = this.recovery[operation];
    state.attempts += 1;
    state[outcome] += 1;
    observe(state.latency, durationMs);
  }

  snapshot(): OperationsMetricsSnapshot {
    return {
      version: 1,
      enabled: this.enabled,
      startedAt: this.startedAt,
      generatedAt: this.now().toISOString(),
      privacy: { boundedDimensions: true, containsCampaignIds: false, containsUserIds: false, containsCredentials: false, containsPrivateContent: false },
      http: {
        requests: this.requests,
        errorResponses: this.errorResponses,
        staleWriteConflicts: this.staleWriteConflicts,
        methods: { ...this.methods },
        statusClasses: { ...this.statusClasses },
        latencyMs: latencySnapshot(this.httpLatency),
      },
      realtime: {
        connectionsOpened: this.connectionsOpened,
        disconnections: this.disconnections,
        revokedConnections: this.revokedConnections,
        sendFailures: this.sendFailures,
        activeConnections: this.activeConnections,
        heartbeatGapMs: latencySnapshot(this.realtimeHeartbeatGap),
      },
      persistence: {
        attempts: this.persistenceSucceeded + this.persistenceFailed,
        succeeded: this.persistenceSucceeded,
        failed: this.persistenceFailed,
        latencyMs: latencySnapshot(this.persistenceLatency),
      },
      recovery: Object.fromEntries(Object.entries(this.recovery).map(([operation, state]) => [operation, {
        attempts: state.attempts,
        succeeded: state.succeeded,
        failed: state.failed,
        latencyMs: latencySnapshot(state.latency),
      }])) as OperationsMetricsSnapshot["recovery"],
    };
  }
}

export function operationsMetricsEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.OTTE_OPERATIONS_METRICS?.trim().toLowerCase();
  return !value || !["0", "false", "no", "off", "disabled"].includes(value);
}

function httpMethod(value: string): keyof OperationsMetricsSnapshot["http"]["methods"] {
  const normalized = value.toUpperCase();
  return normalized === "GET" || normalized === "POST" || normalized === "PATCH" || normalized === "PUT" || normalized === "DELETE" ? normalized : "OTHER";
}

function statusClass(statusCode: number): keyof OperationsMetricsSnapshot["http"]["statusClasses"] {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

function observe(state: LatencyState, rawDurationMs: number): void {
  const durationMs = Number.isFinite(rawDurationMs) ? Math.max(0, rawDurationMs) : 0;
  state.count += 1;
  state.totalMs += durationMs;
  state.maxMs = Math.max(state.maxMs, durationMs);
  const bucket = LATENCY_BUCKET_LIMITS_MS.findIndex((limit) => durationMs <= limit);
  const index = bucket < 0 ? state.buckets.length - 1 : bucket;
  state.buckets[index] = (state.buckets[index] ?? 0) + 1;
}

function latencySnapshot(state: LatencyState): LatencySnapshot {
  let cumulative = 0;
  return {
    count: state.count,
    totalMs: roundMilliseconds(state.totalMs),
    maxMs: roundMilliseconds(state.maxMs),
    buckets: state.buckets.map((count, index) => {
      cumulative += count;
      return { le: LATENCY_BUCKET_LIMITS_MS[index] ?? "infinity", count: cumulative };
    }),
  };
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
