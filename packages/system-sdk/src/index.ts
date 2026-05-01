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

export interface CharacterTemplateItem {
  entryId: string;
  quantity?: number;
}

export interface CharacterTemplate {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  actorType: string;
  data: Record<string, unknown>;
  items: CharacterTemplateItem[];
}

export interface AdvancementOption {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  nextValue: number;
}

export interface EncounterThreat {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  role: string;
  budget: number;
}

export interface EncounterThreatSelection {
  id: string;
  count?: number;
}

export interface EncounterPlanThreat {
  id: string;
  name: string;
  role: string;
  count: number;
  budgetEach: number;
  budgetTotal: number;
}

export interface EncounterPlan {
  systemId: string;
  partyRating: number;
  threatBudget: number;
  difficulty: "trivial" | "easy" | "standard" | "hard" | "deadly";
  summary: string;
  threats: EncounterPlanThreat[];
}

export type GenericFantasyCompendiumType = "item" | "spell" | "condition";
export type StellarFrontiersCompendiumType = "gear" | "talent" | "condition";
export type RulesCompendiumType = GenericFantasyCompendiumType | StellarFrontiersCompendiumType;

export interface RulesCompendiumEntry {
  id: string;
  type: RulesCompendiumType;
  name: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface GenericFantasyCompendiumEntry extends RulesCompendiumEntry {
  type: GenericFantasyCompendiumType;
}

export interface StellarFrontiersCompendiumEntry extends RulesCompendiumEntry {
  type: StellarFrontiersCompendiumType;
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

export interface StellarFrontiersSheet extends GenericFantasySheet {
  strain?: { current?: number; max?: number };
  talents: Item[];
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

export function genericFantasyCharacterTemplates(): CharacterTemplate[] {
  return [
    {
      id: "guardian",
      systemId: "generic-fantasy",
      name: "Guardian",
      summary: "Front-line defender with strong melee fundamentals.",
      actorType: "character",
      data: {
        level: 1,
        class: "Guardian",
        hp: { current: 12, max: 12 },
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 12 },
        conditions: [],
        features: ["Shield Wall"]
      },
      items: [{ entryId: "longsword" }]
    },
    {
      id: "mender",
      systemId: "generic-fantasy",
      name: "Mender",
      summary: "Support caster with healing magic and social utility.",
      actorType: "character",
      data: {
        level: 1,
        class: "Mender",
        hp: { current: 9, max: 9 },
        attributes: { strength: 8, dexterity: 12, constitution: 12, intelligence: 13, wisdom: 15, charisma: 14 },
        conditions: [],
        features: ["Field Prayer"]
      },
      items: [{ entryId: "healing-word" }]
    }
  ];
}

export function genericFantasyCharacterTemplate(templateId: string): CharacterTemplate | undefined {
  return genericFantasyCharacterTemplates().find((template) => template.id === templateId);
}

export function genericFantasyEncounterThreats(): EncounterThreat[] {
  return [
    {
      id: "goblin-cutpurse",
      systemId: "generic-fantasy",
      name: "Goblin Cutpurse",
      summary: "Skirmisher that pressures fragile characters.",
      role: "skirmisher",
      budget: 50
    },
    {
      id: "skeletal-guard",
      systemId: "generic-fantasy",
      name: "Skeletal Guard",
      summary: "Durable front-line blocker for crypt or vault scenes.",
      role: "brute",
      budget: 75
    },
    {
      id: "ogre-brute",
      systemId: "generic-fantasy",
      name: "Ogre Brute",
      summary: "Heavy striker that makes a small party spend resources.",
      role: "elite",
      budget: 200
    }
  ];
}

export function genericFantasyEncounterPlan(party: Actor[], selections: EncounterThreatSelection[]): EncounterPlan {
  return buildEncounterPlan({
    systemId: "generic-fantasy",
    partyRating: party.reduce((total, actor) => total + numericValue(actor.data.level, 1) * 100, 0) || 100,
    threats: genericFantasyEncounterThreats(),
    selections
  });
}

export function genericFantasyAdvancementOptions(actor: Actor): AdvancementOption[] {
  const level = numericValue(actor.data.level, 1);
  if (level >= 20) return [];
  return [
    {
      id: "level-up",
      systemId: "generic-fantasy",
      name: `Level ${level + 1}`,
      summary: "Increase level, hit point maximum, proficiency, and the character's primary ability.",
      nextValue: level + 1
    }
  ];
}

export function applyGenericFantasyAdvancement(actor: Actor, optionId: string): Record<string, unknown> {
  const option = genericFantasyAdvancementOptions(actor).find((item) => item.id === optionId);
  if (!option) throw new Error(`Unknown advancement: ${optionId}`);
  const hp = actor.data.hp as { current?: number; max?: number } | undefined;
  const attributes = { ...((actor.data.attributes as Record<string, number> | undefined) ?? {}) };
  const className = typeof actor.data.class === "string" ? actor.data.class : "";
  const primaryAbility = className === "Mender" ? "wisdom" : "strength";
  attributes[primaryAbility] = numericValue(attributes[primaryAbility], 10) + 1;
  const features = normalizeStringArray(actor.data.features);
  const featureName = `${className || "Character"} Level ${option.nextValue}`;
  if (!features.includes(featureName)) features.push(featureName);
  return {
    ...actor.data,
    level: option.nextValue,
    hp: {
      current: numericValue(hp?.current, numericValue(hp?.max, 10)) + 5,
      max: numericValue(hp?.max, 10) + 5
    },
    attributes,
    proficiencyBonus: Math.max(2, 2 + Math.floor((option.nextValue - 1) / 4)),
    features
  };
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

export function stellarFrontiersAptitudeCheck(actor: Actor, aptitude: string): QuickRoll {
  const aptitudes = actor.data.aptitudes as Record<string, number> | undefined;
  const modifier = aptitudes?.[aptitude] ?? 0;
  const formattedModifier = modifier >= 0 ? `+${modifier}` : String(modifier);
  const label = `${aptitude.charAt(0).toUpperCase()}${aptitude.slice(1)} Check`;
  const conditions = stellarFrontiersActorConditions(actor);
  const d20 = conditions.some((condition) => condition.id === "jammed") ? "2d20kl1" : "1d20";
  const bonus = conditions.some((condition) => condition.id === "locked-in") ? "+1d6" : "";
  return {
    id: `aptitude-${aptitude}`,
    label,
    formula: `${d20}${formattedModifier}${bonus}`
  };
}

export function stellarFrontiersQuickRolls(actor: Actor): QuickRoll[] {
  const aptitudes = actor.data.aptitudes as Record<string, number> | undefined;
  return Object.keys(aptitudes ?? { combat: 2, tech: 2, pilot: 1, science: 1, charm: 0 }).map((aptitude) => stellarFrontiersAptitudeCheck(actor, aptitude));
}

export function stellarFrontiersCompendium(): StellarFrontiersCompendiumEntry[] {
  return [
    {
      id: "laser-carbine",
      type: "gear",
      name: "Laser Carbine",
      summary: "Reliable medium-range energy weapon.",
      data: { category: "weapon", damage: "1d8", aptitude: "combat", tags: ["energy", "rifle"] }
    },
    {
      id: "med-patch",
      type: "gear",
      name: "Med Patch",
      summary: "Single-use field treatment that restores minor harm.",
      data: { category: "consumable", healingFormula: "1d6+2" }
    },
    {
      id: "overclock",
      type: "talent",
      name: "Overclock",
      summary: "Spend strain to add speed to a tech action.",
      data: { strainCost: 1, bonusFormula: "1d6", aptitude: "tech" }
    },
    {
      id: "locked-in",
      type: "condition",
      name: "Locked In",
      summary: "Adds 1d6 to Stellar Frontiers aptitude checks.",
      data: { rollBonusFormula: "1d6" }
    },
    {
      id: "jammed",
      type: "condition",
      name: "Jammed",
      summary: "Rolls Stellar Frontiers aptitude checks with disadvantage.",
      data: { rollMode: "disadvantage" }
    },
    {
      id: "vacuum-exposed",
      type: "condition",
      name: "Vacuum Exposed",
      summary: "Marks a character exposed to hard vacuum or suit breach.",
      data: { hazard: "vacuum" }
    }
  ];
}

export function stellarFrontiersCompendiumEntry(entryId: string): StellarFrontiersCompendiumEntry | undefined {
  return stellarFrontiersCompendium().find((entry) => entry.id === entryId);
}

export function stellarFrontiersCharacterTemplates(): CharacterTemplate[] {
  return [
    {
      id: "freighter-pilot",
      systemId: "stellar-frontiers",
      name: "Freighter Pilot",
      summary: "Fast ship handler with practical tech instincts.",
      actorType: "character",
      data: {
        rank: 1,
        background: "Freighter Pilot",
        aptitudes: { combat: 1, tech: 2, pilot: 3, science: 1, charm: 1 },
        strain: { current: 2, max: 5 },
        conditions: [],
        milestones: ["Dockside Veteran"]
      },
      items: [{ entryId: "laser-carbine" }]
    },
    {
      id: "ship-tech",
      systemId: "stellar-frontiers",
      name: "Ship Tech",
      summary: "Engineer with overclocked repairs and field hardware.",
      actorType: "character",
      data: {
        rank: 1,
        background: "Ship Tech",
        aptitudes: { combat: 1, tech: 3, pilot: 1, science: 2, charm: 0 },
        strain: { current: 3, max: 6 },
        conditions: [],
        milestones: ["Patch Cable Genius"]
      },
      items: [{ entryId: "med-patch" }, { entryId: "overclock" }]
    }
  ];
}

export function stellarFrontiersCharacterTemplate(templateId: string): CharacterTemplate | undefined {
  return stellarFrontiersCharacterTemplates().find((template) => template.id === templateId);
}

export function stellarFrontiersEncounterThreats(): EncounterThreat[] {
  return [
    {
      id: "boarding-drone",
      systemId: "stellar-frontiers",
      name: "Boarding Drone",
      summary: "Automated pressure unit with short-range suppression.",
      role: "skirmisher",
      budget: 45
    },
    {
      id: "void-raider",
      systemId: "stellar-frontiers",
      name: "Void Raider",
      summary: "Armed raider suited for corridors and cargo holds.",
      role: "soldier",
      budget: 70
    },
    {
      id: "corsair-ace",
      systemId: "stellar-frontiers",
      name: "Corsair Ace",
      summary: "Elite rival pilot or boarding captain.",
      role: "elite",
      budget: 180
    }
  ];
}

export function stellarFrontiersEncounterPlan(party: Actor[], selections: EncounterThreatSelection[]): EncounterPlan {
  return buildEncounterPlan({
    systemId: "stellar-frontiers",
    partyRating: party.reduce((total, actor) => total + numericValue(actor.data.rank, 1) * 90, 0) || 90,
    threats: stellarFrontiersEncounterThreats(),
    selections
  });
}

export function stellarFrontiersAdvancementOptions(actor: Actor): AdvancementOption[] {
  const rank = numericValue(actor.data.rank, 1);
  if (rank >= 10) return [];
  return [
    {
      id: "rank-up",
      systemId: "stellar-frontiers",
      name: `Rank ${rank + 1}`,
      summary: "Increase rank, strain capacity, and a core aptitude.",
      nextValue: rank + 1
    }
  ];
}

export function applyStellarFrontiersAdvancement(actor: Actor, optionId: string): Record<string, unknown> {
  const option = stellarFrontiersAdvancementOptions(actor).find((item) => item.id === optionId);
  if (!option) throw new Error(`Unknown advancement: ${optionId}`);
  const aptitudes = { ...((actor.data.aptitudes as Record<string, number> | undefined) ?? {}) };
  const background = typeof actor.data.background === "string" ? actor.data.background : "";
  const primaryAptitude = background === "Freighter Pilot" ? "pilot" : "tech";
  aptitudes[primaryAptitude] = numericValue(aptitudes[primaryAptitude], 0) + 1;
  const strain = actor.data.strain as { current?: number; max?: number } | undefined;
  const milestones = normalizeStringArray(actor.data.milestones);
  const milestone = `Rank ${option.nextValue} Field Promotion`;
  if (!milestones.includes(milestone)) milestones.push(milestone);
  return {
    ...actor.data,
    rank: option.nextValue,
    aptitudes,
    strain: {
      current: numericValue(strain?.current, numericValue(strain?.max, 5)) + 1,
      max: numericValue(strain?.max, 5) + 1
    },
    milestones
  };
}

export function stellarFrontiersSheet(actor: Actor, items: Item[] = []): StellarFrontiersSheet {
  const strain = actor.data.strain as { current?: number; max?: number } | undefined;
  return {
    actorId: actor.id,
    summary: `${actor.name}${strain ? ` (${strain.current ?? "?"}/${strain.max ?? "?"} strain)` : ""}`,
    data: actor.data,
    quickRolls: stellarFrontiersQuickRolls(actor),
    conditions: stellarFrontiersActorConditions(actor),
    inventory: items.filter((item) => item.actorId === actor.id && item.type !== "talent" && item.type !== "spell"),
    spells: [],
    talents: items.filter((item) => item.actorId === actor.id && item.type === "talent")
  };
}

export function stellarFrontiersActorConditions(actor: Actor): AppliedCondition[] {
  const rawConditions = normalizeConditionRecords(actor.data.conditions);
  return rawConditions.map((condition) => {
    const entry = stellarFrontiersCompendiumEntry(condition.id);
    return {
      id: condition.id,
      name: entry?.name ?? condition.id,
      summary: entry?.summary ?? "",
      appliedAt: condition.appliedAt
    };
  });
}

export function applyStellarFrontiersCondition(actor: Actor, conditionId: string, appliedAt?: string): Record<string, unknown> {
  const entry = stellarFrontiersCompendiumEntry(conditionId);
  if (!entry || entry.type !== "condition") throw new Error(`Unknown condition: ${conditionId}`);
  const conditions = normalizeConditionRecords(actor.data.conditions);
  if (!conditions.some((condition) => condition.id === conditionId)) conditions.push({ id: conditionId, appliedAt });
  return { ...actor.data, conditions };
}

export function removeStellarFrontiersCondition(actor: Actor, conditionId: string): Record<string, unknown> {
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

function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function buildEncounterPlan(input: { systemId: string; partyRating: number; threats: EncounterThreat[]; selections: EncounterThreatSelection[] }): EncounterPlan {
  const requested = input.selections.length > 0 ? input.selections : [{ id: input.threats[0]?.id ?? "", count: 1 }];
  const threats = requested.flatMap((selection) => {
    const threat = input.threats.find((item) => item.id === selection.id);
    if (!threat) return [];
    const count = Math.max(1, Math.floor(numericValue(selection.count, 1)));
    return [
      {
        id: threat.id,
        name: threat.name,
        role: threat.role,
        count,
        budgetEach: threat.budget,
        budgetTotal: threat.budget * count
      }
    ];
  });
  const threatBudget = threats.reduce((total, threat) => total + threat.budgetTotal, 0);
  const ratio = input.partyRating > 0 ? threatBudget / input.partyRating : 99;
  const difficulty = encounterDifficulty(ratio);
  return {
    systemId: input.systemId,
    partyRating: input.partyRating,
    threatBudget,
    difficulty,
    threats,
    summary: `${difficulty} encounter: ${threats.map((threat) => `${threat.count}x ${threat.name}`).join(", ") || "no threats"} (${threatBudget}/${input.partyRating} budget)`
  };
}

function encounterDifficulty(ratio: number): EncounterPlan["difficulty"] {
  if (ratio <= 0.25) return "trivial";
  if (ratio <= 0.6) return "easy";
  if (ratio <= 1.1) return "standard";
  if (ratio <= 1.6) return "hard";
  return "deadly";
}
