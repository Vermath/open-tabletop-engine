import type { MapAsset, Scene, Token } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatch, apiPost, apiUploadAsset } from "./api.js";
import { readSceneMapDimensions, sceneHasMapPreparation, sceneMapNativeDimensions, setPreparedSceneMap, uploadPreparedSceneMap } from "./scene-map-preparation.js";

vi.mock("./api.js", () => ({ apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn(), apiUploadAsset: vi.fn(), assetBlobUrl: vi.fn(() => "/map.png") }));
const scene = { id: "scene", campaignId: "campaign", name: "Dock", width: 1200, height: 800, gridType: "square", gridSize: 37.5, gridOrigin: { x: 8.25, y: 12.5 }, walls: [], lights: [], fog: [], annotations: [], metadata: { note: "keep me" }, updatedAt: "2026-09-05T01:00:00Z" } as unknown as Scene;
const asset = { id: "map", campaignId: "campaign", name: "tower.png", image: { width: 700, height: 1400 } } as MapAsset;
function request(overrides: Partial<Parameters<typeof uploadPreparedSceneMap>[0]> = {}) {
  return { scene, tokens: [], file: {} as File, canCreateScene: true, signal: new AbortController().signal, idempotencyKey: "upload:1", review: vi.fn(async () => "keep-canvas" as const), ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiUploadAsset).mockResolvedValue({ asset });
  vi.mocked(apiPatch).mockImplementation(async (_path, payload) => ({ ...scene, ...payload as object }));
  vi.mocked(apiPost).mockImplementation(async (_path, payload) => ({ ...scene, ...payload as object, id: "new-scene" }));
  vi.mocked(apiGet).mockImplementation(async (path) => path.endsWith("/scenes") ? [] : { id: "campaign", updatedAt: "campaign-current" });
});

afterEach(() => vi.unstubAllGlobals());

describe("map preparation", () => {
  it("places an existing library asset at natural size without uploading again", async () => {
    const input = { ...request(), asset };
    const result = await setPreparedSceneMap(input);
    expect(apiUploadAsset).not.toHaveBeenCalled();
    expect(input.review).not.toHaveBeenCalled();
    expect(result.scene).toMatchObject({ backgroundAssetId: asset.id, width: 700, height: 1400, gridOrigin: { x: 0, y: 0 } });
  });

  it("reviews existing asset replacements and leaves authored geometry untouched", async () => {
    const original = { ...scene, backgroundAssetId: "old", walls: [{ id: "wall", x1: 13.5, y1: 25.25 }], lights: [{ id: "light", x: 76.5, y: 84.25 }], fog: [{ id: "fog" }], annotations: [{ id: "annotation" }] } as unknown as Scene;
    const review = vi.fn(async () => "keep-canvas" as const);
    await setPreparedSceneMap({ ...request({ scene: original, review }), asset });
    expect(review).toHaveBeenCalledOnce();
    expect(apiUploadAsset).not.toHaveBeenCalled();
    expect(vi.mocked(apiPatch).mock.calls[0]?.[1]).toEqual({ backgroundAssetId: asset.id, metadata: { note: "keep me", mapCalibrationComplete: false, mapCalibrationCompletedAt: null }, expectedUpdatedAt: scene.updatedAt });
    expect(original.walls[0]).toMatchObject({ x1: 13.5, y1: 25.25 });
    expect(original.gridOrigin).toEqual({ x: 8.25, y: 12.5 });
  });

  it("keeps an existing image in the library when the placement review is dismissed", async () => {
    const result = await setPreparedSceneMap({ ...request({ scene: { ...scene, backgroundAssetId: "old" }, review: vi.fn(async () => "cancel" as const) }), asset });
    expect(result).toEqual({ asset });
    expect(apiUploadAsset).not.toHaveBeenCalled();
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("preserves upload library folder and tags while preparing a background", async () => {
    const input = { ...request(), folder: "Maps/Towers", tags: ["tower", "vertical"] };
    await uploadPreparedSceneMap(input);
    expect(apiUploadAsset).toHaveBeenCalledWith({ campaignId: scene.campaignId, file: input.file, folder: "Maps/Towers", tags: ["tower", "vertical"] }, expect.anything());
  });

  it("reads natural dimensions for older assets without image metadata", async () => {
    const image = { src: "", naturalWidth: 450, naturalHeight: 900, decode: vi.fn(async () => undefined) };
    vi.stubGlobal("Image", function () { return image; });
    expect(await readSceneMapDimensions({ ...asset, image: undefined })).toEqual({ width: 450, height: 900 });
    expect(image.src).toBe("/map.png");
  });

  it("does not place an image after the workspace request is canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await setPreparedSceneMap({ ...request({ signal: controller.signal }), asset });
    expect(result).toEqual({ asset });
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
  it("uses natural dimensions for the first map on an empty scene", async () => {
    const input = request();
    const result = await uploadPreparedSceneMap(input);
    expect(input.review).not.toHaveBeenCalled();
    expect(result.scene).toMatchObject({ width: 700, height: 1400, gridOrigin: { x: 0, y: 0 }, backgroundAssetId: "map" });
    expect(apiUploadAsset).toHaveBeenCalledWith({ campaignId: "campaign", file: input.file }, expect.anything());
    expect(apiPatch).toHaveBeenCalledWith("/api/v1/scenes/scene", expect.objectContaining({ expectedUpdatedAt: scene.updatedAt, metadata: { note: "keep me", mapCalibrationComplete: false, mapCalibrationCompletedAt: null } }), expect.anything());
  });

  it("reviews prepared scenes and preserves canvas dimensions, origin, and all existing geometry", async () => {
    const token = { sceneId: "scene", x: 83.25, y: 87.5, width: 37.5, height: 37.5 } as Token;
    const input = request({ tokens: [token] });
    await uploadPreparedSceneMap(input);
    expect(input.review).toHaveBeenCalledWith(expect.objectContaining({ dimensions: { width: 700, height: 1400 } }), input.signal);
    const payload = vi.mocked(apiPatch).mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty("width");
    expect(payload).not.toHaveProperty("height");
    expect(payload).not.toHaveProperty("gridOrigin");
    expect(payload).not.toHaveProperty("walls");
    expect(token.x).toBe(83.25);
  });

  it("creates a separate inactive scene at image size only after that choice", async () => {
    const input = request({ scene: { ...scene, backgroundAssetId: "old" }, review: vi.fn(async () => "new-scene" as const) });
    const result = await uploadPreparedSceneMap(input);
    expect(result.scene?.id).toBe("new-scene");
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith("/api/v1/campaigns/campaign/scenes", expect.objectContaining({ width: 700, height: 1400, active: false, backgroundAssetId: "map", expectedUpdatedAt: "campaign-current" }), expect.anything());
    expect(input.scene.backgroundAssetId).toBe("old");
  });

  it("recovers a created scene after a lost response without creating another", async () => {
    const existing = { ...scene, id: "already-created", backgroundAssetId: "map", metadata: { mapPreparationAttemptId: "upload:1" } };
    vi.mocked(apiGet).mockResolvedValue([existing]);
    const result = await uploadPreparedSceneMap(request({ scene: { ...scene, backgroundAssetId: "old" }, review: vi.fn(async () => "new-scene" as const) }));
    expect(result.scene).toEqual(existing);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("leaves the map in the library when dismissed and rejects unavailable create permission", async () => {
    const prepared = { ...scene, backgroundAssetId: "old" };
    expect((await uploadPreparedSceneMap(request({ scene: prepared, review: vi.fn(async () => "cancel" as const) }))).scene).toBeUndefined();
    expect(apiPatch).not.toHaveBeenCalled();
    await expect(uploadPreparedSceneMap(request({ scene: prepared, canCreateScene: false, review: vi.fn(async () => "new-scene" as const) }))).rejects.toThrow("scene.create");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("treats authored geometry as prepared and rejects unusable image dimensions", () => {
    expect(sceneHasMapPreparation({ ...scene, walls: [{ id: "wall" }] as Scene["walls"] }, [])).toBe(true);
    expect(sceneHasMapPreparation({ ...scene, lights: [{ id: "light" }] as Scene["lights"] }, [])).toBe(true);
    expect(sceneHasMapPreparation(scene, [])).toBe(false);
    expect(sceneMapNativeDimensions({ image: { width: 0, height: 200 } })).toBeUndefined();
    expect(sceneMapNativeDimensions({ image: { width: Number.NaN, height: 200 } })).toBeUndefined();
  });
});
