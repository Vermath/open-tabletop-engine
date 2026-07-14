import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("campaign ownership administration", () => {
  it("transfers ownership atomically with revision, membership, audit, and replay guards", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const reviewedUpdatedAt = campaign.updatedAt;
    const payload = {
      targetUserId: "usr_demo_player",
      expectedUpdatedAt: reviewedUpdatedAt,
      reason: "New GM for the next season"
    };
    const route = "/api/v1/campaigns/camp_demo/ownership-transfer";

    try {
      const missingIdempotency = await app.inject({ method: "POST", url: route, headers: { ...gmHeaders, "idempotency-key": "" }, payload });
      expect(missingIdempotency.statusCode).toBe(400);
      expect(campaign.ownerUserId).toBe("usr_demo_gm");

      const nonOwner = await app.inject({
        method: "POST",
        url: route,
        headers: { ...playerHeaders, "idempotency-key": "campaign-transfer-non-owner" },
        payload
      });
      expect(nonOwner.statusCode).toBe(403);
      expect(campaign.ownerUserId).toBe("usr_demo_gm");

      const stale = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "campaign-transfer-stale" },
        payload: { ...payload, expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        code: "stale_write",
        resourceType: "campaign",
        resourceId: campaign.id,
        currentUpdatedAt: reviewedUpdatedAt
      }));

      const headers = { ...gmHeaders, "idempotency-key": "campaign-transfer-player-owner" };
      const transferred = await app.inject({ method: "POST", url: route, headers, payload });
      expect(transferred.statusCode).toBe(200);
      expect(transferred.json()).toEqual(expect.objectContaining({
        campaign: expect.objectContaining({ id: campaign.id, ownerUserId: "usr_demo_player" }),
        previousOwner: expect.objectContaining({ userId: "usr_demo_gm", role: "gm" }),
        newOwner: expect.objectContaining({ userId: "usr_demo_player", role: "owner" })
      }));
      expect(campaign.updatedAt).not.toBe(reviewedUpdatedAt);
      expect(store.state.members.filter((member) => member.campaignId === campaign.id && member.role === "owner")).toEqual([
        expect.objectContaining({ userId: "usr_demo_player" })
      ]);
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.owner.transfer" && entry.targetId === campaign.id)).toEqual([
        expect.objectContaining({
          actorUserId: "usr_demo_gm",
          before: expect.objectContaining({ ownerUserId: "usr_demo_gm", targetRole: "player" }),
          after: expect.objectContaining({ ownerUserId: "usr_demo_player", previousOwnerRole: "gm", targetRole: "owner" })
        })
      ]);

      const replay = await app.inject({ method: "POST", url: route, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json()).toEqual(transferred.json());
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.owner.transfer" && entry.targetId === campaign.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("requires an active, direct campaign member as the new owner", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const playerMember = store.state.members.find((member) => member.campaignId === campaign.id && member.userId === "usr_demo_player")!;
    const route = "/api/v1/campaigns/camp_demo/ownership-transfer";

    try {
      playerMember.source = { type: "scim_group", groupId: "grp_players", mappingId: "map_players" };
      const managed = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "campaign-transfer-managed-member" },
        payload: { targetUserId: playerMember.userId, expectedUpdatedAt: campaign.updatedAt }
      });
      expect(managed.statusCode).toBe(409);
      expect(campaign.ownerUserId).toBe("usr_demo_gm");

      playerMember.source = undefined;
      store.state.users.find((user) => user.id === playerMember.userId)!.disabledAt = "2026-07-13T00:00:00.000Z";
      const members = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/members", headers: gmHeaders });
      expect(members.statusCode).toBe(200);
      expect(members.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: "usr_demo_gm", active: true }),
        expect.objectContaining({ userId: playerMember.userId, active: false })
      ]));
      const disabled = await app.inject({
        method: "POST",
        url: route,
        headers: { ...gmHeaders, "idempotency-key": "campaign-transfer-disabled-member" },
        payload: { targetUserId: playerMember.userId, expectedUpdatedAt: campaign.updatedAt }
      });
      expect(disabled.statusCode).toBe(400);
      expect(campaign.ownerUserId).toBe("usr_demo_gm");
    } finally {
      await app.close();
    }
  });
});

describe("archived campaign mutation policy", () => {
  it("keeps archived campaigns readable but rejects direct, indirect, and body-scoped writes until restore", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;

    try {
      const archived = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/archive",
        headers: gmHeaders,
        payload: { reason: "Between seasons" }
      });
      expect(archived.statusCode).toBe(200);
      expect(campaign.archivedAt).toEqual(expect.any(String));
      const actorBefore = structuredClone(actor);

      const readable = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/snapshot", headers: gmHeaders });
      expect(readable.statusCode).toBe(200);
      const auditCount = store.state.auditLogs.length;

      const direct = await app.inject({
        method: "PATCH",
        url: "/api/v1/campaigns/camp_demo",
        headers: gmHeaders,
        payload: { name: "Must not change" }
      });
      expect(direct.statusCode).toBe(409);
      expect(direct.json()).toEqual(expect.objectContaining({
        error: "campaign_archived",
        code: "campaign_read_only",
        campaignId: campaign.id,
        archivedAt: campaign.archivedAt
      }));

      const indirect = await app.inject({
        method: "PATCH",
        url: `/api/v1/actors/${actor.id}`,
        headers: gmHeaders,
        payload: { name: "Must not change either", expectedUpdatedAt: actor.updatedAt }
      });
      expect(indirect.statusCode).toBe(409);

      const bodyScoped = await app.inject({
        method: "POST",
        url: "/api/v1/chat/messages",
        headers: gmHeaders,
        payload: { campaignId: campaign.id, body: "Archived write", type: "plain", visibility: "public" }
      });
      expect(bodyScoped.statusCode).toBe(409);
      expect(campaign.name).toBe("The Ember Vault");
      expect(actor).toEqual(actorBefore);
      expect(store.state.chat.some((message) => message.body === "Archived write")).toBe(false);
      expect(store.state.auditLogs.slice(auditCount).some((entry) => (
        entry.action === "campaign.update" || entry.action === "actor.update" || entry.action === "chat.create"
      ))).toBe(false);

      const restored = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/restore",
        headers: gmHeaders,
        payload: { reason: "Season resumed" }
      });
      expect(restored.statusCode).toBe(200);
      expect(campaign.archivedAt).toBeUndefined();

      const updated = await app.inject({
        method: "PATCH",
        url: "/api/v1/campaigns/camp_demo",
        headers: gmHeaders,
        payload: { name: "The Ember Vault Returns" }
      });
      expect(updated.statusCode).toBe(200);
      expect(campaign.name).toBe("The Ember Vault Returns");
    } finally {
      await app.close();
    }
  });
});
