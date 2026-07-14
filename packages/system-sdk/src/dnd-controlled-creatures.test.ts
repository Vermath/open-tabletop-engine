import { createTimestamped, type Actor, type Combat, type DndControlledCreatureCreateRequest, type Item, type Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { analyzeDndControlledCreatureRequest, dndControlledCreatureIsExpired, findExpiredDndControlledCreatures } from "./dnd-controlled-creatures.js";

const now = "2026-07-13T12:00:00.000Z";

function fixture() {
  const source = createTimestamped("act", { id: "act_caster", campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type: "character", name: "Caster", data: { rulesEngine: { concentration: { rollId: "spell:summon" } } }, permissions: {} }) satisfies Actor;
  const feature = createTimestamped("itm", { id: "itm_spell", campaignId: "camp", systemId: "dnd-5e-srd", actorId: source.id, type: "spell", name: "Open summon", data: {} }) satisfies Item;
  const scene = createTimestamped("scn", { id: "scn", campaignId: "camp", name: "Scene", active: true, sortOrder: 0, gridType: "square", gridSize: 50, grid: { type: "square", size: 50, distance: 5, unit: "ft" }, width: 1000, height: 1000, fog: [], walls: [], lights: [], annotations: [], metadata: {}, environmentMechanics: [] }) satisfies Scene;
  const combat = createTimestamped("cmb", { id: "cmb", campaignId: "camp", active: true, round: 2, turnIndex: 0, combatants: [{ id: "cmbt", tokenId: "tok_source", actorId: source.id, name: source.name, initiative: 17, defeated: false }] }) satisfies Combat;
  const request: DndControlledCreatureCreateRequest = {
    kind: "summon",
    sceneId: scene.id,
    combatId: combat.id,
    source: { kind: "spell", actorId: source.id, itemId: feature.id, name: feature.name, systemId: "dnd-5e-srd", rulesVersion: "SRD 5.2.1" },
    controllerUserId: "user",
    controllerActorId: source.id,
    ownerUserId: "user",
    actor: { name: "Spirit", type: "summon", data: {} },
    token: { x: 100, y: 100, width: 50, height: 50, disposition: "friendly" },
    duration: { mode: "rounds", combatId: combat.id, expiresAtRound: 5 },
    concentration: { sourceActorId: source.id, groupId: "spell:summon" },
    initiative: { mode: "shared", sourceActorId: source.id },
    command: { required: true, action: "bonus_action" },
  };
  return { source, feature, scene, combat, request };
}

describe("D&D controlled-creature analysis", () => {
  it("requires explicit manual review instead of inventing stat-block or hit-point rules", () => {
    const { source, feature, scene, combat, request } = fixture();
    const analysis = analyzeDndControlledCreatureRequest(request, { campaignId: "camp", actors: [source], items: [feature], scenes: [scene], combats: [combat], tokens: [], now });
    expect(analysis.errors).toEqual([]);
    expect(analysis.manualReview.map((review) => review.category)).toEqual(expect.arrayContaining(["stat_block", "hit_points"]));
    expect(analysis.requiredRevisions).toMatchObject({ actors: { [source.id]: source.updatedAt }, items: { [feature.id]: feature.updatedAt }, scenes: { [scene.id]: scene.updatedAt }, combats: { [combat.id]: combat.updatedAt } });
  });

  it("detects round and wall-clock expiry without mutating records", () => {
    const { source, feature, scene, combat, request } = fixture();
    const analysis = analyzeDndControlledCreatureRequest({ ...request, manualReviewConfirmed: true }, { campaignId: "camp", actors: [source], items: [feature], scenes: [scene], combats: [combat], tokens: [], now });
    expect(analysis.errors).toEqual([]);
    const baseRecord = {
      version: 1 as const, id: "ccr", campaignId: "camp", kind: "summon" as const, status: "active" as const,
      source: request.source, controllerUserId: "user", controllerActorId: source.id, ownerUserId: "user", linkedActorId: "controlled", linkedTokenIds: [],
      duration: request.duration, concentration: request.concentration, initiative: request.initiative, command: request.command, createdAt: now, updatedAt: now,
    };
    expect(dndControlledCreatureIsExpired(baseRecord, [{ ...combat, round: 4 }])).toBe(false);
    expect(dndControlledCreatureIsExpired(baseRecord, [{ ...combat, round: 5 }])).toBe(true);
    expect(dndControlledCreatureIsExpired({ ...baseRecord, duration: { mode: "until_time", expiresAt: "2026-07-13T12:01:00.000Z" } }, [], "2026-07-13T12:02:00.000Z")).toBe(true);
    expect(dndControlledCreatureIsExpired({ ...baseRecord, status: "dismissed" }, [{ ...combat, round: 5 }])).toBe(false);
    expect(dndControlledCreatureIsExpired({ ...baseRecord, duration: { mode: "until_time", expiresAt: "invalid" } }, [], "2026-07-13T12:02:00.000Z")).toBe(false);
  });

  it("builds a stable automatic-expiry batch without mutating campaign state", () => {
    const { source, combat, request } = fixture();
    const record = {
      version: 1 as const, id: "ccr", campaignId: "camp", kind: "summon" as const, status: "active" as const,
      source: request.source, controllerUserId: "user", controllerActorId: source.id, ownerUserId: "user", linkedActorId: "controlled", linkedTokenIds: ["tok_controlled"],
      duration: request.duration, concentration: request.concentration, initiative: request.initiative, command: request.command, createdAt: now, updatedAt: now,
    };
    const controlled = createTimestamped("act", {
      id: "controlled", campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type: "summon", name: "Spirit",
      data: { dnd5eControlledCreature: record }, permissions: {},
    }) satisfies Actor;
    const before = structuredClone({ actors: [controlled], combats: [combat] });

    expect(findExpiredDndControlledCreatures([controlled], [{ ...combat, round: 4 }], now)).toEqual([]);
    expect(findExpiredDndControlledCreatures([controlled], [{ ...combat, round: 5 }], now)).toEqual([
      expect.objectContaining({
        actor: controlled,
        record,
        reason: "expired",
        trigger: "round",
        affected: { actorIds: ["controlled"], tokenIds: ["tok_controlled"], combatIds: ["cmb"] },
      }),
    ]);
    expect({ actors: [controlled], combats: [combat] }).toEqual(before);
  });
});
