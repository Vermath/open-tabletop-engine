import { createHash, randomBytes } from "node:crypto";
import type { DiceRoll, DiceRollFairness } from "@open-tabletop/core";
import { composeFairnessSeed, rollFormula, seededRng } from "@open-tabletop/dice-engine";
import { applyHeroicInspirationReroll } from "./heroic-inspiration.js";

export type DiceRollVerificationReason = "fairness_unavailable" | "unsupported_algorithm" | "seed_hash_mismatch" | "formula_unparseable" | "source_roll_unavailable" | "reroll_link_mismatch" | "result_mismatch";

export interface DiceRollVerification {
  rollId: string;
  formula: string;
  verified: boolean;
  reason?: DiceRollVerificationReason;
  fairness?: DiceRollFairness;
  expected: { total: number };
  recomputed?: { total: number };
}

/**
 * Rolls once and records deterministic replay metadata. The compatibility name
 * does not imply a commit-before-roll protocol; the hash is stored with the
 * revealed seed and result.
 */
export function rollFormulaWithFairness(
  formula: string,
  options: { clientSeed?: unknown; serverSeed?: string } = {},
): { rolled: ReturnType<typeof rollFormula>; fairness: DiceRollFairness } {
  const serverSeed = options.serverSeed ?? randomBytes(32).toString("hex");
  if (!serverSeed) throw new Error("Fair dice server seed must not be empty");
  const clientSeed = normalizeClientSeed(options.clientSeed);
  const rolled = rollFormula(formula, { rng: seededRng(composeFairnessSeed(serverSeed, clientSeed)) });
  const fairness: DiceRollFairness = {
    algorithm: "xmur3-mulberry32",
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    ...(clientSeed ? { clientSeed } : {}),
  };
  return { rolled, fairness };
}

export function verifyDiceRollRecord(
  roll: Pick<DiceRoll, "id" | "formula" | "terms" | "total" | "fairness" | "actorId" | "heroicInspiration">,
  sourceRoll?: Pick<DiceRoll, "id" | "formula" | "terms" | "total" | "actorId" | "heroicInspiration">,
): DiceRollVerification {
  const base = { rollId: roll.id, formula: roll.formula, expected: { total: roll.total } };
  const rawFairness: unknown = roll.fairness;
  if (!rawFairness) return { ...base, verified: false, reason: "fairness_unavailable" };
  if (!isRecord(rawFairness) || rawFairness.algorithm !== "xmur3-mulberry32") {
    return { ...base, verified: false, reason: "unsupported_algorithm" };
  }
  if (
    typeof rawFairness.serverSeed !== "string" ||
    rawFairness.serverSeed.length === 0 ||
    rawFairness.serverSeed.length > 512 ||
    typeof rawFairness.serverSeedHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(rawFairness.serverSeedHash) ||
    (rawFairness.clientSeed !== undefined && (typeof rawFairness.clientSeed !== "string" || rawFairness.clientSeed.length === 0 || rawFairness.clientSeed.length > 200))
  ) {
    return { ...base, verified: false, reason: "seed_hash_mismatch" };
  }
  const fairness: DiceRollFairness = {
    algorithm: "xmur3-mulberry32",
    serverSeed: rawFairness.serverSeed,
    serverSeedHash: rawFairness.serverSeedHash,
    ...(typeof rawFairness.clientSeed === "string" ? { clientSeed: rawFairness.clientSeed } : {}),
  };
  if (hashServerSeed(fairness.serverSeed) !== fairness.serverSeedHash) return { ...base, verified: false, reason: "seed_hash_mismatch", fairness };
  let recomputed: ReturnType<typeof rollFormula>;
  try {
    const verificationFormula = roll.heroicInspiration?.kind === "reroll" ? "1d20" : roll.formula;
    recomputed = rollFormula(verificationFormula, { rng: seededRng(composeFairnessSeed(fairness.serverSeed, fairness.clientSeed)) });
  } catch {
    return { ...base, verified: false, reason: "formula_unparseable", fairness };
  }
  if (roll.heroicInspiration?.kind === "reroll") {
    const link = roll.heroicInspiration;
    if (!sourceRoll || sourceRoll.id !== link.originalRollId) return { ...base, verified: false, reason: "source_roll_unavailable", fairness, recomputed: { total: recomputed.total } };
    if (
      sourceRoll.formula !== roll.formula
      || sourceRoll.actorId !== link.actorId
      || roll.actorId !== link.actorId
      || sourceRoll.heroicInspiration?.kind !== "original"
      || sourceRoll.heroicInspiration.rerollRollId !== roll.id
    ) {
      return { ...base, verified: false, reason: "reroll_link_mismatch", fairness, recomputed: { total: recomputed.total } };
    }
    const replacementResult = recomputed.terms[0]?.results?.[0];
    if (replacementResult !== link.replacementResult) return { ...base, verified: false, reason: "result_mismatch", fairness, recomputed: { total: recomputed.total } };
    try {
      const transformed = applyHeroicInspirationReroll(
        sourceRoll,
        { termIndex: link.selectedTermIndex, resultIndex: link.selectedResultIndex },
        link.replacementResult,
      );
      const matches = transformed.originalResult === link.originalResult
        && transformed.total === roll.total
        && stableJson(transformed.terms) === stableJson(roll.terms);
      return { ...base, verified: matches, ...(matches ? {} : { reason: "result_mismatch" as const }), fairness, recomputed: { total: transformed.total } };
    } catch {
      return { ...base, verified: false, reason: "reroll_link_mismatch", fairness, recomputed: { total: recomputed.total } };
    }
  }
  const matches = recomputed.total === roll.total && stableJson(recomputed.terms) === stableJson(roll.terms);
  return { ...base, verified: matches, ...(matches ? {} : { reason: "result_mismatch" as const }), fairness, recomputed: { total: recomputed.total } };
}

function normalizeClientSeed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
