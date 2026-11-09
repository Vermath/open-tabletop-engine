import type { Scene, VisionPoint } from "./types.js";

type SceneGrid = Pick<Scene, "width" | "height"> & Partial<Pick<Scene, "gridType" | "gridSize" | "gridOrigin">>;

/** Retain fractional cell sizes; invalid legacy values use a one-pixel cell. */
export function sceneGridSize(scene: Partial<Pick<Scene, "gridSize">>): number {
  return typeof scene.gridSize === "number" && Number.isFinite(scene.gridSize) && scene.gridSize >= 1 ? scene.gridSize : 1;
}

/** Origins stay in scene coordinates, including negative offsets. */
export function sceneGridOrigin(scene: Partial<Pick<Scene, "gridOrigin">>): VisionPoint {
  const origin = scene.gridOrigin;
  return {
    x: typeof origin?.x === "number" && Number.isFinite(origin.x) ? origin.x : 0,
    y: typeof origin?.y === "number" && Number.isFinite(origin.y) ? origin.y : 0,
  };
}

/** Clamp without quantizing: gridless drawing and fractional grid lines need subpixel precision. */
export function clampScenePoint(scene: Pick<Scene, "width" | "height">, point: VisionPoint): VisionPoint {
  return { x: clampAxis(point.x, scene.width), y: clampAxis(point.y, scene.height) };
}

/** Snap square-grid intersections, then cap partial cells at the scene boundary. */
export function snapScenePointToGrid(scene: SceneGrid, point: VisionPoint): VisionPoint {
  if (scene.gridType !== "square") return clampScenePoint(scene, point);
  const size = sceneGridSize(scene);
  const origin = sceneGridOrigin(scene);
  const bounded = clampScenePoint(scene, point);
  // Keep partial-cell scene edges stable when a snapped browser point is sent
  // through the API again. Otherwise a capped point may jump to another line.
  const axis = (value: number, extent: number, offset: number) => value === 0 || value === extent ? value : offset + Math.round((value - offset) / size) * size;
  return clampScenePoint(scene, { x: axis(bounded.x, scene.width, origin.x), y: axis(bounded.y, scene.height, origin.y) });
}

/** Center a token in a square cell while keeping its full footprint inside the scene. */
export function snapTokenCenterToGrid(scene: SceneGrid, point: VisionPoint, token: { width: number; height: number }): VisionPoint {
  const size = sceneGridSize(scene);
  const origin = sceneGridOrigin(scene);
  const axis = (value: number, offset: number, tokenSize: number, sceneSize: number) => {
    const footprint = Number.isFinite(tokenSize) && tokenSize > 0 ? Math.min(tokenSize, sceneSize) : Math.min(size, sceneSize);
    const first = footprint / 2;
    const last = Math.max(first, sceneSize - footprint / 2);
    const snapped = scene.gridType === "square" ? offset + Math.round((value - offset - size / 2) / size) * size + size / 2 : value;
    return Math.max(first, Math.min(last, Number.isFinite(snapped) ? snapped : first));
  };
  return { x: axis(point.x, origin.x, token.width, scene.width), y: axis(point.y, origin.y, token.height, scene.height) };
}

function clampAxis(value: number, size: number): number {
  return Math.max(0, Math.min(Number.isFinite(size) ? Math.max(0, size) : 0, Number.isFinite(value) ? value : 0));
}
