import type { Scene } from "@open-tabletop/core";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { boardCanvasPinsImage, boardCanvasPixelRatio, boardPaddingBox, boardCanvasStretchRange, boardCanvasWindow, boardCanvasWindowCovers, containedImageRect, devicePixelSnapOffset, imageDrawRects, lightGlow, lightGlowIsDrawn, scaleBoardRect, visibleBoardRect, type BoardRect } from "./board-canvas-geometry.js";
import "./board-canvas-layers.css";

export type MapRenderer = "canvas" | "dom";

/** Set this key to `dom` in local storage to draw the map and light glows with the original DOM elements. */
export const mapRendererStorageKey = "otte:boardRenderer";
const fallbackLightColor = "#facc15";
/** How long after the last zoom step the stretched canvas is redrawn at its new size. */
const settleDelayMs = 140;

/**
 * The canvas renderer unless the user opted out or the browser cannot draw it.
 * The map's colour treatment is applied with the canvas `filter` property, so
 * a browser without it keeps the DOM renderer rather than showing a different map.
 */
export function preferredMapRenderer(): MapRenderer {
  if (typeof document === "undefined") return "dom";
  try {
    if (window.localStorage.getItem(mapRendererStorageKey) === "dom") return "dom";
  } catch {
    /* storage unavailable */
  }
  try {
    const context = document.createElement("canvas").getContext("2d");
    return context && typeof context.filter === "string" ? "canvas" : "dom";
  } catch {
    return "dom";
  }
}

/** False for the renderer's canvas, which a DOM snapshot must skip: a map served from another origin taints it, and reading a tainted canvas throws. */
export function boardCaptureIncludes(node: Node): boolean {
  return !("classList" in node && (node as Element).classList.contains("board-map-canvas"));
}

/**
 * Runs a DOM snapshot of the board (the AI agent's board capture) with the
 * original map image and light elements showing and the canvas left out, so
 * the capture is identical whichever renderer is active. Pass the filter to
 * the snapshot library.
 */
export async function withDomBoardForCapture<T>(board: HTMLElement, capture: (filter: (node: Node) => boolean) => Promise<T>): Promise<T> {
  board.dataset.boardCapture = "true";
  try {
    return await capture(boardCaptureIncludes);
  } finally {
    delete board.dataset.boardCapture;
  }
}

export interface ColorChannels { red: number; green: number; blue: number; alpha: number }
const fallbackLightChannels: ColorChannels = { red: 250, green: 204, blue: 21, alpha: 1 };

/** Resolves any CSS colour the canvas accepts to its channels; anything else becomes the default light colour. */
export function canvasColorChannels(context: Pick<CanvasRenderingContext2D, "fillStyle">, color: string): ColorChannels {
  context.fillStyle = fallbackLightColor;
  context.fillStyle = color;
  const resolved = String(context.fillStyle);
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(resolved);
  if (hex) return { red: parseInt(hex[1]!, 16), green: parseInt(hex[2]!, 16), blue: parseInt(hex[3]!, 16), alpha: 1 };
  const rgba = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(resolved);
  if (rgba) return { red: Number(rgba[1]), green: Number(rgba[2]), blue: Number(rgba[3]), alpha: rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4]))) };
  return fallbackLightChannels;
}

/** The area the board's children are laid out in: its client rectangle without the border. */
function measureBoard(board: HTMLElement) {
  const style = window.getComputedStyle(board);
  return boardPaddingBox(board.getBoundingClientRect(), {
    left: parseFloat(style.borderLeftWidth), top: parseFloat(style.borderTopWidth), right: parseFloat(style.borderRightWidth), bottom: parseFloat(style.borderBottomWidth)
  });
}

function placeCanvas(canvas: HTMLCanvasElement, rect: BoardRect, snap = { x: 0, y: 0 }) {
  canvas.style.left = `${rect.left + snap.x}px`;
  canvas.style.top = `${rect.top + snap.y}px`;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

function prepareCanvas(canvas: HTMLCanvasElement, drawn: BoardRect, ratio: number, snap: { x: number; y: number }): CanvasRenderingContext2D | null {
  placeCanvas(canvas, drawn, snap);
  const width = Math.max(1, Math.round(drawn.width * ratio));
  const height = Math.max(1, Math.round(drawn.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.filter = "none";
  context.clearRect(0, 0, width, height);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

interface BoardCanvasLayerOptions {
  enabled: boolean;
  viewportRef: RefObject<HTMLElement | null>;
  boardRef: RefObject<HTMLElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
  /** Changes when the map image changes, so the layer redraws once it has loaded. */
  imageKey: string | undefined;
  scene: Pick<Scene, "width" | "height" | "lights">;
  boardWidth: number;
  boardHeight: number;
}

/**
 * Draws the map image and, when it fills the board, the light glows on one canvas that covers the
 * visible part of the board plus a margin. Everything a user can interact
 * with, and everything whose visibility depends on who is looking, stays in
 * the DOM.
 */
export function useBoardCanvasLayers(options: BoardCanvasLayerOptions): { mapCanvas: ReactNode } {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The drawn window in the board's current pixels, and the board width it was drawn for. */
  const drawnRef = useRef<{ rect: BoardRect; boardWidth: number } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  /** The decoded map, kept so a draw never waits for the browser to decode the image again. */
  const pinnedImage = useRef<ImageBitmap | null>(null);
  const latest = useRef(options);
  latest.current = options;
  // The scene object is replaced on every change (a token move included), so compare the lights by value.
  const lightsKey = JSON.stringify(options.scene.lights);

  const draw = useCallback((force: boolean) => {
    const { viewportRef, boardRef, imageRef, scene } = latest.current;
    const viewport = viewportRef.current;
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !board || !canvas) return;
    const boardBounds = measureBoard(board);
    const visible = visibleBoardRect(viewport.getBoundingClientRect(), boardBounds);
    if (!visible) return;
    if (!force && drawnRef.current && boardCanvasWindowCovers(drawnRef.current.rect, visible, boardBounds.width, boardBounds.height)) return;

    const startedAt = performance.now();
    const drawn = boardCanvasWindow(visible, boardBounds.width, boardBounds.height);
    drawnRef.current = { rect: drawn, boardWidth: boardBounds.width };
    window.clearTimeout(settleTimer.current);
    const deviceRatio = window.devicePixelRatio || 1;
    const snap = { x: devicePixelSnapOffset(boardBounds.left, deviceRatio), y: devicePixelSnapOffset(boardBounds.top, deviceRatio) };
    const context = prepareCanvas(canvas, drawn, boardCanvasPixelRatio(drawn.width, drawn.height, deviceRatio), snap);
    if (!context) return;

    const image = imageRef.current;
    let drawsLights = false;
    if (image && image.complete && image.naturalWidth > 0) {
      const imageRect = containedImageRect(image.naturalWidth, image.naturalHeight, boardBounds.width, boardBounds.height);
      // Allow for layout rounding and the board border. When the board background is exposed,
      // the original glows blend with it in CSS instead of blending with transparent canvas pixels.
      drawsLights = boardBounds.width - imageRect.width < 2 && boardBounds.height - imageRect.height < 2;
      const rects = imageDrawRects(
        { width: image.naturalWidth, height: image.naturalHeight },
        imageRect,
        drawn
      );
      if (rects) {
        // The stylesheet's treatment of the map image (opacity and colour filter) stays the single source of truth.
        const style = window.getComputedStyle(image);
        const opacity = Number(style.opacity);
        context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
        context.filter = style.filter && style.filter !== "none" ? style.filter : "none";
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(pinnedImage.current ?? image, rects.source.left, rects.source.top, rects.source.width, rects.source.height, rects.destination.left, rects.destination.top, rects.destination.width, rects.destination.height);
        context.filter = "none";
      }
    }

    canvas.toggleAttribute("data-draws-lights", drawsLights);
    for (const light of drawsLights ? scene.lights : []) {
      const shape = lightGlow(light, scene, boardBounds.width, boardBounds.height, drawn);
      if (!lightGlowIsDrawn(shape, drawn)) continue;
      const color = canvasColorChannels(context, light.color);
      const gradient = context.createRadialGradient(shape.x, shape.y, 0, shape.x, shape.y, shape.outerRadius);
      for (const stop of shape.stops) gradient.addColorStop(stop.offset, `rgba(${color.red}, ${color.green}, ${color.blue}, ${(color.alpha * stop.alpha).toFixed(4)})`);
      context.globalCompositeOperation = light.kind === "darkness" ? "multiply" : "screen";
      context.globalAlpha = Math.min(1, Math.max(0, shape.opacity));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(shape.x, shape.y, shape.outerRadius, 0, Math.PI * 2);
      context.fill();
    }
    // Read by the board performance harness and by tests that assert when a redraw happens.
    const stats = canvas.dataset;
    stats.drawCount = String(Number(stats.drawCount ?? 0) + 1);
    stats.drawMs = (Number(stats.drawMs ?? 0) + performance.now() - startedAt).toFixed(1);
  }, []);

  /**
   * A zoom step resizes the board. Rather than redraw for every step, stretch
   * what is already drawn to its new place, the way a map viewer does, and
   * redraw once at full quality when the zoom settles.
   */
  const followResize = useCallback(() => {
    const { viewportRef, boardRef } = latest.current;
    const viewport = viewportRef.current;
    const board = boardRef.current;
    const canvas = canvasRef.current;
    const previous = drawnRef.current;
    if (!viewport || !board || !canvas) return;
    if (!previous) { draw(true); return; }
    const boardBounds = measureBoard(board);
    const scale = boardBounds.width / previous.boardWidth;
    if (Math.abs(scale - 1) < 0.0005) return;
    const visible = visibleBoardRect(viewport.getBoundingClientRect(), boardBounds);
    const stretched = scaleBoardRect(previous.rect, scale);
    const drawnScale = stretched.width / Math.max(1, canvas.width / (window.devicePixelRatio || 1));
    if (!visible || drawnScale < boardCanvasStretchRange.min || drawnScale > boardCanvasStretchRange.max || !boardCanvasWindowCovers(stretched, visible, boardBounds.width, boardBounds.height, 0)) {
      draw(true);
      return;
    }
    placeCanvas(canvas, stretched);
    drawnRef.current = { rect: stretched, boardWidth: boardBounds.width };
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => draw(true), settleDelayMs);
  }, [draw]);

  useLayoutEffect(() => {
    if (options.enabled) draw(true);
  }, [draw, lightsKey, options.enabled, options.imageKey, options.scene.height, options.scene.width]);

  useLayoutEffect(() => {
    if (options.enabled) followResize();
  }, [followResize, options.boardHeight, options.boardWidth, options.enabled]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  useEffect(() => {
    if (!options.enabled) return;
    const viewport = options.viewportRef.current;
    const image = options.imageRef.current;
    const redraw = () => draw(true);
    const follow = () => draw(false);
    viewport?.addEventListener("scroll", follow, { passive: true });
    const observer = viewport && typeof ResizeObserver !== "undefined" ? new ResizeObserver(redraw) : undefined;
    if (viewport) observer?.observe(viewport);
    let current = true;
    const pin = () => {
      redraw();
      if (!image || !boardCanvasPinsImage(image.naturalWidth, image.naturalHeight) || typeof createImageBitmap !== "function") return;
      createImageBitmap(image).then((bitmap) => {
        if (!current) { bitmap.close(); return; }
        pinnedImage.current?.close();
        pinnedImage.current = bitmap;
      }, () => undefined);
    };
    image?.addEventListener("load", pin);
    // Decode ahead of the first draw so a large map does not stall a frame.
    image?.decode?.().then(pin, () => undefined);
    return () => {
      current = false;
      pinnedImage.current?.close();
      pinnedImage.current = null;
      viewport?.removeEventListener("scroll", follow);
      observer?.disconnect();
      image?.removeEventListener("load", pin);
    };
  }, [draw, options.enabled, options.imageKey, options.imageRef, options.viewportRef]);

  if (!options.enabled) return { mapCanvas: null };
  return { mapCanvas: <canvas ref={canvasRef} className="board-map-canvas" aria-hidden="true" /> };
}
