import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boardArrowDelta, keyboardTokenPositions, movedKeyboardCursor, movedKeyboardGesture, runAnnouncedSceneCanvasMutation } from "./scene-canvas.js";

const canvasSource = readFileSync(new URL("./scene-canvas.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("keyboard-complete scene canvas", () => {
  it("uses grid-sized movement with a fine one-pixel modifier and a useful gridless step", () => {
    expect(boardArrowDelta("ArrowRight", { gridSize: 50, gridType: "square" }, false)).toEqual({ x: 50, y: 0 });
    expect(boardArrowDelta("ArrowUp", { gridSize: 50, gridType: "square" }, true)).toEqual({ x: 0, y: -1 });
    expect(boardArrowDelta("ArrowDown", { gridSize: 50, gridType: "gridless" }, false)).toEqual({ x: 0, y: 10 });
    expect(boardArrowDelta("Enter", { gridSize: 50, gridType: "square" }, false)).toBeUndefined();
  });

  it("clamps the keyboard cursor and selected token groups to the scene without changing their formation", () => {
    expect(movedKeyboardCursor({ width: 300, height: 200 }, { x: 298, y: 2 }, { x: 50, y: -50 })).toEqual({ x: 300, y: 0 });
    expect(
      keyboardTokenPositions(
        { width: 300, height: 200 },
        [
          { id: "left", x: 180, y: 50, width: 50, height: 50 },
          { id: "right", x: 240, y: 50, width: 50, height: 50 }
        ],
        { x: 50, y: 0 }
      )
    ).toEqual({ left: { x: 190, y: 50 }, right: { x: 250, y: 50 } });
  });

  it("extends freehand and fog paths while keeping two-point measurements stable", () => {
    expect(movedKeyboardGesture({ kind: "drawing", points: [{ x: 10, y: 10 }] }, { x: 20, y: 10 }).points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 }
    ]);
    expect(movedKeyboardGesture({ kind: "fog-hide", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] }, { x: 20, y: 20 }).points).toHaveLength(3);
    expect(movedKeyboardGesture({ kind: "ruler", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] }, { x: 40, y: 40 }).points).toEqual([
      { x: 10, y: 10 },
      { x: 40, y: 40 }
    ]);
    const complete = { kind: "measure-circle" as const, points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], complete: true };
    expect(movedKeyboardGesture(complete, { x: 40, y: 40 })).toBe(complete);
  });

  it("announces async success only after the scene mutation resolves", async () => {
    const announcements: string[] = [];
    let resolveMutation!: () => void;
    const mutation = runAnnouncedSceneCanvasMutation(
      () => new Promise<void>((resolve) => { resolveMutation = resolve; }),
      (message) => announcements.push(message),
      { pending: "Creating template...", success: "Template finished", failure: "Create template failed" }
    );

    expect(announcements).toEqual(["Creating template..."]);
    resolveMutation();
    await mutation;
    expect(announcements).toEqual(["Creating template...", "Template finished"]);
  });

  it("announces rejection with a retry instruction and does not claim success", async () => {
    const announcements: string[] = [];
    await expect(runAnnouncedSceneCanvasMutation(
      async () => { throw new Error("network offline"); },
      (message) => announcements.push(message),
      { pending: "Hiding fog...", success: "Fog hidden", failure: "Hide fog failed" }
    )).rejects.toThrow("network offline");

    expect(announcements).toEqual([
      "Hiding fog...",
      "Hide fog failed: network offline. Use Retry to try again.",
    ]);
    expect(announcements).not.toContain("Fog hidden");
  });

  it("wires named keyboard help, token movement, gesture completion, and visible focus into the actual canvas", () => {
    expect(canvasSource).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape"');
    expect(canvasSource).toContain("onKeyDown={handleBoardKeyDown}");
    expect(canvasSource).toContain("onKeyDown={(event) => moveTokenFromKeyboard(token, event)}");
    expect(canvasSource).toContain("if (!props.canMoveToken) return;");
    expect(appSource).toContain('canMoveToken={hasPermission("token.move")}');
    expect(canvasSource).toContain("Enter or Space to start and finish");
    expect(canvasSource).toContain("props.onFogStroke(mode, current.points)");
    expect(canvasSource).toContain("props.onAnnotationCreate(kind, current.points, radius)");
    expect(canvasSource).toContain("onPointerDownCapture={takeOverBoardWithPointer}");
    expect(canvasSource).toContain('setKeyboardStatus("Keyboard board operation cancelled by pointer input")');
    expect(canvasSource).toContain("if (calibrationActive) return null;");
    expect(canvasSource).toContain('pointerEvents: calibrationActive ? "none" : undefined');
    expect(appSource).toContain("setGridCalibrationOpen(false); setGridCalibrationPoints([]);");
    expect(appSource).toContain("if (next) { setFogBrushMode(null); setAnnotationTool(null);");
    expect(stylesSource).toContain(".keyboard-board-cursor");
    expect(stylesSource).toContain(".scene-board:focus-visible");
  });
});
