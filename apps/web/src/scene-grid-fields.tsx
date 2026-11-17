import type { GridType, Scene } from "@open-tabletop/core";
import { sceneGridCellSummary } from "./scene-size.js";

export function normalizeSceneGridType(value: unknown): GridType {
  return value === "gridless" ? "gridless" : "square";
}

export function normalizeSceneVisibilityMode(value: unknown): NonNullable<Scene["visibilityMode"]> {
  return value === "dynamic" ? "dynamic" : "fog";
}

export function SceneVisibilityField(props: { mode: "create" | "edit"; value: NonNullable<Scene["visibilityMode"]>; onChange(value: NonNullable<Scene["visibilityMode"]>): void }) {
  return <>
    <label className="span-full">
      <span>Player visibility</span>
      <select aria-label={`${props.mode === "edit" ? "Edit scene" : "Scene"} player visibility`} name={props.mode === "edit" ? "sceneEditVisibilityMode" : undefined} value={props.value} onChange={(event) => props.onChange(normalizeSceneVisibilityMode(event.target.value))}>
        <option value="fog">Authored fog</option>
        <option value="dynamic">Dynamic lighting</option>
      </select>
    </label>
    <p className="account-summary span-full" role="note">{props.value === "dynamic" ? "Players need an owned token with vision and a light source or a sense such as darkvision. Walls and closed doors block sight. Hide fog always conceals an area." : "Reveal and hide areas with the fog tools. Without fog, players see the map and ordinary tokens."}</p>
  </>;
}

export function sceneGridSummary(scene: Pick<Scene, "width" | "height" | "gridType" | "gridSize">): string {
  return scene.gridType === "gridless"
    ? `${scene.width} x ${scene.height} / gridless`
    : `${scene.width} x ${scene.height} / grid ${scene.gridSize}`;
}

export function sceneGridFormSummary(gridType: GridType, width: number, height: number, gridSize: number): string {
  return gridType === "gridless" ? `${width} x ${height} px canvas` : sceneGridCellSummary(width, height, gridSize);
}

export function SceneGridFields(props: {
  mode: "create" | "edit" | "setup";
  gridType: GridType;
  gridSize: number;
  overlayVisible?: boolean;
  onGridTypeChange(gridType: GridType): void;
  onGridSizeChange(gridSize: number): void;
  onOverlayVisibleChange?(visible: boolean): void;
}) {
  const edit = props.mode === "edit";
  const labelPrefix = edit ? "Edit scene" : props.mode === "setup" ? "Setup scene" : "Scene";
  return (
    <>
      <label>
        <span>Grid type</span>
        <select
          aria-label={`${labelPrefix} grid type`}
          name={edit ? "sceneEditGridType" : undefined}
          value={props.gridType}
          onChange={(event) => props.onGridTypeChange(normalizeSceneGridType(event.target.value))}
        >
          <option value="square">Square grid</option>
          <option value="gridless">Gridless</option>
        </select>
      </label>
      {props.gridType === "square" ? (
        <label>
          <span>Grid size</span>
          <input
            aria-label={`${labelPrefix} grid size`}
            name={edit ? "sceneEditGridSize" : undefined}
            type="number"
            min={1}
            step="any"
            value={props.gridSize}
            onChange={(event) => props.onGridSizeChange(Number(event.target.value))}
          />
        </label>
      ) : (
        <p className="account-summary span-full" role="note">
          Gridless uses free token placement. Distance, reach, and area placement require a manual ruling.
        </p>
      )}
      {props.gridType === "square" && props.onOverlayVisibleChange && (
        <label className="inline-check span-full">
          <input
            type="checkbox"
            name="sceneEditGridOverlayVisible"
            checked={props.overlayVisible === true}
            onChange={(event) => props.onOverlayVisibleChange?.(event.target.checked)}
          />
          <span>Show VTT grid overlay</span>
        </label>
      )}
    </>
  );
}
