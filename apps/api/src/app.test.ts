import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
