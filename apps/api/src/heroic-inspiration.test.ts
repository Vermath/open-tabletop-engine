import type { DiceRoll } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyHeroicInspirationReroll, heroicInspirationDieChoices } from "./heroic-inspiration.js";

function roll(terms: DiceRoll["terms"], total: number): Pick<DiceRoll, "terms" | "total"> {
  return { terms, total };
}

describe("Heroic Inspiration selected-die rerolls", () => {
  it("replaces a normal d20 while retaining its modifier", () => {
    const original = roll([{ type: "die", count: 1, sides: 20, results: [4], kept: [4] }, { type: "modifier", value: 5 }], 9);
    expect(heroicInspirationDieChoices(original)).toEqual([{ termIndex: 0, resultIndex: 0, value: 4, kept: true }]);
    const rerolled = applyHeroicInspirationReroll(original, { termIndex: 0, resultIndex: 0 }, 17);
    expect(rerolled).toMatchObject({ total: 22, originalResult: 4, replacementResult: 17 });
    expect(rerolled.terms[0]).toMatchObject({ results: [17], kept: [17] });
  });

  it("replaces only the selected Advantage die and recomputes the kept result", () => {
    const original = roll([{ type: "die", count: 2, sides: 20, results: [7, 15], kept: [15], keep: "highest", keepCount: 1 }, { type: "modifier", value: 2 }], 17);
    expect(heroicInspirationDieChoices(original)).toEqual([
      { termIndex: 0, resultIndex: 0, value: 7, kept: false },
      { termIndex: 0, resultIndex: 1, value: 15, kept: true },
    ]);
    const rerolled = applyHeroicInspirationReroll(original, { termIndex: 0, resultIndex: 1 }, 5);
    expect(rerolled.total).toBe(9);
    expect(rerolled.terms[0]).toMatchObject({ results: [7, 5], kept: [7] });
  });

  it("replaces only the selected Disadvantage die and recomputes the kept result", () => {
    const original = roll([{ type: "die", count: 2, sides: 20, results: [3, 18], kept: [3], keep: "lowest", keepCount: 1 }, { type: "modifier", value: 4 }], 7);
    const rerolled = applyHeroicInspirationReroll(original, { termIndex: 0, resultIndex: 0 }, 20);
    expect(rerolled.total).toBe(22);
    expect(rerolled.terms[0]).toMatchObject({ results: [20, 18], kept: [18] });
  });

  it("rejects ambiguous or unsupported selections", () => {
    expect(heroicInspirationDieChoices(roll([{ type: "die", count: 3, sides: 20, results: [1, 2, 3], kept: [3] }], 3))).toEqual([]);
    expect(() => applyHeroicInspirationReroll(roll([{ type: "die", count: 1, sides: 6, results: [4], kept: [4] }], 4), { termIndex: 0, resultIndex: 0 }, 10)).toThrow("eligible d20");
  });
});
