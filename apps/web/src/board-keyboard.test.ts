import { describe, expect, it } from "vitest";
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

  it("ignores shortcuts while the user is editing text", () => {
    expect(boardKeyboardAction(event({ key: "Delete", target: { tagName: "INPUT" } }), { selectedCount: 1, canDelete: true, undoCount: 0, redoCount: 0 })).toBeNull();
  });
});
