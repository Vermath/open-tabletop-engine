import { describe, expect, it } from "vitest";
import { sceneTabWrapClass } from "./scene-tabs";

describe("sceneTabWrapClass", () => {
  it("does not reserve checkbox layout space when scene selection is unavailable", () => {
    expect(sceneTabWrapClass(false, false)).toBe("scene-tab-wrap");
  });

  it("marks selectable and selected scene tabs explicitly", () => {
    expect(sceneTabWrapClass(true, true)).toBe("scene-tab-wrap selectable selected");
  });
});
