import { createHash } from "node:crypto";
import { emptyState, type Actor, type CampaignArchive, type EngineState, type Item } from "@open-tabletop/core";
import { DND_5E_SRD_SYSTEM_ID, validateDnd5eSrdActor, validateDnd5eSrdItem } from "@open-tabletop/system-sdk";

type ArchiveValidationResult =
  | { ok: true; value: CampaignArchive }
  | { ok: false; error: string };

type FieldRule = {
  field: string;
  valid: (value: unknown) => boolean;
  expected: string;
};

const nonEmptyString = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const stringValue = (value: unknown): boolean => typeof value === "string";
const booleanValue = (value: unknown): boolean => typeof value === "boolean";
const finiteNumber = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
const positiveNumber = (value: unknown): boolean => finiteNumber(value) && (value as number) > 0;
const nonNegativeNumber = (value: unknown): boolean => finiteNumber(value) && (value as number) >= 0;
const nonNegativeInteger = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
const recordValue = (value: unknown): boolean => isRecord(value);
const arrayValue = (value: unknown): boolean => Array.isArray(value);
const stringArray = (value: unknown): boolean => Array.isArray(value) && value.every(nonEmptyString);
const timestamp = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));
const oneOf = (...values: string[]) => (value: unknown): boolean => typeof value === "string" && values.includes(value);

const id = (field: string): FieldRule => ({ field, valid: nonEmptyString, expected: "a non-empty identifier" });
const text = (field: string): FieldRule => ({ field, valid: stringValue, expected: "a string" });
const name = (field: string): FieldRule => ({ field, valid: nonEmptyString, expected: "a non-empty string" });
const number = (field: string): FieldRule => ({ field, valid: finiteNumber, expected: "a finite number" });
const positive = (field: string): FieldRule => ({ field, valid: positiveNumber, expected: "a positive finite number" });
const nonNegative = (field: string): FieldRule => ({ field, valid: nonNegativeNumber, expected: "a non-negative finite number" });
const integer = (field: string): FieldRule => ({ field, valid: nonNegativeInteger, expected: "a non-negative integer" });
const bool = (field: string): FieldRule => ({ field, valid: booleanValue, expected: "a boolean" });
const object = (field: string): FieldRule => ({ field, valid: recordValue, expected: "an object" });
const array = (field: string): FieldRule => ({ field, valid: arrayValue, expected: "an array" });
const ids = (field: string): FieldRule => ({ field, valid: stringArray, expected: "an array of non-empty identifiers" });
const enumeration = (field: string, ...values: string[]): FieldRule => ({
  field,
  valid: oneOf(...values),
  expected: `one of ${values.join(", ")}`
});

const timestampRules: FieldRule[] = [
  { field: "createdAt", valid: timestamp, expected: "a valid timestamp" },
  { field: "updatedAt", valid: timestamp, expected: "a valid timestamp" }
];

const archiveRecordRules: Partial<Record<keyof EngineState, FieldRule[]>> = {
  users: [name("displayName")],
  campaigns: [
    id("ownerUserId"),
    name("name"),
    text("description"),
    id("defaultSystemId"),
    enumeration("visibility", "private", "invite_only", "public")
  ],
  members: [id("campaignId"), id("userId"), enumeration("role", "owner", "gm", "assistant_gm", "player", "observer", "plugin", "ai_assistant")],
  worlds: [id("campaignId"), name("name"), text("description")],
  scenes: [
    id("campaignId"),
    name("name"),
    positive("width"),
    positive("height"),
    enumeration("gridType", "square", "gridless"),
    positive("gridSize"),
    bool("active"),
    number("sortOrder"),
    array("fog"),
    array("walls"),
    array("lights"),
    object("metadata")
  ],
  assets: [id("campaignId"), name("name"), text("url"), name("mimeType"), integer("sizeBytes")],
  tokens: [
    id("sceneId"),
    name("name"),
    number("x"),
    number("y"),
    positive("width"),
    positive("height"),
    number("rotation"),
    bool("hidden"),
    bool("locked"),
    bool("visionEnabled"),
    nonNegative("visionRadius"),
    enumeration("disposition", "friendly", "neutral", "hostile"),
    object("metadata")
  ],
  actors: [id("campaignId"), id("systemId"), name("type"), name("name"), object("data"), object("permissions")],
  characterTransfers: [
    id("campaignId"),
    id("actorId"),
    id("toUserId"),
    id("initiatedByUserId"),
    { field: "actorUpdatedAt", valid: timestamp, expected: "a valid timestamp" },
    enumeration("status", "pending", "accepted", "declined", "cancelled")
  ],
  items: [id("campaignId"), id("systemId"), name("type"), name("name"), object("data")],
  journals: [
    id("campaignId"),
    name("title"),
    text("body"),
    enumeration("visibility", "gm_only", "public", "specific_players", "specific_characters"),
    ids("visibleToUserIds"),
    ids("visibleToActorIds"),
    { field: "tags", valid: stringArray, expected: "an array of strings" },
    id("createdBy"),
    id("updatedBy")
  ],
  handouts: [
    id("campaignId"),
    name("title"),
    text("body"),
    enumeration("visibility", "gm_only", "public", "specific_players", "specific_characters"),
    ids("assetIds")
  ],
  chat: [
    id("campaignId"),
    id("userId"),
    enumeration("type", "plain", "emote", "whisper", "roll", "system", "gm", "ooc", "ai", "plugin"),
    text("body"),
    enumeration("visibility", "public", "gm_only", "whisper"),
    ids("recipientUserIds")
  ],
  rolls: [id("campaignId"), id("userId"), name("formula"), enumeration("visibility", "public", "gm_only", "whisper"), array("terms"), number("total")],
  diceMacros: [id("campaignId"), id("createdBy"), name("name"), name("formula"), enumeration("visibility", "public", "gm_only")],
  audioTracks: [
    id("campaignId"),
    id("createdBy"),
    name("name"),
    text("url"),
    enumeration("kind", "music", "ambient", "sfx"),
    bool("loop"),
    bool("playing"),
    nonNegative("volume")
  ],
  encounters: [id("campaignId"), name("name"), text("summary"), ids("tokenIds")],
  campaignSessions: [
    id("campaignId"),
    enumeration("status", "planned", "live", "completed"),
    name("title"),
    integer("number"),
    text("agenda"),
    text("notes"),
    ids("sceneIds"),
    ids("encounterIds"),
    id("createdBy"),
    id("updatedBy")
  ],
  combats: [id("campaignId"), bool("active"), integer("round"), integer("turnIndex"), array("combatants")],
  compendia: [id("systemId"), name("name"), array("entries")],
  proposals: [
    id("campaignId"),
    enumeration("createdByType", "user", "ai", "plugin"),
    name("title"),
    text("summary"),
    enumeration("status", "draft", "pending", "approved", "rejected", "applied", "reverted"),
    array("changesJson"),
    object("diffJson"),
    bool("approvalRequired")
  ],
  aiThreads: [id("campaignId"), id("userId"), name("provider"), name("title")],
  aiEvaluations: [
    id("campaignId"),
    id("userId"),
    id("threadId"),
    name("provider"),
    name("name"),
    enumeration("status", "passed", "failed"),
    number("score"),
    text("summary"),
    array("checks")
  ],
  aiMemory: [id("campaignId"), text("text"), enumeration("visibility", "gm_only", "public", "specific_players", "specific_characters"), ids("sourceIds")],
  aiToolCalls: [id("threadId"), name("toolName"), enumeration("status", "started", "completed", "failed")],
  auditLogs: [enumeration("actorType", "user", "ai", "plugin", "system"), name("action"), name("targetType")],
  permissionGrants: [
    enumeration("subjectType", "user", "role", "plugin", "ai_assistant"),
    id("subjectId"),
    id("campaignId"),
    { field: "permissions", valid: stringArray, expected: "an array of permission names" }
  ],
  pluginStorage: [id("campaignId"), id("pluginId"), name("key"), enumeration("updatedByType", "user", "plugin"), id("updatedById")],
  contentImports: [id("campaignId"), enumeration("status", "previewed", "applied", "rolled_back", "deleted"), object("source"), array("entities"), ids("selectedEntityIds"), array("appliedRecords")],
  fogPresets: [id("campaignId"), name("name"), array("regions"), object("metadata")]
};

/**
 * Campaign archives are JSON objects and are intentionally extensible, but
 * records that enter EngineState must satisfy the required runtime shape. This
 * validation runs before identity normalization, object writes, or state merge.
 */
export function validateCampaignArchiveShape(
  value: unknown,
  options: { maxAssetBytes: number }
): ArchiveValidationResult {
  if (!isRecord(value) || typeof value.format !== "string" || typeof value.version !== "string" || !isRecord(value.manifest) || !isRecord(value.data)) {
    return { ok: false, error: "Campaign archive must include format, version, manifest, and data" };
  }
  const manifest = value.manifest;
  const data = value.data;
  if (!timestamp(value.exportedAt)) return { ok: false, error: "Campaign archive exportedAt must be a valid timestamp" };

  const manifestRules: FieldRule[] = [
    id("campaignId"),
    name("name"),
    name("schemaVersion"),
    integer("assetCount")
  ];
  for (const rule of manifestRules) {
    if (!rule.valid(manifest[rule.field])) {
      return { ok: false, error: `Campaign archive manifest ${rule.field} must be ${rule.expected}` };
    }
  }
  if (manifest.assetFileCount !== undefined && !nonNegativeInteger(manifest.assetFileCount)) {
    return { ok: false, error: "Campaign archive manifest assetFileCount must be a non-negative integer" };
  }

  const defaults = emptyState() as unknown as Record<string, unknown>;
  for (const [collection, defaultValue] of Object.entries(defaults)) {
    if (!Array.isArray(defaultValue)) continue;
    const records = data[collection];
    if (records === undefined) continue;
    if (!Array.isArray(records)) return { ok: false, error: `Campaign archive ${collection} must be an array` };
    if (collection === "campaignArchiveImportOperations" && records.length > 0) {
      return { ok: false, error: "Campaign archive operational recovery data is not portable" };
    }
    const seenIds = new Set<string>();
    const rules = archiveRecordRules[collection as keyof EngineState] ?? [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!isRecord(record) || !nonEmptyString(record.id)) {
        return { ok: false, error: `Campaign archive ${collection} record ${index + 1} must be an object with a non-empty id` };
      }
      const recordId = record.id as string;
      if (seenIds.has(recordId)) return { ok: false, error: `Campaign archive ${collection} contains duplicate id ${recordId}` };
      seenIds.add(recordId);
      for (const rule of [...rules, ...timestampRules]) {
        if (!rule.valid(record[rule.field])) {
          return { ok: false, error: `Campaign archive ${collection} record ${recordId} field ${rule.field} must be ${rule.expected}` };
        }
      }
      const nestedError = validateNestedArchiveRecord(collection, record);
      if (nestedError) return { ok: false, error: `Campaign archive ${collection} record ${recordId}: ${nestedError}` };
      const dndValidationError = validateDndArchiveRecord(collection, record);
      if (dndValidationError) return { ok: false, error: `Campaign archive ${collection} record ${recordId}: ${dndValidationError}` };
    }
  }

  const assets = Array.isArray(data.assets) ? data.assets.filter(isRecord) : [];
  if (manifest.assetCount !== assets.length) {
    return { ok: false, error: `Campaign archive manifest assetCount ${manifest.assetCount} does not match ${assets.length} asset records` };
  }
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns.filter(isRecord) : [];
  if (campaigns.length > 0 && !campaigns.some((campaign) => campaign.id === manifest.campaignId)) {
    return { ok: false, error: `Campaign archive manifest campaignId ${manifest.campaignId} does not match an archived campaign` };
  }

  const files = value.files ?? [];
  if (!Array.isArray(files)) return { ok: false, error: "Campaign archive files must be an array" };
  if (manifest.assetFileCount !== undefined && manifest.assetFileCount !== files.length) {
    return { ok: false, error: `Campaign archive manifest assetFileCount ${manifest.assetFileCount} does not match ${files.length} embedded files` };
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const seenFileAssetIds = new Set<string>();
  let embeddedAssetBytes = 0;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!isRecord(file) || !nonEmptyString(file.assetId) || !nonEmptyString(file.name) || !nonEmptyString(file.mimeType) ||
      !nonNegativeInteger(file.sizeBytes) || !nonEmptyString(file.checksum) || file.encoding !== "base64" || typeof file.data !== "string") {
      return { ok: false, error: `Campaign archive file ${index + 1} must be a valid base64 asset record` };
    }
    const assetId = file.assetId as string;
    const fileSizeBytes = file.sizeBytes as number;
    const fileData = file.data;
    const fileChecksum = file.checksum as string;
    if (fileSizeBytes > options.maxAssetBytes) {
      return { ok: false, error: `Campaign archive file ${assetId} exceeds the configured per-asset limit` };
    }
    embeddedAssetBytes += fileSizeBytes;
    if (embeddedAssetBytes > campaignArchiveEmbeddedAssetMaxBytes()) {
      return { ok: false, error: "Campaign archive embedded assets exceed the configured aggregate limit" };
    }
    const actualChecksum = canonicalBase64Checksum(fileData, fileSizeBytes);
    if (!actualChecksum) {
      return { ok: false, error: `Campaign archive file ${assetId} contains invalid base64 data` };
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(fileChecksum)) {
      return { ok: false, error: `Campaign archive file ${assetId} checksum must use sha256:<hex>` };
    }
    if (actualChecksum !== fileChecksum) {
      return { ok: false, error: `Archive asset file restore failed: Archive file checksum mismatch: ${assetId}` };
    }
    if (seenFileAssetIds.has(assetId)) return { ok: false, error: `Campaign archive contains duplicate embedded file for asset ${assetId}` };
    seenFileAssetIds.add(assetId);
    const asset = assetsById.get(assetId);
    if (!asset) return { ok: false, error: `Campaign archive file ${assetId} does not match an asset record` };
    if (asset.sizeBytes !== fileSizeBytes || asset.mimeType !== file.mimeType) {
      return { ok: false, error: `Campaign archive file ${assetId} metadata does not match its asset record` };
    }
    if (asset.checksum !== undefined && asset.checksum !== actualChecksum) {
      return { ok: false, error: `Archive asset file restore failed: Asset metadata checksum mismatch: ${assetId}` };
    }
  }

  return { ok: true, value: value as unknown as CampaignArchive };
}

function validateDndArchiveRecord(collection: string, record: Record<string, unknown>): string | undefined {
  if (record.systemId !== DND_5E_SRD_SYSTEM_ID || (collection !== "actors" && collection !== "items")) return undefined;
  const report = collection === "actors"
    ? validateDnd5eSrdActor(record as unknown as Actor)
    : validateDnd5eSrdItem(record as unknown as Item);
  // An archive restore is an authoritative state transition. Missing required
  // D&D fields are therefore just as blocking as invalid present fields. Older
  // archive versions must be upgraded explicitly before they can be accepted;
  // silently persisting an incomplete actor/item makes a successful restore
  // unusable and defeats the portability promise.
  const blocking = report.issues.find((entry) => entry.severity === "error");
  if (!blocking) return undefined;
  return `D&D ${report.rulesVersion} schema ${report.schemaVersion} validation failed at ${blocking.path || "/"} (${blocking.code}): ${blocking.message}`;
}

export function campaignArchiveImportMaxBytes(): number {
  const configured = process.env.OTTE_CAMPAIGN_ARCHIVE_IMPORT_MAX_BYTES?.trim();
  if (!configured) return 64 * 1024 * 1024;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return 64 * 1024 * 1024;
  return Math.max(2 * 1024 * 1024, Math.min(256 * 1024 * 1024, Math.floor(parsed)));
}

export function campaignArchiveEmbeddedAssetMaxBytes(): number {
  const configured = process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES?.trim();
  if (!configured) return 48 * 1024 * 1024;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return 48 * 1024 * 1024;
  return Math.max(1 * 1024 * 1024, Math.min(192 * 1024 * 1024, Math.floor(parsed)));
}

export function campaignArchiveAssetMaxFiles(): number {
  const configured = process.env.OTTE_CAMPAIGN_ARCHIVE_ASSET_MAX_FILES?.trim();
  if (!configured) return 10_000;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return 10_000;
  return Math.max(1, Math.min(100_000, Math.floor(parsed)));
}

function validateNestedArchiveRecord(collection: string, record: Record<string, unknown>): string | undefined {
  if (collection === "journals") {
    if (record.kind !== undefined && !oneOf("folder", "entry")(record.kind)) return "kind must be folder or entry";
    if (record.canonStatus !== undefined && !oneOf("draft", "in_review", "canonical", "rejected")(record.canonStatus)) return "canonStatus must be a supported review state";
    if (record.revision !== undefined && (!Number.isInteger(record.revision) || (record.revision as number) < 1)) return "revision must be a positive integer";
    if (record.links !== undefined) {
      const linkError = validateNestedRecords(
        record.links,
        [id("id"), enumeration("targetType", "actor", "scene", "item", "journal", "handout", "encounter"), id("targetId")],
        "links"
      );
      if (linkError) return linkError;
      if ((record.links as Array<Record<string, unknown>>).some((link) => link.label !== undefined && (typeof link.label !== "string" || link.label.length > 120))) {
        return "links labels must be strings no longer than 120 characters";
      }
    }
    if (record.revisions !== undefined) {
      const revisionError = validateNestedRecords(
        record.revisions,
        [
          id("id"),
          { field: "revision", valid: (value) => Number.isInteger(value) && (value as number) >= 1, expected: "a positive integer" },
          enumeration("kind", "folder", "entry"),
          name("title"),
          text("body"),
          enumeration("visibility", "gm_only", "public", "specific_players", "specific_characters"),
          ids("visibleToUserIds"),
          ids("visibleToActorIds"),
          { field: "tags", valid: stringArray, expected: "an array of strings" },
          array("links"),
          enumeration("canonStatus", "draft", "in_review", "canonical", "rejected"),
          id("changedBy"),
          { field: "createdAt", valid: timestamp, expected: "a valid timestamp" }
        ],
        "revisions"
      );
      if (revisionError) return revisionError;
    }
  }
  if (collection === "scenes") {
    for (const [field, rules] of [
      ["walls", [id("id"), number("x1"), number("y1"), number("x2"), number("y2"), bool("blocksVision")]],
      ["lights", [id("id"), number("x"), number("y"), nonNegative("radius"), text("color")]]
    ] as Array<[string, FieldRule[]]>) {
      const error = validateNestedRecords(record[field], rules, field);
      if (error) return error;
    }
    if (record.difficultTerrain !== undefined) {
      const terrainError = validateNestedRecords(
        record.difficultTerrain,
        [id("id"), id("sceneId"), name("label"), array("points"), id("createdByUserId"), ...timestampRules],
        "difficultTerrain"
      );
      if (terrainError) return terrainError;
      for (const [index, region] of (record.difficultTerrain as unknown[]).entries()) {
        if (!isRecord(region) || !Array.isArray(region.points) || region.points.length < 3 || region.points.length > 64) {
          return `difficultTerrain entry ${index + 1} points must contain 3-64 coordinates`;
        }
        if (region.points.some((point) => !isRecord(point) || !finiteNumber(point.x) || !finiteNumber(point.y))) {
          return `difficultTerrain entry ${index + 1} points must use finite x and y coordinates`;
        }
      }
    }
    if (record.coverOverrides !== undefined) {
      const coverError = validateNestedRecords(
        record.coverOverrides,
        [id("id"), id("sceneId"), id("sourceTokenId"), id("targetTokenId"), enumeration("level", "none", "half", "three_quarters", "total"), id("createdByUserId"), ...timestampRules],
        "coverOverrides"
      );
      if (coverError) return coverError;
    }
  }
  if (collection === "combats") {
    const combatantError = validateNestedRecords(
      record.combatants,
      [id("id"), id("tokenId"), name("name"), number("initiative"), bool("defeated")],
      "combatants"
    );
    if (combatantError) return combatantError;
    if (record.actions !== undefined) {
      const actionError = validateNestedRecords(
        record.actions,
        [id("id"), id("campaignId"), id("combatId"), id("actorId"), ids("targetActorIds"), array("actorUpdates")],
        "actions"
      );
      if (actionError) return actionError;
    }
    if (record.rewards !== undefined) {
      const rewardError = validateNestedRecords(
        record.rewards,
        [
          id("id"),
          id("campaignId"),
          id("combatId"),
          id("awardedByUserId"),
          ids("recipientActorIds"),
          integer("totalXp"),
          integer("xpPerActor"),
          integer("unallocatedXp"),
          integer("totalGp"),
          integer("gpPerActor"),
          integer("unallocatedGp"),
          { field: "loot", valid: stringArray, expected: "an array of non-empty strings" },
          ...timestampRules
        ],
        "rewards"
      );
      if (rewardError) return rewardError;
    }
  }
  if (collection === "compendia") {
    const entryError = validateNestedRecords(record.entries, [id("id"), enumeration("type", "actor", "item", "journal", "scene"), name("name")], "entries");
    if (entryError) return entryError;
  }
  if (collection === "proposals") {
    for (const field of ["changesJson", "inverseChangesJson"]) {
      if (record[field] === undefined) continue;
      const error = validateNestedRecords(record[field], [name("entity"), enumeration("action", "create", "update", "delete"), object("data")], field);
      if (error) return error;
    }
  }
  if (collection === "contentImports") {
    const error = validateNestedRecords(record.appliedRecords, [name("collection"), id("id"), id("entityId")], "appliedRecords");
    if (error) return error;
  }
  return undefined;
}

function validateNestedRecords(value: unknown, rules: FieldRule[], label: string): string | undefined {
  if (!Array.isArray(value)) return `${label} must be an array`;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) return `${label} entry ${index + 1} must be an object`;
    for (const rule of rules) {
      if (!rule.valid(item[rule.field])) return `${label} entry ${index + 1} field ${rule.field} must be ${rule.expected}`;
    }
  }
  return undefined;
}

function canonicalBase64Checksum(value: string, sizeBytes: number): string | undefined {
  if (value.length !== Math.ceil(sizeBytes / 3) * 4) return undefined;
  const padding = sizeBytes % 3 === 0 ? 0 : 3 - (sizeBytes % 3);
  const contentLength = value.length - padding;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (index >= contentLength) {
      if (code !== 61) return undefined;
      continue;
    }
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!valid) return undefined;
  }
  const hash = createHash("sha256");
  let decodedBytes = 0;
  const chunkCharacters = 64 * 1024;
  for (let offset = 0; offset < value.length; offset += chunkCharacters) {
    const chunk = Buffer.from(value.slice(offset, Math.min(value.length, offset + chunkCharacters)), "base64");
    decodedBytes += chunk.length;
    if (decodedBytes > sizeBytes) return undefined;
    hash.update(chunk);
  }
  return decodedBytes === sizeBytes ? `sha256:${hash.digest("hex")}` : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
