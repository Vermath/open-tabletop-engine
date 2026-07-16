import { createTimestamped, type Actor, type Combat, type DndControlledCreatureCreateRequest, type DndControlledCreatureOriginatingAction, type Item, type Scene } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { analyzeDndControlledCreatureRequest, dndControlledCreatureActionHandoff, dndControlledCreatureHandoffRequestErrors, dndControlledCreatureHandoffWithPreparation, dndControlledCreatureIsExpired, findExpiredDndControlledCreatures } from "./dnd-controlled-creatures.js";

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
  it("maps explicit spell and feature metadata without parsing names or prose", () => {
    const { source, scene, combat } = fixture();
    const spell = createTimestamped("itm", {
      id: "itm_dragon",
      campaignId: source.campaignId,
      systemId: source.systemId,
      actorId: source.id,
      type: "spell",
      name: "Localized spell name",
      data: {
        source: "SRD 5.2.1",
        duration: "untrusted prose",
        controlledCreature: {
          kind: "summon",
          duration: { mode: "hours", amount: 1 },
          concentration: true,
          initiative: { mode: "shared" },
          command: { required: false, action: "none" },
          actor: { name: "Draconic Spirit", type: "dragon", hp: { base: 50, perSlotAbove: 10, baseSlotLevel: 5 } },
        },
      },
    }) satisfies Item;
    const spellHandoff = dndControlledCreatureActionHandoff({
      actor: source,
      items: [spell],
      roll: { id: `spell-${spell.id}-effect`, label: "Localized spell name Effect", metadata: { controlledCreature: spell.data.controlledCreature } },
      now,
      combat,
      sceneId: scene.id,
      controllerUserId: "user",
      spellSlotLevel: 6,
    });
    expect(spellHandoff).toMatchObject({
      status: "supported",
      prefill: {
        kind: "summon",
        sceneId: scene.id,
        source: { kind: "spell", actorId: source.id, itemId: spell.id, name: spell.name },
        actor: { name: "Draconic Spirit", type: "dragon", data: { hp: { current: 60, max: 60 } } },
        duration: { mode: "until_time", expiresAt: "2026-07-13T13:00:00.000Z" },
        concentration: { sourceActorId: source.id, groupId: `spell-${spell.id}-effect` },
        initiative: { mode: "shared", sourceActorId: source.id },
        command: { required: false, action: "none" },
      },
    });
    expect(spellHandoff?.manualChoices).toEqual(expect.arrayContaining([expect.objectContaining({ field: "token" }), expect.objectContaining({ field: "actor.statBlock" })]));

    const featureHandoff = dndControlledCreatureActionHandoff({
      actor: source,
      items: [],
      roll: {
        id: "feature-wild-shape",
        label: "Wild Shape",
        metadata: { controlledCreature: { kind: "transformation", duration: { mode: "hours", amount: 2 }, concentration: false, initiative: { mode: "shared" }, command: { required: false, action: "none" }, temporaryHitPoints: 5, actor: { type: "beast" }, transformation: { hpCarryover: "preserve" } } },
      },
      now,
      controllerUserId: "user",
    });
    expect(featureHandoff).toMatchObject({
      status: "supported",
      prefill: {
        kind: "transformation",
        targetActorId: source.id,
        source: { kind: "feature", actorId: source.id },
        actor: { type: "beast", data: { temporaryHitPoints: 5 } },
        transformation: { hpCarryover: "preserve" },
      },
    });
    expect(featureHandoff?.manualChoices).toContainEqual(expect.objectContaining({ field: "transformation.equipmentCarryover" }));
  });

  it("keeps unsupported summon detail visible and binds prepared source fields", () => {
    const { source, scene } = fixture();
    const legacy = createTimestamped("itm", { id: "itm_legacy_summon", campaignId: "camp", systemId: "dnd-5e-srd", actorId: source.id, type: "spell", name: "Legacy", data: { summon: "manual stat block", source: "SRD 5.2.1" } }) satisfies Item;
    const handoff = dndControlledCreatureActionHandoff({ actor: source, items: [legacy], roll: { id: `spell-${legacy.id}-effect`, label: "Legacy Effect" }, now, sceneId: scene.id });
    expect(handoff).toMatchObject({ status: "manual_required", prefill: { kind: "summon", sceneId: scene.id } });
    expect(handoff?.manualChoices.map(({ field }) => field)).toEqual(expect.arrayContaining(["duration", "initiative", "command", "token"]));

    const preparation: DndControlledCreatureOriginatingAction = { actorId: source.id, rollId: `spell-${legacy.id}-effect`, label: "Legacy Effect", preparedPreviewKey: "preview-key", resolutionHash: "resolution-hash" };
    const prepared = dndControlledCreatureHandoffWithPreparation(handoff!, preparation);
    const request: DndControlledCreatureCreateRequest = {
      kind: "summon",
      sceneId: scene.id,
      source: prepared.prefill.source,
      originatingAction: preparation,
      controllerUserId: "user",
      controllerActorId: source.id,
      ownerUserId: "user",
      actor: {
        name: "Reviewed",
        type: "summon",
        data: {
          ...prepared.prefill.actor?.data,
          hp: { current: 1, max: 1 },
          rulesVersion: "SRD 5.2.1",
        },
      },
      token: { x: 1, y: 2, width: 50, height: 50, disposition: "friendly" },
      duration: { mode: "until_dismissed" },
      initiative: { mode: "independent" },
      command: { required: false, action: "none" },
    };
    expect(dndControlledCreatureHandoffRequestErrors(prepared, request)).toEqual([]);
    expect(dndControlledCreatureHandoffRequestErrors(prepared, { ...request, source: { ...request.source, actorId: "other" } })).toEqual([expect.stringContaining("source")]);
    expect(dndControlledCreatureHandoffRequestErrors(prepared, { ...request, originatingAction: { ...preparation, preparedPreviewKey: "other" } })).toEqual([expect.stringContaining("originatingAction")]);
  });

  it("binds complete source stat blocks while leaving incomplete stat choices reviewable", () => {
    const { source, scene } = fixture();
    const complete = createTimestamped("itm", {
      id: "itm_complete_summon",
      campaignId: source.campaignId,
      systemId: source.systemId,
      actorId: source.id,
      type: "spell",
      name: "Complete Summon",
      data: {
        controlledCreature: {
          kind: "summon",
          duration: { mode: "until_dismissed" },
          concentration: false,
          initiative: { mode: "independent" },
          command: { required: false, action: "none" },
          statBlockComplete: true,
          actor: { name: "Complete Spirit", type: "celestial", imageAssetId: "ast_spirit", hp: { current: 12, max: 12 }, data: { armorClass: 14, speed: 30 } },
        },
      },
    }) satisfies Item;
    const handoff = dndControlledCreatureActionHandoff({ actor: source, items: [complete], roll: { id: `spell-${complete.id}-effect`, label: "Complete Summon Effect" }, sceneId: scene.id });
    const request = {
      ...structuredClone(handoff!.prefill),
      token: { x: 1, y: 2, width: 50, height: 50, disposition: "friendly" },
    } as DndControlledCreatureCreateRequest;

    expect(handoff?.sourcedFields).toEqual(expect.arrayContaining(["actor.data", "actor.imageAssetId"]));
    expect(dndControlledCreatureHandoffRequestErrors(handoff!, request)).toEqual([]);
    const forged = structuredClone(request);
    forged.actor.data.armorClass = 99;
    forged.actor.data.speed = 999;
    expect(dndControlledCreatureHandoffRequestErrors(handoff!, forged)).toEqual([expect.stringContaining("actor.data")]);

    const incompleteItem = structuredClone(complete);
    incompleteItem.id = "itm_incomplete_summon";
    (incompleteItem.data.controlledCreature as Record<string, unknown>).statBlockComplete = false;
    const incomplete = dndControlledCreatureActionHandoff({ actor: source, items: [incompleteItem], roll: { id: `spell-${incompleteItem.id}-effect`, label: "Incomplete Summon Effect" }, sceneId: scene.id });
    const reviewed = { ...structuredClone(incomplete!.prefill), token: request.token } as DndControlledCreatureCreateRequest;
    reviewed.actor.data.armorClass = 99;
    reviewed.actor.data.speed = 999;
    expect(incomplete?.manualChoices).toContainEqual(expect.objectContaining({ field: "actor.statBlock" }));
    expect(dndControlledCreatureHandoffRequestErrors(incomplete!, reviewed)).toEqual([]);
  });

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
