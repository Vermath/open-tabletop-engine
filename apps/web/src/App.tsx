import type { Actor, AiMemoryFact, AiThread, AiToolCall, AudioTrack, AuditLog, Campaign, ChatMessage, Combat, CombatAction, CombatLegendaryActionPrompt, ContentImportBatch, ContentImportEntityKind, ContentImportSource, DiceRoll, EmailOutboxMessage, Encounter, EncounterMonsterPlacementBatchInput, EncounterMonsterPlacementBatchResult, FogHistoryEntry, FogMode, FogPreset, GridType, Item, JournalCanonStatus, JournalEntry, MapAsset, MessageType, OrganizationMemberRole, OrganizationWorkspace, PermissionName, Proposal, Scene, SceneAnnotation, SceneAnnotationKind, SceneAnnotationLayer, SceneDuplicationPlan, SceneDuplicationRequest, SceneDuplicationResult, SceneTemplateShape, ScimAssignableRole, Token, TokenLayer, User, UserRole, Visibility, VisionPoint, VisionPointSample, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import type { Dnd5eSrdCombatantSyncMutationResult, Dnd5eSrdCombatVitalsKind, Dnd5eSrdCombatVitalsMutationResult, Dnd5eSrdPendingAdvancement, Dnd5eSrdSpellPreparationMutationResult, DndControlledCreatureActionHandoff, DndRulesMutationUndoDescriptor, DndRulesMutationUndoResult } from "@open-tabletop/core";
import type { TokenMoveBatchRequest, TokenMoveBatchResult } from "@open-tabletop/core";
import { probabilityRange, rollFormula } from "@open-tabletop/dice-engine";
import { Activity, BookOpen, Bot, Boxes, Brain, BrickWall, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Copy, Crosshair, Dices, Download, Eraser, Eye, FileText, Flame, Globe2, Grip, Hand, Image as ImageIcon, KeyRound, Layers, Lightbulb, LockKeyhole, Mail, Map as MapIcon, MapPin, Maximize2, MessageSquare, Minimize2, Moon, Music, Paintbrush, PencilLine, Pentagon, Play, Plus, RefreshCw, RotateCcw, Ruler, ScrollText, Search, Send, Shield, Swords, Timer, Trash2, Triangle, Upload, UserCog, UserPlus, Users, UserX, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { activateDeferredSession } from "./api.js";
import { acceptInviteSession, ApiError, apiAnalyzePdfContentImport, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, bootstrapOwnerSession, changePasswordSession, clearSession, confirmPasswordResetSession, confirmTotpMfa, consumeSsoRedirect, createAdminScimGroupRoleMapping, createOrganizationWorkspace, deleteAdminScimGroupRoleMapping, disableTotpMfa, enrollTotpMfa, getSessionToken, getSessionTransportEpoch, getSessionUserId, loadAdminSnapshot, loadBootstrapStatus, loadMfaStatus, loadOidcConfig, loadOrganizationInvites, loadOrganizationMembers, loadSnapshot, loginPasswordSession, loginSession, logoutSession, registerSession, removeOrganizationMember, requestPasswordReset, revokeInvite, setStatelessDemoApiMode, startOidcLogin, storeSession, switchOrganization, transferCampaignOwnership, updateOrganizationMemberRole, updateWorkspaceDefaults, upsertOrganizationMember, verifyDiceRoll, type AdminAssetIntegrityQuarantineResult, type AdminAuthConnectionTestResult, type AdminJob, type AdminJobAlertResult, type AdminPluginReviewInfo, type AdminScimGroupRoleMapping, type AdminScimGroupRoleMappingInput, type AdminSessionInfo, type AdminSnapshot, type AdminStorageBackupResult, type AdminStorageRestoreDrillResult, type AdminStorageRestoreResult, type AdminUserInfo, type AiUsageSummary, type CampaignAssetStorageInfo, type CampaignSessionInfo, type CharacterTemplateInfo, type DiceRollVerification, type EncounterPlanInfo, type InviteCreateInfo, type MfaInfo, type OrganizationMemberInfo, type PluginReviewStatus, type PluginRuntimeInfo, type SessionLoginInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";
import { SessionCredentialCommitQueue } from "./session-credential-commit.js";
import { actorForSelection, adversaryActorsForSceneBoard, isAdversaryActor } from "./actor-rails.js";
import { assetThumbnailUrl } from "./api.js";
import { activeSceneAnnotations } from "./annotation-expiry.js";
import { applyActiveSceneIdentity, applyAuthoritativeScene } from "./active-scene-state.js";
import { applyLocalBoardHistoryAction, createTokenCopies, type BoardHistoryAction, type BoardHistoryDirection, type BoardTokenFrameChange, type BoardTokenPositionChange } from "./board-history.js";
import { blankCanvasDemoCampaignId, blankCanvasDemoNotice, blankCanvasDemoSceneId, blankCanvasDemoUserId, createBlankCanvasDemoAsset, createBlankCanvasDemoSnapshot, seededDemoLoginErrorMessage, seededDemoUnavailableMessage } from "./blank-canvas-demo.js";
import { scenePointFromClient } from "./board-geometry.js";
import { boardKeyboardAction } from "./board-keyboard.js";
import { boundedBoardCapturePixelRatio } from "./board-capture.js";
import { computeTokenMovements, formatGridDistance } from "./board-animation.js";
import { AudioPlaybackLayer, AudioSoundboard, audioTrackNameFromFile } from "./audio-workspace.js";
import { parseChatCommand } from "./chat-command.js";
import { campaignRecordPaletteCommands, filterPaletteCommands, movePaletteIndex, paletteDiceFormula, type PaletteCommand } from "./command-palette.js";
import type { DesktopStatus } from "./desktop-api.js";
import { addDieToFormula, diceTraySides, rollHighlight, rollTermHighlight } from "./dice-insights.js";
import { dice3dStorageKey, diceCastPlan, dieShapeName, dieShapePoints, initialDice3dEnabled, newDiceCastRolls, type DiceCastPlan } from "./dice-3d.js";
import { castPhysicsDiceWhenReady, clearPhysicsDice, diceBoxContainerId, diceBoxStatus, physicsDiceLabelDelayMs, primePhysicsDiceStage } from "./dice-box-stage.js";
import { initialUiTheme, nextUiTheme, uiThemeLabel, uiThemeStorageKey, type UiTheme } from "./ui-theme.js";
import { applyProposalChangesToSnapshot, proposalChangesExternalLore, proposalReviewActionLabel, proposalReviewSteps, setProposalHidden, visibleAiAgentProposals } from "./proposal-review.js";
import { realtimeConnectionIdentity, realtimeReconnectDelayMs, realtimeUiLabel, startRealtimeConnection, type RealtimeUiState } from "./realtime-connection.js";
import { boardCaptureRequestDecision, createRealtimeHandlers, workspaceSelectionMatches, type BoardCaptureRequestDecision, type RealtimeApplyResult, type RealtimeReconcileScope } from "./realtime-refresh.js";
import { removeRealtimeRecord, upsertBoundedRealtimeRecord, upsertNewestPrependedRealtimeRecord, upsertNewestRealtimeRecord, upsertRealtimeRecord } from "./realtime-snapshot-delta.js";
import { applyPresenceEnvelope, realtimeSequenceDecision } from "./realtime-sequence.js";
import { settleWorkspaceLoreLoad } from "./workspace-lore-load.js";
import { settleWorkspaceBoundAction, type WorkspaceBoundRequest, type WorkspaceRequestIdentity } from "./workspace-bound-action.js";
import { templateConePoints } from "./scene-annotations.js";
import { normalizeSceneSizeValue, sceneDimensionsFromCells, sceneSizePresets, type SceneSizePreset } from "./scene-size.js";
import { sceneDeleteConfirmationMatches, sceneQuickCreateIndex, sceneSelectionDestination, sceneTabWrapClass, showTrailingSceneCreate } from "./scene-tabs.js";
import { SceneManagerTabs } from "./scene-manager-tabs.js";
import { placeMissingPartyTokens, ScenePartyPlacementControl } from "./scene-party-placement.js";
import { appendGridCalibrationPoint, GridCalibrationPanel } from "./grid-calibration.js";
import { resetSceneMapCalibration, sceneBackgroundChangePayload, sceneBackgroundChangePlan, sceneMapConfigurationChanged, sceneMapConfigurationMetadata, sceneWithBackgroundChange } from "./scene-background-calibration.js";
import { normalizeSceneGridType, SceneGridFields, sceneGridFormSummary, sceneGridSummary } from "./scene-grid-fields.js";
import { SceneDelegationPanel } from "./scene-delegation-panel.js";
import { ProfilePreferences, resolvedUserPreferences, updateUserProfile } from "./profile-preferences.js";
import { HpBar } from "./hp-bar.js";
import { deleteJournalEntry, JournalPanel, updateJournalEntry, type JournalCreateOptions, type JournalDraft, type JournalLinkTargetOption } from "./journal-panel.js";
import { ChatRail } from "./chat-rail.js";
import { CampaignOwnershipTransfer, type CampaignOwnershipTransferInput } from "./campaign-ownership-transfer.js";
import { campaignSurpriseEnabled, CampaignRulesProfilePanel } from "./campaign-rules-profile.js";
import { CharacterTransferPanel } from "./character-transfer-panel.js";
import { CampaignMembersPanel } from "./campaign-members-panel.js";
import { campaignPeopleCount, reconcileInviteCreation } from "./campaign-people-state.js";
import { OrganizationInviteRoster } from "./organization-invite-roster.js";
import { combatRosterPatch, CombatPanel, nextCombatTurnPosition } from "./combat-panel.js";
import { recordLegendaryActionSpend } from "./legendary-action-client.js";
import { combatTurnAdvanceRetryIsSafe, staleWriteCurrentCombat } from "./combat-conflict.js";
import { combatRewardAttemptForIntent, combatRewardIntentFingerprint, type CombatRewardAttempt } from "./combat-reward-idempotency.js";
import { appendMutationAttemptForIntent, appendMutationFingerprint, type AppendMutationAttempt } from "./append-mutation-idempotency.js";
import type { AdvancementChoicePayload, AdvancementPreviewEnvelope } from "./advancement-flow.js";
import { aiToolCallErrorCode, scimMappingLabel } from "./admin-panel-utils.js";
import { cleanupAdminStoredAssets, migrateAdminStoredAssets, purgeAdminAssetCdnCache, quarantineAdminAssetIntegrityFailures } from "./admin-asset-client.js";
import { failStaleAdminAiThreads, failStaleAdminAiToolCalls, rejectStaleAdminAiProposals, retryAdminAiToolCall as requestRetryAdminAiToolCall } from "./admin-ai-client.js";
import { issueAdminPasswordReset as requestAdminPasswordReset, pruneExpiredPasswordResets as requestPruneExpiredPasswordResets, retryAdminEmail as requestRetryAdminEmail, retryAllAdminEmails as requestRetryAllAdminEmails, revokeAdminRiskSessions as requestRevokeAdminRiskSessions, revokeAdminSession as requestRevokeAdminSession, revokeAdminUserSessions as requestRevokeAdminUserSessions, updateAdminUser } from "./admin-identity-client.js";
import { syncAdminPluginRegistry, syncCampaignPluginRegistry, updateAdminPluginReview } from "./admin-plugin-client.js";
import { MapLayerStack, MapSelectionStatus, MapZoomControls, SceneCanvas, TabButton, Toolbar, annotationColor, annotationGroupKey, annotationToolLabel, annotationToolShowsSettings, battleMapZoomStep, clampBattleMapZoom, defaultAnnotationLayer, distanceBetween, isUsableImageAsset, nextTokenLayer, sceneGridOverlayVisible, tokenCenter, tokenCoordinatesFromCenter, tokenFrame, tokenLayer, tokenLayerLabel, tokenLayers, useAnnotationExpiryClock, type TokenFrame, type TokenMovePersistenceChange, type TokenSelectionOptions } from "./scene-canvas.js";
import { campaignPermissionTemplates, type CampaignPermissionTemplateId } from "./admin-data.js";
import { MetricTile } from "./metric-tile.js";
import { assetMatchesFolderFilter, campaignArchiveTargetId, contentImportEntityData, normalizeAssetFolderPath, summarizeImport, type ArchiveImportCollection, type ArchiveImportOperationSummary, type ArchiveImportRollbackPreview, type ArchiveImportRollbackResult, type ArchiveImportScope, type AssetLifecycleStatus, type CampaignImportResult, type ContentImportDraftEntity, type ContentImportPreviewSource, type FailedAssetUpload } from "./content-import-data.js";
import { ArchiveImportRecovery, recoverDeletedArchiveImportWorkspace } from "./archive-import-recovery.js";
import { downloadCampaignArchiveStream, isArchiveTransferAbort, isCampaignArchiveStreamFile, readCampaignArchiveStreamMetadata, uploadCampaignArchiveStream } from "./archive-stream-client.js";
import { ArchiveTransferProgress, archiveTransferIsBusy, type ArchiveTransferState } from "./archive-transfer-progress.js";
import { archiveExportCollectionOptions, archiveExportMinimumRecordCount, type ArchiveExportCollection, type ArchiveExportScope } from "./archive-export-estimate.js";
import { systemAdvancementOptionId, systemEncounterThreatId, systemRollId } from "./system-actions.js";
import type { CharacterCreateInput, CharacterCreatorRulesPreview, CharacterOriginsInfo } from "./character-creator-dialog.js";
import { CharacterImportDialog, type CharacterImportOutcome } from "./character-import-dialog.js";
import type { CharacterImportPayload } from "./character-import.js";
import { EncounterBuilderDialog, encounterMonsterPlacementDrafts, type EncounterBuilderThreatSelection } from "./encounter-builder.js";
import { CombatSetupDialog } from "./combat-setup-dialog.js";
import type { CombatSetupSubmission } from "./combat-setup.js";
import { canonicalSceneIdForWorldFilter, selectedSceneForWorldFilter, WorldAtlasPanel, worldFilterMatchesScene, type LoreCollectionLoadState, type WorldAtlasFilter, type WorldAtlasWorld } from "./world-atlas-panel.js";
import { HandoutLibraryPanel, type HandoutLibraryItem } from "./handout-library-panel.js";
import { CampaignSearchPanel, campaignSearchAnchorId, campaignSearchDestination, campaignSearchTypeHasRenderedAnchor, type CampaignSearchResult } from "./campaign-search-panel.js";
import { HitDiceRestCard, type ActorRestOptions, type RestPreviewEnvelope } from "./hit-dice-rest-card.js";
import { TypedDamageCard, type TypedDamageApplyResult } from "./typed-damage-card.js";
import { ActorLoadoutPanel, filterActorLoadoutItems, type ActorLoadoutFilter } from "./actor-loadout-panel.js";
import { TacticalMapAids, coverLevelLabel, sceneCoverOverrideBetween } from "./tactical-map-aids.js";
import { CalculationExplanationPanel } from "./calculation-explanation-panel.js";
import { DeferredPanel, LazyActorPanel as ActorPanel, LazyAdminPanel, LazyAdvancementFlow, LazyAiPanel, LazyCampaignMemoryPanel, LazyCampaignWebhooksPanel, LazyCharacterCreatorDialog, LazyCompatibilityPanel, LazyCompendiumPanel, LazyContentImportPanel, LazyControlledCreaturesPanel, LazyDndCharacterReviewPanel, LazyDndCustomContentPanel, LazyDndInventoryCommercePanel, LazySdkPanel } from "./deferred-panels.js";
import { LiveSessionBanner, SessionDeskPanel, sessionReportAllowed } from "./session-desk-panel.js";
import { sessionRecapJournalPayload } from "./session-recap.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { beginSessionSwitch, sessionSwitchIsCurrent } from "./session-switch-guard.js";
import { actorActionDiceFormula, actorActionOptions, actorActionSupportsEffect, actorArmorClass, actorCombatStateLabels, actorConditionLabels, actorHitPoints, actorResourceControls, actorResourceLabels, actorResourceUpdate, actorSaveFormula, adjustedTemplateDamage, appendActorCondition, deathSaveStatusText, formatActorConditions, isPointInsidePoints, isPurchasableCompendiumEntry, itemDisplayLabel, parseActorConditions, quickActorConditionIds, targetConditionLabels, tokenBrightVisionPatch, tokenDimVisionPatch, tokenPermissionPresetLabel, tokenPlayerOwnerIds, type ActorActionOption, type RulesCompendiumEntry, type TokenVisionPatch } from "./actor-sheet-data.js";
import { actorRailSubtitle, clampNumber, contentImportStatusClass, downloadJson, errorMessage, formatAdminList, formatCost, formatCurrency, formatDateTime, formatDuration, formatDurationSeconds, formatFogHistoryEntry, formatGp, formatNumber, formatPercent, formatRollTermDetail, formatRollTermName, formatStorageBytes, formatTime, formatVisionPoint, formatVisionPointSample, jobStatusClass, numericValue, registryHostLabel, prettyOriginId, readinessStatusClass, recordValue, rollTermTotal, safeProbabilityRange, slugId, stringArrayValue, stringValue, titleCaseLabel } from "./sheet-format.js";
import { formatTokenSenses, parseTokenSenses } from "./actor-sheet-data.js";
import { hasItemDropData, hasTokenDropData, readItemDropData, readTokenDropData, setTokenDropPreview, writeTokenDropData, type TokenDropPayload } from "./token-drag.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";
import { isStaleWriteError, sharedMutationIdempotencyKey } from "./shared-mutation.js";
import { KeyedMutationQueue } from "./keyed-mutation-queue.js";
import { clampFloatingPanel, useMovablePanel, type FloatingPanelPosition, type FloatingPanelSize } from "./movable-panel.js";
import { CommandPalette, DiceCastOverlay } from "./tabletop-overlays.js";
import { actorActionConsequenceReview, typedDamageConsequenceReview, type CommittedActorActionResponse, type PreparedActorActionResponse, type PreparedTypedDamageResponse } from "./actor-action-review.js";
import { campaignSetupDraftStorageKey, clearCampaignSetupDraft, defaultCampaignSetupDraft, loadCampaignSetupDraft, saveCampaignSetupDraft, type CampaignSetupDraftInput, type CampaignSetupDraftScope, type CampaignSetupIdempotencyKeys, type CampaignSetupProgress } from "./campaign-setup-state.js";
import { CampaignSetupSteps, FirstSessionSetupChecklist, type FirstSessionSetupStep } from "./campaign-setup-steps.js";
import { closeWorkspaceDialogState, isInspectorTabAllowed, keyboardShortcutRows, mapDockOpenStorageKey, quickCreateOpenStorageKey } from "./workspace-ui-constants.js";
import { absoluteInviteUrl, clearJoinUrl, clearResetUrl, dice3dPreferenceEnvironment, initialInviteToken, initialResetMode, initialResetToken, initialSavedDiceFormulas, initialStoredId, initialStoredPanelFlag, mfaCredential, persistSavedDiceFormulas, persistStoredId, persistStoredPanelFlag } from "./startup-state.js";
import { activityTracesFromEvents, aiAgentToolProgressText, appendAiAgentActivity, appendReasoningDelta, codexAuthPromptFromError, completedReasoningTraces, isAbortError, isProposalNotFoundError, isSessionAuthError, openCodexAuthPrompt, reasoningTracesFromEvents, sceneIdToOpenAfterProposalApply, upsertAiAgentMessage, type AiAgentMessage, type AiAgentProviderEvent, type AiAgentRealtimeEvent, type CodexAuthStart } from "./ai-agent-event-utils.js";
import { aiAgentReadinessPresentation, useAiStudioReadiness, type AiStudioReadiness } from "./ai-readiness.js";
import { useConsequenceReview } from "./consequence-review.js";
import { useAdvancementCatalog } from "./advancement-catalog.js";
import type { Dnd5eSrdWeaponMasteryUse } from "./weapon-mastery-controls.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";
const boardHistoryLimit = 50;
const pingAnnotationTtlSeconds = 5;
const aiAgentAuthRetryIntervalMs = 3_000;
const aiAgentAuthRetryTimeoutMs = 10 * 60_000;
const rollingDiceStatus = "Rolling dice...";
export function hasUnmodeledMixedDamageType(value: string | undefined): boolean {
  return (value ?? "").split(/[\/,]/).map((part) => part.trim()).filter(Boolean).length > 1;
}

function apiOfflineStatus(detail?: unknown): string {
  const message = (typeof detail === "string" ? detail : detail instanceof Error ? detail.message : detail == null ? "" : String(detail)).trim();
  const suffix = message ? `: ${message}` : "";
  return `API offline at ${apiBase || "http://127.0.0.1:4000"}${suffix}. Start it with pnpm --filter @open-tabletop/api dev.`;
}

interface FailedArchiveImport {
  file: File;
  message: string;
  attempt: ArchiveImportAttempt;
}

interface ArchiveImportAttempt {
  idempotencyKey: string;
  mode: ArchiveImportMode;
  scope: ArchiveImportScope;
  collections: ArchiveImportCollection[];
  transport: "json" | "stream";
}
interface SceneViewportSize {
  width: number;
  height: number;
}

type ChatExportFormat = "json" | "ndjson";
type ChatModerationResolution = "open" | "follow_up" | "reviewed";
type ArchiveExportVersion = "0.2.0";
type ArchiveRedactionMode = "portable";
type ArchiveImportMode = "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
type ManageCategoryId = "account" | "campaign" | "people" | "scenes" | "archives" | "serverAdmin";
type WorkspaceMode = "live" | "prep" | "ai" | "manage";
type InspectorTab = "actors" | "compendium" | "sessions" | "worlds" | "handouts" | "journal" | "memory" | "search" | "chat" | "combat" | "content" | "plugins";
type AiAgentApprovalMode = "manual" | "auto";
type AiGenerationJobKind = "map" | "token" | "tokenBatch";
type RulesSaveOutcome = "success" | "failure";
type ActorActionCommitOptions = { targetActorId?: string; applyEffect?: boolean; consumeResources?: boolean; saveOutcomes?: Record<string, RulesSaveOutcome>; effectChoice?: string; weaponMastery?: Dnd5eSrdWeaponMasteryUse; continuationId?: string; reviewActorNames?: Record<string, string> };
interface CombatRewardRequestPayload {
  recipientActorIds: string[];
  totalXp?: number;
  totalGp?: number;
  loot?: string[];
  note?: string;
  expectedUpdatedAt: string;
  expectedActorUpdatedAt: Record<string, string>;
}

interface AiGenerationJob {
  id: string;
  kind: AiGenerationJobKind;
  label: string;
  detail?: string;
}

interface AiAgentThreadResponse {
  thread: AiThread;
  assistantMessage: string;
  events: AiAgentProviderEvent[];
}

interface AiAgentPendingAuthRequest {
  prompt: string;
  requestMessages: AiAgentMessage[];
  selectedAssetId?: string;
}

interface AiAgentCodexAuthPrompt extends CodexAuthStart {
  message: string;
  opened: boolean;
}

const annotationLayers: SceneAnnotationLayer[] = ["measurement", "effects", "drawings", "notes"];

function aiAgentApprovalModeStorageKey(campaignId: string, userId: string | null): string {
  return `otte:aiAgentApprovalMode:${campaignId || "none"}:${userId ?? "anonymous"}`;
}

function initialAiAgentApprovalMode(campaignId: string, userId: string | null): AiAgentApprovalMode {
  try {
    return localStorage.getItem(aiAgentApprovalModeStorageKey(campaignId, userId)) === "auto" ? "auto" : "manual";
  } catch {
    return "manual";
  }
}

function persistAiAgentApprovalMode(campaignId: string, userId: string | null, value: AiAgentApprovalMode): void {
  try {
    localStorage.setItem(aiAgentApprovalModeStorageKey(campaignId, userId), value);
  } catch {
    // Approval mode persistence is a convenience; the UI still has an explicit selector.
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
        return [{ id, role, content, createdAt, proposalIds: stringArrayValue(message.proposalIds), reasoning: stringArrayValue(message.reasoning), activity: stringArrayValue(message.activity) }];
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

function isAiAgentClearCommand(prompt: string): boolean {
  return /^\/clear(?:\s+.*)?$/i.test(prompt.trim());
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

type MeasurementTool = "measure-circle" | "measure-cone";
type AnnotationTool = SceneAnnotationKind | MeasurementTool | null;
type ActiveAnnotationTool = NonNullable<AnnotationTool>;
function compareScenesForDisplay(left: Scene, right: Scene): number {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
}

function assetTagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
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


export function App() {
  const consequenceReview = useConsequenceReview();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    campaigns: [],
    organizations: [],
    organizationMembers: [],
    organizationInvites: [],
    members: [],
    presences: [],
    eventSequence: 0,
    realtimeRecovery: "refetch_snapshot_on_gap",
    scenes: [],
    worldRecords: [],
    worldRelations: [],
    fogPresets: [],
    assets: [],
    tokens: [],
    actors: [],
    calculationOverrides: [],
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
  const [sessionTransportEpoch, setSessionTransportEpoch] = useState(getSessionTransportEpoch());
  function syncSessionTransportState() {
    setSessionToken(getSessionToken());
    setSessionTransportEpoch(getSessionTransportEpoch());
  }
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [campaignId, setCampaignId] = useState(() => initialStoredId("otte:selectedCampaignId", "camp_demo"));
  const [sceneId, setSceneId] = useState(() => initialStoredId("otte:selectedSceneId", "scn_vault_entry"));
  const [selectedTokenId, setSelectedTokenIdState] = useState("tok_valen");
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>(["tok_valen"]);
  const [selectedActorId, setSelectedActorId] = useState("");
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
  const [gridCalibrationOpen, setGridCalibrationOpen] = useState(false);
  const [gridCalibrationPoints, setGridCalibrationPoints] = useState<VisionPoint[]>([]);
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
  const [worlds, setWorlds] = useState<WorldAtlasWorld[]>([]);
  const [handouts, setHandouts] = useState<HandoutLibraryItem[]>([]);
  const [worldsLoadState, setWorldsLoadState] = useState<LoreCollectionLoadState>("idle");
  const [handoutsLoadState, setHandoutsLoadState] = useState<LoreCollectionLoadState>("idle");
  const [worldsLoadError, setWorldsLoadError] = useState("");
  const [handoutsLoadError, setHandoutsLoadError] = useState("");
  const [loreReloadVersion, setLoreReloadVersion] = useState(0);
  const loreRealtimeRefreshPendingRef = useRef(false);
  const [selectedWorldId, setSelectedWorldId] = useState<WorldAtlasFilter>("all");
  const [manageCategory, setManageCategory] = useState<ManageCategoryId>("campaign");
  const [characterTransferRevision, setCharacterTransferRevision] = useState(0);
  const [characterTransferPendingCount, setCharacterTransferPendingCount] = useState(0);
  const [status, setStatus] = useState("Loading campaign");
  const campaignAction = useRetryableAction(`${campaignId}:${currentUserId}`);
  const [realtimeUiState, setRealtimeUiState] = useState<RealtimeUiState>("idle");
  const [diceFormula, setDiceFormula] = useState("1d20+5");
  const [diceVisibility, setDiceVisibility] = useState<DiceRoll["visibility"]>("public");
  const [savedDiceFormulas, setSavedDiceFormulas] = useState<string[]>(initialSavedDiceFormulas);
  const [chatBody, setChatBody] = useState("");
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const seenChatMessageIdsRef = useRef<Set<string> | null>(null);
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
  const aiGenerationLocksRef = useRef<Set<"map" | "token">>(new Set());
  const aiGenerationControllersRef = useRef<Map<string, AbortController>>(new Map());
  const workspaceAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [audioSoundboardOpen, setAudioSoundboardOpen] = useState(false);
  const [mapDockOpen, setMapDockOpen] = useState(() => initialStoredPanelFlag(mapDockOpenStorageKey, false));
  const [tableFocusMode, setTableFocusMode] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(() => initialStoredPanelFlag(quickCreateOpenStorageKey, false));
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState<{ type: "annotation" | "wall" | "light"; id: string } | null>(null);
  const [playerVisionPreviewUserId, setPlayerVisionPreviewUserId] = useState("");
  const playerVisionPreviewUserIdRef = useRef("");
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
  const [aiAgentApprovalMode, setAiAgentApprovalModeState] = useState<AiAgentApprovalMode>(() => initialAiAgentApprovalMode(campaignId, currentUserId));
  const setAiAgentApprovalMode = (value: AiAgentApprovalMode) => {
    setAiAgentApprovalModeState(value);
    persistAiAgentApprovalMode(campaignId, currentUserId, value);
  };
  const [aiAgentHistoryKey, setAiAgentHistoryKey] = useState(() => aiAgentHistoryStorageKey(campaignId, currentUserId));
  const [aiAgentMessages, setAiAgentMessages] = useState<AiAgentMessage[]>(() => initialAiAgentMessages(aiAgentHistoryStorageKey(campaignId, currentUserId)));
  const [aiAgentBusy, setAiAgentBusy] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState("Agent ready");
  const [aiAgentReferenceAssetId, setAiAgentReferenceAssetId] = useState<string | undefined>(undefined);
  const [aiAgentReferenceUploadStatus, setAiAgentReferenceUploadStatus] = useState("");
  const [aiAgentCodexAuth, setAiAgentCodexAuth] = useState<AiAgentCodexAuthPrompt | null>(null);
  const [aiAgentHiddenProposalIds, setAiAgentHiddenProposalIds] = useState<Set<string>>(() => new Set());
  const aiAgentAbortRef = useRef<AbortController | null>(null);
  const inviteAcceptAbortRef = useRef<AbortController | null>(null);
  const inviteAcceptSequenceRef = useRef(0);
  const inviteAcceptBusyRef = useRef(false);
  const tableFocusToggleRef = useRef<HTMLButtonElement | null>(null);
  const tableFocusRestoreRef = useRef<HTMLElement | null>(null);
  const aiAgentToggleRef = useRef<HTMLButtonElement | null>(null);
  const aiAgentPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const inviteLinkRef = useRef<HTMLInputElement | null>(null);
  const focusInviteLinkAfterSetupRef = useRef(false);
  const campaignSetupSubmitRef = useRef<HTMLButtonElement | null>(null);
  const workspaceModeButtonRefs = useRef<Partial<Record<WorkspaceMode, HTMLButtonElement | null>>>({});
  const blankCanvasAssetUrlsRef = useRef<Set<string>>(new Set());
  const aiAgentBusyRef = useRef(false);
  const aiAgentAuthRetryTimerRef = useRef<number | null>(null);
  const aiAgentAuthRetryStartedAtRef = useRef(0);
  const aiAgentPendingAuthRequestRef = useRef<AiAgentPendingAuthRequest | null>(null);
  const aiAgentLiveThreadIdRef = useRef<string | null>(null);
  const aiAgentPendingAssistantIdRef = useRef<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("player");
  const [inviteToken, setInviteToken] = useState("");
  const [inviteAcceptUrl, setInviteAcceptUrl] = useState("");
  const [desktopAvailable] = useState(() => Boolean(window.otteDesktop));
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [desktopShareBusy, setDesktopShareBusy] = useState(false);
  const [joinToken, setJoinToken] = useState(initialInviteToken);
  const [joinFormOpen, setJoinFormOpen] = useState(() => Boolean(initialInviteToken()));
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinMfaCode, setJoinMfaCode] = useState("");
  const [joinMfaRequired, setJoinMfaRequired] = useState(false);
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
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
  const [campaignSearchFocus, setCampaignSearchFocus] = useState<CampaignSearchResult>();
  const [combatSetupOpen, setCombatSetupOpen] = useState(false);
  const [characterImportOpen, setCharacterImportOpen] = useState(false);
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
  const [archiveImportOperations, setArchiveImportOperations] = useState<ArchiveImportOperationSummary[]>([]);
  const [selectedArchiveImportOperationId, setSelectedArchiveImportOperationId] = useState("");
  const [archiveImportRollbackPreview, setArchiveImportRollbackPreview] = useState<ArchiveImportRollbackPreview>();
  const [archiveImportRecoveryBusy, setArchiveImportRecoveryBusy] = useState(false);
  const [archiveExportScope, setArchiveExportScope] = useState<ArchiveExportScope>("campaign");
  const [archiveExportWorldId, setArchiveExportWorldId] = useState("");
  const [archiveExportCollections, setArchiveExportCollections] = useState<ArchiveExportCollection[]>(["actors", "items", "journals", "handouts"]);
  const [archiveExportVersion, setArchiveExportVersion] = useState<ArchiveExportVersion>("0.2.0");
  const [archiveRedactionMode, setArchiveRedactionMode] = useState<ArchiveRedactionMode>("portable");
  const [archiveExportStatus, setArchiveExportStatus] = useState("No archive exported this session");
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [failedArchiveImport, setFailedArchiveImport] = useState<FailedArchiveImport | undefined>();
  const [archiveTransfer, setArchiveTransfer] = useState<ArchiveTransferState>();
  const archiveTransferAbortRef = useRef<AbortController | null>(null);
  const archiveTransferBusy = archiveTransferIsBusy(archiveTransfer);
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
  const [campaignSetupForm, setCampaignSetupForm] = useState<Omit<CampaignSetupDraftInput, "idempotencyKeys" | "progress">>(() => defaultCampaignSetupDraft());
  const { name: newCampaignName, description: newCampaignDescription, systemId: newCampaignSystemId, visibility: newCampaignVisibility, starterContent: setupStarterContent, sceneName: setupSceneName, sceneFolder: setupSceneFolder, sceneWidth: setupSceneWidth, sceneHeight: setupSceneHeight, sceneGridType: setupSceneGridType, sceneGridSize: setupSceneGridSize } = campaignSetupForm;
  const { inviteEnabled: setupInviteEnabled, inviteEmail: setupInviteEmail, inviteRole: setupInviteRole, permissionTemplate: setupPermissionTemplate, onboardingTitle: setupOnboardingTitle, onboardingBody: setupOnboardingBody, route: campaignSetupRoute } = campaignSetupForm;
  const [isCreatingCampaignSetup, setIsCreatingCampaignSetup] = useState(false);
  const [campaignSetupRecoveryPending, setCampaignSetupRecoveryPending] = useState(false);
  const [campaignSetupDraftNotice, setCampaignSetupDraftNotice] = useState("");
  const [loadedCampaignSetupDraftKey, setLoadedCampaignSetupDraftKey] = useState("");
  const [campaignSetupDirty, setCampaignSetupDirty] = useState(false);
  const campaignSetupBusyRef = useRef(false);
  const campaignSetupGenerationRef = useRef(0);
  const campaignSetupAbortRef = useRef<AbortController | null>(null);
  const campaignSetupIdempotencyRef = useRef<CampaignSetupIdempotencyKeys | null>(null);
  const combatRewardAttemptRef = useRef<CombatRewardAttempt<CombatRewardRequestPayload> | null>(null);
  const appendMutationAttemptsRef = useRef(new Map<string, AppendMutationAttempt>());
  const encounterMonsterPlacementAttemptsRef = useRef(new Map<string, { idempotencyKey: string; input: EncounterMonsterPlacementBatchInput }>());
  const campaignSetupProgressRef = useRef<CampaignSetupProgress | null>(null);
  const setupDefaultsAppliedRef = useRef("");
  const [campaignEditName, setCampaignEditName] = useState("");
  const [campaignEditDescription, setCampaignEditDescription] = useState("");
  const [campaignEditSystemId, setCampaignEditSystemId] = useState("dnd-5e-srd");
  const [campaignEditVisibility, setCampaignEditVisibility] = useState<Campaign["visibility"]>("private");
  const [campaignDuplicateName, setCampaignDuplicateName] = useState("");
  const [campaignDuplicateBusy, setCampaignDuplicateBusy] = useState(false);
  const [campaignDuplicateError, setCampaignDuplicateError] = useState("");
  const [campaignDeleteConfirm, setCampaignDeleteConfirm] = useState("");
  const [newSceneName, setNewSceneName] = useState("");
  const [newSceneFolder, setNewSceneFolder] = useState("prep");
  const [newSceneWidth, setNewSceneWidth] = useState(1200);
  const [newSceneHeight, setNewSceneHeight] = useState(800);
  const [newSceneGridType, setNewSceneGridType] = useState<GridType>("square");
  const [newSceneGridSize, setNewSceneGridSize] = useState(50);
  const [newSceneActive, setNewSceneActive] = useState(false);
  const [newSceneBackgroundAssetId, setNewSceneBackgroundAssetId] = useState("");
  const [sceneEditName, setSceneEditName] = useState("");
  const [sceneEditFolder, setSceneEditFolder] = useState("");
  const [sceneEditWidth, setSceneEditWidth] = useState(1200);
  const [sceneEditHeight, setSceneEditHeight] = useState(800);
  const [sceneEditGridType, setSceneEditGridType] = useState<GridType>("square");
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
  const [sceneDuplicationReview, setSceneDuplicationReview] = useState<{ request: SceneDuplicationRequest; plan: SceneDuplicationPlan }>();
  const [sceneDuplicationBusy, setSceneDuplicationBusy] = useState(false);
  const newSceneCellSummary = sceneGridFormSummary(newSceneGridType, newSceneWidth, newSceneHeight, newSceneGridSize);
  const sceneEditCellSummary = sceneGridFormSummary(sceneEditGridType, sceneEditWidth, sceneEditHeight, sceneEditGridSize);
  const [sceneDeleteConfirm, setSceneDeleteConfirm] = useState("");
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenActorId, setNewTokenActorId] = useState("");
  const [newTokenDisposition, setNewTokenDisposition] = useState<Token["disposition"]>("neutral");
  const [newTokenFootprintCells, setNewTokenFootprintCells] = useState(1);
  const [chatReplyToMessageId, setChatReplyToMessageId] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [chatTypeFilter, setChatTypeFilter] = useState<MessageType | "all">("all");
  const [chatVisibilityFilter, setChatVisibilityFilter] = useState<ChatMessage["visibility"] | "all">("all");
  const [controlledCreatureHandoff, setControlledCreatureHandoff] = useState<DndControlledCreatureActionHandoff>();
  const [compendiumEntries, setCompendiumEntries] = useState<RulesCompendiumEntry[]>([]);
  const [compendiumSearch, setCompendiumSearch] = useState("");
  const [compendiumStatus, setCompendiumStatus] = useState("No compendium entry imported this session");
  const [lastDndRulesUndo, setLastDndRulesUndo] = useState<DndRulesMutationUndoDescriptor>();
  const [advancementModalOpen, setAdvancementModalOpen] = useState(false);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [characterOrigins, setCharacterOrigins] = useState<CharacterOriginsInfo | undefined>(undefined);
  const [fogPresetName, setFogPresetName] = useState("");
  const [fogPresetMode, setFogPresetMode] = useState<"replace" | "append">("replace");
  const [visionSampleX, setVisionSampleX] = useState("");
  const [visionSampleY, setVisionSampleY] = useState("");
  const [toolReport, setToolReport] = useState("");
  const [toolReportTitle, setToolReportTitle] = useState("Fog and vision");
  const advancementModalRef = useModalAccessibility<HTMLDivElement>(() => setAdvancementModalOpen(false), { enabled: advancementModalOpen });
  const shortcutModalRef = useModalAccessibility<HTMLDivElement>(() => setShortcutOverlayOpen(false), { enabled: shortcutOverlayOpen });
  const fogToolPanel = useMovablePanel({ x: 88, y: 24 }, { width: 320, height: 240 }, { minWidth: 280, minHeight: 160 });
  const annotationToolPanel = useMovablePanel({ x: 88, y: 24 }, { width: 312, height: 480 }, { minWidth: 280, minHeight: 280 });
  const [canvasAssetDragging, setCanvasAssetDragging] = useState(false);
  const [partyDropTargetActorId, setPartyDropTargetActorId] = useState("");
  const tokenDropHandledRef = useRef(false);
  const blankCanvasDemoIdRef = useRef(0);
  const realtimeSelectionRef = useRef({ campaignId, sceneId, userId: currentUserId });
  const realtimeRefreshRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const realtimeReconcileRef = useRef<(scopes: RealtimeReconcileScope[]) => Promise<unknown>>(() => Promise.resolve());
  const realtimeBoardCaptureHandlerRef = useRef<(data: unknown) => boolean>(() => false);
  const realtimeApplyRef = useRef<(data: unknown) => RealtimeApplyResult>(() => "ignored");
  const realtimeSequenceRef = useRef(snapshot.eventSequence);
  const hpAdjustRef = useRef<Map<string, { current: number; max: number; timer: number; actor: Actor; request: WorkspaceBoundRequest }>>(new Map());
  const actorConditionQueueRef = useRef<Map<string, Promise<Actor | undefined>>>(new Map());
  const actorSheetMutationQueueRef = useRef(new KeyedMutationQueue());
  const actorSheetAuthoritativeRef = useRef<Map<string, Actor>>(new Map());
  const tokenMutationQueueRef = useRef(new KeyedMutationQueue());
  const tokenAuthoritativeRef = useRef<Map<string, Token>>(new Map());
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  realtimeSelectionRef.current = { campaignId, sceneId, userId: currentUserId };
  const realtimeConnectionKey = realtimeConnectionIdentity({ blankCanvasDemoOpen, campaignId, sessionToken, userId: currentUserId, sessionEpoch: sessionTransportEpoch });

  const selectedCampaign = snapshot.campaigns.find((campaign) => campaign.id === campaignId);
  const activeOrganizationId = snapshot.session?.organization?.id ?? snapshot.session?.session?.activeOrganizationId ?? snapshot.organizations[0]?.id ?? "";
  const campaignSetupDraftScope = useMemo(() => activeOrganizationId && currentUserId ? { organizationId: activeOrganizationId, userId: currentUserId, campaignId: campaignId || "new" } satisfies CampaignSetupDraftScope : undefined, [activeOrganizationId, campaignId, currentUserId]);
  const campaignSetupDraftKey = campaignSetupDraftScope ? campaignSetupDraftStorageKey(campaignSetupDraftScope) : "";
  const currentMember = snapshot.members.find((member) => member.user.id === currentUserId);
  const playerVisionPreviewMember = snapshot.members.find((member) => member.user.id === playerVisionPreviewUserId);
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
    .filter((scene) => workspaceMode !== "prep" || worldFilterMatchesScene(scene, selectedWorldId))
    .filter((scene) => sceneFolderFilter === "all" || scene.folder === sceneFolderFilter)
    .filter((scene) => !normalizedSceneSearch || [scene.name, scene.folder ?? "", scene.id].some((value) => value.toLocaleLowerCase().includes(normalizedSceneSearch)));
  const quickCreateSceneIndex = sceneQuickCreateIndex(visibleScenes.length);
  const showTrailingSceneCreateButton = showTrailingSceneCreate(visibleScenes.length);
  const selectedPrepScenes = visibleScenes.filter((scene) => selectedPrepSceneIds.includes(scene.id));
  const selectedScene = workspaceMode === "prep"
    ? selectedSceneForWorldFilter(accessibleScenes, sceneId, selectedWorldId)
    : accessibleScenes.find((scene) => scene.id === sceneId) ?? accessibleScenes.find((scene) => scene.active);
  const canonicalPrepSceneId = workspaceMode === "prep"
    ? canonicalSceneIdForWorldFilter(accessibleScenes, sceneId, selectedWorldId)
    : sceneId;
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
  const selectedAiAgentReferenceAsset = aiAgentReferenceAssetId ? snapshot.assets.find((asset) => asset.id === aiAgentReferenceAssetId && isUsableImageAsset(asset)) : undefined;
  const canDeleteSelectedBoardTokens = hasPermission("token.delete");
  const sessionPulseStatus = realtimeUiLabel(realtimeUiState);
  const onlineParticipantLabel = `${formatNumber(snapshot.presences.length)} online${snapshot.presences.length > 0 ? `: ${snapshot.presences.map((presence) => presence.displayName).join(", ")}` : ""}`;
  const hasUnsavedSceneDraft = workspaceMode === "manage" && manageCategory === "scenes" && sceneEditDirty;
  const activeSystemId = snapshot.systems.find((system) => system.active)?.id ?? selectedCampaign?.defaultSystemId;
  const selectedActor = actorForSelection(snapshot.actors, selectedActorId, selectedToken?.actorId, activeSystemId);
  const advancementCatalog = useAdvancementCatalog({ campaignId, actor: selectedActor, disabled: blankCanvasDemoOpen });
  const { options: advancementOptions, grantsFeat: advancementGrantsFeat, feats: advancementFeats, multiclassOptions, className: advancementClassName, nextClassLevel: advancementNextClassLevel, requiresSubclass: advancementRequiresSubclass, subclassOptions: advancementSubclassOptions, weaponMastery: advancementWeaponMastery, spellAdvancementPaths, pendingAdvancement, xp: xpProgress, loadState: advancementLoadState, loadError: advancementLoadError, setPendingAdvancement } = advancementCatalog;
  const adversaryActors = adversaryActorsForSceneBoard(snapshot.actors, snapshot.tokens, selectedScene?.id);
  const partyActors = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
  const journalLinkTargets = useMemo<JournalLinkTargetOption[]>(() => [
    ...snapshot.actors.map((actor) => ({ type: "actor" as const, id: actor.id, label: actor.name })),
    ...snapshot.scenes.map((scene) => ({ type: "scene" as const, id: scene.id, label: scene.name })),
    ...snapshot.items.map((item) => ({ type: "item" as const, id: item.id, label: item.name })),
    ...snapshot.journals.map((journal) => ({ type: "journal" as const, id: journal.id, label: journal.title })),
    ...handouts.map((handout) => ({ type: "handout" as const, id: handout.id, label: handout.title })),
    ...snapshot.encounters.map((encounter) => ({ type: "encounter" as const, id: encounter.id, label: encounter.name })),
  ], [handouts, snapshot.actors, snapshot.encounters, snapshot.items, snapshot.journals, snapshot.scenes]);
  const activeCombat = snapshot.combats.find((combat) => combat.active);
  const campaignSessions = snapshot.campaignSessions ?? [];
  const liveCampaignSession = campaignSessions.find((session) => session.status === "live");
  const currentTurnCombatant = activeCombat && activeCombat.combatants.length > 0 ? activeCombat.combatants[activeCombat.turnIndex] ?? activeCombat.combatants[0] : undefined;
  const nextTurnCombatant = activeCombat && activeCombat.combatants.length > 1 ? activeCombat.combatants[nextCombatTurnPosition(activeCombat, 1).turnIndex] : undefined;
  const currentTurnTokenIds = currentTurnCombatant?.tokenId ? [currentTurnCombatant.tokenId] : [];
  const nextTurnTokenIds = nextTurnCombatant?.tokenId && nextTurnCombatant.id !== currentTurnCombatant?.id ? [nextTurnCombatant.tokenId] : [];
  const recentEndedCombats = snapshot.combats.filter((combat) => !combat.active).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 3);
  const selectedPermissionTemplate = campaignPermissionTemplates.find((template) => template.id === setupPermissionTemplate) ?? campaignPermissionTemplates[0]!;
  const archiveExportRecordCount = archiveExportMinimumRecordCount({ campaignId, scope: archiveExportScope, worldId: archiveExportWorldId, collections: archiveExportCollections, snapshot, worlds, handouts });
  const archiveCompatibilityNotes = [
    archiveExportScope === "campaign"
      ? "Exports the selected campaign and all related portable tabletop records."
      : archiveExportScope === "world"
        ? "Exports one world with dependency-closed scenes, actors, content, assets, sessions, and audit records."
        : "Exports the campaign identity shell plus the selected record collections and referenced dependency records; dependency warnings are embedded in the archive.",
    "The displayed count is a conservative minimum because the server can include dependencies and history unavailable in the browser snapshot.",
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
  const sceneDeleteTarget = selectedScene;
  const sceneDeleteConfirmed = sceneDeleteConfirmationMatches(sceneDeleteTarget?.name, sceneDeleteConfirm);
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
          { label: "Dimensions", selected: sceneGridSummary(selectedScene), active: sceneGridSummary(activeScene) },
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
              selectedScene.width === activeScene.width && selectedScene.height === activeScene.height && selectedScene.gridType === activeScene.gridType && selectedScene.gridSize === activeScene.gridSize
                ? "Matching dimensions and grid"
                : `${sceneGridSummary(selectedScene)}; active ${sceneGridSummary(activeScene)}`
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
  const latestAreaTemplateHasMixedDamage = hasUnmodeledMixedDamageType(latestAreaTemplate?.templateDamageType);
  const canUpdateSelectedActor = hasPermission("actor.update") || (selectedActor?.ownerUserId === currentUserId && hasPermission("actor.updateOwned"));
  const activeOrganization = snapshot.organizations.find((organization) => organization.id === activeOrganizationId);
  const canManageActiveOrganization = activeOrganization?.role === "owner" || activeOrganization?.role === "admin";
  const canManageCampaignSettings = hasPermission("campaign.update") || hasPermission("campaign.delete") || canManageActiveOrganization;
  const canManagePeople = hasPermission("campaign.update") || canManageActiveOrganization;
  const canManageScenes = hasPermission("scene.create") || hasPermission("scene.update") || hasPermission("scene.delete") || hasPermission("scene.activate");
  const canManageArchives = hasPermission("campaign.update");
  const canUsePrepWorkspace = canManageScenes || hasPermission("world.create") || hasPermission("world.update") || hasPermission("handout.create") || hasPermission("handout.update") || hasPermission("journal.create") || hasPermission("journal.update") || hasPermission("plugin.install") || hasPermission("plugin.configure") || hasPermission("actor.create");
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
    setCombatSetupOpen(false);
    setGridCalibrationOpen(false);
    setGridCalibrationPoints([]);
  }, [selectedScene?.id]);

  useEffect(() => {
    if (activeCombat) setCombatSetupOpen(false);
  }, [activeCombat?.id]);

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
  const sessionSwitchSeqRef = useRef(0);
  const sessionSwitchAbortRef = useRef<AbortController | undefined>(undefined);
  const sessionCredentialCommitQueueRef = useRef(new SessionCredentialCommitQueue());

  function blockUnsavedSceneDraft(action: string): boolean {
    if (!hasUnsavedSceneDraft) return false;
    setStatus(`Save or discard scene changes before ${action}`);
    return true;
  }

  function blockCampaignSetupNavigation(action: string): boolean {
    const recoveryCampaign = campaignSetupProgressRef.current?.campaign.name;
    if (!campaignSetupBusyRef.current && !recoveryCampaign) return false;
    setStatus(campaignSetupBusyRef.current ? `Finish or cancel campaign setup before ${action}` : `Retry or keep ${recoveryCampaign} as-is before ${action}`);
    return true;
  }

  function resetCampaignSetupDraft() {
    setCampaignSetupForm(defaultCampaignSetupDraft());
    setCampaignSetupDraftNotice("");
    setCampaignSetupDirty(false);
    setupDefaultsAppliedRef.current = "";
  }

  function currentCampaignSetupDraftScope(): CampaignSetupDraftScope | undefined {
    return campaignSetupDraftScope;
  }

  function currentCampaignSetupDraft(progress = campaignSetupProgressRef.current, idempotencyKeys = campaignSetupIdempotencyRef.current): CampaignSetupDraftInput {
    return {
      ...campaignSetupForm,
      ...(idempotencyKeys ? { idempotencyKeys } : {}),
      ...(progress ? { progress: { campaignId: progress.campaign.id, ...(progress.draftScopeCampaignId ? { sourceCampaignId: progress.draftScopeCampaignId } : {}), ...(progress.scene ? { sceneId: progress.scene.id } : {}), onboardingCreated: progress.onboardingCreated, ...(progress.inviteEmail !== undefined ? { inviteEmail: progress.inviteEmail } : {}), ...(progress.inviteRole ? { inviteRole: progress.inviteRole } : {}), ...(progress.inviteRequestStarted ? { inviteRequestStarted: true } : {}), ...(progress.inviteCreatedWithoutLink ? { inviteCreatedWithoutLink: true } : {}) } } : {})
    };
  }

  function persistCampaignSetupDraft(progress = campaignSetupProgressRef.current) {
    const scope = currentCampaignSetupDraftScope();
    if (scope) saveCampaignSetupDraft(window.localStorage, scope, currentCampaignSetupDraft(progress));
  }

  function clearCampaignSetupDraftScopes(progress = campaignSetupProgressRef.current) {
    const scope = currentCampaignSetupDraftScope();
    if (!scope) return;
    for (const scopedCampaignId of new Set([scope.campaignId, progress?.draftScopeCampaignId, progress?.campaign.id].filter((value): value is string => Boolean(value)))) clearCampaignSetupDraft(window.localStorage, { ...scope, campaignId: scopedCampaignId });
  }

  function updateCampaignSetupDraft(patch: Partial<CampaignSetupDraftInput>) {
    const { idempotencyKeys: _idempotencyKeys, progress: _progress, ...safePatch } = patch;
    setCampaignSetupForm((current) => ({ ...current, ...safePatch }));
    setCampaignSetupDirty(true);
  }

  function discardCampaignSetupDraft() {
    clearCampaignSetupDraftScopes();
    invalidateCampaignSetupProgress();
    resetCampaignSetupDraft();
    setCampaignSetupDirty(false);
    setStatus("Campaign setup draft cleared");
  }

  function invalidateCampaignSetupProgress() {
    campaignSetupAbortRef.current?.abort();
    campaignSetupAbortRef.current = null;
    campaignSetupGenerationRef.current += 1;
    campaignSetupProgressRef.current = null;
    campaignSetupIdempotencyRef.current = null;
    campaignSetupBusyRef.current = false;
    setIsCreatingCampaignSetup(false);
    setCampaignSetupRecoveryPending(false);
  }

  function cancelCampaignSetup() {
    const progress = campaignSetupProgressRef.current;
    campaignSetupAbortRef.current?.abort();
    campaignSetupAbortRef.current = null;
    refreshSeqRef.current += 1;
    campaignSetupGenerationRef.current += 1;
    campaignSetupBusyRef.current = false;
    setIsCreatingCampaignSetup(false);
    if (progress) {
      campaignSetupProgressRef.current = progress;
      persistCampaignSetupDraft(progress);
      setCampaignSetupRecoveryPending(true);
      setStatus(`${progress.campaign.name} was kept; retry to finish its remaining setup`);
      window.requestAnimationFrame(() => campaignSetupSubmitRef.current?.focus());
      return;
    }
    campaignSetupProgressRef.current = null;
    setCampaignSetupRecoveryPending(false);
    setStatus("Campaign setup canceled before confirmation; check the campaign list before trying again");
    window.requestAnimationFrame(() => campaignSetupSubmitRef.current?.focus());
  }

  async function keepCampaignSetupAsIs() {
    const progress = campaignSetupProgressRef.current;
    if (!progress) return;
    clearCampaignSetupDraftScopes(progress);
    const setupInvite = progress.invite;
    const hasSetupInvite = Boolean(setupInvite || progress.inviteCreatedWithoutLink);
    const targetSceneId = progress.scene?.id ?? "";
    invalidateCampaignSetupProgress();
    resetCampaignSetupDraft();
    selectWorkspaceContext(progress.campaign.id, targetSceneId, currentUserId);
    if (setupInvite) {
      focusInviteLinkAfterSetupRef.current = true;
      setInviteToken(setupInvite.token);
      setInviteAcceptUrl(absoluteInviteUrl(setupInvite.acceptUrl));
      setInviteEmail(progress.inviteEmail ?? "");
      setInviteRole(progress.inviteRole ?? "player");
    }
    if (hasSetupInvite) {
      setManageCategory("people");
    } else {
      setManageCategory("campaign");
    }
    setWorkspaceMode("manage");
    await refresh(progress.campaign.id, targetSceneId, { syncStatus: false });
    setStatus(progress.inviteCreatedWithoutLink ? `${progress.campaign.name} kept; revoke the existing invite and create a new one to get a fresh link` : `${progress.campaign.name} kept as-is`);
    if (!setupInvite) window.requestAnimationFrame(() => workspaceModeButtonRefs.current.manage?.focus());
  }

  function resetWorkspaceNavigation(mode: WorkspaceMode = "live", nextTab: InspectorTab = "actors") {
    setWorkspaceMode(mode);
    setTab(nextTab);
    setManageCategory("campaign");
    setTableFocusMode(false);
    setCommandPaletteOpen(false);
  }

  function openFirstSessionSetupStep(step: FirstSessionSetupStep["id"]) {
    if (step === "invitation") { setManageCategory("people"); setWorkspaceMode("manage"); return; }
    if (step === "scene") { setManageCategory("scenes"); setWorkspaceMode("manage"); return; }
    if (step === "encounter") { resetWorkspaceNavigation("prep", "content"); setEncounterBuilderOpen(true); return; }
    if (step === "character" && hasPermission("actor.create")) setCharacterCreatorOpen(true);
    resetWorkspaceNavigation(step === "play" ? "live" : "prep", "actors");
  }

  function revokeBlankCanvasAssetUrls() {
    for (const url of blankCanvasAssetUrlsRef.current) URL.revokeObjectURL(url);
    blankCanvasAssetUrlsRef.current.clear();
  }

  function openAiAgent() {
    setAiAgentOpen(true);
  }

  function closeAiAgent() {
    setAiAgentOpen(false);
    window.requestAnimationFrame(() => aiAgentToggleRef.current?.focus());
  }

  function invalidatePendingSessionSwitch() {
    sessionSwitchSeqRef.current += 1;
    sessionSwitchAbortRef.current?.abort();
    sessionSwitchAbortRef.current = undefined;
    sessionCredentialCommitQueueRef.current.invalidate();
  }

  async function discardStaleCredentialActivation() {
    try {
      await logoutSession();
    } catch {
      clearSession();
    }
    syncSessionTransportState();
  }

  async function commitDeferredCredential(login: SessionLoginInfo, ticket: number, eligible: () => boolean, commit: () => void): Promise<boolean> {
    const result = await sessionCredentialCommitQueueRef.current.run(ticket, async (credentialIsCurrent) => {
      if (!credentialIsCurrent() || !eligible()) return false;
      await activateDeferredSession(login, { persist: false });
      if (!credentialIsCurrent() || !eligible()) {
        await discardStaleCredentialActivation();
        return false;
      }
      storeSession(login);
      syncSessionTransportState();
      commit();
      return true;
    });
    return result === true;
  }

  function clearAccountSecurityState() {
    setPasswordCurrent("");
    setPasswordNext("");
    setMfaInfo(undefined);
    setMfaPassword("");
    setMfaCode("");
    setMfaSecret("");
    setMfaRecoveryCodes([]);
    setAccountStatus("Account ready");
  }

  function cancelAiAgentForWorkspaceChange() {
    aiAgentPendingAuthRequestRef.current = null;
    if (aiAgentAuthRetryTimerRef.current !== null) window.clearTimeout(aiAgentAuthRetryTimerRef.current);
    aiAgentAuthRetryTimerRef.current = null;
    aiAgentAuthRetryStartedAtRef.current = 0;
    aiAgentLiveThreadIdRef.current = null;
    aiAgentPendingAssistantIdRef.current = null;
    const abortController = aiAgentAbortRef.current;
    aiAgentAbortRef.current = null;
    aiAgentBusyRef.current = false;
    abortController?.abort();
    setAiAgentBusy(false);
    setAiAgentCodexAuth(null);
    setAiAgentStatus("Agent ready");
  }

  function cancelInviteAcceptance() {
    inviteAcceptSequenceRef.current += 1;
    inviteAcceptAbortRef.current?.abort();
    inviteAcceptAbortRef.current = null;
    inviteAcceptBusyRef.current = false;
    setIsAcceptingInvite(false);
  }

  function cancelWorkspaceBoundRequestsForChange() {
    for (const controller of workspaceAbortControllersRef.current) controller.abort();
    workspaceAbortControllersRef.current.clear();
    for (const pending of hpAdjustRef.current.values()) window.clearTimeout(pending.timer);
    hpAdjustRef.current.clear();
    actorConditionQueueRef.current.clear();
    actorSheetMutationQueueRef.current.clear();
    actorSheetAuthoritativeRef.current.clear();
    tokenMutationQueueRef.current.clear();
    tokenAuthoritativeRef.current.clear();
    boardSyncQueueRef.current = Promise.resolve();
    setBoardUndoStack([]);
    setBoardRedoStack([]);
    setBoardClipboardTokens([]);
    aiGenerationControllersRef.current.clear();
    aiGenerationLocksRef.current.clear();
    setAiGenerationJobs([]);
    setAiAgentReferenceAssetId(undefined);
    setAiAgentReferenceUploadStatus("");
    setAdminSnapshot(undefined);
    setAdminStatus("Admin idle");
    setFailedAssetUpload(undefined);
    setAssetStatus("No asset action this session");
  }

  function closeWorkspaceDialogs() { closeWorkspaceDialogState(() => setControlledCreatureHandoff(undefined), setCharacterCreatorOpen, setCharacterImportOpen, setAdvancementModalOpen, setEncounterBuilderOpen, setCombatSetupOpen, setCommandPaletteOpen, setShortcutOverlayOpen, setAudioSoundboardOpen); }

  function clearLoreWorkspaceState() {
    loreRealtimeRefreshPendingRef.current = false;
    setWorlds([]);
    setHandouts([]);
    setWorldsLoadState("idle");
    setHandoutsLoadState("idle");
    setWorldsLoadError("");
    setHandoutsLoadError("");
    setSelectedWorldId("all");
  }

  function selectWorkspaceContext(nextCampaignId: string, nextSceneId = "", nextUserId = currentUserId, options: { preserveCampaignSetup?: boolean } = {}) {
    const current = realtimeSelectionRef.current;
    const identityChanged = current.campaignId !== nextCampaignId || current.userId !== nextUserId;
    if (identityChanged) {
      setLastDndRulesUndo(undefined);
      setPendingAdvancement(undefined);
      playerVisionPreviewUserIdRef.current = "";
      setPlayerVisionPreviewUserId("");
      cancelInviteAcceptance();
      refreshSeqRef.current += 1;
      invalidatePendingSessionSwitch();
      cancelAiAgentForWorkspaceChange();
      cancelWorkspaceBoundRequestsForChange();
      closeWorkspaceDialogs();
      clearLoreWorkspaceState();
      clearAccountSecurityState();
      if (!options.preserveCampaignSetup) {
        const hadCampaignSetupProgress = Boolean(campaignSetupProgressRef.current);
        invalidateCampaignSetupProgress();
        if (hadCampaignSetupProgress) resetCampaignSetupDraft();
      }
      setInviteToken("");
      setInviteAcceptUrl("");
    }
    realtimeSelectionRef.current = { campaignId: nextCampaignId, sceneId: nextSceneId, userId: nextUserId };
    setCampaignId(nextCampaignId);
    setSceneId(nextSceneId);
    if (nextUserId !== currentUserId) setCurrentUserId(nextUserId);
  }

  function workspaceRequestIsCurrent(requestCampaignId: string, requestUserId: string): boolean {
    return workspaceSelectionMatches(
      { campaignId: requestCampaignId, userId: requestUserId },
      { campaignId: realtimeSelectionRef.current.campaignId, userId: realtimeSelectionRef.current.userId }
    );
  }

  function currentWorkspaceRequestIdentity(): WorkspaceRequestIdentity {
    return {
      campaignId: realtimeSelectionRef.current.campaignId,
      userId: realtimeSelectionRef.current.userId
    };
  }

  function workspaceIdentityIsCurrent(request: WorkspaceRequestIdentity): boolean {
    return workspaceRequestIsCurrent(request.campaignId, request.userId);
  }

  function beginWorkspaceBoundRequest(): WorkspaceBoundRequest {
    const controller = new AbortController();
    workspaceAbortControllersRef.current.add(controller);
    return {
      campaignId: realtimeSelectionRef.current.campaignId,
      userId: realtimeSelectionRef.current.userId,
      campaignUpdatedAt: snapshotRef.current.campaigns.find((candidate) => candidate.id === realtimeSelectionRef.current.campaignId)?.updatedAt ?? "",
      controller
    };
  }

  function beginAppendMutation(scope: string, intent: unknown): AppendMutationAttempt {
    const attempt = appendMutationAttemptForIntent(appendMutationAttemptsRef.current.get(scope), scope, appendMutationFingerprint(intent), () => window.crypto.randomUUID());
    appendMutationAttemptsRef.current.set(scope, attempt);
    return attempt;
  }

  function completeAppendMutation(scope: string, attempt: AppendMutationAttempt) {
    if (appendMutationAttemptsRef.current.get(scope)?.idempotencyKey === attempt.idempotencyKey) appendMutationAttemptsRef.current.delete(scope);
  }

  function workspaceBoundRequestIsCurrent(request: WorkspaceBoundRequest): boolean {
    return !request.controller.signal.aborted && workspaceRequestIsCurrent(request.campaignId, request.userId);
  }

  function finishWorkspaceBoundRequest(request: WorkspaceBoundRequest) {
    workspaceAbortControllersRef.current.delete(request.controller);
  }

  function cancelWorkspaceBoundRequest(request: WorkspaceBoundRequest) {
    request.controller.abort();
    finishWorkspaceBoundRequest(request);
  }

  async function runWorkspaceBoundAction<T>(task: (request: WorkspaceBoundRequest) => Promise<T>, onCurrentResult: (result: T, request: WorkspaceBoundRequest) => void | Promise<void>) {
    const request = beginWorkspaceBoundRequest();
    try {
      await settleWorkspaceBoundAction(request, workspaceBoundRequestIsCurrent, task, onCurrentResult, finishWorkspaceBoundRequest);
    } catch (error) {
      if (!isStaleWriteError(error) || !workspaceRequestIsCurrent(request.campaignId, request.userId)) throw error;
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
      throw new Error("This record changed elsewhere. The latest revision is loaded; your draft is preserved. Review and retry.");
    }
  }

  async function runSharedMutation<T>(task: () => Promise<T>, targetCampaignId = realtimeSelectionRef.current.campaignId, targetSceneId = realtimeSelectionRef.current.sceneId): Promise<T> {
    try {
      return await task();
    } catch (error) {
      if (!isStaleWriteError(error) || !workspaceRequestIsCurrent(targetCampaignId, realtimeSelectionRef.current.userId)) throw error;
      await refresh(targetCampaignId, targetSceneId, { syncStatus: false });
      throw new Error("This record changed elsewhere. The latest revision is loaded; your draft is preserved. Review and retry.");
    }
  }

  async function refresh(nextCampaignId = campaignId, nextSceneId = sceneId, options: { syncStatus?: boolean } = {}) {
    if (blankCanvasDemoOpen) {
      setSnapshotReady(true);
      if (options.syncStatus !== false) setStatus(blankCanvasDemoNotice);
      return snapshot;
    }
    // Snapshot loads can overlap with reconnects, explicit refreshes, and
    // fallback reconciliation. Only the most recently started refresh may apply; anything older would
    // overwrite the UI with pre-action state and make actions "revert".
    const requestUserId = getSessionUserId();
    if (!workspaceRequestIsCurrent(nextCampaignId, requestUserId)) return snapshotRef.current;
    const seq = ++refreshSeqRef.current;
    let next: Snapshot;
    try {
      next = await loadSnapshot(nextCampaignId, nextSceneId);
      const previewUserId = playerVisionPreviewUserIdRef.current;
      const previewScene = next.scenes.find((item) => item.id === nextSceneId) ?? next.scenes.find((item) => item.active) ?? next.scenes[0];
      if (previewUserId && previewScene && next.members.some((member) => member.user.id === previewUserId && member.role === "player" && member.active !== false)) {
        try {
          next = {
            ...next,
            vision: await apiGet<VisionSnapshot>(`/api/v1/scenes/${previewScene.id}/vision?previewUserId=${encodeURIComponent(previewUserId)}`)
          };
        } catch {
          playerVisionPreviewUserIdRef.current = "";
          setPlayerVisionPreviewUserId("");
        }
      } else if (previewUserId) {
        playerVisionPreviewUserIdRef.current = "";
        setPlayerVisionPreviewUserId("");
      }
    } catch (error) {
      if (seq !== refreshSeqRef.current || !workspaceRequestIsCurrent(nextCampaignId, requestUserId)) return snapshotRef.current;
      throw error;
    }
    if (seq !== refreshSeqRef.current || !workspaceRequestIsCurrent(nextCampaignId, requestUserId)) return next;
    realtimeSequenceRef.current = next.eventSequence;
    snapshotRef.current = next;
    setSnapshot(next);
    syncSessionTransportState();
    const campaign = next.campaigns.find((item) => item.id === nextCampaignId) ?? next.campaigns[0];
    const scene = next.scenes.find((item) => item.id === nextSceneId) ?? next.scenes.find((item) => item.active) ?? next.scenes[0];
    const resolvedCampaignId = next.campaigns.some((item) => item.id === realtimeSelectionRef.current.campaignId) ? realtimeSelectionRef.current.campaignId : campaign?.id ?? "";
    const resolvedSceneId = next.scenes.some((item) => item.id === realtimeSelectionRef.current.sceneId) ? realtimeSelectionRef.current.sceneId : scene?.id ?? "";
    if (resolvedCampaignId !== realtimeSelectionRef.current.campaignId) {
      cancelAiAgentForWorkspaceChange();
      cancelWorkspaceBoundRequestsForChange();
      closeWorkspaceDialogs();
      clearLoreWorkspaceState();
    }
    realtimeSelectionRef.current = { campaignId: resolvedCampaignId, sceneId: resolvedSceneId, userId: requestUserId };
    setCampaignId(resolvedCampaignId);
    setSceneId(resolvedSceneId);
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
  // in-flight load; the authoritative mutation response is already applied
  // locally and its realtime event can request any narrower reconciliation.
  function invalidateInFlightRefreshes() {
    refreshSeqRef.current += 1;
  }

  // Apply a mutation's authoritative response to the snapshot immediately so
  // board actions feel instant. The realtime socket still fires a debounced
  // background refresh for full reconciliation (vision polygons, etc.), so we
  // never block the interaction on the ~28-request snapshot refetch.
  function applySceneToSnapshot(scene: Scene) {
    if (scene.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      scenes: applyAuthoritativeScene(current.scenes, scene)
    }));
  }

  function applyEncounterToSnapshot(encounter: Encounter) {
    if (encounter.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      encounters: current.encounters.some((item) => item.id === encounter.id)
        ? current.encounters.map((item) => (item.id === encounter.id ? encounter : item))
        : [...current.encounters, encounter]
    }));
  }

  function applyTokensToSnapshot(nextTokens: Token[]) {
    const activeSceneIds = new Set(snapshotRef.current.scenes.filter((scene) => scene.campaignId === realtimeSelectionRef.current.campaignId).map((scene) => scene.id));
    const scopedTokens = nextTokens.filter((token) => activeSceneIds.has(token.sceneId));
    if (scopedTokens.length === 0) return;
    for (const token of scopedTokens) tokenAuthoritativeRef.current.set(token.id, token);
    invalidateInFlightRefreshes();
    const byId = new Map(scopedTokens.map((token) => [token.id, token]));
    setSnapshot((current) => ({
      ...current,
      tokens: [
        ...current.tokens.map((token) => byId.get(token.id) ?? token),
        ...scopedTokens.filter((token) => !current.tokens.some((item) => item.id === token.id))
      ]
    }));
  }

  function latestAuthoritativeToken(tokenId: string, fallback?: Token): Token | undefined {
    const snapshotToken = snapshotRef.current.tokens.find((candidate) => candidate.id === tokenId);
    const queuedToken = tokenAuthoritativeRef.current.get(tokenId);
    if (!queuedToken) return snapshotToken ?? fallback;
    if (!snapshotToken || queuedToken.updatedAt >= snapshotToken.updatedAt) return queuedToken;
    return snapshotToken;
  }

  function applyCombatToSnapshot(combat: Combat) {
    if (combat.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({ ...current, combats: upsertNewestRealtimeRecord(current.combats, combat) }));
  }

  function removeEncounterFromSnapshot(encounter: Encounter) {
    if (encounter.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      encounters: current.encounters.filter((item) => item.id !== encounter.id)
    }));
  }

  function applyItemToSnapshot(item: Item) {
    if (item.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      items: upsertNewestRealtimeRecord(current.items, item)
    }));
  }

  function requireInteractiveSignIn(message: string) {
    invalidateCampaignSetupProgress();
    resetCampaignSetupDraft();
    invalidatePendingSessionSwitch();
    cancelWorkspaceBoundRequestsForChange();
    clearAccountSecurityState();
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
    await runWorkspaceBoundAction(
      (request) => loadAdminSnapshot({ signal: request.controller.signal }),
      (next) => {
        setAdminSnapshot(next);
        setAdminStatus("Admin operations synced");
      }
    );
  }

  async function runWorkspaceAdminAction<T>(task: (request: WorkspaceBoundRequest) => Promise<T>, successMessage: (result: T) => string, options: { refreshWorkspace?: boolean } = {}) {
    await runWorkspaceBoundAction(
      async (request) => {
        const result = await task(request);
        const admin = await loadAdminSnapshot({ signal: request.controller.signal });
        return { result, admin };
      },
      async ({ result, admin }, request) => {
        setAdminSnapshot(admin);
        setAdminStatus(successMessage(result));
        if (options.refreshWorkspace) await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
      }
    );
  }

  async function updateOrganizationWorkspaceDefaults(input: Partial<OrganizationWorkspace>) {
    setAdminStatus("Saving workspace defaults");
    await runWorkspaceBoundAction(
      (request) => {
        const workspace = snapshotRef.current.workspaceDefaults;
        if (!workspace) throw new Error("Reload the workspace before changing its defaults.");
        const payload = { ...input, expectedUpdatedAt: workspace.updatedAt };
        return updateWorkspaceDefaults(payload, {
          signal: request.controller.signal,
          idempotencyKey: sharedMutationIdempotencyKey(`organization:update:${workspace.id}`, workspace.updatedAt, payload)
        });
      },
      (next) => {
        setSnapshot((current) => ({ ...current, workspaceDefaults: next, session: current.session ? { ...current.session, organization: next } : current.session }));
        setAdminStatus("Workspace defaults saved");
      }
    );
  }

  async function addOrganizationMember(input: { email: string; role: Exclude<OrganizationMemberRole, "owner"> }) {
    setAdminStatus("Adding organization member");
    await runWorkspaceBoundAction(
      async (request) => {
        const workspace = snapshotRef.current.workspaceDefaults;
        if (!workspace) throw new Error("Reload the workspace before adding a member.");
        const payload = { ...input, expectedOrganizationUpdatedAt: workspace.updatedAt };
        const scope = `organization-member:create:${workspace.id}`;
        const attempt = beginAppendMutation(scope, payload);
        const member = await upsertOrganizationMember(payload, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey });
        completeAppendMutation(scope, attempt);
        const [members, updatedWorkspace] = await Promise.all([
          loadOrganizationMembers({ signal: request.controller.signal }),
          apiGet<OrganizationWorkspace>("/api/v1/organization/workspace-defaults", { signal: request.controller.signal })
        ]);
        return { member, members, updatedWorkspace };
      },
      ({ member, members, updatedWorkspace }) => {
        setSnapshot((current) => ({
          ...current,
          organizationMembers: members,
          workspaceDefaults: updatedWorkspace,
          session: current.session ? { ...current.session, organization: updatedWorkspace } : current.session
        }));
        setAdminStatus(`Organization member ${member.user.displayName} is ${member.role}`);
      }
    );
  }

  async function updateOrganizationMember(member: OrganizationMemberInfo, role: Exclude<OrganizationMemberRole, "owner">) {
    setAdminStatus("Updating organization member");
    await runWorkspaceBoundAction(
      async (request) => {
        const latest = snapshotRef.current.organizationMembers.find((candidate) => candidate.id === member.id) ?? member;
        const payload = { role, expectedUpdatedAt: latest.updatedAt };
        const updated = await updateOrganizationMemberRole(member.id, role, latest.updatedAt, {
          signal: request.controller.signal,
          idempotencyKey: sharedMutationIdempotencyKey(`organization-member:update:${member.id}`, latest.updatedAt, payload)
        });
        const members = await loadOrganizationMembers({ signal: request.controller.signal });
        return { updated, members };
      },
      ({ updated, members }) => {
        setSnapshot((current) => ({ ...current, organizationMembers: members }));
        setAdminStatus(`Organization member ${updated.user.displayName} is ${updated.role}`);
      }
    );
  }

  async function deleteOrganizationMember(member: OrganizationMemberInfo) {
    setAdminStatus("Removing organization member");
    await runWorkspaceBoundAction(
      async (request) => {
        const latest = snapshotRef.current.organizationMembers.find((candidate) => candidate.id === member.id) ?? member;
        const result = await removeOrganizationMember(member.id, latest.updatedAt, {
          signal: request.controller.signal,
          idempotencyKey: sharedMutationIdempotencyKey(`organization-member:delete:${member.id}`, latest.updatedAt, {})
        });
        const members = await loadOrganizationMembers({ signal: request.controller.signal });
        return { result, members };
      },
      ({ result, members }) => {
        setSnapshot((current) => ({ ...current, organizationMembers: members }));
        setAdminStatus(`Organization member ${member.user.displayName} removed; ${result.removedCampaignMemberships} campaign memberships removed`);
      }
    );
  }

  realtimeRefreshRef.current = async () => {
    const selection = realtimeSelectionRef.current;
    const next = await refresh(selection.campaignId, selection.sceneId, { syncStatus: false });
    if (loreRealtimeRefreshPendingRef.current) {
      loreRealtimeRefreshPendingRef.current = false;
      setLoreReloadVersion((version) => version + 1);
    }
    return next;
  };
  realtimeReconcileRef.current = async (scopes) => {
    if (scopes.includes("snapshot")) return realtimeRefreshRef.current();
    const selection = { ...realtimeSelectionRef.current };
    const selectedScene = snapshotRef.current.scenes.find((scene) => scene.id === selection.sceneId);
    const previewUserId = playerVisionPreviewUserIdRef.current;
    const visionPath = selectedScene
      ? `/api/v1/scenes/${selectedScene.id}/vision${previewUserId ? `?previewUserId=${encodeURIComponent(previewUserId)}` : ""}`
      : undefined;
    const [vision, lore] = await Promise.all([
      scopes.includes("vision") && visionPath ? apiGet<VisionSnapshot>(visionPath) : Promise.resolve(undefined),
      scopes.includes("lore")
        ? Promise.all([
            apiGet<WorldAtlasWorld[]>(`/api/v1/campaigns/${selection.campaignId}/worlds`),
            apiGet<HandoutLibraryItem[]>(`/api/v1/campaigns/${selection.campaignId}/handouts`),
            apiGet<Snapshot["worldRecords"]>(`/api/v1/campaigns/${selection.campaignId}/world-records`),
            apiGet<Snapshot["worldRelations"]>(`/api/v1/campaigns/${selection.campaignId}/world-relations`)
          ])
        : Promise.resolve(undefined)
    ]);
    if (!workspaceRequestIsCurrent(selection.campaignId, selection.userId) || realtimeSelectionRef.current.sceneId !== selection.sceneId) return undefined;
    if (vision) setSnapshot((current) => ({ ...current, vision }));
    if (lore) {
      const [nextWorlds, nextHandouts, worldRecords, worldRelations] = lore;
      loreRealtimeRefreshPendingRef.current = false;
      setWorlds([...nextWorlds].sort((left, right) => left.name.localeCompare(right.name)));
      setHandouts(nextHandouts);
      setWorldsLoadState("ready");
      setHandoutsLoadState("ready");
      setSnapshot((current) => ({ ...current, worldRecords, worldRelations }));
    }
    return undefined;
  };
  realtimeBoardCaptureHandlerRef.current = handleBoardCaptureRealtimeEvent;
  const applyAiAgentRealtimeEvent = (event: AiAgentRealtimeEvent) => {
    if (!aiAgentBusyRef.current || event.actorUserId !== currentUserId) return false;
    if (event.type !== "ai.message.delta" && event.type !== "ai.message.completed" && event.type !== "ai.reasoning.delta" && event.type !== "ai.reasoning.completed" && event.type !== "ai.activity.reported" && event.type !== "ai.tool.started" && event.type !== "ai.tool.completed") return false;
    const payload = event.payload;
    if (event.type.includes("character.transfer") || event.type.includes("actor.transfer")) {
      setCharacterTransferRevision((revision) => revision + 1);
      const transferPayload = recordValue(payload?.transfer) ?? payload;
      if (transferPayload?.toUserId === currentUserId && transferPayload.status === "pending") {
        setStatus("A character ownership transfer needs your response in Manage > Account");
      } else {
        setStatus("Character ownership transfer updated");
      }
    }
    const threadId = typeof payload?.threadId === "string" && payload.threadId.trim() ? payload.threadId : event.targetId;
    if (!threadId) return false;
    const activeThreadId = aiAgentLiveThreadIdRef.current;
    if (activeThreadId && activeThreadId !== threadId) return false;
    if (!activeThreadId) aiAgentLiveThreadIdRef.current = threadId;
    const now = new Date().toISOString();
    setAiAgentMessages((messages) => {
      const pendingAssistantId = aiAgentPendingAssistantIdRef.current;
      const existing = messages.find((message) => message.id === threadId) ?? (pendingAssistantId ? messages.find((message) => message.id === pendingAssistantId) : undefined);
      const base: AiAgentMessage = existing ? { ...existing, id: threadId } : { id: threadId, role: "assistant", content: "", createdAt: now, reasoning: [], streaming: true };
      let next: AiAgentMessage = { ...base, streaming: event.type !== "ai.message.completed" };
      if (event.type === "ai.message.delta") {
        const delta = typeof payload?.delta === "string" ? payload.delta : "";
        const streamedContent = typeof payload?.content === "string" ? payload.content : `${base.content}${delta}`;
        next = { ...next, content: streamedContent };
      }
      if (event.type === "ai.message.completed" && typeof payload?.content === "string") {
        next = { ...next, content: payload.content, streaming: false };
      }
      if (event.type === "ai.reasoning.delta" && typeof payload?.delta === "string") {
        const summaryIndex = typeof payload.summaryIndex === "number" && Number.isFinite(payload.summaryIndex) ? payload.summaryIndex : 0;
        next = { ...next, reasoning: appendReasoningDelta(base.reasoning, summaryIndex, payload.delta), streaming: true };
      }
      if (event.type === "ai.reasoning.completed" && typeof payload?.content === "string") {
        next = { ...next, reasoning: completedReasoningTraces(base.reasoning, payload.content), streaming: true };
      }
      if (event.type === "ai.activity.reported" && typeof payload?.message === "string") {
        next = { ...next, activity: appendAiAgentActivity(base.activity, payload.message), streaming: true };
      }
      const progress = aiAgentToolProgressText(event);
      if (progress) next = { ...next, progress, activity: appendAiAgentActivity(next.activity ?? base.activity, progress), streaming: true };
      const mergedMessages = pendingAssistantId && pendingAssistantId !== threadId ? messages.filter((message) => message.id !== pendingAssistantId) : messages;
      aiAgentPendingAssistantIdRef.current = null;
      return upsertAiAgentMessage(mergedMessages, next);
    });
    return true;
  };
  realtimeApplyRef.current = (data: unknown): RealtimeApplyResult => {
    let event: AiAgentRealtimeEvent;
    try {
      event = typeof data === "string" ? JSON.parse(data) : (data as typeof event);
    } catch {
      return "ignored";
    }
    if (!event || typeof event.type !== "string" || event.campaignId !== campaignId) return "ignored";
    const payload = event.payload;
    if (payload?.refreshRequired === true) return "snapshot";
    // Deleting a world detaches world-linked actors, journals, handouts, and
    // records. Reconcile that cascade from the authoritative snapshot.
    if (event.type === "world.deleted") return "snapshot";
    if (event.type.startsWith("world.") || event.type.startsWith("handout.")) {
      loreRealtimeRefreshPendingRef.current = true;
      return "lore";
    }
    if (applyAiAgentRealtimeEvent(event)) return "applied";
    if ((event.type === "actor.created" || event.type === "actor.updated") && payload && payload.redacted !== true && typeof payload.id === "string" && payload.data && typeof payload.data === "object") {
      applyActorToSnapshot(payload as unknown as Actor);
      return "vision";
    }
    if ((event.type === "token.created" || event.type === "token.updated" || event.type === "token.moved") && payload && payload.redacted !== true && typeof payload.id === "string" && typeof payload.sceneId === "string") {
      applyTokensToSnapshot([payload as unknown as Token]);
      return "vision";
    }
    if (event.type === "token.moved.batch") { const batch = recordValue(payload), tokenIds = new Set<string>(); if (batch.redacted === true || typeof batch.sceneId !== "string" || typeof batch.movedAt !== "string" || !Array.isArray(batch.tokens) || batch.tokens.length === 0 || !batch.tokens.every((candidate) => { const token = recordValue(candidate); if (typeof token.id !== "string" || token.sceneId !== batch.sceneId || tokenIds.has(token.id)) return false; tokenIds.add(token.id); return true; })) return "snapshot"; applyTokensToSnapshot(batch.tokens as unknown as Token[]); return "vision"; }
    if (event.type === "token.deleted") {
      const tokenId = typeof payload?.id === "string" ? (payload.id as string) : event.targetId;
      if (!tokenId) return "snapshot";
      invalidateInFlightRefreshes();
      setSnapshot((current) => ({ ...current, tokens: current.tokens.filter((token) => token.id !== tokenId) }));
      // Token deletion can also detach encounter/combat references, so retain a
      // full reconciliation for this uncommon destructive operation.
      return "snapshot";
    }
    if ((event.type === "scene.activated" || event.type === "scene.updated") && payload && typeof payload.id === "string" && payload.campaignId === campaignId) {
      applySceneToSnapshot(payload as unknown as Scene);
      return event.type === "scene.activated" ? "snapshot" : "vision";
    }
    if (event.type === "chat.message.created" || event.type === "chat.message.updated") {
      if (!payload || typeof payload.id !== "string" || payload.campaignId !== campaignId) return "snapshot";
      setSnapshot((current) => ({ ...current, chat: upsertBoundedRealtimeRecord(current.chat, payload as unknown as ChatMessage) }));
      return "applied";
    }
    if (event.type === "chat.message.deleted") {
      const messageId = typeof payload?.id === "string" ? payload.id : event.targetId;
      if (!messageId) return "snapshot";
      setSnapshot((current) => ({ ...current, chat: removeRealtimeRecord(current.chat, messageId) }));
      return "applied";
    }
    if (event.type === "dice.roll.created") {
      if (!payload || typeof payload.id !== "string" || payload.campaignId !== campaignId) return "snapshot";
      setSnapshot((current) => ({ ...current, rolls: upsertBoundedRealtimeRecord(current.rolls, payload as unknown as DiceRoll) }));
      return "applied";
    }
    if (event.type === "item.created" || event.type === "item.updated") {
      if (!payload || typeof payload.id !== "string" || payload.campaignId !== campaignId) return "snapshot";
      applyItemToSnapshot(payload as unknown as Item);
      return "applied";
    }
    if (event.type === "item.deleted") {
      const itemId = typeof payload?.id === "string" ? payload.id : event.targetId;
      if (!itemId) return "snapshot";
      setSnapshot((current) => ({ ...current, items: removeRealtimeRecord(current.items, itemId) }));
      return "applied";
    }
    // `combat.ended` also represents proposal-driven combat deletion. The
    // payload intentionally carries the prior record, so a snapshot is the
    // only reliable way to distinguish deactivation from removal.
    if (event.type === "combat.ended") return "snapshot";
    if (event.type.startsWith("combat.") && payload && typeof payload.id === "string" && payload.campaignId === campaignId) {
      applyCombatToSnapshot(payload as unknown as Combat);
      return "applied";
    }
    if ((event.type === "encounter.created" || event.type === "encounter.updated") && payload && typeof payload.id === "string" && payload.campaignId === campaignId) {
      applyEncounterToSnapshot(payload as unknown as Encounter);
      return "applied";
    }
    if (event.type === "journal.created" || event.type === "journal.updated") {
      if (!payload || typeof payload.id !== "string" || payload.campaignId !== campaignId) return "snapshot";
      setSnapshot((current) => ({ ...current, journals: upsertRealtimeRecord(current.journals, payload as unknown as JournalEntry) }));
      return "applied";
    }
    if (event.type === "journal.deleted") {
      const journalId = typeof payload?.id === "string" ? payload.id : event.targetId;
      if (!journalId) return "snapshot";
      setSnapshot((current) => ({ ...current, journals: removeRealtimeRecord(current.journals, journalId) }));
      return "applied";
    }
    return "snapshot";
  };

  useEffect(() => {
    if (!snapshotReady || campaignSetupBusyRef.current || !campaignSetupDraftScope || !campaignSetupDraftKey || loadedCampaignSetupDraftKey === campaignSetupDraftKey) return;
    const restored = loadCampaignSetupDraft(window.localStorage, campaignSetupDraftScope);
    if (restored.status !== "ready") {
      resetCampaignSetupDraft();
      if (restored.status !== "missing") setCampaignSetupDraftNotice(restored.message);
      setLoadedCampaignSetupDraftKey(campaignSetupDraftKey);
      return;
    }
    const draft = restored.draft;
    const { idempotencyKeys, progress: storedProgress, ...form } = draft;
    setCampaignSetupForm(form);
    campaignSetupIdempotencyRef.current = idempotencyKeys ?? null;
    const campaign = storedProgress ? snapshot.campaigns.find((candidate) => candidate.id === storedProgress.campaignId) : undefined;
    if (storedProgress && campaign) {
      campaignSetupProgressRef.current = { key: idempotencyKeys?.draftKey ?? JSON.stringify(draft), organizationId: campaignSetupDraftScope.organizationId, userId: campaignSetupDraftScope.userId, campaign, draftScopeCampaignId: storedProgress.sourceCampaignId ?? campaignSetupDraftScope.campaignId, scene: snapshot.scenes.find((scene) => scene.id === storedProgress.sceneId), onboardingCreated: storedProgress.onboardingCreated, inviteEmail: storedProgress.inviteEmail, inviteRole: storedProgress.inviteRole, inviteRequestStarted: storedProgress.inviteRequestStarted, inviteCreatedWithoutLink: storedProgress.inviteCreatedWithoutLink };
      setCampaignSetupRecoveryPending(true);
      setCampaignSetupDraftNotice(`Resumed ${campaign.name}; retry to finish its remaining setup or keep it as-is.`);
    } else {
      campaignSetupProgressRef.current = null;
      setCampaignSetupRecoveryPending(false);
      if (storedProgress) {
        campaignSetupIdempotencyRef.current = null;
        setCampaignSetupDraftNotice("The campaign recorded by this draft is no longer available. Its safe inputs were recovered; start fresh before creating it again.");
      } else {
        setCampaignSetupDraftNotice("Resumed the setup draft saved in this browser.");
      }
    }
    if (snapshot.workspaceDefaults) setupDefaultsAppliedRef.current = `${snapshot.workspaceDefaults.id}:${snapshot.workspaceDefaults.updatedAt}`;
    setCampaignSetupDirty(false);
    setLoadedCampaignSetupDraftKey(campaignSetupDraftKey);
  }, [campaignSetupDraftKey, campaignSetupDraftScope, isCreatingCampaignSetup, loadedCampaignSetupDraftKey, snapshot.campaigns, snapshot.scenes, snapshot.workspaceDefaults, snapshotReady]);

  useEffect(() => {
    if (!campaignSetupDirty || !campaignSetupDraftScope || loadedCampaignSetupDraftKey !== campaignSetupDraftKey) return;
    persistCampaignSetupDraft();
  }, [campaignSetupDirty, campaignSetupDraftKey, campaignSetupDraftScope, campaignSetupForm, loadedCampaignSetupDraftKey]);

  useEffect(() => {
    const defaults = snapshot.workspaceDefaults;
    if (!defaults) return;
    if (campaignSetupBusyRef.current || campaignSetupProgressRef.current) return;
    const defaultsKey = `${defaults.id}:${defaults.updatedAt}`;
    if (setupDefaultsAppliedRef.current === defaultsKey) return;
    setCampaignSetupForm((current) => ({ ...current, systemId: defaults.defaultSystemId, visibility: defaults.defaultCampaignVisibility, sceneName: defaults.defaultSceneName, sceneFolder: defaults.defaultSceneFolder, sceneWidth: defaults.defaultSceneWidth, sceneHeight: defaults.defaultSceneHeight, sceneGridSize: defaults.defaultSceneGridSize, inviteRole: defaults.defaultInviteRole, permissionTemplate: defaults.defaultPermissionTemplate, onboardingTitle: defaults.onboardingTitle, onboardingBody: defaults.onboardingBody }));
    setupDefaultsAppliedRef.current = defaultsKey;
  }, [campaignSetupRecoveryPending, isCreatingCampaignSetup, snapshot.workspaceDefaults]);

  useEffect(() => {
    if (!focusInviteLinkAfterSetupRef.current || workspaceMode !== "manage" || manageCategory !== "people" || !inviteAcceptUrl) return;
    const frame = window.requestAnimationFrame(() => {
      const inviteLink = inviteLinkRef.current;
      if (!inviteLink) return;
      focusInviteLinkAfterSetupRef.current = false;
      inviteLink.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inviteAcceptUrl, manageCategory, workspaceMode]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistStoredId("otte:selectedCampaignId", campaignId);
  }, [blankCanvasDemoOpen, campaignId]);

  useEffect(() => {
    setSceneDuplicationReview(undefined);
    setSceneDuplicationBusy(false);
  }, [campaignId]);

  useEffect(() => {
    setArchiveImportRollbackPreview(undefined);
    if (!snapshotReady || blankCanvasDemoOpen || !campaignId || !canManageArchives) {
      setArchiveImportOperations([]);
      setSelectedArchiveImportOperationId("");
      return;
    }
    void loadArchiveImportOperations(campaignId).catch(() => {
      if (realtimeSelectionRef.current.campaignId !== campaignId) return;
      setArchiveImportOperations([]);
      setSelectedArchiveImportOperationId("");
    });
  }, [blankCanvasDemoOpen, campaignId, canManageArchives, snapshotReady]);

  useEffect(() => {
    if (!snapshotReady || blankCanvasDemoOpen || !campaignId) {
      setWorlds([]);
      setHandouts([]);
      setWorldsLoadState("idle");
      setHandoutsLoadState("idle");
      setWorldsLoadError("");
      setHandoutsLoadError("");
      setSelectedWorldId("all");
      return;
    }
    const loreRequest = { campaignId, userId: currentUserId };
    const controller = new AbortController();
    const loreRequestIsCurrent = () =>
      !controller.signal.aborted && workspaceRequestIsCurrent(loreRequest.campaignId, loreRequest.userId);
    setWorldsLoadState("loading");
    setHandoutsLoadState("loading");
    setWorldsLoadError("");
    setHandoutsLoadError("");
    void settleWorkspaceLoreLoad(
      apiGet<WorldAtlasWorld[]>(`/api/v1/campaigns/${loreRequest.campaignId}/worlds`, { signal: controller.signal }),
      loreRequestIsCurrent,
      (nextWorlds) => {
        setWorlds([...nextWorlds].sort((left, right) => left.name.localeCompare(right.name)));
        setWorldsLoadState("ready");
      },
      (error) => {
        setWorldsLoadError(`Worlds could not be loaded: ${errorMessage(error)}`);
        setWorldsLoadState("error");
      }
    );
    void settleWorkspaceLoreLoad(
      apiGet<HandoutLibraryItem[]>(`/api/v1/campaigns/${loreRequest.campaignId}/handouts`, { signal: controller.signal }),
      loreRequestIsCurrent,
      (nextHandouts) => {
        setHandouts(nextHandouts);
        setHandoutsLoadState("ready");
      },
      (error) => {
        setHandoutsLoadError(`Handouts could not be loaded: ${errorMessage(error)}`);
        setHandoutsLoadState("error");
      }
    );
    return () => controller.abort();
  }, [blankCanvasDemoOpen, campaignId, currentUserId, loreReloadVersion, snapshotReady]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    const nextKey = aiAgentHistoryStorageKey(campaignId, currentUserId);
    setAiAgentHistoryKey(nextKey);
    setAiAgentMessages(initialAiAgentMessages(nextKey));
    setAiAgentApprovalModeState(initialAiAgentApprovalMode(campaignId, currentUserId));
    setAiAgentHiddenProposalIds(new Set());
  }, [blankCanvasDemoOpen, campaignId, currentUserId]);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistAiAgentMessages(aiAgentHistoryKey, aiAgentMessages);
  }, [blankCanvasDemoOpen, aiAgentHistoryKey, aiAgentMessages]);

  useEffect(() => () => {
    if (aiAgentAuthRetryTimerRef.current !== null) window.clearTimeout(aiAgentAuthRetryTimerRef.current);
    aiAgentAbortRef.current?.abort();
    inviteAcceptAbortRef.current?.abort();
    revokeBlankCanvasAssetUrls();
    for (const controller of workspaceAbortControllersRef.current) controller.abort();
    workspaceAbortControllersRef.current.clear();
  }, []);

  useEffect(() => {
    if (blankCanvasDemoOpen) return;
    persistStoredId("otte:selectedSceneId", sceneId);
  }, [blankCanvasDemoOpen, sceneId]);

  useEffect(() => {
    if (blankCanvasDemoOpen || resetMode) return;
    let cancelled = false;
    loadBootstrapStatus()
      .then(async (bootstrap) => {
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
        const ssoUserId = await consumeSsoRedirect();
        if (cancelled) return;
        if (ssoUserId) {
          selectWorkspaceContext(campaignId, sceneId, ssoUserId);
          syncSessionTransportState();
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
    if (!realtimeConnectionKey) {
      setRealtimeUiState("idle");
      return;
    }
    let cancelled = false;
    let resyncGeneration = 0;
    let resyncRetryTimer: number | undefined;
    let resyncing = false;
    const queuedMessages: unknown[] = [];
    setRealtimeUiState("connecting");
    const realtimeHandlers = createRealtimeHandlers({
      refresh: () => realtimeRefreshRef.current(),
      reconcile: (scopes) => realtimeReconcileRef.current(scopes),
      handleBoardCaptureEvent: (data) => realtimeBoardCaptureHandlerRef.current(data),
      applyRealtimeEvent: (data) => realtimeApplyRef.current(data),
      setStatus,
      onRefreshError: () => setStatus("Realtime refresh failed")
    });
    const clearResyncRetry = () => {
      if (resyncRetryTimer === undefined) return;
      window.clearTimeout(resyncRetryTimer);
      resyncRetryTimer = undefined;
    };
    const applyPresenceMessage = (data: unknown): boolean => {
      const decision = realtimeSequenceDecision(data, realtimeSequenceRef.current);
      if (decision.kind !== "presence") return false;
      if (decision.envelope.campaignId !== realtimeSelectionRef.current.campaignId) return true;
      setSnapshot((current) => ({ ...current, presences: applyPresenceEnvelope(current.presences, decision.envelope) }));
      return true;
    };
    let startAuthoritativeResync: (reason: string) => void = () => {};
    const dispatchDomainMessage = (data: unknown, recoverGap: boolean): void => {
      const decision = realtimeSequenceDecision(data, realtimeSequenceRef.current);
      if (decision.kind === "presence") {
        if (decision.envelope.campaignId === realtimeSelectionRef.current.campaignId) {
          setSnapshot((current) => ({ ...current, presences: applyPresenceEnvelope(current.presences, decision.envelope) }));
        }
        return;
      }
      if (decision.kind === "duplicate") return;
      if (decision.kind === "gap") {
        if (recoverGap) startAuthoritativeResync(`Realtime event gap detected (${decision.expectedSequence}-${decision.sequence - 1}) - refreshing shared table state`);
        return;
      }
      if (decision.kind === "contiguous") realtimeSequenceRef.current = decision.sequence;
      realtimeHandlers.onMessage(decision.event);
    };
    const reconcileReconnect = async (generation: number, retryAttempt: number): Promise<void> => {
      try {
        await realtimeHandlers.onOpen(true);
        if (cancelled || generation !== resyncGeneration) return;
        // Events can arrive while the snapshot request is in flight. Apply the
        // permitted fast paths, then take one more authoritative snapshot so an
        // event racing the first response cannot leave the table stale.
        while (queuedMessages.length > 0) {
          const messages = queuedMessages.splice(0);
          for (const message of messages) dispatchDomainMessage(message, false);
          await realtimeHandlers.onOpen(true);
          if (cancelled || generation !== resyncGeneration) return;
        }
        resyncing = false;
        setRealtimeUiState("connected");
        setStatus("Realtime connected and synced");
      } catch (error) {
        if (cancelled || generation !== resyncGeneration) return;
        const delayMs = realtimeReconnectDelayMs(retryAttempt);
        setStatus(`Realtime refresh failed: ${errorMessage(error)}. Retrying in ${formatDuration(delayMs)}.`);
        resyncRetryTimer = window.setTimeout(() => {
          resyncRetryTimer = undefined;
          void reconcileReconnect(generation, retryAttempt + 1);
        }, delayMs);
      }
    };
    startAuthoritativeResync = (reason: string) => {
      clearResyncRetry();
      const generation = ++resyncGeneration;
      resyncing = true;
      queuedMessages.length = 0;
      setRealtimeUiState("syncing");
      setStatus(reason);
      void reconcileReconnect(generation, 0);
    };
    const stopRealtime = startRealtimeConnection({
      apiBase,
      origin: window.location.origin,
      campaignId,
      sessionToken,
      activeSceneId: () => realtimeSelectionRef.current.sceneId || undefined,
      onOpen: ({ reconnected }) => {
        clearResyncRetry();
        const generation = ++resyncGeneration;
        if (!reconnected) {
          resyncing = false;
          setRealtimeUiState("connected");
          void realtimeHandlers.onOpen(false);
          return;
        }
        resyncing = true;
        queuedMessages.length = 0;
        setRealtimeUiState("syncing");
        setStatus("Realtime reconnected - refreshing shared table state");
        void reconcileReconnect(generation, 0);
      },
      onMessage: (data) => {
        if (applyPresenceMessage(data)) return;
        if (resyncing) queuedMessages.push(data);
        else dispatchDomainMessage(data, true);
      },
      onUnavailable: () => {
        setRealtimeUiState("reconnecting");
        resyncGeneration += 1;
        resyncing = false;
        queuedMessages.length = 0;
        clearResyncRetry();
        setStatus("Realtime unavailable - reconnecting");
      }
    });
    return () => {
      cancelled = true;
      resyncGeneration += 1;
      clearResyncRetry();
      queuedMessages.length = 0;
      realtimeHandlers.dispose();
      stopRealtime();
    };
  }, [realtimeConnectionKey]);

  useEffect(() => {
    if (blankCanvasDemoOpen || workspaceMode !== "manage" || manageCategory !== "serverAdmin" || !snapshot.session?.serverAdmin) return;
    refreshAdmin().catch((error) => setAdminStatus(error instanceof Error ? error.message : String(error)));
  }, [blankCanvasDemoOpen, campaignId, currentUserId, manageCategory, workspaceMode, snapshot.session?.serverAdmin]);

  useEffect(() => {
    if (workspaceMode === "live" && !isInspectorTabAllowed("live", tab)) setTab("actors");
    if (workspaceMode === "prep" && !isInspectorTabAllowed("prep", tab)) setTab("content");
    if (workspaceMode === "manage" && !isInspectorTabAllowed("manage", tab)) setTab("actors");
  }, [tab, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "prep" || canonicalPrepSceneId === sceneId) return;
    // During a campaign switch the previous snapshot can render once under the
    // new campaign id. Wait for its scene collection instead of persisting an
    // id from the old campaign as the new canonical selection.
    if (accessibleScenes.some((scene) => scene.campaignId !== campaignId)) return;
    const request = { campaignId, userId: currentUserId };
    realtimeSelectionRef.current = { ...realtimeSelectionRef.current, sceneId: canonicalPrepSceneId };
    setSceneId(canonicalPrepSceneId);
    void refresh(request.campaignId, canonicalPrepSceneId, { syncStatus: false }).catch((syncError) => {
      if (workspaceRequestIsCurrent(request.campaignId, request.userId)) {
        setStatus(`Scene selection changed; refresh failed: ${errorMessage(syncError)}`);
      }
    });
  }, [campaignId, canonicalPrepSceneId, currentUserId, sceneId, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "live" && workspaceMode !== "prep") setTableFocusMode(false);
  }, [workspaceMode]);

  useEffect(() => {
    setTableFocusMode(false);
  }, [campaignId, currentUserId]);

  useEffect(() => {
    if (workspaceMode === "prep" && !canUsePrepWorkspace) setWorkspaceMode("live");
    if (workspaceMode === "ai" && !canUseAiStudioWorkspace) setWorkspaceMode("live");
  }, [canUseAiStudioWorkspace, canUsePrepWorkspace, workspaceMode]);

  useEffect(() => {
    if (!aiAgentOpen) return;
    const focusFrame = window.requestAnimationFrame(() => aiAgentPromptRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeAiAgent();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [aiAgentOpen]);

  useEffect(() => {
    if (workspaceMode !== "manage") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (blockCampaignSetupNavigation("leaving campaign setup")) return;
      if (blockUnsavedSceneDraft("leaving Scene Manager")) return;
      setWorkspaceMode("live");
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [manageCategory, sceneEditDirty, workspaceMode]);

  useEffect(() => {
    if (!hasUnsavedSceneDraft && !isCreatingCampaignSetup && !campaignSetupRecoveryPending) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [campaignSetupRecoveryPending, hasUnsavedSceneDraft, isCreatingCampaignSetup]);

  useEffect(() => {
    document.documentElement.dataset.theme = uiTheme;
    try {
      window.localStorage.setItem(uiThemeStorageKey, uiTheme);
    } catch {
      /* storage unavailable */
    }
  }, [uiTheme]);

  function applyPreferenceRuntime(user: User): void {
    const preferences = resolvedUserPreferences(user);
    setUiTheme(preferences.theme);
    setDice3dEnabled(preferences.dice3dEnabled);
    document.documentElement.dataset.reducedMotion = preferences.reducedMotion ? "true" : "false";
    document.documentElement.dataset.chatNotifications = preferences.chatNotifications;
  }

  function applyAuthenticatedUser(user: User): void {
    applyPreferenceRuntime(user);
    setSnapshot((current) => ({
      ...current,
      session: current.session ? { ...current.session, user } : current.session,
      members: current.members.map((member) => member.user.id === user.id ? { ...member, user: { ...member.user, displayName: user.displayName, email: user.email } } : member),
      organizationMembers: current.organizationMembers.map((member) => member.user.id === user.id ? { ...member, user: { ...member.user, displayName: user.displayName, email: user.email } } : member)
    }));
    setStatus("Profile preferences synced");
  }

  function persistQuickPreferences(patch: Partial<NonNullable<User["preferences"]>>, label: string): void {
    const user = snapshotRef.current.session?.user;
    if (!user) return;
    const previous = resolvedUserPreferences(user);
    const preferences = { ...previous, ...patch };
    const attemptKey = `profile-quick-preference:${user.id}:${globalThis.crypto.randomUUID()}`;
    applyPreferenceRuntime({ ...user, preferences });
    void campaignAction.runAction(label, async () => {
      try {
        const result = await updateUserProfile({ user, displayName: user.displayName, preferences, idempotencyKey: attemptKey });
        applyAuthenticatedUser(result.user);
      } catch (failure) {
        applyPreferenceRuntime({ ...user, preferences: previous });
        throw failure;
      }
    });
  }

  useEffect(() => {
    if (snapshot.session?.user) applyPreferenceRuntime(snapshot.session.user);
  }, [snapshot.session?.user.id, snapshot.session?.user.updatedAt]);

  function enterTableFocusMode() {
    if (!window.matchMedia("(min-width: 1041px)").matches) return;
    tableFocusRestoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTableFocusMode(true);
    window.requestAnimationFrame(() => tableFocusToggleRef.current?.focus());
  }

  function exitTableFocusMode() {
    const restoreTarget = tableFocusRestoreRef.current;
    tableFocusRestoreRef.current = null;
    setTableFocusMode(false);
    window.requestAnimationFrame(() => {
      if (restoreTarget?.isConnected && restoreTarget.offsetParent !== null) restoreTarget.focus();
      else tableFocusToggleRef.current?.focus();
    });
  }

  function toggleTableFocusMode() {
    if (tableFocusMode) exitTableFocusMode();
    else enterTableFocusMode();
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1041px)");
    const handleViewportChange = () => {
      if (!desktop.matches && tableFocusMode) exitTableFocusMode();
    };
    desktop.addEventListener("change", handleViewportChange);
    return () => desktop.removeEventListener("change", handleViewportChange);
  }, [tableFocusMode]);

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
        if (commandPaletteOpen) return;
        if (tableFocusMode) {
          exitTableFocusMode();
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
        case "f":
          if (window.matchMedia("(min-width: 1041px)").matches) runTool(toggleTableFocusMode);
          return;
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
    if (text === blankCanvasDemoNotice) return;
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
    const reduceMotion = resolvedUserPreferences(snapshot.session?.user ?? {}).reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    if (!snapshotReady) return;
    if (!seenChatMessageIdsRef.current) {
      seenChatMessageIdsRef.current = new Set(snapshot.chat.map((message) => message.id));
      return;
    }
    const seen = seenChatMessageIdsRef.current;
    const fresh = snapshot.chat.filter((message) => !seen.has(message.id));
    for (const message of fresh) seen.add(message.id);
    if (fresh.length === 0 || tab === "chat") return;
    const preferences = resolvedUserPreferences(snapshot.session?.user ?? {});
    if (preferences.chatNotifications === "none") return;
    const displayName = snapshot.session?.user.displayName.toLowerCase() ?? "";
    const firstName = displayName.split(/\s+/)[0] ?? "";
    const alertable = fresh.filter((message) => {
      if (message.userId === currentUserId) return false;
      if (preferences.chatNotifications === "all") return true;
      if (message.visibility === "whisper" && message.recipientUserIds.includes(currentUserId)) return true;
      const body = message.body.toLowerCase();
      return Boolean(displayName && body.includes(`@${displayName}`)) || Boolean(firstName && body.includes(`@${firstName}`));
    });
    if (alertable.length === 0) return;
    setChatUnreadCount((count) => count + alertable.length);
    const latest = alertable[alertable.length - 1]!;
    const author = snapshot.members.find((member) => member.user.id === latest.userId)?.user.displayName ?? "A campaign member";
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    const text = `${author}: ${latest.body.slice(0, 96)}`;
    setToasts((current) => [...current.slice(-2), { id, text, tone: "info" }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6000);
  }, [currentUserId, snapshot.chat, snapshot.members, snapshot.session?.user, snapshotReady, tab]);

  useEffect(() => {
    if (tab === "chat") setChatUnreadCount(0);
  }, [tab]);

  useEffect(() => {
    seenChatMessageIdsRef.current = null;
    setChatUnreadCount(0);
  }, [campaignId, currentUserId]);

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
    if (!selectedCampaign) return;
    setCampaignEditName(selectedCampaign.name);
    setCampaignEditDescription(selectedCampaign.description);
    setCampaignEditSystemId(selectedCampaign.defaultSystemId);
    setCampaignEditVisibility(selectedCampaign.visibility);
    setCampaignDuplicateName(`${selectedCampaign.name} Copy`);
    setCampaignDuplicateError("");
    setCampaignDeleteConfirm("");
  }, [selectedCampaign?.id, selectedCampaign?.name, selectedCampaign?.description, selectedCampaign?.defaultSystemId, selectedCampaign?.visibility]);

  useEffect(() => {
    setNewSceneActive(false);
    setNewSceneGridType("square");
  }, [selectedCampaign?.id]);

  useEffect(() => {
    if (!selectedScene) return;
    if (sceneEditDirty) return;
    setSceneEditName(selectedScene.name);
    setSceneEditFolder(selectedScene.folder ?? "");
    setSceneEditWidth(selectedScene.width);
    setSceneEditHeight(selectedScene.height);
    setSceneEditGridType(normalizeSceneGridType(selectedScene.gridType));
    setSceneEditGridSize(selectedScene.gridSize);
    setSceneEditActive(selectedScene.active);
    setSceneEditBackgroundAssetId(selectedScene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(selectedScene));
    setSceneDuplicateName(`${selectedScene.name} Copy`);
    if (selectedScene.gridType === "gridless") { setGridCalibrationOpen(false); setGridCalibrationPoints([]); }
  }, [sceneEditDirty, selectedScene?.id, selectedScene?.name, selectedScene?.folder, selectedScene?.width, selectedScene?.height, selectedScene?.gridType, selectedScene?.gridSize, selectedScene?.active, selectedScene?.backgroundAssetId, selectedScene?.metadata]);

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
    runWorkspaceBoundAction(
      (request) => loadMfaStatus({ signal: request.controller.signal }),
      (info) => setMfaInfo(info)
    )
      .catch(() => setMfaInfo(undefined));
  }, [blankCanvasDemoOpen, authRequired, sessionToken, snapshot.session?.user.id]);

  async function switchSession(userId: string) {
    if (blockCampaignSetupNavigation("switching sessions")) return;
    if (blockUnsavedSceneDraft("switching sessions")) return;
    cancelInviteAcceptance();
    sessionSwitchAbortRef.current?.abort();
    sessionSwitchAbortRef.current = undefined;
    const requestId = beginSessionSwitch(sessionSwitchSeqRef, realtimeSelectionRef.current.userId, userId);
    if (requestId === undefined) return;
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const controller = new AbortController();
    sessionSwitchAbortRef.current = controller;
    const requestedSelection = { ...realtimeSelectionRef.current };
    const requestIsCurrent = () => {
      const currentSelection = realtimeSelectionRef.current;
      return !controller.signal.aborted && sessionSwitchIsCurrent(sessionSwitchSeqRef, requestId) &&
        currentSelection.campaignId === requestedSelection.campaignId &&
        currentSelection.sceneId === requestedSelection.sceneId &&
        currentSelection.userId === requestedSelection.userId;
    };
    const login = await loginSession(userId, { persist: false, signal: controller.signal }).catch((error: unknown) => {
      if (!requestIsCurrent()) return undefined;
      throw error;
    });
    if (!login || !requestIsCurrent()) return;
    if (login.user.id !== userId) throw new Error("Session login returned a different user.");
    const committed = await commitDeferredCredential(login, credentialTicket, requestIsCurrent, () => {
      selectWorkspaceContext(requestedSelection.campaignId, requestedSelection.sceneId, login.user.id);
      setAuthRequired(false);
      setSnapshotReady(false);
      setStatus("Switching session");
    });
    if (!committed) return;
    await refresh(requestedSelection.campaignId, requestedSelection.sceneId);
    if (sessionSwitchAbortRef.current === controller) sessionSwitchAbortRef.current = undefined;
  }

  async function switchActiveOrganization(organizationId: string) {
    if (blockCampaignSetupNavigation("switching workspaces")) return;
    if (blockUnsavedSceneDraft("switching workspaces")) return;
    cancelInviteAcceptance();
    const organization = snapshot.organizations.find((item) => item.id === organizationId);
    setStatus(`Switching to ${organization?.name ?? organizationId}`);
    setAccountStatus(`Switching workspace to ${organization?.name ?? organizationId}`);
    await switchOrganization(organizationId);
    selectWorkspaceContext("", "");
    await refresh("", "", { syncStatus: false });
    setStatus(`Workspace switched to ${organization?.name ?? organizationId}`);
    setAccountStatus(`Workspace switched to ${organization?.name ?? organizationId}`);
  }

  async function createWorkspace() {
    if (blockCampaignSetupNavigation("creating a workspace")) return;
    cancelInviteAcceptance();
    const name = newWorkspaceName.trim();
    setStatus(`Creating workspace ${name}`);
    setAccountStatus(`Creating workspace ${name}`);
    const scope = "organization:create";
    const attempt = beginAppendMutation(scope, { name });
    const result = await createOrganizationWorkspace({ name }, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setSnapshot((current) => ({
      ...current,
      session: current.session ? { ...current.session, organization: result.organization, session: result.session, organizations: result.organizations } : current.session,
      organizations: result.organizations,
      workspaceDefaults: result.organization
    }));
    setNewWorkspaceName("");
    selectWorkspaceContext("", "");
    await refresh("", "", { syncStatus: false });
    setStatus(`Workspace created: ${result.organization.name}`);
    setAccountStatus(`Workspace created: ${result.organization.name}`);
  }

  function nextBlankCanvasDemoId(prefix: string): string {
    blankCanvasDemoIdRef.current += 1;
    return `${prefix}_${blankCanvasDemoIdRef.current}`;
  }

  function startBlankCanvasDemo() {
    cancelInviteAcceptance();
    sessionCredentialCommitQueueRef.current.invalidate();
    revokeBlankCanvasAssetUrls();
    const snapshot = createBlankCanvasDemoSnapshot();
    blankCanvasDemoIdRef.current = 0;
    clearSession();
    setStatelessDemoApiMode(true);
    setSnapshot(snapshot);
    setSessionToken("");
    setSnapshotReady(true);
    selectWorkspaceContext(blankCanvasDemoCampaignId, blankCanvasDemoSceneId, blankCanvasDemoUserId);
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
    resetWorkspaceNavigation("prep", "content");
    setCompendiumEntries([]);
    advancementCatalog.reset();
    setAiAgentOpen(false);
    setAiAgentApprovalModeState("manual");
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
    sessionCredentialCommitQueueRef.current.invalidate();
    revokeBlankCanvasAssetUrls();
    setStatelessDemoApiMode(false);
    setBlankCanvasDemoOpen(false);
    setSnapshotReady(false);
    setAuthRequired(true);
    const restoredUserId = getSessionUserId();
    const restoredCampaignId = initialStoredId("otte:selectedCampaignId", "camp_demo");
    const restoredSceneId = initialStoredId("otte:selectedSceneId", "scn_vault_entry");
    syncSessionTransportState();
    selectWorkspaceContext(restoredCampaignId, restoredSceneId, restoredUserId);
    setSelectedTokenIdState("tok_valen");
    setSelectedTokenIds(["tok_valen"]);
    setBoardUndoStack([]);
    setBoardRedoStack([]);
    setBoardClipboardTokens([]);
    resetWorkspaceNavigation();
    setAiAgentMessages(initialAiAgentMessages(aiAgentHistoryStorageKey(restoredCampaignId, restoredUserId)));
    setStatus("Sign in required");
    setAuthStatus(publicRegistration ? "" : "Sign in or use an invite link to join the beta");
  }

  async function startDemoGmSession() {
    cancelInviteAcceptance();
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const login = await loginSession("usr_demo_gm", { persist: false });
    const committed = await commitDeferredCredential(login, credentialTicket, () => true, () => {
      setStatelessDemoApiMode(false);
      setBlankCanvasDemoOpen(false);
      resetWorkspaceNavigation();
      selectWorkspaceContext("camp_demo", "scn_vault_entry", login.user.id);
      setAuthRequired(false);
      setAuthStatus("Seeded demo signed in");
      setSnapshotReady(false);
      setSelectedTokenIdState("tok_valen");
      setSelectedTokenIds(["tok_valen"]);
      setStatus("Seeded demo signed in");
    });
    if (!committed) return;
    try {
      await refresh("camp_demo");
    } catch (error) {
      setStatus(`Campaign load failed: ${errorMessage(error)}`);
      throw error;
    }
  }

  async function submitLogin() {
    cancelInviteAcceptance();
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const login = await loginPasswordSession({
      email: loginEmail.trim(),
      password: loginPassword,
      ...mfaCredential(loginMfaCode)
    }, { persist: false });
    const committed = await commitDeferredCredential(login, credentialTicket, () => true, () => {
      resetWorkspaceNavigation();
      selectWorkspaceContext(campaignId, sceneId, login.user.id);
      setAuthRequired(false);
      setLoginPassword("");
      setLoginMfaCode("");
      setAuthStatus("Signed in");
      setSnapshotReady(false);
      setStatus("Signed in");
    });
    if (!committed) return;
    try {
      await refresh();
    } catch (error) {
      setStatus(`Campaign load failed: ${errorMessage(error)}`);
      throw error;
    }
  }

  async function submitRegister() {
    cancelInviteAcceptance();
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const login = await registerSession({
      email: registerEmail.trim(),
      displayName: registerName.trim(),
      password: registerPassword
    }, { persist: false });
    const committed = await commitDeferredCredential(login, credentialTicket, () => true, () => {
      resetWorkspaceNavigation();
      selectWorkspaceContext(campaignId, sceneId, login.user.id);
      setAuthRequired(false);
      setRegisterPassword("");
      setAuthStatus("Account created");
      setSnapshotReady(false);
      setStatus("Account created");
    });
    if (!committed) return;
    try {
      await refresh();
    } catch (error) {
      setStatus(`Campaign load failed: ${errorMessage(error)}`);
      throw error;
    }
  }

  async function submitLogout() {
    invalidateCampaignSetupProgress();
    cancelInviteAcceptance();
    invalidatePendingSessionSwitch();
    cancelAiAgentForWorkspaceChange();
    cancelWorkspaceBoundRequestsForChange();
    clearAccountSecurityState();
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    await sessionCredentialCommitQueueRef.current.run(credentialTicket, async (credentialIsCurrent) => {
      let remoteLogoutFailed = false;
      try {
        await logoutSession();
      } catch {
        remoteLogoutFailed = true;
      }
      if (!credentialIsCurrent()) return;
      setSessionToken("");
      setAuthRequired(true);
      setSnapshotReady(false);
      setInviteToken("");
      setInviteAcceptUrl("");
      resetWorkspaceNavigation();
      setSnapshot((current) => ({ ...current, session: undefined }));
      setAdminSnapshot(undefined);
      setStatus(remoteLogoutFailed ? "Signed out locally; the server could not be reached" : "Signed out");
      setAuthStatus(remoteLogoutFailed ? "Signed out locally" : "Signed out");
    });
  }

  async function submitPasswordChange() {
    cancelInviteAcceptance();
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    await runWorkspaceBoundAction(
      (request) => changePasswordSession({
        currentPassword: passwordCurrent,
        newPassword: passwordNext
      }, { persist: false, signal: request.controller.signal }),
      async (login, request) => {
        if (login.user.id !== request.userId) throw new Error("Password change returned a different user");
        const committed = await commitDeferredCredential(login, credentialTicket, () => workspaceBoundRequestIsCurrent(request), () => {
          setPasswordCurrent("");
          setPasswordNext("");
          setAccountStatus("Password changed");
        });
        if (!committed) return;
        await refresh(request.campaignId, sceneId);
      }
    );
  }

  async function startMfaEnrollment() {
    await runWorkspaceBoundAction(
      (request) => enrollTotpMfa({ currentPassword: mfaPassword }, { signal: request.controller.signal }),
      (result) => {
        setMfaInfo(result.mfa);
        setMfaSecret(result.secret);
        setMfaRecoveryCodes([]);
        setAccountStatus("Scan or enter the TOTP secret, then confirm");
      }
    );
  }

  async function confirmMfaEnrollment() {
    await runWorkspaceBoundAction(
      (request) => confirmTotpMfa({ code: mfaCode.trim() }, { signal: request.controller.signal }),
      (result) => {
        setMfaInfo(result.mfa);
        setMfaRecoveryCodes(result.recoveryCodes ?? []);
        setMfaPassword("");
        setMfaCode("");
        setMfaSecret("");
        setAccountStatus("MFA enabled");
      }
    );
  }

  async function disableMfa() {
    await runWorkspaceBoundAction(
      (request) => disableTotpMfa({
        currentPassword: mfaPassword,
        ...mfaCredential(mfaCode)
      }, { signal: request.controller.signal }),
      (result) => {
        setMfaInfo(result.mfa);
        setMfaPassword("");
        setMfaCode("");
        setMfaSecret("");
        setMfaRecoveryCodes([]);
        setAccountStatus("MFA disabled");
      }
    );
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
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const login = await confirmPasswordResetSession({
      token: resetToken.trim(),
      password: resetPassword
    }, { persist: false });
    const committed = await commitDeferredCredential(login, credentialTicket, () => true, () => {
      resetWorkspaceNavigation();
      selectWorkspaceContext(campaignId, sceneId, login.user.id);
      setResetToken("");
      setResetPassword("");
      setResetPasswordConfirm("");
      setResetMode(false);
      setAuthRequired(false);
      clearResetUrl();
      setSnapshotReady(false);
      setStatus("Password reset complete");
    });
    if (!committed) return;
    await refresh();
  }

  async function submitBootstrapOwner() {
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const login = await bootstrapOwnerSession({
      email: bootstrapEmail.trim(),
      displayName: bootstrapName.trim(),
      password: bootstrapPassword,
      campaignName: bootstrapCampaignName.trim(),
      defaultSystemId: newCampaignSystemId
    }, { persist: false });
    const committed = await commitDeferredCredential(login, credentialTicket, () => true, () => {
      resetWorkspaceNavigation("prep", "content");
      selectWorkspaceContext(login.campaign.id, login.scene.id, login.user.id);
      setBootstrapPassword("");
      setBootstrapRequired(false);
      setAuthRequired(false);
      setSnapshotReady(false);
      setBootstrapStatus("Owner account ready");
      setStatus("Owner setup complete");
    });
    if (!committed) return;
    await refresh(login.campaign.id, login.scene.id);
  }

  async function createInvite() {
    const latestCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === campaignId);
    if (!latestCampaign) throw new Error("Reload the campaign before creating an invite.");
    const path = canManageActiveOrganization ? "/api/v1/organization/invites" : `/api/v1/campaigns/${campaignId}/invites`;
    const payload = {
      ...(canManageActiveOrganization ? { campaignId, expectedCampaignUpdatedAt: latestCampaign.updatedAt } : {}),
      email: inviteEmail.trim() || undefined,
      role: inviteRole
    };
    const scope = `campaign-invite:create:${campaignId}`;
    const attempt = beginAppendMutation(scope, { path, payload });
    const result = await apiPost<InviteCreateInfo>(path, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setInviteToken(result.token);
    setInviteAcceptUrl(absoluteInviteUrl(result.acceptUrl));
    const invites = await loadOrganizationInvites().catch(() => snapshotRef.current.organizationInvites);
    const nextSnapshot = reconcileInviteCreation(snapshotRef.current, campaignId, result, invites);
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
    setStatus("Invite link ready to copy");
  }

  async function transferSelectedCampaignOwnership(input: CampaignOwnershipTransferInput, idempotencyKey: string) {
    const reviewedCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === campaignId);
    if (!reviewedCampaign) throw new Error("Campaign not found");
    if (reviewedCampaign.ownerUserId !== currentUserId) throw new Error("Only the current campaign owner can transfer ownership");
    try {
      await runWorkspaceBoundAction(
        (request) => transferCampaignOwnership(reviewedCampaign.id, input, idempotencyKey, { signal: request.controller.signal }),
        async (result, request) => {
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
          if (!workspaceBoundRequestIsCurrent(request)) return;
          setStatus(`Campaign ownership transferred to ${result.newOwner.user.displayName}`);
        }
      );
    } catch (error) {
      if (error instanceof ApiError && (error.status === 403 || error.status === 409) && workspaceRequestIsCurrent(reviewedCampaign.id, currentUserId)) {
        await refresh(reviewedCampaign.id, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
        if (workspaceRequestIsCurrent(reviewedCampaign.id, currentUserId)) setStatus(errorMessage(error));
      }
      throw error;
    }
  }

  async function copyInviteLink() {
    if (!inviteAcceptUrl) return;
    if (!navigator.clipboard) throw new Error("Clipboard access is unavailable; select and copy the link instead.");
    await navigator.clipboard.writeText(inviteAcceptUrl);
    setStatus("Invite link copied");
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
    const currentInvite = snapshotRef.current.organizationInvites.find((item) => item.id === inviteId);
    if (!currentInvite) throw new Error("Reload invites before revoking this link.");
    const invite = await revokeInvite(inviteId, currentInvite.updatedAt, {
      idempotencyKey: sharedMutationIdempotencyKey(`campaign-invite:revoke:${inviteId}`, currentInvite.updatedAt, {})
    });
    const invites = await loadOrganizationInvites().catch(() => snapshot.organizationInvites.map((item) => item.id === invite.id ? { ...item, ...invite } : item));
    setSnapshot((current) => ({ ...current, organizationInvites: invites }));
    setInviteToken("");
    setInviteAcceptUrl("");
    setStatus("Invite revoked");
  }

  async function acceptInvite() {
    if (inviteAcceptBusyRef.current) return;
    cancelInviteAcceptance();
    const requestSequence = inviteAcceptSequenceRef.current;
    const credentialTicket = sessionCredentialCommitQueueRef.current.begin();
    const controller = new AbortController();
    inviteAcceptAbortRef.current = controller;
    inviteAcceptBusyRef.current = true;
    setIsAcceptingInvite(true);
    try {
      let result: Awaited<ReturnType<typeof acceptInviteSession>>;
      try {
        const payload = {
          token: joinToken.trim(),
          email: joinEmail.trim(),
          displayName: joinName.trim() || undefined,
          password: joinPassword,
          ...mfaCredential(joinMfaCode)
        };
        const scope = "campaign-invite:accept";
        const attempt = beginAppendMutation(scope, payload);
        result = await acceptInviteSession(payload, { persist: false, signal: controller.signal, idempotencyKey: attempt.idempotencyKey });
        completeAppendMutation(scope, attempt);
      } catch (error) {
        if (controller.signal.aborted || requestSequence !== inviteAcceptSequenceRef.current) return;
        const body = error instanceof ApiError && typeof error.body === "object" && error.body !== null ? error.body as { mfaRequired?: unknown } : undefined;
        if (body?.mfaRequired === true) {
          setJoinMfaRequired(true);
          setAuthStatus("Enter your MFA or recovery code to accept this invite");
          setStatus("Enter your MFA or recovery code to accept this invite");
          return;
        }
        throw error;
      }
      if (requestSequence !== inviteAcceptSequenceRef.current) return;
      const committed = await commitDeferredCredential(result, credentialTicket, () => !controller.signal.aborted && requestSequence === inviteAcceptSequenceRef.current, () => {
        resetWorkspaceNavigation();
        selectWorkspaceContext(result.campaign.id, "", result.user.id);
        setAuthRequired(false);
        setJoinToken("");
        setJoinFormOpen(false);
        setJoinEmail("");
        setJoinName("");
        setJoinPassword("");
        setJoinMfaCode("");
        setJoinMfaRequired(false);
        clearJoinUrl();
        setSnapshotReady(false);
        setStatus("Invite accepted");
      });
      if (!committed) return;
      await refresh(result.campaign.id);
    } finally {
      if (inviteAcceptAbortRef.current === controller) inviteAcceptAbortRef.current = null;
      if (requestSequence === inviteAcceptSequenceRef.current) {
        inviteAcceptBusyRef.current = false;
        setIsAcceptingInvite(false);
      }
    }
  }

  async function createCampaignFromSetup() {
    const name = newCampaignName.trim();
    if (!name || campaignSetupBusyRef.current) return;
    campaignSetupBusyRef.current = true;
    const requestGeneration = ++campaignSetupGenerationRef.current;
    const controller = new AbortController();
    campaignSetupAbortRef.current = controller;
    const setupRequestIsCurrent = () => campaignSetupGenerationRef.current === requestGeneration;
    setIsCreatingCampaignSetup(true);
    setCampaignSetupRecoveryPending(false);
    const sceneName = setupSceneName.trim() || "Opening Scene";
    const progressKey = JSON.stringify({
      organizationId: activeOrganizationId,
      userId: currentUserId,
      name,
      description: newCampaignDescription.trim(),
      systemId: newCampaignSystemId,
      visibility: newCampaignVisibility,
      permissionTemplate: setupPermissionTemplate,
      starterContent: setupStarterContent,
      sceneName,
      sceneFolder: setupSceneFolder.trim(),
      sceneWidth: Math.max(200, setupSceneWidth),
      sceneHeight: Math.max(200, setupSceneHeight),
      sceneGridType: setupSceneGridType,
      sceneGridSize: Math.max(10, setupSceneGridSize),
      onboardingTitle: setupOnboardingTitle.trim(),
      onboardingBody: setupOnboardingBody.trim()
    });
    const existingIdempotencyKeys = campaignSetupIdempotencyRef.current;
    const setupIdempotencyKeys = existingIdempotencyKeys?.draftKey === progressKey ? existingIdempotencyKeys : {
      draftKey: progressKey,
      campaign: `campaign-setup:${window.crypto.randomUUID()}:campaign`,
      scene: `campaign-setup:${window.crypto.randomUUID()}:scene`,
      journal: `campaign-setup:${window.crypto.randomUUID()}:journal`,
      invite: `campaign-setup:${window.crypto.randomUUID()}:invite`
    };
    campaignSetupIdempotencyRef.current = setupIdempotencyKeys;
    persistCampaignSetupDraft();
    try {
      const storedProgress = campaignSetupProgressRef.current;
      let progress = storedProgress?.organizationId === activeOrganizationId && storedProgress.userId === currentUserId ? storedProgress : null;
      if (!progress) {
        const campaign = await apiPost<Campaign>("/api/v1/campaigns", {
          name,
          description: newCampaignDescription.trim(),
          defaultSystemId: newCampaignSystemId,
          visibility: newCampaignVisibility,
          permissionTemplate: setupPermissionTemplate,
          starterContent: setupStarterContent
        }, { signal: controller.signal, idempotencyKey: setupIdempotencyKeys.campaign });
        if (!setupRequestIsCurrent()) return;
        progress = { key: progressKey, organizationId: activeOrganizationId, userId: currentUserId, campaign, draftScopeCampaignId: currentCampaignSetupDraftScope()?.campaignId, onboardingCreated: setupStarterContent };
        campaignSetupProgressRef.current = progress;
        persistCampaignSetupDraft(progress);
      } else {
        setStatus(`Continuing ${progress.campaign.name} setup`);
      }
      const campaign = progress.campaign;
      if (!setupStarterContent && !progress.scene) {
        const scenePayload = {
          name: sceneName,
          folder: setupSceneFolder.trim() || undefined,
          width: Math.max(200, setupSceneWidth),
          height: Math.max(200, setupSceneHeight),
          gridType: setupSceneGridType,
          ...(setupSceneGridType === "square" ? { gridSize: Math.max(10, setupSceneGridSize) } : {}),
          active: true,
          sortOrder: 1,
          expectedUpdatedAt: campaign.updatedAt
        };
        const scene = await apiPost<Scene>(`/api/v1/campaigns/${campaign.id}/scenes`, scenePayload, { signal: controller.signal, idempotencyKey: setupIdempotencyKeys.scene });
        if (!setupRequestIsCurrent()) return;
        progress.scene = scene;
        progress.campaign = await apiGet<Campaign>(`/api/v1/campaigns/${campaign.id}`, { signal: controller.signal });
        persistCampaignSetupDraft(progress);
      }
      const onboardingBody = setupOnboardingBody.trim();
      if (!setupStarterContent && !progress.onboardingCreated) {
        if (onboardingBody) {
          await apiPost<JournalEntry>(`/api/v1/campaigns/${campaign.id}/journal`, {
            title: setupOnboardingTitle.trim() || "Welcome to the Table",
            body: onboardingBody,
            visibility: "public",
            tags: ["onboarding", "setup"]
          }, { signal: controller.signal, idempotencyKey: setupIdempotencyKeys.journal });
          if (!setupRequestIsCurrent()) return;
        }
        progress.onboardingCreated = true;
        persistCampaignSetupDraft(progress);
      }
      if (setupInviteEnabled && !progress.invite) {
        const inviteEmailDraft = setupInviteEmail.trim();
        const inviteRoleDraft = setupInviteRole;
        progress.inviteEmail = inviteEmailDraft;
        progress.inviteRole = inviteRoleDraft;
        persistCampaignSetupDraft(progress);
        if (progress.inviteRequestStarted) {
          const invites = await loadOrganizationInvites();
          if (!setupRequestIsCurrent()) return;
          setSnapshot((current) => ({ ...current, organizationInvites: invites }));
          progress.inviteCreatedWithoutLink = invites.some((invite) => (
            invite.campaign.id === campaign.id
            && invite.status === "pending"
            && (invite.email ?? "") === inviteEmailDraft.trim().toLowerCase()
            && invite.role === inviteRoleDraft
            && invite.createdAt >= campaign.createdAt
          ));
          persistCampaignSetupDraft(progress);
        }
        if (!progress.inviteCreatedWithoutLink) {
          progress.inviteRequestStarted = true;
          persistCampaignSetupDraft(progress);
          const invite = await apiPost<InviteCreateInfo>(`/api/v1/campaigns/${campaign.id}/invites`, {
            email: inviteEmailDraft || undefined,
            role: inviteRoleDraft
          }, { signal: controller.signal, idempotencyKey: setupIdempotencyKeys.invite });
          if (!setupRequestIsCurrent()) return;
          progress.invite = invite;
          persistCampaignSetupDraft(progress);
        }
      }
      const setupInvite = progress.invite;
      const hasSetupInvite = Boolean(setupInvite || progress.inviteCreatedWithoutLink);
      const targetDraftScope = { organizationId: activeOrganizationId, userId: currentUserId, campaignId: campaign.id } satisfies CampaignSetupDraftScope;
      saveCampaignSetupDraft(window.localStorage, targetDraftScope, currentCampaignSetupDraft(progress));
      selectWorkspaceContext(campaign.id, progress.scene?.id ?? "", currentUserId, { preserveCampaignSetup: true });
      campaignSetupProgressRef.current = progress;
      if (setupInvite) {
        focusInviteLinkAfterSetupRef.current = true;
        setInviteToken(setupInvite.token);
        setInviteAcceptUrl(absoluteInviteUrl(setupInvite.acceptUrl));
        setInviteEmail(progress.inviteEmail ?? "");
        setInviteRole(progress.inviteRole ?? "player");
      }
      const refreshed = await refresh(campaign.id, progress.scene?.id ?? "", { syncStatus: false });
      if (!setupRequestIsCurrent()) return;
      const starterScene = setupStarterContent ? refreshed.scenes.find((scene) => scene.name === "First Session" && scene.active) ?? refreshed.scenes.find((scene) => scene.active) : progress.scene;
      if (starterScene) {
        realtimeSelectionRef.current = { ...realtimeSelectionRef.current, sceneId: starterScene.id };
        setSceneId(starterScene.id);
      }
      if (hasSetupInvite) {
        setManageCategory("people");
        setWorkspaceMode("manage");
      } else {
        resetWorkspaceNavigation("prep", setupStarterContent ? "sessions" : "content");
      }
      clearCampaignSetupDraftScopes(progress);
      campaignSetupProgressRef.current = null;
      campaignSetupIdempotencyRef.current = null;
      resetCampaignSetupDraft();
      setCampaignSetupDirty(false);
      const permissionSummary = setupPermissionTemplate === "standard" ? "" : `; ${selectedPermissionTemplate.label} permissions applied`;
      const createdWith = starterScene ? ` with ${starterScene.name}` : "";
      setStatus(progress.inviteCreatedWithoutLink
        ? `${campaign.name} created${createdWith}; invite exists but its one-time link could not be recovered - revoke it and create a new invite${permissionSummary}`
        : setupInvite
          ? `${campaign.name} created${createdWith}; invite link ready to copy${permissionSummary}`
          : `${campaign.name} created${createdWith}; opened session prep${permissionSummary}`);
      if (!setupInvite) window.requestAnimationFrame(() => workspaceModeButtonRefs.current[hasSetupInvite ? "manage" : "prep"]?.focus());
    } catch (error) {
      if (isAbortError(error)) return;
      throw error;
    } finally {
      if (campaignSetupAbortRef.current === controller) campaignSetupAbortRef.current = null;
      if (campaignSetupGenerationRef.current === requestGeneration) {
        campaignSetupBusyRef.current = false;
        setIsCreatingCampaignSetup(false);
        setCampaignSetupRecoveryPending(Boolean(campaignSetupProgressRef.current));
      }
    }
  }

  async function saveCampaignSettings() {
    if (!selectedCampaign) return;
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedCampaign.id) ?? selectedCampaign;
    const payload = {
      name: campaignEditName.trim() || targetCampaign.name,
      description: campaignEditDescription.trim(),
      defaultSystemId: campaignEditSystemId,
      visibility: campaignEditVisibility,
      expectedUpdatedAt: targetCampaign.updatedAt
    };
    const campaign = await runSharedMutation(() => apiPatch<Campaign>(`/api/v1/campaigns/${targetCampaign.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`campaign:update:${targetCampaign.id}`, targetCampaign.updatedAt, payload) }), targetCampaign.id, sceneId);
    setStatus(`${campaign.name} updated`);
    await refresh(campaign.id, sceneId);
  }

  async function archiveSelectedCampaign() {
    if (!selectedCampaign) return;
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedCampaign.id) ?? selectedCampaign;
    const payload = { reason: "Archived from campaign settings", expectedUpdatedAt: targetCampaign.updatedAt };
    const campaign = await runSharedMutation(() => apiPost<Campaign>(`/api/v1/campaigns/${targetCampaign.id}/archive`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`campaign:archive:${targetCampaign.id}`, targetCampaign.updatedAt, payload) }), targetCampaign.id, sceneId);
    setStatus(`${campaign.name} archived`);
    await refresh(campaign.id, sceneId);
  }

  async function restoreSelectedCampaign() {
    if (!selectedCampaign) return;
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedCampaign.id) ?? selectedCampaign;
    const payload = { reason: "Restored from campaign settings", expectedUpdatedAt: targetCampaign.updatedAt };
    const campaign = await runSharedMutation(() => apiPost<Campaign>(`/api/v1/campaigns/${targetCampaign.id}/restore`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`campaign:restore:${targetCampaign.id}`, targetCampaign.updatedAt, payload) }), targetCampaign.id, sceneId);
    setStatus(`${campaign.name} restored`);
    await refresh(campaign.id, sceneId);
  }

  async function duplicateSelectedCampaign(idempotencyKey: string): Promise<void> {
    if (!selectedCampaign || campaignDuplicateBusy) return;
    const duplicateName = campaignDuplicateName.trim();
    if (!duplicateName) {
      setCampaignDuplicateError("Enter a name for the duplicated campaign.");
      return;
    }
    const sourceCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedCampaign.id) ?? selectedCampaign;
    setCampaignDuplicateBusy(true);
    setCampaignDuplicateError("");
    setStatus(`Duplicating ${sourceCampaign.name}`);
    try {
      const result = await apiPost<{ campaign: Campaign }>(`/api/v1/campaigns/${sourceCampaign.id}/duplicate`, {
        name: duplicateName,
        expectedUpdatedAt: sourceCampaign.updatedAt
      }, { idempotencyKey });
      const duplicatedCampaignId = result.campaign.id;
      selectWorkspaceContext(duplicatedCampaignId, "");
      await refresh(duplicatedCampaignId, "", { syncStatus: false });
      setWorkspaceMode("prep");
      setTab("sessions");
      setStatus(`${duplicateName} duplicated and opened in Prep`);
    } catch (failure) {
      const message = errorMessage(failure);
      setCampaignDuplicateError(message);
      setStatus(`Campaign duplication failed: ${message}`);
      throw failure;
    } finally {
      setCampaignDuplicateBusy(false);
    }
  }

  async function deleteSelectedCampaign() {
    if (!selectedCampaign || campaignDeleteConfirm !== selectedCampaign.name) return;
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedCampaign.id) ?? selectedCampaign;
    const nextCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id !== targetCampaign.id);
    await runSharedMutation(() => apiDelete<Campaign>(`/api/v1/campaigns/${targetCampaign.id}?expectedUpdatedAt=${encodeURIComponent(targetCampaign.updatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`campaign:delete:${targetCampaign.id}`, targetCampaign.updatedAt, {}) }), targetCampaign.id, sceneId);
    setCampaignDeleteConfirm("");
    setStatus(`${selectedCampaign.name} deleted; audit logged`);
    selectWorkspaceContext(nextCampaign?.id ?? "", "");
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

  async function createScene(options: { insertBeforeScene?: Scene; active?: boolean } = {}) {
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before creating another scene");
      return;
    }
    const request = currentWorkspaceRequestIdentity();
    const submittedName = newSceneName;
    const name = submittedName.trim();
    const gridSize = Math.max(10, normalizeSceneSizeValue(newSceneGridSize, 50));
    const insertBeforeScene = options.insertBeforeScene;
    const insertBeforeIndex = insertBeforeScene ? orderedScenes.findIndex((scene) => scene.id === insertBeforeScene.id) : -1;
    const previousScene = insertBeforeIndex > 0 ? orderedScenes[insertBeforeIndex - 1] : undefined;
    const sortOrder = insertBeforeScene && insertBeforeIndex >= 0
      ? previousScene && previousScene.sortOrder < insertBeforeScene.sortOrder
        ? previousScene.sortOrder + (insertBeforeScene.sortOrder - previousScene.sortOrder) / 2
        : insertBeforeScene.sortOrder - 1
      : (orderedScenes.at(-1)?.sortOrder ?? 0) + 1;
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === request.campaignId);
    if (!targetCampaign) throw new Error("Campaign is unavailable. Refresh and try again.");
    const payload = {
      name: name || `Scene ${snapshot.scenes.length + 1}`,
      folder: newSceneFolder.trim() || undefined,
      width: Math.max(200, normalizeSceneSizeValue(newSceneWidth, 1200)),
      height: Math.max(200, normalizeSceneSizeValue(newSceneHeight, 800)),
      gridType: newSceneGridType,
      ...(newSceneGridType === "square" ? { gridSize } : {}),
      backgroundAssetId: newSceneBackgroundAssetId || undefined,
      active: (options.active ?? newSceneActive) || snapshot.scenes.length === 0,
      sortOrder,
      expectedUpdatedAt: targetCampaign.updatedAt
    };
    const scene = await runSharedMutation(() => apiPost<Scene>(`/api/v1/campaigns/${request.campaignId}/scenes`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:create:${request.campaignId}`, targetCampaign.updatedAt, payload) }), request.campaignId, sceneId);
    if (!workspaceIdentityIsCurrent(request)) return;
    setSceneId(scene.id);
    setNewSceneName((current) => current === submittedName ? "" : current);
    setNewSceneActive(false);
    setStatus(`${scene.name} created`);
    await refresh(request.campaignId, scene.id);
  }

  async function saveSceneSettings(form?: HTMLFormElement) {
    if (!selectedScene) return;
    const targetScene = selectedScene;
    const targetCampaignId = campaignId;
    const draftName = sceneFormValue(form, "sceneEditName", sceneEditName);
    const draftFolder = sceneFormValue(form, "sceneEditFolder", sceneEditFolder);
    const draftWidth = Number(sceneFormValue(form, "sceneEditWidth", String(sceneEditWidth)));
    const draftHeight = Number(sceneFormValue(form, "sceneEditHeight", String(sceneEditHeight)));
    const draftGridType = normalizeSceneGridType(sceneFormValue(form, "sceneEditGridType", sceneEditGridType));
    const draftGridSize = Number(sceneFormValue(form, "sceneEditGridSize", String(sceneEditGridSize)));
    const draftBackgroundAssetId = sceneFormValue(form, "sceneEditBackgroundAssetId", sceneEditBackgroundAssetId);
    const draftActive = sceneFormChecked(form, "sceneEditActive", sceneEditActive);
    const draftGridOverlayVisible = sceneFormChecked(form, "sceneEditGridOverlayVisible", sceneEditGridOverlayVisible);
    const normalizedDraftGridSize = Math.max(10, normalizeSceneSizeValue(draftGridSize, targetScene.gridSize));
    const mapConfiguration = { backgroundAssetId: draftBackgroundAssetId || null, gridType: draftGridType, gridSize: normalizedDraftGridSize, width: Math.max(200, normalizeSceneSizeValue(draftWidth, targetScene.width)), height: Math.max(200, normalizeSceneSizeValue(draftHeight, targetScene.height)) };
    const mapConfigurationChanged = sceneMapConfigurationChanged(targetScene, mapConfiguration);

    const payload = {
      name: draftName.trim() || targetScene.name,
      folder: draftFolder.trim() || null,
      width: mapConfiguration.width,
      height: mapConfiguration.height,
      gridType: draftGridType,
      ...(draftGridType === "square" ? { gridSize: normalizedDraftGridSize } : {}),
      backgroundAssetId: draftBackgroundAssetId || null,
      active: draftActive,
      metadata: sceneMapConfigurationMetadata(targetScene, mapConfiguration, draftGridOverlayVisible),
      expectedUpdatedAt: targetScene.updatedAt
    };
    const scene = await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:update:${targetScene.id}`, targetScene.updatedAt, payload) }), targetCampaignId, targetScene.id);
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
    setSceneEditGridType(normalizeSceneGridType(scene.gridType));
    setSceneEditGridSize(scene.gridSize);
    setSceneEditActive(scene.active);
    setSceneEditBackgroundAssetId(scene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(scene));
    setSceneDuplicateName(`${scene.name} Copy`);
    if (mapConfigurationChanged) finishSceneBackgroundChange(scene, snapshotRef.current.assets.find((asset) => asset.id === scene.backgroundAssetId)?.name ?? "Scene map", { navigateToPrep: false }); else setStatus(`${scene.name} updated`);
    await refresh(targetCampaignId, scene.id, { syncStatus: false });
  }

  async function applySceneGridCalibration(gridSize: number): Promise<void> {
    if (!selectedScene) throw new Error("Select a scene before calibrating its grid.");
    const targetScene = currentSceneForMutation(selectedScene);
    if (targetScene.gridType === "gridless") throw new Error("Grid calibration is only available for square-grid scenes.");
    const calibratedSize = Math.max(10, Math.min(500, Math.round(gridSize * 100) / 100));
    await runWorkspaceBoundAction(
      (request) => {
        const payload = {
        gridType: "square",
        gridSize: calibratedSize,
        metadata: {
          ...targetScene.metadata,
          gridOverlayVisible: true,
          mapCalibrationComplete: Boolean(targetScene.backgroundAssetId),
          mapCalibrationCompletedAt: new Date().toISOString()
        },
        expectedUpdatedAt: targetScene.updatedAt
        };
        return apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`scene:grid-calibration:${targetScene.id}`, targetScene.updatedAt, payload) });
      },
      (scene) => {
        applySceneToSnapshot(scene);
        setGridCalibrationPoints([]);
        setStatus(`${scene.name} grid calibrated to ${formatNumber(scene.gridSize)} px`);
      }
    );
  }

  function discardSceneEdits() {
    if (!selectedScene) return;
    setSceneEditName(selectedScene.name);
    setSceneEditFolder(selectedScene.folder ?? "");
    setSceneEditWidth(selectedScene.width);
    setSceneEditHeight(selectedScene.height);
    setSceneEditGridType(normalizeSceneGridType(selectedScene.gridType));
    setSceneEditGridSize(selectedScene.gridSize);
    setSceneEditActive(selectedScene.active);
    setSceneEditBackgroundAssetId(selectedScene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(selectedScene));
    setSceneEditDirty(false);
    setStatus("Unsaved scene changes discarded");
  }

  async function moveVisibleScenesToFolder() {
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before moving scenes");
      return;
    }
    if (visibleScenes.length === 0) {
      setStatus("No visible scenes to move");
      return;
    }
    const folder = bulkSceneFolder.trim();
    const nextSceneId = selectedScene?.id ?? visibleScenes[0]?.id ?? "";
    for (const scene of visibleScenes) {
      const payload = { folder: folder || null, expectedUpdatedAt: scene.updatedAt };
      await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:folder:${scene.id}`, scene.updatedAt, payload) }), scene.campaignId, scene.id);
    }
    setSceneFolderFilter(folder || "all");
    setSceneSearch("");
    setStatus(`Moved ${visibleScenes.length} visible scenes to ${folder || "Unfiled"}`);
    await refresh(campaignId, nextSceneId);
  }

  function togglePrepSceneSelection(sceneIdToToggle: string, checked: boolean) {
    setSceneDuplicationReview(undefined);
    setSelectedPrepSceneIds((current) => {
      if (checked) return current.includes(sceneIdToToggle) ? current : [...current, sceneIdToToggle];
      return current.filter((id) => id !== sceneIdToToggle);
    });
  }

  function selectVisiblePrepScenes() {
    const nextIds = visibleScenes.map((scene) => scene.id);
    setSceneDuplicationReview(undefined);
    setSelectedPrepSceneIds(nextIds);
    setStatus(`Selected ${nextIds.length} visible scenes`);
  }

  function clearPrepSceneSelection() {
    setSceneDuplicationReview(undefined);
    setSelectedPrepSceneIds([]);
    setStatus("Cleared scene selection");
  }

  async function moveSelectedPrepScenesToFolder() {
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before moving scenes");
      return;
    }
    if (selectedPrepScenes.length === 0) {
      setStatus("No selected scenes to move");
      return;
    }
    const folder = bulkSceneFolder.trim();
    const nextSceneId = selectedScene?.id ?? selectedPrepScenes[0]?.id ?? "";
    for (const scene of selectedPrepScenes) {
      const payload = { folder: folder || null, expectedUpdatedAt: scene.updatedAt };
      await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${scene.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:folder:${scene.id}`, scene.updatedAt, payload) }), scene.campaignId, scene.id);
    }
    setSceneFolderFilter(folder || "all");
    setSceneSearch("");
    setSelectedPrepSceneIds(selectedPrepScenes.map((scene) => scene.id));
    setStatus(`Moved ${selectedPrepScenes.length} selected scenes to ${folder || "Unfiled"}`);
    await refresh(campaignId, nextSceneId);
  }

  async function duplicateSelectedPrepScenes() {
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before duplicating scenes");
      return;
    }
    if (selectedPrepScenes.length === 0) {
      setStatus("No selected scenes to duplicate");
      return;
    }
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === campaignId);
    if (!targetCampaign) throw new Error("Campaign is unavailable. Refresh and try again.");
    const currentSources = selectedPrepScenes.map((scene) => snapshotRef.current.scenes.find((candidate) => candidate.id === scene.id && candidate.campaignId === campaignId));
    if (currentSources.some((scene) => !scene)) throw new Error("A selected scene is unavailable. Refresh and try again.");
    const operationId = `scene-duplication:${window.crypto.randomUUID()}`;
    const request: SceneDuplicationRequest = {
      operationId,
      expectedUpdatedAt: targetCampaign.updatedAt,
      sources: currentSources.map((scene) => ({ sceneId: scene!.id, expectedUpdatedAt: scene!.updatedAt })),
    };
    setSceneDuplicationBusy(true);
    try {
      const result = await runSharedMutation(
        () => apiPost<SceneDuplicationResult>(`/api/v1/campaigns/${campaignId}/scene-duplications`, { ...request, dryRun: true }, { idempotencyKey: `${operationId}:preview` }),
        campaignId,
        selectedScene?.id,
      );
      setSceneDuplicationReview({ request, plan: result.plan });
      setStatus(`Reviewed ${result.plan.counts.scenes} scene copies and ${result.plan.skippedReferences.length} skipped references`);
    } finally {
      setSceneDuplicationBusy(false);
    }
  }

  async function confirmSelectedPrepSceneDuplication() {
    if (!sceneDuplicationReview || sceneDuplicationBusy) return;
    const { request } = sceneDuplicationReview;
    setSceneDuplicationBusy(true);
    try {
      const result = await runSharedMutation(
        () => apiPost<SceneDuplicationResult>(`/api/v1/campaigns/${campaignId}/scene-duplications`, { ...request, dryRun: false }, { idempotencyKey: `${request.operationId}:commit` }),
        campaignId,
        selectedScene?.id,
      );
      const nextScene = result.scenes.at(-1);
      setSceneFolderFilter("all");
      setSceneSearch("");
      setSelectedPrepSceneIds(result.scenes.map((scene) => scene.id));
      setSceneDuplicationReview(undefined);
      if (nextScene) setSceneId(nextScene.id);
      setStatus(`Duplicated ${result.plan.counts.scenes} scenes, ${result.plan.counts.tokens} tokens, and ${result.plan.counts.actors} actors atomically`);
      await refresh(campaignId, nextScene?.id ?? selectedScene?.id ?? sceneId);
    } finally {
      setSceneDuplicationBusy(false);
    }
  }

  function renderSceneDuplicationReview() {
    if (!sceneDuplicationReview) return null;
    const sceneCopies = sceneDuplicationReview.plan.copies.filter((copy) => copy.collection === "scenes");
    return (
      <section className="asset-pressure-list" aria-label="Scene duplication review">
        <div className="operator-row tool-call-row">
          <span>Atomic copy plan</span>
          <strong>{formatNumber(sceneDuplicationReview.plan.counts.scenes)} scenes / {formatNumber(sceneDuplicationReview.plan.counts.tokens)} tokens / {formatNumber(sceneDuplicationReview.plan.counts.actors)} actors</strong>
        </div>
        <ul aria-label="Planned scene copies">
          {sceneCopies.map((copy) => <li key={copy.targetId}>{copy.sourceName ?? copy.sourceId} to {copy.targetName ?? copy.targetId}</li>)}
        </ul>
        {sceneDuplicationReview.plan.skippedReferences.length > 0 && (
          <>
            <p className="account-summary">Skipped references are left unchanged:</p>
            <ul aria-label="Skipped scene duplication references">
              {sceneDuplicationReview.plan.skippedReferences.map((reference) => <li key={`${reference.collection}:${reference.id}`}>{reference.collection} {reference.id}: {reference.reason.replaceAll("_", " ")}</li>)}
            </ul>
          </>
        )}
        <div className="button-row">
          <button className="ghost-button" type="button" disabled={sceneDuplicationBusy} onClick={() => confirmSelectedPrepSceneDuplication().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
            Confirm duplicate selected scenes
          </button>
          <button className="ghost-button" type="button" disabled={sceneDuplicationBusy} onClick={() => setSceneDuplicationReview(undefined)}>
            Cancel duplication
          </button>
        </div>
      </section>
    );
  }

  async function moveSelectedScene(direction: "up" | "down") {
    if (!selectedScene) return;
    const currentIndex = orderedScenes.findIndex((scene) => scene.id === selectedScene.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetScene = orderedScenes[targetIndex];
    if (currentIndex < 0 || !targetScene) return;
    const targetPayload = { sortOrder: currentIndex + 1, expectedUpdatedAt: targetScene.updatedAt };
    await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, targetPayload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:sort:${targetScene.id}`, targetScene.updatedAt, targetPayload) }), campaignId, targetScene.id);
    const selectedPayload = { sortOrder: targetIndex + 1, expectedUpdatedAt: selectedScene.updatedAt };
    const scene = await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, selectedPayload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:sort:${selectedScene.id}`, selectedScene.updatedAt, selectedPayload) }), campaignId, selectedScene.id);
    setStatus(`${scene.name} moved ${direction}`);
    await refresh(campaignId, scene.id);
  }

  async function activateSelectedScene() {
    if (!selectedScene) return;
    const payload = { active: true, expectedUpdatedAt: selectedScene.updatedAt };
    const scene = await runSharedMutation(() => apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`scene:activate:${selectedScene.id}`, selectedScene.updatedAt, payload) }), campaignId, selectedScene.id);
    applySceneToSnapshot(scene);
    setSceneId(scene.id);
    setSceneEditActive(true);
    setStatus(`${scene.name} activated`);
    await refresh(campaignId, scene.id);
  }

  async function duplicateSelectedScene() {
    if (!selectedScene || sceneDuplicationBusy) return;
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before duplicating this scene");
      return;
    }
    const targetCampaign = snapshotRef.current.campaigns.find((campaign) => campaign.id === selectedScene.campaignId);
    if (!targetCampaign) throw new Error("Campaign is unavailable. Refresh and try again.");
    const sourceScene = snapshotRef.current.scenes.find((scene) => scene.id === selectedScene.id) ?? selectedScene;
    const operationId = `scene-duplication:${window.crypto.randomUUID()}`;
    const request: SceneDuplicationRequest = {
      operationId,
      expectedUpdatedAt: targetCampaign.updatedAt,
      sources: [{
        sceneId: sourceScene.id,
        expectedUpdatedAt: sourceScene.updatedAt,
        name: sceneDuplicateName.trim() || `${sourceScene.name} Copy`,
      }],
    };
    setSceneDuplicationBusy(true);
    try {
      const result = await runSharedMutation(
        () => apiPost<SceneDuplicationResult>(`/api/v1/campaigns/${sourceScene.campaignId}/scene-duplications`, request, { idempotencyKey: `${operationId}:commit` }),
        campaignId,
        sourceScene.id,
      );
      const scene = result.scenes[0];
      if (!scene) throw new Error("Scene duplication completed without returning the copied scene.");
      setSceneId(scene.id);
      setSceneDuplicateName(`${scene.name} Copy`);
      setStatus(`${scene.name} duplicated with its scene graph`);
      await refresh(campaignId, scene.id);
    } finally {
      setSceneDuplicationBusy(false);
    }
  }

  async function deleteScene(targetScene: Scene) {
    const previousSceneId = sceneId;
    const deletingSelectedScene = targetScene.id === selectedScene?.id || targetScene.id === sceneId;
    const nextScene = accessibleScenes.find((scene) => scene.id !== targetScene.id);
    const nextSceneId = deletingSelectedScene ? nextScene?.id ?? "" : previousSceneId;
    setSceneDeleteConfirm("");
    if (deletingSelectedScene) setSceneEditDirty(false);
    setSelectedPrepSceneIds((current) => current.filter((id) => id !== targetScene.id));
    setSceneId(nextSceneId);
    if (deletingSelectedScene && nextScene) {
      setSceneEditName(nextScene.name);
      setSceneEditFolder(nextScene.folder ?? "");
      setSceneEditWidth(nextScene.width);
      setSceneEditHeight(nextScene.height);
      setSceneEditGridType(normalizeSceneGridType(nextScene.gridType));
      setSceneEditGridSize(nextScene.gridSize);
      setSceneEditActive(nextScene.active);
      setSceneEditBackgroundAssetId(nextScene.backgroundAssetId ?? "");
      setSceneEditGridOverlayVisible(sceneGridOverlayVisible(nextScene));
      setSceneDuplicateName(`${nextScene.name} Copy`);
    }
    try {
      await runSharedMutation(() => apiDelete<Scene>(`/api/v1/scenes/${targetScene.id}?expectedUpdatedAt=${encodeURIComponent(targetScene.updatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`scene:delete:${targetScene.id}`, targetScene.updatedAt, {}) }), campaignId, targetScene.id);
      await refresh(campaignId, nextSceneId, { syncStatus: false });
      setStatus(targetScene.active && nextScene ? `${targetScene.name} deleted; ${nextScene.name} is now live` : `${targetScene.name} deleted; audit logged`);
    } catch (error) {
      setSceneId(previousSceneId);
      await refresh(campaignId, previousSceneId, { syncStatus: false }).catch(() => undefined);
      throw error;
    }
  }

  function openSceneDeleteReview(targetScene: Scene) {
    if (accessibleScenes.length <= 1) {
      setStatus("Keep at least one scene in the campaign");
      return;
    }
    if (sceneEditDirty) {
      setStatus("Save or discard scene changes before reviewing a deletion");
      return;
    }
    setSceneId(targetScene.id);
    setSceneDeleteConfirm("");
    setManageCategory("scenes");
    setWorkspaceMode("manage");
    setStatus(`Review ${targetScene.name} before deleting it`);
  }
  async function createToken(options: Partial<TokenDropPayload> & { x?: number; y?: number; width?: number; height?: number; idempotencyKey?: string; targetSceneRevision?: Scene; onSceneRevision?(scene: Scene): void } = {}, existingRequest?: WorkspaceBoundRequest): Promise<Token | undefined> {
    if (!selectedScene && !options.targetSceneRevision) return;
    const targetScene = options.targetSceneRevision ?? snapshotRef.current.scenes.find((scene) => scene.id === selectedScene?.id) ?? selectedScene!;
    const actorId = (options.actorId ?? newTokenActorId) || undefined;
    const actor = actorId ? snapshot.actors.find((item) => item.id === actorId) : undefined;
    const imageAssetId = options.imageAssetId;
    const footprintCells = Math.max(1, newTokenFootprintCells || 1);
    const width = options.width ?? targetScene.gridSize * footprintCells;
    const height = options.height ?? targetScene.gridSize * footprintCells;
    const centerX = options.x ?? targetScene.width / 2;
    const centerY = options.y ?? targetScene.height / 2;
    const position = tokenCoordinatesFromCenter(targetScene, width, height, centerX, centerY);
    const layer = options.layer ?? activeTokenLayer;
    const tokenName = options.name?.trim() || actor?.name || newTokenName.trim() || "New Token";
    const disposition = options.disposition ?? (actor ? "friendly" : newTokenDisposition);
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const token: Token = {
        id: nextBlankCanvasDemoId("tok_demo"),
        sceneId: targetScene.id,
        actorId,
        imageAssetId,
        name: tokenName,
        x: position.x,
        y: position.y,
        width,
        height,
        rotation: 0,
        elevation: 0,
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
      return token;
    }
    const createPayload = {
        actorId,
        imageAssetId,
        name: tokenName,
        x: position.x,
        y: position.y,
        width,
        height,
        layer,
        disposition,
        expectedUpdatedAt: targetScene.updatedAt
      };
    const create = async (request: WorkspaceBoundRequest) => {
      const token = await apiPost<Token>(`/api/v1/scenes/${targetScene.id}/tokens`, createPayload, { signal: request.controller.signal, idempotencyKey: options.idempotencyKey ?? sharedMutationIdempotencyKey(`token:create:${targetScene.id}`, targetScene.updatedAt, createPayload) });
      const scene = await apiGet<Scene>(`/api/v1/scenes/${targetScene.id}`, { signal: request.controller.signal });
      return { token, scene };
    };
    const applyCreatedToken = (token: Token, request: WorkspaceBoundRequest) => {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      applyTokensToSnapshot([token]);
      pushBoardHistoryAction({ kind: "tokens.create", tokens: [token] });
      setActiveTokenLayer(layer);
      selectSingleToken(token.id);
      setNewTokenName("");
      setNewTokenActorId("");
      setStatus(`${token.name} ${options.x !== undefined || options.y !== undefined ? "placed on scene" : "created"}`);
    };
    if (existingRequest) {
      if (!workspaceBoundRequestIsCurrent(existingRequest)) return;
      const createdResult = await create(existingRequest);
      options.onSceneRevision?.(createdResult.scene); applySceneToSnapshot(createdResult.scene);
      applyCreatedToken(createdResult.token, existingRequest);
      return workspaceBoundRequestIsCurrent(existingRequest) ? createdResult.token : undefined;
    }
    let created: Token | undefined;
    await runWorkspaceBoundAction(create, (result, request) => {
      options.onSceneRevision?.(result.scene); applySceneToSnapshot(result.scene);
      applyCreatedToken(result.token, request);
      created = result.token;
    });
    return created;
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
  async function placeActorOnSelectedScene(actor: Actor, placementAttemptId: string): Promise<void> {
    if (!selectedScene) throw new Error("Select a scene before placing an actor.");
    const existingToken = snapshot.tokens.find((token) => token.sceneId === selectedScene.id && token.actorId === actor.id && tokenLayer(token) !== "map");
    if (existingToken) {
      setActiveTokenLayer(tokenLayer(existingToken));
      selectSingleToken(existingToken.id);
      setStatus(`${actor.name} is already on ${selectedScene.name}`);
      return;
    }
    const partyTokenCount = snapshot.tokens.filter((token) => token.sceneId === selectedScene.id && token.disposition === "friendly" && tokenLayer(token) !== "map").length;
    const spacing = Math.max(24, selectedScene.gridSize || 50);
    const column = partyTokenCount % 4;
    const row = Math.floor(partyTokenCount / 4) % 3;
    const token = await createToken({
      actorId: actor.id,
      name: actor.name,
      disposition: "friendly",
      layer: "player",
      x: selectedScene.width * 0.35 + column * spacing,
      y: selectedScene.height * 0.65 + row * spacing,
      idempotencyKey: `actor-place:${selectedScene.id}:${actor.id}:${placementAttemptId}`
    });
    if (!token) throw new Error(`${actor.name} could not be placed on the selected scene.`);
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
    const targetSceneId = payload.sceneId ?? selectedScene?.id;
    if (payload.error) {
      await runWorkspaceBoundAction(
        (request) => apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: payload.error, sceneId: targetSceneId }, { signal: request.controller.signal }),
        () => setAiAgentStatus("Board capture unavailable")
      );
      return;
    }
    const board = document.querySelector<HTMLElement>('[data-agent-board-root="true"]') ?? document.querySelector<HTMLElement>(".scene-board");
    if (!board) {
      await runWorkspaceBoundAction(
        (request) => apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: "No board element is mounted in the current web client.", sceneId: targetSceneId }, { signal: request.controller.signal }),
        () => setAiAgentStatus("Board capture unavailable")
      );
      return;
    }
    await runWorkspaceBoundAction(
      async (request) => {
        setAiAgentStatus("Capturing board view");
        try {
          const { toPng } = await import("html-to-image");
          const pixelRatio = boundedBoardCapturePixelRatio(board.offsetWidth, board.offsetHeight, window.devicePixelRatio || 1);
          const dataUrl = await toPng(board, {
            cacheBust: false,
            pixelRatio,
            backgroundColor: "#060a0f"
          });
          if (!workspaceBoundRequestIsCurrent(request)) return "stale" as const;
          await apiPost(`/api/v1/agent/board-captures/${requestId}`, {
            dataUrl,
            sceneId: targetSceneId,
            width: Math.round(board.offsetWidth),
            height: Math.round(board.offsetHeight)
          }, { signal: request.controller.signal });
          return "sent" as const;
        } catch (error) {
          if (!workspaceBoundRequestIsCurrent(request)) return "stale" as const;
          await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: errorMessage(error), sceneId: targetSceneId }, { signal: request.controller.signal });
          return "failed" as const;
        }
      },
      (result) => {
        if (result === "sent") setAiAgentStatus("Board capture sent");
        if (result === "failed") setAiAgentStatus("Board capture failed");
      }
    );
  }

  async function placeCanvasAssetTokens(asset: MapAsset, requestedCount: number) {
    if (!selectedScene) return;
    const targetScene = selectedScene;
    const count = Math.max(1, Math.min(6, Math.round(requestedCount) || 1));
    const footprintCells = Math.max(1, newTokenFootprintCells || 1);
    const width = targetScene.gridSize * footprintCells;
    const height = targetScene.gridSize * footprintCells;
    const spacing = width + 12;
    await runWorkspaceBoundAction(
      async (request) => {
        let lastToken: Token | undefined;
        let sceneRevision = await apiGet<Scene>(`/api/v1/scenes/${targetScene.id}`, { signal: request.controller.signal });
        for (let index = 0; index < count; index += 1) {
          const offset = (index - (count - 1) / 2) * spacing;
          const centerX = targetScene.width / 2 + offset;
          const centerY = targetScene.height / 2;
          const position = tokenCoordinatesFromCenter(targetScene, width, height, centerX, centerY);
          const payload = {
            imageAssetId: asset.id,
            name: asset.name,
            x: position.x,
            y: position.y,
            width,
            height,
            layer: "map",
            disposition: "neutral",
            expectedUpdatedAt: sceneRevision.updatedAt
          };
          lastToken = await apiPost<Token>(`/api/v1/scenes/${targetScene.id}/tokens`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:create:asset:${targetScene.id}:${index}`, sceneRevision.updatedAt, payload) });
          sceneRevision = await apiGet<Scene>(`/api/v1/scenes/${targetScene.id}`, { signal: request.controller.signal });
        }
        return lastToken;
      },
      async (lastToken, request) => {
        await refresh(request.campaignId, targetScene.id, { syncStatus: false });
        if (!workspaceBoundRequestIsCurrent(request)) return;
        if (lastToken) selectSingleToken(lastToken.id);
        setStatus(count === 1 ? `${asset.name} placed on scene` : `Placed ${count} ${asset.name} tokens`);
      }
    );
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

  function updateArchiveExportCollection(collection: ArchiveExportCollection, checked: boolean) {
    setArchiveExportCollections((current) => {
      const next = checked ? [...new Set([...current, collection])] : current.filter((item) => item !== collection);
      return next.length > 0 ? next : current;
    });
  }

  async function loadArchiveImportOperations(targetCampaignId = campaignId) {
    if (!targetCampaignId || blankCanvasDemoOpen) return;
    const result = await apiGet<{ items: ArchiveImportOperationSummary[] }>(`/api/v1/campaigns/${targetCampaignId}/archive-import-operations`);
    if (realtimeSelectionRef.current.campaignId !== targetCampaignId) return;
    setArchiveImportOperations(result.items);
    setSelectedArchiveImportOperationId((current) => result.items.some((operation) => operation.id === current) ? current : (result.items[0]?.id ?? ""));
  }

  async function previewArchiveImportRollback(operationId: string) {
    if (!campaignId || !operationId) return;
    setArchiveImportRecoveryBusy(true);
    try {
      const preview = await apiGet<ArchiveImportRollbackPreview>(`/api/v1/campaigns/${campaignId}/archive-import-operations/${operationId}/preview`);
      setArchiveImportRollbackPreview(preview);
      setStatus(preview.conflicts.length > 0 ? `Rollback review preserves ${preview.conflicts.length} changed records` : "Archive rollback review ready");
    } finally {
      setArchiveImportRecoveryBusy(false);
    }
  }

  async function rollbackArchiveImport(operationId: string) {
    const campaign = snapshotRef.current.campaigns.find((candidate) => candidate.id === campaignId);
    if (!campaign) throw new Error("Campaign is no longer available for rollback");
    const fallbackCampaignId = snapshotRef.current.campaigns.find((candidate) => candidate.id !== campaign.id)?.id;
    setArchiveImportRecoveryBusy(true);
    try {
      const result = await apiPost<ArchiveImportRollbackResult>(
        `/api/v1/campaigns/${campaign.id}/archive-import-operations/${operationId}/rollback`,
        { expectedUpdatedAt: campaign.updatedAt, confirmOperationId: operationId },
        { idempotencyKey: `archive-import-rollback:${operationId}:${window.crypto.randomUUID()}` }
      );
      setArchiveImportRollbackPreview(undefined);
      setStatus(result.conflicts.length > 0 ? `Rollback preserved ${result.conflicts.length} changed records` : "Archive import rolled back");
      if (result.campaignUpdatedAt) {
        await refresh(campaign.id);
        await loadArchiveImportOperations(campaign.id);
      } else {
        await recoverDeletedArchiveImportWorkspace({ fallbackCampaignId, clearRecoveryState: () => { setArchiveImportOperations([]); setSelectedArchiveImportOperationId(""); }, selectWorkspaceContext, refreshWorkspace: (targetCampaignId, targetSceneId) => refresh(targetCampaignId, targetSceneId, { syncStatus: false }) });
      }
    } finally {
      setArchiveImportRecoveryBusy(false);
    }
  }

  async function importCampaignArchive(file: File, input?: HTMLInputElement, retryAttempt?: ArchiveImportAttempt) {
    setIsImportingArchive(true);
    setImportStatus(`Importing ${file.name}`);
    setStatus("Importing archive");
    const attempt: ArchiveImportAttempt = retryAttempt ?? {
      idempotencyKey: `archive-import:${window.crypto.randomUUID()}`,
      mode: archiveImportModeRef.current,
      scope: archiveImportScopeRef.current,
      collections: [...archiveImportCollectionsRef.current],
      transport: isCampaignArchiveStreamFile(file) ? "stream" : "json"
    };
    let controller: AbortController | undefined;
    let serverAccepted = false;
    if (attempt.transport === "stream") {
      setArchiveTransfer({ direction: "import", phase: "preparing", fileName: file.name, loadedBytes: 0, totalBytes: file.size });
    } else {
      setArchiveTransfer(undefined);
    }
    try {
      const currentImportMode = attempt.mode;
      const currentImportScope = attempt.scope;
      const currentImportCollections = attempt.collections;
      let result: CampaignImportResult;
      if (attempt.transport === "stream") {
        const metadata = await readCampaignArchiveStreamMetadata(file);
        const archiveCampaignId = campaignArchiveTargetId(metadata);
        const existingCampaign = archiveCampaignId
          ? snapshotRef.current.campaigns.find((candidate) => candidate.id === archiveCampaignId)
          : undefined;
        const params = new URLSearchParams({ mode: currentImportMode, scope: currentImportScope });
        if (currentImportScope === "selected_collections") params.set("collections", currentImportCollections.join(","));
        if (existingCampaign) params.set("expectedUpdatedAt", existingCampaign.updatedAt);
        controller = new AbortController();
        archiveTransferAbortRef.current = controller;
        setArchiveTransfer({ direction: "import", phase: "transferring", fileName: file.name, loadedBytes: 0, totalBytes: file.size });
        result = await uploadCampaignArchiveStream<CampaignImportResult>({
          url: `${apiBase}/api/v1/import/campaign/stream?${params.toString()}`,
          file,
          token: getSessionToken(),
          idempotencyKey: attempt.idempotencyKey,
          signal: controller.signal,
          onProgress: (progress) => setArchiveTransfer({
            direction: "import",
            phase: progress.phase,
            fileName: file.name,
            loadedBytes: progress.loadedBytes,
            totalBytes: progress.totalBytes ?? file.size
          })
        });
      } else {
        const archive = JSON.parse(await file.text()) as unknown;
        const archiveCampaignId = campaignArchiveTargetId(archive);
        const existingCampaign = archiveCampaignId
          ? snapshotRef.current.campaigns.find((candidate) => candidate.id === archiveCampaignId)
          : undefined;
        result = await apiPost<CampaignImportResult>(
          "/api/v1/import/campaign",
          currentImportMode === "upsert" && currentImportScope === "all" && !existingCampaign
            ? archive
            : {
                archive,
                mode: currentImportMode,
                scope: currentImportScope,
                collections: currentImportScope === "selected_collections" ? currentImportCollections : undefined,
                ...(existingCampaign ? { expectedUpdatedAt: existingCampaign.updatedAt } : {})
              },
          { idempotencyKey: attempt.idempotencyKey }
        );
      }
      serverAccepted = true;
      if (attempt.transport === "stream") {
        setArchiveTransfer({ direction: "import", phase: "complete", fileName: file.name, loadedBytes: file.size, totalBytes: file.size });
      }
      setArchiveImportReport(result);
      setArchiveImportReportFileName(file.name);
      if (result.dryRun) {
        setFailedArchiveImport(undefined);
        setImportStatus(`${file.name}: dry run ${summarizeImport(result)}; ${result.conflicts.length} conflicts`);
        setStatus(result.conflicts.length > 0 ? `Archive dry run found ${result.conflicts.length} conflicts` : "Archive dry run passed");
        return;
      }
      const nextCampaignId = result.importedCampaignIds[0] ?? campaignId;
      setFailedArchiveImport(undefined);
      const skippedConflicts = result.skippedConflicts?.length ?? 0;
      const importOutcome = skippedConflicts > 0 ? `Imported non-conflicting records; skipped ${skippedConflicts} conflicts` : result.conflicts.length > 0 ? `Imported with ${result.conflicts.length} conflicts` : "Archive imported";
      setImportStatus(`${file.name}: ${summarizeImport(result)}; ${importOutcome}`);
      setStatus(importOutcome);
      await refresh(nextCampaignId);
      await loadArchiveImportOperations(nextCampaignId);
      if (result.operation) setSelectedArchiveImportOperationId(result.operation.id);
    } catch (error) {
      const cancelled = attempt.transport === "stream" && isArchiveTransferAbort(error);
      const detail = error instanceof Error ? error.message : String(error);
      const message = cancelled
        ? "Import cancelled before the atomic response commit"
        : serverAccepted
          ? `Import committed, but the workspace refresh failed: ${detail}`
          : detail;
      if (serverAccepted) {
        setFailedArchiveImport(undefined);
        setImportStatus(`${file.name}: ${message}`);
        setStatus("Archive imported; refresh the workspace to load the committed state");
      } else {
        setFailedArchiveImport({ file, message, attempt });
        setImportStatus(`${file.name}: ${message}`);
        setStatus(cancelled ? "Archive import cancelled" : "Archive import failed");
      }
      if (attempt.transport === "stream") {
        setArchiveTransfer({
          direction: "import",
          phase: cancelled ? "cancelled" : serverAccepted ? "complete" : "failed",
          fileName: file.name,
          loadedBytes: serverAccepted ? file.size : archiveTransfer?.loadedBytes ?? 0,
          totalBytes: file.size,
          ...(!cancelled && !serverAccepted ? { error: detail } : {})
        });
      }
    } finally {
      if (archiveTransferAbortRef.current === controller) archiveTransferAbortRef.current = null;
      setIsImportingArchive(false);
      if (input) input.value = "";
    }
  }

  async function retryArchiveImport() {
    if (!failedArchiveImport) return;
    await importCampaignArchive(failedArchiveImport.file, undefined, failedArchiveImport.attempt);
  }

  function dismissArchiveImportFailure() {
    setFailedArchiveImport(undefined);
    setImportStatus("Archive import failure dismissed");
  }

  function cancelArchiveTransfer() {
    if (!archiveTransfer || (archiveTransfer.phase !== "transferring" && archiveTransfer.phase !== "validating")) return;
    archiveTransferAbortRef.current?.abort();
  }

  async function updateSelectedTokenVision(patch: TokenVisionPatch) {
    if (!selectedToken) return false;
    try {
      if (blankCanvasDemoOpen) {
        const normalizedPatch: Partial<Token> = {};
        if (patch.visionEnabled !== undefined) normalizedPatch.visionEnabled = patch.visionEnabled;
        if (patch.visionRadius !== undefined) normalizedPatch.visionRadius = patch.visionRadius;
        if (patch.dimVisionRadius !== undefined) normalizedPatch.dimVisionRadius = patch.dimVisionRadius ?? undefined;
        if (patch.brightVisionRadius !== undefined) normalizedPatch.brightVisionRadius = patch.brightVisionRadius ?? undefined;
        setSnapshot((current) => ({
          ...current,
          tokens: current.tokens.map((token) => (token.id === selectedToken.id ? { ...token, ...normalizedPatch, updatedAt: new Date().toISOString() } : token))
        }));
        setStatus("Token vision updated for this demo tab");
        return true;
      }
      const tokenId = selectedToken.id;
      const requestSceneId = selectedScene?.id ?? sceneId;
      let applied = false;
      await runWorkspaceBoundAction(
        (request) => {
          const latest = snapshotRef.current.tokens.find((token) => token.id === tokenId) ?? selectedToken;
          const payload = { ...patch, expectedUpdatedAt: latest.updatedAt };
          return apiPatch<Token>(`/api/v1/tokens/${tokenId}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:vision:${tokenId}`, latest.updatedAt, payload) });
        },
        (updated, request) => {
          if (updated.id !== tokenId) return;
          applyTokensToSnapshot([updated]);
          void refresh(request.campaignId, requestSceneId, { syncStatus: false });
          applied = true;
        }
      );
      return applied;
    } catch (error) {
      setStatus(`Token vision update failed: ${errorMessage(error)}`);
      return false;
    }
  }

  async function updateSelectedToken(patch: Partial<Token>) {
    if (!selectedToken) return;
    const targetToken = selectedToken;
    const statusLabel = "Token updated";
    if (blankCanvasDemoOpen) {
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((token) => (token.id === selectedToken.id ? { ...token, ...patch, id: token.id, sceneId: token.sceneId, updatedAt: new Date().toISOString() } : token))
      }));
      setStatus(`${statusLabel} for this demo tab`);
      return;
    }
    const queuedRequest = beginWorkspaceBoundRequest();
    try {
      await tokenMutationQueueRef.current.enqueue(targetToken.id, async () => {
        if (!workspaceBoundRequestIsCurrent(queuedRequest)) return;
        await runWorkspaceBoundAction(
          (request) => {
            const latest = latestAuthoritativeToken(targetToken.id, targetToken)!;
            const payload = { ...patch, expectedUpdatedAt: latest.updatedAt };
            return apiPatch<Token>(`/api/v1/tokens/${targetToken.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:update:${targetToken.id}`, latest.updatedAt, payload) });
          },
          (updated) => {
            applyTokensToSnapshot([updated]);
            setStatus(statusLabel);
          }
        );
      });
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(queuedRequest)) setStatus(`Token update failed: ${errorMessage(error)}`);
    } finally {
      finishWorkspaceBoundRequest(queuedRequest);
    }
  }

  async function cycleTokenLayer(token: Token) {
    const nextLayer = nextTokenLayer(tokenLayer(token));
    const statusLabel = `${token.name} moved to ${tokenLayerLabel(nextLayer)}`;
    if (blankCanvasDemoOpen) {
      setSnapshot((current) => ({
        ...current,
        tokens: current.tokens.map((item) => (item.id === token.id ? { ...item, layer: nextLayer, updatedAt: new Date().toISOString() } : item))
      }));
      setActiveTokenLayer(nextLayer);
      selectSingleToken(token.id);
      setStatus(`${statusLabel} for this demo tab`);
      return;
    }
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.tokens.find((candidate) => candidate.id === token.id) ?? token;
        const payload = { layer: nextLayer, expectedUpdatedAt: latest.updatedAt };
        return apiPatch<Token>(`/api/v1/tokens/${token.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:layer:${token.id}`, latest.updatedAt, payload) });
      },
      (updated) => {
        applyTokensToSnapshot([updated]);
        setActiveTokenLayer(nextLayer);
        selectSingleToken(updated.id);
        setStatus(statusLabel);
      }
    );
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
      elevation: token.elevation,
      layer: token.layer,
      hidden: token.hidden,
      locked: token.locked,
      visionEnabled: token.visionEnabled,
      visionRadius: token.visionRadius,
      brightVisionRadius: token.brightVisionRadius,
      dimVisionRadius: token.dimVisionRadius,
      senses: token.senses,
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

    if (changes.length === 0) return;
    const sceneId = changes[0]!.token.sceneId;
    const scene = snapshotRef.current.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) throw new Error("Scene is unavailable for token movement");
    const payload: TokenMoveBatchRequest = {
      expectedSceneUpdatedAt: scene.updatedAt,
      changes: changes.map(({ token, position }) => {
        const latest = snapshotRef.current.tokens.find((candidate) => candidate.id === token.id) ?? token;
        return { tokenId: latest.id, ...position, expectedUpdatedAt: latest.updatedAt };
      }).sort((left, right) => left.tokenId.localeCompare(right.tokenId))
    };
    const aggregateRevision = `${payload.expectedSceneUpdatedAt}|${payload.changes.map((change) => `${change.tokenId}:${change.expectedUpdatedAt}`).join("|")}`;

    await runWorkspaceBoundAction(
      (request) => apiPost<TokenMoveBatchResult>(
        `/api/v1/scenes/${sceneId}/tokens/move`,
        payload,
        {
          signal: request.controller.signal,
          idempotencyKey: sharedMutationIdempotencyKey(`token:move-batch:${sceneId}`, aggregateRevision, payload)
        }
      ),
      (result) => applyTokensToSnapshot(result.tokens)
    );
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

    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.tokens.find((candidate) => candidate.id === token.id) ?? token;
        const payload = { ...frame, expectedUpdatedAt: latest.updatedAt };
        return apiPatch<Token>(`/api/v1/tokens/${token.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:resize:${token.id}`, latest.updatedAt, payload) });
      },
      (updated) => applyTokensToSnapshot([updated])
    );
  }

  async function createTokensOnServer(tokens: Token[], request: WorkspaceBoundRequest) {
    const sceneRevisions = new Map<string, Scene>();
    for (const token of tokens) {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      const scene = sceneRevisions.get(token.sceneId) ?? await apiGet<Scene>(`/api/v1/scenes/${token.sceneId}`, { signal: request.controller.signal });
      const payload = { ...tokenRestorePayload(token), expectedUpdatedAt: scene.updatedAt };
      await apiPost<Token>(`/api/v1/scenes/${token.sceneId}/tokens`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:restore:${token.id}`, scene.updatedAt, payload) });
      sceneRevisions.set(token.sceneId, await apiGet<Scene>(`/api/v1/scenes/${token.sceneId}`, { signal: request.controller.signal }));
    }
  }

  async function deleteTokensOnServer(tokens: Token[], request: WorkspaceBoundRequest) {
    for (const token of tokens) {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      const latest = snapshotRef.current.tokens.find((candidate) => candidate.id === token.id) ?? token;
      await apiDelete<Token>(`/api/v1/tokens/${token.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:delete:${token.id}`, latest.updatedAt, {}) });
    }
  }

  function enqueueBoardSync(task: (request: WorkspaceBoundRequest) => Promise<void>) {
    const request = beginWorkspaceBoundRequest();
    const previous = boardSyncQueueRef.current;
    const run = previous.then(async () => {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      await task(request);
    }, async () => {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      await task(request);
    });
    boardSyncQueueRef.current = run.catch((error) => {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      setStatus(`Board sync failed: ${error instanceof Error ? error.message : String(error)}`);
      refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
    }).finally(() => finishWorkspaceBoundRequest(request));
  }

  async function persistBoardHistoryAction(action: BoardHistoryAction, direction: BoardHistoryDirection, request: WorkspaceBoundRequest) {
    if (action.kind === "tokens.move" || action.kind === "tokens.resize") {
      const target = direction === "undo" ? "before" : "after";
      for (const change of action.changes) {
        if (!workspaceBoundRequestIsCurrent(request)) return;
        const latest = snapshotRef.current.tokens.find((token) => token.id === change.tokenId);
        if (!latest) throw new Error("The token no longer exists. The board will refresh.");
        const payload = { ...change[target], expectedUpdatedAt: latest.updatedAt };
        const updated = await apiPatch<Token>(`/api/v1/tokens/${change.tokenId}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:history:${direction}:${change.tokenId}`, latest.updatedAt, payload) });
        applyTokensToSnapshot([updated]);
      }
      return;
    }

    const shouldDeleteTokens = action.kind === "tokens.create" ? direction === "undo" : direction === "redo";
    if (shouldDeleteTokens) {
      await deleteTokensOnServer(action.tokens, request);
      return;
    }

    await createTokensOnServer(action.tokens, request);
  }

  function applyLocalBoardHistory(action: BoardHistoryAction, direction: BoardHistoryDirection) {
    const result = applyLocalBoardHistoryAction(snapshot.tokens, action, direction);
    setSnapshot((current) => ({
      ...current,
      tokens: applyLocalBoardHistoryAction(current.tokens, action, direction).tokens
    }));
    selectCanvasTokens(result.selectedTokenIds);
    setStatus(boardHistoryStatus(action, direction));
    if (!blankCanvasDemoOpen) enqueueBoardSync((request) => persistBoardHistoryAction(action, direction, request));
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
    if (!blankCanvasDemoOpen) enqueueBoardSync((request) => deleteTokensOnServer(tokensToDelete, request));
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
    selectSingleToken(combatant.tokenId);
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
    if (!blankCanvasDemoOpen) enqueueBoardSync((request) => createTokensOnServer(pastedTokens, request));
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
    const targetSceneId = selectedScene?.id ?? sceneId;
    const queuedRequest = beginWorkspaceBoundRequest();
    try {
      await tokenMutationQueueRef.current.enqueue(tokenId, async () => {
        if (!workspaceBoundRequestIsCurrent(queuedRequest)) return;
        await runWorkspaceBoundAction(
          (request) => {
            const token = latestAuthoritativeToken(tokenId);
            if (!token) throw new Error("The token no longer exists.");
            const payload = { targeted, expectedUpdatedAt: token.updatedAt };
            return apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:target:${tokenId}`, token.updatedAt, payload) });
          },
          async (updated, request) => {
            applyTokensToSnapshot([updated]);
            await refresh(request.campaignId, targetSceneId, { syncStatus: false });
            if (workspaceBoundRequestIsCurrent(request)) setStatus(statusLabel);
          }
        );
      });
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(queuedRequest)) setStatus(`Token target update failed: ${errorMessage(error)}`);
    } finally {
      finishWorkspaceBoundRequest(queuedRequest);
    }
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
    const targetSceneId = selectedScene?.id ?? sceneId;
    try {
      await runWorkspaceBoundAction(
        async (request) => {
          for (const tokenId of uniqueTokenIds) {
            if (!workspaceBoundRequestIsCurrent(request)) return;
            await tokenMutationQueueRef.current.enqueue(tokenId, async () => {
              if (!workspaceBoundRequestIsCurrent(request)) return;
              const token = latestAuthoritativeToken(tokenId);
              if (!token) return;
              const payload = { targeted, expectedUpdatedAt: token.updatedAt };
              const updated = await apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:target:${tokenId}`, token.updatedAt, payload) });
              applyTokensToSnapshot([updated]);
            });
          }
        },
        async (_result, request) => {
          await refresh(request.campaignId, targetSceneId, { syncStatus: false });
          if (workspaceBoundRequestIsCurrent(request)) setStatus(statusLabel);
        }
      );
    } catch (error) {
      setStatus(`Token target update failed: ${errorMessage(error)}`);
    }
  }

  function finishSceneBackgroundChange(scene: Scene, assetName: string, options: { navigateToPrep?: boolean } = {}) {
    applySceneToSnapshot(scene);
    setGridCalibrationPoints([]);
    const plan = sceneBackgroundChangePlan(scene, assetName, { selected: realtimeSelectionRef.current.sceneId === scene.id, navigateToPrep: options.navigateToPrep });
    if (plan.calibrationOpen !== undefined) setGridCalibrationOpen(plan.calibrationOpen);
    if (plan.navigateToPrep) { setFogBrushMode(null); setAnnotationTool(null); setAnnotationPanelOpen(false); setWorkspaceMode("prep"); }
    setStatus(plan.status);
  }

  async function uploadMap(file: File) {
    if (!selectedScene) throw new Error("Select a scene before uploading a map.");
    const targetSceneId = selectedScene.id;
    const latestScene = currentSceneForMutation(selectedScene);
    const targetSceneName = latestScene.name;
    const uploadScope = `asset-map:${targetSceneId}`;
    const uploadAttempt = beginAppendMutation(uploadScope, { campaignId, sceneId: targetSceneId, sceneUpdatedAt: latestScene.updatedAt, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    setStatus(`Uploading ${file.name} to ${targetSceneName}...`);
    await runWorkspaceBoundAction(
      async (request) => {
        const uploaded = await apiUploadAsset({
          campaignId: request.campaignId,
          sceneId: targetSceneId,
          expectedSceneUpdatedAt: latestScene.updatedAt,
          file,
          setAsBackground: true
        }, { signal: request.controller.signal, idempotencyKey: uploadAttempt.idempotencyKey });
        return uploaded.scene ? { ...uploaded, scene: await resetSceneMapCalibration(uploaded.scene, request.controller.signal) } : uploaded;
      },
      async (result, request) => {
        completeAppendMutation(uploadScope, uploadAttempt);
        if (result.scene) finishSceneBackgroundChange(result.scene, file.name);
        await refresh(request.campaignId, targetSceneId, { syncStatus: false });
      }
    );
  }

  async function uploadSelectedTokenImage(file: File, input?: HTMLInputElement) {
    if (!selectedCampaign || !selectedToken) return;
    const targetSceneId = selectedScene?.id ?? sceneId;
    const targetToken = selectedToken;
    const uploadScope = `asset-token:${targetToken.id}`;
    const uploadAttempt = beginAppendMutation(uploadScope, { campaignId, tokenId: targetToken.id, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    if (input) input.value = "";
    setStatus(`Uploading ${file.name} for ${targetToken.name}...`);
    try {
      await runWorkspaceBoundAction(
        async (request) => {
          const result = await apiUploadAsset({
            campaignId: request.campaignId,
            sceneId: targetSceneId,
            file,
            folder: "tokens",
            tags: ["token"]
          }, { signal: request.controller.signal, idempotencyKey: uploadAttempt.idempotencyKey });
          const latest = snapshotRef.current.tokens.find((token) => token.id === targetToken.id) ?? targetToken;
          const payload = { imageAssetId: result.asset.id, expectedUpdatedAt: latest.updatedAt };
          await apiPatch<Token>(`/api/v1/tokens/${targetToken.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:image:${targetToken.id}`, latest.updatedAt, payload) });
        },
        async (_result, request) => {
          completeAppendMutation(uploadScope, uploadAttempt);
          setStatus(`${targetToken.name} image updated`);
          await refresh(request.campaignId, targetSceneId);
        }
      );
    } catch (error) {
      setStatus(`Token image upload failed: ${errorMessage(error)}`);
    }
  }

  async function uploadAiAgentReferenceAsset(file: File, input?: HTMLInputElement) {
    if (!selectedCampaign) return;
    if (!file.type.startsWith("image/")) {
      setAiAgentReferenceUploadStatus("Reference upload failed: choose an image file.");
      if (input) input.value = "";
      return;
    }
    const targetSceneId = selectedScene?.id ?? sceneId;
    const uploadScope = "asset-agent-reference";
    const uploadAttempt = beginAppendMutation(uploadScope, { campaignId, sceneId: targetSceneId, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    if (input) input.value = "";
    setAiAgentReferenceUploadStatus(`Uploading ${file.name}...`);
    try {
      await runWorkspaceBoundAction(
        (request) => apiUploadAsset({
          campaignId: request.campaignId,
          sceneId: targetSceneId,
          file,
          folder: "ai/references",
          tags: ["ai", "reference"]
        }, { signal: request.controller.signal, idempotencyKey: uploadAttempt.idempotencyKey }),
        async (result, request) => {
          completeAppendMutation(uploadScope, uploadAttempt);
          setAiAgentReferenceAssetId(result.asset.id);
          setAiAgentReferenceUploadStatus("");
          await refresh(request.campaignId, targetSceneId);
        }
      );
    } catch (error) {
      setAiAgentReferenceUploadStatus(`Reference upload failed: ${errorMessage(error)}`);
    }
  }

  function clearAiAgentReferenceAsset() {
    setAiAgentReferenceAssetId(undefined);
    setAiAgentReferenceUploadStatus("");
  }

  async function uploadAssetToLibrary(file: File, setAsBackground: boolean, retryInput?: { folder: string; tags: string }) {
    if (!selectedCampaign) return;
    const targetSceneId = selectedScene?.id ?? sceneId;
    const folder = retryInput?.folder ?? assetFolder;
    const tags = retryInput?.tags ?? assetTags;
    setAssetStatus(`Uploading ${file.name}...`);
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const url = URL.createObjectURL(file);
      blankCanvasAssetUrlsRef.current.add(url);
      const asset = createBlankCanvasDemoAsset({
        id: nextBlankCanvasDemoId("asset_demo"),
        name: file.name,
        url,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        folder: folder.trim() || undefined,
        tags: assetTagsFromInput(tags),
        timestamp
      });
      const demoScene = setAsBackground ? snapshotRef.current.scenes.find((scene) => scene.id === targetSceneId) : undefined;
      const updatedDemoScene = demoScene ? sceneWithBackgroundChange(demoScene, asset.id, timestamp) : undefined;
      setSnapshot((current) => ({
        ...current,
        assets: [...current.assets, asset],
        scenes: updatedDemoScene
          ? current.scenes.map((scene) => scene.id === targetSceneId ? updatedDemoScene : scene)
          : current.scenes
      }));
      setCanvasAssetId(asset.id);
      setFailedAssetUpload(undefined);
      setAssetStatus(`${asset.name} added locally${setAsBackground ? " and set as scene background" : ""}`);
      if (updatedDemoScene) finishSceneBackgroundChange(updatedDemoScene, asset.name); else setStatus("Demo asset added");
      return;
    }
    const backgroundScene = setAsBackground ? snapshotRef.current.scenes.find((candidate) => candidate.id === targetSceneId) : undefined;
    const uploadScope = `asset-library:${setAsBackground ? targetSceneId : "general"}`;
    const uploadAttempt = beginAppendMutation(uploadScope, { campaignId, sceneId: setAsBackground ? targetSceneId : undefined, sceneUpdatedAt: backgroundScene?.updatedAt, setAsBackground, folder: folder.trim(), tags: assetTagsFromInput(tags), name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    try {
      if (setAsBackground && !backgroundScene) throw new Error("Reload the selected scene before setting its background.");
      await runWorkspaceBoundAction(
        async (request) => {
          const uploaded = await apiUploadAsset({ campaignId: request.campaignId, sceneId: setAsBackground ? targetSceneId : undefined, expectedSceneUpdatedAt: backgroundScene?.updatedAt, file, setAsBackground, folder: folder.trim() || undefined, tags: assetTagsFromInput(tags) }, { signal: request.controller.signal, idempotencyKey: uploadAttempt.idempotencyKey });
          return uploaded.scene ? { ...uploaded, scene: await resetSceneMapCalibration(uploaded.scene, request.controller.signal) } : uploaded;
        },
        async (result, request) => {
          completeAppendMutation(uploadScope, uploadAttempt);
          setFailedAssetUpload(undefined);
          setAssetStatus(`${result.asset.name} uploaded${result.scene ? " and set as scene background" : ""}`);
          if (result.scene) finishSceneBackgroundChange(result.scene, result.asset.name); else setStatus("Asset uploaded");
          await refresh(request.campaignId, result.scene?.id ?? targetSceneId);
        }
      );
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
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        assets: current.assets.map((item) => item.id === asset.id ? { ...item, name: input.name.trim() || item.name, folder: input.folder.trim() || undefined, tags: assetTagsFromInput(input.tags), updatedAt: timestamp } : item)
      }));
      setAssetStatus(`${input.name.trim() || asset.name} metadata updated locally`);
      setStatus("Demo asset updated");
      return;
    }
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.assets.find((candidate) => candidate.id === asset.id) ?? asset;
        const payload = { name: input.name, folder: input.folder.trim() || null, tags: assetTagsFromInput(input.tags), expectedUpdatedAt: latest.updatedAt };
        return apiPatch<MapAsset>(`/api/v1/assets/${asset.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`asset:metadata:${asset.id}`, latest.updatedAt, payload) });
      },
      async (updated, request) => {
        setAssetStatus(`${updated.name} metadata updated`);
        setStatus("Asset metadata updated");
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      }
    );
  }

  async function setSceneBackgroundFromAsset(asset: MapAsset) {
    if (!selectedScene) return;
    const targetScene = selectedScene;
    if (targetScene.backgroundAssetId === asset.id) { setAssetStatus(`${asset.name} is already the ${targetScene.name} background`); return; }
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      const updatedScene = sceneWithBackgroundChange(targetScene, asset.id, timestamp);
      setSnapshot((current) => ({
        ...current,
        scenes: current.scenes.map((scene) => scene.id === targetScene.id ? updatedScene : scene)
      }));
      setAssetStatus(`${asset.name} set as ${targetScene.name} background locally`);
      finishSceneBackgroundChange(updatedScene, asset.name);
      return;
    }
    await runWorkspaceBoundAction(
      (request) => {
        const latest = currentSceneForMutation(targetScene);
        const payload = sceneBackgroundChangePayload(latest, asset.id);
        return apiPatch<Scene>(`/api/v1/scenes/${targetScene.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`scene:background:${targetScene.id}`, latest.updatedAt, payload) });
      },
      async (updated, request) => {
        setAssetStatus(`${asset.name} set as ${targetScene.name} background`);
        finishSceneBackgroundChange(updated, asset.name);
        await refresh(request.campaignId, targetScene.id);
      }
    );
  }

  async function updateAssetLifecycle(asset: MapAsset, status: AssetLifecycleStatus) {
    const reason = assetLifecycleReason.trim() || undefined;
    if (blankCanvasDemoOpen) {
      const timestamp = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        assets: current.assets.map((item) => item.id === asset.id ? { ...item, lifecycle: { ...item.lifecycle, status, reason, updatedAt: timestamp, updatedByUserId: currentUserId }, updatedAt: timestamp } : item)
      }));
      setAssetStatus(`${asset.name} marked ${status} locally`);
      setStatus("Demo asset updated");
      return;
    }
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.assets.find((candidate) => candidate.id === asset.id) ?? asset;
        const payload = { status, reason, expectedUpdatedAt: latest.updatedAt };
        return apiPatch<MapAsset>(`/api/v1/assets/${asset.id}/lifecycle`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`asset:lifecycle:${asset.id}`, latest.updatedAt, payload) });
      },
      async (updated, request) => {
        setAssetStatus(`${updated.name} marked ${updated.lifecycle?.status ?? status}`);
        setStatus("Asset lifecycle updated");
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      }
    );
  }

  async function createAssetDeliveryUrl(asset: MapAsset) {
    if (blankCanvasDemoOpen) {
      if (navigator.clipboard && asset.url) await navigator.clipboard.writeText(asset.url);
      setAssetStatus(`Local link copied for ${asset.name}`);
      setStatus("Demo asset link copied");
      return;
    }
    await runWorkspaceBoundAction(
      (request) => apiPost<{ url: string }>(`/api/v1/assets/${asset.id}/delivery-url`, {
        expiresInSeconds: 900,
        disposition: "inline"
      }, { signal: request.controller.signal }),
      async (delivery, request) => {
        if (navigator.clipboard && delivery.url) await navigator.clipboard.writeText(delivery.url).catch(() => undefined);
        if (!workspaceBoundRequestIsCurrent(request)) return;
        setAssetStatus(`Signed URL ready for ${asset.name}`);
        setStatus("Asset delivery URL created");
      }
    );
  }

  function currentSceneForMutation(scene: Scene): Scene {
    const candidate = snapshotRef.current.scenes.find((item) => item.id === scene.id);
    return candidate && candidate.updatedAt > scene.updatedAt ? candidate : scene;
  }

  async function postSceneMutation(scene: Scene, path: string, input: Record<string, unknown>, scope: string): Promise<Scene> {
    const latest = currentSceneForMutation(scene);
    const payload = { ...input, expectedUpdatedAt: latest.updatedAt };
    return runSharedMutation(() => apiPost<Scene>(path, payload, { idempotencyKey: sharedMutationIdempotencyKey(`${scope}:${latest.id}`, latest.updatedAt, payload) }), latest.campaignId, latest.id);
  }

  async function patchSceneChildMutation(scene: Scene, path: string, input: Record<string, unknown>, scope: string): Promise<Scene> {
    const latest = currentSceneForMutation(scene);
    const payload = { ...input, expectedUpdatedAt: latest.updatedAt };
    return runSharedMutation(() => apiPatch<Scene>(path, payload, { idempotencyKey: sharedMutationIdempotencyKey(`${scope}:${latest.id}`, latest.updatedAt, payload) }), latest.campaignId, latest.id);
  }

  async function deleteSceneChildMutation(scene: Scene, path: string, scope: string): Promise<Scene> {
    const latest = currentSceneForMutation(scene);
    const separator = path.includes("?") ? "&" : "?";
    return runSharedMutation(() => apiDelete<Scene>(`${path}${separator}expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`${scope}:${latest.id}`, latest.updatedAt, {}) }), latest.campaignId, latest.id);
  }

  async function revealFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const scene = await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 160,
      mode: "reveal",
      hidden: false
    }, "scene:fog:reveal");
    applySceneToSnapshot(scene);
    setStatus("Fog updated");
    await refresh();
  }

  async function hideFog() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const scene = await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog`, {
      x: center.x,
      y: center.y,
      radius: 95,
      mode: "hide",
      hidden: false
    }, "scene:fog:hide");
    applySceneToSnapshot(scene);
    setStatus("Fog hidden");
    await refresh();
  }

  async function revealFogPolygon() {
    if (!selectedScene) return;
    const center = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const radius = selectedScene.gridSize * 3;
    const scene = await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "polygon",
      mode: "reveal",
      points: [
        { x: center.x, y: center.y - radius },
        { x: center.x + radius, y: center.y },
        { x: center.x, y: center.y + radius },
        { x: center.x - radius, y: center.y }
      ]
    }, "scene:fog:polygon");
    applySceneToSnapshot(scene);
    setStatus("Fog polygon revealed");
    await refresh();
  }

  function toggleFogBrush(mode: FogMode) {
    setGridCalibrationOpen(false); setGridCalibrationPoints([]);
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
    setSelectedActorId(snapshot.tokens.find((token) => token.id === tokenId)?.actorId ?? "");
  }

  function selectActor(actorId: string) {
    setSelectedActorId(actorId);
    const token = snapshot.tokens.find((item) => item.actorId === actorId && item.sceneId === selectedScene?.id);
    if (token) selectSingleToken(token.id);
    else {
      setSelectedTokenIdState("");
      setSelectedTokenIds([]);
      setSelectedBoardAssetId("");
    }
    setTab("actors");
  }

  function selectCanvasToken(tokenId: string, options: TokenSelectionOptions = {}) {
    setSelectedBoardAssetId("");
    if (options.additive) {
      setSelectedTokenIds((current) => {
        const alreadySelected = current.includes(tokenId);
        const next = alreadySelected ? current.filter((id) => id !== tokenId) : [...current, tokenId];
        setSelectedTokenIdState(alreadySelected ? next[next.length - 1] ?? "" : tokenId);
        setSelectedActorId(snapshot.tokens.find((token) => token.id === (alreadySelected ? next[next.length - 1] : tokenId))?.actorId ?? "");
        return next;
      });
      return;
    }
    if (options.preserveExisting) {
      setSelectedTokenIdState(tokenId);
      setSelectedActorId(snapshot.tokens.find((token) => token.id === tokenId)?.actorId ?? "");
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
        setSelectedActorId(snapshot.tokens.find((token) => token.id === (uniqueTokenIds.at(-1) ?? next.at(-1)))?.actorId ?? "");
        return next;
      });
      return;
    }
    setSelectedTokenIds(uniqueTokenIds);
    setSelectedTokenIdState(uniqueTokenIds.at(-1) ?? "");
    setSelectedActorId(snapshot.tokens.find((token) => token.id === uniqueTokenIds.at(-1))?.actorId ?? "");
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
    setGridCalibrationOpen(false); setGridCalibrationPoints([]);
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
    const scene = await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations`, {
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
      snapToGrid: selectedScene.gridType !== "gridless" && kind !== "ruler" ? annotationSnapToGrid : false,
      expiresInSeconds: kind === "ping" ? pingAnnotationTtlSeconds : undefined
    }, `scene:annotation:create:${kind}`);
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
    applySceneToSnapshot(await deleteSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, `scene:annotation:delete:${annotation.id}`));
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
      scene = await deleteSceneChildMutation(scene ?? selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, `scene:annotation:delete:${annotation.id}`);
      applySceneToSnapshot(scene);
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
      scene = await patchSceneChildMutation(scene ?? selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, {
        points: annotation.points.map((point) => ({ x: point.x + delta, y: point.y }))
      }, `scene:annotation:nudge:${annotation.id}`);
      applySceneToSnapshot(scene);
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
      scene = await patchSceneChildMutation(scene ?? selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, { color: annotationGroupColor }, `scene:annotation:recolor:${annotation.id}`);
      applySceneToSnapshot(scene);
    }
    if (scene) applySceneToSnapshot(scene);
    setStatus(`Recolored ${annotations.length} annotations in ${group}`);
  }

  async function deleteSceneAnnotation(annotation: SceneAnnotation) {
    if (!selectedScene) return;
    applySceneToSnapshot(await deleteSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, `scene:annotation:delete:${annotation.id}`));
    setStatus(`${annotationToolLabel(annotation.kind)} deleted`);
  }

  async function deleteSceneWall(wallId: string) {
    if (!selectedScene) return;
    applySceneToSnapshot(await deleteSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls/${wallId}`, `scene:wall:delete:${wallId}`));
    setStatus("Wall deleted");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function toggleScenePortal(wall: Scene["walls"][number]) {
    if (!selectedScene || (wall.kind !== "door" && wall.kind !== "window")) return;
    const open = !wall.open;
    applySceneToSnapshot(await patchSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls/${wall.id}`, { open }, `scene:wall:toggle:${wall.id}`));
    setStatus(`${wall.kind === "door" ? "Door" : "Window"} ${open ? "opened" : "closed"}`);
    void refresh(campaignId, selectedScene.id, { syncStatus: false });
  }

  async function deleteSceneLight(lightId: string) {
    if (!selectedScene) return;
    applySceneToSnapshot(await deleteSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/lights/${lightId}`, `scene:light:delete:${lightId}`));
    setStatus("Light deleted");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function moveSceneAnnotation(annotation: SceneAnnotation, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    const patch: { points: VisionPoint[]; radius?: number } = { points };
    if (annotation.kind === "template" && points.length >= 2) {
      patch.radius = Math.round(distanceBetween(points[0]!, points[1]!));
    }
    applySceneToSnapshot(await patchSceneChildMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, patch, `scene:annotation:move:${annotation.id}`));
    setStatus(`Moved ${annotationToolLabel(annotation.kind)} annotation`);
  }

  async function paintFogStroke(mode: FogMode, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "brush",
      mode,
      brushRadius: Math.max(28, Math.min(110, selectedScene.gridSize * 1.35)),
      points
    }, `scene:fog:brush:${mode}`));
    setStatus(`${mode === "hide" ? "Hide" : "Reveal"} fog brush applied`);
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function undoFog() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog/undo`, {}, "scene:fog:undo"));
    setStatus("Fog change undone");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function undoSceneEdit() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/undo`, {}, "scene:undo"));
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
    const request = currentWorkspaceRequestIdentity();
    const submittedName = fogPresetName;
    const name = submittedName.trim() || `${selectedScene.name} fog preset`;
    const payload = {
      name,
      sceneId: selectedScene.id,
      expectedSceneUpdatedAt: (snapshotRef.current.scenes.find((scene) => scene.id === selectedScene.id) ?? selectedScene).updatedAt
    };
    const attemptScope = `fog-preset:${selectedScene.id}`;
    const attempt = beginAppendMutation(attemptScope, payload);
    await apiPost(`/api/v1/campaigns/${request.campaignId}/fog-presets`, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(attemptScope, attempt);
    if (!workspaceIdentityIsCurrent(request)) return;
    setFogPresetName((current) => current === submittedName ? "" : current);
    setStatus("Fog preset saved");
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
  }

  async function applyFogPreset() {
    if (!selectedScene) return;
    const preset = snapshot.fogPresets[0];
    if (!preset) return;
    const scene = await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/fog/apply-preset`, {
      presetId: preset.id,
      mode: fogPresetMode
    }, `scene:fog:preset:${preset.id}`);
    applySceneToSnapshot(scene);
    setStatus(`${fogPresetMode === "append" ? "Appended" : "Applied"} ${preset.name}`);
    await refresh();
  }

  async function deleteFogPreset() {
    const preset = snapshot.fogPresets[0];
    if (!preset) return;
    const latest = snapshotRef.current.fogPresets.find((candidate) => candidate.id === preset.id) ?? preset;
    await runSharedMutation(() => apiDelete(`/api/v1/campaigns/${campaignId}/fog-presets/${preset.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, {
      idempotencyKey: sharedMutationIdempotencyKey(`fog-preset:delete:${preset.id}`, latest.updatedAt, {})
    }));
    setStatus(`Deleted ${preset.name}`);
    await refresh();
  }

  async function addWall() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.25),
      y1: Math.round(selectedScene.height * 0.28),
      x2: Math.round(selectedScene.width * 0.75),
      y2: Math.round(selectedScene.height * 0.28),
      blocksVision: true
    }, "scene:wall:add"));
    setStatus("Wall added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function addTerrainWall() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.28),
      y1: Math.round(selectedScene.height * 0.42),
      x2: Math.round(selectedScene.width * 0.72),
      y2: Math.round(selectedScene.height * 0.42),
      blocksVision: true,
      blocksMovement: false,
      kind: "terrain"
    }, "scene:wall:add-terrain"));
    setStatus("Terrain wall added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function addDoor() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.42),
      y1: Math.round(selectedScene.height * 0.34),
      x2: Math.round(selectedScene.width * 0.58),
      y2: Math.round(selectedScene.height * 0.34),
      kind: "door",
      open: false
    }, "scene:wall:add-door"));
    setStatus("Closed door added; double-click its handle to open it");
    void refresh(campaignId, selectedScene.id, { syncStatus: false });
  }

  async function addWindow() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.42),
      y1: Math.round(selectedScene.height * 0.5),
      x2: Math.round(selectedScene.width * 0.58),
      y2: Math.round(selectedScene.height * 0.5),
      kind: "window",
      open: false
    }, "scene:wall:add-window"));
    setStatus("Closed window added; double-click its handle to open it");
    void refresh(campaignId, selectedScene.id, { syncStatus: false });
  }

  async function addLight() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 210,
      brightRadius: 80,
      dimRadius: 210,
      color: "#38bdf8",
      intensity: 0.32
    }, "scene:light:add"));
    setStatus("Dual-zone light added");
    void refresh(campaignId, selectedScene?.id ?? sceneId, { syncStatus: false });
  }

  async function addDarkness() {
    if (!selectedScene) return;
    applySceneToSnapshot(await postSceneMutation(selectedScene, `/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 180,
      color: "#111827",
      intensity: 0.86,
      kind: "darkness",
      magical: true
    }, "scene:light:add-darkness"));
    setStatus("Magical darkness added");
    void refresh(campaignId, selectedScene.id, { syncStatus: false });
  }

  async function cyclePlayerVisionPreview() {
    if (!selectedScene) return;
    const players = snapshotRef.current.members.filter((member) => member.role === "player" && member.active !== false && member.user.id !== currentUserId);
    if (players.length === 0) {
      setStatus("Add a player member before previewing player vision");
      return;
    }
    const currentIndex = players.findIndex((member) => member.user.id === playerVisionPreviewUserIdRef.current);
    const nextMember = currentIndex >= 0 && currentIndex === players.length - 1 ? undefined : players[currentIndex + 1] ?? players[0];
    const nextUserId = nextMember?.user.id ?? "";
    const vision = await apiGet<VisionSnapshot>(`/api/v1/scenes/${selectedScene.id}/vision${nextUserId ? `?previewUserId=${encodeURIComponent(nextUserId)}` : ""}`);
    playerVisionPreviewUserIdRef.current = nextUserId;
    setPlayerVisionPreviewUserId(nextUserId);
    setSnapshot((current) => ({ ...current, vision }));
    setStatus(nextMember ? `Previewing ${nextMember.user.displayName}'s player vision` : "Player vision preview ended");
  }

  function applyActorToSnapshot(actor: Actor) {
    if (actor.campaignId !== realtimeSelectionRef.current.campaignId) return;
    const queuedActor = actorSheetAuthoritativeRef.current.get(actor.id);
    const snapshotActor = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id);
    const knownActor = queuedActor && snapshotActor
      ? (queuedActor.updatedAt >= snapshotActor.updatedAt ? queuedActor : snapshotActor)
      : queuedActor ?? snapshotActor;
    if (knownActor && knownActor.updatedAt > actor.updatedAt) return;
    actorSheetAuthoritativeRef.current.set(actor.id, actor);
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      actors: upsertNewestRealtimeRecord(current.actors, actor)
    }));
  }

  function latestAuthoritativeActor(actor: Actor): Actor {
    const snapshotActor = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id && candidate.campaignId === actor.campaignId);
    const queuedActor = actorSheetAuthoritativeRef.current.get(actor.id);
    if (!queuedActor || queuedActor.campaignId !== actor.campaignId) return snapshotActor ?? actor;
    if (!snapshotActor || queuedActor.updatedAt >= snapshotActor.updatedAt) return queuedActor;
    return snapshotActor;
  }

  function reconcileStaleWriteConflict(error: unknown): boolean {
    if (!(error instanceof ApiError) || error.status !== 409) return false;
    const body = recordValue(error.body);
    if (body.code !== "stale_write") return false;
    const current = recordValue(body.current);
    if (body.resourceType === "actor" && typeof current.id === "string" && typeof current.campaignId === "string" && typeof current.updatedAt === "string") {
      applyActorToSnapshot(current as unknown as Actor);
    } else if (body.resourceType === "item" && typeof current.id === "string" && typeof current.campaignId === "string" && typeof current.updatedAt === "string") {
      applyItemToSnapshot(current as unknown as Item);
    } else if (body.resourceType === "combat" && typeof current.id === "string" && typeof current.campaignId === "string" && typeof current.updatedAt === "string" && Array.isArray(current.combatants)) {
      const combat = current as unknown as Combat;
      if (combat.campaignId === realtimeSelectionRef.current.campaignId) {
        invalidateInFlightRefreshes();
        setSnapshot((snapshot) => ({
          ...snapshot,
          combats: snapshot.combats.some((item) => item.id === combat.id)
            ? snapshot.combats.map((item) => (item.id === combat.id ? combat : item))
            : [...snapshot.combats, combat]
        }));
      }
    }
    setStatus(`${error.message} Latest state loaded; review and retry.`);
    return true;
  }

  function applyActorHpToSnapshot(actorId: string, hp: { current: number; max: number }) {
    if (!snapshotRef.current.actors.some((actor) => actor.id === actorId && actor.campaignId === realtimeSelectionRef.current.campaignId)) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({
      ...current,
      actors: current.actors.map((item) => (item.id === actorId ? { ...item, data: { ...item.data, hp } } : item))
    }));
  }

  async function persistActorHp(actor: Actor, hp: { current: number; max: number }, request: WorkspaceBoundRequest) {
    try {
      if (!workspaceBoundRequestIsCurrent(request)) return;
      const latest = latestAuthoritativeActor(actor);
      if (latest.systemId === "dnd-5e-srd") {
        const current = actorHitPoints(latest)?.current ?? 0;
        if (hp.current < current) throw new Error("D&D damage is rules-managed. Open Stats, then use Reviewed typed damage to review damage type, defenses, temporary HP, death saves, and combat state before applying it.");
        if (hp.current > current) await commitDndCombatVitals(latest, "healing", hp.current - current, undefined, request.controller.signal);
        return;
      }
      const payload = {
        data: { ...latest.data, hp },
        expectedUpdatedAt: latest.updatedAt
      };
      const updated = await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`actor:hp:${actor.id}`, latest.updatedAt, payload) });
      if (workspaceBoundRequestIsCurrent(request)) applyActorToSnapshot(updated);
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(request)) {
        if (!reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
        void refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
      }
    } finally {
      if (hpAdjustRef.current.get(actor.id)?.request === request) hpAdjustRef.current.delete(actor.id);
      finishWorkspaceBoundRequest(request);
    }
  }

  // Steppers accumulate a running total in a ref (so rapid clicks add up even
  // before React re-renders), apply optimistically for instant feedback, and
  // debounce a single PATCH instead of one blocking full refresh per click.
  function adjustActorHp(actor: Actor, delta: number) {
    if (actor.systemId === "dnd-5e-srd" && delta < 0) { setStatus("D&D damage is rules-managed. Open Stats, then use Reviewed typed damage."); return; }
    const pending = hpAdjustRef.current.get(actor.id);
    const base = pending ?? actorHitPoints(actor) ?? { current: 0, max: 0 };
    const max = base.max > 0 ? base.max : Number.MAX_SAFE_INTEGER;
    const nextCurrent = Math.max(0, Math.min(max, base.current + delta));
    const next = { current: nextCurrent, max: base.max };
    if (actor.systemId !== "dnd-5e-srd") applyActorHpToSnapshot(actor.id, next);
    if (pending) {
      window.clearTimeout(pending.timer);
      cancelWorkspaceBoundRequest(pending.request);
    }
    const request = beginWorkspaceBoundRequest();
    const timer = window.setTimeout(() => {
      void actorSheetMutationQueueRef.current.enqueue(actor.id, async () => {
        if (!workspaceBoundRequestIsCurrent(request)) return;
        await persistActorHp(actor, next, request);
      }).finally(() => {
        if (hpAdjustRef.current.get(actor.id)?.request === request) hpAdjustRef.current.delete(actor.id);
        finishWorkspaceBoundRequest(request);
      });
    }, 220);
    hpAdjustRef.current.set(actor.id, { ...next, timer, actor, request });
  }

  async function updateActorHp(actor: Actor, current: number) {
    // Clearing the number input yields Number("")/Number("-") === NaN; ignore
    // non-finite values so we never persist a null hit-point total.
    if (!Number.isFinite(current)) return;
    const hp = actorHitPoints(actor);
    const safeCurrent = Math.max(0, Math.floor(current));
    const next = { current: safeCurrent, max: hp?.max ?? safeCurrent };
    if (actor.systemId !== "dnd-5e-srd") applyActorHpToSnapshot(actor.id, next);
    const queuedRequest = beginWorkspaceBoundRequest();
    try {
      await actorSheetMutationQueueRef.current.enqueue(actor.id, async () => {
        if (!workspaceBoundRequestIsCurrent(queuedRequest)) return;
        await persistActorHp(actor, next, beginWorkspaceBoundRequest());
      });
    } finally {
      finishWorkspaceBoundRequest(queuedRequest);
    }
  }

  async function updateActorData(actor: Actor, patch: Record<string, unknown>) {
    // Apply the authoritative response immediately so sheet edits (conditions,
    // attributes) reflect on the board without waiting on a snapshot reload.
    const queuedRequest = beginWorkspaceBoundRequest();
    try {
      await actorSheetMutationQueueRef.current.enqueue(actor.id, async () => {
        if (!workspaceBoundRequestIsCurrent(queuedRequest)) return;
        await runWorkspaceBoundAction(
          (request) => {
            const latest = latestAuthoritativeActor(actor);
            const payload = {
              data: { ...latest.data, ...patch },
              expectedUpdatedAt: latest.updatedAt,
              ...(latest.systemId === "dnd-5e-srd" ? { manualOverrideReason: "Manual character-sheet state correction" } : {})
            };
            return apiPatch<Actor>(`/api/v1/actors/${actor.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`actor:data:${actor.id}`, latest.updatedAt, payload) });
          },
          (updated) => {
            applyActorToSnapshot(updated);
            setStatus(`${actor.name} sheet updated`);
          }
        );
      });
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(queuedRequest)) setStatus(errorMessage(error));
    } finally {
      finishWorkspaceBoundRequest(queuedRequest);
    }
  }

  async function awardActorXp(actor: Actor, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) return;
    const latestActor = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id) ?? actor;
    const currentXp = Math.max(0, Math.floor(numericValue(latestActor.data.xp, 0)));
    const nextXp = Math.max(0, currentXp + Math.floor(amount));
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id) ?? latestActor;
        const payload = {
          data: { ...latest.data, xp: nextXp },
          expectedUpdatedAt: latest.updatedAt,
          ...(latest.systemId === "dnd-5e-srd" ? { manualOverrideReason: "Manual character-sheet XP adjustment" } : {})
        };
        return apiPatch<Actor>(`/api/v1/actors/${actor.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`actor:xp:${actor.id}`, latest.updatedAt, payload) });
      },
      (updated) => {
        applyActorToSnapshot(updated);
        if (actor.id === selectedActor?.id && xpProgress?.nextLevelXp !== undefined && nextXp >= xpProgress.nextLevelXp) {
          setStatus(`${actor.name} has enough XP to level up!`);
        } else {
          setStatus(`${actor.name} ${amount > 0 ? "gained" : "lost"} ${formatNumber(Math.abs(Math.floor(amount)))} XP`);
        }
      }
    );
  }

  async function awardCombatRewards(input: { totalXp?: number; totalGp?: number; loot?: string[]; note?: string }) {
    const current = snapshotRef.current;
    const combat = current.combats.find((candidate) => candidate.active);
    if (!combat) throw new Error("Start combat before recording encounter rewards");
    const party = current.actors.filter((actor) => !isAdversaryActor(actor, current.tokens));
    const awardsCurrency = (input.totalXp ?? 0) > 0 || (input.totalGp ?? 0) > 0;
    if (awardsCurrency && party.length === 0) throw new Error("No party actors to award rewards");
    const actorRevisions = party.map((actor): [string, string] => [actor.id, actor.updatedAt]);
    const fingerprint = combatRewardIntentFingerprint({
      combatId: combat.id,
      recipientActorIds: party.map((actor) => actor.id),
      ...input
    });
    const attempt = combatRewardAttemptForIntent(combatRewardAttemptRef.current, fingerprint, () => window.crypto.randomUUID(), () => ({
      recipientActorIds: party.map((actor) => actor.id),
      totalXp: input.totalXp,
      totalGp: input.totalGp,
      loot: input.loot,
      note: input.note,
      expectedUpdatedAt: combat.updatedAt,
      expectedActorUpdatedAt: Object.fromEntries(actorRevisions)
    }));
    combatRewardAttemptRef.current = attempt;
    try {
      await runWorkspaceBoundAction(
        (request) => apiPost<{ combat: Combat; actors: Actor[]; reward: NonNullable<Combat["rewards"]>[number] }>(`/api/v1/combats/${combat.id}/rewards`, attempt.request, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey }),
        (result) => {
          invalidateInFlightRefreshes();
          const actorsById = new Map(result.actors.map((actor) => [actor.id, actor]));
          setSnapshot((snapshot) => ({
            ...snapshot,
            actors: snapshot.actors.map((actor) => actorsById.get(actor.id) ?? actor),
            combats: snapshot.combats.map((candidate) => (candidate.id === result.combat.id ? result.combat : candidate))
          }));
          const parts = [
            result.reward.totalXp > 0 ? `${formatNumber(result.reward.totalXp)} XP (${formatNumber(result.reward.xpPerActor)} each)` : "",
            result.reward.totalGp > 0 ? `${formatNumber(result.reward.totalGp)} gp (${formatNumber(result.reward.gpPerActor)} each)` : "",
            result.reward.loot.length > 0 ? `${formatNumber(result.reward.loot.length)} loot ${result.reward.loot.length === 1 ? "entry" : "entries"}` : ""
          ].filter(Boolean);
          setStatus(`Encounter rewards recorded: ${parts.join(", ")}`);
          if (combatRewardAttemptRef.current?.idempotencyKey === attempt.idempotencyKey) combatRewardAttemptRef.current = null;
        }
      );
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && combatRewardAttemptRef.current?.idempotencyKey === attempt.idempotencyKey) {
        combatRewardAttemptRef.current = null;
      }
      if (!reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      throw error;
    }
  }

  function awardPartyXp(total: number): Promise<void> {
    if (!Number.isFinite(total) || total <= 0) return Promise.reject(new Error("XP award must be greater than zero"));
    return awardCombatRewards({ totalXp: Math.floor(total) });
  }

  function awardPartyGold(totalGp: number): Promise<void> {
    if (!Number.isFinite(totalGp) || totalGp <= 0) return Promise.reject(new Error("Gold award must be greater than zero"));
    return awardCombatRewards({ totalGp: Math.floor(totalGp) });
  }

  function recordCombatLoot(loot: string, note?: string): Promise<void> {
    const entries = loot.split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean);
    if (entries.length === 0) return Promise.reject(new Error("Enter at least one loot item"));
    return awardCombatRewards({ loot: entries, note: note?.trim() || undefined });
  }

  // Condition toggles queue per actor and recompute from the latest known
  // actor revision at execution time. Applications use a stable retry key;
  // removals carry the same optimistic revision in the query string.
  function toggleActorCondition(actor: Actor, conditionId: string, options?: { overrideReason?: string }) {
    const previous = actorConditionQueueRef.current.get(actor.id) ?? Promise.resolve(undefined);
    const request = beginWorkspaceBoundRequest();
    const run = previous.then(async (previousActor) => {
      if (!workspaceBoundRequestIsCurrent(request)) return undefined;
      const latest = previousActor ?? snapshotRef.current.actors.find((item) => item.id === actor.id) ?? actor;
      const active = parseActorConditions(formatActorConditions(latest));
      const removing = active.includes(conditionId);
      const conditionPath = `/api/v1/campaigns/${latest.campaignId}/systems/${latest.systemId}/actors/${latest.id}/conditions`;
      const idempotencyKey = `condition:${latest.id}:${conditionId}:${removing ? "remove" : options?.overrideReason ? "override" : "apply"}:${latest.updatedAt}`;
      const result = removing
        ? await apiDelete<{ actor: Actor }>(`${conditionPath}/${encodeURIComponent(conditionId)}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, { signal: request.controller.signal, idempotencyKey })
        : await apiPost<{ actor: Actor }>(conditionPath, {
            conditionId,
            expectedUpdatedAt: latest.updatedAt,
            ...(options?.overrideReason ? { overrideReason: options.overrideReason } : {})
          }, { signal: request.controller.signal, idempotencyKey });
      const updated = result.actor;
      if (!workspaceBoundRequestIsCurrent(request)) return undefined;
      applyActorToSnapshot(updated);
      setStatus(`${updated.name} conditions updated`);
      return updated;
    });
    const settled = run.catch((error) => {
      if (workspaceBoundRequestIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      return undefined;
    }).finally(() => {
      finishWorkspaceBoundRequest(request);
      if (actorConditionQueueRef.current.get(actor.id) === settled) actorConditionQueueRef.current.delete(actor.id);
    });
    actorConditionQueueRef.current.set(actor.id, settled);
  }

  async function updateItemData(item: Item, patch: Record<string, unknown>) {
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.items.find((candidate) => candidate.id === item.id) ?? item;
        const payload = {
          data: { ...latest.data, ...patch },
          expectedUpdatedAt: latest.updatedAt,
          ...(latest.systemId === "dnd-5e-srd" ? { manualOverrideReason: "Manual character-sheet item state correction" } : {})
        };
        return apiPatch<Item>(`/api/v1/items/${item.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`item:data:${item.id}`, latest.updatedAt, payload) });
      },
      (updated) => {
        applyItemToSnapshot(updated);
        setStatus(`${item.name} updated`);
      }
    );
  }

  async function changeActorAttunement(actor: Actor, item: Item, attuned: boolean, options?: { breakCurse?: boolean; overrideReason?: string }) {
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id) ?? actor;
        return apiPost<{ actor: Actor; item: Item }>(`/api/v1/campaigns/${request.campaignId}/systems/${latest.systemId}/actors/${latest.id}/attunement`, {
          itemId: item.id,
          attuned,
          expectedUpdatedAt: latest.updatedAt,
          ...(options?.breakCurse ? { breakCurse: true } : {}),
          ...(options?.overrideReason ? { overrideReason: options.overrideReason } : {})
        }, {
          signal: request.controller.signal,
          idempotencyKey: `attunement:${latest.id}:${item.id}:${attuned}:${options?.breakCurse ? "break-curse" : "standard"}:${latest.updatedAt}`
        });
      },
      (updated) => {
        applyActorToSnapshot(updated.actor);
        applyItemToSnapshot(updated.item);
        setStatus(`${item.name} ${attuned ? "attuned" : options?.breakCurse ? "curse broken and unattuned" : "unattuned"}`);
      }
    );
  }

  async function assignItemToActor(item: Item, actor: Actor) {
    await runWorkspaceBoundAction(
      (request) => {
        const latest = snapshotRef.current.items.find((candidate) => candidate.id === item.id) ?? item;
        const payload = {
          actorId: actor.id,
          expectedUpdatedAt: latest.updatedAt,
          ...(latest.systemId === "dnd-5e-srd" ? { manualOverrideReason: "Manual inventory reassignment" } : {})
        };
        return apiPatch<Item>(`/api/v1/items/${item.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`item:assign:${item.id}`, latest.updatedAt, payload) });
      },
      (updated) => {
        applyItemToSnapshot(updated);
        setStatus(`Gave ${item.name} to ${actor.name}`);
      }
    );
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
    const attemptScope = "audio-track:url";
    const attempt = beginAppendMutation(attemptScope, { campaignId, ...input });
    try {
      await runWorkspaceBoundAction(
        (request) => apiPost<AudioTrack>(`/api/v1/campaigns/${request.campaignId}/audio`, input, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey }),
        async (_track, request) => {
          completeAppendMutation(attemptScope, attempt);
          setStatus(`Added ${input.name} to the soundboard`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function uploadAudioTrack(file: File, input: { name?: string; kind: AudioTrack["kind"]; loop: boolean }) {
    const name = input.name?.trim() || audioTrackNameFromFile(file);
    const uploadScope = "asset-audio";
    const uploadAttempt = beginAppendMutation(uploadScope, { campaignId, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, kind: input.kind });
    const trackScope = "audio-track:upload";
    let trackAttempt: AppendMutationAttempt | undefined;
    try {
      setStatus(`Uploading ${file.name} to the soundboard...`);
      await runWorkspaceBoundAction(
        async (request) => {
          const result = await apiUploadAsset({
            campaignId: request.campaignId,
            file,
            folder: "audio",
            tags: ["audio", input.kind]
          }, { signal: request.controller.signal, idempotencyKey: uploadAttempt.idempotencyKey });
          const payload = {
            name,
            url: result.asset.url,
            kind: input.kind,
            loop: input.loop
          };
          trackAttempt = beginAppendMutation(trackScope, { campaignId: request.campaignId, ...payload });
          return apiPost<AudioTrack>(`/api/v1/campaigns/${request.campaignId}/audio`, payload, { signal: request.controller.signal, idempotencyKey: trackAttempt.idempotencyKey });
        },
        async (_track, request) => {
          completeAppendMutation(uploadScope, uploadAttempt);
          if (trackAttempt) completeAppendMutation(trackScope, trackAttempt);
          setStatus(`Uploaded ${name} to the soundboard`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      setStatus(`Audio upload failed: ${errorMessage(error)}`);
    }
  }

  async function toggleAudioTrack(track: AudioTrack) {
    try {
      await runWorkspaceBoundAction(
        (request) => {
          const latest = snapshotRef.current.audioTracks.find((candidate) => candidate.id === track.id) ?? track;
          const payload = { playing: !latest.playing, expectedUpdatedAt: latest.updatedAt };
          return apiPatch<AudioTrack>(`/api/v1/audio/${track.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`audio:toggle:${track.id}`, latest.updatedAt, payload) });
        },
        async (_updated, request) => {
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function deleteAudioTrack(track: AudioTrack) {
    try {
      await runWorkspaceBoundAction(
        (request) => {
          const latest = snapshotRef.current.audioTracks.find((candidate) => candidate.id === track.id) ?? track;
          return apiDelete<AudioTrack>(`/api/v1/audio/${track.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`audio:delete:${track.id}`, latest.updatedAt, {}) });
        },
        async (_deleted, request) => {
          setStatus(`Removed ${track.name} from the soundboard`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
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
    if (resolvedUserPreferences(snapshot.session?.user ?? {}).reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    // A GM-only roll made by a player is returned to the caller once, but the
    // permission-filtered snapshot intentionally omits it. The 3D scheduler is
    // driven by snapshot rolls, so waiting for that hidden roll would leave the
    // live status stuck at "Rolling dice..." forever.
    if (
      roll.visibility === "gm_only" &&
      !hasPermission("chat.moderate") &&
      !hasPermission("journal.readSecret") &&
      !hasPermission("ai.readGmMemory")
    ) {
      return false;
    }
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
    const roll = await postDiceRoll("table", {
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
    const roll = await postDiceRoll(`template:${annotation.id}`, {
      campaignId,
      formula: annotation.templateDamageFormula,
      visibility: diceVisibility,
      label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template${saveLabel} damage`
    });
    setRollStatusAfterDiceReveal(roll, `Template damage ${roll.total}`);
    await refresh(campaignId, sceneId, { syncStatus: false });
  }

  async function prepareAndApplyDndTypedDamage(targets: Actor[], amount: number, damageType: string | undefined, reviewLabel: string, request: WorkspaceBoundRequest, targetAmounts?: Map<string, number>): Promise<TypedDamageApplyResult | undefined> {
    const uniqueTargets = [...new Map(targets.map((actor) => [actor.id, actor])).values()];
    const primary = uniqueTargets[0];
    if (!primary) return undefined;
    const path = `/api/v1/campaigns/${request.campaignId}/systems/dnd-5e-srd/actors/${primary.id}`;
    const prepared = await apiPost<PreparedTypedDamageResponse>(`${path}/rules-preview`, {
      operation: "typed-damage",
      prepare: true,
      amount,
      damageType: damageType?.trim() || "untyped",
      targetActorIds: uniqueTargets.slice(1).map((actor) => actor.id),
      ...(targetAmounts ? { targetDamages: uniqueTargets.map((actor) => ({ actorId: actor.id, amount: targetAmounts.get(actor.id) ?? amount })) } : {})
    }, {
      signal: request.controller.signal,
      idempotencyKey: `template-damage-preview:${globalThis.crypto.randomUUID()}`
    });
    if (prepared.status !== "ready" || !prepared.preparation) throw new Error(prepared.blockers[0]?.message ?? "Template damage is not ready to apply.");
    if (!await consequenceReview.review(typedDamageConsequenceReview({ label: reviewLabel, damageType: damageType?.trim() || "untyped", amount, prepared, ...(targetAmounts ? { targetAmounts } : {}) }))) {
      throw new Error("Template damage cancelled after review.");
    }
    const applied = await apiPost<TypedDamageApplyResult>(`${path}/typed-damage/apply`, {
      preparedPreviewKey: prepared.preparation.preparedPreviewKey,
      expectedActorUpdatedAt: prepared.preparation.actorUpdatedAt,
      expectedItemUpdatedAt: prepared.preparation.itemUpdatedAt,
      ...(prepared.preparation.combatUpdatedAt ? { expectedCombatUpdatedAt: prepared.preparation.combatUpdatedAt } : {})
    }, {
      signal: request.controller.signal,
      idempotencyKey: `template-damage-commit:${globalThis.crypto.randomUUID()}`
    });
    if (workspaceBoundRequestIsCurrent(request)) applyTypedDamageResult(applied);
    return applied;
  }

  async function applyDamageToAffectedToken(token: Token, amount: number, damageType: string | undefined, outcomeLabel: string | undefined, actorOverrides: Map<string, Actor>, request: WorkspaceBoundRequest): Promise<boolean> {
    if (!workspaceBoundRequestIsCurrent(request)) return false;
    const actor = token.actorId ? actorOverrides.get(token.actorId) ?? snapshot.actors.find((item) => item.id === token.actorId) : undefined;
    const adjusted = adjustedTemplateDamage(actor, token, amount, damageType);
    const hp = actorHitPoints(actor);
    if (actor?.systemId === "dnd-5e-srd" && hp && hasPermission("actor.update")) {
      throw new Error("D&D actor damage must use the reviewed typed-damage flow.");
    }
    if (actor && hp && hasPermission("actor.update")) {
      const concentrationNote = adjusted.notes.find((note) => note.startsWith("concentration DC "));
      const payload = {
        data: {
          ...actor.data,
          hp: { ...hp, current: Math.max(0, hp.current - adjusted.amount) },
          ...(concentrationNote ? { conditions: appendActorCondition(actor, concentrationNote) } : {})
        },
        expectedUpdatedAt: actor.updatedAt
      };
      const nextActor = await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`actor:template-damage:${actor.id}`, actor.updatedAt, payload) });
      if (!workspaceBoundRequestIsCurrent(request)) return false;
      actorOverrides.set(actor.id, nextActor);
      applyActorToSnapshot(nextActor);
      return true;
    }
    if (!hasPermission("token.update")) return false;
    const noteLabel = adjusted.notes.length > 0 ? ` (${adjusted.notes.join("; ")})` : "";
    const damageLabel = `${outcomeLabel ? `${outcomeLabel} - ` : ""}Damaged ${adjusted.amount}${damageType ? ` ${damageType}` : ""}${noteLabel}`;
    const nextConditions = [...(token.conditions ?? []).filter((condition) => condition.id !== slugId(damageLabel)), { id: slugId(damageLabel), name: damageLabel }];
    const latestToken = snapshotRef.current.tokens.find((candidate) => candidate.id === token.id) ?? token;
    const tokenPayload = { conditions: nextConditions, expectedUpdatedAt: latestToken.updatedAt };
    const updated = await apiPatch<Token>(`/api/v1/tokens/${token.id}`, tokenPayload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`token:template-damage:${token.id}`, latestToken.updatedAt, tokenPayload) });
    if (!workspaceBoundRequestIsCurrent(request)) return false;
    applyTokensToSnapshot([updated]);
    return true;
  }

  async function postDiceRoll(
    scope: string,
    payload: { campaignId: string; formula: string; visibility?: DiceRoll["visibility"]; label?: string; clientSeed?: string },
    signal?: AbortSignal
  ): Promise<DiceRoll> {
    const attemptScope = `dice-roll:${scope}`;
    const attempt = beginAppendMutation(attemptScope, payload);
    const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", payload, { signal, idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(attemptScope, attempt);
    return roll;
  }

  async function applyTemplateDamage(annotation: SceneAnnotation) {
    if (!annotation.templateDamageFormula) {
      setStatus("No template damage formula");
      return;
    }
    const damageFormula = annotation.templateDamageFormula;
    const affectedTokenIds = annotation.affectedTokenIds ?? [];
    const affectedTokens = snapshot.tokens.filter((token) => affectedTokenIds.includes(token.id));
    if (affectedTokens.length === 0) {
      setStatus("No affected tokens to damage");
      return;
    }
    const saveLabel = annotation.templateSaveDc ? ` DC ${annotation.templateSaveDc}` : "";
    const targetSceneId = selectedScene?.id ?? sceneId;
    await runWorkspaceBoundAction(
      async (request) => {
        const roll = await postDiceRoll(`template-damage:${annotation.id}`, {
          campaignId: request.campaignId,
          formula: damageFormula,
          visibility: diceVisibility,
          label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template${saveLabel} damage`
        }, request.controller.signal);
        let appliedCount = 0;
        const actorOverrides = new Map<string, Actor>();
        const dndTargets = affectedTokens.flatMap((token) => {
          const actor = token.actorId ? snapshot.actors.find((candidate) => candidate.id === token.actorId) : undefined;
          return actor?.systemId === "dnd-5e-srd" && hasPermission("actor.update") ? [actor] : [];
        });
        const dndResult = await prepareAndApplyDndTypedDamage(dndTargets, roll.total, annotation.templateDamageType, `${titleCaseLabel(annotation.templateShape ?? "circle")} template${saveLabel}`, request);
        const appliedDndActorIds = new Set(dndResult?.actors.map((actor) => actor.id) ?? []);
        for (const actor of dndResult?.actors ?? []) actorOverrides.set(actor.id, actor);
        for (const token of affectedTokens) {
          if (token.actorId && appliedDndActorIds.has(token.actorId)) {
            appliedCount += 1;
            continue;
          }
          if (await applyDamageToAffectedToken(token, roll.total, annotation.templateDamageType, undefined, actorOverrides, request)) appliedCount += 1;
        }
        return appliedCount;
      },
      (appliedCount, request) => {
        setStatus(`Applied template damage to ${appliedCount} tokens`);
        void refresh(request.campaignId, targetSceneId, { syncStatus: false });
      }
    );
  }

  async function resolveTemplateSaves(annotation: SceneAnnotation) {
    if (!annotation.templateDamageFormula) {
      setStatus("No template damage formula");
      return;
    }
    const damageFormula = annotation.templateDamageFormula;
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
    const targetSceneId = selectedScene?.id ?? sceneId;
    await runWorkspaceBoundAction(
      async (request) => {
        const damageRoll = await postDiceRoll(`template-save-damage:${annotation.id}`, {
          campaignId: request.campaignId,
          formula: damageFormula,
          visibility: diceVisibility,
          label: `${titleCaseLabel(annotation.templateShape ?? "circle")} template save damage`
        }, request.controller.signal);
        const resolvedTokens: Array<{ token: Token; actor?: Actor; damage: number; outcomeLabel: string }> = [];
        for (const token of affectedTokens) {
          if (!workspaceBoundRequestIsCurrent(request)) break;
          const actor = token.actorId ? snapshot.actors.find((item) => item.id === token.actorId) : undefined;
          const saveRoll = await postDiceRoll(`template-save:${annotation.id}:${token.id}`, {
            campaignId: request.campaignId,
            formula: actorSaveFormula(actor, saveAbility),
            visibility: diceVisibility,
            label: `${token.name} ${titleCaseLabel(saveAbility)} save`
          }, request.controller.signal);
          const success = saveRoll.total >= saveDc;
          const damage = success ? Math.floor(damageRoll.total / 2) : damageRoll.total;
          const outcomeLabel = `${success ? "Saved" : "Failed"} ${titleCaseLabel(saveAbility)} ${saveRoll.total} vs DC ${saveDc}`;
          resolvedTokens.push({ token, ...(actor ? { actor } : {}), damage, outcomeLabel });
        }
        const dndTargets: Actor[] = [];
        const dndTargetAmounts = new Map<string, number>();
        const groupedDndActorIds = new Set<string>();
        for (const result of resolvedTokens) {
          if (result.actor?.systemId !== "dnd-5e-srd" || !hasPermission("actor.update")) continue;
          if (groupedDndActorIds.has(result.actor.id)) continue;
          groupedDndActorIds.add(result.actor.id);
          dndTargets.push(result.actor);
          dndTargetAmounts.set(result.actor.id, result.damage);
        }
        const actorOverrides = new Map<string, Actor>();
        const appliedDndActorIds = new Set<string>();
        const appliedDnd = await prepareAndApplyDndTypedDamage(dndTargets, damageRoll.total, annotation.templateDamageType, `${titleCaseLabel(saveAbility)} save damage`, request, dndTargetAmounts);
        for (const actor of appliedDnd?.actors ?? []) {
          actorOverrides.set(actor.id, actor);
          appliedDndActorIds.add(actor.id);
        }
        let appliedCount = 0;
        for (const result of resolvedTokens) {
          if (result.actor && appliedDndActorIds.has(result.actor.id)) {
            appliedCount += 1;
            continue;
          }
          if (await applyDamageToAffectedToken(result.token, result.damage, annotation.templateDamageType, result.outcomeLabel, actorOverrides, request)) appliedCount += 1;
        }
        return appliedCount;
      },
      (appliedCount, request) => {
        setStatus(`Resolved saves for ${appliedCount} tokens`);
        void refresh(request.campaignId, targetSceneId, { syncStatus: false });
      }
    );
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
      const payload = {
        name: formula,
        formula,
        visibility: "public"
      };
      const attemptScope = "dice-macro:create";
      const attempt = beginAppendMutation(attemptScope, { campaignId, ...payload });
      await apiPost(`/api/v1/campaigns/${campaignId}/dice-macros`, payload, { idempotencyKey: attempt.idempotencyKey });
      completeAppendMutation(attemptScope, attempt);
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
    const submittedBody = chatBody;
    const submittedReplyToMessageId = chatReplyToMessageId;
    const submittedReplyTargetId = chatReplyTarget?.id;
    const parsed = parseChatCommand(submittedBody);
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
      const request = currentWorkspaceRequestIdentity();
      const roll = await postDiceRoll("chat-command", {
        campaignId: request.campaignId,
        formula: parsed.formula,
        visibility: parsed.visibility,
        label: "Table roll"
      });
      if (!workspaceIdentityIsCurrent(request)) return;
      setChatBody((current) => current === submittedBody ? "" : current);
      setChatReplyToMessageId((current) => current === submittedReplyToMessageId ? "" : current);
      setRollStatusAfterDiceReveal(roll, `Rolled ${roll.total}`);
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
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
    const request = currentWorkspaceRequestIdentity();
    const payload = {
      campaignId: request.campaignId,
      body: parsed.body,
      type: parsed.messageType,
      visibility: parsed.visibility,
      recipientUserIds: recipientUserId ? [recipientUserId] : [],
      replyToMessageId: submittedReplyTargetId
    };
    const attemptScope = "chat:create";
    const attempt = beginAppendMutation(attemptScope, payload);
    await apiPost<ChatMessage>("/api/v1/chat/messages", payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(attemptScope, attempt);
    if (!workspaceIdentityIsCurrent(request)) return;
    setChatBody((current) => current === submittedBody ? "" : current);
    setChatReplyToMessageId((current) => current === submittedReplyToMessageId ? "" : current);
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
  }

  async function editChatMessage(message: ChatMessage, body: string) {
    if (message.userId !== currentUserId) throw new Error("You can only edit your own messages.");
    const request = currentWorkspaceRequestIdentity();
    if (blankCanvasDemoOpen) {
      const editedAt = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        chat: current.chat.map((item) => item.id === message.id ? { ...item, body, editedAt, editedByUserId: currentUserId, updatedAt: editedAt } : item)
      }));
      setStatus("Demo message edited locally");
      return;
    }
    const latest = snapshotRef.current.chat.find((candidate) => candidate.id === message.id) ?? message;
    const payload = { body, expectedUpdatedAt: latest.updatedAt };
    const updated = await runSharedMutation(() => apiPatch<ChatMessage>(`/api/v1/chat/messages/${message.id}`, payload, {
      idempotencyKey: sharedMutationIdempotencyKey(`chat:edit:${message.id}`, latest.updatedAt, payload)
    }), request.campaignId, realtimeSelectionRef.current.sceneId);
    if (!workspaceIdentityIsCurrent(request)) return;
    setSnapshot((current) => ({ ...current, chat: current.chat.map((item) => item.id === updated.id ? updated : item) }));
    setStatus("Message edited");
  }

  async function deleteChatMessage(message: ChatMessage) {
    const request = currentWorkspaceRequestIdentity();
    if (blankCanvasDemoOpen) {
      setSnapshot((current) => ({ ...current, chat: current.chat.filter((item) => item.id !== message.id) }));
      setStatus("Demo message deleted locally");
      return;
    }
    const latest = snapshotRef.current.chat.find((candidate) => candidate.id === message.id) ?? message;
    await runSharedMutation(() => apiDelete<ChatMessage>(`/api/v1/chat/messages/${message.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, {
      idempotencyKey: sharedMutationIdempotencyKey(`chat:delete:${message.id}`, latest.updatedAt, {})
    }), request.campaignId, realtimeSelectionRef.current.sceneId);
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus("Chat message deleted");
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
  }

  async function moderateChatMessage(message: ChatMessage, moderationStatus: ChatModerationResolution) {
    const request = currentWorkspaceRequestIdentity();
    if (blankCanvasDemoOpen) {
      const moderatedAt = new Date().toISOString();
      setSnapshot((current) => ({
        ...current,
        chat: current.chat.map((item) => item.id === message.id ? { ...item, moderationStatus, moderatedByUserId: currentUserId, moderatedAt, updatedAt: moderatedAt } : item)
      }));
      setStatus(`Demo message marked ${titleCaseLabel(moderationStatus)}`);
      return;
    }
    const latest = snapshotRef.current.chat.find((candidate) => candidate.id === message.id) ?? message;
    const payload = { moderationStatus, expectedUpdatedAt: latest.updatedAt };
    await runSharedMutation(() => apiPatch<ChatMessage>(`/api/v1/chat/messages/${message.id}/moderation`, payload, {
      idempotencyKey: sharedMutationIdempotencyKey(`chat:moderate:${message.id}`, latest.updatedAt, payload)
    }), request.campaignId, realtimeSelectionRef.current.sceneId);
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus(`Chat message marked ${titleCaseLabel(moderationStatus)}`);
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
  }

  async function exportChatHistory(format: ChatExportFormat) {
    const response = await fetch(`${apiBase}/api/v1/campaigns/${campaignId}/chat/export?format=${format}`, {
      headers: { authorization: `Bearer ${getSessionToken()}` },
      credentials: "include"
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
    if (journal.campaignId !== realtimeSelectionRef.current.campaignId) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({ ...current, journals: upsertNewestPrependedRealtimeRecord(current.journals, journal) }));
  }

  async function createJournal(options: JournalCreateOptions) {
    const request = currentWorkspaceRequestIdentity();
    const title = options.title.trim();
    const actorOwnerUserIds = options.visibleToActorIds
      .map((actorId) => snapshotRef.current.actors.find((actor) => actor.id === actorId)?.ownerUserId)
      .filter((userId): userId is string => Boolean(userId));
    const visibleToUserIds = [...new Set([...options.visibleToUserIds, ...actorOwnerUserIds])];
    const journal = await apiPost<JournalEntry>(`/api/v1/campaigns/${request.campaignId}/journal`, {
      kind: options.kind,
      parentId: options.parentId,
      title: title || "New Journal Entry",
      body: options.body.trim(),
      visibility: options.visibility,
      visibleToUserIds,
      visibleToActorIds: options.visibleToActorIds,
      tags: options.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      links: options.links,
    }, { idempotencyKey: options.idempotencyKey });
    if (!workspaceIdentityIsCurrent(request)) return;
    applyJournalToSnapshot(journal);
    setStatus("Journal entry created");
  }

  async function updateJournal(journal: JournalEntry, input: JournalDraft) {
    const request = currentWorkspaceRequestIdentity();
    const updated = await updateJournalEntry(journal.id, input);
    if (!workspaceIdentityIsCurrent(request)) return;
    applyJournalToSnapshot(updated);
    setStatus(`${updated.title} updated`);
  }

  async function deleteJournal(journal: JournalEntry, idempotencyKey: string) {
    const request = currentWorkspaceRequestIdentity();
    await deleteJournalEntry(journal.id, journal.updatedAt, idempotencyKey);
    if (!workspaceIdentityIsCurrent(request)) return;
    invalidateInFlightRefreshes();
    setSnapshot((current) => ({ ...current, journals: current.journals.filter((candidate) => candidate.id !== journal.id) }));
    setStatus(`${journal.title} deleted`);
  }

  async function reviewJournalCanon(journal: JournalEntry, canonStatus: JournalCanonStatus, note: string, idempotencyKey: string) {
    const request = currentWorkspaceRequestIdentity();
    const reviewed = await apiPost<JournalEntry>(`/api/v1/journal/${journal.id}/canon-review`, {
      status: canonStatus,
      note: note.trim() || undefined,
      expectedUpdatedAt: journal.updatedAt,
    }, { idempotencyKey });
    if (!workspaceIdentityIsCurrent(request)) return;
    applyJournalToSnapshot(reviewed);
    setStatus(`${reviewed.title} canon review: ${(reviewed.canonStatus ?? "draft").replace("_", " ")}`);
  }

  async function generateSessionRecap(visibility: Visibility, idempotencyKey: string, sessionId?: string) {
    const request = currentWorkspaceRequestIdentity();
    const journal = await apiPost<JournalEntry>(`/api/v1/campaigns/${request.campaignId}/journal`, sessionRecapJournalPayload(snapshot, visibility, new Date(), sessionId), { idempotencyKey });
    if (!workspaceIdentityIsCurrent(request)) return;
    applyJournalToSnapshot(journal);
    setStatus("Session recap added to the journal");
  }

  async function openCombatSetup() {
    if (activeCombat) {
      setTab("combat");
      setStatus("End the active combat before starting another");
      return;
    }
    if (!selectedScene) {
      setStatus("Select a scene before starting combat");
      return;
    }
    setTab("combat");
    setCombatSetupOpen(true);
  }

  async function startCombat(input: CombatSetupSubmission) {
    const request = currentWorkspaceRequestIdentity();
    const requestSceneId = realtimeSelectionRef.current.sceneId;
    const latest = await refresh(request.campaignId, requestSceneId, { syncStatus: false });
    if (!workspaceIdentityIsCurrent(request) || realtimeSelectionRef.current.sceneId !== requestSceneId) {
      throw new Error("The active scene changed. Review combatants again.");
    }
    const requestedTokenIds = new Set(input.tokenIds);
    const participantTokens = latest.tokens.filter((token) => token.sceneId === requestSceneId && token.layer !== "map" && requestedTokenIds.has(token.id));
    if (participantTokens.length !== requestedTokenIds.size) {
      throw new Error("One or more selected tokens changed. Review combatants again.");
    }
    const tokenById = new Map(participantTokens.map((token) => [token.id, token]));
    const surprisedTokenIds = new Set(input.surprisedTokenIds);
    const participants = input.tokenIds.map((tokenId) => {
      const initiative = input.manualInitiatives[tokenId];
      if (Number.isFinite(initiative)) return { tokenId, initiativeMode: "manual" as const, initiative, ...(input.surpriseEnabled ? { surprised: surprisedTokenIds.has(tokenId) } : {}) };
      if (!input.rollNpcInitiative) throw new Error(`Initiative is required for ${tokenById.get(tokenId)?.name ?? tokenId}.`);
      return { tokenId, initiativeMode: "server" as const, ...(input.surpriseEnabled ? { surprised: surprisedTokenIds.has(tokenId) } : {}) };
    });
    const campaign = latest.campaigns.find((candidate) => candidate.id === request.campaignId);
    if (!campaign) throw new Error("Campaign changed while combat setup was open. Review and retry.");
    const combatPayload = {
      sceneId: requestSceneId,
      participants,
      manualTurnOrder: input.manualTurnOrder,
      expectedUpdatedAt: campaign.updatedAt
    };
    const result = await apiPost<{ combat: Combat; rolls: DiceRoll[]; chatMessages: ChatMessage[] }>(`/api/v1/campaigns/${request.campaignId}/combats/start`, combatPayload, { idempotencyKey: input.idempotencyKey });
    if (!workspaceIdentityIsCurrent(request)) return;
    const startedCombat = result.combat;
    setCombatSetupOpen(false);
    setTab("combat");
    try {
      await refresh(request.campaignId, requestSceneId, { syncStatus: false });
    } catch (error) {
      setStatus(`Combat started; refresh failed: ${errorMessage(error)}`);
      return;
    }
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus(`Combat started with ${formatNumber(startedCombat.combatants.length)} confirmed combatants`);
    selectCombatantToken(startedCombat.combatants[startedCombat.turnIndex] ?? startedCombat.combatants[0]);
  }

  async function updateCombat(combat: Combat, patch: Partial<Combat>) {
    const request = currentWorkspaceRequestIdentity();
    try {
      const snapshotCombat = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id);
      // Prefer whichever revision is newer: a stale-write retry passes a combat
      // fresher than the snapshot, which only reconciles after the next render.
      const latest = snapshotCombat && snapshotCombat.updatedAt > combat.updatedAt ? snapshotCombat : combat;
      const payload = { ...patch, expectedUpdatedAt: latest.updatedAt };
      const updated = await apiPatch<Combat>(`/api/v1/combats/${combat.id}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`combat:update:${combat.id}`, latest.updatedAt, payload) });
      if (!workspaceIdentityIsCurrent(request)) return;
      applyCombatToSnapshot(updated);
      setStatus("Combat updated");
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
      if (!workspaceIdentityIsCurrent(request)) return;
      selectCombatantToken(updated.combatants[updated.turnIndex] ?? updated.combatants[0]);
    } catch (error) {
      if (workspaceIdentityIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      throw error;
    }
  }
  async function advanceCombatTurn(combat: Combat, direction: 1 | -1) {
    if (combat.combatants.length === 0) return;
    const snapshotCombat = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id);
    const attempted = snapshotCombat && snapshotCombat.updatedAt > combat.updatedAt ? snapshotCombat : combat;
    const next = nextCombatTurnPosition(attempted, direction);
    try {
      await updateCombat(attempted, {
        turnIndex: next.turnIndex,
        round: next.round
      });
    } catch (error) {
      // A concurrent server write (rules progression, sheet sync, another
      // client) can bump the combat revision without moving the turn. Rebase
      // on the authoritative state from the structured conflict and retry the
      // advance exactly once when the turn position is unchanged; any other
      // conflict keeps the reconciled state for explicit review.
      const refreshed = staleWriteCurrentCombat(error, combat.id);
      if (!refreshed || !combatTurnAdvanceRetryIsSafe(attempted, refreshed)) throw error;
      const retryNext = nextCombatTurnPosition(refreshed, direction);
      await updateCombat(refreshed, {
        turnIndex: retryNext.turnIndex,
        round: retryNext.round
      });
    }
  }

  async function updateCombatant(combat: Combat, combatantId: string, patch: Partial<Combat["combatants"][number]>) {
    const request = currentWorkspaceRequestIdentity();
    const combatant = combat.combatants.find((candidate) => candidate.id === combatantId);
    const syncActorSheet = Boolean(
      combatant?.actorId &&
        hasPermission("actor.update") &&
        (patch.readiness !== undefined || patch.defeated !== undefined || patch.conditions !== undefined || patch.deathSaveSuccesses !== undefined || patch.deathSaveFailures !== undefined || patch.resourceUsed !== undefined)
    );
    try {
      const latest = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id) ?? combat;
      const actor = combatant?.actorId ? snapshotRef.current.actors.find((candidate) => candidate.id === combatant.actorId) : undefined;
      const payload = { ...patch, syncActorSheet, expectedUpdatedAt: latest.updatedAt, ...(syncActorSheet && actor ? { expectedActorUpdatedAt: actor.updatedAt } : {}) };
      const updated = await apiPatch<Combat | Dnd5eSrdCombatantSyncMutationResult>(`/api/v1/combats/${combat.id}/combatants/${combatantId}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`combat:combatant:${combat.id}:${combatantId}`, latest.updatedAt, payload) });
      if (!workspaceIdentityIsCurrent(request)) return;
      const updatedCombat = "combat" in updated ? updated.combat : updated;
      applyCombatToSnapshot(updatedCombat);
      if ("combat" in updated) { applyActorToSnapshot(updated.actor); setLastDndRulesUndo(updated.undo); }
      setStatus("Combatant updated");
      selectCombatantToken(updatedCombat.combatants.find((candidate) => candidate.id === combatantId));
    } catch (error) {
      if (workspaceIdentityIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      throw error;
    }
  }

  async function deleteActor(actor: Actor) { const request = currentWorkspaceRequestIdentity(); await import("./actor-lifecycle-client.js").then(({ deleteCampaignActor }) => deleteCampaignActor({ actor, actors: snapshotRef.current.actors, sceneId: realtimeSelectionRef.current.sceneId, runMutation: runSharedMutation, isCurrent: () => workspaceIdentityIsCurrent(request), onDeleted: (nextActorId) => { actorSheetAuthoritativeRef.current.delete(actor.id); setSelectedActorId(nextActorId); setSelectedTokenIdState(""); setSelectedTokenIds([]); setSelectedBoardAssetId(""); setStatus(`${actor.name} deleted; linked records cleaned up`); }, onError: (error) => setStatus(errorMessage(error)), refresh: () => refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }) })); }
  async function commitDndCombatVitals(actor: Actor, kind: Dnd5eSrdCombatVitalsKind, amount: number, combat?: Combat, signal?: AbortSignal): Promise<Dnd5eSrdCombatVitalsMutationResult> {
    const latestActor = snapshotRef.current.actors.find((candidate) => candidate.id === actor.id) ?? actor;
    const latestCombat = snapshotRef.current.combats.find((candidate) => candidate.active && candidate.combatants.some((entry) => entry.actorId === actor.id)) ?? combat;
    const payload = { kind, amount, expectedActorUpdatedAt: latestActor.updatedAt, ...(latestCombat ? { expectedCombatUpdatedAt: latestCombat.updatedAt } : {}) };
    const result = await apiPost<Dnd5eSrdCombatVitalsMutationResult>(`/api/v1/campaigns/${latestActor.campaignId}/systems/${latestActor.systemId}/actors/${latestActor.id}/combat-vitals`, payload, { idempotencyKey: `combat-vitals:${window.crypto.randomUUID()}`, signal });
    applyActorToSnapshot(result.actor);
    if (result.combat) applyCombatToSnapshot(result.combat);
    setLastDndRulesUndo(result.undo);
    return result;
  }
  async function adjustCombatVitals(actor: Actor, kind: Dnd5eSrdCombatVitalsKind, amount: number, combat: Combat): Promise<void> {
    const request = currentWorkspaceRequestIdentity();
    try {
      const result = await commitDndCombatVitals(actor, kind, amount, combat);
      if (!workspaceIdentityIsCurrent(request)) return;
      setStatus(kind === "healing" ? `${actor.name} healed ${formatNumber(result.adjustment.appliedAmount)} HP` : `${actor.name} temporary HP set to ${formatNumber(result.adjustment.after)}`);
    } catch (error) {
      if (workspaceIdentityIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(`Combat vitals failed: ${errorMessage(error)}`);
      throw error;
    }
  }
  async function addCombatantToActiveCombat(combat: Combat, token: Token, initiative: number): Promise<void> {
    const latest = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id) ?? combat;
    if (latest.combatants.some((combatant) => combatant.tokenId === token.id)) return;
    const actor = token.actorId ? snapshotRef.current.actors.find((candidate) => candidate.id === token.actorId) : undefined;
    const combatant: Combat["combatants"][number] = { id: `cmbt_${window.crypto.randomUUID()}`, tokenId: token.id, ...(actor ? { actorId: actor.id } : {}), name: token.name, initiative, defeated: false, readiness: "normal", conditions: [] };
    await updateCombat(latest, combatRosterPatch(latest, [...latest.combatants, combatant]));
  }
  async function removeCombatantFromActiveCombat(combat: Combat, combatantId: string): Promise<void> {
    const latest = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id) ?? combat;
    if (!latest.combatants.some((combatant) => combatant.id === combatantId)) return;
    await updateCombat(latest, combatRosterPatch(latest, latest.combatants.filter((combatant) => combatant.id !== combatantId)));
  }
  async function spendLegendaryAction(combat: Combat, prompt: CombatLegendaryActionPrompt, optionName: string, cost: number): Promise<void> {
    const request = currentWorkspaceRequestIdentity();
    await recordLegendaryActionSpend({
      snapshot: snapshotRef.current, combat, prompt, optionName, cost,
      isCurrent: () => workspaceIdentityIsCurrent(request),
      onApplied: (result, status) => { applyActorToSnapshot(result.actor); applyCombatToSnapshot(result.combat); setStatus(status); },
      onError: (error) => { if (!reconcileStaleWriteConflict(error)) setStatus(`Legendary action failed: ${errorMessage(error)}`); }
    });
  }
  async function endCombat(combat: Combat) {
    const request = currentWorkspaceRequestIdentity();
    const latest = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id) ?? combat;
    await runSharedMutation(() => apiDelete<Combat>(`/api/v1/combats/${combat.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`combat:end:${combat.id}`, latest.updatedAt, {}) }), request.campaignId, realtimeSelectionRef.current.sceneId);
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus("Combat ended");
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
  }
  async function confirmCombatAction(combat: Combat, action: CombatAction) {
    const request = currentWorkspaceRequestIdentity();
    if (!action.preparedPreviewKey || !action.expectedCombatUpdatedAt || !action.expectedActorUpdatedAt || !action.expectedItemUpdatedAt) {
      setStatus("This legacy pending action must be reviewed and prepared again before it can be confirmed.");
      return;
    }
    try {
      const result = await apiPost<CommittedActorActionResponse>(`/api/v1/combats/${combat.id}/actions/${action.id}/confirm`, {
        expectedUpdatedAt: action.expectedCombatUpdatedAt,
        expectedActorUpdatedAt: action.expectedActorUpdatedAt,
        expectedItemUpdatedAt: action.expectedItemUpdatedAt
      }, { idempotencyKey: `pending-action-confirm:${action.id}` });
      if (!workspaceIdentityIsCurrent(request)) return;
      if (result.undo) setLastDndRulesUndo(result.undo);
    } catch (error) {
      if (workspaceIdentityIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      throw error;
    }
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus(`${action.actionLabel} confirmed`);
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
  }
  async function rejectCombatAction(combat: Combat, action: CombatAction) {
    const request = currentWorkspaceRequestIdentity();
    const latest = snapshotRef.current.combats.find((candidate) => candidate.id === combat.id) ?? combat;
    const payload = { expectedUpdatedAt: latest.updatedAt };
    try {
      await apiPost(`/api/v1/combats/${combat.id}/actions/${action.id}/reject`, payload, {
        idempotencyKey: sharedMutationIdempotencyKey(`combat-action:reject:${combat.id}:${action.id}`, latest.updatedAt, payload)
      });
    } catch (error) {
      if (workspaceIdentityIsCurrent(request) && !reconcileStaleWriteConflict(error)) setStatus(errorMessage(error));
      throw error;
    }
    if (!workspaceIdentityIsCurrent(request)) return;
    setStatus(`${action.actionLabel} rejected`);
    await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
  }

  async function runWorkspaceBoundAiRequest<T>(label: string, task: (request: WorkspaceBoundRequest) => Promise<T>, successMessage: (result: T) => string) {
    const request = beginWorkspaceBoundRequest();
    try {
      const result = await task(request);
      if (!workspaceBoundRequestIsCurrent(request)) return;
      setStatus(successMessage(result));
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(request)) setStatus(`${label} failed: ${errorMessage(error)}`);
    } finally {
      finishWorkspaceBoundRequest(request);
    }
  }

  async function askAi() {
    const prompt = aiPrompt;
    const scene = selectedScene;
    await runWorkspaceBoundAiRequest("Encounter proposal", (request) => apiPost(`/api/v1/campaigns/${request.campaignId}/ai/encounter-design`, {
      prompt,
      expectedUpdatedAt: request.campaignUpdatedAt,
      difficulty: "standard",
      sceneName: "AI Draft Encounter Scene",
      sceneWidth: scene?.width,
      sceneHeight: scene?.height,
      gridSize: scene?.gridSize
    }, { signal: request.controller.signal, idempotencyKey: `ai-encounter-design:${globalThis.crypto.randomUUID()}` }), () => "Encounter and scene proposal drafted");
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

  function clearPendingAiAgentAssistantMessage() {
    const pendingAssistantId = aiAgentPendingAssistantIdRef.current;
    if (!pendingAssistantId) return;
    aiAgentPendingAssistantIdRef.current = null;
    setAiAgentMessages((messages) => messages.filter((message) => message.id !== pendingAssistantId));
  }

  function startNewAiAgentChat() {
    if (aiAgentBusyRef.current) return;
    aiAgentPendingAuthRequestRef.current = null;
    clearAiAgentAuthRetry();
    aiAgentLiveThreadIdRef.current = null;
    aiAgentPendingAssistantIdRef.current = null;
    setAiAgentCodexAuth(null);
    setAiAgentHiddenProposalIds(new Set());
    setAiAgentMessages([]);
    persistAiAgentMessages(aiAgentHistoryKey, []);
    setAiAgentPrompt("");
    setAiAgentStatus("New agent chat started");
  }

  async function sendAiAgentMessage() {
    const prompt = aiAgentPrompt.trim();
    if (!prompt) return;
    if (isAiAgentClearCommand(prompt)) {
      startNewAiAgentChat();
      return;
    }
    if (aiAgentBusyRef.current) return;
    const attachedReferenceAssetId = selectedAiAgentReferenceAsset?.id;
    const selectedAssetId = attachedReferenceAssetId ?? aiAgentSelectedAssetId;
    const userMessage: AiAgentMessage = { id: `agent-user-${Date.now()}`, role: "user", content: prompt, createdAt: new Date().toISOString() };
    const requestMessages = [...aiAgentMessages, userMessage];
    aiAgentPendingAuthRequestRef.current = null;
    clearAiAgentAuthRetry();
    setAiAgentMessages((messages) => [...messages, userMessage]);
    setAiAgentPrompt("");
    try {
      await submitAiAgentTurn({ prompt, requestMessages, selectedAssetId });
    } finally {
      if (attachedReferenceAssetId) clearAiAgentReferenceAsset();
    }
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
    if (aiAgentBusyRef.current && !options.authRetry) return;
    const requestCampaignId = campaignId;
    const requestUserId = currentUserId;
    aiAgentBusyRef.current = true;
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
      if (aiAgentApprovalMode === "auto") await autoApplyAiAgentProposals([proposal.id], sourceSnapshot, { campaignId: requestCampaignId, userId: requestUserId });
    } finally {
      if (workspaceRequestIsCurrent(requestCampaignId, requestUserId)) {
        aiAgentBusyRef.current = false;
        setAiAgentBusy(false);
      }
    }
  }

  async function submitAiAgentTurn({ prompt, requestMessages, selectedAssetId }: AiAgentPendingAuthRequest, options: { authRetry?: boolean } = {}) {
    if (blankCanvasDemoOpen) {
      await submitBlankCanvasDemoAiAgentTurn({ prompt, requestMessages, selectedAssetId }, options);
      return;
    }
    if (aiAgentBusyRef.current && !options.authRetry) return;
    const requestCampaignId = campaignId;
    const requestUserId = currentUserId;
    aiAgentBusyRef.current = true;
    setAiAgentBusy(true);
    setAiAgentStatus(options.authRetry ? "Retrying agent request after sign-in" : "Agent working");
    setAiAgentCodexAuth(null);
    aiAgentLiveThreadIdRef.current = null;
    const pendingAssistantId = `agent-live-${Date.now()}`;
    aiAgentPendingAssistantIdRef.current = pendingAssistantId;
    setAiAgentMessages((messages) =>
      upsertAiAgentMessage(messages, {
        id: pendingAssistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        progress: options.authRetry ? "Retrying agent turn..." : "Starting agent turn...",
        streaming: true
      })
    );
    const abortController = new AbortController();
    aiAgentAbortRef.current = abortController;
    const requestSelectedAssetId = selectedAssetId ?? selectedAiAgentReferenceAsset?.id ?? aiAgentSelectedAssetId;
    try {
      const requestCampaignUpdatedAt = snapshotRef.current.campaigns.find((candidate) => candidate.id === requestCampaignId)?.updatedAt;
      if (!requestCampaignUpdatedAt) throw new Error("Reload the campaign before starting an AI turn.");
      const result = await apiPost<AiAgentThreadResponse>(`/api/v1/campaigns/${requestCampaignId}/ai/threads`, {
        prompt,
        expectedUpdatedAt: requestCampaignUpdatedAt,
        surface: "agent_panel",
        approvalMode: aiAgentApprovalMode,
        selectedSceneId: selectedScene?.id,
        selectedAssetId: requestSelectedAssetId,
        selectedTokenIds,
        messages: aiAgentProviderMessages(requestMessages)
      }, { signal: abortController.signal, idempotencyKey: `ai-thread:${globalThis.crypto.randomUUID()}` });
      if (!workspaceRequestIsCurrent(requestCampaignId, requestUserId)) return;
      const proposalIds = result.events.filter((event) => event.type === "proposal.created").map((event) => event.proposalId).filter((proposalId): proposalId is string => Boolean(proposalId));
      const appliedProposalIds = result.events.filter((event) => event.type === "proposal.applied").map((event) => event.proposalId).filter((proposalId): proposalId is string => Boolean(proposalId));
      const reasoning = reasoningTracesFromEvents(result.events);
      const activity = activityTracesFromEvents(result.events);
      const assistantMessage: AiAgentMessage = {
        id: result.thread.id,
        role: "assistant",
        content: result.assistantMessage || "Done.",
        createdAt: result.thread.updatedAt,
        proposalIds,
        ...(reasoning.length > 0 ? { reasoning } : {}),
        ...(activity.length > 0 ? { activity } : {}),
        streaming: false
      };
      aiAgentPendingAuthRequestRef.current = null;
      clearAiAgentAuthRetry();
      setAiAgentMessages((messages) => {
        const pendingAssistantId = aiAgentPendingAssistantIdRef.current;
        aiAgentPendingAssistantIdRef.current = null;
        const mergedMessages = pendingAssistantId ? messages.filter((message) => message.id !== pendingAssistantId) : messages;
        return upsertAiAgentMessage(mergedMessages, assistantMessage);
      });
      setAiAgentStatus(
        appliedProposalIds.length > 0
          ? `Agent auto-applied ${appliedProposalIds.length} proposal${appliedProposalIds.length === 1 ? "" : "s"}`
          : proposalIds.length > 0
            ? `Agent drafted ${proposalIds.length} proposal${proposalIds.length === 1 ? "" : "s"}`
            : "Agent ready"
      );
      const refreshedSnapshot = await refresh(requestCampaignId, selectedScene?.id ?? "", { syncStatus: false });
      if (!workspaceRequestIsCurrent(requestCampaignId, requestUserId)) return;
      const appliedProposalIdSet = new Set(appliedProposalIds);
      const pendingProposalIds = proposalIds.filter((proposalId) => !appliedProposalIdSet.has(proposalId));
      if (aiAgentApprovalMode === "auto" && pendingProposalIds.length > 0) {
        await autoApplyAiAgentProposals(pendingProposalIds, refreshedSnapshot, { campaignId: requestCampaignId, userId: requestUserId });
      }
    } catch (error) {
      if (!workspaceRequestIsCurrent(requestCampaignId, requestUserId)) return;
      if (isAbortError(error) || abortController.signal.aborted) {
        const message = "Agent turn stopped.";
        aiAgentPendingAuthRequestRef.current = null;
        clearAiAgentAuthRetry();
        clearPendingAiAgentAssistantMessage();
        setAiAgentMessages((messages) => [...messages, { id: `agent-stop-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
        setAiAgentStatus("Agent stopped");
        return;
      }
      const codexAuth = codexAuthPromptFromError(error);
      if (codexAuth) {
        const opened = openCodexAuthPrompt(codexAuth);
        aiAgentPendingAuthRequestRef.current = { prompt, requestMessages, selectedAssetId: requestSelectedAssetId };
        const promptMessage = opened
          ? "Codex sign-in opened. Finish the ChatGPT OAuth flow; the original agent request will resume automatically."
          : "Codex sign-in is required. Use the sign-in button below; the original agent request will resume automatically.";
        setAiAgentCodexAuth({ ...codexAuth, opened, message: promptMessage });
        clearPendingAiAgentAssistantMessage();
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
        clearPendingAiAgentAssistantMessage();
        setAiAgentMessages((messages) => [...messages, { id: `agent-auth-session-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
        setAiAgentStatus("Sign in required");
        return;
      }
      const message = errorMessage(error);
      aiAgentPendingAuthRequestRef.current = null;
      clearAiAgentAuthRetry();
      clearPendingAiAgentAssistantMessage();
      setAiAgentMessages((messages) => [...messages, { id: `agent-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      setAiAgentStatus(`Agent failed: ${message}`);
    } finally {
      if (aiAgentAbortRef.current === abortController) {
        aiAgentAbortRef.current = null;
        aiAgentLiveThreadIdRef.current = null;
        aiAgentBusyRef.current = false;
        setAiAgentBusy(false);
      }
    }
  }

  function stopAiAgentTurn() {
    if (!aiAgentAbortRef.current && !aiAgentPendingAuthRequestRef.current) return;
    aiAgentPendingAuthRequestRef.current = null;
    clearAiAgentAuthRetry();
    setAiAgentStatus("Stopping agent turn");
    aiAgentLiveThreadIdRef.current = null;
    aiAgentBusyRef.current = false;
    clearPendingAiAgentAssistantMessage();
    aiAgentAbortRef.current?.abort();
  }

  function startAiAgentCodexAuth(auth: CodexAuthStart) {
    const opened = openCodexAuthPrompt(auth);
    setAiAgentCodexAuth((current) => (current ? { ...current, opened } : current));
    setAiAgentStatus(opened ? "Waiting for ChatGPT sign-in" : "Codex sign-in blocked");
    if (opened) scheduleAiAgentAuthRetry();
  }

  async function trackAiGenerationJob(job: AiGenerationJob, task: (request: WorkspaceBoundRequest) => Promise<void>) {
    const lock = job.kind === "map" ? "map" : "token";
    if (aiGenerationLocksRef.current.has(lock)) return;
    aiGenerationLocksRef.current.add(lock);
    const request = beginWorkspaceBoundRequest();
    aiGenerationControllersRef.current.set(job.id, request.controller);
    setAiGenerationJobs((jobs) => [...jobs.filter((item) => item.id !== job.id), job]);
    try {
      await task(request);
    } catch (error) {
      if (workspaceBoundRequestIsCurrent(request)) setStatus(`${job.label} failed: ${errorMessage(error)}`);
    } finally {
      finishWorkspaceBoundRequest(request);
      if (aiGenerationControllersRef.current.get(job.id) !== request.controller) return;
      aiGenerationControllersRef.current.delete(job.id);
      aiGenerationLocksRef.current.delete(lock);
      if (workspaceBoundRequestIsCurrent(request)) setAiGenerationJobs((jobs) => jobs.filter((item) => item.id !== job.id));
    }
  }

  async function generateAiMapAsset() {
    if (!selectedScene) return;
    const prompt = aiMapPrompt.trim();
    if (!prompt) return;
    const scene = selectedScene;
    await trackAiGenerationJob({ id: `map:${scene.id}`, kind: "map", label: "Map image generation", detail: scene.name }, async (request) => {
      setStatus(`Generating map art for ${scene.name}...`);
      await apiPost(`/api/v1/campaigns/${request.campaignId}/ai/generate-map-asset`, {
        prompt,
        expectedUpdatedAt: request.campaignUpdatedAt,
        name: `${scene.name} Generated Map`,
        sceneId: scene.id,
        size: "1536x1024",
        quality: "low",
        outputFormat: "png"
      }, { signal: request.controller.signal, idempotencyKey: `ai-map-asset:${globalThis.crypto.randomUUID()}` });
      if (!workspaceBoundRequestIsCurrent(request)) return;
      setStatus("Map image proposal drafted");
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
    });
  }

  async function generateAiTokenAsset() {
    if (!selectedToken) return;
    const prompt = aiTokenPrompt.trim();
    if (!prompt) return;
    const token = selectedToken;
    await trackAiGenerationJob({ id: `token:${token.id}`, kind: "token", label: "Token image generation", detail: token.name }, async (request) => {
      setStatus(`Generating token art for ${token.name}...`);
      await apiPost(`/api/v1/campaigns/${request.campaignId}/ai/generate-token-asset`, {
        prompt,
        expectedUpdatedAt: request.campaignUpdatedAt,
        name: `${token.name} Generated Token`,
        tokenId: token.id,
        size: "1024x1024",
        quality: "low",
        outputFormat: "png"
      }, { signal: request.controller.signal, idempotencyKey: `ai-token-asset:${globalThis.crypto.randomUUID()}` });
      if (!workspaceBoundRequestIsCurrent(request)) return;
      setStatus("Token art proposal drafted");
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
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
    const scene = selectedScene;
    await trackAiGenerationJob({ id: `token-batch:${scene.id}`, kind: "tokenBatch", label: "Scene token art generation", detail: `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}` }, async (request) => {
      setStatus(`Generating token art for ${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}...`);
      await Promise.all(tokens.map(async (token) => {
        const tokenPrompt = [
          prompt,
          "",
          `Create distinct token art for ${token.name}.`,
          `Scene: ${scene.name}.`,
          `Disposition: ${token.disposition}.`,
          token.notes ? `Token notes: ${token.notes.slice(0, 240)}` : ""
        ].filter(Boolean).join("\n");
        await apiPost(`/api/v1/campaigns/${request.campaignId}/ai/generate-token-asset`, {
          prompt: tokenPrompt,
          expectedUpdatedAt: request.campaignUpdatedAt,
          name: `${token.name} Generated Token`,
          tokenId: token.id,
          size: "1024x1024",
          quality: "low",
          outputFormat: "png"
        }, { signal: request.controller.signal, idempotencyKey: `ai-token-asset:${token.id}:${globalThis.crypto.randomUUID()}` });
      }));
      if (!workspaceBoundRequestIsCurrent(request)) return;
      setStatus(`Token art proposals drafted for ${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}`);
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
    });
  }

  async function replayAiThread(thread: AiThread) {
    const prompt = (thread.prompt ?? thread.title).trim();
    if (!prompt) return;
    setAiPrompt(prompt);
    await runWorkspaceBoundAiRequest("AI thread replay", (request) => apiPost(`/api/v1/campaigns/${request.campaignId}/ai/threads`, { prompt, expectedUpdatedAt: request.campaignUpdatedAt }, { signal: request.controller.signal, idempotencyKey: `ai-thread-replay:${globalThis.crypto.randomUUID()}` }), () => "AI thread replayed");
  }

  async function retryAiToolCall(toolCall: AiToolCall) {
    const payload = { expectedUpdatedAt: toolCall.updatedAt };
    await runWorkspaceBoundAiRequest("AI tool retry", (request) => apiPost<{ matched: number; retried: number; skipped: number; completed: number; failed: number }>(`/api/v1/campaigns/${request.campaignId}/ai/tool-calls/${toolCall.id}/retry`, payload, { signal: request.controller.signal, idempotencyKey: sharedMutationIdempotencyKey(`ai-tool-call:retry:${toolCall.id}`, toolCall.updatedAt, payload) }), (result) => `Retried ${result.retried} ${toolCall.toolName} call; ${result.completed} completed, ${result.failed} failed, ${result.skipped} skipped`);
  }

  async function recapSession() {
    await runWorkspaceBoundAiRequest("Session recap", (request) => apiPost(`/api/v1/campaigns/${request.campaignId}/ai/session-recap`, { expectedUpdatedAt: request.campaignUpdatedAt }, { signal: request.controller.signal, idempotencyKey: `ai-session-recap:${globalThis.crypto.randomUUID()}` }), () => "Session recap queued for approval");
  }

  async function extractMemory() {
    const sourceText = aiPrompt.trim() || undefined;
    await runWorkspaceBoundAiRequest("Memory extraction", (request) => apiPost(`/api/v1/campaigns/${request.campaignId}/ai/memory/extract`, {
      sourceText,
      expectedUpdatedAt: request.campaignUpdatedAt
    }, { signal: request.controller.signal, idempotencyKey: `ai-memory-extract:${globalThis.crypto.randomUUID()}` }), () => "Memory extraction queued");
  }

  async function approveAndApply(proposal: Proposal) {
    if (proposal.changesJson.some((change) => change.entity === "scene") && blockUnsavedSceneDraft("applying a scene proposal")) {
      throw new Error("Save or discard scene changes before applying a scene proposal");
    }
    if (blankCanvasDemoOpen) return applyBlankCanvasDemoProposal(proposal);
    const request = { campaignId: proposal.campaignId, userId: currentUserId };
    if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return undefined;
    const sceneIdToOpen = sceneIdToOpenAfterProposalApply(proposal);
    const steps = proposalReviewSteps(proposal);
    if (!steps.includes("apply")) throw new Error(`Proposal is ${proposal.status} and cannot be applied.`);
    let expectedUpdatedAt = proposal.updatedAt;
    if (steps.includes("approve")) {
      const approvePayload = { expectedUpdatedAt };
      const approved = await apiPost<Proposal>(`/api/v1/proposals/${proposal.id}/approve`, approvePayload, {
        idempotencyKey: sharedMutationIdempotencyKey(`proposal:approve:${proposal.id}`, expectedUpdatedAt, approvePayload)
      });
      expectedUpdatedAt = approved.updatedAt;
      if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return undefined;
    }
    const applyPayload = { expectedUpdatedAt };
    const applied = await apiPost<Proposal>(`/api/v1/proposals/${proposal.id}/apply`, applyPayload, {
      idempotencyKey: sharedMutationIdempotencyKey(`proposal:apply:${proposal.id}`, expectedUpdatedAt, applyPayload)
    });
    if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return undefined;
    setSnapshot((current) => applyProposalChangesToSnapshot(current, applied));
    if (proposalChangesExternalLore(applied)) setLoreReloadVersion((version) => version + 1);
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

  async function autoApplyAiAgentProposals(proposalIds: string[], sourceSnapshot: Snapshot, request: { campaignId: string; userId: string }) {
    if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
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
      if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
      hideAiAgentProposal(proposal.id);
      try {
        await approveAndApply(proposal);
        if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
        appliedCount += 1;
      } catch (error) {
        if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
        failedCount += 1;
        const message = errorMessage(error);
        if (isProposalNotFoundError(error)) {
          setSnapshot((current) => ({ ...current, proposals: current.proposals.filter((item) => item.id !== proposal.id) }));
        } else {
          showAiAgentProposal(proposal.id);
        }
        setAiAgentMessages((messages) => [...messages, { id: `agent-auto-apply-error-${proposal.id}-${Date.now()}`, role: "system", content: `Auto approve failed for ${proposal.id}: ${message}`, createdAt: new Date().toISOString() }]);
      }
    }

    if (failedCount > 0) {
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
      if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
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
      if (!result) return;
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
      showAiAgentProposal(proposal.id);
      if (isSessionAuthError(error)) {
        requireInteractiveSignIn(`Sign in required. ${message}`);
        setAiAgentStatus("Sign in required");
        return;
      }
      setAiAgentStatus(`Apply failed: ${message}`);
      setAiAgentMessages((messages) => [...messages, { id: `agent-apply-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      refresh(proposal.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
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
      showAiAgentProposal(proposal.id);
      if (isSessionAuthError(error)) {
        requireInteractiveSignIn(`Sign in required. ${message}`);
        setAiAgentStatus("Sign in required");
        return;
      }
      setAiAgentStatus(`Reject failed: ${message}`);
      setAiAgentMessages((messages) => [...messages, { id: `agent-reject-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      refresh(proposal.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
    }
  }

  function hideAiAgentProposal(proposalId: string) {
    setAiAgentHiddenProposalIds((proposalIds) => setProposalHidden(proposalIds, proposalId, true));
  }

  function showAiAgentProposal(proposalId: string) {
    setAiAgentHiddenProposalIds((proposalIds) => setProposalHidden(proposalIds, proposalId, false));
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
    const rejectPayload = { expectedUpdatedAt: proposal.updatedAt };
    await apiPost(`/api/v1/proposals/${proposal.id}/reject`, rejectPayload, {
      idempotencyKey: sharedMutationIdempotencyKey(`proposal:reject:${proposal.id}`, proposal.updatedAt, rejectPayload)
    });
    setStatus("Proposal rejected");
    await refresh();
  }

  async function revertProposalReview(proposal: Proposal) {
    if (proposal.status !== "applied") {
      setStatus(`Proposal is ${proposal.status} and cannot be reverted`);
      return;
    }
    if (blankCanvasDemoOpen) {
      setStatus("Proposal revert requires a persisted campaign");
      return;
    }
    if (proposal.changesJson.some((change) => change.entity === "scene") && blockUnsavedSceneDraft("reverting a scene proposal")) return;
    const request = { campaignId: proposal.campaignId, userId: currentUserId };
    if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
    let reverted: Proposal;
    try {
      const revertPayload = { expectedUpdatedAt: proposal.updatedAt };
      reverted = await apiPost<Proposal>(`/api/v1/proposals/${proposal.id}/revert`, revertPayload, {
        idempotencyKey: sharedMutationIdempotencyKey(`proposal:revert:${proposal.id}`, proposal.updatedAt, revertPayload)
      });
    } catch (revertError) {
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }).catch(() => undefined);
      if (workspaceRequestIsCurrent(request.campaignId, request.userId)) setStatus(`Revert blocked: ${errorMessage(revertError)}`);
      return;
    }
    if (!workspaceRequestIsCurrent(request.campaignId, request.userId)) return;
    setSnapshot((current) => ({ ...current, proposals: current.proposals.map((item) => item.id === reverted.id ? reverted : item) }));
    if (proposalChangesExternalLore(reverted)) setLoreReloadVersion((version) => version + 1);
    setStatus("Proposal changes reverted");
    try {
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
    } catch (refreshError) {
      if (workspaceRequestIsCurrent(request.campaignId, request.userId)) setStatus(`Proposal changes reverted; background refresh failed: ${errorMessage(refreshError)}. Reload to reconcile the workspace.`);
    }
  }

  async function approveMemory(fact: AiMemoryFact) {
    const payload = { expectedUpdatedAt: fact.updatedAt };
    await apiPost(`/api/v1/ai/memory/${fact.id}/approve`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:approve:${fact.id}`, fact.updatedAt, payload) });
    setStatus("Memory approved");
    await refresh();
  }

  async function deleteMemory(fact: AiMemoryFact) {
    await apiDelete(`/api/v1/ai/memory/${fact.id}?expectedUpdatedAt=${encodeURIComponent(fact.updatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:delete:${fact.id}`, fact.updatedAt, {}) });
    setStatus("Memory deleted");
    await refresh();
  }

  async function installPlugin(plugin: PluginRuntimeInfo, version: string, permissions: string[]) {
    const action = plugin.installed ? (version === plugin.distribution.latestVersion ? "upgraded" : "rolled back") : "installed";
    await runWorkspaceBoundAction(
      (request) => {
        const campaign = snapshotRef.current.campaigns.find((candidate) => candidate.id === request.campaignId);
        if (!campaign) throw new Error("Reload the campaign before installing a plugin.");
        const payload = { permissions, version, expectedUpdatedAt: campaign.updatedAt };
        const scope = `plugin:install:${campaign.id}:${plugin.id}`;
        const attempt = beginAppendMutation(scope, payload);
        return apiPost(`/api/v1/campaigns/${request.campaignId}/plugins/${plugin.id}/install`, payload, {
          signal: request.controller.signal,
          idempotencyKey: attempt.idempotencyKey
        }).then((result) => {
          completeAppendMutation(scope, attempt);
          return result;
        });
      },
      async (_result, request) => {
        const successStatus = `${plugin.name} ${action}`;
        setStatus(successStatus);
        try {
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
        } catch (refreshError) {
          if (workspaceBoundRequestIsCurrent(request)) {
            setStatus(`${successStatus}; background refresh failed: ${errorMessage(refreshError)}. Reload to reconcile plugin state.`);
          }
        }
      }
    );
  }

  async function syncPluginRegistries() {
    try {
      await runWorkspaceBoundAction(
        (request) => {
          const expectedRegistryRevision = adminSnapshot?.pluginOperations.registryRevision ?? adminSnapshot?.pluginReviews.registryRevision;
          if (!expectedRegistryRevision) throw new Error("Refresh server administration before synchronizing plugin registries.");
          return syncCampaignPluginRegistry(request.campaignId, expectedRegistryRevision, request.controller.signal);
        },
        async (result, request) => {
          setStatus(`Plugin registries synced: ${result.registries.length} registries, ${result.plugins.length} packages`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      setStatus(`Plugin registry sync failed: ${errorMessage(error)}`);
    }
  }

  async function installSystem(system: SystemRuntimeInfo) {
    await runWorkspaceBoundAction(
      (request) => {
        const campaign = snapshotRef.current.campaigns.find((candidate) => candidate.id === request.campaignId);
        if (!campaign) throw new Error("Reload the campaign before activating a rules system.");
        const payload = { expectedUpdatedAt: campaign.updatedAt };
        const scope = `system:install:${campaign.id}:${system.id}`;
        const attempt = beginAppendMutation(scope, payload);
        return apiPost(`/api/v1/campaigns/${request.campaignId}/systems/${system.id}/install`, payload, {
          signal: request.controller.signal,
          idempotencyKey: attempt.idempotencyKey
        }).then((result) => {
          completeAppendMutation(scope, attempt);
          return result;
        });
      },
      async (_result, request) => {
        setStatus(`${system.name} activated`);
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      }
    );
  }

  async function runPluginCommand(plugin: PluginRuntimeInfo, command: string) {
    await runWorkspaceBoundAction(
      (request) => {
        const payload = { command, args: "from the browser tabletop" };
        const scope = `plugin-command:${request.campaignId}:${plugin.id}`;
        const attempt = beginAppendMutation(scope, payload);
        return apiPost<{ proposal: Proposal; approvalRequired: boolean }>(`/api/v1/campaigns/${request.campaignId}/plugins/${plugin.id}/chat-command`, payload, {
          signal: request.controller.signal,
          idempotencyKey: attempt.idempotencyKey
        }).then((result) => {
          completeAppendMutation(scope, attempt);
          return result;
        });
      },
      async (result, request) => {
        setStatus(result.approvalRequired ? `${plugin.name} command awaiting approval` : `${plugin.name} command ran`);
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      }
    );
  }

  async function rollSystemCheck() {
    if (!selectedActor) return;
    const actor = selectedActor;
    await runWorkspaceBoundAction(
      (request) => {
        const payload = { rollId: systemRollId(actor.systemId) };
        const scope = `system-roll:${request.campaignId}:${actor.id}`;
        const attempt = beginAppendMutation(scope, payload);
        return apiPost(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/roll`, payload, {
          signal: request.controller.signal,
          idempotencyKey: attempt.idempotencyKey
        }).then((result) => {
          completeAppendMutation(scope, attempt);
          return result;
        });
      },
      async (_result, request) => {
        setStatus("System roll posted");
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      }
    );
  }
  async function useActorAction(rollId: string, options: ActorActionCommitOptions = {}) {
    if (!selectedActor) return;
    const actor = selectedActor;
    const consumeResources = options.consumeResources ?? true;
    const initiallyConsequentialDndAction = actor.systemId === "dnd-5e-srd" && Boolean(consumeResources || options.applyEffect || options.weaponMastery?.use);
    const actionRequest = {
      rollId,
      expectedUpdatedAt: actor.updatedAt,
      consumeResources,
      applyEffect: options.applyEffect,
      targetActorId: options.targetActorId,
      visibility: diceVisibility,
      saveOutcomes: options.saveOutcomes,
      effectChoice: options.effectChoice,
      weaponMastery: options.weaponMastery,
      continuationId: options.continuationId
    };
    try {
      await runWorkspaceBoundAction(
        async (request): Promise<CommittedActorActionResponse | { cancelled: true } | { handoff: DndControlledCreatureActionHandoff }> => {
          const path = `/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/roll`;
          let consequentialDndAction = initiallyConsequentialDndAction;
          if (actor.systemId === "dnd-5e-srd" && !consequentialDndAction) {
            const preview = await apiPost<{ resolution?: { action?: { kind?: "action" | "bonusAction" | "reaction" | "free" } } }>(path, { ...actionRequest, commit: false }, { signal: request.controller.signal });
            consequentialDndAction = preview.resolution?.action?.kind !== "free";
          }
          if (!consequentialDndAction) {
            return apiPost<CommittedActorActionResponse>(path, actionRequest, { signal: request.controller.signal });
          }
          const prepared = await apiPost<PreparedActorActionResponse>(path, {
            ...actionRequest,
            prepare: true,
            commit: false
          }, {
            signal: request.controller.signal,
            idempotencyKey: `dnd-action-preview:${window.crypto.randomUUID()}`
          });
          if (prepared.controlledCreatureHandoff) return { handoff: prepared.controlledCreatureHandoff };
          setStatus(`${actor.name}: final exact-action review open; nothing committed yet`);
          if (!await consequenceReview.review(actorActionConsequenceReview(actor.name, prepared, { actorNames: new Map(snapshotRef.current.actors.map((candidate) => [candidate.id, options.reviewActorNames?.[candidate.id] ?? candidate.name])), applyEffect: Boolean(options.applyEffect || options.weaponMastery?.use) }))) return { cancelled: true };
          return apiPost<CommittedActorActionResponse>(path, {
            preparedPreviewKey: prepared.preparation.preparedPreviewKey,
            expectedUpdatedAt: actor.updatedAt
          }, {
            signal: request.controller.signal,
            idempotencyKey: `dnd-action-commit:${window.crypto.randomUUID()}`
          });
        },
        async (used, request) => {
          if ("handoff" in used) { setControlledCreatureHandoff(used.handoff); setTab("compendium"); setStatus(`${actor.name} action ready for controlled-creature review; nothing spent yet`); return; }
          if ("cancelled" in used) {
            setStatus(`${actor.name} action cancelled after review`);
            return;
          }
          if (used.combatAction?.status === "pending_gm") {
            if (used.undo) setLastDndRulesUndo(used.undo);
            setStatus(`${actor.name} action pending GM confirmation`);
            await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
            return;
          }
          const spent = used.usage?.consumed?.map((item) => `${item.label} ${item.remaining}`).join(", ");
          const applied = used.effect ? `; ${used.effect.type} applied` : "";
          const updatedActors = used.updatedActors && used.updatedActors.length > 0 ? used.updatedActors : used.actor ? [used.actor] : [];
          if (updatedActors.length > 0) {
            const updates = new Map(updatedActors.map((updatedActor) => [updatedActor.id, updatedActor]));
            setSnapshot((current) => ({ ...current, actors: current.actors.map((currentActor) => updates.get(currentActor.id) ?? currentActor) }));
          }
          if (used.undo) setLastDndRulesUndo(used.undo);
          const deathSave = used.resolution?.deathSave;
          setStatus(deathSave ? `${actor.name} Death Saving Throw: ${deathSaveStatusText(deathSave)}` : spent ? `${actor.name} used action: ${spent}${applied}` : `${actor.name} action posted${applied}`);
        }
      );
    } catch (error) {
      if (!reconcileStaleWriteConflict(error)) setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function undoLastDndRulesMutation() {
    const undo = lastDndRulesUndo;
    if (!undo) return;
    try {
      const result = await apiPost<DndRulesMutationUndoResult>(`/api/v1/campaigns/${campaignId}/dnd/rules-mutations/${undo.mutationId}/undo`, {
        expectedActorUpdatedAt: undo.expectedActorUpdatedAt,
        expectedItemUpdatedAt: undo.expectedItemUpdatedAt,
        ...(undo.expectedCombatUpdatedAt ? { expectedCombatUpdatedAt: undo.expectedCombatUpdatedAt } : {})
      }, { idempotencyKey: `dnd-rules-undo:${undo.mutationId}` });
      const actors = new Map(result.actors.map((actor) => [actor.id, actor]));
      const items = new Map(result.items.map((item) => [item.id, item]));
      setSnapshot((current) => ({
        ...current,
        actors: current.actors.map((actor) => actors.get(actor.id) ?? actor),
        items: current.items.map((item) => items.get(item.id) ?? item),
        combats: result.combat ? current.combats.map((combat) => combat.id === result.combat!.id ? result.combat! : combat) : current.combats
      }));
      setLastDndRulesUndo(undefined);
      setStatus("Last reviewed D&D rules change undone");
    } catch (error) {
      if (!reconcileStaleWriteConflict(error)) setStatus(`Undo blocked: ${errorMessage(error)}`);
    }
  }

  function applyTypedDamageResult(result: TypedDamageApplyResult) {
    for (const actor of result.actors) applyActorToSnapshot(actor);
    if (result.combat) applyCombatToSnapshot(result.combat);
    setLastDndRulesUndo(result.undo);
    setStatus(`Typed damage applied atomically to ${formatNumber(result.actors.length)} actor${result.actors.length === 1 ? "" : "s"}`);
  }

  async function importCompendiumEntry(entry: RulesCompendiumEntry) {
    if (!selectedActor) return;
    const actor = selectedActor;
    try {
      await runWorkspaceBoundAction(
        (request) => apiPost<{ entry: RulesCompendiumEntry; item?: Item; actor: Actor; resolution: string }>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/compendium`, {
          entryId: entry.id,
          expectedUpdatedAt: actor.updatedAt
        }, { signal: request.controller.signal, idempotencyKey: `compendium-import:${window.crypto.randomUUID()}` }),
        async (imported, request) => {
          setCompendiumStatus(`${imported.entry.name} ${imported.item ? "added to sheet" : "applied to actor"}`);
          setStatus(`${imported.entry.name} imported`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      if (reconcileStaleWriteConflict(error)) return;
      const message = `${errorMessage(error)} Open the standalone Compendium tab to review duplicate or version choices.`;
      setCompendiumStatus(message);
      setStatus(message);
    }
  }

  async function purchaseCompendiumEntry(entry: RulesCompendiumEntry, quantity: number) {
    if (!selectedActor) return;
    const actor = selectedActor;
    try {
      await runWorkspaceBoundAction(
        (request) => apiPost<{ entry: RulesCompendiumEntry; purchase: { totalCostGp: number; currency: Record<string, number> }; item: Item; actor: Actor; resolution: string }>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/purchase`, {
          entryId: entry.id,
          quantity,
          expectedUpdatedAt: actor.updatedAt
        }, { signal: request.controller.signal, idempotencyKey: `compendium-purchase:${window.crypto.randomUUID()}` }),
        async (purchased, request) => {
          setCompendiumStatus(`${purchased.entry.name} purchased for ${formatGp(purchased.purchase.totalCostGp)}; ${formatCurrency(purchased.purchase.currency)} remaining`);
          setStatus(`${purchased.entry.name} purchased`);
          await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
        }
      );
    } catch (error) {
      if (reconcileStaleWriteConflict(error)) return;
      const message = `${errorMessage(error)} Open the standalone Compendium tab to review duplicate or version choices.`;
      setCompendiumStatus(message);
      setStatus(message);
    }
  }

  async function createCharacterFromTemplate(template: CharacterTemplateInfo) {
    const payload = {
      templateId: template.id,
      name: template.name,
      ownerUserId: currentUserId
    };
    const scope = `system-character:create:${campaignId}`;
    const attempt = beginAppendMutation(scope, payload);
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${template.systemId}/characters`, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setStatus(`${created.actor.name} created`);
    await refresh();
  }

  async function openCharacterCreator() {
    // Resolve origins BEFORE opening so the step list never reshuffles under
    // the user. Origin catalogs exist only for the D&D SRD runtime; other
    // systems get the simple name-and-template flow.
    const request = currentWorkspaceRequestIdentity();
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (system) {
      try {
        const origins = await apiGet<CharacterOriginsInfo>(`/api/v1/campaigns/${request.campaignId}/systems/${system.id}/character-origins`);
        if (!workspaceIdentityIsCurrent(request)) return;
        setCharacterOrigins(origins);
      } catch {
        if (workspaceIdentityIsCurrent(request)) setCharacterOrigins(undefined);
      }
    } else {
      setCharacterOrigins(undefined);
    }
    if (!workspaceIdentityIsCurrent(request)) return;
    setCharacterCreatorOpen(true);
  }

  async function createCharacterFromCreator(template: CharacterTemplateInfo, input: CharacterCreateInput) {
    const request = currentWorkspaceRequestIdentity();
    const payload = {
      templateId: template.id,
      ...input,
      name: input.name.trim() || template.name
    };
    const scope = `system-character:create:${request.campaignId}`;
    const attempt = beginAppendMutation(scope, payload);
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${request.campaignId}/systems/${template.systemId}/characters`, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    if (!workspaceIdentityIsCurrent(request)) return;
    const successStatus = `${created.actor.name} joined the party`;
    try {
      await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
      if (!workspaceIdentityIsCurrent(request)) return;
      setStatus(successStatus);
    } catch (refreshError) {
      if (!workspaceIdentityIsCurrent(request)) return;
      applyActorToSnapshot(created.actor);
      setStatus(`${successStatus}; background refresh failed: ${errorMessage(refreshError)}. Reload to reconcile the workspace.`);
    }
    setCharacterCreatorOpen(false);
    setTab("actors");
  }

  async function previewCharacterFromCreator(template: CharacterTemplateInfo, input: CharacterCreateInput): Promise<CharacterCreatorRulesPreview> {
    const request = currentWorkspaceRequestIdentity();
    const result = await apiPost<{ templateId: string; preview: CharacterCreatorRulesPreview }>(
      `/api/v1/campaigns/${request.campaignId}/systems/${template.systemId}/characters/preview`,
      { templateId: template.id, ...input }
    );
    if (!workspaceIdentityIsCurrent(request)) throw new Error("Campaign changed while the character preview was loading.");
    return result.preview;
  }

  async function importSystemCharacter(input: CharacterImportPayload & { ownerUserId: string }): Promise<CharacterImportOutcome> {
    const request = beginWorkspaceBoundRequest();
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    try {
      if (!system) throw new Error("Choose an active rules system before importing a character.");
      const scope = `system-character:import:${request.campaignId}`;
      const attempt = beginAppendMutation(scope, input);
      const imported = await apiPost<{ import: { warnings: string[] }; actor: Actor; items: Item[] }>(`/api/v1/campaigns/${request.campaignId}/systems/${system.id}/characters/import`, input, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey });
      completeAppendMutation(scope, attempt);
      const warnings = imported.import.warnings ?? [];
      const outcome = { actor: imported.actor, warnings, importedItemCount: imported.items.length };
      if (!workspaceBoundRequestIsCurrent(request)) return outcome;
      applyActorToSnapshot(imported.actor);
      imported.items.forEach(applyItemToSnapshot);
      setImportedActor(imported.actor);
      const importSuccessStatus = warnings.length > 0 ? `${imported.actor.name} imported with ${warnings.length} normalization warning${warnings.length === 1 ? "" : "s"}` : `${imported.actor.name} imported`;
      setStatus(importSuccessStatus);
      try {
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId);
      } catch (refreshError) {
        if (workspaceBoundRequestIsCurrent(request)) setStatus(`${importSuccessStatus}; background refresh failed: ${errorMessage(refreshError)}. Reload to reconcile the workspace.`);
      }
      return outcome;
    } finally {
      finishWorkspaceBoundRequest(request);
    }
  }

  async function createSystemMonster() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const payload = {
      threatId: systemEncounterThreatId(system.id)
    };
    const scope = `system-monster:create:${campaignId}`;
    const attempt = beginAppendMutation(scope, payload);
    const created = await apiPost<{ actor: Actor }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/monsters`, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setCreatedMonster(created.actor);
    setStatus(`${created.actor.name} monster created`);
    await refresh();
  }

  async function previewSelectedActorAdvancement(optionId: string | undefined, choices: AdvancementChoicePayload, idempotencyKey: string): Promise<AdvancementPreviewEnvelope> {
    if (!selectedActor) throw new Error("Select an actor before reviewing advancement.");
    const actor = selectedActor;
    const request = beginWorkspaceBoundRequest();
    try {
      const preview = await apiPost<AdvancementPreviewEnvelope>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/rules-preview`, {
        operation: "advancement",
        prepare: true,
        optionId: optionId || advancementOptions[0]?.id || systemAdvancementOptionId(actor.systemId),
        ...(choices.featId ? { featId: choices.featId } : {}),
        ...(choices.abilityChoices ? { abilityChoices: choices.abilityChoices } : {}),
        ...(choices.multiclassInto ? { className: choices.multiclassInto } : {}),
        ...(choices.subclassId ? { subclassId: choices.subclassId } : {}),
        ...(choices.weaponMasteryChoices ? { weaponMasteryChoices: choices.weaponMasteryChoices } : {}),
        ...(choices.wizardSpellbookAdditions ? { wizardSpellbookAdditions: choices.wizardSpellbookAdditions } : {}),
        ...(choices.classPreparedSpellChoices ? { classPreparedSpellChoices: choices.classPreparedSpellChoices } : {}),
        ...(choices.hitPointMode ? { hitPointMode: choices.hitPointMode } : {})
      }, { signal: request.controller.signal, idempotencyKey });
      if (!workspaceBoundRequestIsCurrent(request)) throw new Error("The selected campaign changed while advancement was being reviewed.");
      setPendingAdvancement(preview.preparation?.pendingAdvancement ?? preview.draft?.pendingAdvancement);
      return preview;
    } finally {
      finishWorkspaceBoundRequest(request);
    }
  }

  async function advanceSelectedActor(optionId?: string, choices: AdvancementChoicePayload = {}) {
    if (!selectedActor) return;
    const actor = selectedActor;
    const targetSceneId = selectedScene?.id ?? sceneId;
    const selectedOptionId = optionId || advancementOptions[0]?.id || systemAdvancementOptionId(actor.systemId);
    const { idempotencyKey, preparedPreviewKey, ...directChoices } = choices;
    if (actor.systemId === "dnd-5e-srd" && (!preparedPreviewKey || !idempotencyKey)) {
      throw new Error("Review and prepare the exact D&D advancement before committing it.");
    }
    await runWorkspaceBoundAction(
      (request) => apiPost<{ advancement: { name: string }; actor?: Actor }>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/advance`, {
        expectedUpdatedAt: actor.updatedAt,
        ...(preparedPreviewKey ? { preparedPreviewKey } : {
          optionId: selectedOptionId,
          ...(directChoices.featId ? { featId: directChoices.featId } : {}),
          ...(directChoices.abilityChoices ? { abilityChoices: directChoices.abilityChoices } : {}),
          ...(directChoices.multiclassInto ? { multiclassInto: directChoices.multiclassInto } : {}),
          ...(directChoices.subclassId ? { subclassId: directChoices.subclassId } : {}),
          ...(directChoices.weaponMasteryChoices ? { weaponMasteryChoices: directChoices.weaponMasteryChoices } : {}),
          ...(directChoices.hitPointMode ? { hitPointMode: directChoices.hitPointMode } : {})
        })
      }, { signal: request.controller.signal, idempotencyKey }),
      (advanced, request) => {
        if (advanced.actor) applyActorToSnapshot(advanced.actor);
        if (actor.systemId === "dnd-5e-srd") setPendingAdvancement(undefined);
        setStatus(choices.multiclassInto ? `${actor.name} gained a level of ${choices.multiclassInto}` : `${actor.name} advanced to ${advanced.advancement.name}`);
        void refresh(request.campaignId, targetSceneId, { syncStatus: false });
      }
    );
  }

  async function restSelectedActor(restType: "short" | "long", options: ActorRestOptions = {}) {
    if (!selectedActor) return;
    const actor = selectedActor;
    const { idempotencyKey, preparedPreviewKey, ...restOptions } = options;
    if (actor.systemId === "dnd-5e-srd" && (!preparedPreviewKey || !idempotencyKey)) {
      throw new Error("Review and prepare the exact D&D rest before committing it.");
    }
    await runWorkspaceBoundAction(
      (request) => apiPost<{ rest: { summary: string }; actor?: Actor }>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/rest`, {
        expectedUpdatedAt: actor.updatedAt,
        ...(preparedPreviewKey ? { preparedPreviewKey } : { restType, ...restOptions })
      }, { signal: request.controller.signal, idempotencyKey }),
      (rested) => {
        if (rested.actor) applyActorToSnapshot(rested.actor);
        setStatus(rested.rest.summary);
      }
    );
  }

  async function cancelSelectedActorPendingAdvancement(pending: Dnd5eSrdPendingAdvancement) {
    if (!selectedActor || selectedActor.id !== pending.actorId) throw new Error("The saved advancement belongs to a different actor.");
    const actor = selectedActor;
    const cancelled = await apiDelete<{ cancelled: true; actorId: string; pendingAdvancementId: string }>(
      `/api/v1/campaigns/${campaignId}/systems/${actor.systemId}/actors/${actor.id}/advancement/pending`,
      {
        body: { pendingAdvancementId: pending.id, expectedUpdatedAt: actor.updatedAt },
        idempotencyKey: `advancement-cancel:${window.crypto.randomUUID()}`
      }
    );
    if (cancelled.pendingAdvancementId === pending.id) setPendingAdvancement(undefined);
    setStatus(`${actor.name}'s saved advancement cancelled`);
  }

  async function previewSelectedActorRest(restType: "short" | "long", options: ActorRestOptions, idempotencyKey: string): Promise<RestPreviewEnvelope> {
    if (!selectedActor) throw new Error("Select an actor before reviewing a rest.");
    const actor = selectedActor;
    const request = beginWorkspaceBoundRequest();
    try {
      const preview = await apiPost<RestPreviewEnvelope>(`/api/v1/campaigns/${request.campaignId}/systems/${actor.systemId}/actors/${actor.id}/rules-preview`, {
        operation: "rest",
        prepare: true,
        restType,
        ...(restType === "short" && options.hitDice ? { hitDice: options.hitDice } : {}),
        ...(options.arcaneRecovery ? { arcaneRecovery: options.arcaneRecovery } : {})
      }, { signal: request.controller.signal, idempotencyKey });
      if (!workspaceBoundRequestIsCurrent(request)) throw new Error("The selected campaign changed while the rest was being reviewed.");
      return preview;
    } finally {
      finishWorkspaceBoundRequest(request);
    }
  }

  function updateCampaignSessions(nextSessions: CampaignSessionInfo[]) {
    setSnapshot((current) => ({ ...current, campaignSessions: nextSessions }));
  }

  async function completeLiveCampaignSession(session: CampaignSessionInfo) {
    const request = currentWorkspaceRequestIdentity();
    const idempotencyKey = `campaign-session:complete:${session.id}:${session.updatedAt}`;
    try {
      const updated = await apiPost<CampaignSessionInfo>(`/api/v1/campaign-sessions/${session.id}/complete`, { notes: session.notes, expectedUpdatedAt: session.updatedAt }, { idempotencyKey });
      if (!workspaceIdentityIsCurrent(request)) return;
      setSnapshot((current) => ({
        ...current,
        campaignSessions: (current.campaignSessions ?? []).map((item) => item.id === updated.id ? updated : item)
      }));
      setStatus(`${updated.title} completed`);
    } catch (error) {
      if (!workspaceIdentityIsCurrent(request)) return;
      if (error instanceof ApiError && error.status === 409) {
        await refresh(request.campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false });
        setStatus("Session changed elsewhere. The latest revision is loaded; review it in Session Desk before retrying completion.");
        return;
      }
      setStatus(`Session completion failed: ${errorMessage(error)}`);
    }
  }

  function planSystemEncounter() {
    setCampaignSearchFocus(undefined);
    setEncounterBuilderOpen(true);
  }

  async function createEncounterThreatTokens(encounterId: string, threats: EncounterBuilderThreatSelection[], signal: AbortSignal, _placementAttemptId: string): Promise<Token[]> {
    if (!selectedScene) {
      setStatus("Select a scene before placing encounter monsters");
      return [];
    }
    const targetScene = selectedScene;
    const systemId = encounterBuilderSystem?.id ?? "dnd-5e-srd";
    const placements = encounterMonsterPlacementDrafts(threats, targetScene);
    const scope = `encounter-monster-placement:${targetScene.campaignId}:${targetScene.id}:${encounterId}`;
    const attempt = beginAppendMutation(scope, { sceneId: targetScene.id, encounterId, systemId, placements });
    const priorRequestAttempt = encounterMonsterPlacementAttemptsRef.current.get(scope);
    const requestAttempt = priorRequestAttempt?.idempotencyKey === attempt.idempotencyKey
      ? priorRequestAttempt
      : { idempotencyKey: attempt.idempotencyKey, input: { encounterId, systemId, expectedUpdatedAt: targetScene.updatedAt, placements } };
    if (requestAttempt !== priorRequestAttempt) encounterMonsterPlacementAttemptsRef.current.set(scope, requestAttempt);
    let placedTokens: Token[] = [];
    await runWorkspaceBoundAction(
      async (request) => {
        const cancelFromDialog = () => request.controller.abort();
        if (signal.aborted) cancelFromDialog();
        else signal.addEventListener("abort", cancelFromDialog, { once: true });
        try {
          try {
            return await apiPost<EncounterMonsterPlacementBatchResult>(
              `/api/v1/scenes/${targetScene.id}/encounter-monster-placements`,
              requestAttempt.input,
              {
                signal: request.controller.signal,
                idempotencyKey: requestAttempt.idempotencyKey,
              },
            );
          } catch (error) {
            if (isStaleWriteError(error)) {
              if (encounterMonsterPlacementAttemptsRef.current.get(scope)?.idempotencyKey === attempt.idempotencyKey) {
                encounterMonsterPlacementAttemptsRef.current.delete(scope);
              }
              completeAppendMutation(scope, attempt);
            }
            throw error;
          }
        } finally {
          signal.removeEventListener("abort", cancelFromDialog);
        }
      },
      (result) => {
        const createdTokens = result.placements.map((placement) => placement.sceneToken);
        placedTokens = createdTokens;
        applySceneToSnapshot(result.scene);
        applyEncounterToSnapshot(result.encounter);
        const linkedSession = result.campaignSession;
        if (linkedSession) {
          setSnapshot((current) => ({
            ...current,
            campaignSessions: (current.campaignSessions ?? []).map((session) => session.id === linkedSession.id ? linkedSession : session)
          }));
        }
        for (const placement of result.placements) applyActorToSnapshot(placement.actor);
        applyTokensToSnapshot(createdTokens);
        pushBoardHistoryAction({ kind: "tokens.create", tokens: createdTokens });
        const lastToken = createdTokens.at(-1);
        if (lastToken) selectSingleToken(lastToken.id);
        if (encounterMonsterPlacementAttemptsRef.current.get(scope)?.idempotencyKey === attempt.idempotencyKey) {
          encounterMonsterPlacementAttemptsRef.current.delete(scope);
        }
        completeAppendMutation(scope, attempt);
        setStatus(`Placed ${formatNumber(createdTokens.length)} encounter monster${createdTokens.length === 1 ? "" : "s"} on ${targetScene.name}`);
      }
    );
    return placedTokens;
  }

  async function spawnEncounterThreatTokens(encounterId: string, threats: EncounterBuilderThreatSelection[], signal: AbortSignal, attemptId: string) {
    await createEncounterThreatTokens(encounterId, threats, signal, attemptId);
  }

  async function launchEncounterThreatTokens(encounterId: string, threats: EncounterBuilderThreatSelection[], partyActorIds: string[], signal: AbortSignal, attemptId: string) {
    if (activeCombat) throw new Error("End the active combat before launching another encounter.");
    if (!selectedScene) throw new Error("Select a scene before launching an encounter.");
    const partyTokens = partyActorIds.map((actorId) => selectedSceneTokens.find((token) => token.actorId === actorId && tokenLayer(token) !== "map"));
    const missingPartyActorIds = partyActorIds.filter((_actorId, index) => !partyTokens[index]);
    if (missingPartyActorIds.length > 0) {
      const missingNames = missingPartyActorIds.map((actorId) => snapshot.actors.find((actor) => actor.id === actorId)?.name ?? actorId);
      throw new Error(`Place selected party tokens before combat review: ${missingNames.join(", ")}.`);
    }
    const placedTokens = await createEncounterThreatTokens(encounterId, threats, signal, attemptId);
    if (placedTokens.length === 0) throw new Error("No encounter combatants were placed.");
    const tokenIds = [...new Set([...partyTokens.flatMap((token) => token ? [token.id] : []), ...placedTokens.map((token) => token.id)])];
    selectCanvasTokens(tokenIds);
    setEncounterBuilderOpen(false);
    setTab("combat");
    setCombatSetupOpen(true);
    setStatus(`Prepared ${formatNumber(tokenIds.length)} combatants (${formatNumber(partyTokens.length)} party, ${formatNumber(placedTokens.length)} hostile); review initiative to start.`);
  }

  async function disableAdminUser(user: AdminUserInfo) {
    await runWorkspaceAdminAction(
      (request) => updateAdminUser(user, { disabled: true, disabledReason: "Disabled from admin console" }, request.controller.signal),
      () => `${user.displayName} disabled`
    );
  }

  async function enableAdminUser(user: AdminUserInfo) {
    await runWorkspaceAdminAction(
      (request) => updateAdminUser(user, { disabled: false }, request.controller.signal),
      () => `${user.displayName} enabled`
    );
  }

  async function requireAdminPasswordReset(user: AdminUserInfo) {
    await runWorkspaceAdminAction(
      (request) => updateAdminUser(user, { passwordResetRequired: true }, request.controller.signal),
      () => `${user.displayName} must reset password`
    );
  }

  async function issueAdminPasswordReset(user: AdminUserInfo) {
    await runWorkspaceAdminAction(
      (request) => requestAdminPasswordReset(user, `${window.location.origin}/reset-password`, request.controller.signal),
      (reset) => `Queued ${reset.email.status} reset email for ${reset.email.to}`
    );
  }

  async function revokeAdminUserSessions(user: AdminUserInfo) {
    await runWorkspaceAdminAction(
      (request) => requestRevokeAdminUserSessions(user, request.controller.signal),
      (result) => `Revoked ${result.revoked} sessions for ${user.displayName}`
    );
  }

  async function revokeAdminSession(session: AdminSessionInfo) {
    await runWorkspaceAdminAction(
      (request) => requestRevokeAdminSession(session, request.controller.signal),
      () => `Revoked session for ${session.user.displayName}`
    );
  }

  async function revokeAdminRiskSessions() {
    const staleDays = adminSnapshot?.authOperations.sessions.staleDays ?? 30;
    await runWorkspaceAdminAction(
      (request) => requestRevokeAdminRiskSessions(staleDays, request.controller.signal),
      (result) => `Revoked ${result.revoked} of ${result.matched} risk sessions; ${result.remainingRiskSessionCount} remain`
    );
  }

  async function pruneExpiredPasswordResets() {
    await runWorkspaceAdminAction(
      (request) => requestPruneExpiredPasswordResets(request.controller.signal),
      (result) => `Pruned ${result.pruned} of ${result.matched} expired password resets; ${result.expiredRemaining} remain`
    );
  }

  async function retryAdminEmail(email: EmailOutboxMessage) {
    await runWorkspaceAdminAction(
      (request) => requestRetryAdminEmail(email, request.controller.signal),
      (retried) => `Email to ${retried.to} is ${retried.status}`
    );
  }

  async function retryAllAdminEmails() {
    await runWorkspaceAdminAction(
      (request) => requestRetryAllAdminEmails(request.controller.signal),
      (result) => `Retried ${result.retried} emails; ${result.delivered} delivered, ${result.failed} failed, ${result.skipped} skipped`
    );
  }

  async function retryAdminAiToolCall(toolCallId: string, toolName: string) {
    await runWorkspaceAdminAction((request) => requestRetryAdminAiToolCall(toolCallId, request.controller.signal), (result) => `Retried ${result.retried} ${toolName} call; ${result.completed} completed, ${result.failed} failed, ${result.skipped} skipped`);
  }

  async function failStaleAiThreads() {
    await runWorkspaceAdminAction((request) => failStaleAdminAiThreads(request.controller.signal), (result) => `Marked ${result.updated} of ${result.matched} stale AI threads failed`);
  }

  async function failStaleAiToolCalls() {
    await runWorkspaceAdminAction((request) => failStaleAdminAiToolCalls(request.controller.signal), (result) => `Marked ${result.updated} of ${result.matched} stale AI tool calls failed`);
  }

  async function rejectStaleAiProposals(includeApproved = false) {
    await runWorkspaceAdminAction((request) => rejectStaleAdminAiProposals(includeApproved, request.controller.signal), (result) => `Rejected ${result.updated} of ${result.matched} stale ${includeApproved ? "approved" : "pending"} AI proposals`);
  }

  async function cleanupStoredAssetBytes() {
    await runWorkspaceAdminAction(
      (request) => cleanupAdminStoredAssets(request.controller.signal),
      (result) => `Cleaned ${result.deleted} asset objects, marked ${result.missingMarked} missing, skipped ${result.skipped}, failed ${result.failed}`
    );
  }

  async function migrateStoredAssetBytes() {
    await runWorkspaceAdminAction(
      (request) => migrateAdminStoredAssets(request.controller.signal),
      (result) => `Migrated ${result.migrated} assets to ${result.targetProvider}, skipped ${result.skipped}, failed ${result.failed}`
    );
  }

  async function purgeAssetCdnCache(assetId: string, assetName: string, assetUpdatedAt: string) {
    await runWorkspaceAdminAction(
      (request) => purgeAdminAssetCdnCache(
        { assetId, updatedAt: assetUpdatedAt },
        "Purged from admin console",
        request.controller.signal
      ),
      (result) => `${assetName} CDN purge ${result.status}`
    );
  }

  async function quarantineAssetIntegrityFailures() {
    await runWorkspaceAdminAction(
      (request) => quarantineAdminAssetIntegrityFailures("Archived from admin integrity console", request.controller.signal),
      (result) => `Archived ${result.archived} broken assets, skipped ${result.skipped}, failed ${result.failed}`,
      { refreshWorkspace: true }
    );
  }

  async function updatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus) {
    await runWorkspaceAdminAction(
      (request) => updateAdminPluginReview(review, status, request.controller.signal),
      () => `${review.plugin.name} ${status}`,
      { refreshWorkspace: true }
    );
  }

  async function syncAdminPluginRegistries() {
    const expectedRegistryRevision = adminSnapshot?.pluginOperations.registryRevision ?? adminSnapshot?.pluginReviews.registryRevision;
    if (!expectedRegistryRevision) throw new Error("Refresh server administration before synchronizing plugin registries.");
    await runWorkspaceAdminAction(
      (request) => syncAdminPluginRegistry(expectedRegistryRevision, request.controller.signal),
      (result) => `Synced ${result.registries.length} registries and imported ${result.plugins.length} plugin packages`,
      { refreshWorkspace: true }
    );
  }

  async function createScimGroupRoleMapping(input: AdminScimGroupRoleMappingInput) {
    const scope = `admin-scim-mapping:create:${input.campaignId}`;
    const attempt = beginAppendMutation(scope, input);
    await runWorkspaceAdminAction(
      async (request) => {
        const result = await createAdminScimGroupRoleMapping(input, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey });
        completeAppendMutation(scope, attempt);
        return result;
      },
      (result) => `Mapped ${scimMappingLabel(result.mapping)} with ${result.sync.createdMemberships} created, ${result.sync.updatedMemberships} updated`,
      { refreshWorkspace: true }
    );
  }

  async function deleteScimGroupRoleMapping(mapping: AdminScimGroupRoleMapping) {
    const scope = `admin-scim-mapping:delete:${mapping.id}`;
    const attempt = beginAppendMutation(scope, { expectedUpdatedAt: mapping.updatedAt, preparedTargetSetHash: mapping.targetSetHash });
    await runWorkspaceAdminAction(
      async (request) => {
        const result = await deleteAdminScimGroupRoleMapping(mapping, { signal: request.controller.signal, idempotencyKey: attempt.idempotencyKey });
        completeAppendMutation(scope, attempt);
        return result;
      },
      (result) => `Removed ${scimMappingLabel(mapping)} and ${result.removedMemberships} sourced memberships`,
      { refreshWorkspace: true }
    );
  }

  function archiveExportScopeLabel() {
    return archiveExportScope === "world"
      ? worlds.find((world) => world.id === archiveExportWorldId)?.name ?? "world"
      : archiveExportScope === "selected_collections"
        ? "selected-records"
        : "campaign";
  }

  function archiveExportParams() {
    const params = new URLSearchParams({
      scope: archiveExportScope,
      version: archiveExportVersion,
      redaction: archiveRedactionMode
    });
    if (archiveExportScope === "world") params.set("scopeId", archiveExportWorldId);
    if (archiveExportScope === "selected_collections") params.set("collections", archiveExportCollections.join(","));
    return params;
  }

  async function exportCampaignStream() {
    if (archiveTransferBusy) return;
    const params = archiveExportParams();
    const scopeLabel = archiveExportScopeLabel();
    const safeCampaignName = (selectedCampaign?.name ?? "campaign").replace(/[<>:"/\\|?*]/g, "-").trim() || "campaign";
    const fileName = `${safeCampaignName}-${scopeLabel}.ottx`;
    const controller = new AbortController();
    archiveTransferAbortRef.current = controller;
    setArchiveExportStatus("Choose where to save the large archive");
    setArchiveTransfer({ direction: "export", phase: "choosing", fileName, loadedBytes: 0 });
    try {
      const result = await downloadCampaignArchiveStream({
        url: `${apiBase}/api/v1/campaigns/${campaignId}/export/stream?${params.toString()}`,
        fileName,
        token: getSessionToken(),
        signal: controller.signal,
        onProgress: (progress) => setArchiveTransfer({
          direction: "export",
          phase: "transferring",
          fileName,
          loadedBytes: progress.loadedBytes,
          totalBytes: progress.totalBytes
        })
      });
      setArchiveTransfer({ direction: "export", phase: "complete", fileName, loadedBytes: result.bytesWritten, totalBytes: result.bytesWritten });
      setArchiveExportStatus(`${scopeLabel} archive streamed directly to disk as ${archiveExportVersion}`);
    } catch (error) {
      const cancelled = isArchiveTransferAbort(error);
      const message = error instanceof Error ? error.message : String(error);
      setArchiveTransfer({ direction: "export", phase: cancelled ? "cancelled" : "failed", fileName, loadedBytes: 0, ...(!cancelled ? { error: message } : {}) });
      setArchiveExportStatus(cancelled ? "Archive export cancelled" : message);
    } finally {
      if (archiveTransferAbortRef.current === controller) archiveTransferAbortRef.current = null;
    }
  }

  async function exportCampaignJson() {
    setArchiveTransfer(undefined);
    setArchiveExportStatus("Preparing small JSON archive export");
    const params = archiveExportParams();
    const archive = await apiGet<object>(`/api/v1/campaigns/${campaignId}/export?${params.toString()}`);
    const scopeLabel = archiveExportScopeLabel();
    downloadJson(`${selectedCampaign?.name ?? "campaign"}-${scopeLabel}.ottx.json`, archive);
    setArchiveExportStatus(`${scopeLabel} archive exported as legacy JSON ${archiveExportVersion}`);
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
    const payload = {
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
    };
    const scope = `content-import:preview:${campaignId}`;
    const attempt = beginAppendMutation(scope, payload);
    const batch = await apiPost<ContentImportBatch>(`/api/v1/campaigns/${campaignId}/content-imports/preview`, payload, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setContentImportStatus(`Previewed ${batch.entities.length} ${batch.entities.length === 1 ? "record" : "records"}`);
    setStatus("Content import previewed");
    await refresh(campaignId, sceneId);
  }

  async function analyzePdfContentImport(file: File) {
    setContentImportStatus(`Analyzing ${file.name || "PDF"} with Codex PDF import`);
    const scope = `content-import:pdf:${campaignId}`;
    const attempt = beginAppendMutation(scope, { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified });
    const expectedUpdatedAt = snapshotRef.current.campaigns.find((candidate) => candidate.id === campaignId)?.updatedAt;
    if (!expectedUpdatedAt) throw new Error("Reload the campaign before analyzing a PDF.");
    const batch = await apiAnalyzePdfContentImport({ campaignId, file, expectedUpdatedAt }, { idempotencyKey: attempt.idempotencyKey });
    completeAppendMutation(scope, attempt);
    setContentImportStatus(`Previewed ${batch.entities.length} PDF ${batch.entities.length === 1 ? "record" : "records"}`);
    setStatus("PDF content import previewed");
    await refresh(campaignId, sceneId);
  }

  async function applyContentImport(batch: ContentImportBatch, selectedEntityIds?: string[]) {
    const latest = snapshotRef.current.contentImports.find((item) => item.id === batch.id) ?? batch;
    const entityIds = selectedEntityIds ?? (batch.selectedEntityIds.length > 0 ? batch.selectedEntityIds : batch.entities.filter((entity) => entity.selectedByDefault).map((entity) => entity.id));
    const payload = { selectedEntityIds: entityIds, expectedUpdatedAt: latest.updatedAt };
    const updated = await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/apply`, payload, {
      idempotencyKey: sharedMutationIdempotencyKey(`content-import:apply:${batch.id}`, latest.updatedAt, payload)
    });
    setContentImportStatus(`Applied ${updated.appliedRecords.length} ${updated.appliedRecords.length === 1 ? "record" : "records"}`);
    setStatus("Content import applied");
    await refresh(campaignId, sceneId);
  }

  async function rollbackContentImport(batch: ContentImportBatch) {
    const latest = snapshotRef.current.contentImports.find((item) => item.id === batch.id) ?? batch;
    const payload = { expectedUpdatedAt: latest.updatedAt };
    await apiPost<ContentImportBatch>(`/api/v1/content-imports/${batch.id}/rollback`, payload, {
      idempotencyKey: sharedMutationIdempotencyKey(`content-import:rollback:${batch.id}`, latest.updatedAt, payload)
    });
    await refresh(campaignId, sceneId, { syncStatus: false });
    setContentImportStatus(`Rolled back ${batch.source.sourceName}`);
    setStatus("Content import rolled back");
  }

  async function deleteContentImport(batch: ContentImportBatch) {
    const latest = snapshotRef.current.contentImports.find((item) => item.id === batch.id) ?? batch;
    await apiDelete<ContentImportBatch>(`/api/v1/content-imports/${batch.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, {
      idempotencyKey: sharedMutationIdempotencyKey(`content-import:delete:${batch.id}`, latest.updatedAt, {})
    });
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
          <button
            className="ghost-button wide"
            type="button"
            onClick={() => {
              setResetMode(false);
              setResetStatus("Ready");
              clearResetUrl();
            }}
          >
            <ChevronLeft size={16} /> Back to sign in
          </button>
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
          {!joinFormOpen && (
            <button className="ghost-button wide invite-entry-toggle" type="button" onClick={() => setJoinFormOpen(true)}>
              <UserPlus size={16} /> Have an invite token?
            </button>
          )}
          {joinFormOpen && (
            <form
              className="reset-form invite-accept-form"
              aria-busy={isAcceptingInvite}
              onSubmit={(event) => {
                event.preventDefault();
                acceptInvite().catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)));
              }}
            >
              <div className="section-title">Accept Invite</div>
              <label>
                <span>Invite Token</span>
                <input aria-label="Public invite token" value={joinToken} placeholder="oti_..." disabled={isAcceptingInvite} onChange={(event) => setJoinToken(event.target.value)} />
              </label>
              <label>
                <span>Email</span>
                <input aria-label="Join email" type="email" autoComplete="email" required value={joinEmail} placeholder="player@example.com" disabled={isAcceptingInvite} onChange={(event) => setJoinEmail(event.target.value)} />
              </label>
              <label>
                <span>Name <small>(new accounts)</small></span>
                <input aria-label="Display name" autoComplete="name" value={joinName} placeholder="Defaults to your email name" disabled={isAcceptingInvite} onChange={(event) => setJoinName(event.target.value)} />
              </label>
              <label>
                <span>Password</span>
                <input aria-label="Join password" type="password" autoComplete="current-password" minLength={8} required value={joinPassword} placeholder="Existing or new password" disabled={isAcceptingInvite} onChange={(event) => setJoinPassword(event.target.value)} />
              </label>
              {(joinMfaRequired || joinMfaCode) && (
                <label>
                  <span>MFA or Recovery Code</span>
                  <input aria-label="Invite MFA code or recovery code" autoComplete="one-time-code" value={joinMfaCode} placeholder="6-digit code or recovery code" disabled={isAcceptingInvite} onChange={(event) => setJoinMfaCode(event.target.value)} />
                </label>
              )}
              <button className="primary-button wide" type="submit" disabled={isAcceptingInvite || !joinToken.trim() || !joinEmail.trim() || joinPassword.length < 8 || (joinMfaRequired && !joinMfaCode.trim())}>
                <UserPlus size={16} /> {isAcceptingInvite ? "Accepting Invite..." : "Accept Invite"}
              </button>
              <button className="ghost-button wide" type="button" onClick={() => { cancelInviteAcceptance(); setJoinFormOpen(false); setJoinMfaRequired(false); setJoinMfaCode(""); }}>
                <ChevronLeft size={16} /> Use sign in instead
              </button>
            </form>
          )}
          {!joinFormOpen && (
            <>
          <div className="auth-mode-tabs" role="group" aria-label="Account mode">
            <button className={authMode === "login" ? "tab active" : "tab"} type="button" aria-pressed={authMode === "login"} onClick={() => setAuthMode("login")}>
              <KeyRound size={15} /> Login
            </button>
            {publicRegistration && (
              <button className={authMode === "register" ? "tab active" : "tab"} type="button" aria-pressed={authMode === "register"} onClick={() => setAuthMode("register")}>
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
                  <span>MFA or Recovery Code</span>
                  <input aria-label="Login MFA code or recovery code" autoComplete="one-time-code" value={loginMfaCode} placeholder="6-digit code or recovery code" onChange={(event) => setLoginMfaCode(event.target.value)} />
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
            <div className="auth-actions-heading">Explore without setup</div>
            {import.meta.env.DEV && (
              <button className="ghost-button wide" type="button" aria-label={["Demo", "GM"].join(" ")} hidden={authStatus === seededDemoUnavailableMessage} onClick={() => startDemoGmSession().catch((error) => setAuthStatus(seededDemoLoginErrorMessage(error)))}>
                <Users size={16} /> Seeded Demo
              </button>
            )}
            <button className="ghost-button wide" type="button" onClick={startBlankCanvasDemo}>
              <MapIcon size={16} /> Try Blank Canvas
            </button>
            <div className="auth-actions-heading">Account help</div>
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
              <Mail size={16} /> Forgot password?
            </button>
          </div>
            </>
          )}
          {authStatus && <div className="status reset-status">{authStatus}</div>}
        </section>
      </main>
    );
  }

  if (!snapshotReady) {
    const apiOffline = status.startsWith("API offline");
    const campaignLoadFailed = status.startsWith("Campaign load failed");
    const loadFailed = apiOffline || campaignLoadFailed;
    return (
      <main className="auth-shell">
        <section className="reset-panel auth-panel" aria-labelledby="snapshot-loading-title">
          <div className="reset-mark">
            <RefreshCw size={22} />
          </div>
          <div>
            <div className="eyebrow">{loadFailed ? "Connection" : "Workspace"}</div>
            <h1 id="snapshot-loading-title">{apiOffline ? "API connection required" : campaignLoadFailed ? "Campaign load failed" : "Loading campaign"}</h1>
          </div>
          <div className={`status reset-status ${loadFailed ? "connection-status" : ""}`} role="status" aria-live="polite">{status}</div>
          {loadFailed && (
            <button className="ghost-button wide" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> Retry campaign load
            </button>
          )}
        </section>
      </main>
    );
  }

  const manageCategories = [
    { id: "account", label: "Account", description: "Profile, preferences, security, and character transfers", icon: <UserCog size={16} />, badge: characterTransferPendingCount > 0 ? `${formatNumber(characterTransferPendingCount)} transfer` : snapshot.organizations.length > 0 ? formatNumber(snapshot.organizations.length) : undefined },
    { id: "campaign", label: "Campaign", description: "Create, edit, archive, and permissions", icon: <Shield size={16} />, visible: canManageCampaignSettings, badge: selectedCampaign?.archivedAt ? "archived" : "active" },
    { id: "people", label: "People", description: "Members, invites, and table joining", icon: <UserPlus size={16} />, visible: canManagePeople, badge: formatNumber(campaignPeopleCount(snapshot.members)) },
    { id: "scenes", label: "Scenes", description: "Scene creation, ordering, maps, and activation", icon: <MapPin size={16} />, visible: canManageScenes, badge: formatNumber(accessibleScenes.length) },
    { id: "archives", label: "Archives", description: "Portable exports, imports, and recovery", icon: <Download size={16} />, visible: canManageArchives, badge: archiveImportReport ? "ready" : undefined },
    { id: "serverAdmin", label: "Server Admin", description: "Operational admin tools", icon: <UserCog size={16} />, visible: Boolean(snapshot.session?.serverAdmin), badge: adminSnapshot ? "synced" : undefined }
  ] satisfies Array<{ id: ManageCategoryId; label: string; description: string; icon: React.ReactNode; badge?: string; visible?: boolean }>;
  const visibleManageCategories = manageCategories.filter((category) => category.visible !== false);
  const activeManageCategory = visibleManageCategories.some((category) => category.id === manageCategory) ? manageCategory : (visibleManageCategories[0]?.id ?? "account");
  const adminPanel = snapshot.session?.serverAdmin ? <DeferredPanel label="server administration"><LazyAdminPanel admin={adminSnapshot} campaigns={snapshot.campaigns} systems={snapshot.systems} workspaceDefaults={snapshot.workspaceDefaults} organizationMembers={snapshot.organizationMembers} currentUserId={currentUserId} workspaceKey={`${campaignId}:${currentUserId}`} status={adminStatus} onRefresh={refreshAdmin} onDisableUser={disableAdminUser} onEnableUser={enableAdminUser} onRequireReset={requireAdminPasswordReset} onIssueReset={issueAdminPasswordReset} onRevokeUserSessions={revokeAdminUserSessions} onRevokeSession={revokeAdminSession} onRevokeRiskSessions={revokeAdminRiskSessions} onPruneExpiredPasswordResets={pruneExpiredPasswordResets} onRetryEmail={retryAdminEmail} onRetryAllEmails={retryAllAdminEmails} onRetryAiToolCall={retryAdminAiToolCall} onFailStaleAiThreads={failStaleAiThreads} onFailStaleAiToolCalls={failStaleAiToolCalls} onRejectStaleAiProposals={rejectStaleAiProposals} onCleanupStoredAssetBytes={cleanupStoredAssetBytes} onMigrateStoredAssetBytes={migrateStoredAssetBytes} onQuarantineAssetIntegrityFailures={quarantineAssetIntegrityFailures} onPurgeAssetCdnCache={purgeAssetCdnCache} onUpdatePluginReview={updatePluginReview} onSyncPluginRegistries={syncAdminPluginRegistries} onUpdateWorkspaceDefaults={updateOrganizationWorkspaceDefaults} onAddOrganizationMember={addOrganizationMember} onUpdateOrganizationMember={updateOrganizationMember} onRemoveOrganizationMember={deleteOrganizationMember} onCreateScimMapping={createScimGroupRoleMapping} onDeleteScimMapping={deleteScimGroupRoleMapping} /></DeferredPanel> : null;
  const accountOnlyManageMode = visibleManageCategories.length === 1 && visibleManageCategories[0]?.id === "account";
  const manageWorkspaceEyebrow = accountOnlyManageMode ? "Account" : "Manage";
  const manageWorkspaceHeading = accountOnlyManageMode ? (snapshot.session?.user.displayName ?? "Account settings") : (selectedCampaign?.name ?? "Workspace settings");
  const workspaceModeOptions = [
    { id: "live", label: "Live Table", icon: <Eye size={15} /> },
    ...(canUsePrepWorkspace ? [{ id: "prep" as const, label: "Prep", icon: <MapPin size={15} /> }] : []),
    ...(canUseAiStudioWorkspace ? [{ id: "ai" as const, label: "AI Studio", icon: <Bot size={15} /> }] : []),
    { id: "manage", label: accountOnlyManageMode ? "Account" : "Manage", icon: accountOnlyManageMode ? <UserCog size={15} /> : <Boxes size={15} /> }
  ] satisfies Array<{ id: WorkspaceMode; label: string; icon: React.ReactNode }>;
  const sceneEditorNavigationBlocked = () => {
    return blockUnsavedSceneDraft("leaving Scene Manager");
  };
  const selectWorkspaceMode = (mode: WorkspaceMode) => {
    if (blockCampaignSetupNavigation("leaving campaign setup")) return false;
    if (mode !== "manage" && sceneEditorNavigationBlocked()) return false;
    setWorkspaceMode(mode);
    return true;
  };
  const selectManageCategory = (category: ManageCategoryId) => {
    if (blockCampaignSetupNavigation("leaving campaign setup")) return false;
    if (category !== "scenes" && sceneEditorNavigationBlocked()) return false;
    setManageCategory(category);
    return true;
  };
  const selectScene = (nextSceneId: string) => {
    if (blockCampaignSetupNavigation("leaving campaign setup")) return false;
    if (nextSceneId === sceneId) return true;
    if (sceneEditorNavigationBlocked()) {
      setStatus("Save or discard scene changes before switching scenes");
      return false;
    }
    setSceneId(nextSceneId);
    return true;
  };
  const openCampaignSearchResult = (result: CampaignSearchResult) => {
    if (blockCampaignSetupNavigation("opening a search result") || sceneEditorNavigationBlocked()) return;
    const item = result.type === "item" ? snapshot.items.find((candidate) => candidate.id === result.target.id) : undefined;
    if (result.type === "item" && !item) {
      setStatus(`${result.title} is no longer available. Campaign search has refreshed; choose a current result.`);
      return;
    }
    const itemActorId = item?.actorId ?? result.target.actorId;
    if (result.type === "encounter") {
      if (!snapshot.encounters.some((encounter) => encounter.id === result.target.id)) {
        setStatus(`${result.title} is no longer available. Campaign search has refreshed; choose a current encounter.`);
        return;
      }
      setCampaignSearchFocus(result);
      if (canUsePrepWorkspace) setWorkspaceMode("prep");
      setEncounterBuilderOpen(true);
      setStatus(`Opening ${result.title} in Encounter Builder`);
      return;
    }
    const destination = campaignSearchDestination(result.type);
    if (destination.workspace === "prep" && !canUsePrepWorkspace && (result.type === "world" || result.type === "memory")) {
      setStatus(`${result.title} is visible in search; its full workspace requires prep access`);
      return;
    }
    const workspace = destination.workspace === "prep" && !canUsePrepWorkspace ? "live" : destination.workspace;
    if (!selectWorkspaceMode(workspace)) return;
    setCampaignSearchFocus(result);
    if (result.type === "world") {
      if (!worlds.some((world) => world.id === result.target.id)) {
        setCampaignSearchFocus(undefined);
        setStatus(`${result.title} is no longer available. Refresh campaign search and try again.`);
        return;
      }
      setSelectedWorldId(result.id);
      setSceneId(accessibleScenes.find((scene) => scene.worldId === result.id)?.id ?? "");
    } else if (result.type === "scene") {
      if (!accessibleScenes.some((scene) => scene.id === result.target.id)) {
        setCampaignSearchFocus(undefined);
        setStatus(`${result.title} is no longer available to this seat. Campaign search has refreshed.`);
        return;
      }
      if (result.worldId) setSelectedWorldId(result.worldId);
      if (!selectScene(result.id)) return;
    } else if (result.type === "actor") {
      if (!snapshot.actors.some((actor) => actor.id === result.target.id)) {
        setCampaignSearchFocus(undefined);
        setStatus(`${result.title} is no longer available to this seat. Campaign search has refreshed.`);
        return;
      }
      selectActor(result.id);
    } else if (result.type === "item") {
      const targetActor = itemActorId ? snapshot.actors.find((actor) => actor.id === itemActorId) : selectedActor ?? snapshot.actors[0];
      if (!targetActor) {
        setCampaignSearchFocus(undefined);
        setStatus(`${result.title} is a loose campaign item, but no visible actor loadout is available for assignment.`);
        return;
      }
      selectActor(targetActor.id);
    } else if (result.type === "compendium") {
      setCompendiumSearch(result.title);
    }

    setTab(destination.tab);
    if (campaignSearchTypeHasRenderedAnchor(result.type)) {
      const request = currentWorkspaceRequestIdentity();
      setStatus(`Opening ${result.title} from campaign search`);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!workspaceIdentityIsCurrent(request)) return;
        const anchor = document.getElementById(campaignSearchAnchorId(result.type, result.id));
        if (!anchor) {
          setStatus(`Opened ${destination.tab} for ${result.title}; the record is hidden by the current panel filters`);
          return;
        }
        if (result.type === "handout" && anchor instanceof HTMLButtonElement) anchor.click();
        anchor.focus({ preventScroll: true });
        anchor.scrollIntoView({ block: "nearest" });
        setStatus(`Opened ${result.title} from campaign search`);
      }));
      return;
    }
    setStatus(result.type === "item" && !itemActorId ? `Opened loose item ${result.title} in the loadout assignment control` : `Opened ${result.title} from campaign search`);
  };
  const buildPaletteCommands = (): PaletteCommand[] => {
    const commands: PaletteCommand[] = [];
    for (const mode of workspaceModeOptions) {
      commands.push({ id: `workspace:${mode.id}`, label: `Go to ${mode.label}`, section: "Workspace", keywords: "workspace mode switch view" });
    }
    commands.push({ id: "action:ai-agent", label: aiAgentOpen ? "Close AI Agent" : "Open AI Agent", section: "Actions", keywords: "assistant bot help" });
    commands.push({ id: "action:campaign-search", label: "Search this campaign", section: "Actions", keywords: "find anything world scene actor item journal handout encounter canon chat roll" });
    if (hasPermission("combat.manage")) commands.push({ id: "action:encounter-builder", label: "Open Encounter Builder", section: "Actions", keywords: "prep combat monsters difficulty initiative" });
    commands.push({ id: "action:theme", label: `Switch theme to ${uiThemeLabel(nextUiTheme(uiTheme))}`, section: "Actions", keywords: "appearance midnight ember dark colors look" });
    commands.push({ id: "action:dice3d", label: dice3dEnabled ? "Use text-only dice" : "Enable 3D dice", section: "Actions", keywords: "dice animation roll tray three text only" });
    for (const scene of accessibleScenes) {
      commands.push({ id: `scene:${scene.id}`, label: `Open scene: ${scene.name}`, section: "Scenes", hint: scene.folder || undefined, keywords: "map board jump" });
    }
    commands.push(...campaignRecordPaletteCommands({ actors: snapshot.actors, journals: snapshot.journals, includeJournals: canUsePrepWorkspace }));
    for (const campaign of snapshot.campaigns) {
      if (campaign.id !== campaignId) commands.push({ id: `campaign:${campaign.id}`, label: `Switch campaign: ${campaign.name}`, section: "Campaigns", keywords: "game world table" });
    }
    if (hasPermission("dice.roll")) {
      const formulas = [...new Set([...snapshot.diceMacros.map((macro) => macro.formula), ...savedDiceFormulas])];
      for (const formula of formulas) {
        commands.push({ id: `roll:${formula}`, label: `Roll ${formula}`, section: "Dice", keywords: "dice roll" });
      }
    }
    return commands;
  };
  const paletteCommands = commandPaletteOpen ? buildPaletteCommands() : [];
  const runPaletteCommand = (commandId: string) => {
    setCommandPaletteOpen(false);
    if (blockCampaignSetupNavigation("using another workspace command")) return;
    if (commandId.startsWith("workspace:")) {
      selectWorkspaceMode(commandId.slice("workspace:".length) as WorkspaceMode);
      return;
    }
    if (commandId.startsWith("scene:")) {
      const destination = sceneSelectionDestination(workspaceMode, canManageScenes);
      if (!selectScene(commandId.slice("scene:".length))) return;
      if (destination.manageCategory) setManageCategory(destination.manageCategory);
      if (destination.workspaceMode !== workspaceMode) selectWorkspaceMode(destination.workspaceMode);
      return;
    }
    if (commandId.startsWith("campaign:")) {
      if (sceneEditorNavigationBlocked()) return;
      const nextCampaignId = commandId.slice("campaign:".length);
      selectWorkspaceContext(nextCampaignId, "");
      if (!blankCanvasDemoOpen) refresh(nextCampaignId, "").catch((error) => setStatus(errorMessage(error)));
      return;
    }
    if (commandId.startsWith("roll:")) {
      const formula = commandId.slice("roll:".length);
      setDiceFormula(formula);
      rollDice(formula).catch((error) => setStatus(errorMessage(error)));
      return;
    }
    if (commandId.startsWith("actor:")) {
      if (sceneEditorNavigationBlocked()) return;
      const actorId = commandId.slice("actor:".length);
      const token = snapshot.tokens.find((item) => item.actorId === actorId && item.sceneId === selectedScene?.id) ?? snapshot.tokens.find((item) => item.actorId === actorId);
      if (token) {
        if (token.sceneId !== sceneId) setSceneId(token.sceneId);
        selectSingleToken(token.id);
      } else selectActor(actorId);
      if (workspaceMode === "manage") setWorkspaceMode("live");
      setTab("actors");
      return;
    }
    if (commandId.startsWith("journal:")) {
      if (sceneEditorNavigationBlocked()) return;
      if (workspaceMode !== "prep") setWorkspaceMode("prep");
      setTab("journal");
      return;
    }
    if (commandId === "action:ai-agent") {
      setAiAgentOpen((open) => !open);
      return;
    }
    if (commandId === "action:campaign-search") {
      if (workspaceMode !== "live" && workspaceMode !== "prep") setWorkspaceMode("live");
      setTab("search");
      return;
    }
    if (commandId === "action:encounter-builder") {
      if (canUsePrepWorkspace) setWorkspaceMode("prep");
      setCampaignSearchFocus(undefined);
      setEncounterBuilderOpen(true);
      return;
    }
    if (commandId === "action:dice3d") {
      persistQuickPreferences({ dice3dEnabled: !dice3dEnabled }, dice3dEnabled ? "Use text-only dice" : "Enable 3D dice");
      return;
    }
    if (commandId === "action:theme") {
      const nextTheme = nextUiTheme(uiTheme);
      persistQuickPreferences({ theme: nextTheme }, `Switch theme to ${uiThemeLabel(nextTheme)}`);
    }
  };
  const campaignSystemName = snapshot.systems.find((system) => system.id === selectedCampaign?.defaultSystemId)?.name ?? selectedCampaign?.defaultSystemId ?? "No system";
  const workspaceEyebrow = workspaceMode === "ai" ? "AI Studio" : workspaceMode === "prep" ? "Prep" : workspaceMode === "manage" ? manageWorkspaceEyebrow : campaignSystemName;
  const workspaceHeading = workspaceMode === "manage" ? manageWorkspaceHeading : (selectedCampaign?.name ?? "Create a campaign");
  const showSceneTabs = workspaceMode !== "manage";
  const showScenePrepControls = workspaceMode === "prep";
  const showSceneSelectionControls = workspaceMode === "prep" || (workspaceMode === "manage" && activeManageCategory === "scenes");
  const canSelectPrepScenes = showSceneSelectionControls && hasPermission("scene.update");
  const canQuickCreateScene = workspaceMode === "prep" && hasPermission("scene.create");
  const canQuickDeleteScenes = workspaceMode === "prep" && hasPermission("scene.delete") && accessibleScenes.length > 1;
  const showQuickCreate = (workspaceMode === "live" || workspaceMode === "prep") && hasPermission("token.create");
  const showTableWorkspace = workspaceMode === "live" || workspaceMode === "prep";
  const encounterBuilderSystem = snapshot.systems.find((item) => campaignSearchFocus?.type === "encounter" && item.id === campaignSearchFocus.target.systemId) ?? snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
  const desktopRelay = desktopStatus?.relay;
  const desktopRelayState = desktopRelay?.state ?? "stopped";
  const desktopInviteUrl = desktopRelay?.inviteUrl ?? desktopRelay?.publicUrl ?? "";
  const inspectorTabs: InspectorTab[] = workspaceMode === "live"
    ? ["actors", "compendium", "handouts", "journal", "search", "chat", "combat"]
    : workspaceMode === "prep"
      ? ["actors", "compendium", "sessions", "worlds", "handouts", "journal", "memory", "search", "content", "plugins"]
      : ["actors", "compendium", "journal", "content", "plugins"];
  const aiPanelElement = (
    <DeferredPanel label="AI Studio"><LazyAiPanel
      campaignId={selectedCampaign?.id}
      canManagePolicy={hasPermission("campaign.update")}
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
      revertProposal={revertProposalReview}
      approveMemory={approveMemory}
      deleteMemory={deleteMemory}
      canDraftEncounter={hasPermission("ai.proposeChanges") && hasPermission("combat.manage") && hasPermission("scene.create")}
      canPropose={hasPermission("ai.proposeChanges")}
      canRecapSession={hasPermission("ai.proposeChanges") && hasPermission("journal.create")}
      canApply={hasPermission("ai.applyChanges")}
      canRevert={!blankCanvasDemoOpen && hasPermission("ai.applyChanges")}
      canPlanEncounter={Boolean(snapshot.systems.length > 0 && hasPermission("combat.manage"))}
      canGenerateMap={Boolean(selectedScene && !isAiGeneratingMap && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("scene.update"))}
      canGenerateToken={Boolean(selectedToken && !isAiGeneratingTokenArt && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("token.update"))}
      canGenerateTokenBatch={Boolean(selectedScene && !isAiGeneratingTokenArt && selectedSceneTokensNeedingArt.length > 0 && hasPermission("ai.proposeChanges") && hasPermission("scene.create") && hasPermission("token.update"))}
    /></DeferredPanel>
  );

  return (
    <>
    {consequenceReview.dialog}
    <RetryableActionNotice
      operation={campaignAction.operation}
      onRetry={campaignAction.retryAction ? () => void campaignAction.retryAction?.() : undefined}
      onDismiss={campaignAction.clearAction}
      className="global-action-failure"
    />
    <main className="shell" aria-label="OpenTabletop workspace" aria-busy={realtimeUiState === "syncing"} inert={realtimeUiState === "syncing" ? true : undefined} data-table-focus={tableFocusMode ? "true" : undefined}>
      <aside className={`rail rail-${workspaceMode} ${workspaceMode === "manage" ? "rail-manage" : "rail-play"}`}>
        <div className="brand-block">
          <div>
            <div className="brand">OpenTabletop</div>
          </div>
          <div className="rail-quick-actions">
            <button className="icon-button" type="button" title="Command palette (Ctrl+K)" aria-label="Open command palette" onClick={() => setCommandPaletteOpen(true)}>
              <Search size={15} />
            </button>
            <button className="icon-button" type="button" title={`Theme: ${uiThemeLabel(uiTheme)} - switch to ${uiThemeLabel(nextUiTheme(uiTheme))}`} aria-label="Switch color theme" onClick={() => { const nextTheme = nextUiTheme(uiTheme); persistQuickPreferences({ theme: nextTheme }, `Switch theme to ${uiThemeLabel(nextTheme)}`); }}>
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
                if (blockCampaignSetupNavigation("switching campaigns")) return;
                if (sceneEditorNavigationBlocked()) return;
                selectWorkspaceContext(campaign.id, "");
                if (!blankCanvasDemoOpen) void refresh(campaign.id, "").catch((error) => setStatus(`Could not load ${campaign.name}: ${errorMessage(error)}. Select the campaign again to retry.`));
              }}
            >
              <Shield size={16} />
              <span>{campaign.name}</span>
            </button>
          ))}
        </nav>
        {import.meta.env.DEV && snapshot.members.some((member) => member.user.id.startsWith("usr_demo_")) && <label className="session-switcher">
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
        </label>}
        <p className="account-summary rail-session-summary">
          {snapshot.session?.user.displayName ?? currentUserId}
        </p>
        <div className="rail-mode workspace-mode-switcher" role="group" aria-label="Workspace mode">
          {workspaceModeOptions.map((mode) => (
            <button ref={(element) => { workspaceModeButtonRefs.current[mode.id] = element; }} className={workspaceMode === mode.id ? "ghost-button active" : "ghost-button"} key={mode.id} type="button" aria-label={mode.label} aria-pressed={workspaceMode === mode.id} title={mode.label} onClick={() => selectWorkspaceMode(mode.id)}>
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
        <button ref={aiAgentToggleRef} className={aiAgentOpen ? "ai-agent-toggle active" : "ai-agent-toggle"} type="button" onClick={() => aiAgentOpen ? closeAiAgent() : openAiAgent()} aria-label="AI Agent" title="AI Agent" aria-expanded={aiAgentOpen}>
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
              Audio
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
                onClick={() => selectActor(actor.id)}
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
                onClick={() => selectActor(actor.id)}
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
                onClick={() => selectManageCategory(category.id)}
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
        {snapshot.session?.user && <ProfilePreferences user={snapshot.session.user} onSaved={applyAuthenticatedUser} />}
        <CharacterTransferPanel
          campaignId={campaignId}
          currentUserId={currentUserId}
          actors={snapshot.actors}
          members={snapshot.members}
          canTransferCharacters={hasPermission("actor.update") || hasPermission("actor.updateOwned")}
          canShareCharacters={hasPermission("actor.update")}
          refreshSignal={characterTransferRevision}
          onActorUpdated={applyActorToSnapshot}
          onPendingCount={setCharacterTransferPendingCount}
        />
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
            {(mfaInfo?.totpEnabled || mfaInfo?.totpPending || Boolean(mfaSecret)) && <input aria-label={mfaInfo?.totpEnabled ? "MFA code or recovery code" : "MFA code"} inputMode={mfaInfo?.totpEnabled ? undefined : "numeric"} autoComplete="one-time-code" value={mfaCode} placeholder={mfaInfo?.totpEnabled ? "6-digit code or recovery code" : "6-digit MFA code"} onChange={(event) => setMfaCode(event.target.value)} />}
            {mfaSecret && <input aria-label="MFA secret" readOnly value={mfaSecret} onFocus={(event) => event.currentTarget.select()} />}
            <button className="ghost-button wide" type="submit" disabled={!mfaPassword || ((mfaInfo?.totpEnabled || mfaInfo?.totpPending || Boolean(mfaSecret)) && !mfaCode.trim())}>
              <Shield size={16} /> {mfaInfo?.totpEnabled ? "Disable MFA" : mfaInfo?.totpPending || mfaSecret ? "Confirm MFA" : "Enable MFA"}
            </button>
            {mfaRecoveryCodes.length > 0 && <textarea aria-label="MFA recovery codes" readOnly value={mfaRecoveryCodes.join("\n")} onFocus={(event) => event.currentTarget.select()} />}
          </form>
          <div className="status">{accountStatus}</div>
        </section>
        {selectedCampaign && !canManageCampaignSettings && <FirstSessionSetupChecklist actors={snapshot.actors} currentUserId={currentUserId} canManage={false} canCreateCharacter={hasPermission("actor.create")} memberCount={snapshot.members.length} pendingInviteCount={0} scenes={snapshot.scenes} tokens={snapshot.tokens} encounterCount={snapshot.encounters.length} onOpen={openFirstSessionSetupStep} />}
              </div>
            )}
            {activeManageCategory === "campaign" && (
              <div className="manage-card-grid">
        <details className="account-box create-drawer">
          <summary><Plus size={15} /> New campaign</summary>
          <CampaignSetupSteps draft={currentCampaignSetupDraft()} systems={snapshot.systems} busy={isCreatingCampaignSetup} recoveryPending={campaignSetupRecoveryPending} draftNotice={campaignSetupDraftNotice} submitButtonRef={campaignSetupSubmitRef} onChange={updateCampaignSetupDraft} onSubmit={() => createCampaignFromSetup().catch((error) => setStatus(errorMessage(error)))} onCancel={cancelCampaignSetup} onKeep={() => keepCampaignSetupAsIs().catch((error) => setStatus(errorMessage(error)))} onDiscardDraft={discardCampaignSetupDraft} />
        </details>
        {selectedCampaign && <FirstSessionSetupChecklist actors={snapshot.actors} currentUserId={currentUserId} canManage canCreateCharacter={hasPermission("actor.create")} memberCount={snapshot.members.length} pendingInviteCount={snapshot.organizationInvites.filter((invite) => invite.campaign.id === selectedCampaign.id && invite.status === "pending").length} scenes={snapshot.scenes} tokens={snapshot.tokens} encounterCount={snapshot.encounters.length} onOpen={openFirstSessionSetupStep} />}
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
        {selectedCampaign && hasPermission("campaign.update") && (
          <details className="account-box campaign-duplicate-card">
            <summary><Copy size={15} /> Duplicate campaign</summary>
            <form className="content-import-form" onSubmit={(event) => {
              event.preventDefault();
              const idempotencyKey = `campaign-duplicate:${selectedCampaign.id}:${globalThis.crypto.randomUUID()}`;
              void campaignAction.runAction(`Duplicate ${selectedCampaign.name}`, () => duplicateSelectedCampaign(idempotencyKey));
            }}>
              <p className="account-summary">Copies playable campaign content, scenes, maps, actors, journals, sessions, encounters, and settings. The copy opens in Prep with you as its owner; invitations and user-specific grants are intentionally reset.</p>
              <label>
                <span>New campaign name</span>
                <input aria-label="Duplicate campaign name" value={campaignDuplicateName} disabled={campaignDuplicateBusy} onChange={(event) => { setCampaignDuplicateName(event.target.value); setCampaignDuplicateError(""); }} />
              </label>
              {campaignDuplicateError && <p className="creator-error" role="alert">Duplication failed: {campaignDuplicateError}</p>}
              <button className="primary-button wide" type="submit" disabled={campaignDuplicateBusy || !campaignDuplicateName.trim()}>
                {campaignDuplicateBusy ? <RefreshCw className="spin" size={15} /> : <Copy size={15} />} {campaignDuplicateBusy ? "Duplicating..." : "Duplicate and open copy"}
              </button>
            </form>
          </details>
        )}
        {selectedCampaign && hasPermission("campaign.update") && (
          <CampaignRulesProfilePanel
            campaign={selectedCampaign}
            onSaved={(updated) => {
              setSnapshot((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === updated.id ? updated : campaign) }));
              setStatus("Campaign rules profile saved");
            }}
            onRefresh={async () => { await refresh(selectedCampaign.id, realtimeSelectionRef.current.sceneId, { syncStatus: false }); }}
          />
        )}
        {selectedCampaign && hasPermission("campaign.update") && (
          <DeferredPanel label="campaign webhooks">
          <LazyCampaignWebhooksPanel
            key={`campaign-webhooks:${selectedCampaign.id}:${currentUserId}`}
            campaignId={selectedCampaign.id}
            campaignUpdatedAt={selectedCampaign.updatedAt}
            onCampaignUpdatedAt={(updatedAt) => {
              setSnapshot((current) => ({
                ...current,
                campaigns: current.campaigns.map((campaign) =>
                  campaign.id === selectedCampaign.id ? { ...campaign, updatedAt } : campaign,
                ),
              }));
            }}
            onStatus={setStatus}
          />
          </DeferredPanel>
        )}
              </div>
            )}
            {activeManageCategory === "people" && (
              <div className="manage-card-grid">
        <CharacterTransferPanel
          campaignId={campaignId}
          currentUserId={currentUserId}
          actors={snapshot.actors}
          members={snapshot.members}
          canTransferCharacters={hasPermission("actor.update") || hasPermission("actor.updateOwned")}
          canShareCharacters={hasPermission("actor.update")}
          refreshSignal={characterTransferRevision}
          onActorUpdated={applyActorToSnapshot}
          onPendingCount={setCharacterTransferPendingCount}
        />
        <CampaignMembersPanel campaignId={campaignId} currentUserId={currentUserId} members={snapshot.members} canManage={hasPermission("campaign.update")} onMemberUpdated={(member) => setSnapshot((current) => ({ ...current, members: current.members.map((candidate) => candidate.id === member.id ? member : candidate) }))} onMemberRemoved={(memberId) => setSnapshot((current) => ({ ...current, members: current.members.filter((candidate) => candidate.id !== memberId) }))} onRefresh={async () => { await refresh(campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }); }} onStatus={setStatus} />
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
            {inviteAcceptUrl && (
              <div className="invite-link-row">
                <input ref={inviteLinkRef} aria-label="Invite link" readOnly value={inviteAcceptUrl} onFocus={(event) => event.currentTarget.select()} />
                <button className="primary-button" type="button" onClick={() => copyInviteLink().catch((error) => setStatus(errorMessage(error)))}>
                  <Copy size={16} /> Copy link
                </button>
              </div>
            )}
            {inviteToken && <input aria-label="Invite token" readOnly value={inviteToken} onFocus={(event) => event.currentTarget.select()} />}
            <OrganizationInviteRoster invites={snapshot.organizationInvites} onRevoke={(invite) => { void revokeOrganizationInvite(invite.id).catch((error) => setStatus(error instanceof Error ? error.message : String(error))); }} />
          </form>
        )}
        {selectedCampaign && (
          <CampaignOwnershipTransfer
            campaign={selectedCampaign}
            members={snapshot.members}
            currentUserId={currentUserId}
            onTransfer={transferSelectedCampaignOwnership}
          />
        )}
        <details className="account-box create-drawer">
          <summary><UserPlus size={15} /> Join with an invite token</summary>
        <form
          className="create-drawer-form"
          aria-busy={isAcceptingInvite}
          onSubmit={(event) => {
            event.preventDefault();
            acceptInvite().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="section-title">Join</div>
          <input aria-label="Invite token" value={joinToken} placeholder="oti_..." disabled={isAcceptingInvite} onChange={(event) => setJoinToken(event.target.value)} />
          <input aria-label="Join email" type="email" autoComplete="email" value={joinEmail} placeholder="player@example.com" disabled={isAcceptingInvite} onChange={(event) => setJoinEmail(event.target.value)} />
          <input aria-label="Display name" autoComplete="name" value={joinName} placeholder="Name for new accounts (optional)" disabled={isAcceptingInvite} onChange={(event) => setJoinName(event.target.value)} />
          <input aria-label="Password" type="password" autoComplete="current-password" minLength={8} value={joinPassword} placeholder="Existing or new password" disabled={isAcceptingInvite} onChange={(event) => setJoinPassword(event.target.value)} />
          {(joinMfaRequired || joinMfaCode) && (
            <input aria-label="Invite MFA code or recovery code" autoComplete="one-time-code" value={joinMfaCode} placeholder="6-digit code or recovery code" disabled={isAcceptingInvite} onChange={(event) => setJoinMfaCode(event.target.value)} />
          )}
          <button className="ghost-button wide" type="submit" disabled={isAcceptingInvite || !joinToken.trim() || !joinEmail.trim() || joinPassword.length < 8 || (joinMfaRequired && !joinMfaCode.trim())}>
            <ChevronRight size={16} /> {isAcceptingInvite ? "Joining..." : "Join"}
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
              if (sceneEditDirty) {
                setStatus("Save or discard scene changes before changing scene filters");
                return;
              }
              const nextFolder = event.target.value;
              setSceneFolderFilter(nextFolder);
              const nextScene = nextFolder === "all" ? orderedScenes[0] : orderedScenes.find((scene) => scene.folder === nextFolder);
              if (nextScene && (nextFolder !== "all" || !selectedScene)) selectScene(nextScene.id);
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
          {workspaceMode === "manage" && <SceneManagerTabs assets={snapshot.assets} canSelectScenes={canSelectPrepScenes} scenes={visibleScenes} selectedSceneId={sceneId} selectedSceneIds={selectedPrepSceneIds} onSelectScene={selectScene} onToggleSceneSelection={togglePrepSceneSelection} />}
          {(hasPermission("scene.update") || hasPermission("scene.create")) && (
            <div className="button-row">
              {hasPermission("scene.update") && <input aria-label="Bulk scene folder" value={bulkSceneFolder} placeholder="Move visible to folder" onChange={(event) => setBulkSceneFolder(event.target.value)} />}
              {hasPermission("scene.update") && <button className="ghost-button" type="button" disabled={sceneEditDirty || visibleScenes.length === 0} onClick={() => moveVisibleScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Move visible scenes
              </button>}
              <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={selectVisiblePrepScenes}>
                Select visible scenes
              </button>
              <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={clearPrepSceneSelection}>
                Clear selected scenes
              </button>
              {hasPermission("scene.update") && <button className="ghost-button" type="button" disabled={sceneEditDirty || selectedPrepScenes.length === 0} onClick={() => moveSelectedPrepScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Move selected scenes
              </button>}
              {hasPermission("scene.create") && <button className="ghost-button" type="button" disabled={sceneEditDirty || sceneDuplicationBusy || selectedPrepScenes.length === 0} onClick={() => duplicateSelectedPrepScenes().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                Duplicate selected scenes
              </button>}
            </div>
          )}
          {renderSceneDuplicationReview()}
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
              <SceneGridFields mode="create" gridType={newSceneGridType} gridSize={newSceneGridSize} onGridTypeChange={setNewSceneGridType} onGridSizeChange={setNewSceneGridSize} />
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
              {newSceneGridType === "square" && <div className="scene-size-presets">
                {sceneSizePresets.map((preset) => (
                  <button className="ghost-button" type="button" key={preset.id} onClick={() => applyNewSceneSizePreset(preset)}>
                    {preset.description} {preset.label}
                  </button>
                ))}
              </div>}
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
            aria-label={`Edit scene ${selectedScene.name}`}
            onSubmit={(event) => {
              event.preventDefault();
              saveSceneSettings(event.currentTarget).catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Scene Manager</div>
            <div className="scene-background-preview">
              {selectedMapAsset ? <img src={assetThumbnailUrl(selectedMapAsset)} alt="" /> : <FileText size={24} />}
              <div>
                <strong>{selectedMapAsset?.name ?? "No background"}</strong>
                <span>{sceneGridSummary(selectedScene)}</span>
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
              <SceneGridFields mode="edit" gridType={sceneEditGridType} gridSize={sceneEditGridSize} overlayVisible={sceneEditGridOverlayVisible} onGridTypeChange={(gridType) => { setSceneEditDirty(true); setSceneEditGridType(gridType); }} onGridSizeChange={(gridSize) => { setSceneEditDirty(true); setSceneEditGridSize(gridSize); }} onOverlayVisibleChange={(visible) => { setSceneEditDirty(true); setSceneEditGridOverlayVisible(visible); }} />
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
              {sceneEditGridType === "square" && <div className="scene-size-presets">
                {sceneSizePresets.map((preset) => (
                  <button className="ghost-button" type="button" key={preset.id} onClick={() => applySceneEditSizePreset(preset)}>
                    {preset.description} {preset.label}
                  </button>
                ))}
              </div>}
            </div>
            <label className="inline-check">
              <input
                type="checkbox"
                name="sceneEditActive"
                checked={sceneEditActive}
                disabled={selectedScene.active}
                onChange={(event) => {
                  setSceneEditDirty(true);
                  setSceneEditActive(event.target.checked);
                }}
              />
              <span>{selectedScene.active ? "Active player scene; activate another scene to change" : "Activate for players on save"}</span>
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
              <button className="ghost-button" type="button" disabled={!sceneEditDirty} onClick={discardSceneEdits}>
                <RotateCcw size={16} /> Discard
              </button>
              <button className="ghost-button" type="button" disabled={selectedScene.active || sceneEditDirty} onClick={() => activateSelectedScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <Eye size={16} /> Activate
              </button>
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={sceneEditDirty || selectedSceneIndex <= 0} onClick={() => moveSelectedScene("up").catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <ChevronLeft size={16} /> Move Up
              </button>
              <button className="ghost-button" type="button" disabled={sceneEditDirty || selectedSceneIndex < 0 || selectedSceneIndex >= orderedScenes.length - 1} onClick={() => moveSelectedScene("down").catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <ChevronRight size={16} /> Move Down
              </button>
            </div>
            {hasPermission("scene.create") && (
              <div className="mini-form">
                <input aria-label="Duplicate scene name" value={sceneDuplicateName} onChange={(event) => setSceneDuplicateName(event.target.value)} />
                <button className="ghost-button wide" type="button" disabled={sceneEditDirty || sceneDuplicationBusy || !sceneDuplicateName.trim()} onClick={() => duplicateSelectedScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
                <button className="ghost-button wide danger-button" type="button" disabled={sceneEditDirty || !sceneDeleteConfirmed} onClick={() => sceneDeleteTarget && deleteScene(sceneDeleteTarget).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  <UserX size={16} /> Delete Scene
                </button>
              </div>
            )}
          </form>
        )}
        {selectedScene && hasPermission("scene.update") && (
          <SceneDelegationPanel
            key={`scene-delegation:${selectedScene.id}:${currentUserId}`}
            scene={selectedScene}
            members={snapshot.members}
            currentUserId={currentUserId}
            onSceneChange={applySceneToSnapshot}
            onStatus={setStatus}
          />
        )}
        <button className="ghost-button" type="button" aria-label={selectedScene ? `Upload map to ${selectedScene.name} and calibrate` : "Upload map and calibrate"} onClick={() => document.getElementById("map-upload-file")?.click()} disabled={!selectedScene || !hasPermission("scene.create") || !hasPermission("scene.update")} title={!selectedScene ? "Select a scene before uploading a map" : hasPermission("scene.create") && hasPermission("scene.update") ? `Upload a map to ${selectedScene.name}, set it as the background, and calibrate its grid` : "Requires scene.create and scene.update"}>
          <Upload size={16} /> {selectedScene ? `Upload map to ${selectedScene.name} & calibrate` : "Upload map & calibrate"}
        </button>
        <input
          key={`map-upload-file:${selectedScene?.id ?? "none"}`}
          id="map-upload-file"
          type="file"
          aria-label={selectedScene ? `Choose map file for ${selectedScene.name}` : "Choose map file for selected scene"}
          data-scene-id={selectedScene?.id}
          disabled={!selectedScene || !hasPermission("scene.create") || !hasPermission("scene.update")}
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={(event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            void uploadMap(file)
              .catch((error) => setStatus(`Map upload failed: ${errorMessage(error)}`))
              .finally(() => { input.value = ""; });
          }}
        />
              </div>
            )}
            {activeManageCategory === "archives" && (
              <div className="manage-card-grid">
        <section className="account-box" aria-label="Archive export wizard">
          <div className="section-title">Archive Export</div>
          <select aria-label="Archive export scope" value={archiveExportScope} onChange={(event) => { const scope = event.target.value as ArchiveExportScope; setArchiveExportScope(scope); if (scope === "world" && !archiveExportWorldId) setArchiveExportWorldId(worlds[0]?.id ?? ""); }}>
            <option value="campaign">Current campaign</option>
            <option value="world">One world</option>
            <option value="selected_collections">Selected record collections</option>
          </select>
          {archiveExportScope === "world" && (
            <label>
              <span>World</span>
              <select aria-label="Archive export world" value={archiveExportWorldId} onChange={(event) => setArchiveExportWorldId(event.target.value)}>
                <option value="">Select a world</option>
                {worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
              </select>
            </label>
          )}
          {archiveExportScope === "selected_collections" && (
            <div className="asset-pressure-list archive-export-collections" aria-label="Archive export collection selection">
              {archiveExportCollectionOptions.map((option) => (
                <label className="operator-row tool-call-row" key={option.id}>
                  <span>{option.label}</span>
                  <input
                    type="checkbox"
                    aria-label={`Export ${option.label}`}
                    checked={archiveExportCollections.includes(option.id)}
                    onChange={(event) => updateArchiveExportCollection(option.id, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}
          <select aria-label="Archive export version" value={archiveExportVersion} onChange={(event) => setArchiveExportVersion(event.target.value as ArchiveExportVersion)}>
            <option value="0.2.0">Archive 0.2.0</option>
          </select>
          <select aria-label="Archive redaction mode" value={archiveRedactionMode} onChange={(event) => setArchiveRedactionMode(event.target.value as ArchiveRedactionMode)}>
            <option value="portable">Portable table archive</option>
          </select>
          <div className="asset-pressure-list" aria-label="Archive compatibility notes">
            <div className="operator-row tool-call-row">
              <span>Scope</span>
              <strong>{archiveExportRecordCount === undefined ? "Select a world to estimate" : `At least ${formatNumber(archiveExportRecordCount)} records`}</strong>
            </div>
            {archiveCompatibilityNotes.map((note) => (
              <div className="operator-row tool-call-row" key={note}>
                <span>Note</span>
                <strong>{note}</strong>
              </div>
            ))}
          </div>
          <p className="account-summary">{archiveExportStatus}</p>
          <button className="ghost-button wide" type="button" disabled={archiveTransferBusy || (archiveExportScope === "world" && !archiveExportWorldId)} onClick={() => exportCampaignStream().catch((error) => setArchiveExportStatus(error instanceof Error ? error.message : String(error)))} title="Stream a large .ottx archive directly to disk">
            <Download size={16} /> Export Large Archive (.ottx)
          </button>
          <button className="ghost-button wide" type="button" disabled={archiveTransferBusy || (archiveExportScope === "world" && !archiveExportWorldId)} onClick={() => exportCampaignJson().catch((error) => setArchiveExportStatus(error instanceof Error ? error.message : String(error)))} title="Materialize a legacy JSON archive for small campaigns and older tooling">
            <Download size={16} /> Export JSON (small archives)
          </button>
        </section>
        <button className="ghost-button" onClick={() => exportDogfoodReportBundle().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))} title="Download a redacted issue report bundle">
          <Download size={16} /> Report Bundle
        </button>
        <ArchiveTransferProgress state={archiveTransfer} onCancel={cancelArchiveTransfer} />
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
          <button className="ghost-button wide" type="button" onClick={() => document.getElementById("import-file")?.click()} disabled={isImportingArchive || archiveTransferBusy} aria-describedby="import-status" title="Import a streamed .ottx archive or legacy .ottx.json archive">
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
              {archiveImportReport.conflicts.slice(0, 4).map((conflict) => (
                <div className="operator-row tool-call-row" key={`${conflict.collection}:${conflict.id}`}>
                  <span>{conflict.collection}</span>
                  <strong>{conflict.id}</strong>
                </div>
              ))}
            </div>
          )}
          <ArchiveImportRecovery
            operations={archiveImportOperations}
            selectedOperationId={selectedArchiveImportOperationId}
            preview={archiveImportRollbackPreview}
            busy={archiveImportRecoveryBusy}
            onSelect={(operationId) => {
              setSelectedArchiveImportOperationId(operationId);
              setArchiveImportRollbackPreview(undefined);
            }}
            onPreview={(operationId) => void previewArchiveImportRollback(operationId).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}
            onRollback={(operationId) => void rollbackArchiveImport(operationId).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}
          />
        </section>
        <input
          id="import-file"
          type="file"
          accept=".ottx,.ottx.json,application/vnd.open-tabletop.ottx-stream,application/json"
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
              <button className="ghost-button" type="button" disabled={isImportingArchive || archiveTransferBusy} onClick={() => retryArchiveImport().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
        {!tableFocusMode && <div className="status" role="status" aria-live="polite" aria-atomic="true">{status}</div>}
        {!tableFocusMode && lastDndRulesUndo && (
          <button className="ghost-button small" type="button" onClick={() => void undoLastDndRulesMutation()}>
            <RotateCcw size={14} /> Undo last D&amp;D rules change
          </button>
        )}
      </aside>

      {tableFocusMode && <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</div>}

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">{workspaceEyebrow}</div>
            <h1>{workspaceHeading}</h1>
            <div className="session-pulse" data-connection-state={realtimeUiState} role="status" aria-live="polite" aria-atomic="true" aria-label={`Session connection: ${sessionPulseStatus}; ${onlineParticipantLabel}`}>
              <span aria-hidden="true" />
              {sessionPulseStatus} · {formatNumber(snapshot.presences.length)} online
            </div>
            {canManageScenes && selectedScene && workspaceMode !== "manage" && (
              <div className={selectedScene.active ? "scene-visibility-badge live" : "scene-visibility-badge draft"} role="status">
                {selectedScene.active ? <Eye size={13} aria-hidden="true" /> : <PencilLine size={13} aria-hidden="true" />}
                {selectedScene.active ? "Live to players" : "Draft preview"}
              </div>
            )}
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
            <div className="button-row prep-primary-actions" aria-label="Primary preparation actions">
              {hasPermission("combat.manage") && (
                <button className="ghost-button" type="button" onClick={planSystemEncounter}>
                  <Swords size={14} /> Encounters
                </button>
              )}
              <ScenePartyPlacementControl scene={selectedScene} partyActors={partyActors} tokens={snapshot.tokens} canCreateToken={hasPermission("token.create")} busy={campaignAction.operation?.kind === "pending"} onPlaceMissingParty={(placementAttemptId) => { if (!selectedScene) return; const current = snapshotRef.current; const targetScene = current.scenes.find((scene) => scene.id === selectedScene.id) ?? selectedScene; void campaignAction.runAction(`Place missing party on ${targetScene.name}`, () => runWorkspaceBoundAction((request) => placeMissingPartyTokens({ scene: targetScene, partyActors: current.actors.filter((actor) => !isAdversaryActor(actor, current.tokens)), tokens: current.tokens, placementAttemptId, createToken: (options) => createToken(options, request) }), ({ placed, sceneName }) => setStatus(placed === 0 ? `Every party actor already has a token on ${sceneName}` : `Placed ${placed} missing party ${placed === 1 ? "token" : "tokens"} on ${sceneName}`))); }} />
              {selectedScene && selectedScene.gridType !== "gridless" && hasPermission("scene.update") && (
                <button className={gridCalibrationOpen ? "ghost-button active" : "ghost-button"} type="button" aria-expanded={gridCalibrationOpen} onClick={() => { const next = !gridCalibrationOpen; setGridCalibrationOpen(next); setGridCalibrationPoints([]); if (next) { setFogBrushMode(null); setAnnotationTool(null); setAnnotationPanelOpen(false); } }}>
                  <Crosshair size={14} /> Calibrate grid
                </button>
              )}
            </div>
            {(hasPermission("scene.update") || hasPermission("scene.create")) && (
              <div className="button-row">
                {hasPermission("scene.update") && <input aria-label="Bulk scene folder" value={bulkSceneFolder} placeholder="Move visible to folder" onChange={(event) => setBulkSceneFolder(event.target.value)} />}
                {hasPermission("scene.update") && <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={() => moveVisibleScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Move visible scenes
                </button>}
                <button className="ghost-button" type="button" disabled={visibleScenes.length === 0} onClick={selectVisiblePrepScenes}>
                  Select visible scenes
                </button>
                <button className="ghost-button" type="button" disabled={selectedPrepScenes.length === 0} onClick={clearPrepSceneSelection}>
                  Clear selected scenes
                </button>
                {hasPermission("scene.update") && <button className="ghost-button" type="button" disabled={sceneEditDirty || selectedPrepScenes.length === 0} onClick={() => moveSelectedPrepScenesToFolder().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Move selected scenes
                </button>}
                {hasPermission("scene.create") && <button className="ghost-button" type="button" disabled={sceneEditDirty || sceneDuplicationBusy || selectedPrepScenes.length === 0} onClick={() => duplicateSelectedPrepScenes().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                  Duplicate selected scenes
                </button>}
              </div>
            )}
            {renderSceneDuplicationReview()}
          </div>
          {showSceneTabs && <div className="scene-tabs">
            {visibleScenes.map((scene, index) => {
              const backgroundAsset = snapshot.assets.find((asset) => asset.id === scene.backgroundAssetId && isUsableImageAsset(asset));
              const sceneSelected = canSelectPrepScenes && selectedPrepSceneIds.includes(scene.id);
              return (
                <Fragment key={scene.id}>
                  {canQuickCreateScene && index === quickCreateSceneIndex && (
                    <button className="icon-button scene-tab-add" type="button" aria-label={`Add draft scene before ${scene.name}`} title={`Add draft scene before ${scene.name}`} onClick={() => createScene({ insertBeforeScene: scene, active: false }).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
                        onChange={(event) => togglePrepSceneSelection(scene.id, event.target.checked)}
                      />
                    )}
                    <button className={scene.id === sceneId ? "scene-tab active" : "scene-tab"} onClick={() => selectScene(scene.id)} aria-pressed={scene.id === sceneId}>
                      <span className="scene-tab-thumb">{backgroundAsset ? <img src={assetThumbnailUrl(backgroundAsset)} alt="" /> : scene.active ? <Eye size={14} /> : <FileText size={14} />}</span>
                      <span>{scene.name}</span>
                      {scene.folder && <small>{scene.folder}</small>}
                    </button>
                    {canQuickDeleteScenes && (
                      <button className="icon-button scene-tab-delete" type="button" aria-label={`Review deletion for scene ${scene.name}`} title={`Review deletion for ${scene.name}`} onClick={() => openSceneDeleteReview(scene)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </Fragment>
              );
            })}
            {canQuickCreateScene && showTrailingSceneCreateButton && (
              <button className="icon-button scene-tab-add" type="button" aria-label="Add draft scene after newest scene" title="Add draft scene after newest scene" onClick={() => createScene({ active: false }).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <Plus size={16} />
              </button>
            )}
            {visibleScenes.length === 0 && accessibleScenes.length === 0 && canQuickCreateScene && (
              <button className="icon-button scene-tab-add" type="button" aria-label="Add draft scene" title="Add draft scene" onClick={() => createScene({ active: false }).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                <Plus size={16} />
              </button>
            )}
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

        {liveCampaignSession && workspaceMode !== "manage" && (
          <LiveSessionBanner
            session={liveCampaignSession}
            sceneName={activeScene?.name}
            canComplete={hasPermission("campaign.update")}
            onOpen={() => { setWorkspaceMode("prep"); setTab("sessions"); }}
            onComplete={() => completeLiveCampaignSession(liveCampaignSession).catch((error) => setStatus(`Session completion failed: ${errorMessage(error)}`))}
          />
        )}

        {showTableWorkspace ? (
        <div className={`table-grid workspace-${workspaceMode}`}>
          <section className={`table-area ${canvasAssetDragging ? "canvas-asset-dragging" : ""}`}>
            <Toolbar key={`${workspaceMode}-${tab}`} onSelectTool={selectCanvasTool} onCreateToken={async () => { await createToken(); }} onStartCombat={openCombatSetup} onRevealFog={revealFog} onHideFog={hideFog} onRevealFogPolygon={revealFogPolygon} onToggleFogBrush={toggleFogBrush} onToggleAnnotationTool={toggleAnnotationTool} onDeleteLatestAnnotation={deleteLatestAnnotation} onUndoScene={undoSceneEdit} onUndoFog={undoFog} onShowFogHistory={showFogHistory} onSampleVisionPoint={sampleVisionPoint} onSaveFogPreset={saveFogPreset} onApplyFogPreset={applyFogPreset} onDeleteFogPreset={deleteFogPreset} onCyclePlayerVisionPreview={cyclePlayerVisionPreview} onAddWall={addWall} onAddTerrainWall={addTerrainWall} onAddDoor={addDoor} onAddWindow={addWindow} onAddLight={addLight} onAddDarkness={addDarkness} onActionError={(error) => setStatus(error instanceof Error ? error.message : String(error))} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} canPreviewPlayerVision={hasPermission("scene.update") && snapshot.members.some((member) => member.role === "player" && member.active !== false && member.user.id !== currentUserId)} playerVisionPreviewLabel={playerVisionPreviewMember?.user.displayName} activeFogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} activeAnnotationTool={annotationTool} hasFogPresets={snapshot.fogPresets.length > 0} canUpdateScene={hasPermission("scene.update")} canAnnotate={hasPermission("scene.read")} />
            <div className="map-play-surface">
              {selectedScene ? <SceneCanvas scene={selectedScene} zoom={battleMapZoom} backgroundAsset={selectedMapAsset} selectedAssetId={selectedBoardAssetId} assets={snapshot.assets} tokens={snapshot.tokens} actors={snapshot.actors} boardCurrentUserId={currentUserId} canSeeAllVitals={hasPermission("combat.manage")} currentTurnTokenIds={currentTurnTokenIds} nextTurnTokenIds={nextTurnTokenIds} vision={snapshot.vision} visionPreviewLabel={playerVisionPreviewMember?.user.displayName} selectedTokenId={selectedTokenId} selectedTokenIds={selectedTokenIds} activeTokenLayer={activeTokenLayer} fogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} annotationTool={annotationTool} calibrationPoints={gridCalibrationOpen && selectedScene.gridType !== "gridless" ? gridCalibrationPoints : undefined} onCalibrationPoint={gridCalibrationOpen && selectedScene.gridType !== "gridless" ? (point) => setGridCalibrationPoints((current) => appendGridCalibrationPoint(current, point)) : undefined} templateShape={templateShape} visibleAnnotationLayers={visibleAnnotationLayers} canDropToken={hasPermission("token.create")} canMoveToken={hasPermission("token.move")} canUpdateAnnotations={hasPermission("scene.update")} canResizeToken={hasPermission("token.update")} canUpdateTokenLayer={hasPermission("token.update")} onSelect={selectCanvasToken} onSelectMany={selectCanvasTokens} onSelectBackgroundAsset={selectBoardBackgroundAsset} onClearSelection={clearTokenSelection} onMoved={async () => undefined} onTokenMovePersist={persistSceneCanvasTokenMove} onTokenResizePersist={persistSceneCanvasTokenResize} onTokenMoveCommit={recordTokenMoveAction} onTokenResizeCommit={recordTokenResizeAction} onTokenLayerCycle={cycleTokenLayer} onTokenDrop={createTokenFromDrop} onFogStroke={paintFogStroke} onAnnotationCreate={createSceneAnnotation} onAnnotationMove={moveSceneAnnotation} onTogglePortal={toggleScenePortal} selectedOverlay={selectedOverlay} onSelectOverlay={setSelectedOverlay} onZoomBy={zoomBattleMap} /> : (
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
            {gridCalibrationOpen && selectedScene && selectedScene.gridType !== "gridless" && (
              <GridCalibrationPanel
                scene={selectedScene}
                points={gridCalibrationPoints}
                onPointsChange={setGridCalibrationPoints}
                onApply={applySceneGridCalibration}
                onClose={() => { setGridCalibrationOpen(false); setGridCalibrationPoints([]); }}
              />
            )}
            <div className="map-layer-dock" aria-label="Map controls and layers" data-collapsed={mapDockOpen ? undefined : "true"}>
              <MapZoomControls zoom={battleMapZoom} onZoomOut={() => zoomBattleMap(-battleMapZoomStep)} onZoomIn={() => zoomBattleMap(battleMapZoomStep)} onReset={resetBattleMapZoom} />
              <button
                ref={tableFocusToggleRef}
                className="ghost-button workspace-focus-toggle"
                type="button"
                aria-label={tableFocusMode ? "Exit map focus mode" : "Enter map focus mode"}
                aria-pressed={tableFocusMode}
                title={`${tableFocusMode ? "Show navigation and inspector" : "Hide navigation and inspector"} (F)`}
                onClick={toggleTableFocusMode}
              >
                {tableFocusMode ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
                <span>{tableFocusMode ? "Show panels" : "Focus map"}</span>
                <kbd aria-hidden="true">F</kbd>
              </button>
              {selectedTokens.length > 1 && <MapSelectionStatus selectedCount={selectedTokens.length} onClear={clearTokenSelection} />}
              <button className="ghost-button map-layer-dock-toggle" type="button" aria-expanded={mapDockOpen} aria-label={mapDockOpen ? "Collapse layer panel" : "Expand layer panel"} onClick={toggleMapDock}>
                <Layers size={15} />
                <span>Layers</span>
                {mapDockOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              </button>
              {mapDockOpen && <MapLayerStack scene={selectedScene} tokens={snapshot.tokens} activeTokenLayer={activeTokenLayer} fogActive={Boolean(snapshot.vision?.sceneId === selectedScene?.id && snapshot.vision?.fogActive)} visibleAnnotationLayers={visibleAnnotationLayers} onSelectTokenLayer={selectTokenLayer} onToggleAnnotationLayer={setAnnotationLayerVisible} />}
              {mapDockOpen && selectedScene && <TacticalMapAids key={`tactical:${selectedScene.id}`} scene={selectedScene} tokens={snapshot.tokens} canManage={hasPermission("scene.update")} canMoveTokens={hasPermission("token.move")} combat={activeCombat} onSceneChange={applySceneToSnapshot} onTokenChange={(token) => applyTokensToSnapshot([token])} onStatus={setStatus} />}
            </div>
            {hasPermission("token.reveal") && (fogBrushMode || toolReport) && (
              <section className="table-tool-panel movable-panel" aria-label="Fog and vision tools" style={fogToolPanel.style} {...fogToolPanel.panelProps}>
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
            <section className="table-tool-panel annotation-panel movable-panel" aria-label="Annotation layers and history" style={annotationToolPanel.style} {...annotationToolPanel.panelProps}>
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
              {selectedScene?.gridType !== "gridless" ? <label className="inline-check">
                <input type="checkbox" checked={annotationSnapToGrid} onChange={(event) => setAnnotationSnapToGrid(event.target.checked)} />
                <span>Snap templates to grid</span>
              </label> : <p className="account-summary">Gridless scene: template snapping and distance automation are off.</p>}
              </div>
              {hasUnmodeledMixedDamageType(templateDamageType) && <p className="admin-status" role="alert">Area templates automate one damage type. Add this template, roll the total, then use Reviewed typed damage for each mixed component.</p>}
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
                {latestAreaTemplateHasMixedDamage && <p className="admin-status" role="alert">This template has an unmodeled mixed-damage rider. Rolling is available, but automatic apply is blocked so components are not flattened; use Reviewed typed damage.</p>}
                {latestAreaTemplate ? (
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={() => setTokenTargets(latestAreaTemplate.affectedTokenIds ?? [], true)}>
                      Target affected
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula} onClick={() => rollTemplateDamage(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Roll damage
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula || latestAreaTemplateHasMixedDamage || (latestAreaTemplate.affectedTokenIds?.length ?? 0) === 0 || (!hasPermission("actor.update") && !hasPermission("token.update"))} onClick={() => applyTemplateDamage(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
                      Apply damage
                    </button>
                    <button className="ghost-button" type="button" disabled={!latestAreaTemplate.templateDamageFormula || latestAreaTemplateHasMixedDamage || !latestAreaTemplate.templateSaveDc || !latestAreaTemplate.templateSaveAbility || latestAreaTemplate.templateSaveAbility === "none" || (latestAreaTemplate.affectedTokenIds?.length ?? 0) === 0 || (!hasPermission("actor.update") && !hasPermission("token.update"))} onClick={() => resolveTemplateSaves(latestAreaTemplate).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
                            const imageUrl = assetThumbnailUrl(asset);
                            event.currentTarget.closest(".table-area")?.classList.add("canvas-asset-dragging");
                            setCanvasAssetDragging(true);
                            tokenDropHandledRef.current = false;
                            writeTokenDropData(event.dataTransfer, { type: "asset", id: asset.id, imageAssetId: asset.id, name: asset.name, layer: "map", disposition: "neutral" });
                            setTokenDropPreview(event.dataTransfer, asset.name, imageUrl);
                          }}
                          onDragEnd={(event) => {
                            event.currentTarget.closest(".table-area")?.classList.remove("canvas-asset-dragging");
                            setCanvasAssetDragging(false);
                            void campaignAction.runAction(`Place ${asset.name}`, () => createTokenFromAssetDragEnd(asset, event.clientX, event.clientY));
                          }}
                        >
                          <img src={assetThumbnailUrl(asset)} alt="" />
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
                  <button className="ghost-button" type="button" disabled={!selectedCanvasAsset || !selectedScene || !hasPermission("token.create")} onClick={() => selectedCanvasAsset && void campaignAction.runAction(`Place ${selectedCanvasAsset.name}`, () => placeCanvasAssetTokens(selectedCanvasAsset, canvasAssetPlacementCount))}>
                    <MapPin size={16} /> Place selected canvas asset
                  </button>
                  <button className="ghost-button" type="button" disabled={!selectedCanvasAsset || !selectedScene || !hasPermission("scene.update")} onClick={() => selectedCanvasAsset && void campaignAction.runAction(`Set ${selectedCanvasAsset.name} as the scene background`, () => setSceneBackgroundFromAsset(selectedCanvasAsset))}>
                    <Eye size={16} /> Set selected canvas background
                  </button>
                </div>
              </details>
            </section>
            )}
          </section>

          <aside className="inspector">
            <div className="tabs inspector-tabs" role="tablist" aria-label="Inspector panels">
              {inspectorTabs.includes("actors") && <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" tabId="inspector-tab-actors" panelId="inspector-panel-actors" onClick={() => setTab("actors")} />}
              {inspectorTabs.includes("compendium") && <TabButton active={tab === "compendium"} icon={<BookOpen size={15} />} label="Compendium" tabId="inspector-tab-compendium" panelId="inspector-panel-compendium" onClick={() => setTab("compendium")} />}
              {inspectorTabs.includes("sessions") && <TabButton active={tab === "sessions"} icon={<Timer size={15} />} label="Sessions" tabId="inspector-tab-sessions" panelId="inspector-panel-sessions" onClick={() => setTab("sessions")} />}
              {inspectorTabs.includes("worlds") && <TabButton active={tab === "worlds"} icon={<Globe2 size={15} />} label="Worlds" tabId="inspector-tab-worlds" panelId="inspector-panel-worlds" onClick={() => setTab("worlds")} />}
              {inspectorTabs.includes("handouts") && <TabButton active={tab === "handouts"} icon={<BookOpen size={15} />} label="Handouts" tabId="inspector-tab-handouts" panelId="inspector-panel-handouts" onClick={() => setTab("handouts")} />}
              {inspectorTabs.includes("journal") && <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" tabId="inspector-tab-journal" panelId="inspector-panel-journal" onClick={() => setTab("journal")} />}
              {inspectorTabs.includes("memory") && <TabButton active={tab === "memory"} icon={<Brain size={15} />} label="Canon" tabId="inspector-tab-memory" panelId="inspector-panel-memory" onClick={() => setTab("memory")} />}
              {inspectorTabs.includes("search") && <TabButton active={tab === "search"} icon={<Search size={15} />} label="Search" tabId="inspector-tab-search" panelId="inspector-panel-search" onClick={() => setTab("search")} />}
              {inspectorTabs.includes("chat") && <TabButton active={tab === "chat"} icon={<MessageSquare size={15} />} label={chatUnreadCount > 0 ? `Chat (${formatNumber(chatUnreadCount)})` : "Chat"} tabId="inspector-tab-chat" panelId="inspector-panel-chat" onClick={() => { setTab("chat"); setChatUnreadCount(0); }} />}
              {inspectorTabs.includes("combat") && <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" tabId="inspector-tab-combat" panelId="inspector-panel-combat" onClick={() => setTab("combat")} />}
              {inspectorTabs.includes("content") && <TabButton active={tab === "content"} icon={<Upload size={15} />} label="Assets" tabId="inspector-tab-content" panelId="inspector-panel-content" onClick={() => setTab("content")} />}
              {inspectorTabs.includes("plugins") && <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="Plugins" tabId="inspector-tab-plugins" panelId="inspector-panel-plugins" onClick={() => setTab("plugins")} />}
            </div>
            <div className="inspector-panel-content" role="tabpanel" id={`inspector-panel-${tab}`} aria-labelledby={`inspector-tab-${tab}`}>
            <DeferredPanel label={`${tab} panel`}>
            {tab === "actors" && <ActorPanel key={`actor-panel:${campaignId}:${selectedActor?.id ?? "none"}:${selectedScene?.id ?? "none"}:${activeCombat?.id ?? "none"}`} campaignId={campaignId} actor={selectedActor} token={selectedToken} systemLabel={snapshot.systems.find((system) => system.id === selectedActor?.systemId)?.name ?? selectedActor?.systemId} scene={selectedScene} currentUserId={currentUserId} actors={snapshot.actors} tokens={snapshot.tokens} combat={activeCombat} members={snapshot.members} assets={snapshot.assets} items={snapshot.items} focusItemId={campaignSearchFocus?.type === "item" ? campaignSearchFocus.target.id : undefined} compendiumEntries={compendiumEntries} compendiumSearch={compendiumSearch} setCompendiumSearch={setCompendiumSearch} compendiumStatus={compendiumStatus} updateActorHp={updateActorHp} adjustActorHp={adjustActorHp} awardActorXp={awardActorXp} xpProgress={xpProgress} advancementReady={Boolean(canUpdateSelectedActor && ((xpProgress?.readyToLevel && advancementOptions.length > 0) || advancementLoadError))} onLevelUp={() => setAdvancementModalOpen(true)} onPreviewRestActor={previewSelectedActorRest} onRestActor={restSelectedActor} onTypedDamageApplied={applyTypedDamageResult} updateActorData={updateActorData} toggleActorCondition={toggleActorCondition} updateItemData={updateItemData} changeActorAttunement={changeActorAttunement} assignItemToActor={assignItemToActor} onSpellPreparationApplied={(result) => { const returnedItems = new Map(result.items.map((item) => [item.id, item])); setSnapshot((current) => ({ ...current, actors: current.actors.map((actor) => actor.id === result.actor.id ? result.actor : actor), items: current.items.map((item) => returnedItems.get(item.id) ?? item) })); }} updateToken={updateSelectedToken} onUploadTokenImage={uploadSelectedTokenImage} targetToken={setTokenTarget} targetTokens={setTokenTargets} deleteToken={deleteSelectedToken} deleteActor={deleteActor} updateTokenVision={updateSelectedTokenVision} useActorAction={useActorAction} onImportCompendiumEntry={importCompendiumEntry} onPurchaseCompendiumEntry={purchaseCompendiumEntry} onPlaceActor={placeActorOnSelectedScene} canCreateToken={hasPermission("token.create")} canUpdateActor={canUpdateSelectedActor} canAwardActorXp={hasPermission("actor.update")} canRestActor={canUpdateSelectedActor} canUpdateToken={hasPermission("token.update")} canDeleteToken={hasPermission("token.delete")} canDeleteActor={!blankCanvasDemoOpen && hasPermission("actor.delete")} canUseAction={canUpdateSelectedActor && hasPermission("dice.roll")} />}
            {tab === "compendium" && (
              <>
                <LazyCompendiumPanel
                key={`compendium:${campaignId}:${currentUserId}`}
                campaignId={campaignId}
                systems={snapshot.systems}
                actors={snapshot.actors}
                items={snapshot.items}
                initialSystemId={campaignSearchFocus?.type === "compendium" ? campaignSearchFocus.target.systemId : selectedActor?.systemId ?? selectedCampaign?.defaultSystemId}
                initialSearch={campaignSearchFocus?.type === "compendium" ? campaignSearchFocus.title : undefined}
                initialEntryId={campaignSearchFocus?.type === "compendium" ? campaignSearchFocus.target.id : undefined}
                canUpdateActor={(actor) => hasPermission("actor.update") || (actor.ownerUserId === currentUserId && hasPermission("actor.updateOwned"))}
                onMutation={({ actor, item }) => {
                  setSnapshot((current) => ({
                    ...current,
                    actors: current.actors.map((candidate) => candidate.id === actor.id ? actor : candidate),
                    items: item
                      ? current.items.some((candidate) => candidate.id === item.id)
                        ? current.items.map((candidate) => candidate.id === item.id ? item : candidate)
                        : [...current.items, item]
                      : current.items
                  }));
                }}
                onStatus={setStatus}
                />
                {snapshot.systems.some((system) => system.id === "dnd-5e-srd") && (
                  <>
                    <LazyDndCharacterReviewPanel
                      key={`character-review:${campaignId}:${currentUserId}`}
                      campaignId={campaignId}
                      currentUserId={currentUserId}
                      canManage={hasPermission("campaign.update")}
                      canSubmit={(actor) => hasPermission("actor.update") || (actor.ownerUserId === currentUserId && hasPermission("actor.updateOwned"))}
                      onChanged={() => { void refresh(campaignId, sceneId, { syncStatus: false }); }}
                      onStatus={setStatus}
                    />
                    <LazyControlledCreaturesPanel
                      key={`controlled-creatures:${campaignId}:${currentUserId}`}
                      campaignId={campaignId}
                      currentUserId={currentUserId}
                      actors={snapshot.actors}
                      items={snapshot.items}
                      scenes={accessibleScenes}
                      combats={snapshot.combats}
                      canPrepare={hasPermission("actor.create") || hasPermission("actor.update") || hasPermission("actor.updateOwned")} handoff={controlledCreatureHandoff} onHandoffConsumed={() => setControlledCreatureHandoff(undefined)}
                      onChanged={() => { void refresh(campaignId, sceneId, { syncStatus: false }); }}
                      onStatus={setStatus}
                    />
                  </>
                )}
                {selectedCampaign && hasPermission("campaign.update") && (
                  <LazyDndCustomContentPanel
                    key={`dnd-custom-content:${campaignId}:${currentUserId}`}
                    campaignId={campaignId}
                    campaignUpdatedAt={selectedCampaign.updatedAt}
                    onMutation={({ item, deletedItemId, campaignUpdatedAt }) => {
                      setSnapshot((current) => ({
                        ...current,
                        campaigns: campaignUpdatedAt
                          ? current.campaigns.map((campaign) => campaign.id === campaignId ? { ...campaign, updatedAt: campaignUpdatedAt } : campaign)
                          : current.campaigns,
                        items: deletedItemId
                          ? current.items.filter((candidate) => candidate.id !== deletedItemId)
                          : item
                            ? current.items.some((candidate) => candidate.id === item.id)
                              ? current.items.map((candidate) => candidate.id === item.id ? item : candidate)
                              : [...current.items, item]
                            : current.items
                      }));
                    }}
                    onStatus={setStatus}
                  />
                )}
                {hasPermission("campaign.update") && (
                  <LazyCompatibilityPanel key={`compatibility:${campaignId}:${currentUserId}`} campaignId={campaignId} />
                )}
              </>
            )}
            {tab === "sessions" && <SessionDeskPanel key={`sessions:${campaignId}:${currentUserId}`} campaignId={campaignId} sessions={campaignSessions} scenes={accessibleScenes} encounters={snapshot.encounters} canManage={hasPermission("campaign.update")} canStart={hasPermission("scene.activate")} canCreateReport={sessionReportAllowed(hasPermission)} onSessionsChange={(sessions) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) updateCampaignSessions(sessions); }} onSceneActivated={(nextSceneId) => { if (!workspaceRequestIsCurrent(campaignId, currentUserId)) return; realtimeSelectionRef.current = { ...realtimeSelectionRef.current, sceneId: nextSceneId }; invalidateInFlightRefreshes(); setSnapshot((current) => ({ ...current, scenes: applyActiveSceneIdentity(current.scenes, campaignId, nextSceneId) })); setSceneId(nextSceneId); void refresh(campaignId, nextSceneId, { syncStatus: false }); }} onJournalCreated={applyJournalToSnapshot} onStatus={(message) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setStatus(message); }} />}
            {tab === "worlds" && <WorldAtlasPanel key={`worlds:${campaignId}:${currentUserId}`} campaignId={campaignId} campaignUpdatedAt={selectedCampaign?.updatedAt ?? ""} worlds={worlds} worldRecords={snapshot.worldRecords} worldRelations={snapshot.worldRelations} scenes={accessibleScenes} selectedWorldId={selectedWorldId} canCreate={hasPermission("world.create")} canUpdateWorld={hasPermission("world.update")} canAssignScenes={hasPermission("scene.update")} canDelete={hasPermission("world.delete")} loadState={worldsLoadState} loadError={worldsLoadError} onRetryLoad={() => setLoreReloadVersion((version) => version + 1)} onWorldsChange={(nextWorlds) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setWorlds(nextWorlds); }} onWorldRecordsChange={(worldRecords) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setSnapshot((current) => ({ ...current, worldRecords })); }} onWorldRelationsChange={(worldRelations) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setSnapshot((current) => ({ ...current, worldRelations })); }} onSelectWorld={(worldId) => { setSelectedWorldId(worldId); const nextScene = accessibleScenes.find((scene) => worldFilterMatchesScene(scene, worldId)); setSceneId(nextScene?.id ?? ""); }} onSceneUpdated={applySceneToSnapshot} onRefreshSharedState={async () => { await refresh(campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }); if (workspaceRequestIsCurrent(campaignId, currentUserId)) setLoreReloadVersion((version) => version + 1); }} onStatus={(message) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setStatus(message); }} />}
            {tab === "handouts" && <HandoutLibraryPanel key={`handouts:${campaignId}:${currentUserId}`} campaignId={campaignId} campaignUpdatedAt={selectedCampaign?.updatedAt ?? ""} currentUserId={currentUserId} handouts={handouts} worlds={worlds} members={snapshot.members} actors={partyActors} assets={snapshot.assets} canCreate={hasPermission("handout.create")} canUpdate={hasPermission("handout.update")} canDelete={hasPermission("handout.delete")} loadState={handoutsLoadState} loadError={handoutsLoadError} onRetryLoad={() => setLoreReloadVersion((version) => version + 1)} onHandoutsChange={(update) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setHandouts(update); }} onRefreshSharedState={async () => { await refresh(campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }); if (workspaceRequestIsCurrent(campaignId, currentUserId)) setLoreReloadVersion((version) => version + 1); }} onStatus={(message) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setStatus(message); }} />}
            {tab === "journal" && (
              <JournalPanel
                key={`journal:${campaignId}:${currentUserId}`}
                campaignId={campaignId}
                currentUserId={currentUserId}
                journals={snapshot.journals}
                members={snapshot.members}
                actors={partyActors}
                sessions={campaignSessions}
                linkTargets={journalLinkTargets}
                onCreate={createJournal}
                onUpdate={updateJournal}
                onDelete={deleteJournal}
                onGenerateRecap={generateSessionRecap}
                onCanonReview={reviewJournalCanon}
                canCreate={hasPermission("journal.create")}
                canUpdate={hasPermission("journal.update")}
                canDelete={hasPermission("journal.delete")}
                canReadHistory={hasPermission("journal.readSecret")}
                canCanonReview={hasPermission("campaign.update")}
              />
            )}
            {tab === "memory" && <LazyCampaignMemoryPanel key={`memory:${campaignId}:${currentUserId}`} campaignId={campaignId} campaignUpdatedAt={selectedCampaign?.updatedAt ?? ""} facts={snapshot.memory as AiMemoryFact[]} canCreate={hasPermission("ai.proposeChanges")} canReview={hasPermission("ai.applyChanges")} onFactsChange={(memory) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setSnapshot((current) => ({ ...current, memory })); }} onExtract={extractMemory} onStatus={(message) => { if (workspaceRequestIsCurrent(campaignId, currentUserId)) setStatus(message); }} />}
            {tab === "search" && <CampaignSearchPanel key={`search:${campaignId}:${currentUserId}`} campaignId={campaignId} worlds={worlds} revision={snapshot.eventSequence} storageKey={`otte:campaign-search:${campaignId}:${currentUserId}`} onOpenResult={openCampaignSearchResult} />}
            {tab === "chat" && <ChatRail campaignId={campaignId} currentUserId={currentUserId} command={chatBody} setCommand={setChatBody} replyTarget={chatReplyTarget} messages={snapshot.chat} rolls={snapshot.rolls} concealedRollIds={concealedRollIds} members={snapshot.members} presences={snapshot.presences} scenes={snapshot.scenes} diceFormula={diceFormula} setDiceFormula={setDiceFormula} diceVisibility={diceVisibility} setDiceVisibility={setDiceVisibility} savedDiceFormulas={savedDiceFormulas} diceMacros={snapshot.diceMacros} onRollDice={rollDice} onSaveDiceFormula={saveCurrentDiceFormula} onSubmitCommand={submitChatCommand} onReplyToMessage={(message) => setChatReplyToMessageId(message.id)} onEditMessage={editChatMessage} onDeleteMessage={deleteChatMessage} onModerateMessage={moderateChatMessage} onClearReply={() => setChatReplyToMessageId("")} canModerate={hasPermission("chat.moderate")} canRollDice={hasPermission("dice.roll")} dice3dEnabled={dice3dEnabled} onToggleDice3d={() => persistQuickPreferences({ dice3dEnabled: !dice3dEnabled }, dice3dEnabled ? "Use text-only dice" : "Enable 3D dice")} notificationPreference={resolvedUserPreferences(snapshot.session?.user ?? {}).chatNotifications} connectionState={realtimeUiState} />}
            {tab === "combat" && <CombatPanel campaignId={campaignId} combat={activeCombat} recentCombats={recentEndedCombats} auditLogs={snapshot.combatAudit} actors={snapshot.actors} tokens={selectedSceneTokens} onFocusCombatant={(combatant) => selectSingleToken(combatant.tokenId)} onStart={openCombatSetup} onPlanEncounter={planSystemEncounter} onNext={(combat) => advanceCombatTurn(combat, 1)} onPrevious={(combat) => advanceCombatTurn(combat, -1)} onEnd={endCombat} onAwardPartyXp={awardPartyXp} onAwardPartyGold={awardPartyGold} onRecordLoot={recordCombatLoot} canAwardRewards={hasPermission("combat.manage") && hasPermission("actor.update")} onUpdateCombatant={updateCombatant} onConfirmAction={confirmCombatAction} onRejectAction={rejectCombatAction} onCombatUpdated={(combat) => setSnapshot((current) => ({ ...current, combats: current.combats.map((candidate) => candidate.id === combat.id ? combat : candidate) }))} onRefresh={async () => { await refresh(campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }); }} onStatus={setStatus} onRulesMutationApplied={setLastDndRulesUndo} onTypedDamageApplied={applyTypedDamageResult} onAdjustVitals={adjustCombatVitals} onAddCombatant={addCombatantToActiveCombat} onRemoveCombatant={removeCombatantFromActiveCombat} onSpendLegendaryAction={spendLegendaryAction} canManage={hasPermission("combat.manage")} canManageEffects={hasPermission("combat.manage") && hasPermission("actor.update")} canPreviewEffects={hasPermission("actor.readPrivate")} canAdjustVitals={hasPermission("combat.manage") && hasPermission("actor.update")} vitalsDisabledReason={hasPermission("combat.manage") ? "Requires actor.update permission" : "Requires combat.manage permission"} canManageRoster={hasPermission("combat.manage")} rosterDisabledReason="Requires combat.manage permission" canManageLegendaryActions={hasPermission("combat.manage") && hasPermission("actor.update")} legendaryActionsDisabledReason={hasPermission("combat.manage") ? "Requires actor.update permission" : "Requires combat.manage permission"} />}
            {tab === "content" && <LazyContentImportPanel assets={snapshot.assets} assetStorage={snapshot.assetStorage} selectedScene={selectedScene} assetSearch={assetSearch} setAssetSearch={setAssetSearch} assetFolder={assetFolder} setAssetFolder={setAssetFolder} assetTags={assetTags} setAssetTags={setAssetTags} assetStatus={assetStatus} failedAssetUpload={failedAssetUpload} onRetryFailedAssetUpload={retryAssetUpload} onDismissFailedAssetUpload={dismissFailedAssetUpload} lifecycleReason={assetLifecycleReason} setLifecycleReason={setAssetLifecycleReason} onUploadAsset={uploadAssetToLibrary} onSetSceneBackground={setSceneBackgroundFromAsset} onPlaceAssetToken={createTokenFromAsset} onUpdateAssetMetadata={updateAssetMetadata} onUpdateAssetLifecycle={updateAssetLifecycle} onCreateAssetDeliveryUrl={createAssetDeliveryUrl} imports={snapshot.contentImports} kind={contentImportKind} setKind={setContentImportKind} name={contentImportName} setName={setContentImportName} body={contentImportBody} setBody={setContentImportBody} status={contentImportStatus} onPreview={previewContentImport} onAnalyzePdf={analyzePdfContentImport} onApply={applyContentImport} onRollback={rollbackContentImport} onDelete={deleteContentImport} canManage={hasPermission("campaign.update")} canProposeAiChanges={hasPermission("ai.proposeChanges")} canCreateAsset={hasPermission("scene.create")} canUpdateScene={hasPermission("scene.update")} canCreateToken={hasPermission("token.create")} />}
            {tab === "plugins" && <LazySdkPanel plugins={snapshot.plugins} systems={snapshot.systems} characterTemplates={snapshot.characterTemplates} actor={selectedActor} advancementOptions={advancementOptions} advancementGrantsFeat={advancementGrantsFeat} advancementFeats={advancementFeats} multiclassOptions={multiclassOptions} advancementClassName={advancementClassName} nextClassLevel={advancementNextClassLevel} requiresSubclass={advancementRequiresSubclass} subclassOptions={advancementSubclassOptions} weaponMastery={advancementWeaponMastery} spellAdvancementPaths={spellAdvancementPaths} pendingAdvancement={pendingAdvancement} importedActor={importedActor} createdMonster={createdMonster} onSyncPluginRegistries={syncPluginRegistries} onInstallPlugin={installPlugin} onInstallSystem={installSystem} onCreateCharacter={createCharacterFromTemplate} onOpenCharacterCreator={() => void openCharacterCreator()} onImportCharacter={() => setCharacterImportOpen(true)} onCreateMonster={createSystemMonster} onPreviewActor={previewSelectedActorAdvancement} onAdvanceActor={advanceSelectedActor} onCancelPendingAdvancement={cancelSelectedActorPendingAdvancement} onPreviewRestActor={previewSelectedActorRest} onRestActor={restSelectedActor} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={Boolean(snapshot.session?.serverAdmin) && hasPermission("plugin.install")} canInstallSystem={hasPermission("campaign.update")} canCreateActor={hasPermission("actor.create")} canImportActor={hasPermission("actor.create")} canAdvanceActor={canUpdateSelectedActor} canRestActor={canUpdateSelectedActor} canRollSystem={hasPermission("dice.roll")} />}
            </DeferredPanel>
            </div>
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
          campaignId={campaignId}
          localDemo={blankCanvasDemoOpen}
          promptRef={aiAgentPromptRef}
          messages={aiAgentMessages}
          prompt={aiAgentPrompt}
          status={aiAgentStatus}
          busy={aiAgentBusy}
          codexAuth={aiAgentCodexAuth}
          referenceAsset={selectedAiAgentReferenceAsset}
          referenceUploadStatus={aiAgentReferenceUploadStatus}
          proposals={snapshot.proposals}
          hiddenProposalIds={aiAgentHiddenProposalIds}
          canApply={hasPermission("ai.applyChanges")}
          approvalMode={aiAgentApprovalMode}
          onApprovalModeChange={setAiAgentApprovalMode}
          onPromptChange={setAiAgentPrompt}
          onSend={() => sendAiAgentMessage().catch((error) => setAiAgentStatus(errorMessage(error)))}
          onNewChat={startNewAiAgentChat}
          onStop={stopAiAgentTurn}
          onUploadReference={uploadAiAgentReferenceAsset}
          onClearReference={clearAiAgentReferenceAsset}
          onStartCodexAuth={startAiAgentCodexAuth}
          onClose={closeAiAgent}
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
          key={`encounter-builder:${selectedCampaign.id}:${currentUserId}:${encounterBuilderSystem.id}`}
          campaignId={selectedCampaign.id}
          campaignUpdatedAt={selectedCampaign.updatedAt}
          systemId={encounterBuilderSystem.id}
          systemName={encounterBuilderSystem.name}
          partyActors={partyActors}
          sceneTokens={selectedSceneTokens}
          savedEncounters={snapshot.encounters}
          initialEncounterId={campaignSearchFocus?.type === "encounter" ? campaignSearchFocus.target.id : undefined}
          activeScene={selectedScene}
          canSave={hasPermission("combat.manage")}
          canSpawn={Boolean(selectedScene && hasPermission("token.create") && hasPermission("actor.create"))}
          canLaunch={Boolean(selectedScene && !activeCombat && hasPermission("token.create") && hasPermission("actor.create") && hasPermission("combat.manage"))}
          onClose={() => setEncounterBuilderOpen(false)}
          onPlan={setEncounterPlan}
          onEncounterSaved={applyEncounterToSnapshot}
          onEncounterDeleted={removeEncounterFromSnapshot}
          onRefreshSharedState={async () => { await refresh(selectedCampaign.id, realtimeSelectionRef.current.sceneId, { syncStatus: false }); }}
          onSpawnThreats={spawnEncounterThreatTokens}
          onPlacePartyActor={(actor) => placeActorOnSelectedScene(actor, globalThis.crypto.randomUUID())}
          onLaunchThreats={launchEncounterThreatTokens}
          onStatus={(message) => {
            if (realtimeSelectionRef.current.campaignId === selectedCampaign.id) setStatus(message);
          }}
        />
      )}
      {commandPaletteOpen && <CommandPalette commands={paletteCommands} onRun={runPaletteCommand} onClose={() => setCommandPaletteOpen(false)} />}
      {advancementModalOpen && selectedActor && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAdvancementModalOpen(false);
        }}>
          <div ref={advancementModalRef} className="modal-dialog advancement-modal" role="dialog" aria-modal="true" aria-label="Level up actor" tabIndex={-1}>
            <div className="operator-heading">
              <div>
                <div className="section-title">Advancement</div>
                <h2>{selectedActor.name}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close level up" onClick={() => setAdvancementModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <DeferredPanel label="advancement choices">
            <LazyAdvancementFlow
              actor={selectedActor}
              advancementOptions={advancementOptions}
              advancementGrantsFeat={advancementGrantsFeat}
              advancementFeats={advancementFeats}
              multiclassOptions={multiclassOptions}
              advancementClassName={advancementClassName}
              nextClassLevel={advancementNextClassLevel}
              requiresSubclass={advancementRequiresSubclass}
              subclassOptions={advancementSubclassOptions}
              weaponMastery={advancementWeaponMastery}
              spellAdvancementPaths={spellAdvancementPaths}
              pendingAdvancement={pendingAdvancement}
              loadState={advancementLoadState}
              loadError={advancementLoadError}
              onRetryLoad={advancementCatalog.retry}
              onRefreshActor={async () => { await refresh(campaignId, realtimeSelectionRef.current.sceneId, { syncStatus: false }); }}
              onPreviewActor={previewSelectedActorAdvancement}
              onCancelPendingAdvancement={cancelSelectedActorPendingAdvancement}
              onAdvanceActor={async (optionId, choices) => {
                await advanceSelectedActor(optionId, choices);
                setAdvancementModalOpen(false);
              }}
              canAdvanceActor={canUpdateSelectedActor}
            />
            </DeferredPanel>
          </div>
        </div>
      )}
      {combatSetupOpen && selectedScene && !activeCombat && (
        <CombatSetupDialog
          key={`combat-setup:${campaignId}:${selectedScene.id}:${currentUserId}`}
          sceneName={selectedScene.name}
          tokens={selectedSceneTokens.filter((token) => tokenLayer(token) !== "map")}
          actors={snapshot.actors}
          initialSelectedTokenIds={selectedTokenIds}
          surpriseEnabled={selectedCampaign ? campaignSurpriseEnabled(selectedCampaign) : false}
          onConfirm={startCombat}
          onClose={() => setCombatSetupOpen(false)}
        />
      )}
      {characterCreatorOpen && (
        <DeferredPanel label="character creator">
        <LazyCharacterCreatorDialog
          key={`character-creator:${campaignId}:${currentUserId}`}
          campaignId={campaignId}
          templates={snapshot.characterTemplates}
          origins={characterOrigins}
          members={snapshot.members}
          currentUserId={currentUserId}
          onClose={() => setCharacterCreatorOpen(false)}
          onCreate={createCharacterFromCreator}
          onPreview={previewCharacterFromCreator}
        />
        </DeferredPanel>
      )}
      {characterImportOpen && encounterBuilderSystem && (
        <CharacterImportDialog
          systemId={encounterBuilderSystem.id}
          systemName={encounterBuilderSystem.name}
          members={snapshot.members}
          actorNames={snapshot.actors.map((actor) => actor.name)}
          currentUserId={currentUserId}
          onClose={() => setCharacterImportOpen(false)}
          onImport={importSystemCharacter}
        />
      )}
      {shortcutOverlayOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShortcutOverlayOpen(false);
        }}>
          <div ref={shortcutModalRef} className="modal-dialog shortcut-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1}>
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
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div className={`toast toast-${toast.tone}`} key={toast.id}>
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
    {realtimeUiState === "syncing" && (
      <div className="realtime-sync-guard" role="status" aria-live="assertive" aria-label="Refreshing shared table state">
        <RefreshCw size={18} aria-hidden="true" />
        <div>
          <strong>Syncing the table</strong>
          <span>Refreshing authoritative campaign state before play resumes.</span>
        </div>
      </div>
    )}
    </>
  );
}

function AiAgentPanel(props: {
  campaignId?: string;
  localDemo: boolean;
  promptRef: { current: HTMLTextAreaElement | null };
  messages: AiAgentMessage[];
  prompt: string;
  status: string;
  busy: boolean;
  codexAuth: AiAgentCodexAuthPrompt | null;
  referenceAsset?: MapAsset;
  referenceUploadStatus: string;
  proposals: Proposal[];
  hiddenProposalIds: ReadonlySet<string>;
  canApply: boolean;
  approvalMode: AiAgentApprovalMode;
  onApprovalModeChange(value: AiAgentApprovalMode): void;
  onPromptChange(value: string): void;
  onSend(): void;
  onNewChat(): void;
  onStop(): void;
  onUploadReference(file: File, input?: HTMLInputElement): Promise<void>;
  onClearReference(): void;
  onStartCodexAuth(auth: CodexAuthStart): void;
  onClose(): void;
  onApply(proposal: Proposal): void;
  onReject(proposal: Proposal): void;
}) {
  const agentProposals = visibleAiAgentProposals(props.proposals, props.messages, props.hiddenProposalIds);
  const providerReadiness = useAiStudioReadiness(props.localDemo ? undefined : props.campaignId);
  const readiness: AiStudioReadiness = props.localDemo
    ? { providerBackedActionsAvailable: true, label: "Local demo agent", detail: "This demo drafts proposals locally without calling an AI provider.", statusClass: "completed" }
    : providerReadiness;
  const readinessPresentation = aiAgentReadinessPresentation(readiness, props.busy, agentProposals.length, props.status);
  const codexAuthUrl = props.codexAuth?.authUrl ?? props.codexAuth?.verificationUrl;
  const agentPanel = useMovablePanel(initialAiAgentPanelPosition, initialAiAgentPanelSize, { minWidth: 340, minHeight: 420 });
  const feedRef = useRef<HTMLElement | null>(null);
  const initialPromptFocusCompleteRef = useRef(false);
  const [referenceDragActive, setReferenceDragActive] = useState(false);
  const hasStreamingAssistant = props.messages.some((message) => message.role === "assistant" && message.streaming);
  useEffect(() => {
    if (readinessPresentation.composerDisabled || initialPromptFocusCompleteRef.current) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const prompt = props.promptRef.current;
      if (!prompt || prompt.disabled) return;
      prompt.focus();
      initialPromptFocusCompleteRef.current = true;
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [props.promptRef, readinessPresentation.composerDisabled]);
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }, [props.busy, props.messages]);
  const dragHasFiles = (event: ReactDragEvent<HTMLElement>): boolean => Array.from(event.dataTransfer.types).includes("Files");
  const draggedImageFile = (event: ReactDragEvent<HTMLElement>): File | undefined => Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
  const handleReferenceDragEnter = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    if (readinessPresentation.composerDisabled) return;
    setReferenceDragActive(true);
  };
  const handleReferenceDragOver = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = readinessPresentation.composerDisabled ? "none" : "copy";
    if (readinessPresentation.composerDisabled) return;
    setReferenceDragActive(true);
  };
  const handleReferenceDragLeave = (event: ReactDragEvent<HTMLFormElement>) => {
    const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    setReferenceDragActive(false);
  };
  const handleReferenceDrop = (event: ReactDragEvent<HTMLFormElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setReferenceDragActive(false);
    if (readinessPresentation.composerDisabled) return;
    const file = draggedImageFile(event);
    if (file) void props.onUploadReference(file);
  };
  const handleAiAgentPromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!readinessPresentation.composerDisabled && props.prompt.trim()) props.onSend();
    }
  };
  return (
    <aside className="ai-agent-popout movable-panel" aria-label="AI Agent" style={agentPanel.style} {...agentPanel.panelProps}>
      <header className="ai-agent-header floating-panel-header" title="Drag panel" {...agentPanel.dragHandleProps}>
        <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
        <div className="ai-agent-title-block">
          <span className="section-title">AI Agent</span>
          <strong>{readinessPresentation.headerStatus}</strong>
        </div>
        <span className="ai-agent-status-pill">{readinessPresentation.pillLabel}</span>
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
          <button className="ghost-button ai-agent-new-chat-button" type="button" onClick={props.onNewChat} disabled={props.busy} aria-label="Start new AI Agent chat" title="Start new chat">
            <Plus size={14} /> New chat
          </button>
          {!readiness.providerBackedActionsAvailable && (
            <div className={`ai-trust-note ai-agent-readiness ai-availability-${readiness.statusClass}`} role="status" aria-label="AI Agent availability">
              <Shield size={15} />
              <span><strong>{readiness.label}.</strong> {readiness.detail}</span>
            </div>
          )}
        </div>
        <section className="ai-agent-feed" aria-label="AI Agent messages" ref={feedRef}>
          {props.messages.length === 0 ? (
            <div className="empty-state compact">Ask for table prep, board edits, proposal review, or rules-supported actions.</div>
          ) : (
            props.messages.map((message) => (
              <article className={`ai-agent-message ${message.role}`} key={message.id}>
                <span>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</span>
                {message.progress && message.streaming && <p className="ai-agent-progress">{message.progress}</p>}
                {message.activity && message.activity.length > 0 && (
                  <div className="ai-agent-activity" aria-label="Agent activity">
                    {message.activity.map((entry, index) => (
                      <p key={`${message.id}-activity-${index}`}>{entry}</p>
                    ))}
                  </div>
                )}
                {message.content.trim() && <p>{message.content}</p>}
                {message.reasoning && message.reasoning.length > 0 && message.streaming && (
                  <div className="ai-agent-reasoning live" aria-label="Reasoning summary">
                    <span>Reasoning summary</span>
                    {message.reasoning.map((trace, index) => (
                      <p key={`${message.id}-reasoning-${index}`}>{trace}</p>
                    ))}
                  </div>
                )}
                {message.reasoning && message.reasoning.length > 0 && !message.streaming && (
                  <details className="ai-agent-reasoning">
                    <summary>Reasoning summary</summary>
                    {message.reasoning.map((trace, index) => (
                      <p key={`${message.id}-reasoning-${index}`}>{trace}</p>
                    ))}
                  </details>
                )}
              </article>
            ))
          )}
          {props.busy && !hasStreamingAssistant && (
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
                <p>{proposal.summary}</p>
                <details className="ai-agent-proposal-detail">
                  <summary>Review proposed changes</summary>
                  <ul>
                    {proposal.changesJson.slice(0, 8).map((change, index) => (
                      <li key={`${change.entity}:${change.action}:${change.id ?? index}`}>
                        <strong>{titleCaseLabel(change.action)}</strong>
                        <span>{titleCaseLabel(change.entity)}{change.id ? ` · ${change.id}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  {proposal.changesJson.length > 8 && <small>+{formatNumber(proposal.changesJson.length - 8)} more changes</small>}
                </details>
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
        className={referenceDragActive ? "ai-agent-composer drag-active" : "ai-agent-composer"}
        onDragEnter={handleReferenceDragEnter}
        onDragOver={handleReferenceDragOver}
        onDragLeave={handleReferenceDragLeave}
        onDrop={handleReferenceDrop}
        onSubmit={(event) => {
          event.preventDefault();
          if (!readinessPresentation.composerDisabled) props.onSend();
        }}
      >
        {props.referenceAsset && (
          <div className="ai-agent-composer-attachment">
            <span className="ai-agent-reference-thumb">
              <img src={assetBlobUrl(props.referenceAsset)} alt="" />
            </span>
            <span className="ai-agent-reference-name">{props.referenceAsset.name}</span>
            <button className="icon-button ai-agent-attachment-clear" type="button" aria-label="Clear attached image reference" onClick={props.onClearReference} disabled={props.busy}>
              <X size={14} />
            </button>
          </div>
        )}
        {props.referenceUploadStatus && <span className="ai-agent-composer-status">{props.referenceUploadStatus}</span>}
        <textarea ref={props.promptRef} aria-label="AI Agent prompt" value={props.prompt} placeholder={readiness.providerBackedActionsAvailable ? "Ask the agent..." : readiness.label} onChange={(event) => props.onPromptChange(event.target.value)} onKeyDown={handleAiAgentPromptKeyDown} disabled={readinessPresentation.composerDisabled} />
        <div className="ai-agent-composer-actions">
          <label className="icon-button ai-agent-attach-button" title="Attach image reference">
            <input
              className="ai-agent-reference-input"
              type="file"
              accept="image/*"
              aria-label="Attach image reference"
              disabled={readinessPresentation.composerDisabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void props.onUploadReference(file, event.currentTarget);
              }}
            />
            <ImageIcon size={16} />
          </label>
          {props.busy ? (
            <button className="ghost-button ai-agent-stop-button" type="button" onClick={props.onStop}>
              <X size={16} /> Stop
            </button>
          ) : (
            <button className="primary-button" type="submit" disabled={readinessPresentation.composerDisabled || !props.prompt.trim()}>
              <Send size={16} /> Send
            </button>
          )}
        </div>
      </form>
      <button className="floating-panel-resize-handle" type="button" aria-label="Resize AI Agent panel" title="Resize panel" {...agentPanel.resizeHandleProps}>
        <Grip size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}
