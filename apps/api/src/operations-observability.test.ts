import { describe, expect, it } from "vitest";
import { OperationsObservability, operationsMetricsEnabled } from "./operations-observability.js";

describe("operations observability", () => {
  it("records only fixed, low-cardinality dimensions", () => {
    const metrics = new OperationsObservability({ now: () => new Date("2026-07-15T12:00:00.000Z") });
    metrics.recordHttp("GET", 200, 20);
    metrics.recordHttp("CUSTOM /campaign/secret?sessionToken=ots_private", 503, 6_000);
    metrics.recordStaleWriteConflict();
    metrics.recordRealtime("connected");
    metrics.recordRealtimeHeartbeat(15_250);
    metrics.recordRealtime("send_failure");
    metrics.recordPersistence("succeeded", 12.5);
    metrics.recordPersistence("failed", 120);
    metrics.recordRecovery("backup", "failed", 2_000);

    const snapshot = metrics.snapshot();
    expect(snapshot.http).toMatchObject({
      requests: 2,
      errorResponses: 1,
      staleWriteConflicts: 1,
      methods: { GET: 1, OTHER: 1 },
      statusClasses: { "2xx": 1, "5xx": 1 },
    });
    expect(snapshot.realtime).toEqual({
      connectionsOpened: 1,
      disconnections: 1,
      revokedConnections: 0,
      sendFailures: 1,
      activeConnections: 0,
      heartbeatGapMs: {
        count: 1,
        totalMs: 15_250,
        maxMs: 15_250,
        buckets: [
          { le: 25, count: 0 },
          { le: 100, count: 0 },
          { le: 250, count: 0 },
          { le: 1_000, count: 0 },
          { le: 5_000, count: 0 },
          { le: "infinity", count: 1 },
        ],
      },
    });
    expect(snapshot.persistence).toMatchObject({ attempts: 2, succeeded: 1, failed: 1, latencyMs: { count: 2, maxMs: 120 } });
    expect(snapshot.recovery.backup).toMatchObject({ attempts: 1, succeeded: 0, failed: 1 });
    expect(JSON.stringify(snapshot)).not.toContain("ots_private");
    expect(snapshot.privacy).toEqual({ boundedDimensions: true, containsCampaignIds: false, containsUserIds: false, containsCredentials: false, containsPrivateContent: false });
  });

  it("is a no-op when the exporter is explicitly disabled", () => {
    const metrics = new OperationsObservability({ enabled: false });
    metrics.recordHttp("POST", 500, 10);
    metrics.recordStaleWriteConflict();
    metrics.recordRealtime("connected");
    metrics.recordRealtimeHeartbeat(15_000);
    metrics.recordPersistence("failed", 10);
    metrics.recordRecovery("restore", "failed", 10);
    expect(metrics.snapshot()).toMatchObject({
      enabled: false,
      http: { requests: 0, staleWriteConflicts: 0 },
      realtime: { activeConnections: 0 },
      persistence: { attempts: 0 },
      recovery: { restore: { attempts: 0 } },
    });
  });

  it("defaults on and honors explicit disabled values", () => {
    expect(operationsMetricsEnabled({})).toBe(true);
    expect(operationsMetricsEnabled({ OTTE_OPERATIONS_METRICS: "off" })).toBe(false);
    expect(operationsMetricsEnabled({ OTTE_OPERATIONS_METRICS: "true" })).toBe(true);
  });
});
