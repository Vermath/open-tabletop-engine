import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  applyDnd5eSrdFeat,
  dnd5eSrdAdvancementEligibleFeats,
  dnd5eSrdAdvancementFeatEligibility,
  previewDnd5eSrdRules
} from "./index.js";

function fighter(data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_feat_eligibility",
    campaignId: "camp_feat_eligibility",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Feat Fighter",
    data: {
      ruleset: "SRD 5.2.1",
      class: "Fighter",
      level: 3,
      attributes: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      hp: { current: 28, max: 28 },
      hitDice: { current: 3, max: 3, size: "d10" },
      features: ["Fighting Style", "Second Wind"],
      feats: [],
      ...data
    },
    permissions: {},
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z"
  };
}

describe("D&D SRD advancement feat eligibility", () => {
  it("offers only qualifying general feats at level 4", () => {
    const actor = fighter();
    const context = { nextClassLevel: 4, nextCharacterLevel: 4 };
    const choices = dnd5eSrdAdvancementEligibleFeats(actor, context);

    expect(choices.map((feat) => feat.id)).toEqual(expect.arrayContaining(["ability-score-improvement", "grappler"]));
    expect(choices.some((feat) => feat.category === "fighting-style")).toBe(false);
    expect(choices.some((feat) => feat.category === "epic-boon")).toBe(false);
    expect(dnd5eSrdAdvancementFeatEligibility(actor, "boon-of-fortitude", context)).toEqual(expect.objectContaining({ eligible: false }));
    expect(dnd5eSrdAdvancementFeatEligibility(actor, "fighting-style-archery", context).reasons).toContain("Fighting Style: Archery cannot be selected through Ability Score Improvement advancement");

    const belowGrapplerPrerequisite = fighter({
      attributes: { strength: 12, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 }
    });
    expect(dnd5eSrdAdvancementFeatEligibility(belowGrapplerPrerequisite, "grappler", context).reasons).toContain("Grappler requires Strength or Dexterity 13");

    const preview = previewDnd5eSrdRules({
      operation: "advancement",
      actor,
      hitPointMode: "fixed",
      featId: "boon-of-fortitude",
      abilityChoices: { strength: 1 }
    });
    expect(preview.status).toBe("blocked");
    expect(preview.blockers).toContainEqual(expect.objectContaining({ path: "/featId", code: "rules.feat_ineligible" }));
    expect(preview.proposedData).toBeUndefined();
  });

  it("offers Epic Boons only for the level-19 advancement", () => {
    const actor = fighter({ level: 18 });
    const levelNineteen = { nextClassLevel: 19, nextCharacterLevel: 19 };
    expect(dnd5eSrdAdvancementFeatEligibility(actor, "boon-of-fortitude", levelNineteen)).toEqual({
      featId: "boon-of-fortitude",
      eligible: true,
      reasons: []
    });
    expect(dnd5eSrdAdvancementEligibleFeats(actor, levelNineteen).some((feat) => feat.id === "boon-of-fortitude")).toBe(true);
  });

  it("rejects duplicate non-repeatable feats before any effect and permits repeatable ASI", () => {
    const duplicateGrappler = fighter({ level: 4, feats: ["grappler"], features: ["Fighting Style", "Second Wind", "Grappler"] });
    const beforeGrappler = structuredClone(duplicateGrappler.data);
    expect(() => applyDnd5eSrdFeat(duplicateGrappler, "grappler", { abilities: { strength: 1 } })).toThrow("not repeatable");
    expect(duplicateGrappler.data).toEqual(beforeGrappler);

    const duplicateBoon = fighter({
      level: 19,
      hp: { current: 100, max: 100 },
      feats: ["boon-of-fortitude"],
      features: ["Fighting Style", "Second Wind", "Boon of Fortitude"]
    });
    const beforeBoon = structuredClone(duplicateBoon.data);
    expect(() => applyDnd5eSrdFeat(duplicateBoon, "boon-of-fortitude", { abilities: { strength: 1 } })).toThrow("not repeatable");
    expect(duplicateBoon.data).toEqual(beforeBoon);

    const repeatAsi = fighter({ level: 8, feats: ["ability-score-improvement"], features: ["Fighting Style", "Second Wind", "Ability Score Improvement"] });
    const applied = applyDnd5eSrdFeat(repeatAsi, "ability-score-improvement", { abilities: { constitution: 2 } });
    expect(applied.attributes).toEqual(expect.objectContaining({ constitution: 16 }));
  });
});
