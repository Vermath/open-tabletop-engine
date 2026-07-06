import { describe, expect, it } from "vitest";
import { sceneQuickCreateIndex, sceneTabWrapClass } from "./scene-tabs";

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
});
