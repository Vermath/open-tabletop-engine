import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { dnd5eSrdSheet } from "../../../packages/system-sdk/src/index.js";
import { actorActionConsequenceReview } from "./actor-action-review.js";
import { actorActionOptions, actorActionSupportsEffect } from "./actor-sheet-data.js";

const fighter: Actor = {
  id: "actor-fighter",
  campaignId: "campaign-1",
  systemId: "dnd-5e-srd",
  type: "pc",
  name: "Ari",
  permissions: {},
  data: { class: "Fighter", level: 2, resources: { actionSurge: { current: 1, max: 1 } } },
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

const sorcerer: Actor = {
  ...fighter,
  id: "actor-sorcerer",
  name: "Sera",
  data: {
    class: "Sorcerer",
    level: 5,
    proficiencyBonus: 3,
    attributes: { charisma: 18 },
    spellSlots: { level1: { current: 4, max: 4, recovery: "long" } }
  }
};

const chromaticOrb: Item = {
  id: "spell-chromatic-orb",
  campaignId: sorcerer.campaignId,
  systemId: sorcerer.systemId,
  actorId: sorcerer.id,
  type: "spell",
  name: "Chromatic Orb",
  data: { level: 1, spellAttack: true, damageFormula: "3d8", damageType: "choice", prepared: true },
  createdAt: sorcerer.createdAt,
  updatedAt: sorcerer.updatedAt
};

const monk: Actor = {
  ...fighter,
  id: "actor-monk",
  name: "Mara",
  data: {
    class: "Monk",
    classes: [{ name: "Monk", level: 17 }],
    level: 17,
    proficiencyBonus: 6,
    attributes: { dexterity: 18, wisdom: 16 },
    resources: { focus: { current: 17, max: 17, recovery: "short" } }
  }
};

function openHandRollIds(actor: Actor): string[] {
  return actorActionOptions(actor, [])
    .map((action) => action.rollId)
    .filter((rollId) => rollId.startsWith("feature-open-hand-"));
}

function authoritativeOpenHandRollIds(actor: Actor): string[] {
  return dnd5eSrdSheet(actor, []).quickRolls
    .map((roll) => roll.id)
    .filter((rollId) => rollId.startsWith("feature-open-hand-"));
}

describe("D&D standard Action economy UI", () => {
  it("states the exact Action Surge consequence", () => {
    expect(actorActionOptions(fighter, []).find((action) => action.rollId === "feature-action-surge")?.description)
      .toBe("Action Surge: spend one use and grant exactly one additional Action this turn");
  });

  it("keeps the authoritative Action ledger in the exact prepared-action review", () => {
    const review = actorActionConsequenceReview("Ari", {
      resolution: {
        commitMode: "preview",
        action: { label: "Longsword", kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } }
      }
    });

    expect(review.sections.find((section) => section.id === "action")?.items).toContainEqual({ label: "Turn ledger", value: "1 used; 0 Action Surge grants" });
    expect(review.source).toBe("D&D 5e SRD server resolver");
  });

  it("surfaces a spell attack separately from its on-hit damage", () => {
    const actions = actorActionOptions(sorcerer, [chromaticOrb]);
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ rollId: "spell-spell-chromatic-orb-attack", label: "Chromatic Orb Attack", description: expect.stringContaining("1d20+7") }),
      expect.objectContaining({ rollId: "spell-spell-chromatic-orb-damage", label: "Chromatic Orb Damage", description: expect.stringContaining("3d8") })
    ]));
    expect(actorActionSupportsEffect(actions.find((action) => action.rollId.endsWith("-attack")))).toBe(false);
    expect(actorActionSupportsEffect(actions.find((action) => action.rollId.endsWith("-damage")))).toBe(true);
  });

  it("matches authoritative sheet actions only for an explicitly selected Open Hand subclass", () => {
    const nonOpenHandMonk: Actor = {
      ...monk,
      data: {
        ...monk.data,
        subclass: "Warrior of Shadow",
        subclasses: { Monk: "warrior-of-shadow" }
      }
    };
    const openHandMonk: Actor = {
      ...monk,
      data: {
        ...monk.data,
        subclass: "Warrior of the Open Hand",
        subclasses: { Monk: "warrior-of-the-open-hand" }
      }
    };

    expect(openHandRollIds(nonOpenHandMonk)).toEqual(authoritativeOpenHandRollIds(nonOpenHandMonk));
    expect(openHandRollIds(nonOpenHandMonk)).toEqual([]);
    expect(openHandRollIds(openHandMonk)).toEqual(authoritativeOpenHandRollIds(openHandMonk));
    expect(openHandRollIds(openHandMonk)).toEqual([
      "feature-open-hand-technique",
      "feature-open-hand-wholeness-of-body",
      "feature-open-hand-fleet-step",
      "feature-open-hand-quivering-palm-damage"
    ]);
  });
});
