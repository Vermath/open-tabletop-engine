import type { Scene } from "@open-tabletop/core";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  changed: false,
  effects: [] as (() => void)[],
  apiPatch: vi.fn(),
  apiGet: vi.fn()
}));

// Exercise the actual editor callbacks across stateful renders without a DOM
// dependency. Effects run after each render and state updates schedule a render.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [hooks.values[index], (next: T | ((value: T) => T)) => {
        const value = typeof next === "function" ? (next as (value: T) => T)(hooks.values[index] as T) : next;
        if (!Object.is(value, hooks.values[index])) {
          hooks.values[index] = value;
          hooks.changed = true;
        }
      }];
    },
    useRef: <T,>(initial: T) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
    useMemo: <T,>(factory: () => T) => factory(),
    useEffect: (effect: () => void, deps?: unknown[]) => {
      const index = hooks.cursor++;
      const previous = hooks.values[index] as unknown[] | undefined;
      if (!deps || !previous || deps.length !== previous.length || deps.some((value, position) => !Object.is(value, previous[position]))) {
        hooks.effects.push(effect);
        hooks.values[index] = deps;
      }
    }
  };
});

vi.mock("./api.js", async () => ({
  ...await vi.importActual<typeof import("./api.js")>("./api.js"),
  apiPatch: hooks.apiPatch,
  apiGet: hooks.apiGet
}));

import { ApiError, type CampaignSessionInfo } from "./api.js";
import { HandoutEditor, type HandoutDraft, type HandoutLibraryItem } from "./handout-library-panel.js";
import { localDraftKey, readLocalDraft, writeLocalDraft } from "./local-draft-storage.js";
import { SessionDeskPanel, SessionEditor, sessionDraftFromSession } from "./session-desk-panel.js";
import { MarkdownDocument } from "./markdown-document.js";
import { WorldAtlasPanel, type WorldAtlasWorld } from "./world-atlas-panel.js";

interface ElementNode {
  type?: unknown;
  props: Record<string, unknown> & { children?: ReactNode };
}

function nodes(node: ReactNode): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  const element = node as ElementNode;
  return [element, ...nodes(element.props?.children)];
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text((node as ElementNode).props?.children) : "";
}

function find(root: ReactNode, predicate: (element: ElementNode) => boolean): ElementNode {
  const result = nodes(root).find(predicate);
  if (!result) throw new Error("Expected editor control was not rendered");
  return result;
}

const field = (root: ReactNode, label: string) => find(root, (node) => node.props?.["aria-label"] === label);
const button = (root: ReactNode, label: string) => find(root, (node) => node.type === "button" && text(node as ReactNode).trim() === label);
const call = (element: ElementNode, name: string, event?: unknown) => (element.props[name] as (value?: unknown) => unknown)(event);
const change = (root: ReactNode, label: string, value: string) => call(field(root, label), "onChange", { target: { value } });
const submit = (root: ReactNode) => call(find(root, (node) => node.type === "form"), "onSubmit", { preventDefault() {} });

function render(renderEditor: () => ReactNode): ReactNode {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    hooks.cursor = 0;
    hooks.changed = false;
    hooks.effects = [];
    const result = renderEditor();
    for (const effect of hooks.effects) effect();
    if (!hooks.changed) return result;
  }
  throw new Error("Editor effects did not settle");
}

const oldRevision = "2026-09-05T12:00:00.000Z";
const newRevision = "2026-09-05T12:01:00.000Z";
const noop = () => undefined;
const asyncNoop = async () => undefined;

function session(): CampaignSessionInfo {
  return {
    id: "session-1", campaignId: "campaign-1", title: "Bridge session", number: 1,
    status: "planned", agenda: "Cross the old bridge", notes: "Bring rope", sceneIds: ["scene-a"], encounterIds: [],
    createdBy: "gm-1", updatedBy: "gm-1", createdAt: oldRevision, updatedAt: oldRevision
  };
}

function sessionProps(): ComponentProps<typeof SessionEditor> {
  return {
    session: session(), nextNumber: 2,
    scenes: [{ id: "scene-a", name: "Old bridge" }, { id: "scene-b", name: "Forest camp" }] as Scene[],
    encounters: [], canManage: true, canStart: true, busy: false,
    onSave: vi.fn(asyncNoop), onStart: vi.fn(asyncNoop), onComplete: asyncNoop, onDelete: asyncNoop, onCancel: noop
  };
}

function handout(): HandoutLibraryItem {
  return {
    id: "handout-1", campaignId: "campaign-1", title: "Bridge clue", body: "The rune points north",
    visibility: "public", visibleToUserIds: [], visibleToActorIds: [], assetIds: [], tags: [], readByUserIds: [],
    createdAt: oldRevision, updatedAt: oldRevision
  };
}

function handoutProps(): ComponentProps<typeof HandoutEditor> {
  return {
    campaignId: "campaign-1", currentUserId: "gm-1", item: handout(), worlds: [], members: [], actors: [], assets: [],
    canManage: true, busy: false, onSave: vi.fn(async () => false), onCancel: noop
  };
}

function world(): WorldAtlasWorld {
  return { id: "world-1", campaignId: "campaign-1", name: "Ashen coast", description: "Original atlas description", createdAt: oldRevision, updatedAt: oldRevision };
}

function worldProps(): ComponentProps<typeof WorldAtlasPanel> {
  return {
    campaignId: "campaign-1", campaignUpdatedAt: oldRevision, worlds: [world()], worldRecords: [], worldRelations: [], scenes: [],
    selectedWorldId: "world-1", canCreate: true, canUpdateWorld: true, canAssignScenes: true, canDelete: true,
    onWorldsChange: vi.fn(), onWorldRecordsChange: noop, onWorldRelationsChange: noop,
    onSelectWorld: noop, onSceneUpdated: noop, onRefreshSharedState: asyncNoop, onStatus: noop
  };
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.apiPatch.mockReset();
  hooks.apiGet.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  } });
});

afterEach(() => vi.unstubAllGlobals());

describe("session editor revision and activation safety", () => {
  it("hydrates untouched fields when a newer session arrives", () => {
    const props = sessionProps();
    render(() => SessionEditor(props));
    props.session = { ...props.session!, title: "Fresh server title", agenda: "Fresh server agenda", notes: "Fresh server notes", updatedAt: newRevision };
    const view = render(() => SessionEditor(props));
    expect(field(view, "Session title").props.value).toBe("Fresh server title");
    expect(field(view, "Session agenda").props.value).toBe("Fresh server agenda");
    expect(field(view, "Session notes").props.value).toBe("Fresh server notes");
    submit(view);
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Fresh server title", expectedUpdatedAt: newRevision }));
  });

  it("preserves dirty fields and blocks a stale save until latest values are explicitly loaded", () => {
    const props = sessionProps();
    change(render(() => SessionEditor(props)), "Session title", "My unsaved title");
    props.session = { ...props.session!, title: "Other GM title", agenda: "Other GM agenda", updatedAt: newRevision };
    let view = render(() => SessionEditor(props));
    expect(field(view, "Session title").props.value).toBe("My unsaved title");
    expect(field(view, "Session agenda").props.value).toBe("Cross the old bridge");
    expect(button(view, "Save").props.disabled).toBe(true);
    expect(button(view, "Start session").props.disabled).toBe(true);
    submit(view);
    expect(props.onSave).not.toHaveBeenCalled();
    expect(text(view)).toContain("Other GM agenda");
    call(button(view, "Discard draft and load latest"), "onClick");
    view = render(() => SessionEditor(props));
    expect(field(view, "Session title").props.value).toBe("Other GM title");
    submit(view);
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Other GM title", expectedUpdatedAt: newRevision }));
  });

  it("starts only saved scene links and never reuses a removed activation selection", async () => {
    const props = sessionProps();
    const checkScene = (view: ReactNode, name: string, checked: boolean) => {
      const label = find(view, (node) => node.type === "label" && text(node as ReactNode) === name);
      call(find(label as ReactNode, (node) => node.type === "input"), "onChange", { target: { checked } });
    };
    let view = render(() => SessionEditor(props));
    checkScene(view, "Old bridge", false);
    view = render(() => SessionEditor(props));
    checkScene(view, "Forest camp", true);
    view = render(() => SessionEditor(props));
    const activation = field(view, "Scene to activate when session starts");
    expect(nodes(activation as ReactNode).filter((node) => node.type === "option").map((node) => node.props.value)).toEqual(["", "scene-a"]);
    expect(button(view, "Start session").props.disabled).toBe(true);
    call(button(view, "Start session"), "onClick");
    expect(props.onStart).not.toHaveBeenCalled();

    const saved = { ...props.session!, sceneIds: ["scene-b"], updatedAt: newRevision };
    props.onSave = vi.fn(async () => saved);
    view = render(() => SessionEditor(props));
    submit(view);
    await Promise.resolve();
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ sceneIds: ["scene-b"], expectedUpdatedAt: oldRevision }));
    props.session = saved;
    view = render(() => SessionEditor(props));
    const currentActivation = field(view, "Scene to activate when session starts");
    expect(nodes(currentActivation as ReactNode).filter((node) => node.type === "option").map((node) => node.props.value)).toEqual(["", "scene-b"]);
    expect(currentActivation.props.value).not.toBe("scene-a");
    expect(button(view, "Start session").props.disabled).toBe(false);
    call(button(view, "Start session"), "onClick");
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onStart).not.toHaveBeenCalledWith("scene-a");
  });
});

describe("handout editor revision safety", () => {
  it("refreshes a clean editor with authoritative fields and their matching revision", async () => {
    const props = handoutProps();
    render(() => HandoutEditor(props));
    props.item = { ...props.item!, title: "New clue", body: "The rune now points south", updatedAt: newRevision };
    const view = render(() => HandoutEditor(props));
    expect(field(view, "Handout title").props.value).toBe("New clue");
    expect(field(view, "Handout body").props.value).toBe("The rune now points south");
    submit(view);
    await Promise.resolve();
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ body: "The rune now points south", expectedUpdatedAt: newRevision }));
  });

  it("retains a dirty draft's original revision across a realtime update", () => {
    const props = handoutProps();
    change(render(() => HandoutEditor(props)), "Handout body", "My local clue");
    props.item = { ...props.item!, body: "Another GM's clue", updatedAt: newRevision };
    const view = render(() => HandoutEditor(props));
    expect(field(view, "Handout body").props.value).toBe("My local clue");
    const stored = readLocalDraft<HandoutDraft>(localDraftKey("handout", "campaign-1", "gm-1", "handout-1"));
    expect(stored).toMatchObject({ body: "My local clue", expectedUpdatedAt: oldRevision });
    expect(button(view, "Save handout").props.disabled).toBe(true);
    submit(view);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("recovers the original baseline and requires review before replacing an older browser draft", () => {
    const props = handoutProps();
    const draftKey = localDraftKey("handout", "campaign-1", "gm-1", "handout-1");
    writeLocalDraft<HandoutDraft>(draftKey, {
      id: "handout-1", expectedUpdatedAt: oldRevision, worldId: "", title: "Recovered title", body: "Recovered unsaved body",
      visibility: "public", visibleToUserIds: [], visibleToActorIds: [], assetIds: [], tags: "clue"
    });
    props.item = { ...props.item!, body: "Latest server body", updatedAt: newRevision };
    let view = render(() => HandoutEditor(props));
    expect(field(view, "Handout body").props.value).toBe("Recovered unsaved body");
    expect(readLocalDraft<HandoutDraft>(draftKey)?.expectedUpdatedAt).toBe(oldRevision);
    expect(button(view, "Save handout").props.disabled).toBe(true);
    const review = find(view, (node) => node.type === "details" && text(node as ReactNode).includes("Review latest saved handout"));
    expect(find(review as ReactNode, (node) => node.type === MarkdownDocument).props.source).toBe("Latest server body");
    submit(view);
    expect(props.onSave).not.toHaveBeenCalled();
    call(button(view, "Discard draft and load latest"), "onClick");
    view = render(() => HandoutEditor(props));
    expect(field(view, "Handout body").props.value).toBe("Latest server body");
    expect(button(view, "Save handout").props.disabled).toBe(false);
    expect(readLocalDraft(draftKey)).toBeUndefined();
    submit(view);
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ body: "Latest server body", expectedUpdatedAt: newRevision }));
  });
});

describe("world editor revision safety", () => {
  it("hydrates untouched world fields when an updated record arrives", () => {
    const props = worldProps();
    render(() => WorldAtlasPanel(props));
    props.worlds = [{ ...world(), name: "Silver coast", description: "Fresh server atlas", updatedAt: newRevision }];
    const view = render(() => WorldAtlasPanel(props));
    expect(field(view, "World name").props.value).toBe("Silver coast");
    expect(field(view, "World description").props.value).toBe("Fresh server atlas");
  });

  it("keeps local text, rejects stale form submission, and saves the revision explicitly reloaded", async () => {
    const props = worldProps();
    change(render(() => WorldAtlasPanel(props)), "World description", "Local atlas note");
    props.worlds = [{ ...world(), name: "Silver coast", description: "Other GM atlas note", updatedAt: newRevision }];
    let view = render(() => WorldAtlasPanel(props));
    expect(field(view, "World description").props.value).toBe("Local atlas note");
    expect(button(view, "Save world").props.disabled).toBe(true);
    expect(text(view)).toContain("Other GM atlas note");
    submit(view);
    expect(hooks.apiPatch).not.toHaveBeenCalled();
    call(button(view, "Discard draft and load latest"), "onClick");
    view = render(() => WorldAtlasPanel(props));
    expect(field(view, "World description").props.value).toBe("Other GM atlas note");
    hooks.apiPatch.mockResolvedValue(props.worlds[0]);
    submit(view);
    await Promise.resolve();
    expect(hooks.apiPatch).toHaveBeenCalledWith("/api/v1/worlds/world-1", {
      name: "Silver coast", description: "Other GM atlas note", expectedUpdatedAt: newRevision
    }, expect.any(Object));
  });
});



describe("session save response handling", () => {
  it("refreshes a conflicting session without offering a retry that overwrites the newer revision", async () => {
    const original = session();
    const newest = { ...original, title: "Another GM's session", notes: "Server notes to preserve", updatedAt: newRevision };
    const props: ComponentProps<typeof SessionDeskPanel> = {
      campaignId: "campaign-1", sessions: [original], scenes: [], encounters: [], canManage: true, canStart: true,
      onSessionsChange: vi.fn(), onSceneActivated: noop, onStatus: vi.fn()
    };
    let view = render(() => SessionDeskPanel(props));
    const row = find(view, (node) => node.type === "button" && text(node as ReactNode).includes("Bridge session"));
    call(row, "onClick");
    view = render(() => SessionDeskPanel(props));
    const editor = find(view, (node) => node.type === SessionEditor);
    const dirty = { ...sessionDraftFromSession(original), notes: "My unsaved notes" };
    hooks.apiPatch.mockRejectedValue(new ApiError("Stale session", 409, { current: newest }, ""));
    hooks.apiGet.mockResolvedValue(newest);

    await call(editor, "onSave", dirty);

    expect(hooks.apiPatch).toHaveBeenCalledTimes(1);
    expect(hooks.apiPatch).toHaveBeenCalledWith("/api/v1/campaign-sessions/session-1", expect.objectContaining({
      notes: "My unsaved notes", expectedUpdatedAt: oldRevision
    }), expect.any(Object));
    expect(hooks.apiGet).toHaveBeenCalledWith("/api/v1/campaign-sessions/session-1");
    expect(props.onSessionsChange).toHaveBeenCalledWith([newest]);
    props.sessions = [newest];
    view = render(() => SessionDeskPanel(props));
    expect(find(view, (node) => node.type === SessionEditor).props.session).toEqual(newest);
    expect(text(view)).not.toContain("Retry session save");
    expect(props.onStatus).toHaveBeenCalledWith(expect.stringContaining("Your draft is preserved"));
    await Promise.resolve();
    expect(hooks.apiPatch).toHaveBeenCalledTimes(1);
    expect(dirty).toMatchObject({ notes: "My unsaved notes", expectedUpdatedAt: oldRevision });
  });

  it("uses the newly saved session revision on the next edit without reopening the editor", async () => {
    const props = sessionProps();
    const saved = { ...props.session!, title: "Saved first edit", updatedAt: newRevision };
    props.onSave = vi.fn(async () => saved);
    change(render(() => SessionEditor(props)), "Session title", "Saved first edit");
    submit(render(() => SessionEditor(props)));
    await Promise.resolve();
    expect(props.onSave).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: "Saved first edit", expectedUpdatedAt: oldRevision }));

    props.session = saved;
    let view = render(() => SessionEditor(props));
    expect(button(view, "Start session").props.disabled).toBe(false);
    change(view, "Session notes", "Second edit after saving");
    view = render(() => SessionEditor(props));
    expect(button(view, "Save").props.disabled).toBe(false);
    submit(view);
    await Promise.resolve();
    expect(props.onSave).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: "Saved first edit", notes: "Second edit after saving", expectedUpdatedAt: newRevision
    }));
  });
});


describe("editor refreshes while a save response is pending", () => {
  it("recognizes a matching parent retry result as saved and advances the next edit's revision", () => {
    let props = sessionProps();
    change(render(() => SessionEditor(props)), "Session title", "Saved by the parent retry");
    expect(button(render(() => SessionEditor(props)), "Start session").props.disabled).toBe(true);

    props = { ...props, session: { ...props.session!, title: "Saved by the parent retry", updatedAt: newRevision } };
    let view = render(() => SessionEditor(props));
    expect(field(view, "Session title").props.value).toBe("Saved by the parent retry");
    expect(button(view, "Start session").props.disabled).toBe(false);
    expect(text(view)).not.toContain("Discard draft and load latest");
    change(view, "Session notes", "Continue editing after retry");
    view = render(() => SessionEditor(props));
    submit(view);
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "Saved by the parent retry", notes: "Continue editing after retry", expectedUpdatedAt: newRevision
    }));
  });

  it("merges a delayed session save into the latest list without rolling back either row", async () => {
    const original = session();
    const other = { ...session(), id: "session-2", title: "Second session", number: 2 };
    const latestRevision = "2026-09-05T12:02:00.000Z";
    const newest = { ...original, title: "Newest shared title", notes: "Newest shared notes", updatedAt: latestRevision };
    const otherNewest = { ...other, notes: "Another GM updated this row", updatedAt: latestRevision };
    const onSessionsChange = vi.fn();
    let props: ComponentProps<typeof SessionDeskPanel> = {
      campaignId: "campaign-1", sessions: [original, other], scenes: [], encounters: [], canManage: true, canStart: true,
      onSessionsChange, onSceneActivated: noop, onStatus: noop
    };
    let view = render(() => SessionDeskPanel(props));
    call(find(view, (node) => node.type === "button" && text(node as ReactNode).includes("Bridge session")), "onClick");
    view = render(() => SessionDeskPanel(props));
    let resolveResponse!: (saved: CampaignSessionInfo) => void;
    hooks.apiPatch.mockReturnValue(new Promise<CampaignSessionInfo>((resolve) => { resolveResponse = resolve; }));
    const request = call(find(view, (node) => node.type === SessionEditor), "onSave", {
      ...sessionDraftFromSession(original), notes: "Saved notes from the pending request"
    });
    expect(hooks.apiPatch).toHaveBeenCalledTimes(1);

    // Each render receives a new props object, so the pending callback still
    // captures its original props just as a real React render would.
    props = { ...props, sessions: [newest, otherNewest] };
    render(() => SessionDeskPanel(props));
    resolveResponse({ ...original, notes: "Saved notes from the pending request", updatedAt: newRevision });
    await request;

    expect(onSessionsChange).toHaveBeenCalledTimes(1);
    expect(onSessionsChange).toHaveBeenLastCalledWith([newest, otherNewest]);
  });

  it("merges a delayed world save into the latest atlas without rolling back newer worlds", async () => {
    const original = world();
    const other = { ...world(), id: "world-2", name: "Birch valley" };
    const latestRevision = "2026-09-05T12:02:00.000Z";
    const newest = { ...original, description: "Newest shared atlas description", updatedAt: latestRevision };
    const otherNewest = { ...other, description: "Another GM's updated valley", updatedAt: latestRevision };
    const onWorldsChange = vi.fn();
    let props = { ...worldProps(), worlds: [original, other], onWorldsChange };
    change(render(() => WorldAtlasPanel(props)), "World description", "Saved atlas description from pending request");
    let resolveResponse!: (saved: WorldAtlasWorld) => void;
    hooks.apiPatch.mockReturnValue(new Promise<WorldAtlasWorld>((resolve) => { resolveResponse = resolve; }));
    submit(render(() => WorldAtlasPanel(props)));
    expect(hooks.apiPatch).toHaveBeenCalledTimes(1);

    props = { ...props, worlds: [newest, otherNewest] };
    render(() => WorldAtlasPanel(props));
    resolveResponse({ ...original, description: "Saved atlas description from pending request", updatedAt: newRevision });
    await vi.waitFor(() => expect(onWorldsChange).toHaveBeenCalledTimes(1));

    expect(onWorldsChange).toHaveBeenLastCalledWith([newest, otherNewest]);
  });
});
