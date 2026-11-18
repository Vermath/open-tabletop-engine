import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeArchive, type MapAsset } from "@open-tabletop/core";
import { dnd5eSrdMonsterActorData } from "@open-tabletop/system-sdk";
import { expect, it } from "vitest";
import { buildApp } from "./app.js";
import { LocalAssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

const gm = { "x-user-id": "usr_demo_gm" };
const payload = { name: "My adventure", defaultSystemId: "dnd-5e-srd", starterAdventure: "ember-vault" };

it("creates independent playable adventures and replays the original campaign after a lost response", async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), "otte-ember-starter-"));
  const store = new MemoryStateStore();
  const app = await buildApp({ store, uploadDir });
  const create = (key: string) => app.inject({ method: "POST", url: "/api/v1/campaigns", headers: { ...gm, "idempotency-key": `ember-vault-${key}` }, payload });
  try {
    const first = await create("first");
    expect(first.statusCode, first.body).toBe(200);
    const replay = await create("first");
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(first.json().id);
    const second = await create("second");
    expect(second.statusCode, second.body).toBe(200);
    const a = makeArchive(store.state, first.json().id).data;
    const b = makeArchive(store.state, second.json().id).data;
    expect(a.scenes).toHaveLength(1);
    const scene = a.scenes[0]!;
    expect(scene).toMatchObject({ name: "Vault Entry", active: true, gridSize: 100, width: 2800, height: 2100, metadata: { mapCalibrationComplete: true } });
    expect(a.assets).toHaveLength(6);
    expect(a.assets.find((asset) => asset.id === scene.backgroundAssetId)).toMatchObject({ image: { width: 2800, height: 2100 }, storage: { provider: "local" } });
    expect(a.actors).toHaveLength(5);
    expect(a.tokens).toHaveLength(5);
    for (const token of a.tokens) {
      const actor = a.actors.find((candidate) => candidate.id === token.actorId)!;
      expect(actor.imageAssetId).toBe(token.imageAssetId);
      expect(a.assets.some((asset) => asset.id === actor.imageAssetId)).toBe(true);
      expect(token.sceneId).toBe(scene.id);
      if (actor.type === "character") {
        expect(actor).toMatchObject({ characterClaimOffered: true, data: { level: 1, hp: { max: expect.any(Number) } } });
        expect(actor.ownerUserId).toBeUndefined();
        expect(a.items.some((item) => item.actorId === actor.id)).toBe(true);
      }
    }
    expect(a.actors.filter((actor) => actor.type === "character")).toHaveLength(2);
    expect(a.handouts).toMatchObject([{ title: "The Ember Key", visibility: "public", createdBy: gm["x-user-id"] }]);
    const encounter = a.encounters[0]!;
    expect(encounter.partyActorIds?.sort()).toEqual(a.actors.filter((actor) => actor.type === "character").map((actor) => actor.id).sort());
    expect(encounter.tokenIds.slice().sort()).toEqual(a.tokens.map((token) => token.id).sort());
    const references = (data: typeof a) => [
      ...data.assets, ...data.scenes, ...data.tokens, ...data.actors, ...data.items, ...data.handouts, ...data.encounters,
      ...data.scenes.flatMap((scene) => [...scene.lights, ...scene.walls, ...scene.fog, ...(scene.activationHistory ?? [])]),
    ].map((record) => record.id);
    expect(references(a).filter((id) => references(b).includes(id))).toEqual([]);
    expect(a.assets.some((asset) => b.assets.some((copy) => asset.storage?.key === copy.storage?.key))).toBe(false);
    const sentryStats = (campaignId: string) => store.state.actors.find((actor) => actor.campaignId === campaignId && actor.name === "Cinder Sentry")!.data;
    const original = dnd5eSrdMonsterActorData("animated-armor")!;
    const attributes = (data: Record<string, unknown>) => data.attributes as Record<string, number>;
    const actions = (data: Record<string, unknown>) => (data.monster as { statBlock: { actions: Array<{ name: string }> } }).statBlock.actions;
    const originalStrength = attributes(original).strength;
    const originalAction = actions(original)[0]!.name;
    attributes(sentryStats(first.json().id)).strength = 1;
    actions(sentryStats(first.json().id))[0]!.name = "Changed by this GM";
    for (const untouched of [sentryStats(second.json().id), original]) {
      expect(attributes(untouched).strength).toBe(originalStrength);
      expect(actions(untouched)[0]!.name).toBe(originalAction);
    }
    const invalidStart = await app.inject({ method: "POST", url: `/api/v1/campaigns/${first.json().id}/combats/start`,
      headers: { ...gm, "idempotency-key": "ember-vault-foreign-encounter" }, payload: { sceneId: scene.id, encounterId: b.encounters[0]!.id,
        expectedUpdatedAt: first.json().updatedAt, participants: [{ tokenId: encounter.tokenIds[0], initiativeMode: "manual", initiative: 15 }] } });
    expect(invalidStart.statusCode).toBe(404);
    const start = await app.inject({ method: "POST", url: `/api/v1/campaigns/${first.json().id}/combats/start`,
      headers: { ...gm, "idempotency-key": "ember-vault-start" }, payload: { sceneId: scene.id, encounterId: encounter.id, expectedUpdatedAt: first.json().updatedAt,
        participants: encounter.tokenIds.map((tokenId, i) => ({ tokenId, initiativeMode: "manual", initiative: i + 1 })) } });
    expect(start.statusCode, start.body).toBe(200);
    expect(start.json().combat.encounterId).toBe(encounter.id);
    expect(store.state.combats.find((combat) => combat.campaignId === first.json().id)?.combatants).toHaveLength(5);
    expect(store.state.combats.some((combat) => combat.campaignId === second.json().id)).toBe(false);
  } finally {
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  }
});

it("removes partially written originals and renditions and lets the same request retry", async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), "otte-ember-retry-"));
  let fail = true;
  class FailingStorage extends LocalAssetStorage {
    override async put(asset: MapAsset, bytes: Buffer) {
      const stored = await super.put(asset, bytes);
      if (fail && asset.name === "Mira Vale.webp") throw new Error("Interrupted starter upload");
      return stored;
    }
  }
  const store = new MemoryStateStore();
  const app = await buildApp({ store, assetStorage: new FailingStorage(uploadDir), uploadDir });
  const request = { method: "POST" as const, url: "/api/v1/campaigns", headers: { ...gm, "idempotency-key": "ember-vault-retry" }, payload };
  try {
    const failed = await app.inject(request);
    expect(failed.statusCode).toBe(500);
    expect(store.state.campaigns.filter((campaign) => campaign.name === payload.name)).toHaveLength(0);
    expect(store.state.assets).toHaveLength(0);
    const files = await readdir(uploadDir, { recursive: true, withFileTypes: true });
    expect(files.filter((entry) => entry.isFile())).toHaveLength(0);
    fail = false;
    const retry = await app.inject(request);
    expect(retry.statusCode, retry.body).toBe(200);
    expect(store.state.assets).toHaveLength(6);
  } finally {
    await app.close();
    await rm(uploadDir, { recursive: true, force: true });
  }
});
