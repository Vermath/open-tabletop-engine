import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdvancementSpellChoices,
  advancementSpellChoicePayload,
  advancementSpellPathFor,
  advancementSpellSelectionStatus,
  type AdvancementSpellAcquisitionMode,
  type AdvancementSpellPathInfo
} from "./advancement-spell-choices.js";

const profiles: Array<{ className: string; ability: AdvancementSpellPathInfo["spellcastingAbility"]; mode: AdvancementSpellAcquisitionMode; capacity: number; additions: number }> = [
  { className: "Bard", ability: "charisma", mode: "prepared-class-level", capacity: 5, additions: 0 },
  { className: "Cleric", ability: "wisdom", mode: "prepared-long-rest", capacity: 5, additions: 0 },
  { className: "Druid", ability: "wisdom", mode: "prepared-long-rest", capacity: 5, additions: 0 },
  { className: "Paladin", ability: "charisma", mode: "prepared-long-rest", capacity: 3, additions: 0 },
  { className: "Ranger", ability: "wisdom", mode: "prepared-long-rest", capacity: 3, additions: 0 },
  { className: "Sorcerer", ability: "charisma", mode: "prepared-class-level", capacity: 4, additions: 0 },
  { className: "Warlock", ability: "charisma", mode: "prepared-class-level", capacity: 3, additions: 0 },
  { className: "Wizard", ability: "intelligence", mode: "spellbook", capacity: 5, additions: 2 }
];

function pathFor(profile: typeof profiles[number]): AdvancementSpellPathInfo {
  return {
    className: profile.className,
    nextClassLevel: 2,
    spellcastingAbility: profile.ability,
    acquisitionMode: profile.mode,
    maxSpellLevel: 1,
    preparedSpellCapacity: profile.capacity,
    spellbookAdditions: profile.additions,
    eligibleSpells: Array.from({ length: 9 }, (_, index) => ({
      id: `${profile.className.toLowerCase()}-spell-${index + 1}`,
      name: `${profile.className} Spell ${index + 1}`,
      level: 1,
      school: index % 2 === 0 ? "evocation" : "abjuration",
      ritual: index === 0,
      classes: [profile.className],
      source: "SRD 5.2.1"
    }))
  };
}

describe("all-class spell advancement choices", () => {
  it.each(profiles)("requires and renders the exact $className level-two profile", (profile) => {
    const path = pathFor(profile);
    const existingBook = profile.className === "Wizard" ? path.eligibleSpells.slice(0, 5).map((spell) => spell.id) : [];
    const additions = profile.className === "Wizard" ? path.eligibleSpells.slice(5, 7).map((spell) => spell.id) : [];
    const prepared = profile.className === "Wizard" ? existingBook : path.eligibleSpells.slice(0, profile.capacity).map((spell) => spell.id);
    expect(advancementSpellSelectionStatus(path, prepared, additions, existingBook)).toEqual(expect.objectContaining({
      complete: true,
      preparedCount: profile.capacity,
      preparedRequired: profile.capacity,
      spellbookAdditionCount: profile.additions,
      spellbookAdditionsRequired: profile.additions
    }));
    const html = renderToStaticMarkup(createElement(AdvancementSpellChoices, {
      path,
      preparedSpellIds: prepared,
      wizardSpellbookAdditions: additions,
      existingSpellbookIds: existingBook,
      canChoose: true,
      onPreparedSpellIdsChange: () => undefined,
      onWizardSpellbookAdditionsChange: () => undefined
    }));
    expect(html).toContain(`${profile.className} level 2 spells`);
    expect(html).toContain(`Choose exactly ${profile.capacity} normal prepared spell`);
    expect(html).toContain(`${profile.className} spell choices are complete.`);
    expect(html).toContain(`${profile.ability[0]!.toUpperCase()}${profile.ability.slice(1)}`);
  });

  it("requires exactly two new Wizard additions and prepares only from the resulting book", () => {
    const path = pathFor(profiles.at(-1)!);
    const existingBook = path.eligibleSpells.slice(0, 5).map((spell) => spell.id);
    const additions = path.eligibleSpells.slice(5, 7).map((spell) => spell.id);
    expect(advancementSpellSelectionStatus(path, existingBook, additions.slice(0, 1), existingBook).error).toContain("exactly 2");
    expect(advancementSpellSelectionStatus(path, [...existingBook.slice(0, 4), path.eligibleSpells[8]!.id], additions, existingBook).error).toContain("resulting spellbook");
    expect(advancementSpellSelectionStatus(path, existingBook, [existingBook[0]!, additions[0]!], existingBook).error).toContain("not already");
    expect(advancementSpellChoicePayload(path, existingBook, additions)).toEqual({
      classPreparedSpellChoices: existingBook,
      wizardSpellbookAdditions: additions
    });
  });

  it("selects the exact class-and-level path when switching to an eligible multiclass", () => {
    const bard = pathFor(profiles[0]!);
    const wizard = pathFor(profiles.at(-1)!);
    expect(advancementSpellPathFor([bard, wizard], "wizard", 2)).toBe(wizard);
    expect(advancementSpellPathFor([bard, wizard], "Wizard", 3)).toBeUndefined();
    expect(advancementSpellChoicePayload(undefined, ["ignored"], ["ignored"])).toEqual({});
  });

  it("excludes always-prepared spells from the normal prepared count", () => {
    const path = pathFor(profiles[1]!);
    const prepared = path.eligibleSpells.slice(0, path.preparedSpellCapacity).map((spell) => spell.id);
    expect(advancementSpellSelectionStatus(path, prepared, [], [], [prepared[0]!]).error).toContain("Always-prepared");
  });
});
