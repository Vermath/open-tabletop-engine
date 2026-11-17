export const DEFAULT_SNAPSHOT_HISTORY_LIMIT = 200;
export const MAX_SNAPSHOT_HISTORY_LIMIT = 200;

export interface SnapshotHistoryCollectionMeta {
  total: number;
  returned: number;
  truncated: boolean;
}

export interface SnapshotHistoryMeta {
  limit: number;
  collections: Record<string, SnapshotHistoryCollectionMeta>;
}

const TOP_LEVEL_HISTORY_COLLECTIONS = ["campaignSessions", "characterTransfers", "chat", "rolls", "combats", "proposals"] as const;
const BUNDLED_HISTORY_COLLECTIONS = ["contentImports", "aiThreads", "aiToolCalls", "combatAudit"] as const;
const ACTIONABLE_HISTORY_RECORD: Record<string, (record: Record<string, unknown>) => boolean> = {
  campaignSessions: (record) => record.status === "planned" || record.status === "live",
  characterTransfers: (record) => record.status === "pending",
  combats: (record) => record.active === true,
  proposals: (record) => record.status === "draft" || record.status === "pending" || record.status === "approved",
  "bundled.contentImports": (record) => record.status === "previewed" || record.status === "applied",
  "bundled.aiThreads": (record) => record.status === "running",
  "bundled.aiToolCalls": (record) => record.status === "started",
};

export function snapshotHistoryLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_SNAPSHOT_HISTORY_LIMIT;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_SNAPSHOT_HISTORY_LIMIT;
  return Math.min(parsed, MAX_SNAPSHOT_HISTORY_LIMIT);
}

/**
 * Bounds append-only/history collections while leaving the complete active
 * campaign graph (scenes, actors, tokens, items, journals, assets, and worlds)
 * intact. Selection is by newest creation timestamp and preserves the source
 * order expected by existing clients.
 */
export function boundCampaignSnapshotHistory<T extends object>(snapshot: T, requestedLimit?: unknown): T & { history: SnapshotHistoryMeta } {
  const limit = snapshotHistoryLimit(requestedLimit);
  const collections: Record<string, SnapshotHistoryCollectionMeta> = {};
  const mutable = snapshot as Record<string, unknown>;
  for (const key of TOP_LEVEL_HISTORY_COLLECTIONS) boundCollection(mutable, key, limit, collections);
  const bundled = recordValue(mutable.bundled);
  if (bundled) for (const key of BUNDLED_HISTORY_COLLECTIONS) boundCollection(bundled, key, limit, collections, `bundled.${key}`);
  return Object.assign(snapshot, { history: { limit, collections } });
}

function boundCollection(container: Record<string, unknown>, key: string, limit: number, metadata: Record<string, SnapshotHistoryCollectionMeta>, metadataKey = key): void {
  const value = container[key];
  if (!Array.isArray(value)) return;
  const bounded = latestRecords(value, limit, ACTIONABLE_HISTORY_RECORD[metadataKey]);
  container[key] = bounded;
  metadata[metadataKey] = { total: value.length, returned: bounded.length, truncated: bounded.length < value.length };
}

function latestRecords<T>(records: T[], limit: number, actionable?: (record: Record<string, unknown>) => boolean): T[] {
  if (records.length <= limit) return records;
  const selectedIndexes = new Set(
    records
      .map((record, index) => ({ index, timestamp: recordTimestamp(record), actionable: actionable?.(recordValue(record) ?? {}) === true }))
      // Keep actionable state in the bounded view even when its creation date
      // predates a large completed history, then fill remaining slots newest-first.
      .sort((left, right) => Number(right.actionable) - Number(left.actionable) || right.timestamp.localeCompare(left.timestamp) || right.index - left.index)
      .slice(0, limit)
      .map(({ index }) => index),
  );
  return records.filter((_record, index) => selectedIndexes.has(index));
}

function recordTimestamp(value: unknown): string {
  const record = recordValue(value);
  return typeof record?.createdAt === "string" ? record.createdAt : typeof record?.updatedAt === "string" ? record.updatedAt : "";
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
