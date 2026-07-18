import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CharacterCreatorSpellOptions,
  updateCharacterCreatorSpellChoices
} from "./character-creator-dialog.js";

const spells = [
  { id: "magic-missile", name: "Magic Missile" },
  { id: "shield", name: "Shield" }
];

describe("character creator spell-choice accessibility", () => {
  it("gives the same spell a unique accessible name in each choice source", () => {
    const html = renderToStaticMarkup(createElement(Fragment, undefined,
      createElement(CharacterCreatorSpellOptions, {
        groupLabel: "Wizard spellbook",
        spells,
        selectedSpellIds: ["magic-missile"],
        capacity: 2,
        onSelectionChange: () => undefined
      }),
      createElement(CharacterCreatorSpellOptions, {
        groupLabel: "Wizard prepared spell",
        spells,
        selectedSpellIds: ["magic-missile"],
        capacity: 1,
        onSelectionChange: () => undefined
      })
    ));

    expect(html).toContain('role="group" aria-label="Wizard spellbook choices"');
    expect(html).toContain('aria-label="Wizard spellbook: Magic Missile"');
    expect(html).toContain('role="group" aria-label="Wizard prepared spell choices"');
    expect(html).toContain('aria-label="Wizard prepared spell: Magic Missile"');
  });

  it("keeps the configured capacity exact and leaves selected spells removable", () => {
    const html = renderToStaticMarkup(createElement(CharacterCreatorSpellOptions, {
      groupLabel: "Wizard prepared spell",
      spells,
      selectedSpellIds: ["magic-missile"],
      capacity: 1,
      onSelectionChange: () => undefined
    }));

    expect(html).toMatch(/aria-label="Wizard prepared spell: Magic Missile"[^>]*checked=""/);
    expect(html).toMatch(/aria-label="Wizard prepared spell: Shield"[^>]*disabled=""/);
    expect(updateCharacterCreatorSpellChoices(["magic-missile"], "shield", true, 1)).toEqual(["magic-missile"]);
    expect(updateCharacterCreatorSpellChoices(["magic-missile"], "magic-missile", false, 1)).toEqual([]);
  });

  it("adds each spell once without exceeding a multi-spell capacity", () => {
    expect(updateCharacterCreatorSpellChoices([], "light", true, 2)).toEqual(["light"]);
    expect(updateCharacterCreatorSpellChoices(["light"], "mage-hand", true, 2)).toEqual(["light", "mage-hand"]);
    expect(updateCharacterCreatorSpellChoices(["light", "mage-hand"], "light", true, 2)).toEqual(["mage-hand", "light"]);
  });
});
