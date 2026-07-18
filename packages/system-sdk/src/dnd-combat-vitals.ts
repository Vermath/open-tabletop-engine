import type { Actor } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export type Dnd5eSrdCombatVitalsAdjustment =
  | { kind: "healing"; amount: number; revivesDead?: boolean }
  | { kind: "temporaryHitPoints"; amount: number };

export interface Dnd5eSrdCombatVitalsResult {
  data: JsonRecord;
  kind: Dnd5eSrdCombatVitalsAdjustment["kind"];
  pool: "hp" | "temporaryHitPoints" | "temporaryHp" | "tempHp";
  requestedAmount: number;
  appliedAmount: number;
  before: number;
  after: number;
  max: number;
  recoveredFromZero: boolean;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function adjustmentAmount(amount: number): number {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error("Combat-vitals amount must be a finite nonnegative integer");
  }
  return amount;
}

function temporaryHitPoints(data: JsonRecord): { key: "temporaryHitPoints" | "temporaryHp" | "tempHp"; current: number; record?: JsonRecord } {
  for (const key of ["temporaryHitPoints", "temporaryHp", "tempHp"] as const) {
    if (!(key in data)) continue;
    const value = data[key];
    const valueRecord = record(value);
    const current = typeof value === "number" ? value : finiteNumber(valueRecord.current) ?? 0;
    return { key, current: Math.max(0, Math.floor(current)), ...(value && typeof value === "object" && !Array.isArray(value) ? { record: valueRecord } : {}) };
  }
  return { key: "temporaryHitPoints", current: 0 };
}

function conditionId(condition: unknown): string | undefined {
  const conditionRecord = record(condition);
  const id = typeof condition === "string" ? condition : typeof conditionRecord.id === "string" ? conditionRecord.id : undefined;
  return id?.trim().toLowerCase();
}

/**
 * Applies a reviewed manual HP adjustment without duplicating browser-side D&D
 * life-state rules. Damage remains on the typed damage resolver because it can
 * require defenses, concentration, death saves, and massive-damage handling.
 */
export function applyDnd5eSrdCombatVitals(actor: Actor, adjustment: Dnd5eSrdCombatVitalsAdjustment): Dnd5eSrdCombatVitalsResult {
  const requestedAmount = adjustmentAmount(adjustment.amount);
  if (adjustment.kind === "temporaryHitPoints") {
    const temporary = temporaryHitPoints(actor.data);
    const after = Math.max(temporary.current, requestedAmount);
    return {
      data: {
        ...actor.data,
        [temporary.key]: temporary.record ? { ...temporary.record, current: after } : after
      },
      kind: adjustment.kind,
      pool: temporary.key,
      requestedAmount,
      appliedAmount: after - temporary.current,
      before: temporary.current,
      after,
      max: after,
      recoveredFromZero: false
    };
  }

  const hp = record(actor.data.hp);
  const current = finiteNumber(hp.current);
  const max = finiteNumber(hp.max);
  if (current === undefined || max === undefined || current < 0 || max < 0 || current > max) {
    throw new Error("Combat-vitals healing requires finite current and maximum Hit Points with current between 0 and max");
  }
  const lifeState = String(actor.data.lifeState ?? "").trim().toLowerCase();
  const dead = lifeState === "dead" || lifeState === "defeated"
    || (Array.isArray(actor.data.conditions) && actor.data.conditions.some((condition) => conditionId(condition) === "dead"));
  if (dead && adjustment.revivesDead !== true) {
    throw new Error("Ordinary healing cannot revive a dead actor; use an explicitly authorized revival effect");
  }
  const after = Math.min(max, current + requestedAmount);
  const recoveredFromZero = current === 0 && after > 0;
  const revivedDead = dead && adjustment.revivesDead === true && after > 0;
  let data: JsonRecord = { ...actor.data, hp: { ...hp, current: after } };
  if (recoveredFromZero || revivedDead) {
    const transient = new Set(["unconscious", "stable", ...(revivedDead ? ["dead"] : [])]);
    const conditions = Array.isArray(data.conditions)
      ? data.conditions.filter((condition) => {
          const id = conditionId(condition);
          return !id || !transient.has(id);
        })
      : [];
    data = {
      ...data,
      conditions,
      deathSaves: { successes: 0, failures: 0 },
      lifeState: "conscious",
      defeated: false
    };
  }
  return {
    data,
    kind: adjustment.kind,
    pool: "hp",
    requestedAmount,
    appliedAmount: after - current,
    before: current,
    after,
    max,
    recoveredFromZero
  };
}
