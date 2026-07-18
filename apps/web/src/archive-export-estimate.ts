import type { Snapshot } from "./api.js";
import type { HandoutLibraryItem } from "./handout-library-panel.js";
import type { WorldAtlasWorld } from "./world-atlas-panel.js";

export type ArchiveExportScope = "campaign" | "world" | "selected_collections";

export const archiveExportCollectionOptions = [
  { id: "worlds", label: "Worlds" },
  { id: "assets", label: "Assets" },
  { id: "scenes", label: "Scenes" },
  { id: "tokens", label: "Tokens" },
  { id: "actors", label: "Actors" },
  { id: "items", label: "Items" },
  { id: "journals", label: "Journals" },
  { id: "handouts", label: "Handouts" },
  { id: "chat", label: "Chat" },
  { id: "rolls", label: "Rolls" },
  { id: "diceMacros", label: "Dice macros" },
  { id: "encounters", label: "Encounters" },
  { id: "combats", label: "Combats" },
  { id: "contentImports", label: "Import batches" },
  { id: "fogPresets", label: "Fog presets" },
  { id: "audioTracks", label: "Audio" },
  { id: "campaignSessions", label: "Sessions" },
  { id: "compendia", label: "Compendia" },
  { id: "proposals", label: "Proposals" },
  { id: "aiThreads", label: "AI threads" },
  { id: "aiEvaluations", label: "AI evaluations" },
  { id: "aiMemory", label: "AI memory" },
  { id: "aiToolCalls", label: "AI tool calls" },
  { id: "auditLogs", label: "Audit logs" },
  { id: "permissionGrants", label: "Permission grants" },
  { id: "pluginStorage", label: "Plugin storage" }
] as const;

export type ArchiveExportCollection = (typeof archiveExportCollectionOptions)[number]["id"];

type ArchiveEstimateSnapshot = Pick<
  Snapshot,
  | "campaigns" | "members" | "history" | "worldRecords" | "worldRelations" | "scenes" | "fogPresets"
  | "assets" | "tokens" | "actors" | "calculationOverrides" | "items" | "journals" | "chat" | "rolls"
  | "diceMacros" | "audioTracks" | "encounters" | "campaignSessions" | "combats" | "combatAudit" | "proposals"
  | "contentImports" | "memory" | "aiThreads" | "aiToolCalls"
>;

export interface ArchiveExportEstimateInput {
  campaignId: string;
  scope: ArchiveExportScope;
  worldId: string;
  collections: readonly ArchiveExportCollection[];
  snapshot: ArchiveEstimateSnapshot;
  worlds: readonly WorldAtlasWorld[];
  handouts: readonly HandoutLibraryItem[];
}

type KnownArchiveCollection = ArchiveExportCollection | "worldRecords" | "worldRelations" | "calculationOverrides" | "characterTransfers";

const allKnownArchiveCollections: readonly KnownArchiveCollection[] = [
  "worlds", "worldRecords", "worldRelations", "assets", "scenes", "tokens", "actors", "calculationOverrides",
  "characterTransfers", "items", "journals", "handouts", "chat", "rolls", "diceMacros", "audioTracks", "encounters",
  "campaignSessions", "combats", "proposals", "aiThreads", "aiMemory", "aiToolCalls", "auditLogs", "contentImports", "fogPresets"
];

/**
 * Returns a conservative minimum. The browser snapshot intentionally omits
 * some portable collections and bounds history, while the server may add
 * referenced dependency records when it builds the archive.
 */
export function archiveExportMinimumRecordCount(input: ArchiveExportEstimateInput): number | undefined {
  const counts = knownCollectionCounts(input);
  const shellCount = input.snapshot.campaigns.some((campaign) => campaign.id === input.campaignId) ? 1 + input.snapshot.members.filter((member) => member.campaignId === input.campaignId).length : 0;
  if (input.scope === "campaign") return shellCount + sumCollections(allKnownArchiveCollections, counts);
  if (input.scope === "selected_collections") return shellCount + sumCollections(input.collections, counts);
  return worldMinimumRecordCount(input, shellCount);
}

function knownCollectionCounts(input: ArchiveExportEstimateInput): Partial<Record<KnownArchiveCollection, number>> {
  const { snapshot } = input;
  const historyTotal = (key: string, visible: number) => Math.max(visible, snapshot.history?.collections[key]?.total ?? visible);
  return {
    worlds: input.worlds.length,
    worldRecords: snapshot.worldRecords.length,
    worldRelations: snapshot.worldRelations.length,
    assets: snapshot.assets.length,
    scenes: snapshot.scenes.length,
    tokens: snapshot.tokens.length,
    actors: snapshot.actors.length,
    calculationOverrides: snapshot.calculationOverrides.length,
    characterTransfers: historyTotal("characterTransfers", 0),
    items: snapshot.items.length,
    journals: snapshot.journals.length,
    handouts: input.handouts.length,
    chat: historyTotal("chat", snapshot.chat.length),
    rolls: historyTotal("rolls", snapshot.rolls.length),
    diceMacros: snapshot.diceMacros.length,
    audioTracks: snapshot.audioTracks.length,
    encounters: snapshot.encounters.length,
    campaignSessions: historyTotal("campaignSessions", snapshot.campaignSessions?.length ?? 0),
    combats: historyTotal("combats", snapshot.combats.length),
    proposals: historyTotal("proposals", snapshot.proposals.length),
    aiThreads: historyTotal("bundled.aiThreads", snapshot.aiThreads.length),
    aiMemory: snapshot.memory.length,
    aiToolCalls: historyTotal("bundled.aiToolCalls", snapshot.aiToolCalls.length),
    auditLogs: historyTotal("bundled.combatAudit", snapshot.combatAudit.length),
    contentImports: historyTotal("bundled.contentImports", snapshot.contentImports.length),
    fogPresets: snapshot.fogPresets.length
  };
}

function worldMinimumRecordCount(input: ArchiveExportEstimateInput, shellCount: number): number | undefined {
  const { snapshot, worldId } = input;
  if (!worldId || !input.worlds.some((world) => world.id === worldId)) return undefined;
  const scenes = snapshot.scenes.filter((scene) => scene.worldId === worldId);
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const tokens = snapshot.tokens.filter((token) => sceneIds.has(token.sceneId));
  const tokenIds = new Set(tokens.map((token) => token.id));
  const linkedActorIds = new Set(tokens.map((token) => token.actorId).filter((id): id is string => Boolean(id)));
  const actors = snapshot.actors.filter((actor) => actor.worldId === worldId || linkedActorIds.has(actor.id));
  const actorIds = new Set(actors.map((actor) => actor.id));
  const assetIds = new Set([
    ...scenes.map((scene) => scene.backgroundAssetId),
    ...tokens.map((token) => token.imageAssetId),
    ...actors.map((actor) => actor.imageAssetId),
    ...input.handouts.filter((handout) => handout.worldId === worldId).flatMap((handout) => handout.assetIds)
  ].filter((id): id is string => Boolean(id)));
  return shellCount
    + 1
    + snapshot.worldRecords.filter((record) => record.worldId === worldId).length
    + snapshot.worldRelations.filter((relation) => relation.worldId === worldId).length
    + scenes.length
    + tokens.length
    + actors.length
    + snapshot.calculationOverrides.filter((override) => actorIds.has(override.actorId)).length
    + snapshot.items.filter((item) => item.worldId === worldId || (item.actorId !== undefined && actorIds.has(item.actorId))).length
    + snapshot.journals.filter((journal) => journal.worldId === worldId).length
    + input.handouts.filter((handout) => handout.worldId === worldId).length
    + snapshot.encounters.filter((encounter) => encounter.worldId === worldId || encounter.tokenIds.some((id) => tokenIds.has(id))).length
    + snapshot.chat.filter((message) => message.sceneId !== undefined && sceneIds.has(message.sceneId)).length
    + snapshot.fogPresets.filter((preset) => preset.sourceSceneId !== undefined && sceneIds.has(preset.sourceSceneId)).length
    + snapshot.memory.filter((fact) => fact.worldId === worldId).length
    + snapshot.assets.filter((asset) => assetIds.has(asset.id)).length;
}

function sumCollections(collections: readonly KnownArchiveCollection[], counts: Partial<Record<KnownArchiveCollection, number>>): number {
  return collections.reduce((sum, collection) => sum + (counts[collection] ?? 0), 0);
}
