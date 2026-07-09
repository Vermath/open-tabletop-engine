export interface ParsedDie {
  type: "die";
  count: number;
  sides: number;
  sign?: -1;
  keep?: "highest" | "lowest";
  keepCount?: number;
  drop?: "highest" | "lowest";
  dropCount?: number;
  reroll?: number;
  explode: boolean;
}

export interface ParsedModifier {
  type: "modifier";
  value: number;
}

export interface ParsedBinding {
  type: "binding";
  path: string;
  sign?: -1;
}

export type ParsedTerm = ParsedDie | ParsedModifier | ParsedBinding;

export interface RollTerm {
  type: "die" | "modifier" | "binding";
  sign?: -1;
  count?: number;
  sides?: number;
  results?: number[];
  kept?: number[];
  exploded?: number[];
  keep?: "highest" | "lowest";
  keepCount?: number;
  drop?: "highest" | "lowest";
  dropCount?: number;
  reroll?: number;
  rerolled?: number[];
  value?: number;
  path?: string;
}

export interface RollResult {
  formula: string;
  terms: RollTerm[];
  total: number;
}

export interface RollOptions {
  rng?: () => number;
  bindings?: Record<string, number>;
}

const diePattern = /^(\d*)d(\d+|%)(?:(kh|kl|dh|dl)(\d*))?(?:r(\d+))?(!)?$/i;
const bindingPattern = /^@([a-zA-Z0-9_.-]+)$/;
const MAX_FORMULA_LENGTH = 4096;
const MAX_TERMS = 100;
const MAX_TOTAL_DICE = 10_000;
const MAX_DICE_PER_TERM = 1000;
const MAX_EXPLOSIONS_PER_DIE = 100;
const MAX_REROLLS_PER_DIE = 100;

export function parseFormula(formula: string): ParsedTerm[] {
  if (formula.length > MAX_FORMULA_LENGTH) throw new Error(`Dice formula cannot exceed ${MAX_FORMULA_LENGTH} characters`);
  const normalized = formula.replace(/^\/(?:roll|r|gmroll)\s+/i, "").replace(/\s+/g, "");
  if (!normalized) throw new Error("Dice formula is empty");
  const tokens = tokenizeFormula(normalized);
  if (tokens.length > MAX_TERMS) throw new Error(`Dice formula cannot exceed ${MAX_TERMS} terms`);
  const terms = tokens.map(parseToken);
  const totalDice = terms.reduce((total, term) => total + (term.type === "die" ? term.count : 0), 0);
  if (totalDice > MAX_TOTAL_DICE) throw new Error(`Dice formula cannot exceed ${MAX_TOTAL_DICE} dice`);
  return terms;
}

export function rollFormula(formula: string, options: RollOptions = {}): RollResult {
  const rng = options.rng ?? Math.random;
  const parsed = parseFormula(formula);
  const terms: RollTerm[] = [];
  let total = 0;

  for (const term of parsed) {
    if (term.type === "modifier") {
      terms.push({ type: "modifier", value: term.value });
      total += term.value;
    } else if (term.type === "binding") {
      const sign = term.sign === -1 ? -1 : 1;
      const value = (options.bindings?.[term.path] ?? 0) * sign;
      terms.push(compactRollTerm({ type: "binding", path: term.path, value, sign: sign === -1 ? -1 : undefined }));
      total += value;
    } else {
      const results: number[] = [];
      const exploded: number[] = [];
      const rerolled: number[] = [];
      for (let i = 0; i < term.count; i += 1) {
        let value = rollDieWithRerolls(term, rng, rerolled);
        let explosionsForDie = 0;
        results.push(value);
        while (term.explode && value === term.sides) {
          if (explosionsForDie >= MAX_EXPLOSIONS_PER_DIE) throw new Error("Explosion limit exceeded");
          value = rollDieWithRerolls(term, rng, rerolled);
          explosionsForDie += 1;
          exploded.push(value);
          results.push(value);
        }
      }
      const kept = keepResults(results, term);
      const sign = term.sign === -1 ? -1 : 1;
      terms.push(compactRollTerm({ type: "die", sign: term.sign, count: term.count, sides: term.sides, results, kept, exploded, keep: term.keep, keepCount: term.keepCount, drop: term.drop, dropCount: term.dropCount, reroll: term.reroll, rerolled }));
      total += sign * kept.reduce((sum, item) => sum + item, 0);
    }
  }

  return { formula, terms, total };
}

/**
 * Composes the final RNG seed for a provably-fair roll. The client-contributed
 * seed is prepended so a host cannot target an outcome without also controlling
 * the client seed.
 */
export function composeFairnessSeed(serverSeed: string, clientSeed?: string): string {
  return clientSeed ? `${clientSeed}:${serverSeed}` : serverSeed;
}

/**
 * Deterministic, dependency-free PRNG (xmur3 seed hash + mulberry32 stream) so a
 * roll can be reproduced from its seed in any JS runtime, including the browser.
 */
export function seededRng(seed: string): () => number {
  const nextSeed = xmur3(seed);
  return mulberry32(nextSeed());
}

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatRoll(result: RollResult): string {
  return `${result.formula} = ${result.total}`;
}

export function probabilityRange(formula: string): { min: number; max: number } {
  const terms = parseFormula(formula);
  return terms.reduce(
    (range, term) => {
      if (term.type === "modifier") return { min: range.min + term.value, max: range.max + term.value };
      if (term.type === "binding") return range;
      if (term.explode) throw new Error("Probability range is unbounded for exploding dice");
      const keptCount = effectiveKeptCount(term);
      const faceMin = term.reroll === 1 ? 2 : 1;
      const faceMax = term.reroll === term.sides ? term.sides - 1 : term.sides;
      if (term.sign === -1) return { min: range.min - keptCount * faceMax, max: range.max - keptCount * faceMin };
      return { min: range.min + keptCount * faceMin, max: range.max + keptCount * faceMax };
    },
    { min: 0, max: 0 }
  );
}

function parseToken(rawToken: string): ParsedTerm {
  const sign = rawToken.startsWith("-") ? -1 : 1;
  const token = rawToken.replace(/^[+-]/, "");
  const shorthand = token.toLowerCase();
  if (shorthand === "adv" || shorthand === "dis") {
    return compactParsedDie({
      type: "die",
      count: 2,
      sides: 20,
      sign: sign === -1 ? -1 : undefined,
      keep: shorthand === "adv" ? "highest" : "lowest",
      keepCount: 1,
      explode: false
    });
  }
  const dieMatch = token.match(diePattern);
  if (dieMatch) {
    const count = Number(dieMatch[1] || "1");
    if (!Number.isInteger(count) || count < 1 || count > MAX_DICE_PER_TERM) throw new Error(`Dice count must be between 1 and ${MAX_DICE_PER_TERM}: ${count}`);
    const sides = dieMatch[2] === "%" ? 100 : Number(dieMatch[2]);
    if (!Number.isInteger(sides) || sides < 2) throw new Error(`Die sides must be at least 2: ${sides}`);
    const keepOrDrop = dieMatch[3]?.toLowerCase();
    const keep = keepOrDrop === "kh" ? "highest" : keepOrDrop === "kl" ? "lowest" : undefined;
    const drop = keepOrDrop === "dh" ? "highest" : keepOrDrop === "dl" ? "lowest" : undefined;
    const keepCount = keep ? Number(dieMatch[4] || "1") : undefined;
    const dropCount = drop ? Number(dieMatch[4] || "1") : undefined;
    const reroll = dieMatch[5] ? Number(dieMatch[5]) : undefined;
    if (keepCount !== undefined && (!Number.isInteger(keepCount) || keepCount < 0)) throw new Error(`Keep count must be zero or greater: ${keepCount}`);
    if (dropCount !== undefined && (!Number.isInteger(dropCount) || dropCount < 0)) throw new Error(`Drop count must be zero or greater: ${dropCount}`);
    if (reroll !== undefined && (!Number.isInteger(reroll) || reroll < 1 || reroll > sides)) throw new Error(`Reroll face must be between 1 and ${sides}: ${reroll}`);
    return compactParsedDie({
      type: "die",
      sign: sign === -1 ? -1 : undefined,
      count,
      sides,
      keep,
      keepCount,
      drop,
      dropCount,
      reroll,
      explode: Boolean(dieMatch[6])
    });
  }
  const bindingMatch = token.match(bindingPattern);
  if (bindingMatch?.[1]) return sign === -1 ? { type: "binding", path: bindingMatch[1], sign: -1 } : { type: "binding", path: bindingMatch[1] };
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return { type: "modifier", value: sign * numeric };
  throw new Error(`Unsupported dice token: ${rawToken}`);
}

function tokenizeFormula(normalized: string): string[] {
  const tokens: string[] = [];
  let tokenStart = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if ((char === "+" || char === "-") && index > tokenStart) {
      if (char === "-" && tokenStartsWithBinding(normalized, tokenStart)) continue;
      tokens.push(normalized.slice(tokenStart, index));
      tokenStart = index;
    }
  }

  tokens.push(normalized.slice(tokenStart));
  return tokens.filter(Boolean);
}

function tokenStartsWithBinding(formula: string, tokenStart: number): boolean {
  const first = formula[tokenStart];
  const bodyStart = first === "+" || first === "-" ? tokenStart + 1 : tokenStart;
  return formula[bodyStart] === "@";
}

function rollDie(sides: number, rng: () => number): number {
  if (!Number.isInteger(sides) || sides < 2) throw new Error(`Invalid die sides: ${sides}`);
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new Error("Dice RNG must return a finite number from 0 (inclusive) to 1 (exclusive)");
  }
  return Math.floor(random * sides) + 1;
}

function rollDieWithRerolls(term: ParsedDie, rng: () => number, rerolled: number[]): number {
  let value = rollDie(term.sides, rng);
  let rerollsForDie = 0;
  while (term.reroll !== undefined && value === term.reroll) {
    if (rerollsForDie >= MAX_REROLLS_PER_DIE) throw new Error("Reroll limit exceeded");
    rerolled.push(value);
    value = rollDie(term.sides, rng);
    rerollsForDie += 1;
  }
  return value;
}

function keepResults(results: number[], term: ParsedDie): number[] {
  if (term.drop && term.dropCount !== undefined) {
    const keptCount = Math.max(0, results.length - term.dropCount);
    const sorted = [...results].sort((a, b) => (term.drop === "lowest" ? b - a : a - b));
    return sorted.slice(0, keptCount);
  }
  if (!term.keep || term.keepCount === undefined) return results;
  const sorted = [...results].sort((a, b) => (term.keep === "highest" ? b - a : a - b));
  return sorted.slice(0, term.keepCount);
}

function effectiveKeptCount(term: ParsedDie): number {
  if (term.dropCount !== undefined) return Math.max(0, term.count - term.dropCount);
  return Math.min(term.count, term.keepCount ?? term.count);
}

function compactParsedDie(term: ParsedDie): ParsedDie {
  return Object.fromEntries(Object.entries(term).filter(([, value]) => value !== undefined)) as ParsedDie;
}

function compactRollTerm(term: RollTerm): RollTerm {
  return Object.fromEntries(
    Object.entries(term).filter(([key, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value) && value.length === 0 && key !== "kept") return false;
      return true;
    })
  ) as RollTerm;
}
