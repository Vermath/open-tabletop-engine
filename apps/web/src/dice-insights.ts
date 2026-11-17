export interface RollTermLike {
  type: "die" | "modifier" | "binding";
  sign?: -1;
  sides?: number;
  count?: number;
  results?: number[];
  kept?: number[];
  exploded?: number[];
  value?: number;
}

export type RollHighlight = "crit" | "fumble" | null;

export const diceTraySides = [4, 6, 8, 10, 12, 20, 100] as const;

export const diceQuickPresets = [
  { id: "advantage", label: "Adv", formula: "adv", title: "Roll a d20 with advantage" },
  { id: "disadvantage", label: "Dis", formula: "dis", title: "Roll a d20 with disadvantage" },
  { id: "ability-score", label: "4d6↓", formula: "4d6dl1", title: "Roll 4d6 and drop the lowest" },
  { id: "percentile", label: "d%", formula: "d%", title: "Roll percentile dice" }
] as const;

export function adjustDiceModifier(formula: string, delta: -1 | 1): string {
  const trimmed = formula.trim();
  if (!trimmed) return delta > 0 ? "1d20+1" : "1d20-1";
  const match = trimmed.match(/([+-])(\d+)$/);
  if (!match || match.index === undefined) return `${trimmed}${delta > 0 ? "+1" : "-1"}`;
  const value = (match[1] === "-" ? -1 : 1) * Number(match[2]);
  const next = value + delta;
  const prefix = trimmed.slice(0, match.index);
  if (next === 0) return prefix;
  return `${prefix}${next > 0 ? "+" : "-"}${Math.abs(next)}`;
}

function keptValues(term: RollTermLike): number[] {
  return term.kept && term.kept.length > 0 ? term.kept : (term.results ?? []);
}

/** Natural-20-style table drama: only d20 terms qualify, kept dice take priority, crits beat fumbles. */
export function rollHighlight(terms: readonly RollTermLike[]): RollHighlight {
  let sawFumble = false;
  for (const term of terms) {
    if (term.type !== "die" || term.sign === -1 || term.sides !== 20) continue;
    const values = keptValues(term);
    if (values.includes(20)) return "crit";
    if (values.includes(1)) sawFumble = true;
  }
  return sawFumble ? "fumble" : null;
}

/** Per-term flourish for single-die terms of any size: max face is a crit, 1 is a fumble. */
export function rollTermHighlight(term: RollTermLike): RollHighlight {
  if (term.type !== "die" || term.sign === -1 || typeof term.sides !== "number" || term.sides < 2) return null;
  const values = keptValues(term);
  const face = values.length === 1 ? values[0] : undefined;
  if (face === undefined) return null;
  if (face >= term.sides) return "crit";
  if (face === 1) return "fumble";
  return null;
}

/** Click d20 on "2d20+4" => "3d20+4"; on "" => "1d20"; on "1d6" => "1d6+1d20". d10 never bumps d100. */
export function addDieToFormula(formula: string, sides: number): string {
  const trimmed = formula.trim();
  if (!trimmed) return `1d${sides}`;
  const pattern = new RegExp(`(^|[+\\s(])(\\d*)[dD]${sides}(?!\\d)`);
  const match = pattern.exec(trimmed);
  if (match) {
    const prefix = match[1] ?? "";
    const digits = match[2] ?? "";
    const count = digits === "" ? 1 : Number(digits);
    const start = match.index + prefix.length;
    const end = start + digits.length;
    return `${trimmed.slice(0, start)}${count + 1}${trimmed.slice(end)}`;
  }
  return `${trimmed}+1d${sides}`;
}
