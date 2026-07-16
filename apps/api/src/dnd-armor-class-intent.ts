import { createId, type Actor, type AuditLog, type CalculationOverride, type EngineState } from "@open-tabletop/core";
import {
  DND_5E_SRD_ARMOR_CLASS_INTENT_KEY,
  DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION,
  DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY,
  DND_5E_SRD_SYSTEM_ID,
  DND_5E_SRD_VERSION,
  classifyDnd5eSrdStoredArmorClass,
  dnd5eSrdArmorClass,
} from "@open-tabletop/system-sdk";

export interface DndArmorClassMigrationResult {
  changed: number;
  derived: number;
  overrides: number;
  reviews: number;
}

export interface DndArmorClassMigrationOptions {
  actorIds?: Iterable<string>;
  initiatedByUserId?: string;
}

function nextTimestamp(current: string): string {
  const currentTime = Date.parse(current);
  return new Date(Math.max(Date.now(), Number.isFinite(currentTime) ? currentTime + 1 : 0)).toISOString();
}

function audit(state: EngineState, actor: Actor, changedAt: string, action: string, before: unknown, after: unknown): void {
  state.auditLogs.push({
    id: createId("audit"),
    campaignId: actor.campaignId,
    actorType: "system",
    action,
    targetType: "actor",
    targetId: actor.id,
    before,
    after,
    createdAt: changedAt,
    updatedAt: changedAt,
  } satisfies AuditLog);
}

function removeLegacyFields(actor: Actor): Record<string, unknown> {
  const data = { ...actor.data };
  delete data.armorClass;
  delete data[DND_5E_SRD_ARMOR_CLASS_INTENT_KEY];
  delete data[DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY];
  return data;
}

/**
 * One-way, idempotent migration of the old implicit character AC scalar.
 * Monster scalars remain exact stat-block data. Character scalars become
 * either derived state, a scoped T24 override, or an explicit review record.
 */
export function migrateDnd5eSrdStoredArmorClassIntent(state: EngineState, options: DndArmorClassMigrationOptions = {}): DndArmorClassMigrationResult {
  const selectedIds = options.actorIds ? new Set(options.actorIds) : undefined;
  const result: DndArmorClassMigrationResult = { changed: 0, derived: 0, overrides: 0, reviews: 0 };
  for (const actor of state.actors) {
    if (actor.systemId !== DND_5E_SRD_SYSTEM_ID || actor.type === "monster" || (selectedIds && !selectedIds.has(actor.id))) continue;
    const items = state.items.filter((item) => item.campaignId === actor.campaignId && item.actorId === actor.id);
    const classification = classifyDnd5eSrdStoredArmorClass(actor, dnd5eSrdArmorClass(actor, items).value);
    if (classification.kind === "derived" || classification.kind === "monster-exact") continue;
    const changedAt = nextTimestamp(actor.updatedAt);
    const before = {
      armorClass: classification.storedValue,
      armorClassIntent: actor.data[DND_5E_SRD_ARMOR_CLASS_INTENT_KEY],
      armorClassReview: actor.data[DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY],
    };
    if (classification.kind === "legacy-equal") {
      actor.data = removeLegacyFields(actor);
      actor.updatedAt = changedAt;
      audit(state, actor, changedAt, "actor.armorClass.migrate.derived", before, { derivedValue: classification.derivedValue, disposition: "removed_redundant_scalar" });
      result.changed += 1;
      result.derived += 1;
      continue;
    }

    if (classification.kind === "explicit-override") {
      const active = state.calculationOverrides.find((candidate) => candidate.actorId === actor.id && candidate.campaignId === actor.campaignId && candidate.fieldId === "armor-class" && !candidate.clearedAt);
      const compatibleActive = active
        && active.systemId === actor.systemId
        && active.rulesVersion === DND_5E_SRD_VERSION
        && active.baseValue === classification.derivedValue
        && active.effectiveValue === classification.storedValue;
      if (!active || compatibleActive) {
        const createdByUserId = classification.intent.createdByUserId ?? options.initiatedByUserId ?? actor.ownerUserId ?? state.members.find((member) => member.campaignId === actor.campaignId)?.userId ?? "system-migration";
        const override = active ?? {
          id: createId("calc_override"),
          campaignId: actor.campaignId,
          actorId: actor.id,
          systemId: actor.systemId,
          rulesVersion: DND_5E_SRD_VERSION,
          fieldId: "armor-class",
          source: classification.intent.source,
          baseValue: classification.derivedValue,
          effectiveValue: classification.storedValue,
          reason: classification.intent.reason,
          createdByUserId,
          createdAt: changedAt,
          updatedAt: changedAt,
        } satisfies CalculationOverride;
        if (!active) state.calculationOverrides.push(override);
        actor.data = removeLegacyFields(actor);
        actor.updatedAt = changedAt;
        audit(state, actor, changedAt, "actor.armorClass.migrate.override", before, { overrideId: override.id, baseValue: override.baseValue, effectiveValue: override.effectiveValue, source: override.source, reason: override.reason, disposition: active ? "matched_existing_override" : "created_scoped_override" });
        result.changed += 1;
        result.overrides += 1;
        continue;
      }
    }

    const conflictReason = classification.kind === "explicit-override"
      ? `Legacy Armor Class ${classification.storedValue} conflicts with an existing active Armor Class override and requires GM review.`
      : classification.reason;
    actor.data = {
      ...removeLegacyFields(actor),
      [DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY]: {
        version: DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION,
        status: "requires-review",
        legacyStoredValue: classification.storedValue,
        derivedValueAtMigration: classification.derivedValue,
        reason: conflictReason,
        detectedAt: changedAt,
      },
    };
    actor.updatedAt = changedAt;
    audit(state, actor, changedAt, "actor.armorClass.migrate.review", before, { derivedValue: classification.derivedValue, legacyStoredValue: classification.storedValue, reason: conflictReason, disposition: "requires_review" });
    result.changed += 1;
    result.reviews += 1;
  }
  return result;
}
