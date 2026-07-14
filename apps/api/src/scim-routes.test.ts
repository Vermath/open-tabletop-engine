import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { createTimestamped, seedState, type EngineState } from "@open-tabletop/core";
import { MemoryStateStore, type StateStore } from "./store.js";
import {
  registerScimRoutes,
  scimGroupEtag,
  scimIdempotencyIdentityFromHeaders,
  scimIdempotencyRequestRepresentation,
  scimReplayResponseHeaders,
  scimUserEtag,
} from "./scim-routes.js";

const SCIM_TOKEN = "focused-scim-token";
const scimHeaders = { authorization: `Bearer ${SCIM_TOKEN}` };

describe("SCIM operator mutation safety", () => {
  const previousToken = process.env.OTTE_SCIM_BEARER_TOKEN;

  beforeEach(() => {
    process.env.OTTE_SCIM_BEARER_TOKEN = SCIM_TOKEN;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.OTTE_SCIM_BEARER_TOKEN;
    else process.env.OTTE_SCIM_BEARER_TOKEN = previousToken;
  });

  it("advertises strong ETags and rejects missing, malformed, wildcard, and stale If-Match without mutation", async () => {
    const store = testStore();
    const app = await testApp(store);
    const serviceProvider = await app.inject({ method: "GET", url: "/api/v1/scim/v2/ServiceProviderConfig", headers: scimHeaders });
    expect(serviceProvider.statusCode).toBe(200);
    expect(serviceProvider.json().etag).toEqual({ supported: true });

    const usersBefore = store.state.users.length;
    const missingUserKey = await app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: scimHeaders,
      payload: { userName: "etag-user@example.test", displayName: "ETag User" },
    });
    expect(missingUserKey.statusCode).toBe(400);
    expect(store.state.users).toHaveLength(usersBefore);
    const createdUser = await app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Users",
      headers: { ...scimHeaders, "idempotency-key": "create-etag-user" },
      payload: { userName: "etag-user@example.test", displayName: "ETag User" },
    });
    expect(createdUser.statusCode).toBe(201);
    expect(createdUser.headers.etag).toMatch(/^"scim-sha256-[a-f0-9]{64}"$/);
    expect(createdUser.json().meta.version).toBe(createdUser.headers.etag);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/scim/v2/Groups",
      headers: { ...scimHeaders, "idempotency-key": "create-group" },
      payload: { displayName: "Raiders", members: [{ value: store.state.users[0]!.id }] },
    });
    expect(created.statusCode).toBe(201);
    const group = created.json();
    const originalEtag = created.headers.etag;
    expect(originalEtag).toMatch(/^"scim-sha256-[a-f0-9]{64}"$/);
    expect(group.meta.version).toBe(originalEtag);

    for (const [name, ifMatch, status] of [
      ["missing", undefined, 428],
      ["weak", `W/${originalEtag}`, 400],
      ["wildcard", "*", 400],
      ["multiple", `${originalEtag}, ${originalEtag}`, 400],
      ["stale", `"scim-sha256-${"0".repeat(64)}"`, 412],
    ] as const) {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/scim/v2/Groups/${group.id}`,
        headers: { ...scimHeaders, "idempotency-key": `patch-${name}`, ...(ifMatch ? { "if-match": ifMatch } : {}) },
        payload: { Operations: [{ op: "replace", path: "displayName", value: "Changed" }] },
      });
      expect(response.statusCode, name).toBe(status);
      expect(store.state.scimGroups.find((candidate) => candidate.id === group.id)?.displayName).toBe("Raiders");
    }

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/scim/v2/Groups/${group.id}`,
      headers: { ...scimHeaders, "idempotency-key": "patch-valid", "if-match": originalEtag! },
      payload: { Operations: [{ op: "replace", path: "displayName", value: "Changed" }] },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.headers.etag).not.toBe(originalEtag);
    expect(patched.json().meta.version).toBe(patched.headers.etag);
    await app.close();
  });

  it("derives resource versions deterministically from exact stored resource state", () => {
    const store = testStore();
    const user = store.state.users[0]!;
    const group = store.state.scimGroups[0]!;
    const userVersion = scimUserEtag(user);
    const groupVersion = scimGroupEtag(group);
    expect(scimUserEtag(structuredClone(user))).toBe(userVersion);
    expect(scimGroupEtag(structuredClone(group))).toBe(groupVersion);
    user.displayName = `${user.displayName} changed`;
    group.memberUserIds = [...group.memberUserIds, store.state.users[1]!.id];
    expect(scimUserEtag(user)).not.toBe(userVersion);
    expect(scimGroupEtag(group)).not.toBe(groupVersion);
  });

  it("makes group-role mapping target hashes obtainable and stale when group or campaign membership changes", async () => {
    const store = testStore();
    const app = await testApp(store);
    const campaign = store.state.campaigns[0]!;
    const group = store.state.scimGroups[0]!;
    const mappingQuery = new URLSearchParams({ campaignId: campaign.id, role: "player", groupId: group.id });
    const preview = await app.inject({ method: "GET", url: `/api/v1/admin/scim/group-role-mappings/preview?${mappingQuery}` });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().targetSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const secondUser = store.state.users[1]!;
    group.memberUserIds.push(secondUser.id);
    group.updatedAt = new Date(Date.parse(group.updatedAt) + 1000).toISOString();
    const staleCreate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/scim/group-role-mappings",
      headers: { "idempotency-key": "mapping-stale" },
      payload: { campaignId: campaign.id, role: "player", groupId: group.id, preparedTargetSetHash: preview.json().targetSetHash },
    });
    expect(staleCreate.statusCode).toBe(409);
    expect(store.state.scimGroupRoleMappings).toHaveLength(0);

    const refreshed = await app.inject({ method: "GET", url: `/api/v1/admin/scim/group-role-mappings/preview?${mappingQuery}` });
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/scim/group-role-mappings",
      headers: { "idempotency-key": "mapping-create" },
      payload: { campaignId: campaign.id, role: "player", groupId: group.id, preparedTargetSetHash: refreshed.json().targetSetHash },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().sync.createdMemberships + created.json().sync.preservedManualMemberships).toBeGreaterThan(0);
    const mapping = created.json().mapping;
    expect(mapping.targetSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(store.state.auditLogs.some((log) => log.action === "admin.scim.groupRoleMapping.create")).toBe(true);

    const affectedUserId = group.memberUserIds[0]!;
    const affected = store.state.members.find((member) => member.campaignId === campaign.id && member.userId === affectedUserId)!;
    affected.updatedAt = new Date(Date.parse(affected.updatedAt) + 1000).toISOString();
    const staleDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/scim/group-role-mappings/${mapping.id}`,
      headers: { "idempotency-key": "mapping-delete-stale" },
      payload: { expectedUpdatedAt: mapping.updatedAt, preparedTargetSetHash: mapping.targetSetHash },
    });
    expect(staleDelete.statusCode).toBe(409);
    expect(store.state.scimGroupRoleMappings.some((candidate) => candidate.id === mapping.id)).toBe(true);
    await app.close();
  });

  it("rolls back mapping, membership, and audit changes together when persistence fails", async () => {
    const base = testStore().state;
    const store = new ThrowingStore(base);
    const app = await testApp(store);
    const group = store.state.scimGroups[0]!;
    const campaign = store.state.campaigns[0]!;
    const query = new URLSearchParams({ campaignId: campaign.id, role: "observer", groupId: group.id });
    const preview = await app.inject({ method: "GET", url: `/api/v1/admin/scim/group-role-mappings/preview?${query}` });
    store.throwOnSave = true;
    const baseline = structuredClone({ mappings: store.state.scimGroupRoleMappings, members: store.state.members, auditLogs: store.state.auditLogs });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/scim/group-role-mappings",
      headers: { "idempotency-key": "mapping-save-failure" },
      payload: { campaignId: campaign.id, role: "observer", groupId: group.id, preparedTargetSetHash: preview.json().targetSetHash },
    });
    expect(response.statusCode).toBe(500);
    expect({ mappings: store.state.scimGroupRoleMappings, members: store.state.members, auditLogs: store.state.auditLogs }).toEqual(baseline);
    await app.close();
  });

  it("uses a credential-scoped SCIM replay identity isolated across token rotation", () => {
    const first = scimIdempotencyIdentityFromHeaders(scimHeaders);
    expect(first?.userId).toMatch(/^scim:[a-f0-9]{64}$/);
    expect(scimIdempotencyIdentityFromHeaders({ authorization: "Bearer wrong" })).toBeUndefined();
    process.env.OTTE_SCIM_BEARER_TOKEN = "rotated-scim-token";
    const rotated = scimIdempotencyIdentityFromHeaders({ authorization: "Bearer rotated-scim-token" });
    expect(rotated?.userId).not.toBe(first?.userId);
    expect(rotated?.authorizationHash).not.toBe(first?.authorizationHash);
  });

  it("binds replay identity to If-Match and restores safe SCIM protocol headers", () => {
    const etag = `"scim-sha256-${"a".repeat(64)}"`;
    expect(scimIdempotencyRequestRepresentation("/api/v1/scim/v2/Users/usr_1", { active: false }, { "if-match": etag })).toEqual({
      body: { active: false },
      ifMatch: etag,
    });
    const body = JSON.stringify({ meta: { version: etag, location: "https://vtt.example/api/v1/scim/v2/Users/usr_1" } });
    expect(scimReplayResponseHeaders("/api/v1/scim/v2/Users/usr_1", body, 201)).toEqual({
      etag,
      location: "https://vtt.example/api/v1/scim/v2/Users/usr_1",
    });
    expect(scimReplayResponseHeaders("/api/v1/scim/v2/Users/usr_1", body, 200)).toEqual({ etag });
  });
});

function testStore(): MemoryStateStore {
  const state = seedState();
  const group = createTimestamped("scimg", {
    displayName: "Players",
    externalId: "directory-players",
    memberUserIds: [state.users[0]!.id],
  });
  state.scimGroups = [group];
  state.scimGroupRoleMappings = [];
  return new MemoryStateStore(state);
}

async function testApp(store: StateStore) {
  const app = Fastify();
  registerScimRoutes(app, {
    store,
    requireServerAdmin: () => store.state.users[0]!.id,
    appendAdminReadAudit: () => {},
  });
  await app.ready();
  return app;
}

class ThrowingStore implements StateStore {
  state: EngineState;
  throwOnSave = false;

  constructor(state: EngineState) {
    this.state = structuredClone(state);
  }

  save(): void {
    if (this.throwOnSave) throw new Error("injected save failure");
  }

  replace(state: EngineState): void {
    this.state = structuredClone(state);
  }
}
