import { describe, expect, it } from "vitest";

import {
  normalizeOperatorDeliveryId,
  normalizeOperatorTargetSetHash,
  operatorTargetSetHash,
  operatorTargetSetMatches,
} from "./operator-mutation.js";

describe("operator mutation identities", () => {
  it("canonicalizes object keys while preserving meaningful target order", () => {
    const left = operatorTargetSetHash([
      { id: "two", updatedAt: "2026-07-13T00:00:02.000Z" },
      { id: "one", updatedAt: "2026-07-13T00:00:01.000Z" },
    ]);
    const same = operatorTargetSetHash([
      { updatedAt: "2026-07-13T00:00:02.000Z", id: "two" },
      { updatedAt: "2026-07-13T00:00:01.000Z", id: "one" },
    ]);
    const reordered = operatorTargetSetHash([
      { id: "one", updatedAt: "2026-07-13T00:00:01.000Z" },
      { id: "two", updatedAt: "2026-07-13T00:00:02.000Z" },
    ]);

    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(same).toBe(left);
    expect(reordered).not.toBe(left);
    expect(operatorTargetSetMatches(left, [
      { updatedAt: "2026-07-13T00:00:02.000Z", id: "two" },
      { id: "one", updatedAt: "2026-07-13T00:00:01.000Z" },
    ])).toBe(true);
  });

  it("rejects malformed target hashes and unsafe external delivery ids", () => {
    const hash = operatorTargetSetHash([]);
    expect(normalizeOperatorTargetSetHash(hash.toUpperCase())).toBe(hash);
    expect(normalizeOperatorTargetSetHash("sha256:short")).toBeUndefined();
    expect(normalizeOperatorDeliveryId(" job-alert:2026-07-13:01 ")).toBe("job-alert:2026-07-13:01");
    expect(normalizeOperatorDeliveryId("contains whitespace")).toBeUndefined();
    expect(normalizeOperatorDeliveryId("x".repeat(161))).toBeUndefined();
  });
});
