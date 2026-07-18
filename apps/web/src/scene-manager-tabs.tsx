import type { MapAsset, Scene } from "@open-tabletop/core";
import { Eye, FileText } from "lucide-react";
import { assetThumbnailUrl } from "./api.js";
import { sceneTabWrapClass } from "./scene-tabs.js";

export interface SceneManagerTabsProps {
  assets: MapAsset[];
  canSelectScenes: boolean;
  scenes: Scene[];
  selectedSceneId: string;
  selectedSceneIds: string[];
  onSelectScene: (sceneId: string) => unknown;
  onToggleSceneSelection: (sceneId: string, selected: boolean) => void;
}

function usableSceneBackground(scene: Scene, assets: MapAsset[]): MapAsset | undefined {
  return assets.find((asset) => asset.id === scene.backgroundAssetId
    && asset.mimeType.startsWith("image/")
    && asset.lifecycle?.status !== "deleted");
}

/** Keeps Manage scene navigation inside the fixed Manage workspace. */
export function SceneManagerTabs(props: SceneManagerTabsProps) {
  return (
    <div className="scene-tabs manage-scene-tabs" aria-label="Manage scenes">
      {props.scenes.map((scene) => {
        const backgroundAsset = usableSceneBackground(scene, props.assets);
        const selected = props.canSelectScenes && props.selectedSceneIds.includes(scene.id);
        return (
          <div className={sceneTabWrapClass(props.canSelectScenes, selected)} key={scene.id}>
            {props.canSelectScenes && (
              <input
                aria-label={`Select scene ${scene.name}`}
                checked={selected}
                className="scene-tab-select"
                type="checkbox"
                onChange={(event) => props.onToggleSceneSelection(scene.id, event.target.checked)}
              />
            )}
            <button className={scene.id === props.selectedSceneId ? "scene-tab active" : "scene-tab"} type="button" onClick={() => void props.onSelectScene(scene.id)} aria-pressed={scene.id === props.selectedSceneId}>
              <span className="scene-tab-thumb">{backgroundAsset ? <img src={assetThumbnailUrl(backgroundAsset)} alt="" /> : scene.active ? <Eye size={14} /> : <FileText size={14} />}</span>
              <span>{scene.name}</span>
              {scene.folder && <small>{scene.folder}</small>}
            </button>
          </div>
        );
      })}
      {props.scenes.length === 0 && <span className="empty-state compact">No scenes match filters.</span>}
    </div>
  );
}
