import type { VisionSnapshot } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";
import { sameSnapshotValue } from "./realtime-snapshot-delta.js";

export function applySceneVision(snapshot: Snapshot, response: VisionSnapshot): Snapshot {
  const { visibleTokens, sceneUpdatedAt, ...vision } = response;
  if (!visibleTokens) return { ...snapshot, vision };

  const scene = snapshot.scenes.find(({ id }) => id === vision.sceneId);
  if (!scene || (sceneUpdatedAt && scene.updatedAt > sceneUpdatedAt)) return snapshot;

  const known = new Map(snapshot.tokens.filter((token) => token.sceneId === scene.id).map((token) => [token.id, token]));
  const tokens = snapshot.tokens.filter((token) => token.sceneId !== scene.id);
  for (const token of visibleTokens) {
    const current = known.get(token.id);
    tokens.push(current && current.updatedAt >= token.updatedAt ? current : token);
  }
  if (sameSnapshotValue(snapshot.vision, vision) && snapshot.tokens.length === tokens.length && tokens.every((token, index) => token === snapshot.tokens[index])) return snapshot;
  return { ...snapshot, vision, tokens };
}
