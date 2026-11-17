import type { Actor } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdvancementFlow, advancementAbilityAllocationStatus, advancementChoiceFieldForPath, advancementPreviewPath, advancementPreviewValue, advancementWeaponMasterySelectionStatus, invalidatedAdvancementChoiceFields, type AdvancementFeatInfo, type AdvancementWeaponMasteryInfo } from "./advancement-flow.js";

const actor = {
  id: "actor-1",
  systemId: "dnd-5e-srd",
  data: {
    attributes: {
      strength: 19,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 8
    }
  }
} as unknown as Actor;

const abilityScoreImprovement: AdvancementFeatInfo = {
  id: "ability-score-improvement",
  name: "Ability Score Improvement",
  category: "general",
  summary: "Allocate two ability points.",
  abilityPoints: 2,
  abilityChoices: [],
  maximumScore: 20
};

describe("advancement ability allocation", () => {
  it("requires the exact metadata-defined point budget", () => {
    const incomplete = advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { dexterity: 1 });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.error).toContain("Allocate 1 more");

    const complete = advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { dexterity: 1, constitution: 1 });
    expect(complete.complete).toBe(true);
    expect(complete.pointsSpent).toBe(2);
  });

  it("enforces allowed abilities and the feat maximum score", () => {
    const grappler: AdvancementFeatInfo = {
      id: "grappler",
      name: "Grappler",
      category: "general",
      summary: "Increase Strength or Dexterity.",
      abilityPoints: 1,
      abilityChoices: ["strength", "dexterity"],
      maximumScore: 20
    };

    expect(advancementAbilityAllocationStatus(actor, grappler, { wisdom: 1 }).error).toContain("cannot increase Wisdom");
    expect(advancementAbilityAllocationStatus(actor, abilityScoreImprovement, { strength: 2 }).error).toContain("cannot exceed 20");
    expect(advancementAbilityAllocationStatus(actor, grappler, { strength: 1 }).complete).toBe(true);
  });

  it("treats feats with no ability increase as fully allocated", () => {
    const feat = { ...abilityScoreImprovement, id: "alert", name: "Alert", abilityPoints: 0 };
    expect(advancementAbilityAllocationStatus(actor, feat, {}).complete).toBe(true);
  });

  it("formats sourced preview changes without hiding structured values", () => {
    expect(advancementPreviewPath("/hp/max")).toBe("Hp · Max");
    expect(advancementPreviewPath("")).toBe("Actor data");
    expect(advancementPreviewValue(undefined)).toBe("not set");
    expect(advancementPreviewValue({ current: 12, max: 20 })).toBe('{"current":12,"max":20}');
  });

  it("requires the exact eligible Weapon Mastery replacement set", () => {
    const mastery: AdvancementWeaponMasteryInfo = {
      className: "Fighter",
      nextClassLevel: 2,
      requiredCount: 3,
      requiresSelection: true,
      selectedWeaponIds: [],
      options: [
        { id: "greatsword", name: "Greatsword", mastery: "graze" },
        { id: "longbow", name: "Longbow", mastery: "slow" },
        { id: "longsword", name: "Longsword", mastery: "sap" }
      ]
    };

    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow"]).error).toContain("exactly 3");
    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow", "unknown"]).error).toContain("not an eligible");
    expect(advancementWeaponMasterySelectionStatus(mastery, ["greatsword", "longbow", "longsword"])).toMatchObject({ complete: true, selectedCount: 3 });
  });

  it("maps server blocker paths to the exact choice field and deduplicates invalidations", () => {
    expect(advancementChoiceFieldForPath("/weaponMasteryChoices/1")).toBe("weaponMastery");
    expect(advancementChoiceFieldForPath("/abilityChoices/strength")).toBe("abilityChoices");
    expect(advancementChoiceFieldForPath("/classPreparedSpellChoices/1")).toBe("preparedSpells");
    expect(advancementChoiceFieldForPath("/wizardSpellbookAdditions/0")).toBe("spellbookAdditions");
    expect(invalidatedAdvancementChoiceFields([
      { path: "/featId", code: "invalid", message: "Feat changed" },
      { path: "/abilityChoices/strength", code: "invalid", message: "Ability changed" },
      { path: "/featId", code: "invalid", message: "Feat still changed" }
    ])).toEqual(["feat", "abilityChoices"]);
  });

  it("shows an actionable load failure instead of silently removing advancement state", () => {
    const html = renderToStaticMarkup(createElement(AdvancementFlow, {
      actor,
      advancementOptions: [],
      advancementGrantsFeat: false,
      advancementFeats: [],
      multiclassOptions: [],
      subclassOptions: [],
      onAdvanceActor: () => undefined,
      canAdvanceActor: true,
      loadState: "error",
      loadError: "Network unavailable",
      onRetryLoad: () => undefined
    }));
    expect(html).toContain('aria-label="Advancement load failed"');
    expect(html).toContain("Network unavailable");
    expect(html).toContain("Retry advancement load");
  });

  it("renders the active class spell profile inside the complete advancement flow", () => {
    const spellActor = { ...actor, data: { ...actor.data, class: "Bard", level: 1 } } as Actor;
    const html = renderToStaticMarkup(createElement(AdvancementFlow, {
      actor: spellActor,
      advancementOptions: [{ id: "level-up", systemId: "dnd-5e-srd", name: "Level Up", summary: "Gain a level", nextValue: 2 }],
      advancementGrantsFeat: false,
      advancementFeats: [],
      multiclassOptions: [],
      advancementClassName: "Bard",
      nextClassLevel: 2,
      subclassOptions: [],
      spellAdvancementPaths: [{
        className: "Bard",
        nextClassLevel: 2,
        spellcastingAbility: "charisma",
        acquisitionMode: "prepared-class-level",
        maxSpellLevel: 1,
        preparedSpellCapacity: 5,
        spellbookAdditions: 0,
        eligibleSpells: Array.from({ length: 5 }, (_, index) => ({ id: `bard-${index}`, name: `Bard Spell ${index}`, level: 1, ritual: false, classes: ["Bard"], source: "SRD" }))
      }],
      onAdvanceActor: () => undefined,
      canAdvanceActor: true
    }));
    expect(html).toContain('aria-label="Bard spell advancement"');
    expect(html).toContain("Choose exactly 5 normal prepared spells");
    expect(html).toContain("Choose how to determine the hit point increase.");
  });

  it("wires exact spell selections through catalog, prepared preview, and commit recovery", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    const catalogSource = readFileSync(resolve(__dirname, "advancement-catalog.ts"), "utf8");
    const flowSource = readFileSync(resolve(__dirname, "advancement-flow.tsx"), "utf8");
    expect(catalogSource).toContain("result.spellAdvancement?.paths ?? []");
    expect(flowSource).toContain("...advancementSpellChoicePayload(activeSpellPath");
    expect(flowSource).toContain("request.classPreparedSpellChoices");
    expect(flowSource).toContain("request.wizardSpellbookAdditions");
    expect(appSource).toContain("choices.classPreparedSpellChoices");
    expect(appSource).toContain("choices.wizardSpellbookAdditions");
    expect(appSource).toContain("preparedPreviewKey");
  });
});
