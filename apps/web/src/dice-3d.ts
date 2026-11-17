import { rollHighlight, type RollHighlight, type RollTermLike } from "./dice-insights.js";

export interface DiceCastRollLike {
  id: string;
  formula: string;
  label?: string;
  total: number;
  createdAt: string;
  terms: RollTermLike[];
}

export interface DiceCastDiePlan {
  id: string;
  sides: number;
  value: number;
  kept: boolean;
  delayMs: number;
  spinXTurns: number;
  spinYTurns: number;
  fromXVmin: number;
  fromYVmin: number;
  restTiltDeg: number;
}

export interface DiceCastPlan {
  rollId: string;
  label: string;
  formula: string;
  total: number;
  highlight: RollHighlight;
  dice: DiceCastDiePlan[];
  settleMs: number;
  ttlMs: number;
}

export type DieShapeName = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

export interface Dice3dPreferenceEnvironment {
  prefersReducedMotion?: boolean;
  saveData?: boolean;
  hardwareConcurrency?: number;
}

export const diceCastMaxDice = 8;
export const physicsDiceMaxDice = 6;
export const dice3dStorageKey = "otte:dice3d";

const dieDelayStepMs = 60;
const dieSettleBaseMs = 900;
const castLingerMs = 1500;

export function initialDice3dEnabled(read: (key: string) => string | null, environment: Dice3dPreferenceEnvironment = {}): boolean {
  try {
    const stored = read(dice3dStorageKey);
    if (stored === "off") return false;
    if (stored === "on") return true;
    return !constrainedDice3dEnvironment(environment);
  } catch {
    return true;
  }
}

export function constrainedDice3dEnvironment(environment: Dice3dPreferenceEnvironment): boolean {
  return Boolean(environment.prefersReducedMotion || environment.saveData || (typeof environment.hardwareConcurrency === "number" && environment.hardwareConcurrency > 0 && environment.hardwareConcurrency <= 2));
}

export function dieShapeName(sides: number): DieShapeName {
  if (sides <= 4) return "d4";
  if (sides <= 6) return "d6";
  if (sides <= 8) return "d8";
  if (sides <= 10) return "d10";
  if (sides <= 12) return "d12";
  if (sides >= 100) return "d10";
  return "d20";
}

/** SVG polygon points in a 48x48 viewBox; null means use a rounded rect (d6). */
export function dieShapePoints(shape: DieShapeName): string | null {
  if (shape === "d4") return "24,4 44,41 4,41";
  if (shape === "d8") return "24,3 45,24 24,45 3,24";
  if (shape === "d10") return "24,3 42,21 24,45 6,21";
  if (shape === "d12") return "24,3 44,18 36,44 12,44 4,18";
  if (shape === "d20") return "24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5";
  return null;
}

/** Theater, not physics: the server already decided every face, this choreographs the tumble. */
export function diceCastPlan(roll: DiceCastRollLike, random: () => number = Math.random): DiceCastPlan {
  const dice: DiceCastDiePlan[] = [];
  for (const term of roll.terms) {
    if (dice.length >= diceCastMaxDice) break;
    if (term.type !== "die" || typeof term.sides !== "number" || !term.results || term.results.length === 0) continue;
    const keptPool = term.kept ? [...term.kept] : null;
    for (const value of term.results) {
      if (dice.length >= diceCastMaxDice) break;
      let kept = true;
      if (keptPool) {
        const keptIndex = keptPool.indexOf(value);
        kept = keptIndex !== -1;
        if (keptIndex !== -1) keptPool.splice(keptIndex, 1);
      }
      const index = dice.length;
      dice.push({
        id: `${roll.id}-${index}`,
        sides: term.sides,
        value,
        kept,
        delayMs: index * dieDelayStepMs,
        spinXTurns: 1 + Math.round(random()),
        spinYTurns: 1 + Math.round(random()),
        fromXVmin: -(30 + random() * 25),
        fromYVmin: -(6 + random() * 14),
        restTiltDeg: Math.round((random() - 0.5) * 14)
      });
    }
  }
  const settleMs = dieSettleBaseMs + (dice.at(-1)?.delayMs ?? 0);
  return {
    rollId: roll.id,
    label: roll.label?.trim() || roll.formula,
    formula: roll.formula,
    total: roll.total,
    highlight: rollHighlight(roll.terms),
    dice,
    settleMs,
    ttlMs: settleMs + castLingerMs
  };
}

/** Rolls worth animating: unseen and fresh enough to be part of the current table moment. */
export function newDiceCastRolls<T extends { id: string; createdAt: string }>(rolls: readonly T[], seenIds: ReadonlySet<string>, nowMs: number, maxAgeMs = 8000): T[] {
  return rolls.filter((roll) => {
    if (seenIds.has(roll.id)) return false;
    const created = Date.parse(roll.createdAt);
    return Number.isFinite(created) && nowMs - created <= maxAgeMs;
  });
}

export const diceBoxSupportedSides: ReadonlySet<number> = new Set([4, 6, 8, 10, 12, 20, 100]);

/** "2d6+1d20@2,5,18" - dice-box-threejs notation with every value forced to the server result. */
export function diceBoxNotation(plan: Pick<DiceCastPlan, "dice">, maxDice = physicsDiceMaxDice): string | null {
  if (plan.dice.length === 0) return null;
  if (plan.dice.length > maxDice) return null;
  if (!plan.dice.every((die) => diceBoxSupportedSides.has(die.sides))) return null;
  const groups = new Map<number, number[]>();
  for (const die of plan.dice) {
    const values = groups.get(die.sides) ?? [];
    values.push(die.value);
    groups.set(die.sides, values);
  }
  const notation = [...groups.entries()].map(([sides, values]) => `${values.length}d${sides}`).join("+");
  const forced = [...groups.values()].flat();
  return `${notation}@${forced.join(",")}`;
}
