import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const budget = {"literalColors": 949, "fontSizes": 43, "motionDurations": 24};

describe("design token budget", () => {
  it("keeps web styles within the recorded colour, type and motion limits", () => {
    const source = new URL("./", import.meta.url);
    const css = readdirSync(source).filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(new URL(file, source), "utf8")).join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const colors = css.match(/(?<![\w-])(?:#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\))/g) ?? [];
    const fontSizes = new Set([...css.matchAll(/\bfont-size\s*:\s*([^;}]+)/g)].map((match) => match[1]!.trim()));
    const motionValues = [...css.matchAll(/(?:^|[;{])\s*(?:transition(?:-duration)?|animation(?:-duration)?)\s*:\s*([^;}]+)/gm)]
      .map((match) => match[1]).join("\n");
    const durations = new Set(motionValues.match(/(?<![\w.-])\d*\.?\d+m?s\b/g) ?? []);
    expect(colors.length).toBeLessThanOrEqual(budget.literalColors);
    expect(fontSizes.size).toBeLessThanOrEqual(budget.fontSizes);
    expect(durations.size).toBeLessThanOrEqual(budget.motionDurations);
  });
});
