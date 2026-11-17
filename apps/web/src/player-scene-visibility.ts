import type { VisionSnapshot } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";

export function applySceneVision(snapshot: Snapshot, response: VisionSnapshot): Snapshot {
  const { visibleTokens, visibleTokenAssets, sceneUpdatedAt, ...vision } = response;
  if (!visibleTokens) return { ...snapshot, vision };

  const scene = snapshot.scenes.find(({ id }) => id === vision.sceneId);
  if (!scene || (sceneUpdatedAt && scene.updatedAt > sceneUpdatedAt)) return snapshot;

  const known = new Map(snapshot.tokens.filter((token) => token.sceneId === scene.id).map((token) => [token.id, token]));
  const tokens = snapshot.tokens.filter((token) => token.sceneId !== scene.id);
  for (const token of visibleTokens) {
    const current = known.get(token.id);
    tokens.push(current && current.updatedAt > token.updatedAt ? current : token);
  }
  if (!visibleTokenAssets?.length) return { ...snapshot, vision, tokens };

  const assets = new Map(snapshot.assets.map((asset) => [asset.id, asset]));
  for (const asset of visibleTokenAssets) {
    const current = assets.get(asset.id);
    if (!current || current.updatedAt < asset.updatedAt) assets.set(asset.id, asset);
  }
  return { ...snapshot, vision, tokens, assets: [...assets.values()] };
}
