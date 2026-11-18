import { randomInt } from "node:crypto";
import type { RollableTable, RollableTableEntry, RollableTableInput } from "@open-tabletop/core";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validTableEntries(entries: unknown): entries is RollableTableEntry[] {
  return Array.isArray(entries) && entries.length >= 1 && entries.length <= 100 && entries.every((entry: unknown) =>
    record(entry) && typeof entry.text === "string" && entry.text.trim().length > 0 && entry.text.length <= 500
    && typeof entry.weight === "number" && Number.isInteger(entry.weight) && entry.weight >= 1 && entry.weight <= 10000);
}

export function validatedTable(input: unknown): RollableTableInput | undefined {
  if (!record(input) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 100) return;
  if (input.category !== "loot" && input.category !== "encounter" && input.category !== "rumor") return;
  if (input.visibility !== "public" && input.visibility !== "gm_only") return;
  if (!validTableEntries(input.entries)) return;
  return {
    name: input.name.trim(), category: input.category, visibility: input.visibility,
    entries: input.entries.map(({ text, weight }) => ({ text: text.trim(), weight })),
  };
}

export function visibleRollableTables(tables: RollableTable[], campaignId: string, canManage: boolean) {
  return tables.filter((table) => table.campaignId === campaignId && (canManage || table.visibility === "public"));
}

/** Each integer ticket belongs to exactly one entry's half-open interval. */
export function drawTableEntry(entries: RollableTableEntry[], randomBelow: (max: number) => number = randomInt): RollableTableEntry {
  let ticket = randomBelow(entries.reduce((sum, entry) => sum + entry.weight, 0));
  for (const entry of entries) {
    if (ticket < entry.weight) return entry;
    ticket -= entry.weight;
  }
  throw new RangeError("Weighted ticket outside table");
}
