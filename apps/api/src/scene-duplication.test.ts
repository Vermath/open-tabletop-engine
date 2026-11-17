import {
  emptyState,
  seedState,
  type Actor,
  type CalculationOverride,
  type CampaignSession,
  type Combat,
  type Encounter,
  type FogPreset,
  type Item,
  type Scene,
  type SceneDuplicationRequest,
  type Token,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { prepareSceneDuplication, SceneDuplicationError } from "./scene-duplication.js";

const at = "2026-07-15T12:00:00.000Z";

function graphState() {
  const state = seedState();
  const sceneA: Scene = {
    id: "scn_duplicate_a",
    campaignId: "camp_demo",
    worldId: state.worlds[0]?.id,
    name: "Duplicate A",
    width: 1200,
    height: 800,
    gridType: "square",
    gridSize: 50,
    active: false,
    sortOrder: 20,
    fog: [{ id: "fog_duplicate_a", x: 10, y: 20, radius: 30, hidden: true }],
    walls: [{ id: "wall_duplicate_a", x1: 0, y1: 0, x2: 50, y2: 0, blocksVision: true }],
    lights: [{ id: "light_duplicate_a", x: 5, y: 5, radius: 30, color: "#fff" }],
    annotations: [],
    difficultTerrain: [],
    coverOverrides: [],
    metadata: {},
    createdAt: at,
    updatedAt: at,
  };
  const sceneB: Scene = { ...structuredClone(sceneA), id: "scn_duplicate_b", name: "Duplicate B", sortOrder: 21, fog: [], walls: [], lights: [] };
  const actor: Actor = {
    id: "act_duplicate_shared",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Shared duplicate actor",
    data: { hp: { current: 7, max: 7 } },
    permissions: {},
    createdAt: at,
    updatedAt: at,
  };
  const tokenA: Token = {
    id: "tok_duplicate_a",
    sceneId: sceneA.id,
    actorId: actor.id,
    name: "Token A",
    x: 100,
    y: 100,
    width: 1,
    height: 1,
    rotation: 0,
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 60,
    disposition: "friendly",
    metadata: {},
    createdAt: at,
    updatedAt: at,
  };
  const tokenB: Token = { ...structuredClone(tokenA), id: "tok_duplicate_b", sceneId: sceneB.id, name: "Token B" };
  sceneA.annotations = [{ id: "ann_duplicate_a", sceneId: sceneA.id, kind: "template", createdByUserId: "usr_demo_gm", color: "#f00", points: [{ x: 0, y: 0 }], affectedTokenIds: [tokenA.id], createdAt: at, updatedAt: at }];
  sceneA.coverOverrides = [{ id: "cover_duplicate_a", sceneId: sceneA.id, sourceTokenId: tokenA.id, targetTokenId: tokenA.id, level: "half", createdByUserId: "usr_demo_gm", createdAt: at, updatedAt: at }];
  const item: Item = { id: "item_duplicate_actor", campaignId: "camp_demo", systemId: actor.systemId, actorId: actor.id, type: "weapon", name: "Sword", data: { charges: 2 }, createdAt: at, updatedAt: at };
  const override: CalculationOverride = { id: "calc_duplicate_actor", campaignId: "camp_demo", actorId: actor.id, fieldId: "armor-class", source: "gm_manual", baseValue: 12, effectiveValue: 14, reason: "Test", createdByUserId: "usr_demo_gm", createdAt: at, updatedAt: at };
  const encounter: Encounter = { id: "enc_duplicate_internal", campaignId: "camp_demo", systemId: actor.systemId, name: "Internal encounter", summary: "Selected tokens", tokenIds: [tokenA.id, tokenB.id], partyActorIds: ["act_valen"], createdAt: at, updatedAt: at };
  const combat: Combat = { id: "cmb_duplicate_history", campaignId: "camp_demo", encounterId: encounter.id, active: false, round: 0, turnIndex: 0, combatants: [{ id: "cmbt_duplicate", tokenId: tokenA.id, actorId: actor.id, name: tokenA.name, initiative: 10, defeated: false }], createdAt: at, updatedAt: at };
  const session: CampaignSession = { id: "cses_duplicate_reference", campaignId: "camp_demo", status: "planned", title: "Duplicate prep", number: 99, agenda: "", notes: "", sceneIds: [sceneA.id], encounterIds: [encounter.id], createdBy: "usr_demo_gm", updatedBy: "usr_demo_gm", createdAt: at, updatedAt: at };
  const preset: FogPreset = { id: "fogp_duplicate_reference", campaignId: "camp_demo", name: "Preset", sourceSceneId: sceneA.id, regions: [], metadata: {}, createdAt: at, updatedAt: at };
  state.scenes.push(sceneA, sceneB);
  state.actors.push(actor);
  state.tokens.push(tokenA, tokenB);
  state.items.push(item);
  state.calculationOverrides.push(override);
  state.encounters.push(encounter);
  state.combats.push(combat);
  state.campaignSessions.push(session);
  state.fogPresets.push(preset);
  return { state, sceneA, sceneB, actor, tokenA, tokenB, item, encounter };
}

function request(sceneA: Scene, sceneB: Scene): SceneDuplicationRequest {
  return {
    operationId: "scene-duplication-unit",
    expectedUpdatedAt: "2026-07-15T12:00:00.000Z",
    sources: [
      { sceneId: sceneA.id, expectedUpdatedAt: sceneA.updatedAt, name: "Same copy name" },
      { sceneId: sceneB.id, expectedUpdatedAt: sceneB.updatedAt, name: "Same copy name" },
    ],
  };
}

describe("scene duplication planning", () => {
  it("deterministically clones the complete selected graph without mutating its source", () => {
    const { state, sceneA, sceneB, actor, tokenA, item, encounter } = graphState();
    const sourceSnapshot = structuredClone({ sceneA, sceneB, actor, tokenA, item, encounter });
    const first = prepareSceneDuplication(state, "camp_demo", request(sceneA, sceneB));
    const second = prepareSceneDuplication(state, "camp_demo", request(sceneA, sceneB));

    expect(first.plan.copies).toEqual(second.plan.copies);
    expect(first.plan.counts).toEqual({ scenes: 2, tokens: 2, actors: 1, items: 1, calculationOverrides: 1, encounters: 1 });
    expect(first.scenes.map((scene) => scene.name)).toEqual(["Same copy name", "Same copy name"]);
    expect(first.scenes.every((scene) => !scene.active && scene.activationHistory?.length === 0)).toBe(true);
    expect(first.actors[0]).toMatchObject({ systemId: actor.systemId, ownerUserId: actor.ownerUserId, name: `${actor.name} Copy`, data: actor.data });
    expect(first.actors[0]?.id).not.toBe(actor.id);
    expect(first.tokens[0]).toMatchObject({ sceneId: first.scenes[0]?.id, actorId: first.actors[0]?.id });
    expect(first.items[0]).toMatchObject({ actorId: first.actors[0]?.id, name: item.name });
    expect(first.encounters[0]?.tokenIds).toEqual(first.tokens.map((token) => token.id));
    expect(first.encounters[0]?.partyActorIds).toEqual(["act_valen"]);
    expect(first.plan.sharedReferences).toContainEqual(expect.objectContaining({ collection: "actors", id: "act_valen" }));
    expect(first.plan.skippedReferences).toEqual(expect.arrayContaining([
      { collection: "combats", id: "cmb_duplicate_history", reason: "combat_history" },
      { collection: "campaignSessions", id: "cses_duplicate_reference", reason: "session_reference" },
      { collection: "fogPresets", id: "fogp_duplicate_reference", reason: "fog_preset_reference" },
    ]));
    expect({ sceneA, sceneB, actor, tokenA, item, encounter }).toEqual(sourceSnapshot);
  });

  it("skips an encounter whose token graph extends outside the selected scenes", () => {
    const { state, sceneA, tokenA } = graphState();
    state.encounters.push({ id: "enc_duplicate_partial", campaignId: "camp_demo", name: "Partial", summary: "", tokenIds: [tokenA.id, "tok_outside_selection"], createdAt: at, updatedAt: at });
    const plan = prepareSceneDuplication(state, "camp_demo", { ...request(sceneA, sceneA), sources: [{ sceneId: sceneA.id, expectedUpdatedAt: sceneA.updatedAt }] });
    expect(plan.encounters.some((encounter) => encounter.id === "enc_duplicate_partial")).toBe(false);
    expect(plan.plan.skippedReferences).toContainEqual({ collection: "encounters", id: "enc_duplicate_partial", reason: "partial_encounter" });
  });

  it("rejects external mutable token references and invalid selection sizes", () => {
    const { state, sceneA, sceneB } = graphState();
    sceneA.annotations[0]!.affectedTokenIds = ["tok_external"];
    expect(() => prepareSceneDuplication(state, "camp_demo", request(sceneA, sceneB))).toThrow(/outside the selected scenes/);
    expect(() => prepareSceneDuplication(state, "camp_demo", { ...request(sceneA, sceneB), sources: [] })).toThrow(/Select 1-100/);
    const large = Array.from({ length: 101 }, (_, index) => ({ sceneId: `scn_${index}`, expectedUpdatedAt: at }));
    expect(() => prepareSceneDuplication(emptyState(), "camp_demo", { operationId: "large", expectedUpdatedAt: at, sources: large })).toThrow(/Select 1-100/);
  });

  it("reports a deterministic operation collision instead of overwriting an earlier copy", () => {
    const { state, sceneA, sceneB } = graphState();
    const prepared = prepareSceneDuplication(state, "camp_demo", request(sceneA, sceneB));
    state.scenes.push(prepared.scenes[0]!);
    expect(() => prepareSceneDuplication(state, "camp_demo", request(sceneA, sceneB))).toThrowError(SceneDuplicationError);
  });
});
