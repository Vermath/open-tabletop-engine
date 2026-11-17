import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");
const canvasSource = readFileSync(resolve(__dirname, "scene-canvas.tsx"), "utf8");
const boardTokenSource = readFileSync(resolve(__dirname, "board-token.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("token transform controls", () => {
  it("edits rotation and elevation from the token inspector", () => {
    expect(actorPanelSource).toContain('aria-label="Token rotation"');
    expect(actorPanelSource).toContain("props.updateToken({ rotation: Number(event.currentTarget.value) })");
    expect(actorPanelSource).toContain('aria-label="Token elevation"');
    expect(actorPanelSource).toContain("props.updateToken({ elevation: Number(event.currentTarget.value) })");
  });

  it("rotates only the token artwork and renders non-zero elevation", () => {
    expect(boardTokenSource).toContain('className="token-visual" style={{ transform: `rotate(${props.rotation}deg)` }}');
    expect(canvasSource).toContain("rotation={token.rotation}");
    expect(boardTokenSource).toContain('className="token-elevation"');
    expect(canvasSource).toContain("elevation={token.elevation ?? 0}");
    expect(stylesSource).toContain(".token-visual {");
    expect(stylesSource).toContain(".token-elevation {");
  });
});
