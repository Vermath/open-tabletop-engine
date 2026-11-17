import {
  createTimestamped,
  type CampaignSession,
  type JournalEntry,
  type PermissionGrant,
  type Proposal,
  type User,
} from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

describe("feature integration safety", () => {
  it("requires the inverse domain permission before reverting an applied proposal", async () => {
    const store = new MemoryStateStore();
    store.state.permissionGrants.push(
      createTimestamped("grant", {
        campaignId: "camp_demo",
        subjectType: "user" as const,
        subjectId: "usr_demo_player",
        permissions: ["ai.applyChanges"],
      }) satisfies PermissionGrant,
    );
    const scene = store.state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const originalName = scene.name;
    const proposal = createTimestamped("prop", {
      campaignId: scene.campaignId,
      createdByUserId: "usr_demo_gm",
      createdByType: "ai" as const,
      title: "Rename a scene",
      summary: "A reversible scene update.",
      status: "approved" as const,
      changesJson: [{ entity: "scene" as const, action: "update" as const, id: scene.id, data: { name: "Applied scene name" } }],
      diffJson: {},
      approvalRequired: true,
      approvedByUserId: "usr_demo_gm",
    }) satisfies Proposal;
    store.state.proposals.push(proposal);
    const app = await buildApp({ store });

    try {
      const applied = await app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: { ...gmHeaders, "idempotency-key": "feature-safety-apply" }, payload: { expectedUpdatedAt: proposal.updatedAt } });
      expect(applied.statusCode).toBe(200);
      expect(store.state.scenes.find((item) => item.id === scene.id)?.name).toBe("Applied scene name");

      const blocked = await app.inject({
        method: "POST",
        url: `/api/v1/proposals/${proposal.id}/revert`,
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "feature-safety-blocked-revert" },
        payload: { expectedUpdatedAt: applied.json().updatedAt },
      });

      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({ error: "forbidden", message: "Missing permission: scene.update" });
      expect(store.state.scenes.find((item) => item.id === scene.id)?.name).toBe("Applied scene name");
      expect(store.state.proposals.find((item) => item.id === proposal.id)?.status).toBe("applied");
      expect(originalName).not.toBe("Applied scene name");
    } finally {
      await app.close();
    }
  });

  it("links recap journals only on apply and clears the association on reject or revert", async () => {
    const store = new MemoryStateStore();
    const session: CampaignSession = createTimestamped("cses", {
      campaignId: "camp_demo",
      status: "completed" as const,
      title: "Integration recap session",
      number: 42,
      agenda: "",
      notes: "",
      sceneIds: [],
      encounterIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
    });
    const rejectedProposal = createTimestamped("prop", {
      campaignId: "camp_demo",
      createdByUserId: "usr_demo_gm",
      createdByType: "ai" as const,
      title: "Rejected recap",
      summary: "Should not remain linked.",
      status: "pending" as const,
      changesJson: [],
      diffJson: { sessionId: session.id },
      approvalRequired: true,
    }) satisfies Proposal;
    session.recapProposalId = rejectedProposal.id;
    session.recapJournalId = "jnl_stale_recap";
    store.state.campaignSessions.push(session);
    store.state.proposals.push(rejectedProposal);
    const app = await buildApp({ store });
    const currentSession = () => store.state.campaignSessions.find((item) => item.id === session.id)!;

    try {
      const rejected = await app.inject({ method: "POST", url: `/api/v1/proposals/${rejectedProposal.id}/reject`, headers: { ...gmHeaders, "idempotency-key": "feature-safety-reject" }, payload: { expectedUpdatedAt: rejectedProposal.updatedAt } });
      expect(rejected.statusCode).toBe(200);
      expect(currentSession().recapProposalId).toBeUndefined();
      expect(currentSession().recapJournalId).toBeUndefined();

      const recapJournal = createTimestamped("jnl", {
        campaignId: "camp_demo",
        title: "Applied recap",
        body: "Reviewed recap body.",
        visibility: "public" as const,
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: ["recap"],
        createdBy: "usr_demo_gm",
        updatedBy: "usr_demo_gm",
      }) satisfies JournalEntry;
      const appliedProposal = createTimestamped("prop", {
        campaignId: "camp_demo",
        createdByUserId: "usr_demo_gm",
        createdByType: "ai" as const,
        title: "Applied recap",
        summary: "Links only after apply.",
        status: "approved" as const,
        changesJson: [{ entity: "journal" as const, action: "create" as const, data: recapJournal as unknown as Record<string, unknown> }],
        diffJson: { sessionId: session.id },
        approvalRequired: true,
        approvedByUserId: "usr_demo_gm",
      }) satisfies Proposal;
      store.state.proposals.push(appliedProposal);

      const applied = await app.inject({ method: "POST", url: `/api/v1/proposals/${appliedProposal.id}/apply`, headers: { ...gmHeaders, "idempotency-key": "feature-safety-recap-apply" }, payload: { expectedUpdatedAt: appliedProposal.updatedAt } });
      expect(applied.statusCode).toBe(200);
      expect(currentSession().recapProposalId).toBe(appliedProposal.id);
      expect(currentSession().recapJournalId).toBe(recapJournal.id);

      const reverted = await app.inject({ method: "POST", url: `/api/v1/proposals/${appliedProposal.id}/revert`, headers: { ...gmHeaders, "idempotency-key": "feature-safety-recap-revert" }, payload: { expectedUpdatedAt: applied.json().updatedAt } });
      expect(reverted.statusCode, reverted.body).toBe(200);
      expect(store.state.journals.some((journal) => journal.id === recapJournal.id)).toBe(false);
      expect(currentSession().recapProposalId).toBeUndefined();
      expect(currentSession().recapJournalId).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("allows a server-admin worker identity to build a report bundle without campaign membership", async () => {
    const store = new MemoryStateStore();
    const workerAdmin = createTimestamped("usr", {
      displayName: "Report Worker Admin",
      email: "report-worker@example.test",
      serverAdmin: true,
    }) satisfies User;
    store.state.users.push(workerAdmin);
    expect(store.state.members.some((member) => member.userId === workerAdmin.id)).toBe(false);
    const app = await buildApp({ store });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/dogfood-report-bundle",
        headers: { "x-user-id": workerAdmin.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ format: "otte-dogfood-report-bundle", privacy: { mode: "redacted" } });
    } finally {
      await app.close();
    }
  });
});
