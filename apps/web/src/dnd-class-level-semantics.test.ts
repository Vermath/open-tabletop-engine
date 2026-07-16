import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import {
  dnd5eSrdAttacksPerAction,
  dnd5eSrdClassFeatureActionOptions,
  dnd5eSrdRageDamageBonus
} from "./actor-sheet-data.js";
import { dnd5eSrdActorClassLevels, dnd5eSrdCharacterLevel, dnd5eSrdClassLevel } from "./dnd-class-levels.js";

const timestamp = "2026-07-15T00:00:00.000Z";

function actorWithClasses(classes: Array<{ className: string; level: number }>, primary = classes[0]!.className): Actor {
  return {
    id: "act_web_multiclass",
    campaignId: "camp_web_multiclass",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Web Multiclass Test",
    data: {
      class: primary,
      level: classes.reduce((sum, entry) => sum + entry.level, 0),
      classes,
      attributes: { strength: 16, dexterity: 14, constitution: 16, intelligence: 16, wisdom: 14, charisma: 14 },
      resources: {},
      features: []
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function actionIds(actor: Actor): string[] {
  return dnd5eSrdClassFeatureActionOptions(actor).map((option) => option.rollId);
}

describe("D&D web multiclass presentation semantics", () => {
  it("mirrors case-insensitive class and character-level parsing", () => {
    const actor = actorWithClasses([{ className: "Fighter", level: 2 }, { className: "Chronomancer", level: 3 }]);
    expect(dnd5eSrdActorClassLevels(actor)).toEqual([{ className: "Fighter", level: 2 }, { className: "Chronomancer", level: 3 }]);
    expect(dnd5eSrdClassLevel(actor, "fighter")).toBe(2);
    expect(dnd5eSrdClassLevel(actor, "CHRONOMANCER")).toBe(3);
    expect(dnd5eSrdCharacterLevel(actor)).toBe(5);
  });

  it("does not use total level to unlock Fighter features", () => {
    const actor = actorWithClasses([{ className: "Fighter", level: 1 }, { className: "Wizard", level: 19 }], "Fighter");
    expect(actionIds(actor)).not.toContain("feature-action-surge");
    expect(actionIds(actor)).not.toContain("feature-tactical-mind-bonus");
  });

  it("finds a non-primary granting class in either class ordering", () => {
    const fighterFirst = actorWithClasses([{ className: "Fighter", level: 2 }, { className: "Wizard", level: 18 }], "Wizard");
    const fighterLast = actorWithClasses([{ className: "Wizard", level: 18 }, { className: "Fighter", level: 2 }], "Wizard");
    for (const actor of [fighterFirst, fighterLast]) {
      expect(actionIds(actor)).toContain("feature-action-surge");
      expect(actionIds(actor)).toContain("feature-tactical-mind-bonus");
    }
  });

  it("scales class features and Extra Attack from their granting class", () => {
    const actor = actorWithClasses([{ className: "Fighter", level: 4 }, { className: "Barbarian", level: 3 }, { className: "Wizard", level: 13 }]);
    expect(dnd5eSrdRageDamageBonus(actor)).toBe(2);
    expect(dnd5eSrdAttacksPerAction(actor)).toBe(1);

    const fighterFive = actorWithClasses([{ className: "Wizard", level: 13 }, { className: "Fighter", level: 5 }, { className: "Barbarian", level: 2 }], "Wizard");
    expect(dnd5eSrdAttacksPerAction(fighterFive)).toBe(2);
  });
});
