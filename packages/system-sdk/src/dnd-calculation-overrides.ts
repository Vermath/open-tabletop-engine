import type { ActorCalculationExplanation, CalculationFieldExplanation, CalculationOverride } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export type Dnd5eSrdCalculationOverrideTarget =
  | { kind: "formula"; rollId: string }
  | { kind: "number"; sheetPath: "armorClass" | "speed" | "passivePerception" | "spellSaveDc" | "spellAttackBonus" | "hp.max" | "hp.current" | "temporaryHp" };

export interface Dnd5eSrdEffectiveCalculationOverride {
  overrideId: string;
  fieldId: string;
  source: CalculationOverride["source"];
  reason: string;
  baseValue: number | string;
  effectiveValue: number | string;
  target: Dnd5eSrdCalculationOverrideTarget;
}

export interface Dnd5eSrdRejectedCalculationOverride {
  overrideId: string;
  fieldId: string;
  reason: string;
}

/** Serializable context shared by sheet, roll, resolution, consumption and audit paths. */
export interface Dnd5eSrdCalculationOverrideContext {
  actorId: string;
  rulesVersion: string;
  effective: Dnd5eSrdEffectiveCalculationOverride[];
  rejected: Dnd5eSrdRejectedCalculationOverride[];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function sameValue(left: number | string, right: number | string): boolean {
  return typeof left === typeof right && left === right;
}

/** Deliberately narrower than arbitrary expressions accepted by no rules path. */
export function dnd5eSrdSafeOverrideFormula(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value !== "string") return undefined;
  const formula = value.trim();
  if (!formula || formula.length > 200) return undefined;
  const atom = String.raw`(?:\d*d\d+(?:k[hl]\d+)?|\d+)`;
  return new RegExp(String.raw`^[+-]?${atom}(?:\s*[+\-*/]\s*${atom})*$`, "i").test(formula) ? formula : undefined;
}

export function dnd5eSrdCalculationOverrideTarget(fieldId: string): Dnd5eSrdCalculationOverrideTarget | undefined {
  if (fieldId === "initiative") return { kind: "formula", rollId: "initiative" };
  if (fieldId.startsWith("saving-throw.")) return { kind: "formula", rollId: `save-${fieldId.slice("saving-throw.".length)}` };
  if (fieldId.startsWith("skill.")) return { kind: "formula", rollId: `skill-${fieldId.slice("skill.".length)}` };
  if (fieldId.startsWith("roll.") && fieldId.length > 5) return { kind: "formula", rollId: fieldId.slice(5) };
  const numericTargets: Record<string, Extract<Dnd5eSrdCalculationOverrideTarget, { kind: "number" }>["sheetPath"]> = {
    "armor-class": "armorClass",
    speed: "speed",
    "passive-perception": "passivePerception",
    "spell-save-dc": "spellSaveDc",
    "spell-attack-bonus": "spellAttackBonus",
    "hit-points-maximum": "hp.max",
    "hit-points-current": "hp.current",
    "hit-points-temporary": "temporaryHp",
  };
  return numericTargets[fieldId] ? { kind: "number", sheetPath: numericTargets[fieldId] } : undefined;
}

export function dnd5eSrdCalculationOverrideValueIsValid(fieldId: string, value: unknown): boolean {
  const target = dnd5eSrdCalculationOverrideTarget(fieldId);
  if (!target) return false;
  return target.kind === "formula" ? dnd5eSrdSafeOverrideFormula(value) !== undefined : typeof value === "number" && Number.isFinite(value);
}

export function buildDnd5eSrdCalculationOverrideContext(
  explanation: ActorCalculationExplanation,
  overrides: readonly CalculationOverride[],
): Dnd5eSrdCalculationOverrideContext {
  const fieldById = new Map(explanation.fields.map((field) => [field.id, field]));
  const latestByField = new Map<string, CalculationOverride>();
  for (const entry of [...overrides]
    .filter((candidate) => candidate.actorId === explanation.actorId && !candidate.clearedAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))) {
    latestByField.set(entry.fieldId, entry);
  }
  const effective: Dnd5eSrdEffectiveCalculationOverride[] = [];
  const rejected: Dnd5eSrdRejectedCalculationOverride[] = [];
  for (const override of latestByField.values()) {
    const field = fieldById.get(override.fieldId);
    const target = dnd5eSrdCalculationOverrideTarget(override.fieldId);
    const reject = (reason: string) => rejected.push({ overrideId: override.id, fieldId: override.fieldId, reason });
    if (!field) reject("The calculation field is no longer available.");
    else if (!target) reject("This calculation field is annotation-only and cannot override authoritative state.");
    else if (override.systemId !== explanation.systemId || override.rulesVersion !== explanation.rulesVersion) reject("The override targets a different system or rules version.");
    else if (!sameValue(override.baseValue, field.result)) reject("The base calculation changed after this override was recorded.");
    else if (!dnd5eSrdCalculationOverrideValueIsValid(override.fieldId, override.effectiveValue)) reject("The effective value has the wrong type or is not a safe formula.");
    else effective.push({ overrideId: override.id, fieldId: override.fieldId, source: override.source, reason: override.reason, baseValue: override.baseValue, effectiveValue: override.effectiveValue, target });
  }
  return { actorId: explanation.actorId, rulesVersion: explanation.rulesVersion, effective, rejected };
}

function overrideTerm(entry: Dnd5eSrdEffectiveCalculationOverride) {
  return {
    label: "Documented calculation override",
    formula: `${String(entry.baseValue)} -> ${String(entry.effectiveValue)}`,
    source: { kind: "override" as const, id: entry.overrideId, name: entry.reason },
  };
}

export function applyDnd5eSrdCalculationOverridesToExplanation(
  explanation: ActorCalculationExplanation,
  context: Dnd5eSrdCalculationOverrideContext,
): ActorCalculationExplanation {
  const effective = new Map(context.effective.map((entry) => [entry.fieldId, entry]));
  const rejected = new Map(context.rejected.map((entry) => [entry.fieldId, entry]));
  return {
    ...explanation,
    fields: explanation.fields.map((field): CalculationFieldExplanation => {
      const entry = effective.get(field.id);
      if (entry) return { ...field, result: entry.effectiveValue, terms: [...field.terms, overrideTerm(entry)], flags: { ...field.flags, override: true, reasons: [...new Set([...field.flags.reasons, `${entry.source}: ${entry.reason}`])] } };
      const stale = rejected.get(field.id);
      return stale ? { ...field, flags: { ...field.flags, ambiguous: true, reasons: [...new Set([...field.flags.reasons, `Inactive calculation override: ${stale.reason}`])] } } : field;
    }),
  };
}

export function dnd5eSrdFormulaOverride(context: Dnd5eSrdCalculationOverrideContext | undefined, rollId: string): Dnd5eSrdEffectiveCalculationOverride | undefined {
  return context?.effective.find((entry) => entry.target.kind === "formula" && entry.target.rollId === rollId);
}

export function applyDnd5eSrdCalculationOverridesToRolls<T extends { id: string; formula: string; metadata?: Record<string, unknown> }>(
  rolls: T[],
  context: Dnd5eSrdCalculationOverrideContext,
): T[] {
  return rolls.map((roll) => {
    const entry = dnd5eSrdFormulaOverride(context, roll.id);
    if (!entry) return roll;
    const formula = dnd5eSrdSafeOverrideFormula(entry.effectiveValue)!;
    return { ...roll, formula, metadata: { ...roll.metadata, calculationOverride: { id: entry.overrideId, fieldId: entry.fieldId, source: entry.source, reason: entry.reason, baseFormula: roll.formula, effectiveFormula: formula } } };
  });
}

function withNumericPath(data: JsonRecord, path: Extract<Dnd5eSrdCalculationOverrideTarget, { kind: "number" }>["sheetPath"], value: number, entry: Dnd5eSrdEffectiveCalculationOverride): JsonRecord {
  if (path === "armorClass") return {
    ...data,
    armorClass: value,
    armorClassDetails: {
      ...record(data.armorClassDetails),
      value,
      calculationOverride: true,
      calculationOverrideId: entry.overrideId,
      calculationOverrideSource: entry.source,
      calculationOverrideReason: entry.reason,
      calculationOverrideBaseValue: entry.baseValue,
      calculationOverrideEffectiveValue: entry.effectiveValue,
    },
  };
  if (path === "speed") return { ...data, effectiveSpeed: value, speedDetails: { ...record(data.speedDetails), value, calculationOverride: true } };
  if (path === "hp.max" || path === "hp.current") return { ...data, hp: { ...record(data.hp), [path.slice(3)]: value } };
  return { ...data, [path]: value };
}

export function applyDnd5eSrdCalculationOverridesToSheet<T extends { data: Record<string, unknown>; quickRolls: Array<{ id: string; formula: string; metadata?: Record<string, unknown> }> }>(
  sheet: T,
  context: Dnd5eSrdCalculationOverrideContext,
): T {
  let data = { ...sheet.data };
  for (const entry of context.effective) if (entry.target.kind === "number") data = withNumericPath(data, entry.target.sheetPath, entry.effectiveValue as number, entry);
  return { ...sheet, data, quickRolls: applyDnd5eSrdCalculationOverridesToRolls(sheet.quickRolls, context) };
}
