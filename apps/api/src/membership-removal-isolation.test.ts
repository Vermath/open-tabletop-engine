import { createTimestamped, type Campaign, type CampaignMember } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const ownerId = "usr_demo_gm";
const playerId = "usr_demo_player";
const campaignId = "camp_demo";

function headers(userId: string, key: string) {
  return { "x-user-id": userId, "idempotency-key": key };
}

function membershipState(store: MemoryStateStore) {
  return structuredClone({
    organizationMembers: store.state.organizationMembers,
    members: store.state.members,
    campaigns: store.state.campaigns,
    permissionGrants: store.state.permissionGrants,
    tokens: store.state.tokens,
  });
}

function addCampaign(store: MemoryStateStore, id: string, ownerUserId = ownerId, organizationId = "org_demo"): Campaign {
  const campaign = { ...store.state.campaigns.find((item) => item.id === campaignId)!, id, name: id, ownerUserId, organizationId };
  store.state.campaigns.push(campaign);
  return campaign;
}

function addMember(store: MemoryStateStore, campaign: string, userId: string, role: CampaignMember["role"]) {
  const member = createTimestamped("mem", { campaignId: campaign, userId, role });
  store.state.members.push(member);
  return member;
}

describe("membership removal isolation", () => {
  it("cleans up only the removed campaign's explicit token owners and user grants", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const member = store.state.members.find((item) => item.campaignId === campaignId && item.userId === playerId)!;
      const scene = store.state.scenes.find((item) => item.campaignId === campaignId)!;
      const token = store.state.tokens.find((item) => item.sceneId === scene.id)!;
      token.ownerUserIds = [playerId, ownerId];
      token.updatedAt = "2026-01-01T00:00:00.000Z";
      const unaffectedToken = { ...structuredClone(token), id: "tok_unaffected", ownerUserIds: [ownerId] };
      store.state.tokens.push(unaffectedToken);
      const foreignTokenIds: string[] = [];
      const foreignMemberIds: string[] = [];
      for (const [id, organizationId] of [["camp_other", "org_demo"], ["camp_foreign", "org_foreign"]]) {
        addCampaign(store, id!, ownerId, organizationId!);
        foreignMemberIds.push(addMember(store, id!, playerId, "player").id);
        const otherScene = { ...structuredClone(scene), id: `scn_${id}`, campaignId: id! };
        store.state.scenes.push(otherScene);
        const otherToken = { ...structuredClone(token), id: `tok_${id}`, sceneId: otherScene.id };
        store.state.tokens.push(otherToken);
        foreignTokenIds.push(otherToken.id);
      }
      for (const id of [campaignId, "camp_other", "camp_foreign"]) {
        store.state.permissionGrants.push(createTimestamped("grant", { campaignId: id, subjectType: "user" as const, subjectId: playerId, permissions: ["token.move" as const] }));
      }
      const untouchedTokens = structuredClone(store.state.tokens.filter((item) => item.id === unaffectedToken.id || foreignTokenIds.includes(item.id)));
      const foreignGrants = structuredClone(store.state.permissionGrants.filter((grant) => grant.campaignId !== campaignId));
      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/campaigns/${campaignId}/members/${member.id}?expectedUpdatedAt=${encodeURIComponent(member.updatedAt)}`,
        headers: headers(ownerId, "remove-campaign-member-isolated"),
      });

      expect(response.statusCode).toBe(200);
      expect(store.state.tokens.find((item) => item.id === token.id)).toMatchObject({ ownerUserIds: [ownerId] });
      expect(store.state.tokens.find((item) => item.id === token.id)!.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
      expect(store.state.tokens.filter((item) => item.id === unaffectedToken.id || foreignTokenIds.includes(item.id))).toEqual(untouchedTokens);
      expect(store.state.members.some((item) => item.id === member.id)).toBe(false);
      expect(store.state.members.filter((item) => foreignMemberIds.includes(item.id))).toHaveLength(2);
      expect(store.state.permissionGrants.some((grant) => grant.campaignId === campaignId && grant.subjectType === "user" && grant.subjectId === playerId)).toBe(false);
      expect(store.state.permissionGrants.filter((grant) => grant.campaignId !== campaignId)).toEqual(foreignGrants);
    } finally {
      await app.close();
    }
  });

  it("keeps all memberships when an ordinary organization member owns campaigns, then permits removal after transfer", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const organizationMember = store.state.organizationMembers.find((item) => item.organizationId === "org_demo" && item.userId === playerId)!;
      expect(organizationMember.role).toBe("member");
      const ownedCampaigns: Campaign[] = [];
      for (const name of ["Visible ownership blocker", "Private ownership blocker"]) {
        const created = await app.inject({ method: "POST", url: "/api/v1/campaigns", headers: headers(playerId, `create-${name}`), payload: { name } });
        expect(created.statusCode).toBe(200);
        ownedCampaigns.push(created.json());
      }
      const visibleCampaign = ownedCampaigns[0]!;
      const privateCampaign = ownedCampaigns[1]!;
      addMember(store, visibleCampaign.id, ownerId, "gm");
      const foreignCampaign = addCampaign(store, "camp_foreign_owned", playerId, "org_foreign");
      const foreignMember = addMember(store, foreignCampaign.id, playerId, "owner");
      const before = membershipState(store);
      const removalUrl = `/api/v1/organization/members/${organizationMember.id}?expectedUpdatedAt=${encodeURIComponent(organizationMember.updatedAt)}`;
      const blocked = await app.inject({ method: "DELETE", url: removalUrl, headers: headers(ownerId, "blocked-organization-removal") });

      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({
        code: "campaign_ownership_transfer_required",
        campaigns: [{ id: visibleCampaign.id, name: visibleCampaign.name }],
      });
      expect(blocked.json().message).toContain("Transfer");
      expect(blocked.body).not.toContain(privateCampaign.id);
      expect(blocked.body).not.toContain(privateCampaign.name);
      expect(blocked.body).not.toContain(foreignCampaign.id);
      expect(membershipState(store)).toEqual(before);
      expect(store.state.auditLogs.filter((entry) => entry.action === "organization.member.remove")).toHaveLength(0);

      addMember(store, privateCampaign.id, ownerId, "gm");
      for (const campaign of ownedCampaigns) {
        const transferred = await app.inject({
          method: "POST",
          url: `/api/v1/campaigns/${campaign.id}/ownership-transfer`,
          headers: headers(playerId, `transfer-${campaign.id}`),
          payload: { targetUserId: ownerId, expectedUpdatedAt: campaign.updatedAt },
        });
        expect(transferred.statusCode).toBe(200);
      }
      const removed = await app.inject({ method: "DELETE", url: removalUrl, headers: headers(ownerId, "remove-organization-member-after-transfer") });
      expect(removed.statusCode).toBe(200);
      expect(removed.json()).toMatchObject({ removed: true, userId: playerId, removedCampaignMemberships: 3 });
      expect(store.state.organizationMembers.some((item) => item.id === organizationMember.id)).toBe(false);
      expect(store.state.members.filter((item) => item.userId === playerId)).toEqual([foreignMember]);
      for (const campaign of ownedCampaigns) {
        expect(store.state.campaigns.find((item) => item.id === campaign.id)!.ownerUserId).toBe(ownerId);
        expect(store.state.members.filter((item) => item.campaignId === campaign.id && item.role === "owner")).toEqual([expect.objectContaining({ userId: ownerId })]);
      }
    } finally {
      await app.close();
    }
  });

  it.each([
    ["member", "record"], ["admin", "record"],
    ["member", "membership"], ["admin", "membership"],
    ["member", "missing-membership"], ["admin", "missing-membership"],
  ] as const)("blocks removing an organization %s whose campaign ownership is recorded by %s", async (organizationRole, ownershipSource) => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const organizationMember = store.state.organizationMembers.find((item) => item.organizationId === "org_demo" && item.userId === playerId)!;
      organizationMember.role = organizationRole;
      const ownedCampaign = addCampaign(store, "camp_owner_edge", ownershipSource === "membership" ? ownerId : playerId);
      if (ownershipSource !== "missing-membership") addMember(store, ownedCampaign.id, playerId, ownershipSource === "membership" ? "owner" : "player");
      const before = membershipState(store);
      const response = await app.inject({ method: "DELETE", url: `/api/v1/organization/members/${organizationMember.id}?expectedUpdatedAt=${encodeURIComponent(organizationMember.updatedAt)}`, headers: headers(ownerId, `remove-${organizationRole}-${ownershipSource}`) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "campaign_ownership_transfer_required", campaigns: [] });
      expect(membershipState(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it.each(["record", "membership"] as const)("protects campaign owners identified by their %s even when the two owner records disagree", async (ownershipSource) => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const ownerMember = store.state.members.find((item) => item.campaignId === campaignId && item.userId === ownerId)!;
      const playerMember = store.state.members.find((item) => item.campaignId === campaignId && item.userId === playerId)!;
      const target = ownershipSource === "record" ? ownerMember : playerMember;
      const actingUserId = ownershipSource === "record" ? playerId : ownerId;
      if (ownershipSource === "record") {
        ownerMember.role = "player";
        playerMember.role = "gm";
      } else {
        playerMember.role = "owner";
      }
      const before = membershipState(store);
      const response = await app.inject({ method: "DELETE", url: `/api/v1/campaigns/${campaignId}/members/${target.id}?expectedUpdatedAt=${encodeURIComponent(target.updatedAt)}`, headers: headers(actingUserId, `remove-campaign-owner-${ownershipSource}`) });
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain("owner cannot be removed");
      expect(membershipState(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("protects the organization owner when their membership role is inconsistent", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const ownerMember = store.state.organizationMembers.find((item) => item.organizationId === "org_demo" && item.userId === ownerId)!;
      const playerMember = store.state.organizationMembers.find((item) => item.organizationId === "org_demo" && item.userId === playerId)!;
      ownerMember.role = "admin";
      playerMember.role = "admin";
      const before = membershipState(store);
      const response = await app.inject({ method: "DELETE", url: `/api/v1/organization/members/${ownerMember.id}?expectedUpdatedAt=${encodeURIComponent(ownerMember.updatedAt)}`, headers: headers(playerId, "remove-organization-owner") });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Organization owner cannot be removed");
      expect(membershipState(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });
});
