import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiSource = readFileSync(resolve(__dirname, "api.ts"), "utf8").replace(/\r\n/g, "\n");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8").replace(/\r\n/g, "\n");
const sceneCanvasSource = readFileSync(resolve(__dirname, "scene-canvas.tsx"), "utf8").replace(/\r\n/g, "\n");
const toolbarSource = sceneCanvasSource.slice(sceneCanvasSource.indexOf("function Toolbar("), sceneCanvasSource.indexOf("function TabButton("));
const actorPanelSource = appSource.slice(appSource.indexOf("function ActorPanel("), appSource.indexOf("function actorConditionLabels("));
const combatPanelSource = readFileSync(resolve(__dirname, "combat-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const chatRailSource = readFileSync(resolve(__dirname, "chat-rail.tsx"), "utf8").replace(/\r\n/g, "\n");
const aiPanelSource = readFileSync(resolve(__dirname, "ai-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const countOccurrences = (source: string, needle: string) => source.split(needle).length - 1;

describe("desktop layout regressions", () => {
  it("shows the relay host controls only through the Electron preload contract", () => {
    expect(appSource).toContain("const [desktopAvailable] = useState(() => Boolean(window.otteDesktop));");
    expect(appSource).toContain('window.otteDesktop.startInternetShare({ inviteToken })');
    expect(appSource).toContain('window.otteDesktop.stopInternetShare()');
    expect(appSource).toContain('window.otteDesktop.copyInviteLink()');
    expect(appSource).toContain('className="desktop-host-panel" aria-label="Desktop host"');
    expect(stylesSource).toContain(".desktop-host-panel {\n  display: grid;");
    expect(stylesSource).toContain(".desktop-host-url,\n.desktop-host-error {");
  });

  it("keeps the token create action readable in desktop play and prep topbars", () => {
    expect(stylesSource).not.toContain("minmax(74px, 0.6fr) 44px");
    expect(stylesSource).not.toContain(".quick-create-form .primary-button {\n  min-width: 44px;");
    expect(stylesSource).toContain(".primary-button:disabled {\n  border-color: rgba(148, 160, 173, 0.18);\n  background: #111923;\n  color: #8390a0;");
    expect(stylesSource).toContain(".rail-play + .workspace .topbar {\n  grid-template-columns: minmax(220px, 300px) minmax(180px, 1fr);");
    expect(stylesSource).toContain('grid-template-areas:\n    "title scenes"\n    "create create";');
    expect(stylesSource).toContain(".rail-play + .workspace .quick-create-form {\n  grid-area: create;");
    expect(stylesSource).toContain("minmax(96px, max-content)");
    expect(stylesSource).toContain(".quick-create-form .primary-button {\n  min-width: 96px;");
  });

  it("prevents floating tabletop controls from covering the lower desktop board", () => {
    expect(appSource).not.toContain("<details open>");
    expect(appSource).toContain('className="map-play-surface"');
    expect(appSource).toContain('className="map-layer-dock" aria-label="Map controls and layers"');
    expect(stylesSource).toContain('grid-template-areas: "map layers";');
    expect(stylesSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(188px, 220px);");
    expect(stylesSource).toContain(".map-layer-dock .map-layer-stack {\n  grid-row: 3;\n  position: static;");
    expect(stylesSource).toContain("overflow: auto;");
  });

  it("keeps the manage drawer opaque and scene filters visible while scrolling", () => {
    expect(stylesSource).toContain(".rail-admin {\n  position: fixed;");
    expect(stylesSource).toContain("background: #090e14;");
    expect(stylesSource).toContain(".rail-admin:has(> .manage-category-list) {\n  top: 0;\n  right: 0;\n  bottom: 0;\n  left: 264px;");
    expect(stylesSource).toContain("grid-template-columns: 196px minmax(0, 1fr);");
    expect(stylesSource).toContain(".manage-category-content {\n  grid-column: 2;");
    expect(stylesSource).toContain("background: #090f16;");
    expect(stylesSource).toContain(".rail-manage + .workspace .manage-workspace-stage {\n  display: none;");
    expect(stylesSource).toContain(".manage-scene-filter-panel {\n  position: sticky;");
    expect(stylesSource).toContain("grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1fr) auto auto;");
    expect(appSource).toContain('<textarea aria-label="Campaign description"');
    expect(appSource).toContain('<textarea aria-label="Edit campaign description"');
    expect(stylesSource).toContain(".account-box textarea {\n  min-height: 82px;");
  });

  it("keeps the floating AI agent available while switching workspaces", () => {
    expect(appSource).toContain("const selectWorkspaceMode = (mode: WorkspaceMode) => {");
    expect(appSource).toContain("setWorkspaceMode(mode);");
    expect(appSource).not.toContain("const selectWorkspaceMode = (mode: WorkspaceMode) => {\n    setWorkspaceMode(mode);\n    setAiAgentOpen(false);");
    expect(appSource).not.toContain('if (workspaceMode === "manage" && aiAgentOpen) setAiAgentOpen(false);');
    expect(stylesSource).toContain(".rail-manage .ai-agent-toggle {\n  display: inline-flex;");
    expect(appSource).not.toContain('label: "AI Studio"');
    expect(appSource).not.toContain("AI Studio is deprecated.");
    expect(appSource).toContain("const agentPanel = useMovablePanel(initialAiAgentPanelPosition, initialAiAgentPanelSize, { minWidth: 340, minHeight: 420 });");
    expect(appSource).toContain('<aside className="ai-agent-popout movable-panel" aria-label="AI Agent" style={agentPanel.style} {...agentPanel.panelProps}>');
    expect(appSource).toContain('<header className="ai-agent-header floating-panel-header" title="Drag panel" {...agentPanel.dragHandleProps}>');
    expect(appSource).toContain('<Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />');
    expect(appSource).toContain('className="ai-agent-title-block"');
    expect(appSource).toContain('className="ai-agent-status-pill"');
    expect(appSource).toContain('className="ai-agent-body"');
    expect(appSource).toContain('className="ai-agent-utility-bar ai-agent-controls"');
    expect(appSource).toContain("const [aiAgentReferenceAssetId, setAiAgentReferenceAssetId] = useState<string | undefined>(undefined);");
    expect(appSource).toContain("const selectedAiAgentReferenceAsset = aiAgentReferenceAssetId ? snapshot.assets.find((asset) => asset.id === aiAgentReferenceAssetId && isUsableImageAsset(asset)) : undefined;");
    expect(appSource).toContain("const selectedAssetId = attachedReferenceAssetId ?? aiAgentSelectedAssetId;");
    expect(appSource).toContain("selectedAssetId: requestSelectedAssetId,");
    expect(appSource).toContain("async function uploadAiAgentReferenceAsset(file: File, input?: HTMLInputElement)");
    expect(appSource).toContain('referenceAsset={selectedAiAgentReferenceAsset}');
    expect(appSource).toContain('referenceUploadStatus={aiAgentReferenceUploadStatus}');
    expect(appSource).toContain('onUploadReference={uploadAiAgentReferenceAsset}');
    expect(appSource).toContain('onClearReference={clearAiAgentReferenceAsset}');
    expect(appSource).toContain('onDrop={handleReferenceDrop}');
    expect(appSource).toContain('aria-label="Attach image reference"');
    expect(appSource).toContain('aria-label="Clear attached image reference"');
    expect(appSource).toContain('className="ai-agent-composer-attachment"');
    expect(appSource).toContain('className="ai-agent-feed"');
    expect(stylesSource).toContain(".ai-agent-popout.movable-panel {\n  top: var(--floating-panel-y, 20px);");
    expect(stylesSource).toContain(".ai-agent-body {");
    expect(stylesSource).toContain(".ai-agent-utility-bar {");
    expect(stylesSource).toContain(".ai-agent-composer.drag-active {");
    expect(stylesSource).toContain(".ai-agent-composer-attachment {");
    expect(stylesSource).toContain(".ai-agent-attach-button {");
    expect(stylesSource).toContain(".ai-agent-reference-thumb {");
    expect(stylesSource).toContain(".ai-agent-composer-status {");
    expect(stylesSource).toContain(".ai-agent-feed {");
    expect(stylesSource).toContain(".ai-agent-status-pill {");
    expect(stylesSource).toContain("background: #070b10;\n  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(229, 176, 74, 0.08);\n  isolation: isolate;");
    expect(stylesSource).toContain("@media (max-width: 900px) {\n  .ai-agent-popout {\n    right: 12px;\n    bottom: calc(76px + env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain("@media (max-width: 760px) {\n  .ai-agent-popout {\n    right: 8px;\n    bottom: calc(70px + env(safe-area-inset-bottom, 0px));");
  });

  it("defaults AI proposals to manual review while preserving explicit auto-apply and Ctrl+Enter", () => {
    expect(appSource).toContain('type AiAgentApprovalMode = "manual" | "auto";');
    expect(appSource).toContain('function aiAgentApprovalModeStorageKey(campaignId: string, userId: string | null): string');
    expect(appSource).toContain('function initialAiAgentApprovalMode(campaignId: string, userId: string | null): AiAgentApprovalMode');
    expect(appSource).toContain('return localStorage.getItem(aiAgentApprovalModeStorageKey(campaignId, userId)) === "auto" ? "auto" : "manual";');
    expect(appSource).toContain('return "manual";');
    expect(appSource).toContain("const [aiAgentApprovalMode, setAiAgentApprovalModeState] = useState<AiAgentApprovalMode>(() => initialAiAgentApprovalMode(campaignId, currentUserId));");
    expect(appSource).toContain('approvalMode={aiAgentApprovalMode}');
    expect(appSource).toContain('onApprovalModeChange={setAiAgentApprovalMode}');
    expect(appSource).toContain('aria-label="AI Agent approval mode"');
    expect(appSource).toContain("approvalMode: aiAgentApprovalMode,");
    expect(appSource).toContain('event.type === "proposal.applied"');
    expect(appSource).toContain("autoApplyAiAgentProposals(pendingProposalIds, refreshedSnapshot, { campaignId: requestCampaignId, userId: requestUserId })");
    expect(appSource).toContain('if (event.key === "Enter" && (event.ctrlKey || event.metaKey))');
    expect(appSource).toContain('onKeyDown={handleAiAgentPromptKeyDown}');
    expect(appSource).toContain('aiAgentPendingAuthRequestRef.current = { prompt, requestMessages, selectedAssetId: requestSelectedAssetId };');
    expect(appSource).toContain('scheduleAiAgentAuthRetry();');
    expect(appSource).toContain("Review proposed changes");
    expect(appSource).toContain("proposal.changesJson.slice(0, 8)");
    expect(stylesSource).toContain(".ai-agent-controls {");
  });

  it("lets the mobile manage drawer occupy the full viewport instead of exposing inactive rail slivers", () => {
    expect(stylesSource).toContain("@media (max-width: 640px) {\n  .rail-admin {\n    top: 0;\n    right: 0;\n    bottom: 0;\n    left: 0;");
    expect(stylesSource).toContain(".manage-category-list {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).toContain(".manage-category-button {\n    width: 100%;\n    max-width: none;");
    expect(stylesSource).toContain(".manage-category-button small {\n    display: none;");
    expect(stylesSource).toContain(".manage-scene-filter-panel,\n  .manage-scene-filter-panel .button-row {\n    grid-template-columns: 1fr;");
    expect(stylesSource).toContain(".manage-scene-filter-panel input,\n  .manage-scene-filter-panel select,\n  .manage-scene-filter-panel .ghost-button {\n    width: 100%;");
    expect(stylesSource).toContain(".manage-scene-filter-panel .ghost-button:disabled {\n    display: none;");
    expect(appSource).not.toContain("{organization.name} - {organization.role} - {organization.campaignCount} campaigns");
    expect(appSource).toContain("{organization.name}\n                  </option>");
    expect(appSource).toContain('{activeOrganization && <small className="mini-form-meta">{titleCaseLabel(activeOrganization.role)} - {formatNumber(activeOrganization.campaignCount)} campaigns</small>}');
  });

  it("does not show token creation chrome to users who cannot create tokens", () => {
    expect(appSource).toContain('const showQuickCreate = (workspaceMode === "live" || workspaceMode === "prep") && hasPermission("token.create");');
  });

  it("keeps the dice roller visible inside the chat rail instead of leaving dead dice handlers", () => {
    expect(appSource).toContain("diceFormula={diceFormula}");
    expect(appSource).toContain("onRollDice={rollDice}");
    expect(appSource).toContain("canRollDice={hasPermission(\"dice.roll\")}");
    expect(chatRailSource).toContain('className="dice-box chat-dice-box"');
    expect(chatRailSource).toContain('aria-label="Dice formula"');
    expect(chatRailSource).toContain('aria-label="Roll dice"');
    expect(chatRailSource).toContain('aria-label="Saved dice formula"');
    expect(stylesSource).toContain(".chat-rail {\n  display: grid;\n  grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(stylesSource).toContain(".chat-dice-box {\n  grid-area: auto;\n  margin: 10px 10px 0;");
    expect(stylesSource).toContain(".dice-box input[aria-label=\"Dice formula\"] {\n  grid-area: formula;\n  min-height: 32px;");
    expect(stylesSource).toContain(".table-grid:has(.chat-rail) {\n    grid-template-rows: minmax(84px, 24%) minmax(0, 1fr);");
    expect(stylesSource).toContain(".chat-dice-box {\n    grid-template-columns: auto minmax(0, 1fr) 44px;\n    grid-template-areas:\n      \"dice-icon formula roll\"\n      \"visibility saved save\";");
    expect(stylesSource).toContain(".chat-dice-box {\n    grid-template-areas:\n      \"formula formula roll\"\n      \"visibility saved save\";\n    grid-template-columns: minmax(88px, 0.8fr) minmax(0, 1fr) 40px;");
    expect(stylesSource).toContain(".chat-dice-box > svg {\n    display: none;");
  });

  it("keeps lower-permission players out of dead prep, ai, and campaign management modes", () => {
    expect(appSource).toContain('const canUsePrepWorkspace = canManageScenes || hasPermission("world.create") || hasPermission("world.update") || hasPermission("handout.create") || hasPermission("handout.update") || hasPermission("journal.create") || hasPermission("journal.update") || hasPermission("plugin.install") || hasPermission("plugin.configure") || hasPermission("actor.create");');
    expect(appSource).toContain('const canUseAiStudioWorkspace = hasPermission("ai.proposeChanges") || hasPermission("ai.applyChanges") || hasPermission("ai.readGmMemory") || hasPermission("combat.manage");');
    expect(appSource).toContain('if (workspaceMode === "prep" && !canUsePrepWorkspace) setWorkspaceMode("live");');
    expect(appSource).toContain('if (workspaceMode === "ai" && !canUseAiStudioWorkspace) setWorkspaceMode("live");');
    expect(appSource).toContain('visible: canManageCampaignSettings');
    expect(appSource).toContain('visible: canManagePeople');
    expect(appSource).toContain('visible: canManageScenes');
    expect(appSource).toContain('visible: canManageArchives');
    expect(appSource).toContain('{ id: "manage", label: accountOnlyManageMode ? "Account" : "Manage"');
    expect(appSource).toContain('const activeManageCategory = visibleManageCategories.some((category) => category.id === manageCategory) ? manageCategory : (visibleManageCategories[0]?.id ?? "account");');
    expect(appSource).toContain('canDraftEncounter={hasPermission("ai.proposeChanges") && hasPermission("combat.manage") && hasPermission("scene.create")}');
    expect(appSource).toContain('canRecapSession={hasPermission("ai.proposeChanges") && hasPermission("journal.create")}');
    expect(aiPanelSource).toContain('disabled={!props.canRecapSession}');
  });

  it("keeps prep header controls readable instead of turning filters into a tiny scrollbox", () => {
    expect(stylesSource).toContain(".rail-prep + .workspace .topbar {");
    expect(stylesSource).toContain('grid-template-areas:\n    "title filters scenes"\n    "create create create";');
    expect(stylesSource).toContain("@media (max-width: 1040px) and (min-width: 641px) {\n  .rail-prep + .workspace {\n    grid-template-rows: minmax(188px, auto) minmax(0, 1fr) auto;");
    expect(stylesSource).toContain('grid-template-areas:\n      "title filters"\n      "scenes scenes"\n      "create create";');
    expect(stylesSource).toContain(".scene-tab-wrap.selectable {\n  grid-template-columns: 28px minmax(0, auto);\n  border-color: rgba(148, 160, 173, 0.18);");
    expect(stylesSource).toContain(".scene-tab-select {\n  justify-self: center;\n  width: 20px;");
    expect(stylesSource).toContain(".rail-prep + .workspace .table-tool-panel.canvas-asset-dock {\n    top: 76px;\n    right: 12px;\n    left: auto;\n    width: max-content;");
    expect(stylesSource).toContain("box-shadow: none;\n  backdrop-filter: none;\n  pointer-events: auto;");
    expect(stylesSource).toContain("height: auto;\n    min-height: 0;\n    max-height: calc(100% - 24px);");
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-filter-panel {");
    expect(stylesSource).toContain("overflow: visible;");
    expect(stylesSource).toContain(".rail-prep + .workspace .quick-create-form {\n  grid-area: create;");
  });

  it("keeps scene tab actions in Prep and routes deletion through review", () => {
    expect(appSource).toContain("const quickCreateSceneIndex = sceneQuickCreateIndex(visibleScenes.length);");
    expect(appSource).toContain("const showTrailingSceneCreateButton = showTrailingSceneCreate(visibleScenes.length);");
    expect(appSource).toContain('className="icon-button scene-tab-add"');
    expect(appSource).toContain('aria-label="Add draft scene after newest scene"');
    expect(appSource).toContain('className="icon-button scene-tab-delete"');
    expect(appSource).toContain("createScene({ insertBeforeScene: scene, active: false })");
    expect(appSource).toContain('const canQuickCreateScene = workspaceMode === "prep" && hasPermission("scene.create");');
    expect(appSource).toContain('const canQuickDeleteScenes = workspaceMode === "prep" && hasPermission("scene.delete")');
    expect(appSource).toContain("function openSceneDeleteReview(targetScene: Scene)");
    expect(appSource).toContain('setManageCategory("scenes");');
    expect(appSource).toContain("openSceneDeleteReview(scene)");
    expect(appSource).toContain("const [newSceneActive, setNewSceneActive] = useState(false);");
    expect(appSource).toContain("onTokenLayerCycle={cycleTokenLayer}");
    expect(stylesSource).toContain(".scene-tab-wrap.selectable.deletable {\n  grid-template-columns: 28px minmax(0, auto) 30px;");
    expect(stylesSource).toContain(".scene-tab-add {\n  width: 38px;");
    expect(stylesSource).toContain(".scene-tab-delete {\n  justify-self: center;");
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-tab-wrap.selectable.deletable {\n    grid-template-columns: minmax(0, auto) 30px;");
    expect(sceneCanvasSource).toContain("export function nextTokenLayer(layer: TokenLayer): TokenLayer");
    expect(sceneCanvasSource).toContain("if (event.button !== 0) return;");
    expect(sceneCanvasSource).toContain("onContextMenu={(event) => {");
    expect(sceneCanvasSource).toContain("props.onTokenLayerCycle(token).catch(console.error);");
    expect(stylesSource).toContain(".token.inactive-layer {\n  opacity: 0.58;\n  cursor: context-menu;\n  pointer-events: auto;");
  });

  it("lets the desktop map reclaim collapsed chrome and offers a reversible focus mode", () => {
    expect(appSource).toContain("const [tableFocusMode, setTableFocusMode] = useState(false);");
    expect(appSource).toContain('data-table-focus={tableFocusMode ? "true" : undefined}');
    expect(appSource).toContain('aria-label={tableFocusMode ? "Exit map focus mode" : "Enter map focus mode"}');
    expect(appSource).toContain('case "f":');
    expect(stylesSource).toContain('.table-area:has(.map-layer-dock[data-collapsed="true"]) {\n    grid-template-areas: "map";');
    expect(stylesSource).toContain('.table-area:has(.map-layer-dock[data-collapsed="true"]) .table-tool-panel[aria-label="Canvas asset picker"] {\n    right: auto;\n    left: 88px;');
    expect(stylesSource).toContain('.shell[data-table-focus="true"] {\n    grid-template-columns: 0 minmax(0, 1fr);');
    expect(stylesSource).toContain('.shell[data-table-focus="true"] .inspector {\n    display: none;');
  });

  it("keeps all Prep destinations visible and makes inspector tabs keyboard-operable", () => {
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs {\n    display: grid;\n    grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(sceneCanvasSource).toContain('role="tab" aria-controls={props.panelId} aria-selected={props.active} tabIndex={props.active ? 0 : -1}');
    expect(appSource).toContain('role="tabpanel" id={`inspector-panel-${tab}`} aria-labelledby={`inspector-tab-${tab}`}');
    expect(sceneCanvasSource).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
    expect(appSource).toContain('? ["actors", "handouts", "journal", "search", "chat", "combat"]');
    expect(appSource).toContain('label="Search"');
    expect(appSource).toContain('label="Canon"');
    expect(appSource).toContain('label="Assets"');
  });

  it("keeps the phone toolbar to one primary row while retaining secondary tools", () => {
    expect(sceneCanvasSource).toContain("tool tool-mobile-secondary");
    expect(sceneCanvasSource).toContain('className="tool-more-mobile-only"');
    expect(stylesSource).toContain(".toolbar:has(.tool-more) > .tool-mobile-secondary {\n    display: none;");
    expect(stylesSource).toContain(".tool-more-mobile-only {\n    display: contents;");
    expect(stylesSource).toContain(".workspace-live .inspector-tabs {\n    display: grid;\n    grid-template-columns: repeat(6, minmax(0, 1fr));");
    expect(stylesSource).toContain(".workspace-live .inspector-tabs .tab {\n    min-width: 0;\n    min-height: 42px;");
  });

  it("keeps tablet prep/content panels from clipping controls and status labels", () => {
    expect(stylesSource).toContain(".admin-form-grid .ghost-button,\n.admin-form-grid .primary-button {\n  min-height: 48px;\n  overflow: visible;\n  line-height: 1.15;\n  text-overflow: clip;\n  white-space: normal;");
    expect(stylesSource).toContain(".asset-library .admin-form-grid {\n  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));");
    expect(stylesSource).toContain(".content-import-form .admin-form-grid {\n  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));");
    expect(stylesSource).toContain(".asset-summary {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(102px, 1fr));");
    expect(stylesSource).toContain(".button-row .ghost-button,\n.button-row .primary-button {\n  overflow: visible;\n  text-overflow: clip;\n  white-space: normal;");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs,\n  .workspace-prep .inspector > .tabs {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs .tab,\n  .workspace-prep .inspector > .tabs .tab {\n    justify-content: center;\n    min-width: 0;\n    width: 100%;");
    expect(stylesSource).toContain("@media (max-width: 640px) {\n  .rail-admin");
    expect(stylesSource).toContain(".inspector-tabs,\n  .inspector > .tabs {\n    padding: 8px;\n  }\n\n  .workspace-prep .inspector-tabs,\n  .workspace-prep .inspector > .tabs {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 6px;\n    overflow: visible;");
  });

  it("keeps dense scene management controls targetable and hides dead bulk actions", () => {
    expect(stylesSource).toContain(".scene-size-presets .ghost-button {\n  min-height: 36px;");
    expect(stylesSource).not.toContain(".scene-size-presets .ghost-button {\n  min-height: 30px;");
    expect(appSource).toContain('className="admin-form-grid scene-field-grid"');
    expect(appSource).toContain("<span>Width</span>");
    expect(appSource).toContain("<span>Height</span>");
    expect(appSource).toContain("<span>Grid</span>");
    expect(stylesSource).toContain(".scene-field-grid {\n  grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).toContain(".scene-field-grid .span-full {\n  grid-column: 1 / -1;");
    expect(stylesSource).toContain("@media (max-width: 520px) {\n  .scene-field-grid {\n    grid-template-columns: 1fr;");
    expect(stylesSource).toContain(".manage-scene-filter-panel .button-row .ghost-button:disabled,\n.rail-prep + .workspace .scene-filter-panel .button-row .ghost-button:disabled {\n  display: none;");
    expect(stylesSource).toContain(".manage-card-grid > .manage-scene-filter-panel .button-row {\n  display: flex;");
    expect(stylesSource).toContain(".manage-card-grid > .manage-scene-filter-panel .button-row .ghost-button {\n  flex: 0 0 auto;\n  min-width: max-content;");
  });

  it("prioritizes AI asset generation controls when an asset intent is selected", () => {
    expect(aiPanelSource).toContain('const activeIntentClass = activeIntent === "tokenBatch" ? "token-batch" : activeIntent === "selectedToken" ? "selected-token" : activeIntent;');
    expect(aiPanelSource).toContain("ai-create-workflow ai-create-intent-${activeIntentClass}");
    expect(aiPanelSource).toContain('className="ai-asset-task ai-map-asset-task"');
    expect(aiPanelSource).toContain('className="ai-asset-task ai-token-asset-task"');
    expect(stylesSource).toContain(".ai-field select {\n  width: 100%;\n  min-height: 36px;");
    expect(stylesSource).toContain(".admin-form-grid input,\n.admin-form-grid select {\n  width: 100%;\n  min-height: 36px;\n  padding: 0 9px;\n  border: 1px solid #463b2a;\n  border-radius: 6px;");
    expect(stylesSource).toContain("@media (min-width: 1181px) {\n  .ai-create-workflow.ai-create-intent-map > .ai-assets-panel,");
    expect(stylesSource).toContain(".ai-create-workflow.ai-create-intent-map > .ai-assets-panel,\n.ai-create-workflow.ai-create-intent-token-batch > .ai-assets-panel,\n.ai-create-workflow.ai-create-intent-selected-token > .ai-assets-panel {\n  order: -1;");
    expect(stylesSource).toContain(".ai-create-workflow.ai-create-intent-token-batch .ai-token-asset-task,\n.ai-create-workflow.ai-create-intent-selected-token .ai-token-asset-task {\n  order: -1;");
  });

  it("keeps mobile token creation and map controls inside the viewport", () => {
    expect(stylesSource).not.toContain("grid-template-columns: minmax(84px, 1.4fr) minmax(70px, 1fr) minmax(62px, 0.8fr) minmax(58px, 0.7fr) 44px;");
    expect(appSource).toContain('aria-label={mode.label} aria-pressed={workspaceMode === mode.id} title={mode.label}');
    expect(stylesSource).toContain(".rail-play + .workspace .quick-create-form,\n  .rail-prep + .workspace .quick-create-form {\n    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(56px, 0.7fr) minmax(90px, 1fr);");
    expect(stylesSource).toContain(".rail-play + .workspace .quick-create-form input,\n  .rail-play + .workspace .quick-create-form select,\n  .rail-play + .workspace .quick-create-form .primary-button,");
    expect(stylesSource).toContain("min-height: 40px;\n    padding-inline: 8px;\n    font-size: 14px;");
    expect(stylesSource).toContain(".rail-play + .workspace .quick-create-form input[aria-label=\"Token name\"],");
    expect(stylesSource).toContain(".rail-prep + .workspace .quick-create-form input[aria-label=\"Token name\"] {\n    grid-column: 1 / -1;");
    expect(stylesSource).toContain(".rail-play + .workspace .quick-create-form .primary-button,\n  .rail-prep + .workspace .quick-create-form .primary-button {\n    grid-column: auto;");
    expect(stylesSource).toContain("@media (max-width: 360px) {\n  .rail-play + .workspace .quick-create-form,\n  .rail-prep + .workspace .quick-create-form {\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).toContain(".rail-play .workspace-mode-switcher .ghost-button {\n    flex: 0 0 44px;\n    width: 44px;\n    padding: 0;\n    gap: 0;\n    font-size: 0;");
    expect(stylesSource).toContain(".manage-category-button em {\n    display: none;");
    expect(stylesSource).not.toContain("calc(160px * var(--scene-aspect, 1.5) * var(--map-zoom, 1))");
    expect(stylesSource).not.toContain("calc(480px * var(--scene-aspect, 1.5) * var(--map-zoom, 1))");
    expect(sceneCanvasSource).toContain("function battleMapBoardDimensions(");
    expect(sceneCanvasSource).toContain('width: `${boardDimensions.width}px`,');
    expect(sceneCanvasSource).toContain('height: `${boardDimensions.height}px`,');
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-filter-panel .button-row {\n    display: none;");
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-filter-panel .inline-check {\n    display: none;");
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-tab-select {\n    display: none;");
    expect(stylesSource).toContain(".rail-prep + .workspace .scene-filter-panel span {\n    display: none;");
    expect(stylesSource).toContain(".toolbar {\n    position: absolute;\n    top: auto;\n    right: 12px;\n    bottom: 10px;");
    expect(stylesSource).toContain("flex-wrap: wrap;\n    justify-content: center;\n    gap: 6px;");
    expect(stylesSource).toContain("max-width: calc(100svw - 24px);\n    padding: 6px;\n    overflow-x: visible;");
    expect(stylesSource).toContain(".toolbar:has(.tool-more[open]) {\n  z-index: 9;");
    expect(stylesSource).toContain("background: #0a0f16;");
    expect(stylesSource).toContain(".toolbar .tool,\n  .toolbar .icon-button {\n    width: 40px;\n    min-width: 40px;\n    height: 40px;");
    expect(stylesSource).toContain(".workspace:has(.modal-backdrop) {\n  position: relative;\n  z-index: 90;");
    expect(stylesSource).toContain(".modal-backdrop {\n    padding: 14px 14px calc(86px + env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain("max-height: calc(100svh - 96px - env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain(".tool-more-panel {\n    top: auto;\n    right: 0;\n    bottom: 46px;\n    left: auto;");
    expect(stylesSource).toContain("max-height: min(190px, calc(100svh - 240px));");
    expect(stylesSource).toContain(".map-layer-dock .map-zoom-control {\n    grid-column: 2;");
    expect(stylesSource).toContain(".map-selection-status {\n    right: auto;\n    bottom: 76px;\n    left: 12px;");
    expect(sceneCanvasSource).toContain("const selectedViewportToken = useMemo(() => tokens.find((token) => token.id === props.selectedTokenId), [tokens, props.selectedTokenId]);");
    expect(sceneCanvasSource).toContain("const compactViewport = viewport.clientWidth < 360 || viewport.clientHeight < 220;");
    expect(sceneCanvasSource).toContain("viewport.scrollTo({\n        left: Math.min(maxScrollLeft, Math.max(0, tokenCenterX - targetViewportX)),\n        top: Math.min(maxScrollTop, Math.max(0, tokenCenterY - targetViewportY)),");
  });

  it("keeps mobile table panels usable by compacting the rail instead of starving the inspector", () => {
    expect(stylesSource).toContain("grid-template-rows: minmax(180px, 52%) minmax(160px, 1fr);");
    expect(stylesSource).toContain(".rail-play + .workspace {\n    flex: 0 1 calc(100svh - 64px);\n    max-height: calc(100svh - 64px);");
    expect(stylesSource).toContain(".rail-play {\n    display: flex;\n    flex-direction: row;\n    align-items: center;\n    gap: 6px;\n    max-height: 64px;");
    expect(stylesSource).toContain(".rail-play .campaign-list,");
    expect(stylesSource).toContain(".rail-play .party-rail,\n  .rail-play > .status {\n    display: none;");
    expect(stylesSource).toContain(".rail-play .rail-mode {\n    flex: 1 1 auto;\n    position: static;\n    display: flex;");
    expect(stylesSource).toContain("min-height: 40px;\n    padding: 0;\n    overflow-x: auto;");
    expect(stylesSource).toContain(".rail-play .workspace-mode-switcher .ghost-button {\n    flex: 1 1 0;");
    expect(stylesSource).toContain("min-width: 0;\n    min-height: 38px;\n    padding: 0 4px;\n    font-size: 11px;");
    expect(appSource).toContain('aria-label="AI Agent" title="AI Agent"');
    expect(appSource).toContain("ai-agent-toggle-label-compact");
    expect(appSource).toContain("Audio");
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle {\n    flex: 0 0 62px;");
    expect(stylesSource).toContain("width: 62px;\n    min-width: 62px;\n    min-height: 36px;\n    padding: 0 6px;\n    gap: 4px;\n    font-size: 0;");
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle-label-compact {\n    display: inline;\n    font-size: 11px;");
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle {\n    flex: 0 0 44px;\n    width: 44px;\n    min-width: 44px;\n    padding: 0;\n    gap: 0;\n  }");
    expect(stylesSource).toContain(".chat-composer-dock {\n    gap: 5px;\n    padding: 8px;");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs,\n  .workspace-prep .inspector > .tabs {\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n    gap: 5px;");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs .tab,\n  .workspace-prep .inspector > .tabs .tab {\n    min-height: 38px;\n    gap: 3px;\n    padding: 0 3px;\n    font-size: 11px;");
    expect(stylesSource).toContain(".chat-dice-box .icon-button {\n    width: 40px;\n    min-width: 40px;\n    height: 36px;");
    expect(stylesSource).toContain("min-height: calc(64px + env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain(".toast-stack {\n    bottom: calc(72px + env(safe-area-inset-bottom, 0px));");
  });

  it("keeps tablet play navigation visible without pushing the table below a full rail", () => {
    expect(stylesSource).toContain("@media (max-width: 900px) and (min-width: 641px) {");
    expect(stylesSource).toContain(".rail-play + .workspace {\n    flex: 0 1 calc(100svh - 64px);\n    max-height: calc(100svh - 64px);");
    expect(stylesSource).toContain(".rail-play {\n    display: flex;\n    flex-direction: row;\n    align-items: center;\n    gap: 8px;\n    max-height: 64px;");
    expect(stylesSource).toContain(".rail-play .campaign-list,\n  .rail-play .session-switcher,\n  .rail-play .rail-session-summary,\n  .rail-play .party-rail,\n  .rail-play > .status {\n    display: none;");
    expect(stylesSource).toContain(".rail-play .workspace-mode-switcher .ghost-button {\n    flex: 1 1 0;\n    justify-content: center;\n    min-width: 0;\n    min-height: 40px;");
    expect(stylesSource).toContain(".toolbar {\n    top: auto;\n    bottom: 12px;\n    left: 12px;\n    right: 12px;\n    display: flex;\n    flex-wrap: wrap;\n    justify-content: center;\n    gap: 6px;");
    expect(stylesSource).toContain("overflow-x: visible;\n    overflow-y: visible;");
    expect(stylesSource).toContain(".tool-more-panel {\n    top: auto;\n    right: 0;\n    bottom: 52px;\n    left: auto;");
    expect(stylesSource).toContain("@media (max-width: 1040px) and (min-width: 641px) {\n  .table-area {\n    grid-template-areas: \"map\";");
    expect(stylesSource).toContain(".map-layer-dock {\n    position: absolute;\n    z-index: 5;\n    top: 12px;");
    expect(stylesSource).toContain(".map-layer-dock .map-layer-stack {\n    max-height: min(220px, calc(100% - 104px));");
  });

  it("wraps tablet manage categories instead of hiding sections off the drawer edge", () => {
    expect(stylesSource).toContain("@media (max-width: 1040px) and (min-width: 641px) {");
    expect(stylesSource).toContain(".manage-category-list {\n    display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));\n    gap: 8px;\n    overflow: visible;");
    expect(stylesSource).toContain(".manage-category-button {\n    flex: 1 1 auto;\n    width: 100%;\n    max-width: none;\n    min-width: 0;");
  });

  it("keeps mobile AI workspace tabs readable instead of clipping tab labels", () => {
    expect(stylesSource).toContain(".ai-view-tabs {\n    grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesSource).toContain(".ai-view-tabs .tab {\n    justify-content: flex-start;\n    min-height: 38px;");
    expect(stylesSource).toContain(".rail-play + .workspace .ai-studio-stage {\n    padding-bottom: 80px;\n    scroll-padding-bottom: 80px;");
    expect(stylesSource).toContain(".rail-play + .workspace .ai-intent-card {\n    grid-template-columns: 24px minmax(0, 1fr);\n    min-height: 42px;");
    expect(stylesSource).toContain(".rail-play + .workspace .ai-intent-card small {\n    display: none;");
  });

  it("keeps small board token initials legible instead of clipping into one-letter ellipses", () => {
    expect(stylesSource).toContain(".token .token-label {\n  max-width: calc(100% - 4px);");
    expect(stylesSource).toContain("font-size: 10px;\n  line-height: 1;");
  });

  it("makes the layer stack readable and targetable after moving it away from lower controls", () => {
    expect(sceneCanvasSource).toContain("compactLabel: \"Players\"");
    expect(sceneCanvasSource).toContain("compactLabel: \"Props\"");
    expect(stylesSource).toContain(".map-layer-dock {\n  grid-area: layers;");
    expect(stylesSource).toContain(".map-layer-dock .map-layer-stack {\n  grid-row: 3;\n  position: static;");
    expect(stylesSource).toContain(".map-layer-button {\n  width: 100%;\n  min-height: 34px;");
    expect(stylesSource).toContain(".map-layer-details summary {\n  min-height: 34px;");
    expect(stylesSource).toContain(".map-layer-toggles .inline-check {\n  min-height: 32px;");
    expect(stylesSource).toContain(".tab {\n  flex: none;\n  min-height: 36px;");
    expect(stylesSource).toContain(".inspector-tabs .tab,\n.inspector > .tabs .tab {\n  flex: 0 0 auto;\n  min-height: 36px;");
    expect(stylesSource).toContain(".table-tool-panel.annotation-panel {\n  z-index: 8;");
    expect(stylesSource).toContain(".annotation-panel-section summary {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 36px;");
    expect(stylesSource).toContain(".annotation-panel-section summary::before {\n  content: \"+\";");
  });

  it("keeps advanced and fog tool popups closeable, movable, and away from the layer stack", () => {
    expect(appSource).toContain("function useMovablePanel(");
    expect(appSource).toContain("interface FloatingPanelSize {");
    expect(appSource).toContain("interface FloatingPanelResize {");
    expect(appSource).toContain("const resizeRef = useRef<FloatingPanelResize | null>(null);");
    expect(appSource).toContain("const [collapsed, setCollapsed] = useState(false);");
    expect(appSource).toContain("const floatingPanelInteractiveSelector =");
    expect(appSource).toContain("function clampFloatingPanelSize(");
    expect(appSource).toContain('"--floating-panel-width": `${size.width}px`,');
    expect(appSource).toContain('"--floating-panel-height": `${size.height}px`');
    expect(appSource).toContain('"data-floating-panel-collapsed": collapsed ? "true" : undefined');
    expect(appSource.match(/event\.target instanceof Element/g)?.length).toBeGreaterThanOrEqual(2);
    expect(appSource).toContain("onDoubleClick: toggleCollapsed");
    expect(appSource).toContain("resizeHandleProps:");
    expect(appSource).toContain('aria-label="Close fog and vision panel"');
    expect(appSource).toContain('aria-label="Resize fog and vision panel"');
    expect(appSource).toContain('aria-label="Resize annotation panel"');
    expect(appSource).toContain('aria-label="Resize AI Agent panel"');
    expect(appSource).toContain("if (event) updateDragPosition(drag, event.clientX, event.clientY);");
    expect(appSource).toContain("setFogBrushMode(null);");
    expect(appSource).toContain("setToolReport(\"\");\n    setToolReportTitle(\"Fog and vision\");");
    expect(appSource).toContain("async function showFogHistory() {\n    if (!selectedScene) return;\n    setAnnotationPanelOpen(false);\n    setAnnotationTool(null);");
    expect(appSource).toContain("setToolReportTitle(\"Fog history\");");
    expect(appSource).toContain('className="table-tool-panel movable-panel"');
    expect(appSource).toContain('className="table-tool-panel annotation-panel movable-panel"');
    expect(stylesSource).toContain(".tool-more {\n  position: static;");
    expect(stylesSource).toContain(".tool-more-panel {\n  position: absolute;\n  top: 0;\n  left: 46px;\n  z-index: 10;");
    expect(stylesSource).toContain(".table-tool-panel.movable-panel {\n  top: var(--floating-panel-y, 24px);");
    expect(stylesSource).toContain("width: min(var(--floating-panel-width, 320px), calc(100% - 24px));");
    expect(stylesSource).toContain("height: min(var(--floating-panel-height, 280px), calc(100% - 24px));");
    expect(stylesSource).not.toContain("resize: both;");
    expect(stylesSource).toContain(".floating-panel-header {\n  cursor: grab;");
    expect(stylesSource).toContain(".floating-panel-header:active {\n  cursor: grabbing;");
    expect(stylesSource).toContain(".floating-panel-drag-icon {");
    expect(stylesSource).toContain(".floating-panel-resize-handle {");
    expect(stylesSource).toContain('.movable-panel[data-floating-panel-collapsed="true"]');
    expect(stylesSource).toContain("cursor: nwse-resize;");
  });

  it("streams AI Agent reasoning summaries into the live feed", () => {
    expect(appSource).toContain("const aiAgentLiveThreadIdRef = useRef<string | null>(null);");
    expect(appSource).toContain("const aiAgentPendingAssistantIdRef = useRef<string | null>(null);");
    expect(appSource).toContain('event.type !== "ai.message.delta" && event.type !== "ai.message.completed" && event.type !== "ai.reasoning.delta" && event.type !== "ai.reasoning.completed" && event.type !== "ai.activity.reported" && event.type !== "ai.tool.started" && event.type !== "ai.tool.completed"');
    expect(appSource).toContain('if (!aiAgentBusyRef.current || event.actorUserId !== currentUserId) return false;');
    expect(appSource).toContain('aiAgentBusyRef.current = true;\n    setAiAgentBusy(true);\n    setAiAgentStatus(options.authRetry ? "Retrying agent request after sign-in" : "Agent working");');
    expect(appSource).toContain('progress: options.authRetry ? "Retrying agent turn..." : "Starting agent turn..."');
    expect(appSource).toContain("function clearPendingAiAgentAssistantMessage()");
    expect(appSource).toContain("messages.filter((message) => message.id !== pendingAssistantId)");
    expect(appSource).toContain("const feedRef = useRef<HTMLElement | null>(null);");
    expect(appSource).toContain('const hasStreamingAssistant = props.messages.some((message) => message.role === "assistant" && message.streaming);');
    expect(appSource).toContain('ref={feedRef}');
    expect(appSource).toContain("props.busy && !hasStreamingAssistant");
    expect(appSource).toContain("aiAgentToolProgressText(event)");
    expect(appSource).toContain("function aiAgentToolProgressLabel(toolName: string): string");
    expect(appSource).toContain('"Creating missing actors and tokens"');
    expect(appSource).toContain('"Placing tokens"');
    expect(appSource).toContain("appendReasoningDelta(base.reasoning, summaryIndex, payload.delta)");
    expect(appSource).toContain("upsertAiAgentMessage(mergedMessages, assistantMessage)");
    expect(appSource).toContain("Reasoning summary");
    expect(stylesSource).toContain(".ai-agent-progress {");
    expect(stylesSource).toContain(".ai-agent-reasoning.live {\n  display: grid;");
  });

  it("synchronously blocks duplicate AI Agent turns before busy state renders", () => {
    expect(appSource).toContain("if (aiAgentBusyRef.current) return;");
    expect(appSource.match(/if \(aiAgentBusyRef\.current && !options\.authRetry\) return;/g)).toHaveLength(2);
    expect(appSource).not.toContain("if (aiAgentBusy) return;");
    expect(appSource).not.toContain("if (aiAgentBusy && !options.authRetry) return;");
  });

  it("discards stale workspace results and aborts agent turns on campaign changes", () => {
    expect(appSource).toContain("function cancelAiAgentForWorkspaceChange()");
    expect(appSource).toContain("abortController?.abort();");
    expect(appSource).toContain("function selectWorkspaceContext(nextCampaignId: string, nextSceneId = \"\", nextUserId = currentUserId, options: { preserveCampaignSetup?: boolean } = {})");
    expect(appSource).toContain("if (!workspaceRequestIsCurrent(nextCampaignId, requestUserId)) return snapshotRef.current;");
    expect(appSource).toContain("if (seq !== refreshSeqRef.current || !workspaceRequestIsCurrent(nextCampaignId, requestUserId)) return next;");
    expect(appSource).toContain("if (!workspaceRequestIsCurrent(requestCampaignId, requestUserId)) return;");
    expect(appSource).toContain("if (scene.campaignId !== realtimeSelectionRef.current.campaignId) return;");
    expect(appSource).toContain('selectWorkspaceContext(campaign.id, "");');
    expect(appSource).toContain('refresh(campaign.id, "").catch(console.error)');
  });

  it("synchronously deduplicates paid AI generation jobs", () => {
    expect(appSource).toContain('const aiGenerationLocksRef = useRef<Set<"map" | "token">>(new Set());');
    expect(appSource).toContain('const lock = job.kind === "map" ? "map" : "token";');
    expect(appSource).toContain("if (aiGenerationLocksRef.current.has(lock)) return;");
    expect(appSource).toContain("aiGenerationLocksRef.current.add(lock);");
    expect(appSource).toContain("aiGenerationLocksRef.current.delete(lock);");
  });

  it("aborts non-agent AI work and suppresses late UI updates after workspace switches", () => {
    expect(appSource).toContain("const workspaceAbortControllersRef = useRef<Set<AbortController>>(new Set());");
    expect(appSource).toContain("function cancelWorkspaceBoundRequestsForChange()");
    expect(appSource).toContain("for (const controller of workspaceAbortControllersRef.current) controller.abort();");
    expect(appSource).toContain("aiGenerationLocksRef.current.clear();");
    expect(appSource).toContain("setAiGenerationJobs([]);");
    expect(appSource).toContain("if (!workspaceBoundRequestIsCurrent(request)) return;");
    expect(appSource).toContain("{ signal: request.controller.signal }");
    expect(appSource).toContain('runWorkspaceBoundAiRequest("AI thread replay"');
  });

  it("does not clear current workspace drafts when older form requests finish", () => {
    expect(appSource).toContain("function currentWorkspaceRequestIdentity(): WorkspaceRequestIdentity");
    expect(appSource).toContain("if (!workspaceIdentityIsCurrent(request)) return;");
    expect(appSource).toContain('setChatBody((current) => current === submittedBody ? "" : current);');
    expect(appSource).toContain('setChatReplyToMessageId((current) => current === submittedReplyToMessageId ? "" : current);');
    expect(appSource).toContain('setNewJournalTitle((current) => current === submittedTitle ? "" : current);');
    expect(appSource).toContain('setNewJournalBody((current) => current === submittedBody ? "" : current);');
    expect(appSource).toContain('setNewSceneName((current) => current === submittedName ? "" : current);');
    expect(appSource).toContain('setFogPresetName((current) => current === submittedName ? "" : current);');
    const importBody = appSource.slice(appSource.indexOf("async function importSystemCharacter"), appSource.indexOf("async function createSystemMonster"));
    expect(importBody).toContain("const request = beginWorkspaceBoundRequest();");
    expect(importBody).toContain("if (!workspaceBoundRequestIsCurrent(request)) return outcome;");
    expect(importBody).toContain("`/api/v1/campaigns/${request.campaignId}/systems/${system.id}/characters/import`");
    expect(importBody).toContain("{ signal: request.controller.signal }");
    expect(importBody).toContain("finishWorkspaceBoundRequest(request);");
  });

  it("keeps direct actor HP edits local until blur", () => {
    expect(actorPanelSource).toContain('key={`sheet:${props.actor.id}:${hp?.current ?? 0}`}');
    expect(actorPanelSource).toContain('key={`detail:${props.actor.id}:${hp?.current ?? 0}`}');
    expect(countOccurrences(actorPanelSource, "defaultValue={hp?.current ?? 0}")).toBe(2);
    expect(countOccurrences(actorPanelSource, "onBlur={(event) => props.updateActorHp(props.actor!, Number(event.currentTarget.value))}")).toBe(2);
    expect(actorPanelSource).not.toContain("onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))}");
  });

  it("replaces failed generated-asset images with the preview fallback", () => {
    expect(aiPanelSource).toContain("setPreviewFailed(true);\n            setDeliveryUrl(undefined);");
    expect(aiPanelSource).toContain('previewFailed ? "Preview unavailable" : "Preparing preview"');
  });

  it("supports clearing AI Agent conversation context", () => {
    expect(appSource).toContain("function isAiAgentClearCommand(prompt: string): boolean");
    expect(appSource).toContain("return /^\\/clear(?:\\s+.*)?$/i.test(prompt.trim());");
    expect(appSource).toContain("function startNewAiAgentChat()");
    expect(appSource).toContain("persistAiAgentMessages(aiAgentHistoryKey, []);");
    expect(appSource).toContain("if (isAiAgentClearCommand(prompt)) {");
    expect(appSource).toContain("onNewChat={startNewAiAgentChat}");
    expect(appSource).toContain('aria-label="Start new AI Agent chat"');
    expect(stylesSource).toContain(".ai-agent-new-chat-button {");
  });

  it("keeps ping annotations transient instead of leaving them on the board", () => {
    expect(appSource).toContain("const pingAnnotationTtlSeconds = 5;");
    expect(appSource).toContain('expiresInSeconds: kind === "ping" ? pingAnnotationTtlSeconds : undefined');
    expect(sceneCanvasSource).toContain("function useAnnotationExpiryClock(");
    expect(sceneCanvasSource).toContain("window.setTimeout(() => setNowMs(Date.now()), delayMs)");
    expect(sceneCanvasSource).toContain("activeSceneAnnotations(props.scene.annotations, annotationExpiryNow)");
    expect(sceneCanvasSource).toContain("activeSceneAnnotations(props.scene?.annotations, annotationExpiryNow).length");
    expect(appSource).toContain("const annotations = selectedCurrentAnnotations;");
    expect(appSource).toContain("annotationToolShowsSettings(next)");
    expect(sceneCanvasSource).toContain("function annotationToolShowsSettings(kind: ActiveAnnotationTool): boolean");
    expect(sceneCanvasSource).toContain('return kind === "drawing" || kind === "template";');
  });

  it("keeps the mobile layer stack shallow so it does not swallow the board", () => {
    expect(stylesSource).toContain("@media (max-width: 640px) {\n  .table-area {\n    grid-template-areas: \"map\";");
    expect(stylesSource).toContain(".map-layer-dock {\n    position: absolute;\n    z-index: 5;\n    top: 58px;");
    expect(stylesSource).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(stylesSource).toContain(".map-layer-dock .map-layer-stack {\n    grid-column: 1 / -1;\n    max-height: min(96px, calc(100% - 74px));");
    expect(stylesSource).toContain("overflow-x: hidden;\n    overflow-y: auto;");
    expect(stylesSource).toContain(".map-layer-stack:has(.map-layer-details[open]) {\n    align-items: flex-start;");
    expect(stylesSource).toContain(".map-layer-button {\n    width: auto;\n    min-width: 64px;");
    expect(stylesSource).toContain(".map-layer-stack-heading,\n  .map-layer-row {\n    flex: 0 0 auto;\n    min-height: 36px;");
    expect(stylesSource).toContain(".map-layer-stack-heading strong {\n    display: none;");
    expect(stylesSource).toContain("min-height: 34px;\n    padding: 0 6px;");
    expect(stylesSource).toContain(".table-tool-panel.annotation-panel {\n    top: 68px;\n    right: 8px;\n    bottom: auto;\n    left: 8px;\n    width: auto;\n    max-height: calc(100% - 76px);");
    expect(stylesSource).not.toContain("right: 190px;");
  });

  it("does not request organization invites for sessions that cannot manage the organization", () => {
    expect(apiSource).toContain("function canManageActiveOrganization(session: SessionInfo): boolean");
    expect(apiSource).toContain('activeOrganization?.role === "owner" || activeOrganization?.role === "admin"');
    expect(apiSource).toContain('const organizationInvites = canManageActiveOrganization(session) ? await snapshotGet<OrganizationInviteInfo[]>("/api/v1/organization/invites").catch(() => []) : [];');
    expect(apiSource).not.toContain('snapshotGet<OrganizationInviteInfo[]>("/api/v1/organization/invites").catch(() => [])\n  ]);');
  });

  it("hides unavailable GM-only table tools instead of filling player toolbars with disabled controls", () => {
    expect(toolbarSource).toContain("{props.canCreateToken && (\n        <button className=\"tool\" title=\"Token\"");
    expect(toolbarSource).toContain("{props.canRevealFog && (\n        <button className=\"tool\" title=\"Reveal fog\"");
    expect(toolbarSource).toContain("{props.canUpdateScene && (\n        <button className={`tool tool-mobile-secondary ${props.activeAnnotationTool === \"drawing\" ? \"active\" : \"\"}`}");
    expect(toolbarSource).toContain("{props.canManageCombat && (\n              <button className=\"ghost-button\" type=\"button\" onClick={() => runToolAction(props.onStartCombat, { closeAdvanced: true })}>");
    expect(toolbarSource).toContain("{(props.canManageCombat || props.canRevealFog || props.canUpdateScene) && (");
    expect(toolbarSource).not.toContain("disabled={!props.canCreateToken}");
    expect(toolbarSource).not.toContain("disabled={!props.canRevealFog}");
    expect(toolbarSource).not.toContain("disabled={!props.canUpdateScene}");
    expect(toolbarSource).not.toContain("disabled={!props.canManageCombat}");
  });

  it("keeps the advanced table menu focused on actions that are not already in the primary toolbar", () => {
    expect(appSource).toContain("<Toolbar key={`${workspaceMode}-${tab}`}");
    expect(toolbarSource).toContain("const [advancedOpen, setAdvancedOpen] = useState(false);");
    expect(toolbarSource).toContain("void Promise.resolve(action()).catch(props.onActionError);");
    expect(toolbarSource).toContain('document.addEventListener("mousedown", closeOnPointerDown);');
    expect(toolbarSource).toContain('document.addEventListener("keydown", closeOnEscape);');
    expect(toolbarSource).toContain('open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}');
    expect(countOccurrences(toolbarSource, "runToolAction(")).toBeGreaterThan(8);
    expect(countOccurrences(toolbarSource, "<button className=\"tool\" title=\"Reveal fog\"")).toBe(1);
    expect(toolbarSource).not.toContain("<Eye size={15} /> Reveal fog");
    expect(toolbarSource).not.toContain("<MapPin size={15} /> Ping");
    expect(toolbarSource).toContain('className="tool-more-mobile-only"');
    expect(toolbarSource).toContain("<Circle size={15} /> Measure circle");
    expect(toolbarSource).toContain("<Triangle size={15} /> Measure cone");
    expect(toolbarSource).not.toContain("<Circle size={15} /> Template");
    expect(toolbarSource).not.toContain("<X size={15} /> Delete mark");
  });

  it("shows an actionable offline startup state instead of a stale loading headline", () => {
    expect(appSource).toContain("function apiOfflineStatus(detail?: unknown): string");
    expect(appSource).toContain('const suffix = message ? `: ${message}` : "";');
    expect(appSource).toContain("setStatus(apiOfflineStatus(message));");
    expect(appSource).toContain("setStatus(apiOfflineStatus(error));");
    expect(appSource).toContain('const apiOffline = status.startsWith("API offline");');
    expect(appSource).toContain('{apiOffline ? "API connection required" : "Loading campaign"}');
    expect(appSource).toContain('status reset-status ${apiOffline ? "connection-status" : ""}');
    expect(stylesSource).toContain(".reset-panel .connection-status {\n  line-height: 1.45;\n  text-transform: none;");
    expect(appSource).toContain("Retry connection");
    expect(appSource).toContain("onClick={() => window.location.reload()}");
  });

  it("lets the full character sheet dismiss through expected modal interactions", () => {
    expect(actorPanelSource).toContain('if (event.key === "Escape") setFullSheetOpen(false);');
    expect(actorPanelSource).toContain('document.addEventListener("keydown", closeOnEscape);');
    expect(actorPanelSource).toContain('className={`actor-sheet-popout movable-panel actor-tone-${sheetTone}`}');
    expect(actorPanelSource).toContain('aria-label="Close full character sheet"');
    expect(actorPanelSource).toContain('<h2 id={`actor-full-sheet-title-${props.actor.id}`}>{props.actor.name}</h2>');
    expect(actorPanelSource).not.toContain("{props.actor.name} full character sheet");
  });

  it("keeps the chat composer reachable by the visible message affordance", () => {
    expect(chatRailSource).toContain('aria-label="Chat message"');
    expect(chatRailSource).not.toContain('aria-label="Chat command line"');
  });

  it("keeps the empty combat state compact instead of stretching a huge primary CTA", () => {
    expect(combatPanelSource).toContain('className="combat-empty-state" aria-label="Start combat from scene tokens"');
    expect(combatPanelSource).toContain("Ready to roll initiative");
    expect(combatPanelSource).toContain('<Swords size={15} /> {startPending ? "Starting..." : "Start combat"}');
    expect(countOccurrences(combatPanelSource, "Start combat")).toBe(2);
    expect(combatPanelSource).not.toContain('className="primary-button wide" onClick={props.onStart}');
    expect(combatPanelSource).not.toContain('title="Start combat" aria-label="Start combat"');
    expect(stylesSource).toContain(".combat-empty-state {\n  display: grid;\n  gap: 12px;\n  align-self: start;");
    expect(stylesSource).toContain(".combat-empty-state {\n    gap: 8px;\n    padding: 10px 12px;");
    expect(stylesSource).toContain(".combat-empty-state .primary-button {\n  min-height: 40px;");
  });

  it("lets the floating AI agent dismiss with Escape before it blocks navigation", () => {
    expect(appSource).toContain('if (!aiAgentOpen) return;\n    const focusFrame = window.requestAnimationFrame(() => aiAgentPromptRef.current?.focus());');
    expect(appSource).toContain('event.stopImmediatePropagation();\n      closeAiAgent();');
    expect(appSource).toContain('window.requestAnimationFrame(() => aiAgentToggleRef.current?.focus());');
    expect(appSource).toContain('document.addEventListener("keydown", closeOnEscape);');
    expect(appSource).toContain('window.cancelAnimationFrame(focusFrame);\n      document.removeEventListener("keydown", closeOnEscape);');
  });
});
