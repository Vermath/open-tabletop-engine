import type { Actor } from "@open-tabletop/core";
import { dnd5eSrdXpThresholds } from "./dnd-static-content.js";

type Dnd5eSrdUtilityRoll = {
  id: string;
  label: string;
  formula: string;
  metadata?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function abilityScore(actor: Actor, ability: string): number {
  return number(record(actor.data.attributes)[ability], 10);
}

const SIZE_CARRY_MULTIPLIERS: Readonly<Record<string, number>> = Object.freeze({ tiny: 0.5, small: 1, medium: 1, large: 2, huge: 4, gargantuan: 8 });

export function dnd5eSrdCarryingCapacity(actor: Actor): { carryPounds: number; dragPounds: number; sizeMultiplier: number } {
  const strengthScore = abilityScore(actor, "strength");
  const size = (typeof actor.data.size === "string" ? actor.data.size : "medium").toLowerCase();
  const sizeMultiplier = SIZE_CARRY_MULTIPLIERS[size] ?? 1;
  return {
    carryPounds: Math.floor(strengthScore * 15 * sizeMultiplier),
    dragPounds: Math.floor(strengthScore * 30 * sizeMultiplier),
    sizeMultiplier
  };
}

export function dnd5eSrdFallingDamage(fallenFeet: number): Dnd5eSrdUtilityRoll {
  const dice = Math.min(20, Math.max(0, Math.floor(Math.max(0, fallenFeet) / 10)));
  return {
    id: "falling-damage",
    label: "Falling Damage",
    formula: dice > 0 ? `${dice}d6` : "0",
    metadata: { damageType: "bludgeoning", landsProne: dice > 0, rule: "1d6 per 10 feet fallen (max 20d6)" }
  };
}

export function dnd5eSrdJumpDistances(actor: Actor): { longJumpFt: number; highJumpFt: number; standingLongJumpFt: number; standingHighJumpFt: number } {
  const strengthScore = abilityScore(actor, "strength");
  const longJumpFt = Math.max(0, strengthScore);
  const highJumpFt = Math.max(0, 3 + Math.floor((strengthScore - 10) / 2));
  return {
    longJumpFt,
    highJumpFt,
    standingLongJumpFt: Math.floor(longJumpFt / 2),
    standingHighJumpFt: Math.floor(highJumpFt / 2)
  };
}

export function dnd5eSrdCoverBonus(cover: "half" | "three-quarters" | "total"): { acBonus: number; dexteritySaveBonus: number; targetable: boolean } {
  if (cover === "half") return { acBonus: 2, dexteritySaveBonus: 2, targetable: true };
  if (cover === "three-quarters") return { acBonus: 5, dexteritySaveBonus: 5, targetable: true };
  return { acBonus: 0, dexteritySaveBonus: 0, targetable: false };
}

export function dnd5eSrdLevelForXp(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  for (let index = 0; index < dnd5eSrdXpThresholds.length; index += 1) {
    if (safeXp >= dnd5eSrdXpThresholds[index]!) level = index + 1;
  }
  return level;
}

export function dnd5eSrdXpForNextLevel(xp: number): number | undefined {
  const level = dnd5eSrdLevelForXp(xp);
  return level >= 20 ? undefined : dnd5eSrdXpThresholds[level];
}

export interface Dnd5eSrdXpProgress {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
}

export function dnd5eSrdXpProgress(actor: Actor): Dnd5eSrdXpProgress {
  const xp = Math.max(0, Math.floor(number(actor.data.xp, 0)));
  const level = Math.max(1, Math.min(20, Math.floor(number(actor.data.level, 1))));
  const levelForXp = dnd5eSrdLevelForXp(xp);
  const nextLevelXp = level >= 20 ? undefined : dnd5eSrdXpThresholds[level];
  const previousLevelXp = dnd5eSrdXpThresholds[level - 1] ?? 0;
  return { xp, level, levelForXp, nextLevelXp, previousLevelXp, readyToLevel: levelForXp > level };
}
