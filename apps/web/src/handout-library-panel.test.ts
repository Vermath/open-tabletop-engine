import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handoutPayload, mergeHandoutReadReceipt, upsertHandoutItem, type HandoutLibraryItem } from "./handout-library-panel.js";

const panelSource = readFileSync(resolve(__dirname, "handout-library-panel.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("handout collection updates", () => {
  it("sends the version captured when an existing handout editor opened", () => {
    expect(handoutPayload({
      id: "handout-1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      worldId: "",
      title: " Updated clue ",
      body: " Current text ",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      assetIds: [],
      tags: "clue"
    })).toMatchObject({
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      title: "Updated clue",
      body: "Current text"
    });
  });

  it("preserves both read receipts when overlapping requests complete", () => {
    const first = handout("handout-1");
    const second = handout("handout-2");
    const firstRead = { ...first, readByUserIds: ["user-1"] };
    const secondRead = { ...second, readByUserIds: ["user-1"] };

    const afterFirst = mergeHandoutReadReceipt([first, second], firstRead);
    const afterSecond = mergeHandoutReadReceipt(afterFirst, secondRead);

    expect(afterSecond.map((item) => [item.id, item.readByUserIds])).toEqual([
      ["handout-1", ["user-1"]],
      ["handout-2", ["user-1"]]
    ]);
  });

  it("does not duplicate a create response already delivered by realtime", () => {
    const realtime = handout("handout-new", { title: "Server title" });
    const response = handout("handout-new", { title: "Saved title" });

    expect(upsertHandoutItem([realtime], response, true)).toEqual([response]);
  });

  it("keeps newer read receipts when an older save response resolves", () => {
    const current = handout("handout-1", { title: "Old title", readByUserIds: ["user-2"] });
    const saveResponse = handout("handout-1", { title: "Updated title", readByUserIds: ["user-1"] });

    expect(upsertHandoutItem([current], saveResponse)).toEqual([
      { ...saveResponse, readByUserIds: ["user-2", "user-1"] }
    ]);
  });

  it("does not let a stale save response overwrite newer realtime content", () => {
    const realtime = handout("handout-1", {
      title: "Realtime title",
      body: "Realtime body",
      readByUserIds: ["user-2"],
      updatedAt: "2026-01-03T00:00:00.000Z"
    });
    const staleSave = handout("handout-1", {
      title: "Stale save",
      body: "Stale body",
      readByUserIds: ["user-1"],
      updatedAt: "2026-01-02T00:00:00.000Z"
    });

    expect(upsertHandoutItem([realtime], staleSave)).toEqual([
      { ...realtime, readByUserIds: ["user-2", "user-1"] }
    ]);
  });

  it("does not resurrect an item removed while a read receipt was pending", () => {
    expect(mergeHandoutReadReceipt([], handout("handout-deleted", { readByUserIds: ["user-1"] }))).toEqual([]);
  });

  it("merges only receipt state so a delayed response cannot overwrite newer content", () => {
    const current = handout("handout-1", { title: "New title", body: "New body", readByUserIds: ["user-2"] });
    const staleReceipt = handout("handout-1", { title: "Old title", body: "Old body", readByUserIds: ["user-1"] });

    expect(mergeHandoutReadReceipt([current], staleReceipt)).toEqual([
      { ...current, readByUserIds: ["user-2", "user-1"] }
    ]);
  });

  it("passes functional updates to the parent instead of rebuilding stale props", () => {
    expect(panelSource).toContain("props.onHandoutsChange((current) => mergeHandoutReadReceipt(current, updated));");
    expect(panelSource).toContain("props.onHandoutsChange((current) => upsertHandoutItem(current, updated, !input.id));");
    expect(panelSource).toContain("props.onHandoutsChange((current) => current.filter((item) => item.id !== selected.id));");
  });
});

function handout(id: string, overrides: Partial<HandoutLibraryItem> = {}): HandoutLibraryItem {
  return {
    id,
    campaignId: "campaign-1",
    title: id,
    body: "Body",
    visibility: "public",
    visibleToUserIds: [],
    visibleToActorIds: [],
    assetIds: [],
    tags: [],
    readByUserIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}
