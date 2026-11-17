import { describe, expect, it } from "vitest";
import { dnd5eSrdCharacterImport } from "./index.js";

describe("D&D character import compatibility", () => {
  it("normalizes common ability, spell, and slot fields without silently dropping them", () => {
    const imported = dnd5eSrdCharacterImport({
      name: "Orin Glass",
      data: {
        class: "Wizard",
        level: 1,
        hp: { current: 8, max: 8 },
        armorClass: 12,
        abilities: {
          strength: 8,
          dexterity: 14,
          constitution: 13,
          intelligence: 17,
          wisdom: 12,
          charisma: 10
        },
        spellbook: ["Fire Bolt", "Mage Hand", "Magic Missile", "Shield", "Sleep"],
        preparedSpells: ["Magic Missile", "Shield", "Sleep"],
        spellSlots: { "1": { current: 1, max: 2 } }
      }
    });

    expect(imported.data.attributes).toEqual({
      strength: 8,
      dexterity: 14,
      constitution: 13,
      intelligence: 17,
      wisdom: 12,
      charisma: 10
    });
    expect(imported.data.spellSlots).toEqual({ level1: { current: 1, max: 2, recovery: "long" } });
    expect(imported.data.spellcasting).toEqual(expect.objectContaining({
      className: "Wizard",
      ability: "intelligence",
      cantrips: ["fire-bolt", "mage-hand"],
      preparedSpells: ["magic-missile", "shield", "sleep"],
      spellbookSpells: ["magic-missile", "shield", "sleep"],
      preparedSpellCapacity: 4,
      preparedSpellCapacityLevel: 1
    }));

    expect(imported.items.map((item) => item.entryId)).toEqual([
      "fire-bolt",
      "mage-hand",
      "magic-missile",
      "shield",
      "sleep"
    ]);
    expect(imported.items.find((item) => item.entryId === "fire-bolt")?.data).toEqual(expect.objectContaining({
      classSpell: true,
      cantrip: true,
      known: true,
      prepared: true,
      spellcastingAbility: "intelligence"
    }));
    expect(imported.items.find((item) => item.entryId === "magic-missile")?.data).toEqual(expect.objectContaining({
      classSpell: true,
      inSpellbook: true,
      prepared: true,
      preparedForClass: "Wizard",
      spellcastingAbility: "intelligence"
    }));
    expect(imported.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Normalized abilities to attributes"),
      "Normalized spell slot keys: 1 to level1.",
      expect.stringContaining("Imported Armor Class 12")
    ]));
  });

  it("reports spell references that cannot be normalized", () => {
    const imported = dnd5eSrdCharacterImport({
      name: "Unknown Spell Tester",
      data: { class: "Wizard", level: 1, spellbook: ["Definitely Not A Spell"] }
    });

    expect(imported.items).toEqual([]);
    expect(imported.warnings).toContain("Unknown spell skipped from spellbook: Definitely Not A Spell");
  });
});
