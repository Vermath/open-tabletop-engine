export const realtimeHistoryLimit = 200;

export function upsertRealtimeRecord<T extends { id: string }>(records: readonly T[], next: T): T[] {
  return records.some((record) => record.id === next.id)
    ? records.map((record) => (record.id === next.id ? next : record))
    : [...records, next];
}

/** Compare values received from the JSON API, including separately parsed copies. */
export function sameSnapshotValue(current: unknown, next: unknown): boolean {
  return Object.is(current, next) || JSON.stringify(current) === JSON.stringify(next);
}

export function changesRealtimeRecord<T extends { updatedAt: string }>(current: T | undefined, next: T): boolean {
  return !current || next.updatedAt > current.updatedAt ||
    (next.updatedAt === current.updatedAt && !sameSnapshotValue(current, next));
}

/** A repeated delivery or an old revision keeps the existing array and its records. */
export function upsertNewestRealtimeRecord<T extends { id: string; updatedAt: string }>(records: T[], next: T): T[] {
  return upsertNewestRealtimeRecords(records, [next]);
}

export function upsertNewestRealtimeRecords<T extends { id: string; updatedAt: string }>(records: T[], updates: readonly T[]): T[] {
  const byId = new Map(updates.map((record) => [record.id, record]));
  let merged = records;
  for (const [index, current] of records.entries()) {
    const next = byId.get(current.id);
    if (!next) continue;
    byId.delete(current.id);
    if (!changesRealtimeRecord(current, next)) continue;
    if (merged === records) merged = [...records];
    merged[index] = next;
  }
  return byId.size > 0 ? [...merged, ...byId.values()] : merged;
}

/** Keep newest-first collections ordered while rejecting an older revision. */
export function upsertNewestPrependedRealtimeRecord<T extends { id: string; updatedAt: string }>(records: readonly T[], next: T): T[] {
  const current = records.find((record) => record.id === next.id);
  if (current && current.updatedAt > next.updatedAt) return [...records];
  return current ? records.map((record) => (record.id === next.id ? next : record)) : [next, ...records];
}

export function upsertBoundedRealtimeRecord<T extends { id: string }>(records: readonly T[], next: T, limit = realtimeHistoryLimit): T[] {
  const updated = upsertRealtimeRecord(records, next);
  return updated.length > limit ? updated.slice(updated.length - limit) : updated;
}

export function removeRealtimeRecord<T extends { id: string }>(records: readonly T[], id: string): T[] {
  return records.filter((record) => record.id !== id);
}
