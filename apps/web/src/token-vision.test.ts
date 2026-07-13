import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tokenBrightVisionPatch, tokenDimVisionPatch } from "./actor-sheet-data.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("token vision editing", () => {
  it("parses valid dim radii without sending invalid or half-entered values", () => {
    expect(tokenDimVisionPatch("60")).toEqual({ visionRadius: 60, dimVisionRadius: 60 });
    expect(tokenDimVisionPatch("0")).toEqual({ visionRadius: 0, dimVisionRadius: null });
    expect(tokenDimVisionPatch("")).toEqual({ visionRadius: 0, dimVisionRadius: null });
    expect(tokenDimVisionPatch("-1")).toBeUndefined();
    expect(tokenDimVisionPatch("not-a-number")).toBeUndefined();
  });

  it("uses zero or an empty bright radius to disable bright vision", () => {
    expect(tokenBrightVisionPatch("30")).toEqual({ brightVisionRadius: 30 });
    expect(tokenBrightVisionPatch("0")).toEqual({ brightVisionRadius: null });
    expect(tokenBrightVisionPatch("")).toEqual({ brightVisionRadius: null });
    expect(tokenBrightVisionPatch("-1")).toBeUndefined();
    expect(tokenBrightVisionPatch("not-a-number")).toBeUndefined();
  });

  it("commits vision number fields once on blur instead of patching on every keystroke", () => {
    const dimInput = appSource.match(/<input key=\{`dim-vision:[^\n]+/u)?.[0] ?? "";
    const brightInput = appSource.match(/<input key=\{`bright-vision:[^\n]+/u)?.[0] ?? "";

    expect(dimInput).toContain("defaultValue=");
    expect(dimInput).toContain("onBlur=");
    expect(dimInput).not.toContain("onChange=");
    expect(brightInput).toContain("defaultValue=");
    expect(brightInput).toContain("onBlur=");
    expect(brightInput).not.toContain("onChange=");
    expect(appSource).toContain("setStatus(`Token vision update failed: ${errorMessage(error)}`);");
    expect(appSource).toContain("props.updateTokenVision(patch).then((saved) => { if (!saved) restore(); }, restore)");
  });
});
