export interface LocalDraftEnvelope<T> {
  version: 1;
  savedAt: string;
  value: T;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LocalDraftReadResult<T> =
  | { status: "missing" }
  | { status: "ready"; value: T; savedAt: string }
  | { status: "unsupported"; rawValue: string; version?: unknown }
  | { status: "corrupt"; rawValue: string };

export function localDraftKey(kind: string, ...scope: string[]): string {
  return `otte:draft:${kind}:v1:${scope.map((part) => encodeURIComponent(part)).join(":")}`;
}

export function readLocalDraft<T>(key: string, storage: DraftStorage | undefined = browserStorage()): T | undefined {
  const result = inspectLocalDraft<T>(key, storage);
  return result.status === "ready" ? result.value : undefined;
}

/** Reads without deleting data that a newer client or a manual recovery may understand. */
export function inspectLocalDraft<T>(key: string, storage: DraftStorage | undefined = browserStorage()): LocalDraftReadResult<T> {
  if (!storage) return { status: "missing" };
  const rawValue = storage.getItem(key);
  if (rawValue === null) return { status: "missing" };
  try {
    const parsed = JSON.parse(rawValue) as Partial<LocalDraftEnvelope<T>> | null;
    if (parsed?.version === 1 && parsed.value !== undefined) {
      return { status: "ready", value: parsed.value, savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "" };
    }
    const version = parsed && typeof parsed === "object" ? (parsed as { version?: unknown }).version : undefined;
    return { status: "unsupported", rawValue, ...(version !== undefined ? { version } : {}) };
  } catch {
    return { status: "corrupt", rawValue };
  }
}

export function writeLocalDraft<T>(key: string, value: T, storage: DraftStorage | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), value } satisfies LocalDraftEnvelope<T>));
    return true;
  } catch {
    // Draft persistence is a recovery aid. Storage quotas or privacy settings
    // must never prevent the editor itself from working.
    return false;
  }
}

export function removeLocalDraft(key: string, storage: DraftStorage | undefined = browserStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Treat unavailable browser storage as an already-cleared draft.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
