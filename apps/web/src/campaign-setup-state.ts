import type { Campaign, GridType, Scene, UserRole } from "@open-tabletop/core";
import type { InviteCreateInfo } from "./api.js";

export const campaignSetupDraftVersion = 1;
export const campaignSetupDraftLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const campaignSetupDraftPrefix = "otte:campaign-setup-draft";

export type CampaignSetupStepId = "campaign" | "scene" | "invitation" | "review";

export interface CampaignSetupRoute {
  step: CampaignSetupStepId;
  skipped: CampaignSetupStepId[];
}

export interface CampaignSetupDraftScope {
  organizationId: string;
  userId: string;
  /** The campaign in which the new-campaign drawer was opened; `new` covers an empty workspace. */
  campaignId: string;
}

export interface CampaignSetupDraftInput {
  name: string;
  description: string;
  systemId: string;
  visibility: Campaign["visibility"];
  starterContent: boolean;
  sceneName: string;
  sceneFolder: string;
  sceneWidth: number;
  sceneHeight: number;
  sceneGridType: GridType;
  sceneGridSize: number;
  inviteEnabled: boolean;
  inviteEmail: string;
  inviteRole: UserRole;
  permissionTemplate: string;
  onboardingTitle: string;
  onboardingBody: string;
  route: CampaignSetupRoute;
  idempotencyKeys?: CampaignSetupIdempotencyKeys;
  progress?: CampaignSetupStoredProgress;
}

export interface CampaignSetupStoredProgress {
  campaignId: string;
  sourceCampaignId?: string;
  sceneId?: string;
  onboardingCreated: boolean;
  inviteEmail?: string;
  inviteRole?: UserRole;
  inviteRequestStarted?: boolean;
  inviteCreatedWithoutLink?: boolean;
}

interface StoredCampaignSetupDraft {
  version: typeof campaignSetupDraftVersion;
  scope: CampaignSetupDraftScope;
  savedAt: number;
  expiresAt: number;
  draft: CampaignSetupDraftInput;
}

export type CampaignSetupDraftLoadResult =
  | { status: "missing" }
  | { status: "ready"; draft: CampaignSetupDraftInput; savedAt: number }
  | { status: "expired" | "incompatible" | "corrupt"; message: string };

export const campaignSetupSteps: readonly CampaignSetupStepId[] = ["campaign", "scene", "invitation", "review"];

export function defaultCampaignSetupDraft(): CampaignSetupDraftInput {
  return {
    name: "",
    description: "",
    systemId: "dnd-5e-srd",
    visibility: "private",
    starterContent: true,
    sceneName: "Opening Scene",
    sceneFolder: "session-0",
    sceneWidth: 1200,
    sceneHeight: 800,
    sceneGridType: "square",
    sceneGridSize: 50,
    inviteEnabled: false,
    inviteEmail: "",
    inviteRole: "player",
    permissionTemplate: "standard",
    onboardingTitle: "Welcome to the Table",
    onboardingBody: "Use this handout for table rules, safety notes, and first-session goals.",
    route: { step: "campaign", skipped: [] }
  };
}

export function campaignSetupDraftStorageKey(scope: CampaignSetupDraftScope): string {
  return `${campaignSetupDraftPrefix}:v${campaignSetupDraftVersion}:${encodeURIComponent(scope.organizationId)}:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.campaignId || "new")}`;
}

export function saveCampaignSetupDraft(storage: Pick<Storage, "setItem">, scope: CampaignSetupDraftScope, draft: CampaignSetupDraftInput, now = Date.now()): void {
  const stored: StoredCampaignSetupDraft = {
    version: campaignSetupDraftVersion,
    scope: { ...scope, campaignId: scope.campaignId || "new" },
    savedAt: now,
    expiresAt: now + campaignSetupDraftLifetimeMs,
    draft: sanitizeCampaignSetupDraft(draft)
  };
  storage.setItem(campaignSetupDraftStorageKey(scope), JSON.stringify(stored));
}

export function loadCampaignSetupDraft(storage: Pick<Storage, "getItem">, scope: CampaignSetupDraftScope, now = Date.now()): CampaignSetupDraftLoadResult {
  const raw = storage.getItem(campaignSetupDraftStorageKey(scope));
  if (!raw) return { status: "missing" };
  try {
    const stored = JSON.parse(raw) as Partial<StoredCampaignSetupDraft>;
    if (stored.version !== campaignSetupDraftVersion) return { status: "incompatible", message: "This setup draft was saved by another app version. Start fresh to continue safely." };
    if (!sameScope(stored.scope, scope) || !stored.draft || typeof stored.savedAt !== "number" || typeof stored.expiresAt !== "number") {
      return { status: "corrupt", message: "This setup draft does not match the current campaign and account. Start fresh to continue safely." };
    }
    if (stored.expiresAt <= now) return { status: "expired", message: "This setup draft expired after seven days. Start fresh to use current campaign defaults." };
    const draft = parseCampaignSetupDraft(stored.draft);
    return draft ? { status: "ready", draft, savedAt: stored.savedAt } : { status: "corrupt", message: "This setup draft is incomplete or damaged. Start fresh to continue safely." };
  } catch {
    return { status: "corrupt", message: "This setup draft could not be read. Start fresh to continue safely." };
  }
}

export function clearCampaignSetupDraft(storage: Pick<Storage, "removeItem">, scope: CampaignSetupDraftScope): void {
  storage.removeItem(campaignSetupDraftStorageKey(scope));
}

export function moveCampaignSetupRoute(route: CampaignSetupRoute, action: "back" | "next" | "skip" | CampaignSetupStepId): CampaignSetupRoute {
  if (campaignSetupSteps.includes(action as CampaignSetupStepId) && action !== "back" && action !== "next" && action !== "skip") {
    return { ...route, step: action as CampaignSetupStepId };
  }
  const index = campaignSetupSteps.indexOf(route.step);
  if (action === "back") return { ...route, step: campaignSetupSteps[Math.max(0, index - 1)]! };
  const next = campaignSetupSteps[Math.min(campaignSetupSteps.length - 1, index + 1)]!;
  return { step: next, skipped: action === "skip" && route.step !== "campaign" && route.step !== "review" ? [...new Set([...route.skipped, route.step])] : route.skipped };
}

function sameScope(value: unknown, expected: CampaignSetupDraftScope): boolean {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<CampaignSetupDraftScope>;
  return scope.organizationId === expected.organizationId && scope.userId === expected.userId && scope.campaignId === (expected.campaignId || "new");
}

function parseCampaignSetupDraft(value: unknown): CampaignSetupDraftInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const draft = value as Partial<CampaignSetupDraftInput>;
  const visibilityValid = draft.visibility === "private" || draft.visibility === "invite_only" || draft.visibility === "public";
  const gridTypeValid = draft.sceneGridType === "square" || draft.sceneGridType === "gridless";
  const roleValid = draft.inviteRole === "player" || draft.inviteRole === "observer" || draft.inviteRole === "assistant_gm" || draft.inviteRole === "gm";
  const routeValid = draft.route && campaignSetupSteps.includes(draft.route.step) && Array.isArray(draft.route.skipped) && draft.route.skipped.every((step) => campaignSetupSteps.includes(step));
  const keysValid = !draft.idempotencyKeys || [draft.idempotencyKeys.draftKey, draft.idempotencyKeys.campaign, draft.idempotencyKeys.scene, draft.idempotencyKeys.journal, draft.idempotencyKeys.invite].every((item) => typeof item === "string");
  const progressValid = !draft.progress || (typeof draft.progress.campaignId === "string" && typeof draft.progress.onboardingCreated === "boolean" && [draft.progress.sourceCampaignId, draft.progress.sceneId, draft.progress.inviteEmail].every((item) => item === undefined || typeof item === "string") && (draft.progress.inviteRole === undefined || ["player", "observer", "assistant_gm", "gm"].includes(draft.progress.inviteRole)) && [draft.progress.inviteRequestStarted, draft.progress.inviteCreatedWithoutLink].every((item) => item === undefined || typeof item === "boolean"));
  if (![draft.name, draft.description, draft.systemId, draft.sceneName, draft.sceneFolder, draft.inviteEmail, draft.permissionTemplate, draft.onboardingTitle, draft.onboardingBody].every((item) => typeof item === "string") || !visibilityValid || typeof draft.starterContent !== "boolean" || !gridTypeValid || ![draft.sceneWidth, draft.sceneHeight, draft.sceneGridSize].every(Number.isFinite) || typeof draft.inviteEnabled !== "boolean" || !roleValid || !routeValid || !keysValid || !progressValid) return undefined;
  return sanitizeCampaignSetupDraft(draft as CampaignSetupDraftInput);
}

/** Whitelisting prevents future callers from accidentally persisting tokens, passwords, or other secrets. */
function sanitizeCampaignSetupDraft(draft: CampaignSetupDraftInput): CampaignSetupDraftInput {
  const idempotencyKeys = draft.idempotencyKeys ? { draftKey: draft.idempotencyKeys.draftKey, campaign: draft.idempotencyKeys.campaign, scene: draft.idempotencyKeys.scene, journal: draft.idempotencyKeys.journal, invite: draft.idempotencyKeys.invite } : undefined;
  const progress = draft.progress ? { campaignId: draft.progress.campaignId, ...(draft.progress.sourceCampaignId ? { sourceCampaignId: draft.progress.sourceCampaignId } : {}), ...(draft.progress.sceneId ? { sceneId: draft.progress.sceneId } : {}), onboardingCreated: draft.progress.onboardingCreated, ...(draft.progress.inviteEmail !== undefined ? { inviteEmail: draft.progress.inviteEmail } : {}), ...(draft.progress.inviteRole ? { inviteRole: draft.progress.inviteRole } : {}), ...(draft.progress.inviteRequestStarted ? { inviteRequestStarted: true } : {}), ...(draft.progress.inviteCreatedWithoutLink ? { inviteCreatedWithoutLink: true } : {}) } : undefined;
  return {
    name: draft.name,
    description: draft.description,
    systemId: draft.systemId,
    visibility: draft.visibility,
    starterContent: draft.starterContent,
    sceneName: draft.sceneName,
    sceneFolder: draft.sceneFolder,
    sceneWidth: draft.sceneWidth,
    sceneHeight: draft.sceneHeight,
    sceneGridType: draft.sceneGridType,
    sceneGridSize: draft.sceneGridSize,
    inviteEnabled: draft.inviteEnabled,
    inviteEmail: draft.inviteEmail,
    inviteRole: draft.inviteRole,
    permissionTemplate: draft.permissionTemplate,
    onboardingTitle: draft.onboardingTitle,
    onboardingBody: draft.onboardingBody,
    route: { step: draft.route.step, skipped: [...draft.route.skipped] },
    ...(idempotencyKeys ? { idempotencyKeys } : {}),
    ...(progress ? { progress } : {})
  };
}

export interface CampaignSetupProgress {
  key: string;
  organizationId: string;
  userId: string;
  campaign: Campaign;
  draftScopeCampaignId?: string;
  scene?: Scene;
  onboardingCreated: boolean;
  invite?: InviteCreateInfo;
  inviteEmail?: string;
  inviteRole?: UserRole;
  inviteRequestStarted?: boolean;
  inviteCreatedWithoutLink?: boolean;
}

export interface CampaignSetupIdempotencyKeys {
  draftKey: string;
  campaign: string;
  scene: string;
  journal: string;
  invite: string;
}
