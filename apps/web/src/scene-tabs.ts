export function sceneQuickCreateIndex(sceneCount: number): number {
  return Math.max(0, sceneCount - 1);
}

export function showTrailingSceneCreate(sceneCount: number): boolean {
  return sceneCount > 0;
}

export function sceneTabWrapClass(canSelectScene: boolean, selected: boolean, canDeleteScene = false): string {
  return [
    "scene-tab-wrap",
    canSelectScene ? "selectable" : "",
    selected ? "selected" : "",
    canDeleteScene ? "deletable" : ""
  ].filter(Boolean).join(" ");
}
