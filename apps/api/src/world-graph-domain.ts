import type {
  WorldRecord,
  WorldRecordKind,
  WorldRecordLifecycle,
  WorldRelation,
  WorldRelationType,
} from "@open-tabletop/core";
import type { StateStore } from "./store.js";

export interface WorldRecordMutationBody {
  worldId?: unknown;
  kind?: unknown;
  name?: unknown;
  summary?: unknown;
  description?: unknown;
  lifecycle?: unknown;
  visibility?: unknown;
  tags?: unknown;
  metadata?: unknown;
  expectedUpdatedAt?: unknown;
  expectedCampaignUpdatedAt?: unknown;
}

export interface WorldRelationMutationBody {
  worldId?: unknown;
  sourceRecordId?: unknown;
  targetRecordId?: unknown;
  type?: unknown;
  label?: unknown;
  notes?: unknown;
  visibility?: unknown;
  expectedUpdatedAt?: unknown;
  expectedCampaignUpdatedAt?: unknown;
}

export type WorldRecordMutableFields = Pick<
  WorldRecord,
  "worldId" | "kind" | "name" | "summary" | "description" | "lifecycle" | "visibility" | "tags" | "metadata"
>;
export type WorldRelationMutableFields = Pick<
  WorldRelation,
  "worldId" | "sourceRecordId" | "targetRecordId" | "type" | "label" | "notes" | "visibility"
>;

const MAX_METADATA_BYTES = 16 * 1024;
const MAX_METADATA_DEPTH = 8;
const MAX_METADATA_KEYS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeBoundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : undefined;
}

function validateMetadataShape(value: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "World record metadata must be an object" };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, error: "World record metadata must be JSON serializable" };
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    return { ok: false, error: `World record metadata must be no larger than ${MAX_METADATA_BYTES} bytes` };
  }
  let keyCount = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (depth > MAX_METADATA_DEPTH) return false;
    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_METADATA_KEYS) return false;
      return candidate.every((entry) => visit(entry, depth + 1));
    }
    if (!isRecord(candidate)) return false;
    const entries = Object.entries(candidate);
    keyCount += entries.length;
    if (keyCount > MAX_METADATA_KEYS) return false;
    return entries.every(([key, entry]) => key.length <= 128 && visit(entry, depth + 1));
  };
  if (!visit(value, 1)) {
    return { ok: false, error: `World record metadata exceeds the ${MAX_METADATA_DEPTH}-level or ${MAX_METADATA_KEYS}-key structural limit` };
  }
  return { ok: true, value: structuredClone(value) };
}

export function normalizeWorldRecordKind(value: unknown): WorldRecordKind | undefined {
  return value === "npc" || value === "location" || value === "quest" || value === "faction" ? value : undefined;
}

export function normalizeWorldRecordLifecycle(value: unknown): WorldRecordLifecycle | undefined {
  return value === "draft" || value === "active" || value === "inactive" || value === "resolved" || value === "archived" ? value : undefined;
}

export function normalizeWorldRecordMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRecordMutationBody,
  create: true,
): { ok: true; value: WorldRecordMutableFields } | { ok: false; error: string };
export function normalizeWorldRecordMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRecordMutationBody,
  create: false,
): { ok: true; value: Partial<WorldRecordMutableFields> } | { ok: false; error: string };
export function normalizeWorldRecordMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRecordMutationBody,
  create: boolean,
): { ok: true; value: Partial<WorldRecordMutableFields> } | { ok: false; error: string } {
  const value: Partial<WorldRecordMutableFields> = {};
  if (create || body.kind !== undefined) {
    const kind = normalizeWorldRecordKind(body.kind);
    if (!kind) return { ok: false, error: "World record kind must be npc, location, quest, or faction" };
    value.kind = kind;
  }
  if (create || body.name !== undefined) {
    const name = normalizeBoundedText(body.name, 160);
    if (!name) return { ok: false, error: "World record name must be 1-160 characters" };
    value.name = name;
  }
  for (const [field, limit] of [["summary", 500], ["description", 20_000]] as const) {
    if (!create && body[field] === undefined) continue;
    const normalized = normalizeBoundedText(body[field] ?? "", limit);
    if (normalized === undefined) return { ok: false, error: `World record ${field} must be no longer than ${limit} characters` };
    value[field] = normalized;
  }
  if (create || body.lifecycle !== undefined) {
    const lifecycle = body.lifecycle === undefined ? "draft" : normalizeWorldRecordLifecycle(body.lifecycle);
    if (!lifecycle) return { ok: false, error: "World record lifecycle must be draft, active, inactive, resolved, or archived" };
    value.lifecycle = lifecycle;
  }
  if (create || body.visibility !== undefined) {
    const visibility = body.visibility ?? "gm_only";
    if (visibility !== "gm_only" && visibility !== "public") return { ok: false, error: "World record visibility must be gm_only or public" };
    value.visibility = visibility;
  }
  if (body.worldId !== undefined) {
    if (body.worldId === null || body.worldId === "") value.worldId = undefined;
    else if (typeof body.worldId !== "string" || !store.state.worlds.some((world) => world.id === body.worldId && world.campaignId === campaignId)) return { ok: false, error: "World record worldId must reference a world in the same campaign" };
    else value.worldId = body.worldId;
  } else if (create) value.worldId = undefined;
  if (create || body.tags !== undefined) {
    if (body.tags !== undefined && (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string"))) return { ok: false, error: "World record tags must be an array of strings" };
    const tags = [...new Set(((body.tags as string[] | undefined) ?? []).map((tag) => tag.trim()).filter(Boolean))];
    if (tags.length > 50 || tags.some((tag) => tag.length > 40)) return { ok: false, error: "World records support at most 50 tags of 40 characters each" };
    value.tags = tags;
  }
  if (create || body.metadata !== undefined) {
    const metadata = validateMetadataShape(body.metadata ?? {});
    if (!metadata.ok) return metadata;
    value.metadata = metadata.value;
  }
  return { ok: true, value };
}

export function normalizeWorldRelationType(value: unknown): WorldRelationType | undefined {
  return value === "located_in" || value === "member_of" || value === "allied_with" || value === "opposed_to" || value === "serves" || value === "leads" || value === "involved_in" || value === "related_to" ? value : undefined;
}

export function normalizeWorldRelationMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRelationMutationBody,
  create: true,
  current?: WorldRelation,
): { ok: true; value: WorldRelationMutableFields } | { ok: false; error: string };
export function normalizeWorldRelationMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRelationMutationBody,
  create: false,
  current: WorldRelation,
): { ok: true; value: Partial<WorldRelationMutableFields> } | { ok: false; error: string };
export function normalizeWorldRelationMutation(
  store: StateStore,
  campaignId: string,
  body: WorldRelationMutationBody,
  create: boolean,
  current?: WorldRelation,
): { ok: true; value: Partial<WorldRelationMutableFields> } | { ok: false; error: string } {
  const value: Partial<WorldRelationMutableFields> = {};
  const sourceRecordId = typeof body.sourceRecordId === "string" ? body.sourceRecordId.trim() : current?.sourceRecordId;
  const targetRecordId = typeof body.targetRecordId === "string" ? body.targetRecordId.trim() : current?.targetRecordId;
  if (!sourceRecordId || !targetRecordId) return { ok: false, error: "World relation sourceRecordId and targetRecordId are required" };
  if (sourceRecordId === targetRecordId) return { ok: false, error: "World relations cannot point a record to itself" };
  if (!store.state.worldRecords.some((record) => record.id === sourceRecordId && record.campaignId === campaignId) || !store.state.worldRecords.some((record) => record.id === targetRecordId && record.campaignId === campaignId)) return { ok: false, error: "World relation endpoints must be records in the same campaign" };
  if (create || body.sourceRecordId !== undefined) value.sourceRecordId = sourceRecordId;
  if (create || body.targetRecordId !== undefined) value.targetRecordId = targetRecordId;
  if (create || body.type !== undefined) {
    const type = normalizeWorldRelationType(body.type);
    if (!type) return { ok: false, error: "World relation type is not supported" };
    value.type = type;
  }
  if (create || body.visibility !== undefined) {
    const visibility = body.visibility ?? "gm_only";
    if (visibility !== "gm_only" && visibility !== "public") return { ok: false, error: "World relation visibility must be gm_only or public" };
    value.visibility = visibility;
  }
  for (const [field, limit] of [["label", 160], ["notes", 2_000]] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === "") value[field] = undefined;
    else {
      const normalized = normalizeBoundedText(body[field], limit);
      if (!normalized) return { ok: false, error: `World relation ${field} must be 1-${limit} characters` };
      value[field] = normalized;
    }
  }
  if (body.worldId !== undefined) {
    if (body.worldId === null || body.worldId === "") value.worldId = undefined;
    else if (typeof body.worldId !== "string" || !store.state.worlds.some((world) => world.id === body.worldId && world.campaignId === campaignId)) return { ok: false, error: "World relation worldId must reference a world in the same campaign" };
    else value.worldId = body.worldId;
  } else if (create) value.worldId = undefined;
  return { ok: true, value };
}

export function applyWorldRecordLifecycleTimestamps(record: WorldRecord, lifecycle: WorldRecordLifecycle, changedAt: string): void {
  record.resolvedAt = lifecycle === "resolved" ? changedAt : undefined;
  record.archivedAt = lifecycle === "archived" ? changedAt : undefined;
}
