import type { Actor, PermissionName, Token } from "@open-tabletop/core";
import { parseFormula } from "@open-tabletop/dice-engine";

export const hotbarSize = 6;
export type HotbarPin =
  | { kind: "actor"; actorId: string; rollId: string }
  | { kind: "formula"; formula: string }
  | { kind: "macro"; macroId: string }
  | { kind: "table"; tableId: string; visibility: "gm_only" | "public" };

export function hotbarStoragePrefix(apiBase: string, userId: string, campaignId: string) {
  return `otte:hotbar:${JSON.stringify([apiBase, userId, campaignId])}:`;
}

export function validHotbarFormula(formula: string): boolean {
  try {
    return parseFormula(formula).length > 0;
  } catch {
    return false;
  }
}

function readPin(value: string | null): HotbarPin | undefined {
  if (!value) return;
  try {
    const pin = JSON.parse(value);
    if (pin?.kind === "formula" && typeof pin.formula === "string" && validHotbarFormula(pin.formula)) return { kind: "formula", formula: pin.formula };
    if (pin?.kind === "table" && typeof pin.tableId === "string" && pin.tableId && (pin.visibility === "public" || pin.visibility === "gm_only")) return { kind: "table", tableId: pin.tableId, visibility: pin.visibility };
    if (pin?.kind === "macro" && typeof pin.macroId === "string" && pin.macroId) return { kind: "macro", macroId: pin.macroId };
    if (pin?.kind === "actor" && typeof pin.actorId === "string" && pin.actorId && typeof pin.rollId === "string" && pin.rollId) return { kind: "actor", actorId: pin.actorId, rollId: pin.rollId };
  } catch {
    // A damaged slot can be assigned again independently of the others.
  }
}

export function readHotbar(prefix: string): (HotbarPin | undefined)[] {
  return Array.from({ length: hotbarSize }, (_, index) => {
    try { return readPin(window.localStorage.getItem(prefix + index)); } catch { return undefined; }
  });
}

export function canUseHotbarActor(actor: Actor, userId: string, permissions: PermissionName[]) {
  const owned = actor.ownerUserId === userId;
  return permissions.includes("dice.roll") && permissions.includes("actor.read")
    && (owned || permissions.includes("actor.readPrivate") || actor.permissions[userId]?.includes("actor.readPrivate"))
    && (permissions.includes("actor.update") || (owned && permissions.includes("actor.updateOwned")));
}

/** The sheet permits the source and visible actors on this scene. Never infer self as an attack target. */
export function hotbarAttackTarget(userId: string, sceneId: string, tokens: Token[], actors: Actor[], sourceId: string, selectedTokenId?: string) {
  const candidates = tokens.filter((token) => token.sceneId === sceneId && token.actorId && actors.some((actor) => actor.id === token.actorId));
  const marked = new Set(candidates.filter((token) => token.targetedByUserIds?.includes(userId)).map((token) => token.actorId!));
  if (marked.size > 1) return;
  for (const actorId of marked) return actorId;
  const selected = candidates.find((token) => token.id === selectedTokenId)?.actorId;
  if (selected && selected !== sourceId) return selected;
}

export function hotbarKeyIndex(event: KeyboardEvent): number | undefined {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key.length !== 1 || event.key < "1" || event.key > String(hotbarSize)) return;
  if (event.composedPath().some((node) => node instanceof Element && node.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [role="dialog"], [role="menu"]'))) return;
  if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
  return Number(event.key) - 1;
}
