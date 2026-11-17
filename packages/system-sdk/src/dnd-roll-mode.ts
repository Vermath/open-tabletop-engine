export type Dnd5eSrdD20Mode = "normal" | "advantage" | "disadvantage";

export interface Dnd5eSrdD20RollMode {
  mode: Dnd5eSrdD20Mode;
  d20: "1d20" | "2d20kh1" | "2d20kl1";
  advantageSources: string[];
  disadvantageSources: string[];
}

export interface Dnd5eSrdD20Automation {
  d20: Dnd5eSrdD20RollMode["d20"];
  d20Mode: Dnd5eSrdD20Mode;
  advantageSources: string[];
  disadvantageSources: string[];
  modifier: number;
  automaticFailure: boolean;
  metadata?: Record<string, unknown>;
}

export interface Dnd5eSrdD20AutomationSources {
  conditionAdvantageSourceIds: readonly string[];
  conditionDisadvantageSourceIds: readonly string[];
  conditionAdvantageSources: readonly string[];
  conditionDisadvantageSources: readonly string[];
  featureAdvantageSources?: readonly string[];
  automaticFailureSources?: readonly string[];
  exhaustionLevel?: number;
}

function uniqueSources(sources: readonly string[]): string[] {
  return [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
}

/** One shared Advantage/Disadvantage combiner; source count never changes cancellation. */
export function combineDnd5eSrdD20RollMode(
  advantageSources: readonly string[] = [],
  disadvantageSources: readonly string[] = [],
): Dnd5eSrdD20RollMode {
  const advantage = uniqueSources(advantageSources);
  const disadvantage = uniqueSources(disadvantageSources);
  const mode: Dnd5eSrdD20Mode = advantage.length > 0 && disadvantage.length === 0
    ? "advantage"
    : disadvantage.length > 0 && advantage.length === 0
      ? "disadvantage"
      : "normal";
  return {
    mode,
    d20: mode === "advantage" ? "2d20kh1" : mode === "disadvantage" ? "2d20kl1" : "1d20",
    advantageSources: advantage,
    disadvantageSources: disadvantage,
  };
}

export function dnd5eSrdFormulaD20Mode(formula: string): Dnd5eSrdD20Mode | undefined {
  if (/^2d20kh1/i.test(formula)) return "advantage";
  if (/^2d20kl1/i.test(formula)) return "disadvantage";
  return /^1d20/i.test(formula) ? "normal" : undefined;
}

/** Builds inspectable d20 automation without coupling the combiner to actor storage. */
export function dnd5eSrdD20AutomationFromSources(input: Dnd5eSrdD20AutomationSources): Dnd5eSrdD20Automation {
  const features = uniqueSources(input.featureAdvantageSources ?? []);
  const failures = uniqueSources(input.automaticFailureSources ?? []);
  const exhaustionLevel = Math.max(0, Math.floor(input.exhaustionLevel ?? 0));
  const conditionMode = combineDnd5eSrdD20RollMode(input.conditionAdvantageSourceIds, input.conditionDisadvantageSourceIds);
  const combined = combineDnd5eSrdD20RollMode([...features, ...input.conditionAdvantageSources], input.conditionDisadvantageSources);
  const modifier = exhaustionLevel * -2;
  const metadata: Record<string, unknown> = {};
  const conditionSources = uniqueSources([...input.conditionAdvantageSourceIds, ...input.conditionDisadvantageSourceIds, ...failures, ...(exhaustionLevel > 0 ? ["exhaustion"] : [])]);
  if (input.conditionAdvantageSourceIds.length > 0 || input.conditionDisadvantageSourceIds.length > 0) metadata.conditionRollMode = conditionMode.mode;
  if (conditionSources.length > 0) metadata.conditionSources = conditionSources;
  if (combined.advantageSources.length > 0 || combined.disadvantageSources.length > 0) {
    metadata.d20Mode = combined.mode;
    metadata.advantageSources = combined.advantageSources;
    metadata.disadvantageSources = combined.disadvantageSources;
  }
  if (features.length > 0) {
    metadata.advantage = true;
    metadata.feature = features[0];
    if (features.length > 1) metadata.features = features;
    if (combined.disadvantageSources.length > 0) metadata.advantageCancelledByDisadvantage = true;
  }
  if (failures.length > 0) metadata.automaticFailure = true;
  if (exhaustionLevel > 0) {
    metadata.exhaustionLevel = exhaustionLevel;
    metadata.conditionPenalty = modifier;
  }
  return { d20: combined.d20, d20Mode: combined.mode, advantageSources: combined.advantageSources, disadvantageSources: combined.disadvantageSources, modifier, automaticFailure: failures.length > 0, ...(Object.keys(metadata).length > 0 ? { metadata } : {}) };
}

export function dnd5eSrdFeatureAdvantageRoll(roll: Dnd5eSrdD20Automation, feature: string): Dnd5eSrdD20Automation {
  const combined = combineDnd5eSrdD20RollMode([...roll.advantageSources, feature], roll.disadvantageSources);
  return {
    ...roll,
    d20: combined.d20,
    d20Mode: combined.mode,
    advantageSources: combined.advantageSources,
    disadvantageSources: combined.disadvantageSources,
    metadata: { ...roll.metadata, d20Mode: combined.mode, advantageSources: combined.advantageSources, disadvantageSources: combined.disadvantageSources, feature, advantage: true, ...(combined.disadvantageSources.length > 0 ? { advantageCancelledByDisadvantage: true } : {}) },
  };
}
