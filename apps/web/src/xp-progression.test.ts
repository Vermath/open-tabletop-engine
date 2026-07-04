import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("xp progression", () => {
  it("surfaces xp progress from the advancement endpoint", () => {
    expect(appSource).toContain("type XpProgressInfo");
    expect(appSource).toContain("setXpProgress(result.xp)");
    expect(appSource).toContain("selectedActor?.updatedAt");
  });

  it("lets the GM award xp from the sheet and split from combat", () => {
    expect(appSource).toContain("async function awardActorXp");
    expect(appSource).toContain("function awardPartyXp");
    expect(appSource).toContain('aria-label="Award XP amount"');
  });

  it("shows a glowing level up button when a threshold is crossed", () => {
    expect(appSource).toContain("level-up-button");
    expect(appSource).toContain("advancementReady");
    expect(stylesSource).toContain("@keyframes level-up-pulse");
    expect(stylesSource).toContain(".xp-bar-fill");
  });

  it("marks bloodied and down token states", () => {
    expect(appSource).toContain("bloodied");
    expect(stylesSource).toContain(".token.down::after");
    expect(stylesSource).toContain(".token.bloodied");
  });
});
