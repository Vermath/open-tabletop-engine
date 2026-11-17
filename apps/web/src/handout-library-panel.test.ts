import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clearHandoutDraftAfterConfirmedSave, HandoutEditor, handoutPayload, mergeHandoutReadReceipt, storedHandoutDraft, upsertHandoutItem, type HandoutDraft, type HandoutLibraryItem } from "./handout-library-panel.js";
import { localDraftKey, removeLocalDraft, writeLocalDraft } from "./local-draft-storage.js";

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

  it("validates recoverable drafts and renders handouts instead of a read-only textarea", () => {
    expect(storedHandoutDraft({
      worldId: "",
      title: "Recovered clue",
      body: "**Look below.**",
      visibility: "gm_only",
      visibleToUserIds: [],
      visibleToActorIds: [],
      assetIds: ["asset-1"],
      tags: "clue"
    })?.title).toBe("Recovered clue");
    expect(storedHandoutDraft({ title: 42 })).toBeUndefined();
    expect(panelSource).toContain("<MarkdownDocument");
    expect(panelSource).toContain("<HandoutAssetGallery");
    expect(panelSource).toContain('localDraftKey("handout"');
  });

  it("clears a recoverable draft only after the server confirms the save", async () => {
    let clearCount = 0;
    const clear = () => { clearCount += 1; };

    await expect(clearHandoutDraftAfterConfirmedSave({ title: "Clue" }, async () => false, clear)).resolves.toBe(false);
    expect(clearCount).toBe(0);

    await expect(clearHandoutDraftAfterConfirmedSave({ title: "Clue" }, async () => true, clear)).resolves.toBe(true);
    expect(clearCount).toBe(1);

    await expect(clearHandoutDraftAfterConfirmedSave({ title: "Clue" }, async () => { throw new Error("offline"); }, clear)).rejects.toThrow("offline");
    expect(clearCount).toBe(1);
  });

  it("reopens the editor with a closed or failed-save draft and clears it only after confirmation", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const priorWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
    try {
      const key = localDraftKey("handout", "campaign-1", "user-1", "new");
      const draft: HandoutDraft = {
        worldId: "",
        title: "Recovered lighthouse clue",
        body: "**The lens points north.**",
        visibility: "gm_only",
        visibleToUserIds: [],
        visibleToActorIds: [],
        assetIds: [],
        tags: "clue",
      };
      expect(writeLocalDraft(key, draft, storage)).toBe(true);
      const onCancel = () => undefined;
      const renderEditor = () => renderToStaticMarkup(createElement(HandoutEditor, {
        campaignId: "campaign-1",
        currentUserId: "user-1",
        worlds: [],
        members: [],
        actors: [],
        assets: [],
        canManage: true,
        busy: false,
        onSave: async () => false,
        onCancel,
      }));

      const firstOpen = renderEditor();
      expect(firstOpen).toContain("Recovered lighthouse clue");
      expect(firstOpen).toContain("The lens points north.");
      expect(firstOpen).toContain("Handout draft saved in this browser.");
      expect(panelSource).toContain('onClick={props.onCancel}><Check size={14} /> Close and keep draft');

      // Closing calls only the parent close handler; the persisted editor draft remains for the next mount.
      onCancel();
      expect(renderEditor()).toContain("Recovered lighthouse clue");

      await expect(clearHandoutDraftAfterConfirmedSave(draft, async () => false, () => removeLocalDraft(key, storage))).resolves.toBe(false);
      expect(renderEditor()).toContain("Recovered lighthouse clue");

      await expect(clearHandoutDraftAfterConfirmedSave(draft, async () => true, () => removeLocalDraft(key, storage))).resolves.toBe(true);
      const afterConfirmedSave = renderEditor();
      expect(afterConfirmedSave).not.toContain("Recovered lighthouse clue");
      expect(afterConfirmedSave).not.toContain("Handout draft saved in this browser.");
    } finally {
      if (priorWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
    }
  });

  it("unmounts both existing and new editors on close or discard without conflating close with recovery deletion", () => {
    expect(panelSource).toContain('onCancel={() => { setCreating(false); setSelectedId(""); setDeleteArmed(false); }}');
    expect(panelSource).toContain("removeLocalDraft(draftStorageKey);\n    setDraftPersistence(\"idle\");\n    props.onCancel();");
    expect(panelSource).toContain('onClick={props.onCancel}><Check size={14} /> Close and keep draft');
  });

  it("renders every handout edit control disabled while an async save is pending", () => {
    const html = renderToStaticMarkup(createElement(HandoutEditor, {
      campaignId: "campaign-1",
      currentUserId: "user-1",
      item: handout("handout-1", { title: "Saving handout" }),
      worlds: [],
      members: [],
      actors: [],
      assets: [],
      canManage: true,
      busy: true,
      onSave: async () => true,
      onCancel: () => undefined,
    }));

    expect(html).toMatch(/aria-label="Handout title"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Handout body"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Handout world"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Handout visibility"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Handout tags"[^>]*disabled/);
    expect(html).toContain("Save handout</button>");
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
