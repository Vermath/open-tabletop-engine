import type { Scene } from "@open-tabletop/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sceneMapIsReady } from "./campaign-setup-steps.js";
import { sceneBackgroundChangePayload, sceneBackgroundChangePlan, sceneMapCalibrationResetMetadata, sceneMapConfigurationChanged, sceneMapConfigurationMetadata, sceneWithBackgroundChange } from "./scene-background-calibration.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

function appFunctionBody(name: string, nextName: string): string {
  return appSource.slice(appSource.indexOf(`  async function ${name}`), appSource.indexOf(`  async function ${nextName}`));
}

const timestamp = "2026-07-17T00:00:00.000Z";

function sceneFixture(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene-1",
    campaignId: "campaign-1",
    name: "Vault",
    width: 1200,
    height: 800,
    gridType: "square",
    gridSize: 70,
    backgroundAssetId: "map-old",
    active: true,
    sortOrder: 0,
    metadata: { mapCalibrationComplete: true, mapCalibrationCompletedAt: timestamp, gridOverlayVisible: true, note: "preserve" },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  } as Scene;
}

describe("scene background calibration", () => {
  it("invalidates stale square-grid calibration whenever the background changes", () => {
    const scene = sceneFixture();
    expect(sceneBackgroundChangePayload(scene, "map-new")).toEqual({
      backgroundAssetId: "map-new",
      expectedUpdatedAt: timestamp,
      metadata: {
        mapCalibrationComplete: false,
        mapCalibrationCompletedAt: null,
        gridOverlayVisible: true,
        note: "preserve",
      },
    });
    expect(sceneWithBackgroundChange(scene, "map-new", "2026-07-17T01:00:00.000Z").metadata).toMatchObject({
      mapCalibrationComplete: false,
      mapCalibrationCompletedAt: null,
      note: "preserve",
    });
    expect(sceneMapIsReady(sceneWithBackgroundChange(scene, "map-new", "2026-07-17T01:00:00.000Z"))).toBe(false);
  });

  it("keeps gridless scenes ready after a background replacement", () => {
    const scene = sceneFixture({ gridType: "gridless" });
    expect(sceneMapCalibrationResetMetadata({ ...scene, backgroundAssetId: "map-new" })).toMatchObject({
      mapCalibrationComplete: true,
      mapCalibrationCompletedAt: null,
    });
  });

  it("does not discard a valid calibration when the selected background did not change", () => {
    const scene = sceneFixture();
    expect(sceneBackgroundChangePayload(scene, "map-old")).toEqual({
      backgroundAssetId: "map-old",
      expectedUpdatedAt: timestamp,
    });
  });

  it("invalidates settings-driven background, grid-type, and square-grid-size changes", () => {
    const scene = sceneFixture();
    const changed = { backgroundAssetId: "map-new", gridType: "square" as const, gridSize: 80, width: 1200, height: 800 };
    expect(sceneMapConfigurationChanged(scene, changed)).toBe(true);
    expect(sceneMapConfigurationMetadata(scene, changed, false)).toMatchObject({
      mapCalibrationComplete: false,
      mapCalibrationCompletedAt: null,
      gridOverlayVisible: false,
      note: "preserve",
    });

    const unchanged = { backgroundAssetId: "map-old", gridType: "square" as const, gridSize: 70, width: 1200, height: 800 };
    expect(sceneMapConfigurationChanged(scene, unchanged)).toBe(false);
    expect(sceneMapConfigurationMetadata(scene, unchanged, true)).toMatchObject({
      mapCalibrationComplete: true,
      mapCalibrationCompletedAt: timestamp,
    });
  });

  it("invalidates calibration when scene dimensions change and preserves it when they do not", () => {
    const scene = sceneFixture();
    const resized = { backgroundAssetId: "map-old", gridType: "square" as const, gridSize: 70, width: 1400, height: 800 };
    expect(sceneMapConfigurationChanged(scene, resized)).toBe(true);
    expect(sceneMapConfigurationChanged(scene, { ...resized, width: 1200, height: 900 })).toBe(true);
    expect(sceneMapConfigurationMetadata(scene, resized, true)).toMatchObject({
      mapCalibrationComplete: false,
      mapCalibrationCompletedAt: null,
      note: "preserve",
    });

    const sameDimensions = { ...resized, width: 1200 };
    expect(sceneMapConfigurationChanged(scene, sameDimensions)).toBe(false);
    expect(sceneMapConfigurationMetadata(scene, sameDimensions, true)).toMatchObject({
      mapCalibrationComplete: true,
      mapCalibrationCompletedAt: timestamp,
    });
  });

  it("finishes a mapped gridless scene without leaving calibration open or prompting for Prep", () => {
    const scene = sceneFixture({ gridType: "gridless" });
    const plan = sceneBackgroundChangePlan(scene, "Vault map", { selected: true, navigateToPrep: false });
    expect(plan).toEqual({
      calibrationOpen: false,
      navigateToPrep: false,
      status: "Vault map is set as the scene background.",
    });
    expect(plan.status).not.toMatch(/prep|calibrat/i);
  });

  it("marks a scene without a background unready regardless of grid type", () => {
    const scene = sceneFixture({ gridType: "gridless", backgroundAssetId: undefined });
    expect(sceneMapCalibrationResetMetadata(scene).mapCalibrationComplete).toBe(false);
  });

  it("wires every App background replacement path through reset and calibration launch", () => {
    const saveSettings = appFunctionBody("saveSceneSettings", "applySceneGridCalibration");
    const uploadMap = appFunctionBody("uploadMap", "uploadSelectedTokenImage");
    const uploadLibrary = appFunctionBody("uploadAssetToLibrary", "retryAssetUpload");
    const setExisting = appFunctionBody("setSceneBackgroundFromAsset", "updateAssetLifecycle");

    expect(saveSettings).toContain("sceneMapConfigurationMetadata(targetScene, mapConfiguration");
    expect(saveSettings).toContain("finishSceneBackgroundChange(scene");
    expect(uploadMap).toContain("resetSceneMapCalibration(uploaded.scene");
    expect(uploadMap).toContain("finishSceneBackgroundChange(result.scene");
    expect(uploadLibrary).toContain("resetSceneMapCalibration(uploaded.scene");
    expect(uploadLibrary).toContain("sceneWithBackgroundChange(demoScene");
    expect(uploadLibrary).toContain("finishSceneBackgroundChange(result.scene");
    expect(setExisting).toContain("sceneBackgroundChangePayload(latest, asset.id)");
    expect(setExisting).toContain("sceneWithBackgroundChange(targetScene, asset.id");
    expect(setExisting).toContain("finishSceneBackgroundChange(updated, asset.name)");
    expect(appSource).toContain("sceneBackgroundChangePlan(scene, assetName");
    expect(appSource).toContain("setGridCalibrationOpen(plan.calibrationOpen)");
    expect(appSource).toContain("const next = !gridCalibrationOpen");
  });
});
