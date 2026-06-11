import { describe, expect, it } from "vitest";
import { addDieToFormula, diceTraySides, rollHighlight, rollTermHighlight } from "./dice-insights.js";

describe("roll highlight", () => {
  it("flags a natural 20 on a d20 term", () => {
    expect(rollHighlight([{ type: "die", sides: 20, results: [20] }])).toBe("crit");
  });

  it("flags a natural 1 on a d20 term", () => {
    expect(rollHighlight([{ type: "die", sides: 20, results: [1] }])).toBe("fumble");
  });

  it("prefers crit over fumble across terms", () => {
    expect(
      rollHighlight([
        { type: "die", sides: 20, results: [1] },
        { type: "die", sides: 20, results: [20] }
      ])
    ).toBe("crit");
  });

  it("uses kept dice over raw results for advantage rolls", () => {
    expect(rollHighlight([{ type: "die", sides: 20, results: [1, 20], kept: [20] }])).toBe("crit");
    expect(rollHighlight([{ type: "die", sides: 20, results: [1, 20], kept: [1] }])).toBe("fumble");
  });

  it("ignores non-d20 dice and modifiers", () => {
    expect(rollHighlight([{ type: "die", sides: 6, results: [6] }])).toBe(null);
    expect(rollHighlight([{ type: "modifier", value: 20 }])).toBe(null);
  });
});

describe("roll term highlight", () => {
  it("flags max and min faces on single-die terms of any size", () => {
    expect(rollTermHighlight({ type: "die", sides: 6, results: [6] })).toBe("crit");
    expect(rollTermHighlight({ type: "die", sides: 6, results: [1] })).toBe("fumble");
    expect(rollTermHighlight({ type: "die", sides: 6, results: [4] })).toBe(null);
  });

  it("ignores multi-die terms and non-die terms", () => {
    expect(rollTermHighlight({ type: "die", sides: 6, results: [6, 6] })).toBe(null);
    expect(rollTermHighlight({ type: "modifier", value: 1 })).toBe(null);
  });
});

describe("dice tray formula building", () => {
  it("starts an empty formula with one die", () => {
    expect(addDieToFormula("", 20)).toBe("1d20");
    expect(addDieToFormula("   ", 8)).toBe("1d8");
  });

  it("increments an existing matching die term", () => {
    expect(addDieToFormula("1d20", 20)).toBe("2d20");
    expect(addDieToFormula("2d20+4", 20)).toBe("3d20+4");
    expect(addDieToFormula("1d8+1d20+4", 20)).toBe("1d8+2d20+4");
  });

  it("appends a new term when the die is not present", () => {
    expect(addDieToFormula("1d6", 20)).toBe("1d6+1d20");
    expect(addDieToFormula("1d20+5", 6)).toBe("1d20+5+1d6");
  });

  it("does not confuse d10 with d100", () => {
    expect(addDieToFormula("1d100", 10)).toBe("1d100+1d10");
    expect(addDieToFormula("1d10", 100)).toBe("1d10+1d100");
    expect(addDieToFormula("1d100", 100)).toBe("2d100");
  });

  it("handles case-insensitive dice notation", () => {
    expect(addDieToFormula("1D20", 20)).toBe("2D20");
  });

  it("exposes the classic polyhedral set", () => {
    expect([...diceTraySides]).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });
});
