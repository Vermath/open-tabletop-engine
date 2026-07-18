import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { dnd5eSrdActionRolls, dnd5eSrdClassSpellGrantData, dnd5eSrdSpellcastingClassProfile } from "./index.js";

const timestamp = "2026-07-17T00:00:00.000Z";
const multiclassActor: Actor = {
  id: "actor-spell-grants",
  campaignId: "campaign-spell-grants",
  systemId: "dnd-5e-srd",
  type: "character",
  name: "Bard Wizard",
  data: {
    class: "Bard",
    level: 2,
    classes: [{ className: "Bard", level: 1 }, { className: "Wizard", level: 1 }],
    attributes: { strength: 8, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 10, charisma: 18 },
    proficiencyBonus: 2,
    conditions: [],
    spellSlots: { level1: { current: 2, max: 2 } }
  },
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp
};

function spell(id: string, grant: ReturnType<typeof dnd5eSrdClassSpellGrantData>): Item {
  return {
    id,
    campaignId: multiclassActor.campaignId,
    actorId: multiclassActor.id,
    systemId: multiclassActor.systemId,
    type: "spell",
    name: "Attributed Bolt",
    data: { level: 1, action: "action", spellAttack: true, damageFormula: "1d8", damageType: "force", ...grant },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("class spell grant provenance", () => {
  it("publishes complete profiles for every SRD spellcasting class", () => {
    const expected = { Bard: "charisma", Cleric: "wisdom", Druid: "wisdom", Paladin: "charisma", Ranger: "wisdom", Sorcerer: "charisma", Warlock: "charisma", Wizard: "intelligence" };
    for (const [className, ability] of Object.entries(expected)) {
      expect(dnd5eSrdSpellcastingClassProfile(className, 2)).toEqual(expect.objectContaining({ className, classLevel: 2, spellcastingAbility: ability, maxSpellLevel: 1 }));
    }
    expect(dnd5eSrdSpellcastingClassProfile("Wizard", 1)).toEqual(expect.objectContaining({ preparedSpellCapacity: 4, spellbookAdditions: 6 }));
    expect(dnd5eSrdSpellcastingClassProfile("Wizard", 2)).toEqual(expect.objectContaining({ preparedSpellCapacity: 5, spellbookAdditions: 2 }));
  });

  it("uses the granting class ability instead of the multiclass actor's primary class", () => {
    const wizard = spell("wizard-spell", dnd5eSrdClassSpellGrantData({ compendiumEntryId: "attributed-bolt", className: "Wizard", selectedAtLevel: 1, prepared: true, inSpellbook: true }));
    const bard = spell("bard-spell", dnd5eSrdClassSpellGrantData({ compendiumEntryId: "attributed-bolt", className: "Bard", selectedAtLevel: 1, prepared: true }));
    expect(dnd5eSrdActionRolls(multiclassActor, [wizard]).find((roll) => roll.id === "spell-wizard-spell-attack")).toEqual(expect.objectContaining({ formula: "1d20+2", metadata: expect.objectContaining({ ability: "intelligence" }) }));
    expect(dnd5eSrdActionRolls(multiclassActor, [bard]).find((roll) => roll.id === "spell-bard-spell-attack")).toEqual(expect.objectContaining({ formula: "1d20+6", metadata: expect.objectContaining({ ability: "charisma" }) }));
  });

  it("rejects incomplete or non-SRD class provenance", () => {
    expect(() => dnd5eSrdClassSpellGrantData({ compendiumEntryId: "", className: "Wizard", selectedAtLevel: 1, prepared: true, inSpellbook: true })).toThrow(/compendium entry id/);
    expect(() => dnd5eSrdClassSpellGrantData({ compendiumEntryId: "custom", className: "Artificer", selectedAtLevel: 1, prepared: true })).toThrow(/not a supported SRD spellcasting grant source/);
    expect(() => dnd5eSrdClassSpellGrantData({ compendiumEntryId: "custom", className: "Wizard", selectedAtLevel: 1, prepared: true })).toThrow(/spellbook/);
  });
});
