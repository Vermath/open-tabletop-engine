import type { Actor } from "@open-tabletop/core";

export interface Dnd5eSrdClassLevel {
  className: string;
  level: number;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numericValue(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Parsed per-class levels. Legacy single-class actors remain compatible. */
export function dnd5eSrdActorClassLevels(actor: Pick<Actor, "data">): Dnd5eSrdClassLevel[] {
  if (Array.isArray(actor.data.classes)) {
    const parsed = actor.data.classes.flatMap((entry) => {
      const record = recordValue(entry);
      const className = stringValue(record.className) ?? stringValue(record.class);
      const level = Math.floor(numericValue(record.level, 0));
      return className && level > 0 ? [{ className, level }] : [];
    });
    if (parsed.length > 0) return parsed;
  }
  const className = stringValue(actor.data.class);
  return className ? [{ className, level: Math.max(1, Math.floor(numericValue(actor.data.level, 1))) }] : [];
}

/** Level in one granting class; returns zero when the actor lacks that class. */
export function dnd5eSrdClassLevel(actor: Pick<Actor, "data">, className: string): number {
  return dnd5eSrdActorClassLevels(actor)
    .find((entry) => entry.className.toLocaleLowerCase() === className.trim().toLocaleLowerCase())
    ?.level ?? 0;
}

/** Total character level for rules that explicitly scale across all classes. */
export function dnd5eSrdCharacterLevel(actor: Pick<Actor, "data">): number {
  const levels = dnd5eSrdActorClassLevels(actor);
  if (levels.length > 0) return Math.max(1, levels.reduce((sum, entry) => sum + entry.level, 0));
  return Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
}
