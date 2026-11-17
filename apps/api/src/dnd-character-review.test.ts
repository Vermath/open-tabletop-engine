import { describe, expect, it } from "vitest";
import type { Actor, Campaign, DndCharacterReviewState, Item } from "@open-tabletop/core";
import {
  dnd5eSrdApplyCharacterOrigins,
  dnd5eSrdCharacterTemplate,
  type Dnd5eSrdCharacterOriginOptions,
} from "@open-tabletop/system-sdk";

import {
  DND_CHARACTER_REVIEW_DATA_KEY,
  dndCharacterIsApproved,
  dndCharacterReviewFingerprint,
  dndCharacterReviewPolicy,
  dndCharacterReviewValidation,
} from "./dnd-character-review.js";

const now = "2026-07-13T12:00:00.000Z";

const validFighterOptions: Dnd5eSrdCharacterOriginOptions = {
  backgroundId: "soldier",
  speciesId: "human",
  abilityScoreIncreases: { strength: 2, dexterity: 1 },
  classSkillProficiencies: ["acrobatics", "history"],
  originLanguageChoices: ["common-sign-language", "draconic"],
  classLanguageChoices: [],
  skillProficiency: "perception",
  originFeat: "Skilled",
  skilledProficiencyChoices: ["arcana", "medicine", "herbalism-kit"],
  classEquipmentPackageId: "equipment-b",
  backgroundEquipmentPackageId: "equipment-a",
  backgroundToolProficiencyChoice: "dice-set",
  weaponMasteryChoices: ["greatsword", "longbow", "flail"],
  fightingStyle: "defense",
};

function actor(data: Record<string, unknown>): Actor {
  return {
    id: "act_review",
    campaignId: "camp_review",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Review Fighter",
    data,
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

function campaign(mode?: "optional" | "required"): Campaign {
  return {
    id: "camp_review",
    organizationId: "org_review",
    ownerUserId: "usr_gm",
    name: "Review campaign",
    description: "",
    defaultSystemId: "dnd-5e-srd",
    visibility: "private",
    ...(mode ? { characterReviewPolicy: { mode, updatedAt: now, updatedByUserId: "usr_gm" } } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function item(data: Record<string, unknown> = {}): Item {
  return {
    id: "itm_review",
    campaignId: "camp_review",
    systemId: "dnd-5e-srd",
    actorId: "act_review",
    type: "weapon",
    name: "Review blade",
    data,
    createdAt: now,
    updatedAt: now,
  };
}

describe("D&D character review evidence", () => {
  it("defaults legacy campaigns to an optional, unconfigured workflow", () => {
    expect(dndCharacterReviewPolicy(campaign())).toEqual({ mode: "optional", configured: false });
    expect(dndCharacterIsApproved(campaign(), actor({ level: 1 }), [])).toBe(true);
    expect(dndCharacterIsApproved(campaign("required"), actor({ level: 1 }), [])).toBe(false);
  });

  it("does not stale approval for volatile play state but does for build changes", () => {
    const reviewedActor = actor({
      level: 1,
      hp: { current: 8, max: 12, temporary: 2 },
      resources: { secondWind: { current: 1, max: 1 } },
      conditions: ["prone"],
    });
    const reviewedItem = item({ quantity: 2, equipped: true, damage: "1d8", properties: ["versatile"] });
    const initial = dndCharacterReviewFingerprint(reviewedActor, [reviewedItem]);

    const afterPlay = structuredClone(reviewedActor);
    (afterPlay.data.hp as Record<string, unknown>).current = 3;
    (afterPlay.data.resources as Record<string, Record<string, unknown>>).secondWind!.current = 0;
    afterPlay.data.conditions = ["poisoned"];
    const afterUseItem = structuredClone(reviewedItem);
    afterUseItem.data.quantity = 1;
    afterUseItem.data.equipped = false;
    expect(dndCharacterReviewFingerprint(afterPlay, [afterUseItem])).toBe(initial);

    const afterBuild = structuredClone(reviewedActor);
    (afterBuild.data.hp as Record<string, unknown>).max = 13;
    expect(dndCharacterReviewFingerprint(afterBuild, [reviewedItem])).not.toBe(initial);
    const redefinedItem = structuredClone(reviewedItem);
    redefinedItem.data.damage = "1d10";
    expect(dndCharacterReviewFingerprint(reviewedActor, [redefinedItem])).not.toBe(initial);
  });

  it("replays strict guided choices, catches forged options, and ignores absent legacy provenance", () => {
    const template = dnd5eSrdCharacterTemplate("fighter")!;
    const build = dnd5eSrdApplyCharacterOrigins(template, validFighterOptions);
    const legacy = actor(build.data);
    expect(dndCharacterReviewValidation(legacy, []).issues.filter((issue) => issue.code.startsWith("creation."))).toEqual([]);

    const validGuided = actor({
      ...build.data,
      dnd5eCharacterCreation: { version: 1, mode: "level-one-srd", templateId: "fighter", options: validFighterOptions },
    });
    expect(dndCharacterReviewValidation(validGuided, []).issues.filter((issue) => issue.code.startsWith("creation."))).toEqual([]);

    const forgedGuided = structuredClone(validGuided);
    (forgedGuided.data.dnd5eCharacterCreation as { options: Dnd5eSrdCharacterOriginOptions }).options.fightingStyle = "dueling";
    expect(dndCharacterReviewValidation(forgedGuided, []).issues).toContainEqual(expect.objectContaining({
      path: "/data/dnd5eCharacterCreation/options/fightingStyle",
      severity: "error",
      code: "creation.invalid_choice",
    }));
  });

  it("recognizes only a current matching approval under a required policy", () => {
    const reviewedActor = actor({ level: 1, hp: { current: 10, max: 10 } });
    const fingerprint = dndCharacterReviewFingerprint(reviewedActor, []);
    const review: DndCharacterReviewState = {
      version: 1,
      id: "crv_review",
      status: "approved",
      fingerprint,
      submittedAt: now,
      submittedByUserId: "usr_player",
      validation: {
        systemId: "dnd-5e-srd",
        rulesVersion: "test",
        actorSchemaVersion: "test",
        itemSchemaVersion: "test",
        errors: 0,
        warnings: 0,
        issues: [],
      },
      decision: { status: "approved", decidedAt: now, decidedByUserId: "usr_gm", overrideValidation: false },
    };
    reviewedActor.data[DND_CHARACTER_REVIEW_DATA_KEY] = review;
    expect(dndCharacterIsApproved(campaign("required"), reviewedActor, [])).toBe(true);
    reviewedActor.data.level = 2;
    expect(dndCharacterIsApproved(campaign("required"), reviewedActor, [])).toBe(false);
  });
});
