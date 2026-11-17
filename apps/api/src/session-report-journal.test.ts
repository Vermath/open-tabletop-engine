import { createTimestamped, type CampaignSession, type JournalEntry } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const observerHeaders = { "x-user-id": "usr_demo_observer" };

const payload = {
  kind: "entry" as const,
  title: "Session report - 12 - The Broken Vault",
  body: [
    "Update the structured observations as play continues.",
    "",
    "```json",
    JSON.stringify({
      schema: "otte.session-report/v1",
      session_id: "cses-vault-12",
      session_number: 12,
      session_status: "live",
      breakage: "not_recorded",
      corrections: "not_recorded",
      recovery: "not_recorded",
      privacy: "not_recorded",
      manual_rulings: "not_recorded"
    }, null, 2),
    "```"
  ].join("\n"),
  visibility: "gm_only" as const,
  visibleToUserIds: [],
  visibleToActorIds: [],
  tags: ["session-report", "dogfood:x01", "session:cses-vault-12"],
  links: []
};

describe("session report journal persistence", () => {
  it("denies player creation, persists one replay-safe GM report, and never discloses it to readers", async () => {
    const store = new MemoryStateStore();
    store.state.users.push(createTimestamped("usr", { id: "usr_demo_observer", displayName: "Demo Observer", email: "observer@example.test" }));
    store.state.organizationMembers.push(createTimestamped("orgmem", { organizationId: "org_demo", userId: "usr_demo_observer", role: "member" as const }));
    store.state.members.push(createTimestamped("mem", { campaignId: "camp_demo", userId: "usr_demo_observer", role: "observer" as const }));
    const app = await buildApp({ store });
    const reportCount = () => store.state.journals.filter((entry) => entry.tags.includes("session-report")).length;

    try {
      const denied = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/journal",
        headers: { ...playerHeaders, "idempotency-key": "session-report-player-denied" },
        payload
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ error: "forbidden", message: "Missing permission: journal.create" });
      expect(reportCount()).toBe(0);

      const headers = { ...gmHeaders, "idempotency-key": "session-report-vault-12" };
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/journal",
        headers,
        payload
      });
      expect(created.statusCode, created.body).toBe(200);
      const journal = created.json() as JournalEntry;
      expect(journal).toMatchObject(payload);
      expect(journal.createdBy).toBe("usr_demo_gm");
      expect(reportCount()).toBe(1);
      expect(store.state.journals.find((entry) => entry.id === journal.id)).toMatchObject(payload);

      const replay = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/journal",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.json().id).toBe(journal.id);
      expect(reportCount()).toBe(1);

      const [gmList, playerList, observerList] = await Promise.all([
        app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: gmHeaders }),
        app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: playerHeaders }),
        app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: observerHeaders })
      ]);
      expect(gmList.statusCode).toBe(200);
      expect(playerList.statusCode).toBe(200);
      expect(observerList.statusCode).toBe(200);
      expect((gmList.json() as JournalEntry[]).some((entry) => entry.id === journal.id)).toBe(true);
      expect((playerList.json() as JournalEntry[]).some((entry) => entry.id === journal.id)).toBe(false);
      expect((observerList.json() as JournalEntry[]).some((entry) => entry.id === journal.id)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("keeps only validated GM-only reports synchronized with session lifecycle changes", async () => {
    const store = new MemoryStateStore();
    const session = createTimestamped("cses", {
      id: "cses-vault-12",
      campaignId: "camp_demo",
      status: "planned" as const,
      title: "The Broken Vault",
      number: 12,
      agenda: "Open the vault",
      notes: "",
      sceneIds: [],
      encounterIds: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm"
    }) satisfies CampaignSession;
    store.state.campaignSessions.push(session);
    const lifecyclePayload = {
      ...payload,
      body: payload.body.replace('"breakage": "not_recorded"', '"breakage": "initiative controls briefly lagged"')
    };
    const publicLookalike = createTimestamped("jnl", {
      id: "jnl-public-session-report-lookalike",
      campaignId: session.campaignId,
      ...payload,
      visibility: "public" as const,
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm"
    }) satisfies JournalEntry;
    const malformedPrivateReport = createTimestamped("jnl", {
      id: "jnl-malformed-private-session-report",
      campaignId: session.campaignId,
      ...payload,
      body: "Private notes without a structured report block.",
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm"
    }) satisfies JournalEntry;
    store.state.journals.push(publicLookalike, malformedPrivateReport);
    const app = await buildApp({ store });

    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/journal",
        headers: { ...gmHeaders, "idempotency-key": "session-report-lifecycle-create" },
        payload: lifecyclePayload
      });
      expect(created.statusCode, created.body).toBe(200);
      const reportId = created.json().id as string;

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaign-sessions/${session.id}`,
        headers: { ...gmHeaders, "idempotency-key": "session-report-lifecycle-update" },
        payload: { title: "The Broken Vault, Revised", expectedUpdatedAt: session.updatedAt }
      });
      expect(updated.statusCode, updated.body).toBe(200);
      expect(reportStatus(store.state.journals.find((entry) => entry.id === reportId)!.body)).toBe("planned");

      const started = await app.inject({
        method: "POST",
        url: `/api/v1/campaign-sessions/${session.id}/start`,
        headers: { ...gmHeaders, "idempotency-key": "session-report-lifecycle-start" },
        payload: { expectedUpdatedAt: updated.json().updatedAt }
      });
      expect(started.statusCode, started.body).toBe(200);
      expect(reportStatus(store.state.journals.find((entry) => entry.id === reportId)!.body)).toBe("live");

      const completed = await app.inject({
        method: "POST",
        url: `/api/v1/campaign-sessions/${session.id}/complete`,
        headers: { ...gmHeaders, "idempotency-key": "session-report-lifecycle-complete" },
        payload: { notes: "Vault cleared", expectedUpdatedAt: started.json().updatedAt }
      });
      expect(completed.statusCode, completed.body).toBe(200);

      const synchronized = store.state.journals.find((entry) => entry.id === reportId)!;
      expect(reportStatus(synchronized.body)).toBe("completed");
      expect(reportData(synchronized.body)).toMatchObject({
        session_status: "completed",
        breakage: "initiative controls briefly lagged",
        corrections: "not_recorded",
        recovery: "not_recorded",
        privacy: "not_recorded",
        manual_rulings: "not_recorded"
      });
      expect(synchronized).toMatchObject({ visibility: "gm_only", revision: 4, updatedBy: "usr_demo_gm", canonStatus: "in_review" });
      expect(synchronized.revisions).toHaveLength(3);
      expect(reportStatus(publicLookalike.body)).toBe("live");
      expect(malformedPrivateReport.body).toBe("Private notes without a structured report block.");

      const syncAudits = store.state.auditLogs.filter((entry) => entry.action === "journal.sessionReport.sync" && entry.targetId === reportId);
      expect(syncAudits.map((entry) => entry.after)).toEqual([
        expect.objectContaining({ sessionId: session.id, sessionStatus: "planned", visibility: "gm_only", revision: 2 }),
        expect.objectContaining({ sessionId: session.id, sessionStatus: "live", visibility: "gm_only", revision: 3 }),
        expect.objectContaining({ sessionId: session.id, sessionStatus: "completed", visibility: "gm_only", revision: 4 })
      ]);
      expect(JSON.stringify(syncAudits)).not.toContain("manual_rulings");

      const playerList = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: playerHeaders });
      expect((playerList.json() as JournalEntry[]).some((entry) => entry.id === reportId)).toBe(false);
    } finally {
      await app.close();
    }
  });
});

function reportStatus(body: string): unknown {
  return reportData(body)?.session_status;
}

function reportData(body: string): Record<string, unknown> | undefined {
  const block = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/)?.[1];
  return block ? JSON.parse(block) as Record<string, unknown> : undefined;
}
