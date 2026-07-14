import { describe, expect, it } from "vitest";
import {
  validateCharacterCreatorInput,
  type CharacterCreateInput,
  type CharacterOriginsInfo
} from "./character-creator-dialog.js";
import type { CharacterTemplateInfo } from "./api.js";

const template: CharacterTemplateInfo = {
  id: "fighter",
  systemId: "dnd-5e-srd",
  name: "Fighter",
  summary: "Supported fighter path",
  actorType: "character",
  items: []
};

const origins: CharacterOriginsInfo = {
  backgrounds: [{ id: "soldier", name: "Soldier", abilityScores: ["strength", "dexterity", "constitution"], feat: "Savage Attacker", skillProficiencies: ["athletics", "intimidation"], toolProficiencies: ["gaming-set"], startingGp: 50 }],
  species: [
    { id: "human", name: "Human", size: "Medium or Small", speed: 30, traits: ["Resourceful", "Skillful", "Versatile"] },
    { id: "elf", name: "Elf", size: "Medium", speed: 30, traits: ["Elven Lineage"] },
    { id: "dragonborn", name: "Dragonborn", size: "Medium", speed: 30, traits: ["Draconic Ancestry", "Breath Weapon", "Damage Resistance"] },
    { id: "goliath", name: "Goliath", size: "Medium", speed: 35, traits: ["Giant Ancestry", "Powerful Build"] },
    { id: "orc", name: "Orc", size: "Medium", speed: 30, traits: ["Adrenaline Rush"] }
  ],
  draconicAncestors: [
    { id: "black", name: "Black Dragon", damageType: "acid" },
    { id: "blue", name: "Blue Dragon", damageType: "lightning" }
  ],
  giantAncestries: [
    { id: "cloud", name: "Cloud's Jaunt", giantType: "Cloud Giant", activation: "bonus-action", summary: "Teleport up to 30 feet.", teleportRangeFt: 30 },
    { id: "frost", name: "Frost's Chill", giantType: "Frost Giant", activation: "on-hit", summary: "Deal extra Cold damage and slow the target.", damageFormula: "1d6", damageType: "cold", speedReductionFt: 10 }
  ],
  classSkillChoices: [{ templateId: "fighter", className: "Fighter", count: 2, skillIds: ["acrobatics", "athletics", "history", "perception"] }],
  languages: [
    { id: "common", label: "Common", category: "standard" },
    { id: "common-sign-language", label: "Common Sign Language", category: "standard" },
    { id: "draconic", label: "Draconic", category: "standard" },
    { id: "elvish", label: "Elvish", category: "standard" },
    { id: "abyssal", label: "Abyssal", category: "rare" },
    { id: "druidic", label: "Druidic", category: "rare" },
    { id: "thieves-cant", label: "Thieves' Cant", category: "rare" },
    { id: "undercommon", label: "Undercommon", category: "rare" }
  ],
  originLanguageChoice: { count: 2, fixedLanguageIds: ["common"], languageIds: ["common-sign-language", "draconic", "elvish"] },
  classLanguageChoices: [{ templateId: "fighter", className: "Fighter", count: 0, fixedLanguageIds: [], languageIds: [] }],
  classStartingEquipment: [{
    templateId: "fighter",
    className: "Fighter",
    packages: [{ id: "equipment-a", label: "Fighter equipment", gp: 4, grants: [{ entryId: "greatsword" }], choices: [] }],
    toolProficiencyChoice: { count: 0, optionIds: [] },
    fixedToolProficiencyIds: [],
    sourcePage: 47,
    sourcePdfPage: 46
  }],
  backgroundStartingEquipment: [{
    backgroundId: "soldier",
    backgroundName: "Soldier",
    packages: [{ id: "equipment-a", label: "Soldier equipment", gp: 14, grants: [{ entryId: "spear" }], choices: [{ id: "chosen-gaming-set", label: "Chosen Gaming Set", count: 1, optionIds: ["dice-set"], matchSelection: "background-tool-proficiency" }] }],
    toolProficiencyChoice: { count: 1, optionIds: ["dice-set"] },
    sourcePage: 83,
    sourcePdfPage: 82
  }],
  weaponMasteryOptions: [
    { id: "greatsword", name: "Greatsword", weaponCategory: "martial", weaponKind: "melee", properties: ["heavy", "two-handed"], mastery: "graze" },
    { id: "longbow", name: "Longbow", weaponCategory: "martial", weaponKind: "ranged", properties: ["ammunition", "heavy", "two-handed"], mastery: "slow" },
    { id: "flail", name: "Flail", weaponCategory: "martial", weaponKind: "melee", properties: [], mastery: "sap" },
    { id: "shortbow", name: "Shortbow", weaponCategory: "simple", weaponKind: "ranged", properties: ["ammunition", "two-handed"], mastery: "vex" },
    { id: "shortsword", name: "Shortsword", weaponCategory: "martial", weaponKind: "melee", properties: ["finesse", "light"], mastery: "vex" }
  ],
  classWeaponMasteryChoices: [{ templateId: "fighter", className: "Fighter", count: 3, weaponIds: ["greatsword", "longbow", "flail"], sourcePage: 48, sourcePdfPage: 47 }],
  spellOptions: [
    { id: "druidcraft", name: "Druidcraft", level: 0, classes: ["druid"], ritual: false },
    { id: "guidance", name: "Guidance", level: 0, classes: ["cleric", "druid"], ritual: false },
    { id: "shillelagh", name: "Shillelagh", level: 0, classes: ["druid"], ritual: false },
    { id: "fire-bolt", name: "Fire Bolt", level: 0, classes: ["sorcerer", "wizard"], ritual: false },
    { id: "goodberry", name: "Goodberry", level: 1, classes: ["druid", "ranger"], ritual: false },
    { id: "shield", name: "Shield", level: 1, classes: ["sorcerer", "wizard"], ritual: false }
  ],
  classSpellChoices: [{
    templateId: "fighter",
    className: "Fighter",
    cantripCount: 0,
    preparedSpellCount: 0,
    spellbookSpellCount: 0,
    cantripIds: [],
    levelOneSpellIds: [],
    alwaysPreparedSpellIds: [],
    slotPool: "none",
    slotCount: 0,
    slotRecovery: "none",
    changeTiming: "none",
    sourcePage: 46,
    sourcePdfPage: 45
  }],
  levelOneClassFeatureChoices: [{ templateId: "fighter", field: "fightingStyle", count: 1, optionIds: ["archery", "defense", "great-weapon-fighting", "two-weapon-fighting"], sourcePage: 47, sourcePdfPage: 46 }],
  fightingStyles: [{ id: "defense", name: "Defense", summary: "+1 AC while armored." }],
  divineOrders: [],
  primalOrders: [],
  eldritchInvocations: [],
  originFeatOptions: [
    { id: "Alert", name: "Alert" },
    { id: "Magic Initiate (Cleric)", name: "Magic Initiate (Cleric)", magicInitiateClass: "cleric", cantripCount: 2, levelOneSpellCount: 1 },
    { id: "Magic Initiate (Druid)", name: "Magic Initiate (Druid)", magicInitiateClass: "druid", cantripCount: 2, levelOneSpellCount: 1 },
    { id: "Magic Initiate (Wizard)", name: "Magic Initiate (Wizard)", magicInitiateClass: "wizard", cantripCount: 2, levelOneSpellCount: 1 },
    { id: "Savage Attacker", name: "Savage Attacker" },
    { id: "Skilled", name: "Skilled", skilledProficiencyCount: 3 }
  ],
  skilledProficiencyOptions: [
    { id: "arcana", label: "Arcana", category: "skill" },
    { id: "medicine", label: "Medicine", category: "skill" },
    { id: "herbalism-kit", label: "Herbalism Kit", category: "tool" }
  ],
  elfLineages: [{ id: "high-elf", name: "High Elf", cantrip: "prestidigitation", level3Spell: "detect-magic", level5Spell: "misty-step" }],
  gnomeLineages: [],
  tieflingLegacies: [],
  highElfCantrips: ["fire-bolt", "prestidigitation"],
  skills: [
    { id: "acrobatics", label: "Acrobatics", ability: "dexterity" },
    { id: "arcana", label: "Arcana", ability: "intelligence" },
    { id: "athletics", label: "Athletics", ability: "strength" },
    { id: "history", label: "History", ability: "intelligence" },
    { id: "perception", label: "Perception", ability: "wisdom" }
  ],
  originFeats: ["Alert", "Magic Initiate (Cleric)", "Magic Initiate (Druid)", "Magic Initiate (Wizard)", "Savage Attacker", "Skilled"],
  spellcastingAbilities: ["intelligence", "wisdom", "charisma"]
};

function humanInput(overrides: Partial<CharacterCreateInput> = {}): CharacterCreateInput {
  return {
    creationMode: "level-one-srd",
    name: "Guided Fighter",
    ownerUserId: "usr_demo_player",
    backgroundId: "soldier",
    speciesId: "human",
    abilityScoreIncreases: { strength: 2, dexterity: 1 },
    classSkillProficiencies: ["acrobatics", "history"],
    originLanguageChoices: ["common-sign-language", "draconic"],
    classLanguageChoices: [],
    skillProficiency: "perception",
    originFeat: "Skilled",
    classEquipmentPackageId: "equipment-a",
    backgroundEquipmentPackageId: "equipment-a",
    classToolProficiencyChoices: [],
    backgroundToolProficiencyChoice: "dice-set",
    weaponMasteryChoices: ["greatsword", "longbow", "flail"],
    skilledProficiencyChoices: ["arcana", "medicine", "herbalism-kit"],
    fightingStyle: "defense",
    ...overrides
  };
}

describe("character creator client validation", () => {
  it("allows the complete guided path", () => {
    expect(validateCharacterCreatorInput({ template, origins, value: humanInput() })).toEqual([]);
  });

  it("explains why origin and finish actions are disabled", () => {
    const issues = validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({ name: "", skillProficiency: "", originFeat: "Savage Attacker" })
    });
    expect(issues).toEqual(expect.arrayContaining([
      { step: "Origin", message: "Choose the Human Skillful proficiency." },
      { step: "Origin", message: "Choose a feat other than Savage Attacker, which Soldier already grants." },
      { step: "Finish", message: "Enter a character name." }
    ]));
  });

  it("requires lineage, cantrip, and spellcasting choices on the Elf path", () => {
    const issues = validateCharacterCreatorInput({
      template,
      origins,
      value: {
        name: "Elf Fighter",
        ownerUserId: "usr_demo_player",
        backgroundId: "soldier",
        speciesId: "elf",
        abilityScoreIncreases: { strength: 2, dexterity: 1 },
        classSkillProficiencies: ["acrobatics", "history"],
        originLanguageChoices: ["common-sign-language", "draconic"],
        classLanguageChoices: []
      }
    });
    expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "Choose the Elf spellcasting ability.",
      "Choose an Elven Lineage."
    ]));
  });

  it("requires supported Dragonborn and Goliath ancestry choices and rejects cross-species fields", () => {
    const speciesInput = (speciesId: string, overrides: Partial<CharacterCreateInput> = {}): CharacterCreateInput => ({
      creationMode: "level-one-srd",
      name: "Species Fighter",
      ownerUserId: "usr_demo_player",
      backgroundId: "soldier",
      speciesId,
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "history"],
      originLanguageChoices: ["common-sign-language", "draconic"],
      classLanguageChoices: [],
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      classToolProficiencyChoices: [],
      backgroundToolProficiencyChoice: "dice-set",
      weaponMasteryChoices: ["greatsword", "longbow", "flail"],
      fightingStyle: "defense",
      ...overrides
    });

    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("dragonborn", { draconicAncestry: "black" }) })).toEqual([]);
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("goliath", { giantAncestry: "frost" }) })).toEqual([]);
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("dragonborn") }))
      .toContainEqual({ step: "Origin", message: "Choose a supported Draconic Ancestry." });
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("dragonborn", { draconicAncestry: "purple" }) }))
      .toContainEqual({ step: "Origin", message: "Choose a supported Draconic Ancestry." });
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("goliath") }))
      .toContainEqual({ step: "Origin", message: "Choose a supported Giant Ancestry benefit." });
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("goliath", { giantAncestry: "ocean" }) }))
      .toContainEqual({ step: "Origin", message: "Choose a supported Giant Ancestry benefit." });
    expect(validateCharacterCreatorInput({ template, origins, value: speciesInput("orc", { draconicAncestry: "black", giantAncestry: "frost" }) }))
      .toEqual(expect.arrayContaining([
        { step: "Origin", message: "Draconic Ancestry is only available to Dragonborn characters." },
        { step: "Origin", message: "Giant Ancestry is only available to Goliath characters." }
      ]));
  });

  it("enforces the class count, class list, and background duplicate rules", () => {
    expect(validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({ classSkillProficiencies: ["acrobatics"] })
    })).toContainEqual({ step: "Background", message: "Choose exactly 2 Fighter class skills." });

    const forged = validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({ classSkillProficiencies: ["arcana", "athletics"] })
    });
    expect(forged).toEqual(expect.arrayContaining([
      { step: "Background", message: "Choose skills from the Fighter class list." },
      { step: "Background", message: "Choose class skills not already granted by Soldier." }
    ]));
  });

  it("requires exact packages, tool selections, and eligible unique Weapon Mastery choices", () => {
    expect(validateCharacterCreatorInput({ template, origins, value: humanInput({ classEquipmentPackageId: "forged" }) }))
      .toContainEqual({ step: "Background", message: "Choose a Fighter starting-equipment package." });
    expect(validateCharacterCreatorInput({ template, origins, value: humanInput({ backgroundToolProficiencyChoice: "forged-set" }) }))
      .toContainEqual({ step: "Background", message: "Choose the Soldier tool proficiency." });
    expect(validateCharacterCreatorInput({ template, origins, value: humanInput({ weaponMasteryChoices: ["greatsword", "greatsword", "flail"] }) }))
      .toContainEqual({ step: "Background", message: "Weapon Mastery choices cannot repeat a weapon kind." });
    expect(validateCharacterCreatorInput({ template, origins, value: humanInput({ weaponMasteryChoices: ["greatsword", "longbow", "dagger"] }) }))
      .toContainEqual({ step: "Background", message: "Choose weapons eligible for Fighter Weapon Mastery." });
  });

  it("validates Human Magic Initiate subchoices and rejects hidden feat fields", () => {
    const validMagicInitiate = humanInput({
      originFeat: "Magic Initiate (Druid)",
      skilledProficiencyChoices: undefined,
      originFeatMagicInitiateCantrips: ["druidcraft", "guidance"],
      originFeatMagicInitiateSpell: "goodberry",
      originFeatMagicInitiateAbility: "wisdom"
    });
    expect(validateCharacterCreatorInput({ template, origins, value: validMagicInitiate })).toEqual([]);
    expect(validateCharacterCreatorInput({
      template,
      origins,
      value: { ...validMagicInitiate, originFeatMagicInitiateCantrips: ["druidcraft", "fire-bolt"], originFeatMagicInitiateSpell: "shield" }
    })).toEqual(expect.arrayContaining([
      { step: "Origin", message: "Choose exactly two Human Magic Initiate cantrips from the druid list." },
      { step: "Origin", message: "Choose one Human Magic Initiate level 1 spell from the druid list." }
    ]));
    expect(validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({ originFeat: "Alert", skilledProficiencyChoices: ["arcana", "medicine", "herbalism-kit"], originFeatMagicInitiateCantrips: ["druidcraft", "guidance"] })
    })).toEqual(expect.arrayContaining([
      { step: "Origin", message: "Human Magic Initiate choices are not available for the selected feat." },
      { step: "Origin", message: "Skilled proficiency choices require the Human Skilled origin feat." }
    ]));
  });

  it("requires two unique Standard origin languages and rejects unavailable class language choices", () => {
    expect(validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({ originLanguageChoices: ["draconic"] })
    })).toContainEqual({ step: "Origin", message: "Choose exactly 2 origin languages." });

    const forged = validateCharacterCreatorInput({
      template,
      origins,
      value: humanInput({
        originLanguageChoices: ["abyssal", "abyssal"],
        classLanguageChoices: ["elvish"]
      })
    });
    expect(forged).toEqual(expect.arrayContaining([
      { step: "Origin", message: "Origin language choices cannot repeat a language." },
      { step: "Origin", message: "Choose origin languages from the Standard Languages list." },
      { step: "Origin", message: "Fighter has no selectable level-one class language." }
    ]));
  });

  it("accepts the Rogue class-feature language separately and rejects a language already known from the origin", () => {
    const rogueTemplate = { ...template, id: "rogue", name: "Rogue" };
    const rogueOrigins: CharacterOriginsInfo = {
      ...origins,
      classSkillChoices: [{ templateId: "rogue", className: "Rogue", count: 4, skillIds: ["acrobatics", "arcana", "history", "perception"] }],
      classLanguageChoices: [{
        templateId: "rogue",
        className: "Rogue",
        count: 1,
        fixedLanguageIds: ["thieves-cant"],
        languageIds: ["common", "draconic", "elvish", "abyssal", "druidic", "undercommon"]
      }],
      classStartingEquipment: [{
        templateId: "rogue",
        className: "Rogue",
        packages: [{ id: "equipment-a", label: "Rogue equipment", gp: 8, grants: [{ entryId: "shortbow" }], choices: [] }],
        toolProficiencyChoice: { count: 0, optionIds: [] },
        fixedToolProficiencyIds: ["thieves-tools"],
        sourcePage: 61,
        sourcePdfPage: 60
      }],
      classWeaponMasteryChoices: [{ templateId: "rogue", className: "Rogue", count: 2, weaponIds: ["shortbow", "shortsword"], sourcePage: 62, sourcePdfPage: 61 }]
      ,classSpellChoices: [{ templateId: "rogue", className: "Rogue", cantripCount: 0, preparedSpellCount: 0, spellbookSpellCount: 0, cantripIds: [], levelOneSpellIds: [], alwaysPreparedSpellIds: [], slotPool: "none", slotCount: 0, slotRecovery: "none", changeTiming: "none", sourcePage: 60, sourcePdfPage: 59 }]
      ,levelOneClassFeatureChoices: [{ templateId: "rogue", field: "rogueExpertiseChoices", count: 2, optionIds: [], sourcePage: 61, sourcePdfPage: 60 }]
    };
    const rogueInput: CharacterCreateInput = {
      creationMode: "level-one-srd",
      name: "Guided Rogue",
      ownerUserId: "usr_demo_player",
      backgroundId: "soldier",
      speciesId: "elf",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "arcana", "history", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: ["undercommon"],
      elfLineage: "high-elf",
      elfCantrip: "fire-bolt",
      speciesSpellcastingAbility: "intelligence",
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      classToolProficiencyChoices: [],
      backgroundToolProficiencyChoice: "dice-set",
      weaponMasteryChoices: ["shortbow", "shortsword"],
      rogueExpertiseChoices: ["acrobatics", "arcana"]
    };
    expect(validateCharacterCreatorInput({ template: rogueTemplate, origins: rogueOrigins, value: rogueInput })).toEqual([]);
    expect(validateCharacterCreatorInput({
      template: rogueTemplate,
      origins: rogueOrigins,
      value: { ...rogueInput, classLanguageChoices: ["elvish"] }
    })).toContainEqual({ step: "Origin", message: "Choose a class language the character does not already know." });
  });

  it("does not silently fall back to template defaults when the D&D origin catalog is unavailable", () => {
    expect(validateCharacterCreatorInput({ template, value: humanInput() })).toContainEqual({
      step: "Finish",
      message: "D&D origin choices could not be loaded. Close the creator and try again."
    });
  });
});
