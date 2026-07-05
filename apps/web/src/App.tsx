import type { Actor, AiMemoryFact, AiThread, AiToolCall, AudioTrack, AuditLog, Campaign, CampaignArchive, ChatMessage, Combat, CombatAction, ContentImportBatch, ContentImportEntityKind, ContentImportSource, DiceRoll, EmailOutboxMessage, Encounter, FogHistoryEntry, FogMode, FogPreset, Item, JournalEntry, MapAsset, MessageType, OrganizationMemberRole, OrganizationWorkspace, PermissionName, Proposal, Scene, SceneAnnotation, SceneAnnotationKind, SceneAnnotationLayer, SceneTemplateShape, ScimAssignableRole, Token, TokenLayer, UserRole, Visibility, VisionPoint, VisionPointSample, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import { probabilityRange, rollFormula } from "@open-tabletop/dice-engine";
import { toPng } from "html-to-image";
import { Activity, Bot, Boxes, BrickWall, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Crosshair, Dices, Download, Eraser, Eye, FileText, Flame, Grip, Hand, Image as ImageIcon, KeyRound, Layers, Lightbulb, LockKeyhole, Mail, Map as MapIcon, MapPin, MessageSquare, Moon, Music, Paintbrush, Pause, PencilLine, Pentagon, Play, Plus, RefreshCw, RotateCcw, Ruler, ScrollText, Search, Send, Shield, Swords, Timer, Trash2, Triangle, Upload, UserCog, UserPlus, Users, UserX, Volume2, VolumeX, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { acceptInviteSession, ApiError, apiAnalyzePdfContentImport, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, bootstrapOwnerSession, changePasswordSession, clearSession, confirmPasswordResetSession, confirmTotpMfa, consumeSsoRedirect, createOrganizationWorkspace, disableTotpMfa, enrollTotpMfa, getSessionToken, getSessionUserId, loadAdminSnapshot, loadBootstrapStatus, loadMfaStatus, loadOidcConfig, loadOrganizationInvites, loadOrganizationMembers, loadSnapshot, loginPasswordSession, loginSession, logoutSession, registerSession, removeOrganizationMember, requestPasswordReset, revokeInvite, setSessionUserId, setStatelessDemoApiMode, startOidcLogin, switchOrganization, updateOrganizationMemberRole, updateWorkspaceDefaults, upsertOrganizationMember, verifyDiceRoll, type AdminAssetIntegrityQuarantineResult, type AdminAuthConnectionTestResult, type AdminEmailOutboxRetryAllResult, type AdminJob, type AdminJobAlertResult, type AdminPasswordResetInfo, type AdminPluginReviewInfo, type AdminScimGroupRoleMapping, type AdminScimGroupRoleMappingInput, type AdminScimGroupRoleMappingResult, type AdminSessionInfo, type AdminSnapshot, type AdminStorageBackupResult, type AdminStorageRestoreDrillResult, type AdminStorageRestoreResult, type AdminUserInfo, type AiUsageSummary, type CampaignAssetStorageInfo, type CharacterTemplateInfo, type DiceRollVerification, type EncounterPlanInfo, type InviteCreateInfo, type MfaInfo, type OrganizationMemberInfo, type PluginReviewStatus, type PluginRuntimeInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";
import { adversaryActorsForSceneBoard, isAdversaryActor } from "./actor-rails.js";
import { activeSceneAnnotations, nextAnnotationExpiryMs } from "./annotation-expiry.js";
import { applyLocalBoardHistoryAction, createTokenCopies, type BoardHistoryAction, type BoardHistoryDirection, type BoardTokenFrameChange, type BoardTokenPositionChange } from "./board-history.js";
import { blankCanvasDemoCampaignId, blankCanvasDemoNotice, blankCanvasDemoSceneId, blankCanvasDemoUserId, createBlankCanvasDemoSnapshot } from "./blank-canvas-demo.js";
import { scenePointFromClient } from "./board-geometry.js";
import { boardKeyboardAction } from "./board-keyboard.js";
import { computeTokenMovements, formatGridDistance } from "./board-animation.js";
import { activeAudioCount, desiredAudioStates } from "./audio-sync.js";
import { parseChatCommand } from "./chat-command.js";
import { filterPaletteCommands, movePaletteIndex, paletteDiceFormula, type PaletteCommand } from "./command-palette.js";
import type { DesktopStatus } from "./desktop-api.js";
import { addDieToFormula, diceTraySides, rollHighlight, rollTermHighlight } from "./dice-insights.js";
import { dice3dStorageKey, diceCastPlan, dieShapeName, dieShapePoints, initialDice3dEnabled, newDiceCastRolls, type DiceCastPlan, type Dice3dPreferenceEnvironment } from "./dice-3d.js";
import { castPhysicsDiceWhenReady, clearPhysicsDice, diceBoxContainerId, diceBoxStatus, physicsDiceLabelDelayMs, primePhysicsDiceStage } from "./dice-box-stage.js";
import { initialUiTheme, nextUiTheme, uiThemeLabel, uiThemeStorageKey, type UiTheme } from "./ui-theme.js";
import { applyProposalChangesToSnapshot, proposalReviewActionLabel, proposalReviewSteps, visibleAiAgentProposals } from "./proposal-review.js";
import { realtimeConnectionIdentity, startRealtimeConnection } from "./realtime-connection.js";
import { boardCaptureRequestDecision, createRealtimeHandlers, type BoardCaptureRequestDecision } from "./realtime-refresh.js";
import { templateConePoints } from "./scene-annotations.js";
import { normalizeSceneSizeValue, sceneDimensionsFromCells, sceneGridCellSummary, sceneSizePresets, type SceneSizePreset } from "./scene-size.js";
import { sceneTabWrapClass } from "./scene-tabs.js";
import { HpBar } from "./hp-bar.js";
import { JournalPanel } from "./journal-panel.js";
import { ChatRail } from "./chat-rail.js";
import { CombatPanel, nextCombatTurnPosition } from "./combat-panel.js";
import { SdkPanel } from "./sdk-panel.js";
import { AdvancementFlow } from "./advancement-flow.js";
import { ContentImportPanel } from "./content-import-panel.js";
import { AdminPanel, aiToolCallErrorCode, scimMappingLabel } from "./admin-panel.js";
import { AiPanel } from "./ai-panel.js";
import { MapLayerStack, MapSelectionStatus, MapZoomControls, SceneCanvas, TabButton, Toolbar, annotationColor, annotationGroupKey, annotationToolLabel, annotationToolShowsSettings, battleMapZoomStep, clampBattleMapZoom, defaultAnnotationLayer, distanceBetween, tokenCenter, tokenCoordinatesFromCenter, tokenFrame, tokenLayer, tokenLayerLabel, tokenLayers, type TokenFrame, type TokenMovePersistenceChange, type TokenSelectionOptions } from "./scene-canvas.js";
import { campaignPermissionTemplates, type CampaignPermissionTemplateId } from "./admin-data.js";
import { MetricTile } from "./metric-tile.js";
import { assetMatchesFolderFilter, contentImportEntityData, normalizeAssetFolderPath, summarizeImport, type ArchiveImportCollection, type ArchiveImportScope, type AssetLifecycleStatus, type CampaignImportResult, type ContentImportDraftEntity, type ContentImportPreviewSource, type FailedAssetUpload } from "./content-import-data.js";
import { systemAdvancementOptionId, systemEncounterThreatId, systemImportPayload, systemRollId, type AdvancementOptionInfo } from "./system-actions.js";
import { CharacterCreatorDialog, type CharacterCreateInput, type CharacterOriginsInfo } from "./character-creator-dialog.js";
import { EncounterBuilderDialog, type EncounterBuilderThreatSelection } from "./encounter-builder.js";
import { actorActionDiceFormula, actorActionOptions, actorActionSupportsEffect, actorArmorClass, actorCombatResource, actorCombatStateLabels, actorConditionLabels, actorHitPoints, actorResourceControls, actorResourceLabels, actorResourceUpdate, actorSaveFormula, adjustedTemplateDamage, appendActorCondition, formatActorConditions, isPointInsidePoints, isPurchasableCompendiumEntry, itemDisplayLabel, itemEquippedLabel, itemPreparedLabel, parseActorConditions, quickActorConditionIds, targetConditionLabels, tokenBrightVisionPatch, tokenPermissionPresetLabel, tokenPlayerOwnerIds, type ActorActionOption, type RulesCompendiumEntry, type TokenVisionPatch } from "./actor-sheet-data.js";
import { actorRailSubtitle, clampNumber, contentImportStatusClass, downloadJson, errorMessage, formatAdminList, formatCost, formatCurrency, formatDateTime, formatDuration, formatDurationSeconds, formatFogHistoryEntry, formatGp, formatNumber, formatPercent, formatRollTermDetail, formatRollTermName, formatStorageBytes, formatTime, formatVisionPoint, formatVisionPointSample, jobStatusClass, numericValue, registryHostLabel, prettyOriginId, readinessStatusClass, recordValue, rollTermTotal, safeProbabilityRange, slugId, stringArrayValue, stringValue, titleCaseLabel } from "./sheet-format.js";
import { hasItemDropData, hasTokenDropData, readItemDropData, readTokenDropData, setTokenDropPreview, writeItemDropData, writeTokenDropData, type TokenDropPayload } from "./token-drag.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";
const boardHistoryLimit = 50;
const pingAnnotationTtlSeconds = 5;
const annotationExpiryTimerSlackMs = 25;
const maxBrowserTimerDelayMs = 2_147_483_647;
const aiAgentAuthRetryIntervalMs = 3_000;
const aiAgentAuthRetryTimeoutMs = 10 * 60_000;
const rollingDiceStatus = "Rolling dice...";

function audioTrackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").trim() || file.name || "Uploaded audio";
}

function authenticatedAudioUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (!apiBase) return url;
  return `${apiBase.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

function apiOfflineStatus(detail?: unknown): string {
  const message = (typeof detail === "string" ? detail : detail instanceof Error ? detail.message : detail == null ? "" : String(detail)).trim();
  const suffix = message ? `: ${message}` : "";
  return `API offline at ${apiBase || "http://127.0.0.1:4000"}${suffix}. Start it with pnpm --filter @open-tabletop/api dev.`;
}

interface FailedArchiveImport {
  file: File;
  message: string;
}

interface FloatingPanelPosition {
  x: number;
  y: number;
}

interface FloatingPanelSize {
  width: number;
  height: number;
}

interface FloatingPanelDrag {
  pointerId: number;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  maxX: number;
  maxY: number;
}

interface FloatingPanelResize {
  pointerId: number;
  handle: HTMLElement;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

interface FloatingPanelResizeOptions {
  minWidth?: number;
  minHeight?: number;
}

interface SceneViewportSize {
  width: number;
  height: number;
}

type ChatExportFormat = "json" | "ndjson";
type ChatModerationResolution = "open" | "follow_up" | "reviewed";
type ArchiveExportScope = "campaign";
type ArchiveExportVersion = "0.2.0";
type ArchiveRedactionMode = "portable";
type ArchiveImportMode = "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
type ManageCategoryId = "account" | "campaign" | "people" | "scenes" | "archives" | "serverAdmin";
type WorkspaceMode = "live" | "prep" | "ai" | "manage";
type InspectorTab = "actors" | "journal" | "chat" | "combat" | "content" | "plugins";
type AiAgentApprovalMode = "manual" | "auto";
type AiGenerationJobKind = "map" | "token" | "tokenBatch";
type RulesSaveOutcome = "success" | "failure";
type ActorActionCommitOptions = { targetActorId?: string; applyEffect?: boolean; consumeResources?: boolean; saveOutcomes?: Record<string, RulesSaveOutcome>; effectChoice?: string };

interface ActorActionResolutionPreview {
  commitMode: "commit" | "preview";
  blocked?: { reason: string; code: string };
  rolls?: Array<{ rollId: string; label: string; formula: string; d20Mode?: string; targetActorId?: string; advantageSources?: string[]; disadvantageSources?: string[] }>;
  resourceConsumption?: Array<{ label: string; amount: number; remaining: number }>;
  conditions?: Array<{ actorId: string; operation: string; conditionName?: string; reason: string }>;
  pendingSaves?: Array<{ actorId: string; ability: string; dc?: number; reason: string; requiredForCommit?: boolean }>;
  pendingReactions?: Array<{ actorId: string; reason: string }>;
  warnings?: string[];
  pendingChoice?: { kind?: "effect" | "damageType" | "resistance" | "manual"; reason: string; options: string[] };
  manualResolutionRequired?: { reason: string };
  attunement?: { limit: number; attunedItemIds: string[]; overLimitBy: number };
}

interface AiGenerationJob {
  id: string;
  kind: AiGenerationJobKind;
  label: string;
  detail?: string;
}

interface AiAgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  proposalIds?: string[];
  reasoning?: string[];
}

interface AiAgentProviderEvent {
  type: string;
  proposalId?: string;
  delta?: string;
  content?: string;
  summaryIndex?: number;
}

interface AiAgentThreadResponse {
  thread: AiThread;
  assistantMessage: string;
  events: AiAgentProviderEvent[];
}

interface AiAgentPendingAuthRequest {
  prompt: string;
  requestMessages: AiAgentMessage[];
}

interface CodexAuthStart {
  type: "chatgpt" | "chatgptDeviceCode";
  loginId?: string;
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}

interface AiAgentCodexAuthPrompt extends CodexAuthStart {
  message: string;
  opened: boolean;
}

const annotationLayers: SceneAnnotationLayer[] = ["measurement", "effects", "drawings", "notes"];

function initialResetToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

function dice3dPreferenceEnvironment(): Dice3dPreferenceEnvironment {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: Boolean(connection?.saveData),
    hardwareConcurrency: navigator.hardwareConcurrency
  };
}

function initialInviteToken(): string {
  return new URLSearchParams(window.location.search).get("invite") ?? "";
}

function initialResetMode(): boolean {
  return window.location.pathname.endsWith("/reset-password") || initialResetToken().startsWith("opr_");
}

function clearResetUrl(): void {
  const nextPath = window.location.pathname.endsWith("/reset-password") ? "/" : window.location.pathname;
  window.history.replaceState(null, "", nextPath || "/");
}

function clearJoinUrl(): void {
  if (window.location.pathname.endsWith("/join") || new URLSearchParams(window.location.search).has("invite")) {
    window.history.replaceState(null, "", "/");
  }
}

function initialSavedDiceFormulas(): string[] {
  const fallback = ["1d20+5", "2d20kh1+5", "2d20kl1+5", "1d8+3", "2d6"];
  try {
    const parsed = JSON.parse(localStorage.getItem("otte:savedDiceFormulas") ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const formulas = parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 12);
    return formulas.length > 0 ? formulas : fallback;
  } catch {
    return fallback;
  }
}

function persistSavedDiceFormulas(formulas: string[]): void {
  localStorage.setItem("otte:savedDiceFormulas", JSON.stringify(formulas.slice(0, 12)));
}

function initialStoredId(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function persistStoredId(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Selection persistence is a convenience; private-mode storage failures should not block the table.
  }
}

function aiAgentHistoryStorageKey(campaignId: string, userId: string | null): string {
  return `otte:aiAgentHistory:${campaignId}:${userId ?? "anonymous"}`;
}

function initialAiAgentMessages(key: string): AiAgentMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap<AiAgentMessage>((value) => {
        const message = recordValue(value);
        if (Object.keys(message).length === 0) return [];
        const role: AiAgentMessage["role"] | undefined = message.role === "user" || message.role === "assistant" || message.role === "system" ? message.role : undefined;
        const content = typeof message.content === "string" ? message.content : "";
        const id = typeof message.id === "string" && message.id ? message.id : `agent-history-${Date.now()}`;
        const createdAt = typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString();
        if (!role || !content) return [];
        return [{ id, role, content, createdAt, proposalIds: stringArrayValue(message.proposalIds), reasoning: stringArrayValue(message.reasoning) }];
      })
      .slice(-80);
  } catch {
    return [];
  }
}

function persistAiAgentMessages(key: string, messages: AiAgentMessage[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-80)));
  } catch {
    // Chat history is useful context, not critical table state.
  }
}

function aiAgentProviderMessages(messages: AiAgentMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message): message is AiAgentMessage & { role: "user" | "assistant" } => (message.role === "user" || message.role === "assistant") && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .slice(-40);
}

const archiveImportCollectionOptions: Array<{ id: ArchiveImportCollection; label: string }> = [
  { id: "assets", label: "Assets" },
  { id: "scenes", label: "Scenes" },
  { id: "tokens", label: "Tokens" },
  { id: "actors", label: "Actors" },
  { id: "items", label: "Items" },
  { id: "journals", label: "Journals" },
  { id: "handouts", label: "Handouts" },
  { id: "chat", label: "Chat" },
  { id: "rolls", label: "Rolls" },
  { id: "diceMacros", label: "Dice macros" },
  { id: "encounters", label: "Encounters" },
  { id: "combats", label: "Combats" },
  { id: "contentImports", label: "Import batches" },
  { id: "fogPresets", label: "Fog presets" }
];

type XpProgressInfo = {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
};
type MeasurementTool = "measure-circle" | "measure-cone";
type AnnotationTool = SceneAnnotationKind | MeasurementTool | null;
type ActiveAnnotationTool = NonNullable<AnnotationTool>;
type ActorLoadoutFilter = "all" | "equipped" | "consumable" | "magic";

function compareScenesForDisplay(left: Scene, right: Scene): number {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
}

function assetTagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}

function isUsableImageAsset(asset: MapAsset): boolean {
  return asset.mimeType.startsWith("image/") && asset.lifecycle?.status !== "deleted";
}

const gridlessMapPromptMarker = "gridless virtual tabletop background";

function sceneGridOverlayVisible(scene: Scene): boolean {
  const explicit = scene.metadata?.gridOverlayVisible;
  if (typeof explicit === "boolean") return explicit;
  const generatedPrompt = scene.metadata?.generatedBackgroundPrompt;
  if (typeof generatedPrompt === "string" && generatedPrompt.trim()) {
    return generatedPrompt.toLowerCase().includes(gridlessMapPromptMarker);
  }
  return true;
}

function useAnnotationExpiryClock(annotations: readonly Pick<SceneAnnotation, "expiresAt">[] | undefined): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const nextExpiry = nextAnnotationExpiryMs(annotations, nowMs);
    if (nextExpiry === undefined) return;

    const delayMs = Math.max(0, Math.min(nextExpiry - Date.now() + annotationExpiryTimerSlackMs, maxBrowserTimerDelayMs));
    const timeoutId = window.setTimeout(() => setNowMs(Date.now()), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [annotations, nowMs]);

  return nowMs;
}

function clampFloatingPanel(value: number, max: number): number {
  return Math.max(8, Math.min(Math.max(8, max), Math.round(value)));
}

function clampFloatingPanelSize(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.max(min, max), Math.round(value)));
}

function initialAiAgentPanelSize(): FloatingPanelSize {
  return {
    width: Math.min(420, Math.max(340, window.innerWidth - 32)),
    height: Math.min(640, Math.max(460, window.innerHeight - 40))
  };
}

/** Width reserved for the inspector rail so floating utilities land on the stage, not over chat. */
function floatingPanelInspectorAllowance(): number {
  return window.innerWidth >= 1180 ? 392 : 0;
}

function initialAiAgentPanelPosition(): FloatingPanelPosition {
  const { width, height } = initialAiAgentPanelSize();
  return {
    x: clampFloatingPanel(window.innerWidth - floatingPanelInspectorAllowance() - width - 16, window.innerWidth - 48),
    y: clampFloatingPanel(window.innerHeight - height - 20, window.innerHeight - 48)
  };
}

function initialSoundboardPanelSize(): FloatingPanelSize {
  return {
    width: Math.min(300, Math.max(260, window.innerWidth - 32)),
    height: Math.min(440, Math.max(320, window.innerHeight - 96))
  };
}

function initialSoundboardPanelPosition(): FloatingPanelPosition {
  const { width } = initialSoundboardPanelSize();
  return {
    x: clampFloatingPanel(window.innerWidth - floatingPanelInspectorAllowance() - width - 16, window.innerWidth - 48),
    y: clampFloatingPanel(96, window.innerHeight - 48)
  };
}

function initialActorSheetPanelSize(): FloatingPanelSize {
  return {
    width: Math.min(620, Math.max(380, window.innerWidth - 48)),
    height: Math.min(660, Math.max(400, window.innerHeight - 96))
  };
}

function initialActorSheetPanelPosition(): FloatingPanelPosition {
  const { width } = initialActorSheetPanelSize();
  return {
    x: clampFloatingPanel(window.innerWidth - floatingPanelInspectorAllowance() - width - 24, window.innerWidth - 48),
    y: clampFloatingPanel(64, window.innerHeight - 48)
  };
}

const keyboardShortcutRows: Array<{ keys: string; label: string }> = [
  { keys: "Ctrl+K", label: "Command palette" },
  { keys: "V", label: "Select tool" },
  { keys: "R", label: "Ruler" },
  { keys: "C", label: "Measure circle" },
  { keys: "O", label: "Measure cone" },
  { keys: "P", label: "Ping" },
  { keys: "D", label: "Draw" },
  { keys: "A", label: "Area template" },
  { keys: "Shift+Click", label: "Multi-select tokens" },
  { keys: "Alt+Drag", label: "Pan the map" },
  { keys: "Ctrl+Scroll", label: "Zoom the map" },
  { keys: "Esc", label: "Close panels and dialogs" },
  { keys: "?", label: "Toggle this overlay" }
];

const mapDockOpenStorageKey = "otte:mapDockOpen";
const quickCreateOpenStorageKey = "otte:quickCreateOpen";

function initialStoredPanelFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function persistStoredPanelFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage may be unavailable in private sessions; the preference is non-essential.
  }
}

function useMovablePanel(initialPosition: FloatingPanelPosition | (() => FloatingPanelPosition), initialSize: FloatingPanelSize | (() => FloatingPanelSize) = { width: 320, height: 280 }, resizeOptions: FloatingPanelResizeOptions = {}) {
  const [position, setPosition] = useState<FloatingPanelPosition>(() => (typeof initialPosition === "function" ? initialPosition() : initialPosition));
  const [size, setSize] = useState<FloatingPanelSize>(() => (typeof initialSize === "function" ? initialSize() : initialSize));
  const dragRef = useRef<FloatingPanelDrag | null>(null);
  const resizeRef = useRef<FloatingPanelResize | null>(null);
  const minWidth = resizeOptions.minWidth ?? 280;
  const minHeight = resizeOptions.minHeight ?? 180;
  const style = useMemo(
    () =>
      ({
        "--floating-panel-x": `${position.x}px`,
        "--floating-panel-y": `${position.y}px`,
        "--floating-panel-width": `${size.width}px`,
        "--floating-panel-height": `${size.height}px`
      }) as CSSProperties,
    [position, size]
  );

  const releaseDrag = (drag: FloatingPanelDrag) => {
    try {
      drag.handle.releasePointerCapture(drag.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const updateDragPosition = (drag: FloatingPanelDrag, clientX: number, clientY: number) => {
    setPosition({
      x: clampFloatingPanel(drag.startX + clientX - drag.startClientX, drag.maxX),
      y: clampFloatingPanel(drag.startY + clientY - drag.startClientY, drag.maxY)
    });
  };

  const releaseResize = (resize: FloatingPanelResize) => {
    try {
      resize.handle.releasePointerCapture(resize.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const updateResizeSize = (resize: FloatingPanelResize, clientX: number, clientY: number) => {
    setSize({
      width: clampFloatingPanelSize(resize.startWidth + clientX - resize.startClientX, resize.minWidth, resize.maxWidth),
      height: clampFloatingPanelSize(resize.startHeight + clientY - resize.startClientY, resize.minHeight, resize.maxHeight)
    });
  };

  const endCurrentDrag = (event?: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (event && drag.pointerId !== event.pointerId) return;
    if (event) updateDragPosition(drag, event.clientX, event.clientY);
    dragRef.current = null;
    releaseDrag(drag);
  };

  const endCurrentResize = (event?: PointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    if (event && resize.pointerId !== event.pointerId) return;
    if (event) updateResizeSize(resize, event.clientX, event.clientY);
    resizeRef.current = null;
    releaseResize(resize);
  };

  useEffect(() => {
    const endWindowPointer = (event: PointerEvent) => {
      endCurrentDrag(event);
      endCurrentResize(event);
    };
    const cancelWindowPointer = (event: PointerEvent) => {
      endCurrentDrag(event);
      endCurrentResize(event);
    };
    const endPointerOnBlur = () => {
      endCurrentDrag();
      endCurrentResize();
    };
    window.addEventListener("pointerup", endWindowPointer);
    window.addEventListener("pointercancel", cancelWindowPointer);
    window.addEventListener("blur", endPointerOnBlur);
    return () => {
      window.removeEventListener("pointerup", endWindowPointer);
      window.removeEventListener("pointercancel", cancelWindowPointer);
      window.removeEventListener("blur", endPointerOnBlur);
    };
  }, []);

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDragPosition(drag, event.clientX, event.clientY);
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    updateResizeSize(resize, event.clientX, event.clientY);
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture if the pointer left the viewport.
    }
  };

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLElement>, deltaWidth: number, deltaHeight: number) => {
    const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
    if (!panel) return;
    const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const maxWidth = containerRect.right - panelRect.left - 8;
    const maxHeight = containerRect.bottom - panelRect.top - 8;
    setSize((current) => ({
      width: clampFloatingPanelSize(current.width + deltaWidth, minWidth, maxWidth),
      height: clampFloatingPanelSize(current.height + deltaHeight, minHeight, maxHeight)
    }));
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    style,
    dragHandleProps: {
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest("button,input,select,textarea,a")) return;
        const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
        if (!panel) return;
        const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
        const panelRect = panel.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        dragRef.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: panelRect.left - containerRect.left,
          startY: panelRect.top - containerRect.top,
          maxX: containerRect.width - 48,
          maxY: containerRect.height - 48
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (event.buttons === 0) {
          endDrag(event);
          return;
        }
        updateDragPosition(drag, event.clientX, event.clientY);
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag
    },
    resizeHandleProps: {
      onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
        const step = event.shiftKey ? 48 : 16;
        if (event.key === "ArrowRight") resizeByKeyboard(event, step, 0);
        else if (event.key === "ArrowLeft") resizeByKeyboard(event, -step, 0);
        else if (event.key === "ArrowDown") resizeByKeyboard(event, 0, step);
        else if (event.key === "ArrowUp") resizeByKeyboard(event, 0, -step);
      },
      onPointerDown(event: ReactPointerEvent<HTMLElement>) {
        if (event.button !== 0) return;
        const panel = event.currentTarget.closest<HTMLElement>(".movable-panel");
        if (!panel) return;
        const container = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : document.documentElement;
        const panelRect = panel.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        dragRef.current = null;
        resizeRef.current = {
          pointerId: event.pointerId,
          handle: event.currentTarget,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startWidth: panelRect.width,
          startHeight: panelRect.height,
          minWidth,
          minHeight,
          maxWidth: containerRect.right - panelRect.left - 8,
          maxHeight: containerRect.bottom - panelRect.top - 8
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      },
      onPointerMove(event: ReactPointerEvent<HTMLElement>) {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== event.pointerId) return;
        if (event.buttons === 0) {
          endResize(event);
          return;
        }
        updateResizeSize(resize, event.clientX, event.clientY);
      },
      onPointerUp: endResize,
      onPointerCancel: endResize
    }
  };
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    campaigns: [],
    organizations: [],
    organizationMembers: [],
    organizationInvites: [],
    members: [],
    scenes: [],
    fogPresets: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    journals: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    audioTracks: [],
    encounters: [],
    combats: [],
    combatAudit: [],
    proposals: [],
    contentImports: [],
    memory: [],
    aiThreads: [],
    aiToolCalls: [],
    plugins: [],
    systems: [],
    characterTemplates: []
  });
  const [currentUserId, setCurrentUserId] = useState(getSessionUserId());
  const [sessionToken, setSessionToken] = useState(getSessionToken());
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [campaignId, setCampaignId] = useState(() => initialStoredId("otte:selectedCampaignId", "camp_demo"));
  const [sceneId, setSceneId] = useState(() => initialStoredId("otte:selectedSceneId", "scn_vault_entry"));
  const [selectedTokenId, setSelectedTokenIdState] = useState("tok_valen");
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>(["tok_valen"]);
  const [selectedBoardAssetId, setSelectedBoardAssetId] = useState("");
  const [activeTokenLayer, setActiveTokenLayer] = useState<TokenLayer>("player");
  const [boardUndoStack, setBoardUndoStack] = useState<BoardHistoryAction[]>([]);
  const [boardRedoStack, setBoardRedoStack] = useState<BoardHistoryAction[]>([]);
  const [boardClipboardTokens, setBoardClipboardTokens] = useState<Token[]>([]);
  const boardSyncQueueRef = useRef(Promise.resolve());
  const [battleMapZoom, setBattleMapZoom] = useState(1);
  const [fogBrushMode, setFogBrushMode] = useState<FogMode | null>(null);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>(null);
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false);
  const [annotationLayer, setAnnotationLayer] = useState<SceneAnnotationLayer>("measurement");
  const [visibleAnnotationLayers, setVisibleAnnotationLayers] = useState<Record<SceneAnnotationLayer, boolean>>({ measurement: true, effects: true, drawings: true, notes: true });
  const [annotationGroupLabel, setAnnotationGroupLabel] = useState("Session prep");
  const [annotationGroupColor, setAnnotationGroupColor] = useState("#f97316");
  const [templateShape, setTemplateShape] = useState<SceneTemplateShape>("circle");
  const [templateSaveAbility, setTemplateSaveAbility] = useState("dexterity");
  const [templateSaveDc, setTemplateSaveDc] = useState("");
  const [templateDamageFormula, setTemplateDamageFormula] = useState("");
  const [templateDamageType, setTemplateDamageType] = useState("");
  const [annotationSnapToGrid, setAnnotationSnapToGrid] = useState(true);
  const [tab, setTab] = useState<InspectorTab>("actors");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("live");
  const [manageCategory, setManageCategory] = useState<ManageCategoryId>("campaign");
  const [status, setStatus] = useState("Loading campaign");
  const [diceFormula, setDiceFormula] = useState("1d20+5");
  const [diceVisibility, setDiceVisibility] = useState<DiceRoll["visibility"]>("public");
  const [savedDiceFormulas, setSavedDiceFormulas] = useState<string[]>(initialSavedDiceFormulas);
  const [chatBody, setChatBody] = useState("");
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => initialUiTheme((key) => window.localStorage.getItem(key)));
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [dice3dEnabled, setDice3dEnabled] = useState(() => initialDice3dEnabled((key) => window.localStorage.getItem(key), dice3dPreferenceEnvironment()));
  const [activeDiceCasts, setActiveDiceCasts] = useState<DiceCastPlan[]>([]);
  const [concealedRollIds, setConcealedRollIds] = useState<Set<string>>(() => new Set());
  const seenCastRollIdsRef = useRef<Set<string> | null>(null);
  const diceBoxFallbackNoticeRef = useRef(false);
  const dice3dEnabledRef = useRef(dice3dEnabled);
  const diceRevealTimersRef = useRef<Map<string, number>>(new Map());
  const diceRevealStatusesRef = useRef<Map<string, string>>(new Map());
  dice3dEnabledRef.current = dice3dEnabled;
  const [aiPrompt, setAiPrompt] = useState("Draft a balanced vault guardian encounter for this party.");
  const [aiMapPrompt, setAiMapPrompt] = useState("Generate a gridless top-down ember vault battlemap with broken pillars, lava-lit channels, and clear tactical lanes. Do not draw square grids, coordinates, tokens, labels, or UI overlays.");
  const [aiTokenPrompt, setAiTokenPrompt] = useState("Generate token art for this character with a clean silhouette, readable equipment, and no text.");
  const [aiGenerationJobs, setAiGenerationJobs] = useState<AiGenerationJob[]>([]);
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [audioSoundboardOpen, setAudioSoundboardOpen] = useState(false);
  const [mapDockOpen, setMapDockOpen] = useState(() => initialStoredPanelFlag(mapDockOpenStorageKey, false));
  const [quickCreateOpen, setQuickCreateOpen] = useState(() => initialStoredPanelFlag(quickCreateOpenStorageKey, false));
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState<{ type: "annotation" | "wall" | "light"; id: string } | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; tone: "info" | "error" }>>([]);
  const toastIdRef = useRef(0);
  const lastToastStatusRef = useRef("");
  const toggleMapDock = () => {
    setMapDockOpen((open) => {
      const next = !open;
      persistStoredPanelFlag(mapDockOpenStorageKey, next);
      return next;
    });
  };
  const toggleQuickCreate = () => {
    setQuickCreateOpen((open) => {
      const next = !open;
      persistStoredPanelFlag(quickCreateOpenStorageKey, next);
      return next;
    });
  };
  const [audioMasterVolume, setAudioMasterVolume] = useState(0.8);
  const [audioMuted, setAudioMuted] = useState(false);
  const [aiAgentPrompt, setAiAgentPrompt] = useState("");
  const [aiAgentApprovalMode, setAiAgentApprovalMode] = useState<AiAgentApprovalMode>("manual");
  const [aiAgentHistoryKey, setAiAgentHistoryKey] = useState(() => aiAgentHistoryStorageKey(campaignId, currentUserId));
  const [aiAgentMessages, setAiAgentMessages] = useState<AiAgentMessage[]>(() => initialAiAgentMessages(aiAgentHistoryStorageKey(campaignId, currentUserId)));
  const [aiAgentBusy, setAiAgentBusy] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState("Agent ready");
  const [aiAgentCodexAuth, setAiAgentCodexAuth] = useState<AiAgentCodexAuthPrompt | null>(null);
  const [aiAgentHiddenProposalIds, setAiAgentHiddenProposalIds] = useState<Set<string>>(() => new Set());
  const aiAgentAbortRef = useRef<AbortController | null>(null);
  const aiAgentAuthRetryTimerRef = useRef<number | null>(null);
  const aiAgentAuthRetryStartedAtRef = useRef(0);
  const aiAgentPendingAuthRequestRef = useRef<AiAgentPendingAuthRequest | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("player");
  const [inviteToken, setInviteToken] = useState("");
  const [desktopAvailable] = useState(() => Boolean(window.otteDesktop));
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [desktopShareBusy, setDesktopShareBusy] = useState(false);
  const [joinToken, setJoinToken] = useState(initialInviteToken);
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [publicRegistration, setPublicRegistration] = useState(true);
  const [blankCanvasDemoOpen, setBlankCanvasDemoOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("Sign in required");
  const [resetMode, setResetMode] = useState(initialResetMode());
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState(initialResetToken());
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetStatus, setResetStatus] = useState("Ready");
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapCampaignName, setBootstrapCampaignName] = useState("First Campaign");
  const [bootstrapStatus, setBootstrapStatus] = useState("Checking setup");
  const [accountStatus, setAccountStatus] = useState("Account ready");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [mfaInfo, setMfaInfo] = useState<MfaInfo>();
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot>();
  const [adminStatus, setAdminStatus] = useState("Admin idle");
  const [encounterPlan, setEncounterPlan] = useState<EncounterPlanInfo>();
  const [encounterBuilderOpen, setEncounterBuilderOpen] = useState(false);
  const [importedActor, setImportedActor] = useState<Actor>();
  const [createdMonster, setCreatedMonster] = useState<Actor>();
  const [importStatus, setImportStatus] = useState("No archive imported this session");
  const [archiveImportMode, setArchiveImportMode] = useState<ArchiveImportMode>("upsert");
  const [archiveImportScope, setArchiveImportScope] = useState<ArchiveImportScope>("all");
  const [archiveImportCollections, setArchiveImportCollections] = useState<ArchiveImportCollection[]>(["assets"]);
  const archiveImportModeRef = useRef<ArchiveImportMode>("upsert");
  const archiveImportScopeRef = useRef<ArchiveImportScope>("all");
  const archiveImportCollectionsRef = useRef<ArchiveImportCollection[]>(["assets"]);
  const [archiveImportReport, setArchiveImportReport] = useState<CampaignImportResult>();
  const [archiveImportReportFileName, setArchiveImportReportFileName] = useState("");
  const [archiveRollbackSnapshot, setArchiveRollbackSnapshot] = useState<CampaignArchive>();
  const [archiveRollbackFileName, setArchiveRollbackFileName] = useState("");
  const [archiveExportScope, setArchiveExportScope] = useState<ArchiveExportScope>("campaign");
  const [archiveExportVersion, setArchiveExportVersion] = useState<ArchiveExportVersion>("0.2.0");
  const [archiveRedactionMode, setArchiveRedactionMode] = useState<ArchiveRedactionMode>("portable");
  const [archiveExportStatus, setArchiveExportStatus] = useState("No archive exported this session");
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [failedArchiveImport, setFailedArchiveImport] = useState<FailedArchiveImport | undefined>();
  const [contentImportKind, setContentImportKind] = useState<ContentImportEntityKind>("journal");
  const [contentImportName, setContentImportName] = useState("");
  const [contentImportBody, setContentImportBody] = useState("");
  const [contentImportStatus, setContentImportStatus] = useState("No content import previewed this session");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatus, setAssetStatus] = useState("No asset action this session");
  const [failedAssetUpload, setFailedAssetUpload] = useState<FailedAssetUpload | undefined>();
  const [assetLifecycleReason, setAssetLifecycleReason] = useState("Managed from asset library");
  const [assetFolder, setAssetFolder] = useState("maps");
  const [assetTags, setAssetTags] = useState("map");
  const [canvasAssetId, setCanvasAssetId] = useState("");
  const [canvasAssetFolder, setCanvasAssetFolder] = useState("all");
  const [canvasAssetSearch, setCanvasAssetSearch] = useState("");
  const [canvasAssetPlacementCount, setCanvasAssetPlacementCount] = useState(1);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [newCampaignSystemId, setNewCampaignSystemId] = useState("dnd-5e-srd");
  const [newCampaignVisibility, setNewCampaignVisibility] = useState<Campaign["visibility"]>("private");
  const [setupSceneName, setSetupSceneName] = useState("Opening Scene");
  const [setupSceneFolder, setSetupSceneFolder] = useState("session-0");
  const [setupSceneWidth, setSetupSceneWidth] = useState(1200);
  const [setupSceneHeight, setSetupSceneHeight] = useState(800);
  const [setupSceneGridSize, setSetupSceneGridSize] = useState(50);
  const [setupStarterContent, setSetupStarterContent] = useState(true);
  const [setupInviteEnabled, setSetupInviteEnabled] = useState(false);
  const [setupInviteEmail, setSetupInviteEmail] = useState("");
  const [setupInviteRole, setSetupInviteRole] = useState<UserRole>("player");
  const [setupPermissionTemplate, setSetupPermissionTemplate] = useState<CampaignPermissionTemplateId>("standard");
  const [setupOnboardingTitle, setSetupOnboardingTitle] = useState("Welcome to the Table");
  const [setupOnboardingBody, setSetupOnboardingBody] = useState("Use this handout for table rules, safety notes, and first-session goals.");
  const setupDefaultsAppliedRef = useRef("");
  const [campaignEditName, setCampaignEditName] = useState("");
  const [campaignEditDescription, setCampaignEditDescription] = useState("");
  const [campaignEditSystemId, setCampaignEditSystemId] = useState("dnd-5e-srd");
  const [campaignEditVisibility, setCampaignEditVisibility] = useState<Campaign["visibility"]>("private");
  const [campaignDeleteConfirm, setCampaignDeleteConfirm] = useState("");
  const [newSceneName, setNewSceneName] = useState("");
  const [newSceneFolder, setNewSceneFolder] = useState("prep");
  const [newSceneWidth, setNewSceneWidth] = useState(1200);
  const [newSceneHeight, setNewSceneHeight] = useState(800);
  const [newSceneGridSize, setNewSceneGridSize] = useState(50);
  const [newSceneActive, setNewSceneActive] = useState(true);
  const [newSceneBackgroundAssetId, setNewSceneBackgroundAssetId] = useState("");
  const [sceneEditName, setSceneEditName] = useState("");
  const [sceneEditFolder, setSceneEditFolder] = useState("");
  const [sceneEditWidth, setSceneEditWidth] = useState(1200);
  const [sceneEditHeight, setSceneEditHeight] = useState(800);
  const [sceneEditGridSize, setSceneEditGridSize] = useState(50);
  const [sceneEditActive, setSceneEditActive] = useState(false);
  const [sceneEditBackgroundAssetId, setSceneEditBackgroundAssetId] = useState("");
  const [sceneEditGridOverlayVisible, setSceneEditGridOverlayVisible] = useState(true);
  const [sceneEditDirty, setSceneEditDirty] = useState(false);
  const [sceneDuplicateName, setSceneDuplicateName] = useState("");
  const [sceneFolderFilter, setSceneFolderFilter] = useState("all");
  const [sceneSearch, setSceneSearch] = useState("");
  const [bulkSceneFolder, setBulkSceneFolder] = useState("");
  const [selectedPrepSceneIds, setSelectedPrepSceneIds] = useState<string[]>([]);
  const newSceneCellSummary = sceneGridCellSummary(newSceneWidth, newSceneHeight, newSceneGridSize);
  const sceneEditCellSummary = sceneGridCellSummary(sceneEditWidth, sceneEditHeight, sceneEditGridSize);
  const [sceneDeleteConfirm, setSceneDeleteConfirm] = useState("");
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenActorId, setNewTokenActorId] = useState("");
  const [newTokenDisposition, setNewTokenDisposition] = useState<Token["disposition"]>("neutral");
  const [newTokenFootprintCells, setNewTokenFootprintCells] = useState(1);
  const [newJournalTitle, setNewJournalTitle] = useState("");
  const [newJournalBody, setNewJournalBody] = useState("");
  const [newJournalVisibility, setNewJournalVisibility] = useState<Visibility>("gm_only");
  const [newJournalTags, setNewJournalTags] = useState("prep");
  const [chatReplyToMessageId, setChatReplyToMessageId] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatTypeFilter, setChatTypeFilter] = useState<MessageType | "all">("all");
  const [chatVisibilityFilter, setChatVisibilityFilter] = useState<ChatMessage["visibility"] | "all">("all");
  const [actorActionTargetId, setActorActionTargetId] = useState("");
  const [actorActionApplyEffect, setActorActionApplyEffect] = useState(false);
  const [actorActionConsumeResources, setActorActionConsumeResources] = useState(true);
  const [compendiumEntries, setCompendiumEntries] = useState<RulesCompendiumEntry[]>([]);
  const [compendiumSearch, setCompendiumSearch] = useState("");
  const [compendiumStatus, setCompendiumStatus] = useState("No compendium entry imported this session");
  const [advancementOptions, setAdvancementOptions] = useState<AdvancementOptionInfo[]>([]);
  const [advancementGrantsFeat, setAdvancementGrantsFeat] = useState(false);
  const [advancementFeats, setAdvancementFeats] = useState<Array<{ id: string; name: string; category: string; summary: string }>>([]);
  const [multiclassOptions, setMulticlassOptions] = useState<Array<{ className: string; eligible: boolean; reasons: string[] }>>([]);
  const [xpProgress, setXpProgress] = useState<XpProgressInfo | undefined>(undefined);
  const [advancementModalOpen, setAdvancementModalOpen] = useState(false);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [characterOrigins, setCharacterOrigins] = useState<CharacterOriginsInfo | undefined>(undefined);
  const [fogPresetName, setFogPresetName] = useState("");
  const [fogPresetMode, setFogPresetMode] = useState<"replace" | "append">("replace");
  const [visionSampleX, setVisionSampleX] = useState("");
  const [visionSampleY, setVisionSampleY] = useState("");
  const [toolReport, setToolReport] = useState("");
  const [toolReportTitle, setToolReportTitle] = useState("Fog and vision");
  const fogToolPanel = useMovablePanel({ x: 88, y: 24 }, { width: 320, height: 240 }, { minWidth: 280, minHeight: 160 });
  const annotationToolPanel = useMovablePanel({ x: 88, y: 24 }, { width: 312, height: 480 }, { minWidth: 280, minHeight: 280 });
  const [canvasAssetDragging, setCanvasAssetDragging] = useState(false);
  const [partyDropTargetActorId, setPartyDropTargetActorId] = useState("");
  const tokenDropHandledRef = useRef(false);
  const blankCanvasDemoIdRef = useRef(0);
  const realtimeSelectionRef = useRef({ campaignId, sceneId });
  const realtimeRefreshRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const realtimeBoardCaptureHandlerRef = useRef<(data: unknown) => boolean>(() => false);
  const realtimeApplyRef = useRef<(data: unknown) => void>(() => {});
  const hpAdjustRef = useRef<Map<string, { current: number; max: number; timer: number }>>(new Map());
  const actorConditionQueueRef = useRef<Map<string, Promise<Actor | undefined>>>(new Map());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  realtimeSelectionRef.current = { campaignId, sceneId };
  const realtimeConnectionKey = realtimeConnectionIdentity({ blankCanvasDemoOpen, campaignId, sessionToken });

  const selectedCampaign = snapshot.campaigns.find((campaign) => campaign.id === campaignId);
  const activeOrganizationId = snapshot.session?.organization?.id ?? snapshot.session?.session?.activeOrganizationId ?? snapshot.organizations[0]?.id ?? "";
  const currentMember = snapshot.members.find((member) => member.user.id === currentUserId);
  const hasPermission = (permission: PermissionName) => currentMember?.permissions.includes(permission) ?? false;
  const orderedScenes = [...snapshot.scenes].sort(compareScenesForDisplay);
  const accessibleScenes = hasPermission("scene.update") ? orderedScenes : orderedScenes.filter((scene) => scene.active);
  const sceneFolderOptions = useMemo(() => [...new Set(accessibleScenes.map((scene) => scene.folder?.trim()).filter((folder): folder is string => Boolean(folder)))].sort((left, right) => left.localeCompare(right)), [accessibleScenes]);
  const sceneFolderCounts = accessibleScenes.reduce<Record<string, number>>((counts, scene) => {
    const folder = scene.folder?.trim() || "Unfiled";
    counts[folder] = (counts[folder] ?? 0) + 1;
    return counts;
  }, {});
  const normalizedSceneSearch = sceneSearch.trim().toLocaleLowerCase();
  const visibleScenes = accessibleScenes
    .filter((scene) => sceneFolderFilter === "all" || scene.folder === sceneFolderFilter)
    .filter((scene) => !normalizedSceneSearch || [scene.name, scene.folder ?? "", scene.id].some((value) => value.toLocaleLowerCase().includes(normalizedSceneSearch)));
  const selectedPrepScenes = visibleScenes.filter((scene) => selectedPrepSceneIds.includes(scene.id));
  const selectedScene = accessibleScenes.find((scene) => scene.id === sceneId) ?? accessibleScenes.find((scene) => scene.active);
  const selectedSceneIndex = orderedScenes.findIndex((scene) => scene.id === selectedScene?.id);
  const campaignImageAssets = snapshot.assets.filter(isUsableImageAsset).sort((left, right) => left.name.localeCompare(right.name));
  const canvasAssetFolderOptions = [...new Set(campaignImageAssets.map((asset) => normalizeAssetFolderPath(asset.folder)).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const normalizedCanvasAssetSearch = canvasAssetSearch.trim().toLocaleLowerCase();
  const visibleCanvasImageAssets = campaignImageAssets
    .filter((asset) => assetMatchesFolderFilter(asset, canvasAssetFolder))
    .filter((asset) => !normalizedCanvasAssetSearch || [asset.name, asset.folder ?? "", ...(asset.tags ?? [])].some((value) => value.toLocaleLowerCase().includes(normalizedCanvasAssetSearch)));
  const selectedMapAsset = snapshot.assets.find((asset) => asset.id === selectedScene?.backgroundAssetId);
  const selectedCanvasAsset = visibleCanvasImageAssets.find((asset) => asset.id === canvasAssetId);
  const selectedToken = snapshot.tokens.find((token) => token.id === selectedTokenId && (!selectedScene || token.sceneId === selectedScene.id));
  const selectedTokenIdSet = useMemo(() => new Set(selectedTokenIds), [selectedTokenIds]);
  const selectedTokens = snapshot.tokens.filter((token) => selectedTokenIdSet.has(token.id) && (!selectedScene || token.sceneId === selectedScene.id));
  const selectedBoardAsset = snapshot.assets.find((asset) => asset.id === selectedBoardAssetId && asset.campaignId === campaignId);
  const aiAgentSelectedAssetId = selectedToken?.imageAssetId ?? selectedBoardAsset?.id ?? selectedCanvasAsset?.id ?? selectedMapAsset?.id;
  const canDeleteSelectedBoardTokens = hasPermission("token.delete");
  const sessionPulseStatus = status.toLowerCase().includes("realtime") || status.toLowerCase().includes("connected")
    ? "Connected"
    : status.toLowerCase().includes("loading")
      ? "Loading"
      : "Ready";
  const activeSystemId = snapshot.systems.find((system) => system.active)?.id ?? selectedCampaign?.defaultSystemId;
  const selectedActor = snapshot.actors.find((actor) => actor.id === selectedToken?.actorId) ?? snapshot.actors.find((actor) => actor.systemId === activeSystemId) ?? snapshot.actors[0];
  const adversaryActors = adversaryActorsForSceneBoard(snapshot.actors, snapshot.tokens, selectedScene?.id);
  const partyActors = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
  const activeCombat = snapshot.combats.find((combat) => combat.active);
  const currentTurnCombatant = activeCombat && activeCombat.combatants.length > 0 ? activeCombat.combatants[activeCombat.turnIndex] ?? activeCombat.combatants[0] : undefined;
  const nextTurnCombatant = activeCombat && activeCombat.combatants.length > 1 ? activeCombat.combatants[nextCombatTurnPosition(activeCombat, 1).turnIndex] : undefined;
  const currentTurnTokenIds = currentTurnCombatant?.tokenId ? [currentTurnCombatant.tokenId] : [];
  const nextTurnTokenIds = nextTurnCombatant?.tokenId && nextTurnCombatant.id !== currentTurnCombatant?.id ? [nextTurnCombatant.tokenId] : [];
  const recentEndedCombats = snapshot.combats.filter((combat) => !combat.active).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 3);
  const selectedPermissionTemplate = campaignPermissionTemplates.find((template) => template.id === setupPermissionTemplate) ?? campaignPermissionTemplates[0]!;
  const setupPreviewSceneName = setupStarterContent ? "First Session" : setupSceneName.trim() || "Opening Scene";
  const setupPreviewFolder = setupStarterContent ? "starter content" : setupSceneFolder.trim() || "no folder";
  const setupPreviewSceneWidth = setupStarterContent ? 1200 : setupSceneWidth;
  const setupPreviewSceneHeight = setupStarterContent ? 800 : setupSceneHeight;
  const setupPreviewGridSize = setupStarterContent ? 50 : setupSceneGridSize;
  const setupVisibilityLabel =
    newCampaignVisibility === "invite_only" ? "Invite only" : newCampaignVisibility === "public" ? "Public" : "Private";
  const setupInviteSummary = setupInviteEnabled
    ? `${titleCaseLabel(setupInviteRole)} invite${setupInviteEmail.trim() ? ` for ${setupInviteEmail.trim()}` : ""}`
    : "No starter invite";
  const setupOnboardingSummary = setupStarterContent
    ? "Starter content: First Session and welcome notes"
    : setupOnboardingBody.trim()
      ? `Public handout: ${setupOnboardingTitle.trim() || "Welcome to the Table"}`
      : "No onboarding handout";
  const archiveExportRecordCount = snapshot.scenes.length + snapshot.assets.length + snapshot.actors.length + snapshot.journals.length + snapshot.chat.length + snapshot.combats.length;
  const archiveCompatibilityNotes = [
    "Exports the selected campaign and related tabletop records.",
    "Archive 0.2.0 is accepted by the current v0.3/v1-compatible importer.",
    "Portable redaction strips account secrets, sessions, MFA, SCIM sources, plugin reviews, idempotency records, jobs, and organization records while preserving playable content."
  ];
  const chatRecipientOptions = snapshot.members.filter((member) => member.user.id !== currentUserId);
  const chatReplyTarget = snapshot.chat.find((message) => message.id === chatReplyToMessageId);
  const campaignDeleteImpact = selectedCampaign
    ? {
        scenes: snapshot.scenes.length,
        assets: snapshot.assets.length,
        actors: snapshot.actors.length,
        journals: snapshot.journals.length,
        chatMessages: snapshot.chat.length,
        combats: snapshot.combats.length,
        members: snapshot.members.length
      }
    : undefined;
  const sceneDeleteImpact = selectedScene
    ? {
        tokens: snapshot.tokens.filter((token) => token.sceneId === selectedScene.id).length,
        sceneChatMessages: snapshot.chat.filter((message) => message.sceneId === selectedScene.id).length,
        fogRegions: selectedScene.fog.length,
        walls: selectedScene.walls.length,
        lights: selectedScene.lights.length
      }
    : undefined;
  const sceneDeleteTarget = accessibleScenes.find((scene) => scene.id === selectedScene?.id && scene.name === sceneEditName) ?? accessibleScenes.find((scene) => scene.name === sceneEditName) ?? selectedScene;
  const sceneDeleteConfirmed = Boolean(sceneDeleteTarget && sceneEditName.trim() && sceneDeleteConfirm === sceneEditName);
  const sceneActivationHistory = [...(selectedScene?.activationHistory ?? [])].sort((left, right) => right.activatedAt.localeCompare(left.activatedAt));
  const latestSceneActivation = sceneActivationHistory[0];
  const activeScene = accessibleScenes.find((scene) => scene.active);
  const activeMapAsset = snapshot.assets.find((asset) => asset.id === activeScene?.backgroundAssetId);
  const comparedSceneAnnotations = useMemo<SceneAnnotation[]>(() => {
    const annotations = [...(selectedScene?.annotations ?? [])];
    if (activeScene && activeScene.id !== selectedScene?.id) annotations.push(...(activeScene.annotations ?? []));
    return annotations;
  }, [activeScene?.annotations, activeScene?.id, selectedScene?.annotations, selectedScene?.id]);
  const annotationExpiryNow = useAnnotationExpiryClock(comparedSceneAnnotations);
  const selectedCurrentAnnotations = useMemo(() => activeSceneAnnotations(selectedScene?.annotations, annotationExpiryNow), [annotationExpiryNow, selectedScene?.annotations]);
  const liveCurrentAnnotations = useMemo(() => activeSceneAnnotations(activeScene?.annotations, annotationExpiryNow), [activeScene?.annotations, annotationExpiryNow]);
  const selectedSceneTokens = selectedScene ? snapshot.tokens.filter((token) => token.sceneId === selectedScene.id) : [];
  const selectedSceneActiveLayerTokens = selectedSceneTokens.filter((token) => tokenLayer(token) === activeTokenLayer);
  const selectedSceneActiveLayerTokenKey = selectedSceneActiveLayerTokens.map((token) => token.id).join("|");
  const activeSceneTokens = activeScene ? snapshot.tokens.filter((token) => token.sceneId === activeScene.id) : [];
  const pendingTokenArtProposalTokenIds = useMemo(() => {
    const tokenIds = new Set<string>();
    for (const proposal of snapshot.proposals) {
      if (proposal.status !== "pending" && proposal.status !== "approved") continue;
      for (const change of proposal.changesJson) {
        if (change.entity !== "token" || change.action !== "update" || typeof change.id !== "string") continue;
        if (typeof change.data.imageAssetId === "string" && change.data.imageAssetId.trim()) tokenIds.add(change.id);
      }
    }
    return tokenIds;
  }, [snapshot.proposals]);
  const selectedSceneTokensPendingArt = selectedSceneTokens.filter((token) => !token.imageAssetId && pendingTokenArtProposalTokenIds.has(token.id));
  const selectedSceneTokensNeedingArt = selectedSceneTokens.filter((token) => !token.imageAssetId && !pendingTokenArtProposalTokenIds.has(token.id));
  const isAiGeneratingMap = aiGenerationJobs.some((job) => job.kind === "map");
  const isAiGeneratingTokenArt = aiGenerationJobs.some((job) => job.kind === "token" || job.kind === "tokenBatch");
  const selectedSceneTokenNames = selectedSceneTokens.map((token) => token.name).sort((left, right) => left.localeCompare(right));
  const activeSceneTokenNames = activeSceneTokens.map((token) => token.name).sort((left, right) => left.localeCompare(right));
  const activeSceneTokenNameSet = new Set(activeSceneTokenNames);
  const selectedSceneTokenNameSet = new Set(selectedSceneTokenNames);
  const selectedOnlyTokenNames = selectedSceneTokenNames.filter((name) => !activeSceneTokenNameSet.has(name)).slice(0, 4);
  const activeOnlyTokenNames = activeSceneTokenNames.filter((name) => !selectedSceneTokenNameSet.has(name)).slice(0, 4);
  const sceneStateComparison =
    selectedScene && activeScene
      ? [
          { label: "Dimensions", selected: `${selectedScene.width} x ${selectedScene.height} / grid ${selectedScene.gridSize}`, active: `${activeScene.width} x ${activeScene.height} / grid ${activeScene.gridSize}` },
          { label: "Tokens", selected: formatNumber(snapshot.tokens.filter((token) => token.sceneId === selectedScene.id).length), active: formatNumber(snapshot.tokens.filter((token) => token.sceneId === activeScene.id).length) },
          { label: "Fog", selected: formatNumber(selectedScene.fog.length), active: formatNumber(activeScene.fog.length) },
          { label: "Walls", selected: formatNumber(selectedScene.walls.length), active: formatNumber(activeScene.walls.length) },
          { label: "Lights", selected: formatNumber(selectedScene.lights.length), active: formatNumber(activeScene.lights.length) },
          { label: "Annotations", selected: formatNumber(selectedCurrentAnnotations.length), active: formatNumber(liveCurrentAnnotations.length) },
          { label: "Background", selected: selectedScene.backgroundAssetId ? "set" : "none", active: activeScene.backgroundAssetId ? "set" : "none" }
        ]
      : [];
  const sceneDiffDetails =
    selectedScene && activeScene
      ? [
          {
            label: "Active state",
            detail: selectedScene.id === activeScene.id ? "Selected scene is live for players" : "Selected scene is prep-only until activated"
          },
          {
            label: "Dimensions and grid",
            detail:
              selectedScene.width === activeScene.width && selectedScene.height === activeScene.height && selectedScene.gridSize === activeScene.gridSize
                ? "Matching dimensions and grid"
                : `${selectedScene.width}x${selectedScene.height} grid ${selectedScene.gridSize}; active ${activeScene.width}x${activeScene.height} grid ${activeScene.gridSize}`
          },
          {
            label: "Token roster",
            detail:
              selectedOnlyTokenNames.length === 0 && activeOnlyTokenNames.length === 0
                ? "No token roster drift"
                : `Selected-only ${selectedOnlyTokenNames.join(", ") || "none"}; active-only ${activeOnlyTokenNames.join(", ") || "none"}`
          },
          {
            label: "Scene tools",
            detail:
              selectedScene.fog.length === activeScene.fog.length &&
              selectedScene.walls.length === activeScene.walls.length &&
              selectedScene.lights.length === activeScene.lights.length &&
              selectedCurrentAnnotations.length === liveCurrentAnnotations.length
                ? "Fog, walls, lights, and annotations match by count"
                : `Fog ${selectedScene.fog.length}/${activeScene.fog.length}; walls ${selectedScene.walls.length}/${activeScene.walls.length}; lights ${selectedScene.lights.length}/${activeScene.lights.length}; annotations ${selectedCurrentAnnotations.length}/${liveCurrentAnnotations.length}`
          },
          {
            label: "Background asset",
            detail:
              selectedScene.backgroundAssetId === activeScene.backgroundAssetId
                ? `Matching background ${selectedMapAsset?.name ?? "none"}`
                : `${selectedMapAsset?.name ?? "none"}; active ${activeMapAsset?.name ?? "none"}`
          }
        ]
      : [];
  const sceneAnnotationHistory = [...(selectedScene?.annotationHistory ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const annotationLayerCounts = selectedCurrentAnnotations.reduce<Record<string, number>>((counts, annotation) => {
    const layer = annotation.layer ?? defaultAnnotationLayer(annotation.kind);
    counts[layer] = (counts[layer] ?? 0) + 1;
    return counts;
  }, {});
  const annotationGroupCounts = selectedCurrentAnnotations.reduce<Record<string, number>>((counts, annotation) => {
    const group = annotationGroupKey(annotation);
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
  const latestAreaTemplate = [...selectedCurrentAnnotations].reverse().find((annotation) => annotation.kind === "template");
  const canUpdateSelectedActor = hasPermission("actor.update") || (selectedActor?.ownerUserId === currentUserId && hasPermission("actor.updateOwned"));
  const activeOrganization = snapshot.organizations.find((organization) => organization.id === activeOrganizationId);
  const canManageActiveOrganization = activeOrganization?.role === "owner" || activeOrganization?.role === "admin";
  const canManageCampaignSettings = hasPermission("campaign.update") || hasPermission("campaign.delete") || canManageActiveOrganization;
  const canManagePeople = hasPermission("campaign.update") || canManageActiveOrganization;
  const canManageScenes = hasPermission("scene.create") || hasPermission("scene.update") || hasPermission("scene.delete") || hasPermission("scene.activate");
  const canManageArchives = hasPermission("campaign.update") || canManageActiveOrganization;
  const canUsePrepWorkspace = canManageScenes || hasPermission("journal.create") || hasPermission("journal.update") || hasPermission("plugin.install") || hasPermission("plugin.configure") || hasPermission("actor.create");
  const canUseAiStudioWorkspace = hasPermission("ai.proposeChanges") || hasPermission("ai.applyChanges") || hasPermission("ai.readGmMemory") || hasPermission("combat.manage");

  useEffect(() => {
    const activeLayerTokenIds = new Set(selectedSceneActiveLayerTokenKey ? selectedSceneActiveLayerTokenKey.split("|") : []);
    setSelectedTokenIds((current) => {
      const next = current.filter((id) => activeLayerTokenIds.has(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      return next;
    });
    setSelectedTokenIdState((current) => (current && activeLayerTokenIds.has(current) ? current : ""));
  }, [activeTokenLayer, selectedScene?.id, selectedSceneActiveLayerTokenKey]);

  useEffect(() => {
    if (!selectedBoardAssetId) return;
    const exists = snapshot.assets.some((asset) => asset.id === selectedBoardAssetId && asset.campaignId === campaignId && asset.lifecycle?.status !== "deleted");
    const backgroundStillSelectable = activeTokenLayer === "map" && selectedScene?.backgroundAssetId === selectedBoardAssetId;
    if (!exists || (!backgroundStillSelectable && selectedBoardAssetId === selectedScene?.backgroundAssetId)) setSelectedBoardAssetId("");
  }, [activeTokenLayer, campaignId, selectedBoardAssetId, selectedScene?.backgroundAssetId, snapshot.assets]);

  useEffect(() => {
    setSelectedOverlay(null);
  }, [selectedScene?.id]);

  useEffect(() => {
    const handleBoardKeyboard = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedOverlay && selectedTokens.length === 0 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
        event.preventDefault();
        const overlayTask =
          selectedOverlay.type === "wall" ? deleteSceneWall(selectedOverlay.id) :
          selectedOverlay.type === "light" ? deleteSceneLight(selectedOverlay.id) :
          (() => {
            const annotation = selectedCurrentAnnotations.find((item) => item.id === selectedOverlay.id);
            return annotation ? deleteSceneAnnotation(annotation) : Promise.resolve();
          })();
        overlayTask.then(() => setSelectedOverlay(null)).catch((error) => setStatus(errorMessage(error)));
        return;
      }
      const action = boardKeyboardAction(event, {
        selectedCount: selectedTokens.length,
        canDelete: canDeleteSelectedBoardTokens,
        canCopy: selectedTokens.length > 0,
        canPaste: boardClipboardTokens.length > 0 && hasPermission("token.create"),
        undoCount: boardUndoStack.length,
        redoCount: boardRedoStack.length
      });
      if (!action) return;
      event.preventDefault();
      const task =
        action === "delete-selected" ? deleteSelectedBoardTokens() :
        action === "undo" ? undoBoardAction() :
        action === "redo" ? redoBoardAction() :
        action === "copy" ? copySelectedBoardTokens() :
        pasteBoardClipboardTokens();
      task.catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
    };
    window.addEventListener("keydown", handleBoardKeyboard);
    return () => window.removeEventListener("keydown", handleBoardKeyboard);
  }, [blankCanvasDemoOpen, boardClipboardTokens, boardRedoStack.length, boardUndoStack.length, canDeleteSelectedBoardTokens, selectedCurrentAnnotations, selectedOverlay, selectedScene?.id, selectedScene?.gridSize, selectedTokens]);

  const refreshSeqRef = useRef(0);
  async function refresh(nextCampaignId = campaignId, nextSceneId = sceneId, options: { syncStatus?: boolean } = {}) {
    if (blankCanvasDemoOpen) {
      setSnapshotReady(true);
      if (options.syncStatus !== false) setStatus(blankCanvasDemoNotice);
      return snapshot;
    }
    // Snapshot loads overlap constantly (every realtime event triggers one).
    // Only the most recently started refresh may apply; anything older would
    // overwrite the UI with pre-action state and make actions "revert".
    const seq = ++refreshSeqRef.current;
    const next = await loadSnapshot(nextCampaignId, nextSceneId);
    if (seq !== refreshSeqRef.current) return next;
    setSnapshot(next);
    setSessionToken(getSessionToken());
    const campaign = next.campaigns.find((item) => item.id === nextCampaignId) ?? next.campaigns[0];
    const scene = next.scenes.find((item) => item.id === nextSceneId) ?? next.scenes.find((item) => item.active) ?? next.scenes[0];
    setCampaignId((current) => (next.campaigns.some((item) => item.id === current) ? current : campaign?.id ?? ""));
    setSceneId((current) => (next.scenes.some((item) => item.id === current) ? current : scene?.id ?? ""));
    // Selection belongs to the user, not the snapshot: keep it as long as the
    // tokens still exist, auto-select only on the very first load.
    const firstLoadToken = !snapshotReady && scene ? next.tokens.find((item) => item.sceneId === scene.id) : undefined;
    setSelectedTokenIds((current) => {
      const valid = current.filter((id) => next.tokens.some((item) => item.id === id));
      if (valid.length > 0) return valid.length === current.length ? current : valid;
      return firstLoadToken ? [firstLoadToken.id] : valid;
    });
    setSelectedTokenIdState((current) => (current && next.tokens.some((item) => item.id === current) ? current : firstLoadToken?.id ?? ""));
    setSnapshotReady(true);
    if (options.syncStatus !== false) setStatus("Synced");
    return next;
  }

  // A snapshot load that started BEFORE a mutation resolved would deliver
  // pre-mutation state after we applied the authoritative response locally,
  // making the action appear to revert. Bumping the sequence discards any
  // in-flight load; the mutation's own realtime event schedules a fresh one.
  function invalidateInFlightRefreshes() {
    refreshSeqRef.current += 1;
  }

  // Apply a mutation's authoritative response to the snapshot immediately so
  // board actions feel instant. The realtime socket still fires a debounced
  // background refresh for full reconciliation (vision polygons, etc.), so we
  // never block the interaction on the ~28-request snapshot refetch.
  function applySceneToSnapshot(scene: Scene) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      scenes: current.scenes.some((item) => item.id === scene.id)
        ? current.scenes.map((item) => (item.id === scene.id ? scene : item))
        : [...current.scenes, scene]
    }));
  }

  function applyEncounterToSnapshot(encounter: Encounter) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      encounters: current.encounters.some((item) => item.id === encounter.id)
        ? current.encounters.map((item) => (item.id === encounter.id ? encounter : item))
        : [...current.encounters, encounter]
    }));
  }

  function applyTokensToSnapshot(nextTokens: Token[]) {
    if (nextTokens.length === 0) return;
    invalidateInFlightRefreshes();
    const byId = new Map(nextTokens.map((token) => [token.id, token]));
    setSnapshot((current) => ({
      ...current,
      tokens: [
        ...current.tokens.map((token) => byId.get(token.id) ?? token),
        ...nextTokens.filter((token) => !current.tokens.some((item) => item.id === token.id))
      ]
    }));
  }

  function applyItemToSnapshot(item: Item) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      items: current.items.some((candidate) => candidate.id === item.id)
        ? current.items.map((candidate) => (candidate.id === item.id ? item : candidate))
        : [...current.items, item]
    }));
  }

  function requireInteractiveSignIn(message: string) {
    clearSession();
    setSessionToken("");
    setAuthMode("login");
    setAuthRequired(true);
    setSnapshotReady(false);
    setStatus("Sign in required");
    setAuthStatus(message);
  }

  async function refreshAdmin() {
    setAdminStatus("Loading admin operations");
    const next = await loadAdminSnapshot();
    setAdminSnapshot(next);
    setAdminStatus("Admin operations synced");
  }

  async function updateOrganizationWorkspaceDefaults(input: Partial<OrganizationWorkspace>) {
    setAdminStatus("Saving workspace defaults");
    const next = await updateWorkspaceDefaults(input);
    setSnapshot((current) => ({ ...current, workspaceDefaults: next, session: current.session ? { ...current.session, organization: next } : current.session }));
    setAdminStatus("Workspace defaults saved");
  }

  async function addOrganizationMember(input: { email: string; role: Exclude<OrganizationMemberRole, "owner"> }) {
    setAdminStatus("Adding organization member");
    const member = await upsertOrganizationMember(input);
    const members = await loadOrganizationMembers();
    setSnapshot((current) => ({ ...current, organizationMembers: members }));
    setAdminStatus(`Organization member ${member.user.displayName} is ${member.role}`);
  }

  async function updateOrganizationMember(member: OrganizationMemberInfo, role: Exclude<OrganizationMemberRole, "owner">) {
    setAdminStatus("Updating organization member");
    const updated = await updateOrganizationMemberRole(member.id, role);
    const members = await loadOrganizationMembers();
    setSnapshot((current) => ({ ...current, organizationMembers: members }));
    setAdminStatus(`Organization member ${updated.user.displayName} is ${updated.role}`);
  }

  async function deleteOrganizationMember(member: OrganizationMemberInfo) {
    setAdminStatus("Removing organization member");
    const result = await removeOrganizationMember(member.id);
    const members = await loadOrganizationMembers();
    setSnapshot((current) => ({ ...current, organizationMembers: members }));
    setAdminStatus(`Organization member ${member.user.displayName} removed; ${result.removedCampaignMemberships} campaign memberships removed`);
  }

  realtimeRefreshRef.current = () => {
    const selection = realtimeSelectionRef.current;
    return refresh(selection.campaignId, selection.sceneId, { syncStatus: false });
  };
  realtimeBoardCaptureHandlerRef.current = handleBoardCaptureRealtimeEvent;
  realtimeApplyRef.current = (data: unknown) => {
    let event: { type?: string; campaignId?: string; targetId?: string; payload?: Record<string, unknown> };
    try {
      event = typeof data === "string" ? JSON.parse(data) : (data as typeof event);
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string" || event.campaignId !== campaignId) return;
    const payload = event.payload;
    if (event.type === "actor.updated" && payload && payload.redacted !== true && typeof payload.id === "string" && payload.data && typeof payload.data === "object") {
      applyActorToSnapshot(payload as unknown as Actor);
      return;
    }
    if ((event.type === "token.created" || event.type === "token.updated") && payload && payload.redacted !== true && typeof payload.id === "string" && typeof payload.sceneId === "string") {
      applyTokensToSnapshot([payload as unknown as Token]);
      return;
    }
    if (event.type === "token.deleted") {
      const tokenId = typeof payload?.id === "string" ? (payload.id as string) : event.targetId;
      if (!tokenId) return;
      invalidateInFlightRefreshes();
      setSnapshot((current) => ({ ...current, tokens: current.tokens.filter((token) => token.id !== tokenId) }));
    }
  };

  useEffect(() => {
    const defaults = snapshot.workspaceDefaults;
    if (!defaults) return;
    const defaultsKey = `${defaults.id}:${defaults.updatedAt}`;
    if (setupDefaultsAppliedRef.current === defaultsKey) return;
    setNewCampaignSystemId(defaults.defaultSystemId);
    setNewCampaignVisibility(defaults.defaultCampaignVisibility);
    setSetupSceneName(defaults.defaultSceneName);
    setSetupSceneFolder(defaults.defaultSceneFolder);
    setSetupSceneWidth(defaults.defaultSceneWidth);
    setSetupSceneHeight(defaults.defaultSceneHeight);
    setSetupSceneGridSize(defaults.defaultSceneGridSize);
    setSetupInviteRole(defaults.defaultInviteRole);
    setSetupPermissionTemplate(defaults.defaultPermissionTemplate);
    setSetupOnboardingTitle(defaults.onboardingTitle);
    setSetupOnboardingBody(defaults.onboardingBody);
    setupDefaultsAppliedRef.current = defaultsKey;
  }, [snapshot.workspaceDefaults]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistStoredId("otte:selectedCampaignId", campaignId);
  }, [blankCanvasDemoOpen, campaignId]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    const nextKey = aiAgentHistoryStorageKey(campaignId, currentUserId);
    setAiAgentHistoryKey(nextKey);
    setAiAgentMessages(initialAiAgentMessages(nextKey));
    setAiAgentHiddenProposalIds(new Set());
  }, [blankCanvasDemoOpen, campaignId, currentUserId]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistAiAgentMessages(aiAgentHistoryKey, aiAgentMessages);
  }, [blankCanvasDemoOpen, aiAgentHistoryKey, aiAgentMessages]);

  useEffect(() => () => {
    if (aiAgentAuthRetryTimerRef.current !== null) window.clearTimeout(aiAgentAuthRetryTimerRef.current);
  }, []);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistStoredId("otte:selectedSceneId", sceneId);
  }, [blankCanvasDemoOpen, sceneId]);

  useEffect(() => {
    if (blankCanvasDemoOpen || resetMode) return;
    let cancelled = false;
    loadBootstrapStatus()
      .then((bootstrap) => {
        if (cancelled) return;
        setBootstrapRequired(bootstrap.required);
        setPublicRegistration(bootstrap.publicRegistration);
        if (bootstrap.required) {
          setStatus("Owner setup required");
          setBootstrapStatus("Create the first owner account");
          return;
        }
        loadOidcConfig()
          .then((config) => setSsoEnabled(config.enabled))
          .catch(() => setSsoEnabled(false));
        const ssoUserId = consumeSsoRedirect();
        if (ssoUserId) {
          setCurrentUserId(ssoUserId);
          setSessionToken(getSessionToken());
        }
        if (!ssoUserId && !getSessionToken()) {
          setAuthRequired(true);
          setStatus("Sign in required");
          setAuthStatus(bootstrap.publicRegistration ? "" : "Sign in or use an invite link to join the beta");
          return;
        }
        refresh().catch((error) => {
          const message = errorMessage(error);
          if (isSessionAuthError(error)) {
            requireInteractiveSignIn(bootstrap.publicRegistration ? "Session expired - sign in again to continue." : "Session expired - use an invite link or sign in to continue.");
            return;
          }
          setStatus(apiOfflineStatus(message));
        });
      })
      .catch((error) => {
        if (!cancelled) setStatus(apiOfflineStatus(error));
      });
    return () => {
      cancelled = true;
    };
  }, [blankCanvasDemoOpen, resetMode]);

  useEffect(() => {
    if (!publicRegistration && authMode === "register") setAuthMode("login");
  }, [authMode, publicRegistration]);

  useEffect(() => {
    if (!desktopAvailable || !window.otteDesktop) return;
    let cancelled = false;
    const refreshDesktopStatus = async () => {
      try {
        const nextStatus = await window.otteDesktop?.getDesktopStatus();
        if (!cancelled && nextStatus) setDesktopStatus(nextStatus);
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    };
    refreshDesktopStatus().catch((error) => setStatus(errorMessage(error)));
    const timer = window.setInterval(() => {
      refreshDesktopStatus().catch((error) => setStatus(errorMessage(error)));
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktopAvailable]);

  useEffect(() => {
    if (!realtimeConnectionKey) return;
    const realtimeHandlers = createRealtimeHandlers({
      refresh: () => realtimeRefreshRef.current(),
      handleBoardCaptureEvent: (data) => realtimeBoardCaptureHandlerRef.current(data),
      applyRealtimeEvent: (data) => realtimeApplyRef.current(data),
      setStatus,
      onRefreshError: () => setStatus("Realtime refresh failed")
    });
    const stopRealtime = startRealtimeConnection({
      apiBase,
      origin: window.location.origin,
      campaignId,
      sessionToken,
      onOpen: realtimeHandlers.onOpen,
      onMessage: realtimeHandlers.onMessage,
      onUnavailable: () => setStatus("Realtime unavailable - reconnecting")
    });
    return () => {
      realtimeHandlers.dispose();
      stopRealtime();
    };
  }, [realtimeConnectionKey]);

  useEffect(() => {
    if (blankCanvasDemoOpen || workspaceMode !== "manage" || manageCategory !== "serverAdmin" || !snapshot.session?.serverAdmin) return;
    refreshAdmin().catch((error) => setAdminStatus(error instanceof Error ? error.message : String(error)));
  }, [blankCanvasDemoOpen, manageCategory, workspaceMode, snapshot.session?.serverAdmin]);

  useEffect(() => {
    if (workspaceMode === "live" && tab !== "actors" && tab !== "chat" && tab !== "combat") setTab("actors");
    if (workspaceMode === "prep" && tab !== "actors" && tab !== "journal" && tab !== "content" && tab !== "plugins") setTab("content");
    if (workspaceMode === "manage" && tab !== "actors" && tab !== "journal" && tab !== "content" && tab !== "plugins") setTab("actors");
  }, [tab, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "prep" && !canUsePrepWorkspace) setWorkspaceMode("live");
    if (workspaceMode === "ai" && !canUseAiStudioWorkspace) setWorkspaceMode("live");
  }, [canUseAiStudioWorkspace, canUsePrepWorkspace, workspaceMode]);

  useEffect(() => {
    if (!aiAgentOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAiAgentOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [aiAgentOpen]);

  useEffect(() => {
    if (workspaceMode !== "manage") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceMode("live");
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [workspaceMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    try {
      window.localStorage.setItem(uiThemeStorageKey, uiTheme);
    } catch {
      /* storage unavailable */
    }
  }, [uiTheme]);

  useEffect(() => {
    const handlePaletteShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handlePaletteShortcut);
    return () => window.removeEventListener("keydown", handlePaletteShortcut);
  }, []);

  useEffect(() => {
    const handleToolHotkeys = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (event.key === "Escape") {
        if (shortcutOverlayOpen) {
          setShortcutOverlayOpen(false);
          return;
        }
        if ((workspaceMode === "live" || workspaceMode === "prep") && (annotationTool || fogBrushMode)) {
          void Promise.resolve(selectCanvasTool()).catch((error) => setStatus(errorMessage(error)));
        }
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcutOverlayOpen((open) => !open);
        return;
      }
      if (commandPaletteOpen || (workspaceMode !== "live" && workspaceMode !== "prep")) return;
      const runTool = (action: () => void | Promise<void>) => {
        event.preventDefault();
        void Promise.resolve(action()).catch((error) => setStatus(errorMessage(error)));
      };
      switch (event.key.toLowerCase()) {
        case "v":
          runTool(() => selectCanvasTool());
          return;
        case "r":
          if (hasPermission("scene.read")) runTool(() => toggleAnnotationTool("ruler"));
          return;
        case "c":
          if (hasPermission("scene.read")) runTool(() => toggleAnnotationTool("measure-circle"));
          return;
        case "o":
          if (hasPermission("scene.read")) runTool(() => toggleAnnotationTool("measure-cone"));
          return;
        case "p":
          if (hasPermission("scene.read")) runTool(() => toggleAnnotationTool("ping"));
          return;
        case "d":
          if (hasPermission("scene.update")) runTool(() => toggleAnnotationTool("drawing"));
          return;
        case "a":
          if (hasPermission("scene.update")) runTool(() => toggleAnnotationTool("template"));
          return;
        default:
      }
    };
    window.addEventListener("keydown", handleToolHotkeys);
    return () => window.removeEventListener("keydown", handleToolHotkeys);
  });

  useEffect(() => {
    if (!snapshotReady) return;
    const text = status.trim();
    if (!text || text === lastToastStatusRef.current) return;
    lastToastStatusRef.current = text;
    if (/^(ready|loading|synced|connected|rolled)\b/i.test(text) || /realtime|reconnect|api offline/i.test(text)) return;
    const tone: "info" | "error" = /fail|error|denied|required|unable|invalid|missing|cannot|expired|unauthorized/i.test(text) ? "error" : "info";
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === "error" ? 8000 : 4000);
  }, [snapshotReady, status]);

  useEffect(() => {
    try {
      window.localStorage.setItem(dice3dStorageKey, dice3dEnabled ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
  }, [dice3dEnabled]);

  useEffect(() => {
    if (!dice3dEnabled || !snapshotReady) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const preloadTimer = window.setTimeout(() => {
      void primePhysicsDiceStage();
    }, 100);
    return () => window.clearTimeout(preloadTimer);
  }, [dice3dEnabled, snapshotReady]);

  useEffect(() => {
    if (dice3dEnabled) return;
    clearPhysicsDice();
    setActiveDiceCasts([]);
    for (const timerId of diceRevealTimersRef.current.values()) window.clearTimeout(timerId);
    diceRevealTimersRef.current.clear();
    diceRevealStatusesRef.current.clear();
    setConcealedRollIds(new Set());
  }, [dice3dEnabled]);

  useEffect(() => {
    return () => {
      for (const timerId of diceRevealTimersRef.current.values()) window.clearTimeout(timerId);
      diceRevealTimersRef.current.clear();
      diceRevealStatusesRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    if (!snapshotReady) return;
    if (!seenCastRollIdsRef.current) {
      seenCastRollIdsRef.current = new Set(snapshot.rolls.map((roll) => roll.id));
      return;
    }
    const seen = seenCastRollIdsRef.current;
    const fresh = newDiceCastRolls(snapshot.rolls, seen, Date.now());
    for (const roll of snapshot.rolls) seen.add(roll.id);
    if (!dice3dEnabled || fresh.length === 0) return;
    const casts = fresh.slice(-2).map((roll) => diceCastPlan(roll)).filter((cast) => cast.dice.length > 0);
    if (casts.length === 0) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const cast of casts) {
      if (reduceMotion) {
        setActiveDiceCasts((current) => [...current.slice(-2), cast].slice(-3));
        window.setTimeout(() => {
          setActiveDiceCasts((current) => current.filter((item) => item.rollId !== cast.rollId));
        }, cast.ttlMs);
        continue;
      }

      markDiceCastResultPending(cast.rollId);
      void castPhysicsDiceWhenReady(cast).then((physicsReady) => {
        if (!dice3dEnabledRef.current) return;
        const staged = physicsReady ? { ...cast, dice: [], settleMs: physicsDiceLabelDelayMs, ttlMs: physicsDiceLabelDelayMs + 2000 } : cast;
        if (!physicsReady && diceBoxStatus() === "unavailable" && !diceBoxFallbackNoticeRef.current) {
          diceBoxFallbackNoticeRef.current = true;
          setStatus("3D dice engine unavailable in this browser - using the layered dice cast instead (details in the browser console)");
        }
        setActiveDiceCasts((current) => [...current.slice(-2), staged].slice(-3));
        scheduleDiceCastResultReveal(staged);
        window.setTimeout(() => {
          setActiveDiceCasts((current) => current.filter((item) => item.rollId !== staged.rollId));
        }, staged.ttlMs);
      }).catch((error) => {
        if (!dice3dEnabledRef.current) return;
        console.warn("3D dice roll startup failed; using the layered dice cast instead.", error);
        setActiveDiceCasts((current) => [...current.slice(-2), cast].slice(-3));
        scheduleDiceCastResultReveal(cast);
        window.setTimeout(() => {
          setActiveDiceCasts((current) => current.filter((item) => item.rollId !== cast.rollId));
        }, cast.ttlMs);
      });
    }
  }, [dice3dEnabled, snapshot.rolls, snapshotReady]);

  useEffect(() => {
    if (!snapshot.session) return;
    if (manageCategory === "campaign" && !canManageCampaignSettings) setManageCategory("account");
    if (manageCategory === "people" && !canManagePeople) setManageCategory("account");
    if (manageCategory === "scenes" && !canManageScenes) setManageCategory("account");
    if (manageCategory === "archives" && !canManageArchives) setManageCategory("account");
    if (manageCategory === "serverAdmin" && !snapshot.session.serverAdmin) setManageCategory("account");
  }, [canManageArchives, canManageCampaignSettings, canManagePeople, canManageScenes, manageCategory, snapshot.session?.serverAdmin, snapshot.session?.user.id]);

  useEffect(() => {
    if (blankCanvasDemoOpen || !selectedActor || tab !== "actors") return;
    let cancelled = false;
    apiGet<{ entries: RulesCompendiumEntry[] }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/compendium`)
      .then((result) => {
        if (!cancelled) setCompendiumEntries(result.entries);
      })
      .catch((error) => {
        if (!cancelled) setCompendiumStatus(`Compendium unavailable: ${errorMessage(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [blankCanvasDemoOpen, campaignId, selectedActor?.id, selectedActor?.systemId, tab]);

  useEffect(() => {
    const resetAdvancement = () => {
      setAdvancementOptions([]);
      setAdvancementGrantsFeat(false);
      setAdvancementFeats([]);
      setMulticlassOptions([]);
      setXpProgress(undefined);
    };
    if (blankCanvasDemoOpen || !selectedActor) {
      resetAdvancement();
      return;
    }
    let cancelled = false;
    apiGet<{ actorId: string; options: AdvancementOptionInfo[]; grantsFeat?: boolean; feats?: Array<{ id: string; name: string; category: string; summary: string }>; multiclassOptions?: Array<{ className: string; eligible: boolean; reasons: string[] }>; xp?: XpProgressInfo }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advancement`)
      .then((result) => {
        if (cancelled) return;
        setAdvancementOptions(result.options);
        setAdvancementGrantsFeat(result.grantsFeat ?? false);
        setAdvancementFeats(result.feats ?? []);
        setMulticlassOptions(result.multiclassOptions ?? []);
        setXpProgress(result.xp);
      })
      .catch(() => {
        if (!cancelled) resetAdvancement();
      });
    return () => {
      cancelled = true;
    };
  }, [blankCanvasDemoOpen, campaignId, selectedActor?.id, selectedActor?.systemId, selectedActor?.updatedAt]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setCampaignEditName(selectedCampaign.name);
    setCampaignEditDescription(selectedCampaign.description);
    setCampaignEditSystemId(selectedCampaign.defaultSystemId);
    setCampaignEditVisibility(selectedCampaign.visibility);
    setCampaignDeleteConfirm("");
  }, [selectedCampaign?.id, selectedCampaign?.name, selectedCampaign?.description, selectedCampaign?.defaultSystemId, selectedCampaign?.visibility]);

  useEffect(() => {
    if (!selectedScene) return;
    if (sceneEditDirty) return;
    setSceneEditName(selectedScene.name);
    setSceneEditFolder(selectedScene.folder ?? "");
    setSceneEditWidth(selectedScene.width);
    setSceneEditHeight(selectedScene.height);
    setSceneEditGridSize(selectedScene.gridSize);
    setSceneEditActive(selectedScene.active);
    setSceneEditBackgroundAssetId(selectedScene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(selectedScene));
    setSceneDuplicateName(`${selectedScene.name} Copy`);
  }, [sceneEditDirty, selectedScene?.id, selectedScene?.name, selectedScene?.folder, selectedScene?.width, selectedScene?.height, selectedScene?.gridSize, selectedScene?.active, selectedScene?.backgroundAssetId, selectedScene?.metadata]);

  useEffect(() => {
    setSceneEditDirty(false);
    setSceneDeleteConfirm("");
  }, [selectedScene?.id]);

  useEffect(() => {
    if (sceneFolderFilter === "all") return;
    if (!sceneFolderOptions.includes(sceneFolderFilter)) setSceneFolderFilter("all");
  }, [sceneFolderFilter, sceneFolderOptions]);

  useEffect(() => {
    if (blankCanvasDemoOpen || authRequired || !sessionToken || !snapshot.session?.user.id) return;
    loadMfaStatus()
      .then((info) => setMfaInfo(info))
      .catch(() => setMfaInfo(undefined));
  }, [blankCanvasDemoOpen, authRequired, sessionToken, snapshot.session?.user.id]);

  async function switchSession(userId: string) {
    setSessionUserId(userId);
    const login = await loginSession(userId);
    setAuthRequired(false);
    setSessionToken(login.token);
    setCurrentUserId(userId);
    setSnapshotReady(false);
    setStatus("Switching session");
    await refresh(campaignId, sceneId);
  }

  async function switchActiveOrganization(organizationId: string) {
    const organization = snapshot.organizations.find((item) => item.id === organizationId);
    setStatus(`Switching to ${organization?.name ?? organizationId}`);
    setAccountStatus(`Switching workspace to ${organization?.name ?? organizationId}`);
    await switchOrganization(organizationId);
    await refresh("", "", { syncStatus: false });
    setStatus(`Workspace switched to ${organization?.name ?? organizationId}`);
    setAccountStatus(`Workspace switched to ${organization?.name ?? organizationId}`);
  }

  async function createWorkspace() {
    const name = newWorkspaceName.trim();
    setStatus(`Creating workspace ${name}`);
    setAccountStatus(`Creating workspace ${name}`);
    const result = await createOrganizationWorkspace({ name });
    setSnapshot((current) => ({
      ...current,
      session: current.session ? { ...current.session, organization: result.organization, session: result.session, organizations: result.organizations } : current.session,
      organizations: result.organizations,
      workspaceDefaults: result.organization
    }));
    setNewWorkspaceName("");
    await refresh("", "", { syncStatus: false });
    setStatus(`Workspace created: ${result.organization.name}`);
    setAccountStatus(`Workspace created: ${result.organization.name}`);
  }

  function nextBlankCanvasDemoId(prefix: string): string {
    blankCanvasDemoIdRef.current += 1;
    return `${prefix}_${blankCanvasDemoIdRef.current}`;
  }

  function startBlankCanvasDemo() {
    const snapshot = createBlankCanvasDemoSnapshot();
    blankCanvasDemoIdRef.current = 0;
    clearSession();
    setStatelessDemoApiMode(true);
    setSnapshot(snapshot);
    setCurrentUserId(blankCanvasDemoUserId);
    setSessionToken("");
    setSnapshotReady(true);
    setCampaignId(blankCanvasDemoCampaignId);
    setSceneId(blankCanvasDemoSceneId);
    setSelectedTokenIdState("");
    setSelectedTokenIds([]);
    setSelectedBoardAssetId("");
    setBoardUndoStack([]);
    setBoardRedoStack([]);
    setBoardClipboardTokens([]);
    setActiveTokenLayer("player");
    setBattleMapZoom(1);
    setFogBrushMode(null);
    setAnnotationTool(null);
    setTab("actors");
    setWorkspaceMode("live");
    setManageCategory("account");
    setCompendiumEntries([]);
    setAdvancementOptions([]);
    setAiAgentOpen(false);
    setAiAgentMessages([]);
    setAiAgentHiddenProposalIds(new Set());
    setAiAgentHistoryKey(aiAgentHistoryStorageKey(blankCanvasDemoCampaignId, blankCanvasDemoUserId));
    setChatBody("");
    setChatReplyToMessageId("");
    setAuthRequired(false);
    setBootstrapRequired(false);
    setBlankCanvasDemoOpen(true);
    setStatus(blankCanvasDemoNotice);
    setAuthStatus("Blank canvas demo");
  }

  function exitBlankCanvasDemo() {
    setStatelessDemoApiMode(false);
    setBlankCanvasDemoOpen(false);
    setSnapshotReady(false);
    setAuthRequired(true);
    setCurrentUserId(getSessionUserId());
    setSessionToken(getSessionToken());
    setCampaignId(initialStoredId("otte:selectedCampaignId", "camp_demo"));
    setSceneId(initialStoredId("otte:selectedSceneId", "scn_vault_entry"));
    setSelectedTokenIdState("tok_valen");
    setSelectedTokenIds(["tok_valen"]);
    setBoardUndoStack([]);
    setBoardRedoStack([]);
    setBoardClipboardTokens([]);
    setAiAgentMessages(initialAiAgentMessages(aiAgentHistoryStorageKey(initialStoredId("otte:selectedCampaignId", "camp_demo"), getSessionUserId())));
    setStatus("Sign in required");
    setAuthStatus(publicRegistration ? "" : "Sign in or use an invite link to join the beta");
  }

  async function startDemoGmSession() {
    setStatelessDemoApiMode(false);
    setBlankCanvasDemoOpen(false);
    const login = await loginSession("usr_demo_gm");
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setAuthRequired(false);
    setAuthStatus("Seeded demo signed in");
    setSnapshotReady(false);
    setCampaignId("camp_demo");
    setSceneId("scn_vault_entry");
    setSelectedTokenIdState("tok_valen");
    setSelectedTokenIds(["tok_valen"]);
    setStatus("Seeded demo signed in");
    await refresh("camp_demo");
  }

  async function submitLogin() {
    const login = await loginPasswordSession({
      email: loginEmail.trim(),
      password: loginPassword,
      mfaCode: loginMfaCode.trim() || undefined
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setAuthRequired(false);
    setLoginPassword("");
    setLoginMfaCode("");
    setAuthStatus("Signed in");
    setSnapshotReady(false);
    setStatus("Signed in");
    await refresh();
  }

  async function submitRegister() {
    const login = await registerSession({
      email: registerEmail.trim(),
      displayName: registerName.trim(),
      password: registerPassword
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setAuthRequired(false);
    setRegisterPassword("");
    setAuthStatus("Account created");
    setSnapshotReady(false);
    setStatus("Account created");
    await refresh();
  }

  async function submitLogout() {
    await logoutSession();
    setSessionToken("");
    setAuthRequired(true);
    setSnapshotReady(false);
    setSnapshot((current) => ({ ...current, session: undefined }));
    setAdminSnapshot(undefined);
    setMfaInfo(undefined);
    setStatus("Signed out");
    setAuthStatus("Signed out");
  }

  async function submitPasswordChange() {
    const login = await changePasswordSession({
      currentPassword: passwordCurrent,
      newPassword: passwordNext
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setPasswordCurrent("");
    setPasswordNext("");
    setAccountStatus("Password changed");
    await refresh(campaignId, sceneId);
  }

  async function startMfaEnrollment() {
    const result = await enrollTotpMfa({ currentPassword: mfaPassword });
    setMfaInfo(result.mfa);
    setMfaSecret(result.secret);
    setMfaRecoveryCodes([]);
    setAccountStatus("Scan or enter the TOTP secret, then confirm");
  }

  async function confirmMfaEnrollment() {
    const result = await confirmTotpMfa({ code: mfaCode.trim() });
    setMfaInfo(result.mfa);
    setMfaRecoveryCodes(result.recoveryCodes ?? []);
    setMfaPassword("");
    setMfaCode("");
    setMfaSecret("");
    setAccountStatus("MFA enabled");
  }

  async function disableMfa() {
    const result = await disableTotpMfa({
      currentPassword: mfaPassword,
      mfaCode: mfaCode.trim() || undefined
    });
    setMfaInfo(result.mfa);
    setMfaPassword("");
    setMfaCode("");
    setMfaSecret("");
    setMfaRecoveryCodes([]);
    setAccountStatus("MFA disabled");
  }

  async function startSso() {
    const login = await startOidcLogin();
    window.location.href = login.authorizationUrl;
  }

  async function submitResetRequest() {
    await requestPasswordReset(resetEmail.trim());
    setResetStatus("Reset email queued");
  }

  async function submitResetConfirm() {
    if (resetPassword !== resetPasswordConfirm) {
      setResetStatus("Passwords do not match");
      return;
    }
    const login = await confirmPasswordResetSession({
      token: resetToken.trim(),
      password: resetPassword
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setResetToken("");
    setResetPassword("");
    setResetPasswordConfirm("");
    setResetMode(false);
    setAuthRequired(false);
    clearResetUrl();
    setSnapshotReady(false);
    setStatus("Password reset complete");
    await refresh();
  }

  async function submitBootstrapOwner() {
    const login = await bootstrapOwnerSession({
      email: bootstrapEmail.trim(),
      displayName: bootstrapName.trim(),
      password: bootstrapPassword,
      campaignName: bootstrapCampaignName.trim(),
      defaultSystemId: newCampaignSystemId
    });
    setCurrentUserId(login.user.id);
    setSessionToken(login.token);
    setCampaignId(login.campaign.id);
    setSceneId(login.scene.id);
    setBootstrapPassword("");
    setBootstrapRequired(false);
    setAuthRequired(false);
    setSnapshotReady(false);
    setBootstrapStatus("Owner account ready");
    setStatus("Owner setup complete");
    await refresh(login.campaign.id, login.scene.id);
  }

  async function createInvite() {
    const result = await apiPost<InviteCreateInfo>(canManageActiveOrganization ? "/api/v1/organization/invites" : `/api/v1/campaigns/${campaignId}/invites`, {
      ...(canManageActiveOrganization ? { campaignId } : {}),
      email: inviteEmail.trim() || undefined,
      role: inviteRole
    });
    setInviteToken(result.token);
    const invites = await loadOrganizationInvites().catch(() => snapshot.organizationInvites);
    setSnapshot((current) => ({ ...current, organizationInvites: invites }));
    setStatus("Invite created");
  }

  async function startDesktopInternetShare() {
    if (!window.otteDesktop) return;
    setDesktopShareBusy(true);
    try {
      const nextStatus = await window.otteDesktop.startInternetShare({ inviteToken });
      setDesktopStatus(nextStatus);
      setStatus("Internet sharing started");
    } finally {
      setDesktopShareBusy(false);
    }
  }

  async function stopDesktopInternetShare() {
    if (!window.otteDesktop) return;
    setDesktopShareBusy(true);
    try {
      const nextStatus = await window.otteDesktop.stopInternetShare();
      setDesktopStatus(nextStatus);
      setStatus("Internet sharing stopped");
    } finally {
      setDesktopShareBusy(false);
    }
  }

  async function copyDesktopInviteLink() {
    if (!window.otteDesktop) return;
    const link = await window.otteDesktop.copyInviteLink();
    setStatus(link ? "Invite link copied" : "Start sharing before copying an invite link");
  }

  async function openDesktopDataFolder() {
    if (!window.otteDesktop) return;
    await window.otteDesktop.openDataFolder();
  }

  async function exportDesktopLogs() {
    if (!window.otteDesktop) return;
    const exportPath = await window.otteDesktop.exportLogs();
    setStatus(`Logs exported to ${exportPath}`);
  }

  async function revokeOrganizationInvite(inviteId: string) {
    const invite = await revokeInvite(inviteId);
    const invites = await loadOrganizationInvites().catch(() => snapshot.organizationInvites.map((item) => item.id === invite.id ? { ...item, ...invite } : item));
    setSnapshot((current) => ({ ...current, organizationInvites: invites }));
    setStatus("Invite revoked");
  }

  async function acceptInvite() {
    const result = await acceptInviteSession({
      token: joinToken.trim(),
      email: joinEmail.trim(),
      displayName: joinName.trim(),
      password: joinPassword
    });
    setCurrentUserId(result.user.id);
    setSessionToken(result.token);
    setAuthRequired(false);
    setCampaignId(result.campaign.id);
    setJoinToken("");
    setJoinEmail("");
    setJoinName("");
    setJoinPassword("");
    clearJoinUrl();
    setSnapshotReady(false);
    setStatus("Invite accepted");
    await refresh(result.campaign.id);
  }

  async function createCampaignFromSetup() {
    const name = newCampaignName.trim();
    if (!name) return;
    const sceneName = setupSceneName.trim() || "Opening Scene";
    const campaign = await apiPost<Campaign>("/api/v1/campaigns", {
      name,
      description: newCampaignDescription.trim(),
      defaultSystemId: newCampaignSystemId,
      visibility: newCampaignVisibility,
      permissionTemplate: setupPermissionTemplate,
      starterContent: setupStarterContent
    });
    let scene: Scene | undefined;
    if (!setupStarterContent) {
      scene = await apiPost<Scene>(`/api/v1/campaigns/${campaign.id}/scenes`, {
        name: sceneName,
        folder: setupSceneFolder.trim() || undefined,
        width: Math.max(200, setupSceneWidth),
        height: Math.max(200, setupSceneHeight),
        gridSize: Math.max(10, setupSceneGridSize),
        active: true,
        sortOrder: 1
      });
      const onboardingBody = setupOnboardingBody.trim();
      if (onboardingBody) {
        await apiPost<JournalEntry>(`/api/v1/campaigns/${campaign.id}/journal`, {
          title: setupOnboardingTitle.trim() || "Welcome to the Table",
          body: onboardingBody,
          visibility: "public",
          tags: ["onboarding", "setup"]
        });
      }
    }
    let setupInvite: InviteCreateInfo | undefined;
    if (setupInviteEnabled) {
      setupInvite = await apiPost<InviteCreateInfo>(`/api/v1/campaigns/${campaign.id}/invites`, {
        email: setupInviteEmail.trim() || undefined,
        role: setupInviteRole
      });
      setInviteToken(setupInvite.token);
      setInviteEmail(setupInviteEmail);
      setInviteRole(setupInviteRole);
    }
    setCampaignId(campaign.id);
    if (scene) setSceneId(scene.id);
    setNewCampaignName("");
    setNewCampaignDescription("");
    setSetupSceneName("Opening Scene");
    setSetupSceneFolder("session-0");
    setSetupSceneWidth(1200);
    setSetupSceneHeight(800);
    setSetupSceneGridSize(50);
    setSetupStarterContent(true);
    setSetupInviteEnabled(false);
    setSetupInviteEmail("");
    setSetupInviteRole("player");
    setSetupPermissionTemplate("standard");
    setSetupOnboardingTitle("Welcome to the Table");
    setSetupOnboardingBody("Use this handout for table rules, safety notes, and first-session goals.");
    const refreshed = await refresh(campaign.id, scene?.id ?? "", { syncStatus: false });
    const starterScene = setupStarterContent ? refreshed.scenes.find((scene) => scene.name === "First Session" && scene.active) ?? refreshed.scenes.find((scene) => scene.active) : scene;
    if (starterScene) setSceneId(starterScene.id);
    const permissionSummary = setupPermissionTemplate === "standard" ? "" : `; ${selectedPermissionTemplate.label} permissions applied`;
    const createdWith = starterScene ? ` with ${starterScene.name}` : "";
    setStatus(setupInvite ? `${campaign.name} created${createdWith}; ${setupInvite.invite.role} invite ready${permissionSummary}` : `${campaign.name} created${createdWith}${permissionSummary}`);
  }

  async function saveCampaignSettings() {
    if (!selectedCampaign) return;
    const campaign = await apiPatch<Campaign>(`/api/v1/campaigns/${selectedCampaign.id}`, {
      name: campaignEditName.trim() || selectedCampaign.name,
      description: campaignEditDescription.trim(),
      defaultSystemId: campaignEditSystemId,
      visibility: campaignEditVisibility
    });
    setStatus(`${campaign.name} updated`);
    await refresh(campaign.id, sceneId);
  }

  async function archiveSelectedCampaign() {
    if (!selectedCampaign) return;
    const campaign = await apiPost<Campaign>(`/api/v1/campaigns/${selectedCampaign.id}/archive`, {
      reason: "Archived from campaign settings"
    });
    setStatus(`${campaign.name} archived`);
    await refresh(campaign.id, sceneId);
  }

  async function restoreSelectedCampaign() {
    if (!selectedCampaign) return;
    const campaign = await apiPost<Campaign>(`/api/v1/campaigns/${selectedCampaign.id}/restore`, {
      reason: "Restored from campaign settings"
    });
    setStatus(`${campaign.name} restored`);
    await refresh(campaign.id, sceneId);
  }

  async function deleteSelectedCampaign() {
    if (!selectedCampaign || campaignDeleteConfirm !== selectedCampaign.name) return;
    const nextCampaign = snapshot.campaigns.find((campaign) => campaign.id !== selectedCampaign.id);
    await apiDelete<Campaign>(`/api/v1/campaigns/${selectedCampaign.id}`);
    setCampaignDeleteConfirm("");
    setStatus(`${selectedCampaign.name} deleted; audit logged`);
    setCampaignId(nextCampaign?.id ?? "");
    setSceneId("");
    await refresh(nextCampaign?.id ?? "", "");
  }

  function applyNewSceneSizePreset(preset: SceneSizePreset): void {
    const gridSize = Math.max(10, normalizeSceneSizeValue(newSceneGridSize, 50));
    const dimensions = sceneDimensionsFromCells(preset, gridSize);
    setNewSceneWidth(dimensions.width);
    setNewSceneHeight(dimensions.height);
  }

  function applySceneEditSizePreset(preset: SceneSizePreset): void {
    const gridSize = Math.max(10, normalizeSceneSizeValue(sceneEditGridSize, selectedScene?.gridSize ?? 50));
    const dimensions = sceneDimensionsFromCells(preset, gridSize);
    setSceneEditDirty(true);
    setSceneEditWidth(dimensions.width);
    setSceneEditHeight(dimensions.height);
  }

  function sceneFormValue(form: HTMLFormElement | undefined, name: string, fallback: string): string {
    const field = form?.elements.namedItem(name) as { value?: unknown } | null;
    if (typeof field?.value === "string") return field.value;
    return fallback;
  }

  function sceneFormChecked(form: HTMLFormElement | undefined, name: string, fallback: boolean): boolean {
    const field = form?.elements.namedItem(name) as { checked?: unknown } | null;
    if (typeof field?.checked === "boolean") return field.checked;
    return fallback;
  }

  async function createScene() {
    const name = newSceneName.trim();
    const gridSize = Math.max(10, normalizeSceneSizeValue(newSceneGridSize, 50));
    const scene = await apiPost<Scene>(`/api/v1/campaigns/${campaignId}/scenes`, {
      name: name || `Scene ${snapshot.scenes.length + 1}`,
      folder: newSceneFolder.trim() || undefined,
      width: Math.max(200, normalizeSceneSizeValue(newSceneWidth, 1200)),
      height: Math.max(200, normalizeSceneSizeValue(newSceneHeight, 800)),
      gridSize,
      backgroundAssetId: newSceneBackgroundAssetId || undefined,
      active: newSceneActive || snapshot.scenes.length === 0,
      sortOrder: orderedScenes.length + 1
    });
    setSceneId(scene.id);
    setNewSceneName("");
    setStatus(`${scene.name} created`);
    await refresh(campaignId, scene.id);
  }

  async function saveSceneSettings(form?: HTMLFormElement) {
    if (!selectedScene) return;
    const targetScene = selectedScene;
    const targetCampaignId = campaignId;
    const draftName = sceneFormValue(form, "sceneEditName", sceneEditName);
    const draftFolder = sceneFormValue(form, "sceneEditFolder", sceneEditFolder);
    const draftWidth = Number(sceneFormValue(form, "sceneEditWidth", String(sceneEditWidth)));
    const draftHeight = Number(sceneFormValue(form, "sceneEditHeight", String(sceneEditHeight)));
    const draftGridSize = Number(sceneFormValue(form, "sceneEditGridSize", String(sceneEditGridSize)));
    const draftBackgroundAssetId = sceneFormValue(form, "sceneEditBackgroundAssetId", sceneEditBackgroundAssetId);
    const draftActive = sceneFormChecked(form, "sceneEditActive", sceneEditActive);
    const draftGridOverlayVisible = sceneFormChecked(form, "sceneEditGridOverlayVisible", sceneEditGridOverlayVisible);

    const scene = await apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, {
      name: draftName.trim() || targetScene.name,
      folder: draftFolder.trim() || null,
      width: Math.max(200, normalizeSceneSizeValue(draftWidth, targetScene.width)),
      height: Math.max(200, normalizeSceneSizeValue(draftHeight, targetScene.height)),
      gridSize: Math.max(10, normalizeSceneSizeValue(draftGridSize, targetScene.gridSize)),
      backgroundAssetId: draftBackgroundAssetId || null,
      active: draftActive,
      metadata: {
        ...targetScene.metadata,
        gridOverlayVisible: draftGridOverlayVisible
      }
    });
    setSnapshot((current) => ({
      ...current,
      scenes: current.scenes.map((item) => (item.id === scene.id ? scene : item))
    }));
    setSceneEditDirty(false);
    setSceneId(scene.id);
    setSceneEditName(scene.name);
    setSceneEditFolder(scene.folder ?? "");
    setSceneEditWidth(scene.width);
    setSceneEditHeight(scene.height);
    setSceneEditGridSize(scene.gridSize);
    setSceneEditActive(scene.active);
    setSceneEditBackgroundAssetId(scene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(scene));
    setSceneDuplicateName(`${scene.name} Copy`);
    setStatus(`${scene.name} updated`);
    await refresh(targetCampaignId, scene.id, { syncStatus: false });
  }

  async function moveVisibleScenesToFolder() {
    if (visibleScenes.length === 0) {
      setStatus("No visible scenes to move");
      return;
    }
    const folder = bulkSceneFolder.trim();
    const nextSceneId = selectedScene?.id ?? visibleScenes[0]?.id ?? "";
    for (const scene of visibleScenes) {
      await apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, { folder: folder || null });
    }
    setSceneFolderFilter(folder || "all");
    setSceneSearch("");
    setStatus(`Moved ${visibleScenes.length} visible scenes to ${folder || "Unfiled"}`);
    await refresh(campaignId, nextSceneId);
  }

  function togglePrepSceneSelection(sceneIdToToggle: string, checked: boolean) {
    setSelectedPrepSceneIds((current) => {
      if (checked) return current.includes(sceneIdToToggle) ? current : [...current, sceneIdToToggle];
      return current.filter((id) => id !== sceneIdToToggle);
    });
  }

  function selectVisiblePrepScenes() {
    const nextIds = visibleScenes.map((scene) => scene.id);
    setSelectedPrepSceneIds(nextIds);
    setStatus(`Selected ${nextIds.length} visible scenes`);
  }

  function clearPrepSceneSelection() {
    setSelectedPrepSceneIds([]);
    setStatus("Cleared scene selection");
  }

  async function moveSelectedPrepScenesToFolder() {
    if (selectedPrepScenes.length === 0) {
      setStatus("No selected scenes to move");
      return;
    }
    const folder = bulkSceneFolder.trim();
    const nextSceneId = selectedScene?.id ?? selectedPrepScenes[0]?.id ?? "";
    for (const scene of selectedPrepScenes) {
      await apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, { folder: folder || null });
    }
    setSceneFolderFilter(folder || "all");
    setSceneSearch("");
    setSelectedPrepSceneIds(selectedPrepScenes.map((scene) => scene.id));
    setStatus(`Moved ${selectedPrepScenes.length} selected scenes to ${folder || "Unfiled"}`);
    await refresh(campaignId, nextSceneId);
  }

  function sceneDuplicatePayload(scene: Scene, name: string, sortOrder: number) {
    return {
      name,
      width: scene.width,
      height: scene.height,
      gridType: scene.gridType,
      gridSize: scene.gridSize,
      backgroundAssetId: scene.backgroundAssetId,
      folder: scene.folder,
      active: false,
      sortOrder,
      fog: JSON.parse(JSON.stringify(scene.fog)) as Scene["fog"],
      walls: JSON.parse(JSON.stringify(scene.walls)) as Scene["walls"],
      lights: JSON.parse(JSON.stringify(scene.lights)) as Scene["lights"],
      annotations: JSON.parse(JSON.stringify(scene.annotations ?? [])) as Scene["annotations"],
      metadata: JSON.parse(JSON.stringify(scene.metadata)) as Scene["metadata"]
    };
  }

  async function duplicateSelectedPrepScenes() {
    if (selectedPrepScenes.length === 0) {
      setStatus("No selected scenes to duplicate");
      return;
    }
    const createdScenes: Scene[] = [];
    let sortOrder = orderedScenes.length + 1;
    for (const scene of selectedPrepScenes) {
      createdScenes.push(await apiPost<Scene>(`/api/v1/campaigns/${scene.campaignId}/scenes`, sceneDuplicatePayload(scene, `${scene.name} Copy`, sortOrder)));
      sortOrder += 1;
    }
    const nextScene = createdScenes.at(-1);
    setSceneFolderFilter("all");
    setSceneSearch("");
    setSelectedPrepSceneIds(createdScenes.map((scene) => scene.id));
    if (nextScene) setSceneId(nextScene.id);
    setStatus(`Duplicated ${createdScenes.length} selected scenes`);
    await refresh(campaignId, nextScene?.id ?? selectedScene?.id ?? sceneId);
  }

  async function moveSelectedScene(direction: "up" | "down") {
    if (!selectedScene) return;
    const currentIndex = orderedScenes.findIndex((scene) => scene.id === selectedScene.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetScene = orderedScenes[targetIndex];
    if (currentIndex < 0 || !targetScene) return;
    await apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, { sortOrder: currentIndex + 1 });
    const scene = await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, { sortOrder: targetIndex + 1 });
    setStatus(`${scene.name} moved ${direction}`);
    await refresh(campaignId, scene.id);
  }

  async function activateSelectedScene() {
    if (!selectedScene) return;
    const scene = await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, { active: true });
    setSceneEditActive(true);
    setStatus(`${scene.name} activated`);
    await refresh(campaignId, scene.id);
  }

  async function duplicateSelectedScene() {
    if (!selectedScene) return;
    const scene = await apiPost<Scene>(`/api/v1/campaigns/${selectedScene.campaignId}/scenes`, sceneDuplicatePayload(selectedScene, sceneDuplicateName.trim() || `${selectedScene.name} Copy`, orderedScenes.length + 1));
    setSceneId(scene.id);
    setSceneDuplicateName(`${scene.name} Copy`);
    setStatus(`${scene.name} duplicated`);
    await refresh(campaignId, scene.id);
  }

  async function deleteScene(targetScene: Scene) {
    const previousSceneId = sceneId;
    const nextScene = accessibleScenes.find((scene) => scene.id !== targetScene.id);
    const nextSceneId = nextScene?.id ?? "";
    setSceneDeleteConfirm("");
    setSceneEditDirty(false);
    setSelectedPrepSceneIds((current) => current.filter((id) => id !== targetScene.id));
    setSceneId(nextSceneId);
    if (nextScene) {
      setSceneEditName(nextScene.name);
      setSceneEditFolder(nextScene.folder ?? "");
      setSceneEditWidth(nextScene.width);
      setSceneEditHeight(nextScene.height);
      setSceneEditGridSize(nextScene.gridSize);
      setSceneEditActive(nextScene.active);
      setSceneEditBackgroundAssetId(nextScene.backgroundAssetId ?? "");
      setSceneEditGridOverlayVisible(sceneGridOverlayVisible(nextScene));
      setSceneDuplicateName(`${nextScene.name} Copy`);
    }
    try {
      await apiDelete<Scene>(`/api/v1/scenes/${targetScene.id}`);
      setStatus(`${targetScene.name} deleted; audit logged`);
      await refresh(campaignId, nextSceneId);
    } catch (error) {
      setSceneId(previousSceneId);
      await refresh(campaignId, previousSceneId, { syncStatus: false }).catch(() => undefined);
      throw error;
    }
  }

  async function createToken(options: Partial<TokenDropPayload> & { x?: number; y?: number } = {}) {
    if (!selectedScene) return;
    const actorId = (options.actorId ?? newTokenActorId) || undefined;
    const actor = actorId ? snapshot.actors.find((item) => item.id === actorId) : undefined;
    const imageAssetId = options.imageAssetId;
    const footprintCells = Math.max(1, newTokenFootprintCells || 1);
    const width = selectedScene.gridSize * footprintCells;
    const height = selectedScene.gridSize * footprintCells;
    const centerX = options.x ?? selectedScene.width / 2;
    const centerY = options.y ?? selectedScene.height / 2;
    const position = tokenCoordinatesFromCenter(selectedScene, width, height, centerX, centerY);
    const layer = options.layer ?? activeTokenLayer;
    const tokenName = options.name?.trim() || actor?.name || newTokenName.trim() || "New Token";
    const disposition = options.disposition ?? (actor ? "friendly" : newTokenDisposition);
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const token: Token = {
        id: nextBlankCanvasDemoId("tok_demo"),
        sceneId: selectedScene.id,
        actorId,
        imageAssetId,
        name: tokenName,
        x: position.x,
        y: position.y,
        width,
        height,
        rotation: 0,
        layer,
        hidden: false,
        locked: false,
        visionEnabled: false,
        visionRadius: 0,
        disposition,
        ownerUserIds: [],
        metadata: { demo: true },
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setSnapshot((current) => ({ ...current, tokens: [...current.tokens, token] }));
      pushBoardHistoryAction({ kind: "tokens.create", tokens: [token] });
      setActiveTokenLayer(layer);
      selectSingleToken(token.id);
      setNewTokenName("");
      setNewTokenActorId("");
      setStatus(`${token.name} ${options.x !== undefined || options.y !== undefined ? "placed on scene" : "created"} for this demo tab`);
      return;
    }
    const token = await apiPost<Token>(`/api/v1/scenes/${selectedScene.id}/tokens`, {
      actorId,
      imageAssetId,
      name: tokenName,
      x: position.x,
      y: position.y,
      width,
      height,
      layer,
      disposition
    });
    applyTokensToSnapshot([token]);
    pushBoardHistoryAction({ kind: "tokens.create", tokens: [token] });
    setActiveTokenLayer(layer);
    selectSingleToken(token.id);
    setNewTokenName("");
    setNewTokenActorId("");
    setStatus(`${token.name} ${options.x !== undefined || options.y !== undefined ? "placed on scene" : "created"}`);
  }

  async function createTokenFromDrop(payload: TokenDropPayload, point: VisionPoint) {
    tokenDropHandledRef.current = true;
    await createToken({
      actorId: payload.actorId,
      imageAssetId: payload.imageAssetId,
      name: payload.name,
      layer: payload.layer ?? (payload.type === "asset" ? "map" : activeTokenLayer),
      disposition: payload.disposition,
      x: point.x,
      y: point.y
    });
  }

  async function createTokenFromAssetDragEnd(asset: MapAsset, clientX: number, clientY: number) {
    if (!selectedScene || tokenDropHandledRef.current) return;
    const board = document.querySelector(".scene-board");
    const rect = board?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    await createToken({
      imageAssetId: asset.id,
      name: asset.name,
      layer: "map",
      disposition: "neutral",
      x: Math.round(((clientX - rect.left) / rect.width) * selectedScene.width),
      y: Math.round(((clientY - rect.top) / rect.height) * selectedScene.height)
    });
  }

  async function createTokenFromAsset(asset: MapAsset) {
    await placeCanvasAssetTokens(asset, 1);
  }

  function handleBoardCaptureRealtimeEvent(data: unknown): boolean {
    const decision = boardCaptureRequestDecision(data, selectedScene?.id);
    const requestId = decision.requestId;
    if (!decision.handled || !requestId) return false;
    captureAgentBoard({ ...decision, requestId }).catch((error) => setAiAgentStatus(`Board capture failed: ${errorMessage(error)}`));
    return true;
  }

  async function captureAgentBoard(payload: BoardCaptureRequestDecision & { requestId: string }) {
    const requestId = payload.requestId;
    if (!requestId) return;
    if (payload.error) {
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: payload.error, sceneId: payload.sceneId ?? selectedScene?.id });
      setAiAgentStatus("Board capture unavailable");
      return;
    }
    const board = document.querySelector<HTMLElement>('[data-agent-board-root="true"]') ?? document.querySelector<HTMLElement>(".scene-board");
    if (!board) {
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: "No board element is mounted in the current web client.", sceneId: payload.sceneId ?? selectedScene?.id });
      setAiAgentStatus("Board capture unavailable");
      return;
    }
    try {
      setAiAgentStatus("Capturing board view");
      const dataUrl = await toPng(board, {
        cacheBust: true,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        backgroundColor: "#060a0f"
      });
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, {
        dataUrl,
        sceneId: payload.sceneId ?? selectedScene?.id,
        width: Math.round(board.offsetWidth),
        height: Math.round(board.offsetHeight)
      });
      setAiAgentStatus("Board capture sent");
    } catch (error) {
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: errorMessage(error), sceneId: payload.sceneId ?? selectedScene?.id });
      setAiAgentStatus("Board capture failed");
    }
  }

  async function placeCanvasAssetTokens(asset: MapAsset, requestedCount: number) {
    if (!selectedScene) return;
    const count = Math.max(1, Math.min(6, Math.round(requestedCount) || 1));
    const footprintCells = Math.max(1, newTokenFootprintCells || 1);
    const width = selectedScene.gridSize * footprintCells;
    const height = selectedScene.gridSize * footprintCells;
    const spacing = width + 12;
    let lastToken: Token | undefined;
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * spacing;
      const centerX = selectedScene.width / 2 + offset;
      const centerY = selectedScene.height / 2;
      const position = tokenCoordinatesFromCenter(selectedScene, width, height, centerX, centerY);
      lastToken = await apiPost<Token>(`/api/v1/scenes/${selectedScene.id}/tokens`, {
        imageAssetId: asset.id,
        name: asset.name,
        x: position.x,
        y: position.y,
        width,
        height,
        layer: "map",
        disposition: "neutral"
      });
    }
    if (lastToken) selectSingleToken(lastToken.id);
    await refresh();
    setStatus(count === 1 ? `${asset.name} placed on scene` : `Placed ${count} ${asset.name} tokens`);
  }

  function updateArchiveImportMode(value: ArchiveImportMode) {
    archiveImportModeRef.current = value;
    setArchiveImportMode(value);
  }

  function updateArchiveImportScope(value: ArchiveImportScope) {
    archiveImportScopeRef.current = value;
    setArchiveImportScope(value);
  }

  function updateArchiveImportCollection(collection: ArchiveImportCollection, checked: boolean) {
    const current = archiveImportCollectionsRef.current;
    const next = checked ? [...new Set([...current, collection])] : current.filter((item) => item !== collection);
    const safeNext = next.length > 0 ? next : current;
    archiveImportCollectionsRef.current = safeNext;
    setArchiveImportCollections(safeNext);
  }

  async function importCampaignArchive(file: File, input?: HTMLInputElement) {
    setIsImportingArchive(true);
    setImportStatus(`Importing ${file.name}`);
    setStatus("Importing archive");
    try {
      const archive = JSON.parse(await file.text()) as unknown;
      const currentImportMode = archiveImportModeRef.current;
      const currentImportScope = archiveImportScopeRef.current;
      const currentImportCollections = archiveImportCollectionsRef.current;
      if (currentImportMode !== "dry_run" && campaignId) {
        const rollback = await apiGet<CampaignArchive>(`/api/v1/campaigns/${campaignId}/export?scope=campaign&version=0.2.0&redaction=portable`);
        setArchiveRollbackSnapshot(rollback);
        setArchiveRollbackFileName(`rollback-before-${file.name}`);
      }
      const result = await apiPost<CampaignImportResult>(
        "/api/v1/import/campaign",
        currentImportMode === "upsert" && currentImportScope === "all" ? archive : { archive, mode: currentImportMode, scope: currentImportScope, collections: currentImportScope === "selected_collections" ? currentImportCollections : undefined }
      );
      setArchiveImportReport(result);
      setArchiveImportReportFileName(file.name);
      if (result.dryRun) {
        setFailedArchiveImport(undefined);
        setArchiveRollbackSnapshot(undefined);
        setArchiveRollbackFileName("");
        setImportStatus(`${file.name}: dry run ${summarizeImport(result)}; ${result.conflicts.length} conflicts`);
        setStatus(result.conflicts.length > 0 ? `Archive dry run found ${result.conflicts.length} conflicts` : "Archive dry run passed");
        return;
      }
      const nextCampaignId = result.importedCampaignIds[0] ?? campaignId;
      setFailedArchiveImport(undefined);
      setImportStatus(`${file.name}: ${summarizeImport(result)}`);
      const skippedConflicts = result.skippedConflicts?.length ?? 0;
      setStatus(skippedConflicts > 0 ? `Imported non-conflicting records; skipped ${skippedConflicts} conflicts` : result.conflicts.length > 0 ? `Imported with ${result.conflicts.length} conflicts` : "Archive imported");
      await refresh(nextCampaignId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFailedArchiveImport({ file, message });
      setImportStatus(`${file.name}: ${message}`);
      setStatus("Archive import failed");
    } finally {
      setIsImportingArchive(false);
      if (input) input.value = "";
    }
  }

  async function retryArchiveImport() {
    if (!failedArchiveImport) return;
    await importCampaignArchive(failedArchiveImport.file);
  }

  function dismissArchiveImportFailure() {
    setFailedArchiveImport(undefined);
    setImportStatus("Archive import failure dismissed");
  }

  async function updateSelectedTokenVision(patch: TokenVisionPatch) {
    if (!selectedToken) return;
    if (blankCanvasDemoOpen) {
      const normalizedPatch: Partial<Token> = {};
      if (patch.visionEnabled !== undefined) normalizedPatch.visionEnabled = patch.visionEnabled;
      if (patch.visionRadius !== undefined) normalizedPatch.visionRadius = patch.visionRadius;
      if (patch.dimVisionRadius !== undefined) normalizedPatch.dimVisionRadius = patch.dimVisionRadius;
      if (patch.brightVisionRadius !== undefined) normalizedPatch.brightVisionRadius = patch.brightVisionRadius ?? undefined;
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => (token.id === selectedToken.id ? { ...token, ...normalizedPatch, updatedAt: new Date().toISOString() } : token))
      }));
      setStatus("Token vision updated for this demo tab");
      return;
    }
    applyTokensToSnapshot([await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, patch)]);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function updateSelectedToken(patch: Partial<Token>) {
    if (!selectedToken) return;
    const statusLabel = "Token updated";
    if (blankCanvasDemoOpen) {
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => (token.id === selectedToken.id ? { ...token, ...patch, id: token.id, sceneId: token.sceneId, updatedAt: new Date().toISOString() } : token))
      }));
      setStatus(`${statusLabel} for this demo tab`);
      return;
    }
    applyTokensToSnapshot([await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, patch)]);
    setStatus(statusLabel);
  }

  function pushBoardHistoryAction(action: BoardHistoryAction) {
    const size = action.kind === "tokens.move" || action.kind === "tokens.resize" ? action.changes.length : action.tokens.length;
    if (size === 0) return;
    setBoardUndoStack((current) => [...current, action].slice(-boardHistoryLimit));
    setBoardRedoStack([]);
  }

  function tokenRestorePayload(token: Token): Partial<Token> {
    return {
      id: token.id,
      actorId: token.actorId,
      name: token.name,
      x: token.x,
      y: token.y,
      width: token.width,
      height: token.height,
      rotation: token.rotation,
      layer: token.layer,
      hidden: token.hidden,
      locked: token.locked,
      visionEnabled: token.visionEnabled,
      visionRadius: token.visionRadius,
      brightVisionRadius: token.brightVisionRadius,
      dimVisionRadius: token.dimVisionRadius,
      disposition: token.disposition,
      imageAssetId: token.imageAssetId,
      ownerUserIds: token.ownerUserIds,
      notes: token.notes,
      conditions: token.conditions,
      auras: token.auras,
      metadata: token.metadata
    };
  }

  async function persistSceneCanvasTokenMove(changes: TokenMovePersistenceChange[]) {
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const positions = new Map(changes.map(({ token, position }) => [token.id, position]));
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => {
          const position = positions.get(token.id);
          return position ? { ...token, ...position, updatedAt: timestamp } : token;
        })
      }));
      return;
    }

    const updated = await Promise.all(changes.map(({ token, position }) => apiPatch<Token>(`/api/v1/tokens/${token.id}`, position)));
    applyTokensToSnapshot(updated);
  }

  async function persistSceneCanvasTokenResize(token: Token, frame: TokenFrame) {
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((item) => (item.id === token.id ? { ...item, ...frame, updatedAt: timestamp } : item))
      }));
      return;
    }

    applyTokensToSnapshot([await apiPatch<Token>(`/api/v1/tokens/${token.id}`, frame)]);
  }

  async function createTokensOnServer(tokens: Token[]) {
    for (const token of tokens) {
      await apiPost<Token>(`/api/v1/scenes/${token.sceneId}/tokens`, tokenRestorePayload(token));
    }
  }

  async function deleteTokensOnServer(tokens: Token[]) {
    for (const token of tokens) {
      await apiDelete<Token>(`/api/v1/tokens/${token.id}`);
    }
  }

  function enqueueBoardSync(task: () => Promise<void>) {
    const run = boardSyncQueueRef.current.then(task, task);
    boardSyncQueueRef.current = run.catch((error) => {
      setStatus(`Board sync failed: ${error instanceof Error ? error.message : String(error)}`);
      refresh(campaignId, sceneId, { syncStatus: false }).catch(() => undefined);
    });
  }

  async function persistBoardHistoryAction(action: BoardHistoryAction, direction: BoardHistoryDirection) {
    if (action.kind === "tokens.move" || action.kind === "tokens.resize") {
      const target = direction === "undo" ? "before" : "after";
      for (const change of action.changes) {
        await apiPatch<Token>(`/api/v1/tokens/${change.tokenId}`, change[target]);
      }
      return;
    }

    const shouldDeleteTokens = action.kind === "tokens.create" ? direction === "undo" : direction === "redo";
    if (shouldDeleteTokens) {
      await deleteTokensOnServer(action.tokens);
      return;
    }

    await createTokensOnServer(action.tokens);
  }

  function applyLocalBoardHistory(action: BoardHistoryAction, direction: BoardHistoryDirection) {
    const result = applyLocalBoardHistoryAction(snapshot.tokens, action, direction);
    setSnapshot((current) => ({
      ...current,
      tokens: applyLocalBoardHistoryAction(current.tokens, action, direction).tokens
    }));
    selectCanvasTokens(result.selectedTokenIds);
    setStatus(boardHistoryStatus(action, direction));
    if (!blankCanvasDemoOpen) enqueueBoardSync(() => persistBoardHistoryAction(action, direction));
  }

  async function deleteTokens(tokensToDelete: Token[], options: { recordHistory: boolean; statusLabel?: string }) {
    if (tokensToDelete.length === 0) {
      setStatus("No selected token to delete");
      return;
    }
    const ids = new Set(tokensToDelete.map((token) => token.id));
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({ ...current, tokens: current.tokens.filter((token) => !ids.has(token.id)) }));
    if (options.recordHistory) pushBoardHistoryAction({ kind: "tokens.delete", tokens: tokensToDelete });
    clearTokenSelection();
    setStatus(options.statusLabel ?? `${formatNumber(tokensToDelete.length)} token${tokensToDelete.length === 1 ? "" : "s"} deleted`);
    if (!blankCanvasDemoOpen) enqueueBoardSync(() => deleteTokensOnServer(tokensToDelete));
  }

  async function deleteSelectedToken() {
    if (!selectedToken) return;
    await deleteTokens([selectedToken], { recordHistory: true, statusLabel: "Token deleted" });
  }

  async function deleteSelectedBoardTokens() {
    await deleteTokens(selectedTokens, { recordHistory: true });
  }

  function recordTokenMoveAction(changes: BoardTokenPositionChange[]) {
    pushBoardHistoryAction({ kind: "tokens.move", changes });
    setStatus(`${formatNumber(changes.length)} token${changes.length === 1 ? "" : "s"} moved`);
  }

  function recordTokenResizeAction(changes: BoardTokenFrameChange[]) {
    pushBoardHistoryAction({ kind: "tokens.resize", changes });
    setStatus(`${formatNumber(changes.length)} token${changes.length === 1 ? "" : "s"} resized`);
  }

  function boardHistoryStatus(action: BoardHistoryAction, direction: BoardHistoryDirection): string {
    if (action.kind === "tokens.move") return direction === "undo" ? "Token move undone" : "Token move redone";
    if (action.kind === "tokens.resize") return direction === "undo" ? "Token resize undone" : "Token resize redone";
    if (action.kind === "tokens.create") {
      if (direction === "undo") return action.tokens.length === 1 ? "Token creation undone" : "Token creations undone";
      return action.tokens.length === 1 ? "Token creation redone" : "Token creations redone";
    }
    if (direction === "undo") return action.tokens.length === 1 ? "Token deletion undone" : "Token deletions undone";
    return action.tokens.length === 1 ? "Token deletion redone" : "Token deletions redone";
  }

  function selectCombatantToken(combatant?: Combat["combatants"][number]) {
    if (!combatant?.tokenId) return;
    setSelectedTokenIdState(combatant.tokenId);
    setSelectedTokenIds([combatant.tokenId]);
  }

  async function undoBoardAction() {
    const action = boardUndoStack.at(-1);
    if (!action) {
      setStatus("Nothing to undo");
      return;
    }
    applyLocalBoardHistory(action, "undo");
    setBoardUndoStack((current) => current.slice(0, -1));
    setBoardRedoStack((current) => [...current, action].slice(-boardHistoryLimit));
  }

  async function redoBoardAction() {
    const action = boardRedoStack.at(-1);
    if (!action) {
      setStatus("Nothing to redo");
      return;
    }
    applyLocalBoardHistory(action, "redo");
    setBoardRedoStack((current) => current.slice(0, -1));
    setBoardUndoStack((current) => [...current, action].slice(-boardHistoryLimit));
  }

  async function copySelectedBoardTokens() {
    if (selectedTokens.length === 0) {
      setStatus("No selected token to copy");
      return;
    }
    setBoardClipboardTokens(selectedTokens);
    setStatus(`${formatNumber(selectedTokens.length)} token${selectedTokens.length === 1 ? "" : "s"} copied`);
  }

  async function pasteBoardClipboardTokens() {
    if (!selectedScene) return;
    if (boardClipboardTokens.length === 0) {
      setStatus("No copied token to paste");
      return;
    }
    if (!hasPermission("token.create")) {
      setStatus("Missing token.create permission");
      return;
    }
    const pasteSources = boardClipboardTokens.map((token) => ({ ...token, sceneId: selectedScene.id }));
    const pastedTokens = createTokenCopies(pasteSources, { offset: Math.max(16, Math.round(selectedScene.gridSize / 2)) });
    setSnapshot((current) => ({ ...current, tokens: [...current.tokens, ...pastedTokens] }));
    selectCanvasTokens(pastedTokens.map((token) => token.id));
    pushBoardHistoryAction({ kind: "tokens.create", tokens: pastedTokens });
    setStatus(`${formatNumber(pastedTokens.length)} token${pastedTokens.length === 1 ? "" : "s"} pasted`);
    if (!blankCanvasDemoOpen) enqueueBoardSync(() => createTokensOnServer(pastedTokens));
  }

  async function setTokenTarget(tokenId: string, targeted: boolean) {
    const statusLabel = targeted ? "Token targeted" : "Token untargeted";
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => {
          if (token.id !== tokenId) return token;
          const targetedBy = new Set(token.targetedByUserIds ?? []);
          if (targeted) targetedBy.add(currentUserId);
          else targetedBy.delete(currentUserId);
          return { ...token, targetedByUserIds: [...targetedBy], updatedAt: timestamp };
        })
      }));
      setStatus(`${statusLabel} for this demo tab`);
      return;
    }
    setStatus(statusLabel);
    await apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, { targeted });
    await refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
    setStatus(statusLabel);
  }

  async function setTokenTargets(tokenIds: string[], targeted: boolean) {
    const uniqueTokenIds = [...new Set(tokenIds.filter(Boolean))];
    if (uniqueTokenIds.length === 0) {
      setStatus(targeted ? "No tokens to target" : "No targets to clear");
      return;
    }
    if (blankCanvasDemoOpen) {
      const targetIds = new Set(uniqueTokenIds);
      const timestamp = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => {
          if (!targetIds.has(token.id)) return token;
          const targetedBy = new Set(token.targetedByUserIds ?? []);
          if (targeted) targetedBy.add(currentUserId);
          else targetedBy.delete(currentUserId);
          return { ...token, targetedByUserIds: [...targetedBy], updatedAt: timestamp };
        })
      }));
      setStatus(targeted ? `Targeted ${uniqueTokenIds.length} tokens for this demo tab` : `Cleared ${uniqueTokenIds.length} demo targets`);
      return;
    }
    const statusLabel = targeted ? `Targeted ${uniqueTokenIds.length} tokens` : `Cleared ${uniqueTokenIds.length} targets`;
    setStatus(statusLabel);
    for (const tokenId of uniqueTokenIds) {
      await apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, { targeted });
    }
    await refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
    setStatus(statusLabel);
  }

  async function uploadMap(file: File) {
    if (!selectedScene) return;
    await apiUploadAsset({
      campaignId,
      sceneId: selectedScene.id,
      file,
      setAsBackground: true
    });
    setStatus("Map uploaded");
    await refresh(campaignId, selectedScene.id);
  }

  async function uploadSelectedTokenImage(file: File, input?: HTMLInputElement) {
    if (!selectedCampaign || !selectedToken) return;
    setStatus(`Uploading ${file.name} for ${selectedToken.name}...`);
    try {
      const result = await apiUploadAsset({
        campaignId: selectedCampaign.id,
        sceneId: selectedScene?.id,
        file,
        folder: "tokens",
        tags: ["token"]
      });
      await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, { imageAssetId: result.asset.id });
      setStatus(`${selectedToken.name} image updated`);
      await refresh(selectedCampaign.id, selectedScene?.id ?? sceneId);
    } catch (error) {
      setStatus(`Token image upload failed: ${errorMessage(error)}`);
    } finally {
      if (input) input.value = "";
    }
  }

  async function uploadAssetToLibrary(file: File, setAsBackground: boolean, retryInput?: { folder: string; tags: string }) {
    if (!selectedCampaign) return;
    const folder = retryInput?.folder ?? assetFolder;
    const tags = retryInput?.tags ?? assetTags;
    setAssetStatus(`Uploading ${file.name}...`);
    try {
      const result = await apiUploadAsset({
        campaignId: selectedCampaign.id,
        sceneId: setAsBackground ? selectedScene?.id : undefined,
        file,
        setAsBackground,
        folder: folder.trim() || undefined,
        tags: assetTagsFromInput(tags)
      });
      setFailedAssetUpload(undefined);
      setAssetStatus(`${result.asset.name} uploaded${result.scene ? " and set as scene background" : ""}`);
      setStatus("Asset uploaded");
      await refresh(selectedCampaign.id, result.scene?.id ?? selectedScene?.id ?? sceneId);
    } catch (error) {
      const message = errorMessage(error);
      setFailedAssetUpload({ file, setAsBackground, folder, tags, message });
      setAssetStatus(`Upload failed: ${message}`);
      setStatus("Asset upload failed");
    }
  }

  async function retryAssetUpload() {
    if (!failedAssetUpload) return;
    await uploadAssetToLibrary(failedAssetUpload.file, failedAssetUpload.setAsBackground, {
      folder: failedAssetUpload.folder,
      tags: failedAssetUpload.tags
    });
  }

  function dismissFailedAssetUpload() {
    setFailedAssetUpload(undefined);
    setAssetStatus("Upload failure dismissed");
  }

  async function updateAssetMetadata(asset: MapAsset, input: { name: string; folder: string; tags: string }) {
    const updated = await apiPatch<MapAsset>(`/api/v1/assets/${asset.id}`, {
      name: input.name,
      folder: input.folder.trim() || null,
      tags: assetTagsFromInput(input.tags)
    });
    setAssetStatus(`${updated.name} metadata updated`);
    setStatus("Asset metadata updated");
    await refresh(campaignId, selectedScene?.id ?? sceneId);
  }

  async function setSceneBackgroundFromAsset(asset: MapAsset) {
    if (!selectedScene) return;
    await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, { backgroundAssetId: asset.id });
    setAssetStatus(`${asset.name} set as ${selectedScene.name} background`);
    setStatus("Scene background updated");
    await refresh(campaignId, selectedScene.id);
  }

  async function updateAssetLifecycle(asset: MapAsset, status: AssetLifecycleStatus) {
    const updated = await apiPatch<MapAsset>(`/api/v1/assets/${asset.id}/lifecycle`, {
      status,
      reason: assetLifecycleReason.trim() || undefined
    });
    setAssetStatus(`${updated.name} marked ${updated.lifecycle?.status ?? status}`);
    setStatus("Asset lifecycle updated");
    await refresh();
  }

  async function createAssetDeliveryUrl(asset: MapAsset) {
    const delivery = await apiPost<{ url: string }>(`/api/v1/assets/${asset.id}/delivery-url`, {
      expiresInSeconds: 900,
      disposition: "inline"
    });
    if (navigator.clipboard && delivery.url) await navigator.clipboard.writeText(delivery.url).catch(() => undefined);
    setAssetStatus(`Signed URL ready for ${asset.name}`);
    setStatus("Asset delivery URL created");
  }

  async function revealFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 160,
      mode: "reveal",
      hidden: false
    });
    setStatus("Fog updated");
    await refresh();
  }

  async function hideFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 95,
      mode: "hide",
      hidden: false
    });
    setStatus("Fog hidden");
    await refresh();
  }

  async function revealFogPolygon() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const radius = selectedScene.gridSize * 3;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "polygon",
      mode: "reveal",
      points: [
        { x: center.x, y: center.y - radius },
        { x: center.x + radius, y: center.y },
        { x: center.x, y: center.y + radius },
        { x: center.x - radius, y: center.y }
      ]
    });
    setStatus("Fog polygon revealed");
    await refresh();
  }

  function toggleFogBrush(mode: FogMode) {
    setAnnotationTool(null);
    setAnnotationPanelOpen(false);
    setFogBrushMode((current) => {
      const next = current === mode ? null : mode;
      setStatus(next ? `${next === "hide" ? "Hide" : "Reveal"} smooth fog brush active` : "Fog brush inactive");
      return next;
    });
  }

  function selectCanvasTool() {
    setFogBrushMode(null);
    setAnnotationTool(null);
    setAnnotationPanelOpen(false);
    setStatus("Select tool active");
  }

  function selectTokenLayer(layer: TokenLayer) {
    setActiveTokenLayer(layer);
    setFogBrushMode(null);
    setAnnotationTool(null);
    setAnnotationPanelOpen(false);
    setStatus(`${tokenLayerLabel(layer)} active`);
  }

  function zoomBattleMap(delta: number) {
    setBattleMapZoom((current) => clampBattleMapZoom(current + delta));
  }

  function resetBattleMapZoom() {
    setBattleMapZoom(1);
  }

  function selectSingleToken(tokenId: string) {
    setSelectedBoardAssetId("");
    setSelectedTokenIdState(tokenId);
    setSelectedTokenIds(tokenId ? [tokenId] : []);
  }

  function selectCanvasToken(tokenId: string, options: TokenSelectionOptions = {}) {
    setSelectedBoardAssetId("");
    if (options.additive) {
      setSelectedTokenIds((current) => {
        const alreadySelected = current.includes(tokenId);
        const next = alreadySelected ? current.filter((id) => id !== tokenId) : [...current, tokenId];
        setSelectedTokenIdState(alreadySelected ? next[next.length - 1] ?? "" : tokenId);
        return next;
      });
      return;
    }
    if (options.preserveExisting) {
      setSelectedTokenIdState(tokenId);
      setSelectedTokenIds((current) => (current.includes(tokenId) ? current : [...current, tokenId]));
      return;
    }
    selectSingleToken(tokenId);
  }

  function selectCanvasTokens(tokenIds: string[], options: TokenSelectionOptions = {}) {
    setSelectedBoardAssetId("");
    const uniqueTokenIds = [...new Set(tokenIds.filter(Boolean))];
    if (options.additive) {
      if (uniqueTokenIds.length === 0) return;
      setSelectedTokenIds((current) => {
        const next = [...current];
        for (const tokenId of uniqueTokenIds) {
          if (!next.includes(tokenId)) next.push(tokenId);
        }
        setSelectedTokenIdState(uniqueTokenIds.at(-1) ?? next.at(-1) ?? "");
        return next;
      });
      return;
    }
    setSelectedTokenIds(uniqueTokenIds);
    setSelectedTokenIdState(uniqueTokenIds.at(-1) ?? "");
  }

  function clearTokenSelection() {
    setSelectedTokenIdState("");
    setSelectedTokenIds([]);
    setSelectedBoardAssetId("");
    setSelectedOverlay(null);
  }

  function selectBoardBackgroundAsset(assetId: string) {
    setSelectedTokenIdState("");
    setSelectedTokenIds([]);
    setSelectedBoardAssetId(assetId);
    setCanvasAssetId(assetId);
    const asset = snapshot.assets.find((item) => item.id === assetId);
    setStatus(`${asset?.name ?? "Map"} selected`);
  }

  function setAnnotationLayerVisible(layer: SceneAnnotationLayer, visible: boolean) {
    setVisibleAnnotationLayers((current) => ({ ...current, [layer]: visible }));
    setStatus(`${titleCaseLabel(layer)} annotations ${visible ? "shown" : "hidden"}`);
  }

  function toggleAnnotationTool(kind: ActiveAnnotationTool) {
    setFogBrushMode(null);
    setToolReport("");
    setToolReportTitle("Fog and vision");
    const next = annotationTool === kind ? null : kind;
    setAnnotationTool(next);
    setAnnotationPanelOpen(Boolean(next && annotationToolShowsSettings(next)));
    setStatus(next ? `${annotationToolLabel(next)} tool active` : "Annotation tool inactive");
  }

  async function createSceneAnnotation(kind: SceneAnnotationKind, points: VisionPoint[], radius?: number) {
    if (!selectedScene || points.length === 0) return;
    const scene = await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations`, {
      kind,
      points,
      radius,
      color: annotationColor(kind),
      label: annotationToolLabel(kind),
      layer: annotationLayer,
      groupLabel: annotationGroupLabel.trim() || undefined,
      templateShape: kind === "template" ? templateShape : undefined,
      templateSaveAbility: kind === "template" && templateSaveAbility !== "none" ? templateSaveAbility : undefined,
      templateSaveDc: kind === "template" && templateSaveDc.trim() ? Number(templateSaveDc) : undefined,
      templateDamageFormula: kind === "template" ? templateDamageFormula.trim() || undefined : undefined,
      templateDamageType: kind === "template" ? templateDamageType.trim() || undefined : undefined,
      snapToGrid: kind === "ruler" ? false : annotationSnapToGrid,
      expiresInSeconds: kind === "ping" ? pingAnnotationTtlSeconds : undefined
    });
    // Pings render locally the instant they are placed; skip the reconcile.
    if (kind === "ping") {
      setStatus("Ping sent");
      return;
    }
    applySceneToSnapshot(scene);
    setStatus(`${annotationToolLabel(kind)} added`);
  }

  async function deleteLatestAnnotation() {
    if (!selectedScene) return;
    const annotations = selectedCurrentAnnotations;
    const annotation = annotations.at(-1);
    if (!annotation) {
      setStatus("No annotation to delete");
      return;
    }
    applySceneToSnapshot(await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`));
    setStatus(`${annotationToolLabel(annotation.kind)} deleted`);
  }

  async function deleteAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = selectedCurrentAnnotations.filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    let scene: Scene | undefined;
    for (const annotation of annotations) {
      scene = await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`);
    }
    if (scene) applySceneToSnapshot(scene);
    setStatus(`Deleted ${annotations.length} annotations in ${group}`);
  }

  async function nudgeAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = selectedCurrentAnnotations.filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    const delta = Math.max(1, selectedScene.gridSize || 25);
    let scene: Scene | undefined;
    for (const annotation of annotations) {
      scene = await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, {
        points: annotation.points.map((point) => ({ x: point.x + delta, y: point.y }))
      });
    }
    if (scene) applySceneToSnapshot(scene);
    setStatus(`Moved ${annotations.length} annotations in ${group}`);
  }

  async function recolorAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = selectedCurrentAnnotations.filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    let scene: Scene | undefined;
    for (const annotation of annotations) {
      scene = await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, { color: annotationGroupColor });
    }
    if (scene) applySceneToSnapshot(scene);
    setStatus(`Recolored ${annotations.length} annotations in ${group}`);
  }

  async function deleteSceneAnnotation(annotation: SceneAnnotation) {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`));
    setStatus(`${annotationToolLabel(annotation.kind)} deleted`);
  }

  async function deleteSceneWall(wallId: string) {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/walls/${wallId}`));
    setStatus("Wall deleted");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function deleteSceneLight(lightId: string) {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/lights/${lightId}`));
    setStatus("Light deleted");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function moveSceneAnnotation(annotation: SceneAnnotation, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    const patch: { points: VisionPoint[]; radius?: number } = { points };
    if (annotation.kind === "template" && points.length >= 2) {
      patch.radius = Math.round(distanceBetween(points[0]!, points[1]!));
    }
    applySceneToSnapshot(await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, patch));
    setStatus(`Moved ${annotationToolLabel(annotation.kind)} annotation`);
  }

  async function paintFogStroke(mode: FogMode, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "brush",
      mode,
      brushRadius: Math.max(28, Math.min(110, selectedScene.gridSize * 1.35)),
      points
    }));
    setStatus(`${mode === "hide" ? "Hide" : "Reveal"} fog brush applied`);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function undoFog() {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog/undo`, {}));
    setStatus("Fog change undone");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function undoSceneEdit() {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/undo`, {}));
    setStatus("Scene edit undone");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  function closeFogToolPanel() {
    setToolReport("");
    setToolReportTitle("Fog and vision");
    setFogBrushMode(null);
    setStatus("Fog tools closed");
  }

  async function showFogHistory() {
    if (!selectedScene) return;
    setAnnotationPanelOpen(false);
    setAnnotationTool(null);
    const history = await apiGet<FogHistoryEntry[]>(`/api/v1/scenes/${selectedScene.id}/fog/history`);
    const recent = history.slice(-8).reverse();
    setToolReportTitle("Fog history");
    setToolReport(recent.length ? recent.map(formatFogHistoryEntry).join("\n") : "No fog history for this scene.");
    setStatus("Fog history loaded");
  }

  async function sampleVisionPoint() {
    if (!selectedScene) return;
    setAnnotationPanelOpen(false);
    setAnnotationTool(null);
    const fallbackPoint = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const point = {
      x: visionSampleX.trim() ? Number(visionSampleX) : fallbackPoint.x,
      y: visionSampleY.trim() ? Number(visionSampleY) : fallbackPoint.y
    };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > selectedScene.width || point.y > selectedScene.height) {
      setToolReportTitle("Vision sample");
      setToolReport(`Point must be inside 0,0 to ${selectedScene.width},${selectedScene.height}.`);
      return;
    }
    const sample = await apiGet<VisionPointSample>(`/api/v1/scenes/${selectedScene.id}/vision/sample?x=${Math.round(point.x)}&y=${Math.round(point.y)}`);
    setToolReportTitle("Vision sample");
    setToolReport(formatVisionPointSample(sample));
    setStatus("Vision sample loaded");
  }

  async function saveFogPreset() {
    if (!selectedScene) return;
    const name = fogPresetName.trim() || `${selectedScene.name} fog preset`;
    await apiPost(`/api/v1/campaigns/${campaignId}/fog-presets`, {
      name,
      sceneId: selectedScene.id
    });
    setFogPresetName("");
    setStatus("Fog preset saved");
    await refresh();
  }

  async function applyFogPreset() {
    if (!selectedScene) return;
    const preset = snapshot.fogPresets[0];
    if (!preset) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog/apply-preset`, {
      presetId: preset.id,
      mode: fogPresetMode
    });
    setStatus(`${fogPresetMode === "append" ? "Appended" : "Applied"} ${preset.name}`);
    await refresh();
  }

  async function deleteFogPreset() {
    const preset = snapshot.fogPresets[0];
    if (!preset) return;
    await apiDelete(`/api/v1/campaigns/${campaignId}/fog-presets/${preset.id}`);
    setStatus(`Deleted ${preset.name}`);
    await refresh();
  }

  async function addWall() {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.25),
      y1: Math.round(selectedScene.height * 0.28),
      x2: Math.round(selectedScene.width * 0.75),
      y2: Math.round(selectedScene.height * 0.28),
      blocksVision: true
    }));
    setStatus("Wall added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function addTerrainWall() {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.28),
      y1: Math.round(selectedScene.height * 0.42),
      x2: Math.round(selectedScene.width * 0.72),
      y2: Math.round(selectedScene.height * 0.42),
      blocksVision: true,
      blocksMovement: false,
      kind: "terrain"
    }));
    setStatus("Terrain wall added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function addLight() {
    if (!selectedScene) return;
    applySceneToSnapshot(await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 210,
      brightRadius: 80,
      dimRadius: 210,
      color: "#38bdf8",
      intensity: 0.32
    }));
    setStatus("Dual-zone light added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  function applyActorToSnapshot(actor: Actor) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      actors: current.actors.map((item) => (item.id === actor.id ? actor : item))
    }));
  }

  function applyActorHpToSnapshot(actorId: string, hp: { current: number; max: number }) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      actors: current.actors.map((item) => (item.id === actorId ? { ...item, data: { ...item.data, hp } } : item))
    }));
  }

  async function persistActorHp(actorId: string, hp: { current: number; max: number }) {
    const actor = snapshotRef.current.actors.find((item) => item.id === actorId);
    if (!actor) return;
    try {
      applyActorToSnapshot(await apiPatch<Actor>(`/api/v1/actors/${actorId}`, { data: { ...actor.data, hp } }));
    } catch (error) {
      setStatus(errorMessage(error));
      void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
    }
  }

  // Steppers accumulate a running total in a ref (so rapid clicks add up even
  // before React re-renders), apply optimistically for instant feedback, and
  // debounce a single PATCH instead of one blocking full refresh per click.
  function adjustActorHp(actor: Actor, delta: number) {
    const pending = hpAdjustRef.current.get(actor.id);
    const base = pending ?? actorHitPoints(actor) ?? { current: 0, max: 0 };
    const max = base.max > 0 ? base.max : Number.MAX_SAFE_INTEGER;
    const nextCurrent = Math.max(0, Math.min(max, base.current + delta));
    const next = { current: nextCurrent, max: base.max };
    applyActorHpToSnapshot(actor.id, next);
    if (pending?.timer) window.clearTimeout(pending.timer);
    const timer = window.setTimeout(() => {
      hpAdjustRef.current.delete(actor.id);
      void persistActorHp(actor.id, next);
    }, 220);
    hpAdjustRef.current.set(actor.id, { ...next, timer });
  }

  async function updateActorHp(actor: Actor, current: number) {
    // Clearing the number input yields Number("")/Number("-") === NaN; ignore
    // non-finite values so we never persist a null hit-point total.
    if (!Number.isFinite(current)) return;
    const hp = actorHitPoints(actor);
    const safeCurrent = Math.max(0, Math.floor(current));
    const next = { current: safeCurrent, max: hp?.max ?? safeCurrent };
    applyActorHpToSnapshot(actor.id, next);
    await persistActorHp(actor.id, next);
  }

  async function updateActorData(actor: Actor, patch: Record<string, unknown>) {
    // Apply the authoritative response immediately so sheet edits (conditions,
    // attributes) reflect on the board without waiting on a snapshot reload.
    applyActorToSnapshot(await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, {
      data: { ...actor.data, ...patch }
    }));
    setStatus(`${actor.name} sheet updated`);
  }

  async function awardActorXp(actor: Actor, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) return;
    const currentXp = Math.max(0, Math.floor(numericValue(actor.data.xp, 0)));
    const nextXp = Math.max(0, currentXp + Math.floor(amount));
    const updated = await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, { data: { ...actor.data, xp: nextXp } });
    applyActorToSnapshot(updated);
    if (actor.id === selectedActor?.id && xpProgress?.nextLevelXp !== undefined && nextXp >= xpProgress.nextLevelXp) {
      setStatus(`${actor.name} has enough XP to level up!`);
    } else {
      setStatus(`${actor.name} ${amount > 0 ? "gained" : "lost"} ${formatNumber(Math.abs(Math.floor(amount)))} XP`);
    }
  }

  function awardPartyXp(total: number) {
    const party = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
    if (party.length === 0 || !Number.isFinite(total) || total <= 0) {
      setStatus("No party actors to award XP");
      return;
    }
    const share = Math.floor(total / party.length);
    if (share <= 0) return;
    void Promise.all(party.map((actor) => awardActorXp(actor, share)))
      .then(() => setStatus(`Awarded ${formatNumber(share)} XP to each of ${party.length} party members`))
      .catch((error) => setStatus(errorMessage(error)));
  }

  function awardPartyGold(totalGp: number) {
    const party = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
    if (party.length === 0 || !Number.isFinite(totalGp) || totalGp <= 0) {
      setStatus("No party actors to award gold");
      return;
    }
    const share = Math.floor(totalGp / party.length);
    if (share <= 0) return;
    void Promise.all(party.map(async (actor) => {
      const currency = recordValue(actor.data.currency);
      const gp = numericValue(currency.gp, 0);
      return apiPatch<Actor>(`/api/v1/actors/${actor.id}`, { data: { ...actor.data, currency: { ...currency, gp: gp + share } } });
    }))
      .then((actors) => {
        actors.forEach(applyActorToSnapshot);
        setStatus(`Split ${formatNumber(Math.floor(totalGp))} gp - ${formatNumber(share)} gp to each of ${party.length} party members`);
      })
      .catch((error) => setStatus(errorMessage(error)));
  }

  // Condition toggles queue per actor and recompute from the latest known
  // data at execution time, so rapid clicks on different chips cannot
  // overwrite each other with stale render-time condition arrays.
  function toggleActorCondition(actor: Actor, conditionId: string) {
    const previous = actorConditionQueueRef.current.get(actor.id) ?? Promise.resolve(undefined);
    const run = previous.then(async (previousActor) => {
      const latest = previousActor ?? snapshotRef.current.actors.find((item) => item.id === actor.id) ?? actor;
      const active = parseActorConditions(formatActorConditions(latest));
      const next = active.includes(conditionId) ? active.filter((id) => id !== conditionId) : [...active, conditionId];
      const updated = await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, { data: { ...latest.data, conditions: next } });
      applyActorToSnapshot(updated);
      setStatus(`${updated.name} conditions updated`);
      return updated;
    });
    actorConditionQueueRef.current.set(actor.id, run.catch((error) => {
      setStatus(errorMessage(error));
      return undefined;
    }));
  }

  async function updateItemData(item: Item, patch: Record<string, unknown>) {
    applyItemToSnapshot(await apiPatch<Item>(`/api/v1/items/${item.id}`, {
      data: { ...item.data, ...patch }
    }));
    setStatus(`${item.name} updated`);
  }

  async function assignItemToActor(item: Item, actor: Actor) {
    applyItemToSnapshot(await apiPatch<Item>(`/api/v1/items/${item.id}`, { actorId: actor.id }));
    setStatus(`Gave ${item.name} to ${actor.name}`);
  }

  function canAssignItemFromSheet(item: Item) {
    return hasPermission("actor.update") || (item.actorId === selectedActor?.id && canUpdateSelectedActor);
  }

  function handleRailItemDragOver(event: ReactDragEvent<HTMLButtonElement>, actor: Actor) {
    if (!hasItemDropData(event.dataTransfer)) return;
    const itemId = readItemDropData(event.dataTransfer);
    const item = snapshot.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (!canAssignItemFromSheet(item)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setPartyDropTargetActorId(actor.id);
  }

  function handleRailItemDragLeave(event: ReactDragEvent<HTMLButtonElement>, actor: Actor) {
    if (partyDropTargetActorId !== actor.id) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setPartyDropTargetActorId("");
  }

  function giveDroppedItemToActor(event: ReactDragEvent<HTMLButtonElement>, actor: Actor) {
    setPartyDropTargetActorId("");
    const itemId = readItemDropData(event.dataTransfer);
    const item = snapshot.items.find((candidate) => candidate.id === itemId);
    if (!item || !canAssignItemFromSheet(item)) return;
    event.preventDefault();
    void assignItemToActor(item, actor).catch((error) => setStatus(errorMessage(error)));
  }

  async function createAudioTrack(input: { name: string; url: string; kind: AudioTrack["kind"]; loop: boolean }) {
    try {
      await apiPost<AudioTrack>(`/api/v1/campaigns/${campaignId}/audio`, input);
      setStatus(`Added ${input.name} to the soundboard`);
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function uploadAudioTrack(file: File, input: { name?: string; kind: AudioTrack["kind"]; loop: boolean }) {
    const name = input.name?.trim() || audioTrackNameFromFile(file);
    try {
      setStatus(`Uploading ${file.name} to the soundboard...`);
      const result = await apiUploadAsset({
        campaignId,
        file,
        folder: "audio",
        tags: ["audio", input.kind]
      });
      await apiPost<AudioTrack>(`/api/v1/campaigns/${campaignId}/audio`, {
        name,
        url: result.asset.url,
        kind: input.kind,
        loop: input.loop
      });
      setStatus(`Uploaded ${name} to the soundboard`);
      await refresh();
    } catch (error) {
      setStatus(`Audio upload failed: ${errorMessage(error)}`);
    }
  }

  async function toggleAudioTrack(track: AudioTrack) {
    try {
      await apiPatch<AudioTrack>(`/api/v1/audio/${track.id}`, { playing: !track.playing });
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function deleteAudioTrack(track: AudioTrack) {
    try {
      await apiDelete<AudioTrack>(`/api/v1/audio/${track.id}`);
      setStatus(`Removed ${track.name} from the soundboard`);
      await refresh();
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function createBlankCanvasDemoRoll(formula: string, visibility: DiceRoll["visibility"], label: string): DiceRoll {
    const timestamp = new Date().toISOString();
    const result = rollFormula(formula);
    return {
      id: nextBlankCanvasDemoId("roll_demo"),
      campaignId,
      userId: currentUserId,
      formula,
      label,
      visibility,
      terms: result.terms,
      total: result.total,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function createBlankCanvasDemoChatMessage(input: Pick<ChatMessage, "body" | "type" | "visibility" | "recipientUserIds"> & { rollId?: string; replyToMessageId?: string }): ChatMessage {
    const timestamp = new Date().toISOString();
    return {
      id: nextBlankCanvasDemoId("chat_demo"),
      campaignId,
      sceneId: selectedScene?.id,
      userId: currentUserId,
      body: input.body,
      type: input.type,
      visibility: input.visibility,
      recipientUserIds: input.recipientUserIds,
      rollId: input.rollId,
      replyToMessageId: input.replyToMessageId,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function shouldDelayDiceResult(roll: DiceRoll): boolean {
    if (!dice3dEnabled) return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return diceCastPlan(roll, () => 0.5).dice.length > 0;
  }

  function setRollStatusAfterDiceReveal(roll: DiceRoll, revealedStatus: string) {
    if (!shouldDelayDiceResult(roll)) {
      diceRevealStatusesRef.current.delete(roll.id);
      setStatus(revealedStatus);
      return;
    }
    diceRevealStatusesRef.current.set(roll.id, revealedStatus);
    setStatus(rollingDiceStatus);
  }

  function markDiceCastResultPending(rollId: string) {
    setConcealedRollIds((current) => {
      if (current.has(rollId)) return current;
      const next = new Set(current);
      next.add(rollId);
      return next;
    });
  }

  function scheduleDiceCastResultReveal(cast: Pick<DiceCastPlan, "rollId" | "settleMs">) {
    const existingTimer = diceRevealTimersRef.current.get(cast.rollId);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    const timerId = window.setTimeout(() => {
      diceRevealTimersRef.current.delete(cast.rollId);
      const revealedStatus = diceRevealStatusesRef.current.get(cast.rollId);
      diceRevealStatusesRef.current.delete(cast.rollId);
      setConcealedRollIds((current) => {
        if (!current.has(cast.rollId)) return current;
        const next = new Set(current);
        next.delete(cast.rollId);
        return next;
      });
      if (revealedStatus && diceRevealStatusesRef.current.size === 0) {
        setStatus((current) => (current === rollingDiceStatus || current === "Synced" ? revealedStatus : current));
      }
    }, cast.settleMs);
    diceRevealTimersRef.current.set(cast.rollId, timerId);
  }

  async function rollDice(formulaOverride?: string) {
    const formula = typeof formulaOverride === "string" && formulaOverride.trim() ? formulaOverride.trim() : diceFormula;
    if (blankCanvasDemoOpen) {
      const roll = createBlankCanvasDemoRoll(formula, diceVisibility, "Table roll");
      const message = createBlankCanvasDemoChatMessage({ body: formula, type: "roll", visibility: diceVisibility, recipientUserIds: [], rollId: roll.id });
      setSnapshot((current) => ({ ...current, rolls: [...current.rolls, roll], chat: [...current.chat, message] }));
      setRollStatusAfterDiceReveal(roll, `Rolled ${roll.total} for this demo tab`);
      return;
    }
    const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
      campaignId,
      formula,
      visibility: diceVisibility,
      label: "Table roll"
    });
    setRollStatusAfterDiceReveal(roll, `Rolled ${roll.total}`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function rollTemplateDamage(annotation: SceneAnnotation) {
    if (!annotation.templateDamageFormula) {
      setStatus("No template damage formula");
      return;
    }
    const saveLabel = annotation.templateSaveDc ? ` DC ${annotation.templateSaveDc}` : "";
    const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
      campaignId,
      formula: annotation.templateDamageFormula,
      visibility: diceVisibility,
      label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template${saveLabel} damage`
    });
    setRollStatusAfterDiceReveal(roll, `Template damage ${roll.total}`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function applyDamageToAffectedToken(token: Token, amount: number, damageType: string | undefined, outcomeLabel: string | undefined, actorOverrides: Map<string, Actor>): Promise<boolean> {
    const actor = token.actorId ? actorOverrides.get(token.actorId) ?? snapshot.actors.find((item) => item.id === token.actorId) : undefined;
    const adjusted = adjustedTemplateDamage(actor, token, amount, damageType);
    const hp = actorHitPoints(actor);
    if (actor && hp && hasPermission("actor.update")) {
      const concentrationNote = adjusted.notes.find((note) => note.startsWith("concentration DC "));
      const nextActor = await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, {
        data: {
          ...actor.data,
          hp: { ...hp, current: Math.max(0, hp.current - adjusted.amount) },
          ...(concentrationNote ? { conditions: appendActorCondition(actor, concentrationNote) } : {})
        }
      });
      actorOverrides.set(actor.id, nextActor);
      applyActorToSnapshot(nextActor);
      return true;
    }
    if (!hasPermission("token.update")) return false;
    const noteLabel = adjusted.notes.length > 0 ? ` (${adjusted.notes.join("; ")})` : "";
    const damageLabel = `${outcomeLabel ? `${outcomeLabel} - ` : ""}Damaged ${adjusted.amount}${damageType ? ` ${damageType}` : ""}${noteLabel}`;
    const nextConditions = [...(token.conditions ?? []).filter((condition) => condition.id !== slugId(damageLabel)), { id: slugId(damageLabel), name: damageLabel }];
    applyTokensToSnapshot([await apiPatch<Token>(`/api/v1/tokens/${token.id}`, { conditions: nextConditions })]);
    return true;
  }

  async function applyTemplateDamage(annotation: SceneAnnotation) {
    if (!annotation.templateDamageFormula) {
      setStatus("No template damage formula");
      return;
    }
    const affectedTokenIds = annotation.affectedTokenIds ?? [];
    const affectedTokens = snapshot.tokens.filter((token) => affectedTokenIds.includes(token.id));
    if (affectedTokens.length === 0) {
      setStatus("No affected tokens to damage");
      return;
    }
    const saveLabel = annotation.templateSaveDc ? ` DC ${annotation.templateSaveDc}` : "";
    const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
      campaignId,
      formula: annotation.templateDamageFormula,
      visibility: diceVisibility,
      label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template${saveLabel} damage`
    });
    let appliedCount = 0;
    const actorOverrides = new Map<string, Actor>();
    for (const token of affectedTokens) {
      if (await applyDamageToAffectedToken(token, roll.total, annotation.templateDamageType, undefined, actorOverrides)) appliedCount += 1;
    }
    setStatus(`Applied template damage to ${appliedCount} tokens`);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function resolveTemplateSaves(annotation: SceneAnnotation) {
    if (!annotation.templateDamageFormula) {
      setStatus("No template damage formula");
      return;
    }
    const saveAbility = annotation.templateSaveAbility;
    if (!saveAbility || saveAbility === "none" || !annotation.templateSaveDc) {
      setStatus("No template save configured");
      return;
    }
    const saveDc = Number(annotation.templateSaveDc);
    if (!Number.isFinite(saveDc)) {
      setStatus("No template save configured");
      return;
    }
    const affectedTokens = snapshot.tokens.filter((token) => (annotation.affectedTokenIds ?? []).includes(token.id));
    if (affectedTokens.length === 0) {
      setStatus("No affected tokens to save");
      return;
    }
    const damageRoll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
      campaignId,
      formula: annotation.templateDamageFormula,
      visibility: diceVisibility,
      label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template save damage`
    });
    let appliedCount = 0;
    const actorOverrides = new Map<string, Actor>();
    for (const token of affectedTokens) {
      const actor = token.actorId ? actorOverrides.get(token.actorId) ?? snapshot.actors.find((item) => item.id === token.actorId) : undefined;
      const saveRoll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
        campaignId,
        formula: actorSaveFormula(actor, saveAbility),
        visibility: diceVisibility,
        label: `${token.name} ${titleCaseLabel(saveAbility)} save`
      });
      const success = saveRoll.total >= saveDc;
      const damage = success ? Math.floor(damageRoll.total / 2) : damageRoll.total;
      const outcomeLabel = `${success ? "Saved" : "Failed"} ${titleCaseLabel(saveAbility)} ${saveRoll.total} vs DC ${saveDc}`;
      if (await applyDamageToAffectedToken(token, damage, annotation.templateDamageType, outcomeLabel, actorOverrides)) appliedCount += 1;
    }
    setStatus(`Resolved saves for ${appliedCount} tokens`);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function saveCurrentDiceFormula() {
    const formula = diceFormula.trim();
    if (!formula) return;
    if (blankCanvasDemoOpen) {
      const next = [formula, ...savedDiceFormulas.filter((item) => item !== formula)].slice(0, 12);
      setSavedDiceFormulas(next);
      setStatus(`Saved ${formula} for this demo tab`);
      return;
    }
    if (hasPermission("campaign.update")) {
      const existing = snapshot.diceMacros.find((macro) => macro.formula === formula);
      if (existing) {
        setStatus(`Campaign macro already saved: ${existing.name}`);
        return;
      }
      await apiPost(`/api/v1/campaigns/${campaignId}/dice-macros`, {
        name: formula,
        formula,
        visibility: "public"
      });
      setStatus(`Shared campaign macro ${formula}`);
      await refresh();
      return;
    }
    const next = [formula, ...savedDiceFormulas.filter((item) => item !== formula)].slice(0, 12);
    setSavedDiceFormulas(next);
    persistSavedDiceFormulas(next);
    setStatus(`Saved ${formula}`);
  }

  function resolveChatRecipient(query?: string): string | undefined {
    const normalized = query?.trim().toLocaleLowerCase();
    if (!normalized) return undefined;
    const match = chatRecipientOptions.find((member) => {
      const names = [member.user.id, member.user.displayName, member.user.email ?? ""].map((value) => value.toLocaleLowerCase());
      return names.some((value) => value === normalized || value.includes(normalized));
    });
    return match?.user.id;
  }

  async function submitChatCommand() {
    const parsed = parseChatCommand(chatBody);
    if (!parsed) return;
    if (parsed.kind === "error") {
      setStatus(parsed.message);
      return;
    }
    if (parsed.kind === "roll") {
      if (blankCanvasDemoOpen) {
        const roll = createBlankCanvasDemoRoll(parsed.formula, parsed.visibility, "Table roll");
        const message = createBlankCanvasDemoChatMessage({ body: parsed.formula, type: "roll", visibility: parsed.visibility, recipientUserIds: [], rollId: roll.id, replyToMessageId: chatReplyTarget?.id });
        setSnapshot((current) => ({ ...current, rolls: [...current.rolls, roll], chat: [...current.chat, message] }));
        setChatBody("");
        setChatReplyToMessageId("");
        setRollStatusAfterDiceReveal(roll, `Rolled ${roll.total} for this demo tab`);
        return;
      }
      const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
        campaignId,
        formula: parsed.formula,
        visibility: parsed.visibility,
        label: "Table roll"
      });
      setChatBody("");
      setChatReplyToMessageId("");
      setRollStatusAfterDiceReveal(roll, `Rolled ${roll.total}`);
      await refresh(campaignId, sceneId, { syncStatus: false });
      return;
    }

    const recipientUserId = parsed.visibility === "whisper" ? resolveChatRecipient(parsed.recipientQuery) : undefined;
    if (parsed.visibility === "whisper" && !recipientUserId) {
      setStatus(parsed.recipientQuery ? `No whisper recipient matched "${parsed.recipientQuery}"` : "Use /w name message to whisper");
      return;
    }
    if (blankCanvasDemoOpen) {
      const message = createBlankCanvasDemoChatMessage({
        body: parsed.body,
        type: parsed.messageType,
        visibility: parsed.visibility,
        recipientUserIds: recipientUserId ? [recipientUserId] : [],
        replyToMessageId: chatReplyTarget?.id
      });
      setSnapshot((current) => ({ ...current, chat: [...current.chat, message] }));
      setChatBody("");
      setChatReplyToMessageId("");
      setStatus("Message added for this demo tab");
      return;
    }
    await apiPost<ChatMessage>("/api/v1/chat/messages", {
      campaignId,
      body: parsed.body,
      type: parsed.messageType,
      visibility: parsed.visibility,
      recipientUserIds: recipientUserId ? [recipientUserId] : [],
      replyToMessageId: chatReplyTarget?.id
    });
    setChatBody("");
    setChatReplyToMessageId("");
    await refresh();
  }

  async function deleteChatMessage(message: ChatMessage) {
    await apiDelete<ChatMessage>(`/api/v1/chat/messages/${message.id}`);
    setStatus("Chat message deleted");
    await refresh();
  }

  async function moderateChatMessage(message: ChatMessage, moderationStatus: ChatModerationResolution) {
    await apiPatch<ChatMessage>(`/api/v1/chat/messages/${message.id}/moderation`, { moderationStatus });
    setStatus(`Chat message marked ${titleCaseLabel(moderationStatus)}`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function exportChatHistory(format: ChatExportFormat) {
    const response = await fetch(`${apiBase}/api/v1/campaigns/${campaignId}/chat/export?format=${format}`, {
      headers: { authorization: `Bearer ${getSessionToken()}` }
    });
    if (!response.ok) throw new Error(await response.text());
    const body = await response.text();
    const payload = format === "json" ? JSON.stringify(JSON.parse(body), null, 2) : body;
    const blob = new Blob([payload], { type: format === "json" ? "application/json" : "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-${campaignId}-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`Exported chat history as ${format}`);
  }

  function applyJournalToSnapshot(journal: JournalEntry) {
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      journals: current.journals.some((candidate) => candidate.id === journal.id)
        ? current.journals.map((candidate) => (candidate.id === journal.id ? journal : candidate))
        : [journal, ...current.journals]
    }));
  }

  async function createJournal() {
    const title = newJournalTitle.trim();
    const journal = await apiPost<JournalEntry>(`/api/v1/campaigns/${campaignId}/journal`, {
      title: title || "New Journal Entry",
      body: newJournalBody.trim(),
      visibility: newJournalVisibility,
      tags: newJournalTags.split(",").map((tag) => tag.trim()).filter(Boolean)
    });
    applyJournalToSnapshot(journal);
    setNewJournalTitle("");
    setNewJournalBody("");
    setStatus("Journal entry created");
  }

  function recapWindowStart(): Date {
    const latestRecap = snapshot.journals
      .filter((journal) => journal.tags.includes("recap"))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return latestRecap ? new Date(latestRecap.createdAt) : new Date(Date.now() - 12 * 60 * 60 * 1000);
  }

  function recapChatSnippet(body: string): string {
    const compact = body.replace(/\s+/g, " ").trim();
    return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  }

  function d20Nat20Count(rolls: DiceRoll[]): number {
    return rolls.filter((roll) => roll.formula.toLocaleLowerCase().includes("d20") && roll.terms.some((term) => term.sides === 20 && (term.results ?? []).includes(20))).length;
  }

  function generateSessionRecapBody(windowStart: Date): string {
    const since = windowStart.toISOString();
    const sections: string[] = [];
    const rolls = snapshot.rolls.filter((roll) => roll.createdAt >= since);
    if (rolls.length > 0) {
      const highest = rolls.reduce((best, roll) => (roll.total > best.total ? roll : best), rolls[0]!);
      const highestLabel = highest.label ? `${highest.label} ${highest.formula} = ${formatNumber(highest.total)}` : `${highest.formula} = ${formatNumber(highest.total)}`;
      sections.push(["## Rolls", `- ${formatNumber(rolls.length)} rolls`, `- Highest: ${highestLabel}`, `- Natural 20s: ${formatNumber(d20Nat20Count(rolls))}`].join("\n"));
    }

    const combats = snapshot.combats.filter((combat) => combat.updatedAt >= since);
    if (combats.length > 0) {
      const combatLines = combats.map((combat) => {
        const names = combat.combatants.map((combatant) => combatant.name).join(", ") || "No combatants";
        const defeated = combat.combatants.filter((combatant) => combatant.defeated).map((combatant) => combatant.name).join(", ") || "None";
        const combatAudit = snapshot.combatAudit.filter((entry) => entry.createdAt >= since && (entry.targetId === combat.id || entry.action.includes("combat")));
        const pending = combatAudit.filter((entry) => entry.action.includes("pending")).length;
        const confirmed = combatAudit.filter((entry) => entry.action.includes("confirm")).length;
        return `- ${combat.active ? "Active" : "Ended"} combat: ${formatNumber(combat.round)} rounds; combatants ${names}; defeated ${defeated}; actions ${formatNumber(pending)} pending / ${formatNumber(confirmed)} confirmed`;
      });
      sections.push(["## Combat", ...combatLines].join("\n"));
    }

    const partyActors = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
    if (partyActors.length > 0) {
      const partyLines = partyActors.map((actor) => {
        const hp = recordValue(actor.data.hp);
        const hpLabel = hp.current !== undefined || hp.max !== undefined ? `${formatNumber(numericValue(hp.current, 0))}/${formatNumber(numericValue(hp.max, 0))}` : "unknown";
        const xpLabel = actor.data.xp !== undefined ? `, XP ${formatNumber(numericValue(actor.data.xp, 0))}` : "";
        return `- ${actor.name} - Level ${formatNumber(numericValue(actor.data.level, 1))}, HP ${hpLabel}${xpLabel}`;
      });
      sections.push(["## Party status", ...partyLines].join("\n"));
    }

    const chatHighlights = snapshot.chat
      .filter((message) => message.createdAt >= since && message.visibility === "public" && !message.body.trim().startsWith("/"))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    if (chatHighlights.length > 0) {
      sections.push(["## Chat highlights", `- ${formatNumber(chatHighlights.length)} public messages`, ...chatHighlights.slice(-3).map((message) => `- ${recapChatSnippet(message.body)}`)].join("\n"));
    }

    return sections.length > 0 ? sections.join("\n\n") : `No table activity recorded since ${formatDateTime(since)}.`;
  }

  async function generateSessionRecap() {
    const windowStart = recapWindowStart();
    const journal = await apiPost<JournalEntry>(`/api/v1/campaigns/${campaignId}/journal`, {
      title: `Session Recap - ${formatDateTime(new Date().toISOString())}`,
      body: generateSessionRecapBody(windowStart),
      visibility: newJournalVisibility,
      tags: ["recap"]
    });
    applyJournalToSnapshot(journal);
    setStatus("Session recap added to the journal");
  }

  async function startCombat() {
    const combatants = selectedSceneTokens.map((token, index) => {
      const actor = snapshot.actors.find((candidate) => candidate.id === token.actorId);
      const resource = actor ? actorCombatResource(actor) : undefined;
      return {
        id: `cmbt_${token.id}`,
        tokenId: token.id,
        actorId: token.actorId,
        name: token.name,
        initiative: 20 - index,
        defeated: false,
        readiness: "normal" as const,
        conditions: token.conditions?.map((condition) => condition.name) ?? [],
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        resourceKey: resource?.key,
        resourceLabel: resource?.label,
        resourceUsed: false
      };
    });
    const combat = await apiPost<Combat>(`/api/v1/campaigns/${campaignId}/combats`, {
      combatants
    });
    setTab("combat");
    await refresh(campaignId, sceneId, { syncStatus: false });
    selectCombatantToken(combat.combatants[combat.turnIndex] ?? combat.combatants[0]);
  }

  async function updateCombat(combat: Combat, patch: Partial<Combat>) {
    const updated = await apiPatch<Combat>(`/api/v1/combats/${combat.id}`, patch);
    setStatus("Combat updated");
    await refresh(campaignId, sceneId, { syncStatus: false });
    selectCombatantToken(updated.combatants[updated.turnIndex] ?? updated.combatants[0]);
  }

  async function advanceCombatTurn(combat: Combat, direction: 1 | -1) {
    if (combat.combatants.length === 0) return;
    const next = nextCombatTurnPosition(combat, direction);
    await updateCombat(combat, {
      turnIndex: next.turnIndex,
      round: next.round
    });
  }

  async function updateCombatant(combat: Combat, combatantId: string, patch: Partial<Combat["combatants"][number]>) {
    const combatant = combat.combatants.find((candidate) => candidate.id === combatantId);
    const syncActorSheet = Boolean(
      combatant?.actorId &&
        hasPermission("actor.update") &&
        (patch.readiness !== undefined || patch.defeated !== undefined || patch.conditions !== undefined || patch.deathSaveSuccesses !== undefined || patch.deathSaveFailures !== undefined || patch.resourceUsed !== undefined)
    );
    const updated = await apiPatch<Combat>(`/api/v1/combats/${combat.id}/combatants/${combatantId}`, { ...patch, syncActorSheet });
    setStatus("Combatant updated");
    await refresh(campaignId, sceneId, { syncStatus: false });
    selectCombatantToken(updated.combatants.find((candidate) => candidate.id === combatantId));
  }

  async function endCombat(combat: Combat) {
    await apiDelete<Combat>(`/api/v1/combats/${combat.id}`);
    setStatus("Combat ended");
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function confirmCombatAction(combat: Combat, action: CombatAction) {
    await apiPost(`/api/v1/combats/${combat.id}/actions/${action.id}/confirm`, {});
    setStatus(`${action.actionLabel} confirmed`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function rejectCombatAction(combat: Combat, action: CombatAction) {
    await apiPost(`/api/v1/combats/${combat.id}/actions/${action.id}/reject`, {});
    setStatus(`${action.actionLabel} rejected`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function askAi() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/encounter-design`, {
      prompt: aiPrompt,
      difficulty: "standard",
      sceneName: "AI Draft Encounter Scene",
      sceneWidth: selectedScene?.width,
      sceneHeight: selectedScene?.height,
      gridSize: selectedScene?.gridSize
    });
    setStatus("Encounter and scene proposal drafted");
    await refresh();
  }

  function clearAiAgentAuthRetry() {
    if (aiAgentAuthRetryTimerRef.current !== null) window.clearTimeout(aiAgentAuthRetryTimerRef.current);
    aiAgentAuthRetryTimerRef.current = null;
    aiAgentAuthRetryStartedAtRef.current = 0;
  }

  function scheduleAiAgentAuthRetry() {
    if (!aiAgentPendingAuthRequestRef.current) return;
    if (aiAgentAuthRetryStartedAtRef.current === 0) aiAgentAuthRetryStartedAtRef.current = Date.now();
    if (Date.now() - aiAgentAuthRetryStartedAtRef.current > aiAgentAuthRetryTimeoutMs) {
      aiAgentPendingAuthRequestRef.current = null;
      clearAiAgentAuthRetry();
      const message = "ChatGPT sign-in timed out before the original agent request could resume.";
      setAiAgentStatus("Codex sign-in timed out");
      setAiAgentMessages((messages) => [...messages, { id: `agent-auth-timeout-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      return;
    }
    if (aiAgentAuthRetryTimerRef.current !== null) window.clearTimeout(aiAgentAuthRetryTimerRef.current);
    aiAgentAuthRetryTimerRef.current = window.setTimeout(() => {
      aiAgentAuthRetryTimerRef.current = null;
      retryAiAgentPendingAuthRequest().catch((error) => {
        const message = errorMessage(error);
        aiAgentPendingAuthRequestRef.current = null;
        clearAiAgentAuthRetry();
        setAiAgentStatus(`Agent failed: ${message}`);
        setAiAgentMessages((messages) => [...messages, { id: `agent-auth-retry-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      });
    }, aiAgentAuthRetryIntervalMs);
  }

  async function retryAiAgentPendingAuthRequest() {
    const pending = aiAgentPendingAuthRequestRef.current;
    if (!pending) return;
    await submitAiAgentTurn(pending, { authRetry: true });
  }

  async function sendAiAgentMessage() {
    const prompt = aiAgentPrompt.trim();
    if (!prompt || aiAgentBusy) return;
    const userMessage: AiAgentMessage = { id: `agent-user-${Date.now()}`, role: "user", content: prompt, createdAt: new Date().toISOString() };
    const requestMessages = [...aiAgentMessages, userMessage];
    aiAgentPendingAuthRequestRef.current = null;
    clearAiAgentAuthRetry();
    setAiAgentMessages((messages) => [...messages, userMessage]);
    setAiAgentPrompt("");
    await submitAiAgentTurn({ prompt, requestMessages });
  }

  function createBlankCanvasDemoAiProposal(prompt: string): Proposal {
    const timestamp = new Date().toISOString();
    const proposalId = nextBlankCanvasDemoId("prop_demo");
    const journalId = nextBlankCanvasDemoId("jrnl_demo");
    const title = prompt.split(/\s+/).filter(Boolean).slice(0, 6).join(" ") || "AI Agent Demo Note";
    return {
      id: proposalId,
      campaignId,
      createdByUserId: currentUserId,
      createdByType: "ai",
      sourceId: "blank-canvas-demo-agent",
      title: `Demo proposal: ${title}`,
      summary: "Local demo proposal from the AI Agent. It can be reviewed and applied without saving to the server.",
      status: "pending",
      changesJson: [
        {
          entity: "journal",
          action: "create",
          id: journalId,
          data: {
            id: journalId,
            campaignId,
            title: `AI Agent: ${title}`,
            body: `Demo prompt:\n\n${prompt}\n\nThis proposal is local to this browser tab and resets when the demo is left or refreshed.`,
            visibility: "gm_only",
            visibleToUserIds: [],
            visibleToActorIds: [],
            tags: ["demo", "ai-agent"],
            createdBy: currentUserId,
            updatedBy: currentUserId,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        }
      ],
      diffJson: { demo: true, source: "blank-canvas-demo-agent" },
      approvalRequired: true,
      history: [
        {
          action: "created",
          status: "pending",
          at: timestamp,
          actorType: "ai",
          note: "Created by the local stateless demo agent."
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  async function submitBlankCanvasDemoAiAgentTurn({ prompt }: AiAgentPendingAuthRequest, options: { authRetry?: boolean } = {}) {
    if (aiAgentBusy && !options.authRetry) return;
    setAiAgentBusy(true);
    setAiAgentStatus("Agent working locally");
    setAiAgentCodexAuth(null);
    try {
      const proposal = createBlankCanvasDemoAiProposal(prompt);
      const assistantMessage: AiAgentMessage = {
        id: nextBlankCanvasDemoId("agent_demo"),
        role: "assistant",
        content: "I drafted a local proposal for the blank-canvas demo. Review it here, or apply it to this tab only.",
        createdAt: proposal.updatedAt,
        proposalIds: [proposal.id],
        reasoning: ["Demo mode keeps the AI Agent local so it does not save campaign state or consume server AI usage."]
      };
      const sourceSnapshot = { ...snapshot, proposals: [...snapshot.proposals, proposal] };
      setSnapshot((current) => ({ ...current, proposals: [...current.proposals, proposal] }));
      setAiAgentMessages((messages) => [...messages, assistantMessage]);
      setAiAgentStatus("Agent drafted 1 local proposal");
      if (aiAgentApprovalMode === "auto") await autoApplyAiAgentProposals([proposal.id], sourceSnapshot);
    } finally {
      setAiAgentBusy(false);
    }
  }

  async function submitAiAgentTurn({ prompt, requestMessages }: AiAgentPendingAuthRequest, options: { authRetry?: boolean } = {}) {
    if (blankCanvasDemoOpen) {
      await submitBlankCanvasDemoAiAgentTurn({ prompt, requestMessages }, options);
      return;
    }
    if (aiAgentBusy && !options.authRetry) return;
    setAiAgentBusy(true);
    setAiAgentStatus(options.authRetry ? "Retrying agent request after sign-in" : "Agent working");
    setAiAgentCodexAuth(null);
    const abortController = new AbortController();
    aiAgentAbortRef.current = abortController;
    try {
      const result = await apiPost<AiAgentThreadResponse>(`/api/v1/campaigns/${campaignId}/ai/threads`, {
        prompt,
        surface: "agent_panel",
        approvalMode: aiAgentApprovalMode,
        selectedSceneId: selectedScene?.id,
        selectedAssetId: aiAgentSelectedAssetId,
        selectedTokenIds,
        messages: aiAgentProviderMessages(requestMessages)
      }, { signal: abortController.signal });
      const proposalIds = result.events.filter((event) => event.type === "proposal.created").map((event) => event.proposalId).filter((proposalId): proposalId is string => Boolean(proposalId));
      const appliedProposalIds = result.events.filter((event) => event.type === "proposal.applied").map((event) => event.proposalId).filter((proposalId): proposalId is string => Boolean(proposalId));
      const assistantMessage: AiAgentMessage = {
        id: result.thread.id,
        role: "assistant",
        content: result.assistantMessage || "Done.",
        createdAt: result.thread.updatedAt,
        proposalIds,
        reasoning: reasoningTracesFromEvents(result.events)
      };
      aiAgentPendingAuthRequestRef.current = null;
      clearAiAgentAuthRetry();
      setAiAgentMessages((messages) => [...messages, assistantMessage]);
      setAiAgentStatus(
        appliedProposalIds.length > 0
          ? `Agent auto-applied ${appliedProposalIds.length} proposal${appliedProposalIds.length === 1 ? "" : "s"}`
          : proposalIds.length > 0
            ? `Agent drafted ${proposalIds.length} proposal${proposalIds.length === 1 ? "" : "s"}`
            : "Agent ready"
      );
      const refreshedSnapshot = await refresh();
      const appliedProposalIdSet = new Set(appliedProposalIds);
      const pendingProposalIds = proposalIds.filter((proposalId) => !appliedProposalIdSet.has(proposalId));
      if (aiAgentApprovalMode === "auto" && pendingProposalIds.length > 0) await autoApplyAiAgentProposals(pendingProposalIds, refreshedSnapshot);
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) {
        const message = "Agent turn stopped.";
        aiAgentPendingAuthRequestRef.current = null;
        clearAiAgentAuthRetry();
        setAiAgentMessages((messages) => [...messages, { id: `agent-stop-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
        setAiAgentStatus("Agent stopped");
        return;
      }
      const codexAuth = codexAuthPromptFromError(error);
      if (codexAuth) {
        const opened = openCodexAuthPrompt(codexAuth);
        aiAgentPendingAuthRequestRef.current = { prompt, requestMessages };
        const promptMessage = opened
          ? "Codex sign-in opened. Finish the ChatGPT OAuth flow; the original agent request will resume automatically."
          : "Codex sign-in is required. Use the sign-in button below; the original agent request will resume automatically.";
        setAiAgentCodexAuth({ ...codexAuth, opened, message: promptMessage });
        if (!options.authRetry) setAiAgentMessages((messages) => [...messages, { id: `agent-auth-${Date.now()}`, role: "system", content: promptMessage, createdAt: new Date().toISOString() }]);
        setAiAgentStatus(opened || options.authRetry ? "Waiting for ChatGPT sign-in" : "Codex sign-in required");
        if (opened || options.authRetry) scheduleAiAgentAuthRetry();
        return;
      }
      if (isSessionAuthError(error)) {
        const message = errorMessage(error);
        aiAgentPendingAuthRequestRef.current = null;
        clearAiAgentAuthRetry();
        requireInteractiveSignIn(`Sign in required. ${message}`);
        setAiAgentMessages((messages) => [...messages, { id: `agent-auth-session-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
        setAiAgentStatus("Sign in required");
        return;
      }
      const message = errorMessage(error);
      aiAgentPendingAuthRequestRef.current = null;
      clearAiAgentAuthRetry();
      setAiAgentMessages((messages) => [...messages, { id: `agent-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      setAiAgentStatus(`Agent failed: ${message}`);
    } finally {
      if (aiAgentAbortRef.current === abortController) aiAgentAbortRef.current = null;
      setAiAgentBusy(false);
    }
  }

  function stopAiAgentTurn() {
    if (!aiAgentAbortRef.current && !aiAgentPendingAuthRequestRef.current) return;
    aiAgentPendingAuthRequestRef.current = null;
    clearAiAgentAuthRetry();
    setAiAgentStatus("Stopping agent turn");
    aiAgentAbortRef.current?.abort();
  }

  function startAiAgentCodexAuth(auth: CodexAuthStart) {
    const opened = openCodexAuthPrompt(auth);
    setAiAgentCodexAuth((current) => (current ? { ...current, opened } : current));
    setAiAgentStatus(opened ? "Waiting for ChatGPT sign-in" : "Codex sign-in blocked");
    if (opened) scheduleAiAgentAuthRetry();
  }

  async function trackAiGenerationJob(job: AiGenerationJob, task: () => Promise<void>) {
    setAiGenerationJobs((jobs) => [...jobs.filter((item) => item.id !== job.id), job]);
    try {
      await task();
    } catch (error) {
      setStatus(`${job.label} failed: ${errorMessage(error)}`);
    } finally {
      setAiGenerationJobs((jobs) => jobs.filter((item) => item.id !== job.id));
    }
  }

  async function generateAiMapAsset() {
    if (!selectedScene) return;
    const prompt = aiMapPrompt.trim();
    if (!prompt) return;
    await trackAiGenerationJob({ id: `map:${selectedScene.id}`, kind: "map", label: "Map image generation", detail: selectedScene.name }, async () => {
      setStatus(`Generating map art for ${selectedScene.name}...`);
      await apiPost(`/api/v1/campaigns/${campaignId}/ai/generate-map-asset`, {
        prompt,
        name: `${selectedScene.name} Generated Map`,
        sceneId: selectedScene.id,
        size: "1536x1024",
        quality: "low",
        outputFormat: "png"
      });
      setStatus("Map image proposal drafted");
      await refresh();
    });
  }

  async function generateAiTokenAsset() {
    if (!selectedToken) return;
    const prompt = aiTokenPrompt.trim();
    if (!prompt) return;
    await trackAiGenerationJob({ id: `token:${selectedToken.id}`, kind: "token", label: "Token image generation", detail: selectedToken.name }, async () => {
      setStatus(`Generating token art for ${selectedToken.name}...`);
      await apiPost(`/api/v1/campaigns/${campaignId}/ai/generate-token-asset`, {
        prompt,
        name: `${selectedToken.name} Generated Token`,
        tokenId: selectedToken.id,
        size: "1024x1024",
        quality: "low",
        outputFormat: "png"
      });
      setStatus("Token art proposal drafted");
      await refresh();
    });
  }

  async function generateAiSceneTokenAssets() {
    if (!selectedScene) return;
    const prompt = aiTokenPrompt.trim();
    if (!prompt) return;
    const tokens = selectedSceneTokensNeedingArt;
    if (tokens.length === 0) {
      setStatus("All selected scene tokens already have token art or pending art proposals");
      return;
    }
    await trackAiGenerationJob({ id: `token-batch:${selectedScene.id}`, kind: "tokenBatch", label: "Scene token art generation", detail: `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}` }, async () => {
      setStatus(`Generating token art for ${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}...`);
      await Promise.all(tokens.map(async (token) => {
        const tokenPrompt = [
          prompt,
          "",
          `Create distinct token art for ${token.name}.`,
          `Scene: ${selectedScene.name}.`,
          `Disposition: ${token.disposition}.`,
          token.notes ? `Token notes: ${token.notes.slice(0, 240)}` : ""
        ].filter(Boolean).join("\n");
        await apiPost(`/api/v1/campaigns/${campaignId}/ai/generate-token-asset`, {
          prompt: tokenPrompt,
          name: `${token.name} Generated Token`,
          tokenId: token.id,
          size: "1024x1024",
          quality: "low",
          outputFormat: "png"
        });
      }));
      setStatus(`Token art proposals drafted for ${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}`);
      await refresh();
    });
  }

  async function replayAiThread(thread: AiThread) {
    const prompt = (thread.prompt ?? thread.title).trim();
    if (!prompt) return;
    setAiPrompt(prompt);
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/threads`, { prompt });
    setStatus("AI thread replayed");
    await refresh();
  }

  async function retryAiToolCall(toolCall: AiToolCall) {
    const result = await apiPost<{ matched: number; retried: number; skipped: number; completed: number; failed: number }>(`/api/v1/campaigns/${campaignId}/ai/tool-calls/${toolCall.id}/retry`, {});
    setStatus(`Retried ${result.retried} ${toolCall.toolName} call; ${result.completed} completed, ${result.failed} failed, ${result.skipped} skipped`);
    await refresh();
  }

  async function recapSession() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/session-recap`, {});
    setStatus("Session recap queued for approval");
    await refresh();
  }

  async function extractMemory() {
    await apiPost(`/api/v1/campaigns/${campaignId}/ai/memory/extract`, {
      sourceText: aiPrompt.trim() || undefined
    });
    setStatus("Memory extraction queued");
    await refresh();
  }

  async function approveAndApply(proposal: Proposal) {
    if (blankCanvasDemoOpen) return applyBlankCanvasDemoProposal(proposal);
    const sceneIdToOpen = sceneIdToOpenAfterProposalApply(proposal);
    const steps = proposalReviewSteps(proposal);
    if (!steps.includes("apply")) throw new Error(`Proposal is ${proposal.status} and cannot be applied.`);
    if (steps.includes("approve")) await apiPost(`/api/v1/proposals/${proposal.id}/approve`, {});
    const applied = await apiPost<Proposal>(`/api/v1/proposals/${proposal.id}/apply`, {});
    setSnapshot((current) => applyProposalChangesToSnapshot(current, applied));
    const appliedSceneId = sceneIdToOpenAfterProposalApply(applied) ?? sceneIdToOpen;
    if (appliedSceneId) {
      setSceneId(appliedSceneId);
      setStatus("Proposal applied; opened scene");
      await refresh(campaignId, appliedSceneId);
      return { applied, openedSceneId: appliedSceneId };
    }
    setStatus("Proposal applied");
    await refresh();
    return { applied };
  }

  function applyBlankCanvasDemoProposal(proposal: Proposal): { applied: Proposal; openedSceneId?: string } {
    const timestamp = new Date().toISOString();
    const history: NonNullable<Proposal["history"]> = [...(proposal.history ?? [])];
    if (proposal.status === "pending") {
      history.push({
        action: "approved",
        status: "approved",
        previousStatus: "pending",
        at: timestamp,
        actorUserId: currentUserId,
        actorType: "user",
        note: "Approved in stateless demo mode."
      });
    }
    history.push({
      action: "applied",
      status: "applied",
      previousStatus: proposal.status === "pending" ? "approved" : proposal.status,
      at: timestamp,
      actorUserId: currentUserId,
      actorType: "user",
      note: "Applied to local demo state only."
    });
    const applied: Proposal = {
      ...proposal,
      status: "applied",
      approvedByUserId: proposal.approvedByUserId ?? currentUserId,
      history,
      updatedAt: timestamp
    };
    setSnapshot((current) => applyProposalChangesToSnapshot(current, applied));
    const openedSceneId = sceneIdToOpenAfterProposalApply(applied);
    if (openedSceneId) setSceneId(openedSceneId);
    setStatus(openedSceneId ? "Demo proposal applied; opened scene" : "Demo proposal applied locally");
    return openedSceneId ? { applied, openedSceneId } : { applied };
  }

  async function autoApplyAiAgentProposals(proposalIds: string[], sourceSnapshot: Snapshot) {
    if (!hasPermission("ai.applyChanges")) {
      const message = "Auto approve needs AI apply permission; proposals are waiting for review.";
      setAiAgentStatus("Auto approve unavailable");
      setAiAgentMessages((messages) => [...messages, { id: `agent-auto-apply-permission-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      return;
    }

    const proposalsToApply = proposalIds
      .map((proposalId) => sourceSnapshot.proposals.find((proposal) => proposal.id === proposalId))
      .filter((proposal): proposal is Proposal => Boolean(proposal))
      .filter((proposal) => proposal.status === "pending" || proposal.status === "approved");
    if (proposalsToApply.length === 0) return;

    setAiAgentStatus(`Auto-approving ${proposalsToApply.length} proposal${proposalsToApply.length === 1 ? "" : "s"}`);
    let appliedCount = 0;
    let failedCount = 0;
    for (const proposal of proposalsToApply) {
      hideAiAgentProposal(proposal.id);
      try {
        await approveAndApply(proposal);
        appliedCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = errorMessage(error);
        if (isProposalNotFoundError(error)) {
          setSnapshot((current) => ({ ...current, proposals: current.proposals.filter((item) => item.id !== proposal.id) }));
        }
        setAiAgentMessages((messages) => [...messages, { id: `agent-auto-apply-error-${proposal.id}-${Date.now()}`, role: "system", content: `Auto approve failed for ${proposal.id}: ${message}`, createdAt: new Date().toISOString() }]);
      }
    }

    const message =
      failedCount > 0
        ? `Auto-approved ${appliedCount} proposal${appliedCount === 1 ? "" : "s"}; ${failedCount} failed.`
        : `Auto-approved and applied ${appliedCount} proposal${appliedCount === 1 ? "" : "s"}.`;
    setAiAgentStatus(message);
    setAiAgentMessages((messages) => [...messages, { id: `agent-auto-apply-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
  }

  async function applyAiAgentProposal(proposal: Proposal) {
    hideAiAgentProposal(proposal.id);
    setAiAgentStatus(proposal.status === "pending" ? "Approving and applying proposal" : "Applying proposal");
    try {
      const result = await approveAndApply(proposal);
      const message = result.openedSceneId ? "Proposal applied; opened scene" : "Proposal applied";
      setAiAgentStatus(message);
      setAiAgentMessages((messages) => [...messages, { id: `agent-apply-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
    } catch (error) {
      const message = errorMessage(error);
      if (isProposalNotFoundError(error)) {
        setSnapshot((current) => ({ ...current, proposals: current.proposals.filter((item) => item.id !== proposal.id) }));
        setAiAgentStatus("Proposal no longer exists");
        setAiAgentMessages((messages) => [...messages, { id: `agent-apply-missing-${Date.now()}`, role: "system", content: `Proposal ${proposal.id} no longer exists.`, createdAt: new Date().toISOString() }]);
        refresh().catch(() => undefined);
        return;
      }
      if (isSessionAuthError(error)) {
        requireInteractiveSignIn(`Sign in required. ${message}`);
        setAiAgentStatus("Sign in required");
        return;
      }
      setAiAgentStatus(`Apply failed: ${message}`);
      setAiAgentMessages((messages) => [...messages, { id: `agent-apply-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
    }
  }

  async function rejectAiAgentProposal(proposal: Proposal) {
    hideAiAgentProposal(proposal.id);
    setAiAgentStatus("Rejecting proposal");
    try {
      await rejectProposalReview(proposal);
      const message = "Proposal rejected";
      setAiAgentStatus(message);
      setAiAgentMessages((messages) => [...messages, { id: `agent-reject-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
    } catch (error) {
      const message = errorMessage(error);
      if (isProposalNotFoundError(error)) {
        setSnapshot((current) => ({ ...current, proposals: current.proposals.filter((item) => item.id !== proposal.id) }));
        setAiAgentStatus("Proposal no longer exists");
        setAiAgentMessages((messages) => [...messages, { id: `agent-reject-missing-${Date.now()}`, role: "system", content: `Proposal ${proposal.id} no longer exists.`, createdAt: new Date().toISOString() }]);
        refresh().catch(() => undefined);
        return;
      }
      if (isSessionAuthError(error)) {
        requireInteractiveSignIn(`Sign in required. ${message}`);
        setAiAgentStatus("Sign in required");
        return;
      }
      setAiAgentStatus(`Reject failed: ${message}`);
      setAiAgentMessages((messages) => [...messages, { id: `agent-reject-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
    }
  }

  function hideAiAgentProposal(proposalId: string) {
    setAiAgentHiddenProposalIds((proposalIds) => new Set([...proposalIds, proposalId]));
  }

  async function rejectProposalReview(proposal: Proposal) {
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const history: NonNullable<Proposal["history"]> = [
        ...(proposal.history ?? []),
        {
          action: "rejected",
          status: "rejected",
          previousStatus: proposal.status,
          at: timestamp,
          actorUserId: currentUserId,
          actorType: "user",
          note: "Rejected in stateless demo mode."
        }
      ];
      const rejected: Proposal = {
        ...proposal,
        status: "rejected",
        history,
        updatedAt: timestamp
      };
      setSnapshot((current) => ({ ...current, proposals: current.proposals.map((item) => (item.id === proposal.id ? rejected : item)) }));
      setStatus("Demo proposal rejected locally");
      return;
    }
    await apiPost(`/api/v1/proposals/${proposal.id}/reject`, {});
    setStatus("Proposal rejected");
    await refresh();
  }

  async function approveMemory(fact: AiMemoryFact) {
    await apiPost(`/api/v1/ai/memory/${fact.id}/approve`, {});
    setStatus("Memory approved");
    await refresh();
  }

  async function deleteMemory(fact: AiMemoryFact) {
    await apiDelete(`/api/v1/ai/memory/${fact.id}`);
    setStatus("Memory deleted");
    await refresh();
  }

  async function installPlugin(plugin: PluginRuntimeInfo, version?: string) {
    await apiPost(`/api/v1/campaigns/${campaignId}/plugins/${plugin.id}/install`, {
      permissions: plugin.permissionReview?.requestedPermissions ?? plugin.permissions,
      version
    });
    const action = plugin.installed && version ? (version === plugin.distribution.latestVersion ? "upgraded" : "rolled back") : "installed";
    setStatus(`${plugin.name} ${action}`);
    await refresh();
  }

  async function syncPluginRegistries() {
    try {
      const result = await apiPost<{ registries: unknown[]; plugins: unknown[] }>("/api/v1/plugins/registry/sync", { campaignId });
      setStatus(`Plugin registries synced: ${result.registries.length} registries, ${result.plugins.length} packages`);
      await refresh();
    } catch (error) {
      setStatus(`Plugin registry sync failed: ${errorMessage(error)}`);
    }
  }

  async function installSystem(system: SystemRuntimeInfo) {
    await apiPost(`/api/v1/campaigns/${campaignId}/systems/${system.id}/install`, {});
    setStatus(`${system.name} activated`);
    await refresh();
  }

  async function runPluginCommand(plugin: PluginRuntimeInfo, command: string) {
    await apiPost(`/api/v1/campaigns/${campaignId}/plugins/${plugin.id}/chat-command`, {
      command,
      args: "from the browser tabletop"
    });
    setStatus(`${plugin.name} command ran`);
    await refresh();
  }

  async function rollSystemCheck() {
    if (!selectedActor) return;
    await apiPost(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/roll`, {
      rollId: systemRollId(selectedActor.systemId)
    });
    setStatus("System roll posted");
    await refresh();
  }

  async function useActorAction(rollId: string, options: ActorActionCommitOptions = {}) {
    if (!selectedActor) return;
    try {
      const used = await apiPost<{ actor?: Actor; updatedActors?: Actor[]; usage?: { consumed?: Array<{ label: string; remaining: number }> }; effect?: { type: string; targetActorId: string; amount?: number }; resolution?: ActorActionResolutionPreview; combatAction?: CombatAction }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/roll`, {
        rollId,
        consumeResources: options.consumeResources ?? true,
        applyEffect: options.applyEffect,
        targetActorId: options.targetActorId,
        saveOutcomes: options.saveOutcomes,
        effectChoice: options.effectChoice
      });
      if (used.combatAction?.status === "pending_gm") {
        setStatus(`${selectedActor.name} action pending GM confirmation`);
        await refresh();
        return;
      }
      const spent = used.usage?.consumed?.map((item) => `${item.label} ${item.remaining}`).join(", ");
      const applied = used.effect ? `; ${used.effect.type} applied` : "";
      const updatedActors = used.updatedActors && used.updatedActors.length > 0 ? used.updatedActors : used.actor ? [used.actor] : [];
      if (updatedActors.length > 0) {
        const updates = new Map(updatedActors.map((updatedActor) => [updatedActor.id, updatedActor]));
        setSnapshot((current) => ({ ...current, actors: current.actors.map((actor) => updates.get(actor.id) ?? actor) }));
      }
      setStatus(spent ? `${selectedActor.name} used action: ${spent}${applied}` : `${selectedActor.name} action posted${applied}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function importCompendiumEntry(entry: RulesCompendiumEntry) {
    if (!selectedActor) return;
    const imported = await apiPost<{ entry: RulesCompendiumEntry; item?: Item; actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/compendium`, {
      entryId: entry.id
    });
    setCompendiumStatus(`${imported.entry.name} ${imported.item ? "added to sheet" : "applied to actor"}`);
    setStatus(`${imported.entry.name} imported`);
    await refresh();
  }

  async function purchaseCompendiumEntry(entry: RulesCompendiumEntry, quantity: number) {
    if (!selectedActor) return;
    const purchased = await apiPost<{ entry: RulesCompendiumEntry; purchase: { totalCostGp: number; currency: Record<string, number> }; item: Item; actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/purchase`, {
      entryId: entry.id,
      quantity
    });
    setCompendiumStatus(`${purchased.entry.name} purchased for ${formatGp(purchased.purchase.totalCostGp)}; ${formatCurrency(purchased.purchase.currency)} remaining`);
    setStatus(`${purchased.entry.name} purchased`);
    await refresh();
  }

  async function createCharacterFromTemplate(template: CharacterTemplateInfo) {
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${template.systemId}/characters`, {
      templateId: template.id,
      name: template.name,
      ownerUserId: currentUserId
    });
    setStatus(`${created.actor.name} created`);
    await refresh();
  }

  async function openCharacterCreator() {
    // Resolve origins BEFORE opening so the step list never reshuffles under
    // the user. Origin catalogs exist only for the D&D SRD runtime; other
    // systems get the simple name-and-template flow.
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (system) {
      try {
        setCharacterOrigins(await apiGet<CharacterOriginsInfo>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/character-origins`));
      } catch {
        setCharacterOrigins(undefined);
      }
    } else {
      setCharacterOrigins(undefined);
    }
    setCharacterCreatorOpen(true);
  }

  async function createCharacterFromCreator(template: CharacterTemplateInfo, input: CharacterCreateInput) {
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${template.systemId}/characters`, {
      templateId: template.id,
      ...input,
      name: input.name.trim() || template.name
    });
    setCharacterCreatorOpen(false);
    setStatus(`${created.actor.name} joined the party`);
    setTab("actors");
    await refresh();
  }

  async function importSystemCharacter() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const payload = systemImportPayload(system.id, currentUserId);
    const imported = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/characters/import`, payload);
    setImportedActor(imported.actor);
    setStatus(`${imported.actor.name} imported`);
    await refresh();
  }

  async function createSystemMonster() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/monsters`, {
      threatId: systemEncounterThreatId(system.id)
    });
    setCreatedMonster(created.actor);
    setStatus(`${created.actor.name} monster created`);
    await refresh();
  }

  async function advanceSelectedActor(optionId?: string, choices: { featId?: string; abilityChoices?: Record<string, number>; multiclassInto?: string } = {}) {
    if (!selectedActor) return;
    const selectedOptionId = optionId || advancementOptions[0]?.id || systemAdvancementOptionId(selectedActor.systemId);
    const advanced = await apiPost<{ advancement: { name: string }; actor?: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advance`, {
      optionId: selectedOptionId,
      ...(choices.featId ? { featId: choices.featId } : {}),
      ...(choices.abilityChoices ? { abilityChoices: choices.abilityChoices } : {}),
      ...(choices.multiclassInto ? { multiclassInto: choices.multiclassInto } : {})
    });
    if (advanced.actor) applyActorToSnapshot(advanced.actor);
    setStatus(choices.multiclassInto ? `${selectedActor.name} gained a level of ${choices.multiclassInto}` : `${selectedActor.name} advanced to ${advanced.advancement.name}`);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function restSelectedActor(restType: "short" | "long", options: { arcaneRecovery?: Record<string, number> } = {}) {
    if (!selectedActor) return;
    const rested = await apiPost<{ rest: { summary: string }; actor?: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/rest`, {
      restType,
      ...options
    });
    if (rested.actor) applyActorToSnapshot(rested.actor);
    setStatus(rested.rest.summary);
  }

  function planSystemEncounter() {
    setEncounterBuilderOpen(true);
  }

  async function spawnEncounterThreatTokens(threats: EncounterBuilderThreatSelection[]) {
    if (!selectedScene) {
      setStatus("Select a scene before placing encounter monsters");
      return;
    }
    let placed = 0;
    const total = threats.reduce((sum, threat) => sum + threat.count, 0);
    const spacing = Math.max(24, selectedScene.gridSize || 50);
    for (const threat of threats) {
      for (let index = 0; index < threat.count; index += 1) {
        const offsetIndex = placed - Math.floor(total / 2);
        await createToken({
          name: threat.count > 1 ? `${threat.name} ${index + 1}` : threat.name,
          disposition: "hostile",
          layer: "player",
          x: selectedScene.width / 2 + offsetIndex * spacing,
          y: selectedScene.height / 2 + (placed % 2 === 0 ? -spacing / 2 : spacing / 2)
        });
        placed += 1;
      }
    }
    setStatus(`Placed ${formatNumber(placed)} encounter monster${placed === 1 ? "" : "s"} on ${selectedScene.name}`);
  }

  async function disableAdminUser(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      disabled: true,
      disabledReason: "Disabled from admin console"
    });
    setAdminStatus(`${user.displayName} disabled`);
    await refreshAdmin();
  }

  async function enableAdminUser(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      disabled: false
    });
    setAdminStatus(`${user.displayName} enabled`);
    await refreshAdmin();
  }

  async function requireAdminPasswordReset(user: AdminUserInfo) {
    await apiPatch<AdminUserInfo>(`/api/v1/admin/users/${user.id}`, {
      passwordResetRequired: true
    });
    setAdminStatus(`${user.displayName} must reset password`);
    await refreshAdmin();
  }

  async function issueAdminPasswordReset(user: AdminUserInfo) {
    const reset = await apiPost<AdminPasswordResetInfo>(`/api/v1/admin/users/${user.id}/password-reset`, {
      returnTo: `${window.location.origin}/reset-password`
    });
    setAdminStatus(`Queued ${reset.email.status} reset email for ${reset.email.to}`);
    await refreshAdmin();
  }

  async function revokeAdminUserSessions(user: AdminUserInfo) {
    const result = await apiDelete<{ revoked: number }>(`/api/v1/admin/users/${user.id}/sessions`);
    setAdminStatus(`Revoked ${result.revoked} sessions for ${user.displayName}`);
    await refreshAdmin();
  }

  async function revokeAdminSession(session: AdminSessionInfo) {
    await apiDelete<{ ok: boolean }>(`/api/v1/admin/sessions/${session.id}`);
    setAdminStatus(`Revoked session for ${session.user.displayName}`);
    await refreshAdmin();
  }

  async function revokeAdminRiskSessions() {
    const staleDays = adminSnapshot?.authOperations.sessions.staleDays ?? 30;
    const result = await apiPost<{ matched: number; revoked: number; remainingRiskSessionCount: number }>("/api/v1/admin/sessions/risk/revoke", {
      staleDays,
      reasons: ["expired", "stale", "disabled_user", "unknown_user"],
      dryRun: false
    });
    setAdminStatus(`Revoked ${result.revoked} of ${result.matched} risk sessions; ${result.remainingRiskSessionCount} remain`);
    await refreshAdmin();
  }

  async function pruneExpiredPasswordResets() {
    const result = await apiPost<{ matched: number; pruned: number; expiredRemaining: number }>("/api/v1/admin/password-resets/prune", {
      includeExpired: true,
      includeUsed: false,
      dryRun: false
    });
    setAdminStatus(`Pruned ${result.pruned} of ${result.matched} expired password resets; ${result.expiredRemaining} remain`);
    await refreshAdmin();
  }

  async function retryAdminEmail(email: EmailOutboxMessage) {
    const retried = await apiPost<EmailOutboxMessage>(`/api/v1/admin/email-outbox/${email.id}/retry`, {});
    setAdminStatus(`Email to ${retried.to} is ${retried.status}`);
    await refreshAdmin();
  }

  async function retryAllAdminEmails() {
    const result = await apiPost<AdminEmailOutboxRetryAllResult>("/api/v1/admin/email-outbox/retry-all", {
      status: "retryable",
      dryRun: false
    });
    setAdminStatus(`Retried ${result.retried} emails; ${result.delivered} delivered, ${result.failed} failed, ${result.skipped} skipped`);
    await refreshAdmin();
  }

  async function retryAdminAiToolCall(toolCallId: string, toolName: string) {
    const result = await apiPost<{ matched: number; retried: number; skipped: number; completed: number; failed: number }>("/api/v1/admin/ai/tool-calls/retry", {
      toolCallId,
      dryRun: false
    });
    setAdminStatus(`Retried ${result.retried} ${toolName} call; ${result.completed} completed, ${result.failed} failed, ${result.skipped} skipped`);
    await refreshAdmin();
  }

  async function failStaleAiThreads() {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/threads/stale/fail", {
      dryRun: false
    });
    setAdminStatus(`Marked ${result.updated} of ${result.matched} stale AI threads failed`);
    await refreshAdmin();
  }

  async function failStaleAiToolCalls() {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/tool-calls/stale/fail", {
      dryRun: false
    });
    setAdminStatus(`Marked ${result.updated} of ${result.matched} stale AI tool calls failed`);
    await refreshAdmin();
  }

  async function rejectStaleAiProposals(includeApproved = false) {
    const result = await apiPost<{ matched: number; updated: number }>("/api/v1/admin/ai/proposals/stale/reject", {
      dryRun: false,
      includeApproved
    });
    setAdminStatus(`Rejected ${result.updated} of ${result.matched} stale ${includeApproved ? "approved" : "pending"} AI proposals`);
    await refreshAdmin();
  }

  async function cleanupStoredAssetBytes() {
    const result = await apiPost<{ deleted: number; missingMarked: number; skipped: number; failed: number }>("/api/v1/admin/assets/cleanup", {
      includeDeleted: true,
      includeExpired: true,
      dryRun: false
    });
    setAdminStatus(`Cleaned ${result.deleted} asset objects, marked ${result.missingMarked} missing, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
  }

  async function migrateStoredAssetBytes() {
    const result = await apiPost<{ migrated: number; skipped: number; failed: number; targetProvider: string }>("/api/v1/admin/assets/migrate", {
      includeDeleted: false,
      dryRun: false
    });
    setAdminStatus(`Migrated ${result.migrated} assets to ${result.targetProvider}, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
  }

  async function purgeAssetCdnCache(assetId: string, assetName: string) {
    const result = await apiPost<{ status: string }>(`/api/v1/admin/assets/${assetId}/purge-cache`, {
      reason: "Purged from admin console"
    });
    setAdminStatus(`${assetName} CDN purge ${result.status}`);
    await refreshAdmin();
  }

  async function quarantineAssetIntegrityFailures() {
    const result = await apiPost<AdminAssetIntegrityQuarantineResult>("/api/v1/admin/assets/integrity/quarantine", {
      dryRun: false,
      reason: "Archived from admin integrity console"
    });
    setAdminStatus(`Archived ${result.archived} broken assets, skipped ${result.skipped}, failed ${result.failed}`);
    await refreshAdmin();
    await refresh();
  }

  async function updatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus) {
    await apiPatch<AdminPluginReviewInfo>(`/api/v1/admin/plugins/reviews/${encodeURIComponent(review.review.reviewKey)}`, {
      status,
      notes: status === "approved" ? "Approved from admin console" : status === "rejected" ? "Rejected from admin console" : undefined
    });
    setAdminStatus(`${review.plugin.name} ${status}`);
    await refreshAdmin();
    await refresh();
  }

  async function syncAdminPluginRegistries() {
    const result = await apiPost<{ registries: unknown[]; plugins: unknown[] }>("/api/v1/admin/plugins/registry/sync", {});
    setAdminStatus(`Synced ${result.registries.length} registries and imported ${result.plugins.length} plugin packages`);
    await refreshAdmin();
    await refresh();
  }

  async function createScimGroupRoleMapping(input: AdminScimGroupRoleMappingInput) {
    const result = await apiPost<AdminScimGroupRoleMappingResult>("/api/v1/admin/scim/group-role-mappings", input);
    setAdminStatus(`Mapped ${scimMappingLabel(result.mapping)} with ${result.sync.createdMemberships} created, ${result.sync.updatedMemberships} updated`);
    await refreshAdmin();
    await refresh(input.campaignId);
  }

  async function deleteScimGroupRoleMapping(mapping: AdminScimGroupRoleMapping) {
    const result = await apiDelete<{ removedMemberships: number }>(`/api/v1/admin/scim/group-role-mappings/${mapping.id}`);
    setAdminStatus(`Removed ${scimMappingLabel(mapping)} and ${result.removedMemberships} sourced memberships`);
    await refreshAdmin();
    await refresh(mapping.campaignId);
  }

  async function exportCampaign() {
    setArchiveExportStatus("Preparing archive export");
    const params = new URLSearchParams({
      scope: archiveExportScope,
      version: archiveExportVersion,
      redaction: archiveRedactionMode
    });
    const archive = await apiGet<object>(`/api/v1/campaigns/${campaignId}/export?${params.toString()}`);
    downloadJson(`${selectedCampaign?.name ?? "campaign"}.ottx.json`, archive);
    setArchiveExportStatus(`${selectedCampaign?.name ?? "Campaign"} archive exported as ${archiveExportVersion}`);
  }

  async function exportDogfoodReportBundle() {
    const report = await apiGet<object>(`/api/v1/campaigns/${campaignId}/dogfood-report-bundle`);
    downloadJson(`${selectedCampaign?.name ?? "campaign"}-dogfood-report-bundle.json`, report);
    setStatus("Dogfood report bundle exported");
  }

  async function previewContentImport(entities?: ContentImportDraftEntity[], source?: ContentImportPreviewSource) {
    const importEntities = entities && entities.length > 0 ? entities : [{ kind: contentImportKind, name: contentImportName, body: contentImportBody }];
    const normalizedEntities = importEntities.map((entity) => ({ ...entity, name: entity.name.trim() })).filter((entity) => entity.name.length > 0);
    if (normalizedEntities.length === 0) return;
    const batch = await apiPost<ContentImportBatch>(`/api/v1/campaigns/${campaignId}/content-imports/preview`, {
      source: source ?? {
        sourceType: "manual",
        sourceName: "Web manual content import",
        license: {
          name: "User-provided private table content",
          usage: "private_home_game"
        }
      },
      entities: normalizedEntities.map((entity) => ({
        kind: entity.kind,
        name: entity.name,
        selectedByDefault: true,
        data: contentImportEntityData(entity.kind, entity.body)
      }))
    });
    setContentImportStatus(`Previewed ${batch.entities.length} ${batch.entities.length === 1 ? "record" : "records"}`);
    setStatus("Content import previewed");
    await refresh(campaignId, sceneId);
  }

  async function analyzePdfContentImport(file: File) {
    setContentImportStatus(`Analyzing ${file.name || "PDF"} with Codex PDF import`);
    const batch = await apiAnalyzePdfContentImport({ campaignId, file });
    setContentImportStatus(`Previewed ${batch.entities.length} PDF ${batch.entities.length === 1 ? "record" : "records"}`);
    setStatus("PDF content import previewed");
    await refresh(campaignId, sceneId);
  }

  async function applyContentImport(batch: ContentImportBatch, selectedEntityIds?: string[]) {
    const entityIds = selectedEntityIds ?? (batch.selectedEntityIds.length > 0 ? batch.selectedEntityIds : batch.entities.filter((entity) => entity.selectedByDefault).map((entity) => entity.id));
    const updated = await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/apply`, { selectedEntityIds: entityIds });
    setContentImportStatus(`Applied ${updated.appliedRecords.length} ${updated.appliedRecords.length === 1 ? "record" : "records"}`);
    setStatus("Content import applied");
    await refresh(campaignId, sceneId);
  }

  async function rollbackContentImport(batch: ContentImportBatch) {
    await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/rollback`, {});
    setContentImportStatus(`Rolled back ${batch.source.sourceName}`);
    setStatus("Content import rolled back");
    await refresh(campaignId, sceneId);
  }

  async function deleteContentImport(batch: ContentImportBatch) {
    await apiDelete<ContentImportBatch>(`/api/v1/content-imports/${batch.id}`);
    setContentImportStatus(`Deleted ${batch.source.sourceName}`);
    setStatus("Content import deleted");
    await refresh(campaignId, sceneId);
  }

  if (resetMode) {
    return (
      <main className="auth-shell">
        <section className="reset-panel" aria-labelledby="reset-title">
          <div className="reset-mark">
            <LockKeyhole size={22} />
          </div>
          <div>
            <div className="eyebrow">Account</div>
            <h1 id="reset-title">Reset Password</h1>
          </div>
          <form
            className="reset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitResetRequest().catch((error) => setResetStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <label>
              <span>Email</span>
              <input aria-label="Reset email" type="email" autoComplete="email" required value={resetEmail} placeholder="player@example.com" onChange={(event) => setResetEmail(event.target.value)} />
            </label>
            <button className="ghost-button wide" type="submit" disabled={!resetEmail.trim()}>
              <Send size={16} /> Send
            </button>
          </form>
          <form
            className="reset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitResetConfirm().catch((error) => setResetStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <label>
              <span>Token</span>
              <input aria-label="Reset token" autoComplete="one-time-code" required value={resetToken} placeholder="opr_..." onChange={(event) => setResetToken(event.target.value)} />
            </label>
            <label>
              <span>New Password</span>
              <input aria-label="New password" type="password" autoComplete="new-password" minLength={8} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
            </label>
            <label>
              <span>Confirm Password</span>
              <input aria-label="Confirm password" type="password" autoComplete="new-password" minLength={8} required value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} />
            </label>
            <button className="primary-button wide" type="submit" disabled={!resetToken.trim() || resetPassword.length < 8 || !resetPasswordConfirm}>
              <Check size={16} /> Reset
            </button>
          </form>
          <div className="status reset-status">{resetStatus}</div>
        </section>
      </main>
    );
  }

  if (bootstrapRequired) {
    return (
      <main className="auth-shell">
        <section className="reset-panel" aria-labelledby="bootstrap-title">
          <div className="reset-mark">
            <Shield size={22} />
          </div>
          <div>
            <div className="eyebrow">First Run</div>
            <h1 id="bootstrap-title">Create Owner</h1>
          </div>
          <form
            className="reset-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitBootstrapOwner().catch((error) => setBootstrapStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <label>
              <span>Email</span>
              <input aria-label="Owner email" type="email" autoComplete="email" required value={bootstrapEmail} placeholder="gm@example.com" onChange={(event) => setBootstrapEmail(event.target.value)} />
            </label>
            <label>
              <span>Name</span>
              <input aria-label="Owner display name" autoComplete="name" required value={bootstrapName} placeholder="Game Master" onChange={(event) => setBootstrapName(event.target.value)} />
            </label>
            <label>
              <span>Password</span>
              <input aria-label="Owner password" type="password" autoComplete="new-password" minLength={8} required value={bootstrapPassword} onChange={(event) => setBootstrapPassword(event.target.value)} />
            </label>
            <label>
              <span>Campaign</span>
              <input aria-label="Initial campaign name" required value={bootstrapCampaignName} onChange={(event) => setBootstrapCampaignName(event.target.value)} />
            </label>
            <button className="primary-button wide" type="submit" disabled={!bootstrapEmail.trim() || !bootstrapName.trim() || bootstrapPassword.length < 8 || !bootstrapCampaignName.trim()}>
              <Check size={16} /> Create
            </button>
          </form>
          <div className="status reset-status">{bootstrapStatus}</div>
        </section>
      </main>
    );
  }

  if (authRequired) {
    return (
      <main className="auth-shell">
        <section className="reset-panel auth-panel" aria-labelledby="auth-title">
          <div className="reset-mark">
            <KeyRound size={22} />
          </div>
          <div>
            <div className="eyebrow">Account</div>
            <h1 id="auth-title">{authMode === "login" || !publicRegistration ? "Sign In" : "Register"}</h1>
          </div>
          {joinToken.trim() && (
            <form
              className="reset-form"
              onSubmit={(event) => {
                event.preventDefault();
                acceptInvite().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)));
              }}
            >
              <div className="section-title">Accept Invite</div>
              <label>
                <span>Invite Token</span>
                <input aria-label="Public invite token" value={joinToken} placeholder="oti_..." onChange={(event) => setJoinToken(event.target.value)} />
              </label>
              <label>
                <span>Email</span>
                <input aria-label="Join email" type="email" autoComplete="email" required value={joinEmail} placeholder="player@example.com" onChange={(event) => setJoinEmail(event.target.value)} />
              </label>
              <label>
                <span>Name</span>
                <input aria-label="Display name" autoComplete="name" required value={joinName} placeholder="Display name" onChange={(event) => setJoinName(event.target.value)} />
              </label>
              <label>
                <span>Password</span>
                <input aria-label="Join password" type="password" autoComplete="new-password" minLength={8} required value={joinPassword} placeholder="Password" onChange={(event) => setJoinPassword(event.target.value)} />
              </label>
              <button className="primary-button wide" type="submit" disabled={!joinToken.trim() || !joinEmail.trim() || !joinName.trim() || joinPassword.length < 8}>
                <UserPlus size={16} /> Accept Invite
              </button>
            </form>
          )}
          <div className="auth-mode-tabs" role="tablist" aria-label="Account mode">
            <button className={authMode === "login" ? "tab active" : "tab"} type="button" onClick={() => setAuthMode("login")}>
              <KeyRound size={15} /> Login
            </button>
            {publicRegistration && (
              <button className={authMode === "register" ? "tab active" : "tab"} type="button" onClick={() => setAuthMode("register")}>
                <UserPlus size={15} /> Register
              </button>
            )}
          </div>
          {authMode === "login" || !publicRegistration ? (
            <form
              className="reset-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitLogin().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)));
              }}
            >
              <label>
                <span>Email</span>
                <input aria-label="Login email" type="email" autoComplete="email" required value={loginEmail} placeholder="player@example.com" onChange={(event) => setLoginEmail(event.target.value)} />
              </label>
              <label>
                <span>Password</span>
                <input aria-label="Login password" type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
              </label>
              {(Boolean(loginMfaCode) || /mfa/i.test(authStatus)) && (
                <label>
                  <span>MFA Code</span>
                  <input aria-label="Login MFA code" inputMode="numeric" autoComplete="one-time-code" value={loginMfaCode} placeholder="6-digit code" onChange={(event) => setLoginMfaCode(event.target.value)} />
                </label>
              )}
              <button className="primary-button wide" type="submit" disabled={!loginEmail.trim() || !loginPassword}>
                <KeyRound size={16} /> Login
              </button>
            </form>
          ) : (
            <form
              className="reset-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitRegister().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)));
              }}
            >
              <label>
                <span>Email</span>
                <input aria-label="Register email" type="email" autoComplete="email" required value={registerEmail} placeholder="player@example.com" onChange={(event) => setRegisterEmail(event.target.value)} />
              </label>
              <label>
                <span>Name</span>
                <input aria-label="Register display name" autoComplete="name" required value={registerName} placeholder="Display name" onChange={(event) => setRegisterName(event.target.value)} />
              </label>
              <label>
                <span>Password</span>
                <input aria-label="Register password" type="password" autoComplete="new-password" minLength={8} required value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} />
              </label>
              <button className="primary-button wide" type="submit" disabled={!registerEmail.trim() || !registerName.trim() || registerPassword.length < 8}>
                <UserPlus size={16} /> Register
              </button>
            </form>
          )}
          <div className="auth-actions">
            <div className="auth-actions-heading">Or try it without an account</div>
            <button className="ghost-button wide" type="button" aria-label={["Demo", "GM"].join(" ")} onClick={() => startDemoGmSession().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)))}>
              <Users size={16} /> Seeded Demo
            </button>
            <button className="ghost-button wide" type="button" onClick={startBlankCanvasDemo}>
              <MapIcon size={16} /> Try Blank Canvas
            </button>
            {ssoEnabled && (
              <button className="ghost-button wide" type="button" onClick={() => startSso().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)))}>
                <Shield size={16} /> SSO
              </button>
            )}
            <button
              className="ghost-button wide"
              type="button"
              onClick={() => {
                setResetMode(true);
                setResetStatus("Ready");
              }}
            >
              <Mail size={16} /> Reset
            </button>
          </div>
          {authStatus && <div className="status reset-status">{authStatus}</div>}
        </section>
      </main>
    );
  }

  if (!snapshotReady) {
    const apiOffline = status.startsWith("API offline");
    return (
      <main className="auth-shell">
        <section className="reset-panel auth-panel" aria-labelledby="snapshot-loading-title">
          <div className="reset-mark">
            <RefreshCw size={22} />
          </div>
          <div>
            <div className="eyebrow">{apiOffline ? "Connection" : "Workspace"}</div>
            <h1 id="snapshot-loading-title">{apiOffline ? "API connection required" : "Loading campaign"}</h1>
          </div>
          <div className={`status reset-status ${apiOffline ? "connection-status" : ""}`} role="status" aria-live="polite">{status}</div>
          {apiOffline && (
            <button className="ghost-button wide" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> Retry connection
            </button>
          )}
        </section>
      </main>
    );
  }

  const manageCategories = [
    { id: "account", label: "Account", description: "Profile, workspace, password, and MFA", icon: <UserCog size={16} />, badge: snapshot.organizations.length > 0 ? formatNumber(snapshot.organizations.length) : undefined },
    { id: "campaign", label: "Campaign", description: "Create, edit, archive, and permissions", icon: <Shield size={16} />, visible: canManageCampaignSettings, badge: selectedCampaign?.archivedAt ? "archived" : "active" },
    { id: "people", label: "People", description: "Invites and table joining", icon: <UserPlus size={16} />, visible: canManagePeople, badge: formatNumber(snapshot.organizationInvites.filter((invite) => invite.status === "pending").length) },
    { id: "scenes", label: "Scenes", description: "Scene creation, ordering, maps, and activation", icon: <MapPin size={16} />, visible: canManageScenes, badge: formatNumber(accessibleScenes.length) },
    { id: "archives", label: "Archives", description: "Portable exports, imports, and recovery", icon: <Download size={16} />, visible: canManageArchives, badge: archiveImportReport ? "ready" : undefined },
    { id: "serverAdmin", label: "Server Admin", description: "Operational admin tools", icon: <UserCog size={16} />, visible: Boolean(snapshot.session?.serverAdmin), badge: adminSnapshot ? "synced" : undefined }
  ] satisfies Array<{ id: ManageCategoryId; label: string; description: string; icon: React.ReactNode; badge?: string; visible?: boolean }>;
  const visibleManageCategories = manageCategories.filter((category) => category.visible !== false);
  const activeManageCategory = visibleManageCategories.some((category) => category.id === manageCategory) ? manageCategory : (visibleManageCategories[0]?.id ?? "account");
  const adminPanel = snapshot.session?.serverAdmin ? <AdminPanel admin={adminSnapshot} campaigns={snapshot.campaigns} systems={snapshot.systems} workspaceDefaults={snapshot.workspaceDefaults} organizationMembers={snapshot.organizationMembers} currentUserId={currentUserId} status={adminStatus} onRefresh={refreshAdmin} onDisableUser={disableAdminUser} onEnableUser={enableAdminUser} onRequireReset={requireAdminPasswordReset} onIssueReset={issueAdminPasswordReset} onRevokeUserSessions={revokeAdminUserSessions} onRevokeSession={revokeAdminSession} onRevokeRiskSessions={revokeAdminRiskSessions} onPruneExpiredPasswordResets={pruneExpiredPasswordResets} onRetryEmail={retryAdminEmail} onRetryAllEmails={retryAllAdminEmails} onRetryAiToolCall={retryAdminAiToolCall} onFailStaleAiThreads={failStaleAiThreads} onFailStaleAiToolCalls={failStaleAiToolCalls} onRejectStaleAiProposals={rejectStaleAiProposals} onCleanupStoredAssetBytes={cleanupStoredAssetBytes} onMigrateStoredAssetBytes={migrateStoredAssetBytes} onQuarantineAssetIntegrityFailures={quarantineAssetIntegrityFailures} onPurgeAssetCdnCache={purgeAssetCdnCache} onUpdatePluginReview={updatePluginReview} onSyncPluginRegistries={syncAdminPluginRegistries} onUpdateWorkspaceDefaults={updateOrganizationWorkspaceDefaults} onAddOrganizationMember={addOrganizationMember} onUpdateOrganizationMember={updateOrganizationMember} onRemoveOrganizationMember={deleteOrganizationMember} onCreateScimMapping={createScimGroupRoleMapping} onDeleteScimMapping={deleteScimGroupRoleMapping} /> : null;
  const accountOnlyManageMode = visibleManageCategories.length === 1 && visibleManageCategories[0]?.id === "account";
  const manageWorkspaceEyebrow = accountOnlyManageMode ? "Account" : "Manage";
  const manageWorkspaceHeading = accountOnlyManageMode ? (snapshot.session?.user.displayName ?? "Account settings") : (selectedCampaign?.name ?? "Workspace settings");
  const workspaceModeOptions = [
    { id: "live", label: "Live Table", icon: <Eye size={15} /> },
    ...(canUsePrepWorkspace ? [{ id: "prep" as const, label: "Prep", icon: <MapPin size={15} /> }] : []),
    { id: "manage", label: accountOnlyManageMode ? "Account" : "Manage", icon: accountOnlyManageMode ? <UserCog size={15} /> : <Boxes size={15} /> }
  ] satisfies Array<{ id: WorkspaceMode; label: string; icon: React.ReactNode }>;
  const selectWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
  };
  const buildPaletteCommands = (): PaletteCommand[] => {
    const commands: PaletteCommand[] = [];
    for (const mode of workspaceModeOptions) {
      commands.push({ id: `workspace:${mode.id}`, label: `Go to ${mode.label}`, section: "Workspace", keywords: "workspace mode switch view" });
    }
    commands.push({ id: "action:ai-agent", label: aiAgentOpen ? "Close AI Agent" : "Open AI Agent", section: "Actions", keywords: "assistant bot help" });
    commands.push({ id: "action:theme", label: `Switch theme to ${uiThemeLabel(nextUiTheme(uiTheme))}`, section: "Actions", keywords: "appearance midnight ember dark colors look" });
    commands.push({ id: "action:dice3d", label: dice3dEnabled ? "Use text-only dice" : "Enable 3D dice", section: "Actions", keywords: "dice animation roll tray three text only" });
    for (const scene of accessibleScenes) {
      commands.push({ id: `scene:${scene.id}`, label: `Open scene: ${scene.name}`, section: "Scenes", hint: scene.folder || undefined, keywords: "map board jump" });
    }
    for (const actor of snapshot.actors.slice(0, 24)) {
      commands.push({ id: `actor:${actor.id}`, label: `Select actor: ${actor.name}`, section: "Actors", keywords: "character npc token sheet select focus" });
    }
    if (canUsePrepWorkspace) {
      for (const journal of snapshot.journals.slice(0, 16)) {
        commands.push({ id: `journal:${journal.id}`, label: `Open journal: ${journal.title}`, section: "Journal", hint: journal.tags[0], keywords: "note entry log lore" });
      }
    }
    for (const campaign of snapshot.campaigns) {
      if (campaign.id !== campaignId) commands.push({ id: `campaign:${campaign.id}`, label: `Switch campaign: ${campaign.name}`, section: "Campaigns", keywords: "game world table" });
    }
    if (hasPermission("dice.roll")) {
      const formulas = [...new Set([...snapshot.diceMacros.map((macro) => macro.formula), ...savedDiceFormulas])].slice(0, 8);
      for (const formula of formulas) {
        commands.push({ id: `roll:${formula}`, label: `Roll ${formula}`, section: "Dice", keywords: "dice roll" });
      }
    }
    return commands;
  };
  const paletteCommands = commandPaletteOpen ? buildPaletteCommands() : [];
  const runPaletteCommand = (commandId: string) => {
    setCommandPaletteOpen(false);
    if (commandId.startsWith("workspace:")) {
      selectWorkspaceMode(commandId.slice("workspace:".length) as WorkspaceMode);
      return;
    }
    if (commandId.startsWith("scene:")) {
      setSceneId(commandId.slice("scene:".length));
      if (workspaceMode === "manage") setWorkspaceMode("live");
      return;
    }
    if (commandId.startsWith("campaign:")) {
      const nextCampaignId = commandId.slice("campaign:".length);
      setCampaignId(nextCampaignId);
      if (!blankCanvasDemoOpen) refresh(nextCampaignId).catch((error) => setStatus(errorMessage(error)));
      return;
    }
    if (commandId.startsWith("roll:")) {
      const formula = commandId.slice("roll:".length);
      setDiceFormula(formula);
      rollDice(formula).catch((error) => setStatus(errorMessage(error)));
      return;
    }
    if (commandId.startsWith("actor:")) {
      const actorId = commandId.slice("actor:".length);
      const token = snapshot.tokens.find((item) => item.actorId === actorId && item.sceneId === selectedScene?.id) ?? snapshot.tokens.find((item) => item.actorId === actorId);
      if (token) {
        if (token.sceneId !== sceneId) setSceneId(token.sceneId);
        selectSingleToken(token.id);
      }
      if (workspaceMode === "manage") setWorkspaceMode("live");
      setTab("actors");
      return;
    }
    if (commandId.startsWith("journal:")) {
      if (workspaceMode !== "prep") setWorkspaceMode("prep");
      setTab("journal");
      return;
    }
    if (commandId === "action:ai-agent") {
      setAiAgentOpen((open) => !open);
      return;
    }
    if (commandId === "action:dice3d") {
      setDice3dEnabled((enabled) => !enabled);
      return;
    }
    if (commandId === "action:theme") setUiTheme((current) => nextUiTheme(current));
  };
  const campaignSystemName = snapshot.systems.find((system) => system.id === selectedCampaign?.defaultSystemId)?.name ?? selectedCampaign?.defaultSystemId ?? "No system";
  const workspaceEyebrow = workspaceMode === "ai" ? "AI Studio" : workspaceMode === "prep" ? "Prep" : workspaceMode === "manage" ? manageWorkspaceEyebrow : campaignSystemName;
  const workspaceHeading = workspaceMode === "manage" ? manageWorkspaceHeading : (selectedCampaign?.name ?? "Create a campaign");
  const showSceneTabs = workspaceMode !== "manage" || activeManageCategory === "scenes";
  const showScenePrepControls = workspaceMode === "prep";
  const showSceneSelectionControls = workspaceMode === "prep" || (workspaceMode === "manage" && activeManageCategory === "scenes");
  const canSelectPrepScenes = showSceneSelectionControls && hasPermission("scene.update");
  const showQuickCreate = (workspaceMode === "live" || workspaceMode === "prep") && hasPermission("token.create");
  const showTableWorkspace = workspaceMode === "live" || workspaceMode === "prep";
  const encounterBuilderSystem = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
  const desktopRelay = desktopStatus?.relay;
  const desktopRelayState = desktopRelay?.state ?? "stopped";
  const desktopInviteUrl = desktopRelay?.inviteUrl ?? desktopRelay?.publicUrl ?? "";
  const inspectorTabs: InspectorTab[] = workspaceMode === "live"
    ? ["actors", "chat", "combat"]
    : ["actors", "journal", "content", "plugins"];
  const aiPanelElement = (
    <AiPanel
      prompt={aiPrompt}
      setPrompt={setAiPrompt}
      askAi={askAi}
      mapPrompt={aiMapPrompt}
      setMapPrompt={setAiMapPrompt}
      generateMapAsset={generateAiMapAsset}
      tokenPrompt={aiTokenPrompt}
      setTokenPrompt={setAiTokenPrompt}
      generateTokenAsset={generateAiTokenAsset}
      generateSceneTokenAssets={generateAiSceneTokenAssets}
      generationJobs={aiGenerationJobs}
      selectedSceneName={selectedScene?.name}
      selectedTokenId={selectedToken?.id}
      selectedTokenName={selectedToken?.name}
      tokenOptions={selectedSceneTokens}
      selectToken={selectSingleToken}
      tokenArtMissingCount={selectedSceneTokensNeedingArt.length}
      tokenArtPendingCount={selectedSceneTokensPendingArt.length}
      replayAiThread={replayAiThread}
      retryAiToolCall={retryAiToolCall}
      recapSession={recapSession}
      extractMemory={extractMemory}
      proposals={snapshot.proposals}
      records={snapshot}
      memory={snapshot.memory}
      aiThreads={snapshot.aiThreads}
      aiUsage={snapshot.aiUsage}
      aiToolCalls={snapshot.aiToolCalls}
      activeSystemName={(snapshot.systems.find((item) => item.active) ?? snapshot.systems[0])?.name}
      encounterPlan={encounterPlan}
      planEncounter={planSystemEncounter}
      approveAndApply={approveAndApply}
      rejectProposal={rejectProposalReview}
      approveMemory={approveMemory}
      deleteMemory={deleteMemory}
      canDraftEncounter={hasPermission("ai.proposeChanges") && hasPermission("campaign.update") && hasPermission("scene.create")}
      canPropose={hasPermission("ai.proposeChanges")}
      canApply={hasPermission("ai.applyChanges")}
      canPlanEncounter={Boolean(snapshot.systems.length > 0 && hasPermission("combat.manage"))}
      canGenerateMap={Boolean(selectedScene && !isAiGeneratingMap && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("scene.update"))}
      canGenerateToken={Boolean(selectedToken && !isAiGeneratingTokenArt && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("token.update"))}
      canGenerateTokenBatch={Boolean(selectedScene && !isAiGeneratingTokenArt && selectedSceneTokensNeedingArt.length > 0 && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("token.update"))}
    />
  );

  return (
    <main className="shell" aria-label="OpenTabletop workspace">
      <aside className={`rail rail-${workspaceMode} ${workspaceMode === "manage" ? "rail-manage" : "rail-play"}`}>
        <div className="brand-block">
          <div>
            <div className="brand">OpenTabletop</div>
          </div>
          <div className="rail-quick-actions">
            <button className="icon-button" type="button" title="Command palette (Ctrl+K)" aria-label="Open command palette" onClick={() => setCommandPaletteOpen(true)}>
              <Search size={15} />
            </button>
            <button className="icon-button" type="button" title={`Theme: ${uiThemeLabel(uiTheme)} - switch to ${uiThemeLabel(nextUiTheme(uiTheme))}`} aria-label="Switch color theme" onClick={() => setUiTheme((current) => nextUiTheme(current))}>
              {uiTheme === "midnight" ? <Moon size={15} /> : <Flame size={15} />}
            </button>
          </div>
        </div>
        {blankCanvasDemoOpen && (
          <section className="demo-mode-banner" aria-label="Demo mode">
            <span>{blankCanvasDemoNotice}</span>
            <button className="ghost-button small" type="button" onClick={exitBlankCanvasDemo}>
              Exit
            </button>
          </section>
        )}
        <nav className="campaign-list" aria-label="Campaigns">
          {snapshot.campaigns.map((campaign) => (
            <button
              className={campaign.id === campaignId ? "nav-item active" : "nav-item"}
              key={campaign.id}
              onClick={() => {
                setCampaignId(campaign.id);
                if (!blankCanvasDemoOpen) refresh(campaign.id).catch(console.error);
              }}
            >
              <Shield size={16} />
              <span>{campaign.name}</span>
            </button>
          ))}
        </nav>
        <label className="session-switcher">
          <span>Session</span>
          <select aria-label="Session user" value={currentUserId} disabled={blankCanvasDemoOpen} onChange={(event) => switchSession(event.target.value).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
            {snapshot.members.length === 0 ? (
              <option value={currentUserId}>{currentUserId}</option>
            ) : (
              snapshot.members.map((member) => (
                <option key={member.id} value={member.user.id}>
                  {member.user.displayName} - {member.role}
                </option>
              ))
            )}
          </select>
        </label>
        <p className="account-summary rail-session-summary">
          {snapshot.session?.user.displayName ?? currentUserId}
        </p>
        <div className="rail-mode workspace-mode-switcher" role="group" aria-label="Workspace mode">
          {workspaceModeOptions.map((mode) => (
            <button className={workspaceMode === mode.id ? "ghost-button active" : "ghost-button"} key={mode.id} type="button" aria-label={mode.label} title={mode.label} onClick={() => selectWorkspaceMode(mode.id)}>
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        <div className="rail-utilities-heading" aria-hidden="true">Utilities</div>
        {desktopAvailable && (
          <section className="desktop-host-panel" aria-label="Desktop host">
            <div className="operator-heading">
              <div className="section-title">Desktop Host</div>
              <span>{titleCaseLabel(desktopRelayState)}</span>
            </div>
            <p className="desktop-host-url">{desktopInviteUrl || desktopStatus?.webUrl || "Local server starting"}</p>
            <div className="button-row desktop-host-actions">
              {desktopRelayState === "connected" || desktopRelayState === "starting" ? (
                <button className="ghost-button small" type="button" disabled={desktopShareBusy} onClick={() => stopDesktopInternetShare().catch((error) => setStatus(errorMessage(error)))}>
                  <X size={14} /> Stop
                </button>
              ) : (
                <button className="primary-button small" type="button" disabled={desktopShareBusy} onClick={() => startDesktopInternetShare().catch((error) => setStatus(errorMessage(error)))}>
                  <Users size={14} /> Share
                </button>
              )}
              <button className="ghost-button small" type="button" disabled={!desktopInviteUrl} onClick={() => copyDesktopInviteLink().catch((error) => setStatus(errorMessage(error)))}>
                <UserPlus size={14} /> Copy
              </button>
            </div>
            <div className="button-row desktop-host-actions">
              <button className="icon-button" type="button" title="Open data folder" aria-label="Open data folder" onClick={() => openDesktopDataFolder().catch((error) => setStatus(errorMessage(error)))}>
                <Boxes size={14} />
              </button>
              <button className="icon-button" type="button" title="Export logs" aria-label="Export logs" onClick={() => exportDesktopLogs().catch((error) => setStatus(errorMessage(error)))}>
                <Download size={14} />
              </button>
              <button className="icon-button" type="button" title="Refresh desktop status" aria-label="Refresh desktop status" onClick={() => window.otteDesktop?.getDesktopStatus().then(setDesktopStatus).catch((error) => setStatus(errorMessage(error)))}>
                <RefreshCw size={14} />
              </button>
            </div>
            {desktopRelay?.lastError && <p className="desktop-host-error">{desktopRelay.lastError}</p>}
          </section>
        )}
        <button className={aiAgentOpen ? "ai-agent-toggle active" : "ai-agent-toggle"} type="button" onClick={() => setAiAgentOpen((open) => !open)} aria-label="AI Agent" title="AI Agent" aria-expanded={aiAgentOpen}>
          <Bot size={16} />
          <span className="ai-agent-toggle-label ai-agent-toggle-label-full">AI Agent</span>
          <span className="ai-agent-toggle-label ai-agent-toggle-label-compact" aria-hidden="true">
            AI
          </span>
        </button>
        {!blankCanvasDemoOpen && hasPermission("scene.update") && (
          <button className={audioSoundboardOpen ? "ai-agent-toggle active" : "ai-agent-toggle"} type="button" onClick={() => setAudioSoundboardOpen((open) => !open)} aria-label="Soundboard" title="Soundboard" aria-expanded={audioSoundboardOpen}>
            <Music size={16} />
            <span className="ai-agent-toggle-label ai-agent-toggle-label-full">Soundboard</span>
            <span className="ai-agent-toggle-label ai-agent-toggle-label-compact" aria-hidden="true">
              Aud
            </span>
          </button>
        )}
        <section className="party-rail" aria-label="Party">
          <div className="operator-heading">
            <div className="section-title">Party</div>
            {hasPermission("actor.create") ? (
              <button className="icon-button" type="button" aria-label="Open character creator" title="Create a character" onClick={() => void openCharacterCreator()}>
                <UserPlus size={14} />
              </button>
            ) : (
              <span>{formatNumber(partyActors.length)} actors</span>
            )}
          </div>
          <div className="party-list">
            {partyActors.map((actor) => (
              <button
                className={`${actor.id === selectedActor?.id ? "party-row selected" : "party-row"}${partyDropTargetActorId === actor.id ? " drop-target" : ""}`}
                key={actor.id}
                type="button"
                onDragEnter={(event) => handleRailItemDragOver(event, actor)}
                onDragOver={(event) => handleRailItemDragOver(event, actor)}
                onDragLeave={(event) => handleRailItemDragLeave(event, actor)}
                onDrop={(event) => giveDroppedItemToActor(event, actor)}
                onClick={() => {
                  const token = snapshot.tokens.find((item) => item.actorId === actor.id && item.sceneId === selectedScene?.id);
                  if (token) selectSingleToken(token.id);
                  setTab("actors");
                }}
              >
                <span className="party-avatar">{actor.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{actor.name}</strong>
                  <small>{actorRailSubtitle(actor)}</small>
                </span>
              </button>
            ))}
            {partyActors.length === 0 && (
              <div className="party-empty-state">
                <p className="account-summary">No party actors yet.</p>
                {hasPermission("actor.create") && (
                  <button className="ghost-button small" type="button" aria-label="Open character creator from party rail" onClick={() => void openCharacterCreator()}>
                    <UserPlus size={14} /> Open character creator
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        <section className="party-rail adversary-rail" aria-label="Adversaries">
          <div className="operator-heading">
            <div className="section-title">Adversaries</div>
            <span>{formatNumber(adversaryActors.length)} actors</span>
          </div>
          <div className="party-list">
            {adversaryActors.map((actor) => (
              <button
                className={`${actor.id === selectedActor?.id ? "party-row selected adversary" : "party-row adversary"}${partyDropTargetActorId === actor.id ? " drop-target" : ""}`}
                key={actor.id}
                type="button"
                onDragEnter={(event) => handleRailItemDragOver(event, actor)}
                onDragOver={(event) => handleRailItemDragOver(event, actor)}
                onDragLeave={(event) => handleRailItemDragLeave(event, actor)}
                onDrop={(event) => giveDroppedItemToActor(event, actor)}
                onClick={() => {
                  const token = snapshot.tokens.find((item) => item.actorId === actor.id && item.sceneId === sceneId);
                  if (token) selectSingleToken(token.id);
                  setTab("actors");
                }}
              >
                <span className="party-avatar adversary-avatar">{actor.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{actor.name}</strong>
                  <small>{actorRailSubtitle(actor)}</small>
                </span>
              </button>
            ))}
            {adversaryActors.length === 0 && <p className="account-summary">No adversaries yet.</p>}
          </div>
        </section>
        <section className="rail-admin" hidden={workspaceMode !== "manage"} aria-label="Manage workspace panel">
          <div className="manage-drawer-heading">
            <div>
              <div className="section-title">{manageWorkspaceEyebrow}</div>
              <strong>{manageWorkspaceHeading}</strong>
            </div>
            <button className="ghost-button manage-drawer-close" type="button" onClick={() => selectWorkspaceMode("live")}>
              <X size={16} /> Close
            </button>
          </div>
          <nav className="manage-category-list" aria-label="Manage sections">
            {visibleManageCategories.map((category) => (
              <button
                className={category.id === activeManageCategory ? "manage-category-button active" : "manage-category-button"}
                key={category.id}
                type="button"
                aria-current={category.id === activeManageCategory ? "page" : undefined}
                title={category.description}
                onClick={() => setManageCategory(category.id)}
              >
                {category.icon}
                <span>
                  <strong>{category.label}</strong>
                  <small>{category.description}</small>
                </span>
                {category.badge && <em>{category.badge}</em>}
              </button>
            ))}
          </nav>
          <div className="manage-category-content">
            {activeManageCategory === "account" && (
              <div className="manage-card-grid">
        {ssoEnabled && (
          <button className="ghost-button" onClick={() => startSso().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
            <Shield size={16} /> SSO
          </button>
        )}
        <section className="account-box">
          <div className="section-title">Account</div>
          <div className="account-summary">
            <strong>{snapshot.session?.user.displayName ?? currentUserId}</strong>
            <span>{snapshot.session?.user.email ?? currentUserId}</span>
            {snapshot.session?.serverAdmin && <span>Server admin</span>}
          </div>
          {snapshot.organizations.length > 0 && (
            <label className="mini-form">
              <span>Workspace</span>
              <select aria-label="Active organization workspace" value={activeOrganizationId} onChange={(event) => switchActiveOrganization(event.target.value).catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)))}>
                {snapshot.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              {activeOrganization && <small className="mini-form-meta">{titleCaseLabel(activeOrganization.role)} - {formatNumber(activeOrganization.campaignCount)} campaigns</small>}
            </label>
          )}
          <form
            className="mini-form"
            onSubmit={(event) => {
              event.preventDefault();
              createWorkspace().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <input aria-label="New workspace name" value={newWorkspaceName} placeholder="New workspace" onChange={(event) => setNewWorkspaceName(event.target.value)} />
            <button className="ghost-button wide" type="submit" disabled={!newWorkspaceName.trim()}>
              <Plus size={16} /> Workspace
            </button>
          </form>
          <button className="ghost-button wide" type="button" onClick={() => submitLogout().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)))}>
            <UserX size={16} /> Logout
          </button>
          <form
            className="mini-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitPasswordChange().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <input aria-label="Current password" type="password" autoComplete="current-password" value={passwordCurrent} placeholder="Current password" onChange={(event) => setPasswordCurrent(event.target.value)} />
            <input aria-label="New password" type="password" autoComplete="new-password" minLength={8} value={passwordNext} placeholder="New password" onChange={(event) => setPasswordNext(event.target.value)} />
            <button className="ghost-button wide" type="submit" disabled={!passwordCurrent || passwordNext.length < 8}>
              <KeyRound size={16} /> Password
            </button>
          </form>
          <form
            className="mini-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (mfaInfo?.totpEnabled) {
                disableMfa().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)));
              } else if (mfaInfo?.totpPending || Boolean(mfaSecret)) {
                confirmMfaEnrollment().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)));
              } else {
                startMfaEnrollment().catch((error) => setAccountStatus(error instanceof Error ? error.message : String(error)));
              }
            }}
          >
            <div className="account-summary">
              <span>MFA {mfaInfo?.totpEnabled ? "enabled" : mfaInfo?.totpPending || mfaSecret ? "pending" : "off"}</span>
              {mfaInfo?.recoveryCodeCount ? <span>{mfaInfo.recoveryCodeCount} recovery codes</span> : null}
            </div>
            <input aria-label="MFA password" type="password" autoComplete="current-password" value={mfaPassword} placeholder="Current password" onChange={(event) => setMfaPassword(event.target.value)} />
            {(mfaInfo?.totpEnabled || mfaInfo?.totpPending || Boolean(mfaSecret)) && <input aria-label="MFA code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} placeholder="MFA code" onChange={(event) => setMfaCode(event.target.value)} />}
            {mfaSecret && <input aria-label="MFA secret" readOnly value={mfaSecret} onFocus={(event) => event.currentTarget.select()} />}
            <button className="ghost-button wide" type="submit" disabled={!mfaPassword || ((mfaInfo?.totpEnabled || mfaInfo?.totpPending || Boolean(mfaSecret)) && !mfaCode.trim())}>
              <Shield size={16} /> {mfaInfo?.totpEnabled ? "Disable MFA" : mfaInfo?.totpPending || mfaSecret ? "Confirm MFA" : "Enable MFA"}
            </button>
            {mfaRecoveryCodes.length > 0 && <textarea aria-label="MFA recovery codes" readOnly value={mfaRecoveryCodes.join("\n")} onFocus={(event) => event.currentTarget.select()} />}
          </form>
          <div className="status">{accountStatus}</div>
        </section>
              </div>
            )}
            {activeManageCategory === "campaign" && (
              <div className="manage-card-grid">
        <details className="account-box create-drawer">
          <summary><Plus size={15} /> New campaign</summary>
        <form
          className="create-drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            createCampaignFromSetup().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="section-title">Campaign Setup</div>
          <input aria-label="Campaign name" value={newCampaignName} placeholder="Campaign name" onChange={(event) => setNewCampaignName(event.target.value)} />
          <textarea aria-label="Campaign description" value={newCampaignDescription} placeholder="Description" onChange={(event) => setNewCampaignDescription(event.target.value)} />
          <select aria-label="Campaign rules system" value={newCampaignSystemId} onChange={(event) => setNewCampaignSystemId(event.target.value)}>
            {snapshot.systems.length === 0 ? (
              <option value="dnd-5e-srd">D&D 5.5e SRD</option>
            ) : (
              snapshot.systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))
            )}
          </select>
          <select aria-label="Campaign visibility" value={newCampaignVisibility} onChange={(event) => setNewCampaignVisibility(event.target.value as Campaign["visibility"])}>
            <option value="private">Private</option>
            <option value="invite_only">Invite only</option>
            <option value="public">Public</option>
          </select>
          <div className="section-title">Initial Scene</div>
          <label className="inline-check">
            <input aria-label="Include starter content" type="checkbox" checked={setupStarterContent} onChange={(event) => setSetupStarterContent(event.target.checked)} />
            <span>Include starter content</span>
          </label>
          <input aria-label="Setup initial scene name" value={setupSceneName} placeholder="Opening Scene" onChange={(event) => setSetupSceneName(event.target.value)} />
          <input aria-label="Setup initial scene folder" value={setupSceneFolder} placeholder="session-0" onChange={(event) => setSetupSceneFolder(event.target.value)} />
          <div className="button-row">
            <input aria-label="Setup scene width" type="number" min={200} value={setupSceneWidth} onChange={(event) => setSetupSceneWidth(Number(event.target.value))} />
            <input aria-label="Setup scene height" type="number" min={200} value={setupSceneHeight} onChange={(event) => setSetupSceneHeight(Number(event.target.value))} />
          </div>
          <input aria-label="Setup scene grid size" type="number" min={10} value={setupSceneGridSize} onChange={(event) => setSetupSceneGridSize(Number(event.target.value))} />
          <div className="section-title">Players and Permissions</div>
          <label className="inline-check">
            <input type="checkbox" checked={setupInviteEnabled} onChange={(event) => setSetupInviteEnabled(event.target.checked)} />
            <span>Create starter invite</span>
          </label>
          <input aria-label="Setup invite email" type="email" autoComplete="email" value={setupInviteEmail} placeholder="player@example.com" disabled={!setupInviteEnabled} onChange={(event) => setSetupInviteEmail(event.target.value)} />
          <select aria-label="Setup default player permission preset" value={setupInviteRole} disabled={!setupInviteEnabled} onChange={(event) => setSetupInviteRole(event.target.value as UserRole)}>
            <option value="player">Player - owns characters and plays live</option>
            <option value="observer">Observer - read-only table access</option>
            <option value="assistant_gm">Assistant GM - prep and moderation</option>
            <option value="gm">GM - full campaign management</option>
          </select>
          <select aria-label="Setup campaign permission template" value={setupPermissionTemplate} onChange={(event) => setSetupPermissionTemplate(event.target.value as CampaignPermissionTemplateId)}>
            {campaignPermissionTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <p className="account-summary">{selectedPermissionTemplate.description}</p>
          <div className="asset-pressure-list" aria-label="Campaign setup impact">
            <div className="operator-row tool-call-row">
              <span>Access</span>
              <strong>{setupVisibilityLabel} - {setupInviteSummary}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>Scene</span>
              <strong>{setupPreviewSceneName} - {setupPreviewSceneWidth}x{setupPreviewSceneHeight} - grid {setupPreviewGridSize} - {setupPreviewFolder}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>Permissions</span>
              <strong>{selectedPermissionTemplate.label}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>Onboarding</span>
              <strong>{setupOnboardingSummary}</strong>
            </div>
          </div>
          <div className="section-title">Onboarding Handout</div>
          <input aria-label="Setup onboarding title" value={setupOnboardingTitle} placeholder="Welcome to the Table" onChange={(event) => setSetupOnboardingTitle(event.target.value)} />
          <textarea aria-label="Setup onboarding copy" value={setupOnboardingBody} placeholder="Table rules, safety notes, first-session goals" onChange={(event) => setSetupOnboardingBody(event.target.value)} />
          <button className="ghost-button wide" type="submit" disabled={!newCampaignName.trim()}>
            <Plus size={16} /> Create Campaign Setup
          </button>
        </form>
        </details>
        {selectedCampaign && hasPermission("campaign.update") && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              saveCampaignSettings().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Campaign Settings</div>
            <input aria-label="Edit campaign name" value={campaignEditName} onChange={(event) => setCampaignEditName(event.target.value)} />
            <textarea aria-label="Edit campaign description" value={campaignEditDescription} placeholder="Description" onChange={(event) => setCampaignEditDescription(event.target.value)} />
            <select aria-label="Edit campaign rules system" value={campaignEditSystemId} onChange={(event) => setCampaignEditSystemId(event.target.value)}>
              {snapshot.systems.length === 0 ? (
                <option value="dnd-5e-srd">D&D 5.5e SRD</option>
              ) : (
                snapshot.systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))
              )}
            </select>
            <select aria-label="Edit campaign visibility" value={campaignEditVisibility} onChange={(event) => setCampaignEditVisibility(event.target.value as Campaign["visibility"])}>
              <option value="private">Private</option>
              <option value="invite_only">Invite only</option>
              <option value="public">Public</option>
            </select>
            <button className="ghost-button wide" type="submit" disabled={!campaignEditName.trim()}>
              <Check size={16} /> Save Campaign
            </button>
            <p className="account-summary">
              Campaign status: {selectedCampaign.archivedAt ? `Archived ${formatDateTime(selectedCampaign.archivedAt)}` : "Active"}
            </p>
            <button className="ghost-button wide" type="button" onClick={() => (selectedCampaign.archivedAt ? restoreSelectedCampaign() : archiveSelectedCampaign()).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
              <Boxes size={16} /> {selectedCampaign.archivedAt ? "Restore Campaign" : "Archive Campaign"}
            </button>
            {hasPermission("campaign.delete") && (
              <div className="danger-zone">
                {campaignDeleteImpact && (
                  <p className="account-summary">
                    Delete is audited and removes {formatNumber(campaignDeleteImpact.scenes)} scenes, {formatNumber(campaignDeleteImpact.assets)} assets, {formatNumber(campaignDeleteImpact.actors)} actors, {formatNumber(campaignDeleteImpact.journals)} journals, {formatNumber(campaignDeleteImpact.chatMessages)} chat messages, {formatNumber(campaignDeleteImpact.combats)} combats, and {formatNumber(campaignDeleteImpact.members)} memberships.
                  </p>
                )}
                <input aria-label="Confirm campaign delete" value={campaignDeleteConfirm} placeholder={`Type ${selectedCampaign.name} to delete`} onChange={(event) => setCampaignDeleteConfirm(event.target.value)} />
                <button className="ghost-button wide danger-button" type="button" disabled={campaignDeleteConfirm !== selectedCampaign.name} onClick={() => deleteSelectedCampaign().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  <UserX size={16} /> Delete Campaign
                </button>
              </div>
            )}
          </form>
        )}
              </div>
            )}
            {activeManageCategory === "people" && (
              <div className="manage-card-grid">
        {(hasPermission("campaign.update") || canManageActiveOrganization) && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              createInvite().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
          <div className="section-title">Invites</div>
            <input aria-label="Invite email" type="email" autoComplete="email" value={inviteEmail} placeholder="player@example.com" onChange={(event) => setInviteEmail(event.target.value)} />
            <select aria-label="Invite role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as UserRole)}>
              <option value="player">Player</option>
              <option value="observer">Observer</option>
              <option value="assistant_gm">Assistant GM</option>
              <option value="gm">GM</option>
            </select>
            <button className="ghost-button wide" type="submit">
              <UserPlus size={16} /> Invite
            </button>
            {inviteToken && <input aria-label="Invite token" readOnly value={inviteToken} onFocus={(event) => event.currentTarget.select()} />}
            <div className="asset-pressure-list" aria-label="Organization invite roster">
              {snapshot.organizationInvites.length === 0 ? (
                <p className="account-summary">No organization invites.</p>
              ) : (
                snapshot.organizationInvites.slice(0, 8).map((invite) => (
                  <div className="operator-row tool-call-row" key={invite.id}>
                    <span>{invite.email ?? "Open invite"} - {invite.role} - {invite.campaign.name}</span>
                    <strong>{invite.status}</strong>
                    <button className="icon-button" type="button" title="Revoke invite" aria-label="Revoke invite" disabled={invite.status !== "pending"} onClick={() => revokeOrganizationInvite(invite.id).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </form>
        )}
        <details className="account-box create-drawer">
          <summary><UserPlus size={15} /> Join with an invite token</summary>
        <form
          className="create-drawer-form"
          onSubmit={(event) => {
            event.preventDefault();
            acceptInvite().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="section-title">Join</div>
          <input aria-label="Invite token" value={joinToken} placeholder="oti_..." onChange={(event) => setJoinToken(event.target.value)} />
          <input aria-label="Join email" type="email" autoComplete="email" value={joinEmail} placeholder="player@example.com" onChange={(event) => setJoinEmail(event.target.value)} />
          <input aria-label="Display name" autoComplete="name" value={joinName} placeholder="Display name" onChange={(event) => setJoinName(event.target.value)} />
          <input aria-label="Password" type="password" autoComplete="new-password" value={joinPassword} placeholder="Password" onChange={(event) => setJoinPassword(event.target.value)} />
          <button className="ghost-button wide" type="submit" disabled={!joinToken.trim() || !joinEmail.trim() || !joinPassword}>
            <ChevronRight size={16} /> Join
          </button>
        </form>
        </details>
              </div>
            )}
            {activeManageCategory === "scenes" && (
              <div className="manage-card-grid">
        <div className="scene-filter-panel manage-scene-filter-panel" aria-label="Scene prep filters">
          <select
            aria-label="Scene folder filter"
            value={sceneFolderFilter}
            onChange={(event) => {
              const nextFolder = event.target.value;
              setSceneFolderFilter(nextFolder);
              const nextScene = nextFolder === "all" ? orderedScenes[0] : orderedScenes.find((scene) => scene.folder === nextFolder);
              if (nextScene && (nextFolder !== "all" || !selectedScene)) setSceneId(nextScene.id);
            }}
          >
            <option value="all">All scenes ({formatNumber(accessibleScenes.length)})</option>
            {sceneFolderOptions.map((folder) => (
              <option key={folder} value={folder}>
                {folder} ({formatNumber(sceneFolderCounts[folder] ?? 0)})
              </option>
            ))}
          </select>
          <input aria-label="Scene search" value={sceneSearch} placeholder="Search scenes" onChange={(event) => setSceneSearch(event.target.value)} />
          <span role="status" aria-label="Scene filter summary">{formatNumber(visibleScenes.length)} of {formatNumber(accessibleScenes.length)} scenes</span>
          <span role="status" aria-label="Scene selection summary">{formatNumber(selectedPrepScenes.length)} selected</span>
          {hasPermission("scene.update") && (
            <div className="button-row">
              <input aria-label="Bulk scene folder" value={bulkSceneFolder} placeholder="Move visible to folder" onChange={(event) => setBulkSceneFolder(event.target.value)} />
              <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={() => moveVisibleScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Move visible scenes
              </button>
              <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={selectVisiblePrepScenes}>
                Select visible scenes
              </button>
              <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={clearPrepSceneSelection}>
                Clear selected scenes
              </button>
              <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={() => moveSelectedPrepScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Move selected scenes
              </button>
              <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={() => duplicateSelectedPrepScenes().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Duplicate selected scenes
              </button>
            </div>
          )}
        </div>
        {hasPermission("scene.create") && (
          <details className="account-box create-drawer">
            <summary><Plus size={15} /> New scene</summary>
          <form
            className="create-drawer-form"
            onSubmit={(event) => {
              event.preventDefault();
              createScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Scene Setup</div>
            <div className="admin-form-grid scene-field-grid">
              <label className="span-full">
                <span>Name</span>
                <input aria-label="Scene name" value={newSceneName} placeholder="Scene name" onChange={(event) => setNewSceneName(event.target.value)} />
              </label>
              <label>
                <span>Folder</span>
                <input aria-label="Scene folder" value={newSceneFolder} placeholder="prep" onChange={(event) => setNewSceneFolder(event.target.value)} />
              </label>
              <label>
                <span>Width</span>
                <input aria-label="Scene width" type="number" min={200} value={newSceneWidth} onChange={(event) => setNewSceneWidth(Number(event.target.value))} />
              </label>
              <label>
                <span>Height</span>
                <input aria-label="Scene height" type="number" min={200} value={newSceneHeight} onChange={(event) => setNewSceneHeight(Number(event.target.value))} />
              </label>
              <label>
                <span>Grid</span>
                <input aria-label="Scene grid size" type="number" min={10} value={newSceneGridSize} onChange={(event) => setNewSceneGridSize(Number(event.target.value))} />
              </label>
              <label className="span-full">
                <span>Background</span>
                <select aria-label="Scene background asset" value={newSceneBackgroundAssetId} onChange={(event) => setNewSceneBackgroundAssetId(event.target.value)}>
                  <option value="">No background</option>
                  {campaignImageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="scene-size-panel" aria-label="Scene size presets">
              <div className="scene-size-summary">
                <span>Map size</span>
                <strong>{newSceneCellSummary}</strong>
              </div>
              <div className="scene-size-presets">
                {sceneSizePresets.map((preset) => (
                  <button className="ghost-button" type="button" key={preset.id} onClick={() => applyNewSceneSizePreset(preset)}>
                    {preset.description} {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={newSceneActive} onChange={(event) => setNewSceneActive(event.target.checked)} />
              <span>Activate for players</span>
            </label>
            <button className="ghost-button wide" type="submit">
              <Plus size={16} /> Add Scene
            </button>
          </form>
          </details>
        )}
        {selectedScene && hasPermission("scene.update") && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              saveSceneSettings(event.currentTarget).catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Scene Manager</div>
            <div className="scene-background-preview">
              {selectedMapAsset ? <img src={assetBlobUrl(selectedMapAsset)} alt="" /> : <FileText size={24} />}
              <div>
                <strong>{selectedMapAsset?.name ?? "No background"}</strong>
                <span>{selectedScene.width} x {selectedScene.height} / grid {selectedScene.gridSize}</span>
              </div>
            </div>
            <div className="admin-form-grid scene-field-grid">
              <label className="span-full">
                <span>Name</span>
                <input
                  aria-label="Edit scene name"
                  name="sceneEditName"
                  value={sceneEditName}
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditName(event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Folder</span>
                <input
                  aria-label="Edit scene folder"
                  name="sceneEditFolder"
                  value={sceneEditFolder}
                  placeholder="folder"
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditFolder(event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Width</span>
                <input
                  aria-label="Edit scene width"
                  name="sceneEditWidth"
                  type="number"
                  min={200}
                  value={sceneEditWidth}
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditWidth(Number(event.target.value));
                  }}
                />
              </label>
              <label>
                <span>Height</span>
                <input
                  aria-label="Edit scene height"
                  name="sceneEditHeight"
                  type="number"
                  min={200}
                  value={sceneEditHeight}
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditHeight(Number(event.target.value));
                  }}
                />
              </label>
              <label>
                <span>Grid</span>
                <input
                  aria-label="Edit scene grid size"
                  name="sceneEditGridSize"
                  type="number"
                  min={10}
                  value={sceneEditGridSize}
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditGridSize(Number(event.target.value));
                  }}
                />
              </label>
              <label className="span-full">
                <span>Background</span>
                <select
                  aria-label="Edit scene background asset"
                  name="sceneEditBackgroundAssetId"
                  value={sceneEditBackgroundAssetId}
                  onChange={(event) => {
                    setSceneEditDirty(true);
                    setSceneEditBackgroundAssetId(event.target.value);
                  }}
                >
                  <option value="">No background</option>
                  {campaignImageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="scene-size-panel" aria-label="Edit scene size presets">
              <div className="scene-size-summary">
                <span>Map size</span>
                <strong>{sceneEditCellSummary}</strong>
              </div>
              <div className="scene-size-presets">
                {sceneSizePresets.map((preset) => (
                  <button className="ghost-button" type="button" key={preset.id} onClick={() => applySceneEditSizePreset(preset)}>
                    {preset.description} {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                name="sceneEditActive"
                checked={sceneEditActive}
                onChange={(event) => {
                  setSceneEditDirty(true);
                  setSceneEditActive(event.target.checked);
                }}
              />
              <span>Active player scene</span>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                name="sceneEditGridOverlayVisible"
                checked={sceneEditGridOverlayVisible}
                onChange={(event) => {
                  setSceneEditDirty(true);
                  setSceneEditGridOverlayVisible(event.target.checked);
                }}
              />
              <span>Show VTT grid overlay</span>
            </label>
            <section className="asset-pressure-list" aria-label="Scene activation history">
              <div className="operator-row tool-call-row">
                <span>Activation history</span>
                <strong>{formatNumber(sceneActivationHistory.length)} activation{sceneActivationHistory.length === 1 ? "" : "s"}</strong>
              </div>
              {latestSceneActivation ? (
                <div className="operator-row tool-call-row">
                  <span>Latest activation</span>
                  <strong>
                    {formatDateTime(latestSceneActivation.activatedAt)}
                    {latestSceneActivation.previousActiveSceneId ? `; previous active ${latestSceneActivation.previousActiveSceneId}` : ""}
                  </strong>
                </div>
              ) : (
                <p className="account-summary">No recorded activations yet.</p>
              )}
            </section>
            <section className="asset-pressure-list" aria-label="Scene state comparison">
              <div className="operator-row tool-call-row">
                <span>Selected scene</span>
                <strong>{selectedScene.name}</strong>
              </div>
              <div className="operator-row tool-call-row">
                <span>Active scene</span>
                <strong>{activeScene?.name ?? "None"}</strong>
              </div>
              {sceneStateComparison.map((row) => (
                <div className="operator-row tool-call-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.selected} / active {row.active}</strong>
                </div>
              ))}
              <div className="operator-row tool-call-row">
                <span>Scene diff details</span>
                <strong>{selectedScene.id === activeScene?.id ? "Live scene baseline" : "Prep drift review"}</strong>
              </div>
              {sceneDiffDetails.map((row) => (
                <div className="operator-row tool-call-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.detail}</strong>
                </div>
              ))}
              {selectedScene.id === activeScene?.id && <p className="account-summary">Selected scene is the active player scene.</p>}
            </section>
            <div className="button-row">
              <button className="ghost-button" type="submit" disabled={!sceneEditName.trim()}>
                <Check size={16} /> Save
              </button>
              <button className="ghost-button" type="button" disabled={selectedScene.active} onClick={() => activateSelectedScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <Eye size={16} /> Activate
              </button>
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={selectedSceneIndex <= 0} onClick={() => moveSelectedScene("up").catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <ChevronLeft size={16} /> Move Up
              </button>
              <button className="ghost-button" type="button" disabled={selectedSceneIndex < 0 || selectedSceneIndex >= orderedScenes.length - 1} onClick={() => moveSelectedScene("down").catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <ChevronRight size={16} /> Move Down
              </button>
            </div>
            {hasPermission("scene.create") && (
              <div className="mini-form">
                <input aria-label="Duplicate scene name" value={sceneDuplicateName} onChange={(event) => setSceneDuplicateName(event.target.value)} />
                <button className="ghost-button wide" type="button" disabled={!sceneDuplicateName.trim()} onClick={() => duplicateSelectedScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  <Plus size={16} /> Duplicate Scene
                </button>
              </div>
            )}
            {hasPermission("scene.delete") && (
              <div className="danger-zone">
                {sceneDeleteImpact && (
                  <p className="account-summary">
                    Delete is audited and removes {formatNumber(sceneDeleteImpact.tokens)} tokens, {formatNumber(sceneDeleteImpact.sceneChatMessages)} scene chat messages, {formatNumber(sceneDeleteImpact.fogRegions)} fog regions, {formatNumber(sceneDeleteImpact.walls)} walls, and {formatNumber(sceneDeleteImpact.lights)} lights.
                  </p>
                )}
                <input
                  aria-label="Confirm scene delete"
                  value={sceneDeleteConfirm}
                  placeholder={`Type ${selectedScene.name} to delete`}
                  onChange={(event) => {
                    setSceneDeleteConfirm(event.target.value);
                  }}
                />
                <button className="ghost-button wide danger-button" type="button" disabled={!sceneDeleteConfirmed} onClick={() => sceneDeleteTarget && deleteScene(sceneDeleteTarget).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  <UserX size={16} /> Delete Scene
                </button>
              </div>
            )}
          </form>
        )}
        <button className="ghost-button" onClick={() => document.getElementById("map-upload-file")?.click()} disabled={!hasPermission("scene.create") || !hasPermission("scene.update")} title={hasPermission("scene.create") && hasPermission("scene.update") ? "Upload map" : "Requires scene.create and scene.update"}>
          <Upload size={16} /> Map
        </button>
        <input
          id="map-upload-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            await uploadMap(file);
            input.value = "";
          }}
        />
              </div>
            )}
            {activeManageCategory === "archives" && (
              <div className="manage-card-grid">
        <section className="account-box" aria-label="Archive export wizard">
          <div className="section-title">Archive Export</div>
          <select aria-label="Archive export scope" value={archiveExportScope} onChange={(event) => setArchiveExportScope(event.target.value as ArchiveExportScope)}>
            <option value="campaign">Current campaign</option>
          </select>
          <select aria-label="Archive export version" value={archiveExportVersion} onChange={(event) => setArchiveExportVersion(event.target.value as ArchiveExportVersion)}>
            <option value="0.2.0">Archive 0.2.0</option>
          </select>
          <select aria-label="Archive redaction mode" value={archiveRedactionMode} onChange={(event) => setArchiveRedactionMode(event.target.value as ArchiveRedactionMode)}>
            <option value="portable">Portable table archive</option>
          </select>
          <div className="asset-pressure-list" aria-label="Archive compatibility notes">
            <div className="operator-row tool-call-row">
              <span>Scope</span>
              <strong>{formatNumber(archiveExportRecordCount)} records</strong>
            </div>
            {archiveCompatibilityNotes.map((note) => (
              <div className="operator-row tool-call-row" key={note}>
                <span>Note</span>
                <strong>{note}</strong>
              </div>
            ))}
          </div>
          <p className="account-summary">{archiveExportStatus}</p>
          <button className="ghost-button wide" type="button" onClick={() => exportCampaign().catch((error) => setArchiveExportStatus(error instanceof Error ? error.message : String(error)))}>
            <Download size={16} /> Export Archive
          </button>
        </section>
        <button className="ghost-button" onClick={() => exportDogfoodReportBundle().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))} title="Download a redacted issue report bundle">
          <Download size={16} /> Report Bundle
        </button>
        <section className="account-box" aria-label="Archive import wizard">
          <div className="section-title">Archive Import</div>
          <select aria-label="Archive import mode" value={archiveImportMode} onChange={(event) => updateArchiveImportMode(event.target.value as ArchiveImportMode)}>
            <option value="upsert">Apply archive</option>
            <option value="reject_conflicts">Reject conflicts</option>
            <option value="skip_conflicts">Skip conflicts</option>
            <option value="dry_run">Dry run validation</option>
          </select>
          <select aria-label="Archive import scope" value={archiveImportScope} onChange={(event) => updateArchiveImportScope(event.target.value as ArchiveImportScope)}>
            <option value="all">All records</option>
            <option value="assets_only">Assets only</option>
            <option value="selected_collections">Selected records</option>
          </select>
          {archiveImportScope === "selected_collections" && (
            <div className="asset-pressure-list" aria-label="Archive import collection selection">
              {archiveImportCollectionOptions.map((option) => (
                <label className="operator-row tool-call-row" key={option.id}>
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    aria-label={`Import ${option.label}`}
                    checked={archiveImportCollections.includes(option.id)}
                    onChange={(event) => updateArchiveImportCollection(option.id, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}
          <button className="ghost-button wide" type="button" onClick={() => document.getElementById("import-file")?.click()} disabled={isImportingArchive} aria-describedby="import-status" title="Import .ottx JSON archive">
            {isImportingArchive ? <RefreshCw size={16} /> : <Upload size={16} />} {archiveImportMode === "dry_run" ? "Validate Archive" : "Import Archive"}
          </button>
          {archiveImportReport && (
            <div className="asset-pressure-list" aria-label="Archive import validation">
              <div className="operator-row tool-call-row">
                <span>{archiveImportReportFileName || "Archive"}</span>
                <strong>{archiveImportReport.dryRun ? "dry run" : "applied"}</strong>
              </div>
              <div className="operator-row tool-call-row">
                <span>Scope</span>
                <strong>{archiveImportReport.importScope === "assets_only" ? "assets only" : archiveImportReport.importScope === "selected_collections" ? "selected records" : "all records"}</strong>
              </div>
              {archiveImportReport.importCollections && archiveImportReport.importScope === "selected_collections" && (
                <div className="operator-row tool-call-row">
                  <span>Collections</span>
                  <strong>{archiveImportReport.importCollections.join(", ")}</strong>
                </div>
              )}
              <div className="operator-row tool-call-row">
                <span>Records</span>
                <strong>{summarizeImport(archiveImportReport)}</strong>
              </div>
              <div className="operator-row tool-call-row">
                <span>Conflicts</span>
                <strong>{formatNumber(archiveImportReport.conflicts.length)}</strong>
              </div>
              {archiveImportReport.importWarnings && archiveImportReport.importWarnings.length > 0 && (
                <div className="operator-row tool-call-row">
                  <span>Dependency warnings</span>
                  <strong>{formatNumber(archiveImportReport.importWarnings.length)}</strong>
                </div>
              )}
              {archiveImportReport.importWarnings?.slice(0, 3).map((warning) => (
                <div className="operator-row tool-call-row" key={warning}>
                  <span>Warning</span>
                  <strong>{warning}</strong>
                </div>
              ))}
              {archiveImportReport.skippedConflicts && (
                <div className="operator-row tool-call-row">
                  <span>Skipped</span>
                  <strong>{formatNumber(archiveImportReport.skippedConflicts.length)}</strong>
                </div>
              )}
              {archiveRollbackSnapshot && (
                <div className="operator-row tool-call-row">
                  <span>Rollback snapshot</span>
                  <button className="ghost-button small" type="button" onClick={() => downloadJson(archiveRollbackFileName || "pre-import-rollback.ottx.json", archiveRollbackSnapshot)}>
                    <Download size={14} /> Download
                  </button>
                </div>
              )}
              {archiveImportReport.conflicts.slice(0, 4).map((conflict) => (
                <div className="operator-row tool-call-row" key={`${conflict.collection}:${conflict.id}`}>
                  <span>{conflict.collection}</span>
                  <strong>{conflict.id}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <input
          id="import-file"
          type="file"
          accept="application/json"
          aria-label="Import campaign archive"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await importCampaignArchive(file, event.currentTarget);
          }}
        />
        <div id="import-status" className="import-status" role="status" aria-live="polite">
          <strong>Import</strong>
          <span>{importStatus}</span>
        </div>
        {failedArchiveImport && (
          <div className="operator-row tool-call-row" aria-label="Archive import recovery">
            <span>{failedArchiveImport.file.name} failed: {failedArchiveImport.message}</span>
            <div className="admin-actions">
              <button className="ghost-button" type="button" disabled={isImportingArchive} onClick={() => retryArchiveImport().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <RefreshCw size={16} /> Retry import
              </button>
              <button className="ghost-button" type="button" onClick={dismissArchiveImportFailure}>
                <X size={16} /> Dismiss
              </button>
            </div>
          </div>
        )}
              </div>
            )}
            {activeManageCategory === "serverAdmin" && (
              <div className="manage-admin-panel">
                {adminPanel}
              </div>
            )}
          </div>
        </section>
        <div className="status" role="status" aria-live="polite">{status}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{workspaceEyebrow}</div>
            <h1>{workspaceHeading}</h1>
            <div className="session-pulse" aria-label={`Session connection: ${sessionPulseStatus}`}>
              <span aria-hidden="true" />
              {sessionPulseStatus}
            </div>
          </div>
          <div className="scene-filter-panel workspace-scene-filter-panel" hidden={!showScenePrepControls} aria-label="Scene prep filters">
            <select
              aria-label="Scene folder filter"
              value={sceneFolderFilter}
              onChange={(event) => {
                const nextFolder = event.target.value;
                setSceneFolderFilter(nextFolder);
                const nextScene = nextFolder === "all" ? orderedScenes[0] : orderedScenes.find((scene) => scene.folder === nextFolder);
                if (nextScene && (nextFolder !== "all" || !selectedScene)) setSceneId(nextScene.id);
              }}
            >
              <option value="all">All scenes ({formatNumber(accessibleScenes.length)})</option>
              {sceneFolderOptions.map((folder) => (
                <option key={folder} value={folder}>
                  {folder} ({formatNumber(sceneFolderCounts[folder] ?? 0)})
                </option>
              ))}
            </select>
            <input aria-label="Scene search" value={sceneSearch} placeholder="Search scenes" onChange={(event) => setSceneSearch(event.target.value)} />
            <span role="status" aria-label="Scene filter summary">{formatNumber(visibleScenes.length)} of {formatNumber(accessibleScenes.length)} scenes</span>
            <span role="status" aria-label="Scene selection summary">{formatNumber(selectedPrepScenes.length)} selected</span>
            {hasPermission("scene.update") && (
              <div className="button-row">
                <input aria-label="Bulk scene folder" value={bulkSceneFolder} placeholder="Move visible to folder" onChange={(event) => setBulkSceneFolder(event.target.value)} />
                <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={() => moveVisibleScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Move visible scenes
                </button>
                <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={selectVisiblePrepScenes}>
                  Select visible scenes
                </button>
                <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={clearPrepSceneSelection}>
                  Clear selected scenes
                </button>
                <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={() => moveSelectedPrepScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Move selected scenes
                </button>
                <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={() => duplicateSelectedPrepScenes().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Duplicate selected scenes
                </button>
              </div>
            )}
          </div>
          {showSceneTabs && <div className="scene-tabs">
            {visibleScenes.map((scene) => {
              const backgroundAsset = snapshot.assets.find((asset) => asset.id === scene.backgroundAssetId && isUsableImageAsset(asset));
              const sceneSelected = canSelectPrepScenes && selectedPrepSceneIds.includes(scene.id);
              return (
                <div key={scene.id} className={sceneTabWrapClass(canSelectPrepScenes, sceneSelected)}>
                  {canSelectPrepScenes && (
                    <input
                      aria-label={`Select scene ${scene.name}`}
                      checked={sceneSelected}
                      className="scene-tab-select"
                      type="checkbox"
                      onChange={(event) => togglePrepSceneSelection(scene.id, event.target.checked)}
                    />
                  )}
                  <button className={scene.id === sceneId ? "scene-tab active" : "scene-tab"} onClick={() => setSceneId(scene.id)} aria-pressed={scene.id === sceneId}>
                    <span className="scene-tab-thumb">{backgroundAsset ? <img src={assetBlobUrl(backgroundAsset)} alt="" /> : scene.active ? <Eye size={14} /> : <FileText size={14} />}</span>
                    <span>{scene.name}</span>
                    {scene.folder && <small>{scene.folder}</small>}
                  </button>
                </div>
              );
            })}
            {visibleScenes.length === 0 && <span className="empty-state compact">No scenes match filters.</span>}
          </div>}
          {showQuickCreate && !quickCreateOpen && (
            <button className="ghost-button quick-create-toggle" type="button" aria-expanded={false} onClick={toggleQuickCreate}>
              <Plus size={15} /> Token <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
          <form
            className="quick-create-form"
            hidden={!showQuickCreate || !quickCreateOpen}
            onSubmit={(event) => {
              event.preventDefault();
              createToken().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <input aria-label="Token name" value={newTokenName} placeholder="Token name" onChange={(event) => setNewTokenName(event.target.value)} />
            <select aria-label="Token actor" value={newTokenActorId} onChange={(event) => setNewTokenActorId(event.target.value)}>
              <option value="">No actor</option>
              {snapshot.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
            <select aria-label="Token disposition" value={newTokenDisposition} onChange={(event) => setNewTokenDisposition(event.target.value as Token["disposition"])}>
              <option value="friendly">Friendly</option>
              <option value="neutral">Neutral</option>
              <option value="hostile">Hostile</option>
            </select>
            <select aria-label="Token footprint" value={newTokenFootprintCells} onChange={(event) => setNewTokenFootprintCells(Math.max(1, Number(event.target.value) || 1))}>
              <option value={1}>1x1</option>
              <option value={2}>2x2</option>
              <option value={3}>3x3</option>
              <option value={4}>4x4</option>
            </select>
            <button className="primary-button" type="submit" disabled={!hasPermission("token.create")} title={hasPermission("token.create") ? "Create token" : "Requires token.create"}>
              <Plus size={16} /> Token
            </button>
            <button className="icon-button quick-create-close" type="button" aria-label="Collapse token creation" title="Collapse token creation" onClick={toggleQuickCreate}>
              <X size={15} />
            </button>
          </form>
        </header>

        {showTableWorkspace ? (
        <div className={`table-grid workspace-${workspaceMode}`}>
          <section className={`table-area ${canvasAssetDragging ? "canvas-asset-dragging" : ""}`}>
            <Toolbar key={`${workspaceMode}-${tab}`} onSelectTool={selectCanvasTool} onCreateToken={createToken} onStartCombat={startCombat} onRevealFog={revealFog} onHideFog={hideFog} onRevealFogPolygon={revealFogPolygon} onToggleFogBrush={toggleFogBrush} onToggleAnnotationTool={toggleAnnotationTool} onDeleteLatestAnnotation={deleteLatestAnnotation} onUndoScene={undoSceneEdit} onUndoFog={undoFog} onShowFogHistory={showFogHistory} onSampleVisionPoint={sampleVisionPoint} onSaveFogPreset={saveFogPreset} onApplyFogPreset={applyFogPreset} onDeleteFogPreset={deleteFogPreset} onAddWall={addWall} onAddTerrainWall={addTerrainWall} onAddLight={addLight} onActionError={(error) => setStatus(error instanceof Error ? error.message : String(error))} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} activeFogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} activeAnnotationTool={annotationTool} hasFogPresets={snapshot.fogPresets.length > 0} canUpdateScene={hasPermission("scene.update")} canAnnotate={hasPermission("scene.read")} />
            <div className="map-play-surface">
              {selectedScene ? <SceneCanvas scene={selectedScene} zoom={battleMapZoom} backgroundAsset={selectedMapAsset} selectedAssetId={selectedBoardAssetId} assets={snapshot.assets} tokens={snapshot.tokens} actors={snapshot.actors} boardCurrentUserId={currentUserId} canSeeAllVitals={hasPermission("combat.manage")} currentTurnTokenIds={currentTurnTokenIds} nextTurnTokenIds={nextTurnTokenIds} vision={snapshot.vision} selectedTokenId={selectedTokenId} selectedTokenIds={selectedTokenIds} activeTokenLayer={activeTokenLayer} fogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} annotationTool={annotationTool} templateShape={templateShape} visibleAnnotationLayers={visibleAnnotationLayers} canDropToken={hasPermission("token.create")} canUpdateAnnotations={hasPermission("scene.update")} canResizeToken={hasPermission("token.update")} onSelect={selectCanvasToken} onSelectMany={selectCanvasTokens} onSelectBackgroundAsset={selectBoardBackgroundAsset} onClearSelection={clearTokenSelection} onMoved={async () => undefined} onTokenMovePersist={persistSceneCanvasTokenMove} onTokenResizePersist={persistSceneCanvasTokenResize} onTokenMoveCommit={recordTokenMoveAction} onTokenResizeCommit={recordTokenResizeAction} onTokenDrop={createTokenFromDrop} onFogStroke={paintFogStroke} onAnnotationCreate={createSceneAnnotation} onAnnotationMove={moveSceneAnnotation} selectedOverlay={selectedOverlay} onSelectOverlay={setSelectedOverlay} onZoomBy={zoomBattleMap} /> : (
                <div className="empty-state empty-state-action">
                  <span>Create a scene to open the tabletop.</span>
                  {hasPermission("scene.create") && (
                    <button className="ghost-button small" type="button" aria-label="Create scene from empty board" onClick={() => createScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      <Plus size={14} /> Create scene
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="map-layer-dock" aria-label="Map controls and layers" data-collapsed={mapDockOpen ? undefined : "true"}>
              <MapZoomControls zoom={battleMapZoom} onZoomOut={() => zoomBattleMap(-battleMapZoomStep)} onZoomIn={() => zoomBattleMap(battleMapZoomStep)} onReset={resetBattleMapZoom} />
              {selectedTokens.length > 1 && <MapSelectionStatus selectedCount={selectedTokens.length} onClear={clearTokenSelection} />}
              <button className="ghost-button map-layer-dock-toggle" type="button" aria-expanded={mapDockOpen} aria-label={mapDockOpen ? "Collapse layer panel" : "Expand layer panel"} onClick={toggleMapDock}>
                <Layers size={15} />
                <span>Layers</span>
                {mapDockOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
              {mapDockOpen && <MapLayerStack scene={selectedScene} tokens={snapshot.tokens} activeTokenLayer={activeTokenLayer} fogActive={Boolean(snapshot.vision?.sceneId === selectedScene?.id && snapshot.vision?.fogActive)} visibleAnnotationLayers={visibleAnnotationLayers} onSelectTokenLayer={selectTokenLayer} onToggleAnnotationLayer={setAnnotationLayerVisible} />}
            </div>
            {hasPermission("token.reveal") && (fogBrushMode || toolReport) && (
              <section className="table-tool-panel movable-panel" aria-label="Fog and vision tools" style={fogToolPanel.style}>
                <header className="floating-panel-header table-tool-panel-header" title="Drag panel" {...fogToolPanel.dragHandleProps}>
                  <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
                  <div>
                    <strong>{toolReport ? toolReportTitle : "Fog tools"}</strong>
                    <span>{toolReport ? "Report output" : fogBrushMode ? `${titleCaseLabel(fogBrushMode)} brush active` : "Presets and vision samples"}</span>
                  </div>
                  <button className="icon-button" type="button" aria-label="Close fog and vision panel" title="Close" onClick={closeFogToolPanel}>
                    <X size={15} />
                  </button>
                </header>
                <input aria-label="Fog preset name" value={fogPresetName} placeholder="Preset name" onChange={(event) => setFogPresetName(event.target.value)} />
                <select aria-label="Fog preset mode" value={fogPresetMode} onChange={(event) => setFogPresetMode(event.target.value as "replace" | "append")}>
                  <option value="replace">Replace</option>
                  <option value="append">Append</option>
                </select>
                <input aria-label="Vision sample x" value={visionSampleX} placeholder="X" onChange={(event) => setVisionSampleX(event.target.value)} />
                <input aria-label="Vision sample y" value={visionSampleY} placeholder="Y" onChange={(event) => setVisionSampleY(event.target.value)} />
                {toolReport && <pre>{toolReport}</pre>}
                <button className="floating-panel-resize-handle" type="button" aria-label="Resize fog and vision panel" title="Resize panel" {...fogToolPanel.resizeHandleProps}>
                  <Grip size={13} aria-hidden="true" />
                </button>
              </section>
            )}
            {annotationPanelOpen && !fogBrushMode && annotationTool && annotationToolShowsSettings(annotationTool) && (
            <section className="table-tool-panel annotation-panel movable-panel" aria-label="Annotation layers and history" style={annotationToolPanel.style}>
              <header className="annotation-panel-header floating-panel-header" title="Drag panel" {...annotationToolPanel.dragHandleProps}>
                <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
                <div>
                  <strong>Annotations</strong>
                  <span>{annotationToolLabel(annotationTool)} settings</span>
                </div>
                <button className="icon-button" type="button" aria-label="Close annotation settings" onClick={() => setAnnotationPanelOpen(false)}>
                  <X size={15} />
                </button>
              </header>
              <div className="annotation-panel-grid">
              <select aria-label="Annotation layer" value={annotationLayer} onChange={(event) => setAnnotationLayer(event.target.value as SceneAnnotationLayer)}>
                <option value="measurement">Measurement</option>
                <option value="effects">Effects</option>
                <option value="drawings">Drawings</option>
                <option value="notes">Notes</option>
              </select>
              <input aria-label="Annotation group label" value={annotationGroupLabel} placeholder="Group label" onChange={(event) => setAnnotationGroupLabel(event.target.value)} />
              <input aria-label="Annotation group color" type="color" value={annotationGroupColor} onChange={(event) => setAnnotationGroupColor(event.target.value)} />
              <select aria-label="Template shape" value={templateShape} onChange={(event) => setTemplateShape(event.target.value as SceneTemplateShape)}>
                <option value="circle">Circle</option>
                <option value="line">Line</option>
                <option value="cone">Cone</option>
              </select>
              <select aria-label="Template save ability" value={templateSaveAbility} onChange={(event) => setTemplateSaveAbility(event.target.value)}>
                <option value="none">No save</option>
                <option value="strength">Strength</option>
                <option value="dexterity">Dexterity</option>
                <option value="constitution">Constitution</option>
                <option value="intelligence">Intelligence</option>
                <option value="wisdom">Wisdom</option>
                <option value="charisma">Charisma</option>
              </select>
              <input aria-label="Template save DC" type="number" min={1} max={40} value={templateSaveDc} placeholder="DC" onChange={(event) => setTemplateSaveDc(event.target.value)} />
              <input aria-label="Template damage formula" value={templateDamageFormula} placeholder="Damage" onChange={(event) => setTemplateDamageFormula(event.target.value)} />
              <input aria-label="Template damage type" value={templateDamageType} placeholder="Type" onChange={(event) => setTemplateDamageType(event.target.value)} />
              <label className="inline-check">
                <input type="checkbox" checked={annotationSnapToGrid} onChange={(event) => setAnnotationSnapToGrid(event.target.checked)} />
                <span>Snap templates to grid</span>
              </label>
              </div>
              <details className="annotation-panel-section">
                <summary>Layer visibility</summary>
              <div className="asset-pressure-list" role="group" aria-label="Annotation layer visibility">
                {annotationLayers.map((layer) => (
                  <label className="inline-check" key={layer}>
                    <input type="checkbox" checked={visibleAnnotationLayers[layer]} onChange={(event) => setAnnotationLayerVisible(layer, event.target.checked)} />
                    <span>Show {titleCaseLabel(layer)} annotations</span>
                  </label>
                ))}
              </div>
              <div className="asset-pressure-list" role="region" aria-label="Annotation layer summary">
                {Object.keys(annotationLayerCounts).length === 0 ? (
                  <span className="panel-empty">No annotations yet</span>
                ) : (
                  Object.entries(annotationLayerCounts).map(([layer, count]) => (
                    <div className="operator-row tool-call-row" key={layer}>
                      <span>{titleCaseLabel(layer)}</span>
                      <strong>{formatNumber(count)}</strong>
                    </div>
                  ))
                )}
              </div>
              </details>
              <details className="annotation-panel-section">
                <summary>Groups</summary>
              <div className="asset-pressure-list" role="region" aria-label="Annotation group summary">
                {Object.entries(annotationGroupCounts).slice(0, 4).map(([group, count]) => (
                  <div className="operator-row tool-call-row" key={group}>
                    <span>{group}</span>
                    <strong>{formatNumber(count)}</strong>
                    <button className="ghost-button" type="button" aria-label={`Nudge annotation group ${group}`} disabled={!hasPermission("scene.update")} onClick={() => nudgeAnnotationGroup(group).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Nudge group
                    </button>
                    <button className="ghost-button" type="button" aria-label={`Recolor annotation group ${group}`} disabled={!hasPermission("scene.update")} onClick={() => recolorAnnotationGroup(group).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Recolor group
                    </button>
                    <button className="ghost-button" type="button" aria-label={`Delete annotation group ${group}`} disabled={!hasPermission("scene.update")} onClick={() => deleteAnnotationGroup(group).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Delete group
                    </button>
                  </div>
                ))}
              </div>
              </details>
              <details className="annotation-panel-section">
                <summary>History</summary>
              <div className="asset-pressure-list" role="region" aria-label="Annotation history">
                {sceneAnnotationHistory.length === 0 ? (
                  <span className="panel-empty">No annotation history yet</span>
                ) : (
                  sceneAnnotationHistory.slice(0, 3).map((entry) => (
                    <div className="operator-row tool-call-row" key={entry.id}>
                      <span>{titleCaseLabel(entry.action)} {annotationToolLabel(entry.kind)}</span>
                      <strong>{entry.groupLabel ?? entry.groupId ?? titleCaseLabel(entry.layer ?? defaultAnnotationLayer(entry.kind))}</strong>
                    </div>
                  ))
                )}
              </div>
              </details>
              <details className="annotation-panel-section" open={Boolean(latestAreaTemplate)}>
                <summary>Area template</summary>
              <div className="asset-pressure-list" role="region" aria-label="Area template automation">
                {latestAreaTemplate ? (
                  <div className="operator-row tool-call-row">
                    <span>{latestAreaTemplate.snapToGrid ? "Snapped" : "Free"} {titleCaseLabel(latestAreaTemplate.templateShape ?? "circle")} template</span>
                    <strong>{formatNumber(latestAreaTemplate.affectedTokenIds?.length ?? 0)} affected - {latestAreaTemplate.rulesSystemId ?? "generic"}</strong>
                  </div>
                ) : (
                  <span className="panel-empty">No area template automation yet</span>
                )}
                {latestAreaTemplate?.effectHint && <p className="account-summary">{latestAreaTemplate.effectHint}</p>}
                {latestAreaTemplate ? (
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => setTokenTargets(latestAreaTemplate.affectedTokenIds ?? [], true)}>
                      Target affected
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula} onClick={() => rollTemplateDamage(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Roll damage
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula || (latestAreaTemplate.affectedTokenIds?.length ?? 0) === 0 || (!hasPermission("actor.update") && !hasPermission("token.update"))} onClick={() => applyTemplateDamage(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Apply damage
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula || !latestAreaTemplate.templateSaveDc || !latestAreaTemplate.templateSaveAbility || latestAreaTemplate.templateSaveAbility === "none" || (latestAreaTemplate.affectedTokenIds?.length ?? 0) === 0 || (!hasPermission("actor.update") && !hasPermission("token.update"))} onClick={() => resolveTemplateSaves(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Resolve saves
                    </button>
                  </div>
                ) : null}
              </div>
              </details>
              <button className="floating-panel-resize-handle" type="button" aria-label="Resize annotation panel" title="Resize panel" {...annotationToolPanel.resizeHandleProps}>
                <Grip size={13} aria-hidden="true" />
              </button>
            </section>
            )}
            {workspaceMode === "prep" && !fogBrushMode && tab === "content" && (
            <section className="table-tool-panel canvas-asset-dock" aria-label="Canvas asset picker">
              <details>
                <summary>
                  <Upload size={15} /> Assets
                </summary>
                <div className="canvas-asset-dock-body">
                  <select aria-label="Canvas asset folder" value={canvasAssetFolder} onChange={(event) => { setCanvasAssetFolder(event.target.value); setCanvasAssetId(""); }}>
                    <option value="all">All asset folders</option>
                    {canvasAssetFolderOptions.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                  <select aria-label="Canvas asset picker" value={selectedCanvasAsset?.id ?? ""} onChange={(event) => setCanvasAssetId(event.target.value)}>
                    <option value="">Select image asset</option>
                    {visibleCanvasImageAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                  <input aria-label="Canvas image search" value={canvasAssetSearch} placeholder="Search assets" onChange={(event) => { setCanvasAssetSearch(event.target.value); setCanvasAssetId(""); }} />
                  <div className="canvas-asset-grid" role="region" aria-label="Canvas asset thumbnail grid">
                    {visibleCanvasImageAssets.length === 0 ? (
                      <span>No image assets in this folder</span>
                    ) : (
                      visibleCanvasImageAssets.map((asset) => (
                        <button
                          key={asset.id}
                          className="canvas-asset-tile"
                          type="button"
                          draggable={hasPermission("token.create")}
                          aria-pressed={asset.id === selectedCanvasAsset?.id}
                          aria-label={`Select canvas asset ${asset.name}`}
                          title={hasPermission("token.create") ? "Drag asset to the scene" : "Requires token.create"}
                          onClick={() => setCanvasAssetId(asset.id)}
                          onDragStart={(event) => {
                            const imageUrl = assetBlobUrl(asset);
                            event.currentTarget.closest(".table-area")?.classList.add("canvas-asset-dragging");
                            setCanvasAssetDragging(true);
                            tokenDropHandledRef.current = false;
                            writeTokenDropData(event.dataTransfer, { type: "asset", id: asset.id, imageAssetId: asset.id, name: asset.name, layer: "map", disposition: "neutral" });
                            setTokenDropPreview(event.dataTransfer, asset.name, imageUrl);
                          }}
                          onDragEnd={(event) => {
                            event.currentTarget.closest(".table-area")?.classList.remove("canvas-asset-dragging");
                            setCanvasAssetDragging(false);
                            createTokenFromAssetDragEnd(asset, event.clientX, event.clientY).catch(console.error);
                          }}
                        >
                          <img src={assetBlobUrl(asset)} alt="" />
                          <span>{asset.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedCanvasAsset && (
                    <article className="asset-card" aria-label="Selected canvas asset preview">
                      <div className="asset-thumb">
                        <img src={assetBlobUrl(selectedCanvasAsset)} alt="" />
                      </div>
                      <div className="asset-detail">
                        <strong>{selectedCanvasAsset.name}</strong>
                        <span>{selectedCanvasAsset.folder ?? "No folder"} - {formatStorageBytes(selectedCanvasAsset.sizeBytes)}</span>
                        <span>{selectedCanvasAsset.tags?.join(", ") || "No tags"}</span>
                      </div>
                    </article>
                  )}
                  <label className="compact-field">
                    <span>Count</span>
                    <input aria-label="Canvas asset placement count" type="number" min={1} max={6} value={canvasAssetPlacementCount} onChange={(event) => setCanvasAssetPlacementCount(Math.max(1, Math.min(6, Number(event.target.value) || 1)))} />
                  </label>
                  <button className="ghost-button" type="button" disabled={!selectedCanvasAsset || !selectedScene || !hasPermission("token.create")} onClick={() => selectedCanvasAsset && placeCanvasAssetTokens(selectedCanvasAsset, canvasAssetPlacementCount).catch(console.error)}>
                    <MapPin size={16} /> Place selected canvas asset
                  </button>
                  <button className="ghost-button" type="button" disabled={!selectedCanvasAsset || !selectedScene || !hasPermission("scene.update")} onClick={() => selectedCanvasAsset && setSceneBackgroundFromAsset(selectedCanvasAsset).catch(console.error)}>
                    <Eye size={16} /> Set selected canvas background
                  </button>
                </div>
              </details>
            </section>
            )}
          </section>

          <aside className="inspector">
            <div className="tabs inspector-tabs" role="tablist" aria-label="Inspector panels">
              {inspectorTabs.includes("actors") && <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" onClick={() => setTab("actors")} />}
              {inspectorTabs.includes("journal") && <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" onClick={() => setTab("journal")} />}
              {inspectorTabs.includes("chat") && <TabButton active={tab === "chat"} icon={<MessageSquare size={15} />} label="Chat" onClick={() => setTab("chat")} />}
              {inspectorTabs.includes("combat") && <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" onClick={() => setTab("combat")} />}
              {inspectorTabs.includes("content") && <TabButton active={tab === "content"} icon={<Upload size={15} />} label="Content" onClick={() => setTab("content")} />}
              {inspectorTabs.includes("plugins") && <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="Plugins" onClick={() => setTab("plugins")} />}
            </div>
            {tab === "actors" && <ActorPanel campaignId={campaignId} actor={selectedActor} token={selectedToken} systemLabel={snapshot.systems.find((system) => system.id === selectedActor?.systemId)?.name ?? selectedActor?.systemId} scene={selectedScene} currentUserId={currentUserId} actors={snapshot.actors} tokens={snapshot.tokens} combat={activeCombat} members={snapshot.members} assets={snapshot.assets} items={snapshot.items} compendiumEntries={compendiumEntries} compendiumSearch={compendiumSearch} setCompendiumSearch={setCompendiumSearch} compendiumStatus={compendiumStatus} actionTargetActorId={actorActionTargetId} setActionTargetActorId={setActorActionTargetId} actionApplyEffect={actorActionApplyEffect} setActionApplyEffect={setActorActionApplyEffect} actionConsumeResources={actorActionConsumeResources} setActionConsumeResources={setActorActionConsumeResources} updateActorHp={updateActorHp} adjustActorHp={adjustActorHp} awardActorXp={awardActorXp} xpProgress={xpProgress} advancementReady={Boolean(xpProgress?.readyToLevel && advancementOptions.length > 0 && canUpdateSelectedActor)} onLevelUp={() => setAdvancementModalOpen(true)} updateActorData={updateActorData} toggleActorCondition={toggleActorCondition} updateItemData={updateItemData} assignItemToActor={assignItemToActor} updateToken={updateSelectedToken} onUploadTokenImage={uploadSelectedTokenImage} targetToken={setTokenTarget} targetTokens={setTokenTargets} deleteToken={deleteSelectedToken} updateTokenVision={updateSelectedTokenVision} useActorAction={useActorAction} onImportCompendiumEntry={importCompendiumEntry} onPurchaseCompendiumEntry={purchaseCompendiumEntry} canCreateToken={hasPermission("token.create")} canUpdateActor={canUpdateSelectedActor} canUpdateToken={hasPermission("token.update")} canDeleteToken={hasPermission("token.delete")} canUseAction={canUpdateSelectedActor && hasPermission("dice.roll")} />}
            {tab === "journal" && <JournalPanel journals={snapshot.journals} title={newJournalTitle} setTitle={setNewJournalTitle} body={newJournalBody} setBody={setNewJournalBody} visibility={newJournalVisibility} setVisibility={setNewJournalVisibility} tags={newJournalTags} setTags={setNewJournalTags} onCreate={createJournal} onGenerateRecap={generateSessionRecap} canCreate={hasPermission("journal.create")} />}
            {tab === "chat" && <ChatRail campaignId={campaignId} command={chatBody} setCommand={setChatBody} replyTarget={chatReplyTarget} messages={snapshot.chat} rolls={snapshot.rolls} concealedRollIds={concealedRollIds} members={snapshot.members} diceFormula={diceFormula} setDiceFormula={setDiceFormula} diceVisibility={diceVisibility} setDiceVisibility={setDiceVisibility} savedDiceFormulas={savedDiceFormulas} diceMacros={snapshot.diceMacros} onRollDice={rollDice} onSaveDiceFormula={saveCurrentDiceFormula} onSubmitCommand={submitChatCommand} onClearReply={() => setChatReplyToMessageId("")} canRollDice={hasPermission("dice.roll")} dice3dEnabled={dice3dEnabled} onToggleDice3d={() => setDice3dEnabled((enabled) => !enabled)} />}
            {tab === "combat" && <CombatPanel combat={activeCombat} recentCombats={recentEndedCombats} auditLogs={snapshot.combatAudit} actors={snapshot.actors} tokens={snapshot.tokens} onFocusCombatant={(combatant) => selectSingleToken(combatant.tokenId)} onStart={startCombat} onPlanEncounter={planSystemEncounter} onNext={(combat) => advanceCombatTurn(combat, 1)} onPrevious={(combat) => advanceCombatTurn(combat, -1)} onEnd={endCombat} onAwardPartyXp={awardPartyXp} onAwardPartyGold={awardPartyGold} canAwardXp={hasPermission("actor.update")} onUpdateCombatant={updateCombatant} onConfirmAction={confirmCombatAction} onRejectAction={rejectCombatAction} canManage={hasPermission("combat.manage")} />}
            {tab === "content" && <ContentImportPanel assets={snapshot.assets} assetStorage={snapshot.assetStorage} selectedScene={selectedScene} assetSearch={assetSearch} setAssetSearch={setAssetSearch} assetFolder={assetFolder} setAssetFolder={setAssetFolder} assetTags={assetTags} setAssetTags={setAssetTags} assetStatus={assetStatus} failedAssetUpload={failedAssetUpload} onRetryFailedAssetUpload={retryAssetUpload} onDismissFailedAssetUpload={dismissFailedAssetUpload} lifecycleReason={assetLifecycleReason} setLifecycleReason={setAssetLifecycleReason} onUploadAsset={uploadAssetToLibrary} onSetSceneBackground={setSceneBackgroundFromAsset} onPlaceAssetToken={createTokenFromAsset} onUpdateAssetMetadata={updateAssetMetadata} onUpdateAssetLifecycle={updateAssetLifecycle} onCreateAssetDeliveryUrl={createAssetDeliveryUrl} imports={snapshot.contentImports} kind={contentImportKind} setKind={setContentImportKind} name={contentImportName} setName={setContentImportName} body={contentImportBody} setBody={setContentImportBody} status={contentImportStatus} onPreview={previewContentImport} onAnalyzePdf={analyzePdfContentImport} onApply={applyContentImport} onRollback={rollbackContentImport} onDelete={deleteContentImport} canManage={hasPermission("campaign.update")} canCreateAsset={hasPermission("scene.create")} canUpdateScene={hasPermission("scene.update")} canCreateToken={hasPermission("token.create")} />}
            {tab === "plugins" && <SdkPanel plugins={snapshot.plugins} systems={snapshot.systems} characterTemplates={snapshot.characterTemplates} actor={selectedActor} advancementOptions={advancementOptions} advancementGrantsFeat={advancementGrantsFeat} advancementFeats={advancementFeats} multiclassOptions={multiclassOptions} importedActor={importedActor} createdMonster={createdMonster} onSyncPluginRegistries={syncPluginRegistries} onInstallPlugin={installPlugin} onInstallSystem={installSystem} onCreateCharacter={createCharacterFromTemplate} onOpenCharacterCreator={() => void openCharacterCreator()} onImportCharacter={importSystemCharacter} onCreateMonster={createSystemMonster} onAdvanceActor={advanceSelectedActor} onRestActor={restSelectedActor} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={hasPermission("plugin.install")} canInstallSystem={hasPermission("campaign.update")} canCreateActor={hasPermission("actor.create")} canImportActor={hasPermission("actor.create")} canAdvanceActor={canUpdateSelectedActor} canRestActor={canUpdateSelectedActor} canRollSystem={hasPermission("dice.roll")} />}
          </aside>
        </div>
        ) : workspaceMode === "ai" ? (
          <section className="ai-studio-stage" aria-label="AI Studio workspace">
            {aiPanelElement}
          </section>
        ) : (
          <section className="manage-workspace-stage" aria-label="Manage workspace">
            <div className="operator-section manage-stage-card">
              <div className="operator-heading">
                <div>
                  <div className="section-title">Manage</div>
                  <h2>{selectedCampaign?.name ?? "Workspace settings"}</h2>
                </div>
                <UserCog size={18} />
              </div>
              <p className="account-summary">Use the Manage drawer on the left for account, campaign, people, scenes, archives, and server-admin operations.</p>
              <div className="metric-grid">
                <MetricTile label="Campaigns" value={formatNumber(snapshot.campaigns.length)} />
                <MetricTile label="Scenes" value={formatNumber(accessibleScenes.length)} />
                <MetricTile label="Invites" value={formatNumber(snapshot.organizationInvites.filter((invite) => invite.status === "pending").length)} />
              </div>
            </div>
          </section>
        )}

      </section>
      {aiAgentOpen && (
        <AiAgentPanel
          messages={aiAgentMessages}
          prompt={aiAgentPrompt}
          status={aiAgentStatus}
          busy={aiAgentBusy}
          codexAuth={aiAgentCodexAuth}
          proposals={snapshot.proposals}
          hiddenProposalIds={aiAgentHiddenProposalIds}
          canApply={hasPermission("ai.applyChanges")}
          approvalMode={aiAgentApprovalMode}
          onApprovalModeChange={setAiAgentApprovalMode}
          onPromptChange={setAiAgentPrompt}
          onSend={() => sendAiAgentMessage().catch((error) => setAiAgentStatus(errorMessage(error)))}
          onStop={stopAiAgentTurn}
          onStartCodexAuth={startAiAgentCodexAuth}
          onClose={() => setAiAgentOpen(false)}
          onApply={applyAiAgentProposal}
          onReject={rejectAiAgentProposal}
        />
      )}
      <div id={diceBoxContainerId} className="dice-box-stage" aria-hidden="true" />
      {!blankCanvasDemoOpen && <AudioPlaybackLayer tracks={snapshot.audioTracks} masterVolume={audioMasterVolume} muted={audioMuted} />}
      {!blankCanvasDemoOpen && audioSoundboardOpen && hasPermission("scene.update") && (
        <AudioSoundboard
          tracks={snapshot.audioTracks}
          masterVolume={audioMasterVolume}
          muted={audioMuted}
          onMasterVolumeChange={setAudioMasterVolume}
          onToggleMuted={() => setAudioMuted((muted) => !muted)}
          onToggleTrack={(track) => void toggleAudioTrack(track)}
          onDeleteTrack={(track) => void deleteAudioTrack(track)}
          onCreateTrack={createAudioTrack}
          onUploadTrack={uploadAudioTrack}
          onClose={() => setAudioSoundboardOpen(false)}
        />
      )}
      {encounterBuilderOpen && selectedCampaign && encounterBuilderSystem && (
        <EncounterBuilderDialog
          campaignId={selectedCampaign.id}
          systemId={encounterBuilderSystem.id}
          systemName={encounterBuilderSystem.name}
          partyActors={partyActors}
          activeScene={selectedScene}
          canSave={hasPermission("combat.manage")}
          canSpawn={Boolean(selectedScene && hasPermission("token.create"))}
          onClose={() => setEncounterBuilderOpen(false)}
          onPlan={setEncounterPlan}
          onEncounterSaved={applyEncounterToSnapshot}
          onSpawnThreats={spawnEncounterThreatTokens}
          onStatus={setStatus}
        />
      )}
      {commandPaletteOpen && <CommandPalette commands={paletteCommands} onRun={runPaletteCommand} onClose={() => setCommandPaletteOpen(false)} />}
      {advancementModalOpen && selectedActor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAdvancementModalOpen(false);
        }}>
          <div className="modal-dialog advancement-modal" role="dialog" aria-modal="true" aria-label="Level up actor">
            <div className="operator-heading">
              <div>
                <div className="section-title">Advancement</div>
                <h2>{selectedActor.name}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close level up" onClick={() => setAdvancementModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <AdvancementFlow
              actor={selectedActor}
              advancementOptions={advancementOptions}
              advancementGrantsFeat={advancementGrantsFeat}
              advancementFeats={advancementFeats}
              multiclassOptions={multiclassOptions}
              onAdvanceActor={async (optionId, choices) => {
                await advanceSelectedActor(optionId, choices);
                setAdvancementModalOpen(false);
              }}
              canAdvanceActor={canUpdateSelectedActor}
            />
          </div>
        </div>
      )}
      {characterCreatorOpen && (
        <CharacterCreatorDialog
          templates={snapshot.characterTemplates}
          origins={characterOrigins}
          members={snapshot.members}
          currentUserId={currentUserId}
          onClose={() => setCharacterCreatorOpen(false)}
          onCreate={createCharacterFromCreator}
        />
      )}
      {shortcutOverlayOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShortcutOverlayOpen(false);
        }}>
          <div className="modal-dialog shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="operator-heading">
              <div className="section-title">Keyboard Shortcuts</div>
              <button className="icon-button" type="button" aria-label="Close keyboard shortcuts" onClick={() => setShortcutOverlayOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="shortcut-grid">
              {keyboardShortcutRows.map((row) => (
                <div className="shortcut-row" key={row.keys}>
                  <kbd>{row.keys}</kbd>
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
              <span>{toast.text}</span>
              <button className="icon-button" type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {activeDiceCasts.length > 0 && <DiceCastOverlay casts={activeDiceCasts} />}
    </main>
  );
}

function AudioPlaybackLayer(props: { tracks: AudioTrack[]; masterVolume: number; muted: boolean }) {
  const elementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const desired = useMemo(() => desiredAudioStates(props.tracks, { masterVolume: props.masterVolume, muted: props.muted }), [props.masterVolume, props.muted, props.tracks]);

  useEffect(() => {
    const elements = elementsRef.current;
    const desiredIds = new Set(desired.map((state) => state.trackId));
    for (const [id, element] of elements) {
      if (!desiredIds.has(id)) {
        element.pause();
        elements.delete(id);
      }
    }
    for (const state of desired) {
      let element = elements.get(state.trackId);
      if (!element) {
        element = new Audio();
        element.preload = "auto";
        elements.set(state.trackId, element);
      }
      const playbackUrl = authenticatedAudioUrl(state.url);
      if (element.getAttribute("data-otte-src") !== playbackUrl) {
        element.setAttribute("data-otte-src", playbackUrl);
        element.src = playbackUrl;
      }
      element.loop = state.loop;
      element.volume = state.volume;
      if (state.playing && element.paused) {
        // Browsers may block autoplay until a user gesture; the GM's click counts as one.
        void element.play().catch(() => undefined);
      } else if (!state.playing && !element.paused) {
        element.pause();
        element.currentTime = 0;
      }
    }
  }, [desired]);

  useEffect(
    () => () => {
      for (const element of elementsRef.current.values()) element.pause();
      elementsRef.current.clear();
    },
    []
  );

  return null;
}

function AudioSoundboard(props: {
  tracks: AudioTrack[];
  masterVolume: number;
  muted: boolean;
  onMasterVolumeChange(volume: number): void;
  onToggleMuted(): void;
  onToggleTrack(track: AudioTrack): void;
  onDeleteTrack(track: AudioTrack): void;
  onCreateTrack(input: { name: string; url: string; kind: AudioTrack["kind"]; loop: boolean }): Promise<void>;
  onUploadTrack(file: File, input: { name?: string; kind: AudioTrack["kind"]; loop: boolean }): Promise<void>;
  onClose(): void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AudioTrack["kind"]>("ambient");
  const [uploading, setUploading] = useState(false);
  const playingCount = activeAudioCount(props.tracks);
  const soundboardPanel = useMovablePanel(initialSoundboardPanelPosition, initialSoundboardPanelSize, { minWidth: 260, minHeight: 320 });

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    await props.onCreateTrack({ name: name.trim(), url: url.trim(), kind, loop: kind !== "sfx" });
    setName("");
    setUrl("");
  };

  const uploadFile = async (file: File, input: HTMLInputElement) => {
    setUploading(true);
    try {
      await props.onUploadTrack(file, { name: name.trim() || audioTrackNameFromFile(file), kind, loop: kind !== "sfx" });
      setName("");
      setUrl("");
    } finally {
      input.value = "";
      setUploading(false);
    }
  };

  return (
    <aside className="audio-soundboard movable-panel" aria-label="Soundboard" style={soundboardPanel.style}>
      <header className="audio-soundboard-header floating-panel-header" title="Drag panel" {...soundboardPanel.dragHandleProps}>
        <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
        <div className="section-title">
          <Music size={16} /> Soundboard
        </div>
        <button className="icon-button" type="button" aria-label="Close soundboard" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="audio-soundboard-master">
        <button className="icon-button" type="button" aria-label={props.muted ? "Unmute" : "Mute"} title={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMuted}>
          {props.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={props.masterVolume} aria-label="Master volume" onChange={(event) => props.onMasterVolumeChange(Number(event.target.value))} />
        <span className="audio-soundboard-count">{playingCount} playing</span>
      </div>
      <ul className="audio-soundboard-list">
        {props.tracks.length === 0 ? <li className="audio-soundboard-empty">No tracks yet. Add a music or ambience URL below.</li> : null}
        {props.tracks.map((track) => (
          <li key={track.id} className={track.playing ? "audio-track playing" : "audio-track"}>
            <button className="icon-button" type="button" aria-label={track.playing ? `Stop ${track.name}` : `Play ${track.name}`} title={track.playing ? "Stop" : "Play"} onClick={() => props.onToggleTrack(track)}>
              {track.playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <span className="audio-track-name" title={track.url}>
              {track.name}
            </span>
            <span className="audio-track-kind">{track.kind}</span>
            <button className="icon-button" type="button" aria-label={`Delete ${track.name}`} title="Delete" onClick={() => props.onDeleteTrack(track)}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="audio-soundboard-add"
        onSubmit={(event) => {
          event.preventDefault();
          submit().catch(console.error);
        }}
      >
        <input value={name} placeholder="Track name" aria-label="Track name" onChange={(event) => setName(event.target.value)} />
        <input value={url} placeholder="https://… or /audio/…" aria-label="Track URL" onChange={(event) => setUrl(event.target.value)} />
        <label className="audio-upload-control">
          <span>
            <Upload size={14} /> Upload audio
          </span>
          <input
            type="file"
            accept="audio/*"
            aria-label="Upload audio file"
            disabled={uploading}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (file) uploadFile(file, input).catch(console.error);
            }}
          />
        </label>
        <div className="audio-soundboard-add-row">
          <select value={kind} aria-label="Track kind" onChange={(event) => setKind(event.target.value as AudioTrack["kind"])}>
            <option value="ambient">Ambience</option>
            <option value="music">Music</option>
            <option value="sfx">Effect</option>
          </select>
          <button className="primary-button" type="submit" disabled={uploading || !name.trim() || !url.trim()}>
            <Plus size={15} /> Add
          </button>
        </div>
      </form>
      <button className="floating-panel-resize-handle" type="button" aria-label="Resize soundboard panel" title="Resize panel" {...soundboardPanel.resizeHandleProps}>
        <Grip size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}

function CommandPalette(props: { commands: PaletteCommand[]; onRun(commandId: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const queryFormula = paletteDiceFormula(query);
  const matches = filterPaletteCommands(props.commands, query).slice(0, 12);
  const results: PaletteCommand[] = queryFormula
    ? [{ id: `roll:${queryFormula}`, label: `Roll ${queryFormula}`, section: "Dice", hint: "press Enter to roll" }, ...matches.filter((command) => command.id !== `roll:${queryFormula}`)]
    : matches;
  const active = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, query]);

  return (
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-palette-input-row">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            aria-label="Command palette search"
            placeholder="Jump to a scene, switch workspace, or roll 2d6+3..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex(movePaletteIndex(active, 1, results.length));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(movePaletteIndex(active, -1, results.length));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const target = results[active];
                if (target) props.onRun(target.id);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette-list" ref={listRef} role="listbox" aria-label="Command results">
          {results.length === 0 && <div className="command-palette-empty">No matching commands.</div>}
          {results.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === active}
              data-active={index === active ? "true" : undefined}
              className={index === active ? "command-palette-item active" : "command-palette-item"}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => props.onRun(command.id)}
            >
              <span className="command-palette-item-label">{command.label}</span>
              {command.hint && <small>{command.hint}</small>}
              <span className="command-palette-item-section">{command.section}</span>
            </button>
          ))}
        </div>
        <footer className="command-palette-footer">
          <span>
            <kbd>Up</kbd>
            <kbd>Down</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> toggle
          </span>
        </footer>
      </div>
    </div>
  );
}

function DiceCastOverlay(props: { casts: DiceCastPlan[] }) {
  return (
    <div className="dice-cast-overlay" aria-hidden="true">
      {props.casts.map((cast) => (
        <div className={cast.highlight ? `dice-cast dice-cast-${cast.highlight}` : "dice-cast"} key={cast.rollId}>
          <div className="dice-cast-dice">
            {cast.dice.map((die) => {
              const shape = dieShapeName(die.sides);
              const points = dieShapePoints(shape);
              const face = die.value >= die.sides ? "crit" : die.value === 1 ? "fumble" : "plain";
              const style = {
                "--cast-delay": `${die.delayMs}ms`,
                "--cast-spin-x": `${die.spinXTurns}turn`,
                "--cast-spin-y": `${die.spinYTurns}turn`,
                "--cast-from-x": `${die.fromXVmin}vmin`,
                "--cast-from-y": `${die.fromYVmin}vmin`,
                "--cast-rest": `${360 + die.restTiltDeg}deg`,
                "--cast-final-opacity": die.kept ? 1 : 0.4
              } as CSSProperties;
              return (
                <span className={`dice-cast-die dice-cast-die-${shape} dice-cast-die-${face}${die.kept ? "" : " dice-cast-die-dropped"}`} key={die.id} style={style}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    {points ? <polygon className="dice-cast-face" points={points} /> : <rect className="dice-cast-face" x="5" y="5" width="38" height="38" rx="8" />}
                  </svg>
                  <strong>{die.value}</strong>
                </span>
              );
            })}
          </div>
          <div className="dice-cast-label" style={{ "--cast-label-delay": `${cast.settleMs}ms` } as CSSProperties}>
            <span>{cast.label}</span>
            <strong>{formatNumber(cast.total)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function AiAgentPanel(props: {
  messages: AiAgentMessage[];
  prompt: string;
  status: string;
  busy: boolean;
  codexAuth: AiAgentCodexAuthPrompt | null;
  proposals: Proposal[];
  hiddenProposalIds: ReadonlySet<string>;
  canApply: boolean;
  approvalMode: AiAgentApprovalMode;
  onApprovalModeChange(value: AiAgentApprovalMode): void;
  onPromptChange(value: string): void;
  onSend(): void;
  onStop(): void;
  onStartCodexAuth(auth: CodexAuthStart): void;
  onClose(): void;
  onApply(proposal: Proposal): void;
  onReject(proposal: Proposal): void;
}) {
  const agentProposals = visibleAiAgentProposals(props.proposals, props.messages, props.hiddenProposalIds);
  const codexAuthUrl = props.codexAuth?.authUrl ?? props.codexAuth?.verificationUrl;
  const agentPanel = useMovablePanel(initialAiAgentPanelPosition, initialAiAgentPanelSize, { minWidth: 340, minHeight: 420 });
  const agentStatusLabel = props.busy ? "Working" : agentProposals.length > 0 ? `${formatNumber(agentProposals.length)} ${agentProposals.length === 1 ? "proposal" : "proposals"}` : "Ready";
  const handleAiAgentPromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!props.busy && props.prompt.trim()) props.onSend();
    }
  };
  return (
    <aside className="ai-agent-popout movable-panel" aria-label="AI Agent" style={agentPanel.style}>
      <header className="ai-agent-header floating-panel-header" title="Drag panel" {...agentPanel.dragHandleProps}>
        <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
        <div className="ai-agent-title-block">
          <span className="section-title">AI Agent</span>
          <strong>{props.status}</strong>
        </div>
        <span className="ai-agent-status-pill">{agentStatusLabel}</span>
        <button className="icon-button" type="button" aria-label="Close AI Agent" title="Close" onClick={props.onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="ai-agent-body">
        <div className="ai-agent-utility-bar ai-agent-controls">
          <label>
            <span>Approval</span>
            <select
              aria-label="AI Agent approval mode"
              value={props.approvalMode}
              onChange={(event) => props.onApprovalModeChange(event.target.value as AiAgentApprovalMode)}
              disabled={!props.canApply}
            >
              <option value="manual">Ask before applying</option>
              <option value="auto">Auto approve and apply</option>
            </select>
          </label>
          <span className="ai-agent-mode-hint">{props.canApply ? "Proposal-first" : "Read only"}</span>
        </div>
        <section className="ai-agent-feed" aria-label="AI Agent messages">
          {props.messages.length === 0 ? (
            <div className="empty-state compact">Ask for table prep, board edits, proposal review, or rules-supported actions.</div>
          ) : (
            props.messages.map((message) => (
              <article className={`ai-agent-message ${message.role}`} key={message.id}>
                <span>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</span>
                <p>{message.content}</p>
                {message.reasoning && message.reasoning.length > 0 && (
                  <details className="ai-agent-reasoning">
                    <summary>Reasoning trace</summary>
                    {message.reasoning.map((trace, index) => (
                      <p key={`${message.id}-reasoning-${index}`}>{trace}</p>
                    ))}
                  </details>
                )}
              </article>
            ))
          )}
          {props.busy && (
            <article className="ai-agent-working" aria-live="polite">
              <Bot className="ai-agent-working-bot" size={24} />
              <div>
                <span>Agent working</span>
                <div className="ai-agent-working-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          )}
        </section>
        {props.codexAuth && (
          <section className="ai-agent-auth-callout" aria-label="Codex app-server sign-in">
            <div>
              <strong>ChatGPT sign-in required</strong>
              <p>{props.codexAuth.message}</p>
            </div>
            <div className="ai-agent-auth-actions">
              {codexAuthUrl ? (
                <button className="primary-button ai-agent-auth-link" type="button" onClick={() => props.onStartCodexAuth(props.codexAuth!)}>
                  <KeyRound size={16} /> Open sign-in
                </button>
              ) : (
                <span className="ai-agent-auth-missing">No sign-in link</span>
              )}
              {props.codexAuth.userCode && (
                <div className="ai-agent-auth-code">
                  <span>Device code</span>
                  <code>{props.codexAuth.userCode}</code>
                </div>
              )}
            </div>
          </section>
        )}
        {agentProposals.length > 0 && (
          <section className="ai-agent-proposal-list ai-agent-proposals" aria-label="AI Agent proposals">
            {agentProposals.map((proposal) => (
              <div className="ai-agent-proposal-row" key={proposal.id}>
                <span className={`status-pill ${proposal.status}`}>{proposal.status}</span>
                <strong>{proposal.title}</strong>
                <small>{formatNumber(proposal.changesJson.length)} changes</small>
                {(proposal.status === "pending" || proposal.status === "approved") && (
                  <div>
                    <button className="ghost-button" type="button" disabled={!props.canApply} onClick={() => props.onApply(proposal)}>
                      <Check size={14} /> {proposalReviewActionLabel(proposal)}
                    </button>
                    <button className="ghost-button" type="button" disabled={!props.canApply} onClick={() => props.onReject(proposal)}>
                      <X size={14} /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
      <form
        className="ai-agent-composer"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <textarea aria-label="AI Agent prompt" value={props.prompt} placeholder="Ask the agent..." onChange={(event) => props.onPromptChange(event.target.value)} onKeyDown={handleAiAgentPromptKeyDown} disabled={props.busy} />
        {props.busy ? (
          <button className="ghost-button ai-agent-stop-button" type="button" onClick={props.onStop}>
            <X size={16} /> Stop
          </button>
        ) : (
          <button className="primary-button" type="submit" disabled={!props.prompt.trim()}>
            <Send size={16} /> Send
          </button>
        )}
      </form>
      <button className="floating-panel-resize-handle" type="button" aria-label="Resize AI Agent panel" title="Resize panel" {...agentPanel.resizeHandleProps}>
        <Grip size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}

function parseTokenConditions(value: string): NonNullable<Token["conditions"]> {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({ id: slugId(name), name }));
}

function formatTokenConditions(token?: Token): string {
  return token?.conditions?.map((condition) => condition.name).join(", ") ?? "";
}

function parseTokenAuras(value: string): NonNullable<Token["auras"]> {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name = "", radius = "0", color] = item.split(":").map((part) => part.trim());
      return { id: slugId(name), name, radius: Math.max(0, Math.round(Number(radius) || 0)), ...(color ? { color } : {}) };
    })
    .filter((aura) => aura.id && aura.name);
}

function formatTokenAuras(token?: Token): string {
  return token?.auras?.map((aura) => `${aura.name}:${aura.radius}${aura.color ? `:${aura.color}` : ""}`).join("; ") ?? "";
}

function ActorPanel(props: { campaignId: string; actor?: Actor; token?: Token; systemLabel?: string; scene?: Scene; currentUserId: string; actors: Actor[]; tokens: Token[]; combat?: Combat; members: Snapshot["members"]; assets: MapAsset[]; items: Item[]; compendiumEntries: RulesCompendiumEntry[]; compendiumSearch: string; setCompendiumSearch(value: string): void; compendiumStatus: string; actionTargetActorId: string; setActionTargetActorId(value: string): void; actionApplyEffect: boolean; setActionApplyEffect(value: boolean): void; actionConsumeResources: boolean; setActionConsumeResources(value: boolean): void; updateActorHp(actor: Actor, current: number): void; adjustActorHp(actor: Actor, delta: number): void; awardActorXp(actor: Actor, amount: number): void; xpProgress?: XpProgressInfo; advancementReady: boolean; onLevelUp(): void; updateActorData(actor: Actor, patch: Record<string, unknown>): void; toggleActorCondition(actor: Actor, conditionId: string): void; updateItemData(item: Item, patch: Record<string, unknown>): Promise<void>; assignItemToActor(item: Item, actor: Actor): Promise<void>; updateToken(patch: Partial<Token>): void; onUploadTokenImage(file: File, input?: HTMLInputElement): Promise<void>; targetToken(tokenId: string, targeted: boolean): void; targetTokens(tokenIds: string[], targeted: boolean): void; deleteToken(): void; updateTokenVision(patch: TokenVisionPatch): void; useActorAction(rollId: string, options?: ActorActionCommitOptions): void; onImportCompendiumEntry(entry: RulesCompendiumEntry): Promise<void>; onPurchaseCompendiumEntry(entry: RulesCompendiumEntry, quantity: number): Promise<void>; canCreateToken: boolean; canUpdateActor: boolean; canUpdateToken: boolean; canDeleteToken: boolean; canUseAction: boolean }) {
  const [sheetView, setSheetView] = useState<"stats" | "loadout" | "actions" | "compendium">("stats");
  const [assignItemId, setAssignItemId] = useState("");
  const [itemDropActive, setItemDropActive] = useState(false);
  const [loadoutSearch, setLoadoutSearch] = useState("");
  const [loadoutFilter, setLoadoutFilter] = useState<ActorLoadoutFilter>("all");
  const [purchaseQuantities, setPurchaseQuantities] = useState<Record<string, number>>({});
  const [actionPreview, setActionPreview] = useState<ActorActionResolutionPreview | undefined>();
  const [actionPreviewStatus, setActionPreviewStatus] = useState("");
  const [actionPreviewRollId, setActionPreviewRollId] = useState("");
  const [actionSaveOutcomes, setActionSaveOutcomes] = useState<Record<string, RulesSaveOutcome>>({});
  const [actionEffectChoice, setActionEffectChoice] = useState("");
  const [targetAreaX, setTargetAreaX] = useState("0");
  const [targetAreaY, setTargetAreaY] = useState("0");
  const [targetAreaWidth, setTargetAreaWidth] = useState("1200");
  const [targetAreaHeight, setTargetAreaHeight] = useState("800");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const tokenImageInputRef = useRef<HTMLInputElement | null>(null);
  const sheetPanel = useMovablePanel(initialActorSheetPanelPosition, initialActorSheetPanelSize, { minWidth: 380, minHeight: 360 });
  useEffect(() => {
    if (deleteDialogOpen) deleteConfirmRef.current?.focus();
  }, [deleteDialogOpen]);
  useEffect(() => {
    setFullSheetOpen(false);
  }, [props.token?.id]);
  useEffect(() => {
    if (!fullSheetOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullSheetOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [fullSheetOpen]);
  useEffect(() => {
    if (!props.actor || props.actor.systemId !== "dnd-5e-srd" || !props.canUseAction) {
      setActionPreview(undefined);
      setActionPreviewStatus("");
      return;
    }
    const actorItems = props.items.filter((item) => item.actorId === props.actor?.id);
    const actions = actorActionOptions(props.actor, actorItems);
    const previewAction = actions.find((action) => action.rollId === actionPreviewRollId) ?? actions[0];
    if (!previewAction) {
      setActionPreview(undefined);
      setActionPreviewStatus("");
      return;
    }
    let cancelled = false;
    setActionPreviewStatus("Previewing");
    apiPost<{ resolution?: ActorActionResolutionPreview }>(`/api/v1/campaigns/${props.campaignId}/systems/${props.actor.systemId}/actors/${props.actor.id}/roll`, {
      rollId: previewAction.rollId,
      targetActorId: props.actionTargetActorId || props.actor.id,
      applyEffect: props.actionApplyEffect,
      consumeResources: props.actionConsumeResources,
      saveOutcomes: Object.keys(actionSaveOutcomes).length > 0 ? actionSaveOutcomes : undefined,
      effectChoice: actionEffectChoice || undefined,
      commit: false
    })
      .then((result) => {
        if (cancelled) return;
        setActionPreview(result.resolution);
        setActionPreviewStatus(result.resolution ? "Preview ready" : "");
      })
      .catch((error) => {
        if (cancelled) return;
        setActionPreview(undefined);
        setActionPreviewStatus(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [props.actor?.id, props.actor?.updatedAt, props.campaignId, props.actionApplyEffect, props.actionConsumeResources, props.actionTargetActorId, props.canUseAction, props.items, actionPreviewRollId, actionSaveOutcomes, actionEffectChoice]);
  useEffect(() => {
    setActionSaveOutcomes({});
    setActionEffectChoice("");
  }, [props.actor?.id, props.actionTargetActorId, actionPreviewRollId]);
  if (!props.actor) return <div className="panel-empty">No actor selected.</div>;
  const tokenOwnerIds = props.token?.ownerUserIds ?? [];
  const playerOwnerIds = tokenPlayerOwnerIds(props.members);
  const setTokenOwner = (userId: string, checked: boolean) => {
    const nextOwners = new Set(tokenOwnerIds);
    if (checked) nextOwners.add(userId);
    else nextOwners.delete(userId);
    props.updateToken({ ownerUserIds: [...nextOwners].sort() });
  };
  const hp = props.actor.data.hp as { current?: number; max?: number } | undefined;
  const conditions = actorConditionLabels(props.actor);
  const combatState = actorCombatStateLabels(props.actor);
  const actorItems = props.items.filter((item) => item.actorId === props.actor?.id);
  const unassignedItems = props.items.filter((item) => !item.actorId && item.campaignId === props.actor?.campaignId);
  const selectedAssignableItem = unassignedItems.find((item) => item.id === assignItemId);
  const inventory = actorItems.filter((item) => item.type !== "spell" && item.type !== "talent" && item.type !== "clue" && item.type !== "ritual");
  const spells = actorItems.filter((item) => item.type === "spell");
  const talents = actorItems.filter((item) => item.type === "talent");
  const clues = actorItems.filter((item) => item.type === "clue");
  const rituals = actorItems.filter((item) => item.type === "ritual");
  const normalizedLoadoutSearch = loadoutSearch.trim().toLocaleLowerCase();
  const tokenImageAssets = props.assets.filter(isUsableImageAsset);
  const tokenGridSize = Math.max(1, props.scene?.gridSize ?? 50);
  const tokenFootprintWidth = props.token ? Math.max(1, Math.round(props.token.width / tokenGridSize)) : 1;
  const tokenFootprintHeight = props.token ? Math.max(1, Math.round(props.token.height / tokenGridSize)) : 1;
  const tokenFootprintLabel = tokenFootprintWidth === tokenFootprintHeight ? `${tokenFootprintWidth}x${tokenFootprintHeight}` : `${tokenFootprintWidth}x${tokenFootprintHeight}`;

  function updateTokenSize(width: number, height: number) {
    const safeWidth = Math.max(1, Math.round(width) || 1);
    const safeHeight = Math.max(1, Math.round(height) || 1);
    if (!props.token || !props.scene) {
      props.updateToken({ width: safeWidth, height: safeHeight });
      return;
    }
    const center = tokenCenter(props.token);
    props.updateToken({ width: safeWidth, height: safeHeight, ...tokenCoordinatesFromCenter(props.scene, safeWidth, safeHeight, center.x, center.y) });
  }

  function setTokenFootprint(cells: number) {
    updateTokenSize(tokenGridSize * cells, tokenGridSize * cells);
  }
  const filteredActorItems = actorItems.filter((item) => {
    const data = recordValue(item.data);
    const isMagic = item.type === "spell" || item.type === "talent" || item.type === "ritual";
    const matchesFilter =
      loadoutFilter === "all" ||
      (loadoutFilter === "equipped" && data.equipped !== false && !isMagic && item.type !== "clue") ||
      (loadoutFilter === "consumable" && data.quantity !== undefined) ||
      (loadoutFilter === "magic" && isMagic);
    if (!matchesFilter) return false;
    if (!normalizedLoadoutSearch) return true;
    return [item.name, item.type, String(data.category ?? ""), String(data.equipmentCategory ?? "")].some((value) => value.toLocaleLowerCase().includes(normalizedLoadoutSearch));
  });
  const readyableGear = inventory.filter((item) => recordValue(item.data).equipped === false);
  const preparableMagic = [...spells, ...talents, ...rituals].filter((item) => recordValue(item.data).prepared === false);
  const resources = actorResourceLabels(props.actor);
  const resourceControls = actorResourceControls(props.actor);
  const actionOptions = actorActionOptions(props.actor, actorItems);
  const actionLabels = actionOptions.map((option) => option.description);
  const firstAction = actionOptions[0];
  const previewAction = actionOptions.find((action) => action.rollId === actionPreviewRollId) ?? firstAction;
  const previewActionSupportsEffect = actorActionSupportsEffect(previewAction);
  const requiredPendingSaves = actionPreview?.pendingSaves?.filter((save) => save.requiredForCommit === true) ?? [];
  const missingRequiredSaveOutcomes = requiredPendingSaves.some((save) => !actionSaveOutcomes[save.actorId]);
  const actionPreviewRequiresInput = Boolean(missingRequiredSaveOutcomes || (actionPreview?.pendingChoice && !actionEffectChoice) || (props.actionApplyEffect && actionPreview?.manualResolutionRequired));
  const actionTargetActorId = props.actionTargetActorId || props.actor.id;
  const selectedActionTarget = props.actors.find((actor) => actor.id === actionTargetActorId) ?? props.actor;
  const actionSaveOutcomePayload = Object.keys(actionSaveOutcomes).length > 0 ? actionSaveOutcomes : undefined;
  const actionEffectChoicePayload = actionEffectChoice || undefined;
  const previewActionCommitOptions: ActorActionCommitOptions = { targetActorId: actionTargetActorId, applyEffect: props.actionApplyEffect, consumeResources: props.actionConsumeResources, saveOutcomes: actionSaveOutcomePayload, effectChoice: actionEffectChoicePayload };
  const baseActionCommitOptions: ActorActionCommitOptions = { targetActorId: actionTargetActorId, applyEffect: props.actionApplyEffect, consumeResources: props.actionConsumeResources };
  const commitOptionsForAction = (rollId: string): ActorActionCommitOptions => (rollId === previewAction?.rollId ? previewActionCommitOptions : baseActionCommitOptions);
  const actionSaveActorName = (actorId: string): string => props.actors.find((actor) => actor.id === actorId)?.name ?? actorId;
  const updateActionSaveOutcome = (actorId: string, outcome: RulesSaveOutcome) => setActionSaveOutcomes((current) => ({ ...current, [actorId]: outcome }));
  const sceneTargetTokens = props.token ? props.tokens.filter((token) => token.sceneId === props.token?.sceneId) : props.tokens;
  const targetedSceneTokens = sceneTargetTokens.filter((token) => token.targetedByUserIds?.includes(props.currentUserId));
  const hostileSceneTokens = sceneTargetTokens.filter((token) => token.disposition === "hostile");
  const targetableSceneTokens = sceneTargetTokens.slice(0, 12);
  const combatants = props.combat?.combatants ?? [];
  const currentCombatant = props.combat && combatants.length > 0 ? combatants[props.combat.turnIndex] ?? combatants[0] : undefined;
  const nextCombatant = props.combat && combatants.length > 1 ? combatants[(props.combat.turnIndex + 1) % combatants.length] : undefined;
  const currentTurnTokenIds = currentCombatant?.tokenId ? [currentCombatant.tokenId] : [];
  const nextTurnTokenIds = nextCombatant?.tokenId ? [nextCombatant.tokenId] : [];
  const areaX = Number(targetAreaX);
  const areaY = Number(targetAreaY);
  const areaWidth = Number(targetAreaWidth);
  const areaHeight = Number(targetAreaHeight);
  const hasTargetArea = [areaX, areaY, areaWidth, areaHeight].every(Number.isFinite) && areaWidth > 0 && areaHeight > 0;
  const areaTargetTokens = hasTargetArea
    ? sceneTargetTokens.filter((token) => {
        const centerX = token.x + token.width / 2;
        const centerY = token.y + token.height / 2;
        return centerX >= areaX && centerX <= areaX + areaWidth && centerY >= areaY && centerY <= areaY + areaHeight;
      })
    : [];
  const areaTargetTokenIds = areaTargetTokens.map((token) => token.id);
  const latestLasso = props.scene?.annotations?.filter((annotation) => annotation.kind === "drawing" && annotation.points.length >= 3).at(-1);
  const lassoTargetTokens = latestLasso
    ? sceneTargetTokens.filter((token) => isPointInsidePoints({ x: token.x + token.width / 2, y: token.y + token.height / 2 }, latestLasso.points))
    : [];
  const lassoTargetTokenIds = lassoTargetTokens.map((token) => token.id);
  const tokenActionTargetOptions = props.tokens
    .filter((token) => token.actorId && (token.id === props.token?.id || token.targetedByUserIds?.includes(props.currentUserId)))
    .map((token) => ({ token, actor: props.actors.find((actor) => actor.id === token.actorId) }))
    .filter((option): option is { token: Token; actor: Actor } => Boolean(option.actor))
    .filter((option, index, options) => options.findIndex((item) => item.actor.id === option.actor.id) === index);
  const armorClass = actorArmorClass(props.actor, actorItems);
  const normalizedCompendiumSearch = props.compendiumSearch.trim().toLocaleLowerCase();
  const filteredCompendiumEntries = props.compendiumEntries
    .filter((entry) => !normalizedCompendiumSearch || [entry.name, entry.type, entry.summary, entry.id].some((value) => value.toLocaleLowerCase().includes(normalizedCompendiumSearch)))
    .slice(0, 8);
  const adversary = isAdversaryActor(props.actor, props.tokens);
  const sheetTone = props.token?.disposition ?? (adversary ? "hostile" : "friendly");
  const rollActions = actionOptions.filter((action) => actorActionDiceFormula(action));
  const featureActions = actionOptions.filter((action) => !actorActionDiceFormula(action));
  const activeConditionIds = parseActorConditions(formatActorConditions(props.actor));
  const conditionChipIds = [...new Set([...quickActorConditionIds, ...activeConditionIds])];
  const toggleCondition = (conditionId: string) => {
    props.toggleActorCondition(props.actor!, conditionId);
  };
  const renderSheetAction = (action: ActorActionOption) => {
    const formula = actorActionDiceFormula(action);
    return (
      <div className="actor-action-row" key={`full-sheet-action-${action.rollId}`}>
        <div className="actor-action-info">
          <strong>{action.label}</strong>
          <span>{action.description}</span>
        </div>
        <button className="ghost-button small" type="button" disabled={!props.canUseAction} onClick={() => props.useActorAction(action.rollId, commitOptionsForAction(action.rollId))}>
          {formula ? <Dices size={14} /> : <WandSparkles size={14} />} {formula ? `Roll ${formula}` : "Use"}
        </button>
      </div>
    );
  };
  return (
    <div className="panel-stack actor-sidebar-summary">
      <header className={`panel-hero actor-hero actor-tone-${sheetTone}`}>
        <div>
          <div className="section-title">{adversary ? "NPC" : "Character"}</div>
          <h2>{props.actor.name}</h2>
          <div className="admin-meta">
            <span title="Rules system">{props.systemLabel ?? props.actor.systemId}</span>
            <span title={props.token ? "Linked token" : undefined}>{props.token ? props.token.name : "No linked token"}</span>
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={() => setFullSheetOpen(true)}>
          <FileText size={16} /> Sheet
        </button>
      </header>
      <section className="operator-section actor-at-a-glance" aria-label="Actor at a glance">
        <HpBar current={hp?.current} max={hp?.max} canEdit={props.canUpdateActor} onAdjust={(delta) => props.adjustActorHp(props.actor!, delta)} />
        <div className="actor-vitals-row">
          <span className="actor-vital" title={armorClass?.label ? `Armor class - ${armorClass.label}` : "Armor class"}>
            <Shield size={13} aria-hidden="true" /> AC {armorClass ? armorClass.value : "?"}
          </span>
          {resources.map((resource) => (
            <span className="actor-vital" key={resource}>{resource}</span>
          ))}
          {conditions.map((condition) => (
            <span className="actor-vital actor-vital-condition" key={condition}>{condition}</span>
          ))}
          {combatState.map((state) => (
            <span className="actor-vital actor-vital-muted" key={state}>{state}</span>
          ))}
        </div>
      </section>
      {fullSheetOpen && (
        <aside className={`actor-sheet-popout movable-panel actor-tone-${sheetTone}`} role="dialog" aria-labelledby={`actor-full-sheet-title-${props.actor.id}`} style={sheetPanel.style}>
          <header className="actor-sheet-header floating-panel-header" title="Drag panel" {...sheetPanel.dragHandleProps}>
            <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
            <div className="actor-sheet-title">
              <div className="section-title">{adversary ? "NPC Sheet" : "Character Sheet"}</div>
              <h2 id={`actor-full-sheet-title-${props.actor.id}`}>{props.actor.name}</h2>
            </div>
            <span className="actor-sheet-ac" title={armorClass?.label ? `Armor class - ${armorClass.label}` : "Armor class"}>
              <Shield size={13} aria-hidden="true" /> {armorClass ? armorClass.value : "?"}
            </span>
            <button className="icon-button" type="button" aria-label="Close full character sheet" onClick={() => setFullSheetOpen(false)}>
              <X size={15} />
            </button>
          </header>
          <div className="actor-sheet-body">
            <section className="actor-sheet-section" aria-label="Full sheet stats">
              <HpBar current={hp?.current} max={hp?.max} canEdit={props.canUpdateActor} onAdjust={(delta) => props.adjustActorHp(props.actor!, delta)} />
              {(conditions.length > 0 || resources.length > 0 || combatState.length > 0) && (
                <div className="actor-vitals-row">
                  {resources.map((resource) => (
                    <span className="actor-vital" key={`sheet-resource-${resource}`}>{resource}</span>
                  ))}
                  {conditions.map((condition) => (
                    <span className="actor-vital actor-vital-condition" key={`sheet-condition-${condition}`}>{condition}</span>
                  ))}
                  {combatState.map((state) => (
                    <span className="actor-vital actor-vital-muted" key={`sheet-state-${state}`}>{state}</span>
                  ))}
                </div>
              )}
            </section>
            {actorItems.length > 0 && (
              <section className="actor-sheet-section" aria-label="Full sheet loadout">
                <div className="actor-sheet-subheading">
                  <span>Loadout</span>
                  <strong>{formatNumber(actorItems.length)}</strong>
                </div>
                <div className="placement-list">
                  {filteredActorItems.slice(0, 16).map((item) => (
                    <span className="placement-chip" key={`full-sheet-item-${item.id}`}>
                      <Boxes size={14} />
                      <span>{itemDisplayLabel(item)}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section className="actor-sheet-section" aria-label="Full sheet actions">
              {actionOptions.length === 0 && <div className="empty-state compact">No actions available.</div>}
              {rollActions.length > 0 && (
                <>
                  <div className="actor-sheet-subheading">
                    <span>Rolls</span>
                    <strong>{formatNumber(rollActions.length)}</strong>
                  </div>
                  {rollActions.slice(0, 10).map(renderSheetAction)}
                </>
              )}
              {featureActions.length > 0 && (
                <>
                  <div className="actor-sheet-subheading">
                    <span>Features</span>
                    <strong>{formatNumber(featureActions.length)}</strong>
                  </div>
                  {featureActions.slice(0, 10).map(renderSheetAction)}
                </>
              )}
            </section>
            <section className="actor-sheet-section" aria-label="Full sheet targeting">
              <div className="actor-sheet-subheading">
                <span>Targeting</span>
                <strong>{formatNumber(targetedSceneTokens.length)} marked</strong>
              </div>
              <div className="metric-row">
                <span>Action target</span>
                <strong>{selectedActionTarget.name}</strong>
              </div>
              {tokenActionTargetOptions.length > 0 && (
                <div className="button-row">
                  {tokenActionTargetOptions.slice(0, 4).map(({ token, actor }) => (
                    <button className={actionTargetActorId === actor.id ? "ghost-button small active" : "ghost-button small"} key={`full-sheet-target-${actor.id}`} type="button" disabled={!props.canUseAction} onClick={() => props.setActionTargetActorId(actor.id)}>
                      <MapPin size={14} /> {actor.name}
                      {token.targetedByUserIds?.includes(props.currentUserId) ? " (marked)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
          <button className="floating-panel-resize-handle" type="button" aria-label="Resize character sheet" title="Resize panel" {...sheetPanel.resizeHandleProps}>
            <Grip size={13} aria-hidden="true" />
          </button>
        </aside>
      )}
      {props.canCreateToken && (
      <section className="operator-section placement-tray" aria-label="Actor placement tray">
        <div className="operator-heading">
          <div className="section-title">Cast</div>
          <strong>drag to place</strong>
        </div>
        <div className="placement-list">
          {props.actors.slice(0, 8).map((actor) => (
            <button
              className="placement-chip"
              key={actor.id}
              type="button"
              draggable={props.canCreateToken}
              aria-label={`Place ${actor.name} actor on scene`}
              title={props.canCreateToken ? "Drag actor to the scene" : "Requires token.create"}
              disabled={!props.canCreateToken}
              onDragStart={(event) => {
                writeTokenDropData(event.dataTransfer, { type: "actor", id: actor.id, actorId: actor.id, name: actor.name, disposition: "friendly" });
                setTokenDropPreview(event.dataTransfer, actor.name);
              }}
            >
              <Users size={14} />
              <span>{actor.name}</span>
            </button>
          ))}
        </div>
      </section>
      )}
      <div className="tabs" role="tablist" aria-label="Actor sheet views">
        <button className={sheetView === "stats" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "stats"} onClick={() => setSheetView("stats")}>
          Stats
        </button>
        <button className={sheetView === "loadout" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "loadout"} onClick={() => setSheetView("loadout")}>
          Loadout
        </button>
        <button className={sheetView === "actions" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "actions"} onClick={() => setSheetView("actions")}>
          Actions
        </button>
        <button className={sheetView === "compendium" ? "tab active" : "tab"} type="button" role="tab" aria-selected={sheetView === "compendium"} onClick={() => setSheetView("compendium")}>
          Compendium
        </button>
      </div>
      {sheetView === "stats" && (
        <section className="operator-section" aria-label="Actor stats sheet">
          <div className="metric-row">
            <span>Armor class</span>
            <strong>{armorClass ? (armorClass.label ? `${armorClass.value} - ${armorClass.label}` : String(armorClass.value)) : "n/a"}</strong>
          </div>
          {resourceControls.map((resource) => (
            <div className="metric-row" key={`stats-resource-${resource.key}`}>
              <span>{resource.label}</span>
              <strong>{formatNumber(resource.current)}</strong>
            </div>
          ))}
          <div className="sheet-row">
            <label htmlFor="actor-hp-tab">Set HP</label>
            <input id="actor-hp-tab" aria-label="Actor sheet current HP" type="number" value={hp?.current ?? 0} disabled={!props.canUpdateActor} onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))} />
          </div>
          {props.xpProgress && (
            <div className="xp-row">
              <div className="xp-bar" role="meter" aria-label={`Experience ${props.xpProgress.xp}${props.xpProgress.nextLevelXp ? ` of ${props.xpProgress.nextLevelXp}` : ""}`} aria-valuemin={props.xpProgress.previousLevelXp} aria-valuemax={props.xpProgress.nextLevelXp ?? props.xpProgress.xp} aria-valuenow={props.xpProgress.xp}>
                <div className="xp-bar-fill" style={{ width: `${props.xpProgress.nextLevelXp ? Math.max(0, Math.min(100, Math.round(((props.xpProgress.xp - props.xpProgress.previousLevelXp) / Math.max(1, props.xpProgress.nextLevelXp - props.xpProgress.previousLevelXp)) * 100))) : 100}%` }} />
                <span className="xp-bar-value">XP {formatNumber(props.xpProgress.xp)}{props.xpProgress.nextLevelXp !== undefined ? ` / ${formatNumber(props.xpProgress.nextLevelXp)}` : ""}</span>
              </div>
              {props.advancementReady && (
                <button className="ghost-button level-up-button" type="button" onClick={() => props.onLevelUp()}>
                  <ChevronUp size={14} /> Level Up
                </button>
              )}
              {props.canUpdateActor && (
                <form className="xp-award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("xp-award-amount") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount !== 0) { props.awardActorXp(props.actor!, amount); input.value = ""; } }}>
                  <input name="xp-award-amount" aria-label="Award XP amount" type="number" placeholder="XP" />
                  <button className="ghost-button small" type="submit">Award</button>
                </form>
              )}
            </div>
          )}
          <div className="condition-quick-chips" role="group" aria-label="Toggle common conditions">
            {conditionChipIds.map((conditionId) => (
              <button
                className={activeConditionIds.includes(conditionId) ? "condition-chip active" : "condition-chip"}
                key={`condition-chip-${conditionId}`}
                type="button"
                aria-pressed={activeConditionIds.includes(conditionId)}
                disabled={!props.canUpdateActor}
                onClick={() => toggleCondition(conditionId)}
              >
                {titleCaseLabel(conditionId)}
              </button>
            ))}
          </div>
          <div className="sheet-row">
            <label htmlFor="actor-conditions-tab">Custom conditions</label>
            <input id="actor-conditions-tab" aria-label="Actor sheet conditions" key={formatActorConditions(props.actor)} defaultValue={formatActorConditions(props.actor)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { conditions: parseActorConditions(event.currentTarget.value) })} />
          </div>
        </section>
      )}
      {sheetView === "loadout" && (
        <section
          className={`operator-section ${itemDropActive ? "drop-active" : ""}`}
          aria-label="Actor loadout sheet"
          onDragEnter={(event) => {
            if (!props.canUpdateActor || !hasItemDropData(event.dataTransfer)) return;
            event.preventDefault();
            setItemDropActive(true);
          }}
          onDragOver={(event) => {
            if (!props.canUpdateActor || !hasItemDropData(event.dataTransfer)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setItemDropActive(false);
          }}
          onDrop={(event) => {
            setItemDropActive(false);
            if (!props.canUpdateActor) return;
            const itemId = readItemDropData(event.dataTransfer);
            const item = props.items.find((candidate) => candidate.id === itemId);
            if (!item) return;
            event.preventDefault();
            props.assignItemToActor(item, props.actor!).catch(console.error);
          }}
        >
          <div className="operator-heading">
            <div className="section-title">Loadout</div>
            <strong>{formatNumber(actorItems.length)} items</strong>
          </div>
          {unassignedItems.length > 0 && (
            <div className="operator-row tool-call-row" aria-label="Assign item to actor">
              <select aria-label="Unassigned item" value={selectedAssignableItem?.id ?? ""} onChange={(event) => setAssignItemId(event.target.value)}>
                <option value="">Select loose item</option>
                {unassignedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button className="ghost-button" type="button" disabled={!selectedAssignableItem || !props.canUpdateActor} onClick={() => selectedAssignableItem && props.assignItemToActor(selectedAssignableItem, props.actor!).then(() => setAssignItemId("")).catch(console.error)}>
                <Plus size={14} /> Assign selected item
              </button>
            </div>
          )}
          {unassignedItems.length > 0 && (
            <div className="loose-item-tray" aria-label="Loose item drag tray">
              {unassignedItems.slice(0, 8).map((item) => (
                <button
                  className="loose-item-chip"
                  key={item.id}
                  type="button"
                  draggable={props.canUpdateActor}
                  aria-label={`Drag ${item.name} to actor loadout`}
                  title={props.canUpdateActor ? "Drag item onto the loadout sheet" : "Requires actor.update"}
                  disabled={!props.canUpdateActor}
                  onDragStart={(event) => writeItemDropData(event.dataTransfer, item)}
                >
                  <Boxes size={14} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="asset-pressure-list" role="region" aria-label="Inventory management">
            <div className="admin-form-grid">
              <label>
                <span>Search</span>
                <input aria-label="Inventory search" value={loadoutSearch} placeholder="Item, type, category" onChange={(event) => setLoadoutSearch(event.target.value)} />
              </label>
              <label>
                <span>Filter</span>
                <select aria-label="Inventory filter" value={loadoutFilter} onChange={(event) => setLoadoutFilter(event.target.value as ActorLoadoutFilter)}>
                  <option value="all">All loadout</option>
                  <option value="equipped">Equipped gear</option>
                  <option value="consumable">Consumables</option>
                  <option value="magic">Spells and talents</option>
                </select>
              </label>
            </div>
            <div className="admin-meta">
              <span>{formatNumber(filteredActorItems.length)} shown</span>
              <span>{formatNumber(inventory.length)} gear</span>
              <span>{formatNumber(actorItems.filter((item) => recordValue(item.data).quantity !== undefined).length)} consumables</span>
              <span>{formatNumber(spells.length + talents.length + rituals.length)} magic</span>
            </div>
            {actorItems.length > 0 && filteredActorItems.length === 0 && <div className="empty-state compact">No loadout items match the current search and filter.</div>}
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={!props.canUpdateActor || readyableGear.length === 0} onClick={() => Promise.all(readyableGear.map((item) => props.updateItemData(item, { equipped: true }))).catch(console.error)}>
                <Check size={14} /> Ready carried gear
              </button>
              <button className="ghost-button" type="button" disabled={!props.canUpdateActor || preparableMagic.length === 0} onClick={() => Promise.all(preparableMagic.map((item) => props.updateItemData(item, { prepared: true }))).catch(console.error)}>
                <WandSparkles size={14} /> Prepare magic
              </button>
            </div>
          </div>
          {actorItems.length === 0 ? (
            <div className="empty-state compact">No inventory, spells, talents, clues, or rituals on this actor.</div>
          ) : filteredActorItems.length === 0 ? (
            null
          ) : (
            filteredActorItems.map((item) => {
              const data = recordValue(item.data);
              const isSpellLike = item.type === "spell" || item.type === "ritual" || item.type === "talent";
              const isGearLike = !isSpellLike && item.type !== "clue";
              return (
                <article className="operator-item admin-item" key={item.id} draggable={props.canUpdateActor} onDragStart={(event) => writeItemDropData(event.dataTransfer, item)}>
                  <div className="operator-row">
                    <span>{titleCaseLabel(item.type)}</span>
                    <strong>{itemDisplayLabel(item)}</strong>
                  </div>
                  <div className="admin-meta">
                    {data.level !== undefined && <span>level {String(data.level)}</span>}
                    {data.category !== undefined && <span>{String(data.category)}</span>}
                    {data.quantity !== undefined && <span>quantity {String(data.quantity)}</span>}
                    <span>{itemPreparedLabel(item)}</span>
                    <span>{itemEquippedLabel(item)}</span>
                  </div>
                  <div className="button-row">
                    {isSpellLike && (
                      <label className="inline-check">
                        <input aria-label={`${item.name} prepared`} type="checkbox" checked={data.prepared !== false} disabled={!props.canUpdateActor} onChange={(event) => props.updateItemData(item, { prepared: event.target.checked })} />
                        <span>Prepared</span>
                      </label>
                    )}
                    {isGearLike && (
                      <label className="inline-check">
                        <input aria-label={`${item.name} equipped`} type="checkbox" checked={data.equipped !== false} disabled={!props.canUpdateActor} onChange={(event) => props.updateItemData(item, { equipped: event.target.checked })} />
                        <span>Equipped</span>
                      </label>
                    )}
                    {data.quantity !== undefined && (
                      <label>
                        <span>Qty</span>
                        <input aria-label={`${item.name} quantity`} type="number" min={0} defaultValue={numericValue(data.quantity, 1)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateItemData(item, { quantity: Math.max(0, Math.floor(Number(event.currentTarget.value))) })} />
                      </label>
                    )}
                    {data.quantity !== undefined && (
                      <>
                        <button className="ghost-button" type="button" disabled={!props.canUpdateActor || numericValue(data.quantity, 1) <= 0} onClick={() => props.updateItemData(item, { quantity: Math.max(0, Math.floor(numericValue(data.quantity, 1) - 1)) })}>
                          <Eraser size={14} /> Spend one
                        </button>
                        <button className="ghost-button" type="button" disabled={!props.canUpdateActor} onClick={() => props.updateItemData(item, { quantity: Math.max(0, Math.floor(numericValue(data.quantity, 1) + 1)) })}>
                          <Plus size={14} /> Add one
                        </button>
                      </>
                    )}
                    {props.canUpdateActor && props.actors.some((candidate) => candidate.id !== props.actor?.id) && (
                      <label>
                        <span>Give to</span>
                        <select aria-label={`Give ${item.name} to actor`} defaultValue="" onChange={(event) => { const nextActor = props.actors.find((candidate) => candidate.id === event.currentTarget.value); if (nextActor) { props.assignItemToActor(item, nextActor).catch(console.error); event.currentTarget.value = ""; } }}>
                          <option value="">Actor</option>
                          {props.actors.filter((candidate) => candidate.id !== props.actor?.id).map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
      {sheetView === "actions" && (
        <section className="operator-section" aria-label="Actor action sheet">
          <div className="operator-heading">
            <div className="section-title">Actions</div>
            <strong>{formatNumber(actionOptions.length)}</strong>
          </div>
          {actionOptions.length === 0 ? (
            <div className="empty-state compact">No system actions are currently available.</div>
          ) : (
            <>
              <div className="asset-pressure-list" role="region" aria-label="Action resolution preview">
                <div className="operator-row tool-call-row">
                  <span>Previewed action</span>
                  <strong>{previewAction?.label ?? "No action"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Target actor</span>
                  <strong>{selectedActionTarget.name}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Marked tokens</span>
                  <strong>{formatNumber(targetedSceneTokens.length)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Effect mode</span>
                  <strong>{props.actionApplyEffect ? "apply damage/healing" : "roll only"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Effect support</span>
                  <strong>{previewAction ? (previewActionSupportsEffect ? "supported" : "roll only") : "no action"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Resources</span>
                  <strong>{props.actionConsumeResources ? "consume resources" : "do not consume"}</strong>
                </div>
                {actionPreviewStatus && (
                  <div className="operator-row tool-call-row">
                    <span>Resolver</span>
                    <strong>{actionPreviewStatus}</strong>
                  </div>
                )}
                {actionPreview?.rolls?.[0] && (
                  <div className="operator-row tool-call-row">
                    <span>Roll preview</span>
                    <strong>{actionPreview.rolls[0].d20Mode && actionPreview.rolls[0].d20Mode !== "normal" ? `${actionPreview.rolls[0].formula} (${actionPreview.rolls[0].d20Mode})` : actionPreview.rolls[0].formula}</strong>
                  </div>
                )}
                {actionPreview?.resourceConsumption && actionPreview.resourceConsumption.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Spend</span>
                    <strong>{actionPreview.resourceConsumption.map((resource) => `${resource.label} ${resource.amount} (${resource.remaining} left)`).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.conditions && actionPreview.conditions.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Conditions</span>
                    <strong>{actionPreview.conditions.map((condition) => condition.conditionName ?? condition.operation).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.pendingSaves?.map((save) => (
                  <div className="operator-row tool-call-row" key={`action-save-${save.actorId}-${save.ability}-${save.reason}`}>
                    <span>{actionSaveActorName(save.actorId)} {titleCaseLabel(save.ability)} save{save.dc ? ` DC ${save.dc}` : ""}</span>
                    {save.requiredForCommit === true ? (
                      <div className="button-row" role="group" aria-label={`${actionSaveActorName(save.actorId)} ${save.ability} save outcome`}>
                        <button className={actionSaveOutcomes[save.actorId] === "success" ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={actionSaveOutcomes[save.actorId] === "success"} onClick={() => updateActionSaveOutcome(save.actorId, "success")}>
                          <Check size={14} /> Success
                        </button>
                        <button className={actionSaveOutcomes[save.actorId] === "failure" ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={actionSaveOutcomes[save.actorId] === "failure"} onClick={() => updateActionSaveOutcome(save.actorId, "failure")}>
                          <X size={14} /> Failure
                        </button>
                      </div>
                    ) : (
                      <strong>{save.reason}</strong>
                    )}
                  </div>
                ))}
                {actionPreview?.pendingReactions && actionPreview.pendingReactions.length > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Reactions</span>
                    <strong>{actionPreview.pendingReactions.map((reaction) => reaction.reason).join(", ")}</strong>
                  </div>
                )}
                {actionPreview?.attunement && actionPreview.attunement.overLimitBy > 0 && (
                  <div className="operator-row tool-call-row">
                    <span>Attunement</span>
                    <strong>{actionPreview.attunement.attunedItemIds.length}/{actionPreview.attunement.limit}</strong>
                  </div>
                )}
                {previewAction && <p>{previewAction.description}</p>}
                {previewAction && props.actionApplyEffect && !previewActionSupportsEffect && <p className="admin-status">Effect unsupported: clear Apply action effect to roll this action.</p>}
                {actionPreview?.blocked && <p className="admin-status">{actionPreview.blocked.reason}</p>}
                {actionPreview?.pendingChoice && (
                  <div className="operator-row tool-call-row">
                    <span>{actionPreview.pendingChoice.reason}</span>
                    <select aria-label="Action effect choice" value={actionEffectChoice} onChange={(event) => setActionEffectChoice(event.target.value)}>
                      <option value="">Choose option</option>
                      {actionPreview.pendingChoice.options.map((option) => (
                        <option key={`action-choice-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {actionPreview?.manualResolutionRequired && <p className="admin-status">Manual resolution required: {actionPreview.manualResolutionRequired.reason}</p>}
                {actionPreviewRequiresInput && <p className="admin-status">Resolve the pending save, choice, or manual step before committing this action.</p>}
                {actionPreview?.warnings?.map((warning) => <p className="admin-status" key={`action-preview-warning-${warning}`}>{warning}</p>)}
                <button className="ghost-button" type="button" disabled={!props.canUseAction || !previewAction || Boolean(actionPreview?.blocked) || actionPreviewRequiresInput || (props.actionApplyEffect && !previewActionSupportsEffect)} onClick={() => previewAction && props.useActorAction(previewAction.rollId, previewActionCommitOptions)}>
                  <WandSparkles size={14} /> Use previewed action
                </button>
              </div>
              {actionOptions.map((action) => {
                const supportsEffect = actorActionSupportsEffect(action);
                const unsupportedEffect = props.actionApplyEffect && !supportsEffect;
                const isPreviewed = action.rollId === previewAction?.rollId;
                const previewBlocked = isPreviewed ? actionPreview?.blocked : undefined;
                const previewRequiresInput = isPreviewed ? actionPreviewRequiresInput : false;
                return (
                  <article className="operator-item admin-item" key={action.rollId}>
                    <strong>{action.label}</strong>
                    <p>{action.description}</p>
                    <div className="admin-meta">
                      <span>{supportsEffect ? "effect supported" : "roll only action"}</span>
                    </div>
                    {unsupportedEffect && <p className="admin-status">Effect unsupported: clear Apply action effect to roll this action.</p>}
                    {previewBlocked && <p className="admin-status">{previewBlocked.reason}</p>}
                    {previewRequiresInput && <p className="admin-status">Resolve pending inputs before committing.</p>}
                    <div className="button-row">
                      <button className={isPreviewed ? "ghost-button active" : "ghost-button"} type="button" aria-pressed={isPreviewed} disabled={!props.canUseAction} onClick={() => setActionPreviewRollId(action.rollId)}>
                        <Eye size={14} /> Preview
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUseAction || unsupportedEffect || Boolean(previewBlocked) || previewRequiresInput} onClick={() => props.useActorAction(action.rollId, commitOptionsForAction(action.rollId))}>
                        <WandSparkles size={14} /> Use action
                      </button>
                    </div>
                  </article>
                );
              })}
            </>
          )}
        </section>
      )}
      <details className="operator-section actor-detail-disclosure actor-token-editor">
        <summary>Token settings</summary>
        <div className="actor-detail-body">
      <div className="metric-row">
        <span>Token</span>
        <strong>{props.token?.name ?? "Unlinked"}</strong>
      </div>
      {props.token && (
        <>
          <div className="metric-row">
            <span>Vision</span>
            <strong>{props.token.visionEnabled ? `${formatNumber(props.token.brightVisionRadius ?? 0)} bright / ${formatNumber(props.token.dimVisionRadius ?? props.token.visionRadius)} dim` : "disabled"}</strong>
          </div>
          <div className="metric-row">
            <span>Token State</span>
            <strong>{[tokenLayerLabel(tokenLayer(props.token)), ...(props.token.conditions?.map((condition) => condition.name) ?? []), ...(props.token.auras?.map((aura) => `${aura.name} ${aura.radius}`) ?? []), ...(props.token.ownerUserIds?.length ? [`Owners ${props.token.ownerUserIds.length}`] : []), ...(props.token.targetedByUserIds?.length ? [`Targeted ${props.token.targetedByUserIds.length}`] : [])].join(", ") || "Ready"}</strong>
          </div>
          <div className="inspector-grid" key={`${props.token.id}-${props.token.x}-${props.token.y}-${props.token.width}-${props.token.height}-${props.token.imageAssetId ?? "marker"}`}>
            <label>
              <span>Name</span>
              <input aria-label="Token inspector name" defaultValue={props.token.name} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ name: event.currentTarget.value.trim() || props.token!.name })} />
            </label>
            <label>
              <span>Actor</span>
              <select aria-label="Token inspector actor" value={props.token.actorId ?? ""} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ actorId: event.target.value || undefined })}>
                <option value="">Unlinked</option>
                {props.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="sheet-row">
              <span>Owners</span>
              <div className="inline-options" aria-label="Token owners">
                {props.members.map((member) => (
                  <label className="inline-check" key={member.userId}>
                    <input type="checkbox" checked={tokenOwnerIds.includes(member.userId)} disabled={!props.canUpdateToken} onChange={(event) => setTokenOwner(member.userId, event.target.checked)} />
                    <span>{member.user.displayName || member.user.email || member.role}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sheet-row token-permission-presets" aria-label="Token permission presets">
              <span>Permission Presets</span>
              <strong>{tokenPermissionPresetLabel(props.token, playerOwnerIds)}</strong>
              <div className="button-row">
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: true, hidden: false })}>
                  <LockKeyhole size={14} /> GM locked
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken || playerOwnerIds.length === 0} onClick={() => props.updateToken({ ownerUserIds: playerOwnerIds, locked: false, hidden: false })}>
                  <Users size={14} /> Party controlled
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: false, hidden: false })}>
                  <Eye size={14} /> Target only
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => props.updateToken({ ownerUserIds: [], locked: true, hidden: true })}>
                  <Shield size={14} /> Hidden hold
                </button>
              </div>
            </div>
            <label>
              <span>Disposition</span>
              <select aria-label="Token inspector disposition" value={props.token.disposition} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ disposition: event.target.value as Token["disposition"] })}>
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="hostile">Hostile</option>
              </select>
            </label>
            <label>
              <span>Image</span>
              <select aria-label="Token image asset" value={props.token.imageAssetId ?? ""} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ imageAssetId: event.target.value || undefined })}>
                <option value="">Default marker</option>
                {tokenImageAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Layer</span>
              <select aria-label="Token layer" value={tokenLayer(props.token)} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ layer: event.target.value as TokenLayer })}>
                {tokenLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="token-image-actions">
              <button className="ghost-button" type="button" disabled={!props.canUpdateToken} onClick={() => tokenImageInputRef.current?.click()}>
                <Upload size={14} /> Upload image
              </button>
              <input
                ref={tokenImageInputRef}
                aria-label="Upload token image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                hidden
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (file) props.onUploadTokenImage(file, input).catch(console.error);
                }}
              />
            </div>
            <div className="sheet-row token-size-presets" aria-label="Token footprint presets">
              <span>Footprint</span>
              <strong>{tokenFootprintLabel} grid</strong>
              <div className="button-row">
                {[1, 2, 3, 4].map((cells) => (
                  <button className="ghost-button" type="button" key={cells} disabled={!props.canUpdateToken || !props.scene} onClick={() => setTokenFootprint(cells)}>
                    {cells}x{cells}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>X</span>
              <input aria-label="Token x" type="number" defaultValue={props.token.x} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ x: Number(event.currentTarget.value) })} />
            </label>
            <label>
              <span>Y</span>
              <input aria-label="Token y" type="number" defaultValue={props.token.y} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ y: Number(event.currentTarget.value) })} />
            </label>
            <label>
              <span>Width</span>
              <input aria-label="Token width" type="number" min={1} defaultValue={props.token.width} disabled={!props.canUpdateToken} onBlur={(event) => updateTokenSize(Number(event.currentTarget.value), props.token!.height)} />
            </label>
            <label>
              <span>Height</span>
              <input aria-label="Token height" type="number" min={1} defaultValue={props.token.height} disabled={!props.canUpdateToken} onBlur={(event) => updateTokenSize(props.token!.width, Number(event.currentTarget.value))} />
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.hidden} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ hidden: event.target.checked })} />
              <span>Hidden</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.locked} disabled={!props.canUpdateToken} onChange={(event) => props.updateToken({ locked: event.target.checked })} />
              <span>Locked</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={props.token.targetedByUserIds?.includes(props.currentUserId) ?? false} onChange={(event) => props.targetToken(props.token!.id, event.target.checked)} />
              <span>Targeted</span>
            </label>
          </div>
          <section className="operator-section" aria-label="Canvas target manager">
            <div className="operator-heading">
              <div>
                <div className="section-title">Canvas Targets</div>
                <p>My targets {formatNumber(targetedSceneTokens.length)} / {formatNumber(sceneTargetTokens.length)}</p>
                {currentCombatant && <p>Initiative: {currentCombatant.name}{nextCombatant ? ` -> ${nextCombatant.name}` : ""}</p>}
              </div>
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={sceneTargetTokens.length === 0} onClick={() => props.targetTokens(sceneTargetTokens.map((token) => token.id), true)}>
                <Crosshair size={14} /> Target visible
              </button>
              <button className="ghost-button" type="button" disabled={hostileSceneTokens.length === 0} onClick={() => props.targetTokens(hostileSceneTokens.map((token) => token.id), true)}>
                <Swords size={14} /> Target hostiles
              </button>
              <button className="ghost-button" type="button" disabled={targetedSceneTokens.length === 0} onClick={() => props.targetTokens(targetedSceneTokens.map((token) => token.id), false)}>
                <X size={14} /> Clear my targets
              </button>
              <button className="ghost-button" type="button" disabled={currentTurnTokenIds.length === 0} onClick={() => props.targetTokens(currentTurnTokenIds, true)}>
                <Timer size={14} /> Target current turn
              </button>
              <button className="ghost-button" type="button" disabled={nextTurnTokenIds.length === 0} onClick={() => props.targetTokens(nextTurnTokenIds, true)}>
                <ChevronRight size={14} /> Target next turn
              </button>
            </div>
            <div className="admin-form-grid" role="group" aria-label="Canvas target area">
              <label>
                <span>X</span>
                <input aria-label="Target area x" type="number" value={targetAreaX} onChange={(event) => setTargetAreaX(event.target.value)} />
              </label>
              <label>
                <span>Y</span>
                <input aria-label="Target area y" type="number" value={targetAreaY} onChange={(event) => setTargetAreaY(event.target.value)} />
              </label>
              <label>
                <span>Width</span>
                <input aria-label="Target area width" type="number" min={1} value={targetAreaWidth} onChange={(event) => setTargetAreaWidth(event.target.value)} />
              </label>
              <label>
                <span>Height</span>
                <input aria-label="Target area height" type="number" min={1} value={targetAreaHeight} onChange={(event) => setTargetAreaHeight(event.target.value)} />
              </label>
              <div className="admin-meta target-preview" role="status" aria-live="polite" aria-label="Target area preview">
                <span>{formatNumber(areaTargetTokens.length)} tokens in area</span>
                {areaTargetTokens.slice(0, 6).map((token) => (
                  <span key={`area-preview-${token.id}`}>{token.name}</span>
                ))}
                {areaTargetTokens.length > 6 && <span>+{formatNumber(areaTargetTokens.length - 6)} more</span>}
              </div>
              <button className="ghost-button" type="button" disabled={areaTargetTokenIds.length === 0} onClick={() => props.targetTokens(areaTargetTokenIds, true)}>
                <Pentagon size={14} /> Target area
              </button>
              <button className="ghost-button" type="button" disabled={areaTargetTokenIds.length === 0} onClick={() => props.targetTokens(areaTargetTokenIds, false)}>
                <Eraser size={14} /> Clear area targets
              </button>
            </div>
            <div className="admin-meta target-preview" role="status" aria-live="polite" aria-label="Latest drawing lasso preview">
              <span>{latestLasso ? `${formatNumber(lassoTargetTokens.length)} tokens in lasso` : "Draw a lasso on the canvas"}</span>
              {lassoTargetTokens.slice(0, 6).map((token) => (
                <span key={`lasso-preview-${token.id}`}>{token.name}</span>
              ))}
              {lassoTargetTokens.length > 6 && <span>+{formatNumber(lassoTargetTokens.length - 6)} more</span>}
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={lassoTargetTokenIds.length === 0} onClick={() => props.targetTokens(lassoTargetTokenIds, true)}>
                <PencilLine size={14} /> Target lasso
              </button>
              <button className="ghost-button" type="button" disabled={lassoTargetTokenIds.length === 0} onClick={() => props.targetTokens(lassoTargetTokenIds, false)}>
                <Eraser size={14} /> Clear lasso targets
              </button>
            </div>
            <div className="placement-list">
              {targetableSceneTokens.map((token) => {
                const actor = token.actorId ? props.actors.find((item) => item.id === token.actorId) : undefined;
                const targeted = token.targetedByUserIds?.includes(props.currentUserId) ?? false;
                return (
                  <button className={targeted ? "placement-chip active" : "placement-chip"} key={`target-${token.id}`} type="button" onClick={() => props.targetToken(token.id, !targeted)}>
                    <Crosshair size={14} />
                    <span>{token.name}{actor && actor.name !== token.name ? ` / ${actor.name}` : ""}</span>
                    {targeted ? <strong>marked</strong> : null}
                  </button>
                );
              })}
            </div>
          </section>
          <label className="sheet-row">
            <span>Conditions</span>
            <input aria-label="Token conditions" defaultValue={formatTokenConditions(props.token)} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ conditions: parseTokenConditions(event.currentTarget.value) })} />
          </label>
          <label className="sheet-row">
            <span>Auras</span>
            <input aria-label="Token auras" defaultValue={formatTokenAuras(props.token)} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ auras: parseTokenAuras(event.currentTarget.value) })} />
          </label>
          <label className="sheet-row">
            <span>Notes</span>
            <textarea aria-label="Token notes" defaultValue={props.token.notes ?? ""} disabled={!props.canUpdateToken} onBlur={(event) => props.updateToken({ notes: event.currentTarget.value })} />
          </label>
          <div className="sheet-row">
            <label htmlFor="token-vision-enabled">Token vision</label>
            <input id="token-vision-enabled" type="checkbox" checked={props.token.visionEnabled} disabled={!props.canUpdateToken} onChange={(event) => props.updateTokenVision({ visionEnabled: event.target.checked })} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-dim-vision">Dim vision radius</label>
            <input id="token-dim-vision" type="number" min={0} value={props.token.dimVisionRadius ?? props.token.visionRadius} disabled={!props.canUpdateToken || !props.token.visionEnabled} onChange={(event) => props.updateTokenVision({ visionRadius: Number(event.target.value), dimVisionRadius: Number(event.target.value) })} />
          </div>
          <div className="sheet-row">
            <label htmlFor="token-bright-vision">Bright vision radius</label>
            <input id="token-bright-vision" type="number" min={0} value={props.token.brightVisionRadius ?? 0} disabled={!props.canUpdateToken || !props.token.visionEnabled} onChange={(event) => props.updateTokenVision(tokenBrightVisionPatch(event.target.value))} />
          </div>
          <button className="ghost-button wide" onClick={() => setDeleteDialogOpen(true)} disabled={!props.canDeleteToken}>
            <X size={16} /> Delete Token
          </button>
          {deleteDialogOpen && props.token && (
            <div className="modal-backdrop" role="presentation">
              <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="token-delete-dialog-title" aria-describedby="token-delete-dialog-description" onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDeleteDialogOpen(false);
                }
                if (event.key === "Tab") {
                  const first = deleteConfirmRef.current;
                  const last = deleteCancelRef.current;
                  if (!first || !last) return;
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}>
                <div className="section-title" id="token-delete-dialog-title">Confirm token deletion</div>
                <p id="token-delete-dialog-description">Delete {props.token.name} from {props.scene?.name ?? "the current scene"}. This removes the token from the scene and keeps the actor sheet.</p>
                <div className="admin-actions">
                  <button className="ghost-button danger-button" type="button" ref={deleteConfirmRef} onClick={() => {
                    setDeleteDialogOpen(false);
                    props.deleteToken();
                  }}>
                    <X size={16} /> Confirm Delete Token
                  </button>
                  <button className="ghost-button" type="button" ref={deleteCancelRef} onClick={() => setDeleteDialogOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
        </div>
      </details>
      <details className="operator-section actor-detail-disclosure">
        <summary>Actor details</summary>
        <div className="actor-detail-body">
      <div className="metric-row">
        <span>HP</span>
        <strong>
          {hp?.current ?? "?"}/{hp?.max ?? "?"}
        </strong>
      </div>
      {armorClass && (
        <div className="metric-row">
          <span>AC</span>
          <strong>{armorClass.label ? `${armorClass.value} (${armorClass.label})` : armorClass.value}</strong>
        </div>
      )}
      {conditions.length > 0 && (
        <div className="metric-row">
          <span>Conditions</span>
          <strong>{conditions.join(", ")}</strong>
        </div>
      )}
      {combatState.length > 0 && (
        <div className="metric-row">
          <span>Combat State</span>
          <strong>{combatState.join(" - ")}</strong>
        </div>
      )}
      {resources.length > 0 && (
        <div className="metric-row">
          <span>Resources</span>
          <strong>{resources.join(", ")}</strong>
        </div>
      )}
      {inventory.length > 0 && (
        <div className="metric-row">
          <span>Inventory</span>
          <strong>{inventory.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {spells.length > 0 && (
        <div className="metric-row">
          <span>Spells</span>
          <strong>{spells.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {talents.length > 0 && (
        <div className="metric-row">
          <span>Talents</span>
          <strong>{talents.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {clues.length > 0 && (
        <div className="metric-row">
          <span>Clues</span>
          <strong>{clues.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {rituals.length > 0 && (
        <div className="metric-row">
          <span>Rituals</span>
          <strong>{rituals.map((item) => itemDisplayLabel(item)).join(", ")}</strong>
        </div>
      )}
      {actionLabels.length > 0 && (
        <div className="metric-row">
          <span>Actions</span>
          <strong>{actionLabels.join(", ")}</strong>
        </div>
      )}
      {firstAction && (
        <>
          <label className="sheet-row">
            <span>Action Target</span>
            <select aria-label="Action target actor" value={actionTargetActorId} disabled={!props.canUseAction} onChange={(event) => props.setActionTargetActorId(event.target.value)}>
              {props.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </select>
          </label>
          {tokenActionTargetOptions.length > 0 && (
            <div className="sheet-row" aria-label="Token action target shortcuts">
              <span>Token Targets</span>
              <div className="button-row">
                {tokenActionTargetOptions.slice(0, 4).map(({ token, actor }) => (
                  <button className={actionTargetActorId === actor.id ? "ghost-button active" : "ghost-button"} key={actor.id} type="button" disabled={!props.canUseAction} onClick={() => props.setActionTargetActorId(actor.id)}>
                    <MapPin size={14} /> Target {actor.name}
                    {token.targetedByUserIds?.includes(props.currentUserId) ? " (marked)" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="inline-check">
            <input aria-label="Apply action effect" type="checkbox" checked={props.actionApplyEffect} disabled={!props.canUseAction} onChange={(event) => props.setActionApplyEffect(event.target.checked)} />
            <span>Apply damage/healing to target</span>
          </label>
          <label className="inline-check">
            <input aria-label="Consume action resources" type="checkbox" checked={props.actionConsumeResources} disabled={!props.canUseAction} onChange={(event) => props.setActionConsumeResources(event.target.checked)} />
            <span>Consume spell slots, item charges, or class resources</span>
          </label>
          <button className="ghost-button wide" onClick={() => previewAction && props.useActorAction(previewAction.rollId, previewActionCommitOptions)} disabled={!props.canUseAction || !previewAction || Boolean(actionPreview?.blocked) || actionPreviewRequiresInput}>
            <WandSparkles size={16} /> Use {previewAction?.label ?? firstAction.label}
          </button>
        </>
      )}
      <div className="sheet-row">
        <label htmlFor="actor-hp">Current HP</label>
        <input id="actor-hp" type="number" value={hp?.current ?? 0} disabled={!props.canUpdateActor} onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))} />
      </div>
      <div className="sheet-row">
        <label htmlFor="actor-conditions">Actor conditions</label>
        <input id="actor-conditions" aria-label="Actor conditions" defaultValue={formatActorConditions(props.actor)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { conditions: parseActorConditions(event.currentTarget.value) })} />
      </div>
      {resourceControls.map((resource) => (
        <div className="sheet-row" key={resource.key}>
          <label htmlFor={`actor-resource-${resource.key}`}>{resource.label}</label>
          <input id={`actor-resource-${resource.key}`} aria-label={`${resource.label} resource current`} type="number" defaultValue={resource.current} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { resources: actorResourceUpdate(props.actor!, resource.key, Number(event.currentTarget.value)) })} />
        </div>
      ))}
        </div>
      </details>
      {sheetView === "compendium" && (
      <section className="operator-section compendium-browser" aria-label="Actor compendium browser">
        <div className="operator-heading">
          <div>
            <div className="section-title">Compendium</div>
            <p>{formatNumber(props.compendiumEntries.length)} entries for {props.actor.systemId}</p>
          </div>
        </div>
        <label>
          <span>Search</span>
          <input aria-label="Compendium search" value={props.compendiumSearch} placeholder="Spell, item, condition" onChange={(event) => props.setCompendiumSearch(event.target.value)} />
        </label>
        <div className="admin-status" role="status" aria-live="polite">{props.compendiumStatus}</div>
        <div className="compendium-list">
          {filteredCompendiumEntries.length === 0 ? (
            <div className="empty-state compact">No compendium entries match this search.</div>
          ) : (
            filteredCompendiumEntries.map((entry) => {
              const purchasable = isPurchasableCompendiumEntry(props.actor!, entry);
              const purchaseQuantity = purchaseQuantities[entry.id] ?? 1;
              return (
                <article className="compendium-entry" key={entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    <p>{entry.summary}</p>
                    <div className="admin-meta">
                      <span>{titleCaseLabel(entry.type)}</span>
                      <span>{entry.id}</span>
                      {entry.data.level !== undefined && <span>level {String(entry.data.level)}</span>}
                      {entry.data.costGp !== undefined && <span>{formatGp(numericValue(entry.data.costGp, 0))}</span>}
                      {purchasable && <span>{formatGp(numericValue(entry.data.costGp, 0) * purchaseQuantity)} total</span>}
                    </div>
                  </div>
                  <div className="admin-actions">
                    {purchasable && (
                      <label>
                        <span>Qty</span>
                        <input
                          aria-label={`${entry.name} purchase quantity`}
                          type="number"
                          min={1}
                          max={99}
                          value={purchaseQuantity}
                          disabled={!props.canUpdateActor}
                          onChange={(event) => setPurchaseQuantities({ ...purchaseQuantities, [entry.id]: clampNumber(Number(event.target.value), 1, 99) })}
                        />
                      </label>
                    )}
                    <button className="ghost-button" type="button" disabled={!props.canUpdateActor} onClick={() => props.onImportCompendiumEntry(entry).catch(console.error)}>
                      <Plus size={14} /> Add
                    </button>
                    {purchasable && (
                      <button className="ghost-button" type="button" disabled={!props.canUpdateActor} onClick={() => props.onPurchaseCompendiumEntry(entry, purchaseQuantity).catch(console.error)}>
                        <Boxes size={14} /> Purchase
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
      )}
      <details className="operator-section raw-data-details">
        <summary>Raw actor data</summary>
        <pre>{JSON.stringify(props.actor.data, null, 2)}</pre>
      </details>
    </div>
  );
}

function isSessionAuthError(error: unknown): boolean {
  const message = errorMessage(error);
  if (error instanceof ApiError && error.status === 401) return true;
  return /unauthorized|missing session token|invalid session token|session token expired/i.test(message);
}

function isProposalNotFoundError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 404 && /proposal not found/i.test(error.message)) return true;
  return /proposal not found/i.test(errorMessage(error));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function codexAuthPromptFromError(error: unknown): CodexAuthStart | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const body = recordValue(error.body);
  if (body.error !== "codex_auth_required") return undefined;
  const auth = recordValue(body.codexAuth);
  const type = auth.type === "chatgptDeviceCode" ? "chatgptDeviceCode" : auth.type === "chatgpt" ? "chatgpt" : undefined;
  if (!type) return undefined;
  return {
    type,
    loginId: stringValue(auth.loginId),
    authUrl: stringValue(auth.authUrl),
    verificationUrl: stringValue(auth.verificationUrl),
    userCode: stringValue(auth.userCode)
  };
}

function reasoningTracesFromEvents(events: AiAgentProviderEvent[]): string[] {
  const streamed = new Map<number, string>();
  const completed: string[] = [];
  for (const event of events) {
    if (event.type === "reasoning.delta" && typeof event.delta === "string") {
      const index = typeof event.summaryIndex === "number" && Number.isFinite(event.summaryIndex) ? event.summaryIndex : 0;
      streamed.set(index, `${streamed.get(index) ?? ""}${event.delta}`);
    }
    if (event.type === "reasoning.completed" && typeof event.content === "string" && event.content.trim()) {
      completed.push(event.content.trim());
    }
  }
  const traces = [...streamed.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, trace]) => trace.trim())
    .filter(Boolean);
  const completedTraces: string[] = [];
  for (const trace of completed) {
    if (!completedTraces.includes(trace)) completedTraces.push(trace);
  }
  return (completedTraces.length > 0 ? completedTraces : traces).slice(0, 4);
}

function sceneIdToOpenAfterProposalApply(proposal: Proposal): string | undefined {
  return updatedSceneIdFromProposal(proposal) ?? createdSceneIdFromProposal(proposal);
}

function updatedSceneIdFromProposal(proposal: Proposal): string | undefined {
  for (const change of proposal.changesJson) {
    if (change.entity === "scene" && change.action === "update" && typeof change.id === "string" && change.id.trim()) return change.id;
  }
  return undefined;
}

function openCodexAuthPrompt(auth: CodexAuthStart): boolean {
  const url = auth.authUrl ?? auth.verificationUrl;
  if (!url) return false;
  return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
}

function createdSceneIdFromProposal(proposal: Proposal): string | undefined {
  for (const change of proposal.changesJson) {
    if (change.entity !== "scene" || change.action !== "create") continue;
    const data = recordValue(change.data);
    if (typeof data.id === "string" && data.id.trim()) return data.id;
  }
  return undefined;
}
