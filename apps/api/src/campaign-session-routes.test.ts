import type { CampaignSession } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

describe("campaign session route module", () => {
  it("preserves the permission, idempotency, revision, lifecycle, and audit contract", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    const campaignId = "camp_demo";
    const sceneId = store.state.scenes.find((scene) => scene.campaignId === campaignId)!.id;
    const collectionUrl = `/api/v1/campaigns/${campaignId}/sessions`;

    try {
      expect((await app.inject({ method: "GET", url: collectionUrl, headers: playerHeaders })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: collectionUrl, headers: { ...gmHeaders, "idempotency-key": "" }, payload: { title: "Session one" } })).statusCode).toBe(400);

      const created = await app.inject({
        method: "POST",
        url: collectionUrl,
        headers: { ...gmHeaders, "idempotency-key": "session-create" },
        payload: { title: "Session one", agenda: "Open at the ruins", sceneIds: [sceneId] },
      });
      expect(created.statusCode).toBe(200);
      const session = created.json() as CampaignSession;
      expect(session).toMatchObject({ campaignId, status: "planned", title: "Session one", sceneIds: [sceneId] });

      const stalePatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaign-sessions/${session.id}`,
        headers: { ...gmHeaders, "idempotency-key": "session-patch-stale" },
        payload: { notes: "stale", expectedUpdatedAt: "1970-01-01T00:00:00.000Z" },
      });
      expect(stalePatch.statusCode).toBe(409);

      const patched = await app.inject({
        method: "PATCH",
        url: `/api/v1/campaign-sessions/${session.id}`,
        headers: { ...gmHeaders, "idempotency-key": "session-patch" },
        payload: { notes: "Revised notes", expectedUpdatedAt: session.updatedAt },
      });
      expect(patched.statusCode).toBe(200);
      const updated = patched.json() as CampaignSession;

      const started = await app.inject({
        method: "POST",
        url: `/api/v1/campaign-sessions/${session.id}/start`,
        headers: { ...gmHeaders, "idempotency-key": "session-start" },
        payload: { expectedUpdatedAt: updated.updatedAt, activateSceneId: sceneId },
      });
      expect(started.statusCode).toBe(200);
      const live = started.json() as CampaignSession;
      expect(live.status).toBe("live");

      const completed = await app.inject({
        method: "POST",
        url: `/api/v1/campaign-sessions/${session.id}/complete`,
        headers: { ...gmHeaders, "idempotency-key": "session-complete" },
        payload: { expectedUpdatedAt: live.updatedAt, notes: "The ruins were secured." },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({ status: "completed", notes: "The ruins were secured." });

      const disposable = await app.inject({
        method: "POST",
        url: collectionUrl,
        headers: { ...gmHeaders, "idempotency-key": "session-create-disposable" },
        payload: { title: "Disposable prep" },
      });
      const disposableSession = disposable.json() as CampaignSession;
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/v1/campaign-sessions/${disposableSession.id}?expectedUpdatedAt=${encodeURIComponent(disposableSession.updatedAt)}`,
        headers: { ...gmHeaders, "idempotency-key": "session-delete" },
      });
      expect(deleted.statusCode).toBe(200);
      expect(store.state.campaignSessions.some((candidate) => candidate.id === disposableSession.id)).toBe(false);
      expect(store.state.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining([
        "campaign.session.create",
        "campaign.session.update",
        "campaign.session.start",
        "campaign.session.complete",
        "campaign.session.delete",
      ]));
    } finally {
      await app.close();
    }
  });
});
