import type { Actor, AiMemoryFact, AiThread, AiToolCall, AiUsageMetrics, AuditLog, Campaign, CampaignMember, ChatMessage, Combat, EmailOutboxMessage, Encounter, FogPreset, Item, JournalEntry, MapAsset, PermissionName, Proposal, Scene, Token, User, UserRole, UserSession, VisionSnapshot } from "@open-tabletop/core";

export const baseUrl = import.meta.env.VITE_API_URL ?? "";

const sessionTokenKey = "otte:sessionToken";
const sessionTokenUserKey = "otte:sessionTokenUser";

export function getSessionUserId(): string {
  return localStorage.getItem("otte:userId") ?? "usr_demo_gm";
}

export function setSessionUserId(userId: string): void {
  localStorage.setItem("otte:userId", userId);
  localStorage.removeItem(sessionTokenKey);
  localStorage.removeItem(sessionTokenUserKey);
}

export function getSessionToken(): string {
  return localStorage.getItem(sessionTokenKey) ?? "";
}

export function storeSession(login: SessionLoginInfo): void {
  localStorage.setItem("otte:userId", login.user.id);
  localStorage.setItem(sessionTokenKey, login.token);
  localStorage.setItem(sessionTokenUserKey, login.user.id);
}

export function consumeSsoRedirect(): string | undefined {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("ssoToken");
  const userId = params.get("ssoUserId");
  if (!token || !userId) return undefined;
  localStorage.setItem("otte:userId", userId);
  localStorage.setItem(sessionTokenKey, token);
  localStorage.setItem(sessionTokenUserKey, userId);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return userId;
}

export async function loginSession(userId = getSessionUserId()): Promise<SessionLoginInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  storeSession(login);
  return login;
}

export async function registerSession(input: { email: string; displayName: string; password: string }): Promise<SessionLoginInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  storeSession(login);
  return login;
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/password-reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ ok: boolean }>;
}

export async function confirmPasswordResetSession(input: { token: string; password: string }): Promise<SessionLoginInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  storeSession(login);
  return login;
}

export async function acceptInviteSession(input: { token: string; email: string; displayName: string; password: string }): Promise<InviteAcceptInfo> {
  const response = await fetch(`${baseUrl}/api/v1/invites/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  const accepted = (await response.json()) as InviteAcceptInfo;
  storeSession(accepted);
  return accepted;
}

export async function startOidcLogin(returnTo = window.location.origin + window.location.pathname): Promise<OidcStartInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/oidc/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnTo })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<OidcStartInfo>;
}

export async function loadOidcConfig(): Promise<OidcConfigInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/oidc/config`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<OidcConfigInfo>;
}

async function ensureSessionToken(): Promise<string> {
  const token = localStorage.getItem(sessionTokenKey);
  const tokenUserId = localStorage.getItem(sessionTokenUserKey);
  const userId = getSessionUserId();
  if (token && tokenUserId === userId) return token;
  const login = await loginSession(userId);
  return login.token;
}

async function sessionHeaders(): Promise<Record<string, string>> {
  return { authorization: `Bearer ${await ensureSessionToken()}` };
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: await sessionHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: await sessionHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export interface Snapshot {
  session?: SessionInfo;
  campaigns: Campaign[];
  members: CampaignMemberInfo[];
  scenes: Scene[];
  fogPresets: FogPreset[];
  assets: MapAsset[];
  tokens: Token[];
  actors: Actor[];
  items: Item[];
  vision?: VisionSnapshot;
  journals: JournalEntry[];
  chat: ChatMessage[];
  encounters: Encounter[];
  combats: Combat[];
  proposals: Proposal[];
  memory: AiMemoryFact[];
  aiThreads: AiThread[];
  aiUsage?: AiUsageSummary;
  aiToolCalls: AiToolCall[];
  plugins: PluginRuntimeInfo[];
  systems: SystemRuntimeInfo[];
  characterTemplates: CharacterTemplateInfo[];
}

export interface SessionInfo {
  user: User;
  session?: PublicSession;
  memberships: CampaignMember[];
  serverAdmin?: boolean;
}

export interface PublicSession extends Pick<UserSession, "id" | "userId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {}

export interface SessionLoginInfo extends SessionInfo {
  token: string;
  session: PublicSession;
}

export interface CampaignInviteInfo {
  id: string;
  campaignId: string;
  email?: string;
  role: UserRole;
  invitedByUserId: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
}

export interface InviteCreateInfo {
  invite: CampaignInviteInfo;
  token: string;
  acceptUrl: string;
}

export interface InviteAcceptInfo extends SessionLoginInfo {
  invite: CampaignInviteInfo;
  membership: CampaignMemberInfo;
  campaign: Campaign;
}

export interface OidcStartInfo {
  authorizationUrl: string;
  expiresAt: string;
  provider: {
    issuer: string;
    clientId: string;
    scope: string;
    displayName: string;
    redirectUri: string;
  };
}

export type OidcConfigInfo =
  | { enabled: false }
  | {
      enabled: true;
      issuer: string;
      clientId: string;
      scope: string;
      displayName: string;
      redirectUri: string;
    };

export interface CampaignMemberInfo extends CampaignMember {
  user: Pick<User, "id" | "displayName" | "email">;
  permissions: PermissionName[];
}

export type PluginReviewStatus = "pending" | "approved" | "rejected";

export interface PluginReviewInfo {
  id: string;
  reviewKey: string;
  pluginId: string;
  packageId: string;
  version: string;
  checksum: string;
  sourceType: "local" | "registry";
  registryUrl?: string;
  packageUrl?: string;
  status: PluginReviewStatus;
  notes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginRuntimeInfo {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  installed: boolean;
  grantedPermissions: string[];
  missingPermissions: string[];
  installedVersion?: string;
  updateAvailable: boolean;
  rollbackVersions: string[];
  source?: {
    type: string;
    packageId: string;
    sandbox: string;
    manifestChecksum?: string;
    checksum?: string;
    registryUrl?: string;
    packageUrl?: string;
    packageChecksum?: string;
    syncedAt?: string;
  };
  trust: {
    status: "trusted" | "unsigned" | "untrusted";
    policy: "allow_unsigned" | "require_trusted";
    required: boolean;
    installable: boolean;
    errors: string[];
    signature?: {
      keyId?: string;
      algorithm?: string;
      verified: boolean;
      signaturePath?: string;
    };
  };
  distribution: {
    availableVersions: string[];
    latestVersion: string;
  };
  permissionReview?: {
    requestedPermissions: string[];
    grantRequired: boolean;
  };
  marketplaceReview?: AdminPluginReviewInfo;
  chatCommands?: Array<{ command: string; description: string }>;
}

export interface SystemRuntimeInfo {
  id: string;
  name: string;
  version: string;
  active: boolean;
}

export interface CharacterTemplateInfo {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  actorType: string;
  items: Array<{ entryId: string; quantity?: number }>;
}

export interface EncounterPlanInfo {
  systemId: string;
  partyRating: number;
  threatBudget: number;
  difficulty: "trivial" | "easy" | "standard" | "hard" | "deadly";
  summary: string;
  threats: Array<{
    id: string;
    name: string;
    role: string;
    count: number;
    budgetEach: number;
    budgetTotal: number;
  }>;
}

export interface AiUsageRollup {
  threadCount: number;
  completedThreadCount: number;
  failedThreadCount: number;
  runningThreadCount: number;
  retryAttempts: number;
  eventCount: number;
  toolCallCount: number;
  durationMs: number;
  usage: AiUsageMetrics;
}

export interface AiUsageSummary extends AiUsageRollup {
  campaignId: string;
  providers: Array<AiUsageRollup & { provider: string }>;
}

export interface AdminAiOperations {
  provider: {
    id: string;
    label: string;
  };
  runtime: {
    selectedProvider: string;
    activeProvider: string;
    retryAttempts: number;
    costRatesConfigured: {
      inputTokens: boolean;
      outputTokens: boolean;
    };
    openai?: {
      apiKeyConfigured: boolean;
      model: string;
      baseUrl: string;
      organizationConfigured: boolean;
      projectConfigured: boolean;
    };
    codex?: {
      adapter: string;
      transport: string;
      approvalMode: string;
    };
  };
  totals: AiUsageRollup;
  campaigns: Array<AiUsageRollup & { campaignId: string; campaignName: string }>;
  recentThreads: AiThread[];
  recentToolCalls: Array<
    AiToolCall & {
      campaignId?: string;
      campaignName?: string;
      provider?: string;
      threadTitle?: string;
      threadStatus?: AiThread["status"];
    }
  >;
}

export interface AdminPluginReviewInfo {
  review: PluginReviewInfo;
  plugin: {
    id: string;
    name: string;
    version: string;
    permissions: string[];
    chatCommands?: Array<{ command: string; description: string }>;
  };
  source: NonNullable<PluginRuntimeInfo["source"]>;
  distribution: PluginRuntimeInfo["distribution"];
  trust: PluginRuntimeInfo["trust"];
  installable: boolean;
  installBlock?: string;
}

export interface AdminPluginReviewSnapshot {
  generatedAt: string;
  policy: {
    mode: "allow_unreviewed" | "require_approved";
  };
  totals: {
    pending: number;
    approved: number;
    rejected: number;
    blocked: number;
  };
  plugins: AdminPluginReviewInfo[];
}

export interface AdminUserInfo extends Omit<User, "passwordHash" | "mfa"> {
  disabled: boolean;
  membershipCount: number;
  identityCount: number;
  sessionCount: number;
}

export interface AdminSessionInfo extends PublicSession {
  user: Pick<User, "id" | "displayName" | "email">;
}

export interface AdminPasswordResetInfo {
  reset: Omit<{
    id: string;
    userId: string;
    email: string;
    expiresAt: string;
    usedAt?: string;
    requestedByUserId?: string;
    createdAt: string;
    updatedAt: string;
  }, "tokenHash">;
  email: EmailOutboxMessage;
}

export interface AdminAuditLogExport {
  exportedAt: string;
  count: number;
  filters: Record<string, string>;
  auditLogs: AuditLog[];
}

export interface AdminSnapshot {
  users: AdminUserInfo[];
  sessions: AdminSessionInfo[];
  emailOutbox: EmailOutboxMessage[];
  audit: AdminAuditLogExport;
  aiOperations: AdminAiOperations;
  pluginReviews: AdminPluginReviewSnapshot;
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const [users, sessions, emailOutbox, audit, aiOperations, pluginReviews] = await Promise.all([
    apiGet<AdminUserInfo[]>("/api/v1/admin/users"),
    apiGet<AdminSessionInfo[]>("/api/v1/admin/sessions"),
    apiGet<EmailOutboxMessage[]>("/api/v1/admin/email-outbox"),
    apiGet<AdminAuditLogExport>("/api/v1/admin/audit-logs?limit=12"),
    apiGet<AdminAiOperations>("/api/v1/admin/ai/operations"),
    apiGet<AdminPluginReviewSnapshot>("/api/v1/admin/plugins/reviews")
  ]);
  return { users, sessions, emailOutbox, audit, aiOperations, pluginReviews };
}

export function assetBlobUrl(asset: MapAsset): string {
  if (/^(https?:|data:|blob:)/.test(asset.url)) return asset.url;
  const separator = asset.url.includes("?") ? "&" : "?";
  return `${baseUrl}${asset.url}${separator}sessionToken=${encodeURIComponent(getSessionToken())}`;
}

export async function apiUploadAsset(input: { campaignId: string; sceneId?: string; file: File; setAsBackground?: boolean }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const params = new URLSearchParams();
  if (input.sceneId) params.set("sceneId", input.sceneId);
  if (input.setAsBackground) params.set("setAsBackground", "true");
  const response = await fetch(`${baseUrl}/api/v1/campaigns/${input.campaignId}/assets/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-asset-name": encodeURIComponent(input.file.name),
      ...(await sessionHeaders())
    },
    body: input.file
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ asset: MapAsset; scene?: Scene }>;
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  await ensureSessionToken();
  const [session, campaigns] = await Promise.all([apiGet<SessionInfo>("/api/v1/auth/session"), apiGet<Campaign[]>("/api/v1/campaigns")]);
  const selectedCampaignId = campaignId ?? campaigns[0]?.id;
  if (!selectedCampaignId) {
    return {
      session,
      campaigns,
      members: [],
      scenes: [],
      fogPresets: [],
      assets: [],
      tokens: [],
      actors: [],
      items: [],
      journals: [],
      chat: [],
      encounters: [],
      combats: [],
      proposals: [],
      memory: [],
      aiThreads: [],
      aiToolCalls: [],
      plugins: [],
      systems: [],
      characterTemplates: []
    };
  }
  const scenes = await apiGet<Scene[]>(`/api/v1/campaigns/${selectedCampaignId}/scenes`);
  const selectedSceneId = sceneId ?? scenes.find((scene) => scene.active)?.id ?? scenes[0]?.id;
  const members = await apiGet<CampaignMemberInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/members`);
  const currentMember = members.find((member) => member.user.id === session.user.id);
  const canViewAiOperations = currentMember?.permissions.includes("ai.proposeChanges") ?? false;
  const [assets, fogPresets, tokens, vision, actors, items, journals, chat, encounters, combats, proposals, memory, aiThreads, aiUsage, aiToolCalls, plugins, systems] = await Promise.all([
    apiGet<MapAsset[]>(`/api/v1/campaigns/${selectedCampaignId}/assets`),
    currentMember?.permissions.includes("token.reveal") ? apiGet<FogPreset[]>(`/api/v1/campaigns/${selectedCampaignId}/fog-presets`) : Promise.resolve([]),
    selectedSceneId ? apiGet<Token[]>(`/api/v1/scenes/${selectedSceneId}/tokens`) : Promise.resolve([]),
    selectedSceneId ? apiGet<VisionSnapshot>(`/api/v1/scenes/${selectedSceneId}/vision`) : Promise.resolve(undefined),
    apiGet<Actor[]>(`/api/v1/campaigns/${selectedCampaignId}/actors`),
    apiGet<Item[]>(`/api/v1/campaigns/${selectedCampaignId}/items`),
    apiGet<JournalEntry[]>(`/api/v1/campaigns/${selectedCampaignId}/journal`),
    apiGet<ChatMessage[]>(`/api/v1/chat/messages?campaignId=${selectedCampaignId}`),
    apiGet<Encounter[]>(`/api/v1/campaigns/${selectedCampaignId}/encounters`),
    apiGet<Combat[]>(`/api/v1/campaigns/${selectedCampaignId}/combats`),
    apiGet<Proposal[]>(`/api/v1/campaigns/${selectedCampaignId}/proposals`),
    apiGet<AiMemoryFact[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/memory`),
    canViewAiOperations ? apiGet<AiThread[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/threads`) : Promise.resolve([]),
    canViewAiOperations ? apiGet<AiUsageSummary>(`/api/v1/campaigns/${selectedCampaignId}/ai/usage`) : Promise.resolve(undefined),
    canViewAiOperations ? apiGet<AiToolCall[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/tool-calls`) : Promise.resolve([]),
    apiGet<PluginRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/plugins`),
    apiGet<SystemRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems`)
  ]);
  const activeSystemId = systems.find((system) => system.active)?.id ?? systems[0]?.id;
  const characterTemplates = activeSystemId ? await apiGet<CharacterTemplateInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems/${activeSystemId}/character-templates`) : [];
  return {
    session,
    campaigns,
    members,
    scenes,
    fogPresets,
    assets,
    tokens,
    vision,
    actors,
    items,
    journals,
    chat,
    encounters,
    combats,
    proposals,
    memory,
    aiThreads,
    aiUsage,
    aiToolCalls,
    plugins,
    systems,
    characterTemplates
  };
}
