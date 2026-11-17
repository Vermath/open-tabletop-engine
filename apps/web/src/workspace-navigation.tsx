import type { Campaign, MapAsset, Scene } from "@open-tabletop/core";
import { BookOpen, Boxes, Brain, ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, Globe2, Map as MapIcon, MessageSquare, PencilLine, Plus, ScrollText, Search, Shield, Swords, Timer, Trash2, Upload, Users } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetThumbnailUrl } from "./api.js";
import { isUsableImageAsset, TabButton } from "./scene-canvas.js";
import { sceneQuickCreateIndex, sceneTabWrapClass, showTrailingSceneCreate } from "./scene-tabs.js";
import { ActionMenu } from "./action-menu.js";
import "./inspector-tabs.css";
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

const inspectorIcons = {
  actors: Users, compendium: BookOpen, sessions: Timer, worlds: Globe2, handouts: BookOpen, journal: ScrollText,
  memory: Brain, search: Search, chat: MessageSquare, combat: Swords, content: Upload, plugins: Boxes,
} satisfies Record<InspectorTab, typeof Users>;

export function WorkspaceInspectorTabs({ inspectorTabs, tab, chatUnreadCount, onSelectTab }: WorkspaceInspectorTabsProps) {
  const ordered = (Object.keys(inspectorPanelNames) as InspectorTab[]).filter((item) => inspectorTabs.includes(item));
  const row = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | undefined>(undefined);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [remembered, setRemembered] = useState<InspectorTab>();
  const labels = (item: InspectorTab) => item === "chat" && chatUnreadCount ? "Chat (" + formatNumber(chatUnreadCount) + ")" : inspectorPanelNames[item];
  const choicesKey = ordered.join(":");
  useLayoutEffect(() => {
    if (!row.current || !measurement.current) return;
    const measure = () => {
      setAvailable(row.current?.clientWidth);
      setWidths(Object.fromEntries(Array.from(measurement.current?.querySelectorAll<HTMLElement>("[data-measure]") ?? []).map((element) => [element.dataset.measure!, element.getBoundingClientRect().width])));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row.current);
    observer.observe(measurement.current);
    measure();
    return () => observer.disconnect();
  }, [choicesKey, chatUnreadCount]);

  const visibleIds = new Set(ordered);
  if (available !== undefined && ordered.every((item) => widths[item] !== undefined)) {
    const fitsAll = ordered.reduce((sum, item) => sum + widths[item]! + 4, 16) <= available;
    if (!fitsAll) {
      visibleIds.clear();
      let remaining = available - (widths.more ?? 64) - 24;
      for (const item of new Set([tab, remembered, "actors", "chat", "combat", ...ordered] as const)) {
        if (!item || !ordered.includes(item)) continue;
        const width = widths[item]! + 4;
        if (item === tab || width <= remaining) {
          visibleIds.add(item);
          remaining -= width;
        }
      }
    }
  }
  const overflow = ordered.filter((item) => !visibleIds.has(item));
  const activateAndFocus = (item: InspectorTab) => {
    onSelectTab(item);
    requestAnimationFrame(() => document.getElementById("inspector-tab-" + item)?.focus());
  };
  return (
    <div className="inspector-tab-bar" ref={row}>
      <div className="tabs inspector-tabs" role="tablist" aria-label="Inspector panels" onKeyDownCapture={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const focused = (event.target as HTMLElement).closest("[role='tab']");
        const index = ordered.findIndex((item) => focused?.id === "inspector-tab-" + item);
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === "Home" ? 0 : event.key === "End" ? ordered.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + ordered.length) % ordered.length;
        activateAndFocus(ordered[next]!);
      }}>
        {ordered.filter((item) => visibleIds.has(item)).map((item) => {
          const Icon = inspectorIcons[item];
          return <TabButton key={item} active={tab === item} icon={<Icon size={15} />} label={labels(item)} tabId={"inspector-tab-" + item} panelId={"inspector-panel-" + item} onClick={() => onSelectTab(item)} />;
        })}
      </div>
      {overflow.length > 0 && (
        <ActionMenu label="More inspector panels" trigger={<>More <ChevronDown size={12} /></>}>
          {(close) => overflow.map((item) => {
            const Icon = inspectorIcons[item];
            return <button className="ghost-button small" type="button" role="menuitem" key={item} onClick={() => {
              close();
              setRemembered(item);
              activateAndFocus(item);
            }}><Icon size={15} aria-hidden="true" /> {labels(item)}</button>;
          })}
        </ActionMenu>
      )}
      <div className="inspector-tab-measure" aria-hidden="true" ref={measurement}>
        {ordered.map((item) => {
          const Icon = inspectorIcons[item];
          return <span key={item} data-measure={item}><Icon size={15} /> {labels(item)}</span>;
        })}
        <span data-measure="more">More <ChevronDown size={12} /></span>
      </div>
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
