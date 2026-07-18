import type { Actor, AiEvaluationRun, AiMemoryFact, AiThread, AiToolCall, AiUsageMetrics, AudioTrack, AuditLog, CalculationOverride, Campaign, CampaignMember, CampaignPresence, ChatMessage, Combat, ContentImportBatch, DiceMacro, DiceRoll, DiceRollFairness, EmailOutboxMessage, Encounter, FogPreset, Item, JobStatus, JobType, JournalEntry, MapAsset, OrganizationMember, OrganizationMemberRole, OrganizationWorkspace, PermissionName, Proposal, Scene, ScimAssignableRole, ScimGroup, ScimGroupRoleMapping, Token, User, UserRole, UserSession, VisionSnapshot, WorldRecord, WorldRelation } from "@open-tabletop/core";
import { ApiCompatibilityError, apiBuildFingerprintIssue, apiCompatibilityIssue, type ApiHealthIdentity } from "./api-compatibility.js";

export { ApiCompatibilityError, apiBuildFingerprintIssue, apiCompatibilityIssue } from "./api-compatibility.js";

export const baseUrl = import.meta.env.VITE_API_URL ?? "";

export async function assertApiCompatibility(
  fetchHealth: typeof fetch = fetch
): Promise<void> {
  const response = await fetchHealth(`${baseUrl}/api/v1/health`, {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" }
  });
  let health: ApiHealthIdentity | undefined;
  try {
    health = await response.json() as ApiHealthIdentity;
  } catch {
    throw new ApiCompatibilityError("API health did not return a JSON identity.");
  }
  if (!response.ok) {
    const detail = typeof (health as { message?: unknown } | undefined)?.message === "string"
      ? (health as { message: string }).message
      : `API health returned HTTP ${response.status}.`;
    throw new ApiCompatibilityError(detail);
  }
  const issue = apiCompatibilityIssue(health);
  if (issue) throw new ApiCompatibilityError(`${issue} Stop the retained API or point the web dev server at the current API.`);
  const expectedBuildFingerprint = import.meta.env.DEV ? import.meta.env.VITE_EXPECTED_API_BUILD_FINGERPRINT : undefined;
  const buildIssue = expectedBuildFingerprint ? apiBuildFingerprintIssue(health, expectedBuildFingerprint) : undefined;
  if (buildIssue) throw new ApiCompatibilityError(`${buildIssue} Restart the API from this checkout or point the web dev server at the intended current API.`);
}

const legacySessionTokenKey = "otte:sessionToken";
const legacySessionTokenUserKey = "otte:sessionTokenUser";
const sessionTransportKey = "otte:sessionTransport";
const cookieSessionMarker = "otte-cookie-session";
let inMemorySessionToken = "";
let legacySessionMigrated = false;
let legacySessionUpgradePending = false;
let legacySessionUpgradePromise: Promise<void> | undefined;
let statelessDemoApiMode = false;
let sessionTransportEpoch = 0;
const seededDemoLoginRetryDelayMs = 200;

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: "include" });
}

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

export function getSessionToken(): string {
  return sessionCredentialToken() ? cookieSessionMarker : "";
}

export function getSessionTransportEpoch(): number {
  return sessionTransportEpoch;
}

export function storeSession(login: SessionLoginInfo): void {
  migrateLegacySessionToken();
  inMemorySessionToken = cookieSessionMarker;
  sessionTransportEpoch += 1;
  legacySessionUpgradePending = false;
  localStorage.setItem("otte:userId", login.user.id);
  localStorage.setItem(sessionTransportKey, "cookie");
  localStorage.removeItem(legacySessionTokenKey);
  localStorage.removeItem(legacySessionTokenUserKey);
}

export function clearSession(): void {
  inMemorySessionToken = "";
  sessionTransportEpoch += 1;
  legacySessionUpgradePending = false;
  legacySessionUpgradePromise = undefined;
  localStorage.removeItem(legacySessionTokenKey);
  localStorage.removeItem(legacySessionTokenUserKey);
  localStorage.removeItem(sessionTransportKey);
}

function migrateLegacySessionToken(): void {
  if (legacySessionMigrated) return;
  legacySessionMigrated = true;
  const token = localStorage.getItem(legacySessionTokenKey) ?? "";
  const tokenUserId = localStorage.getItem(legacySessionTokenUserKey);
  const userId = getSessionUserId();
  if (token && tokenUserId === userId) {
    inMemorySessionToken = token;
    legacySessionUpgradePending = true;
    return;
  }
  localStorage.removeItem(legacySessionTokenKey);
  localStorage.removeItem(legacySessionTokenUserKey);
}

export function setStatelessDemoApiMode(enabled: boolean): void {
  statelessDemoApiMode = enabled;
}

export async function consumeSsoRedirect(): Promise<string | undefined> {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("ssoToken");
  if (token !== cookieSessionMarker) return undefined;
  const response = await apiFetch(`${baseUrl}/api/v1/auth/session`, {
    headers: { authorization: `Bearer ${cookieSessionMarker}` },
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  const authenticated = await response.json() as { user?: { id?: string } };
  const userId = authenticated.user?.id;
  if (!userId) throw new Error("OIDC session response did not include an authenticated user.");
  inMemorySessionToken = cookieSessionMarker;
  sessionTransportEpoch += 1;
  legacySessionUpgradePending = false;
  localStorage.setItem("otte:userId", userId);
  localStorage.setItem(sessionTransportKey, "cookie");
  localStorage.removeItem(legacySessionTokenKey);
  localStorage.removeItem(legacySessionTokenUserKey);
  // Keep the callback marker available for a retry until the cookie has been
  // verified and the corresponding browser identity is safely committed.
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return userId;
}

export async function loginSession(userId = getSessionUserId(), options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<SessionLoginInfo> {
  const demoEmail = demoLoginEmail(userId);
  const requestLogin = () => apiFetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify(demoEmail ? { email: demoEmail } : { userId }),
    signal: options.signal
  });
  let response: Response;
  try {
    response = await requestLogin();
  } catch (error) {
    // Seeded demo buttons use deferred credentials, so a response lost to a
    // transient connection failure cannot commit a cookie behind the stale
    // credential ticket guard. Retry that transport failure exactly once.
    // Password login, HTTP/auth responses, persisted sessions, and aborted
    // workspace switches deliberately remain single-attempt operations.
    if (!demoEmail || options.persist !== false || !isTransientFetchFailure(error) || options.signal?.aborted) throw error;
    await waitForSeededDemoLoginRetry(options.signal);
    response = await requestLogin();
  }
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

function isTransientFetchFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

function waitForSeededDemoLoginRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Seeded demo sign-in cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, seededDemoLoginRetryDelayMs);
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new DOMException("Seeded demo sign-in cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function demoLoginEmail(userId: string): string | undefined {
  if (userId === "usr_demo_gm") return "gm@example.test";
  if (userId === "usr_demo_player") return "player@example.test";
  return undefined;
}

export async function loginPasswordSession(input: { email: string; password: string; mfaCode?: string; recoveryCode?: string }, options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<SessionLoginInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  const login = (await response.json()) as SessionLoginInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

export async function registerSession(input: { email: string; displayName: string; password: string }, options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<SessionLoginInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

export async function logoutSession(): Promise<{ ok: boolean }> {
  try {
    const response = await apiFetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: await sessionHeaders()
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ ok: boolean }>;
  } finally {
    clearSession();
  }
}

export async function changePasswordSession(input: { currentPassword: string; newPassword: string }, options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<SessionLoginInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/password/change`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}), ...(await sessionHeaders()) },
    body: JSON.stringify(input),
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

export async function loadMfaStatus(options: ApiRequestOptions = {}): Promise<MfaInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/mfa`, {
    headers: await sessionHeaders(),
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<MfaInfo>;
}

export async function enrollTotpMfa(input: { currentPassword: string }, options: ApiRequestOptions = {}): Promise<TotpEnrollInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/mfa/totp/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input),
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpEnrollInfo>;
}

export async function confirmTotpMfa(input: { code: string }, options: ApiRequestOptions = {}): Promise<TotpConfirmInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/mfa/totp/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input),
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpConfirmInfo>;
}

export async function disableTotpMfa(input: { currentPassword: string; mfaCode?: string; recoveryCode?: string }, options: ApiRequestOptions = {}): Promise<TotpConfirmInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/mfa/totp`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...(await sessionHeaders()) },
    body: JSON.stringify(input),
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TotpConfirmInfo>;
}

export async function loadBootstrapStatus(): Promise<BootstrapStatus> {
  await assertApiCompatibility();
  const response = await apiFetch(`${baseUrl}/api/v1/auth/bootstrap`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<BootstrapStatus>;
}

export async function bootstrapOwnerSession(input: { email: string; displayName: string; password: string; campaignName: string; campaignDescription?: string; defaultSystemId?: string }, options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<BootstrapOwnerInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as BootstrapOwnerInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/password-reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ ok: boolean }>;
}

export async function confirmPasswordResetSession(input: { token: string; password: string }, options: { persist?: boolean; signal?: AbortSignal } = {}): Promise<SessionLoginInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(await response.text());
  const login = (await response.json()) as SessionLoginInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(login);
  return login;
}

export async function acceptInviteSession(
  input: { token: string; email: string; displayName?: string; password: string; mfaCode?: string; recoveryCode?: string },
  options: { persist?: boolean; signal?: AbortSignal; idempotencyKey: string }
): Promise<InviteAcceptInfo> {
  const previewResponse = await apiFetch(`${baseUrl}/api/v1/invites/preview?token=${encodeURIComponent(input.token)}`, {
    signal: options.signal
  });
  if (!previewResponse.ok) throw await apiErrorFromResponse(previewResponse);
  const preview = (await previewResponse.json()) as { expectedUpdatedAt: string };
  const response = await apiFetch(`${baseUrl}/api/v1/invites/accept`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": options.idempotencyKey, ...(options.persist === false ? { "x-otte-defer-session-cookie": "1" } : {}) },
    body: JSON.stringify({ ...input, expectedUpdatedAt: preview.expectedUpdatedAt }),
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  const accepted = (await response.json()) as InviteAcceptInfo;
  if (options.persist !== false) await confirmAndStoreBrowserSession(accepted);
  return accepted;
}

/** Commits a response selected by stale-result guards before changing browser credentials. */
export async function activateDeferredSession(login: SessionLoginInfo, options: { persist?: boolean } = {}): Promise<void> {
  const upgraded = await apiFetch(`${baseUrl}/api/v1/auth/session/upgrade-cookie`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${login.token}` },
    body: JSON.stringify({ expectedUserId: login.user.id }),
  });
  if (!upgraded.ok) throw await apiErrorFromResponse(upgraded);
  await assertUpgradeUser(upgraded, login.user.id);
  const confirmed = await apiFetch(`${baseUrl}/api/v1/auth/session/upgrade-cookie/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cookieSessionMarker}` },
    body: JSON.stringify({ expectedUserId: login.user.id }),
  });
  if (!confirmed.ok) throw await apiErrorFromResponse(confirmed);
  await assertUpgradeConfirmation(confirmed, login.user.id);
  try {
    await assertAuthenticatedCookieSession(login.user.id);
  } catch (error) {
    await discardUnconfirmedCookieSession();
    throw error;
  }
  if (options.persist !== false) storeSession(login);
}

export async function startOidcLogin(returnTo = window.location.origin + window.location.pathname): Promise<OidcStartInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/oidc/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnTo })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<OidcStartInfo>;
}

export async function loadOidcConfig(): Promise<OidcConfigInfo> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/oidc/config`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<OidcConfigInfo>;
}

async function ensureSessionToken(): Promise<string> {
  if (statelessDemoApiMode) throw new Error("Demo mode is local-only and cannot call the authenticated API.");
  const token = sessionCredentialToken();
  const userId = getSessionUserId();
  if (token) return token;
  const login = await loginSession(userId);
  return getSessionToken() || login.token;
}

/** The legacy bearer is private to one upgrade request and never exposed to UI state. */
function sessionCredentialToken(): string {
  migrateLegacySessionToken();
  if (inMemorySessionToken) return inMemorySessionToken;
  return localStorage.getItem(sessionTransportKey) === "cookie" ? cookieSessionMarker : "";
}

async function sessionHeaders(): Promise<Record<string, string>> {
  await ensureLegacySessionCookieUpgrade();
  const token = await ensureSessionToken();
  return { authorization: `Bearer ${token}` };
}

async function ensureLegacySessionCookieUpgrade(): Promise<void> {
  migrateLegacySessionToken();
  if (!legacySessionUpgradePending) return;
  if (legacySessionUpgradePromise) return legacySessionUpgradePromise;
  legacySessionUpgradePromise = (async () => {
    const expectedUserId = localStorage.getItem(legacySessionTokenUserKey);
    if (!expectedUserId) throw new Error("Legacy session user is unavailable for cookie upgrade.");
    // If the prior confirmation response was interrupted, the rotated cookie
    // is already usable and this confirmation safely finishes revocation.
    const pendingConfirmation = await apiFetch(`${baseUrl}/api/v1/auth/session/upgrade-cookie/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cookieSessionMarker}` },
      body: JSON.stringify({ expectedUserId }),
    });
    if (pendingConfirmation.ok) {
      await finalizeLegacySessionCookieUpgrade(pendingConfirmation);
      return;
    }

    const legacyBearer = inMemorySessionToken;
    if (!legacyBearer || legacyBearer === cookieSessionMarker) throw new Error("Legacy session credential is unavailable for cookie upgrade.");
    const upgraded = await apiFetch(`${baseUrl}/api/v1/auth/session/upgrade-cookie`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${legacyBearer}` },
      body: JSON.stringify({ expectedUserId }),
    });
    if (!upgraded.ok) throw await apiErrorFromResponse(upgraded);
    await assertUpgradeUser(upgraded, expectedUserId);
    const confirmed = await apiFetch(`${baseUrl}/api/v1/auth/session/upgrade-cookie/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cookieSessionMarker}` },
      body: JSON.stringify({ expectedUserId }),
    });
    if (!confirmed.ok) throw await apiErrorFromResponse(confirmed);
    await finalizeLegacySessionCookieUpgrade(confirmed);
  })().finally(() => {
    legacySessionUpgradePromise = undefined;
  });
  return legacySessionUpgradePromise;
}

async function assertUpgradeUser(response: Response, expectedUserId: string): Promise<void> {
  const payload = await response.json() as { session?: { userId?: string } };
  if (payload.session?.userId !== expectedUserId) {
    throw new Error("Legacy session upgrade returned a different user.");
  }
}

async function confirmAndStoreBrowserSession(login: SessionLoginInfo): Promise<void> {
  try {
    await assertAuthenticatedCookieSession(login.user.id);
  } catch (error) {
    await discardUnconfirmedCookieSession();
    throw error;
  }
  storeSession(login);
}

async function assertAuthenticatedCookieSession(expectedUserId: string): Promise<void> {
  const response = await apiFetch(`${baseUrl}/api/v1/auth/session`, {
    headers: { authorization: `Bearer ${cookieSessionMarker}` },
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  const payload = await response.json() as { user?: { id?: string }; session?: { userId?: string } };
  const authenticatedUserId = payload.user?.id ?? payload.session?.userId;
  if (authenticatedUserId !== expectedUserId) throw new Error("Browser session cookie did not match the expected user.");
}

async function discardUnconfirmedCookieSession(): Promise<void> {
  try {
    await apiFetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${cookieSessionMarker}` },
    });
  } catch {
    // The caller still rejects activation; a later interactive login replaces
    // any cookie that could not be cleared while the server was unreachable.
  }
}

async function finalizeLegacySessionCookieUpgrade(response: Response): Promise<void> {
  const expectedUserId = localStorage.getItem(legacySessionTokenUserKey);
  if (!expectedUserId) throw new Error("Legacy session user is unavailable for cookie confirmation.");
  await assertUpgradeConfirmation(response, expectedUserId);
  await assertAuthenticatedCookieSession(expectedUserId);
  legacySessionUpgradePending = false;
  inMemorySessionToken = cookieSessionMarker;
  sessionTransportEpoch += 1;
  localStorage.setItem(sessionTransportKey, "cookie");
  localStorage.removeItem(legacySessionTokenKey);
  localStorage.removeItem(legacySessionTokenUserKey);
}

async function assertUpgradeConfirmation(response: Response, expectedUserId: string): Promise<void> {
  if (response.headers.get("x-otte-session-transport") !== "cookie") throw new Error("Server did not confirm session cookie activation.");
  const payload = await response.json() as { upgradeConfirmed?: boolean; session?: { userId?: string } };
  if (!payload.upgradeConfirmed || payload.session?.userId !== expectedUserId) {
    throw new Error("Session cookie confirmation did not match the expected user.");
  }
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

interface ApiRequestOptions {
  signal?: AbortSignal;
  idempotencyKey?: string;
  body?: unknown;
}

function mutationHeaders(options: ApiRequestOptions): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
  };
}

export async function apiGet<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(`${baseUrl}${path}`, {
    headers: await sessionHeaders(),
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { ...mutationHeaders(options), ...(await sessionHeaders()) },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiAnalyzePdfContentImport(
  input: { campaignId: string; file: File; expectedUpdatedAt: string },
  options: ApiRequestOptions & { idempotencyKey: string }
): Promise<ContentImportBatch> {
  const response = await apiFetch(`${baseUrl}/api/v1/campaigns/${input.campaignId}/content-imports/pdf/ai?${new URLSearchParams({ expectedUpdatedAt: input.expectedUpdatedAt })}`, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "x-source-name": encodeURIComponent(input.file.name || "uploaded.pdf"),
      "idempotency-key": options.idempotencyKey,
      ...(await sessionHeaders())
    },
    body: input.file,
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<ContentImportBatch>;
}

export async function apiPatch<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { ...mutationHeaders(options), ...(await sessionHeaders()) },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      ...(await sessionHeaders())
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  });
  if (!response.ok) throw await apiErrorFromResponse(response);
  return response.json() as Promise<T>;
}

export async function updateWorkspaceDefaults(input: Partial<OrganizationWorkspace>, options: ApiRequestOptions = {}): Promise<OrganizationWorkspace> {
  return apiPatch<OrganizationWorkspace>("/api/v1/organization/workspace-defaults", input, options);
}

export async function createOrganizationWorkspace(input: Partial<OrganizationWorkspace> & { name: string }, options: ApiRequestOptions & { idempotencyKey: string }): Promise<{ organization: OrganizationWorkspace; session: UserSession; organizations: OrganizationWorkspaceInfo[] }> {
  return apiPost<{ organization: OrganizationWorkspace; session: UserSession; organizations: OrganizationWorkspaceInfo[] }>("/api/v1/organizations", input, options);
}

export async function loadOrganizationMembers(options: ApiRequestOptions = {}): Promise<OrganizationMemberInfo[]> {
  return apiGet<OrganizationMemberInfo[]>("/api/v1/organization/members", options);
}

export async function upsertOrganizationMember(input: { email?: string; userId?: string; role: Exclude<OrganizationMemberRole, "owner">; expectedOrganizationUpdatedAt: string }, options: ApiRequestOptions & { idempotencyKey: string }): Promise<OrganizationMemberInfo> {
  return apiPost<OrganizationMemberInfo>("/api/v1/organization/members", input, options);
}

export async function updateOrganizationMemberRole(memberId: string, role: Exclude<OrganizationMemberRole, "owner">, expectedUpdatedAt: string, options: ApiRequestOptions & { idempotencyKey: string }): Promise<OrganizationMemberInfo> {
  return apiPatch<OrganizationMemberInfo>(`/api/v1/organization/members/${memberId}`, { role, expectedUpdatedAt }, options);
}

export async function removeOrganizationMember(memberId: string, expectedUpdatedAt: string, options: ApiRequestOptions & { idempotencyKey: string }): Promise<{ removed: boolean; memberId: string; userId: string; removedCampaignMemberships: number }> {
  return apiDelete<{ removed: boolean; memberId: string; userId: string; removedCampaignMemberships: number }>(`/api/v1/organization/members/${memberId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, options);
}

export async function loadOrganizationInvites(): Promise<OrganizationInviteInfo[]> {
  return apiGet<OrganizationInviteInfo[]>("/api/v1/organization/invites");
}

export async function revokeInvite(inviteId: string, expectedUpdatedAt: string, options: ApiRequestOptions & { idempotencyKey: string }): Promise<CampaignInviteInfo> {
  return apiPost<CampaignInviteInfo>(`/api/v1/invites/${inviteId}/revoke`, { expectedUpdatedAt }, options);
}

export async function switchOrganization(organizationId: string): Promise<OrganizationSwitchInfo> {
  return apiPatch<OrganizationSwitchInfo>("/api/v1/organization/session", { organizationId });
}

export interface CampaignSessionInfo {
  id: string;
  campaignId: string;
  status: "planned" | "live" | "completed";
  title: string;
  number: number;
  agenda: string;
  notes: string;
  scheduledFor?: string;
  startedAt?: string;
  endedAt?: string;
  sceneIds: string[];
  encounterIds: string[];
  recapProposalId?: string;
  recapJournalId?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  session?: SessionInfo;
  workspaceDefaults?: OrganizationWorkspace;
  organizations: OrganizationWorkspaceInfo[];
  organizationMembers: OrganizationMemberInfo[];
  organizationInvites: OrganizationInviteInfo[];
  campaigns: Campaign[];
  members: CampaignMemberInfo[];
  presences: CampaignPresence[];
  eventSequence: number;
  realtimeRecovery: "refetch_snapshot_on_gap";
  history?: SnapshotHistoryMeta;
  scenes: Scene[];
  worldRecords: WorldRecord[];
  worldRelations: WorldRelation[];
  fogPresets: FogPreset[];
  assets: MapAsset[];
  assetStorage?: CampaignAssetStorageInfo;
  tokens: Token[];
  actors: Actor[];
  calculationOverrides: CalculationOverride[];
  items: Item[];
  vision?: VisionSnapshot;
  journals: JournalEntry[];
  chat: ChatMessage[];
  rolls: DiceRoll[];
  diceMacros: DiceMacro[];
  audioTracks: AudioTrack[];
  encounters: Encounter[];
  campaignSessions?: CampaignSessionInfo[];
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

export interface SnapshotHistoryMeta {
  limit: number;
  collections: Record<string, { total: number; returned: number; truncated: boolean }>;
}

interface CampaignSnapshotPayload {
  generatedAt: string;
  eventSequence: number;
  realtimeRecovery: "refetch_snapshot_on_gap";
  history?: SnapshotHistoryMeta;
  campaign: Campaign;
  members: CampaignMemberInfo[];
  presences: CampaignPresence[];
  scenes: Scene[];
  worldRecords: WorldRecord[];
  worldRelations: WorldRelation[];
  selectedSceneId?: string;
  activeSceneId?: string;
  vision?: VisionSnapshot;
  tokens: Token[];
  fogPresets: FogPreset[];
  assets: MapAsset[];
  actors: Actor[];
  calculationOverrides: CalculationOverride[];
  items: Item[];
  journals: JournalEntry[];
  chat: ChatMessage[];
  rolls: DiceRoll[];
  diceMacros: DiceMacro[];
  encounters: Encounter[];
  campaignSessions?: CampaignSessionInfo[];
  combats: Combat[];
  proposals: Proposal[];
  memory: AiMemoryFact[];
  bundled?: CampaignSnapshotBundled;
}

interface CampaignSnapshotBundled {
  assetStorage?: CampaignAssetStorageInfo;
  audioTracks?: AudioTrack[];
  plugins?: PluginRuntimeInfo[];
  systems?: SystemRuntimeInfo[];
  characterTemplates?: CharacterTemplateInfo[];
  contentImports?: ContentImportBatch[];
  aiThreads?: AiThread[];
  aiUsage?: AiUsageSummary;
  aiToolCalls?: AiToolCall[];
  combatAudit?: AuditLog[];
}

export interface DiceRollVerification {
  rollId: string;
  formula: string;
  verified: boolean;
  reason?: "fairness_unavailable" | "unsupported_algorithm" | "seed_hash_mismatch" | "formula_unparseable" | "source_roll_unavailable" | "reroll_link_mismatch" | "result_mismatch";
  fairness?: DiceRollFairness;
  expected: { total: number };
  recomputed?: { total: number };
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

function canManageActiveOrganization(session: SessionInfo): boolean {
  const activeOrganizationId = session.organization?.id;
  const activeOrganization = activeOrganizationId ? session.organizations?.find((organization) => organization.id === activeOrganizationId) : undefined;
  return Boolean(session.serverAdmin || activeOrganization?.role === "owner" || activeOrganization?.role === "admin");
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
  /** Present when invite creation advances the parent campaign revision. */
  campaignUpdatedAt?: string;
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
  active: boolean;
  permissions: PermissionName[];
}

export async function updateCampaignMember(
  campaignId: string,
  member: Pick<CampaignMemberInfo, "id" | "updatedAt">,
  role: Extract<UserRole, "gm" | "assistant_gm" | "player" | "observer">,
  options: ApiRequestOptions & { idempotencyKey: string }
): Promise<CampaignMemberInfo> {
  return apiPatch<CampaignMemberInfo>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(member.id)}`,
    { role, expectedUpdatedAt: member.updatedAt },
    options
  );
}

export async function removeCampaignMember(
  campaignId: string,
  member: Pick<CampaignMemberInfo, "id" | "updatedAt">,
  options: ApiRequestOptions & { idempotencyKey: string }
): Promise<CampaignMemberInfo> {
  const query = new URLSearchParams({ expectedUpdatedAt: member.updatedAt });
  return apiDelete<CampaignMemberInfo>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(member.id)}?${query}`,
    options
  );
}

export interface CampaignOwnershipTransferResult {
  campaign: Campaign;
  previousOwner: CampaignMemberInfo;
  newOwner: CampaignMemberInfo;
}

export async function transferCampaignOwnership(
  campaignId: string,
  input: { targetUserId: string; expectedUpdatedAt: string; reason?: string },
  idempotencyKey: string,
  options: ApiRequestOptions = {}
): Promise<CampaignOwnershipTransferResult> {
  return apiPost<CampaignOwnershipTransferResult>(
    `/api/v1/campaigns/${encodeURIComponent(campaignId)}/ownership-transfer`,
    input,
    { ...options, idempotencyKey }
  );
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

export type MarketplacePluginReviewInfo = {
  review: Omit<PluginReviewInfo, "registryUrl" | "packageUrl" | "notes" | "reviewedByUserId">;
  installable: boolean;
  installBlock?: string;
};

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
    permissions: string[];
    permissionReview: {
      requestedPermissions: string[];
      grantRequired: boolean;
    };
    trust: PluginRuntimeInfo["trust"];
    source: NonNullable<PluginRuntimeInfo["source"]>;
    marketplaceReview?: { installable: boolean; status: PluginReviewStatus; installBlock?: string };
  }>;
  source?: {
    type: "local" | "registry";
    packageId: string;
    sandbox: "vm" | "manifest-only";
    manifestChecksum?: string;
    checksum?: string;
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
  marketplaceReview?: MarketplacePluginReviewInfo;
  chatCommands?: Array<{ command: string; description: string }>;
  audit?: {
    installCount: number;
    lastInstallAt?: string;
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
  capabilities?: string[];
  active: boolean;
  source?: "bundled" | "api";
  dataDriven?: boolean;
  runtimeCapabilities?: string[];
  unsupportedCapabilities?: string[];
  installedAt?: string;
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
  authenticationCapacity: {
    passwordWork: {
      active: number;
      queued: number;
      maxConcurrent: number;
      maxQueue: number;
      completedVerifications: number;
      completedHashes: number;
      saturationCount: number;
      queueTimeoutCount: number;
      failureCount: number;
    };
    loginThrottle: {
      bucketCount: number;
      maxBuckets: number;
      consumedAttempts: number;
      limitedAttempts: number;
    };
  };
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
  generatedAt: string;
  dryRun: boolean;
  deduplicated: boolean;
  batchDeliveryId?: string;
  targetSetHash: string;
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
          deliveryId?: string;
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
    updatedAt: string;
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
  source: NonNullable<PluginRuntimeInfo["source"]> & {
    manifestPath: string;
    clientEntrypoint?: string;
    serverEntrypoint?: string;
    registryUrl?: string;
    packageUrl?: string;
  };
  distribution: PluginRuntimeInfo["distribution"];
  trust: Omit<PluginRuntimeInfo["trust"], "signature"> & {
    signature?: NonNullable<PluginRuntimeInfo["trust"]["signature"]> & { signaturePath?: string };
  };
  installable: boolean;
  installBlock?: string;
}

export interface AdminPluginReviewSnapshot {
  generatedAt: string;
  registryRevision: string;
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
  registryRevision: string;
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
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt">;
  targetSetHash: string;
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

export interface AdminScimGroupRoleMappingPreview {
  selection: AdminScimGroupRoleMappingInput;
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt">;
  memberCount: number;
  affectedCampaignMembershipCount: number;
  targetSetHash: string;
}

interface PreparedAdminScimMapping {
  fingerprint: string;
  payload: AdminScimGroupRoleMappingInput & { preparedTargetSetHash: string };
}

const preparedAdminScimMappings = new Map<string, PreparedAdminScimMapping>();

export async function previewAdminScimGroupRoleMapping(input: AdminScimGroupRoleMappingInput, options: ApiRequestOptions = {}): Promise<AdminScimGroupRoleMappingPreview> {
  const query = new URLSearchParams({ campaignId: input.campaignId, role: input.role });
  if (input.groupId) query.set("groupId", input.groupId);
  if (input.groupExternalId) query.set("groupExternalId", input.groupExternalId);
  if (input.groupDisplayName) query.set("groupDisplayName", input.groupDisplayName);
  return apiGet<AdminScimGroupRoleMappingPreview>(`/api/v1/admin/scim/group-role-mappings/preview?${query}`, options);
}

export async function createAdminScimGroupRoleMapping(input: AdminScimGroupRoleMappingInput, options: ApiRequestOptions & { idempotencyKey: string }): Promise<AdminScimGroupRoleMappingResult> {
  const fingerprint = JSON.stringify(input);
  let prepared = preparedAdminScimMappings.get(options.idempotencyKey);
  if (!prepared || prepared.fingerprint !== fingerprint) {
    const preview = await previewAdminScimGroupRoleMapping(input, options);
    prepared = { fingerprint, payload: { ...input, preparedTargetSetHash: preview.targetSetHash } };
    preparedAdminScimMappings.set(options.idempotencyKey, prepared);
  }
  const result = await apiPost<AdminScimGroupRoleMappingResult>("/api/v1/admin/scim/group-role-mappings", prepared.payload, options);
  preparedAdminScimMappings.delete(options.idempotencyKey);
  return result;
}

export async function deleteAdminScimGroupRoleMapping(mapping: AdminScimGroupRoleMapping, options: ApiRequestOptions & { idempotencyKey: string }): Promise<{ removedMemberships: number }> {
  return apiDelete<{ removedMemberships: number }>(`/api/v1/admin/scim/group-role-mappings/${encodeURIComponent(mapping.id)}`, {
    ...options,
    body: { expectedUpdatedAt: mapping.updatedAt, preparedTargetSetHash: mapping.targetSetHash }
  });
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
    latest?: AdminStorageBackupSummary;
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
  restoreStateRevision?: string;
  actionRequired: boolean;
  actionReasons: string[];
  remediation?: string;
}

export interface AdminOperationsLatencyMetrics {
  count: number;
  totalMs: number;
  maxMs: number;
  buckets: Array<{ le: number | "infinity"; count: number }>;
}

export interface AdminOperationsOutcomeMetrics {
  attempts: number;
  succeeded: number;
  failed: number;
  latencyMs: AdminOperationsLatencyMetrics;
}

export interface AdminOperationsMetrics {
  version: 1;
  enabled: boolean;
  startedAt: string;
  generatedAt: string;
  privacy: {
    boundedDimensions: true;
    containsCampaignIds: false;
    containsUserIds: false;
    containsCredentials: false;
    containsPrivateContent: false;
  };
  http: {
    requests: number;
    errorResponses: number;
    staleWriteConflicts: number;
    methods: Record<"GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "OTHER", number>;
    statusClasses: Record<"2xx" | "3xx" | "4xx" | "5xx", number>;
    latencyMs: AdminOperationsLatencyMetrics;
  };
  realtime: {
    connectionsOpened: number;
    disconnections: number;
    revokedConnections: number;
    sendFailures: number;
    activeConnections: number;
    heartbeatGapMs: AdminOperationsLatencyMetrics;
  };
  persistence: AdminOperationsOutcomeMetrics;
  recovery: Record<"backup" | "restore_drill" | "restore", AdminOperationsOutcomeMetrics>;
}

export type AdminOperationalRetentionRecordClass = "delivered_emails" | "delivered_webhooks" | "maintenance_jobs";

export interface AdminOperationalRetentionDiagnostics {
  policyVersion: 1;
  generatedAt: string;
  preservationDefault: true;
  supportedRecordClasses: AdminOperationalRetentionRecordClass[];
  counts: Record<AdminOperationalRetentionRecordClass, number>;
  totalEligibleTerminalRecords: number;
  exemptions: string[];
}

export interface AdminOperationalRetentionPlan {
  policyVersion: 1;
  preservationDefault: true;
  dryRun: boolean;
  cutoffAt: string;
  olderThanDays: number;
  recordClasses: AdminOperationalRetentionRecordClass[];
  batchSize: number;
  eligibleCount: number;
  selectedCount: number;
  remainingCount: number;
  targetSetHash: string;
  selected: Array<{ recordClass: AdminOperationalRetentionRecordClass; id: string; completedAt: string }>;
  counts: Record<AdminOperationalRetentionRecordClass, number>;
  exemptions: string[];
  deletedCount?: number;
  reason?: string;
}

export interface AdminAssetSnapshotIdentity {
  provider: "local" | "s3";
  snapshotId: string;
  createdAt: string;
}

export interface AdminStorageRecoveryPoint {
  manifestFileName: string;
  manifestStatus: "present" | "missing" | "invalid";
  paired: boolean;
  actionRequired: boolean;
  actionReasons: string[];
  manifest?: {
    kind: "open-tabletop-recovery-point";
    version: 1;
    createdAt: string;
    database: {
      fileName: string;
      sizeBytes: number;
      checksumAlgorithm: "sha256";
      checksum: string;
    };
    assetInventory: {
      provider: "local" | "s3" | "unknown";
      assetCount: number;
      objectCount: number;
      sizeBytes: number;
      digestAlgorithm: "sha256";
      digest: string;
    };
    assetSnapshot?: AdminAssetSnapshotIdentity;
  };
}

export interface AdminStorageBackupSummary {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  recoveryPoint: AdminStorageRecoveryPoint;
}

export interface AdminStorageBackupResult extends AdminStorageBackupSummary {
  status: "created";
  reason?: string;
  prunedFileNames?: string[];
}

export interface AdminStorageRestoreDrillResult {
  status: "passed" | "failed";
  checkedAt: string;
  backup?: AdminStorageBackupSummary;
  recoveryPoint?: AdminStorageRecoveryPoint;
  actionRequired: boolean;
  actionReasons: string[];
  integrity?: { checkedAt: string; ok: boolean; result: string };
  campaignCount?: number;
  recordCount?: number;
  collections?: Array<{ collection: string; count: number }>;
  error?: string;
}

export interface AdminStorageRestoreResult extends AdminStorageRestoreDrillResult {
  restoredAt?: string;
  reason?: string;
  paired?: boolean;
  assetRestore?: {
    identity: AdminAssetSnapshotIdentity;
    assetCount: number;
    objectCount: number;
    storedObjectCount: number;
    sizeBytes: number;
  };
  rollbackRecoveryPoint?: {
    backupFileName: string;
    assetSnapshot: AdminAssetSnapshotIdentity;
  };
  rollback?: {
    status: "succeeded" | "failed";
    errors: string[];
  };
  reconciliation?: {
    policy: "preserve-live-security-plane";
    usersPreserved: number;
    sessionsPreserved: number;
    oauthStatesCleared: number;
    passwordResetTokensCleared: number;
    invitesPreserved: number;
    pendingEmailsQuarantined: number;
    webhooksDisabled: number;
    pendingWebhookDeliveriesQuarantined: number;
    jobsCancelled: number;
    idempotencyRecordsCleared: number;
    backupOnlyCampaignsAssignedToRecoveryAdmin: number;
  };
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
  leasedBy?: string;
  leaseRequestId?: string;
  leaseRevision?: number;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  dispatchStartedAt?: string;
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
  deliveryId: string;
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
  operationsMetrics: AdminOperationsMetrics;
  retentionOperations: AdminOperationalRetentionDiagnostics;
  assetStorage: AdminAssetStorageInfo;
  assetIntegrity: AdminAssetIntegrityReport;
  renderingOperations: AdminRenderingOperations;
  systemOperations: AdminSystemOperations;
  aiOperations: AdminAiOperations;
  pluginReviews: AdminPluginReviewSnapshot;
  pluginOperations: AdminPluginOperations;
  scimGroupRoleMappings: AdminScimGroupRoleMapping[];
}

export async function loadAdminSnapshot(options: ApiRequestOptions = {}): Promise<AdminSnapshot> {
  const [users, sessions, emailOutbox, audit, jobs, jobOperations, authOperations, storageOperations, operationsMetrics, retentionOperations, assetStorage, assetIntegrity, renderingOperations, systemOperations, aiOperations, pluginReviews, pluginOperations, scimGroupRoleMappings] = await Promise.all([
    apiGet<AdminUserInfo[]>("/api/v1/admin/users", options),
    apiGet<AdminSessionInfo[]>("/api/v1/admin/sessions", options),
    apiGet<EmailOutboxMessage[]>("/api/v1/admin/email-outbox", options),
    apiGet<AdminAuditLogExport>("/api/v1/admin/audit-logs?limit=12", options),
    apiGet<AdminJob[]>("/api/v1/admin/jobs?limit=12", options),
    apiGet<AdminJobOperations>("/api/v1/admin/jobs/operations", options),
    apiGet<AdminAuthOperations>("/api/v1/admin/auth/operations", options),
    apiGet<AdminStorageOperations>("/api/v1/admin/storage/operations", options),
    apiGet<AdminOperationsMetrics>("/api/v1/admin/operations/metrics", options),
    apiGet<AdminOperationalRetentionDiagnostics>("/api/v1/admin/retention/operations", options),
    apiGet<AdminAssetStorageInfo>("/api/v1/admin/assets/storage", options),
    apiGet<AdminAssetIntegrityReport>("/api/v1/admin/assets/integrity", options),
    apiGet<AdminRenderingOperations>("/api/v1/admin/rendering/operations", options),
    apiGet<AdminSystemOperations>("/api/v1/admin/systems/operations", options),
    apiGet<AdminAiOperations>("/api/v1/admin/ai/operations", options),
    apiGet<AdminPluginReviewSnapshot>("/api/v1/admin/plugins/reviews", options),
    apiGet<AdminPluginOperations>("/api/v1/admin/plugins/operations", options),
    apiGet<AdminScimGroupRoleMapping[]>("/api/v1/admin/scim/group-role-mappings", options)
  ]);
  return { users, sessions, emailOutbox, audit, jobs, jobOperations, authOperations, storageOperations, operationsMetrics, retentionOperations, assetStorage, assetIntegrity, renderingOperations, systemOperations, aiOperations, pluginReviews, pluginOperations, scimGroupRoleMappings };
}

type DisplayMapAsset = MapAsset & { deliveryUrl?: string };
type DisplayAudioTrack = AudioTrack & { deliveryUrl?: string };

export function assetBlobUrl(asset: MapAsset): string {
  const displayAsset = asset as DisplayMapAsset;
  const url = displayAsset.deliveryUrl ?? asset.url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return absoluteApiUrl(url);
}

export function assetThumbnailUrl(asset: MapAsset): string {
  return assetRenditionUrl(asset, "thumbnail");
}

function assetRenditionUrl(asset: MapAsset, kind: "thumbnail" | "optimized"): string {
  if (!asset.renditions?.some((rendition) => rendition.kind === kind)) return assetBlobUrl(asset);
  const url = assetBlobUrl(asset);
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}variant=${kind}`;
}

function absoluteApiUrl(url: string): string {
  if (!baseUrl) return url;
  const normalizedUrl = url.startsWith("/") ? url : `/${url}`;
  return `${baseUrl.replace(/\/+$/, "")}${normalizedUrl}`;
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

async function withAudioDeliveryUrls(audioTracks: AudioTrack[]): Promise<AudioTrack[]> {
  return Promise.all(
    audioTracks.map(async (track) => {
      const assetId = managedAssetIdFromUrl(track.url);
      if (!assetId) return track;
      try {
        const delivery = await assetDeliveryUrl(assetId);
        return { ...track, deliveryUrl: delivery.url } satisfies DisplayAudioTrack;
      } catch {
        return track;
      }
    })
  );
}

function managedAssetIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = /^\/api\/v1\/assets\/([^/?#]+)\/blob(?:[?#].*)?$/.exec(url);
  return match?.[1];
}

export async function apiUploadAsset(input: { campaignId: string; sceneId?: string; expectedSceneUpdatedAt?: string; file: File; setAsBackground?: boolean; folder?: string; tags?: string[] }, options: ApiRequestOptions & { idempotencyKey: string }): Promise<{ asset: MapAsset; scene?: Scene }> {
  const params = new URLSearchParams();
  if (input.sceneId) params.set("sceneId", input.sceneId);
  if (input.setAsBackground) params.set("setAsBackground", "true");
  if (input.setAsBackground) {
    if (!input.sceneId || !input.expectedSceneUpdatedAt) throw new Error("Background uploads require the current scene revision.");
    params.set("expectedSceneUpdatedAt", input.expectedSceneUpdatedAt);
  }
  const response = await apiFetch(`${baseUrl}/api/v1/campaigns/${input.campaignId}/assets/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": input.file.type || "application/octet-stream",
      "x-asset-name": encodeURIComponent(input.file.name),
      ...(input.folder ? { "x-asset-folder": encodeURIComponent(input.folder) } : {}),
      ...(input.tags && input.tags.length > 0 ? { "x-asset-tags": encodeURIComponent(input.tags.join(",")) } : {}),
      "idempotency-key": options.idempotencyKey,
      ...(await sessionHeaders())
    },
    body: input.file,
    signal: options.signal
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<{ asset: MapAsset; scene?: Scene }>;
}

export async function verifyDiceRoll(campaignId: string, rollId: string): Promise<DiceRollVerification> {
  return apiGet<DiceRollVerification>(`/api/v1/campaigns/${campaignId}/rolls/${rollId}/verify`);
}

export async function loadSnapshot(campaignId?: string, sceneId?: string): Promise<Snapshot> {
  const snapshotHeaders = await sessionHeaders();
  const snapshotGet = async <T,>(path: string): Promise<T> => {
    const response = await apiFetch(`${baseUrl}${path}`, {
      headers: snapshotHeaders
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  };
  const [session, campaigns, workspaceDefaults, organizationMembers] = await Promise.all([
    snapshotGet<SessionInfo>("/api/v1/auth/session"),
    snapshotGet<Campaign[]>("/api/v1/campaigns"),
    snapshotGet<OrganizationWorkspace>("/api/v1/organization/workspace-defaults"),
    snapshotGet<OrganizationMemberInfo[]>("/api/v1/organization/members")
  ]);
  const organizationInvites = canManageActiveOrganization(session) ? await snapshotGet<OrganizationInviteInfo[]>("/api/v1/organization/invites").catch(() => []) : [];
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
      presences: [],
      eventSequence: 0,
      realtimeRecovery: "refetch_snapshot_on_gap",
      scenes: [],
      worldRecords: [],
      worldRelations: [],
      fogPresets: [],
      assets: [],
      assetStorage: undefined,
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
    };
  }
  const snapshotQuery = new URLSearchParams();
  if (sceneId) snapshotQuery.set("sceneId", sceneId);
  const campaignSnapshot = await snapshotGet<CampaignSnapshotPayload>(`/api/v1/campaigns/${selectedCampaignId}/snapshot${snapshotQuery.size > 0 ? `?${snapshotQuery.toString()}` : ""}`);
  const hasBundledResources = campaignSnapshot.bundled !== undefined;
  const bundled = campaignSnapshot.bundled ?? {};
  const members = campaignSnapshot.members;
  const currentMember = members.find((member) => member.user.id === session.user.id);
  const canManageCampaign = currentMember?.permissions.includes("campaign.update") ?? false;
  const canReadScenes = currentMember?.permissions.includes("scene.read") ?? false;
  const canReadActors = currentMember?.permissions.includes("actor.read") ?? false;
  const canViewAiOperations = currentMember?.permissions.includes("ai.proposeChanges") ?? false;
  const activeCombatId = campaignSnapshot.combats.find((combat) => combat.active)?.id;
  const [assetStorage, audioTracks, contentImports, aiThreads, aiUsage, aiToolCalls, plugins, systems, combatAudit] = await Promise.all([
    bundled.assetStorage !== undefined
      ? Promise.resolve(bundled.assetStorage)
      : !hasBundledResources && canReadScenes
        ? snapshotGet<CampaignAssetStorageInfo>(`/api/v1/campaigns/${selectedCampaignId}/assets/storage`)
        : Promise.resolve(undefined),
    bundled.audioTracks !== undefined ? Promise.resolve(bundled.audioTracks) : snapshotGet<AudioTrack[]>(`/api/v1/campaigns/${selectedCampaignId}/audio`),
    bundled.contentImports !== undefined ? Promise.resolve(bundled.contentImports) : canManageCampaign ? snapshotGet<ContentImportBatch[]>(`/api/v1/campaigns/${selectedCampaignId}/content-imports`) : Promise.resolve([]),
    bundled.aiThreads !== undefined ? Promise.resolve(bundled.aiThreads) : canViewAiOperations ? snapshotGet<AiThread[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/threads`) : Promise.resolve([]),
    bundled.aiUsage !== undefined ? Promise.resolve(bundled.aiUsage) : canViewAiOperations ? snapshotGet<AiUsageSummary>(`/api/v1/campaigns/${selectedCampaignId}/ai/usage`) : Promise.resolve(undefined),
    bundled.aiToolCalls !== undefined ? Promise.resolve(bundled.aiToolCalls) : canViewAiOperations ? snapshotGet<AiToolCall[]>(`/api/v1/campaigns/${selectedCampaignId}/ai/tool-calls`) : Promise.resolve([]),
    bundled.plugins !== undefined ? Promise.resolve(bundled.plugins) : snapshotGet<PluginRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/plugins`),
    bundled.systems !== undefined ? Promise.resolve(bundled.systems) : snapshotGet<SystemRuntimeInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems`),
    bundled.combatAudit !== undefined ? Promise.resolve(bundled.combatAudit) : activeCombatId ? snapshotGet<AuditLog[]>(`/api/v1/combats/${activeCombatId}/audit`) : Promise.resolve([])
  ]);
  const activeSystem = systems.find((system) => system.active) ?? systems[0];
  const activeSystemId = activeSystem?.id;
  const characterTemplates =
    bundled.characterTemplates !== undefined
      ? bundled.characterTemplates
      : !hasBundledResources && canReadActors && activeSystemId && (activeSystem.runtimeCapabilities ?? []).includes("character-templates")
        ? await snapshotGet<CharacterTemplateInfo[]>(`/api/v1/campaigns/${selectedCampaignId}/systems/${activeSystemId}/character-templates`)
        : [];
  const [displayAssets, displayAudioTracks] = await Promise.all([withAssetDeliveryUrls(campaignSnapshot.assets), withAudioDeliveryUrls(audioTracks)]);
  return {
    session,
    workspaceDefaults,
    organizations: session.organizations ?? [],
    organizationMembers,
    organizationInvites,
    campaigns,
    members,
    presences: campaignSnapshot.presences,
    eventSequence: campaignSnapshot.eventSequence ?? 0,
    realtimeRecovery: campaignSnapshot.realtimeRecovery ?? "refetch_snapshot_on_gap",
    history: campaignSnapshot.history,
    scenes: campaignSnapshot.scenes,
    worldRecords: campaignSnapshot.worldRecords ?? [],
    worldRelations: campaignSnapshot.worldRelations ?? [],
    fogPresets: campaignSnapshot.fogPresets,
    assets: displayAssets,
    assetStorage,
    tokens: campaignSnapshot.tokens,
    vision: campaignSnapshot.vision,
    actors: campaignSnapshot.actors,
    calculationOverrides: campaignSnapshot.calculationOverrides ?? [],
    items: campaignSnapshot.items,
    journals: campaignSnapshot.journals,
    chat: campaignSnapshot.chat,
    rolls: campaignSnapshot.rolls,
    diceMacros: campaignSnapshot.diceMacros,
    audioTracks: displayAudioTracks,
    encounters: campaignSnapshot.encounters,
    campaignSessions: campaignSnapshot.campaignSessions ?? [],
    combats: campaignSnapshot.combats,
    combatAudit,
    proposals: campaignSnapshot.proposals,
    contentImports,
    memory: campaignSnapshot.memory,
    aiThreads,
    aiUsage,
    aiToolCalls,
    plugins,
    systems,
    characterTemplates
  };
}
