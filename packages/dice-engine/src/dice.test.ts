import { describe, expect, it } from "vitest";
import { parseFormula, probabilityRange, rollFormula } from "./index.js";

describe("dice engine", () => {
  it("parses core notation", () => {
    expect(parseFormula("4d6kh3+2")).toEqual([
      { type: "die", count: 4, sides: 6, keep: "highest", keepCount: 3, explode: false },
      { type: "modifier", value: 2 }
    ]);
  });

  it("rolls bindings and dice deterministically", () => {
    const result = rollFormula("/roll 1d20 + @abilities.str.mod + 5", {
      rng: () => 0.65,
      bindings: { "abilities.str.mod": 3 }
    });
    expect(result.total).toBe(22);
  });

  it("reports a useful probability range", () => {
    expect(probabilityRange("2d20kh1+5")).toEqual({ min: 6, max: 25 });
  });

  it("rejects excessive dice counts", () => {
    expect(() => parseFormula("1001d6")).toThrow("Dice count must be between 1 and 1000: 1001");
  });
});
