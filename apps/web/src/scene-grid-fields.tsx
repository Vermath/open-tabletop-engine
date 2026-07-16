import type { GridType, Scene } from "@open-tabletop/core";
import { sceneGridCellSummary } from "./scene-size.js";

export function normalizeSceneGridType(value: unknown): GridType {
  return value === "gridless" ? "gridless" : "square";
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
            min={10}
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
