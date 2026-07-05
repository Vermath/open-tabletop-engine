import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const journalPanelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("first-session onboarding", () => {
  it("opts the setup wizard into API starter content by default", () => {
    expect(appSource).toContain("setupStarterContent");
    expect(appSource).toContain('aria-label="Include starter content"');
    expect(appSource).toContain("starterContent: setupStarterContent");
    expect(appSource).toContain('scene.name === "First Session"');
  });

  it("keeps setup wizard scene and handout controls on the bare campaign path", () => {
    expect(appSource).toContain("if (!setupStarterContent)");
    expect(appSource).toContain("Setup initial scene name");
    expect(appSource).toContain("Setup onboarding title");
  });

  it("makes empty states actionable without new flows", () => {
    expect(appSource).toContain("Create a scene to open the tabletop.");
    expect(appSource).toContain('aria-label="Create scene from empty board"');
    expect(appSource).toContain("createScene().catch");
    expect(appSource).toContain("No party actors yet.");
    expect(appSource).toContain('aria-label="Open character creator from party rail"');
    expect(journalPanelSource).toContain("Recap is ready after play.");
    expect(stylesSource).toContain("First-session onboarding empty-state CTAs");
  });
});