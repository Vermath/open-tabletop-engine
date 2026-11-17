import type { Campaign, MapAsset, Scene, Token } from "@open-tabletop/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { sceneMapCalibrationResetMetadata } from "./scene-background-calibration.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

export type SceneMapPreparationChoice = "keep-canvas" | "new-scene" | "cancel";
export interface SceneMapPreparationReview {
  scene: Scene;
  asset: MapAsset;
  dimensions?: { width: number; height: number };
  canCreateScene: boolean;
}

export function sceneHasMapPreparation(scene: Scene, tokens: readonly Token[]): boolean {
  return Boolean(scene.backgroundAssetId || tokens.some((token) => token.sceneId === scene.id)
    || scene.walls?.length || scene.lights?.length || scene.annotations?.length || scene.fog?.length
    || scene.difficultTerrain?.length || scene.coverOverrides?.length);
}

export function sceneMapNativeDimensions(asset: Pick<MapAsset, "image">): { width: number; height: number } | undefined {
  const image = asset.image;
  return image && Number.isFinite(image.width) && image.width > 0 && Number.isFinite(image.height) && image.height > 0
    ? { width: image.width, height: image.height } : undefined;
}

export async function readSceneMapDimensions(asset: MapAsset, file?: File): Promise<{ width: number; height: number } | undefined> {
  const dimensions = sceneMapNativeDimensions(asset);
  if (dimensions || typeof Image === "undefined") return dimensions;
  if (file && typeof URL.createObjectURL !== "function") return undefined;
  const url = file ? URL.createObjectURL(file) : assetBlobUrl(asset);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
  } catch {
    return undefined;
  } finally {
    if (file) URL.revokeObjectURL(url);
  }
}

interface SceneMapPreparationInput {
  scene: Scene;
  tokens: readonly Token[];
  canCreateScene: boolean;
  signal: AbortSignal;
  idempotencyKey: string;
  review(request: SceneMapPreparationReview, signal: AbortSignal): Promise<SceneMapPreparationChoice>;
}

export async function reviewSceneMapPreparation(input: SceneMapPreparationInput & { asset: MapAsset; file?: File }) {
  const dimensions = await readSceneMapDimensions(input.asset, input.file);
  const prepared = sceneHasMapPreparation(input.scene, input.tokens);
  const choice = prepared && input.scene.backgroundAssetId !== input.asset.id
    ? await input.review({ scene: input.scene, asset: input.asset, dimensions, canCreateScene: input.canCreateScene }, input.signal)
    : "keep-canvas";
  return { dimensions, prepared, choice: input.signal.aborted ? "cancel" as const : choice };
}

export function sceneMapBackgroundPayload(scene: Scene, asset: MapAsset, preparation: { prepared: boolean; dimensions?: { width: number; height: number } }) {
  return { backgroundAssetId: asset.id, ...(!preparation.prepared && preparation.dimensions ? preparation.dimensions : {}), ...(!preparation.prepared ? { gridOrigin: { x: 0, y: 0 } } : {}), metadata: sceneMapCalibrationResetMetadata({ ...scene, backgroundAssetId: asset.id }), expectedUpdatedAt: scene.updatedAt };
}

export function newPreparedSceneMapPayload(scene: Scene, asset: MapAsset, dimensions: { width: number; height: number }, idempotencyKey: string) {
  return { name: asset.name.replace(/\.[^.]+$/, ""), worldId: scene.worldId, folder: scene.folder, ...dimensions, gridType: scene.gridType, gridSize: scene.gridSize, gridOrigin: { x: 0, y: 0 }, backgroundAssetId: asset.id, active: false, metadata: { mapPreparationAttemptId: idempotencyKey, gridOverlayVisible: true, mapCalibrationComplete: scene.gridType === "gridless", mapCalibrationCompletedAt: null } };
}

export async function createPreparedSceneMap(input: Pick<SceneMapPreparationInput, "scene" | "canCreateScene" | "signal" | "idempotencyKey"> & { asset: MapAsset; dimensions?: { width: number; height: number } }): Promise<Scene> {
  if (!input.canCreateScene || !input.dimensions) throw new Error("Creating a map-sized scene requires scene.create permission and readable image dimensions.");
  const scenes = await apiGet<Scene[]>(`/api/v1/campaigns/${input.scene.campaignId}/scenes`, { signal: input.signal });
  const existing = scenes.find((scene) => scene.backgroundAssetId === input.asset.id && scene.metadata.mapPreparationAttemptId === input.idempotencyKey);
  if (existing) return existing;
  const campaign = await apiGet<Campaign>(`/api/v1/campaigns/${input.scene.campaignId}`, { signal: input.signal });
  const payload = { ...newPreparedSceneMapPayload(input.scene, input.asset, input.dimensions, input.idempotencyKey), expectedUpdatedAt: campaign.updatedAt };
  return apiPost<Scene>(`/api/v1/campaigns/${input.scene.campaignId}/scenes`, payload, { signal: input.signal, idempotencyKey: sharedMutationIdempotencyKey(`scene:map-new:${input.asset.id}`, campaign.updatedAt, payload) });
}

export async function setPreparedSceneMap(input: SceneMapPreparationInput & { asset: MapAsset; file?: File }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const preparation = await reviewSceneMapPreparation(input);
  if (preparation.choice === "cancel") return { asset: input.asset };
  if (preparation.choice === "new-scene") return { asset: input.asset, scene: await createPreparedSceneMap({ ...input, dimensions: preparation.dimensions }) };
  const payload = sceneMapBackgroundPayload(input.scene, input.asset, preparation);
  const scene = await apiPatch<Scene>(`/api/v1/scenes/${input.scene.id}`, payload, { signal: input.signal, idempotencyKey: sharedMutationIdempotencyKey(`scene:map-background:${input.asset.id}`, input.scene.updatedAt, payload) });
  return { asset: input.asset, scene };
}

export async function uploadPreparedSceneMap(input: SceneMapPreparationInput & { file: File; folder?: string; tags?: string[] }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const uploaded = await apiUploadAsset({ campaignId: input.scene.campaignId, file: input.file, ...(input.folder ? { folder: input.folder } : {}), ...(input.tags ? { tags: input.tags } : {}) }, { signal: input.signal, idempotencyKey: input.idempotencyKey });
  return setPreparedSceneMap({ ...input, asset: uploaded.asset });
}

export function SceneMapPreparationDialog({ request, onChoice }: { request: SceneMapPreparationReview; onChoice(choice: SceneMapPreparationChoice): void }) {
  const dialogRef = useModalAccessibility<HTMLDivElement>(() => onChoice("cancel"));
  return <div className="modal-backdrop" role="presentation">
    <div ref={dialogRef} className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="scene-map-preparation-title" tabIndex={-1}>
      <h2 id="scene-map-preparation-title">Place {request.asset.name}</h2>
      <p>{request.scene.name} already has a map or prepared content. Choose where this map belongs.</p>
      <img className="scene-map-preparation-preview" src={assetBlobUrl(request.asset)} alt={`Full map: ${request.asset.name}`} />
      <p>Current canvas: {request.scene.width} × {request.scene.height} px. {request.dimensions ? `Image: ${request.dimensions.width} × ${request.dimensions.height} px.` : "Image dimensions are unavailable."}</p>
      <div className="operator-section">
        <button className="primary-button" type="button" onClick={() => onChoice("keep-canvas")}>Keep canvas and replace map</button>
        <p>Fit the entire image into this canvas with its aspect ratio preserved. Tokens, walls, lights, and other content keep their exact positions. Recalibrate the grid for this map.</p>
      </div>
      {request.canCreateScene && request.dimensions && <div className="operator-section">
        <button className="ghost-button" type="button" onClick={() => onChoice("new-scene")}>Create new scene at image size</button>
        <p>Prepare a separate empty scene at {request.dimensions.width} × {request.dimensions.height} px. The existing scene and the players’ active scene stay unchanged.</p>
      </div>}
      <button className="ghost-button" type="button" onClick={() => onChoice("cancel")}>Keep image in library only</button>
    </div>
  </div>;
}

export function useSceneMapPreparation() {
  const [request, setRequest] = useState<SceneMapPreparationReview>();
  const resolverRef = useRef<((choice: SceneMapPreparationChoice) => void) | undefined>(undefined);
  const settle = useCallback((choice: SceneMapPreparationChoice) => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setRequest(undefined);
    resolve?.(choice);
  }, []);
  const review = useCallback((next: SceneMapPreparationReview, signal: AbortSignal): Promise<SceneMapPreparationChoice> => new Promise((resolve) => {
    if (signal.aborted) { resolve("cancel"); return; }
    resolverRef.current?.("cancel");
    const abort = () => settle("cancel");
    signal.addEventListener("abort", abort, { once: true });
    resolverRef.current = (choice) => { signal.removeEventListener("abort", abort); resolve(choice); };
    setRequest(next);
  }), [settle]);
  useEffect(() => () => resolverRef.current?.("cancel"), []);
  return { review, dialog: request ? <SceneMapPreparationDialog request={request} onChoice={settle} /> : null };
}
