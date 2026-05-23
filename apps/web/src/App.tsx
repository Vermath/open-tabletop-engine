import type { Actor, AiMemoryFact, AiThread, AiToolCall, AuditLog, Campaign, CampaignArchive, ChatMessage, Combat, CombatAction, ContentImportBatch, ContentImportEntityKind, ContentImportSource, DiceRoll, EmailOutboxMessage, Encounter, FogHistoryEntry, FogMode, FogPreset, Item, JournalEntry, MapAsset, MessageType, OrganizationMemberRole, OrganizationWorkspace, PermissionName, Proposal, Scene, SceneAnnotation, SceneAnnotationKind, SceneAnnotationLayer, SceneTemplateShape, ScimAssignableRole, Token, TokenLayer, UserRole, Visibility, VisionPoint, VisionPointSample, VisionPolygon, VisionSnapshot } from "@open-tabletop/core";
import { toPng } from "html-to-image";
import { Activity, Bot, Boxes, BrickWall, Check, ChevronLeft, ChevronRight, Circle, Crosshair, Download, Eraser, Eye, FileText, Hand, Image as ImageIcon, KeyRound, Lightbulb, LockKeyhole, Mail, Map as MapIcon, MapPin, MessageSquare, Paintbrush, PencilLine, Pentagon, Plus, RefreshCw, RotateCcw, Ruler, ScrollText, Send, Shield, Swords, Timer, Triangle, Upload, UserCog, UserPlus, Users, UserX, WandSparkles, X, ZoomIn, ZoomOut } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { acceptInviteSession, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, bootstrapOwnerSession, changePasswordSession, confirmPasswordResetSession, confirmTotpMfa, consumeSsoRedirect, createOrganizationWorkspace, disableTotpMfa, enrollTotpMfa, getSessionToken, getSessionUserId, loadAdminSnapshot, loadBootstrapStatus, loadMfaStatus, loadOidcConfig, loadOrganizationInvites, loadOrganizationMembers, loadSnapshot, loginPasswordSession, loginSession, logoutSession, registerSession, removeOrganizationMember, requestPasswordReset, revokeInvite, setSessionUserId, startOidcLogin, switchOrganization, updateOrganizationMemberRole, updateWorkspaceDefaults, upsertOrganizationMember, type AdminAssetIntegrityQuarantineResult, type AdminAuthConnectionTestResult, type AdminEmailOutboxRetryAllResult, type AdminJob, type AdminJobAlertResult, type AdminPasswordResetInfo, type AdminPluginReviewInfo, type AdminScimGroupRoleMapping, type AdminScimGroupRoleMappingInput, type AdminScimGroupRoleMappingResult, type AdminSessionInfo, type AdminSnapshot, type AdminStorageBackupResult, type AdminStorageRestoreDrillResult, type AdminStorageRestoreResult, type AdminUserInfo, type AiUsageSummary, type CampaignAssetStorageInfo, type CharacterTemplateInfo, type EncounterPlanInfo, type InviteCreateInfo, type MfaInfo, type OrganizationMemberInfo, type PluginReviewStatus, type PluginRuntimeInfo, type Snapshot, type SystemRuntimeInfo } from "./api.js";
import { applyLocalBoardHistoryAction, createTokenCopies, type BoardHistoryAction, type BoardHistoryDirection, type BoardTokenPositionChange } from "./board-history.js";
import { scenePointFromClient } from "./board-geometry.js";
import { boardKeyboardAction } from "./board-keyboard.js";
import { parseChatCommand } from "./chat-command.js";
import { templateConePoints } from "./scene-annotations.js";
import { sceneTabWrapClass } from "./scene-tabs.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";
const boardHistoryLimit = 50;

interface FailedAssetUpload {
  file: File;
  setAsBackground: boolean;
  folder: string;
  tags: string;
  message: string;
}

interface FailedArchiveImport {
  file: File;
  message: string;
}

type ChatExportFormat = "json" | "ndjson";
type ChatModerationResolution = "open" | "follow_up" | "reviewed";
type CampaignPermissionTemplateId = "standard" | "player_authoring" | "ai_assisted" | "assistant_ops";
type ArchiveExportScope = "campaign";
type ArchiveExportVersion = "0.2.0";
type ArchiveRedactionMode = "portable";
type ArchiveImportMode = "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
type ArchiveImportScope = "all" | "assets_only" | "selected_collections";
type ArchiveImportCollection = "assets" | "scenes" | "tokens" | "actors" | "items" | "journals" | "handouts" | "chat" | "rolls" | "diceMacros" | "encounters" | "combats" | "contentImports" | "fogPresets";
type ManageCategoryId = "account" | "campaign" | "people" | "scenes" | "archives" | "serverAdmin";
type WorkspaceMode = "live" | "prep" | "ai" | "manage";
type InspectorTab = "actors" | "journal" | "chat" | "combat" | "content" | "plugins";
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
}

interface AiAgentThreadResponse {
  thread: AiThread;
  assistantMessage: string;
  events: Array<{ type: string; proposalId?: string }>;
}

interface BoardCaptureRequestEvent {
  type: "agent.boardCaptureRequested";
  payload?: {
    requestId?: string;
    sceneId?: string;
    expiresAt?: string;
  };
}

const annotationLayers: SceneAnnotationLayer[] = ["measurement", "effects", "drawings", "notes"];

const campaignPermissionTemplates: Array<{ id: CampaignPermissionTemplateId; label: string; description: string }> = [
  { id: "standard", label: "Standard table", description: "Role defaults only; players can play assigned characters without prep permissions." },
  { id: "player_authoring", label: "Player authoring", description: "Players can create actors, journal entries, and tokens for collaborative prep." },
  { id: "ai_assisted", label: "AI-assisted players", description: "Players keep standard play rights and can draft AI proposals for GM review." },
  { id: "assistant_ops", label: "Assistant GM ops", description: "Assistant GMs gain moderation and plugin setup permissions for shared administration." }
];

const identityProviderSetupGuides = [
  {
    id: "okta",
    name: "Okta",
    oidc: "Create an OIDC web app, add the API callback URL, allow authorization-code flow, and copy issuer, client id, and client secret into OTTE_OIDC_*.",
    scim: "Create a SCIM 2.0 app integration, set the base URL to /api/v1/scim/v2, use bearer token auth, then map Okta groups to campaign roles below."
  },
  {
    id: "entra",
    name: "Microsoft Entra ID",
    oidc: "Register a web application, add the API callback URL as a web redirect URI, issue a client secret, and use the tenant v2.0 issuer.",
    scim: "Use enterprise app provisioning with bearer token auth, point tenant URL at /api/v1/scim/v2, and map Entra groups by display name or external id."
  },
  {
    id: "google",
    name: "Google Workspace",
    oidc: "Create an OAuth web client, add the API callback URL, and use Google's accounts issuer with the generated client id and secret.",
    scim: "Google Workspace does not provide generic SCIM for all editions; use an identity bridge or map groups from a SCIM-capable directory."
  },
  {
    id: "generic",
    name: "Generic OIDC/SCIM",
    oidc: "Use issuer discovery, authorization-code callback to /api/v1/auth/oidc/callback, and a browser return origin matching OTTE_WEB_ORIGIN.",
    scim: "Provision users and groups through /api/v1/scim/v2/Users and /api/v1/scim/v2/Groups with the OTTE_SCIM_BEARER_TOKEN bearer credential."
  }
] as const;

const contentImportAdapterPresets: Array<{
  id: ContentImportAdapterPresetId;
  label: string;
  description: string;
  adapterId?: string;
  sourceType: ContentImportSource["sourceType"];
  sourceName: string;
  license: ContentImportSource["license"];
}> = [
  {
    id: "manual",
    label: "Manual",
    description: "Create exactly the entities entered below as private table content.",
    sourceType: "manual",
    sourceName: "Web manual content import",
    license: { name: "User-provided private table content", usage: "private_home_game" }
  },
  {
    id: "csv_items",
    label: "CSV item list",
    description: "Parse one item per line using the configured columns.",
    adapterId: "csv-item-list-v1",
    sourceType: "adapter",
    sourceName: "CSV Item List Adapter",
    license: { name: "User-provided reusable item list", usage: "user_provided" }
  },
  {
    id: "markdown_handout",
    label: "Markdown handout",
    description: "Turn Markdown notes into a handout with heading-derived title fallback.",
    adapterId: "markdown-handout-v1",
    sourceType: "adapter",
    sourceName: "Markdown Handout Adapter",
    license: { name: "User-provided Markdown notes", usage: "user_provided" }
  },
  {
    id: "srd_json",
    label: "Open SRD JSON",
    description: "Parse legally reusable SRD JSON entries into private import entities.",
    adapterId: "open-srd-json-v1",
    sourceType: "adapter",
    sourceName: "Open SRD JSON Adapter",
    license: { name: "Open SRD-compatible content", usage: "srd", attribution: "Source-provided SRD attribution required" }
  }
];

function initialResetToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
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

type CampaignImportResult = {
  importedCampaignIds: string[];
  counts: Record<string, number>;
  conflicts: Array<{ collection: string; id: string }>;
  skippedConflicts?: Array<{ collection: string; id: string }>;
  assetFiles: number;
  dryRun?: boolean;
  importScope?: ArchiveImportScope;
  importCollections?: ArchiveImportCollection[];
  importWarnings?: string[];
};

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

type ContentImportDraftEntity = {
  kind: ContentImportEntityKind;
  name: string;
  body: string;
};

type ContentImportPreviewSource = Partial<Omit<ContentImportSource, "submittedByUserId" | "submittedAt">>;
type ContentImportAdapterPresetId = "manual" | "csv_items" | "markdown_handout" | "srd_json";
type CsvImportConfig = {
  columns: string[];
  delimiter: string;
  kind: ContentImportEntityKind;
  skipHeader: boolean;
};

type RulesCompendiumEntry = {
  id: string;
  type: string;
  name: string;
  summary: string;
  data: Record<string, unknown>;
};

type TokenVisionPatch = Partial<Pick<Token, "visionEnabled" | "visionRadius" | "dimVisionRadius">> & { brightVisionRadius?: number | null };

type AdvancementOptionInfo = {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  nextValue: number;
};

type AssetLifecycleStatus = NonNullable<MapAsset["lifecycle"]>["status"];
type MeasurementTool = "measure-circle" | "measure-cone";
type AnnotationTool = SceneAnnotationKind | MeasurementTool | null;
type ActiveAnnotationTool = NonNullable<AnnotationTool>;
type ActorLoadoutFilter = "all" | "equipped" | "consumable" | "magic";

function summarizeImport(result: CampaignImportResult): string {
  const collections = ["campaigns", "members", "scenes", "tokens", "actors", "journals", "handouts", "chat", "rolls", "combats", "contentImports"];
  const changed = collections.map((collection) => [collection, result.counts[collection] ?? 0] as const).filter(([, count]) => count > 0);
  const summary = changed.slice(0, 5).map(([collection, count]) => `${count} ${collection}`).join(", ");
  const suffix = result.assetFiles > 0 ? `; restored ${result.assetFiles} asset files` : "";
  return summary ? `${summary}${suffix}` : `No campaign records changed${suffix}`;
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function contentImportEntityData(kind: ContentImportEntityKind, body: string): Record<string, unknown> {
  const trimmedBody = body.trim();
  if (kind === "actor") {
    return {
      type: "npc",
      data: {
        notes: trimmedBody,
        hp: { current: 1, max: 1 }
      }
    };
  }
  if (kind === "item") {
    return {
      type: "loot",
      data: {
        notes: trimmedBody,
        quantity: 1
      }
    };
  }
  return {
    body: trimmedBody,
    visibility: "gm_only",
    tags: ["content-import"]
  };
}

function contentImportPreviewSource(preset: (typeof contentImportAdapterPresets)[number], sourceName: string, sourceUrl: string, notes: string): ContentImportPreviewSource {
  return {
    sourceType: preset.sourceType,
    adapterId: preset.adapterId,
    sourceName: sourceName.trim() || preset.sourceName,
    sourceUrl: sourceUrl.trim() || undefined,
    notes: notes.trim() || preset.description,
    license: preset.license
  };
}

function contentImportAdapterEntities(presetId: ContentImportAdapterPresetId, body: string, fallback: ContentImportDraftEntity, config: string): ContentImportDraftEntity[] {
  if (presetId === "manual") return fallback.name ? [fallback] : [];
  if (presetId === "markdown_handout") {
    const name = fallback.name || markdownTitle(body) || "Imported Markdown Handout";
    return body.trim() ? [{ kind: "handout", name, body }] : [];
  }
  if (presetId === "csv_items") return csvItemImportEntities(body, config);
  if (presetId === "srd_json") return srdJsonImportEntities(body, fallback.kind);
  return [];
}

function markdownTitle(body: string): string | undefined {
  return body.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("# "))?.replace(/^#+\s*/, "").trim();
}

function csvItemImportEntities(body: string, config: string): ContentImportDraftEntity[] {
  const csvConfig = parseCsvImportConfig(config);
  const nameIndex = Math.max(0, csvConfig.columns.indexOf("name"));
  const bodyIndex = csvConfig.columns.includes("body") ? csvConfig.columns.indexOf("body") : csvConfig.columns.includes("notes") ? csvConfig.columns.indexOf("notes") : 1;
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(csvConfig.delimiter).map((part) => part.trim()))
    .filter((parts, index) => !(csvConfig.skipHeader && index === 0 && parts[nameIndex]?.toLowerCase() === "name"))
    .filter((parts) => Boolean(parts[nameIndex]))
    .map((parts) => ({
      kind: csvConfig.kind,
      name: parts[nameIndex]!,
      body: parts[bodyIndex] || parts.slice(1).join(", ") || "Imported item"
    }));
}

function parseCsvImportConfig(config: string): CsvImportConfig {
  const trimmed = config.trim();
  const fields: Record<string, string> = {};
  for (const part of trimmed.split(";").map((item) => item.trim()).filter((item) => item.includes("="))) {
    const [key = "", ...value] = part.split("=");
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey) fields[normalizedKey] = value.join("=").trim();
  }
  const delimiter = fields.delimiter || ",";
  const columnsInput = fields.columns || (trimmed.includes("=") ? "name,body" : trimmed) || "name,body";
  const columns = columnsInput.split(columnsInput.includes("|") ? "|" : ",").map((column) => column.trim().toLowerCase()).filter(Boolean);
  const requestedKind = fields.kind;
  const kind = requestedKind && ["actor", "item", "journal", "handout"].includes(requestedKind) ? (requestedKind as ContentImportEntityKind) : "item";
  return {
    columns: columns.length > 0 ? columns : ["name", "body"],
    delimiter,
    kind,
    skipHeader: fields.skipheader !== "false"
  };
}

function srdJsonImportEntities(body: string, fallbackKind: ContentImportEntityKind): ContentImportDraftEntity[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    const entries = Array.isArray(parsed) ? parsed : recordValue(parsed).entries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      const record = recordValue(entry);
      const name = stringValue(record.name);
      if (!name) return [];
      const kind = ["actor", "item", "journal", "handout"].includes(String(record.kind)) ? (record.kind as ContentImportEntityKind) : fallbackKind;
      const summary = stringValue(record.summary) ?? stringValue(record.body) ?? stringValue(record.description) ?? "Imported SRD entry";
      return [{ kind, name, body: summary }];
    });
  } catch {
    return [];
  }
}

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
  const [aiPrompt, setAiPrompt] = useState("Draft a balanced vault guardian encounter for this party.");
  const [aiMapPrompt, setAiMapPrompt] = useState("Generate a gridless top-down ember vault battlemap with broken pillars, lava-lit channels, and clear tactical lanes. Do not draw square grids, coordinates, tokens, labels, or UI overlays.");
  const [aiTokenPrompt, setAiTokenPrompt] = useState("Generate token art for this character with a clean silhouette, readable equipment, and no text.");
  const [aiGenerationJobs, setAiGenerationJobs] = useState<AiGenerationJob[]>([]);
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [aiAgentPrompt, setAiAgentPrompt] = useState("");
  const [aiAgentMessages, setAiAgentMessages] = useState<AiAgentMessage[]>([]);
  const [aiAgentBusy, setAiAgentBusy] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState("Agent ready");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("player");
  const [inviteToken, setInviteToken] = useState("");
  const [joinToken, setJoinToken] = useState(initialInviteToken);
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [publicRegistration, setPublicRegistration] = useState(true);
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
  const [importedActor, setImportedActor] = useState<Actor>();
  const [createdMonster, setCreatedMonster] = useState<Actor>();
  const [importStatus, setImportStatus] = useState("No archive imported this session");
  const [archiveImportMode, setArchiveImportMode] = useState<ArchiveImportMode>("upsert");
  const [archiveImportScope, setArchiveImportScope] = useState<ArchiveImportScope>("all");
  const [archiveImportCollections, setArchiveImportCollections] = useState<ArchiveImportCollection[]>(["assets"]);
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
  const [sceneDuplicateName, setSceneDuplicateName] = useState("");
  const [sceneFolderFilter, setSceneFolderFilter] = useState("all");
  const [sceneSearch, setSceneSearch] = useState("");
  const [bulkSceneFolder, setBulkSceneFolder] = useState("");
  const [selectedPrepSceneIds, setSelectedPrepSceneIds] = useState<string[]>([]);
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
  const [fogPresetName, setFogPresetName] = useState("");
  const [fogPresetMode, setFogPresetMode] = useState<"replace" | "append">("replace");
  const [visionSampleX, setVisionSampleX] = useState("");
  const [visionSampleY, setVisionSampleY] = useState("");
  const [toolReport, setToolReport] = useState("");
  const [canvasAssetDragging, setCanvasAssetDragging] = useState(false);
  const tokenDropHandledRef = useRef(false);

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
  const canDeleteSelectedBoardTokens = hasPermission("token.delete");
  const sessionPulseStatus = status.toLowerCase().includes("realtime") || status.toLowerCase().includes("connected")
    ? "Connected"
    : status.toLowerCase().includes("loading")
      ? "Loading"
      : "Ready";
  const activeSystemId = snapshot.systems.find((system) => system.active)?.id ?? selectedCampaign?.defaultSystemId;
  const selectedActor = snapshot.actors.find((actor) => actor.id === selectedToken?.actorId) ?? snapshot.actors.find((actor) => actor.systemId === activeSystemId) ?? snapshot.actors[0];
  const activeCombat = snapshot.combats.find((combat) => combat.active);
  const recentEndedCombats = snapshot.combats.filter((combat) => !combat.active).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 3);
  const selectedPermissionTemplate = campaignPermissionTemplates.find((template) => template.id === setupPermissionTemplate) ?? campaignPermissionTemplates[0]!;
  const setupPreviewSceneName = setupSceneName.trim() || "Opening Scene";
  const setupPreviewFolder = setupSceneFolder.trim() || "no folder";
  const setupVisibilityLabel =
    newCampaignVisibility === "invite_only" ? "Invite only" : newCampaignVisibility === "public" ? "Public" : "Private";
  const setupInviteSummary = setupInviteEnabled
    ? `${titleCaseLabel(setupInviteRole)} invite${setupInviteEmail.trim() ? ` for ${setupInviteEmail.trim()}` : ""}`
    : "No starter invite";
  const setupOnboardingSummary = setupOnboardingBody.trim()
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
  const sceneActivationHistory = [...(selectedScene?.activationHistory ?? [])].sort((left, right) => right.activatedAt.localeCompare(left.activatedAt));
  const latestSceneActivation = sceneActivationHistory[0];
  const activeScene = accessibleScenes.find((scene) => scene.active);
  const activeMapAsset = snapshot.assets.find((asset) => asset.id === activeScene?.backgroundAssetId);
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
          { label: "Annotations", selected: formatNumber(selectedScene.annotations?.length ?? 0), active: formatNumber(activeScene.annotations?.length ?? 0) },
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
              (selectedScene.annotations?.length ?? 0) === (activeScene.annotations?.length ?? 0)
                ? "Fog, walls, lights, and annotations match by count"
                : `Fog ${selectedScene.fog.length}/${activeScene.fog.length}; walls ${selectedScene.walls.length}/${activeScene.walls.length}; lights ${selectedScene.lights.length}/${activeScene.lights.length}; annotations ${selectedScene.annotations?.length ?? 0}/${activeScene.annotations?.length ?? 0}`
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
  const annotationLayerCounts = (selectedScene?.annotations ?? []).reduce<Record<string, number>>((counts, annotation) => {
    const layer = annotation.layer ?? defaultAnnotationLayer(annotation.kind);
    counts[layer] = (counts[layer] ?? 0) + 1;
    return counts;
  }, {});
  const annotationGroupCounts = (selectedScene?.annotations ?? []).reduce<Record<string, number>>((counts, annotation) => {
    const group = annotationGroupKey(annotation);
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
  const latestAreaTemplate = [...(selectedScene?.annotations ?? [])].reverse().find((annotation) => annotation.kind === "template");
  const canUpdateSelectedActor = hasPermission("actor.update") || (selectedActor?.ownerUserId === currentUserId && hasPermission("actor.updateOwned"));
  const activeOrganization = snapshot.organizations.find((organization) => organization.id === activeOrganizationId);
  const canManageActiveOrganization = activeOrganization?.role === "owner" || activeOrganization?.role === "admin";

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
    const handleBoardKeyboard = (event: KeyboardEvent) => {
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
  }, [boardClipboardTokens, boardRedoStack.length, boardUndoStack.length, canDeleteSelectedBoardTokens, selectedScene?.id, selectedScene?.gridSize, selectedTokens]);

  async function refresh(nextCampaignId = campaignId, nextSceneId = sceneId, options: { syncStatus?: boolean } = {}) {
    const next = await loadSnapshot(nextCampaignId, nextSceneId);
    setSnapshot(next);
    setSessionToken(getSessionToken());
    const campaign = next.campaigns.find((item) => item.id === nextCampaignId) ?? next.campaigns[0];
    const scene = next.scenes.find((item) => item.id === nextSceneId) ?? next.scenes.find((item) => item.active) ?? next.scenes[0];
    setCampaignId(campaign?.id ?? "");
    setSceneId(scene?.id ?? "");
    const sceneTokens = scene ? next.tokens.filter((item) => item.sceneId === scene.id) : next.tokens;
    const validSelection = selectedTokenIds.filter((id) => sceneTokens.some((item) => item.id === id));
    const token = sceneTokens.find((item) => item.id === selectedTokenId) ?? sceneTokens.find((item) => validSelection.includes(item.id)) ?? sceneTokens[0];
    setSelectedTokenIdState(token?.id ?? "");
    setSelectedTokenIds(token ? (validSelection.length ? validSelection : [token.id]) : []);
    setSnapshotReady(true);
    if (options.syncStatus !== false) setStatus("Synced");
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
    persistStoredId("otte:selectedCampaignId", campaignId);
  }, [campaignId]);

  useEffect(() => {
    persistStoredId("otte:selectedSceneId", sceneId);
  }, [sceneId]);

  useEffect(() => {
    if (resetMode) return;
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
          setAuthStatus(bootstrap.publicRegistration ? "Sign in or register to open a campaign" : "Sign in or use an invite link to join the beta");
          return;
        }
        refresh().catch((error) => {
          const message = errorMessage(error);
          if (/unauthorized|missing session token|session token/i.test(message)) {
            setSessionToken("");
            setAuthRequired(true);
            setStatus("Sign in required");
            setAuthStatus(bootstrap.publicRegistration ? "Sign in or register to open a campaign" : "Sign in or use an invite link to join the beta");
            return;
          }
          setStatus(`API offline at ${apiBase || "http://127.0.0.1:4000"}: ${message}. Start it with pnpm --filter @open-tabletop/api dev.`);
        });
      })
      .catch((error) => {
        if (!cancelled) setStatus(`API offline at ${apiBase || "http://127.0.0.1:4000"}: ${error instanceof Error ? error.message : String(error)}. Start it with pnpm --filter @open-tabletop/api dev.`);
      });
    return () => {
      cancelled = true;
    };
  }, [resetMode]);

  useEffect(() => {
    if (!publicRegistration && authMode === "register") setAuthMode("login");
  }, [authMode, publicRegistration]);

  useEffect(() => {
    if (!campaignId || !sessionToken) return;
    const wsUrl = `${apiBase || window.location.origin}`.replace(/^http/, "ws") + `/api/v1/realtime?campaignId=${encodeURIComponent(campaignId)}`;
    const socket = new WebSocket(wsUrl, ["otte.v1", `otte.auth.${sessionToken}`]);
    socket.onopen = () => setStatus((current) => (current === "Loading campaign" || current.toLowerCase().includes("realtime") || current.startsWith("API offline") ? "Realtime connected" : current));
    socket.onmessage = (event) => {
      if (handleBoardCaptureRealtimeEvent(event.data)) return;
      refresh(campaignId, sceneId, { syncStatus: false }).catch(() => setStatus("Realtime refresh failed"));
    };
    socket.onerror = () => setStatus("Realtime unavailable");
    return () => socket.close();
  }, [campaignId, sceneId, selectedScene?.id, sessionToken]);

  useEffect(() => {
    if (workspaceMode !== "manage" || manageCategory !== "serverAdmin" || !snapshot.session?.serverAdmin) return;
    refreshAdmin().catch((error) => setAdminStatus(error instanceof Error ? error.message : String(error)));
  }, [manageCategory, workspaceMode, snapshot.session?.serverAdmin]);

  useEffect(() => {
    if (workspaceMode === "live" && tab !== "actors" && tab !== "chat" && tab !== "combat") setTab("actors");
    if (workspaceMode === "prep" && tab !== "actors" && tab !== "journal" && tab !== "content" && tab !== "plugins") setTab("content");
    if (workspaceMode === "manage" && tab !== "actors" && tab !== "journal" && tab !== "content" && tab !== "plugins") setTab("actors");
  }, [tab, workspaceMode]);

  useEffect(() => {
    if (manageCategory === "serverAdmin" && snapshot.session && !snapshot.session.serverAdmin) setManageCategory("campaign");
  }, [manageCategory, snapshot.session?.serverAdmin, snapshot.session?.user.id]);

  useEffect(() => {
    if (!selectedActor || tab !== "actors") return;
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
  }, [campaignId, selectedActor?.id, selectedActor?.systemId, tab]);

  useEffect(() => {
    if (!selectedActor) {
      setAdvancementOptions([]);
      return;
    }
    let cancelled = false;
    apiGet<{ actorId: string; options: AdvancementOptionInfo[] }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advancement`)
      .then((result) => {
        if (!cancelled) setAdvancementOptions(result.options);
      })
      .catch(() => {
        if (!cancelled) setAdvancementOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, selectedActor?.id, selectedActor?.systemId]);

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
    setSceneEditName(selectedScene.name);
    setSceneEditFolder(selectedScene.folder ?? "");
    setSceneEditWidth(selectedScene.width);
    setSceneEditHeight(selectedScene.height);
    setSceneEditGridSize(selectedScene.gridSize);
    setSceneEditActive(selectedScene.active);
    setSceneEditBackgroundAssetId(selectedScene.backgroundAssetId ?? "");
    setSceneEditGridOverlayVisible(sceneGridOverlayVisible(selectedScene));
    setSceneDuplicateName(`${selectedScene.name} Copy`);
    setSceneDeleteConfirm("");
  }, [selectedScene?.id, selectedScene?.name, selectedScene?.folder, selectedScene?.width, selectedScene?.height, selectedScene?.gridSize, selectedScene?.active, selectedScene?.backgroundAssetId, selectedScene?.metadata]);

  useEffect(() => {
    if (sceneFolderFilter === "all") return;
    if (!sceneFolderOptions.includes(sceneFolderFilter)) setSceneFolderFilter("all");
  }, [sceneFolderFilter, sceneFolderOptions]);

  useEffect(() => {
    if (authRequired || !sessionToken || !snapshot.session?.user.id) return;
    loadMfaStatus()
      .then((info) => setMfaInfo(info))
      .catch(() => setMfaInfo(undefined));
  }, [authRequired, sessionToken, snapshot.session?.user.id]);

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
      permissionTemplate: setupPermissionTemplate
    });
    const scene = await apiPost<Scene>(`/api/v1/campaigns/${campaign.id}/scenes`, {
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
    setSceneId(scene.id);
    setNewCampaignName("");
    setNewCampaignDescription("");
    setSetupSceneName("Opening Scene");
    setSetupSceneFolder("session-0");
    setSetupSceneWidth(1200);
    setSetupSceneHeight(800);
    setSetupSceneGridSize(50);
    setSetupInviteEnabled(false);
    setSetupInviteEmail("");
    setSetupInviteRole("player");
    setSetupPermissionTemplate("standard");
    setSetupOnboardingTitle("Welcome to the Table");
    setSetupOnboardingBody("Use this handout for table rules, safety notes, and first-session goals.");
    await refresh(campaign.id, scene.id);
    const permissionSummary = setupPermissionTemplate === "standard" ? "" : `; ${selectedPermissionTemplate.label} permissions applied`;
    setStatus(setupInvite ? `${campaign.name} created with ${scene.name}; ${setupInvite.invite.role} invite ready${permissionSummary}` : `${campaign.name} created with ${scene.name}${permissionSummary}`);
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

  async function createScene() {
    const name = newSceneName.trim();
    const scene = await apiPost<Scene>(`/api/v1/campaigns/${campaignId}/scenes`, {
      name: name || `Scene ${snapshot.scenes.length + 1}`,
      folder: newSceneFolder.trim() || undefined,
      width: newSceneWidth,
      height: newSceneHeight,
      gridSize: newSceneGridSize,
      backgroundAssetId: newSceneBackgroundAssetId || undefined,
      active: newSceneActive || snapshot.scenes.length === 0,
      sortOrder: orderedScenes.length + 1
    });
    setSceneId(scene.id);
    setNewSceneName("");
    setStatus(`${scene.name} created`);
    await refresh(campaignId, scene.id);
  }

  async function saveSceneSettings() {
    if (!selectedScene) return;
    const scene = await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}`, {
      name: sceneEditName.trim() || selectedScene.name,
      folder: sceneEditFolder.trim() || null,
      width: Math.max(200, sceneEditWidth),
      height: Math.max(200, sceneEditHeight),
      gridSize: Math.max(10, sceneEditGridSize),
      backgroundAssetId: sceneEditBackgroundAssetId || null,
      active: sceneEditActive,
      metadata: {
        ...selectedScene.metadata,
        gridOverlayVisible: sceneEditGridOverlayVisible
      }
    });
    setStatus(`${scene.name} updated`);
    await refresh(campaignId, scene.id);
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

  async function deleteSelectedScene() {
    if (!selectedScene || sceneDeleteConfirm !== selectedScene.name) return;
    const nextScene = orderedScenes.find((scene) => scene.id !== selectedScene.id);
    await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}`);
    setSceneDeleteConfirm("");
    setSceneId(nextScene?.id ?? "");
    setStatus(`${selectedScene.name} deleted; audit logged`);
    await refresh(campaignId, nextScene?.id ?? "");
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
    const token = await apiPost<Token>(`/api/v1/scenes/${selectedScene.id}/tokens`, {
      actorId,
      imageAssetId,
      name: options.name?.trim() || actor?.name || newTokenName.trim() || "New Token",
      x: position.x,
      y: position.y,
      width,
      height,
      layer,
      disposition: options.disposition ?? (actor ? "friendly" : newTokenDisposition)
    });
    pushBoardHistoryAction({ kind: "tokens.create", tokens: [token] });
    setActiveTokenLayer(layer);
    selectSingleToken(token.id);
    setNewTokenName("");
    setNewTokenActorId("");
    setStatus(`${token.name} ${options.x !== undefined || options.y !== undefined ? "placed on scene" : "created"}`);
    await refresh();
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
    if (typeof data !== "string") return false;
    let event: BoardCaptureRequestEvent | undefined;
    try {
      event = JSON.parse(data) as BoardCaptureRequestEvent;
    } catch {
      return false;
    }
    if (event?.type !== "agent.boardCaptureRequested" || !event.payload?.requestId) return false;
    captureAgentBoard(event.payload).catch((error) => setAiAgentStatus(`Board capture failed: ${errorMessage(error)}`));
    return true;
  }

  async function captureAgentBoard(payload: NonNullable<BoardCaptureRequestEvent["payload"]>) {
    const requestId = payload.requestId;
    if (!requestId) return;
    const board = document.querySelector<HTMLElement>('[data-agent-board-root="true"]') ?? document.querySelector<HTMLElement>(".scene-board");
    if (!board) {
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: "No board element is mounted in the current web client.", sceneId: selectedScene?.id });
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
        sceneId: selectedScene?.id,
        width: Math.round(board.offsetWidth),
        height: Math.round(board.offsetHeight)
      });
      setAiAgentStatus("Board capture sent");
    } catch (error) {
      await apiPost(`/api/v1/agent/board-captures/${requestId}`, { error: errorMessage(error), sceneId: selectedScene?.id });
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

  async function importCampaignArchive(file: File, input?: HTMLInputElement) {
    setIsImportingArchive(true);
    setImportStatus(`Importing ${file.name}`);
    setStatus("Importing archive");
    try {
      const archive = JSON.parse(await file.text()) as unknown;
      if (archiveImportMode !== "dry_run" && campaignId) {
        const rollback = await apiGet<CampaignArchive>(`/api/v1/campaigns/${campaignId}/export?scope=campaign&version=0.2.0&redaction=portable`);
        setArchiveRollbackSnapshot(rollback);
        setArchiveRollbackFileName(`rollback-before-${file.name}`);
      }
      const result = await apiPost<CampaignImportResult>(
        "/api/v1/import/campaign",
        archiveImportMode === "upsert" && archiveImportScope === "all" ? archive : { archive, mode: archiveImportMode, scope: archiveImportScope, collections: archiveImportScope === "selected_collections" ? archiveImportCollections : undefined }
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
    await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, patch);
    await refresh();
  }

  async function updateSelectedToken(patch: Partial<Token>) {
    if (!selectedToken) return;
    await apiPatch<Token>(`/api/v1/tokens/${selectedToken.id}`, patch);
    await refresh();
    setStatus("Token updated");
  }

  function pushBoardHistoryAction(action: BoardHistoryAction) {
    const size = action.kind === "tokens.move" ? action.changes.length : action.tokens.length;
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
    if (action.kind === "tokens.move") {
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
    enqueueBoardSync(() => persistBoardHistoryAction(action, direction));
  }

  async function deleteTokens(tokensToDelete: Token[], options: { recordHistory: boolean; statusLabel?: string }) {
    if (tokensToDelete.length === 0) {
      setStatus("No selected token to delete");
      return;
    }
    const ids = new Set(tokensToDelete.map((token) => token.id));
    setSnapshot((current) => ({ ...current, tokens: current.tokens.filter((token) => !ids.has(token.id)) }));
    if (options.recordHistory) pushBoardHistoryAction({ kind: "tokens.delete", tokens: tokensToDelete });
    clearTokenSelection();
    setStatus(options.statusLabel ?? `${formatNumber(tokensToDelete.length)} token${tokensToDelete.length === 1 ? "" : "s"} deleted`);
    enqueueBoardSync(() => deleteTokensOnServer(tokensToDelete));
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

  function boardHistoryStatus(action: BoardHistoryAction, direction: BoardHistoryDirection): string {
    if (action.kind === "tokens.move") return direction === "undo" ? "Token move undone" : "Token move redone";
    if (action.kind === "tokens.create") {
      if (direction === "undo") return action.tokens.length === 1 ? "Token creation undone" : "Token creations undone";
      return action.tokens.length === 1 ? "Token creation redone" : "Token creations redone";
    }
    if (direction === "undo") return action.tokens.length === 1 ? "Token deletion undone" : "Token deletions undone";
    return action.tokens.length === 1 ? "Token deletion redone" : "Token deletions redone";
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
    enqueueBoardSync(() => createTokensOnServer(pastedTokens));
  }

  async function setTokenTarget(tokenId: string, targeted: boolean) {
    await apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, { targeted });
    await refresh();
    setStatus(targeted ? "Token targeted" : "Token untargeted");
  }

  async function setTokenTargets(tokenIds: string[], targeted: boolean) {
    const uniqueTokenIds = [...new Set(tokenIds.filter(Boolean))];
    if (uniqueTokenIds.length === 0) {
      setStatus(targeted ? "No tokens to target" : "No targets to clear");
      return;
    }
    for (const tokenId of uniqueTokenIds) {
      await apiPost<Token>(`/api/v1/tokens/${tokenId}/target`, { targeted });
    }
    await refresh();
    setStatus(targeted ? `Targeted ${uniqueTokenIds.length} tokens` : `Cleared ${uniqueTokenIds.length} targets`);
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
    setSelectedTokenIdState(tokenId);
    setSelectedTokenIds(tokenId ? [tokenId] : []);
  }

  function selectCanvasToken(tokenId: string, options: TokenSelectionOptions = {}) {
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
  }

  function setAnnotationLayerVisible(layer: SceneAnnotationLayer, visible: boolean) {
    setVisibleAnnotationLayers((current) => ({ ...current, [layer]: visible }));
    setStatus(`${titleCaseLabel(layer)} annotations ${visible ? "shown" : "hidden"}`);
  }

  function toggleAnnotationTool(kind: ActiveAnnotationTool) {
    setFogBrushMode(null);
    const next = annotationTool === kind ? null : kind;
    setAnnotationTool(next);
    setAnnotationPanelOpen(Boolean(next && !isTransientMeasurementTool(next)));
    setStatus(next ? `${annotationToolLabel(next)} tool active` : "Annotation tool inactive");
  }

  async function createSceneAnnotation(kind: SceneAnnotationKind, points: VisionPoint[], radius?: number) {
    if (!selectedScene || points.length === 0) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations`, {
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
      expiresInSeconds: kind === "ping" ? 45 : undefined
    });
    await refresh();
    setStatus(`${annotationToolLabel(kind)} added`);
  }

  async function deleteLatestAnnotation() {
    if (!selectedScene) return;
    const annotations = selectedScene.annotations ?? [];
    const annotation = annotations.at(-1);
    if (!annotation) {
      setStatus("No annotation to delete");
      return;
    }
    await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`);
    await refresh();
    setStatus(`${annotationToolLabel(annotation.kind)} deleted`);
  }

  async function deleteAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = (selectedScene.annotations ?? []).filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    for (const annotation of annotations) {
      await apiDelete<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`);
    }
    await refresh();
    setStatus(`Deleted ${annotations.length} annotations in ${group}`);
  }

  async function nudgeAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = (selectedScene.annotations ?? []).filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    const delta = Math.max(1, selectedScene.gridSize || 25);
    for (const annotation of annotations) {
      await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, {
        points: annotation.points.map((point) => ({ x: point.x + delta, y: point.y }))
      });
    }
    await refresh();
    setStatus(`Moved ${annotations.length} annotations in ${group}`);
  }

  async function recolorAnnotationGroup(group: string) {
    if (!selectedScene) return;
    const annotations = (selectedScene.annotations ?? []).filter((annotation) => annotationGroupKey(annotation) === group);
    if (annotations.length === 0) {
      setStatus(`No annotations in ${group}`);
      return;
    }
    for (const annotation of annotations) {
      await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, { color: annotationGroupColor });
    }
    await refresh();
    setStatus(`Recolored ${annotations.length} annotations in ${group}`);
  }

  async function moveSceneAnnotation(annotation: SceneAnnotation, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    const patch: { points: VisionPoint[]; radius?: number } = { points };
    if (annotation.kind === "template" && points.length >= 2) {
      patch.radius = Math.round(distanceBetween(points[0]!, points[1]!));
    }
    await apiPatch<Scene>(`/api/v1/scenes/${selectedScene.id}/annotations/${annotation.id}`, patch);
    await refresh();
    setStatus(`Moved ${annotationToolLabel(annotation.kind)} annotation`);
  }

  async function paintFogStroke(mode: FogMode, points: VisionPoint[]) {
    if (!selectedScene || points.length === 0) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog`, {
      shape: "brush",
      mode,
      brushRadius: Math.max(28, Math.min(110, selectedScene.gridSize * 1.35)),
      points
    });
    setStatus(`${mode === "hide" ? "Hide" : "Reveal"} fog brush applied`);
    await refresh();
  }

  async function undoFog() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/fog/undo`, {});
    setStatus("Fog change undone");
    await refresh();
  }

  async function showFogHistory() {
    if (!selectedScene) return;
    const history = await apiGet<FogHistoryEntry[]>(`/api/v1/scenes/${selectedScene.id}/fog/history`);
    const recent = history.slice(-8).reverse();
    setToolReport(recent.length ? recent.map(formatFogHistoryEntry).join("\n") : "No fog history for this scene.");
    setStatus("Fog history loaded");
  }

  async function sampleVisionPoint() {
    if (!selectedScene) return;
    const fallbackPoint = selectedToken ? tokenCenter(selectedToken) : { x: selectedScene.width / 2, y: selectedScene.height / 2 };
    const point = {
      x: visionSampleX.trim() ? Number(visionSampleX) : fallbackPoint.x,
      y: visionSampleY.trim() ? Number(visionSampleY) : fallbackPoint.y
    };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > selectedScene.width || point.y > selectedScene.height) {
      setToolReport(`Point must be inside 0,0 to ${selectedScene.width},${selectedScene.height}.`);
      return;
    }
    const sample = await apiGet<VisionPointSample>(`/api/v1/scenes/${selectedScene.id}/vision/sample?x=${Math.round(point.x)}&y=${Math.round(point.y)}`);
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
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.25),
      y1: Math.round(selectedScene.height * 0.28),
      x2: Math.round(selectedScene.width * 0.75),
      y2: Math.round(selectedScene.height * 0.28),
      blocksVision: true
    });
    setStatus("Wall added");
    await refresh();
  }

  async function addTerrainWall() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/walls`, {
      x1: Math.round(selectedScene.width * 0.28),
      y1: Math.round(selectedScene.height * 0.42),
      x2: Math.round(selectedScene.width * 0.72),
      y2: Math.round(selectedScene.height * 0.42),
      blocksVision: true,
      blocksMovement: false,
      kind: "terrain"
    });
    setStatus("Terrain wall added");
    await refresh();
  }

  async function addLight() {
    if (!selectedScene) return;
    await apiPost<Scene>(`/api/v1/scenes/${selectedScene.id}/lights`, {
      x: selectedToken ? selectedToken.x + selectedToken.width / 2 : selectedScene.width / 2,
      y: selectedToken ? selectedToken.y + selectedToken.height / 2 : selectedScene.height / 2,
      radius: 210,
      brightRadius: 80,
      dimRadius: 210,
      color: "#38bdf8",
      intensity: 0.32
    });
    setStatus("Dual-zone light added");
    await refresh();
  }

  async function updateActorHp(actor: Actor, current: number) {
    const hp = actorHitPoints(actor);
    await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, {
      data: { ...actor.data, hp: { current, max: hp?.max ?? current } }
    });
    await refresh();
  }

  async function updateActorData(actor: Actor, patch: Record<string, unknown>) {
    await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, {
      data: { ...actor.data, ...patch }
    });
    setStatus(`${actor.name} sheet updated`);
    await refresh();
  }

  async function updateItemData(item: Item, patch: Record<string, unknown>) {
    await apiPatch<Item>(`/api/v1/items/${item.id}`, {
      data: { ...item.data, ...patch }
    });
    await refresh();
    setStatus(`${item.name} updated`);
  }

  async function assignItemToActor(item: Item, actor: Actor) {
    await apiPatch<Item>(`/api/v1/items/${item.id}`, { actorId: actor.id });
    setStatus(`${item.name} assigned to ${actor.name}`);
    await refresh();
  }

  async function rollDice() {
    const roll = await apiPost<{ total: number }>("/api/v1/dice/roll", {
      campaignId,
      formula: diceFormula,
      visibility: diceVisibility,
      label: "Table roll"
    });
    setStatus(`Rolled ${roll.total}`);
    await refresh();
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
    setStatus(`Template damage ${roll.total}`);
    await refresh();
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
      return true;
    }
    if (!hasPermission("token.update")) return false;
    const noteLabel = adjusted.notes.length > 0 ? ` (${adjusted.notes.join("; ")})` : "";
    const damageLabel = `${outcomeLabel ? `${outcomeLabel} - ` : ""}Damaged ${adjusted.amount}${damageType ? ` ${damageType}` : ""}${noteLabel}`;
    const nextConditions = [...(token.conditions ?? []).filter((condition) => condition.id !== slugId(damageLabel)), { id: slugId(damageLabel), name: damageLabel }];
    await apiPatch<Token>(`/api/v1/tokens/${token.id}`, { conditions: nextConditions });
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
    await refresh();
    setStatus(`Applied template damage to ${appliedCount} tokens`);
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
    await refresh();
    setStatus(`Resolved saves for ${appliedCount} tokens`);
  }

  async function saveCurrentDiceFormula() {
    const formula = diceFormula.trim();
    if (!formula) return;
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
    if (parsed.kind === "roll") {
      const roll = await apiPost<DiceRoll>("/api/v1/dice/roll", {
        campaignId,
        formula: parsed.formula,
        visibility: parsed.visibility,
        label: "Table roll"
      });
      setChatBody("");
      setChatReplyToMessageId("");
      setStatus(`Rolled ${roll.total}`);
      await refresh();
      return;
    }

    const recipientUserId = parsed.visibility === "whisper" ? resolveChatRecipient(parsed.recipientQuery) : undefined;
    if (parsed.visibility === "whisper" && !recipientUserId) {
      setStatus(parsed.recipientQuery ? `No whisper recipient matched "${parsed.recipientQuery}"` : "Use /w name message to whisper");
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

  async function createJournal() {
    const title = newJournalTitle.trim();
    await apiPost<JournalEntry>(`/api/v1/campaigns/${campaignId}/journal`, {
      title: title || "New Journal Entry",
      body: newJournalBody.trim(),
      visibility: newJournalVisibility,
      tags: newJournalTags.split(",").map((tag) => tag.trim()).filter(Boolean)
    });
    setNewJournalTitle("");
    setNewJournalBody("");
    setStatus("Journal entry created");
    await refresh();
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
    await apiPost<Combat>(`/api/v1/campaigns/${campaignId}/combats`, {
      combatants
    });
    setTab("combat");
    await refresh();
  }

  async function updateCombat(combat: Combat, patch: Partial<Combat>) {
    await apiPatch<Combat>(`/api/v1/combats/${combat.id}`, patch);
    setStatus("Combat updated");
    await refresh();
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
    await apiPatch<Combat>(`/api/v1/combats/${combat.id}/combatants/${combatantId}`, { ...patch, syncActorSheet });
    setStatus("Combatant updated");
    await refresh();
  }

  async function endCombat(combat: Combat) {
    await apiDelete<Combat>(`/api/v1/combats/${combat.id}`);
    setStatus("Combat ended");
    await refresh();
  }

  async function confirmCombatAction(combat: Combat, action: CombatAction) {
    await apiPost(`/api/v1/combats/${combat.id}/actions/${action.id}/confirm`, {});
    setStatus(`${action.actionLabel} confirmed`);
    await refresh();
  }

  async function rejectCombatAction(combat: Combat, action: CombatAction) {
    await apiPost(`/api/v1/combats/${combat.id}/actions/${action.id}/reject`, {});
    setStatus(`${action.actionLabel} rejected`);
    await refresh();
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

  async function sendAiAgentMessage() {
    const prompt = aiAgentPrompt.trim();
    if (!prompt || aiAgentBusy) return;
    const userMessage: AiAgentMessage = { id: `agent-user-${Date.now()}`, role: "user", content: prompt, createdAt: new Date().toISOString() };
    setAiAgentMessages((messages) => [...messages, userMessage]);
    setAiAgentPrompt("");
    setAiAgentBusy(true);
    setAiAgentStatus("Agent working");
    try {
      const result = await apiPost<AiAgentThreadResponse>(`/api/v1/campaigns/${campaignId}/ai/threads`, {
        prompt,
        surface: "agent_panel",
        selectedSceneId: selectedScene?.id,
        selectedTokenIds
      });
      const proposalIds = result.events.map((event) => event.proposalId).filter((proposalId): proposalId is string => Boolean(proposalId));
      const assistantMessage: AiAgentMessage = {
        id: result.thread.id,
        role: "assistant",
        content: result.assistantMessage || "Done.",
        createdAt: result.thread.updatedAt,
        proposalIds
      };
      setAiAgentMessages((messages) => [...messages, assistantMessage]);
      setAiAgentStatus(proposalIds.length > 0 ? `Agent drafted ${proposalIds.length} proposal${proposalIds.length === 1 ? "" : "s"}` : "Agent ready");
      await refresh();
    } catch (error) {
      const message = errorMessage(error);
      setAiAgentMessages((messages) => [...messages, { id: `agent-error-${Date.now()}`, role: "system", content: message, createdAt: new Date().toISOString() }]);
      setAiAgentStatus(`Agent failed: ${message}`);
    } finally {
      setAiAgentBusy(false);
    }
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
      for (const token of tokens) {
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
      }
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
    const createdSceneId = createdSceneIdFromProposal(proposal);
    await apiPost(`/api/v1/proposals/${proposal.id}/approve`, {});
    const applied = await apiPost<Proposal>(`/api/v1/proposals/${proposal.id}/apply`, {});
    const appliedSceneId = createdSceneIdFromProposal(applied) ?? createdSceneId;
    if (appliedSceneId) {
      setSceneId(appliedSceneId);
      setStatus("Proposal applied; opened new scene");
      await refresh(campaignId, appliedSceneId);
      return;
    }
    setStatus("Proposal applied");
    await refresh();
  }

  async function rejectProposalReview(proposal: Proposal) {
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

  async function advanceSelectedActor(optionId?: string) {
    if (!selectedActor) return;
    const selectedOptionId = optionId || advancementOptions[0]?.id || systemAdvancementOptionId(selectedActor.systemId);
    const advanced = await apiPost<{ advancement: { name: string } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/advance`, {
      optionId: selectedOptionId
    });
    setStatus(`${selectedActor.name} advanced to ${advanced.advancement.name}`);
    await refresh();
  }

  async function restSelectedActor(restType: "short" | "long", options: { arcaneRecovery?: Record<string, number> } = {}) {
    if (!selectedActor) return;
    const rested = await apiPost<{ rest: { summary: string } }>(`/api/v1/campaigns/${campaignId}/systems/${selectedActor.systemId}/actors/${selectedActor.id}/rest`, {
      restType,
      ...options
    });
    setStatus(rested.rest.summary);
    await refresh();
  }

  async function planSystemEncounter() {
    const system = snapshot.systems.find((item) => item.active) ?? snapshot.systems[0];
    if (!system) return;
    const threatId = systemEncounterThreatId(system.id);
    const planned = await apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${campaignId}/systems/${system.id}/encounter-plan`, {
      threats: [{ id: threatId, count: 2 }],
      createEncounter: true
    });
    setEncounterPlan(planned.plan);
    setStatus(planned.encounter ? `${planned.encounter.name} planned` : `${planned.plan.difficulty} encounter planned`);
    await refresh();
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
              <label>
                <span>MFA Code</span>
                <input aria-label="Login MFA code" inputMode="numeric" autoComplete="one-time-code" value={loginMfaCode} placeholder="Optional" onChange={(event) => setLoginMfaCode(event.target.value)} />
              </label>
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
            <button className="ghost-button wide" type="button" onClick={() => switchSession("usr_demo_gm").catch((error) => setAuthStatus(error instanceof Error ? error.message : String(error)))}>
              <Users size={16} /> Demo GM
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
          <div className="status reset-status">{authStatus}</div>
        </section>
      </main>
    );
  }

  if (!snapshotReady) {
    return (
      <main className="auth-shell">
        <section className="reset-panel auth-panel" aria-labelledby="snapshot-loading-title">
          <div className="reset-mark">
            <RefreshCw size={22} />
          </div>
          <div>
            <div className="eyebrow">Workspace</div>
            <h1 id="snapshot-loading-title">Loading campaign</h1>
          </div>
          <div className="status reset-status" role="status" aria-live="polite">{status}</div>
        </section>
      </main>
    );
  }

  const manageCategories = [
    { id: "account", label: "Account", description: "Profile, workspace, password, and MFA", icon: <UserCog size={16} />, badge: snapshot.organizations.length > 0 ? formatNumber(snapshot.organizations.length) : undefined },
    { id: "campaign", label: "Campaign", description: "Create, edit, archive, and permissions", icon: <Shield size={16} />, badge: selectedCampaign?.archivedAt ? "archived" : "active" },
    { id: "people", label: "People", description: "Invites and table joining", icon: <UserPlus size={16} />, badge: formatNumber(snapshot.organizationInvites.filter((invite) => invite.status === "pending").length) },
    { id: "scenes", label: "Scenes", description: "Scene creation, ordering, maps, and activation", icon: <MapPin size={16} />, badge: formatNumber(accessibleScenes.length) },
    { id: "archives", label: "Archives", description: "Portable exports, imports, and recovery", icon: <Download size={16} />, badge: archiveImportReport ? "ready" : undefined },
    { id: "serverAdmin", label: "Server Admin", description: "Operational admin tools", icon: <UserCog size={16} />, visible: Boolean(snapshot.session?.serverAdmin), badge: adminSnapshot ? "synced" : undefined }
  ] satisfies Array<{ id: ManageCategoryId; label: string; description: string; icon: React.ReactNode; badge?: string; visible?: boolean }>;
  const visibleManageCategories = manageCategories.filter((category) => category.visible !== false);
  const activeManageCategory = visibleManageCategories.some((category) => category.id === manageCategory) ? manageCategory : "campaign";
  const adminPanel = snapshot.session?.serverAdmin ? <AdminPanel admin={adminSnapshot} campaigns={snapshot.campaigns} systems={snapshot.systems} workspaceDefaults={snapshot.workspaceDefaults} organizationMembers={snapshot.organizationMembers} currentUserId={currentUserId} status={adminStatus} onRefresh={refreshAdmin} onDisableUser={disableAdminUser} onEnableUser={enableAdminUser} onRequireReset={requireAdminPasswordReset} onIssueReset={issueAdminPasswordReset} onRevokeUserSessions={revokeAdminUserSessions} onRevokeSession={revokeAdminSession} onRevokeRiskSessions={revokeAdminRiskSessions} onPruneExpiredPasswordResets={pruneExpiredPasswordResets} onRetryEmail={retryAdminEmail} onRetryAllEmails={retryAllAdminEmails} onRetryAiToolCall={retryAdminAiToolCall} onFailStaleAiThreads={failStaleAiThreads} onFailStaleAiToolCalls={failStaleAiToolCalls} onRejectStaleAiProposals={rejectStaleAiProposals} onCleanupStoredAssetBytes={cleanupStoredAssetBytes} onMigrateStoredAssetBytes={migrateStoredAssetBytes} onQuarantineAssetIntegrityFailures={quarantineAssetIntegrityFailures} onPurgeAssetCdnCache={purgeAssetCdnCache} onUpdatePluginReview={updatePluginReview} onSyncPluginRegistries={syncAdminPluginRegistries} onUpdateWorkspaceDefaults={updateOrganizationWorkspaceDefaults} onAddOrganizationMember={addOrganizationMember} onUpdateOrganizationMember={updateOrganizationMember} onRemoveOrganizationMember={deleteOrganizationMember} onCreateScimMapping={createScimGroupRoleMapping} onDeleteScimMapping={deleteScimGroupRoleMapping} /> : null;
  const workspaceModeOptions = [
    { id: "live", label: "Live Table", icon: <Eye size={15} /> },
    { id: "prep", label: "Prep", icon: <MapPin size={15} /> },
    { id: "ai", label: "AI Studio", icon: <Bot size={15} /> },
    { id: "manage", label: "Manage", icon: <Boxes size={15} /> }
  ] satisfies Array<{ id: WorkspaceMode; label: string; icon: React.ReactNode }>;
  const workspaceEyebrow = workspaceMode === "ai" ? "AI Studio" : workspaceMode === "prep" ? "Prep" : workspaceMode === "manage" ? "Manage" : (selectedCampaign?.defaultSystemId ?? "No system");
  const workspaceHeading = workspaceMode === "ai" ? "Build, review, and apply generated table content" : workspaceMode === "prep" ? "Prep scenes, assets, journals, and imports" : workspaceMode === "manage" ? (selectedCampaign?.name ?? "Workspace settings") : (selectedCampaign?.name ?? "Create a campaign");
  const showSceneTabs = workspaceMode !== "manage" || activeManageCategory === "scenes";
  const showScenePrepControls = workspaceMode === "prep";
  const showSceneSelectionControls = workspaceMode === "prep" || (workspaceMode === "manage" && activeManageCategory === "scenes");
  const canSelectPrepScenes = showSceneSelectionControls && hasPermission("scene.update");
  const showQuickCreate = workspaceMode === "live" || workspaceMode === "prep";
  const showTableWorkspace = workspaceMode === "live" || workspaceMode === "prep";
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
        <div>
          <div className="brand">OpenTabletop</div>
          <div className="subtle">API-first VTT engine</div>
        </div>
        <nav className="campaign-list" aria-label="Campaigns">
          {snapshot.campaigns.map((campaign) => (
            <button
              className={campaign.id === campaignId ? "nav-item active" : "nav-item"}
              key={campaign.id}
              onClick={() => {
                setCampaignId(campaign.id);
                refresh(campaign.id).catch(console.error);
              }}
            >
              <Shield size={16} />
              <span>{campaign.name}</span>
            </button>
          ))}
        </nav>
        <label className="session-switcher">
          <span>Session</span>
          <select aria-label="Session user" value={currentUserId} onChange={(event) => switchSession(event.target.value).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
            <button className={workspaceMode === mode.id ? "ghost-button active" : "ghost-button"} key={mode.id} type="button" onClick={() => setWorkspaceMode(mode.id)}>
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        <button className={aiAgentOpen ? "ai-agent-toggle active" : "ai-agent-toggle"} type="button" onClick={() => setAiAgentOpen((open) => !open)} aria-expanded={aiAgentOpen}>
          <Bot size={16} /> AI Agent
        </button>
        <section className="party-rail" aria-label="Party">
          <div className="operator-heading">
            <div className="section-title">Party</div>
            <span>{formatNumber(snapshot.actors.length)} actors</span>
          </div>
          <div className="party-list">
            {snapshot.actors.slice(0, 4).map((actor) => (
              <button
                className={actor.id === selectedActor?.id ? "party-row selected" : "party-row"}
                key={actor.id}
                type="button"
                onClick={() => {
                  const token = snapshot.tokens.find((item) => item.actorId === actor.id && item.sceneId === sceneId);
                  if (token) selectSingleToken(token.id);
                  setTab("actors");
                }}
              >
                <span className="party-avatar">{actor.name.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{actor.name}</strong>
                  <small>{stringValue(actor.data.class) || actor.systemId || "Character"}</small>
                </span>
              </button>
            ))}
            {snapshot.actors.length === 0 && <p className="account-summary">No actors yet.</p>}
          </div>
        </section>
        <section className="rail-admin" hidden={workspaceMode !== "manage"} aria-label="Manage workspace panel">
          <div className="manage-drawer-heading">
            <div>
              <div className="section-title">Manage</div>
              <strong>{selectedCampaign?.name ?? "Workspace"}</strong>
            </div>
            <button className="ghost-button manage-drawer-close" type="button" onClick={() => setWorkspaceMode("live")}>
              <X size={16} /> Close
            </button>
          </div>
          <nav className="manage-category-list" aria-label="Manage sections">
            {visibleManageCategories.map((category) => (
              <button
                className={category.id === activeManageCategory ? "manage-category-button active" : "manage-category-button"}
                key={category.id}
                type="button"
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
                    {organization.name} - {organization.role} - {organization.campaignCount} campaigns
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
        <form
          className="account-box"
          onSubmit={(event) => {
            event.preventDefault();
            createCampaignFromSetup().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="section-title">Campaign Setup</div>
          <input aria-label="Campaign name" value={newCampaignName} placeholder="Campaign name" onChange={(event) => setNewCampaignName(event.target.value)} />
          <input aria-label="Campaign description" value={newCampaignDescription} placeholder="Description" onChange={(event) => setNewCampaignDescription(event.target.value)} />
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
              <strong>{setupPreviewSceneName} - {setupSceneWidth}x{setupSceneHeight} - grid {setupSceneGridSize} - {setupPreviewFolder}</strong>
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
            <input aria-label="Edit campaign description" value={campaignEditDescription} placeholder="Description" onChange={(event) => setCampaignEditDescription(event.target.value)} />
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
        <form
          className="account-box"
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
        <button className="ghost-button" onClick={createScene} disabled={!hasPermission("scene.create")} title={hasPermission("scene.create") ? "Create scene" : "Requires scene.create"}>
          <Plus size={16} /> Scene
        </button>
        {hasPermission("scene.create") && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              createScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
            }}
          >
            <div className="section-title">Scene Setup</div>
            <input aria-label="Scene name" value={newSceneName} placeholder="Scene name" onChange={(event) => setNewSceneName(event.target.value)} />
            <input aria-label="Scene folder" value={newSceneFolder} placeholder="prep" onChange={(event) => setNewSceneFolder(event.target.value)} />
            <input aria-label="Scene width" type="number" min={200} value={newSceneWidth} onChange={(event) => setNewSceneWidth(Number(event.target.value))} />
            <input aria-label="Scene height" type="number" min={200} value={newSceneHeight} onChange={(event) => setNewSceneHeight(Number(event.target.value))} />
            <input aria-label="Scene grid size" type="number" min={10} value={newSceneGridSize} onChange={(event) => setNewSceneGridSize(Number(event.target.value))} />
            <select aria-label="Scene background asset" value={newSceneBackgroundAssetId} onChange={(event) => setNewSceneBackgroundAssetId(event.target.value)}>
              <option value="">No background</option>
              {campaignImageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <label className="inline-check">
              <input type="checkbox" checked={newSceneActive} onChange={(event) => setNewSceneActive(event.target.checked)} />
              <span>Activate for players</span>
            </label>
            <button className="ghost-button wide" type="submit">
              <Plus size={16} /> Add Scene
            </button>
          </form>
        )}
        {selectedScene && hasPermission("scene.update") && (
          <form
            className="account-box"
            onSubmit={(event) => {
              event.preventDefault();
              saveSceneSettings().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
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
            <input aria-label="Edit scene name" value={sceneEditName} onChange={(event) => setSceneEditName(event.target.value)} />
            <input aria-label="Edit scene folder" value={sceneEditFolder} placeholder="folder" onChange={(event) => setSceneEditFolder(event.target.value)} />
            <input aria-label="Edit scene width" type="number" min={200} value={sceneEditWidth} onChange={(event) => setSceneEditWidth(Number(event.target.value))} />
            <input aria-label="Edit scene height" type="number" min={200} value={sceneEditHeight} onChange={(event) => setSceneEditHeight(Number(event.target.value))} />
            <input aria-label="Edit scene grid size" type="number" min={10} value={sceneEditGridSize} onChange={(event) => setSceneEditGridSize(Number(event.target.value))} />
            <select aria-label="Edit scene background asset" value={sceneEditBackgroundAssetId} onChange={(event) => setSceneEditBackgroundAssetId(event.target.value)}>
              <option value="">No background</option>
              {campaignImageAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <label className="inline-check">
              <input type="checkbox" checked={sceneEditActive} onChange={(event) => setSceneEditActive(event.target.checked)} />
              <span>Active player scene</span>
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={sceneEditGridOverlayVisible} onChange={(event) => setSceneEditGridOverlayVisible(event.target.checked)} />
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
                <input aria-label="Confirm scene delete" value={sceneDeleteConfirm} placeholder={`Type ${selectedScene.name} to delete`} onChange={(event) => setSceneDeleteConfirm(event.target.value)} />
                <button className="ghost-button wide danger-button" type="button" disabled={sceneDeleteConfirm !== selectedScene.name} onClick={() => deleteSelectedScene().catch((error) => setStatus(error instanceof Error ? error.message : String(error)))}>
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
          <select aria-label="Archive import mode" value={archiveImportMode} onChange={(event) => setArchiveImportMode(event.target.value as ArchiveImportMode)}>
            <option value="upsert">Apply archive</option>
            <option value="reject_conflicts">Reject conflicts</option>
            <option value="skip_conflicts">Skip conflicts</option>
            <option value="dry_run">Dry run validation</option>
          </select>
          <select aria-label="Archive import scope" value={archiveImportScope} onChange={(event) => setArchiveImportScope(event.target.value as ArchiveImportScope)}>
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
                    onChange={(event) => {
                      setArchiveImportCollections((current) => {
                        const next = event.target.checked ? [...new Set([...current, option.id])] : current.filter((collection) => collection !== option.id);
                        return next.length > 0 ? next : current;
                      });
                    }}
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
          <form
            className="quick-create-form"
            hidden={!showQuickCreate}
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
          </form>
        </header>

        {showTableWorkspace ? (
        <div className={`table-grid workspace-${workspaceMode}`}>
          <section className={`table-area ${canvasAssetDragging ? "canvas-asset-dragging" : ""}`}>
            <Toolbar onSelectTool={selectCanvasTool} onCreateToken={createToken} onStartCombat={startCombat} onRevealFog={revealFog} onHideFog={hideFog} onRevealFogPolygon={revealFogPolygon} onToggleFogBrush={toggleFogBrush} onToggleAnnotationTool={toggleAnnotationTool} onDeleteLatestAnnotation={deleteLatestAnnotation} onUndoFog={undoFog} onShowFogHistory={showFogHistory} onSampleVisionPoint={sampleVisionPoint} onSaveFogPreset={saveFogPreset} onApplyFogPreset={applyFogPreset} onDeleteFogPreset={deleteFogPreset} onAddWall={addWall} onAddTerrainWall={addTerrainWall} onAddLight={addLight} canCreateToken={hasPermission("token.create")} canManageCombat={hasPermission("combat.manage")} canRevealFog={hasPermission("token.reveal")} activeFogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} activeAnnotationTool={annotationTool} hasFogPresets={snapshot.fogPresets.length > 0} canUpdateScene={hasPermission("scene.update")} canAnnotate={hasPermission("scene.read")} />
            <MapZoomControls zoom={battleMapZoom} onZoomOut={() => zoomBattleMap(-battleMapZoomStep)} onZoomIn={() => zoomBattleMap(battleMapZoomStep)} onReset={resetBattleMapZoom} />
            {selectedTokens.length > 1 && <MapSelectionStatus selectedCount={selectedTokens.length} onClear={clearTokenSelection} />}
            <MapLayerStack scene={selectedScene} tokens={snapshot.tokens} activeTokenLayer={activeTokenLayer} fogActive={Boolean(snapshot.vision?.sceneId === selectedScene?.id && snapshot.vision?.fogActive)} visibleAnnotationLayers={visibleAnnotationLayers} onSelectTokenLayer={selectTokenLayer} onToggleAnnotationLayer={setAnnotationLayerVisible} />
            {hasPermission("token.reveal") && (fogBrushMode || toolReport) && (
              <section className="table-tool-panel" aria-label="Fog and vision tools">
                <input aria-label="Fog preset name" value={fogPresetName} placeholder="Preset name" onChange={(event) => setFogPresetName(event.target.value)} />
                <select aria-label="Fog preset mode" value={fogPresetMode} onChange={(event) => setFogPresetMode(event.target.value as "replace" | "append")}>
                  <option value="replace">Replace</option>
                  <option value="append">Append</option>
                </select>
                <input aria-label="Vision sample x" value={visionSampleX} placeholder="X" onChange={(event) => setVisionSampleX(event.target.value)} />
                <input aria-label="Vision sample y" value={visionSampleY} placeholder="Y" onChange={(event) => setVisionSampleY(event.target.value)} />
                {toolReport && <pre>{toolReport}</pre>}
              </section>
            )}
            {annotationPanelOpen && !fogBrushMode && annotationTool && !isTransientMeasurementTool(annotationTool) && (
            <section className="table-tool-panel annotation-panel" aria-label="Annotation layers and history">
              <header className="annotation-panel-header">
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
            </section>
            )}
            {workspaceMode === "prep" && !fogBrushMode && tab === "content" && (
            <section className="table-tool-panel canvas-asset-dock" aria-label="Canvas asset picker">
              <details open>
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
            {selectedScene ? <SceneCanvas scene={selectedScene} zoom={battleMapZoom} backgroundAsset={selectedMapAsset} assets={snapshot.assets} tokens={snapshot.tokens} vision={snapshot.vision} selectedTokenId={selectedTokenId} selectedTokenIds={selectedTokenIds} activeTokenLayer={activeTokenLayer} fogBrushMode={hasPermission("token.reveal") ? fogBrushMode : null} annotationTool={annotationTool} templateShape={templateShape} visibleAnnotationLayers={visibleAnnotationLayers} canDropToken={hasPermission("token.create")} canUpdateAnnotations={hasPermission("scene.update")} onSelect={selectCanvasToken} onSelectMany={selectCanvasTokens} onClearSelection={clearTokenSelection} onMoved={refresh} onTokenMoveCommit={recordTokenMoveAction} onTokenDrop={createTokenFromDrop} onFogStroke={paintFogStroke} onAnnotationCreate={createSceneAnnotation} onAnnotationMove={moveSceneAnnotation} /> : <div className="empty-state">Create a scene to open the tabletop.</div>}
          </section>

          <aside className="inspector">
            <div className="tabs inspector-tabs" role="tablist" aria-label="Inspector panels">
              {inspectorTabs.includes("actors") && <TabButton active={tab === "actors"} icon={<Users size={15} />} label="Actors" onClick={() => setTab("actors")} />}
              {inspectorTabs.includes("journal") && <TabButton active={tab === "journal"} icon={<ScrollText size={15} />} label="Journal" onClick={() => setTab("journal")} />}
              {inspectorTabs.includes("chat") && <TabButton active={tab === "chat"} icon={<MessageSquare size={15} />} label="Chat" onClick={() => setTab("chat")} />}
              {inspectorTabs.includes("combat") && <TabButton active={tab === "combat"} icon={<Swords size={15} />} label="Combat" onClick={() => setTab("combat")} />}
              {inspectorTabs.includes("content") && <TabButton active={tab === "content"} icon={<Upload size={15} />} label="Content" onClick={() => setTab("content")} />}
              {inspectorTabs.includes("plugins") && <TabButton active={tab === "plugins"} icon={<Boxes size={15} />} label="SDK" onClick={() => setTab("plugins")} />}
            </div>
            {tab === "actors" && <ActorPanel campaignId={campaignId} actor={selectedActor} token={selectedToken} scene={selectedScene} currentUserId={currentUserId} actors={snapshot.actors} tokens={snapshot.tokens} combat={activeCombat} members={snapshot.members} assets={snapshot.assets} items={snapshot.items} compendiumEntries={compendiumEntries} compendiumSearch={compendiumSearch} setCompendiumSearch={setCompendiumSearch} compendiumStatus={compendiumStatus} actionTargetActorId={actorActionTargetId} setActionTargetActorId={setActorActionTargetId} actionApplyEffect={actorActionApplyEffect} setActionApplyEffect={setActorActionApplyEffect} actionConsumeResources={actorActionConsumeResources} setActionConsumeResources={setActorActionConsumeResources} updateActorHp={updateActorHp} updateActorData={updateActorData} updateItemData={updateItemData} assignItemToActor={assignItemToActor} updateToken={updateSelectedToken} onUploadTokenImage={uploadSelectedTokenImage} targetToken={setTokenTarget} targetTokens={setTokenTargets} deleteToken={deleteSelectedToken} updateTokenVision={updateSelectedTokenVision} useActorAction={useActorAction} onImportCompendiumEntry={importCompendiumEntry} onPurchaseCompendiumEntry={purchaseCompendiumEntry} canCreateToken={hasPermission("token.create")} canUpdateActor={canUpdateSelectedActor} canUpdateToken={hasPermission("token.update")} canDeleteToken={hasPermission("token.delete")} canUseAction={canUpdateSelectedActor && hasPermission("dice.roll")} />}
            {tab === "journal" && <JournalPanel journals={snapshot.journals} title={newJournalTitle} setTitle={setNewJournalTitle} body={newJournalBody} setBody={setNewJournalBody} visibility={newJournalVisibility} setVisibility={setNewJournalVisibility} tags={newJournalTags} setTags={setNewJournalTags} onCreate={createJournal} canCreate={hasPermission("journal.create")} />}
            {tab === "chat" && <ChatPanel command={chatBody} setCommand={setChatBody} replyTarget={chatReplyTarget} messages={snapshot.chat} rolls={snapshot.rolls} members={snapshot.members} search={chatSearch} setSearch={setChatSearch} typeFilter={chatTypeFilter} setTypeFilter={setChatTypeFilter} visibilityFilter={chatVisibilityFilter} setVisibilityFilter={setChatVisibilityFilter} canModerate={hasPermission("chat.moderate")} onSubmitCommand={submitChatCommand} onClearReply={() => setChatReplyToMessageId("")} onReplyMessage={setChatReplyToMessageId} onModerateMessage={moderateChatMessage} onDeleteMessage={deleteChatMessage} onExport={exportChatHistory} />}
            {tab === "combat" && <CombatPanel combat={activeCombat} recentCombats={recentEndedCombats} auditLogs={snapshot.combatAudit} onStart={startCombat} onNext={(combat) => advanceCombatTurn(combat, 1)} onPrevious={(combat) => advanceCombatTurn(combat, -1)} onEnd={endCombat} onUpdateCombatant={updateCombatant} onConfirmAction={confirmCombatAction} onRejectAction={rejectCombatAction} canManage={hasPermission("combat.manage")} />}
            {tab === "content" && <ContentImportPanel assets={snapshot.assets} assetStorage={snapshot.assetStorage} selectedScene={selectedScene} assetSearch={assetSearch} setAssetSearch={setAssetSearch} assetFolder={assetFolder} setAssetFolder={setAssetFolder} assetTags={assetTags} setAssetTags={setAssetTags} assetStatus={assetStatus} failedAssetUpload={failedAssetUpload} onRetryFailedAssetUpload={retryAssetUpload} onDismissFailedAssetUpload={dismissFailedAssetUpload} lifecycleReason={assetLifecycleReason} setLifecycleReason={setAssetLifecycleReason} onUploadAsset={uploadAssetToLibrary} onSetSceneBackground={setSceneBackgroundFromAsset} onPlaceAssetToken={createTokenFromAsset} onUpdateAssetMetadata={updateAssetMetadata} onUpdateAssetLifecycle={updateAssetLifecycle} onCreateAssetDeliveryUrl={createAssetDeliveryUrl} imports={snapshot.contentImports} kind={contentImportKind} setKind={setContentImportKind} name={contentImportName} setName={setContentImportName} body={contentImportBody} setBody={setContentImportBody} status={contentImportStatus} onPreview={previewContentImport} onApply={applyContentImport} onRollback={rollbackContentImport} onDelete={deleteContentImport} canManage={hasPermission("campaign.update")} canCreateAsset={hasPermission("scene.create")} canUpdateScene={hasPermission("scene.update")} canCreateToken={hasPermission("token.create")} />}
            {tab === "plugins" && <SdkPanel plugins={snapshot.plugins} systems={snapshot.systems} characterTemplates={snapshot.characterTemplates} actor={selectedActor} advancementOptions={advancementOptions} importedActor={importedActor} createdMonster={createdMonster} onSyncPluginRegistries={syncPluginRegistries} onInstallPlugin={installPlugin} onInstallSystem={installSystem} onCreateCharacter={createCharacterFromTemplate} onImportCharacter={importSystemCharacter} onCreateMonster={createSystemMonster} onAdvanceActor={advanceSelectedActor} onRestActor={restSelectedActor} onRunCommand={runPluginCommand} onSystemRoll={rollSystemCheck} canInstall={hasPermission("plugin.install")} canInstallSystem={hasPermission("campaign.update")} canCreateActor={hasPermission("actor.create")} canImportActor={hasPermission("actor.create")} canAdvanceActor={canUpdateSelectedActor} canRestActor={canUpdateSelectedActor} canRollSystem={hasPermission("dice.roll")} />}
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
          proposals={snapshot.proposals}
          canApply={hasPermission("ai.applyChanges")}
          onPromptChange={setAiAgentPrompt}
          onSend={() => sendAiAgentMessage().catch((error) => setAiAgentStatus(errorMessage(error)))}
          onClose={() => setAiAgentOpen(false)}
          onApply={(proposal) => approveAndApply(proposal).catch((error) => setAiAgentStatus(errorMessage(error)))}
          onReject={(proposal) => rejectProposalReview(proposal).catch((error) => setAiAgentStatus(errorMessage(error)))}
        />
      )}
    </main>
  );
}

function AiAgentPanel(props: {
  messages: AiAgentMessage[];
  prompt: string;
  status: string;
  busy: boolean;
  proposals: Proposal[];
  canApply: boolean;
  onPromptChange(value: string): void;
  onSend(): void;
  onClose(): void;
  onApply(proposal: Proposal): void;
  onReject(proposal: Proposal): void;
}) {
  const proposalIds = new Set(props.messages.flatMap((message) => message.proposalIds ?? []));
  const agentProposals = props.proposals
    .filter((proposal) => proposalIds.has(proposal.id) || (proposal.createdByType === "ai" && (proposal.status === "pending" || proposal.status === "approved")))
    .sort((left, right) => proposalStatusSort(left.status) - proposalStatusSort(right.status) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);
  return (
    <aside className="ai-agent-popout" aria-label="AI Agent">
      <header className="ai-agent-header">
        <div>
          <span className="section-title">AI Agent</span>
          <strong>{props.status}</strong>
        </div>
        <button className="icon-button" type="button" aria-label="Close AI Agent" title="Close" onClick={props.onClose}>
          <X size={17} />
        </button>
      </header>
      <section className="ai-agent-messages" aria-label="AI Agent messages">
        {props.messages.length === 0 ? (
          <div className="empty-state compact">Ask for table prep, board edits, proposal review, or rules-supported actions.</div>
        ) : (
          props.messages.map((message) => (
            <article className={`ai-agent-message ${message.role}`} key={message.id}>
              <span>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</span>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </section>
      {agentProposals.length > 0 && (
        <section className="ai-agent-proposals" aria-label="AI Agent proposals">
          {agentProposals.map((proposal) => (
            <div className="ai-agent-proposal-row" key={proposal.id}>
              <span className={`status-pill ${proposal.status}`}>{proposal.status}</span>
              <strong>{proposal.title}</strong>
              <small>{formatNumber(proposal.changesJson.length)} changes</small>
              {(proposal.status === "pending" || proposal.status === "approved") && (
                <div>
                  <button className="ghost-button" type="button" disabled={!props.canApply} onClick={() => props.onApply(proposal)}>
                    <Check size={14} /> Apply
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
      <form
        className="ai-agent-composer"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <textarea aria-label="AI Agent prompt" value={props.prompt} placeholder="Ask the agent..." onChange={(event) => props.onPromptChange(event.target.value)} disabled={props.busy} />
        <button className="primary-button" type="submit" disabled={props.busy || !props.prompt.trim()}>
          <Send size={16} /> Send
        </button>
      </form>
    </aside>
  );
}

interface FogStrokeDraft {
  pointerId: number;
  mode: FogMode;
  points: VisionPoint[];
}

interface AnnotationDraft {
  pointerId: number;
  kind: ActiveAnnotationTool;
  points: VisionPoint[];
}

interface AnnotationMoveDraft {
  annotationId: string;
  pointerId: number;
  mode: "move" | "point";
  pointIndex?: number;
  start: VisionPoint;
  originalPoints: VisionPoint[];
  points: VisionPoint[];
  current: VisionPoint;
}

interface TokenDragDraft {
  tokenId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  origins: Record<string, TokenDragOrigin>;
  settling?: boolean;
}

interface TokenDragOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionBoxDraft {
  pointerId: number;
  start: VisionPoint;
  current: VisionPoint;
  additive: boolean;
  moved: boolean;
}

interface MapPanDraft {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
  clearSelectionOnClick: boolean;
}

interface TokenSelectionOptions {
  additive?: boolean;
  preserveExisting?: boolean;
}

type TokenPositionOverrides = Record<string, Pick<Token, "x" | "y">>;

interface TokenDropPayload {
  type: "actor" | "asset";
  id: string;
  name: string;
  actorId?: string;
  imageAssetId?: string;
  disposition?: Token["disposition"];
  layer?: TokenLayer;
}

const tokenLayers: Array<{ id: TokenLayer; label: string; description: string }> = [
  { id: "map", label: "Map & Background", description: "Scene props and map dressing below playable tokens." },
  { id: "player", label: "Player Objects & Tokens", description: "Player-visible, selectable combat and interaction tokens." },
  { id: "gm", label: "GM Info Overlay", description: "GM-only tokens and notes hidden from players." }
];
const tokenLayerRanks: Record<TokenLayer, number> = { map: 0, player: 1, gm: 2 };
const tokenVisualScale = 0.78;
const largeTokenVisualScale = 0.9;
const battleMapZoomMin = 0.5;
const battleMapZoomMax = 2;
const battleMapZoomStep = 0.25;
const tokenDropMime = "application/x-open-tabletop-token";
const itemDropMime = "application/x-open-tabletop-item";

function clampSceneCoordinate(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampBattleMapZoom(value: number): number {
  return Math.max(battleMapZoomMin, Math.min(battleMapZoomMax, Number(value.toFixed(2))));
}

function formatBattleMapZoom(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function tokenLayer(token?: Pick<Token, "layer">): TokenLayer {
  return token?.layer === "map" || token?.layer === "gm" || token?.layer === "player" ? token.layer : "player";
}

function tokenLayerLabel(layer: TokenLayer): string {
  return tokenLayers.find((item) => item.id === layer)?.label ?? "Player Objects & Tokens";
}

function MapLayerStack(props: { scene?: Scene; tokens: Token[]; activeTokenLayer: TokenLayer; fogActive: boolean; visibleAnnotationLayers: Record<SceneAnnotationLayer, boolean>; onSelectTokenLayer(layer: TokenLayer): void; onToggleAnnotationLayer(layer: SceneAnnotationLayer, visible: boolean): void }) {
  const sceneTokens = props.scene ? props.tokens.filter((token) => token.sceneId === props.scene!.id) : [];
  const layerCounts = tokenLayers.reduce<Record<TokenLayer, number>>((counts, layer) => {
    counts[layer.id] = sceneTokens.filter((token) => tokenLayer(token) === layer.id).length;
    return counts;
  }, { map: 0, player: 0, gm: 0 });
  const annotationCount = props.scene?.annotations?.length ?? 0;
  const visibleAnnotationCount = annotationLayers.filter((layer) => props.visibleAnnotationLayers[layer]).length;
  return (
    <aside className="map-layer-stack" aria-label="Map layer stack">
      <div className="map-layer-stack-heading">
        <span>Layers</span>
        <strong>{props.scene?.name ?? "No scene"}</strong>
      </div>
      <div className="map-layer-row">
        <span>Map</span>
        <strong>{props.scene?.backgroundAssetId ? "background" : "empty"}</strong>
      </div>
      {tokenLayers.map((layer) => (
        <button className={`map-layer-row map-layer-button ${props.activeTokenLayer === layer.id ? "active" : ""}`} type="button" aria-pressed={props.activeTokenLayer === layer.id} title={layer.description} key={layer.id} onClick={() => props.onSelectTokenLayer(layer.id)}>
          <span>{layer.label}</span>
          <strong>{formatNumber(layerCounts[layer.id])}</strong>
        </button>
      ))}
      <details className="map-layer-row map-layer-details">
        <summary>
          <span>Annotations</span>
          <strong>{formatNumber(annotationCount)} / {formatNumber(visibleAnnotationCount)} shown</strong>
        </summary>
        <div className="map-layer-toggles">
          {annotationLayers.map((layer) => (
            <label className="inline-check" key={layer}>
              <input type="checkbox" checked={props.visibleAnnotationLayers[layer]} onChange={(event) => props.onToggleAnnotationLayer(layer, event.target.checked)} />
              <span>{titleCaseLabel(layer)}</span>
            </label>
          ))}
        </div>
      </details>
      <div className="map-layer-row">
        <span>Fog</span>
        <strong>{props.fogActive ? "active" : "off"}</strong>
      </div>
    </aside>
  );
}

function snapTokenAxisToGrid(position: number, size: number, sceneSize: number, gridSize: number): number {
  const safeSize = Math.max(1, Math.round(size) || 1);
  const safeGridSize = Math.max(1, Math.round(gridSize) || 1);
  const maxPosition = Math.max(0, sceneSize - safeSize);
  const gridCells = Math.max(1, Math.round(safeSize / safeGridSize));
  const isGridSized = Math.abs(safeSize - gridCells * safeGridSize) <= 1;
  if (isGridSized) {
    return clampSceneCoordinate(Math.round(position / safeGridSize) * safeGridSize, 0, maxPosition);
  }
  const center = position + safeSize / 2;
  const firstCenter = safeSize / 2;
  const lastCenter = Math.max(firstCenter, sceneSize - safeSize / 2);
  const snappedCenter = Math.round((center - safeGridSize / 2) / safeGridSize) * safeGridSize + safeGridSize / 2;
  return Math.round(clampSceneCoordinate(snappedCenter, firstCenter, lastCenter) - safeSize / 2);
}

function boundedTokenCoordinates(scene: Pick<Scene, "width" | "height">, token: Pick<Token, "width" | "height">, x: number, y: number): Pick<Token, "x" | "y"> {
  const width = Math.max(1, Math.round(token.width) || 1);
  const height = Math.max(1, Math.round(token.height) || 1);
  return {
    x: clampSceneCoordinate(Math.round(x), 0, Math.max(0, scene.width - width)),
    y: clampSceneCoordinate(Math.round(y), 0, Math.max(0, scene.height - height))
  };
}

function snappedTokenCoordinates(scene: Pick<Scene, "width" | "height" | "gridSize">, token: Pick<Token, "width" | "height">, x: number, y: number): Pick<Token, "x" | "y"> {
  return boundedTokenCoordinates(
    scene,
    token,
    snapTokenAxisToGrid(x, token.width, scene.width, scene.gridSize),
    snapTokenAxisToGrid(y, token.height, scene.height, scene.gridSize)
  );
}

function tokenCoordinatesFromCenter(scene: Pick<Scene, "width" | "height" | "gridSize">, width: number, height: number, centerX: number, centerY: number): Pick<Token, "x" | "y"> {
  return snappedTokenCoordinates(scene, { width, height }, centerX - width / 2, centerY - height / 2);
}

function selectionBoxRect(draft: SelectionBoxDraft): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
  const left = Math.min(draft.start.x, draft.current.x);
  const top = Math.min(draft.start.y, draft.current.y);
  const right = Math.max(draft.start.x, draft.current.x);
  const bottom = Math.max(draft.start.y, draft.current.y);
  return { left, top, width: right - left, height: bottom - top, right, bottom };
}

function tokenIntersectsRect(token: Pick<Token, "x" | "y" | "width" | "height">, rect: ReturnType<typeof selectionBoxRect>): boolean {
  return token.x < rect.right && token.x + token.width > rect.left && token.y < rect.bottom && token.y + token.height > rect.top;
}

function tokenVisualScaleFor(token: Pick<Token, "width" | "height">, gridSize: number): number {
  const largestSideInCells = Math.max(token.width, token.height) / Math.max(1, gridSize);
  return largestSideInCells > 1.1 ? largeTokenVisualScale : tokenVisualScale;
}

function writeTokenDropData(dataTransfer: DataTransfer, payload: TokenDropPayload): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(tokenDropMime, JSON.stringify(payload));
  dataTransfer.setData("text/plain", payload.name);
}

function setTokenDropPreview(dataTransfer: DataTransfer, label: string, imageUrl?: string): void {
  const preview = document.createElement("div");
  preview.className = "token-drag-preview";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    preview.appendChild(image);
  }
  const text = document.createElement("span");
  text.textContent = label;
  preview.appendChild(text);
  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, 42, 42);
  window.setTimeout(() => preview.remove(), 0);
}

function readTokenDropData(dataTransfer: DataTransfer): TokenDropPayload | undefined {
  const raw = dataTransfer.getData(tokenDropMime);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<TokenDropPayload>;
    if ((parsed.type !== "actor" && parsed.type !== "asset") || typeof parsed.id !== "string" || typeof parsed.name !== "string") return undefined;
    return {
      type: parsed.type,
      id: parsed.id,
      name: parsed.name,
      actorId: typeof parsed.actorId === "string" ? parsed.actorId : undefined,
      imageAssetId: typeof parsed.imageAssetId === "string" ? parsed.imageAssetId : undefined,
      layer: parsed.layer === "map" || parsed.layer === "player" || parsed.layer === "gm" ? parsed.layer : undefined,
      disposition: parsed.disposition === "friendly" || parsed.disposition === "neutral" || parsed.disposition === "hostile" ? parsed.disposition : undefined
    };
  } catch {
    return undefined;
  }
}

function hasTokenDropData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(tokenDropMime);
}

function writeItemDropData(dataTransfer: DataTransfer, item: Item): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(itemDropMime, item.id);
  dataTransfer.setData("text/plain", item.name);
  setTokenDropPreview(dataTransfer, item.name);
}

function readItemDropData(dataTransfer: DataTransfer): string | undefined {
  const itemId = dataTransfer.getData(itemDropMime);
  return itemId || undefined;
}

function hasItemDropData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(itemDropMime);
}

function SceneCanvas(props: { scene: Scene; zoom: number; backgroundAsset?: MapAsset; assets: MapAsset[]; tokens: Token[]; vision?: VisionSnapshot; selectedTokenId: string; selectedTokenIds: string[]; activeTokenLayer: TokenLayer; fogBrushMode: FogMode | null; annotationTool: AnnotationTool; templateShape: SceneTemplateShape; visibleAnnotationLayers: Record<SceneAnnotationLayer, boolean>; canDropToken: boolean; canUpdateAnnotations: boolean; onSelect(id: string, options?: TokenSelectionOptions): void; onSelectMany(ids: string[], options?: TokenSelectionOptions): void; onClearSelection(): void; onMoved(): Promise<void>; onTokenMoveCommit(changes: BoardTokenPositionChange[]): void; onTokenDrop(payload: TokenDropPayload, point: VisionPoint): Promise<void>; onFogStroke(mode: FogMode, points: VisionPoint[]): Promise<void>; onAnnotationCreate(kind: SceneAnnotationKind, points: VisionPoint[], radius?: number): Promise<void>; onAnnotationMove(annotation: SceneAnnotation, points: VisionPoint[]): Promise<void> }) {
  const [tokenDrag, setTokenDrag] = useState<TokenDragDraft | null>(null);
  const [tokenPositionOverrides, setTokenPositionOverrides] = useState<TokenPositionOverrides>({});
  const [dropActive, setDropActive] = useState(false);
  const [mapPanning, setMapPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxDraft | null>(null);
  const [fogStroke, setFogStroke] = useState<FogStrokeDraft | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null);
  const [annotationMoveDraft, setAnnotationMoveDraft] = useState<AnnotationMoveDraft | null>(null);
  const tokenDragRef = useRef<TokenDragDraft | null>(null);
  const pointerSelectedTokenRef = useRef<string | null>(null);
  const mapPanRef = useRef<MapPanDraft | null>(null);
  const selectionBoxRef = useRef<SelectionBoxDraft | null>(null);
  const fogStrokeRef = useRef<FogStrokeDraft | null>(null);
  const annotationDraftRef = useRef<AnnotationDraft | null>(null);
  const annotationMoveDraftRef = useRef<AnnotationMoveDraft | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => props.tokens.filter((token) => token.sceneId === props.scene.id), [props.tokens, props.scene.id]);
  const activeLayerTokenIds = useMemo(() => new Set(tokens.filter((token) => tokenLayer(token) === props.activeTokenLayer).map((token) => token.id)), [tokens, props.activeTokenLayer]);
  const orderedTokens = useMemo(
    () =>
      tokens
        .map((token, index) => ({ token, index }))
        .sort((left, right) => tokenLayerRanks[tokenLayer(left.token)] - tokenLayerRanks[tokenLayer(right.token)] || left.index - right.index)
        .map(({ token }) => token),
    [tokens]
  );
  const orderedActiveLayerTokens = useMemo(() => orderedTokens.filter((token) => activeLayerTokenIds.has(token.id)), [orderedTokens, activeLayerTokenIds]);
  const selectedTokenIdSet = useMemo(() => new Set(props.selectedTokenIds), [props.selectedTokenIds]);
  const tokenImageAssets = useMemo(() => new Map(props.assets.filter(isUsableImageAsset).map((asset) => [asset.id, asset])), [props.assets]);
  const visibleAnnotations = useMemo(() => (props.scene.annotations ?? []).filter((annotation) => props.visibleAnnotationLayers[annotation.layer ?? defaultAnnotationLayer(annotation.kind)] !== false), [props.scene.annotations, props.visibleAnnotationLayers]);
  const displayAnnotations = useMemo(
    () => visibleAnnotations.map((annotation) => (annotationMoveDraft?.annotationId === annotation.id ? { ...annotation, points: annotationMoveDraft.points } : annotation)),
    [visibleAnnotations, annotationMoveDraft]
  );
  const vision = props.vision?.sceneId === props.scene.id ? props.vision : undefined;
  const lightPolygons = useMemo(() => vision?.polygons.filter((polygon) => polygon.source === "light" && polygon.points.length > 2) ?? [], [vision]);
  const revealedPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source !== "light" && polygon.mode !== "hide" && polygon.points.length > 2) : []), [vision]);
  const hiddenPolygons = useMemo(() => (vision?.fogActive ? vision.polygons.filter((polygon) => polygon.source === "fog" && polygon.mode === "hide" && polygon.points.length > 2) : []), [vision]);
  const maskId = `vision-mask-${props.scene.id}`;
  const boardStyle = {
    aspectRatio: `${props.scene.width} / ${props.scene.height}`,
    "--scene-aspect": String(props.scene.width / props.scene.height),
    "--map-zoom": String(props.zoom)
  } as CSSProperties;
  const showGridOverlay = sceneGridOverlayVisible(props.scene);

  useEffect(() => {
    setTokenPositionOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const [tokenId, override] of Object.entries(current)) {
        const token = tokens.find((item) => item.id === tokenId);
        if (!token || (token.x === override.x && token.y === override.y)) {
          delete next[tokenId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [tokens]);

  function boardPoint(clientX: number, clientY: number, options: { clamp?: boolean } = {}): VisionPoint | undefined {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return scenePointFromClient(rect, props.scene, clientX, clientY, options);
  }

  function annotationDraftPoint(kind: ActiveAnnotationTool, clientX: number, clientY: number): VisionPoint | undefined {
    return boardPoint(clientX, clientY, { clamp: !isDistanceMeasurementTool(kind) && kind !== "template" });
  }

  function isClientPointInsideBoard(clientX: number, clientY: number): boolean {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function startMapPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (props.fogBrushMode || props.annotationTool || (event.button !== 0 && event.button !== 1)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    mapPanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false,
      clearSelectionOnClick: !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.button === 0
    };
    setMapPanning(true);
    tokenDragRef.current = null;
    setTokenDrag(null);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMapPan(clientX: number, clientY: number, pointerId: number): boolean {
    const current = mapPanRef.current;
    const viewport = viewportRef.current;
    if (!current || current.pointerId !== pointerId || !viewport) return false;
    const deltaX = clientX - current.startClientX;
    const deltaY = clientY - current.startClientY;
    viewport.scrollLeft = current.startScrollLeft - deltaX;
    viewport.scrollTop = current.startScrollTop - deltaY;
    if (!current.moved && Math.hypot(deltaX, deltaY) > 4) {
      mapPanRef.current = { ...current, moved: true };
    }
    return true;
  }

  function finishMapPan(pointerId: number): boolean {
    const current = mapPanRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    mapPanRef.current = null;
    setMapPanning(false);
    if (!current.moved && current.clearSelectionOnClick) props.onClearSelection();
    return true;
  }

  function cancelMapPan(pointerId: number) {
    if (mapPanRef.current?.pointerId !== pointerId) return;
    mapPanRef.current = null;
    setMapPanning(false);
  }

  function startSelectionBox(event: ReactPointerEvent<HTMLDivElement>, point: VisionPoint) {
    if (event.button !== 0) return;
    const next = {
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false
    };
    selectionBoxRef.current = next;
    setSelectionBox(next);
    tokenDragRef.current = null;
    setTokenDrag(null);
    mapPanRef.current = null;
    setMapPanning(false);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSelectionBox(clientX: number, clientY: number, pointerId: number): boolean {
    const current = selectionBoxRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    const point = boardPoint(clientX, clientY);
    if (!point) return true;
    const moved = current.moved || Math.hypot(point.x - current.start.x, point.y - current.start.y) > Math.max(4, props.scene.gridSize / 8);
    const next = { ...current, current: point, moved };
    selectionBoxRef.current = next;
    setSelectionBox(next);
    return true;
  }

  function finishSelectionBox(pointerId: number): boolean {
    const current = selectionBoxRef.current;
    if (!current || current.pointerId !== pointerId) return false;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    if (!current.moved) {
      if (!current.additive) props.onClearSelection();
      return true;
    }
    const rect = selectionBoxRect(current);
    const selectedIds = orderedActiveLayerTokens.filter((token) => tokenIntersectsRect(token, rect)).map((token) => token.id);
    props.onSelectMany(selectedIds, { additive: current.additive });
    return true;
  }

  function cancelSelectionBox(pointerId: number) {
    if (selectionBoxRef.current?.pointerId !== pointerId) return;
    selectionBoxRef.current = null;
    setSelectionBox(null);
  }

  function boundedTokenPosition(token: Token, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    return boundedTokenCoordinates(props.scene, token, x, y);
  }

  function snappedTokenPosition(token: Token, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    return snappedTokenCoordinates(props.scene, token, x, y);
  }

  function renderedTokenPosition(token: Token): Pick<TokenDragDraft, "x" | "y"> {
    return tokenPositionOverrides[token.id] ?? { x: token.x, y: token.y };
  }

  function tokenPositionFromPointer(token: Token, clientX: number, clientY: number, offsetX: number, offsetY: number): Pick<TokenDragDraft, "x" | "y"> | undefined {
    const point = boardPoint(clientX, clientY);
    if (!point) return undefined;
    return boundedTokenPosition(token, point.x - offsetX, point.y - offsetY);
  }

  function constrainedTokenDragPosition(draft: TokenDragDraft, x: number, y: number): Pick<TokenDragDraft, "x" | "y"> {
    let minDeltaX = Number.NEGATIVE_INFINITY;
    let maxDeltaX = Number.POSITIVE_INFINITY;
    let minDeltaY = Number.NEGATIVE_INFINITY;
    let maxDeltaY = Number.POSITIVE_INFINITY;
    for (const origin of Object.values(draft.origins)) {
      minDeltaX = Math.max(minDeltaX, -origin.x);
      maxDeltaX = Math.min(maxDeltaX, props.scene.width - (origin.x + origin.width));
      minDeltaY = Math.max(minDeltaY, -origin.y);
      maxDeltaY = Math.min(maxDeltaY, props.scene.height - (origin.y + origin.height));
    }
    const deltaX = clampSceneCoordinate(x - draft.startX, minDeltaX, maxDeltaX);
    const deltaY = clampSceneCoordinate(y - draft.startY, minDeltaY, maxDeltaY);
    return { x: Math.round(draft.startX + deltaX), y: Math.round(draft.startY + deltaY) };
  }

  function startTokenDrag(token: Token, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!activeLayerTokenIds.has(token.id)) return;
    const point = boardPoint(event.clientX, event.clientY);
    if (!point) return;
    const renderedPosition = renderedTokenPosition(token);
    const start = boundedTokenPosition(token, renderedPosition.x, renderedPosition.y);
    const groupTokenIds =
      selectedTokenIdSet.has(token.id) && props.selectedTokenIds.length > 1 && !event.shiftKey && !event.ctrlKey && !event.metaKey
          ? props.selectedTokenIds.filter((id) => activeLayerTokenIds.has(id))
          : [token.id];
    const origins = Object.fromEntries(
      tokens
        .filter((item) => groupTokenIds.includes(item.id))
        .map((item) => {
          const position = renderedTokenPosition(item);
          return [item.id, { x: position.x, y: position.y, width: item.width, height: item.height }];
        })
    ) as Record<string, TokenDragOrigin>;
    const next = {
      tokenId: token.id,
      pointerId: event.pointerId,
      offsetX: point.x - start.x,
      offsetY: point.y - start.y,
      startX: start.x,
      startY: start.y,
      x: start.x,
      y: start.y,
      origins
    };
    tokenDragRef.current = next;
    setTokenDrag(next);
    pointerSelectedTokenRef.current = token.id;
    props.onSelect(token.id, {
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      preserveExisting: selectedTokenIdSet.has(token.id) && props.selectedTokenIds.length > 1
    });
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTokenDrag(clientX: number, clientY: number, pointerId: number) {
    const current = tokenDragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const token = tokens.find((item) => item.id === current.tokenId);
    if (!token) return;
    const position = tokenPositionFromPointer(token, clientX, clientY, current.offsetX, current.offsetY);
    if (!position) return;
    const constrained = constrainedTokenDragPosition(current, position.x, position.y);
    if (current.x === constrained.x && current.y === constrained.y) return;
    const next = { ...current, ...constrained };
    tokenDragRef.current = next;
    setTokenDrag(next);
  }

  function cancelTokenDrag(pointerId: number) {
    if (tokenDragRef.current?.pointerId !== pointerId) return;
    tokenDragRef.current = null;
    setTokenDrag(null);
  }

  function finishTokenDrag(pointerId: number) {
    const current = tokenDragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const token = tokens.find((item) => item.id === current.tokenId);
    if (!token) {
      tokenDragRef.current = null;
      setTokenDrag(null);
      return;
    }
    const snapped = snappedTokenPosition(token, current.x, current.y);
    const deltaX = snapped.x - current.startX;
    const deltaY = snapped.y - current.startY;
    const movedTokens = Object.entries(current.origins)
      .flatMap(([tokenId, origin]) => {
        const movedToken = tokens.find((item) => item.id === tokenId);
        if (!movedToken) return [];
        const next = snappedTokenCoordinates(props.scene, movedToken, origin.x + deltaX, origin.y + deltaY);
        return [{ token: movedToken, position: next }];
      })
      .filter(({ token: movedToken, position }) => movedToken.x !== position.x || movedToken.y !== position.y);
    tokenDragRef.current = null;
    setTokenDrag(null);
    if (movedTokens.length === 0) {
      return;
    }
    setTokenPositionOverrides((overrides) => ({
      ...overrides,
      ...Object.fromEntries(movedTokens.map(({ token: movedToken, position }) => [movedToken.id, position]))
    }));
    Promise.all(movedTokens.map(({ token: movedToken, position }) => apiPatch<Token>(`/api/v1/tokens/${movedToken.id}`, position)))
      .then(() => {
        props.onTokenMoveCommit(
          movedTokens.map(({ token: movedToken, position }) => ({
            tokenId: movedToken.id,
            before: { x: movedToken.x, y: movedToken.y },
            after: position
          }))
        );
        return props.onMoved();
      })
      .catch((error) => {
        console.error(error);
        setTokenPositionOverrides((overrides) => {
          const next = { ...overrides };
          for (const { token: movedToken } of movedTokens) delete next[movedToken.id];
          return next;
        });
      });
  }

  function appendFogStrokePoint(clientX: number, clientY: number, pointerId: number) {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const next = { ...current, points: appendStrokePoint(current.points, point, props.scene.gridSize) };
    fogStrokeRef.current = next;
    setFogStroke(next);
  }

  function finishFogStroke(pointerId: number, clientX: number, clientY: number) {
    const current = fogStrokeRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = boardPoint(clientX, clientY);
    const points = point ? appendStrokePoint(current.points, point, props.scene.gridSize) : current.points;
    fogStrokeRef.current = null;
    setFogStroke(null);
    props.onFogStroke(current.mode, points).catch(console.error);
  }

  function appendAnnotationDraftPoint(clientX: number, clientY: number, pointerId: number) {
    const current = annotationDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = annotationDraftPoint(current.kind, clientX, clientY);
    if (!point) return;
    const points = current.kind === "drawing" ? appendStrokePoint(current.points, point, props.scene.gridSize) : [current.points[0]!, point];
    const next = { ...current, points };
    annotationDraftRef.current = next;
    setAnnotationDraft(next);
  }

  function finishAnnotationDraft(pointerId: number, clientX: number, clientY: number) {
    const current = annotationDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = annotationDraftPoint(current.kind, clientX, clientY);
    const points = point ? (current.kind === "drawing" ? appendStrokePoint(current.points, point, props.scene.gridSize) : [current.points[0]!, point]) : current.points;
    annotationDraftRef.current = null;
    setAnnotationDraft(null);
    if (isTransientMeasurementTool(current.kind)) return;
    const radius = current.kind === "template" && points.length >= 2 ? Math.round(Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y)) : undefined;
    props.onAnnotationCreate(current.kind, points, radius).catch(console.error);
  }

  function editedAnnotationPoints(draft: AnnotationMoveDraft, point: VisionPoint): VisionPoint[] {
    if (draft.mode === "point" && draft.pointIndex !== undefined) {
      return draft.originalPoints.map((annotationPoint, index) =>
        index === draft.pointIndex
          ? { x: Math.max(0, Math.min(props.scene.width, point.x)), y: Math.max(0, Math.min(props.scene.height, point.y)) }
          : annotationPoint
      );
    }
    const deltaX = point.x - draft.start.x;
    const deltaY = point.y - draft.start.y;
    return draft.originalPoints.map((annotationPoint) => ({
      x: Math.max(0, Math.min(props.scene.width, Math.round(annotationPoint.x + deltaX))),
      y: Math.max(0, Math.min(props.scene.height, Math.round(annotationPoint.y + deltaY)))
    }));
  }

  function startAnnotationMove(annotation: SceneAnnotation, clientX: number, clientY: number, pointerId: number, mode: AnnotationMoveDraft["mode"], pointIndex?: number) {
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const next = { annotationId: annotation.id, pointerId, mode, pointIndex, start: point, current: point, originalPoints: annotation.points, points: annotation.points };
    annotationMoveDraftRef.current = next;
    setAnnotationMoveDraft(next);
  }

  function moveAnnotationDraft(clientX: number, clientY: number, pointerId: number) {
    const current = annotationMoveDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const point = boardPoint(clientX, clientY);
    if (!point) return;
    const next = { ...current, current: point, points: editedAnnotationPoints(current, point) };
    annotationMoveDraftRef.current = next;
    setAnnotationMoveDraft(next);
  }

  function finishAnnotationMove(pointerId: number) {
    const current = annotationMoveDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    annotationMoveDraftRef.current = null;
    setAnnotationMoveDraft(null);
    const annotation = visibleAnnotations.find((item) => item.id === current.annotationId);
    if (!annotation) return;
    props.onAnnotationMove(annotation, current.points).catch(console.error);
  }

  return (
    <div ref={viewportRef} className={`scene-viewport ${mapPanning ? "panning" : ""}`} role="region" aria-label={`${props.scene.name} battle map viewport`}>
      <div
        ref={boardRef}
        data-agent-board-root="true"
        data-scene-id={props.scene.id}
        className={`scene-board ${props.fogBrushMode || props.annotationTool ? "brush-mode" : ""} ${tokenDrag && !tokenDrag.settling ? "token-drag-active" : ""} ${selectionBox ? "token-selecting" : ""} ${dropActive ? "drop-active" : ""} ${mapPanning ? "map-panning" : ""}`}
        style={boardStyle}
      onDragEnter={(event) => {
        if (!props.canDropToken || props.fogBrushMode || props.annotationTool || !hasTokenDropData(event.dataTransfer)) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragOver={(event) => {
        if (!props.canDropToken || props.fogBrushMode || props.annotationTool || !hasTokenDropData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (isClientPointInsideBoard(event.clientX, event.clientY)) return;
        setDropActive(false);
      }}
      onDrop={(event) => {
        setDropActive(false);
        if (!props.canDropToken || props.fogBrushMode || props.annotationTool) return;
        const payload = readTokenDropData(event.dataTransfer);
        const point = boardPoint(event.clientX, event.clientY);
        if (!payload || !point) return;
        event.preventDefault();
        props.onTokenDrop(payload, point).catch(console.error);
      }}
      onPointerDown={(event) => {
        const point = boardPoint(event.clientX, event.clientY);
        if (!point) return;
        if (!props.fogBrushMode && !props.annotationTool && (event.altKey || event.button === 1)) {
          startMapPan(event);
          return;
        }
        if (props.annotationTool) {
          event.currentTarget.setPointerCapture(event.pointerId);
          tokenDragRef.current = null;
          setTokenDrag(null);
          if (props.annotationTool === "ping") {
            props.onAnnotationCreate("ping", [point]).catch(console.error);
            return;
          }
          const next = { pointerId: event.pointerId, kind: props.annotationTool, points: [point] };
          annotationDraftRef.current = next;
          setAnnotationDraft(next);
          return;
        }
        if (!props.fogBrushMode) {
          startSelectionBox(event, point);
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        tokenDragRef.current = null;
        setTokenDrag(null);
        const next = { pointerId: event.pointerId, mode: props.fogBrushMode, points: [point] };
        fogStrokeRef.current = next;
        setFogStroke(next);
      }}
      onPointerMove={(event) => {
        if (moveSelectionBox(event.clientX, event.clientY, event.pointerId)) return;
        if (moveMapPan(event.clientX, event.clientY, event.pointerId)) return;
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          appendAnnotationDraftPoint(event.clientX, event.clientY, event.pointerId);
          return;
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          appendFogStrokePoint(event.clientX, event.clientY, event.pointerId);
          return;
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          moveAnnotationDraft(event.clientX, event.clientY, event.pointerId);
          return;
        }
        moveTokenDrag(event.clientX, event.clientY, event.pointerId);
      }}
      onPointerUp={(event) => {
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          finishAnnotationDraft(event.pointerId, event.clientX, event.clientY);
          return;
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          finishFogStroke(event.pointerId, event.clientX, event.clientY);
          return;
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          finishAnnotationMove(event.pointerId);
          return;
        }
        if (finishSelectionBox(event.pointerId)) return;
        if (finishMapPan(event.pointerId)) return;
        finishTokenDrag(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (annotationDraftRef.current?.pointerId === event.pointerId) {
          annotationDraftRef.current = null;
          setAnnotationDraft(null);
        }
        if (fogStrokeRef.current?.pointerId === event.pointerId) {
          fogStrokeRef.current = null;
          setFogStroke(null);
        }
        if (annotationMoveDraftRef.current?.pointerId === event.pointerId) {
          annotationMoveDraftRef.current = null;
          setAnnotationMoveDraft(null);
        }
        cancelSelectionBox(event.pointerId);
        cancelMapPan(event.pointerId);
        cancelTokenDrag(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        cancelSelectionBox(event.pointerId);
        cancelMapPan(event.pointerId);
      }}
    >
      {props.backgroundAsset && <img className="scene-map" src={assetBlobUrl(props.backgroundAsset)} alt="" draggable={false} />}
      {showGridOverlay && (
        <div
          className="grid-lines"
          style={{
            backgroundSize: `${(props.scene.gridSize / props.scene.width) * 100}% ${(props.scene.gridSize / props.scene.height) * 100}%`
          }}
        />
      )}
      {props.scene.lights.map((light) => (
        <div
          className="light-source"
          key={light.id}
          style={{
            left: `${(light.x / props.scene.width) * 100}%`,
            top: `${(light.y / props.scene.height) * 100}%`,
            width: `${(light.radius / props.scene.width) * 200}%`,
            background: `radial-gradient(circle, ${light.color} 0%, ${light.color} 22%, transparent 72%)`,
            opacity: light.intensity ?? 0.18,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />
      ))}
      {lightPolygons.length > 0 && (
        <svg className="lighting-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          {lightPolygons.map((polygon) => (
            <polygon key={polygon.id} className={lightPolygonClassName(polygon)} points={polygonPoints(polygon)} style={{ fill: polygon.color ?? "#facc15", opacity: polygon.opacity ?? 0.22 }} />
          ))}
        </svg>
      )}
      {props.scene.walls.map((wall) => (
        <svg className={`wall-layer ${wall.kind ?? "wall"}`} key={wall.id} viewBox={`0 0 ${props.scene.width} ${props.scene.height}`}>
          <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} />
        </svg>
      ))}
      {displayAnnotations.length > 0 && (
        <svg className="annotation-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-label="Scene annotations">
          {displayAnnotations.map((annotation) => (
            <SceneAnnotationShape key={annotation.id} annotation={annotation} scene={props.scene} />
          ))}
        </svg>
      )}
      {props.canUpdateAnnotations && !props.fogBrushMode && !props.annotationTool && displayAnnotations.length > 0 && (
        <div className="annotation-handles" aria-label="Annotation drag handles">
          {displayAnnotations.flatMap((annotation) =>
            annotationEditHandles(annotation).map((handle) => (
              <button
                key={`${annotation.id}-${handle.id}`}
                className={`annotation-drag-handle ${handle.mode === "point" ? "annotation-point-handle" : "annotation-move-handle"}`}
                type="button"
                style={{ left: `${(handle.point.x / props.scene.width) * 100}%`, top: `${(handle.point.y / props.scene.height) * 100}%` }}
                aria-label={`${handle.label} ${annotationToolLabel(annotation.kind)} annotation in ${annotationGroupKey(annotation)}`}
                title={`${handle.label} ${annotationToolLabel(annotation.kind)} annotation`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  tokenDragRef.current = null;
                  setTokenDrag(null);
                  startAnnotationMove(annotation, event.clientX, event.clientY, event.pointerId, handle.mode, handle.pointIndex);
                }}
                onPointerMove={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  moveAnnotationDraft(event.clientX, event.clientY, event.pointerId);
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  finishAnnotationMove(event.pointerId);
                }}
                onPointerCancel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  annotationMoveDraftRef.current = null;
                  setAnnotationMoveDraft(null);
                }}
              />
            ))
          )}
        </div>
      )}
      {vision?.fogActive && (
        <svg className="vision-mask-layer" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width={props.scene.width} height={props.scene.height} fill="white" />
              {revealedPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="black" />
              ))}
              {hiddenPolygons.map((polygon) => (
                <polygon key={polygon.id} points={polygonPoints(polygon)} fill="white" />
              ))}
            </mask>
          </defs>
          <rect className="vision-dim" width={props.scene.width} height={props.scene.height} mask={`url(#${maskId})`} />
          {revealedPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className={visionPolygonClassName(polygon)} points={polygonPoints(polygon)} />
          ))}
          {hiddenPolygons.map((polygon) => (
            <polygon key={`${polygon.id}-outline`} className="vision-outline hide" points={polygonPoints(polygon)} />
          ))}
        </svg>
      )}
      {fogStroke && (
        <svg className="fog-brush-preview" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <polyline className={fogStroke.mode} points={fogStroke.points.map((point) => `${point.x},${point.y}`).join(" ")} />
        </svg>
      )}
      {annotationDraft && (
        <svg className="annotation-layer draft" viewBox={`0 0 ${props.scene.width} ${props.scene.height}`} aria-hidden="true">
          <SceneAnnotationShape annotation={draftAnnotation(annotationDraft, props.templateShape)} scene={props.scene} />
        </svg>
      )}
      {selectionBox && (() => {
        const rect = selectionBoxRect(selectionBox);
        return (
          <div
            className="token-selection-box"
            aria-hidden="true"
            style={{
              left: `${(rect.left / props.scene.width) * 100}%`,
              top: `${(rect.top / props.scene.height) * 100}%`,
              width: `${(rect.width / props.scene.width) * 100}%`,
              height: `${(rect.height / props.scene.height) * 100}%`
            }}
          />
        );
      })()}
      {orderedTokens.map((token) => {
        const dragOrigin = tokenDrag?.origins[token.id];
        const dragPosition = tokenDrag && dragOrigin ? { x: dragOrigin.x + tokenDrag.x - tokenDrag.startX, y: dragOrigin.y + tokenDrag.y - tokenDrag.startY } : undefined;
        const positionOverride = tokenPositionOverrides[token.id];
        const tokenX = dragPosition?.x ?? positionOverride?.x ?? token.x;
        const tokenY = dragPosition?.y ?? positionOverride?.y ?? token.y;
        const visualScale = tokenVisualScaleFor(token, props.scene.gridSize);
        const visualWidth = token.width * visualScale;
        const visualHeight = token.height * visualScale;
        const visualX = tokenX + (token.width - visualWidth) / 2;
        const visualY = tokenY + (token.height - visualHeight) / 2;
        const tokenImageAsset = token.imageAssetId ? tokenImageAssets.get(token.imageAssetId) : undefined;
        const selected = selectedTokenIdSet.has(token.id);
        const layer = tokenLayer(token);
        const activeLayerToken = activeLayerTokenIds.has(token.id);
        return (
          <button
            key={token.id}
            className={`token layer-${layer} ${activeLayerToken ? "active-layer" : "inactive-layer"} ${token.disposition} ${tokenImageAsset ? "has-image" : ""} ${selected ? "selected" : ""} ${props.selectedTokenId === token.id ? "primary-selected" : ""} ${token.targetedByUserIds?.length ? "targeted" : ""} ${token.auras?.length ? "has-aura" : ""} ${dragPosition ? "dragging" : ""}`}
            style={{
              left: `${(visualX / props.scene.width) * 100}%`,
              top: `${(visualY / props.scene.height) * 100}%`,
              width: `${(visualWidth / props.scene.width) * 100}%`,
              height: `${(visualHeight / props.scene.height) * 100}%`
            }}
            aria-label={`${tokenLayerLabel(layer)} token ${token.name}`}
            aria-pressed={selected}
            onClick={(event) => {
              if (!activeLayerToken) return;
              if (pointerSelectedTokenRef.current === token.id) {
                pointerSelectedTokenRef.current = null;
                return;
              }
              props.onSelect(token.id, { additive: event.shiftKey || event.ctrlKey || event.metaKey, preserveExisting: selected && props.selectedTokenIds.length > 1 });
            }}
            onPointerDown={(event) => {
              if (!activeLayerToken) return;
              if (props.fogBrushMode || props.annotationTool) return;
              startTokenDrag(token, event);
            }}
            onPointerMove={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              moveTokenDrag(event.clientX, event.clientY, event.pointerId);
            }}
            onPointerUp={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              finishTokenDrag(event.pointerId);
            }}
            onPointerCancel={(event) => {
              if (tokenDragRef.current?.tokenId !== token.id || tokenDragRef.current.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              cancelTokenDrag(event.pointerId);
            }}
            onLostPointerCapture={(event) => {
              if (tokenDragRef.current?.tokenId === token.id && tokenDragRef.current.pointerId === event.pointerId) cancelTokenDrag(event.pointerId);
            }}
          >
            {tokenImageAsset && <img className="token-image" src={assetBlobUrl(tokenImageAsset)} alt="" draggable={false} />}
            <span className="token-label">{token.name.slice(0, 2).toUpperCase()}</span>
            {token.conditions?.length ? <small className="token-condition-count">{token.conditions.length}</small> : null}
            {token.auras?.length ? <small className="token-aura-count">{token.auras.length}</small> : null}
          </button>
        );
      })}
      </div>
    </div>
  );
}

function SceneAnnotationShape(props: { annotation: SceneAnnotation; scene: Scene }) {
  const annotation = props.annotation;
  const [first, second] = annotation.points;
  if (!first) return null;
  const color = annotation.color || annotationColor(annotation.kind);
  if (annotation.kind === "ping") {
    return (
      <g className="scene-annotation ping" style={{ color }}>
        <circle cx={first.x} cy={first.y} r={18} />
        <line x1={first.x - 28} y1={first.y} x2={first.x - 8} y2={first.y} />
        <line x1={first.x + 8} y1={first.y} x2={first.x + 28} y2={first.y} />
        <line x1={first.x} y1={first.y - 28} x2={first.x} y2={first.y - 8} />
        <line x1={first.x} y1={first.y + 8} x2={first.x} y2={first.y + 28} />
      </g>
    );
  }
  if (annotation.kind === "template") {
    const shape = annotation.templateShape ?? "circle";
    const label = annotationLabel(annotation, props.scene);
    if (shape === "line" && second) {
      const width = Math.max(12, props.scene.gridSize);
      return (
        <g className="scene-annotation template line-template" style={{ color }}>
          <line className="template-area" x1={first.x} y1={first.y} x2={second.x} y2={second.y} strokeWidth={width} />
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
          <circle cx={first.x} cy={first.y} r={6} />
          <circle cx={second.x} cy={second.y} r={6} />
          <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{label}</text>
        </g>
      );
    }
    if (shape === "cone" && second) {
      const conePoints = templateConePoints(annotation);
      return (
        <g className="scene-annotation template cone-template" style={{ color }}>
          {conePoints && <polygon points={conePoints} />}
          <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
          <circle cx={first.x} cy={first.y} r={6} />
          <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{label}</text>
        </g>
      );
    }
    return (
      <g className="scene-annotation template" style={{ color }}>
        <circle cx={first.x} cy={first.y} r={annotation.radius ?? 0} />
        {second && <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />}
        <text x={first.x + 8} y={first.y - 8}>{label}</text>
      </g>
    );
  }
  if (annotation.kind === "drawing") {
    return (
      <g className="scene-annotation drawing" style={{ color }}>
        <polyline points={annotation.points.map((point) => `${point.x},${point.y}`).join(" ")} />
      </g>
    );
  }
  if (!second) return null;
  return (
    <g className="scene-annotation ruler" style={{ color }}>
      <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
      <circle cx={first.x} cy={first.y} r={6} />
      <circle cx={second.x} cy={second.y} r={6} />
      <text x={(first.x + second.x) / 2 + 8} y={(first.y + second.y) / 2 - 8}>{annotationLabel(annotation, props.scene)}</text>
    </g>
  );
}

function annotationHandlePoint(annotation: SceneAnnotation): VisionPoint | undefined {
  if (annotation.points.length === 0) return undefined;
  const total = annotation.points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  return {
    x: Math.round(total.x / annotation.points.length),
    y: Math.round(total.y / annotation.points.length)
  };
}

function annotationEditHandles(annotation: SceneAnnotation): Array<{ id: string; label: string; mode: AnnotationMoveDraft["mode"]; point: VisionPoint; pointIndex?: number }> {
  const movePoint = annotationHandlePoint(annotation);
  const handles: Array<{ id: string; label: string; mode: AnnotationMoveDraft["mode"]; point: VisionPoint; pointIndex?: number }> = movePoint ? [{ id: "move", label: "Move", mode: "move", point: movePoint }] : [];
  if ((annotation.kind === "ruler" || annotation.kind === "template") && annotation.points.length >= 2) {
    handles.push(
      { id: "start", label: "Edit start", mode: "point", pointIndex: 0, point: annotation.points[0]! },
      { id: "end", label: "Edit end", mode: "point", pointIndex: 1, point: annotation.points[1]! }
    );
  }
  if (annotation.kind === "drawing" && annotation.points.length >= 2) {
    const endIndex = annotation.points.length - 1;
    const middleIndex = Math.floor(endIndex / 2);
    handles.push(
      { id: "path-start", label: "Edit path start", mode: "point", pointIndex: 0, point: annotation.points[0]! },
      ...(middleIndex > 0 && middleIndex < endIndex ? [{ id: "path-middle", label: "Edit path middle", mode: "point" as const, pointIndex: middleIndex, point: annotation.points[middleIndex]! }] : []),
      { id: "path-end", label: "Edit path end", mode: "point", pointIndex: endIndex, point: annotation.points[endIndex]! }
    );
  }
  return handles;
}

const feetPerGridSquare = 5;

function isDistanceMeasurementTool(kind: ActiveAnnotationTool): kind is "ruler" | MeasurementTool {
  return kind === "ruler" || kind === "measure-circle" || kind === "measure-cone";
}

function isTransientMeasurementTool(kind: ActiveAnnotationTool): kind is "ruler" | MeasurementTool {
  return isDistanceMeasurementTool(kind);
}

function draftAnnotationKind(kind: ActiveAnnotationTool): SceneAnnotationKind {
  if (kind === "measure-circle" || kind === "measure-cone") return "template";
  return kind;
}

function draftTemplateShape(kind: ActiveAnnotationTool, templateShape: SceneTemplateShape): SceneTemplateShape | undefined {
  if (kind === "measure-circle") return "circle";
  if (kind === "measure-cone") return "cone";
  return kind === "template" ? templateShape : undefined;
}

function formatFeet(distancePx: number, scene: Scene): string {
  const feet = (distancePx / Math.max(scene.gridSize, 1)) * feetPerGridSquare;
  const rounded = Math.round(feet * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ft`;
}

function draftAnnotation(draft: AnnotationDraft, templateShape: SceneTemplateShape): SceneAnnotation {
  const kind = draftAnnotationKind(draft.kind);
  const resolvedTemplateShape = draftTemplateShape(draft.kind, templateShape);
  return {
    id: "draft",
    sceneId: "draft",
    kind,
    createdByUserId: "draft",
    color: annotationColor(kind),
    label: annotationToolLabel(draft.kind),
    templateShape: resolvedTemplateShape,
    points: draft.points,
    radius: kind === "template" && draft.points.length >= 2 ? Math.round(Math.hypot(draft.points[1]!.x - draft.points[0]!.x, draft.points[1]!.y - draft.points[0]!.y)) : undefined,
    createdAt: "",
    updatedAt: ""
  };
}

function annotationLabel(annotation: SceneAnnotation, scene: Scene): string {
  if (annotation.kind === "ruler" && annotation.points.length >= 2) {
    return formatFeet(distanceBetween(annotation.points[0]!, annotation.points[1]!), scene);
  }
  if (annotation.kind === "template") return `${titleCaseLabel(annotation.templateShape ?? "circle")} ${formatFeet(annotation.radius ?? 0, scene)}`;
  return annotation.label ?? annotationToolLabel(annotation.kind);
}

function annotationGroupKey(annotation: SceneAnnotation): string {
  return annotation.groupLabel ?? annotation.groupId ?? "Ungrouped";
}


function annotationToolLabel(kind: ActiveAnnotationTool): string {
  if (kind === "ping") return "Ping";
  if (kind === "ruler") return "Ruler";
  if (kind === "measure-circle") return "Circle measure";
  if (kind === "measure-cone") return "Cone measure";
  if (kind === "template") return "Template";
  return "Drawing";
}

function defaultAnnotationLayer(kind: SceneAnnotationKind): SceneAnnotationLayer {
  if (kind === "template") return "effects";
  if (kind === "drawing") return "drawings";
  return "measurement";
}

function annotationColor(kind: SceneAnnotationKind): string {
  if (kind === "ping") return "#facc15";
  if (kind === "ruler") return "#38bdf8";
  if (kind === "template") return "#fb7185";
  return "#a78bfa";
}

function distanceBetween(left: VisionPoint, right: VisionPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function appendStrokePoint(points: VisionPoint[], point: VisionPoint, gridSize: number): VisionPoint[] {
  const previous = points.at(-1);
  if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < Math.max(6, gridSize / 8)) return points;
  return [...points, point];
}

function polygonPoints(polygon: VisionPolygon): string {
  return polygon.points.map((point) => `${point.x},${point.y}`).join(" ");
}

function visionPolygonClassName(polygon: VisionPolygon): string {
  return ["vision-outline", polygon.source, polygon.lightLevel].filter(Boolean).join(" ");
}

function lightPolygonClassName(polygon: VisionPolygon): string {
  return ["light-polygon", polygon.lightLevel].filter(Boolean).join(" ");
}

function tokenCenter(token: Token): { x: number; y: number } {
  return { x: token.x + token.width / 2, y: token.y + token.height / 2 };
}

function MapZoomControls(props: { zoom: number; onZoomOut(): void; onZoomIn(): void; onReset(): void }) {
  const atMinimum = props.zoom <= battleMapZoomMin;
  const atMaximum = props.zoom >= battleMapZoomMax;
  return (
    <div className="map-zoom-control" role="group" aria-label="Battle map zoom controls">
      <button className="tool" type="button" title="Zoom battle map out" aria-label="Zoom battle map out" onClick={props.onZoomOut} disabled={atMinimum}>
        <ZoomOut size={17} />
      </button>
      <span className="map-zoom-value" aria-live="polite">
        {formatBattleMapZoom(props.zoom)}
      </span>
      <button className="tool" type="button" title="Reset battle map zoom" aria-label={`Reset battle map zoom from ${formatBattleMapZoom(props.zoom)}`} onClick={props.onReset}>
        <RefreshCw size={16} />
      </button>
      <button className="tool" type="button" title="Zoom battle map in" aria-label="Zoom battle map in" onClick={props.onZoomIn} disabled={atMaximum}>
        <ZoomIn size={17} />
      </button>
    </div>
  );
}

function MapSelectionStatus(props: { selectedCount: number; onClear(): void }) {
  return (
    <div className="map-selection-status" role="status" aria-label="Selected tokens">
      <span>{formatNumber(props.selectedCount)} selected</span>
      <button className="tool" type="button" title="Clear token selection" aria-label="Clear token selection" onClick={props.onClear}>
        <X size={16} />
      </button>
    </div>
  );
}

function Toolbar(props: { onSelectTool(): void; onCreateToken(): void; onStartCombat(): void; onRevealFog(): void; onHideFog(): void; onRevealFogPolygon(): void; onToggleFogBrush(mode: FogMode): void; onToggleAnnotationTool(kind: ActiveAnnotationTool): void; onDeleteLatestAnnotation(): void; onUndoFog(): void; onShowFogHistory(): void; onSampleVisionPoint(): void; onSaveFogPreset(): void; onApplyFogPreset(): void; onDeleteFogPreset(): void; onAddWall(): void; onAddTerrainWall(): void; onAddLight(): void; canCreateToken: boolean; canManageCombat: boolean; canRevealFog: boolean; activeFogBrushMode: FogMode | null; activeAnnotationTool: AnnotationTool; hasFogPresets: boolean; canUpdateScene: boolean; canAnnotate: boolean }) {
  return (
    <div className="toolbar">
      <button className={`tool ${props.activeFogBrushMode || props.activeAnnotationTool ? "" : "active"}`} title="Select" aria-label="Select" onClick={props.onSelectTool}>
        <Hand size={17} />
      </button>
      <button className="tool" title="Token" aria-label="Add token" tabIndex={1} autoFocus onClick={props.onCreateToken} disabled={!props.canCreateToken}>
        <Plus size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "ruler" ? "active" : ""}`} title="Ruler" aria-label="Ruler" onClick={() => props.onToggleAnnotationTool("ruler")} disabled={!props.canAnnotate}>
        <Ruler size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "measure-circle" ? "active" : ""}`} title="Measure circle" aria-label="Measure circle" onClick={() => props.onToggleAnnotationTool("measure-circle")} disabled={!props.canAnnotate}>
        <Circle size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "measure-cone" ? "active" : ""}`} title="Measure cone" aria-label="Measure cone" onClick={() => props.onToggleAnnotationTool("measure-cone")} disabled={!props.canAnnotate}>
        <Triangle size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "ping" ? "active" : ""}`} title="Ping" aria-label="Ping" onClick={() => props.onToggleAnnotationTool("ping")} disabled={!props.canAnnotate}>
        <MapPin size={17} />
      </button>
      <button className="tool" title="Reveal fog" aria-label="Reveal fog" onClick={props.onRevealFog} disabled={!props.canRevealFog}>
        <Eye size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "drawing" ? "active" : ""}`} title="Drawing" aria-label="Drawing" onClick={() => props.onToggleAnnotationTool("drawing")} disabled={!props.canUpdateScene}>
        <PencilLine size={17} />
      </button>
      <button className={`tool ${props.activeAnnotationTool === "template" ? "active" : ""}`} title="Area template" aria-label="Area template" onClick={() => props.onToggleAnnotationTool("template")} disabled={!props.canUpdateScene}>
        <Circle size={17} />
      </button>
      <button className="tool" title="Delete latest annotation" aria-label="Delete latest annotation" onClick={props.onDeleteLatestAnnotation} disabled={!props.canUpdateScene}>
        <X size={17} />
      </button>
      <details className="tool-more">
        <summary className="tool" title="More tools" aria-label="More tools">
          <Boxes size={17} />
        </summary>
        <div className="tool-more-panel" aria-label="Advanced table tools">
          <button className="ghost-button" type="button" onClick={props.onStartCombat} disabled={!props.canManageCombat}>
            <Swords size={15} /> Combat
          </button>
          <button className="ghost-button" type="button" onClick={props.onRevealFog} disabled={!props.canRevealFog}>
            <Eye size={15} /> Reveal fog
          </button>
          <button className="ghost-button" type="button" onClick={props.onHideFog} disabled={!props.canRevealFog}>
            <Eraser size={15} /> Hide fog
          </button>
          <button className="ghost-button" type="button" onClick={props.onRevealFogPolygon} disabled={!props.canRevealFog}>
            <Pentagon size={15} /> Polygon fog
          </button>
          <button className={`ghost-button ${props.activeFogBrushMode === "reveal" ? "active" : ""}`} type="button" onClick={() => props.onToggleFogBrush("reveal")} disabled={!props.canRevealFog}>
            <Paintbrush size={15} /> Reveal brush
          </button>
          <button className={`ghost-button ${props.activeFogBrushMode === "hide" ? "active" : ""}`} type="button" onClick={() => props.onToggleFogBrush("hide")} disabled={!props.canRevealFog}>
            <Eraser size={15} /> Hide brush
          </button>
          <button className="ghost-button" type="button" onClick={props.onUndoFog} disabled={!props.canRevealFog}>
            <RotateCcw size={15} /> Undo fog
          </button>
          <button className="ghost-button" type="button" onClick={props.onShowFogHistory} disabled={!props.canRevealFog}>
            <ScrollText size={15} /> Fog history
          </button>
          <button className="ghost-button" type="button" onClick={props.onSampleVisionPoint} disabled={!props.canRevealFog}>
            <Crosshair size={15} /> Sample vision
          </button>
          <button className="ghost-button" type="button" onClick={props.onSaveFogPreset} disabled={!props.canRevealFog}>
            <Download size={15} /> Save preset
          </button>
          <button className="ghost-button" type="button" onClick={props.onApplyFogPreset} disabled={!props.canRevealFog || !props.hasFogPresets}>
            <Upload size={15} /> Apply preset
          </button>
          <button className="ghost-button" type="button" onClick={props.onDeleteFogPreset} disabled={!props.canRevealFog || !props.hasFogPresets}>
            <UserX size={15} /> Delete preset
          </button>
          <button className="ghost-button" type="button" onClick={props.onAddWall} disabled={!props.canUpdateScene}>
            <BrickWall size={15} /> Wall
          </button>
          <button className="ghost-button" type="button" onClick={props.onAddTerrainWall} disabled={!props.canUpdateScene}>
            <BrickWall size={15} /> Terrain
          </button>
          <button className="ghost-button" type="button" onClick={props.onAddLight} disabled={!props.canUpdateScene}>
            <Lightbulb size={15} /> Light
          </button>
          <button className={`ghost-button ${props.activeAnnotationTool === "ping" ? "active" : ""}`} type="button" onClick={() => props.onToggleAnnotationTool("ping")} disabled={!props.canAnnotate}>
            <MapPin size={15} /> Ping
          </button>
          <button className={`ghost-button ${props.activeAnnotationTool === "measure-circle" ? "active" : ""}`} type="button" onClick={() => props.onToggleAnnotationTool("measure-circle")} disabled={!props.canAnnotate}>
            <Circle size={15} /> Measure circle
          </button>
          <button className={`ghost-button ${props.activeAnnotationTool === "measure-cone" ? "active" : ""}`} type="button" onClick={() => props.onToggleAnnotationTool("measure-cone")} disabled={!props.canAnnotate}>
            <Triangle size={15} /> Measure cone
          </button>
          <button className={`ghost-button ${props.activeAnnotationTool === "template" ? "active" : ""}`} type="button" onClick={() => props.onToggleAnnotationTool("template")} disabled={!props.canUpdateScene}>
            <Circle size={15} /> Template
          </button>
          <button className="ghost-button danger-button" type="button" onClick={props.onDeleteLatestAnnotation} disabled={!props.canUpdateScene}>
            <X size={15} /> Delete mark
          </button>
        </div>
      </details>
    </div>
  );
}

function TabButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick(): void }) {
  return (
    <button className={props.active ? "tab active" : "tab"} type="button" title={props.label} onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

function systemRollId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "aptitude-tech";
  if (systemId === "mystic-noir") return "skill-investigation";
  if (systemId === "dnd-5e-srd") return "ability-strength";
  return "ability-charisma";
}

function systemRollLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Tech Check";
  if (systemId === "mystic-noir") return "Investigation Check";
  if (systemId === "dnd-5e-srd") return "Strength Check";
  return "Charisma Check";
}

function systemAdvancementOptionId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "rank-up";
  if (systemId === "mystic-noir") return "case-breakthrough";
  return "level-up";
}

function systemAdvancementLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Advance Rank";
  if (systemId === "mystic-noir") return "Case Breakthrough";
  return "Level Up";
}

function systemEncounterThreatId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "void-raider";
  if (systemId === "mystic-noir") return "masked-agent";
  if (systemId === "dnd-5e-srd") return "goblin-minion";
  return "skeletal-guard";
}

function systemImportPayload(systemId: string, ownerUserId: string): Record<string, unknown> {
  if (systemId === "dnd-5e-srd") {
    return {
      name: "Imported Cleric",
      ownerUserId,
      data: {
        level: 3,
        class: "Cleric",
        species: "Human",
        background: "Sage",
        hp: { current: 16, max: 21 },
        attributes: { strength: 10, dexterity: 12, constitution: 14, intelligence: 12, wisdom: 16, charisma: 10 },
        features: ["Spellcasting"],
        conditions: ["blessed"],
        items: ["healing-word", "cure-wounds", "longsword"]
      }
    };
  }
  if (systemId === "stellar-frontiers") {
    return {
      name: "Imported Ace",
      ownerUserId,
      data: {
        rank: 4,
        background: "Corsair Defector",
        aptitudes: { combat: 3, tech: 2, pilot: 4, science: 1, charm: 1 },
        strain: { current: 5, max: 8 },
        milestones: ["Defected at Dawn"],
        conditions: ["locked-in"],
        items: ["laser-carbine", "overclock"]
      }
    };
  }
  if (systemId === "mystic-noir") {
    return {
      name: "Imported Investigator",
      ownerUserId,
      data: {
        rank: 3,
        archetype: "Occult Scholar",
        skills: { investigation: 2, resolve: 3, influence: 1, stealth: 1, occult: 4 },
        composure: { current: 4, max: 7 },
        breakthroughs: ["Solved the First Case"],
        conditions: ["focused"],
        items: ["case-notebook", "warding-rite", "marked"]
      }
    };
  }
  return {
    name: "Imported Mender",
    ownerUserId,
    data: {
      level: 3,
      class: "Mender",
      hp: { current: 14, max: 18 },
      attributes: { strength: 8, dexterity: 12, constitution: 13, intelligence: 13, wisdom: 16, charisma: 14 },
      features: ["Field Prayer"],
      conditions: ["blessed"],
      items: ["healing-word", "longsword"]
    }
  };
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

function actorHitPoints(actor?: Actor): { current: number; max: number } | undefined {
  const hp = recordValue(actor?.data.hp);
  const current = Number(hp.current);
  const max = Number(hp.max ?? hp.current);
  return Number.isFinite(current) && Number.isFinite(max) ? { current, max } : undefined;
}

function damageTraitValues(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => damageTraitValues(item));
  const record = recordValue(value);
  return Object.entries(record)
    .filter(([, enabled]) => enabled === true || enabled === "true")
    .map(([key]) => key.toLocaleLowerCase());
}

function actorDamageTraitValues(actor: Actor | undefined, keys: string[]): string[] {
  if (!actor) return [];
  return keys.flatMap((key) => damageTraitValues(actor.data[key]));
}

function damageTraitMatches(values: string[], damageType: string): boolean {
  return values.some((value) => value === damageType || value === "all" || value === "all damage");
}

function targetConditionLabels(actor: Actor | undefined, token: Token): string[] {
  return [...(token.conditions?.map((condition) => condition.name) ?? []), ...(actor ? actorConditionLabels(actor) : [])].map((condition) => condition.toLocaleLowerCase());
}

function conditionMentionsDamageTrait(labels: string[], trait: "resistant" | "immune" | "vulnerable", damageType: string): boolean {
  return labels.some((label) => label.includes(`${trait} ${damageType}`) || label.includes(`${damageType} ${trait}`));
}

function hasConcentrationCue(labels: string[]): boolean {
  return labels.some((label) => label === "concentration" || label === "concentrating" || label.includes(" concentration"));
}

function adjustedTemplateDamage(actor: Actor | undefined, token: Token, amount: number, damageType: string | undefined): { amount: number; notes: string[] } {
  const type = damageType?.trim().toLocaleLowerCase();
  const labels = targetConditionLabels(actor, token);
  let adjusted = Math.max(0, amount);
  const notes: string[] = [];
  if (type) {
    const immune =
      damageTraitMatches(actorDamageTraitValues(actor, ["immunities", "damageImmunities", "damageImmunity"]), type) ||
      conditionMentionsDamageTrait(labels, "immune", type);
    const resistant =
      damageTraitMatches(actorDamageTraitValues(actor, ["resistances", "damageResistances", "damageResistance"]), type) ||
      conditionMentionsDamageTrait(labels, "resistant", type);
    const vulnerable =
      damageTraitMatches(actorDamageTraitValues(actor, ["vulnerabilities", "damageVulnerabilities", "damageVulnerability"]), type) ||
      conditionMentionsDamageTrait(labels, "vulnerable", type);
    if (immune) {
      adjusted = 0;
      notes.push("immune");
    } else {
      if (resistant) {
        adjusted = Math.floor(adjusted / 2);
        notes.push("resisted");
      }
      if (vulnerable) {
        adjusted *= 2;
        notes.push("vulnerable");
      }
    }
  }
  if (adjusted > 0 && hasConcentrationCue(labels)) notes.push(`concentration DC ${Math.max(10, Math.floor(adjusted / 2))}`);
  return { amount: adjusted, notes };
}

function appendActorCondition(actor: Actor, condition: string): unknown[] {
  const existing = Array.isArray(actor.data.conditions) ? actor.data.conditions : [];
  const id = slugId(condition);
  if (existing.some((item) => (typeof item === "string" ? item === id || item === condition : recordValue(item).id === id))) return existing;
  return [...existing, { id, appliedAt: new Date().toISOString() }];
}

function actorSaveFormula(actor: Actor | undefined, ability: string): string {
  const attributes = recordValue(actor?.data.attributes);
  const score = Number(attributes[ability]);
  const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
  if (modifier === 0) return "1d20";
  return `1d20${modifier > 0 ? "+" : ""}${modifier}`;
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

function tokenPlayerOwnerIds(members: Snapshot["members"]): string[] {
  return members.filter((member) => member.role === "player").map((member) => member.userId).sort();
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function tokenPermissionPresetLabel(token: Token, playerOwnerIds: string[]): string {
  if (tokenLayer(token) === "gm") return "GM layer";
  if (tokenLayer(token) === "map") return "Map layer";
  const tokenOwnerIds = token.ownerUserIds ?? [];
  if (token.hidden && token.locked && tokenOwnerIds.length === 0) return "Hidden GM hold";
  if (!token.hidden && token.locked && tokenOwnerIds.length === 0) return "GM locked";
  if (!token.hidden && !token.locked && tokenOwnerIds.length === 0) return "Target only";
  if (!token.hidden && !token.locked && sameStringSet(tokenOwnerIds, playerOwnerIds)) return "Party controlled";
  return "Custom";
}

function isPointInsidePoints(point: VisionPoint, points: VisionPoint[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    const crosses = currentPoint.y > point.y !== previousPoint.y > point.y;
    const xAtY = ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y || 1) + currentPoint.x;
    if (crosses && point.x < xAtY) inside = !inside;
  }
  return inside;
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function ActorPanel(props: { campaignId: string; actor?: Actor; token?: Token; scene?: Scene; currentUserId: string; actors: Actor[]; tokens: Token[]; combat?: Combat; members: Snapshot["members"]; assets: MapAsset[]; items: Item[]; compendiumEntries: RulesCompendiumEntry[]; compendiumSearch: string; setCompendiumSearch(value: string): void; compendiumStatus: string; actionTargetActorId: string; setActionTargetActorId(value: string): void; actionApplyEffect: boolean; setActionApplyEffect(value: boolean): void; actionConsumeResources: boolean; setActionConsumeResources(value: boolean): void; updateActorHp(actor: Actor, current: number): void; updateActorData(actor: Actor, patch: Record<string, unknown>): void; updateItemData(item: Item, patch: Record<string, unknown>): Promise<void>; assignItemToActor(item: Item, actor: Actor): Promise<void>; updateToken(patch: Partial<Token>): void; onUploadTokenImage(file: File, input?: HTMLInputElement): Promise<void>; targetToken(tokenId: string, targeted: boolean): void; targetTokens(tokenIds: string[], targeted: boolean): void; deleteToken(): void; updateTokenVision(patch: TokenVisionPatch): void; useActorAction(rollId: string, options?: ActorActionCommitOptions): void; onImportCompendiumEntry(entry: RulesCompendiumEntry): Promise<void>; onPurchaseCompendiumEntry(entry: RulesCompendiumEntry, quantity: number): Promise<void>; canCreateToken: boolean; canUpdateActor: boolean; canUpdateToken: boolean; canDeleteToken: boolean; canUseAction: boolean }) {
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
  useEffect(() => {
    if (deleteDialogOpen) deleteConfirmRef.current?.focus();
  }, [deleteDialogOpen]);
  useEffect(() => {
    setFullSheetOpen(false);
  }, [props.token?.id]);
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
  return (
    <div className="panel-stack actor-sidebar-summary">
      <header className="panel-hero actor-hero">
        <div>
          <div className="section-title">Selected Actor</div>
          <h2>{props.actor.name}</h2>
          <div className="admin-meta">
            <span>{props.actor.systemId}</span>
            <span>{props.token ? `Token ${props.token.name}` : "No linked token"}</span>
            {combatState.length > 0 && <span>{combatState[0]}</span>}
          </div>
        </div>
        <button className="ghost-button" type="button" onClick={() => setFullSheetOpen(true)}>
          <FileText size={16} /> Open Full Sheet
        </button>
      </header>
      <section className="operator-section actor-at-a-glance" aria-label="Actor at a glance">
        <div className="metric-grid">
          <MetricTile label="HP" value={`${hp?.current ?? "?"}/${hp?.max ?? "?"}`} />
          <MetricTile label="AC" value={armorClass ? (armorClass.label ? `${armorClass.value} ${armorClass.label}` : String(armorClass.value)) : "n/a"} />
          <MetricTile label="Conditions" value={conditions.length > 0 ? conditions.join(", ") : "None"} />
          <MetricTile label="Resources" value={resources.length > 0 ? resources.join(", ") : "None"} />
        </div>
      </section>
      {fullSheetOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog actor-sheet-dialog" role="dialog" aria-modal="true" aria-labelledby={`actor-full-sheet-title-${props.actor.id}`}>
            <div className="operator-heading">
              <div>
                <div className="section-title">Character Sheet</div>
                <h2 id={`actor-full-sheet-title-${props.actor.id}`}>{props.actor.name} full character sheet</h2>
              </div>
              <button className="ghost-button" type="button" aria-label="Close full character sheet" onClick={() => setFullSheetOpen(false)}>
                <X size={16} /> Close
              </button>
            </div>
            <section className="operator-section" aria-label="Full sheet stats">
              <div className="metric-grid">
                <MetricTile label="HP" value={`${hp?.current ?? "?"}/${hp?.max ?? "?"}`} />
                <MetricTile label="AC" value={armorClass ? (armorClass.label ? `${armorClass.value} ${armorClass.label}` : String(armorClass.value)) : "n/a"} />
                <MetricTile label="Conditions" value={conditions.length > 0 ? conditions.join(", ") : "None" } />
                <MetricTile label="Resources" value={resources.length > 0 ? resources.join(", ") : "None"} />
              </div>
              {combatState.length > 0 && (
                <div className="metric-row">
                  <span>Combat State</span>
                  <strong>{combatState.join(" - ")}</strong>
                </div>
              )}
            </section>
            <section className="operator-section" aria-label="Full sheet loadout">
              <div className="operator-heading">
                <div className="section-title">Loadout</div>
                <strong>{formatNumber(actorItems.length)} items</strong>
              </div>
              {actorItems.length === 0 ? (
                <div className="empty-state compact">No actor items.</div>
              ) : (
                <div className="placement-list">
                  {filteredActorItems.slice(0, 16).map((item) => (
                    <span className="placement-chip" key={`full-sheet-item-${item.id}`}>
                      <Boxes size={14} />
                      <span>{itemDisplayLabel(item)}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>
            <section className="operator-section" aria-label="Full sheet actions">
              <div className="operator-heading">
                <div className="section-title">Actions</div>
                <strong>{formatNumber(actionOptions.length)}</strong>
              </div>
              {actionOptions.length === 0 ? (
                <div className="empty-state compact">No actions available.</div>
              ) : (
                actionOptions.slice(0, 8).map((action) => (
                  <article className="operator-item admin-item" key={`full-sheet-action-${action.rollId}`}>
                    <strong>{action.label}</strong>
                    <p>{action.description}</p>
                    <button className="ghost-button" type="button" disabled={!props.canUseAction} onClick={() => props.useActorAction(action.rollId, commitOptionsForAction(action.rollId))}>
                      <WandSparkles size={14} /> Use action
                    </button>
                  </article>
                ))
              )}
            </section>
            <section className="operator-section" aria-label="Full sheet targeting">
              <div className="metric-row">
                <span>Action target</span>
                <strong>{selectedActionTarget.name}</strong>
              </div>
              <div className="metric-row">
                <span>Marked tokens</span>
                <strong>{formatNumber(targetedSceneTokens.length)}</strong>
              </div>
              {tokenActionTargetOptions.length > 0 && (
                <div className="button-row">
                  {tokenActionTargetOptions.slice(0, 4).map(({ token, actor }) => (
                    <button className={actionTargetActorId === actor.id ? "ghost-button active" : "ghost-button"} key={`full-sheet-target-${actor.id}`} type="button" disabled={!props.canUseAction} onClick={() => props.setActionTargetActorId(actor.id)}>
                      <MapPin size={14} /> Target {actor.name}
                      {token.targetedByUserIds?.includes(props.currentUserId) ? " (marked)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      <section className="operator-section placement-tray" aria-label="Actor placement tray">
        <div className="operator-heading">
          <div className="section-title">Placement</div>
          <strong>{formatNumber(props.actors.length)} actors</strong>
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
          <div className="metric-grid">
            <MetricTile label="HP" value={`${hp?.current ?? "?"}/${hp?.max ?? "?"}`} />
            <MetricTile label="AC" value={armorClass ? (armorClass.label ? `${armorClass.value} ${armorClass.label}` : String(armorClass.value)) : "n/a"} />
            <MetricTile label="Conditions" value={formatNumber(conditions.length)} />
            <MetricTile label="Resources" value={formatNumber(resourceControls.length)} />
          </div>
          <div className="sheet-row">
            <label htmlFor="actor-hp-tab">Current HP</label>
            <input id="actor-hp-tab" aria-label="Actor sheet current HP" type="number" value={hp?.current ?? 0} disabled={!props.canUpdateActor} onChange={(event) => props.updateActorHp(props.actor!, Number(event.target.value))} />
          </div>
          <div className="sheet-row">
            <label htmlFor="actor-conditions-tab">Actor conditions</label>
            <input id="actor-conditions-tab" aria-label="Actor sheet conditions" defaultValue={formatActorConditions(props.actor)} disabled={!props.canUpdateActor} onBlur={(event) => props.updateActorData(props.actor!, { conditions: parseActorConditions(event.currentTarget.value) })} />
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
            const item = unassignedItems.find((candidate) => candidate.id === itemId);
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
          ) : (
            filteredActorItems.map((item) => {
              const data = recordValue(item.data);
              const isSpellLike = item.type === "spell" || item.type === "ritual" || item.type === "talent";
              const isGearLike = !isSpellLike && item.type !== "clue";
              return (
                <article className="operator-item admin-item" key={item.id}>
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

function actorConditionLabels(actor: Actor): string[] {
  const names: Record<string, string> = {
    blessed: "Blessed",
    poisoned: "Poisoned",
    restrained: "Restrained",
    "locked-in": "Locked In",
    jammed: "Jammed",
    "vacuum-exposed": "Vacuum Exposed",
    focused: "Focused",
    shaken: "Shaken",
    marked: "Marked"
  };
  const value = actor.data.conditions;
  if (!Array.isArray(value)) return [];
  return value
    .map((condition) => {
      if (typeof condition === "string") return names[condition] ?? condition;
      if (condition && typeof condition === "object" && "id" in condition && typeof condition.id === "string") return names[condition.id] ?? condition.id;
      return undefined;
    })
    .filter((condition): condition is string => Boolean(condition));
}

function actorResourceLabels(actor: Actor): string[] {
  return Object.entries(recordValue(actor.data.resources)).flatMap(([key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) return `${titleCaseLabel(key)} ${value}`;
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    const max = numericValue(pool.max, NaN);
    if (!Number.isFinite(current) || !Number.isFinite(max)) return [];
    return `${titleCaseLabel(key)} ${current}/${max}`;
  });
}

function formatActorConditions(actor: Actor): string {
  const value = actor.data.conditions;
  if (!Array.isArray(value)) return "";
  return value
    .map((condition) => {
      if (typeof condition === "string") return condition;
      if (condition && typeof condition === "object" && "id" in condition && typeof condition.id === "string") return condition.id;
      return undefined;
    })
    .filter((condition): condition is string => Boolean(condition))
    .join(", ");
}

function parseActorConditions(value: string): string[] {
  return [...new Set(value.split(",").map((condition) => condition.trim()).filter(Boolean))].slice(0, 20);
}

function actorResourceControls(actor: Actor): { key: string; label: string; current: number }[] {
  return Object.entries(recordValue(actor.data.resources)).flatMap(([key, value]) => {
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    if (Number.isFinite(current)) return [{ key, label: titleCaseLabel(key), current }];
    if (typeof value === "number" && Number.isFinite(value)) return [{ key, label: titleCaseLabel(key), current: value }];
    return [];
  });
}

function actorResourceUpdate(actor: Actor, key: string, current: number): Record<string, unknown> {
  const resources = { ...recordValue(actor.data.resources) };
  const nextCurrent = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  const existing = resources[key];
  const pool = recordValue(existing);
  resources[key] = Object.keys(pool).length > 0 ? { ...pool, current: nextCurrent } : nextCurrent;
  return resources;
}

function actorCombatResource(actor: Actor): { key: string; label: string } | undefined {
  for (const [key, value] of Object.entries(recordValue(actor.data.resources))) {
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    const max = numericValue(pool.max, NaN);
    if (Number.isFinite(current) && Number.isFinite(max)) return { key, label: `${titleCaseLabel(key)} ${current}/${max}` };
    if (typeof value === "number" && Number.isFinite(value)) return { key, label: `${titleCaseLabel(key)} ${value}` };
  }
  return undefined;
}

function actorCombatStateLabels(actor: Actor): string[] {
  const labels: string[] = [];
  const deathSaves = recordValue(actor.data.deathSaves);
  const successes = numericValue(deathSaves.successes, NaN);
  const failures = numericValue(deathSaves.failures, NaN);
  if (Number.isFinite(successes) || Number.isFinite(failures)) {
    labels.push(`Death saves ${Number.isFinite(successes) ? successes : 0}/3 successes, ${Number.isFinite(failures) ? failures : 0}/3 failures`);
  }
  const combatState = recordValue(actor.data.combatState);
  if (combatState.deathSaveOutcome === "stable") labels.push("Stable");
  if (combatState.deathSaveOutcome === "dead") labels.push("Dead");
  const readiness = typeof combatState.readiness === "string" && combatState.readiness !== "normal" ? combatState.readiness : undefined;
  if (readiness) labels.push(titleCaseLabel(readiness));
  if (combatState.defeated === true) labels.push("Defeated");
  if (combatState.resourceUsed === true) labels.push(`${typeof combatState.resourceLabel === "string" ? combatState.resourceLabel : "Resource"} used${combatState.resourceSpent === true ? " and depleted" : ""}`);
  return labels;
}

function itemDisplayLabel(item: Item): string {
  const quantity = numericValue(recordValue(item.data).quantity, NaN);
  return Number.isFinite(quantity) ? `${item.name} x${quantity}` : item.name;
}

function itemPreparedLabel(item: Item): string {
  if (item.type !== "spell" && item.type !== "ritual" && item.type !== "talent") return "preparation n/a";
  return recordValue(item.data).prepared === false ? "unprepared" : "prepared";
}

function itemEquippedLabel(item: Item): string {
  if (item.type === "spell" || item.type === "ritual" || item.type === "talent" || item.type === "clue") return "equipment n/a";
  return recordValue(item.data).equipped === false ? "unequipped" : "equipped";
}

function actorActionLabels(actor: Actor, items: Item[]): string[] {
  return actorActionOptions(actor, items).map((option) => option.description);
}

function actorArmorClass(actor: Actor, items: Item[]): { value: number; label?: string } | undefined {
  const storedArmorClass = numericValue(actor.data.armorClass, NaN);
  if (Number.isFinite(storedArmorClass)) return { value: storedArmorClass };
  if (actor.systemId !== "dnd-5e-srd") return undefined;
  const dexModifier = genericFantasyAttributeModifier(actor, "dexterity");
  const actorItems = items.filter((item) => item.actorId === actor.id && itemQuantity(recordValue(item.data)) > 0);
  const armorOptions = [
    { value: 10 + dexModifier, label: "Unarmored" },
    ...actorItems.flatMap((item) => {
      const data = recordValue(item.data);
      if (data.equipped === false) return [];
      const armorBase = numericValue(data.armorBase, NaN);
      if (!Number.isFinite(armorBase)) return [];
      const dexContribution = data.dexBonus === false ? 0 : Math.min(dexModifier, numericValue(data.dexCap, dexModifier));
      return [{ value: armorBase + dexContribution, label: item.name }];
    })
  ];
  const armor = armorOptions.sort((left, right) => right.value - left.value)[0]!;
  const shieldBonus = actorItems.reduce((max, item) => {
    const data = recordValue(item.data);
    if (data.equipped === false) return max;
    return Math.max(max, numericValue(data.armorBonus, 0));
  }, 0);
  return { value: armor.value + shieldBonus, label: shieldBonus > 0 ? `${armor.label} + Shield` : armor.label };
}

function itemQuantity(data: Record<string, unknown>): number {
  return Math.max(0, numericValue(data.quantity, 1));
}

function isPurchasableCompendiumEntry(actor: Actor, entry: RulesCompendiumEntry): boolean {
  return actor.systemId === "dnd-5e-srd" && entry.type !== "condition" && Number.isFinite(numericValue(entry.data.costGp, NaN));
}

type ActorActionOption = { rollId: string; label: string; description: string };

function actorActionSupportsEffect(action: ActorActionOption | undefined): boolean {
  if (!action) return false;
  if (action.rollId === "feature-stunning-strike") return true;
  const effectText = `${action.rollId} ${action.label} ${action.description}`.toLowerCase();
  return action.rollId.endsWith("-healing") || action.rollId.endsWith("-damage") || /\b(healing|damage|condition|effect)\b/.test(effectText);
}

function actorActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  if (actor.systemId === "stellar-frontiers") return stellarFrontiersActionOptions(actor, items);
  if (actor.systemId === "mystic-noir") return mysticNoirActionOptions(actor, items);
  if (actor.systemId === "dnd-5e-srd") return dnd5eSrdActionOptions(actor, items);
  return genericFantasyActionOptions(actor, items);
}

function dnd5eSrdActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return [...dnd5eSrdClassFeatureActionOptions(actor), ...dnd5eSrdSpeciesTraitActionOptions(actor), ...dnd5eSrdMonsterActionOptions(actor), ...dnd5eSrdItemActionOptions(actor, items)];
}

function dnd5eSrdMonsterActionOptions(actor: Actor): ActorActionOption[] {
  const monster = recordValue(actor.data.monster);
  const statBlock = recordValue(monster.statBlock);
  const actions = Array.isArray(statBlock.actions) ? statBlock.actions.map(recordValue) : [];
  return actions.flatMap((action) => {
    const name = stringValue(action.name);
    if (!name) return [];
    const id = slugId(name);
    const options: ActorActionOption[] = [];
    if (Number.isFinite(numericValue(action.attackBonus, Number.NaN))) {
      options.push({ rollId: `monster-${id}-attack`, label: `${name} Attack`, description: `${name} Attack` });
    }
    const damageFormula = stringValue(action.damageFormula);
    if (damageFormula) {
      options.push({ rollId: `monster-${id}-damage`, label: `${name} Damage`, description: `${name} Damage: ${damageFormula}` });
    }
    if (stringValue(action.condition) || stringValue(action.summary) || Object.keys(recordValue(action.save)).length > 0) {
      options.push({ rollId: `monster-${id}-effect`, label: `${name} Effect`, description: `${name} Effect: ${dnd5eSrdMonsterActionEffectSummary(action)}` });
    }
    return options;
  });
}

function dnd5eSrdMonsterActionEffectSummary(action: Record<string, unknown>): string {
  const parts = [stringValue(action.condition), stringValue(action.recharge) ? `Recharge ${stringValue(action.recharge)}` : undefined, stringValue(action.summary)].filter((value): value is string => Boolean(value));
  return parts.join("; ") || "effect";
}

function dnd5eSrdClassFeatureActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasSecondWind(actor)) {
    const tacticalShift = dnd5eSrdHasTacticalShift(actor) ? `; Tactical Shift ${dnd5eSrdTacticalShiftMovement(actor)} ft without opportunity attacks` : "";
    options.push({
      rollId: "feature-second-wind-healing",
      label: "Second Wind",
      description: `Second Wind Healing: ${dnd5eSrdSecondWindFormula(actor)}${tacticalShift}`
    });
  }
  if (dnd5eSrdHasActionSurge(actor)) {
    options.push({ rollId: "feature-action-surge", label: "Action Surge", description: "Action Surge: spend one use" });
  }
  if (dnd5eSrdHasTacticalMind(actor)) {
    options.push({ rollId: "feature-tactical-mind-bonus", label: "Tactical Mind", description: "Tactical Mind Bonus: 1d10; spends Second Wind" });
  }
  if (dnd5eSrdHasChampionCritical(actor)) {
    options.push({ rollId: "feature-champion-critical-range", label: dnd5eSrdChampionCriticalLabel(actor), description: `${dnd5eSrdChampionCriticalLabel(actor)}: weapon and Unarmed Strike attacks score Critical Hits on ${dnd5eSrdChampionCriticalRange(actor)}` });
  }
  if (dnd5eSrdHasChampionRemarkableAthlete(actor)) {
    options.push({ rollId: "feature-champion-remarkable-athlete", label: "Remarkable Athlete", description: `Remarkable Athlete: advantage on Initiative and Athletics; critical hit movement ${dnd5eSrdTacticalShiftMovement(actor)} ft` });
  }
  if (dnd5eSrdHasChampionHeroicWarrior(actor)) {
    options.push({ rollId: "feature-champion-heroic-warrior", label: "Heroic Warrior", description: "Heroic Warrior: gain Heroic Inspiration at the start of combat turns without it" });
  }
  if (dnd5eSrdHasChampionSurvivor(actor)) {
    options.push({ rollId: "feature-champion-survivor", label: "Survivor", description: `Survivor Rally: regain ${dnd5eSrdChampionSurvivorFormula(actor)} HP at turn start when Bloodied` });
  }
  if (dnd5eSrdHasRage(actor)) {
    const rageDamageBonus = dnd5eSrdRageDamageBonus(actor);
    options.push(
      { rollId: "feature-rage", label: "Rage", description: `Rage: spends one use; +${rageDamageBonus} Strength damage; resists bludgeoning, piercing, and slashing` },
      { rollId: "feature-rage-damage-bonus", label: "Rage Damage", description: `Rage Damage Bonus: ${rageDamageBonus}` }
    );
  }
  if (dnd5eSrdHasRecklessAttack(actor)) {
    options.push({ rollId: "feature-reckless-attack", label: "Reckless Attack", description: "Reckless Attack: Strength attacks gain advantage; attacks against you gain advantage" });
  }
  if (dnd5eSrdHasBerserkerFrenzy(actor)) {
    options.push({ rollId: "feature-berserker-frenzy-damage", label: "Frenzy", description: `Berserker Frenzy Damage: ${dnd5eSrdBerserkerFrenzyFormula(actor)} after Reckless Attack while raging` });
  }
  if (dnd5eSrdHasBerserkerMindlessRage(actor)) {
    options.push({ rollId: "feature-berserker-mindless-rage", label: "Mindless Rage", description: "Mindless Rage: immune to Charmed and Frightened while raging" });
  }
  if (dnd5eSrdHasBerserkerRetaliation(actor)) {
    options.push({ rollId: "feature-berserker-retaliation", label: "Retaliation", description: "Retaliation: reaction melee attack after nearby damage" });
  }
  if (dnd5eSrdHasBerserkerIntimidatingPresence(actor)) {
    options.push({ rollId: "feature-berserker-intimidating-presence", label: "Intimidating Presence", description: `Intimidating Presence: DC ${dnd5eSrdBerserkerSaveDc(actor)} Wisdom; 30 ft emanation` });
  }
  if (dnd5eSrdHasBardicInspiration(actor)) {
    options.push({ rollId: "feature-bardic-inspiration", label: "Bardic Inspiration", description: `Bardic Inspiration: ${dnd5eSrdBardicInspirationFormula(actor)}; spends one use` });
  }
  if (dnd5eSrdHasFontOfInspiration(actor)) {
    options.push({ rollId: "feature-font-of-inspiration", label: "Font of Inspiration", description: "Font of Inspiration: spend a spell slot to regain one Bardic Inspiration use" });
  }
  if (dnd5eSrdHasLoreCuttingWords(actor)) {
    options.push({ rollId: "feature-lore-cutting-words", label: "Cutting Words", description: `Cutting Words: subtract ${dnd5eSrdBardicInspirationFormula(actor)} from a visible creature's roll; spends one use` });
  }
  if (dnd5eSrdHasLoreMagicalDiscoveries(actor)) {
    options.push({ rollId: "feature-lore-magical-discoveries", label: "Magical Discoveries", description: "Magical Discoveries: prepare two Cleric, Druid, or Wizard spells" });
  }
  if (dnd5eSrdHasLorePeerlessSkill(actor)) {
    options.push({ rollId: "feature-lore-peerless-skill", label: "Peerless Skill", description: `Peerless Skill: add ${dnd5eSrdBardicInspirationFormula(actor)} after failing an ability check or attack roll` });
  }
  if (dnd5eSrdHasLayOnHands(actor)) {
    options.push({ rollId: "feature-lay-on-hands-healing", label: "Lay On Hands", description: `Lay On Hands Healing: ${dnd5eSrdLayOnHandsFormula(actor)}; spends healing pool points` });
  }
  if (dnd5eSrdHasPaladinsSmite(actor)) {
    options.push({ rollId: "feature-divine-smite-damage", label: "Divine Smite", description: `Divine Smite Damage: ${dnd5eSrdDivineSmiteFormula(actor)} radiant; can spend a spell slot or Paladin's Smite` });
  }
  if (dnd5eSrdHasFaithfulSteed(actor)) {
    options.push({ rollId: "feature-faithful-steed", label: "Faithful Steed", description: "Faithful Steed: free Find Steed casting; recovers on Long Rest" });
  }
  if (dnd5eSrdHasDevotionSacredWeapon(actor)) {
    options.push({ rollId: "feature-devotion-sacred-weapon", label: "Sacred Weapon", description: `Sacred Weapon: add +${dnd5eSrdDevotionSacredWeaponBonus(actor)} to a melee weapon attack; spends Channel Divinity` });
  }
  if (dnd5eSrdHasDevotionAura(actor)) {
    options.push({ rollId: "feature-devotion-aura", label: "Aura of Devotion", description: "Aura of Devotion: allies in Aura of Protection are immune to Charmed" });
  }
  if (dnd5eSrdHasDevotionSmiteProtection(actor)) {
    options.push({ rollId: "feature-devotion-smite-of-protection", label: "Smite Protection", description: "Smite of Protection: Divine Smite grants Half Cover in your aura" });
  }
  if (dnd5eSrdHasDevotionHolyNimbus(actor)) {
    options.push({ rollId: "feature-devotion-holy-nimbus-damage", label: "Holy Nimbus", description: `Holy Nimbus Radiant Damage: ${dnd5eSrdDevotionHolyNimbusFormula(actor)} in your aura` });
  }
  if (dnd5eSrdHasHuntersMark(actor)) {
    options.push({ rollId: "feature-hunters-mark-damage", label: "Hunter's Mark", description: `Hunter's Mark Damage: ${dnd5eSrdHuntersMarkFormula(actor)} force; spends a spell slot or Favored Enemy` });
  }
  if (dnd5eSrdHasHunterLore(actor)) {
    options.push({ rollId: "feature-hunter-lore", label: "Hunter Lore", description: "Hunter's Lore: reveal immunities, resistances, and vulnerabilities on a Hunter's Mark target" });
  }
  if (dnd5eSrdHasHunterPrey(actor)) {
    options.push({ rollId: "feature-hunter-prey", label: "Hunter Prey", description: "Hunter's Prey: 1d8 Colossus Slayer damage or Horde Breaker extra attack option" });
  }
  if (dnd5eSrdHasHunterDefensiveTactics(actor)) {
    options.push({ rollId: "feature-hunter-defensive-tactics", label: "Defensive Tactics", description: "Defensive Tactics: Escape the Horde or Multiattack Defense option" });
  }
  if (dnd5eSrdHasHunterSuperiorPrey(actor)) {
    options.push({ rollId: "feature-hunter-superior-prey", label: "Superior Prey", description: `Superior Hunter's Prey: ${dnd5eSrdHuntersMarkFormula(actor)} force to a second target within 30 feet` });
  }
  if (dnd5eSrdHasHunterSuperiorDefense(actor)) {
    options.push({ rollId: "feature-hunter-superior-defense", label: "Superior Defense", description: "Superior Hunter's Defense: Reaction for Resistance to incoming damage type" });
  }
  if (dnd5eSrdHasMartialArts(actor)) {
    options.push({ rollId: "feature-martial-arts-damage", label: "Martial Arts", description: `Martial Arts Damage: ${dnd5eSrdMartialArtsFormula(actor)} bludgeoning` });
  }
  if (dnd5eSrdHasMonkFocus(actor)) {
    options.push(
      { rollId: "feature-flurry-of-blows", label: "Flurry", description: `Flurry of Blows: spend 1 Focus for ${numericValue(actor.data.level, 1) >= 10 ? 3 : 2} Unarmed Strikes` },
      { rollId: "feature-patient-defense", label: "Patient Defense", description: "Patient Defense: spend 1 Focus for Disengage and Dodge" },
      { rollId: "feature-step-of-the-wind", label: "Step of the Wind", description: "Step of the Wind: spend 1 Focus for Disengage, Dash, and doubled jump distance" },
      { rollId: "feature-uncanny-metabolism-healing", label: "Metabolism", description: `Uncanny Metabolism Healing: ${dnd5eSrdUncannyMetabolismFormula(actor)}; restores Focus on Initiative` }
    );
  }
  if (dnd5eSrdHasDeflectAttacks(actor)) {
    options.push({ rollId: "feature-deflect-attacks-damage", label: "Deflect", description: `Deflect Attacks Reaction Damage: ${dnd5eSrdDeflectAttacksDamageFormula(actor)} after reducing damage to 0` });
  }
  if (dnd5eSrdHasStunningStrike(actor)) {
    options.push({ rollId: "feature-stunning-strike", label: "Stunning Strike", description: `Stunning Strike: spend 1 Focus; DC ${dnd5eSrdMonkSaveDc(actor)} Constitution` });
  }
  if (dnd5eSrdHasOpenHandTechnique(actor)) {
    options.push({ rollId: "feature-open-hand-technique", label: "Open Hand", description: `Open Hand Technique: Flurry rider; Addle, Push DC ${dnd5eSrdMonkSaveDc(actor)} Strength, or Topple DC ${dnd5eSrdMonkSaveDc(actor)} Dexterity` });
  }
  if (dnd5eSrdHasOpenHandWholeness(actor)) {
    options.push({ rollId: "feature-open-hand-wholeness-of-body", label: "Wholeness", description: `Wholeness of Body: ${dnd5eSrdOpenHandWholenessFormula(actor)} healing; spend one Long Rest use` });
  }
  if (dnd5eSrdHasOpenHandFleetStep(actor)) {
    options.push({ rollId: "feature-open-hand-fleet-step", label: "Fleet Step", description: "Fleet Step: use Step of the Wind after another Bonus Action" });
  }
  if (dnd5eSrdHasOpenHandQuiveringPalm(actor)) {
    options.push({ rollId: "feature-open-hand-quivering-palm-damage", label: "Quivering Palm", description: `Quivering Palm: spend 4 Focus; 10d12 force, DC ${dnd5eSrdMonkSaveDc(actor)} Constitution half` });
  }
  if (dnd5eSrdHasInnateSorcery(actor)) {
    options.push({ rollId: "feature-innate-sorcery", label: "Innate Sorcery", description: `Innate Sorcery: spend one use for +1 spell DC (${dnd5eSrdSpellSaveDc(actor) + 1}) and spell attack advantage` });
  }
  if (dnd5eSrdHasFontOfMagic(actor)) {
    options.push(
      { rollId: "feature-convert-spell-slot-to-sorcery-points", label: "Convert Slot", description: "Font of Magic: convert a spell slot into Sorcery Points equal to its level" },
      { rollId: "feature-create-spell-slot", label: "Create Slot", description: "Font of Magic: spend Sorcery Points to restore a spell slot" }
    );
  }
  if (dnd5eSrdHasMetamagic(actor)) {
    options.push(
      { rollId: "feature-metamagic-empowered-spell", label: "Empowered Spell", description: `Metamagic: spend 1 Sorcery Point to reroll up to ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma"))} damage dice` },
      { rollId: "feature-metamagic-quickened-spell", label: "Quickened Spell", description: "Metamagic: spend 2 Sorcery Points to cast an action spell as a Bonus Action" }
    );
  }
  if (dnd5eSrdHasDraconicResilience(actor)) {
    options.push({ rollId: "feature-draconic-resilience", label: "Draconic Resilience", description: `Draconic Resilience: AC ${10 + genericFantasyAttributeModifier(actor, "dexterity") + genericFantasyAttributeModifier(actor, "charisma")} while unarmored` });
  }
  if (dnd5eSrdHasDraconicElementalAffinity(actor)) {
    options.push({ rollId: "feature-draconic-elemental-affinity", label: "Elemental Affinity", description: `Elemental Affinity: +${genericFantasyAttributeModifier(actor, "charisma")} damage and resistance for a chosen dragon damage type` });
  }
  if (dnd5eSrdHasDraconicWings(actor)) {
    options.push({ rollId: "feature-draconic-wings", label: "Dragon Wings", description: "Dragon Wings: Bonus Action, fly speed 60 ft for 1 hour; spend 3 Sorcery Points to restore a use" });
  }
  if (dnd5eSrdHasDraconicCompanion(actor)) {
    options.push({ rollId: "feature-draconic-companion", label: "Dragon Companion", description: "Dragon Companion: cast Summon Dragon without material components; one free cast per Long Rest" });
  }
  if (dnd5eSrdHasEvokerPotentCantrip(actor)) {
    options.push({ rollId: "feature-evoker-potent-cantrip", label: "Potent Cantrip", description: `Potent Cantrip: save cantrips use DC ${dnd5eSrdSpellSaveDc(actor)} and deal half damage when a target would avoid damage` });
  }
  if (dnd5eSrdHasEvokerSculptSpells(actor)) {
    options.push({ rollId: "feature-evoker-sculpt-spells", label: "Sculpt Spells", description: "Sculpt Spells: protect 1 + spell level creatures from your Evocation spell damage" });
  }
  if (dnd5eSrdHasEvokerEmpoweredEvocation(actor)) {
    options.push({ rollId: "feature-evoker-empowered-evocation", label: "Empowered Evocation", description: `Empowered Evocation: add +${dnd5eSrdEvokerEmpoweredEvocationBonus(actor)} to one Wizard Evocation spell damage roll` });
  }
  if (dnd5eSrdHasEvokerOverchannel(actor)) {
    options.push({ rollId: "feature-evoker-overchannel", label: "Overchannel", description: "Overchannel: spend one long-rest use to maximize a level 1-5 Wizard damage spell" });
  }
  if (dnd5eSrdHasEldritchInvocations(actor)) {
    options.push({ rollId: "feature-eldritch-invocations", label: "Invocations", description: `Eldritch Invocations: ${dnd5eSrdEldritchInvocationsKnown(actor)} known; includes pact options such as Blade, Chain, and Tome` });
  }
  if (dnd5eSrdHasMagicalCunning(actor)) {
    options.push({ rollId: "feature-magical-cunning", label: "Magical Cunning", description: `Magical Cunning: spend one use to regain ${dnd5eSrdMagicalCunningLimit(actor)} Pact Magic slot` });
  }
  if (dnd5eSrdHasFiendDarkBlessing(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-blessing", label: "Dark Blessing", description: `Dark One's Blessing: ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma") + numericValue(actor.data.level, 1))} temp HP when an enemy drops nearby` });
  }
  if (dnd5eSrdHasFiendDarkLuck(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-own-luck", label: "Dark Luck", description: "Dark One's Own Luck: spend one use to add 1d10 to an ability check or saving throw" });
  }
  if (dnd5eSrdHasFiendResilience(actor)) {
    options.push({ rollId: "feature-fiendish-resilience", label: "Fiendish Resilience", description: "Fiendish Resilience: choose a non-Force damage resistance after a Short or Long Rest" });
  }
  if (dnd5eSrdHasFiendHurlThroughHell(actor)) {
    options.push({ rollId: "feature-fiend-hurl-through-hell-damage", label: "Hurl Through Hell", description: `Hurl Through Hell: 8d10 psychic; DC ${dnd5eSrdSpellSaveDc(actor)} Charisma` });
  }
  if (dnd5eSrdHasWildShape(actor)) {
    options.push({ rollId: "feature-wild-shape", label: "Wild Shape", description: `Wild Shape: spend one use; ${dnd5eSrdWildShapeDurationHours(actor)} hour form; regain one use on Short Rest` });
  }
  if (dnd5eSrdHasWildCompanion(actor)) {
    options.push({ rollId: "feature-wild-companion", label: "Wild Companion", description: "Wild Companion: cast Find Familiar by spending a spell slot or Wild Shape" });
  }
  if (dnd5eSrdHasWildResurgence(actor)) {
    options.push(
      { rollId: "feature-wild-resurgence-wild-shape", label: "Wild Resurgence", description: "Wild Resurgence: spend a spell slot to regain one Wild Shape use when none remain" },
      { rollId: "feature-wild-resurgence-spell-slot", label: "Wild Slot", description: "Wild Resurgence: spend Wild Shape to regain a level 1 spell slot once per Long Rest" }
    );
  }
  if (dnd5eSrdHasMoonCircleForms(actor)) {
    options.push({ rollId: "feature-moon-circle-forms", label: "Circle Forms", description: `Circle Forms: CR ${dnd5eSrdMoonWildShapeMaxChallengeRating(actor)}, AC floor ${13 + genericFantasyAttributeModifier(actor, "wisdom")}, ${numericValue(actor.data.level, 1) * 3} temp HP` });
  }
  if (dnd5eSrdHasMoonImprovedCircleForms(actor)) {
    options.push({ rollId: "feature-moon-improved-circle-forms", label: "Improved Forms", description: "Improved Circle Forms: Radiant Wild Shape damage option and Wisdom bonus to Concentration saves" });
  }
  if (dnd5eSrdHasMoonlightStep(actor)) {
    options.push({ rollId: "feature-moon-moonlight-step", label: "Moonlight Step", description: "Moonlight Step: Bonus Action teleport 30 ft and gain Advantage on your next attack this turn" });
  }
  if (dnd5eSrdHasMoonLunarForm(actor)) {
    options.push({ rollId: "feature-moon-lunar-form-damage", label: "Lunar Form", description: "Lunar Form Radiant Damage: 2d10 once per turn with a Wild Shape form attack" });
  }
  if (dnd5eSrdHasClericChannelDivinity(actor)) {
    const saveDc = dnd5eSrdSpellSaveDc(actor);
    const searUndead = dnd5eSrdHasSearUndead(actor) ? `; Sear ${dnd5eSrdSearUndeadFormula(actor)} radiant` : "";
    options.push(
      { rollId: "feature-divine-spark-healing", label: "Divine Spark Healing", description: `Divine Spark Healing: ${dnd5eSrdDivineSparkFormula(actor)}; spends Channel Divinity` },
      { rollId: "feature-divine-spark-damage", label: "Divine Spark Damage", description: `Divine Spark Damage: ${dnd5eSrdDivineSparkFormula(actor)}; DC ${saveDc} Constitution; spends Channel Divinity` },
      { rollId: "feature-turn-undead", label: "Turn Undead", description: `Turn Undead: DC ${saveDc} Wisdom; 30 ft; spends Channel Divinity${searUndead}` }
    );
  }
  if (dnd5eSrdHasSearUndead(actor)) {
    options.push({ rollId: "feature-sear-undead-damage", label: "Sear Undead", description: `Sear Undead Damage: ${dnd5eSrdSearUndeadFormula(actor)} radiant` });
  }
  if (dnd5eSrdHasLifeDisciple(actor)) {
    options.push({ rollId: "feature-life-disciple-of-life", label: "Disciple of Life", description: "Disciple of Life: healing spells add 2 + spell slot level" });
  }
  if (dnd5eSrdHasLifePreserveLife(actor)) {
    options.push({ rollId: "feature-life-preserve-life", label: "Preserve Life", description: `Preserve Life: restore ${dnd5eSrdPreserveLifeFormula(actor)} HP among Bloodied creatures; spends Channel Divinity` });
  }
  if (dnd5eSrdHasLifeBlessedHealer(actor)) {
    options.push({ rollId: "feature-life-blessed-healer", label: "Blessed Healer", description: "Blessed Healer: heal yourself for 2 + spell slot level after healing another creature with a spell slot" });
  }
  if (dnd5eSrdHasLifeSupremeHealing(actor)) {
    options.push({ rollId: "feature-life-supreme-healing", label: "Supreme Healing", description: "Supreme Healing: use the highest possible number for each healing die" });
  }
  if (dnd5eSrdHasSneakAttack(actor)) {
    const cunningStrike = dnd5eSrdHasCunningStrike(actor) ? `; Cunning Strike DC ${dnd5eSrdRogueSaveDc(actor)}` : "";
    options.push({ rollId: "feature-sneak-attack-damage", label: "Sneak Attack", description: `Sneak Attack Damage: ${dnd5eSrdSneakAttackFormula(actor)}${cunningStrike}` });
  }
  if (dnd5eSrdHasCunningStrike(actor)) {
    options.push({ rollId: "feature-cunning-strike", label: "Cunning Strike", description: `Cunning Strike: spend Sneak Attack dice for Poison, Trip, or Withdraw; DC ${dnd5eSrdRogueSaveDc(actor)}` });
  }
  if (dnd5eSrdHasThiefFastHands(actor)) {
    options.push({ rollId: "feature-thief-fast-hands", label: "Fast Hands", description: "Fast Hands: use Cunning Action for Sleight of Hand, Thieves' Tools, or Utilize" });
  }
  if (dnd5eSrdHasThiefSecondStoryWork(actor)) {
    options.push({ rollId: "feature-thief-second-story-work", label: "Second-Story Work", description: `Second-Story Work: climb ${numericValue(actor.data.speed, 30)} ft; jump +${Math.max(0, genericFantasyAttributeModifier(actor, "dexterity"))} ft` });
  }
  if (dnd5eSrdHasThiefSupremeSneak(actor)) {
    options.push({ rollId: "feature-thief-supreme-sneak", label: "Supreme Sneak", description: `Supreme Sneak: advantage on Stealth after moving ${Math.floor(numericValue(actor.data.speed, 30) / 2)} ft or less` });
  }
  if (dnd5eSrdHasThiefUseMagicDevice(actor)) {
    options.push({ rollId: "feature-thief-use-magic-device", label: "Use Magic Device", description: "Use Magic Device: 1d6 charge check; 6 spends no charges; four attunements; Int scroll checks" });
  }
  if (dnd5eSrdHasThiefReflexes(actor)) {
    options.push({ rollId: "feature-thief-reflexes", label: "Thief's Reflexes", description: "Thief's Reflexes: two turns in first combat round at Initiative and Initiative - 10" });
  }
  return options;
}

function dnd5eSrdSpeciesTraitActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasDragonbornBreathWeapon(actor)) {
    const dc = 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "constitution");
    options.push({ rollId: "species-dragonborn-breath-weapon", label: "Breath Weapon", description: `Breath Weapon: ${dnd5eSrdDragonbornBreathWeaponFormula(actor)}; DC ${dc} Dexterity; spends one use` });
  }
  if (dnd5eSrdHasDraconicFlight(actor)) {
    options.push({ rollId: "species-draconic-flight", label: "Draconic Flight", description: `Draconic Flight: spend one use for ${numericValue(actor.data.speed, 30)} ft fly speed for 10 minutes` });
  }
  if (dnd5eSrdHasDwarfStonecunning(actor)) {
    options.push({ rollId: "species-dwarf-stonecunning", label: "Stonecunning", description: "Stonecunning: spend one use for 60 ft Tremorsense for 10 minutes on stone" });
  }
  if (dnd5eSrdHasGoliathGiantAncestry(actor)) {
    options.push({ rollId: "species-goliath-giant-ancestry", label: "Giant Ancestry", description: "Giant Ancestry: spend one use for your chosen Giant boon" });
  }
  if (dnd5eSrdHasGoliathLargeForm(actor)) {
    options.push({ rollId: "species-goliath-large-form", label: "Large Form", description: `Large Form: spend one use to become Large, gain Strength check advantage, and move ${numericValue(actor.data.speed, 35) + 10} ft` });
  }
  if (dnd5eSrdHasHumanResourceful(actor)) {
    options.push({ rollId: "species-human-resourceful", label: "Resourceful", description: "Resourceful: gain Heroic Inspiration when you finish a Long Rest" });
  }
  if (dnd5eSrdHasHumanSkillful(actor)) {
    const skill = stringValue(recordValue(actor.data.origin).humanSkillProficiency) ?? "chosen skill";
    options.push({ rollId: "species-human-skillful", label: "Skillful", description: `Skillful: proficiency in ${skill}` });
  }
  if (dnd5eSrdHasHumanVersatile(actor)) {
    const feat = stringValue(recordValue(actor.data.origin).humanOriginFeat) ?? "Skilled";
    options.push({ rollId: "species-human-versatile", label: "Versatile", description: `Versatile: origin feat ${feat}` });
  }
  if (dnd5eSrdHasElfElvenLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.elfLineageName) ?? stringValue(origin.elfLineage) ?? "Elven";
    options.push({ rollId: "species-elf-elven-lineage", label: "Elven Lineage", description: `${lineage}: lineage cantrip and level-gated Long Rest spells` });
  }
  if (dnd5eSrdHasElfFeyAncestry(actor)) {
    options.push({ rollId: "species-elf-fey-ancestry", label: "Fey Ancestry", description: "Fey Ancestry: advantage on saves to avoid or end Charmed" });
  }
  if (dnd5eSrdHasElfTrance(actor)) {
    options.push({ rollId: "species-elf-trance", label: "Trance", description: "Trance: finish a Long Rest in 4 hours while remaining conscious" });
  }
  if (dnd5eSrdHasGnomeGnomishCunning(actor)) {
    options.push({ rollId: "species-gnome-gnomish-cunning", label: "Gnomish Cunning", description: "Gnomish Cunning: advantage on Intelligence, Wisdom, and Charisma saves" });
  }
  if (dnd5eSrdHasGnomeLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.gnomeLineageName) ?? stringValue(origin.gnomeLineage) ?? "Gnomish";
    options.push({ rollId: "species-gnome-lineage", label: "Gnomish Lineage", description: `${lineage}: lineage cantrips and feature spells/devices` });
  }
  if (dnd5eSrdHasHalflingLuck(actor)) {
    options.push({ rollId: "species-halfling-luck", label: "Luck", description: "Luck: reroll a 1 on a D20 Test" });
  }
  if (dnd5eSrdHasHalflingBrave(actor)) {
    options.push({ rollId: "species-halfling-brave", label: "Brave", description: "Brave: advantage on saves to avoid or end Frightened" });
  }
  if (dnd5eSrdHasHalflingNimbleness(actor)) {
    options.push({ rollId: "species-halfling-nimbleness", label: "Nimbleness", description: "Halfling Nimbleness: move through a larger creature's space" });
  }
  if (dnd5eSrdHasHalflingNaturallyStealthy(actor)) {
    options.push({ rollId: "species-halfling-naturally-stealthy", label: "Naturally Stealthy", description: "Naturally Stealthy: Hide while obscured by a Medium or larger creature" });
  }
  if (dnd5eSrdHasTieflingFiendishLegacy(actor)) {
    const origin = recordValue(actor.data.origin);
    const legacy = stringValue(origin.tieflingLegacyName) ?? stringValue(origin.tieflingLegacy) ?? "Fiendish";
    const resistance = stringValue(origin.tieflingResistance) ?? "chosen";
    options.push({ rollId: "species-tiefling-fiendish-legacy", label: "Fiendish Legacy", description: `${legacy} Legacy: ${resistance} resistance and lineage spells` });
  }
  if (dnd5eSrdHasTieflingOtherworldlyPresence(actor)) {
    options.push({ rollId: "species-tiefling-otherworldly-presence", label: "Presence", description: "Otherworldly Presence: Thaumaturgy uses your Fiendish Legacy spellcasting ability" });
  }
  if (dnd5eSrdHasOrcAdrenalineRush(actor)) {
    options.push({ rollId: "species-orc-adrenaline-rush", label: "Adrenaline Rush", description: `Adrenaline Rush: Dash as a Bonus Action and gain ${dnd5eSrdAdrenalineRushFormula(actor)} temp HP` });
  }
  if (dnd5eSrdHasOrcRelentlessEndurance(actor)) {
    options.push({ rollId: "species-orc-relentless-endurance", label: "Relentless", description: "Relentless Endurance: spend one use to drop to 1 HP instead of 0" });
  }
  return options;
}

function dnd5eSrdHasSpeciesFeature(actor: Actor, featureName: string, resourceKey?: string): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return features.includes(featureName) || Boolean(resourceKey && resourceKey in recordValue(actor.data.resources));
}

function dnd5eSrdHasDragonbornBreathWeapon(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Breath Weapon", "breathWeapon");
}

function dnd5eSrdHasDraconicFlight(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Draconic Flight", "draconicFlight"));
}

function dnd5eSrdHasDwarfStonecunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dwarf" || dnd5eSrdHasSpeciesFeature(actor, "Stonecunning", "stonecunning");
}

function dnd5eSrdHasGoliathGiantAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Giant Ancestry", "giantAncestry");
}

function dnd5eSrdHasGoliathLargeForm(actor: Actor): boolean {
  return numericValue(actor.data.level, 1) >= 5 && (stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Large Form", "largeForm"));
}

function dnd5eSrdHasHumanResourceful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Resourceful");
}

function dnd5eSrdHasHumanSkillful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Skillful");
}

function dnd5eSrdHasHumanVersatile(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Versatile");
}

function dnd5eSrdHasElfElvenLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Elven Lineage");
}

function dnd5eSrdHasElfFeyAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Fey Ancestry");
}

function dnd5eSrdHasElfTrance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Trance");
}

function dnd5eSrdHasGnomeGnomishCunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Cunning");
}

function dnd5eSrdHasGnomeLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Lineage");
}

function dnd5eSrdHasHalflingLuck(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Luck");
}

function dnd5eSrdHasHalflingBrave(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Brave");
}

function dnd5eSrdHasHalflingNimbleness(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Halfling Nimbleness");
}

function dnd5eSrdHasHalflingNaturallyStealthy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Naturally Stealthy");
}

function dnd5eSrdHasTieflingFiendishLegacy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Fiendish Legacy");
}

function dnd5eSrdHasTieflingOtherworldlyPresence(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Otherworldly Presence");
}

function dnd5eSrdHasOrcAdrenalineRush(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Adrenaline Rush", "adrenalineRush");
}

function dnd5eSrdHasOrcRelentlessEndurance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Relentless Endurance", "relentlessEndurance");
}

function dnd5eSrdHasSecondWind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Fighter" || features.includes("Second Wind") || "secondWind" in recordValue(actor.data.resources);
}

function dnd5eSrdHasActionSurge(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 2) || features.includes("Action Surge") || "actionSurge" in recordValue(actor.data.resources);
}

function dnd5eSrdHasTacticalMind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 2) || features.includes("Tactical Mind");
}

function dnd5eSrdHasTacticalShift(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 5) || features.includes("Tactical Shift");
}

function dnd5eSrdHasChampionCritical(actor: Actor): boolean {
  return dnd5eSrdHasChampionImprovedCritical(actor) || dnd5eSrdHasChampionSuperiorCritical(actor);
}

function dnd5eSrdHasChampionImprovedCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 3) || features.includes("Improved Critical");
}

function dnd5eSrdHasChampionRemarkableAthlete(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 3) || features.includes("Remarkable Athlete");
}

function dnd5eSrdHasChampionHeroicWarrior(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 10) || features.includes("Heroic Warrior");
}

function dnd5eSrdHasChampionSuperiorCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 15) || features.includes("Superior Critical");
}

function dnd5eSrdHasChampionSurvivor(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Fighter" && numericValue(actor.data.level, 1) >= 18) || features.includes("Survivor");
}

function dnd5eSrdHasChannelDivinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 2) || features.includes("Channel Divinity") || "channelDivinity" in recordValue(actor.data.resources);
}

function dnd5eSrdHasClericChannelDivinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 2) || features.includes("Divine Spark") || features.includes("Turn Undead") || features.includes("Sear Undead");
}

function dnd5eSrdHasSearUndead(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 5) || features.includes("Sear Undead");
}

function dnd5eSrdHasLifeDisciple(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 3) || features.includes("Disciple of Life");
}

function dnd5eSrdHasLifePreserveLife(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 3) || features.includes("Preserve Life");
}

function dnd5eSrdHasLifeBlessedHealer(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 6) || features.includes("Blessed Healer");
}

function dnd5eSrdHasLifeSupremeHealing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Cleric" && numericValue(actor.data.level, 1) >= 17) || features.includes("Supreme Healing");
}

function dnd5eSrdHasBardicInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Bard" || features.includes("Bardic Inspiration") || "bardicInspiration" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFontOfInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 5) || features.includes("Font of Inspiration");
}

function dnd5eSrdHasLoreCuttingWords(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 3) || features.includes("College of Lore") || features.includes("Cutting Words");
}

function dnd5eSrdHasLoreMagicalDiscoveries(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 6) || features.includes("Magical Discoveries");
}

function dnd5eSrdHasLorePeerlessSkill(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Bard" && numericValue(actor.data.level, 1) >= 14) || features.includes("Peerless Skill");
}

function dnd5eSrdHasLayOnHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Paladin" || features.includes("Lay On Hands") || "layOnHands" in recordValue(actor.data.resources);
}

function dnd5eSrdHasPaladinsSmite(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 2) || features.includes("Paladin's Smite") || "paladinsSmite" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFaithfulSteed(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 5) || features.includes("Faithful Steed") || "faithfulSteed" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDevotionSacredWeapon(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 3) || features.includes("Oath of Devotion") || features.includes("Sacred Weapon");
}

function dnd5eSrdHasDevotionAura(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 7) || features.includes("Aura of Devotion");
}

function dnd5eSrdHasDevotionSmiteProtection(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 15) || features.includes("Smite of Protection");
}

function dnd5eSrdHasDevotionHolyNimbus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Paladin" && numericValue(actor.data.level, 1) >= 20) || features.includes("Holy Nimbus") || "holyNimbus" in recordValue(actor.data.resources);
}

function dnd5eSrdHasHuntersMark(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Ranger" || features.includes("Favored Enemy") || features.includes("Hunter's Mark") || "favoredEnemy" in recordValue(actor.data.resources);
}

function dnd5eSrdHasHunterLore(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 3) || features.includes("Hunter") || features.includes("Hunter's Lore");
}

function dnd5eSrdHasHunterPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 3) || features.includes("Hunter's Prey");
}

function dnd5eSrdHasHunterDefensiveTactics(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 7) || features.includes("Defensive Tactics");
}

function dnd5eSrdHasHunterSuperiorPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 11) || features.includes("Superior Hunter's Prey");
}

function dnd5eSrdHasHunterSuperiorDefense(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Ranger" && numericValue(actor.data.level, 1) >= 15) || features.includes("Superior Hunter's Defense");
}

function dnd5eSrdHasMartialArts(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Monk" || features.includes("Martial Arts");
}

function dnd5eSrdHasMonkFocus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 2) || features.includes("Monk's Focus") || "focus" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDeflectAttacks(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 3) || features.includes("Deflect Attacks");
}

function dnd5eSrdHasStunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 5) || features.includes("Stunning Strike");
}

function dnd5eSrdHasOpenHandTechnique(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 3) || features.includes("Warrior of the Open Hand") || features.includes("Open Hand Technique");
}

function dnd5eSrdHasOpenHandWholeness(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 6) || features.includes("Wholeness of Body") || "wholenessOfBody" in recordValue(actor.data.resources);
}

function dnd5eSrdHasOpenHandFleetStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 11) || features.includes("Fleet Step");
}

function dnd5eSrdHasOpenHandQuiveringPalm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Monk" && numericValue(actor.data.level, 1) >= 17) || features.includes("Quivering Palm");
}

function dnd5eSrdHasInnateSorcery(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Sorcerer" || features.includes("Innate Sorcery") || "innateSorcery" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFontOfMagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 2) || features.includes("Font of Magic") || "sorceryPoints" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMetamagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 2) || features.includes("Metamagic");
}

function dnd5eSrdHasDraconicResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 3) || features.includes("Draconic Sorcery") || features.includes("Draconic Resilience");
}

function dnd5eSrdHasDraconicElementalAffinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 6) || features.includes("Elemental Affinity");
}

function dnd5eSrdHasDraconicWings(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 14) || features.includes("Dragon Wings") || "dragonWings" in recordValue(actor.data.resources);
}

function dnd5eSrdHasDraconicCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Sorcerer" && numericValue(actor.data.level, 1) >= 18) || features.includes("Dragon Companion") || "dragonCompanion" in recordValue(actor.data.resources);
}

function dnd5eSrdHasEvokerPotentCantrip(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 3) || features.includes("Evoker") || features.includes("Potent Cantrip");
}

function dnd5eSrdHasEvokerSculptSpells(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 6) || features.includes("Sculpt Spells");
}

function dnd5eSrdHasEvokerEmpoweredEvocation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 10) || features.includes("Empowered Evocation");
}

function dnd5eSrdHasEvokerOverchannel(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Wizard" && numericValue(actor.data.level, 1) >= 14) || features.includes("Overchannel") || "overchannel" in recordValue(actor.data.resources);
}

function dnd5eSrdHasEldritchInvocations(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Warlock" || features.includes("Eldritch Invocations");
}

function dnd5eSrdHasMagicalCunning(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 2) || features.includes("Magical Cunning") || "magicalCunning" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFiendDarkBlessing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 3) || features.includes("Fiend Patron") || features.includes("Dark One's Blessing");
}

function dnd5eSrdHasFiendDarkLuck(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 6) || features.includes("Dark One's Own Luck") || "fiendLuck" in recordValue(actor.data.resources);
}

function dnd5eSrdHasFiendResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 10) || features.includes("Fiendish Resilience");
}

function dnd5eSrdHasFiendHurlThroughHell(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Warlock" && numericValue(actor.data.level, 1) >= 14) || features.includes("Hurl Through Hell") || "hurlThroughHell" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildShape(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 2) || features.includes("Wild Shape") || "wildShape" in recordValue(actor.data.resources);
}

function dnd5eSrdHasWildCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 2) || features.includes("Wild Companion");
}

function dnd5eSrdHasWildResurgence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 5) || features.includes("Wild Resurgence") || "wildResurgence" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMoonCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 3) || features.includes("Circle of the Moon") || features.includes("Circle Forms");
}

function dnd5eSrdHasMoonImprovedCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 6) || features.includes("Improved Circle Forms");
}

function dnd5eSrdHasMoonlightStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 10) || features.includes("Moonlight Step") || "moonlightStep" in recordValue(actor.data.resources);
}

function dnd5eSrdHasMoonLunarForm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Druid" && numericValue(actor.data.level, 1) >= 14) || features.includes("Lunar Form");
}

function dnd5eSrdHasSneakAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Rogue" || features.includes("Sneak Attack");
}

function dnd5eSrdHasCunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 5) || features.includes("Cunning Strike");
}

function dnd5eSrdHasThiefFastHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 3) || features.includes("Fast Hands");
}

function dnd5eSrdHasThiefSecondStoryWork(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 3) || features.includes("Second-Story Work");
}

function dnd5eSrdHasThiefSupremeSneak(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 9) || features.includes("Supreme Sneak");
}

function dnd5eSrdHasThiefUseMagicDevice(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 13) || features.includes("Use Magic Device");
}

function dnd5eSrdHasThiefReflexes(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Rogue" && numericValue(actor.data.level, 1) >= 17) || features.includes("Thief's Reflexes");
}

function dnd5eSrdHasRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return stringValue(actor.data.class) === "Barbarian" || features.includes("Rage") || "rage" in recordValue(actor.data.resources);
}

function dnd5eSrdHasRecklessAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 2) || features.includes("Reckless Attack");
}

function dnd5eSrdHasBerserkerFrenzy(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 3) || features.includes("Frenzy");
}

function dnd5eSrdHasBerserkerMindlessRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 6) || features.includes("Mindless Rage");
}

function dnd5eSrdHasBerserkerRetaliation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 10) || features.includes("Retaliation");
}

function dnd5eSrdHasBerserkerIntimidatingPresence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return (stringValue(actor.data.class) === "Barbarian" && numericValue(actor.data.level, 1) >= 14) || features.includes("Intimidating Presence");
}

function dnd5eSrdSecondWindFormula(actor: Actor): string {
  const fighterLevel = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return `1d10+${fighterLevel}`;
}

function dnd5eSrdDivineSparkFormula(actor: Actor): string {
  return appendActionFormulaBonus(`${dnd5eSrdDivineSparkDice(actor)}d8`, genericFantasyAttributeModifier(actor, "wisdom"));
}

function dnd5eSrdDivineSparkDice(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 18) return 4;
  if (level >= 13) return 3;
  if (level >= 7) return 2;
  return 1;
}

function dnd5eSrdSearUndeadFormula(actor: Actor): string {
  return `${Math.max(1, genericFantasyAttributeModifier(actor, "wisdom"))}d8`;
}

function dnd5eSrdPreserveLifeFormula(actor: Actor): string {
  return String(Math.max(1, Math.floor(numericValue(actor.data.level, 1))) * 5);
}

function dnd5eSrdRageDamageBonus(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

function dnd5eSrdBerserkerFrenzyFormula(actor: Actor): string {
  return `${dnd5eSrdRageDamageBonus(actor)}d6`;
}

function dnd5eSrdBerserkerSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "strength");
}

function dnd5eSrdEvokerEmpoweredEvocationBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "intelligence"));
}

function dnd5eSrdBardicInspirationFormula(actor: Actor): string {
  return `1${dnd5eSrdBardicInspirationDie(actor)}`;
}

function dnd5eSrdBardicInspirationDie(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function dnd5eSrdLayOnHandsFormula(actor: Actor): string {
  const layOnHands = recordValue(recordValue(actor.data.resources).layOnHands);
  return String(Math.max(1, Math.min(5, numericValue(layOnHands.current, dnd5eSrdLayOnHandsMax(actor)))));
}

function dnd5eSrdLayOnHandsMax(actor: Actor): number {
  return Math.max(1, Math.floor(numericValue(actor.data.level, 1))) * 5;
}

function dnd5eSrdDivineSmiteFormula(actor: Actor): string {
  const slots = recordValue(actor.data.spellSlots);
  const slotLevel = Object.keys(slots).some((key) => key === "level2" && numericValue(recordValue(slots[key]).current, 0) > 0) ? 2 : 1;
  return `${slotLevel + 1}d8`;
}

function dnd5eSrdHuntersMarkFormula(actor: Actor): string {
  return numericValue(actor.data.level, 1) >= 20 ? "1d10" : "1d6";
}

function dnd5eSrdMartialArtsFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdMartialArtsDie(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 17) return "d12";
  if (level >= 11) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}

function dnd5eSrdUncannyMetabolismFormula(actor: Actor): string {
  return `1${dnd5eSrdMartialArtsDie(actor)}+${Math.max(1, Math.floor(numericValue(actor.data.level, 1)))}`;
}

function dnd5eSrdOpenHandWholenessFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "wisdom"));
}

function dnd5eSrdDeflectAttacksDamageFormula(actor: Actor): string {
  return appendActionFormulaBonus(`2${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdMonkSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "wisdom");
}

function dnd5eSrdDevotionSacredWeaponBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "charisma"));
}

function dnd5eSrdDevotionHolyNimbusFormula(actor: Actor): string {
  return String(Math.max(0, genericFantasyAttributeModifier(actor, "charisma")) + dnd5eSrdProficiencyBonus(actor));
}

function dnd5eSrdWildShapeDurationHours(actor: Actor): number {
  return Math.max(1, Math.floor(Math.max(1, numericValue(actor.data.level, 1)) / 2));
}

function dnd5eSrdMoonWildShapeMaxChallengeRating(actor: Actor): string {
  return String(Math.max(1, Math.floor(Math.max(1, numericValue(actor.data.level, 1)) / 3)));
}

function dnd5eSrdEldritchInvocationsKnown(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (level >= 18) return 10;
  if (level >= 15) return 9;
  if (level >= 12) return 8;
  if (level >= 9) return 7;
  if (level >= 7) return 6;
  if (level >= 5) return 5;
  if (level >= 2) return 3;
  return 1;
}

function dnd5eSrdMagicalCunningLimit(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const maxSlots = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
  return level >= 20 ? maxSlots : Math.ceil(maxSlots / 2);
}

function dnd5eSrdDragonbornBreathWeaponFormula(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  const dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return `${dice}d10`;
}

function dnd5eSrdAdrenalineRushFormula(actor: Actor): string {
  return String(dnd5eSrdProficiencyBonus(actor));
}

function dnd5eSrdSneakAttackFormula(actor: Actor): string {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return `${Math.ceil(level / 2)}d6`;
}

function dnd5eSrdRogueSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "dexterity");
}

function dnd5eSrdArcaneRecoverySelection(actor: Actor): Record<string, number> | undefined {
  if (actor.systemId !== "dnd-5e-srd" || stringValue(actor.data.class) !== "Wizard") return undefined;
  const arcaneRecovery = recordValue(recordValue(actor.data.resources).arcaneRecovery);
  if (numericValue(arcaneRecovery.current, 0) <= 0) return undefined;
  const slots = recordValue(actor.data.spellSlots);
  let remaining = Math.ceil(Math.max(1, numericValue(actor.data.level, 1)) / 2);
  const selection: Record<string, number> = {};
  for (let slotLevel = 1; slotLevel <= 5 && remaining > 0; slotLevel += 1) {
    const key = `level${slotLevel}`;
    const slot = recordValue(slots[key]);
    const expended = Math.max(0, numericValue(slot.max, 0) - numericValue(slot.current, 0));
    const recoverable = Math.min(expended, Math.floor(remaining / slotLevel));
    if (recoverable > 0) {
      selection[key] = recoverable;
      remaining -= recoverable * slotLevel;
    }
  }
  return Object.keys(selection).length > 0 ? selection : undefined;
}

function dnd5eSrdSpellSaveDc(actor: Actor): number {
  const className = stringValue(actor.data.class) ?? "Fighter";
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, dnd5eSrdPrimaryAbility(className));
}

function dnd5eSrdProficiencyBonus(actor: Actor): number {
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  return Math.max(2, Math.floor(numericValue(actor.data.proficiencyBonus, 2 + Math.floor((level - 1) / 4))));
}

function dnd5eSrdPrimaryAbility(className: string): string {
  if (className === "Bard") return "charisma";
  if (className === "Cleric") return "wisdom";
  if (className === "Druid") return "wisdom";
  if (className === "Paladin") return "charisma";
  if (className === "Ranger") return "wisdom";
  if (className === "Monk") return "dexterity";
  if (className === "Sorcerer") return "charisma";
  if (className === "Warlock") return "charisma";
  if (className === "Wizard") return "intelligence";
  if (className === "Rogue") return "dexterity";
  return "strength";
}

function dnd5eSrdTacticalShiftMovement(actor: Actor): number {
  return Math.floor(numericValue(actor.data.speed, 30) / 2);
}

function dnd5eSrdChampionCriticalLabel(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "Superior Critical" : "Improved Critical";
}

function dnd5eSrdChampionCriticalRange(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "18-20" : "19-20";
}

function dnd5eSrdChampionSurvivorFormula(actor: Actor): string {
  return String(5 + genericFantasyAttributeModifier(actor, "constitution"));
}

function dnd5eSrdAttacksPerAction(actor: Actor): number {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  const className = stringValue(actor.data.class);
  const hasExtraAttack = className === "Fighter" || ((className === "Barbarian" || className === "Paladin" || className === "Ranger" || className === "Monk") && numericValue(actor.data.level, 1) >= 5) || features.includes("Extra Attack");
  if (!hasExtraAttack) return 1;
  const level = Math.max(1, Math.floor(numericValue(actor.data.level, 1)));
  if (className === "Barbarian") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Paladin") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Ranger") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (className === "Monk") return level >= 5 || features.includes("Extra Attack") ? 2 : 1;
  if (level >= 20) return 4;
  if (level >= 11) return 3;
  if (level >= 5 || features.includes("Extra Attack")) return 2;
  return 1;
}

function dnd5eSrdItemActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  const attacksPerAction = dnd5eSrdAttacksPerAction(actor);
  return genericFantasyActionOptions(actor, items).map((option) => {
    const martialArtsFormula = dnd5eSrdMonkWeaponDamageFormulaForRoll(actor, items, option.rollId);
    const nextOption = martialArtsFormula ? { ...option, description: `${option.label}: ${martialArtsFormula}` } : option;
    if (attacksPerAction <= 1 || !dnd5eSrdIsWeaponDamageOption(actor, items, option.rollId)) return nextOption;
    return { ...nextOption, description: `${nextOption.description}; ${attacksPerAction} attacks/action` };
  });
}

function dnd5eSrdIsWeaponDamageOption(actor: Actor, items: Item[], rollId: string): boolean {
  return items.filter((item) => item.actorId === actor.id).some((item) => {
    const data = recordValue(item.data);
    if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
    return rollId === `item-${item.id}-damage` || rollId === `item-${item.id}-versatile-damage`;
  });
}

function dnd5eSrdMonkWeaponDamageFormulaForRoll(actor: Actor, items: Item[], rollId: string): string | undefined {
  if (!dnd5eSrdHasMartialArts(actor)) return undefined;
  const item = items.filter((candidate) => candidate.actorId === actor.id).find((candidate) => rollId.startsWith(`item-${candidate.id}-`));
  if (!item) return undefined;
  const data = recordValue(item.data);
  if (!dnd5eSrdIsMonkWeapon(data)) return undefined;
  const weaponDamage = rollId === `item-${item.id}-versatile-damage` ? stringValue(data.versatileDamage) : stringValue(data.damage);
  const damageDie = dnd5eSrdLargerDamageDie(weaponDamage, `1${dnd5eSrdMartialArtsDie(actor)}`);
  return appendActionFormulaBonus(damageDie, genericFantasyAttributeModifier(actor, "dexterity"));
}

function dnd5eSrdIsMonkWeapon(data: Record<string, unknown>): boolean {
  if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
  const properties = Array.isArray(data.properties) ? data.properties.map(String).map((property) => property.toLowerCase()) : [];
  return properties.includes("light") || properties.includes("thrown") || properties.includes("versatile") || stringValue(data.compendiumId) === "spear";
}

function dnd5eSrdLargerDamageDie(left: string | undefined, right: string): string {
  const leftSides = dnd5eSrdDamageDieSides(left);
  const rightSides = dnd5eSrdDamageDieSides(right);
  if (!left || rightSides > leftSides) return right;
  return left;
}

function dnd5eSrdDamageDieSides(value: string | undefined): number {
  const match = /^1d(\d+)$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : 0;
}

function genericFantasyActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "spell" ? "spell" : "item";
    const ability = stringValue(data.ability);
    const damage = stringValue(data.damage);
    if (damage && ability) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${appendActionFormulaBonus(damage, genericFantasyAttributeModifier(actor, ability))}` });
    const damageFormula = stringValue(data.damageFormula);
    if (damageFormula) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${resolveGenericFantasyActionFormula(damageFormula, actor)}` });
    const secondaryDamageFormula = stringValue(data.secondaryDamageFormula);
    if (secondaryDamageFormula) options.push({ rollId: `${prefix}-${item.id}-secondary-damage`, label: `${item.name} Secondary Damage`, description: `${item.name} Secondary Damage: ${resolveGenericFantasyActionFormula(secondaryDamageFormula, actor)}` });
    const versatileDamage = stringValue(data.versatileDamage);
    if (versatileDamage && ability) options.push({ rollId: `${prefix}-${item.id}-versatile-damage`, label: `${item.name} Versatile`, description: `${item.name} Versatile: ${appendActionFormulaBonus(versatileDamage, genericFantasyAttributeModifier(actor, ability))}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${resolveGenericFantasyActionFormula(healingFormula, actor)}` });
    const effectFormula = stringValue(data.effectFormula);
    const effectAbility = stringValue(data.saveDcAbility);
    if (effectFormula) options.push({ rollId: `${prefix}-${item.id}-effect`, label: `${item.name} Effect`, description: `${item.name} Effect: ${effectAbility ? appendActionFormulaBonus(effectFormula, genericFantasyAttributeModifier(actor, effectAbility)) : effectFormula}` });
    return options;
  });
}

function stellarFrontiersActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "talent" ? "talent" : "gear";
    const aptitude = stringValue(data.aptitude);
    const damage = stringValue(data.damage);
    if (damage) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${aptitude ? appendActionFormulaBonus(damage, stellarFrontiersAptitudeModifier(actor, aptitude)) : damage}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${healingFormula}` });
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-boost`, label: `${item.name} Boost`, description: `${item.name} Boost: ${aptitude ? appendActionFormulaBonus(bonusFormula, stellarFrontiersAptitudeModifier(actor, aptitude)) : bonusFormula}` });
    return options;
  });
}

function mysticNoirActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "ritual" ? "ritual" : "clue";
    const skill = stringValue(data.skill);
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-insight`, label: `${item.name} Insight`, description: `${item.name} Insight: ${skill ? appendActionFormulaBonus(bonusFormula, mysticNoirSkillModifier(actor, skill)) : bonusFormula}` });
    const protectionFormula = stringValue(data.protectionFormula);
    if (protectionFormula) options.push({ rollId: `${prefix}-${item.id}-ward`, label: `${item.name} Ward`, description: `${item.name} Ward: ${skill ? appendActionFormulaBonus(protectionFormula, mysticNoirSkillModifier(actor, skill)) : protectionFormula}` });
    return options;
  });
}

function genericFantasyAttributeModifier(actor: Actor, ability: string): number {
  const attributes = recordValue(actor.data.attributes);
  return Math.floor((numericValue(attributes[ability], 10) - 10) / 2);
}

function stellarFrontiersAptitudeModifier(actor: Actor, aptitude: string): number {
  const aptitudes = recordValue(actor.data.aptitudes);
  return numericValue(aptitudes[aptitude], 0);
}

function mysticNoirSkillModifier(actor: Actor, skill: string): number {
  const skills = recordValue(actor.data.skills);
  return numericValue(skills[skill], 1);
}

function resolveGenericFantasyActionFormula(formula: string, actor: Actor): string {
  return formula.replace(/([+-]?)@attributes\.([A-Za-z0-9_-]+)/g, (_match, operator: string, ability: string) => {
    const modifier = genericFantasyAttributeModifier(actor, ability);
    const signedModifier = operator === "-" ? -modifier : modifier;
    return operator ? formatSignedActionNumber(signedModifier) : String(signedModifier);
  });
}

function appendActionFormulaBonus(formula: string, bonus: number): string {
  return `${formula}${formatSignedActionNumber(bonus)}`;
}

function formatSignedActionNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function tokenBrightVisionPatch(value: string): TokenVisionPatch {
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 ? { brightVisionRadius: radius } : { brightVisionRadius: null };
}

function formatFogHistoryEntry(entry: FogHistoryEntry): string {
  const shape = entry.region?.shape ?? "circle";
  const mode = entry.region?.mode ?? "reveal";
  const target = entry.targetHistoryId ? ` -> ${entry.targetHistoryId}` : "";
  return `${entry.createdAt}: ${entry.action} ${entry.fogId}${target} (${shape}, ${mode})`;
}

function formatVisionPointSample(sample: VisionPointSample): string {
  const blockers = sample.blockedBy.slice(0, 4).map((blocker) => {
    const intersection = blocker.intersection ? ` at ${formatVisionPoint(blocker.intersection)}` : "";
    const distance = blocker.distanceFromSource !== undefined ? `, ${formatVisionDistance(blocker.distanceFromSource)} from source` : "";
    return `- ${blocker.wallId} blocks ${blocker.source}:${blocker.sourceId}${intersection}${distance}`;
  });
  return [
    `Vision sample ${formatVisionPoint(sample.point)}: ${sample.visible ? "visible" : "blocked"}`,
    `Fog active: ${sample.fogActive ? "yes" : "no"}`,
    `Revealed by: ${sample.revealedBy.length}`,
    `Hidden by: ${sample.hiddenBy.length}`,
    `Illuminated by: ${sample.illuminatedBy.length}`,
    `Blocked by: ${sample.blockedBy.length}`,
    ...blockers
  ].join("\n");
}

function formatVisionPoint(point: VisionPoint): string {
  return `${formatVisionDistance(point.x)},${formatVisionDistance(point.y)}`;
}

function formatVisionDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function titleCaseLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contentImportStatusClass(status: ContentImportBatch["status"]): string {
  if (status === "applied") return "status-pill completed";
  if (status === "rolled_back") return "status-pill running";
  if (status === "deleted") return "status-pill failed";
  return "status-pill";
}

function readinessStatusClass(status: "ready" | "action" | "missing"): string {
  if (status === "ready") return "status-pill completed";
  if (status === "missing") return "status-pill running";
  return "status-pill failed";
}

function jobStatusClass(status: AdminJob["status"]): string {
  if (status === "succeeded") return "status-pill completed";
  if (status === "failed" || status === "cancelled") return "status-pill failed";
  if (status === "running") return "status-pill running";
  return "status-pill";
}

function formatRollTermName(term: DiceRoll["terms"][number], index: number): string {
  if (term.type === "die") {
    const count = term.count ?? Math.max(1, term.results?.length ?? 1);
    return `${count}d${term.sides ?? "?"}`;
  }
  if (term.type === "modifier") {
    return `Modifier ${formatSignedActionNumber(term.value ?? 0)}`;
  }
  return term.path ? `Binding ${term.path}` : `Binding ${index + 1}`;
}

function rollTermTotal(term: DiceRoll["terms"][number]): number | undefined {
  if (term.type === "die") {
    const values = term.kept && term.kept.length > 0 ? term.kept : term.results;
    return values?.reduce((total, value) => total + value, 0);
  }
  return typeof term.value === "number" ? term.value : undefined;
}

function formatRollTermDetail(term: DiceRoll["terms"][number]): string {
  if (term.type === "die") {
    const parts = [
      term.results && term.results.length > 0 ? `rolled ${term.results.join(", ")}` : "no results",
      term.kept && term.kept.length > 0 ? `kept ${term.kept.join(", ")}` : undefined,
      term.exploded && term.exploded.length > 0 ? `exploded ${term.exploded.join(", ")}` : undefined
    ].filter(Boolean);
    return parts.join(" - ");
  }
  if (term.type === "modifier") {
    return "static modifier";
  }
  return term.value === undefined ? "resolved binding" : `resolved ${formatSignedActionNumber(term.value)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createdSceneIdFromProposal(proposal: Proposal): string | undefined {
  for (const change of proposal.changesJson) {
    if (change.entity !== "scene" || change.action !== "create") continue;
    const data = recordValue(change.data);
    if (typeof data.id === "string" && data.id.trim()) return data.id;
  }
  return undefined;
}

function JournalPanel(props: { journals: JournalEntry[]; title: string; setTitle(value: string): void; body: string; setBody(value: string): void; visibility: Visibility; setVisibility(value: Visibility): void; tags: string; setTags(value: string): void; onCreate(): void; canCreate: boolean }) {
  const publicCount = props.journals.filter((journal) => journal.visibility === "public").length;
  const gmOnlyCount = props.journals.filter((journal) => journal.visibility === "gm_only").length;
  const taggedCount = props.journals.filter((journal) => journal.tags.length > 0).length;
  return (
    <div className="panel-stack">
      <header className="panel-hero">
        <div>
          <div className="section-title">Journal</div>
          <h2>Campaign Notes</h2>
          <p className="panel-subtitle">{formatNumber(props.journals.length)} entries</p>
        </div>
        <button className="icon-button" title="Create journal entry" aria-label="Create journal entry" onClick={props.onCreate} disabled={!props.canCreate}>
          <Plus size={16} />
        </button>
      </header>
      <section className="metric-grid panel-summary-grid" aria-label="Journal summary">
        <MetricTile label="Public" value={formatNumber(publicCount)} />
        <MetricTile label="GM Only" value={formatNumber(gmOnlyCount)} />
        <MetricTile label="Tagged" value={formatNumber(taggedCount)} />
        <MetricTile label="Drafting" value={props.title.trim() ? "Active" : "Idle"} />
      </section>
      <form
        className="operator-section content-import-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onCreate();
        }}
      >
        <label>
          <span>Title</span>
          <input aria-label="Journal title" value={props.title} placeholder="Session note" onChange={(event) => props.setTitle(event.target.value)} />
        </label>
        <label>
          <span>Visibility</span>
          <select aria-label="Journal visibility" value={props.visibility} onChange={(event) => props.setVisibility(event.target.value as Visibility)}>
            <option value="gm_only">GM only</option>
            <option value="public">Public</option>
            <option value="specific_players">Specific players</option>
            <option value="specific_characters">Specific characters</option>
          </select>
        </label>
        <label>
          <span>Tags</span>
          <input aria-label="Journal tags" value={props.tags} placeholder="prep, clue" onChange={(event) => props.setTags(event.target.value)} />
        </label>
        <label>
          <span>Body</span>
          <textarea aria-label="Journal body" value={props.body} onChange={(event) => props.setBody(event.target.value)} />
        </label>
        <button className="primary-button wide" type="submit" disabled={!props.canCreate || !props.title.trim()}>
          <Plus size={16} /> Create Entry
        </button>
      </form>
      <section className="journal-list" aria-label="Journal entries">
        {props.journals.length === 0 ? (
          <div className="empty-state compact">No journal entries yet.</div>
        ) : (
          props.journals.map((journal) => (
            <article className="journal-entry" key={journal.id}>
              <div className="operator-heading">
                <span>{journal.visibility}</span>
                {journal.tags.length > 0 && <strong>{journal.tags.slice(0, 2).join(", ")}</strong>}
              </div>
              <h3>{journal.title}</h3>
              <p>{journal.body}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ChatPanel(props: { command: string; setCommand(value: string): void; replyTarget?: ChatMessage; messages: ChatMessage[]; rolls: DiceRoll[]; members: Snapshot["members"]; search: string; setSearch(value: string): void; typeFilter: MessageType | "all"; setTypeFilter(value: MessageType | "all"): void; visibilityFilter: ChatMessage["visibility"] | "all"; setVisibilityFilter(value: ChatMessage["visibility"] | "all"): void; canModerate: boolean; onSubmitCommand(): Promise<void>; onClearReply(): void; onReplyMessage(messageId: string): void; onModerateMessage(message: ChatMessage, moderationStatus: ChatModerationResolution): Promise<void>; onDeleteMessage(message: ChatMessage): Promise<void>; onExport(format: ChatExportFormat): Promise<void> }) {
  const [exportFormat, setExportFormat] = useState<ChatExportFormat>("json");
  const types: Array<MessageType | "all"> = ["all", "plain", "ooc", "emote", "gm", "whisper", "roll", "plugin"];
  const visibilities: Array<ChatMessage["visibility"] | "all"> = ["all", "public", "gm_only", "whisper"];
  const memberNames = new Map(props.members.map((member) => [member.user.id, member.user.displayName]));
  const messageById = new Map(props.messages.map((message) => [message.id, message]));
  const normalizedSearch = props.search.trim().toLocaleLowerCase();
  const replyMessages = props.messages.filter((message) => message.replyToMessageId);
  const replyThreads = Array.from(
    replyMessages.reduce((groups, message) => {
      const parentId = message.replyToMessageId!;
      const existing = groups.get(parentId);
      if (existing) {
        existing.replies.push(message);
        existing.latestAt = message.createdAt > existing.latestAt ? message.createdAt : existing.latestAt;
      } else {
        groups.set(parentId, {
          parentId,
          parent: messageById.get(parentId),
          replies: [message],
          latestAt: message.createdAt
        });
      }
      return groups;
    }, new Map<string, { parentId: string; parent?: ChatMessage; replies: ChatMessage[]; latestAt: string }>())
  ).map(([, thread]) => thread).sort((left, right) => right.latestAt.localeCompare(left.latestAt));
  const moderationMessages = props.messages.filter((message) => message.visibility !== "public" || message.type === "gm" || message.type === "plugin" || message.type === "ai");
  const moderationResolutionFor = (message: ChatMessage) => message.moderationStatus ?? "open";
  const followUpCount = moderationMessages.filter((message) => moderationResolutionFor(message) === "follow_up").length;
  const reviewedCount = moderationMessages.filter((message) => moderationResolutionFor(message) === "reviewed").length;
  const openReviewCount = moderationMessages.length - followUpCount - reviewedCount;
  const whisperCount = props.messages.filter((message) => message.visibility === "whisper").length;
  const gmOnlyCount = props.messages.filter((message) => message.visibility === "gm_only" || message.type === "gm").length;
  const automationCount = props.messages.filter((message) => message.type === "plugin" || message.type === "ai").length;
  const moderationThreads = Array.from(
    moderationMessages.reduce((groups, message) => {
      const key = `${message.visibility}:${message.type}:${message.userId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.messages.push(message);
        existing.latestAt = message.createdAt > existing.latestAt ? message.createdAt : existing.latestAt;
      } else {
        groups.set(key, {
          key,
          userId: message.userId,
          type: message.type,
          visibility: message.visibility,
          messages: [message],
          latestAt: message.createdAt
        });
      }
      return groups;
    }, new Map<string, { key: string; userId: string; type: MessageType; visibility: ChatMessage["visibility"]; messages: ChatMessage[]; latestAt: string }>())
  ).map(([, group]) => group).sort((left, right) => right.latestAt.localeCompare(left.latestAt));
  const filteredMessages = props.messages
    .filter((message) => props.typeFilter === "all" || message.type === props.typeFilter)
    .filter((message) => props.visibilityFilter === "all" || message.visibility === props.visibilityFilter)
    .filter((message) => !normalizedSearch || [message.body, message.type, message.visibility].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)))
    .slice()
    .reverse();

  return (
    <div className="panel-stack">
      <div className="panel-heading">
        <div>
          <div className="section-title">Chat History</div>
          <p className="panel-subtitle">{formatNumber(filteredMessages.length)} of {formatNumber(props.messages.length)} messages</p>
        </div>
        <div className="admin-actions">
          <label>
            <span>Export format</span>
            <select aria-label="Chat export format" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ChatExportFormat)}>
              <option value="json">JSON</option>
              <option value="ndjson">NDJSON</option>
            </select>
          </label>
          <button className="ghost-button" title="Export chat history" aria-label="Export chat history" onClick={() => props.onExport(exportFormat).catch(console.error)}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>
      <section className="operator-section chat-room" aria-label="Chat messages">
        <div className="operator-heading">
          <div>
            <div className="section-title">Messages</div>
            <p className="panel-subtitle">Type normally or use slash commands.</p>
          </div>
          <MessageSquare size={15} />
        </div>
        <div className="chat-history-list chat-room-messages">
          {filteredMessages.length === 0 ? (
            <div className="empty-state compact">No chat messages match this view.</div>
          ) : (
            filteredMessages.map((message) => (
              <article className="chat-history-entry" key={message.id}>
                <div className="operator-heading">
                  <div>
                    <h3>{titleCaseLabel(message.type)}</h3>
                    <p>{formatDateTime(message.createdAt)}</p>
                  </div>
                  <span className="status-pill">{message.visibility}</span>
                </div>
                {message.replyToMessageId && (
                  <div className="operator-row tool-call-row" aria-label="Chat reply context">
                    <span>Reply to</span>
                    <strong>{messageById.get(message.replyToMessageId)?.body.slice(0, 80) ?? message.replyToMessageId}</strong>
                  </div>
                )}
                <p>{message.body}</p>
                <div className="admin-meta">
                  <span>{memberNames.get(message.userId) ?? message.userId}</span>
                  {message.sceneId && <span>{message.sceneId}</span>}
                  {message.rollId && <span>roll {message.rollId}</span>}
                  {message.visibility === "whisper" && <span>to {message.recipientUserIds.map((recipientId) => memberNames.get(recipientId) ?? recipientId).join(", ")}</span>}
                </div>
                <div className="button-row">
                  <button className="ghost-button" type="button" onClick={() => props.onReplyMessage(message.id)}>
                    <MessageSquare size={14} /> Reply
                  </button>
                </div>
                {props.canModerate && (
                  <div className="button-row">
                    <button className="danger-button" title="Delete chat message" aria-label="Delete chat message" onClick={() => props.onDeleteMessage(message).catch(console.error)}>
                      <X size={14} /> Delete
                    </button>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
        <form className="chat-command-panel" aria-label="Chat command line" onSubmit={(event) => { event.preventDefault(); props.onSubmitCommand().catch(console.error); }}>
          {props.replyTarget && (
            <div className="operator-row tool-call-row" role="status" aria-label="Chat reply target">
              <span>Replying to {props.replyTarget.body.slice(0, 64)}</span>
              <button className="ghost-button small" type="button" onClick={props.onClearReply}>Clear reply</button>
            </div>
          )}
          <div className="chat-command-input-row">
            <MessageSquare size={16} />
            <input aria-label="Chat command line" value={props.command} placeholder="Message, /1d20 + 2, /roll 2d6, /gm note, /w player message" onChange={(event) => props.setCommand(event.target.value)} />
            <button className="icon-button" type="submit" title="Send chat command" aria-label="Send chat command">
              <Send size={16} />
            </button>
          </div>
          <div className="chat-command-help">
            <code>/1d20 + 2</code>
            <code>/roll 2d6</code>
            <code>/gm private note</code>
            <code>/w player message</code>
            <code>/me emote</code>
          </div>
        </form>
      </section>
      <section className="metric-grid panel-summary-grid" aria-label="Chat summary">
        <MetricTile label="Filtered" value={formatNumber(filteredMessages.length)} />
        <MetricTile label="Rolls" value={formatNumber(props.rolls.length)} />
        <MetricTile label="Replies" value={formatNumber(replyMessages.length)} />
        <MetricTile label="Review" value={formatNumber(openReviewCount)} />
      </section>
      <div className="operator-section content-import-form">
        <div className="admin-form-grid">
          <label>
            <span>Search</span>
            <input aria-label="Chat history search" value={props.search} placeholder="Message text" onChange={(event) => props.setSearch(event.target.value)} />
          </label>
          <label>
            <span>Type</span>
            <select aria-label="Chat history type" value={props.typeFilter} onChange={(event) => props.setTypeFilter(event.target.value as MessageType | "all")}>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "All types" : titleCaseLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select aria-label="Chat history visibility" value={props.visibilityFilter} onChange={(event) => props.setVisibilityFilter(event.target.value as ChatMessage["visibility"] | "all")}>
              {visibilities.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {visibility === "all" ? "All visibility" : titleCaseLabel(visibility)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <section className="operator-section" aria-label="Chat reply threads">
        <div className="operator-heading">
          <div className="section-title">Reply Threads</div>
          <strong>{formatNumber(replyMessages.length)} replies</strong>
        </div>
        {replyThreads.length === 0 ? (
          <div className="empty-state compact">No threaded replies in this view.</div>
        ) : (
          <div className="operator-list">
            {replyThreads.slice(0, 4).map((thread) => (
              <article className="operator-item admin-item" key={`reply-thread-${thread.parentId}`}>
                <div className="operator-row">
                  <span>{thread.parent ? memberNames.get(thread.parent.userId) ?? thread.parent.userId : "Missing parent"}</span>
                  <strong>{formatNumber(thread.replies.length)} replies</strong>
                </div>
                <p>{thread.parent?.body ?? thread.parentId}</p>
                <p>Latest reply {formatDateTime(thread.latestAt)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      {props.canModerate && (
        <section className="operator-section" aria-label="Chat moderation review">
          <div className="operator-heading">
            <div className="section-title">Moderation Review</div>
            <Shield size={15} />
          </div>
          <div className="metric-grid">
            <MetricTile label="Reviewable" value={formatNumber(moderationMessages.length)} />
            <MetricTile label="Open" value={formatNumber(openReviewCount)} />
            <MetricTile label="Follow Up" value={formatNumber(followUpCount)} />
            <MetricTile label="Reviewed" value={formatNumber(reviewedCount)} />
            <MetricTile label="Whispers" value={formatNumber(whisperCount)} />
            <MetricTile label="GM Only" value={formatNumber(gmOnlyCount)} />
            <MetricTile label="Automation" value={formatNumber(automationCount)} />
          </div>
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => props.setVisibilityFilter("whisper")}>Whispers</button>
            <button className="ghost-button" type="button" onClick={() => props.setVisibilityFilter("gm_only")}>GM only</button>
            <button className="ghost-button" type="button" onClick={() => props.setTypeFilter("ai")}>AI messages</button>
            <button className="ghost-button" type="button" onClick={() => { props.setTypeFilter("all"); props.setVisibilityFilter("all"); props.setSearch(""); }}>All chat</button>
          </div>
          <div className="operator-list">
            {moderationThreads.length > 0 && (
              <section className="operator-section" aria-label="Chat moderation threads">
                <div className="operator-heading">
                  <div className="section-title">Threads</div>
                  <strong>{formatNumber(moderationThreads.length)} groups</strong>
                </div>
                {moderationThreads.slice(0, 4).map((thread) => (
                  <article className="operator-item admin-item" key={thread.key}>
                    <div className="operator-row">
                      <span className="status-pill">{thread.visibility}</span>
                      <strong>{formatNumber(thread.messages.length)} messages</strong>
                    </div>
                    <h3>{memberNames.get(thread.userId) ?? thread.userId} - {titleCaseLabel(thread.type)}</h3>
                    <p>Latest {formatDateTime(thread.latestAt)}</p>
                    <button className="ghost-button" type="button" onClick={() => { props.setTypeFilter(thread.type); props.setVisibilityFilter(thread.visibility); }}>
                      <Shield size={14} /> Review thread
                    </button>
                  </article>
                ))}
              </section>
            )}
            {moderationMessages.length === 0 ? (
              <div className="empty-state compact">No messages need moderation review.</div>
            ) : (
              moderationMessages
                .slice()
                .reverse()
                .slice(0, 4)
                .map((message) => (
                  <div className="operator-row moderation-resolution-row" key={`moderation-${message.id}`}>
                    <span>{titleCaseLabel(message.visibility)} - {titleCaseLabel(message.type)}</span>
                    <strong>{memberNames.get(message.userId) ?? message.userId}</strong>
                    <span className="status-pill">{titleCaseLabel(moderationResolutionFor(message))}</span>
                    <button className="ghost-button" type="button" onClick={() => props.onModerateMessage(message, "follow_up").catch(console.error)}>Mark follow up</button>
                    <button className="ghost-button" type="button" onClick={() => props.onModerateMessage(message, "reviewed").catch(console.error)}>Mark reviewed</button>
                  </div>
                ))
            )}
          </div>
        </section>
      )}
      <div className="panel-heading">
        <div>
          <div className="section-title">Roll History</div>
          <p className="panel-subtitle">{formatNumber(props.rolls.length)} visible rolls</p>
        </div>
      </div>
      <div className="roll-history-list">
        {props.rolls.length === 0 ? (
          <div className="empty-state compact">No dice rolls visible in this campaign.</div>
        ) : (
          props.rolls
            .slice()
            .reverse()
            .map((roll) => (
              <article className="roll-history-entry" key={roll.id}>
                <div className="operator-heading">
                  <div>
                    <h3>{roll.label || roll.formula}</h3>
                    <p>{formatDateTime(roll.createdAt)} - {roll.formula}</p>
                  </div>
                  <span className="status-pill completed">{formatNumber(roll.total)}</span>
                </div>
                <div className="admin-meta">
                  <span>{roll.visibility}</span>
                  <span>{roll.userId}</span>
                  <span>{roll.terms.length} terms</span>
                </div>
                <div className="roll-term-breakdown" aria-label={`Roll term breakdown for ${roll.label || roll.formula}`}>
                  <strong>Term breakdown</strong>
                  <ul>
                    {roll.terms.map((term, index) => {
                      const termTotal = rollTermTotal(term);
                      return (
                        <li className="roll-term-row" key={`${roll.id}-term-${index}`}>
                          <div>
                            <span>{formatRollTermName(term, index)}</span>
                            <p>{formatRollTermDetail(term)}</p>
                          </div>
                          {termTotal !== undefined && <span className="status-pill">{formatSignedActionNumber(termTotal)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </article>
            ))
        )}
      </div>
    </div>
  );
}

function CombatPanel(props: { combat?: Combat; recentCombats: Combat[]; auditLogs: AuditLog[]; onStart(): void; onNext(combat: Combat): void; onPrevious(combat: Combat): void; onEnd(combat: Combat): void; onUpdateCombatant(combat: Combat, combatantId: string, patch: Partial<Combat["combatants"][number]>): void; onConfirmAction(combat: Combat, action: CombatAction): void; onRejectAction(combat: Combat, action: CombatAction): void; canManage: boolean }) {
  const combatants = props.combat?.combatants ?? [];
  const activeCombatant = props.combat && combatants.length > 0 ? combatants[props.combat.turnIndex] ?? combatants[0] : undefined;
  const readyCount = combatants.filter((combatant) => combatant.readiness === "ready").length;
  const defeatedCount = combatants.filter((combatant) => combatant.defeated).length;
  const pendingActions = props.combat?.actions?.filter((action) => action.status === "pending_gm") ?? [];
  return (
    <div className="panel-stack">
      <header className="panel-hero combat-hero">
        <div>
          <div className="section-title">Combat Tracker</div>
          <h2>{props.combat ? `Round ${props.combat.round}` : "No Active Combat"}</h2>
          <p className="panel-subtitle">{activeCombatant ? `Turn: ${activeCombatant.name}` : "Start from scene tokens when ready"}</p>
        </div>
        <button className="icon-button" title="Start combat" aria-label="Start combat" onClick={props.onStart} disabled={!props.canManage}>
          <Swords size={16} />
        </button>
      </header>
      {props.combat ? (
        <>
          <section className="metric-grid panel-summary-grid" aria-label="Combat summary">
            <MetricTile label="Round" value={formatNumber(props.combat.round)} />
            <MetricTile label="Combatants" value={formatNumber(combatants.length)} />
            <MetricTile label="Ready" value={formatNumber(readyCount)} />
            <MetricTile label="Defeated" value={formatNumber(defeatedCount)} />
          </section>
          <div className="admin-actions">
            <button className="ghost-button" onClick={() => props.onPrevious(props.combat!)} disabled={!props.canManage || combatants.length === 0}>
              <RotateCcw size={14} /> Previous
            </button>
            <button className="ghost-button" onClick={() => props.onNext(props.combat!)} disabled={!props.canManage || combatants.length === 0}>
              <ChevronRight size={14} /> Next
            </button>
            <button className="ghost-button" onClick={() => props.onEnd(props.combat!)} disabled={!props.canManage}>
              <X size={14} /> End
            </button>
          </div>
          {pendingActions.length > 0 && (
            <section className="admin-list" aria-label="Pending combat actions">
              <div className="section-title">Pending GM Confirmation</div>
              {pendingActions.map((action) => (
                <article className="operator-item admin-item" key={action.id}>
                  <div className="combatant-header">
                    <div>
                      <span>{action.actorName}</span>
                      <strong>{action.actionLabel}</strong>
                    </div>
                    <span className="status-pill">pending</span>
                  </div>
                  <p>{action.resultSummary ?? combatActionRollSummary(action)}</p>
                  <div className="admin-meta">
                    <span>{action.targetActorIds.length} target{action.targetActorIds.length === 1 ? "" : "s"}</span>
                    <span>{action.consumeResources ? "resources spent on confirm" : "no resource spend"}</span>
                    <span>{action.applyEffect ? "effect previewed" : "roll only"}</span>
                  </div>
                  <div className="admin-actions">
                    <button className="ghost-button" onClick={() => props.onRejectAction(props.combat!, action)} disabled={!props.canManage}>
                      <X size={14} /> Reject
                    </button>
                    <button className="primary-button" onClick={() => props.onConfirmAction(props.combat!, action)} disabled={!props.canManage}>
                      <Check size={14} /> Confirm
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
          {combatants.map((combatant, index) => (
            <div className={index === props.combat?.turnIndex ? "combatant active" : "combatant"} key={combatant.id}>
              <div className="combatant-header">
                <div>
                  <span>{combatant.defeated ? "defeated" : combatant.readiness === "ready" ? "ready" : combatant.readiness === "delayed" ? "delayed" : index === props.combat?.turnIndex ? "active" : "waiting"}</span>
                  <strong>{combatant.name}</strong>
                </div>
                <span className="status-pill">{index === props.combat?.turnIndex ? "turn" : `#${index + 1}`}</span>
              </div>
              <div className="combatant-controls">
                <label>
                  <span>Initiative</span>
                  <input aria-label={`${combatant.name} initiative`} type="number" value={combatant.initiative} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { initiative: Number(event.target.value) })} />
                </label>
                <label>
                  <span>Readiness</span>
                  <select aria-label={`${combatant.name} readiness`} value={combatant.readiness ?? "normal"} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { readiness: event.target.value as NonNullable<typeof combatant.readiness> })}>
                    <option value="normal">Normal turn</option>
                    <option value="ready">Ready action</option>
                    <option value="delayed">Delayed turn</option>
                  </select>
                </label>
                <label>
                  <span>Conditions</span>
                  <input aria-label={`${combatant.name} combat conditions`} value={formatCombatantConditions(combatant)} disabled={!props.canManage} placeholder="prone, stunned" onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { conditions: parseCombatantConditions(event.target.value) })} />
                </label>
                <label>
                  <span>Successes</span>
                  <input aria-label={`${combatant.name} death save successes`} type="number" min={0} max={3} value={combatant.deathSaveSuccesses ?? 0} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveSuccesses: boundedCombatCounter(event.target.value) })} />
                </label>
                <label>
                  <span>Failures</span>
                  <input aria-label={`${combatant.name} death save failures`} type="number" min={0} max={3} value={combatant.deathSaveFailures ?? 0} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { deathSaveFailures: boundedCombatCounter(event.target.value) })} />
                </label>
              </div>
              <div className="combatant-flags">
                <label className="inline-check">
                  <input type="checkbox" checked={combatant.defeated} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { defeated: event.target.checked })} />
                  <span>Defeated</span>
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={combatant.resourceUsed ?? false} disabled={!props.canManage} onChange={(event) => props.onUpdateCombatant(props.combat!, combatant.id, { resourceUsed: event.target.checked })} />
                  <span>{combatant.resourceLabel ? `${combatant.resourceLabel} used` : "Resource used"}</span>
                </label>
              </div>
              <div className="account-summary">
                Death saves {combatant.deathSaveSuccesses ?? 0}/3 successes, {combatant.deathSaveFailures ?? 0}/3 failures
                {combatant.deathSaveOutcome ? ` - Outcome: ${combatant.deathSaveOutcome}` : ""}
                {combatant.conditions?.length ? ` - Conditions: ${combatant.conditions.join(", ")}` : ""}
                {combatant.resourceSpent ? ` - ${combatant.resourceLabel ?? "Resource"} depleted` : ""}
              </div>
              <div className="admin-meta" aria-label={`${combatant.name} condition timing`}>
                {combatantConditionTimingLabels(combatant).length === 0 ? (
                  <span>No timed conditions</span>
                ) : (
                  combatantConditionTimingLabels(combatant).map((label) => <span key={`${combatant.id}-${label}`}>{label}</span>)
                )}
              </div>
            </div>
          ))}
          <div className="section-title">Combat Audit</div>
          {props.auditLogs.length === 0 ? (
            <div className="empty-state compact">No combat audit entries loaded.</div>
          ) : (
            props.auditLogs.slice(-5).reverse().map((entry) => (
              <article className="operator-item admin-item" key={entry.id}>
                <strong>{entry.action}</strong>
                <span>{formatDateTime(entry.createdAt)}</span>
                <p>{combatAuditLabel(entry)}</p>
              </article>
            ))
          )}
        </>
      ) : (
        <>
          <button className="primary-button wide" onClick={props.onStart} disabled={!props.canManage}>
            Start from scene tokens
          </button>
          {props.recentCombats.length > 0 && (
            <section className="admin-list" aria-label="Ended combat recap">
              <div className="section-title">Ended Combat Recap</div>
              {props.recentCombats.map((combat) => (
                <article className="operator-item admin-item" key={combat.id}>
                  <strong>Round {combat.round}</strong>
                  <span>{formatDateTime(combat.updatedAt)}</span>
                  <p>{combat.combatants.length} combatants, {combat.combatants.filter((combatant) => combatant.defeated).length} defeated, {combat.actions?.filter((action) => action.status === "confirmed").length ?? 0} confirmed actions</p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function nextCombatTurnPosition(combat: Combat, direction: 1 | -1): { turnIndex: number; round: number } {
  const combatants = combat.combatants;
  if (combatants.length === 0) return { turnIndex: 0, round: combat.round };
  if (combatants.every((combatant) => combatant.defeated)) return { turnIndex: combat.turnIndex, round: combat.round };
  let turnIndex = combat.turnIndex;
  let round = combat.round;
  for (let step = 0; step < combatants.length; step += 1) {
    turnIndex += direction;
    if (turnIndex >= combatants.length) {
      turnIndex = 0;
      round += 1;
    } else if (turnIndex < 0) {
      turnIndex = combatants.length - 1;
      round = Math.max(1, round - 1);
    }
    if (!combatants[turnIndex]?.defeated) return { turnIndex, round };
  }
  return { turnIndex: combat.turnIndex, round: combat.round };
}

function combatActionRollSummary(action: CombatAction): string {
  if (action.rolls.length === 0) return "No roll result";
  return action.rolls.map((roll) => `${roll.label}: ${roll.total}`).join(", ");
}

function formatCombatantConditions(combatant: Combat["combatants"][number]): string {
  return combatant.conditions?.join(", ") ?? "";
}

function parseCombatantConditions(value: string): string[] {
  return value.split(",").map((condition) => condition.trim()).filter(Boolean);
}

function combatantConditionTimingLabels(combatant: Combat["combatants"][number]): string[] {
  return (combatant.conditions ?? []).flatMap((condition) => {
    const match = condition.match(/^(.+):(\d+)$/);
    if (!match) return [];
    const name = match[1]!.trim();
    const rounds = Number(match[2]);
    if (!name || !Number.isFinite(rounds)) return [];
    return [`${name} expires in ${rounds} ${rounds === 1 ? "round" : "rounds"}`];
  });
}

function boundedCombatCounter(value: string): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(3, parsed));
}

function combatAuditLabel(entry: AuditLog): string {
  const after = entry.after && typeof entry.after === "object" ? (entry.after as Record<string, unknown>) : {};
  const round = typeof after.round === "number" ? after.round : undefined;
  const combatants = typeof after.combatantCount === "number" ? after.combatantCount : undefined;
  const defeated = typeof after.defeatedCount === "number" ? after.defeatedCount : undefined;
  return [`round ${round ?? "?"}`, `${combatants ?? 0} combatants`, `${defeated ?? 0} defeated`].join(" - ");
}

function ContentImportPanel(props: {
  assets: MapAsset[];
  assetStorage?: CampaignAssetStorageInfo;
  selectedScene?: Scene;
  assetSearch: string;
  setAssetSearch(value: string): void;
  assetFolder: string;
  setAssetFolder(value: string): void;
  assetTags: string;
  setAssetTags(value: string): void;
  assetStatus: string;
  failedAssetUpload?: FailedAssetUpload;
  onRetryFailedAssetUpload(): Promise<void>;
  onDismissFailedAssetUpload(): void;
  lifecycleReason: string;
  setLifecycleReason(value: string): void;
  onUploadAsset(file: File, setAsBackground: boolean): Promise<void>;
  onSetSceneBackground(asset: MapAsset): Promise<void>;
  onPlaceAssetToken(asset: MapAsset): Promise<void>;
  onUpdateAssetMetadata(asset: MapAsset, input: { name: string; folder: string; tags: string }): Promise<void>;
  onUpdateAssetLifecycle(asset: MapAsset, status: AssetLifecycleStatus): Promise<void>;
  onCreateAssetDeliveryUrl(asset: MapAsset): Promise<void>;
  imports: ContentImportBatch[];
  kind: ContentImportEntityKind;
  setKind(kind: ContentImportEntityKind): void;
  name: string;
  setName(value: string): void;
  body: string;
  setBody(value: string): void;
  status: string;
  onPreview(entities?: ContentImportDraftEntity[], source?: ContentImportPreviewSource): Promise<void>;
  onApply(batch: ContentImportBatch, selectedEntityIds?: string[]): Promise<void>;
  onRollback(batch: ContentImportBatch): Promise<void>;
  onDelete(batch: ContentImportBatch): Promise<void>;
  canManage: boolean;
  canCreateAsset: boolean;
  canUpdateScene: boolean;
  canCreateToken: boolean;
}) {
  const kinds: ContentImportEntityKind[] = ["journal", "handout", "actor", "item"];
  const [assetFolderFilter, setAssetFolderFilter] = useState("all");
  const [assetLifecycleFilter, setAssetLifecycleFilter] = useState<AssetLifecycleStatus | "all">("all");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [importSelections, setImportSelections] = useState<Record<string, string[]>>({});
  const [draftEntities, setDraftEntities] = useState<ContentImportDraftEntity[]>([]);
  const [adapterPresetId, setAdapterPresetId] = useState<ContentImportAdapterPresetId>("manual");
  const [adapterSourceName, setAdapterSourceName] = useState("");
  const [adapterSourceUrl, setAdapterSourceUrl] = useState("");
  const [adapterConfig, setAdapterConfig] = useState("columns=name,body;delimiter=,;kind=item");
  const assetFolderOptions = useMemo(
    () => [...new Set(props.assets.flatMap((asset) => assetFolderPathOptions(asset.folder)))].sort((left, right) => left.localeCompare(right)),
    [props.assets]
  );
  const assetFolderChildren = useMemo(() => childAssetFolderOptions(assetFolderOptions, assetFolderFilter, props.assets), [assetFolderOptions, assetFolderFilter, props.assets]);
  const assetFolderBreadcrumbs = useMemo(() => assetFolderBreadcrumbsFor(assetFolderFilter), [assetFolderFilter]);
  useEffect(() => {
    if (assetFolderFilter !== "all" && !assetFolderOptions.includes(assetFolderFilter)) setAssetFolderFilter("all");
  }, [assetFolderFilter, assetFolderOptions]);
  useEffect(() => {
    const currentAssetIds = new Set(props.assets.map((asset) => asset.id));
    setSelectedAssetIds((current) => current.filter((assetId) => currentAssetIds.has(assetId)));
  }, [props.assets]);
  useEffect(() => {
    setImportSelections((current) => {
      const next: Record<string, string[]> = {};
      for (const batch of props.imports) {
        next[batch.id] = current[batch.id] ?? (batch.selectedEntityIds.length > 0 ? batch.selectedEntityIds : batch.entities.filter((entity) => entity.selectedByDefault).map((entity) => entity.id));
      }
      return next;
    });
  }, [props.imports]);
  const normalizedSearch = props.assetSearch.trim().toLocaleLowerCase();
  const archivedAssets = props.assets.filter((asset) => asset.lifecycle?.status === "archived");
  const deletedAssets = props.assets.filter((asset) => asset.lifecycle?.status === "deleted");
  const recoverableAssets = [...archivedAssets, ...deletedAssets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const filteredAssets = props.assets.filter((asset) => {
    if (!assetMatchesFolderFilter(asset, assetFolderFilter)) return false;
    const lifecycle = asset.lifecycle?.status ?? "active";
    if (assetLifecycleFilter !== "all" && lifecycle !== assetLifecycleFilter) return false;
    if (!normalizedSearch) return true;
    const scan = asset.security?.status ?? "unscanned";
    return [asset.name, asset.mimeType, lifecycle, scan, asset.folder ?? "", ...(asset.tags ?? [])].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
  });
  const visibleAssetIds = filteredAssets.map((asset) => asset.id);
  const selectedAssets = props.assets.filter((asset) => selectedAssetIds.includes(asset.id));
  const allVisibleAssetsSelected = visibleAssetIds.length > 0 && visibleAssetIds.every((assetId) => selectedAssetIds.includes(assetId));
  const activeAssetCount = props.assets.filter((asset) => asset.lifecycle?.status !== "deleted").length;
  const totalAssetBytes = props.assets.reduce((total, asset) => total + asset.sizeBytes, 0);
  const storageUsedBytes = props.assetStorage?.usedBytes ?? totalAssetBytes;
  const quotaBytes = props.assetStorage?.quotaBytes;
  const quotaRemainingBytes = quotaBytes === undefined ? undefined : Math.max(0, quotaBytes - storageUsedBytes);
  const quotaRatio = quotaBytes && quotaBytes > 0 ? Math.min(1, storageUsedBytes / quotaBytes) : 0;
  const quotaPercent = quotaBytes && quotaBytes > 0 ? formatPercent(quotaRatio) : "n/a";
  const quotaRiskLabel = quotaBytes === undefined ? "not configured" : quotaRatio >= 1 ? "blocked" : quotaRatio >= 0.9 ? "critical" : quotaRatio >= 0.75 ? "watch" : "healthy";
  const quotaRecommendedAction = quotaBytes === undefined
    ? "Set OTTE_ASSET_STORAGE_QUOTA_BYTES before hosting shared campaigns."
    : quotaRatio >= 0.9
      ? "Archive or delete large inactive assets before more uploads."
      : quotaRatio >= 0.75
        ? "Review largest assets and stale archived content before the next map upload."
        : "No quota cleanup needed for current campaign usage.";
  const largestAssets = props.assetStorage?.largestAssets ?? [];
  const largestAsset = largestAssets[0];
  const lifecycleEntries = Object.entries(props.assetStorage?.lifecycleCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const providerEntries = Object.entries(props.assetStorage?.providerCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const delivery = props.assetStorage?.delivery;
  const uploadInputId = "asset-library-upload";
  const backgroundInputId = "asset-library-background-upload";
  const currentDraftEntity = { kind: props.kind, name: props.name.trim(), body: props.body };
  const selectedAdapterPreset = contentImportAdapterPresets.find((preset) => preset.id === adapterPresetId) ?? contentImportAdapterPresets[0]!;
  const adapterEntities = contentImportAdapterEntities(adapterPresetId, props.body, currentDraftEntity, adapterConfig);
  const previewEntities = adapterPresetId === "manual" ? (currentDraftEntity.name ? [...draftEntities, currentDraftEntity] : draftEntities) : adapterEntities;
  const previewSource = contentImportPreviewSource(selectedAdapterPreset, adapterSourceName, adapterSourceUrl, adapterConfig);
  useEffect(() => {
    const preset = contentImportAdapterPresets.find((candidate) => candidate.id === adapterPresetId) ?? contentImportAdapterPresets[0]!;
    setAdapterSourceName(preset.sourceName);
    setAdapterConfig(preset.id === "csv_items" ? "columns=name,body;delimiter=,;kind=item" : preset.id === "srd_json" ? "entries[].name,entries[].summary" : "");
  }, [adapterPresetId]);
  function addDraftEntity() {
    if (!currentDraftEntity.name) return;
    setDraftEntities((current) => [...current, currentDraftEntity]);
    props.setName("");
    props.setBody("");
  }
  function setAssetSelected(assetId: string, selected: boolean) {
    setSelectedAssetIds((current) => {
      if (selected) return current.includes(assetId) ? current : [...current, assetId];
      return current.filter((currentAssetId) => currentAssetId !== assetId);
    });
  }
  function setVisibleAssetsSelected(selected: boolean) {
    setSelectedAssetIds((current) => {
      const visible = new Set(visibleAssetIds);
      if (!selected) return current.filter((assetId) => !visible.has(assetId));
      return [...new Set([...current, ...visibleAssetIds])];
    });
  }
  async function updateSelectedAssetLifecycle(status: AssetLifecycleStatus) {
    for (const asset of selectedAssets) {
      await props.onUpdateAssetLifecycle(asset, status);
    }
    setSelectedAssetIds([]);
  }
  return (
    <div className="panel-stack">
      <div className="panel-heading">
        <div>
          <div className="section-title">Asset Library</div>
        </div>
      </div>
      <section className="operator-section asset-library" aria-label="Asset library">
        <div className="asset-summary">
          <MetricTile label="Assets" value={formatNumber(props.assets.length)} />
          <MetricTile label="Active" value={formatNumber(activeAssetCount)} />
          <MetricTile label="Size" value={formatStorageBytes(totalAssetBytes)} />
          <MetricTile label="Quota" value={quotaBytes === undefined ? "none" : formatStorageBytes(quotaBytes)} />
          <MetricTile label="Remaining" value={props.assetStorage?.remainingBytes === undefined ? "n/a" : formatStorageBytes(props.assetStorage.remainingBytes)} />
          <MetricTile label="Used" value={quotaPercent} />
          <MetricTile label="Folders" value={formatNumber(assetFolderOptions.length)} />
          <MetricTile label="Delivery" value={delivery?.mode ?? "unknown"} />
          <MetricTile label="CDN" value={delivery?.cdnConfigured ? "yes" : "no"} />
          <MetricTile label="Signing" value={delivery?.signingSecretRequired ? (delivery.signingSecretConfigured ? "ready" : "missing") : "optional"} />
          <MetricTile label="Delivery Action" value={delivery?.actionRequired ? "yes" : "no"} />
        </div>
        <div className="asset-quota" aria-label="Asset quota usage">
          <div className="asset-quota-track">
            <div className={`asset-quota-fill ${quotaRatio >= 0.9 ? "danger" : quotaRatio >= 0.75 ? "warning" : ""}`} style={{ width: `${Math.round(quotaRatio * 100)}%` }} />
          </div>
          <div className="admin-meta">
            <span>{formatStorageBytes(storageUsedBytes)} active bytes</span>
            {quotaBytes === undefined ? <span>No campaign quota configured</span> : <span>{formatStorageBytes(Math.max(0, quotaBytes - storageUsedBytes))} remaining</span>}
            {lifecycleEntries.length > 0 && <span>{lifecycleEntries.map(([status, count]) => `${status} ${count}`).join(", ")}</span>}
            {providerEntries.length > 0 && <span>{providerEntries.map(([provider, count]) => `${provider} ${count}`).join(", ")}</span>}
            {delivery && <span>{formatPercent(delivery.posture.deliverableCoverageRate)} deliverable</span>}
            {delivery && <span>{delivery.purgeWebhookConfigured ? "purge webhook configured" : "purge webhook missing"}</span>}
            {delivery && <span>URL TTL {formatDurationSeconds(delivery.defaultTtlSeconds)} / max {formatDurationSeconds(delivery.maxTtlSeconds)}</span>}
          </div>
        </div>
        <div className="asset-pressure-list" aria-label="Asset quota management">
          <div className="operator-row tool-call-row">
            <span>Quota policy</span>
            <strong>{quotaBytes === undefined ? "No campaign quota configured" : `${formatStorageBytes(storageUsedBytes)} of ${formatStorageBytes(quotaBytes)} used`}</strong>
          </div>
          <div className="operator-row tool-call-row">
            <span>Quota health</span>
            <strong>{quotaRiskLabel} - {quotaRemainingBytes === undefined ? "unbounded uploads" : `${formatStorageBytes(quotaRemainingBytes)} remaining`}</strong>
          </div>
          <div className="operator-row tool-call-row">
            <span>Recommended action</span>
            <strong>{quotaRecommendedAction}</strong>
          </div>
          {largestAsset && (
            <div className="operator-row tool-call-row">
              <span>Largest cleanup candidate</span>
              <strong>{largestAsset.name} - {formatStorageBytes(largestAsset.sizeBytes)} - {largestAsset.lifecycleStatus}</strong>
            </div>
          )}
        </div>
        <div className="admin-form-grid">
          <label>
            <span>Search</span>
            <input aria-label="Asset search" value={props.assetSearch} placeholder="Name, mime, lifecycle" onChange={(event) => props.setAssetSearch(event.target.value)} />
          </label>
          <label>
            <span>Folder</span>
            <select aria-label="Asset folder filter" value={assetFolderFilter} onChange={(event) => setAssetFolderFilter(event.target.value)}>
              <option value="all">All folders</option>
              {assetFolderOptions.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Lifecycle</span>
            <select aria-label="Asset lifecycle filter" value={assetLifecycleFilter} onChange={(event) => setAssetLifecycleFilter(event.target.value as AssetLifecycleStatus | "all")}>
              <option value="all">All lifecycle states</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
          </label>
          <label>
            <span>Lifecycle reason</span>
            <input aria-label="Asset lifecycle reason" value={props.lifecycleReason} onChange={(event) => props.setLifecycleReason(event.target.value)} />
          </label>
          <label>
            <span>Upload folder</span>
            <input aria-label="Asset upload folder" value={props.assetFolder} placeholder="maps" onChange={(event) => props.setAssetFolder(event.target.value)} />
          </label>
          <label>
            <span>Upload tags</span>
            <input aria-label="Asset upload tags" value={props.assetTags} placeholder="map, dungeon" onChange={(event) => props.setAssetTags(event.target.value)} />
          </label>
        </div>
        <section className="asset-restore-recovery" aria-label="Asset restore recovery">
          <div className="operator-heading">
            <div className="section-title">Restore Recovery</div>
            <RefreshCw size={15} />
          </div>
          <div className="metric-grid">
            <MetricTile label="Recoverable" value={formatNumber(recoverableAssets.length)} />
            <MetricTile label="Archived" value={formatNumber(archivedAssets.length)} />
            <MetricTile label="Deleted" value={formatNumber(deletedAssets.length)} />
            <MetricTile label="Selected" value={formatNumber(selectedAssets.length)} />
          </div>
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={() => setAssetLifecycleFilter("archived")}>
              <Boxes size={14} /> Show archived
            </button>
            <button className="ghost-button" type="button" onClick={() => setAssetLifecycleFilter("deleted")}>
              <X size={14} /> Show deleted
            </button>
            <button className="ghost-button" type="button" disabled={!props.canUpdateScene || recoverableAssets.length === 0} onClick={() => { setAssetLifecycleFilter("all"); setSelectedAssetIds(recoverableAssets.map((asset) => asset.id)); }}>
              <Check size={14} /> Select recoverable
            </button>
            <button className="ghost-button" type="button" disabled={!props.canUpdateScene || selectedAssets.length === 0} onClick={() => updateSelectedAssetLifecycle("active").catch(console.error)}>
              <RefreshCw size={14} /> Restore selected
            </button>
          </div>
          <div className="operator-list">
            {recoverableAssets.length === 0 ? (
              <div className="empty-state compact">No archived or deleted assets need recovery.</div>
            ) : (
              recoverableAssets.slice(0, 4).map((asset) => (
                <div className="operator-row tool-call-row" key={`recoverable-${asset.id}`}>
                  <span>{asset.name}</span>
                  <strong>{asset.lifecycle?.status ?? "active"} - {formatDateTime(asset.updatedAt)}</strong>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="asset-folder-browser" aria-label="Asset folder navigation">
          <div className="asset-folder-breadcrumbs">
            <button type="button" className={assetFolderFilter === "all" ? "ghost-button active" : "ghost-button"} onClick={() => setAssetFolderFilter("all")} aria-pressed={assetFolderFilter === "all"}>
              All assets
            </button>
            {assetFolderBreadcrumbs.map((folder) => (
              <button key={folder.path} type="button" className={assetFolderFilter === folder.path ? "ghost-button active" : "ghost-button"} onClick={() => setAssetFolderFilter(folder.path)} aria-label={`Open asset folder ${folder.path}`} aria-pressed={assetFolderFilter === folder.path}>
                {folder.label}
              </button>
            ))}
          </div>
          <div className="asset-folder-children" aria-label="Child asset folders">
            {assetFolderChildren.map((folder) => (
              <button key={folder.path} type="button" className="ghost-button" onClick={() => setAssetFolderFilter(folder.path)} aria-label={`Open asset folder ${folder.path}`}>
                <Boxes size={15} />
                <span>{folder.label}</span>
                <small>{formatNumber(folder.count)}</small>
              </button>
            ))}
            {assetFolderChildren.length === 0 && <span className="empty-state compact">No child folders.</span>}
          </div>
        </section>
        <div className="admin-actions">
          <button className="ghost-button" type="button" disabled={!props.canCreateAsset} title={props.canCreateAsset ? "Upload an asset" : "Requires scene.create"} onClick={() => document.getElementById(uploadInputId)?.click()}>
            <Upload size={16} /> Upload Asset
          </button>
          <button className="ghost-button" type="button" disabled={!props.canCreateAsset || !props.canUpdateScene || !props.selectedScene} title={props.selectedScene ? "Upload and set as current scene background" : "Select a scene first"} onClick={() => document.getElementById(backgroundInputId)?.click()}>
            <Upload size={16} /> Upload Background
          </button>
        </div>
        <div className="admin-actions asset-batch-actions" aria-label="Asset batch actions">
          <label className="inline-check">
            <input aria-label="Select visible assets" type="checkbox" checked={allVisibleAssetsSelected} disabled={visibleAssetIds.length === 0} onChange={(event) => setVisibleAssetsSelected(event.target.checked)} />
            <span>{formatNumber(selectedAssetIds.length)} selected</span>
          </label>
          <button className="ghost-button" type="button" disabled={!props.canUpdateScene || selectedAssets.length === 0} onClick={() => updateSelectedAssetLifecycle("archived").catch(console.error)}>
            <RotateCcw size={16} /> Batch archive assets
          </button>
          <button className="ghost-button" type="button" disabled={!props.canUpdateScene || selectedAssets.length === 0} onClick={() => updateSelectedAssetLifecycle("active").catch(console.error)}>
            <Check size={16} /> Batch restore assets
          </button>
          <button className="ghost-button" type="button" disabled={!props.canUpdateScene || selectedAssets.length === 0} onClick={() => updateSelectedAssetLifecycle("deleted").catch(console.error)}>
            <X size={16} /> Batch delete assets
          </button>
        </div>
        <input
          id={uploadInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,application/json"
          hidden
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            await props.onUploadAsset(file, false);
            input.value = "";
          }}
        />
        <input
          id={backgroundInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            await props.onUploadAsset(file, true);
            input.value = "";
          }}
        />
        <div className="admin-status" role="status" aria-live="polite">{props.assetStatus}</div>
        {props.failedAssetUpload && (
          <div className="operator-row tool-call-row" aria-label="Asset upload recovery">
            <span>{props.failedAssetUpload.file.name} failed: {props.failedAssetUpload.message}</span>
            <div className="admin-actions">
              <button className="ghost-button" type="button" onClick={() => props.onRetryFailedAssetUpload().catch(console.error)}>
                <RefreshCw size={16} /> Retry upload
              </button>
              <button className="ghost-button" type="button" onClick={props.onDismissFailedAssetUpload}>
                <X size={16} /> Dismiss
              </button>
            </div>
          </div>
        )}
        {largestAssets.length > 0 && (
          <div className="asset-pressure-list" aria-label="Largest assets">
            {largestAssets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`largest-${asset.id}`}>
                <span>{asset.name}</span>
                <strong>{formatStorageBytes(asset.sizeBytes)} - {asset.provider} - {asset.lifecycleStatus}</strong>
              </div>
            ))}
          </div>
        )}
        {delivery && (
          <div className="asset-pressure-list" aria-label="Asset delivery diagnostics">
            <div className="operator-row tool-call-row">
              <span>{delivery.actionRequired ? "Delivery action required" : "Delivery ready"}</span>
              <strong>{delivery.actionReasons.length > 0 ? delivery.actionReasons.join(", ") : `${delivery.mode} delivery`}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>{formatNumber(delivery.posture.deliverableActiveAssetCount)} deliverable / {formatNumber(delivery.posture.activeManagedAssetCount)} managed</span>
              <strong>{formatNumber(delivery.posture.undeliverableActiveAssetCount)} undeliverable - {formatNumber(delivery.posture.cdnEligibleAssetCount)} CDN eligible</strong>
            </div>
            {delivery.warnings.slice(0, 3).map((warning) => (
              <div className="operator-row tool-call-row" key={`asset-delivery-warning-${warning.code}`}>
                <span>{warning.message}</span>
                <strong>{warning.env.length > 0 ? warning.env.join(", ") : warning.severity}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="asset-list">
          {filteredAssets.length === 0 ? (
            <div className="empty-state compact">No assets match this view.</div>
          ) : (
            filteredAssets.map((asset) => {
              const lifecycle = asset.lifecycle?.status ?? "active";
              const isDeleted = lifecycle === "deleted";
              const isImage = asset.mimeType.startsWith("image/");
              return (
                <article className="asset-card" key={asset.id}>
                  <div className="asset-thumb">{isImage && !isDeleted ? <img src={assetBlobUrl(asset)} alt="" /> : <FileText size={24} />}</div>
                  <div className="asset-detail">
                    <div className="operator-heading">
                      <div>
                        <label className="inline-check">
                          <input aria-label={`Select ${asset.name} asset`} type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={(event) => setAssetSelected(asset.id, event.target.checked)} />
                          <span>Select</span>
                        </label>
                        <h3>{asset.name}</h3>
                        <p>{asset.mimeType} - {formatStorageBytes(asset.sizeBytes)}</p>
                      </div>
                      <span className={`status-pill ${lifecycle === "active" ? "completed" : lifecycle === "deleted" ? "failed" : "running"}`}>{lifecycle}</span>
                    </div>
                    <div className="admin-meta">
                      <span>{asset.storage?.provider ?? "external"}</span>
                      <span>{asset.security?.status ?? "unscanned"}</span>
                      {asset.folder && <span>{asset.folder}</span>}
                      {asset.tags && asset.tags.length > 0 && <span>{asset.tags.join(", ")}</span>}
                      {asset.lifecycle?.expiresAt && <span>expires {formatDateTime(asset.lifecycle.expiresAt)}</span>}
                    </div>
                    <form
                      className="mini-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        props.onUpdateAssetMetadata(asset, {
                          name: String(form.get("name") ?? asset.name),
                          folder: String(form.get("folder") ?? asset.folder ?? ""),
                          tags: String(form.get("tags") ?? (asset.tags ?? []).join(", "))
                        }).catch(console.error);
                      }}
                    >
                      <input name="name" aria-label={`${asset.name} asset name`} defaultValue={asset.name} />
                      <input name="folder" aria-label={`${asset.name} asset folder`} defaultValue={asset.folder ?? ""} placeholder="folder" />
                      <input name="tags" aria-label={`${asset.name} asset tags`} defaultValue={(asset.tags ?? []).join(", ")} placeholder="tags" />
                      <button className="ghost-button" type="submit" disabled={!props.canUpdateScene}>
                        <Check size={16} /> Save Metadata
                      </button>
                    </form>
                    <div className="admin-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        draggable={props.canCreateToken && !isDeleted && isImage}
                        aria-label={`Place ${asset.name} asset on scene`}
                        title={props.canCreateToken && !isDeleted && isImage ? "Drag asset to the scene" : "Requires token.create and an active image asset"}
                        disabled={!props.canCreateToken || isDeleted || !isImage}
                        onClick={() => props.onPlaceAssetToken(asset).catch(console.error)}
                        onDragStart={(event) => {
                          writeTokenDropData(event.dataTransfer, { type: "asset", id: asset.id, imageAssetId: asset.id, name: asset.name, layer: "map", disposition: "neutral" });
                          setTokenDropPreview(event.dataTransfer, asset.name, assetBlobUrl(asset));
                        }}
                      >
                        <MapPin size={16} /> Token
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUpdateScene || !props.selectedScene || isDeleted || !isImage} onClick={() => props.onSetSceneBackground(asset).catch(console.error)}>
                        <Eye size={16} /> Background
                      </button>
                      <button className="ghost-button" type="button" disabled={isDeleted} onClick={() => props.onCreateAssetDeliveryUrl(asset).catch(console.error)}>
                        <Download size={16} /> Signed URL
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUpdateScene || lifecycle === "archived"} onClick={() => props.onUpdateAssetLifecycle(asset, "archived").catch(console.error)}>
                        <RotateCcw size={16} /> Archive
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUpdateScene || lifecycle === "active"} onClick={() => props.onUpdateAssetLifecycle(asset, "active").catch(console.error)}>
                        <Check size={16} /> Restore
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUpdateScene || isDeleted} onClick={() => props.onUpdateAssetLifecycle(asset, "deleted").catch(console.error)}>
                        <X size={16} /> Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <div className="panel-heading">
        <div>
          <div className="section-title">Content Import</div>
        </div>
      </div>
      <form
        className="operator-section content-import-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onPreview(previewEntities, previewSource).then(() => setDraftEntities([])).catch(console.error);
        }}
      >
        <section className="operator-section compact" aria-label="Content import adapter setup">
          <div className="operator-heading">
            <div>
              <div className="section-title">Adapter</div>
              <p>{selectedAdapterPreset.description}</p>
            </div>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Adapter</span>
              <select aria-label="Content import adapter" value={adapterPresetId} onChange={(event) => setAdapterPresetId(event.target.value as ContentImportAdapterPresetId)}>
                {contentImportAdapterPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Source name</span>
              <input aria-label="Adapter source name" value={adapterSourceName} placeholder={selectedAdapterPreset.sourceName} onChange={(event) => setAdapterSourceName(event.target.value)} />
            </label>
            <label>
              <span>Source URL</span>
              <input aria-label="Adapter source URL" value={adapterSourceUrl} placeholder="https://example.com/source" onChange={(event) => setAdapterSourceUrl(event.target.value)} />
            </label>
            <label>
              <span>Config</span>
              <input aria-label="Adapter configuration" value={adapterConfig} placeholder="columns=name,body;delimiter=,;kind=item" onChange={(event) => setAdapterConfig(event.target.value)} />
            </label>
          </div>
          <div className="admin-meta" aria-label="Adapter preview summary">
            <span>{selectedAdapterPreset.sourceType === "adapter" ? `Adapter: ${selectedAdapterPreset.adapterId}` : "Manual source"}</span>
            <span>License: {selectedAdapterPreset.license.name}</span>
            <span>Usage: {titleCaseLabel(selectedAdapterPreset.license.usage)}</span>
            <span>{formatNumber(previewEntities.length)} generated entities</span>
          </div>
        </section>
        <div className="admin-form-grid">
          <label>
            <span>Kind</span>
            <select aria-label="Content import kind" value={props.kind} onChange={(event) => props.setKind(event.target.value as ContentImportEntityKind)}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {titleCaseLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Name</span>
            <input aria-label="Content import name" value={props.name} placeholder="Imported note" onChange={(event) => props.setName(event.target.value)} />
          </label>
        </div>
        <label>
          <span>{props.kind === "actor" || props.kind === "item" ? "Notes" : "Body"}</span>
          <textarea aria-label="Content import body" value={props.body} placeholder="Content body" onChange={(event) => props.setBody(event.target.value)} />
        </label>
        <div className="admin-actions">
          <button className="ghost-button" type="button" disabled={!props.canManage || adapterPresetId !== "manual" || !currentDraftEntity.name} onClick={addDraftEntity} title={adapterPresetId === "manual" ? (props.canManage ? "Add this entity to the pending import batch" : "Requires campaign.update") : "Manual batches only"}>
            <Plus size={16} /> Add Entity
          </button>
          <button className="primary-button" type="submit" disabled={!props.canManage || previewEntities.length === 0} title={props.canManage ? "Preview content import" : "Requires campaign.update"}>
            <Upload size={16} /> Preview Batch
          </button>
        </div>
        {draftEntities.length > 0 && (
          <div className="content-import-drafts" aria-label="Pending import entities">
            {draftEntities.map((entity, index) => (
              <div className="operator-row tool-call-row" key={`${entity.kind}-${entity.name}-${index}`}>
                <span>{titleCaseLabel(entity.kind)}: {entity.name}</span>
                <button className="ghost-button" type="button" onClick={() => setDraftEntities((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                  <X size={14} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
      <div className="admin-status" role="status" aria-live="polite">{props.status}</div>
      <div className="operator-list">
        {props.imports.length === 0 ? (
          <div className="empty-state compact">No content imports for this campaign.</div>
        ) : (
          props.imports.map((batch) => {
            const selectedEntityIds = importSelections[batch.id] ?? batch.selectedEntityIds;
            const selectedCount = batch.entities.filter((entity) => selectedEntityIds.includes(entity.id)).length;
            const warningCount = batch.entities.reduce((total, entity) => total + entity.warnings.length, 0);
            const appliedByEntity = new Map(batch.appliedRecords.map((record) => [record.entityId, record]));
            return (
              <article className="operator-item content-import-report" key={batch.id} aria-label={`${batch.source.sourceName} validation report`}>
                <div className="operator-heading">
                  <div>
                    <h3>{batch.source.sourceName}</h3>
                    <p>{batch.status} - {batch.entities.length} {batch.entities.length === 1 ? "entity" : "entities"} - {batch.source.license.usage}</p>
                  </div>
                  <span className={contentImportStatusClass(batch.status)}>{titleCaseLabel(batch.status)}</span>
                </div>
                <div className="content-import-summary" aria-label="Validation report">
                  <div className="metric-row">
                    <span>Validation</span>
                    <strong>{warningCount === 0 ? "Ready" : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Selected</span>
                    <strong>{selectedCount} of {batch.entities.length}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Applied</span>
                    <strong>{batch.appliedRecords.length}</strong>
                  </div>
                </div>
                <div className="admin-meta" aria-label="Provenance and license">
                  <span>Source: {titleCaseLabel(batch.source.sourceType)}</span>
                  {batch.source.adapterId && <span>Adapter: {batch.source.adapterId}</span>}
                  <span>License: {batch.source.license.name}</span>
                  <span>Usage: {titleCaseLabel(batch.source.license.usage)}</span>
                  {batch.source.license.attribution && <span>Attribution: {batch.source.license.attribution}</span>}
                  {batch.source.sourceUrl && <span>{batch.source.sourceUrl}</span>}
                  <span>Submitted: {formatDateTime(batch.source.submittedAt)}</span>
                </div>
                <div className="content-import-entities" aria-label="Import entity selection">
                  {batch.entities.map((entity) => {
                    const selected = selectedEntityIds.includes(entity.id);
                    const applied = appliedByEntity.get(entity.id);
                    return (
                      <label className="import-entity-row" key={entity.id}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entity.name}`}
                          checked={selected}
                          disabled={!props.canManage || batch.status !== "previewed"}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setImportSelections((current) => {
                              const existing = current[batch.id] ?? batch.selectedEntityIds;
                              const next = checked ? [...new Set([...existing, entity.id])] : existing.filter((id) => id !== entity.id);
                              return { ...current, [batch.id]: next };
                            });
                          }}
                        />
                        <div>
                          <strong>{titleCaseLabel(entity.kind)}: {entity.name}</strong>
                          <p>{selected ? "Selected" : "Excluded"}{applied ? ` - applied to ${applied.collection} ${applied.id}` : ""}</p>
                          {entity.warnings.length > 0 && <p>{entity.warnings.join(", ")}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {(batch.appliedAt || batch.rolledBackAt) && (
                  <div className="admin-meta" aria-label="Import history">
                    {batch.appliedAt && <span>Applied: {formatDateTime(batch.appliedAt)}</span>}
                    {batch.rolledBackAt && <span>Rolled back: {formatDateTime(batch.rolledBackAt)}</span>}
                  </div>
                )}
                <div className="admin-actions">
                  <button className="ghost-button" onClick={() => props.onApply(batch, selectedEntityIds).catch(console.error)} disabled={!props.canManage || batch.status === "applied" || batch.status === "rolled_back" || selectedCount === 0} title={props.canManage ? "Apply selected import entities" : "Requires campaign.update"}>
                    <Check size={16} /> Apply Selected
                  </button>
                  <button className="ghost-button" onClick={() => props.onRollback(batch).catch(console.error)} disabled={!props.canManage || batch.status !== "applied"} title={props.canManage ? "Rollback applied records" : "Requires campaign.update"}>
                    <RotateCcw size={16} /> Rollback
                  </button>
                  <button className="ghost-button" onClick={() => props.onDelete(batch).catch(console.error)} disabled={!props.canManage || batch.status === "applied"} title={props.canManage ? "Delete import preview" : "Requires campaign.update"}>
                    <X size={16} /> Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function AdminPanel(props: { admin?: AdminSnapshot; campaigns: Campaign[]; systems: SystemRuntimeInfo[]; workspaceDefaults?: OrganizationWorkspace; organizationMembers: OrganizationMemberInfo[]; currentUserId: string; status: string; onRefresh(): Promise<void>; onDisableUser(user: AdminUserInfo): Promise<void>; onEnableUser(user: AdminUserInfo): Promise<void>; onRequireReset(user: AdminUserInfo): Promise<void>; onIssueReset(user: AdminUserInfo): Promise<void>; onRevokeUserSessions(user: AdminUserInfo): Promise<void>; onRevokeSession(session: AdminSessionInfo): Promise<void>; onRevokeRiskSessions(): Promise<void>; onPruneExpiredPasswordResets(): Promise<void>; onRetryEmail(email: EmailOutboxMessage): Promise<void>; onRetryAllEmails(): Promise<void>; onRetryAiToolCall(toolCallId: string, toolName: string): Promise<void>; onFailStaleAiThreads(): Promise<void>; onFailStaleAiToolCalls(): Promise<void>; onRejectStaleAiProposals(includeApproved?: boolean): Promise<void>; onCleanupStoredAssetBytes(): Promise<void>; onMigrateStoredAssetBytes(): Promise<void>; onQuarantineAssetIntegrityFailures(): Promise<void>; onPurgeAssetCdnCache(assetId: string, assetName: string): Promise<void>; onUpdatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus): Promise<void>; onSyncPluginRegistries(): Promise<void>; onUpdateWorkspaceDefaults(input: Partial<OrganizationWorkspace>): Promise<void>; onAddOrganizationMember(input: { email: string; role: Exclude<OrganizationMemberRole, "owner"> }): Promise<void>; onUpdateOrganizationMember(member: OrganizationMemberInfo, role: Exclude<OrganizationMemberRole, "owner">): Promise<void>; onRemoveOrganizationMember(member: OrganizationMemberInfo): Promise<void>; onCreateScimMapping(input: AdminScimGroupRoleMappingInput): Promise<void>; onDeleteScimMapping(mapping: AdminScimGroupRoleMapping): Promise<void> }) {
  const users = props.admin?.users ?? [];
  const sessions = props.admin?.sessions ?? [];
  const emails = props.admin?.emailOutbox.slice().reverse() ?? [];
  const auditLogs = props.admin?.audit.auditLogs ?? [];
  const jobs = props.admin?.jobs ?? [];
  const jobOperations = props.admin?.jobOperations;
  const authOperations = props.admin?.authOperations;
  const storageOperations = props.admin?.storageOperations;
  const assetStorage = props.admin?.assetStorage;
  const assetIntegrity = props.admin?.assetIntegrity;
  const renderingOperations = props.admin?.renderingOperations;
  const systemOperations = props.admin?.systemOperations;
  const aiOperations = props.admin?.aiOperations;
  const pluginReviews = props.admin?.pluginReviews;
  const pluginOperations = props.admin?.pluginOperations;
  const scimMappings = props.admin?.scimGroupRoleMappings ?? [];
  const organizationMembers = props.organizationMembers;
  const disabledAdminUserCount = users.filter((user) => user.disabled).length;
  const resetRequiredAdminUserCount = users.filter((user) => user.passwordResetRequired).length;
  const sessionBearingAdminUserCount = users.filter((user) => user.sessionCount > 0).length;
  const identityLinkedAdminUserCount = users.filter((user) => user.identityCount > 0).length;
  const sessionExpirySoonMs = Date.now() + 24 * 60 * 60 * 1000;
  const expiringSoonSessionCount = sessions.filter((session) => Date.parse(session.expiresAt) <= sessionExpirySoonMs).length;
  const oldestSessionLastSeenAt = sessions.reduce<string | undefined>((oldest, session) => (!oldest || Date.parse(session.lastSeenAt) < Date.parse(oldest) ? session.lastSeenAt : oldest), undefined);
  const newestSessionLastSeenAt = sessions.reduce<string | undefined>((newest, session) => (!newest || Date.parse(session.lastSeenAt) > Date.parse(newest) ? session.lastSeenAt : newest), undefined);
  const newestEmailCreatedAt = emails.reduce<string | undefined>((newest, email) => (!newest || Date.parse(email.createdAt) > Date.parse(newest) ? email.createdAt : newest), undefined);
  const queuedJobCount = jobOperations?.totals.byStatus.queued ?? jobs.filter((job) => job.status === "queued").length;
  const runningJobCount = jobOperations?.totals.byStatus.running ?? jobs.filter((job) => job.status === "running").length;
  const failedJobCount = jobOperations?.totals.byStatus.failed ?? jobs.filter((job) => job.status === "failed").length;
  const cancelledJobCount = jobOperations?.totals.byStatus.cancelled ?? jobs.filter((job) => job.status === "cancelled").length;
  const retryableJobCount = jobOperations?.totals.retryableCount ?? jobs.filter((job) => (job.status === "failed" || job.status === "cancelled") && job.attempts < job.maxAttempts).length;
  const newestJobUpdatedAt = jobOperations?.throughput.newestCompletedAt ?? jobs.reduce<string | undefined>((newest, job) => (!newest || Date.parse(job.updatedAt) > Date.parse(newest) ? job.updatedAt : newest), undefined);
  const jobLedgerSummary = !jobOperations
    ? jobs.length === 0 ? "no recent jobs" : `${formatNumber(jobs.length)} recent jobs`
    : jobOperations.totals.totalCount === 0 ? "no recent jobs" : jobOperations.actionRequired ? "action required" : "healthy";
  const matchedScimMappingCount = scimMappings.filter((mapping) => mapping.group).length;
  const scimMappedMemberCount = scimMappings.reduce((total, mapping) => total + (mapping.group?.memberUserIds.length ?? 0), 0);
  const organizationAdminCount = organizationMembers.filter((member) => member.role === "owner" || member.role === "admin").length;
  const organizationCurrentUser = organizationMembers.find((member) => member.userId === props.currentUserId);
  const oidcRequiredConfiguredCount = authOperations
    ? [
        authOperations.runtime.oidc.issuerConfigured,
        authOperations.runtime.oidc.clientIdConfigured,
        authOperations.runtime.oidc.clientSecretConfigured,
        authOperations.runtime.oidc.redirectUriConfigured
      ].filter(Boolean).length
    : 0;
  const pluginReviewSourceCount = new Set(pluginReviews?.plugins.map((review) => review.source.type) ?? []).size;
  const pluginReviewTrustStatusCount = new Set(pluginReviews?.plugins.map((review) => review.trust.status) ?? []).size;
  const assetCampaignProviderSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.providerCounts)) ?? []).size;
  const assetCampaignLifecycleSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.lifecycleCounts)) ?? []).size;
  const assetCampaignLargestSampleCount = assetStorage?.campaigns.reduce((total, campaign) => total + campaign.largestAssets.length, 0) ?? 0;
  const renderingFeatureSampleCount = renderingOperations?.featureCoverage.requiredFeatures.reduce((total, feature) => total + feature.samples.length, 0) ?? 0;
  const renderingCoverageSampleCount = Object.values(renderingOperations?.featureCoverage.samples ?? {}).reduce((total, samples) => total + samples.length, 0);
  const primaryRulesCapabilityEvidenceCount = systemOperations?.systems
    .find((system) => system.id === systemOperations.productionReadiness.primarySystemId)
    ?.productionCapability.capabilities.reduce((total, capability) => total + capability.evidenceCount, 0) ?? 0;
  const retryableAiToolCallIds = new Set(aiOperations?.risk.failedToolRetryPolicy?.recentRetryable.map((call) => call.id) ?? []);
  const systemsNeedingProductionDepth =
    systemOperations?.systems.filter((system) => systemOperations.productionReadiness.systemsNeedingProductionDepth.includes(system.id)) ?? [];
  const systemsWithProductionGaps = systemOperations?.systems.filter((system) => system.productionGaps.length > 0) ?? [];
  const productionGapTotal = systemOperations?.productionGapCounts.reduce((total, gap) => total + gap.count, 0) ?? 0;
  const promotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.blockerCount, 0) ?? 0;
  const criticalPromotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.criticalBlockerCount, 0) ?? 0;
  const primaryRulesSystem = systemOperations?.systems.find((system) => system.id === systemOperations.productionReadiness.primarySystemId);
  const defaultScimCampaignId = props.campaigns[0]?.id ?? "";
  const workspaceDefaults = props.workspaceDefaults;
  const workspaceSystemOptions = [...new Set(["dnd-5e-srd", ...props.systems.map((system) => system.id), ...props.campaigns.map((campaign) => campaign.defaultSystemId), workspaceDefaults?.defaultSystemId].filter((systemId): systemId is string => Boolean(systemId)))];
  const [scimCampaignId, setScimCampaignId] = useState(defaultScimCampaignId);
  const [scimRole, setScimRole] = useState<ScimAssignableRole>("player");
  const [scimMatchType, setScimMatchType] = useState<"groupDisplayName" | "groupExternalId" | "groupId">("groupDisplayName");
  const [scimGroupValue, setScimGroupValue] = useState("");
  const [workspaceName, setWorkspaceName] = useState(workspaceDefaults?.name ?? "");
  const [workspaceSystemId, setWorkspaceSystemId] = useState(workspaceDefaults?.defaultSystemId ?? "dnd-5e-srd");
  const [workspaceVisibility, setWorkspaceVisibility] = useState<Campaign["visibility"]>(workspaceDefaults?.defaultCampaignVisibility ?? "private");
  const [workspaceTemplate, setWorkspaceTemplate] = useState<CampaignPermissionTemplateId>(workspaceDefaults?.defaultPermissionTemplate ?? "standard");
  const [workspaceInviteRole, setWorkspaceInviteRole] = useState<Exclude<UserRole, "owner" | "plugin" | "ai_assistant">>(workspaceDefaults?.defaultInviteRole ?? "player");
  const [workspaceSceneName, setWorkspaceSceneName] = useState(workspaceDefaults?.defaultSceneName ?? "Opening Scene");
  const [workspaceSceneFolder, setWorkspaceSceneFolder] = useState(workspaceDefaults?.defaultSceneFolder ?? "session-0");
  const [workspaceSceneWidth, setWorkspaceSceneWidth] = useState(workspaceDefaults?.defaultSceneWidth ?? 1200);
  const [workspaceSceneHeight, setWorkspaceSceneHeight] = useState(workspaceDefaults?.defaultSceneHeight ?? 800);
  const [workspaceSceneGridSize, setWorkspaceSceneGridSize] = useState(workspaceDefaults?.defaultSceneGridSize ?? 50);
  const [workspaceOnboardingTitle, setWorkspaceOnboardingTitle] = useState(workspaceDefaults?.onboardingTitle ?? "Welcome to the Table");
  const [workspaceOnboardingBody, setWorkspaceOnboardingBody] = useState(workspaceDefaults?.onboardingBody ?? "");
  const [workspaceDefaultsStatus, setWorkspaceDefaultsStatus] = useState("No workspace defaults saved this session");
  const [organizationMemberEmail, setOrganizationMemberEmail] = useState("");
  const [organizationMemberRole, setOrganizationMemberRole] = useState<Exclude<OrganizationMemberRole, "owner">>("member");
  const [organizationMemberStatus, setOrganizationMemberStatus] = useState("No organization member changes this session");
  const [authConnectionTest, setAuthConnectionTest] = useState<AdminAuthConnectionTestResult>();
  const [authConnectionTestStatus, setAuthConnectionTestStatus] = useState("No auth connection test run");
  const [storageBackupStatus, setStorageBackupStatus] = useState("No storage backup run");
  const [storageRestoreDrill, setStorageRestoreDrill] = useState<AdminStorageRestoreDrillResult>();
  const [storageRestoreConfirm, setStorageRestoreConfirm] = useState("");
  const [jobLedgerStatus, setJobLedgerStatus] = useState("No job action run");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("");
  const [auditActorTypeFilter, setAuditActorTypeFilter] = useState("");
  const [auditCampaignFilter, setAuditCampaignFilter] = useState("");
  const [auditExportLimit, setAuditExportLimit] = useState("100");
  const [auditExportStatus, setAuditExportStatus] = useState("No audit export run");
  const selectedScimCampaignId = scimCampaignId || defaultScimCampaignId;
  useEffect(() => {
    if (!workspaceDefaults) return;
    setWorkspaceName(workspaceDefaults.name);
    setWorkspaceSystemId(workspaceDefaults.defaultSystemId);
    setWorkspaceVisibility(workspaceDefaults.defaultCampaignVisibility);
    setWorkspaceTemplate(workspaceDefaults.defaultPermissionTemplate);
    setWorkspaceInviteRole(workspaceDefaults.defaultInviteRole);
    setWorkspaceSceneName(workspaceDefaults.defaultSceneName);
    setWorkspaceSceneFolder(workspaceDefaults.defaultSceneFolder);
    setWorkspaceSceneWidth(workspaceDefaults.defaultSceneWidth);
    setWorkspaceSceneHeight(workspaceDefaults.defaultSceneHeight);
    setWorkspaceSceneGridSize(workspaceDefaults.defaultSceneGridSize);
    setWorkspaceOnboardingTitle(workspaceDefaults.onboardingTitle);
    setWorkspaceOnboardingBody(workspaceDefaults.onboardingBody);
  }, [workspaceDefaults]);
  async function saveWorkspaceDefaults() {
    await props.onUpdateWorkspaceDefaults({
      name: workspaceName,
      defaultSystemId: workspaceSystemId,
      defaultCampaignVisibility: workspaceVisibility,
      defaultPermissionTemplate: workspaceTemplate,
      defaultInviteRole: workspaceInviteRole,
      defaultSceneName: workspaceSceneName,
      defaultSceneFolder: workspaceSceneFolder,
      defaultSceneWidth: workspaceSceneWidth,
      defaultSceneHeight: workspaceSceneHeight,
      defaultSceneGridSize: workspaceSceneGridSize,
      onboardingTitle: workspaceOnboardingTitle,
      onboardingBody: workspaceOnboardingBody
    });
    setWorkspaceDefaultsStatus("Workspace defaults saved");
  }
  async function submitOrganizationMember() {
    const email = organizationMemberEmail.trim();
    if (!email) return;
    await props.onAddOrganizationMember({ email, role: organizationMemberRole });
    setOrganizationMemberEmail("");
    setOrganizationMemberStatus(`Organization member ${email} saved as ${organizationMemberRole}`);
  }
  const readinessChecks: Array<{ label: string; status: "ready" | "action" | "missing"; detail: string; playbook: string; proof: string }> = [
    {
      label: "Auth operations",
      status: !authOperations ? "missing" : authOperations.actionRequired ? "action" : "ready",
      detail: !authOperations ? "not loaded" : authOperations.actionReasons.length > 0 ? authOperations.actionReasons.join(", ") : "sessions, identity, email, and enterprise setup loaded",
      playbook: "Run redacted OIDC and SCIM connection tests, then clear invalid auth config, stale sessions, and pending email remediations from the Auth Operations section.",
      proof: "Connection checks report ready or blocked with expected missing variables, and auth remediation queues are empty or assigned."
    },
    {
      label: "SQLite storage",
      status: !storageOperations ? "missing" : storageOperations.actionRequired ? "action" : "ready",
      detail: !storageOperations ? "not loaded" : storageOperations.actionReasons.length > 0 ? storageOperations.actionReasons.join(", ") : `${formatNumber(storageOperations.records?.total)} records checked`,
      playbook: "Create a backup, run a restore drill, confirm required indexes and integrity, and queue a storage backup or drill job when work should run through workers.",
      proof: "Latest backup is present, restore drill passes, integrity is ok, and any queued storage job appears in the Job Ledger."
    },
    {
      label: "Job ledger",
      status: !jobOperations ? "missing" : jobOperations.actionRequired ? "action" : "ready",
      detail: !jobOperations ? "not loaded" : jobOperations.actionReasons.length > 0 ? jobOperations.actionReasons.join(", ") : `${formatNumber(jobOperations.totals.totalCount)} jobs observed`,
      playbook: "Dry-run the job alert, inspect stale queued work, expired leases, stale heartbeats, and retry exhaustion, then retry or cancel affected jobs.",
      proof: "Job alert dry-run returns redacted output, no unassigned stale work remains, and retryable failures have an owner action."
    },
    {
      label: "Asset storage",
      status: !assetStorage ? "missing" : assetStorage.operations.actionRequired ? "action" : "ready",
      detail: !assetStorage ? "not loaded" : assetStorage.operations.actionReasons.length > 0 ? assetStorage.operations.actionReasons.join(", ") : `${formatNumber(assetStorage.assetCount)} assets tracked`,
      playbook: "Review quota pressure, delivery warnings, provider spread, and largest cleanup candidates before archiving or restoring campaign assets.",
      proof: "Delivery diagnostics expose no blocking action reasons and quota guidance names an acceptable next action."
    },
    {
      label: "Asset integrity",
      status: !assetIntegrity ? "missing" : assetIntegrity.actionRequired > 0 ? "action" : "ready",
      detail: !assetIntegrity ? "not loaded" : assetIntegrity.actionReasons.length > 0 ? assetIntegrity.actionReasons.join(", ") : `${formatNumber(assetIntegrity.verified)} verified`,
      playbook: "Run cleanup, migration, quarantine, or CDN purge actions for affected managed assets and preserve integrity failure samples for incident review.",
      proof: "Integrity remediation count drops to zero or every remaining failure is quarantined with an audit row."
    },
    {
      label: "Rendering readiness",
      status: !renderingOperations ? "missing" : renderingOperations.actionRequired ? "action" : "ready",
      detail: !renderingOperations ? "not loaded" : renderingOperations.actionReasons.length > 0 ? renderingOperations.actionReasons.join(", ") : `${formatNumber(renderingOperations.totals.sceneCount)} scenes checked`,
      playbook: "Inspect scenes missing background, grid, fog, wall, light, or annotation coverage and repair the active-session scenes first.",
      proof: "Rendering remediation queue is empty or only contains accepted demo-depth gaps."
    },
    {
      label: "Rules systems",
      status: !systemOperations ? "missing" : systemOperations.productionReadiness.actionRequired || productionGapTotal > 0 ? "action" : "ready",
      detail: !systemOperations ? "not loaded" : productionGapTotal > 0 ? `${formatNumber(productionGapTotal)} production gaps` : `${systemOperations.productionReadiness.primarySystemId} primary`,
      playbook: "Resolve primary-system production gaps, promotion blockers, and compendium depth warnings before enabling the system for a v1 table.",
      proof: "Primary system has no critical promotion blockers and production-gap counts are accepted or closed."
    },
    {
      label: "AI operations",
      status: !aiOperations ? "missing" : aiOperations.actionRequired ? "action" : "ready",
      detail: !aiOperations ? "not loaded" : aiOperations.actionReasons.length > 0 ? aiOperations.actionReasons.join(", ") : `${formatNumber(aiOperations.totals.threadCount)} threads observed`,
      playbook: "Replay failed provider threads, retry safe failed tool calls, reject stale proposals, and verify AI changes still enter as reviewable proposals.",
      proof: "No stale apply-ready or failed retryable AI work remains without a GM-visible recovery action."
    },
    {
      label: "Plugin marketplace",
      status: !pluginOperations ? "missing" : pluginOperations.actionRequired ? "action" : "ready",
      detail: !pluginOperations ? "not loaded" : pluginOperations.actionReasons.length > 0 ? pluginOperations.actionReasons.join(", ") : `${formatNumber(pluginOperations.totals.packageCount)} packages inventoried`,
      playbook: "Sync configured registries, review pending package versions, reject unsafe packages, and resolve permission or core-compatibility drift.",
      proof: "Marketplace review backlog is below policy threshold and blocked or tampered packages cannot install."
    },
    {
      label: "Audit export",
      status: !props.admin ? "missing" : props.admin.audit.summary.actionRequired ? "action" : "ready",
      detail: !props.admin ? "not loaded" : props.admin.audit.summary.actionReasons.length > 0 ? props.admin.audit.summary.actionReasons.join(", ") : `${formatNumber(props.admin.audit.count)} audit rows available`,
      playbook: "Filter audit rows for the target action or actor, export redacted JSON, and attach the export to upgrade, restore, or incident notes.",
      proof: "Redacted audit export succeeds and includes the relevant admin action without leaking secrets."
    }
  ];
  const readinessReadyCount = readinessChecks.filter((check) => check.status === "ready").length;
  const readinessActionCount = readinessChecks.filter((check) => check.status === "action").length;
  const readinessMissingCount = readinessChecks.filter((check) => check.status === "missing").length;
  const readinessStatus = readinessActionCount > 0 ? "action" : readinessMissingCount > 0 ? "missing" : "ready";

  useEffect(() => {
    if (!scimCampaignId && defaultScimCampaignId) setScimCampaignId(defaultScimCampaignId);
  }, [defaultScimCampaignId, scimCampaignId]);

  async function testAuthConnection(provider: AdminAuthConnectionTestResult["provider"]) {
    setAuthConnectionTestStatus(`Testing ${provider.toUpperCase()} connection`);
    try {
      const result = await apiPost<AdminAuthConnectionTestResult>("/api/v1/admin/auth/test-connection", { provider });
      setAuthConnectionTest(result);
      setAuthConnectionTestStatus(`${provider.toUpperCase()} ${result.status}`);
    } catch (error) {
      setAuthConnectionTest(undefined);
      setAuthConnectionTestStatus(errorMessage(error));
    }
  }

  async function createStorageBackup() {
    setStorageBackupStatus("Creating backup");
    try {
      const result = await apiPost<AdminStorageBackupResult>("/api/v1/admin/storage/backup", { reason: "admin_ui_manual_backup" });
      setStorageBackupStatus(`Backup created: ${result.fileName} (${formatStorageBytes(result.sizeBytes)})`);
      await props.onRefresh();
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function runStorageRestoreDrill() {
    setStorageBackupStatus("Running restore drill");
    try {
      const result = await apiPost<AdminStorageRestoreDrillResult>("/api/v1/admin/storage/restore-drill", {});
      setStorageRestoreDrill(result);
      setStorageBackupStatus(result.status === "passed" ? `Restore drill passed: ${formatNumber(result.recordCount)} records checked` : `Restore drill failed: ${result.error ?? "unknown error"}`);
      await props.onRefresh();
    } catch (error) {
      setStorageRestoreDrill(undefined);
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function queueStorageJob(type: "storage.backup" | "storage.restoreDrill") {
    setStorageBackupStatus(`Queueing ${type}`);
    try {
      const job = await apiPost<AdminJob>("/api/v1/admin/jobs", {
        type,
        payload: { reason: `admin_ui_${type.replace(".", "_")}` },
        maxAttempts: 3
      });
      setStorageBackupStatus(`${job.type} queued`);
      setJobLedgerStatus(`${job.type} queued`);
      await props.onRefresh();
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function restoreStorageBackup(fileName: string) {
    setStorageBackupStatus("Restoring backup");
    try {
      const result = await apiPost<AdminStorageRestoreResult>("/api/v1/admin/storage/restore", {
        backupFileName: fileName,
        confirmFileName: storageRestoreConfirm,
        reason: "admin_ui_destructive_restore"
      });
      setStorageRestoreDrill(result);
      setStorageRestoreConfirm("");
      setStorageBackupStatus(result.status === "passed" ? `Backup restored: ${result.backup?.fileName ?? fileName}` : `Restore failed: ${result.error ?? "unknown error"}`);
      await props.onRefresh();
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function retryAdminJob(job: AdminJob) {
    setJobLedgerStatus(`Retrying ${job.type}`);
    try {
      const result = await apiPost<AdminJob>(`/api/v1/admin/jobs/${job.id}/retry`, {});
      setJobLedgerStatus(`${result.type} requeued with ${formatNumber(result.maxAttempts - result.attempts)} attempts remaining`);
      await props.onRefresh();
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function cancelAdminJob(job: AdminJob) {
    setJobLedgerStatus(`Cancelling ${job.type}`);
    try {
      const result = await apiPost<AdminJob>(`/api/v1/admin/jobs/${job.id}/cancel`, { reason: "admin_ui_cancel" });
      setJobLedgerStatus(`${result.type} ${result.status}`);
      await props.onRefresh();
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function deliverJobAlert(dryRun: boolean) {
    setJobLedgerStatus(dryRun ? "Dry-running job alert" : "Delivering job alert");
    try {
      const result = await apiPost<AdminJobAlertResult>("/api/v1/admin/jobs/alerts", { dryRun, force: dryRun, reason: dryRun ? "admin_ui_dry_run" : "admin_ui_delivery" });
      const target = result.configured ? `webhook ${result.webhookStatus ?? "configured"}` : "webhook not configured";
      setJobLedgerStatus(`${result.status}: ${formatNumber(result.remediationCount)} remediations - ${target}`);
      await props.onRefresh();
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function exportAuditLogs() {
    setAuditExportStatus("Exporting redacted audit JSON");
    try {
      const params = new URLSearchParams();
      params.set("format", "json");
      params.set("limit", auditExportLimit || "100");
      if (auditActionFilter.trim()) params.set("action", auditActionFilter.trim());
      if (auditTargetTypeFilter.trim()) params.set("targetType", auditTargetTypeFilter.trim());
      if (auditActorTypeFilter.trim()) params.set("actorType", auditActorTypeFilter.trim());
      if (auditCampaignFilter.trim()) params.set("campaignId", auditCampaignFilter.trim());
      const exportBundle = await apiGet<AdminSnapshot["audit"]>(`/api/v1/admin/audit-logs?${params.toString()}`);
      downloadJson(`audit-${new Date(exportBundle.exportedAt).toISOString().slice(0, 10)}.json`, exportBundle);
      setAuditExportStatus(`Exported ${formatNumber(exportBundle.count)} redacted audit rows`);
      await props.onRefresh();
    } catch (error) {
      setAuditExportStatus(errorMessage(error));
    }
  }

  return (
    <div className="panel-stack admin-panel">
      <div className="panel-heading">
        <div className="section-title">Server Admin</div>
        <button className="icon-button" title="Refresh admin operations" aria-label="Refresh admin operations" onClick={() => props.onRefresh().catch(console.error)}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="admin-status">{props.status}</div>

      <section className="admin-section production-readiness" aria-label="Production readiness">
        <div className="operator-heading">
          <div>
            <div className="section-title">Production Readiness</div>
            <p>{formatNumber(readinessReadyCount)} ready - {formatNumber(readinessActionCount)} action - {formatNumber(readinessMissingCount)} missing</p>
          </div>
          <span className={readinessStatusClass(readinessStatus)}>{readinessStatus === "ready" ? "ready" : readinessStatus === "missing" ? "loading" : "action required"}</span>
        </div>
        <div className="metric-grid readiness-metrics">
          <MetricTile label="Ready Checks" value={formatNumber(readinessReadyCount)} />
          <MetricTile label="Action Checks" value={formatNumber(readinessActionCount)} />
          <MetricTile label="Missing Checks" value={formatNumber(readinessMissingCount)} />
          <MetricTile label="Total Checks" value={formatNumber(readinessChecks.length)} />
        </div>
        <div className="readiness-checklist" aria-label="Production readiness checklist">
          {readinessChecks.map((check) => (
            <article className="readiness-check" key={check.label}>
              <span className={readinessStatusClass(check.status)}>{check.status}</span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="readiness-checklist" aria-label="Production readiness remediation playbooks">
          {readinessChecks.map((check) => (
            <article className="readiness-check" key={`${check.label}-playbook`}>
              <span className={readinessStatusClass(check.status)}>{check.status}</span>
              <div>
                <strong>{check.label} playbook</strong>
                <p>{check.playbook}</p>
                <p>Proof: {check.proof}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section" aria-label="Auth operations">
        <div className="operator-heading">
          <div className="section-title">Auth Operations</div>
          <strong>{authOperations?.runtime.nodeEnv ?? "not loaded"}</strong>
        </div>
        {!authOperations ? (
          <div className="empty-state compact">No auth operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.actionRequired ? "failed" : "completed"}`}>{authOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{authOperations.runtime.legacyUserHeader.mode}</strong>
              </div>
              <p>{authOperations.emailOutbox.webhookConfigured ? "email webhook configured" : "email webhook not configured"} - {formatNumber(authOperations.identities.identityCount)} linked identities</p>
              <div className="admin-meta">
                <span>{authOperations.actionReasons.length > 0 ? authOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(authOperations.users.passwordUserCount)} password users</span>
                <span>{formatNumber(authOperations.users.mfaEnabledUserCount)} MFA enabled</span>
                <span>{formatPercent(authOperations.users.mfaCoverageRate)} MFA coverage</span>
                {authOperations.runtime.authUrls.invalidUrlConfig.length > 0 && <span>invalid auth URLs {authOperations.runtime.authUrls.invalidUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.insecureUrlConfig.length > 0 && <span>insecure auth URLs {authOperations.runtime.authUrls.insecureUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.invalidNumericConfig.length > 0 && <span>invalid auth config {authOperations.runtime.authUrls.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.sessions.invalidNumericConfig.length > 0 && <span>invalid session config {authOperations.runtime.sessions.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.invalidConfig.length > 0 && <span>invalid OIDC config {authOperations.runtime.oidc.invalidConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.insecureConfig.length > 0 && <span>insecure OIDC config {authOperations.runtime.oidc.insecureConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.passwordReset.linkMissingInProduction && <span>production reset link missing</span>}
                {authOperations.runtime.authUrls.emailWebhook.tokenMissingInProduction && <span>production webhook token missing</span>}
                {authOperations.runtime.oidc.missingInProduction && <span>production OIDC missing</span>}
                <span>{authOperations.runtime.oidc.configured ? "OIDC configured" : "OIDC not configured"}</span>
                {authOperations.runtime.serverAdmins.missingInProduction && <span>production server admins missing</span>}
                <span>{formatNumber(authOperations.runtime.serverAdmins.count)} server admins</span>
                <span>session TTL {formatNumber(authOperations.runtime.sessions.ttlDays)}d</span>
                <span>reset TTL {formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)}m</span>
                <span>{authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "webhook token configured" : "webhook token missing"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Users" value={formatNumber(authOperations.users.totalUserCount)} />
              <MetricTile label="Active Users" value={formatNumber(authOperations.users.activeUserCount)} />
              <MetricTile label="Auth Action" value={authOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Auth Reasons" value={formatNumber(authOperations.actionReasons.length)} />
              <MetricTile label="Auth Remediations" value={formatNumber(authOperations.remediationQueue.length)} />
              <MetricTile label="Auth Critical" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Auth Warnings" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Linked Identities" value={formatNumber(authOperations.identities.identityCount)} />
              <MetricTile label="Identity Providers" value={formatNumber(Object.keys(authOperations.identities.providerCounts).length)} />
              <MetricTile label="Server Admins" value={formatNumber(authOperations.runtime.serverAdmins.count)} />
              <MetricTile label="Admin Configured" value={authOperations.runtime.serverAdmins.configured ? "yes" : "no"} />
              <MetricTile label="Admin Prod Ready" value={authOperations.runtime.serverAdmins.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Config Errors" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length + authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Invalid Config" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length)} />
              <MetricTile label="OIDC Insecure Config" value={formatNumber(authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Configured" value={authOperations.runtime.oidc.configured ? "yes" : "no"} />
              <MetricTile label="OIDC Prod Ready" value={authOperations.runtime.oidc.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Complete" value={authOperations.runtime.oidc.issuerConfigured && authOperations.runtime.oidc.clientIdConfigured && authOperations.runtime.oidc.clientSecretConfigured && authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Issuer" value={authOperations.runtime.oidc.issuerConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Client ID" value={authOperations.runtime.oidc.clientIdConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Secret" value={authOperations.runtime.oidc.clientSecretConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Redirect" value={authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Return Origins" value={authOperations.runtime.oidc.allowedReturnOriginsConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Token Auth" value={authOperations.runtime.oidc.tokenAuth} />
              <MetricTile label="OIDC Insecure Issuer" value={authOperations.runtime.oidc.allowInsecureIssuer ? "yes" : "no"} />
              <MetricTile label="Auth URL Errors" value={formatNumber(authOperations.runtime.authUrls.invalidUrlConfig.length + authOperations.runtime.authUrls.insecureUrlConfig.length)} />
              <MetricTile label="Auth Config Errors" value={formatNumber(authOperations.runtime.authUrls.invalidNumericConfig.length)} />
              <MetricTile label="Session TTL" value={`${formatNumber(authOperations.runtime.sessions.ttlDays)} d`} />
              <MetricTile label="Stale Threshold" value={`${formatNumber(authOperations.sessions.staleDays)} d`} />
              <MetricTile label="Session Config Errors" value={formatNumber(authOperations.runtime.sessions.invalidNumericConfig.length)} />
              <MetricTile label="Disabled" value={formatNumber(authOperations.users.disabledUserCount)} />
              <MetricTile label="Disabled User Rate" value={formatPercent(authOperations.users.totalUserCount === 0 ? 0 : authOperations.users.disabledUserCount / authOperations.users.totalUserCount)} />
              <MetricTile label="Recent Disabled Users" value={formatNumber(authOperations.users.disabledUsers.length)} />
              <MetricTile label="Disabled User Sessions" value={formatNumber(authOperations.users.disabledUsers.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Sessions" value={formatNumber(authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Sessions" value={formatNumber(authOperations.sessions.totals.riskSessionCount)} />
              <MetricTile label="Risk Session Rate" value={formatPercent(authOperations.sessions.totals.sessionCount === 0 ? 0 : authOperations.sessions.totals.riskSessionCount / authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Session Samples" value={formatNumber(authOperations.sessions.recentRiskSessions.length)} />
              <MetricTile label="Expired Sessions" value={formatNumber(authOperations.sessions.totals.expiredSessionCount)} />
              <MetricTile label="Stale Sessions" value={formatNumber(authOperations.sessions.totals.staleSessionCount)} />
              <MetricTile label="Disabled Sessions" value={formatNumber(authOperations.sessions.totals.disabledUserSessionCount)} />
              <MetricTile label="Unknown Sessions" value={formatNumber(authOperations.sessions.totals.unknownUserSessionCount)} />
              <MetricTile label="Risk Cleanup Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRunCount)} />
              <MetricTile label="Recent Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.length)} />
              <MetricTile label="Recent Risk Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.reduce((total, run) => total + run.revoked, 0))} />
              <MetricTile label="Latest Risk Cleanup" value={authOperations.sessions.cleanupOperations.latestRiskRevokeAt ? formatDateTime(authOperations.sessions.cleanupOperations.latestRiskRevokeAt) : "none"} />
              <MetricTile label="Risk Dry Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeDryRunCount)} />
              <MetricTile label="Risk Matched" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMatchedCount)} />
              <MetricTile label="Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMutationCount)} />
              <MetricTile label="Sessions Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRevokedCount)} />
              <MetricTile label="Direct Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.singleSessionRevocationCount)} />
              <MetricTile label="User Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.userSessionRevocationRunCount)} />
              <MetricTile label="Reset Required" value={formatNumber(authOperations.users.passwordResetRequiredUserCount)} />
              <MetricTile label="Password Users" value={formatNumber(authOperations.users.passwordUserCount)} />
              <MetricTile label="MFA Enabled" value={formatNumber(authOperations.users.mfaEnabledUserCount)} />
              <MetricTile label="MFA Coverage" value={formatPercent(authOperations.users.mfaCoverageRate)} />
              <MetricTile label="No MFA" value={formatNumber(authOperations.users.activePasswordUserWithoutMfaCount)} />
              <MetricTile label="No MFA Rate" value={formatPercent(authOperations.users.passwordUserCount === 0 ? 0 : authOperations.users.activePasswordUserWithoutMfaCount / authOperations.users.passwordUserCount)} />
              <MetricTile label="No MFA Samples" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.length)} />
              <MetricTile label="No MFA Sessions" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Email Webhook" value={authOperations.emailOutbox.webhookConfigured ? "yes" : "no"} />
              <MetricTile label="Email Messages" value={formatNumber(authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Email Statuses" value={formatNumber(Object.keys(authOperations.emailOutbox.statusCounts).length)} />
              <MetricTile label="Email Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
              <MetricTile label="Pending Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.pending)} />
              <MetricTile label="Retry Emails" value={formatNumber(authOperations.emailOutbox.retryableCount)} />
              <MetricTile label="Retry Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : authOperations.emailOutbox.retryableCount / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Recent Retry Emails" value={formatNumber(authOperations.emailOutbox.recentRetryableMessages.length)} />
              <MetricTile label="Delivered Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.delivered)} />
              <MetricTile label="Email Delivery Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 1 : (authOperations.emailOutbox.statusCounts.delivered ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Failed Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.failed)} />
              <MetricTile label="Failed Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : (authOperations.emailOutbox.statusCounts.failed ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Undelivered Emails" value={formatNumber((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0))} />
              <MetricTile label="Undelivered Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : ((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0)) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Oldest Retry Email" value={formatDurationSeconds(authOperations.emailOutbox.oldestRetryableAgeSeconds)} />
              <MetricTile label="Reset Tokens" value={formatNumber(authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Active Resets" value={formatNumber(authOperations.passwordResets.activeCount)} />
              <MetricTile label="Expired Resets" value={formatNumber(authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Expired Reset Rate" value={formatPercent((authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount) === 0 ? 0 : authOperations.passwordResets.expiredUnusedCount / (authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount))} />
              <MetricTile label="Reset URL" value={authOperations.runtime.authUrls.passwordReset.configured ? (authOperations.runtime.authUrls.passwordReset.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Reset URL Secure" value={authOperations.runtime.authUrls.passwordReset.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Reset TTL" value={`${formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)} m`} />
              <MetricTile label="Web Origin" value={authOperations.runtime.authUrls.passwordReset.webOriginConfigured ? (authOperations.runtime.authUrls.passwordReset.webOriginValid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Web Origin Secure" value={authOperations.runtime.authUrls.passwordReset.webOriginInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook URL" value={authOperations.runtime.authUrls.emailWebhook.configured ? (authOperations.runtime.authUrls.emailWebhook.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Webhook Secure" value={authOperations.runtime.authUrls.emailWebhook.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Timeout" value={formatDuration(authOperations.runtime.authUrls.emailWebhook.timeoutMs)} />
              <MetricTile label="Reset Link Ready" value={authOperations.runtime.authUrls.passwordReset.linkMissingInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Token" value={authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Legacy Enabled" value={authOperations.runtime.legacyUserHeader.enabled ? "yes" : "no"} />
              <MetricTile label="Legacy Mode" value={authOperations.runtime.legacyUserHeader.mode} />
              <MetricTile label="Legacy Hard Fence" value={authOperations.runtime.legacyUserHeader.productionHardFence ? "yes" : "no"} />
              <MetricTile label="Legacy Compat Flag" value={authOperations.runtime.legacyUserHeader.compatibilityFlagSet ? "yes" : "no"} />
              <MetricTile label="Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.usageCount)} />
              <MetricTile label="Recent Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.recentSamples.length)} />
              <MetricTile label="Legacy Users" value={formatNumber(authOperations.legacyUserHeaderUsage.distinctUserCount)} />
              <MetricTile label="Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedAttemptCount)} />
              <MetricTile label="Legacy Block Rate" value={formatPercent((authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount) === 0 ? 0 : authOperations.legacyUserHeaderUsage.blockedAttemptCount / (authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount))} />
              <MetricTile label="Recent Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedSamples.length)} />
              <MetricTile label="Legacy Last Seen" value={authOperations.legacyUserHeaderUsage.lastSeenAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastSeenAt) : "none"} />
              <MetricTile label="Legacy Last Blocked" value={authOperations.legacyUserHeaderUsage.lastBlockedAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastBlockedAt) : "none"} />
              <MetricTile label="Login Failures" value={formatNumber(authOperations.loginFailures.failureCount)} />
              <MetricTile label="Recent Login Failures" value={formatNumber(authOperations.loginFailures.recentFailures.length)} />
              <MetricTile label="Known Login Users" value={formatNumber(authOperations.loginFailures.distinctKnownUserCount)} />
              <MetricTile label="Unknown Logins" value={formatNumber(authOperations.loginFailures.unknownIdentityCount)} />
              <MetricTile label="Unknown Login Rate" value={formatPercent(authOperations.loginFailures.failureCount === 0 ? 0 : authOperations.loginFailures.unknownIdentityCount / authOperations.loginFailures.failureCount)} />
              <MetricTile label="Login Reasons" value={formatNumber(Object.keys(authOperations.loginFailures.reasonCounts).length)} />
              <MetricTile label="Login Statuses" value={formatNumber(Object.keys(authOperations.loginFailures.statusCounts).length)} />
            </div>
            <div className="admin-actions">
              <button className="ghost-button" title="Revoke expired, stale, disabled-user, and unknown-user sessions" onClick={() => props.onRevokeRiskSessions().catch(console.error)} disabled={authOperations.sessions.totals.riskSessionCount === 0}>
                <RefreshCw size={14} /> Revoke risk sessions
              </button>
              <button className="ghost-button" title="Prune expired password reset tokens" onClick={() => props.onPruneExpiredPasswordResets().catch(console.error)} disabled={authOperations.passwordResets.expiredUnusedCount === 0}>
                <RefreshCw size={14} /> Prune expired resets
              </button>
              <button className="ghost-button" title="Retry all pending and failed auth email deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={authOperations.emailOutbox.retryableCount === 0 || !authOperations.emailOutbox.webhookConfigured}>
                <Mail size={14} /> Retry emails
              </button>
            </div>
            {authOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`auth-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {authOperations.loginFailures.failureCount > 0 && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review</span>
                  <strong>{formatNumber(authOperations.loginFailures.failureCount)} failed</strong>
                </div>
                <h3>Login failures</h3>
                <p>{formatNumber(authOperations.loginFailures.unknownIdentityCount)} unknown identities - {formatNumber(authOperations.loginFailures.distinctKnownUserCount)} known users</p>
                <div className="admin-meta">
                  {Object.entries(authOperations.loginFailures.reasonCounts).map(([reason, count]) => (
                    <span key={`login-failure-reason-${reason}`}>{reason} {formatNumber(count)}</span>
                  ))}
                </div>
              </article>
            )}
            {authOperations.sessions.recentRiskSessions.slice(0, 3).map((riskSession) => (
              <div className="operator-row tool-call-row" key={riskSession.session.id}>
                <span>{riskSession.user.displayName}</span>
                <strong>{riskSession.reasons.join(", ")} - {riskSession.lastSeenAgeDays ?? 0}d seen - expires {formatDuration(Math.max(0, riskSession.expiresInMs))}</strong>
              </div>
            ))}
            {authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`risk-session-cleanup-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run risk cleanup" : "risk cleanup"}</span>
                <strong>{run.reasons.join(", ") || "all reasons"} - {formatNumber(run.revoked)} revoked / {formatNumber(run.matched)} matched - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {authOperations.users.disabledUsers.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`disabled-user-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.disabledAt ? formatDateTime(user.disabledAt) : "disabled"}</strong>
              </div>
            ))}
            {authOperations.users.activePasswordUsersWithoutMfa.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`no-mfa-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.passwordResetRequired ? "reset required" : "password active"}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.recentSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>{sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.blockedSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`blocked-legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>blocked {sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.loginFailures.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`auth-login-failure-${failure.auditLogId}`}>
                <span>{failure.userId ?? "unknown identity"}</span>
                <strong>{failure.reason} - HTTP {failure.statusCode} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {authOperations.emailOutbox.recentRetryableMessages.slice(0, 3).map((message) => (
              <div className="operator-row tool-call-row" key={`retry-email-${message.id}`}>
                <span>{message.subject}</span>
                <strong>{message.to} - {message.status}{message.error ? ` - ${message.error}` : ""}</strong>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Auth setup">
        <div className="operator-heading">
          <div className="section-title">Auth Setup</div>
          <strong>{authOperations ? (authOperations.runtime.oidc.configured || authOperations.runtime.scim.configured ? "enterprise ready" : "local accounts") : "not loaded"}</strong>
        </div>
        {!authOperations ? (
          <div className="empty-state compact">No auth setup data loaded.</div>
        ) : (
          <>
            <div className="metric-grid">
              <MetricTile label="OIDC Setup" value={authOperations.runtime.oidc.configured ? "ready" : "missing"} />
              <MetricTile label="OIDC Required Vars" value={formatNumber(oidcRequiredConfiguredCount)} />
              <MetricTile label="SCIM Setup" value={authOperations.runtime.scim.configured ? "ready" : "missing"} />
              <MetricTile label="SCIM Users" value={formatNumber(authOperations.runtime.scim.userCount)} />
              <MetricTile label="SCIM Groups" value={formatNumber(authOperations.runtime.scim.groupCount)} />
              <MetricTile label="SCIM Matched Maps" value={formatNumber(authOperations.runtime.scim.matchedMappingCount)} />
            </div>
            <div className="admin-actions">
              <button className="ghost-button" title="Run redacted OIDC discovery readiness check" onClick={() => testAuthConnection("oidc").catch(console.error)}>
                <Shield size={14} /> Test OIDC
              </button>
              <button className="ghost-button" title="Run redacted SCIM endpoint readiness check" onClick={() => testAuthConnection("scim").catch(console.error)}>
                <Shield size={14} /> Test SCIM
              </button>
            </div>
            <div className="import-status auth-test-status" role="status" aria-live="polite">
              <strong>Auth test</strong>
              <span>{authConnectionTestStatus}</span>
            </div>
            <div className="asset-pressure-list" aria-label="Identity provider setup guides">
              {identityProviderSetupGuides.map((guide) => (
                <div className="operator-row tool-call-row" key={guide.id}>
                  <span>{guide.name}</span>
                  <strong>{guide.oidc} {guide.scim}</strong>
                </div>
              ))}
            </div>
            {authConnectionTest && (
              <article className="operator-item admin-item" aria-label={`${authConnectionTest.provider.toUpperCase()} connection test result`}>
                <div className="operator-row">
                  <span className={`status-pill ${authConnectionTest.ok ? "completed" : authConnectionTest.status === "failed" ? "failed" : "running"}`}>{authConnectionTest.status}</span>
                  <strong>{authConnectionTest.provider.toUpperCase()} test</strong>
                </div>
                <p>{authConnectionTest.checks.filter((check) => check.ok).length} of {authConnectionTest.checks.length} checks passed - {formatDateTime(authConnectionTest.testedAt)}</p>
                <div className="admin-meta">
                  {authConnectionTest.checks.map((check) => (
                    <span key={`${authConnectionTest.provider}-${check.name}`}>{check.name} {check.ok ? "ok" : "blocked"}: {check.detail}</span>
                  ))}
                </div>
              </article>
            )}
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.runtime.oidc.configured && authOperations.runtime.oidc.invalidConfig.length === 0 ? "completed" : "running"}`}>OIDC</span>
                <strong>{authOperations.runtime.oidc.tokenAuth}</strong>
              </div>
              <h3>Single sign-on</h3>
              <p>{authOperations.runtime.oidc.configured ? "OIDC sign-in is available from the login screen." : "Set the OIDC environment variables, then refresh this panel to validate the setup posture."}</p>
              <div className="admin-meta">
                <span>OTTE_OIDC_ISSUER {authOperations.runtime.oidc.issuerConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_CLIENT_ID {authOperations.runtime.oidc.clientIdConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_CLIENT_SECRET {authOperations.runtime.oidc.clientSecretConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_REDIRECT_URI {authOperations.runtime.oidc.redirectUriConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_ALLOWED_RETURN_ORIGINS {authOperations.runtime.oidc.allowedReturnOriginsConfigured ? "set" : "optional"}</span>
                {authOperations.runtime.oidc.invalidConfig.length > 0 && <span>invalid {authOperations.runtime.oidc.invalidConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.insecureConfig.length > 0 && <span>insecure {authOperations.runtime.oidc.insecureConfig.join(", ")}</span>}
              </div>
            </div>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.runtime.scim.configured ? "completed" : "running"}`}>SCIM</span>
                <strong>{formatNumber(authOperations.runtime.scim.mappingCount)} mappings</strong>
              </div>
              <h3>Directory provisioning</h3>
              <p>{authOperations.runtime.scim.configured ? "SCIM bearer provisioning is enabled; map directory groups below to campaign roles." : "Set OTTE_SCIM_BEARER_TOKEN to enable SCIM v2 provisioning endpoints."}</p>
              <div className="admin-meta">
                <span>OTTE_SCIM_BEARER_TOKEN {authOperations.runtime.scim.bearerTokenConfigured ? "set" : "missing"}</span>
                <span>{authOperations.runtime.scim.serviceProviderConfigPath}</span>
                <span>{authOperations.runtime.scim.usersPath}</span>
                <span>{authOperations.runtime.scim.groupsPath}</span>
                <span>{formatNumber(authOperations.runtime.scim.groupCount)} groups</span>
                <span>{formatNumber(authOperations.runtime.scim.userCount)} users</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin users">
        <div className="operator-heading">
          <div className="section-title">Users</div>
          <strong>{users.length}</strong>
        </div>
        {users.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Admin Users" value={formatNumber(users.length)} />
            <MetricTile label="Disabled Users" value={formatNumber(disabledAdminUserCount)} />
            <MetricTile label="Reset Required Users" value={formatNumber(resetRequiredAdminUserCount)} />
            <MetricTile label="Users With Sessions" value={formatNumber(sessionBearingAdminUserCount)} />
            <MetricTile label="Linked Identity Users" value={formatNumber(identityLinkedAdminUserCount)} />
            <MetricTile label="User Sessions" value={formatNumber(users.reduce((total, user) => total + user.sessionCount, 0))} />
            <MetricTile label="User Memberships" value={formatNumber(users.reduce((total, user) => total + user.membershipCount, 0))} />
            <MetricTile label="User Identities" value={formatNumber(users.reduce((total, user) => total + user.identityCount, 0))} />
          </div>
        )}
        {users.length === 0 ? (
          <div className="empty-state compact">No admin user data loaded.</div>
        ) : (
          users.map((user) => (
            <article className="operator-item admin-item" key={user.id}>
              <div className="operator-row">
                <span className={`status-pill ${user.disabled ? "failed" : "completed"}`}>{user.disabled ? "disabled" : "active"}</span>
                <strong>{user.sessionCount} sessions</strong>
              </div>
              <h3>{user.displayName}</h3>
              <p>{user.email ?? "No email"} - {user.id}</p>
              <div className="admin-meta">
                <span>{user.membershipCount} memberships</span>
                <span>{user.identityCount} identities</span>
                <span>{user.passwordResetRequired ? "reset required" : "password current"}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Issue password reset email" onClick={() => props.onIssueReset(user).catch(console.error)} disabled={!user.email || user.disabled}>
                  <Mail size={14} /> Reset
                </button>
                <button className="ghost-button" title="Require password reset at next login" onClick={() => props.onRequireReset(user).catch(console.error)} disabled={user.disabled}>
                  <KeyRound size={14} /> Require
                </button>
                {user.disabled ? (
                  <button className="ghost-button" title="Enable account" onClick={() => props.onEnableUser(user).catch(console.error)}>
                    <Check size={14} /> Enable
                  </button>
                ) : (
                  <button className="ghost-button" title={user.id === props.currentUserId ? "Admins cannot disable their current account" : "Disable account"} onClick={() => props.onDisableUser(user).catch(console.error)} disabled={user.id === props.currentUserId}>
                    <UserX size={14} /> Disable
                  </button>
                )}
                <button className="ghost-button" title="Revoke all user sessions" onClick={() => props.onRevokeUserSessions(user).catch(console.error)} disabled={user.sessionCount === 0}>
                  <RefreshCw size={14} /> Revoke
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Organization workspace defaults">
        <div className="operator-heading">
          <div className="section-title">Workspace Defaults</div>
          <strong>{workspaceDefaults ? formatDateTime(workspaceDefaults.updatedAt) : "not loaded"}</strong>
        </div>
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveWorkspaceDefaults().catch((error) => setWorkspaceDefaultsStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="operator-row">
            <span>{workspaceDefaults?.id ?? "organization workspace"}</span>
            <strong>{workspaceVisibility}</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Name</span>
              <input aria-label="Workspace default name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </label>
            <label>
              <span>Rules system</span>
              <select aria-label="Workspace default rules system" value={workspaceSystemId} onChange={(event) => setWorkspaceSystemId(event.target.value)}>
                {workspaceSystemOptions.map((systemId) => (
                  <option key={systemId} value={systemId}>{systemId}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select aria-label="Workspace default campaign visibility" value={workspaceVisibility} onChange={(event) => setWorkspaceVisibility(event.target.value as Campaign["visibility"])}>
                <option value="private">Private</option>
                <option value="invite_only">Invite only</option>
                <option value="public">Public</option>
              </select>
            </label>
            <label>
              <span>Permission template</span>
              <select aria-label="Workspace default permission template" value={workspaceTemplate} onChange={(event) => setWorkspaceTemplate(event.target.value as CampaignPermissionTemplateId)}>
                {campaignPermissionTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Invite role</span>
              <select aria-label="Workspace default invite role" value={workspaceInviteRole} onChange={(event) => setWorkspaceInviteRole(event.target.value as Exclude<UserRole, "owner" | "plugin" | "ai_assistant">)}>
                <option value="player">Player</option>
                <option value="observer">Observer</option>
                <option value="assistant_gm">Assistant GM</option>
                <option value="gm">GM</option>
              </select>
            </label>
            <label>
              <span>Scene name</span>
              <input aria-label="Workspace default scene name" value={workspaceSceneName} onChange={(event) => setWorkspaceSceneName(event.target.value)} />
            </label>
            <label>
              <span>Scene folder</span>
              <input aria-label="Workspace default scene folder" value={workspaceSceneFolder} onChange={(event) => setWorkspaceSceneFolder(event.target.value)} />
            </label>
            <label>
              <span>Scene width</span>
              <input aria-label="Workspace default scene width" type="number" min={1} value={workspaceSceneWidth} onChange={(event) => setWorkspaceSceneWidth(Number(event.target.value))} />
            </label>
            <label>
              <span>Scene height</span>
              <input aria-label="Workspace default scene height" type="number" min={1} value={workspaceSceneHeight} onChange={(event) => setWorkspaceSceneHeight(Number(event.target.value))} />
            </label>
            <label>
              <span>Grid size</span>
              <input aria-label="Workspace default grid size" type="number" min={1} value={workspaceSceneGridSize} onChange={(event) => setWorkspaceSceneGridSize(Number(event.target.value))} />
            </label>
            <label>
              <span>Onboarding title</span>
              <input aria-label="Workspace default onboarding title" value={workspaceOnboardingTitle} onChange={(event) => setWorkspaceOnboardingTitle(event.target.value)} />
            </label>
            <label>
              <span>Onboarding body</span>
              <textarea aria-label="Workspace default onboarding body" value={workspaceOnboardingBody} onChange={(event) => setWorkspaceOnboardingBody(event.target.value)} />
            </label>
          </div>
          <p className="admin-status">{workspaceDefaultsStatus}</p>
          <button className="ghost-button wide" type="submit" disabled={!workspaceName.trim() || !workspaceSystemId.trim() || !workspaceSceneName.trim() || workspaceSceneWidth <= 0 || workspaceSceneHeight <= 0 || workspaceSceneGridSize <= 0}>
            <Check size={14} /> Save workspace defaults
          </button>
        </form>
      </section>

      <section className="admin-section" aria-label="Organization members">
        <div className="operator-heading">
          <div className="section-title">Organization Members</div>
          <strong>{organizationMembers.length} members</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Organization Members" value={formatNumber(organizationMembers.length)} />
          <MetricTile label="Organization Admins" value={formatNumber(organizationAdminCount)} />
          <MetricTile label="Current Role" value={organizationCurrentUser?.role ?? "none"} />
          <MetricTile label="Workspace Owner" value={workspaceDefaults?.ownerUserId === props.currentUserId ? "you" : workspaceDefaults?.ownerUserId ?? "unknown"} />
        </div>
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitOrganizationMember().catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="operator-row">
            <span>Existing user access</span>
            <strong>{workspaceDefaults?.id ?? "organization workspace"}</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>User email</span>
              <input aria-label="Organization member email" type="email" value={organizationMemberEmail} placeholder="player@example.com" onChange={(event) => setOrganizationMemberEmail(event.target.value)} />
            </label>
            <label>
              <span>Role</span>
              <select aria-label="Organization member role" value={organizationMemberRole} onChange={(event) => setOrganizationMemberRole(event.target.value as Exclude<OrganizationMemberRole, "owner">)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <p className="admin-status">{organizationMemberStatus}</p>
          <button className="ghost-button wide" type="submit" disabled={!organizationMemberEmail.trim()}>
            <UserPlus size={14} /> Add organization member
          </button>
        </form>
        {organizationMembers.length === 0 ? (
          <div className="empty-state compact">No organization members loaded.</div>
        ) : (
          organizationMembers.map((member) => (
            <article className="operator-item admin-item" key={member.id}>
              <div className="operator-row">
                <span className={`status-pill ${member.role === "member" ? "running" : "completed"}`}>{member.role}</span>
                <strong>{member.user.id === props.currentUserId ? "current user" : member.user.id}</strong>
              </div>
              <h3>{member.user.displayName}</h3>
              <p>{member.user.email ?? "No email"} - {member.organizationId}</p>
              <div className="admin-meta">
                <span>created {formatDateTime(member.createdAt)}</span>
                <span>updated {formatDateTime(member.updatedAt)}</span>
              </div>
              {member.role === "owner" ? (
                <div className="admin-meta">
                  <span>Owner role is protected</span>
                </div>
              ) : (
                <div className="admin-actions">
                  <select aria-label={`Organization member role for ${member.user.displayName}`} value={member.role} onChange={(event) => {
                    const role = event.target.value as Exclude<OrganizationMemberRole, "owner">;
                    props.onUpdateOrganizationMember(member, role)
                      .then(() => setOrganizationMemberStatus(`Organization member ${member.user.displayName} saved as ${role}`))
                      .catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
                  }}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="ghost-button danger-button" type="button" disabled={member.userId === props.currentUserId} onClick={() => {
                    props.onRemoveOrganizationMember(member)
                      .then(() => setOrganizationMemberStatus(`Organization member ${member.user.displayName} removed`))
                      .catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
                  }} title={member.userId === props.currentUserId ? "Current user cannot be removed from this panel" : "Remove organization member"}>
                    <UserX size={14} /> Remove member
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Organization access">
        <div className="operator-heading">
          <div className="section-title">Organization Access</div>
          <strong>{scimMappings.length} mappings</strong>
        </div>
        {scimMappings.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="SCIM Mappings" value={formatNumber(scimMappings.length)} />
            <MetricTile label="Matched Groups" value={formatNumber(matchedScimMappingCount)} />
            <MetricTile label="Pending Groups" value={formatNumber(scimMappings.length - matchedScimMappingCount)} />
            <MetricTile label="Mapped Members" value={formatNumber(scimMappedMemberCount)} />
            <MetricTile label="Mapped Campaigns" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.campaignId)).size)} />
            <MetricTile label="Mapped Roles" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.role)).size)} />
          </div>
        )}
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            const groupValue = scimGroupValue.trim();
            if (!selectedScimCampaignId || !groupValue) return;
            const input: AdminScimGroupRoleMappingInput = { campaignId: selectedScimCampaignId, role: scimRole };
            input[scimMatchType] = groupValue;
            props.onCreateScimMapping(input).then(() => setScimGroupValue("")).catch(console.error);
          }}
        >
          <div className="operator-row">
            <span>SCIM group mapping</span>
            <strong>{props.campaigns.length} campaigns</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Campaign</span>
              <select aria-label="Mapping campaign" value={selectedScimCampaignId} onChange={(event) => setScimCampaignId(event.target.value)}>
                {props.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Role</span>
              <select aria-label="Mapping role" value={scimRole} onChange={(event) => setScimRole(event.target.value as ScimAssignableRole)}>
                <option value="player">Player</option>
                <option value="observer">Observer</option>
                <option value="assistant_gm">Assistant GM</option>
                <option value="gm">GM</option>
              </select>
            </label>
            <label>
              <span>Match</span>
              <select aria-label="SCIM group match" value={scimMatchType} onChange={(event) => setScimMatchType(event.target.value as "groupDisplayName" | "groupExternalId" | "groupId")}>
                <option value="groupDisplayName">Display name</option>
                <option value="groupExternalId">External id</option>
                <option value="groupId">Group id</option>
              </select>
            </label>
            <label>
              <span>Group</span>
              <input aria-label="SCIM group identifier" value={scimGroupValue} placeholder={scimMatchType === "groupId" ? "scimg_..." : "External group name"} onChange={(event) => setScimGroupValue(event.target.value)} />
            </label>
          </div>
          <button className="ghost-button wide" type="submit" disabled={!selectedScimCampaignId || !scimGroupValue.trim()}>
            <UserPlus size={14} /> Add mapping
          </button>
        </form>
        {!props.admin ? (
          <div className="empty-state compact">No organization data loaded.</div>
        ) : scimMappings.length === 0 ? (
          <div className="empty-state compact">No SCIM group role mappings.</div>
        ) : (
          scimMappings.slice(0, 8).map((mapping) => (
            <article className="operator-item admin-item" key={mapping.id}>
              <div className="operator-row">
                <span className={`status-pill ${mapping.group ? "completed" : "running"}`}>{mapping.group ? "matched" : "pending"}</span>
                <strong>{mapping.role}</strong>
              </div>
              <h3>{scimMappingLabel(mapping)}</h3>
              <p>{campaignName(props.campaigns, mapping.campaignId)} - {mapping.id}</p>
              <div className="admin-meta">
                <span>{mapping.group?.memberUserIds.length ?? 0} SCIM members</span>
                <span>{scimMappingIdentity(mapping)}</span>
                <span>{formatDateTime(mapping.updatedAt)}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Delete SCIM group role mapping" onClick={() => props.onDeleteScimMapping(mapping).catch(console.error)}>
                  <UserX size={14} /> Delete mapping
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="SQLite storage operations">
        <div className="operator-heading">
          <div className="section-title">SQLite Storage</div>
          <strong>{storageOperations?.provider ?? "not loaded"}</strong>
        </div>
        {!storageOperations ? (
          <div className="empty-state compact">No storage operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${storageOperations.actionRequired ? "failed" : "completed"}`}>{storageOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{storageOperations.supported ? "admin operable" : "unsupported store"}</strong>
              </div>
              <p>{storageOperations.database?.fileName ?? "database unavailable"} - {storageOperations.database?.jsonRecordModel ? "JSON record model" : "store model unknown"}</p>
              <div className="admin-meta">
                <span>{storageOperations.actionReasons.length > 0 ? storageOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{storageOperations.integrity?.ok ? "integrity ok" : storageOperations.integrity ? "integrity failed" : "integrity not checked"}</span>
                <span>{storageOperations.backups?.latest ? `latest backup ${formatDateTime(storageOperations.backups.latest.createdAt)}` : "no backup"}</span>
                <span>{storageOperations.scheduledBackups?.enabled ? "scheduled backups enabled" : "scheduled backups off"}</span>
                <span>{storageOperations.indexes?.missing.length ? `missing indexes ${storageOperations.indexes.missing.join(", ")}` : "required indexes present"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Storage Action" value={storageOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Storage Reasons" value={formatNumber(storageOperations.actionReasons.length)} />
              <MetricTile label="Records" value={formatNumber(storageOperations.records?.total)} />
              <MetricTile label="Collections" value={formatNumber(storageOperations.records?.collections.length)} />
              <MetricTile label="Database Size" value={formatStorageBytes(storageOperations.database?.sizeBytes)} />
              <MetricTile label="JSON Records" value={storageOperations.database?.jsonRecordModel ? "yes" : "no"} />
              <MetricTile label="Latest Migration" value={formatNumber(storageOperations.migrations?.latestAppliedVersion)} />
              <MetricTile label="Missing Migrations" value={formatNumber(storageOperations.migrations?.missingVersions.length)} />
              <MetricTile label="Applied Migrations" value={formatNumber(storageOperations.migrations?.applied.length)} />
              <MetricTile label="Integrity" value={storageOperations.integrity?.ok ? "ok" : "check"} />
              <MetricTile label="Indexes Missing" value={formatNumber(storageOperations.indexes?.missing.length)} />
              <MetricTile label="Latest Backup" value={storageOperations.backups?.latest ? formatStorageBytes(storageOperations.backups.latest.sizeBytes) : "missing"} />
              <MetricTile label="Backup Schedule" value={storageOperations.scheduledBackups?.enabled ? "enabled" : "off"} />
              <MetricTile label="Backup Interval" value={storageOperations.scheduledBackups?.intervalSeconds ? formatDurationSeconds(storageOperations.scheduledBackups.intervalSeconds) : "manual"} />
              <MetricTile label="Backup Startup" value={storageOperations.scheduledBackups?.runOnStart ? "yes" : "no"} />
              <MetricTile label="Scheduled Running" value={storageOperations.scheduledBackups?.running ? "yes" : "no"} />
              <MetricTile label="Scheduled Result" value={storageOperations.scheduledBackups?.lastRun?.status ?? "none"} />
              <MetricTile label="Restore Drill" value={storageRestoreDrill?.status ?? "not run"} />
              <MetricTile label="Drill Records" value={formatNumber(storageRestoreDrill?.recordCount)} />
              <MetricTile label="Drill Campaigns" value={formatNumber(storageRestoreDrill?.campaignCount)} />
              <MetricTile label="Backup Directory" value={storageOperations.backups?.directoryName ?? "n/a"} />
            </div>
            <p className="admin-status">{storageBackupStatus}</p>
            {storageOperations.records?.collections.slice(0, 6).map((collection) => (
              <div className="operator-row tool-call-row" key={`storage-collection-${collection.collection}`}>
                <span>{collection.collection}</span>
                <strong>{formatNumber(collection.count)} records</strong>
              </div>
            ))}
            {storageOperations.migrations?.missingVersions.slice(0, 4).map((version) => (
              <div className="operator-row tool-call-row" key={`storage-missing-migration-${version}`}>
                <span>Missing migration</span>
                <strong>v{formatNumber(version)}</strong>
              </div>
            ))}
            {storageOperations.scheduledBackups?.lastRun && (
              <div className="operator-row tool-call-row">
                <span>Scheduled backup {storageOperations.scheduledBackups.lastRun.trigger}</span>
                <strong>{storageOperations.scheduledBackups.lastRun.status} - {storageOperations.scheduledBackups.lastRun.error ?? storageOperations.scheduledBackups.lastRun.fileName ?? "no file"}</strong>
              </div>
            )}
            {storageRestoreDrill && (
              <div className="operator-row tool-call-row">
                <span>{storageRestoreDrill.status === "passed" ? "Restore drill passed" : "Restore drill failed"}</span>
                <strong>{storageRestoreDrill.error ?? `${formatNumber(storageRestoreDrill.recordCount)} records - ${storageRestoreDrill.backup?.fileName ?? "latest backup"}`}</strong>
              </div>
            )}
            {storageOperations.backups?.latest && (
              <div className="danger-zone" aria-label="Destructive storage restore">
                <p className="account-summary">Restores the live SQLite store from the latest verified backup. Type the backup filename exactly before running it.</p>
                <input aria-label="Confirm storage restore backup filename" value={storageRestoreConfirm} placeholder={storageOperations.backups.latest.fileName} onChange={(event) => setStorageRestoreConfirm(event.target.value)} />
                <button className="ghost-button wide" type="button" onClick={() => restoreStorageBackup(storageOperations.backups!.latest!.fileName).catch(console.error)} disabled={!storageOperations.supported || storageRestoreConfirm !== storageOperations.backups.latest.fileName}>
                  <RotateCcw size={14} /> Restore Backup
                </button>
              </div>
            )}
            <div className="admin-actions">
              <button className="ghost-button" title="Create a timestamped SQLite backup" onClick={() => createStorageBackup().catch(console.error)} disabled={!storageOperations.supported}>
                <Download size={14} /> Create Backup
              </button>
              <button className="ghost-button" title="Copy the latest SQLite backup and verify it can be opened" onClick={() => runStorageRestoreDrill().catch(console.error)} disabled={!storageOperations.supported || !storageOperations.backups?.latest}>
                <RefreshCw size={14} /> Run Restore Drill
              </button>
              <button className="ghost-button" title="Queue a storage backup worker job" onClick={() => queueStorageJob("storage.backup").catch(console.error)} disabled={!storageOperations.supported}>
                <Timer size={14} /> Queue Backup Job
              </button>
              <button className="ghost-button" title="Queue a storage restore-drill worker job" onClick={() => queueStorageJob("storage.restoreDrill").catch(console.error)} disabled={!storageOperations.supported}>
                <Timer size={14} /> Queue Drill Job
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Job ledger">
        <div className="operator-heading">
          <div className="section-title">Job Ledger</div>
          <strong>{jobLedgerSummary}</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Total Jobs" value={formatNumber(jobOperations?.totals.totalCount ?? jobs.length)} />
          <MetricTile label="Queued Jobs" value={formatNumber(queuedJobCount)} />
          <MetricTile label="Running Jobs" value={formatNumber(runningJobCount)} />
          <MetricTile label="Failed Jobs" value={formatNumber(failedJobCount)} />
          <MetricTile label="Cancelled Jobs" value={formatNumber(cancelledJobCount)} />
          <MetricTile label="Retryable Jobs" value={formatNumber(retryableJobCount)} />
          <MetricTile label="Retry Exhausted" value={formatNumber(jobOperations?.totals.exhaustedCount)} />
          <MetricTile label="Stale Queue" value={formatNumber(jobOperations?.queue.staleQueuedCount)} />
          <MetricTile label="Queue Age" value={jobOperations ? formatDurationSeconds(jobOperations.queue.maxQueueAgeSeconds) : "n/a"} />
          <MetricTile label="Expired Leases" value={formatNumber(jobOperations?.leases.expiredCount)} />
          <MetricTile label="Stale Heartbeats" value={formatNumber(jobOperations?.leases.staleHeartbeatCount)} />
          <MetricTile label="Workers" value={formatNumber(jobOperations?.leases.leasedWorkerCount)} />
          <MetricTile label="Job Remediations" value={formatNumber(jobOperations?.remediationQueue.length)} />
          <MetricTile label="Newest Job" value={newestJobUpdatedAt ? formatDateTime(newestJobUpdatedAt) : "none"} />
        </div>
        <p className="admin-status">{jobLedgerStatus}</p>
        {jobOperations?.remediationQueue.slice(0, 4).map((item) => (
          <div className="operator-row tool-call-row" key={`job-remediation-${item.code}`}>
            <span>{item.severity}: {item.code}</span>
            <strong>{formatNumber(item.affectedCount)} affected - {item.action}</strong>
          </div>
        ))}
        {jobOperations?.leases.workers.slice(0, 4).map((worker) => (
          <div className="operator-row tool-call-row" key={`job-worker-${worker.workerId}`}>
            <span>{worker.workerId}</span>
            <strong>{formatNumber(worker.runningCount)} running - {formatNumber(worker.expiredLeaseCount)} expired - heartbeat {worker.lastHeartbeatAt ? formatDateTime(worker.lastHeartbeatAt) : "missing"}</strong>
          </div>
        ))}
        <div className="operator-row tool-call-row" aria-label="Job alert delivery">
          <span>Alert delivery</span>
          <strong>{jobOperations ? (jobOperations.actionRequired ? `ready to send - ${jobOperations.actionReasons.join(", ") || "operator review"}` : "dry-run available - no delivery needed") : "not loaded"}; configure OTTE_JOB_ALERT_WEBHOOK_URL to deliver</strong>
        </div>
        <div className="admin-actions">
          <button className="ghost-button" title="Dry-run the job operations alert payload" onClick={() => deliverJobAlert(true).catch(console.error)} disabled={!jobOperations}>
            <Activity size={14} /> Dry Run Alert
          </button>
          <button className="ghost-button" title="Deliver the current job operations alert to the configured webhook" onClick={() => deliverJobAlert(false).catch(console.error)} disabled={!jobOperations || !jobOperations.actionRequired}>
            <Send size={14} /> Send Alert
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state compact">No server-admin jobs have been queued recently.</div>
        ) : (
          jobs.slice(0, 8).map((job) => (
            <article className="operator-item admin-item" key={job.id}>
              <div className="operator-row">
                <span className={jobStatusClass(job.status)}>{job.status}</span>
                <strong>{job.type}</strong>
              </div>
              <p>{job.progress?.message ?? job.error ?? `queued ${formatDateTime(job.queuedAt)}`}</p>
              <div className="admin-meta">
                <span>{formatNumber(job.attempts)} / {formatNumber(job.maxAttempts)} attempts</span>
                {job.progress?.percent !== undefined && <span>{formatNumber(job.progress.percent)}% complete</span>}
                {job.startedAt && <span>started {formatDateTime(job.startedAt)}</span>}
                {job.completedAt && <span>completed {formatDateTime(job.completedAt)}</span>}
                {job.logs.at(-1) && <span>last log {job.logs.at(-1)?.level}: {job.logs.at(-1)?.message}</span>}
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Retry failed or cancelled job" onClick={() => retryAdminJob(job).catch(console.error)} disabled={(job.status !== "failed" && job.status !== "cancelled") || job.attempts >= job.maxAttempts}>
                  <RotateCcw size={14} /> Retry
                </button>
                <button className="ghost-button" title="Cancel queued or running job" onClick={() => cancelAdminJob(job).catch(console.error)} disabled={job.status !== "queued" && job.status !== "running"}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Asset storage operations">
        <div className="operator-heading">
          <div className="section-title">Asset Storage</div>
          <strong>{assetStorage?.runtime.provider ?? "not loaded"}</strong>
        </div>
        {!assetStorage ? (
          <div className="empty-state compact">No asset storage data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetStorage.operations.actionRequired ? "failed" : "completed"}`}>{assetStorage.operations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{assetStorage.runtime.delivery.mode}</strong>
              </div>
              <p>{assetStorage.runtime.delivery.cdnConfigured ? "CDN configured" : "signed blob delivery"} - {assetStorage.runtime.trustScanner.externalConfigured ? "external scanner configured" : "built-in scanner only"}</p>
              <div className="admin-meta">
                <span>{assetStorage.operations.actionReasons.length > 0 ? assetStorage.operations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetStorage.runtime.delivery.purgeWebhookConfigured ? "purge webhook configured" : "purge webhook missing"}</span>
                <span>{assetStorage.runtime.cleanup.enabled ? "cleanup scheduled" : "cleanup manual"}</span>
                {assetStorage.runtime.invalidConfig.length > 0 && <span>invalid config {assetStorage.runtime.invalidConfig.join(", ")}</span>}
                {assetStorage.runtime.invalidUrlConfig.length > 0 && <span>invalid URLs {assetStorage.runtime.invalidUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.insecureUrlConfig.length > 0 && <span>insecure production URLs {assetStorage.runtime.insecureUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.missingTokenConfig.length > 0 && <span>missing webhook tokens {assetStorage.runtime.missingTokenConfig.join(", ")}</span>}
                {assetStorage.runtime.cleanup.riskyConfig.length > 0 && <span>risky cleanup config {assetStorage.runtime.cleanup.riskyConfig.join(", ")}</span>}
                {assetStorage.runtime.quota.quotaPolicyMissingInProduction && <span>production quota policy missing</span>}
                {assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction && <span>production retention policy missing</span>}
                <span>{assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "purge token configured" : "purge token missing"}</span>
                <span>{assetStorage.runtime.trustScanner.tokenConfigured ? "scanner token configured" : "scanner token missing"}</span>
                {assetStorage.runtime.s3 && <span>S3 {assetStorage.runtime.s3.bucketConfigured ? "bucket configured" : "bucket missing"} / {assetStorage.runtime.s3.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "endpoint valid" : "endpoint invalid") : "AWS endpoint default"}</span>}
                {assetStorage.runtime.s3?.endpointInsecureInProduction && <span>S3 endpoint insecure in production</span>}
                {assetStorage.runtime.s3?.partialExplicitCredentials && <span>S3 credentials partial</span>}
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets" value={formatNumber(assetStorage.assetCount)} />
              <MetricTile label="Active" value={formatNumber(assetStorage.activeAssetCount)} />
              <MetricTile label="Asset Action" value={assetStorage.operations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Asset Reasons" value={formatNumber(assetStorage.operations.actionReasons.length)} />
              <MetricTile label="Asset Remediations" value={formatNumber(assetStorage.operations.remediationQueue.length)} />
              <MetricTile label="Asset Errors" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Asset Warnings" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Archived" value={formatNumber(assetStorage.lifecycleCounts.archived)} />
              <MetricTile label="Deleted" value={formatNumber(assetStorage.lifecycleCounts.deleted)} />
              <MetricTile label="Used" value={formatStorageBytes(assetStorage.usedBytes)} />
              <MetricTile label="Stored Bytes" value={formatStorageBytes(assetStorage.allBytes)} />
              <MetricTile label="Storage Provider" value={assetStorage.runtime.provider} />
              <MetricTile label="Storage Providers" value={formatNumber(Object.keys(assetStorage.providerCounts).length)} />
              <MetricTile label="S3 Active" value={assetStorage.runtime.s3?.active ? "yes" : "no"} />
              <MetricTile label="S3 Bucket" value={assetStorage.runtime.s3?.bucketConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Endpoint" value={assetStorage.runtime.s3?.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "valid" : "invalid") : "default"} />
              <MetricTile label="S3 Region" value={assetStorage.runtime.s3?.regionConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Path Style" value={assetStorage.runtime.s3?.forcePathStyle ? "yes" : "no"} />
              <MetricTile label="S3 Explicit Creds" value={assetStorage.runtime.s3?.explicitCredentialsConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Credentials" value={assetStorage.runtime.s3?.partialExplicitCredentials ? "partial" : "ready"} />
              <MetricTile label="Campaigns" value={formatNumber(assetStorage.campaigns.length)} />
              <MetricTile label="Asset Campaign Providers" value={formatNumber(assetCampaignProviderSpread)} />
              <MetricTile label="Asset Campaign Lifecycles" value={formatNumber(assetCampaignLifecycleSpread)} />
              <MetricTile label="Largest Asset Samples" value={formatNumber(assetCampaignLargestSampleCount)} />
              <MetricTile label="Quota Enabled" value={assetStorage.runtime.quota.enabled ? "yes" : "no"} />
              <MetricTile label="Quota Risk" value={formatNumber(assetStorage.operations.quota.atRiskCampaigns.length)} />
              <MetricTile label="Quota Risk Bytes" value={formatStorageBytes(assetStorage.operations.quota.atRiskCampaigns.reduce((total, campaign) => total + campaign.usedBytes, 0))} />
              <MetricTile label="Quota Limit" value={assetStorage.runtime.quota.quotaBytes === undefined ? "none" : formatStorageBytes(assetStorage.runtime.quota.quotaBytes)} />
              <MetricTile label="Quota Policy" value={assetStorage.runtime.quota.quotaPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Retention Enabled" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "no" : "yes"} />
              <MetricTile label="Retention Days" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "none" : formatNumber(assetStorage.runtime.lifecycle.retentionDays)} />
              <MetricTile label="Retention Policy" value={assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Migration Target" value={assetStorage.runtime.migrationTargetProvider} />
              <MetricTile label="Migration" value={formatNumber(assetStorage.operations.migrationBacklog.assetCount)} />
              <MetricTile label="Migration Samples" value={formatNumber(assetStorage.operations.migrationBacklog.assets.length)} />
              <MetricTile label="Migration Providers" value={formatNumber(Object.keys(assetStorage.operations.migrationBacklog.providerCounts).length)} />
              <MetricTile label="Migration Bytes" value={formatStorageBytes(assetStorage.operations.migrationBacklog.bytes)} />
              <MetricTile label="Cleanup" value={formatNumber(assetStorage.operations.cleanupBacklog.assetCount)} />
              <MetricTile label="Cleanup Samples" value={formatNumber(assetStorage.operations.cleanupBacklog.assets.length)} />
              <MetricTile label="Cleanup Providers" value={formatNumber(new Set(assetStorage.operations.cleanupBacklog.assets.map((asset) => asset.provider)).size)} />
              <MetricTile label="Cleanup Bytes" value={formatStorageBytes(assetStorage.operations.cleanupBacklog.bytes)} />
              <MetricTile label="Oldest Cleanup" value={formatDurationSeconds(assetStorage.operations.cleanupBacklog.oldestEligibleAgeSeconds)} />
              <MetricTile label="Deleted Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.deletedAssetCount)} />
              <MetricTile label="Expired Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.expiredAssetCount)} />
              <MetricTile label="Cleanup Enabled" value={assetStorage.runtime.cleanup.enabled ? "yes" : "no"} />
              <MetricTile label="Cleanup Running" value={assetStorage.runtime.cleanup.running ? "yes" : "no"} />
              <MetricTile label="Cleanup Interval" value={assetStorage.runtime.cleanup.enabled ? formatDurationSeconds(assetStorage.runtime.cleanup.intervalSeconds) : "manual"} />
              <MetricTile label="Cleanup Grace" value={assetStorage.runtime.cleanup.graceDays === undefined ? "none" : `${formatNumber(assetStorage.runtime.cleanup.graceDays)} d`} />
              <MetricTile label="Cleanup Dry Run" value={assetStorage.runtime.cleanup.dryRun ? "yes" : "no"} />
              <MetricTile label="Cleanup Startup" value={assetStorage.runtime.cleanup.runOnStart ? "yes" : "no"} />
              <MetricTile label="Cleanup Targets" value={`${assetStorage.runtime.cleanup.includeDeleted ? "D" : "-"}${assetStorage.runtime.cleanup.includeExpired ? "E" : "-"}`} />
              <MetricTile label="Cleanup Risk Config" value={formatNumber(assetStorage.runtime.cleanup.riskyConfig.length)} />
              <MetricTile label="Missing Refs" value={formatNumber(assetStorage.operations.hygiene.missingStorageRefs)} />
              <MetricTile label="Unscanned" value={formatNumber(assetStorage.operations.hygiene.unscannedAssets)} />
              <MetricTile label="Trust Warnings" value={formatNumber(assetStorage.operations.hygiene.trustWarningAssets)} />
              <MetricTile label="Trust Warning Samples" value={formatNumber(assetStorage.operations.hygiene.trustWarningSamples.length)} />
              <MetricTile label="Built-in Scanner" value={assetStorage.runtime.trustScanner.builtinEnabled ? "yes" : "no"} />
              <MetricTile label="External Scanner" value={assetStorage.runtime.trustScanner.externalConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Token" value={assetStorage.runtime.trustScanner.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Fail Closed" value={assetStorage.runtime.trustScanner.failClosed ? "yes" : "no"} />
              <MetricTile label="Scanner Timeout" value={formatDuration(assetStorage.runtime.trustScanner.timeoutMs)} />
              <MetricTile label="Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.totalRunCount)} />
              <MetricTile label="Recent Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.recentRuns.length)} />
              <MetricTile label="Latest Maintenance" value={assetStorage.operations.maintenanceOperations.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.latestRunAt) : "none"} />
              <MetricTile label="Maintenance Dry Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.dryRunCount)} />
              <MetricTile label="Maintenance Mutations" value={formatNumber(assetStorage.operations.maintenanceOperations.mutationRunCount)} />
              <MetricTile label="Maintenance Changed" value={formatNumber(assetStorage.operations.maintenanceOperations.changedRunCount)} />
              <MetricTile label="Maintenance Failed" value={formatNumber(assetStorage.operations.maintenanceOperations.failedRunCount)} />
              <MetricTile label="Maintenance Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.assetCount + assetStorage.operations.maintenanceOperations.cleanup.assetCount + assetStorage.operations.maintenanceOperations.quarantine.assetCount)} />
              <MetricTile label="Maintenance Matched" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.matched + assetStorage.operations.maintenanceOperations.cleanup.matched + assetStorage.operations.maintenanceOperations.quarantine.matched)} />
              <MetricTile label="Maintenance Planned" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.planned + assetStorage.operations.maintenanceOperations.cleanup.planned + assetStorage.operations.maintenanceOperations.quarantine.planned)} />
              <MetricTile label="Maintenance Skipped" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.skipped + assetStorage.operations.maintenanceOperations.cleanup.skipped + assetStorage.operations.maintenanceOperations.quarantine.skipped)} />
              <MetricTile label="Maintenance Failed Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.failed + assetStorage.operations.maintenanceOperations.cleanup.failed + assetStorage.operations.maintenanceOperations.quarantine.failed)} />
              <MetricTile label="Migration Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.runCount)} />
              <MetricTile label="Latest Migration" value={assetStorage.operations.maintenanceOperations.migration.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.migration.latestRunAt) : "none"} />
              <MetricTile label="Cleanup Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.cleanup.runCount)} />
              <MetricTile label="Latest Cleanup" value={assetStorage.operations.maintenanceOperations.cleanup.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.cleanup.latestRunAt) : "none"} />
              <MetricTile label="Quarantine Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.quarantine.runCount)} />
              <MetricTile label="Latest Quarantine" value={assetStorage.operations.maintenanceOperations.quarantine.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.quarantine.latestRunAt) : "none"} />
              <MetricTile label="Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.length)} />
              <MetricTile label="Delivery Error Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "error").length)} />
              <MetricTile label="Delivery Warning Notices" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "warning").length)} />
              <MetricTile label="Managed Assets" value={formatNumber(assetStorage.operations.delivery.posture.activeManagedAssetCount)} />
              <MetricTile label="Deliverable" value={formatNumber(assetStorage.operations.delivery.posture.deliverableActiveAssetCount)} />
              <MetricTile label="Deliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.deliverableActiveBytes)} />
              <MetricTile label="Delivery Coverage" value={formatPercent(assetStorage.operations.delivery.posture.deliverableCoverageRate)} />
              <MetricTile label="Deliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.deliverableSamples.length)} />
              <MetricTile label="Undeliverable" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableActiveAssetCount)} />
              <MetricTile label="Undeliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableSamples.length)} />
              <MetricTile label="Undeliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.undeliverableActiveBytes)} />
              <MetricTile label="Expired Active" value={formatNumber(assetStorage.operations.delivery.posture.expiredActiveAssetCount)} />
              <MetricTile label="Delivery Mode" value={assetStorage.runtime.delivery.mode} />
              <MetricTile label="CDN Configured" value={assetStorage.runtime.delivery.cdnConfigured ? "yes" : "no"} />
              <MetricTile label="CDN Eligible" value={formatNumber(assetStorage.operations.delivery.posture.cdnEligibleAssetCount)} />
              <MetricTile label="Signed Eligible" value={formatNumber(assetStorage.operations.delivery.posture.signedUrlEligibleAssetCount)} />
              <MetricTile label="Signing Required" value={assetStorage.runtime.delivery.signingSecretRequired ? "yes" : "no"} />
              <MetricTile label="Signing Secret" value={assetStorage.runtime.delivery.signingSecretConfigured ? "yes" : "no"} />
              <MetricTile label="Public URL" value={assetStorage.runtime.delivery.publicUrlConfigured ? "yes" : "no"} />
              <MetricTile label="Default URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.defaultTtlSeconds)} />
              <MetricTile label="Max URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.maxTtlSeconds)} />
              <MetricTile label="Purge Webhook" value={assetStorage.runtime.delivery.purgeWebhookConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Token" value={assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Timeout" value={formatDuration(assetStorage.runtime.delivery.purgeTimeoutMs)} />
              <MetricTile label="Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.recent.length)} />
              <MetricTile label="Assets Served" value={formatNumber(assetStorage.operations.delivery.runtime.servedCount)} />
              <MetricTile label="Unavailable Assets" value={formatNumber(assetStorage.operations.delivery.runtime.unavailableCount)} />
              <MetricTile label="Unavailable Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.unavailableCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.recentFailures.length)} />
              <MetricTile label="Failure Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.runtime.recentFailures.map((event) => event.campaignId ?? "unknown")).size)} />
              <MetricTile label="Delivery Statuses" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.statusCounts).length)} />
              <MetricTile label="Access Modes" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.accessModeCounts).length)} />
              <MetricTile label="Signed Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.signed)} />
              <MetricTile label="Session Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.session)} />
              <MetricTile label="Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.failureCount)} />
              <MetricTile label="Delivery Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.failureCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Delivery Denied" value={formatNumber(assetStorage.operations.delivery.runtime.deniedCount)} />
              <MetricTile label="Delivery Denied Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.deniedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Missing Bytes" value={formatNumber(assetStorage.operations.delivery.runtime.missingBytesCount)} />
              <MetricTile label="Signing Failures" value={formatNumber(assetStorage.operations.delivery.runtime.signingFailedCount)} />
              <MetricTile label="Signing Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.signingFailedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Served Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.servedBytes)} />
              <MetricTile label="Failed Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.failedBytes)} />
              <MetricTile label="CDN Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Recent Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.recent.length)} />
              <MetricTile label="Recent Purge Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.purgeOperations.recent.map((purge) => purge.campaignId ?? "unknown")).size)} />
              <MetricTile label="Purged" value={formatNumber(assetStorage.operations.delivery.purgeOperations.purgedCount)} />
              <MetricTile label="Purge Success" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 1 : assetStorage.operations.delivery.purgeOperations.purgedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Failures" value={formatNumber(assetStorage.operations.delivery.purgeOperations.failedCount)} />
              <MetricTile label="Purge Failure Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.failedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Not Configured" value={formatNumber(assetStorage.operations.delivery.purgeOperations.notConfiguredCount)} />
              <MetricTile label="Purge Config Gap Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.notConfiguredCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
            </div>
            {assetStorage.operations.quota.enabled && (
              <p className="admin-status">{assetStorage.operations.quota.atRiskCampaigns.length} quota-risk campaigns out of {formatStorageBytes(assetStorage.operations.quota.quotaBytes)}</p>
            )}
            {assetStorage.operations.delivery.warnings.slice(0, 3).map((warning) => (
              <div className="operator-row tool-call-row" key={warning.code}>
                <span>{warning.message}</span>
                <strong>{warning.severity}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.posture.undeliverableSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`undeliverable-asset-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.runtime.recentFailures.slice(0, 3).map((event) => (
              <div className="operator-row tool-call-row" key={`asset-delivery-failure-${event.id}`}>
                <span>{event.assetId ?? "unknown asset"}</span>
                <strong>{event.status} - {event.accessMode} - {event.reason ?? formatDateTime(event.createdAt)}</strong>
              </div>
            ))}
            {assetStorage.operations.hygiene.trustWarningSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`asset-trust-warning-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.highestSeverity} - {asset.findingCodes.join(", ") || "trust finding"} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.maintenanceOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`asset-maintenance-${run.id}`}>
                <span>{run.operation}{run.dryRun ? " dry run" : ""}</span>
                <strong>
                  {formatNumber(run.assetCount)} assets - {run.failed > 0 ? `${formatNumber(run.failed)} failed` : run.changed ? "changed" : "no change"} - {formatDateTime(run.createdAt)}
                </strong>
              </div>
            ))}
            {assetStorage.operations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected{item.bytes !== undefined ? ` - ${formatStorageBytes(item.bytes)}` : ""}</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {assetStorage.operations.quota.atRiskCampaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={campaign.campaignId}>
                <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                <strong>{formatPercent(campaign.usageRatio)} used - {formatStorageBytes(campaign.remainingBytes)} left</strong>
              </div>
            ))}
            {assetStorage.campaigns.slice(0, 3).map((campaign) => {
              const largestAsset = campaign.largestAssets[0];
              return (
                <div className="operator-row tool-call-row" key={`asset-campaign-${campaign.campaignId}`}>
                  <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                  <strong>
                    {formatStorageBytes(campaign.usedBytes)} used across {formatNumber(campaign.assetCount)} assets
                    {largestAsset ? ` - largest ${largestAsset.name} ${formatStorageBytes(largestAsset.sizeBytes)}` : ""}
                  </strong>
                </div>
              );
            })}
            {assetStorage.operations.cleanupBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`cleanup-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)} - eligible {formatDurationSeconds(asset.eligibleAgeSeconds)}</strong>
              </div>
            ))}
            {assetStorage.operations.migrationBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`migration-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.fromProvider} to {asset.toProvider} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.purgeOperations.recent.slice(0, 3).map((purge) => (
              <div className="operator-row tool-call-row" key={`asset-purge-${purge.id}`}>
                <span>{purge.assetId ?? "unknown asset"}</span>
                <strong>{purge.status} - {purge.error ?? purge.reason ?? formatDateTime(purge.createdAt)}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Migrate uploaded asset bytes to the active storage provider" onClick={() => props.onMigrateStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.migrationBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Migrate assets
              </button>
              <button className="ghost-button" title="Delete stored bytes for eligible deleted or expired assets" onClick={() => props.onCleanupStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.cleanupBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Run cleanup
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Asset integrity operations">
        <div className="operator-heading">
          <div className="section-title">Asset Integrity</div>
          <strong>{assetIntegrity?.provider ?? "not loaded"}</strong>
        </div>
        {!assetIntegrity ? (
          <div className="empty-state compact">No asset integrity data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetIntegrity.actionRequired > 0 ? "failed" : "completed"}`}>{assetIntegrity.actionRequired > 0 ? "action required" : "healthy"}</span>
                <strong>{formatNumber(assetIntegrity.actionRequired)} actionable</strong>
              </div>
              <p>{formatNumber(assetIntegrity.verified)} verified - {formatNumber(assetIntegrity.assetCount)} assets scanned</p>
              <div className="admin-meta">
                <span>{assetIntegrity.actionReasons.length > 0 ? assetIntegrity.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetIntegrity.healthy ? "byte checks healthy" : "byte checks need attention"}</span>
                <span>{formatNumber(assetIntegrity.skipped)} skipped</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets Scanned" value={formatNumber(assetIntegrity.assetCount)} />
              <MetricTile label="Integrity Provider" value={assetIntegrity.provider} />
              <MetricTile label="Actionable" value={formatNumber(assetIntegrity.actionRequired)} />
              <MetricTile label="Integrity Healthy" value={assetIntegrity.healthy ? "yes" : "no"} />
              <MetricTile label="Integrity Reasons" value={formatNumber(assetIntegrity.actionReasons.length)} />
              <MetricTile label="Integrity Remediations" value={formatNumber(assetIntegrity.remediationQueue.length)} />
              <MetricTile label="Integrity Errors" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Integrity Warnings" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Integrity Statuses" value={formatNumber(new Set(assetIntegrity.results.map((asset) => asset.status)).size)} />
              <MetricTile label="Integrity Result Rows" value={formatNumber(assetIntegrity.results.filter((asset) => asset.status !== "verified").length)} />
              <MetricTile label="Verified Coverage" value={formatPercent(assetIntegrity.assetCount === 0 ? 1 : assetIntegrity.verified / assetIntegrity.assetCount)} />
              <MetricTile label="Missing" value={formatNumber(assetIntegrity.missing)} />
              <MetricTile label="Mismatched" value={formatNumber(assetIntegrity.mismatched)} />
              <MetricTile label="Cleanup Eligible" value={formatNumber(assetIntegrity.cleanupEligible)} />
              <MetricTile label="Failed Scans" value={formatNumber(assetIntegrity.failed)} />
              <MetricTile label="Verified" value={formatNumber(assetIntegrity.verified)} />
              <MetricTile label="Skipped" value={formatNumber(assetIntegrity.skipped)} />
            </div>
            {assetIntegrity.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-integrity-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Archive active assets whose bytes are missing or mismatched" onClick={() => props.onQuarantineAssetIntegrityFailures().catch(console.error)} disabled={assetIntegrity.missing + assetIntegrity.mismatched === 0}>
                <RefreshCw size={14} /> Archive broken assets
              </button>
            </div>
            {assetIntegrity.results.filter((asset) => asset.status !== "verified").slice(0, 4).map((asset) => (
              <article className="operator-item admin-item" key={asset.assetId}>
                <div className="operator-row">
                  <span className={`status-pill ${asset.status === "skipped" ? "running" : "failed"}`}>{asset.status}</span>
                  <strong>{asset.provider}</strong>
                </div>
                <h3>{asset.name}</h3>
                <p>{asset.reason ?? asset.assetId}</p>
                {(asset.expectedSizeBytes !== undefined || asset.actualSizeBytes !== undefined) && (
                  <div className="admin-meta">
                    <span>expected {formatStorageBytes(asset.expectedSizeBytes)}</span>
                    <span>actual {formatStorageBytes(asset.actualSizeBytes)}</span>
                  </div>
                )}
                <div className="admin-actions">
                  <button className="ghost-button" title="Purge this asset from the configured CDN cache" onClick={() => props.onPurgeAssetCdnCache(asset.assetId, asset.name).catch(console.error)} disabled={!assetStorage?.runtime.delivery.purgeWebhookConfigured}>
                    <RefreshCw size={14} /> Purge CDN
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rendering operations">
        <div className="operator-heading">
          <div className="section-title">Rendering Operations</div>
          <strong>{renderingOperations ? `${renderingOperations.totals.sceneCount} scenes` : "not loaded"}</strong>
        </div>
        {!renderingOperations ? (
          <div className="empty-state compact">No rendering operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.actionRequired ? "failed" : "completed"}`}>{renderingOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(renderingOperations.totals.issueCount)} issues</strong>
              </div>
              <p>{formatNumber(renderingOperations.totals.maxPolygonVertexCount)} / {formatNumber(renderingOperations.budget.maxPolygonVertexBudget)} max polygon vertices - {formatNumber(renderingOperations.totals.terrainWallCount)} terrain walls - {formatNumber(renderingOperations.totals.degenerateWallCount)} degenerate walls</p>
              <div className="admin-meta">
                <span>{renderingOperations.actionReasons.length > 0 ? renderingOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.error)} errors</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.warning)} warnings</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Scenes" value={formatNumber(renderingOperations.totals.sceneCount)} />
              <MetricTile label="Render Campaigns" value={formatNumber(renderingOperations.totals.campaignCount)} />
              <MetricTile label="Render Issues" value={formatNumber(renderingOperations.totals.issueCount)} />
              <MetricTile label="Render Action" value={renderingOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rendering Reasons" value={formatNumber(renderingOperations.actionReasons.length)} />
              <MetricTile label="Rendering Remediations" value={formatNumber(renderingOperations.remediationQueue.length)} />
              <MetricTile label="Rendering Errors" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Rendering Warnings" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Fog" value={formatNumber(renderingOperations.totals.fogRegionCount)} />
              <MetricTile label="Walls" value={formatNumber(renderingOperations.totals.wallCount)} />
              <MetricTile label="Terrain Walls" value={formatNumber(renderingOperations.totals.terrainWallCount)} />
              <MetricTile label="Degenerate Walls" value={formatNumber(renderingOperations.totals.degenerateWallCount)} />
              <MetricTile label="Lights" value={formatNumber(renderingOperations.totals.lightCount)} />
              <MetricTile label="Vision" value={formatNumber(renderingOperations.totals.tokenVisionSourceCount)} />
              <MetricTile label="Render Errors" value={formatNumber(renderingOperations.issueSeverityCounts.error)} />
              <MetricTile label="Render Warnings" value={formatNumber(renderingOperations.issueSeverityCounts.warning)} />
              <MetricTile label="Render Error Rate" value={formatPercent(renderingOperations.totals.issueCount === 0 ? 0 : (renderingOperations.issueSeverityCounts.error ?? 0) / renderingOperations.totals.issueCount)} />
              <MetricTile label="Top Issue Samples" value={formatNumber(renderingOperations.topIssues.length)} />
              <MetricTile label="Issue Codes" value={formatNumber(Object.keys(renderingOperations.issueCodeCounts).length)} />
              <MetricTile label="Vertices" value={formatNumber(renderingOperations.totals.polygonVertexCount)} />
              <MetricTile label="Vertex Budget Limit" value={formatNumber(renderingOperations.budget.totalPolygonVertexBudget)} />
              <MetricTile label="Max Vertex Usage" value={`${formatPercent(renderingOperations.budget.maxPolygonUsageRatio)} used`} />
              <MetricTile label="Vertex Budget" value={`${formatPercent(renderingOperations.budget.totalPolygonUsageRatio)} used`} />
              <MetricTile label="Max Budget Exceeded" value={renderingOperations.budget.maxPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Total Budget Exceeded" value={renderingOperations.budget.totalPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Scenes Flagged" value={formatNumber(renderingOperations.totals.sceneActionRequiredCount)} />
              <MetricTile label="Flagged Scene Samples" value={formatNumber(renderingOperations.scenesRequiringAction.length)} />
              <MetricTile label="Max Budget" value={formatNumber(renderingOperations.budget.scenesExceedingMaxPolygonBudget)} />
              <MetricTile label="Total Budget" value={formatNumber(renderingOperations.budget.scenesExceedingTotalPolygonBudget)} />
              <MetricTile label="Feature Coverage Scenes" value={formatNumber(renderingOperations.featureCoverage.sceneCount)} />
              <MetricTile label="Feature Scenes" value={formatNumber(renderingOperations.featureCoverage.productionFeatureSceneCount)} />
              <MetricTile label="Featureless Scenes" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.productionFeatureSceneCount))} />
              <MetricTile label="Required Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.length)} />
              <MetricTile label="Present Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.filter((feature) => feature.present).length)} />
              <MetricTile label="Missing Features" value={formatNumber(renderingOperations.featureCoverage.missingRequiredFeatureCodes.length)} />
              <MetricTile label="Feature Samples" value={formatNumber(renderingFeatureSampleCount)} />
              <MetricTile label="Coverage Samples" value={formatNumber(renderingCoverageSampleCount)} />
              <MetricTile label="Feature Checklist" value={renderingOperations.featureCoverage.complete ? "complete" : "incomplete"} />
              <MetricTile label="Polygon Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithPolygonFogCount)} />
              <MetricTile label="Polygon Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithPolygonFogCount))} />
              <MetricTile label="Polygon Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} />
              <MetricTile label="Smooth Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithSmoothFogCount)} />
              <MetricTile label="Smooth Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithSmoothFogCount))} />
              <MetricTile label="Smooth Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} />
              <MetricTile label="Colored Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithColoredLightsCount)} />
              <MetricTile label="Colored Light Coverage" value={formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} />
              <MetricTile label="Dimmed Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDimmedLightsCount)} />
              <MetricTile label="Dimmed Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} />
              <MetricTile label="Dual-Zone Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneLightsCount)} />
              <MetricTile label="Dual-Light Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithDualZoneLightsCount))} />
              <MetricTile label="Dual-Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} />
              <MetricTile label="Token Vision Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTokenVisionCount)} />
              <MetricTile label="Token Vision Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithTokenVisionCount))} />
              <MetricTile label="Token Vision Coverage" value={formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} />
              <MetricTile label="Dual-Zone Vision" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneTokenVisionCount)} />
              <MetricTile label="Dual-Zone Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} />
              <MetricTile label="Terrain Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTerrainWallsCount)} />
              <MetricTile label="Terrain Coverage" value={formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} />
              <MetricTile label="Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.totalCount)} />
              <MetricTile label="Recent Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.recent.length)} />
              <MetricTile label="Changed Scenes" value={formatNumber(renderingOperations.authoringOperations.sceneCount)} />
              <MetricTile label="Changed Scene Samples" value={formatNumber(renderingOperations.authoringOperations.scenes.length)} />
              <MetricTile label="Changed Campaigns" value={formatNumber(new Set(renderingOperations.authoringOperations.scenes.map((scene) => scene.campaignId ?? "unknown")).size)} />
              <MetricTile label="Authoring Actions" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actionCounts).length)} />
              <MetricTile label="Authoring Targets" value={formatNumber(Object.keys(renderingOperations.authoringOperations.targetTypeCounts).length)} />
              <MetricTile label="Rendering Authors" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actorUserCounts).length)} />
              <MetricTile label="Fog Changes" value={formatNumber(renderingOperations.authoringOperations.fogOperationCount)} />
              <MetricTile label="Wall Changes" value={formatNumber(renderingOperations.authoringOperations.wallOperationCount)} />
              <MetricTile label="Light Changes" value={formatNumber(renderingOperations.authoringOperations.lightOperationCount)} />
              <MetricTile label="Failed Authoring Action" value={renderingOperations.failedAuthoringOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} />
              <MetricTile label="Recent Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.recentFailures.length)} />
              <MetricTile label="Failed Change Scenes" value={formatNumber(new Set(renderingOperations.failedAuthoringOperations.recentFailures.map((failure) => failure.sceneId ?? "unknown")).size)} />
              <MetricTile label="Failure Actions" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byAction).length)} />
              <MetricTile label="Failure Reasons" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byReason).length)} />
              <MetricTile label="Failure Targets" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byTargetType).length)} />
              <MetricTile label="Stale Issue Scenes" value={formatNumber(renderingOperations.staleIssueOperations.sceneCount)} />
              <MetricTile label="Stale Issue Samples" value={formatNumber(renderingOperations.staleIssueOperations.scenes.length)} />
              <MetricTile label="Stale Issues" value={formatNumber(renderingOperations.staleIssueOperations.issueCount)} />
              <MetricTile label="Stale Issue Action" value={renderingOperations.staleIssueOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Stale Issue Reasons" value={formatNumber(new Set(renderingOperations.staleIssueOperations.scenes.flatMap((scene) => scene.actionReasons)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.featureCoverage.complete ? "completed" : "running"}`}>feature coverage</span>
                <strong>{formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} token vision</strong>
              </div>
              <p>{formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} polygon fog - {formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} smooth fog - {formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} colored lights - {formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} dimmed lights - {formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} dual-zone lights - {formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} dual-zone vision - {formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} terrain walls</p>
              <div className="admin-meta">
                {renderingOperations.featureCoverage.missingRequiredFeatureCodes.length > 0 ? <span>missing {renderingOperations.featureCoverage.missingRequiredFeatureCodes.join(", ")}</span> : <span>all production features evidenced</span>}
              </div>
            </article>
            {renderingOperations.featureCoverage.requiredFeatures.map((feature) => {
              const sample = feature.samples[0];
              return (
                <article className="operator-item admin-item" key={`rendering-feature-${feature.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${feature.present ? "completed" : "running"}`}>{feature.present ? "present" : "missing"}</span>
                    <strong>{feature.label}</strong>
                  </div>
                  <p>{formatNumber(feature.sceneCount)} scenes - {formatPercent(feature.coverageRate)} coverage{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{feature.code}</span>
                    <span>{sample ? `${formatNumber(sample.polygonFogCount)} polygon fog` : "no scene sample"}</span>
                    <span>{sample ? `${formatNumber(sample.smoothFogCount)} smooth fog` : "no smooth sample"}</span>
                    <span>{sample ? `${formatNumber(sample.terrainWallCount)} terrain walls` : "no terrain sample"}</span>
                    <span>{sample ? `${formatNumber(sample.coloredLightCount)} colored lights` : "no colored sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dimmedLightCount)} dimmed lights` : "no dimmed sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneLightCount)} dual-zone lights` : "no dual-zone sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneTokenVisionCount)} dual-zone vision` : "no dual-zone vision sample"}</span>
                    <span>{sample ? `${formatNumber(sample.tokenVisionSourceCount)} token vision` : "no vision sample"}</span>
                  </div>
                </article>
              );
            })}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className="status-pill completed">authoring activity</span>
                <strong>{formatNumber(renderingOperations.authoringOperations.sceneCount)} scenes changed</strong>
              </div>
              <p>{formatNumber(renderingOperations.authoringOperations.fogOperationCount)} fog edits - {formatNumber(renderingOperations.authoringOperations.wallOperationCount)} wall edits - {formatNumber(renderingOperations.authoringOperations.lightOperationCount)} light edits</p>
              <div className="admin-meta">
                {renderingOperations.authoringOperations.recent.slice(0, 4).map((event) => (
                  <span key={event.id}>{event.action} {event.sceneName ?? event.sceneId ?? "unknown scene"}</span>
                ))}
                {renderingOperations.authoringOperations.recent.length === 0 ? <span>no recent rendering edits</span> : null}
              </div>
            </article>
            {renderingOperations.failedAuthoringOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">failed authoring</span>
                  <strong>{formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} failed</strong>
                </div>
                <p>{Object.entries(renderingOperations.failedAuthoringOperations.byReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {renderingOperations.failedAuthoringOperations.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`rendering-authoring-failure-${failure.id}`}>
                <span>{failure.attemptedAction}</span>
                <strong>{failure.sceneName ?? failure.sceneId ?? "unknown scene"} - {failure.reason}</strong>
              </div>
            ))}
            {Object.entries(renderingOperations.issueCodeCounts)
              .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
              .slice(0, 4)
              .map(([code, count]) => (
                <div className="operator-row tool-call-row" key={code}>
                  <span>{code}</span>
                  <strong>{formatNumber(count)} issues</strong>
                </div>
              ))}
            {renderingOperations.staleIssueOperations.scenes.slice(0, 3).map((scene) => (
              <div className="operator-row tool-call-row" key={`stale-rendering-scene-${scene.sceneId}`}>
                <span>{scene.sceneName}</span>
                <strong>{formatNumber(scene.issueCount)} issues - no recent rendering edits</strong>
              </div>
            ))}
            {renderingOperations.remediationQueue.slice(0, 4).map((item) => {
              const sample = item.sampleScenes[0];
              return (
                <article className="operator-item admin-item" key={`rendering-remediation-${item.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                    <strong>{formatNumber(item.issueCount)} issues</strong>
                  </div>
                  <h3>{item.action}</h3>
                  <p>{formatNumber(item.affectedSceneCount)} scenes affected{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{item.code}</span>
                    <span>{sample?.topTarget ? `${sample.topTarget.targetType}:${sample.topTarget.targetId}` : "no sample target"}</span>
                  </div>
                </article>
              );
            })}
            {renderingOperations.topIssues.slice(0, 4).map((issue) => (
              <div className="operator-row tool-call-row" key={`rendering-issue-${issue.sceneId}-${issue.targetType}-${issue.targetId}-${issue.code}`}>
                <span>{issue.message}</span>
                <strong>{issue.sceneName ?? issue.sceneId ?? "scene"} - {issue.targetType}:{issue.targetId}</strong>
              </div>
            ))}
            {renderingOperations.scenesRequiringAction.slice(0, 3).map((scene) => {
              const firstIssue = scene.topIssues[0];
              return (
                <article className="operator-item admin-item" key={scene.sceneId}>
                  <div className="operator-row">
                    <span>{scene.sceneName}</span>
                    <strong>{formatNumber(scene.counts.issueCount)} issues</strong>
                  </div>
                  <p>{scene.campaignName} - {scene.actionReasons.join(", ")} - {formatPercent(scene.budget.totalPolygonUsageRatio)} vertex budget</p>
                  <div className="admin-meta">
                    <span>{formatNumber(scene.counts.fogRegionCount)} fog regions</span>
                    <span>{formatNumber(scene.counts.lightCount)} lights</span>
                    <span>{formatNumber(scene.counts.polygonVertexCount)} total vertices</span>
                    <span>{formatNumber(scene.counts.maxPolygonVertexCount)} max polygon vertices</span>
                    <span>{formatNumber(scene.counts.terrainWallCount)} terrain walls</span>
                    <span>{formatNumber(scene.counts.degenerateWallCount)} degenerate walls</span>
                    <span>{scene.topIssueCodes.length > 0 ? scene.topIssueCodes.map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") : "no issue codes"}</span>
                    <span>{firstIssue ? `${firstIssue.targetType}:${firstIssue.targetId}` : "no issue samples"}</span>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rules operations">
        <div className="operator-heading">
          <div className="section-title">Rules Operations</div>
          <strong>{systemOperations?.productionReadiness.primarySystemId ?? "not loaded"}</strong>
        </div>
        {!systemOperations ? (
          <div className="empty-state compact">No rules operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${systemOperations.actionRequired ? "failed" : "completed"}`}>{systemOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(systemOperations.totals.installedSystemCount)} systems</strong>
              </div>
              <p>{formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} production ready - {formatNumber(systemOperations.productionReadiness.demoSystemCount)} demo runtimes</p>
              <div className="admin-meta">
                <span>{systemOperations.actionReasons.length > 0 ? systemOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} need depth</span>
                <span>{formatNumber(systemOperations.totals.issueCount)} content issues</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Installed Systems" value={formatNumber(systemOperations.totals.installedSystemCount)} />
              <MetricTile label="System Rows" value={formatNumber(systemOperations.systems.length)} />
              <MetricTile label="Production Systems" value={formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} />
              <MetricTile label="Production System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.productionReadySystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Systems" value={formatNumber(systemOperations.productionReadiness.demoSystemCount)} />
              <MetricTile label="Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.demoSystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Rules Action" value={systemOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rules Reasons" value={formatNumber(systemOperations.actionReasons.length)} />
              <MetricTile label="Rules Remediations" value={formatNumber(systemOperations.remediationQueue.length)} />
              <MetricTile label="Rules Critical" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Rules Warnings" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Systems Need Depth" value={formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} />
              <MetricTile label="Depth Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.systemsNeedingProductionDepth.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Active Systems" value={formatNumber(Object.keys(systemOperations.activeSystemCounts).length)} />
              <MetricTile label="Systems With Actors" value={formatNumber(systemOperations.totals.systemsWithActors)} />
              <MetricTile label="Actor System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithActors / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Actor Systems" value={formatNumber(Object.keys(systemOperations.actorSystemCounts).length)} />
              <MetricTile label="Item Systems" value={formatNumber(Object.keys(systemOperations.itemSystemCounts).length)} />
              <MetricTile label="Campaigns" value={formatNumber(systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Actors" value={formatNumber(systemOperations.totals.actorCount)} />
              <MetricTile label="Items" value={formatNumber(systemOperations.totals.itemCount)} />
              <MetricTile label="Non-primary Campaigns" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Non-primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActiveCampaignCount / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Non-primary Actors" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActorCount)} />
              <MetricTile label="Non-primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActorCount / systemOperations.totals.actorCount)} />
              <MetricTile label="Non-primary Items" value={formatNumber(systemOperations.productionReadiness.nonPrimaryItemCount)} />
              <MetricTile label="Non-primary Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryItemCount / systemOperations.totals.itemCount)} />
              <MetricTile label="Rules Activity" value={formatNumber(systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rules Activity" value={formatNumber(systemOperations.activityOperations.recentActivity.length)} />
              <MetricTile label="Recent Rules Activity Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : systemOperations.activityOperations.recentActivity.length / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rule Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Rule Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Rules Rolls" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.roll"])} />
              <MetricTile label="Rules Roll Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Rests" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.rest"])} />
              <MetricTile label="Rules Rest Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Advances" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.advance"])} />
              <MetricTile label="Rules Advance Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Active Rule Systems" value={formatNumber(systemOperations.activityOperations.systemsWithRecentActivity.length)} />
              <MetricTile label="Active Rule System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.activityOperations.systemsWithRecentActivity.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Activity" value={formatNumber(systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Activity" value={formatNumber(systemOperations.activityOperations.recentNonPrimaryActivity.length)} />
              <MetricTile label="Recent Demo Activity Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : systemOperations.activityOperations.recentNonPrimaryActivity.length / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Demo Campaign Rate" value={formatPercent(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Demo Rolls" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"])} />
              <MetricTile label="Demo Roll Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Rests" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"])} />
              <MetricTile label="Demo Rest Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Advances" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"])} />
              <MetricTile label="Demo Advance Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Active Demo Systems" value={formatNumber(Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length)} />
              <MetricTile label="Active Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Systems With Issues" value={formatNumber(systemOperations.totals.systemsWithContentIssues)} />
              <MetricTile label="Content Issue Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithContentIssues / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Readiness Action" value={systemOperations.productionReadiness.actionRequired ? "yes" : "no"} />
              <MetricTile label="Production Gaps" value={formatNumber(productionGapTotal)} />
              <MetricTile label="Production Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : productionGapTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Gap Categories" value={formatNumber(systemOperations.productionGapCounts.length)} />
              <MetricTile label="Promotion Blockers" value={formatNumber(promotionBlockerTotal)} />
              <MetricTile label="Promotion Blocker Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : promotionBlockerTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Critical Blockers" value={formatNumber(criticalPromotionBlockerTotal)} />
              <MetricTile label="Critical Blocker Rate" value={formatPercent(promotionBlockerTotal === 0 ? 0 : criticalPromotionBlockerTotal / promotionBlockerTotal)} />
              <MetricTile label="Primary Capability" value={formatPercent(primaryRulesSystem?.productionCapability.coverageRate ?? 0)} />
              <MetricTile label="Primary Campaigns" value={formatNumber(primaryRulesSystem?.usage.activeCampaignCount)} />
              <MetricTile label="Primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : (primaryRulesSystem?.usage.activeCampaignCount ?? 0) / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Primary Actors" value={formatNumber(primaryRulesSystem?.usage.actorCount)} />
              <MetricTile label="Primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : (primaryRulesSystem?.usage.actorCount ?? 0) / systemOperations.totals.actorCount)} />
              <MetricTile label="Primary System Items" value={formatNumber(primaryRulesSystem?.usage.itemCount)} />
              <MetricTile label="Primary System Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : (primaryRulesSystem?.usage.itemCount ?? 0) / systemOperations.totals.itemCount)} />
              <MetricTile label="Primary Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.supportedCapabilityCount)} />
              <MetricTile label="Primary Capability Total" value={formatNumber(primaryRulesSystem?.productionCapability.capabilityCount)} />
              <MetricTile label="Missing Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.missingCapabilities.length)} />
              <MetricTile label="Missing Capability Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilityCount ?? 0) === 0 ? 0 : primaryRulesSystem!.productionCapability.missingCapabilities.length / primaryRulesSystem!.productionCapability.capabilityCount)} />
              <MetricTile label="Primary Issues" value={formatNumber(primaryRulesSystem?.issues.length)} />
              <MetricTile label="Primary Issue Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.issues.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Gaps" value={formatNumber(primaryRulesSystem?.productionGaps.length)} />
              <MetricTile label="Primary Gap Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.productionGaps.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Capability Rows" value={formatNumber(primaryRulesSystem?.productionCapability.capabilities.length)} />
              <MetricTile label="Capability Evidence" value={formatNumber(primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Capability Evidence Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : primaryRulesCapabilityEvidenceCount / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Compendium" value={formatNumber(primaryRulesSystem?.coverage.compendiumEntryCount)} />
              <MetricTile label="Primary Templates" value={formatNumber(primaryRulesSystem?.coverage.characterTemplateCount)} />
              <MetricTile label="Primary Template Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.characterTemplateCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Conditions" value={formatNumber(primaryRulesSystem?.coverage.conditionEntryCount)} />
              <MetricTile label="Primary Condition Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.conditionEntryCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Actor Types" value={formatNumber(Object.keys(primaryRulesSystem?.usage.actorTypeCounts ?? {}).length)} />
              <MetricTile label="Primary Client Entry" value={primaryRulesSystem?.manifest.hasClientEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Server Entry" value={primaryRulesSystem?.manifest.hasServerEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Actor Schema" value={primaryRulesSystem?.manifest.hasActorSchema ? "yes" : "no"} />
              <MetricTile label="Primary Item Schema" value={primaryRulesSystem?.manifest.hasItemSchema ? "yes" : "no"} />
              <MetricTile label="Primary Manifest Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.manifest.hasClientEntrypoint, primaryRulesSystem.manifest.hasServerEntrypoint, primaryRulesSystem.manifest.hasActorSchema, primaryRulesSystem.manifest.hasItemSchema].filter(Boolean).length / 4 : 0)} />
              <MetricTile label="Primary Permissions" value={formatNumber(primaryRulesSystem?.manifest.permissionCount)} />
              <MetricTile label="Primary Spells" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.spell)} />
              <MetricTile label="Primary Spell Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.spell ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Items" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.item)} />
              <MetricTile label="Primary Item Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.item ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Threats" value={formatNumber(primaryRulesSystem?.coverage.encounterThreatCount)} />
              <MetricTile label="Primary Threat Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.encounterThreatCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Compendium Support" value={primaryRulesSystem?.coverage.supportsCompendium ? "yes" : "no"} />
              <MetricTile label="Origin Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.origins.count)} />
              <MetricTile label="Origin Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.origins.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Monster Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count)} />
              <MetricTile label="Monster Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Purchase Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count)} />
              <MetricTile label="Purchase Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Primary Import" value={primaryRulesSystem?.coverage.supportsCharacterImport ? "yes" : "no"} />
              <MetricTile label="Primary Advancement" value={primaryRulesSystem?.coverage.supportsAdvancement ? "yes" : "no"} />
              <MetricTile label="Primary Rest" value={primaryRulesSystem?.coverage.supportsRest ? "yes" : "no"} />
              <MetricTile label="Primary Origins" value={primaryRulesSystem?.coverage.supportsOrigins ? "yes" : "no"} />
              <MetricTile label="Primary Monsters" value={primaryRulesSystem?.coverage.supportsMonsterCreation ? "yes" : "no"} />
              <MetricTile label="Primary Purchase" value={primaryRulesSystem?.coverage.supportsEquipmentPurchase ? "yes" : "no"} />
              <MetricTile label="Primary Encounters" value={primaryRulesSystem?.coverage.supportsEncounterPlanning ? "yes" : "no"} />
              <MetricTile label="Primary Automation Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.coverage.supportsCharacterImport, primaryRulesSystem.coverage.supportsAdvancement, primaryRulesSystem.coverage.supportsRest, primaryRulesSystem.coverage.supportsOrigins, primaryRulesSystem.coverage.supportsMonsterCreation, primaryRulesSystem.coverage.supportsEquipmentPurchase, primaryRulesSystem.coverage.supportsEncounterPlanning].filter(Boolean).length / 7 : 0)} />
            </div>
            {systemOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`rules-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} systems</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
                <div className="admin-meta">
                  <span>{item.message}</span>
                  <span>{item.samples.map((system) => system.name).join(", ")}</span>
                </div>
              </article>
            ))}
            {systemOperations.productionGapCounts.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.productionGapCounts.slice(0, 4).map((gap) => (
                  <article className="operator-item admin-item" key={gap.code}>
                    <div className="operator-row">
                      <span className="status-pill failed">production gap</span>
                      <strong>{formatNumber(gap.count)} systems</strong>
                    </div>
                    <h3>{gap.code}</h3>
                    <p>{gap.message}</p>
                    <div className="admin-meta">
                      <span>{gap.severity}</span>
                      <span>{gap.remediation}</span>
                      <span>{gap.systems.map((system) => system.name).join(", ")}</span>
                      {gap.systems.map((system) => (
                        <span key={system.id}>
                          {system.id}: {formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.promotionBlockers.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.promotionBlockers.slice(0, 3).map((system) => (
                  <article className="operator-item admin-item" key={`rules-promotion-${system.systemId}`}>
                    <div className="operator-row">
                      <span className={`status-pill ${system.criticalBlockerCount > 0 ? "failed" : "running"}`}>promotion blockers</span>
                      <strong>{formatNumber(system.blockerCount)} blockers</strong>
                    </div>
                    <h3>{system.name}</h3>
                    <p>{system.blockers[0]?.message ?? "Runtime needs production hardening before promotion."}</p>
                    <div className="admin-meta">
                      <span>{system.systemId}</span>
                      <span>{formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items</span>
                      {system.blockers.slice(0, 3).map((blocker) => (
                        <span key={`${system.systemId}-${blocker.code}`}>{blocker.code}: {blocker.remediation}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.activityOperations.recentNonPrimaryActivity.slice(0, 3).map((activity) => (
              <div className="operator-row tool-call-row" key={`rules-activity-${activity.auditLogId}`}>
                <span>{activity.systemName ?? activity.systemId ?? "Unknown system"}</span>
                <strong>{activity.action.replace("system.actor.", "")} - {activity.label ?? activity.restType ?? activity.optionId ?? activity.actorId ?? "activity"} - {formatDateTime(activity.createdAt)}</strong>
              </div>
            ))}
            {systemsNeedingProductionDepth.length > 0 && (
              <div className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">needs production depth</span>
                  <strong>{formatNumber(systemsNeedingProductionDepth.length)} runtimes</strong>
                </div>
                <p>{systemsNeedingProductionDepth.map((system) => system.name).join(", ")}</p>
                <div className="admin-meta">
                  {systemsNeedingProductionDepth.map((system) => (
                    <span key={system.id}>
                      {system.id}: {formatNumber(system.usage.activeCampaignCount)} campaigns, {formatNumber(system.usage.actorCount)} actors, {formatNumber(system.usage.itemCount)} items
                    </span>
                  ))}
                </div>
              </div>
            )}
            {systemOperations.systems.slice(0, 4).map((system) => (
              <article className="operator-item admin-item" key={system.id}>
                <div className="operator-row">
                  <span className={`status-pill ${system.readiness.actionRequired || system.issues.length > 0 ? "failed" : "completed"}`}>{system.readiness.tier}</span>
                  <strong>{formatNumber(system.productionGaps.length)} production gaps</strong>
                </div>
                <h3>{system.name}</h3>
                <p>{formatNumber(system.coverage.characterTemplateCount)} templates - {formatNumber(system.coverage.conditionEntryCount)} conditions - {formatNumber(system.coverage.encounterThreatCount)} threats - {formatPercent(system.productionCapability.coverageRate)} capability</p>
                <div className="admin-meta">
                  <span>{formatNumber(system.usage.activeCampaignCount)} campaigns</span>
                  <span>{formatNumber(system.usage.actorCount)} actors</span>
                  <span>{formatNumber(system.productionCapability.supportedCapabilityCount)} / {formatNumber(system.productionCapability.capabilityCount)} capabilities</span>
                  <span>{system.issues.length > 0 ? system.issues.join(", ") : "manifest/content clear"}</span>
                  <span>{system.productionGaps.length > 0 ? formatAdminList(system.productionGaps, 3) : "production posture clear"}</span>
                  <span>{system.productionCapability.missingCapabilities.length > 0 ? `missing ${formatAdminList(system.productionCapability.missingCapabilities.map((capability) => capability.label), 3)}` : "capability matrix complete"}</span>
                  {system.coverage.capabilityEvidence.origins.samples.length > 0 && <span>origins {formatAdminList(system.coverage.capabilityEvidence.origins.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.monsterCreation.samples.length > 0 && <span>monsters {formatAdminList(system.coverage.capabilityEvidence.monsterCreation.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.equipmentPurchase.samples.length > 0 && <span>purchase {formatAdminList(system.coverage.capabilityEvidence.equipmentPurchase.samples, 2)}</span>}
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin AI operations">
        <div className="operator-heading">
          <div className="section-title">AI Operations</div>
          <strong>{aiOperations?.provider.id ?? "not loaded"}</strong>
        </div>
        {!aiOperations ? (
          <div className="empty-state compact">No AI operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.actionRequired ? "failed" : "completed"}`}>{aiOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{aiOperations.runtime.selectedProvider}</strong>
              </div>
              <p>{aiOperations.provider.label} - active {aiOperations.runtime.activeProvider} - retry budget {aiOperations.runtime.retryAttempts}</p>
              <div className="admin-meta">
                <span>{aiOperations.actionReasons.length > 0 ? aiOperations.actionReasons.join(", ") : "no action reasons"}</span>
                {aiOperations.runtime.codex && <span>{aiOperations.runtime.codex.transport} Codex transport</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.apiKeyConfigured ? "OpenAI key configured" : "OpenAI key missing"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.timeoutMs > 0 ? `timeout ${aiOperations.runtime.openai.timeoutMs}ms` : "timeout disabled"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.baseUrlValid ? `${aiOperations.runtime.openai.baseUrlInsecureInProduction ? "insecure production base" : "base"} ${aiOperations.runtime.openai.baseUrl}` : `invalid base ${aiOperations.runtime.openai.baseUrlIssue ?? aiOperations.runtime.openai.baseUrl}`}</span>}
                <span>{aiOperations.runtime.costRatesComplete ? (aiOperations.runtime.costRatesConfigured.inputTokens ? "cost rates configured" : "cost rates not configured") : "cost rates partial"}</span>
                {aiOperations.runtime.invalidCostConfig.length > 0 && <span>invalid cost config {aiOperations.runtime.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidProviderThresholdConfig.length > 0 && <span>invalid provider thresholds {aiOperations.runtime.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime controls {aiOperations.runtime.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtime.costBudgetUsd !== undefined ? `budget ${formatCost(aiOperations.runtime.costBudgetUsd)}` : "cost budget not configured"}</span>
              </div>
              <div className="button-row">
                <button className="ghost-button" title="Mark stale running AI threads as failed" onClick={() => props.onFailStaleAiThreads().catch(console.error)} disabled={aiOperations.risk.staleRunningThreadCount === 0}>
                  <RefreshCw size={14} /> Fail stale threads
                </button>
                <button className="ghost-button" title="Mark stale started AI tool calls as failed" onClick={() => props.onFailStaleAiToolCalls().catch(console.error)} disabled={aiOperations.risk.staleStartedToolCallCount === 0}>
                  <RefreshCw size={14} /> Fail stale tools
                </button>
                <button className="ghost-button" title="Reject stale pending AI proposals" onClick={() => props.onRejectStaleAiProposals(false).catch(console.error)} disabled={aiOperations.proposalReview.stalePendingCount === 0}>
                  <RefreshCw size={14} /> Reject stale pending
                </button>
                <button className="ghost-button" title="Reject stale approved AI proposals without applying them" onClick={() => props.onRejectStaleAiProposals(true).catch(console.error)} disabled={aiOperations.proposalReview.staleApprovedCount === 0}>
                  <RefreshCw size={14} /> Reject stale approved
                </button>
              </div>
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.runtimePosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.runtimePosture.actionRequired ? "runtime config" : "runtime ready"}</span>
                <strong>{aiOperations.runtimePosture.selectedProvider}</strong>
              </div>
              <p>{aiOperations.runtimePosture.remediation}</p>
              <div className="admin-meta">
                <span>retry budget {formatNumber(aiOperations.runtimePosture.retryAttempts)}</span>
                <span>{aiOperations.runtimePosture.costRatesComplete ? "cost rate posture complete" : "cost rate posture partial"}</span>
                {aiOperations.runtimePosture.invalidCostConfig.length > 0 && <span>invalid cost env {aiOperations.runtimePosture.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidProviderThresholdConfig.length > 0 && <span>invalid threshold env {aiOperations.runtimePosture.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime control env {aiOperations.runtimePosture.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtimePosture.actionReasons.length > 0 ? aiOperations.runtimePosture.actionReasons.join(", ") : "no runtime posture warnings"}</span>
                {aiOperations.runtimePosture.providerMismatch && <span>active provider {aiOperations.runtimePosture.activeProvider}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.timeoutMs > 0 ? `OpenAI timeout ${aiOperations.runtimePosture.openai.timeoutMs}ms` : "OpenAI timeout disabled"}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.modelConfigured ? `OpenAI model ${aiOperations.runtimePosture.openai.model}` : `OpenAI model default ${aiOperations.runtimePosture.openai.model}`}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.baseUrlValid ? `${aiOperations.runtimePosture.openai.baseUrlInsecureInProduction ? "OpenAI base insecure in production" : "OpenAI base"} ${aiOperations.runtimePosture.openai.baseUrl}` : `OpenAI base invalid: ${aiOperations.runtimePosture.openai.baseUrlIssue ?? aiOperations.runtimePosture.openai.baseUrl}`}</span>}
              </div>
            </article>
            <div className="metric-grid">
              <MetricTile label="Selected Provider" value={aiOperations.runtimePosture.selectedProvider} />
              <MetricTile label="Active Provider" value={aiOperations.runtimePosture.activeProvider} />
              <MetricTile label="Retry Budget" value={formatNumber(aiOperations.runtimePosture.retryAttempts)} />
              <MetricTile label="AI Action" value={aiOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="AI Reasons" value={formatNumber(aiOperations.actionReasons.length)} />
              <MetricTile label="AI Remediations" value={formatNumber(aiOperations.remediationQueue.length)} />
              <MetricTile label="AI Errors" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="AI Warnings" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Provider Mismatch" value={aiOperations.runtimePosture.providerMismatch ? "yes" : "no"} />
              <MetricTile label="OpenAI Key" value={aiOperations.runtimePosture.openai?.apiKeyConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Model" value={aiOperations.runtimePosture.openai?.modelConfigured ? "custom" : "default"} />
              <MetricTile label="OpenAI Model Name" value={aiOperations.runtimePosture.openai?.model ?? "n/a"} />
              <MetricTile label="OpenAI Base URL" value={aiOperations.runtimePosture.openai?.baseUrlValid ? "valid" : "invalid"} />
              <MetricTile label="OpenAI Base Secure" value={aiOperations.runtimePosture.openai?.baseUrlInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="OpenAI Timeout" value={aiOperations.runtimePosture.openai ? formatDuration(aiOperations.runtimePosture.openai.timeoutMs) : "n/a"} />
              <MetricTile label="OpenAI Org" value={aiOperations.runtime.openai?.organizationConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Project" value={aiOperations.runtime.openai?.projectConfigured ? "yes" : "no"} />
              <MetricTile label="Codex Adapter" value={aiOperations.runtimePosture.codex?.adapter ?? "n/a"} />
              <MetricTile label="Codex Transport" value={aiOperations.runtimePosture.codex?.transport ?? "n/a"} />
              <MetricTile label="Codex Approval" value={aiOperations.runtimePosture.codex?.approvalMode ?? "n/a"} />
              <MetricTile label="Runtime Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidRuntimeControlConfig.length)} />
              <MetricTile label="Provider Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidProviderThresholdConfig.length)} />
              <MetricTile label="Cost Rates" value={aiOperations.runtimePosture.costRatesComplete ? "complete" : "partial"} />
              <MetricTile label="Input Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.inputTokens ? "yes" : "no"} />
              <MetricTile label="Output Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.outputTokens ? "yes" : "no"} />
              <MetricTile label="Cost Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidCostConfig.length)} />
              <MetricTile label="Threads" value={formatNumber(aiOperations.totals.threadCount)} />
              <MetricTile label="Recent Threads" value={formatNumber(aiOperations.recentThreads.length)} />
              <MetricTile label="Failures" value={formatNumber(aiOperations.totals.failedThreadCount)} />
              <MetricTile label="Retries" value={formatNumber(aiOperations.totals.retryAttempts)} />
              <MetricTile label="Tokens" value={formatNumber(aiOperations.totals.usage.totalTokens)} />
              <MetricTile label="Cost" value={formatCost(aiOperations.totals.usage.estimatedCostUsd)} />
              <MetricTile label="Cost Budget" value={aiOperations.runtime.costBudgetUsd === undefined ? "n/a" : formatCost(aiOperations.runtime.costBudgetUsd)} />
              <MetricTile label="Budget Configured" value={aiOperations.runtime.costBudgetUsd === undefined ? "no" : "yes"} />
              <MetricTile label="Budget left" value={aiOperations.risk.costBudget?.remainingUsd === undefined ? "n/a" : formatCost(aiOperations.risk.costBudget.remainingUsd)} />
              <MetricTile label="Budget Used" value={aiOperations.risk.costBudget?.usageRatio === undefined ? "n/a" : formatPercent(aiOperations.risk.costBudget.usageRatio)} />
              <MetricTile label="Budget Exceeded" value={aiOperations.risk.costBudget?.exceeded ? "yes" : "no"} />
              <MetricTile label="Provider Count" value={formatNumber(aiOperations.providerHealth.length)} />
              <MetricTile label="Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.actionRequired).length)} />
              <MetricTile label="Degraded Provider Rate" value={formatPercent(aiOperations.providerHealth.length === 0 ? 0 : aiOperations.providerHealth.filter((provider) => provider.actionRequired).length / aiOperations.providerHealth.length)} />
              <MetricTile label="Failure-Rate Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.failureRateDegraded).length)} />
              <MetricTile label="P95-Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.p95DurationDegraded).length)} />
              <MetricTile label="Running-Pressure Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.runningThreadPressure).length)} />
              <MetricTile label="Provider Health Reasons" value={formatNumber(new Set(aiOperations.providerHealth.flatMap((provider) => provider.actionReasons)).size)} />
              <MetricTile label="Provider Error Messages" value={formatNumber(aiOperations.providerHealth.reduce((total, provider) => total + provider.recentErrorMessages.length, 0))} />
              <MetricTile label="Provider Error Groups" value={formatNumber(aiOperations.risk.providerErrors.length)} />
              <MetricTile label="Provider Errors" value={formatNumber(aiOperations.risk.providerErrors.reduce((total, error) => total + error.count, 0))} />
              <MetricTile label="Tools" value={formatNumber(aiOperations.totals.toolCallCount)} />
              <MetricTile label="Recent Tools" value={formatNumber(aiOperations.recentToolCalls.length)} />
              <MetricTile label="AI Risk Action" value={aiOperations.risk.actionRequired ? "yes" : "no"} />
              <MetricTile label="Running Threads" value={formatNumber(aiOperations.risk.runningThreadCount)} />
              <MetricTile label="Failed Tool Calls" value={formatNumber(aiOperations.risk.failedToolCallCount)} />
              <MetricTile label="Risk Failed Evals" value={formatNumber(aiOperations.risk.failedEvaluationCount)} />
              <MetricTile label="Failing Tools" value={formatNumber(aiOperations.risk.failedTools.length)} />
              <MetricTile label="Tool Retries" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.retryableCount)} />
              <MetricTile label="Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Non-Retryable Tools" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount)} />
              <MetricTile label="Non-Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Replay Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.length)} />
              <MetricTile label="Replay Dry Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.filter((run) => run.dryRun).length)} />
              <MetricTile label="Recent Replayed Tools" value={formatNumber(aiOperations.replayOperations.recentRetried.length)} />
              <MetricTile label="Replayed Tools" value={formatNumber(aiOperations.replayOperations.replayedToolCallCount)} />
              <MetricTile label="Replay Completed" value={formatNumber(aiOperations.replayOperations.completedReplayCount)} />
              <MetricTile label="Replay Failed" value={formatNumber(aiOperations.replayOperations.failedReplayCount)} />
              <MetricTile label="Replay Failure Rate" value={formatPercent((aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount) === 0 ? 0 : aiOperations.replayOperations.failedReplayCount / (aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount))} />
              <MetricTile label="Replay Action" value={aiOperations.replayOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Latest Replay" value={aiOperations.replayOperations.latestReplayAt ? formatDateTime(aiOperations.replayOperations.latestReplayAt) : "none"} />
              <MetricTile label="Stale Threads" value={formatNumber(aiOperations.risk.staleRunningThreadCount)} />
              <MetricTile label="Stale Tools" value={formatNumber(aiOperations.risk.staleStartedToolCallCount)} />
              <MetricTile label="Thread Completion" value={formatPercent(aiOperations.serviceLevels.threads.completionRate)} />
              <MetricTile label="Thread Fail Rate" value={formatPercent(aiOperations.serviceLevels.threads.failureRate)} />
              <MetricTile label="Tool Fail Rate" value={formatPercent(aiOperations.serviceLevels.tools.failureRate)} />
              <MetricTile label="Eval Coverage" value={formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} />
              <MetricTile label="Eval Thread Scope" value={formatNumber(aiOperations.evaluationCoverage.threadCount)} />
              <MetricTile label="Evaluations" value={formatNumber(aiOperations.evaluations.evaluationCount)} />
              <MetricTile label="Recent Evaluations" value={formatNumber(aiOperations.recentEvaluations.length)} />
              <MetricTile label="Evaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} />
              <MetricTile label="Unevaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} />
              <MetricTile label="Unevaluated Samples" value={formatNumber(aiOperations.evaluationCoverage.recentUnevaluatedThreads.length)} />
              <MetricTile label="Failed Eval Threads" value={formatNumber(aiOperations.evaluationCoverage.failedEvaluationThreadCount)} />
              <MetricTile label="Eval Campaigns" value={formatNumber(aiOperations.evaluationCoverage.campaigns.length)} />
              <MetricTile label="Recurring Failed Checks" value={formatNumber(aiOperations.evaluationCoverage.recurringFailedChecks.length)} />
              <MetricTile label="Eval Pass Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.passRate)} />
              <MetricTile label="Eval Avg Score" value={formatPercent(aiOperations.evaluations.averageScore)} />
              <MetricTile label="Eval Fail Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.failureRate)} />
              <MetricTile label="Passed Evals" value={formatNumber(aiOperations.evaluations.passedEvaluationCount)} />
              <MetricTile label="Failed Evals" value={formatNumber(aiOperations.evaluations.failedEvaluationCount)} />
              <MetricTile label="Failed Eval Checks" value={formatNumber(aiOperations.evaluations.failedChecks.length)} />
              <MetricTile label="Safety Checks" value={formatNumber(aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Safety Coverage" value={formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} />
              <MetricTile label="Safety Eval Runs" value={formatNumber(aiOperations.safetyPosture.evaluationWithSafetyCheckCount)} />
              <MetricTile label="Safety Eval Gaps" value={formatNumber(Math.max(0, aiOperations.safetyPosture.evaluationCount - aiOperations.safetyPosture.evaluationWithSafetyCheckCount))} />
              <MetricTile label="Safety Eval Threads" value={formatNumber(aiOperations.safetyPosture.evaluatedThreadWithSafetyCheckCount)} />
              <MetricTile label="Safety Failures" value={formatNumber(aiOperations.safetyPosture.failedSafetyCheckCount)} />
              <MetricTile label="Safety Failure Rate" value={formatPercent(aiOperations.safetyPosture.safetyCheckCount === 0 ? 0 : aiOperations.safetyPosture.failedSafetyCheckCount / aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Recent Safety Failures" value={formatNumber(aiOperations.safetyPosture.recentFailures.length)} />
              <MetricTile label="Recurring Safety Failures" value={formatNumber(aiOperations.safetyPosture.recurringFailures.length)} />
              <MetricTile label="Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.categoryCounts).length)} />
              <MetricTile label="Failed Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.failedCategoryCounts).length)} />
              <MetricTile label="Safety Action" value={aiOperations.safetyPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Thread P95" value={formatDuration(aiOperations.serviceLevels.threads.durationMs.p95)} />
              <MetricTile label="Tool P95" value={formatDuration(aiOperations.serviceLevels.tools.durationMs.p95)} />
              <MetricTile label="Pending Proposals" value={formatNumber(aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Pending Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.pendingCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Pending Proposals" value={formatNumber(aiOperations.proposalReview.recentPending.length)} />
              <MetricTile label="Total Proposals" value={formatNumber(aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Approved Proposals" value={formatNumber(aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Approved Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Approved Proposals" value={formatNumber(aiOperations.proposalReview.recentApproved.length)} />
              <MetricTile label="Applied Proposals" value={formatNumber(aiOperations.proposalReview.appliedCount)} />
              <MetricTile label="Applied Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.appliedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Applied Proposals" value={formatNumber(aiOperations.proposalReview.recentApplied.length)} />
              <MetricTile label="Rejected Proposals" value={formatNumber(aiOperations.proposalReview.rejectedCount)} />
              <MetricTile label="Rejected Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.rejectedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Rejected Proposals" value={formatNumber(aiOperations.proposalReview.recentRejected.length)} />
              <MetricTile label="Approval Required" value={formatNumber(aiOperations.proposalReview.approvalRequiredCount)} />
              <MetricTile label="Approval Required Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvalRequiredCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Apply Ready" value={formatNumber(aiOperations.proposalReview.applyReadyCount)} />
              <MetricTile label="Apply Ready Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.applyReadyCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Stale Pending" value={formatNumber(aiOperations.proposalReview.stalePendingCount)} />
              <MetricTile label="Stale Pending Rate" value={formatPercent(aiOperations.proposalReview.pendingCount === 0 ? 0 : aiOperations.proposalReview.stalePendingCount / aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Stale Approved" value={formatNumber(aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Approved Rate" value={formatPercent(aiOperations.proposalReview.approvedCount === 0 ? 0 : aiOperations.proposalReview.staleApprovedCount / aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Stale Proposals" value={formatNumber(aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Oldest Pending" value={formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)} />
              <MetricTile label="Oldest Approved" value={formatDuration(aiOperations.proposalReview.oldestApprovedAgeMs)} />
              <MetricTile label="Apply Failures" value={formatNumber(aiOperations.proposalReview.applyFailureCount)} />
              <MetricTile label="Apply Failure Rate" value={formatPercent((aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount) === 0 ? 0 : aiOperations.proposalReview.applyFailureCount / (aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount))} />
              <MetricTile label="Recent Apply Failures" value={formatNumber(aiOperations.proposalReview.recentApplyFailures.length)} />
              <MetricTile label="Tool Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.tool_or_thread)} />
              <MetricTile label="Tool Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.tool_or_thread ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Manual Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.manual)} />
              <MetricTile label="Manual Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.manual ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Scene Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.scene)} />
              <MetricTile label="Scene Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.scene ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Token Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.token)} />
              <MetricTile label="Token Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.token ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Actor Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.actor)} />
              <MetricTile label="Actor Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.actor ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="AI Tools" value={formatNumber(aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Catalog Action" value={aiOperations.toolCatalog.actionRequired ? "yes" : "no"} />
              <MetricTile label="Tool Catalog Reasons" value={formatNumber(aiOperations.toolCatalog.actionReasons.length)} />
              <MetricTile label="Safe Tools" value={formatNumber(aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Safe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.permissionSafeToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Unsafe Tools" value={formatNumber(aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Unsafe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : (aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount) / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Proposal-Gated Tools" value={formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} />
              <MetricTile label="Proposal-Gated Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.proposalGatedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Tools" value={formatNumber(aiOperations.toolCatalog.failClosedToolCount)} />
              <MetricTile label="Fail-Closed Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.failClosedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Gaps" value={formatNumber(Math.max(0, aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.failClosedToolCount))} />
              <MetricTile label="Strict Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Strict Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Loose Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Loose Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Schema Types" value={formatNumber(new Set(aiOperations.toolCatalog.tools.map((tool) => tool.parameterSchemaType)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.toolCatalog.actionRequired ? "failed" : "completed"}`}>{aiOperations.toolCatalog.actionRequired ? "tool review" : "tool policy"}</span>
                <strong>{formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} proposal gated</strong>
              </div>
              <p>{aiOperations.toolCatalog.remediation}</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.toolCatalog.failClosedToolCount)} fail-closed tools</span>
                <span>safe allowlist: {aiOperations.toolCatalog.permissionSafeAllowlist.join(", ")}</span>
              </div>
            </article>
            {aiOperations.toolCatalog.tools.filter((tool) => tool.failClosed || tool.permissionSafe).slice(0, 4).map((tool) => (
              <div className="operator-row tool-call-row" key={`ai-tool-catalog-${tool.name}`}>
                <span>{tool.name}</span>
                <strong>{tool.permissionSafe ? "permission-safe" : tool.failClosed ? "fail-closed" : "proposal-gated"} - {tool.requiredPermissions.join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.safetyPosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.safetyPosture.actionRequired ? "eval failures" : "eval telemetry"}</span>
                <strong>{formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} covered</strong>
              </div>
              <p>{formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} evaluated / {formatNumber(aiOperations.evaluationCoverage.threadCount)} threads - {formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} unevaluated</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.evaluations.evaluationCount)} evaluations</span>
                <span>{formatNumber(aiOperations.evaluations.failedEvaluationCount)} failed</span>
                <span>avg score {formatPercent(aiOperations.evaluations.averageScore)}</span>
                <span>{formatNumber(aiOperations.safetyPosture.safetyCheckCount)} safety checks</span>
                <span>{formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} safety coverage</span>
                <span>{Object.entries(aiOperations.safetyPosture.failedCategoryCounts).map(([category, count]) => `${category} (${formatNumber(count)})`).join(", ") || "no failed safety categories"}</span>
              </div>
            </article>
            {aiOperations.evaluationCoverage.recurringFailedChecks.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-eval-failed-check-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{formatNumber(failure.count)} failed checks</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-eval-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.evaluatedThreadCount)} evaluated / {formatNumber(campaign.threadCount)} threads - {formatNumber(campaign.failedEvaluationCount)} failed evals</strong>
              </div>
            ))}
            {aiOperations.safetyPosture.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-safety-failure-${failure.evaluationId}-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{failure.category ?? "evaluation"} - {failure.evaluationName} - {failure.provider}</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.recentUnevaluatedThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`ai-unevaluated-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "unknown"} - {thread.provider} - {formatDateTime(thread.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`ai-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {aiOperations.proposalReview.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">proposal review</span>
                  <strong>{formatNumber(aiOperations.proposalReview.pendingCount)} pending</strong>
                </div>
                <p>{aiOperations.proposalReview.actionReasons.join(", ")} - oldest pending {formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)}</p>
                <div className="admin-meta">
                  <span>{formatNumber(aiOperations.proposalReview.approvedCount)} approved</span>
                  <span>{formatNumber(aiOperations.proposalReview.appliedCount)} applied</span>
                  <span>stale after {formatDuration(aiOperations.proposalReview.staleReviewThresholdMs)}</span>
                  <span>{Object.entries(aiOperations.proposalReview.entityCounts).slice(0, 3).map(([entity, count]) => `${entity} (${formatNumber(count)})`).join(", ") || "no entities"}</span>
                </div>
              </article>
            )}
            {aiOperations.proposalReview.stalePending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - pending since {formatDateTime(proposal.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.staleApproved.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-approved-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - approved since {formatDateTime(proposal.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplyFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`failed-ai-proposal-apply-${failure.auditLogId}`}>
                <span>{failure.proposalId ?? "proposal apply failed"}</span>
                <strong>{failure.campaignName ?? failure.campaignId ?? "unknown campaign"} - {failure.reason} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.pendingCount)} pending - oldest {formatDuration(campaign.oldestPendingAgeMs)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentPending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - {formatNumber(proposal.changeCount)} changes - {proposal.entities.join(", ") || "no entities"}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentRejected.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`rejected-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - rejected {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplied.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`applied-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - applied {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.campaigns.slice(0, 4).map((campaign) => (
              <article className="operator-item admin-item" key={campaign.campaignId}>
                <div className="operator-row">
                  <span>{campaign.campaignName}</span>
                  <strong>{formatNumber(campaign.threadCount)} threads</strong>
                </div>
                <p>{formatNumber(campaign.failedThreadCount)} failures - {formatNumber(campaign.toolCallCount)} tool calls - {formatDuration(campaign.durationMs)}</p>
              </article>
            ))}
            {aiOperations.providerHealth.slice(0, 4).map((provider) => (
              <article className="operator-item admin-item" key={`provider-health-${provider.provider}`}>
                <div className="operator-row">
                  <span className={`status-pill ${provider.actionRequired ? "failed" : "completed"}`}>{provider.provider}</span>
                  <strong>{formatPercent(provider.failureRate)} fail rate</strong>
                </div>
                <p>{provider.actionReasons.length > 0 ? provider.actionReasons.join(", ") : "healthy"} - {provider.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(provider.threadCount)} threads</span>
                  <span>{formatNumber(provider.providerErrorCount)} provider errors</span>
                  <span>{provider.failureRateDegraded ? `above ${formatPercent(provider.failureRateThreshold)} threshold` : `threshold ${formatPercent(provider.failureRateThreshold)}`}</span>
                  <span>p95 {formatDuration(provider.durationMsSummary.p95)}</span>
                  <span>{provider.p95DurationThresholdMs ? (provider.p95DurationDegraded ? `p95 above ${formatDuration(provider.p95DurationThresholdMs)}` : `p95 threshold ${formatDuration(provider.p95DurationThresholdMs)}`) : "no p95 threshold"}</span>
                  <span>{formatPercent(provider.completionRate)} completion</span>
                  <span>{formatNumber(provider.staleRunningThreadCount)} stale running</span>
                  <span>{provider.runningThreadPressure ? `${formatNumber(provider.runningThreadCount)} running above threshold` : `running threshold ${formatNumber(provider.runningThreadThreshold)}`}</span>
                  <span>{formatCost(provider.usage.estimatedCostUsd)} estimated cost</span>
                  <span>{provider.recentErrorMessages[0] ?? "no recent provider errors"}</span>
                </div>
              </article>
            ))}
            {aiOperations.risk.providerErrors.slice(0, 3).map((error) => (
              <div className="operator-row tool-call-row" key={error.message}>
                <span>{error.message}</span>
                <strong>{formatNumber(error.count)} provider failures{error.recentThreads[0] ? ` - ${error.recentThreads[0].campaignName ?? error.recentThreads[0].campaignId}` : ""}</strong>
              </div>
            ))}
            {aiOperations.risk.providerErrors.flatMap((error) => error.recentThreads.slice(0, 2).map((thread) => ({ error, thread }))).slice(0, 3).map(({ error, thread }) => (
              <div className="operator-row tool-call-row" key={`provider-error-thread-${error.message}-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - {thread.failedAt ? formatDateTime(thread.failedAt) : thread.status} - retries {formatNumber(thread.retryAttempts)}</strong>
              </div>
            ))}
            {aiOperations.risk.failedTools.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={tool.toolName}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.count)} failed - {tool.errors[0]?.error ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.byTool.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={`retry-policy-${tool.toolName}`}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.retryable)} retryable / {formatNumber(tool.nonRetryable)} blocked - {tool.reasons[0]?.reason ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.recentRetryable.slice(0, 5).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`retryable-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.threadTitle ?? toolCall.threadId} - {toolCall.campaignName ?? "unknown"} - {toolCall.retryReason}</strong>
                <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                  <RefreshCw size={14} /> Retry tool
                </button>
              </div>
            ))}
            {aiOperations.replayOperations.recentRetried.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`replayed-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.resultStatus ?? "unknown"}{toolCall.resultError ? ` - ${toolCall.resultError}` : ""} - {toolCall.campaignName ?? "unknown"} - {toolCall.retriedAt ? formatDateTime(toolCall.retriedAt) : "retry time unknown"}</strong>
              </div>
            ))}
            {aiOperations.replayOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`ai-replay-run-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run replay" : "tool replay"}</span>
                <strong>{formatNumber(run.retried)} retried - {formatNumber(run.completed)} completed - {formatNumber(run.failed)} failed - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleRunningThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`stale-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - stale {formatDuration(thread.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleStartedToolCalls.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`stale-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.provider ?? "unknown"} - stale {formatDuration(toolCall.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.recentThreads.slice(0, 5).map((thread) => (
              <div className="operator-row tool-call-row" key={thread.id}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "running"} - {thread.provider} - {formatDuration(thread.durationMs)}</strong>
              </div>
            ))}
            {aiOperations.recentToolCalls.slice(0, 5).map((toolCall) => {
              const retryable = retryableAiToolCallIds.has(toolCall.id);
              const errorCode = aiToolCallErrorCode(toolCall.output);
              return (
                <div className="operator-row tool-call-row" key={toolCall.id}>
                  <span>{toolCall.toolName}</span>
                  <strong>{toolCall.status}{errorCode ? ` - ${errorCode}` : ""} - {toolCall.campaignName ?? "unknown"}</strong>
                  {retryable && (
                    <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                      <RefreshCw size={14} /> Retry tool
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin operations">
        <div className="operator-heading">
          <div className="section-title">Plugin Operations</div>
          <strong>{pluginOperations?.policy.review ?? "not loaded"}</strong>
        </div>
        {!pluginOperations ? (
          <div className="empty-state compact">No plugin operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.actionRequired ? "failed" : "completed"}`}>{pluginOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{pluginOperations.policy.trust}</strong>
              </div>
              <p>{formatNumber(pluginOperations.totals.packageCount)} packages - {formatNumber(pluginOperations.totals.installedGrantCount)} installs</p>
              <div className="admin-meta">
                <span>{pluginOperations.actionReasons.length > 0 ? pluginOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending reviews</span>
                <span>{formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} registries</span>
                <span>core {pluginOperations.compatibilityOperations.coreVersion}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Catalog Plugins" value={formatNumber(pluginOperations.totals.catalogPluginCount)} />
              <MetricTile label="Packages" value={formatNumber(pluginOperations.totals.packageCount)} />
              <MetricTile label="Plugin Review Policy" value={pluginOperations.policy.review} />
              <MetricTile label="Plugin Action" value={pluginOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Plugin Reasons" value={formatNumber(pluginOperations.actionReasons.length)} />
              <MetricTile label="Plugin Remediations" value={formatNumber(pluginOperations.remediationQueue.length)} />
              <MetricTile label="Plugin Errors" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "error").length)} />
              <MetricTile label="Plugin Warnings" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "warning").length)} />
              <MetricTile label="Healthy" value={formatNumber(pluginOperations.totals.healthyInstalledCount)} />
              <MetricTile label="Blocked" value={formatNumber(pluginOperations.totals.blockedInstalledCount)} />
              <MetricTile label="Missing" value={formatNumber(pluginOperations.totals.missingInstalledCount)} />
              <MetricTile label="Drift" value={formatNumber(pluginOperations.totals.permissionDriftCount)} />
              <MetricTile label="Drift Samples" value={formatNumber(pluginOperations.permissionDrift.length)} />
              <MetricTile label="Compat Action" value={pluginOperations.compatibilityOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Core Version" value={pluginOperations.compatibilityOperations.coreVersion} />
              <MetricTile label="Core Drift" value={formatNumber(pluginOperations.totals.incompatibleInstalledCount)} />
              <MetricTile label="Incompat Packages" value={formatNumber(pluginOperations.totals.incompatiblePackageCount)} />
              <MetricTile label="Storage" value={formatNumber(pluginOperations.storage.entryCount)} />
              <MetricTile label="Storage Plugins" value={formatNumber(Object.keys(pluginOperations.storage.byPlugin).length)} />
              <MetricTile label="Storage Campaigns" value={formatNumber(Object.keys(pluginOperations.storage.byCampaign).length)} />
              <MetricTile label="Storage Value Limit" value={formatStorageBytes(pluginOperations.storage.maxValueBytes)} />
              <MetricTile label="Storage Near Limit" value={formatNumber(pluginOperations.storage.nearLimitEntries.length)} />
              <MetricTile label="Storage Near-Limit Rate" value={formatPercent(pluginOperations.storage.entryCount === 0 ? 0 : pluginOperations.storage.nearLimitEntries.length / pluginOperations.storage.entryCount)} />
              <MetricTile label="Largest Storage Entries" value={formatNumber(pluginOperations.storage.largestEntries.length)} />
              <MetricTile label="Near Limit Bytes" value={formatStorageBytes(pluginOperations.storage.nearLimitBytes)} />
              <MetricTile label="Commands" value={formatNumber(pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Commands" value={formatNumber(pluginOperations.commandOperations.recentCommandCount)} />
              <MetricTile label="Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.byPlugin).length)} />
              <MetricTile label="Command Campaigns" value={formatNumber(Object.keys(pluginOperations.commandOperations.byCampaign).length)} />
              <MetricTile label="Command Action" value={pluginOperations.commandOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Command Failures" value={formatNumber(pluginOperations.commandOperations.failedCommandCount)} />
              <MetricTile label="Command Failure Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.failedCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Command Failures" value={formatNumber(pluginOperations.commandOperations.recentFailureCount)} />
              <MetricTile label="Failed Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByPlugin).length)} />
              <MetricTile label="Command Failure Reasons" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByReason).length)} />
              <MetricTile label="Storage Mutations" value={formatNumber(pluginOperations.commandOperations.storageMutatingCommandCount)} />
              <MetricTile label="Storage Mutation Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.storageMutatingCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Storage Ops" value={formatNumber(pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Recent Storage Ops" value={formatNumber(pluginOperations.storageOperations.recentOperations.length)} />
              <MetricTile label="Storage Op Plugins" value={formatNumber(Object.keys(pluginOperations.storageOperations.byPlugin).length)} />
              <MetricTile label="Storage Op Campaigns" value={formatNumber(Object.keys(pluginOperations.storageOperations.byCampaign).length)} />
              <MetricTile label="Direct Storage Sets" value={formatNumber(pluginOperations.storageOperations.directSetCount)} />
              <MetricTile label="Direct Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directSetCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Direct Storage Deletes" value={formatNumber(pluginOperations.storageOperations.directDeleteCount)} />
              <MetricTile label="Direct Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directDeleteCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Command Storage Ops" value={formatNumber(pluginOperations.storageOperations.commandMutationCount)} />
              <MetricTile label="Command Storage Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.commandMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Sets" value={formatNumber(pluginOperations.storageOperations.setMutationCount)} />
              <MetricTile label="Storage Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.setMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Deletes" value={formatNumber(pluginOperations.storageOperations.deleteMutationCount)} />
              <MetricTile label="Storage Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deleteMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Deleted Storage Entries" value={formatNumber(pluginOperations.storageOperations.deletedEntryCount)} />
              <MetricTile label="Deleted Entry Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deletedEntryCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Installs" value={formatNumber(pluginOperations.installOperations.installCount)} />
              <MetricTile label="Recent Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Recent Upgrades" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "upgrade").length)} />
              <MetricTile label="Recent Rollbacks" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "rollback").length)} />
              <MetricTile label="Recent Permission Reviews" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "permission_review").length)} />
              <MetricTile label="Installed Grants" value={formatNumber(pluginOperations.totals.installedGrantCount)} />
              <MetricTile label="Install Campaigns" value={formatNumber(Object.keys(pluginOperations.installOperations.byCampaign).length)} />
              <MetricTile label="Installed Plugins" value={formatNumber(Object.keys(pluginOperations.installOperations.byPlugin).length)} />
              <MetricTile label="Install Sandboxes" value={formatNumber(new Set(pluginOperations.installOperations.recentInstalls.map((install) => install.sandbox ?? "unknown")).size)} />
              <MetricTile label="Install Permission Gaps" value={formatNumber(pluginOperations.installOperations.recentInstalls.reduce((total, install) => total + install.missingPermissionCount, 0))} />
              <MetricTile label="Install Gap Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length)} />
              <MetricTile label="Install Gap Rate" value={formatPercent(pluginOperations.installOperations.recentInstalls.length === 0 ? 0 : pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length / pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Version Changes" value={formatNumber(pluginOperations.installOperations.versionChangeCount)} />
              <MetricTile label="Version Change Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.versionChangeCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Rollbacks" value={formatNumber(pluginOperations.installOperations.rollbackCount)} />
              <MetricTile label="Rollback Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.rollbackCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Permission Reviews" value={formatNumber(pluginOperations.installOperations.permissionReviewCount)} />
              <MetricTile label="Permission Review Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.permissionReviewCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Command Audits" value={formatNumber(pluginOperations.totals.commandAuditCount)} />
              <MetricTile label="Command Audit Coverage" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 1 : pluginOperations.totals.commandAuditCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Install Audits" value={formatNumber(pluginOperations.totals.installAuditCount)} />
              <MetricTile label="Install Audit Coverage" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 1 : pluginOperations.totals.installAuditCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Load Errors" value={formatNumber(pluginOperations.totals.loadErrorCount)} />
              <MetricTile label="Load Error Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.totals.loadErrorCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Load Error Samples" value={formatNumber(pluginOperations.loadErrors.length)} />
              <MetricTile label="Configured Registries" value={formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Synced Packages" value={formatNumber(pluginOperations.registryOperations.syncedPackageCount)} />
              <MetricTile label="Synced Registries" value={formatNumber(Object.keys(pluginOperations.registryOperations.packageCountByRegistry).length)} />
              <MetricTile label="Oldest Registry Sync" value={formatDurationSeconds(pluginOperations.registryOperations.oldestSyncAgeSeconds)} />
              <MetricTile label="Registry Stale Threshold" value={formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)} />
              <MetricTile label="Registry Action" value={pluginOperations.registryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Registry Reasons" value={formatNumber(pluginOperations.registryOperations.actionReasons.length)} />
              <MetricTile label="Review Coverage" value={formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} />
              <MetricTile label="Review Action" value={pluginOperations.reviewOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Review Reasons" value={formatNumber(pluginOperations.reviewOperations.actionReasons.length)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedCount)} />
              <MetricTile label="Approved Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.approvedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedSamples.length)} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginOperations.reviewOperations.pendingCount)} />
              <MetricTile label="Pending Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.pendingCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Pending Review Samples" value={formatNumber(pluginOperations.reviewOperations.pendingSamples.length)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedCount)} />
              <MetricTile label="Rejected Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.rejectedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedSamples.length)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginOperations.reviewOperations.blockedCount)} />
              <MetricTile label="Blocked Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.blockedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Blocked Review Samples" value={formatNumber(pluginOperations.reviewOperations.blockedSamples.length)} />
              <MetricTile label="Oldest Review" value={`${formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} d`} />
              <MetricTile label="Local Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.local)} />
              <MetricTile label="Registry Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.registry)} />
              <MetricTile label="Registry Drift" value={formatNumber(pluginOperations.registryOperations.unconfiguredRegistryPackageCount)} />
              <MetricTile label="Registry Drift Samples" value={formatNumber(pluginOperations.registryOperations.unconfiguredPackages.length)} />
              <MetricTile label="Stale Registries" value={formatNumber(pluginOperations.registryOperations.staleConfiguredRegistryCount)} />
              <MetricTile label="Registry Entries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Valid Registries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} />
              <MetricTile label="Valid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 1 : pluginOperations.registryOperations.runtimeConfig.validConfiguredCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Unsynced Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length)} />
              <MetricTile label="Unsynced Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Failed Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length)} />
              <MetricTile label="Failed Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Registry Imports" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastImported.length, 0))} />
              <MetricTile label="Registry Error Messages" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastErrors.length, 0))} />
              <MetricTile label="Registry Error Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.lastErrors.length > 0).length)} />
              <MetricTile label="Stale Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.staleConfiguredRegistryCount / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Invalid Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} />
              <MetricTile label="Invalid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.invalidUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Insecure Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} />
              <MetricTile label="Insecure Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.insecureUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Registry Config Errors" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} />
              <MetricTile label="Inventory Action" value={pluginOperations.inventoryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Inventory Reasons" value={formatNumber(pluginOperations.inventoryOperations.actionReasons.length)} />
              <MetricTile label="Duplicate Versions" value={formatNumber(pluginOperations.inventoryOperations.duplicateVersionCount)} />
              <MetricTile label="Duplicate Version Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicateVersionCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Duplicate Packages" value={formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} />
              <MetricTile label="Duplicate Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicatePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Trusted Packages" value={formatNumber(pluginOperations.securityPosture.trustedPackageCount)} />
              <MetricTile label="Trusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 1 : pluginOperations.securityPosture.trustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Security Action" value={pluginOperations.securityPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Security Reasons" value={formatNumber(pluginOperations.securityPosture.actionReasons.length)} />
              <MetricTile label="Unsigned" value={formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} />
              <MetricTile label="Unsigned Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.unsignedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Unsigned Samples" value={formatNumber(pluginOperations.securityPosture.unsignedSamples.length)} />
              <MetricTile label="Untrusted" value={formatNumber(pluginOperations.securityPosture.untrustedPackageCount)} />
              <MetricTile label="Untrusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.untrustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Untrusted Samples" value={formatNumber(pluginOperations.securityPosture.untrustedSamples.length)} />
              <MetricTile label="Trust Blocked" value={formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} />
              <MetricTile label="Trust Blocked Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.trustBlockedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Command Packages" value={formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Command Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.commandCapablePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Manifest-Only Packages" value={formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} />
              <MetricTile label="Manifest-Only Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Non-VM Commands" value={formatNumber(pluginOperations.securityPosture.manifestOnlyCommandPackageCount)} />
              <MetricTile label="Non-VM Command Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyCommandPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Non-VM Command Samples" value={formatNumber(pluginOperations.securityPosture.nonVmCommandSamples.length)} />
              <MetricTile label="Trust Policy" value={pluginOperations.securityPosture.runtimeConfig.trustPolicy} />
              <MetricTile label="Trust Keys" value={formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} />
              <MetricTile label="Trust Keys Ready" value={pluginOperations.securityPosture.runtimeConfig.trustKeysConfigured ? "yes" : "no"} />
              <MetricTile label="Unsigned Prod" value={pluginOperations.securityPosture.runtimeConfig.allowUnsignedInProduction ? "yes" : "no"} />
              <MetricTile label="Trusted No Keys" value={pluginOperations.securityPosture.runtimeConfig.trustedModeWithoutKeys ? "yes" : "no"} />
              <MetricTile label="VM Sandbox" value={formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} />
              <MetricTile label="VM Sandbox Coverage" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 1 : pluginOperations.securityPosture.vmSandboxPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Sandbox Gap" value={formatNumber(Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount))} />
              <MetricTile label="Sandbox Gap Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount) / pluginOperations.securityPosture.commandCapablePackageCount)} />
            </div>
            {pluginOperations.registryOperations.actionRequired && (
              <p className="admin-status">{pluginOperations.registryOperations.actionReasons.join(", ")}</p>
            )}
            {(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.insecureUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length > 0) && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">registry config</span>
                  <strong>{formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} valid / {formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} configured</strong>
                </div>
                <p>
                  {pluginOperations.registryOperations.runtimeConfig.invalidUrlConfig.concat(pluginOperations.registryOperations.runtimeConfig.insecureUrlConfig, pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig).join(", ")}
                </p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} invalid URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} production HTTP URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} numeric config errors</span>
                </div>
              </article>
            )}
            {pluginOperations.inventoryOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">inventory hygiene</span>
                  <strong>{formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} duplicate packages</strong>
                </div>
                <p>{pluginOperations.inventoryOperations.actionReasons.join(", ")}</p>
              </article>
            )}
            {pluginOperations.inventoryOperations.duplicateVersions.slice(0, 3).map((duplicate) => (
              <div className="operator-row tool-call-row" key={`plugin-inventory-${duplicate.pluginId}-${duplicate.version}`}>
                <span>{duplicate.name} v{duplicate.version}</span>
                <strong>{formatNumber(duplicate.packageCount)} packages - {duplicate.packageIds.slice(0, 3).join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.securityPosture.actionRequired ? "failed" : "completed"}`}>{pluginOperations.securityPosture.actionRequired ? "security review" : "security posture"}</span>
                <strong>{formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} command packages</strong>
              </div>
              <p>{pluginOperations.securityPosture.remediation}</p>
              <div className="admin-meta">
                <span>{pluginOperations.securityPosture.runtimeConfig.trustPolicy}</span>
                <span>{formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} trust keys</span>
                <span>{formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} VM sandbox</span>
                <span>{formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} manifest-only</span>
                <span>{formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} unsigned</span>
                <span>{formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} trust-blocked</span>
              </div>
            </article>
            {[...pluginOperations.securityPosture.nonVmCommandSamples, ...pluginOperations.securityPosture.untrustedSamples, ...pluginOperations.securityPosture.unsignedSamples].slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`plugin-security-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.sandbox} - {plugin.trustStatus} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.commandOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">command failures</span>
                  <strong>{formatNumber(pluginOperations.commandOperations.failedCommandCount)} failed</strong>
                </div>
                <p>{Object.entries(pluginOperations.commandOperations.failedByReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {pluginOperations.remediationQueue.slice(0, 4).map((remediation) => (
              <article className="operator-item admin-item" key={`plugin-remediation-${remediation.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${remediation.severity === "error" ? "failed" : "running"}`}>{remediation.severity}</span>
                  <strong>{formatNumber(remediation.affectedCount)} affected</strong>
                </div>
                <h3>{remediation.code.replaceAll("_", " ")}</h3>
                <p>{remediation.action}</p>
              </article>
            ))}
            {pluginOperations.reviewOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review queue</span>
                  <strong>{formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} approved</strong>
                </div>
                <h3>{pluginOperations.reviewOperations.actionReasons.join(", ")}</h3>
                <p>{pluginOperations.reviewOperations.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending</span>
                  <span>{formatNumber(pluginOperations.reviewOperations.blockedCount)} blocked</span>
                  <span>oldest {formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} days</span>
                </div>
              </article>
            )}
            {pluginOperations.reviewOperations.pendingSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-pending-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - pending {formatNumber(review.ageDays)} days - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.approvedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-approved-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - approved {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.rejectedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-rejected-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - rejected {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.blockedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-blocked-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.installBlock ?? `${review.status} review`} - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.configured.slice(0, 3).map((registry) => (
              <article className="operator-item admin-item" key={registry.registryUrl}>
                <div className="operator-row">
                  <span className={`status-pill ${registry.status === "failed" ? "failed" : registry.stale ? "running" : registry.status === "synced" ? "completed" : "running"}`}>{registry.stale ? "stale" : registry.status}</span>
                  <strong>{formatNumber(registry.syncedPackageCount)} packages</strong>
                </div>
                <h3>{registryHostLabel(registry.registryUrl)}</h3>
                <p>{registry.lastErrors.length > 0 ? registry.lastErrors.join(", ") : registry.lastSyncAt ? `Last sync ${formatDateTime(registry.lastSyncAt)} - age ${formatDurationSeconds(registry.syncAgeSeconds)}` : "No sync recorded"}</p>
              </article>
            ))}
            {pluginOperations.registryOperations.staleConfiguredRegistries.slice(0, 3).map((registry) => (
              <div className="operator-row tool-call-row" key={`plugin-registry-stale-${registry.registryUrl}`}>
                <span>{registryHostLabel(registry.registryUrl)}</span>
                <strong>stale {formatDurationSeconds(registry.syncAgeSeconds)} - threshold {formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.unconfiguredPackages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`${plugin.registryUrl}-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{registryHostLabel(plugin.registryUrl)} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.packages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={plugin.packageId}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.compatibleCore} - {plugin.sourceType}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.installed.slice(0, 3).map((grant) => (
              <div className="operator-row tool-call-row" key={`${grant.campaignId}-${grant.pluginId}`}>
                <span>{grant.pluginId}</span>
                <strong>{campaignName(props.campaigns, grant.campaignId)} - {grant.installedVersion ?? "unknown version"}</strong>
              </div>
            ))}
            {pluginOperations.permissionDrift.slice(0, 3).map((drift) => (
              <div className="operator-row tool-call-row" key={`${drift.campaignId}-${drift.pluginId}-permission-drift`}>
                <span>{drift.name}</span>
                <strong>{campaignName(props.campaigns, drift.campaignId)} - missing {drift.missingPermissions.slice(0, 2).join(", ")}</strong>
              </div>
            ))}
            {pluginOperations.storage.nearLimitEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-near-limit-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{campaignName(props.campaigns, entry.campaignId)} - {formatStorageBytes(entry.sizeBytes)} / {formatStorageBytes(pluginOperations.storage.maxValueBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storage.largestEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-largest-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{entry.updatedByType} - {formatStorageBytes(entry.sizeBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storageOperations.recentOperations.slice(0, 5).map((operation) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-operation-${operation.id}`}>
                <span>{operation.pluginId ?? "unknown plugin"} {operation.key ?? operation.operation.replace("_", " ")}</span>
                <strong>
                  {operation.campaignId ? campaignName(props.campaigns, operation.campaignId) : "unknown campaign"} - {formatNumber(operation.setCount)} set / {formatNumber(operation.deleteCount)} deleted
                  {typeof operation.sizeBytes === "number" ? ` - ${formatStorageBytes(operation.sizeBytes)}` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.recentCommands.slice(0, 5).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>
                  {command.campaignId ? campaignName(props.campaigns, command.campaignId) : "unknown campaign"} - {formatDateTime(command.createdAt)}
                  {(command.storageMutation.set > 0 || command.storageMutation.deleted > 0) ? ` - storage ${formatNumber(command.storageMutation.set)} set / ${formatNumber(command.storageMutation.deleted)} deleted` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.installOperations.recentInstalls.slice(0, 5).map((install) => (
              <div className="operator-row tool-call-row" key={`plugin-install-${install.id}`}>
                <span>{install.pluginId ?? install.packageId ?? "unknown plugin"} {install.operation.replace("_", " ")}</span>
                <strong>
                  {install.campaignId ? campaignName(props.campaigns, install.campaignId) : "unknown campaign"} - v{install.version ?? "unknown"} - {formatNumber(install.grantedPermissionCount)} / {formatNumber(install.requestedPermissionCount)} permissions
                </strong>
              </div>
            ))}
            {pluginOperations.commandOperations.recentFailures.slice(0, 3).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-failure-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>{command.reason ?? "failed"} - {command.message ?? "no failure message"}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Sync configured plugin registries" onClick={() => props.onSyncPluginRegistries().catch(console.error)} disabled={pluginOperations.registryOperations.configuredRegistryCount === 0}>
                <RefreshCw size={14} /> Sync registries
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin marketplace reviews">
        <div className="operator-heading">
          <div className="section-title">Plugin Reviews</div>
          <strong>{pluginReviews ? `${pluginReviews.totals.pending} pending` : "not loaded"}</strong>
        </div>
        {!pluginReviews ? (
          <div className="empty-state compact">No plugin review data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span>Policy</span>
                <strong>{pluginReviews.policy.mode}</strong>
              </div>
              <div className="admin-meta">
                <span>{pluginReviews.totals.approved} approved</span>
                <span>{pluginReviews.totals.rejected} rejected</span>
                <span>{pluginReviews.totals.blocked} blocked</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Review Packages" value={formatNumber(pluginReviews.plugins.length)} />
              <MetricTile label="Review Policy" value={pluginReviews.policy.mode} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginReviews.totals.pending)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginReviews.totals.approved)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginReviews.totals.rejected)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginReviews.totals.blocked)} />
              <MetricTile label="Review Sources" value={formatNumber(pluginReviewSourceCount)} />
              <MetricTile label="Review Trust States" value={formatNumber(pluginReviewTrustStatusCount)} />
              <MetricTile label="Installable Reviews" value={formatNumber(pluginReviews.plugins.filter((review) => review.installable).length)} />
              <MetricTile label="Blocked Installs" value={formatNumber(pluginReviews.plugins.filter((review) => review.installBlock).length)} />
            </div>
            {pluginReviews.plugins.length === 0 ? (
              <div className="empty-state compact">No plugin packages found.</div>
            ) : (
              pluginReviews.plugins.slice(0, 8).map((review) => (
                <article className="operator-item admin-item" key={review.review.reviewKey}>
                  <div className="operator-row">
                    <span className={`status-pill ${review.review.status === "approved" ? "completed" : review.review.status === "rejected" ? "failed" : "running"}`}>{review.review.status}</span>
                    <strong>{review.source.type} - {review.trust.status}</strong>
                  </div>
                  <h3>{review.plugin.name} v{review.plugin.version}</h3>
                  <p>{review.source.packageId} - {review.review.checksum.slice(0, 19)}</p>
                  <div className="admin-meta">
                    <span>{review.plugin.permissions.length} permissions</span>
                    <span>{review.distribution.availableVersions.length} versions</span>
                    <span>{review.installable ? "installable" : "blocked"}</span>
                  </div>
                  {review.installBlock && <p>{review.installBlock}</p>}
                  <div className="admin-actions">
                    <button className="ghost-button" title="Approve plugin package" onClick={() => props.onUpdatePluginReview(review, "approved").catch(console.error)} disabled={review.review.status === "approved"}>
                      <Check size={14} /> Approve
                    </button>
                    <button className="ghost-button" title="Reject plugin package" onClick={() => props.onUpdatePluginReview(review, "rejected").catch(console.error)} disabled={review.review.status === "rejected"}>
                      <UserX size={14} /> Reject
                    </button>
                    <button className="ghost-button" title="Reset plugin package review" onClick={() => props.onUpdatePluginReview(review, "pending").catch(console.error)} disabled={review.review.status === "pending"}>
                      <RefreshCw size={14} /> Reset
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Active sessions">
        <div className="operator-heading">
          <div className="section-title">Sessions</div>
          <strong>{sessions.length}</strong>
        </div>
        {sessions.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Sessions" value={formatNumber(sessions.length)} />
            <MetricTile label="Session Users" value={formatNumber(new Set(sessions.map((session) => session.user.id)).size)} />
            <MetricTile label="Expiring Soon" value={formatNumber(expiringSoonSessionCount)} />
            <MetricTile label="Oldest Activity" value={oldestSessionLastSeenAt ? formatDateTime(oldestSessionLastSeenAt) : "none"} />
            <MetricTile label="Newest Activity" value={newestSessionLastSeenAt ? formatDateTime(newestSessionLastSeenAt) : "none"} />
          </div>
        )}
        {sessions.length === 0 ? (
          <div className="empty-state compact">No active sessions.</div>
        ) : (
          sessions.slice(0, 8).map((session) => (
            <article className="operator-item admin-item" key={session.id}>
              <div className="operator-row">
                <span>{session.user.displayName}</span>
                <strong>{formatDateTime(session.lastSeenAt)}</strong>
              </div>
              <p>{session.id} - expires {formatDateTime(session.expiresAt)}</p>
              <button className="ghost-button" title="Revoke session" onClick={() => props.onRevokeSession(session).catch(console.error)}>
                <UserX size={14} /> Revoke session
              </button>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Email outbox">
        <div className="operator-heading">
          <div className="section-title">Email Outbox</div>
          <strong>{emails.length}</strong>
        </div>
        {emails.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Emails" value={formatNumber(emails.length)} />
            <MetricTile label="Outbox Statuses" value={formatNumber(new Set(emails.map((email) => email.status)).size)} />
            <MetricTile label="Outbox Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
            <MetricTile label="Loaded Pending" value={formatNumber(emails.filter((email) => email.status === "pending").length)} />
            <MetricTile label="Loaded Failed" value={formatNumber(emails.filter((email) => email.status === "failed").length)} />
            <MetricTile label="Loaded Delivered" value={formatNumber(emails.filter((email) => email.status === "delivered").length)} />
            <MetricTile label="Retryable Total" value={formatNumber(authOperations?.emailOutbox.retryableCount)} />
            <MetricTile label="Newest Email" value={newestEmailCreatedAt ? formatDateTime(newestEmailCreatedAt) : "none"} />
          </div>
        )}
        <div className="admin-actions">
          <button className="ghost-button" title="Retry all pending and failed email webhook deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={!authOperations?.emailOutbox.retryableCount || !authOperations.emailOutbox.webhookConfigured}>
            <RefreshCw size={14} /> Retry all
          </button>
        </div>
        {emails.length === 0 ? (
          <div className="empty-state compact">No queued emails.</div>
        ) : (
          emails.slice(0, 5).map((email) => (
            <article className="operator-item admin-item" key={email.id}>
              <div className="operator-row">
                <span className={`status-pill ${email.status === "failed" ? "failed" : email.status === "delivered" ? "completed" : "running"}`}>{email.status}</span>
                <strong>{email.provider}</strong>
              </div>
              <h3>{email.subject}</h3>
              <p>{email.to} - {formatDateTime(email.createdAt)}</p>
              <div className="admin-actions">
                <button className="ghost-button" title="Retry email webhook delivery" onClick={() => props.onRetryEmail(email).catch(console.error)} disabled={email.status === "delivered" || !authOperations?.emailOutbox.webhookConfigured}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Audit log">
        <div className="operator-heading">
          <div className="section-title">Audit</div>
          <strong>{props.admin?.audit.count ?? 0}</strong>
        </div>
        {props.admin?.audit.summary && (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${props.admin.audit.summary.actionRequired ? "running" : "completed"}`}>{props.admin.audit.summary.truncated ? "limited" : "complete sample"}</span>
                <strong>{formatNumber(props.admin.audit.summary.adminActionCount)} admin actions</strong>
              </div>
              <p>{props.admin.audit.summary.byAction.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no action rollups"}</p>
              <div className="admin-meta">
                <span>{props.admin.audit.summary.byTargetType.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no target rollups"}</span>
                <span>{props.admin.audit.summary.oldestReturnedAt ? `oldest ${formatDateTime(props.admin.audit.summary.oldestReturnedAt)}` : "no oldest timestamp"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Audit Rows" value={formatNumber(props.admin.audit.count)} />
              <MetricTile label="Audit Action" value={props.admin.audit.summary.actionRequired ? "yes" : "no"} />
              <MetricTile label="Audit Truncated" value={props.admin.audit.summary.truncated ? "yes" : "no"} />
              <MetricTile label="Audit Remediations" value={formatNumber(props.admin.audit.summary.remediationQueue.length)} />
              <MetricTile label="Admin Actions" value={formatNumber(props.admin.audit.summary.adminActionCount)} />
              <MetricTile label="Audit Actions" value={formatNumber(props.admin.audit.summary.byAction.length)} />
              <MetricTile label="Audit Targets" value={formatNumber(props.admin.audit.summary.byTargetType.length)} />
              <MetricTile label="Audit Actors" value={formatNumber(props.admin.audit.summary.byActorType.length)} />
              <MetricTile label="Audit Campaigns" value={formatNumber(props.admin.audit.summary.byCampaign.length)} />
              <MetricTile label="Newest Audit" value={props.admin.audit.summary.newestReturnedAt ? formatDateTime(props.admin.audit.summary.newestReturnedAt) : "none"} />
            </div>
          </>
        )}
        <div className="admin-form-grid" aria-label="Audit export filters">
          <label>
            Action
            <input aria-label="Audit action filter" value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} placeholder="admin.storage.backup" />
          </label>
          <label>
            Target
            <input aria-label="Audit target filter" value={auditTargetTypeFilter} onChange={(event) => setAuditTargetTypeFilter(event.target.value)} placeholder="storage_backup" />
          </label>
          <label>
            Actor
            <select aria-label="Audit actor filter" value={auditActorTypeFilter} onChange={(event) => setAuditActorTypeFilter(event.target.value)}>
              <option value="">Any actor</option>
              <option value="user">User</option>
              <option value="system">System</option>
              <option value="plugin">Plugin</option>
            </select>
          </label>
          <label>
            Campaign
            <select aria-label="Audit campaign filter" value={auditCampaignFilter} onChange={(event) => setAuditCampaignFilter(event.target.value)}>
              <option value="">Any campaign</option>
              {props.campaigns.map((campaign) => (
                <option value={campaign.id} key={`audit-filter-${campaign.id}`}>{campaign.name}</option>
              ))}
            </select>
          </label>
          <label>
            Limit
            <input aria-label="Audit export limit" type="number" min="1" max="500" value={auditExportLimit} onChange={(event) => setAuditExportLimit(event.target.value)} />
          </label>
        </div>
        <div className="admin-actions">
          <button className="ghost-button" title="Export redacted audit logs using the selected filters" onClick={() => exportAuditLogs().catch(console.error)}>
            <Download size={14} /> Export Redacted JSON
          </button>
        </div>
        <p className="admin-status">{auditExportStatus}</p>
        {props.admin?.audit.summary.remediationQueue.slice(0, 2).map((item) => (
          <article className="operator-item admin-item" key={`audit-remediation-${item.code}`}>
            <div className="operator-row">
              <span className="status-pill running">{item.severity}</span>
              <strong>{formatNumber(item.affectedCount)} returned</strong>
            </div>
            <h3>{item.code.replaceAll("_", " ")}</h3>
            <p>{item.action}</p>
          </article>
        ))}
        {auditLogs.length === 0 ? (
          <div className="empty-state compact">No audit entries loaded.</div>
        ) : (
          auditLogs.slice(0, 6).map((entry) => (
            <article className="operator-item admin-item" key={entry.id}>
              <div className="operator-row">
                <span>{entry.action}</span>
                <strong>{formatDateTime(entry.createdAt)}</strong>
              </div>
              <p>{entry.actorUserId ?? entry.actorType} - {entry.targetType}{entry.targetId ? `/${entry.targetId}` : ""}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function campaignName(campaigns: Campaign[], campaignId: string): string {
  return campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId;
}

function normalizeAssetFolderPath(value?: string): string {
  return (value ?? "")
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function assetFolderParts(folder: string): string[] {
  return normalizeAssetFolderPath(folder).split("/").filter(Boolean);
}

function assetFolderPathOptions(value?: string): string[] {
  const parts = assetFolderParts(value ?? "");
  return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
}

function assetMatchesFolderFilter(asset: MapAsset, folderFilter: string): boolean {
  if (folderFilter === "all") return true;
  const folder = normalizeAssetFolderPath(asset.folder);
  return folder === folderFilter || folder.startsWith(`${folderFilter}/`);
}

function assetFolderBreadcrumbsFor(folderFilter: string): Array<{ path: string; label: string }> {
  if (folderFilter === "all") return [];
  const parts = assetFolderParts(folderFilter);
  return parts.map((part, index) => ({
    path: parts.slice(0, index + 1).join("/"),
    label: part
  }));
}

function childAssetFolderOptions(folderOptions: string[], currentFolder: string, assets: MapAsset[]): Array<{ path: string; label: string; count: number }> {
  const currentParts = currentFolder === "all" ? [] : assetFolderParts(currentFolder);
  const childPaths = new Map<string, string>();
  for (const folder of folderOptions) {
    const parts = assetFolderParts(folder);
    const isInCurrentFolder = currentParts.every((part, index) => parts[index] === part);
    if (!isInCurrentFolder || parts.length <= currentParts.length) continue;
    const childPath = parts.slice(0, currentParts.length + 1).join("/");
    childPaths.set(childPath, parts[currentParts.length] ?? childPath);
  }
  return [...childPaths.entries()]
    .map(([path, label]) => ({
      path,
      label,
      count: assets.filter((asset) => assetMatchesFolderFilter(asset, path)).length
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function scimMappingLabel(mapping: AdminScimGroupRoleMapping): string {
  return mapping.group?.displayName ?? mapping.groupDisplayName ?? mapping.groupExternalId ?? mapping.groupId ?? "Unmatched SCIM group";
}

function scimMappingIdentity(mapping: AdminScimGroupRoleMapping): string {
  if (mapping.groupId) return `group id ${mapping.groupId}`;
  if (mapping.groupExternalId) return `external id ${mapping.groupExternalId}`;
  return `display name ${mapping.groupDisplayName ?? "unknown"}`;
}

function registryHostLabel(registryUrl: string): string {
  try {
    const url = new URL(registryUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return registryUrl;
  }
}

function aiToolCallErrorCode(output: unknown): string | undefined {
  const error = recordValue(output).error;
  return typeof error === "string" && error.trim() ? error.trim() : undefined;
}

type AiPanelView = "create" | "review" | "memory" | "operations";
type AiIntentId = "encounter" | "map" | "tokenBatch" | "selectedToken" | "recap" | "memory";

function AiPanel(props: { prompt: string; setPrompt(value: string): void; askAi(): void; mapPrompt: string; setMapPrompt(value: string): void; generateMapAsset(): void; tokenPrompt: string; setTokenPrompt(value: string): void; generateTokenAsset(): void; generateSceneTokenAssets(): void; generationJobs: AiGenerationJob[]; selectedSceneName?: string; selectedTokenId?: string; selectedTokenName?: string; tokenOptions: Token[]; selectToken(tokenId: string): void; tokenArtMissingCount: number; tokenArtPendingCount: number; replayAiThread(thread: AiThread): void; retryAiToolCall(toolCall: AiToolCall): void; recapSession(): void; extractMemory(): void; activeSystemName?: string; encounterPlan?: EncounterPlanInfo; planEncounter(): void; proposals: Proposal[]; records: ProposalRecordCollections; memory: AiMemoryFact[]; aiThreads: AiThread[]; aiUsage?: AiUsageSummary; aiToolCalls: AiToolCall[]; approveAndApply(proposal: Proposal): void; rejectProposal(proposal: Proposal): void; approveMemory(fact: AiMemoryFact): void; deleteMemory(fact: AiMemoryFact): void; canDraftEncounter: boolean; canPropose: boolean; canApply: boolean; canPlanEncounter: boolean; canGenerateMap: boolean; canGenerateToken: boolean; canGenerateTokenBatch: boolean }) {
  const [activeView, setActiveView] = useState<AiPanelView>("create");
  const [activeIntent, setActiveIntent] = useState<AiIntentId>("encounter");
  const [proposalStatusFilter, setProposalStatusFilter] = useState<Proposal["status"] | "all">("all");
  const [proposalSearch, setProposalSearch] = useState("");
  const proposalSearchTerm = proposalSearch.trim().toLowerCase();
  const filteredProposals = props.proposals.filter((proposal) => {
    if (proposalStatusFilter !== "all" && proposal.status !== proposalStatusFilter) return false;
    if (!proposalSearchTerm) return true;
    return [proposal.title, proposal.summary, proposal.status, proposal.createdByType, proposal.changesJson.map((change) => `${change.entity} ${change.action}`).join(" ")].some((value) => value.toLowerCase().includes(proposalSearchTerm));
  });
  const orderedProposals = [...filteredProposals].sort((left, right) => proposalStatusSort(left.status) - proposalStatusSort(right.status) || right.updatedAt.localeCompare(left.updatedAt));
  const pendingCount = props.proposals.filter((proposal) => proposal.status === "pending").length;
  const approvedCount = props.proposals.filter((proposal) => proposal.status === "approved").length;
  const appliedCount = props.proposals.filter((proposal) => proposal.status === "applied").length;
  const rejectedCount = props.proposals.filter((proposal) => proposal.status === "rejected").length;
  const reviewCount = pendingCount + approvedCount;
  const memoryPendingCount = props.memory.filter((fact) => !fact.approvedByUserId).length;
  const staleReviewCount = props.proposals.filter((proposal) => (proposal.status === "pending" || proposal.status === "approved") && Date.now() - new Date(proposal.updatedAt).getTime() > 24 * 60 * 60 * 1000).length;
  const failedThreads = props.aiThreads.filter((thread) => thread.status === "failed");
  const retryableToolCalls = props.aiToolCalls.filter((call) => call.status === "failed" && call.retry === undefined && (aiToolCallErrorCode(call.output) === "tool_failed" || aiToolCallErrorCode(call.output) === "stale_tool_call"));
  const failedThreadCount = failedThreads.length;
  const failedToolCount = props.aiToolCalls.filter((call) => call.status === "failed").length;
  const operationsAttentionCount = failedThreadCount + retryableToolCalls.length + staleReviewCount;
  const recentAssetProposals = props.proposals
    .flatMap((proposal) => proposalAssetPreviews(proposal).map((asset) => ({ proposal, asset })))
    .filter(({ proposal }) => proposal.status === "pending" || proposal.status === "approved")
    .sort((left, right) => right.proposal.updatedAt.localeCompare(left.proposal.updatedAt))
    .slice(0, 4);
  const tokenArtStatus = props.tokenArtMissingCount === 0
    ? `${formatNumber(props.tokenArtPendingCount)} pending`
    : `${formatNumber(props.tokenArtMissingCount)} missing${props.tokenArtPendingCount > 0 ? ` / ${formatNumber(props.tokenArtPendingCount)} pending` : ""}`;
  const tokenArtSummaryCount = props.tokenArtMissingCount > 0 ? props.tokenArtMissingCount : props.tokenArtPendingCount;
  const tokenArtSummaryLabel = props.tokenArtMissingCount > 0 ? "missing art" : "pending art";
  const isGeneratingMap = props.generationJobs.some((job) => job.kind === "map");
  const isGeneratingSelectedToken = props.generationJobs.some((job) => job.kind === "token");
  const isGeneratingTokenBatch = props.generationJobs.some((job) => job.kind === "tokenBatch");
  const intentOptions = [
    { id: "encounter", label: "Encounter + Scene", detail: "Draft a reviewable encounter and table setup.", icon: <Swords size={16} />, disabled: !props.canDraftEncounter },
    { id: "map", label: "Generate Map", detail: "Create raster battlemap art for the selected scene.", icon: <MapIcon size={16} />, disabled: !props.canGenerateMap },
    { id: "tokenBatch", label: "Missing Token Art", detail: "Generate art for every scene token missing imagery.", icon: <Boxes size={16} />, disabled: !props.canGenerateTokenBatch },
    { id: "selectedToken", label: "Selected Token Art", detail: "Generate art for the currently selected token.", icon: <ImageIcon size={16} />, disabled: !props.canGenerateToken },
    { id: "recap", label: "Session Recap", detail: "Draft a recap proposal from current session context.", icon: <ScrollText size={16} />, disabled: !props.canPropose },
    { id: "memory", label: "Extract Memory", detail: "Queue campaign memory facts for review.", icon: <FileText size={16} />, disabled: !props.canPropose }
  ] satisfies Array<{ id: AiIntentId; label: string; detail: string; icon: React.ReactNode; disabled: boolean }>;
  const activeIntentOption = intentOptions.find((intent) => intent.id === activeIntent) ?? intentOptions[0]!;
  return (
    <div className="panel-stack ai-workspace">
      <header className="ai-command-header">
        <div>
          <div className="section-title">Permissioned AI</div>
          <h2>AI Workspace</h2>
        </div>
        <div className="ai-status-strip" aria-label="AI status summary">
          <span><strong>{formatNumber(reviewCount)}</strong> review</span>
          <span><strong>{formatNumber(tokenArtSummaryCount)}</strong> {tokenArtSummaryLabel}</span>
          <span><strong>{formatNumber(failedToolCount)}</strong> failed</span>
        </div>
      </header>

      <nav className="ai-view-tabs" aria-label="AI workspace views">
        <button className={`tab ${activeView === "create" ? "active" : ""}`} type="button" onClick={() => setActiveView("create")}>
          <Bot size={14} /> Create
        </button>
        <button className={`tab ${activeView === "review" ? "active" : ""}`} type="button" onClick={() => setActiveView("review")}>
          <Check size={14} /> Review <span className="ai-tab-count">{formatNumber(reviewCount)}</span>
        </button>
        <button className={`tab ${activeView === "memory" ? "active" : ""}`} type="button" onClick={() => setActiveView("memory")}>
          <FileText size={14} /> Memory <span className="ai-tab-count">{formatNumber(memoryPendingCount)}</span>
        </button>
        <button className={`tab ${activeView === "operations" ? "active" : ""}`} type="button" onClick={() => setActiveView("operations")}>
          <Activity size={14} /> Ops <span className="ai-tab-count">{formatNumber(operationsAttentionCount)}</span>
        </button>
      </nav>

      {props.generationJobs.length > 0 && (
        <div className="ai-generation-strip" role="status" aria-live="polite">
          {props.generationJobs.map((job) => (
            <span key={job.id}>
              <RefreshCw size={14} /> {job.label}{job.detail ? `: ${job.detail}` : ""}
            </span>
          ))}
        </div>
      )}

      {activeView === "create" && (
        <section className="ai-view-panel ai-create-workflow" aria-label="AI creation workflow">
          <section className="operator-section ai-intent-panel" aria-label="AI intent selection">
            <div className="operator-heading">
              <div>
                <div className="section-title">Intent</div>
                <p className="account-summary">Choose what Codex should prepare.</p>
              </div>
              <Bot size={16} />
            </div>
            <div className="ai-intent-grid">
              {intentOptions.map((intent) => (
                <button className={activeIntent === intent.id ? "ai-intent-card active" : "ai-intent-card"} disabled={intent.disabled} key={intent.id} type="button" onClick={() => setActiveIntent(intent.id)}>
                  {intent.icon}
                  <span>
                    <strong>{intent.label}</strong>
                    <small>{intent.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="operator-section ai-target-panel" aria-label="AI generation targets">
            <div className="operator-heading">
              <div>
                <div className="section-title">Targets</div>
                <p className="account-summary">{activeIntentOption.label}</p>
              </div>
              <Crosshair size={16} />
            </div>
            <div className="metric-grid">
              <MetricTile label="Scene" value={props.selectedSceneName ?? "No scene"} />
              <MetricTile label="Selected token" value={props.selectedTokenName ?? "No token"} />
              <MetricTile label="Missing art" value={formatNumber(props.tokenArtMissingCount)} />
              <MetricTile label="Pending art" value={formatNumber(props.tokenArtPendingCount)} />
            </div>
            <div className="ai-trust-note">
              <Shield size={15} />
              <span>Generated content is stored as asset/proposal work and does not mutate the campaign until review is applied.</span>
            </div>
          </section>

          <section className="operator-section ai-prompt-card" aria-label="AI encounter tools">
            <div className="operator-heading">
              <div>
                <div className="section-title">Encounter</div>
                <p className="account-summary">Reviewable proposals only</p>
              </div>
              <Bot size={16} />
            </div>
            <label className="ai-field">
              Prompt
              <textarea aria-label="AI prompt" value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
            </label>
            <div className="button-row ai-action-row">
              <button className="primary-button" type="button" onClick={props.askAi} disabled={!props.canDraftEncounter}>
                <Bot size={16} /> Draft Encounter
              </button>
              <button className="ghost-button" type="button" onClick={props.recapSession} disabled={!props.canPropose}>
                <ScrollText size={16} /> Recap Session
              </button>
              <button className="ghost-button" type="button" onClick={props.extractMemory} disabled={!props.canPropose}>
                <FileText size={16} /> Extract Memory
              </button>
            </div>
          </section>

          <section className="operator-section ai-planning-panel" aria-label="AI encounter planning">
            <div className="operator-heading">
              <div>
                <div className="section-title">Planning</div>
                <p className="account-summary">{props.activeSystemName ? `${props.activeSystemName} encounter support` : "No active rules system"}</p>
              </div>
              <Swords size={16} />
            </div>
            <button className="ghost-button wide" type="button" onClick={props.planEncounter} disabled={!props.canPlanEncounter}>
              <Swords size={16} /> Plan Encounter
            </button>
            {props.encounterPlan ? (
              <div className="metric-grid">
                <MetricTile label="Difficulty" value={`${titleCaseLabel(props.encounterPlan.difficulty)} encounter`} />
                <MetricTile label="Threat" value={`${props.encounterPlan.threatBudget}/${props.encounterPlan.partyRating}`} />
              </div>
            ) : (
              <div className="empty-state compact">No encounter plan generated in this session.</div>
            )}
          </section>

          <section className="operator-section ai-assets-panel" aria-label="AI asset generation">
            <div className="operator-heading">
              <div>
                <div className="section-title">Assets</div>
                <p className="account-summary">Map and token art proposals</p>
              </div>
              <ImageIcon size={16} />
            </div>
            {recentAssetProposals.length > 0 && (
              <section className="ai-generated-preview" aria-label="Recently generated asset previews">
                <div className="operator-heading">
                  <div>
                    <div className="section-title">Generated Art</div>
                    <p className="account-summary">Pending review, visible before applying</p>
                  </div>
                  <strong>{formatNumber(recentAssetProposals.length)}</strong>
                </div>
                <div className="ai-generated-preview-grid">
                  {recentAssetProposals.map(({ proposal, asset }) => (
                    <article className="ai-generated-preview-card" key={`${proposal.id}-${asset.id}`}>
                      <ProposalAssetPreview asset={asset} />
                      <div className="ai-generated-preview-meta">
                        <span>{proposal.status}</span>
                        <strong>{proposal.title}</strong>
                      </div>
                      <div className="button-row ai-action-row">
                        <button className="ghost-button" type="button" onClick={() => props.approveAndApply(proposal)} disabled={!props.canApply}>
                          <Check size={15} /> Apply
                        </button>
                        <button className="ghost-button" type="button" onClick={() => props.rejectProposal(proposal)} disabled={!props.canApply}>
                          <X size={15} /> Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <div className="ai-asset-grid">
              <section className="ai-asset-task" aria-label="Map generation">
                <div className="operator-heading">
                  <strong>Map</strong>
                  <span>{props.selectedSceneName ?? "No scene"}</span>
                </div>
                <label className="ai-field">
                  Prompt
                  <textarea aria-label="AI map generation prompt" value={props.mapPrompt} onChange={(event) => props.setMapPrompt(event.target.value)} />
                </label>
                <button className="ghost-button wide" type="button" onClick={props.generateMapAsset} disabled={!props.canGenerateMap}>
                  <MapIcon size={16} /> {isGeneratingMap ? "Generating Map" : "Generate Map"}
                </button>
              </section>

              <section className="ai-asset-task" aria-label="Token art generation">
                <div className="operator-heading">
                  <strong>Token Art</strong>
                  <span>{tokenArtStatus}</span>
                </div>
                <label className="ai-field">
                  Prompt
                  <textarea aria-label="AI token generation prompt" value={props.tokenPrompt} onChange={(event) => props.setTokenPrompt(event.target.value)} />
                </label>
                <label className="ai-field">
                  Target
                  <select aria-label="AI token generation target" value={props.selectedTokenId ?? ""} onChange={(event) => props.selectToken(event.target.value)} disabled={props.tokenOptions.length === 0}>
                    <option value="">No token</option>
                    {props.tokenOptions.map((token) => (
                      <option value={token.id} key={token.id}>
                        {token.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ai-target-row">
                  <span>Selected</span>
                  <strong>{props.selectedTokenName ?? "No token"}</strong>
                </div>
                <div className="button-row ai-action-row">
                  <button className="ghost-button" type="button" onClick={props.generateTokenAsset} disabled={!props.canGenerateToken}>
                    <ImageIcon size={16} /> {isGeneratingSelectedToken ? "Generating Token Art" : "Generate Token Art"}
                  </button>
                  <button className="ghost-button" type="button" onClick={props.generateSceneTokenAssets} disabled={!props.canGenerateTokenBatch}>
                    <Boxes size={16} /> {isGeneratingTokenBatch ? "Generating Missing Art" : "Generate Missing Art"}
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section className="operator-section ai-review-toolbar" aria-label="AI proposal review queue">
            <div className="operator-heading">
              <div>
                <div className="section-title">Review Queue</div>
                <p className="account-summary">Pending and approved proposals</p>
              </div>
              <strong>{formatNumber(reviewCount)}</strong>
            </div>
            <div className="metric-grid">
              <MetricTile label="Pending" value={formatNumber(pendingCount)} />
              <MetricTile label="Approved" value={formatNumber(approvedCount)} />
              <MetricTile label="Applied" value={formatNumber(appliedCount)} />
              <MetricTile label="Rejected" value={formatNumber(rejectedCount)} />
            </div>
            <button className="ghost-button wide" type="button" onClick={() => setActiveView("review")}>
              <Check size={16} /> Open Review
            </button>
          </section>
        </section>
      )}

      {activeView === "review" && (
        <section className="ai-view-panel" aria-label="AI proposal review queue">
          <section className="operator-section ai-review-toolbar">
            <div className="operator-heading">
              <div>
                <div className="section-title">Review Queue</div>
                <p className="account-summary">Apply permission: {props.canApply ? "available" : "missing"}</p>
              </div>
              <strong>{formatNumber(orderedProposals.length)}/{formatNumber(props.proposals.length)}</strong>
            </div>
            <div className="metric-grid">
              <MetricTile label="Pending" value={formatNumber(pendingCount)} />
              <MetricTile label="Approved" value={formatNumber(approvedCount)} />
              <MetricTile label="Applied" value={formatNumber(appliedCount)} />
              <MetricTile label="Rejected" value={formatNumber(rejectedCount)} />
            </div>
            <div className="admin-form-grid">
              <label>
                Status
                <select aria-label="Proposal status filter" value={proposalStatusFilter} onChange={(event) => setProposalStatusFilter(event.target.value as Proposal["status"] | "all")}>
                  <option value="all">All proposals</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Rejected</option>
                  <option value="draft">Draft</option>
                  <option value="reverted">Reverted</option>
                </select>
              </label>
              <label>
                Search
                <input aria-label="Proposal search" value={proposalSearch} onChange={(event) => setProposalSearch(event.target.value)} placeholder="title, summary, entity" />
              </label>
            </div>
          </section>
          <section className="ai-proposal-list" aria-label="Proposal history">
            {orderedProposals.length === 0 ? (
              <div className="empty-state compact">No proposals match the current filters.</div>
            ) : (
              orderedProposals.map((proposal) => (
                <AiProposalReviewCard
                  canApply={props.canApply}
                  key={proposal.id}
                  proposal={proposal}
                  records={props.records}
                  onApply={props.approveAndApply}
                  onReject={props.rejectProposal}
                />
              ))
            )}
          </section>
        </section>
      )}

      {activeView === "memory" && (
        <section className="ai-view-panel ai-memory-list" aria-label="AI memory facts">
          {props.memory.length === 0 ? (
            <div className="empty-state compact">No AI memory facts recorded.</div>
          ) : (
            props.memory.map((fact) => (
              <article className="proposal ai-memory-card" key={fact.id}>
                <span>{fact.approvedByUserId ? "approved memory" : "pending memory"}</span>
                <p>{fact.text}</p>
                <div className="metric-row">
                  <span>Visibility</span>
                  <strong>{fact.visibility}</strong>
                </div>
                <div className="metric-row">
                  <span>Source</span>
                  <strong>{fact.sourceIds.length ? fact.sourceIds.join(", ") : "manual"}</strong>
                </div>
                <div className="metric-row">
                  <span>Approval</span>
                  <strong>{fact.approvedByUserId ?? "pending review"}</strong>
                </div>
                <div className="button-row ai-action-row">
                  {!fact.approvedByUserId && (
                    <button className="ghost-button" type="button" onClick={() => props.approveMemory(fact)} disabled={!props.canApply}>
                      <Check size={15} /> Approve
                    </button>
                  )}
                  <button className="ghost-button" type="button" onClick={() => props.deleteMemory(fact)} disabled={!props.canApply}>
                    <X size={15} /> Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {activeView === "operations" && (
        <section className="ai-view-panel" aria-label="AI operations and recovery">
          {props.canPropose && <AiOperationsPanel summary={props.aiUsage} threads={props.aiThreads} toolCalls={props.aiToolCalls} />}
          <section className="operator-section" aria-label="AI recovery controls">
            <div className="operator-heading">
              <div>
                <div className="section-title">Recovery</div>
                <p className="account-summary">{formatNumber(failedThreadCount)} failed threads, {formatNumber(failedToolCount)} failed tools, {formatNumber(staleReviewCount)} stale reviews</p>
              </div>
              <RotateCcw size={15} />
            </div>
            {failedThreads.length === 0 && retryableToolCalls.length === 0 ? (
              <div className="empty-state compact">No retryable AI failures.</div>
            ) : (
              <div className="operator-list">
                {failedThreads.slice(0, 3).map((thread) => (
                  <div className="operator-row tool-call-row" key={`failed-thread-${thread.id}`}>
                    <span>{thread.title}</span>
                    <strong>{thread.providerError ?? "provider failed"}</strong>
                    <button className="ghost-button" type="button" onClick={() => props.replayAiThread(thread)} disabled={!props.canPropose}>
                      <RotateCcw size={14} /> Replay
                    </button>
                  </div>
                ))}
                {retryableToolCalls.slice(0, 4).map((toolCall) => (
                  <div className="operator-row tool-call-row" key={`retry-tool-${toolCall.id}`}>
                    <span>{toolCall.toolName}</span>
                    <strong>{aiToolCallErrorCode(toolCall.output) ?? "retryable failure"}</strong>
                    <button className="ghost-button" type="button" onClick={() => props.retryAiToolCall(toolCall)} disabled={!props.canPropose}>
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

function AiProposalReviewCard(props: { proposal: Proposal; records: ProposalRecordCollections; canApply: boolean; onApply(proposal: Proposal): void; onReject(proposal: Proposal): void }) {
  const generatedAssets = proposalAssetPreviews(props.proposal);
  return (
    <article className="proposal ai-proposal-card">
      <div className="operator-heading">
        <span>{props.proposal.status}</span>
        <strong>{formatNumber(props.proposal.changesJson.length)} changes</strong>
      </div>
      <h3>{props.proposal.title}</h3>
      {generatedAssets.length > 0 && (
        <div className="ai-proposal-asset-strip" aria-label={`${props.proposal.title} generated asset previews`}>
          {generatedAssets.map((asset) => (
            <ProposalAssetPreview asset={asset} key={asset.id} />
          ))}
        </div>
      )}
      <p>{props.proposal.summary}</p>
      <details className="proposal-detail">
        <summary>Review details</summary>
        <ProposalDiffPreview proposal={props.proposal} records={props.records} />
        <ProposalTimeline proposal={props.proposal} />
      </details>
      {props.proposal.status !== "applied" && props.proposal.status !== "rejected" && (
        <div className="button-row ai-action-row">
          <button className="ghost-button" type="button" onClick={() => props.onApply(props.proposal)} disabled={!props.canApply}>
            <Check size={15} /> Apply
          </button>
          <button className="ghost-button" type="button" onClick={() => props.onReject(props.proposal)} disabled={!props.canApply}>
            <X size={15} /> Reject
          </button>
        </div>
      )}
    </article>
  );
}

function proposalStatusSort(status: Proposal["status"]): number {
  if (status === "pending") return 0;
  if (status === "approved") return 1;
  if (status === "draft") return 2;
  if (status === "applied") return 3;
  if (status === "rejected") return 4;
  return 5;
}

type ProposalTimelineEvent = {
  key: string;
  label: string;
  detail: string;
  at?: string;
  status?: Proposal["status"];
};

function ProposalTimeline(props: { proposal: Proposal }) {
  const events = proposalTimelineEvents(props.proposal);
  return (
    <section className="proposal-timeline" aria-label={`${props.proposal.title} proposal timeline`}>
      <div className="section-title">Review Timeline</div>
      <ol className="proposal-timeline-list">
        {events.map((event) => (
          <li className="proposal-timeline-event" key={event.key}>
            <div>
              <strong>{event.label}</strong>
              <p>{event.detail}</p>
            </div>
            <span className={event.status ? `status-pill ${event.status}` : "proposal-timeline-time"}>{event.at ? formatDateTime(event.at) : event.status ?? "linked"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function proposalTimelineEvents(proposal: Proposal): ProposalTimelineEvent[] {
  const entities = [...new Set(proposal.changesJson.map((change) => change.entity))];
  const changeSummary = `${formatNumber(proposal.changesJson.length)} ${proposal.changesJson.length === 1 ? "change" : "changes"}${entities.length > 0 ? ` across ${entities.join(", ")}` : ""}`;
  if (proposal.history && proposal.history.length > 0) {
    const historyEvents = proposal.history
      .slice()
      .sort((left, right) => left.at.localeCompare(right.at))
      .map((entry, index): ProposalTimelineEvent => ({
        key: `history-${index}-${entry.action}`,
        label: titleCaseLabel(entry.action),
        detail: proposalHistoryDetail(entry, changeSummary),
        at: entry.at,
        status: entry.status
      }));
    if (proposal.sourceId) {
      historyEvents.splice(1, 0, {
        key: "source",
        label: "Linked source",
        detail: `${proposal.createdByType === "ai" ? "AI" : titleCaseLabel(proposal.createdByType)} source ${proposal.sourceId}.`
      });
    }
    historyEvents.push({
      key: "current",
      label: `Current ${proposal.status}`,
      detail: proposalReviewDetail(proposal, changeSummary),
      at: proposal.updatedAt,
      status: proposal.status
    });
    return historyEvents;
  }
  const events: ProposalTimelineEvent[] = [
    {
      key: "created",
      label: "Created",
      detail: `${titleCaseLabel(proposal.createdByType)}${proposal.createdByUserId ? ` by ${proposal.createdByUserId}` : ""} submitted ${changeSummary}.`,
      at: proposal.createdAt
    }
  ];

  if (proposal.sourceId) {
    events.push({
      key: "source",
      label: "Linked source",
      detail: `${proposal.createdByType === "ai" ? "AI" : titleCaseLabel(proposal.createdByType)} source ${proposal.sourceId}.`
    });
  }

  if (proposal.approvedByUserId) {
    events.push({
      key: "approved",
      label: "Approved",
      detail: `Approved by ${proposal.approvedByUserId}${proposal.status === "approved" ? "." : "; exact approval time is superseded by the current status update."}`,
      at: proposal.status === "approved" ? proposal.updatedAt : undefined,
      status: "approved"
    });
  }

  events.push({
    key: "current",
    label: `Current ${proposal.status}`,
    detail: proposalReviewDetail(proposal, changeSummary),
    at: proposal.updatedAt,
    status: proposal.status
  });
  return events;
}

function proposalHistoryDetail(entry: NonNullable<Proposal["history"]>[number], changeSummary: string): string {
  const actor = entry.actorUserId ? `${titleCaseLabel(entry.actorType)} ${entry.actorUserId}` : titleCaseLabel(entry.actorType);
  const transition = entry.previousStatus ? `${entry.previousStatus} to ${entry.status}` : entry.status;
  const note = entry.note ? ` ${entry.note}` : "";
  if (entry.action === "created") return `${actor} created a ${transition} review with ${changeSummary}.${note}`;
  if (entry.action === "applied") return `${actor} applied ${changeSummary} to campaign state.${note}`;
  if (entry.action === "rejected") return `${actor} rejected the proposal from ${transition}; campaign state was unchanged.${note}`;
  return `${actor} moved the proposal from ${transition}.${note}`;
}

function proposalReviewDetail(proposal: Proposal, changeSummary: string): string {
  const lastUpdated = new Date(proposal.updatedAt).getTime();
  const ageHours = Number.isFinite(lastUpdated) ? Math.floor((Date.now() - lastUpdated) / (60 * 60 * 1000)) : 0;
  if ((proposal.status === "pending" || proposal.status === "approved") && ageHours >= 24) {
    return `Needs GM attention; ${changeSummary} waiting for ${formatNumber(Math.floor(ageHours / 24))} days.`;
  }
  if (proposal.status === "applied") return `Applied after review; ${changeSummary} committed to campaign state.`;
  if (proposal.status === "rejected") return `Rejected after review; ${changeSummary} left campaign state unchanged.`;
  if (proposal.status === "approved") return `Approved and waiting to apply; ${changeSummary}.`;
  return `Awaiting review; ${changeSummary}.`;
}

type ProposalChange = Proposal["changesJson"][number];
type ProposalRecordCollections = Pick<Snapshot, "campaigns" | "scenes" | "tokens" | "actors" | "items" | "journals" | "chat" | "encounters" | "combats" | "assets">;
type ProposalComparableRecord = ProposalRecordCollections[keyof ProposalRecordCollections][number];

function ProposalDiffPreview(props: { proposal: Proposal; records: ProposalRecordCollections }) {
  const changes = props.proposal.changesJson;
  return (
    <section className="proposal-diff" aria-label={`${props.proposal.title} review diff`}>
      <div className="section-title">Review Diff</div>
      {changes.length === 0 ? (
        <div className="empty-state compact">No structured changes.</div>
      ) : (
        <div className="proposal-change-list">
          {changes.map((change, index) => (
            <ProposalChangePreview change={change} index={index} key={`${props.proposal.id}-${index}`} records={props.records} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProposalChangePreview(props: { change: ProposalChange; index: number; records: ProposalRecordCollections }) {
  const existing = proposalExistingRecord(props.records, props.change);
  const entries = Object.entries(props.change.data).slice(0, 8);
  const generatedAsset = proposalAssetPreview(props.change);
  return (
    <div className="proposal-change">
      <div className="operator-row">
        <strong>{props.change.entity} {props.change.action}</strong>
        <span>{props.change.id ?? "new record"}</span>
      </div>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{titleCaseLabel(key)}</dt>
            <dd>{formatProposalValue(value)}</dd>
          </div>
        ))}
      </dl>
      {generatedAsset && <ProposalAssetPreview asset={generatedAsset} />}
      {props.change.action !== "create" && (
        <ProposalExistingComparison change={props.change} existing={existing} entries={entries} index={props.index} />
      )}
    </div>
  );
}

function ProposalAssetPreview(props: { asset: MapAsset }) {
  const [deliveryUrl, setDeliveryUrl] = useState<string | undefined>(() => (props.asset.url.startsWith("/api/v1/assets/") ? undefined : assetBlobUrl(props.asset)));
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviewFailed(false);
    if (!props.asset.url.startsWith("/api/v1/assets/")) {
      setDeliveryUrl(assetBlobUrl(props.asset));
      return () => {
        cancelled = true;
      };
    }
    setDeliveryUrl(undefined);
    apiPost<{ url: string; expiresAt: string }>(`/api/v1/assets/${props.asset.id}/delivery-url`, { expiresInSeconds: 300, disposition: "inline" })
      .then((delivery) => {
        if (!cancelled) setDeliveryUrl(delivery.url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewFailed(true);
          setDeliveryUrl(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.asset.id, props.asset.url]);

  return (
    <figure className="proposal-asset-preview">
      {deliveryUrl ? (
        <img src={deliveryUrl} alt={`${props.asset.name} generated asset preview`} onError={() => setPreviewFailed(true)} />
      ) : (
        <div className="proposal-asset-preview-placeholder">{previewFailed ? "Preview unavailable" : "Preparing preview"}</div>
      )}
      <figcaption>{props.asset.name} | {props.asset.mimeType} | {formatNumber(props.asset.sizeBytes)} bytes</figcaption>
    </figure>
  );
}

function proposalAssetPreview(change: ProposalChange): MapAsset | undefined {
  if (change.entity !== "asset" || change.action !== "create") return undefined;
  const data = change.data;
  if (
    typeof data.id !== "string" ||
    typeof data.campaignId !== "string" ||
    typeof data.name !== "string" ||
    typeof data.url !== "string" ||
    typeof data.mimeType !== "string" ||
    typeof data.sizeBytes !== "number" ||
    !isGeneratedAssetPreviewMime(data.mimeType)
  ) {
    return undefined;
  }
  return data as unknown as MapAsset;
}

function proposalAssetPreviews(proposal: Proposal): MapAsset[] {
  return proposal.changesJson.map(proposalAssetPreview).filter((asset): asset is MapAsset => Boolean(asset));
}

function isGeneratedAssetPreviewMime(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

function ProposalExistingComparison(props: { change: ProposalChange; existing?: ProposalComparableRecord; entries: Array<[string, unknown]>; index: number }) {
  if (!props.change.id) return <p className="proposal-comparison-note">No target id supplied for existing-record comparison.</p>;
  if (!props.existing) return <p className="proposal-comparison-note">Existing {props.change.entity} record is not loaded in this campaign snapshot.</p>;
  return (
    <div className="proposal-comparison" aria-label={`${props.change.entity} ${props.index + 1} existing comparison`}>
      <div className="section-title">Existing Comparison</div>
      <dl>
        {props.entries.map(([key, proposed]) => (
          <div key={key}>
            <dt>{titleCaseLabel(key)}</dt>
            <dd>
              <span>Current</span>
              <strong>{formatProposalValue(recordValue(props.existing)[key])}</strong>
            </dd>
            <dd>
              <span>Proposed</span>
              <strong>{formatProposalValue(proposed)}</strong>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function proposalExistingRecord(records: ProposalRecordCollections, change: ProposalChange): ProposalComparableRecord | undefined {
  if (!change.id) return undefined;
  switch (change.entity) {
    case "campaign":
      return records.campaigns.find((item) => item.id === change.id);
    case "scene":
      return records.scenes.find((item) => item.id === change.id);
    case "token":
      return records.tokens.find((item) => item.id === change.id);
    case "actor":
      return records.actors.find((item) => item.id === change.id);
    case "item":
      return records.items.find((item) => item.id === change.id);
    case "journal":
      return records.journals.find((item) => item.id === change.id);
    case "chat":
      return records.chat.find((item) => item.id === change.id);
    case "encounter":
      return records.encounters.find((item) => item.id === change.id);
    case "combat":
      return records.combats.find((item) => item.id === change.id);
    case "asset":
      return records.assets.find((item) => item.id === change.id);
    default:
      return undefined;
  }
}

function formatProposalValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.map(formatProposalValue).join(", ");
  return JSON.stringify(value);
}

function AiOperationsPanel(props: { summary?: AiUsageSummary; threads: AiThread[]; toolCalls: AiToolCall[] }) {
  const summary = props.summary;
  const recentThreads = props.threads.slice(0, 4);
  const recentToolCalls = props.toolCalls.slice(0, 5);
  const usage = summary?.usage;
  return (
    <section className="operator-section" aria-label="AI operations">
      <div className="operator-heading">
        <div className="section-title">Operator Signals</div>
        <Activity size={15} />
      </div>
      <div className="metric-grid">
        <MetricTile label="Threads" value={formatNumber(summary?.threadCount ?? props.threads.length)} />
        <MetricTile label="Failures" value={formatNumber(summary?.failedThreadCount)} />
        <MetricTile label="Retries" value={formatNumber(summary?.retryAttempts)} />
        <MetricTile label="Tokens" value={formatNumber(usage?.totalTokens)} />
        <MetricTile label="Cost" value={formatCost(usage?.estimatedCostUsd)} />
        <MetricTile label="Tools" value={formatNumber(summary?.toolCallCount ?? props.toolCalls.length)} />
      </div>
      {summary && summary.providers.length > 0 && (
        <div className="operator-list">
          {summary.providers.map((provider) => (
            <div className="operator-row" key={provider.provider}>
              <span>{provider.provider}</span>
              <strong>{formatNumber(provider.usage.totalTokens)} tokens</strong>
            </div>
          ))}
        </div>
      )}
      <div className="operator-list">
        <div className="operator-heading">
          <div className="section-title">Recent Threads</div>
          <Timer size={15} />
        </div>
        {recentThreads.length === 0 ? (
          <div className="empty-state compact">No AI threads.</div>
        ) : (
          recentThreads.map((thread) => (
            <article className="operator-item" key={thread.id}>
              <div className="operator-row">
                <span className={`status-pill ${thread.status ?? "running"}`}>{thread.status ?? "running"}</span>
                <strong>{formatDuration(thread.durationMs)}</strong>
              </div>
              <h3>{thread.title}</h3>
              <p>{thread.provider} - {formatTime(thread.startedAt)}</p>
              <div className="operator-row">
                <span>{formatNumber(thread.usage?.totalTokens)} tokens</span>
                <span>{formatCost(thread.usage?.estimatedCostUsd)}</span>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="operator-list">
        <div className="section-title">Tool Calls</div>
        {recentToolCalls.length === 0 ? (
          <div className="empty-state compact">No tool calls.</div>
        ) : (
          recentToolCalls.map((toolCall) => (
            <div className="operator-row tool-call-row" key={toolCall.id}>
              <span>{toolCall.toolName}</span>
              <strong>{toolCall.status} - {formatDuration(toolCall.durationMs)}</strong>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function formatNumber(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatCost(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "n/a";
}

function formatGp(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 gp";
  return `${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)} gp`;
}

function formatCurrency(value?: Record<string, number>): string {
  if (!value) return "0 gp";
  const gp = numericValue(value.gp, 0);
  const sp = numericValue(value.sp, 0);
  const cp = numericValue(value.cp, 0);
  return [`${gp} gp`, sp > 0 ? `${sp} sp` : undefined, cp > 0 ? `${cp} cp` : undefined].filter(Boolean).join(", ");
}

function formatPercent(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "0%";
}

function formatAdminList(values: string[], limit: number): string {
  const shown = values.slice(0, limit);
  const remaining = values.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}

function formatStorageBytes(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 B";
  if (value < 1024) return `${value.toLocaleString()} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatDurationSeconds(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 s";
  return formatDuration(value * 1000);
}

function formatTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SdkPanel(props: { plugins: PluginRuntimeInfo[]; systems: SystemRuntimeInfo[]; characterTemplates: CharacterTemplateInfo[]; actor?: Actor; advancementOptions: AdvancementOptionInfo[]; importedActor?: Actor; createdMonster?: Actor; onSyncPluginRegistries(): void; onInstallPlugin(plugin: PluginRuntimeInfo, version?: string): void; onInstallSystem(system: SystemRuntimeInfo): void; onCreateCharacter(template: CharacterTemplateInfo): void; onImportCharacter(): void; onCreateMonster(): void; onAdvanceActor(optionId?: string): void; onRestActor(restType: "short" | "long", options?: { arcaneRecovery?: Record<string, number> }): void; onRunCommand(plugin: PluginRuntimeInfo, command: string): void; onSystemRoll(): void; canInstall: boolean; canInstallSystem: boolean; canCreateActor: boolean; canImportActor: boolean; canAdvanceActor: boolean; canRestActor: boolean; canRollSystem: boolean }) {
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginSourceFilter, setPluginSourceFilter] = useState<"all" | "local" | "registry">("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<"all" | "installed" | "available" | "upgrade">("all");
  const [pluginCoreFilter, setPluginCoreFilter] = useState<"all" | "compatible" | "incompatible">("all");
  const [advancementOptionId, setAdvancementOptionId] = useState("");
  const [advancementStep, setAdvancementStep] = useState<"choose" | "review">("choose");
  const [advancementConfirmed, setAdvancementConfirmed] = useState(false);
  const activeSystem = props.systems.find((system) => system.active) ?? props.systems[0];
  const rollLabel = systemRollLabel(props.actor?.systemId);
  const advancementLabel = systemAdvancementLabel(props.actor?.systemId);
  const selectedAdvancementOption = props.advancementOptions.find((option) => option.id === advancementOptionId) ?? props.advancementOptions[0];
  const arcaneRecovery = props.actor ? dnd5eSrdArcaneRecoverySelection(props.actor) : undefined;
  const systemEntrypointLabel = (system: SystemRuntimeInfo) => {
    const entrypoints = [system.entrypoints?.client ? "client" : undefined, system.entrypoints?.server ? "server" : undefined].filter(Boolean);
    return entrypoints.length > 0 ? entrypoints.join("/") : "none";
  };
  const systemSchemaLabel = (system: SystemRuntimeInfo) => {
    const schemas = [system.schemas?.actor ? "actor" : undefined, system.schemas?.item ? "item" : undefined].filter(Boolean);
    return schemas.length > 0 ? schemas.join("/") : "none";
  };
  const registryPlugins = props.plugins.filter((plugin) => plugin.source?.type === "registry");
  const installedPlugins = props.plugins.filter((plugin) => plugin.installed);
  const incompatiblePlugins = props.plugins.filter((plugin) => plugin.compatibleCore?.satisfied === false);
  const trustBlockedPlugins = props.plugins.filter((plugin) => !plugin.trust.installable);
  const reviewBlockedPlugins = props.plugins.filter((plugin) => plugin.marketplaceReview?.installable === false);
  const signatureWarningPlugins = props.plugins.filter((plugin) => !plugin.trust.signature?.verified);
  const marketplaceRiskSamples = props.plugins
    .filter((plugin) => !plugin.trust.installable || plugin.marketplaceReview?.installable === false || plugin.compatibleCore?.satisfied === false || !plugin.trust.signature?.verified || plugin.trust.errors.length > 0)
    .slice(0, 4);
  const registryHistory = Array.from(registryPlugins.reduce((entries, plugin) => {
    const registryUrl = plugin.source?.registryUrl ?? "untracked registry";
    const existing = entries.get(registryUrl) ?? { registryUrl, packageCount: 0, installedCount: 0, warningCount: 0, latestSyncedAt: undefined as string | undefined };
    const hasWarning = !plugin.trust.installable || plugin.marketplaceReview?.installable === false || plugin.compatibleCore?.satisfied === false || !plugin.trust.signature?.verified || plugin.trust.errors.length > 0;
    const syncedAt = plugin.source?.syncedAt;
    entries.set(registryUrl, {
      registryUrl,
      packageCount: existing.packageCount + 1,
      installedCount: existing.installedCount + (plugin.installed ? 1 : 0),
      warningCount: existing.warningCount + (hasWarning ? 1 : 0),
      latestSyncedAt: syncedAt && (!existing.latestSyncedAt || Date.parse(syncedAt) > Date.parse(existing.latestSyncedAt)) ? syncedAt : existing.latestSyncedAt
    });
    return entries;
  }, new Map<string, { registryUrl: string; packageCount: number; installedCount: number; warningCount: number; latestSyncedAt?: string }>()).values()).sort((left, right) => registryHostLabel(left.registryUrl).localeCompare(registryHostLabel(right.registryUrl)));
  const commandCount = props.plugins.reduce((total, plugin) => total + (plugin.chatCommands?.length ?? 0), 0);
  const normalizedPluginSearch = pluginSearch.trim().toLocaleLowerCase();
  const filteredPlugins = props.plugins.filter((plugin) => {
    const sourceType = plugin.source?.type === "registry" ? "registry" : "local";
    if (pluginSourceFilter !== "all" && sourceType !== pluginSourceFilter) return false;
    if (pluginStatusFilter === "installed" && !plugin.installed) return false;
    if (pluginStatusFilter === "available" && plugin.installed) return false;
    if (pluginStatusFilter === "upgrade" && !plugin.updateAvailable) return false;
    if (pluginCoreFilter === "compatible" && plugin.compatibleCore?.satisfied === false) return false;
    if (pluginCoreFilter === "incompatible" && plugin.compatibleCore?.satisfied !== false) return false;
    if (!normalizedPluginSearch) return true;
    return [
      plugin.name,
      plugin.id,
      plugin.version,
      plugin.source?.packageId ?? "",
      plugin.source?.registryUrl ?? "",
      plugin.compatibleCore?.range ?? "",
      plugin.compatibleCore?.coreVersion ?? "",
      plugin.compatibleCore?.satisfied === false ? "incompatible core blocked" : "compatible core",
      plugin.marketplaceReview?.review.status ?? "",
      ...plugin.permissions
    ].some((value) => value.toLocaleLowerCase().includes(normalizedPluginSearch));
  });
  useEffect(() => {
    if (props.advancementOptions.length === 0) {
      if (advancementOptionId) setAdvancementOptionId("");
      setAdvancementStep("choose");
      setAdvancementConfirmed(false);
      return;
    }
    if (!props.advancementOptions.some((option) => option.id === advancementOptionId)) setAdvancementOptionId(props.advancementOptions[0]!.id);
  }, [props.advancementOptions, advancementOptionId]);
  useEffect(() => {
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
  }, [selectedAdvancementOption?.id, props.actor?.id]);
  return (
    <div className="panel-stack">
      <div className="section-title">Runtime SDK</div>
      <div className="metric-row">
        <span>Plugin Marketplace</span>
        <strong>{formatNumber(props.plugins.length)} packages</strong>
      </div>
      <div className="metric-row">
        <span>Registry Browser</span>
        <strong>{formatNumber(registryPlugins.length)} registry packages</strong>
      </div>
      <div className="admin-meta">
        <span>{formatNumber(installedPlugins.length)} installed</span>
        <span>{formatNumber(commandCount)} commands</span>
        <span>{formatNumber(props.plugins.filter((plugin) => plugin.updateAvailable).length)} upgrades</span>
        <span>{formatNumber(incompatiblePlugins.length)} incompatible</span>
      </div>
      <button className="ghost-button wide" type="button" onClick={props.onSyncPluginRegistries} disabled={!props.canInstall}>
        <RefreshCw size={16} /> Sync marketplace registries
      </button>
      <section className="operator-section" aria-label="Plugin marketplace risk review">
        <div className="operator-heading">
          <div className="section-title">Marketplace Risk Review</div>
          <strong>{formatNumber(marketplaceRiskSamples.length)} samples</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Trust blocked" value={formatNumber(trustBlockedPlugins.length)} />
          <MetricTile label="Review blocked" value={formatNumber(reviewBlockedPlugins.length)} />
          <MetricTile label="Core blocked" value={formatNumber(incompatiblePlugins.length)} />
          <MetricTile label="Signature warnings" value={formatNumber(signatureWarningPlugins.length)} />
        </div>
        {marketplaceRiskSamples.length === 0 ? (
          <div className="empty-state compact">No marketplace trust, review, core, or signature warnings in the current catalog.</div>
        ) : (
          <div className="asset-pressure-list">
            {marketplaceRiskSamples.map((plugin) => (
              <div className="operator-row tool-call-row" key={`marketplace-risk-${plugin.id}`}>
                <span>{plugin.name}</span>
                <strong>{[
                  !plugin.trust.installable ? "trust blocked" : undefined,
                  plugin.marketplaceReview?.installable === false ? "review blocked" : undefined,
                  plugin.compatibleCore?.satisfied === false ? "core blocked" : undefined,
                  !plugin.trust.signature?.verified ? "signature warning" : undefined,
                  ...plugin.trust.errors
                ].filter(Boolean).join(", ")}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="operator-section" aria-label="Plugin registry history">
        <div className="operator-heading">
          <div className="section-title">Registry History</div>
          <strong>{formatNumber(registryHistory.length)} sources</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Registry sources" value={formatNumber(registryHistory.length)} />
          <MetricTile label="Registry packages" value={formatNumber(registryPlugins.length)} />
          <MetricTile label="Installed registry" value={formatNumber(registryPlugins.filter((plugin) => plugin.installed).length)} />
          <MetricTile label="Registry warnings" value={formatNumber(registryHistory.reduce((total, registry) => total + registry.warningCount, 0))} />
        </div>
        {registryHistory.length === 0 ? (
          <div className="empty-state compact">No registry package history is present in the current catalog; last sync is unknown.</div>
        ) : (
          <div className="asset-pressure-list">
            {registryHistory.map((registry) => (
              <div className="operator-row tool-call-row" key={`marketplace-registry-${registry.registryUrl}`}>
                <span>{registryHostLabel(registry.registryUrl)}</span>
                <strong>{formatNumber(registry.packageCount)} packages - {formatNumber(registry.installedCount)} installed - {formatNumber(registry.warningCount)} warnings - last sync {registry.latestSyncedAt ? formatDateTime(registry.latestSyncedAt) : "unknown"}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="operator-section content-import-form" aria-label="Plugin marketplace filters">
        <div className="admin-form-grid">
          <label>
            <span>Search</span>
            <input aria-label="Plugin marketplace search" value={pluginSearch} placeholder="Plugin, package, permission" onChange={(event) => setPluginSearch(event.target.value)} />
          </label>
          <label>
            <span>Source</span>
            <select aria-label="Plugin marketplace source filter" value={pluginSourceFilter} onChange={(event) => setPluginSourceFilter(event.target.value as typeof pluginSourceFilter)}>
              <option value="all">All sources</option>
              <option value="local">Local packages</option>
              <option value="registry">Registry packages</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select aria-label="Plugin marketplace status filter" value={pluginStatusFilter} onChange={(event) => setPluginStatusFilter(event.target.value as typeof pluginStatusFilter)}>
              <option value="all">All packages</option>
              <option value="installed">Installed</option>
              <option value="available">Available</option>
              <option value="upgrade">Upgrade ready</option>
            </select>
          </label>
          <label>
            <span>Core</span>
            <select aria-label="Plugin marketplace core filter" value={pluginCoreFilter} onChange={(event) => setPluginCoreFilter(event.target.value as typeof pluginCoreFilter)}>
              <option value="all">All core ranges</option>
              <option value="compatible">Compatible core</option>
              <option value="incompatible">Incompatible core</option>
            </select>
          </label>
        </div>
        <p className="panel-subtitle">{formatNumber(filteredPlugins.length)} of {formatNumber(props.plugins.length)} packages shown</p>
      </section>
      {filteredPlugins.map((plugin) => {
        const compatibilityBlock = plugin.compatibilityBlock ?? (plugin.compatibleCore?.satisfied === false ? `Plugin requires core ${plugin.compatibleCore.range}; server core is ${plugin.compatibleCore.coreVersion}` : undefined);
        const pluginActionBaseEnabled = props.canInstall && plugin.trust.installable && plugin.marketplaceReview?.installable !== false;
        const pluginCommandBlock = !plugin.trust.installable || plugin.marketplaceReview?.installable === false || Boolean(compatibilityBlock);
        const versionCompatibility = plugin.versionCompatibility ?? [];
        const compatibleVersionCount = versionCompatibility.length > 0 ? versionCompatibility.filter((version) => version.compatibleCore.satisfied).length : plugin.distribution.availableVersions.length;
        const blockedVersionCount = versionCompatibility.filter((version) => !version.compatibleCore.satisfied).length;
        const targetVersionBlock = (version: string): string | undefined => {
          const versionInfo = versionCompatibility.find((candidate) => candidate.version === version);
          if (!versionInfo) return undefined;
          return versionInfo.compatibilityBlock ?? (versionInfo.compatibleCore.satisfied ? undefined : `Plugin requires core ${versionInfo.compatibleCore.range}; server core is ${versionInfo.compatibleCore.coreVersion}`);
        };
        const canInstallVersion = (version: string) => pluginActionBaseEnabled && !targetVersionBlock(version);
        return (
          <article className="proposal" key={plugin.id}>
            <span>{plugin.installed ? "installed plugin" : "available plugin"}</span>
            <h3>{plugin.name}</h3>
            <p>{plugin.source ? `${plugin.source.packageId} - ${plugin.source.sandbox} sandbox - v${plugin.version}` : `local package - v${plugin.version}`}</p>
            <div className="admin-meta">
              <span>Source: {plugin.source?.type ?? "local"}</span>
              <span>Package: {plugin.source?.packageId ?? plugin.id}</span>
              <span>Synced: {plugin.source?.syncedAt ? formatDateTime(plugin.source.syncedAt) : "bundled"}</span>
            </div>
            {(plugin.source?.registryUrl || plugin.source?.packageUrl) && (
              <p>{[plugin.source.registryUrl ? `Registry ${plugin.source.registryUrl}` : undefined, plugin.source.packageUrl ? `Package ${plugin.source.packageUrl}` : undefined].filter(Boolean).join(" - ")}</p>
            )}
            <div className="admin-meta">
              <span>Trust: {plugin.trust.status}</span>
              <span>Policy: {plugin.trust.policy}</span>
              <span>Review: {plugin.marketplaceReview?.review.status ?? "not required"}</span>
            </div>
            <div className="admin-meta">
              <span>Signature: {plugin.trust.signature ? `${plugin.trust.signature.verified ? "verified" : "unverified"}${plugin.trust.signature.keyId ? ` ${plugin.trust.signature.keyId}` : ""}` : "not signed"}</span>
              <span>Checksum: {plugin.source?.checksum?.slice(0, 12) ?? plugin.source?.manifestChecksum?.slice(0, 12) ?? "unavailable"}</span>
              <span>Sandbox: {plugin.source?.sandbox ?? "manifest"}</span>
            </div>
            <p>Permission review: {(plugin.permissionReview?.requestedPermissions ?? plugin.permissions).join(", ") || "none requested"}</p>
            <div className="admin-meta">
              <span>{formatNumber(plugin.grantedPermissions.length)} granted</span>
              <span>{formatNumber(plugin.missingPermissions.length)} missing</span>
              <span>{plugin.permissionReview?.grantRequired ? "grant required" : "grant current"}</span>
            </div>
            <p>Audit history: {formatNumber(plugin.audit?.installCount ?? 0)} plugin.install rows{plugin.audit?.lastInstallAt ? `; latest ${formatDateTime(plugin.audit.lastInstallAt)}` : ""}{plugin.audit?.versions.length ? `; versions ${plugin.audit.versions.join(", ")}` : ""}</p>
            <p>Compatibility: latest {plugin.distribution.latestVersion}; {plugin.updateAvailable ? "upgrade available" : "current version"}; rollback {plugin.rollbackVersions.length > 0 ? plugin.rollbackVersions.join(", ") : "none"}</p>
            <div className="admin-meta">
              <span>Core: {plugin.compatibleCore?.range ?? "unspecified"} on {plugin.compatibleCore?.coreVersion ?? "current"}</span>
              <span className={`status-pill ${plugin.compatibleCore?.satisfied === false ? "failed" : "completed"}`}>{plugin.compatibleCore?.satisfied === false ? "core incompatible" : "core compatible"}</span>
              <span>Versions: {formatNumber(compatibleVersionCount)} compatible, {formatNumber(blockedVersionCount)} blocked</span>
            </div>
            {compatibilityBlock && <p>{compatibilityBlock}</p>}
            {plugin.trust.errors.length > 0 && <p>{plugin.trust.errors.join(", ")}</p>}
            {!plugin.installed ? (
              <div className="admin-actions">
                <button className="ghost-button" onClick={() => props.onInstallPlugin(plugin)} disabled={!canInstallVersion(plugin.distribution.latestVersion)}>
                  <Plus size={15} /> Review and install
                </button>
                {plugin.distribution.availableVersions.filter((version) => version !== plugin.distribution.latestVersion).map((version) => (
                  <button className="ghost-button" type="button" key={`${plugin.id}-install-${version}`} onClick={() => props.onInstallPlugin(plugin, version)} disabled={!canInstallVersion(version)}>
                    <Plus size={15} /> Install {version}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="admin-meta">
                  <span>Installed v{plugin.installedVersion ?? plugin.version}</span>
                  <span>{plugin.updateAvailable ? "upgrade ready" : "no upgrade"}</span>
                  <span>{plugin.rollbackVersions.length > 0 ? "rollback ready" : "no rollback"}</span>
                </div>
                <div className="admin-actions">
                  <button className="ghost-button" type="button" onClick={() => props.onInstallPlugin(plugin, plugin.distribution.latestVersion)} disabled={!canInstallVersion(plugin.distribution.latestVersion) || !plugin.updateAvailable}>
                    <RefreshCw size={15} /> Upgrade to {plugin.distribution.latestVersion}
                  </button>
                  {plugin.rollbackVersions.map((version) => (
                    <button className="ghost-button" type="button" key={`${plugin.id}-rollback-${version}`} onClick={() => props.onInstallPlugin(plugin, version)} disabled={!canInstallVersion(version)}>
                      <RotateCcw size={15} /> Roll back to {version}
                    </button>
                  ))}
                </div>
                {plugin.chatCommands?.map((command) => (
                  <button className="ghost-button" key={command.command} onClick={() => props.onRunCommand(plugin, command.command)} disabled={pluginCommandBlock}>
                    <WandSparkles size={15} /> {command.command}
                  </button>
                ))}
              </>
            )}
          </article>
        );
      })}
      <div className="metric-row">
        <span>Active System</span>
        <strong>{activeSystem?.name ?? "No system"}</strong>
      </div>
      <div className="section-title">System Registry</div>
      {props.systems.map((system) => (
        <article className="proposal" key={system.id}>
          <span>{system.active ? "active system" : "available system"}</span>
          <h3>{system.name}</h3>
          <p>Manifest validation: bundled and loadable - v{system.version}</p>
          <div className="admin-meta">
            <span>Compendium: {system.id.includes("dnd") ? "SRD entries" : "starter entries"}</span>
            <span>Core: {system.compatibleCore ?? "unspecified"}</span>
            <span>Entrypoints: {systemEntrypointLabel(system)}</span>
            <span>Schemas: {systemSchemaLabel(system)}</span>
            <span>Permissions: {formatNumber(system.permissions?.length ?? 0)}</span>
            <span>Migration: no campaign migration required</span>
            <span>Activation impact: campaign default rules system</span>
          </div>
          {!system.active && (
            <button className="ghost-button" onClick={() => props.onInstallSystem(system)} disabled={!props.canInstallSystem}>
              <Plus size={15} /> Activate
            </button>
          )}
        </article>
      ))}
      {props.characterTemplates.map((template) => (
        <article className="proposal" key={template.id}>
          <span>character template</span>
          <h3>{template.name}</h3>
          <p>{template.summary}</p>
          <button className="ghost-button" onClick={() => props.onCreateCharacter(template)} disabled={!props.canCreateActor}>
            <Plus size={15} /> Create
          </button>
        </article>
      ))}
      <div className="metric-row">
        <span>Sheet Actor</span>
        <strong>{props.actor?.name ?? "No actor"}</strong>
      </div>
      <section className="operator-section content-import-form" aria-label="Actor advancement choices">
        <div className="operator-heading">
          <div className="section-title">Advancement</div>
          <strong>{formatNumber(props.advancementOptions.length)} choices</strong>
        </div>
        {props.advancementOptions.length === 0 ? (
          <div className="empty-state compact">No advancement choices are available for this actor.</div>
        ) : (
          <>
            <label>
              <span>Choice</span>
              <select aria-label="Advancement option" value={selectedAdvancementOption?.id ?? ""} disabled={!props.canAdvanceActor} onChange={(event) => setAdvancementOptionId(event.target.value)}>
                {props.advancementOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-meta">
              <span>{selectedAdvancementOption?.summary ?? "No advancement selected"}</span>
              {selectedAdvancementOption && <span>next {formatNumber(selectedAdvancementOption.nextValue)}</span>}
            </div>
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={!props.actor || !props.canAdvanceActor || !selectedAdvancementOption} onClick={() => setAdvancementStep("review")}>
                <Eye size={14} /> Review advancement
              </button>
              {advancementStep === "review" && (
                <button className="ghost-button" type="button" onClick={() => setAdvancementStep("choose")}>
                  <ChevronLeft size={14} /> Back to choice
                </button>
              )}
            </div>
            {advancementStep === "review" && selectedAdvancementOption && (
              <div className="asset-pressure-list" role="region" aria-label="Advancement review step">
                <div className="operator-row tool-call-row">
                  <span>Actor</span>
                  <strong>{props.actor?.name ?? "No actor"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Advancement</span>
                  <strong>{selectedAdvancementOption.name}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Next value</span>
                  <strong>{formatNumber(selectedAdvancementOption.nextValue)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Review</span>
                  <strong>{selectedAdvancementOption.summary}</strong>
                </div>
                <label className="inline-check">
                  <input aria-label="Confirm advancement review" type="checkbox" checked={advancementConfirmed} onChange={(event) => setAdvancementConfirmed(event.target.checked)} />
                  <span>Reviewed advancement changes</span>
                </label>
              </div>
            )}
          </>
        )}
      </section>
      <button className="ghost-button wide" onClick={props.onImportCharacter} disabled={!activeSystem || !props.canImportActor}>
        <Upload size={16} /> Import Character
      </button>
      {props.importedActor && (
        <div className="metric-row">
          <span>Imported Character</span>
          <strong>{props.importedActor.name}</strong>
        </div>
      )}
      <button className="ghost-button wide" onClick={props.onCreateMonster} disabled={!activeSystem || activeSystem.id !== "dnd-5e-srd" || !props.canCreateActor}>
        <Swords size={16} /> Create Monster
      </button>
      {props.createdMonster && (
        <div className="metric-row">
          <span>Created Monster</span>
          <strong>{props.createdMonster.name}</strong>
        </div>
      )}
      <button className="ghost-button wide" onClick={() => {
        props.onAdvanceActor(selectedAdvancementOption?.id);
        setAdvancementStep("choose");
        setAdvancementConfirmed(false);
      }} disabled={!props.actor || !props.canAdvanceActor || props.advancementOptions.length === 0 || advancementStep !== "review" || !advancementConfirmed}>
        <RefreshCw size={16} /> {advancementLabel}
      </button>
      <button className="ghost-button wide" onClick={() => props.onRestActor("short")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Short Rest
      </button>
      {arcaneRecovery && (
        <button className="ghost-button wide" onClick={() => props.onRestActor("short", { arcaneRecovery })} disabled={!props.actor || !props.canRestActor}>
          <RefreshCw size={16} /> Arcane Recovery
        </button>
      )}
      <button className="ghost-button wide" onClick={() => props.onRestActor("long")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Long Rest
      </button>
      <button className="primary-button wide" onClick={props.onSystemRoll} disabled={!props.actor || !props.canRollSystem}>
        <ChevronRight size={16} /> {rollLabel}
      </button>
    </div>
  );
}
