import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardCaptureIncludes, canvasColorChannels, mapRendererStorageKey, preferredMapRenderer, withDomBoardForCapture } from "./board-canvas-layers.js";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");

/** A stand-in for the browser's colour parsing: valid colours are normalised, anything else is ignored. */
function colorParsingContext(normalise: (value: string) => string | undefined) {
  let current = "#000000";
  return {
    get fillStyle() { return current; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      const parsed = typeof value === "string" ? normalise(value) : undefined;
      if (parsed) current = parsed;
    }
  };
}

function stubBrowser(options: { stored?: string | null; context?: unknown; storageThrows?: boolean }) {
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => options.context ?? null }) });
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) throw new Error("storage blocked");
        return key === mapRendererStorageKey ? options.stored ?? null : null;
      }
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("renderer choice", () => {
  it("is the DOM renderer where there is no document", () => {
    expect(preferredMapRenderer()).toBe("dom");
  });

  it("is the canvas renderer when the browser can draw and filter on a canvas", () => {
    stubBrowser({ context: { filter: "none" } });
    expect(preferredMapRenderer()).toBe("canvas");
  });

  it("honours the opt-out stored under the documented key", () => {
    expect(mapRendererStorageKey).toBe("otte:boardRenderer");
    stubBrowser({ stored: "dom", context: { filter: "none" } });
    expect(preferredMapRenderer()).toBe("dom");
    stubBrowser({ stored: "something-else", context: { filter: "none" } });
    expect(preferredMapRenderer()).toBe("canvas");
  });

  it("falls back to the DOM renderer without a 2D context or without canvas filters", () => {
    stubBrowser({ context: null });
    expect(preferredMapRenderer()).toBe("dom");
    stubBrowser({ context: {} });
    expect(preferredMapRenderer()).toBe("dom");
  });

  it("still chooses a renderer when storage is blocked", () => {
    stubBrowser({ storageThrows: true, context: { filter: "none" } });
    expect(preferredMapRenderer()).toBe("canvas");
  });
});

describe("light colours", () => {
  const hexOnly = (value: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined);

  it("reads the channels of an opaque colour", () => {
    expect(canvasColorChannels(colorParsingContext(hexOnly), "#7AD1FF")).toEqual({ red: 122, green: 209, blue: 255, alpha: 1 });
  });

  it("keeps the alpha of a translucent colour", () => {
    const context = colorParsingContext((value) => (value.startsWith("rgb") ? value : hexOnly(value)));
    expect(canvasColorChannels(context, "rgba(10, 20, 30, 0.5)")).toEqual({ red: 10, green: 20, blue: 30, alpha: 0.5 });
    expect(canvasColorChannels(context, "rgb(10, 20, 30)")).toEqual({ red: 10, green: 20, blue: 30, alpha: 1 });
  });

  it("uses the default light colour for anything the canvas does not accept", () => {
    expect(canvasColorChannels(colorParsingContext(hexOnly), "url(javascript:alert(1))")).toEqual({ red: 250, green: 204, blue: 21, alpha: 1 });
    expect(canvasColorChannels(colorParsingContext(hexOnly), "")).toEqual({ red: 250, green: 204, blue: 21, alpha: 1 });
  });
});

describe("AI board capture", () => {
  it("shows the DOM map for the capture and restores the canvas afterwards", async () => {
    const board = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    const during = await withDomBoardForCapture(board, async (filter) => {
      expect(filter).toBe(boardCaptureIncludes);
      return board.dataset.boardCapture;
    });
    expect(during).toBe("true");
    expect(board.dataset.boardCapture).toBeUndefined();
  });

  it("restores the canvas when the capture fails", async () => {
    const board = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    await expect(withDomBoardForCapture(board, async () => { throw new Error("capture failed"); })).rejects.toThrow("capture failed");
    expect(board.dataset.boardCapture).toBeUndefined();
  });

  it("leaves the renderer's canvas out of the snapshot and keeps every other node", () => {
    const node = (classes: string[]) => ({ classList: { contains: (name: string) => classes.includes(name) } }) as unknown as Node;
    expect(boardCaptureIncludes(node(["board-map-canvas"]))).toBe(false);
    expect(boardCaptureIncludes(node(["scene-map"]))).toBe(true);
    expect(boardCaptureIncludes(node(["token"]))).toBe(true);
    expect(boardCaptureIncludes({} as Node)).toBe(true);
  });

  it("is used by the board capture in the app, with the filter passed to the snapshot", () => {
    expect(source("App.tsx")).toMatch(/withDomBoardForCapture\(board, \(filter\) => toPng\(board, \{[^}]*\bfilter\b[^}]*\}\)\)/);
  });
});

describe("what stays in the DOM", () => {
  const sceneCanvas = source("scene-canvas.tsx");
  const styles = source("board-canvas-layers.css");

  it("keeps the map image, the light elements and the token buttons as elements", () => {
    expect(sceneCanvas).toContain('<img ref={mapImageRef} className="scene-map"');
    expect(sceneCanvas).toContain("className={`light-source ${light.kind ?? \"light\"}`}");
    expect(sceneCanvas).toMatch(/<button[^>]*\n?[^>]*className=\{`token /);
    expect(sceneCanvas).toContain("data-map-renderer={mapRenderer}");
  });

  it("hides the replaced elements only under the canvas renderer and never during a capture", () => {
    expect(styles).toContain('.scene-board[data-map-renderer="canvas"]:not([data-board-capture="true"]) > .scene-map');
    expect(styles).toContain('.scene-board[data-map-renderer="canvas"]:not([data-board-capture="true"]) > .board-map-canvas[data-draws-lights] ~ .light-source');
    expect(styles).toContain('.scene-board[data-board-capture="true"] > .board-map-canvas');
  });

  it("clips the map image rather than changing its opacity or filter, which the canvas reads", () => {
    const rule = /> \.scene-map \{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(rule).toContain("clip-path: inset(100%)");
    expect(rule).not.toMatch(/opacity|filter|display|visibility/);
    expect(source("board-canvas-layers.tsx")).toContain("window.getComputedStyle(image)");
  });

  it("never lets the canvas take pointer input from the board", () => {
    const rule = /\.board-map-canvas \{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(rule).toContain("pointer-events: none");
    expect(sceneCanvas).toContain("{canvasLayers.mapCanvas}");
    expect(source("board-canvas-layers.tsx")).toContain('className="board-map-canvas" aria-hidden="true"');
  });
});
