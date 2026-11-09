import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimestamped, type PermissionName, type Proposal, type Token, type UserSession } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadPluginRegistry } from "./plugin-runtime.js";
import { MemoryStateStore } from "./store.js";

// Proposed destination: apps/api/src/plugin-command-context-privacy.test.ts.
// This file is staged outside runtime and has not been executed during the freeze.
const campaignId = "camp_demo";
const sceneId = "scn_vault_entry";
const privateSceneId = "scn_command_private";
const gmId = "usr_demo_gm";
const playerId = "usr_demo_player";
const basicGrants: PermissionName[] = ["chat.write", "token.read"];
const fullGrants: PermissionName[] = [...basicGrants, "plugin.configure"];
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const roots: string[] = [];
const sockets: Array<{ close(): void }> = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(options: { bundled?: boolean; grants?: PermissionName[] } = {}) {
  const store = new MemoryStateStore();
  const scene = store.state.scenes.find((item) => item.id === sceneId)!;
  for (const item of store.state.scenes.filter((item) => item.campaignId === campaignId)) item.active = false;
  Object.assign(scene, { active: true, fog: [], walls: [], lights: [] });
  store.state.scenes.push({ ...structuredClone(scene), id: privateSceneId, name: "PRIVATE_PREP_SCENE", active: false });
  const base = structuredClone(store.state.tokens.find((token) => token.id === "tok_valen")!);
  const token = (id: string, name: string, patch: Partial<Token> = {}): Token => ({ ...base, id, name, sceneId, actorId: undefined, ownerUserIds: [], layer: "player", hidden: false, ...patch });
  const visible = token("tok_command_visible", "VISIBLE_COMMAND_TOKEN", { ownerUserIds: [playerId] });
  const hidden = token("tok_command_hidden", "HIDDEN_COMMAND_TOKEN", { hidden: true });
  const gmLayer = token("tok_command_gm", "GM_LAYER_COMMAND_TOKEN", { layer: "gm" });
  const prepared = token("tok_command_prepared", "PREP_COMMAND_TOKEN", { sceneId: privateSceneId });
  store.state.tokens = [visible, hidden, gmLayer, prepared];
  const pluginId = options.bundled ? "example-macro-plugin" : "context-privacy-probe";
  let registry = loadPluginRegistry();
  if (!options.bundled) {
    const root = mkdtempSync(join(tmpdir(), "otte-plugin-context-privacy-"));
    roots.push(root);
    const packagePath = join(root, pluginId);
    mkdirSync(packagePath);
    writeFileSync(join(packagePath, "plugin.manifest.json"), JSON.stringify({
      id: pluginId, name: "Context Privacy Probe", version: "1.0.0", compatibleCore: ">=0.3.0",
      entrypoints: { server: "./server.js" }, runtime: { apiVersion: "0.1", sandbox: "vm" },
      permissions: fullGrants, chatCommands: [{ command: "/context", description: "Return authorized context" }],
    }));
    writeFileSync(join(packagePath, "server.js"), `registerCommand("/context", (input) => ({
      body: input.args === "gm-only" ? "PRIVATE_PLUGIN_OUTPUT" : JSON.stringify({ tokens: input.tokens, storage: input.storage.entries }),
      visibility: input.args === "gm-only" ? "gm_only" : "public",
      ...(input.args === "propose-storage" ? { storage: { set: { proposed: { enabled: true } } } } : {}),
      ...(input.args === "update-storage" ? { storage: { set: { privateSettings: { replaced: true } } } } : {}),
      ...(input.args === "delete-storage" ? { storage: { delete: ["privateSettings"] } } : {})
    }));`);
    registry = loadPluginRegistry({ pluginRoot: root, trustPolicy: { policy: "allow_unsigned" } });
    expect(registry.errors).toEqual([]);
  }
  const app = await buildApp({ store, pluginRegistry: registry, rateLimit: { enabled: false } });
  apps.push(app);
  const installed = await app.inject({
    method: "POST", url: `/api/v1/campaigns/${campaignId}/plugins/${pluginId}/install`,
    headers: { "x-user-id": gmId, "idempotency-key": "context-privacy-install" },
    payload: { permissions: options.grants ?? basicGrants, expectedUpdatedAt: store.state.campaigns.find((item) => item.id === campaignId)!.updatedAt },
  });
  expect(installed.statusCode).toBe(200);
  store.state.pluginStorage.push(createTimestamped("pstore", { campaignId, pluginId, key: "privateSettings", value: { secret: "PRIVATE_PLUGIN_STORAGE" }, updatedByType: "user" as const, updatedById: gmId }));
  const invoke = (userId = playerId, args = "") => app.inject({
    method: "POST", url: `/api/v1/campaigns/${campaignId}/plugins/${pluginId}/chat-command`,
    headers: { "x-user-id": userId, "idempotency-key": `context-privacy-${userId}-${args || "read"}` },
    payload: { command: options.bundled ? "/spark" : "/context", args },
  });
  return { app, store, pluginId, invoke, visible, hidden, gmLayer, prepared };
}

describe("plugin chat command invocation context privacy", () => {
  it("excludes hidden, GM-layer, and unreadable-scene token names from a player's bundled /spark response", async () => {
    const f = await fixture({ bundled: true });
    const direct = await f.app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/tokens`, headers: { "x-user-id": playerId } });
    expect(direct.statusCode).toBe(200);
    expect(direct.json().map((token: Token) => token.id)).toEqual([f.visible.id]);
    const privateRead = await f.app.inject({ method: "GET", url: `/api/v1/scenes/${privateSceneId}/tokens`, headers: { "x-user-id": playerId } });
    expect(privateRead.statusCode).toBe(404);
    const response = await f.invoke();
    expect(response.statusCode).toBe(200);
    expect(response.json().chat.body).toContain(f.visible.name);
    for (const secret of [f.hidden, f.gmLayer, f.prepared]) expect(response.body).not.toContain(secret.name);
    expect(response.json().approvalRequired).toBe(true);
  });

  it("keeps a player within direct API visibility with all supported command context grants", async () => {
    const f = await fixture({ grants: fullGrants });
    const response = await f.invoke();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).tokens).toEqual([{ id: f.visible.id, name: f.visible.name, sceneId }]);
    expect(response.body).not.toContain(privateSceneId);
    expect(response.body).not.toContain(f.hidden.id);
    expect(response.body).not.toContain(f.gmLayer.id);
  });

  it("gives the GM visible token context authorized by the plugin grants", async () => {
    const f = await fixture({ grants: fullGrants });
    const response = await f.invoke(gmId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).tokens).toEqual([{ id: f.visible.id, name: f.visible.name, sceneId }]);
  });

  it("does not let a GM caller expand a plugin's minimal token grant to hidden or prepared tokens", async () => {
    const f = await fixture();
    const response = await f.invoke(gmId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).tokens).toEqual([{ id: f.visible.id, name: f.visible.name, sceneId }]);
  });

  it("passes no token context when the installed plugin lacks token.read", async () => {
    const f = await fixture({ grants: ["chat.write"] });
    const response = await f.invoke(gmId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).tokens).toEqual([]);
  });

  it("passes no token context when the invoking member lacks token.read", async () => {
    const f = await fixture({ grants: fullGrants });
    f.store.state.members.find((member) => member.userId === playerId && member.campaignId === campaignId)!.role = "plugin";
    f.store.state.permissionGrants = f.store.state.permissionGrants.filter((grant) => !(grant.subjectType === "user" && grant.subjectId === playerId));
    f.store.state.permissionGrants.push(createTimestamped("grant", { subjectType: "user" as const, subjectId: playerId, campaignId, permissions: ["campaign.read", "scene.read", "chat.write"] as PermissionName[] }));
    const direct = await f.app.inject({ method: "GET", url: `/api/v1/scenes/${sceneId}/tokens`, headers: { "x-user-id": playerId } });
    expect(direct.statusCode).toBe(403);
    const response = await f.invoke();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).tokens).toEqual([]);
  });

  it("withholds storage from a player denied direct plugin storage access", async () => {
    const f = await fixture({ grants: fullGrants });
    const direct = await f.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/plugins/${f.pluginId}/storage`, headers: { "x-user-id": playerId } });
    expect(direct.statusCode).toBe(403);
    const response = await f.invoke();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).storage).toEqual([]);
    expect(response.body).not.toContain("PRIVATE_PLUGIN_STORAGE");
  });

  it("provides storage when caller and plugin both have plugin.configure", async () => {
    const f = await fixture({ grants: fullGrants });
    const response = await f.invoke(gmId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).storage).toEqual([expect.objectContaining({ key: "privateSettings", value: { secret: "PRIVATE_PLUGIN_STORAGE" } })]);
  });

  it("withholds storage from an authorized GM when the plugin lacks plugin.configure", async () => {
    const f = await fixture();
    const response = await f.invoke(gmId);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).storage).toEqual([]);
  });

  it("retains pending storage proposals without granting direct storage mutation authority", async () => {
    const f = await fixture({ grants: fullGrants });
    const before = structuredClone(f.store.state.pluginStorage);
    const response = await f.invoke(playerId, "propose-storage");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.json().chat.body).storage).toEqual([]);
    expect(response.json()).toMatchObject({ proposals: [], approvalRequired: true });
    expect(response.json()).not.toHaveProperty("proposal");
    expect(response.json()).not.toHaveProperty("storageMutation");
    const storedProposal = f.store.state.proposals.find((proposal) => proposal.sourceId === f.pluginId)!;
    expect(storedProposal).toMatchObject({ status: "pending", approvalRequired: true });
    expect(storedProposal.changesJson).toContainEqual(expect.objectContaining({ entity: "pluginStorage", action: "create", data: expect.objectContaining({ key: "proposed", value: { enabled: true } }) }));
    expect(f.store.state.pluginStorage).toEqual(before);
  });

  it("omits GM-only output from the invoking player's response while retaining it for the GM", async () => {
    const f = await fixture({ grants: fullGrants });
    const response = await f.invoke(playerId, "gm-only");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ pluginId: f.pluginId, command: "/context", proposals: [], approvalRequired: true });
    expect(response.json()).not.toHaveProperty("proposal");
    expect(response.json()).not.toHaveProperty("chat");
    expect(response.body).not.toContain("PRIVATE_PLUGIN_OUTPUT");
    const privileged = await f.invoke(gmId, "gm-only");
    expect(privileged.statusCode).toBe(200);
    expect(privileged.json().chat.body).toBe("PRIVATE_PLUGIN_OUTPUT");
    expect(privileged.json().proposal.changesJson).toContainEqual(expect.objectContaining({ entity: "chat", data: expect.objectContaining({ body: "PRIVATE_PLUGIN_OUTPUT" }) }));
  });

  it.each(["update", "delete"] as const)("keeps an existing storage secret private through a player-triggered %s proposal lifecycle", async (action) => {
    const f = await fixture({ grants: fullGrants });
    const gmSession = seedSession(f.store, gmId);
    const playerSession = seedSession(f.store, playerId);
    await f.app.listen({ host: "127.0.0.1", port: 0 });
    const gmRealtime = await openRealtime(f.app, gmSession);
    const playerRealtime = await openRealtime(f.app, playerSession);
    const original = structuredClone(f.store.state.pluginStorage[0]!);

    const response = await f.invoke(playerId, `${action}-storage`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ proposals: [], approvalRequired: true });
    expect(response.json()).not.toHaveProperty("proposal");
    expect(response.json()).not.toHaveProperty("storageMutation");
    expect(response.body).not.toContain(original.id);
    expect(response.body).not.toContain("PRIVATE_PLUGIN_STORAGE");
    expect(f.store.state.pluginStorage).toContainEqual(original);
    const proposal = f.store.state.proposals.find((candidate) => candidate.sourceId === f.pluginId)!;
    expect(proposal.changesJson).toContainEqual(expect.objectContaining({ entity: "pluginStorage", action, id: original.id }));
    await gmRealtime.waitFor("proposal.created", proposal.id);

    const approved = await f.app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/approve`, headers: { "x-user-id": gmId, "idempotency-key": `privacy-approve-${action}` }, payload: { expectedUpdatedAt: proposal.updatedAt } });
    expect(approved.statusCode).toBe(200);
    const applied = await f.app.inject({ method: "POST", url: `/api/v1/proposals/${proposal.id}/apply`, headers: { "x-user-id": gmId, "idempotency-key": `privacy-apply-${action}` }, payload: { expectedUpdatedAt: approved.json().updatedAt } });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toMatchObject({ status: "applied" });
    expect(applied.body).toContain("PRIVATE_PLUGIN_STORAGE");
    const gmApplied = await gmRealtime.waitFor("proposal.applied", proposal.id);
    expect(JSON.stringify(gmApplied)).toContain("PRIVATE_PLUGIN_STORAGE");

    const playerList = await f.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/proposals`, headers: { "x-user-id": playerId } });
    expect(playerList.statusCode).toBe(200);
    expect(playerList.json().some((candidate: Proposal) => candidate.id === proposal.id)).toBe(false);
    expect(playerList.body).not.toContain("PRIVATE_PLUGIN_STORAGE");
    const gmList = await f.app.inject({ method: "GET", url: `/api/v1/campaigns/${campaignId}/proposals`, headers: { "x-user-id": gmId } });
    expect(gmList.statusCode).toBe(200);
    expect(gmList.json().find((candidate: Proposal) => candidate.id === proposal.id).inverseChangesJson).toContainEqual(expect.objectContaining({ entity: "pluginStorage", data: expect.objectContaining({ value: original.value }) }));

    // A later readable event proves both sockets consumed the earlier lifecycle messages.
    const barrier = await f.invoke(playerId, "barrier");
    expect(barrier.statusCode).toBe(200);
    await playerRealtime.waitFor("proposal.created", barrier.json().proposal.id);
    await gmRealtime.waitFor("proposal.created", barrier.json().proposal.id);
    expect(playerRealtime.messages.some((message) => message.targetId === proposal.id)).toBe(false);
    expect(JSON.stringify(playerRealtime.messages)).not.toContain("PRIVATE_PLUGIN_STORAGE");
    expect(f.store.state.pluginStorage.find((entry) => entry.id === original.id)?.value).toEqual(action === "update" ? { replaced: true } : undefined);
  });
});

function seedSession(store: MemoryStateStore, userId: string): string {
  const token = `ots_context_privacy_${userId}`;
  store.state.sessions.push(createTimestamped("sess", {
    userId,
    tokenHash: `sha256:${createHash("sha256").update(token).digest("hex")}`,
    activeOrganizationId: "org_demo",
    expiresAt: "2099-01-01T00:00:00.000Z",
    lastSeenAt: new Date().toISOString(),
  }) satisfies UserSession);
  return token;
}

type RealtimeMessage = { type: string; targetId?: string; payload?: unknown };
type RealtimeSocket = {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
};

async function openRealtime(app: Awaited<ReturnType<typeof buildApp>>, token: string) {
  const WebSocketConstructor = (globalThis as unknown as { WebSocket: new (url: string, protocols: string[]) => RealtimeSocket }).WebSocket;
  const address = app.server.address() as AddressInfo;
  const socket = new WebSocketConstructor(`ws://127.0.0.1:${address.port}/api/v1/realtime?campaignId=${campaignId}`, ["otte.v1", `otte.auth.${token}`]);
  sockets.push(socket);
  const messages: RealtimeMessage[] = [];
  socket.onmessage = (event) => { messages.push(JSON.parse(String(event.data)) as RealtimeMessage); };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out opening context privacy realtime socket")), 2_000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = (event) => { clearTimeout(timer); reject(new Error(`Context privacy realtime socket failed: ${String(event)}`)); };
  });
  return {
    messages,
    async waitFor(type: string, targetId: string) {
      await expect.poll(() => messages.find((message) => message.type === type && message.targetId === targetId), { timeout: 2_000 }).toBeDefined();
      return messages.find((message) => message.type === type && message.targetId === targetId)!;
    },
  };
}