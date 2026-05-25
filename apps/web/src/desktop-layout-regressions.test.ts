import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");
const apiSource = readFileSync(resolve(__dirname, "api.ts"), "utf8").replace(/\r\n/g, "\n");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8").replace(/\r\n/g, "\n");
const toolbarSource = appSource.slice(appSource.indexOf("function Toolbar("), appSource.indexOf("function TabButton("));
const actorPanelSource = appSource.slice(appSource.indexOf("function ActorPanel("), appSource.indexOf("function actorConditionLabels("));
const combatPanelSource = appSource.slice(appSource.indexOf("function CombatPanel("), appSource.indexOf("function nextCombatTurnPosition("));
const chatRailSource = appSource.slice(appSource.indexOf("function ChatRail("), appSource.indexOf("function ChatMessageItem("));
const countOccurrences = (source: string, needle: string) => source.split(needle).length - 1;

describe("desktop layout regressions", () => {
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
    expect(stylesSource).toContain(".rail-admin:has(> .manage-category-list) {\n  grid-template-columns: 240px minmax(0, 1fr);");
    expect(stylesSource).toContain(".manage-category-content {\n  grid-column: 2;");
    expect(stylesSource).toContain("background: #0a1017;");
    expect(stylesSource).toContain(".manage-scene-filter-panel {\n  position: sticky;");
    expect(stylesSource).toContain("grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1fr) auto auto;");
    expect(appSource).toContain('<textarea aria-label="Campaign description"');
    expect(appSource).toContain('<textarea aria-label="Edit campaign description"');
    expect(stylesSource).toContain(".account-box textarea {\n  min-height: 82px;");
  });

  it("does not leave the floating AI agent panel blocking workspace navigation", () => {
    expect(appSource).toContain("const selectWorkspaceMode = (mode: WorkspaceMode) => {\n    setWorkspaceMode(mode);\n    setAiAgentOpen(false);");
    expect(stylesSource).toContain(".rail-manage .ai-agent-toggle {\n  display: none;");
    expect(appSource).not.toContain('label: "AI Studio"');
    expect(appSource).toContain("AI Studio is deprecated. Use the AI Agent for AI-assisted table work.");
    expect(stylesSource).toContain(".ai-agent-deprecation-note {");
    expect(appSource).toContain("const agentPanel = useMovablePanel(initialAiAgentPanelPosition);");
    expect(appSource).toContain('<aside className="ai-agent-popout movable-panel" aria-label="AI Agent" style={agentPanel.style}>');
    expect(appSource).toContain('<header className="ai-agent-header floating-panel-header" {...agentPanel.dragHandleProps}>');
    expect(stylesSource).toContain(".ai-agent-popout.movable-panel {\n  top: var(--floating-panel-y, 20px);");
    expect(stylesSource).toContain("background: #070b10;\n  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(229, 176, 74, 0.08);\n  isolation: isolate;");
    expect(stylesSource).toContain("@media (max-width: 900px) {\n  .ai-agent-popout {\n    right: 12px;\n    bottom: calc(76px + env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain("@media (max-width: 760px) {\n  .ai-agent-popout {\n    right: 8px;\n    bottom: calc(70px + env(safe-area-inset-bottom, 0px));");
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
    expect(appSource).toContain('const canUsePrepWorkspace = canManageScenes || hasPermission("journal.create") || hasPermission("journal.update") || hasPermission("plugin.install") || hasPermission("plugin.configure") || hasPermission("actor.create");');
    expect(appSource).toContain('const canUseAiStudioWorkspace = hasPermission("ai.proposeChanges") || hasPermission("ai.applyChanges") || hasPermission("ai.readGmMemory") || hasPermission("combat.manage");');
    expect(appSource).toContain('if (workspaceMode === "prep" && !canUsePrepWorkspace) setWorkspaceMode("live");');
    expect(appSource).toContain('if (workspaceMode === "ai" && !canUseAiStudioWorkspace) setWorkspaceMode("live");');
    expect(appSource).toContain('visible: canManageCampaignSettings');
    expect(appSource).toContain('visible: canManagePeople');
    expect(appSource).toContain('visible: canManageScenes');
    expect(appSource).toContain('visible: canManageArchives');
    expect(appSource).toContain('{ id: "manage", label: accountOnlyManageMode ? "Account" : "Manage"');
    expect(appSource).toContain('const activeManageCategory = visibleManageCategories.some((category) => category.id === manageCategory) ? manageCategory : (visibleManageCategories[0]?.id ?? "account");');
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
    expect(appSource).toContain('const activeIntentClass = activeIntent === "tokenBatch" ? "token-batch" : activeIntent === "selectedToken" ? "selected-token" : activeIntent;');
    expect(appSource).toContain("ai-create-workflow ai-create-intent-${activeIntentClass}");
    expect(appSource).toContain('className="ai-asset-task ai-map-asset-task"');
    expect(appSource).toContain('className="ai-asset-task ai-token-asset-task"');
    expect(stylesSource).toContain(".ai-field select {\n  width: 100%;\n  min-height: 36px;");
    expect(stylesSource).toContain(".admin-form-grid input,\n.admin-form-grid select {\n  width: 100%;\n  min-height: 36px;\n  padding: 0 9px;\n  border: 1px solid #463b2a;\n  border-radius: 6px;");
    expect(stylesSource).toContain("@media (min-width: 1181px) {\n  .ai-create-workflow.ai-create-intent-map > .ai-assets-panel,");
    expect(stylesSource).toContain(".ai-create-workflow.ai-create-intent-map > .ai-assets-panel,\n.ai-create-workflow.ai-create-intent-token-batch > .ai-assets-panel,\n.ai-create-workflow.ai-create-intent-selected-token > .ai-assets-panel {\n  order: -1;");
    expect(stylesSource).toContain(".ai-create-workflow.ai-create-intent-token-batch .ai-token-asset-task,\n.ai-create-workflow.ai-create-intent-selected-token .ai-token-asset-task {\n  order: -1;");
  });

  it("keeps mobile token creation and map controls inside the viewport", () => {
    expect(stylesSource).not.toContain("grid-template-columns: minmax(84px, 1.4fr) minmax(70px, 1fr) minmax(62px, 0.8fr) minmax(58px, 0.7fr) 44px;");
    expect(appSource).toContain('aria-label={mode.label} title={mode.label}');
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
    expect(appSource).toContain("function battleMapBoardDimensions(");
    expect(appSource).toContain('width: `${boardDimensions.width}px`,');
    expect(appSource).toContain('height: `${boardDimensions.height}px`,');
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
    expect(stylesSource).toContain(".actor-sheet-dialog {\n    max-height: calc(100svh - 114px - env(safe-area-inset-bottom, 0px));");
    expect(stylesSource).toContain(".tool-more-panel {\n    top: auto;\n    right: 0;\n    bottom: 46px;\n    left: auto;");
    expect(stylesSource).toContain("max-height: min(190px, calc(100svh - 240px));");
    expect(stylesSource).toContain(".map-layer-dock .map-zoom-control {\n    grid-column: 2;");
    expect(stylesSource).toContain(".map-selection-status {\n    right: auto;\n    bottom: 76px;\n    left: 12px;");
    expect(appSource).toContain("const selectedViewportToken = useMemo(() => tokens.find((token) => token.id === props.selectedTokenId), [tokens, props.selectedTokenId]);");
    expect(appSource).toContain("const compactViewport = viewport.clientWidth < 360 || viewport.clientHeight < 220;");
    expect(appSource).toContain("viewport.scrollTo({\n        left: Math.min(maxScrollLeft, Math.max(0, tokenCenterX - targetViewportX)),\n        top: Math.min(maxScrollTop, Math.max(0, tokenCenterY - targetViewportY)),");
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
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle {\n    flex: 0 0 62px;");
    expect(stylesSource).toContain("width: 62px;\n    min-width: 62px;\n    min-height: 36px;\n    padding: 0 6px;\n    gap: 4px;\n    font-size: 0;");
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle-label-compact {\n    display: inline;\n    font-size: 11px;");
    expect(stylesSource).toContain(".rail-play .ai-agent-toggle {\n    flex: 0 0 44px;\n    width: 44px;\n    min-width: 44px;\n    padding: 0;\n    gap: 0;\n  }");
    expect(stylesSource).toContain(".chat-composer-dock {\n    gap: 5px;\n    padding: 8px;");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs,\n  .workspace-prep .inspector > .tabs {\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n    gap: 5px;");
    expect(stylesSource).toContain(".workspace-prep .inspector-tabs .tab,\n  .workspace-prep .inspector > .tabs .tab {\n    min-height: 38px;\n    gap: 3px;\n    padding: 0 3px;\n    font-size: 11px;");
    expect(stylesSource).toContain(".chat-dice-box .icon-button {\n    width: 40px;\n    min-width: 40px;\n    height: 36px;");
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
    expect(appSource).toContain("compactLabel: \"Players\"");
    expect(appSource).toContain("compactLabel: \"Props\"");
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
    expect(appSource).toContain('aria-label="Close fog and vision panel"');
    expect(appSource).toContain("if (event) updateDragPosition(drag, event.clientX, event.clientY);");
    expect(appSource).toContain("setFogBrushMode(null);");
    expect(appSource).toContain("setToolReportTitle(\"Fog history\");");
    expect(appSource).toContain('className="table-tool-panel movable-panel"');
    expect(appSource).toContain('className="table-tool-panel annotation-panel movable-panel"');
    expect(stylesSource).toContain(".tool-more {\n  position: static;");
    expect(stylesSource).toContain(".tool-more-panel {\n  position: absolute;\n  top: 0;\n  left: 46px;\n  z-index: 10;");
    expect(stylesSource).toContain(".table-tool-panel.movable-panel {\n  top: var(--floating-panel-y, 24px);");
    expect(stylesSource).toContain("resize: both;");
    expect(stylesSource).toContain(".floating-panel-header {\n  cursor: move;");
  });

  it("keeps ping annotations transient instead of leaving them on the board", () => {
    expect(appSource).toContain("const pingAnnotationTtlSeconds = 5;");
    expect(appSource).toContain('expiresInSeconds: kind === "ping" ? pingAnnotationTtlSeconds : undefined');
    expect(appSource).toContain("function useAnnotationExpiryClock(");
    expect(appSource).toContain("window.setTimeout(() => setNowMs(Date.now()), delayMs)");
    expect(appSource).toContain("activeSceneAnnotations(props.scene.annotations, annotationExpiryNow)");
    expect(appSource).toContain("activeSceneAnnotations(props.scene?.annotations, annotationExpiryNow).length");
    expect(appSource).toContain("const annotations = selectedCurrentAnnotations;");
    expect(appSource).toContain("annotationToolShowsSettings(next)");
    expect(appSource).toContain("function annotationToolShowsSettings(kind: ActiveAnnotationTool): boolean");
    expect(appSource).toContain('return kind === "drawing" || kind === "template";');
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
    expect(toolbarSource).toContain("{props.canUpdateScene && (\n        <button className={`tool ${props.activeAnnotationTool === \"drawing\" ? \"active\" : \"\"}`}");
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
    expect(toolbarSource).not.toContain("<Circle size={15} /> Measure circle");
    expect(toolbarSource).not.toContain("<Triangle size={15} /> Measure cone");
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
    expect(actorPanelSource).toContain('if (event.target === event.currentTarget) setFullSheetOpen(false);');
    expect(actorPanelSource).toContain('aria-label="Close full character sheet"');
    expect(actorPanelSource).toContain('<h2 id={`actor-full-sheet-title-${props.actor.id}`}>{props.actor.name}</h2>');
    expect(actorPanelSource).not.toContain("{props.actor.name} full character sheet");
  });

  it("keeps the chat composer reachable by the visible message affordance", () => {
    expect(appSource).toContain('aria-label="Chat message"');
    expect(appSource).not.toContain('aria-label="Chat command line"');
  });

  it("keeps the empty combat state compact instead of stretching a huge primary CTA", () => {
    expect(combatPanelSource).toContain('className="combat-empty-state" aria-label="Start combat from scene tokens"');
    expect(combatPanelSource).toContain("Ready to roll initiative");
    expect(combatPanelSource).toContain("<Swords size={15} /> Start combat");
    expect(countOccurrences(combatPanelSource, "Start combat")).toBe(2);
    expect(combatPanelSource).not.toContain('className="primary-button wide" onClick={props.onStart}');
    expect(combatPanelSource).not.toContain('title="Start combat" aria-label="Start combat"');
    expect(stylesSource).toContain(".combat-empty-state {\n  display: grid;\n  gap: 12px;\n  align-self: start;");
    expect(stylesSource).toContain(".combat-empty-state {\n    gap: 8px;\n    padding: 10px 12px;");
    expect(stylesSource).toContain(".combat-empty-state .primary-button {\n  min-height: 40px;");
  });

  it("lets the floating AI agent dismiss with Escape before it blocks navigation", () => {
    expect(appSource).toContain('if (!aiAgentOpen) return;\n    const closeOnEscape = (event: KeyboardEvent) => {');
    expect(appSource).toContain('if (event.key === "Escape") setAiAgentOpen(false);');
    expect(appSource).toContain('document.addEventListener("keydown", closeOnEscape);');
    expect(appSource).toContain('return () => document.removeEventListener("keydown", closeOnEscape);');
  });
});
