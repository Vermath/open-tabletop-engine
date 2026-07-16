export type SessionCredentialSource = "authorization" | "x-session-token" | "cookie" | "websocket-subprotocol" | "query";

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

export function urlSessionTokenPolicy(environment: NodeJS.ProcessEnv = process.env): UrlSessionTokenPolicy {
  const configured = environment.OTTE_URL_SESSION_TOKEN_MODE?.trim().toLowerCase();
  if (!configured || configured === "compatibility") return { mode: "compatibility", configuredValueValid: true };
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
  const tokens = headerValues(value)
    .flatMap((header) => header.split(";"))
    .map((part) => part.trim())
    .filter((part) => part.startsWith("otte_session="))
    .map((part) => part.slice("otte_session=".length));
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
