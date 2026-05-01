import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { emptyState, type EngineState } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

describe("api", () => {
  it("serves campaigns, rolls dice, and exports campaign data", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const campaigns = await app.inject({ method: "GET", url: "/api/v1/campaigns", headers: authHeaders });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json()).toHaveLength(1);

    const roll = await app.inject({
      method: "POST",
      url: "/api/v1/dice/roll",
      headers: authHeaders,
      payload: { campaignId: "camp_demo", formula: "1d20+5", visibility: "public" }
    });
    expect(roll.statusCode).toBe(200);
    expect(roll.json().total).toBeGreaterThanOrEqual(6);

    const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: authHeaders });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().format).toBe("ottx");

    await app.close();
  });

  it("covers auth, assets, fog, encounter design, and session memory", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const session = await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: authHeaders });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.id).toBe("usr_demo_gm");

    const asset = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets",
      headers: authHeaders,
      payload: { name: "Vault Map", url: "https://example.test/vault.png", mimeType: "image/png" }
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.json().name).toBe("Vault Map");

    const fog = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      headers: authHeaders,
      payload: { x: 420, y: 320, radius: 100 }
    });
    expect(fog.statusCode).toBe(200);
    expect(fog.json().fog).toHaveLength(2);

    const encounter = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      headers: authHeaders,
      payload: { prompt: "A clockwork sentinel", difficulty: "hard" }
    });
    expect(encounter.statusCode).toBe(200);
    expect(encounter.json().proposal.title).toBe("Encounter Designer Draft");

    const recap = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      headers: authHeaders,
      payload: { transcript: "The party opened the vault." }
    });
    expect(recap.statusCode).toBe(200);
    expect(recap.json().memory.text).toContain("vault");

    const memory = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/ai/memory", headers: authHeaders });
    expect(memory.statusCode).toBe(200);
    expect(memory.json()).toHaveLength(1);

    await app.close();
  });

  it("rejects unauthenticated and unauthorized campaign access", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const missingSession = await app.inject({ method: "GET", url: "/api/v1/campaigns" });
    expect(missingSession.statusCode).toBe(401);

    const blockedMutation = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/tokens",
      headers: { "x-user-id": "usr_observer" },
      payload: { name: "Unauthorized Token" }
    });
    expect(blockedMutation.statusCode).toBe(403);

    const secretJournal = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/journal",
      headers: { "x-user-id": "usr_observer" }
    });
    expect(secretJournal.statusCode).toBe(200);
    expect(secretJournal.json()).toEqual([]);

    await app.close();
  });

  it("authors walls and lights with scene update permission", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const blockedWall = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/walls",
      headers: { "x-user-id": "usr_observer" },
      payload: { x1: 100, y1: 100, x2: 500, y2: 100 }
    });
    expect(blockedWall.statusCode).toBe(403);

    const wall = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/walls",
      headers: authHeaders,
      payload: { x1: 220, y1: 160, x2: 840, y2: 160 }
    });
    expect(wall.statusCode).toBe(200);
    expect(wall.json().walls.at(-1)).toEqual(expect.objectContaining({ x1: 220, y1: 160, x2: 840, y2: 160, blocksVision: true }));

    const light = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/lights",
      headers: authHeaders,
      payload: { x: 360, y: 340, radius: 240, color: "#facc15" }
    });
    expect(light.statusCode).toBe(200);
    expect(light.json().lights.at(-1)).toEqual(expect.objectContaining({ x: 360, y: 340, radius: 240, color: "#facc15" }));

    const scene = await app.inject({ method: "GET", url: "/api/v1/scenes/scn_vault_entry", headers: authHeaders });
    expect(scene.json().walls).toHaveLength(2);
    expect(scene.json().lights).toHaveLength(2);

    await app.close();
  });

  it("runs plugin and system runtime flows with permission boundaries", async () => {
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_observer",
      displayName: "Observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    store.state.members.push({
      id: "mem_observer",
      campaignId: "camp_demo",
      userId: "usr_observer",
      role: "observer",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const app = await buildApp({ store });

    const observerInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: { "x-user-id": "usr_observer" }
    });
    expect(observerInstall.statusCode).toBe(403);

    const pluginInstall = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/install",
      headers: authHeaders
    });
    expect(pluginInstall.statusCode).toBe(200);
    expect(pluginInstall.json().grant.permissions).toEqual(["chat.write", "token.read"]);

    const grant = store.state.permissionGrants.find((item) => item.subjectType === "plugin" && item.subjectId === "example-macro-plugin");
    expect(grant).toBeTruthy();
    grant!.permissions = ["token.read"];
    const blockedCommand = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/chat-command",
      headers: authHeaders,
      payload: { command: "/spark" }
    });
    expect(blockedCommand.statusCode).toBe(403);

    grant!.permissions = ["chat.write", "token.read"];
    const command = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/plugins/example-macro-plugin/chat-command",
      headers: authHeaders,
      payload: { command: "/spark", args: "test flare" }
    });
    expect(command.statusCode).toBe(200);
    expect(command.json().chat.type).toBe("plugin");
    expect(command.json().chat.body).toContain("Valen Ash");

    const sheet = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/sheet",
      headers: authHeaders
    });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.json().summary).toContain("Valen Ash");
    expect(sheet.json().quickRolls).toContainEqual({ id: "ability-charisma", label: "Charisma Check", formula: "1d20+2" });

    const observerRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: { "x-user-id": "usr_observer" },
      payload: { rollId: "ability-charisma" }
    });
    expect(observerRoll.statusCode).toBe(403);

    const systemRoll = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/systems/generic-fantasy/actors/act_valen/roll",
      headers: authHeaders,
      payload: { rollId: "ability-charisma" }
    });
    expect(systemRoll.statusCode).toBe(200);
    expect(systemRoll.json().quickRoll.formula).toBe("1d20+2");
    expect(store.state.chat.some((message) => message.body.includes("Charisma Check"))).toBe(true);

    await app.close();
  });

  it("passes only caller-visible campaign context to ai providers", async () => {
    class CapturingAiProvider implements AiProvider {
      id = "test-ai";
      label = "Test AI";
      requests: AiProviderRequest[] = [];

      async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
        this.requests.push(input);
        yield { type: "message.completed", content: `Captured response ${this.requests.length}` };
      }
    }

    const now = "2026-05-01T00:00:00.000Z";
    const provider = new CapturingAiProvider();
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_player",
      displayName: "Player",
      createdAt: now,
      updatedAt: now
    });
    store.state.members.push({
      id: "mem_player",
      campaignId: "camp_demo",
      userId: "usr_player",
      role: "player",
      createdAt: now,
      updatedAt: now
    });
    store.state.journals.push({
      id: "jnl_public",
      campaignId: "camp_demo",
      title: "Public Rumor",
      body: "The brass key is visible to everyone.",
      visibility: "public",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: [],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
      createdAt: now,
      updatedAt: now
    });
    const app = await buildApp({ store, aiProvider: provider });

    const playerThread = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: { "x-user-id": "usr_player" },
      payload: { prompt: "What do I know?" }
    });
    expect(playerThread.statusCode).toBe(200);
    expect(playerThread.json().thread.provider).toBe("test-ai");
    expect(provider.requests).toHaveLength(1);
    const playerContext = provider.requests[0]!.context;
    expect(playerContext.publicSummary).toContain("Public Rumor");
    expect(playerContext.publicSummary).not.toContain("Session Hook");
    expect(playerContext.gmSecrets).toEqual([]);
    expect(store.state.chat.find((message) => message.body === "Captured response 1")?.visibility).toBe("public");

    const gmThread = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/threads",
      headers: authHeaders,
      payload: { prompt: "What is secret?" }
    });
    expect(gmThread.statusCode).toBe(200);
    expect(provider.requests).toHaveLength(2);
    const gmContext = provider.requests[1]!.context;
    expect(gmContext.publicSummary).toContain("Session Hook");
    expect(gmContext.gmSecrets.some((secret) => secret.includes("founder's oath"))).toBe(true);
    expect(store.state.chat.find((message) => message.body === "Captured response 2")?.visibility).toBe("gm_only");

    const playerChat = await app.inject({
      method: "GET",
      url: "/api/v1/chat/messages?campaignId=camp_demo",
      headers: { "x-user-id": "usr_player" }
    });
    expect(playerChat.statusCode).toBe(200);
    expect(playerChat.json().map((message: { body: string }) => message.body)).toContain("Captured response 1");
    expect(playerChat.json().map((message: { body: string }) => message.body)).not.toContain("Captured response 2");

    await app.close();
  });

  it("can select the codex loopback ai provider from configuration", async () => {
    const previousProvider = process.env.OTTE_AI_PROVIDER;
    process.env.OTTE_AI_PROVIDER = "codex-loopback";
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;

    try {
      app = await buildApp({ store: new MemoryStateStore() });
      const thread = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/threads",
        headers: authHeaders,
        payload: { prompt: "Summarize the party state" }
      });

      expect(thread.statusCode).toBe(200);
      expect(thread.json().thread.provider).toBe("codex-app-server");
      expect(thread.json().assistantMessage).toContain("Codex loopback handled turn/start");
      expect(thread.json().events).toContainEqual(expect.objectContaining({ type: "message.completed" }));
    } finally {
      await app?.close();
      if (previousProvider === undefined) {
        delete process.env.OTTE_AI_PROVIDER;
      } else {
        process.env.OTTE_AI_PROVIDER = previousProvider;
      }
    }
  });

  it("approves and applies ai proposals and memory with permission boundaries", async () => {
    const now = "2026-05-01T00:00:00.000Z";
    const store = new MemoryStateStore();
    store.state.users.push({
      id: "usr_player",
      displayName: "Player",
      createdAt: now,
      updatedAt: now
    });
    store.state.members.push({
      id: "mem_player",
      campaignId: "camp_demo",
      userId: "usr_player",
      role: "player",
      createdAt: now,
      updatedAt: now
    });
    const app = await buildApp({ store });

    const encounterDraft = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      headers: authHeaders,
      payload: { prompt: "A mirror knight guarding the vault", difficulty: "hard" }
    });
    expect(encounterDraft.statusCode).toBe(200);
    const proposalId = encounterDraft.json().proposal.id as string;

    const blockedApply = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: { "x-user-id": "usr_player" }
    });
    expect(blockedApply.statusCode).toBe(403);

    const unapprovedApply = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: authHeaders
    });
    expect(unapprovedApply.statusCode).toBe(409);

    const approved = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/approve`,
      headers: authHeaders
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("approved");
    expect(approved.json().approvedByUserId).toBe("usr_demo_gm");

    const applied = await app.inject({
      method: "POST",
      url: `/api/v1/proposals/${proposalId}/apply`,
      headers: authHeaders
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().status).toBe("applied");
    expect(store.state.encounters.some((encounter) => encounter.name === "AI Draft Encounter" && encounter.difficulty === "hard")).toBe(true);

    const recap = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      headers: authHeaders,
      payload: { transcript: "The party mapped the lower vault." }
    });
    expect(recap.statusCode).toBe(200);
    const memoryId = recap.json().memory.id as string;

    const blockedMemoryApproval = await app.inject({
      method: "POST",
      url: `/api/v1/ai/memory/${memoryId}/approve`,
      headers: { "x-user-id": "usr_player" }
    });
    expect(blockedMemoryApproval.statusCode).toBe(403);

    const approvedMemory = await app.inject({
      method: "POST",
      url: `/api/v1/ai/memory/${memoryId}/approve`,
      headers: authHeaders
    });
    expect(approvedMemory.statusCode).toBe(200);
    expect(approvedMemory.json().approvedByUserId).toBe("usr_demo_gm");

    const memory = await app.inject({
      method: "GET",
      url: "/api/v1/campaigns/camp_demo/ai/memory",
      headers: authHeaders
    });
    expect(memory.json().some((fact: { id: string; approvedByUserId?: string }) => fact.id === memoryId && fact.approvedByUserId === "usr_demo_gm")).toBe(true);

    await app.close();
  });

  it("uploads a map asset, assigns it to a scene, and serves the stored bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-assets-"));
    const app = await buildApp({ store: new MemoryStateStore(), uploadDir: directory });
    const bytes = Buffer.from("fake-image-bytes");

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true",
      headers: { ...authHeaders, "content-type": "image/png", "x-asset-name": encodeURIComponent("Vault Upload.png") },
      payload: bytes
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().asset.name).toBe("Vault Upload.png");
    expect(uploaded.json().asset.sizeBytes).toBe(bytes.length);
    expect(uploaded.json().asset.checksum).toMatch(/^sha256:/);
    expect(uploaded.json().scene.backgroundAssetId).toBe(uploaded.json().asset.id);

    const assetId = uploaded.json().asset.id as string;
    expect(existsSync(join(directory, "camp_demo", `${assetId}.png`))).toBe(true);

    const unauthenticatedBlob = await app.inject({ method: "GET", url: `/api/v1/assets/${assetId}/blob` });
    expect(unauthenticatedBlob.statusCode).toBe(401);

    const blob = await app.inject({ method: "GET", url: `/api/v1/assets/${assetId}/blob?userId=usr_demo_gm` });
    expect(blob.statusCode).toBe(200);
    expect(blob.headers["content-type"]).toContain("image/png");
    expect(blob.body).toBe("fake-image-bytes");

    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists campaign state across sqlite-backed store restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-api-"));
    const dbPath = join(directory, "state.sqlite");

    const firstStore = new SqliteStateStore(dbPath);
    const firstApp = await buildApp({ store: firstStore });
    const created = await firstApp.inject({
      method: "POST",
      url: "/api/v1/campaigns",
      headers: authHeaders,
      payload: { name: "Restart Safe Campaign", description: "Stored in SQLite" }
    });
    expect(created.statusCode).toBe(200);
    const campaignId = created.json().id;
    await firstApp.close();
    firstStore.close();

    const secondStore = new SqliteStateStore(dbPath);
    const secondApp = await buildApp({ store: secondStore });
    const campaigns = await secondApp.inject({ method: "GET", url: "/api/v1/campaigns", headers: authHeaders });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json().some((campaign: { id: string }) => campaign.id === campaignId)).toBe(true);
    await secondApp.close();
    secondStore.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("round-trips a campaign archive into a fresh instance with all MVP collections", async () => {
    const sourceStore = new MemoryStateStore();
    sourceStore.state.permissionGrants.push({
      id: "grant_player_token_move",
      subjectType: "user",
      subjectId: "usr_demo_gm",
      campaignId: "camp_demo",
      permissions: ["token.move"],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const sourceApp = await buildApp({ store: sourceStore });
    await sourceApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets",
      headers: authHeaders,
      payload: { id: "asset_roundtrip", name: "Roundtrip Map", url: "map://roundtrip", mimeType: "image/png", checksum: "sha256:test" }
    });
    await sourceApp.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/encounters",
      headers: authHeaders,
      payload: { id: "enc_roundtrip", name: "Roundtrip Encounter", summary: "Imported later", tokenIds: ["tok_valen"] }
    });
    const exported = await sourceApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export", headers: authHeaders });
    expect(exported.statusCode).toBe(200);
    const archive = exported.json();
    await sourceApp.close();

    const freshState: EngineState = emptyState();
    freshState.users.push({
      id: "usr_demo_gm",
      displayName: "Import Admin",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const targetStore = new MemoryStateStore(freshState);
    const targetApp = await buildApp({ store: targetStore });
    const imported = await targetApp.inject({
      method: "POST",
      url: "/api/v1/import/campaign",
      headers: authHeaders,
      payload: archive
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().importedCampaignIds).toEqual(["camp_demo"]);

    const importedScenes = await targetApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/scenes", headers: authHeaders });
    const importedTokens = await targetApp.inject({ method: "GET", url: "/api/v1/scenes/scn_vault_entry/tokens", headers: authHeaders });
    const importedActors = await targetApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/actors", headers: authHeaders });
    const importedJournals = await targetApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/journal", headers: authHeaders });
    const importedAssets = await targetApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/assets", headers: authHeaders });
    const importedEncounters = await targetApp.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/encounters", headers: authHeaders });

    expect(importedScenes.json().map((scene: { id: string }) => scene.id)).toContain("scn_vault_entry");
    expect(importedTokens.json().map((token: { id: string }) => token.id)).toContain("tok_valen");
    expect(importedActors.json().map((actor: { id: string }) => actor.id)).toContain("act_valen");
    expect(importedJournals.json().map((journal: { id: string }) => journal.id)).toContain("jnl_hook");
    expect(importedAssets.json().map((asset: { name: string }) => asset.name)).toContain("Roundtrip Map");
    expect(importedEncounters.json().map((encounter: { name: string }) => encounter.name)).toContain("Roundtrip Encounter");
    expect(targetStore.state.permissionGrants.map((grant) => grant.id)).toContain("grant_player_token_move");

    await targetApp.close();
  });
});
