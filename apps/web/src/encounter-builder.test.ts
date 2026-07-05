import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const combatPanelSource = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8");
const builderPath = resolve(__dirname, "encounter-builder.tsx");
const builderSource = existsSync(builderPath) ? readFileSync(builderPath, "utf8") : "";
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("encounter builder", () => {
  it("loads threats and debounces encounter planning through the existing system routes", () => {
    expect(builderSource).toContain("function EncounterBuilderDialog");
    expect(builderSource).toContain("encounter-threats");
    expect(builderSource).toContain("encounter-plan");
    expect(builderSource).toContain("window.setTimeout");
    expect(builderSource).toContain("partyActorIds");
  });

  it("lets GMs compose, save, and place the encounter without changing API contracts", () => {
    expect(builderSource).toContain("Save encounter");
    expect(builderSource).toContain("Place monsters on scene");
    expect(builderSource).toContain("createEncounter: true");
    expect(appSource).toContain("applyEncounterToSnapshot");
    expect(appSource).toContain("spawnEncounterThreatTokens");
  });

  it("rewires the existing planning surfaces to open the modal", () => {
    expect(appSource).toContain("setEncounterBuilderOpen(true)");
    expect(appSource).toContain("EncounterBuilderDialog");
    expect(combatPanelSource).toContain("Plan encounter");
    expect(combatPanelSource).toContain("onPlanEncounter");
    expect(stylesSource).toContain(".modal-dialog.encounter-builder");
    expect(stylesSource).toContain(".encounter-difficulty.deadly");
  });
});