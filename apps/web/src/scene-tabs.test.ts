import { describe, expect, it } from "vitest";
import { sceneDeleteConfirmationMatches, sceneQuickCreateIndex, sceneSelectionDestination, sceneTabWrapClass, showTrailingSceneCreate } from "./scene-tabs";

describe("sceneTabWrapClass", () => {
  it("does not reserve checkbox layout space when scene selection is unavailable", () => {
    expect(sceneTabWrapClass(false, false)).toBe("scene-tab-wrap");
  });

  it("marks selectable and selected scene tabs explicitly", () => {
    expect(sceneTabWrapClass(true, true)).toBe("scene-tab-wrap selectable selected");
  });

  it("marks scene tabs with inline delete affordances", () => {
    expect(sceneTabWrapClass(false, false, true)).toBe("scene-tab-wrap deletable");
    expect(sceneTabWrapClass(true, true, true)).toBe("scene-tab-wrap selectable selected deletable");
  });

  it("places the quick-create affordance immediately before the newest tab", () => {
    expect(sceneQuickCreateIndex(0)).toBe(0);
    expect(sceneQuickCreateIndex(1)).toBe(0);
    expect(sceneQuickCreateIndex(4)).toBe(3);
  });

  it("shows a trailing create affordance after the newest visible tab", () => {
    expect(showTrailingSceneCreate(0)).toBe(false);
    expect(showTrailingSceneCreate(1)).toBe(true);
    expect(showTrailingSceneCreate(4)).toBe(true);
  });

  it("confirms deletion against the persisted target name, not an unsaved draft", () => {
    expect(sceneDeleteConfirmationMatches("Vault Entry", "Renamed Draft")).toBe(false);
    expect(sceneDeleteConfirmationMatches("Vault Entry", "Vault Entry")).toBe(true);
    expect(sceneDeleteConfirmationMatches(undefined, "Vault Entry")).toBe(false);
  });

  it("keeps a scene manager in Manage > Scenes when another scene is selected", () => {
    expect(sceneSelectionDestination("manage", true)).toEqual({
      workspaceMode: "manage",
      manageCategory: "scenes",
    });
  });

  it("does not change live, prep, or AI workspace context during scene selection", () => {
    expect(sceneSelectionDestination("live", true)).toEqual({ workspaceMode: "live" });
    expect(sceneSelectionDestination("prep", true)).toEqual({ workspaceMode: "prep" });
    expect(sceneSelectionDestination("ai", true)).toEqual({ workspaceMode: "ai" });
  });

  it("returns account-only Manage users to the live table for scene selection", () => {
    expect(sceneSelectionDestination("manage", false)).toEqual({ workspaceMode: "live" });
  });
});
