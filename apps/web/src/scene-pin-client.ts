import type { Scene, SceneMapPin } from "@open-tabletop/core";
import { apiPatch } from "./api.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

export function saveScenePin(scene: Scene, mapPin: SceneMapPin | { remove: string }): Promise<Scene> {
  const payload = { mapPin, expectedUpdatedAt: scene.updatedAt };
  return apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, payload, {
    idempotencyKey: sharedMutationIdempotencyKey(`scene:pin:${scene.id}`, scene.updatedAt, payload),
  });
}
