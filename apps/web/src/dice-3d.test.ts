import { describe, expect, it } from "vitest";
import { diceBoxNotation, diceCastMaxDice, diceCastPlan, dice3dStorageKey, dieShapeName, dieShapePoints, initialDice3dEnabled, newDiceCastRolls, physicsDiceMaxDice, type DiceCastRollLike } from "./dice-3d.js";

const fixedRandom = () => 0.5;

function roll(overrides: Partial<DiceCastRollLike>): DiceCastRollLike {
  return {
    id: "roll_1",
    formula: "1d20+5",
    total: 25,
    createdAt: "2026-06-11T12:00:00.000Z",
    terms: [{ type: "die", sides: 20, results: [20] }],
    ...overrides
  };
}

describe("dice cast plan", () => {
  it("expands die terms into one animated die per result", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 6, results: [2, 5, 6] }, { type: "modifier", value: 3 }] }), fixedRandom);
    expect(plan.dice).toHaveLength(3);
    expect(plan.dice.map((die) => die.value)).toEqual([2, 5, 6]);
    expect(plan.dice.every((die) => die.sides === 6 && die.kept)).toBe(true);
  });

  it("marks dropped advantage dice and keeps exactly one of duplicate values", () => {
    const advantage = diceCastPlan(roll({ terms: [{ type: "die", sides: 20, results: [5, 18], kept: [18] }] }), fixedRandom);
    expect(advantage.dice.map((die) => die.kept)).toEqual([false, true]);
    const duplicates = diceCastPlan(roll({ terms: [{ type: "die", sides: 20, results: [3, 3], kept: [3] }] }), fixedRandom);
    expect(duplicates.dice.filter((die) => die.kept)).toHaveLength(1);
  });

  it("caps the spectacle at the configured number of dice", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 6, results: Array.from({ length: 30 }, () => 4) }] }), fixedRandom);
    expect(plan.dice).toHaveLength(diceCastMaxDice);
  });

  it("yields no dice for modifier-only rolls", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "modifier", value: 7 }] }), fixedRandom);
    expect(plan.dice).toHaveLength(0);
  });

  it("staggers delays and grows settle time with the last die", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 8, results: [1, 2, 3] }] }), fixedRandom);
    expect(plan.dice.map((die) => die.delayMs)).toEqual([0, 60, 120]);
    const solo = diceCastPlan(roll({ terms: [{ type: "die", sides: 8, results: [4] }] }), fixedRandom);
    expect(plan.settleMs).toBe(solo.settleMs + 120);
    expect(plan.ttlMs).toBeGreaterThan(plan.settleMs);
  });

  it("keeps choreography within sane bounds and is deterministic with a seeded random", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 12, results: [9, 11] }] }), fixedRandom);
    for (const die of plan.dice) {
      expect(Number.isInteger(die.spinXTurns)).toBe(true);
      expect(die.spinXTurns).toBeGreaterThanOrEqual(1);
      expect(die.spinXTurns).toBeLessThanOrEqual(2);
      expect(die.fromXVmin).toBeLessThanOrEqual(-30);
      expect(die.fromXVmin).toBeGreaterThanOrEqual(-55);
      expect(Math.abs(die.restTiltDeg)).toBeLessThanOrEqual(7);
    }
    expect(diceCastPlan(roll({}), fixedRandom)).toEqual(diceCastPlan(roll({}), fixedRandom));
  });

  it("falls back to the formula when the label is blank and surfaces crit highlights", () => {
    const plan = diceCastPlan(roll({ label: "  " }), fixedRandom);
    expect(plan.label).toBe("1d20+5");
    expect(plan.highlight).toBe("crit");
  });
});

describe("die shapes", () => {
  it("maps sides to the classic silhouettes", () => {
    expect(dieShapeName(4)).toBe("d4");
    expect(dieShapeName(6)).toBe("d6");
    expect(dieShapeName(8)).toBe("d8");
    expect(dieShapeName(10)).toBe("d10");
    expect(dieShapeName(12)).toBe("d12");
    expect(dieShapeName(20)).toBe("d20");
    expect(dieShapeName(100)).toBe("d10");
    expect(dieShapeName(30)).toBe("d20");
  });

  it("provides polygon points for everything except the rounded d6", () => {
    expect(dieShapePoints("d6")).toBe(null);
    for (const shape of ["d4", "d8", "d10", "d12", "d20"] as const) {
      expect(dieShapePoints(shape)).toMatch(/^[\d.,\s]+$/);
    }
  });
});

describe("new roll detection", () => {
  const now = Date.parse("2026-06-11T12:00:10.000Z");

  it("animates only unseen, recent rolls", () => {
    const rolls = [
      { id: "old", createdAt: "2026-06-11T11:58:00.000Z" },
      { id: "seen", createdAt: "2026-06-11T12:00:09.000Z" },
      { id: "fresh", createdAt: "2026-06-11T12:00:08.000Z" }
    ];
    expect(newDiceCastRolls(rolls, new Set(["seen"]), now).map((item) => item.id)).toEqual(["fresh"]);
  });

  it("ignores rolls with unparseable timestamps", () => {
    expect(newDiceCastRolls([{ id: "bad", createdAt: "not-a-date" }], new Set(), now)).toEqual([]);
  });
});

describe("3d dice preference", () => {
  it("defaults on, honors the stored off switch, and survives storage errors", () => {
    expect(initialDice3dEnabled(() => null)).toBe(true);
    expect(initialDice3dEnabled((key) => (key === dice3dStorageKey ? "off" : null))).toBe(false);
    expect(initialDice3dEnabled((key) => (key === dice3dStorageKey ? "on" : null))).toBe(true);
    expect(
      initialDice3dEnabled(() => {
        throw new Error("denied");
      })
    ).toBe(true);
  });

  it("defaults to text-only rolling on constrained clients unless explicitly enabled", () => {
    expect(initialDice3dEnabled(() => null, { prefersReducedMotion: true })).toBe(false);
    expect(initialDice3dEnabled(() => null, { saveData: true })).toBe(false);
    expect(initialDice3dEnabled(() => null, { hardwareConcurrency: 2 })).toBe(false);
    expect(initialDice3dEnabled(() => null, { hardwareConcurrency: 8 })).toBe(true);
    expect(initialDice3dEnabled((key) => (key === dice3dStorageKey ? "on" : null), { prefersReducedMotion: true, saveData: true, hardwareConcurrency: 2 })).toBe(true);
  });
});

describe("dice-box notation", () => {
  it("forces single-group values in order", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 20, results: [18] }] }), fixedRandom);
    expect(diceBoxNotation(plan)).toBe("1d20@18");
  });

  it("groups mixed dice and lists forced values group by group", () => {
    const plan = diceCastPlan(roll({ terms: [{ type: "die", sides: 6, results: [2, 5] }, { type: "modifier", value: 3 }, { type: "die", sides: 20, results: [18] }] }), fixedRandom);
    expect(diceBoxNotation(plan)).toBe("2d6+1d20@2,5,18");
  });

  it("supports d100 and refuses unsupported dice so the caller can fall back", () => {
    const percentile = diceCastPlan(roll({ terms: [{ type: "die", sides: 100, results: [77] }] }), fixedRandom);
    expect(diceBoxNotation(percentile)).toBe("1d100@77");
    const weird = diceCastPlan(roll({ terms: [{ type: "die", sides: 7, results: [3] }] }), fixedRandom);
    expect(diceBoxNotation(weird)).toBe(null);
    expect(diceBoxNotation({ dice: [] })).toBe(null);
  });

  it("skips physics dice above the lightweight budget so CSS or text can handle the roll", () => {
    const withinBudget = diceCastPlan(roll({ terms: [{ type: "die", sides: 6, results: Array.from({ length: physicsDiceMaxDice }, () => 4) }] }), fixedRandom);
    const overBudget = diceCastPlan(roll({ terms: [{ type: "die", sides: 6, results: Array.from({ length: physicsDiceMaxDice + 1 }, () => 4) }] }), fixedRandom);
    expect(diceBoxNotation(withinBudget)).toBe(`${physicsDiceMaxDice}d6@${Array.from({ length: physicsDiceMaxDice }, () => 4).join(",")}`);
    expect(diceBoxNotation(overBudget)).toBe(null);
  });
});
