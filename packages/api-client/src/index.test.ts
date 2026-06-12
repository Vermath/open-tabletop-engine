import { openApiSpec } from "@open-tabletop/api-contracts";
import { describe, expect, it } from "vitest";
import { OpenTabletopClient } from "./index.js";

const campaignId = "camp_client";
const sceneId = "scn_client";
const assetId = "asset_client";
const tokenId = "tok_client";
const actorId = "act_client";
const itemId = "item_client";
const entryId = "jnl_client";
const messageId = "msg_client";
const macroId = "mac_client";
const rollId = "roll_client";
const audioTrackId = "aud_client";
const combatId = "cmb_client";
const combatantId = "cmbt_client";
const combatActionId = "cact_client";
const proposalId = "prop_client";
const importId = "imp_client";
const pluginId = "plugin_client";
const pluginKey = "setting_client";
const systemId = "dnd-5e-srd";
const conditionId = "cond_client";
const factId = "fact_client";
const toolCallId = "tool_client";
const inviteId = "inv_client";
const sessionId = "sess_client";
const requestId = "req_client";
const fogId = "fog_client";
const wallId = "wall_client";
const lightId = "light_client";
const annotationId = "anno_client";
const organizationMemberId = "orgmem_client";

describe("OpenTabletopClient", () => {
  it("builds typed realtime websocket helpers", () => {
    const sockets: Array<{ url: string; protocols?: string | string[] }> = [];
    class MockWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        sockets.push({ url: url.toString(), protocols });
      }
    }

    const client = new OpenTabletopClient("https://api.test/base", { token: "ots_test" });
    expect(client.realtimeUrl(campaignId)).toBe("wss://api.test/api/v1/realtime?campaignId=camp_client");
    expect(client.realtimeUrl(campaignId, { token: "override_token" })).toBe("wss://api.test/api/v1/realtime?campaignId=camp_client");

    const localClient = new OpenTabletopClient("http://localhost:4000", {});
    expect(localClient.realtimeUrl(campaignId)).toBe("ws://localhost:4000/api/v1/realtime?campaignId=camp_client");

    const socket = client.connectRealtime(campaignId, { WebSocket: MockWebSocket as unknown as typeof WebSocket, protocols: ["otte.v1"] });
    expect(socket).toBeInstanceOf(MockWebSocket);
    expect(sockets).toEqual([{ url: "wss://api.test/api/v1/realtime?campaignId=camp_client", protocols: ["otte.v1", "otte.auth.ots_test"] }]);

    expect(client.parseRealtimeMessage({ data: "{\"id\":\"evt_client\",\"campaignId\":\"camp_client\",\"type\":\"chat.message.created\",\"timestamp\":\"2026-05-15T00:00:00.000Z\",\"payload\":{\"messageId\":\"msg_client\"}}" } as MessageEvent<string>)).toMatchObject({
      id: "evt_client",
      campaignId,
      type: "chat.message.created",
      payload: { messageId }
    });
  });

  it("sends auth headers and request bodies consistently", async () => {
    const requests: Array<{ method: string; url: URL; headers: Record<string, string>; body?: BodyInit | null }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      userId: "usr_legacy",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? "GET",
          url: new URL(input.toString()),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: init?.body
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });

    await client.campaigns();
    await client.createCampaign({ name: "JSON Campaign" });
    await client.updateCampaign(campaignId, { name: "Renamed Campaign" });
    await client.deleteCampaign(campaignId);
    await client.uploadAsset(campaignId, "raw-svg-body", { contentType: "image/svg+xml", fileName: "map.svg", folder: "Maps", tags: ["alpha", "beta"] });

    expect(requests.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([
      "GET /api/v1/campaigns",
      "POST /api/v1/campaigns",
      "PATCH /api/v1/campaigns/camp_client",
      "DELETE /api/v1/campaigns/camp_client",
      "POST /api/v1/campaigns/camp_client/assets/upload"
    ]);
    for (const request of requests) {
      expect(request.headers.authorization).toBe("Bearer ots_test");
      expect(request.headers["x-user-id"]).toBe("usr_legacy");
    }
    expect(requests[0]!.headers["content-type"]).toBeUndefined();
    expect(requests[0]!.body).toBeUndefined();
    expect(requests[1]!.headers["content-type"]).toBe("application/json");
    expect(requests[1]!.body).toBe(JSON.stringify({ name: "JSON Campaign" }));
    expect(requests[2]!.headers["content-type"]).toBe("application/json");
    expect(requests[2]!.body).toBe(JSON.stringify({ name: "Renamed Campaign" }));
    expect(requests[3]!.headers["content-type"]).toBeUndefined();
    expect(requests[3]!.body).toBeUndefined();
    expect(requests[4]!.headers["content-type"]).toBe("image/svg+xml");
    expect(requests[4]!.headers["x-asset-name"]).toBe("map.svg");
    expect(requests[4]!.headers["x-asset-folder"]).toBe("Maps");
    expect(requests[4]!.headers["x-asset-tags"]).toBe("alpha,beta");
    expect(requests[4]!.body).toBe("raw-svg-body");
    expect(requests[4]!.url.search).toBe("");
  });

  it("throws server error response bodies", async () => {
    const client = new OpenTabletopClient("http://api.test", {
      fetch: (async () => new Response(JSON.stringify({ error: "bad_request", message: "Invalid client payload" }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch
    });

    await expect(client.createCampaign({ name: "" })).rejects.toThrow('{"error":"bad_request","message":"Invalid client payload"}');
  });

  it("supports archive and chat export runtime permutations", async () => {
    const requests: Array<{ method: string; url: URL; headers: Record<string, string>; body?: BodyInit | null }> = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        requests.push({
          method: init?.method ?? "GET",
          url,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: init?.body
        });
        if (url.searchParams.get("format") === "ndjson") {
          return new Response('{"body":"hello"}\n', { status: 200, headers: { "content-type": "application/x-ndjson" } });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });

    await client.exportChat(campaignId, { format: "json" });
    await expect(client.exportChatNdjson(campaignId)).resolves.toBe('{"body":"hello"}\n');
    await client.exportCampaign(campaignId, { scope: "campaign", version: "0.2.0", redaction: "portable" });
    await client.importCampaign({ format: "ottx" }, { mode: "dry_run", scope: "selected_collections", collections: ["journals", "assets"] });

    expect(requests.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([
      "GET /api/v1/campaigns/camp_client/chat/export",
      "GET /api/v1/campaigns/camp_client/chat/export",
      "GET /api/v1/campaigns/camp_client/export",
      "POST /api/v1/import/campaign"
    ]);
    expect(requests.every((request) => request.headers.authorization === "Bearer ots_test")).toBe(true);
    expect(requests[0]!.url.searchParams.get("format")).toBe("json");
    expect(requests[1]!.url.searchParams.get("format")).toBe("ndjson");
    expect(requests[2]!.url.searchParams.get("scope")).toBe("campaign");
    expect(requests[2]!.url.searchParams.get("version")).toBe("0.2.0");
    expect(requests[2]!.url.searchParams.get("redaction")).toBe("portable");
    expect(requests[3]!.headers["content-type"]).toBe("application/json");
    expect(requests[3]!.body).toBe(JSON.stringify({ archive: { format: "ottx" }, mode: "dry_run", scope: "selected_collections", collections: ["journals", "assets"] }));
  });

  it("covers every public OpenAPI REST route or intentionally excludes it", async () => {
    const calls: string[] = [];
    const client = new OpenTabletopClient("http://api.test", {
      token: "ots_test",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input.toString());
        calls.push(`${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch
    });

    await Promise.all([
      client.health(),
      client.bootstrapStatus(),
      client.bootstrapOwner({ email: "owner@example.test", displayName: "Owner", password: "password123", campaignName: "Campaign" }),
      client.login({ email: "owner@example.test", password: "password123" }),
      client.register({ email: "new@example.test", displayName: "New", password: "password123" }),
      client.logout(),
      client.session(),
      client.requestPasswordReset({ email: "owner@example.test" }),
      client.confirmPasswordReset({ token: "opr_test", password: "password123" }),
      client.changePassword({ currentPassword: "password123", newPassword: "password456" }),
      client.mfaStatus(),
      client.enrollTotpMfa({ currentPassword: "password123" }),
      client.confirmTotpMfa({ code: "123456" }),
      client.disableTotpMfa({ currentPassword: "password123" }),
      client.sessions(),
      client.deleteSession(sessionId),
      client.oidcConfig(),
      client.startOidc(),
      client.startOidcRedirect("/campaigns"),
      client.organizations(),
      client.createOrganization({ name: "Client Workspace" }),
      client.switchOrganization("org_client"),
      client.workspaceDefaults(),
      client.updateWorkspaceDefaults({ defaultCampaignVisibility: "invite_only" }),
      client.organizationMembers(),
      client.addOrganizationMember({ email: "member@example.test", role: "member" }),
      client.updateOrganizationMember(organizationMemberId, { role: "admin" }),
      client.removeOrganizationMember(organizationMemberId),
      client.organizationInvites(),
      client.createOrganizationInvite({ campaignId, email: "player@example.test", role: "player" }),
      client.campaigns(),
      client.createCampaign({ name: "Campaign" }),
      client.campaign(campaignId),
      client.campaignSnapshot(campaignId),
      client.updateCampaign(campaignId, { name: "Renamed" }),
      client.archiveCampaign(campaignId),
      client.restoreCampaign(campaignId),
      client.deleteCampaign(campaignId),
      client.campaignMembers(campaignId),
      client.campaignInvites(campaignId),
      client.createCampaignInvite(campaignId, { role: "player" }),
      client.revokeCampaignInvite(inviteId),
      client.acceptInvite({ token: "invite_token", email: "player@example.test", displayName: "Player", password: "password123" }),
      client.scenes(campaignId),
      client.createScene(campaignId, { name: "Scene" }),
      client.scene(sceneId),
      client.updateScene(sceneId, { name: "Scene 2" }),
      client.deleteScene(sceneId),
      client.sceneVision(sceneId),
      client.sampleSceneVision(sceneId, { x: 1, y: 2 }),
      client.sceneRenderingDiagnostics(sceneId),
      client.createSceneAnnotation(sceneId, { kind: "ping", points: [{ x: 1, y: 2 }] }),
      client.updateSceneAnnotation(sceneId, annotationId, { label: "Updated annotation", templateShape: "line" }),
      client.deleteSceneAnnotation(sceneId, annotationId),
      client.fogPresets(campaignId),
      client.createFogPreset(campaignId, { name: "Preset" }),
      client.deleteFogPreset(campaignId, "preset_client"),
      client.createFogRegion(sceneId, { shape: "circle" }),
      client.updateFogRegion(sceneId, fogId, { shape: "polygon" }),
      client.deleteFogRegion(sceneId, fogId),
      client.fogHistory(sceneId),
      client.undoFog(sceneId),
      client.sceneEdits(sceneId),
      client.undoScene(sceneId),
      client.applyFogPreset(sceneId, { presetId: "preset_client" }),
      client.createWall(sceneId, { x1: 0, y1: 0, x2: 1, y2: 1 }),
      client.updateWall(sceneId, wallId, { blocksVision: false }),
      client.deleteWall(sceneId, wallId),
      client.createLight(sceneId, { x: 1, y: 1, radius: 5 }),
      client.updateLight(sceneId, lightId, { radius: 10 }),
      client.deleteLight(sceneId, lightId),
      client.applyAiEditLayerToTarget(sceneId),
      client.assets(campaignId),
      client.assetStorage(campaignId),
      client.createAsset(campaignId, { name: "Asset" }),
      client.uploadAsset(campaignId, new Blob(["asset"]), { contentType: "image/svg+xml", fileName: "map.svg" }),
      client.updateAsset(assetId, { name: "Asset 2" }),
      client.updateAssetLifecycle(assetId, { status: "archived" }),
      client.assetDeliveryUrl(assetId),
      client.tokens(sceneId),
      client.createToken(sceneId, { name: "Token" }),
      client.updateToken(tokenId, { name: "Token 2" }),
      client.targetToken(tokenId, true),
      client.deleteToken(tokenId),
      client.actors(campaignId),
      client.createActor(campaignId, { name: "Actor" }),
      client.updateActor(actorId, { name: "Actor 2" }),
      client.items(campaignId),
      client.createItem(campaignId, { name: "Item" }),
      client.updateItem(itemId, { name: "Item 2" }),
      client.journals(campaignId),
      client.createJournal(campaignId, { title: "Note" }),
      client.updateJournal(entryId, { title: "Note 2" }),
      client.chat(campaignId),
      client.sendChat({ campaignId, body: "Hello" }),
      client.editChat(messageId, "Edited"),
      client.moderateChat(messageId, "reviewed"),
      client.deleteChat(messageId),
      client.exportChat(campaignId),
      client.roll({ campaignId, formula: "1d20" }),
      client.rolls(campaignId),
      client.verifyRoll(campaignId, rollId),
      client.diceMacros(campaignId),
      client.createDiceMacro(campaignId, { name: "Macro", formula: "1d20" }),
      client.updateDiceMacro(macroId, { name: "Macro 2" }),
      client.deleteDiceMacro(macroId),
      client.audioTracks(campaignId),
      client.createAudioTrack(campaignId, { name: "Ambience", url: "https://example.test/ambience.mp3" }),
      client.updateAudioTrack(audioTrackId, { playing: true }),
      client.deleteAudioTrack(audioTrackId),
      client.combats(campaignId),
      client.combatAudit(combatId),
      client.startCombat(campaignId, { combatants: [] }),
      client.updateCombat(combatId, { round: 2 }),
      client.rollNpcInitiative(combatId),
      client.updateCombatant(combatId, combatantId, { defeated: true }),
      client.confirmCombatAction(combatId, combatActionId),
      client.rejectCombatAction(combatId, combatActionId, { reason: "Needs manual adjustment" }),
      client.endCombat(combatId),
      client.encounters(campaignId),
      client.createEncounter(campaignId, { name: "Encounter" }),
      client.proposals(campaignId),
      client.createProposal(campaignId, { status: "pending" }),
      client.approveProposal(proposalId),
      client.applyProposal(proposalId),
      client.rejectProposal(proposalId),
      client.aiThreads(campaignId),
      client.createAiThread(campaignId, { prompt: "Plan" }),
      client.aiUsage(campaignId),
      client.aiEvaluations(campaignId),
      client.createAiEvaluation(campaignId, { name: "Eval" }),
      client.aiMemory(campaignId),
      client.createAiMemory(campaignId, { text: "Fact" }),
      client.extractAiMemory(campaignId, { transcript: "Transcript" }),
      client.approveAiMemory(factId),
      client.deleteAiMemory(factId),
      client.aiToolCalls(campaignId),
      client.retryAiToolCall(campaignId, toolCallId),
      client.aiSessionRecap(campaignId, { transcript: "Transcript" }),
      client.aiEncounterDesign(campaignId, { prompt: "Encounter" }),
      client.aiGenerateMapAsset(campaignId, { prompt: "Map", sceneId }),
      client.aiGenerateTokenAsset(campaignId, { prompt: "Token", tokenId }),
      client.mcp({ jsonrpc: "2.0", id: "mcp_client", method: "tools/list", params: { campaignId } }),
      client.submitBoardCapture(requestId, { error: "not available" }),
      client.plugins(),
      client.registerPlugin({ packageId: pluginId }),
      client.syncPluginRegistry(),
      client.plugins(campaignId),
      client.installPlugin(campaignId, pluginId),
      client.pluginStorage(campaignId, pluginId),
      client.pluginStorageEntry(campaignId, pluginId, pluginKey),
      client.setPluginStorageEntry(campaignId, pluginId, pluginKey, { enabled: true }),
      client.deletePluginStorageEntry(campaignId, pluginId, pluginKey),
      client.runPluginChatCommand(campaignId, pluginId, { command: "/spark" }),
      client.systems(),
      client.registerSystem({ systemId }),
      client.systems(campaignId),
      client.installSystem(campaignId, systemId),
      client.systemCharacterTemplates(campaignId, systemId),
      client.systemCharacterOrigins(campaignId, systemId),
      client.createSystemCharacter(campaignId, systemId, { name: "Character" }),
      client.createSystemMonster(campaignId, systemId, { name: "Monster" }),
      client.importSystemCharacter(campaignId, systemId, { name: "Import" }),
      client.systemEncounterThreats(campaignId, systemId),
      client.systemEncounterPlan(campaignId, systemId, { partyLevel: 1 }),
      client.systemCompendium(campaignId, systemId),
      client.addSystemCompendiumToActor(campaignId, systemId, actorId, { entryId: "spell" }),
      client.purchaseSystemEquipment(campaignId, systemId, actorId, { itemId: "rope" }),
      client.addSystemActorCondition(campaignId, systemId, actorId, { conditionId }),
      client.removeSystemActorCondition(campaignId, systemId, actorId, conditionId),
      client.systemActorAdvancement(campaignId, systemId, actorId),
      client.advanceSystemActor(campaignId, systemId, actorId, { optionId: "hp" }),
      client.restSystemActor(campaignId, systemId, actorId, { restType: "short" }),
      client.systemActorSheet(campaignId, systemId, actorId),
      client.rollSystemActor(campaignId, systemId, actorId, { actionId: "attack" }),
      client.contentImports(campaignId),
      client.previewContentImport(campaignId, { source: "manual" }),
      client.contentImport(importId),
      client.applyContentImport(importId, { selectedEntityIds: [] }),
      client.rollbackContentImport(importId),
      client.deleteContentImport(importId),
      client.exportCampaign(campaignId),
      client.dogfoodReportBundle(campaignId),
      client.importCampaign({ format: "ottx" })
    ]);

    const coveredRoutes = new Set(calls.map(normalizeCall));
    const missing = publicOpenApiRoutes().filter((route) => !coveredRoutes.has(route));
    expect(missing).toEqual([]);
  });
});

function publicOpenApiRoutes(): string[] {
  return Object.entries(openApiSpec.paths)
    .flatMap(([path, item]) => Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`))
    .filter((route) => !isExcludedRoute(route))
    .sort();
}

function isExcludedRoute(route: string): boolean {
  const [, path] = route.split(" ");
  return (
    path === "/api/v1/openapi.json" ||
    path === "/api/v1/realtime" ||
    path === "/api/v1/assets/{assetId}/blob" ||
    route === "GET /api/v1/agent/board-captures/{captureHandle}" ||
    path === "/api/v1/auth/oidc/callback" ||
    Boolean(path?.startsWith("/api/v1/admin/")) ||
    Boolean(path?.startsWith("/api/v1/scim/"))
  );
}

function normalizeCall(call: string): string {
  return call
    .replace(campaignId, "{campaignId}")
    .replace(sceneId, "{sceneId}")
    .replace(assetId, "{assetId}")
    .replace(tokenId, "{tokenId}")
    .replace(factId, "{factId}")
    .replace(toolCallId, "{toolCallId}")
    .replace(combatActionId, "{actionId}")
    .replace(actorId, "{actorId}")
    .replace(itemId, "{itemId}")
    .replace(entryId, "{entryId}")
    .replace(messageId, "{messageId}")
    .replace(macroId, "{macroId}")
    .replace(rollId, "{rollId}")
    .replace(audioTrackId, "{trackId}")
    .replace(combatId, "{combatId}")
    .replace(combatantId, "{combatantId}")
    .replace(proposalId, "{proposalId}")
    .replace(importId, "{importId}")
    .replace(pluginId, "{pluginId}")
    .replace(pluginKey, "{key}")
    .replace(systemId, "{systemId}")
    .replace(conditionId, "{conditionId}")
    .replace(inviteId, "{inviteId}")
    .replace(sessionId, "{sessionId}")
    .replace(requestId, "{captureHandle}")
    .replace(fogId, "{fogId}")
    .replace(wallId, "{wallId}")
    .replace(lightId, "{lightId}")
    .replace(annotationId, "{annotationId}")
    .replace(organizationMemberId, "{memberId}")
    .replace("preset_client", "{presetId}");
}
