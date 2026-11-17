/** Immutable D&D SRD catalog data shared by rules resolvers. */
export interface Dnd5eSrdConditionCompendiumSeed {
  id: string;
  type: "condition";
  name: string;
  summary: string;
  data: Record<string, unknown>;
}

export const DND_5E_SRD_SYSTEM_ID = "dnd-5e-srd";
export const DND_5E_SRD_VERSION = "SRD 5.2.1";

export const DND_5E_SRD_CANTRIP_D6_SCALING = { level5: "2d6", level11: "3d6", level17: "4d6" };
export const DND_5E_SRD_CANTRIP_D8_SCALING = { level5: "2d8", level11: "3d8", level17: "4d8" };
export const DND_5E_SRD_CANTRIP_D10_SCALING = { level5: "2d10", level11: "3d10", level17: "4d10" };
export const DND_5E_SRD_CANTRIP_D12_SCALING = { level5: "2d12", level11: "3d12", level17: "4d12" };

export const dnd5eSrdXpThresholds: readonly number[] = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const dnd5eSrdFullCasterClasses = ["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"];
export const dnd5eSrdHalfCasterClasses = ["Paladin", "Ranger"];

export const dnd5eSrdMulticlassPrerequisites: Record<string, { all?: Array<{ ability: string; minimum: number }>; any?: Array<{ ability: string; minimum: number }> }> = {
  Barbarian: { all: [{ ability: "strength", minimum: 13 }] },
  Bard: { all: [{ ability: "charisma", minimum: 13 }] },
  Cleric: { all: [{ ability: "wisdom", minimum: 13 }] },
  Druid: { all: [{ ability: "wisdom", minimum: 13 }] },
  Fighter: { any: [{ ability: "strength", minimum: 13 }, { ability: "dexterity", minimum: 13 }] },
  Monk: { all: [{ ability: "dexterity", minimum: 13 }, { ability: "wisdom", minimum: 13 }] },
  Paladin: { all: [{ ability: "strength", minimum: 13 }, { ability: "charisma", minimum: 13 }] },
  Ranger: { all: [{ ability: "dexterity", minimum: 13 }, { ability: "wisdom", minimum: 13 }] },
  Rogue: { all: [{ ability: "dexterity", minimum: 13 }] },
  Sorcerer: { all: [{ ability: "charisma", minimum: 13 }] },
  Warlock: { all: [{ ability: "charisma", minimum: 13 }] },
  Wizard: { all: [{ ability: "intelligence", minimum: 13 }] }
};

export const dnd5eSrdMulticlassSlotTable: readonly number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1]
];

export const dnd5eSrdAbilityScoreImprovementLevels: readonly number[] = [4, 8, 12, 16, 19];

export const DND_5E_SRD_CONDITION_ENTRIES: Dnd5eSrdConditionCompendiumSeed[] = [
  {
    id: "blinded",
    type: "condition",
    name: "Blinded",
    summary: "Prevents sight, fails sight-based checks, worsens attacks made by and against the actor.",
    data: { sightBlocked: true, sightChecksFail: true, attackRolls: "disadvantage", attacksAgainst: "advantage", source: DND_5E_SRD_VERSION }
  },
  {
    id: "charmed",
    type: "condition",
    name: "Charmed",
    summary: "Prevents harming the charmer and gives the charmer advantage on social checks.",
    data: { cannotAttackCharmer: true, socialChecksByCharmer: "advantage", source: DND_5E_SRD_VERSION }
  },
  {
    id: "deafened",
    type: "condition",
    name: "Deafened",
    summary: "Prevents hearing and fails hearing-based checks.",
    data: { hearingBlocked: true, hearingChecksFail: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "exhaustion",
    type: "condition",
    name: "Exhaustion",
    summary: "Tracks cumulative exhaustion levels that penalize D20 Tests and speed.",
    data: { stackable: true, maxLevel: 6, d20TestPenaltyPerLevel: 2, speedPenaltyFtPerLevel: 5, deathAtLevel: 6, longRestReducesLevelBy: 1, source: DND_5E_SRD_VERSION }
  },
  {
    id: "frightened",
    type: "condition",
    name: "Frightened",
    summary: "Imposes disadvantage while the fear source is visible and prevents moving closer to it.",
    data: { abilityChecksWhileSourceVisible: "disadvantage", attackRollsWhileSourceVisible: "disadvantage", cannotMoveCloserToSource: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "grappled",
    type: "condition",
    name: "Grappled",
    summary: "Sets speed to 0, limits attacks away from the grappler, and allows the grappler to move the target.",
    data: { speedSetTo: 0, cannotIncreaseSpeed: true, attacksAgainstNonGrappler: "disadvantage", movableByGrappler: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "incapacitated",
    type: "condition",
    name: "Incapacitated",
    summary: "Prevents actions, bonus actions, reactions, concentration, and speech.",
    data: { actions: false, bonusActions: false, reactions: false, concentrationEnds: true, speech: false, initiativeDisadvantage: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "invisible",
    type: "condition",
    name: "Invisible",
    summary: "Conceals the actor, improves initiative and attacks, and hinders attacks against them.",
    data: { initiative: "advantage", concealed: true, attackRolls: "advantage", attacksAgainst: "disadvantage", seenCreaturesIgnoreAttackEffect: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "paralyzed",
    type: "condition",
    name: "Paralyzed",
    summary: "Includes incapacitation, sets speed to 0, fails Strength and Dexterity saves, and enables close critical hits.",
    data: { includes: ["incapacitated"], speedSetTo: 0, cannotIncreaseSpeed: true, savingThrowsFail: ["strength", "dexterity"], attacksAgainst: "advantage", closeHitsCritical: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "petrified",
    type: "condition",
    name: "Petrified",
    summary: "Turns the actor into an inanimate substance with incapacitation, speed 0, broad resistance, and poison immunity.",
    data: { transformedIntoInanimateSubstance: true, includes: ["incapacitated"], speedSetTo: 0, cannotIncreaseSpeed: true, attacksAgainst: "advantage", savingThrowsFail: ["strength", "dexterity"], resistance: ["all"], conditionImmunity: ["poisoned"], source: DND_5E_SRD_VERSION }
  },
  {
    id: "poisoned",
    type: "condition",
    name: "Poisoned",
    summary: "Imposes disadvantage on SRD attack rolls and ability checks.",
    data: { attackRolls: "disadvantage", abilityChecks: "disadvantage", skillChecks: "disadvantage", toolChecks: "disadvantage", rollMode: "disadvantage", longRestClears: false, source: DND_5E_SRD_VERSION }
  },
  {
    id: "prone",
    type: "condition",
    name: "Prone",
    summary: "Restricts movement, imposes attack disadvantage, and changes attacks against the actor by range.",
    data: { movement: "crawl-or-stand", standCost: "half-speed", attackRolls: "disadvantage", meleeAttacksAgainst: "advantage", rangedAttacksAgainst: "disadvantage", cannotStandIfSpeedZero: true, source: DND_5E_SRD_VERSION }
  },
  {
    id: "restrained",
    type: "condition",
    name: "Restrained",
    summary: "Sets speed to 0, worsens attacks made by and against the actor, and hinders Dexterity saves.",
    data: { speedSetTo: 0, speedMultiplier: 0, cannotIncreaseSpeed: true, attackRolls: "disadvantage", attacksAgainst: "advantage", savingThrowsDisadvantage: ["dexterity"], shortRestClears: false, source: DND_5E_SRD_VERSION }
  },
  {
    id: "stunned",
    type: "condition",
    name: "Stunned",
    summary: "Includes incapacitation, fails Strength and Dexterity saves, and gives attacks against the actor advantage.",
    data: { includes: ["incapacitated"], savingThrowsFail: ["strength", "dexterity"], attacksAgainst: "advantage", source: DND_5E_SRD_VERSION }
  },
  {
    id: "unconscious",
    type: "condition",
    name: "Unconscious",
    summary: "Includes incapacitated and prone, drops held items, sets speed to 0, and enables close critical hits.",
    data: { includes: ["incapacitated", "prone"], dropsHeldItems: true, remainsProneAfterEnding: true, speedSetTo: 0, cannotIncreaseSpeed: true, attacksAgainst: "advantage", savingThrowsFail: ["strength", "dexterity"], closeHitsCritical: true, unaware: true, source: DND_5E_SRD_VERSION }
  }
];

export const DND_5E_SRD_LEVEL_ONE_SPELL_CLASS_OVERRIDES: Record<string, string[]> = {
  "chromatic-orb": ["sorcerer", "wizard"],
  "cure-wounds": ["bard", "cleric", "druid", "paladin", "ranger"],
  "detect-magic": ["bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "warlock", "wizard"],
  "divine-smite": ["paladin"],
  "healing-word": ["bard", "cleric", "druid"],
  "hex": ["warlock"],
  "hunters-mark": ["ranger"],
  "ice-knife": ["druid", "sorcerer", "wizard"],
  "ray-of-sickness": ["sorcerer", "wizard"],
  "sorcerous-burst": ["sorcerer"]
};

export const DND_5E_SRD_ENCOUNTER_XP_BUDGETS_BY_LEVEL: Record<number, { easy: number; standard: number; hard: number }> = {
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

export const DND_5E_SRD_DAMAGE_TYPE_IDS = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"] as const;

export const DND_5E_SRD_ATTUNEMENT_MODIFIER_KEYS = [
  "abilityScoreIncrease",
  "abilityScoreSet",
  "armorClassBonus",
  "attackBonus",
  "damageBonus",
  "hitPointMaximumBonus",
  "initiativeBonus",
  "magicBonus",
  "proficiencyBonusIncrease",
  "savingThrowBonus",
  "spellAttackBonus",
  "spellSaveDcBonus"
] as const;
