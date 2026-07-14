import { createHash } from "node:crypto";

export const OPERATOR_TARGET_SET_HASH_PREFIX = "sha256:";
export const OPERATOR_DELIVERY_ID_MAX_LENGTH = 160;

/**
 * Produces the stable identity used to prepare a bulk operator mutation.
 * Callers should include only the target identifiers and exact revisions that
 * make a changed selection unsafe; object keys are canonicalized recursively.
 */
export function operatorTargetSetHash(targets: unknown): string {
  return `${OPERATOR_TARGET_SET_HASH_PREFIX}${createHash("sha256").update(stableJson(targets)).digest("hex")}`;
}

export function normalizeOperatorTargetSetHash(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^sha256:[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}

export function normalizeOperatorDeliveryId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > OPERATOR_DELIVERY_ID_MAX_LENGTH) return undefined;
  if (/[^\x21-\x7e]/.test(normalized)) return undefined;
  return normalized;
}

export function operatorTargetSetMatches(expected: unknown, targets: unknown): boolean {
  const normalized = normalizeOperatorTargetSetHash(expected);
  return normalized !== undefined && normalized === operatorTargetSetHash(targets);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}
