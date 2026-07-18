import { dnd5eSrdClassSpellGrantData, dnd5eSrdSpellcastingClassProfile } from "./dnd-spell-grants.js";

interface ImportCompendiumEntry {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
}

export interface Dnd5eSrdImportedCharacterItem {
  entryId: string;
  data?: Record<string, unknown>;
}

export interface Dnd5eSrdCharacterImportCompatibility {
  importedItems: Dnd5eSrdImportedCharacterItem[];
  normalizedAbilityAliases: string[];
  spellcasting?: Record<string, unknown>;
  spellSlots: Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function importReferenceKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function importList(label: string, warnings: string[], ...values: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      warnings.push(`${label} ignored because it is not an array.`);
      continue;
    }
    result.push(...value);
  }
  return result;
}

function importSpells(values: unknown[], label: string, warnings: string[], compendium: ImportCompendiumEntry[]): ImportCompendiumEntry[] {
  const byReference = new Map<string, ImportCompendiumEntry>();
  for (const entry of compendium.filter((candidate) => candidate.type === "spell")) {
    byReference.set(importReferenceKey(entry.id), entry);
    byReference.set(importReferenceKey(entry.name), entry);
  }
  const result: ImportCompendiumEntry[] = [];
  for (const value of values) {
    const record = recordValue(value);
    const reference = typeof value === "string"
      ? stringValue(value)
      : stringValue(record.entryId) ?? stringValue(record.id) ?? stringValue(record.name);
    const entry = reference ? byReference.get(importReferenceKey(reference)) : undefined;
    if (!entry) {
      warnings.push(`Unknown spell skipped from ${label}: ${reference ?? "invalid reference"}`);
      continue;
    }
    if (!result.some((candidate) => candidate.id === entry.id)) result.push(entry);
  }
  return result;
}

function importSpellSlots(value: unknown, warnings: string[]): Record<string, unknown> {
  const source = recordValue(value);
  const normalized: Record<string, unknown> = {};
  const normalizedKeys: string[] = [];
  for (const [key, pool] of Object.entries(source)) {
    const match = /^(?:level)?([1-9])$/i.exec(key.trim());
    const canonicalKey = match ? `level${match[1]}` : key;
    if (canonicalKey !== key) normalizedKeys.push(`${key} to ${canonicalKey}`);
    if (canonicalKey !== key && Object.prototype.hasOwnProperty.call(source, canonicalKey)) continue;
    normalized[canonicalKey] = pool;
  }
  if (normalizedKeys.length > 0) warnings.push(`Normalized spell slot keys: ${normalizedKeys.join(", ")}.`);
  return normalized;
}

export function normalizeDnd5eSrdCharacterImportFields(input: {
  source: Record<string, unknown>;
  className: string;
  level: number;
  ruleset: string;
  compendium: ImportCompendiumEntry[];
  warnings: string[];
}): Dnd5eSrdCharacterImportCompatibility {
  const { source, className, level, ruleset, compendium, warnings } = input;
  const storedSpellcasting = recordValue(source.spellcasting);
  const spellbookEntries = importSpells(
    importList("Spellbook", warnings, source.spellbook, source.spellbookSpells, storedSpellcasting.spellbookSpells),
    "spellbook",
    warnings,
    compendium
  );
  const preparedEntries = importSpells(
    importList("Prepared spells", warnings, source.preparedSpells, storedSpellcasting.preparedSpells),
    "prepared spells",
    warnings,
    compendium
  );
  const cantripEntries = importSpells(
    importList("Cantrips", warnings, source.cantrips, storedSpellcasting.cantrips),
    "cantrips",
    warnings,
    compendium
  );
  const spellLevel = (entry: ImportCompendiumEntry) => Math.max(0, Math.floor(numericValue(entry.data.level, 0)));
  const cantripIds = uniqueStrings([
    ...cantripEntries.map((entry) => entry.id),
    ...spellbookEntries.filter((entry) => spellLevel(entry) === 0).map((entry) => entry.id),
    ...preparedEntries.filter((entry) => spellLevel(entry) === 0).map((entry) => entry.id)
  ]);
  const preparedSpellIds = uniqueStrings(preparedEntries.filter((entry) => spellLevel(entry) > 0).map((entry) => entry.id));
  const profile = dnd5eSrdSpellcastingClassProfile(className, level);
  const spellbookSpellIds = uniqueStrings([
    ...spellbookEntries.filter((entry) => spellLevel(entry) > 0).map((entry) => entry.id),
    ...(profile?.className === "Wizard" ? preparedSpellIds : [])
  ]);
  const importedIds = uniqueStrings([...cantripIds, ...spellbookSpellIds, ...preparedSpellIds]);
  const importedItems = importedIds.flatMap((entryId): Dnd5eSrdImportedCharacterItem[] => {
    const isCantrip = cantripIds.includes(entryId);
    const isPrepared = isCantrip || preparedSpellIds.includes(entryId);
    if (!profile) {
      return [{ entryId, data: { compendiumId: entryId, prepared: isPrepared, ...(isCantrip ? { cantrip: true, known: true, alwaysPrepared: true, preparationMode: "known" } : {}) } }];
    }
    if (isCantrip) {
      return [{
        entryId,
        data: {
          compendiumId: entryId,
          classSpell: true,
          spellcastingClass: profile.className,
          preparedForClass: profile.className,
          spellcastingAbility: profile.spellcastingAbility,
          acquisitionMode: profile.acquisitionMode,
          prepared: true,
          alwaysPrepared: true,
          cantrip: true,
          known: true,
          preparationMode: "known",
          spellSources: [{ kind: "class", className: profile.className, selection: "cantrip", selectedAtLevel: level, spellcastingAbility: profile.spellcastingAbility, acquisitionMode: profile.acquisitionMode }]
        }
      }];
    }
    const inSpellbook = profile.className === "Wizard";
    return [{
      entryId,
      data: {
        ...dnd5eSrdClassSpellGrantData({ compendiumEntryId: entryId, className: profile.className, selectedAtLevel: level, prepared: isPrepared, inSpellbook }),
        preparationMode: inSpellbook ? "spellbook" : "prepared"
      }
    }];
  });
  const spellcasting = profile ? {
    ...cloneJsonRecord(storedSpellcasting),
    source: stringValue(storedSpellcasting.source) ?? ruleset,
    className: profile.className,
    ability: profile.spellcastingAbility,
    cantrips: cantripIds,
    preparedSpells: preparedSpellIds,
    preparedSpellCapacity: Math.max(0, Math.floor(numericValue(storedSpellcasting.preparedSpellCapacity, profile.preparedSpellCapacity))),
    preparedSpellCapacityLevel: level,
    ...(profile.className === "Wizard" ? { spellbookSpells: spellbookSpellIds } : {}),
    slotPool: profile.className === "Warlock" ? "pact-magic" : "spellcasting",
    changeTiming: profile.acquisitionMode === "prepared-class-level" ? "class-level" : "long-rest"
  } : undefined;
  const sourceAttributes = recordValue(source.attributes);
  const normalizedAbilityAliases = Object.keys(recordValue(source.abilities))
    .filter((key) => sourceAttributes[key] === undefined)
    .sort();
  return {
    importedItems,
    normalizedAbilityAliases,
    ...(spellcasting ? { spellcasting } : {}),
    spellSlots: importSpellSlots(source.spellSlots, warnings)
  };
}
