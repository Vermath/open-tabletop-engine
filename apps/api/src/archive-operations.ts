import { createHash } from "node:crypto";
import { createId, createTimestamped, emptyState, normalizeEngineState, nowIso, type Actor, type Campaign, type CampaignMember, type CampaignArchive, type CampaignArchiveFile, type Combat, type ContentImportAppliedRecord, type ContentImportEntity, type ContentImportEntityKind, type ContentImportSource, type Encounter, type EngineState, type Handout, type Item, type JournalEntry, type MapAsset, type PermissionName, type Proposal, type ProposalChange, type Scene, type Token, type User, type World } from "@open-tabletop/core";
import { assetStorageKey, type AssetStorage } from "./asset-storage.js";
import { type ArchiveAssetRestoreTransaction } from "./archive-asset-restore.js";
import { campaignArchiveEmbeddedAssetMaxBytes } from "./archive-validation.js";
import { findRegisteredSystem } from "./registries.js";
import { type StateStore } from "./store.js";

const ALL_PERMISSIONS: PermissionName[] = [
  "campaign.read", "campaign.update", "campaign.delete", "world.read", "world.create", "world.update", "world.delete",
  "scene.read", "scene.create", "scene.update", "scene.delete", "scene.activate", "token.read", "token.create", "token.update",
  "token.move", "token.delete", "token.reveal", "actor.read", "actor.create", "actor.update", "actor.delete", "actor.readPrivate",
  "actor.updateOwned", "journal.read", "journal.readSecret", "journal.create", "journal.update", "journal.delete", "handout.read",
  "handout.readSecret", "handout.create", "handout.update", "handout.delete", "chat.read", "chat.write", "chat.moderate",
  "combat.manage", "plugin.install", "plugin.configure", "dice.roll", "ai.use", "ai.readPublicMemory", "ai.readGmMemory",
  "ai.proposeChanges", "ai.applyChanges",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordFromRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function visibilityFromRecord(record: Record<string, unknown>, key: string, fallback: JournalEntry["visibility"]): JournalEntry["visibility"] {
  const value = record[key];
  return value === "public" || value === "gm_only" ? value : fallback;
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

interface ArchiveReferenceRuntime {
  hasSystemRuntimeCapability(systemId: string, capability: "encounter-builder"): boolean;
  normalizedEncounterThreatSelections(
    value: unknown,
    systemId: string,
  ): { ok: true; value: Array<{ id: string; count: number }> } | { ok: false; error: string };
}

export async function withArchivedAssetFiles(archive: CampaignArchive, assetStorage: AssetStorage): Promise<CampaignArchive> {
  const files: CampaignArchiveFile[] = [];
  let embeddedBytes = 0;
  const aggregateLimit = campaignArchiveEmbeddedAssetMaxBytes();
  for (const asset of archive.data.assets) {
    const file = await archiveAssetFile(assetStorage, asset, aggregateLimit - embeddedBytes);
    if (!file) continue;
    embeddedBytes += file.sizeBytes;
    if (embeddedBytes > aggregateLimit) {
      throw new CampaignArchiveExportSizeError("Campaign archive embedded assets exceed the configured aggregate limit");
    }
    files.push(file);
  }
  return {
    ...archive,
    manifest: {
      ...archive.manifest,
      assetFileCount: files.length
    },
    files
  };
}

export class CampaignArchiveExportSizeError extends Error {}

export const exportSelectableArchiveCollections = [
  "worlds",
  "worldRecords",
  "worldRelations",
  "assets",
  "scenes",
  "tokens",
  "actors",
  "calculationOverrides",
  "characterTransfers",
  "items",
  "journals",
  "handouts",
  "chat",
  "rolls",
  "diceMacros",
  "audioTracks",
  "encounters",
  "campaignSessions",
  "combats",
  "compendia",
  "proposals",
  "aiThreads",
  "aiEvaluations",
  "aiMemory",
  "aiToolCalls",
  "auditLogs",
  "permissionGrants",
  "pluginStorage",
  "contentImports",
  "fogPresets"
] as const satisfies ReadonlyArray<keyof EngineState>;

export type ExportSelectableArchiveCollection = (typeof exportSelectableArchiveCollections)[number];
export type CampaignArchiveExportOptions = {
  scope: "campaign" | "world" | "selected_collections";
  scopeId?: string;
  collections?: ExportSelectableArchiveCollection[];
  version: "0.2.0";
  redaction: "portable";
};

export function normalizeCampaignArchiveExportOptions(query: {
  scope?: string;
  scopeId?: string;
  collections?: string;
  version?: string;
  redaction?: string;
}): { ok: true; value: CampaignArchiveExportOptions } | { ok: false; error: string } {
  const scope = query.scope ?? "campaign";
  const version = query.version ?? "0.2.0";
  const redaction = query.redaction ?? "portable";
  if (scope !== "campaign" && scope !== "world" && scope !== "selected_collections") {
    return { ok: false, error: "Campaign archive export scope must be campaign, world, or selected_collections" };
  }
  if (version !== "0.2.0") return { ok: false, error: "Campaign archive export version must be 0.2.0" };
  if (redaction !== "portable") return { ok: false, error: "Campaign archive redaction must be portable" };
  const scopeId = query.scopeId?.trim();
  if (scope === "world" && !scopeId) return { ok: false, error: "World archive export requires scopeId" };
  if (scope !== "world" && query.scopeId !== undefined) return { ok: false, error: "scopeId is supported only for world exports" };
  const requestedCollections = query.collections
    ? [...new Set(query.collections.split(",").map((collection) => collection.trim()).filter(Boolean))]
    : [];
  if (scope === "selected_collections" && requestedCollections.length === 0) return { ok: false, error: "selected_collections export requires collections" };
  const unsupportedCollection = requestedCollections.find((collection) => !exportSelectableArchiveCollections.includes(collection as ExportSelectableArchiveCollection));
  if (unsupportedCollection) return { ok: false, error: `Unsupported export collection: ${unsupportedCollection}` };
  if (scope !== "selected_collections" && requestedCollections.length > 0) return { ok: false, error: "collections is supported only for selected_collections exports" };
  return {
    ok: true,
    value: {
      scope,
      ...(scopeId ? { scopeId } : {}),
      ...(requestedCollections.length > 0 ? { collections: requestedCollections as ExportSelectableArchiveCollection[] } : {}),
      version,
      redaction
    }
  };
}

export function campaignArchiveCompatibilityNotes(options: CampaignArchiveExportOptions): string[] {
  return [
    options.scope === "campaign"
      ? "Scope campaign: exports one campaign and all related portable tabletop records."
      : options.scope === "world"
        ? `Scope world: exports world ${options.scopeId} with its dependency-closed scenes, tokens, actors, content, assets, sessions, and audit records.`
        : `Scope selected_collections: exports the campaign identity shell plus ${options.collections?.join(", ") ?? "no"} selected record collections and their referenced dependency records.`,
    `Archive ${options.version}: supported by the current v0.3/v1-compatible importer.`,
    `Redaction ${options.redaction}: strips account secrets, sessions, MFA, SCIM sources, plugin reviews, idempotency records, jobs, and organization records while preserving playable campaign content.`
  ];
}

export function addArchiveRecordsById(
  data: EngineState,
  source: EngineState,
  collection: ExportSelectableArchiveCollection,
  ids: Iterable<string>
): boolean {
  const wanted = new Set(ids);
  if (wanted.size === 0) return false;
  const targetRecords = data[collection] as unknown as Array<{ id: string }>;
  const sourceRecords = source[collection] as unknown as Array<{ id: string }>;
  const existingIds = new Set(targetRecords.map((record) => record.id));
  const additions = sourceRecords.filter((record) => wanted.has(record.id) && !existingIds.has(record.id));
  if (additions.length === 0) return false;
  targetRecords.push(...structuredClone(additions));
  return true;
}

/**
 * Adds records directly referenced by the records already present in `data`.
 * This is deliberately a forward-reference closure: selecting a world does not
 * silently pull every scene in that world, while selecting a token does pull
 * the scene, actor, and image it needs to remain usable after import.
 */
export function closeArchiveRecordDependencies(data: EngineState, source: EngineState): Set<ExportSelectableArchiveCollection> {
  const addedCollections = new Set<ExportSelectableArchiveCollection>();
  const add = (collection: ExportSelectableArchiveCollection, ids: Iterable<string>) => {
    const changed = addArchiveRecordsById(data, source, collection, ids);
    if (changed) addedCollections.add(collection);
    return changed;
  };
  const proposalEntityCollections: Partial<Record<ProposalChange["entity"], ExportSelectableArchiveCollection>> = {
    world: "worlds",
    scene: "scenes",
    token: "tokens",
    actor: "actors",
    item: "items",
    journal: "journals",
    handout: "handouts",
    chat: "chat",
    roll: "rolls",
    diceMacro: "diceMacros",
    encounter: "encounters",
    combat: "combats",
    asset: "assets",
    fogPreset: "fogPresets",
    pluginStorage: "pluginStorage"
  };

  let changed = true;
  while (changed) {
    changed = false;
    const worldIds = [
      ...data.worldRecords.map((record) => record.worldId),
      ...data.worldRelations.map((record) => record.worldId),
      ...data.scenes.map((record) => record.worldId),
      ...data.actors.map((record) => record.worldId),
      ...data.items.map((record) => record.worldId),
      ...data.journals.map((record) => record.worldId),
      ...data.handouts.map((record) => record.worldId),
      ...data.encounters.map((record) => record.worldId),
      ...data.aiMemory.map((record) => record.worldId)
    ].filter((id): id is string => Boolean(id));
    changed = add("worlds", worldIds) || changed;

    const worldRecordIds = data.worldRelations.flatMap((relation) => [relation.sourceRecordId, relation.targetRecordId]);
    changed = add("worldRecords", worldRecordIds) || changed;
    const selectedWorldRecordIds = new Set(data.worldRecords.map((record) => record.id));
    const relatedRelationIds = source.worldRelations
      .filter((relation) => selectedWorldRecordIds.has(relation.sourceRecordId) && selectedWorldRecordIds.has(relation.targetRecordId))
      .map((relation) => relation.id);
    changed = add("worldRelations", relatedRelationIds) || changed;

    const sceneIds = [
      ...data.tokens.map((record) => record.sceneId),
      ...data.chat.map((record) => record.sceneId),
      ...data.fogPresets.map((record) => record.sourceSceneId),
      ...data.campaignSessions.flatMap((record) => record.sceneIds)
    ].filter((id): id is string => Boolean(id));
    changed = add("scenes", sceneIds) || changed;

    const tokenIds = [
      ...data.encounters.flatMap((record) => record.tokenIds),
      ...data.combats.flatMap((record) => record.combatants.map((combatant) => combatant.tokenId))
    ];
    changed = add("tokens", tokenIds) || changed;

    const actorIds = [
      ...data.calculationOverrides.map((record) => record.actorId),
      ...data.tokens.map((record) => record.actorId),
      ...data.items.map((record) => record.actorId),
      ...data.journals.flatMap((record) => record.visibleToActorIds),
      ...data.handouts.flatMap((record) => record.visibleToActorIds ?? []),
      ...data.encounters.flatMap((record) => record.partyActorIds ?? []),
      ...data.combats.flatMap((record) => record.combatants.map((combatant) => combatant.actorId)),
      ...data.combats.flatMap((record) => record.actions?.flatMap((action) => [action.actorId, ...action.targetActorIds]) ?? [])
    ].filter((id): id is string => Boolean(id));
    changed = add("actors", actorIds) || changed;
    const selectedActorIds = new Set(data.actors.map((actor) => actor.id));
    const calculationOverrideIds = source.calculationOverrides.filter((override) => selectedActorIds.has(override.actorId)).map((override) => override.id);
    changed = add("calculationOverrides", calculationOverrideIds) || changed;

    const itemIds = data.combats.flatMap((record) => record.actions?.flatMap((action) => action.itemUpdates?.map((update) => update.itemId) ?? []) ?? []);
    changed = add("items", itemIds) || changed;

    const journalIds = [
      ...data.journals.map((record) => record.parentId),
      ...data.campaignSessions.map((record) => record.recapJournalId)
    ].filter((id): id is string => Boolean(id));
    changed = add("journals", journalIds) || changed;

    const encounterIds = [
      ...data.campaignSessions.flatMap((record) => record.encounterIds),
      ...data.combats.map((record) => record.encounterId)
    ].filter((id): id is string => Boolean(id));
    changed = add("encounters", encounterIds) || changed;

    const rollIds = [
      ...data.chat.map((record) => record.rollId),
      ...data.combats.flatMap((record) => record.actions?.map((action) => action.rollId) ?? [])
    ].filter((id): id is string => Boolean(id));
    changed = add("rolls", rollIds) || changed;

    const messageIds = data.chat.map((record) => record.replyToMessageId).filter((id): id is string => Boolean(id));
    changed = add("chat", messageIds) || changed;

    const proposalIds = data.campaignSessions.map((record) => record.recapProposalId).filter((id): id is string => Boolean(id));
    changed = add("proposals", proposalIds) || changed;
    for (const proposal of data.proposals) {
      for (const change of proposal.changesJson) {
        const collection = proposalEntityCollections[change.entity];
        const id = change.id ?? (typeof change.data.id === "string" ? change.data.id : undefined);
        if (collection && id) changed = add(collection, [id]) || changed;
      }
    }

    const threadIds = [
      ...data.aiEvaluations.map((record) => record.threadId),
      ...data.aiToolCalls.map((record) => record.threadId),
      ...data.proposals.filter((record) => record.createdByType === "ai").map((record) => record.sourceId)
    ].filter((id): id is string => Boolean(id));
    changed = add("aiThreads", threadIds) || changed;

    for (const batch of data.contentImports) {
      for (const applied of batch.appliedRecords) {
        changed = add(applied.collection, [applied.id]) || changed;
      }
    }

    const assetIds = [
      ...data.scenes.map((record) => record.backgroundAssetId),
      ...data.tokens.map((record) => record.imageAssetId),
      ...data.actors.map((record) => record.imageAssetId),
      ...data.handouts.flatMap((record) => record.assetIds ?? [])
    ].filter((id): id is string => Boolean(id));
    changed = add("assets", assetIds) || changed;
  }
  return addedCollections;
}

export function archiveForExportScope(
  archive: CampaignArchive,
  options: CampaignArchiveExportOptions
): { ok: true; archive: CampaignArchive; dependencyWarnings: string[] } | { ok: false; error: string; notFound?: boolean } {
  if (options.scope === "campaign") return { ok: true, archive, dependencyWarnings: [] };
  if (options.scope === "selected_collections") {
    const collections = options.collections ?? [];
    const data = emptyState();
    data.users = structuredClone(archive.data.users);
    data.campaigns = structuredClone(archive.data.campaigns);
    data.members = structuredClone(archive.data.members);
    for (const collection of collections) {
      (data[collection] as Array<{ id: string }>) = structuredClone(archive.data[collection] as Array<{ id: string }>);
    }
    closeArchiveRecordDependencies(data, archive.data);
    const selectedForWarnings = operatorSelectableArchiveCollections.filter((collection) => (data[collection] as Array<{ id: string }>).length > 0);
    const dependencyWarnings = archiveImportDependencyWarnings("selected_collections", selectedForWarnings, archive);
    const assetIds = new Set(data.assets.map((asset) => asset.id));
    return {
      ok: true,
      dependencyWarnings,
      archive: {
        ...archive,
        manifest: { ...archive.manifest, assetCount: data.assets.length },
        data,
        files: archive.files?.filter((file) => assetIds.has(file.assetId)) ?? []
      }
    };
  }

  const worldId = options.scopeId!;
  const world = archive.data.worlds.find((item) => item.id === worldId);
  if (!world) return { ok: false, error: "World not found", notFound: true };
  const data = emptyState();
  data.users = structuredClone(archive.data.users);
  data.campaigns = structuredClone(archive.data.campaigns);
  data.members = structuredClone(archive.data.members);
  data.permissionGrants = structuredClone(archive.data.permissionGrants);
  data.worlds = [structuredClone(world)];
  data.worldRecords = archive.data.worldRecords.filter((record) => record.worldId === worldId);
  const scopedWorldRecordIds = new Set(data.worldRecords.map((record) => record.id));
  data.worldRelations = archive.data.worldRelations.filter(
    (relation) => relation.worldId === worldId || (scopedWorldRecordIds.has(relation.sourceRecordId) && scopedWorldRecordIds.has(relation.targetRecordId)),
  );
  data.scenes = archive.data.scenes.filter((scene) => scene.worldId === worldId);
  const sceneIds = new Set(data.scenes.map((scene) => scene.id));
  data.tokens = archive.data.tokens.filter((token) => sceneIds.has(token.sceneId));
  const tokenIds = new Set(data.tokens.map((token) => token.id));
  data.encounters = archive.data.encounters.filter((encounter) => encounter.worldId === worldId || encounter.tokenIds.some((id) => tokenIds.has(id)));
  const linkedActorIds = new Set(
    [
      ...data.tokens.map((token) => token.actorId),
      ...data.encounters.flatMap((encounter) => encounter.partyActorIds ?? [])
    ].filter((id): id is string => Boolean(id))
  );
  data.actors = archive.data.actors.filter((actor) => actor.worldId === worldId || linkedActorIds.has(actor.id));
  const actorIds = new Set(data.actors.map((actor) => actor.id));
  data.calculationOverrides = archive.data.calculationOverrides.filter((override) => actorIds.has(override.actorId));
  data.items = archive.data.items.filter((item) => item.worldId === worldId || (item.actorId !== undefined && actorIds.has(item.actorId)));
  data.journals = archive.data.journals.filter((journal) => journal.worldId === worldId);
  const journalIds = new Set(data.journals.map((journal) => journal.id));
  let addedJournal = true;
  while (addedJournal) {
    const before = journalIds.size;
    for (const journal of archive.data.journals) {
      if (journalIds.has(journal.id) && journal.parentId) journalIds.add(journal.parentId);
    }
    addedJournal = journalIds.size > before;
  }
  data.journals = archive.data.journals.filter((journal) => journalIds.has(journal.id));
  data.handouts = archive.data.handouts.filter((handout) => handout.worldId === worldId);
  const encounterIds = new Set(data.encounters.map((encounter) => encounter.id));
  data.combats = archive.data.combats.filter(
    (combat) => (combat.encounterId !== undefined && encounterIds.has(combat.encounterId)) || combat.combatants.some((combatant) => tokenIds.has(combatant.tokenId) || (combatant.actorId !== undefined && actorIds.has(combatant.actorId)))
  );
  data.campaignSessions = archive.data.campaignSessions.filter((session) => {
    const hasScopedReference = session.sceneIds.some((id) => sceneIds.has(id)) || session.encounterIds.some((id) => encounterIds.has(id));
    return hasScopedReference && session.sceneIds.every((id) => sceneIds.has(id)) && session.encounterIds.every((id) => encounterIds.has(id));
  });
  data.chat = archive.data.chat.filter((message) => message.sceneId !== undefined && sceneIds.has(message.sceneId));
  const rollIds = new Set(data.chat.map((message) => message.rollId).filter((id): id is string => Boolean(id)));
  data.rolls = archive.data.rolls.filter((roll) => rollIds.has(roll.id));
  data.fogPresets = archive.data.fogPresets.filter((preset) => preset.sourceSceneId !== undefined && sceneIds.has(preset.sourceSceneId));
  data.aiMemory = archive.data.aiMemory.filter((fact) => fact.worldId === worldId);
  const includedIds = new Set<string>([
    worldId,
    ...sceneIds,
    ...tokenIds,
    ...actorIds,
    ...data.worldRecords.map((record) => record.id),
    ...data.worldRelations.map((relation) => relation.id),
    ...data.calculationOverrides.map((override) => override.id),
    ...data.items.map((item) => item.id),
    ...journalIds,
    ...data.handouts.map((handout) => handout.id),
    ...encounterIds,
    ...data.combats.map((combat) => combat.id),
    ...data.campaignSessions.map((session) => session.id),
    ...data.chat.map((message) => message.id),
    ...rollIds,
    ...data.aiMemory.map((fact) => fact.id),
    ...data.fogPresets.map((preset) => preset.id)
  ]);
  data.proposals = archive.data.proposals.filter(
    (proposal) =>
      proposal.changesJson.length > 0 &&
      proposal.changesJson.every((change) => {
      const id = change.id ?? (typeof change.data.id === "string" ? change.data.id : undefined);
      return change.data.worldId === worldId || (id !== undefined && includedIds.has(id));
      })
  );
  const threadIds = new Set(data.proposals.map((proposal) => proposal.sourceId).filter((id): id is string => Boolean(id)));
  data.aiThreads = archive.data.aiThreads.filter((thread) => threadIds.has(thread.id));
  data.aiToolCalls = archive.data.aiToolCalls.filter((call) => threadIds.has(call.threadId));
  data.aiEvaluations = archive.data.aiEvaluations.filter((evaluation) => threadIds.has(evaluation.threadId));
  for (const proposal of data.proposals) includedIds.add(proposal.id);
  for (const thread of data.aiThreads) includedIds.add(thread.id);
  data.auditLogs = archive.data.auditLogs.filter((log) => log.targetId !== undefined && includedIds.has(log.targetId));
  closeArchiveRecordDependencies(data, archive.data);
  const assetIds = new Set<string>();
  for (const scene of data.scenes) if (scene.backgroundAssetId) assetIds.add(scene.backgroundAssetId);
  for (const token of data.tokens) if (token.imageAssetId) assetIds.add(token.imageAssetId);
  for (const actor of data.actors) if (actor.imageAssetId) assetIds.add(actor.imageAssetId);
  for (const handout of data.handouts) for (const assetId of handout.assetIds ?? []) assetIds.add(assetId);
  data.assets = archive.data.assets.filter((asset) => assetIds.has(asset.id));
  const scopedArchive: CampaignArchive = {
    ...archive,
    manifest: { ...archive.manifest, name: `${archive.manifest.name} - ${world.name}`, assetCount: data.assets.length },
    data,
    files: archive.files?.filter((file) => assetIds.has(file.assetId)) ?? []
  };
  return { ok: true, archive: scopedArchive, dependencyWarnings: [] };
}

export async function archiveAssetFile(assetStorage: AssetStorage, asset: MapAsset, maxBytes: number): Promise<CampaignArchiveFile | undefined> {
  if (!asset.url.startsWith("/api/v1/assets/")) return undefined;
  const stream = await assetStorage.stream?.(asset);
  if (stream) {
    const hash = createHash("sha256");
    const encodedChunks: string[] = [];
    let carry = Buffer.alloc(0);
    let sizeBytes = 0;
    for await (const value of stream as AsyncIterable<Buffer | Uint8Array | string>) {
      const chunk = typeof value === "string" ? Buffer.from(value) : Buffer.from(value);
      sizeBytes += chunk.length;
      if (sizeBytes > maxBytes) throw new CampaignArchiveExportSizeError("Campaign archive embedded assets exceed the configured aggregate limit");
      hash.update(chunk);
      const combined = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
      const completeBytes = combined.length - (combined.length % 3);
      if (completeBytes > 0) encodedChunks.push(combined.subarray(0, completeBytes).toString("base64"));
      carry = completeBytes < combined.length ? Buffer.from(combined.subarray(completeBytes)) : Buffer.alloc(0);
    }
    if (carry.length > 0) encodedChunks.push(carry.toString("base64"));
    return {
      assetId: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes,
      checksum: `sha256:${hash.digest("hex")}`,
      encoding: "base64",
      // A JSON archive necessarily owns one final base64 string. Keeping
      // bounded encoded chunks avoids repeatedly copying the complete prefix
      // for every storage-stream chunk (the former `data += chunk` path).
      data: encodedChunks.join("")
    };
  }
  const body = await assetStorage.read(asset);
  if (!body) return undefined;
  if (body.length > maxBytes) throw new CampaignArchiveExportSizeError("Campaign archive embedded assets exceed the configured aggregate limit");
  return {
    assetId: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: body.length,
    checksum: checksumForBuffer(body),
    encoding: "base64",
    data: body.toString("base64")
  };
}

export async function rollbackCampaignArchiveImport(
  store: StateStore,
  stateBeforeImport: EngineState,
  assetRestore: ArchiveAssetRestoreTransaction,
  originalError: unknown
): Promise<never> {
  const rollbackFailures: Error[] = [];

  try {
    if (store.restoreDurableState) store.restoreDurableState();
    else {
      store.replace(stateBeforeImport);
      store.flush?.();
    }
  } catch (error) {
    // replace() implementations set their in-memory state before flushing. Set
    // it explicitly as well so custom stores cannot leave a partially merged
    // campaign visible when their durability layer throws first.
    store.state = stateBeforeImport;
    rollbackFailures.push(normalizeArchiveImportError(error));
  }

  try {
    await assetRestore.rollback();
  } catch (error) {
    rollbackFailures.push(normalizeArchiveImportError(error));
  }

  if (rollbackFailures.length > 0) {
    const original = normalizeArchiveImportError(originalError);
    const failure = new Error(`Campaign archive import failed and rollback was incomplete: ${original.message}; ${rollbackFailures.map((item) => item.message).join("; ")}`);
    failure.cause = original;
    throw failure;
  }
  throw originalError;
}

export function normalizeArchiveImportError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function checksumForBuffer(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

export function isSupportedArchiveVersion(version: string): boolean {
  return version === "0.1.0" || version === "0.2.0";
}

export function isArchiveImportMode(mode: string): mode is "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run" {
  return mode === "upsert" || mode === "reject_conflicts" || mode === "skip_conflicts" || mode === "dry_run";
}

export function isArchiveImportScope(scope: string): scope is "all" | "assets_only" | "selected_collections" {
  return scope === "all" || scope === "assets_only" || scope === "selected_collections";
}

export function normalizeArchiveForImport(archive: CampaignArchive, organizationId: string): CampaignArchive {
  const data = archive.data as Partial<EngineState>;
  const campaigns = (data.campaigns ?? []).map((campaign) => ({
    ...campaign,
    organizationId
  }));
  const users = (data.users ?? []).map(({ serverAdmin: _serverAdmin, ...user }) => user);
  return {
    ...archive,
    files: archive.files ?? [],
    data: normalizeEngineState({
      ...emptyState(),
      ...data,
      users,
      campaigns,
      sessions: [],
      identities: [],
      oauthStates: [],
      passwordResetTokens: [],
      emailOutbox: [],
      scimGroups: data.scimGroups ?? [],
      scimGroupRoleMappings: data.scimGroupRoleMappings ?? [],
      invites: data.invites ?? [],
      pluginReviews: [],
      systemInstallations: [],
      contentImports: data.contentImports ?? [],
      campaignArchiveImportOperations: []
    })
  };
}

export function normalizeContentImportSource(source: Partial<Omit<ContentImportSource, "submittedByUserId" | "submittedAt">> | undefined, submittedByUserId: string): ContentImportSource {
  const submittedAt = nowIso();
  return {
    sourceType: source?.sourceType ?? "manual",
    adapterId: source?.adapterId,
    sourceName: source?.sourceName?.trim() || "User-provided content",
    sourceUrl: source?.sourceUrl,
    submittedByUserId,
    submittedAt,
    license: {
      name: source?.license?.name?.trim() || "User-provided private table content",
      url: source?.license?.url,
      usage: source?.license?.usage ?? "user_provided",
      attribution: source?.license?.attribution
    },
    notes: source?.notes
  };
}

export function normalizeContentImportEntity(input: Partial<ContentImportEntity> & { kind: ContentImportEntityKind; name: string }, source: ContentImportSource): ContentImportEntity {
  if (!["actor", "item", "journal", "handout", "encounter"].includes(input.kind)) throw new Error(`Unsupported content import entity kind: ${input.kind}`);
  const id = input.id?.trim() || createId("cie");
  const warnings = [...(input.warnings ?? []), ...contentImportEntityWarnings(input, source)];
  return {
    id,
    kind: input.kind,
    name: input.name.trim() || "Untitled Import",
    selectedByDefault: input.selectedByDefault ?? true,
    provenance: source,
    data: input.data ?? {},
    warnings: [...new Set(warnings)]
  };
}

export function contentImportEntityWarnings(input: Pick<ContentImportEntity, "kind" | "name">, source: ContentImportSource): string[] {
  const warnings: string[] = [];
  if (source.sourceUrl?.toLowerCase().includes("dndbeyond.com") || source.adapterId?.toLowerCase().includes("dndbeyond")) {
    warnings.push("external_service_boundary_no_scraping_or_auth_bypass");
  }
  if (source.license.usage === "private_home_game") warnings.push("private_home_game_not_redistributable");
  if (input.kind === "actor" && source.license.usage !== "srd" && source.sourceType === "adapter") warnings.push("verify_actor_source_license_before_distribution");
  return warnings;
}

export function applyContentImportEntity(state: EngineState, campaign: Campaign, entity: ContentImportEntity, userId: string): ContentImportAppliedRecord {
  const recordId = contentImportRecordId(campaign.id, entity);
  if (state.actors.some((item) => item.id === recordId) || state.items.some((item) => item.id === recordId) || state.journals.some((item) => item.id === recordId) || state.handouts.some((item) => item.id === recordId) || state.encounters.some((item) => item.id === recordId)) {
    throw new Error(`Imported record already exists: ${recordId}`);
  }

  if (entity.kind === "actor") {
    const actor = createTimestamped("act", {
      id: recordId,
      campaignId: campaign.id,
      worldId: stringFromRecord(entity.data, "worldId"),
      systemId: stringFromRecord(entity.data, "systemId") ?? campaign.defaultSystemId,
      ownerUserId: stringFromRecord(entity.data, "ownerUserId"),
      type: stringFromRecord(entity.data, "type") ?? "npc",
      name: entity.name,
      imageAssetId: stringFromRecord(entity.data, "imageAssetId"),
      data: recordFromRecord(entity.data, "data") ?? { ...entity.data, provenance: entity.provenance },
      permissions: recordOfStringArrayFromRecord(entity.data, "permissions") ?? {
        [userId]: ["actor.read", "actor.readPrivate", "actor.update"]
      }
    }) satisfies Actor;
    state.actors.push(actor);
    return appliedContentImportRecord("actors", entity.id, actor);
  }

  if (entity.kind === "item") {
    const item = createTimestamped("item", {
      id: recordId,
      campaignId: campaign.id,
      worldId: stringFromRecord(entity.data, "worldId"),
      systemId: stringFromRecord(entity.data, "systemId") ?? campaign.defaultSystemId,
      actorId: stringFromRecord(entity.data, "actorId"),
      type: stringFromRecord(entity.data, "type") ?? "loot",
      name: entity.name,
      data: recordFromRecord(entity.data, "data") ?? { ...entity.data, provenance: entity.provenance }
    }) satisfies Item;
    state.items.push(item);
    return appliedContentImportRecord("items", entity.id, item);
  }

  if (entity.kind === "journal") {
    const journal = createTimestamped("jnl", {
      id: recordId,
      campaignId: campaign.id,
      worldId: stringFromRecord(entity.data, "worldId"),
      parentId: stringFromRecord(entity.data, "parentId"),
      title: entity.name,
      body: stringFromRecord(entity.data, "body") ?? "",
      visibility: visibilityFromRecord(entity.data, "visibility", "gm_only"),
      visibleToUserIds: stringArrayFromRecord(entity.data, "visibleToUserIds"),
      visibleToActorIds: stringArrayFromRecord(entity.data, "visibleToActorIds"),
      tags: stringArrayFromRecord(entity.data, "tags").length > 0 ? stringArrayFromRecord(entity.data, "tags") : ["content-import"],
      kind: "entry" as const,
      links: [],
      revision: 1,
      revisions: [],
      canonStatus: "draft" as const,
      createdBy: userId,
      updatedBy: userId
    }) satisfies JournalEntry;
    state.journals.push(journal);
    return appliedContentImportRecord("journals", entity.id, journal);
  }

  if (entity.kind === "encounter") {
    const encounter = createTimestamped("enc", {
      id: recordId,
      campaignId: campaign.id,
      worldId: stringFromRecord(entity.data, "worldId"),
      name: entity.name,
      summary: stringFromRecord(entity.data, "summary") ?? stringFromRecord(entity.data, "body") ?? "",
      tokenIds: stringArrayFromRecord(entity.data, "tokenIds"),
      difficulty: stringFromRecord(entity.data, "difficulty")
    }) satisfies Encounter;
    state.encounters.push(encounter);
    return appliedContentImportRecord("encounters", entity.id, encounter);
  }

  const handout = createTimestamped("hnd", {
    id: recordId,
    campaignId: campaign.id,
    worldId: stringFromRecord(entity.data, "worldId"),
    title: entity.name,
    body: stringFromRecord(entity.data, "body") ?? "",
    visibility: visibilityFromRecord(entity.data, "visibility", "gm_only"),
    visibleToUserIds: stringArrayFromRecord(entity.data, "visibleToUserIds"),
    visibleToActorIds: stringArrayFromRecord(entity.data, "visibleToActorIds"),
    assetIds: stringArrayFromRecord(entity.data, "assetIds"),
    tags: stringArrayFromRecord(entity.data, "tags"),
    readByUserIds: [],
    createdBy: userId,
    updatedBy: userId
  });
  state.handouts.push(handout);
  return appliedContentImportRecord("handouts", entity.id, handout);
}

export interface ContentImportRollbackDependency {
  collection: keyof EngineState;
  id: string;
  field: string;
}

export interface ContentImportRollbackConflict {
  collection: ContentImportAppliedRecord["collection"];
  id: string;
  entityId: string;
  reason: "duplicate_record" | "fingerprint_unavailable" | "record_modified" | "dependent_reference";
  expectedFingerprint?: string;
  currentFingerprint?: string;
  dependencies?: ContentImportRollbackDependency[];
}

function appliedContentImportRecord(
  collection: ContentImportAppliedRecord["collection"],
  entityId: string,
  record: { id: string },
): ContentImportAppliedRecord {
  return { collection, id: record.id, entityId, fingerprint: contentImportRecordFingerprint(record) };
}

/**
 * Hash the complete imported record, including its revision timestamps. A
 * semantically reverted edit still advances the revision and therefore remains
 * user-owned instead of becoming eligible for destructive rollback again.
 */
export function contentImportRecordFingerprint(record: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalContentImportValue(record)) ?? "null").digest("hex")}`;
}

function canonicalContentImportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalContentImportValue(entry));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalContentImportValue(value[key])]),
  );
}

function nestedContentImportValueContainsExactString(value: unknown, expected: string, seen = new Set<object>()): boolean {
  if (value === expected) return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>))
    .some((entry) => nestedContentImportValueContainsExactString(entry, expected, seen));
}

function appliedContentImportCollection(state: EngineState, collection: ContentImportAppliedRecord["collection"]): Array<{ id: string }> {
  return collection === "actors"
    ? state.actors
    : collection === "items"
      ? state.items
      : collection === "journals"
        ? state.journals
        : collection === "handouts"
          ? state.handouts
          : state.encounters;
}

/**
 * Preflight an entire rollback before any record is removed. Dependencies on
 * another unchanged record in the same rollback are safe because both records
 * disappear atomically; every other reference blocks the rollback.
 */
export function contentImportRollbackConflicts(state: EngineState, campaignId: string, records: ContentImportAppliedRecord[]): ContentImportRollbackConflict[] {
  const conflicts: ContentImportRollbackConflict[] = [];
  const removing = new Set(records.map((record) => `${record.collection}:${record.id}`));
  const removingActorIds = records.filter((record) => record.collection === "actors").map((record) => record.id);
  const seen = new Set<string>();
  const dependencies = new Map<string, ContentImportRollbackDependency[]>();
  const addDependency = (
    targetCollection: ContentImportAppliedRecord["collection"],
    targetId: string | undefined,
    ownerCollection: keyof EngineState,
    ownerId: string,
    field: string,
  ): void => {
    if (!targetId || !removing.has(`${targetCollection}:${targetId}`) || removing.has(`${String(ownerCollection)}:${ownerId}`)) return;
    const key = `${targetCollection}:${targetId}`;
    const current = dependencies.get(key) ?? [];
    if (!current.some((dependency) => dependency.collection === ownerCollection && dependency.id === ownerId && dependency.field === field)) {
      current.push({ collection: ownerCollection, id: ownerId, field });
      dependencies.set(key, current);
    }
  };

  for (const record of records) {
    const key = `${record.collection}:${record.id}`;
    if (seen.has(key)) {
      conflicts.push({ collection: record.collection, id: record.id, entityId: record.entityId, reason: "duplicate_record" });
      continue;
    }
    seen.add(key);
    const current = appliedContentImportCollection(state, record.collection).find((candidate) => candidate.id === record.id);
    if (!current) continue;
    if (!record.fingerprint) {
      conflicts.push({ collection: record.collection, id: record.id, entityId: record.entityId, reason: "fingerprint_unavailable" });
      continue;
    }
    const currentFingerprint = contentImportRecordFingerprint(current);
    if (currentFingerprint !== record.fingerprint) {
      conflicts.push({ collection: record.collection, id: record.id, entityId: record.entityId, reason: "record_modified", expectedFingerprint: record.fingerprint, currentFingerprint });
    }
  }

  const campaignSceneIds = new Set(state.scenes.filter((scene) => scene.campaignId === campaignId).map((scene) => scene.id));
  for (const token of state.tokens.filter((token) => campaignSceneIds.has(token.sceneId))) addDependency("actors", token.actorId, "tokens", token.id, "actorId");
  for (const actor of state.actors.filter((actor) => actor.campaignId === campaignId)) {
    const controlledCreature = isRecord(actor.data.dnd5eControlledCreature) && actor.data.dnd5eControlledCreature.status === "active" ? actor.data.dnd5eControlledCreature : undefined;
    if (controlledCreature) {
      const source = isRecord(controlledCreature.source) ? controlledCreature.source : undefined;
      const originatingAction = isRecord(controlledCreature.originatingAction) ? controlledCreature.originatingAction : undefined;
      const concentration = isRecord(controlledCreature.concentration) ? controlledCreature.concentration : undefined;
      const initiative = isRecord(controlledCreature.initiative) ? controlledCreature.initiative : undefined;
      addDependency("actors", typeof source?.actorId === "string" ? source.actorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.source.actorId");
      addDependency("items", typeof source?.itemId === "string" ? source.itemId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.source.itemId");
      addDependency("actors", typeof originatingAction?.actorId === "string" ? originatingAction.actorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.originatingAction.actorId");
      addDependency("actors", typeof controlledCreature.controllerActorId === "string" ? controlledCreature.controllerActorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.controllerActorId");
      addDependency("actors", typeof controlledCreature.linkedActorId === "string" ? controlledCreature.linkedActorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.linkedActorId");
      addDependency("actors", typeof concentration?.sourceActorId === "string" ? concentration.sourceActorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.concentration.sourceActorId");
      if (initiative?.mode === "shared") addDependency("actors", typeof initiative.sourceActorId === "string" ? initiative.sourceActorId : undefined, "actors", actor.id, "data.dnd5eControlledCreature.initiative.sourceActorId");
    }
    const rules = isRecord(actor.data.rulesEngine) ? actor.data.rulesEngine : undefined;
    const concentration = rules && isRecord(rules.concentration) ? rules.concentration : undefined;
    addDependency("actors", typeof concentration?.sourceActorId === "string" ? concentration.sourceActorId : undefined, "actors", actor.id, "data.rulesEngine.concentration.sourceActorId");
    for (const actorId of Array.isArray(concentration?.targetActorIds) ? concentration.targetActorIds : []) {
      addDependency("actors", typeof actorId === "string" ? actorId : undefined, "actors", actor.id, "data.rulesEngine.concentration.targetActorIds");
    }
    for (const effect of Array.isArray(rules?.activeEffects) ? rules.activeEffects : []) {
      if (!isRecord(effect)) continue;
      const schedule = isRecord(effect.schedule) ? effect.schedule : undefined;
      addDependency("actors", typeof effect.sourceActorId === "string" ? effect.sourceActorId : undefined, "actors", actor.id, "data.rulesEngine.activeEffects.sourceActorId");
      addDependency("actors", typeof effect.targetActorId === "string" ? effect.targetActorId : undefined, "actors", actor.id, "data.rulesEngine.activeEffects.targetActorId");
      addDependency("actors", typeof schedule?.anchorActorId === "string" ? schedule.anchorActorId : undefined, "actors", actor.id, "data.rulesEngine.activeEffects.schedule.anchorActorId");
    }
  }
  for (const item of state.items.filter((item) => item.campaignId === campaignId)) {
    addDependency("actors", item.actorId, "items", item.id, "actorId");
    const loot = isRecord(item.data.dnd5eLoot) ? item.data.dnd5eLoot : undefined;
    addDependency("actors", typeof loot?.claimedForActorId === "string" ? loot.claimedForActorId : undefined, "items", item.id, "data.dnd5eLoot.claimedForActorId");
    addDependency("actors", typeof loot?.assignedToActorId === "string" ? loot.assignedToActorId : undefined, "items", item.id, "data.dnd5eLoot.assignedToActorId");
  }
  for (const transfer of state.characterTransfers.filter((transfer) => transfer.campaignId === campaignId)) addDependency("actors", transfer.actorId, "characterTransfers", transfer.id, "actorId");
  for (const override of state.calculationOverrides.filter((override) => override.campaignId === campaignId)) addDependency("actors", override.actorId, "calculationOverrides", override.id, "actorId");
  for (const advancement of state.pendingAdvancements.filter((advancement) => advancement.campaignId === campaignId)) addDependency("actors", advancement.actorId, "pendingAdvancements", advancement.id, "actorId");
  for (const mutation of state.dndRulesMutations.filter((mutation) => mutation.campaignId === campaignId)) {
    for (const root of mutation.roots.actors) addDependency("actors", root.actorId, "dndRulesMutations", mutation.id, "roots.actors.actorId");
    for (const root of mutation.roots.items) addDependency("items", root.itemId, "dndRulesMutations", mutation.id, "roots.items.itemId");
  }
  for (const journal of state.journals.filter((journal) => journal.campaignId === campaignId)) {
    addDependency("journals", journal.parentId, "journals", journal.id, "parentId");
    for (const actorId of journal.visibleToActorIds) addDependency("actors", actorId, "journals", journal.id, "visibleToActorIds");
    for (const link of journal.links ?? []) {
      if (link.targetType === "actor" || link.targetType === "item" || link.targetType === "journal" || link.targetType === "handout" || link.targetType === "encounter") {
        const targetCollection = link.targetType === "actor" ? "actors" : link.targetType === "item" ? "items" : link.targetType === "journal" ? "journals" : link.targetType === "handout" ? "handouts" : "encounters";
        addDependency(targetCollection, link.targetId, "journals", journal.id, "links.targetId");
      }
    }
  }
  for (const handout of state.handouts.filter((handout) => handout.campaignId === campaignId)) {
    for (const actorId of handout.visibleToActorIds ?? []) addDependency("actors", actorId, "handouts", handout.id, "visibleToActorIds");
  }
  for (const encounter of state.encounters.filter((encounter) => encounter.campaignId === campaignId)) {
    for (const actorId of encounter.partyActorIds ?? []) addDependency("actors", actorId, "encounters", encounter.id, "partyActorIds");
  }
  for (const session of state.campaignSessions.filter((session) => session.campaignId === campaignId)) {
    addDependency("journals", session.recapJournalId, "campaignSessions", session.id, "recapJournalId");
    for (const encounterId of session.encounterIds) addDependency("encounters", encounterId, "campaignSessions", session.id, "encounterIds");
  }
  for (const roll of state.rolls.filter((roll) => roll.campaignId === campaignId)) {
    addDependency("actors", roll.actorId, "rolls", roll.id, "actorId");
    addDependency("actors", roll.heroicInspiration?.actorId, "rolls", roll.id, "heroicInspiration.actorId");
  }
  for (const combat of state.combats.filter((combat) => combat.campaignId === campaignId)) {
    addDependency("encounters", combat.encounterId, "combats", combat.id, "encounterId");
    for (const combatant of combat.combatants) addDependency("actors", combatant.actorId, "combats", combat.id, "combatants.actorId");
    for (const prompt of combat.legendaryActionPrompts ?? []) addDependency("actors", prompt.actorId, "combats", combat.id, "legendaryActionPrompts.actorId");
    for (const event of combat.effectScheduleEvents ?? []) addDependency("actors", event.actorId, "combats", combat.id, "effectScheduleEvents.actorId");
    for (const reward of combat.rewards ?? []) {
      for (const actorId of reward.recipientActorIds) addDependency("actors", actorId, "combats", combat.id, "rewards.recipientActorIds");
      for (const itemId of reward.lootItemIds ?? []) addDependency("items", itemId, "combats", combat.id, "rewards.lootItemIds");
    }
    for (const action of combat.actions ?? []) {
      addDependency("actors", action.actorId, "combats", combat.id, "actions.actorId");
      for (const actorId of action.targetActorIds) addDependency("actors", actorId, "combats", combat.id, "actions.targetActorIds");
      for (const roll of action.rolls) addDependency("actors", roll.targetActorId, "combats", combat.id, "actions.rolls.targetActorId");
      for (const outcome of action.criticalOutcomes ?? []) addDependency("actors", outcome.targetActorId, "combats", combat.id, "actions.criticalOutcomes.targetActorId");
      for (const update of action.actorUpdates) addDependency("actors", update.actorId, "combats", combat.id, "actions.actorUpdates.actorId");
      for (const update of action.itemUpdates ?? []) addDependency("items", update.itemId, "combats", combat.id, "actions.itemUpdates.itemId");
      for (const effect of action.effects ?? []) addDependency("actors", effect.targetActorId, "combats", combat.id, "actions.effects.targetActorId");
      for (const actorId of removingActorIds) {
        if (action.expectedActorUpdatedAt && Object.prototype.hasOwnProperty.call(action.expectedActorUpdatedAt, actorId)) addDependency("actors", actorId, "combats", combat.id, "actions.expectedActorUpdatedAt");
        if (nestedContentImportValueContainsExactString(action.resolution, actorId)) addDependency("actors", actorId, "combats", combat.id, "actions.resolution");
      }
    }
  }

  for (const record of records) {
    const recordDependencies = dependencies.get(`${record.collection}:${record.id}`);
    if (recordDependencies?.length) {
      conflicts.push({ collection: record.collection, id: record.id, entityId: record.entityId, reason: "dependent_reference", dependencies: recordDependencies });
    }
  }
  return conflicts;
}

export function rollbackAppliedContentImportRecords(
  state: EngineState,
  campaignId: string,
  records: ContentImportAppliedRecord[],
): { ok: true; removed: ContentImportAppliedRecord[]; missing: ContentImportAppliedRecord[] } | { ok: false; conflicts: ContentImportRollbackConflict[] } {
  const conflicts = contentImportRollbackConflicts(state, campaignId, records);
  if (conflicts.length > 0) return { ok: false, conflicts };
  const existing = new Set(records.filter((record) => appliedContentImportCollection(state, record.collection).some((candidate) => candidate.id === record.id)).map((record) => `${record.collection}:${record.id}`));
  const idsByCollection = new Map<ContentImportAppliedRecord["collection"], Set<string>>();
  for (const record of records) {
    const ids = idsByCollection.get(record.collection) ?? new Set<string>();
    ids.add(record.id);
    idsByCollection.set(record.collection, ids);
  }
  Object.assign(state, {
    actors: state.actors.filter((record) => !idsByCollection.get("actors")?.has(record.id)),
    items: state.items.filter((record) => !idsByCollection.get("items")?.has(record.id)),
    journals: state.journals.filter((record) => !idsByCollection.get("journals")?.has(record.id)),
    handouts: state.handouts.filter((record) => !idsByCollection.get("handouts")?.has(record.id)),
    encounters: state.encounters.filter((record) => !idsByCollection.get("encounters")?.has(record.id)),
  });
  return {
    ok: true,
    removed: records.filter((record) => existing.has(`${record.collection}:${record.id}`)),
    missing: records.filter((record) => !existing.has(`${record.collection}:${record.id}`)),
  };
}

export function removeAppliedContentImportRecord(state: EngineState, record: ContentImportAppliedRecord): ContentImportAppliedRecord | undefined {
  const collection = appliedContentImportCollection(state, record.collection);
  const index = collection.findIndex((item) => item.id === record.id);
  if (index === -1 || !record.fingerprint || contentImportRecordFingerprint(collection[index]) !== record.fingerprint) return undefined;
  collection.splice(index, 1);
  return record;
}

export function contentImportRecordId(campaignId: string, entity: ContentImportEntity): string {
  const prefix: Record<ContentImportEntityKind, string> = {
    actor: "act_imp",
    item: "item_imp",
    journal: "jnl_imp",
    handout: "hnd_imp",
    encounter: "enc_imp"
  };
  return `${prefix[entity.kind]}_${campaignId.replace(/[^a-zA-Z0-9_]/g, "_")}_${entity.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function recordOfStringArrayFromRecord(record: Record<string, unknown>, key: string): Record<string, PermissionName[]> | undefined {
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.every(([, item]) => Array.isArray(item) && item.every((permission) => typeof permission === "string" && ALL_PERMISSIONS.includes(permission as PermissionName)))) return undefined;
  return Object.fromEntries(entries) as Record<string, PermissionName[]>;
}

export function countArchiveRecords(archive: CampaignArchive): Record<keyof EngineState, number> {
  return Object.fromEntries(
    (Object.keys(emptyState()) as Array<keyof EngineState>).map((collection) => {
      const records = archive.data[collection];
      return [collection, Array.isArray(records) ? records.length : 0];
    })
  ) as Record<keyof EngineState, number>;
}

export const operatorSelectableArchiveCollections = [
  "worlds",
  "worldRecords",
  "worldRelations",
  "assets",
  "scenes",
  "tokens",
  "actors",
  "calculationOverrides",
  "items",
  "journals",
  "handouts",
  "chat",
  "rolls",
  "diceMacros",
  "audioTracks",
  "encounters",
  "campaignSessions",
  "combats",
  "contentImports",
  "fogPresets"
] as const satisfies ReadonlyArray<keyof EngineState>;

export type OperatorSelectableArchiveCollection = (typeof operatorSelectableArchiveCollections)[number];

export function normalizeArchiveImportCollections(scope: "all" | "assets_only" | "selected_collections", collections: string[] | undefined): { ok: true; value: OperatorSelectableArchiveCollection[] } | { ok: false; error: string } {
  if (scope === "all") return { ok: true, value: [...operatorSelectableArchiveCollections] };
  if (scope === "assets_only") return { ok: true, value: ["assets"] };
  const selected = [...new Set((collections ?? []).filter((collection): collection is OperatorSelectableArchiveCollection => operatorSelectableArchiveCollections.includes(collection as OperatorSelectableArchiveCollection)))];
  if (selected.length === 0) return { ok: false, error: "selected_collections import scope requires at least one supported collection" };
  return { ok: true, value: selected };
}

export function archiveImportDependencyWarnings(scope: "all" | "assets_only" | "selected_collections", collections: OperatorSelectableArchiveCollection[], archive: CampaignArchive): string[] {
  if (scope !== "selected_collections") return [];
  const selected = new Set<OperatorSelectableArchiveCollection>(collections);
  const dependencies: Partial<Record<OperatorSelectableArchiveCollection, OperatorSelectableArchiveCollection[]>> = {
    worlds: ["worldRecords", "scenes", "actors", "items", "journals", "handouts", "encounters"],
    worldRecords: ["worlds", "worldRelations"],
    worldRelations: ["worldRecords"],
    scenes: ["worlds", "assets", "fogPresets"],
    tokens: ["scenes", "actors", "assets"],
    actors: ["worlds", "items", "assets", "calculationOverrides"],
    calculationOverrides: ["actors"],
    items: ["worlds", "actors"],
    journals: ["worlds", "assets"],
    handouts: ["worlds", "assets"],
    chat: ["rolls"],
    encounters: ["worlds", "actors", "tokens"],
    campaignSessions: ["scenes", "encounters", "journals"],
    combats: ["actors", "tokens", "scenes"],
    contentImports: ["actors", "items", "journals", "handouts", "encounters"]
  };
  return collections.flatMap((collection) => {
    if ((archive.data[collection] as Array<{ id: string }>).length === 0) return [];
    return (dependencies[collection] ?? [])
      .filter((dependency) => !selected.has(dependency) && (archive.data[dependency] as Array<{ id: string }>).length > 0)
      .map((dependency) => `${collection} records may reference omitted ${dependency} records; include ${dependency} or verify references after import.`);
  });
}

export function archiveForImportScope(archive: CampaignArchive, scope: "all" | "assets_only" | "selected_collections", collections: OperatorSelectableArchiveCollection[]): CampaignArchive {
  if (scope === "all") return archive;
  const data = emptyState();
  for (const collection of collections) {
    (data[collection] as Array<{ id: string }>) = archive.data[collection] as Array<{ id: string }>;
  }
  const includeAssetFiles = collections.includes("assets");
  return {
    ...archive,
    data,
    files: includeAssetFiles ? archive.files?.filter((file) => archive.data.assets.some((asset) => asset.id === file.assetId)) ?? [] : []
  };
}

export const regeneratableArchiveCollections = [
  "campaigns",
  "members",
  "worlds",
  "worldRecords",
  "worldRelations",
  "scenes",
  "assets",
  "tokens",
  "actors",
  "calculationOverrides",
  "items",
  "journals",
  "handouts",
  "chat",
  "rolls",
  "diceMacros",
  "audioTracks",
  "encounters",
  "campaignSessions",
  "combats",
  "proposals",
  "aiThreads",
  "aiEvaluations",
  "aiMemory",
  "aiToolCalls",
  "auditLogs",
  "permissionGrants",
  "pluginStorage",
  "contentImports",
  "fogPresets"
] as const satisfies ReadonlyArray<keyof EngineState>;

export const archiveIdPrefixes: Record<(typeof regeneratableArchiveCollections)[number], string> = {
  campaigns: "camp",
  members: "mem",
  worlds: "world",
  worldRecords: "wrec",
  worldRelations: "wrel",
  scenes: "scn",
  assets: "asset",
  tokens: "tok",
  actors: "act",
  calculationOverrides: "calcovr",
  items: "item",
  journals: "jnl",
  handouts: "hnd",
  chat: "msg",
  rolls: "roll",
  diceMacros: "mac",
  audioTracks: "audio",
  encounters: "enc",
  campaignSessions: "cses",
  combats: "cmb",
  proposals: "prop",
  aiThreads: "thr",
  aiEvaluations: "eval",
  aiMemory: "memfact",
  aiToolCalls: "tool",
  auditLogs: "audit",
  permissionGrants: "grant",
  pluginStorage: "plugstore",
  contentImports: "imp",
  fogPresets: "fogp"
};

export function archiveWithRegeneratedIds(archive: CampaignArchive, options: { userId: string; organizationId: string }): CampaignArchive {
  const data = clonePlain(archive.data);
  const idMap = new Map<string, string>();
  for (const collection of regeneratableArchiveCollections) {
    for (const record of data[collection] as Array<{ id?: string }>) {
      if (typeof record.id === "string" && record.id) idMap.set(record.id, createId(archiveIdPrefixes[collection]));
    }
  }

  const remappedData = remapArchiveReferences(data, idMap) as EngineState;
  const copiedCampaignIds = new Set(remappedData.campaigns.map((campaign) => campaign.id));
  for (const campaign of remappedData.campaigns) {
    campaign.organizationId = options.organizationId;
    campaign.ownerUserId = options.userId;
  }
  remappedData.members = remappedData.members.filter((member) => !copiedCampaignIds.has(member.campaignId));
  for (const campaign of remappedData.campaigns) {
    remappedData.members.push(
      createTimestamped("mem", {
        campaignId: campaign.id,
        userId: options.userId,
        role: "owner" as const
      }) satisfies CampaignMember
    );
  }
  for (const actor of remappedData.actors) {
    if (copiedCampaignIds.has(actor.campaignId)) actor.ownerUserId = options.userId;
  }
  for (const journal of remappedData.journals) {
    if (!copiedCampaignIds.has(journal.campaignId)) continue;
    journal.createdBy = options.userId;
    journal.updatedBy = options.userId;
  }
  for (const handout of remappedData.handouts) {
    if (!copiedCampaignIds.has(handout.campaignId)) continue;
    handout.createdBy = options.userId;
    handout.updatedBy = options.userId;
  }
  for (const session of remappedData.campaignSessions) {
    if (!copiedCampaignIds.has(session.campaignId)) continue;
    session.createdBy = options.userId;
    session.updatedBy = options.userId;
  }
  for (const macro of remappedData.diceMacros) {
    if (copiedCampaignIds.has(macro.campaignId)) macro.createdBy = options.userId;
  }
  remappedData.permissionGrants = remappedData.permissionGrants.filter((grant) => grant.subjectType !== "user" || !copiedCampaignIds.has(grant.campaignId));

  const campaignId = idMap.get(archive.manifest.campaignId) ?? remappedData.campaigns[0]?.id ?? archive.manifest.campaignId;
  return {
    ...archive,
    manifest: {
      ...archive.manifest,
      campaignId,
      name: archive.manifest.name.endsWith(" Copy") ? archive.manifest.name : `${archive.manifest.name} Copy`
    },
    data: remappedData,
    files: archive.files?.map((file) => ({ ...file, assetId: idMap.get(file.assetId) ?? file.assetId })) ?? []
  };
}

/**
 * Campaign archives are portable content, not an identity or server-global
 * administration channel. Existing accounts, campaign ownership, membership,
 * permission grants, and global compendia therefore remain server-owned.
 */
export function secureArchiveIdentityForImport(
  state: EngineState,
  archive: CampaignArchive,
  options: { userId: string; organizationId: string }
): CampaignArchive {
  const data = clonePlain(archive.data);
  const existingUserIds = new Set(state.users.map((user) => user.id));
  data.users = data.users
    .filter((user) => !existingUserIds.has(user.id))
    .map(({ passwordHash: _passwordHash, mfa: _mfa, scim: _scim, serverAdmin: _serverAdmin, disabledAt: _disabledAt, disabledByUserId: _disabledByUserId, disabledReason: _disabledReason, passwordUpdatedAt: _passwordUpdatedAt, ...user }) => ({
      ...user,
      passwordResetRequired: true
    }));
  const knownUserIds = new Set([...existingUserIds, ...data.users.map((user) => user.id)]);
  const existingCampaigns = new Map(state.campaigns.map((campaign) => [campaign.id, campaign]));
  const newCampaignIds = new Set<string>();

  // Compendium packs are server-global in the current model. A campaign archive
  // records its system requirements but cannot install or replace global packs.
  data.compendia = [];
  // Audit history is server evidence, not portable content. The import action
  // itself is recorded after the merge with the authenticated actor.
  data.auditLogs = [];
  data.invites = [];
  data.characterTransfers = [];
  data.scimGroups = [];
  data.scimGroupRoleMappings = [];

  for (const campaign of data.campaigns) {
    const existing = existingCampaigns.get(campaign.id);
    if (existing) {
      campaign.ownerUserId = existing.ownerUserId;
      campaign.organizationId = existing.organizationId;
      continue;
    }
    newCampaignIds.add(campaign.id);
    campaign.ownerUserId = options.userId;
    campaign.organizationId = options.organizationId;
  }

  const memberByCampaignAndUser = new Map<string, CampaignMember>();
  for (const rawMember of data.members) {
    if (!newCampaignIds.has(rawMember.campaignId) || !knownUserIds.has(rawMember.userId)) continue;
    const member: CampaignMember = {
      ...rawMember,
      id: state.members.some((existing) => existing.id === rawMember.id) ? createId("mem") : rawMember.id,
      role: rawMember.userId === options.userId ? "owner" : rawMember.role === "owner" ? "gm" : rawMember.role,
      source: undefined
    };
    memberByCampaignAndUser.set(`${member.campaignId}:${member.userId}`, member);
  }
  for (const campaignId of newCampaignIds) {
    const key = `${campaignId}:${options.userId}`;
    if (!memberByCampaignAndUser.has(key)) {
      memberByCampaignAndUser.set(
        key,
        createTimestamped("mem", { campaignId, userId: options.userId, role: "owner" as const }) satisfies CampaignMember
      );
    }
  }
  data.members = [...memberByCampaignAndUser.values()];

  data.permissionGrants = data.permissionGrants
    .filter((grant) => newCampaignIds.has(grant.campaignId))
    .filter((grant) => grant.subjectType !== "user" || knownUserIds.has(grant.subjectId))
    .map((grant) => ({
      ...grant,
      id: state.permissionGrants.some((existing) => existing.id === grant.id) ? createId("grant") : grant.id
    }));

  sanitizeArchiveUserIdReferences(data, knownUserIds, options.userId);

  for (const actor of data.actors) {
    if (actor.ownerUserId && !knownUserIds.has(actor.ownerUserId)) actor.ownerUserId = options.userId;
  }
  for (const journal of data.journals) {
    journal.visibleToUserIds = journal.visibleToUserIds.filter((userId) => knownUserIds.has(userId));
    if (!journal.createdBy || !knownUserIds.has(journal.createdBy)) journal.createdBy = options.userId;
    if (!journal.updatedBy || !knownUserIds.has(journal.updatedBy)) journal.updatedBy = options.userId;
  }
  for (const handout of data.handouts) {
    handout.visibleToUserIds = (handout.visibleToUserIds ?? []).filter((userId) => knownUserIds.has(userId));
    if (!handout.createdBy || !knownUserIds.has(handout.createdBy)) handout.createdBy = options.userId;
    if (!handout.updatedBy || !knownUserIds.has(handout.updatedBy)) handout.updatedBy = options.userId;
  }
  for (const message of data.chat) message.recipientUserIds = message.recipientUserIds.filter((userId) => knownUserIds.has(userId));
  for (const session of data.campaignSessions) {
    if (!knownUserIds.has(session.createdBy)) session.createdBy = options.userId;
    if (!knownUserIds.has(session.updatedBy)) session.updatedBy = options.userId;
  }
  for (const macro of data.diceMacros) if (!knownUserIds.has(macro.createdBy)) macro.createdBy = options.userId;
  for (const track of data.audioTracks) if (!knownUserIds.has(track.createdBy)) track.createdBy = options.userId;
  for (const entry of data.pluginStorage) {
    if (entry.updatedByType === "user" && !knownUserIds.has(entry.updatedById)) entry.updatedById = options.userId;
  }

  return { ...archive, data };
}

export function sanitizeArchiveUserIdReferences(value: unknown, knownUserIds: Set<string>, fallbackUserId: string): void {
  if (Array.isArray(value)) {
    for (const item of value) sanitizeArchiveUserIdReferences(item, knownUserIds, fallbackUserId);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (Array.isArray(item) && key.endsWith("UserIds")) {
      record[key] = item.filter((userId): userId is string => typeof userId === "string" && knownUserIds.has(userId));
      continue;
    }
    if (typeof item === "string" && (key === "userId" || key.endsWith("UserId"))) {
      if (!knownUserIds.has(item)) record[key] = fallbackUserId;
      continue;
    }
    if (key === "permissions" && item && typeof item === "object" && !Array.isArray(item)) {
      const permissions = item as Record<string, unknown>;
      if (Object.values(permissions).every((entry) => Array.isArray(entry))) {
        record[key] = Object.fromEntries(Object.entries(permissions).filter(([userId]) => knownUserIds.has(userId)));
        continue;
      }
    }
    sanitizeArchiveUserIdReferences(item, knownUserIds, fallbackUserId);
  }
}

export function remapArchiveReferences(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === "string") return idMap.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapArchiveReferences(item, idMap));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapArchiveReferences(item, idMap)]));
}

// JSON round-trip, not structuredClone: also canonicalizes (drops undefined members)
// so restored state stays byte-comparable with HTTP JSON bodies in stableJson diffs.
export function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function archiveWithoutConflicts(archive: CampaignArchive, conflicts: Array<{ collection: keyof EngineState; id: string }>): CampaignArchive {
  const conflictsByCollection = new Map<keyof EngineState, Set<string>>();
  for (const conflict of conflicts) {
    const ids = conflictsByCollection.get(conflict.collection) ?? new Set<string>();
    ids.add(conflict.id);
    conflictsByCollection.set(conflict.collection, ids);
  }
  const data = { ...archive.data };
  for (const collection of Object.keys(data) as Array<keyof EngineState>) {
    const conflictIds = conflictsByCollection.get(collection);
    if (!conflictIds) continue;
    const records = archive.data[collection] as Array<{ id: string }>;
    (data[collection] as Array<{ id: string }>) = records.filter((record) => !conflictIds.has(record.id));
  }
  const importedAssetIds = new Set(data.assets.map((asset) => asset.id));
  return {
    ...archive,
    data,
    files: archive.files?.filter((file) => importedAssetIds.has(file.assetId)) ?? []
  };
}

export function mergeArchive(state: EngineState, archive: CampaignArchive): Record<keyof EngineState, number> {
  const archivedFileAssetIds = new Set((archive.files ?? []).map((file) => file.assetId));
  const importedAssets = archive.data.assets.map((asset) => {
    if (!archivedFileAssetIds.has(asset.id)) {
      return {
        ...asset,
        url: asset.url.startsWith("/api/v1/assets/") ? "" : asset.url,
        storage: undefined
      };
    }
    if (!asset.storage) return asset;
    if (asset.storage.provider === "local") return { ...asset, storage: { provider: "local", key: assetStorageKey(asset) } };
    if (asset.storage.provider === "s3") {
      return {
        ...asset,
        storage: {
          provider: "s3",
          bucket: asset.storage.bucket,
          key: assetStorageKey(asset)
        }
      };
    }
    return { ...asset, storage: undefined };
  });
  return {
    users: upsertUsers(state.users, archive.data.users),
    sessions: 0,
    identities: 0,
    oauthStates: 0,
    passwordResetTokens: 0,
    emailOutbox: 0,
    scimGroups: 0,
    scimGroupRoleMappings: 0,
    organizations: 0,
    organizationMembers: 0,
    invites: 0,
    campaigns: upsertRecords(state.campaigns, archive.data.campaigns),
    members: upsertRecords(state.members, archive.data.members),
    worlds: upsertRecords(state.worlds, archive.data.worlds),
    worldRecords: upsertRecords(state.worldRecords, archive.data.worldRecords ?? []),
    worldRelations: upsertRecords(state.worldRelations, archive.data.worldRelations ?? []),
    scenes: upsertRecords(state.scenes, archive.data.scenes),
    assets: upsertRecords(state.assets, importedAssets),
    tokens: upsertRecords(state.tokens, archive.data.tokens),
    actors: upsertRecords(state.actors, archive.data.actors),
    calculationOverrides: upsertRecords(state.calculationOverrides, archive.data.calculationOverrides ?? []),
    characterTransfers: upsertRecords(state.characterTransfers, archive.data.characterTransfers ?? []),
    items: upsertRecords(state.items, archive.data.items),
    journals: upsertRecords(state.journals, archive.data.journals),
    handouts: upsertRecords(state.handouts, archive.data.handouts),
    chat: upsertRecords(state.chat, archive.data.chat),
    rolls: upsertRecords(state.rolls, archive.data.rolls),
    diceMacros: upsertRecords(state.diceMacros, archive.data.diceMacros ?? []),
    audioTracks: upsertRecords(state.audioTracks, archive.data.audioTracks ?? []),
    encounters: upsertRecords(state.encounters, archive.data.encounters),
    campaignSessions: upsertRecords(state.campaignSessions, archive.data.campaignSessions ?? []),
    combats: upsertRecords(state.combats, archive.data.combats),
    compendia: upsertRecords(state.compendia, archive.data.compendia),
    proposals: upsertRecords(state.proposals, archive.data.proposals),
    aiThreads: upsertRecords(state.aiThreads, archive.data.aiThreads),
    aiEvaluations: upsertRecords(state.aiEvaluations, archive.data.aiEvaluations ?? []),
    aiMemory: upsertRecords(state.aiMemory, archive.data.aiMemory),
    aiToolCalls: upsertRecords(state.aiToolCalls, archive.data.aiToolCalls),
    auditLogs: upsertRecords(state.auditLogs, archive.data.auditLogs),
    dndRulesMutations: upsertRecords(state.dndRulesMutations, archive.data.dndRulesMutations ?? []),
    pendingAdvancements: upsertRecords(state.pendingAdvancements, archive.data.pendingAdvancements ?? []),
    permissionGrants: upsertRecords(state.permissionGrants, archive.data.permissionGrants),
    systemInstallations: 0,
    pluginStorage: upsertRecords(state.pluginStorage, archive.data.pluginStorage ?? []),
    pluginReviews: 0,
    contentImports: upsertRecords(state.contentImports, archive.data.contentImports ?? []),
    campaignArchiveImportOperations: 0,
    fogPresets: upsertRecords(state.fogPresets, archive.data.fogPresets ?? []),
    campaignWebhooks: 0,
    campaignWebhookDeliveries: 0,
    idempotencyRecords: 0,
    jobs: 0
  };
}

/**
 * Copy only collection arrays that this archive can mutate. Existing records
 * remain immutable references; incoming rows replace or append in the copied
 * arrays. This preserves atomic replace semantics without serializing and
 * duplicating every campaign and nested payload in the repository.
 */
export function stateForArchiveMerge(state: EngineState, archive: CampaignArchive): EngineState {
  const next = { ...state } as EngineState;
  const copiedCollections = new Set<keyof EngineState>(["auditLogs"]);
  for (const collection of Object.keys(archive.data) as Array<keyof EngineState>) {
    const incoming = archive.data[collection] as unknown[];
    if (incoming.length > 0) copiedCollections.add(collection);
  }
  for (const collection of copiedCollections) {
    Reflect.set(next, collection, [...(state[collection] as unknown[])]);
  }
  return next;
}

export function findArchiveConflicts(state: EngineState, archive: CampaignArchive): Array<{ collection: keyof EngineState; id: string }> {
  const conflicts: Array<{ collection: keyof EngineState; id: string }> = [];
  for (const collection of Object.keys(archive.data) as Array<keyof EngineState>) {
    const target = state[collection] as Array<{ id: string }>;
    const incoming = archive.data[collection] as Array<{ id: string }>;
    for (const record of incoming) {
      if (target.some((item) => item.id === record.id)) conflicts.push({ collection, id: record.id });
    }
  }
  return conflicts;
}

export function existingArchiveCampaignIds(state: EngineState, archive: CampaignArchive): string[] {
  const existingCampaignIds = new Set(state.campaigns.map((campaign) => campaign.id));
  const campaignIds = new Set<string>();
  for (const campaign of archive.data.campaigns) {
    if (existingCampaignIds.has(campaign.id)) campaignIds.add(campaign.id);
  }
  for (const collection of Object.keys(archive.data) as Array<keyof EngineState>) {
    const records = archive.data[collection] as Array<{ campaignId?: string }>;
    for (const record of records) {
      if (typeof record.campaignId === "string" && existingCampaignIds.has(record.campaignId)) campaignIds.add(record.campaignId);
    }
  }
  return [...campaignIds];
}

export function campaignIdsForArchiveConflicts(
  state: EngineState,
  conflicts: Array<{ collection: keyof EngineState; id: string }>
): string[] {
  const campaignIds = new Set<string>();
  for (const conflict of conflicts) {
    const records = state[conflict.collection] as unknown as Array<{ id: string; campaignId?: string; sceneId?: string; threadId?: string }>;
    const record = records.find((item) => item.id === conflict.id);
    if (!record) continue;
    if (conflict.collection === "campaigns") {
      campaignIds.add(conflict.id);
      continue;
    }
    if (typeof record.campaignId === "string") {
      campaignIds.add(record.campaignId);
      continue;
    }
    if (conflict.collection === "tokens" && record.sceneId) {
      const campaignId = state.scenes.find((scene) => scene.id === record.sceneId)?.campaignId;
      if (campaignId) campaignIds.add(campaignId);
      continue;
    }
    if (conflict.collection === "aiToolCalls" && record.threadId) {
      const campaignId = state.aiThreads.find((thread) => thread.id === record.threadId)?.campaignId;
      if (campaignId) campaignIds.add(campaignId);
    }
  }
  return [...campaignIds];
}

export type ArchiveReferenceProtection = { ok: true; campaignIds: string[] } | { ok: false; error: string };

/**
 * Derive campaign authority from both direct campaign ids and relationship-only
 * records before an archive is merged. Existing records win resolution so an
 * incoming object cannot spoof ownership by redefining a referenced id inside
 * the same archive.
 */
export function archiveReferenceProtection(
  state: EngineState,
  archive: CampaignArchive,
  options: { requireResolvedReferences: boolean } & ArchiveReferenceRuntime,
): ArchiveReferenceProtection {
  type ReferenceCollection = keyof EngineState;
  type ReferenceRecord = { id: string; campaignId?: string; sceneId?: string; threadId?: string };
  const protectedCampaignIds = new Set<string>();
  const existingCampaignIds = new Set(state.campaigns.map((campaign) => campaign.id));
  const knownCampaignIds = new Set([...existingCampaignIds, ...archive.data.campaigns.map((campaign) => campaign.id)]);
  const resolving = new Set<string>();

  const recordFor = (collection: ReferenceCollection, id: string): ReferenceRecord | undefined => {
    const existing = (state[collection] as unknown as ReferenceRecord[]).find((record) => record.id === id);
    return existing ?? (archive.data[collection] as unknown as ReferenceRecord[]).find((record) => record.id === id);
  };
  const campaignFor = (collection: ReferenceCollection, id: string): string | undefined => {
    const key = `${collection}:${id}`;
    if (resolving.has(key)) return undefined;
    resolving.add(key);
    try {
      if (collection === "campaigns") return id;
      const record = recordFor(collection, id);
      if (!record) return undefined;
      if (typeof record.campaignId === "string") return record.campaignId;
      if (collection === "tokens" && typeof record.sceneId === "string") return campaignFor("scenes", record.sceneId);
      if (collection === "aiToolCalls" && typeof record.threadId === "string") return campaignFor("aiThreads", record.threadId);
      return undefined;
    } finally {
      resolving.delete(key);
    }
  };
  const protect = (campaignId: string | undefined): void => {
    if (campaignId && existingCampaignIds.has(campaignId)) protectedCampaignIds.add(campaignId);
  };
  const validateReference = (
    ownerCampaignId: string,
    collection: ReferenceCollection,
    id: string | undefined,
    label: string,
    required = options.requireResolvedReferences
  ): string | undefined => {
    if (!id) return undefined;
    const referencedCampaignId = campaignFor(collection, id);
    protect(referencedCampaignId);
    if (!referencedCampaignId) return required ? `${label} references missing ${collection} record ${id}` : undefined;
    if (referencedCampaignId !== ownerCampaignId) {
      return `${label} belongs to campaign ${ownerCampaignId} but references ${collection} record ${id} in campaign ${referencedCampaignId}`;
    }
    return undefined;
  };
  const validateMany = (ownerCampaignId: string, collection: ReferenceCollection, ids: string[] | undefined, label: string): string | undefined => {
    for (const id of ids ?? []) {
      const error = validateReference(ownerCampaignId, collection, id, label);
      if (error) return error;
    }
    return undefined;
  };
  const directCampaignCollections = (Object.keys(archive.data) as ReferenceCollection[]).filter(
    (collection) => collection !== "campaigns" && collection !== "tokens" && collection !== "aiToolCalls"
  );
  for (const collection of directCampaignCollections) {
    for (const record of archive.data[collection] as unknown as ReferenceRecord[]) {
      if (!record.campaignId) continue;
      if (!knownCampaignIds.has(record.campaignId)) return { ok: false, error: `${collection} record ${record.id} references unknown campaign ${record.campaignId}` };
      protect(record.campaignId);
    }
  }

  for (const scene of archive.data.scenes) {
    const error =
      validateReference(scene.campaignId, "worlds", scene.worldId, `Scene ${scene.id}`) ??
      validateReference(scene.campaignId, "assets", scene.backgroundAssetId, `Scene ${scene.id}`);
    if (error) return { ok: false, error };
  }
  for (const token of archive.data.tokens) {
    const campaignId = campaignFor("scenes", token.sceneId);
    protect(campaignId);
    if (!campaignId) return { ok: false, error: `Token ${token.id} references missing scenes record ${token.sceneId}` };
    const error =
      validateReference(campaignId, "actors", token.actorId, `Token ${token.id}`) ??
      validateReference(campaignId, "assets", token.imageAssetId, `Token ${token.id}`);
    if (error) return { ok: false, error };
  }
  for (const actor of archive.data.actors) {
    const error =
      validateReference(actor.campaignId, "worlds", actor.worldId, `Actor ${actor.id}`) ??
      validateReference(actor.campaignId, "assets", actor.imageAssetId, `Actor ${actor.id}`);
    if (error) return { ok: false, error };
  }
  for (const transfer of archive.data.characterTransfers ?? []) {
    const error = validateReference(transfer.campaignId, "actors", transfer.actorId, `Character transfer ${transfer.id}`);
    if (error) return { ok: false, error };
  }
  for (const item of archive.data.items) {
    const error =
      validateReference(item.campaignId, "worlds", item.worldId, `Item ${item.id}`) ??
      validateReference(item.campaignId, "actors", item.actorId, `Item ${item.id}`);
    if (error) return { ok: false, error };
  }
  for (const journal of archive.data.journals) {
    const error =
      validateReference(journal.campaignId, "worlds", journal.worldId, `Journal ${journal.id}`) ??
      validateReference(journal.campaignId, "journals", journal.parentId, `Journal ${journal.id}`);
    if (error) return { ok: false, error };
  }
  for (const handout of archive.data.handouts) {
    const error =
      validateReference(handout.campaignId, "worlds", handout.worldId, `Handout ${handout.id}`) ??
      validateMany(handout.campaignId, "assets", handout.assetIds, `Handout ${handout.id}`);
    if (error) return { ok: false, error };
  }
  for (const message of archive.data.chat) {
    const error =
      validateReference(message.campaignId, "scenes", message.sceneId, `Chat message ${message.id}`) ??
      validateReference(message.campaignId, "rolls", message.rollId, `Chat message ${message.id}`) ??
      validateReference(message.campaignId, "chat", message.replyToMessageId, `Chat message ${message.id}`, false);
    if (error) return { ok: false, error };
  }
  for (const encounter of archive.data.encounters) {
    let error =
      validateReference(encounter.campaignId, "worlds", encounter.worldId, `Encounter ${encounter.id}`) ??
      validateMany(encounter.campaignId, "tokens", encounter.tokenIds, `Encounter ${encounter.id}`);
    const rawEncounter = encounter as unknown as Record<string, unknown>;
    const systemId = rawEncounter.systemId;
    if (systemId !== undefined && (typeof systemId !== "string" || !systemId.trim())) {
      return { ok: false, error: `Encounter ${encounter.id} has an invalid systemId` };
    }
    const normalizedSystemId = typeof systemId === "string" ? systemId.trim() : undefined;
    if (normalizedSystemId && (!findRegisteredSystem(state, normalizedSystemId) || !options.hasSystemRuntimeCapability(normalizedSystemId, "encounter-builder"))) {
      return { ok: false, error: `Encounter ${encounter.id} references an unavailable encounter system ${normalizedSystemId}` };
    }
    const rawPartyActorIds = rawEncounter.partyActorIds;
    if (rawPartyActorIds !== undefined) {
      if (!normalizedSystemId || !Array.isArray(rawPartyActorIds) || rawPartyActorIds.length > 100 || rawPartyActorIds.some((id) => typeof id !== "string" || !id.trim())) {
        return { ok: false, error: `Encounter ${encounter.id} has invalid partyActorIds` };
      }
      const partyActorIds = rawPartyActorIds.map((id) => (id as string).trim());
      if (new Set(partyActorIds).size !== partyActorIds.length) return { ok: false, error: `Encounter ${encounter.id} has duplicate partyActorIds` };
      for (const actorId of partyActorIds) {
        error ??= validateReference(encounter.campaignId, "actors", actorId, `Encounter ${encounter.id}`, true);
        const actor = recordFor("actors", actorId) as unknown as Actor | undefined;
        if (actor && (actor.systemId !== normalizedSystemId || actor.type !== "character")) {
          error ??= `Encounter ${encounter.id} party actor ${actorId} must be a character from system ${normalizedSystemId}`;
        }
      }
    }
    const rawThreats = rawEncounter.threats;
    if (rawThreats !== undefined) {
      if (!normalizedSystemId) return { ok: false, error: `Encounter ${encounter.id} threats require systemId` };
      const threats = options.normalizedEncounterThreatSelections(rawThreats, normalizedSystemId);
      if (!threats.ok) return { ok: false, error: `Encounter ${encounter.id}: ${threats.error}` };
    }
    if (error) return { ok: false, error };
  }
  for (const session of archive.data.campaignSessions) {
    const error =
      validateMany(session.campaignId, "scenes", session.sceneIds, `Session ${session.id}`) ??
      validateMany(session.campaignId, "encounters", session.encounterIds, `Session ${session.id}`) ??
      validateReference(session.campaignId, "proposals", session.recapProposalId, `Session ${session.id}`) ??
      validateReference(session.campaignId, "journals", session.recapJournalId, `Session ${session.id}`);
    if (error) return { ok: false, error };
  }
  for (const combat of archive.data.combats) {
    let error = validateReference(combat.campaignId, "encounters", combat.encounterId, `Combat ${combat.id}`);
    for (const combatant of combat.combatants) {
      error ??= validateReference(combat.campaignId, "tokens", combatant.tokenId, `Combat ${combat.id}`);
      error ??= validateReference(combat.campaignId, "actors", combatant.actorId, `Combat ${combat.id}`);
    }
    for (const action of combat.actions ?? []) {
      error ??= validateReference(combat.campaignId, "actors", action.actorId, `Combat ${combat.id} action ${action.id}`);
      error ??= validateMany(combat.campaignId, "actors", action.targetActorIds, `Combat ${combat.id} action ${action.id}`);
      error ??= validateMany(combat.campaignId, "actors", action.actorUpdates.map((update) => update.actorId), `Combat ${combat.id} action ${action.id}`);
      error ??= validateMany(combat.campaignId, "items", action.itemUpdates?.map((update) => update.itemId), `Combat ${combat.id} action ${action.id}`);
      error ??= validateMany(combat.campaignId, "actors", action.effects?.map((effect) => effect.targetActorId), `Combat ${combat.id} action ${action.id}`);
    }
    if (error) return { ok: false, error };
  }
  for (const evaluation of archive.data.aiEvaluations) {
    const error = validateReference(evaluation.campaignId, "aiThreads", evaluation.threadId, `AI evaluation ${evaluation.id}`);
    if (error) return { ok: false, error };
  }
  for (const memory of archive.data.aiMemory) {
    const error = validateReference(memory.campaignId, "worlds", memory.worldId, `AI memory ${memory.id}`);
    if (error) return { ok: false, error };
  }
  for (const toolCall of archive.data.aiToolCalls) {
    const campaignId = campaignFor("aiThreads", toolCall.threadId);
    protect(campaignId);
    if (!campaignId) return { ok: false, error: `AI tool call ${toolCall.id} references missing aiThreads record ${toolCall.threadId}` };
  }
  for (const preset of archive.data.fogPresets) {
    const error = validateReference(preset.campaignId, "scenes", preset.sourceSceneId, `Fog preset ${preset.id}`);
    if (error) return { ok: false, error };
  }
  for (const batch of archive.data.contentImports) {
    for (const applied of batch.appliedRecords) {
      const error = validateReference(batch.campaignId, applied.collection, applied.id, `Content import ${batch.id}`, false);
      if (error) return { ok: false, error };
    }
  }

  const proposalCollection: Partial<Record<ProposalChange["entity"], ReferenceCollection>> = {
    campaign: "campaigns",
    world: "worlds",
    scene: "scenes",
    token: "tokens",
    actor: "actors",
    item: "items",
    journal: "journals",
    handout: "handouts",
    chat: "chat",
    roll: "rolls",
    diceMacro: "diceMacros",
    encounter: "encounters",
    combat: "combats",
    asset: "assets",
    fogPreset: "fogPresets",
    pluginStorage: "pluginStorage",
    campaignSession: "campaignSessions",
    aiMemory: "aiMemory"
  };
  for (const proposal of archive.data.proposals) {
    for (const change of [...proposal.changesJson, ...(proposal.inverseChangesJson ?? [])]) {
      const collection = proposalCollection[change.entity];
      if (!collection) continue;
      const targetId = change.id ?? (typeof change.data.id === "string" ? change.data.id : undefined);
      if (change.action === "create") {
        const embeddedCampaignId = typeof change.data.campaignId === "string" ? change.data.campaignId : undefined;
        protect(embeddedCampaignId);
        if (embeddedCampaignId && embeddedCampaignId !== proposal.campaignId) {
          return { ok: false, error: `Proposal ${proposal.id} creates ${change.entity} content for campaign ${embeddedCampaignId} outside proposal campaign ${proposal.campaignId}` };
        }
        if (change.entity === "token" && typeof change.data.sceneId === "string") {
          const error = validateReference(proposal.campaignId, "scenes", change.data.sceneId, `Proposal ${proposal.id}`, true);
          if (error) return { ok: false, error };
        }
        continue;
      }
      if (!targetId) continue;
      const error = validateReference(proposal.campaignId, collection, targetId, `Proposal ${proposal.id}`, false);
      if (error) return { ok: false, error };
    }
  }

  return { ok: true, campaignIds: [...protectedCampaignIds] };
}

export function upsertUsers(target: User[], incoming: User[]): number {
  for (const record of incoming) {
    const index = target.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      const existing = target[index];
      if (!existing) throw new Error(`Existing user index was not found for archive user ${record.id}`);
      const merged: User = {
        ...record,
        passwordHash: existing.passwordHash,
        serverAdmin: existing.serverAdmin,
        mfa: existing.mfa,
        scim: existing.scim,
        disabledAt: existing.disabledAt,
        disabledByUserId: existing.disabledByUserId,
        disabledReason: existing.disabledReason,
        passwordUpdatedAt: existing.passwordUpdatedAt,
        passwordResetRequired: existing.passwordResetRequired
      };
      target[index] = merged;
    } else {
      const imported: User = { ...record, serverAdmin: undefined };
      if (!imported.passwordHash) imported.passwordResetRequired = true;
      target.push(imported);
    }
  }
  return incoming.length;
}

export function upsertRecords<T extends { id: string }>(target: T[], incoming: T[]): number {
  for (const record of incoming) {
    const index = target.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      target[index] = record;
    } else {
      target.push(record);
    }
  }
  return incoming.length;
}
