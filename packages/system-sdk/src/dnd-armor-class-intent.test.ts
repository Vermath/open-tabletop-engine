import type { Actor, CalculationOverride, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DND_5E_SRD_ARMOR_CLASS_INTENT_KEY,
  applyDnd5eSrdCalculationOverridesToSheet,
  buildDnd5eSrdCalculationOverrideContext,
  classifyDnd5eSrdStoredArmorClass,
  dnd5eSrdArmorClass,
  dnd5eSrdCalculationExplanation,
  dnd5eSrdCharacterImport,
  dnd5eSrdSheet,
} from "./index.js";

const now = "2026-07-15T20:00:00.000Z";

function actor(data: Record<string, unknown> = {}, type = "character"): Actor {
  return {
    id: `act_${type}`,
    campaignId: "camp_ac",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type,
    name: type === "monster" ? "Exact Monster" : "Derived Hero",
    data: { class: "Fighter", level: 1, attributes: { strength: 14, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 }, hp: { current: 10, max: 10 }, ...data },
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

function item(owner: Actor, id: string, name: string, data: Record<string, unknown>): Item {
  return { id, campaignId: owner.campaignId, systemId: owner.systemId, actorId: owner.id, type: "equipment", name, data: { quantity: 1, equipped: true, ...data }, createdAt: now, updatedAt: now };
}

describe("D&D stored Armor Class intent", () => {
  it("derives characters with no scalar and refuses to infer authority from finite stale scalars", () => {
    const clean = actor();
    const stale = actor({ armorClass: 19 });
    const equal = actor({ armorClass: 12 });

    expect(dnd5eSrdSheet(clean).data.armorClass).toBe(12);
    expect(classifyDnd5eSrdStoredArmorClass(clean, 12)).toEqual({ kind: "derived", derivedValue: 12 });
    expect(dnd5eSrdSheet(stale).data).toMatchObject({ armorClass: 12, armorClassDetails: { requiresReview: true, legacyStoredValue: 19 } });
    expect(dnd5eSrdCalculationExplanation(stale).fields.find((field) => field.id === "armor-class")).toMatchObject({ result: 12, flags: { override: false, ambiguous: true, manual: true } });
    expect(classifyDnd5eSrdStoredArmorClass(equal, 12)).toEqual({ kind: "legacy-equal", derivedValue: 12, storedValue: 12 });
    expect(dnd5eSrdCalculationExplanation(equal).fields.find((field) => field.id === "armor-class")).toMatchObject({ result: 12, flags: { override: false, ambiguous: false } });
  });

  it("preserves exact monster stat-block AC without treating it as a character override", () => {
    const monster = actor({ armorClass: 17, attributes: { dexterity: 8 } }, "monster");
    expect(dnd5eSrdArmorClass(monster).value).toBe(9);
    expect(dnd5eSrdSheet(monster).data).toMatchObject({ armorClass: 17, armorClassDetails: { value: 17, armorName: "Monster stat block", monsterStatBlock: true } });
    expect(dnd5eSrdCalculationExplanation(monster).fields.find((field) => field.id === "armor-class")).toMatchObject({ result: 17, terms: [expect.objectContaining({ label: "Monster stat-block Armor Class", signedValue: 17 })], flags: { override: false } });
  });

  it("recalculates across equipment, shield, Dexterity, and competing base calculations", () => {
    const fighter = actor();
    const leather = item(fighter, "itm_leather", "Leather Armor", { armorBase: 11 });
    const shield = item(fighter, "itm_shield", "Shield", { armorBonus: 2 });
    expect(dnd5eSrdSheet(fighter, [leather, shield]).data.armorClass).toBe(15);
    shield.data = { ...shield.data, equipped: false };
    expect(dnd5eSrdSheet(fighter, [leather, shield]).data.armorClass).toBe(13);
    fighter.data = { ...fighter.data, attributes: { ...(fighter.data.attributes as Record<string, unknown>), dexterity: 18 } };
    expect(dnd5eSrdSheet(fighter, [leather, shield]).data.armorClass).toBe(15);

    const monk = actor({ class: "Monk", classes: [{ name: "Monk", level: 1 }], attributes: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 } });
    expect(dnd5eSrdSheet(monk).data).toMatchObject({ armorClass: 16, armorClassDetails: { armorName: "Unarmored Defense" } });
    expect(dnd5eSrdSheet(monk, [item(monk, "itm_chain", "Chain Mail", { armorBase: 16, dexBonus: false })]).data).toMatchObject({ armorClass: 16, armorClassDetails: { armorName: "Chain Mail" } });
  });

  it("preserves versioned import intent and flags unversioned or invalid legacy scalars", () => {
    const legacy = dnd5eSrdCharacterImport({ name: "Legacy", data: { armorClass: 18, attributes: { dexterity: 14 } } });
    expect(legacy.data.armorClass).toBe(18);
    expect(legacy.warnings).toEqual(expect.arrayContaining([expect.stringContaining("requires GM review")]));

    const intentional = dnd5eSrdCharacterImport({
      name: "Intentional",
      data: { armorClass: 18, [DND_5E_SRD_ARMOR_CLASS_INTENT_KEY]: { version: 1, mode: "override", source: "house_rule", reason: "Campaign defense floor" } },
    });
    expect(intentional.data).toMatchObject({ armorClass: 18, armorClassIntent: { version: 1, mode: "override", source: "house_rule", reason: "Campaign defense floor" } });
    expect(intentional.warnings.some((warning) => warning.includes("requires GM review"))).toBe(false);

    const invalid = dnd5eSrdCharacterImport({ data: { armorClass: 18, armorClassIntent: { version: 0, mode: "override", source: "gm_manual", reason: "Old shape" } } });
    expect(invalid.data.armorClass).toBe(18);
    expect(invalid.data.armorClassIntent).toBeUndefined();
    expect(invalid.warnings).toEqual(expect.arrayContaining([expect.stringContaining("requires GM review")]));
  });

  it("uses the T24 effective context and returns to derived AC when the reasoned override is removed", () => {
    const source = actor();
    const explanation = dnd5eSrdCalculationExplanation(source);
    const field = explanation.fields.find((candidate) => candidate.id === "armor-class")!;
    const override: CalculationOverride = { id: "calc_ac", campaignId: source.campaignId, actorId: source.id, systemId: source.systemId, rulesVersion: explanation.rulesVersion, fieldId: field.id, source: "gm_manual", baseValue: field.result, effectiveValue: 20, reason: "Blessing from the city watch", createdByUserId: "usr_gm", createdAt: now, updatedAt: now };
    const withOverride = applyDnd5eSrdCalculationOverridesToSheet(dnd5eSrdSheet(source), buildDnd5eSrdCalculationOverrideContext(explanation, [override]));
    expect(withOverride.data).toMatchObject({ armorClass: 20, armorClassDetails: { calculationOverride: true, calculationOverrideReason: "Blessing from the city watch", calculationOverrideBaseValue: 12, calculationOverrideEffectiveValue: 20 } });
    const afterRemoval = applyDnd5eSrdCalculationOverridesToSheet(dnd5eSrdSheet(source), buildDnd5eSrdCalculationOverrideContext(explanation, [{ ...override, clearedAt: now }]));
    expect(afterRemoval.data).toMatchObject({ armorClass: 12, armorClassDetails: { value: 12 } });
    expect((afterRemoval.data.armorClassDetails as Record<string, unknown>).calculationOverride).toBeUndefined();
  });
});
