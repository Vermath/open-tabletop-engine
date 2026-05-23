export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SceneSizeLike {
  width: number;
  height: number;
}

export interface ScenePointOptions {
  clamp?: boolean;
}

export function scenePointFromClient(rect: ClientRectLike, scene: SceneSizeLike, clientX: number, clientY: number, options: ScenePointOptions = {}) {
  const x = Math.round(((clientX - rect.left) / Math.max(rect.width, 1)) * scene.width);
  const y = Math.round(((clientY - rect.top) / Math.max(rect.height, 1)) * scene.height);
  if (options.clamp === false) return { x, y };
  return {
    x: Math.max(0, Math.min(scene.width, x)),
    y: Math.max(0, Math.min(scene.height, y))
  };
}
