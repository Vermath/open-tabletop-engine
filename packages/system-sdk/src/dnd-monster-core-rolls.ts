import type { Actor } from "@open-tabletop/core";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function exactNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[ _]+/g, "-");
}

function exactRecordValue(value: unknown, key: string): number | undefined {
  const normalized = normalizedKey(key);
  const match = Object.entries(recordValue(value)).find(([candidate]) => normalizedKey(candidate) === normalized);
  return exactNumber(match?.[1]);
}

/** Exact values printed in a bundled or custom monster's preserved stat block. */
export function dnd5eSrdMonsterCoreBonuses(actor: Pick<Actor, "data">): {
  initiative?: number;
  saves: Record<string, number>;
  skills: Record<string, number>;
} | undefined {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  if (Object.keys(statBlock).length === 0) return undefined;
  const numericRecord = (value: unknown) => Object.fromEntries(
    Object.entries(recordValue(value)).flatMap(([key, raw]) => {
      const number = exactNumber(raw);
      return number === undefined ? [] : [[normalizedKey(key), number]];
    })
  );
  return {
    ...(exactNumber(statBlock.initiative) !== undefined ? { initiative: exactNumber(statBlock.initiative) } : {}),
    saves: numericRecord(statBlock.saves),
    skills: numericRecord(statBlock.skills)
  };
}

export function dnd5eSrdExactMonsterInitiativeBonus(actor: Pick<Actor, "data">): number | undefined {
  return dnd5eSrdMonsterCoreBonuses(actor)?.initiative;
}

export function dnd5eSrdExactMonsterSaveBonus(actor: Pick<Actor, "data">, ability: string): number | undefined {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  return exactRecordValue(statBlock.saves, ability);
}

export function dnd5eSrdExactMonsterSkillBonus(actor: Pick<Actor, "data">, skillId: string): number | undefined {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  return exactRecordValue(statBlock.skills, skillId);
}
