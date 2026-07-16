import { createHash } from "node:crypto";
import {
  nowIso,
  type Actor,
  type AuditLog,
  type CalculationOverride,
  type Campaign,
  type Encounter,
  type EngineState,
  type Item,
  type Scene,
  type SceneDuplicationCopy,
  type SceneDuplicationCopyCollection,
  type SceneDuplicationPlan,
  type SceneDuplicationRequest,
  type SceneDuplicationResult,
  type SceneDuplicationSharedReference,
  type SceneDuplicationSkippedReference,
  type Token,
} from "@open-tabletop/core";
import { remapArchiveReferences } from "./archive-operations.js";
import type { StateStore } from "./store.js";

const MAX_SCENE_DUPLICATION_SOURCES = 100;

export interface PreparedSceneDuplication {
  plan: SceneDuplicationPlan;
  scenes: Scene[];
  tokens: Token[];
  actors: Actor[];
  items: Item[];
  calculationOverrides: CalculationOverride[];
  encounters: Encounter[];
}

export class SceneDuplicationError extends Error {
  constructor(readonly code: "invalid_scene_duplication" | "scene_duplication_conflict", message: string) {
    super(message);
  }
}

export function prepareSceneDuplication(
  state: EngineState,
  campaignId: string,
  request: SceneDuplicationRequest,
): PreparedSceneDuplication {
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(request.operationId)) {
    throw new SceneDuplicationError("invalid_scene_duplication", "operationId must be 1-160 letters, numbers, colons, underscores, or dashes");
  }
  if (request.sources.length === 0 || request.sources.length > MAX_SCENE_DUPLICATION_SOURCES) {
    throw new SceneDuplicationError("invalid_scene_duplication", `Select 1-${MAX_SCENE_DUPLICATION_SOURCES} scenes to duplicate`);
  }
  const sourceIds = request.sources.map((source) => source.sceneId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new SceneDuplicationError("invalid_scene_duplication", "Each source scene may appear only once");
  }

  const sourceScenes = request.sources.map((source) => {
    const scene = state.scenes.find((candidate) => candidate.id === source.sceneId && candidate.campaignId === campaignId);
    if (!scene) throw new SceneDuplicationError("invalid_scene_duplication", `Scene not found in campaign: ${source.sceneId}`);
    const name = source.name === undefined ? `${scene.name} Copy` : source.name.trim();
    if (!name || name.length > 160) throw new SceneDuplicationError("invalid_scene_duplication", `Scene copy name must be 1-160 characters: ${scene.id}`);
    return { scene, name };
  });
  const selectedSceneIds = new Set(sourceIds);
  const sourceTokens = state.tokens.filter((token) => selectedSceneIds.has(token.sceneId));
  const selectedTokenIds = new Set(sourceTokens.map((token) => token.id));
  assertInternalSceneTokenReferences(sourceScenes.map(({ scene }) => scene), selectedTokenIds);

  const selectedActorIds = new Set(sourceTokens.flatMap((token) => token.actorId ? [token.actorId] : []));
  const sourceActors = [...selectedActorIds].map((actorId) => {
    const actor = state.actors.find((candidate) => candidate.id === actorId && candidate.campaignId === campaignId);
    if (!actor) throw new SceneDuplicationError("invalid_scene_duplication", `Token actor must belong to the same campaign: ${actorId}`);
    return actor;
  });
  const sourceItems = state.items.filter((item) => item.actorId && selectedActorIds.has(item.actorId));
  const sourceOverrides = state.calculationOverrides.filter((override) => selectedActorIds.has(override.actorId) && !override.clearedAt);

  const skippedReferences: SceneDuplicationSkippedReference[] = [];
  const sourceEncounters: Encounter[] = [];
  const includedEncounterIds = new Set<string>();
  for (const encounter of state.encounters.filter((candidate) => candidate.campaignId === campaignId && candidate.tokenIds.some((tokenId) => selectedTokenIds.has(tokenId)))) {
    if (encounter.tokenIds.every((tokenId) => selectedTokenIds.has(tokenId))) {
      sourceEncounters.push(encounter);
      includedEncounterIds.add(encounter.id);
    } else {
      skippedReferences.push({ collection: "encounters", id: encounter.id, reason: "partial_encounter" });
    }
  }
  for (const combat of state.combats.filter((candidate) => candidate.campaignId === campaignId && (
    (candidate.encounterId ? includedEncounterIds.has(candidate.encounterId) : false)
    || candidate.combatants.some((combatant) => selectedTokenIds.has(combatant.tokenId) || Boolean(combatant.actorId && selectedActorIds.has(combatant.actorId)))
  ))) {
    skippedReferences.push({ collection: "combats", id: combat.id, reason: "combat_history" });
  }
  for (const session of state.campaignSessions.filter((candidate) => candidate.campaignId === campaignId && (
    candidate.sceneIds.some((sceneId) => selectedSceneIds.has(sceneId))
    || candidate.encounterIds.some((encounterId) => includedEncounterIds.has(encounterId))
  ))) {
    skippedReferences.push({ collection: "campaignSessions", id: session.id, reason: "session_reference" });
  }
  for (const preset of state.fogPresets.filter((candidate) => candidate.campaignId === campaignId && Boolean(candidate.sourceSceneId && selectedSceneIds.has(candidate.sourceSceneId)))) {
    skippedReferences.push({ collection: "fogPresets", id: preset.id, reason: "fog_preset_reference" });
  }

  const idMap = new Map<string, string>();
  addRecordIds(idMap, request.operationId, "scenes", sourceScenes.map(({ scene }) => scene));
  addRecordIds(idMap, request.operationId, "tokens", sourceTokens);
  addRecordIds(idMap, request.operationId, "actors", sourceActors);
  addRecordIds(idMap, request.operationId, "items", sourceItems);
  addRecordIds(idMap, request.operationId, "calculationOverrides", sourceOverrides);
  addRecordIds(idMap, request.operationId, "encounters", sourceEncounters);
  assertTargetIdsAvailable(state, idMap);

  const at = nowIso();
  const firstSortOrder = Math.max(0, ...state.scenes.filter((scene) => scene.campaignId === campaignId).map((scene) => scene.sortOrder)) + 1;
  const scenes = sourceScenes.map(({ scene, name }, index) => duplicateScene(scene, name, firstSortOrder + index, at, request.operationId, idMap));
  const tokens = sourceTokens.map((token) => duplicateRecord(token, "tokens", at, idMap));
  const actors = sourceActors.map((actor) => ({ ...duplicateRecord(actor, "actors", at, idMap), name: `${actor.name} Copy` }));
  const items = sourceItems.map((item) => duplicateRecord(item, "items", at, idMap));
  const calculationOverrides = sourceOverrides.map((override) => duplicateRecord(override, "calculationOverrides", at, idMap));
  const encounters = sourceEncounters.map((encounter) => ({ ...duplicateRecord(encounter, "encounters", at, idMap), name: `${encounter.name} Copy` }));

  const copies: SceneDuplicationCopy[] = [
    ...sourceScenes.map(({ scene }, index) => copyRow("scenes", scene.id, scenes[index]!.id, scene.name, scenes[index]!.name)),
    ...sourceTokens.map((token, index) => copyRow("tokens", token.id, tokens[index]!.id, token.name, tokens[index]!.name)),
    ...sourceActors.map((actor, index) => copyRow("actors", actor.id, actors[index]!.id, actor.name, actors[index]!.name)),
    ...sourceItems.map((item, index) => copyRow("items", item.id, items[index]!.id, item.name, items[index]!.name)),
    ...sourceOverrides.map((override, index) => copyRow("calculationOverrides", override.id, calculationOverrides[index]!.id)),
    ...sourceEncounters.map((encounter, index) => copyRow("encounters", encounter.id, encounters[index]!.id, encounter.name, encounters[index]!.name)),
  ];
  const sharedReferences = sharedSceneDuplicationReferences(state, campaignId, sourceScenes.map(({ scene }) => scene), sourceTokens, sourceActors, sourceItems, sourceEncounters, selectedActorIds);
  return {
    plan: {
      operationId: request.operationId,
      campaignId,
      copies,
      skippedReferences: uniqueSkippedReferences(skippedReferences),
      sharedReferences,
      counts: copyCounts(copies),
    },
    scenes,
    tokens,
    actors,
    items,
    calculationOverrides,
    encounters,
  };
}

export function commitPreparedSceneDuplication(
  store: StateStore,
  prepared: PreparedSceneDuplication,
  userId: string,
): SceneDuplicationResult {
  const before = store.state;
  const campaignIndex = before.campaigns.findIndex((campaign) => campaign.id === prepared.plan.campaignId);
  if (campaignIndex < 0) throw new SceneDuplicationError("invalid_scene_duplication", "Campaign not found");
  const next = {
    ...before,
    campaigns: structuredClone(before.campaigns),
    scenes: [...before.scenes, ...prepared.scenes],
    tokens: [...before.tokens, ...prepared.tokens],
    actors: [...before.actors, ...prepared.actors],
    items: [...before.items, ...prepared.items],
    calculationOverrides: [...before.calculationOverrides, ...prepared.calculationOverrides],
    encounters: [...before.encounters, ...prepared.encounters],
    auditLogs: [...before.auditLogs],
  } satisfies EngineState;
  const campaign = next.campaigns[campaignIndex]!;
  campaign.updatedAt = nextRevisionTimestamp(campaign.updatedAt);
  const at = nowIso();
  next.auditLogs.push({
    id: stableDuplicateId("audit", prepared.plan.operationId, "audit"),
    campaignId: campaign.id,
    actorUserId: userId,
    actorType: "user",
    action: "scene.duplicate.batch",
    targetType: "campaign",
    targetId: campaign.id,
    after: {
      operationId: prepared.plan.operationId,
      counts: prepared.plan.counts,
      skippedReferences: prepared.plan.skippedReferences,
    },
    createdAt: at,
    updatedAt: at,
  } satisfies AuditLog);
  try {
    store.replace(next);
  } catch (error) {
    try {
      if (store.restoreDurableState) store.restoreDurableState();
      else store.state = before;
    } catch (rollbackError) {
      store.state = before;
      throw new Error(`Scene duplication failed and state compensation was incomplete: ${errorMessage(rollbackError)}`, { cause: error });
    }
    throw error;
  }
  return sceneDuplicationResult(prepared, false, campaign);
}

export function sceneDuplicationPreview(prepared: PreparedSceneDuplication): SceneDuplicationResult {
  return sceneDuplicationResult(prepared, true);
}

function sceneDuplicationResult(prepared: PreparedSceneDuplication, dryRun: boolean, campaign?: Campaign): SceneDuplicationResult {
  return {
    dryRun,
    plan: prepared.plan,
    scenes: dryRun ? [] : prepared.scenes,
    tokens: dryRun ? [] : prepared.tokens,
    actors: dryRun ? [] : prepared.actors,
    items: dryRun ? [] : prepared.items,
    calculationOverrides: dryRun ? [] : prepared.calculationOverrides,
    encounters: dryRun ? [] : prepared.encounters,
    ...(campaign ? { campaign } : {}),
  };
}

function duplicateScene(
  source: Scene,
  name: string,
  sortOrder: number,
  at: string,
  operationId: string,
  idMap: Map<string, string>,
): Scene {
  const scene = duplicateRecord(source, "scenes", at, idMap);
  scene.name = name;
  scene.active = false;
  scene.sortOrder = sortOrder;
  scene.fog = source.fog.map((region) => ({ ...structuredClone(region), id: stableDuplicateId("fog", operationId, `${source.id}:fog:${region.id}`) }));
  scene.walls = source.walls.map((wall) => ({ ...structuredClone(wall), id: stableDuplicateId("wall", operationId, `${source.id}:wall:${wall.id}`) }));
  scene.lights = source.lights.map((light) => ({ ...structuredClone(light), id: stableDuplicateId("light", operationId, `${source.id}:light:${light.id}`) }));
  const annotationGroups = new Map<string, string>();
  scene.annotations = (remapArchiveReferences(source.annotations, idMap) as Scene["annotations"]).map((annotation) => ({
    ...structuredClone(annotation),
    id: stableDuplicateId("ann", operationId, `${source.id}:annotation:${annotation.id}`),
    sceneId: scene.id,
    ...(annotation.groupId ? { groupId: mapNestedId(annotationGroups, "anngrp", operationId, source.id, annotation.groupId) } : {}),
    createdAt: at,
    updatedAt: at,
  }));
  scene.difficultTerrain = (source.difficultTerrain ?? []).map((region) => ({
    ...(remapArchiveReferences(region, idMap) as typeof region),
    id: stableDuplicateId("terrain", operationId, `${source.id}:terrain:${region.id}`),
    sceneId: scene.id,
    createdAt: at,
    updatedAt: at,
  }));
  scene.coverOverrides = (source.coverOverrides ?? []).map((override) => ({
    ...(remapArchiveReferences(override, idMap) as typeof override),
    id: stableDuplicateId("cover", operationId, `${source.id}:cover:${override.id}`),
    sceneId: scene.id,
    createdAt: at,
    updatedAt: at,
  }));
  scene.fogHistory = [];
  scene.activationHistory = [];
  scene.annotationHistory = [];
  scene.sceneEditHistory = [];
  scene.permissions = undefined;
  return scene;
}

function duplicateRecord<T extends { id: string; createdAt: string; updatedAt: string }>(
  source: T,
  collection: SceneDuplicationCopyCollection,
  at: string,
  idMap: Map<string, string>,
): T {
  const record = remapArchiveReferences(structuredClone(source), idMap) as T;
  record.id = idMap.get(source.id)!;
  record.createdAt = at;
  record.updatedAt = at;
  return record;
}

function addRecordIds(
  idMap: Map<string, string>,
  operationId: string,
  collection: SceneDuplicationCopyCollection,
  records: Array<{ id: string }>,
): void {
  const prefix: Record<SceneDuplicationCopyCollection, string> = {
    scenes: "scn",
    tokens: "tok",
    actors: "act",
    items: "item",
    calculationOverrides: "calcovr",
    encounters: "enc",
  };
  for (const record of records) idMap.set(record.id, stableDuplicateId(prefix[collection]!, operationId, `${collection}:${record.id}`));
}

function assertTargetIdsAvailable(state: EngineState, idMap: Map<string, string>): void {
  const existingIds = new Set([
    ...state.scenes,
    ...state.tokens,
    ...state.actors,
    ...state.items,
    ...state.calculationOverrides,
    ...state.encounters,
    ...state.auditLogs,
  ].map((record) => record.id));
  for (const targetId of idMap.values()) {
    if (existingIds.has(targetId)) throw new SceneDuplicationError("scene_duplication_conflict", `Scene duplication operation already exists: ${targetId}`);
  }
}

function assertInternalSceneTokenReferences(scenes: Scene[], selectedTokenIds: Set<string>): void {
  for (const scene of scenes) {
    for (const annotation of scene.annotations) {
      const external = (annotation.affectedTokenIds ?? []).find((tokenId) => !selectedTokenIds.has(tokenId));
      if (external) throw new SceneDuplicationError("invalid_scene_duplication", `Scene annotation references a token outside the selected scenes: ${external}`);
    }
    for (const override of scene.coverOverrides ?? []) {
      if (!selectedTokenIds.has(override.sourceTokenId) || !selectedTokenIds.has(override.targetTokenId)) {
        throw new SceneDuplicationError("invalid_scene_duplication", `Scene cover override references a token outside the selected scenes: ${override.id}`);
      }
    }
  }
}

function sharedSceneDuplicationReferences(
  state: EngineState,
  campaignId: string,
  scenes: Scene[],
  tokens: Token[],
  actors: Actor[],
  items: Item[],
  encounters: Encounter[],
  copiedActorIds: Set<string>,
): SceneDuplicationSharedReference[] {
  const references = new Map<string, SceneDuplicationSharedReference>();
  const add = (collection: SceneDuplicationSharedReference["collection"], id: string | undefined, referencedBy: string) => {
    if (!id) return;
    const valid = collection === "assets"
      ? state.assets.some((record) => record.id === id && record.campaignId === campaignId)
      : collection === "worlds"
        ? state.worlds.some((record) => record.id === id && record.campaignId === campaignId)
        : state.actors.some((record) => record.id === id && record.campaignId === campaignId);
    if (!valid) throw new SceneDuplicationError("invalid_scene_duplication", `${collection} reference must belong to the same campaign: ${id}`);
    const key = `${collection}:${id}`;
    const row = references.get(key) ?? { collection, id, referencedBy: [] };
    if (!row.referencedBy.includes(referencedBy)) row.referencedBy.push(referencedBy);
    references.set(key, row);
  };
  for (const scene of scenes) {
    add("assets", scene.backgroundAssetId, scene.id);
    add("worlds", scene.worldId, scene.id);
  }
  for (const token of tokens) add("assets", token.imageAssetId, token.id);
  for (const actor of actors) {
    add("assets", actor.imageAssetId, actor.id);
    add("worlds", actor.worldId, actor.id);
  }
  for (const item of items) add("worlds", item.worldId, item.id);
  for (const encounter of encounters) {
    add("worlds", encounter.worldId, encounter.id);
    for (const actorId of encounter.partyActorIds ?? []) if (!copiedActorIds.has(actorId)) add("actors", actorId, encounter.id);
  }
  return [...references.values()].sort((left, right) => `${left.collection}:${left.id}`.localeCompare(`${right.collection}:${right.id}`));
}

function copyCounts(copies: SceneDuplicationCopy[]): Record<SceneDuplicationCopyCollection, number> {
  const counts: Record<SceneDuplicationCopyCollection, number> = {
    scenes: 0,
    tokens: 0,
    actors: 0,
    items: 0,
    calculationOverrides: 0,
    encounters: 0,
  };
  for (const copy of copies) counts[copy.collection] = (counts[copy.collection] ?? 0) + 1;
  return counts;
}

function copyRow(collection: SceneDuplicationCopyCollection, sourceId: string, targetId: string, sourceName?: string, targetName?: string): SceneDuplicationCopy {
  return { collection, sourceId, targetId, ...(sourceName ? { sourceName } : {}), ...(targetName ? { targetName } : {}) };
}

function uniqueSkippedReferences(rows: SceneDuplicationSkippedReference[]): SceneDuplicationSkippedReference[] {
  return [...new Map(rows.map((row) => [`${row.collection}:${row.id}`, row])).values()];
}

function stableDuplicateId(prefix: string, operationId: string, source: string): string {
  const digest = createHash("sha256").update(`${operationId}:${source}`).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

function mapNestedId(map: Map<string, string>, prefix: string, operationId: string, sceneId: string, sourceId: string): string {
  const existing = map.get(sourceId);
  if (existing) return existing;
  const target = stableDuplicateId(prefix, operationId, `${sceneId}:${prefix}:${sourceId}`);
  map.set(sourceId, target);
  return target;
}

function nextRevisionTimestamp(current: string): string {
  const now = Date.now();
  const previous = Date.parse(current);
  return new Date(Number.isFinite(previous) ? Math.max(now, previous + 1) : now).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
