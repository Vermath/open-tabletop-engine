import type { Scene } from "@open-tabletop/core";
import { apiPatch } from "./api.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

export function sceneMapCalibrationResetMetadata(scene: Pick<Scene, "backgroundAssetId" | "gridType" | "metadata">): Scene["metadata"] {
  return {
    ...scene.metadata,
    mapCalibrationComplete: scene.gridType === "gridless" && Boolean(scene.backgroundAssetId),
    mapCalibrationCompletedAt: null,
  };
}

export interface SceneMapConfiguration {
  backgroundAssetId: string | null;
  gridType: Scene["gridType"];
  gridSize: number;
  width: number;
  height: number;
}

export function sceneMapConfigurationChanged(scene: Scene, next: SceneMapConfiguration): boolean {
  return (scene.backgroundAssetId ?? null) !== next.backgroundAssetId
    || scene.gridType !== next.gridType
    || scene.width !== next.width
    || scene.height !== next.height
    || (next.gridType === "square" && scene.gridSize !== next.gridSize);
}

export function sceneMapConfigurationMetadata(scene: Scene, next: SceneMapConfiguration, gridOverlayVisible: boolean): Scene["metadata"] {
  const changed = sceneMapConfigurationChanged(scene, next);
  const nextScene = { ...scene, backgroundAssetId: next.backgroundAssetId ?? undefined, gridType: next.gridType };
  return {
    ...(changed ? sceneMapCalibrationResetMetadata(nextScene) : scene.metadata),
    gridOverlayVisible,
    mapCalibrationComplete: next.gridType === "gridless"
      ? Boolean(next.backgroundAssetId)
      : changed ? false : scene.metadata.mapCalibrationComplete === true,
  };
}

export function sceneBackgroundChangePayload(scene: Scene, backgroundAssetId: string | null) {
  const changed = (scene.backgroundAssetId ?? null) !== backgroundAssetId;
  const nextScene = { ...scene, backgroundAssetId: backgroundAssetId ?? undefined };
  return {
    backgroundAssetId,
    ...(changed ? { metadata: sceneMapCalibrationResetMetadata(nextScene) } : {}),
    expectedUpdatedAt: scene.updatedAt,
  };
}

export function sceneWithBackgroundChange(scene: Scene, backgroundAssetId: string | undefined, updatedAt: string): Scene {
  if (scene.backgroundAssetId === backgroundAssetId) return { ...scene, updatedAt };
  const next = { ...scene, backgroundAssetId, updatedAt };
  return { ...next, metadata: sceneMapCalibrationResetMetadata(next) };
}

export interface SceneBackgroundChangePlan {
  calibrationOpen?: boolean;
  navigateToPrep: boolean;
  status: string;
}

export function sceneBackgroundChangePlan(scene: Scene, assetName: string, options: { selected: boolean; navigateToPrep?: boolean }): SceneBackgroundChangePlan {
  if (!scene.backgroundAssetId) return { calibrationOpen: false, navigateToPrep: false, status: `${scene.name} has no background map.` };
  if (scene.gridType === "gridless") {
    return {
      calibrationOpen: false,
      navigateToPrep: false,
      status: options.selected
        ? `${assetName} is set as the scene background.`
        : `${assetName} is now the background for ${scene.name}. No grid calibration is required.`,
    };
  }
  if (!options.selected) return { navigateToPrep: false, status: `${assetName} is now the background for ${scene.name}. Select that scene to calibrate it.` };
  if (options.navigateToPrep === false) return { navigateToPrep: false, status: `${assetName} is set as the background for ${scene.name}. Open Prep to calibrate the grid.` };
  return { calibrationOpen: true, navigateToPrep: true, status: `${assetName} is set as the background. Click two grid intersections to calibrate.` };
}

export async function resetSceneMapCalibration(scene: Scene, signal?: AbortSignal): Promise<Scene> {
  const payload = { metadata: sceneMapCalibrationResetMetadata(scene), expectedUpdatedAt: scene.updatedAt };
  return apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, payload, {
    signal,
    idempotencyKey: sharedMutationIdempotencyKey(`scene:map-calibration-reset:${scene.id}`, scene.updatedAt, payload),
  });
}
