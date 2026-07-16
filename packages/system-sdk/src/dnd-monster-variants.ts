import type { CompendiumCatalogEntry, CompendiumProvenance } from "@open-tabletop/core";

import { buildDndCustomContent, type DndCustomContentDraft, type DndCustomContentIssue } from "./dnd-custom-content.js";

export const DND_MONSTER_OVERRIDE_FIELDS = [
  "size",
  "creatureType",
  "alignment",
  "armorClass",
  "initiative",
  "hitPoints",
  "hitDice",
  "challengeRating",
  "xp",
  "proficiencyBonus",
  "speed",
  "abilities",
  "actions",
  "savingThrows",
  "skills",
  "senses",
  "languages",
  "gear",
  "traits",
  "reactions",
  "legendaryActions",
  "manualAdjudication",
] as const;

export type DndMonsterOverrideField = (typeof DND_MONSTER_OVERRIDE_FIELDS)[number];

export interface DndMonsterNamedFeature {
  name: string;
  description: string;
}

export interface DndMonsterActionOverride extends DndMonsterNamedFeature {
  kind?: "action" | "bonusAction" | "reaction";
  attackBonus?: number;
  range?: string;
  damageFormula?: string;
  damageType?: string;
  save?: { ability: string; dc: number; success?: string };
  condition?: string;
  effects?: string[];
  recharge?: string;
}

/** Explicit, allow-listed monster fields that a campaign template or variant may replace. */
export interface DndMonsterOverrides {
  size?: string;
  creatureType?: string;
  alignment?: string;
  armorClass?: number;
  initiative?: number;
  hitPoints?: number;
  hitDice?: string;
  challengeRating?: string;
  xp?: number;
  proficiencyBonus?: number;
  speed?: Record<string, number>;
  abilities?: Record<string, number>;
  actions?: DndMonsterActionOverride[];
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  senses?: string[];
  languages?: string[];
  gear?: string[];
  traits?: DndMonsterNamedFeature[];
  reactions?: DndMonsterNamedFeature[];
  legendaryActions?: DndMonsterNamedFeature[];
  manualAdjudication?: string;
}

export interface DndMonsterTemplateDraft {
  name: string;
  description: string;
  overrides: DndMonsterOverrides;
}

export interface DndMonsterTemplateRecord extends DndMonsterTemplateDraft {
  id: string;
  version: string;
}

export type DndMonsterBaseKind = "bundled" | "campaign";

export interface DndMonsterBaseReference {
  kind: DndMonsterBaseKind;
  id: string;
  version: string;
  name: string;
  provenance: CompendiumProvenance;
}

export interface DndMonsterBase extends DndMonsterBaseReference {
  data: Record<string, unknown>;
}

export interface DndMonsterVariantDraft extends Omit<DndCustomContentDraft, "id" | "kind" | "data"> {
  base: Pick<DndMonsterBaseReference, "kind" | "id" | "version">;
  template?: { id: string; version: string };
  overrides: DndMonsterOverrides;
}

export interface DndMonsterVariantMetadata {
  schemaVersion: "1.0.0";
  base: DndMonsterBaseReference;
  template?: { id: string; version: string; name: string; overrides: DndMonsterOverrides };
  overrides: DndMonsterOverrides;
  appliedOverrides: DndMonsterOverrides;
}

export interface DndMonsterVariantDiffEntry {
  path: string;
  before?: unknown;
  after?: unknown;
}

export type DndMonsterTemplateValidationResult =
  | { ok: true; overrides: DndMonsterOverrides; warnings: DndCustomContentIssue[] }
  | { ok: false; errors: DndCustomContentIssue[]; warnings: DndCustomContentIssue[] };

export type DndMonsterVariantBuildResult =
  | {
      ok: true;
      entry: CompendiumCatalogEntry;
      metadata: DndMonsterVariantMetadata;
      diff: DndMonsterVariantDiffEntry[];
      warnings: DndCustomContentIssue[];
    }
  | { ok: false; errors: DndCustomContentIssue[]; warnings: DndCustomContentIssue[] };

const overrideFieldSet = new Set<string>(DND_MONSTER_OVERRIDE_FIELDS);
const nestedMergeFields = new Set<DndMonsterOverrideField>(["speed", "abilities", "savingThrows", "skills"]);
const balanceFields = new Set<DndMonsterOverrideField>([
  "size",
  "armorClass",
  "initiative",
  "hitPoints",
  "hitDice",
  "challengeRating",
  "xp",
  "proficiencyBonus",
  "speed",
  "abilities",
  "actions",
  "savingThrows",
  "skills",
  "traits",
  "reactions",
  "legendaryActions",
]);

const validationMonster: Record<string, unknown> = {
  size: "medium",
  creatureType: "Construct",
  alignment: "Unaligned",
  armorClass: 10,
  initiative: 0,
  hitPoints: 1,
  hitDice: "1d8",
  challengeRating: "0",
  xp: 0,
  proficiencyBonus: 2,
  speed: { walk: 30 },
  abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  actions: [{ name: "Unarmed Strike", description: "A manually resolved attack." }],
  savingThrows: {},
  skills: {},
  senses: [],
  languages: [],
  gear: [],
  traits: [],
  reactions: [],
  legendaryActions: [],
};

/** Validate and sanitize a base-independent campaign monster-template override set. */
export function validateDndMonsterTemplateOverrides(value: unknown): DndMonsterTemplateValidationResult {
  const errors: DndCustomContentIssue[] = [];
  const input = record(value);
  for (const key of Object.keys(input)) {
    if (!overrideFieldSet.has(key)) {
      errors.push({
        path: `overrides.${key}`,
        code: "unsupported_override",
        message: `${key} is not an allowed monster-template override.`,
      });
    }
  }
  const requested = Object.fromEntries(Object.entries(input).filter(([key]) => overrideFieldSet.has(key))) as DndMonsterOverrides;
  const result = buildDndCustomContent({
    id: "monster-template-validation",
    kind: "monster",
    name: "Monster template validation",
    summary: "Validates a campaign-scoped typed monster override template.",
    sourceName: "Campaign template",
    sourceVersion: "1",
    contentVersion: "1",
    license: { name: "Private home game", usage: "private_home_game" },
    data: applyDndMonsterOverrides(validationMonster, requested),
  });
  if (!result.ok) {
    errors.push(...result.errors.map((issue) => ({ ...issue, path: issue.path.replace(/^data\./, "overrides.") })));
  }
  if (errors.length > 0 || !result.ok) return { ok: false, errors, warnings: result.warnings };
  const sanitized = selectRequestedOverrides(result.entry.data, requested);
  return { ok: true, overrides: sanitized, warnings: result.warnings };
}

/**
 * Build a reviewed monster variant without mutating its base or template.
 * Challenge Rating and XP are never calculated: any combat-bearing change
 * must include both as explicit template or variant overrides.
 */
export function buildDndMonsterVariant(input: {
  id: string;
  draft: DndMonsterVariantDraft;
  base: DndMonsterBase;
  template?: DndMonsterTemplateRecord;
}): DndMonsterVariantBuildResult {
  const errors: DndCustomContentIssue[] = [];
  if (input.draft.base.kind !== input.base.kind || input.draft.base.id !== input.base.id || input.draft.base.version !== input.base.version) {
    errors.push({ path: "base", code: "base_mismatch", message: "The resolved monster base does not match the reviewed base reference." });
  }
  if (input.draft.template && (!input.template || input.draft.template.id !== input.template.id || input.draft.template.version !== input.template.version)) {
    errors.push({ path: "template", code: "template_mismatch", message: "The resolved monster template does not match the reviewed template reference." });
  }
  if (!input.draft.template && input.template) {
    errors.push({ path: "template", code: "unexpected_template", message: "A template was resolved but was not present in the reviewed request." });
  }

  const templateValidation = validateDndMonsterTemplateOverrides(input.template?.overrides ?? {});
  const explicitValidation = validateDndMonsterTemplateOverrides(input.draft.overrides);
  if (!templateValidation.ok) errors.push(...templateValidation.errors.map((issue) => ({ ...issue, path: issue.path.replace(/^overrides/, "template.overrides") })));
  if (!explicitValidation.ok) errors.push(...explicitValidation.errors);
  const warnings = [
    ...templateValidation.warnings,
    ...explicitValidation.warnings,
  ];
  if (!templateValidation.ok || !explicitValidation.ok) return { ok: false, errors, warnings };

  const appliedOverrides = mergeDndMonsterOverrides(templateValidation.overrides, explicitValidation.overrides);
  const changedBalance = (Object.keys(appliedOverrides) as DndMonsterOverrideField[]).some((key) => balanceFields.has(key));
  if (changedBalance && !Object.hasOwn(appliedOverrides, "challengeRating")) {
    errors.push({ path: "overrides.challengeRating", code: "explicit_rating_required", message: "Combat-bearing monster changes require an explicit Challenge Rating; it is never inferred." });
  }
  if (changedBalance && !Object.hasOwn(appliedOverrides, "xp")) {
    errors.push({ path: "overrides.xp", code: "explicit_xp_required", message: "Combat-bearing monster changes require explicit XP; it is never inferred." });
  }
  if (errors.length > 0) return { ok: false, errors, warnings };

  const baseBefore = jsonClone(input.base.data);
  const built = buildDndCustomContent({
    id: input.id,
    kind: "monster",
    name: input.draft.name,
    summary: input.draft.summary,
    sourceName: input.draft.sourceName,
    sourceVersion: input.draft.sourceVersion,
    contentVersion: input.draft.contentVersion,
    license: input.draft.license,
    data: applyDndMonsterOverrides(baseBefore, appliedOverrides),
  });
  if (!built.ok) return { ok: false, errors: built.errors, warnings: [...warnings, ...built.warnings] };

  const metadata: DndMonsterVariantMetadata = {
    schemaVersion: "1.0.0",
    base: cloneBaseReference(input.base),
    ...(input.template ? {
      template: {
        id: input.template.id,
        version: input.template.version,
        name: input.template.name,
        overrides: jsonClone(templateValidation.overrides),
      },
    } : {}),
    overrides: jsonClone(explicitValidation.overrides),
    appliedOverrides: jsonClone(appliedOverrides),
  };
  const effectiveData = monsterEffectiveData(built.entry.data);
  built.entry.data.monsterVariant = metadata;
  const reviewWarnings: DndCustomContentIssue[] = changedBalance
    ? [{ path: "overrides", code: "cr_xp_not_inferred", message: "Challenge Rating and XP use the explicit reviewed values; no automatic scaling math was applied." }]
    : [{ path: "overrides", code: "base_rating_retained", message: "No combat-bearing field changed, so the base Challenge Rating and XP are retained without inference." }];
  return {
    ok: true,
    entry: built.entry,
    metadata,
    diff: diffDndMonsterData(monsterEffectiveData(baseBefore), effectiveData),
    warnings: [...warnings, ...built.warnings, ...reviewWarnings],
  };
}

/** Apply top-level replacements plus partial typed map overrides to a detached monster record. */
export function applyDndMonsterOverrides(base: Record<string, unknown>, overrides: DndMonsterOverrides): Record<string, unknown> {
  const result = jsonClone(base);
  for (const key of DND_MONSTER_OVERRIDE_FIELDS) {
    if (!Object.hasOwn(overrides, key)) continue;
    const value = overrides[key];
    if (nestedMergeFields.has(key) && isRecord(value)) {
      result[key] = { ...record(result[key]), ...jsonClone(value) };
    } else {
      result[key] = jsonClone(value);
    }
  }
  return result;
}

export function mergeDndMonsterOverrides(base: DndMonsterOverrides, next: DndMonsterOverrides): DndMonsterOverrides {
  return selectRequestedOverrides(applyDndMonsterOverrides(base as Record<string, unknown>, next), {
    ...base,
    ...next,
    ...Object.fromEntries([...nestedMergeFields].flatMap((key) => Object.hasOwn(base, key) || Object.hasOwn(next, key) ? [[key, {}]] : [])),
  } as DndMonsterOverrides);
}

export function diffDndMonsterData(before: Record<string, unknown>, after: Record<string, unknown>): DndMonsterVariantDiffEntry[] {
  const changes: DndMonsterVariantDiffEntry[] = [];
  collectDiff("data", cleanJson(before), cleanJson(after), changes);
  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

/** Convert an immutable SRD stat block into the custom-builder shape without losing structured actions. */
export function dnd5eMonsterContentDataFromStatBlock(value: Record<string, unknown>): Record<string, unknown> {
  const speed = parseMonsterSpeed(value.speed);
  return cleanJson({
    size: normalizedMonsterSize(value.size),
    creatureType: text(value.creatureType),
    alignment: text(value.alignment),
    armorClass: finiteNumber(value.armorClass),
    initiative: finiteNumber(value.initiative),
    hitPoints: finiteNumber(value.hitPoints),
    hitDice: text(value.hitDice),
    challengeRating: text(value.challengeRating),
    xp: finiteNumber(value.xp),
    proficiencyBonus: finiteNumber(value.proficiencyBonus),
    speed,
    abilities: numericRecord(value.abilities),
    savingThrows: numericRecord(value.saves),
    skills: numericRecord(value.skills),
    senses: textArray(value.senses),
    languages: textArray(value.languages),
    gear: textArray(value.gear),
    traits: featureArray(value.traits),
    actions: actionArray(value.actions),
    reactions: [],
    legendaryActions: [],
  });
}

/** Convert a reviewed custom monster entry into the actor-data contract used by D&D combat and sheets. */
export function dnd5eCustomMonsterActorData(entry: CompendiumCatalogEntry): Record<string, unknown> | undefined {
  if (entry.type !== "monster" || entry.data.customContentKind !== "monster") return undefined;
  const data = record(entry.data);
  const hitPoints = finiteNumber(data.hitPoints) ?? 1;
  const armorClass = finiteNumber(data.armorClass) ?? 10;
  const explicitInitiative = finiteNumber(data.initiative);
  const initiative = explicitInitiative ?? 0;
  const challengeRating = text(data.challengeRating) ?? "0";
  const xp = finiteNumber(data.xp) ?? 0;
  const actions = actionArray(data.actions).map(({ description, ...action }) => ({ ...action, summary: description }));
  const reactionActions = featureArray(data.reactions).map((feature) => ({ name: feature.name, kind: "reaction", summary: feature.description }));
  const legendaryActions = featureArray(data.legendaryActions).map((feature) => ({ name: feature.name, kind: "reaction", summary: feature.description }));
  const statBlock = cleanJson({
    source: entry.provenance.rulesVersion,
    size: titleCase(text(data.size) ?? "medium"),
    creatureType: text(data.creatureType) ?? "Monster",
    alignment: text(data.alignment) ?? "Unaligned",
    armorClass,
    ...(explicitInitiative !== undefined ? { initiative: explicitInitiative } : {}),
    hitPoints,
    hitDice: text(data.hitDice) ?? "1d8",
    speed: formatMonsterSpeed(record(data.speed)),
    challengeRating,
    xp,
    proficiencyBonus: finiteNumber(data.proficiencyBonus) ?? 2,
    abilities: numericRecord(data.abilities),
    saves: numericRecord(data.savingThrows),
    skills: numericRecord(data.skills),
    senses: textArray(data.senses),
    languages: textArray(data.languages),
    gear: textArray(data.gear),
    traits: featureArray(data.traits).map((feature) => ({ name: feature.name, summary: feature.description })),
    actions: [...actions, ...reactionActions, ...legendaryActions],
  });
  return {
    ruleset: entry.provenance.rulesVersion,
    level: challengeRatingNumber(challengeRating),
    monster: {
      threatId: entry.id,
      role: text(data.creatureType)?.toLowerCase() ?? "monster",
      summary: entry.summary,
      statBlock,
      ...(isRecord(data.monsterVariant) ? { variant: jsonClone(data.monsterVariant) } : {}),
    },
    hp: { current: hitPoints, max: hitPoints },
    armorClass,
    initiative,
    challengeRating,
    xp,
    proficiencyBonus: finiteNumber(data.proficiencyBonus) ?? 2,
    attributes: numericRecord(data.abilities),
    saveProficiencies: [],
    skillProficiencies: Object.keys(numericRecord(data.skills)),
    toolProficiencies: [],
    conditions: [],
  };
}

function selectRequestedOverrides(normalized: Record<string, unknown>, requested: DndMonsterOverrides): DndMonsterOverrides {
  const selected: Record<string, unknown> = {};
  for (const key of DND_MONSTER_OVERRIDE_FIELDS) {
    if (!Object.hasOwn(requested, key)) continue;
    if (nestedMergeFields.has(key)) {
      const requestedMap = record(requested[key]);
      const normalizedMap = record(normalized[key]);
      selected[key] = Object.fromEntries(Object.keys(requestedMap).flatMap((nestedKey) => Object.hasOwn(normalizedMap, nestedKey) ? [[nestedKey, jsonClone(normalizedMap[nestedKey])]] : []));
    } else if (Object.hasOwn(normalized, key)) {
      selected[key] = jsonClone(normalized[key]);
    }
  }
  return selected as DndMonsterOverrides;
}

function cloneBaseReference(base: DndMonsterBase): DndMonsterBaseReference {
  return {
    kind: base.kind,
    id: base.id,
    version: base.version,
    name: base.name,
    provenance: { ...base.provenance, license: { ...base.provenance.license } },
  };
}

function monsterEffectiveData(value: Record<string, unknown>): Record<string, unknown> {
  const data = jsonClone(value);
  delete data.summary;
  delete data.customContentKind;
  delete data.builderSchemaVersion;
  delete data.monsterVariant;
  return cleanJson(data);
}

function collectDiff(path: string, before: unknown, after: unknown, changes: DndMonsterVariantDiffEntry[]): void {
  if (Object.is(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) collectDiff(`${path}.${key}`, before[key], after[key], changes);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && JSON.stringify(before) === JSON.stringify(after)) return;
  changes.push({ path, ...(before !== undefined ? { before: jsonClone(before) } : {}), ...(after !== undefined ? { after: jsonClone(after) } : {}) });
}

function parseMonsterSpeed(value: unknown): Record<string, number> {
  if (isRecord(value)) return numericRecord(value);
  const source = text(value) ?? "";
  const result: Record<string, number> = {};
  const labeled = /\b(Burrow|Climb|Fly|Swim)\s+(\d+)\s*ft\.?/gi;
  for (const match of source.matchAll(labeled)) result[match[1]!.toLowerCase()] = Number(match[2]);
  const walk = source.match(/^\s*(\d+)\s*ft\.?/i);
  result.walk = walk ? Number(walk[1]) : 0;
  return result;
}

function formatMonsterSpeed(value: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["walk", "burrow", "climb", "fly", "swim"]) {
    const amount = finiteNumber(value[key]);
    if (amount === undefined) continue;
    parts.push(`${key === "walk" ? "" : `${titleCase(key)} `}${amount} ft.`.trim());
  }
  return parts.join(", ") || "0 ft.";
}

function featureArray(value: unknown): DndMonsterNamedFeature[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const feature = record(item);
    const name = text(feature.name);
    const description = text(feature.description) ?? text(feature.summary);
    return name && description ? [{ name, description }] : [];
  });
}

function actionArray(value: unknown): DndMonsterActionOverride[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const action = record(item);
    const name = text(action.name);
    const description = text(action.description) ?? text(action.summary) ?? (name ? `${name} is resolved using the reviewed stat block.` : undefined);
    if (!name || !description) return [];
    return [{
      name,
      description,
      ...(["action", "bonusAction", "reaction"].includes(text(action.kind) ?? "") ? { kind: text(action.kind) as DndMonsterActionOverride["kind"] } : {}),
      ...(finiteNumber(action.attackBonus) !== undefined ? { attackBonus: finiteNumber(action.attackBonus) } : {}),
      ...(text(action.range) ? { range: text(action.range) } : {}),
      ...(text(action.damageFormula) ? { damageFormula: text(action.damageFormula) } : {}),
      ...(text(action.damageType) ? { damageType: text(action.damageType) } : {}),
      ...(isRecord(action.save) ? { save: cleanJson(action.save) as DndMonsterActionOverride["save"] } : {}),
      ...(text(action.condition) ? { condition: text(action.condition) } : {}),
      ...(textArray(action.effects).length > 0 ? { effects: textArray(action.effects) } : {}),
      ...(text(action.recharge) ? { recharge: text(action.recharge) } : {}),
    }];
  });
}

function numericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([key, nested]) => finiteNumber(nested) === undefined ? [] : [[key, finiteNumber(nested)!]]));
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function titleCase(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function normalizedMonsterSize(value: unknown): string | undefined {
  return text(value)?.toLowerCase().match(/\b(tiny|small|medium|large|huge|gargantuan)\b/)?.[1];
}

function challengeRatingNumber(value: string): number {
  const fraction = value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator > 0 ? Number(fraction[1]) / denominator : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cleanJson(item)) as T;
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, nested]) => nested === undefined ? [] : [[key, cleanJson(nested)]])) as T;
  }
  return value;
}

function jsonClone<T>(value: T): T {
  return cleanJson(structuredClone(value));
}
