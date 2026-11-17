import type { Campaign, MapAsset, Scene } from "@open-tabletop/core";
import { BookOpen, Boxes, Brain, ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, Globe2, Map as MapIcon, MessageSquare, PencilLine, Plus, ScrollText, Search, Shield, Swords, Timer, Trash2, Upload, Users } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { assetThumbnailUrl } from "./api.js";
import { isUsableImageAsset, TabButton } from "./scene-canvas.js";
import { sceneQuickCreateIndex, sceneTabWrapClass, showTrailingSceneCreate } from "./scene-tabs.js";
import { formatNumber } from "./sheet-format.js";

export type InspectorTab = "actors" | "compendium" | "sessions" | "worlds" | "handouts" | "journal" | "memory" | "search" | "chat" | "combat" | "content" | "plugins";
export const inspectorPanelNames: Record<InspectorTab, string> = {
  actors: "Actors", compendium: "Compendium", sessions: "Sessions", worlds: "Worlds", handouts: "Handouts", journal: "Journal", memory: "Canon", search: "Search", chat: "Chat", combat: "Combat", content: "Assets", plugins: "Plugins"
};

const shortPhoneWorkspaceQuery = "(max-width: 640px) and (max-height: 680px)";

/** Preserves the current editor while small phones show one workspace surface at a time. */
export function useWorkspacePanelVisibility() {
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [prepScenePreview, setPrepScenePreview] = useState(false);
  const [shortPhone, setShortPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(shortPhoneWorkspaceQuery).matches);

  useEffect(() => {
    const query = window.matchMedia(shortPhoneWorkspaceQuery);
    const update = () => setShortPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const showScene = () => {
    setPrepScenePreview(true);
    if (window.matchMedia(shortPhoneWorkspaceQuery).matches) setInspectorOpen(false);
  };

  return { inspectorOpen, setInspectorOpen, prepScenePreview, setPrepScenePreview, shortPhone, showScene };
}

interface WorkspaceCampaignSwitcherProps {
  campaigns: Campaign[];
  campaignId: string;
  onSelectCampaign: (campaign: Campaign) => void;
}

export function WorkspaceCampaignSwitcher({ campaigns, campaignId, onSelectCampaign }: WorkspaceCampaignSwitcherProps) {
  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const campaignNavigation = (
    <nav className="campaign-list" aria-label="Campaigns">
      {campaigns.map((campaign) => (
        <button
          className={campaign.id === campaignId ? "nav-item active" : "nav-item"}
          key={campaign.id}
          aria-pressed={campaign.id === campaignId}
          onClick={() => onSelectCampaign(campaign)}
        >
          <Shield size={16} />
          <span>{campaign.name}</span>
        </button>
      ))}
    </nav>
  );
  return (
    campaigns.length > 1 ? (
      <details className="campaign-switcher">
        <summary aria-label={`Switch campaign: ${selectedCampaign?.name ?? "Choose campaign"}`}>
          <Shield size={16} aria-hidden="true" />
          <span><small>Campaign</small><strong>{selectedCampaign?.name ?? "Choose campaign"}</strong></span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        {campaignNavigation}
      </details>
    ) : campaignNavigation
  );
}

interface WorkspaceSceneTabsProps {
  visibleScenes: Scene[];
  assets: MapAsset[];
  sceneId: string;
  selectedPrepSceneIds: string[];
  accessibleSceneCount: number;
  canSelectPrepScenes: boolean;
  canQuickCreateScene: boolean;
  canQuickDeleteScenes: boolean;
  onSelectScene: (sceneId: string) => unknown;
  onToggleSceneSelection: (sceneId: string, selected: boolean) => void;
  onCreateScene: (beforeScene?: Scene) => void;
  onDeleteScene: (scene: Scene) => void;
}

export function WorkspaceSceneTabs({
  visibleScenes, assets, sceneId, selectedPrepSceneIds, accessibleSceneCount,
  canSelectPrepScenes, canQuickCreateScene, canQuickDeleteScenes,
  onSelectScene, onToggleSceneSelection, onCreateScene, onDeleteScene
}: WorkspaceSceneTabsProps) {
  const quickCreateSceneIndex = sceneQuickCreateIndex(visibleScenes.length);
  const showTrailingSceneCreateButton = showTrailingSceneCreate(visibleScenes.length);
  return (
    <div className="scene-tabs">
      {visibleScenes.map((scene, index) => {
        const backgroundAsset = assets.find((asset) => asset.id === scene.backgroundAssetId && isUsableImageAsset(asset));
        const sceneSelected = canSelectPrepScenes && selectedPrepSceneIds.includes(scene.id);
        return (
          <Fragment key={scene.id}>
            {canQuickCreateScene && index === quickCreateSceneIndex && (
              <button className="icon-button scene-tab-add" type="button" aria-label={`Add draft scene before ${scene.name}`} title={`Add draft scene before ${scene.name}`} onClick={() => onCreateScene(scene)}>
                <Plus size={16} />
              </button>
            )}
            <div className={sceneTabWrapClass(canSelectPrepScenes, sceneSelected, canQuickDeleteScenes)}>
              {canSelectPrepScenes && (
                <input
                  aria-label={`Select scene ${scene.name}`}
                  checked={sceneSelected}
                  className="scene-tab-select"
                  type="checkbox"
                  onChange={(event) => onToggleSceneSelection(scene.id, event.target.checked)}
                />
              )}
              <button className={scene.id === sceneId ? "scene-tab active" : "scene-tab"} onClick={() => onSelectScene(scene.id)} aria-pressed={scene.id === sceneId}>
                <span className="scene-tab-thumb">{backgroundAsset ? <img src={assetThumbnailUrl(backgroundAsset)} alt="" /> : scene.active ? <Eye size={14} /> : <FileText size={14} />}</span>
                <span>{scene.name}</span>
                {scene.folder && <small>{scene.folder}</small>}
              </button>
              {canQuickDeleteScenes && (
                <button className="icon-button scene-tab-delete" type="button" aria-label={`Review deletion for scene ${scene.name}`} title={`Review deletion for ${scene.name}`} onClick={() => onDeleteScene(scene)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </Fragment>
        );
      })}
      {canQuickCreateScene && showTrailingSceneCreateButton && (
        <button className="icon-button scene-tab-add" type="button" aria-label="Add draft scene after newest scene" title="Add draft scene after newest scene" onClick={() => onCreateScene()}>
          <Plus size={16} />
        </button>
      )}
      {visibleScenes.length === 0 && accessibleSceneCount === 0 && canQuickCreateScene && (
        <button className="icon-button scene-tab-add" type="button" aria-label="Add draft scene" title="Add draft scene" onClick={() => onCreateScene()}>
          <Plus size={16} />
        </button>
      )}
      {visibleScenes.length === 0 && <span className="empty-state compact">No scenes match filters.</span>}
    </div>
  );
}

interface WorkspaceViewControlsProps {
  shortPhone: boolean;
  contentWorkspace: boolean;
  inspectorVisible: boolean;
  prepScenePreview: boolean;
  chatUnreadCount: number;
  onToggleScenePreview: () => void;
  onToggleInspector: () => void;
}

export function WorkspaceViewControls({
  shortPhone, contentWorkspace, inspectorVisible, prepScenePreview, chatUnreadCount,
  onToggleScenePreview, onToggleInspector
}: WorkspaceViewControlsProps) {
  const viewAction = inspectorVisible ? (shortPhone ? "Show scene" : "Hide inspector") : "Show inspector";
  const targetsScene = shortPhone && inspectorVisible;
  return (
    <div className="workspace-view-actions" aria-label="Workspace view">
      {contentWorkspace && inspectorVisible && !shortPhone && (
        <button className={prepScenePreview ? "ghost-button active" : "ghost-button"} type="button" aria-controls="scene-workspace" aria-expanded={prepScenePreview} onClick={onToggleScenePreview}>
          <MapIcon size={15} /> {prepScenePreview ? "Hide scene" : "Show scene"}
        </button>
      )}
      <button className="ghost-button inspector-toggle" type="button" aria-label={viewAction} aria-controls={targetsScene ? "scene-workspace" : "workspace-inspector"} aria-expanded={targetsScene ? false : inspectorVisible} aria-describedby={!inspectorVisible && chatUnreadCount > 0 ? "inspector-chat-unread" : undefined} onClick={onToggleInspector}>
        {targetsScene ? <MapIcon size={15} /> : inspectorVisible ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        {viewAction}
        {!inspectorVisible && chatUnreadCount > 0 && <>
          <span className="inspector-unread-badge" aria-hidden="true">Chat {formatNumber(chatUnreadCount)}</span>
          <span id="inspector-chat-unread" className="sr-only">{formatNumber(chatUnreadCount)} unread chat {chatUnreadCount === 1 ? "message" : "messages"}</span>
        </>}
      </button>
    </div>
  );
}

interface WorkspaceInspectorTabsProps {
  inspectorTabs: InspectorTab[];
  tab: InspectorTab;
  chatUnreadCount: number;
  onSelectTab: (tab: InspectorTab) => void;
}

export function WorkspaceInspectorTabs({ inspectorTabs, tab, chatUnreadCount, onSelectTab }: WorkspaceInspectorTabsProps) {
  return (
    <div className="tabs inspector-tabs" role="tablist" aria-label="Inspector panels">
      {inspectorTabs.includes("actors") && <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" tabId="inspector-tab-actors" panelId="inspector-panel-actors" onClick={() => onSelectTab("actors")} />}
      {inspectorTabs.includes("compendium") && <TabButton active={tab === "compendium"} icon={<BookOpen size={15} />} label="Compendium" tabId="inspector-tab-compendium" panelId="inspector-panel-compendium" onClick={() => onSelectTab("compendium")} />}
      {inspectorTabs.includes("sessions") && <TabButton active={tab === "sessions"} icon={<Timer size={15} />} label="Sessions" tabId="inspector-tab-sessions" panelId="inspector-panel-sessions" onClick={() => onSelectTab("sessions")} />}
      {inspectorTabs.includes("worlds") && <TabButton active={tab === "worlds"} icon={<Globe2 size={15} />} label="Worlds" tabId="inspector-tab-worlds" panelId="inspector-panel-worlds" onClick={() => onSelectTab("worlds")} />}
      {inspectorTabs.includes("handouts") && <TabButton active={tab === "handouts"} icon={<BookOpen size={15} />} label="Handouts" tabId="inspector-tab-handouts" panelId="inspector-panel-handouts" onClick={() => onSelectTab("handouts")} />}
      {inspectorTabs.includes("journal") && <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" tabId="inspector-tab-journal" panelId="inspector-panel-journal" onClick={() => onSelectTab("journal")} />}
      {inspectorTabs.includes("memory") && <TabButton active={tab === "memory"} icon={<Brain size={15} />} label="Canon" tabId="inspector-tab-memory" panelId="inspector-panel-memory" onClick={() => onSelectTab("memory")} />}
      {inspectorTabs.includes("search") && <TabButton active={tab === "search"} icon={<Search size={15} />} label="Search" tabId="inspector-tab-search" panelId="inspector-panel-search" onClick={() => onSelectTab("search")} />}
      {inspectorTabs.includes("chat") && <TabButton active={tab === "chat"} icon={<MessageSquare size={15} />} label={chatUnreadCount > 0 ? `Chat (${formatNumber(chatUnreadCount)})` : "Chat"} tabId="inspector-tab-chat" panelId="inspector-panel-chat" onClick={() => onSelectTab("chat")} />}
      {inspectorTabs.includes("combat") && <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" tabId="inspector-tab-combat" panelId="inspector-panel-combat" onClick={() => onSelectTab("combat")} />}
      {inspectorTabs.includes("content") && <TabButton active={tab === "content"} icon={<Upload size={15} />} label="Assets" tabId="inspector-tab-content" panelId="inspector-panel-content" onClick={() => onSelectTab("content")} />}
      {inspectorTabs.includes("plugins") && <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="Plugins" tabId="inspector-tab-plugins" panelId="inspector-panel-plugins" onClick={() => onSelectTab("plugins")} />}
    </div>
  );
}

interface WorkspaceHeadingProps {
  campaignName?: string;
  workspaceEyebrow: string;
  heading: string;
  realtimeUiState: string;
  sessionPulseStatus: string;
  onlineParticipantLabel: string;
  onlineCount: number;
  sceneActive?: boolean;
}

export function WorkspaceHeading({
  campaignName, workspaceEyebrow, heading, realtimeUiState,
  sessionPulseStatus, onlineParticipantLabel, onlineCount, sceneActive
}: WorkspaceHeadingProps) {
  return (
    <div className="workspace-heading">
      <div className="eyebrow"><span aria-label="Current campaign">{campaignName ?? "No campaign selected"}</span><span aria-hidden="true"> · </span>{workspaceEyebrow}</div>
      <h1>{heading}</h1>
      <div className="session-pulse" data-connection-state={realtimeUiState} role="status" aria-live="polite" aria-atomic="true" aria-label={`Session connection: ${sessionPulseStatus}; ${onlineParticipantLabel}`}>
        <span aria-hidden="true" />
        {sessionPulseStatus} · {formatNumber(onlineCount)} online
      </div>
      {sceneActive !== undefined && (
        <div className={sceneActive ? "scene-visibility-badge live" : "scene-visibility-badge draft"} role="status">
          {sceneActive ? <Eye size={13} aria-hidden="true" /> : <PencilLine size={13} aria-hidden="true" />}
          {sceneActive ? "Live to players" : "Draft preview"}
        </div>
      )}
    </div>
  );
}
