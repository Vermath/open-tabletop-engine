import { createHash, timingSafeEqual } from "node:crypto";
import {
  createTimestamped,
  nowIso,
  type AuditLog,
  type CampaignMember,
  type ScimAssignableRole,
  type ScimGroup,
  type ScimGroupRoleMapping,
  type User,
} from "@open-tabletop/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { normalizeOperatorTargetSetHash, operatorTargetSetHash } from "./operator-mutation.js";
import type { StateStore } from "./store.js";

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_SERVICE_PROVIDER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const SCIM_ETAG_PATTERN = /^"scim-sha256-[a-f0-9]{64}"$/;

export interface ScimIdempotencyIdentity {
  userId: string;
  authorizationHash: string;
}

interface ServerAuditLogInput {
  campaignId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}

export interface RegisterScimRoutesOptions {
  store: StateStore;
  requireServerAdmin(request: FastifyRequest, reply: FastifyReply): string | FastifyReply;
  appendAdminReadAudit(actorUserId: string, input: ServerAuditLogInput): void;
}

interface ScimListQuery {
  filter?: string;
  startIndex?: string;
  count?: string;
}

interface ScimUserInput {
  userName?: string | null;
  externalId?: string | null;
  displayName?: string | null;
  active?: boolean;
  name?: { formatted?: string | null; givenName?: string | null; familyName?: string | null } | null;
  emails?: Array<{ value?: string; primary?: boolean; type?: string }>;
}

interface ScimGroupInput {
  displayName?: string | null;
  externalId?: string | null;
  members?: Array<{ value?: string }>;
}

interface ScimPatchInput {
  Operations?: Array<{ op?: string; path?: string; value?: unknown }>;
}

export interface AdminScimGroupRoleMappingInput {
  groupId?: string;
  groupExternalId?: string;
  groupDisplayName?: string;
  campaignId?: string;
  role?: string;
  preparedTargetSetHash?: string;
}

interface AdminScimGroupRoleMappingDeleteInput {
  expectedUpdatedAt?: unknown;
  preparedTargetSetHash?: unknown;
}

interface NormalizedScimUser {
  userName: string;
  email?: string;
  displayName: string;
  externalId?: string;
  active: boolean;
}

interface NormalizedScimGroup {
  displayName: string;
  externalId?: string;
  memberUserIds: string[];
}

export interface ScimGroupRoleSyncResult {
  matchedGroups: number;
  createdMemberships: number;
  updatedMemberships: number;
  removedMemberships: number;
  preservedManualMemberships: number;
}

type NormalizedScimMapping = Omit<ScimGroupRoleMapping, "id" | "createdAt" | "updatedAt">;

/**
 * Returns a credential-scoped replay principal only for the configured SCIM
 * bearer. The synthetic identity cannot collide with user, worker, plugin, or
 * AI identities, and token rotation creates a distinct replay namespace.
 */
export function scimIdempotencyIdentityFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): ScimIdempotencyIdentity | undefined {
  const token = authenticatedScimToken(headers);
  if (!token) return undefined;
  const credentialFingerprint = createHash("sha256").update(token).digest("hex");
  return {
    userId: `scim:${credentialFingerprint}`,
    authorizationHash: createHash("sha256")
      .update(stableJson({ principal: "scim", credentialFingerprint }))
      .digest("hex"),
  };
}

/** Includes the strong validator in the logical request identity for SCIM. */
export function scimIdempotencyRequestRepresentation(
  path: string,
  body: unknown,
  headers: Record<string, string | string[] | undefined>,
): unknown {
  if (!path.split("?")[0]?.startsWith("/api/v1/scim/v2/")) return body;
  return { body, ifMatch: singleHeader(headers["if-match"]) ?? null };
}

/** Restores safe protocol headers that the generic durable replay record omits. */
export function scimReplayResponseHeaders(path: string, responseBody: string, statusCode: number): Record<string, string> {
  if (!path.split("?")[0]?.startsWith("/api/v1/scim/v2/")) return {};
  let value: unknown;
  try {
    value = JSON.parse(responseBody) as unknown;
  } catch {
    return {};
  }
  if (!isRecord(value) || !isRecord(value.meta)) return {};
  const etag = typeof value.meta.version === "string" && SCIM_ETAG_PATTERN.test(value.meta.version) ? value.meta.version : undefined;
  const location = typeof value.meta.location === "string" ? value.meta.location : undefined;
  return { ...(etag ? { etag } : {}), ...(location && statusCode === 201 ? { location } : {}) };
}

export function registerScimRoutes(app: FastifyInstance, options: RegisterScimRoutesOptions): void {
  const { store } = options;

  app.get("/api/v1/admin/scim/group-role-mappings", async (request, reply) => {
    const adminUserId = options.requireServerAdmin(request, reply);
    if (typeof adminUserId !== "string") return adminUserId;
    const mappings = store.state.scimGroupRoleMappings.map((mapping) => publicScimGroupRoleMapping(store, mapping));
    options.appendAdminReadAudit(adminUserId, {
      action: "admin.scim.groupRoleMappings.list",
      targetType: "scim_group_role_mapping",
      after: { count: mappings.length },
    });
    return mappings;
  });

  app.get<{ Querystring: AdminScimGroupRoleMappingInput }>("/api/v1/admin/scim/group-role-mappings/preview", async (request, reply) => {
    const adminUserId = options.requireServerAdmin(request, reply);
    if (typeof adminUserId !== "string") return adminUserId;
    const normalized = normalizeScimGroupRoleMappingInput(store, request.query ?? {});
    if ("error" in normalized) return regularError(reply, 400, normalized.error);
    const preparation = scimMappingCreatePreparation(store, normalized);
    options.appendAdminReadAudit(adminUserId, {
      action: "admin.scim.groupRoleMapping.preview",
      targetType: "scim_group_role_mapping",
      after: {
        campaignId: normalized.campaignId,
        role: normalized.role,
        selector: scimGroupRoleMappingIdentity(normalized),
        matchedGroupId: preparation.group?.id,
        memberCount: preparation.group?.memberUserIds.length ?? 0,
        affectedMembershipCount: preparation.affectedCampaignMemberships.length,
        targetSetHash: preparation.targetSetHash,
      },
    });
    return publicScimMappingCreatePreparation(preparation);
  });

  app.post<{ Body: AdminScimGroupRoleMappingInput }>("/api/v1/admin/scim/group-role-mappings", async (request, reply) => {
    const adminUserId = options.requireServerAdmin(request, reply);
    if (typeof adminUserId !== "string") return adminUserId;
    if (!idempotencyKey(request.headers)) return regularError(reply, 400, "SCIM group role mapping creation requires an Idempotency-Key header");
    const normalized = normalizeScimGroupRoleMappingInput(store, request.body ?? {});
    if ("error" in normalized) return regularError(reply, 400, normalized.error);
    const expectedTargetSetHash = normalizeOperatorTargetSetHash(request.body?.preparedTargetSetHash);
    if (!expectedTargetSetHash) return regularError(reply, 400, "preparedTargetSetHash must be a sha256 target-set hash from the mapping preview");
    const preparation = scimMappingCreatePreparation(store, normalized);
    if (preparation.targetSetHash !== expectedTargetSetHash) return regularError(reply, 409, "SCIM group or affected campaign membership changed after preview; refresh and retry");
    const duplicate = store.state.scimGroupRoleMappings.find((mapping) =>
      mapping.campaignId === normalized.campaignId
      && mapping.role === normalized.role
      && scimGroupRoleMappingIdentity(mapping) === scimGroupRoleMappingIdentity(normalized));
    if (duplicate) return regularError(reply, 409, "SCIM group role mapping already exists");

    return withScimMutationRollback(store, () => {
      const mapping = createTimestamped("scimmap", normalized) satisfies ScimGroupRoleMapping;
      store.state.scimGroupRoleMappings.push(mapping);
      const sync = syncScimGroupRoleMapping(store, mapping);
      appendServerAuditLog(store, adminUserId, {
        action: "admin.scim.groupRoleMapping.create",
        targetType: "scim_group_role_mapping",
        targetId: mapping.id,
        after: { mapping: publicScimGroupRoleMapping(store, mapping), preparation, sync },
      });
      store.save();
      reply.code(201);
      return { mapping: publicScimGroupRoleMapping(store, mapping), sync };
    });
  });

  app.delete<{ Params: { mappingId: string }; Body: AdminScimGroupRoleMappingDeleteInput }>("/api/v1/admin/scim/group-role-mappings/:mappingId", async (request, reply) => {
    const adminUserId = options.requireServerAdmin(request, reply);
    if (typeof adminUserId !== "string") return adminUserId;
    if (!idempotencyKey(request.headers)) return regularError(reply, 400, "SCIM group role mapping deletion requires an Idempotency-Key header");
    if (!isRecord(request.body)) return regularError(reply, 400, "SCIM group role mapping deletion body must be a JSON object");
    const mapping = store.state.scimGroupRoleMappings.find((item) => item.id === request.params.mappingId);
    if (!mapping) return regularError(reply, 404, "SCIM group role mapping not found");
    const expectedUpdatedAt = normalizeText(request.body.expectedUpdatedAt);
    if (!expectedUpdatedAt) return regularError(reply, 400, "expectedUpdatedAt is required");
    if (mapping.updatedAt !== expectedUpdatedAt) return regularError(reply, 409, "SCIM group role mapping changed; refresh and retry");
    const expectedTargetSetHash = normalizeOperatorTargetSetHash(request.body.preparedTargetSetHash);
    if (!expectedTargetSetHash) return regularError(reply, 400, "preparedTargetSetHash must be the mapping targetSetHash from the latest read");
    const currentTargetSetHash = scimMappingDeleteTargetSetHash(store, mapping);
    if (currentTargetSetHash !== expectedTargetSetHash) return regularError(reply, 409, "SCIM group or affected campaign membership changed; refresh and retry");

    return withScimMutationRollback(store, () => {
      const before = publicScimGroupRoleMapping(store, mapping);
      const removedMemberships = removeScimGroupRoleMappingMemberships(store, mapping.id);
      store.state.scimGroupRoleMappings = store.state.scimGroupRoleMappings.filter((item) => item.id !== mapping.id);
      appendServerAuditLog(store, adminUserId, {
        action: "admin.scim.groupRoleMapping.delete",
        targetType: "scim_group_role_mapping",
        targetId: mapping.id,
        before,
        after: { removedMemberships, expectedUpdatedAt, preparedTargetSetHash: currentTargetSetHash },
      });
      store.save();
      return { removedMemberships };
    });
  });

  app.get("/api/v1/scim/v2/ServiceProviderConfig", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    return {
      schemas: [SCIM_SERVICE_PROVIDER_SCHEMA],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: true },
      authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", primary: true }],
    };
  });

  app.get<{ Querystring: ScimListQuery }>("/api/v1/scim/v2/Users", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    return scimListResponse(filterScimUsers(store.state.users, request.query), request.query, (user) => scimUserResource(user, request.headers));
  });

  app.post<{ Body: ScimUserInput }>("/api/v1/scim/v2/Users", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    if (!idempotencyKey(request.headers)) return scimError(reply, 400, "SCIM user creation requires an Idempotency-Key header");
    const normalized = normalizeScimUserInput(request.body ?? {});
    if ("error" in normalized) return scimError(reply, 400, normalized.error);
    if (findScimUser(store, normalized.userName, normalized.email)) return scimError(reply, 409, "SCIM user already exists");
    return withScimMutationRollback(store, () => {
      const now = nowIso();
      const user = createTimestamped("usr", {
        displayName: normalized.displayName,
        email: normalized.email,
        passwordResetRequired: true,
        scim: { userName: normalized.userName, externalId: normalized.externalId, syncedAt: now },
      }) satisfies User;
      if (normalized.active === false) setScimUserActive(store, user, false);
      store.state.users.push(user);
      appendSystemAuditLog(store, {
        action: "scim.user.create",
        targetType: "user",
        targetId: user.id,
        after: publicUser(user),
      });
      store.save();
      reply.code(201).header("location", scimLocation(request.headers, `/api/v1/scim/v2/Users/${user.id}`));
      return sendScimUser(reply, user, request.headers);
    });
  });

  app.get<{ Params: { userId: string } }>("/api/v1/scim/v2/Users/:userId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return scimError(reply, 404, "SCIM user not found");
    return sendScimUser(reply, user, request.headers);
  });

  app.put<{ Params: { userId: string }; Body: ScimUserInput }>("/api/v1/scim/v2/Users/:userId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return scimError(reply, 404, "SCIM user not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimUserEtag(user));
    if (precondition !== true) return precondition;
    const normalized = normalizeScimUserInput(request.body ?? {}, user);
    if ("error" in normalized) return scimError(reply, 400, normalized.error);
    if (findScimUser(store, normalized.userName, normalized.email, user.id)) return scimError(reply, 409, "SCIM user already exists");
    return withScimMutationRollback(store, () => {
      const before = publicUser(user);
      applyScimUserInput(store, user, normalized);
      appendSystemAuditLog(store, { action: "scim.user.replace", targetType: "user", targetId: user.id, before, after: publicUser(user) });
      store.save();
      return sendScimUser(reply, user, request.headers);
    });
  });

  app.patch<{ Params: { userId: string }; Body: ScimPatchInput }>("/api/v1/scim/v2/Users/:userId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return scimError(reply, 404, "SCIM user not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimUserEtag(user));
    if (precondition !== true) return precondition;
    const snapshot = scimMutationSnapshot(store);
    const before = publicUser(user);
    const patched = applyScimPatchToUser(store, user, request.body);
    if ("error" in patched) {
      restoreScimMutationSnapshot(store, snapshot);
      return scimError(reply, 400, patched.error);
    }
    try {
      appendSystemAuditLog(store, { action: "scim.user.patch", targetType: "user", targetId: user.id, before, after: publicUser(user) });
      store.save();
      return sendScimUser(reply, user, request.headers);
    } catch (error) {
      restoreScimMutationSnapshot(store, snapshot);
      throw error;
    }
  });

  app.delete<{ Params: { userId: string } }>("/api/v1/scim/v2/Users/:userId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const user = store.state.users.find((item) => item.id === request.params.userId);
    if (!user) return scimError(reply, 404, "SCIM user not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimUserEtag(user));
    if (precondition !== true) return precondition;
    return withScimMutationRollback(store, () => {
      const before = publicUser(user);
      setScimUserActive(store, user, false);
      appendSystemAuditLog(store, { action: "scim.user.deactivate", targetType: "user", targetId: user.id, before, after: publicUser(user) });
      store.save();
      return reply.code(204).send();
    });
  });

  app.get<{ Querystring: ScimListQuery }>("/api/v1/scim/v2/Groups", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    return scimListResponse(filterScimGroups(store.state.scimGroups, request.query), request.query, (group) => scimGroupResource(group, request.headers));
  });

  app.post<{ Body: ScimGroupInput }>("/api/v1/scim/v2/Groups", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    if (!idempotencyKey(request.headers)) return scimError(reply, 400, "SCIM group creation requires an Idempotency-Key header");
    const normalized = normalizeScimGroupInput(store, request.body ?? {});
    if ("error" in normalized) return scimError(reply, 400, normalized.error);
    if (findScimGroup(store, normalized.displayName, normalized.externalId)) return scimError(reply, 409, "SCIM group already exists");
    return withScimMutationRollback(store, () => {
      const group = createTimestamped("scimg", {
        displayName: normalized.displayName,
        externalId: normalized.externalId,
        memberUserIds: normalized.memberUserIds,
      }) satisfies ScimGroup;
      store.state.scimGroups.push(group);
      const sync = syncScimGroupRoleMappingsForGroup(store, group);
      appendSystemAuditLog(store, {
        action: "scim.group.create",
        targetType: "scim_group",
        targetId: group.id,
        after: { group: scimGroupResource(group, request.headers), sync },
      });
      store.save();
      reply.code(201).header("location", scimLocation(request.headers, `/api/v1/scim/v2/Groups/${group.id}`));
      return sendScimGroup(reply, group, request.headers);
    });
  });

  app.get<{ Params: { groupId: string } }>("/api/v1/scim/v2/Groups/:groupId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const group = store.state.scimGroups.find((item) => item.id === request.params.groupId);
    if (!group) return scimError(reply, 404, "SCIM group not found");
    return sendScimGroup(reply, group, request.headers);
  });

  app.put<{ Params: { groupId: string }; Body: ScimGroupInput }>("/api/v1/scim/v2/Groups/:groupId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const group = store.state.scimGroups.find((item) => item.id === request.params.groupId);
    if (!group) return scimError(reply, 404, "SCIM group not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimGroupEtag(group));
    if (precondition !== true) return precondition;
    const normalized = normalizeScimGroupInput(store, request.body ?? {});
    if ("error" in normalized) return scimError(reply, 400, normalized.error);
    if (findScimGroup(store, normalized.displayName, normalized.externalId, group.id)) return scimError(reply, 409, "SCIM group already exists");
    return withScimMutationRollback(store, () => {
      const before = scimGroupResource(group, request.headers);
      group.displayName = normalized.displayName;
      group.externalId = normalized.externalId;
      group.memberUserIds = normalized.memberUserIds;
      group.updatedAt = nowIso();
      const sync = syncScimGroupRoleMappingsForGroup(store, group);
      appendSystemAuditLog(store, { action: "scim.group.replace", targetType: "scim_group", targetId: group.id, before, after: { group: scimGroupResource(group, request.headers), sync } });
      store.save();
      return sendScimGroup(reply, group, request.headers);
    });
  });

  app.patch<{ Params: { groupId: string }; Body: ScimPatchInput }>("/api/v1/scim/v2/Groups/:groupId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const group = store.state.scimGroups.find((item) => item.id === request.params.groupId);
    if (!group) return scimError(reply, 404, "SCIM group not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimGroupEtag(group));
    if (precondition !== true) return precondition;
    const snapshot = scimMutationSnapshot(store);
    const before = scimGroupResource(group, request.headers);
    const patched = applyScimPatchToGroup(store, group, request.body);
    if ("error" in patched) {
      restoreScimMutationSnapshot(store, snapshot);
      return scimError(reply, 400, patched.error);
    }
    if (findScimGroup(store, group.displayName, group.externalId, group.id)) {
      restoreScimMutationSnapshot(store, snapshot);
      return scimError(reply, 409, "SCIM group already exists");
    }
    try {
      const sync = syncScimGroupRoleMappingsForGroup(store, group);
      appendSystemAuditLog(store, { action: "scim.group.patch", targetType: "scim_group", targetId: group.id, before, after: { group: scimGroupResource(group, request.headers), sync } });
      store.save();
      return sendScimGroup(reply, group, request.headers);
    } catch (error) {
      restoreScimMutationSnapshot(store, snapshot);
      throw error;
    }
  });

  app.delete<{ Params: { groupId: string } }>("/api/v1/scim/v2/Groups/:groupId", async (request, reply) => {
    const authorized = requireScimBearer(reply, request.headers);
    if (authorized !== true) return authorized;
    const group = store.state.scimGroups.find((item) => item.id === request.params.groupId);
    if (!group) return scimError(reply, 404, "SCIM group not found");
    const precondition = requireScimMutationPreconditions(request, reply, scimGroupEtag(group));
    if (precondition !== true) return precondition;
    return withScimMutationRollback(store, () => {
      const before = scimGroupResource(group, request.headers);
      const removedMemberships = removeScimGroupRoleMembershipsForGroup(store, group);
      store.state.scimGroups = store.state.scimGroups.filter((item) => item.id !== group.id);
      appendSystemAuditLog(store, { action: "scim.group.delete", targetType: "scim_group", targetId: group.id, before, after: { removedMemberships } });
      store.save();
      return reply.code(204).send();
    });
  });
}

function requireScimMutationPreconditions(request: FastifyRequest, reply: FastifyReply, currentEtag: string): true | FastifyReply {
  if (!idempotencyKey(request.headers)) return scimError(reply, 400, "SCIM mutations require an Idempotency-Key header");
  const rawIfMatch = singleHeader(request.headers["if-match"]);
  if (!rawIfMatch) return scimError(reply, 428, "A strong If-Match validator is required");
  if (rawIfMatch === "*" || rawIfMatch.startsWith("W/") || rawIfMatch.includes(",") || !SCIM_ETAG_PATTERN.test(rawIfMatch)) {
    return scimError(reply, 400, "If-Match must contain one strong SCIM ETag and cannot use wildcard or weak validators");
  }
  if (rawIfMatch !== currentEtag) return scimError(reply, 412, "SCIM resource version is stale");
  return true;
}

function sendScimUser(reply: FastifyReply, user: User, headers: Record<string, string | string[] | undefined>): unknown {
  const etag = scimUserEtag(user);
  reply.header("etag", etag);
  return scimUserResource(user, headers, etag);
}

function sendScimGroup(reply: FastifyReply, group: ScimGroup, headers: Record<string, string | string[] | undefined>): unknown {
  const etag = scimGroupEtag(group);
  reply.header("etag", etag);
  return scimGroupResource(group, headers, etag);
}

export function scimUserEtag(user: User): string {
  return scimStrongEtag({ resourceType: "User", resource: user });
}

export function scimGroupEtag(group: ScimGroup): string {
  return scimStrongEtag({ resourceType: "Group", resource: group });
}

function scimStrongEtag(value: unknown): string {
  return `"scim-sha256-${createHash("sha256").update(stableJson(value)).digest("hex")}"`;
}

function requireScimBearer(reply: FastifyReply, headers: Record<string, string | string[] | undefined>): true | FastifyReply {
  const expected = process.env.OTTE_SCIM_BEARER_TOKEN?.trim();
  if (!expected) return regularError(reply, 404, "SCIM is not configured");
  if (!authenticatedScimToken(headers)) return regularError(reply, 401, "SCIM bearer token required");
  return true;
}

function authenticatedScimToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const expected = process.env.OTTE_SCIM_BEARER_TOKEN?.trim();
  if (!expected) return undefined;
  const authorization = singleHeader(headers.authorization);
  const token = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice("bearer ".length).trim() : undefined;
  if (!token || !safeStringEqual(token, expected)) return undefined;
  return token;
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function scimLocation(headers: Record<string, string | string[] | undefined>, path: string): string {
  const host = singleHeader(headers["x-forwarded-host"]) ?? singleHeader(headers.host) ?? "localhost";
  const protocol = singleHeader(headers["x-forwarded-proto"]) ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}${path}`;
}

function scimListResponse<T>(items: T[], query: ScimListQuery, mapItem: (item: T) => unknown): unknown {
  const startIndex = Math.max(1, Number.parseInt(query.startIndex ?? "1", 10) || 1);
  const count = Math.max(0, Math.min(200, Number.parseInt(query.count ?? "100", 10) || 100));
  const resources = items.slice(startIndex - 1, startIndex - 1 + count).map(mapItem);
  return { schemas: [SCIM_LIST_SCHEMA], totalResults: items.length, startIndex, itemsPerPage: resources.length, Resources: resources };
}

function filterScimUsers(users: User[], query: ScimListQuery): User[] {
  const filter = parseScimEqFilter(query.filter);
  if (!filter) return users;
  return users.filter((user) => {
    const value = filter.value.toLowerCase();
    if (filter.path === "username") return (user.scim?.userName ?? user.email ?? "").toLowerCase() === value;
    if (filter.path === "externalid") return (user.scim?.externalId ?? "").toLowerCase() === value;
    if (filter.path === "email" || filter.path === "emails.value") return (user.email ?? "").toLowerCase() === value;
    return false;
  });
}

function filterScimGroups(groups: ScimGroup[], query: ScimListQuery): ScimGroup[] {
  const filter = parseScimEqFilter(query.filter);
  if (!filter) return groups;
  return groups.filter((group) => {
    const value = filter.value.toLowerCase();
    if (filter.path === "displayname") return group.displayName.toLowerCase() === value;
    if (filter.path === "externalid") return (group.externalId ?? "").toLowerCase() === value;
    return false;
  });
}

function parseScimEqFilter(filter: string | undefined): { path: string; value: string } | undefined {
  const match = filter?.trim().match(/^([\w.]+)\s+eq\s+"([^"]+)"$/i);
  return match ? { path: match[1]!.toLowerCase(), value: match[2]! } : undefined;
}

function scimUserResource(user: User, headers: Record<string, string | string[] | undefined>, etag = scimUserEtag(user)): unknown {
  const userName = user.scim?.userName ?? user.email ?? user.id;
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.scim?.externalId,
    userName,
    displayName: user.displayName,
    name: { formatted: user.displayName },
    active: !isDisabledUser(user),
    emails: user.email ? [{ value: user.email, primary: true, type: "work" }] : [],
    meta: {
      resourceType: "User",
      created: user.createdAt,
      lastModified: user.updatedAt,
      version: etag,
      location: scimLocation(headers, `/api/v1/scim/v2/Users/${user.id}`),
    },
  };
}

function scimGroupResource(group: ScimGroup, headers: Record<string, string | string[] | undefined>, etag = scimGroupEtag(group)): unknown {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: group.id,
    externalId: group.externalId,
    displayName: group.displayName,
    members: group.memberUserIds.map((userId) => ({ value: userId, $ref: scimLocation(headers, `/api/v1/scim/v2/Users/${userId}`) })),
    meta: {
      resourceType: "Group",
      created: group.createdAt,
      lastModified: group.updatedAt,
      version: etag,
      location: scimLocation(headers, `/api/v1/scim/v2/Groups/${group.id}`),
    },
  };
}

function normalizeScimUserInput(input: ScimUserInput, existing?: User): NormalizedScimUser | { error: string } {
  if (!isRecord(input)) return { error: "SCIM user payload must be an object" };
  if (![input.userName, input.externalId, input.displayName].every(isOptionalNullableString)) return { error: "SCIM user text fields must be strings" };
  if (input.name !== undefined && input.name !== null && (!isRecord(input.name) || ![input.name.formatted, input.name.givenName, input.name.familyName].every(isOptionalNullableString))) {
    return { error: "SCIM name fields must be strings" };
  }
  if (input.emails !== undefined && !isValidScimEmails(input.emails)) return { error: "SCIM emails must be an array of email records" };
  if (input.active !== undefined && typeof input.active !== "boolean") return { error: "SCIM active must be a boolean" };
  const inputEmail = scimEmail(input);
  const userName = normalizeText(input.userName) ?? existing?.scim?.userName ?? inputEmail ?? existing?.email;
  if (!userName) return { error: "SCIM userName is required" };
  const email = inputEmail ?? normalizeEmail(userName) ?? existing?.email;
  const displayName = normalizeDisplayName(input.displayName) ?? normalizeDisplayName(input.name?.formatted) ?? existing?.displayName ?? email ?? userName;
  const externalId = Object.prototype.hasOwnProperty.call(input, "externalId") ? normalizeText(input.externalId) : existing?.scim?.externalId;
  return { userName, email, displayName, externalId, active: input.active ?? (existing ? !isDisabledUser(existing) : true) };
}

function scimEmail(input: ScimUserInput): string | undefined {
  if (!isValidScimEmails(input.emails)) return undefined;
  return normalizeEmail(input.emails.find((email) => email.primary)?.value ?? input.emails[0]?.value);
}

function isValidScimEmails(value: unknown): value is Array<{ value: string; primary?: boolean; type?: string }> {
  return Array.isArray(value) && value.every((email) => isRecord(email) && typeof email.value === "string" && (email.primary === undefined || typeof email.primary === "boolean") && (email.type === undefined || typeof email.type === "string"));
}

function findScimUser(store: StateStore, userName: string | undefined, email: string | undefined, exceptUserId?: string): User | undefined {
  const normalizedUserName = userName?.toLowerCase();
  const normalizedEmail = normalizeEmail(email);
  return store.state.users.find((user) => {
    if (exceptUserId && user.id === exceptUserId) return false;
    if (normalizedUserName && (user.scim?.userName ?? user.email ?? "").toLowerCase() === normalizedUserName) return true;
    return Boolean(normalizedEmail && normalizeEmail(user.email) === normalizedEmail);
  });
}

function findScimGroup(store: StateStore, displayName: string | undefined, externalId: string | undefined, exceptGroupId?: string): ScimGroup | undefined {
  const normalizedDisplayName = displayName?.toLowerCase();
  return store.state.scimGroups.find((group) => {
    if (exceptGroupId && group.id === exceptGroupId) return false;
    if (normalizedDisplayName && group.displayName.toLowerCase() === normalizedDisplayName) return true;
    return Boolean(externalId && group.externalId === externalId);
  });
}

const scimAssignableRoles = new Set<ScimAssignableRole>(["gm", "assistant_gm", "player", "observer"]);

function normalizeScimGroupRoleMappingInput(store: StateStore, input: AdminScimGroupRoleMappingInput): NormalizedScimMapping | { error: string } {
  const role = normalizeScimAssignableRole(input.role);
  if (!role) return { error: "SCIM group role mapping role must be gm, assistant_gm, player, or observer" };
  const campaignId = normalizeText(input.campaignId);
  if (!campaignId || !store.state.campaigns.some((campaign) => campaign.id === campaignId)) return { error: "SCIM group role mapping campaignId is required" };
  const groupId = normalizeText(input.groupId);
  const groupExternalId = normalizeText(input.groupExternalId);
  const groupDisplayName = normalizeText(input.groupDisplayName);
  if ([groupId, groupExternalId, groupDisplayName].filter(Boolean).length !== 1) return { error: "SCIM group role mapping requires exactly one of groupId, groupExternalId, or groupDisplayName" };
  if (groupId && !store.state.scimGroups.some((group) => group.id === groupId)) return { error: "SCIM group role mapping groupId was not found" };
  return { groupId, groupExternalId, groupDisplayName, campaignId, role };
}

function normalizeScimAssignableRole(value: string | undefined): ScimAssignableRole | undefined {
  return scimAssignableRoles.has(value as ScimAssignableRole) ? value as ScimAssignableRole : undefined;
}

function scimGroupRoleMappingIdentity(mapping: Pick<ScimGroupRoleMapping, "groupId" | "groupExternalId" | "groupDisplayName">): string {
  if (mapping.groupId) return `id:${mapping.groupId}`;
  if (mapping.groupExternalId) return `externalId:${mapping.groupExternalId}`;
  return `displayName:${mapping.groupDisplayName?.toLowerCase() ?? ""}`;
}

function publicScimGroupRoleMapping(store: StateStore, mapping: ScimGroupRoleMapping): ScimGroupRoleMapping & {
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt">;
  targetSetHash: string;
} {
  const group = findGroupForScimGroupRoleMapping(store, mapping);
  return {
    ...mapping,
    group: group ? { id: group.id, displayName: group.displayName, externalId: group.externalId, memberUserIds: [...group.memberUserIds], updatedAt: group.updatedAt } : undefined,
    targetSetHash: scimMappingDeleteTargetSetHash(store, mapping),
  };
}

function scimMappingCreatePreparation(store: StateStore, normalized: NormalizedScimMapping): {
  normalized: NormalizedScimMapping;
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt">;
  affectedCampaignMemberships: ReturnType<typeof scimAffectedCampaignMemberships>;
  targetSetHash: string;
} {
  const group = findGroupForScimGroupRoleMapping(store, normalized);
  const groupSnapshot = group ? scimGroupPreparationSnapshot(group) : undefined;
  const affectedCampaignMemberships = scimAffectedCampaignMemberships(store, normalized.campaignId, group?.memberUserIds ?? []);
  const targets = {
    operation: "create",
    mapping: normalized,
    group: groupSnapshot ?? null,
    affectedCampaignMemberships,
  };
  return { normalized, group: groupSnapshot, affectedCampaignMemberships, targetSetHash: operatorTargetSetHash(targets) };
}

function publicScimMappingCreatePreparation(preparation: ReturnType<typeof scimMappingCreatePreparation>): {
  selection: NormalizedScimMapping;
  group?: Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt">;
  memberCount: number;
  affectedCampaignMembershipCount: number;
  targetSetHash: string;
} {
  return {
    selection: preparation.normalized,
    group: preparation.group,
    memberCount: preparation.group?.memberUserIds.length ?? 0,
    affectedCampaignMembershipCount: preparation.affectedCampaignMemberships.length,
    targetSetHash: preparation.targetSetHash,
  };
}

function scimMappingDeleteTargetSetHash(store: StateStore, mapping: ScimGroupRoleMapping): string {
  const group = findGroupForScimGroupRoleMapping(store, mapping);
  const relevantUserIds = new Set([
    ...(group?.memberUserIds ?? []),
    ...store.state.members.filter((member) => member.source?.type === "scim_group" && member.source.mappingId === mapping.id).map((member) => member.userId),
  ]);
  return operatorTargetSetHash({
    operation: "delete",
    mapping: { ...mapping },
    group: group ? scimGroupPreparationSnapshot(group) : null,
    affectedCampaignMemberships: scimAffectedCampaignMemberships(store, mapping.campaignId, [...relevantUserIds]),
  });
}

function scimGroupPreparationSnapshot(group: ScimGroup): Pick<ScimGroup, "id" | "displayName" | "externalId" | "memberUserIds" | "updatedAt"> {
  return { id: group.id, displayName: group.displayName, externalId: group.externalId, updatedAt: group.updatedAt, memberUserIds: [...group.memberUserIds].sort() };
}

function scimAffectedCampaignMemberships(store: StateStore, campaignId: string, userIds: string[]): Array<Pick<CampaignMember, "id" | "userId" | "role" | "updatedAt" | "source">> {
  const selected = new Set(userIds);
  return store.state.members
    .filter((member) => member.campaignId === campaignId && selected.has(member.userId))
    .map((member) => ({ id: member.id, userId: member.userId, role: member.role, updatedAt: member.updatedAt, source: member.source }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function syncScimGroupRoleMappingsForGroup(store: StateStore, group: ScimGroup): ScimGroupRoleSyncResult {
  const mappings = store.state.scimGroupRoleMappings.filter((mapping) =>
    scimGroupRoleMappingMatchesGroup(mapping, group)
    || store.state.members.some((member) => member.source?.type === "scim_group" && member.source.groupId === group.id && member.source.mappingId === mapping.id));
  return combineScimGroupRoleSyncResults(mappings.map((mapping) => syncScimGroupRoleMapping(store, mapping, group)));
}

function syncScimGroupRoleMapping(store: StateStore, mapping: ScimGroupRoleMapping, knownGroup?: ScimGroup): ScimGroupRoleSyncResult {
  const group = knownGroup ? (scimGroupRoleMappingMatchesGroup(mapping, knownGroup) ? knownGroup : undefined) : findGroupForScimGroupRoleMapping(store, mapping);
  if (!group) return { matchedGroups: 0, createdMemberships: 0, updatedMemberships: 0, removedMemberships: removeScimGroupRoleMappingMemberships(store, mapping.id), preservedManualMemberships: 0 };
  const desiredUserIds = new Set(group.memberUserIds.filter((userId) => store.state.users.some((user) => user.id === userId)));
  let createdMemberships = 0;
  let updatedMemberships = 0;
  let preservedManualMemberships = 0;
  for (const userId of desiredUserIds) {
    const sourceMember = store.state.members.find((member) => member.source?.type === "scim_group" && member.source.mappingId === mapping.id && member.userId === userId);
    if (sourceMember) {
      if (sourceMember.role !== mapping.role || sourceMember.campaignId !== mapping.campaignId || sourceMember.source?.groupId !== group.id) {
        sourceMember.campaignId = mapping.campaignId;
        sourceMember.role = mapping.role;
        sourceMember.source = { type: "scim_group", groupId: group.id, mappingId: mapping.id };
        sourceMember.updatedAt = nowIso();
        updatedMemberships += 1;
      }
      continue;
    }
    const existingOtherMember = store.state.members.find((member) => member.campaignId === mapping.campaignId && member.userId === userId);
    if (existingOtherMember) {
      preservedManualMemberships += 1;
      continue;
    }
    store.state.members.push(createTimestamped("mem", {
      campaignId: mapping.campaignId,
      userId,
      role: mapping.role,
      source: { type: "scim_group" as const, groupId: group.id, mappingId: mapping.id },
    }) satisfies CampaignMember);
    createdMemberships += 1;
  }
  const before = store.state.members.length;
  store.state.members = store.state.members.filter((member) => member.source?.type !== "scim_group" || member.source.mappingId !== mapping.id || desiredUserIds.has(member.userId));
  return { matchedGroups: 1, createdMemberships, updatedMemberships, removedMemberships: before - store.state.members.length, preservedManualMemberships };
}

function removeScimGroupRoleMembershipsForGroup(store: StateStore, group: ScimGroup): number {
  const mappingIds = new Set(store.state.scimGroupRoleMappings.filter((mapping) => scimGroupRoleMappingMatchesGroup(mapping, group)).map((mapping) => mapping.id));
  const before = store.state.members.length;
  store.state.members = store.state.members.filter((member) => member.source?.type !== "scim_group" || !mappingIds.has(member.source.mappingId));
  return before - store.state.members.length;
}

function removeScimGroupRoleMappingMemberships(store: StateStore, mappingId: string): number {
  const before = store.state.members.length;
  store.state.members = store.state.members.filter((member) => member.source?.type !== "scim_group" || member.source.mappingId !== mappingId);
  return before - store.state.members.length;
}

function findGroupForScimGroupRoleMapping(store: StateStore, mapping: Pick<ScimGroupRoleMapping, "groupId" | "groupExternalId" | "groupDisplayName">): ScimGroup | undefined {
  return store.state.scimGroups.find((group) => scimGroupRoleMappingMatchesGroup(mapping, group));
}

function scimGroupRoleMappingMatchesGroup(mapping: Pick<ScimGroupRoleMapping, "groupId" | "groupExternalId" | "groupDisplayName">, group: ScimGroup): boolean {
  if (mapping.groupId && mapping.groupId === group.id) return true;
  if (mapping.groupExternalId && mapping.groupExternalId === group.externalId) return true;
  return Boolean(mapping.groupDisplayName && mapping.groupDisplayName.toLowerCase() === group.displayName.toLowerCase());
}

function combineScimGroupRoleSyncResults(results: ScimGroupRoleSyncResult[]): ScimGroupRoleSyncResult {
  return results.reduce<ScimGroupRoleSyncResult>((total, item) => ({
    matchedGroups: total.matchedGroups + item.matchedGroups,
    createdMemberships: total.createdMemberships + item.createdMemberships,
    updatedMemberships: total.updatedMemberships + item.updatedMemberships,
    removedMemberships: total.removedMemberships + item.removedMemberships,
    preservedManualMemberships: total.preservedManualMemberships + item.preservedManualMemberships,
  }), { matchedGroups: 0, createdMemberships: 0, updatedMemberships: 0, removedMemberships: 0, preservedManualMemberships: 0 });
}

function applyScimUserInput(store: StateStore, user: User, input: NormalizedScimUser): void {
  const now = nowIso();
  user.displayName = input.displayName;
  user.email = input.email;
  user.scim = { userName: input.userName, externalId: input.externalId, syncedAt: now };
  setScimUserActive(store, user, input.active);
  user.updatedAt = now;
}

function setScimUserActive(store: StateStore, user: User, active: boolean): void {
  const now = nowIso();
  if (active) {
    user.disabledAt = undefined;
    user.disabledByUserId = undefined;
    user.disabledReason = undefined;
  } else {
    user.disabledAt = user.disabledAt ?? now;
    user.disabledByUserId = undefined;
    user.disabledReason = "SCIM inactive";
    store.state.sessions = store.state.sessions.filter((session) => session.userId !== user.id);
  }
  user.updatedAt = now;
}

function applyScimPatchToUser(store: StateStore, user: User, body: ScimPatchInput | undefined): { ok: true } | { error: string } {
  const operations = body?.Operations;
  if (!Array.isArray(operations)) return { error: "SCIM patch Operations are required" };
  for (const operation of operations) {
    if (!isRecord(operation) || typeof operation.op !== "string" || (operation.path !== undefined && typeof operation.path !== "string")) return { error: "SCIM patch operations must contain string op and path values" };
    const op = operation.op.toLowerCase();
    if (op !== "replace" && op !== "add") return { error: "Only SCIM add and replace operations are supported" };
    const path = operation.path?.toLowerCase();
    if (!path && isRecord(operation.value)) {
      const normalized = normalizeScimUserInput(operation.value as ScimUserInput, user);
      if ("error" in normalized) return normalized;
      if (findScimUser(store, normalized.userName, normalized.email, user.id)) return { error: "SCIM user already exists" };
      applyScimUserInput(store, user, normalized);
      continue;
    }
    if (!path) return { error: "SCIM root patch value must be an object" };
    const result = applyScimUserPath(store, user, path, operation.value);
    if ("error" in result) return result;
  }
  user.scim = { ...(user.scim ?? {}), userName: user.scim?.userName ?? user.email ?? user.id, syncedAt: nowIso() };
  user.updatedAt = nowIso();
  return { ok: true };
}

function applyScimUserPath(store: StateStore, user: User, path: string, value: unknown): { ok: true } | { error: string } {
  if (path === "active") {
    if (typeof value !== "boolean") return { error: "SCIM active must be a boolean" };
    setScimUserActive(store, user, value);
    return { ok: true };
  }
  if (path === "displayname") {
    const displayName = normalizeDisplayName(value);
    if (!displayName) return { error: "SCIM displayName must be a non-empty string of 80 characters or fewer" };
    user.displayName = displayName;
    return { ok: true };
  }
  if (path === "username") {
    const userName = normalizeText(value);
    if (!userName) return { error: "SCIM userName is required" };
    const email = normalizeEmail(userName);
    if (findScimUser(store, userName, email, user.id)) return { error: "SCIM user already exists" };
    user.scim = { ...(user.scim ?? {}), userName };
    if (email) user.email = email;
    return { ok: true };
  }
  if (path === "externalid") {
    if (value !== null && typeof value !== "string") return { error: "SCIM externalId must be a string or null" };
    user.scim = { ...(user.scim ?? {}), externalId: normalizeText(value) };
    return { ok: true };
  }
  if (path === "emails" || path === "emails.value") {
    if (!Array.isArray(value) && typeof value !== "string") return { error: "SCIM email must be a string or email array" };
    const email = Array.isArray(value) ? scimEmail({ emails: value as ScimUserInput["emails"] }) : normalizeEmail(value);
    if (!email) return { error: "SCIM email is invalid" };
    if (findScimUser(store, undefined, email, user.id)) return { error: "SCIM user already exists" };
    user.email = email;
    return { ok: true };
  }
  return { error: `Unsupported SCIM user patch path: ${path}` };
}

function normalizeScimGroupInput(store: StateStore, input: ScimGroupInput, existing?: ScimGroup): NormalizedScimGroup | { error: string } {
  if (!isRecord(input)) return { error: "SCIM group payload must be an object" };
  if (![input.displayName, input.externalId].every(isOptionalNullableString)) return { error: "SCIM group text fields must be strings" };
  const displayName = normalizeDisplayName(input.displayName) ?? existing?.displayName;
  if (!displayName) return { error: "SCIM group displayName is required" };
  const members = input.members ?? existing?.memberUserIds.map((value) => ({ value })) ?? [];
  if (!Array.isArray(members) || !members.every((member) => isRecord(member) && typeof member.value === "string" && member.value.length > 0)) return { error: "SCIM group members must be an array of user references" };
  const memberUserIds = members.map((member) => member.value).filter((value): value is string => typeof value === "string");
  const missingUserId = memberUserIds.find((userId) => !store.state.users.some((user) => user.id === userId));
  if (missingUserId) return { error: `SCIM group member not found: ${missingUserId}` };
  return {
    displayName,
    externalId: Object.prototype.hasOwnProperty.call(input, "externalId") ? normalizeText(input.externalId) : existing?.externalId,
    memberUserIds: Array.from(new Set(memberUserIds)),
  };
}

function applyScimPatchToGroup(store: StateStore, group: ScimGroup, body: ScimPatchInput | undefined): { ok: true } | { error: string } {
  const operations = body?.Operations;
  if (!Array.isArray(operations)) return { error: "SCIM patch Operations are required" };
  for (const operation of operations) {
    if (!isRecord(operation) || typeof operation.op !== "string" || (operation.path !== undefined && typeof operation.path !== "string")) return { error: "SCIM patch operations must contain string op and path values" };
    const op = operation.op.toLowerCase();
    if (op !== "replace" && op !== "add" && op !== "remove") return { error: "Only SCIM add, replace, and remove operations are supported" };
    const path = operation.path?.toLowerCase();
    if (op === "remove" && path?.startsWith("members")) {
      const userId = scimPatchMemberValue(path, operation.value);
      if (!userId && (path !== "members" || operation.value !== undefined)) return { error: "SCIM member removal requires a user reference" };
      group.memberUserIds = userId ? group.memberUserIds.filter((item) => item !== userId) : [];
      continue;
    }
    if (path === "displayname") {
      const displayName = normalizeDisplayName(operation.value);
      if (!displayName) return { error: "SCIM group displayName must be a non-empty string of 80 characters or fewer" };
      group.displayName = displayName;
    } else if (path === "externalid") {
      if (op === "remove") group.externalId = undefined;
      else {
        if (operation.value !== null && typeof operation.value !== "string") return { error: "SCIM group externalId must be a string or null" };
        group.externalId = normalizeText(operation.value);
      }
    } else if (path === "members") {
      const normalized = normalizeScimGroupInput(store, { displayName: group.displayName, externalId: group.externalId, members: operation.value as ScimGroupInput["members"] }, group);
      if ("error" in normalized) return normalized;
      group.memberUserIds = op === "add" ? Array.from(new Set([...group.memberUserIds, ...normalized.memberUserIds])) : normalized.memberUserIds;
    } else return { error: `Unsupported SCIM group patch path: ${path ?? "root"}` };
  }
  group.updatedAt = nowIso();
  return { ok: true };
}

function scimPatchMemberValue(path: string | undefined, value: unknown): string | undefined {
  const pathMatch = path?.match(/members\[value eq "([^"]+)"\]/i)?.[1];
  if (pathMatch) return pathMatch;
  if (isRecord(value) && typeof value.value === "string") return value.value;
  return typeof value === "string" ? value : undefined;
}

function appendServerAuditLog(store: StateStore, actorUserId: string, input: ServerAuditLogInput): AuditLog {
  const log = createTimestamped("audit", {
    campaignId: input.campaignId,
    actorUserId,
    actorType: "user" as const,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
  }) satisfies AuditLog;
  store.state.auditLogs.push(log);
  return log;
}

function appendSystemAuditLog(store: StateStore, input: ServerAuditLogInput): AuditLog {
  const log = createTimestamped("audit", {
    campaignId: input.campaignId,
    actorType: "system" as const,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
  }) satisfies AuditLog;
  store.state.auditLogs.push(log);
  return log;
}

interface ScimMutationSnapshot {
  users: User[];
  groups: ScimGroup[];
  mappings: ScimGroupRoleMapping[];
  members: CampaignMember[];
  sessions: StateStore["state"]["sessions"];
  auditLogs: AuditLog[];
}

function scimMutationSnapshot(store: StateStore): ScimMutationSnapshot {
  return structuredClone({
    users: store.state.users,
    groups: store.state.scimGroups,
    mappings: store.state.scimGroupRoleMappings,
    members: store.state.members,
    sessions: store.state.sessions,
    auditLogs: store.state.auditLogs,
  });
}

function restoreScimMutationSnapshot(store: StateStore, snapshot: ScimMutationSnapshot): void {
  store.state.users = restoreScimCollection(store.state.users, snapshot.users);
  store.state.scimGroups = restoreScimCollection(store.state.scimGroups, snapshot.groups);
  store.state.scimGroupRoleMappings = restoreScimCollection(store.state.scimGroupRoleMappings, snapshot.mappings);
  store.state.members = restoreScimCollection(store.state.members, snapshot.members);
  store.state.sessions = restoreScimCollection(store.state.sessions, snapshot.sessions);
  store.state.auditLogs = restoreScimCollection(store.state.auditLogs, snapshot.auditLogs);
}

function restoreScimCollection<T extends { id: string }>(current: T[], snapshot: T[]): T[] {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return snapshot.map((saved) => {
    const existing = currentById.get(saved.id);
    if (!existing) return saved;
    for (const key of Object.keys(existing)) Reflect.deleteProperty(existing, key);
    Object.assign(existing, saved);
    return existing;
  });
}

function withScimMutationRollback<T>(store: StateStore, mutate: () => T): T {
  const snapshot = scimMutationSnapshot(store);
  try {
    return mutate();
  } catch (error) {
    restoreScimMutationSnapshot(store, snapshot);
    throw error;
  }
}

function scimError(reply: FastifyReply, status: number, detail: string): FastifyReply {
  return reply.code(status).send({ schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail });
}

function regularError(reply: FastifyReply, status: number, message: string): FastifyReply {
  return reply.code(status).send({ error: status === 404 ? "not_found" : status === 409 ? "conflict" : "bad_request", message });
}

function publicUser(user: User): Omit<User, "passwordHash" | "mfa" | "scim"> {
  const { passwordHash: _passwordHash, mfa: _mfa, scim: _scim, ...safeUser } = user;
  return safeUser;
}

function isDisabledUser(user: User): boolean {
  return Boolean(user.disabledAt);
}

function normalizeEmail(value: unknown): string | undefined {
  const email = typeof value === "string" ? value.trim().toLowerCase() : undefined;
  return email && email.includes("@") && email.length <= 254 ? email : undefined;
}

function normalizeDisplayName(value: unknown): string | undefined {
  const displayName = typeof value === "string" ? value.trim() : undefined;
  return displayName && displayName.length <= 80 ? displayName : undefined;
}

function normalizeText(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : undefined;
  return normalized || undefined;
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function idempotencyKey(headers: Record<string, string | string[] | undefined>): string | undefined {
  const key = singleHeader(headers["idempotency-key"])?.trim();
  return key || undefined;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}
