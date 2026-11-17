export interface PaletteCommand {
  id: string;
  label: string;
  section: string;
  hint?: string;
  keywords?: string;
}

export function campaignRecordPaletteCommands(input: {
  actors: ReadonlyArray<{ id: string; name: string }>;
  journals: ReadonlyArray<{ id: string; title: string; tags: string[] }>;
  includeJournals: boolean;
}): PaletteCommand[] {
  return [
    ...input.actors.map((actor) => ({ id: `actor:${actor.id}`, label: `Select actor: ${actor.name}`, section: "Actors", keywords: "character npc token sheet select focus" })),
    ...(input.includeJournals ? input.journals.map((journal) => ({ id: `journal:${journal.id}`, label: `Open journal: ${journal.title}`, section: "Journal", hint: journal.tags[0], keywords: "note entry log lore" })) : [])
  ];
}

/** Accepts "2d6+3", "/roll 2d6", "/r d20" style queries and returns the bare formula. */
export function paletteDiceFormula(query: string): string | null {
  const trimmed = query.trim().replace(/^\/(?:roll|r)\s+/i, "");
  if (!trimmed) return null;
  const formulaPattern = /^\d{0,3}d\d{1,4}(?:\s*[+-]\s*(?:\d{0,3}d\d{1,4}|\d{1,5}))*$/i;
  return formulaPattern.test(trimmed) ? trimmed : null;
}

/**
 * Subsequence fuzzy match. Returns null when the query does not match,
 * otherwise a score that rewards adjacency and word starts and slightly
 * penalizes long targets so tight labels rank first.
 */
export function fuzzyScore(query: string, target: string): number | null {
  let score = 0;
  let searchFrom = 0;
  let previousMatch = -2;
  for (const char of query) {
    if (char === " ") continue;
    const found = target.indexOf(char, searchFrom);
    if (found === -1) return null;
    score += 1;
    if (found === previousMatch + 1) score += 3;
    if (found === 0 || target[found - 1] === " " || target[found - 1] === "-" || target[found - 1] === ":") score += 2;
    previousMatch = found;
    searchFrom = found + 1;
  }
  return score - target.length / 100;
}

export function filterPaletteCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...commands];
  return commands
    .map((command) => ({
      command,
      score: fuzzyScore(trimmed, `${command.label} ${command.keywords ?? ""} ${command.section}`.toLowerCase())
    }))
    .filter((entry): entry is { command: PaletteCommand; score: number } => entry.score !== null)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.command);
}

export function movePaletteIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}
