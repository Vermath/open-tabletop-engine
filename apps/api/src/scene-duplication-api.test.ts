import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedState, type Actor, type EngineState, type Encounter, type Item, type MapAsset, type Scene, type Token } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { FileStateStore, MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const at = "2026-07-15T12:00:00.000Z";

class OneShotReplaceFailureStore extends MemoryStateStore {
  failNextReplace = false;

  override replace(state: EngineState, options: { flush?: boolean } = {}): void {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      this.state = state;
      throw new Error("simulated scene duplication persistence failure");
    }
    super.replace(state, options);
  }
}

class OneShotSaveFailureStore extends MemoryStateStore {
  failNextSave = false;

  override save(): void {
    if (!this.failNextSave) return;
    this.failNextSave = false;
    throw new Error("simulated deferred scene duplication save failure");
  }
}

function addSceneGraph(store: MemoryStateStore | FileStateStore, suffix: string) {
  const campaignId = "camp_demo";
  const asset: MapAsset = { id: `asset_scene_dup_${suffix}`, campaignId, name: `Map ${suffix}`, url: `https://assets.example.test/${suffix}.png`, mimeType: "image/png", sizeBytes: 0, createdAt: at, updatedAt: at };
  const actor: Actor = { id: `act_scene_dup_${suffix}`, campaignId, systemId: "dnd-5e-srd", ownerUserId: "usr_demo_gm", type: "npc", name: `Dup Actor ${suffix}`, data: { hp: { current: 8, max: 8 } }, permissions: {}, createdAt: at, updatedAt: at };
  const scene: Scene = { id: `scn_scene_dup_${suffix}`, campaignId, worldId: store.state.worlds[0]?.id, name: `Dup Scene ${suffix}`, width: 1000, height: 700, gridType: "square", gridSize: 50, backgroundAssetId: asset.id, folder: "prep/duplicate", active: false, sortOrder: 50, fog: [], walls: [], lights: [], annotations: [], difficultTerrain: [], coverOverrides: [], metadata: {}, createdAt: at, updatedAt: at };
  const token: Token = { id: `tok_scene_dup_${suffix}`, sceneId: scene.id, actorId: actor.id, name: actor.name, x: 100, y: 100, width: 1, height: 1, rotation: 0, hidden: false, locked: false, visionEnabled: false, visionRadius: 0, disposition: "hostile", metadata: {}, createdAt: at, updatedAt: at };
  const item: Item = { id: `item_scene_dup_${suffix}`, campaignId, systemId: actor.systemId, actorId: actor.id, type: "weapon", name: "Club", data: { uses: 1 }, createdAt: at, updatedAt: at };
  const encounter: Encounter = { id: `enc_scene_dup_${suffix}`, campaignId, systemId: actor.systemId, name: `Dup Encounter ${suffix}`, summary: "", tokenIds: [token.id], createdAt: at, updatedAt: at };
  store.state.assets.push(asset);
  store.state.scenes.push(scene);
  store.state.actors.push(actor);
  store.state.tokens.push(token);
  store.state.items.push(item);
  store.state.encounters.push(encounter);
  return { scene, actor, token, item, encounter, asset };
}

function duplicationPayload(store: MemoryStateStore | FileStateStore, scene: Scene, operationId: string, dryRun?: boolean) {
  return {
    operationId,
    expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === scene.campaignId)!.updatedAt,
    sources: [{ sceneId: scene.id, expectedUpdatedAt: scene.updatedAt }],
    ...(dryRun === undefined ? {} : { dryRun }),
  };
}

describe("scene duplication API", () => {
  it("previews and atomically commits a permissioned exact-revision graph once", async () => {
    const store = new MemoryStateStore(seedState());
    const source = addSceneGraph(store, "api");
    const app = await buildApp({ store });
    try {
      const denied = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scene-duplications",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "scene-duplication-denied" },
        payload: duplicationPayload(store, source.scene, "scene-duplication-denied", true),
      });
      expect(denied.statusCode).toBe(403);

      store.state.permissionGrants.push({
        id: "grant_scene_dup_without_private",
        subjectType: "user",
        subjectId: "usr_demo_player",
        campaignId: "camp_demo",
        permissions: ["scene.create", "token.create", "token.update", "actor.create", "actor.update", "combat.manage"],
        createdAt: at,
        updatedAt: at,
      });
      const privateDenied = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scene-duplications",
        headers: { "x-user-id": "usr_demo_player", "idempotency-key": "scene-duplication-private-denied" },
        payload: duplicationPayload(store, source.scene, "scene-duplication-private-denied", true),
      });
      expect(privateDenied.statusCode).toBe(403);
      expect(privateDenied.json().message).toContain("actor.readPrivate");

      const sceneCount = store.state.scenes.length;
      const previewPayload = duplicationPayload(store, source.scene, "scene-duplication-api", true);
      const preview = await app.inject({ method: "POST", url: "/api/v1/campaigns/camp_demo/scene-duplications", headers: { ...gmHeaders, "idempotency-key": "scene-duplication-preview" }, payload: previewPayload });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ dryRun: true, plan: { counts: { scenes: 1, tokens: 1, actors: 1, items: 1, encounters: 1 } }, scenes: [], tokens: [], actors: [] });
      expect(store.state.scenes).toHaveLength(sceneCount);

      const commitPayload = { ...previewPayload, dryRun: false };
      const request = { method: "POST" as const, url: "/api/v1/campaigns/camp_demo/scene-duplications", headers: { ...gmHeaders, "idempotency-key": "scene-duplication-commit" }, payload: commitPayload };
      const committed = await app.inject(request);
      expect(committed.statusCode).toBe(201);
      const result = committed.json();
      expect(result).toMatchObject({ dryRun: false, campaign: { id: "camp_demo" }, plan: { operationId: "scene-duplication-api" } });
      expect(result.scenes[0]).toMatchObject({ name: `${source.scene.name} Copy`, active: false, backgroundAssetId: source.scene.backgroundAssetId });
      expect(result.tokens[0]).toMatchObject({ sceneId: result.scenes[0].id, actorId: result.actors[0].id });
      expect(result.items[0]).toMatchObject({ actorId: result.actors[0].id, name: source.item.name });
      expect(result.encounters[0].tokenIds).toEqual([result.tokens[0].id]);
      expect(store.state.scenes.find((scene) => scene.id === source.scene.id)?.name).toBe(source.scene.name);
      expect(store.state.auditLogs).toContainEqual(expect.objectContaining({ action: "scene.duplicate.batch", targetId: "camp_demo" }));

      const replay = await app.inject(request);
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(committed.body);

      const stale = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scene-duplications",
        headers: { ...gmHeaders, "idempotency-key": "scene-duplication-stale" },
        payload: { ...duplicationPayload(store, source.scene, "scene-duplication-stale"), sources: [{ sceneId: source.scene.id, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }] },
      });
      expect(stale.statusCode).toBe(409);

      const otherCampaign = { ...store.state.campaigns[0]!, id: "camp_scene_dup_other", name: "Other", updatedAt: at };
      store.state.campaigns.push(otherCampaign);
      const crossCampaign = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${otherCampaign.id}/scene-duplications`,
        headers: { ...gmHeaders, "idempotency-key": "scene-duplication-cross-campaign" },
        payload: { operationId: "scene-duplication-cross", expectedUpdatedAt: otherCampaign.updatedAt, sources: [{ sceneId: source.scene.id, expectedUpdatedAt: source.scene.updatedAt }] },
      });
      expect(crossCampaign.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("leaves no copied graph when state persistence fails mid-commit", async () => {
    const store = new OneShotReplaceFailureStore(seedState());
    const source = addSceneGraph(store, "failure");
    const app = await buildApp({ store });
    try {
      const beforeRevision = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt;
      const beforeCounts = { scenes: store.state.scenes.length, actors: store.state.actors.length, tokens: store.state.tokens.length, items: store.state.items.length, encounters: store.state.encounters.length };
      store.failNextReplace = true;
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scene-duplications",
        headers: { ...gmHeaders, "idempotency-key": "scene-duplication-failure" },
        payload: duplicationPayload(store, source.scene, "scene-duplication-failure"),
      });
      expect(response.statusCode).toBe(500);
      expect({ scenes: store.state.scenes.length, actors: store.state.actors.length, tokens: store.state.tokens.length, items: store.state.items.length, encounters: store.state.encounters.length }).toEqual(beforeCounts);
      expect(store.state.campaigns.find((campaign) => campaign.id === "camp_demo")?.updatedAt).toBe(beforeRevision);
      expect(store.state.auditLogs.some((entry) => entry.action === "scene.duplicate.batch" && entry.after && JSON.stringify(entry.after).includes("scene-duplication-failure"))).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("rolls back the complete graph when the response-bound durable save fails", async () => {
    const store = new OneShotSaveFailureStore(seedState());
    const source = addSceneGraph(store, "deferred-failure");
    const app = await buildApp({ store });
    try {
      const before = structuredClone(store.state);
      store.failNextSave = true;
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/scene-duplications",
        headers: { ...gmHeaders, "idempotency-key": "scene-duplication-deferred-failure" },
        payload: duplicationPayload(store, source.scene, "scene-duplication-deferred-failure"),
      });
      expect(response.statusCode).toBe(500);
      expect(store.state).toEqual(before);
      expect(store.state.idempotencyRecords.some((record) => record.key === "scene-duplication-deferred-failure")).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("replays the committed response after a real state-store restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-scene-duplication-replay-"));
    const statePath = join(directory, "state.json");
    let request: { method: "POST"; url: string; headers: Record<string, string>; payload: ReturnType<typeof duplicationPayload> } | undefined;
    let committedBody = "";
    try {
      const firstStore = new FileStateStore(statePath);
      const source = addSceneGraph(firstStore, "restart");
      firstStore.save();
      firstStore.flush();
      const firstApp = await buildApp({ store: firstStore, uploadDir: join(directory, "uploads") });
      try {
        request = { method: "POST", url: "/api/v1/campaigns/camp_demo/scene-duplications", headers: { ...gmHeaders, "idempotency-key": "scene-duplication-restart" }, payload: duplicationPayload(firstStore, source.scene, "scene-duplication-restart") };
        const committed = await firstApp.inject(request);
        expect(committed.statusCode).toBe(201);
        committedBody = committed.body;
      } finally {
        await firstApp.close();
        firstStore.close();
      }

      const restartedStore = new FileStateStore(statePath);
      const restartedApp = await buildApp({ store: restartedStore, uploadDir: join(directory, "uploads") });
      try {
        const replay = await restartedApp.inject(request!);
        expect(replay.statusCode).toBe(201);
        expect(replay.headers["idempotency-replayed"]).toBe("true");
        expect(replay.body).toBe(committedBody);
        expect(restartedStore.state.scenes.filter((scene) => scene.name === "Dup Scene restart Copy")).toHaveLength(1);
      } finally {
        await restartedApp.close();
        restartedStore.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
