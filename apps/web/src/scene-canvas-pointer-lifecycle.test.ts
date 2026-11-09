import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type { Token } from "@open-tabletop/core";
import { ScriptTarget, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { scenePointFromClient } from "./board-geometry.js";
import {
  boundedTokenCoordinates, clampSceneCoordinate, finishedTokenDragChanges, tokenFrame,
  tokenFrameChanged, tokenResizeFrameFromPoint, type TokenDragDraft, type TokenFrame,
  type TokenFrameOverrides, type TokenResizeDraft, type TokenResizeHandle,
} from "./scene-canvas.js";

const source = readFileSync(new URL("./scene-canvas.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function section(start: string, end: string) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  if (begin < 0 || finish < 0) throw new Error(`Canvas section not found: ${start}`);
  return source.slice(begin, finish);
}
const pointerCode = transpileModule([
  section("  function boardPoint(", "  function annotationDraftPoint("),
  section("  function boundedTokenPosition(", "  function appendFogStrokePoint("),
  "function scheduleRecenter() {",
  section("  useEffect(() => {\n    const token = selectedViewportToken;", "  function boardPoint(").replace(/\r\n/g, "\n"),
  "}",
  "({ startTokenDrag, moveTokenDrag, finishTokenDrag, cancelTokenDrag, startTokenResize, moveTokenResize, finishTokenResize, cancelTokenResize, scheduleRecenter });",
].join("\n"), { compilerOptions: { target: ScriptTarget.ES2022 } }).outputText;

function token(id: string, x = 208.5, y = 206.5): Token {
  return { id, sceneId: "scene", name: id, x, y, width: 50, height: 50, rotation: 0, disposition: "friendly", layer: "player", metadata: {} } as Token;
}
function harness(tokens = [token("hero")], selectedTokenIds: string[] = []) {
  const scene = { id: "scene", width: 1000, height: 800, gridSize: 50, gridType: "gridless" as const };
  const rect = { left: 100, top: 60, width: 750, height: 600 };
  const tokenDragRef = { current: null as TokenDragDraft | null };
  const tokenResizeRef = { current: null as TokenResizeDraft | null };
  const pointerSelectedTokenRef = { current: null as string | null };
  const frames: Array<() => void> = [];
  const pending: Promise<unknown>[] = [];
  const onSelect = vi.fn(() => { rect.left = -185; }); // Opening the inspector shifts the board 285 screen pixels.
  const onTokenMovePersist = vi.fn(async () => undefined);
  const onTokenResizePersist = vi.fn(async () => undefined);
  const scrollTo = vi.fn();
  const scope = {
    tokens, props: {
      scene, zoom: 0.75, selectedTokenIds, canMoveToken: true, canResizeToken: true,
      fogBrushMode: null, annotationTool: null, onSelect, onTokenMovePersist, onTokenResizePersist,
      onTokenMoveCommit: vi.fn(), onTokenResizeCommit: vi.fn(), onMoved: vi.fn(async () => undefined),
    },
    calibrationActive: false, activeLayerTokenIds: new Set(tokens.map((item) => item.id)), selectedTokenIdSet: new Set(selectedTokenIds),
    tokenDragRef, tokenResizeRef, pointerSelectedTokenRef, tokenFrameOverrides: {} as TokenFrameOverrides,
    setTokenDrag: vi.fn(), setTokenResize: vi.fn(),
    setTokenFrameOverrides(update: (current: TokenFrameOverrides) => TokenFrameOverrides): void { scope.tokenFrameOverrides = update(scope.tokenFrameOverrides); },
    boardRef: { current: { getBoundingClientRect: () => ({ ...rect }), clientWidth: rect.width, clientHeight: rect.height } },
    viewportRef: { current: { clientWidth: 400, clientHeight: 300, scrollWidth: 1000, scrollHeight: 800, scrollTo } },
    selectedViewportToken: tokens[0],
    mutationAction: { runAction(_label: string, action: () => Promise<unknown>) { const promise = action(); pending.push(promise); return promise; } },
    useEffect(effect: () => unknown) { effect(); },
    window: { requestAnimationFrame(callback: () => void) { frames.push(callback); return frames.length; }, cancelAnimationFrame: vi.fn() },
    scenePointFromClient, boundedTokenCoordinates, clampSceneCoordinate, finishedTokenDragChanges, tokenFrame, tokenFrameChanged, tokenResizeFrameFromPoint,
  };
  type PointerInput = ReturnType<typeof pointer>;
  const handlers = runInNewContext(pointerCode, scope) as {
    startTokenDrag(token: Token, event: PointerInput): void;
    moveTokenDrag(x: number, y: number, pointerId: number): void;
    finishTokenDrag(pointerId: number): void;
    cancelTokenDrag(pointerId: number): void;
    startTokenResize(token: Token, handle: TokenResizeHandle, event: PointerInput): void;
    moveTokenResize(x: number, y: number, pointerId: number): void;
    finishTokenResize(pointerId: number): void;
    cancelTokenResize(pointerId: number): void;
    scheduleRecenter(): void;
  };
  function pointer(x: number, y: number, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}) {
    return {
      button: 0, pointerId: 1, clientX: 100 + x * 0.75, clientY: 60 + y * 0.75,
      shiftKey: false, ctrlKey: false, metaKey: false, ...modifiers,
      currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    };
  }
  return { ...handlers, scope, pointer, tokens, tokenDragRef, tokenResizeRef, pointerSelectedTokenRef, frames, onSelect, onTokenMovePersist, onTokenResizePersist, scrollTo, flush: () => Promise.all(pending) };
}

describe("pointer selection and viewport layout", () => {
  it("saves the pointer delta before selection opens the inspector", async () => {
    const board = harness();
    const hero = board.tokens[0]!;
    const down = board.pointer(hero.x + 25, hero.y + 25);
    board.startTokenDrag(hero, down);
    expect(board.onSelect).not.toHaveBeenCalled();
    board.moveTokenDrag(down.clientX + 39, down.clientY + 36, 1);
    board.finishTokenDrag(1);
    await board.flush();
    expect(board.onTokenMovePersist).toHaveBeenCalledExactlyOnceWith([{ token: hero, position: { x: 260.5, y: 254.5 } }]);
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(hero.id, { additive: false, preserveExisting: false });
    expect(board.pointerSelectedTokenRef.current).toBe(hero.id);
    expect(board.tokenDragRef.current).toBeNull();
  });

  it("selects a plain click without saving or snapping the token", async () => {
    const board = harness();
    const hero = board.tokens[0]!;
    board.startTokenDrag(hero, board.pointer(hero.x + 25, hero.y + 25));
    board.finishTokenDrag(1);
    await board.flush();
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(hero.id, { additive: false, preserveExisting: false });
    expect(board.onTokenMovePersist).not.toHaveBeenCalled();
  });

  it.each(["shiftKey", "ctrlKey", "metaKey"] as const)("retains %s selection on pointer completion", (modifier) => {
    const board = harness([token("first"), token("second", 300, 250)], ["first"]);
    const second = board.tokens[1]!;
    board.startTokenDrag(second, board.pointer(second.x + 25, second.y + 25, { [modifier]: true }));
    expect(board.onSelect).not.toHaveBeenCalled();
    board.finishTokenDrag(1);
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(second.id, { additive: true, preserveExisting: false });
  });

  it("keeps selected groups together and preserves their selection", async () => {
    const board = harness([token("first"), token("second", 268.5, 206.5)], ["first", "second"]);
    const first = board.tokens[0]!;
    const down = board.pointer(first.x + 25, first.y + 25);
    board.startTokenDrag(first, down);
    board.moveTokenDrag(down.clientX + 39, down.clientY + 36, 1);
    board.finishTokenDrag(1);
    await board.flush();
    expect(board.onTokenMovePersist).toHaveBeenCalledExactlyOnceWith([
      { token: first, position: { x: 260.5, y: 254.5 } },
      { token: board.tokens[1], position: { x: 320.5, y: 254.5 } },
    ]);
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(first.id, { additive: false, preserveExisting: true });
  });

  it("finishes resize coordinates before reopening the inspector", async () => {
    const board = harness([token("hero", 100, 100)], ["hero"]);
    const hero = board.tokens[0]!;
    board.startTokenResize(hero, "se", board.pointer(150, 150));
    expect(board.onSelect).not.toHaveBeenCalled();
    const end = board.pointer(200, 220);
    board.moveTokenResize(end.clientX, end.clientY, 1);
    board.finishTokenResize(1);
    await board.flush();
    expect(board.onTokenResizePersist).toHaveBeenCalledExactlyOnceWith(hero, { x: 100, y: 100, width: 100, height: 120 });
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(hero.id, { preserveExisting: true });
  });

  it("selects a motionless resize handle without changing a selected group or saving", () => {
    const board = harness([token("hero", 100, 100), token("companion", 200, 100)], ["hero", "companion"]);
    const hero = board.tokens[0]!;
    board.startTokenResize(hero, "se", board.pointer(150, 150));
    board.finishTokenResize(1);
    expect(board.onSelect).toHaveBeenCalledExactlyOnceWith(hero.id, { preserveExisting: true });
    expect(board.onTokenResizePersist).not.toHaveBeenCalled();
    expect(board.pointerSelectedTokenRef.current).toBe(hero.id);
  });

  it("does not select cancelled gestures or tokens removed before completion", () => {
    const board = harness();
    const hero = board.tokens[0]!;
    board.startTokenDrag(hero, board.pointer(hero.x + 25, hero.y + 25));
    board.cancelTokenDrag(1);
    expect(board.pointerSelectedTokenRef.current).toBeNull();
    board.startTokenResize(hero, "se", board.pointer(hero.x + 50, hero.y + 50));
    board.cancelTokenResize(1);
    expect(board.pointerSelectedTokenRef.current).toBeNull();
    board.startTokenDrag(hero, board.pointer(hero.x + 25, hero.y + 25));
    board.tokens.splice(0);
    board.finishTokenDrag(1);
    expect(board.onSelect).not.toHaveBeenCalled();
    expect(board.onTokenMovePersist).not.toHaveBeenCalled();
    expect(board.onTokenResizePersist).not.toHaveBeenCalled();
  });

  it.each(["drag", "resize"] as const)("blocks scheduled recentering during %s and centers the displayed result afterward", (gesture) => {
    const board = harness();
    const hero = board.tokens[0]!;
    board.scheduleRecenter();
    expect(board.frames).toHaveLength(1);
    if (gesture === "drag") board.startTokenDrag(hero, board.pointer(hero.x + 25, hero.y + 25));
    else board.startTokenResize(hero, "se", board.pointer(hero.x + 50, hero.y + 50));
    board.frames[0]!();
    board.scheduleRecenter();
    expect(board.frames).toHaveLength(1);
    expect(board.scrollTo).not.toHaveBeenCalled();
    if (gesture === "drag") board.cancelTokenDrag(1);
    else board.cancelTokenResize(1);
    board.scope.tokenFrameOverrides[hero.id] = { x: 600, y: 400, width: 80, height: 60 } satisfies TokenFrame;
    board.scheduleRecenter();
    board.frames[1]!();
    expect(board.scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 280, top: 172.5, behavior: "auto" });
  });
});
