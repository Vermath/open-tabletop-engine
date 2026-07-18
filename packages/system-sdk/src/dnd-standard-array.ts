export const DND_5E_SRD_ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
export const DND_5E_SRD_STANDARD_ARRAY: readonly number[] = Object.freeze([15, 14, 13, 12, 10, 8]);
export type Dnd5eSrdAbility = typeof DND_5E_SRD_ABILITIES[number];

export interface Dnd5eSrdStandardArrayIssue {
  code: "invalid_type" | "invalid_ability" | "missing_ability" | "duplicate_ability" | "invalid_array";
  ability?: string;
  message: string;
}

export interface Dnd5eSrdStandardArrayValidation {
  ok: boolean;
  assignment?: Record<Dnd5eSrdAbility, number>;
  issues: Dnd5eSrdStandardArrayIssue[];
}

export interface Dnd5eSrdStandardArrayPreview extends Dnd5eSrdStandardArrayValidation {
  proposedData?: Record<string, unknown>;
  changes: Array<{ ability: Dnd5eSrdAbility; before: number; after: number }>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedAbilityId(value: string): string {
  return value.trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Validates a complete one-to-one assignment of the SRD standard array. */
export function dnd5eSrdValidateStandardArrayAssignment(value: unknown): Dnd5eSrdStandardArrayValidation {
  const issues: Dnd5eSrdStandardArrayIssue[] = [];
  const addIssue = (issue: Dnd5eSrdStandardArrayIssue): void => {
    if (!issues.some((candidate) => candidate.code === issue.code && candidate.ability === issue.ability)) issues.push(issue);
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [{ code: "invalid_type", message: "Standard-array assignment must map all six abilities to scores." }] };
  }
  const allowed = new Set<string>(DND_5E_SRD_ABILITIES);
  const normalized = new Map<Dnd5eSrdAbility, number>();
  for (const [rawAbility, rawScore] of Object.entries(value as Record<string, unknown>)) {
    const ability = normalizedAbilityId(rawAbility);
    if (!allowed.has(ability)) {
      addIssue({ code: "invalid_ability", ability: rawAbility, message: `${rawAbility} is not a D&D ability.` });
      continue;
    }
    if (normalized.has(ability as Dnd5eSrdAbility)) {
      addIssue({ code: "duplicate_ability", ability, message: `${ability} is assigned more than once.` });
      continue;
    }
    if (typeof rawScore !== "number" || !Number.isInteger(rawScore)) {
      addIssue({ code: "invalid_array", ability, message: `${ability} must receive one integer from the standard array.` });
      continue;
    }
    normalized.set(ability as Dnd5eSrdAbility, rawScore);
  }
  for (const ability of DND_5E_SRD_ABILITIES) {
    if (!normalized.has(ability)) addIssue({ code: "missing_ability", ability, message: `${ability} requires a standard-array score.` });
  }
  const scores = [...normalized.values()].sort((left, right) => right - left);
  if (scores.length !== DND_5E_SRD_STANDARD_ARRAY.length || scores.some((score, index) => score !== DND_5E_SRD_STANDARD_ARRAY[index])) {
    addIssue({ code: "invalid_array", message: `Use each standard-array score exactly once: ${DND_5E_SRD_STANDARD_ARRAY.join(", ")}.` });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    assignment: Object.fromEntries(DND_5E_SRD_ABILITIES.map((ability) => [ability, normalized.get(ability)!])) as Record<Dnd5eSrdAbility, number>,
    issues: []
  };
}

/** Side-effect-free standard-array projection used by creator preview/commit workflows. */
export function previewDnd5eSrdStandardArrayAssignment(template: { data: Record<string, unknown> }, value: unknown): Dnd5eSrdStandardArrayPreview {
  const validation = dnd5eSrdValidateStandardArrayAssignment(value);
  if (!validation.ok || !validation.assignment) return { ...validation, changes: [] };
  const proposedData = JSON.parse(JSON.stringify(template.data)) as Record<string, unknown>;
  const attributes = record(proposedData.attributes);
  const before = Object.fromEntries(DND_5E_SRD_ABILITIES.map((ability) => [ability, typeof attributes[ability] === "number" && Number.isFinite(attributes[ability]) ? attributes[ability] : 10])) as Record<Dnd5eSrdAbility, number>;
  proposedData.attributes = { ...validation.assignment };
  proposedData.origin = { ...record(proposedData.origin), abilityScoreMethod: "standard-array", standardArrayAssignment: { ...validation.assignment } };
  return {
    ...validation,
    proposedData,
    changes: DND_5E_SRD_ABILITIES
      .filter((ability) => before[ability] !== validation.assignment![ability])
      .map((ability) => ({ ability, before: before[ability], after: validation.assignment![ability] }))
  };
}
