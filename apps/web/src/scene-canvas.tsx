import type { Actor, FogMode, MapAsset, Scene, SceneAnnotation, SceneAnnotationKind, SceneAnnotationLayer, SceneTemplateShape, Token, TokenLayer, VisionPoint, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import { assetBlobUrl } from "./api.js";
import { BrickWall, ChevronLeft, ChevronRight, Circle, Crosshair, Eraser, Eye, Flame, Grip, Image as ImageIcon, Layers, Lightbulb, LockKeyhole, Map as MapIcon, MapPin, Paintbrush, PencilLine, Pentagon, Plus, Ruler, Swords, Trash2, Triangle, X, ZoomIn, ZoomOut, RefreshCw, Hand, RotateCcw, Boxes, ScrollText, Download, Upload, UserX } from "lucide-react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { BoardTokenFrameChange, BoardTokenPositionChange } from "./board-history.js";
import { computeTokenMovements, formatGridDistance } from "./board-animation.js";
import { scenePointFromClient } from "./board-geometry.js";
import { activeSceneAnnotations, nextAnnotationExpiryMs } from "./annotation-expiry.js";
import { actorConditionLabels, actorHitPoints } from "./actor-sheet-data.js";
import { templateConePoints } from "./scene-annotations.js";
import { errorMessage, formatNumber, titleCaseLabel } from "./sheet-format.js";
import { hasTokenDropData, readTokenDropData, type TokenDropPayload } from "./token-drag.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";

const pingAnnotationTtlSeconds = 5;
const annotationExpiryTimerSlackMs = 25;
const maxBrowserTimerDelayMs = 2_147_483_647;
const annotationLayers: SceneAnnotationLayer[] = ["measurement", "effects", "drawings", "notes"];
const gridlessMapPromptMarker = "gridless virtual tabletop background";

interface SceneViewportSize {
  width: number;
  height: number;
}

type MeasurementTool = "measure-circle" | "measure-cone";
type AnnotationTool = SceneAnnotationKind | MeasurementTool | null;
type ActiveAnnotationTool = NonNullable<AnnotationTool>;

export function isUsableImageAsset(asset: MapAsset): boolean {
  return asset.mimeType.startsWith("image/") && asset.lifecycle?.status !== "deleted";
}

export function sceneGridOverlayVisible(scene: Scene): boolean {
  if (scene.gridType === "gridless") return false;
  const explicit = scene.metadata?.gridOverlayVisible;
  if (typeof explicit === "boolean") return explicit;
  const generatedPrompt = scene.metadata?.generatedBackgroundPrompt;
  if (typeof generatedPrompt === "string" && generatedPrompt.trim()) {
    return generatedPrompt.toLowerCase().includes(gridlessMapPromptMarker);
  }
  return true;
}

export function useAnnotationExpiryClock(annotations: readonly Pick<SceneAnnotation, "expiresAt">[] | undefined): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const nextExpiry = nextAnnotationExpiryMs(annotations, nowMs);
    if (nextExpiry === undefined) return;

    const delayMs = Math.max(0, Math.min(nextExpiry - Date.now() + annotationExpiryTimerSlackMs, maxBrowserTimerDelayMs));
    const timeoutId = window.setTimeout(() => setNowMs(Date.now()), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [annotations, nowMs]);

  return nowMs;
}


export interface FogStrokeDraft {
  pointerId: number;
  mode: FogMode;
  points: VisionPoint[];
}


export interface AnnotationDraft {
  pointerId: number;
  kind: ActiveAnnotationTool;
  points: VisionPoint[];
}


export interface AnnotationMoveDraft {
  annotationId: string;
  pointerId: number;
  mode: "move" | "point";
  pointIndex?: number;
  start: VisionPoint;
  originalPoints: VisionPoint[];
  points: VisionPoint[];
  current: VisionPoint;
}


export interface TokenDragDraft {
  tokenId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  origins: Record<string, TokenDragOrigin>;
  settling?: boolean;
}


export type TokenResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";


export interface TokenResizeDraft {
  tokenId: string;
  pointerId: number;
  handle: TokenResizeHandle;
  origin: TokenFrame;
  frame: TokenFrame;
}


export interface TokenDragOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}


export interface SelectionBoxDraft {
  pointerId: number;
  start: VisionPoint;
  current: VisionPoint;
  additive: boolean;
  moved: boolean;
}


export interface MapPanDraft {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
  clearSelectionOnClick: boolean;
}


export interface TokenSelectionOptions {
  additive?: boolean;
  preserveExisting?: boolean;
}


export type TokenFrame = Pick<Token, "x" | "y" | "width" | "height">;

export type TokenFrameOverrides = Record<string, TokenFrame>;

export type TokenMovePersistenceChange = { token: Token; position: Pick<Token, "x" | "y"> };

export type ToolAction = () => void | Promise<void>;

export type KeyboardFogGestureKind = `fog-${FogMode}`;

export interface KeyboardBoardGesture {
  kind: ActiveAnnotationTool | KeyboardFogGestureKind;
  points: VisionPoint[];
  complete?: boolean;
}

export function boardArrowDelta(key: string, scene: Pick<Scene, "gridSize" | "gridType">, fine: boolean): VisionPoint | undefined {
  const step = fine ? 1 : scene.gridType === "gridless" ? 10 : Math.max(1, scene.gridSize);
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  return undefined;
}

export function movedKeyboardCursor(scene: Pick<Scene, "width" | "height">, cursor: VisionPoint, delta: VisionPoint): VisionPoint {
  return {
    x: Math.round(clampSceneCoordinate(cursor.x + delta.x, 0, scene.width)),
    y: Math.round(clampSceneCoordinate(cursor.y + delta.y, 0, scene.height))
  };
}

export function keyboardTokenPositions(
  scene: Pick<Scene, "width" | "height">,
  tokens: ReadonlyArray<Pick<Token, "id" | "x" | "y" | "width" | "height">>,
  delta: VisionPoint
): Record<string, Pick<Token, "x" | "y">> {
  if (tokens.length === 0) return {};
  const minX = Math.min(...tokens.map((token) => token.x));
  const minY = Math.min(...tokens.map((token) => token.y));
  const maxRight = Math.max(...tokens.map((token) => token.x + token.width));
  const maxBottom = Math.max(...tokens.map((token) => token.y + token.height));
  const boundedDeltaX = clampSceneCoordinate(delta.x, -minX, scene.width - maxRight);
  const boundedDeltaY = clampSceneCoordinate(delta.y, -minY, scene.height - maxBottom);
  return Object.fromEntries(
    tokens.map((token) => [token.id, { x: Math.round(token.x + boundedDeltaX), y: Math.round(token.y + boundedDeltaY) }])
  );
}

export function isKeyboardFogGestureKind(kind: KeyboardBoardGesture["kind"]): kind is KeyboardFogGestureKind {
  return kind === "fog-reveal" || kind === "fog-hide";
}

export function movedKeyboardGesture(gesture: KeyboardBoardGesture, point: VisionPoint): KeyboardBoardGesture {
  if (gesture.complete) return gesture;
  const first = gesture.points[0] ?? point;
  const freehand = gesture.kind === "drawing" || isKeyboardFogGestureKind(gesture.kind);
  return { ...gesture, points: freehand ? [...gesture.points, point] : [first, point] };
}

export async function runAnnouncedSceneCanvasMutation(
  action: () => Promise<void>,
  announce: (message: string) => void,
  messages: { pending: string; success: string; failure: string }
): Promise<void> {
  announce(messages.pending);
  try {
    await action();
    announce(messages.success);
  } catch (error) {
    announce(`${messages.failure}: ${errorMessage(error)}. Use Retry to try again.`);
    throw error;
  }
}


export const tokenLayers: Array<{ id: TokenLayer; label: string; compactLabel: string; description: string }> = [
  { id: "map", label: "Map & Background", compactLabel: "Props", description: "Scene props and map dressing below playable tokens." },
  { id: "player", label: "Player Objects & Tokens", compactLabel: "Players", description: "Player-visible, selectable combat and interaction tokens." },
  { id: "gm", label: "GM Info Overlay", compactLabel: "GM", description: "GM-only tokens and notes hidden from players." }
];

export const tokenLayerRanks: Record<TokenLayer, number> = { map: 0, player: 1, gm: 2 };

export const tokenVisualScale = 0.92;

export const largeTokenVisualScale = 0.96;

export const battleMapZoomMin = 0.5;

export const battleMapZoomMax = 2;

export const battleMapZoomStep = 0.25;


export function clampSceneCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


export function clampBattleMapZoom(value: number): number {
  return Math.max(battleMapZoomMin, Math.min(battleMapZoomMax, Number(value.toFixed(2))));
}


export function battleMapBoardDimensions(scene: Pick<Scene, "width" | "height">, viewport: SceneViewportSize, zoom: number): { width: number; height: number } {
  const aspect = Math.max(0.1, scene.width / Math.max(1, scene.height));
  const availableWidth = Math.max(240, viewport.width - 20);
  const availableHeight = Math.max(180, viewport.height - 20);
  let baseWidth = Math.max(240, Math.min(availableWidth, availableHeight * aspect));
  let baseHeight = baseWidth / aspect;
  if (baseHeight > availableHeight) {
    baseHeight = availableHeight;
    baseWidth = baseHeight * aspect;
  }
  const safeZoom = clampBattleMapZoom(zoom);
  return {
    width: Math.round(baseWidth * safeZoom),
    height: Math.round(baseHeight * safeZoom)
  };
}


export function formatBattleMapZoom(value: number): string {
  return `${Math.round(value * 100)}%`;
}


export function tokenLayer(token?: Pick<Token, "layer">): TokenLayer {
  return token?.layer === "map" || token?.layer === "gm" || token?.layer === "player" ? token.layer : "player";
}


export function tokenLayerLabel(layer: TokenLayer): string {
  return tokenLayers.find((item) => item.id === layer)?.label ?? "Player Objects & Tokens";
}


export function nextTokenLayer(layer: TokenLayer): TokenLayer {
  const currentIndex = tokenLayers.findIndex((item) => item.id === layer);
  if (currentIndex < 0) return "player";
  return tokenLayers[(currentIndex + 1) % tokenLayers.length]?.id ?? "player";
}


export function MapLayerStack(props: { scene?: Scene; tokens: Token[]; activeTokenLayer: TokenLayer; fogActive: boolean; visibleAnnotationLayers: Record<SceneAnnotationLayer, boolean>; onSelectTokenLayer(layer: TokenLayer): void; onToggleAnnotationLayer(layer: SceneAnnotationLayer, visible: boolean): void }) {
  const sceneTokens = props.scene ? props.tokens.filter((token) => token.sceneId === props.scene!.id) : [];
  const layerCounts = tokenLayers.reduce<Record<TokenLayer, number>>((counts, layer) => {
    counts[layer.id] = sceneTokens.filter((token) => tokenLayer(token) === layer.id).length;
    return counts;
  }, { map: 0, player: 0, gm: 0 });
  const annotationExpiryNow = useAnnotationExpiryClock(props.scene?.annotations);
  const annotationCount = useMemo(() => activeSceneAnnotations(props.scene?.annotations, annotationExpiryNow).length, [annotationExpiryNow, props.scene?.annotations]);
  const visibleAnnotationCount = annotationLayers.filter((layer) => props.visibleAnnotationLayers[layer]).length;
  return (
    <aside className="map-layer-stack" aria-label="Map layer stack">
      <div className="map-layer-stack-heading">
        <span>Layers</span>
        <strong>{props.scene?.name ?? "No scene"}</strong>
      </div>
      <div className="map-layer-row">
        <span>Map</span>
        <strong>{props.scene?.backgroundAssetId ? "background" : "empty"}</strong>
      </div>
      {tokenLayers.map((layer) => (
        <button className={`map-layer-row map-layer-button ${props.activeTokenLayer === layer.id ? "active" : ""}`} type="button" aria-pressed={props.activeTokenLayer === layer.id} title={layer.description} key={layer.id} onClick={() => props.onSelectTokenLayer(layer.id)}>
          <span>{layer.compactLabel}</span>
          <strong>{formatNumber(layerCounts[layer.id])}</strong>
        </button>
      ))}
      <details className="map-layer-row map-layer-details">
        <summary>
          <span>Annotations</span>
          <strong>{formatNumber(annotationCount)} / {formatNumber(visibleAnnotationCount)} shown</strong>
        </summary>
        <div className="map-layer-toggles">
          {annotationLayers.map((layer) => (
            <label className="inline-check" key={layer}>
              <input type="checkbox" checked={props.visibleAnnotationLayers[layer]} onChange={(event) => props.onToggleAnnotationLayer(layer, event.target.checked)} />
              <span>{titleCaseLabel(layer)}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="map-layer-row">
        <span>Fog</span>
        <strong>{props.fogActive ? "active" : "off"}</strong>
      </div>
    </aside>
  );
}


export function snapTokenAxisToGrid(position: number, size: number, sceneSize: number, gridSize: number): number {
  const safeSize = Math.max(1, Math.round(size) || 1);
  const safeGridSize = Math.max(1, Math.round(gridSize) || 1);
  const maxPosition = Math.max(0, sceneSize - safeSize);
  const gridCells = Math.max(1, Math.round(safeSize / safeGridSize));
  const isGridSized = Math.abs(safeSize - gridCells * safeGridSize) <= 1;
  if (isGridSized) {
    return clampSceneCoordinate(Math.round(position / safeGridSize) * safeGridSize, 0, maxPosition);
  }
  const center = position + safeSize / 2;
  const firstCenter = safeSize / 2;
  const lastCenter = Math.max(firstCenter, sceneSize - safeSize / 2);
  const snappedCenter = Math.round((center - safeGridSize / 2) / safeGridSize) * safeGridSize + safeGridSize / 2;
  return Math.round(clampSceneCoordinate(snappedCenter, firstCenter, lastCenter) - safeSize / 2);
}


export function boundedTokenCoordinates(scene: Pick<Scene, "width" | "height">, token: Pick<Token, "width" | "height">, x: number, y: number): Pick<Token, "x" | "y"> {
  const width = Math.max(1, Math.round(token.width) || 1);
  const height = Math.max(1, Math.round(token.height) || 1);
  return {
    x: clampSceneCoordinate(Math.round(x), 0, Math.max(0, scene.width - width)),
    y: clampSceneCoordinate(Math.round(y), 0, Math.max(0, scene.height - height))
  };
}


type TokenGridScene = Pick<Scene, "width" | "height" | "gridSize"> & Partial<Pick<Scene, "gridType">>;

export function snappedTokenCoordinates(scene: TokenGridScene, token: Pick<Token, "width" | "height">, x: number, y: number): Pick<Token, "x" | "y"> {
  if (scene.gridType === "gridless") return boundedTokenCoordinates(scene, token, x, y);
  return boundedTokenCoordinates(
    scene,
    token,
    snapTokenAxisToGrid(x, token.width, scene.width, scene.gridSize),
    snapTokenAxisToGrid(y, token.height, scene.height, scene.gridSize)
  );
}


export function tokenCoordinatesFromCenter(scene: TokenGridScene, width: number, height: number, centerX: number, centerY: number): Pick<Token, "x" | "y"> {
  return snappedTokenCoordinates(scene, { width, height }, centerX - width / 2, centerY - height / 2);
}


export function selectionBoxRect(draft: SelectionBoxDraft): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
  const left = Math.min(draft.start.x, draft.current.x);
  const top = Math.min(draft.start.y, draft.current.y);
  const right = Math.max(draft.start.x, draft.current.x);
  const bottom = Math.max(draft.start.y, draft.current.y);
  return { left, top, width: right - left, height: bottom - top, right, bottom };
}


export function tokenIntersectsRect(token: Pick<Token, "x" | "y" | "width" | "height">, rect: ReturnType<typeof selectionBoxRect>): boolean {
  return token.x < rect.right && token.x + token.width > rect.left && token.y < rect.bottom && token.y + token.height > rect.top;
}


export function tokenVisualScaleFor(token: Pick<Token, "width" | "height">, gridSize: number): number {
  const largestSideInCells = Math.max(token.width, token.height) / Math.max(1, gridSize);
  return largestSideInCells > 1.1 ? largeTokenVisualScale : tokenVisualScale;
}


export function tokenFrame(token: Pick<Token, "x" | "y" | "width" | "height">): TokenFrame {
  return { x: token.x, y: token.y, width: token.width, height: token.height };
}


export function tokenFrameChanged(before: TokenFrame, after: TokenFrame): boolean {
  return before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height;
}


export function snapSceneAxisToGrid(value: number, sceneSize: number, gridSize: number): number {
  const safeGridSize = Math.max(1, Math.round(gridSize) || 1);
  return clampSceneCoordinate(Math.round(value / safeGridSize) * safeGridSize, 0, sceneSize);
}


export function tokenResizeFrameFromPoint(scene: TokenGridScene, origin: TokenFrame, handle: TokenResizeHandle, point: VisionPoint): TokenFrame {
  const minSize = scene.gridType === "gridless" ? 1 : Math.max(1, Math.round(scene.gridSize) || 1);
  const position = (value: number, sceneSize: number) => scene.gridType === "gridless" ? clampSceneCoordinate(Math.round(value), 0, sceneSize) : snapSceneAxisToGrid(value, sceneSize, scene.gridSize);
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes("w")) left = position(point.x, scene.width);
  if (handle.includes("e")) right = position(point.x, scene.width);
  if (handle.includes("n")) top = position(point.y, scene.height);
  if (handle.includes("s")) bottom = position(point.y, scene.height);

  if (handle.includes("w")) left = Math.min(left, right - minSize);
  if (handle.includes("e")) right = Math.max(right, left + minSize);
  if (handle.includes("n")) top = Math.min(top, bottom - minSize);
  if (handle.includes("s")) bottom = Math.max(bottom, top + minSize);

  left = clampSceneCoordinate(left, 0, Math.max(0, scene.width - minSize));
  top = clampSceneCoordinate(top, 0, Math.max(0, scene.height - minSize));
  right = clampSceneCoordinate(right, left + minSize, scene.width);
  bottom = clampSceneCoordinate(bottom, top + minSize, scene.height);

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}


export const tokenResizeHandles: Array<{ id: TokenResizeHandle; label: string }> = [
  { id: "n", label: "Resize north edge" },
  { id: "e", label: "Resize east edge" },
  { id: "s", label: "Resize south edge" },
  { id: "w", label: "Resize west edge" },
  { id: "ne", label: "Resize northeast corner" },
  { id: "nw", label: "Resize northwest corner" },
  { id: "se", label: "Resize southeast corner" },
  { id: "sw", label: "Resize southwest corner" }
];


export const tokenCornerResizeHandles = tokenResizeHandles.filter((handle) => handle.id.length === 2);


export function SceneCanvas(props: { scene: Scene; zoom: number; backgroundAsset?: MapAsset; selectedAssetId?: string; assets: MapAsset[]; tokens: Token[]; actors: Actor[]; boardCurrentUserId: string; canSeeAllVitals: boolean; currentTurnTokenIds: string[]; nextTurnTokenIds: string[]; vision?: VisionSnapshot; visionPreviewLabel?: string; selectedTokenId: string; selectedTokenIds: string[]; activeTokenLayer: TokenLayer; fogBrushMode: FogMode | null; annotationTool: AnnotationTool; calibrationPoints?: VisionPoint[]; onCalibrationPoint?(point: VisionPoint): void; templateShape: SceneTemplateShape; visibleAnnotationLayers: Record<SceneAnnotationLayer, boolean>; canDropToken: boolean; canMoveToken: boolean; canUpdateAnnotations: boolean; canResizeToken: boolean; canUpdateTokenLayer: boolean; onSelect(id: string, options?: TokenSelectionOptions): void; onSelectMany(ids: string[], options?: TokenSelectionOptions): void; onSelectBackgroundAsset(assetId: string): void; onClearSelection(): void; onMoved(): Promise<void>; onTokenMovePersist(changes: TokenMovePersistenceChange[]): Promise<void>; onTokenResizePersist(token: Token, frame: TokenFrame): Promise<void>; onTokenMoveCommit(changes: BoardTokenPositionChange[]): void; onTokenResizeCommit(changes: BoardTokenFrameChange[]): void; onTokenLayerCycle(token: Token): Promise<void>; onTokenDrop(payload: TokenDropPayload, point: VisionPoint): Promise<void>; onFogStroke(mode: FogMode, points: VisionPoint[]): Promise<void>; onAnnotationCreate(kind: SceneAnnotationKind, points: VisionPoint[], radius?: number): Promise<void>; onAnnotationMove(annotation: SceneAnnotation, points: VisionPoint[]): Promise<void>; onTogglePortal(wall: Scene["walls"][number]): Promise<void>; selectedOverlay: { type: "annotation" | "wall" | "light"; id: string } | null; onSelectOverlay(next: { type: "annotation" | "wall" | "light"; id: string } | null): void; onZoomBy(delta: number): void }) {
  const mutationAction = useRetryableAction(props.scene.id);
  const calibrationActive = Boolean(props.onCalibrationPoint);
  const [tokenDrag, setTokenDrag] = useState<TokenDragDraft | null>(null);
  const [tokenResize, setTokenResize] = useState<TokenResizeDraft | null>(null);
  const [tokenFrameOverrides, setTokenFrameOverrides] = useState<TokenFrameOverrides>({});
  const [dropActive, setDropActive] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxDraft | null>(null);
  const [fogStroke, setFogStroke] = useState<FogStrokeDraft | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null);
  const [annotationMoveDraft, setAnnotationMoveDraft] = useState<AnnotationMoveDraft | null>(null);
  const tokenDragRef = useRef<TokenDragDraft | null>(null);
  const tokenResizeRef = useRef<TokenResizeDraft | null>(null);
  const pointerSelectedTokenRef = useRef<string | null>(null);
  const mapPanRef = useRef<MapPanDraft | null>(null);
  const selectionBoxRef = useRef<SelectionBoxDraft | null>(null);
  const fogStrokeRef = useRef<FogStrokeDraft | null>(null);
  const annotationDraftRef = useRef<AnnotationDraft | null>(null);
  const annotationMoveDraftRef = useRef<AnnotationMoveDraft | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<SceneViewportSize>({ width: 960, height: 640 });
  const previousSceneTokensRef = useRef<Token[]>([]);
  const tokenMoveSeqRef = useRef(0);
  const [tokenMoveDistances, setTokenMoveDistances] = useState<Record<string, { distancePx: number; seq: number }>>({});
  const tokens = useMemo(() => props.tokens.filter((token) => token.sceneId === props.scene.id), [props.tokens, props.scene.id]);
  const activeLayerTokenIds = useMemo(() => new Set(tokens.filter((token) => tokenLayer(token) === props.activeTokenLayer).map((token) => token.id)), [tokens, props.activeTokenLayer]);
  const orderedTokens = useMemo(
    () =>
      tokens
        .map((token, index) => ({ token, index }))
        .sort((left, right) => tokenLayerRanks[tokenLayer(left.token)] - tokenLayerRanks[tokenLayer(right.token)] || left.index - right.index)
        .map(({ token }) => token),
    [tokens]
  );
  const orderedActiveLayerTokens = useMemo(() => orderedTokens.filter((token) => activeLayerTokenIds.has(token.id)), [orderedTokens, activeLayerTokenIds]);
  const selectedTokenIdSet = useMemo(() => new Set(props.selectedTokenIds), [props.selectedTokenIds]);
  const selectedViewportToken = useMemo(() => tokens.find((token) => token.id === props.selectedTokenId), [tokens, props.selectedTokenId]);
  const [keyboardCursor, setKeyboardCursor] = useState<VisionPoint>(() => ({ x: Math.round(props.scene.width / 2), y: Math.round(props.scene.height / 2) }));
  const [keyboardGesture, setKeyboardGesture] = useState<KeyboardBoardGesture | null>(null);
  const [keyboardCursorVisible, setKeyboardCursorVisible] = useState(false);
  const [keyboardStatus, setKeyboardStatus] = useState("Board ready");
  const keyboardMovePendingRef = useRef(false);
  const keyboardInstructionsId = useId();
  const tokenImageAssets = useMemo(() => new Map(props.assets.filter(isUsableImageAsset).map((asset) => [asset.id, asset])), [props.assets]);
  const actorById = useMemo(() => new Map(props.actors.map((actor) => [actor.id, actor])), [props.actors]);
  const currentTurnTokenIdSet = useMemo(() => new Set(props.currentTurnTokenIds), [props.currentTurnTokenIds]);
  const nextTurnTokenIdSet = useMemo(() => new Set(props.nextTurnTokenIds), [props.nextTurnTokenIds]);
  const annotationExpiryNow = useAnnotationExpiryClock(props.scene.annotations);
  const [annotationOverrides, setAnnotationOverrides] = useState<Record<string, VisionPoint[]>>({});
  const [localPings, setLocalPings] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const localPingSeqRef = useRef(0);
  useEffect(() => {
    // Drop an optimistic override once the server confirms the moved points
    // (or the annotation disappears); until then the annotation stays where
    // the user dropped it instead of rubber-banding to stale server state.
    setAnnotationOverrides((current) => {
      const entries = Object.entries(current);
      if (entries.length === 0) return current;
      const next: Record<string, VisionPoint[]> = {};
      let changed = false;
      for (const [id, points] of entries) {
        const server = props.scene.annotations?.find((annotation) => annotation.id === id);
        const confirmed = !server || (server.points.length === points.length && server.points.every((point, index) => point.x === points[index]!.x && point.y === points[index]!.y));
        if (confirmed) changed = true;
        else next[id] = points;
      }
      return changed ? next : current;
    });
  }, [props.scene.annotations]);
  const visibleAnnotations = useMemo(
    () => activeSceneAnnotations(props.scene.annotations, annotationExpiryNow).filter((annotation) => props.visibleAnnotationLayers[annotation.layer ?? defaultAnnotationLayer(annotation.kind)] !== false),
    [annotationExpiryNow, props.scene.annotations, props.visibleAnnotationLayers]
  );
  const displayAnnotations = useMemo(
    () =>
      visibleAnnotations.map((annotation) => {
        const points = annotationMoveDraft?.annotationId === annotation.id ? annotationMoveDraft.points : annotationOverrides[annotation.id];
        if (!points) return annotation;
        const radius = annotation.kind === "template" && points.length >= 2 ? Math.round(distanceBetween(points[0]!, points[1]!)) : annotation.radius;
        return { ...annotation, points, radius };
      }),
    [visibleAnnotations, annotationMoveDraft, annotationOverrides]
  );
  const renderedAnnotations = useMemo(
    () => displayAnnotations.filter((annotation) => !(annotation.kind === "ping" && annotation.points[0] && localPings.some((ping) => Math.hypot(ping.x - annotation.points[0]!.x, ping.y - annotation.points[0]!.y) < 12))),
    [displayAnnotations, localPings]
  );
  const vision = props.vision?.sceneId === props.scene.id ? props.vision : undefined;
  const lightPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.source === "light" && polygon.lightingEffect !== "darkness" && polygon.points.length > 2) ?? [], [vision]);
  const darknessPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.lightingEffect === "darkness" && polygon.points.length > 2) ?? [], [vision]);
  const nonmagicalDarknessPolygons = useMemo(() => darknessPolygons.filter((polygon) => !polygon.magical), [darknessPolygons]);
  const magicalDarknessPolygons = useMemo(() => darknessPolygons.filter((polygon) => polygon.magical), [darknessPolygons]);
  const nonmagicalDarknessBypassPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.source === "token" && polygon.points.length > 2 && ["darkvision", "blindsight", "tremorsense", "truesight"].includes(polygon.senseType ?? "")) ?? [], [vision]);
  const magicalDarknessBypassPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.source === "token" && polygon.points.length > 2 && ["blindsight", "tremorsense", "truesight"].includes(polygon.senseType ?? "")) ?? [], [vision]);
  const revealedPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source !== "light" && polygon.mode !== "hide" && polygon.points.length > 2) : []), [vision]);
  const hiddenPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source === "fog" && polygon.mode === "hide" && polygon.points.length > 2) : []), [vision]);
  const maskId = `vision-mask-${props.scene.id}`;
  const mundaneDarknessMaskId = `mundane-darkness-mask-${props.scene.id}`;
  const magicalDarknessMaskId = `magical-darkness-mask-${props.scene.id}`;
  const boardDimensions = useMemo(() => battleMapBoardDimensions(props.scene, viewportSize, props.zoom), [props.scene.height, props.scene.width, props.zoom, viewportSize.height, viewportSize.width]);
  const boardStyle = {
    aspectRatio: `${props.scene.width} / ${props.scene.height}`,
    width: `${boardDimensions.width}px`,
    height: `${boardDimensions.height}px`,
    "--scene-aspect": String(props.scene.width / props.scene.height),
    "--map-zoom": String(props.zoom)
  } as CSSProperties;
  const showGridOverlay = sceneGridOverlayVisible(props.scene);

  useEffect(() => {
    setKeyboardCursor({ x: Math.round(props.scene.width / 2), y: Math.round(props.scene.height / 2) });
    setKeyboardGesture(null);
    setKeyboardCursorVisible(false);
    setKeyboardStatus("Board ready");
    setLocalPings([]);
    keyboardMovePendingRef.current = false;
  }, [props.scene.id, props.scene.height, props.scene.width]);

  useEffect(() => {
    setKeyboardGesture(null);
    if (!calibrationActive) return;
    fogStrokeRef.current = null;
    annotationDraftRef.current = null;
    annotationMoveDraftRef.current = null;
    setFogStroke(null);
    setAnnotationDraft(null);
    setAnnotationMoveDraft(null);
  }, [calibrationActive, props.annotationTool, props.fogBrushMode]);

  useEffect(() => {
    if (!selectedViewportToken || keyboardGesture) return;
    setKeyboardCursor(tokenCenter(selectedViewportToken));
  }, [keyboardGesture, selectedViewportToken]);

  useEffect(() => {
    const previous = previousSceneTokensRef.current;
    previousSceneTokensRef.current = orderedTokens;
    if (previous.length === 0) return;
    const movements = computeTokenMovements(previous, orderedTokens, { minDistancePx: Math.max(2, props.scene.gridSize * 0.1) });
    if (movements.length === 0) return;
    setTokenMoveDistances((current) => {
      const next = { ...current };
      for (const movement of movements) {
        tokenMoveSeqRef.current += 1;
        next[movement.tokenId] = { distancePx: movement.distancePx, seq: tokenMoveSeqRef.current };
      }
      return next;
    });
  }, [orderedTokens, props.scene.gridSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const updateViewportSize = () => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight };
      setViewportSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    updateViewportSize();
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateViewportSize);
    });
    resizeObserver.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    setTokenFrameOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const [tokenId, override] of Object.entries(current)) {
        const token = tokens.find((item) => item.id === tokenId);
        if (!token || (token.x === override.x && token.y === override.y && token.width === override.width && token.height === override.height)) {
          delete next[tokenId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tokens]);

  useEffect(() => {
    const token = selectedViewportToken;
    if (!token) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const board = boardRef.current;
      if (!viewport || !board || board.clientWidth <= 0 || board.clientHeight <= 0) return;
      const tokenCenterX = ((token.x + token.width / 2) / props.scene.width) * board.clientWidth;
      const tokenCenterY = ((token.y + token.height / 2) / props.scene.height) * board.clientHeight;
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const compactViewport = viewport.clientWidth < 360 || viewport.clientHeight < 220;
      const targetViewportX = compactViewport ? viewport.clientWidth * 0.24 : viewport.clientWidth / 2;
      const targetViewportY = compactViewport ? Math.max(36, viewport.clientHeight * 0.22) : viewport.clientHeight / 2;
      viewport.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, tokenCenterX - targetViewportX)),
        top: Math.min(maxScrollTop, Math.max(0, tokenCenterY - targetViewportY)),
        behavior: "auto"
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.scene.height, props.scene.id, props.scene.width, props.zoom, selectedViewportToken]);

  function boardPoint(clientX: number, clientY: number, options: { clamp?: boolean } = {}): VisionPoint | undefined {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return scenePointFromClient(rect, props.scene, clientX, clientY, options);
  }

  function annotationDraftPoint(kind: ActiveAnnotationTool, clientX: number, clientY: number): VisionPoint | undefined {
    return boardPoint(clientX, clientY, { clamp: !isDistanceMeasurementTool(kind) && kind !== "template" });
  }

  function isClientPointInsideBoard(clientX: number, clientY: number): boolean {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function startMapPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (calibrationActive || props.fogBrushMode || props.annotationTool || (event.button !== 0 && event.button !== 1)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    mapPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false,
      clearSelectionOnClick: !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.button === 0
    };
    setMapPanning(true);
    tokenDragRef.current = null;
    setTokenDrag(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMapPan(clientX: number, clientY: number, pointerId: number): boolean {
    const current = mapPanRef.current;
    const viewport = viewportRef.current;
    if (!current || current.pointerId !== pointerId || !viewport) return false;
    const deltaX = clientX - current.startClientX;
    const deltaY = clientY - current.startClientY;
    viewport.scrollLeft = current.startScrollLeft - deltaX;
    viewport.scrollTop = current.startScrollTop - deltaY;
    if (!current.moved && Math.hypot(deltaX, deltaY) > 4) {
      mapPanRef.current = { ...current, moved: true };
    }
    return true;
  }

  function finishMapPan(pointerId: number): boolean {
    const current = mapPanRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    mapPanRef.current = null;
    setMapPanning(false);
    if (!current.moved && current.clearSelectionOnClick) props.onClearSelection();
    return true;
  }

  function cancelMapPan(pointerId: number) {
    if (mapPanRef.current?.pointerId !== pointerId) return;
    mapPanRef.current = null;
    setMapPanning(false);
  }

  function startSelectionBox(event: ReactPointerEvent<HTMLDivElement>, point: VisionPoint) {
    if (calibrationActive || event.button !== 0) return;
    const next = {
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false
    };
    selectionBoxRef.current = next;
    setSelectionBox(next);
    tokenDragRef.current = null;
    setTokenDrag(null);
    mapPanRef.current = null;
    setMapPanning(false);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelectionBox(clientX: number, clientY: number, pointerId: number): boolean {
    const current = selectionBoxRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    const point = boardPoint(clientX, clientY);
    if (!point) return true;
    const moved = current.moved || Math.hypot(point.x - current.start.x, point.y - current.start.y) > Math.max(4, props.scene.gridSize / 8);
    const next = { ...current, current: point, moved };
    selectionBoxRef.current = next;
    setSelectionBox(next);
    return true;
  }

  function finishSelectionBox(pointerId: number): boolean {
    const current = selectionBoxRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    if (!current.moved) {
      if (!current.additive) props.onClearSelection();
      return true;
    }
    const rect = selectionBoxRect(current);
    const selectedIds = orderedActiveLayerTokens.filter((token) => tokenIntersectsRect(token, rect)).map((token) => token.id);
    props.onSelectMany(selectedIds, { additive: current.additive });
    return true;
  }

  function cancelSelectionBox(pointerId: number) {
    if (selectionBoxRef.current?.pointerId !== pointerId) return;
    selectionBoxRef.current = null;
    setSelectionBox(null);
  }

  function boundedTokenPosition(token: Token, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    return boundedTokenCoordinates(props.scene, token, x, y);
  }

  function snappedTokenPosition(token: Token, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    return snappedTokenCoordinates(props.scene, token, x, y);
  }

  function renderedTokenFrame(token: Token): TokenFrame {
    return tokenFrameOverrides[token.id] ?? tokenFrame(token);
  }

  function tokenPositionFromPointer(token: Token, clientX: number, clientY: number, offsetX: number, offsetY: number): Pick<TokenDragDraft, "x" | "y"> | undefined {
    const point = boardPoint(clientX, clientY);
    if (!point) return undefined;
    return boundedTokenPosition(token, point.x - offsetX, point.y - offsetY);
  }

  function constrainedTokenDragPosition(draft: TokenDragDraft, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    let minDeltaX = Number.NEGATIVE_INFINITY;
    let maxDeltaX = Number.POSITIVE_INFINITY;
    let minDeltaY = Number.NEGATIVE_INFINITY;
    let maxDeltaY = Number.POSITIVE_INFINITY;
    for (const origin of Object.values(draft.origins)) {
      minDeltaX = Math.max(minDeltaX, -origin.x);
      maxDeltaX = Math.min(maxDeltaX, props.scene.width - (origin.x + origin.width));
      minDeltaY = Math.max(minDeltaY, -origin.y);
      maxDeltaY = Math.min(maxDeltaY, props.scene.height - (origin.y + origin.height));
    }
    const deltaX = clampSceneCoordinate(x - draft.startX, minDeltaX, maxDeltaX);
    const deltaY = clampSceneCoordinate(y - draft.startY, minDeltaY, maxDeltaY);
    return { x: Math.round(draft.startX + deltaX), y: Math.round(draft.startY + deltaY) };
  }

  function startTokenDrag(token: Token, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    if (calibrationActive) return;
    if (!props.canMoveToken) return;
    if (!activeLayerTokenIds.has(token.id)) return;
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;
    const renderedFrame = renderedTokenFrame(token);
    const start = boundedTokenPosition(token, renderedFrame.x, renderedFrame.y);
    const groupTokenIds =
      selectedTokenIdSet.has(token.id) && props.selectedTokenIds.length > 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey
          ? props.selectedTokenIds.filter((id) => activeLayerTokenIds.has(id))
          : [token.id];
    const origins = Object.fromEntries(
      tokens
        .filter((item) => groupTokenIds.includes(item.id))
        .map((item) => {
          const frame = renderedTokenFrame(item);
          return [item.id, { x: frame.x, y: frame.y, width: frame.width, height: frame.height }];
        })
    ) as Record<string, TokenDragOrigin>;
    const next = {
      tokenId: token.id,
      pointerId: event.pointerId,
      offsetX: point.x - start.x,
      offsetY: point.y - start.y,
      startX: start.x,
      startY: start.y,
      x: start.x,
      y: start.y,
      origins
    };
    tokenDragRef.current = next;
    setTokenDrag(next);
    pointerSelectedTokenRef.current = token.id;
    props.onSelect(token.id, {
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      preserveExisting: selectedTokenIdSet.has(token.id) && props.selectedTokenIds.length > 1
    });
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTokenDrag(clientX: number, clientY: number, pointerId: number) {
    const current = tokenDragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const token = tokens.find((item) => item.id === current.tokenId);
    if (!token) return;
    const position = tokenPositionFromPointer(token, clientX, clientY, current.offsetX, current.offsetY);
    if (!position) return;
    const constrained = constrainedTokenDragPosition(current, position.x, position.y);
    if (current.x === constrained.x && current.y === constrained.y) return;
    const next = { ...current, ...constrained };
    tokenDragRef.current = next;
    setTokenDrag(next);
  }

  function cancelTokenDrag(pointerId: number) {
    if (tokenDragRef.current?.pointerId !== pointerId) return;
    tokenDragRef.current = null;
    setTokenDrag(null);
  }

  function finishTokenDrag(pointerId: number) {
    const current = tokenDragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const token = tokens.find((item) => item.id === current.tokenId);
    if (!token) {
      tokenDragRef.current = null;
      setTokenDrag(null);
      return;
    }
    const snapped = snappedTokenPosition(token, current.x, current.y);
    const deltaX = snapped.x - current.startX;
    const deltaY = snapped.y - current.startY;
    const movedTokens = Object.entries(current.origins)
      .flatMap(([tokenId, origin]) => {
        const movedToken = tokens.find((item) => item.id === tokenId);
        if (!movedToken) return [];
        const next = snappedTokenCoordinates(props.scene, movedToken, origin.x + deltaX, origin.y + deltaY);
        return [{ token: movedToken, position: next }];
      })
      .filter(({ token: movedToken, position }) => movedToken.x !== position.x || movedToken.y !== position.y);
    tokenDragRef.current = null;
    setTokenDrag(null);
    if (movedTokens.length === 0) {
      return;
    }
    setTokenFrameOverrides((overrides) => ({
      ...overrides,
      ...Object.fromEntries(movedTokens.map(({ token: movedToken, position }) => [movedToken.id, { ...tokenFrame(movedToken), ...position }]))
    }));
    void mutationAction.runAction(movedTokens.length === 1 ? `Move ${movedTokens[0]!.token.name}` : `Move ${movedTokens.length} selected tokens`, async () => {
      try {
        await props.onTokenMovePersist(movedTokens);
        props.onTokenMoveCommit(
          movedTokens.map(({ token: movedToken, position }) => ({
            tokenId: movedToken.id,
            before: { x: movedToken.x, y: movedToken.y },
            after: position
          }))
        );
        await props.onMoved();
      } catch (error) {
        setTokenFrameOverrides((overrides) => {
          const next = { ...overrides };
          for (const { token: movedToken } of movedTokens) delete next[movedToken.id];
          return next;
        });
        throw error;
      }
    });
  }

  function startTokenResize(token: Token, handle: TokenResizeHandle, event: ReactPointerEvent<HTMLElement>) {
    if (calibrationActive || !props.canResizeToken || !activeLayerTokenIds.has(token.id) || props.fogBrushMode || props.annotationTool) return;
    const origin = renderedTokenFrame(token);
    const next = { tokenId: token.id, pointerId: event.pointerId, handle, origin, frame: origin };
    tokenResizeRef.current = next;
    setTokenResize(next);
    tokenDragRef.current = null;
    setTokenDrag(null);
    pointerSelectedTokenRef.current = token.id;
    props.onSelect(token.id, { preserveExisting: selectedTokenIdSet.has(token.id) });
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTokenResize(clientX: number, clientY: number, pointerId: number): boolean {
    const current = tokenResizeRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    const point = boardPoint(clientX, clientY, { clamp: true });
    if (!point) return true;
    const frame = tokenResizeFrameFromPoint(props.scene, current.origin, current.handle, point);
    if (!tokenFrameChanged(current.frame, frame)) return true;
    const next = { ...current, frame };
    tokenResizeRef.current = next;
    setTokenResize(next);
    return true;
  }

  function cancelTokenResize(pointerId: number) {
    if (tokenResizeRef.current?.pointerId !== pointerId) return;
    tokenResizeRef.current = null;
    setTokenResize(null);
  }

  function finishTokenResize(pointerId: number) {
    const current = tokenResizeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const token = tokens.find((item) => item.id === current.tokenId);
    tokenResizeRef.current = null;
    setTokenResize(null);
    if (!token || !tokenFrameChanged(tokenFrame(token), current.frame)) return;
    const before = tokenFrame(token);
    const after = current.frame;
    setTokenFrameOverrides((overrides) => ({
      ...overrides,
      [token.id]: after
    }));
    void mutationAction.runAction(`Resize ${token.name}`, async () => {
      try {
        await props.onTokenResizePersist(token, after);
        props.onTokenResizeCommit([{ tokenId: token.id, before, after }]);
        await props.onMoved();
      } catch (error) {
        setTokenFrameOverrides((overrides) => {
          const next = { ...overrides };
          delete next[token.id];
          return next;
        });
        throw error;
      }
    });
  }

  function appendFogStrokePoint(clientX: number, clientY: number, pointerId: number) {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const next = { ...current, points: appendStrokePoint(current.points, point, props.scene.gridSize) };
    fogStrokeRef.current = next;
    setFogStroke(next);
  }

  function finishFogStroke(pointerId: number, clientX: number, clientY: number) {
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = boardPoint(clientX, clientY);
    const points = point ? appendStrokePoint(current.points, point, props.scene.gridSize) : current.points;
    fogStrokeRef.current = null;
    setFogStroke(null);
    void mutationAction.runAction(`${current.mode === "reveal" ? "Reveal" : "Hide"} fog stroke`, () => props.onFogStroke(current.mode, points));
  }

  function appendAnnotationDraftPoint(clientX: number, clientY: number, pointerId: number) {
    const current = annotationDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = annotationDraftPoint(current.kind, clientX, clientY);
    if (!point) return;
    const points = current.kind === "drawing" ? appendStrokePoint(current.points, point, props.scene.gridSize) : [current.points[0]!, point];
    const next = { ...current, points };
    annotationDraftRef.current = next;
    setAnnotationDraft(next);
  }

  function finishAnnotationDraft(pointerId: number, clientX: number, clientY: number) {
    const current = annotationDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = annotationDraftPoint(current.kind, clientX, clientY);
    const points = point ? (current.kind === "drawing" ? appendStrokePoint(current.points, point, props.scene.gridSize) : [current.points[0]!, point]) : current.points;
    annotationDraftRef.current = null;
    setAnnotationDraft(null);
    const kind = current.kind;
    if (isTransientMeasurementTool(kind)) return;
    const radius = kind === "template" && points.length >= 2 ? Math.round(Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y)) : undefined;
    void mutationAction.runAction(`Create ${titleCaseLabel(kind)}`, () => props.onAnnotationCreate(kind, points, radius));
  }

  function editedAnnotationPoints(draft: AnnotationMoveDraft, point: VisionPoint): VisionPoint[] {
    if (draft.mode === "point" && draft.pointIndex !== undefined) {
      return draft.originalPoints.map((annotationPoint, index) =>
        index === draft.pointIndex
          ? { x: Math.max(0, Math.min(props.scene.width, point.x)), y: Math.max(0, Math.min(props.scene.height, point.y)) }
          : annotationPoint
      );
    }
    const deltaX = point.x - draft.start.x;
    const deltaY = point.y - draft.start.y;
    return draft.originalPoints.map((annotationPoint) => ({
      x: Math.max(0, Math.min(props.scene.width, Math.round(annotationPoint.x + deltaX))),
      y: Math.max(0, Math.min(props.scene.height, Math.round(annotationPoint.y + deltaY)))
    }));
  }

  function startAnnotationMove(annotation: SceneAnnotation, clientX: number, clientY: number, pointerId: number, mode: AnnotationMoveDraft["mode"], pointIndex?: number) {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const next = { annotationId: annotation.id, pointerId, mode, pointIndex, start: point, current: point, originalPoints: annotation.points, points: annotation.points };
    annotationMoveDraftRef.current = next;
    setAnnotationMoveDraft(next);
  }

  function moveAnnotationDraft(clientX: number, clientY: number, pointerId: number) {
    const current = annotationMoveDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const next = { ...current, current: point, points: editedAnnotationPoints(current, point) };
    annotationMoveDraftRef.current = next;
    setAnnotationMoveDraft(next);
  }

  function finishAnnotationMove(pointerId: number) {
    const current = annotationMoveDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    annotationMoveDraftRef.current = null;
    setAnnotationMoveDraft(null);
    const annotation = visibleAnnotations.find((item) => item.id === current.annotationId);
    if (!annotation) return;
    const unmoved = current.points.length === current.originalPoints.length && current.points.every((point, index) => point.x === current.originalPoints[index]!.x && point.y === current.originalPoints[index]!.y);
    if (unmoved) {
      // A click without movement selects the annotation (Delete removes it).
      // Token selection is released so Delete targets the annotation.
      props.onClearSelection();
      props.onSelectOverlay({ type: "annotation", id: annotation.id });
      return;
    }
    // Optimistic override holds the dropped position until the server
    // confirms it, so no snapshot in flight can rubber-band the shape.
    setAnnotationOverrides((overrides) => ({ ...overrides, [annotation.id]: current.points }));
    void mutationAction.runAction(`Move ${titleCaseLabel(annotation.kind)}`, async () => {
      try {
        await props.onAnnotationMove(annotation, current.points);
      } catch (error) {
        setAnnotationOverrides((overrides) => {
          const next = { ...overrides };
          delete next[annotation.id];
          return next;
        });
        throw error;
      }
    });
  }

  function showLocalPing(point: VisionPoint): void {
    localPingSeqRef.current += 1;
    const localPing = { id: localPingSeqRef.current, x: point.x, y: point.y };
    setLocalPings((current) => [...current.slice(-7), localPing]);
    window.setTimeout(() => setLocalPings((current) => current.filter((ping) => ping.id !== localPing.id)), pingAnnotationTtlSeconds * 1000);
  }

  function takeOverBoardWithPointer(): void {
    setKeyboardCursorVisible(false);
    if (!keyboardGesture) return;
    setKeyboardGesture(null);
    setKeyboardStatus("Keyboard board operation cancelled by pointer input");
  }

  function activeKeyboardGestureKind(): KeyboardBoardGesture["kind"] | null {
    if (calibrationActive) return null;
    if (props.annotationTool) return props.annotationTool;
    if (props.fogBrushMode) return `fog-${props.fogBrushMode}`;
    return null;
  }

  function moveTokenFromKeyboard(token: Token, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (calibrationActive || props.fogBrushMode || props.annotationTool || event.ctrlKey || event.metaKey || event.altKey) return;
    const delta = boardArrowDelta(event.key, props.scene, event.shiftKey);
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (!props.canMoveToken) {
      setKeyboardStatus("Token movement requires token.move permission");
      return;
    }
    if (!activeLayerTokenIds.has(token.id)) {
      setKeyboardStatus(`Switch to the ${tokenLayerLabel(tokenLayer(token))} layer before moving ${token.name}`);
      return;
    }
    setKeyboardCursorVisible(true);
    if (keyboardMovePendingRef.current || mutationAction.operation?.kind === "pending") {
      setKeyboardStatus("Finish the current board update before moving again");
      return;
    }

    const groupTokenIds =
      selectedTokenIdSet.has(token.id) && props.selectedTokenIds.length > 1
        ? props.selectedTokenIds.filter((id) => activeLayerTokenIds.has(id))
        : [token.id];
    const movedTokenFrames = tokens
      .filter((item) => groupTokenIds.includes(item.id))
      .map((item) => ({ ...item, ...renderedTokenFrame(item) }));
    const positions = keyboardTokenPositions(props.scene, movedTokenFrames, delta);
    const movedTokens = movedTokenFrames
      .map((item) => ({ token: tokens.find((tokenItem) => tokenItem.id === item.id)!, position: positions[item.id]! }))
      .filter(({ token: movedToken, position }) => position && (movedToken.x !== position.x || movedToken.y !== position.y));
    if (movedTokens.length === 0) {
      setKeyboardStatus("Selected token is at the map edge");
      return;
    }

    props.onSelect(token.id, { preserveExisting: selectedTokenIdSet.has(token.id) });
    setTokenFrameOverrides((overrides) => ({
      ...overrides,
      ...Object.fromEntries(movedTokens.map(({ token: movedToken, position }) => [movedToken.id, { ...tokenFrame(movedToken), ...position }]))
    }));
    const anchorPosition = positions[token.id];
    if (anchorPosition) setKeyboardCursor({ x: anchorPosition.x + token.width / 2, y: anchorPosition.y + token.height / 2 });
    keyboardMovePendingRef.current = true;
    const label = movedTokens.length === 1 ? `Move ${movedTokens[0]!.token.name} with keyboard` : `Move ${movedTokens.length} selected tokens with keyboard`;
    setKeyboardStatus(label);
    void mutationAction.runAction(label, async () => {
      try {
        await props.onTokenMovePersist(movedTokens);
        props.onTokenMoveCommit(
          movedTokens.map(({ token: movedToken, position }) => ({
            tokenId: movedToken.id,
            before: { x: movedToken.x, y: movedToken.y },
            after: position
          }))
        );
        await props.onMoved();
        setKeyboardStatus(`${movedTokens.length === 1 ? movedTokens[0]!.token.name : `${movedTokens.length} tokens`} moved`);
      } catch (error) {
        setTokenFrameOverrides((overrides) => {
          const next = { ...overrides };
          for (const { token: movedToken } of movedTokens) delete next[movedToken.id];
          return next;
        });
        setKeyboardStatus(`${label} failed: ${errorMessage(error)}. Use Retry to try again.`);
        throw error;
      } finally {
        keyboardMovePendingRef.current = false;
      }
    });
  }

  function handleBoardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const gestureKind = activeKeyboardGestureKind();
    if (event.key === "Escape" && (keyboardGesture || keyboardCursorVisible)) {
      event.preventDefault();
      event.stopPropagation();
      setKeyboardGesture(null);
      setKeyboardCursorVisible(false);
      setKeyboardStatus("Keyboard board operation cancelled");
      return;
    }

    const delta = boardArrowDelta(event.key, props.scene, event.shiftKey);
    if (delta && (gestureKind || props.onCalibrationPoint)) {
      event.preventDefault();
      event.stopPropagation();
      const nextCursor = movedKeyboardCursor(props.scene, keyboardCursor, delta);
      setKeyboardCursor(nextCursor);
      setKeyboardCursorVisible(true);
      setKeyboardGesture((current) => current ? movedKeyboardGesture(current, nextCursor) : current);
      setKeyboardStatus(`Board cursor ${nextCursor.x}, ${nextCursor.y}`);
      return;
    }

    if ((event.key !== "Enter" && event.key !== " ") || (!gestureKind && !props.onCalibrationPoint)) return;
    event.preventDefault();
    event.stopPropagation();
    setKeyboardCursorVisible(true);

    if (props.onCalibrationPoint && !gestureKind) {
      props.onCalibrationPoint(keyboardCursor);
      setKeyboardStatus(`Calibration point placed at ${keyboardCursor.x}, ${keyboardCursor.y}`);
      return;
    }
    if (!gestureKind) return;
    if (gestureKind === "ping") {
      showLocalPing(keyboardCursor);
      void mutationAction.runAction("Place keyboard ping", () => runAnnouncedSceneCanvasMutation(
        () => props.onAnnotationCreate("ping", [keyboardCursor]),
        setKeyboardStatus,
        { pending: "Placing ping...", success: `Ping placed at ${keyboardCursor.x}, ${keyboardCursor.y}`, failure: "Place keyboard ping failed" }
      ));
      return;
    }

    const current = keyboardGesture?.kind === gestureKind ? keyboardGesture : null;
    if (!current || current.complete) {
      setKeyboardGesture({ kind: gestureKind, points: [keyboardCursor] });
      setKeyboardStatus(`${isKeyboardFogGestureKind(gestureKind) ? "Fog stroke" : annotationToolLabel(gestureKind)} started; use arrow keys, then Enter to finish`);
      return;
    }
    if (current.points.length < 2) {
      setKeyboardStatus("Move the board cursor with an arrow key before finishing");
      return;
    }

    if (isKeyboardFogGestureKind(current.kind)) {
      const mode = current.kind === "fog-reveal" ? "reveal" : "hide";
      setKeyboardGesture(null);
      const label = `${mode === "reveal" ? "Reveal" : "Hide"} fog with keyboard`;
      void mutationAction.runAction(label, () => runAnnouncedSceneCanvasMutation(
        () => props.onFogStroke(mode, current.points),
        setKeyboardStatus,
        { pending: `${label}...`, success: `${mode === "reveal" ? "Reveal" : "Hide"} fog stroke finished`, failure: `${label} failed` }
      ));
      return;
    }
    if (isTransientMeasurementTool(current.kind)) {
      const measurement = draftAnnotation({ pointerId: -1, kind: current.kind, points: current.points }, props.templateShape);
      setKeyboardGesture({ ...current, complete: true });
      setKeyboardStatus(`${annotationLabel(measurement, props.scene)} measurement complete; Enter starts another, Escape closes it`);
      return;
    }

    const kind = current.kind;
    const radius = kind === "template" ? Math.round(distanceBetween(current.points[0]!, current.points[1]!)) : undefined;
    setKeyboardGesture(null);
    const label = `Create ${titleCaseLabel(kind)} with keyboard`;
    void mutationAction.runAction(label, () => runAnnouncedSceneCanvasMutation(
      () => props.onAnnotationCreate(kind, current.points, radius),
      setKeyboardStatus,
      { pending: `${label}...`, success: `${annotationToolLabel(kind)} finished`, failure: `${label} failed` }
    ));
  }

  return (
    <div
      ref={viewportRef}
      className={`scene-viewport ${mapPanning ? "panning" : ""}`}
      role="region"
      aria-label={`${props.scene.name} battle map viewport`}
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        props.onZoomBy(event.deltaY > 0 ? -battleMapZoomStep : battleMapZoomStep);
      }}
    >
      <RetryableActionNotice
        operation={mutationAction.operation}
        onRetry={mutationAction.retryAction ? () => void mutationAction.retryAction?.() : undefined}
        onDismiss={mutationAction.clearAction}
        className="scene-action-failure"
      />
      <p id={keyboardInstructionsId} className="sr-only">
        Focus a movable token and use arrow keys to move it by one grid square, or hold Shift for one-pixel movement. For measurement, drawing, fog, and calibration tools, focus the board, use arrow keys to position the cursor, Enter or Space to start and finish, and Escape to cancel.
      </p>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{keyboardStatus}</span>
      <div
        ref={boardRef}
        data-agent-board-root="true"
        data-scene-id={props.scene.id}
        className={`scene-board ${!calibrationActive && (props.fogBrushMode || props.annotationTool) ? "brush-mode" : ""} ${calibrationActive ? "grid-calibration-mode" : ""} ${tokenDrag && !tokenDrag.settling ? "token-drag-active" : ""} ${tokenResize ? "token-resize-active" : ""} ${selectionBox ? "token-selecting" : ""} ${dropActive ? "drop-active" : ""} ${mapPanning ? "map-panning" : ""}`}
        style={boardStyle}
        role="group"
        aria-label={`${props.scene.name} interactive battle map`}
        aria-describedby={keyboardInstructionsId}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape"
        tabIndex={0}
        onKeyDown={handleBoardKeyDown}
        onPointerDownCapture={takeOverBoardWithPointer}
      onDragEnter={(event) => {
        if (calibrationActive || !props.canDropToken || props.fogBrushMode || props.annotationTool || !hasTokenDropData(event.dataTransfer)) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (calibrationActive || !props.canDropToken || props.fogBrushMode || props.annotationTool || !hasTokenDropData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (isClientPointInsideBoard(event.clientX, event.clientY)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        setDropActive(false);
        if (calibrationActive || !props.canDropToken || props.fogBrushMode || props.annotationTool) return;
        const payload = readTokenDropData(event.dataTransfer);
        const point = boardPoint(event.clientX, event.clientY);
        if (!payload || !point) return;
        event.preventDefault();
        void mutationAction.runAction(`Place ${payload.name ?? "token"}`, () => props.onTokenDrop(payload, point));
      }}
      onPointerDown={(event) => {
        const point = boardPoint(event.clientX, event.clientY);
        if (!point) return;
        if (calibrationActive) {
          if (event.button === 0) {
            event.preventDefault();
            props.onCalibrationPoint?.(point);
          }
          return;
        }
        if (!props.fogBrushMode && !props.annotationTool && (event.altKey || event.button === 1)) {
          startMapPan(event);
          return;
        }
        if (props.annotationTool) {
          event.currentTarget.setPointerCapture(event.pointerId);
          tokenDragRef.current = null;
          setTokenDrag(null);
          if (props.annotationTool === "ping") {
            showLocalPing(point);
            void mutationAction.runAction("Place ping", () => props.onAnnotationCreate("ping", [point]));
            return;
          }
          const next = { pointerId: event.pointerId, kind: props.annotationTool, points: [point] };
          annotationDraftRef.current = next;
          setAnnotationDraft(next);
          return;
        }
        if (!props.fogBrushMode) {
          startSelectionBox(event, point);
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        tokenDragRef.current = null;
        setTokenDrag(null);
        const next = { pointerId: event.pointerId, mode: props.fogBrushMode, points: [point] };
        fogStrokeRef.current = next;
        setFogStroke(next);
      }}
      onPointerMove={(event) => {
        if (moveTokenResize(event.clientX, event.clientY, event.pointerId)) return;
        if (moveSelectionBox(event.clientX, event.clientY, event.pointerId)) return;
        if (moveMapPan(event.clientX, event.clientY, event.pointerId)) return;
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          appendAnnotationDraftPoint(event.clientX, event.clientY, event.pointerId);
          return;
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          appendFogStrokePoint(event.clientX, event.clientY, event.pointerId);
          return;
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          moveAnnotationDraft(event.clientX, event.clientY, event.pointerId);
          return;
        }
        moveTokenDrag(event.clientX, event.clientY, event.pointerId);
      }}
      onPointerUp={(event) => {
        if (tokenResizeRef.current?.pointerId === event.pointerId) {
          finishTokenResize(event.pointerId);
          return;
        }
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          finishAnnotationDraft(event.pointerId, event.clientX, event.clientY);
          return;
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          finishFogStroke(event.pointerId, event.clientX, event.clientY);
          return;
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          finishAnnotationMove(event.pointerId);
          return;
        }
        if (finishSelectionBox(event.pointerId)) return;
        if (finishMapPan(event.pointerId)) return;
        finishTokenDrag(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          annotationDraftRef.current = null;
          setAnnotationDraft(null);
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          fogStrokeRef.current = null;
          setFogStroke(null);
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          annotationMoveDraftRef.current = null;
          setAnnotationMoveDraft(null);
        }
        cancelSelectionBox(event.pointerId);
        cancelMapPan(event.pointerId);
        cancelTokenDrag(event.pointerId);
        cancelTokenResize(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        cancelSelectionBox(event.pointerId);
        cancelMapPan(event.pointerId);
        cancelTokenResize(event.pointerId);
      }}
    >
      {props.visionPreviewLabel && <div className="player-vision-preview-badge" role="status">Player vision: {props.visionPreviewLabel}</div>}
      {props.backgroundAsset && <img className="scene-map" src={assetBlobUrl(props.backgroundAsset)} alt="" draggable={false} />}
      {props.calibrationPoints && props.calibrationPoints.length > 0 && (
        <svg className="grid-calibration-overlay" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} preserveAspectRatio="none" aria-hidden="true">
          {props.calibrationPoints.length === 2 && <line x1={props.calibrationPoints[0]!.x} y1={props.calibrationPoints[0]!.y} x2={props.calibrationPoints[1]!.x} y2={props.calibrationPoints[1]!.y} />}
          {props.calibrationPoints.map((point, index) => <g key={`${index}:${point.x}:${point.y}`}><circle cx={point.x} cy={point.y} r={Math.max(5, props.scene.gridSize * 0.12)} /><text x={point.x} y={point.y} dy="0.35em">{index + 1}</text></g>)}
        </svg>
      )}
      {showGridOverlay && (
        <div
          className="grid-lines"
          style={{
            backgroundSize: `${(props.scene.gridSize / props.scene.width) * 100}% ${(props.scene.gridSize / props.scene.height) * 100}%`
          }}
        />
      )}
      {props.backgroundAsset && props.activeTokenLayer === "map" && !calibrationActive && !props.fogBrushMode && !props.annotationTool && (
        <button
          className={`scene-map-hitbox ${props.selectedAssetId === props.backgroundAsset.id ? "selected" : ""}`}
          type="button"
          aria-label={`Select map background ${props.backgroundAsset.name}`}
          aria-pressed={props.selectedAssetId === props.backgroundAsset.id}
          title="Select map background"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onSelectBackgroundAsset(props.backgroundAsset!.id);
          }}
        />
      )}
      {props.scene.lights.map((light) => (
        <div
          className={`light-source ${light.kind ?? "light"}`}
          key={light.id}
          style={{
            left: `${(light.x / props.scene.width) * 100}%`,
            top: `${(light.y / props.scene.height) * 100}%`,
            width: `${(light.radius / props.scene.width) * 200}%`,
            background: `radial-gradient(circle, ${light.color} 0%, ${light.color} 22%, transparent 72%)`,
            opacity: light.intensity ?? 0.18,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />
      ))}
      {lightPolygons.length > 0 && (
        <svg className="lighting-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          {lightPolygons.map((polygon) => (
            <polygon key={polygon.id} className={lightPolygonClassName(polygon)} points={polygonPoints(polygon)} style={{ fill: polygon.color ?? "#facc15", opacity: polygon.opacity ?? 0.22 }} />
          ))}
        </svg>
      )}
      {darknessPolygons.length > 0 && (
        <svg className="darkness-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <defs>
            <mask id={mundaneDarknessMaskId} maskUnits="userSpaceOnUse">
              <rect width={props.scene.width} height={props.scene.height} fill="black" />
              {nonmagicalDarknessPolygons.map((polygon) => <polygon key={`${polygon.id}-mundane-darkness`} points={polygonPoints(polygon)} fill="white" />)}
              {nonmagicalDarknessBypassPolygons.map((polygon) => <polygon key={`${polygon.id}-mundane-bypass`} points={polygonPoints(polygon)} fill="black" />)}
            </mask>
            <mask id={magicalDarknessMaskId} maskUnits="userSpaceOnUse">
              <rect width={props.scene.width} height={props.scene.height} fill="black" />
              {magicalDarknessPolygons.map((polygon) => <polygon key={`${polygon.id}-magical-darkness`} points={polygonPoints(polygon)} fill="white" />)}
              {magicalDarknessBypassPolygons.map((polygon) => <polygon key={`${polygon.id}-magical-bypass`} points={polygonPoints(polygon)} fill="black" />)}
            </mask>
          </defs>
          {nonmagicalDarknessPolygons.length > 0 && <rect className="darkness-fill mundane" width={props.scene.width} height={props.scene.height} mask={`url(#${mundaneDarknessMaskId})`} />}
          {magicalDarknessPolygons.length > 0 && <rect className="darkness-fill magical" width={props.scene.width} height={props.scene.height} mask={`url(#${magicalDarknessMaskId})`} />}
        </svg>
      )}
      {(props.scene.difficultTerrain?.length ?? 0) > 0 && (
        <svg className="difficult-terrain-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-label="Authored difficult terrain">
          {(props.scene.difficultTerrain ?? []).map((region) => (
            <polygon key={region.id} points={region.points.map((point) => `${point.x},${point.y}`).join(" ")} style={{ fill: region.color ?? "#d97706" }}>
              <title>{region.label}</title>
            </polygon>
          ))}
        </svg>
      )}
      {props.scene.walls.map((wall) => (
        <svg className={`wall-layer ${wall.kind ?? "wall"} ${wall.open ? "open" : "closed"}`} key={wall.id} viewBox={`0 0 ${props.scene.width} ${props.scene.height}`}>
          <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
        </svg>
      ))}
      {(renderedAnnotations.length > 0 || localPings.length > 0) && (
        <svg className="annotation-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-label="Scene annotations">
          {renderedAnnotations.map((annotation) => (
            <SceneAnnotationShape key={annotation.id} annotation={annotation} scene={props.scene} />
          ))}
          {localPings.map((ping) => (
            <SceneAnnotationShape
              key={`local-ping-${ping.id}`}
              annotation={{
                id: `local-ping-${ping.id}`,
                sceneId: props.scene.id,
                kind: "ping",
                createdByUserId: props.boardCurrentUserId,
                points: [{ x: ping.x, y: ping.y }],
                color: annotationColor("ping"),
                createdAt: "",
                updatedAt: ""
              }}
              scene={props.scene}
            />
          ))}
        </svg>
      )}
      {props.canUpdateAnnotations && !calibrationActive && !props.fogBrushMode && !props.annotationTool && renderedAnnotations.length > 0 && (
        <div className="annotation-handles" aria-label="Annotation drag handles">
          {renderedAnnotations.flatMap((annotation) =>
            annotationEditHandles(annotation).map((handle) => (
              <button
                key={`${annotation.id}-${handle.id}`}
                className={`annotation-drag-handle ${handle.mode === "point" ? "annotation-point-handle" : "annotation-move-handle"} ${props.selectedOverlay?.type === "annotation" && props.selectedOverlay.id === annotation.id ? "selected" : ""}`}
                type="button"
                style={{ left: `${(handle.point.x / props.scene.width) * 100}%`, top: `${(handle.point.y / props.scene.height) * 100}%` }}
                aria-label={`${handle.label} ${annotationToolLabel(annotation.kind)} annotation in ${annotationGroupKey(annotation)}`}
                title={`${handle.label} ${annotationToolLabel(annotation.kind)} annotation - click to select, Delete to remove`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  tokenDragRef.current = null;
                  setTokenDrag(null);
                  startAnnotationMove(annotation, event.clientX, event.clientY, event.pointerId, handle.mode, handle.pointIndex);
                }}
                onPointerMove={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  moveAnnotationDraft(event.clientX, event.clientY, event.pointerId);
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  finishAnnotationMove(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  annotationMoveDraftRef.current = null;
                  setAnnotationMoveDraft(null);
                }}
              />
            ))
          )}
        </div>
      )}
      {props.canUpdateAnnotations && !calibrationActive && !props.fogBrushMode && !props.annotationTool && (props.scene.walls.length > 0 || props.scene.lights.length > 0) && (
        <div className="annotation-handles structure-handles" aria-label="Wall and light handles">
          {props.scene.walls.map((wall) => (
            <button
              key={`wall-${wall.id}`}
              className={`structure-handle ${wall.kind === "terrain" ? "terrain-handle" : wall.kind === "door" ? "door-handle" : wall.kind === "window" ? "window-handle" : "wall-handle"} ${wall.open ? "open" : "closed"} ${props.selectedOverlay?.type === "wall" && props.selectedOverlay.id === wall.id ? "selected" : ""}`}
              type="button"
              style={{ left: `${((wall.x1 + wall.x2) / 2 / props.scene.width) * 100}%`, top: `${((wall.y1 + wall.y2) / 2 / props.scene.height) * 100}%` }}
              aria-label={`Select ${wall.kind === "terrain" ? "terrain wall" : wall.kind ?? "wall"}`}
              title={`${wall.kind === "terrain" ? "Terrain wall" : titleCaseWallKind(wall.kind)}${wall.kind === "door" || wall.kind === "window" ? ` (${wall.open ? "open" : "closed"}) - double-click to ${wall.open ? "close" : "open"}` : ""} - click to select, Delete to remove`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.onClearSelection();
                props.onSelectOverlay({ type: "wall", id: wall.id });
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (wall.kind === "door" || wall.kind === "window") void props.onTogglePortal(wall);
              }}
            />
          ))}
          {props.scene.lights.map((light) => (
            <button
              key={`light-${light.id}`}
              className={`structure-handle light-handle ${props.selectedOverlay?.type === "light" && props.selectedOverlay.id === light.id ? "selected" : ""}`}
              type="button"
              style={{ left: `${(light.x / props.scene.width) * 100}%`, top: `${(light.y / props.scene.height) * 100}%` }}
              aria-label="Select light"
              title="Light - click to select, Delete to remove"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.onClearSelection();
                props.onSelectOverlay({ type: "light", id: light.id });
              }}
            />
          ))}
        </div>
      )}
      {vision?.fogActive && (
        <svg className="vision-mask-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width={props.scene.width} height={props.scene.height} fill="white" />
              {revealedPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="black" />
              ))}
              {hiddenPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="white" />
              ))}
            </mask>
          </defs>
          <rect className="vision-dim" width={props.scene.width} height={props.scene.height} mask={`url(#${maskId})`} />
          {revealedPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className={visionPolygonClassName(polygon)} points={polygonPoints(polygon)} />
          ))}
          {hiddenPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className="vision-outline hide" points={polygonPoints(polygon)} />
          ))}
        </svg>
      )}
      {fogStroke && (
        <svg className="fog-brush-preview" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <polyline className={fogStroke.mode} points={fogStroke.points.map((point) => `${point.x},${point.y}`).join(" ")} />
        </svg>
      )}
      {keyboardGesture && isKeyboardFogGestureKind(keyboardGesture.kind) && (
        <svg className="fog-brush-preview keyboard-preview" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <polyline className={keyboardGesture.kind === "fog-reveal" ? "reveal" : "hide"} points={keyboardGesture.points.map((point) => `${point.x},${point.y}`).join(" ")} />
        </svg>
      )}
      {annotationDraft && (
        <svg className="annotation-layer draft" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <SceneAnnotationShape annotation={draftAnnotation(annotationDraft, props.templateShape)} scene={props.scene} />
        </svg>
      )}
      {keyboardGesture && !isKeyboardFogGestureKind(keyboardGesture.kind) && (
        <svg className={`annotation-layer draft keyboard-preview ${keyboardGesture.complete ? "complete" : ""}`} viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <SceneAnnotationShape annotation={draftAnnotation({ pointerId: -1, kind: keyboardGesture.kind, points: keyboardGesture.points }, props.templateShape)} scene={props.scene} />
        </svg>
      )}
      {keyboardCursorVisible && (
        <>
          <span
            className="keyboard-board-cursor"
            style={{ left: `${(keyboardCursor.x / props.scene.width) * 100}%`, top: `${(keyboardCursor.y / props.scene.height) * 100}%` }}
            aria-hidden="true"
          />
          <span className="keyboard-board-hint" aria-hidden="true">
            {activeKeyboardGestureKind() || props.onCalibrationPoint ? "Arrows position - Enter starts/finishes - Esc cancels" : "Arrows move token - Shift moves 1 px"}
          </span>
        </>
      )}
      {selectionBox && (() => {
        const rect = selectionBoxRect(selectionBox);
        return (
          <div
            className="token-selection-box"
            aria-hidden="true"
            style={{
              left: `${(rect.left / props.scene.width) * 100}%`,
              top: `${(rect.top / props.scene.height) * 100}%`,
              width: `${(rect.width / props.scene.width) * 100}%`,
              height: `${(rect.height / props.scene.height) * 100}%`
            }}
          />
        );
      })()}
      {orderedTokens.map((token) => {
        const dragOrigin = tokenDrag?.origins[token.id];
        const dragPosition = tokenDrag && dragOrigin ? { x: dragOrigin.x + tokenDrag.x - tokenDrag.startX, y: dragOrigin.y + tokenDrag.y - tokenDrag.startY } : undefined;
        const frameOverride = tokenFrameOverrides[token.id];
        const resizeFrame = tokenResize?.tokenId === token.id ? tokenResize.frame : undefined;
        const displayFrame = resizeFrame ?? (dragPosition ? { ...tokenFrame(token), ...dragPosition } : frameOverride ?? tokenFrame(token));
        const visualScale = tokenVisualScaleFor(displayFrame, props.scene.gridSize);
        const visualWidth = displayFrame.width * visualScale;
        const visualHeight = displayFrame.height * visualScale;
        const visualX = displayFrame.x + (displayFrame.width - visualWidth) / 2;
        const visualY = displayFrame.y + (displayFrame.height - visualHeight) / 2;
        const tokenImageAsset = token.imageAssetId ? tokenImageAssets.get(token.imageAssetId) : undefined;
        const selected = selectedTokenIdSet.has(token.id);
        const layer = tokenLayer(token);
        const activeLayerToken = activeLayerTokenIds.has(token.id);
        const canResize = props.canResizeToken && selected && activeLayerToken && !calibrationActive && !props.fogBrushMode && !props.annotationTool;
        const linkedActor = token.actorId ? actorById.get(token.actorId) : undefined;
        const tokenHp = linkedActor?.data.hp as { current?: number; max?: number } | undefined;
        const tokenHpRatio = tokenHp && typeof tokenHp.current === "number" && typeof tokenHp.max === "number" && tokenHp.max > 0 ? Math.max(0, Math.min(1, tokenHp.current / tokenHp.max)) : undefined;
        const showTokenVitals = tokenHpRatio !== undefined && (props.canSeeAllVitals || token.ownerUserIds?.includes(props.boardCurrentUserId));
        const tokenHpTone = tokenHpRatio === undefined ? "" : tokenHpRatio <= 0.25 ? "danger" : tokenHpRatio <= 0.5 ? "warning" : "healthy";
        const tokenConditionEntries = [...(token.conditions ?? []).map((condition) => condition.name), ...(linkedActor ? actorConditionLabels(linkedActor) : [])];
        const isCurrentTurn = currentTurnTokenIdSet.has(token.id);
        const isNextTurn = !isCurrentTurn && nextTurnTokenIdSet.has(token.id);
        const turnStateLabel = isCurrentTurn ? "current turn" : isNextTurn ? "up next" : undefined;
        return (
          <button
            key={token.id}
            className={`token layer-${layer} ${activeLayerToken ? "active-layer" : "inactive-layer"} ${token.disposition} ${tokenImageAsset ? "has-image" : ""} ${selected ? "selected" : ""} ${props.selectedTokenId === token.id ? "primary-selected" : ""} ${token.targetedByUserIds?.length ? "targeted" : ""} ${token.auras?.length ? "has-aura" : ""} ${dragPosition ? "dragging" : ""} ${isCurrentTurn ? "turn-current" : ""} ${isNextTurn ? "turn-next" : ""} ${tokenHpRatio !== undefined && tokenHpRatio <= 0 ? "down" : tokenHpRatio !== undefined && tokenHpRatio <= 0.5 ? "bloodied" : ""}`}
            data-turn-state={isCurrentTurn ? "current" : isNextTurn ? "next" : undefined}
            style={{
              left: `${(visualX / props.scene.width) * 100}%`,
              top: `${(visualY / props.scene.height) * 100}%`,
              width: `${(visualWidth / props.scene.width) * 100}%`,
              height: `${(visualHeight / props.scene.height) * 100}%`,
              pointerEvents: calibrationActive ? "none" : undefined
            }}
            aria-label={`${tokenLayerLabel(layer)} token ${token.name}${(token.elevation ?? 0) !== 0 ? ` at ${formatNumber(Math.abs(token.elevation ?? 0))} feet ${(token.elevation ?? 0) > 0 ? "above" : "below"} ground` : ""}${turnStateLabel ? `, ${turnStateLabel}` : ""}`}
            aria-pressed={selected}
            aria-describedby={keyboardInstructionsId}
            aria-keyshortcuts={props.canMoveToken ? "ArrowUp ArrowDown ArrowLeft ArrowRight" : undefined}
            tabIndex={calibrationActive ? -1 : undefined}
            title={!props.canMoveToken ? "Token movement requires token.move" : props.canUpdateTokenLayer ? "Arrow keys move; Shift moves 1 px; right-click moves to next layer" : "Arrow keys move; Shift moves 1 px"}
            onContextMenu={(event) => {
              if (calibrationActive || !props.canUpdateTokenLayer || props.fogBrushMode || props.annotationTool) return;
              event.preventDefault();
              event.stopPropagation();
              tokenDragRef.current = null;
              setTokenDrag(null);
              tokenResizeRef.current = null;
              setTokenResize(null);
              pointerSelectedTokenRef.current = token.id;
              void mutationAction.runAction(`Move ${token.name} to the next layer`, () => props.onTokenLayerCycle(token));
            }}
            onClick={(event) => {
              if (calibrationActive) return;
              if (!activeLayerToken) return;
              if (pointerSelectedTokenRef.current === token.id) {
                pointerSelectedTokenRef.current = null;
                return;
              }
              props.onSelect(token.id, { additive: event.shiftKey || event.ctrlKey || event.metaKey, preserveExisting: selected && props.selectedTokenIds.length > 1 });
            }}
            onKeyDown={(event) => moveTokenFromKeyboard(token, event)}
            onPointerDown={(event) => {
              setKeyboardCursorVisible(false);
              if (!activeLayerToken) return;
              if (calibrationActive || props.fogBrushMode || props.annotationTool) return;
              startTokenDrag(token, event);
            }}
            onPointerMove={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              moveTokenDrag(event.clientX, event.clientY, event.pointerId);
            }}
            onPointerUp={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              finishTokenDrag(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              cancelTokenDrag(event.pointerId);
            }}
            onLostPointerCapture={(event) => {
              if (tokenDragRef.current?.tokenId === token.id && tokenDragRef.current.pointerId === event.pointerId) cancelTokenDrag(event.pointerId);
            }}
          >
            <span className="token-visual" style={{ transform: `rotate(${token.rotation}deg)` }} aria-hidden="true">
              {tokenImageAsset && <img className="token-image" src={assetBlobUrl(tokenImageAsset)} alt="" draggable={false} />}
              <span className="token-label">{token.name.slice(0, 2).toUpperCase()}</span>
            </span>
            <span className="token-nameplate" aria-hidden="true">{token.name}</span>
            {(token.elevation ?? 0) !== 0 && (
              <small className="token-elevation" aria-hidden="true" title={`${formatNumber(Math.abs(token.elevation ?? 0))} feet ${(token.elevation ?? 0) > 0 ? "above" : "below"} ground`}>
                {(token.elevation ?? 0) > 0 ? "+" : "-"}{formatNumber(Math.abs(token.elevation ?? 0))} ft
              </small>
            )}
            {showTokenVitals && (
              <span className={`token-hp ${tokenHpTone}`} aria-hidden="true">
                <span style={{ width: `${Math.round((tokenHpRatio ?? 0) * 100)}%` }} />
              </span>
            )}
            {(isCurrentTurn || isNextTurn) && <span className={`token-turn-ring ${isCurrentTurn ? "current" : "next"}`} aria-hidden="true" />}
            {tokenConditionEntries.length > 0 ? (
              <span className="token-conditions" aria-hidden="true" title={tokenConditionEntries.join(", ")}>
                {tokenConditionEntries.slice(0, 3).map((condition, index) => (
                  <small className="token-condition-chip" key={`${token.id}-condition-${index}`}>{condition}</small>
                ))}
                {tokenConditionEntries.length > 3 && <small className="token-condition-chip overflow">+{tokenConditionEntries.length - 3}</small>}
              </span>
            ) : null}
            {token.auras?.length ? <small className="token-aura-count">{token.auras.length}</small> : null}
            {canResize && (
              <>
                <span className="token-selection-frame" aria-hidden="true" />
                {tokenCornerResizeHandles.map((handle) => (
                  <span
                    className={`token-resize-corner handle-${handle.id}`}
                    key={`${token.id}-${handle.id}`}
                    title={handle.label}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startTokenResize(token, handle.id, event);
                    }}
                  />
                ))}
              </>
            )}
          </button>
        );
      })}
      {orderedTokens.map((token) => {
        const moveDistance = tokenMoveDistances[token.id];
        if (!moveDistance) return null;
        const frame = tokenFrame(token);
        const centerX = frame.x + frame.width / 2;
        const centerY = frame.y + frame.height / 2;
        return (
          <span
            key={`${token.id}-move-${moveDistance.seq}`}
            className="token-move-distance"
            style={{ left: `${(centerX / props.scene.width) * 100}%`, top: `${(centerY / props.scene.height) * 100}%` }}
            aria-hidden="true"
          >
            {props.scene.gridType === "gridless" ? "Manual distance" : formatGridDistance(moveDistance.distancePx, props.scene.gridSize)}
          </span>
        );
      })}
      </div>
    </div>
  );
}


export function SceneAnnotationShape(props: { annotation: SceneAnnotation; scene: Scene }) {
  const annotation = props.annotation;
  const [first, second] = annotation.points;
  if (!first) return null;
  const color = annotation.color || annotationColor(annotation.kind);
  if (annotation.kind === "ping") {
    return (
      <g className="scene-annotation ping" style={{ color }}>
        <circle cx={first.x} cy={first.y} r={18} />
        <line x1={first.x - 28} y1={first.y} x2={first.x - 8} y2={first.y} />
        <line x1={first.x + 8} y1={first.y} x2={first.x + 28} y2={first.y} />
        <line x1={first.x} y1={first.y - 28} x2={first.x} y2={first.y - 8} />
        <line x1={first.x} y1={first.y + 8} x2={first.x} y2={first.y + 28} />
      </g>
    );
  }
  if (annotation.kind === "template") {
    const shape = annotation.templateShape ?? "circle";
    const label = annotationLabel(annotation, props.scene);
    if (shape === "line" && second) {
      const width = Math.max(12, props.scene.gridSize);
      return (
        <g className="scene-annotation template line-template" style={{ color }}>
          <line className="template-area" x1={first.x} y1={first.y} x2={second.x} y2={second.y} strokeWidth={width} />
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
          <circle cx={first.x} cy={first.y} r={6} />
          <circle cx={second.x} cy={second.y} r={6} />
          <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{label}</text>
        </g>
      );
    }
    if (shape === "cone" && second) {
      const conePoints = templateConePoints(annotation);
      return (
        <g className="scene-annotation template cone-template" style={{ color }}>
          {conePoints && <polygon points={conePoints} />}
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
          <circle cx={first.x} cy={first.y} r={6} />
          <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{label}</text>
        </g>
      );
    }
    return (
      <g className="scene-annotation template" style={{ color }}>
        <circle cx={first.x} cy={first.y} r={annotation.radius ?? 0} />
        {second && <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />}
        <text x={first.x + 8} y={first.y - 8}>{label}</text>
      </g>
    );
  }
  if (annotation.kind === "drawing") {
    return (
      <g className="scene-annotation drawing" style={{ color }}>
        <polyline points={annotation.points.map((point) => `${point.x},${point.y}`).join(" ")} />
      </g>
    );
  }
  if (!second) return null;
  return (
    <g className="scene-annotation ruler" style={{ color }}>
      <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
      <circle cx={first.x} cy={first.y} r={6} />
      <circle cx={second.x} cy={second.y} r={6} />
      <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{annotationLabel(annotation, props.scene)}</text>
    </g>
  );
}


export function isCircleTemplateAnnotation(annotation: SceneAnnotation): boolean {
  return annotation.kind === "template" && (annotation.templateShape ?? "circle") === "circle";
}


export function annotationHandlePoint(annotation: SceneAnnotation): VisionPoint | undefined {
  if (annotation.points.length === 0) return undefined;
  // Circle templates are grabbed where users expect: at the circle's center.
  if (isCircleTemplateAnnotation(annotation) && annotation.points[0]) return annotation.points[0];
  const total = annotation.points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  return {
    x: Math.round(total.x / annotation.points.length),
    y: Math.round(total.y / annotation.points.length)
  };
}


export function annotationEditHandles(annotation: SceneAnnotation): Array<{ id: string; label: string; mode: AnnotationMoveDraft["mode"]; point: VisionPoint; pointIndex?: number }> {
  const movePoint = annotationHandlePoint(annotation);
  const handles: Array<{ id: string; label: string; mode: AnnotationMoveDraft["mode"]; point: VisionPoint; pointIndex?: number }> = movePoint ? [{ id: "move", label: "Move", mode: "move", point: movePoint }] : [];
  if ((annotation.kind === "ruler" || annotation.kind === "template") && annotation.points.length >= 2) {
    // For circle templates the start point IS the center, which the move
    // handle already occupies; only the rim handle (radius edit) remains.
    if (!isCircleTemplateAnnotation(annotation)) {
      handles.push({ id: "start", label: "Edit start", mode: "point", pointIndex: 0, point: annotation.points[0]! });
    }
    handles.push({ id: "end", label: "Edit end", mode: "point", pointIndex: 1, point: annotation.points[1]! });
  }
  if (annotation.kind === "drawing" && annotation.points.length >= 2) {
    const endIndex = annotation.points.length - 1;
    const middleIndex = Math.floor(endIndex / 2);
    handles.push(
      { id: "path-start", label: "Edit path start", mode: "point", pointIndex: 0, point: annotation.points[0]! },
      ...(middleIndex > 0 && middleIndex < endIndex ? [{ id: "path-middle", label: "Edit path middle", mode: "point" as const, pointIndex: middleIndex, point: annotation.points[middleIndex]! }] : []),
      { id: "path-end", label: "Edit path end", mode: "point", pointIndex: endIndex, point: annotation.points[endIndex]! }
    );
  }
  return handles;
}


export const feetPerGridSquare = 5;


export function isDistanceMeasurementTool(kind: ActiveAnnotationTool): kind is "ruler" | MeasurementTool {
  return kind === "ruler" || kind === "measure-circle" || kind === "measure-cone";
}


export function isTransientMeasurementTool(kind: ActiveAnnotationTool): kind is "ruler" | MeasurementTool {
  return isDistanceMeasurementTool(kind);
}


export function annotationToolShowsSettings(kind: ActiveAnnotationTool): boolean {
  return kind === "drawing" || kind === "template";
}


export function draftAnnotationKind(kind: ActiveAnnotationTool): SceneAnnotationKind {
  if (kind === "measure-circle" || kind === "measure-cone") return "template";
  return kind;
}


export function draftTemplateShape(kind: ActiveAnnotationTool, templateShape: SceneTemplateShape): SceneTemplateShape | undefined {
  if (kind === "measure-circle") return "circle";
  if (kind === "measure-cone") return "cone";
  return kind === "template" ? templateShape : undefined;
}


export function formatFeet(distancePx: number, scene: Scene): string {
  if (scene.gridType === "gridless") return "Manual distance";
  const feet = (distancePx / Math.max(scene.gridSize, 1)) * feetPerGridSquare;
  const rounded = Math.round(feet * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ft`;
}


export function draftAnnotation(draft: AnnotationDraft, templateShape: SceneTemplateShape): SceneAnnotation {
  const kind = draftAnnotationKind(draft.kind);
  const resolvedTemplateShape = draftTemplateShape(draft.kind, templateShape);
  return {
    id: "draft",
    sceneId: "draft",
    kind,
    createdByUserId: "draft",
    color: annotationColor(kind),
    label: annotationToolLabel(draft.kind),
    templateShape: resolvedTemplateShape,
    points: draft.points,
    radius: kind === "template" && draft.points.length >= 2 ? Math.round(Math.hypot(draft.points[1]!.x - draft.points[0]!.x, draft.points[1]!.y - draft.points[0]!.y)) : undefined,
    createdAt: "",
    updatedAt: ""
  };
}


export function annotationLabel(annotation: SceneAnnotation, scene: Scene): string {
  if (annotation.kind === "ruler" && annotation.points.length >= 2) {
    return formatFeet(distanceBetween(annotation.points[0]!, annotation.points[1]!), scene);
  }
  if (annotation.kind === "template") return `${titleCaseLabel(annotation.templateShape ?? "circle")} ${formatFeet(annotation.radius ?? 0, scene)}`;
  return annotation.label ?? annotationToolLabel(annotation.kind);
}


export function annotationGroupKey(annotation: SceneAnnotation): string {
  return annotation.groupLabel ?? annotation.groupId ?? "Ungrouped";
}


export function annotationToolLabel(kind: ActiveAnnotationTool): string {
  if (kind === "ping") return "Ping";
  if (kind === "ruler") return "Ruler";
  if (kind === "measure-circle") return "Circle measure";
  if (kind === "measure-cone") return "Cone measure";
  if (kind === "template") return "Template";
  return "Drawing";
}


export function defaultAnnotationLayer(kind: SceneAnnotationKind): SceneAnnotationLayer {
  if (kind === "template") return "effects";
  if (kind === "drawing") return "drawings";
  return "measurement";
}


export function annotationColor(kind: SceneAnnotationKind): string {
  if (kind === "ping") return "#facc15";
  if (kind === "ruler") return "#38bdf8";
  if (kind === "template") return "#fb7185";
  return "#a78bfa";
}


export function distanceBetween(left: VisionPoint, right: VisionPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}


export function appendStrokePoint(points: VisionPoint[], point: VisionPoint, gridSize: number): VisionPoint[] {
  const previous = points.at(-1);
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < Math.max(6, gridSize / 8)) return points;
  return [...points, point];
}


export function polygonPoints(polygon: VisionPolygon): string {
  return polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
}


function titleCaseWallKind(kind: Scene["walls"][number]["kind"]): string {
  if (kind === "terrain") return "Terrain wall";
  if (kind === "door") return "Door";
  if (kind === "window") return "Window";
  return "Wall";
}

export function visionPolygonClassName(polygon: VisionPolygon): string {
  return ["vision-outline", polygon.source, polygon.lightLevel].filter(Boolean).join(" ");
}


export function lightPolygonClassName(polygon: VisionPolygon): string {
  return ["light-polygon", polygon.lightLevel].filter(Boolean).join(" ");
}


export function tokenCenter(token: Token): { x: number; y: number } {
  return { x: token.x + token.width / 2, y: token.y + token.height / 2 };
}


export function MapZoomControls(props: { zoom: number; onZoomOut(): void; onZoomIn(): void; onReset(): void }) {
  const atMinimum = props.zoom <= battleMapZoomMin;
  const atMaximum = props.zoom >= battleMapZoomMax;
  return (
    <div className="map-zoom-control" role="group" aria-label="Battle map zoom controls">
      <button className="tool" type="button" title="Zoom battle map out" aria-label="Zoom battle map out" onClick={props.onZoomOut} disabled={atMinimum}>
        <ZoomOut size={17} />
      </button>
      <span className="map-zoom-value" aria-live="polite">
        {formatBattleMapZoom(props.zoom)}
      </span>
      <button className="tool" type="button" title="Reset battle map zoom" aria-label={`Reset battle map zoom from ${formatBattleMapZoom(props.zoom)}`} onClick={props.onReset}>
        <RefreshCw size={16} />
      </button>
      <button className="tool" type="button" title="Zoom battle map in" aria-label="Zoom battle map in" onClick={props.onZoomIn} disabled={atMaximum}>
        <ZoomIn size={17} />
      </button>
    </div>
  );
}


export function MapSelectionStatus(props: { selectedCount: number; onClear(): void }) {
  return (
    <div className="map-selection-status" role="status" aria-label="Selected tokens">
      <span>{formatNumber(props.selectedCount)} selected</span>
      <button className="tool" type="button" title="Clear token selection" aria-label="Clear token selection" onClick={props.onClear}>
        <X size={16} />
      </button>
    </div>
  );
}


export function Toolbar(props: { onSelectTool: ToolAction; onCreateToken: ToolAction; onStartCombat: ToolAction; onRevealFog: ToolAction; onHideFog: ToolAction; onRevealFogPolygon: ToolAction; onToggleFogBrush(mode: FogMode): void; onToggleAnnotationTool(kind: ActiveAnnotationTool): void; onDeleteLatestAnnotation: ToolAction; onUndoScene: ToolAction; onUndoFog: ToolAction; onShowFogHistory: ToolAction; onSampleVisionPoint: ToolAction; onSaveFogPreset: ToolAction; onApplyFogPreset: ToolAction; onDeleteFogPreset: ToolAction; onCyclePlayerVisionPreview: ToolAction; onAddWall: ToolAction; onAddTerrainWall: ToolAction; onAddDoor: ToolAction; onAddWindow: ToolAction; onAddLight: ToolAction; onAddDarkness: ToolAction; onActionError(error: unknown): void; canCreateToken: boolean; canManageCombat: boolean; canRevealFog: boolean; canPreviewPlayerVision: boolean; playerVisionPreviewLabel?: string; activeFogBrushMode: FogMode | null; activeAnnotationTool: AnnotationTool; hasFogPresets: boolean; canUpdateScene: boolean; canAnnotate: boolean }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedToolsRef = useRef<HTMLDetailsElement>(null);
  const closeAdvancedTools = () => setAdvancedOpen(false);
  const runToolAction = (action: ToolAction, options: { closeAdvanced?: boolean } = {}) => {
    if (options.closeAdvanced) closeAdvancedTools();
    void Promise.resolve(action()).catch(props.onActionError);
  };

  useEffect(() => {
    if (!advancedOpen) return;
    const closeOnPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!advancedToolsRef.current?.contains(event.target as Node)) closeAdvancedTools();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAdvancedTools();
    };
    document.addEventListener("mousedown", closeOnPointerDown);
    document.addEventListener("touchstart", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnPointerDown);
      document.removeEventListener("touchstart", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [advancedOpen]);

  return (
    <div className="toolbar">
      <button className={`tool ${props.activeFogBrushMode || props.activeAnnotationTool ? "" : "active"}`} title="Select (V)" aria-label="Select" onClick={() => runToolAction(props.onSelectTool)}>
        <Hand size={17} />
      </button>
      {props.canCreateToken && (
        <button className="tool" title="Token" aria-label="Add token" onClick={() => runToolAction(props.onCreateToken)}>
          <Plus size={17} />
        </button>
      )}
      <span className="tool-divider" aria-hidden="true" />
      <button className={`tool ${props.activeAnnotationTool === "ruler" ? "active" : ""}`} title="Ruler - measure distance (R)" aria-label="Ruler" onClick={() => props.onToggleAnnotationTool("ruler")} disabled={!props.canAnnotate}>
        <Ruler size={17} />
      </button>
      <button className={`tool tool-mobile-secondary ${props.activeAnnotationTool === "measure-circle" ? "active" : ""}`} title="Measure circle (C)" aria-label="Measure circle" onClick={() => props.onToggleAnnotationTool("measure-circle")} disabled={!props.canAnnotate}>
        <Circle size={17} />
      </button>
      <button className={`tool tool-mobile-secondary ${props.activeAnnotationTool === "measure-cone" ? "active" : ""}`} title="Measure cone (O)" aria-label="Measure cone" onClick={() => props.onToggleAnnotationTool("measure-cone")} disabled={!props.canAnnotate}>
        <Triangle size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "ping" ? "active" : ""}`} title="Ping - point everyone here (P)" aria-label="Ping" onClick={() => props.onToggleAnnotationTool("ping")} disabled={!props.canAnnotate}>
        <MapPin size={17} />
      </button>
      {(props.canRevealFog || props.canUpdateScene) && <span className="tool-divider" aria-hidden="true" />}
      {props.canRevealFog && (
        <button className="tool" title="Reveal fog" aria-label="Reveal fog" onClick={() => runToolAction(props.onRevealFog)}>
          <Eye size={17} />
        </button>
      )}
      {props.canUpdateScene && (
        <button className={`tool tool-mobile-secondary ${props.activeAnnotationTool === "drawing" ? "active" : ""}`} title="Drawing (D)" aria-label="Drawing" onClick={() => props.onToggleAnnotationTool("drawing")}>
          <PencilLine size={17} />
        </button>
      )}
      {props.canUpdateScene && (
        <button className={`tool tool-mobile-secondary ${props.activeAnnotationTool === "template" ? "active" : ""}`} title="Area template (A)" aria-label="Area template" onClick={() => props.onToggleAnnotationTool("template")}>
          <Circle size={17} />
        </button>
      )}
      {props.canUpdateScene && (
        <button className="tool tool-mobile-secondary" title="Delete latest annotation" aria-label="Delete latest annotation" onClick={() => runToolAction(props.onDeleteLatestAnnotation)}>
          <X size={17} />
        </button>
      )}
      {props.canUpdateScene && (
        <button className="tool tool-mobile-secondary" title="Undo scene edit" aria-label="Undo scene edit" onClick={() => runToolAction(props.onUndoScene)}>
          <RotateCcw size={17} />
        </button>
      )}
      {(props.canManageCombat || props.canRevealFog || props.canUpdateScene) && <span className="tool-divider" aria-hidden="true" />}
      {(props.canManageCombat || props.canRevealFog || props.canUpdateScene) && (
        <details ref={advancedToolsRef} className="tool-more" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary className="tool" title="Advanced tools" aria-label="Advanced tools">
            <Boxes size={17} />
          </summary>
          <div className="tool-more-panel" aria-label="Advanced table tools">
            <div className="tool-more-mobile-only">
              <div className="tool-more-heading">Measure and mark</div>
              <button className={`ghost-button ${props.activeAnnotationTool === "measure-circle" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleAnnotationTool("measure-circle"), { closeAdvanced: true })} disabled={!props.canAnnotate}>
                <Circle size={15} /> Measure circle
              </button>
              <button className={`ghost-button ${props.activeAnnotationTool === "measure-cone" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleAnnotationTool("measure-cone"), { closeAdvanced: true })} disabled={!props.canAnnotate}>
                <Triangle size={15} /> Measure cone
              </button>
              {props.canUpdateScene && (
                <button className={`ghost-button ${props.activeAnnotationTool === "drawing" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleAnnotationTool("drawing"), { closeAdvanced: true })}>
                  <PencilLine size={15} /> Drawing
                </button>
              )}
              {props.canUpdateScene && (
                <button className={`ghost-button ${props.activeAnnotationTool === "template" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleAnnotationTool("template"), { closeAdvanced: true })}>
                  <Circle size={15} /> Area template
                </button>
              )}
              {props.canUpdateScene && (
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onDeleteLatestAnnotation, { closeAdvanced: true })}>
                  <X size={15} /> Delete annotation
                </button>
              )}
              {props.canUpdateScene && (
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onUndoScene, { closeAdvanced: true })}>
                  <RotateCcw size={15} /> Undo scene edit
                </button>
              )}
            </div>
            {props.canManageCombat && <div className="tool-more-heading">Encounter</div>}
            {props.canManageCombat && (
              <button className="ghost-button" type="button" onClick={() => runToolAction(props.onStartCombat, { closeAdvanced: true })}>
                <Swords size={15} /> Combat
              </button>
            )}
            {props.canRevealFog && (
              <>
                <div className="tool-more-heading">Fog and vision</div>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onHideFog, { closeAdvanced: true })}>
                  <Eraser size={15} /> Hide fog
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onRevealFogPolygon, { closeAdvanced: true })}>
                  <Pentagon size={15} /> Polygon fog
                </button>
                <button className={`ghost-button ${props.activeFogBrushMode === "reveal" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleFogBrush("reveal"), { closeAdvanced: true })}>
                  <Paintbrush size={15} /> Reveal brush
                </button>
                <button className={`ghost-button ${props.activeFogBrushMode === "hide" ? "active" : ""}`} type="button" onClick={() => runToolAction(() => props.onToggleFogBrush("hide"), { closeAdvanced: true })}>
                  <Eraser size={15} /> Hide brush
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onUndoFog, { closeAdvanced: true })}>
                  <RotateCcw size={15} /> Undo fog
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onShowFogHistory, { closeAdvanced: true })}>
                  <ScrollText size={15} /> Fog history
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onSampleVisionPoint, { closeAdvanced: true })}>
                  <Crosshair size={15} /> Sample vision
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onSaveFogPreset, { closeAdvanced: true })}>
                  <Download size={15} /> Save preset
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onApplyFogPreset, { closeAdvanced: true })} disabled={!props.hasFogPresets}>
                  <Upload size={15} /> Apply preset
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onDeleteFogPreset, { closeAdvanced: true })} disabled={!props.hasFogPresets}>
                  <UserX size={15} /> Delete preset
                </button>
              </>
            )}
            {props.canPreviewPlayerVision && (
              <>
                {!props.canRevealFog && <div className="tool-more-heading">Fog and vision</div>}
                <button className={`ghost-button ${props.playerVisionPreviewLabel ? "active" : ""}`} type="button" aria-pressed={Boolean(props.playerVisionPreviewLabel)} onClick={() => runToolAction(props.onCyclePlayerVisionPreview, { closeAdvanced: true })}>
                  <Eye size={15} /> {props.playerVisionPreviewLabel ? `Preview: ${props.playerVisionPreviewLabel}` : "Preview player vision"}
                </button>
              </>
            )}
            {props.canUpdateScene && (
              <>
                <div className="tool-more-heading">Scene building</div>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddWall, { closeAdvanced: true })}>
                  <BrickWall size={15} /> Wall
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddTerrainWall, { closeAdvanced: true })}>
                  <BrickWall size={15} /> Terrain
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddDoor, { closeAdvanced: true })}>
                  <LockKeyhole size={15} /> Door
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddWindow, { closeAdvanced: true })}>
                  <Eye size={15} /> Window
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddLight, { closeAdvanced: true })}>
                  <Lightbulb size={15} /> Light
                </button>
                <button className="ghost-button" type="button" onClick={() => runToolAction(props.onAddDarkness, { closeAdvanced: true })}>
                  <Flame size={15} /> Magical darkness
                </button>
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}


export function TabButton(props: { active: boolean; icon: React.ReactNode; label: string; tabId?: string; panelId?: string; onClick(): void }) {
  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tablist = event.currentTarget.closest('[role="tablist"]');
    const tabs = Array.from(tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0 || tabs.length === 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };
  return (
    <button id={props.tabId} className={props.active ? "tab active" : "tab"} type="button" role="tab" aria-controls={props.panelId} aria-selected={props.active} tabIndex={props.active ? 0 : -1} title={props.label} onClick={props.onClick} onKeyDown={moveFocus}>
      {props.icon}
      {props.label}
    </button>
  );
}
