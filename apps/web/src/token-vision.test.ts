import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTokenSenses, parseTokenSenses, tokenBrightVisionPatch, tokenDimVisionPatch } from "./actor-sheet-data.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const sceneCanvasSource = readFileSync(resolve(__dirname, "scene-canvas.tsx"), "utf8").replace(/\r\n/g, "\n");

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
    const dimInput = actorPanelSource.match(/<input key=\{`dim-vision:[^\n]+/u)?.[0] ?? "";
    const brightInput = actorPanelSource.match(/<input key=\{`bright-vision:[^\n]+/u)?.[0] ?? "";

    expect(dimInput).toContain("defaultValue=");
    expect(dimInput).toContain("onBlur=");
    expect(dimInput).not.toContain("onChange=");
    expect(brightInput).toContain("defaultValue=");
    expect(brightInput).toContain("onBlur=");
    expect(brightInput).not.toContain("onChange=");
    expect(appSource).toContain("setStatus(`Token vision update failed: ${errorMessage(error)}`);");
    expect(actorPanelSource).toContain("props.updateTokenVision(patch).then((saved) => { if (!saved) restore(); }, restore)");
  });

  it("parses and formats the supported typed senses without accepting ambiguous input", () => {
    expect(parseTokenSenses("darkvision:60, blindsight 10")).toEqual([
      { type: "darkvision", range: 60 },
      { type: "blindsight", range: 10 }
    ]);
    expect(parseTokenSenses("")).toEqual([]);
    expect(parseTokenSenses("darkvision:60, darkvision:120")).toBeUndefined();
    expect(parseTokenSenses("telepathy:60")).toBeUndefined();
    expect(formatTokenSenses({ senses: [{ type: "truesight", range: 120 }] })).toBe("truesight:120");
  });

  it("wires portal controls, typed darkness masks, and player-vision preview affordances", () => {
    expect(appSource).toContain("onCyclePlayerVisionPreview={cyclePlayerVisionPreview}");
    expect(appSource).toContain("onTogglePortal={toggleScenePortal}");
    expect(appSource).toContain('kind: "darkness"');
    expect(sceneCanvasSource).toContain('onDoubleClick={(event) => {');
    expect(sceneCanvasSource).toContain('className="darkness-layer"');
    expect(sceneCanvasSource).toContain("Player vision: {props.visionPreviewLabel}");
    expect(sceneCanvasSource).toContain("Preview player vision");
  });
});
