export interface ParsedDie {
  type: "die";
  count: number;
  sides: number;
  keep?: "highest" | "lowest";
  keepCount?: number;
  explode: boolean;
}

export interface ParsedModifier {
  type: "modifier";
  value: number;
}

export interface ParsedBinding {
  type: "binding";
  path: string;
}

export type ParsedTerm = ParsedDie | ParsedModifier | ParsedBinding;

export interface RollTerm {
  type: "die" | "modifier" | "binding";
  count?: number;
  sides?: number;
  results?: number[];
  kept?: number[];
  exploded?: number[];
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

const diePattern = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?(!)?$/i;
const bindingPattern = /^@([a-zA-Z0-9_.-]+)$/;

export function parseFormula(formula: string): ParsedTerm[] {
  const normalized = formula.replace(/^\/(?:roll|r|gmroll)\s+/i, "").replace(/\s+/g, "");
  if (!normalized) throw new Error("Dice formula is empty");
  const tokens = normalized.match(/[+-]?[^+-]+/g) ?? [];
  return tokens.map(parseToken);
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
      const value = options.bindings?.[term.path] ?? 0;
      terms.push({ type: "binding", path: term.path, value });
      total += value;
    } else {
      const results: number[] = [];
      const exploded: number[] = [];
      for (let i = 0; i < term.count; i += 1) {
        let value = rollDie(term.sides, rng);
        results.push(value);
        while (term.explode && value === term.sides) {
          value = rollDie(term.sides, rng);
          exploded.push(value);
          results.push(value);
          if (exploded.length > 100) throw new Error("Explosion limit exceeded");
        }
      }
      const kept = keepResults(results, term);
      terms.push({ type: "die", count: term.count, sides: term.sides, results, kept, exploded });
      total += kept.reduce((sum, item) => sum + item, 0);
    }
  }

  return { formula, terms, total };
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
      const keptCount = term.keepCount ?? term.count;
      return { min: range.min + keptCount, max: range.max + keptCount * term.sides };
    },
    { min: 0, max: 0 }
  );
}

function parseToken(rawToken: string): ParsedTerm {
  const sign = rawToken.startsWith("-") ? -1 : 1;
  const token = rawToken.replace(/^[+-]/, "");
  const dieMatch = token.match(diePattern);
  if (dieMatch) {
    const count = Number(dieMatch[1] || "1");
    if (sign < 0) throw new Error("Negative dice groups are not supported");
    return {
      type: "die",
      count,
      sides: Number(dieMatch[2]),
      keep: dieMatch[3] === "kh" ? "highest" : dieMatch[3] === "kl" ? "lowest" : undefined,
      keepCount: dieMatch[4] ? Number(dieMatch[4]) : undefined,
      explode: Boolean(dieMatch[5])
    };
  }
  const bindingMatch = token.match(bindingPattern);
  if (bindingMatch?.[1]) return { type: "binding", path: bindingMatch[1] };
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return { type: "modifier", value: sign * numeric };
  throw new Error(`Unsupported dice token: ${rawToken}`);
}

function rollDie(sides: number, rng: () => number): number {
  if (!Number.isInteger(sides) || sides < 2) throw new Error(`Invalid die sides: ${sides}`);
  return Math.floor(rng() * sides) + 1;
}

function keepResults(results: number[], term: ParsedDie): number[] {
  if (!term.keep || !term.keepCount) return results;
  const sorted = [...results].sort((a, b) => (term.keep === "highest" ? b - a : a - b));
  return sorted.slice(0, term.keepCount);
}
