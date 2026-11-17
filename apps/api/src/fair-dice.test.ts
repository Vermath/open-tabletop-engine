import type { DiceRoll } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { rollFormulaWithFairness, verifyDiceRollRecord } from "./fair-dice.js";
import { applyHeroicInspirationReroll } from "./heroic-inspiration.js";

function rollRecord(formula = "2d20kh1+3", serverSeed = "server-seed", clientSeed: unknown = "client-seed"): DiceRoll {
  const fair = rollFormulaWithFairness(formula, { serverSeed, clientSeed });
  return {
    id: "roll_fair",
    campaignId: "camp_demo",
    userId: "usr_demo_gm",
    formula,
    visibility: "public",
    terms: fair.rolled.terms,
    total: fair.rolled.total,
    fairness: fair.fairness,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("shared replay-verifiable dice", () => {
  it("recomputes the exact total, Advantage terms, and kept die", () => {
    const roll = rollRecord();
    expect(roll.terms[0]).toMatchObject({ type: "die", count: 2, sides: 20, keep: "highest", keepCount: 1 });
    expect(verifyDiceRollRecord(roll)).toMatchObject({ verified: true, expected: { total: roll.total }, recomputed: { total: roll.total } });
  });

  it("fails verification for a changed commitment, result, or formula", () => {
    const roll = rollRecord();
    expect(verifyDiceRollRecord({ ...roll, fairness: { ...roll.fairness!, serverSeedHash: "tampered" } }).reason).toBe("seed_hash_mismatch");
    expect(verifyDiceRollRecord({ ...roll, total: roll.total + 1 }).reason).toBe("result_mismatch");
    expect(verifyDiceRollRecord({ ...roll, formula: "not dice" }).reason).toBe("formula_unparseable");
  });

  it("fails closed instead of throwing for malformed persisted metadata", () => {
    const roll = rollRecord();
    expect(verifyDiceRollRecord({ ...roll, fairness: { algorithm: "future" } as unknown as DiceRoll["fairness"] })).toMatchObject({ verified: false, reason: "unsupported_algorithm" });
    expect(verifyDiceRollRecord({ ...roll, fairness: { algorithm: "xmur3-mulberry32", serverSeed: 42, serverSeedHash: [] } as unknown as DiceRoll["fairness"] })).toMatchObject({ verified: false, reason: "seed_hash_mismatch" });
  });

  it("labels historical rolls without replay metadata as unavailable", () => {
    const { fairness: _fairness, ...legacy } = rollRecord();
    expect(verifyDiceRollRecord(legacy)).toMatchObject({ verified: false, reason: "fairness_unavailable" });
  });

  it("verifies a Heroic Inspiration selected-die replacement against its source roll", () => {
    const source: DiceRoll = {
      ...rollRecord(),
      id: "roll_original",
      actorId: "act_hero",
      terms: [
        { type: "die", count: 2, sides: 20, results: [4, 16], kept: [16], keep: "highest", keepCount: 1 },
        { type: "modifier", value: 3 },
      ],
      total: 19,
      heroicInspiration: { kind: "original", actorId: "act_hero", rerollRollId: "roll_reroll" },
    };
    const replacement = rollFormulaWithFairness("1d20", { serverSeed: "heroic-seed" });
    const replacementResult = replacement.rolled.terms[0]!.results![0]!;
    const transformed = applyHeroicInspirationReroll(source, { termIndex: 0, resultIndex: 1 }, replacementResult);
    const reroll: DiceRoll = {
      ...source,
      id: "roll_reroll",
      terms: transformed.terms,
      total: transformed.total,
      fairness: replacement.fairness,
      heroicInspiration: {
        kind: "reroll",
        actorId: "act_hero",
        originalRollId: source.id,
        selectedTermIndex: 0,
        selectedResultIndex: 1,
        originalResult: 16,
        replacementResult,
      },
    };
    expect(verifyDiceRollRecord(reroll, source)).toMatchObject({ verified: true, recomputed: { total: transformed.total } });
    expect(verifyDiceRollRecord(reroll)).toMatchObject({ verified: false, reason: "source_roll_unavailable" });
    expect(verifyDiceRollRecord({ ...reroll, total: reroll.total + 1 }, source)).toMatchObject({ verified: false, reason: "result_mismatch" });
  });

  it("isolates repeated rolls and bounds the optional client seed", () => {
    const first = rollFormulaWithFairness("20d20", { serverSeed: "one", clientSeed: `  ${"x".repeat(250)}  ` });
    const second = rollFormulaWithFairness("20d20", { serverSeed: "two", clientSeed: `  ${"x".repeat(250)}  ` });
    expect(first.fairness.serverSeedHash).not.toBe(second.fairness.serverSeedHash);
    expect(first.fairness.clientSeed).toHaveLength(200);
    expect(first.rolled).not.toEqual(second.rolled);
  });
});
