import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Encounter, Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { filterCampaignMemory, memoryFactStatus, type CampaignMemoryFact } from "./campaign-memory-panel.js";
import { filterHandoutLibrary, parseHandoutTags, type HandoutLibraryItem } from "./handout-library-panel.js";
import { actorHitDicePools, nextShortRestPool } from "./hit-dice-rest-card.js";
import { campaignSessionSort } from "./session-desk-panel.js";
import type { CampaignSessionInfo } from "./api.js";
import { canonicalSceneIdForWorldFilter, sceneWorldId, selectedSceneForWorldFilter, worldFilterMatchesScene } from "./world-atlas-panel.js";
import { encounterThreatCounts, encounterThreatFingerprint, savedEncountersForSystem } from "./encounter-builder.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const chatSource = readFileSync(resolve(__dirname, "chat-rail.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("world atlas surface", () => {
  it("filters scenes by persisted world assignment and preserves an unfiled view", () => {
    const scene = { id: "scene-1", worldId: "world-1" } as Scene & { worldId?: string };
    const unfiled = { id: "scene-2" } as Scene;
    expect(sceneWorldId(scene)).toBe("world-1");
    expect(worldFilterMatchesScene(scene, "world-1")).toBe(true);
    expect(worldFilterMatchesScene(scene, "unfiled")).toBe(false);
    expect(worldFilterMatchesScene(unfiled, "unfiled")).toBe(true);
  });

  it("does not retain a scene from another world when the selected world is empty", () => {
    const first = { id: "scene-1", worldId: "world-1", active: true } as Scene & { worldId?: string };
    const second = { id: "scene-2", worldId: "world-2", active: false } as Scene & { worldId?: string };
    expect(selectedSceneForWorldFilter([first, second], first.id, "world-2")?.id).toBe(second.id);
    expect(canonicalSceneIdForWorldFilter([first, second], first.id, "world-2")).toBe(second.id);
    expect(selectedSceneForWorldFilter([first, second], first.id, "world-empty")).toBeUndefined();
    expect(canonicalSceneIdForWorldFilter([first, second], first.id, "world-empty")).toBe("");
    expect(appSource).toContain("canonicalPrepSceneId === sceneId");
  });

  it("wires first-class lore tabs and filters prep scenes only", () => {
    expect(appSource).toContain('"sessions", "worlds", "handouts", "journal", "memory"');
    expect(appSource).toContain('workspaceMode !== "prep" || worldFilterMatchesScene');
    expect(appSource).toContain("<WorldAtlasPanel");
    expect(appSource).toContain("<HandoutLibraryPanel");
    expect(appSource).toContain("<CampaignMemoryPanel");
  });
});

describe("handout library surface", () => {
  const base: HandoutLibraryItem = {
    id: "handout-1",
    campaignId: "campaign-1",
    title: "Vault warning",
    body: "Do not wake the guardian.",
    visibility: "public",
    visibleToUserIds: [],
    visibleToActorIds: [],
    assetIds: [],
    tags: ["vault", "warning"],
    readByUserIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  it("deduplicates tags and combines text, world, and read filters", () => {
    expect(parseHandoutTags("vault, clue, vault")).toEqual(["vault", "clue"]);
    const inWorld = { ...base, worldId: "world-1" };
    expect(filterHandoutLibrary([inWorld], { query: "guardian", worldId: "world-1", read: "unread", userId: "user-1" })).toEqual([inWorld]);
    expect(filterHandoutLibrary([inWorld], { query: "", worldId: "unfiled", read: "all", userId: "user-1" })).toEqual([]);
  });
});

describe("campaign memory surface", () => {
  const facts = [
    { id: "candidate", campaignId: "campaign-1", text: "The bridge is trapped", status: "candidate", type: "location_profile", subject: "Old Bridge", visibility: "gm_only", sourceIds: [], updatedAt: "2026-01-02", createdAt: "2026-01-02" },
    { id: "canon", campaignId: "campaign-1", text: "Mira leads the guild", status: "approved", type: "npc_profile", subject: "Mira", visibility: "public", sourceIds: [], updatedAt: "2026-01-03", createdAt: "2026-01-03" },
    { id: "retconned", campaignId: "campaign-1", text: "Mira left the guild", status: "retconned", type: "retconned_fact", subject: "Mira", visibility: "public", sourceIds: ["journal-1"], updatedAt: "2026-01-04", createdAt: "2026-01-04" }
  ] as CampaignMemoryFact[];

  it("keeps candidates in review and approved facts in canon search", () => {
    expect(memoryFactStatus(facts[0]!)).toBe("candidate");
    expect(filterCampaignMemory(facts, { view: "canon", query: "Mira", type: "", subject: "", status: "", visibility: "" }).map((fact) => fact.id)).toEqual(["canon"]);
    expect(filterCampaignMemory(facts, { view: "review", query: "", type: "location_profile", subject: "bridge", status: "candidate", visibility: "gm_only" }).map((fact) => fact.id)).toEqual(["candidate"]);
    expect(filterCampaignMemory(facts, { view: "review", query: "", type: "", subject: "", status: "retconned", visibility: "" }).map((fact) => fact.id)).toEqual(["retconned"]);
  });
});

describe("campaign session desk", () => {
  it("keeps the live session above planned and completed history", () => {
    const sessions = [
      { id: "done", status: "completed", number: 1 },
      { id: "plan", status: "planned", number: 3 },
      { id: "live", status: "live", number: 2 }
    ] as CampaignSessionInfo[];
    expect(campaignSessionSort(sessions).map((session) => session.id)).toEqual(["live", "plan", "done"]);
    expect(appSource).toContain("<SessionDeskPanel");
    expect(appSource).toContain("<LiveSessionBanner");
  });
});

describe("saved encounter builder lifecycle", () => {
  it("reopens only the active system plus honest legacy saves", () => {
    const encounters = [
      { id: "current", systemId: "generic-fantasy", updatedAt: "2026-01-03", threats: [{ id: "guard", count: 2 }] },
      { id: "other", systemId: "mystic-noir", updatedAt: "2026-01-04", threats: [{ id: "shade", count: 1 }] },
      { id: "legacy", updatedAt: "2026-01-02" }
    ] as Encounter[];
    expect(savedEncountersForSystem(encounters, "generic-fantasy").map((encounter) => encounter.id)).toEqual(["current", "legacy"]);
    expect(encounterThreatCounts({ threats: [{ id: "guard", count: 2 }] })).toEqual({ guard: 2 });
    expect(encounterThreatFingerprint([{ id: "guard", count: 2 }, { id: "mage", count: 1 }])).toBe("guard:2|mage:1");
  });

  it("uses authoritative snapshot callbacks and a permission-gated two-step delete", () => {
    const builderSource = readFileSync(resolve(__dirname, "encounter-builder.tsx"), "utf8");
    expect(appSource).toContain("savedEncounters={snapshot.encounters}");
    expect(appSource).toContain("onEncounterDeleted={removeEncounterFromSnapshot}");
    expect(appSource.match(/encounter\.campaignId !== realtimeSelectionRef\.current\.campaignId/g)).toHaveLength(2);
    expect(appSource).toContain("realtimeSelectionRef.current.campaignId === selectedCampaign.id");
    expect(builderSource).toContain("deleteConfirmationId !== savedEncounter.id");
    expect(builderSource).toContain("savedEncounter && props.canSave");
    expect(builderSource).toContain("Update encounter");
  });
});

describe("player recovery and chat completion", () => {
  it("surfaces multiclass hit-dice pools and spends the largest available die first", () => {
    const actor = { data: { hitDicePools: [{ className: "Wizard", size: "d6", current: 2, max: 2 }, { className: "Fighter", size: "d10", current: 4, max: 5 }] } } as unknown as Actor;
    const pools = actorHitDicePools(actor);
    expect(pools).toHaveLength(2);
    expect(nextShortRestPool(pools)?.className).toBe("Fighter");
    expect(appSource).toContain("<HitDiceRestCard");
  });

  it("exposes inline edit-own-message controls and supported dice presets accessibly", () => {
    expect(chatSource).toContain("onEditMessage");
    expect(chatSource).toContain('aria-label="Edit chat message"');
    expect(chatSource).toContain("diceQuickPresets.map");
    expect(chatSource).toContain("Reduce dice modifier by 1");
    expect(stylesSource).toContain("@media (max-width: 640px)");
    expect(stylesSource).toContain(".lore-panel button:focus-visible");
  });
});

describe("portable scoped exports", () => {
  it("offers world and selected-collection exports with required scope parameters", () => {
    expect(appSource).toContain('<option value="world">One world</option>');
    expect(appSource).toContain('<option value="selected_collections">Selected record collections</option>');
    expect(appSource).toContain('params.set("scopeId", archiveExportWorldId)');
    expect(appSource).toContain('params.set("collections", archiveExportCollections.join(","))');
    expect(appSource).toContain('aria-label="Archive export collection selection"');
    expect(stylesSource).toContain(".archive-export-collections");
  });
});
