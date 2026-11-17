import { describe, expect, it } from "vitest";
import { removeRealtimeRecord, upsertBoundedRealtimeRecord, upsertNewestPrependedRealtimeRecord, upsertNewestRealtimeRecord, upsertNewestRealtimeRecords, upsertRealtimeRecord } from "./realtime-snapshot-delta";

describe("realtime snapshot deltas", () => {
  it("upserts records without duplicating an existing id", () => {
    expect(upsertRealtimeRecord([{ id: "one", value: 1 }], { id: "one", value: 2 })).toEqual([{ id: "one", value: 2 }]);
    expect(upsertRealtimeRecord([{ id: "one", value: 1 }], { id: "two", value: 2 })).toEqual([
      { id: "one", value: 1 },
      { id: "two", value: 2 }
    ]);
  });

  it("keeps realtime history bounded after appends", () => {
    expect(upsertBoundedRealtimeRecord([{ id: "one" }, { id: "two" }], { id: "three" }, 2)).toEqual([{ id: "two" }, { id: "three" }]);
  });

  it("removes records by stable id", () => {
    expect(removeRealtimeRecord([{ id: "one" }, { id: "two" }], "one")).toEqual([{ id: "two" }]);
  });

  it("keeps the newest revision when HTTP and realtime results arrive out of order", () => {
    const newest = { id: "actor-one", updatedAt: "2026-07-17T12:00:02.000Z", hp: 7 };
    const staleEvent = { id: "actor-one", updatedAt: "2026-07-17T12:00:01.000Z", hp: 12 };
    const records = [newest];
    expect(upsertNewestRealtimeRecord(records, staleEvent)).toBe(records);
    const newerEvent = { id: "actor-one", updatedAt: "2026-07-17T12:00:03.000Z", hp: 5 };
    expect(upsertNewestRealtimeRecord([newest], newerEvent)).toEqual([newerEvent]);
  });

  it("preserves the array for an HTTP result and its separately parsed socket echo", () => {
    const moved = { id: "token-a", updatedAt: "2026-07-17T12:00:02.000Z", x: 12, metadata: { color: "green" } };
    const records = [moved];
    expect(upsertNewestRealtimeRecords(records, [{ ...moved, metadata: { ...moved.metadata } }])).toBe(records);
  });

  it("applies only changed batch records and keeps their order", () => {
    const first = { id: "first", updatedAt: "2026-07-17T12:00:02.000Z", x: 12 };
    const second = { id: "second", updatedAt: "2026-07-17T12:00:02.000Z", x: 24 };
    const changedProjection = { ...first, x: 13 };
    const stale = { ...second, updatedAt: "2026-07-17T12:00:01.000Z", x: 20 };
    const added = { ...second, id: "third" };
    const merged = upsertNewestRealtimeRecords([first, second], [added, stale, changedProjection]);
    expect(merged).toEqual([changedProjection, second, added]);
    expect(merged[1]).toBe(second);
  });

  it("prepends a new journal-style record and preserves ordering when replacing it", () => {
    const first = { id: "one", updatedAt: "2026-07-17T12:00:00.000Z" };
    const second = { id: "two", updatedAt: "2026-07-17T12:00:01.000Z" };
    expect(upsertNewestPrependedRealtimeRecord([first], second)).toEqual([second, first]);
    const updatedFirst = { ...first, updatedAt: "2026-07-17T12:00:02.000Z" };
    expect(upsertNewestPrependedRealtimeRecord([second, first], updatedFirst)).toEqual([second, updatedFirst]);
  });
});
