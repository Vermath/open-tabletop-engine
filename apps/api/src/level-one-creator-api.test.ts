import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const headers = { "x-user-id": "usr_demo_gm" };
const route = "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters";
const fighterEquipment = {
  classEquipmentPackageId: "equipment-b",
  backgroundEquipmentPackageId: "equipment-a",
  backgroundToolProficiencyChoice: "dice-set",
  weaponMasteryChoices: ["greatsword", "longbow", "flail"],
  fightingStyle: "defense"
};
const rogueEquipment = {
  classEquipmentPackageId: "equipment-a",
  backgroundEquipmentPackageId: "equipment-a",
  backgroundToolProficiencyChoice: "playing-cards",
  weaponMasteryChoices: ["shortbow", "shortsword"],
  rogueExpertiseChoices: ["acrobatics", "deception"]
};

describe("guided level-one character creation API", () => {
  it("rejects incomplete and inconsistent guided builds without persisting an actor", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actorCount = store.state.actors.length;
      const incomplete = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: { creationMode: "level-one-srd", templateId: "fighter", name: "" }
      });
      expect(incomplete.statusCode).toBe(400);
      expect(incomplete.json()).toEqual(expect.objectContaining({
        error: "bad_request",
        issues: expect.arrayContaining([
          expect.objectContaining({ field: "name", code: "required" }),
          expect.objectContaining({ field: "backgroundId", code: "required" }),
          expect.objectContaining({ field: "speciesId", code: "required" }),
          expect.objectContaining({ field: "abilityScoreIncreases", code: "required" }),
          expect.objectContaining({ field: "classSkillProficiencies", code: "required" }),
          expect.objectContaining({ field: "originLanguageChoices", code: "required" })
        ])
      }));

      const inconsistent = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          ...fighterEquipment,
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Invalid Human",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "human",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "history"],
          originLanguageChoices: ["draconic", "elvish"],
          classLanguageChoices: [],
          skillProficiency: "athletics",
          originFeat: "Savage Attacker"
        }
      });
      expect(inconsistent.statusCode).toBe(400);
      expect(inconsistent.json().issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "skillProficiency", code: "duplicate_background_skill" }),
        expect.objectContaining({ field: "originFeat", code: "duplicate_background_feat" })
      ]));

      const forgedClassSkills = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          ...rogueEquipment,
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Forged Fighter",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["arcana", "athletics"],
          originLanguageChoices: ["draconic", "elvish"],
          classLanguageChoices: []
        }
      });
      expect(forgedClassSkills.statusCode).toBe(400);
      expect(forgedClassSkills.json().issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "classSkillProficiencies", code: "outside_class_list" }),
        expect.objectContaining({ field: "classSkillProficiencies", code: "duplicate_background_skill" })
      ]));

      const malformedClassSkills = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Malformed Fighter",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: { first: "acrobatics", second: "history" },
          originLanguageChoices: ["draconic", "elvish"],
          classLanguageChoices: []
        }
      });
      expect(malformedClassSkills.statusCode).toBe(400);
      expect(malformedClassSkills.json().message).toContain("classSkillProficiencies");

      const forgedOriginLanguages = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Forged Polyglot",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "perception"],
          originLanguageChoices: ["abyssal", "abyssal"],
          classLanguageChoices: ["undercommon"]
        }
      });
      expect(forgedOriginLanguages.statusCode).toBe(400);
      expect(forgedOriginLanguages.json().issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "originLanguageChoices", code: "duplicate_language" }),
        expect.objectContaining({ field: "originLanguageChoices", code: "outside_standard_list" }),
        expect.objectContaining({ field: "classLanguageChoices", code: "not_available" })
      ]));

      const malformedOriginLanguages = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Malformed Polyglot",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "perception"],
          originLanguageChoices: { first: "draconic", second: "elvish" },
          classLanguageChoices: []
        }
      });
      expect(malformedOriginLanguages.statusCode).toBe(400);
      expect(malformedOriginLanguages.json().message).toContain("originLanguageChoices");

      const forgedEquipment = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          ...fighterEquipment,
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Forged Equipment",
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "perception"],
          originLanguageChoices: ["draconic", "elvish"],
          classLanguageChoices: [],
          classEquipmentChoices: { instrument: "lute" },
          weaponMasteryChoices: ["greatsword", "greatsword", "flail"]
        }
      });
      expect(forgedEquipment.statusCode).toBe(400);
      expect(forgedEquipment.json().issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "classEquipmentChoices", code: "unexpected_choice" }),
        expect.objectContaining({ field: "weaponMasteryChoices", code: "duplicate_weapon" })
      ]));
      expect(store.state.actors).toHaveLength(actorCount);
    } finally {
      await app.close();
    }
  });

  it("creates a complete guided build while retaining template-default compatibility", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const origins = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-origins",
        headers
      });
      expect(origins.statusCode).toBe(200);
      expect(origins.json().classSkillChoices).toHaveLength(12);
      expect(origins.json().classSkillChoices).toContainEqual(expect.objectContaining({
        templateId: "fighter",
        count: 2,
        skillIds: expect.arrayContaining(["acrobatics", "athletics", "perception"])
      }));
      expect(origins.json().originLanguageChoice).toEqual(expect.objectContaining({
        count: 2,
        fixedLanguageIds: ["common"],
        languageIds: expect.arrayContaining(["common-sign-language", "draconic", "elvish", "orc"])
      }));
      expect(origins.json().classLanguageChoices).toHaveLength(12);
      expect(origins.json().classLanguageChoices).toContainEqual(expect.objectContaining({
        templateId: "rogue",
        count: 1,
        fixedLanguageIds: ["thieves-cant"],
        languageIds: expect.arrayContaining(["abyssal", "druidic", "undercommon"])
      }));
      expect(origins.json().draconicAncestors.map((ancestor: { id: string; damageType: string }) => [ancestor.id, ancestor.damageType])).toEqual([
        ["black", "acid"], ["blue", "lightning"], ["brass", "fire"], ["bronze", "lightning"], ["copper", "acid"],
        ["gold", "fire"], ["green", "poison"], ["red", "fire"], ["silver", "cold"], ["white", "cold"]
      ]);
      expect(origins.json().giantAncestries).toEqual([
        expect.objectContaining({ id: "cloud", teleportRangeFt: 30 }),
        expect.objectContaining({ id: "fire", damageFormula: "1d10", damageType: "fire" }),
        expect.objectContaining({ id: "frost", damageFormula: "1d6", damageType: "cold", speedReductionFt: 10 }),
        expect.objectContaining({ id: "hill", condition: "Prone", targetMaxSize: "Large" }),
        expect.objectContaining({ id: "stone", damageReductionFormula: "1d12", damageReductionAbility: "constitution" }),
        expect.objectContaining({ id: "storm", damageFormula: "1d8", damageType: "thunder", triggerRangeFt: 60 })
      ]);
      expect(origins.json().classStartingEquipment).toHaveLength(12);
      expect(origins.json().classStartingEquipment).toContainEqual(expect.objectContaining({
        templateId: "fighter",
        sourcePage: 47,
        sourcePdfPage: 46,
        packages: expect.arrayContaining([
          expect.objectContaining({ id: "equipment-b", gp: 11 }),
          expect.objectContaining({ id: "gold", gp: 155 })
        ])
      }));
      expect(origins.json().backgroundStartingEquipment).toContainEqual(expect.objectContaining({ backgroundId: "soldier", sourcePage: 83, sourcePdfPage: 82 }));
      expect(origins.json().classWeaponMasteryChoices).toContainEqual(expect.objectContaining({ templateId: "fighter", count: 3 }));
      expect(origins.json().weaponMasteryOptions).toContainEqual(expect.objectContaining({ id: "greatsword", mastery: "graze" }));
      expect(origins.json().classSpellChoices).toHaveLength(12);
      expect(origins.json().classSpellChoices).toContainEqual(expect.objectContaining({
        templateId: "wizard",
        cantripCount: 3,
        preparedSpellCount: 4,
        spellbookSpellCount: 6,
        slotPool: "spellcasting",
        slotCount: 2,
        slotRecovery: "long",
        sourcePage: 77,
        sourcePdfPage: 76
      }));
      expect(origins.json().classSpellChoices).toContainEqual(expect.objectContaining({
        templateId: "warlock",
        cantripCount: 2,
        preparedSpellCount: 2,
        slotPool: "pact-magic",
        slotCount: 1,
        slotRecovery: "short"
      }));
      expect(origins.json().originFeatOptions.map((feat: { id: string }) => feat.id)).toEqual([
        "Alert", "Magic Initiate (Cleric)", "Magic Initiate (Druid)", "Magic Initiate (Wizard)", "Savage Attacker", "Skilled"
      ]);
      expect(origins.json().eldritchInvocations.map((invocation: { id: string }) => invocation.id)).toEqual([
        "armor-of-shadows", "eldritch-mind", "pact-of-the-blade", "pact-of-the-chain", "pact-of-the-tome"
      ]);

      const guided = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          creationMode: "level-one-srd",
          templateId: "fighter",
          name: "Guided Human Fighter",
          ...fighterEquipment,
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "human",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "history"],
          originLanguageChoices: ["common-sign-language", "draconic"],
          classLanguageChoices: [],
          skillProficiency: "perception",
          originFeat: "Skilled",
          skilledProficiencyChoices: ["arcana", "medicine", "herbalism-kit"]
        }
      });
      expect(guided.statusCode).toBe(200);
      expect(guided.json().actor).toEqual(expect.objectContaining({ name: "Guided Human Fighter", ownerUserId: "usr_demo_player" }));
      expect(guided.json().actor.data.origin).toEqual(expect.objectContaining({
        backgroundId: "soldier",
        speciesId: "human",
        classSkillProficiencies: ["acrobatics", "history"],
        originLanguageChoices: ["common-sign-language", "draconic"],
        classLanguageChoices: [],
        humanSkillProficiency: "perception",
        humanOriginFeat: "Skilled"
      }));
      expect(guided.json().actor.data.skillProficiencies).toEqual(["athletics", "intimidation", "acrobatics", "history", "perception", "arcana", "medicine"]);
      expect(guided.json().actor.data.languages).toEqual(["common", "common-sign-language", "draconic"]);
      expect(guided.json().actor.data.languageProficiencies).toEqual({
        source: "SRD 5.2.1",
        common: ["common"],
        origin: ["common-sign-language", "draconic"],
        classFeature: []
      });
      expect(guided.json().actor.data.currency).toEqual({ gp: 25, sp: 0, cp: 0 });
      expect(guided.json().actor.data.toolProficiencies).toEqual(["dice-set", "herbalism-kit"]);
      expect(guided.json().actor.data.weaponMasteries).toEqual([
        expect.objectContaining({ weaponId: "greatsword", mastery: "graze" }),
        expect.objectContaining({ weaponId: "longbow", mastery: "slow" }),
        expect.objectContaining({ weaponId: "flail", mastery: "sap" })
      ]);
      expect(guided.json().items.map((item: { data: { compendiumId: string } }) => item.data.compendiumId)).toEqual([
        "studded-leather-armor", "scimitar", "shortsword", "longbow", "arrows", "quiver", "dungeoneers-pack",
        "spear", "shortbow", "arrows", "healers-kit", "quiver", "travelers-clothes", "dice-set"
      ]);

      const rogue = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          creationMode: "level-one-srd",
          templateId: "rogue",
          name: "Guided Rogue",
          ...rogueEquipment,
          ownerUserId: "usr_demo_player",
          backgroundId: "soldier",
          speciesId: "orc",
          abilityScoreIncreases: { strength: 2, dexterity: 1 },
          classSkillProficiencies: ["acrobatics", "deception", "investigation", "stealth"],
          originLanguageChoices: ["draconic", "elvish"],
          classLanguageChoices: ["undercommon"]
        }
      });
      expect(rogue.statusCode).toBe(200);
      expect(rogue.json().actor.data.languages).toEqual(["common", "draconic", "elvish", "thieves-cant", "undercommon"]);
      expect(rogue.json().actor.data.languageProficiencies).toEqual(expect.objectContaining({
        origin: ["draconic", "elvish"],
        classFeature: ["thieves-cant", "undercommon"]
      }));

      const templateDefault = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: { templateId: "fighter", name: "Template Default Fighter", ownerUserId: "usr_demo_gm" }
      });
      expect(templateDefault.statusCode).toBe(200);
      expect(templateDefault.json().actor.data.skillProficiencies).toEqual(["athletics", "intimidation"]);
      expect(templateDefault.json().actor.data.languages).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("rejects forged ancestry choices and persists exact selected species mechanics", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const base = {
      ...fighterEquipment,
      creationMode: "level-one-srd",
      templateId: "fighter",
      ownerUserId: "usr_demo_player",
      backgroundId: "soldier",
      abilityScoreIncreases: { strength: 2, dexterity: 1 },
      classSkillProficiencies: ["acrobatics", "perception"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: []
    };
    try {
      const actorCount = store.state.actors.length;
      for (const payload of [
        { ...base, name: "Missing Dragon", speciesId: "dragonborn" },
        { ...base, name: "Forged Dragon", speciesId: "dragonborn", draconicAncestry: "purple" },
        { ...base, name: "Malformed Dragon", speciesId: "dragonborn", draconicAncestry: { color: "black" } },
        { ...base, name: "Missing Giant", speciesId: "goliath" },
        { ...base, name: "Forged Giant", speciesId: "goliath", giantAncestry: "ocean" },
        { ...base, name: "Malformed Giant", speciesId: "goliath", giantAncestry: { giant: "frost" } },
        { ...base, name: "Forged Orc", speciesId: "orc", draconicAncestry: "black", giantAncestry: "frost" }
      ]) {
        const response = await app.inject({ method: "POST", url: route, headers, payload });
        expect(response.statusCode, payload.name).toBe(400);
      }
      expect(store.state.actors).toHaveLength(actorCount);

      const dragonborn = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: { ...base, name: "Black Dragonborn", speciesId: "dragonborn", draconicAncestry: "black" }
      });
      expect(dragonborn.statusCode).toBe(200);
      expect(dragonborn.json().actor.data.origin).toEqual(expect.objectContaining({
        draconicAncestry: "black",
        draconicAncestryName: "Black Dragon",
        draconicAncestryDamageType: "acid"
      }));
      expect(dragonborn.json().actor.data.resistances).toEqual(["acid"]);
      expect(dragonborn.json().sheet.quickRolls).toContainEqual(expect.objectContaining({
        id: "species-dragonborn-breath-weapon",
        formula: "1d10",
        metadata: expect.objectContaining({ damageType: "acid", resource: "breathWeapon" })
      }));

      const goliath = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: { ...base, name: "Stone Goliath", speciesId: "goliath", giantAncestry: "stone" }
      });
      expect(goliath.statusCode).toBe(200);
      expect(goliath.json().actor.data.origin).toEqual(expect.objectContaining({
        giantAncestry: "stone",
        giantAncestryBenefit: "Stone's Endurance",
        giantAncestryType: "Stone Giant"
      }));
      expect(goliath.json().sheet.quickRolls).toContainEqual(expect.objectContaining({
        id: "species-goliath-giant-ancestry",
        formula: "1d12+2",
        metadata: expect.objectContaining({
          ancestryId: "stone",
          requiresManualResolution: true,
          selectedBenefit: expect.objectContaining({ reductionFormula: "1d12+2" })
        })
      }));

      const templateDefault = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: { templateId: "fighter", name: "Legacy Default", ownerUserId: "usr_demo_gm" }
      });
      expect(templateDefault.statusCode).toBe(200);
      expect(templateDefault.json().actor.data.origin).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("rejects forged spell selections without writes and preserves exact Wizard choices through campaign export", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const wizardPayload = {
      creationMode: "level-one-srd",
      templateId: "wizard",
      name: "Archived Rules Wizard",
      ownerUserId: "usr_demo_player",
      backgroundId: "criminal",
      speciesId: "orc",
      abilityScoreIncreases: { intelligence: 2, dexterity: 1 },
      classSkillProficiencies: ["arcana", "history"],
      originLanguageChoices: ["draconic", "elvish"],
      classLanguageChoices: [],
      classEquipmentPackageId: "equipment-a",
      backgroundEquipmentPackageId: "equipment-a",
      weaponMasteryChoices: [],
      classCantripChoices: ["acid-splash", "message", "poison-spray"],
      wizardSpellbookChoices: ["alarm", "charm-person", "comprehend-languages", "detect-magic", "disguise-self", "find-familiar"],
      classPreparedSpellChoices: ["alarm", "charm-person", "detect-magic", "disguise-self"]
    };
    try {
      const actorCount = store.state.actors.length;
      const itemCount = store.state.items.length;
      const forged = await app.inject({
        method: "POST",
        url: route,
        headers,
        payload: {
          ...wizardPayload,
          name: "Forged Rules Wizard",
          wizardSpellbookChoices: ["alarm", "alarm", "charm-person", "detect-magic", "disguise-self", "find-familiar"],
          classPreparedSpellChoices: ["alarm", "charm-person", "detect-magic", "cure-wounds"]
        }
      });
      expect(forged.statusCode).toBe(400);
      expect(forged.json().issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "wizardSpellbookChoices", code: "duplicate_choice" }),
        expect.objectContaining({ field: "classPreparedSpellChoices", code: "outside_list" })
      ]));
      expect(store.state.actors).toHaveLength(actorCount);
      expect(store.state.items).toHaveLength(itemCount);

      const created = await app.inject({ method: "POST", url: route, headers, payload: wizardPayload });
      expect(created.statusCode).toBe(200);
      const actorId = created.json().actor.id as string;
      expect(created.json().actor.data.spellcasting).toEqual(expect.objectContaining({
        cantrips: ["acid-splash", "message", "poison-spray"],
        spellbookSpells: ["alarm", "charm-person", "comprehend-languages", "detect-magic", "disguise-self", "find-familiar"],
        preparedSpells: ["alarm", "charm-person", "detect-magic", "disguise-self"],
        changeTiming: "long-rest"
      }));
      expect(created.json().actor.data.spellSlots).toEqual({ level1: { current: 2, max: 2, recovery: "long" } });
      const createdSpellIds = created.json().items
        .filter((item: { type: string }) => item.type === "spell")
        .map((item: { data: { compendiumId: string } }) => item.data.compendiumId);
      expect(createdSpellIds).toEqual(expect.arrayContaining([
        "acid-splash", "message", "poison-spray", "alarm", "charm-person", "comprehend-languages", "detect-magic", "disguise-self", "find-familiar"
      ]));
      expect(createdSpellIds).not.toEqual(expect.arrayContaining(["fire-bolt", "magic-missile", "shield"]));

      const archive = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers
      });
      expect(archive.statusCode).toBe(200);
      const archivedActor = archive.json().data.actors.find((actor: { id: string }) => actor.id === actorId);
      expect(archivedActor.data.spellcasting).toEqual(created.json().actor.data.spellcasting);
      expect(archivedActor.data.spellSlots).toEqual(created.json().actor.data.spellSlots);
      const archivedSpells = archive.json().data.items
        .filter((item: { actorId?: string; type: string }) => item.actorId === actorId && item.type === "spell");
      expect(archivedSpells).toHaveLength(9);
      expect(archivedSpells.find((item: { data: { compendiumId: string } }) => item.data.compendiumId === "comprehend-languages")?.data)
        .toEqual(expect.objectContaining({ inSpellbook: true, prepared: false, classSpell: true }));
    } finally {
      await app.close();
    }
  });
});
