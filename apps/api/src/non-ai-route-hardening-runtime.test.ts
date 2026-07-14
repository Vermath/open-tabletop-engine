import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

function stateWithoutReadAudit(store: MemoryStateStore): Record<string, unknown> {
  const { auditLogs: _auditLogs, ...primaryState } = structuredClone(store.state);
  return primaryState;
}

describe("non-AI route hardening runtime contract", () => {
  it("keeps security-audited GETs read-only outside the serialized append-only audit sink", async () => {
    const store = new MemoryStateStore();
    const admin = store.state.users.find((user) => user.id === "usr_demo_gm")!;
    admin.serverAdmin = true;
    store.state.sessions.push({
      id: "sess_expired_read_contract",
      userId: admin.id,
      tokenHash: "expired-read-contract-token-hash",
      activeOrganizationId: "org_demo",
      expiresAt: "2020-01-01T00:00:00.000Z",
      lastSeenAt: "2020-01-01T00:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const before = stateWithoutReadAudit(store);
    const app = await buildApp({ store });

    try {
      for (const url of [
        "/api/v1/admin/users",
        "/api/v1/admin/sessions",
        "/api/v1/admin/auth/config",
        "/api/v1/admin/email-outbox",
        "/api/v1/admin/storage/operations",
        "/api/v1/campaigns/camp_demo/chat/export",
      ]) {
        const response = await app.inject({ method: "GET", url, headers: gmHeaders });
        expect(response.statusCode, url).toBe(200);
      }
    } finally {
      // onClose drains the asynchronous serialized read-audit queue.
      await app.close();
    }

    expect(stateWithoutReadAudit(store)).toEqual(before);
    expect(store.state.sessions.some((session) => session.id === "sess_expired_read_contract")).toBe(true);
    expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "admin.users.list",
      "admin.sessions.list",
      "admin.authConfig.inspect",
      "admin.emailOutbox.list",
      "admin.storage.inspect",
      "chat.export",
    ]));
  });

  it("rejects a second organization-member writer at the stale reviewed revision", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const member = store.state.organizationMembers.find((candidate) => candidate.id === "orgmem_demo_player")!;
    const reviewedUpdatedAt = member.updatedAt;

    try {
      const missingKey = await app.inject({
        method: "PATCH",
        url: `/api/v1/organization/members/${member.id}`,
        headers: gmHeaders,
        payload: { role: "admin", expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(missingKey.statusCode).toBe(400);
      expect(member.role).toBe("member");

      const first = await app.inject({
        method: "PATCH",
        url: `/api/v1/organization/members/${member.id}`,
        headers: { ...gmHeaders, "idempotency-key": "org-member-writer-one" },
        payload: { role: "admin", expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(first.statusCode, first.body).toBe(200);
      expect(member.role).toBe("admin");
      expect(member.updatedAt).not.toBe(reviewedUpdatedAt);

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/organization/members/${member.id}`,
        headers: { ...gmHeaders, "idempotency-key": "org-member-writer-two" },
        payload: { role: "member", expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        code: "stale_write",
        resourceType: "organization_member",
        resourceId: member.id,
        expectedUpdatedAt: reviewedUpdatedAt,
        currentUpdatedAt: member.updatedAt,
      }));
      expect(member.role).toBe("admin");
    } finally {
      await app.close();
    }
  });

  it("rejects a second content-import writer and applies the selected entity only once", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });

    try {
      const preview = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/content-imports/preview",
        headers: { ...gmHeaders, "idempotency-key": "content-preview-runtime-contract" },
        payload: {
          source: { sourceType: "user_upload", sourceName: "runtime-contract.json" },
          entities: [{
            id: "runtime_contract_note",
            kind: "journal",
            name: "Runtime Contract Note",
            selectedByDefault: true,
            data: { body: "Applied exactly once", visibility: "public" },
          }],
        },
      });
      expect(preview.statusCode).toBe(200);
      const batch = store.state.contentImports.find((candidate) => candidate.id === preview.json().id)!;
      const reviewedUpdatedAt = batch.updatedAt;
      const entityId = batch.entities[0]!.id;

      const missingKey = await app.inject({
        method: "POST",
        url: `/api/v1/content-imports/${batch.id}/apply`,
        headers: gmHeaders,
        payload: { selectedEntityIds: [entityId], expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(missingKey.statusCode).toBe(400);
      expect(batch.status).toBe("previewed");

      const first = await app.inject({
        method: "POST",
        url: `/api/v1/content-imports/${batch.id}/apply`,
        headers: { ...gmHeaders, "idempotency-key": "content-apply-writer-one" },
        payload: { selectedEntityIds: [entityId], expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(first.statusCode, first.body).toBe(200);
      expect(batch.status).toBe("applied");
      expect(batch.updatedAt).not.toBe(reviewedUpdatedAt);

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/content-imports/${batch.id}/apply`,
        headers: { ...gmHeaders, "idempotency-key": "content-apply-writer-two" },
        payload: { selectedEntityIds: [entityId], expectedUpdatedAt: reviewedUpdatedAt },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual(expect.objectContaining({
        code: "stale_write",
        resourceType: "content_import",
        resourceId: batch.id,
        expectedUpdatedAt: reviewedUpdatedAt,
        currentUpdatedAt: batch.updatedAt,
      }));
      expect(store.state.journals.filter((entry) => entry.title === "Runtime Contract Note")).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("rejects representative newly covered mutation families before state changes", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
    const scene = store.state.scenes.find((candidate) => candidate.campaignId === campaign.id)!;
    const actor = store.state.actors.find((candidate) => candidate.id === "act_valen")!;
    const macro = store.state.diceMacros.find((candidate) => candidate.campaignId === campaign.id)!;
    const before = stateWithoutReadAudit(store);

    try {
      const requests = [
        {
          label: "campaign invite",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/invites`,
          payload: { email: "guarded-invite@example.test", role: "player" },
        },
        {
          label: "fog preset",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/fog-presets`,
          payload: { name: "Guarded preset", sceneId: scene.id, expectedSceneUpdatedAt: scene.updatedAt },
        },
        {
          label: "webhook",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/webhooks`,
          payload: { name: "Guarded webhook", url: "https://hooks.example.test/events", eventTypes: ["campaign.updated"], expectedCampaignUpdatedAt: campaign.updatedAt },
        },
        {
          label: "dice macro",
          method: "PATCH" as const,
          url: `/api/v1/dice-macros/${macro.id}`,
          payload: { name: "Must not change", expectedUpdatedAt: macro.updatedAt },
        },
        {
          label: "campaign plugin install",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/plugins/example-plugin/install`,
          payload: { expectedUpdatedAt: campaign.updatedAt },
        },
        {
          label: "campaign system install",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/systems/generic-fantasy/install`,
          payload: { expectedUpdatedAt: campaign.updatedAt },
        },
        {
          label: "attunement",
          method: "POST" as const,
          url: `/api/v1/campaigns/${campaign.id}/systems/${actor.systemId}/actors/${actor.id}/attunement`,
          payload: { itemId: "missing-item", attuned: true, expectedUpdatedAt: actor.updatedAt },
        },
        {
          label: "chat",
          method: "POST" as const,
          url: "/api/v1/chat/messages",
          payload: { campaignId: campaign.id, body: "Must not be posted", type: "plain", visibility: "public" },
        },
      ];

      for (const request of requests) {
        const response = await app.inject({ ...request, headers: gmHeaders });
        expect(response.statusCode, request.label).toBe(400);
        expect(response.body, request.label).toMatch(/Idempotency-Key/i);
      }
      // The legacy test-only x-user-id compatibility shim is independently
      // audited. The rejected domain mutations must not touch primary state.
      expect(stateWithoutReadAudit(store)).toEqual(before);
    } finally {
      await app.close();
    }
  });
});
