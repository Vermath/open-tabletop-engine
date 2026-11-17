import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./api.js", () => ({ apiGet: vi.fn(), apiPost: api.post }));

import { clearCalculationOverride, createCalculationOverride } from "./calculation-explanation-panel.js";

describe("calculation override mutation guards", () => {
  beforeEach(() => api.post.mockReset().mockResolvedValue({}));

  it("uses the exact actor revision and a stable replay key when creating an override", async () => {
    const input = { fieldId: "armor-class", source: "house_rule" as const, effectiveValue: 18, reason: "Campaign shield rule", expectedActorUpdatedAt: "2026-07-13T00:00:00.000Z" };
    await createCalculationOverride("camp", "actor", input);
    await createCalculationOverride("camp", "actor", input);
    expect(api.post.mock.calls[0]?.[1]).toEqual(input);
    expect(api.post.mock.calls[0]?.[2]?.idempotencyKey).toBeTruthy();
    expect(api.post.mock.calls[1]?.[2]?.idempotencyKey).toBe(api.post.mock.calls[0]?.[2]?.idempotencyKey);
  });

  it("uses both ledger and actor revisions when clearing history", async () => {
    const input = { reason: "Rule retired", expectedUpdatedAt: "2026-07-13T00:00:01.000Z", expectedActorUpdatedAt: "2026-07-13T00:00:02.000Z" };
    await clearCalculationOverride("override/id", input);
    expect(api.post.mock.calls[0]?.[0]).toBe("/api/v1/calculation-overrides/override%2Fid/clear");
    expect(api.post.mock.calls[0]?.[1]).toEqual(input);
    expect(api.post.mock.calls[0]?.[2]?.idempotencyKey).toBeTruthy();
  });
});
