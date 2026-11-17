import type { Scene, VisionPolygon } from "@open-tabletop/core";
import { memo, useId } from "react";
import "./board-light-finish.css";
import { boardRenderCounts } from "./board-render-counts.js";

/**
 * The board's static layers as memoised components. Each draws only from its
 * props, so a render of the board that did not change a layer's data skips
 * that layer entirely: no element creation, no reconciliation, no attribute
 * diffing. Every element here is positioned in scene units (an SVG viewBox or
 * percentages), so zooming the board does not change any of them.
 */
type Wall = Scene["walls"][number];
type Light = Scene["lights"][number];

const polygonPointStrings = new WeakMap<VisionPolygon, string>();

/** The SVG `points` attribute for a polygon. Cached per polygon object: vision polygons are large and drawn several times. */
export function polygonPoints(polygon: VisionPolygon): string {
  const cached = polygonPointStrings.get(polygon);
  if (cached !== undefined) return cached;
  const points = polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
  polygonPointStrings.set(polygon, points);
  return points;
}

export function titleCaseWallKind(kind: Wall["kind"]): string {
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

function FeatherInside({ id }: { id: string }) {
  return <filter id={id}><feGaussianBlur stdDeviation="2" /><feComposite in2="SourceGraphic" operator="in" /></filter>;
}

function DoorGlyph({ wall }: { wall: Wall }) {
  const x = (wall.x1 + wall.x2) / 2;
  const y = (wall.y1 + wall.y2) / 2;
  return <g className={wall.open ? "door-glyph open" : "door-glyph closed"} transform={"translate(" + x + " " + y + ")"}>
    <rect x="-11" y="-11" width="22" height="22" rx="4" />
    <path d={wall.open ? "M-6 7V-7H5V7 M-6-7L1-4V9L-6 7" : "M-5 7V-7H5V7Z M2 0h1"} />
  </g>;
}

export const BoardLightingLayer = memo(function BoardLightingLayer(props: { width: number; height: number; polygons: readonly VisionPolygon[] }) {
  const feather = useId();
  boardRenderCounts.lighting += 1;
  if (props.polygons.length === 0) return null;
  return (
    <svg className="lighting-layer" viewBox={`0 0 ${props.width} ${props.height}`} aria-hidden="true">
      <defs><FeatherInside id={feather} /></defs>
      {props.polygons.map((polygon) => (
        <polygon key={polygon.id} className={lightPolygonClassName(polygon)} points={polygonPoints(polygon)} filter={"url(#" + feather + ")"} style={{ fill: polygon.color ?? "#facc15", opacity: polygon.opacity ?? 0.22 }} />
      ))}
    </svg>
  );
});

export const BoardDarknessLayer = memo(function BoardDarknessLayer(props: {
  width: number;
  height: number;
  /** Whether any darkness is present; the layer is absent without it. */
  present: boolean;
  mundane: readonly VisionPolygon[];
  magical: readonly VisionPolygon[];
  mundaneBypass: readonly VisionPolygon[];
  magicalBypass: readonly VisionPolygon[];
  mundaneMaskId: string;
  magicalMaskId: string;
}) {
  const feather = useId();
  boardRenderCounts.darkness += 1;
  if (!props.present) return null;
  return (
    <svg className="darkness-layer" viewBox={`0 0 ${props.width} ${props.height}`} aria-hidden="true">
      <defs>
        <FeatherInside id={feather} />
        <mask id={props.mundaneMaskId} maskUnits="userSpaceOnUse">
          <rect width={props.width} height={props.height} fill="black" />
          {props.mundane.map((polygon) => <polygon key={`${polygon.id}-mundane-darkness`} points={polygonPoints(polygon)} fill="white" filter={"url(#" + feather + ")"} />)}
          {props.mundaneBypass.map((polygon) => <polygon key={`${polygon.id}-mundane-bypass`} points={polygonPoints(polygon)} fill="black" />)}
        </mask>
        <mask id={props.magicalMaskId} maskUnits="userSpaceOnUse">
          <rect width={props.width} height={props.height} fill="black" />
          {props.magical.map((polygon) => <polygon key={`${polygon.id}-magical-darkness`} points={polygonPoints(polygon)} fill="white" filter={"url(#" + feather + ")"} />)}
          {props.magicalBypass.map((polygon) => <polygon key={`${polygon.id}-magical-bypass`} points={polygonPoints(polygon)} fill="black" />)}
        </mask>
      </defs>
      {props.mundane.length > 0 && <rect className="darkness-fill mundane" width={props.width} height={props.height} mask={`url(#${props.mundaneMaskId})`} />}
      {props.magical.length > 0 && <rect className="darkness-fill magical" width={props.width} height={props.height} mask={`url(#${props.magicalMaskId})`} />}
    </svg>
  );
});

export const BoardDifficultTerrainLayer = memo(function BoardDifficultTerrainLayer(props: { width: number; height: number; regions: NonNullable<Scene["difficultTerrain"]> }) {
  boardRenderCounts.difficultTerrain += 1;
  if (props.regions.length === 0) return null;
  return (
    <svg className="difficult-terrain-layer" viewBox={`0 0 ${props.width} ${props.height}`} aria-label="Authored difficult terrain">
      {props.regions.map((region) => (
        <polygon key={region.id} points={region.points.map((point) => `${point.x},${point.y}`).join(" ")} style={{ fill: region.color ?? "#d97706" }}>
          <title>{region.label}</title>
        </polygon>
      ))}
    </svg>
  );
});

export const BoardWallLayer = memo(function BoardWallLayer(props: { width: number; height: number; walls: readonly Wall[] }) {
  boardRenderCounts.walls += 1;
  if (props.walls.length === 0) return null;
  return (
    // One layer for every wall: a map imported with hundreds of walls must not add hundreds of full-size layers.
    <svg className="wall-layer" viewBox={`0 0 ${props.width} ${props.height}`} aria-hidden="true">
      {props.walls.map((wall) => (
        <line className={`${wall.kind ?? "wall"} ${wall.open ? "open" : "closed"}`} key={wall.id} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
      ))}
      {props.walls.filter((wall) => wall.kind === "door").map((wall) => <DoorGlyph key={"door-" + wall.id} wall={wall} />)}
    </svg>
  );
});

export interface BoardStructureHandlers {
  selectWall(wallId: string): void;
  togglePortal(wallId: string): void;
  selectLight(lightId: string): void;
  [name: string]: (...args: never[]) => unknown;
}

/** The editing handles on walls and lights: one button per wall and per light. */
export const BoardStructureHandles = memo(function BoardStructureHandles(props: {
  width: number;
  height: number;
  walls: readonly Wall[];
  lights: readonly Light[];
  selectedWallId: string | undefined;
  selectedLightId: string | undefined;
  handlers: BoardStructureHandlers;
}) {
  boardRenderCounts.structureHandles += 1;
  return (
    <div className="annotation-handles structure-handles" aria-label="Wall and light handles">
      {props.walls.map((wall) => (
        <button
          key={`wall-${wall.id}`}
          className={`structure-handle ${wall.kind === "terrain" ? "terrain-handle" : wall.kind === "door" ? "door-handle" : wall.kind === "window" ? "window-handle" : "wall-handle"} ${wall.open ? "open" : "closed"} ${props.selectedWallId === wall.id ? "selected" : ""}`}
          type="button"
          style={{ left: `${((wall.x1 + wall.x2) / 2 / props.width) * 100}%`, top: `${((wall.y1 + wall.y2) / 2 / props.height) * 100}%` }}
          aria-label={`Select ${wall.kind === "terrain" ? "terrain wall" : wall.kind ?? "wall"}`}
          title={`${wall.kind === "terrain" ? "Terrain wall" : titleCaseWallKind(wall.kind)}${wall.kind === "door" || wall.kind === "window" ? ` (${wall.open ? "open" : "closed"}) - double-click to ${wall.open ? "close" : "open"}` : ""} - click to select, Delete to remove`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            props.handlers.selectWall(wall.id);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (wall.kind === "door" || wall.kind === "window") props.handlers.togglePortal(wall.id);
          }}
        />
      ))}
      {props.lights.map((light) => (
        <button
          key={`light-${light.id}`}
          className={`structure-handle light-handle ${props.selectedLightId === light.id ? "selected" : ""}`}
          type="button"
          style={{ left: `${(light.x / props.width) * 100}%`, top: `${(light.y / props.height) * 100}%` }}
          aria-label="Select light"
          title="Light - click to select, Delete to remove"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            props.handlers.selectLight(light.id);
          }}
        />
      ))}
    </div>
  );
});

export const BoardVisionMaskLayer = memo(function BoardVisionMaskLayer(props: { width: number; height: number; maskId: string; revealed: readonly VisionPolygon[]; hidden: readonly VisionPolygon[] }) {
  boardRenderCounts.visionMask += 1;
  return (
    <svg className="vision-mask-layer" viewBox={`0 0 ${props.width} ${props.height}`} aria-hidden="true">
      <defs>
        <mask id={props.maskId}>
          <rect width={props.width} height={props.height} fill="white" />
          {props.revealed.map((polygon) => (
            <polygon key={polygon.id} points={polygonPoints(polygon)} fill="black" />
          ))}
          {props.hidden.map((polygon) => (
            <polygon key={polygon.id} points={polygonPoints(polygon)} fill="white" />
          ))}
        </mask>
      </defs>
      <rect className="vision-dim" width={props.width} height={props.height} mask={`url(#${props.maskId})`} />
      {props.revealed.map((polygon) => (
        <polygon key={`${polygon.id}-outline`} className={visionPolygonClassName(polygon)} points={polygonPoints(polygon)} />
      ))}
      {props.hidden.map((polygon) => (
        <polygon key={`${polygon.id}-outline`} className="vision-outline hide" points={polygonPoints(polygon)} />
      ))}
    </svg>
  );
});
