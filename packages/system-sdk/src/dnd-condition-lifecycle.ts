import type { Actor } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export interface NormalizedConditionRecord {
  id: string;
  appliedAt?: string;
  level?: number;
}

export function normalizeConditionRecords(value: unknown): NormalizedConditionRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: item };
      if (item && typeof item === "object" && "id" in item && typeof item.id === "string") {
        const record = item as JsonRecord;
        const level = typeof record.level === "number" && Number.isFinite(record.level) ? record.level : Number.NaN;
        return {
          id: item.id,
          appliedAt: typeof record.appliedAt === "string" ? record.appliedAt : undefined,
          ...(Number.isFinite(level) ? { level: Math.max(1, Math.floor(level)) } : {})
        };
      }
      return undefined;
    })
    .filter((item): item is NormalizedConditionRecord => Boolean(item));
}

export function dnd5eSrdActorIsDead(actor: Pick<Actor, "data">): boolean {
  const lifeState = typeof actor.data.lifeState === "string" ? actor.data.lifeState.trim().toLowerCase() : "";
  return lifeState === "dead" || lifeState === "defeated" || normalizeConditionRecords(actor.data.conditions).some((condition) => condition.id === "dead");
}

export function dnd5eSrdExhaustionDeathData(
  data: JsonRecord,
  conditions: NormalizedConditionRecord[],
  appliedAt?: string
): JsonRecord {
  const terminalConditions = conditions.filter((condition) => !["unconscious", "stable", "dead"].includes(condition.id));
  terminalConditions.push({ id: "dead", appliedAt });
  return {
    ...data,
    conditions: terminalConditions,
    deathSaves: { successes: 0, failures: 3 },
    lifeState: "dead",
    defeated: true
  };
}
