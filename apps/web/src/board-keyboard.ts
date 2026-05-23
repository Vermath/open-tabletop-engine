export type BoardKeyboardAction = "delete-selected" | "undo" | "redo";

export interface BoardKeyboardState {
  selectedCount: number;
  canDelete: boolean;
  undoCount: number;
  redoCount: number;
}

export interface BoardKeyboardEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
}

export function boardKeyboardAction(event: BoardKeyboardEventLike, state: BoardKeyboardState): BoardKeyboardAction | null {
  if (isEditableShortcutTarget(event.target)) return null;
  const key = event.key.toLowerCase();
  const code = event.code?.toLowerCase();
  const modKey = Boolean(event.ctrlKey || event.metaKey);
  if (modKey && key === "z" && event.shiftKey && state.redoCount > 0) return "redo";
  if (modKey && key === "z" && state.undoCount > 0) return "undo";
  if (modKey && (key === "y" || code === "keyy") && state.redoCount > 0) return "redo";
  if (!modKey && event.key === "Delete" && state.canDelete && state.selectedCount > 0) return "delete-selected";
  return null;
}

function isEditableShortcutTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as { tagName?: unknown; isContentEditable?: unknown };
  if (candidate.isContentEditable === true) return true;
  return typeof candidate.tagName === "string" && ["INPUT", "TEXTAREA", "SELECT"].includes(candidate.tagName.toUpperCase());
}
