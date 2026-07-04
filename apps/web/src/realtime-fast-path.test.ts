import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("realtime fast path wiring", () => {
  it("wires realtime events through a ref-backed local apply handler", () => {
    expect(appSource).toContain("realtimeApplyRef");
    expect(appSource).toContain("applyRealtimeEvent: (data) => realtimeApplyRef.current(data)");
  });

  it("guards against applying redacted realtime payloads", () => {
    expect(appSource).toContain("payload.redacted !== true");
  });
});
