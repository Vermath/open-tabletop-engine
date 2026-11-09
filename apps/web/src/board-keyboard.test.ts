import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { boardKeyboardAction } from "./board-keyboard";

function event(input: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: Partial<HTMLElement> }) {
  return {
    key: input.key,
    code: input.code,
    ctrlKey: Boolean(input.ctrlKey),
    metaKey: Boolean(input.metaKey),
    shiftKey: Boolean(input.shiftKey),
    target: input.target ?? { tagName: "BUTTON" }
  };
}

describe("boardKeyboardAction", () => {
  it("maps delete to a board delete when selected board items can be deleted", () => {
    expect(boardKeyboardAction(event({ key: "Delete" }), { selectedCount: 2, canDelete: true, undoCount: 0, redoCount: 0 })).toBe("delete-selected");
  });

  it("maps undo and redo shortcuts", () => {
    expect(boardKeyboardAction(event({ key: "z", ctrlKey: true }), { selectedCount: 0, canDelete: true, undoCount: 1, redoCount: 0 })).toBe("undo");
    expect(boardKeyboardAction(event({ key: "y", ctrlKey: true }), { selectedCount: 0, canDelete: true, undoCount: 0, redoCount: 1 })).toBe("redo");
    expect(boardKeyboardAction(event({ key: "Unidentified", code: "KeyY", ctrlKey: true }), { selectedCount: 0, canDelete: true, undoCount: 0, redoCount: 1 })).toBe("redo");
    expect(boardKeyboardAction(event({ key: "z", ctrlKey: true, shiftKey: true }), { selectedCount: 0, canDelete: true, undoCount: 0, redoCount: 1 })).toBe("redo");
  });

  it("maps copy and paste shortcuts for selected board tokens", () => {
    expect(boardKeyboardAction(event({ key: "c", ctrlKey: true }), { selectedCount: 2, canDelete: true, canCopy: true, canPaste: false, undoCount: 0, redoCount: 0 })).toBe("copy");
    expect(boardKeyboardAction(event({ key: "v", ctrlKey: true }), { selectedCount: 0, canDelete: true, canCopy: false, canPaste: true, undoCount: 0, redoCount: 0 })).toBe("paste");
  });

  it("ignores shortcuts while the user is editing text", () => {
    expect(boardKeyboardAction(event({ key: "Delete", target: { tagName: "INPUT" } }), { selectedCount: 1, canDelete: true, undoCount: 0, redoCount: 0 })).toBeNull();
  });
});

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
function appKeyboardHandler(name: string, scope: Record<string, unknown>) {
  const start = appSource.indexOf(`const ${name} = (event: KeyboardEvent) => {`);
  const end = appSource.indexOf(`window.addEventListener("keydown", ${name})`, start);
  if (start < 0 || end < 0) throw new Error(`Keyboard handler ${name} not found`);
  const code = transpileModule(`${appSource.slice(start, end)}\n${name};`, { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(code, scope) as (keyboardEvent: ReturnType<typeof event> & { preventDefault(): void }) => void;
}

describe("player preview keyboard isolation", () => {
  it("blocks hidden GM token and overlay mutations while preserving normal board shortcuts after exit", () => {
    const mutations = {
      deleteSelectedBoardTokens: vi.fn(async () => undefined),
      undoBoardAction: vi.fn(async () => undefined),
      redoBoardAction: vi.fn(async () => undefined),
      copySelectedBoardTokens: vi.fn(async () => undefined),
      pasteBoardClipboardTokens: vi.fn(async () => undefined),
      deleteSceneWall: vi.fn(async () => undefined),
    };
    const scope = {
      ...mutations, boardKeyboardAction, playerPreview: { open: true },
      selectedOverlay: null, selectedTokens: [{ id: "gm-token" }], canDeleteSelectedBoardTokens: true,
      boardClipboardTokens: [{}], boardUndoStack: [{}], boardRedoStack: [{}],
      hasPermission: () => true, setStatus: vi.fn(), setSelectedOverlay: vi.fn(),
    };
    const keys = [{ key: "Delete" }, ...["z", "y", "c", "v"].map((key) => ({ key, ctrlKey: true }))];
    const previewHandler = appKeyboardHandler("handleBoardKeyboard", scope);
    for (const input of keys) previewHandler({ ...event(input), preventDefault: vi.fn() });
    const overlayHandler = appKeyboardHandler("handleBoardKeyboard", { ...scope, selectedOverlay: { type: "wall", id: "gm-wall" }, selectedTokens: [] });
    overlayHandler({ ...event({ key: "Delete" }), preventDefault: vi.fn() });
    for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();

    const gmHandler = appKeyboardHandler("handleBoardKeyboard", { ...scope, playerPreview: { open: false } });
    for (const input of keys) gmHandler({ ...event(input), preventDefault: vi.fn() });
    for (const [name, mutation] of Object.entries(mutations)) {
      if (name !== "deleteSceneWall") expect(mutation).toHaveBeenCalledOnce();
    }
  });

  it("keeps the command palette and GM tool selection unchanged during player preview", () => {
    const setCommandPaletteOpen = vi.fn();
    const toggleAnnotationTool = vi.fn();
    const scope = { playerPreview: { open: true }, setCommandPaletteOpen, toggleAnnotationTool, hasPermission: () => true, workspaceMode: "live", commandPaletteOpen: false, shortPhone: false };
    appKeyboardHandler("handlePaletteShortcut", scope)({ ...event({ key: "k", ctrlKey: true }), preventDefault: vi.fn() });
    appKeyboardHandler("handleToolHotkeys", scope)({ ...event({ key: "d" }), preventDefault: vi.fn() });
    expect(setCommandPaletteOpen).not.toHaveBeenCalled();
    expect(toggleAnnotationTool).not.toHaveBeenCalled();
  });
});
