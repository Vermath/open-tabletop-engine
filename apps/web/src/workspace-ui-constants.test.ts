import { describe, expect, it } from "vitest";

import { isInspectorTabAllowed, keyboardShortcutRows, workspaceInspectorTabs } from "./workspace-ui-constants.js";

describe("workspace inspector tab availability", () => {
  it("keeps the public Compendium surface reachable in every tabletop mode that renders it", () => {
    for (const mode of ["live", "prep", "manage"] as const) {
      expect(workspaceInspectorTabs[mode]).toContain("compendium");
      expect(isInspectorTabAllowed(mode, "compendium")).toBe(true);
    }
  });

  it("continues to reject tabs that are not rendered in a mode", () => {
    expect(isInspectorTabAllowed("live", "content")).toBe(false);
    expect(isInspectorTabAllowed("prep", "combat")).toBe(false);
    expect(isInspectorTabAllowed("manage", "sessions")).toBe(false);
  });

  it("documents the keyboard-complete board gesture model", () => {
    expect(keyboardShortcutRows).toContainEqual({ keys: "Arrow keys", label: "Move a focused token or position the active board tool" });
    expect(keyboardShortcutRows).toContainEqual({ keys: "Enter / Space", label: "Start or finish a keyboard board gesture" });
  });
});
