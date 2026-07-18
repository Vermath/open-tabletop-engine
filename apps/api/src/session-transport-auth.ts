export type SessionCredentialSource = "authorization" | "x-session-token" | "cookie" | "websocket-subprotocol" | "query";

export const sessionCookieName = "otte_session";
export const hostSessionCookieName = "__Host-otte_session";
/** Non-secret marker used while browser callers migrate to HttpOnly cookies. */
export const cookieSessionBearerMarker = "otte-cookie-session";

export type SessionCredential =
  | { status: "none" }
  | { status: "valid"; source: SessionCredentialSource; token: string; deprecated: boolean }
  | { status: "invalid"; source: SessionCredentialSource; reason: "duplicate" | "empty" | "malformed" | "disabled" };

export type UrlSessionTokenMode = "compatibility" | "disabled";

export interface UrlSessionTokenPolicy {
  mode: UrlSessionTokenMode;
  configuredValueValid: boolean;
}

type SessionHeaders = Record<string, string | string[] | undefined>;

export interface SessionCookieOptions {
  secure?: boolean;
  maxAgeSeconds?: number;
  sameSite?: "Lax" | "Strict";
}

export type CookieSessionOriginDecision =
  | { ok: true }
  | { ok: false; reason: "missing_origin" | "cross_origin" | "invalid_origin" };

export function urlSessionTokenPolicy(environment: NodeJS.ProcessEnv = process.env): UrlSessionTokenPolicy {
  const configured = environment.OTTE_URL_SESSION_TOKEN_MODE?.trim().toLowerCase();
  if (!configured) return { mode: environment.NODE_ENV === "production" ? "disabled" : "compatibility", configuredValueValid: true };
  if (configured === "compatibility") return { mode: "compatibility", configuredValueValid: true };
  if (configured === "disabled") return { mode: "disabled", configuredValueValid: true };
  return { mode: "disabled", configuredValueValid: false };
}

export function sessionCredentialFromRequest(
  requestUrl: string | undefined,
  headers: SessionHeaders,
  policy: UrlSessionTokenPolicy = urlSessionTokenPolicy(),
): SessionCredential {
  const authorization = bearerCredential(headers.authorization);
  if (authorization) return authorization;

  const explicitHeader = singleValueCredential("x-session-token", headers["x-session-token"]);
  if (explicitHeader) return explicitHeader;

  const cookie = cookieCredential(headers.cookie);
  if (cookie) return cookie;

  const protocol = websocketProtocolCredential(headers["sec-websocket-protocol"]);
  if (protocol) return protocol;

  return queryCredential(requestUrl, policy);
}

export function urlSessionTokenDiagnostic(
  requestUrl: string | undefined,
  policy: UrlSessionTokenPolicy = urlSessionTokenPolicy(),
): { status: "deprecated" | "blocked" | "invalid"; policy: UrlSessionTokenPolicy } | undefined {
  const credential = queryCredential(requestUrl, policy);
  if (credential.status === "none") return undefined;
  if (credential.status === "valid") return { status: "deprecated", policy };
  return { status: credential.reason === "disabled" ? "blocked" : "invalid", policy };
}

function bearerCredential(value: string | string[] | undefined): SessionCredential | undefined {
  const values = headerValues(value);
  if (values.length === 0) return undefined;
  const bearerValues = values.filter((entry) => /^bearer(?:\s|$)/i.test(entry));
  if (bearerValues.length === 0) return undefined;
  if (values.length !== 1 || bearerValues.length !== 1) return invalid("authorization", "duplicate");
  const match = /^bearer\s+(.+)$/i.exec(bearerValues[0]!.trim());
  if (!match?.[1]?.trim()) return invalid("authorization", "malformed");
  if (match[1].trim() === cookieSessionBearerMarker) return undefined;
  return valid("authorization", match[1].trim());
}

function singleValueCredential(source: SessionCredentialSource, value: string | string[] | undefined): SessionCredential | undefined {
  const values = headerValues(value);
  if (values.length === 0) return undefined;
  if (values.length !== 1) return invalid(source, "duplicate");
  const token = values[0]!.trim();
  return token ? valid(source, token) : invalid(source, "empty");
}

function cookieCredential(value: string | string[] | undefined): SessionCredential | undefined {
  const parts = headerValues(value).flatMap((header) => header.split(";")).map((part) => part.trim());
  const hostTokens = cookieTokens(parts, hostSessionCookieName);
  if (hostTokens.length > 0) return credentialFromCookieTokens(hostTokens);
  if (sessionCookieUsesHostPrefix()) return undefined;
  return credentialFromCookieTokens(cookieTokens(parts, sessionCookieName));
}

function cookieTokens(parts: readonly string[], name: string): string[] {
  return parts.filter((part) => part.startsWith(`${name}=`)).map((part) => part.slice(name.length + 1));
}

function credentialFromCookieTokens(tokens: readonly string[]): SessionCredential | undefined {
  if (tokens.length === 0) return undefined;
  if (tokens.length !== 1) return invalid("cookie", "duplicate");
  if (!tokens[0]) return invalid("cookie", "empty");
  try {
    const token = decodeURIComponent(tokens[0]);
    return token ? valid("cookie", token) : invalid("cookie", "empty");
  } catch {
    return invalid("cookie", "malformed");
  }
}

export function sessionCookieHeader(token: string, options: SessionCookieOptions = {}): string {
  if (!token.trim()) throw new Error("Session cookie token must not be empty");
  const maxAgeSeconds = boundedCookieMaxAge(options.maxAgeSeconds);
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  return [
    `${secure ? hostSessionCookieName : sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite ?? "Lax"}`,
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : undefined,
  ].filter((part): part is string => Boolean(part)).join("; ");
}

export function clearSessionCookieHeader(options: Pick<SessionCookieOptions, "secure" | "sameSite"> = {}): string {
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  return [
    `${secure ? hostSessionCookieName : sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite ?? "Lax"}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure ? "Secure" : undefined,
  ].filter((part): part is string => Boolean(part)).join("; ");
}

export function sessionCookieUsesHostPrefix(environment: NodeJS.ProcessEnv = process.env): boolean {
  const configured = environment.OTTE_SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(configured ?? "")) return true;
  if (["false", "0", "no", "off"].includes(configured ?? "")) {
    const localException = environment.OTTE_ALLOW_INSECURE_LOCAL_SESSION_COOKIE?.trim().toLowerCase();
    return environment.NODE_ENV === "production" && !["1", "true", "yes", "on"].includes(localException ?? "");
  }
  return environment.NODE_ENV === "production";
}

/** Cookie-authenticated state changes require explicit same-origin evidence. */
export function cookieSessionMutationOrigin(
  method: string,
  credential: SessionCredential,
  headers: SessionHeaders,
  allowedOrigins: readonly string[],
): CookieSessionOriginDecision {
  if (credential.status !== "valid" || credential.source !== "cookie" || /^(GET|HEAD|OPTIONS)$/i.test(method)) return { ok: true };
  const configured = new Set(allowedOrigins.map(normalizedOrigin).filter((value): value is string => Boolean(value)));
  const originHeader = singleHeaderValue(headers.origin);
  if (!originHeader) {
    return singleHeaderValue(headers["sec-fetch-site"])?.toLowerCase() === "same-origin"
      ? { ok: true }
      : { ok: false, reason: "missing_origin" };
  }
  const origin = normalizedOrigin(originHeader);
  if (!origin) return { ok: false, reason: "invalid_origin" };
  return configured.has(origin) ? { ok: true } : { ok: false, reason: "cross_origin" };
}

function boundedCookieMaxAge(value: number | undefined): number {
  if (!Number.isFinite(value)) return 60 * 60 * 24 * 30;
  return Math.max(60, Math.min(60 * 60 * 24 * 90, Math.floor(value!)));
}

function singleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

function normalizedOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
function websocketProtocolCredential(value: string | string[] | undefined): SessionCredential | undefined {
  const tokens = headerValues(value)
    .flatMap((header) => header.split(","))
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol.startsWith("otte.auth."))
    .map((protocol) => protocol.slice("otte.auth.".length));
  if (tokens.length === 0) return undefined;
  if (tokens.length !== 1) return invalid("websocket-subprotocol", "duplicate");
  return tokens[0] ? valid("websocket-subprotocol", tokens[0]) : invalid("websocket-subprotocol", "empty");
}

function queryCredential(requestUrl: string | undefined, policy: UrlSessionTokenPolicy): SessionCredential {
  const url = new URL(requestUrl ?? "/api/v1/realtime", "http://localhost");
  const tokens = url.searchParams.getAll("sessionToken");
  if (tokens.length === 0) return { status: "none" };
  if (tokens.length !== 1) return invalid("query", "duplicate");
  if (!tokens[0]) return invalid("query", "empty");
  if (policy.mode === "disabled") return invalid("query", "disabled");
  return { ...valid("query", tokens[0]), deprecated: true };
}

function headerValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function valid(source: SessionCredentialSource, token: string): Extract<SessionCredential, { status: "valid" }> {
  return { status: "valid", source, token, deprecated: false };
}

function invalid(source: SessionCredentialSource, reason: Extract<SessionCredential, { status: "invalid" }>["reason"]): Extract<SessionCredential, { status: "invalid" }> {
  return { status: "invalid", source, reason };
}
