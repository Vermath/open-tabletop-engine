import { DND_5E_SRD_PREPARED_SPELL_CAPACITY } from "./dnd-spell-preparation.js";

export const DND_5E_SRD_SPELLCASTING_ABILITIES = Object.freeze({
  Bard: "charisma",
  Cleric: "wisdom",
  Druid: "wisdom",
  Paladin: "charisma",
  Ranger: "wisdom",
  Sorcerer: "charisma",
  Warlock: "charisma",
  Wizard: "intelligence"
} as const);

export type Dnd5eSrdSpellcastingClassName = keyof typeof DND_5E_SRD_SPELLCASTING_ABILITIES;
export type Dnd5eSrdSpellcastingAbility = typeof DND_5E_SRD_SPELLCASTING_ABILITIES[Dnd5eSrdSpellcastingClassName];
export type Dnd5eSrdSpellAcquisitionMode = "prepared-class-level" | "prepared-long-rest" | "spellbook";

export interface Dnd5eSrdSpellcastingClassProfile {
  className: Dnd5eSrdSpellcastingClassName;
  classLevel: number;
  spellcastingAbility: Dnd5eSrdSpellcastingAbility;
  acquisitionMode: Dnd5eSrdSpellAcquisitionMode;
  maxSpellLevel: number;
  preparedSpellCapacity: number;
  spellbookAdditions: number;
}

export interface Dnd5eSrdClassSpellGrantSource {
  kind: "class";
  className: Dnd5eSrdSpellcastingClassName;
  selection: "prepared" | "spellbook";
  selectedAtLevel: number;
  spellcastingAbility: Dnd5eSrdSpellcastingAbility;
  acquisitionMode: Dnd5eSrdSpellAcquisitionMode;
}

const CLASS_NAMES = Object.keys(DND_5E_SRD_SPELLCASTING_ABILITIES) as Dnd5eSrdSpellcastingClassName[];
const FULL_CASTERS = new Set<Dnd5eSrdSpellcastingClassName>(["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"]);
const HALF_CASTERS = new Set<Dnd5eSrdSpellcastingClassName>(["Paladin", "Ranger"]);
const LONG_REST_PREPARERS = new Set<Dnd5eSrdSpellcastingClassName>(["Cleric", "Druid", "Paladin", "Ranger"]);

export function dnd5eSrdSpellcastingClassName(value: string): Dnd5eSrdSpellcastingClassName | undefined {
  return CLASS_NAMES.find((className) => className.toLowerCase() === value.trim().toLowerCase());
}

export function dnd5eSrdSpellcastingClassProfile(classNameValue: string, classLevelValue: number): Dnd5eSrdSpellcastingClassProfile | undefined {
  const className = dnd5eSrdSpellcastingClassName(classNameValue);
  if (!className || !Number.isInteger(classLevelValue) || classLevelValue < 1 || classLevelValue > 20) return undefined;
  const classLevel = classLevelValue;
  const maxSpellLevel = className === "Warlock"
    ? Math.min(5, Math.ceil(classLevel / 2))
    : HALF_CASTERS.has(className)
      ? Math.min(5, Math.ceil(classLevel / 4))
      : FULL_CASTERS.has(className)
        ? Math.min(9, Math.ceil(classLevel / 2))
        : 0;
  const acquisitionMode: Dnd5eSrdSpellAcquisitionMode = className === "Wizard"
    ? "spellbook"
    : LONG_REST_PREPARERS.has(className)
      ? "prepared-long-rest"
      : "prepared-class-level";
  return {
    className,
    classLevel,
    spellcastingAbility: DND_5E_SRD_SPELLCASTING_ABILITIES[className],
    acquisitionMode,
    maxSpellLevel,
    preparedSpellCapacity: DND_5E_SRD_PREPARED_SPELL_CAPACITY[className]![classLevel - 1]!,
    spellbookAdditions: className === "Wizard" ? (classLevel === 1 ? 6 : 2) : 0
  };
}

/** Typed provenance applied to an actor-owned class spell item at materialization. */
export function dnd5eSrdClassSpellGrantData(input: {
  compendiumEntryId: string;
  className: string;
  selectedAtLevel: number;
  prepared: boolean;
  alwaysPrepared?: boolean;
  inSpellbook?: boolean;
}): {
  compendiumId: string;
  classSpell: true;
  spellcastingClass: Dnd5eSrdSpellcastingClassName;
  spellcastingAbility: Dnd5eSrdSpellcastingAbility;
  acquisitionMode: Dnd5eSrdSpellAcquisitionMode;
  preparedForClass: Dnd5eSrdSpellcastingClassName;
  prepared: boolean;
  alwaysPrepared: boolean;
  inSpellbook: boolean;
  spellSources: Dnd5eSrdClassSpellGrantSource[];
} {
  const profile = dnd5eSrdSpellcastingClassProfile(input.className, input.selectedAtLevel);
  if (!profile) throw new Error(`${input.className} level ${input.selectedAtLevel} is not a supported SRD spellcasting grant source`);
  const compendiumEntryId = input.compendiumEntryId.trim().toLowerCase();
  if (!compendiumEntryId) throw new Error("Class spell grant requires a compendium entry id");
  const inSpellbook = profile.className === "Wizard" ? input.inSpellbook === true : false;
  if (profile.className === "Wizard" && !inSpellbook) throw new Error("A Wizard class-spell grant must be recorded in the spellbook");
  return {
    compendiumId: compendiumEntryId,
    classSpell: true,
    spellcastingClass: profile.className,
    spellcastingAbility: profile.spellcastingAbility,
    acquisitionMode: profile.acquisitionMode,
    preparedForClass: profile.className,
    prepared: input.prepared,
    alwaysPrepared: input.alwaysPrepared === true,
    inSpellbook,
    spellSources: [{
      kind: "class",
      className: profile.className,
      selection: profile.className === "Wizard" ? "spellbook" : "prepared",
      selectedAtLevel: profile.classLevel,
      spellcastingAbility: profile.spellcastingAbility,
      acquisitionMode: profile.acquisitionMode
    }]
  };
}
