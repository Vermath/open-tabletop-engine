import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seededDemoLoginErrorMessage, seededDemoUnavailableMessage } from "./blank-canvas-demo.js";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("seeded demo access", () => {
  it("recognizes the absent seeded identity response", () => {
    expect(seededDemoLoginErrorMessage(new Error('{"error":"unauthorized","message":"Invalid login credentials"}'))).toBe(seededDemoUnavailableMessage);
    expect(seededDemoLoginErrorMessage("Invalid login credentials")).toBe(seededDemoUnavailableMessage);
  });

  it("does not swallow unrelated login or connectivity failures", () => {
    expect(seededDemoLoginErrorMessage(new Error("API offline"))).toBe("API offline");
    expect(seededDemoLoginErrorMessage(new Error("Too many login attempts. Try again later."))).toBe("Too many login attempts. Try again later.");
    expect(seededDemoLoginErrorMessage(new Error("MFA code required"))).toBe("MFA code required");
  });

  it("gives the user a useful next action and removes the failed shortcut", () => {
    expect(seededDemoUnavailableMessage).toContain("Try Blank Canvas");
    expect(appSource).toContain("hidden={authStatus === seededDemoUnavailableMessage}");
    expect(appSource).toContain("setAuthStatus(seededDemoLoginErrorMessage(error))");
  });
});
