import { describe, expect, it } from "vitest";
import { initialUiTheme, isUiTheme, nextUiTheme, uiThemeLabel, uiThemeStorageKey } from "./ui-theme.js";

describe("ui theme", () => {
  it("defaults to midnight when nothing is stored", () => {
    expect(initialUiTheme(() => null)).toBe("midnight");
  });

  it("restores a stored theme", () => {
    expect(initialUiTheme((key) => (key === uiThemeStorageKey ? "ember" : null))).toBe("ember");
  });

  it("ignores unknown stored values", () => {
    expect(initialUiTheme(() => "neon")).toBe("midnight");
  });

  it("falls back to midnight when storage access throws", () => {
    expect(
      initialUiTheme(() => {
        throw new Error("denied");
      })
    ).toBe("midnight");
  });

  it("cycles between midnight and ember", () => {
    expect(nextUiTheme("midnight")).toBe("ember");
    expect(nextUiTheme("ember")).toBe("midnight");
  });

  it("validates and labels themes", () => {
    expect(isUiTheme("midnight")).toBe(true);
    expect(isUiTheme("ember")).toBe(true);
    expect(isUiTheme("parchment")).toBe(false);
    expect(uiThemeLabel("midnight")).toBe("Midnight");
    expect(uiThemeLabel("ember")).toBe("Ember");
  });
});
