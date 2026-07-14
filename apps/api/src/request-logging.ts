import type { FastifyLoggerOptions, FastifyRequest } from "fastify";

const REDACTED_QUERY_VALUE = "[REDACTED]";

// Keep this aligned with the API's idempotency secret-key conventions. Query
// keys are normalized so camelCase, snake_case, kebab-case, and case changes
// receive the same treatment.
const sensitiveRequestQueryKeys = new Set([
  "accesstoken",
  "apikey",
  "authorizationcode",
  "authorizationurl",
  "bearertoken",
  "clientsecret",
  "code",
  "credential",
  "credentials",
  "enrollmentsecret",
  "errordescription",
  "idtokenhint",
  "invite",
  "invitecode",
  "invitetoken",
  "mfasecret",
  "nonce",
  "otpauthurl",
  "password",
  "passwordresettoken",
  "privatekey",
  "recoverycode",
  "recoverycodes",
  "refreshtoken",
  "resettoken",
  "secret",
  "sessionstate",
  "sessiontoken",
  "signature",
  "signedurl",
  "state",
  "token",
  "totpsecret"
]);

export interface RequestLogStream {
  write(message: string): void;
}

export function sanitizeRequestUrl(requestUrl: string): string {
  let parsed: URL;
  try {
    // Request targets are normally relative. A fixed base also ensures an
    // absolute-form target never leaks userinfo or its origin into logs.
    parsed = new URL(requestUrl, "http://request.invalid");
  } catch {
    // Never fall back to the raw target: malformed input could itself contain
    // a credential that was intentionally crafted to defeat parsing.
    return "/[invalid-request-target]";
  }

  const sanitizedQuery = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    sanitizedQuery.append(key, isSensitiveRequestQueryKey(key) ? REDACTED_QUERY_VALUE : value);
  }

  const query = sanitizedQuery.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function serializeRequestForLog(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: sanitizeRequestUrl(request.url),
    version: request.raw.httpVersion,
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.raw.socket.remotePort
  };
}

export function createRequestLoggerOptions(stream?: RequestLogStream): FastifyLoggerOptions {
  return {
    serializers: { req: serializeRequestForLog },
    ...(stream ? { stream } : {})
  };
}

function isSensitiveRequestQueryKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    sensitiveRequestQueryKeys.has(normalized) ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("signature") ||
    normalized.endsWith("password") ||
    normalized.endsWith("privatekey")
  );
}
