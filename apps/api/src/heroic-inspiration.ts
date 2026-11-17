import type { DiceRoll, DiceRollTerm } from "@open-tabletop/core";

export interface HeroicInspirationDieChoice {
  termIndex: number;
  resultIndex: number;
  value: number;
  kept: boolean;
}

export interface HeroicInspirationRerollResult {
  terms: DiceRollTerm[];
  total: number;
  originalResult: number;
  replacementResult: number;
}

/**
 * Lists the selectable d20s for a normal roll or the two dice in the engine's
 * canonical Advantage/Disadvantage representation. Other dice expressions stay
 * manual instead of guessing which die the player meant.
 */
export function heroicInspirationDieChoices(
  roll: Pick<DiceRoll, "terms">,
): HeroicInspirationDieChoice[] {
  const termIndex = roll.terms.findIndex(isSupportedD20Term);
  if (termIndex < 0) return [];
  const term = roll.terms[termIndex]!;
  const kept = Array.isArray(term.kept) ? term.kept : [];
  return term.results!.map((value, resultIndex) => ({
    termIndex,
    resultIndex,
    value,
    kept: kept.includes(value),
  }));
}

/** Replaces exactly one selected d20 and recomputes only that term's contribution. */
export function applyHeroicInspirationReroll(
  original: Pick<DiceRoll, "terms" | "total">,
  selection: { termIndex: number; resultIndex: number },
  replacementResult: number,
): HeroicInspirationRerollResult {
  if (!Number.isInteger(replacementResult) || replacementResult < 1 || replacementResult > 20) {
    throw new Error("Heroic Inspiration replacement must be a d20 result from 1 to 20");
  }
  const choice = heroicInspirationDieChoices(original).find(
    (candidate) => candidate.termIndex === selection.termIndex && candidate.resultIndex === selection.resultIndex,
  );
  if (!choice) throw new Error("Selected die is not an eligible d20 result");
  const terms = structuredClone(original.terms);
  const term = terms[choice.termIndex]!;
  const previousKept = [...(term.kept ?? [])];
  term.results![choice.resultIndex] = replacementResult;
  term.kept = keptResults(term);
  const sign = term.sign === -1 ? -1 : 1;
  const previousContribution = previousKept.reduce((sum, result) => sum + result, 0) * sign;
  const nextContribution = term.kept.reduce((sum, result) => sum + result, 0) * sign;
  return {
    terms,
    total: original.total - previousContribution + nextContribution,
    originalResult: choice.value,
    replacementResult,
  };
}

function isSupportedD20Term(term: DiceRollTerm): boolean {
  if (term.type !== "die" || term.sides !== 20 || !Array.isArray(term.results)) return false;
  if (term.results.some((result) => !Number.isInteger(result) || result < 1 || result > 20)) return false;
  if (term.results.length === 1 && (term.count === undefined || term.count === 1)) {
    return term.keep === undefined && term.drop === undefined;
  }
  return term.results.length === 2
    && term.count === 2
    && (term.keep === "highest" || term.keep === "lowest")
    && term.keepCount === 1
    && term.drop === undefined;
}

function keptResults(term: DiceRollTerm): number[] {
  const results = [...(term.results ?? [])];
  if (term.keep && term.keepCount !== undefined) {
    return results.sort((left, right) => term.keep === "highest" ? right - left : left - right).slice(0, term.keepCount);
  }
  if (term.drop && term.dropCount !== undefined) {
    const keptCount = Math.max(0, results.length - term.dropCount);
    return results.sort((left, right) => term.drop === "highest" ? left - right : right - left).slice(0, keptCount);
  }
  return results;
}
