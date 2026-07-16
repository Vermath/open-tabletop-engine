import { createTimestamped } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const campaignId = "camp_demo";

function mutationHeaders(userId: string, key: string) {
  return { "x-user-id": userId, "idempotency-key": key };
}

function addMember(store: MemoryStateStore, userId: string, role: "gm" | "assistant_gm" | "observer") {
  const template = store.state.users[0]!;
  store.state.users.push({ ...template, id: userId, email: `${userId}@example.test`, displayName: userId, createdAt: template.createdAt, updatedAt: template.updatedAt });
  const member = createTimestamped("mem", { id: `mem_${userId}`, campaignId, userId, role });
  store.state.members.push(member);
  return member;
}

describe("campaign member management API", () => {
  it("requires exact revision identity, replays once, and rejects stale updates", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const member = store.state.members.find((candidate) => candidate.campaignId === campaignId && candidate.userId === "usr_demo_player")!;
      const request = {
        method: "PATCH" as const,
        url: `/api/v1/campaigns/${campaignId}/members/${member.id}`,
        headers: mutationHeaders("usr_demo_gm", "campaign-member-role-once"),
        payload: { role: "observer", expectedUpdatedAt: member.updatedAt },
      };
      const updated = await app.inject(request);
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: member.id, role: "observer" });

      const replay = await app.inject(request);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(updated.body);

      const stale = await app.inject({ ...request, headers: mutationHeaders("usr_demo_gm", "campaign-member-role-stale"), payload: { role: "player", expectedUpdatedAt: request.payload.expectedUpdatedAt } });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({ code: "stale_write", resourceType: "campaign_member", resourceId: member.id });
    } finally {
      await app.close();
    }
  });

  it("allows owner and another GM, denies lesser roles, and blocks self-lockout", async () => {
    const store = new MemoryStateStore();
    const secondGm = addMember(store, "usr_second_gm", "gm");
    const assistant = addMember(store, "usr_assistant", "assistant_gm");
    const observer = addMember(store, "usr_observer", "observer");
    const app = await buildApp({ store });
    try {
      const player = store.state.members.find((candidate) => candidate.campaignId === campaignId && candidate.userId === "usr_demo_player")!;
      const ownerUpdate = await app.inject({ method: "PATCH", url: `/api/v1/campaigns/${campaignId}/members/${player.id}`, headers: mutationHeaders("usr_demo_gm", "owner-member-update"), payload: { role: "observer", expectedUpdatedAt: player.updatedAt } });
      expect(ownerUpdate.statusCode).toBe(200);

      const gmUpdate = await app.inject({ method: "PATCH", url: `/api/v1/campaigns/${campaignId}/members/${observer.id}`, headers: mutationHeaders(secondGm.userId, "gm-member-update"), payload: { role: "player", expectedUpdatedAt: observer.updatedAt } });
      expect(gmUpdate.statusCode).toBe(200);

      for (const member of [assistant, player, observer]) {
        const denied = await app.inject({ method: "PATCH", url: `/api/v1/campaigns/${campaignId}/members/${secondGm.id}`, headers: mutationHeaders(member.userId, `denied-${member.role}`), payload: { role: "observer", expectedUpdatedAt: secondGm.updatedAt } });
        expect(denied.statusCode).toBe(403);
      }

      const selfUpdate = await app.inject({ method: "PATCH", url: `/api/v1/campaigns/${campaignId}/members/${secondGm.id}`, headers: mutationHeaders(secondGm.userId, "gm-self-update"), payload: { role: "observer", expectedUpdatedAt: secondGm.updatedAt } });
      expect(selfUpdate.statusCode).toBe(403);
      expect(selfUpdate.json().message).toContain("own role");
      const selfRemove = await app.inject({ method: "DELETE", url: `/api/v1/campaigns/${campaignId}/members/${secondGm.id}?expectedUpdatedAt=${encodeURIComponent(secondGm.updatedAt)}`, headers: mutationHeaders(secondGm.userId, "gm-self-remove") });
      expect(selfRemove.statusCode).toBe(403);
      expect(selfRemove.json().message).toContain("own access");
    } finally {
      await app.close();
    }
  });
});
