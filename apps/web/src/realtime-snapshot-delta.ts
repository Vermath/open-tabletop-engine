export const realtimeHistoryLimit = 200;

export function upsertRealtimeRecord<T extends { id: string }>(records: readonly T[], next: T): T[] {
  return records.some((record) => record.id === next.id)
    ? records.map((record) => (record.id === next.id ? next : record))
    : [...records, next];
}

/** Reject an older revision so a delayed socket event cannot undo an HTTP result. */
export function upsertNewestRealtimeRecord<T extends { id: string; updatedAt: string }>(records: readonly T[], next: T): T[] {
  const current = records.find((record) => record.id === next.id);
  if (current && current.updatedAt > next.updatedAt) return [...records];
  return upsertRealtimeRecord(records, next);
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
