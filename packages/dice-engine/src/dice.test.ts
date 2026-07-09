import { describe, expect, it } from "vitest";
import { composeFairnessSeed, parseFormula, probabilityRange, rollFormula, seededRng } from "./index.js";

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("RNG sequence exhausted");
    index += 1;
    return value;
  };
}

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

  it("parses hyphenated binding paths", () => {
    expect(parseFormula("@str-mod")).toEqual([{ type: "binding", path: "str-mod" }]);
  });

  it("keeps numeric subtraction working", () => {
    expect(rollFormula("7-2").total).toBe(5);
  });

  it("subtracts negative dice groups", () => {
    const result = rollFormula("2d6-1d4", { rng: sequenceRng([0.5, 0.5, 0.5]) });

    expect(result.total).toBe(5);
    expect(result.terms[1]).toMatchObject({
      type: "die",
      count: 1,
      sides: 4,
      sign: -1,
      results: [3],
      kept: [3]
    });
  });

  it("supports percentile dice notation", () => {
    const result = rollFormula("d%", { rng: sequenceRng([0]) });

    expect(result.total).toBe(1);
    expect(result.terms[0]).toMatchObject({ type: "die", count: 1, sides: 100, results: [1], kept: [1] });
  });

  it("drops the lowest dice with dl notation", () => {
    const result = rollFormula("4d6dl1", { rng: sequenceRng([0, 0.25, 0.5, 0.75]) });

    expect(result.total).toBe(11);
    expect(result.terms[0]).toMatchObject({
      type: "die",
      count: 4,
      sides: 6,
      results: [1, 2, 4, 5],
      kept: [5, 4, 2],
      drop: "lowest",
      dropCount: 1
    });
  });

  it("rerolls matching die faces", () => {
    const result = rollFormula("1d6r1", { rng: sequenceRng([0, 0.5]) });

    expect(result.total).toBe(4);
    expect(result.terms[0]).toMatchObject({
      type: "die",
      count: 1,
      sides: 6,
      results: [4],
      kept: [4],
      reroll: 1,
      rerolled: [1]
    });
  });

  it("accepts advantage and disadvantage shorthand", () => {
    const advantage = rollFormula("adv+2", { rng: sequenceRng([0.05, 0.95]) });
    const disadvantage = rollFormula("dis+2", { rng: sequenceRng([0.05, 0.95]) });

    expect(advantage.total).toBe(22);
    expect(advantage.terms[0]).toMatchObject({ type: "die", count: 2, sides: 20, keep: "highest", keepCount: 1, kept: [20] });
    expect(disadvantage.total).toBe(4);
    expect(disadvantage.terms[0]).toMatchObject({ type: "die", count: 2, sides: 20, keep: "lowest", keepCount: 1, kept: [2] });
  });

  it("rolls hyphenated bindings next to addition", () => {
    const bindings = { "str-mod": 4 };

    expect(rollFormula("@str-mod+1", { bindings }).total).toBe(5);
    expect(rollFormula("1+@str-mod", { bindings }).total).toBe(5);
  });

  it("allows large exploding dice terms when each die has a short chain", () => {
    let shouldExplode = true;
    const result = rollFormula("300d2!", {
      rng: () => {
        const roll = shouldExplode ? 0.75 : 0.25;
        shouldExplode = !shouldExplode;
        return roll;
      }
    });

    expect(result.total).toBe(900);
    expect(result.terms[0]?.exploded).toHaveLength(300);
  });

  it("bounds a pathological single exploding die chain", () => {
    expect(() => rollFormula("1d2!", { rng: () => 0.75 })).toThrow("Explosion limit exceeded");
  });

  it("reports a useful probability range", () => {
    expect(probabilityRange("2d20kh1+5")).toEqual({ min: 6, max: 25 });
  });

  it("reports probability ranges for subtraction, drop-lowest, and percentile notation", () => {
    expect(probabilityRange("2d6-1d4")).toEqual({ min: -2, max: 11 });
    expect(probabilityRange("4d6dl1")).toEqual({ min: 3, max: 18 });
    expect(probabilityRange("d%")).toEqual({ min: 1, max: 100 });
  });

  it("accounts for rerolled faces and rejects unbounded exploding ranges", () => {
    expect(probabilityRange("1d6r1")).toEqual({ min: 2, max: 6 });
    expect(probabilityRange("1d6r6")).toEqual({ min: 1, max: 5 });
    expect(probabilityRange("2d6r1-1d4r4")).toEqual({ min: 1, max: 11 });
    expect(() => probabilityRange("1d6!")).toThrow("Probability range is unbounded for exploding dice");
  });

  it("defaults keep-high without a count to one die", () => {
    const result = rollFormula("2d20kh", { rng: sequenceRng([0.05, 0.95]) });

    expect(result.terms[0]).toMatchObject({
      type: "die",
      count: 2,
      sides: 20,
      results: [2, 20],
      kept: [20]
    });
    expect(result.total).toBe(20);
  });

  it("defaults 4d6kh to keep the single highest die", () => {
    const result = rollFormula("4d6kh", { rng: sequenceRng([0, 0.49, 0.99, 0.16]) });

    expect(result.terms[0]).toMatchObject({
      type: "die",
      count: 4,
      sides: 6,
      results: [1, 3, 6, 1],
      kept: [6]
    });
    expect(result.total).toBe(6);
  });

  it("defaults 4d6kl to keep the single lowest die", () => {
    const result = rollFormula("4d6kl", { rng: sequenceRng([0.99, 0.49, 0.16, 0]) });

    expect(result.terms[0]).toMatchObject({
      type: "die",
      count: 4,
      sides: 6,
      results: [6, 3, 1, 1],
      kept: [1]
    });
    expect(result.total).toBe(1);
  });

  it("keeps zero dice when kh0 or kl0 is requested", () => {
    const high = rollFormula("4d6kh0", { rng: sequenceRng([0, 0.49, 0.99, 0.16]) });
    const low = rollFormula("4d6kl0", { rng: sequenceRng([0.99, 0.49, 0.16, 0]) });

    expect(high.terms[0]).toMatchObject({ results: [1, 3, 6, 1], kept: [] });
    expect(high.total).toBe(0);
    expect(low.terms[0]).toMatchObject({ results: [6, 3, 1, 1], kept: [] });
    expect(low.total).toBe(0);
  });

  it("rejects excessive dice counts", () => {
    expect(() => parseFormula("1001d6")).toThrow("Dice count must be between 1 and 1000: 1001");
  });

  it("rejects invalid die shapes and RNG values instead of producing impossible faces", () => {
    expect(() => parseFormula("1d1")).toThrow("Die sides must be at least 2");
    expect(() => probabilityRange("1d0")).toThrow("Die sides must be at least 2");
    expect(() => rollFormula("1d6", { rng: () => 1 })).toThrow("Dice RNG must return");
    expect(() => rollFormula("1d6", { rng: () => -0.1 })).toThrow("Dice RNG must return");
    expect(() => rollFormula("1d6", { rng: () => Number.NaN })).toThrow("Dice RNG must return");
  });

  it("bounds total formula work across many individually valid terms", () => {
    expect(() => parseFormula(Array.from({ length: 101 }, () => "1d6").join("+"))).toThrow("cannot exceed 100 terms");
    expect(() => parseFormula(Array.from({ length: 11 }, () => "1000d6").join("+"))).toThrow("cannot exceed 10000 dice");
    expect(() => parseFormula(`${"1d6+".repeat(1024)}1d6`)).toThrow("cannot exceed 4096 characters");
  });

  it("produces a deterministic, reproducible stream from a seed", () => {
    const first = Array.from({ length: 5 }, seededRng("seed-alpha"));
    const again = Array.from({ length: 5 }, seededRng("seed-alpha"));
    const other = Array.from({ length: 5 }, seededRng("seed-beta"));

    expect(first).toEqual(again);
    expect(first).not.toEqual(other);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("replays an identical roll from the same composed fairness seed", () => {
    const seed = composeFairnessSeed("server-xyz", "client-abc");
    const original = rollFormula("4d6kh3+2", { rng: seededRng(seed) });
    const replay = rollFormula("4d6kh3+2", { rng: seededRng(composeFairnessSeed("server-xyz", "client-abc")) });

    expect(replay).toEqual(original);
  });

  it("changes the outcome when the client seed changes", () => {
    const withClient = rollFormula("20d20", { rng: seededRng(composeFairnessSeed("server-xyz", "client-abc")) });
    const withoutClient = rollFormula("20d20", { rng: seededRng(composeFairnessSeed("server-xyz")) });

    expect(withClient.total).not.toBe(withoutClient.total);
  });
});
