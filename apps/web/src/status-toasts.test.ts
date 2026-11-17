import { describe, expect, it } from "vitest";
import { describeError, statusToastTone, withToast, type Toast } from "./status-toasts.js";

describe("statusToastTone", () => {
  it("stays quiet for empty, routine and connection status lines", () => {
    for (const status of ["", "   ", "Ready", "Loading campaign", "Synced", "Connected", "Rolled 1d20", "Realtime reconnecting", "API offline at http://127.0.0.1:4000"]) {
      expect(statusToastTone(status)).toBeUndefined();
    }
  });

  it("marks failures as errors and everything else as information", () => {
    expect(statusToastTone("Scene save failed")).toBe("error");
    expect(statusToastTone("Permission denied")).toBe("error");
    expect(statusToastTone("Invite link copied")).toBe("info");
  });

  it("recognises refusals that do not use the word error", () => {
    for (const status of ["Token movement requires token.move", "Proposal revert requires a persisted campaign", "Passwords do not match", "Undo blocked: revision changed", "Goblin Ambush is no longer available. Campaign search has refreshed."]) {
      expect(statusToastTone(status)).toBe("error");
    }
  });
});

describe("withToast", () => {
  const toast = (id: number, text: string, tone: Toast["tone"] = "info"): Toast => ({ id, text, tone });

  it("keeps at most three toasts, dropping the oldest", () => {
    const stack = [toast(1, "a"), toast(2, "b"), toast(3, "c")];
    expect(withToast(stack, toast(4, "d")).map((item) => item.id)).toEqual([2, 3, 4]);
  });

  it("replaces a visible toast with the same text and tone instead of stacking it", () => {
    const stack = [toast(1, "Save failed", "error"), toast(2, "b")];
    expect(withToast(stack, toast(3, "Save failed", "error")).map((item) => item.id)).toEqual([2, 3]);
    expect(withToast(stack, toast(3, "Save failed", "info")).map((item) => item.id)).toEqual([1, 2, 3]);
  });
});

describe("toast actions", () => {
  it("keeps the follow-up action with its toast", () => {
    const run = () => undefined;
    const stack = withToast([], { id: 1, text: "Valen Ash action posted; damage applied", tone: "info", action: { label: "Undo", run } });
    expect(stack[0]?.action).toEqual({ label: "Undo", run });
  });
});

describe("describeError", () => {
  it("uses the message of an Error and the string form of anything else", () => {
    expect(describeError(new Error("Scene not found"))).toBe("Scene not found");
    expect(describeError("plain")).toBe("plain");
  });
});
