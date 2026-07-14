import { describe, expect, it } from "vitest";

import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const campaignId = "camp_demo";
const creatorRoute = `/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/characters`;
const reviewRoute = `/api/v1/campaigns/${campaignId}/dnd/character-reviews`;

function guidedFighterPayload() {
  return {
    creationMode: "level-one-srd",
    templateId: "fighter",
    name: "Reviewed Human Fighter",
    ownerUserId: "usr_demo_player",
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
}

describe("D&D character review API", () => {
  it("keeps legacy campaigns optional, supports player submission and DM decisions, and gates stale characters only when configured", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: creatorRoute, headers: gmHeaders, payload: guidedFighterPayload() });
      expect(created.statusCode).toBe(200);
      const actorId = created.json().actor.id as string;
      expect(created.json().actor.data.dnd5eCharacterCreation).toMatchObject({ version: 1, mode: "level-one-srd", templateId: "fighter" });

      const initialQueue = await app.inject({ method: "GET", url: reviewRoute, headers: playerHeaders });
      expect(initialQueue.statusCode).toBe(200);
      expect(initialQueue.json()).toMatchObject({ policy: { mode: "optional", configured: false } });
      const initialEntry = initialQueue.json().entries.find((entry: { actor: { id: string } }) => entry.actor.id === actorId);
      expect(initialEntry).toMatchObject({ effectiveStatus: "not_submitted", stale: false });

      const optionalToken = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: gmHeaders,
        payload: { id: "tok_review_optional", actorId, name: "Optional review token", x: 100, y: 100 },
      });
      expect(optionalToken.statusCode).toBe(200);

      const submitted = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/submit`,
        headers: { ...playerHeaders, "idempotency-key": "review-submit-initial" },
        payload: {
          expectedActorUpdatedAt: initialEntry.expectedActorUpdatedAt,
          expectedItemUpdatedAt: initialEntry.expectedItemUpdatedAt,
        },
      });
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json()).toMatchObject({ effectiveStatus: "submitted", review: { status: "submitted", submittedByUserId: "usr_demo_player" } });
      expect(submitted.json().review.validation.issues.filter((issue: { code: string }) => issue.code.startsWith("creation."))).toEqual([]);

      const approved = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/decision`,
        headers: { ...gmHeaders, "idempotency-key": "review-approve-initial" },
        payload: {
          action: "approve",
          expectedActorUpdatedAt: submitted.json().expectedActorUpdatedAt,
          expectedFingerprint: submitted.json().review.fingerprint,
        },
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({ effectiveStatus: "approved", review: { decision: { status: "approved", overrideValidation: false } } });

      const campaign = store.state.campaigns.find((candidate) => candidate.id === campaignId)!;
      const required = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaigns/${campaignId}/dnd/character-review-policy`,
        headers: { ...gmHeaders, "idempotency-key": "review-policy-required" },
        payload: { mode: "required", expectedCampaignUpdatedAt: campaign.updatedAt },
      });
      expect(required.statusCode).toBe(200);
      expect(required.json()).toMatchObject({ policy: { mode: "required", configured: true } });

      const approvedToken = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: gmHeaders,
        payload: { id: "tok_review_approved", actorId, name: "Approved token", x: 200, y: 100 },
      });
      expect(approvedToken.statusCode).toBe(200);

      const baselineCombat = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${campaignId}/combats`,
        headers: gmHeaders,
        payload: { combatants: [{ id: "cmbt_review_baseline", tokenId: "tok_review_unlinked", name: "Unlinked combatant", initiative: 10, defeated: false }] },
      });
      expect(baselineCombat.statusCode).toBe(200);

      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      actor.data.level = 2;
      actor.updatedAt = "2099-07-13T12:00:00.000Z";
      const staleToken = await app.inject({
        method: "POST",
        url: "/api/v1/scenes/scn_vault_entry/tokens",
        headers: gmHeaders,
        payload: { id: "tok_review_stale", actorId, name: "Stale token", x: 300, y: 100 },
      });
      expect(staleToken.statusCode).toBe(409);
      expect(staleToken.json()).toMatchObject({ code: "character_approval_required", actorId });
      expect(store.state.tokens.some((token) => token.id === "tok_review_stale")).toBe(false);

      const relinkToken = await app.inject({
        method: "PATCH",
        url: "/api/v1/tokens/tok_valen",
        headers: gmHeaders,
        payload: { actorId },
      });
      expect(relinkToken.statusCode).toBe(409);
      expect(relinkToken.json()).toMatchObject({ code: "character_approval_required", actorId });
      expect(store.state.tokens.find((token) => token.id === "tok_valen")?.actorId).toBe("act_valen");

      const staleCombat = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${campaignId}/combats`,
        headers: gmHeaders,
        payload: { combatants: [{ id: "cmbt_review", tokenId: "tok_review_approved", actorId, name: "Reviewed fighter", initiative: 12, defeated: false }] },
      });
      expect(staleCombat.statusCode).toBe(409);
      expect(staleCombat.json()).toMatchObject({ code: "character_approval_required", actorId });

      const relinkCombatant = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${baselineCombat.json().id}/combatants/cmbt_review_baseline`,
        headers: gmHeaders,
        payload: { actorId, expectedUpdatedAt: baselineCombat.json().updatedAt },
      });
      expect(relinkCombatant.statusCode).toBe(409);
      expect(relinkCombatant.json()).toMatchObject({ code: "character_approval_required", actorId });

      const appendCombatant = await app.inject({
        method: "PATCH",
        url: `/api/v1/combats/${baselineCombat.json().id}`,
        headers: gmHeaders,
        payload: {
          expectedUpdatedAt: baselineCombat.json().updatedAt,
          combatants: [
            ...baselineCombat.json().combatants,
            { id: "cmbt_review_stale", tokenId: "tok_review_approved", actorId, name: "Reviewed fighter", initiative: 12, defeated: false },
          ],
        },
      });
      expect(appendCombatant.statusCode).toBe(409);
      expect(appendCombatant.json()).toMatchObject({ code: "character_approval_required", actorId });
      expect(store.state.combats.find((combat) => combat.id === baselineCombat.json().id)?.combatants).toHaveLength(1);

      const staleQueue = await app.inject({ method: "GET", url: reviewRoute, headers: playerHeaders });
      const staleEntry = staleQueue.json().entries.find((entry: { actor: { id: string } }) => entry.actor.id === actorId);
      expect(staleEntry).toMatchObject({ effectiveStatus: "stale", stale: true });

      const resubmitted = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/submit`,
        headers: { ...playerHeaders, "idempotency-key": "review-resubmit-level" },
        payload: { expectedActorUpdatedAt: staleEntry.expectedActorUpdatedAt, expectedItemUpdatedAt: staleEntry.expectedItemUpdatedAt },
      });
      expect(resubmitted.statusCode).toBe(200);
      const requestedChanges = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/decision`,
        headers: { ...gmHeaders, "idempotency-key": "review-request-changes" },
        payload: {
          action: "request_changes",
          expectedActorUpdatedAt: resubmitted.json().expectedActorUpdatedAt,
          expectedFingerprint: resubmitted.json().review.fingerprint,
          reason: "Confirm the level-two advancement choices before play.",
        },
      });
      expect(requestedChanges.statusCode).toBe(200);
      expect(requestedChanges.json()).toMatchObject({
        effectiveStatus: "changes_requested",
        review: { decision: { status: "changes_requested", reason: "Confirm the level-two advancement choices before play." } },
      });
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
        "actor.characterReviewSubmitted",
        "actor.characterReviewApproved",
        "campaign.characterReviewPolicyUpdated",
        "actor.characterReviewChangesRequested",
      ]));
    } finally {
      await app.close();
    }
  }, 15_000);

  it("surfaces forged guided choices and requires an explicit reasoned override before approval", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const created = await app.inject({ method: "POST", url: creatorRoute, headers: gmHeaders, payload: guidedFighterPayload() });
      expect(created.statusCode).toBe(200);
      const actorId = created.json().actor.id as string;
      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      const provenance = actor.data.dnd5eCharacterCreation as { options: Record<string, unknown> };
      provenance.options.fightingStyle = "dueling";
      actor.updatedAt = "2099-07-13T12:00:00.000Z";

      const queue = await app.inject({ method: "GET", url: reviewRoute, headers: playerHeaders });
      const entry = queue.json().entries.find((candidate: { actor: { id: string } }) => candidate.actor.id === actorId);
      expect(entry.currentValidation.issues).toContainEqual(expect.objectContaining({
        path: "/data/dnd5eCharacterCreation/options/fightingStyle",
        severity: "error",
        code: "creation.invalid_choice",
      }));

      const submitted = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/submit`,
        headers: { ...playerHeaders, "idempotency-key": "review-submit-forged" },
        payload: { expectedActorUpdatedAt: entry.expectedActorUpdatedAt, expectedItemUpdatedAt: entry.expectedItemUpdatedAt },
      });
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json().review.validation.errors).toBeGreaterThan(0);
      expect(submitted.json().review.validation.issues).toContainEqual(expect.objectContaining({ code: "creation.invalid_choice" }));

      const decisionPayload = {
        action: "approve",
        expectedActorUpdatedAt: submitted.json().expectedActorUpdatedAt,
        expectedFingerprint: submitted.json().review.fingerprint,
      };
      const blocked = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/decision`,
        headers: { ...gmHeaders, "idempotency-key": "review-approve-forged-blocked" },
        payload: decisionPayload,
      });
      expect(blocked.statusCode).toBe(409);

      const missingReason = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/decision`,
        headers: { ...gmHeaders, "idempotency-key": "review-approve-forged-no-reason" },
        payload: { ...decisionPayload, overrideValidation: true },
      });
      expect(missingReason.statusCode).toBe(400);

      const overridden = await app.inject({
        method: "POST",
        url: `${reviewRoute}/${actorId}/decision`,
        headers: { ...gmHeaders, "idempotency-key": "review-approve-forged-override" },
        payload: { ...decisionPayload, overrideValidation: true, reason: "Approved as a documented house-rule exception." },
      });
      expect(overridden.statusCode).toBe(200);
      expect(overridden.json()).toMatchObject({
        effectiveStatus: "approved",
        review: { decision: { overrideValidation: true, reason: "Approved as a documented house-rule exception." } },
      });

      const archive = await app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/export`, headers: gmHeaders });
      expect(archive.statusCode).toBe(200);
      const archivedActor = archive.json().data.actors.find((candidate: { id: string }) => candidate.id === actorId);
      expect(archivedActor.data.dnd5eCharacterReview).toMatchObject({
        status: "approved",
        decision: { overrideValidation: true, reason: "Approved as a documented house-rule exception." },
      });
      expect(archivedActor.data.dnd5eCharacterCreation).toMatchObject({ mode: "level-one-srd", templateId: "fighter" });
    } finally {
      await app.close();
    }
  });
});
