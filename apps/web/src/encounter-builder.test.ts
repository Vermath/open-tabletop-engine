import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { ENCOUNTER_CATALOG_WINDOW_SIZE, encounterCatalogWindow, encounterMonsterPlacementDrafts, encounterPartyEligibility, encounterSearchAnchorId } from "./encounter-builder.js";

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
  it("provides a stable exact-record focus target", () => {
    expect(encounterSearchAnchorId("enc/one")).toBe("campaign-search-encounter-enc%2Fone");
  });
  it("loads threats and debounces encounter planning through the existing system routes", () => {
    expect(builderSource).toContain("function EncounterBuilderDialog");
    expect(builderSource).toContain("encounter-threats");
    expect(builderSource).toContain("encounter-plan");
    expect(builderSource).toContain("window.setTimeout");
    expect(builderSource).toContain("partyActorIds");
  });

  it("lets GMs compose, save, and place the encounter through one batch contract", () => {
    expect(builderSource).toContain("Save encounter");
    expect(builderSource).toContain("Place monsters on scene");
    expect(builderSource).toContain("createEncounter: true");
    expect(appSource).toContain("applyEncounterToSnapshot");
    expect(appSource).toContain("spawnEncounterThreatTokens");
    expect(appSource).toContain("encounter-monster-placements");
  });

  it("builds deterministic actor names and token geometry for the whole batch", () => {
    const scene: Scene = {
      id: "scn_demo",
      campaignId: "camp_demo",
      name: "Demo",
      width: 1000,
      height: 800,
      gridType: "square",
      gridSize: 50,
      active: true,
      sortOrder: 0,
      fog: [],
      walls: [],
      lights: [],
      annotations: [],
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(encounterMonsterPlacementDrafts([
      { id: "goblin", name: "Goblin", count: 2 },
      { id: "ogre", name: "Ogre", count: 1 },
    ], scene)).toEqual([
      { threatId: "goblin", name: "Goblin 1", x: 450, y: 375, width: 50, height: 50, layer: "player", disposition: "hostile" },
      { threatId: "goblin", name: "Goblin 2", x: 500, y: 425, width: 50, height: 50, layer: "player", disposition: "hostile" },
      { threatId: "ogre", name: "Ogre", x: 550, y: 375, width: 50, height: 50, layer: "player", disposition: "hostile" },
    ]);
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

  it("keeps large party rosters operable above the encounter footer", () => {
    expect(builderSource).toContain(">Select all</button>");
    expect(builderSource).toContain(">Clear party</button>");
    expect(builderSource).toContain("setPartyActorIds(new Set())");
    expect(builderSource).toContain('className="encounter-party-roster"');
    expect(stylesSource).toContain(".encounter-party-roster");
    expect(stylesSource).toContain("scroll-padding-bottom: 4.5rem");
  });

  it("keeps mounted threat rows bounded for a full-size catalog", () => {
    const fullCatalog = Array.from({ length: 10_000 }, (_, index) => `threat-${index}`);
    const first = encounterCatalogWindow(fullCatalog, 0);
    const middle = encounterCatalogWindow(fullCatalog, 127);
    const last = encounterCatalogWindow(fullCatalog, Number.MAX_SAFE_INTEGER);

    expect(first.items).toHaveLength(ENCOUNTER_CATALOG_WINDOW_SIZE);
    expect(middle.items).toHaveLength(ENCOUNTER_CATALOG_WINDOW_SIZE);
    expect(last.items.length).toBeLessThanOrEqual(ENCOUNTER_CATALOG_WINDOW_SIZE);
    expect(last.end).toBe(fullCatalog.length);
    expect(builderSource).toContain("renderedThreats.map");
    expect(builderSource).toContain("data-catalog-window-size={ENCOUNTER_CATALOG_WINDOW_SIZE}");
  });
});
