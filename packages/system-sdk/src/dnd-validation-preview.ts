import type { Actor, Item } from "@open-tabletop/core";
import {
  DND_5E_SRD_SYSTEM_ID,
  DND_5E_SRD_VERSION,
  applyDnd5eSrdAdvancement,
  applyDnd5eSrdFeat,
  applyDnd5eSrdMulticlassLevel,
  applyDnd5eSrdRest,
  dnd5eSrdAdvancementFeatGrant,
  dnd5eSrdAdvancementFeatEligibility,
  dnd5eSrdAdvancementClassName,
  dnd5eSrdClassAdvancementProfile,
  dnd5eSrdClassHitDieSize,
  dnd5eSrdFeatEntry,
  dnd5eSrdHitDicePools,
  dnd5eSrdMulticlassPrerequisites,
  dnd5eSrdSubclassOptionsForActor,
  dnd5eSrdWeaponMasteryChoiceCount,
  dnd5eSrdWeaponMasteryEligibleWeaponIds,
  dnd5eSrdResolveDamageComponents,
  resolveDnd5eSrdAction,
  type SystemRestOptions,
  type SystemRestType
} from "./index.js";

/**
 * These versions identify the SDK data contracts, independently of the SRD
 * rules version. Bumping them is required for a breaking validation or preview
 * envelope change; unknown/homebrew data fields remain forward-compatible.
 */
export const DND_5E_SRD_ACTOR_SCHEMA_VERSION = "1.0.0";
export const DND_5E_SRD_ITEM_SCHEMA_VERSION = "1.0.0";
export const DND_5E_SRD_RULES_PREVIEW_VERSION = "1.0.0";
export const DND_5E_SRD_REPAIR_PREVIEW_VERSION = "1.0.0";

export type Dnd5eSrdAbilityName = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
export type Dnd5eSrdLifeState = "conscious" | "unconscious" | "stable" | "dead" | "defeated";

export interface Dnd5eSrdManagedPool extends Record<string, unknown> {
  current: number;
  max: number;
}

export interface Dnd5eSrdManagedHitDicePool extends Dnd5eSrdManagedPool {
  className: string;
  size: string;
}

export interface Dnd5eSrdManagedClassLevel extends Record<string, unknown> {
  className?: string;
  /** Legacy spelling retained losslessly by the compatible parser. */
  class?: string;
  level: number;
}

/**
 * Typed view of the flat Actor.data roots currently owned by reviewed D&D
 * rules operations. The index signature deliberately preserves untouched
 * homebrew and future-system fields.
 */
export interface Dnd5eSrdActorManagedData extends Record<string, unknown> {
  ruleset?: string;
  class?: string;
  level?: number;
  classes?: Dnd5eSrdManagedClassLevel[];
  attributes?: Partial<Record<Dnd5eSrdAbilityName, number>> & Record<string, unknown>;
  hp?: Dnd5eSrdManagedPool;
  hitDice?: Dnd5eSrdManagedPool & { size?: string };
  hitDicePools?: Dnd5eSrdManagedHitDicePool[];
  temporaryHitPoints?: number | ({ current: number } & Record<string, unknown>);
  temporaryHp?: number | ({ current: number } & Record<string, unknown>);
  tempHp?: number | ({ current: number } & Record<string, unknown>);
  deathSaves?: { successes: number; failures: number } & Record<string, unknown>;
  lifeState?: Dnd5eSrdLifeState;
  defeated?: boolean;
  conditions?: unknown[];
  resources?: Record<string, unknown>;
  spellSlots?: Record<string, unknown>;
  rulesEngine?: Record<string, unknown>;
  heroicInspiration?: boolean;
  weaponMasteries?: unknown[];
  weaponMasteriesByClass?: Record<string, unknown>;
  armorClass?: number;
}

/** Typed view of Item.data roots consumed by current D&D rules resolvers. */
export interface Dnd5eSrdItemManagedData extends Record<string, unknown> {
  quantity?: number;
  equipped?: boolean;
  prepared?: boolean;
  alwaysPrepared?: boolean;
  requiresAttunement?: boolean;
  attuned?: boolean;
  charges?: number | Record<string, unknown>;
  uses?: number | Record<string, unknown>;
  damageType?: string;
  secondaryDamageType?: string;
  armorType?: string;
  category?: string;
  equipmentCategory?: string;
  ability?: string;
  mastery?: string;
}

export interface Dnd5eSrdManagedDataSource {
  entityKind: "actor" | "item";
  entityId: string;
  systemId: typeof DND_5E_SRD_SYSTEM_ID;
  rulesVersion: typeof DND_5E_SRD_VERSION;
  /** Existing durable records are flat and did not carry a data-schema version. */
  sourceSchemaVersion: "legacy-unversioned";
  schemaVersion: string;
}

export interface Dnd5eSrdManagedDataView<T extends Record<string, unknown>> {
  source: Dnd5eSrdManagedDataSource;
  migration: {
    from: "legacy-unversioned";
    to: string;
    lossless: true;
  };
  data: T;
  warnings: Dnd5eSrdValidationIssue[];
}

export type Dnd5eSrdManagedDataParseResult<T extends Record<string, unknown>> =
  | { ok: true; value: Dnd5eSrdManagedDataView<T> }
  | { ok: false; source: Dnd5eSrdManagedDataSource; issues: Dnd5eSrdValidationIssue[] };

export type Dnd5eSrdValidationSeverity = "error" | "warning";

export interface Dnd5eSrdValidationIssue {
  /** RFC 6901 JSON Pointer into the entity. */
  path: string;
  severity: Dnd5eSrdValidationSeverity;
  code: string;
  message: string;
}

export interface Dnd5eSrdValidationReport {
  entityKind: "actor" | "item";
  entityId: string;
  systemId: typeof DND_5E_SRD_SYSTEM_ID;
  rulesVersion: typeof DND_5E_SRD_VERSION;
  schemaVersion: string;
  valid: boolean;
  issues: Dnd5eSrdValidationIssue[];
}

export interface Dnd5eSrdRepairPatch {
  operation: "add" | "remove" | "replace";
  /** RFC 6901 JSON Pointer into the entity. */
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface Dnd5eSrdRepairCandidate extends Dnd5eSrdRepairPatch {
  id: string;
  entityKind: "actor" | "item";
  entityId: string;
  confidence: "deterministic";
  application: "confirmation_required";
  issue: Dnd5eSrdValidationIssue;
  rationale: string;
  /** Applying this patch returns the proposed entity to the exact prior value. */
  inverse: Dnd5eSrdRepairPatch;
  source: {
    systemId: typeof DND_5E_SRD_SYSTEM_ID;
    rulesVersion: typeof DND_5E_SRD_VERSION;
    schemaVersion: string;
    previewVersion: typeof DND_5E_SRD_REPAIR_PREVIEW_VERSION;
  };
}

export interface Dnd5eSrdRepairPreview<T extends Actor | Item> {
  previewVersion: typeof DND_5E_SRD_REPAIR_PREVIEW_VERSION;
  entityKind: "actor" | "item";
  entityId: string;
  status: "no_changes" | "changes_available";
  readOnly: true;
  candidates: Dnd5eSrdRepairCandidate[];
  manualIssues: Dnd5eSrdValidationIssue[];
  /** A lossless clone with every listed candidate applied for inspection only. */
  proposedEntity?: T;
}

export interface Dnd5eSrdPreviewChange {
  /** RFC 6901 JSON Pointer into the actor data object. */
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after?: unknown;
  source: {
    systemId: typeof DND_5E_SRD_SYSTEM_ID;
    rulesVersion: typeof DND_5E_SRD_VERSION;
    schemaVersion: typeof DND_5E_SRD_ACTOR_SCHEMA_VERSION;
    rule: "advancement" | "rest" | "typed-damage";
  };
}

export interface Dnd5eSrdPreviewBlocker {
  path: string;
  code: string;
  message: string;
}

export interface Dnd5eSrdServerRollRequirement {
  id: string;
  path: string;
  formula: string;
  reason: string;
}

export interface Dnd5eSrdAdvancementPreviewRequest {
  operation: "advancement";
  actor: Actor;
  optionId?: string;
  /** Explicit because a client must never silently choose fixed versus rolled HP. */
  hitPointMode?: "fixed" | "roll";
  /** A server-authoritative result. Required when hitPointMode is roll. */
  hitPointRoll?: number;
  /** Selects a new or existing class; omit to advance the SDK-selected primary class. */
  className?: string;
  subclassId?: string;
  /** Complete replacement list when this class gains or is missing Weapon Mastery selections. */
  weaponMasteryChoices?: string[];
  featId?: string;
  abilityChoices?: Record<string, number>;
}

export interface Dnd5eSrdRestHitDiePreviewSelection {
  className?: string;
  /** A server-authoritative result. Omit to receive a server-roll requirement. */
  roll?: number;
}

export interface Dnd5eSrdRestPreviewRequest {
  operation: "rest";
  actor: Actor;
  restType: SystemRestType;
  hitDice?: Dnd5eSrdRestHitDiePreviewSelection[];
  arcaneRecovery?: Record<string, number>;
}

export interface Dnd5eSrdTypedDamagePreviewRequest {
  operation: "typed-damage";
  actor: Actor;
  items?: Item[];
  /** A critical hit against a creature already at 0 HP causes two failed Death Saves. */
  criticalHit?: boolean;
  /** The already rolled, server-authoritative total for this one component. */
  amount?: number;
  /** Used only to declare the roll required when amount is omitted. */
  formula?: string;
  /** Backward-compatible single-component damage type. */
  damageType?: string | string[];
  /** Typed components are resolved independently before their results are combined. */
  components?: Array<{ amount: number; damageType: string }>;
}

export type Dnd5eSrdRulesPreviewRequest =
  | Dnd5eSrdAdvancementPreviewRequest
  | Dnd5eSrdRestPreviewRequest
  | Dnd5eSrdTypedDamagePreviewRequest;

export interface Dnd5eSrdRulesPreviewEnvelope {
  previewVersion: typeof DND_5E_SRD_RULES_PREVIEW_VERSION;
  rulesVersion: typeof DND_5E_SRD_VERSION;
  actorSchemaVersion: typeof DND_5E_SRD_ACTOR_SCHEMA_VERSION;
  itemSchemaVersion: typeof DND_5E_SRD_ITEM_SCHEMA_VERSION;
  operation: Dnd5eSrdRulesPreviewRequest["operation"];
  actorId: string;
  status: "ready" | "blocked";
  blockers: Dnd5eSrdPreviewBlocker[];
  serverRolls: Dnd5eSrdServerRollRequirement[];
  validation: {
    actor: Dnd5eSrdValidationReport;
    items: Dnd5eSrdValidationReport[];
  };
  changes: Dnd5eSrdPreviewChange[];
  /** Proposed actor data only. Calling this contract never applies it. */
  proposedData?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

const DND_ABILITY_NAMES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const DND_DAMAGE_TYPES = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);
const DND_HIT_DICE = new Set(["d6", "d8", "d10", "d12"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])) as T;
  return value;
}

function pointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointerSegments(path: string): string[] {
  if (!path.startsWith("/")) return [];
  return path.slice(1).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function setPointerValue(root: unknown, path: string, value: unknown): void {
  const segments = pointerSegments(path);
  if (segments.length === 0) return;
  let cursor = root as Record<string, unknown> | unknown[];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = Array.isArray(cursor) ? cursor[Number(segment)] : cursor[segment];
    if (!isRecord(next) && !Array.isArray(next)) return;
    cursor = next;
  }
  const finalSegment = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) cursor[Number(finalSegment)] = cloneValue(value);
  else cursor[finalSegment] = cloneValue(value);
}

function issue(path: string, severity: Dnd5eSrdValidationSeverity, code: string, message: string): Dnd5eSrdValidationIssue {
  return { path, severity, code, message };
}

function sortedIssues(issues: Dnd5eSrdValidationIssue[]): Dnd5eSrdValidationIssue[] {
  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
}

function validateFiniteInteger(
  issues: Dnd5eSrdValidationIssue[],
  value: unknown,
  path: string,
  options: { minimum?: number; maximum?: number; required?: boolean } = {}
): void {
  if (value === undefined) {
    if (options.required) issues.push(issue(path, "error", "schema.required", "A value is required."));
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    issues.push(issue(path, "error", "schema.integer", "Expected a finite whole number."));
    return;
  }
  if (options.minimum !== undefined && value < options.minimum) issues.push(issue(path, "error", "schema.minimum", `Expected a value of at least ${options.minimum}.`));
  if (options.maximum !== undefined && value > options.maximum) issues.push(issue(path, "error", "schema.maximum", `Expected a value no greater than ${options.maximum}.`));
}

function validateFiniteNumber(
  issues: Dnd5eSrdValidationIssue[],
  value: unknown,
  path: string,
  options: { minimum?: number; maximum?: number; required?: boolean } = {}
): void {
  if (value === undefined) {
    if (options.required) issues.push(issue(path, "error", "schema.required", "A value is required."));
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue(path, "error", "schema.number", "Expected a finite number."));
    return;
  }
  if (options.minimum !== undefined && value < options.minimum) issues.push(issue(path, "error", "schema.minimum", `Expected a value of at least ${options.minimum}.`));
  if (options.maximum !== undefined && value > options.maximum) issues.push(issue(path, "error", "schema.maximum", `Expected a value no greater than ${options.maximum}.`));
}

function validatePool(issues: Dnd5eSrdValidationIssue[], value: unknown, path: string, required: boolean): void {
  if (value === undefined) {
    if (required) issues.push(issue(path, "error", "schema.required", "A current/maximum pool is required."));
    return;
  }
  if (!isRecord(value)) {
    issues.push(issue(path, "error", "schema.object", "Expected an object."));
    return;
  }
  validateFiniteInteger(issues, value.current, `${path}/current`, { minimum: 0, required: true });
  validateFiniteInteger(issues, value.max, `${path}/max`, { minimum: 0, required: true });
  if (typeof value.current === "number" && typeof value.max === "number" && value.current > value.max) {
    issues.push(issue(`${path}/current`, "error", "rules.pool_above_maximum", "Current value cannot exceed the maximum."));
  }
}

function validateClassLevels(issues: Dnd5eSrdValidationIssue[], value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(issue("/data/classes", "error", "schema.array", "Class levels must be an array."));
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `/data/classes/${index}`;
    if (!isRecord(entry)) {
      issues.push(issue(path, "error", "schema.object", "Expected a class-level object."));
      return;
    }
    const className = typeof entry.className === "string" ? entry.className : typeof entry.class === "string" ? entry.class : undefined;
    if (!className?.trim()) issues.push(issue(`${path}/className`, "error", "schema.required", "Class name is required."));
    else {
      const key = className.trim().toLowerCase();
      if (seen.has(key)) issues.push(issue(`${path}/className`, "error", "rules.duplicate_class", "Each class can have only one class-level entry."));
      seen.add(key);
    }
    validateFiniteInteger(issues, entry.level, `${path}/level`, { minimum: 1, maximum: 20, required: true });
  });
}

function validateTemporaryHitPoints(issues: Dnd5eSrdValidationIssue[], data: Record<string, unknown>): void {
  for (const key of ["temporaryHitPoints", "temporaryHp", "tempHp"] as const) {
    const value = data[key];
    if (value === undefined) continue;
    const path = `/data/${key}`;
    if (isRecord(value)) validateFiniteInteger(issues, value.current, `${path}/current`, { minimum: 0, required: true });
    else validateFiniteInteger(issues, value, path, { minimum: 0 });
  }
}

function validateDeathSaves(issues: Dnd5eSrdValidationIssue[], value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(issue("/data/deathSaves", "error", "schema.object", "Death Saves must be an object."));
    return;
  }
  validateFiniteInteger(issues, value.successes, "/data/deathSaves/successes", { minimum: 0, maximum: 3, required: true });
  validateFiniteInteger(issues, value.failures, "/data/deathSaves/failures", { minimum: 0, maximum: 3, required: true });
}

function validateManagedPoolMap(issues: Dnd5eSrdValidationIssue[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.push(issue(path, "error", "schema.object", "Expected a resource-pool object."));
    return;
  }
  for (const [key, rawPool] of Object.entries(value)) {
    if (!isRecord(rawPool) || (!("current" in rawPool) && !("max" in rawPool))) continue;
    const poolPath = `${path}/${pointerSegment(key)}`;
    validateFiniteInteger(issues, rawPool.current, `${poolPath}/current`, { minimum: 0, required: true });
    validateFiniteInteger(issues, rawPool.max, `${poolPath}/max`, { minimum: 0, required: true });
    if (typeof rawPool.current === "number" && typeof rawPool.max === "number" && rawPool.current > rawPool.max) {
      issues.push(issue(`${poolPath}/current`, "error", "rules.pool_above_maximum", "Current value cannot exceed the maximum."));
    }
  }
}

function validateActorManagedSubroots(issues: Dnd5eSrdValidationIssue[], data: Record<string, unknown>): void {
  validateClassLevels(issues, data.classes);
  validateTemporaryHitPoints(issues, data);
  validateDeathSaves(issues, data.deathSaves);
  validateManagedPoolMap(issues, data.resources, "/data/resources");
  validateManagedPoolMap(issues, data.spellSlots, "/data/spellSlots");
  if (data.rulesEngine !== undefined && !isRecord(data.rulesEngine)) issues.push(issue("/data/rulesEngine", "error", "schema.object", "Rules-engine state must be an object."));
  if (data.weaponMasteries !== undefined && !Array.isArray(data.weaponMasteries)) issues.push(issue("/data/weaponMasteries", "error", "schema.array", "Weapon Masteries must be an array."));
  if (data.weaponMasteriesByClass !== undefined && !isRecord(data.weaponMasteriesByClass)) issues.push(issue("/data/weaponMasteriesByClass", "error", "schema.object", "Weapon Masteries by class must be an object."));
  if (data.heroicInspiration !== undefined && typeof data.heroicInspiration !== "boolean") issues.push(issue("/data/heroicInspiration", "error", "schema.boolean", "Heroic Inspiration must be true or false."));
  if (data.armorClass !== undefined) validateFiniteInteger(issues, data.armorClass, "/data/armorClass", { minimum: 0 });
  if (data.defeated !== undefined && typeof data.defeated !== "boolean") issues.push(issue("/data/defeated", "error", "schema.boolean", "Defeated must be true or false."));
  if (data.lifeState !== undefined && (typeof data.lifeState !== "string" || !["conscious", "unconscious", "stable", "dead", "defeated"].includes(data.lifeState.toLowerCase()))) {
    issues.push(issue("/data/lifeState", "error", "schema.enum", "Life state must be conscious, unconscious, stable, dead, or defeated."));
  }
}

function validateOptionalUsePool(issues: Dnd5eSrdValidationIssue[], value: unknown, path: string): void {
  if (value === undefined) return;
  if (typeof value === "number") {
    validateFiniteInteger(issues, value, path, { minimum: 0 });
    return;
  }
  if (!isRecord(value)) {
    issues.push(issue(path, "error", "schema.object", "Expected a use-pool object."));
    return;
  }
  if ("current" in value || "max" in value) validatePool(issues, value, path, true);
}

/** Read-only, forward-compatible validation for the D&D actor envelope and known SRD fields. */
export function validateDnd5eSrdActor(actor: Actor, options: { requireCharacterCore?: boolean } = {}): Dnd5eSrdValidationReport {
  const issues: Dnd5eSrdValidationIssue[] = [];
  if (!actor || typeof actor !== "object") {
    issues.push(issue("", "error", "schema.object", "Expected an actor object."));
    return actorReport("", issues);
  }
  if (typeof actor.id !== "string" || !actor.id.trim()) issues.push(issue("/id", "error", "schema.required", "Actor id is required."));
  if (typeof actor.campaignId !== "string" || !actor.campaignId.trim()) issues.push(issue("/campaignId", "error", "schema.required", "Campaign id is required."));
  if (actor.systemId !== DND_5E_SRD_SYSTEM_ID) issues.push(issue("/systemId", "error", "system.unsupported", `Expected ${DND_5E_SRD_SYSTEM_ID}.`));
  if (typeof actor.type !== "string" || !actor.type.trim()) issues.push(issue("/type", "error", "schema.required", "Actor type is required."));
  if (typeof actor.name !== "string" || !actor.name.trim()) issues.push(issue("/name", "error", "schema.required", "Actor name is required."));
  if (!isRecord(actor.data)) {
    issues.push(issue("/data", "error", "schema.object", "Actor data must be an object."));
    return actorReport(typeof actor.id === "string" ? actor.id : "", issues);
  }

  const data = actor.data;
  if (data.ruleset === undefined) issues.push(issue("/data/ruleset", "warning", "rules.version_missing", `Rules version is not recorded; previews use ${DND_5E_SRD_VERSION}.`));
  else if (data.ruleset !== DND_5E_SRD_VERSION) issues.push(issue("/data/ruleset", "warning", "rules.version_mismatch", `Stored rules version does not match ${DND_5E_SRD_VERSION}.`));

  const isCharacter = typeof actor.type === "string" && actor.type.toLowerCase() === "character";
  const requireCharacterCore = isCharacter && options.requireCharacterCore !== false;
  if (isCharacter) validateFiniteInteger(issues, data.level, "/data/level", { minimum: 1, maximum: 20, required: requireCharacterCore });
  else validateFiniteNumber(issues, data.level, "/data/level", { minimum: 0 });
  if (isCharacter && (requireCharacterCore || data.class !== undefined)) {
    if (typeof data.class !== "string" || !data.class.trim()) issues.push(issue("/data/class", "error", requireCharacterCore ? "schema.required" : "schema.string", requireCharacterCore ? "A character class is required." : "Character class must be a non-empty string."));
    else if (!Object.keys(dnd5eSrdMulticlassPrerequisites).some((className) => className.toLowerCase() === data.class!.toString().toLowerCase())) {
      issues.push(issue("/data/class", "warning", "rules.homebrew_class", "This class is not automated by the SRD rules helper; its fields are preserved."));
    }
  }

  if (data.attributes === undefined) {
    if (requireCharacterCore) issues.push(issue("/data/attributes", "error", "schema.required", "Character ability scores are required."));
  } else if (!isRecord(data.attributes)) {
    issues.push(issue("/data/attributes", "error", "schema.object", "Ability scores must be an object."));
  } else {
    for (const ability of DND_ABILITY_NAMES) {
      validateFiniteInteger(issues, data.attributes[ability], `/data/attributes/${ability}`, { minimum: 0, maximum: 30, required: requireCharacterCore });
    }
  }

  validatePool(issues, data.hp, "/data/hp", requireCharacterCore);
  if (isRecord(data.hp) && typeof data.hp.current === "number" && data.hp.current < 0) {
    issues.push(issue("/data/hp/current", "error", "rules.hit_points_negative", "Hit Points cannot be negative."));
  }
  validatePool(issues, data.hitDice, "/data/hitDice", requireCharacterCore);
  if (isRecord(data.hitDice) && data.hitDice.size !== undefined && (typeof data.hitDice.size !== "string" || !DND_HIT_DICE.has(data.hitDice.size.toLowerCase()))) {
    issues.push(issue("/data/hitDice/size", "error", "rules.hit_die_unsupported", "Expected d6, d8, d10, or d12."));
  }
  if (data.hitDicePools !== undefined) validateHitDicePools(issues, data.hitDicePools);
  if (data.conditions !== undefined && !Array.isArray(data.conditions)) issues.push(issue("/data/conditions", "error", "schema.array", "Conditions must be an array."));
  validateActorManagedSubroots(issues, data);
  return actorReport(actor.id, issues);
}

function validateHitDicePools(issues: Dnd5eSrdValidationIssue[], value: unknown): void {
  if (!Array.isArray(value)) {
    issues.push(issue("/data/hitDicePools", "error", "schema.array", "Hit Point Dice pools must be an array."));
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `/data/hitDicePools/${index}`;
    if (!isRecord(entry)) {
      issues.push(issue(path, "error", "schema.object", "Expected a Hit Point Dice pool object."));
      return;
    }
    if (typeof entry.className !== "string" || !entry.className.trim()) issues.push(issue(`${path}/className`, "error", "schema.required", "Class name is required."));
    else {
      const key = entry.className.trim().toLowerCase();
      if (seen.has(key)) issues.push(issue(`${path}/className`, "error", "rules.duplicate_hit_dice_pool", "Each class can have only one Hit Point Dice pool."));
      seen.add(key);
    }
    validateFiniteInteger(issues, entry.current, `${path}/current`, { minimum: 0, required: true });
    validateFiniteInteger(issues, entry.max, `${path}/max`, { minimum: 0, required: true });
    if (typeof entry.current === "number" && typeof entry.max === "number" && entry.current > entry.max) issues.push(issue(`${path}/current`, "error", "rules.pool_above_maximum", "Current value cannot exceed the maximum."));
    if (typeof entry.size !== "string" || !DND_HIT_DICE.has(entry.size.toLowerCase())) issues.push(issue(`${path}/size`, "error", "rules.hit_die_unsupported", "Expected d6, d8, d10, or d12."));
  });
}

function actorReport(entityId: string, issues: Dnd5eSrdValidationIssue[]): Dnd5eSrdValidationReport {
  const ordered = sortedIssues(issues);
  return {
    entityKind: "actor",
    entityId,
    systemId: DND_5E_SRD_SYSTEM_ID,
    rulesVersion: DND_5E_SRD_VERSION,
    schemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION,
    valid: !ordered.some((entry) => entry.severity === "error"),
    issues: ordered
  };
}

/** Read-only, forward-compatible validation for the D&D item envelope and known SRD fields. */
export function validateDnd5eSrdItem(item: Item): Dnd5eSrdValidationReport {
  const issues: Dnd5eSrdValidationIssue[] = [];
  if (!item || typeof item !== "object") {
    issues.push(issue("", "error", "schema.object", "Expected an item object."));
    return itemReport("", issues);
  }
  if (typeof item.id !== "string" || !item.id.trim()) issues.push(issue("/id", "error", "schema.required", "Item id is required."));
  if (typeof item.campaignId !== "string" || !item.campaignId.trim()) issues.push(issue("/campaignId", "error", "schema.required", "Campaign id is required."));
  if (item.systemId !== DND_5E_SRD_SYSTEM_ID) issues.push(issue("/systemId", "error", "system.unsupported", `Expected ${DND_5E_SRD_SYSTEM_ID}.`));
  if (typeof item.type !== "string" || !item.type.trim()) issues.push(issue("/type", "error", "schema.required", "Item type is required."));
  if (typeof item.name !== "string" || !item.name.trim()) issues.push(issue("/name", "error", "schema.required", "Item name is required."));
  if (!isRecord(item.data)) {
    issues.push(issue("/data", "error", "schema.object", "Item data must be an object."));
    return itemReport(typeof item.id === "string" ? item.id : "", issues);
  }
  validateFiniteInteger(issues, item.data.quantity, "/data/quantity", { minimum: 0 });
  if (item.data.equipped !== undefined && typeof item.data.equipped !== "boolean") issues.push(issue("/data/equipped", "error", "schema.boolean", "Equipped must be true or false."));
  if (item.data.prepared !== undefined && typeof item.data.prepared !== "boolean") issues.push(issue("/data/prepared", "error", "schema.boolean", "Prepared must be true or false."));
  if (item.data.alwaysPrepared !== undefined && typeof item.data.alwaysPrepared !== "boolean") issues.push(issue("/data/alwaysPrepared", "error", "schema.boolean", "Always prepared must be true or false."));
  if (item.data.alwaysPrepared === true && item.data.prepared === false) issues.push(issue("/data/prepared", "error", "rules.always_prepared", "An always-prepared spell cannot be unprepared."));
  if (item.data.requiresAttunement !== undefined && typeof item.data.requiresAttunement !== "boolean") issues.push(issue("/data/requiresAttunement", "error", "schema.boolean", "Requires attunement must be true or false."));
  if (item.data.attuned !== undefined && typeof item.data.attuned !== "boolean") issues.push(issue("/data/attuned", "error", "schema.boolean", "Attuned must be true or false."));
  validateOptionalUsePool(issues, item.data.charges, "/data/charges");
  validateOptionalUsePool(issues, item.data.uses, "/data/uses");
  for (const key of ["armorType", "category", "equipmentCategory", "ability", "mastery"] as const) {
    if (item.data[key] !== undefined && (typeof item.data[key] !== "string" || !item.data[key].trim())) issues.push(issue(`/data/${key}`, "error", "schema.string", `${key} must be a non-empty string.`));
  }
  for (const key of ["damageType", "secondaryDamageType"] as const) {
    const value = item.data[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      issues.push(issue(`/data/${key}`, "error", "schema.string", `${key} must be a non-empty string.`));
      continue;
    }
    for (const damageType of value.toLowerCase().split(/[\/,]/).map((entry) => entry.trim()).filter(Boolean)) {
      if (!DND_DAMAGE_TYPES.has(damageType) && damageType !== "choice" && damageType !== "weapon") {
        issues.push(issue(`/data/${key}`, "warning", "rules.homebrew_damage_type", `Damage type ${damageType} is not an SRD automated type; the value is preserved.`));
      }
    }
  }
  return itemReport(item.id, issues);
}

function itemReport(entityId: string, issues: Dnd5eSrdValidationIssue[]): Dnd5eSrdValidationReport {
  const ordered = sortedIssues(issues);
  return {
    entityKind: "item",
    entityId,
    systemId: DND_5E_SRD_SYSTEM_ID,
    rulesVersion: DND_5E_SRD_VERSION,
    schemaVersion: DND_5E_SRD_ITEM_SCHEMA_VERSION,
    valid: !ordered.some((entry) => entry.severity === "error"),
    issues: ordered
  };
}

function managedDataSource(entityKind: "actor" | "item", entityId: string): Dnd5eSrdManagedDataSource {
  return {
    entityKind,
    entityId,
    systemId: DND_5E_SRD_SYSTEM_ID,
    rulesVersion: DND_5E_SRD_VERSION,
    sourceSchemaVersion: "legacy-unversioned",
    schemaVersion: entityKind === "actor" ? DND_5E_SRD_ACTOR_SCHEMA_VERSION : DND_5E_SRD_ITEM_SCHEMA_VERSION
  };
}

function managedDataParseResult<T extends Record<string, unknown>>(
  source: Dnd5eSrdManagedDataSource,
  data: Record<string, unknown>,
  report: Dnd5eSrdValidationReport
): Dnd5eSrdManagedDataParseResult<T> {
  const errors = report.issues.filter((entry) => entry.severity === "error");
  if (errors.length > 0) return { ok: false, source, issues: cloneValue(errors) };
  return {
    ok: true,
    value: {
      source,
      migration: { from: "legacy-unversioned", to: source.schemaVersion, lossless: true },
      data: cloneValue(data) as T,
      warnings: cloneValue(report.issues.filter((entry) => entry.severity === "warning"))
    }
  };
}

/**
 * Parses only managed roots that are present. Missing legacy roots remain
 * valid so generic/homebrew actors can keep loading; strict character review
 * continues to use validateDnd5eSrdActor's default required-core mode.
 */
export function parseDnd5eSrdActorManagedData(actor: Actor): Dnd5eSrdManagedDataParseResult<Dnd5eSrdActorManagedData> {
  const source = managedDataSource("actor", typeof actor?.id === "string" ? actor.id : "");
  const report = validateDnd5eSrdActor(actor, { requireCharacterCore: false });
  return managedDataParseResult(source, isRecord(actor?.data) ? actor.data : {}, report);
}

/** Item counterpart to parseDnd5eSrdActorManagedData. */
export function parseDnd5eSrdItemManagedData(item: Item): Dnd5eSrdManagedDataParseResult<Dnd5eSrdItemManagedData> {
  const source = managedDataSource("item", typeof item?.id === "string" ? item.id : "");
  const report = validateDnd5eSrdItem(item);
  return managedDataParseResult(source, isRecord(item?.data) ? item.data : {}, report);
}

/** Returns a fresh flat record for storage/API compatibility. */
export function dnd5eSrdManagedDataRecord<T extends Record<string, unknown>>(view: Dnd5eSrdManagedDataView<T>): Record<string, unknown> {
  return cloneValue(view.data);
}

export function formatDnd5eSrdManagedDataError(result: Dnd5eSrdManagedDataParseResult<Record<string, unknown>>): string | undefined {
  if (result.ok) return undefined;
  const first = result.issues[0];
  if (!first) return `D&D ${result.source.entityKind} data did not match schema ${result.source.schemaVersion}.`;
  return `D&D ${result.source.entityKind} ${result.source.entityId || "(unknown)"} schema ${result.source.schemaVersion} validation failed at ${first.path || "/"} (${first.code}): ${first.message}`;
}

function repairCandidate(
  report: Dnd5eSrdValidationReport,
  path: string,
  issueCode: string,
  before: unknown,
  after: unknown,
  rationale: string
): Dnd5eSrdRepairCandidate {
  const operation = before === undefined ? "add" : "replace";
  const validationIssue = report.issues.find((entry) => entry.path === path && entry.code === issueCode)
    ?? issue(path, "error", issueCode, rationale);
  const schemaVersion = report.entityKind === "actor" ? DND_5E_SRD_ACTOR_SCHEMA_VERSION : DND_5E_SRD_ITEM_SCHEMA_VERSION;
  return {
    id: `${report.entityKind}:${report.entityId}:${issueCode}:${path}`,
    entityKind: report.entityKind,
    entityId: report.entityId,
    confidence: "deterministic",
    application: "confirmation_required",
    operation,
    path,
    ...(before === undefined ? {} : { before: cloneValue(before) }),
    after: cloneValue(after),
    issue: cloneValue(validationIssue),
    rationale,
    inverse: operation === "add"
      ? { operation: "remove", path, before: cloneValue(after) }
      : { operation: "replace", path, before: cloneValue(after), after: cloneValue(before) },
    source: {
      systemId: DND_5E_SRD_SYSTEM_ID,
      rulesVersion: DND_5E_SRD_VERSION,
      schemaVersion,
      previewVersion: DND_5E_SRD_REPAIR_PREVIEW_VERSION
    }
  };
}

function poolRepairCandidate(
  report: Dnd5eSrdValidationReport,
  pool: Record<string, unknown>,
  path: string,
  negativeIssueCode = "schema.minimum"
): Dnd5eSrdRepairCandidate | undefined {
  const current = pool.current;
  const maximum = pool.max;
  if (typeof current !== "number" || !Number.isFinite(current) || !Number.isInteger(current)) return undefined;
  if (current < 0) {
    return repairCandidate(report, `${path}/current`, negativeIssueCode, current, 0, "Clamp the finite current pool value to the validated minimum of 0.");
  }
  if (typeof maximum !== "number" || !Number.isFinite(maximum) || !Number.isInteger(maximum) || maximum < 0 || current <= maximum) return undefined;
  return repairCandidate(report, `${path}/current`, "rules.pool_above_maximum", current, maximum, "Clamp the current pool value to its recorded maximum.");
}

function finalizeRepairPreview<T extends Actor | Item>(
  original: T,
  report: Dnd5eSrdValidationReport,
  candidates: Dnd5eSrdRepairCandidate[],
  validate: (entity: T) => Dnd5eSrdValidationReport
): Dnd5eSrdRepairPreview<T> {
  const ordered = candidates.sort((left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id));
  if (ordered.length === 0) {
    return {
      previewVersion: DND_5E_SRD_REPAIR_PREVIEW_VERSION,
      entityKind: report.entityKind,
      entityId: report.entityId,
      status: "no_changes",
      readOnly: true,
      candidates: [],
      manualIssues: cloneValue(report.issues)
    };
  }
  const proposedEntity = cloneValue(original);
  for (const candidate of ordered) setPointerValue(proposedEntity, candidate.path, candidate.after);
  return {
    previewVersion: DND_5E_SRD_REPAIR_PREVIEW_VERSION,
    entityKind: report.entityKind,
    entityId: report.entityId,
    status: "changes_available",
    readOnly: true,
    candidates: ordered,
    manualIssues: cloneValue(validate(proposedEntity).issues),
    proposedEntity
  };
}

/**
 * Builds a lossless, read-only repair proposal. Only mechanically reversible
 * invariants are candidates; intent-sensitive D&D choices remain manual.
 */
export function previewDnd5eSrdActorRepairs(actor: Actor): Dnd5eSrdRepairPreview<Actor> {
  const report = validateDnd5eSrdActor(actor);
  const candidates: Dnd5eSrdRepairCandidate[] = [];
  if (isRecord(actor.data)) {
    if (actor.data.ruleset === undefined) {
      candidates.push(repairCandidate(report, "/data/ruleset", "rules.version_missing", undefined, DND_5E_SRD_VERSION, `Record the rules version used by this preview (${DND_5E_SRD_VERSION}).`));
    }
    if (isRecord(actor.data.hp)) {
      const candidate = poolRepairCandidate(report, actor.data.hp, "/data/hp", "rules.hit_points_negative");
      if (candidate) candidates.push(candidate);
    }
    if (isRecord(actor.data.hitDice)) {
      const candidate = poolRepairCandidate(report, actor.data.hitDice, "/data/hitDice");
      if (candidate) candidates.push(candidate);
    }
    if (Array.isArray(actor.data.hitDicePools)) {
      actor.data.hitDicePools.forEach((pool, index) => {
        if (!isRecord(pool)) return;
        const candidate = poolRepairCandidate(report, pool, `/data/hitDicePools/${index}`);
        if (candidate) candidates.push(candidate);
      });
    }
  }
  return finalizeRepairPreview(actor, report, candidates, validateDnd5eSrdActor);
}

/** Read-only item counterpart to previewDnd5eSrdActorRepairs. */
export function previewDnd5eSrdItemRepairs(item: Item): Dnd5eSrdRepairPreview<Item> {
  const report = validateDnd5eSrdItem(item);
  const candidates: Dnd5eSrdRepairCandidate[] = [];
  if (isRecord(item.data) && item.data.alwaysPrepared === true && item.data.prepared === false) {
    candidates.push(repairCandidate(report, "/data/prepared", "rules.always_prepared", false, true, "Restore the prepared flag required by this always-prepared spell."));
  }
  return finalizeRepairPreview(item, report, candidates, validateDnd5eSrdItem);
}

function changeSource(rule: Dnd5eSrdPreviewChange["source"]["rule"]): Dnd5eSrdPreviewChange["source"] {
  return {
    systemId: DND_5E_SRD_SYSTEM_ID,
    rulesVersion: DND_5E_SRD_VERSION,
    schemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION,
    rule
  };
}

function diffData(before: unknown, after: unknown, rule: Dnd5eSrdPreviewChange["source"]["rule"], path = ""): Dnd5eSrdPreviewChange[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ path: path || "", operation: "replace", before: cloneValue(before), after: cloneValue(after), source: changeSource(rule) }];
  }
  if (isRecord(before) && isRecord(after)) {
    const changes: Dnd5eSrdPreviewChange[] = [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((left, right) => left.localeCompare(right));
    for (const key of keys) {
      const childPath = `${path}/${pointerSegment(key)}`;
      if (!(key in before)) changes.push({ path: childPath, operation: "add", after: cloneValue(after[key]), source: changeSource(rule) });
      else if (!(key in after)) changes.push({ path: childPath, operation: "remove", before: cloneValue(before[key]), source: changeSource(rule) });
      else changes.push(...diffData(before[key], after[key], rule, childPath));
    }
    return changes;
  }
  return [{ path: path || "", operation: "replace", before: cloneValue(before), after: cloneValue(after), source: changeSource(rule) }];
}

function validationBlockers(report: Dnd5eSrdValidationReport): Dnd5eSrdPreviewBlocker[] {
  return report.issues.filter((entry) => entry.severity === "error").map(({ path, code, message }) => ({ path, code, message }));
}

function baseEnvelope(request: Dnd5eSrdRulesPreviewRequest): Dnd5eSrdRulesPreviewEnvelope {
  const actor = validateDnd5eSrdActor(request.actor);
  const rawItems = request.operation === "typed-damage" ? (request as { items?: unknown }).items : undefined;
  const items = request.operation === "typed-damage" && Array.isArray(rawItems) ? rawItems.map((item) => validateDnd5eSrdItem(item as Item)) : [];
  const blockers = [...validationBlockers(actor), ...items.flatMap(validationBlockers)];
  if (request.operation === "typed-damage" && rawItems !== undefined && !Array.isArray(rawItems)) {
    blockers.push({ path: "/items", code: "schema.array", message: "Items must be an array." });
  }
  return {
    previewVersion: DND_5E_SRD_RULES_PREVIEW_VERSION,
    rulesVersion: DND_5E_SRD_VERSION,
    actorSchemaVersion: DND_5E_SRD_ACTOR_SCHEMA_VERSION,
    itemSchemaVersion: DND_5E_SRD_ITEM_SCHEMA_VERSION,
    operation: request.operation,
    actorId: request.actor?.id ?? "",
    status: blockers.length ? "blocked" : "ready",
    blockers,
    serverRolls: [],
    validation: { actor, items },
    changes: []
  };
}

function block(envelope: Dnd5eSrdRulesPreviewEnvelope, path: string, code: string, message: string): void {
  envelope.blockers.push({ path, code, message });
  envelope.status = "blocked";
}

function finalize(envelope: Dnd5eSrdRulesPreviewEnvelope): Dnd5eSrdRulesPreviewEnvelope {
  envelope.blockers.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
  envelope.serverRolls.sort((left, right) => left.id.localeCompare(right.id));
  envelope.changes.sort((left, right) => left.path.localeCompare(right.path));
  envelope.status = envelope.blockers.length > 0 || envelope.serverRolls.length > 0 ? "blocked" : "ready";
  return envelope;
}

function actorClassLevel(actor: Actor, className: string): number {
  if (Array.isArray(actor.data.classes)) {
    for (const raw of actor.data.classes) {
      if (!isRecord(raw)) continue;
      const entryName = typeof raw.className === "string" ? raw.className : typeof raw.class === "string" ? raw.class : undefined;
      if (entryName?.toLowerCase() !== className.toLowerCase()) continue;
      return typeof raw.level === "number" && Number.isFinite(raw.level) ? Math.max(0, Math.floor(raw.level)) : 0;
    }
  }
  return typeof actor.data.class === "string" && actor.data.class.toLowerCase() === className.toLowerCase() && typeof actor.data.level === "number"
    ? Math.max(0, Math.floor(actor.data.level))
    : 0;
}

function previewAdvancement(request: Dnd5eSrdAdvancementPreviewRequest, envelope: Dnd5eSrdRulesPreviewEnvelope): Dnd5eSrdRulesPreviewEnvelope {
  if (envelope.blockers.length > 0) return finalize(envelope);
  const raw = request as unknown as Record<string, unknown>;
  if (raw.optionId !== undefined && typeof raw.optionId !== "string") block(envelope, "/optionId", "schema.string", "Advancement option id must be a string.");
  if (raw.className !== undefined && typeof raw.className !== "string") block(envelope, "/className", "schema.string", "Class name must be a string.");
  if (raw.subclassId !== undefined && typeof raw.subclassId !== "string") block(envelope, "/subclassId", "schema.string", "Subclass id must be a string.");
  if (raw.weaponMasteryChoices !== undefined && (!Array.isArray(raw.weaponMasteryChoices) || raw.weaponMasteryChoices.some((value) => typeof value !== "string"))) {
    block(envelope, "/weaponMasteryChoices", "schema.string_array", "Weapon Mastery choices must be a list of weapon identifiers.");
  }
  if (raw.featId !== undefined && typeof raw.featId !== "string") block(envelope, "/featId", "schema.string", "Feat id must be a string.");
  if (raw.hitPointRoll !== undefined && typeof raw.hitPointRoll !== "number") block(envelope, "/hitPointRoll", "schema.number", "Hit Point roll must be a number.");
  if (raw.abilityChoices !== undefined && (!isRecord(raw.abilityChoices) || Object.values(raw.abilityChoices).some((value) => typeof value !== "number"))) {
    block(envelope, "/abilityChoices", "schema.number_map", "Ability choices must map ability names to numbers.");
  }
  if (envelope.blockers.length > 0) return finalize(envelope);
  const optionId = typeof request.optionId === "string" ? request.optionId : "level-up";
  if (request.hitPointMode !== "fixed" && request.hitPointMode !== "roll") block(envelope, "/hitPointMode", "rules.choice_required", "Choose fixed or rolled Hit Points.");
  const requestedClassName = typeof request.className === "string" && request.className.trim() ? request.className.trim() : undefined;
  const className = requestedClassName
    ? Object.keys(dnd5eSrdMulticlassPrerequisites).find((candidate) => candidate.toLowerCase() === requestedClassName.toLowerCase()) ?? requestedClassName
    : dnd5eSrdAdvancementClassName(request.actor);
  const nextClassLevel = actorClassLevel(request.actor, className) + 1;
  const nextCharacterLevel = Math.max(1, Math.floor(typeof request.actor.data.level === "number" ? request.actor.data.level : 1)) + 1;
  const classProfile = dnd5eSrdClassAdvancementProfile(request.actor, className);
  if (!classProfile) block(envelope, "/className", "rules.unsupported_class", `${className} has no reviewed advancement progression attached to this actor.`);
  const featGrant = dnd5eSrdAdvancementFeatGrant(className, nextClassLevel, request.actor);
  const grantsFeat = featGrant !== undefined;
  const subclassSelectionLevel = classProfile?.subclassSelectionLevel ?? 3;
  const subclassOptions = dnd5eSrdSubclassOptionsForActor(request.actor, className);
  if (nextClassLevel === subclassSelectionLevel && !request.subclassId) block(envelope, "/subclassId", "rules.choice_required", `${className} level ${subclassSelectionLevel} requires an explicit subclass choice.`);
  if (nextClassLevel !== subclassSelectionLevel && request.subclassId) block(envelope, "/subclassId", "rules.choice_not_available", `A subclass can only be selected when this class reaches level ${subclassSelectionLevel}.`);
  if (request.subclassId && !subclassOptions.some((option) => option.id.toLowerCase() === request.subclassId!.toLowerCase() || option.name.toLowerCase() === request.subclassId!.toLowerCase())) {
    block(envelope, "/subclassId", "rules.unknown_subclass", `${request.subclassId} is not an available subclass for ${className}.`);
  }
  const priorMasteryCount = dnd5eSrdWeaponMasteryChoiceCount(className, nextClassLevel - 1);
  const requiredMasteryCount = dnd5eSrdWeaponMasteryChoiceCount(className, nextClassLevel);
  const primaryClass = typeof request.actor.data.class === "string" ? request.actor.data.class : undefined;
  const byClass = isRecord(request.actor.data.weaponMasteriesByClass) ? request.actor.data.weaponMasteriesByClass : {};
  const storedByClass = Object.entries(byClass).find(([key]) => key.toLowerCase() === className.toLowerCase())?.[1];
  const storedMasteryIds = Array.isArray(storedByClass)
    ? storedByClass.flatMap((entry) => isRecord(entry) && typeof entry.weaponId === "string" ? [entry.weaponId] : typeof entry === "string" ? [entry] : [])
    : Array.isArray(request.actor.data.weaponMasteries)
      ? request.actor.data.weaponMasteries.flatMap((entry) => {
          if (!isRecord(entry) || typeof entry.weaponId !== "string") return [];
          const entryClass = typeof entry.className === "string" ? entry.className : primaryClass;
          return entryClass?.toLowerCase() === className.toLowerCase() ? [entry.weaponId] : [];
        })
      : [];
  const needsMasterySelection = requiredMasteryCount > 0 && (requiredMasteryCount !== priorMasteryCount || new Set(storedMasteryIds).size !== requiredMasteryCount);
  if (needsMasterySelection && request.weaponMasteryChoices === undefined) {
    block(envelope, "/weaponMasteryChoices", "rules.choice_required", `${className} level ${nextClassLevel} requires an explicit complete selection of ${requiredMasteryCount} Weapon Mastery weapons.`);
  } else if (!needsMasterySelection && request.weaponMasteryChoices !== undefined) {
    block(envelope, "/weaponMasteryChoices", "rules.choice_not_available", `${className} level ${nextClassLevel} does not gain or require a Weapon Mastery selection.`);
  }
  if (request.weaponMasteryChoices !== undefined) {
    const normalized = request.weaponMasteryChoices.map((weaponId) => weaponId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    if (normalized.length !== requiredMasteryCount) block(envelope, "/weaponMasteryChoices", "rules.invalid_count", `Choose exactly ${requiredMasteryCount} ${className} Weapon Mastery weapons.`);
    if (new Set(normalized).size !== normalized.length) block(envelope, "/weaponMasteryChoices", "rules.duplicate_weapon", "Weapon Mastery choices cannot repeat a weapon.");
    const eligible = new Set(dnd5eSrdWeaponMasteryEligibleWeaponIds(className));
    if (normalized.some((weaponId) => !eligible.has(weaponId))) block(envelope, "/weaponMasteryChoices", "rules.outside_proficiency", `Choose weapons eligible for ${className} Weapon Mastery.`);
  }
  if (grantsFeat && !request.featId) block(envelope, "/featId", "rules.choice_required", `${className} level ${nextClassLevel} requires a feat or Ability Score Improvement choice.`);
  if (!grantsFeat && request.featId) block(envelope, "/featId", "rules.choice_not_available", `${className} level ${nextClassLevel} does not grant a feat or Ability Score Improvement.`);
  if (!grantsFeat && request.abilityChoices !== undefined) block(envelope, "/abilityChoices", "rules.choice_not_available", "Ability choices are only valid at a feat-granting class level.");
  if (grantsFeat && request.featId) {
    const eligibility = dnd5eSrdAdvancementFeatEligibility(request.actor, request.featId, { nextClassLevel, nextCharacterLevel });
    if (!eligibility.eligible) block(envelope, "/featId", "rules.feat_ineligible", eligibility.reasons.join("; "));
    const selectedFeat = dnd5eSrdFeatEntry(request.featId);
    if (featGrant === "epic-boon" && selectedFeat?.category !== "epic-boon") block(envelope, "/featId", "rules.feat_ineligible", `${className} level 19 grants an Epic Boon.`);
    if (featGrant === "general" && selectedFeat?.category === "epic-boon") block(envelope, "/featId", "rules.feat_ineligible", `${className} level ${nextClassLevel} grants a General Feat, not an Epic Boon.`);
  }
  if (request.hitPointMode === "fixed" && request.hitPointRoll !== undefined) block(envelope, "/hitPointRoll", "rules.roll_not_allowed", "A fixed Hit Point advancement cannot include a roll result.");
  if (request.hitPointMode === "roll" && request.hitPointRoll === undefined) {
    envelope.serverRolls.push({ id: "advancement.hit-points", path: "/hitPointRoll", formula: `1${dnd5eSrdClassHitDieSize(className, request.actor)}`, reason: `Roll ${className} Hit Points on the server.` });
  }
  if (envelope.blockers.length > 0 || envelope.serverRolls.length > 0) return finalize(envelope);
  try {
    const actor = cloneValue(request.actor);
    const choices = {
      ...(request.hitPointMode === "roll" ? { hitPointRoll: request.hitPointRoll } : {}),
      ...(request.subclassId ? { subclassId: request.subclassId } : {}),
      ...(request.weaponMasteryChoices ? { weaponMasteryChoices: [...request.weaponMasteryChoices] } : {})
    };
    const defaultClassName = dnd5eSrdAdvancementClassName(actor);
    let proposedData = request.className && className.toLowerCase() !== defaultClassName.toLowerCase()
      ? applyDnd5eSrdMulticlassLevel(actor, className, choices)
      : applyDnd5eSrdAdvancement(actor, optionId, choices);
    if (request.featId) proposedData = applyDnd5eSrdFeat(
      { ...actor, data: proposedData },
      request.featId,
      { abilities: cloneValue(request.abilityChoices), advancement: { nextClassLevel, nextCharacterLevel } }
    );
    envelope.proposedData = cloneValue(proposedData);
    envelope.changes = diffData(request.actor.data, proposedData, "advancement");
    envelope.details = { optionId, className, nextClassLevel, grantsFeat, featGrant, hitPointMode: request.hitPointMode, ...(request.subclassId ? { subclassId: request.subclassId } : {}), ...(request.weaponMasteryChoices ? { weaponMasteryChoices: [...request.weaponMasteryChoices] } : {}), ...(request.featId ? { featId: request.featId } : {}) };
  } catch (error) {
    block(envelope, "", "rules.preview_rejected", error instanceof Error ? error.message : "Advancement preview failed.");
  }
  return finalize(envelope);
}

function previewRest(request: Dnd5eSrdRestPreviewRequest, envelope: Dnd5eSrdRulesPreviewEnvelope): Dnd5eSrdRulesPreviewEnvelope {
  if (envelope.blockers.length > 0) return finalize(envelope);
  const raw = request as unknown as Record<string, unknown>;
  if (raw.hitDice !== undefined && !Array.isArray(raw.hitDice)) block(envelope, "/hitDice", "schema.array", "Hit Point Dice selections must be an array.");
  if (raw.arcaneRecovery !== undefined && (!isRecord(raw.arcaneRecovery) || Object.values(raw.arcaneRecovery).some((value) => typeof value !== "number"))) {
    block(envelope, "/arcaneRecovery", "schema.number_map", "Arcane Recovery must map slot levels to numbers.");
  }
  if (envelope.blockers.length > 0) return finalize(envelope);
  if (request.restType !== "short" && request.restType !== "long") block(envelope, "/restType", "rules.rest_type", "Rest type must be short or long.");
  const selections = Array.isArray(request.hitDice) ? request.hitDice : [];
  if (request.restType === "long" && selections.length > 0) block(envelope, "/hitDice", "rules.choice_not_available", "Hit Point Dice can only be spent during a Short Rest.");
  if (selections.length > 20) block(envelope, "/hitDice", "rules.selection_limit", "A Short Rest can spend at most 20 Hit Point Dice at once.");
  const pools = dnd5eSrdHitDicePools(request.actor);
  const fallbackClass = dnd5eSrdAdvancementClassName(request.actor);
  const poolSelections = new Map<string, number>();
  selections.forEach((selection, index) => {
    if (!isRecord(selection)) {
      block(envelope, `/hitDice/${index}`, "schema.object", "Each Hit Point Die selection must be an object.");
      return;
    }
    if (selection.className !== undefined && typeof selection.className !== "string") {
      block(envelope, `/hitDice/${index}/className`, "schema.string", "Class name must be a string.");
      return;
    }
    if (selection.roll !== undefined && typeof selection.roll !== "number") {
      block(envelope, `/hitDice/${index}/roll`, "schema.number", "Hit Point Die result must be a number.");
      return;
    }
    const selectedClass = typeof selection.className === "string" ? selection.className.trim() : undefined;
    if (pools.length > 1 && !selectedClass) {
      block(envelope, `/hitDice/${index}/className`, "rules.choice_required", "Choose the class Hit Point Dice pool.");
      return;
    }
    const pool = selectedClass ? pools.find((entry) => entry.className.toLowerCase() === selectedClass.toLowerCase()) : pools[0];
    const className = pool?.className ?? selectedClass ?? fallbackClass;
    const dieSize = pool?.size ?? dnd5eSrdClassHitDieSize(className);
    if (!pool && pools.length > 0) block(envelope, `/hitDice/${index}/className`, "rules.hit_dice_pool_missing", `No Hit Point Dice pool exists for ${className}.`);
    if (pool) {
      const count = (poolSelections.get(pool.className) ?? 0) + 1;
      poolSelections.set(pool.className, count);
      if (count > pool.current) block(envelope, `/hitDice/${index}`, "rules.hit_dice_exhausted", `${pool.className} has only ${pool.current} Hit Point Dice remaining.`);
    }
    if (selection.roll === undefined) envelope.serverRolls.push({ id: `rest.hit-die.${index}`, path: `/hitDice/${index}/roll`, formula: `1${dieSize}`, reason: `Roll the selected ${className} Hit Point Die on the server.` });
  });
  if (envelope.blockers.length > 0 || envelope.serverRolls.length > 0) return finalize(envelope);
  try {
    const hitDice: NonNullable<SystemRestOptions["hitDice"]> = selections.map((selection) => ({ ...(selection.className ? { className: selection.className } : {}), roll: selection.roll! }));
    const result = applyDnd5eSrdRest(cloneValue(request.actor), request.restType, { ...(request.arcaneRecovery ? { arcaneRecovery: cloneValue(request.arcaneRecovery) } : {}), ...(request.restType === "short" ? { hitDice } : {}) });
    envelope.proposedData = cloneValue(result.data);
    envelope.changes = diffData(request.actor.data, result.data, "rest");
    envelope.details = { restType: request.restType, recovered: cloneValue(result.recovered), removedConditions: cloneValue(result.removedConditions) };
  } catch (error) {
    block(envelope, "", "rules.preview_rejected", error instanceof Error ? error.message : "Rest preview failed.");
  }
  return finalize(envelope);
}

function previewTypedDamage(request: Dnd5eSrdTypedDamagePreviewRequest, envelope: Dnd5eSrdRulesPreviewEnvelope): Dnd5eSrdRulesPreviewEnvelope {
  if (envelope.blockers.length > 0) return finalize(envelope);
  const rawCriticalHit = (request as unknown as Record<string, unknown>).criticalHit;
  if (rawCriticalHit !== undefined && typeof rawCriticalHit !== "boolean") {
    block(envelope, "/criticalHit", "schema.boolean", "Critical hit must be true or false.");
  }
  const rawComponents = (request as unknown as Record<string, unknown>).components;
  const hasComponents = Array.isArray(rawComponents);
  if (rawComponents !== undefined && !Array.isArray(rawComponents)) block(envelope, "/components", "schema.array", "Damage components must be an array.");
  const components = Array.isArray(rawComponents) ? rawComponents.flatMap((value, index) => {
    if (!isRecord(value) || typeof value.damageType !== "string" || typeof value.amount !== "number") {
      block(envelope, `/components/${index}`, "schema.damage_component", "Each component requires a numeric amount and string damage type.");
      return [];
    }
    const damageType = value.damageType.trim().toLowerCase();
    if (!DND_DAMAGE_TYPES.has(damageType)) block(envelope, `/components/${index}/damageType`, "rules.damage_type_unsupported", `${damageType || "The damage type"} is not an automated SRD damage type.`);
    if (!Number.isInteger(value.amount) || value.amount < 0) block(envelope, `/components/${index}/amount`, "rules.damage_amount", "Damage component amounts must be non-negative whole numbers.");
    return [{ amount: value.amount, damageType }];
  }) : [];
  if (hasComponents && components.length === 0) block(envelope, "/components", "rules.selection_required", "Provide at least one typed damage component.");
  if (hasComponents && (request.amount !== undefined || request.damageType !== undefined || request.formula !== undefined)) {
    block(envelope, "", "rules.exclusive_shape", "Use either components or the backward-compatible single amount/damageType fields, not both.");
  }
  const rawDamageType = (request as unknown as Record<string, unknown>).damageType;
  if (!hasComponents && typeof rawDamageType !== "string" && (!Array.isArray(rawDamageType) || rawDamageType.some((value) => typeof value !== "string"))) {
    block(envelope, "/damageType", "schema.string_or_array", "Damage type must be a string or an array of strings.");
  }
  const types = (Array.isArray(rawDamageType) ? rawDamageType : typeof rawDamageType === "string" ? [rawDamageType] : []).map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!hasComponents && types.length > 1) block(envelope, "/damageType", "rules.manual_resolution_required", "Multiple damage types require an authoritative amount for each component.");
  else if (!hasComponents && types.length !== 1) block(envelope, "/damageType", "rules.damage_type_required", "A single-component preview requires exactly one damage type.");
  else if (!hasComponents && !DND_DAMAGE_TYPES.has(types[0]!)) block(envelope, "/damageType", "rules.damage_type_unsupported", `${types[0] || "The damage type"} is not an automated SRD damage type.`);
  if (!hasComponents && request.amount === undefined) {
    if (typeof request.formula === "string" && request.formula.trim()) envelope.serverRolls.push({ id: "damage.total", path: "/amount", formula: request.formula.trim(), reason: "Roll the damage total on the server before previewing its effects." });
    else block(envelope, "/amount", "rules.roll_result_required", "A server-authoritative damage amount or roll formula is required.");
  } else if (!hasComponents && (!Number.isFinite(request.amount) || !Number.isInteger(request.amount) || (request.amount ?? -1) < 0)) {
    block(envelope, "/amount", "rules.damage_amount", "Damage amount must be a non-negative whole number.");
  }
  if (envelope.blockers.length > 0 || envelope.serverRolls.length > 0) return finalize(envelope);
  try {
    const actor = cloneValue(request.actor);
    const items = cloneValue(request.items ?? []);
    if (hasComponents) {
      const result = dnd5eSrdResolveDamageComponents(actor, items, components, { criticalHit: request.criticalHit === true });
      const hp = isRecord(actor.data.hp) ? actor.data.hp : {};
      const temporaryKey = ["temporaryHitPoints", "temporaryHp", "tempHp"].find((key) => key in actor.data) ?? "temporaryHitPoints";
      const temporaryValue = actor.data[temporaryKey];
      const conditions = (Array.isArray(actor.data.conditions) ? actor.data.conditions : []).filter((condition) => {
        const id = typeof condition === "string" ? condition : isRecord(condition) && typeof condition.id === "string" ? condition.id : undefined;
        return id !== "unconscious" && id !== "stable" && id !== "dead";
      });
      for (const conditionId of result.lifecycle.conditionIds) conditions.push({ id: conditionId, appliedAt: "1970-01-01T00:00:00.000Z" });
      const proposedData = {
        ...actor.data,
        hp: { ...hp, current: result.hitPointsAfter },
        [temporaryKey]: isRecord(temporaryValue) ? { ...temporaryValue, current: result.temporaryHitPointsAfter } : result.temporaryHitPointsAfter,
        conditions,
        deathSaves: { successes: result.lifecycle.deathSaveSuccesses, failures: result.lifecycle.deathSaveFailures },
        lifeState: result.lifecycle.state,
        ...(result.lifecycle.state === "defeated" || result.lifecycle.state === "dead" ? { defeated: true } : {})
      };
      envelope.proposedData = cloneValue(proposedData);
      envelope.changes = diffData(request.actor.data, proposedData, "typed-damage");
      envelope.details = { components: cloneValue(result.components), totalDamage: result.totalDamage, absorbedByTemporaryHitPoints: result.absorbedByTemporaryHitPoints, criticalHit: request.criticalHit === true, lifecycle: cloneValue(result.lifecycle) };
      return finalize(envelope);
    }
    const damageType = types[0]!;
    const result = resolveDnd5eSrdAction({
      actor,
      roll: { id: "preview-typed-damage", label: `${damageType} Damage`, formula: String(request.amount), metadata: { damageType, criticalHit: request.criticalHit === true } },
      targets: [{ actor, items, rollTotal: request.amount }],
      options: { applyEffect: true, commit: false, criticalHit: request.criticalHit === true, ignoreSourceActionRestrictions: true },
      now: "1970-01-01T00:00:00.000Z"
    });
    if (result.blocked) block(envelope, "", "rules.action_blocked", result.blocked.reason);
    if (result.pendingChoice) block(envelope, "/damageType", "rules.choice_required", result.pendingChoice.reason);
    if (result.manualResolutionRequired) block(envelope, "", "rules.manual_resolution_required", result.manualResolutionRequired.reason);
    for (const pendingSave of result.pendingSaves) block(envelope, "", "rules.save_required", pendingSave.reason);
    const update = result.actorUpdates.find((entry) => entry.actorId === actor.id);
    const proposedData = update?.after ?? actor.data;
    envelope.proposedData = cloneValue(proposedData);
    envelope.changes = diffData(request.actor.data, proposedData, "typed-damage");
    envelope.details = { amount: request.amount!, damageType, criticalHit: request.criticalHit === true, effects: cloneValue(result.effects), pendingSaves: cloneValue(result.pendingSaves), warnings: cloneValue(result.warnings) };
  } catch (error) {
    block(envelope, "", "rules.preview_rejected", error instanceof Error ? error.message : "Typed damage preview failed.");
  }
  return finalize(envelope);
}

/**
 * Produces a deterministic proposal only. It never persists, timestamps, or
 * mutates the supplied actor/items. A blocked envelope is not safe to apply.
 */
export function previewDnd5eSrdRules(request: Dnd5eSrdRulesPreviewRequest): Dnd5eSrdRulesPreviewEnvelope {
  const envelope = baseEnvelope(request);
  if (request.operation === "advancement") return previewAdvancement(request, envelope);
  if (request.operation === "rest") return previewRest(request, envelope);
  return previewTypedDamage(request, envelope);
}
