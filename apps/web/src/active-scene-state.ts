import type { Scene } from "@open-tabletop/core";

function upsertScene(scenes: Scene[], scene: Scene): Scene[] {
  return scenes.some((candidate) => candidate.id === scene.id)
    ? scenes.map((candidate) => candidate.id === scene.id ? scene : candidate)
    : [...scenes, scene];
}

/**
 * Reconciles the active-scene identity from an authoritative scene response or
 * realtime event. A scene activation is exclusive within its campaign, so the
 * previously active scene must be cleared in the same render.
 */
export function applyAuthoritativeScene(scenes: Scene[], scene: Scene): Scene[] {
  const next = upsertScene(scenes, scene);
  if (!scene.active) return next;
  return next.map((candidate) =>
    candidate.campaignId === scene.campaignId && candidate.id !== scene.id && candidate.active
      ? { ...candidate, active: false }
      : candidate
  );
}

/**
 * Applies the activation identity confirmed by a successful session-start
 * request while the complete scene snapshot reconciles in the background.
 */
export function applyActiveSceneIdentity(scenes: Scene[], campaignId: string, sceneId: string): Scene[] {
  const target = scenes.find((scene) => scene.id === sceneId && scene.campaignId === campaignId);
  if (!target) return scenes;
  return applyAuthoritativeScene(scenes, target.active ? target : { ...target, active: true });
}
