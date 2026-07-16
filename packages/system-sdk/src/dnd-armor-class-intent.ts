import type { Actor, CalculationOverrideSource } from "@open-tabletop/core";

export const DND_5E_SRD_ARMOR_CLASS_INTENT_KEY = "armorClassIntent" as const;
export const DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY = "armorClassReview" as const;
export const DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION = 1 as const;

export interface Dnd5eSrdArmorClassOverrideIntent {
  version: typeof DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION;
  mode: "override";
  source: Extract<CalculationOverrideSource, "gm_manual" | "house_rule">;
  reason: string;
  createdByUserId?: string;
}

export interface Dnd5eSrdArmorClassReview {
  version: typeof DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION;
  status: "requires-review";
  legacyStoredValue: number;
  derivedValueAtMigration: number;
  reason: string;
  detectedAt?: string;
}

export type Dnd5eSrdStoredArmorClassClassification =
  | { kind: "derived"; derivedValue: number }
  | { kind: "monster-exact"; derivedValue: number; storedValue: number }
  | { kind: "legacy-equal"; derivedValue: number; storedValue: number }
  | { kind: "explicit-override"; derivedValue: number; storedValue: number; intent: Dnd5eSrdArmorClassOverrideIntent }
  | { kind: "requires-review"; derivedValue: number; storedValue: number; reason: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function boundedReason(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const reason = value.trim();
  return reason && reason.length <= 500 ? reason : undefined;
}

/** Reads only an explicit, versioned declaration. A finite scalar is never inferred to be an override. */
export function dnd5eSrdArmorClassOverrideIntent(data: Record<string, unknown>): Dnd5eSrdArmorClassOverrideIntent | undefined {
  const value = record(data[DND_5E_SRD_ARMOR_CLASS_INTENT_KEY]);
  const reason = boundedReason(value.reason);
  if (value.version !== DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION || value.mode !== "override" || !reason) return undefined;
  if (value.source !== "gm_manual" && value.source !== "house_rule") return undefined;
  const createdByUserId = typeof value.createdByUserId === "string" && value.createdByUserId.trim() ? value.createdByUserId.trim() : undefined;
  return { version: DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION, mode: "override", source: value.source, reason, ...(createdByUserId ? { createdByUserId } : {}) };
}

export function dnd5eSrdArmorClassReview(data: Record<string, unknown>): Dnd5eSrdArmorClassReview | undefined {
  const value = record(data[DND_5E_SRD_ARMOR_CLASS_REVIEW_KEY]);
  const legacyStoredValue = finiteInteger(value.legacyStoredValue);
  const derivedValueAtMigration = finiteInteger(value.derivedValueAtMigration);
  const reason = boundedReason(value.reason);
  if (value.version !== DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION || value.status !== "requires-review" || legacyStoredValue === undefined || derivedValueAtMigration === undefined || !reason) return undefined;
  const detectedAt = typeof value.detectedAt === "string" && Number.isFinite(Date.parse(value.detectedAt)) ? value.detectedAt : undefined;
  return { version: DND_5E_SRD_ARMOR_CLASS_INTENT_VERSION, status: "requires-review", legacyStoredValue, derivedValueAtMigration, reason, ...(detectedAt ? { detectedAt } : {}) };
}

/** Deterministic classification used by import and durable migration. */
export function classifyDnd5eSrdStoredArmorClass(actor: Actor, derivedValue: number): Dnd5eSrdStoredArmorClassClassification {
  const storedValue = finiteInteger(actor.data.armorClass);
  if (storedValue === undefined) return { kind: "derived", derivedValue };
  if (actor.type === "monster") return { kind: "monster-exact", derivedValue, storedValue };
  if (storedValue === derivedValue) return { kind: "legacy-equal", derivedValue, storedValue };
  const intent = dnd5eSrdArmorClassOverrideIntent(actor.data);
  if (intent) return { kind: "explicit-override", derivedValue, storedValue, intent };
  const rawIntent = actor.data[DND_5E_SRD_ARMOR_CLASS_INTENT_KEY];
  const reason = rawIntent === undefined
    ? `Legacy stored Armor Class ${storedValue} differs from the derived value ${derivedValue}; a GM must document an override or accept the derived value.`
    : `Legacy stored Armor Class ${storedValue} has an invalid or incomplete override declaration and differs from the derived value ${derivedValue}; a GM must review it.`;
  return { kind: "requires-review", derivedValue, storedValue, reason };
}

/** Builds the authoritative AC portion of a sheet without depending on the large SDK orchestrator module. */
export function dnd5eSrdArmorClassSheetData<T extends { value: number; base: number; dexModifier: number; armorName: string }>(actor: Actor, details: T): { armorClass: number; armorClassDetails: T & Record<string, unknown> } {
  const stored = classifyDnd5eSrdStoredArmorClass(actor, details.value);
  const review = dnd5eSrdArmorClassReview(actor.data);
  const exactMonsterValue = stored.kind === "monster-exact" ? stored.storedValue : undefined;
  const armorClass = exactMonsterValue ?? details.value;
  const reviewData = stored.kind === "requires-review"
    ? { requiresReview: true, legacyStoredValue: stored.storedValue, reviewReason: stored.reason }
    : review
      ? { requiresReview: true, legacyStoredValue: review.legacyStoredValue, reviewReason: review.reason }
      : {};
  return {
    armorClass,
    armorClassDetails: {
      ...details,
      value: armorClass,
      ...(exactMonsterValue === undefined ? {} : { base: exactMonsterValue, dexModifier: 0, armorName: "Monster stat block", monsterStatBlock: true }),
      ...reviewData,
    },
  };
}
