import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JournalEntry } from "@open-tabletop/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clearJournalDraftAfterConfirmedSave, JournalEntryEditor, JournalPanel, journalDraftPayload, journalHierarchyRows, journalLinkDisplay, journalRevisionStateKey, journalUpdateIdempotencyKey, journalVisibilityHasTargets, storedJournalDraft, type JournalDraft } from "./journal-panel.js";
import { localDraftKey, removeLocalDraft, writeLocalDraft } from "./local-draft-storage.js";

describe("journal visibility targeting", () => {
  it("requires a matching target for scoped visibility", () => {
    expect(journalVisibilityHasTargets("public", [], [])).toBe(true);
    expect(journalVisibilityHasTargets("gm_only", [], [])).toBe(true);
    expect(journalVisibilityHasTargets("specific_players", [], [])).toBe(false);
    expect(journalVisibilityHasTargets("specific_players", ["user_1"], [])).toBe(true);
    expect(journalVisibilityHasTargets("specific_characters", [], [])).toBe(false);
    expect(journalVisibilityHasTargets("specific_characters", [], ["actor_1"])).toBe(true);
  });

  it("submits both scoped ids and character-owner user ids", () => {
    const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
    expect(appSource).toContain("const actorOwnerUserIds = options.visibleToActorIds");
    expect(appSource).toContain("visibleToUserIds,");
    expect(appSource).toContain("visibleToActorIds: options.visibleToActorIds");
  });

  it("keeps create failures visible and retryable instead of logging them only to the console", () => {
    const panelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
    expect(panelSource).toContain("setCreateError(errorMessage(createFailure))");
    expect(panelSource).toContain('role="alert">Journal creation failed:');
    expect(panelSource).not.toContain("createEntry().catch(console.error)");
  });

  it("normalizes editable journal fields without leaking stale visibility targets", () => {
    expect(journalDraftPayload({
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      kind: "entry",
      title: " Updated clue ",
      body: " Keep the bell safe. ",
      visibility: "specific_characters",
      visibleToUserIds: ["usr-1"],
      visibleToActorIds: ["actor-1", "actor-1"],
      tags: "clue, bell, clue",
      links: []
    })).toEqual({
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      kind: "entry",
      parentId: null,
      title: "Updated clue",
      body: "Keep the bell safe.",
      visibility: "specific_characters",
      visibleToUserIds: [],
      visibleToActorIds: ["actor-1"],
      tags: ["clue", "bell"],
      links: []
    });
  });

  it("reuses a retry key for one draft but allocates a different opaque key for a corrected draft at the same revision", () => {
    const draft: JournalDraft = {
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      kind: "entry",
      title: "Vault clue",
      body: "First wording",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: "clue",
      links: []
    };
    const first = journalUpdateIdempotencyKey("journal-1", draft);
    const retry = journalUpdateIdempotencyKey("journal-1", { ...draft });
    const corrected = journalUpdateIdempotencyKey("journal-1", { ...draft, body: "Corrected wording" });
    expect(retry).toBe(first);
    expect(corrected).not.toBe(first);
    expect(corrected).not.toContain("Corrected wording");
  });

  it("resets transient editor, history, and retry state when a realtime journal revision arrives", () => {
    const before = journalRevisionStateKey({ updatedAt: "2026-01-01T00:00:00.000Z", canonStatus: "in_review" });
    const revised = journalRevisionStateKey({ updatedAt: "2026-01-01T00:01:00.000Z", canonStatus: "in_review" });
    const reviewed = journalRevisionStateKey({ updatedAt: "2026-01-01T00:01:00.000Z", canonStatus: "canonical" });
    const panelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");

    expect(revised).not.toBe(before);
    expect(reviewed).not.toBe(revised);
    expect(panelSource).toContain("}, [revisionStateKey]);");
    expect(panelSource).toContain("setHistory(null)");
    expect(panelSource).toContain("deleteKeyRef.current = null");
    expect(panelSource).toContain("reviewAttemptRef.current = null");
    expect(panelSource).toContain("<JournalEntryEditor key={revisionStateKey}");
  });

  it("shows journal lifecycle controls only to seats with matching permissions", () => {
    const journal: JournalEntry = {
      id: "journal-1",
      campaignId: "camp-1",
      title: "Vault clue",
      body: "Ring the bell.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["clue"],
      createdBy: "usr-1",
      updatedBy: "usr-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const props = {
      campaignId: "camp-1",
      currentUserId: "usr-1",
      journals: [journal],
      members: [],
      actors: [],
      linkTargets: [],
      title: "",
      setTitle: () => undefined,
      body: "",
      setBody: () => undefined,
      visibility: "gm_only" as const,
      setVisibility: () => undefined,
      tags: "",
      setTags: () => undefined,
      onCreate: async () => undefined,
      onUpdate: async () => undefined,
      onDelete: async () => undefined,
      onGenerateRecap: async () => undefined,
      onCanonReview: async () => undefined,
      canCreate: false,
      canReadHistory: false,
      canCanonReview: false
    };
    const reader = renderToStaticMarkup(createElement(JournalPanel, { ...props, canUpdate: false, canDelete: false }));
    const editor = renderToStaticMarkup(createElement(JournalPanel, { ...props, canUpdate: true, canDelete: true }));

    expect(reader).not.toContain(" Edit</button>");
    expect(reader).not.toContain(" Delete</button>");
    expect(editor).toContain(" Edit</button>");
    expect(editor).toContain(" Delete</button>");
  });

  it("orders visible folder hierarchies without relying on array order", () => {
    const base: JournalEntry = {
      id: "entry-child",
      campaignId: "camp-1",
      parentId: "folder-lore",
      kind: "entry",
      title: "Ancient bell",
      body: "Ring it once.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: [],
      links: [],
      revision: 1,
      canonStatus: "in_review",
      createdBy: "usr-1",
      updatedBy: "usr-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const folder: JournalEntry = { ...base, id: "folder-lore", parentId: undefined, kind: "folder", title: "Lore" };
    expect(journalHierarchyRows([base, folder])).toEqual([
      { journal: folder, depth: 0 },
      { journal: base, depth: 1 }
    ]);
  });

  it("renders typed links plus permission-gated history and canon review controls", () => {
    const journal: JournalEntry = {
      id: "journal-linked",
      campaignId: "camp-1",
      kind: "entry",
      title: "Founder",
      body: "The founder sealed the vault.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["lore"],
      links: [{ id: "link-founder", targetType: "actor", targetId: "actor-founder", label: "Founder" }],
      revision: 3,
      canonStatus: "canonical",
      createdBy: "usr-1",
      updatedBy: "usr-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    };
    const common = {
      campaignId: "camp-1", currentUserId: "usr-1",
      journals: [journal], members: [], actors: [], linkTargets: [{ type: "actor" as const, id: "actor-founder", label: "Elian Vale" }], title: "", setTitle: () => undefined,
      body: "", setBody: () => undefined, visibility: "gm_only" as const, setVisibility: () => undefined,
      tags: "", setTags: () => undefined, onCreate: async () => undefined, onUpdate: async () => undefined,
      onDelete: async () => undefined, onGenerateRecap: async () => undefined, onCanonReview: async () => undefined,
      canCreate: false, canUpdate: false, canDelete: false
    };
    const player = renderToStaticMarkup(createElement(JournalPanel, { ...common, canReadHistory: false, canCanonReview: false }));
    const gm = renderToStaticMarkup(createElement(JournalPanel, { ...common, canReadHistory: true, canCanonReview: true }));
    expect(player).toContain("Knowledge graph");
    expect(player).toContain("Elian Vale");
    expect(player).toContain("Founder");
    expect(player).not.toContain("History</button>");
    expect(player).not.toContain("Campaign canon review");
    expect(gm).toContain("History</button>");
    expect(gm).toContain("Campaign canon review");
  });

  it("resolves typed graph targets while preserving relationship labels", () => {
    expect(journalLinkDisplay(
      { id: "link-one", targetType: "scene", targetId: "scene-one", label: "Located in" },
      [{ type: "scene", id: "scene-one", label: "Ember Vault" }],
    )).toEqual({ type: "scene", target: "Ember Vault", relationship: "Located in" });
  });

  it("validates versioned journal drafts and wires create and edit recovery", () => {
    const draft = storedJournalDraft({
      kind: "entry",
      title: "Recovered clue",
      body: "Keep the bell safe.",
      visibility: "gm_only",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: "clue",
      links: []
    });
    const panelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
    expect(draft?.title).toBe("Recovered clue");
    expect(storedJournalDraft({ ...draft, links: [{ id: 42 }] })).toBeUndefined();
    expect(panelSource).toContain('localDraftKey("journal-create"');
    expect(panelSource).toContain('localDraftKey("journal-edit"');
    expect(panelSource).toContain("Discard journal draft");
    expect(panelSource).toContain("Close and keep draft");
  });

  it("renders campaign and user scoped create drafts without carrying A into B", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const priorWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
    try {
      const draft: JournalDraft = {
        kind: "entry",
        title: "Campaign A clue",
        body: "Only user A should recover this.",
        visibility: "gm_only",
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: "clue",
        links: [],
      };
      writeLocalDraft(localDraftKey("journal-create", "campaign-a", "user-a"), draft, storage);
      const renderPanel = (campaignId: string, currentUserId: string) => renderToStaticMarkup(createElement(JournalPanel, {
        campaignId,
        currentUserId,
        journals: [],
        members: [],
        actors: [],
        linkTargets: [],
        onCreate: async () => undefined,
        onUpdate: async () => undefined,
        onDelete: async () => undefined,
        onGenerateRecap: async () => undefined,
        onCanonReview: async () => undefined,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canReadHistory: true,
        canCanonReview: true,
      }));

      const campaignAUserA = renderPanel("campaign-a", "user-a");
      const campaignBUserA = renderPanel("campaign-b", "user-a");
      const campaignAUserB = renderPanel("campaign-a", "user-b");

      expect(campaignAUserA).toContain("Campaign A clue");
      expect(campaignAUserA).toContain("Journal draft saved in this browser");
      expect(campaignBUserA).not.toContain("Campaign A clue");
      expect(campaignAUserB).not.toContain("Campaign A clue");
    } finally {
      if (priorWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
    }
  });

  it("renders journal edits as immutable while an async save is pending", () => {
    const journal: JournalEntry = {
      id: "journal-saving",
      campaignId: "campaign-a",
      kind: "entry",
      title: "Saving clue",
      body: "Wait for confirmation.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["clue"],
      links: [],
      revision: 1,
      canonStatus: "draft",
      createdBy: "user-a",
      updatedBy: "user-a",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const html = renderToStaticMarkup(createElement(JournalEntryEditor, {
      campaignId: "campaign-a",
      currentUserId: "user-a",
      journal,
      folders: [],
      members: [],
      actors: [],
      linkTargets: [],
      busy: true,
      onSave: async () => true,
      onSaved: () => undefined,
      onCancel: () => undefined,
    }));

    expect(html).toMatch(/aria-label="Edit journal title"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Edit journal body"[^>]*disabled/);
    expect(html).toMatch(/class="operator-section journal-links-editor"[^>]*disabled/);
    expect(html).toContain("Save changes</button>");
  });

  it("renders the recovered journal edit after an error and clears it only after success", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const priorWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
    try {
      const journal: JournalEntry = {
        id: "journal-recovery",
        campaignId: "campaign-a",
        kind: "entry",
        title: "Server title",
        body: "Server body",
        visibility: "gm_only",
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: ["prep"],
        links: [],
        revision: 1,
        canonStatus: "draft",
        createdBy: "user-a",
        updatedBy: "user-a",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const draft: JournalDraft = {
        expectedUpdatedAt: journal.updatedAt,
        kind: "entry",
        title: "Recovered edit",
        body: "Do not lose this text.",
        visibility: "gm_only",
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: "prep",
        links: [],
      };
      const key = localDraftKey("journal-edit", "campaign-a", "user-a", journal.id);
      writeLocalDraft(key, draft, storage);
      const renderEditor = () => renderToStaticMarkup(createElement(JournalEntryEditor, {
        campaignId: "campaign-a",
        currentUserId: "user-a",
        journal,
        folders: [],
        members: [],
        actors: [],
        linkTargets: [],
        busy: false,
        onSave: async () => false,
        onSaved: () => undefined,
        onCancel: () => undefined,
      }));

      expect(renderEditor()).toContain("Recovered edit");
      await expect(clearJournalDraftAfterConfirmedSave(draft, async () => false, () => removeLocalDraft(key, storage))).resolves.toBe(false);
      expect(renderEditor()).toContain("Recovered edit");
      await expect(clearJournalDraftAfterConfirmedSave(draft, async () => { throw new Error("offline"); }, () => removeLocalDraft(key, storage))).rejects.toThrow("offline");
      expect(renderEditor()).toContain("Recovered edit");
      await expect(clearJournalDraftAfterConfirmedSave(draft, async () => true, () => removeLocalDraft(key, storage))).resolves.toBe(true);
      const afterSuccess = renderEditor();
      expect(afterSuccess).toContain("Server title");
      expect(afterSuccess).not.toContain("Recovered edit");
      expect(afterSuccess).not.toContain("Journal edit draft saved in this browser");
    } finally {
      if (priorWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
    }
  });
});
