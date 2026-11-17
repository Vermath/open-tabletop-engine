import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

describe("persisted profile, campaign rules, and character transfer contracts", () => {
  it("updates only the authenticated user's bounded profile and returns preferences in snapshots", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const user = store.state.users.find((candidate) => candidate.id === "usr_demo_player")!;
      const updated = await app.inject({
        method: "PATCH",
        url: "/api/v1/auth/profile",
        headers: { "x-user-id": user.id, "idempotency-key": "profile-prefs-1" },
        payload: {
          expectedUpdatedAt: user.updatedAt,
          displayName: "Table Player",
          preferences: { theme: "ember", dice3dEnabled: false, reducedMotion: true, chatNotifications: "all" }
        }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().user).toMatchObject({
        id: user.id,
        displayName: "Table Player",
        preferences: { theme: "ember", dice3dEnabled: false, reducedMotion: true, chatNotifications: "all" }
      });
      expect(updated.body).not.toContain("passwordHash");

      const forbiddenField = await app.inject({
        method: "PATCH",
        url: "/api/v1/auth/profile",
        headers: { "x-user-id": user.id, "idempotency-key": "profile-admin-1" },
        payload: { expectedUpdatedAt: updated.json().user.updatedAt, serverAdmin: true }
      });
      expect(forbiddenField.statusCode).toBe(400);

      const snapshot = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/snapshot",
        headers: { "x-user-id": user.id }
      });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json().user.preferences).toMatchObject({ theme: "ember", reducedMotion: true });
    } finally {
      await app.close();
    }
  });

  it("persists a revision-guarded campaign rules profile", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaigns/${campaign.id}`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "rules-profile-1" },
        payload: {
          expectedUpdatedAt: campaign.updatedAt,
          rulesProfile: {
            profileId: "dnd-5e-2024-standard",
            rulesVersion: "SRD 5.2.1",
            toggles: { "initiative.surprise": true, "rest.gritty": false }
          }
        }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().rulesProfile).toEqual({
        profileId: "dnd-5e-2024-standard",
        rulesVersion: "SRD 5.2.1",
        toggles: { "initiative.surprise": true, "rest.gritty": false }
      });
    } finally {
      await app.close();
    }
  });

  it("requires owner authority and recipient acceptance against the exact actor revision", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.campaignId === "camp_demo")!;
    actor.ownerUserId = "usr_demo_gm";
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/actors/${actor.id}/transfers`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "character-transfer-1" },
        payload: { toUserId: "usr_demo_player", expectedUpdatedAt: actor.updatedAt }
      });
      expect(created.statusCode).toBe(201);
      const transfer = created.json().transfer;
      expect(transfer).toMatchObject({ actorId: actor.id, fromUserId: "usr_demo_gm", toUserId: "usr_demo_player", status: "pending" });

      const wrongUser = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/character-transfers/${transfer.id}/accept`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "character-transfer-wrong-user" },
        payload: { expectedUpdatedAt: transfer.updatedAt }
      });
      expect(wrongUser.statusCode).toBe(403);

      const accepted = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/character-transfers/${transfer.id}/accept`,
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "character-transfer-accept" },
        payload: { expectedUpdatedAt: transfer.updatedAt }
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ transfer: { status: "accepted" }, actor: { ownerUserId: "usr_demo_player" } });
      expect(actor.ownerUserId).toBe("usr_demo_player");
    } finally {
      await app.close();
    }
  });

  it("requires the exact pending-transfer revision and lets the initiator cancel", async () => {
    const store = new MemoryStateStore();
    const actor = store.state.actors.find((candidate) => candidate.campaignId === "camp_demo")!;
    actor.ownerUserId = "usr_demo_gm";
    const app = await buildApp({ store });
    try {
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/actors/${actor.id}/transfers`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "character-transfer-cancel-create" },
        payload: { toUserId: "usr_demo_player", expectedUpdatedAt: actor.updatedAt }
      });
      expect(created.statusCode).toBe(201);
      const transfer = created.json().transfer;

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/character-transfers/${transfer.id}/decline`,
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "character-transfer-stale-decline" },
        payload: { expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", currentUpdatedAt: transfer.updatedAt });

      const cancelled = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${actor.campaignId}/character-transfers/${transfer.id}/cancel`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "character-transfer-cancel" },
        payload: { expectedUpdatedAt: transfer.updatedAt }
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json()).toMatchObject({ transfer: { status: "cancelled", resolvedByUserId: "usr_demo_gm" } });
      expect(actor.ownerUserId).toBe("usr_demo_gm");
    } finally {
      await app.close();
    }
  });
});
