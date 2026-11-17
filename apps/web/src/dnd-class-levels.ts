import type { Actor } from "@open-tabletop/core";

import { numericValue, recordValue, stringValue } from "./sheet-format.js";

/**
 * Presentation fallback for legacy/local actor records. Consequential rules
 * remain server-authoritative in the system SDK.
 */
export function dnd5eSrdActorClassLevels(actor: Pick<Actor, "data">): Array<{ className: string; level: number }> {
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

export function dnd5eSrdClassLevel(actor: Pick<Actor, "data">, className: string): number {
  return dnd5eSrdActorClassLevels(actor)
    .find((entry) => entry.className.toLocaleLowerCase() === className.trim().toLocaleLowerCase())
    ?.level ?? 0;
}

export function dnd5eSrdCharacterLevel(actor: Pick<Actor, "data">): number {
  const levels = dnd5eSrdActorClassLevels(actor);
  return levels.length > 0
    ? Math.max(1, levels.reduce((sum, entry) => sum + entry.level, 0))
    : Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
}
