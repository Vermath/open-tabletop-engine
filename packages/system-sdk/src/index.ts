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

export const DND_5E_SRD_SYSTEM_ID = "dnd-5e-srd";
export const DND_5E_SRD_VERSION = "SRD 5.2.1";

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
  metadata?: Record<string, unknown>;
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

export interface Dnd5eSrdCharacterBackground {
  id: string;
  name: string;
  abilityScores: string[];
  feat: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  startingGp: number;
  source: typeof DND_5E_SRD_VERSION;
}

export interface Dnd5eSrdCharacterSpecies {
  id: string;
  name: string;
  creatureType: "Humanoid";
  size: string;
  speed: number;
  traits: string[];
  senses?: string[];
  source: typeof DND_5E_SRD_VERSION;
}

export interface Dnd5eSrdCharacterOrigins {
  backgrounds: Dnd5eSrdCharacterBackground[];
  species: Dnd5eSrdCharacterSpecies[];
}

export interface Dnd5eSrdCharacterOriginOptions {
  backgroundId?: string;
  speciesId?: string;
  abilityScoreIncreases?: unknown;
}

export interface Dnd5eSrdCharacterOriginBuild {
  data: Record<string, unknown>;
  items: CharacterTemplateItem[];
  background: Dnd5eSrdCharacterBackground;
  species: Dnd5eSrdCharacterSpecies;
}

export interface CharacterImportInput {
  name?: unknown;
  data?: Record<string, unknown>;
  items?: unknown;
  conditions?: unknown;
}

export interface CharacterImportResult {
  systemId: string;
  actorType: string;
  name: string;
  data: Record<string, unknown>;
  items: CharacterTemplateItem[];
  warnings: string[];
}

export interface AdvancementOption {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  nextValue: number;
}

export type SystemRestType = "short" | "long";

export interface SystemRestOptions {
  arcaneRecovery?: Record<string, number>;
}

export interface SystemRestResult {
  systemId: string;
  actorId: string;
  restType: SystemRestType;
  summary: string;
  recovered: Record<string, unknown>;
  removedConditions: AppliedCondition[];
  data: Record<string, unknown>;
}

export type SystemActionConsumptionType = "spellSlot" | "resource" | "strain" | "itemQuantity";

export interface SystemActionConsumption {
  type: SystemActionConsumptionType;
  key: string;
  label: string;
  amount: number;
  remaining: number;
}

export interface SystemActionUseOptions {
  spellSlotLevel?: number;
  resourceAmount?: number;
  useFreeResource?: boolean;
}

export interface SystemActionUseResult {
  systemId: string;
  actorId: string;
  rollId: string;
  slotLevel?: number;
  consumed: SystemActionConsumption[];
  data: Record<string, unknown>;
  items: Item[];
}

export interface Dnd5eSrdEquipmentPurchaseResult {
  systemId: typeof DND_5E_SRD_SYSTEM_ID;
  actorId: string;
  entryId: string;
  quantity: number;
  unitCostGp: number;
  totalCostGp: number;
  currency: Record<string, number>;
  data: Record<string, unknown>;
  itemData: Record<string, unknown>;
}

export const DND_5E_SRD_SECOND_WIND_ROLL_ID = "feature-second-wind-healing";
export const DND_5E_SRD_ACTION_SURGE_ROLL_ID = "feature-action-surge";
export const DND_5E_SRD_TACTICAL_MIND_ROLL_ID = "feature-tactical-mind-bonus";
export const DND_5E_SRD_RAGE_ROLL_ID = "feature-rage";
export const DND_5E_SRD_RAGE_DAMAGE_ROLL_ID = "feature-rage-damage-bonus";
export const DND_5E_SRD_RECKLESS_ATTACK_ROLL_ID = "feature-reckless-attack";
export const DND_5E_SRD_BARDIC_INSPIRATION_ROLL_ID = "feature-bardic-inspiration";
export const DND_5E_SRD_FONT_OF_INSPIRATION_ROLL_ID = "feature-font-of-inspiration";
export const DND_5E_SRD_LAY_ON_HANDS_ROLL_ID = "feature-lay-on-hands-healing";
export const DND_5E_SRD_DIVINE_SMITE_ROLL_ID = "feature-divine-smite-damage";
export const DND_5E_SRD_FAITHFUL_STEED_ROLL_ID = "feature-faithful-steed";
export const DND_5E_SRD_HUNTERS_MARK_DAMAGE_ROLL_ID = "feature-hunters-mark-damage";
export const DND_5E_SRD_MARTIAL_ARTS_DAMAGE_ROLL_ID = "feature-martial-arts-damage";
export const DND_5E_SRD_FLURRY_OF_BLOWS_ROLL_ID = "feature-flurry-of-blows";
export const DND_5E_SRD_PATIENT_DEFENSE_ROLL_ID = "feature-patient-defense";
export const DND_5E_SRD_STEP_OF_THE_WIND_ROLL_ID = "feature-step-of-the-wind";
export const DND_5E_SRD_UNCANNY_METABOLISM_ROLL_ID = "feature-uncanny-metabolism-healing";
export const DND_5E_SRD_DEFLECT_ATTACKS_DAMAGE_ROLL_ID = "feature-deflect-attacks-damage";
export const DND_5E_SRD_STUNNING_STRIKE_ROLL_ID = "feature-stunning-strike";
export const DND_5E_SRD_INNATE_SORCERY_ROLL_ID = "feature-innate-sorcery";
export const DND_5E_SRD_CONVERT_SPELL_SLOT_ROLL_ID = "feature-convert-spell-slot-to-sorcery-points";
export const DND_5E_SRD_CREATE_SPELL_SLOT_ROLL_ID = "feature-create-spell-slot";
export const DND_5E_SRD_METAMAGIC_EMPOWERED_ROLL_ID = "feature-metamagic-empowered-spell";
export const DND_5E_SRD_METAMAGIC_QUICKENED_ROLL_ID = "feature-metamagic-quickened-spell";
export const DND_5E_SRD_ELDRITCH_INVOCATIONS_ROLL_ID = "feature-eldritch-invocations";
export const DND_5E_SRD_MAGICAL_CUNNING_ROLL_ID = "feature-magical-cunning";
export const DND_5E_SRD_WILD_SHAPE_ROLL_ID = "feature-wild-shape";
export const DND_5E_SRD_WILD_COMPANION_ROLL_ID = "feature-wild-companion";
export const DND_5E_SRD_WILD_RESURGENCE_WILD_SHAPE_ROLL_ID = "feature-wild-resurgence-wild-shape";
export const DND_5E_SRD_WILD_RESURGENCE_SPELL_SLOT_ROLL_ID = "feature-wild-resurgence-spell-slot";
export const DND_5E_SRD_DIVINE_SPARK_HEALING_ROLL_ID = "feature-divine-spark-healing";
export const DND_5E_SRD_DIVINE_SPARK_DAMAGE_ROLL_ID = "feature-divine-spark-damage";
export const DND_5E_SRD_TURN_UNDEAD_ROLL_ID = "feature-turn-undead";
export const DND_5E_SRD_SEAR_UNDEAD_DAMAGE_ROLL_ID = "feature-sear-undead-damage";
export const DND_5E_SRD_SNEAK_ATTACK_DAMAGE_ROLL_ID = "feature-sneak-attack-damage";
export const DND_5E_SRD_CUNNING_STRIKE_ROLL_ID = "feature-cunning-strike";
export const DND_5E_SRD_DRAGONBORN_BREATH_WEAPON_ROLL_ID = "species-dragonborn-breath-weapon";
export const DND_5E_SRD_DRACONIC_FLIGHT_ROLL_ID = "species-draconic-flight";
export const DND_5E_SRD_DWARF_STONECUNNING_ROLL_ID = "species-dwarf-stonecunning";
export const DND_5E_SRD_GOLIATH_GIANT_ANCESTRY_ROLL_ID = "species-goliath-giant-ancestry";
export const DND_5E_SRD_GOLIATH_LARGE_FORM_ROLL_ID = "species-goliath-large-form";
export const DND_5E_SRD_ORC_ADRENALINE_RUSH_ROLL_ID = "species-orc-adrenaline-rush";
export const DND_5E_SRD_ORC_RELENTLESS_ENDURANCE_ROLL_ID = "species-orc-relentless-endurance";

export interface Dnd5eSrdArmorClassDetails {
  value: number;
  base: number;
  dexModifier: number;
  armorName: string;
  armorItemId?: string;
  shieldBonus: number;
  shieldItemIds: string[];
  stealthDisadvantage: boolean;
  strengthRequirement?: number;
  speedPenalty: number;
}

export interface EncounterThreat {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  role: string;
  budget: number;
  challengeRating?: string;
  data?: Record<string, unknown>;
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
  challengeRating?: string;
  data?: Record<string, unknown>;
}

export interface EncounterPlan {
  systemId: string;
  partyRating: number;
  threatBudget: number;
  difficulty: "trivial" | "easy" | "standard" | "hard" | "deadly";
  difficultyBudgets?: {
    easy: number;
    standard: number;
    hard: number;
  };
  summary: string;
  threats: EncounterPlanThreat[];
}

export interface Dnd5eSrdMonsterAction {
  name: string;
  kind: "action" | "bonusAction" | "reaction";
  attackBonus?: number;
  range?: string;
  damageFormula?: string;
  damageType?: string;
  summary?: string;
}

export interface Dnd5eSrdMonsterStatBlock {
  source: typeof DND_5E_SRD_VERSION;
  size: string;
  creatureType: string;
  alignment: string;
  armorClass: number;
  initiative: number;
  hitPoints: number;
  hitDice: string;
  speed: string;
  challengeRating: string;
  xp: number;
  proficiencyBonus: number;
  abilities: Record<string, number>;
  saves: Record<string, number>;
  skills?: Record<string, number>;
  senses: string[];
  languages: string[];
  gear?: string[];
  traits?: Array<{ name: string; summary: string }>;
  actions: Dnd5eSrdMonsterAction[];
}

export type GenericFantasyCompendiumType = "item" | "spell" | "condition";
export type StellarFrontiersCompendiumType = "gear" | "talent" | "condition";
export type MysticNoirCompendiumType = "clue" | "ritual" | "condition";
export type RulesCompendiumType = GenericFantasyCompendiumType | StellarFrontiersCompendiumType | MysticNoirCompendiumType;

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

export interface MysticNoirCompendiumEntry extends RulesCompendiumEntry {
  type: MysticNoirCompendiumType;
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

export interface MysticNoirSheet extends GenericFantasySheet {
  composure?: { current?: number; max?: number };
  clues: Item[];
  rituals: Item[];
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

function formatSignedNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function appendFormulaBonus(formula: string, bonus: number): string {
  return `${formula}${formatSignedNumber(bonus)}`;
}

function appendFormulaTerm(formula: string, term: string): string {
  return term.startsWith("-") ? `${formula}${term}` : `${formula}+${term}`;
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "action";
}

function itemBelongsToActor(actor: Actor, item: Item): boolean {
  return item.actorId === actor.id;
}

export function genericFantasyAbilityCheck(actor: Actor, ability: string): QuickRoll {
  const modifier = genericFantasyAttributeModifier(actor, ability);
  const label = `${ability.charAt(0).toUpperCase()}${ability.slice(1)} Check`;
  const conditions = genericFantasyActorConditions(actor);
  const d20 = conditions.some((condition) => condition.id === "poisoned") ? "2d20kl1" : "1d20";
  const bonus = conditions.some((condition) => condition.id === "blessed") ? "+1d4" : "";
  return {
    id: `ability-${ability}`,
    label,
    formula: `${d20}${formatSignedNumber(modifier)}${bonus}`
  };
}

export function genericFantasyActionRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  return items.filter((item) => itemBelongsToActor(actor, item)).flatMap((item) => {
    const data = recordValue(item.data);
    const rolls: QuickRoll[] = [];
    const prefix = item.type === "spell" ? "spell" : "item";
    const damage = stringValue(data.damage);
    const ability = stringValue(data.ability);
    if (damage && ability) {
      rolls.push({
        id: `${prefix}-${item.id}-damage`,
        label: `${item.name} Damage`,
        formula: appendFormulaBonus(damage, genericFantasyAttributeModifier(actor, ability))
      });
    }
    const damageFormula = stringValue(data.damageFormula);
    if (damageFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-damage`,
        label: `${item.name} Damage`,
        formula: genericFantasyDamageFormula(actor, data)
      });
    }
    const secondaryDamageFormula = stringValue(data.secondaryDamageFormula);
    if (secondaryDamageFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-secondary-damage`,
        label: `${item.name} Secondary Damage`,
        formula: genericFantasyDamageFormula(actor, data, undefined, "secondaryDamageFormula", "secondaryUpcastFormula")
      });
    }
    const versatileDamage = stringValue(data.versatileDamage);
    if (versatileDamage && ability) {
      rolls.push({
        id: `${prefix}-${item.id}-versatile-damage`,
        label: `${item.name} Versatile Damage`,
        formula: appendFormulaBonus(versatileDamage, genericFantasyAttributeModifier(actor, ability))
      });
    }
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-healing`,
        label: `${item.name} Healing`,
        formula: genericFantasyHealingFormula(actor, data)
      });
    }
    const saveDcAbility = stringValue(data.saveDcAbility);
    const effectFormula = stringValue(data.effectFormula);
    if (saveDcAbility && effectFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-effect`,
        label: `${item.name} Effect`,
        formula: appendFormulaBonus(effectFormula, genericFantasyAttributeModifier(actor, saveDcAbility))
      });
    }
    return rolls;
  });
}

export function genericFantasyQuickRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  const attributes = actor.data.attributes as Record<string, number> | undefined;
  return [
    ...Object.keys(attributes ?? { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }).map((ability) =>
      genericFantasyAbilityCheck(actor, ability)
    ),
    ...genericFantasyActionRolls(actor, items)
  ];
}

export function dnd5eSrdQuickRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  const abilities = dnd5eSrdAbilityKeys();
  return [
    ...abilities.map((ability) => dnd5eSrdAbilityCheck(actor, ability)),
    ...abilities.map((ability) => dnd5eSrdSavingThrow(actor, ability)),
    ...dnd5eSrdSkills().map((skill) => dnd5eSrdSkillCheck(actor, skill.id)),
    ...dnd5eSrdToolProficiencies(actor, "toolProficiencies").map((toolId) => dnd5eSrdToolCheck(actor, toolId)),
    ...dnd5eSrdClassFeatureRolls(actor),
    ...dnd5eSrdSpeciesTraitRolls(actor),
    ...dnd5eSrdMonsterActionRolls(actor),
    ...dnd5eSrdActionRolls(actor, items)
  ];
}

export function dnd5eSrdClassFeatureRolls(actor: Actor): QuickRoll[] {
  const rolls: QuickRoll[] = [];
  if (dnd5eSrdHasSecondWind(actor)) {
    const metadata = dnd5eSrdHasTacticalShift(actor) ? { tacticalShift: { movementFt: dnd5eSrdTacticalShiftMovement(actor), opportunityAttacks: false } } : undefined;
    rolls.push(
      {
        id: DND_5E_SRD_SECOND_WIND_ROLL_ID,
        label: "Second Wind Healing",
        formula: dnd5eSrdSecondWindFormula(actor),
        ...(metadata ? { metadata } : {})
      }
    );
  }
  if (dnd5eSrdHasActionSurge(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_ACTION_SURGE_ROLL_ID,
        label: "Action Surge",
        formula: "0"
      }
    );
  }
  if (dnd5eSrdHasTacticalMind(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_TACTICAL_MIND_ROLL_ID,
        label: "Tactical Mind Bonus",
        formula: "1d10"
      }
    );
  }
  if (dnd5eSrdHasRage(actor)) {
    const rageDamageBonus = dnd5eSrdRageDamageBonus(actor);
    rolls.push(
      {
        id: DND_5E_SRD_RAGE_ROLL_ID,
        label: "Rage",
        formula: "0",
        metadata: dnd5eSrdRageMetadata(actor)
      },
      {
        id: DND_5E_SRD_RAGE_DAMAGE_ROLL_ID,
        label: "Rage Damage Bonus",
        formula: String(rageDamageBonus),
        metadata: {
          trigger: "Strength-based weapon or Unarmed Strike damage while raging",
          damageType: "Weapon",
          bonusDamage: rageDamageBonus
        }
      }
    );
  }
  if (dnd5eSrdHasRecklessAttack(actor)) {
    rolls.push({
      id: DND_5E_SRD_RECKLESS_ATTACK_ROLL_ID,
      label: "Reckless Attack",
      formula: "0",
      metadata: {
        trigger: "first attack roll on your turn",
        advantage: { attacksUsing: "Strength", until: "start of your next turn" },
        drawback: "attack rolls against you have Advantage during that time"
      }
    });
  }
  if (dnd5eSrdHasBardicInspiration(actor)) {
    rolls.push({
      id: DND_5E_SRD_BARDIC_INSPIRATION_ROLL_ID,
      label: "Bardic Inspiration",
      formula: dnd5eSrdBardicInspirationFormula(actor),
      metadata: dnd5eSrdBardicInspirationMetadata(actor)
    });
  }
  if (dnd5eSrdHasFontOfInspiration(actor)) {
    rolls.push({
      id: DND_5E_SRD_FONT_OF_INSPIRATION_ROLL_ID,
      label: "Font of Inspiration",
      formula: "0",
      metadata: { trigger: "expend a spell slot to regain one Bardic Inspiration use", resource: "bardicInspiration" }
    });
  }
  if (dnd5eSrdHasLayOnHands(actor)) {
    rolls.push({
      id: DND_5E_SRD_LAY_ON_HANDS_ROLL_ID,
      label: "Lay On Hands Healing",
      formula: dnd5eSrdLayOnHandsFormula(actor),
      metadata: dnd5eSrdLayOnHandsMetadata(actor)
    });
  }
  if (dnd5eSrdHasPaladinsSmite(actor)) {
    rolls.push({
      id: DND_5E_SRD_DIVINE_SMITE_ROLL_ID,
      label: "Divine Smite Damage",
      formula: dnd5eSrdDivineSmiteFormula(actor),
      metadata: dnd5eSrdDivineSmiteMetadata(actor)
    });
  }
  if (dnd5eSrdHasFaithfulSteed(actor)) {
    rolls.push({
      id: DND_5E_SRD_FAITHFUL_STEED_ROLL_ID,
      label: "Faithful Steed",
      formula: "0",
      metadata: { resource: "faithfulSteed", spell: "Find Steed", freeCasting: true, recovery: "long", slotLevel: 2 }
    });
  }
  if (dnd5eSrdHasHuntersMark(actor)) {
    rolls.push({
      id: DND_5E_SRD_HUNTERS_MARK_DAMAGE_ROLL_ID,
      label: "Hunter's Mark Damage",
      formula: dnd5eSrdHuntersMarkFormula(actor),
      metadata: dnd5eSrdHuntersMarkMetadata(actor)
    });
  }
  if (dnd5eSrdHasMartialArts(actor)) {
    rolls.push({
      id: DND_5E_SRD_MARTIAL_ARTS_DAMAGE_ROLL_ID,
      label: "Martial Arts Damage",
      formula: dnd5eSrdMartialArtsFormula(actor),
      metadata: dnd5eSrdMartialArtsMetadata(actor)
    });
  }
  if (dnd5eSrdHasMonkFocus(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_FLURRY_OF_BLOWS_ROLL_ID,
        label: "Flurry of Blows",
        formula: "0",
        metadata: dnd5eSrdFlurryOfBlowsMetadata(actor)
      },
      {
        id: DND_5E_SRD_PATIENT_DEFENSE_ROLL_ID,
        label: "Patient Defense",
        formula: "0",
        metadata: dnd5eSrdPatientDefenseMetadata(actor)
      },
      {
        id: DND_5E_SRD_STEP_OF_THE_WIND_ROLL_ID,
        label: "Step of the Wind",
        formula: "0",
        metadata: dnd5eSrdStepOfTheWindMetadata(actor)
      },
      {
        id: DND_5E_SRD_UNCANNY_METABOLISM_ROLL_ID,
        label: "Uncanny Metabolism Healing",
        formula: dnd5eSrdUncannyMetabolismFormula(actor),
        metadata: dnd5eSrdUncannyMetabolismMetadata(actor)
      }
    );
  }
  if (dnd5eSrdHasDeflectAttacks(actor)) {
    rolls.push({
      id: DND_5E_SRD_DEFLECT_ATTACKS_DAMAGE_ROLL_ID,
      label: "Deflect Attacks Damage",
      formula: dnd5eSrdDeflectAttacksDamageFormula(actor),
      metadata: dnd5eSrdDeflectAttacksMetadata(actor)
    });
  }
  if (dnd5eSrdHasStunningStrike(actor)) {
    rolls.push({
      id: DND_5E_SRD_STUNNING_STRIKE_ROLL_ID,
      label: "Stunning Strike",
      formula: "0",
      metadata: dnd5eSrdStunningStrikeMetadata(actor)
    });
  }
  if (dnd5eSrdHasInnateSorcery(actor)) {
    rolls.push({
      id: DND_5E_SRD_INNATE_SORCERY_ROLL_ID,
      label: "Innate Sorcery",
      formula: "0",
      metadata: dnd5eSrdInnateSorceryMetadata(actor)
    });
  }
  if (dnd5eSrdHasFontOfMagic(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_CONVERT_SPELL_SLOT_ROLL_ID,
        label: "Convert Spell Slot",
        formula: "0",
        metadata: dnd5eSrdConvertSpellSlotMetadata(actor)
      },
      {
        id: DND_5E_SRD_CREATE_SPELL_SLOT_ROLL_ID,
        label: "Create Spell Slot",
        formula: "0",
        metadata: dnd5eSrdCreateSpellSlotMetadata(actor)
      }
    );
  }
  if (dnd5eSrdHasMetamagic(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_METAMAGIC_EMPOWERED_ROLL_ID,
        label: "Metamagic: Empowered Spell",
        formula: "0",
        metadata: dnd5eSrdMetamagicEmpoweredMetadata(actor)
      },
      {
        id: DND_5E_SRD_METAMAGIC_QUICKENED_ROLL_ID,
        label: "Metamagic: Quickened Spell",
        formula: "0",
        metadata: dnd5eSrdMetamagicQuickenedMetadata(actor)
      }
    );
  }
  if (dnd5eSrdHasEldritchInvocations(actor)) {
    rolls.push({
      id: DND_5E_SRD_ELDRITCH_INVOCATIONS_ROLL_ID,
      label: "Eldritch Invocations",
      formula: "0",
      metadata: dnd5eSrdEldritchInvocationsMetadata(actor)
    });
  }
  if (dnd5eSrdHasMagicalCunning(actor)) {
    rolls.push({
      id: DND_5E_SRD_MAGICAL_CUNNING_ROLL_ID,
      label: "Magical Cunning",
      formula: "0",
      metadata: dnd5eSrdMagicalCunningMetadata(actor)
    });
  }
  if (dnd5eSrdHasWildShape(actor)) {
    rolls.push({
      id: DND_5E_SRD_WILD_SHAPE_ROLL_ID,
      label: "Wild Shape",
      formula: "0",
      metadata: dnd5eSrdWildShapeMetadata(actor)
    });
  }
  if (dnd5eSrdHasWildCompanion(actor)) {
    rolls.push({
      id: DND_5E_SRD_WILD_COMPANION_ROLL_ID,
      label: "Wild Companion",
      formula: "0",
      metadata: { spell: "Find Familiar", action: "Magic", cost: ["spell slot", "Wild Shape"], resource: "wildShape", familiarType: "Fey", duration: "until Long Rest", materialComponents: false }
    });
  }
  if (dnd5eSrdHasWildResurgence(actor)) {
    rolls.push(
      {
        id: DND_5E_SRD_WILD_RESURGENCE_WILD_SHAPE_ROLL_ID,
        label: "Wild Resurgence: Wild Shape",
        formula: "0",
        metadata: { restores: "wildShape", cost: "spell slot", limit: "once on each of your turns when no Wild Shape uses remain" }
      },
      {
        id: DND_5E_SRD_WILD_RESURGENCE_SPELL_SLOT_ROLL_ID,
        label: "Wild Resurgence: Spell Slot",
        formula: "0",
        metadata: { resource: "wildResurgence", cost: "Wild Shape", restores: "level1 spell slot", recovery: "long" }
      }
    );
  }
  if (dnd5eSrdHasChannelDivinity(actor)) {
    const saveDc = dnd5eSrdSpellSaveDc(actor);
    const searUndead = dnd5eSrdHasSearUndead(actor) ? { formula: dnd5eSrdSearUndeadFormula(actor), damageType: "Radiant" } : undefined;
    rolls.push(
      {
        id: DND_5E_SRD_DIVINE_SPARK_HEALING_ROLL_ID,
        label: "Divine Spark Healing",
        formula: dnd5eSrdDivineSparkFormula(actor),
        metadata: { resource: "channelDivinity", rangeFt: 30 }
      },
      {
        id: DND_5E_SRD_DIVINE_SPARK_DAMAGE_ROLL_ID,
        label: "Divine Spark Damage",
        formula: dnd5eSrdDivineSparkFormula(actor),
        metadata: { resource: "channelDivinity", rangeFt: 30, damageTypes: ["Necrotic", "Radiant"], save: { ability: "constitution", dc: saveDc, success: "half" } }
      },
      {
        id: DND_5E_SRD_TURN_UNDEAD_ROLL_ID,
        label: "Turn Undead",
        formula: "0",
        metadata: { resource: "channelDivinity", rangeFt: 30, target: "Undead", save: { ability: "wisdom", dc: saveDc }, conditions: ["Frightened", "Incapacitated"], duration: "1 minute", ...(searUndead ? { searUndead } : {}) }
      }
    );
  }
  if (dnd5eSrdHasSearUndead(actor)) {
    rolls.push({
      id: DND_5E_SRD_SEAR_UNDEAD_DAMAGE_ROLL_ID,
      label: "Sear Undead Damage",
      formula: dnd5eSrdSearUndeadFormula(actor),
      metadata: { trigger: "Turn Undead failed save", target: "Undead", damageType: "Radiant" }
    });
  }
  if (dnd5eSrdHasSneakAttack(actor)) {
    rolls.push({
      id: DND_5E_SRD_SNEAK_ATTACK_DAMAGE_ROLL_ID,
      label: "Sneak Attack Damage",
      formula: dnd5eSrdSneakAttackFormula(actor),
      metadata: dnd5eSrdSneakAttackMetadata(actor)
    });
  }
  if (dnd5eSrdHasCunningStrike(actor)) {
    rolls.push({
      id: DND_5E_SRD_CUNNING_STRIKE_ROLL_ID,
      label: "Cunning Strike",
      formula: "0",
      metadata: dnd5eSrdCunningStrikeMetadata(actor)
    });
  }
  return rolls;
}

export function dnd5eSrdSpeciesTraitRolls(actor: Actor): QuickRoll[] {
  const rolls: QuickRoll[] = [];
  if (dnd5eSrdHasDragonbornBreathWeapon(actor)) {
    rolls.push({
      id: DND_5E_SRD_DRAGONBORN_BREATH_WEAPON_ROLL_ID,
      label: "Breath Weapon",
      formula: dnd5eSrdDragonbornBreathWeaponFormula(actor),
      metadata: dnd5eSrdDragonbornBreathWeaponMetadata(actor)
    });
  }
  if (dnd5eSrdHasDraconicFlight(actor)) {
    rolls.push({
      id: DND_5E_SRD_DRACONIC_FLIGHT_ROLL_ID,
      label: "Draconic Flight",
      formula: "0",
      metadata: dnd5eSrdDraconicFlightMetadata(actor)
    });
  }
  if (dnd5eSrdHasDwarfStonecunning(actor)) {
    rolls.push({
      id: DND_5E_SRD_DWARF_STONECUNNING_ROLL_ID,
      label: "Stonecunning",
      formula: "0",
      metadata: dnd5eSrdStonecunningMetadata(actor)
    });
  }
  if (dnd5eSrdHasGoliathGiantAncestry(actor)) {
    rolls.push({
      id: DND_5E_SRD_GOLIATH_GIANT_ANCESTRY_ROLL_ID,
      label: "Giant Ancestry",
      formula: "0",
      metadata: dnd5eSrdGiantAncestryMetadata(actor)
    });
  }
  if (dnd5eSrdHasGoliathLargeForm(actor)) {
    rolls.push({
      id: DND_5E_SRD_GOLIATH_LARGE_FORM_ROLL_ID,
      label: "Large Form",
      formula: "0",
      metadata: dnd5eSrdLargeFormMetadata(actor)
    });
  }
  if (dnd5eSrdHasOrcAdrenalineRush(actor)) {
    rolls.push({
      id: DND_5E_SRD_ORC_ADRENALINE_RUSH_ROLL_ID,
      label: "Adrenaline Rush",
      formula: dnd5eSrdAdrenalineRushFormula(actor),
      metadata: dnd5eSrdAdrenalineRushMetadata(actor)
    });
  }
  if (dnd5eSrdHasOrcRelentlessEndurance(actor)) {
    rolls.push({
      id: DND_5E_SRD_ORC_RELENTLESS_ENDURANCE_ROLL_ID,
      label: "Relentless Endurance",
      formula: "0",
      metadata: dnd5eSrdRelentlessEnduranceMetadata()
    });
  }
  return rolls;
}

export function dnd5eSrdActionRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  const attacksPerAction = dnd5eSrdAttacksPerAction(actor);
  return genericFantasyActionRolls(actor, items).map((roll) => {
    const martialArtsFormula = dnd5eSrdMonkWeaponDamageFormulaForRoll(actor, items, roll.id);
    const nextRoll = martialArtsFormula ? { ...roll, formula: martialArtsFormula, metadata: { ...roll.metadata, martialArts: { die: dnd5eSrdMartialArtsDie(actor), dexterousAttacks: true } } } : roll;
    if (attacksPerAction <= 1 || !dnd5eSrdIsWeaponDamageRoll(actor, items, roll.id)) return nextRoll;
    return { ...nextRoll, metadata: { ...nextRoll.metadata, attacksPerAction, feature: "Extra Attack" } };
  });
}

export function dnd5eSrdMonsterActionRolls(actor: Actor): QuickRoll[] {
  const statBlock = dnd5eSrdMonsterStatBlockFromActor(actor);
  if (!statBlock) return [];
  const actions = Array.isArray(statBlock.actions) ? statBlock.actions.flatMap((action) => [recordValue(action)]) : [];
  return actions.flatMap((action) => {
    const name = stringValue(action.name);
    if (!name) return [];
    const id = slugId(name);
    const rolls: QuickRoll[] = [];
    const attackBonus = numericValue(action.attackBonus, Number.NaN);
    if (Number.isFinite(attackBonus)) {
      rolls.push({
        id: `monster-${id}-attack`,
        label: `${name} Attack`,
        formula: `1d20${formatSignedNumber(attackBonus)}`
      });
    }
    const damageFormula = stringValue(action.damageFormula);
    if (damageFormula) {
      rolls.push({
        id: `monster-${id}-damage`,
        label: `${name} Damage`,
        formula: damageFormula
      });
    }
    return rolls;
  });
}

function dnd5eSrdMonsterStatBlockFromActor(actor: Actor): Record<string, unknown> | undefined {
  const monster = recordValue(actor.data.monster);
  const statBlock = recordValue(monster.statBlock);
  return Array.isArray(statBlock.actions) ? statBlock : undefined;
}

export function dnd5eSrdAbilityCheck(actor: Actor, ability: string): QuickRoll {
  const modifier = genericFantasyAttributeModifier(actor, ability);
  const label = `${ability.charAt(0).toUpperCase()}${ability.slice(1)} Check`;
  const d20 = dnd5eSrdActorConditions(actor).some((condition) => condition.id === "poisoned") ? "2d20kl1" : "1d20";
  return {
    id: `ability-${ability}`,
    label,
    formula: `${d20}${formatSignedNumber(modifier)}`
  };
}

export function dnd5eSrdSavingThrow(actor: Actor, ability: string): QuickRoll {
  const modifier = genericFantasyAttributeModifier(actor, ability);
  const proficiencyBonus = dnd5eSrdSaveProficiencies(actor).includes(ability) ? dnd5eSrdProficiencyBonus(actor) : 0;
  const bonus = dnd5eSrdActorConditions(actor).some((condition) => condition.id === "blessed") ? "+1d4" : "";
  const label = `${ability.charAt(0).toUpperCase()}${ability.slice(1)} Save`;
  const metadata = ability === "dexterity" && dnd5eSrdHasDangerSense(actor) ? { advantage: true, feature: "Danger Sense", exceptConditions: ["Incapacitated"] } : undefined;
  return {
    id: `save-${ability}`,
    label,
    formula: `1d20${formatSignedNumber(modifier + proficiencyBonus)}${bonus}`,
    ...(metadata ? { metadata } : {})
  };
}

export function dnd5eSrdSkillCheck(actor: Actor, skillId: string): QuickRoll {
  const skill = dnd5eSrdSkillDefinition(skillId);
  const modifier = genericFantasyAttributeModifier(actor, skill.ability);
  const proficiencyMultiplier = dnd5eSrdSkillProficiencyMultiplier(actor, skill.id);
  const jackOfAllTradesBonus = proficiencyMultiplier === 0 && dnd5eSrdHasJackOfAllTrades(actor) ? Math.floor(dnd5eSrdProficiencyBonus(actor) / 2) : 0;
  const d20 = dnd5eSrdActorConditions(actor).some((condition) => condition.id === "poisoned") ? "2d20kl1" : "1d20";
  return {
    id: `skill-${skill.id}`,
    label: `${skill.label} Check`,
    formula: `${d20}${formatSignedNumber(modifier + proficiencyMultiplier * dnd5eSrdProficiencyBonus(actor) + jackOfAllTradesBonus)}`,
    ...(jackOfAllTradesBonus > 0 ? { metadata: { feature: "Jack of All Trades", bonus: jackOfAllTradesBonus } } : {})
  };
}

export function dnd5eSrdToolCheck(actor: Actor, toolId: string): QuickRoll {
  const tool = dnd5eSrdToolDefinition(toolId);
  const modifier = genericFantasyAttributeModifier(actor, tool.ability);
  const proficiencyMultiplier = dnd5eSrdToolProficiencyMultiplier(actor, tool.id);
  const d20 = dnd5eSrdActorConditions(actor).some((condition) => condition.id === "poisoned") ? "2d20kl1" : "1d20";
  return {
    id: `tool-${tool.id}`,
    label: `${tool.label} Check`,
    formula: `${d20}${formatSignedNumber(modifier + proficiencyMultiplier * dnd5eSrdProficiencyBonus(actor))}`
  };
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
      data: { level: 1, school: "evocation", action: "bonus", range: "60 ft", healingFormula: "1d4+@attributes.charisma", upcastFormula: "1d4" }
    },
    {
      id: "fire-bolt",
      type: "spell",
      name: "Fire Bolt",
      summary: "Ranged spell attack that deals fire damage.",
      data: { level: 0, school: "evocation", action: "action", range: "120 ft", damage: "1d10", ability: "intelligence" }
    },
    {
      id: "cure-wounds",
      type: "spell",
      name: "Cure Wounds",
      summary: "Touch-range healing spell that scales with the caster's magic.",
      data: { level: 1, school: "evocation", action: "action", range: "touch", healingFormula: "1d8+@attributes.wisdom", upcastFormula: "1d8" }
    },
    {
      id: "shield",
      type: "spell",
      name: "Shield",
      summary: "Reaction spell that reinforces defense until the next turn.",
      data: { level: 1, school: "abjuration", action: "reaction", range: "self", effectFormula: "5", saveDcAbility: "intelligence" }
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
      data: { rollMode: "disadvantage", longRestClears: true }
    },
    {
      id: "restrained",
      type: "condition",
      name: "Restrained",
      summary: "Marks the actor as unable to freely move.",
      data: { speedMultiplier: 0, shortRestClears: true }
    }
  ];
}

export function genericFantasyCompendiumEntry(entryId: string): GenericFantasyCompendiumEntry | undefined {
  return genericFantasyCompendium().find((entry) => entry.id === entryId);
}

export function dnd5eSrdCompendium(): GenericFantasyCompendiumEntry[] {
  return [
    ...genericFantasyCompendium().map((entry) => {
      const dndDataOverrides =
        entry.id === "healing-word"
          ? { healingFormula: "1d4+@spellcasting", upcastFormula: "2d4" }
          : entry.id === "cure-wounds"
            ? { healingFormula: "2d8+@spellcasting", upcastFormula: "2d8" }
            : entry.id === "longsword"
              ? { costGp: 15, weightLb: 3, damageType: "slashing", equipmentCategory: "weapon" }
              : {};
      const dndSummaryOverride =
        entry.id === "blessed"
          ? "Adds 1d4 to SRD saving throws."
          : entry.id === "poisoned"
            ? "Rolls SRD ability and skill checks with disadvantage."
            : undefined;
      return {
        ...entry,
        summary: dndSummaryOverride ?? entry.summary.replace("Generic Fantasy runtime", "D&D 5.5e SRD runtime"),
        data: { ...entry.data, ...dndDataOverrides, source: DND_5E_SRD_VERSION }
      };
    }),
    {
      id: "magic-initiate",
      type: "condition",
      name: "Magic Initiate",
      summary: "Tracks the SRD-origin feat choice on a character sheet.",
      data: { source: DND_5E_SRD_VERSION }
    },
    {
      id: "chromatic-orb",
      type: "spell",
      name: "Chromatic Orb",
      summary: "Level 1 evocation spell that deals selectable elemental damage and scales when upcast.",
      data: { level: 1, school: "evocation", action: "action", range: "90 ft", damageFormula: "3d8", upcastFormula: "1d8", damageType: "choice", source: DND_5E_SRD_VERSION }
    },
    {
      id: "ice-knife",
      type: "spell",
      name: "Ice Knife",
      summary: "Level 1 conjuration spell with an initial piercing hit and a secondary cold burst.",
      data: { level: 1, school: "conjuration", action: "action", range: "60 ft", damageFormula: "1d10", damageType: "piercing", secondaryDamageFormula: "2d6", secondaryUpcastFormula: "1d6", secondaryDamageType: "cold", source: DND_5E_SRD_VERSION }
    },
    {
      id: "ray-of-sickness",
      type: "spell",
      name: "Ray of Sickness",
      summary: "Level 1 necromancy spell that deals poison damage and scales when upcast.",
      data: { level: 1, school: "necromancy", action: "action", range: "60 ft", damageFormula: "2d8", upcastFormula: "1d8", damageType: "poison", source: DND_5E_SRD_VERSION }
    },
    {
      id: "divine-smite",
      type: "spell",
      name: "Divine Smite",
      summary: "Level 1 Paladin evocation spell that adds radiant damage after a melee hit.",
      data: { level: 1, school: "evocation", action: "bonus", range: "self", damageFormula: "2d8", upcastFormula: "1d8", damageType: "radiant", trigger: "immediately after hitting a target with a Melee weapon or Unarmed Strike", creatureTypeBonus: { types: ["Fiend", "Undead"], formula: "1d8" }, source: DND_5E_SRD_VERSION }
    },
    {
      id: "hunters-mark",
      type: "spell",
      name: "Hunter's Mark",
      summary: "Level 1 Ranger divination spell that marks quarry and adds force damage on attack hits.",
      data: { level: 1, school: "divination", action: "bonus", range: "90 ft", damageFormula: "1d6", damageType: "force", concentration: true, duration: "up to 1 hour", trigger: "whenever you hit the marked target with an attack roll", upcastDuration: { level3: "up to 8 hours", level5: "up to 24 hours" }, source: DND_5E_SRD_VERSION }
    },
    {
      id: "sorcerous-burst",
      type: "spell",
      name: "Sorcerous Burst",
      summary: "Sorcerer evocation cantrip that deals a selectable elemental damage type.",
      data: { level: 0, school: "evocation", action: "action", range: "120 ft", damageFormula: "1d8", damageType: "choice", damageTypes: ["acid", "cold", "fire", "lightning", "poison", "psychic", "thunder"], source: DND_5E_SRD_VERSION }
    },
    {
      id: "eldritch-blast",
      type: "spell",
      name: "Eldritch Blast",
      summary: "Warlock evocation cantrip that deals force damage at long range.",
      data: { level: 0, school: "evocation", action: "action", range: "120 ft", damageFormula: "1d10", damageType: "force", source: DND_5E_SRD_VERSION }
    },
    {
      id: "hex",
      type: "spell",
      name: "Hex",
      summary: "Level 1 Warlock enchantment spell that curses a target and adds necrotic damage on hits.",
      data: { level: 1, school: "enchantment", action: "bonus", range: "90 ft", damageFormula: "1d6", damageType: "necrotic", concentration: true, duration: "up to 1 hour", trigger: "whenever you hit the cursed target with an attack roll", upcastDuration: { level3: "up to 8 hours", level5: "up to 24 hours" }, source: DND_5E_SRD_VERSION }
    },
    {
      id: "dissonant-whispers",
      type: "spell",
      name: "Dissonant Whispers",
      summary: "Level 1 Bard enchantment spell that deals psychic damage and can force movement on a failed save.",
      data: { level: 1, school: "enchantment", action: "action", range: "60 ft", damageFormula: "3d6", upcastFormula: "1d6", damageType: "psychic", classes: ["bard"], save: { ability: "wisdom", success: "half" }, forcedMovement: "target must move away on a failed save", source: DND_5E_SRD_VERSION }
    },
    {
      id: "dragons-breath",
      type: "spell",
      name: "Dragon's Breath",
      summary: "Level 2 transmutation spell that lets a touched creature exhale a chosen elemental cone.",
      data: { level: 2, school: "transmutation", action: "bonus", range: "touch", damageFormula: "3d6", upcastFormula: "1d6", damageType: "choice", damageTypes: ["acid", "cold", "fire", "lightning", "poison"], classes: ["sorcerer", "wizard"], concentration: true, duration: "up to 1 minute", area: "15-foot cone", save: { ability: "dexterity", success: "half" }, source: DND_5E_SRD_VERSION }
    },
    {
      id: "mind-spike",
      type: "spell",
      name: "Mind Spike",
      summary: "Level 2 divination spell that deals psychic damage and tracks the target while concentration lasts.",
      data: { level: 2, school: "divination", action: "action", range: "120 ft", damageFormula: "3d8", upcastFormula: "1d8", damageType: "psychic", classes: ["sorcerer", "warlock", "wizard"], concentration: true, duration: "up to 1 hour", save: { ability: "wisdom", success: "half" }, tracking: "reveals the target's location while concentration lasts", source: DND_5E_SRD_VERSION }
    },
    {
      id: "ensnaring-strike",
      type: "spell",
      name: "Ensnaring Strike",
      summary: "Level 1 Ranger conjuration spell that adds piercing damage and can restrain a weapon-hit target.",
      data: { level: 1, school: "conjuration", action: "bonus", range: "self", damageFormula: "1d6", upcastFormula: "1d6", damageType: "piercing", classes: ["ranger"], concentration: true, duration: "up to 1 minute", trigger: "after hitting a creature with a weapon", save: { ability: "strength" }, condition: "Restrained", source: DND_5E_SRD_VERSION }
    },
    {
      id: "starry-wisp",
      type: "spell",
      name: "Starry Wisp",
      summary: "Bard and Druid evocation cantrip that deals radiant damage and briefly lights the target.",
      data: { level: 0, school: "evocation", action: "action", range: "60 ft", damageFormula: "1d8", damageType: "radiant", classes: ["bard", "druid"], spellAttack: true, light: "dim light until the end of the target's next turn", source: DND_5E_SRD_VERSION }
    },
    {
      id: "alert",
      type: "condition",
      name: "Alert",
      summary: "Tracks the SRD-origin feat choice on a character sheet.",
      data: { source: DND_5E_SRD_VERSION }
    },
    {
      id: "savage-attacker",
      type: "condition",
      name: "Savage Attacker",
      summary: "Tracks the SRD-origin feat choice on a character sheet.",
      data: { source: DND_5E_SRD_VERSION }
    },
    {
      id: "shield-armor",
      type: "item",
      name: "Shield",
      summary: "Defensive gear that improves armor class while wielded.",
      data: { category: "armor", equipmentCategory: "armor", armorKind: "shield", armorBonus: 2, costGp: 10, weightLb: 6, source: DND_5E_SRD_VERSION }
    },
    {
      id: "leather-armor",
      type: "item",
      name: "Leather Armor",
      summary: "Light armor that sets base Armor Class while allowing Dexterity defense.",
      data: { category: "armor", equipmentCategory: "armor", armorType: "light", armorBase: 11, costGp: 10, weightLb: 10, source: DND_5E_SRD_VERSION }
    },
    {
      id: "studded-leather-armor",
      type: "item",
      name: "Studded Leather Armor",
      summary: "Light armor with reinforced protection while preserving Dexterity defense.",
      data: { category: "armor", equipmentCategory: "armor", armorType: "light", armorBase: 12, costGp: 45, weightLb: 13, source: DND_5E_SRD_VERSION }
    },
    {
      id: "chain-mail",
      type: "item",
      name: "Chain Mail",
      summary: "Heavy armor with a fixed Armor Class, Strength requirement, and noisy profile.",
      data: { category: "armor", equipmentCategory: "armor", armorType: "heavy", armorBase: 16, dexBonus: false, strengthRequirement: 13, stealthDisadvantage: true, costGp: 75, weightLb: 55, source: DND_5E_SRD_VERSION }
    },
    {
      id: "dagger",
      type: "item",
      name: "Dagger",
      summary: "Simple finesse weapon with light and thrown properties.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d4", damageType: "piercing", ability: "dexterity", properties: ["finesse", "light", "thrown"], costGp: 2, weightLb: 1, source: DND_5E_SRD_VERSION }
    },
    {
      id: "sickle",
      type: "item",
      name: "Sickle",
      summary: "Simple light melee weapon with a curved slashing blade.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d4", damageType: "slashing", ability: "strength", properties: ["light"], costGp: 1, weightLb: 2, source: DND_5E_SRD_VERSION }
    },
    {
      id: "quarterstaff",
      type: "item",
      name: "Quarterstaff",
      summary: "Simple versatile melee weapon.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d6", versatileDamage: "1d8", damageType: "bludgeoning", ability: "strength", properties: ["versatile"], costGp: 0.2, weightLb: 4, source: DND_5E_SRD_VERSION }
    },
    {
      id: "shortbow",
      type: "item",
      name: "Shortbow",
      summary: "Simple ranged weapon for short-range archery.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d6", damageType: "piercing", ability: "dexterity", properties: ["ammunition", "two-handed"], costGp: 25, weightLb: 2, source: DND_5E_SRD_VERSION }
    },
    {
      id: "longbow",
      type: "item",
      name: "Longbow",
      summary: "Martial ranged weapon for long-range archery.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d8", damageType: "piercing", ability: "dexterity", properties: ["ammunition", "heavy", "two-handed"], costGp: 50, weightLb: 2, source: DND_5E_SRD_VERSION }
    },
    {
      id: "scimitar",
      type: "item",
      name: "Scimitar",
      summary: "Martial finesse weapon with a light slashing blade.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d6", damageType: "slashing", ability: "dexterity", properties: ["finesse", "light"], costGp: 25, weightLb: 3, source: DND_5E_SRD_VERSION }
    },
    {
      id: "shortsword",
      type: "item",
      name: "Shortsword",
      summary: "Martial finesse weapon for quick piercing attacks.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d6", damageType: "piercing", ability: "dexterity", properties: ["finesse", "light"], costGp: 10, weightLb: 2, source: DND_5E_SRD_VERSION }
    },
    {
      id: "spear",
      type: "item",
      name: "Spear",
      summary: "Simple thrown melee weapon with versatile handling.",
      data: { category: "weapon", equipmentCategory: "weapon", damage: "1d6", versatileDamage: "1d8", damageType: "piercing", ability: "strength", properties: ["thrown", "versatile"], costGp: 1, weightLb: 3, source: DND_5E_SRD_VERSION }
    },
    {
      id: "musical-instrument",
      type: "item",
      name: "Musical Instrument",
      summary: "A chosen musical instrument proficiency for SRD character origins and class equipment.",
      data: { category: "tool", equipmentCategory: "tool", toolId: "musical-instrument", ability: "charisma", costGp: 2, weightLb: 3, source: DND_5E_SRD_VERSION }
    },
    {
      id: "arcane-focus",
      type: "item",
      name: "Arcane Focus",
      summary: "A crystal or similar focus for arcane spellcasting.",
      data: { category: "adventuring-gear", equipmentCategory: "gear", focusType: "arcane", costGp: 10, weightLb: 1, source: DND_5E_SRD_VERSION }
    },
    {
      id: "calligraphers-supplies",
      type: "item",
      name: "Calligrapher's Supplies",
      summary: "A tool kit for careful lettering, copying, and scribing.",
      data: { category: "tool", equipmentCategory: "tool", toolId: "calligraphers-supplies", ability: "dexterity", costGp: 10, weightLb: 5, source: DND_5E_SRD_VERSION }
    },
    {
      id: "thieves-tools",
      type: "item",
      name: "Thieves' Tools",
      summary: "A kit for lock work, trap disarming, and other delicate criminal tasks.",
      data: { category: "tool", equipmentCategory: "tool", toolId: "thieves-tools", ability: "dexterity", costGp: 25, weightLb: 1, source: DND_5E_SRD_VERSION }
    }
  ];
}

export function dnd5eSrdCompendiumEntry(entryId: string): GenericFantasyCompendiumEntry | undefined {
  return dnd5eSrdCompendium().find((entry) => entry.id === entryId);
}

const DND_5E_SRD_BACKGROUNDS: Dnd5eSrdCharacterBackground[] = [
  {
    id: "acolyte",
    name: "Acolyte",
    abilityScores: ["intelligence", "wisdom", "charisma"],
    feat: "Magic Initiate (Cleric)",
    skillProficiencies: ["insight", "religion"],
    toolProficiencies: ["calligraphers-supplies"],
    startingGp: 50,
    source: DND_5E_SRD_VERSION
  },
  {
    id: "criminal",
    name: "Criminal",
    abilityScores: ["dexterity", "constitution", "intelligence"],
    feat: "Alert",
    skillProficiencies: ["sleight-of-hand", "stealth"],
    toolProficiencies: ["thieves-tools"],
    startingGp: 50,
    source: DND_5E_SRD_VERSION
  },
  {
    id: "sage",
    name: "Sage",
    abilityScores: ["constitution", "intelligence", "wisdom"],
    feat: "Magic Initiate (Wizard)",
    skillProficiencies: ["arcana", "history"],
    toolProficiencies: ["calligraphers-supplies"],
    startingGp: 50,
    source: DND_5E_SRD_VERSION
  },
  {
    id: "soldier",
    name: "Soldier",
    abilityScores: ["strength", "dexterity", "constitution"],
    feat: "Savage Attacker",
    skillProficiencies: ["athletics", "intimidation"],
    toolProficiencies: ["gaming-set"],
    startingGp: 50,
    source: DND_5E_SRD_VERSION
  }
];

const DND_5E_SRD_SPECIES: Dnd5eSrdCharacterSpecies[] = [
  { id: "dragonborn", name: "Dragonborn", creatureType: "Humanoid", size: "Medium", speed: 30, traits: ["Draconic Ancestry", "Breath Weapon", "Damage Resistance", "Darkvision", "Draconic Flight"], senses: ["Darkvision 60 ft."], source: DND_5E_SRD_VERSION },
  { id: "dwarf", name: "Dwarf", creatureType: "Humanoid", size: "Medium", speed: 30, traits: ["Darkvision", "Dwarven Resilience", "Dwarven Toughness", "Stonecunning"], senses: ["Darkvision 120 ft."], source: DND_5E_SRD_VERSION },
  { id: "elf", name: "Elf", creatureType: "Humanoid", size: "Medium", speed: 30, traits: ["Darkvision", "Elven Lineage", "Fey Ancestry", "Keen Senses", "Trance"], senses: ["Darkvision 60 ft."], source: DND_5E_SRD_VERSION },
  { id: "gnome", name: "Gnome", creatureType: "Humanoid", size: "Small", speed: 30, traits: ["Darkvision", "Gnomish Cunning", "Gnomish Lineage"], senses: ["Darkvision 60 ft."], source: DND_5E_SRD_VERSION },
  { id: "goliath", name: "Goliath", creatureType: "Humanoid", size: "Medium", speed: 35, traits: ["Giant Ancestry", "Large Form", "Powerful Build"], source: DND_5E_SRD_VERSION },
  { id: "halfling", name: "Halfling", creatureType: "Humanoid", size: "Small", speed: 30, traits: ["Brave", "Halfling Nimbleness", "Luck", "Naturally Stealthy"], source: DND_5E_SRD_VERSION },
  { id: "human", name: "Human", creatureType: "Humanoid", size: "Medium or Small", speed: 30, traits: ["Resourceful", "Skillful", "Versatile"], source: DND_5E_SRD_VERSION },
  { id: "orc", name: "Orc", creatureType: "Humanoid", size: "Medium", speed: 30, traits: ["Adrenaline Rush", "Darkvision", "Relentless Endurance"], senses: ["Darkvision 120 ft."], source: DND_5E_SRD_VERSION },
  { id: "tiefling", name: "Tiefling", creatureType: "Humanoid", size: "Medium or Small", speed: 30, traits: ["Darkvision", "Fiendish Legacy", "Otherworldly Presence"], senses: ["Darkvision 60 ft."], source: DND_5E_SRD_VERSION }
];

export function dnd5eSrdCharacterOrigins(): Dnd5eSrdCharacterOrigins {
  return {
    backgrounds: DND_5E_SRD_BACKGROUNDS.map((background) => ({ ...background, abilityScores: [...background.abilityScores], skillProficiencies: [...background.skillProficiencies], toolProficiencies: [...background.toolProficiencies] })),
    species: DND_5E_SRD_SPECIES.map((species) => ({ ...species, traits: [...species.traits], senses: species.senses ? [...species.senses] : undefined }))
  };
}

export function dnd5eSrdApplyCharacterOrigins(template: CharacterTemplate, options: Dnd5eSrdCharacterOriginOptions = {}): Dnd5eSrdCharacterOriginBuild {
  if (template.systemId !== DND_5E_SRD_SYSTEM_ID) throw new Error("D&D SRD character origins can only be applied to D&D SRD templates");
  const background = dnd5eSrdBackgroundById(options.backgroundId ?? stringValue(template.data.background) ?? "soldier");
  if (!background) throw new Error("Unknown D&D SRD background");
  const species = dnd5eSrdSpeciesById(options.speciesId ?? stringValue(template.data.species) ?? "human");
  if (!species) throw new Error("Unknown D&D SRD species");
  const data = cloneJsonRecord(template.data);
  const proficiencyBonus = dnd5eSrdProficiencyBonusForLevel(numericValue(data.level, 1), data.proficiencyBonus);
  const features = new Set([...normalizeStringArray(data.features), ...species.traits]);
  const className = stringValue(data.class) || "Fighter";
  const level = numericValue(data.level, 1);
  const resources = normalizeDnd5eSrdResources(data.resources, className, level, data);
  for (const [resourceId, resource] of Object.entries(dnd5eSrdSpeciesResources(species, proficiencyBonus, level))) {
    resources[resourceId] = resource;
  }
  data.ruleset = DND_5E_SRD_VERSION;
  data.background = background.name;
  data.species = species.name;
  data.creatureType = species.creatureType;
  data.size = species.size;
  data.speed = species.speed;
  data.origin = {
    source: DND_5E_SRD_VERSION,
    backgroundId: background.id,
    speciesId: species.id
  };
  data.proficiencyBonus = proficiencyBonus;
  data.skillProficiencies = [...background.skillProficiencies];
  data.toolProficiencies = [...background.toolProficiencies];
  data.feats = [background.feat];
  data.currency = dnd5eSrdCurrency({ gp: background.startingGp });
  data.resources = resources;
  data.features = [...features];
  if (species.senses?.length) data.senses = [...species.senses];
  if (species.id === "dwarf") dnd5eSrdApplyDwarvenToughness(data, level);
  dnd5eSrdApplyAbilityScoreIncreases(data, background, options.abilityScoreIncreases);
  const originResources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  const bardicInspiration = originResources.bardicInspiration;
  if (bardicInspiration && numericValue(recordValue(resources.bardicInspiration).current, 0) === numericValue(recordValue(resources.bardicInspiration).max, 0)) {
    originResources.bardicInspiration = { ...bardicInspiration, current: bardicInspiration.max };
  }
  data.resources = originResources;
  return { data, items: template.items.map((item) => ({ ...item })), background: { ...background }, species: { ...species, traits: [...species.traits], senses: species.senses ? [...species.senses] : undefined } };
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
        hitDice: { current: 1, max: 1, size: "d10" },
        resources: { secondWind: { current: 1, max: 1, recovery: "short" } },
        spellSlots: {},
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
        hitDice: { current: 1, max: 1, size: "d8" },
        resources: { fieldPrayer: { current: 1, max: 1, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Field Prayer"]
      },
      items: [{ entryId: "healing-word" }, { entryId: "cure-wounds" }]
    }
  ];
}

export function dnd5eSrdCharacterTemplates(): CharacterTemplate[] {
  return [
    {
      id: "fighter",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Fighter",
      summary: "SRD 5.2.1 martial character using Strength, armor, and weapon attacks.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Fighter",
        species: "Human",
        background: "Soldier",
        proficiencyBonus: 2,
        hp: { current: 12, max: 12 },
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 12 },
        hitDice: { current: 1, max: 1, size: "d10" },
        saveProficiencies: ["strength", "constitution"],
        skillProficiencies: ["athletics", "intimidation"],
        toolProficiencies: ["gaming-set"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { secondWind: { current: 2, max: 2, recovery: "short" } },
        spellSlots: {},
        conditions: [],
        features: ["Fighting Style", "Second Wind"],
        feats: ["Savage Attacker"]
      },
      items: [{ entryId: "longsword" }]
    },
    {
      id: "barbarian",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Barbarian",
      summary: "SRD 5.2.1 frontline warrior with Rage and Strength-based weapon attacks.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Barbarian",
        species: "Human",
        background: "Soldier",
        proficiencyBonus: 2,
        hp: { current: 14, max: 14 },
        attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d12" },
        saveProficiencies: ["strength", "constitution"],
        skillProficiencies: ["athletics", "intimidation"],
        toolProficiencies: ["gaming-set"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { rage: { current: 2, max: 2, recovery: "short" } },
        spellSlots: {},
        conditions: [],
        features: ["Rage", "Unarmored Defense", "Weapon Mastery"],
        feats: ["Savage Attacker"]
      },
      items: [{ entryId: "spear" }]
    },
    {
      id: "bard",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Bard",
      summary: "SRD 5.2.1 support spellcaster with Bardic Inspiration and skill flexibility.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Bard",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 10, max: 10 },
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 10, charisma: 16 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["dexterity", "charisma"],
        skillProficiencies: ["performance", "persuasion", "perception"],
        toolProficiencies: ["gaming-set"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { bardicInspiration: { current: 3, max: 3, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Bardic Inspiration", "Spellcasting"],
        feats: []
      },
      items: [{ entryId: "healing-word" }, { entryId: "dagger" }]
    },
    {
      id: "cleric",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Cleric",
      summary: "SRD 5.2.1 divine spellcaster with prepared healing magic.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 9, max: 9 },
        attributes: { strength: 10, dexterity: 12, constitution: 12, intelligence: 13, wisdom: 16, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["wisdom", "charisma"],
        skillProficiencies: ["medicine", "religion"],
        toolProficiencies: ["calligraphers-supplies"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: {},
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Spellcasting", "Divine Order"],
        feats: ["Magic Initiate"]
      },
      items: [{ entryId: "healing-word" }, { entryId: "cure-wounds" }]
    },
    {
      id: "paladin",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Paladin",
      summary: "SRD 5.2.1 holy warrior with Lay On Hands, spellcasting, and Divine Smite.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Paladin",
        species: "Human",
        background: "Soldier",
        proficiencyBonus: 2,
        hp: { current: 12, max: 12 },
        attributes: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 12, charisma: 14 },
        hitDice: { current: 1, max: 1, size: "d10" },
        saveProficiencies: ["wisdom", "charisma"],
        skillProficiencies: ["athletics", "persuasion"],
        toolProficiencies: ["gaming-set"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { layOnHands: { current: 5, max: 5, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
        feats: ["Savage Attacker"]
      },
      items: [{ entryId: "longsword" }, { entryId: "cure-wounds" }]
    },
    {
      id: "druid",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Druid",
      summary: "SRD 5.2.1 primal spellcaster with Wild Shape and nature magic.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Druid",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 10, max: 10 },
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 16, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["intelligence", "wisdom"],
        skillProficiencies: ["nature", "survival"],
        toolProficiencies: ["calligraphers-supplies"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: {},
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Spellcasting", "Druidic", "Primal Order"],
        feats: ["Magic Initiate"]
      },
      items: [{ entryId: "cure-wounds" }, { entryId: "quarterstaff" }]
    },
    {
      id: "ranger",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Ranger",
      summary: "SRD 5.2.1 wilderness warrior with Favored Enemy, Hunter's Mark, and Wisdom spellcasting.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Ranger",
        species: "Human",
        background: "Soldier",
        proficiencyBonus: 2,
        hp: { current: 12, max: 12 },
        attributes: { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d10" },
        saveProficiencies: ["strength", "dexterity"],
        skillProficiencies: ["nature", "perception", "survival"],
        toolProficiencies: ["gaming-set"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { favoredEnemy: { current: 2, max: 2, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
        feats: ["Savage Attacker"]
      },
      items: [{ entryId: "hunters-mark" }, { entryId: "cure-wounds" }, { entryId: "longbow" }, { entryId: "scimitar" }, { entryId: "shortsword" }, { entryId: "studded-leather-armor" }]
    },
    {
      id: "monk",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Monk",
      summary: "SRD 5.2.1 unarmored martial artist with Martial Arts and Focus-powered combat techniques.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Monk",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 10, max: 10 },
        attributes: { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["strength", "dexterity"],
        skillProficiencies: ["acrobatics", "stealth"],
        toolProficiencies: ["musical-instrument"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: {},
        spellSlots: {},
        conditions: [],
        features: ["Martial Arts", "Unarmored Defense"],
        feats: ["Magic Initiate"]
      },
      items: [{ entryId: "spear" }, { entryId: "dagger", quantity: 5 }, { entryId: "musical-instrument" }]
    },
    {
      id: "sorcerer",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Sorcerer",
      summary: "SRD 5.2.1 Charisma spellcaster with Innate Sorcery and Sorcery Point flexibility.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Sorcerer",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 8, max: 8 },
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 16 },
        hitDice: { current: 1, max: 1, size: "d6" },
        saveProficiencies: ["constitution", "charisma"],
        skillProficiencies: ["arcana", "persuasion"],
        toolProficiencies: ["calligraphers-supplies"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { innateSorcery: { current: 2, max: 2, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Spellcasting", "Innate Sorcery"],
        feats: []
      },
      items: [{ entryId: "sorcerous-burst" }, { entryId: "chromatic-orb" }, { entryId: "shield" }, { entryId: "spear" }, { entryId: "dagger", quantity: 2 }, { entryId: "arcane-focus" }]
    },
    {
      id: "warlock",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Warlock",
      summary: "SRD 5.2.1 Charisma pact caster with Eldritch Invocations and Short Rest Pact Magic.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Warlock",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 10, max: 10 },
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 10, charisma: 16 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["wisdom", "charisma"],
        skillProficiencies: ["arcana", "intimidation"],
        toolProficiencies: ["calligraphers-supplies"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: {},
        spellSlots: { level1: { current: 1, max: 1, recovery: "short" } },
        conditions: [],
        features: ["Eldritch Invocations", "Pact Magic"],
        feats: []
      },
      items: [{ entryId: "eldritch-blast" }, { entryId: "hex" }, { entryId: "leather-armor" }, { entryId: "sickle" }, { entryId: "dagger", quantity: 2 }, { entryId: "arcane-focus" }]
    },
    {
      id: "wizard",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Wizard",
      summary: "SRD 5.2.1 arcane spellcaster with cantrip damage and defensive magic.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Wizard",
        species: "Human",
        background: "Sage",
        proficiencyBonus: 2,
        hp: { current: 8, max: 8 },
        attributes: { strength: 8, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 12, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d6" },
        saveProficiencies: ["intelligence", "wisdom"],
        skillProficiencies: ["arcana", "history"],
        toolProficiencies: ["calligraphers-supplies"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: { arcaneRecovery: { current: 1, max: 1, recovery: "long" } },
        spellSlots: { level1: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        features: ["Spellcasting", "Arcane Recovery"],
        feats: []
      },
      items: [{ entryId: "fire-bolt" }, { entryId: "shield" }]
    },
    {
      id: "rogue",
      systemId: DND_5E_SRD_SYSTEM_ID,
      name: "Rogue",
      summary: "SRD 5.2.1 skill expert with Sneak Attack and mobile weapon damage.",
      actorType: "character",
      data: {
        ruleset: DND_5E_SRD_VERSION,
        level: 1,
        class: "Rogue",
        species: "Human",
        background: "Criminal",
        proficiencyBonus: 2,
        hp: { current: 10, max: 10 },
        attributes: { strength: 10, dexterity: 16, constitution: 14, intelligence: 12, wisdom: 12, charisma: 10 },
        hitDice: { current: 1, max: 1, size: "d8" },
        saveProficiencies: ["dexterity", "intelligence"],
        skillProficiencies: ["acrobatics", "sleight-of-hand", "stealth", "perception"],
        skillExpertise: ["stealth", "sleight-of-hand"],
        toolProficiencies: ["thieves-tools"],
        currency: { gp: 50, sp: 0, cp: 0 },
        resources: {},
        spellSlots: {},
        conditions: [],
        features: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
        feats: ["Alert"]
      },
      items: [{ entryId: "dagger" }, { entryId: "shortbow" }]
    }
  ];
}

export function genericFantasyCharacterTemplate(templateId: string): CharacterTemplate | undefined {
  return genericFantasyCharacterTemplates().find((template) => template.id === templateId);
}

export function dnd5eSrdCharacterTemplate(templateId: string): CharacterTemplate | undefined {
  return dnd5eSrdCharacterTemplates().find((template) => template.id === templateId);
}

export function genericFantasyCharacterImport(input: CharacterImportInput): CharacterImportResult {
  const source = importSource(input);
  const level = clampInteger(source.level, 1, 20, 1);
  const className = stringValue(source.class) || "Adventurer";
  const attributes = normalizeNumberRecord(source.attributes, { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 });
  const conModifier = abilityModifier(attributes.constitution ?? 10);
  const defaultMaxHp = Math.max(1, 8 + conModifier + (level - 1) * 5);
  const hp = normalizePool(source.hp, defaultMaxHp);
  const defaultHitDieSize = className === "Mender" ? "d8" : "d10";
  const sourceHitDice = recordValue(source.hitDice);
  const warnings: string[] = [];
  const conditions = normalizeImportConditions(source.conditions ?? input.conditions, genericFantasyCompendiumEntry, warnings);
  const items = normalizeImportItems(source.items ?? input.items, genericFantasyCompendiumEntry, warnings, conditions);
  return {
    systemId: "generic-fantasy",
    actorType: "character",
    name: stringValue(input.name) || stringValue(source.name) || "Imported Adventurer",
    data: {
      level,
      class: className,
      hp,
      attributes,
      hitDice: { ...sourceHitDice, ...normalizePool(source.hitDice, level), size: stringValue(sourceHitDice.size) ?? defaultHitDieSize },
      resources: normalizeResourcePools(source.resources, defaultGenericFantasyResources(className)),
      spellSlots: normalizeResourcePools(source.spellSlots, defaultGenericFantasySpellSlots(className, level)),
      conditions: conditions.map((id) => ({ id })),
      features: normalizeStringArray(source.features)
    },
    items,
    warnings
  };
}

export function dnd5eSrdCharacterImport(input: CharacterImportInput): CharacterImportResult {
  const source = importSource(input);
  const imported = genericFantasyCharacterImport(input);
  const warnings: string[] = [];
  const conditions = normalizeImportConditions(source.conditions ?? input.conditions, dnd5eSrdCompendiumEntry, warnings);
  const items = normalizeImportItems(source.items ?? input.items, dnd5eSrdCompendiumEntry, warnings, conditions);
  const level = numericValue(imported.data.level, 1);
  const className = stringValue(source.class) || "Fighter";
  const sourceHitDice = recordValue(source.hitDice);
  return {
    ...imported,
    systemId: DND_5E_SRD_SYSTEM_ID,
    name: stringValue(input.name) || stringValue(source.name) || "Imported SRD Character",
    data: {
      ...imported.data,
      ruleset: DND_5E_SRD_VERSION,
      class: className,
      species: stringValue(source.species) || "Human",
      background: stringValue(source.background) || "Soldier",
      proficiencyBonus: dnd5eSrdProficiencyBonusForLevel(level, source.proficiencyBonus),
      hitDice: { ...recordValue(imported.data.hitDice), size: stringValue(sourceHitDice.size) ?? dnd5eSrdHitDieSize(className) },
      saveProficiencies: dnd5eSrdSaveProficienciesForClass(className, source.saveProficiencies),
      skillProficiencies: dnd5eSrdSkillProficienciesForClass(className, source.skillProficiencies),
      skillExpertise: dnd5eSrdSkillProficienciesFromExplicit(source.skillExpertise),
      toolProficiencies: dnd5eSrdToolProficienciesForBackground(stringValue(source.background) || "Soldier", source.toolProficiencies),
      toolExpertise: dnd5eSrdToolProficienciesFromExplicit(source.toolExpertise),
      currency: dnd5eSrdCurrency(source.currency),
      resources: normalizeDnd5eSrdResources(source.resources, className, level, imported.data),
      spellSlots: normalizeDnd5eSrdSpellSlots(source.spellSlots, className, level),
      conditions: conditions.map((id) => ({ id })),
      features: dnd5eSrdApplyClassFeatures(normalizeStringArray(source.features), className, level)
    },
    items,
    warnings
  };
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

const DND_5E_SRD_MONSTER_STAT_BLOCKS: Record<string, Dnd5eSrdMonsterStatBlock> = {
  bandit: {
    source: DND_5E_SRD_VERSION,
    size: "Medium or Small",
    creatureType: "Humanoid",
    alignment: "Neutral",
    armorClass: 12,
    initiative: 1,
    hitPoints: 11,
    hitDice: "2d8+2",
    speed: "30 ft.",
    challengeRating: "1/8",
    xp: 25,
    proficiencyBonus: 2,
    abilities: { strength: 11, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
    saves: { strength: 0, dexterity: 1, constitution: 1, intelligence: 0, wisdom: 0, charisma: 0 },
    senses: ["Passive Perception 10"],
    languages: ["Common", "Thieves' Cant"],
    gear: ["Leather Armor", "Light Crossbow", "Scimitar"],
    actions: [
      { name: "Scimitar", kind: "action", attackBonus: 3, range: "reach 5 ft.", damageFormula: "1d6+1", damageType: "slashing" },
      { name: "Light Crossbow", kind: "action", attackBonus: 3, range: "80/320 ft.", damageFormula: "1d8+1", damageType: "piercing" }
    ]
  },
  "goblin-warrior": {
    source: DND_5E_SRD_VERSION,
    size: "Small",
    creatureType: "Fey (Goblinoid)",
    alignment: "Chaotic Neutral",
    armorClass: 15,
    initiative: 2,
    hitPoints: 10,
    hitDice: "3d6",
    speed: "30 ft.",
    challengeRating: "1/4",
    xp: 50,
    proficiencyBonus: 2,
    abilities: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
    saves: { strength: -1, dexterity: 2, constitution: 0, intelligence: 0, wisdom: -1, charisma: -1 },
    skills: { stealth: 6 },
    senses: ["Darkvision 60 ft.", "Passive Perception 9"],
    languages: ["Common", "Goblin"],
    gear: ["Scimitar", "Shortbow"],
    traits: [{ name: "Nimble Escape", summary: "Can disengage or hide as a bonus action." }],
    actions: [
      { name: "Scimitar", kind: "action", attackBonus: 4, range: "reach 5 ft.", damageFormula: "1d6+2", damageType: "slashing" },
      { name: "Shortbow", kind: "action", attackBonus: 4, range: "80/320 ft.", damageFormula: "1d6+2", damageType: "piercing" },
      { name: "Nimble Escape", kind: "bonusAction", summary: "Disengage or Hide." }
    ]
  },
  "goblin-boss": {
    source: DND_5E_SRD_VERSION,
    size: "Small",
    creatureType: "Fey (Goblinoid)",
    alignment: "Chaotic Neutral",
    armorClass: 17,
    initiative: 2,
    hitPoints: 21,
    hitDice: "6d6",
    speed: "30 ft.",
    challengeRating: "1",
    xp: 200,
    proficiencyBonus: 2,
    abilities: { strength: 10, dexterity: 15, constitution: 10, intelligence: 10, wisdom: 8, charisma: 10 },
    saves: { strength: 0, dexterity: 2, constitution: 0, intelligence: 0, wisdom: -1, charisma: 0 },
    skills: { stealth: 6 },
    senses: ["Darkvision 60 ft.", "Passive Perception 9"],
    languages: ["Common", "Goblin"],
    gear: ["Chain Shirt", "Scimitar", "Shield", "Shortbow"],
    traits: [{ name: "Nimble Escape", summary: "Can disengage or hide as a bonus action." }],
    actions: [
      { name: "Multiattack", kind: "action", summary: "Makes two Scimitar or Shortbow attacks." },
      { name: "Scimitar", kind: "action", attackBonus: 4, range: "reach 5 ft.", damageFormula: "1d6+2", damageType: "slashing" },
      { name: "Shortbow", kind: "action", attackBonus: 4, range: "80/320 ft.", damageFormula: "1d6+2", damageType: "piercing" },
      { name: "Nimble Escape", kind: "bonusAction", summary: "Disengage or Hide." },
      { name: "Redirect Attack", kind: "reaction", summary: "Can swap with a nearby ally targeted by an attack." }
    ]
  },
  tough: {
    source: DND_5E_SRD_VERSION,
    size: "Medium or Small",
    creatureType: "Humanoid",
    alignment: "Neutral",
    armorClass: 12,
    initiative: 1,
    hitPoints: 32,
    hitDice: "5d8+10",
    speed: "30 ft.",
    challengeRating: "1/2",
    xp: 100,
    proficiencyBonus: 2,
    abilities: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 11 },
    saves: { strength: 2, dexterity: 1, constitution: 2, intelligence: 0, wisdom: 0, charisma: 0 },
    senses: ["Passive Perception 10"],
    languages: ["Common"],
    gear: ["Heavy Crossbow", "Leather Armor", "Mace"],
    traits: [{ name: "Pack Tactics", summary: "Has advantage when an ally threatens the target nearby." }],
    actions: [
      { name: "Mace", kind: "action", attackBonus: 4, range: "reach 5 ft.", damageFormula: "1d6+2", damageType: "bludgeoning" },
      { name: "Heavy Crossbow", kind: "action", attackBonus: 3, range: "100/400 ft.", damageFormula: "1d10+1", damageType: "piercing" }
    ]
  },
  "hobgoblin-captain": {
    source: DND_5E_SRD_VERSION,
    size: "Medium",
    creatureType: "Fey (Goblinoid)",
    alignment: "Lawful Evil",
    armorClass: 17,
    initiative: 4,
    hitPoints: 58,
    hitDice: "9d8+18",
    speed: "30 ft.",
    challengeRating: "3",
    xp: 700,
    proficiencyBonus: 2,
    abilities: { strength: 15, dexterity: 14, constitution: 14, intelligence: 12, wisdom: 10, charisma: 13 },
    saves: { strength: 2, dexterity: 2, constitution: 2, intelligence: 1, wisdom: 0, charisma: 1 },
    senses: ["Darkvision 60 ft.", "Passive Perception 10"],
    languages: ["Common", "Goblin"],
    gear: ["Greatsword", "Half-Plate Armor", "Longbow"],
    traits: [{ name: "Pack Tactics", summary: "Pairs well with lower-CR allies in a mixed encounter." }],
    actions: [{ name: "Multiattack", kind: "action", summary: "Makes multiple weapon attacks." }]
  },
  "tough-boss": {
    source: DND_5E_SRD_VERSION,
    size: "Medium or Small",
    creatureType: "Humanoid",
    alignment: "Neutral",
    armorClass: 16,
    initiative: 2,
    hitPoints: 82,
    hitDice: "11d8+33",
    speed: "30 ft.",
    challengeRating: "4",
    xp: 1100,
    proficiencyBonus: 2,
    abilities: { strength: 17, dexterity: 14, constitution: 16, intelligence: 11, wisdom: 10, charisma: 11 },
    saves: { strength: 5, dexterity: 2, constitution: 5, intelligence: 0, wisdom: 0, charisma: 2 },
    senses: ["Passive Perception 10"],
    languages: ["Common plus one other language"],
    gear: ["Chain Mail", "Heavy Crossbow", "Warhammer"],
    traits: [{ name: "Pack Tactics", summary: "Has advantage when an ally threatens the target nearby." }],
    actions: [
      { name: "Multiattack", kind: "action", summary: "Makes two Warhammer or Heavy Crossbow attacks." },
      { name: "Warhammer", kind: "action", attackBonus: 5, range: "reach 5 ft.", damageFormula: "2d8+3", damageType: "bludgeoning" },
      { name: "Heavy Crossbow", kind: "action", attackBonus: 4, range: "100/400 ft.", damageFormula: "2d10+2", damageType: "piercing" }
    ]
  }
};

function dnd5eSrdMonsterThreat(id: string, name: string, role: string, summary: string): EncounterThreat {
  const statBlock = DND_5E_SRD_MONSTER_STAT_BLOCKS[id];
  if (!statBlock) throw new Error(`Unknown SRD monster stat block: ${id}`);
  return {
    id,
    systemId: DND_5E_SRD_SYSTEM_ID,
    name,
    summary,
    role,
    budget: statBlock.xp,
    challengeRating: statBlock.challengeRating,
    data: { ...statBlock }
  };
}

export function dnd5eSrdMonsterActorData(threatId: string): Record<string, unknown> | undefined {
  const threat = dnd5eSrdEncounterThreats().find((item) => item.id === threatId);
  if (!threat) return undefined;
  const statBlock = recordValue(threat.data);
  return {
    ruleset: DND_5E_SRD_VERSION,
    level: numericValue(threat.challengeRating, 1),
    monster: {
      threatId: threat.id,
      role: threat.role,
      summary: threat.summary,
      statBlock
    },
    hp: { current: numericValue(statBlock.hitPoints, 1), max: numericValue(statBlock.hitPoints, 1) },
    armorClass: numericValue(statBlock.armorClass, 10),
    initiative: numericValue(statBlock.initiative, 0),
    challengeRating: stringValue(statBlock.challengeRating) ?? threat.challengeRating,
    xp: numericValue(statBlock.xp, threat.budget),
    proficiencyBonus: numericValue(statBlock.proficiencyBonus, 2),
    attributes: recordValue(statBlock.abilities),
    saveProficiencies: [],
    skillProficiencies: Object.keys(recordValue(statBlock.skills)),
    toolProficiencies: [],
    conditions: []
  };
}

export function dnd5eSrdEncounterThreats(): EncounterThreat[] {
  return [
    dnd5eSrdMonsterThreat("bandit", "Bandit", "skirmisher", "Low-CR humanoid threat for urban, roadside, and pirate encounters."),
    dnd5eSrdMonsterThreat("goblin-warrior", "Goblin Warrior", "skirmisher", "Low-level goblinoid attacker with stealth and bonus-action escape pressure."),
    { ...dnd5eSrdMonsterThreat("goblin-warrior", "Goblin Minion", "minion", "Backward-compatible goblin threat alias for existing encounter drafts."), id: "goblin-minion" },
    dnd5eSrdMonsterThreat("tough", "Tough", "brute", "Durable low-level humanoid threat that benefits from allies nearby."),
    dnd5eSrdMonsterThreat("goblin-boss", "Goblin Boss", "leader", "Command threat for low-level SRD encounters with multiattack and ally redirection."),
    dnd5eSrdMonsterThreat("hobgoblin-captain", "Hobgoblin Captain", "captain", "Disciplined martial SRD threat for organized goblinoid forces."),
    dnd5eSrdMonsterThreat("tough-boss", "Tough Boss", "boss", "Durable SRD boss threat for a resource-spending fight.")
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

export function dnd5eSrdEncounterPlan(party: Actor[], selections: EncounterThreatSelection[]): EncounterPlan {
  const difficultyBudgets = dnd5eSrdEncounterXpBudgets(party);
  return buildEncounterPlan({
    systemId: DND_5E_SRD_SYSTEM_ID,
    partyRating: difficultyBudgets.hard || 100,
    threats: dnd5eSrdEncounterThreats(),
    selections,
    difficultyBudgets,
    difficultyForBudget: (budget) => dnd5eSrdEncounterDifficulty(budget, difficultyBudgets),
    budgetLabel: "XP"
  });
}

const DND_5E_SRD_ENCOUNTER_XP_BUDGETS_BY_LEVEL: Record<number, { easy: number; standard: number; hard: number }> = {
  1: { easy: 50, standard: 75, hard: 100 },
  2: { easy: 100, standard: 150, hard: 200 },
  3: { easy: 150, standard: 225, hard: 400 },
  4: { easy: 250, standard: 375, hard: 500 },
  5: { easy: 500, standard: 750, hard: 1100 },
  6: { easy: 600, standard: 1000, hard: 1400 },
  7: { easy: 750, standard: 1300, hard: 1700 },
  8: { easy: 1000, standard: 1700, hard: 2100 },
  9: { easy: 1300, standard: 2000, hard: 2600 },
  10: { easy: 1600, standard: 2300, hard: 3100 },
  11: { easy: 1900, standard: 2900, hard: 4100 },
  12: { easy: 2200, standard: 3700, hard: 4700 },
  13: { easy: 2600, standard: 4200, hard: 5400 },
  14: { easy: 2900, standard: 4900, hard: 6200 },
  15: { easy: 3300, standard: 5400, hard: 7800 },
  16: { easy: 3800, standard: 6100, hard: 9800 },
  17: { easy: 4500, standard: 7200, hard: 11700 },
  18: { easy: 5000, standard: 8700, hard: 14200 },
  19: { easy: 5500, standard: 10700, hard: 17200 },
  20: { easy: 6400, standard: 13200, hard: 22000 }
};

export function dnd5eSrdEncounterXpBudgets(party: Actor[]): { easy: number; standard: number; hard: number } {
  const levels = party.length > 0 ? party.map((actor) => numericValue(actor.data.level, 1)) : [1];
  return levels.reduce(
    (total, levelValue) => {
      const level = Math.min(20, Math.max(1, Math.floor(levelValue)));
      const budget = DND_5E_SRD_ENCOUNTER_XP_BUDGETS_BY_LEVEL[level] ?? DND_5E_SRD_ENCOUNTER_XP_BUDGETS_BY_LEVEL[1]!;
      return {
        easy: total.easy + budget.easy,
        standard: total.standard + budget.standard,
        hard: total.hard + budget.hard
      };
    },
    { easy: 0, standard: 0, hard: 0 }
  );
}

function dnd5eSrdEncounterDifficulty(threatBudget: number, budgets: { easy: number; standard: number; hard: number }): EncounterPlan["difficulty"] {
  if (threatBudget <= 0 || threatBudget < budgets.easy) return "trivial";
  if (threatBudget < budgets.standard) return "easy";
  if (threatBudget < budgets.hard) return "standard";
  if (threatBudget <= budgets.hard) return "hard";
  return "deadly";
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

export function dnd5eSrdAdvancementOptions(actor: Actor): AdvancementOption[] {
  return genericFantasyAdvancementOptions(actor).map((option) => ({
    ...option,
    systemId: DND_5E_SRD_SYSTEM_ID,
    summary: "Increase level, hit point maximum, proficiency bonus, and a class ability for SRD 5.2.1 play."
  }));
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
  const hitDice = actor.data.hitDice as { current?: number; max?: number; size?: string } | undefined;
  const spellSlots = normalizeResourcePools(actor.data.spellSlots, defaultGenericFantasySpellSlots(className, option.nextValue), { raiseMaxToDefault: true });
  const resources = normalizeResourcePools(actor.data.resources, defaultGenericFantasyResources(className));
  return {
    ...actor.data,
    level: option.nextValue,
    hp: {
      current: numericValue(hp?.current, numericValue(hp?.max, 10)) + 5,
      max: numericValue(hp?.max, 10) + 5
    },
    hitDice: {
      current: numericValue(hitDice?.current, numericValue(hitDice?.max, 1)) + 1,
      max: numericValue(hitDice?.max, 1) + 1,
      size: stringValue(hitDice?.size) ?? (className === "Mender" ? "d8" : "d10")
    },
    resources,
    spellSlots,
    attributes,
    proficiencyBonus: Math.max(2, 2 + Math.floor((option.nextValue - 1) / 4)),
    features
  };
}

export function applyDnd5eSrdAdvancement(actor: Actor, optionId: string): Record<string, unknown> {
  const next = applyGenericFantasyAdvancement(actor, optionId);
  const className = typeof actor.data.class === "string" ? actor.data.class : "Fighter";
  const genericPrimary = className === "Mender" ? "wisdom" : "strength";
  const srdPrimary = dnd5eSrdPrimaryAbility(className);
  const attributes = { ...((next.attributes as Record<string, number> | undefined) ?? {}) };
  if (srdPrimary !== genericPrimary) {
    attributes[genericPrimary] = numericValue(attributes[genericPrimary], 10) - 1;
    attributes[srdPrimary] = numericValue(attributes[srdPrimary], 10) + 1;
  }
  const level = numericValue(next.level, numericValue(actor.data.level, 1) + 1);
  const hitDice = recordValue(next.hitDice);
  const features = dnd5eSrdApplyClassFeatures(normalizeStringArray(next.features), className, level);
  const combat = dnd5eSrdApplyClassCombat(recordValue(next.combat), className, level, next.speed);
  const nextWithSrdAttributes = { ...next, attributes };
  const advanced = {
    ...next,
    ruleset: DND_5E_SRD_VERSION,
    attributes,
    hitDice: { ...hitDice, size: stringValue(hitDice.size) ?? dnd5eSrdHitDieSize(className) },
    features,
    combat,
    resources: normalizeDnd5eSrdResources(next.resources, className, level, nextWithSrdAttributes, { raiseMaxToDefault: true }),
    spellSlots: normalizeDnd5eSrdSpellSlots(next.spellSlots, className, level, { raiseMaxToDefault: true })
  };
  if (dnd5eSrdHasDwarvenToughnessData(actor.data)) dnd5eSrdApplyDwarvenToughness(advanced, 1);
  return advanced;
}

export function applyGenericFantasyRest(actor: Actor, restType: SystemRestType): SystemRestResult {
  const hp = normalizePool(actor.data.hp, 1);
  const hitDiceRecord = recordValue(actor.data.hitDice);
  const hitDice = normalizePool(actor.data.hitDice, numericValue(actor.data.level, 1));
  const hitDieSize = stringValue(hitDiceRecord.size) ?? "d8";
  const resources = recoverResourcePools(actor.data.resources, restType);
  const spellSlots = restType === "long" ? recoverResourcePools(actor.data.spellSlots, "long") : { value: normalizeResourcePools(actor.data.spellSlots), recovered: {} };
  const recovered: Record<string, unknown> = {};
  let nextHp = hp;
  let nextHitDice = { ...hitDice, size: hitDieSize };
  if (restType === "short" && hp.current < hp.max && hitDice.current > 0) {
    const healAmount = Math.min(hp.max - hp.current, Math.max(1, averageHitDie(hitDieSize) + genericFantasyAttributeModifier(actor, "constitution")));
    nextHp = { ...hp, current: hp.current + healAmount };
    nextHitDice = { ...nextHitDice, current: hitDice.current - 1 };
    recovered.hp = healAmount;
    recovered.hitDiceSpent = 1;
  }
  if (restType === "long") {
    nextHp = { ...hp, current: hp.max };
    nextHitDice = { ...nextHitDice, current: Math.min(hitDice.max, hitDice.current + Math.max(1, Math.ceil(hitDice.max / 2))) };
    recovered.hp = Math.max(0, nextHp.current - hp.current);
    recovered.hitDiceRecovered = nextHitDice.current - hitDice.current;
  }
  const conditionUpdate = conditionsAfterRest(actor, genericFantasyCompendiumEntry, restType);
  const data = {
    ...actor.data,
    hp: nextHp,
    hitDice: nextHitDice,
    resources: resources.value,
    spellSlots: spellSlots.value,
    conditions: conditionUpdate.conditions
  };
  return {
    systemId: "generic-fantasy",
    actorId: actor.id,
    restType,
    summary: `${actor.name} completed a ${restType} rest`,
    recovered: { ...recovered, resources: resources.recovered, spellSlots: spellSlots.recovered },
    removedConditions: conditionUpdate.removed,
    data
  };
}

export function applyDnd5eSrdRest(actor: Actor, restType: SystemRestType, options: SystemRestOptions = {}): SystemRestResult {
  const rest = applyGenericFantasyRest(actor, restType);
  const className = stringValue(actor.data.class) || "";
  const level = numericValue(actor.data.level, 1);
  const dataWithDefaults = {
    ...rest.data,
    resources: normalizeDnd5eSrdResources(rest.data.resources, className, level, actor.data, { raiseMaxToDefault: true }),
    spellSlots: normalizeDnd5eSrdSpellSlots(rest.data.spellSlots, className, level, { raiseMaxToDefault: true })
  };
  const dataAfterRestLimits = restType === "short" ? dnd5eSrdApplyShortRestResourceLimits(actor, dataWithDefaults) : dnd5eSrdApplyLongRestResourceLimits(actor, dataWithDefaults);
  const pactMagic = dnd5eSrdApplyPactMagicRecovery(actor, dataAfterRestLimits, restType);
  const arcaneRecovery = dnd5eSrdApplyArcaneRecovery(actor, pactMagic.data, restType, options);
  const sorcerousRestoration = dnd5eSrdApplySorcerousRestoration(actor, arcaneRecovery.data, restType);
  const recovered = dnd5eSrdRestRecovered(
    actor,
    sorcerousRestoration.data,
    {
      ...rest.recovered,
      ...(pactMagic.recovered ?? {}),
      ...(arcaneRecovery.recovered ?? {}),
      ...(sorcerousRestoration.recovered ?? {})
    }
  );
  return {
    ...rest,
    systemId: DND_5E_SRD_SYSTEM_ID,
    summary: `${actor.name} completed a ${restType} rest using ${DND_5E_SRD_VERSION}`,
    recovered,
    data: sorcerousRestoration.data
  };
}

export function genericFantasySheet(actor: Actor, items: Item[] = []): GenericFantasySheet {
  return {
    actorId: actor.id,
    summary: summarizeActor(actor),
    data: actor.data,
    quickRolls: genericFantasyQuickRolls(actor, items),
    conditions: genericFantasyActorConditions(actor),
    inventory: items.filter((item) => item.actorId === actor.id && item.type !== "spell"),
    spells: items.filter((item) => item.actorId === actor.id && item.type === "spell")
  };
}

export function dnd5eSrdSheet(actor: Actor, items: Item[] = []): GenericFantasySheet {
  const sheet = genericFantasySheet(actor, items);
  const existingArmorClass = numericValue(actor.data.armorClass, Number.NaN);
  const armorClassDetails = dnd5eSrdArmorClass(actor, items);
  return {
    ...sheet,
    data: Number.isFinite(existingArmorClass) ? sheet.data : { ...sheet.data, armorClass: armorClassDetails.value, armorClassDetails },
    quickRolls: dnd5eSrdQuickRolls(actor, items),
    conditions: dnd5eSrdActorConditions(actor)
  };
}

export function dnd5eSrdArmorClass(actor: Actor, items: Item[] = []): Dnd5eSrdArmorClassDetails {
  const dexModifier = genericFantasyAttributeModifier(actor, "dexterity");
  const wisdomModifier = genericFantasyAttributeModifier(actor, "wisdom");
  const strengthScore = numericValue(recordValue(actor.data.attributes).strength, 10);
  const actorItems = items.filter((item) => itemBelongsToActor(actor, item)).filter((item) => itemQuantity(recordValue(item.data)) > 0);
  const hasEquippedArmor = actorItems.some((item) => {
    const data = recordValue(item.data);
    return data.equipped !== false && Number.isFinite(numericValue(data.armorBase, Number.NaN));
  });
  const hasEquippedShield = actorItems.some((item) => {
    const data = recordValue(item.data);
    return data.equipped !== false && Number.isFinite(numericValue(data.armorBonus, Number.NaN));
  });
  const armorCandidates: Dnd5eSrdArmorClassDetails[] = [
    {
      value: 10 + dexModifier,
      base: 10,
      dexModifier,
      armorName: "Unarmored",
      shieldBonus: 0,
      shieldItemIds: [],
      stealthDisadvantage: false,
      speedPenalty: 0
    }
  ];
  if (stringValue(actor.data.class) === "Monk" && !hasEquippedArmor && !hasEquippedShield) {
    armorCandidates.push({
      value: 10 + dexModifier + wisdomModifier,
      base: 10,
      dexModifier,
      armorName: "Unarmored Defense",
      shieldBonus: 0,
      shieldItemIds: [],
      stealthDisadvantage: false,
      speedPenalty: 0
    });
  }
  for (const item of actorItems) {
    const data = recordValue(item.data);
    if (data.equipped === false) continue;
    const armorBase = numericValue(data.armorBase, Number.NaN);
    if (!Number.isFinite(armorBase)) continue;
    const dexContribution = data.dexBonus === false ? 0 : Math.min(dexModifier, numericValue(data.dexCap, dexModifier));
    const strengthRequirement = numericValue(data.strengthRequirement, Number.NaN);
    const hasStrengthRequirement = Number.isFinite(strengthRequirement);
    armorCandidates.push({
      value: armorBase + dexContribution,
      base: armorBase,
      dexModifier: dexContribution,
      armorName: item.name,
      armorItemId: item.id,
      shieldBonus: 0,
      shieldItemIds: [],
      stealthDisadvantage: booleanValue(data.stealthDisadvantage),
      strengthRequirement: hasStrengthRequirement ? strengthRequirement : undefined,
      speedPenalty: hasStrengthRequirement && strengthScore < strengthRequirement ? -10 : 0
    });
  }
  const armor = armorCandidates.sort((left, right) => right.value - left.value)[0]!;
  const shieldItems = actorItems.filter((item) => {
    const data = recordValue(item.data);
    return data.equipped !== false && Number.isFinite(numericValue(data.armorBonus, Number.NaN));
  });
  const shieldBonus = shieldItems.reduce((max, item) => Math.max(max, numericValue(recordValue(item.data).armorBonus, 0)), 0);
  return {
    ...armor,
    value: armor.value + shieldBonus,
    shieldBonus,
    shieldItemIds: shieldBonus > 0 ? shieldItems.filter((item) => numericValue(recordValue(item.data).armorBonus, 0) === shieldBonus).map((item) => item.id) : []
  };
}

export function genericFantasyActionFormula(actor: Actor, items: Item[] = [], rollId: string, options: SystemActionUseOptions = {}): string | undefined {
  const item = actionItemForRoll(actor, items, rollId, ["spell", "item"]);
  if (!item) return undefined;
  const data = recordValue(item.data);
  const prefix = item.type === "spell" ? "spell" : "item";
  if (rollId === `${prefix}-${item.id}-damage` && stringValue(data.damageFormula)) {
    return genericFantasyDamageFormula(actor, data, options.spellSlotLevel);
  }
  if (rollId === `${prefix}-${item.id}-secondary-damage` && stringValue(data.secondaryDamageFormula)) {
    return genericFantasyDamageFormula(actor, data, options.spellSlotLevel, "secondaryDamageFormula", "secondaryUpcastFormula");
  }
  if (rollId === `${prefix}-${item.id}-healing` && stringValue(data.healingFormula)) {
    return genericFantasyHealingFormula(actor, data, options.spellSlotLevel);
  }
  return genericFantasyActionRolls(actor, items).find((roll) => roll.id === rollId)?.formula;
}

export function dnd5eSrdActionFormula(actor: Actor, items: Item[] = [], rollId: string, options: SystemActionUseOptions = {}): string | undefined {
  const monkWeaponFormula = dnd5eSrdMonkWeaponDamageFormulaForRoll(actor, items, rollId);
  if (monkWeaponFormula) return monkWeaponFormula;
  if (rollId === DND_5E_SRD_SECOND_WIND_ROLL_ID) return dnd5eSrdSecondWindFormula(actor);
  if (rollId === DND_5E_SRD_ACTION_SURGE_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_TACTICAL_MIND_ROLL_ID) return "1d10";
  if (rollId === DND_5E_SRD_RAGE_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_RAGE_DAMAGE_ROLL_ID) return String(dnd5eSrdRageDamageBonus(actor));
  if (rollId === DND_5E_SRD_RECKLESS_ATTACK_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_BARDIC_INSPIRATION_ROLL_ID) return dnd5eSrdBardicInspirationFormula(actor);
  if (rollId === DND_5E_SRD_FONT_OF_INSPIRATION_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_LAY_ON_HANDS_ROLL_ID) return dnd5eSrdLayOnHandsFormula(actor, options.resourceAmount);
  if (rollId === DND_5E_SRD_DIVINE_SMITE_ROLL_ID) return dnd5eSrdDivineSmiteFormula(actor, options.useFreeResource ? 1 : options.spellSlotLevel);
  if (rollId === DND_5E_SRD_FAITHFUL_STEED_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_HUNTERS_MARK_DAMAGE_ROLL_ID) return dnd5eSrdHuntersMarkFormula(actor);
  if (rollId === DND_5E_SRD_MARTIAL_ARTS_DAMAGE_ROLL_ID) return dnd5eSrdMartialArtsFormula(actor);
  if (rollId === DND_5E_SRD_FLURRY_OF_BLOWS_ROLL_ID || rollId === DND_5E_SRD_PATIENT_DEFENSE_ROLL_ID || rollId === DND_5E_SRD_STEP_OF_THE_WIND_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_UNCANNY_METABOLISM_ROLL_ID) return dnd5eSrdUncannyMetabolismFormula(actor);
  if (rollId === DND_5E_SRD_DEFLECT_ATTACKS_DAMAGE_ROLL_ID) return dnd5eSrdDeflectAttacksDamageFormula(actor);
  if (rollId === DND_5E_SRD_STUNNING_STRIKE_ROLL_ID) return "0";
  if (
    rollId === DND_5E_SRD_INNATE_SORCERY_ROLL_ID ||
    rollId === DND_5E_SRD_CONVERT_SPELL_SLOT_ROLL_ID ||
    rollId === DND_5E_SRD_CREATE_SPELL_SLOT_ROLL_ID ||
    rollId === DND_5E_SRD_METAMAGIC_EMPOWERED_ROLL_ID ||
    rollId === DND_5E_SRD_METAMAGIC_QUICKENED_ROLL_ID
  )
    return "0";
  if (rollId === DND_5E_SRD_ELDRITCH_INVOCATIONS_ROLL_ID || rollId === DND_5E_SRD_MAGICAL_CUNNING_ROLL_ID) return "0";
  if (
    rollId === DND_5E_SRD_WILD_SHAPE_ROLL_ID ||
    rollId === DND_5E_SRD_WILD_COMPANION_ROLL_ID ||
    rollId === DND_5E_SRD_WILD_RESURGENCE_WILD_SHAPE_ROLL_ID ||
    rollId === DND_5E_SRD_WILD_RESURGENCE_SPELL_SLOT_ROLL_ID
  ) return "0";
  if (rollId === DND_5E_SRD_DIVINE_SPARK_HEALING_ROLL_ID || rollId === DND_5E_SRD_DIVINE_SPARK_DAMAGE_ROLL_ID) return dnd5eSrdDivineSparkFormula(actor);
  if (rollId === DND_5E_SRD_TURN_UNDEAD_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_SEAR_UNDEAD_DAMAGE_ROLL_ID) return dnd5eSrdSearUndeadFormula(actor);
  if (rollId === DND_5E_SRD_SNEAK_ATTACK_DAMAGE_ROLL_ID) return dnd5eSrdSneakAttackFormula(actor);
  if (rollId === DND_5E_SRD_CUNNING_STRIKE_ROLL_ID) return "0";
  if (rollId === DND_5E_SRD_DRAGONBORN_BREATH_WEAPON_ROLL_ID) return dnd5eSrdDragonbornBreathWeaponFormula(actor);
  if (rollId === DND_5E_SRD_ORC_ADRENALINE_RUSH_ROLL_ID) return dnd5eSrdAdrenalineRushFormula(actor);
  if (dnd5eSrdSpeciesResourceAction(rollId)) return "0";
  const slotLevel = dnd5eSrdSpellActionSlotLevel(actor, items, rollId, options);
  return genericFantasyActionFormula(actor, items, rollId, slotLevel ? { ...options, spellSlotLevel: slotLevel } : options);
}

export function useGenericFantasyAction(actor: Actor, items: Item[] = [], rollId: string, options: SystemActionUseOptions = {}): SystemActionUseResult {
  const item = actionItemForRoll(actor, items, rollId, ["spell", "item"]);
  const consumed: SystemActionConsumption[] = [];
  let data = { ...actor.data };
  let slotLevel: number | undefined;
  if (item?.type === "spell" && rollId.startsWith(`spell-${item.id}-`)) {
    const level = Math.floor(numericValue(recordValue(item.data).level, 0));
    if (level > 0) {
      slotLevel = spellActionSlotLevel(level, options.spellSlotLevel);
      const result = consumeResourcePool(data.spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
      data = { ...data, spellSlots: result.pools };
      consumed.push(result.consumed);
    }
  }
  return { systemId: "generic-fantasy", actorId: actor.id, rollId, slotLevel, consumed, data, items: [] };
}

export function useDnd5eSrdAction(actor: Actor, items: Item[] = [], rollId: string, options: SystemActionUseOptions = {}): SystemActionUseResult {
  if (rollId === DND_5E_SRD_SECOND_WIND_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Fighter";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "secondWind", 1, "Second Wind", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_ACTION_SURGE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Fighter";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "actionSurge", 1, "Action Surge", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_TACTICAL_MIND_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Fighter";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "secondWind", 1, "Second Wind", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_RAGE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Barbarian";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "rage", 1, "Rage", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_RAGE_DAMAGE_ROLL_ID || rollId === DND_5E_SRD_RECKLESS_ATTACK_ROLL_ID) {
    return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  }
  if (rollId === DND_5E_SRD_BARDIC_INSPIRATION_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Bard";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "bardicInspiration", 1, "Bardic Inspiration", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_FONT_OF_INSPIRATION_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Bard";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const bardicInspiration = resources.bardicInspiration;
    if (!bardicInspiration || bardicInspiration.current >= bardicInspiration.max) throw new Error("Bardic Inspiration is already full");
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    resources.bardicInspiration = { ...bardicInspiration, current: Math.min(bardicInspiration.max, bardicInspiration.current + 1) };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, resources, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_LAY_ON_HANDS_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Paladin";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const amount = dnd5eSrdResourceActionAmount(options.resourceAmount, dnd5eSrdDefaultLayOnHandsAmount(actor));
    const result = consumeResourcePool(resources, "layOnHands", amount, "Lay On Hands", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_DIVINE_SMITE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Paladin";
    const level = numericValue(actor.data.level, 1);
    const slotLevel = options.useFreeResource ? 1 : spellActionSlotLevel(1, options.spellSlotLevel);
    if (options.useFreeResource) {
      const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
      const result = consumeResourcePool(resources, "paladinsSmite", 1, "Paladin's Smite", "resource");
      return {
        systemId: DND_5E_SRD_SYSTEM_ID,
        actorId: actor.id,
        rollId,
        slotLevel,
        consumed: [result.consumed],
        data: { ...actor.data, resources: result.pools },
        items: []
      };
    }
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_FAITHFUL_STEED_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Paladin";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "faithfulSteed", 1, "Faithful Steed", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_HUNTERS_MARK_DAMAGE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Ranger";
    const level = numericValue(actor.data.level, 1);
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    if (options.useFreeResource) {
      const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
      const result = consumeResourcePool(resources, "favoredEnemy", 1, "Favored Enemy", "resource");
      return {
        systemId: DND_5E_SRD_SYSTEM_ID,
        actorId: actor.id,
        rollId,
        slotLevel: 1,
        consumed: [result.consumed],
        data: { ...actor.data, resources: result.pools },
        items: []
      };
    }
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_MARTIAL_ARTS_DAMAGE_ROLL_ID) {
    return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  }
  if (rollId === DND_5E_SRD_FLURRY_OF_BLOWS_ROLL_ID || rollId === DND_5E_SRD_PATIENT_DEFENSE_ROLL_ID || rollId === DND_5E_SRD_STEP_OF_THE_WIND_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Monk";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "focus", 1, "Focus Point", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_UNCANNY_METABOLISM_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Monk";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "uncannyMetabolism", 1, "Uncanny Metabolism", "resource");
    const focus = result.pools.focus;
    if (focus) result.pools.focus = { ...focus, current: focus.max };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_DEFLECT_ATTACKS_DAMAGE_ROLL_ID || rollId === DND_5E_SRD_STUNNING_STRIKE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Monk";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "focus", 1, "Focus Point", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_INNATE_SORCERY_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Sorcerer";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "innateSorcery", 1, "Innate Sorcery", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_CONVERT_SPELL_SLOT_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Sorcerer";
    const level = numericValue(actor.data.level, 1);
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const sorceryPoints = resources.sorceryPoints;
    if (!sorceryPoints) throw new Error("Sorcery Points are unavailable");
    if (sorceryPoints.current >= sorceryPoints.max) throw new Error("Sorcery Points are already full");
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    resources.sorceryPoints = { ...sorceryPoints, current: Math.min(sorceryPoints.max, sorceryPoints.current + slotLevel) };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, resources, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_CREATE_SPELL_SLOT_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Sorcerer";
    const level = numericValue(actor.data.level, 1);
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    const cost = dnd5eSrdCreateSpellSlotCost(slotLevel, level);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const slotKey = `level${slotLevel}`;
    const slot = spellSlots[slotKey];
    if (!slot) throw new Error(`No ${formatOrdinal(slotLevel)}-level spell slot pool is available`);
    if (slot.current >= slot.max) throw new Error(`Level ${slotLevel} Spell Slot is already full`);
    const result = consumeResourcePool(resources, "sorceryPoints", cost, "Sorcery Points", "resource");
    spellSlots[slotKey] = { ...slot, current: Math.min(slot.max, slot.current + 1) };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools, spellSlots },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_METAMAGIC_EMPOWERED_ROLL_ID || rollId === DND_5E_SRD_METAMAGIC_QUICKENED_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Sorcerer";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const cost = rollId === DND_5E_SRD_METAMAGIC_QUICKENED_ROLL_ID ? 2 : 1;
    const result = consumeResourcePool(resources, "sorceryPoints", cost, "Sorcery Points", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_ELDRITCH_INVOCATIONS_ROLL_ID) {
    return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  }
  if (rollId === DND_5E_SRD_MAGICAL_CUNNING_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Warlock";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const recoverableEntries = Object.entries(spellSlots)
      .filter(([, slot]) => stringValue(slot.recovery) === "short")
      .sort(([left], [right]) => Number(right.replace("level", "")) - Number(left.replace("level", "")));
    const expended = recoverableEntries.reduce((total, [, slot]) => total + Math.max(0, slot.max - slot.current), 0);
    if (expended <= 0) throw new Error("Pact Magic spell slots are already full");
    const cunningResult = consumeResourcePool(resources, "magicalCunning", 1, "Magical Cunning", "resource");
    let remainingRecovery = dnd5eSrdMagicalCunningLimit(level);
    for (const [key, slot] of recoverableEntries) {
      if (remainingRecovery <= 0) break;
      const recovered = Math.min(remainingRecovery, Math.max(0, slot.max - slot.current));
      if (recovered <= 0) continue;
      spellSlots[key] = { ...slot, current: Math.min(slot.max, slot.current + recovered) };
      remainingRecovery -= recovered;
    }
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [cunningResult.consumed],
      data: { ...actor.data, resources: cunningResult.pools, spellSlots },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_WILD_SHAPE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Druid";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, "wildShape", 1, "Wild Shape", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_WILD_COMPANION_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Druid";
    const level = numericValue(actor.data.level, 1);
    if (options.useFreeResource) {
      const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
      const result = consumeResourcePool(resources, "wildShape", 1, "Wild Shape", "resource");
      return {
        systemId: DND_5E_SRD_SYSTEM_ID,
        actorId: actor.id,
        rollId,
        consumed: [result.consumed],
        data: { ...actor.data, resources: result.pools },
        items: []
      };
    }
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_WILD_RESURGENCE_WILD_SHAPE_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Druid";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const wildShape = resources.wildShape;
    if (!wildShape || wildShape.max <= 0) throw new Error("Wild Shape is unavailable");
    if (wildShape.current > 0) throw new Error("Wild Shape uses remain");
    const slotLevel = spellActionSlotLevel(1, options.spellSlotLevel);
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
    resources.wildShape = { ...wildShape, current: Math.min(wildShape.max, wildShape.current + 1) };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel,
      consumed: [result.consumed],
      data: { ...actor.data, resources, spellSlots: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_WILD_RESURGENCE_SPELL_SLOT_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Druid";
    const level = numericValue(actor.data.level, 1);
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
    const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, level, { raiseMaxToDefault: true });
    const levelOne = spellSlots.level1;
    if (!levelOne) throw new Error("Level 1 Spell Slot is unavailable");
    if (levelOne.current >= levelOne.max) throw new Error("Level 1 Spell Slot is already full");
    const wildShapeResult = consumeResourcePool(resources, "wildShape", 1, "Wild Shape", "resource");
    const resurgenceResult = consumeResourcePool(wildShapeResult.pools, "wildResurgence", 1, "Wild Resurgence", "resource");
    spellSlots.level1 = { ...levelOne, current: Math.min(levelOne.max, levelOne.current + 1) };
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      slotLevel: 1,
      consumed: [wildShapeResult.consumed, resurgenceResult.consumed],
      data: { ...actor.data, resources: resurgenceResult.pools, spellSlots },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_DIVINE_SPARK_HEALING_ROLL_ID || rollId === DND_5E_SRD_DIVINE_SPARK_DAMAGE_ROLL_ID || rollId === DND_5E_SRD_TURN_UNDEAD_ROLL_ID) {
    const className = stringValue(actor.data.class) || "Cleric";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data);
    const result = consumeResourcePool(resources, "channelDivinity", 1, "Channel Divinity", "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  if (rollId === DND_5E_SRD_SEAR_UNDEAD_DAMAGE_ROLL_ID) {
    return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  }
  if (rollId === DND_5E_SRD_SNEAK_ATTACK_DAMAGE_ROLL_ID || rollId === DND_5E_SRD_CUNNING_STRIKE_ROLL_ID) {
    return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  }
  const speciesAction = dnd5eSrdSpeciesResourceAction(rollId);
  if (speciesAction) {
    const className = stringValue(actor.data.class) || "Fighter";
    const resources = normalizeDnd5eSrdResources(actor.data.resources, className, numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
    const result = consumeResourcePool(resources, speciesAction.key, 1, speciesAction.label, "resource");
    return {
      systemId: DND_5E_SRD_SYSTEM_ID,
      actorId: actor.id,
      rollId,
      consumed: [result.consumed],
      data: { ...actor.data, resources: result.pools },
      items: []
    };
  }
  const spellAction = useDnd5eSrdSpellAction(actor, items, rollId, options);
  if (spellAction) return spellAction;
  return { ...useGenericFantasyAction(actor, items, rollId, options), systemId: DND_5E_SRD_SYSTEM_ID };
}

export function dnd5eSrdEquipmentPurchase(actor: Actor, entry: GenericFantasyCompendiumEntry, quantity = 1): Dnd5eSrdEquipmentPurchaseResult {
  if (entry.type === "condition") throw new Error(`Compendium entry is not purchasable: ${entry.id}`);
  const unitCostGp = numericValue(entry.data.costGp, Number.NaN);
  if (!Number.isFinite(unitCostGp) || unitCostGp < 0) throw new Error(`Compendium entry has no SRD equipment cost: ${entry.id}`);
  const purchaseQuantity = clampInteger(quantity, 1, 99, 1);
  const unitCostCopper = Math.round(unitCostGp * 100);
  const totalCostCopper = unitCostCopper * purchaseQuantity;
  const availableCopper = dnd5eSrdCurrencyToCopper(actor.data.currency);
  if (availableCopper < totalCostCopper) throw new Error(`Insufficient currency: requires ${dnd5eSrdFormatGp(totalCostCopper)}, available ${dnd5eSrdFormatGp(availableCopper)}`);
  const currency = dnd5eSrdCurrencyFromCopper(availableCopper - totalCostCopper);
  const totalCostGp = totalCostCopper / 100;
  return {
    systemId: DND_5E_SRD_SYSTEM_ID,
    actorId: actor.id,
    entryId: entry.id,
    quantity: purchaseQuantity,
    unitCostGp,
    totalCostGp,
    currency,
    data: { ...actor.data, currency },
    itemData: { ...entry.data, compendiumId: entry.id, quantity: purchaseQuantity, purchasedForGp: totalCostGp }
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

export function dnd5eSrdActorConditions(actor: Actor): AppliedCondition[] {
  const rawConditions = normalizeConditionRecords(actor.data.conditions);
  return rawConditions.map((condition) => {
    const entry = dnd5eSrdCompendiumEntry(condition.id);
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

export function applyDnd5eSrdCondition(actor: Actor, conditionId: string, appliedAt?: string): Record<string, unknown> {
  const entry = dnd5eSrdCompendiumEntry(conditionId);
  if (!entry || entry.type !== "condition") throw new Error(`Unknown condition: ${conditionId}`);
  const conditions = normalizeConditionRecords(actor.data.conditions);
  if (!conditions.some((condition) => condition.id === conditionId)) conditions.push({ id: conditionId, appliedAt });
  return { ...actor.data, conditions };
}

export function removeGenericFantasyCondition(actor: Actor, conditionId: string): Record<string, unknown> {
  const conditions = normalizeConditionRecords(actor.data.conditions).filter((condition) => condition.id !== conditionId);
  return { ...actor.data, conditions };
}

export function removeDnd5eSrdCondition(actor: Actor, conditionId: string): Record<string, unknown> {
  return removeGenericFantasyCondition(actor, conditionId);
}

export function stellarFrontiersAptitudeCheck(actor: Actor, aptitude: string): QuickRoll {
  const modifier = stellarFrontiersAptitudeModifier(actor, aptitude);
  const label = `${aptitude.charAt(0).toUpperCase()}${aptitude.slice(1)} Check`;
  const conditions = stellarFrontiersActorConditions(actor);
  const d20 = conditions.some((condition) => condition.id === "jammed") ? "2d20kl1" : "1d20";
  const bonus = conditions.some((condition) => condition.id === "locked-in") ? "+1d6" : "";
  return {
    id: `aptitude-${aptitude}`,
    label,
    formula: `${d20}${formatSignedNumber(modifier)}${bonus}`
  };
}

export function stellarFrontiersActionRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  return items.filter((item) => itemBelongsToActor(actor, item)).flatMap((item) => {
    const data = recordValue(item.data);
    const rolls: QuickRoll[] = [];
    const prefix = item.type === "talent" ? "talent" : "gear";
    const aptitude = stringValue(data.aptitude);
    const damage = stringValue(data.damage);
    if (damage) {
      rolls.push({
        id: `${prefix}-${item.id}-damage`,
        label: `${item.name} Damage`,
        formula: aptitude ? appendFormulaBonus(damage, stellarFrontiersAptitudeModifier(actor, aptitude)) : damage
      });
    }
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-healing`,
        label: `${item.name} Healing`,
        formula: healingFormula
      });
    }
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-boost`,
        label: `${item.name} Boost`,
        formula: aptitude ? appendFormulaBonus(bonusFormula, stellarFrontiersAptitudeModifier(actor, aptitude)) : bonusFormula
      });
    }
    return rolls;
  });
}

export function stellarFrontiersQuickRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  const aptitudes = actor.data.aptitudes as Record<string, number> | undefined;
  return [
    ...Object.keys(aptitudes ?? { combat: 2, tech: 2, pilot: 1, science: 1, charm: 0 }).map((aptitude) => stellarFrontiersAptitudeCheck(actor, aptitude)),
    ...stellarFrontiersActionRolls(actor, items)
  ];
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
      data: { category: "consumable", healingFormula: "1d6+2", quantity: 1 }
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
      data: { rollBonusFormula: "1d6", shortRestClears: true }
    },
    {
      id: "jammed",
      type: "condition",
      name: "Jammed",
      summary: "Rolls Stellar Frontiers aptitude checks with disadvantage.",
      data: { rollMode: "disadvantage", shortRestClears: true }
    },
    {
      id: "vacuum-exposed",
      type: "condition",
      name: "Vacuum Exposed",
      summary: "Marks a character exposed to hard vacuum or suit breach.",
      data: { hazard: "vacuum", longRestClears: true }
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
        resources: { evasiveBurst: { current: 1, max: 1, recovery: "short" } },
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
        resources: { fieldRepair: { current: 2, max: 2, recovery: "long" } },
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

export function stellarFrontiersCharacterImport(input: CharacterImportInput): CharacterImportResult {
  const source = importSource(input);
  const rank = clampInteger(source.rank, 1, 10, 1);
  const aptitudes = normalizeNumberRecord(source.aptitudes, { combat: 1, tech: 1, pilot: 1, science: 1, charm: 0 });
  const strain = normalizePool(source.strain, 4 + rank);
  const warnings: string[] = [];
  const conditions = normalizeImportConditions(source.conditions ?? input.conditions, stellarFrontiersCompendiumEntry, warnings);
  const items = normalizeImportItems(source.items ?? input.items, stellarFrontiersCompendiumEntry, warnings, conditions);
  return {
    systemId: "stellar-frontiers",
    actorType: "character",
    name: stringValue(input.name) || stringValue(source.name) || "Imported Spacer",
    data: {
      rank,
      background: stringValue(source.background) || "Independent Operator",
      aptitudes,
      strain,
      resources: normalizeResourcePools(source.resources, {}),
      conditions: conditions.map((id) => ({ id })),
      milestones: normalizeStringArray(source.milestones)
    },
    items,
    warnings
  };
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
  const resources = normalizeResourcePools(actor.data.resources);
  return {
    ...actor.data,
    rank: option.nextValue,
    aptitudes,
    strain: {
      current: numericValue(strain?.current, numericValue(strain?.max, 5)) + 1,
      max: numericValue(strain?.max, 5) + 1
    },
    resources,
    milestones
  };
}

export function applyStellarFrontiersRest(actor: Actor, restType: SystemRestType): SystemRestResult {
  const strain = normalizePool(actor.data.strain, 5);
  const recoverAmount = restType === "long" ? strain.max - strain.current : Math.min(2, strain.max - strain.current);
  const nextStrain = { ...strain, current: strain.current + Math.max(0, recoverAmount) };
  const resources = recoverResourcePools(actor.data.resources, restType);
  const conditionUpdate = conditionsAfterRest(actor, stellarFrontiersCompendiumEntry, restType);
  const data = {
    ...actor.data,
    strain: nextStrain,
    resources: resources.value,
    conditions: conditionUpdate.conditions
  };
  return {
    systemId: "stellar-frontiers",
    actorId: actor.id,
    restType,
    summary: `${actor.name} completed ${restType === "long" ? "downtime" : "a breather"}`,
    recovered: { strain: Math.max(0, recoverAmount), resources: resources.recovered },
    removedConditions: conditionUpdate.removed,
    data
  };
}

export function stellarFrontiersSheet(actor: Actor, items: Item[] = []): StellarFrontiersSheet {
  const strain = actor.data.strain as { current?: number; max?: number } | undefined;
  return {
    actorId: actor.id,
    summary: `${actor.name}${strain ? ` (${strain.current ?? "?"}/${strain.max ?? "?"} strain)` : ""}`,
    data: actor.data,
    quickRolls: stellarFrontiersQuickRolls(actor, items),
    conditions: stellarFrontiersActorConditions(actor),
    inventory: items.filter((item) => item.actorId === actor.id && item.type !== "talent" && item.type !== "spell"),
    spells: [],
    talents: items.filter((item) => item.actorId === actor.id && item.type === "talent")
  };
}

export function useStellarFrontiersAction(actor: Actor, items: Item[] = [], rollId: string): SystemActionUseResult {
  const item = actionItemForRoll(actor, items, rollId, ["gear", "talent"]);
  const consumed: SystemActionConsumption[] = [];
  let data = { ...actor.data };
  const updatedItems: Item[] = [];
  if (item) {
    const itemData = recordValue(item.data);
    const strainCost = Math.floor(numericValue(itemData.strainCost, 0));
    if (strainCost > 0) {
      const strain = normalizePool(data.strain, 5);
      if (strain.current < strainCost) throw new Error(`Insufficient strain for ${item.name}`);
      const remaining = strain.current - strainCost;
      data = { ...data, strain: { ...strain, current: remaining } };
      consumed.push({ type: "strain", key: "strain", label: "Strain", amount: strainCost, remaining });
    }
    if (stringValue(itemData.category) === "consumable") {
      const quantity = Math.floor(numericValue(itemData.quantity, 1));
      if (quantity < 1) throw new Error(`${item.name} has no remaining uses`);
      const remaining = quantity - 1;
      updatedItems.push({ ...item, data: { ...itemData, quantity: remaining } });
      consumed.push({ type: "itemQuantity", key: item.id, label: item.name, amount: 1, remaining });
    }
  }
  return { systemId: "stellar-frontiers", actorId: actor.id, rollId, consumed, data, items: updatedItems };
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

export function mysticNoirSkillCheck(actor: Actor, skill: string): QuickRoll {
  const modifier = mysticNoirSkillModifier(actor, skill);
  const label = `${skill.charAt(0).toUpperCase()}${skill.slice(1)} Check`;
  const conditions = mysticNoirActorConditions(actor);
  const d20 = conditions.some((condition) => condition.id === "shaken") ? "2d20kl1" : "1d20";
  const bonus = conditions.some((condition) => condition.id === "focused") ? "+1d4" : "";
  return {
    id: `skill-${skill}`,
    label,
    formula: `${d20}${formatSignedNumber(modifier)}${bonus}`
  };
}

export function mysticNoirActionRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  return items.filter((item) => itemBelongsToActor(actor, item)).flatMap((item) => {
    const data = recordValue(item.data);
    const rolls: QuickRoll[] = [];
    const prefix = item.type === "ritual" ? "ritual" : "clue";
    const skill = stringValue(data.skill);
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-insight`,
        label: `${item.name} Insight`,
        formula: skill ? appendFormulaBonus(bonusFormula, mysticNoirSkillModifier(actor, skill)) : bonusFormula
      });
    }
    const protectionFormula = stringValue(data.protectionFormula);
    if (protectionFormula) {
      rolls.push({
        id: `${prefix}-${item.id}-ward`,
        label: `${item.name} Ward`,
        formula: skill ? appendFormulaBonus(protectionFormula, mysticNoirSkillModifier(actor, skill)) : protectionFormula
      });
    }
    return rolls;
  });
}

export function mysticNoirQuickRolls(actor: Actor, items: Item[] = []): QuickRoll[] {
  const skills = actor.data.skills as Record<string, number> | undefined;
  return [
    ...Object.keys(skills ?? { investigation: 1, resolve: 1, influence: 1, stealth: 1, occult: 1 }).map((skill) => mysticNoirSkillCheck(actor, skill)),
    ...mysticNoirActionRolls(actor, items)
  ];
}

export function mysticNoirCompendium(): MysticNoirCompendiumEntry[] {
  return [
    {
      id: "case-notebook",
      type: "clue",
      name: "Case Notebook",
      summary: "Organized leads that sharpen an investigation roll.",
      data: { category: "casework", bonusFormula: "1d4", skill: "investigation", resourceCost: { resource: "lead", amount: 1 }, tags: ["notes", "lead"] }
    },
    {
      id: "warding-rite",
      type: "ritual",
      name: "Warding Rite",
      summary: "A protective ritual that reinforces resolve under pressure.",
      data: { category: "protection", protectionFormula: "1d6", skill: "resolve", resourceCost: { resource: "ward", amount: 1 }, tags: ["ward", "ritual"] }
    },
    {
      id: "focused",
      type: "condition",
      name: "Focused",
      summary: "Adds 1d4 to Mystic Noir skill checks.",
      data: { rollBonusFormula: "1d4", shortRestClears: true }
    },
    {
      id: "shaken",
      type: "condition",
      name: "Shaken",
      summary: "Rolls Mystic Noir skill checks with disadvantage.",
      data: { rollMode: "disadvantage", shortRestClears: true }
    },
    {
      id: "marked",
      type: "condition",
      name: "Marked",
      summary: "Marks a character as watched by a rival faction.",
      data: { factionPressure: true, longRestClears: true }
    }
  ];
}

export function mysticNoirCompendiumEntry(entryId: string): MysticNoirCompendiumEntry | undefined {
  return mysticNoirCompendium().find((entry) => entry.id === entryId);
}

export function mysticNoirCharacterTemplates(): CharacterTemplate[] {
  return [
    {
      id: "field-investigator",
      systemId: "mystic-noir",
      name: "Field Investigator",
      summary: "Case-first operator with strong leads and steady instincts.",
      actorType: "character",
      data: {
        rank: 1,
        archetype: "Field Investigator",
        skills: { investigation: 3, resolve: 2, influence: 1, stealth: 2, occult: 1 },
        composure: { current: 4, max: 6 },
        resources: { lead: { current: 2, max: 2, recovery: "long" } },
        conditions: [],
        breakthroughs: ["First Lead"]
      },
      items: [{ entryId: "case-notebook" }]
    },
    {
      id: "occult-scholar",
      systemId: "mystic-noir",
      name: "Occult Scholar",
      summary: "Ritual specialist with careful research and defensive wards.",
      actorType: "character",
      data: {
        rank: 1,
        archetype: "Occult Scholar",
        skills: { investigation: 2, resolve: 2, influence: 1, stealth: 1, occult: 3 },
        composure: { current: 3, max: 5 },
        resources: { ward: { current: 1, max: 1, recovery: "short" } },
        conditions: [],
        breakthroughs: ["Catalogued Omen"]
      },
      items: [{ entryId: "warding-rite" }]
    }
  ];
}

export function mysticNoirCharacterTemplate(templateId: string): CharacterTemplate | undefined {
  return mysticNoirCharacterTemplates().find((template) => template.id === templateId);
}

export function mysticNoirCharacterImport(input: CharacterImportInput): CharacterImportResult {
  const source = importSource(input);
  const rank = clampInteger(source.rank, 1, 12, 1);
  const skills = normalizeNumberRecord(source.skills, { investigation: 1, resolve: 1, influence: 1, stealth: 1, occult: 1 });
  const composure = normalizePool(source.composure, 5 + rank);
  const warnings: string[] = [];
  const conditions = normalizeImportConditions(source.conditions ?? input.conditions, mysticNoirCompendiumEntry, warnings);
  const items = normalizeImportItems(source.items ?? input.items, mysticNoirCompendiumEntry, warnings, conditions);
  return {
    systemId: "mystic-noir",
    actorType: "character",
    name: stringValue(input.name) || stringValue(source.name) || "Imported Investigator",
    data: {
      rank,
      archetype: stringValue(source.archetype) || "Independent Investigator",
      skills,
      composure,
      resources: normalizeResourcePools(source.resources, {}),
      conditions: conditions.map((id) => ({ id })),
      breakthroughs: normalizeStringArray(source.breakthroughs)
    },
    items,
    warnings
  };
}

export function mysticNoirEncounterThreats(): EncounterThreat[] {
  return [
    {
      id: "arcane-ward",
      systemId: "mystic-noir",
      name: "Arcane Ward",
      summary: "Static pressure that complicates movement and investigation.",
      role: "hazard",
      budget: 40
    },
    {
      id: "masked-agent",
      systemId: "mystic-noir",
      name: "Masked Agent",
      summary: "Skilled rival who pushes the crew into costly choices.",
      role: "rival",
      budget: 60
    },
    {
      id: "rift-echo",
      systemId: "mystic-noir",
      name: "Rift Echo",
      summary: "Major supernatural pressure for a climactic case scene.",
      role: "elite",
      budget: 150
    }
  ];
}

export function mysticNoirEncounterPlan(party: Actor[], selections: EncounterThreatSelection[]): EncounterPlan {
  return buildEncounterPlan({
    systemId: "mystic-noir",
    partyRating: party.reduce((total, actor) => total + numericValue(actor.data.rank, 1) * 80, 0) || 80,
    threats: mysticNoirEncounterThreats(),
    selections
  });
}

export function mysticNoirAdvancementOptions(actor: Actor): AdvancementOption[] {
  const rank = numericValue(actor.data.rank, 1);
  if (rank >= 12) return [];
  return [
    {
      id: "case-breakthrough",
      systemId: "mystic-noir",
      name: `Case Breakthrough ${rank + 1}`,
      summary: "Increase rank, composure capacity, and the character's core investigative skill.",
      nextValue: rank + 1
    }
  ];
}

export function applyMysticNoirAdvancement(actor: Actor, optionId: string): Record<string, unknown> {
  const option = mysticNoirAdvancementOptions(actor).find((item) => item.id === optionId);
  if (!option) throw new Error(`Unknown advancement: ${optionId}`);
  const skills = { ...((actor.data.skills as Record<string, number> | undefined) ?? {}) };
  const archetype = typeof actor.data.archetype === "string" ? actor.data.archetype : "";
  const primarySkill = archetype === "Occult Scholar" ? "occult" : "investigation";
  skills[primarySkill] = numericValue(skills[primarySkill], 1) + 1;
  const composure = actor.data.composure as { current?: number; max?: number } | undefined;
  const breakthroughs = normalizeStringArray(actor.data.breakthroughs);
  const breakthrough = `Case ${option.nextValue} Breakthrough`;
  if (!breakthroughs.includes(breakthrough)) breakthroughs.push(breakthrough);
  const resources = normalizeResourcePools(actor.data.resources);
  return {
    ...actor.data,
    rank: option.nextValue,
    skills,
    composure: {
      current: numericValue(composure?.current, numericValue(composure?.max, 5)) + 1,
      max: numericValue(composure?.max, 5) + 1
    },
    resources,
    breakthroughs
  };
}

export function applyMysticNoirRest(actor: Actor, restType: SystemRestType): SystemRestResult {
  const composure = normalizePool(actor.data.composure, 5);
  const recoverAmount = restType === "long" ? composure.max - composure.current : Math.min(2, composure.max - composure.current);
  const nextComposure = { ...composure, current: composure.current + Math.max(0, recoverAmount) };
  const resources = recoverResourcePools(actor.data.resources, restType);
  const conditionUpdate = conditionsAfterRest(actor, mysticNoirCompendiumEntry, restType);
  const data = {
    ...actor.data,
    composure: nextComposure,
    resources: resources.value,
    conditions: conditionUpdate.conditions
  };
  return {
    systemId: "mystic-noir",
    actorId: actor.id,
    restType,
    summary: `${actor.name} completed ${restType === "long" ? "downtime" : "a breather"}`,
    recovered: { composure: Math.max(0, recoverAmount), resources: resources.recovered },
    removedConditions: conditionUpdate.removed,
    data
  };
}

export function mysticNoirSheet(actor: Actor, items: Item[] = []): MysticNoirSheet {
  const composure = actor.data.composure as { current?: number; max?: number } | undefined;
  return {
    actorId: actor.id,
    summary: `${actor.name}${composure ? ` (${composure.current ?? "?"}/${composure.max ?? "?"} composure)` : ""}`,
    data: actor.data,
    quickRolls: mysticNoirQuickRolls(actor, items),
    conditions: mysticNoirActorConditions(actor),
    inventory: items.filter((item) => item.actorId === actor.id && item.type !== "clue" && item.type !== "ritual" && item.type !== "spell" && item.type !== "talent"),
    spells: [],
    clues: items.filter((item) => item.actorId === actor.id && item.type === "clue"),
    rituals: items.filter((item) => item.actorId === actor.id && item.type === "ritual")
  };
}

export function useMysticNoirAction(actor: Actor, items: Item[] = [], rollId: string): SystemActionUseResult {
  const item = actionItemForRoll(actor, items, rollId, ["clue", "ritual"]);
  const consumed: SystemActionConsumption[] = [];
  let data = { ...actor.data };
  if (item) {
    const cost = recordValue(recordValue(item.data).resourceCost);
    const resource = stringValue(cost.resource);
    const amount = Math.floor(numericValue(cost.amount, 0));
    if (resource && amount > 0) {
      const result = consumeResourcePool(data.resources, resource, amount, titleCaseWords(resource), "resource");
      data = { ...data, resources: result.pools };
      consumed.push(result.consumed);
    }
  }
  return { systemId: "mystic-noir", actorId: actor.id, rollId, consumed, data, items: [] };
}

export function mysticNoirActorConditions(actor: Actor): AppliedCondition[] {
  const rawConditions = normalizeConditionRecords(actor.data.conditions);
  return rawConditions.map((condition) => {
    const entry = mysticNoirCompendiumEntry(condition.id);
    return {
      id: condition.id,
      name: entry?.name ?? condition.id,
      summary: entry?.summary ?? "",
      appliedAt: condition.appliedAt
    };
  });
}

export function applyMysticNoirCondition(actor: Actor, conditionId: string, appliedAt?: string): Record<string, unknown> {
  const entry = mysticNoirCompendiumEntry(conditionId);
  if (!entry || entry.type !== "condition") throw new Error(`Unknown condition: ${conditionId}`);
  const conditions = normalizeConditionRecords(actor.data.conditions);
  if (!conditions.some((condition) => condition.id === conditionId)) conditions.push({ id: conditionId, appliedAt });
  return { ...actor.data, conditions };
}

export function removeMysticNoirCondition(actor: Actor, conditionId: string): Record<string, unknown> {
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

function genericFantasyAttributeModifier(actor: Actor, ability: string): number {
  const attributes = actor.data.attributes as Record<string, number> | undefined;
  return abilityModifier(numericValue(attributes?.[ability], 10));
}

function dnd5eSrdAbilityKeys(): string[] {
  return Object.keys(defaultDnd5eSrdAttributes());
}

function dnd5eSrdSkills(): Array<{ id: string; label: string; ability: string }> {
  return [
    { id: "acrobatics", label: "Acrobatics", ability: "dexterity" },
    { id: "animal-handling", label: "Animal Handling", ability: "wisdom" },
    { id: "arcana", label: "Arcana", ability: "intelligence" },
    { id: "athletics", label: "Athletics", ability: "strength" },
    { id: "deception", label: "Deception", ability: "charisma" },
    { id: "history", label: "History", ability: "intelligence" },
    { id: "insight", label: "Insight", ability: "wisdom" },
    { id: "intimidation", label: "Intimidation", ability: "charisma" },
    { id: "investigation", label: "Investigation", ability: "intelligence" },
    { id: "medicine", label: "Medicine", ability: "wisdom" },
    { id: "nature", label: "Nature", ability: "intelligence" },
    { id: "perception", label: "Perception", ability: "wisdom" },
    { id: "performance", label: "Performance", ability: "charisma" },
    { id: "persuasion", label: "Persuasion", ability: "charisma" },
    { id: "religion", label: "Religion", ability: "intelligence" },
    { id: "sleight-of-hand", label: "Sleight of Hand", ability: "dexterity" },
    { id: "stealth", label: "Stealth", ability: "dexterity" },
    { id: "survival", label: "Survival", ability: "wisdom" }
  ];
}

function dnd5eSrdSkillDefinition(skillId: string): { id: string; label: string; ability: string } {
  return dnd5eSrdSkills().find((skill) => skill.id === normalizeDnd5eSrdSkillId(skillId)) ?? { id: "perception", label: "Perception", ability: "wisdom" };
}

function dnd5eSrdTools(): Array<{ id: string; label: string; ability: string }> {
  return [
    { id: "calligraphers-supplies", label: "Calligrapher's Supplies", ability: "dexterity" },
    { id: "gaming-set", label: "Gaming Set", ability: "wisdom" },
    { id: "musical-instrument", label: "Musical Instrument", ability: "charisma" },
    { id: "thieves-tools", label: "Thieves' Tools", ability: "dexterity" }
  ];
}

function dnd5eSrdToolDefinition(toolId: string): { id: string; label: string; ability: string } {
  return dnd5eSrdTools().find((tool) => tool.id === normalizeDnd5eSrdToolId(toolId)) ?? { id: "gaming-set", label: "Gaming Set", ability: "wisdom" };
}

function defaultDnd5eSrdAttributes(): Record<string, number> {
  return { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
}

function dnd5eSrdProficiencyBonus(actor: Actor): number {
  return dnd5eSrdProficiencyBonusForLevel(numericValue(actor.data.level, 1), actor.data.proficiencyBonus);
}

function dnd5eSrdProficiencyBonusForLevel(level: number, explicit: unknown): number {
  return Math.max(2, Math.floor(numericValue(explicit, 2 + Math.floor((Math.max(1, level) - 1) / 4))));
}

function dnd5eSrdSaveProficiencies(actor: Actor): string[] {
  return dnd5eSrdSaveProficienciesForClass(stringValue(actor.data.class) || "Fighter", actor.data.saveProficiencies);
}

function dnd5eSrdSaveProficienciesForClass(className: string, explicit: unknown): string[] {
  const defaultAttributes = defaultDnd5eSrdAttributes();
  const explicitProficiencies = normalizeStringArray(explicit).map((ability) => ability.toLowerCase()).filter((ability) => ability in defaultAttributes);
  if (explicitProficiencies.length > 0) return explicitProficiencies;
  const normalizedClass = className.toLowerCase();
  if (normalizedClass === "bard") return ["dexterity", "charisma"];
  if (normalizedClass === "cleric") return ["wisdom", "charisma"];
  if (normalizedClass === "paladin") return ["wisdom", "charisma"];
  if (normalizedClass === "ranger") return ["strength", "dexterity"];
  if (normalizedClass === "monk") return ["strength", "dexterity"];
  if (normalizedClass === "sorcerer") return ["constitution", "charisma"];
  if (normalizedClass === "warlock") return ["wisdom", "charisma"];
  if (normalizedClass === "wizard") return ["intelligence", "wisdom"];
  if (normalizedClass === "rogue") return ["dexterity", "intelligence"];
  return ["strength", "constitution"];
}

function dnd5eSrdSkillProficiencyMultiplier(actor: Actor, skillId: string): number {
  const normalizedSkillId = normalizeDnd5eSrdSkillId(skillId);
  if (dnd5eSrdSkillProficiencies(actor, "skillExpertise").includes(normalizedSkillId)) return 2;
  return dnd5eSrdSkillProficiencies(actor, "skillProficiencies").includes(normalizedSkillId) ? 1 : 0;
}

function dnd5eSrdSkillProficiencies(actor: Actor, field: "skillProficiencies" | "skillExpertise"): string[] {
  if (field === "skillExpertise") return dnd5eSrdSkillProficienciesFromExplicit(actor.data.skillExpertise);
  return dnd5eSrdSkillProficienciesForClass(stringValue(actor.data.class) || "Fighter", actor.data.skillProficiencies);
}

function dnd5eSrdSkillProficienciesForClass(className: string, explicit: unknown): string[] {
  const explicitProficiencies = dnd5eSrdSkillProficienciesFromExplicit(explicit);
  if (explicitProficiencies.length > 0) return explicitProficiencies;
  const normalizedClass = className.toLowerCase();
  if (normalizedClass === "bard") return ["performance", "persuasion", "perception"];
  if (normalizedClass === "cleric") return ["medicine", "religion"];
  if (normalizedClass === "paladin") return ["athletics", "persuasion"];
  if (normalizedClass === "ranger") return ["nature", "perception", "survival"];
  if (normalizedClass === "monk") return ["acrobatics", "stealth"];
  if (normalizedClass === "sorcerer") return ["arcana", "persuasion"];
  if (normalizedClass === "warlock") return ["arcana", "intimidation"];
  if (normalizedClass === "wizard") return ["arcana", "history"];
  if (normalizedClass === "rogue") return ["stealth", "sleight-of-hand"];
  return ["athletics", "intimidation"];
}

function dnd5eSrdSkillProficienciesFromExplicit(explicit: unknown): string[] {
  const skillIds = new Set(dnd5eSrdSkills().map((skill) => skill.id));
  return Array.from(
    new Set(
      normalizeStringArray(explicit)
        .map((skill) => normalizeDnd5eSrdSkillId(skill))
        .filter((skill) => skillIds.has(skill))
    )
  );
}

function normalizeDnd5eSrdSkillId(skill: string): string {
  return skill.trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function dnd5eSrdToolProficiencyMultiplier(actor: Actor, toolId: string): number {
  const normalizedToolId = normalizeDnd5eSrdToolId(toolId);
  if (dnd5eSrdToolProficiencies(actor, "toolExpertise").includes(normalizedToolId)) return 2;
  return dnd5eSrdToolProficiencies(actor, "toolProficiencies").includes(normalizedToolId) ? 1 : 0;
}

function dnd5eSrdToolProficiencies(actor: Actor, field: "toolProficiencies" | "toolExpertise"): string[] {
  if (field === "toolExpertise") return dnd5eSrdToolProficienciesFromExplicit(actor.data.toolExpertise);
  return dnd5eSrdToolProficienciesForBackground(stringValue(actor.data.background) || "Soldier", actor.data.toolProficiencies);
}

function dnd5eSrdToolProficienciesForBackground(background: string, explicit: unknown): string[] {
  const explicitProficiencies = dnd5eSrdToolProficienciesFromExplicit(explicit);
  if (explicitProficiencies.length > 0) return explicitProficiencies;
  const normalizedBackground = background.toLowerCase();
  if (normalizedBackground === "acolyte" || normalizedBackground === "sage") return ["calligraphers-supplies"];
  if (normalizedBackground === "criminal") return ["thieves-tools"];
  if (normalizedBackground === "soldier") return ["gaming-set"];
  return [];
}

function dnd5eSrdToolProficienciesFromExplicit(explicit: unknown): string[] {
  const toolIds = new Set(dnd5eSrdTools().map((tool) => tool.id));
  return Array.from(
    new Set(
      normalizeStringArray(explicit)
        .map((tool) => normalizeDnd5eSrdToolId(tool))
        .filter((tool) => toolIds.has(tool))
    )
  );
}

function normalizeDnd5eSrdToolId(tool: string): string {
  return tool.trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function dnd5eSrdBackgroundById(value: string): Dnd5eSrdCharacterBackground | undefined {
  const id = normalizeDnd5eSrdOriginId(value);
  return DND_5E_SRD_BACKGROUNDS.find((background) => background.id === id);
}

function dnd5eSrdSpeciesById(value: string): Dnd5eSrdCharacterSpecies | undefined {
  const id = normalizeDnd5eSrdOriginId(value);
  return DND_5E_SRD_SPECIES.find((species) => species.id === id);
}

function normalizeDnd5eSrdOriginId(value: string): string {
  return value.trim().replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function dnd5eSrdSpeciesResources(species: Dnd5eSrdCharacterSpecies, proficiencyBonus: number, level = 1): Record<string, Record<string, unknown> & { current: number; max: number }> {
  const normalizedLevel = Math.max(1, Math.floor(level));
  if (species.id === "dragonborn") {
    const resources: Record<string, Record<string, unknown> & { current: number; max: number }> = {
      breathWeapon: { current: proficiencyBonus, max: proficiencyBonus, recovery: "long" }
    };
    if (normalizedLevel >= 5) resources.draconicFlight = { current: 1, max: 1, recovery: "long" };
    return resources;
  }
  if (species.id === "dwarf") {
    return { stonecunning: { current: proficiencyBonus, max: proficiencyBonus, recovery: "long" } };
  }
  if (species.id === "orc") {
    return {
      adrenalineRush: { current: proficiencyBonus, max: proficiencyBonus, recovery: "short" },
      relentlessEndurance: { current: 1, max: 1, recovery: "long" }
    };
  }
  if (species.id === "goliath") {
    const resources: Record<string, Record<string, unknown> & { current: number; max: number }> = {
      giantAncestry: { current: proficiencyBonus, max: proficiencyBonus, recovery: "long" }
    };
    if (normalizedLevel >= 5) resources.largeForm = { current: 1, max: 1, recovery: "long" };
    return resources;
  }
  return {};
}

function defaultDnd5eSrdSpeciesResourcesForData(data: Record<string, unknown>, level: number): Record<string, Record<string, unknown> & { current: number; max: number }> {
  const origin = recordValue(data.origin);
  const speciesId = stringValue(origin.speciesId) ?? stringValue(data.species);
  if (!speciesId) return {};
  const species = dnd5eSrdSpeciesById(speciesId);
  if (!species) return {};
  return dnd5eSrdSpeciesResources(species, dnd5eSrdProficiencyBonusForLevel(level, data.proficiencyBonus), level);
}

function dnd5eSrdApplyDwarvenToughness(data: Record<string, unknown>, levels: number): void {
  const hp = normalizePool(data.hp, 1);
  const bonus = Math.max(1, Math.floor(levels));
  data.hp = {
    current: hp.current + bonus,
    max: hp.max + bonus
  };
}

function dnd5eSrdApplyAbilityScoreIncreases(data: Record<string, unknown>, background: Dnd5eSrdCharacterBackground, increases: unknown): void {
  const source = recordValue(increases);
  const entries = Object.entries(source)
    .map(([ability, value]) => [normalizeDnd5eSrdOriginId(ability), Math.floor(numericValue(value, Number.NaN))] as const)
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  if (entries.length === 0) return;
  const defaultAttributes = defaultDnd5eSrdAttributes();
  const allowedAbilities = new Set(background.abilityScores);
  const seen = new Set<string>();
  for (const [ability, value] of entries) {
    if (!(ability in defaultAttributes)) throw new Error("D&D SRD ability score increases must use a valid ability");
    if (!allowedAbilities.has(ability)) throw new Error(`D&D SRD ${background.name} ability increases can only use ${background.abilityScores.join(", ")}`);
    if (seen.has(ability)) throw new Error("D&D SRD ability score increases cannot repeat an ability");
    if (value !== 1 && value !== 2) throw new Error("D&D SRD ability score increases must be 1 or 2");
    seen.add(ability);
  }
  const values = entries.map(([, value]) => value).sort((a, b) => b - a);
  const validSpread = values.length === 2 && values[0] === 2 && values[1] === 1;
  const validThreeOnes = values.length === 3 && values.every((value) => value === 1);
  if (!validSpread && !validThreeOnes) throw new Error("D&D SRD ability score increases must be +2/+1 or +1/+1/+1");
  const attributes = normalizeNumberRecord(data.attributes, defaultAttributes);
  const applied: Record<string, number> = {};
  for (const [ability, value] of entries) {
    const nextScore = Math.min(20, numericValue(attributes[ability], 10) + value);
    attributes[ability] = nextScore;
    applied[ability] = value;
  }
  data.attributes = attributes;
  data.origin = { ...recordValue(data.origin), abilityScoreIncreases: applied };
}

function dnd5eSrdCurrency(value: unknown): Record<string, number> {
  if (typeof value === "number" && Number.isFinite(value)) return dnd5eSrdCurrencyFromCopper(Math.max(0, Math.floor(value * 100)));
  return dnd5eSrdCurrencyFromCopper(dnd5eSrdCurrencyToCopper(value));
}

function dnd5eSrdCurrencyToCopper(value: unknown): number {
  const source = recordValue(value);
  const cp = Math.max(0, Math.floor(numericValue(source.cp, 0)));
  const sp = Math.max(0, Math.floor(numericValue(source.sp, 0)));
  const ep = Math.max(0, Math.floor(numericValue(source.ep, 0)));
  const gp = Math.max(0, Math.floor(numericValue(source.gp, 0)));
  const pp = Math.max(0, Math.floor(numericValue(source.pp, 0)));
  return cp + sp * 10 + ep * 50 + gp * 100 + pp * 1000;
}

function dnd5eSrdCurrencyFromCopper(copper: number): Record<string, number> {
  const safeCopper = Math.max(0, Math.floor(copper));
  const gp = Math.floor(safeCopper / 100);
  const sp = Math.floor((safeCopper % 100) / 10);
  const cp = safeCopper % 10;
  return { gp, sp, cp };
}

function dnd5eSrdFormatGp(copper: number): string {
  const currency = dnd5eSrdCurrencyFromCopper(copper) as { gp: number; sp: number; cp: number };
  return `${currency.gp + currency.sp / 10 + currency.cp / 100} GP`;
}

function stellarFrontiersAptitudeModifier(actor: Actor, aptitude: string): number {
  const aptitudes = actor.data.aptitudes as Record<string, number> | undefined;
  return numericValue(aptitudes?.[aptitude], 0);
}

function mysticNoirSkillModifier(actor: Actor, skill: string): number {
  const skills = actor.data.skills as Record<string, number> | undefined;
  return numericValue(skills?.[skill], 1);
}

function resolveGenericFantasyFormulaTokens(formula: string, actor: Actor): string {
  return formula
    .replace(/([+-]?)@spellcasting\b/g, (_match, operator: string) => {
      const className = stringValue(actor.data.class) || "";
      const ability = actor.systemId === DND_5E_SRD_SYSTEM_ID ? dnd5eSrdPrimaryAbility(className) : className === "Mender" ? "wisdom" : "charisma";
      const modifier = genericFantasyAttributeModifier(actor, ability);
      const signedModifier = operator === "-" ? -modifier : modifier;
      return operator ? formatSignedNumber(signedModifier) : String(signedModifier);
    })
    .replace(/([+-]?)@attributes\.([A-Za-z0-9_-]+)/g, (_match, operator: string, ability: string) => {
      const modifier = genericFantasyAttributeModifier(actor, ability);
      const signedModifier = operator === "-" ? -modifier : modifier;
      return operator ? formatSignedNumber(signedModifier) : String(signedModifier);
    });
}

function genericFantasyHealingFormula(actor: Actor, data: Record<string, unknown>, spellSlotLevel?: number): string {
  const baseFormula = resolveGenericFantasyFormulaTokens(stringValue(data.healingFormula) ?? "0", actor);
  const spellLevel = Math.floor(numericValue(data.level, 0));
  const slotLevel = spellActionSlotLevel(spellLevel, spellSlotLevel);
  const upcastFormula = stringValue(data.upcastFormula);
  if (spellLevel <= 0 || slotLevel <= spellLevel || !upcastFormula) return baseFormula;
  return appendFormulaTerm(baseFormula, scaleDiceFormula(resolveGenericFantasyFormulaTokens(upcastFormula, actor), slotLevel - spellLevel));
}

function genericFantasyDamageFormula(actor: Actor, data: Record<string, unknown>, spellSlotLevel?: number, formulaKey = "damageFormula", upcastKey = "upcastFormula"): string {
  const baseFormula = resolveGenericFantasyFormulaTokens(stringValue(data[formulaKey]) ?? "0", actor);
  const spellLevel = Math.floor(numericValue(data.level, 0));
  const slotLevel = spellActionSlotLevel(spellLevel, spellSlotLevel);
  const upcastFormula = stringValue(data[upcastKey]);
  if (spellLevel <= 0 || slotLevel <= spellLevel || !upcastFormula) return baseFormula;
  return appendFormulaTerm(baseFormula, scaleDiceFormula(resolveGenericFantasyFormulaTokens(upcastFormula, actor), slotLevel - spellLevel));
}

function dnd5eSrdSpeciesResourceAction(rollId: string): { key: string; label: string } | undefined {
  if (rollId === DND_5E_SRD_DRAGONBORN_BREATH_WEAPON_ROLL_ID) return { key: "breathWeapon", label: "Breath Weapon" };
  if (rollId === DND_5E_SRD_DRACONIC_FLIGHT_ROLL_ID) return { key: "draconicFlight", label: "Draconic Flight" };
  if (rollId === DND_5E_SRD_DWARF_STONECUNNING_ROLL_ID) return { key: "stonecunning", label: "Stonecunning" };
  if (rollId === DND_5E_SRD_GOLIATH_GIANT_ANCESTRY_ROLL_ID) return { key: "giantAncestry", label: "Giant Ancestry" };
  if (rollId === DND_5E_SRD_GOLIATH_LARGE_FORM_ROLL_ID) return { key: "largeForm", label: "Large Form" };
  if (rollId === DND_5E_SRD_ORC_ADRENALINE_RUSH_ROLL_ID) return { key: "adrenalineRush", label: "Adrenaline Rush" };
  if (rollId === DND_5E_SRD_ORC_RELENTLESS_ENDURANCE_ROLL_ID) return { key: "relentlessEndurance", label: "Relentless Endurance" };
  return undefined;
}

function dnd5eSrdHasSpeciesFeature(actor: Actor, featureName: string, resourceKey?: string): boolean {
  const features = normalizeStringArray(actor.data.features);
  const resources = recordValue(actor.data.resources);
  return features.includes(featureName) || Boolean(resourceKey && resourceKey in resources);
}

function dnd5eSrdHasDwarvenToughnessData(data: Record<string, unknown>): boolean {
  return stringValue(data.species) === "Dwarf" || normalizeStringArray(data.features).includes("Dwarven Toughness");
}

function dnd5eSrdHasDragonbornBreathWeapon(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Breath Weapon", "breathWeapon");
}

function dnd5eSrdHasDraconicFlight(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Draconic Flight", "draconicFlight"));
}

function dnd5eSrdHasDwarfStonecunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dwarf" || dnd5eSrdHasSpeciesFeature(actor, "Stonecunning", "stonecunning");
}

function dnd5eSrdHasGoliathGiantAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Giant Ancestry", "giantAncestry");
}

function dnd5eSrdHasGoliathLargeForm(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Large Form", "largeForm"));
}

function dnd5eSrdHasOrcAdrenalineRush(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Adrenaline Rush", "adrenalineRush");
}

function dnd5eSrdHasOrcRelentlessEndurance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Relentless Endurance", "relentlessEndurance");
}

function dnd5eSrdHasSecondWind(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Fighter") return true;
  if (normalizeStringArray(actor.data.features).includes("Second Wind")) return true;
  return "secondWind" in recordValue(actor.data.resources);
}

function dnd5eSrdHasActionSurge(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Fighter" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  if (normalizeStringArray(actor.data.features).includes("Action Surge")) return true;
  return "actionSurge" in recordValue(actor.data.resources);
}

function dnd5eSrdHasTacticalMind(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Fighter" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Tactical Mind");
}

function dnd5eSrdHasTacticalShift(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Fighter" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Tactical Shift");
}

function dnd5eSrdHasChannelDivinity(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Cleric" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  if (normalizeStringArray(actor.data.features).includes("Channel Divinity")) return true;
  return "channelDivinity" in recordValue(actor.data.resources);
}

function dnd5eSrdHasSearUndead(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Cleric" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Sear Undead");
}

function dnd5eSrdHasBardicInspiration(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Bard") return true;
  return normalizeStringArray(actor.data.features).includes("Bardic Inspiration") || "bardicInspiration" in recordValue(actor.data.resources);
}

function dnd5eSrdHasJackOfAllTrades(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Bard" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Jack of All Trades");
}

function dnd5eSrdHasFontOfInspiration(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Bard" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Font of Inspiration");
}

function dnd5eSrdHasLayOnHands(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Paladin") return true;
  return normalizeStringArray(actor.data.features).includes("Lay On Hands") || "layOnHands" in recordValue(actor.data.resources);
}

function dnd5eSrdHasPaladinsSmite(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Paladin" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Paladin's Smite") || "paladinsSmite" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFaithfulSteed(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Paladin" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Faithful Steed") || "faithfulSteed" in recordValue(actor.data.resources);
}

function dnd5eSrdHasHuntersMark(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Ranger") return true;
  return normalizeStringArray(actor.data.features).includes("Favored Enemy") || normalizeStringArray(actor.data.features).includes("Hunter's Mark") || "favoredEnemy" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMartialArts(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk") return true;
  return normalizeStringArray(actor.data.features).includes("Martial Arts");
}

function dnd5eSrdHasMonkFocus(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Monk's Focus") || "focus" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDeflectAttacks(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk" && Math.floor(numericValue(actor.data.level, 1)) >= 3) return true;
  return normalizeStringArray(actor.data.features).includes("Deflect Attacks");
}

function dnd5eSrdHasStunningStrike(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Stunning Strike");
}

function dnd5eSrdHasInnateSorcery(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Sorcerer") return true;
  return normalizeStringArray(actor.data.features).includes("Innate Sorcery") || "innateSorcery" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFontOfMagic(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Sorcerer" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Font of Magic") || "sorceryPoints" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMetamagic(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Sorcerer" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Metamagic");
}

function dnd5eSrdHasSorcerousRestoration(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Sorcerer" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Sorcerous Restoration") || "sorcerousRestoration" in recordValue(actor.data.resources);
}

function dnd5eSrdHasEldritchInvocations(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Warlock") return true;
  return normalizeStringArray(actor.data.features).includes("Eldritch Invocations");
}

function dnd5eSrdHasMagicalCunning(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Warlock" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Magical Cunning") || "magicalCunning" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildShape(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Druid" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Wild Shape") || "wildShape" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildCompanion(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Druid" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Wild Companion");
}

function dnd5eSrdHasWildResurgence(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Druid" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Wild Resurgence") || "wildResurgence" in recordValue(actor.data.resources);
}

function dnd5eSrdHasSneakAttack(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Rogue") return true;
  return normalizeStringArray(actor.data.features).includes("Sneak Attack");
}

function dnd5eSrdHasCunningStrike(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Rogue" && Math.floor(numericValue(actor.data.level, 1)) >= 5) return true;
  return normalizeStringArray(actor.data.features).includes("Cunning Strike");
}

function dnd5eSrdHasRage(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Barbarian") return true;
  return normalizeStringArray(actor.data.features).includes("Rage") || "rage" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDangerSense(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Barbarian" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Danger Sense");
}

function dnd5eSrdHasRecklessAttack(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Barbarian" && Math.floor(numericValue(actor.data.level, 1)) >= 2) return true;
  return normalizeStringArray(actor.data.features).includes("Reckless Attack");
}

function dnd5eSrdApplyClassFeatures(features: string[], className: string, level: number): string[] {
  if (className === "Fighter") return [...new Set([...features, ...dnd5eSrdFighterFeaturesForLevel(level)])];
  if (className === "Barbarian") return [...new Set([...features, ...dnd5eSrdBarbarianFeaturesForLevel(level)])];
  if (className === "Bard") return [...new Set([...features, ...dnd5eSrdBardFeaturesForLevel(level)])];
  if (className === "Cleric") return [...new Set([...features, ...dnd5eSrdClericFeaturesForLevel(level)])];
  if (className === "Paladin") return [...new Set([...features, ...dnd5eSrdPaladinFeaturesForLevel(level)])];
  if (className === "Druid") return [...new Set([...features, ...dnd5eSrdDruidFeaturesForLevel(level)])];
  if (className === "Ranger") return [...new Set([...features, ...dnd5eSrdRangerFeaturesForLevel(level)])];
  if (className === "Monk") return [...new Set([...features, ...dnd5eSrdMonkFeaturesForLevel(level)])];
  if (className === "Sorcerer") return [...new Set([...features, ...dnd5eSrdSorcererFeaturesForLevel(level)])];
  if (className === "Warlock") return [...new Set([...features, ...dnd5eSrdWarlockFeaturesForLevel(level)])];
  if (className === "Wizard") return [...new Set([...features, ...dnd5eSrdWizardFeaturesForLevel(level)])];
  if (className === "Rogue") return [...new Set([...features, ...dnd5eSrdRogueFeaturesForLevel(level)])];
  return features;
}

function dnd5eSrdApplyClassCombat(combat: Record<string, unknown>, className: string, level: number, speed: unknown): Record<string, unknown> {
  if (className !== "Fighter" && className !== "Barbarian" && className !== "Paladin" && className !== "Ranger" && className !== "Monk") return combat;
  const attacksPerAction =
    className === "Fighter"
      ? dnd5eSrdFighterAttacksPerAction(level)
      : className === "Barbarian"
        ? dnd5eSrdBarbarianAttacksPerAction(level)
        : className === "Paladin"
          ? dnd5eSrdPaladinAttacksPerAction(level)
          : className === "Ranger"
            ? dnd5eSrdRangerAttacksPerAction(level)
            : dnd5eSrdMonkAttacksPerAction(level);
  return {
    ...combat,
    attacksPerAction,
    ...(className === "Fighter" && level >= 5 ? { tacticalShift: { movementFt: dnd5eSrdTacticalShiftMovementFromSpeed(speed), opportunityAttacks: false } } : {}),
    ...(className === "Barbarian" && level >= 5 ? { fastMovement: { bonusFt: 10, armorRestriction: "not wearing Heavy armor" } } : {}),
    ...(className === "Monk" && dnd5eSrdMonkUnarmoredMovementBonus(level) > 0 ? { unarmoredMovement: { bonusFt: dnd5eSrdMonkUnarmoredMovementBonus(level), armorRestriction: "not wearing armor or wielding a Shield" } } : {})
  };
}

function dnd5eSrdFighterFeaturesForLevel(level: number): string[] {
  const features = ["Fighting Style", "Second Wind"];
  if (level >= 2) features.push("Action Surge", "Tactical Mind");
  if (level >= 5) features.push("Extra Attack", "Tactical Shift");
  return features;
}

function dnd5eSrdBarbarianFeaturesForLevel(level: number): string[] {
  const features = ["Rage", "Unarmored Defense", "Weapon Mastery"];
  if (level >= 2) features.push("Danger Sense", "Reckless Attack");
  if (level >= 3) features.push("Barbarian Subclass", "Primal Knowledge");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Extra Attack", "Fast Movement");
  return features;
}

function dnd5eSrdBardFeaturesForLevel(level: number): string[] {
  const features = ["Bardic Inspiration", "Spellcasting"];
  if (level >= 2) features.push("Expertise", "Jack of All Trades");
  if (level >= 3) features.push("Bard Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Font of Inspiration");
  return features;
}

function dnd5eSrdClericFeaturesForLevel(level: number): string[] {
  const features = ["Spellcasting", "Divine Order"];
  if (level >= 2) features.push("Channel Divinity", "Divine Spark", "Turn Undead");
  if (level >= 5) features.push("Sear Undead");
  return features;
}

function dnd5eSrdPaladinFeaturesForLevel(level: number): string[] {
  const features = ["Lay On Hands", "Spellcasting", "Weapon Mastery"];
  if (level >= 2) features.push("Fighting Style", "Paladin's Smite");
  if (level >= 3) features.push("Channel Divinity", "Paladin Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Extra Attack", "Faithful Steed");
  return features;
}

function dnd5eSrdDruidFeaturesForLevel(level: number): string[] {
  const features = ["Spellcasting", "Druidic", "Primal Order"];
  if (level >= 2) features.push("Wild Shape", "Wild Companion");
  if (level >= 3) features.push("Druid Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Wild Resurgence");
  if (level >= 7) features.push("Elemental Fury");
  if (level >= 15) features.push("Improved Elemental Fury");
  if (level >= 18) features.push("Beast Spells");
  if (level >= 19) features.push("Epic Boon");
  if (level >= 20) features.push("Archdruid");
  return features;
}

function dnd5eSrdRangerFeaturesForLevel(level: number): string[] {
  const features = ["Spellcasting", "Favored Enemy", "Weapon Mastery"];
  if (level >= 2) features.push("Deft Explorer", "Fighting Style");
  if (level >= 3) features.push("Ranger Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Extra Attack");
  if (level >= 6) features.push("Roving");
  if (level >= 9) features.push("Expertise");
  if (level >= 10) features.push("Tireless");
  if (level >= 13) features.push("Relentless Hunter");
  if (level >= 14) features.push("Nature's Veil");
  if (level >= 17) features.push("Precise Hunter");
  if (level >= 18) features.push("Feral Senses");
  if (level >= 19) features.push("Epic Boon");
  if (level >= 20) features.push("Foe Slayer");
  return features;
}

function dnd5eSrdMonkFeaturesForLevel(level: number): string[] {
  const features = ["Martial Arts", "Unarmored Defense"];
  if (level >= 2) features.push("Monk's Focus", "Flurry of Blows", "Patient Defense", "Step of the Wind", "Unarmored Movement", "Uncanny Metabolism");
  if (level >= 3) features.push("Deflect Attacks", "Monk Subclass");
  if (level >= 4) features.push("Ability Score Improvement", "Slow Fall");
  if (level >= 5) features.push("Extra Attack", "Stunning Strike");
  if (level >= 6) features.push("Empowered Strikes");
  if (level >= 7) features.push("Evasion");
  if (level >= 9) features.push("Acrobatic Movement");
  if (level >= 10) features.push("Heightened Focus", "Self-Restoration");
  if (level >= 13) features.push("Deflect Energy");
  if (level >= 14) features.push("Disciplined Survivor");
  if (level >= 15) features.push("Perfect Focus");
  if (level >= 18) features.push("Superior Defense");
  if (level >= 19) features.push("Epic Boon");
  if (level >= 20) features.push("Body and Mind");
  return features;
}

function dnd5eSrdSorcererFeaturesForLevel(level: number): string[] {
  const features = ["Spellcasting", "Innate Sorcery"];
  if (level >= 2) features.push("Font of Magic", "Metamagic");
  if (level >= 3) features.push("Sorcerer Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Sorcerous Restoration");
  if (level >= 7) features.push("Sorcery Incarnate");
  if (level >= 19) features.push("Epic Boon");
  if (level >= 20) features.push("Arcane Apotheosis");
  return features;
}

function dnd5eSrdWarlockFeaturesForLevel(level: number): string[] {
  const features = ["Eldritch Invocations", "Pact Magic"];
  if (level >= 2) features.push("Magical Cunning");
  if (level >= 3) features.push("Warlock Subclass");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 9) features.push("Contact Patron");
  if (level >= 11) features.push("Mystic Arcanum");
  if (level >= 19) features.push("Epic Boon");
  if (level >= 20) features.push("Eldritch Master");
  return features;
}

function dnd5eSrdWizardFeaturesForLevel(level: number): string[] {
  const features = ["Spellcasting", "Arcane Recovery"];
  if (level >= 2) features.push("Arcane Tradition");
  if (level >= 4) features.push("Ability Score Improvement");
  return features;
}

function dnd5eSrdRogueFeaturesForLevel(level: number): string[] {
  const features = ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"];
  if (level >= 2) features.push("Cunning Action");
  if (level >= 3) features.push("Rogue Subclass", "Steady Aim");
  if (level >= 4) features.push("Ability Score Improvement");
  if (level >= 5) features.push("Cunning Strike", "Uncanny Dodge");
  return features;
}

function dnd5eSrdSecondWindFormula(actor: Actor): string {
  const fighterLevel = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return appendFormulaTerm("1d10", String(fighterLevel));
}

function dnd5eSrdDivineSparkFormula(actor: Actor): string {
  return appendFormulaBonus(`${dnd5eSrdDivineSparkDice(actor)}d8`, genericFantasyAttributeModifier(actor, "wisdom"));
}

function dnd5eSrdDivineSparkDice(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 18) return 4;
  if (level >= 13) return 3;
  if (level >= 7) return 2;
  return 1;
}

function dnd5eSrdSearUndeadFormula(actor: Actor): string {
  return `${Math.max(1, genericFantasyAttributeModifier(actor, "wisdom"))}d8`;
}

function dnd5eSrdRageDamageBonus(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

function dnd5eSrdRageMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "rage",
    damageBonus: dnd5eSrdRageDamageBonus(actor),
    damageBonusRollId: DND_5E_SRD_RAGE_DAMAGE_ROLL_ID,
    resistances: ["Bludgeoning", "Piercing", "Slashing"],
    advantage: ["Strength checks", "Strength saving throws"],
    restrictions: ["Cannot maintain Concentration", "Cannot cast spells"],
    duration: { initial: "until the end of your next turn", maximum: "10 minutes" },
    extension: ["Make an attack roll against an enemy", "Force an enemy to make a saving throw", "Take a Bonus Action to extend your Rage"]
  };
}

function dnd5eSrdBardicInspirationFormula(actor: Actor): string {
  return `1${dnd5eSrdBardicInspirationDie(actor)}`;
}

function dnd5eSrdBardicInspirationDie(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function dnd5eSrdBardicInspirationMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "bardicInspiration",
    die: dnd5eSrdBardicInspirationDie(actor),
    duration: "1 hour",
    trigger: "after seeing or hearing the D20 Test but before knowing whether it succeeds",
    target: "one creature other than yourself within 60 ft.",
    maxUses: dnd5eSrdBardicInspirationMax(actor.data),
    recovery: dnd5eSrdHasFontOfInspiration(actor) ? "short" : "long"
  };
}

function dnd5eSrdLayOnHandsFormula(actor: Actor, requestedAmount?: number): string {
  return String(dnd5eSrdResourceActionAmount(requestedAmount, dnd5eSrdDefaultLayOnHandsAmount(actor)));
}

function dnd5eSrdDefaultLayOnHandsAmount(actor: Actor): number {
  const resources = normalizeDnd5eSrdResources(actor.data.resources, "Paladin", numericValue(actor.data.level, 1), actor.data, { raiseMaxToDefault: true });
  const layOnHands = resources.layOnHands;
  return Math.max(1, Math.min(5, layOnHands?.current ?? dnd5eSrdLayOnHandsMax(numericValue(actor.data.level, 1))));
}

function dnd5eSrdLayOnHandsMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "layOnHands",
    pool: dnd5eSrdLayOnHandsMax(numericValue(actor.data.level, 1)),
    defaultAmount: dnd5eSrdDefaultLayOnHandsAmount(actor),
    chooseAmount: true,
    recovery: "long",
    target: "one creature within touch range"
  };
}

function dnd5eSrdDivineSmiteFormula(_actor: Actor, spellSlotLevel?: number): string {
  const slotLevel = spellActionSlotLevel(1, spellSlotLevel);
  return `${slotLevel + 1}d8`;
}

function dnd5eSrdDivineSmiteMetadata(actor: Actor): Record<string, unknown> {
  return {
    trigger: "immediately after hitting with a Melee weapon or Unarmed Strike",
    damageType: "Radiant",
    spellSlotLevel: 1,
    upcast: "+1d8 per spell slot level above 1",
    creatureTypeBonus: { types: ["Fiend", "Undead"], formula: "1d8" },
    freeCastResource: dnd5eSrdHasPaladinsSmite(actor) ? "paladinsSmite" : undefined,
    recovery: "long"
  };
}

function dnd5eSrdHuntersMarkFormula(actor: Actor): string {
  return numericValue(actor.data.level, 1) >= 20 ? "1d10" : "1d6";
}

function dnd5eSrdHuntersMarkMetadata(actor: Actor): Record<string, unknown> {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return {
    resource: "favoredEnemy",
    spell: "Hunter's Mark",
    damageType: "Force",
    trigger: "hit the marked target with an attack roll",
    concentration: true,
    duration: "up to 1 hour",
    trackingAdvantage: ["Wisdom (Perception)", "Wisdom (Survival)"],
    freeCastResource: "favoredEnemy",
    freeUses: dnd5eSrdFavoredEnemyMax(level),
    upcastDuration: { level3: "up to 8 hours", level5: "up to 24 hours" },
    ...(level >= 20 ? { foeSlayer: true } : {})
  };
}

function dnd5eSrdMartialArtsFormula(actor: Actor): string {
  return appendFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdMartialArtsDie(actor: Actor): string {
  return dnd5eSrdMartialArtsDieForLevel(numericValue(actor.data.level, 1));
}

function dnd5eSrdMartialArtsDieForLevel(level: number): string {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 17) return "d12";
  if (normalized >= 11) return "d10";
  if (normalized >= 5) return "d8";
  return "d6";
}

function dnd5eSrdMartialArtsMetadata(actor: Actor): Record<string, unknown> {
  return {
    damageType: dnd5eSrdHasEmpoweredStrikes(actor) ? ["Bludgeoning", "Force"] : "Bludgeoning",
    martialArtsDie: dnd5eSrdMartialArtsDie(actor),
    bonusUnarmedStrike: true,
    dexterousAttacks: true,
    eligibleWeapons: ["Unarmed Strike", "Simple Melee weapons", "Martial Melee weapons with the Light property"],
    armorRestriction: "not wearing armor or wielding a Shield"
  };
}

function dnd5eSrdFlurryOfBlowsMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "focus",
    cost: 1,
    action: "Bonus Action",
    unarmedStrikes: numericValue(actor.data.level, 1) >= 10 ? 3 : 2,
    martialArtsDie: dnd5eSrdMartialArtsDie(actor),
    heightenedFocus: numericValue(actor.data.level, 1) >= 10
  };
}

function dnd5eSrdPatientDefenseMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "focus",
    cost: 1,
    action: "Bonus Action",
    freeAction: "Disengage",
    focusedAction: ["Disengage", "Dodge"],
    temporaryHitPointsFormula: numericValue(actor.data.level, 1) >= 10 ? `2${dnd5eSrdMartialArtsDie(actor)}` : undefined
  };
}

function dnd5eSrdStepOfTheWindMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "focus",
    cost: 1,
    action: "Bonus Action",
    freeAction: "Dash",
    focusedAction: ["Disengage", "Dash"],
    jumpDistance: "doubled for the turn",
    heightenedFocus: numericValue(actor.data.level, 1) >= 10
  };
}

function dnd5eSrdUncannyMetabolismFormula(actor: Actor): string {
  return appendFormulaTerm(`1${dnd5eSrdMartialArtsDie(actor)}`, String(Math.max(1, Math.floor(numericValue(actor.data.level, 1)))));
}

function dnd5eSrdUncannyMetabolismMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "uncannyMetabolism",
    recovery: "long",
    trigger: "when rolling Initiative",
    restores: "all expended Focus Points",
    healing: "Monk level plus one Martial Arts die",
    focusRestoredTo: dnd5eSrdMonkFocusMax(numericValue(actor.data.level, 1))
  };
}

function dnd5eSrdDeflectAttacksReductionFormula(actor: Actor): string {
  return appendFormulaTerm(appendFormulaBonus("1d10", genericFantasyAttributeModifier(actor, "dexterity")), String(Math.max(1, Math.floor(numericValue(actor.data.level, 1)))));
}

function dnd5eSrdDeflectAttacksDamageFormula(actor: Actor): string {
  return appendFormulaBonus(`2${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdDeflectAttacksMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "focus",
    cost: 1,
    reaction: true,
    reductionFormula: dnd5eSrdDeflectAttacksReductionFormula(actor),
    trigger: "when an attack roll hits you",
    redirectTrigger: "after reducing the attack damage to 0",
    damageType: dnd5eSrdHasDeflectEnergy(actor) ? "Original attack damage type" : ["Bludgeoning", "Piercing", "Slashing"],
    range: { meleeAttack: "5 ft.", rangedAttack: "60 ft." },
    save: { ability: "dexterity", dc: dnd5eSrdMonkSaveDc(actor) }
  };
}

function dnd5eSrdStunningStrikeMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "focus",
    cost: 1,
    trigger: "once per turn when you hit with a Monk weapon or Unarmed Strike",
    save: { ability: "constitution", dc: dnd5eSrdMonkSaveDc(actor) },
    failure: { condition: "Stunned", duration: "until the start of your next turn" },
    success: { speed: "halved until the start of your next turn", nextAttackAgainstTarget: "Advantage" }
  };
}

function dnd5eSrdMonkSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "wisdom");
}

function dnd5eSrdInnateSorceryMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "innateSorcery",
    uses: 2,
    recovery: "long",
    action: "Bonus Action",
    duration: "1 minute",
    spellSaveDcBonus: 1,
    spellSaveDc: dnd5eSrdSpellSaveDc(actor) + 1,
    spellAttackAdvantage: true
  };
}

function dnd5eSrdConvertSpellSlotMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "sorceryPoints",
    gain: "Sorcery Points equal to the expended spell slot level",
    max: dnd5eSrdSorceryPointsMax(numericValue(actor.data.level, 1)),
    action: "no action required",
    availableSlotLevels: dnd5eSrdAvailableSpellSlotLevels(actor)
  };
}

function dnd5eSrdCreateSpellSlotMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "sorceryPoints",
    action: "Bonus Action",
    createdSlotExpires: "Long Rest",
    costs: dnd5eSrdCreateSpellSlotCosts().map((entry) => ({ spellSlotLevel: entry.slotLevel, sorceryPointCost: entry.cost, minimumSorcererLevel: entry.minimumLevel })),
    availableSlotLevels: dnd5eSrdAvailableCreatableSorcererSlotLevels(numericValue(actor.data.level, 1))
  };
}

function dnd5eSrdMetamagicEmpoweredMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "sorceryPoints",
    cost: 1,
    trigger: "when rolling damage for a spell",
    rerollDamageDiceUpTo: Math.max(1, genericFantasyAttributeModifier(actor, "charisma")),
    canCombineWithOtherMetamagic: true
  };
}

function dnd5eSrdMetamagicQuickenedMetadata(_actor: Actor): Record<string, unknown> {
  return {
    resource: "sorceryPoints",
    cost: 2,
    trigger: "when casting a spell with an Action casting time",
    castingTime: "Bonus Action",
    restriction: "cannot combine with another level 1+ spell on the same turn"
  };
}

function dnd5eSrdEldritchInvocationsMetadata(actor: Actor): Record<string, unknown> {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return {
    known: dnd5eSrdEldritchInvocationsKnown(level),
    pactOptions: ["Pact of the Blade", "Pact of the Chain", "Pact of the Tome"],
    examples: level >= 2 ? ["Agonizing Blast", "Devil's Sight", "Eldritch Mind"] : ["Pact of the Tome"],
    replacement: "one invocation can be replaced when gaining a Warlock level",
    repeatable: "only when an invocation says it is repeatable"
  };
}

function dnd5eSrdMagicalCunningMetadata(actor: Actor): Record<string, unknown> {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return {
    resource: "magicalCunning",
    action: "1 minute rite",
    restores: "expended Pact Magic spell slots",
    maxRecoveredSlots: dnd5eSrdMagicalCunningLimit(level),
    pactMagic: {
      slotLevel: dnd5eSrdWarlockPactMagicSlotLevel(level),
      maxSlots: dnd5eSrdWarlockPactMagicSlotCount(level),
      recovery: "short"
    },
    recovery: "long",
    eldritchMaster: level >= 20
  };
}

function dnd5eSrdDragonbornBreathWeaponFormula(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return `${dice}d10`;
}

function dnd5eSrdDragonbornBreathWeaponMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "breathWeapon",
    action: "replace one attack from the Attack action",
    shapes: ["15-foot Cone", "30-foot Line"],
    save: { ability: "dexterity", dc: 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "constitution"), success: "half" },
    damageType: stringValue(recordValue(actor.data.origin).draconicAncestryDamageType) ?? "chosen Draconic Ancestry",
    damageTypes: ["Acid", "Cold", "Fire", "Lightning", "Poison"],
    uses: dnd5eSrdProficiencyBonus(actor),
    recovery: "long"
  };
}

function dnd5eSrdDraconicFlightMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "draconicFlight",
    action: "Bonus Action",
    duration: "10 minutes",
    flySpeed: numericValue(actor.data.speed, 30),
    endsWhen: ["retracted", "Incapacitated"],
    recovery: "long"
  };
}

function dnd5eSrdStonecunningMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "stonecunning",
    action: "Bonus Action",
    sense: "Tremorsense",
    rangeFt: 60,
    duration: "10 minutes",
    requirement: "on or touching a natural or worked stone surface",
    uses: dnd5eSrdProficiencyBonus(actor),
    recovery: "long"
  };
}

function dnd5eSrdGiantAncestryMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "giantAncestry",
    uses: dnd5eSrdProficiencyBonus(actor),
    recovery: "long",
    options: [
      { name: "Cloud's Jaunt", action: "Bonus Action", effect: "teleport up to 30 feet" },
      { name: "Fire's Burn", trigger: "hit and deal damage", damageFormula: "1d10", damageType: "Fire" },
      { name: "Frost's Chill", trigger: "hit and deal damage", damageFormula: "1d6", damageType: "Cold", speedReductionFt: 10 },
      { name: "Hill's Tumble", trigger: "hit and deal damage", condition: "Prone" },
      { name: "Stone's Endurance", reaction: true, reductionFormula: appendFormulaBonus("1d12", genericFantasyAttributeModifier(actor, "constitution")) },
      { name: "Storm's Thunder", reaction: true, damageFormula: "1d8", damageType: "Thunder", rangeFt: 60 }
    ]
  };
}

function dnd5eSrdLargeFormMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "largeForm",
    action: "Bonus Action",
    size: "Large",
    duration: "10 minutes",
    strengthCheckAdvantage: true,
    speedBonusFt: 10,
    speedWhileActive: numericValue(actor.data.speed, 35) + 10,
    recovery: "long"
  };
}

function dnd5eSrdAdrenalineRushFormula(actor: Actor): string {
  return String(dnd5eSrdProficiencyBonus(actor));
}

function dnd5eSrdAdrenalineRushMetadata(actor: Actor): Record<string, unknown> {
  return {
    resource: "adrenalineRush",
    action: "Bonus Action",
    actionGranted: "Dash",
    temporaryHitPoints: dnd5eSrdProficiencyBonus(actor),
    recovery: "short"
  };
}

function dnd5eSrdRelentlessEnduranceMetadata(): Record<string, unknown> {
  return {
    resource: "relentlessEndurance",
    trigger: "reduced to 0 HP but not killed outright",
    result: "drop to 1 HP instead",
    recovery: "long"
  };
}

function dnd5eSrdAvailableSpellSlotLevels(actor: Actor): number[] {
  const className = stringValue(actor.data.class) || "Sorcerer";
  const slots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, className, numericValue(actor.data.level, 1), { raiseMaxToDefault: true });
  return Object.keys(slots)
    .map((key) => /^level(\d+)$/.exec(key)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .sort((left, right) => left - right);
}

function dnd5eSrdAvailableCreatableSorcererSlotLevels(level: number): number[] {
  const normalized = Math.max(1, Math.floor(level));
  return dnd5eSrdCreateSpellSlotCosts().filter((entry) => normalized >= entry.minimumLevel).map((entry) => entry.slotLevel);
}

function dnd5eSrdCreateSpellSlotCost(slotLevel: number, sorcererLevel: number): number {
  const normalizedSlotLevel = Math.max(1, Math.floor(slotLevel));
  const entry = dnd5eSrdCreateSpellSlotCosts().find((cost) => cost.slotLevel === normalizedSlotLevel);
  if (!entry) throw new Error("Font of Magic can create spell slots no higher than level 5");
  if (Math.max(1, Math.floor(sorcererLevel)) < entry.minimumLevel) throw new Error(`Creating a level ${normalizedSlotLevel} spell slot requires Sorcerer level ${entry.minimumLevel}`);
  return entry.cost;
}

function dnd5eSrdCreateSpellSlotCosts(): Array<{ slotLevel: number; cost: number; minimumLevel: number }> {
  return [
    { slotLevel: 1, cost: 2, minimumLevel: 2 },
    { slotLevel: 2, cost: 3, minimumLevel: 3 },
    { slotLevel: 3, cost: 5, minimumLevel: 5 },
    { slotLevel: 4, cost: 6, minimumLevel: 7 },
    { slotLevel: 5, cost: 7, minimumLevel: 9 }
  ];
}

function dnd5eSrdSorcerousRestorationLimit(level: number): number {
  return Math.floor(Math.max(1, Math.floor(level)) / 2);
}

function dnd5eSrdHasEmpoweredStrikes(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk" && Math.floor(numericValue(actor.data.level, 1)) >= 6) return true;
  return normalizeStringArray(actor.data.features).includes("Empowered Strikes");
}

function dnd5eSrdHasDeflectEnergy(actor: Actor): boolean {
  if (stringValue(actor.data.class) === "Monk" && Math.floor(numericValue(actor.data.level, 1)) >= 13) return true;
  return normalizeStringArray(actor.data.features).includes("Deflect Energy");
}

function dnd5eSrdWildShapeMetadata(actor: Actor): Record<string, unknown> {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return {
    resource: "wildShape",
    action: "Bonus Action",
    formType: "Beast",
    maxUses: dnd5eSrdWildShapeMax(level),
    recovery: { short: 1, long: "all" },
    durationHours: Math.max(1, Math.floor(level / 2)),
    temporaryHitPoints: level,
    knownForms: dnd5eSrdWildShapeKnownForms(level),
    maxChallengeRating: dnd5eSrdWildShapeMaxChallengeRating(level),
    flySpeedAllowed: level >= 8
  };
}

function dnd5eSrdSneakAttackFormula(actor: Actor): string {
  return `${dnd5eSrdSneakAttackDice(actor)}d6`;
}

function dnd5eSrdSneakAttackDice(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return Math.ceil(level / 2);
}

function dnd5eSrdSneakAttackMetadata(actor: Actor): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    trigger: "one eligible weapon attack hit per turn",
    damageType: "Weapon",
    requirements: ["Finesse or Ranged weapon", "Advantage or qualifying adjacent enemy", "No Disadvantage"],
    limit: "once per turn"
  };
  if (dnd5eSrdHasCunningStrike(actor)) metadata.cunningStrike = dnd5eSrdCunningStrikeMetadata(actor);
  return metadata;
}

function dnd5eSrdCunningStrikeMetadata(actor: Actor): Record<string, unknown> {
  const dice = dnd5eSrdSneakAttackDice(actor);
  return {
    trigger: "after dealing Sneak Attack damage",
    saveDc: dnd5eSrdRogueSaveDc(actor),
    sneakAttackDice: dice,
    options: [
      { id: "poison", name: "Poison", costDice: 1, save: { ability: "constitution", dc: dnd5eSrdRogueSaveDc(actor) }, condition: "Poisoned" },
      { id: "trip", name: "Trip", costDice: 1, save: { ability: "dexterity", dc: dnd5eSrdRogueSaveDc(actor) }, condition: "Prone" },
      { id: "withdraw", name: "Withdraw", costDice: 1, movementFt: Math.floor(numericValue(actor.data.speed, 30) / 2), opportunityAttacks: false }
    ],
    reducedSneakAttackFormula: `${Math.max(0, dice - 1)}d6`
  };
}

function dnd5eSrdRogueSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "dexterity");
}

function dnd5eSrdSpellSaveDc(actor: Actor): number {
  const className = stringValue(actor.data.class) || "Fighter";
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, dnd5eSrdPrimaryAbility(className));
}

function dnd5eSrdAttacksPerAction(actor: Actor): number {
  const hasExtraAttack = normalizeStringArray(actor.data.features).includes("Extra Attack");
  const className = stringValue(actor.data.class);
  if (className === "Barbarian") return Math.max(hasExtraAttack ? 2 : 1, dnd5eSrdBarbarianAttacksPerAction(numericValue(actor.data.level, 1)));
  if (className === "Paladin") return Math.max(hasExtraAttack ? 2 : 1, dnd5eSrdPaladinAttacksPerAction(numericValue(actor.data.level, 1)));
  if (className === "Ranger") return Math.max(hasExtraAttack ? 2 : 1, dnd5eSrdRangerAttacksPerAction(numericValue(actor.data.level, 1)));
  if (className === "Monk") return Math.max(hasExtraAttack ? 2 : 1, dnd5eSrdMonkAttacksPerAction(numericValue(actor.data.level, 1)));
  if (className !== "Fighter" && !hasExtraAttack) return 1;
  return Math.max(hasExtraAttack ? 2 : 1, dnd5eSrdFighterAttacksPerAction(numericValue(actor.data.level, 1)));
}

function dnd5eSrdFighterAttacksPerAction(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 20) return 4;
  if (normalized >= 11) return 3;
  if (normalized >= 5) return 2;
  return 1;
}

function dnd5eSrdBarbarianAttacksPerAction(level: number): number {
  return Math.max(1, Math.floor(level)) >= 5 ? 2 : 1;
}

function dnd5eSrdPaladinAttacksPerAction(level: number): number {
  return Math.max(1, Math.floor(level)) >= 5 ? 2 : 1;
}

function dnd5eSrdRangerAttacksPerAction(level: number): number {
  return Math.max(1, Math.floor(level)) >= 5 ? 2 : 1;
}

function dnd5eSrdMonkAttacksPerAction(level: number): number {
  return Math.max(1, Math.floor(level)) >= 5 ? 2 : 1;
}

function dnd5eSrdMonkUnarmoredMovementBonus(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 18) return 30;
  if (normalized >= 14) return 25;
  if (normalized >= 10) return 20;
  if (normalized >= 6) return 15;
  if (normalized >= 2) return 10;
  return 0;
}

function dnd5eSrdTacticalShiftMovement(actor: Actor): number {
  return dnd5eSrdTacticalShiftMovementFromSpeed(actor.data.speed);
}

function dnd5eSrdTacticalShiftMovementFromSpeed(speed: unknown): number {
  return Math.floor(numericValue(speed, 30) / 2);
}

function dnd5eSrdIsWeaponDamageRoll(actor: Actor, items: Item[], rollId: string): boolean {
  return items.filter((item) => itemBelongsToActor(actor, item)).some((item) => {
    const data = recordValue(item.data);
    if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
    return rollId === `item-${item.id}-damage` || rollId === `item-${item.id}-versatile-damage`;
  });
}

function dnd5eSrdMonkWeaponDamageFormulaForRoll(actor: Actor, items: Item[], rollId: string): string | undefined {
  if (!dnd5eSrdHasMartialArts(actor)) return undefined;
  const item = actionItemForRoll(actor, items, rollId, ["item"]);
  if (!item) return undefined;
  const data = recordValue(item.data);
  if (!dnd5eSrdIsMonkWeapon(data)) return undefined;
  const weaponDamage = rollId === `item-${item.id}-versatile-damage` ? stringValue(data.versatileDamage) : stringValue(data.damage);
  const damageDie = dnd5eSrdLargerDamageDie(weaponDamage, `1${dnd5eSrdMartialArtsDie(actor)}`);
  return appendFormulaBonus(damageDie, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdIsMonkWeapon(data: Record<string, unknown>): boolean {
  if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
  const properties = normalizeStringArray(data.properties).map((property) => property.toLowerCase());
  return properties.includes("light") || properties.includes("thrown") || properties.includes("versatile") || stringValue(data.compendiumId) === "spear";
}

function dnd5eSrdLargerDamageDie(left: string | undefined, right: string): string {
  const leftSides = dnd5eSrdDamageDieSides(left);
  const rightSides = dnd5eSrdDamageDieSides(right);
  if (!left || rightSides > leftSides) return right;
  return left;
}

function dnd5eSrdDamageDieSides(value: string | undefined): number {
  const match = /^1d(\d+)$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : 0;
}

function dnd5eSrdApplyShortRestResourceLimits(actor: Actor, data: Record<string, unknown>): Record<string, unknown> {
  const limitedRecovery = dnd5eSrdShortRestLimitedResources(actor);
  if (Object.keys(limitedRecovery).length === 0) return data;
  const className = stringValue(actor.data.class) || "Fighter";
  const level = numericValue(actor.data.level, 1);
  const beforeResources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
  const afterResources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  const resources = { ...afterResources };
  for (const [resourceId, maxRecovered] of Object.entries(limitedRecovery)) {
    const before = beforeResources[resourceId];
    const after = afterResources[resourceId];
    if (!before || !after) continue;
    const recovered = Math.min(maxRecovered, Math.max(0, before.max - before.current));
    resources[resourceId] = { ...after, current: Math.min(after.max, before.current + recovered) };
  }
  return {
    ...data,
    resources
  };
}

function dnd5eSrdApplyLongRestResourceLimits(actor: Actor, data: Record<string, unknown>): Record<string, unknown> {
  const className = stringValue(actor.data.class) || "Fighter";
  const level = numericValue(actor.data.level, 1);
  const afterResources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  return {
    ...data,
    resources: Object.fromEntries(Object.entries(afterResources).map(([key, pool]) => [key, { ...pool, current: stringValue(pool.recovery) === "long" || stringValue(pool.recovery) === "short" ? pool.max : pool.current }]))
  };
}

function dnd5eSrdApplyPactMagicRecovery(actor: Actor, data: Record<string, unknown>, restType: SystemRestType): { data: Record<string, unknown>; recovered?: Record<string, unknown> } {
  const className = stringValue(actor.data.class) || "";
  if (restType !== "short" || className !== "Warlock") return { data };
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const spellSlots = normalizeDnd5eSrdSpellSlots(data.spellSlots, className, level, { raiseMaxToDefault: true });
  const recoveredSpellSlots: Record<string, number> = {};
  for (const [key, slot] of Object.entries(spellSlots)) {
    if (stringValue(slot.recovery) !== "short") continue;
    const recovered = Math.max(0, slot.max - slot.current);
    if (recovered <= 0) continue;
    spellSlots[key] = { ...slot, current: slot.max };
    recoveredSpellSlots[key] = recovered;
  }
  const nextData = { ...data, spellSlots };
  return Object.keys(recoveredSpellSlots).length > 0 ? { data: nextData, recovered: { spellSlots: recoveredSpellSlots } } : { data: nextData };
}

function dnd5eSrdApplyArcaneRecovery(actor: Actor, data: Record<string, unknown>, restType: SystemRestType, options: SystemRestOptions): { data: Record<string, unknown>; recovered?: Record<string, unknown> } {
  const selection = options.arcaneRecovery;
  if (!selection) return { data };
  if (restType !== "short") throw new Error("Arcane Recovery can only be used on a Short Rest");
  const className = stringValue(actor.data.class) || "";
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (className !== "Wizard" && !normalizeStringArray(actor.data.features).includes("Arcane Recovery") && !("arcaneRecovery" in recordValue(actor.data.resources))) {
    throw new Error("Arcane Recovery is only available to Wizards");
  }
  const resources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  const arcaneRecovery = resources.arcaneRecovery;
  if (!arcaneRecovery || arcaneRecovery.current <= 0) throw new Error("Arcane Recovery is unavailable until a Long Rest");
  const spellSlots = normalizeDnd5eSrdSpellSlots(data.spellSlots, className, level, { raiseMaxToDefault: true });
  const recoveredSpellSlots: Record<string, number> = {};
  let totalLevels = 0;
  for (const [key, rawAmount] of Object.entries(selection)) {
    const amount = Math.floor(numericValue(rawAmount, 0));
    if (amount <= 0) continue;
    const match = /^level([1-9]\d*)$/.exec(key);
    if (!match) throw new Error(`Unknown spell slot level: ${key}`);
    const slotLevel = Number(match[1]);
    if (slotLevel >= 6) throw new Error("Arcane Recovery cannot recover spell slots of 6th level or higher");
    const slot = spellSlots[key];
    if (!slot) throw new Error(`No ${formatOrdinal(slotLevel)}-level spell slot pool is available`);
    const expended = Math.max(0, slot.max - slot.current);
    if (amount > expended) throw new Error(`Cannot recover ${amount} ${formatOrdinal(slotLevel)}-level spell slots; only ${expended} are expended`);
    recoveredSpellSlots[key] = amount;
    totalLevels += slotLevel * amount;
  }
  if (totalLevels <= 0) throw new Error("Arcane Recovery requires at least one expended spell slot");
  const limit = dnd5eSrdArcaneRecoverySlotLevelLimit(level);
  if (totalLevels > limit) throw new Error(`Arcane Recovery can recover up to ${limit} combined spell slot levels`);
  for (const [key, amount] of Object.entries(recoveredSpellSlots)) {
    const slot = spellSlots[key]!;
    spellSlots[key] = { ...slot, current: Math.min(slot.max, slot.current + amount) };
  }
  resources.arcaneRecovery = { ...arcaneRecovery, current: arcaneRecovery.current - 1 };
  return {
    data: { ...data, resources, spellSlots },
    recovered: { spellSlots: recoveredSpellSlots, arcaneRecovery: { totalLevels, limit }, resourcesSpent: { arcaneRecovery: 1 } }
  };
}

function dnd5eSrdArcaneRecoverySlotLevelLimit(level: number): number {
  return Math.ceil(Math.max(1, Math.floor(level)) / 2);
}

function dnd5eSrdApplySorcerousRestoration(actor: Actor, data: Record<string, unknown>, restType: SystemRestType): { data: Record<string, unknown>; recovered?: Record<string, unknown> } {
  if (restType !== "short") return { data };
  if (!dnd5eSrdHasSorcerousRestoration(actor)) return { data };
  const className = stringValue(actor.data.class) || "Sorcerer";
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const resources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  const sorceryPoints = resources.sorceryPoints;
  const restoration = resources.sorcerousRestoration;
  if (!sorceryPoints || !restoration || restoration.current <= 0 || sorceryPoints.current >= sorceryPoints.max) return { data };
  const limit = dnd5eSrdSorcerousRestorationLimit(level);
  const restored = Math.min(limit, sorceryPoints.max - sorceryPoints.current);
  if (restored <= 0) return { data };
  resources.sorceryPoints = { ...sorceryPoints, current: sorceryPoints.current + restored };
  resources.sorcerousRestoration = { ...restoration, current: restoration.current - 1 };
  return {
    data: { ...data, resources },
    recovered: { sorcerousRestoration: { restoredSorceryPoints: restored, limit }, resourcesSpent: { sorcerousRestoration: 1 } }
  };
}

function dnd5eSrdRestRecovered(actor: Actor, data: Record<string, unknown>, recovered: Record<string, unknown>): Record<string, unknown> {
  const className = stringValue(actor.data.class) || "Fighter";
  const level = numericValue(actor.data.level, 1);
  const beforeResources = normalizeDnd5eSrdResources(actor.data.resources, className, level, actor.data, { raiseMaxToDefault: true });
  const afterResources = normalizeDnd5eSrdResources(data.resources, className, level, data, { raiseMaxToDefault: true });
  const resourcesRecovered = { ...recordValue(recovered.resources) };
  for (const [resourceId, after] of Object.entries(afterResources)) {
    const before = beforeResources[resourceId];
    if (!before) continue;
    const amount = Math.max(0, after.current - before.current);
    if (amount > 0) resourcesRecovered[resourceId] = amount;
    else delete resourcesRecovered[resourceId];
  }
  return { ...recovered, resources: resourcesRecovered };
}

function dnd5eSrdShortRestLimitedResources(actor: Actor): Record<string, number> {
  const resources = recordValue(actor.data.resources);
  const limited: Record<string, number> = {};
  if (dnd5eSrdHasSecondWind(actor) || "secondWind" in resources) limited.secondWind = 1;
  if (dnd5eSrdHasRage(actor) || "rage" in resources) limited.rage = 1;
  if (dnd5eSrdHasChannelDivinity(actor) || "channelDivinity" in resources) limited.channelDivinity = 1;
  if (dnd5eSrdHasWildShape(actor) || "wildShape" in resources) limited.wildShape = 1;
  return limited;
}

function formatOrdinal(value: number): string {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

function spellActionSlotLevel(spellLevel: number, requestedSlotLevel: number | undefined): number {
  const requested = typeof requestedSlotLevel === "number" && Number.isFinite(requestedSlotLevel) ? Math.floor(requestedSlotLevel) : spellLevel;
  return Math.max(spellLevel, requested);
}

function dnd5eSrdSpellActionSlotLevel(actor: Actor, items: Item[], rollId: string, options: SystemActionUseOptions): number | undefined {
  if (typeof options.spellSlotLevel === "number" && Number.isFinite(options.spellSlotLevel)) return Math.floor(options.spellSlotLevel);
  if (stringValue(actor.data.class) !== "Warlock") return undefined;
  const item = actionItemForRoll(actor, items, rollId, ["spell"]);
  if (!item || item.type !== "spell") return undefined;
  const spellLevel = Math.floor(numericValue(recordValue(item.data).level, 0));
  if (spellLevel <= 0) return undefined;
  return dnd5eSrdWarlockPactMagicSlotLevel(numericValue(actor.data.level, 1));
}

function useDnd5eSrdSpellAction(actor: Actor, items: Item[], rollId: string, options: SystemActionUseOptions): SystemActionUseResult | undefined {
  if (stringValue(actor.data.class) !== "Warlock") return undefined;
  const item = actionItemForRoll(actor, items, rollId, ["spell"]);
  if (!item || item.type !== "spell" || !rollId.startsWith(`spell-${item.id}-`)) return undefined;
  const spellLevel = Math.floor(numericValue(recordValue(item.data).level, 0));
  if (spellLevel <= 0) return { systemId: DND_5E_SRD_SYSTEM_ID, actorId: actor.id, rollId, consumed: [], data: { ...actor.data }, items: [] };
  const level = numericValue(actor.data.level, 1);
  const slotLevel = spellActionSlotLevel(spellLevel, dnd5eSrdSpellActionSlotLevel(actor, items, rollId, options));
  const spellSlots = normalizeDnd5eSrdSpellSlots(actor.data.spellSlots, "Warlock", level, { raiseMaxToDefault: true });
  const result = consumeResourcePool(spellSlots, `level${slotLevel}`, 1, `Level ${slotLevel} Spell Slot`, "spellSlot");
  return {
    systemId: DND_5E_SRD_SYSTEM_ID,
    actorId: actor.id,
    rollId,
    slotLevel,
    consumed: [result.consumed],
    data: { ...actor.data, spellSlots: result.pools },
    items: []
  };
}

function dnd5eSrdResourceActionAmount(requestedAmount: number | undefined, fallback: number): number {
  const requested = typeof requestedAmount === "number" && Number.isFinite(requestedAmount) ? Math.floor(requestedAmount) : fallback;
  return Math.max(1, requested);
}

function scaleDiceFormula(formula: string, multiplier: number): string {
  const normalized = formula.trim();
  const match = /^(\d*)d(\d+)$/i.exec(normalized);
  if (!match) {
    return Array.from({ length: Math.max(1, multiplier) }, () => normalized).join("+");
  }
  const count = numericValue(match[1] ? Number(match[1]) : 1, 1);
  return `${count * Math.max(1, multiplier)}d${match[2]}`;
}

function itemQuantity(data: Record<string, unknown>): number {
  return Math.max(0, numericValue(data.quantity, 1));
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function importSource(input: CharacterImportInput): Record<string, unknown> {
  return { ...recordValue(input.data), ...recordValue(input) };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = numericValue(value, fallback);
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeNumberRecord(value: unknown, defaults: Record<string, number>): Record<string, number> {
  const source = recordValue(value);
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, numericValue(source[key], fallback)]));
}

function normalizePool(value: unknown, defaultMax: number): { current: number; max: number } {
  const source = recordValue(value);
  const max = Math.max(1, numericValue(source.max, defaultMax));
  const current = Math.max(0, Math.min(max, numericValue(source.current, max)));
  return { current, max };
}

function normalizeResourcePools(
  value: unknown,
  defaults: Record<string, Record<string, unknown>> = {},
  options: { raiseMaxToDefault?: boolean } = {}
): Record<string, Record<string, unknown> & { current: number; max: number }> {
  const source = recordValue(value);
  const keys = new Set([...Object.keys(defaults), ...Object.keys(source)]);
  return Object.fromEntries(
    [...keys].map((key) => {
      const fallback = recordValue(defaults[key]);
      const currentSource = recordValue(source[key]);
      const fallbackMax = numericValue(fallback.max, 0);
      const sourceMax = numericValue(currentSource.max, fallbackMax);
      const max = Math.max(0, options.raiseMaxToDefault ? Math.max(sourceMax, fallbackMax) : sourceMax);
      const current = Math.max(0, Math.min(max, numericValue(currentSource.current, numericValue(fallback.current, max))));
      return [key, { ...fallback, ...currentSource, current, max }];
    })
  );
}

function recoverResourcePools(value: unknown, restType: SystemRestType): { value: Record<string, Record<string, unknown> & { current: number; max: number }>; recovered: Record<string, number> } {
  const pools = normalizeResourcePools(value);
  const recovered: Record<string, number> = {};
  for (const [key, pool] of Object.entries(pools)) {
    const canRecover = restType === "long" || stringValue(pool.recovery) === "short";
    if (!canRecover) continue;
    const delta = pool.max - pool.current;
    if (delta > 0) {
      pool.current = pool.max;
      recovered[key] = delta;
    }
  }
  return { value: pools, recovered };
}

function consumeResourcePool(
  value: unknown,
  key: string,
  amount: number,
  label: string,
  type: SystemActionConsumptionType
): { pools: Record<string, Record<string, unknown> & { current: number; max: number }>; consumed: SystemActionConsumption } {
  const pools = normalizeResourcePools(value);
  const pool = pools[key];
  if (!pool || pool.current < amount) throw new Error(`Insufficient ${label.toLowerCase()}`);
  pool.current -= amount;
  return {
    pools,
    consumed: {
      type,
      key,
      label,
      amount,
      remaining: pool.current
    }
  };
}

function defaultGenericFantasyResources(className: string): Record<string, Record<string, unknown>> {
  if (className === "Mender") return { fieldPrayer: { current: 1, max: 1, recovery: "long" } };
  if (className === "Guardian") return { secondWind: { current: 1, max: 1, recovery: "short" } };
  return {};
}

function defaultGenericFantasySpellSlots(className: string, level: number): Record<string, Record<string, unknown>> {
  if (className !== "Mender") return {};
  const levelOneSlots = Math.min(4, 2 + Math.floor((level - 1) / 2));
  return { level1: { current: levelOneSlots, max: levelOneSlots, recovery: "long" } };
}

function dnd5eSrdPrimaryAbility(className: string): string {
  if (className === "Bard") return "charisma";
  if (className === "Cleric") return "wisdom";
  if (className === "Druid") return "wisdom";
  if (className === "Paladin") return "charisma";
  if (className === "Ranger") return "wisdom";
  if (className === "Monk") return "dexterity";
  if (className === "Sorcerer") return "charisma";
  if (className === "Warlock") return "charisma";
  if (className === "Wizard") return "intelligence";
  if (className === "Rogue") return "dexterity";
  return "strength";
}

function dnd5eSrdHitDieSize(className: string): string {
  if (className === "Barbarian") return "d12";
  if (className === "Sorcerer") return "d6";
  if (className === "Wizard") return "d6";
  if (className === "Bard") return "d8";
  if (className === "Cleric") return "d8";
  if (className === "Druid") return "d8";
  if (className === "Monk") return "d8";
  if (className === "Rogue") return "d8";
  if (className === "Warlock") return "d8";
  return "d10";
}

function normalizeDnd5eSrdResources(
  value: unknown,
  className: string,
  level = 1,
  data: Record<string, unknown> = {},
  options: { raiseMaxToDefault?: boolean } = {}
): Record<string, Record<string, unknown> & { current: number; max: number }> {
  const defaults = defaultDnd5eSrdResources(className, level, data);
  const pools = normalizeResourcePools(value, defaults, options);
  for (const [key, defaultPool] of Object.entries(defaults)) {
    const recovery = stringValue(defaultPool.recovery);
    if (recovery && pools[key]) pools[key] = { ...pools[key], recovery };
  }
  return pools;
}

function normalizeDnd5eSrdSpellSlots(
  value: unknown,
  className: string,
  level = 1,
  options: { raiseMaxToDefault?: boolean } = {}
): Record<string, Record<string, unknown> & { current: number; max: number }> {
  const defaults = defaultDnd5eSrdSpellSlots(className, level);
  const pools = normalizeResourcePools(value, defaults, options);
  for (const [key, defaultPool] of Object.entries(defaults)) {
    const recovery = stringValue(defaultPool.recovery);
    if (recovery && pools[key]) pools[key] = { ...pools[key], recovery };
  }
  if (className === "Warlock") {
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, pools[key]!]));
  }
  return pools;
}

function defaultDnd5eSrdResources(className: string, level = 1, data: Record<string, unknown> = {}): Record<string, Record<string, unknown>> {
  return {
    ...defaultDnd5eSrdClassResources(className, level, data),
    ...defaultDnd5eSrdSpeciesResourcesForData(data, level)
  };
}

function defaultDnd5eSrdClassResources(className: string, level = 1, data: Record<string, unknown> = {}): Record<string, Record<string, unknown>> {
  if (className === "Fighter") {
    const resources: Record<string, Record<string, unknown>> = {
      secondWind: { current: dnd5eSrdSecondWindMax(level), max: dnd5eSrdSecondWindMax(level), recovery: "short" }
    };
    const actionSurgeMax = dnd5eSrdActionSurgeMax(level);
    if (actionSurgeMax > 0) resources.actionSurge = { current: actionSurgeMax, max: actionSurgeMax, recovery: "short" };
    return resources;
  }
  if (className === "Cleric") {
    const channelDivinityMax = dnd5eSrdChannelDivinityMax(level);
    return channelDivinityMax > 0 ? { channelDivinity: { current: channelDivinityMax, max: channelDivinityMax, recovery: "short" } } : {};
  }
  if (className === "Barbarian") {
    return { rage: { current: dnd5eSrdRageMax(level), max: dnd5eSrdRageMax(level), recovery: "short" } };
  }
  if (className === "Bard") {
    const max = dnd5eSrdBardicInspirationMax(data);
    return { bardicInspiration: { current: max, max, recovery: Math.max(1, Math.floor(level)) >= 5 ? "short" : "long" } };
  }
  if (className === "Paladin") {
    const normalized = Math.max(1, Math.floor(level));
    const resources: Record<string, Record<string, unknown>> = {
      layOnHands: { current: dnd5eSrdLayOnHandsMax(normalized), max: dnd5eSrdLayOnHandsMax(normalized), recovery: "long" }
    };
    if (normalized >= 2) resources.paladinsSmite = { current: 1, max: 1, recovery: "long" };
    if (normalized >= 5) resources.faithfulSteed = { current: 1, max: 1, recovery: "long" };
    return resources;
  }
  if (className === "Ranger") {
    const max = dnd5eSrdFavoredEnemyMax(level);
    return { favoredEnemy: { current: max, max, recovery: "long" } };
  }
  if (className === "Monk") {
    const normalized = Math.max(1, Math.floor(level));
    if (normalized < 2) return {};
    return {
      focus: { current: dnd5eSrdMonkFocusMax(normalized), max: dnd5eSrdMonkFocusMax(normalized), recovery: "short" },
      uncannyMetabolism: { current: 1, max: 1, recovery: "long" }
    };
  }
  if (className === "Sorcerer") {
    const normalized = Math.max(1, Math.floor(level));
    const resources: Record<string, Record<string, unknown>> = {
      innateSorcery: { current: 2, max: 2, recovery: "long" }
    };
    const sorceryPointsMax = dnd5eSrdSorceryPointsMax(normalized);
    if (sorceryPointsMax > 0) resources.sorceryPoints = { current: sorceryPointsMax, max: sorceryPointsMax, recovery: "long" };
    if (normalized >= 5) resources.sorcerousRestoration = { current: 1, max: 1, recovery: "long" };
    return resources;
  }
  if (className === "Warlock") {
    return Math.max(1, Math.floor(level)) >= 2 ? { magicalCunning: { current: 1, max: 1, recovery: "long" } } : {};
  }
  if (className === "Druid") {
    const normalized = Math.max(1, Math.floor(level));
    const resources: Record<string, Record<string, unknown>> = {};
    const wildShapeMax = dnd5eSrdWildShapeMax(normalized);
    if (wildShapeMax > 0) resources.wildShape = { current: wildShapeMax, max: wildShapeMax, recovery: "short" };
    if (normalized >= 5) resources.wildResurgence = { current: 1, max: 1, recovery: "long" };
    return resources;
  }
  if (className === "Wizard") {
    return { arcaneRecovery: { current: 1, max: 1, recovery: "long" } };
  }
  return {};
}

function dnd5eSrdSecondWindMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 10) return 4;
  if (normalized >= 4) return 3;
  return 2;
}

function dnd5eSrdActionSurgeMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  return normalized >= 17 ? 2 : normalized >= 2 ? 1 : 0;
}

function dnd5eSrdChannelDivinityMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 18) return 4;
  if (normalized >= 6) return 3;
  if (normalized >= 2) return 2;
  return 0;
}

function dnd5eSrdRageMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 17) return 6;
  if (normalized >= 12) return 5;
  if (normalized >= 6) return 4;
  if (normalized >= 3) return 3;
  return 2;
}

function dnd5eSrdBardicInspirationMax(data: Record<string, unknown>): number {
  const attributes = recordValue(data.attributes);
  return Math.max(1, abilityModifier(numericValue(attributes.charisma, 16)));
}

function dnd5eSrdLayOnHandsMax(level: number): number {
  return Math.max(1, Math.floor(level)) * 5;
}

function dnd5eSrdFavoredEnemyMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 17) return 6;
  if (normalized >= 13) return 5;
  if (normalized >= 9) return 4;
  if (normalized >= 5) return 3;
  return 2;
}

function dnd5eSrdMonkFocusMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  return normalized >= 2 ? normalized : 0;
}

function dnd5eSrdSorceryPointsMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  return normalized >= 2 ? normalized : 0;
}

function dnd5eSrdEldritchInvocationsKnown(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 18) return 10;
  if (normalized >= 15) return 9;
  if (normalized >= 12) return 8;
  if (normalized >= 9) return 7;
  if (normalized >= 7) return 6;
  if (normalized >= 5) return 5;
  if (normalized >= 2) return 3;
  return 1;
}

function dnd5eSrdWarlockPactMagicSlotCount(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 17) return 4;
  if (normalized >= 11) return 3;
  if (normalized >= 2) return 2;
  return 1;
}

function dnd5eSrdWarlockPactMagicSlotLevel(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 9) return 5;
  if (normalized >= 7) return 4;
  if (normalized >= 5) return 3;
  if (normalized >= 3) return 2;
  return 1;
}

function dnd5eSrdMagicalCunningLimit(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  const maxSlots = dnd5eSrdWarlockPactMagicSlotCount(normalized);
  return normalized >= 20 ? maxSlots : Math.ceil(maxSlots / 2);
}

function dnd5eSrdWildShapeMax(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 17) return 4;
  if (normalized >= 6) return 3;
  if (normalized >= 2) return 2;
  return 0;
}

function dnd5eSrdWildShapeKnownForms(level: number): number {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 8) return 8;
  if (normalized >= 4) return 6;
  if (normalized >= 2) return 4;
  return 0;
}

function dnd5eSrdWildShapeMaxChallengeRating(level: number): string {
  const normalized = Math.max(1, Math.floor(level));
  if (normalized >= 8) return "1";
  if (normalized >= 4) return "1/2";
  return "1/4";
}

function defaultDnd5eSrdSpellSlots(className: string, level: number): Record<string, Record<string, unknown>> {
  if (className === "Warlock") return defaultDnd5eSrdWarlockPactMagicSlots(level);
  if (className === "Paladin" || className === "Ranger") return defaultDnd5eSrdHalfCasterSpellSlots(level);
  if (className !== "Bard" && className !== "Cleric" && className !== "Druid" && className !== "Sorcerer" && className !== "Wizard") return {};
  const slots: Record<string, Record<string, unknown>> = {
    level1: { current: Math.min(4, 2 + Math.max(0, level - 1)), max: Math.min(4, 2 + Math.max(0, level - 1)), recovery: "long" }
  };
  if (level >= 3) {
    const levelTwoSlots = Math.min(3, 2 + Math.max(0, level - 3));
    slots.level2 = { current: levelTwoSlots, max: levelTwoSlots, recovery: "long" };
  }
  if (level >= 5) {
    slots.level3 = { current: 2, max: 2, recovery: "long" };
  }
  return slots;
}

function defaultDnd5eSrdWarlockPactMagicSlots(level: number): Record<string, Record<string, unknown>> {
  const slotLevel = dnd5eSrdWarlockPactMagicSlotLevel(level);
  const slotCount = dnd5eSrdWarlockPactMagicSlotCount(level);
  return { [`level${slotLevel}`]: { current: slotCount, max: slotCount, recovery: "short" } };
}

function defaultDnd5eSrdHalfCasterSpellSlots(level: number): Record<string, Record<string, unknown>> {
  const normalized = Math.max(1, Math.min(20, Math.floor(level)));
  const table: Record<number, number[]> = {
    1: [2],
    2: [2],
    3: [3],
    4: [3],
    5: [4, 2],
    6: [4, 2],
    7: [4, 3],
    8: [4, 3],
    9: [4, 3, 2],
    10: [4, 3, 2],
    11: [4, 3, 3],
    12: [4, 3, 3],
    13: [4, 3, 3, 1],
    14: [4, 3, 3, 1],
    15: [4, 3, 3, 2],
    16: [4, 3, 3, 2],
    17: [4, 3, 3, 3, 1],
    18: [4, 3, 3, 3, 1],
    19: [4, 3, 3, 3, 2],
    20: [4, 3, 3, 3, 2]
  };
  return Object.fromEntries(
    (table[normalized] ?? table[1]!).map((slotCount, index) => {
      const key = `level${index + 1}`;
      return [key, { current: slotCount, max: slotCount, recovery: "long" }];
    })
  );
}

function averageHitDie(hitDieSize: string): number {
  const match = /^d(\d+)$/i.exec(hitDieSize.trim());
  const sides = match ? numericValue(Number(match[1]), 8) : 8;
  return Math.floor(sides / 2) + 1;
}

function conditionsAfterRest(
  actor: Actor,
  lookup: (entryId: string) => RulesCompendiumEntry | undefined,
  restType: SystemRestType
): { conditions: Array<{ id: string; appliedAt?: string }>; removed: AppliedCondition[] } {
  const conditions = normalizeConditionRecords(actor.data.conditions);
  const kept: Array<{ id: string; appliedAt?: string }> = [];
  const removed: AppliedCondition[] = [];
  for (const condition of conditions) {
    const entry = lookup(condition.id);
    if (entry && conditionClearsOnRest(entry, restType)) {
      removed.push({ id: condition.id, name: entry.name, summary: entry.summary, appliedAt: condition.appliedAt });
    } else {
      kept.push(condition);
    }
  }
  return { conditions: kept, removed };
}

function conditionClearsOnRest(entry: RulesCompendiumEntry, restType: SystemRestType): boolean {
  const data = recordValue(entry.data);
  if (restType === "long") return booleanValue(data.longRestClears) || booleanValue(data.shortRestClears);
  return booleanValue(data.shortRestClears);
}

function actionItemForRoll(actor: Actor, items: Item[], rollId: string, prefixes: string[]): Item | undefined {
  return items
    .filter((item) => itemBelongsToActor(actor, item))
    .find((item) => prefixes.some((prefix) => rollId.startsWith(`${prefix}-${item.id}-`)));
}

function titleCaseWords(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeImportConditions(value: unknown, lookup: (entryId: string) => RulesCompendiumEntry | undefined, warnings: string[]): string[] {
  const conditions: string[] = [];
  for (const id of normalizeImportIds(value)) {
    const entry = lookup(id);
    if (!entry || entry.type !== "condition") {
      warnings.push(`Unknown condition skipped: ${id}`);
      continue;
    }
    if (!conditions.includes(id)) conditions.push(id);
  }
  return conditions;
}

function normalizeImportItems(value: unknown, lookup: (entryId: string) => RulesCompendiumEntry | undefined, warnings: string[], conditions: string[]): CharacterTemplateItem[] {
  const items: CharacterTemplateItem[] = [];
  for (const selection of normalizeImportSelections(value)) {
    const entry = lookup(selection.entryId);
    if (!entry) {
      warnings.push(`Unknown compendium entry skipped: ${selection.entryId}`);
      continue;
    }
    if (entry.type === "condition") {
      if (!conditions.includes(entry.id)) conditions.push(entry.id);
      continue;
    }
    items.push(selection);
  }
  return items;
}

function normalizeImportIds(value: unknown): string[] {
  return normalizeImportSelections(value).map((selection) => selection.entryId);
}

function normalizeImportSelections(value: unknown): CharacterTemplateItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim().length > 0) return [{ entryId: item.trim() }];
    const record = recordValue(item);
    const entryId = stringValue(record.entryId) ?? stringValue(record.id);
    if (!entryId) return [];
    return [{ entryId, quantity: Math.max(1, Math.floor(numericValue(record.quantity, 1))) }];
  });
}

function buildEncounterPlan(input: {
  systemId: string;
  partyRating: number;
  threats: EncounterThreat[];
  selections: EncounterThreatSelection[];
  difficultyBudgets?: EncounterPlan["difficultyBudgets"];
  difficultyForBudget?: (budget: number) => EncounterPlan["difficulty"];
  budgetLabel?: string;
}): EncounterPlan {
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
        budgetTotal: threat.budget * count,
        challengeRating: threat.challengeRating,
        data: threat.data
      }
    ];
  });
  const threatBudget = threats.reduce((total, threat) => total + threat.budgetTotal, 0);
  const ratio = input.partyRating > 0 ? threatBudget / input.partyRating : 99;
  const difficulty = input.difficultyForBudget?.(threatBudget) ?? encounterDifficulty(ratio);
  const budgetLabel = input.budgetLabel ?? "budget";
  const budgetSummary = input.difficultyBudgets
    ? `${threatBudget}/${input.partyRating} ${budgetLabel}; easy ${input.difficultyBudgets.easy}, standard ${input.difficultyBudgets.standard}, hard ${input.difficultyBudgets.hard}`
    : `${threatBudget}/${input.partyRating} ${budgetLabel}`;
  return {
    systemId: input.systemId,
    partyRating: input.partyRating,
    threatBudget,
    difficulty,
    difficultyBudgets: input.difficultyBudgets,
    threats,
    summary: `${difficulty} encounter: ${threats.map((threat) => `${threat.count}x ${threat.name}`).join(", ") || "no threats"} (${budgetSummary})`
  };
}

function encounterDifficulty(ratio: number): EncounterPlan["difficulty"] {
  if (ratio <= 0.25) return "trivial";
  if (ratio <= 0.6) return "easy";
  if (ratio <= 1.1) return "standard";
  if (ratio <= 1.6) return "hard";
  return "deadly";
}
