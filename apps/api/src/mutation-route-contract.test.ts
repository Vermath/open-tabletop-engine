import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openApiSpec } from "@open-tabletop/api-contracts";

type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

interface SourceRoute {
  method: MutationMethod;
  path: string;
  sourceName: string;
  sourceIndex: number;
  handlerSource: string;
}

interface CentralGuardDescriptor {
  methods: Set<MutationMethod>;
  pattern: RegExp;
}

interface ExemptionRule {
  pattern: RegExp;
  reason: string;
}

type OperatorGuarantee = "K" | "R" | "P" | "X";

interface OperatorMutationContract {
  method: MutationMethod;
  path: string;
  guarantees: readonly OperatorGuarantee[];
}

const appPath = fileURLToPath(new URL("./app.ts", import.meta.url));
const appSource = readFileSync(appPath, "utf8");
const calculationOverrideRoutesPath = fileURLToPath(new URL("./calculation-override-routes.ts", import.meta.url));
const calculationOverrideRoutesSource = readFileSync(calculationOverrideRoutesPath, "utf8");
const archiveOperationsPath = fileURLToPath(new URL("./archive-operations.ts", import.meta.url));
const archiveOperationsSource = readFileSync(archiveOperationsPath, "utf8");
const assetOperationsPath = fileURLToPath(new URL("./asset-operations.ts", import.meta.url));
const assetOperationsSource = readFileSync(assetOperationsPath, "utf8");
const campaignSessionRoutesSource = readFileSync(new URL("./campaign-session-routes.ts", import.meta.url), "utf8");
const campaignWebhookRoutesSource = readFileSync(new URL("./campaign-webhook-routes.ts", import.meta.url), "utf8");
const sceneDelegationRoutesSource = readFileSync(new URL("./scene-delegation-routes.ts", import.meta.url), "utf8");
const dndMonsterVariantRoutesSource = readFileSync(new URL("./dnd-monster-variant-routes.ts", import.meta.url), "utf8");
const adminIdentityRoutesSource = readFileSync(new URL("./admin-identity-routes.ts", import.meta.url), "utf8");
const scimRoutesSource = readFileSync(new URL("./scim-routes.ts", import.meta.url), "utf8");
const adminAssetRoutesSource = readFileSync(new URL("./admin-asset-routes.ts", import.meta.url), "utf8");
const routeSources = [
  { name: "app.ts", source: appSource },
  { name: "calculation-override-routes.ts", source: calculationOverrideRoutesSource },
  { name: "archive-operations.ts", source: archiveOperationsSource },
  { name: "asset-operations.ts", source: assetOperationsSource },
  { name: "campaign-session-routes.ts", source: campaignSessionRoutesSource },
  { name: "campaign-webhook-routes.ts", source: campaignWebhookRoutesSource },
  { name: "scene-delegation-routes.ts", source: sceneDelegationRoutesSource },
  { name: "dnd-monster-variant-routes.ts", source: dndMonsterVariantRoutesSource },
  { name: "admin-identity-routes.ts", source: adminIdentityRoutesSource },
  { name: "scim-routes.ts", source: scimRoutesSource },
  { name: "admin-asset-routes.ts", source: adminAssetRoutesSource },
] as const;
const aggregateSource = routeSources.map(({ source }) => source).join("\n");

// This intentionally mirrors the product-owner boundary in AGENTS.md. The two
// suffix/name exceptions are included in the 246-route inventory below and are
// classified explicitly so their existing behavior cannot be changed by a
// broad non-AI concurrency hook.
function excludedAiRoute(path: string): boolean {
  return path.includes("/ai/") || path.startsWith("/api/v1/ai/") || path.startsWith("/api/v1/agent/");
}

const EXEMPTIONS: readonly ExemptionRule[] = [
  { pattern: /^\/api\/v1\/mcp$/, reason: "MCP transport; invoked domain tools own their mutation contracts" },
  { pattern: /^\/api\/v1\/auth\//, reason: "caller identity/session lifecycle, not campaign shared state" },
  { pattern: /^\/api\/v1\/organization\/session$/, reason: "caller-local active-workspace selection" },
  { pattern: /^\/api\/v1\/admin\/auth\/test-connection$/, reason: "read-only external identity connectivity probe with append-only audit" },
  { pattern: /^\/api\/v1\/admin\/storage\/restore-drill$/, reason: "read-only copied-backup verification drill with append-only audit" },
  { pattern: /^\/api\/v1\/scenes\/:[^/]+\/path-measurement$/, reason: "pure path calculation" },
  { pattern: /^\/api\/v1\/assets\/:[^/]+\/delivery-url$/, reason: "derived signed-delivery response; no campaign record mutation" },
  { pattern: /^\/api\/v1\/handouts\/:[^/]+\/read$/, reason: "per-user acknowledgement implemented as a naturally repeatable set insertion" },
  { pattern: /^\/api\/v1\/combats\/:[^/]+\/effects\/preview$/, reason: "non-mutating effect preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/systems\/:[^/]+\/spell-helper\/preview$/, reason: "non-mutating spell preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/dnd\/custom-content\/preview$/, reason: "non-mutating custom-content validation preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/dnd\/monster-templates\/preview$/, reason: "non-mutating monster-template validation preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/dnd\/monster-variants\/preview$/, reason: "non-mutating immutable-base variant preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/systems\/:[^/]+\/controlled-creatures\/preview$/, reason: "non-mutating controlled-creature preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/systems\/:[^/]+\/characters\/preview$/, reason: "non-mutating guided character preview" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/systems\/:[^/]+\/actors\/:[^/]+\/spell-preparation\/preview$/, reason: "non-mutating spell-preparation preview stored only in the idempotency ledger" },
  { pattern: /^\/api\/v1\/scenes\/:[^/]+\/ai-edits\/apply-to-target$/, reason: "explicit AI behavior boundary; leave existing execution behavior unchanged" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/content-imports\/pdf\/ai$/, reason: "explicit AI behavior boundary" },
  { pattern: /^\/api\/v1\/campaigns\/:[^/]+\/proposals$/, reason: "shared proposal route serves the existing AI execution/review contract" },
  { pattern: /^\/api\/v1\/proposals\/:[^/]+\/(?:approve|reject|apply|revert)$/, reason: "shared proposal lifecycle serves the existing AI execution/review contract" },
];

// Operator mutations use a different concurrency vocabulary than campaign
// records. Keep every route explicit so an admin/external-authority namespace
// can never become a blanket exemption from retry, revision, prepared-target,
// or outbound-delivery guarantees.
const OPERATOR_MUTATION_CONTRACTS: readonly OperatorMutationContract[] = [
  { method: "PATCH", path: "/api/v1/admin/users/:userId", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/admin/users/:userId/password-reset", guarantees: ["K", "R", "X"] },
  { method: "POST", path: "/api/v1/admin/password-resets/prune", guarantees: ["K", "P"] },
  { method: "DELETE", path: "/api/v1/admin/users/:userId/sessions", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/sessions/risk/revoke", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/sessions/prune", guarantees: ["K", "P"] },
  { method: "DELETE", path: "/api/v1/admin/sessions/:sessionId", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/admin/email-outbox/retry-all", guarantees: ["K", "P", "X"] },
  { method: "POST", path: "/api/v1/admin/email-outbox/:messageId/retry", guarantees: ["K", "R", "X"] },

  { method: "POST", path: "/api/v1/admin/storage/backup", guarantees: ["K"] },
  { method: "POST", path: "/api/v1/admin/storage/restore", guarantees: ["K", "R"] },

  { method: "POST", path: "/api/v1/admin/jobs", guarantees: ["K"] },
  { method: "POST", path: "/api/v1/admin/jobs/lease", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/jobs/alerts", guarantees: ["K", "X"] },
  { method: "PATCH", path: "/api/v1/admin/jobs/:jobId", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/admin/jobs/:jobId/heartbeat", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/admin/jobs/:jobId/retry", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/admin/jobs/:jobId/cancel", guarantees: ["K", "R"] },

  { method: "POST", path: "/api/v1/admin/plugins/registry/sync", guarantees: ["K", "R"] },
  { method: "PATCH", path: "/api/v1/admin/plugins/reviews/:reviewKey", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/plugins/install", guarantees: ["K"] },
  { method: "POST", path: "/api/v1/plugins/registry/sync", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/systems/install", guarantees: ["K"] },

  { method: "POST", path: "/api/v1/admin/scim/group-role-mappings", guarantees: ["K", "P"] },
  { method: "DELETE", path: "/api/v1/admin/scim/group-role-mappings/:mappingId", guarantees: ["K", "R", "P"] },
  { method: "POST", path: "/api/v1/scim/v2/Users", guarantees: ["K"] },
  { method: "PUT", path: "/api/v1/scim/v2/Users/:userId", guarantees: ["K", "R"] },
  { method: "PATCH", path: "/api/v1/scim/v2/Users/:userId", guarantees: ["K", "R"] },
  { method: "DELETE", path: "/api/v1/scim/v2/Users/:userId", guarantees: ["K", "R"] },
  { method: "POST", path: "/api/v1/scim/v2/Groups", guarantees: ["K"] },
  { method: "PUT", path: "/api/v1/scim/v2/Groups/:groupId", guarantees: ["K", "R"] },
  { method: "PATCH", path: "/api/v1/scim/v2/Groups/:groupId", guarantees: ["K", "R"] },
  { method: "DELETE", path: "/api/v1/scim/v2/Groups/:groupId", guarantees: ["K", "R"] },

  { method: "POST", path: "/api/v1/admin/assets/integrity/quarantine", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/assets/migrate", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/assets/cleanup", guarantees: ["K", "P"] },
  { method: "POST", path: "/api/v1/admin/assets/:assetId/purge-cache", guarantees: ["K", "R", "X"] },
] as const;

const OPERATOR_PROBE_KEYS = new Set([
  "POST /api/v1/admin/auth/test-connection",
  "POST /api/v1/admin/storage/restore-drill",
]);

// These writes create an independent record and do not overwrite a mutable
// source record. They still require an idempotency key so a transport retry
// cannot create a duplicate. Routes that derive from or update existing state
// are deliberately absent and therefore require both key and exact revision.
const APPEND_ONLY_IDEMPOTENCY_RULES: readonly RegExp[] = [
  /^POST \/api\/v1\/organizations$/,
  /^POST \/api\/v1\/campaigns$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/invites$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/sessions$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/assets$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/actors\/:[^/]+\/transfers$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/journal$/,
  /^POST \/api\/v1\/dice\/roll$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/dice-macros$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/audio$/,
  /^POST \/api\/v1\/chat\/messages$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/content-imports\/preview$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/systems\/:[^/]+\/(?:characters|monsters|characters\/import)$/,
  /^POST \/api\/v1\/campaigns\/:[^/]+\/plugins\/:[^/]+\/chat-command$/,
];

const SPECIALIZED_ROUTE_EVIDENCE: ReadonlyArray<{ pattern: RegExp; helper?: string; evidence: readonly string[] }> = [
  {
    pattern: /^POST \/api\/v1\/campaigns\/:[^/]+\/character-transfers\/:[^/]+\/(?:accept|decline|cancel)$/,
    helper: "resolveCharacterTransferRequest",
    evidence: ["idempotency-key", "requireExpectedRevision"]
  },
  {
    pattern: /^POST \/api\/v1\/import\/campaign$/,
    evidence: ["idempotency-key", "findArchiveConflicts", "reject_conflicts", "skip_conflicts"]
  }
];

function extractRoutes(sourceName: string, source: string): SourceRoute[] {
  const routePattern = /app\.(get|post|put|patch|delete)(?:<[\s\S]{0,3000}?>)?\(\s*"([^"]+)"/g;
  const matches = [...source.matchAll(routePattern)];
  return matches
    .map((match, index) => {
      const method = match[1]!.toUpperCase();
      const sourceIndex = match.index!;
      const nextIndex = matches[index + 1]?.index ?? source.length;
      return {
        method,
        path: match[2]!,
        sourceName,
        sourceIndex,
        handlerSource: source.slice(sourceIndex, nextIndex)
      };
    })
    .filter((route): route is SourceRoute => route.method !== "GET" && !excludedAiRoute(route.path));
}

function extractCentralGuardDescriptors(source: string): CentralGuardDescriptor[] {
  const block = source.match(/const sharedMutationRevisionDescriptors:[\s\S]+?= \[([\s\S]+?)\] as const;/)?.[1];
  if (!block) return [];
  const descriptors: CentralGuardDescriptor[] = [];
  const linePattern = /^\s*\{ methods: new Set\(\[([^\]]+)\]\), pattern: \/(.*)\/, collection:/gm;
  for (const match of block.matchAll(linePattern)) {
    const methods = new Set(
      [...match[1]!.matchAll(/"(POST|PUT|PATCH|DELETE)"/g)].map((method) => method[1] as MutationMethod)
    );
    descriptors.push({ methods, pattern: new RegExp(match[2]!) });
  }
  return descriptors;
}

function exemptionFor(route: SourceRoute): ExemptionRule | undefined {
  return EXEMPTIONS.find((rule) => rule.pattern.test(route.path));
}

function routeKey(route: Pick<SourceRoute, "method" | "path">): string {
  return `${route.method} ${route.path}`;
}

function operatorContractFor(route: SourceRoute): OperatorMutationContract | undefined {
  return OPERATOR_MUTATION_CONTRACTS.find((contract) => contract.method === route.method && contract.path === route.path);
}

function operatorNamespaceRoute(route: SourceRoute): boolean {
  return /^\/api\/v1\/admin\/(?:users|password-resets|sessions|auth|email-outbox|storage|jobs|plugins|scim|assets)(?:\/|$)/.test(route.path)
    || /^\/api\/v1\/scim\/v2\/(?:Users|Groups)(?:\/|$)/.test(route.path)
    || route.path === "/api/v1/plugins/install"
    || route.path === "/api/v1/plugins/registry/sync"
    || route.path === "/api/v1/systems/install";
}

function operatorRuntimeEvidence(route: SourceRoute, guarantee: OperatorGuarantee): boolean {
  switch (guarantee) {
    case "K":
      return /idempotency-key|Idempotency-Key|requireIdempotencyKey|requireScimMutationPreconditions/.test(route.handlerSource);
    case "R":
      return /expectedUpdatedAt|expectedStateRevision|expectedRegistryRevision|leaseRevision|if-match|If-Match|requireScimMutationPreconditions|assertPlugin(?:Registry|Review)Revision|updateAdminUser|issueAdminPasswordReset/.test(route.handlerSource);
    case "P":
      return /targetSetHash|preparedTargetSetHash|expectedTargetSetHash|leaseRequestId|preparedAssetOptions|prunePasswordResetTokensForAdmin|revokeUserSessions|revokeRiskSessions|pruneSessionsForAdmin|retryEmailOutboxMessages/.test(route.handlerSource);
    case "X":
      return /deliveryId|issueAdminPasswordReset|retryEmailOutboxMessage|deliverJobAlert|purgeAssetCdnCache/.test(route.handlerSource);
  }
}

function centralGuardCovers(route: SourceRoute, descriptors: readonly CentralGuardDescriptor[]): boolean {
  return descriptors.some((descriptor) => descriptor.methods.has(route.method) && descriptor.pattern.test(route.path));
}

function appendOnlyRoute(route: SourceRoute): boolean {
  const key = `${route.method} ${route.path}`;
  return APPEND_ONLY_IDEMPOTENCY_RULES.some((pattern) => pattern.test(key));
}

function specializedRouteGuards(route: SourceRoute, source: string): boolean {
  const key = `${route.method} ${route.path}`;
  const rule = SPECIALIZED_ROUTE_EVIDENCE.find((candidate) => candidate.pattern.test(key));
  if (!rule) return false;
  if (!rule.helper) return rule.evidence.every((token) => route.handlerSource.includes(token));
  if (!route.handlerSource.includes(rule.helper)) return false;
  const helperStart = source.indexOf(`function ${rule.helper}`);
  if (helperStart < 0) return false;
  const helperSource = source.slice(helperStart, helperStart + 12_000);
  return rule.evidence.every((token) => helperSource.includes(token));
}

function directGuardEvidence(route: SourceRoute): { idempotency: boolean; revision: boolean } {
  return {
    idempotency: /idempotency-key|Idempotency-Key|requireConsequentialMutation/.test(route.handlerSource),
    revision: /expectedUpdatedAt|requireExpectedRevision|requiredRevisions|expectedActorUpdatedAt|expectedItemUpdatedAt|expectedCombatUpdatedAt|preparedPreviewKey|prepareTokenMoveBatchCommand/.test(route.handlerSource)
  };
}

describe("non-AI mutation route contract", () => {
  const routes = routeSources.flatMap(({ name, source }) => extractRoutes(name, source));
  const centralDescriptors = extractCentralGuardDescriptors(appSource);

  it("keeps the current mutation inventory explicit and classified", () => {
    expect(routes).toHaveLength(257);
    expect(routes.filter((route) => route.sourceName === "app.ts")).toHaveLength(213);
    expect(routes.filter((route) => route.sourceName === "calculation-override-routes.ts")).toHaveLength(2);
    expect(routes.filter((route) => route.sourceName === "archive-operations.ts")).toHaveLength(0);
    expect(routes.filter((route) => route.sourceName === "asset-operations.ts")).toHaveLength(0);
    expect(routes.filter((route) => route.sourceName === "campaign-session-routes.ts")).toHaveLength(5);
    expect(routes.filter((route) => route.sourceName === "campaign-webhook-routes.ts")).toHaveLength(7);
    expect(routes.filter((route) => route.sourceName === "scene-delegation-routes.ts")).toHaveLength(1);
    expect(routes.filter((route) => route.sourceName === "dnd-monster-variant-routes.ts")).toHaveLength(6);
    expect(routes.filter((route) => route.sourceName === "admin-identity-routes.ts")).toHaveLength(9);
    expect(routes.filter((route) => route.sourceName === "scim-routes.ts")).toHaveLength(10);
    expect(routes.filter((route) => route.sourceName === "admin-asset-routes.ts")).toHaveLength(4);
    expect(centralDescriptors.length).toBeGreaterThan(0);
    const duplicates = routes
      .map((route) => `${route.method} ${route.path}`)
      .filter((key, index, keys) => keys.indexOf(key) !== index);
    expect(duplicates).toEqual([]);

    const unclassified = routes
      .filter((route) => !exemptionFor(route) && !route.path.startsWith("/api/v1/"))
      .map((route) => `${route.method} ${route.path}`);
    expect(unclassified).toEqual([]);
  });

  it("requires every durable shared mutation to have the right retry and conflict contract", () => {
    const gaps: string[] = [];
    for (const route of routes) {
      if (operatorContractFor(route) || OPERATOR_PROBE_KEYS.has(routeKey(route))) continue;
      if (exemptionFor(route)) continue;
      if (centralGuardCovers(route, centralDescriptors) || specializedRouteGuards(route, aggregateSource)) continue;
      const evidence = directGuardEvidence(route);
      if (!evidence.idempotency) {
        gaps.push(`${route.method} ${route.path}: missing mandatory Idempotency-Key`);
        continue;
      }
      if (!appendOnlyRoute(route) && !evidence.revision) {
        gaps.push(`${route.method} ${route.path}: missing exact shared-state revision precondition`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("keeps every operator and external-authority mutation explicitly classified", () => {
    const actual = routes
      .filter(operatorNamespaceRoute)
      .map(routeKey)
      .sort();
    const expected = [
      ...OPERATOR_MUTATION_CONTRACTS.map((contract) => `${contract.method} ${contract.path}`),
      ...OPERATOR_PROBE_KEYS,
    ].sort();
    expect(actual).toEqual(expected);
  });

  it("requires the declared K/R/P/X runtime and OpenAPI guarantees for every operator mutation", () => {
    const gaps: string[] = [];
    const paths = openApiSpec.paths as Record<string, Record<string, OpenApiOperation | undefined>>;
    for (const contract of OPERATOR_MUTATION_CONTRACTS) {
      const route = routes.find((candidate) => candidate.method === contract.method && candidate.path === contract.path);
      const key = `${contract.method} ${contract.path}`;
      if (!route) {
        gaps.push(`${key}: route missing from audited sources`);
        continue;
      }
      const openApiPath = contract.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      const operation = paths[openApiPath]?.[contract.method.toLowerCase()];
      if (!operation) {
        gaps.push(`${key}: missing OpenAPI operation`);
        continue;
      }
      const requestSchema = operation.requestBody?.content?.["application/json"]?.schema;
      const responseSchemas = Object.values(operation.responses ?? {}).flatMap((response) => {
        const schema = response?.content?.["application/json"]?.schema;
        return schema ? [schema] : [];
      });
      for (const guarantee of contract.guarantees) {
        if (!operatorRuntimeEvidence(route, guarantee)) gaps.push(`${key}: runtime source omits ${guarantee} evidence`);
        if (guarantee === "K" && !requiredHeader(operation, "Idempotency-Key")) {
          gaps.push(`${key}: OpenAPI omits required Idempotency-Key`);
        }
        if (guarantee === "R") {
          const hasRevisionHeader = requiredHeader(operation, "If-Match");
          const hasRevisionBody = ["expectedUpdatedAt", "expectedStateRevision", "expectedRegistryRevision", "leaseRevision"]
            .some((property) => requestSchema && schemaHasProperty(requestSchema, property));
          if (!hasRevisionHeader && !hasRevisionBody) gaps.push(`${key}: OpenAPI omits exact revision/validator`);
        }
        if (guarantee === "P") {
          const hasPreparedIdentity = ["targetSetHash", "preparedTargetSetHash", "expectedTargetSetHash", "leaseRequestId"]
            .some((property) => requestSchema && schemaHasProperty(requestSchema, property));
          if (!hasPreparedIdentity) gaps.push(`${key}: OpenAPI omits prepared target-set/transition identity`);
        }
        if (guarantee === "X") {
          const hasDeliveryIdentity = [requestSchema, ...responseSchemas]
            .filter((schema): schema is OpenApiSchema => Boolean(schema))
            .some((schema) => schemaHasProperty(schema, "deliveryId") || schemaHasProperty(schema, "batchDeliveryId"));
          if (!hasDeliveryIdentity) gaps.push(`${key}: OpenAPI omits stable external delivery identity`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("publishes the exact revision precondition required by every centrally guarded route", () => {
    const gaps: string[] = [];
    const paths = openApiSpec.paths as Record<string, Record<string, OpenApiOperation | undefined>>;
    for (const route of routes.filter((candidate) => centralGuardCovers(candidate, centralDescriptors))) {
      const openApiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
      const operation = paths[openApiPath]?.[route.method.toLowerCase()];
      if (!operation) {
        gaps.push(`${route.method} ${route.path}: missing OpenAPI operation`);
        continue;
      }
      const queryRevision = operation.parameters?.some((parameter) =>
        parameter.in === "query" && parameter.name === "expectedUpdatedAt" && parameter.required === true
      );
      const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
      const bodyRevision = bodySchema ? schemaRequiresProperty(bodySchema, "expectedUpdatedAt") : false;
      if (!queryRevision && !bodyRevision) {
        gaps.push(`${route.method} ${route.path}: OpenAPI omits required expectedUpdatedAt (${bodySchema?.$ref ?? (bodySchema ? "inline" : "no JSON body")})`);
      }
    }
    expect(gaps).toEqual([]);
  });
});

type OpenApiSchema = {
  $ref?: string;
  required?: readonly string[];
  properties?: Record<string, OpenApiSchema>;
  allOf?: readonly OpenApiSchema[];
  oneOf?: readonly OpenApiSchema[];
  anyOf?: readonly OpenApiSchema[];
};

type OpenApiOperation = {
  parameters?: ReadonlyArray<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>;
};

function requiredHeader(operation: OpenApiOperation, name: string): boolean {
  return operation.parameters?.some((parameter) => parameter.in === "header" && parameter.name?.toLowerCase() === name.toLowerCase() && parameter.required === true) ?? false;
}

function schemaHasProperty(schema: OpenApiSchema, property: string, seen = new Set<string>()): boolean {
  if (schema.$ref?.startsWith("#/components/schemas/")) {
    if (seen.has(schema.$ref)) return false;
    seen.add(schema.$ref);
    const name = schema.$ref.slice("#/components/schemas/".length);
    const component = (openApiSpec.components.schemas as Record<string, OpenApiSchema>)[name];
    return component ? schemaHasProperty(component, property, seen) : false;
  }
  if (schema.properties?.[property]) return true;
  return [...Object.values(schema.properties ?? {}), ...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])]
    .some((candidate) => schemaHasProperty(candidate, property, new Set(seen)));
}

function schemaRequiresProperty(schema: OpenApiSchema, property: string, seen = new Set<string>()): boolean {
  if (schema.$ref?.startsWith("#/components/schemas/")) {
    if (seen.has(schema.$ref)) return false;
    seen.add(schema.$ref);
    const name = schema.$ref.slice("#/components/schemas/".length);
    const component = (openApiSpec.components.schemas as Record<string, OpenApiSchema>)[name];
    return component ? schemaRequiresProperty(component, property, seen) : false;
  }
  if (schema.required?.includes(property) && schema.properties?.[property]) return true;
  return [...(schema.allOf ?? []), ...(schema.oneOf ?? []), ...(schema.anyOf ?? [])].some((candidate) => schemaRequiresProperty(candidate, property, new Set(seen)));
}
