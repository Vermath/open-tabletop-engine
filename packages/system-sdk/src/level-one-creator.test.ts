import { describe, expect, it } from "vitest";
import {
  dnd5eSrdApplyCharacterOrigins,
  dnd5eSrdCharacterOrigins,
  dnd5eSrdCharacterTemplate,
  dnd5eSrdCharacterTemplates,
  dnd5eSrdQuickRolls,
  dnd5eSrdValidateLevelOneCharacterCreation,
  resolveDnd5eSrdAction
} from "./index.js";
import type { Dnd5eSrdCharacterOriginOptions } from "./index.js";

function actorWithData(data: Record<string, unknown>): Parameters<typeof dnd5eSrdQuickRolls>[0] {
  return {
    id: "act_level_one_species",
    campaignId: "cmp_level_one_species",
    systemId: "dnd5e-srd",
    type: "character",
    name: "Level One Species",
    data,
    permissions: {},
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z"
  };
}

function strictEquipment(templateId: string, backgroundId: string): Partial<Dnd5eSrdCharacterOriginOptions> {
  const masteryByClass: Record<string, string[]> = {
    barbarian: ["greataxe", "handaxe"],
    fighter: ["greatsword", "flail", "longbow"],
    paladin: ["longsword", "javelin"],
    ranger: ["longbow", "scimitar"],
    rogue: ["shortbow", "shortsword"]
  };
  const selections: Partial<Dnd5eSrdCharacterOriginOptions> = {
    classEquipmentPackageId: "equipment-a",
    backgroundEquipmentPackageId: "equipment-a",
    weaponMasteryChoices: masteryByClass[templateId] ?? []
  };
  const classSpells: Record<string, Partial<Dnd5eSrdCharacterOriginOptions>> = {
    bard: { classCantripChoices: ["light", "mage-hand"], classPreparedSpellChoices: ["cure-wounds", "healing-word", "heroism", "thunderwave"] },
    cleric: { divineOrder: "protector", classCantripChoices: ["guidance", "sacred-flame", "spare-the-dying"], classPreparedSpellChoices: ["bless", "command", "cure-wounds", "healing-word"] },
    druid: { primalOrder: "warden", classCantripChoices: ["guidance", "produce-flame"], classPreparedSpellChoices: ["cure-wounds", "entangle", "faerie-fire", "goodberry"] },
    fighter: { fightingStyle: "defense" },
    paladin: { classPreparedSpellChoices: ["bless", "cure-wounds"] },
    ranger: { classPreparedSpellChoices: ["alarm", "goodberry"] },
    rogue: { rogueExpertiseChoices: ["acrobatics", "deception"] },
    sorcerer: { classCantripChoices: ["acid-splash", "light", "message", "poison-spray"], classPreparedSpellChoices: ["shield", "sleep"] },
    warlock: { eldritchInvocation: "eldritch-mind", classCantripChoices: ["eldritch-blast", "prestidigitation"], classPreparedSpellChoices: ["hellish-rebuke", "hex"] },
    wizard: { classCantripChoices: ["fire-bolt", "light", "mage-hand"], wizardSpellbookChoices: ["alarm", "burning-hands", "charm-person", "detect-magic", "magic-missile", "shield"], classPreparedSpellChoices: ["burning-hands", "detect-magic", "magic-missile", "shield"] }
  };
  Object.assign(selections, classSpells[templateId] ?? {});
  if (backgroundId === "sage") Object.assign(selections, { backgroundMagicInitiateCantrips: ["ray-of-frost", "shocking-grasp"], backgroundMagicInitiateSpell: "chromatic-orb", backgroundMagicInitiateAbility: "intelligence" });
  if (backgroundId === "acolyte") Object.assign(selections, { backgroundMagicInitiateCantrips: ["light", "thaumaturgy"], backgroundMagicInitiateSpell: "sanctuary", backgroundMagicInitiateAbility: "wisdom" });
  if (templateId === "bard") {
    selections.classEquipmentChoices = { instrument: "flute" };
    selections.classToolProficiencyChoices = ["flute", "lute", "drum"];
  }
  if (["cleric", "paladin"].includes(templateId)) selections.classEquipmentChoices = { "holy-symbol": "holy-symbol-amulet" };
  if (templateId === "monk") selections.classToolProficiencyChoices = ["smiths-tools"];
  if (backgroundId === "acolyte") selections.backgroundEquipmentChoices = { "holy-symbol": "holy-symbol-emblem" };
  if (backgroundId === "soldier") selections.backgroundToolProficiencyChoice = "dice-set";
  return selections;
}

describe("D&D SRD guided level-one creator validation", () => {
  it("accepts complete supported Human and Elf paths", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...strictEquipment("fighter", "soldier"),
      backgroundId: "soldier",
      speciesId: "human",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "history"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: [],
      skillProficiency: "perception",
      originFeat: "Skilled",
      skilledProficiencyChoices: ["arcana", "stealth", "herbalism-kit"]
    })).toEqual({ ok: true, issues: [] });

    const wizard = dnd5eSrdCharacterTemplate("wizard")!;
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, {
      ...strictEquipment("wizard", "sage"),
      backgroundId: "sage",
      speciesId: "elf",
      abilityScoreIncreases: { constitution: 1, intelligence: 1, wisdom: 1 },
      classSkillProficiencies: ["insight", "investigation"],
      originLanguageChoices: ["common-sign-language", "dwarvish"],
      classLanguageChoices: [],
      elfLineage: "high-elf",
      elfCantrip: "fire-bolt",
      speciesSpellcastingAbility: "intelligence"
    })).toEqual({ ok: true, issues: [] });
  });

  it("reports every missing choice instead of applying template defaults", () => {
    const validation = dnd5eSrdValidateLevelOneCharacterCreation(dnd5eSrdCharacterTemplate("fighter")!, {});
    expect(validation.ok).toBe(false);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "backgroundId", code: "required" }),
      expect.objectContaining({ field: "speciesId", code: "required" }),
      expect.objectContaining({ field: "abilityScoreIncreases", code: "required" }),
      expect.objectContaining({ field: "classSkillProficiencies", code: "required" }),
      expect.objectContaining({ field: "originLanguageChoices", code: "required" })
    ]));
  });

  it("rejects duplicate Human grants and inconsistent species choices", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const duplicateHumanChoices = dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...strictEquipment("fighter", "soldier"),
      backgroundId: "soldier",
      speciesId: "human",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "history"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: [],
      skillProficiency: "athletics",
      originFeat: "Savage Attacker"
    });
    expect(duplicateHumanChoices.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "skillProficiency", code: "duplicate_background_skill" }),
      expect.objectContaining({ field: "originFeat", code: "duplicate_background_feat" })
    ]));

    const forgedOrc = dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...strictEquipment("fighter", "criminal"),
      backgroundId: "criminal",
      speciesId: "orc",
      abilityScoreIncreases: { dexterity: 2, constitution: 1 },
      classSkillProficiencies: ["athletics", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: [],
      elfLineage: "drow"
    });
    expect(forgedOrc.issues).toContainEqual(expect.objectContaining({ code: "inconsistent_choices" }));
  });

  it("publishes and enforces SRD class skill metadata for every exposed class template", () => {
    const origins = dnd5eSrdCharacterOrigins();
    const templates = dnd5eSrdCharacterTemplates();
    expect(origins.classSkillChoices.map((choice) => choice.templateId).sort()).toEqual(templates.map((template) => template.id).sort());
    expect(Object.fromEntries(origins.classSkillChoices.map((choice) => [choice.templateId, { count: choice.count, skillIds: choice.skillIds }]))).toEqual({
      barbarian: { count: 2, skillIds: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"] },
      bard: { count: 3, skillIds: ["acrobatics", "animal-handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival"] },
      cleric: { count: 2, skillIds: ["history", "insight", "medicine", "persuasion", "religion"] },
      druid: { count: 2, skillIds: ["animal-handling", "arcana", "insight", "medicine", "nature", "perception", "religion", "survival"] },
      fighter: { count: 2, skillIds: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "persuasion", "perception", "survival"] },
      monk: { count: 2, skillIds: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"] },
      paladin: { count: 2, skillIds: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"] },
      ranger: { count: 3, skillIds: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"] },
      rogue: { count: 4, skillIds: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleight-of-hand", "stealth"] },
      sorcerer: { count: 2, skillIds: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"] },
      warlock: { count: 2, skillIds: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"] },
      wizard: { count: 2, skillIds: ["arcana", "history", "insight", "investigation", "medicine", "nature", "religion"] }
    });

    for (const template of templates) {
      const choice = origins.classSkillChoices.find((item) => item.templateId === template.id)!;
      const selected = choice.skillIds.filter((skill) => !["athletics", "intimidation"].includes(skill)).slice(0, choice.count);
      expect(dnd5eSrdValidateLevelOneCharacterCreation(template, {
        ...strictEquipment(template.id, "soldier"),
        backgroundId: "soldier",
        speciesId: "orc",
        abilityScoreIncreases: { strength: 2, dexterity: 1 },
        classSkillProficiencies: selected,
        originLanguageChoices: ["draconic", "elvish"],
        classLanguageChoices: template.id === "rogue" ? ["abyssal"] : []
      }), template.id).toEqual({ ok: true, issues: [] });
    }
  });

  it("publishes strict language metadata and rejects forged origin and class language choices", () => {
    const origins = dnd5eSrdCharacterOrigins();
    expect(origins.originLanguageChoice).toEqual(expect.objectContaining({
      count: 2,
      fixedLanguageIds: ["common"],
      languageIds: ["common-sign-language", "draconic", "dwarvish", "elvish", "giant", "gnomish", "goblin", "halfling", "orc"]
    }));
    expect(origins.languages.filter((language) => language.category === "rare").map((language) => language.id)).toEqual([
      "abyssal", "celestial", "deep-speech", "druidic", "infernal", "primordial", "sylvan", "thieves-cant", "undercommon"
    ]);
    expect(origins.classLanguageChoices.map((choice) => choice.templateId).sort()).toEqual(dnd5eSrdCharacterTemplates().map((template) => template.id).sort());
    expect(origins.classLanguageChoices.find((choice) => choice.templateId === "druid")).toEqual(expect.objectContaining({
      count: 0,
      fixedLanguageIds: ["druidic"],
      languageIds: []
    }));
    expect(origins.classLanguageChoices.find((choice) => choice.templateId === "rogue")).toEqual(expect.objectContaining({
      count: 1,
      fixedLanguageIds: ["thieves-cant"],
      languageIds: expect.arrayContaining(["common", "draconic", "druidic", "undercommon"])
    }));

    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const base = {
      ...strictEquipment("fighter", "soldier"),
      backgroundId: "soldier",
      speciesId: "orc",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "perception"],
      classLanguageChoices: []
    };
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...base,
      originLanguageChoices: ["draconic", "draconic"]
    }).issues).toContainEqual(expect.objectContaining({ field: "originLanguageChoices", code: "duplicate_language" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...base,
      originLanguageChoices: ["abyssal", "elvish"]
    }).issues).toContainEqual(expect.objectContaining({ field: "originLanguageChoices", code: "outside_standard_list" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, {
      ...base,
      originLanguageChoices: { first: "draconic", second: "elvish" } as unknown as string[]
    }).issues).toContainEqual(expect.objectContaining({ field: "originLanguageChoices", code: "invalid_type" }));

    const rogue = dnd5eSrdCharacterTemplate("rogue")!;
    const rogueBase = {
      ...strictEquipment("rogue", "soldier"),
      backgroundId: "soldier",
      speciesId: "orc",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "deception", "investigation", "stealth"],
      originLanguageChoices: ["draconic", "elvish"]
    };
    expect(dnd5eSrdValidateLevelOneCharacterCreation(rogue, {
      ...rogueBase,
      classLanguageChoices: ["elvish"]
    }).issues).toContainEqual(expect.objectContaining({ field: "classLanguageChoices", code: "duplicate_known_language" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(rogue, {
      ...rogueBase,
      classLanguageChoices: { language: "abyssal" } as unknown as string[]
    }).issues).toContainEqual(expect.objectContaining({ field: "classLanguageChoices", code: "invalid_type" }));
  });

  it("publishes exact SRD Dragonborn and Goliath ancestry choices", () => {
    const origins = dnd5eSrdCharacterOrigins();
    expect(origins.draconicAncestors.map(({ id, damageType }) => ({ id, damageType }))).toEqual([
      { id: "black", damageType: "acid" },
      { id: "blue", damageType: "lightning" },
      { id: "brass", damageType: "fire" },
      { id: "bronze", damageType: "lightning" },
      { id: "copper", damageType: "acid" },
      { id: "gold", damageType: "fire" },
      { id: "green", damageType: "poison" },
      { id: "red", damageType: "fire" },
      { id: "silver", damageType: "cold" },
      { id: "white", damageType: "cold" }
    ]);
    expect(origins.giantAncestries).toEqual([
      expect.objectContaining({ id: "cloud", name: "Cloud's Jaunt", giantType: "Cloud Giant", activation: "bonus-action", teleportRangeFt: 30 }),
      expect.objectContaining({ id: "fire", name: "Fire's Burn", giantType: "Fire Giant", activation: "on-hit", damageFormula: "1d10", damageType: "fire" }),
      expect.objectContaining({ id: "frost", name: "Frost's Chill", giantType: "Frost Giant", activation: "on-hit", damageFormula: "1d6", damageType: "cold", speedReductionFt: 10 }),
      expect.objectContaining({ id: "hill", name: "Hill's Tumble", giantType: "Hill Giant", activation: "on-hit", condition: "Prone", targetMaxSize: "Large" }),
      expect.objectContaining({ id: "stone", name: "Stone's Endurance", giantType: "Stone Giant", activation: "reaction", damageReductionFormula: "1d12", damageReductionAbility: "constitution" }),
      expect.objectContaining({ id: "storm", name: "Storm's Thunder", giantType: "Storm Giant", activation: "reaction", damageFormula: "1d8", damageType: "thunder", triggerRangeFt: 60 })
    ]);
  });

  it("requires, validates, persists, and safely exposes selected Dragonborn and Goliath ancestries", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const base = {
      ...strictEquipment("fighter", "soldier"),
      backgroundId: "soldier",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: []
    };

    const dragonbornOptions = { ...base, speciesId: "dragonborn", draconicAncestry: "black" };
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, dragonbornOptions)).toEqual({ ok: true, issues: [] });
    const dragonborn = dnd5eSrdApplyCharacterOrigins(fighter, dragonbornOptions);
    expect(dragonborn.data.origin).toEqual(expect.objectContaining({
      draconicAncestry: "black",
      draconicAncestryName: "Black Dragon",
      draconicAncestryDamageType: "acid"
    }));
    expect(dragonborn.data.resistances).toEqual(["acid"]);
    const breathWeapon = dnd5eSrdQuickRolls(actorWithData(dragonborn.data)).find((roll) => roll.id === "species-dragonborn-breath-weapon");
    expect(breathWeapon).toEqual(expect.objectContaining({
      formula: "1d10",
      metadata: expect.objectContaining({ damageType: "acid", resource: "breathWeapon", uses: 2, recovery: "long" })
    }));

    const goliathOptions = { ...base, speciesId: "goliath", giantAncestry: "frost" };
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, goliathOptions)).toEqual({ ok: true, issues: [] });
    const goliath = dnd5eSrdApplyCharacterOrigins(fighter, goliathOptions);
    expect(goliath.data.origin).toEqual(expect.objectContaining({
      giantAncestry: "frost",
      giantAncestryBenefit: "Frost's Chill",
      giantAncestryType: "Frost Giant"
    }));
    const giantAncestry = dnd5eSrdQuickRolls(actorWithData(goliath.data)).find((roll) => roll.id === "species-goliath-giant-ancestry");
    expect(giantAncestry).toEqual(expect.objectContaining({
      formula: "1d6",
      metadata: expect.objectContaining({
        ancestryId: "frost",
        ancestryName: "Frost's Chill",
        requiresManualResolution: true,
        selectedBenefit: expect.objectContaining({ damageType: "cold", speedReductionFt: 10 })
      })
    }));
    expect((giantAncestry?.metadata as Record<string, unknown>).options).toBeUndefined();
    const manualGiantResolution = resolveDnd5eSrdAction({
      actor: actorWithData(goliath.data),
      roll: giantAncestry!,
      options: { applyEffect: true, consumeResources: false }
    });
    expect(manualGiantResolution.manualResolutionRequired).toEqual(expect.objectContaining({
      reason: expect.stringContaining("GM/manual resolution")
    }));
    expect(manualGiantResolution.effects).toEqual([]);
    expect(manualGiantResolution.conditions).toEqual([]);
    expect(manualGiantResolution.actorUpdates).toEqual([]);

    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "dragonborn" }).issues)
      .toContainEqual(expect.objectContaining({ field: "draconicAncestry", code: "required" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "dragonborn", draconicAncestry: "purple" }).issues)
      .toContainEqual(expect.objectContaining({ field: "draconicAncestry", code: "invalid_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "dragonborn", draconicAncestry: { color: "black" } as unknown as string }).issues)
      .toContainEqual(expect.objectContaining({ field: "draconicAncestry", code: "invalid_type" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "goliath" }).issues)
      .toContainEqual(expect.objectContaining({ field: "giantAncestry", code: "required" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "goliath", giantAncestry: "ocean" }).issues)
      .toContainEqual(expect.objectContaining({ field: "giantAncestry", code: "invalid_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "goliath", giantAncestry: { giant: "frost" } as unknown as string }).issues)
      .toContainEqual(expect.objectContaining({ field: "giantAncestry", code: "invalid_type" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...base, speciesId: "orc", draconicAncestry: "black", giantAncestry: "frost" }).issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "draconicAncestry", code: "not_available" }),
        expect.objectContaining({ field: "giantAncestry", code: "not_available" })
      ]));

    const legacyDragonborn = dnd5eSrdApplyCharacterOrigins(fighter, { backgroundId: "soldier", speciesId: "dragonborn" });
    expect((legacyDragonborn.data.origin as Record<string, unknown>).draconicAncestry).toBeUndefined();
    expect(legacyDragonborn.data.resistances).toBeUndefined();
    const legacyGoliath = dnd5eSrdApplyCharacterOrigins(fighter, { backgroundId: "soldier", speciesId: "goliath" });
    expect((legacyGoliath.data.origin as Record<string, unknown>).giantAncestry).toBeUndefined();
    expect(dnd5eSrdQuickRolls(actorWithData(legacyGoliath.data)).find((roll) => roll.id === "species-goliath-giant-ancestry"))
      .toEqual(expect.objectContaining({ formula: "0", metadata: expect.objectContaining({ options: expect.any(Array) }) }));
  });

  it("publishes exact starting packages and server-derived Weapon Mastery metadata", () => {
    const origins = dnd5eSrdCharacterOrigins();
    expect(origins.classStartingEquipment.map((entry) => entry.templateId).sort()).toEqual(dnd5eSrdCharacterTemplates().map((template) => template.id).sort());
    expect(Object.fromEntries(origins.classStartingEquipment.map((entry) => [entry.templateId, entry.packages.map((pkg) => [pkg.id, pkg.gp])]))).toEqual({
      barbarian: [["equipment-a", 15], ["gold", 75]],
      bard: [["equipment-a", 19], ["gold", 90]],
      cleric: [["equipment-a", 7], ["gold", 110]],
      druid: [["equipment-a", 9], ["gold", 50]],
      fighter: [["equipment-a", 4], ["equipment-b", 11], ["gold", 155]],
      monk: [["equipment-a", 11], ["gold", 50]],
      paladin: [["equipment-a", 9], ["gold", 150]],
      ranger: [["equipment-a", 7], ["gold", 150]],
      rogue: [["equipment-a", 8], ["gold", 100]],
      sorcerer: [["equipment-a", 28], ["gold", 50]],
      warlock: [["equipment-a", 15], ["gold", 100]],
      wizard: [["equipment-a", 5], ["gold", 55]]
    });
    expect(Object.fromEntries(origins.backgroundStartingEquipment.map((entry) => [entry.backgroundId, entry.packages.map((pkg) => [pkg.id, pkg.gp])]))).toEqual({
      acolyte: [["equipment-a", 8], ["gold", 50]],
      criminal: [["equipment-a", 16], ["gold", 50]],
      sage: [["equipment-a", 8], ["gold", 50]],
      soldier: [["equipment-a", 14], ["gold", 50]]
    });
    expect(Object.fromEntries(origins.classWeaponMasteryChoices.map((entry) => [entry.templateId, entry.count]))).toEqual({
      barbarian: 2, bard: 0, cleric: 0, druid: 0, fighter: 3, monk: 0, paladin: 2, ranger: 2, rogue: 2, sorcerer: 0, warlock: 0, wizard: 0
    });
    expect(origins.classWeaponMasteryChoices.find((entry) => entry.templateId === "barbarian")?.weaponIds).not.toContain("longbow");
    expect(origins.classWeaponMasteryChoices.find((entry) => entry.templateId === "rogue")?.weaponIds).toEqual(expect.arrayContaining(["shortbow", "rapier", "hand-crossbow"]));
    expect(origins.classWeaponMasteryChoices.find((entry) => entry.templateId === "rogue")?.weaponIds).not.toContain("greatsword");
    expect(origins.weaponMasteryOptions.find((entry) => entry.id === "greatsword")).toEqual(expect.objectContaining({ mastery: "graze", sourcePage: 91, sourcePdfPage: 90 }));
  });

  it("applies only selected compendium equipment, summed currency, exact tools, and fixed mastery properties", () => {
    const fighter = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, {
      backgroundId: "soldier",
      speciesId: "orc",
      classEquipmentPackageId: "equipment-b",
      backgroundEquipmentPackageId: "equipment-a",
      backgroundToolProficiencyChoice: "dragonchess-set",
      weaponMasteryChoices: ["greatsword", "longbow", "flail"]
    });
    expect(fighter.data.currency).toEqual({ gp: 25, sp: 0, cp: 0 });
    expect(fighter.data.toolProficiencies).toEqual(["dragonchess-set"]);
    expect(fighter.items.map((item) => item.entryId)).toEqual([
      "studded-leather-armor", "scimitar", "shortsword", "longbow", "arrows", "quiver", "dungeoneers-pack",
      "spear", "shortbow", "arrows", "healers-kit", "quiver", "travelers-clothes", "dragonchess-set"
    ]);
    expect(fighter.items).not.toContainEqual(expect.objectContaining({ entryId: "longsword" }));
    expect(fighter.items[0]?.data).toEqual(expect.objectContaining({ startingEquipment: expect.objectContaining({ kind: "class", packageId: "equipment-b" }) }));
    expect(fighter.data.weaponMasteries).toEqual([
      expect.objectContaining({ weaponId: "greatsword", mastery: "graze", swapTiming: "manual-long-rest" }),
      expect.objectContaining({ weaponId: "longbow", mastery: "slow", swapTiming: "manual-long-rest" }),
      expect.objectContaining({ weaponId: "flail", mastery: "sap", swapTiming: "manual-long-rest" })
    ]);
    expect(fighter.data.origin).toEqual(expect.objectContaining({
      startingEquipment: expect.objectContaining({ totalGp: 25 }),
      weaponMasteryChoices: ["greatsword", "longbow", "flail"]
    }));

    const wizard = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("wizard")!, {
      backgroundId: "sage",
      speciesId: "orc",
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      weaponMasteryChoices: []
    });
    expect(wizard.data.currency).toEqual({ gp: 13, sp: 0, cp: 0 });
    expect(wizard.items.map((item) => item.entryId)).toEqual(expect.arrayContaining(["fire-bolt", "shield", "spellbook", "quarterstaff", "calligraphers-supplies"]));
    expect(wizard.items.find((item) => item.entryId === "spellbook")?.data).toEqual(expect.objectContaining({ startingEquipment: expect.objectContaining({ kind: "class" }) }));
  });

  it("rejects forged package options, repeated masteries, and species-independent injected selections", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const valid = {
      ...strictEquipment("fighter", "soldier"),
      backgroundId: "soldier",
      speciesId: "orc",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: []
    };
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...valid, classEquipmentPackageId: "wizard-gold" }).issues)
      .toContainEqual(expect.objectContaining({ field: "classEquipmentPackageId", code: "invalid_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...valid, classEquipmentChoices: { instrument: "lute" } }).issues)
      .toContainEqual(expect.objectContaining({ field: "classEquipmentChoices", code: "unexpected_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, { ...valid, weaponMasteryChoices: ["longbow", "longbow", "flail"] }).issues)
      .toContainEqual(expect.objectContaining({ field: "weaponMasteryChoices", code: "duplicate_weapon" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(dnd5eSrdCharacterTemplate("wizard")!, {
      ...valid,
      backgroundId: "sage",
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      backgroundToolProficiencyChoice: undefined,
      weaponMasteryChoices: ["dagger"]
    }).issues).toContainEqual(expect.objectContaining({ field: "weaponMasteryChoices", code: "not_available" }));
  });

  it("applies class skills without changing legacy template defaults", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const guided = dnd5eSrdApplyCharacterOrigins(fighter, {
      backgroundId: "soldier",
      speciesId: "orc",
      classSkillProficiencies: ["acrobatics", "perception"],
      originLanguageChoices: ["common-sign-language", "draconic"],
      classLanguageChoices: []
    });
    expect(guided.data.skillProficiencies).toEqual(["athletics", "intimidation", "acrobatics", "perception"]);
    expect(guided.data.origin).toEqual(expect.objectContaining({ classSkillProficiencies: ["acrobatics", "perception"] }));
    expect(guided.data.languages).toEqual(["common", "common-sign-language", "draconic"]);
    expect(guided.data.languageProficiencies).toEqual({
      source: "SRD 5.2.1",
      common: ["common"],
      origin: ["common-sign-language", "draconic"],
      classFeature: []
    });
    expect(fighter.data.skillProficiencies).toEqual(["athletics", "intimidation"]);
    expect(fighter.data.languages).toBeUndefined();

    const druid = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("druid")!, {
      backgroundId: "soldier",
      speciesId: "orc",
      classSkillProficiencies: ["animal-handling", "nature"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: []
    });
    expect(druid.data.languages).toEqual(["common", "draconic", "elvish", "druidic"]);

    const rogue = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("rogue")!, {
      backgroundId: "soldier",
      speciesId: "orc",
      classSkillProficiencies: ["acrobatics", "deception", "investigation", "stealth"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: ["undercommon"]
    });
    expect(rogue.data.languages).toEqual(["common", "draconic", "elvish", "thieves-cant", "undercommon"]);
    expect(rogue.data.languageProficiencies).toEqual(expect.objectContaining({
      origin: ["draconic", "elvish"],
      classFeature: ["thieves-cant", "undercommon"]
    }));

    expect(() => dnd5eSrdApplyCharacterOrigins(fighter, {
      backgroundId: "soldier",
      speciesId: "orc",
      classSkillProficiencies: ["arcana", "athletics"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: []
    })).toThrow(/Fighter skill list|cannot repeat/);
  });
});
