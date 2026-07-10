import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Actor, Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { filterCampaignMemory, memoryFactStatus, type CampaignMemoryFact } from "./campaign-memory-panel.js";
import { filterHandoutLibrary, parseHandoutTags, type HandoutLibraryItem } from "./handout-library-panel.js";
import { actorHitDicePools, nextShortRestPool } from "./hit-dice-rest-card.js";
import { campaignSessionSort } from "./session-desk-panel.js";
import type { CampaignSessionInfo } from "./api.js";
import { sceneWorldId, worldFilterMatchesScene } from "./world-atlas-panel.js";

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
    { id: "canon", campaignId: "campaign-1", text: "Mira leads the guild", status: "approved", type: "npc_profile", subject: "Mira", visibility: "public", sourceIds: [], updatedAt: "2026-01-03", createdAt: "2026-01-03" }
  ] as CampaignMemoryFact[];

  it("keeps candidates in review and approved facts in canon search", () => {
    expect(memoryFactStatus(facts[0]!)).toBe("candidate");
    expect(filterCampaignMemory(facts, { view: "canon", query: "Mira", type: "", subject: "", status: "", visibility: "" }).map((fact) => fact.id)).toEqual(["canon"]);
    expect(filterCampaignMemory(facts, { view: "review", query: "", type: "location_profile", subject: "bridge", status: "candidate", visibility: "gm_only" }).map((fact) => fact.id)).toEqual(["candidate"]);
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
