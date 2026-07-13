import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JournalEntry } from "@open-tabletop/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JournalPanel, journalDraftPayload, journalVisibilityHasTargets } from "./journal-panel.js";

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
    expect(appSource).toContain("const actorOwnerUserIds = targets.visibleToActorIds");
    expect(appSource).toContain("visibleToUserIds,");
    expect(appSource).toContain("visibleToActorIds: targets.visibleToActorIds");
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
      title: " Updated clue ",
      body: " Keep the bell safe. ",
      visibility: "specific_characters",
      visibleToUserIds: ["usr-1"],
      visibleToActorIds: ["actor-1", "actor-1"],
      tags: "clue, bell, clue"
    })).toEqual({
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      title: "Updated clue",
      body: "Keep the bell safe.",
      visibility: "specific_characters",
      visibleToUserIds: [],
      visibleToActorIds: ["actor-1"],
      tags: ["clue", "bell"]
    });
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
      journals: [journal],
      members: [],
      actors: [],
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
      onGenerateRecap: () => undefined,
      canCreate: false
    };
    const reader = renderToStaticMarkup(createElement(JournalPanel, { ...props, canUpdate: false, canDelete: false }));
    const editor = renderToStaticMarkup(createElement(JournalPanel, { ...props, canUpdate: true, canDelete: true }));

    expect(reader).not.toContain(" Edit</button>");
    expect(reader).not.toContain(" Delete</button>");
    expect(editor).toContain(" Edit</button>");
    expect(editor).toContain(" Delete</button>");
  });
});
