import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");
const sceneCanvasSource = readFileSync(resolve(__dirname, "scene-canvas.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");
const advancementCatalogSource = readFileSync(resolve(__dirname, "advancement-catalog.ts"), "utf8");

describe("xp progression", () => {
  it("surfaces xp progress from the advancement endpoint", () => {
    expect(advancementCatalogSource).toContain("interface XpProgressInfo");
    expect(advancementCatalogSource).toContain("xp: result.xp");
    expect(advancementCatalogSource).toContain("input.actor?.updatedAt");
    expect(appSource).toContain("xp: xpProgress");
  });

  it("lets the GM award xp from the sheet and split from combat", () => {
    expect(appSource).toContain("async function awardActorXp");
    expect(appSource).toContain("function awardPartyXp");
    expect(actorPanelSource).toContain('aria-label="Award XP amount"');
  });

  it("shows a glowing level up button when a threshold is crossed", () => {
    expect(actorPanelSource).toContain("level-up-button");
    expect(actorPanelSource).toContain("advancementReady");
    expect(stylesSource).toContain("@keyframes level-up-pulse");
    expect(stylesSource).toContain(".xp-bar-fill");
  });

  it("marks bloodied and down token states", () => {
    expect(sceneCanvasSource).toContain("bloodied");
    expect(stylesSource).toContain(".token.down::after");
    expect(stylesSource).toContain(".token.bloodied");
  });
});
