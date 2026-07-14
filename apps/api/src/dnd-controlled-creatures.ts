import { createHash } from "node:crypto";
import {
  createId,
  createTimestamped,
  nowIso,
  type Actor,
  type Combat,
  type DndControlledCreatureConfirmRequest,
  type DndControlledCreatureCreateRequest,
  type DndControlledCreatureMutationResult,
  type DndControlledCreaturePreview,
  type DndControlledCreatureRecord,
  type DndControlledCreatureRevisionSet,
  type EngineState,
  type Item,
  type Token,
} from "@open-tabletop/core";
import {
  analyzeDndControlledCreatureRequest,
  dataWithDndControlledCreature,
  dndControlledCreatureIsExpired,
  readDndControlledCreature,
} from "@open-tabletop/system-sdk";

type RevisionCollection = keyof DndControlledCreatureRevisionSet;

export interface ControlledCreatureRevisionMismatch {
  collection: RevisionCollection;
  id: string;
  expectedUpdatedAt?: string;
  currentUpdatedAt?: string;
  current?: unknown;
}

export function buildDndControlledCreaturePreview(
  state: EngineState,
  campaignId: string,
  request: DndControlledCreatureCreateRequest,
): DndControlledCreaturePreview {
  const analysis = analyzeDndControlledCreatureRequest(request, {
    campaignId,
    actors: state.actors,
    items: state.items,
    tokens: state.tokens,
    combats: state.combats,
    scenes: state.scenes,
  });
  const previewToken = controlledCreaturePreviewToken(request, analysis.requiredRevisions);
  const ready = analysis.errors.length === 0 && (analysis.manualReview.length === 0 || request.manualReviewConfirmed === true);
  return {
    campaignId,
    systemId: "dnd-5e-srd",
    previewToken,
    ready,
    summary: previewSummary(request, analysis.manualReview.length, analysis.errors.length),
    errors: analysis.errors,
    manualReview: analysis.manualReview,
    warnings: analysis.warnings,
    requiredRevisions: analysis.requiredRevisions,
    affected: analysis.affected,
  };
}

export function controlledCreaturePreviewToken(
  request: DndControlledCreatureCreateRequest,
  revisions: DndControlledCreatureRevisionSet,
): string {
  return `ccp_${createHash("sha256").update(stableJson({ request, revisions })).digest("hex").slice(0, 32)}`;
}

export function dndControlledCreatureEntries(state: EngineState, campaignId: string): Array<{ actor: Actor; record: DndControlledCreatureRecord }> {
  return state.actors
    .filter((actor) => actor.campaignId === campaignId && actor.systemId === "dnd-5e-srd")
    .map((actor) => ({ actor, record: readDndControlledCreature(actor) }))
    .filter((entry): entry is { actor: Actor; record: DndControlledCreatureRecord } => Boolean(entry.record))
    .sort((left, right) => left.record.createdAt.localeCompare(right.record.createdAt) || left.record.id.localeCompare(right.record.id));
}

export function controlledCreatureRevisionMismatch(
  state: EngineState,
  expected: DndControlledCreatureRevisionSet,
  required: DndControlledCreatureRevisionSet,
): ControlledCreatureRevisionMismatch | undefined {
  const collections: RevisionCollection[] = ["actors", "items", "tokens", "combats", "scenes", "encounters"];
  for (const collection of collections) {
    const records = recordsForRevisionCollection(state, collection);
    for (const [id, requiredRevision] of Object.entries(required[collection])) {
      const current = records.find((record) => record.id === id);
      const expectedRevision = expected?.[collection]?.[id];
      if (!current || expectedRevision !== requiredRevision || current.updatedAt !== requiredRevision) {
        return {
          collection,
          id,
          expectedUpdatedAt: expectedRevision,
          currentUpdatedAt: current?.updatedAt,
          current,
        };
      }
    }
  }
  return undefined;
}

export function confirmDndControlledCreature(
  state: EngineState,
  campaignId: string,
  body: DndControlledCreatureConfirmRequest,
): DndControlledCreatureMutationResult {
  const request = body.request;
  const now = nowIso();
  if (request.kind === "transformation") return applyTransformation(state, campaignId, request, now);

  const scene = state.scenes.find((candidate) => candidate.id === request.sceneId && candidate.campaignId === campaignId);
  if (!scene || !request.token) throw new Error("Controlled-creature preview became invalid before confirmation.");
  const actorId = createId("act");
  const tokenId = createId("tok");
  const recordId = createId("ccr");
  const record: DndControlledCreatureRecord = {
    version: 1,
    id: recordId,
    campaignId,
    kind: request.kind,
    status: "active",
    source: structuredClone(request.source),
    controllerUserId: request.controllerUserId,
    controllerActorId: request.controllerActorId,
    ownerUserId: request.ownerUserId,
    linkedActorId: actorId,
    linkedTokenIds: [tokenId],
    duration: structuredClone(request.duration),
    ...(request.concentration ? { concentration: structuredClone(request.concentration) } : {}),
    initiative: structuredClone(request.initiative),
    command: structuredClone(request.command),
    createdAt: now,
    updatedAt: now,
  };
  const actor = createTimestamped("act", {
    id: actorId,
    campaignId,
    systemId: "dnd-5e-srd",
    ownerUserId: request.ownerUserId,
    type: request.actor.type.trim(),
    name: request.actor.name.trim(),
    imageAssetId: request.actor.imageAssetId,
    data: dataWithDndControlledCreature(request.actor.data, record),
    permissions: {},
  }) satisfies Actor;
  const token = createTimestamped("tok", {
    id: tokenId,
    sceneId: scene.id,
    actorId,
    name: request.token.name?.trim() || actor.name,
    x: request.token.x,
    y: request.token.y,
    width: request.token.width,
    height: request.token.height,
    rotation: request.token.rotation ?? 0,
    hidden: request.token.hidden ?? false,
    locked: false,
    visionEnabled: true,
    visionRadius: 0,
    disposition: request.token.disposition,
    imageAssetId: request.token.imageAssetId ?? actor.imageAssetId,
    ownerUserIds: [...new Set([request.ownerUserId, request.controllerUserId])],
    metadata: { dnd5eControlledCreatureId: record.id },
  }) satisfies Token;

  const changedCombats: Combat[] = [];
  if (request.combatId) {
    const combat = state.combats.find((candidate) => candidate.id === request.combatId && candidate.campaignId === campaignId);
    if (!combat) throw new Error("Selected combat no longer exists.");
    combat.combatants.push({
      id: `cmbt_${token.id}`,
      tokenId: token.id,
      actorId: actor.id,
      name: actor.name,
      initiative: controlledInitiative(request, combat),
      defeated: false,
      readiness: "normal",
      conditions: [],
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
    });
    if (!combat.manualTurnOrder) combat.combatants.sort((left, right) => right.initiative - left.initiative || left.id.localeCompare(right.id));
    combat.updatedAt = revisionAfter(combat.updatedAt, now);
    changedCombats.push(combat);
  }
  state.actors.push(actor);
  state.tokens.push(token);
  return mutationResult("created", [record], [actor], [token], changedCombats);
}

export function controlledCreatureLifecycleRevisions(state: EngineState, actor: Actor): DndControlledCreatureRevisionSet {
  const record = readDndControlledCreature(actor);
  if (!record) return emptyRevisionSet();
  const actorIds = new Set([actor.id]);
  const tokenIds = new Set(record.linkedTokenIds);
  const itemIds = new Set<string>();
  if (record.kind === "summon") {
    for (const item of state.items) if (item.actorId === actor.id) itemIds.add(item.id);
  }
  for (const item of record.transformation?.snapshot.items ?? []) itemIds.add(item.id);
  const combatIds = new Set<string>();
  const sceneIds = new Set<string>();
  const encounterIds = new Set<string>();
  for (const token of state.tokens) if (tokenIds.has(token.id)) sceneIds.add(token.sceneId);
  for (const combat of state.combats) {
    if (combat.campaignId === actor.campaignId && combat.combatants.some((combatant) => tokenIds.has(combatant.tokenId) || combatant.actorId === actor.id)) combatIds.add(combat.id);
  }
  for (const snapshot of record.transformation?.snapshot.combatants ?? []) combatIds.add(snapshot.combatId);
  for (const encounter of state.encounters) if (encounter.campaignId === actor.campaignId && encounter.tokenIds.some((tokenId) => tokenIds.has(tokenId))) encounterIds.add(encounter.id);
  return revisionSet(state, { actorIds, itemIds, tokenIds, combatIds, sceneIds, encounterIds });
}

export function emptyDndControlledCreatureRevisions(): DndControlledCreatureRevisionSet {
  return emptyRevisionSet();
}

export function mergeDndControlledCreatureRevisions(
  target: DndControlledCreatureRevisionSet,
  source: DndControlledCreatureRevisionSet,
): DndControlledCreatureRevisionSet {
  for (const collection of ["actors", "items", "tokens", "combats", "scenes", "encounters"] as const) {
    Object.assign(target[collection], source[collection]);
  }
  return target;
}

export function endDndControlledCreatureRecord(
  state: EngineState,
  actor: Actor,
  reason: "dismissed" | "expired" | "concentration_ended",
): DndControlledCreatureMutationResult {
  const record = readDndControlledCreature(actor);
  if (!record || record.status !== "active") throw new Error("Controlled creature is not active.");
  if (reason === "expired" && !dndControlledCreatureIsExpired(record, state.combats)) throw new Error("Controlled creature has not expired.");
  const now = nowIso();
  const endedRecord: DndControlledCreatureRecord = { ...structuredClone(record), status: reason, updatedAt: now };

  if (record.kind === "transformation" && record.transformation) {
    const snapshot = record.transformation.snapshot;
    actor.name = snapshot.actor.name;
    actor.type = snapshot.actor.type;
    actor.imageAssetId = snapshot.actor.imageAssetId;
    actor.data = structuredClone(snapshot.actor.data);
    actor.updatedAt = revisionAfter(actor.updatedAt, now);
    const changedCombats: Combat[] = [];
    for (const itemSnapshot of snapshot.items) {
      const item = state.items.find((candidate) => candidate.id === itemSnapshot.id && candidate.campaignId === actor.campaignId);
      if (!item) throw new Error(`Transformation item is missing: ${itemSnapshot.id}`);
      item.actorId = itemSnapshot.actorId;
      item.data = structuredClone(itemSnapshot.data);
      item.updatedAt = revisionAfter(item.updatedAt, now);
    }
    for (const combatSnapshot of snapshot.combatants) {
      const combat = state.combats.find((candidate) => candidate.id === combatSnapshot.combatId && candidate.campaignId === actor.campaignId);
      const combatant = combat?.combatants.find((candidate) => candidate.id === combatSnapshot.combatantId);
      if (!combat || !combatant) throw new Error(`Transformation combatant is missing: ${combatSnapshot.combatantId}`);
      combatant.initiative = combatSnapshot.initiative;
      if (!combat.manualTurnOrder) combat.combatants.sort((left, right) => right.initiative - left.initiative || left.id.localeCompare(right.id));
      combat.updatedAt = revisionAfter(combat.updatedAt, now);
      changedCombats.push(combat);
    }
    return mutationResult("reverted", [endedRecord], [actor], [], uniqueById(changedCombats));
  }

  const linkedTokenIds = new Set(record.linkedTokenIds);
  const removedTokens = state.tokens.filter((token) => linkedTokenIds.has(token.id));
  state.tokens = state.tokens.filter((token) => !linkedTokenIds.has(token.id));
  const changedCombats: Combat[] = [];
  for (const combat of state.combats) {
    if (combat.campaignId !== actor.campaignId) continue;
    const next = combat.combatants.filter((combatant) => !linkedTokenIds.has(combatant.tokenId) && combatant.actorId !== actor.id);
    if (next.length === combat.combatants.length) continue;
    combat.combatants = next;
    combat.turnIndex = Math.max(0, Math.min(combat.turnIndex, Math.max(0, next.length - 1)));
    combat.updatedAt = revisionAfter(combat.updatedAt, now);
    changedCombats.push(combat);
  }
  for (const encounter of state.encounters) {
    if (encounter.campaignId !== actor.campaignId || !encounter.tokenIds.some((tokenId) => linkedTokenIds.has(tokenId))) continue;
    encounter.tokenIds = encounter.tokenIds.filter((tokenId) => !linkedTokenIds.has(tokenId));
    encounter.updatedAt = revisionAfter(encounter.updatedAt, now);
  }
  for (const scene of state.scenes) {
    if (!removedTokens.some((token) => token.sceneId === scene.id)) continue;
    const covers = scene.coverOverrides ?? [];
    const next = covers.filter((cover) => !linkedTokenIds.has(cover.sourceTokenId) && !linkedTokenIds.has(cover.targetTokenId));
    if (next.length !== covers.length) {
      scene.coverOverrides = next;
      scene.updatedAt = revisionAfter(scene.updatedAt, now);
    }
  }

  if (record.kind === "persistent_companion") {
    const dismissed: DndControlledCreatureRecord = { ...endedRecord, status: "dismissed", linkedTokenIds: [] };
    actor.data = dataWithDndControlledCreature(actor.data, dismissed);
    actor.updatedAt = revisionAfter(actor.updatedAt, now);
    return mutationResult("dismissed", [dismissed], [actor], [], changedCombats, [], [...linkedTokenIds]);
  }

  const removedItemIds = new Set(state.items.filter((item) => item.actorId === actor.id).map((item) => item.id));
  state.items = state.items.filter((item) => !removedItemIds.has(item.id));
  state.actors = state.actors.filter((candidate) => candidate.id !== actor.id);
  return mutationResult(reason, [endedRecord], [], [], changedCombats, [actor.id], [...linkedTokenIds]);
}

export function commandDndControlledCreature(
  actor: Actor,
  userId: string,
  input: { note?: string; combatId?: string; round?: number },
): DndControlledCreatureMutationResult {
  const record = readDndControlledCreature(actor);
  if (!record || record.status !== "active") throw new Error("Controlled creature is not active.");
  if (!record.command.required) throw new Error("This controlled creature does not require commands.");
  const now = nowIso();
  const updatedRecord: DndControlledCreatureRecord = {
    ...structuredClone(record),
    lastCommand: {
      commandedAt: now,
      commandedByUserId: userId,
      action: record.command.action,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.combatId ? { combatId: input.combatId } : {}),
      ...(Number.isInteger(input.round) ? { round: input.round } : {}),
    },
    updatedAt: now,
  };
  actor.data = dataWithDndControlledCreature(actor.data, updatedRecord);
  actor.updatedAt = revisionAfter(actor.updatedAt, now);
  return mutationResult("commanded", [updatedRecord], [actor], [], []);
}

function applyTransformation(
  state: EngineState,
  campaignId: string,
  request: DndControlledCreatureCreateRequest,
  now: string,
): DndControlledCreatureMutationResult {
  const actor = state.actors.find((candidate) => candidate.id === request.targetActorId && candidate.campaignId === campaignId);
  if (!actor || !request.transformation?.hpCarryover || !request.transformation.equipmentCarryover) throw new Error("Transformation preview became invalid before confirmation.");
  const linkedTokens = state.tokens.filter((token) => token.actorId === actor.id);
  const attachedItems = state.items.filter((item) => item.actorId === actor.id);
  const recordId = createId("ccr");
  const changedCombatants: NonNullable<DndControlledCreatureRecord["transformation"]>["snapshot"]["combatants"] = [];
  const changedCombats: Combat[] = [];
  if (request.combatId) {
    const combat = state.combats.find((candidate) => candidate.id === request.combatId && candidate.campaignId === campaignId);
    if (!combat) throw new Error("Selected combat no longer exists.");
    for (const combatant of combat.combatants.filter((candidate) => candidate.actorId === actor.id)) {
      changedCombatants.push({ combatId: combat.id, combatantId: combatant.id, initiative: combatant.initiative });
      combatant.initiative = controlledInitiative(request, combat);
    }
    if (changedCombatants.length > 0) {
      if (!combat.manualTurnOrder) combat.combatants.sort((left, right) => right.initiative - left.initiative || left.id.localeCompare(right.id));
      combat.updatedAt = revisionAfter(combat.updatedAt, now);
      changedCombats.push(combat);
    }
  }
  const suppressedItems = request.transformation.equipmentCarryover === "suppress" ? attachedItems : [];
  const snapshotData = structuredClone(actor.data);
  const record: DndControlledCreatureRecord = {
    version: 1,
    id: recordId,
    campaignId,
    kind: "transformation",
    status: "active",
    source: structuredClone(request.source),
    controllerUserId: request.controllerUserId,
    controllerActorId: request.controllerActorId,
    ownerUserId: request.ownerUserId,
    linkedActorId: actor.id,
    linkedTokenIds: linkedTokens.map((token) => token.id),
    duration: structuredClone(request.duration),
    ...(request.concentration ? { concentration: structuredClone(request.concentration) } : {}),
    initiative: structuredClone(request.initiative),
    command: structuredClone(request.command),
    transformation: {
      hpCarryover: request.transformation.hpCarryover,
      equipmentCarryover: request.transformation.equipmentCarryover,
      snapshot: {
        actor: { name: actor.name, type: actor.type, imageAssetId: actor.imageAssetId, data: snapshotData },
        items: suppressedItems.map((item) => ({ id: item.id, actorId: item.actorId, data: structuredClone(item.data) })),
        combatants: changedCombatants,
      },
    },
    createdAt: now,
    updatedAt: now,
  };
  const nextData = structuredClone(request.actor.data);
  if (request.transformation.hpCarryover === "preserve" && snapshotData.hp !== undefined) nextData.hp = structuredClone(snapshotData.hp);
  actor.name = request.actor.name.trim();
  actor.type = request.actor.type.trim();
  actor.imageAssetId = request.actor.imageAssetId;
  actor.data = dataWithDndControlledCreature(nextData, record);
  actor.updatedAt = revisionAfter(actor.updatedAt, now);
  for (const item of suppressedItems) {
    item.actorId = undefined;
    item.data = { ...structuredClone(item.data), dnd5eTransformationSuppressedBy: record.id };
    item.updatedAt = revisionAfter(item.updatedAt, now);
  }
  return mutationResult("transformed", [record], [actor], [], changedCombats);
}

function controlledInitiative(request: DndControlledCreatureCreateRequest, combat: Combat): number {
  if (request.initiative.mode === "independent") {
    if (!Number.isFinite(request.initiative.value)) throw new Error("Independent initiative is missing.");
    return request.initiative.value!;
  }
  const initiative = request.initiative;
  const source = combat.combatants.find((combatant) => combatant.actorId === initiative.sourceActorId);
  if (!source) throw new Error("Shared initiative source is missing from combat.");
  return source.initiative;
}

function revisionSet(
  state: EngineState,
  ids: {
    actorIds: Set<string>;
    itemIds: Set<string>;
    tokenIds: Set<string>;
    combatIds: Set<string>;
    sceneIds: Set<string>;
    encounterIds: Set<string>;
  },
): DndControlledCreatureRevisionSet {
  return {
    actors: selectedRevisions(state.actors, ids.actorIds),
    items: selectedRevisions(state.items, ids.itemIds),
    tokens: selectedRevisions(state.tokens, ids.tokenIds),
    combats: selectedRevisions(state.combats, ids.combatIds),
    scenes: selectedRevisions(state.scenes, ids.sceneIds),
    encounters: selectedRevisions(state.encounters, ids.encounterIds),
  };
}

function emptyRevisionSet(): DndControlledCreatureRevisionSet {
  return { actors: {}, items: {}, tokens: {}, combats: {}, scenes: {}, encounters: {} };
}

function selectedRevisions<T extends { id: string; updatedAt: string }>(records: T[], ids: Set<string>): Record<string, string> {
  return Object.fromEntries(records.filter((record) => ids.has(record.id)).sort((left, right) => left.id.localeCompare(right.id)).map((record) => [record.id, record.updatedAt]));
}

function recordsForRevisionCollection(state: EngineState, collection: RevisionCollection): Array<{ id: string; updatedAt: string }> {
  return state[collection];
}

function mutationResult(
  action: DndControlledCreatureMutationResult["action"],
  records: DndControlledCreatureRecord[],
  actors: Actor[],
  tokens: Token[],
  combats: Combat[],
  removedActorIds: string[] = [],
  removedTokenIds: string[] = [],
): DndControlledCreatureMutationResult {
  return { action, records, actors, tokens, combats: uniqueById(combats), removedActorIds, removedTokenIds };
}

function previewSummary(request: DndControlledCreatureCreateRequest, reviews: number, errors: number): string {
  const label = request.kind === "persistent_companion" ? "persistent companion" : request.kind;
  if (errors > 0) return `${label} preview has ${errors} blocking validation issue${errors === 1 ? "" : "s"}.`;
  if (reviews > 0 && request.manualReviewConfirmed !== true) return `${label} preview requires ${reviews} explicit manual review${reviews === 1 ? "" : "s"}.`;
  return `${label} preview is ready to confirm.`;
}

function revisionAfter(current: string, candidate = nowIso()): string {
  const currentMs = Date.parse(current);
  const candidateMs = Date.parse(candidate);
  return new Date(Math.max(Number.isFinite(currentMs) ? currentMs + 1 : 0, Number.isFinite(candidateMs) ? candidateMs : Date.now())).toISOString();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
