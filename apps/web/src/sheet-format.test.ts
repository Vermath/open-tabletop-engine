import { describe, expect, it } from "vitest";
import { formatDateTime, formatNumber } from "./sheet-format.js";

describe("reusable locale formatters", () => {
  it.each([0, -0, 1, -42, 1_234_567, -1_234_567.89, 0.0001, 1.2345, Number.MAX_SAFE_INTEGER, NaN, Infinity, -Infinity, undefined])("preserves number formatting for %s", (value) => {
    const previous = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
    expect(formatNumber(value)).toBe(previous);
  });

  it.each([
    "2026-09-06T12:34:56.789Z",
    "2026-09-06T00:00:00Z",
    "2026-03-08T01:59:59-05:00",
    "2026-03-08T03:00:00-04:00",
    "2026-11-01T01:30:00-04:00",
    "2026-11-01T01:30:00-05:00",
    "1970-01-01T00:00:00Z",
    "2026-09-06",
    "2026-09-06T12:34:56",
  ])("preserves date formatting in the current locale and timezone for %s", (value) => {
    const previous = new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    expect(formatDateTime(value)).toBe(previous);
  });

  it.each(["not-a-date", "2026-99-99T99:99:99Z", "+275761-01-01T00:00:00Z"])("preserves invalid date input %s", (value) => {
    expect(formatDateTime(value)).toBe(value);
  });

  it.each(["", undefined])("preserves empty date input %s", (value) => {
    expect(formatDateTime(value)).toBe("");
  });
});
