import { createHash } from "node:crypto";
import type {
  Actor,
  Campaign,
  DndCharacterReviewEntry,
  DndCharacterReviewState,
  DndCharacterReviewValidationSnapshot,
  Item,
} from "@open-tabletop/core";
import {
  DND_5E_SRD_LEVEL_ONE_CREATION_MODE,
  DND_5E_SRD_ACTOR_SCHEMA_VERSION,
  DND_5E_SRD_ITEM_SCHEMA_VERSION,
  DND_5E_SRD_VERSION,
  dnd5eSrdCharacterTemplate,
  dnd5eSrdValidateLevelOneCharacterCreation,
  validateDnd5eSrdActor,
  validateDnd5eSrdItem,
  type Dnd5eSrdCharacterOriginOptions,
} from "@open-tabletop/system-sdk";

export const DND_CHARACTER_REVIEW_DATA_KEY = "dnd5eCharacterReview";

const volatileDataKeys = new Set([
  DND_CHARACTER_REVIEW_DATA_KEY,
  "dnd5eControlledCreature",
  "conditions",
  "rulesEngine",
  "deathSaves",
  "temporaryHitPoints",
  "tempHp",
  "current",
  "used",
  "spent",
  "quantity",
  "equipped",
  "prepared",
  "attuned",
]);

export function dndCharacterReviewPolicy(campaign: Campaign): { mode: "optional" | "required"; configured: boolean } {
  return campaign.characterReviewPolicy
    ? { mode: campaign.characterReviewPolicy.mode, configured: true }
    : { mode: "optional", configured: false };
}

export function readDndCharacterReview(actor: Actor): DndCharacterReviewState | undefined {
  const review = actor.data[DND_CHARACTER_REVIEW_DATA_KEY];
  if (!isRecord(review) || review.version !== 1 || typeof review.id !== "string" || typeof review.fingerprint !== "string") return undefined;
  if (!review.validation || !["submitted", "approved", "changes_requested"].includes(String(review.status))) return undefined;
  return review as unknown as DndCharacterReviewState;
}

export function dndCharacterReviewValidation(actor: Actor, items: Item[]): DndCharacterReviewValidationSnapshot {
  const reports = [validateDnd5eSrdActor(actor), ...items.filter((item) => item.actorId === actor.id).map(validateDnd5eSrdItem)];
  const issues = [...reports.flatMap((report) => report.issues.map((issue) => ({
    entityKind: report.entityKind,
    entityId: report.entityId,
    path: issue.path,
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
  }))), ...guidedLevelOneValidationIssues(actor)].sort((left, right) => left.severity.localeCompare(right.severity) || left.entityKind.localeCompare(right.entityKind) || left.entityId.localeCompare(right.entityId) || left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return {
    systemId: "dnd-5e-srd",
    rulesVersion: DND_5E_SRD_VERSION,
    actorSchemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION,
    itemSchemaVersion: DND_5E_SRD_ITEM_SCHEMA_VERSION,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

/**
 * Hashes build-defining actor and item content while excluding volatile play
 * state such as current pools, conditions, quantities, attunement, and review
 * metadata. Damage, rests, resource use, and commands therefore do not revoke
 * approval; build, level, maximum, or item-definition changes do.
 */
export function dndCharacterReviewFingerprint(actor: Actor, items: Item[]): string {
  const payload = {
    actor: {
      id: actor.id,
      systemId: actor.systemId,
      ownerUserId: actor.ownerUserId,
      type: actor.type,
      name: actor.name,
      imageAssetId: actor.imageAssetId,
      data: stableBuildValue(actor.data),
    },
    items: items
      .filter((item) => item.actorId === actor.id)
      .map((item) => ({ id: item.id, systemId: item.systemId, type: item.type, name: item.name, data: stableBuildValue(item.data) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  return `sha256:${createHash("sha256").update(stableJson(payload)).digest("hex")}`;
}

export function dndCharacterReviewEntry(actor: Actor, items: Item[]): DndCharacterReviewEntry {
  const ownedItems = items.filter((item) => item.actorId === actor.id);
  const review = readDndCharacterReview(actor);
  const currentFingerprint = dndCharacterReviewFingerprint(actor, ownedItems);
  const stale = Boolean(review && review.fingerprint !== currentFingerprint);
  return {
    actor,
    ...(review ? { review } : {}),
    effectiveStatus: stale ? "stale" : review?.status ?? "not_submitted",
    stale,
    currentFingerprint,
    currentValidation: dndCharacterReviewValidation(actor, ownedItems),
    expectedActorUpdatedAt: actor.updatedAt,
    expectedItemUpdatedAt: Object.fromEntries(ownedItems.sort((left, right) => left.id.localeCompare(right.id)).map((item) => [item.id, item.updatedAt])),
  };
}

export function dndCharacterIsApproved(campaign: Campaign, actor: Actor, items: Item[]): boolean {
  if (dndCharacterReviewPolicy(campaign).mode !== "required") return true;
  if (actor.systemId !== "dnd-5e-srd" || actor.type.toLowerCase() !== "character") return true;
  const review = readDndCharacterReview(actor);
  return Boolean(review?.status === "approved" && review.fingerprint === dndCharacterReviewFingerprint(actor, items));
}

function stableBuildValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableBuildValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !volatileDataKeys.has(key)).sort().map((key) => [key, stableBuildValue(value[key])]));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Replays strict creator validation only when the actor explicitly claims the
 * bundled guided workflow. Legacy, imported, and homebrew records have no such
 * marker and are never charged with choices that cannot be reconstructed.
 */
function guidedLevelOneValidationIssues(actor: Actor): DndCharacterReviewValidationSnapshot["issues"] {
  const provenance = actor.data.dnd5eCharacterCreation;
  if (!isRecord(provenance) || provenance.mode !== DND_5E_SRD_LEVEL_ONE_CREATION_MODE) return [];
  if (provenance.version !== 1 || typeof provenance.templateId !== "string" || !isRecord(provenance.options)) {
    return [{
      entityKind: "actor",
      entityId: actor.id,
      path: "/data/dnd5eCharacterCreation",
      severity: "error",
      code: "creation.invalid_provenance",
      message: "Guided level-one creation provenance is incomplete or malformed",
    }];
  }
  const template = dnd5eSrdCharacterTemplate(provenance.templateId);
  if (!template) {
    return [{
      entityKind: "actor",
      entityId: actor.id,
      path: "/data/dnd5eCharacterCreation/templateId",
      severity: "error",
      code: "creation.unsupported_template",
      message: "Guided level-one creation references an unsupported class template",
    }];
  }
  return dnd5eSrdValidateLevelOneCharacterCreation(template, provenance.options as Dnd5eSrdCharacterOriginOptions).issues.map((issue) => ({
    entityKind: "actor" as const,
    entityId: actor.id,
    path: `/data/dnd5eCharacterCreation/options/${String(issue.field)}`,
    severity: "error" as const,
    code: `creation.${issue.code}`,
    message: issue.message,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
