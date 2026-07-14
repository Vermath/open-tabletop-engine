import { describe, expect, it } from "vitest";
import { removeRealtimeRecord, upsertBoundedRealtimeRecord, upsertRealtimeRecord } from "./realtime-snapshot-delta";

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
});
