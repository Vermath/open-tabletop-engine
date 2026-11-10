import { describe, expect, it } from "vitest";
import { statusToastTone } from "./status-toasts.js";

describe("statusToastTone", () => {
  it("stays quiet for empty, routine and connection status lines", () => {
    for (const status of ["", "   ", "Ready", "Loading campaign", "Synced", "Connected", "Rolled 1d20", "Realtime reconnecting", "API offline at http://127.0.0.1:4000"]) {
      expect(statusToastTone(status)).toBeUndefined();
    }
  });

  it("marks failures as errors and everything else as information", () => {
    expect(statusToastTone("Token movement requires token.move")).toBe("info");
    expect(statusToastTone("Scene save failed")).toBe("error");
    expect(statusToastTone("Permission denied")).toBe("error");
    expect(statusToastTone("Token updated")).toBe("info");
  });
});
