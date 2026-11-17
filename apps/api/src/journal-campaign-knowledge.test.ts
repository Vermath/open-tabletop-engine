import { makeArchive, type JournalEntry } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };

async function createJournal(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: Record<string, unknown>,
  key: string,
): Promise<JournalEntry> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/journal",
    headers: { ...gmHeaders, "idempotency-key": key },
    payload: input,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as JournalEntry;
}

describe("journal campaign knowledge", () => {
  it("filters hidden parents, linked records, backlinks, history, and review metadata from players", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const hiddenFolder = await createJournal(app, { kind: "folder", title: "GM Lore", visibility: "gm_only" }, "journal-hidden-folder");
      const publicTarget = await createJournal(app, { title: "Public Fact", body: "Known", visibility: "public" }, "journal-public-target");
      const hiddenTarget = await createJournal(app, { title: "Hidden Fact", body: "Unknown", visibility: "gm_only" }, "journal-hidden-target");
      const publicSource = await createJournal(app, {
        title: "Public Source",
        body: "Player-safe text",
        visibility: "public",
        parentId: hiddenFolder.id,
        links: [
          { targetType: "journal", targetId: publicTarget.id, label: "Known link" },
          { targetType: "journal", targetId: hiddenTarget.id, label: "GM link" },
        ],
      }, "journal-public-source");
      await createJournal(app, {
        title: "Hidden Source",
        body: "GM-only backlink",
        visibility: "gm_only",
        links: [{ targetType: "journal", targetId: publicTarget.id }],
      }, "journal-hidden-source");

      const canon = await app.inject({
        method: "POST",
        url: `/api/v1/journal/${publicSource.id}/canon-review`,
        headers: { ...gmHeaders, "idempotency-key": "journal-public-source-canon" },
        payload: { status: "canonical", note: "Approved after secret-source review", expectedUpdatedAt: publicSource.updatedAt },
      });
      expect(canon.statusCode, canon.body).toBe(200);

      const playerList = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: playerHeaders });
      expect(playerList.statusCode).toBe(200);
      const entries = playerList.json() as JournalEntry[];
      expect(entries.map((entry) => entry.id)).toContain(publicSource.id);
      expect(entries.map((entry) => entry.id)).not.toEqual(expect.arrayContaining([hiddenFolder.id, hiddenTarget.id]));
      const playerSource = entries.find((entry) => entry.id === publicSource.id)!;
      expect(playerSource.parentId).toBeUndefined();
      expect(playerSource.links).toHaveLength(1);
      expect(playerSource.links?.[0]).toMatchObject({ targetId: publicTarget.id, label: "Known link" });
      expect(playerSource.revisions).toBeUndefined();
      expect(playerSource.canonStatus).toBe("canonical");
      expect(playerSource.canonReviewedBy).toBeUndefined();
      expect(playerSource.canonReviewNote).toBeUndefined();

      const backlinks = await app.inject({ method: "GET", url: `/api/v1/journal/${publicTarget.id}/backlinks`, headers: playerHeaders });
      expect(backlinks.statusCode).toBe(200);
      expect(backlinks.json().backlinks).toEqual([
        expect.objectContaining({ sourceEntryId: publicSource.id, sourceTitle: "Public Source" }),
      ]);

      const history = await app.inject({ method: "GET", url: `/api/v1/journal/${publicSource.id}/history`, headers: playerHeaders });
      expect(history.statusCode).toBe(403);
      const hiddenBacklinks = await app.inject({ method: "GET", url: `/api/v1/journal/${hiddenTarget.id}/backlinks`, headers: playerHeaders });
      expect(hiddenBacklinks.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("keeps edits optimistic, revisioned, audited, replay-safe, and explicitly DM-reviewed", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const entry = await createJournal(app, { title: "Founding", body: "Draft one", visibility: "public" }, "journal-founding-create");
      const createReplay = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/journal",
        headers: { ...gmHeaders, "idempotency-key": "journal-founding-create" },
        payload: { title: "Founding", body: "Draft one", visibility: "public" },
      });
      expect(createReplay.statusCode).toBe(200);
      expect(createReplay.headers["idempotency-replayed"]).toBe("true");
      expect(createReplay.json().id).toBe(entry.id);
      expect(store.state.auditLogs.filter((log) => log.action === "journal.create" && log.targetId === entry.id)).toHaveLength(1);
      const editHeaders = { ...gmHeaders, "idempotency-key": "journal-founding-edit" };
      const editPayload = { title: "Founding", body: "Draft two", expectedUpdatedAt: entry.updatedAt };
      const edited = await app.inject({ method: "PATCH", url: `/api/v1/journal/${entry.id}`, headers: editHeaders, payload: editPayload });
      expect(edited.statusCode, edited.body).toBe(200);
      expect(edited.json()).toMatchObject({ revision: 2, body: "Draft two", canonStatus: "in_review" });

      const editReplay = await app.inject({ method: "PATCH", url: `/api/v1/journal/${entry.id}`, headers: editHeaders, payload: editPayload });
      expect(editReplay.statusCode).toBe(200);
      expect(editReplay.headers["idempotency-replayed"]).toBe("true");
      expect(editReplay.json()).toEqual(edited.json());

      const stale = await app.inject({
        method: "PATCH",
        url: `/api/v1/journal/${entry.id}`,
        headers: { ...gmHeaders, "idempotency-key": "journal-founding-stale" },
        payload: { body: "Stale overwrite", expectedUpdatedAt: entry.updatedAt },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        code: "stale_write",
        resourceType: "journal",
        resourceId: entry.id,
        current: { body: "Draft two", revision: 2 },
      });

      const history = await app.inject({ method: "GET", url: `/api/v1/journal/${entry.id}/history`, headers: gmHeaders });
      expect(history.statusCode).toBe(200);
      expect(history.json()).toMatchObject({ currentRevision: 2 });
      expect(history.json().revisions).toEqual([
        expect.objectContaining({ revision: 2, body: "Draft two" }),
        expect.objectContaining({ revision: 1, body: "Draft one" }),
      ]);

      const reviewHeaders = { ...gmHeaders, "idempotency-key": "journal-founding-canon" };
      const reviewPayload = { status: "canonical", note: "Table canon", expectedUpdatedAt: edited.json().updatedAt };
      const reviewed = await app.inject({ method: "POST", url: `/api/v1/journal/${entry.id}/canon-review`, headers: reviewHeaders, payload: reviewPayload });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
      expect(reviewed.json()).toMatchObject({ revision: 3, canonStatus: "canonical", canonReviewNote: "Table canon" });

      const reviewReplay = await app.inject({ method: "POST", url: `/api/v1/journal/${entry.id}/canon-review`, headers: reviewHeaders, payload: reviewPayload });
      expect(reviewReplay.statusCode).toBe(200);
      expect(reviewReplay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.auditLogs.filter((log) => log.action === "journal.update" && log.targetId === entry.id)).toHaveLength(1);
      expect(store.state.auditLogs.filter((log) => log.action === "journal.canonReview" && log.targetId === entry.id)).toHaveLength(1);

      const archive = makeArchive(store.state, "camp_demo");
      const validation = validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 * 1024 });
      expect(validation).toMatchObject({ ok: true });
      const archivedEntry = archive.data.journals.find((candidate) => candidate.id === entry.id)!;
      expect(archivedEntry).toMatchObject({ revision: 3, canonStatus: "canonical" });
      expect(archivedEntry.revisions).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it("enforces folder hierarchy integrity and reviewed deletion concurrency", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const root = await createJournal(app, { kind: "folder", title: "Root", visibility: "public" }, "journal-root-folder");
      const child = await createJournal(app, { kind: "folder", title: "Child", visibility: "public", parentId: root.id }, "journal-child-folder");
      const cycle = await app.inject({
        method: "PATCH",
        url: `/api/v1/journal/${root.id}`,
        headers: { ...gmHeaders, "idempotency-key": "journal-folder-cycle" },
        payload: { parentId: child.id, expectedUpdatedAt: root.updatedAt },
      });
      expect(cycle.statusCode).toBe(400);

      const nonEmptyDelete = await app.inject({
        method: "DELETE",
        url: `/api/v1/journal/${root.id}?expectedUpdatedAt=${encodeURIComponent(root.updatedAt)}`,
        headers: { ...gmHeaders, "idempotency-key": "journal-root-delete" },
      });
      expect(nonEmptyDelete.statusCode).toBe(409);

      const childDeleteHeaders = { ...gmHeaders, "idempotency-key": "journal-child-delete" };
      const childDeleteUrl = `/api/v1/journal/${child.id}?expectedUpdatedAt=${encodeURIComponent(child.updatedAt)}`;
      const deleted = await app.inject({ method: "DELETE", url: childDeleteUrl, headers: childDeleteHeaders });
      expect(deleted.statusCode).toBe(200);
      const replay = await app.inject({ method: "DELETE", url: childDeleteUrl, headers: childDeleteHeaders });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(store.state.auditLogs.filter((log) => log.action === "journal.delete" && log.targetId === child.id)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
