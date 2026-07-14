import { createTimestamped, type Actor, type CompendiumProvenance } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import {
  buildDndMonsterVariant,
  dnd5eCustomMonsterActorData,
  dnd5eMonsterContentDataFromStatBlock,
  validateDndMonsterTemplateOverrides,
  type DndMonsterBase,
  type DndMonsterVariantDraft,
} from "./dnd-monster-variants.js";
import { dnd5eSrdSheet } from "./index.js";
import { validateDnd5eSrdActor } from "./dnd-validation-preview.js";

const provenance: CompendiumProvenance = {
  sourceKind: "srd",
  sourceName: "Dungeons & Dragons System Reference Document",
  sourceVersion: "5.2.1",
  contentVersion: "5.2.1",
  systemId: "dnd-5e-srd",
  systemVersion: "5.2.1",
  rulesVersion: "SRD 5.2.1",
  license: { name: "CC BY 4.0", usage: "srd" },
};

const base: DndMonsterBase = {
  kind: "bundled",
  id: "guard",
  version: "5.2.1",
  name: "Guard",
  provenance,
  data: {
    size: "medium",
    creatureType: "Humanoid",
    alignment: "Any Alignment",
    armorClass: 16,
    initiative: 1,
    hitPoints: 11,
    hitDice: "2d8+2",
    challengeRating: "1/8",
    xp: 25,
    proficiencyBonus: 2,
    speed: { walk: 30 },
    abilities: { strength: 13, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 11, charisma: 10 },
    savingThrows: {},
    skills: { perception: 2 },
    senses: ["Passive Perception 12"],
    languages: ["Common"],
    gear: ["Spear", "Shield"],
    traits: [],
    actions: [{ name: "Spear", description: "Melee or ranged attack.", kind: "action", attackBonus: 3, damageFormula: "1d6+1", damageType: "piercing" }],
    reactions: [],
    legendaryActions: [],
  },
};

function variantDraft(overrides: DndMonsterVariantDraft["overrides"]): DndMonsterVariantDraft {
  return {
    name: "Veteran Guard",
    summary: "A campaign veteran derived from the immutable SRD guard.",
    sourceName: "Demo campaign",
    sourceVersion: "1",
    contentVersion: "1.0.0",
    license: { name: "Private home game", usage: "private_home_game" },
    base: { kind: "bundled", id: "guard", version: "5.2.1" },
    template: { id: "itm_elite", version: "2026-07-14T00:00:00.000Z" },
    overrides,
  };
}

describe("D&D monster variants and templates", () => {
  it("accepts only typed allow-listed template fields without mutating the source", () => {
    const input = { armorClass: 18, abilities: { strength: 16 }, exploit: { script: "nope" } };
    const before = structuredClone(input);
    const invalid = validateDndMonsterTemplateOverrides(input);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors).toContainEqual(expect.objectContaining({ path: "overrides.exploit", code: "unsupported_override" }));
    expect(input).toEqual(before);

    const valid = validateDndMonsterTemplateOverrides({ languages: ["Common", "Dwarvish"], manualAdjudication: "Veteran morale is resolved by the GM." });
    expect(valid).toMatchObject({ ok: true, overrides: { languages: ["Common", "Dwarvish"] } });
  });

  it("requires explicit CR and XP for combat-bearing changes instead of inferring either", () => {
    const result = buildDndMonsterVariant({
      id: "custom-veteran-guard",
      draft: variantDraft({ hitPoints: 44 }),
      base,
      template: {
        id: "itm_elite",
        version: "2026-07-14T00:00:00.000Z",
        name: "Elite defender",
        description: "Raises defensive staying power.",
        overrides: { armorClass: 18 },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "explicit_rating_required" }),
      expect.objectContaining({ code: "explicit_xp_required" }),
    ]));
  });

  it("snapshots base/template provenance, explicit overrides, exact diff, and leaves the base unchanged", () => {
    const before = structuredClone(base);
    const result = buildDndMonsterVariant({
      id: "custom-veteran-guard",
      draft: variantDraft({ hitPoints: 44, challengeRating: "2", xp: 450, languages: ["Common", "Dwarvish"] }),
      base,
      template: {
        id: "itm_elite",
        version: "2026-07-14T00:00:00.000Z",
        name: "Elite defender",
        description: "Raises defensive staying power.",
        overrides: { armorClass: 18, challengeRating: "1", xp: 200 },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.data).toMatchObject({
      armorClass: 18,
      hitPoints: 44,
      challengeRating: "2",
      xp: 450,
      monsterVariant: {
        schemaVersion: "1.0.0",
        base: { kind: "bundled", id: "guard", version: "5.2.1", provenance: { sourceKind: "srd" } },
        template: { id: "itm_elite", version: "2026-07-14T00:00:00.000Z", overrides: { armorClass: 18, challengeRating: "1", xp: 200 } },
        overrides: { hitPoints: 44, challengeRating: "2", xp: 450, languages: ["Common", "Dwarvish"] },
        appliedOverrides: { armorClass: 18, hitPoints: 44, challengeRating: "2", xp: 450 },
      },
    });
    expect(result.diff).toEqual(expect.arrayContaining([
      { path: "data.armorClass", before: 16, after: 18 },
      { path: "data.hitPoints", before: 11, after: 44 },
      { path: "data.challengeRating", before: "1/8", after: "2" },
      { path: "data.xp", before: 25, after: 450 },
    ]));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "cr_xp_not_inferred" }));
    expect(base).toEqual(before);

    const actorData = dnd5eCustomMonsterActorData(result.entry);
    expect(actorData).toMatchObject({
      hp: { current: 44, max: 44 },
      armorClass: 18,
      challengeRating: "2",
      xp: 450,
      monster: { threatId: "custom-veteran-guard", variant: { base: { id: "guard" } }, statBlock: { actions: [expect.objectContaining({ name: "Spear", attackBonus: 3 })] } },
    });
  });

  it("converts bundled stat blocks without discarding structured combat metadata", () => {
    expect(dnd5eMonsterContentDataFromStatBlock({
      size: "Large",
      creatureType: "Dragon",
      alignment: "Chaotic Evil",
      armorClass: 18,
      initiative: 4,
      hitPoints: 200,
      hitDice: "16d10+112",
      speed: "40 ft., Climb 40 ft., Fly 80 ft.",
      challengeRating: "12",
      xp: 8400,
      proficiencyBonus: 4,
      abilities: { strength: 23 },
      saves: { dexterity: 8 },
      actions: [{ name: "Bite", kind: "action", attackBonus: 10, damageFormula: "2d10+6", damageType: "piercing", summary: "A vicious bite." }],
    })).toMatchObject({
      size: "large",
      speed: { walk: 40, climb: 40, fly: 80 },
      actions: [{ name: "Bite", description: "A vicious bite.", kind: "action", attackBonus: 10, damageFormula: "2d10+6", damageType: "piercing" }],
    });
  });

  it("keeps fractional CR numeric for validation and produces the normal monster sheet roll path", () => {
    const draft = { ...variantDraft({ languages: ["Common", "Dwarvish"] }), template: undefined };
    const result = buildDndMonsterVariant({ id: "custom-guard-linguist", draft, base });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = dnd5eCustomMonsterActorData(result.entry)!;
    expect(data).toMatchObject({ level: 0.125, challengeRating: "1/8", xp: 25 });
    const actor = createTimestamped("act", {
      id: "act_custom_guard",
      campaignId: "camp",
      systemId: "dnd-5e-srd",
      ownerUserId: "gm",
      type: "monster",
      name: result.entry.name,
      data,
      permissions: {},
    }) satisfies Actor;

    const validation = validateDnd5eSrdActor(actor);
    expect(validation.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(dnd5eSrdSheet(actor, []).quickRolls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "monster-spear-attack", label: "Spear Attack", formula: "1d20+3" }),
      expect.objectContaining({ id: "monster-spear-damage", label: "Spear Damage", formula: "1d6+1" }),
    ]));
  });
});
