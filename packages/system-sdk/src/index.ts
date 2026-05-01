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
  return {
    id: `ability-${ability}`,
    label,
    formula: `1d20${formattedModifier}`
  };
}

export function genericFantasyQuickRolls(actor: Actor): QuickRoll[] {
  const attributes = actor.data.attributes as Record<string, number> | undefined;
  return Object.keys(attributes ?? { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }).map((ability) =>
    genericFantasyAbilityCheck(actor, ability)
  );
}
