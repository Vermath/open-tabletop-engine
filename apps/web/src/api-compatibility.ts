import { WEB_API_COMPATIBILITY_VERSION } from "@open-tabletop/core";

export interface ApiHealthIdentity {
  service?: unknown;
  apiCompatibility?: unknown;
  buildFingerprint?: unknown;
}

export function apiBuildFingerprintIssue(
  health: ApiHealthIdentity | undefined,
  expected: string
): string | undefined {
  const actual = typeof health?.buildFingerprint === "string" ? health.buildFingerprint : "missing";
  return actual === expected
    ? undefined
    : `API source fingerprint mismatch (web ${expected}, API ${actual}). The API process was built from another checkout.`;
}

export class ApiCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiCompatibilityError";
  }
}

export function apiCompatibilityIssue(
  health: ApiHealthIdentity | undefined,
  expected = WEB_API_COMPATIBILITY_VERSION
): string | undefined {
  if (!health || typeof health !== "object") return "API health did not return a JSON identity.";
  if (health.service !== "open-tabletop-api") {
    return `Expected open-tabletop-api but health reported ${typeof health.service === "string" ? health.service : "no service identity"}.`;
  }
  if (health.apiCompatibility !== expected) {
    const actual = typeof health.apiCompatibility === "string" ? health.apiCompatibility : "missing";
    return `Web/API compatibility mismatch (web ${expected}, API ${actual}). The API on this port is from another build.`;
  }
  return undefined;
}
