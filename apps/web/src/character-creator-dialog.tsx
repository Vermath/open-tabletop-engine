import { Check, ChevronLeft, ChevronRight, UserPlus, X } from "lucide-react";
import { useId, useState } from "react";
import type { CharacterTemplateInfo, Snapshot } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, prettyOriginId } from "./sheet-format.js";


export type CharacterOriginsInfo = {
  backgrounds: Array<{ id: string; name: string; abilityScores: string[]; feat: string; skillProficiencies: string[]; toolProficiencies: string[]; startingGp: number }>;
  species: Array<{ id: string; name: string; size: string; speed: number; traits: string[]; senses?: string[] }>;
  draconicAncestors: Array<{ id: string; name: string; damageType: "acid" | "cold" | "fire" | "lightning" | "poison" }>;
  giantAncestries: Array<{
    id: string;
    name: string;
    giantType: string;
    activation: "bonus-action" | "on-hit" | "reaction";
    summary: string;
    teleportRangeFt?: number;
    damageFormula?: string;
    damageType?: "cold" | "fire" | "thunder";
    speedReductionFt?: number;
    condition?: "Prone";
    targetMaxSize?: "Large";
    damageReductionFormula?: string;
    damageReductionAbility?: "constitution";
    triggerRangeFt?: number;
  }>;
  classSkillChoices: Array<{ templateId: string; className: string; count: number; skillIds: string[] }>;
  languages: Array<{ id: string; label: string; category: "standard" | "rare" }>;
  originLanguageChoice: { count: number; fixedLanguageIds: string[]; languageIds: string[] };
  classLanguageChoices: Array<{ templateId: string; className: string; count: number; fixedLanguageIds: string[]; languageIds: string[] }>;
  classStartingEquipment: Array<{
    templateId: string;
    className: string;
    packages: Array<{
      id: string;
      label: string;
      gp: number;
      grants: Array<{ entryId: string; quantity?: number; data?: Record<string, unknown> }>;
      choices: Array<{ id: string; label: string; count: 1; optionIds: string[]; matchSelection?: "class-tool-proficiency" | "background-tool-proficiency" }>;
    }>;
    toolProficiencyChoice: { count: number; optionIds: string[] };
    fixedToolProficiencyIds: string[];
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  backgroundStartingEquipment: Array<{
    backgroundId: string;
    backgroundName: string;
    packages: Array<{
      id: string;
      label: string;
      gp: number;
      grants: Array<{ entryId: string; quantity?: number; data?: Record<string, unknown> }>;
      choices: Array<{ id: string; label: string; count: 1; optionIds: string[]; matchSelection?: "class-tool-proficiency" | "background-tool-proficiency" }>;
    }>;
    toolProficiencyChoice: { count: number; optionIds: string[] };
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  weaponMasteryOptions: Array<{ id: string; name: string; weaponCategory: "simple" | "martial"; weaponKind: "melee" | "ranged"; properties: string[]; mastery: string }>;
  classWeaponMasteryChoices: Array<{ templateId: string; className: string; count: number; weaponIds: string[]; sourcePage: number; sourcePdfPage: number }>;
  spellOptions: Array<{ id: string; name: string; level: 0 | 1; classes: string[]; ritual: boolean }>;
  classSpellChoices: Array<{ templateId: string; className: string; spellcastingAbility?: "intelligence" | "wisdom" | "charisma"; cantripCount: number; preparedSpellCount: number; spellbookSpellCount: number; cantripIds: string[]; levelOneSpellIds: string[]; alwaysPreparedSpellIds: string[]; slotPool: "none" | "spellcasting" | "pact-magic"; slotCount: number; slotRecovery: "none" | "long" | "short"; changeTiming: "none" | "long-rest" | "class-level"; sourcePage: number; sourcePdfPage: number }>;
  levelOneClassFeatureChoices: Array<{ templateId: string; field: string; count: number; optionIds: string[]; sourcePage: number; sourcePdfPage: number }>;
  fightingStyles: Array<{ id: string; name: string; summary: string }>;
  divineOrders: Array<{ id: string; name: string; summary: string }>;
  primalOrders: Array<{ id: string; name: string; summary: string }>;
  eldritchInvocations: Array<{ id: string; name: string; minimumWarlockLevel: number; grantedSpellId?: string; pactTomeCantripCount?: number; pactTomeRitualCount?: number; summary: string }>;
  originFeatOptions: Array<{ id: string; name: string; magicInitiateClass?: "cleric" | "druid" | "wizard"; cantripCount?: 2; levelOneSpellCount?: 1; skilledProficiencyCount?: 3 }>;
  skilledProficiencyOptions: Array<{ id: string; label: string; category: "skill" | "tool" }>;
  elfLineages: Array<{ id: string; name: string; cantrip: string; level3Spell: string; level5Spell: string }>;
  gnomeLineages: Array<{ id: string; name: string }>;
  tieflingLegacies: Array<{ id: string; name: string; resistance: string }>;
  highElfCantrips: string[];
  skills: Array<{ id: string; label: string; ability: string }>;
  originFeats: string[];
  spellcastingAbilities: string[];
};


export type CharacterCreateInput = {
  creationMode?: "level-one-srd";
  name: string;
  ownerUserId: string;
  backgroundId?: string;
  speciesId?: string;
  abilityScoreIncreases?: Record<string, number>;
  classSkillProficiencies?: string[];
  originLanguageChoices?: string[];
  classLanguageChoices?: string[];
  draconicAncestry?: string;
  giantAncestry?: string;
  skillProficiency?: string;
  originFeat?: string;
  elfLineage?: string;
  elfCantrip?: string;
  gnomeLineage?: string;
  tieflingLegacy?: string;
  speciesSpellcastingAbility?: string;
  classEquipmentPackageId?: string;
  backgroundEquipmentPackageId?: string;
  classEquipmentChoices?: Record<string, string>;
  backgroundEquipmentChoices?: Record<string, string>;
  classToolProficiencyChoices?: string[];
  backgroundToolProficiencyChoice?: string;
  weaponMasteryChoices?: string[];
  classCantripChoices?: string[];
  classPreparedSpellChoices?: string[];
  wizardSpellbookChoices?: string[];
  backgroundMagicInitiateCantrips?: string[];
  backgroundMagicInitiateSpell?: string;
  backgroundMagicInitiateAbility?: string;
  originFeatMagicInitiateCantrips?: string[];
  originFeatMagicInitiateSpell?: string;
  originFeatMagicInitiateAbility?: string;
  skilledProficiencyChoices?: string[];
  fightingStyle?: string;
  divineOrder?: string;
  primalOrder?: string;
  rogueExpertiseChoices?: string[];
  eldritchInvocation?: string;
  pactTomeCantripChoices?: string[];
  pactTomeRitualChoices?: string[];
};

export type CharacterCreatorValidationIssue = {
  step: "Class" | "Origin" | "Background" | "Finish";
  message: string;
};

export function validateCharacterCreatorInput(input: {
  template?: CharacterTemplateInfo;
  origins?: CharacterOriginsInfo;
  value: CharacterCreateInput;
}): CharacterCreatorValidationIssue[] {
  const issues: CharacterCreatorValidationIssue[] = [];
  const add = (step: CharacterCreatorValidationIssue["step"], message: string): void => {
    if (!issues.some((issue) => issue.step === step && issue.message === message)) issues.push({ step, message });
  };
  if (!input.template) add("Class", "Choose a class template.");
  if (!input.origins) {
    if (input.template?.systemId === "dnd-5e-srd") add("Finish", "D&D origin choices could not be loaded. Close the creator and try again.");
    return issues;
  }

  const background = input.origins.backgrounds.find((item) => item.id === input.value.backgroundId);
  const species = input.origins.species.find((item) => item.id === input.value.speciesId);
  const classSkillChoice = input.origins.classSkillChoices.find((item) => item.templateId === input.template?.id);
  const originLanguageChoice = input.origins.originLanguageChoice;
  const classLanguageChoice = input.origins.classLanguageChoices.find((item) => item.templateId === input.template?.id);
  const classEquipment = input.origins.classStartingEquipment.find((item) => item.templateId === input.template?.id);
  const backgroundEquipment = input.origins.backgroundStartingEquipment.find((item) => item.backgroundId === background?.id);
  const masteryChoice = input.origins.classWeaponMasteryChoices.find((item) => item.templateId === input.template?.id);
  const classSpellChoice = input.origins.classSpellChoices.find((item) => item.templateId === input.template?.id);
  const classSkills = input.value.classSkillProficiencies ?? [];
  if (!species) add("Origin", "Choose a supported species.");
  if (!background) add("Background", "Choose a supported background.");

  const classPackage = classEquipment?.packages.find((pkg) => pkg.id === input.value.classEquipmentPackageId);
  const backgroundPackage = backgroundEquipment?.packages.find((pkg) => pkg.id === input.value.backgroundEquipmentPackageId);
  if (!classEquipment) add("Background", "Class starting-equipment choices could not be loaded.");
  else if (!classPackage) add("Background", `Choose a ${classEquipment.className} starting-equipment package.`);
  if (background && !backgroundEquipment) add("Background", "Background starting-equipment choices could not be loaded.");
  else if (backgroundEquipment && !backgroundPackage) add("Background", `Choose a ${backgroundEquipment.backgroundName} starting-equipment package.`);
  const validatePackageChoices = (
    pkg: typeof classPackage,
    choices: Record<string, string> | undefined,
    label: string
  ): void => {
    const explicit = pkg?.choices.filter((choice) => !choice.matchSelection) ?? [];
    const provided = choices ?? {};
    if (Object.keys(provided).some((id) => !explicit.some((choice) => choice.id === id))) add("Background", `${label} equipment includes an unavailable choice.`);
    for (const choice of explicit) {
      if (!choice.optionIds.includes(provided[choice.id] ?? "")) add("Background", `Choose ${choice.label} for the ${label.toLowerCase()} equipment package.`);
    }
  };
  validatePackageChoices(classPackage, input.value.classEquipmentChoices, "Class");
  validatePackageChoices(backgroundPackage, input.value.backgroundEquipmentChoices, "Background");
  const classTools = input.value.classToolProficiencyChoices ?? [];
  if (classEquipment) {
    if (classTools.length !== classEquipment.toolProficiencyChoice.count) add("Background", `Choose exactly ${classEquipment.toolProficiencyChoice.count} ${classEquipment.className} tool ${classEquipment.toolProficiencyChoice.count === 1 ? "proficiency" : "proficiencies"}.`);
    if (new Set(classTools).size !== classTools.length) add("Background", "Class tool proficiency choices cannot repeat a tool.");
    if (classTools.some((tool) => !classEquipment.toolProficiencyChoice.optionIds.includes(tool))) add("Background", `Choose ${classEquipment.className} tools from its published list.`);
  }
  const backgroundTool = input.value.backgroundToolProficiencyChoice;
  if (backgroundEquipment?.toolProficiencyChoice.count === 1 && !backgroundEquipment.toolProficiencyChoice.optionIds.includes(backgroundTool ?? "")) add("Background", `Choose the ${backgroundEquipment.backgroundName} tool proficiency.`);
  if (backgroundEquipment?.toolProficiencyChoice.count === 0 && backgroundTool) add("Background", `${backgroundEquipment.backgroundName} has no selectable tool proficiency.`);
  const masteries = input.value.weaponMasteryChoices ?? [];
  if (!masteryChoice) add("Background", "Weapon Mastery choices could not be loaded for this class.");
  else {
    if (masteries.length !== masteryChoice.count) add("Background", `Choose exactly ${masteryChoice.count} ${masteryChoice.className} Weapon Mastery ${masteryChoice.count === 1 ? "weapon" : "weapons"}.`);
    if (new Set(masteries).size !== masteries.length) add("Background", "Weapon Mastery choices cannot repeat a weapon kind.");
    if (masteries.some((weapon) => !masteryChoice.weaponIds.includes(weapon))) add("Background", `Choose weapons eligible for ${masteryChoice.className} Weapon Mastery.`);
  }

  const featureChoice = input.origins.levelOneClassFeatureChoices.find((choice) => choice.templateId === input.template?.id);
  if (featureChoice?.field === "fightingStyle" && !featureChoice.optionIds.includes(input.value.fightingStyle ?? "")) add("Background", "Choose a published Fighter Fighting Style.");
  if (featureChoice?.field === "divineOrder" && !featureChoice.optionIds.includes(input.value.divineOrder ?? "")) add("Background", "Choose a Cleric Divine Order.");
  if (featureChoice?.field === "primalOrder" && !featureChoice.optionIds.includes(input.value.primalOrder ?? "")) add("Background", "Choose a Druid Primal Order.");
  if (featureChoice?.field === "eldritchInvocation" && !featureChoice.optionIds.includes(input.value.eldritchInvocation ?? "")) add("Background", "Choose an Eldritch Invocation whose prerequisites a level-one Warlock meets.");
  const expectedCantripCount = (classSpellChoice?.cantripCount ?? 0)
    + (input.template?.id === "cleric" && input.value.divineOrder === "thaumaturge" ? 1 : 0)
    + (input.template?.id === "druid" && input.value.primalOrder === "magician" ? 1 : 0);
  const classCantrips = input.value.classCantripChoices ?? [];
  const classPrepared = input.value.classPreparedSpellChoices ?? [];
  const wizardSpellbook = input.value.wizardSpellbookChoices ?? [];
  if (!classSpellChoice) add("Background", "Class spell choices could not be loaded.");
  else {
    if (classCantrips.length !== expectedCantripCount || new Set(classCantrips).size !== classCantrips.length || classCantrips.some((id) => !classSpellChoice.cantripIds.includes(id))) add("Background", `Choose exactly ${expectedCantripCount} published ${classSpellChoice.className} cantrips.`);
    if (classPrepared.length !== classSpellChoice.preparedSpellCount || new Set(classPrepared).size !== classPrepared.length || classPrepared.some((id) => !classSpellChoice.levelOneSpellIds.includes(id) || classSpellChoice.alwaysPreparedSpellIds.includes(id))) add("Background", `Choose exactly ${classSpellChoice.preparedSpellCount} published ${classSpellChoice.className} level 1 spells; always-prepared spells do not count.`);
    if (input.template?.id === "wizard") {
      if (wizardSpellbook.length !== classSpellChoice.spellbookSpellCount || new Set(wizardSpellbook).size !== wizardSpellbook.length || wizardSpellbook.some((id) => !classSpellChoice.levelOneSpellIds.includes(id))) add("Background", "Choose exactly six published level 1 Wizard spells for the spellbook.");
      if (classPrepared.some((id) => !wizardSpellbook.includes(id))) add("Background", "Choose the four prepared Wizard spells from the six spells in the spellbook.");
    }
  }

  const validateMagicInitiate = (
    feat: string | undefined,
    cantrips: string[] | undefined,
    spell: string | undefined,
    ability: string | undefined,
    label: string,
    step: CharacterCreatorValidationIssue["step"]
  ): void => {
    const option = input.origins!.originFeatOptions.find((candidate) => candidate.id === feat);
    if (!option?.magicInitiateClass) {
      if ((cantrips?.length ?? 0) > 0 || spell || ability) add(step, `${label} choices are not available for the selected feat.`);
      return;
    }
    const allowedCantrips = input.origins!.spellOptions.filter((candidate) => candidate.level === 0 && candidate.classes.includes(option.magicInitiateClass!)).map((candidate) => candidate.id);
    const allowedSpells = input.origins!.spellOptions.filter((candidate) => candidate.level === 1 && candidate.classes.includes(option.magicInitiateClass!)).map((candidate) => candidate.id);
    const selectedCantrips = cantrips ?? [];
    if (selectedCantrips.length !== 2 || new Set(selectedCantrips).size !== 2 || selectedCantrips.some((id) => !allowedCantrips.includes(id))) add(step, `Choose exactly two ${label} cantrips from the ${option.magicInitiateClass} list.`);
    if (!spell || !allowedSpells.includes(spell)) add(step, `Choose one ${label} level 1 spell from the ${option.magicInitiateClass} list.`);
    if (!input.origins!.spellcastingAbilities.includes(ability ?? "")) add(step, `Choose Intelligence, Wisdom, or Charisma for ${label}.`);
  };
  validateMagicInitiate(background?.feat, input.value.backgroundMagicInitiateCantrips, input.value.backgroundMagicInitiateSpell, input.value.backgroundMagicInitiateAbility, `${background?.name ?? "background"} Magic Initiate`, "Background");
  if (species?.id === "human") validateMagicInitiate(input.value.originFeat, input.value.originFeatMagicInitiateCantrips, input.value.originFeatMagicInitiateSpell, input.value.originFeatMagicInitiateAbility, "Human Magic Initiate", "Origin");

  const skilled = input.value.skilledProficiencyChoices ?? [];
  if (species?.id === "human" && input.value.originFeat === "Skilled") {
    if (skilled.length !== 3 || new Set(skilled).size !== 3 || skilled.some((id) => !input.origins!.skilledProficiencyOptions.some((option) => option.id === id))) add("Origin", "Choose exactly three different skills or tools for Skilled.");
  } else if (skilled.length > 0) {
    add("Origin", "Skilled proficiency choices require the Human Skilled origin feat.");
  }
  const expertise = input.value.rogueExpertiseChoices ?? [];
  if (input.template?.id === "rogue") {
    const skilledSkills = skilled.filter((id) => input.origins!.skilledProficiencyOptions.some((option) => option.id === id && option.category === "skill"));
    const known = new Set([...(background?.skillProficiencies ?? []), ...classSkills, ...(species?.id === "human" && input.value.skillProficiency ? [input.value.skillProficiency] : []), ...skilledSkills]);
    if (expertise.length !== 2 || new Set(expertise).size !== 2 || expertise.some((id) => !known.has(id))) add("Background", "Choose exactly two current skill proficiencies for Rogue Expertise.");
  }
  if (input.value.eldritchInvocation === "pact-of-the-tome") {
    const tomeCantrips = input.value.pactTomeCantripChoices ?? [];
    const tomeRituals = input.value.pactTomeRitualChoices ?? [];
    const anyCantrips = input.origins.spellOptions.filter((spell) => spell.level === 0).map((spell) => spell.id);
    const anyRituals = input.origins.spellOptions.filter((spell) => spell.level === 1 && spell.ritual).map((spell) => spell.id);
    if (tomeCantrips.length !== 3 || new Set(tomeCantrips).size !== 3 || tomeCantrips.some((id) => !anyCantrips.includes(id))) add("Background", "Choose exactly three published cantrips for Pact of the Tome.");
    if (tomeRituals.length !== 2 || new Set(tomeRituals).size !== 2 || tomeRituals.some((id) => !anyRituals.includes(id))) add("Background", "Choose exactly two published level 1 ritual spells for Pact of the Tome.");
  } else if ((input.value.pactTomeCantripChoices?.length ?? 0) > 0 || (input.value.pactTomeRitualChoices?.length ?? 0) > 0) {
    add("Background", "Pact Tome spell choices require the Pact of the Tome invocation.");
  }
  const backgroundMagicInitiateOption = input.origins.originFeatOptions.find((feat) => feat.id === background?.feat && feat.magicInitiateClass);
  const humanMagicInitiateOption = species?.id === "human" ? input.origins.originFeatOptions.find((feat) => feat.id === input.value.originFeat && feat.magicInitiateClass) : undefined;
  const duplicateSpellSources: Array<{ ids: string[]; step: CharacterCreatorValidationIssue["step"]; label: string }> = [
    {
      ids: [...classCantrips, ...(input.template?.id === "wizard" ? wizardSpellbook : classPrepared), ...(classSpellChoice?.alwaysPreparedSpellIds ?? [])],
      step: "Background",
      label: "Class spell choices"
    },
    ...(backgroundMagicInitiateOption ? [{ ids: [...(input.value.backgroundMagicInitiateCantrips ?? []), ...(input.value.backgroundMagicInitiateSpell ? [input.value.backgroundMagicInitiateSpell] : [])], step: "Background" as const, label: "Background Magic Initiate" }] : []),
    ...(humanMagicInitiateOption ? [{ ids: [...(input.value.originFeatMagicInitiateCantrips ?? []), ...(input.value.originFeatMagicInitiateSpell ? [input.value.originFeatMagicInitiateSpell] : [])], step: "Origin" as const, label: "Human Magic Initiate" }] : []),
    ...(input.value.eldritchInvocation === "pact-of-the-tome" ? [{ ids: [...(input.value.pactTomeCantripChoices ?? []), ...(input.value.pactTomeRitualChoices ?? [])], step: "Background" as const, label: "Pact of the Tome" }] : [])
  ];
  const seenSpellIds = new Set<string>();
  for (const source of duplicateSpellSources) {
    if (source.ids.some((id) => seenSpellIds.has(id))) add(source.step, `${source.label} cannot duplicate a spell granted by another level-one choice.`);
    source.ids.forEach((id) => seenSpellIds.add(id));
  }

  const increases = Object.entries(input.value.abilityScoreIncreases ?? {});
  const increaseValues = increases.map(([, value]) => value).sort((left, right) => right - left);
  const validSpread = (increaseValues.length === 2 && increaseValues[0] === 2 && increaseValues[1] === 1)
    || (increaseValues.length === 3 && increaseValues.every((value) => value === 1));
  if (!validSpread || (background && increases.some(([ability]) => !background.abilityScores.includes(ability)))) {
    add("Background", "Choose either +2/+1 or +1/+1/+1 using this background's listed abilities.");
  }

  if (!classSkillChoice) add("Background", "Class skill choices could not be loaded for this class.");
  else {
    if (classSkills.length !== classSkillChoice.count) add("Background", `Choose exactly ${classSkillChoice.count} ${classSkillChoice.className} class skills.`);
    if (new Set(classSkills).size !== classSkills.length) add("Background", "Class skill choices cannot repeat a skill.");
    if (classSkills.some((skill) => !classSkillChoice.skillIds.includes(skill))) add("Background", `Choose skills from the ${classSkillChoice.className} class list.`);
    if (background && classSkills.some((skill) => background.skillProficiencies.includes(skill))) add("Background", `Choose class skills not already granted by ${background.name}.`);
  }

  const originLanguages = input.value.originLanguageChoices ?? [];
  if (!originLanguageChoice) add("Origin", "Origin language choices could not be loaded.");
  else {
    if (originLanguages.length !== originLanguageChoice.count) add("Origin", `Choose exactly ${originLanguageChoice.count} origin languages.`);
    if (new Set(originLanguages).size !== originLanguages.length) add("Origin", "Origin language choices cannot repeat a language.");
    if (originLanguages.some((language) => !originLanguageChoice.languageIds.includes(language))) add("Origin", "Choose origin languages from the Standard Languages list.");
  }

  const classLanguages = input.value.classLanguageChoices ?? [];
  if (!classLanguageChoice) add("Origin", "Class language rules could not be loaded for this class.");
  else {
    if (classLanguageChoice.count === 0 && classLanguages.length > 0) add("Origin", `${classLanguageChoice.className} has no selectable level-one class language.`);
    else if (classLanguages.length !== classLanguageChoice.count) add("Origin", `Choose exactly ${classLanguageChoice.count} ${classLanguageChoice.className} class language ${classLanguageChoice.count === 1 ? "choice" : "choices"}.`);
    if (new Set(classLanguages).size !== classLanguages.length) add("Origin", "Class language choices cannot repeat a language.");
    if (classLanguageChoice.count > 0 && classLanguages.some((language) => !classLanguageChoice.languageIds.includes(language))) add("Origin", `Choose the ${classLanguageChoice.className} class language from its allowed language tables.`);
    const alreadyKnown = new Set([...(originLanguageChoice?.fixedLanguageIds ?? []), ...originLanguages, ...classLanguageChoice.fixedLanguageIds]);
    if (classLanguages.some((language) => alreadyKnown.has(language))) add("Origin", "Choose a class language the character does not already know.");
  }

  if (species?.id === "human") {
    const skill = input.origins.skills.find((item) => item.id === input.value.skillProficiency);
    if (!skill) add("Origin", "Choose the Human Skillful proficiency.");
    else if (background?.skillProficiencies.includes(skill.id)) add("Origin", `Choose a skill not already granted by ${background.name}.`);
    else if (classSkills.includes(skill.id)) add("Origin", `Choose a skill not already granted by the ${classSkillChoice?.className ?? "class"}.`);
    if (!input.value.originFeat || !input.origins.originFeats.includes(input.value.originFeat)) add("Origin", "Choose a supported Human Versatile origin feat.");
    else if (background?.feat === input.value.originFeat) add("Origin", `Choose a feat other than ${background.feat}, which ${background.name} already grants.`);
  }

  if (species?.id === "dragonborn") {
    if (!input.origins.draconicAncestors.some((ancestor) => ancestor.id === input.value.draconicAncestry)) add("Origin", "Choose a supported Draconic Ancestry.");
  } else if (input.value.draconicAncestry !== undefined) {
    add("Origin", "Draconic Ancestry is only available to Dragonborn characters.");
  }
  if (species?.id === "goliath") {
    if (!input.origins.giantAncestries.some((ancestry) => ancestry.id === input.value.giantAncestry)) add("Origin", "Choose a supported Giant Ancestry benefit.");
  } else if (input.value.giantAncestry !== undefined) {
    add("Origin", "Giant Ancestry is only available to Goliath characters.");
  }

  if (species && ["elf", "gnome", "tiefling"].includes(species.id) && !input.origins.spellcastingAbilities.includes(input.value.speciesSpellcastingAbility ?? "")) {
    add("Origin", `Choose the ${species.name} spellcasting ability.`);
  }
  if (species?.id === "elf") {
    const lineage = input.origins.elfLineages.find((item) => item.id === input.value.elfLineage);
    if (!lineage) add("Origin", "Choose an Elven Lineage.");
    else if (lineage.id === "high-elf" && !input.origins.highElfCantrips.includes(input.value.elfCantrip ?? "")) add("Origin", "Choose a supported High Elf Wizard cantrip.");
  }
  if (species?.id === "gnome" && !input.origins.gnomeLineages.some((item) => item.id === input.value.gnomeLineage)) add("Origin", "Choose a Gnomish Lineage.");
  if (species?.id === "tiefling" && !input.origins.tieflingLegacies.some((item) => item.id === input.value.tieflingLegacy)) add("Origin", "Choose a Tiefling Fiendish Legacy.");

  if (!input.value.name.trim()) add("Finish", "Enter a character name.");
  if (!input.value.ownerUserId) add("Finish", "Choose who plays this character.");
  return issues;
}


export function CharacterCreatorDialog(props: {
  templates: CharacterTemplateInfo[];
  origins?: CharacterOriginsInfo;
  members: Snapshot["members"];
  currentUserId: string;
  onClose(): void;
  onCreate(template: CharacterTemplateInfo, input: CharacterCreateInput): Promise<void>;
}) {
  const steps = props.origins ? ["Class", "Origin", "Background", "Finish"] : ["Class", "Finish"];
  const [stepIndex, setStepIndex] = useState(0);
  const [templateId, setTemplateId] = useState(props.templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [ownerUserId, setOwnerUserId] = useState(props.currentUserId);
  const [speciesId, setSpeciesId] = useState("human");
  const [backgroundId, setBackgroundId] = useState("soldier");
  const [spreadMode, setSpreadMode] = useState<"2-1" | "1-1-1">("2-1");
  const [plusTwoChoice, setPlusTwoChoice] = useState("");
  const [plusOneChoice, setPlusOneChoice] = useState("");
  const [classSkillProficiencies, setClassSkillProficiencies] = useState<string[]>([]);
  const [originLanguageChoices, setOriginLanguageChoices] = useState<string[]>([]);
  const [classLanguageChoices, setClassLanguageChoices] = useState<string[]>([]);
  const [draconicAncestry, setDraconicAncestry] = useState("black");
  const [giantAncestry, setGiantAncestry] = useState("cloud");
  const [skillProficiency, setSkillProficiency] = useState("");
  const [originFeat, setOriginFeat] = useState("Skilled");
  const [elfLineage, setElfLineage] = useState("high-elf");
  const [elfCantrip, setElfCantrip] = useState("prestidigitation");
  const [gnomeLineage, setGnomeLineage] = useState("forest-gnome");
  const [tieflingLegacy, setTieflingLegacy] = useState("infernal");
  const [spellAbility, setSpellAbility] = useState("intelligence");
  const [classEquipmentPackageChoice, setClassEquipmentPackageChoice] = useState("");
  const [backgroundEquipmentPackageChoice, setBackgroundEquipmentPackageChoice] = useState("");
  const [classEquipmentChoiceValues, setClassEquipmentChoiceValues] = useState<Record<string, string>>({});
  const [backgroundEquipmentChoiceValues, setBackgroundEquipmentChoiceValues] = useState<Record<string, string>>({});
  const [classToolProficiencyChoices, setClassToolProficiencyChoices] = useState<string[]>([]);
  const [backgroundToolProficiencyChoice, setBackgroundToolProficiencyChoice] = useState("");
  const [weaponMasteryChoices, setWeaponMasteryChoices] = useState<string[]>([]);
  const [classCantripChoices, setClassCantripChoices] = useState<string[]>([]);
  const [classPreparedSpellChoices, setClassPreparedSpellChoices] = useState<string[]>([]);
  const [wizardSpellbookChoices, setWizardSpellbookChoices] = useState<string[]>([]);
  const [backgroundMagicInitiateCantrips, setBackgroundMagicInitiateCantrips] = useState<string[]>([]);
  const [backgroundMagicInitiateSpell, setBackgroundMagicInitiateSpell] = useState("");
  const [backgroundMagicInitiateAbility, setBackgroundMagicInitiateAbility] = useState("intelligence");
  const [originFeatMagicInitiateCantrips, setOriginFeatMagicInitiateCantrips] = useState<string[]>([]);
  const [originFeatMagicInitiateSpell, setOriginFeatMagicInitiateSpell] = useState("");
  const [originFeatMagicInitiateAbility, setOriginFeatMagicInitiateAbility] = useState("intelligence");
  const [skilledProficiencyChoices, setSkilledProficiencyChoices] = useState<string[]>([]);
  const [fightingStyle, setFightingStyle] = useState("defense");
  const [divineOrder, setDivineOrder] = useState("protector");
  const [primalOrder, setPrimalOrder] = useState("warden");
  const [rogueExpertiseChoices, setRogueExpertiseChoices] = useState<string[]>([]);
  const [eldritchInvocation, setEldritchInvocation] = useState("eldritch-mind");
  const [pactTomeCantripChoices, setPactTomeCantripChoices] = useState<string[]>([]);
  const [pactTomeRitualChoices, setPactTomeRitualChoices] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const originLanguageHelpId = useId();
  const classLanguageHelpId = useId();
  const draconicAncestryHelpId = useId();
  const giantAncestryHelpId = useId();
  const classEquipmentHelpId = useId();
  const backgroundEquipmentHelpId = useId();
  const classToolHelpId = useId();
  const masteryHelpId = useId();
  const classSpellHelpId = useId();
  const magicInitiateHelpId = useId();
  const dialogRef = useModalAccessibility<HTMLDivElement>(props.onClose);

  const template = props.templates.find((item) => item.id === templateId);
  const origins = props.origins;
  const species = origins?.species.find((item) => item.id === speciesId);
  const background = origins?.backgrounds.find((item) => item.id === backgroundId);
  const classSkillChoice = origins?.classSkillChoices.find((item) => item.templateId === templateId);
  const classLanguageChoice = origins?.classLanguageChoices.find((item) => item.templateId === templateId);
  const classStartingEquipment = origins?.classStartingEquipment.find((item) => item.templateId === templateId);
  const backgroundStartingEquipment = origins?.backgroundStartingEquipment.find((item) => item.backgroundId === backgroundId);
  const classWeaponMasteryChoice = origins?.classWeaponMasteryChoices.find((item) => item.templateId === templateId);
  const classSpellChoice = origins?.classSpellChoices.find((item) => item.templateId === templateId);
  const classEquipmentPackageId = classStartingEquipment?.packages.some((pkg) => pkg.id === classEquipmentPackageChoice)
    ? classEquipmentPackageChoice
    : classStartingEquipment?.packages[0]?.id ?? "";
  const backgroundEquipmentPackageId = backgroundStartingEquipment?.packages.some((pkg) => pkg.id === backgroundEquipmentPackageChoice)
    ? backgroundEquipmentPackageChoice
    : backgroundStartingEquipment?.packages[0]?.id ?? "";
  const classEquipmentPackage = classStartingEquipment?.packages.find((pkg) => pkg.id === classEquipmentPackageId);
  const backgroundEquipmentPackage = backgroundStartingEquipment?.packages.find((pkg) => pkg.id === backgroundEquipmentPackageId);
  const resolvedClassEquipmentChoices = Object.fromEntries((classEquipmentPackage?.choices ?? [])
    .filter((choice) => !choice.matchSelection)
    .map((choice) => [choice.id, choice.optionIds.includes(classEquipmentChoiceValues[choice.id] ?? "") ? classEquipmentChoiceValues[choice.id] ?? "" : choice.optionIds[0] ?? ""]));
  const resolvedBackgroundEquipmentChoices = Object.fromEntries((backgroundEquipmentPackage?.choices ?? [])
    .filter((choice) => !choice.matchSelection)
    .map((choice) => [choice.id, choice.optionIds.includes(backgroundEquipmentChoiceValues[choice.id] ?? "") ? backgroundEquipmentChoiceValues[choice.id] ?? "" : choice.optionIds[0] ?? ""]));
  const resolvedBackgroundToolProficiencyChoice = backgroundStartingEquipment?.toolProficiencyChoice.optionIds.includes(backgroundToolProficiencyChoice)
    ? backgroundToolProficiencyChoice
    : "";
  const spreadAbilities = background?.abilityScores ?? [];
  const plusTwo = spreadAbilities.includes(plusTwoChoice) ? plusTwoChoice : spreadAbilities[0] ?? "";
  const plusOneFallback = spreadAbilities.find((ability) => ability !== plusTwo) ?? "";
  const plusOne = spreadAbilities.includes(plusOneChoice) && plusOneChoice !== plusTwo ? plusOneChoice : plusOneFallback;
  const humanSkillOptions = origins?.skills.filter((skill) => !background?.skillProficiencies.includes(skill.id) && !classSkillProficiencies.includes(skill.id)) ?? [];
  const classSkillOptions = origins?.skills.filter((skill) =>
    classSkillChoice?.skillIds.includes(skill.id)
    && !background?.skillProficiencies.includes(skill.id)
    && !(speciesId === "human" && skill.id === skillProficiency)
  ) ?? [];
  const classSkillLabels = classSkillProficiencies.map((skillId) => origins?.skills.find((skill) => skill.id === skillId)?.label ?? prettyOriginId(skillId));
  const originLanguageOptions = origins?.languages.filter((language) => origins.originLanguageChoice.languageIds.includes(language.id)) ?? [];
  const classLanguageOptions = origins?.languages.filter((language) =>
    classLanguageChoice?.languageIds.includes(language.id)
    && !origins.originLanguageChoice.fixedLanguageIds.includes(language.id)
    && !originLanguageChoices.includes(language.id)
    && !classLanguageChoice.fixedLanguageIds.includes(language.id)
  ) ?? [];
  const originLanguageLabels = originLanguageChoices.map((languageId) => origins?.languages.find((language) => language.id === languageId)?.label ?? prettyOriginId(languageId));
  const classFeatureLanguageLabels = [...(classLanguageChoice?.fixedLanguageIds ?? []), ...classLanguageChoices]
    .map((languageId) => origins?.languages.find((language) => language.id === languageId)?.label ?? prettyOriginId(languageId));
  const selectedDraconicAncestor = origins?.draconicAncestors.find((ancestor) => ancestor.id === draconicAncestry);
  const selectedGiantAncestry = origins?.giantAncestries.find((ancestry) => ancestry.id === giantAncestry);
  const weaponMasteryOptions = origins?.weaponMasteryOptions.filter((weapon) => classWeaponMasteryChoice?.weaponIds.includes(weapon.id)) ?? [];
  const expectedClassCantripCount = (classSpellChoice?.cantripCount ?? 0)
    + (templateId === "cleric" && divineOrder === "thaumaturge" ? 1 : 0)
    + (templateId === "druid" && primalOrder === "magician" ? 1 : 0);
  const classCantripOptions = origins?.spellOptions.filter((spell) => spell.level === 0 && classSpellChoice?.cantripIds.includes(spell.id)) ?? [];
  const classLevelOneSpellOptions = origins?.spellOptions.filter((spell) => spell.level === 1 && classSpellChoice?.levelOneSpellIds.includes(spell.id) && !classSpellChoice.alwaysPreparedSpellIds.includes(spell.id)) ?? [];
  const backgroundMagicInitiate = origins?.originFeatOptions.find((feat) => feat.id === background?.feat && feat.magicInitiateClass);
  const humanMagicInitiate = speciesId === "human" ? origins?.originFeatOptions.find((feat) => feat.id === originFeat && feat.magicInitiateClass) : undefined;
  const magicInitiateOptions = (feat: typeof backgroundMagicInitiate, level: 0 | 1) => origins?.spellOptions.filter((spell) => spell.level === level && feat?.magicInitiateClass && spell.classes.includes(feat.magicInitiateClass)) ?? [];
  const selectedSkilledSkillIds = skilledProficiencyChoices.filter((id) => origins?.skilledProficiencyOptions.some((option) => option.id === id && option.category === "skill"));
  const rogueExpertiseOptions = origins?.skills.filter((skill) => background?.skillProficiencies.includes(skill.id) || classSkillProficiencies.includes(skill.id) || (speciesId === "human" && skillProficiency === skill.id) || selectedSkilledSkillIds.includes(skill.id)) ?? [];
  const pactTomeCantripOptions = origins?.spellOptions.filter((spell) => spell.level === 0) ?? [];
  const pactTomeRitualOptions = origins?.spellOptions.filter((spell) => spell.level === 1 && spell.ritual) ?? [];
  const selectedStartingGp = (classEquipmentPackage?.gp ?? 0) + (backgroundEquipmentPackage?.gp ?? 0);
  const speciesNeedsSpellAbility = speciesId === "elf" || speciesId === "gnome" || speciesId === "tiefling";
  const buildSummary = [species?.name, background?.name, template?.name].filter(Boolean).join(" ");
  const spellLabels = (ids: string[]) => ids.map((id) => origins?.spellOptions.find((spell) => spell.id === id)?.name ?? prettyOriginId(id));
  const classChoiceSummary = [
    templateId === "fighter" ? origins?.fightingStyles.find((choice) => choice.id === fightingStyle)?.name : undefined,
    templateId === "cleric" ? origins?.divineOrders.find((choice) => choice.id === divineOrder)?.name : undefined,
    templateId === "druid" ? origins?.primalOrders.find((choice) => choice.id === primalOrder)?.name : undefined,
    templateId === "warlock" ? origins?.eldritchInvocations.find((choice) => choice.id === eldritchInvocation)?.name : undefined,
    templateId === "rogue" && rogueExpertiseChoices.length > 0 ? `Expertise: ${rogueExpertiseChoices.map(prettyOriginId).join(", ")}` : undefined
  ].filter((value): value is string => Boolean(value));
  const spellChoiceSummary = [
    classCantripChoices.length > 0 ? `Cantrips: ${spellLabels(classCantripChoices).join(", ")}` : undefined,
    wizardSpellbookChoices.length > 0 ? `Spellbook: ${spellLabels(wizardSpellbookChoices).join(", ")}` : undefined,
    classPreparedSpellChoices.length > 0 ? `Prepared: ${spellLabels(classPreparedSpellChoices).join(", ")}` : undefined,
    (classSpellChoice?.alwaysPreparedSpellIds.length ?? 0) > 0 ? `Always prepared: ${spellLabels(classSpellChoice?.alwaysPreparedSpellIds ?? []).join(", ")}` : undefined,
    backgroundMagicInitiate ? `${backgroundMagicInitiate.name}: ${spellLabels([...backgroundMagicInitiateCantrips, ...(backgroundMagicInitiateSpell ? [backgroundMagicInitiateSpell] : [])]).join(", ")} (${prettyOriginId(backgroundMagicInitiateAbility)})` : undefined,
    humanMagicInitiate ? `${humanMagicInitiate.name}: ${spellLabels([...originFeatMagicInitiateCantrips, ...(originFeatMagicInitiateSpell ? [originFeatMagicInitiateSpell] : [])]).join(", ")} (${prettyOriginId(originFeatMagicInitiateAbility)})` : undefined,
    eldritchInvocation === "pact-of-the-tome" ? `Pact Tome: ${spellLabels([...pactTomeCantripChoices, ...pactTomeRitualChoices]).join(", ")}` : undefined
  ].filter((value): value is string => Boolean(value));

  function creationInput(): CharacterCreateInput {
    const input: CharacterCreateInput = { name, ownerUserId };
    if (!origins) return input;
    input.creationMode = "level-one-srd";
    input.backgroundId = backgroundId;
    input.speciesId = speciesId;
    input.abilityScoreIncreases = spreadMode === "2-1"
      ? { [plusTwo]: 2, [plusOne]: 1 }
      : Object.fromEntries(spreadAbilities.map((ability) => [ability, 1]));
    input.classSkillProficiencies = [...classSkillProficiencies];
    input.originLanguageChoices = [...originLanguageChoices];
    input.classLanguageChoices = [...classLanguageChoices];
    input.classEquipmentPackageId = classEquipmentPackageId;
    input.backgroundEquipmentPackageId = backgroundEquipmentPackageId;
    if (Object.keys(resolvedClassEquipmentChoices).length > 0) input.classEquipmentChoices = resolvedClassEquipmentChoices;
    if (Object.keys(resolvedBackgroundEquipmentChoices).length > 0) input.backgroundEquipmentChoices = resolvedBackgroundEquipmentChoices;
    input.classToolProficiencyChoices = [...classToolProficiencyChoices];
    if (resolvedBackgroundToolProficiencyChoice) input.backgroundToolProficiencyChoice = resolvedBackgroundToolProficiencyChoice;
    input.weaponMasteryChoices = [...weaponMasteryChoices];
    input.classCantripChoices = [...classCantripChoices];
    input.classPreparedSpellChoices = [...classPreparedSpellChoices];
    if (templateId === "wizard") input.wizardSpellbookChoices = [...wizardSpellbookChoices];
    if (templateId === "fighter") input.fightingStyle = fightingStyle;
    if (templateId === "cleric") input.divineOrder = divineOrder;
    if (templateId === "druid") input.primalOrder = primalOrder;
    if (templateId === "rogue") input.rogueExpertiseChoices = [...rogueExpertiseChoices];
    if (templateId === "warlock") {
      input.eldritchInvocation = eldritchInvocation;
      if (eldritchInvocation === "pact-of-the-tome") {
        input.pactTomeCantripChoices = [...pactTomeCantripChoices];
        input.pactTomeRitualChoices = [...pactTomeRitualChoices];
      }
    }
    if (backgroundMagicInitiate) {
      input.backgroundMagicInitiateCantrips = [...backgroundMagicInitiateCantrips];
      if (backgroundMagicInitiateSpell) input.backgroundMagicInitiateSpell = backgroundMagicInitiateSpell;
      input.backgroundMagicInitiateAbility = backgroundMagicInitiateAbility;
    }
    if (speciesId === "dragonborn") input.draconicAncestry = draconicAncestry;
    if (speciesId === "goliath") input.giantAncestry = giantAncestry;
    if (speciesId === "human") {
      if (skillProficiency) input.skillProficiency = skillProficiency;
      input.originFeat = originFeat;
      if (originFeat === "Skilled") input.skilledProficiencyChoices = [...skilledProficiencyChoices];
      if (humanMagicInitiate) {
        input.originFeatMagicInitiateCantrips = [...originFeatMagicInitiateCantrips];
        if (originFeatMagicInitiateSpell) input.originFeatMagicInitiateSpell = originFeatMagicInitiateSpell;
        input.originFeatMagicInitiateAbility = originFeatMagicInitiateAbility;
      }
    }
    if (speciesId === "elf") {
      input.elfLineage = elfLineage;
      if (elfLineage === "high-elf") input.elfCantrip = elfCantrip;
    }
    if (speciesId === "gnome") input.gnomeLineage = gnomeLineage;
    if (speciesId === "tiefling") input.tieflingLegacy = tieflingLegacy;
    if (speciesNeedsSpellAbility) input.speciesSpellcastingAbility = spellAbility;
    return input;
  }

  function toggleClassSkill(skillId: string, selected: boolean): void {
    setClassSkillProficiencies((current) => {
      if (!selected) return current.filter((item) => item !== skillId);
      if (current.includes(skillId) || current.length >= (classSkillChoice?.count ?? 0)) return current;
      return [...current, skillId];
    });
  }

  function toggleOriginLanguage(languageId: string, selected: boolean): void {
    setOriginLanguageChoices((current) => {
      if (!selected) return current.filter((item) => item !== languageId);
      if (current.includes(languageId) || current.length >= (origins?.originLanguageChoice.count ?? 0)) return current;
      return [...current, languageId];
    });
    if (selected) setClassLanguageChoices((current) => current.filter((item) => item !== languageId));
  }

  function toggleClassLanguage(languageId: string, selected: boolean): void {
    setClassLanguageChoices((current) => {
      if (!selected) return current.filter((item) => item !== languageId);
      if (current.includes(languageId) || current.length >= (classLanguageChoice?.count ?? 0)) return current;
      return [...current, languageId];
    });
  }

  function toggleClassTool(toolId: string, selected: boolean): void {
    setClassToolProficiencyChoices((current) => {
      if (!selected) return current.filter((item) => item !== toolId);
      if (current.includes(toolId) || current.length >= (classStartingEquipment?.toolProficiencyChoice.count ?? 0)) return current;
      return [...current, toolId];
    });
  }

  function toggleWeaponMastery(weaponId: string, selected: boolean): void {
    setWeaponMasteryChoices((current) => {
      if (!selected) return current.filter((item) => item !== weaponId);
      if (current.includes(weaponId) || current.length >= (classWeaponMasteryChoice?.count ?? 0)) return current;
      return [...current, weaponId];
    });
  }

  const validationIssues = validateCharacterCreatorInput({ template, origins, value: creationInput() });

  async function submit() {
    if (!template || creating || validationIssues.length > 0) return;
    setCreating(true);
    setError("");
    try {
      await props.onCreate(template, creationInput());
    } catch (submitError) {
      setError(errorMessage(submitError));
      setCreating(false);
    }
  }

  const stepName = steps[stepIndex] ?? "Class";
  const visibleValidationIssues = stepName === "Finish" ? validationIssues : validationIssues.filter((issue) => issue.step === stepName);
  const nextDisabled = validationIssues.some((issue) => issue.step === stepName);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div ref={dialogRef} className="modal-dialog character-creator" role="dialog" aria-modal="true" aria-label="Character creator" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <h2>Create a character</h2>
            <p>{buildSummary || template?.name || "Choose a class to begin"}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close character creator" onClick={props.onClose}><X size={16} /></button>
        </header>
        <nav className="creator-steps" aria-label="Creator steps">
          {steps.map((step, index) => (
            <button key={step} type="button" className={index === stepIndex ? "creator-step active" : index < stepIndex ? "creator-step done" : "creator-step"} onClick={() => setStepIndex(Math.min(index, stepIndex))} disabled={index > stepIndex}>
              {index < stepIndex ? <Check size={12} /> : <span className="creator-step-number">{index + 1}</span>} {step}
            </button>
          ))}
        </nav>
        <div className="creator-body">
          {stepName === "Class" && (
            <div className="creator-grid" role="radiogroup" aria-label="Class">
              {props.templates.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={item.id === templateId} className={item.id === templateId ? "creator-card selected" : "creator-card"} onClick={() => { setTemplateId(item.id); setClassSkillProficiencies([]); setClassLanguageChoices([]); setClassEquipmentPackageChoice(""); setClassEquipmentChoiceValues({}); setClassToolProficiencyChoices([]); setWeaponMasteryChoices([]); setClassCantripChoices([]); setClassPreparedSpellChoices([]); setWizardSpellbookChoices([]); setRogueExpertiseChoices([]); setPactTomeCantripChoices([]); setPactTomeRitualChoices([]); }}>
                  <strong>{item.name}</strong>
                  <small>{item.summary}</small>
                </button>
              ))}
            </div>
          )}
          {stepName === "Origin" && origins && (
            <>
              <div className="creator-grid compact" role="radiogroup" aria-label="Species">
                {origins.species.map((item) => (
                  <button key={item.id} type="button" role="radio" aria-checked={item.id === speciesId} className={item.id === speciesId ? "creator-card selected" : "creator-card"} onClick={() => setSpeciesId(item.id)}>
                    <strong>{item.name}</strong>
                    <small>{item.size} · {item.speed} ft. · {item.traits.slice(0, 3).join(", ")}</small>
                  </button>
                ))}
              </div>
              <div className="creator-choices">
                {speciesId === "dragonborn" && (
                  <>
                    <label>
                      <span>Draconic ancestry</span>
                      <select aria-label="Draconic ancestry" aria-describedby={draconicAncestryHelpId} value={draconicAncestry} onChange={(event) => setDraconicAncestry(event.target.value)}>
                        {origins.draconicAncestors.map((ancestor) => <option key={ancestor.id} value={ancestor.id}>{ancestor.name} · {prettyOriginId(ancestor.damageType)}</option>)}
                      </select>
                    </label>
                    <p id={draconicAncestryHelpId} className="creator-note">{selectedDraconicAncestor ? `${selectedDraconicAncestor.name} sets Breath Weapon damage and ${prettyOriginId(selectedDraconicAncestor.damageType)} resistance.` : "Choose the dragon ancestor that sets Breath Weapon damage and resistance."}</p>
                  </>
                )}
                {speciesId === "goliath" && (
                  <>
                    <label>
                      <span>Giant ancestry</span>
                      <select aria-label="Giant ancestry" aria-describedby={giantAncestryHelpId} value={giantAncestry} onChange={(event) => setGiantAncestry(event.target.value)}>
                        {origins.giantAncestries.map((ancestry) => <option key={ancestry.id} value={ancestry.id}>{ancestry.name} ({ancestry.giantType})</option>)}
                      </select>
                    </label>
                    <p id={giantAncestryHelpId} className="creator-note">{selectedGiantAncestry?.summary ?? "Choose one Giant Ancestry benefit."} The sheet tracks its uses; movement, conditions, and target effects remain manual.</p>
                  </>
                )}
                {speciesId === "human" && (
                  <>
                    <label>
                      <span>Skillful proficiency</span>
                      <select aria-label="Human skill proficiency" value={skillProficiency} onChange={(event) => setSkillProficiency(event.target.value)}>
                        <option value="">Choose a skill</option>
                        {humanSkillOptions.map((skill) => <option key={skill.id} value={skill.id}>{skill.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Versatile origin feat</span>
                      <select aria-label="Human origin feat" value={originFeat} onChange={(event) => { setOriginFeat(event.target.value); setSkilledProficiencyChoices([]); setOriginFeatMagicInitiateCantrips([]); setOriginFeatMagicInitiateSpell(""); }}>
                        {origins.originFeats.filter((feat) => feat !== background?.feat).map((feat) => <option key={feat} value={feat}>{feat}</option>)}
                      </select>
                    </label>
                  </>
                )}
                {speciesId === "human" && originFeat === "Skilled" && (
                  <fieldset className="creator-skill-choices">
                    <legend>Skilled proficiencies ({skilledProficiencyChoices.length}/3)</legend>
                    <p className="creator-note">Choose any three different skills or tools you do not already have.</p>
                    <div className="creator-skill-options">
                      {origins.skilledProficiencyOptions.map((option) => {
                        const checked = skilledProficiencyChoices.includes(option.id);
                        const alreadyKnown = option.category === "skill"
                          ? background?.skillProficiencies.includes(option.id) || classSkillProficiencies.includes(option.id) || skillProficiency === option.id
                          : background?.toolProficiencies.includes(option.id) || classToolProficiencyChoices.includes(option.id) || backgroundToolProficiencyChoice === option.id;
                        return (
                          <label key={`${option.category}-${option.id}`}>
                            <input type="checkbox" checked={checked} disabled={Boolean(alreadyKnown) || (!checked && skilledProficiencyChoices.length >= 3)} onChange={(event) => setSkilledProficiencyChoices((current) => event.target.checked ? [...current.filter((id) => id !== option.id), option.id].slice(0, 3) : current.filter((id) => id !== option.id))} />
                            <span>{option.label} <small>{option.category}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {humanMagicInitiate && (
                  <fieldset className="creator-skill-choices" aria-describedby={magicInitiateHelpId}>
                    <legend>{humanMagicInitiate.name}</legend>
                    <p id={magicInitiateHelpId} className="creator-note">Choose two cantrips, one level 1 spell, and its casting ability. The level 1 spell gets one free cast per Long Rest.</p>
                    <div className="creator-skill-options">
                      {magicInitiateOptions(humanMagicInitiate, 0).map((spell) => {
                        const checked = originFeatMagicInitiateCantrips.includes(spell.id);
                        return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && originFeatMagicInitiateCantrips.length >= 2} onChange={(event) => setOriginFeatMagicInitiateCantrips((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, 2) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>;
                      })}
                    </div>
                    <label><span>Level 1 spell</span><select value={originFeatMagicInitiateSpell} onChange={(event) => setOriginFeatMagicInitiateSpell(event.target.value)}><option value="">Choose a spell</option>{magicInitiateOptions(humanMagicInitiate, 1).map((spell) => <option key={spell.id} value={spell.id}>{spell.name}</option>)}</select></label>
                    <label><span>Spellcasting ability</span><select value={originFeatMagicInitiateAbility} onChange={(event) => setOriginFeatMagicInitiateAbility(event.target.value)}>{origins.spellcastingAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}</select></label>
                  </fieldset>
                )}
                {speciesId === "elf" && (
                  <>
                    <label>
                      <span>Elven lineage</span>
                      <select aria-label="Elven lineage" value={elfLineage} onChange={(event) => setElfLineage(event.target.value)}>
                        {origins.elfLineages.map((lineage) => <option key={lineage.id} value={lineage.id}>{lineage.name}</option>)}
                      </select>
                    </label>
                    {elfLineage === "high-elf" && (
                      <label>
                        <span>High Elf cantrip</span>
                        <select aria-label="High Elf cantrip" value={elfCantrip} onChange={(event) => setElfCantrip(event.target.value)}>
                          {origins.highElfCantrips.map((cantrip) => <option key={cantrip} value={cantrip}>{prettyOriginId(cantrip)}</option>)}
                        </select>
                      </label>
                    )}
                  </>
                )}
                {speciesId === "gnome" && (
                  <label>
                    <span>Gnomish lineage</span>
                    <select aria-label="Gnomish lineage" value={gnomeLineage} onChange={(event) => setGnomeLineage(event.target.value)}>
                      {origins.gnomeLineages.map((lineage) => <option key={lineage.id} value={lineage.id}>{lineage.name}</option>)}
                    </select>
                  </label>
                )}
                {speciesId === "tiefling" && (
                  <label>
                    <span>Fiendish legacy</span>
                    <select aria-label="Fiendish legacy" value={tieflingLegacy} onChange={(event) => setTieflingLegacy(event.target.value)}>
                      {origins.tieflingLegacies.map((legacy) => <option key={legacy.id} value={legacy.id}>{legacy.name} · resists {legacy.resistance}</option>)}
                    </select>
                  </label>
                )}
                {speciesNeedsSpellAbility && (
                  <label>
                    <span>Spellcasting ability for species spells</span>
                    <select aria-label="Species spellcasting ability" value={spellAbility} onChange={(event) => setSpellAbility(event.target.value)}>
                      {origins.spellcastingAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                    </select>
                  </label>
                )}
                <fieldset className="creator-skill-choices" aria-describedby={originLanguageHelpId}>
                  <legend>Origin languages ({originLanguageChoices.length}/{origins.originLanguageChoice.count})</legend>
                  <p id={originLanguageHelpId} className="creator-note">Common is included automatically. Choose {origins.originLanguageChoice.count} different languages from the Standard Languages list.</p>
                  <div className="creator-skill-options">
                    {originLanguageOptions.map((language) => {
                      const checked = originLanguageChoices.includes(language.id);
                      return (
                        <label key={language.id}>
                          <input
                            aria-label={`Origin language ${language.label}`}
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && originLanguageChoices.length >= origins.originLanguageChoice.count}
                            onChange={(event) => toggleOriginLanguage(language.id, event.target.checked)}
                          />
                          <span>{language.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                {classLanguageChoice && classLanguageChoice.fixedLanguageIds.length > 0 && (
                  <p className="creator-note">{classLanguageChoice.className} includes {classLanguageChoice.fixedLanguageIds.map((languageId) => origins.languages.find((language) => language.id === languageId)?.label ?? prettyOriginId(languageId)).join(", ")} automatically as a class feature.</p>
                )}
                {classLanguageChoice && classLanguageChoice.count > 0 && (
                  <fieldset className="creator-skill-choices" aria-describedby={classLanguageHelpId}>
                    <legend>{classLanguageChoice.className} class language ({classLanguageChoices.length}/{classLanguageChoice.count})</legend>
                    <p id={classLanguageHelpId} className="creator-note">Choose a language from the Standard or Rare tables that the character does not already know.</p>
                    <div className="creator-skill-options">
                      {classLanguageOptions.map((language) => {
                        const checked = classLanguageChoices.includes(language.id);
                        return (
                          <label key={language.id}>
                            <input
                              aria-label={`${classLanguageChoice.className} class language ${language.label}`}
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && classLanguageChoices.length >= classLanguageChoice.count}
                              onChange={(event) => toggleClassLanguage(language.id, event.target.checked)}
                            />
                            <span>{language.label} <small>{language.category}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </div>
            </>
          )}
          {stepName === "Background" && origins && (
            <>
              <div className="creator-grid compact" role="radiogroup" aria-label="Background">
                {origins.backgrounds.map((item) => (
                  <button key={item.id} type="button" role="radio" aria-checked={item.id === backgroundId} className={item.id === backgroundId ? "creator-card selected" : "creator-card"} onClick={() => { setBackgroundId(item.id); setClassSkillProficiencies([]); setBackgroundEquipmentPackageChoice(""); setBackgroundEquipmentChoiceValues({}); setBackgroundToolProficiencyChoice(""); setBackgroundMagicInitiateCantrips([]); setBackgroundMagicInitiateSpell(""); }}>
                    <strong>{item.name}</strong>
                    <small>{item.feat} · {item.skillProficiencies.map(prettyOriginId).join(", ")}</small>
                  </button>
                ))}
              </div>
              <div className="creator-choices">
                {classSkillChoice && (
                  <fieldset className="creator-skill-choices">
                    <legend>{classSkillChoice.className} class skills ({classSkillProficiencies.length}/{classSkillChoice.count})</legend>
                    <p className="creator-note">Choose {classSkillChoice.count}. Skills from {background?.name ?? "the background"} are already included.</p>
                    <div className="creator-skill-options">
                      {classSkillOptions.map((skill) => {
                        const checked = classSkillProficiencies.includes(skill.id);
                        return (
                          <label key={skill.id}>
                            <input
                              aria-label={`${classSkillChoice.className} class skill ${skill.label}`}
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && classSkillProficiencies.length >= classSkillChoice.count}
                              onChange={(event) => toggleClassSkill(skill.id, event.target.checked)}
                            />
                            <span>{skill.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {templateId === "rogue" && (
                  <fieldset className="creator-skill-choices">
                    <legend>Rogue Expertise ({rogueExpertiseChoices.length}/2)</legend>
                    <p className="creator-note">Choose two current skill proficiencies.</p>
                    <div className="creator-skill-options">{rogueExpertiseOptions.map((skill) => { const checked = rogueExpertiseChoices.includes(skill.id); return <label key={skill.id}><input type="checkbox" checked={checked} disabled={!checked && rogueExpertiseChoices.length >= 2} onChange={(event) => setRogueExpertiseChoices((current) => event.target.checked ? [...current.filter((id) => id !== skill.id), skill.id].slice(0, 2) : current.filter((id) => id !== skill.id))} /><span>{skill.label}</span></label>; })}</div>
                  </fieldset>
                )}
                {backgroundMagicInitiate && (
                  <fieldset className="creator-skill-choices">
                    <legend>{backgroundMagicInitiate.name} from {background?.name}</legend>
                    <p className="creator-note">Choose two cantrips, one level 1 spell, and its casting ability. The level 1 spell gets one free cast per Long Rest.</p>
                    <div className="creator-skill-options">
                      {magicInitiateOptions(backgroundMagicInitiate, 0).map((spell) => { const checked = backgroundMagicInitiateCantrips.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && backgroundMagicInitiateCantrips.length >= 2} onChange={(event) => setBackgroundMagicInitiateCantrips((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, 2) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>; })}
                    </div>
                    <label><span>Level 1 spell</span><select value={backgroundMagicInitiateSpell} onChange={(event) => setBackgroundMagicInitiateSpell(event.target.value)}><option value="">Choose a spell</option>{magicInitiateOptions(backgroundMagicInitiate, 1).map((spell) => <option key={spell.id} value={spell.id}>{spell.name}</option>)}</select></label>
                    <label><span>Spellcasting ability</span><select value={backgroundMagicInitiateAbility} onChange={(event) => setBackgroundMagicInitiateAbility(event.target.value)}>{origins.spellcastingAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}</select></label>
                  </fieldset>
                )}
                {templateId === "fighter" && (
                  <label><span>Fighting Style</span><select value={fightingStyle} onChange={(event) => setFightingStyle(event.target.value)}>{origins.fightingStyles.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.summary}</option>)}</select></label>
                )}
                {templateId === "cleric" && (
                  <label><span>Divine Order</span><select value={divineOrder} onChange={(event) => { setDivineOrder(event.target.value); setClassCantripChoices([]); }}>{origins.divineOrders.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.summary}</option>)}</select></label>
                )}
                {templateId === "druid" && (
                  <label><span>Primal Order</span><select value={primalOrder} onChange={(event) => { setPrimalOrder(event.target.value); setClassCantripChoices([]); }}>{origins.primalOrders.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.summary}</option>)}</select></label>
                )}
                {templateId === "warlock" && (
                  <label><span>Eldritch Invocation</span><select value={eldritchInvocation} onChange={(event) => { setEldritchInvocation(event.target.value); setPactTomeCantripChoices([]); setPactTomeRitualChoices([]); }}>{origins.eldritchInvocations.map((option) => <option key={option.id} value={option.id}>{option.name} — {option.summary}</option>)}</select></label>
                )}
                {eldritchInvocation === "pact-of-the-tome" && templateId === "warlock" && (
                  <>
                    <fieldset className="creator-skill-choices"><legend>Pact Tome cantrips ({pactTomeCantripChoices.length}/3)</legend><div className="creator-skill-options">{pactTomeCantripOptions.map((spell) => { const checked = pactTomeCantripChoices.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && pactTomeCantripChoices.length >= 3} onChange={(event) => setPactTomeCantripChoices((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, 3) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>; })}</div></fieldset>
                    <fieldset className="creator-skill-choices"><legend>Pact Tome rituals ({pactTomeRitualChoices.length}/2)</legend><div className="creator-skill-options">{pactTomeRitualOptions.map((spell) => { const checked = pactTomeRitualChoices.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && pactTomeRitualChoices.length >= 2} onChange={(event) => setPactTomeRitualChoices((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, 2) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>; })}</div></fieldset>
                  </>
                )}
                {classSpellChoice && expectedClassCantripCount > 0 && (
                  <fieldset className="creator-skill-choices" aria-describedby={classSpellHelpId}>
                    <legend>{classSpellChoice.className} cantrips ({classCantripChoices.length}/{expectedClassCantripCount})</legend>
                    <p id={classSpellHelpId} className="creator-note">Choose from the published SRD class list.</p>
                    <div className="creator-skill-options">{classCantripOptions.map((spell) => { const checked = classCantripChoices.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && classCantripChoices.length >= expectedClassCantripCount} onChange={(event) => setClassCantripChoices((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, expectedClassCantripCount) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>; })}</div>
                  </fieldset>
                )}
                {classSpellChoice && classSpellChoice.spellbookSpellCount > 0 && (
                  <fieldset className="creator-skill-choices"><legend>Wizard spellbook ({wizardSpellbookChoices.length}/{classSpellChoice.spellbookSpellCount})</legend><p className="creator-note">These six spells are in the spellbook; preparation is selected separately below.</p><div className="creator-skill-options">{classLevelOneSpellOptions.map((spell) => { const checked = wizardSpellbookChoices.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && wizardSpellbookChoices.length >= classSpellChoice.spellbookSpellCount} onChange={(event) => { setWizardSpellbookChoices((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, classSpellChoice.spellbookSpellCount) : current.filter((id) => id !== spell.id)); if (!event.target.checked) setClassPreparedSpellChoices((current) => current.filter((id) => id !== spell.id)); }} /><span>{spell.name}</span></label>; })}</div></fieldset>
                )}
                {classSpellChoice && classSpellChoice.preparedSpellCount > 0 && (
                  <fieldset className="creator-skill-choices"><legend>{classSpellChoice.className} prepared spells ({classPreparedSpellChoices.length}/{classSpellChoice.preparedSpellCount})</legend>{classSpellChoice.alwaysPreparedSpellIds.length > 0 && <p className="creator-note">Always prepared automatically: {classSpellChoice.alwaysPreparedSpellIds.map(prettyOriginId).join(", ")}.</p>}<div className="creator-skill-options">{classLevelOneSpellOptions.filter((spell) => templateId !== "wizard" || wizardSpellbookChoices.includes(spell.id)).map((spell) => { const checked = classPreparedSpellChoices.includes(spell.id); return <label key={spell.id}><input type="checkbox" checked={checked} disabled={!checked && classPreparedSpellChoices.length >= classSpellChoice.preparedSpellCount} onChange={(event) => setClassPreparedSpellChoices((current) => event.target.checked ? [...current.filter((id) => id !== spell.id), spell.id].slice(0, classSpellChoice.preparedSpellCount) : current.filter((id) => id !== spell.id))} /><span>{spell.name}</span></label>; })}</div></fieldset>
                )}
                {classStartingEquipment && (
                  <fieldset className="creator-skill-choices" aria-describedby={classEquipmentHelpId}>
                    <legend>{classStartingEquipment.className} starting equipment</legend>
                    <p id={classEquipmentHelpId} className="creator-note">Choose one SRD package. Currency shown here combines with the background package.</p>
                    <div className="creator-skill-options">
                      {classStartingEquipment.packages.map((pkg) => (
                        <label key={pkg.id}>
                          <input
                            type="radio"
                            name="class-starting-equipment"
                            checked={pkg.id === classEquipmentPackageId}
                            onChange={() => { setClassEquipmentPackageChoice(pkg.id); setClassEquipmentChoiceValues({}); }}
                          />
                          <span>{pkg.label}</span>
                        </label>
                      ))}
                    </div>
                    {(classEquipmentPackage?.choices ?? []).filter((choice) => !choice.matchSelection).map((choice) => (
                      <label key={choice.id}>
                        <span>{choice.label}</span>
                        <select
                          aria-label={`Class equipment ${choice.label}`}
                          value={resolvedClassEquipmentChoices[choice.id] ?? ""}
                          onChange={(event) => setClassEquipmentChoiceValues((current) => ({ ...current, [choice.id]: event.target.value }))}
                        >
                          {choice.optionIds.map((optionId) => <option key={optionId} value={optionId}>{prettyOriginId(optionId)}</option>)}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                )}
                {classStartingEquipment && classStartingEquipment.toolProficiencyChoice.count > 0 && (
                  <fieldset className="creator-skill-choices" aria-describedby={classToolHelpId}>
                    <legend>{classStartingEquipment.className} tools ({classToolProficiencyChoices.length}/{classStartingEquipment.toolProficiencyChoice.count})</legend>
                    <p id={classToolHelpId} className="creator-note">These are proficiency choices. A linked Monk equipment package uses the same selected tool.</p>
                    <div className="creator-skill-options">
                      {classStartingEquipment.toolProficiencyChoice.optionIds.map((toolId) => {
                        const checked = classToolProficiencyChoices.includes(toolId);
                        return (
                          <label key={toolId}>
                            <input type="checkbox" checked={checked} disabled={!checked && classToolProficiencyChoices.length >= classStartingEquipment.toolProficiencyChoice.count} onChange={(event) => toggleClassTool(toolId, event.target.checked)} />
                            <span>{prettyOriginId(toolId)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {backgroundStartingEquipment && (
                  <fieldset className="creator-skill-choices" aria-describedby={backgroundEquipmentHelpId}>
                    <legend>{backgroundStartingEquipment.backgroundName} starting equipment</legend>
                    <p id={backgroundEquipmentHelpId} className="creator-note">Choose the listed equipment or its 50 GP alternative.</p>
                    <div className="creator-skill-options">
                      {backgroundStartingEquipment.packages.map((pkg) => (
                        <label key={pkg.id}>
                          <input
                            type="radio"
                            name="background-starting-equipment"
                            checked={pkg.id === backgroundEquipmentPackageId}
                            onChange={() => { setBackgroundEquipmentPackageChoice(pkg.id); setBackgroundEquipmentChoiceValues({}); }}
                          />
                          <span>{pkg.label}</span>
                        </label>
                      ))}
                    </div>
                    {(backgroundEquipmentPackage?.choices ?? []).filter((choice) => !choice.matchSelection).map((choice) => (
                      <label key={choice.id}>
                        <span>{choice.label}</span>
                        <select
                          aria-label={`Background equipment ${choice.label}`}
                          value={resolvedBackgroundEquipmentChoices[choice.id] ?? ""}
                          onChange={(event) => setBackgroundEquipmentChoiceValues((current) => ({ ...current, [choice.id]: event.target.value }))}
                        >
                          {choice.optionIds.map((optionId) => <option key={optionId} value={optionId}>{prettyOriginId(optionId)}</option>)}
                        </select>
                      </label>
                    ))}
                    {backgroundStartingEquipment.toolProficiencyChoice.count === 1 && (
                      <label>
                        <span>{backgroundStartingEquipment.backgroundName} tool proficiency</span>
                        <select aria-label="Background tool proficiency" value={resolvedBackgroundToolProficiencyChoice} onChange={(event) => setBackgroundToolProficiencyChoice(event.target.value)}>
                          <option value="">Choose a tool</option>
                          {backgroundStartingEquipment.toolProficiencyChoice.optionIds.map((toolId) => <option key={toolId} value={toolId}>{prettyOriginId(toolId)}</option>)}
                        </select>
                      </label>
                    )}
                  </fieldset>
                )}
                {classWeaponMasteryChoice && classWeaponMasteryChoice.count > 0 && (
                  <fieldset className="creator-skill-choices" aria-describedby={masteryHelpId}>
                    <legend>Weapon Mastery ({weaponMasteryChoices.length}/{classWeaponMasteryChoice.count})</legend>
                    <p id={masteryHelpId} className="creator-note">Choose proficient weapon kinds. You do not need to start with or equip the weapon; later Long Rest swaps remain manual.</p>
                    <div className="creator-skill-options">
                      {weaponMasteryOptions.map((weapon) => {
                        const checked = weaponMasteryChoices.includes(weapon.id);
                        return (
                          <label key={weapon.id}>
                            <input type="checkbox" checked={checked} disabled={!checked && weaponMasteryChoices.length >= classWeaponMasteryChoice.count} onChange={(event) => toggleWeaponMastery(weapon.id, event.target.checked)} />
                            <span>{weapon.name} <small>{prettyOriginId(weapon.mastery)}</small></span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                <div className="segmented-control" role="group" aria-label="Ability score spread">
                  <button className={spreadMode === "2-1" ? "active" : ""} type="button" onClick={() => setSpreadMode("2-1")}>+2 / +1</button>
                  <button className={spreadMode === "1-1-1" ? "active" : ""} type="button" onClick={() => setSpreadMode("1-1-1")}>+1 / +1 / +1</button>
                </div>
                {spreadMode === "2-1" ? (
                  <>
                    <label>
                      <span>+2 to</span>
                      <select aria-label="Plus two ability" value={plusTwo} onChange={(event) => setPlusTwoChoice(event.target.value)}>
                        {spreadAbilities.map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>+1 to</span>
                      <select aria-label="Plus one ability" value={plusOne} onChange={(event) => setPlusOneChoice(event.target.value)}>
                        {spreadAbilities.filter((ability) => ability !== plusTwo).map((ability) => <option key={ability} value={ability}>{prettyOriginId(ability)}</option>)}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="creator-note">+1 to {spreadAbilities.map(prettyOriginId).join(", ")}.</p>
                )}
              </div>
            </>
          )}
          {stepName === "Finish" && (
            <div className="creator-choices">
              <label>
                <span>Character name</span>
                <input aria-label="Character name" type="text" placeholder={template?.name ?? "Name"} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>Played by</span>
                <select aria-label="Character owner" value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}>
                  {props.members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName} · {member.role}</option>)}
                </select>
              </label>
              {origins && background && (
                <p className="creator-note">
                  {buildSummary}. {speciesId === "dragonborn" && selectedDraconicAncestor ? `${selectedDraconicAncestor.name} (${prettyOriginId(selectedDraconicAncestor.damageType)}) · ` : ""}{speciesId === "goliath" && selectedGiantAncestry ? `${selectedGiantAncestry.name} · ` : ""}{spreadMode === "2-1" ? `${prettyOriginId(plusTwo)} +2, ${prettyOriginId(plusOne)} +1` : `${spreadAbilities.map(prettyOriginId).join(" +1, ")} +1`} · Languages: Common, {originLanguageLabels.join(", ")}{classFeatureLanguageLabels.length > 0 ? `, ${classFeatureLanguageLabels.join(", ")}` : ""} · Class skills: {classSkillLabels.join(", ")} · {background.feat} · {selectedStartingGp} gp.
                </p>
              )}
              {origins && background && (classChoiceSummary.length > 0 || spellChoiceSummary.length > 0 || (speciesId === "human" && originFeat)) && (
                <div className="creator-note">
                  {speciesId === "human" && originFeat && <p>Human origin feat: {originFeat}{originFeat === "Skilled" && skilledProficiencyChoices.length > 0 ? ` (${skilledProficiencyChoices.map(prettyOriginId).join(", ")})` : ""}.</p>}
                  {classChoiceSummary.length > 0 && <p>Class choices: {classChoiceSummary.join("; ")}.</p>}
                  {spellChoiceSummary.length > 0 && <p>Spell choices: {spellChoiceSummary.join("; ")}.</p>}
                </div>
              )}
            </div>
          )}
          {visibleValidationIssues.length > 0 && (
            <div className="creator-validation" aria-live="polite">
              <strong>{stepName === "Finish" ? "Before creating" : "Complete this step"}</strong>
              <ul>{visibleValidationIssues.map((issue) => <li key={`${issue.step}:${issue.message}`}>{issue.message}</li>)}</ul>
            </div>
          )}
          {error && <p className="creator-error" role="alert">{error}</p>}
        </div>
        <footer className="creator-footer">
          <button className="ghost-button" type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            <ChevronLeft size={14} /> Back
          </button>
          {stepIndex < steps.length - 1 ? (
            <button className="ghost-button" type="button" disabled={nextDisabled} onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}>
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button className="ghost-button wide" type="button" disabled={!template || creating || validationIssues.length > 0} onClick={() => void submit()}>
              <UserPlus size={15} /> {creating ? "Creating…" : "Create character"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
