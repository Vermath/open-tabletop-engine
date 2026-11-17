import { describe, expect, it } from "vitest";
import { safeLightCssColor } from "./light-color.js";

describe("safeLightCssColor", () => {
  it.each(["#facc15", "#FFF", "#ffcc0080", "rgb(250, 204, 21)", "rgba(250 204 21 / 0.5)", "hsl(48deg 96% 53%)"])("keeps the plain colour %s", (color) => {
    expect(safeLightCssColor(color)).toBe(color);
  });

  it.each([
    "red 0%, red 1%), url(https://tracker.example/pixel.png",
    "url(https://tracker.example/pixel.png)",
    "#facc15; background-image: url(https://tracker.example/x)",
    "var(--secret)",
    "expression(alert(1))",
    "",
    undefined,
  ])("replaces the unsafe value %s with the default light colour", (color) => {
    expect(safeLightCssColor(color)).toBe("#facc15");
  });

  it("falls back to the darkness colour for darkness sources", () => {
    expect(safeLightCssColor("url(x)", "darkness")).toBe("#111827");
  });
});
