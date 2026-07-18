import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyDnd5eSrdCombatVitals } from "./dnd-combat-vitals.js";

const actor = (data: Record<string, unknown>): Actor => ({
  id: "actor-vitals",
  campaignId: "campaign-vitals",
  systemId: "dnd-5e-srd",
  type: "character",
  name: "Vitals Test",
  data,
  permissions: {},
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z"
});

describe("manual D&D combat-vitals adjustments", () => {
  it("heals to the maximum and reports only the amount actually applied", () => {
    const result = applyDnd5eSrdCombatVitals(actor({ hp: { current: 7, max: 10 }, conditions: [] }), { kind: "healing", amount: 8 });
    expect(result).toMatchObject({ pool: "hp", requestedAmount: 8, appliedAmount: 3, before: 7, after: 10, max: 10, recoveredFromZero: false });
    expect(result.data.hp).toEqual({ current: 10, max: 10 });
  });

  it("clears zero-HP transient state and death saves only when healing restores HP", () => {
    const fallen = actor({
      hp: { current: 0, max: 12 },
      conditions: ["unconscious", { id: "stable", appliedAt: "earlier" }, { id: "poisoned" }],
      deathSaves: { successes: 2, failures: 1 },
      lifeState: "stable",
      defeated: true
    });
    const recovered = applyDnd5eSrdCombatVitals(fallen, { kind: "healing", amount: 4 });
    expect(recovered.recoveredFromZero).toBe(true);
    expect(recovered.data).toMatchObject({ hp: { current: 4, max: 12 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious", defeated: false });
    expect(recovered.data.conditions).toEqual([{ id: "poisoned" }]);

    const zero = applyDnd5eSrdCombatVitals(fallen, { kind: "healing", amount: 0 });
    expect(zero.recoveredFromZero).toBe(false);
    expect(zero.data).toMatchObject({ deathSaves: { successes: 2, failures: 1 }, lifeState: "stable", defeated: true });
  });

  it("uses the larger temporary-HP value without stacking and preserves record shape", () => {
    const stronger = applyDnd5eSrdCombatVitals(actor({ hp: { current: 5, max: 10 }, temporaryHp: { current: 6, source: "armor" } }), { kind: "temporaryHitPoints", amount: 4 });
    expect(stronger).toMatchObject({ pool: "temporaryHp", appliedAmount: 0, before: 6, after: 6, max: 6 });
    expect(stronger.data.temporaryHp).toEqual({ current: 6, source: "armor" });

    const replacement = applyDnd5eSrdCombatVitals(actor({ hp: { current: 5, max: 10 }, tempHp: 2 }), { kind: "temporaryHitPoints", amount: 7 });
    expect(replacement).toMatchObject({ pool: "tempHp", appliedAmount: 5, before: 2, after: 7, max: 7 });
    expect(replacement.data.tempHp).toBe(7);
  });

  it("does not let ordinary healing revive a dead actor", () => {
    const dead = actor({
      hp: { current: 0, max: 12 },
      conditions: [{ id: "dead" }, { id: "poisoned" }],
      deathSaves: { successes: 0, failures: 3 },
      lifeState: "dead",
      defeated: true
    });
    expect(() => applyDnd5eSrdCombatVitals(dead, { kind: "healing", amount: 4 })).toThrow(/cannot revive a dead actor/);
    expect(dead.data).toMatchObject({ hp: { current: 0 }, lifeState: "dead", defeated: true });
  });

  it("treats a monster's defeated life state as dead for healing", () => {
    const defeated = { ...actor({ hp: { current: 0, max: 12 }, conditions: [{ id: "dead" }], lifeState: "defeated", defeated: true }), type: "monster" };
    expect(() => applyDnd5eSrdCombatVitals(defeated, { kind: "healing", amount: 4 })).toThrow(/cannot revive a dead actor/);
  });

  it("revives a dead actor only when the healing effect explicitly allows it", () => {
    const revived = applyDnd5eSrdCombatVitals(actor({
      hp: { current: 0, max: 12 },
      conditions: [{ id: "dead" }, { id: "poisoned" }],
      deathSaves: { successes: 0, failures: 3 },
      lifeState: "dead",
      defeated: true
    }), { kind: "healing", amount: 1, revivesDead: true });
    expect(revived.data).toMatchObject({ hp: { current: 1, max: 12 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious", defeated: false });
    expect(revived.data.conditions).toEqual([{ id: "poisoned" }]);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])("rejects invalid amount %s", (amount) => {
    expect(() => applyDnd5eSrdCombatVitals(actor({ hp: { current: 5, max: 10 } }), { kind: "healing", amount })).toThrow(/finite nonnegative integer/);
  });

  it("rejects malformed HP pools for healing", () => {
    expect(() => applyDnd5eSrdCombatVitals(actor({ hp: { current: 11, max: 10 } }), { kind: "healing", amount: 1 })).toThrow(/finite current and maximum/);
  });
});
