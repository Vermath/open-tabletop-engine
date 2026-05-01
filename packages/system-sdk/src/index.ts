import type { Actor, Item, PermissionName } from "@open-tabletop/core";

export interface JsonSchema {
  $schema?: string;
  title?: string;
  type: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

export interface SystemManifest {
  id: string;
  name: string;
  version: string;
  compatibleCore: string;
  entrypoints: {
    client?: string;
    server?: string;
  };
  schemas: {
    actor: string;
    item: string;
  };
  permissions: PermissionName[];
}

export interface ActorSheetRegistration {
  systemId: string;
  actorType: string;
  componentId: string;
}

export interface DiceFormulaRegistration {
  systemId: string;
  id: string;
  label: string;
  formula: string;
}

export interface QuickRoll {
  id: string;
  label: string;
  formula: string;
}

export type GenericFantasyCompendiumType = "item" | "spell" | "condition";

export interface GenericFantasyCompendiumEntry {
  id: string;
  type: GenericFantasyCompendiumType;
  name: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface AppliedCondition {
  id: string;
  name: string;
  summary: string;
  appliedAt?: string;
}

export interface GenericFantasySheet {
  actorId: string;
  summary: string;
  data: Record<string, unknown>;
  quickRolls: QuickRoll[];
  conditions: AppliedCondition[];
  inventory: Item[];
  spells: Item[];
}

export interface SystemRegistry {
  manifests: SystemManifest[];
  actorSheets: ActorSheetRegistration[];
  diceFormulas: DiceFormulaRegistration[];
}

export function createSystemRegistry(): SystemRegistry {
  return { manifests: [], actorSheets: [], diceFormulas: [] };
}

export function registerSystem(registry: SystemRegistry, manifest: SystemManifest): SystemRegistry {
  validateSystemManifest(manifest);
  return { ...registry, manifests: [...registry.manifests, manifest] };
}

export function registerActorSheet(registry: SystemRegistry, sheet: ActorSheetRegistration): SystemRegistry {
  return { ...registry, actorSheets: [...registry.actorSheets, sheet] };
}

export function registerDiceFormula(registry: SystemRegistry, formula: DiceFormulaRegistration): SystemRegistry {
  return { ...registry, diceFormulas: [...registry.diceFormulas, formula] };
}

export function validateSystemManifest(manifest: SystemManifest): void {
  if (!manifest.id || !manifest.name || !manifest.version) {
    throw new Error("System manifest requires id, name, and version");
  }
  if (!manifest.schemas.actor || !manifest.schemas.item) {
    throw new Error("System manifest requires actor and item schemas");
  }
}

export function summarizeActor(actor: Actor): string {
  const hp = actor.data.hp as { current?: number; max?: number } | undefined;
  return `${actor.name}${hp ? ` (${hp.current ?? "?"}/${hp.max ?? "?"} HP)` : ""}`;
}

export function summarizeItem(item: Item): string {
  return `${item.name} [${item.type}]`;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function genericFantasyAbilityCheck(actor: Actor, ability: string): QuickRoll {
  const attributes = actor.data.attributes as Record<string, number> | undefined;
  const score = attributes?.[ability] ?? 10;
  const modifier = abilityModifier(score);
  const formattedModifier = modifier >= 0 ? `+${modifier}` : String(modifier);
  const label = `${ability.charAt(0).toUpperCase()}${ability.slice(1)} Check`;
  const conditions = genericFantasyActorConditions(actor);
  const d20 = conditions.some((condition) => condition.id === "poisoned") ? "2d20kl1" : "1d20";
  const bonus = conditions.some((condition) => condition.id === "blessed") ? "+1d4" : "";
  return {
    id: `ability-${ability}`,
    label,
    formula: `${d20}${formattedModifier}${bonus}`
  };
}

export function genericFantasyQuickRolls(actor: Actor): QuickRoll[] {
  const attributes = actor.data.attributes as Record<string, number> | undefined;
  return Object.keys(attributes ?? { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }).map((ability) =>
    genericFantasyAbilityCheck(actor, ability)
  );
}

export function genericFantasyCompendium(): GenericFantasyCompendiumEntry[] {
  return [
    {
      id: "longsword",
      type: "item",
      name: "Longsword",
      summary: "Versatile martial melee weapon.",
      data: { category: "weapon", damage: "1d8", versatileDamage: "1d10", ability: "strength", equipped: true }
    },
    {
      id: "healing-word",
      type: "spell",
      name: "Healing Word",
      summary: "Restores a small amount of hit points at range.",
      data: { level: 1, school: "evocation", action: "bonus", range: "60 ft", healingFormula: "1d4+@attributes.charisma" }
    },
    {
      id: "blessed",
      type: "condition",
      name: "Blessed",
      summary: "Adds 1d4 to ability checks in the Generic Fantasy runtime.",
      data: { rollBonusFormula: "1d4" }
    },
    {
      id: "poisoned",
      type: "condition",
      name: "Poisoned",
      summary: "Rolls ability checks with disadvantage in the Generic Fantasy runtime.",
      data: { rollMode: "disadvantage" }
    },
    {
      id: "restrained",
      type: "condition",
      name: "Restrained",
      summary: "Marks the actor as unable to freely move.",
      data: { speedMultiplier: 0 }
    }
  ];
}

export function genericFantasyCompendiumEntry(entryId: string): GenericFantasyCompendiumEntry | undefined {
  return genericFantasyCompendium().find((entry) => entry.id === entryId);
}

export function genericFantasySheet(actor: Actor, items: Item[] = []): GenericFantasySheet {
  return {
    actorId: actor.id,
    summary: summarizeActor(actor),
    data: actor.data,
    quickRolls: genericFantasyQuickRolls(actor),
    conditions: genericFantasyActorConditions(actor),
    inventory: items.filter((item) => item.actorId === actor.id && item.type !== "spell"),
    spells: items.filter((item) => item.actorId === actor.id && item.type === "spell")
  };
}

export function genericFantasyActorConditions(actor: Actor): AppliedCondition[] {
  const rawConditions = normalizeConditionRecords(actor.data.conditions);
  return rawConditions.map((condition) => {
    const entry = genericFantasyCompendiumEntry(condition.id);
    return {
      id: condition.id,
      name: entry?.name ?? condition.id,
      summary: entry?.summary ?? "",
      appliedAt: condition.appliedAt
    };
  });
}

export function applyGenericFantasyCondition(actor: Actor, conditionId: string, appliedAt?: string): Record<string, unknown> {
  const entry = genericFantasyCompendiumEntry(conditionId);
  if (!entry || entry.type !== "condition") throw new Error(`Unknown condition: ${conditionId}`);
  const conditions = normalizeConditionRecords(actor.data.conditions);
  if (!conditions.some((condition) => condition.id === conditionId)) conditions.push({ id: conditionId, appliedAt });
  return { ...actor.data, conditions };
}

export function removeGenericFantasyCondition(actor: Actor, conditionId: string): Record<string, unknown> {
  const conditions = normalizeConditionRecords(actor.data.conditions).filter((condition) => condition.id !== conditionId);
  return { ...actor.data, conditions };
}

function normalizeConditionRecords(value: unknown): Array<{ id: string; appliedAt?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { id: item };
      if (item && typeof item === "object" && "id" in item && typeof item.id === "string") {
        return { id: item.id, appliedAt: "appliedAt" in item && typeof item.appliedAt === "string" ? item.appliedAt : undefined };
      }
      return undefined;
    })
    .filter((item): item is { id: string; appliedAt?: string } => Boolean(item));
}
