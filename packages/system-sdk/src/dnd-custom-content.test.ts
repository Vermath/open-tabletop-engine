import { createTimestamped, type Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { applyDnd5eSrdAdvancement, dnd5eSrdAdvancementFeatGrant, dnd5eSrdClassAdvancementProfile, dnd5eSrdSubclassOptionsForActor } from "./index.js";
import { buildDndCustomContent, dataWithDndCustomAdvancementContent, type DndCustomContentDraft, type DndCustomContentKind } from "./dnd-custom-content.js";

const privateLicense = { name: "Private home game", usage: "private_home_game" as const };

function draft(kind: DndCustomContentKind, data: Record<string, unknown>): DndCustomContentDraft {
  return {
    id: `custom-${kind}`,
    kind,
    name: `Custom ${kind}`,
    summary: `A user-authored ${kind}.`,
    sourceName: "Trey's campaign",
    sourceVersion: "1",
    contentVersion: "1.0.0",
    license: privateLicense,
    data
  };
}

const validData: Record<DndCustomContentKind, Record<string, unknown>> = {
  monster: {
    size: "medium",
    creatureType: "Construct",
    armorClass: 16,
    hitPoints: 52,
    hitDice: "8d8+16",
    challengeRating: "3",
    proficiencyBonus: 2,
    speed: { walk: 30 },
    abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 8, wisdom: 10, charisma: 6 },
    actions: [{ name: "Slam", description: "Melee attack that deals bludgeoning damage." }]
  },
  spell: {
    level: 2,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "A controlled burst of custom magical energy.",
    classes: ["Wizard"],
    components: { verbal: true, somatic: true },
    ritual: false,
    concentration: false,
    damageFormula: "3d6"
  },
  item: {
    category: "weapon",
    description: "A campaign-forged blade.",
    costGp: 75,
    weightLb: 3,
    properties: ["versatile"],
    requiresAttunement: false,
    consumable: false,
    damageFormula: "1d8"
  },
  feat: {
    category: "origin",
    description: "Training developed during the campaign.",
    prerequisites: [],
    repeatable: false,
    benefits: [{ name: "Ready", description: "Gain a campaign-specific readiness benefit." }]
  },
  species: {
    description: "A private-home-game species.",
    creatureType: "Humanoid",
    sizeOptions: ["medium", "small"],
    speed: { walk: 30 },
    traits: [{ name: "Adaptable", description: "Choose one campaign-approved adaptation." }],
    languages: ["Common"]
  },
  background: {
    description: "A background tied to the campaign setting.",
    abilityScoreOptions: ["strength", "wisdom", "charisma"],
    skillProficiencies: ["Insight", "Survival"],
    originFeat: "Skilled",
    toolProficiency: "Cartographer's Tools",
    startingEquipment: ["Map case"]
  },
  class: {
    description: "A disciplined campaign class.",
    hitDie: "d8",
    primaryAbilities: ["wisdom"],
    savingThrows: ["wisdom", "charisma"],
    skillProficiencies: ["Arcana", "Insight", "Medicine"],
    skillChoiceCount: 2,
    featLevels: [4, 8, 12, 16, 19],
    subclassSelectionLevel: 3,
    spellcastingProgression: "full",
    multiclassPrerequisiteMode: "all",
    multiclassPrerequisites: [{ ability: "wisdom", minimum: 13 }],
    features: [{ level: 1, name: "Mystic Practice", description: "Gain the class's campaign practice." }]
  },
  subclass: {
    description: "A private campaign subclass.",
    parentClass: "Fighter",
    selectionLevel: 3,
    spellcastingProgression: "none",
    features: [{ level: 3, name: "Campaign Feature", description: "A bounded custom feature." }]
  },
  condition: {
    description: "A campaign-specific condition.",
    effects: [{ name: "Hindered", description: "The affected creature loses 5 feet of Speed." }],
    stacking: "refresh",
    defaultDuration: "Until the end of the source creature's next turn"
  }
};

describe("D&D custom content builders", () => {
  it("builds every declared content kind with explicit user provenance", () => {
    for (const [kind, data] of Object.entries(validData) as Array<[DndCustomContentKind, Record<string, unknown>]>) {
      const result = buildDndCustomContent(draft(kind, data));
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.entry).toMatchObject({
        id: `custom-${kind}`,
        type: kind,
        provenance: {
          sourceKind: "user",
          systemId: "dnd-5e-srd",
          systemVersion: "5.2.1",
          rulesVersion: "SRD 5.2.1",
          license: privateLicense
        },
        data: { customContentKind: kind, builderSchemaVersion: "1.0.0" }
      });
    }
  });

  it("rejects forged SRD provenance instead of treating homebrew as official content", () => {
    const input = draft("condition", validData.condition);
    const result = buildDndCustomContent({ ...input, license: { name: "SRD", usage: "srd" } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "license.usage", code: "reserved_usage" }));
  });

  it("returns field-level errors for illegal D&D values without mutating the source draft", () => {
    const input = draft("monster", {
      ...validData.monster,
      size: "planet",
      armorClass: 0,
      speed: { fly: -5 },
      abilities: { strength: 99 }
    });
    const before = structuredClone(input);
    const result = buildDndCustomContent(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "data.size",
      "data.armorClass",
      "data.speed.fly",
      "data.speed.walk",
      "data.abilities.strength"
    ]));
    expect(input).toEqual(before);
  });

  it("keeps uncertain automation visibly manual", () => {
    const condition = draft("condition", { description: "Requires DM adjudication." });
    const result = buildDndCustomContent(condition);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "manual_only" }));
    expect(result.entry.data).toMatchObject({ stacking: "manual", effects: [] });
  });

  it("enforces the D&D 5.5e background choice shape", () => {
    const result = buildDndCustomContent(draft("background", {
      ...validData.background,
      abilityScoreOptions: ["wisdom", "charisma"],
      skillProficiencies: ["Insight"]
    }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.filter((issue) => issue.code === "exact_count")).toHaveLength(2);
  });

  it("integrates attached custom classes and subclasses with advancement without inheriting a hard-coded class", () => {
    const classResult = buildDndCustomContent({
      ...draft("class", validData.class),
      id: "mystic",
      name: "Mystic",
      data: {
        ...validData.class,
        featLevels: [5, 9, 13, 17, 19],
        features: [
          { level: 1, name: "Mystic Practice", description: "Gain the class's campaign practice." },
          { level: 3, name: "Focused Channel", description: "Channel the class's campaign focus." },
        ],
      },
    });
    const subclassResult = buildDndCustomContent({
      ...draft("subclass", validData.subclass),
      id: "way-of-embers",
      name: "Way of Embers",
      data: {
        ...validData.subclass,
        parentClass: "Mystic",
        features: [{ level: 3, name: "Ember Focus", description: "Adopt the ember focus." }],
      },
    });
    expect(classResult.ok).toBe(true);
    expect(subclassResult.ok).toBe(true);
    if (!classResult.ok || !subclassResult.ok) return;
    const actor = createTimestamped("act", {
      id: "act_mystic", campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type: "character", name: "Mira",
      data: dataWithDndCustomAdvancementContent({
        class: "Mystic", classes: [{ className: "Mystic", level: 2 }], level: 2,
        attributes: { constitution: 10, wisdom: 16 }, hp: { current: 13, max: 13 }, hitDice: { current: 2, max: 2, size: "d8" }, features: [],
      }, [classResult.entry, subclassResult.entry]),
      permissions: {},
    }) satisfies Actor;

    expect(dnd5eSrdClassAdvancementProfile(actor, "Mystic")).toMatchObject({ custom: true, hitDie: "d8", subclassSelectionLevel: 3, spellcastingProgression: "full" });
    expect(dnd5eSrdSubclassOptionsForActor(actor, "Mystic").map((option) => option.id)).toEqual(["way-of-embers"]);
    expect(dnd5eSrdAdvancementFeatGrant("Mystic", 4, actor)).toBeUndefined();
    expect(dnd5eSrdAdvancementFeatGrant("Mystic", 5, actor)).toBe("general");

    const advanced = applyDnd5eSrdAdvancement(actor, "level-up", { subclassId: "way-of-embers" });
    expect(advanced).toMatchObject({
      level: 3,
      subclasses: { Mystic: "way-of-embers" },
      subclass: "Way of Embers",
      hp: { current: 18, max: 18 },
      hitDice: { current: 3, max: 3, size: "d8" },
      spellSlots: { level1: { max: 4 }, level2: { max: 2 } },
    });
    expect(advanced.features).toEqual(expect.arrayContaining(["Mystic Practice", "Focused Channel", "Way of Embers", "Ember Focus"]));
    expect(advanced.features).not.toContain("Fighting Style");
  });
});
