import { describe, expect, it } from "vitest";
import { TestFixtureRegistry } from "./test-fixture-lifecycle.js";
import {
  activeResourceSnapshot,
  addedActiveResources,
  createTestTimeoutDiagnostic,
  failureLooksTimedOut,
  formatTestTimeoutDiagnostic,
  parseTestTimeoutDiagnostics
} from "./test-resource-diagnostics.js";

describe("aggregate API test lifecycle diagnostics", () => {
  it("counts and diffs active resources deterministically", () => {
    const baseline = activeResourceSnapshot(["PipeWrap", "Timeout", "PipeWrap"]);
    const current = activeResourceSnapshot(["Timeout", "TCPSocketWrap", "PipeWrap", "Timeout"]);
    expect(baseline).toEqual({ PipeWrap: 2, Timeout: 1 });
    expect(current).toEqual({ PipeWrap: 1, TCPSocketWrap: 1, Timeout: 2 });
    expect(addedActiveResources(baseline, current)).toEqual({ TCPSocketWrap: 1, Timeout: 1 });
  });

  it("round-trips a parseable timeout record even when console output has ANSI prefixes", () => {
    const diagnostic = createTestTimeoutDiagnostic({
      file: "D:\\repo\\apps\\api\\src\\slow.test.ts",
      test: "retains useful state",
      startedAtMs: 1_000,
      nowMs: 6_050,
      timeoutMs: 5_000,
      signalAborted: true,
      baseline: { PipeWrap: 1 },
      current: { PipeWrap: 2, Timeout: 1 }
    });
    const output = `\u001b[31mstderr\u001b[0m | ${formatTestTimeoutDiagnostic(diagnostic)}\n`;
    expect(parseTestTimeoutDiagnostics(output)).toEqual({
      diagnostics: [{
        ...diagnostic,
        file: "D:/repo/apps/api/src/slow.test.ts",
        addedResources: { PipeWrap: 1, Timeout: 1 }
      }],
      parseErrors: []
    });
  });

  it("recognizes timeout error shapes without treating ordinary assertion failures as timeouts", () => {
    expect(failureLooksTimedOut([{ message: "Test timed out in 5000ms." }])).toBe(true);
    expect(failureLooksTimedOut([new Error("expected 1 to be 2")])).toBe(false);
  });

  it("closes every registered fixture within a bound and reports failures without retaining state", async () => {
    const registry = new TestFixtureRegistry<{ close(): Promise<void> }>();
    const closed: string[] = [];
    registry.track({ close: async () => { closed.push("healthy"); } }, "healthy");
    registry.track({ close: async () => { throw new Error("close failed"); } }, "broken");
    const result = await registry.closeAll(100);
    expect(closed).toEqual(["healthy"]);
    expect(result).toEqual({
      closed: ["healthy"],
      failures: [{ label: "broken", message: "close failed" }]
    });
    expect(registry.pendingLabels()).toEqual([]);
  });
});
