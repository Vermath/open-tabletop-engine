import { describe, expect, it } from "vitest";
import { beginSessionSwitch, sessionSwitchIsCurrent } from "./session-switch-guard.js";

describe("session switch sequencing", () => {
  it("invalidates a pending switch when the user returns to the current session", () => {
    const sequence = { current: 0 };
    const pendingRequestId = beginSessionSwitch(sequence, "user-a", "user-b");
    expect(pendingRequestId).toBe(1);
    expect(sessionSwitchIsCurrent(sequence, pendingRequestId!)).toBe(true);

    expect(beginSessionSwitch(sequence, "user-a", "user-a")).toBeUndefined();
    expect(sessionSwitchIsCurrent(sequence, pendingRequestId!)).toBe(false);
  });
});
