import { describe, expect, it } from "vitest";
import {
  dnd5eSrdApplyCharacterOrigins,
  dnd5eSrdCharacterOrigins,
  dnd5eSrdCharacterTemplate,
  dnd5eSrdCompendiumEntry,
  dnd5eSrdValidateLevelOneCharacterCreation
} from "./index.js";
import type { Dnd5eSrdCharacterOriginOptions } from "./index.js";

const classSkills: Record<string, string[]> = {
  barbarian: ["animal-handling", "athletics"],
  bard: ["acrobatics", "animal-handling", "arcana"],
  cleric: ["insight", "medicine"],
  druid: ["animal-handling", "arcana"],
  fighter: ["acrobatics", "athletics"],
  monk: ["acrobatics", "athletics"],
  paladin: ["athletics", "insight"],
  ranger: ["animal-handling", "athletics", "insight"],
  rogue: ["acrobatics", "athletics", "deception", "insight"],
  sorcerer: ["arcana", "deception"],
  warlock: ["arcana", "deception"],
  wizard: ["arcana", "history"]
};

function ruleChoices(templateId: string, backgroundId: string): Partial<Dnd5eSrdCharacterOriginOptions> {
  const masteryByClass: Record<string, string[]> = {
    barbarian: ["greataxe", "handaxe"],
    fighter: ["greatsword", "flail", "longbow"],
    paladin: ["longsword", "javelin"],
    ranger: ["longbow", "scimitar"],
    rogue: ["shortbow", "shortsword"]
  };
  const result: Partial<Dnd5eSrdCharacterOriginOptions> = {
    classEquipmentPackageId: "equipment-a",
    backgroundEquipmentPackageId: "equipment-a",
    weaponMasteryChoices: masteryByClass[templateId] ?? []
  };
  const spellsAndFeatures: Record<string, Partial<Dnd5eSrdCharacterOriginOptions>> = {
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
  Object.assign(result, spellsAndFeatures[templateId] ?? {});
  if (templateId === "bard") {
    result.classEquipmentChoices = { instrument: "flute" };
    result.classToolProficiencyChoices = ["flute", "lute", "drum"];
  }
  if (["cleric", "paladin"].includes(templateId)) result.classEquipmentChoices = { "holy-symbol": "holy-symbol-amulet" };
  if (templateId === "monk") result.classToolProficiencyChoices = ["smiths-tools"];
  if (backgroundId === "acolyte") {
    result.backgroundEquipmentChoices = { "holy-symbol": "holy-symbol-emblem" };
    Object.assign(result, {
      backgroundMagicInitiateCantrips: ["light", "thaumaturgy"],
      backgroundMagicInitiateSpell: "sanctuary",
      backgroundMagicInitiateAbility: "wisdom"
    });
  }
  if (backgroundId === "sage") {
    Object.assign(result, {
      backgroundMagicInitiateCantrips: ["ray-of-frost", "shocking-grasp"],
      backgroundMagicInitiateSpell: "chromatic-orb",
      backgroundMagicInitiateAbility: "intelligence"
    });
  }
  if (backgroundId === "soldier") result.backgroundToolProficiencyChoice = "dice-set";
  return result;
}

function validOptions(
  templateId: string,
  backgroundId = "criminal",
  overrides: Partial<Dnd5eSrdCharacterOriginOptions> = {}
): Dnd5eSrdCharacterOriginOptions {
  const backgroundValues: Record<string, Pick<Dnd5eSrdCharacterOriginOptions, "abilityScoreIncreases">> = {
    acolyte: { abilityScoreIncreases: { wisdom: 2, intelligence: 1 } },
    criminal: { abilityScoreIncreases: { dexterity: 2, constitution: 1 } },
    sage: { abilityScoreIncreases: { intelligence: 2, constitution: 1 } },
    soldier: { abilityScoreIncreases: { strength: 2, dexterity: 1 } }
  };
  return {
    ...ruleChoices(templateId, backgroundId),
    backgroundId,
    speciesId: "orc",
    ...backgroundValues[backgroundId],
    classSkillProficiencies: classSkills[templateId],
    originLanguageChoices: ["draconic", "elvish"],
    classLanguageChoices: templateId === "rogue" ? ["abyssal"] : [],
    ...overrides
  };
}

function spellItems(build: ReturnType<typeof dnd5eSrdApplyCharacterOrigins>) {
  return build.items.filter((item) => dnd5eSrdCompendiumEntry(item.entryId)?.type === "spell");
}

describe("D&D SRD level-one spell and feature choices", () => {
  it("publishes the exact level-one capacities, list sizes, recovery modes, and source pages for every class", () => {
    const choices = dnd5eSrdCharacterOrigins().classSpellChoices;
    expect(Object.fromEntries(choices.map((choice) => [choice.templateId, {
      cantrips: choice.cantripCount,
      prepared: choice.preparedSpellCount,
      spellbook: choice.spellbookSpellCount,
      cantripList: choice.cantripIds.length,
      levelOneList: choice.levelOneSpellIds.length,
      always: choice.alwaysPreparedSpellIds,
      pool: choice.slotPool,
      slots: choice.slotCount,
      recovery: choice.slotRecovery,
      page: [choice.sourcePage, choice.sourcePdfPage]
    }]))).toEqual({
      barbarian: { cantrips: 0, prepared: 0, spellbook: 0, cantripList: 0, levelOneList: 0, always: [], pool: "none", slots: 0, recovery: "none", page: [28, 27] },
      bard: { cantrips: 2, prepared: 4, spellbook: 0, cantripList: 10, levelOneList: 23, always: [], pool: "spellcasting", slots: 2, recovery: "long", page: [31, 30] },
      cleric: { cantrips: 3, prepared: 4, spellbook: 0, cantripList: 7, levelOneList: 15, always: [], pool: "spellcasting", slots: 2, recovery: "long", page: [36, 35] },
      druid: { cantrips: 2, prepared: 4, spellbook: 0, cantripList: 11, levelOneList: 18, always: ["speak-with-animals"], pool: "spellcasting", slots: 2, recovery: "long", page: [41, 40] },
      fighter: { cantrips: 0, prepared: 0, spellbook: 0, cantripList: 0, levelOneList: 0, always: [], pool: "none", slots: 0, recovery: "none", page: [47, 46] },
      monk: { cantrips: 0, prepared: 0, spellbook: 0, cantripList: 0, levelOneList: 0, always: [], pool: "none", slots: 0, recovery: "none", page: [49, 48] },
      paladin: { cantrips: 0, prepared: 2, spellbook: 0, cantripList: 0, levelOneList: 13, always: [], pool: "spellcasting", slots: 2, recovery: "long", page: [53, 52] },
      ranger: { cantrips: 0, prepared: 2, spellbook: 0, cantripList: 0, levelOneList: 13, always: ["hunters-mark"], pool: "spellcasting", slots: 2, recovery: "long", page: [57, 56] },
      rogue: { cantrips: 0, prepared: 0, spellbook: 0, cantripList: 0, levelOneList: 0, always: [], pool: "none", slots: 0, recovery: "none", page: [61, 60] },
      sorcerer: { cantrips: 4, prepared: 2, spellbook: 0, cantripList: 16, levelOneList: 21, always: [], pool: "spellcasting", slots: 2, recovery: "long", page: [64, 63] },
      warlock: { cantrips: 2, prepared: 2, spellbook: 0, cantripList: 7, levelOneList: 12, always: [], pool: "pact-magic", slots: 1, recovery: "short", page: [70, 69] },
      wizard: { cantrips: 3, prepared: 4, spellbook: 6, cantripList: 15, levelOneList: 30, always: [], pool: "spellcasting", slots: 2, recovery: "long", page: [77, 76] }
    });
  });

  it("accepts an exact complete selection for every exposed class", () => {
    for (const templateId of Object.keys(classSkills)) {
      const template = dnd5eSrdCharacterTemplate(templateId)!;
      expect(dnd5eSrdValidateLevelOneCharacterCreation(template, validOptions(templateId)), templateId)
        .toEqual({ ok: true, issues: [] });
    }
  });

  it("replaces strict Wizard template spells with the selected spellbook and prepared subset", () => {
    const template = dnd5eSrdCharacterTemplate("wizard")!;
    const options = validOptions("wizard", "criminal", {
      classCantripChoices: ["acid-splash", "message", "poison-spray"],
      wizardSpellbookChoices: ["alarm", "charm-person", "comprehend-languages", "detect-magic", "disguise-self", "find-familiar"],
      classPreparedSpellChoices: ["alarm", "charm-person", "detect-magic", "disguise-self"]
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(template, options)).toEqual({ ok: true, issues: [] });
    const build = dnd5eSrdApplyCharacterOrigins(template, options);
    expect(build.data.spellcasting).toEqual(expect.objectContaining({
      ability: "intelligence",
      cantrips: ["acid-splash", "message", "poison-spray"],
      spellbookSpells: ["alarm", "charm-person", "comprehend-languages", "detect-magic", "disguise-self", "find-familiar"],
      preparedSpells: ["alarm", "charm-person", "detect-magic", "disguise-self"],
      slotPool: "spellcasting",
      changeTiming: "long-rest"
    }));
    expect(build.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
    expect(spellItems(build).map((item) => item.entryId)).toHaveLength(9);
    expect(spellItems(build).map((item) => item.entryId)).not.toEqual(expect.arrayContaining(["fire-bolt", "magic-missile", "shield"]));
    expect(spellItems(build).find((item) => item.entryId === "alarm")?.data).toEqual(expect.objectContaining({ inSpellbook: true, prepared: true, classSpell: true }));
    expect(spellItems(build).find((item) => item.entryId === "comprehend-languages")?.data).toEqual(expect.objectContaining({ inSpellbook: true, prepared: false, classSpell: true }));
    expect(spellItems(build).find((item) => item.entryId === "comprehend-languages")?.data?.preparationMode).toBe("spellbook");
    expect(spellItems(build).find((item) => item.entryId === "comprehend-languages")?.data?.known).toBeUndefined();
    expect(spellItems(build).find((item) => item.entryId === "acid-splash")?.data).toEqual(expect.objectContaining({ known: true, alwaysPrepared: true, preparationMode: "known" }));
  });

  it("persists background and Human Magic Initiate choices with separate Long Rest free-cast pools", () => {
    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    const acolyte = validOptions("fighter", "acolyte");
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, acolyte)).toEqual({ ok: true, issues: [] });
    const acolyteBuild = dnd5eSrdApplyCharacterOrigins(fighter, acolyte);
    expect(acolyteBuild.data.resources).toEqual(expect.objectContaining({ backgroundMagicInitiate: { current: 1, max: 1, recovery: "long" } }));
    expect(acolyteBuild.data.origin).toEqual(expect.objectContaining({
      backgroundMagicInitiate: {
        feat: "Magic Initiate (Cleric)",
        cantrips: ["light", "thaumaturgy"],
        spell: "sanctuary",
        ability: "wisdom",
        freeCastResource: "backgroundMagicInitiate"
      }
    }));
    expect(spellItems(acolyteBuild).find((item) => item.entryId === "sanctuary")?.data).toEqual(expect.objectContaining({
      originFeatSpell: true,
      alwaysPrepared: true,
      preparationMode: "always-prepared",
      spellcastingAbility: "wisdom",
      freeCastResource: "backgroundMagicInitiate"
    }));

    const human = validOptions("fighter", "criminal", {
      speciesId: "human",
      skillProficiency: "perception",
      originFeat: "Magic Initiate (Druid)",
      originFeatMagicInitiateCantrips: ["druidcraft", "shillelagh"],
      originFeatMagicInitiateSpell: "goodberry",
      originFeatMagicInitiateAbility: "wisdom"
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, human)).toEqual({ ok: true, issues: [] });
    const humanBuild = dnd5eSrdApplyCharacterOrigins(fighter, human);
    expect(humanBuild.data.resources).toEqual(expect.objectContaining({ humanMagicInitiate: { current: 1, max: 1, recovery: "long" } }));
    expect(humanBuild.data.origin).toEqual(expect.objectContaining({
      humanMagicInitiate: expect.objectContaining({ feat: "Magic Initiate (Druid)", spell: "goodberry", ability: "wisdom" })
    }));
  });

  it("models Pact Magic, eligible invocations, and Pact of the Tome selections without slot-backed invocation casts", () => {
    const warlock = dnd5eSrdCharacterTemplate("warlock")!;
    const tomeOptions = validOptions("warlock", "criminal", {
      eldritchInvocation: "pact-of-the-tome",
      pactTomeCantripChoices: ["guidance", "sacred-flame", "shillelagh"],
      pactTomeRitualChoices: ["alarm", "detect-magic"]
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(warlock, tomeOptions)).toEqual({ ok: true, issues: [] });
    const tome = dnd5eSrdApplyCharacterOrigins(warlock, tomeOptions);
    expect(tome.data.spellSlots).toEqual({ level1: { current: 1, max: 1, recovery: "short" } });
    expect(tome.data.spellcasting).toEqual(expect.objectContaining({ slotPool: "pact-magic", changeTiming: "class-level" }));
    expect(tome.data.origin).toEqual(expect.objectContaining({
      levelOneChoices: expect.objectContaining({
        eldritchInvocation: expect.objectContaining({
          id: "pact-of-the-tome",
          cantrips: ["guidance", "sacred-flame", "shillelagh"],
          rituals: ["alarm", "detect-magic"]
        })
      })
    }));
    expect(spellItems(tome).filter((item) => item.data?.pactTomeSpell)).toHaveLength(5);
    expect(spellItems(tome).find((item) => item.entryId === "alarm")?.data).toEqual(expect.objectContaining({
      pactTomeSpell: true,
      prepared: true,
      alwaysPrepared: true,
      preparationMode: "pact-tome",
      inPactTome: true,
      countsAsClass: "warlock"
    }));

    const armor = dnd5eSrdApplyCharacterOrigins(warlock, validOptions("warlock", "criminal", { eldritchInvocation: "armor-of-shadows" }));
    expect(spellItems(armor).find((item) => item.entryId === "mage-armor")?.data).toEqual(expect.objectContaining({
      invocationSpell: true,
      atWill: true,
      noSpellSlotRequired: true
    }));
  });

  it("persists manual class-choice metadata, dynamic order cantrips, Expertise, and all SRD origin feats", () => {
    const origins = dnd5eSrdCharacterOrigins();
    expect(origins.originFeatOptions.map((feat) => feat.id)).toEqual([
      "Alert", "Magic Initiate (Cleric)", "Magic Initiate (Druid)", "Magic Initiate (Wizard)", "Savage Attacker", "Skilled"
    ]);
    expect(origins.fightingStyles.map(({ id, sourcePage, sourcePdfPage }) => ({ id, sourcePage, sourcePdfPage }))).toEqual([
      { id: "archery", sourcePage: 87, sourcePdfPage: 86 },
      { id: "defense", sourcePage: 88, sourcePdfPage: 87 },
      { id: "great-weapon-fighting", sourcePage: 88, sourcePdfPage: 87 },
      { id: "two-weapon-fighting", sourcePage: 88, sourcePdfPage: 87 }
    ]);
    expect(origins.levelOneClassFeatureChoices).toEqual(expect.arrayContaining([
      expect.objectContaining({ templateId: "fighter", field: "fightingStyle", sourcePage: 47, sourcePdfPage: 46 }),
      expect.objectContaining({ templateId: "cleric", field: "divineOrder", sourcePage: 37, sourcePdfPage: 36 }),
      expect.objectContaining({ templateId: "druid", field: "primalOrder", sourcePage: 42, sourcePdfPage: 41 }),
      expect.objectContaining({ templateId: "rogue", field: "rogueExpertiseChoices", sourcePage: 61, sourcePdfPage: 60 }),
      expect.objectContaining({ templateId: "warlock", field: "eldritchInvocation", sourcePage: 70, sourcePdfPage: 69 })
    ]));

    const clericOptions = validOptions("cleric", "criminal", {
      divineOrder: "thaumaturge",
      classCantripChoices: ["guidance", "sacred-flame", "spare-the-dying", "thaumaturgy"]
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(dnd5eSrdCharacterTemplate("cleric")!, clericOptions)).toEqual({ ok: true, issues: [] });
    const cleric = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("cleric")!, clericOptions);
    expect(cleric.data.orderSkillCheckBonus).toEqual({ abilityModifier: "wisdom", minimumBonus: 1, checks: ["intelligence-arcana", "intelligence-religion"], automation: "manual" });
    expect(cleric.data.origin).toEqual(expect.objectContaining({ levelOneChoices: expect.objectContaining({ divineOrder: expect.objectContaining({ id: "thaumaturge", automation: "manual" }) }) }));

    const druidOptions = validOptions("druid", "criminal", {
      primalOrder: "magician",
      classCantripChoices: ["druidcraft", "guidance", "produce-flame"]
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(dnd5eSrdCharacterTemplate("druid")!, druidOptions)).toEqual({ ok: true, issues: [] });
    const druid = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("druid")!, druidOptions);
    expect(druid.data.orderSkillCheckBonus).toEqual({ abilityModifier: "wisdom", minimumBonus: 1, checks: ["intelligence-arcana", "intelligence-nature"], automation: "manual" });
    expect(spellItems(druid).find((item) => item.entryId === "speak-with-animals")?.data).toEqual(expect.objectContaining({ alwaysPrepared: true, classSpell: true }));

    const fighter = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("fighter")!, validOptions("fighter"));
    expect(fighter.data.origin).toEqual(expect.objectContaining({ levelOneChoices: expect.objectContaining({ fightingStyle: expect.objectContaining({ id: "defense", automation: "manual" }) }) }));
    const rogue = dnd5eSrdApplyCharacterOrigins(dnd5eSrdCharacterTemplate("rogue")!, validOptions("rogue"));
    expect(rogue.data.skillExpertise).toEqual(["acrobatics", "deception"]);
  });

  it("rejects duplicate, foreign, inaccessible, and forged spell, feat, proficiency, and class-feature choices", () => {
    const wizard = dnd5eSrdCharacterTemplate("wizard")!;
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, validOptions("wizard", "criminal", {
      classPreparedSpellChoices: ["burning-hands", "detect-magic", "magic-missile", "cure-wounds"]
    })).issues).toContainEqual(expect.objectContaining({ field: "classPreparedSpellChoices", code: "outside_list" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, validOptions("wizard", "criminal", {
      classPreparedSpellChoices: ["alarm", "charm-person", "detect-magic", "disguise-self"]
    })).issues).toContainEqual(expect.objectContaining({ field: "classPreparedSpellChoices", code: "outside_spellbook" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, validOptions("wizard", "criminal", {
      wizardSpellbookChoices: ["alarm", "alarm", "charm-person", "detect-magic", "magic-missile", "shield"]
    })).issues).toContainEqual(expect.objectContaining({ field: "wizardSpellbookChoices", code: "duplicate_choice" }));

    const sageWizard = validOptions("wizard", "sage", {
      wizardSpellbookChoices: ["alarm", "burning-hands", "charm-person", "chromatic-orb", "magic-missile", "shield"],
      classPreparedSpellChoices: ["burning-hands", "charm-person", "magic-missile", "shield"]
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, sageWizard).issues)
      .toContainEqual(expect.objectContaining({ field: "backgroundMagicInitiateCantrips", code: "duplicate_spell" }));

    const fighter = dnd5eSrdCharacterTemplate("fighter")!;
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, validOptions("fighter", "criminal", { fightingStyle: "dueling" })).issues)
      .toContainEqual(expect.objectContaining({ field: "fightingStyle", code: "invalid_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, validOptions("fighter", "criminal", { classCantripChoices: ["fire-bolt"] })).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ field: "classCantripChoices", code: "not_available" })]));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(fighter, validOptions("fighter", "criminal", {
      speciesId: "human",
      skillProficiency: "perception",
      originFeat: "Skilled",
      skilledProficiencyChoices: ["perception", "medicine", "herbalism-kit"]
    })).issues).toContainEqual(expect.objectContaining({ field: "skilledProficiencyChoices", code: "duplicate_proficiency" }));

    const warlock = dnd5eSrdCharacterTemplate("warlock")!;
    expect(dnd5eSrdValidateLevelOneCharacterCreation(warlock, validOptions("warlock", "criminal", { eldritchInvocation: "agonizing-blast" })).issues)
      .toContainEqual(expect.objectContaining({ field: "eldritchInvocation", code: "invalid_choice" }));
    expect(dnd5eSrdValidateLevelOneCharacterCreation(warlock, validOptions("warlock", "criminal", {
      eldritchInvocation: "pact-of-the-tome",
      pactTomeCantripChoices: ["eldritch-blast", "guidance", "sacred-flame"],
      pactTomeRitualChoices: ["alarm", "detect-magic"]
    })).issues).toContainEqual(expect.objectContaining({ field: "pactTomeCantripChoices", code: "duplicate_spell" }));
  });

  it("merges overlapping fixed species and selected class spells into one grant with both provenance records", () => {
    const wizard = dnd5eSrdCharacterTemplate("wizard")!;
    const options = validOptions("wizard", "criminal", {
      speciesId: "elf",
      elfLineage: "high-elf",
      elfCantrip: "fire-bolt",
      speciesSpellcastingAbility: "intelligence"
    });
    expect(dnd5eSrdValidateLevelOneCharacterCreation(wizard, options)).toEqual({ ok: true, issues: [] });
    const fireBolt = spellItems(dnd5eSrdApplyCharacterOrigins(wizard, options)).filter((item) => item.entryId === "fire-bolt");
    expect(fireBolt).toHaveLength(1);
    expect(fireBolt[0]?.data).toEqual(expect.objectContaining({
      classSpell: true,
      speciesSpell: true,
      spellSources: expect.arrayContaining([
        expect.objectContaining({ kind: "class" }),
        expect.objectContaining({ kind: "species" })
      ])
    }));
  });
});
