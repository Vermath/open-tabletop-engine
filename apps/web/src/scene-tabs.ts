export function sceneTabWrapClass(canSelectScene: boolean, selected: boolean): string {
  return [
    "scene-tab-wrap",
    canSelectScene ? "selectable" : "",
    selected ? "selected" : ""
  ].filter(Boolean).join(" ");
}
