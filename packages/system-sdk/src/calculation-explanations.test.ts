import type { Actor, CalculationFieldExplanation, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { DND_5E_SRD_VERSION, dnd5eSrdCalculationExplanation } from "./index.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function actor(data: Record<string, unknown>, overrides: Partial<Actor> = {}): Actor {
  return {
    id: "actor-calculation",
    campaignId: "campaign-calculation",
    systemId: "dnd-5e-srd",
    ownerUserId: "user-1",
    type: "character",
    name: "Calculation Hero",
    data: { ruleset: DND_5E_SRD_VERSION, conditions: [], ...data },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function item(id: string, name: string, data: Record<string, unknown>): Item {
  return {
    id,
    campaignId: "campaign-calculation",
    systemId: "dnd-5e-srd",
    actorId: "actor-calculation",
    type: "item",
    name,
    data: { quantity: 1, equipped: true, ...data },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function field(fields: CalculationFieldExplanation[], id: string): CalculationFieldExplanation {
  const found = fields.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing calculation field ${id}`);
  return found;
}

describe("D&D SRD calculation explanations", () => {
  it("explains exact level-one ability, defense, health, save, expertise, passive, speed, and roll math", () => {
    const rogue = actor({
      class: "Rogue",
      level: 1,
      attributes: { strength: 10, dexterity: 16, constitution: 14, intelligence: 12, wisdom: 14, charisma: 8 },
      hp: { current: 8, max: 10 },
      temporaryHitPoints: 3,
      speed: 30,
      saveProficiencies: ["dexterity", "intelligence"],
      skillProficiencies: ["perception", "stealth"],
      skillExpertise: ["perception"]
    });
    const leather = item("leather", "Leather Armor", { armorBase: 11, dexBonus: true });
    const explanation = dnd5eSrdCalculationExplanation(rogue, [leather]);

    expect(explanation).toMatchObject({ systemId: "dnd-5e-srd", systemVersion: "5.2.1", rulesVersion: "SRD 5.2.1" });
    expect(field(explanation.fields, "ability.dexterity.score").result).toBe(16);
    expect(field(explanation.fields, "ability.dexterity.modifier")).toMatchObject({ result: 3, terms: [{ signedValue: 16 }, { formula: "floor((score - 10) / 2)" }] });
    expect(field(explanation.fields, "proficiency-bonus").result).toBe(2);
    expect(field(explanation.fields, "armor-class")).toMatchObject({ result: 14, terms: [{ signedValue: 11, source: { id: "leather" } }, { signedValue: 3 }] });
    expect(field(explanation.fields, "hit-points-maximum").result).toBe(10);
    expect(field(explanation.fields, "hit-points-current").result).toBe(8);
    expect(field(explanation.fields, "hit-points-temporary").result).toBe(3);
    expect(field(explanation.fields, "initiative").result).toBe("1d20+3");
    expect(field(explanation.fields, "saving-throw.dexterity").result).toBe("1d20+5");
    expect(field(explanation.fields, "skill.perception").result).toBe("1d20+6");
    expect(field(explanation.fields, "skill.perception").terms).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Expertise", signedValue: 4 })]));
    expect(field(explanation.fields, "passive-perception").result).toBe(16);
    expect(field(explanation.fields, "speed")).toMatchObject({ result: 30, unit: "ft" });
    expect(explanation.fields.every((entry) => entry.terms.every((term) => term.source.kind && term.source.id && term.source.name))).toBe(true);

    const overridden = dnd5eSrdCalculationExplanation({
      ...rogue,
      data: { ...rogue.data, proficiencyBonus: 3, armorClass: 18 }
    }, [leather]);
    expect(field(overridden.fields, "proficiency-bonus")).toMatchObject({
      result: 3,
      flags: { override: true },
      terms: [expect.objectContaining({ label: "Stored proficiency bonus (normalized)", source: { kind: "override", id: rogue.id, name: rogue.name } })]
    });
    expect(field(overridden.fields, "armor-class")).toMatchObject({
      result: 18,
      flags: { override: true },
      terms: [expect.objectContaining({ source: { kind: "override", id: rogue.id, name: rogue.name } })]
    });
  });

  it("uses condition and attunement-aware SDK math and exposes preserved unsupported overrides", () => {
    const cleric = actor({
      class: "Cleric",
      level: 1,
      attributes: { strength: 10, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 16, charisma: 12 },
      hp: { current: 10, max: 10 },
      speed: 30,
      saveProficiencies: ["wisdom", "charisma"],
      skillProficiencies: ["perception", "religion"],
      attunedItemIds: ["staff"],
      conditions: [{ id: "exhaustion", level: 2 }, "blessed"],
      spellSaveDc: 99
    });
    const staff = item("staff", "Attuned Staff", {
      requiresAttunement: true,
      armorClassBonus: 2,
      savingThrowBonus: 2,
      spellAttackBonus: 2,
      spellSaveDcBonus: 2
    });
    const attuned = dnd5eSrdCalculationExplanation(cleric, [staff]);

    expect(field(attuned.fields, "armor-class").result).toBe(14);
    expect(field(attuned.fields, "initiative").result).toBe("1d20-2");
    expect(field(attuned.fields, "saving-throw.wisdom").result).toBe("1d20+3+1d4");
    expect(field(attuned.fields, "saving-throw.wisdom").terms).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Saving throw bonus: Attuned Staff", signedValue: 2, source: expect.objectContaining({ id: "staff" }) }),
      expect.objectContaining({ label: "Condition adjustment", signedValue: -4, source: expect.objectContaining({ id: "exhaustion" }) }),
      expect.objectContaining({ label: "Blessed", formula: "+1d4", source: expect.objectContaining({ id: "blessed" }) })
    ]));
    expect(field(attuned.fields, "speed").result).toBe(20);
    expect(field(attuned.fields, "speed").terms).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Exhaustion penalty", signedValue: -10 })]));
    expect(field(attuned.fields, "spell-save-dc")).toMatchObject({ result: 13, flags: { unsupported: true, ambiguous: true } });
    expect(field(attuned.fields, "spell-attack-bonus").result).toBe(7);
    expect(field(attuned.fields, "spell-attack-bonus").terms).toEqual(expect.arrayContaining([expect.objectContaining({ source: expect.objectContaining({ id: "staff" }), signedValue: 2 })]));

    const unattuned = dnd5eSrdCalculationExplanation({ ...cleric, data: { ...cleric.data, attunedItemIds: [] } }, [staff]);
    expect(field(unattuned.fields, "armor-class").result).toBe(12);
    expect(field(unattuned.fields, "saving-throw.wisdom").result).toBe("1d20+1+1d4");
    expect(field(unattuned.fields, "spell-attack-bonus").result).toBe(5);
  });
});
