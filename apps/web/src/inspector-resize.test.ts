import { describe, expect, it } from "vitest";
import { clampInspectorWidth, inspectorMaxWidth, inspectorMinWidth, parseStoredInspectorWidth } from "./inspector-resize.js";

describe("inspector width", () => {
  it("stays within its limits", () => {
    expect(clampInspectorWidth(100, 1600)).toBe(inspectorMinWidth);
    expect(clampInspectorWidth(5000, 1600)).toBe(inspectorMaxWidth);
    expect(clampInspectorWidth(451.6, 1600)).toBe(452);
  });

  it("never takes more than 55% of the layout, but never drops below the minimum", () => {
    expect(clampInspectorWidth(700, 1000)).toBe(550);
    expect(clampInspectorWidth(700, 400)).toBe(inspectorMinWidth);
  });

  it("ignores stored values that are missing, malformed or out of range", () => {
    expect(parseStoredInspectorWidth(null)).toBeUndefined();
    expect(parseStoredInspectorWidth("wide")).toBeUndefined();
    expect(parseStoredInspectorWidth("90")).toBeUndefined();
    expect(parseStoredInspectorWidth("9000")).toBeUndefined();
    expect(parseStoredInspectorWidth("480.4")).toBe(480);
  });
});
