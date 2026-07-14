import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadSmallGroupCapacityEnvelope,
  runSmallGroupCapacityGate,
} from "./small-group-capacity.js";

describe("small-group capacity gate", () => {
  it("runs bounded mixed HTTP and reconnecting WebSocket traffic through SQLite and TCP", async () => {
    const result = await runSmallGroupCapacityGate();

    expect(result.passed, JSON.stringify(result.checks)).toBe(true);
    expect(result.transport).toEqual({
      rest: "tcp-http",
      realtime: "tcp-websocket",
      bindHost: "127.0.0.1",
    });
    expect(result.envelope.topology).toEqual({
      apiNodes: 1,
      apiWriters: 1,
      stateStore: "sqlite",
      activeCampaigns: 1,
    });
    expect(result.measurements.samples).toEqual({
      initialConnections: result.envelope.group.realtimeConnections,
      reads:
        result.envelope.workload.cycles *
        result.envelope.workload.parallelReadsPerCycle,
      mutations:
        result.envelope.workload.cycles *
        result.envelope.workload.sequentialMutationsPerCycle,
      eventFanouts:
        result.envelope.workload.cycles *
        result.envelope.workload.sequentialMutationsPerCycle,
      reconnects:
        result.envelope.workload.cycles *
        result.envelope.workload.reconnectsPerCycle,
    });
    expect(result.measurements.sqliteBytes).toBeGreaterThan(0);
    expect(result.verification.persistedAfterReopen).toBe(true);
    expect(result.caveat).toContain("not a production load observation");
  }, 60_000);

  it("keeps the machine-readable envelope and result schema usable by release tooling", () => {
    const envelope = loadSmallGroupCapacityEnvelope();
    const schema = JSON.parse(
      readFileSync(
        new URL(
          "../../../docs/verification/small-group-capacity-result.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      $id?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };

    expect(envelope.claimBoundary).toContain("not production");
    expect(schema.$id).toBe(
      "https://open-tabletop-engine.local/schemas/small-group-capacity-result-v1",
    );
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "envelope",
        "transport",
        "measurements",
        "verification",
        "checks",
        "passed",
      ]),
    );
    expect(schema.properties).toHaveProperty("measurements");
  });
});
