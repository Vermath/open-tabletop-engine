import type { VisionSnapshot } from "@open-tabletop/core";
import { apiGet, type Snapshot } from "./api.js";
import type { HandoutLibraryItem } from "./handout-library-panel.js";
import type { WorldAtlasWorld } from "./world-atlas-panel.js";

export function loadRealtimeWorkspaceChanges(campaignId: string, visionSceneId: string | undefined, loadLore: boolean, includeTokens = false) {
  return Promise.all([
    visionSceneId ? apiGet<VisionSnapshot>(`/api/v1/scenes/${visionSceneId}/vision${includeTokens ? "?includeTokens=true" : ""}`) : undefined,
    loadLore ? Promise.all([
      apiGet<WorldAtlasWorld[]>(`/api/v1/campaigns/${campaignId}/worlds`),
      apiGet<HandoutLibraryItem[]>(`/api/v1/campaigns/${campaignId}/handouts`),
      apiGet<Snapshot["worldRecords"]>(`/api/v1/campaigns/${campaignId}/world-records`),
      apiGet<Snapshot["worldRelations"]>(`/api/v1/campaigns/${campaignId}/world-relations`),
    ]) : undefined,
  ]);
}
