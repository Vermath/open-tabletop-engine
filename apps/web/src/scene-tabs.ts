export function sceneQuickCreateIndex(sceneCount: number): number {
  return Math.max(0, sceneCount - 1);
}

export function showTrailingSceneCreate(sceneCount: number): boolean {
  return sceneCount > 0;
}

export function sceneDeleteConfirmationMatches(sceneName: string | undefined, confirmation: string): boolean {
  return Boolean(sceneName && confirmation === sceneName);
}

export function sceneTabWrapClass(canSelectScene: boolean, selected: boolean, canDeleteScene = false): string {
  return [
    "scene-tab-wrap",
    canSelectScene ? "selectable" : "",
    selected ? "selected" : "",
    canDeleteScene ? "deletable" : ""
  ].filter(Boolean).join(" ");
}

export type SceneSelectionWorkspaceMode = "live" | "prep" | "ai" | "manage";

export interface SceneSelectionDestination {
  workspaceMode: SceneSelectionWorkspaceMode;
  manageCategory?: "scenes";
}

/**
 * Scene navigation should not eject a GM from the scene editor. A user who
 * cannot manage scenes still lands on the live table, where selecting an
 * accessible scene has a visible result.
 */
export function sceneSelectionDestination(
  workspaceMode: SceneSelectionWorkspaceMode,
  canManageScenes: boolean,
): SceneSelectionDestination {
  if (workspaceMode !== "manage") return { workspaceMode };
  return canManageScenes
    ? { workspaceMode: "manage", manageCategory: "scenes" }
    : { workspaceMode: "live" };
}
