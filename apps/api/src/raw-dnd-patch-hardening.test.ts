import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const campaignId = "camp_demo";
const actorCreateRoute = `/api/v1/campaigns/${campaignId}/systems/dnd-5e-srd/characters`;
const reviewRoute = `/api/v1/campaigns/${campaignId}/dnd/character-reviews`;

function guidedFighterPayload() {
  return {
    creationMode: "level-one-srd",
    templateId: "fighter",
    name: "Raw patch guard fighter",
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

function mutationHeaders(headers: Record<string, string>, key: string): Record<string, string> {
  return { ...headers, "idempotency-key": key };
}

describe("raw D&D actor and item patch hardening", () => {
  it("requires exact revisions, blocks protected player writes, and audits manager overrides", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const gmLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "gm@example.test" } });
      const playerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "player@example.test" } });
      expect(gmLogin.statusCode).toBe(200);
      expect(playerLogin.statusCode).toBe(200);
      const gmHeaders = { authorization: `Bearer ${gmLogin.json().token as string}` };
      const playerHeaders = { authorization: `Bearer ${playerLogin.json().token as string}` };

      const created = await app.inject({ method: "POST", url: actorCreateRoute, headers: mutationHeaders(gmHeaders, "raw-actor-create"), payload: guidedFighterPayload() });
      expect(created.statusCode).toBe(200);
      const actorId = created.json().actor.id as string;
      const actorUrl = `/api/v1/actors/${actorId}`;
      const actor = store.state.actors.find((candidate) => candidate.id === actorId)!;
      const originalActor = structuredClone(actor);

      const missingActorRevisionAuditCount = store.state.auditLogs.length;
      const missingActorRevision = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-missing-revision"),
        payload: { data: { ...actor.data, notes: "Must not save without a revision." } },
      });
      expect(missingActorRevision.statusCode).toBe(400);
      expect(actor).toEqual(originalActor);
      expect(store.state.auditLogs).toHaveLength(missingActorRevisionAuditCount);

      const invalidActorRevisionAuditCount = store.state.auditLogs.length;
      const invalidActorRevision = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-invalid-revision"),
        payload: { expectedUpdatedAt: "not-a-date", data: { ...actor.data, notes: "Must not save with an invalid revision." } },
      });
      expect(invalidActorRevision.statusCode).toBe(400);
      expect(actor).toEqual(originalActor);
      expect(store.state.auditLogs).toHaveLength(invalidActorRevisionAuditCount);

      const staleActorRevisionAuditCount = store.state.auditLogs.length;
      const staleActorRevision = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-stale-revision"),
        payload: {
          expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
          data: { ...actor.data, notes: "Must not save with a stale revision." },
        },
      });
      expect(staleActorRevision.statusCode).toBe(409);
      expect(staleActorRevision.json()).toMatchObject({ code: "stale_write", resourceType: "actor", resourceId: actorId });
      expect(actor).toEqual(originalActor);
      expect(store.state.auditLogs).toHaveLength(staleActorRevisionAuditCount);

      const reviewQueue = await app.inject({ method: "GET", url: reviewRoute, headers: playerHeaders });
      expect(reviewQueue.statusCode).toBe(200);
      const reviewEntry = reviewQueue.json().entries.find((entry: { actor: { id: string } }) => entry.actor.id === actorId);
      expect(reviewEntry.currentFingerprint).toEqual(expect.any(String));

      const forgedReviewAuditCount = store.state.auditLogs.length;
      const forgedReview = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-forged-review"),
        payload: {
          expectedUpdatedAt: actor.updatedAt,
          data: {
            ...actor.data,
            dnd5eCharacterReview: {
              version: 1,
              id: "review_forged",
              status: "approved",
              fingerprint: reviewEntry.currentFingerprint,
              validation: reviewEntry.currentValidation,
              decision: { status: "approved", decidedByUserId: "usr_demo_player" },
            },
          },
        },
      });
      expect(forgedReview.statusCode).toBe(409);
      expect(forgedReview.json()).toMatchObject({
        code: "character_review_route_required",
        resourceType: "actor",
        resourceId: actorId,
        managedRoots: ["dnd5eCharacterReview"],
      });
      expect(actor).toEqual(originalActor);
      expect(actor.data.dnd5eCharacterReview).toBeUndefined();
      expect(store.state.auditLogs).toHaveLength(forgedReviewAuditCount);

      const hp = actor.data.hp as Record<string, unknown>;
      const nextHpCurrent = Math.max(0, Number(hp.current) - 1);
      const blockedHpAuditCount = store.state.auditLogs.length;
      const blockedHp = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-blocked-hp"),
        payload: {
          expectedUpdatedAt: actor.updatedAt,
          data: { ...actor.data, hp: { ...hp, current: nextHpCurrent } },
        },
      });
      expect(blockedHp.statusCode).toBe(409);
      expect(blockedHp.json()).toMatchObject({
        code: "rules_managed_patch_requires_review",
        resourceType: "actor",
        resourceId: actorId,
        managedRoots: ["hp"],
      });
      expect(actor).toEqual(originalActor);
      expect(store.state.auditLogs).toHaveLength(blockedHpAuditCount);

      const playerOverrideAuditCount = store.state.auditLogs.length;
      const playerOverride = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-player-override"),
        payload: {
          expectedUpdatedAt: actor.updatedAt,
          manualOverrideReason: "A player must not be able to self-authorize this change.",
          data: { ...actor.data, hp: { ...hp, current: nextHpCurrent } },
        },
      });
      expect(playerOverride.statusCode).toBe(403);
      expect(actor).toEqual(originalActor);
      expect(store.state.auditLogs).toHaveLength(playerOverrideAuditCount);

      const descriptiveActorUpdate = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(playerHeaders, "raw-actor-descriptive-update"),
        payload: {
          expectedUpdatedAt: actor.updatedAt,
          data: { ...actor.data, notes: "Keeps watch while the party rests." },
        },
      });
      expect(descriptiveActorUpdate.statusCode).toBe(200);
      expect(descriptiveActorUpdate.json().data.notes).toBe("Keeps watch while the party rests.");
      expect(actor.data.notes).toBe("Keeps watch while the party rests.");

      const gmOverride = await app.inject({
        method: "PATCH",
        url: actorUrl,
        headers: mutationHeaders(gmHeaders, "raw-actor-gm-override"),
        payload: {
          expectedUpdatedAt: actor.updatedAt,
          manualOverrideReason: "Correcting table state after an offline damage ruling.",
          data: { ...actor.data, hp: { ...(actor.data.hp as Record<string, unknown>), current: nextHpCurrent } },
        },
      });
      expect(gmOverride.statusCode).toBe(200);
      expect(gmOverride.json().data.hp.current).toBe(nextHpCurrent);
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({
        action: "actor.dndManualOverride",
        targetId: actorId,
        after: expect.objectContaining({
          managedRoots: ["hp"],
          reason: "Correcting table state after an offline damage ruling.",
        }),
      }));

      const createdItem = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${campaignId}/items`,
        headers: mutationHeaders(gmHeaders, "raw-item-create"),
        payload: {
          expectedUpdatedAt: store.state.campaigns.find((candidate) => candidate.id === campaignId)!.updatedAt,
          actorId,
          systemId: "dnd-5e-srd",
          type: "spell",
          name: "Guarded spell component",
          data: { quantity: 2, prepared: true, notes: "Original item note." },
        },
      });
      expect(createdItem.statusCode).toBe(200);
      const itemId = createdItem.json().id as string;
      const itemUrl = `/api/v1/items/${itemId}`;
      const item = store.state.items.find((candidate) => candidate.id === itemId)!;
      const originalItem = structuredClone(item);

      const missingItemRevisionAuditCount = store.state.auditLogs.length;
      const missingItemRevision = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(playerHeaders, "raw-item-missing-revision"),
        payload: { data: { ...item.data, notes: "Must not save without a revision." } },
      });
      expect(missingItemRevision.statusCode).toBe(400);
      expect(item).toEqual(originalItem);
      expect(store.state.auditLogs).toHaveLength(missingItemRevisionAuditCount);

      const invalidItemRevisionAuditCount = store.state.auditLogs.length;
      const invalidItemRevision = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(playerHeaders, "raw-item-invalid-revision"),
        payload: {
          expectedUpdatedAt: "not-a-date",
          data: { ...item.data, notes: "Must not save with an invalid revision." },
        },
      });
      expect(invalidItemRevision.statusCode).toBe(400);
      expect(item).toEqual(originalItem);
      expect(store.state.auditLogs).toHaveLength(invalidItemRevisionAuditCount);

      const staleItemRevisionAuditCount = store.state.auditLogs.length;
      const staleItemRevision = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(playerHeaders, "raw-item-stale-revision"),
        payload: {
          expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
          data: { ...item.data, notes: "Must not save with a stale revision." },
        },
      });
      expect(staleItemRevision.statusCode).toBe(409);
      expect(staleItemRevision.json()).toMatchObject({ code: "stale_write", resourceType: "item", resourceId: itemId });
      expect(item).toEqual(originalItem);
      expect(store.state.auditLogs).toHaveLength(staleItemRevisionAuditCount);

      for (const protectedPatch of [{ quantity: 1 }, { prepared: false }]) {
        const protectedItemAuditCount = store.state.auditLogs.length;
        const blockedItem = await app.inject({
          method: "PATCH",
          url: itemUrl,
          headers: mutationHeaders(playerHeaders, `raw-item-protected-${Object.keys(protectedPatch)[0]}`),
          payload: {
            expectedUpdatedAt: item.updatedAt,
            data: { ...item.data, ...protectedPatch },
          },
        });
        expect(blockedItem.statusCode).toBe(409);
        expect(blockedItem.json()).toMatchObject({
          code: "rules_managed_patch_requires_review",
          resourceType: "item",
          resourceId: itemId,
          managedRoots: Object.keys(protectedPatch),
        });
        expect(item).toEqual(originalItem);
        expect(store.state.auditLogs).toHaveLength(protectedItemAuditCount);
      }

      const itemPlayerOverrideAuditCount = store.state.auditLogs.length;
      const itemPlayerOverride = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(playerHeaders, "raw-item-player-override"),
        payload: {
          expectedUpdatedAt: item.updatedAt,
          manualOverrideReason: "A player must not be able to self-authorize this change.",
          data: { ...item.data, quantity: 1 },
        },
      });
      expect(itemPlayerOverride.statusCode).toBe(403);
      expect(item).toEqual(originalItem);
      expect(store.state.auditLogs).toHaveLength(itemPlayerOverrideAuditCount);

      const descriptiveItemUpdate = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(playerHeaders, "raw-item-descriptive-update"),
        payload: {
          expectedUpdatedAt: item.updatedAt,
          data: { ...item.data, notes: "Player-authored descriptive item note." },
        },
      });
      expect(descriptiveItemUpdate.statusCode).toBe(200);
      expect(descriptiveItemUpdate.json().data.notes).toBe("Player-authored descriptive item note.");
      expect(item.data).toMatchObject({ quantity: 2, prepared: true, notes: "Player-authored descriptive item note." });

      const gmItemOverride = await app.inject({
        method: "PATCH",
        url: itemUrl,
        headers: mutationHeaders(gmHeaders, "raw-item-gm-override"),
        payload: {
          expectedUpdatedAt: item.updatedAt,
          manualOverrideReason: "Reconciling an item consumed while the table was offline.",
          data: { ...item.data, quantity: 1 },
        },
      });
      expect(gmItemOverride.statusCode).toBe(200);
      expect(gmItemOverride.json().data.quantity).toBe(1);
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({
        action: "item.dndManualOverride",
        targetId: itemId,
        after: expect.objectContaining({
          managedRoots: ["quantity"],
          reason: "Reconciling an item consumed while the table was offline.",
        }),
      }));
    } finally {
      await app.close();
    }
  });
});
