import { describe, expect, it } from "vitest";
import { clampScenePoint, sceneGridOrigin, sceneGridSize, snapScenePointToGrid, snapTokenCenterToGrid } from "./scene-grid.js";
import { translatedAnnotationPoints } from "./annotation-geometry.js";
import { applyProposal, revertProposal } from "./proposals.js";
import { createTimestamped, makeArchive, normalizeEngineState, seedState } from "./state.js";
import type { Proposal, Scene } from "./types.js";

const scene = { width: 202.5, height: 164.75, gridType: "square" as const, gridSize: 37.5, gridOrigin: { x: 12.25, y: -8.5 } };

describe("scene grid coordinates", () => {
  it("preserves fractional cells and positive or negative grid origins", () => {
    expect(sceneGridSize(scene)).toBe(37.5);
    expect(snapScenePointToGrid(scene, { x: 51.75, y: 70 })).toEqual({ x: 49.75, y: 66.5 });
    expect(snapScenePointToGrid({ ...scene, gridOrigin: { x: -12.25, y: 8.5 } }, { x: 51.75, y: 70 })).toEqual({ x: 62.75, y: 83.5 });
    expect(sceneGridOrigin({})).toEqual({ x: 0, y: 0 });
    expect(snapScenePointToGrid({ ...scene, gridOrigin: undefined }, { x: 51.75, y: 70 })).toEqual({ x: 37.5, y: 75 });
  });

  it("defines half-cell ties toward the positive axis and clamps partial edge cells idempotently", () => {
    expect(snapScenePointToGrid(scene, { x: 31, y: 10.25 })).toEqual({ x: 49.75, y: 29 });
    const edge = snapScenePointToGrid(scene, { x: 999, y: -999 });
    expect(edge).toEqual({ x: 202.5, y: 0 });
    expect(snapScenePointToGrid(scene, edge)).toEqual(edge);
    expect(snapScenePointToGrid({ ...scene, gridOrigin: { x: -100000, y: 100000 } }, { x: 10, y: 10 })).toEqual({ x: 12.5, y: 25 });
  });

  it("keeps gridless points and free translations continuous", () => {
    const gridless = { ...scene, gridType: "gridless" as const };
    const point = { x: 37.625, y: 71.125 };
    expect(clampScenePoint(scene, point)).toEqual(point);
    expect(snapScenePointToGrid(gridless, point)).toEqual(point);
    expect(translatedAnnotationPoints(gridless, [point, { x: 50.625, y: 91.125 }], { x: 0.125, y: -0.25 }, true)).toEqual([{ x: 37.75, y: 70.875 }, { x: 50.75, y: 90.875 }]);
  });

  it("moves a whole annotation by fractional cells without deforming it at scene edges", () => {
    const points = [{ x: 49.75, y: 66.5 }, { x: 99.875, y: 104.125 }];
    expect(translatedAnnotationPoints(scene, points, { x: 40, y: 30 }, true)).toEqual([{ x: 87.25, y: 104 }, { x: 137.375, y: 141.625 }]);
    const bounded = translatedAnnotationPoints(scene, points, { x: 999, y: 999 }, true);
    expect(bounded).toEqual([{ x: 152.375, y: 127.125 }, { x: 202.5, y: 164.75 }]);
    expect(translatedAnnotationPoints(scene, points, { x: bounded[0]!.x - points[0]!.x, y: bounded[0]!.y - points[0]!.y }, true)).toEqual(bounded);
  });

  it("centers token footprints without integer rounding or crossing scene bounds", () => {
    expect(snapTokenCenterToGrid(scene, { x: 45, y: 70 }, { width: 37.5, height: 37.5 })).toEqual({ x: 31, y: 85.25 });
    expect(snapTokenCenterToGrid(scene, { x: -999, y: 999 }, { width: 75, height: 56.25 })).toEqual({ x: 37.5, y: 136.625 });
    expect(snapTokenCenterToGrid({ ...scene, gridType: "gridless" }, { x: 37.625, y: 71.125 }, { width: 37.5, height: 37.5 })).toEqual({ x: 37.625, y: 71.125 });
  });

  it("uses safe legacy fallbacks for invalid geometry without rounding valid values", () => {
    expect(sceneGridSize({ gridSize: Number.NaN })).toBe(1);
    expect(sceneGridSize({ gridSize: 0 })).toBe(1);
    expect(sceneGridOrigin({ gridOrigin: { x: Number.POSITIVE_INFINITY, y: -0.125 } })).toEqual({ x: 0, y: -0.125 });
  });
});

describe("saved grid calibration", () => {
  it("round-trips new and legacy scenes through detached archives and normalization", () => {
    const state = seedState();
    const base = state.scenes[0]!;
    state.scenes.push({ ...base, id: "scn_fractional", ...scene, active: false });
    const archive = JSON.parse(JSON.stringify(makeArchive(state, base.campaignId)));
    const restored = normalizeEngineState(archive.data);
    const legacy = restored.scenes.find((candidate) => candidate.id === base.id)!;
    const calibrated = restored.scenes.find((candidate) => candidate.id === "scn_fractional")!;
    expect(legacy.gridOrigin).toBeUndefined();
    expect(sceneGridOrigin(legacy)).toEqual({ x: 0, y: 0 });
    expect(calibrated).toMatchObject(scene);
    calibrated.gridOrigin!.x = 99;
    expect(state.scenes[1]!.gridOrigin!.x).toBe(12.25);
  });

  it("preserves calibration in generic scene proposal create/update and revert without changing proposal behavior", () => {
    const state = seedState();
    const original = state.scenes[0]!;
    const copy: Scene = { ...original, id: "scn_grid_proposal", ...scene, active: false };
    const proposal: Proposal = createTimestamped("prop", { campaignId: original.campaignId, createdByUserId: "usr_demo_gm", createdByType: "user" as const, title: "Grid calibration", summary: "Preserve scene geometry", status: "approved" as const, changesJson: [
      { entity: "scene" as const, action: "create" as const, data: copy as unknown as Record<string, unknown> },
      { entity: "scene" as const, action: "update" as const, id: original.id, data: { gridSize: 37.5, gridOrigin: { x: -12.25, y: 8.5 } } },
    ], diffJson: {}, approvalRequired: true, approvedByUserId: "usr_demo_gm" });
    state.proposals.push(proposal);
    const applied = applyProposal(state, proposal, "usr_demo_gm");
    expect(applied.scenes.find((candidate) => candidate.id === copy.id)).toMatchObject(scene);
    expect(applied.scenes.find((candidate) => candidate.id === original.id)).toMatchObject({ gridSize: 37.5, gridOrigin: { x: -12.25, y: 8.5 } });
    const reverted = revertProposal(applied, applied.proposals.find((candidate) => candidate.id === proposal.id)!, "usr_demo_gm");
    expect(reverted.scenes.find((candidate) => candidate.id === copy.id)).toBeUndefined();
    expect(reverted.scenes.find((candidate) => candidate.id === original.id)?.gridOrigin).toBeUndefined();
    expect(reverted.scenes.find((candidate) => candidate.id === original.id)?.gridSize).toBe(original.gridSize);
  });
});
