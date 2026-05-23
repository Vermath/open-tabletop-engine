import type { Actor, AiEvaluationRun, AiMemoryFact, AiThread, AiToolCall, AiUsageMetrics, AuditLog, Campaign, CampaignMember, ChatMessage, Combat, ContentImportBatch, DiceMacro, DiceRoll, EmailOutboxMessage, Encounter, FogPreset, Item, JobStatus, JobType, JournalEntry, MapAsset, OrganizationMember, OrganizationMemberRole, OrganizationWorkspace, PermissionName, Proposal, Scene, ScimAssignableRole, ScimGroup, ScimGroupRoleMapping, Token, User, UserRole, UserSession, VisionSnapshot } from "@open-tabletop/core";

export const baseUrl = import.meta.env.VITE_API_URL ?? "";

const sessionTokenKey = "otte:sessionToken";
const sessionTokenUserKey = "otte:sessionTokenUser";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly responseText: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

export function clearSession(): void {
  localStorage.removeItem(sessionTokenKey);
  localStorage.removeItem(sessionTokenUserKey);
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
  const demoEmail = demoLoginEmail(userId);
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(demoEmail ? { email: demoEmail } : { userId })
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  storeSession(login);
  return login;
}

function demoLoginEmail(userId: string): string | undefined {
  if (userId === "usr_demo_gm") return "gm@example.test";
  if (userId === "usr_demo_player") return "player@example.test";
  return undefined;
}

export async function loginPasswordSession(input: { email: string; password: string; mfaCode?: string; recoveryCode?: string }): Promise<SessionLoginInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
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

export async function logoutSession(): Promise<{ ok: boolean }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers: await sessionHeaders()
  });
  clearSession();
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ ok: boolean }>;
}

export async function changePasswordSession(input: { currentPassword: string; newPassword: string }): Promise<SessionLoginInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/password/change`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  storeSession(login);
  return login;
}

export async function loadMfaStatus(): Promise<MfaInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/mfa`, {
    headers: await sessionHeaders()
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<MfaInfo>;
}

export async function enrollTotpMfa(input: { currentPassword: string }): Promise<TotpEnrollInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/mfa/totp/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpEnrollInfo>;
}

export async function confirmTotpMfa(input: { code: string }): Promise<TotpConfirmInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/mfa/totp/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpConfirmInfo>;
}

export async function disableTotpMfa(input: { currentPassword: string; mfaCode?: string; recoveryCode?: string }): Promise<TotpConfirmInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/mfa/totp`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpConfirmInfo>;
}

export async function loadBootstrapStatus(): Promise<BootstrapStatus> {
  const response = await fetch(`${baseUrl}/api/v1/auth/bootstrap`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<BootstrapStatus>;
}

export async function bootstrapOwnerSession(input: { email: string; displayName: string; password: string; campaignName: string; campaignDescription?: string; defaultSystemId?: string }): Promise<BootstrapOwnerInfo> {
  const response = await fetch(`${baseUrl}/api/v1/auth/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as BootstrapOwnerInfo;
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

async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = undefined;
    }
  }
  const message = responseErrorMessage(body, text, response);
  return new ApiError(message, response.status, body, text);
}

function responseErrorMessage(body: unknown, text: string, response: Response): string {
  if (isPlainObject(body) && typeof body.message === "string" && body.message.trim()) return body.message;
  if (text.trim()) return text;
  return `${response.status} ${response.statusText || "Request failed"}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: await sessionHeaders()
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: await sessionHeaders()
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function updateWorkspaceDefaults(input: Partial<OrganizationWorkspace>): Promise<OrganizationWorkspace> {
  return apiPatch<OrganizationWorkspace>("/api/v1/organization/workspace-defaults", input);
}

export async function createOrganizationWorkspace(input: Partial<OrganizationWorkspace> & { name: string }): Promise<{ organization: OrganizationWorkspace; session: UserSession; organizations: OrganizationWorkspaceInfo[] }> {
  return apiPost<{ organization: OrganizationWorkspace; session: UserSession; organizations: OrganizationWorkspaceInfo[] }>("/api/v1/organizations", input);
}

export async function loadOrganizationMembers(): Promise<OrganizationMemberInfo[]> {
  return apiGet<OrganizationMemberInfo[]>("/api/v1/organization/members");
}

export async function upsertOrganizationMember(input: { email?: string; userId?: string; role: Exclude<OrganizationMemberRole, "owner"> }): Promise<OrganizationMemberInfo> {
  return apiPost<OrganizationMemberInfo>("/api/v1/organization/members", input);
}

export async function updateOrganizationMemberRole(memberId: string, role: Exclude<OrganizationMemberRole, "owner">): Promise<OrganizationMemberInfo> {
  return apiPatch<OrganizationMemberInfo>(`/api/v1/organization/members/${memberId}`, { role });
}

export async function removeOrganizationMember(memberId: string): Promise<{ removed: boolean; memberId: string; userId: string; removedCampaignMemberships: number }> {
  return apiDelete<{ removed: boolean; memberId: string; userId: string; removedCampaignMemberships: number }>(`/api/v1/organization/members/${memberId}`);
}

export async function loadOrganizationInvites(): Promise<OrganizationInviteInfo[]> {
  return apiGet<OrganizationInviteInfo[]>("/api/v1/organization/invites");
}

export async function revokeInvite(inviteId: string): Promise<CampaignInviteInfo> {
  return apiPost<CampaignInviteInfo>(`/api/v1/invites/${inviteId}/revoke`, {});
}

export async function switchOrganization(organizationId: string): Promise<OrganizationSwitchInfo> {
  return apiPatch<OrganizationSwitchInfo>("/api/v1/organization/session", { organizationId });
}

export interface Snapshot {
  session?: SessionInfo;
  workspaceDefaults?: OrganizationWorkspace;
  organizations: OrganizationWorkspaceInfo[];
  organizationMembers: OrganizationMemberInfo[];
  organizationInvites: OrganizationInviteInfo[];
  campaigns: Campaign[];
  members: CampaignMemberInfo[];
  scenes: Scene[];
  fogPresets: FogPreset[];
  assets: MapAsset[];
  assetStorage?: CampaignAssetStorageInfo;
  tokens: Token[];
  actors: Actor[];
  items: Item[];
  vision?: VisionSnapshot;
  journals: JournalEntry[];
  chat: ChatMessage[];
  rolls: DiceRoll[];
  diceMacros: DiceMacro[];
  encounters: Encounter[];
  combats: Combat[];
  combatAudit: AuditLog[];
  proposals: Proposal[];
  contentImports: ContentImportBatch[];
  memory: AiMemoryFact[];
  aiThreads: AiThread[];
  aiUsage?: AiUsageSummary;
  aiToolCalls: AiToolCall[];
  plugins: PluginRuntimeInfo[];
  systems: SystemRuntimeInfo[];
  characterTemplates: CharacterTemplateInfo[];
}

export interface CampaignAssetStorageInfo {
  campaignId: string;
  assetCount: number;
  activeAssetCount: number;
  usedBytes: number;
  allBytes: number;
  quotaBytes?: number;
  remainingBytes?: number;
  lifecycleCounts: Record<string, number>;
  providerCounts: Record<string, number>;
  delivery?: {
    mode: string;
    cdnConfigured: boolean;
    publicUrlConfigured: boolean;
    signingSecretConfigured: boolean;
    signingSecretRequired: boolean;
    defaultTtlSeconds: number;
    maxTtlSeconds: number;
    purgeWebhookConfigured: boolean;
    purgeWebhookTokenConfigured: boolean;
    purgeTimeoutMs: number;
    actionRequired: boolean;
    actionReasons: string[];
    warnings: Array<{
      code: string;
      severity: string;
      message: string;
      env: string[];
    }>;
    posture: {
      activeManagedAssetCount: number;
      deliverableActiveAssetCount: number;
      undeliverableActiveAssetCount: number;
      expiredActiveAssetCount: number;
      deliverableCoverageRate: number;
      cdnEligibleAssetCount: number;
      signedUrlEligibleAssetCount: number;
    };
  };
  largestAssets: Array<{
    id: string;
    campaignId: string;
    name: string;
    sizeBytes: number;
    provider: string;
    lifecycleStatus: string;
    expiresAt?: string;
  }>;
}

export type OrganizationMemberInfo = OrganizationMember & { user: Pick<User, "id" | "displayName" | "email"> };
export type OrganizationWorkspaceInfo = OrganizationWorkspace & { role: OrganizationMemberRole; memberCount: number; campaignCount: number };

export interface OrganizationSwitchInfo {
  organization: OrganizationWorkspace;
  session: PublicSession;
  organizations: OrganizationWorkspaceInfo[];
}

export interface SessionInfo {
  user: User;
  session?: PublicSession;
  memberships: CampaignMember[];
  serverAdmin?: boolean;
  organization?: OrganizationWorkspace;
  organizations?: OrganizationWorkspaceInfo[];
  serverAdmins?: {
    configured: boolean;
    count: number;
    missingInProduction: boolean;
  };
}

export interface PublicSession extends Pick<UserSession, "id" | "userId" | "activeOrganizationId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"> {}

export interface AdminSessionRiskItem {
  session: PublicSession;
  user: Pick<User, "id" | "displayName" | "email">;
  reasons: Array<"expired" | "stale" | "disabled_user" | "unknown_user">;
  lastSeenAgeDays?: number;
  expiresInMs: number;
}

export interface SessionLoginInfo extends SessionInfo {
  token: string;
  session: PublicSession;
}

export interface MfaInfo {
  totpEnabled: boolean;
  totpPending: boolean;
  recoveryCodeCount: number;
  enabledAt?: string;
  lastVerifiedAt?: string;
}

export interface TotpEnrollInfo {
  secret: string;
  otpauthUrl: string;
  mfa: MfaInfo;
}

export interface TotpConfirmInfo {
  recoveryCodes?: string[];
  mfa: MfaInfo;
  user: User;
}

export interface BootstrapStatus {
  required: boolean;
  userCount: number;
  campaignCount: number;
  publicRegistration: boolean;
  serverAdmins: NonNullable<SessionInfo["serverAdmins"]>;
}

export interface BootstrapOwnerInfo extends SessionLoginInfo {
  organization: OrganizationWorkspace;
  campaign: Campaign;
  scene: Scene;
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

export interface OrganizationInviteInfo extends CampaignInviteInfo {
  campaign: Pick<Campaign, "id" | "name">;
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
  compatibleCore?: {
    range: string;
    coreVersion: string;
    satisfied: boolean;
  };
  compatibilityBlock?: string;
  versionCompatibility?: Array<{
    version: string;
    compatibleCore: {
      range: string;
      coreVersion: string;
      satisfied: boolean;
    };
    compatibilityBlock?: string;
  }>;
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
  audit?: {
    installCount: number;
    lastInstallAt?: string;
    lastActorUserId?: string;
    versions: string[];
  };
}

export interface SystemRuntimeInfo {
  id: string;
  name: string;
  version: string;
  compatibleCore?: string;
  entrypoints?: {
    client?: string;
    server?: string;
  };
  schemas?: {
    actor?: string;
    item?: string;
  };
  permissions?: PermissionName[];
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
  generatedAt: string;
  actionRequired: boolean;
  actionReasons: string[];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
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
    costRatesComplete: boolean;
    invalidCostConfig: string[];
    invalidProviderThresholdConfig: string[];
    invalidRuntimeControlConfig: string[];
    costBudgetUsd?: number;
    openai?: {
      apiKeyConfigured: boolean;
      model: string;
      modelConfigured: boolean;
      baseUrl: string;
      baseUrlValid: boolean;
      baseUrlIssue?: string;
      baseUrlInsecureInProduction: boolean;
      timeoutMs: number;
      organizationConfigured: boolean;
      projectConfigured: boolean;
    };
    codex?: {
      adapter: string;
      transport: string;
      approvalMode: string;
    };
  };
  runtimePosture: {
    selectedProvider: string;
    activeProvider: string;
    providerMismatch: boolean;
    retryAttempts: number;
    costRatesConfigured: {
      inputTokens: boolean;
      outputTokens: boolean;
    };
    costRatesComplete: boolean;
    invalidCostConfig: string[];
    invalidProviderThresholdConfig: string[];
    invalidRuntimeControlConfig: string[];
    openai?: {
      apiKeyConfigured: boolean;
      timeoutMs: number;
      model: string;
      modelConfigured: boolean;
      baseUrl: string;
      baseUrlValid: boolean;
      baseUrlIssue?: string;
      baseUrlInsecureInProduction: boolean;
    };
    codex?: {
      adapter: string;
      transport: string;
      approvalMode: string;
    };
    actionRequired: boolean;
    actionReasons: string[];
    remediation: string;
  };
  totals: AiUsageRollup;
  serviceLevels: {
    threads: {
      threadCount: number;
      completionRate: number;
      failureRate: number;
      durationMs: AdminDurationSummary;
    };
    tools: {
      toolCallCount: number;
      failureRate: number;
      durationMs: AdminDurationSummary;
    };
    evaluations: {
      evaluationCount: number;
      passRate: number;
      failureRate: number;
      averageScore: number;
    };
  };
  evaluationCoverage: {
    threadCount: number;
    evaluatedThreadCount: number;
    unevaluatedThreadCount: number;
    evaluationCoverageRate: number;
    failedEvaluationThreadCount: number;
    recurringFailedChecks: Array<{ name: string; count: number }>;
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      threadCount: number;
      evaluatedThreadCount: number;
      unevaluatedThreadCount: number;
      failedEvaluationCount: number;
      latestEvaluationAt?: string;
    }>;
    recentUnevaluatedThreads: Array<{
      id: string;
      campaignId: string;
      title: string;
      provider: string;
      status?: AiThread["status"];
      createdAt: string;
      updatedAt: string;
    }>;
  };
  evaluations: {
    evaluationCount: number;
    passedEvaluationCount: number;
    failedEvaluationCount: number;
    averageScore: number;
    failedChecks: Array<{ name: string; count: number }>;
  };
  safetyPosture: {
    evaluationCount: number;
    evaluationWithSafetyCheckCount: number;
    evaluatedThreadWithSafetyCheckCount: number;
    safetyCheckCount: number;
    failedSafetyCheckCount: number;
    safetyCheckCoverageRate: number;
    categoryCounts: Record<string, number>;
    failedCategoryCounts: Record<string, number>;
    actionRequired: boolean;
    recurringFailures: Array<{ name: string; count: number }>;
    recentFailures: Array<{
      evaluationId: string;
      evaluationName: string;
      campaignId: string;
      threadId: string;
      provider: string;
      category?: string;
      name: string;
      expected: unknown;
      actual: unknown;
    }>;
  };
  providerHealth: Array<
    AiUsageRollup & {
      provider: string;
      actionRequired: boolean;
      actionReasons: string[];
      remediation: string;
      failureRate: number;
      failureRateThreshold: number;
      failureRateDegraded: boolean;
      p95DurationThresholdMs?: number;
      p95DurationDegraded: boolean;
      runningThreadThreshold: number;
      runningThreadPressure: boolean;
      completionRate: number;
      staleRunningThreadCount: number;
      providerErrorCount: number;
      durationMsSummary: AdminDurationSummary;
      recentErrorMessages: string[];
    }
  >;
  toolCatalog: {
    toolCount: number;
    permissionSafeToolCount: number;
    proposalGatedToolCount: number;
    failClosedToolCount: number;
    actionRequired: boolean;
    actionReasons: string[];
    remediation: string;
    permissionSafeAllowlist: string[];
    tools: Array<{
      name: string;
      requiredPermissions: string[];
      permissionSafe: boolean;
      proposalGated: boolean;
      failClosed: boolean;
      parameterSchemaType: string;
      rejectsAdditionalProperties: boolean;
    }>;
  };
  replayOperations: {
    replayedToolCallCount: number;
    completedReplayCount: number;
    failedReplayCount: number;
    latestReplayAt?: string;
    actionRequired: boolean;
    recentRetried: Array<{
      id: string;
      threadId: string;
      campaignId?: string;
      campaignName?: string;
      provider?: string;
      threadTitle?: string;
      threadStatus?: AiThread["status"];
      toolName: string;
      originalError?: string;
      retriedAt?: string;
      startedCallId?: string;
      resultCallId?: string;
      resultStatus?: "completed" | "failed";
      resultError?: string;
    }>;
    recentRuns: Array<{
      auditLogId: string;
      actorUserId?: string;
      createdAt: string;
      dryRun: boolean;
      campaignId?: string;
      threadId?: string;
      toolCallId?: string;
      matched: number;
      retried: number;
      skipped: number;
      completed: number;
      failed: number;
    }>;
  };
  proposalReview: {
    proposalCount: number;
    pendingCount: number;
    approvedCount: number;
    appliedCount: number;
    rejectedCount: number;
    applyReadyCount: number;
    approvalRequiredCount: number;
    staleReviewThresholdMs: number;
    stalePendingCount: number;
    staleApprovedCount: number;
    applyFailureCount: number;
    oldestPendingAgeMs: number;
    oldestApprovedAgeMs: number;
    sourceCounts: Record<string, number>;
    entityCounts: Record<string, number>;
    actionRequired: boolean;
    actionReasons: string[];
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      pendingCount: number;
      oldestPendingAgeMs: number;
      oldestPendingAt?: string;
    }>;
    recentPending: AdminAiProposalReviewInfo[];
    recentApproved: AdminAiProposalReviewInfo[];
    recentApplied: AdminAiProposalReviewInfo[];
    recentRejected: AdminAiProposalReviewInfo[];
    stalePending: AdminAiProposalReviewInfo[];
    staleApproved: AdminAiProposalReviewInfo[];
    recentApplyFailures: Array<{
      auditLogId: string;
      proposalId?: string;
      campaignId?: string;
      campaignName?: string;
      actorUserId?: string;
      status?: string;
      createdByType?: string;
      sourceId?: string;
      changeCount: number;
      entities: string[];
      reason: string;
      message?: string;
      createdAt: string;
    }>;
  };
  risk: {
    failedThreadCount: number;
    runningThreadCount: number;
    staleRunningThreadCount: number;
    staleRunningThresholdMs: number;
    startedToolCallCount: number;
    staleStartedToolCallCount: number;
    staleStartedToolCallThresholdMs: number;
    failedToolCallCount: number;
    failedEvaluationCount: number;
    costBudgetExceeded: boolean;
    actionRequired: boolean;
    recentStaleRunningThreads: Array<{
      id: string;
      campaignId: string;
      title: string;
      provider: string;
      startedAt?: string;
      ageMs: number;
    }>;
    recentStaleStartedToolCalls: Array<{
      id: string;
      threadId: string;
      campaignId?: string;
      provider?: string;
      toolName: string;
      status: string;
      createdAt: string;
      ageMs: number;
    }>;
    providerErrors: Array<{
      message: string;
      count: number;
      recentThreads: Array<{
        id: string;
        campaignId: string;
        campaignName?: string;
        provider: string;
        title: string;
        status: AiThread["status"];
        failedAt?: string;
        retryAttempts: number;
        durationMs?: number;
      }>;
    }>;
    failedTools: Array<{ toolName: string; count: number; errors: Array<{ error: string; count: number }> }>;
    costBudget?: {
      configured: boolean;
      budgetUsd?: number;
      estimatedCostUsd: number;
      remainingUsd?: number;
      usageRatio?: number;
      exceeded: boolean;
    };
    failedToolRetryPolicy?: {
      retryableCount: number;
      nonRetryableCount: number;
      byTool: Array<{
        toolName: string;
        retryable: number;
        nonRetryable: number;
        reasons: Array<{ reason: string; count: number }>;
      }>;
      recentRetryable: Array<{
        id: string;
        threadId: string;
        campaignId?: string;
        campaignName?: string;
        provider?: string;
        threadTitle?: string;
        threadStatus?: AiThread["status"];
        toolName: string;
        error?: string;
        retryReason: string;
        createdAt: string;
      }>;
    };
    failedEvaluationChecks: Array<{ name: string; count: number }>;
  };
  recentEvaluations: AiEvaluationRun[];
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

export interface AdminAiProposalReviewInfo {
  id: string;
  campaignId: string;
  campaignName?: string;
  title: string;
  status: Proposal["status"];
  createdByUserId?: string;
  sourceId?: string;
  changeCount: number;
  entities: string[];
  createdAt: string;
  updatedAt: string;
  approvedByUserId?: string;
}

export interface AdminDurationSummary {
  count: number;
  average: number;
  p95: number;
  max: number;
}

export interface AdminAuthOperations {
  generatedAt: string;
  actionRequired: boolean;
  actionReasons: string[];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "critical";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
  runtime: {
    nodeEnv: string;
    legacyUserHeader: {
      enabled: boolean;
      compatibilityFlagSet: boolean;
      productionHardFence: boolean;
      mode: string;
    };
    authUrls: {
      invalidUrlConfig: string[];
      insecureUrlConfig: string[];
      invalidNumericConfig: string[];
      passwordReset: {
        configured: boolean;
        valid: boolean;
        insecureInProduction: boolean;
        webOriginConfigured: boolean;
        webOriginValid: boolean;
        webOriginInsecureInProduction: boolean;
        linkMissingInProduction: boolean;
        ttlMinutes: number;
      };
      emailWebhook: {
        configured: boolean;
        valid: boolean;
        insecureInProduction: boolean;
        tokenConfigured: boolean;
        tokenMissingInProduction: boolean;
        timeoutMs: number;
      };
    };
    sessions: {
      ttlDays: number;
      invalidNumericConfig: string[];
    };
    oidc: {
      configured: boolean;
      issuerConfigured: boolean;
      clientIdConfigured: boolean;
      clientSecretConfigured: boolean;
      redirectUriConfigured: boolean;
      allowedReturnOriginsConfigured: boolean;
      allowInsecureIssuer: boolean;
      tokenAuth: string;
      invalidConfig: string[];
      insecureConfig: string[];
      missingInProduction: boolean;
    };
    scim: {
      configured: boolean;
      bearerTokenConfigured: boolean;
      serviceProviderConfigPath: string;
      usersPath: string;
      groupsPath: string;
      userCount: number;
      groupCount: number;
      mappingCount: number;
      matchedMappingCount: number;
    };
    serverAdmins: {
      configured: boolean;
      count: number;
      missingInProduction: boolean;
    };
  };
  legacyUserHeaderUsage: {
    usageCount: number;
    blockedAttemptCount: number;
    distinctUserCount: number;
    lastSeenAt?: string;
    lastBlockedAt?: string;
    userCounts: Record<string, number>;
    recentSamples: Array<{
      auditLogId: string;
      userId: string;
      createdAt: string;
      mode: string;
      source: string;
    }>;
    blockedSamples: Array<{
      auditLogId: string;
      userId: string;
      createdAt: string;
      mode: string;
      source: string;
    }>;
  };
  loginFailures: {
    failureCount: number;
    distinctKnownUserCount: number;
    unknownIdentityCount: number;
    reasonCounts: Record<string, number>;
    statusCounts: Record<string, number>;
    recentFailures: Array<{
      auditLogId: string;
      userId?: string;
      userKnown: boolean;
      reason: string;
      statusCode: number;
      createdAt: string;
    }>;
  };
  users: {
    totalUserCount: number;
    activeUserCount: number;
    disabledUserCount: number;
    disabledUsers: Array<{ id: string; displayName: string; email?: string; disabledAt?: string; passwordResetRequired: boolean; sessionCount: number; membershipCount: number; identityCount: number }>;
    passwordUserCount: number;
    passwordResetRequiredUserCount: number;
    mfaEnabledUserCount: number;
    mfaCoverageRate: number;
    activePasswordUserWithoutMfaCount: number;
    activePasswordUsersWithoutMfa: Array<{ id: string; displayName: string; email?: string; passwordResetRequired: boolean; sessionCount: number; identityCount: number }>;
  };
  sessions: {
    staleDays: number;
    totals: {
      sessionCount: number;
      riskSessionCount: number;
      expiredSessionCount: number;
      staleSessionCount: number;
      disabledUserSessionCount: number;
      unknownUserSessionCount: number;
    };
    recentRiskSessions: AdminSessionRiskItem[];
    cleanupOperations: {
      riskRevokeRunCount: number;
      riskRevokeDryRunCount: number;
      riskRevokeMutationCount: number;
      riskRevokeMatchedCount: number;
      riskRevokeRevokedCount: number;
      latestRiskRevokeAt?: string;
      singleSessionRevocationCount: number;
      userSessionRevocationRunCount: number;
      recentRiskRevokeRuns: Array<{
        auditLogId: string;
        actorUserId?: string;
        createdAt: string;
        staleDays: number;
        dryRun: boolean;
        reasons: string[];
        matched: number;
        revoked: number;
      }>;
    };
  };
  passwordResets: {
    activeCount: number;
    expiredUnusedCount: number;
  };
  emailOutbox: {
    messageCount: number;
    statusCounts: Record<string, number>;
    webhookConfigured: boolean;
    retryableCount: number;
    oldestRetryableAgeSeconds?: number;
    recentRetryableMessages: Array<Pick<EmailOutboxMessage, "id" | "to" | "subject" | "status" | "provider" | "createdAt" | "updatedAt" | "sentAt" | "error" | "metadata">>;
  };
  identities: {
    identityCount: number;
    providerCounts: Record<string, number>;
  };
}

export interface AdminAuthConnectionTestResult {
  provider: "oidc" | "scim";
  testedAt: string;
  ok: boolean;
  status: "passed" | "blocked" | "failed";
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
  }>;
}

export interface AdminEmailOutboxRetryAllResult {
  dryRun: boolean;
  limit: number;
  statuses: string[];
  matched: number;
  retried: number;
  planned: number;
  delivered: number;
  failed: number;
  skipped: number;
}

export interface AdminAssetStorageInfo {
  assetCount: number;
  activeAssetCount: number;
  usedBytes: number;
  allBytes: number;
  providerCounts: Record<string, number>;
  lifecycleCounts: Record<string, number>;
  runtime: {
    provider: string;
    migrationTargetProvider: string;
    invalidConfig: string[];
    invalidUrlConfig: string[];
    insecureUrlConfig: string[];
    missingTokenConfig: string[];
    s3?: {
      configuredProvider: string;
      active: boolean;
      bucketConfigured: boolean;
      endpointConfigured: boolean;
      endpointValid: boolean;
      endpointInsecureInProduction: boolean;
      regionConfigured: boolean;
      forcePathStyle: boolean;
      explicitCredentialsConfigured: boolean;
      partialExplicitCredentials: boolean;
    };
    quota: {
      enabled: boolean;
      quotaBytes?: number;
      quotaPolicyMissingInProduction: boolean;
    };
    lifecycle: {
      retentionDays?: number;
      retentionPolicyMissingInProduction: boolean;
    };
    delivery: {
      mode: string;
      cdnConfigured: boolean;
      publicUrlConfigured: boolean;
      signingSecretConfigured: boolean;
      signingSecretRequired: boolean;
      defaultTtlSeconds: number;
      maxTtlSeconds: number;
      purgeWebhookConfigured: boolean;
      purgeWebhookTokenConfigured: boolean;
      purgeTimeoutMs: number;
    };
    trustScanner: {
      builtinEnabled: boolean;
      externalConfigured: boolean;
      tokenConfigured: boolean;
      failClosed: boolean;
      timeoutMs: number;
    };
    cleanup: {
      enabled: boolean;
      running: boolean;
      dryRun?: boolean;
      includeDeleted?: boolean;
      includeExpired?: boolean;
      graceDays?: number;
      intervalSeconds?: number;
      runOnStart?: boolean;
      riskyConfig: string[];
    };
  };
  operations: {
    actionRequired: boolean;
    actionReasons: string[];
    remediationQueue: Array<{
      code: string;
      severity: "warning" | "error";
      action: string;
      affectedCount: number;
      bytes?: number;
      samples?: Array<Record<string, unknown>>;
    }>;
    quota: {
      enabled: boolean;
      quotaBytes?: number;
      atRiskCampaigns: Array<{ campaignId: string; usedBytes: number; quotaBytes: number; usageRatio: number; remainingBytes: number }>;
    };
    cleanupBacklog: {
      assetCount: number;
      bytes: number;
      oldestEligibleAgeSeconds?: number;
      deletedAssetCount: number;
      expiredAssetCount: number;
      assets: Array<{
        assetId: string;
        name: string;
        campaignId: string;
        provider: string;
        sizeBytes: number;
        reason: string;
        lifecycleStatus: string;
        expiresAt?: string;
        eligibleAgeSeconds?: number;
      }>;
    };
    migrationBacklog: {
      targetProvider: string;
      assetCount: number;
      bytes: number;
      providerCounts: Record<string, number>;
      assets: Array<{
        assetId: string;
        name: string;
        campaignId: string;
        fromProvider: string;
        toProvider: string;
        sizeBytes: number;
        lifecycleStatus: string;
        reason: string;
      }>;
    };
    hygiene: {
      managedAssetCount: number;
      missingStorageRefs: number;
      unscannedAssets: number;
      trustWarningAssets: number;
      trustWarningSamples: Array<{
        assetId: string;
        campaignId: string;
        name: string;
        sizeBytes: number;
        lifecycleStatus: string;
        provider: string;
        scanner?: string;
        scannedAt?: string;
        findingCount: number;
        highestSeverity: "medium" | "high";
        findingCodes: string[];
      }>;
    };
    maintenanceOperations: {
      totalRunCount: number;
      dryRunCount: number;
      mutationRunCount: number;
      changedRunCount: number;
      failedRunCount: number;
      latestRunAt?: string;
      migration: AdminAssetMaintenanceRollup;
      cleanup: AdminAssetMaintenanceRollup;
      quarantine: AdminAssetMaintenanceRollup;
      recentRuns: AdminAssetMaintenanceRun[];
    };
    delivery: {
      warnings: Array<{ code: string; severity: "warning" | "error"; message: string; env?: string[] }>;
      posture: {
        mode: string;
        cdnConfigured: boolean;
        signingSecretConfigured: boolean;
        activeManagedAssetCount: number;
        deliverableActiveAssetCount: number;
        undeliverableActiveAssetCount: number;
        expiredActiveAssetCount: number;
        deliverableActiveBytes: number;
        undeliverableActiveBytes: number;
        deliverableCoverageRate: number;
        cdnEligibleAssetCount: number;
        signedUrlEligibleAssetCount: number;
        undeliverableSamples: Array<{
          assetId: string;
          name: string;
          campaignId: string;
          provider: string;
          sizeBytes: number;
          lifecycleStatus: string;
          expiresAt?: string;
          storageDeletedAt?: string;
          reason: string;
        }>;
        deliverableSamples: Array<{
          assetId: string;
          name: string;
          campaignId: string;
          provider: string;
          sizeBytes: number;
          lifecycleStatus: string;
          expiresAt?: string;
          storageDeletedAt?: string;
          reason: string;
        }>;
      };
      runtime: {
        totalCount: number;
        servedCount: number;
        deniedCount: number;
        unavailableCount: number;
        missingBytesCount: number;
        signingFailedCount: number;
        failureCount: number;
        servedBytes: number;
        failedBytes: number;
        statusCounts: Record<string, number>;
        accessModeCounts: Record<string, number>;
        recent: Array<{
          id: string;
          assetId?: string;
          campaignId?: string;
          status: string;
          accessMode: string;
          reason?: string;
          provider?: string;
          lifecycleStatus?: string;
          bytes: number;
          createdAt: string;
        }>;
        recentFailures: Array<{
          id: string;
          assetId?: string;
          campaignId?: string;
          status: string;
          accessMode: string;
          reason?: string;
          provider?: string;
          lifecycleStatus?: string;
          bytes: number;
          createdAt: string;
        }>;
      };
      purgeOperations: {
        totalCount: number;
        purgedCount: number;
        failedCount: number;
        notConfiguredCount: number;
        recent: Array<{
          id: string;
          assetId?: string;
          campaignId?: string;
          requestedByUserId?: string;
          status: string;
          reason?: string;
          cdnUrl?: string;
          error?: string;
          createdAt: string;
        }>;
      };
    };
  };
  campaigns: Array<{
    campaignId: string;
    assetCount: number;
    activeAssetCount: number;
    usedBytes: number;
    allBytes: number;
    quotaBytes?: number;
    remainingBytes?: number;
    lifecycleCounts: Record<string, number>;
    providerCounts: Record<string, number>;
    largestAssets: Array<{
      id: string;
      campaignId: string;
      name: string;
      sizeBytes: number;
      provider: string;
      lifecycleStatus: string;
      expiresAt?: string;
    }>;
  }>;
}

export interface AdminAssetMaintenanceRun {
  id: string;
  operation: "migration" | "cleanup" | "quarantine";
  campaignId?: string;
  requestedByUserId?: string;
  dryRun: boolean;
  changed: boolean;
  assetCount: number;
  matched: number;
  migrated: number;
  archived: number;
  deleted: number;
  missingMarked: number;
  planned: number;
  skipped: number;
  failed: number;
  targetProvider?: string;
  graceDays?: number;
  reason?: string;
  createdAt: string;
}

export interface AdminAssetMaintenanceRollup {
  runCount: number;
  dryRunCount: number;
  mutationRunCount: number;
  changedRunCount: number;
  failedRunCount: number;
  assetCount: number;
  matched: number;
  migrated: number;
  archived: number;
  deleted: number;
  missingMarked: number;
  planned: number;
  skipped: number;
  failed: number;
  latestRunAt?: string;
  recentRuns: AdminAssetMaintenanceRun[];
}

export interface AdminAssetIntegrityReport {
  provider: string;
  assetCount: number;
  verified: number;
  missing: number;
  mismatched: number;
  cleanupEligible: number;
  skipped: number;
  failed: number;
  actionRequired: number;
  actionReasons: string[];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
  healthy: boolean;
  results: Array<{
    assetId: string;
    name: string;
    campaignId: string;
    provider: string;
    status: "verified" | "missing" | "mismatched" | "cleanup_eligible" | "skipped" | "failed";
    reason?: string;
    expectedSizeBytes?: number;
    actualSizeBytes?: number;
    expectedChecksum?: string;
    actualChecksum?: string;
  }>;
}

export interface AdminAssetIntegrityQuarantineResult {
  dryRun: boolean;
  assetCount: number;
  matched: number;
  archived: number;
  planned: number;
  skipped: number;
  failed: number;
  changed: boolean;
  reason: string;
}

export interface AdminRenderingOperations {
  generatedAt: string;
  budget: {
    maxPolygonVertexBudget: number;
    totalPolygonVertexBudget: number;
    maxPolygonVertexCount: number;
    polygonVertexCount: number;
    maxPolygonUsageRatio: number;
    totalPolygonUsageRatio: number;
    maxPolygonExceeded: boolean;
    totalPolygonExceeded: boolean;
    scenesExceedingMaxPolygonBudget: number;
    scenesExceedingTotalPolygonBudget: number;
  };
  featureCoverage: {
    sceneCount: number;
    scenesWithPolygonFogCount: number;
    scenesWithSmoothFogCount: number;
    scenesWithTerrainWallsCount: number;
    scenesWithColoredLightsCount: number;
    scenesWithDimmedLightsCount: number;
    scenesWithDualZoneLightsCount: number;
    scenesWithTokenVisionCount: number;
    scenesWithDualZoneTokenVisionCount: number;
    polygonFogCoverageRate: number;
    smoothFogCoverageRate: number;
    terrainWallCoverageRate: number;
    coloredLightCoverageRate: number;
    dimmedLightCoverageRate: number;
    dualZoneLightCoverageRate: number;
    tokenVisionCoverageRate: number;
    dualZoneTokenVisionCoverageRate: number;
    productionFeatureSceneCount: number;
    requiredFeatures: Array<{
      code: string;
      label: string;
      sceneCount: number;
      coverageRate: number;
      samples: AdminRenderingFeatureSample[];
      present: boolean;
    }>;
    missingRequiredFeatureCodes: string[];
    complete: boolean;
    samples: {
      polygonFog: AdminRenderingFeatureSample[];
      smoothFog: AdminRenderingFeatureSample[];
      terrainWalls: AdminRenderingFeatureSample[];
      coloredLights: AdminRenderingFeatureSample[];
      dimmedLights: AdminRenderingFeatureSample[];
      dualZoneLights: AdminRenderingFeatureSample[];
      dualZoneTokenVision: AdminRenderingFeatureSample[];
      tokenVision: AdminRenderingFeatureSample[];
    };
  };
  authoringOperations: {
    totalCount: number;
    fogOperationCount: number;
    wallOperationCount: number;
    lightOperationCount: number;
    sceneCount: number;
    actionCounts: Record<string, number>;
    targetTypeCounts: Record<string, number>;
    actorUserCounts: Record<string, number>;
    recent: Array<{
      id: string;
      action: string;
      targetType?: string;
      targetId?: string;
      sceneId?: string;
      sceneName?: string;
      campaignId?: string;
      campaignName?: string;
      actorUserId?: string;
      createdAt: string;
    }>;
    scenes: Array<{
      sceneId: string;
      sceneName?: string;
      campaignId?: string;
      campaignName?: string;
      count: number;
      lastAuthoredAt?: string;
      actionCounts: Record<string, number>;
    }>;
  };
  failedAuthoringOperations: {
    actionRequired: boolean;
    failureCount: number;
    byAction: Record<string, number>;
    byReason: Record<string, number>;
    byTargetType: Record<string, number>;
    recentFailures: Array<{
      id: string;
      attemptedAction: string;
      targetType?: string;
      targetId?: string;
      sceneId?: string;
      sceneName?: string;
      campaignId?: string;
      campaignName?: string;
      actorUserId?: string;
      reason: string;
      message: string;
      createdAt: string;
    }>;
  };
  staleIssueOperations: {
    sceneCount: number;
    issueCount: number;
    actionRequired: boolean;
    scenes: Array<{
      sceneId: string;
      sceneName: string;
      campaignId: string;
      campaignName: string;
      issueCount: number;
      actionReasons: string[];
      topIssueCodes: Array<{ code: string; count: number }>;
      topIssue?: AdminRenderingIssue;
      lastAuthoredAt?: string;
      authoringCount: number;
    }>;
  };
  totals: {
    sceneCount: number;
    campaignCount: number;
    sceneActionRequiredCount: number;
    fogRegionCount: number;
    wallCount: number;
    terrainWallCount: number;
    degenerateWallCount: number;
    lightCount: number;
    tokenVisionSourceCount: number;
    polygonVertexCount: number;
    maxPolygonVertexCount: number;
    issueCount: number;
  };
  issueSeverityCounts: Record<string, number>;
  issueCodeCounts: Record<string, number>;
  topIssues: AdminRenderingIssue[];
  actionRequired: boolean;
  actionReasons: string[];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedSceneCount: number;
    issueCount: number;
    sampleScenes: Array<{
      sceneId: string;
      sceneName: string;
      campaignId: string;
      campaignName: string;
      issueCount: number;
      topTarget?: { targetType: string; targetId: string };
    }>;
  }>;
  scenesRequiringAction: Array<{
    sceneId: string;
    sceneName: string;
    campaignId: string;
    campaignName: string;
    actionRequired: boolean;
    actionReasons: string[];
    counts: {
      issueCount: number;
      fogRegionCount: number;
      wallCount: number;
      lightCount: number;
      polygonVertexCount: number;
      maxPolygonVertexCount: number;
      terrainWallCount: number;
      degenerateWallCount: number;
    };
    issueSeverityCounts: Record<string, number>;
    topIssueCodes: Array<{ code: string; count: number }>;
    topIssues: AdminRenderingIssue[];
    budget: {
      maxPolygonVertexBudget: number;
      totalPolygonVertexBudget: number;
      maxPolygonVertexCount: number;
      polygonVertexCount: number;
      maxPolygonUsageRatio: number;
      totalPolygonUsageRatio: number;
      maxPolygonExceeded: boolean;
      totalPolygonExceeded: boolean;
    };
  }>;
}

export interface AdminRenderingFeatureSample {
  sceneId: string;
  sceneName: string;
  campaignId: string;
  campaignName: string;
  polygonFogCount: number;
  smoothFogCount: number;
  terrainWallCount: number;
  coloredLightCount: number;
  dimmedLightCount: number;
  dualZoneLightCount: number;
  dualZoneTokenVisionCount: number;
  tokenVisionSourceCount: number;
}

export interface AdminRenderingIssue {
  sceneId?: string;
  sceneName?: string;
  campaignId?: string;
  campaignName?: string;
  code: string;
  severity: "warning" | "error";
  targetType: string;
  targetId: string;
  message: string;
  duplicateOf?: string;
  intersectsWith?: string;
  intensity?: number;
  maxPolygonVertexCount?: number;
  polygonVertexCount?: number;
  point?: { x: number; y: number };
}

export interface AdminSystemOperations {
  generatedAt: string;
  actionRequired: boolean;
  actionReasons: string[];
  totals: {
    installedSystemCount: number;
    activeCampaignCount: number;
    actorCount: number;
    itemCount: number;
    systemsWithActors: number;
    systemsWithContentIssues: number;
    issueCount: number;
  };
  productionReadiness: {
    primarySystemId: string;
    productionReadySystemCount: number;
    demoSystemCount: number;
    nonPrimaryActiveCampaignCount: number;
    nonPrimaryActorCount: number;
    nonPrimaryItemCount: number;
    systemsNeedingProductionDepth: string[];
    actionRequired: boolean;
  };
  activeSystemCounts: Record<string, number>;
  actorSystemCounts: Record<string, number>;
  itemSystemCounts: Record<string, number>;
  activityOperations: {
    activityCount: number;
    nonPrimaryActivityCount: number;
    systemsWithRecentActivity: string[];
    actionCounts: Record<string, number>;
    nonPrimaryActionCounts: Record<string, number>;
    systemCounts: Record<string, number>;
    nonPrimarySystemCounts: Record<string, number>;
    recentActivity: AdminSystemActivityInfo[];
    recentNonPrimaryActivity: AdminSystemActivityInfo[];
  };
  productionGapCounts: Array<{
    code: string;
    severity: "warning" | "critical";
    message: string;
    remediation: string;
    count: number;
    systems: Array<{
      id: string;
      name: string;
      activeCampaignCount: number;
      actorCount: number;
      itemCount: number;
    }>;
  }>;
  promotionBlockers: Array<{
    systemId: string;
    name: string;
    activeCampaignCount: number;
    actorCount: number;
    itemCount: number;
    blockerCount: number;
    criticalBlockerCount: number;
    blockers: Array<{
      code: string;
      severity: "warning" | "critical";
      message: string;
      remediation: string;
    }>;
  }>;
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "critical";
    action: string;
    affectedCount: number;
    message: string;
    samples: Array<{
      systemId: string;
      name: string;
      activeCampaignCount: number;
      actorCount: number;
      itemCount: number;
    }>;
  }>;
  systems: Array<{
    id: string;
    name: string;
    version: string;
    compatibleCore: string;
    readiness: {
      tier: "primary" | "demo";
      productionReady: boolean;
      actionRequired: boolean;
      reasons: string[];
    };
    usage: {
      activeCampaignCount: number;
      actorCount: number;
      itemCount: number;
      actorTypeCounts: Record<string, number>;
      campaignIds: string[];
    };
    manifest: {
      hasClientEntrypoint: boolean;
      hasServerEntrypoint: boolean;
      hasActorSchema: boolean;
      hasItemSchema: boolean;
      permissionCount: number;
      permissions: string[];
    };
    coverage: {
      characterTemplateCount: number;
      compendiumEntryCount: number;
      compendiumTypeCounts: Record<string, number>;
      conditionEntryCount: number;
      encounterThreatCount: number;
      supportsOrigins: boolean;
      supportsMonsterCreation: boolean;
      supportsEquipmentPurchase: boolean;
      supportsCharacterImport: boolean;
      supportsAdvancement: boolean;
      supportsRest: boolean;
      supportsEncounterPlanning: boolean;
      supportsCompendium: boolean;
      capabilityEvidence: {
        origins: { count: number; samples: string[] };
        monsterCreation: { count: number; samples: string[] };
        equipmentPurchase: { count: number; samples: string[] };
      };
    };
    productionCapability: {
      capabilityCount: number;
      supportedCapabilityCount: number;
      coverageRate: number;
      missingCapabilities: Array<{
        code: string;
        label: string;
        remediation: string;
      }>;
      capabilities: Array<{
        code: string;
        label: string;
        supported: boolean;
        evidenceCount: number;
        evidenceSamples?: string[];
        remediation: string;
      }>;
    };
    issues: string[];
    productionGaps: string[];
  }>;
}

export interface AdminSystemActivityInfo {
  auditLogId: string;
  action: string;
  campaignId?: string;
  actorUserId?: string;
  systemId?: string;
  systemName?: string;
  productionReady: boolean;
  actorId?: string;
  actorType?: string;
  rollId?: string;
  label?: string;
  restType?: string;
  optionId?: string;
  consumeResources: boolean;
  applyEffect: boolean;
  hasUsage: boolean;
  hasEffect: boolean;
  createdAt: string;
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

export interface AdminPluginOperations {
  generatedAt: string;
  actionRequired: boolean;
  actionReasons: string[];
  policy: {
    review: "allow_unreviewed" | "require_approved";
    trust: string;
  };
  totals: {
    catalogPluginCount: number;
    packageCount: number;
    loadErrorCount: number;
    installedGrantCount: number;
    healthyInstalledCount: number;
    blockedInstalledCount: number;
    missingInstalledCount: number;
    permissionDriftCount: number;
    incompatiblePackageCount: number;
    incompatibleInstalledCount: number;
    storageEntryCount: number;
    commandAuditCount: number;
    installAuditCount: number;
  };
  reviews: AdminPluginReviewSnapshot["totals"];
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
  reviewOperations: {
    actionRequired: boolean;
    actionReasons: string[];
    remediation: string;
    approvalCoverageRate: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    blockedCount: number;
    oldestPendingAgeDays?: number;
    sourceCounts: Record<string, number>;
    pendingSamples: AdminPluginReviewOperationSample[];
    approvedSamples: AdminPluginReviewOperationSample[];
    rejectedSamples: AdminPluginReviewOperationSample[];
    blockedSamples: AdminPluginReviewOperationSample[];
  };
  securityPosture: {
    actionRequired: boolean;
    actionReasons: string[];
    remediation: string;
    runtimeConfig: {
      trustPolicy: "allow_unsigned" | "require_trusted";
      trustKeyCount: number;
      trustKeysConfigured: boolean;
      allowUnsignedInProduction: boolean;
      trustedModeWithoutKeys: boolean;
    };
    vmSandboxPackageCount: number;
    manifestOnlyPackageCount: number;
    commandCapablePackageCount: number;
    manifestOnlyCommandPackageCount: number;
    trustedPackageCount: number;
    unsignedPackageCount: number;
    untrustedPackageCount: number;
    trustBlockedPackageCount: number;
    unsignedSamples: AdminPluginSecuritySample[];
    untrustedSamples: AdminPluginSecuritySample[];
    nonVmCommandSamples: AdminPluginSecuritySample[];
  };
  inventoryOperations: {
    actionRequired: boolean;
    actionReasons: string[];
    duplicateVersionCount: number;
    duplicatePackageCount: number;
    duplicateVersions: Array<{
      pluginId: string;
      name: string;
      version: string;
      packageCount: number;
      packageIds: string[];
      sourceTypes: string[];
      registryUrls: string[];
    }>;
  };
  compatibilityOperations: {
    actionRequired: boolean;
    coreVersion: string;
    incompatiblePackageCount: number;
    incompatibleInstalledCount: number;
    packages: Array<{ pluginId: string; name: string; version: string; packageId: string; sourceType: string; compatibleCore: string }>;
    installed: Array<{ campaignId: string; pluginId: string; installedVersion?: string; compatibleCore?: string }>;
  };
  permissionDrift: Array<{
    campaignId: string;
    pluginId: string;
    name: string;
    installedVersion?: string;
    missingPermissions: string[];
    grantedPermissionCount: number;
    requestedPermissionCount: number;
  }>;
  registryOperations: {
    actionRequired: boolean;
    actionReasons: string[];
    runtimeConfig: {
      configuredEntryCount: number;
      validConfiguredCount: number;
      invalidUrlConfig: string[];
      invalidUrlCount: number;
      insecureUrlConfig: string[];
      insecureUrlCount: number;
      invalidNumericConfig: string[];
    };
    configuredRegistryCount: number;
    syncedPackageCount: number;
    staleThresholdSeconds: number;
    staleConfiguredRegistryCount: number;
    oldestSyncAgeSeconds: number;
    staleConfiguredRegistries: Array<{
      registryUrl: string;
      status: "never_synced" | "failed" | "synced";
      syncedPackageCount: number;
      lastSyncAt?: string;
      syncAgeSeconds: number;
    }>;
    unconfiguredRegistryPackageCount: number;
    unconfiguredPackages: Array<{ pluginId: string; name: string; version: string; packageId: string; registryUrl: string; syncedAt?: string }>;
    packageCountByRegistry: Record<string, number>;
    configured: Array<{
      registryUrl: string;
      status: "never_synced" | "failed" | "synced";
      syncedPackageCount: number;
      lastSyncAt?: string;
      syncAgeSeconds?: number;
      stale: boolean;
      lastImported: string[];
      lastErrors: string[];
    }>;
  };
  storage: {
    entryCount: number;
    byPlugin: Record<string, number>;
    byCampaign: Record<string, number>;
    largestEntries: AdminPluginStoragePressureEntry[];
    nearLimitEntries: AdminPluginStoragePressureEntry[];
    nearLimitBytes: number;
    maxValueBytes: number;
  };
  storageOperations: {
    operationCount: number;
    directSetCount: number;
    directDeleteCount: number;
    commandMutationCount: number;
    setMutationCount: number;
    deleteMutationCount: number;
    deletedEntryCount: number;
    byPlugin: Record<string, number>;
    byCampaign: Record<string, number>;
    recentOperations: Array<{
      id: string;
      campaignId?: string;
      pluginId?: string;
      actorType: "user" | "plugin" | "system";
      actorUserId?: string;
      operation: "set" | "delete" | "command_mutation";
      key?: string;
      sizeBytes?: number;
      deleted?: boolean;
      setCount: number;
      deleteCount: number;
      createdAt: string;
    }>;
  };
  commandOperations: {
    actionRequired: boolean;
    commandCount: number;
    failedCommandCount: number;
    recentCommandCount: number;
    recentFailureCount: number;
    storageMutatingCommandCount: number;
    byPlugin: Record<string, number>;
    failedByPlugin: Record<string, number>;
    failedByReason: Record<string, number>;
    byCampaign: Record<string, number>;
    recentFailures: Array<{
      id: string;
      campaignId?: string;
      pluginId?: string;
      command?: string;
      reason?: string;
      message?: string;
      packageId?: string;
      version?: string;
      sandbox?: string;
      createdAt: string;
    }>;
  };
  installOperations: {
    installCount: number;
    versionChangeCount: number;
    rollbackCount: number;
    permissionReviewCount: number;
    byPlugin: Record<string, number>;
    byCampaign: Record<string, number>;
    recentInstalls: Array<{
      id: string;
      campaignId?: string;
      pluginId?: string;
      actorUserId?: string;
      operation: "install" | "upgrade" | "rollback" | "permission_review";
      packageId?: string;
      version?: string;
      sandbox?: string;
      grantedPermissionCount: number;
      requestedPermissionCount: number;
      missingPermissionCount: number;
      createdAt: string;
    }>;
  };
  recentCommands: Array<{
    id: string;
    campaignId?: string;
    pluginId?: string;
    command?: string;
    packageId?: string;
    version?: string;
    sandbox?: string;
    storageMutation: {
      set: number;
      deleted: number;
    };
    createdAt: string;
  }>;
  loadErrors: Array<{ packagePath: string; errors: string[] }>;
}

export interface AdminPluginStoragePressureEntry {
  id: string;
  campaignId: string;
  pluginId: string;
  key: string;
  sizeBytes: number;
  updatedByType: "user" | "plugin";
  updatedAt: string;
}

export interface AdminPluginSecuritySample {
  pluginId: string;
  name: string;
  version: string;
  packageId: string;
  sandbox: "vm" | "manifest-only";
  trustStatus: string;
  installable: boolean;
  errors: string[];
}

export interface AdminPluginReviewOperationSample {
  reviewKey: string;
  pluginId: string;
  name: string;
  version: string;
  packageId: string;
  sourceType: string;
  status: PluginReviewStatus;
  installBlock?: string;
  createdAt: string;
  ageDays: number;
}

export interface AdminScimGroupRoleMapping extends ScimGroupRoleMapping {
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds">;
}

export interface AdminScimGroupRoleMappingInput {
  campaignId: string;
  role: ScimAssignableRole;
  groupId?: string;
  groupExternalId?: string;
  groupDisplayName?: string;
}

export interface AdminScimGroupRoleMappingResult {
  mapping: AdminScimGroupRoleMapping;
  sync: {
    matchedGroups: number;
    createdMemberships: number;
    updatedMemberships: number;
    removedMemberships: number;
    preservedManualMemberships: number;
  };
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
  summary: {
    actionRequired: boolean;
    actionReasons: string[];
    remediationQueue: Array<{
      code: string;
      severity: "warning";
      action: string;
      affectedCount: number;
      samples?: Array<Record<string, unknown>>;
    }>;
    byAction: Array<{ code: string; count: number }>;
    byTargetType: Array<{ code: string; count: number }>;
    byActorType: Array<{ code: string; count: number }>;
    byCampaign: Array<{ code: string; count: number }>;
    adminActionCount: number;
    oldestReturnedAt?: string;
    newestReturnedAt?: string;
    truncated: boolean;
  };
  auditLogs: AuditLog[];
}

export interface AdminStorageOperations {
  provider: string;
  supported: boolean;
  database?: {
    fileName: string;
    sizeBytes: number;
    jsonRecordModel: boolean;
  };
  migrations?: {
    expectedVersions: number[];
    applied: Array<{ version: number; name: string; appliedAt: string }>;
    latestAppliedVersion: number;
    missingVersions: number[];
  };
  integrity?: {
    checkedAt: string;
    ok: boolean;
    result: string;
  };
  records?: {
    total: number;
    collections: Array<{ collection: string; count: number }>;
  };
  indexes?: {
    required: string[];
    present: string[];
    missing: string[];
  };
  backups?: {
    directoryName: string;
    latest?: { fileName: string; sizeBytes: number; createdAt: string };
  };
  scheduledBackups?: {
    enabled: boolean;
    running: boolean;
    runOnStart: boolean;
    reason: string;
    intervalSeconds?: number;
    lastRun?: {
      trigger: "startup" | "interval";
      status: "succeeded" | "failed" | "skipped";
      startedAt: string;
      completedAt: string;
      fileName?: string;
      sizeBytes?: number;
      reason?: string;
      error?: string;
    };
  };
  actionRequired: boolean;
  actionReasons: string[];
  remediation?: string;
}

export interface AdminStorageBackupResult {
  status: "created";
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  reason?: string;
}

export interface AdminStorageRestoreDrillResult {
  status: "passed" | "failed";
  checkedAt: string;
  backup?: { fileName: string; sizeBytes: number; createdAt: string };
  integrity?: { checkedAt: string; ok: boolean; result: string };
  campaignCount?: number;
  recordCount?: number;
  collections?: Array<{ collection: string; count: number }>;
  error?: string;
}

export interface AdminStorageRestoreResult extends AdminStorageRestoreDrillResult {
  restoredAt?: string;
  reason?: string;
}

export interface AdminJob {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: unknown;
  output?: unknown;
  error?: string;
  progress?: {
    current?: number;
    total?: number;
    percent?: number;
    message?: string;
  };
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledByUserId?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  logs: Array<{ at: string; level: "info" | "warning" | "error"; message: string; details?: Record<string, unknown> }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminJobOperations {
  generatedAt: string;
  actionRequired: boolean;
  actionReasons: string[];
  thresholds: {
    staleHeartbeatSeconds: number;
    staleQueuedSeconds: number;
  };
  totals: {
    totalCount: number;
    byStatus: Record<JobStatus, number>;
    byType: Record<JobType, number>;
    retryableCount: number;
    exhaustedCount: number;
  };
  queue: {
    oldestQueuedAt?: string;
    maxQueueAgeSeconds: number;
    staleQueuedCount: number;
    recentQueued: Array<Record<string, unknown>>;
  };
  leases: {
    runningCount: number;
    leasedWorkerCount: number;
    expiredCount: number;
    staleHeartbeatCount: number;
    workers: Array<{
      workerId: string;
      runningCount: number;
      lastHeartbeatAt?: string;
      expiredLeaseCount: number;
      staleHeartbeatCount: number;
    }>;
    expired: Array<Record<string, unknown>>;
    staleHeartbeats: Array<Record<string, unknown>>;
  };
  failures: {
    failedCount: number;
    retryableCount: number;
    exhaustedCount: number;
    recentFailed: Array<Record<string, unknown>>;
  };
  throughput: {
    succeededCount: number;
    cancelledCount: number;
    newestCompletedAt?: string;
  };
  remediationQueue: Array<{
    code: string;
    severity: "warning" | "error";
    action: string;
    affectedCount: number;
    samples?: Array<Record<string, unknown>>;
  }>;
}

export interface AdminJobAlertResult {
  status: "dry_run" | "delivered" | "skipped" | "failed";
  configured: boolean;
  actionRequired: boolean;
  actionReasons: string[];
  remediationCount: number;
  generatedAt: string;
  deliveredAt?: string;
  webhookStatus?: number;
  reason?: string;
  error?: string;
}

export interface AdminSnapshot {
  users: AdminUserInfo[];
  sessions: AdminSessionInfo[];
  emailOutbox: EmailOutboxMessage[];
  audit: AdminAuditLogExport;
  jobs: AdminJob[];
  jobOperations: AdminJobOperations;
  authOperations: AdminAuthOperations;
  storageOperations: AdminStorageOperations;
  assetStorage: AdminAssetStorageInfo;
  assetIntegrity: AdminAssetIntegrityReport;
  renderingOperations: AdminRenderingOperations;
  systemOperations: AdminSystemOperations;
  aiOperations: AdminAiOperations;
  pluginReviews: AdminPluginReviewSnapshot;
  pluginOperations: AdminPluginOperations;
  scimGroupRoleMappings: AdminScimGroupRoleMapping[];
}

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const [users, sessions, emailOutbox, audit, jobs, jobOperations, authOperations, storageOperations, assetStorage, assetIntegrity, renderingOperations, systemOperations, aiOperations, pluginReviews, pluginOperations, scimGroupRoleMappings] = await Promise.all([
    apiGet<AdminUserInfo[]>("/api/v1/admin/users"),
    apiGet<AdminSessionInfo[]>("/api/v1/admin/sessions"),
    apiGet<EmailOutboxMessage[]>("/api/v1/admin/email-outbox"),
    apiGet<AdminAuditLogExport>("/api/v1/admin/audit-logs?limit=12"),
    apiGet<AdminJob[]>("/api/v1/admin/jobs?limit=12"),
    apiGet<AdminJobOperations>("/api/v1/admin/jobs/operations"),
    apiGet<AdminAuthOperations>("/api/v1/admin/auth/operations"),
    apiGet<AdminStorageOperations>("/api/v1/admin/storage/operations"),
    apiGet<AdminAssetStorageInfo>("/api/v1/admin/assets/storage"),
    apiGet<AdminAssetIntegrityReport>("/api/v1/admin/assets/integrity"),
    apiGet<AdminRenderingOperations>("/api/v1/admin/rendering/operations"),
    apiGet<AdminSystemOperations>("/api/v1/admin/systems/operations"),
    apiGet<AdminAiOperations>("/api/v1/admin/ai/operations"),
    apiGet<AdminPluginReviewSnapshot>("/api/v1/admin/plugins/reviews"),
    apiGet<AdminPluginOperations>("/api/v1/admin/plugins/operations"),
    apiGet<AdminScimGroupRoleMapping[]>("/api/v1/admin/scim/group-role-mappings")
  ]);
  return { users, sessions, emailOutbox, audit, jobs, jobOperations, authOperations, storageOperations, assetStorage, assetIntegrity, renderingOperations, systemOperations, aiOperations, pluginReviews, pluginOperations, scimGroupRoleMappings };
}

type DisplayMapAsset = MapAsset & { deliveryUrl?: string };

export function assetBlobUrl(asset: MapAsset): string {
  const displayAsset = asset as DisplayMapAsset;
  const url = displayAsset.deliveryUrl ?? asset.url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${baseUrl}${url}`;
}

async function assetDeliveryUrl(assetId: string): Promise<{ url: string; expiresAt: string }> {
  return apiPost<{ url: string; expiresAt: string }>(`/api/v1/assets/${assetId}/delivery-url`, { expiresInSeconds: 300, disposition: "inline" });
}

async function withAssetDeliveryUrls(assets: MapAsset[]): Promise<MapAsset[]> {
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset.url.startsWith("/api/v1/assets/")) return asset;
      try {
        const delivery = await assetDeliveryUrl(asset.id);
        return { ...asset, deliveryUrl: delivery.url } satisfies DisplayMapAsset;
      } catch {
        return asset;
      }
    })
  );
}

export async function apiUploadAsset(input: { campaignId: string; sceneId?: string; file: File; setAsBackground?: boolean; folder?: string; tags?: string[] }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const params = new URLSearchParams();
  if (input.sceneId) params.set("sceneId", input.sceneId);
  if (input.setAsBackground) params.set("setAsBackground", "true");
  const response = await fetch(`${baseUrl}/api/v1/campaigns/${input.campaignId}/assets/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-asset-name": encodeURIComponent(input.file.name),
      ...(input.folder ? { "x-asset-folder": encodeURIComponent(input.folder) } : {}),
      ...(input.tags && input.tags.length > 0 ? { "x-asset-tags": encodeURIComponent(input.tags.join(",")) } : {}),
      ...(await sessionHeaders())
    },
    body: input.file
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ asset: MapAsset; scene?: Scene }>;
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  const snapshotHeaders = { authorization: `Bearer ${await ensureSessionToken()}` };
  const snapshotGet = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: snapshotHeaders
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  };
  const [session, campaigns, workspaceDefaults, organizationMembers, organizationInvites] = await Promise.all([
    snapshotGet<SessionInfo>("/api/v1/auth/session"),
    snapshotGet<Campaign[]>("/api/v1/campaigns"),
    snapshotGet<OrganizationWorkspace>("/api/v1/organization/workspace-defaults"),
    snapshotGet<OrganizationMemberInfo[]>("/api/v1/organization/members"),
    snapshotGet<OrganizationInviteInfo[]>("/api/v1/organization/invites").catch(() => [])
  ]);
  const selectedCampaignId = campaigns.find((campaign) => campaign.id === campaignId)?.id ?? campaigns[0]?.id;
  if (!selectedCampaignId) {
    return {
      session,
      workspaceDefaults,
      organizations: session.organizations ?? [],
      organizationMembers,
      organizationInvites,
      campaigns,
      members: [],
      scenes: [],
      fogPresets: [],
      assets: [],
      assetStorage: undefined,
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
    };
  }
  const scenes = await snapshotGet<Scene[]>(`/api/v1/campaigns/${selectedCampaignId}/scenes`);
  const selectedSceneId = scenes.find((scene) => scene.id === sceneId)?.id ?? scenes.find((scene) => scene.active)?.id ?? scenes[0]?.id;
  const activeSceneId = scenes.find((scene) => scene.active)?.id;
  const tokenSceneIds = [...new Set([selectedSceneId, activeSceneId].filter((id): id is string => Boolean(id)))];
  const members = await snapshotGet<CampaignMemberInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/members`);
  const currentMember = members.find((member) => member.user.id === session.user.id);
  const canViewAiOperations = currentMember?.permissions.includes("ai.proposeChanges") ?? false;
  const [assets, assetStorage, fogPresets, tokens, vision, actors, items, journals, chat, rolls, diceMacros, encounters, combats, proposals, contentImports, memory, aiThreads, aiUsage, aiToolCalls, plugins, systems] = await Promise.all([
    snapshotGet<MapAsset[]>(`/api/v1/campaigns/${selectedCampaignId}/assets`),
    snapshotGet<CampaignAssetStorageInfo>(`/api/v1/campaigns/${selectedCampaignId}/assets/storage`),
    currentMember?.permissions.includes("token.reveal") ? snapshotGet<FogPreset[]>(`/api/v1/campaigns/${selectedCampaignId}/fog-presets`) : Promise.resolve([]),
    tokenSceneIds.length > 0 ? Promise.all(tokenSceneIds.map((id) => snapshotGet<Token[]>(`/api/v1/scenes/${id}/tokens`))).then((sceneTokens) => sceneTokens.flat()) : Promise.resolve([]),
    selectedSceneId ? snapshotGet<VisionSnapshot>(`/api/v1/scenes/${selectedSceneId}/vision`) : Promise.resolve(undefined),
    snapshotGet<Actor[]>(`/api/v1/campaigns/${selectedCampaignId}/actors`),
    snapshotGet<Item[]>(`/api/v1/campaigns/${selectedCampaignId}/items`),
    snapshotGet<JournalEntry[]>(`/api/v1/campaigns/${selectedCampaignId}/journal`),
    snapshotGet<ChatMessage[]>(`/api/v1/chat/messages?campaignId=${selectedCampaignId}`),
    snapshotGet<DiceRoll[]>(`/api/v1/campaigns/${selectedCampaignId}/rolls`),
    snapshotGet<DiceMacro[]>(`/api/v1/campaigns/${selectedCampaignId}/dice-macros`),
    snapshotGet<Encounter[]>(`/api/v1/campaigns/${selectedCampaignId}/encounters`),
    snapshotGet<Combat[]>(`/api/v1/campaigns/${selectedCampaignId}/combats`),
    snapshotGet<Proposal[]>(`/api/v1/campaigns/${selectedCampaignId}/proposals`),
    snapshotGet<ContentImportBatch[]>(`/api/v1/campaigns/${selectedCampaignId}/content-imports`),
    snapshotGet<AiMemoryFact[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/memory`),
    canViewAiOperations ? snapshotGet<AiThread[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/threads`) : Promise.resolve([]),
    canViewAiOperations ? snapshotGet<AiUsageSummary>(`/api/v1/campaigns/${selectedCampaignId}/ai/usage`) : Promise.resolve(undefined),
    canViewAiOperations ? snapshotGet<AiToolCall[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/tool-calls`) : Promise.resolve([]),
    snapshotGet<PluginRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/plugins`),
    snapshotGet<SystemRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems`)
  ]);
  const activeCombatId = combats.find((combat) => combat.active)?.id;
  const combatAudit = activeCombatId ? await snapshotGet<AuditLog[]>(`/api/v1/combats/${activeCombatId}/audit`) : [];
  const activeSystemId = systems.find((system) => system.active)?.id ?? systems[0]?.id;
  const characterTemplates = activeSystemId ? await snapshotGet<CharacterTemplateInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems/${activeSystemId}/character-templates`) : [];
  const displayAssets = await withAssetDeliveryUrls(assets);
  return {
    session,
    workspaceDefaults,
    organizations: session.organizations ?? [],
    organizationMembers,
    organizationInvites,
    campaigns,
    members,
    scenes,
    fogPresets,
    assets: displayAssets,
    assetStorage,
    tokens,
    vision,
    actors,
    items,
    journals,
    chat,
    rolls,
    diceMacros,
    encounters,
    combats,
    combatAudit,
    proposals,
    contentImports,
    memory,
    aiThreads,
    aiUsage,
    aiToolCalls,
    plugins,
    systems,
    characterTemplates
  };
}
