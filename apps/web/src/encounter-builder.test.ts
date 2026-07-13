import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { encounterPartyEligibility } from "./encounter-builder.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const combatPanelSource = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8");
const builderPath = resolve(__dirname, "encounter-builder.tsx");
const builderSource = existsSync(builderPath) ? readFileSync(builderPath, "utf8") : "";
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

function actor(input: Pick<Actor, "id" | "name"> & Partial<Actor>): Actor {
  const { id, name, ...rest } = input;
  return {
    id,
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    type: "character",
    name,
    data: {},
    permissions: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...rest
  };
}

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

  it("only includes character actors from the encounter campaign and rules system", () => {
    const eligible = actor({ id: "act_dnd", name: "D&D Hero" });
    const otherSystem = actor({ id: "act_generic", name: "Valen", systemId: "generic-fantasy" });
    const nonCharacter = actor({ id: "act_ally", name: "Helpful NPC", type: "npc" });
    const otherCampaign = actor({ id: "act_elsewhere", name: "Visiting Hero", campaignId: "camp_other" });

    expect(encounterPartyEligibility([eligible, otherSystem, nonCharacter, otherCampaign], "camp_demo", "dnd-5e-srd")).toEqual({
      eligibleActors: [eligible],
      excludedActors: [otherSystem, nonCharacter, otherCampaign]
    });
  });

  it("explains why actors from another rules system are omitted", () => {
    expect(builderSource).toContain("not included. Encounter math only uses character actors created for");
    expect(builderSource).toContain("Difficulty preview uses the system baseline until you create or import a compatible character.");
    expect(stylesSource).toContain(".encounter-party .encounter-party-exclusion");
  });
});
