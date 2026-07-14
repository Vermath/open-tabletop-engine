import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface GetRoute {
  path: string;
  sourceName: string;
  handlerSource: string;
}

const appPath = fileURLToPath(new URL("./app.ts", import.meta.url));
const appSource = readFileSync(appPath, "utf8");
const calculationOverrideRoutesPath = fileURLToPath(new URL("./calculation-override-routes.ts", import.meta.url));
const calculationOverrideRoutesSource = readFileSync(calculationOverrideRoutesPath, "utf8");
const campaignSessionRoutesSource = readFileSync(new URL("./campaign-session-routes.ts", import.meta.url), "utf8");
const campaignWebhookRoutesSource = readFileSync(new URL("./campaign-webhook-routes.ts", import.meta.url), "utf8");
const sceneDelegationRoutesSource = readFileSync(new URL("./scene-delegation-routes.ts", import.meta.url), "utf8");
const adminIdentityRoutesSource = readFileSync(new URL("./admin-identity-routes.ts", import.meta.url), "utf8");
const scimRoutesSource = readFileSync(new URL("./scim-routes.ts", import.meta.url), "utf8");
const adminAssetRoutesSource = readFileSync(new URL("./admin-asset-routes.ts", import.meta.url), "utf8");
const routeSources = [
  { name: "app.ts", source: appSource },
  { name: "calculation-override-routes.ts", source: calculationOverrideRoutesSource },
  { name: "campaign-session-routes.ts", source: campaignSessionRoutesSource },
  { name: "campaign-webhook-routes.ts", source: campaignWebhookRoutesSource },
  { name: "scene-delegation-routes.ts", source: sceneDelegationRoutesSource },
  { name: "admin-identity-routes.ts", source: adminIdentityRoutesSource },
  { name: "scim-routes.ts", source: scimRoutesSource },
  { name: "admin-asset-routes.ts", source: adminAssetRoutesSource },
] as const;

const oidcCallbackPath = "/api/v1/auth/oidc/callback";

// Locked from the 2026-07-13 exhaustive route audit. A route may leave this
// list only after its handler is truly read-only and no read audit is required;
// additions require an explicit contract review.
const readSideEffectInventory = [
  "/api/v1/auth/sessions",
  "/api/v1/admin/users",
  "/api/v1/admin/sessions",
  "/api/v1/admin/sessions/risk",
  "/api/v1/admin/auth/config",
  "/api/v1/admin/auth/operations",
  "/api/v1/admin/email-outbox",
  "/api/v1/admin/audit-logs",
  "/api/v1/admin/storage/operations",
  "/api/v1/admin/jobs",
  "/api/v1/admin/jobs/operations",
  "/api/v1/admin/jobs/:jobId",
  "/api/v1/admin/plugins/reviews",
  "/api/v1/admin/plugins/operations",
  "/api/v1/admin/systems/operations",
  "/api/v1/admin/rendering/operations",
  "/api/v1/admin/scim/group-role-mappings",
  oidcCallbackPath,
  "/api/v1/admin/assets/storage",
  "/api/v1/admin/assets/integrity",
  "/api/v1/campaigns/:campaignId/chat/export"
] as const;

function extractGetRoutes(sourceName: string, source: string): GetRoute[] {
  const routePattern = /app\.(get|post|put|patch|delete)(?:<[\s\S]{0,3000}?>)?\(\s*"([^"]+)"/g;
  const matches = [...source.matchAll(routePattern)];
  return matches.flatMap((match, index) => {
    if (match[1] !== "get") return [];
    const start = match.index!;
    const nextRoute = matches[index + 1]?.index ?? source.length;
    // Route registrars can sit between two inline handlers. Their dependency
    // wiring may legitimately reference mutation helpers, but that code is not
    // part of the preceding GET handler and must not create a false positive.
    const registrar = source.slice(start, nextRoute).match(/\n\s{2}register[A-Z][A-Za-z0-9]*Routes\s*\(/);
    const end = registrar?.index === undefined ? nextRoute : start + registrar.index;
    const path = match[2]!;
    if (path.includes("/ai/") || path.startsWith("/api/v1/ai/") || path.startsWith("/api/v1/agent/")) return [];
    return [{ path, sourceName, handlerSource: source.slice(start, end) }];
  });
}

function directReadSideEffects(handlerSource: string): string[] {
  const checks: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bstore\.save\s*\(/, "direct store.save"],
    [/\bpruneExpiredSessions\s*\(/, "session pruning"],
    [/\bstore\.state\.[A-Za-z0-9_]+\s*=/, "primary-state assignment"],
    [/\bstore\.state\.[A-Za-z0-9_]+\.(?:push|splice)\s*\(/, "primary-state collection mutation"],
    [/\bappendServerAuditLog\s*\(/, "direct server-audit mutation"]
  ];
  return checks.flatMap(([pattern, label]) => (pattern.test(handlerSource) ? [label] : []));
}

describe("GET read-side-effect contract", () => {
  const getRoutes = routeSources.flatMap(({ name, source }) => extractGetRoutes(name, source));
  const byPath = new Map(getRoutes.map((route) => [route.path, route]));

  it("locks the audited 21-route inventory", () => {
    expect(new Set(readSideEffectInventory).size).toBe(21);
    expect(readSideEffectInventory.filter((path) => !byPath.has(path))).toEqual([]);
    expect(getRoutes.filter((route) => route.sourceName === "calculation-override-routes.ts").map((route) => route.path)).toEqual([
      "/api/v1/campaigns/:campaignId/actors/:actorId/calculation-overrides",
    ]);

    const unclassifiedDirectWrites = getRoutes
      .filter((route) => directReadSideEffects(route.handlerSource).length > 0)
      .filter((route) => !readSideEffectInventory.includes(route.path as (typeof readSideEffectInventory)[number]))
      .map((route) => route.path);
    expect(unclassifiedDirectWrites).toEqual([]);
  });

  it("keeps the OIDC callback as the sole explicit state-mutating GET transaction", () => {
    const callback = byPath.get(oidcCallbackPath);
    expect(callback).toBeDefined();
    expect(callback!.handlerSource).toContain("completeOidcCallback");
    expect(callback!.handlerSource).toContain("store.save()");
    expect(callback!.handlerSource).not.toContain("appendSerializedReadAudit");
    const callbackHelperStart = appSource.indexOf("async function completeOidcCallback");
    expect(callbackHelperStart).toBeGreaterThanOrEqual(0);
    const callbackHelperSource = appSource.slice(callbackHelperStart, callbackHelperStart + 5_000);
    expect(callbackHelperSource).toContain("upsertOidcUser");
    expect(callbackHelperSource).toContain("createUserSession");
  });

  it("requires every other audited GET to be read-only or use serialized append-only audit", () => {
    const failures: string[] = [];
    for (const path of readSideEffectInventory) {
      if (path === oidcCallbackPath) continue;
      const route = byPath.get(path)!;
      const directEffects = directReadSideEffects(route.handlerSource);
      if (directEffects.length > 0) failures.push(`${path}: ${directEffects.join(", ")}`);
      const hasLegacyAudit = /\bappendServerAuditLog\s*\(/.test(route.handlerSource);
      const usesSerializedAudit = /\bappendSerializedReadAudit\s*\(/.test(route.handlerSource);
      if (hasLegacyAudit && !usesSerializedAudit) failures.push(`${path}: read audit is not serialized through appendSerializedReadAudit`);
    }
    expect(failures).toEqual([]);
  });

  it("keeps the named read-audit helper narrow and serialized when it is used", () => {
    const usesHelper = getRoutes.some((route) => route.handlerSource.includes("appendSerializedReadAudit"));
    if (!usesHelper) return;
    const helperStart = Math.max(appSource.indexOf("function appendSerializedReadAudit"), appSource.indexOf("const appendSerializedReadAudit"));
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const helperSource = appSource.slice(helperStart, helperStart + 5_000);
    expect(helperSource).toContain("runExclusive");
    expect(helperSource).toContain("appendServerAuditLog");
    expect(helperSource).toContain("store.save");
  });
});
