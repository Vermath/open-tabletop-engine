import { describe, expect, it } from "vitest";
import { makeArchive, normalizeEngineState, normalizeJournalEntry, seedState } from "./state.js";
import type { JournalEntry } from "./types.js";

describe("journal campaign knowledge state", () => {
  it("normalizes legacy entries without promoting them to campaign canon", () => {
    const legacy = seedState().journals[0]!;
    const normalized = normalizeJournalEntry({
      ...legacy,
      kind: undefined,
      links: undefined,
      revision: undefined,
      revisions: undefined,
      canonStatus: undefined,
    });

    expect(normalized).toMatchObject({
      kind: "entry",
      links: [],
      revision: 1,
      revisions: [],
      canonStatus: "draft",
    });
  });

  it("round-trips folders, typed links, revision history, and canon review through campaign archives", () => {
    const state = normalizeEngineState(seedState());
    const source = state.journals[0]!;
    const folder: JournalEntry = {
      ...source,
      id: "jnl_lore_folder",
      kind: "folder",
      title: "Lore",
      body: "",
      links: [],
      revision: 1,
      revisions: [],
      canonStatus: "draft",
    };
    const linked: JournalEntry = {
      ...source,
      id: "jnl_lore_fact",
      parentId: folder.id,
      kind: "entry",
      title: "Founder",
      body: "The founder sealed the vault.",
      links: [{ id: "jlnk_founder_actor", targetType: "actor", targetId: "act_valen", label: "Witness" }],
      revision: 2,
      revisions: [{
        id: "jrev_founder_1",
        revision: 1,
        kind: "entry",
        parentId: folder.id,
        title: "Founder",
        body: "Draft",
        visibility: source.visibility,
        visibleToUserIds: [],
        visibleToActorIds: [],
        tags: ["lore"],
        links: [],
        canonStatus: "in_review",
        changedBy: source.updatedBy,
        createdAt: source.createdAt,
      }],
      canonStatus: "canonical",
      canonReviewedBy: source.updatedBy,
      canonReviewedAt: source.updatedAt,
    };
    state.journals.push(folder, linked);

    const archive = makeArchive(state, "camp_demo");
    const archived = archive.data.journals.find((entry) => entry.id === linked.id)!;
    const restored = normalizeEngineState(archive.data).journals.find((entry) => entry.id === linked.id)!;

    expect(archived).toEqual(linked);
    expect(restored).toMatchObject({
      parentId: folder.id,
      links: linked.links,
      revision: 2,
      canonStatus: "canonical",
    });
    expect(restored.revisions).toEqual(linked.revisions);
  });
});
