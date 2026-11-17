import { ApiError } from "./api.js";

/**
 * Produces one stable key for one resource revision and intent. Retrying the
 * same draft reuses the key, while reviewing a newer revision produces a new
 * attempt key.
 */
export function sharedMutationIdempotencyKey(scope: string, expectedUpdatedAt: string, payload: unknown): string {
  const input = `${scope}\u0000${expectedUpdatedAt}\u0000${JSON.stringify(payload)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `shared:${scope}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isStaleWriteError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.status !== 409 || typeof error.body !== "object" || error.body === null) return false;
  const body = error.body as { code?: unknown; error?: unknown };
  return body.code === "stale_write" || body.error === "stale_write";
}

export const staleDraftPreservedMessage = "This record changed elsewhere. The latest revision is loaded; your draft is preserved. Review and retry.";
