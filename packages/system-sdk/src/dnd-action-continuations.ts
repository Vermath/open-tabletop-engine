import type { Item } from "@open-tabletop/core";
import type { Dnd5eSrdContinuationGrant, Dnd5eSrdCriticalOutcome } from "./dnd-action-economy.js";

type JsonRecord = Record<string, unknown>;
type Roll = { id: string; label: string; formula: string; metadata?: JsonRecord };
type Target = { actorId: string; rollTotal?: number; naturalD20?: number; armorClass: number; criticalHitsBecomeNormalHits?: boolean };

export type Dnd5eSrdRollEffectKind = "attack" | "damage" | "healing" | "effect";
export type Dnd5eSrdContinuationRollRole = "attack" | "primary" | "versatile" | "secondary" | "effect" | "feature" | "species";

/**
 * One structural way a predecessor can satisfy a continuation trigger. The
 * clauses are ORed; every populated field inside one clause must match. This
 * keeps rules such as "Melee weapon or Unarmed Strike" explicit without
 * interpreting labels or human-readable trigger copy.
 */
export interface Dnd5eSrdContinuationSourceTrigger {
  effectKinds?: Dnd5eSrdRollEffectKind[];
  attackTypes?: string[];
  weaponKinds?: string[];
  abilities?: string[];
  sourceItemTypes?: string[];
  sourceRollIds?: string[];
  sourceTags?: string[];
}

/**
 * Structural continuation metadata authored by roll producers. Continuation
 * resolution intentionally does not infer game semantics from display labels,
 * roll ids, or dice formula text.
 */
export interface Dnd5eSrdContinuationRollMetadata {
  activation?: "on-hit" | "follow-up";
  role: Dnd5eSrdContinuationRollRole;
  family?: string;
  oncePerTurn?: boolean;
  requiresSneakAttackEligibility?: boolean;
  /** Tags describing the predecessor itself, such as `deals-damage`. */
  sourceTags?: string[];
  /** Explicit predecessor alternatives accepted by this continuation. */
  sourceTriggers?: Dnd5eSrdContinuationSourceTrigger[];
  /** The roll represents damage from an already-confirmed hit (for example, Unarmed Strike). */
  confirmedHit?: boolean;
}

export type Dnd5eSrdContinuationTriggerProfile =
  | "any-attack-hit"
  | "attack-damage-hit"
  | "melee-weapon-or-unarmed-hit"
  | "monk-weapon-or-unarmed-hit"
  | "strength-rage-hit"
  | "turn-undead"
  | "weapon-damage-hit"
  | "weapon-hit"
  | "flurry-of-blows-hit"
  | "wild-shape-form-hit";

const DND_5E_SRD_CONTINUATION_TRIGGER_PROFILES: Record<Dnd5eSrdContinuationTriggerProfile, Dnd5eSrdContinuationSourceTrigger[]> = {
  "any-attack-hit": [{ effectKinds: ["attack"] }],
  "attack-damage-hit": [{ effectKinds: ["attack"], sourceTags: ["deals-damage"] }],
  "melee-weapon-or-unarmed-hit": [{ attackTypes: ["weapon"], weaponKinds: ["melee"] }, { attackTypes: ["unarmed"] }],
  "monk-weapon-or-unarmed-hit": [{ sourceTags: ["monk-weapon"] }, { attackTypes: ["unarmed"] }],
  "strength-rage-hit": [
    { attackTypes: ["weapon"], abilities: ["strength"], sourceTags: ["rage-active"] },
    { attackTypes: ["unarmed"], abilities: ["strength"], sourceTags: ["rage-active"] }
  ],
  "turn-undead": [{ sourceRollIds: ["feature-turn-undead"] }],
  "weapon-damage-hit": [{ attackTypes: ["weapon"], sourceTags: ["deals-damage"] }],
  "weapon-hit": [{ attackTypes: ["weapon"] }],
  "flurry-of-blows-hit": [{ sourceTags: ["flurry-of-blows-attack"] }],
  "wild-shape-form-hit": [{ sourceTags: ["wild-shape-form-attack"] }]
};

export function dnd5eSrdContinuationTrigger(profile: Dnd5eSrdContinuationTriggerProfile): Pick<Dnd5eSrdContinuationRollMetadata, "sourceTriggers"> {
  return { sourceTriggers: DND_5E_SRD_CONTINUATION_TRIGGER_PROFILES[profile].map((trigger) => ({ ...trigger })) };
}

export function dnd5eSrdAttackSourceContinuation(family: string | undefined, sourceTags: string[], confirmedHit = false): Dnd5eSrdContinuationRollMetadata {
  return { role: "attack", ...(family ? { family } : {}), ...(sourceTags.length > 0 ? { sourceTags } : {}), ...(confirmedHit ? { confirmedHit: true } : {}) };
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizedList(value: unknown): string[] {
  return list(value).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

function sourceTriggers(value: unknown): Dnd5eSrdContinuationSourceTrigger[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const trigger = record(entry);
    const effectKinds = normalizedList(trigger.effectKinds).filter((kind): kind is Dnd5eSrdRollEffectKind => ["attack", "damage", "healing", "effect"].includes(kind));
    const parsed: Dnd5eSrdContinuationSourceTrigger = {
      ...(effectKinds.length > 0 ? { effectKinds } : {}),
      ...(normalizedList(trigger.attackTypes).length > 0 ? { attackTypes: normalizedList(trigger.attackTypes) } : {}),
      ...(normalizedList(trigger.weaponKinds).length > 0 ? { weaponKinds: normalizedList(trigger.weaponKinds) } : {}),
      ...(normalizedList(trigger.abilities).length > 0 ? { abilities: normalizedList(trigger.abilities) } : {}),
      ...(normalizedList(trigger.sourceItemTypes).length > 0 ? { sourceItemTypes: normalizedList(trigger.sourceItemTypes) } : {}),
      ...(normalizedList(trigger.sourceRollIds).length > 0 ? { sourceRollIds: normalizedList(trigger.sourceRollIds) } : {}),
      ...(normalizedList(trigger.sourceTags).length > 0 ? { sourceTags: normalizedList(trigger.sourceTags) } : {})
    };
    return Object.keys(parsed).length > 0 ? [parsed] : [];
  });
}

function storedCriticalOutcomes(value: unknown): Dnd5eSrdCriticalOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const outcome = record(entry);
    const targetActorId = text(outcome.targetActorId);
    const criticalMinimum = typeof outcome.criticalMinimum === "number" && Number.isInteger(outcome.criticalMinimum) ? outcome.criticalMinimum : undefined;
    const attackOutcome = text(outcome.outcome);
    if (!targetActorId || criticalMinimum === undefined || !["miss", "hit", "critical-hit", "unresolved"].includes(attackOutcome ?? "")) return [];
    const naturalD20 = typeof outcome.naturalD20 === "number" && Number.isInteger(outcome.naturalD20) && outcome.naturalD20 >= 1 && outcome.naturalD20 <= 20 ? outcome.naturalD20 : undefined;
    return [{ targetActorId, ...(naturalD20 !== undefined ? { naturalD20 } : {}), criticalMinimum, outcome: attackOutcome as Dnd5eSrdCriticalOutcome["outcome"], criticalNegated: outcome.criticalNegated === true, finalCritical: outcome.finalCritical === true }];
  });
}

function effectType(roll: Roll): Dnd5eSrdRollEffectKind | undefined {
  const value = text(record(roll.metadata).effectKind)?.toLowerCase();
  return value === "attack" || value === "damage" || value === "healing" || value === "effect" ? value : undefined;
}

function continuationMetadata(roll: Roll): Dnd5eSrdContinuationRollMetadata | undefined {
  const metadata = record(record(roll.metadata).continuation);
  const role = text(metadata.role)?.toLowerCase();
  if (!role || !["attack", "primary", "versatile", "secondary", "effect", "feature", "species"].includes(role)) return undefined;
  const activation = text(metadata.activation)?.toLowerCase();
  const parsedSourceTriggers = sourceTriggers(metadata.sourceTriggers);
  return {
    role: role as Dnd5eSrdContinuationRollRole,
    ...(activation === "on-hit" || activation === "follow-up" ? { activation } : {}),
    ...(text(metadata.family) ? { family: text(metadata.family) } : {}),
    ...(metadata.oncePerTurn === true ? { oncePerTurn: true } : {}),
    ...(metadata.requiresSneakAttackEligibility === true ? { requiresSneakAttackEligibility: true } : {}),
    ...(normalizedList(metadata.sourceTags).length > 0 ? { sourceTags: normalizedList(metadata.sourceTags) } : {}),
    ...(parsedSourceTriggers.length > 0 ? { sourceTriggers: parsedSourceTriggers } : {}),
    ...(metadata.confirmedHit === true ? { confirmedHit: true } : {})
  };
}

export function dnd5eSrdContinuationActivation(roll: Roll): "on-hit" | "follow-up" | undefined {
  return continuationMetadata(roll)?.activation;
}

export function dnd5eSrdGuardedContinuation(roll: Roll, inCombat: boolean): boolean {
  const activation = dnd5eSrdContinuationActivation(roll);
  return inCombat && (activation === "on-hit" || activation === "follow-up" && effectType(roll) === "damage");
}

function sneakAttackDamageType(item: Item | undefined, roll: Roll, explicitEligibility: boolean): string | undefined {
  const metadata = record(roll.metadata);
  const mode = text(metadata.d20Mode)?.toLowerCase();
  if (!item || text(metadata.attackType)?.toLowerCase() !== "weapon" || mode === "disadvantage" || mode !== "advantage" && !explicitEligibility) return undefined;
  const data = record(item.data);
  const properties = list(data.properties).map((property) => property.toLowerCase());
  if (text(data.weaponKind)?.toLowerCase() !== "ranged" && !properties.includes("finesse") && data.finesse !== true) return undefined;
  const damageType = text(data.damageType)?.toLowerCase();
  return damageType && ["bludgeoning", "piercing", "slashing"].includes(damageType) ? damageType : undefined;
}

function criticalHitMinimum(roll: Roll): number {
  const metadata = record(roll.metadata);
  const range = record(metadata.criticalRange);
  const explicitMinimum = typeof range.minimumD20 === "number" ? range.minimumD20 : undefined;
  if (explicitMinimum && Number.isInteger(explicitMinimum) && explicitMinimum >= 1 && explicitMinimum <= 20) return explicitMinimum;
  const direct = metadata.criticalHitOn;
  if (typeof direct === "number" && Number.isInteger(direct) && direct >= 1 && direct <= 20) return direct;
  if (typeof direct === "string") {
    const match = direct.trim().match(/^(\d{1,2})(?:\s*-\s*20)?$/);
    const value = match ? Number(match[1]) : Number.NaN;
    if (Number.isInteger(value) && value >= 1 && value <= 20) return value;
  }
  if (Array.isArray(direct)) {
    const values = direct.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20);
    if (values.length > 0) return Math.min(...values);
  }
  return 20;
}

function attackOutcome(target: Target, criticalMinimum: number): "miss" | "hit" | "critical-hit" | undefined {
  const total = typeof target.rollTotal === "number" ? target.rollTotal : Number.NaN;
  if (!Number.isFinite(total)) return undefined;
  if (target.naturalD20 === 1) return "miss";
  if (target.naturalD20 !== undefined && target.naturalD20 >= criticalMinimum) return "critical-hit";
  return total >= target.armorClass ? "hit" : "miss";
}

function continuationSourceMatches(roll: Roll, requestedItem: Item | undefined, candidate: Dnd5eSrdContinuationRollMetadata): boolean {
  const clauses = candidate.sourceTriggers ?? [];
  if (clauses.length === 0) return true;
  const metadata = record(roll.metadata);
  const itemData = record(requestedItem?.data);
  const sourceContinuation = continuationMetadata(roll);
  const sourceEffectKind = effectType(roll);
  const attackType = text(metadata.attackType)?.toLowerCase();
  const weaponKind = (text(metadata.weaponKind) ?? text(itemData.weaponKind))?.toLowerCase();
  const ability = text(metadata.ability)?.toLowerCase();
  const sourceItemType = (text(metadata.sourceItemType) ?? requestedItem?.type)?.toLowerCase();
  const sourceTags = new Set((sourceContinuation?.sourceTags ?? []).map((tag) => tag.toLowerCase()));
  return clauses.some((clause) =>
    (!clause.effectKinds?.length || Boolean(sourceEffectKind && clause.effectKinds.includes(sourceEffectKind)))
    && (!clause.attackTypes?.length || Boolean(attackType && clause.attackTypes.includes(attackType)))
    && (!clause.weaponKinds?.length || Boolean(weaponKind && clause.weaponKinds.includes(weaponKind)))
    && (!clause.abilities?.length || Boolean(ability && clause.abilities.includes(ability)))
    && (!clause.sourceItemTypes?.length || Boolean(sourceItemType && clause.sourceItemTypes.includes(sourceItemType)))
    && (!clause.sourceRollIds?.length || clause.sourceRollIds.includes(roll.id.toLowerCase()))
    && (!clause.sourceTags?.length || clause.sourceTags.every((tag) => sourceTags.has(tag)))
  );
}

export function dnd5eSrdContinuationGrantForRoll(input: { roll: Roll; available: Roll[]; requestedItem?: Item; targets: Target[]; spellSlotLevel?: number; sneakAttackEligible?: boolean }): Dnd5eSrdContinuationGrant | undefined {
  const sourceContinuation = continuationMetadata(input.roll);
  const sourceEffectKind = effectType(input.roll);
  const isAttack = sourceEffectKind === "attack" && sourceContinuation?.role === "attack";
  const isConfirmedHit = sourceEffectKind === "damage" && sourceContinuation?.role === "attack" && sourceContinuation.confirmedHit === true;
  if (isAttack || isConfirmedHit) {
    const criticalMinimum = criticalHitMinimum(input.roll);
    const targetOutcomes = input.targets.map((target) => {
      const outcome = isConfirmedHit ? "hit" as const : attackOutcome(target, criticalMinimum);
      const naturalD20 = typeof target.naturalD20 === "number" && Number.isInteger(target.naturalD20) && target.naturalD20 >= 1 && target.naturalD20 <= 20 ? target.naturalD20 : undefined;
      const criticalNegated = !isConfirmedHit && outcome === "critical-hit" && target.criticalHitsBecomeNormalHits === true;
      return {
        target,
        outcome,
        criticalOutcome: {
          targetActorId: target.actorId,
          ...(naturalD20 !== undefined ? { naturalD20 } : {}),
          criticalMinimum,
          outcome: outcome ?? "unresolved",
          criticalNegated,
          finalCritical: !isConfirmedHit && outcome === "critical-hit" && !criticalNegated
        } satisfies Dnd5eSrdCriticalOutcome
      };
    });
    const targetActorIds = targetOutcomes.flatMap(({ target, outcome }) => outcome === "hit" || outcome === "critical-hit" ? [target.actorId] : []);
    const criticalHitTargetActorIds = targetOutcomes.flatMap(({ target, outcome }) =>
      outcome === "critical-hit" && target.criticalHitsBecomeNormalHits !== true ? [target.actorId] : []
    );
    if (input.targets.length > 0 && targetActorIds.length === 0) return undefined;
    const family = sourceContinuation.family;
    const sourceDamageType = sneakAttackDamageType(input.requestedItem, input.roll, input.sneakAttackEligible === true);
    const allowances = input.available.flatMap((candidate) => {
      const candidateContinuation = continuationMetadata(candidate);
      if (candidateContinuation?.activation !== "on-hit") return [];
      const structural = Boolean(family && candidateContinuation.family === family && ["primary", "versatile", "effect"].includes(candidateContinuation.role));
      const feature = candidateContinuation.role === "feature" || candidateContinuation.role === "species";
      if ((!structural && !feature)
        || !continuationSourceMatches(input.roll, input.requestedItem, candidateContinuation)
        || candidateContinuation.requiresSneakAttackEligibility === true && !sourceDamageType) return [];
      const primaryDamage = structural && (candidateContinuation.role === "primary" || candidateContinuation.role === "versatile") && effectType(candidate) === "damage";
      return [{ rollId: candidate.id, ...(primaryDamage ? { exclusiveGroup: `${family}-primary`, ...(input.spellSlotLevel !== undefined ? { spellSlotLevel: input.spellSlotLevel } : {}) } : {}), ...(candidateContinuation.oncePerTurn === true ? { oncePerTurn: true } : {}) }];
    });
    return allowances.length > 0 ? { sourceRollId: input.roll.id, allowances, targetActorIds, ...(!isConfirmedHit ? { criticalOutcomes: targetOutcomes.map(({ criticalOutcome }) => criticalOutcome) } : {}), ...(criticalHitTargetActorIds.length > 0 ? { criticalHitTargetActorIds } : {}), ...(sourceDamageType ? { sourceDamageType } : {}) } : undefined;
  }
  if (effectType(input.roll) !== "damage" || dnd5eSrdContinuationActivation(input.roll) === "follow-up") return undefined;
  const family = sourceContinuation?.family;
  const allowances = input.available.flatMap((candidate) => {
    const candidateContinuation = continuationMetadata(candidate);
    if (candidateContinuation?.activation !== "follow-up" || effectType(candidate) !== "damage") return [];
    const feature = candidateContinuation.role === "feature" || candidateContinuation.role === "species";
    const secondary = candidateContinuation.role === "secondary" && Boolean(family && candidateContinuation.family === family);
    if ((!feature && !secondary) || !continuationSourceMatches(input.roll, input.requestedItem, candidateContinuation)) return [];
    return [{ rollId: candidate.id, ...(secondary && input.spellSlotLevel !== undefined ? { spellSlotLevel: input.spellSlotLevel } : {}), ...(candidateContinuation.oncePerTurn === true ? { oncePerTurn: true } : {}) }];
  });
  const inheritedCriticalHitTargetActorIds = list(record(input.roll.metadata).criticalHitTargetActorIds)
    .filter((actorId) => input.targets.some((target) => target.actorId === actorId));
  const inheritedCriticalOutcomes = storedCriticalOutcomes(record(input.roll.metadata).criticalOutcomes)
    .filter((outcome) => input.targets.some((target) => target.actorId === outcome.targetActorId));
  return allowances.length > 0 ? { sourceRollId: input.roll.id, allowances, targetActorIds: input.targets.map((target) => target.actorId), ...(inheritedCriticalOutcomes.length > 0 ? { criticalOutcomes: inheritedCriticalOutcomes } : {}), ...(inheritedCriticalHitTargetActorIds.length > 0 ? { criticalHitTargetActorIds: inheritedCriticalHitTargetActorIds } : {}) } : undefined;
}
