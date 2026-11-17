import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeArchive, type Actor, type CampaignArchive, type MapAsset } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { LocalAssetStorage } from "./asset-storage.js";
import { FileStateStore, MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };

function changedArchive(store: MemoryStateStore | FileStateStore, name: string, addedId: string): CampaignArchive {
  const archive = makeArchive(store.state, "camp_demo");
  const current = archive.data.actors.find((actor) => actor.id === "act_valen")!;
  archive.data.actors = archive.data.actors.map((actor) => actor.id === current.id ? { ...actor, name, updatedAt: new Date(Date.parse(actor.updatedAt) + 1_000).toISOString() } : actor);
  archive.data.actors.push({ ...current, id: addedId, name: addedId, updatedAt: new Date(Date.parse(current.updatedAt) + 2_000).toISOString() } satisfies Actor);
  return archive;
}

async function importArchive(app: Awaited<ReturnType<typeof buildApp>>, store: MemoryStateStore | FileStateStore, archive: CampaignArchive, key: string) {
  const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
  return app.inject({
    method: "POST",
    url: "/api/v1/import/campaign",
    headers: { ...gmHeaders, "idempotency-key": key },
    payload: { archive, mode: "upsert", scope: "all", expectedUpdatedAt: campaign.updatedAt },
  });
}

describe("campaign archive import operation API", () => {
  it("lists and previews only within the permitted campaign, then independently rolls A back after B", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const originalName = store.state.actors.find((actor) => actor.id === "act_valen")!.name;
      const importedA = await importArchive(app, store, changedArchive(store, "Changed by A", "act_added_a"), "archive-operation-a");
      expect(importedA.statusCode).toBe(200);
      const operationA = importedA.json().operation;
      expect(operationA).toMatchObject({ status: "applied" });
      expect(operationA.remainingRecordCount).toBeGreaterThanOrEqual(2);

      const archiveB = makeArchive(store.state, "camp_demo");
      const actorTemplate = archiveB.data.actors.find((actor) => actor.id === "act_valen")!;
      archiveB.data.actors.push({ ...actorTemplate, id: "act_added_b", name: "Added by B" });
      const importedB = await importArchive(app, store, archiveB, "archive-operation-b");
      expect(importedB.statusCode).toBe(200);

      const denied = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/archive-import-operations", headers: { "x-user-id": "usr_demo_player" } });
      expect(denied.statusCode).toBe(403);
      const listed = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/archive-import-operations", headers: gmHeaders });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().items.map((operation: { id: string }) => operation.id)).toEqual([importedB.json().operation.id, operationA.id]);
      expect(JSON.stringify(listed.json())).not.toContain("recordSteps");
      expect(JSON.stringify(listed.json())).not.toContain("inverseAsset");

      const preview = await app.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationA.id}/preview`, headers: gmHeaders });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ conflicts: [], impact: { restoreRecords: 1, deleteRecords: 1 } });

      const revision = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt;
      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationA.id}/rollback`,
        headers: { ...gmHeaders, "idempotency-key": "archive-operation-a-stale" },
        payload: { expectedUpdatedAt: "2020-01-01T00:00:00.000Z", confirmOperationId: operationA.id },
      });
      expect(stale.statusCode).toBe(409);
      const unconfirmed = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationA.id}/rollback`,
        headers: { ...gmHeaders, "idempotency-key": "archive-operation-a-unconfirmed" },
        payload: { expectedUpdatedAt: revision, confirmOperationId: "wrong-operation" },
      });
      expect(unconfirmed.statusCode).toBe(400);
      expect(store.state.actors.some((actor) => actor.id === "act_added_a")).toBe(true);
      const rollbackRequest = {
        method: "POST" as const,
        url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationA.id}/rollback`,
        headers: { ...gmHeaders, "idempotency-key": "archive-operation-a-rollback" },
        payload: { expectedUpdatedAt: revision, confirmOperationId: operationA.id },
      };
      const rolledBack = await app.inject(rollbackRequest);
      expect(rolledBack.statusCode).toBe(200);
      expect(rolledBack.json()).toMatchObject({ operation: { status: "rolled_back" }, conflicts: [] });
      expect(store.state.actors.find((actor) => actor.id === "act_valen")?.name).toBe(originalName);
      expect(store.state.actors.some((actor) => actor.id === "act_added_a")).toBe(false);
      expect(store.state.actors.some((actor) => actor.id === "act_added_b")).toBe(true);

      const replay = await app.inject(rollbackRequest);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["idempotency-replayed"]).toBe("true");
      expect(replay.body).toBe(rolledBack.body);
    } finally {
      await app.close();
    }
  });

  it("survives a real state-store restart and returns exact overlap conflict rows", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-archive-operation-restart-"));
    const statePath = join(directory, "state.json");
    const firstStore = new FileStateStore(statePath);
    const firstApp = await buildApp({ store: firstStore, uploadDir: join(directory, "uploads") });
    let operationId = "";
    try {
      const imported = await importArchive(firstApp, firstStore, changedArchive(firstStore, "Changed by A", "act_restart_a"), "archive-operation-restart-import");
      expect(imported.statusCode).toBe(200);
      operationId = imported.json().operation.id;
    } finally {
      await firstApp.close();
      firstStore.close();
    }

    const restartedStore = new FileStateStore(statePath);
    const restartedApp = await buildApp({ store: restartedStore, uploadDir: join(directory, "uploads") });
    try {
      const actor = restartedStore.state.actors.find((candidate) => candidate.id === "act_valen")!;
      actor.name = "Changed after restart";
      actor.updatedAt = new Date(Date.parse(actor.updatedAt) + 1_000).toISOString();
      restartedStore.save();
      restartedStore.flush();

      const preview = await restartedApp.inject({ method: "GET", url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationId}/preview`, headers: gmHeaders });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().conflicts).toContainEqual({ collection: "actors", id: "act_valen", reason: "record_changed" });

      const campaign = restartedStore.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const rollback = await restartedApp.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationId}/rollback`,
        headers: { ...gmHeaders, "idempotency-key": "archive-operation-restart-rollback" },
        payload: { expectedUpdatedAt: campaign.updatedAt, confirmOperationId: operationId },
      });
      expect(rollback.statusCode).toBe(200);
      expect(rollback.json()).toMatchObject({ operation: { status: "partially_rolled_back" } });
      expect(rollback.json().conflicts).toContainEqual({ collection: "actors", id: "act_valen", reason: "record_changed" });
      expect(restartedStore.state.actors.find((candidate) => candidate.id === "act_valen")?.name).toBe("Changed after restart");
      expect(restartedStore.state.actors.some((candidate) => candidate.id === "act_restart_a")).toBe(false);
    } finally {
      await restartedApp.close();
      restartedStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("restores durable pre-import asset bytes after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-archive-asset-operation-"));
    const statePath = join(directory, "state.json");
    const uploadDir = join(directory, "uploads");
    const firstStore = new FileStateStore(statePath);
    const storage = new LocalAssetStorage(uploadDir);
    const at = "2026-07-15T12:00:00.000Z";
    const oldBytes = Buffer.from("old-map-bytes");
    const newBytes = Buffer.from("new-map-bytes");
    const checksum = (body: Buffer) => `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const asset: MapAsset = {
      id: "asset_archive_restart",
      campaignId: "camp_demo",
      name: "Restart map",
      url: "/api/v1/assets/asset_archive_restart/blob",
      mimeType: "image/png",
      sizeBytes: oldBytes.length,
      checksum: checksum(oldBytes),
      createdAt: at,
      updatedAt: at,
    };
    asset.storage = await storage.put(asset, oldBytes);
    firstStore.state.assets.push(asset);
    firstStore.save();
    firstStore.flush();
    const firstApp = await buildApp({ store: firstStore, assetStorage: storage, uploadDir });
    let operationId = "";
    try {
      const archive = makeArchive(firstStore.state, "camp_demo");
      archive.data.assets = archive.data.assets.map((candidate) => candidate.id === asset.id ? { ...candidate, sizeBytes: newBytes.length, checksum: checksum(newBytes), updatedAt: "2026-07-15T12:01:00.000Z" } : candidate);
      archive.files = [{ assetId: asset.id, name: asset.name, mimeType: asset.mimeType, sizeBytes: newBytes.length, checksum: checksum(newBytes), encoding: "base64", data: newBytes.toString("base64") }];
      archive.manifest.assetFileCount = 1;
      const imported = await importArchive(firstApp, firstStore, archive, "archive-asset-operation-import");
      expect(imported.statusCode).toBe(200);
      operationId = imported.json().operation.id;
      expect(await storage.read(firstStore.state.assets.find((candidate) => candidate.id === asset.id)!)).toEqual(newBytes);
    } finally {
      await firstApp.close();
      firstStore.close();
    }

    const restartedStore = new FileStateStore(statePath);
    const restartedStorage = new LocalAssetStorage(uploadDir);
    const restartedApp = await buildApp({ store: restartedStore, assetStorage: restartedStorage, uploadDir });
    try {
      const campaign = restartedStore.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const rollback = await restartedApp.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationId}/rollback`,
        headers: { ...gmHeaders, "idempotency-key": "archive-asset-operation-rollback" },
        payload: { expectedUpdatedAt: campaign.updatedAt, confirmOperationId: operationId },
      });
      expect(rollback.statusCode).toBe(200);
      expect(rollback.json()).toMatchObject({ operation: { status: "rolled_back" }, conflicts: [], rolledBackAssetFiles: 1 });
      expect(await restartedStorage.read(restartedStore.state.assets.find((candidate) => candidate.id === asset.id)!)).toEqual(oldBytes);
    } finally {
      await restartedApp.close();
      restartedStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("replays the exact committed rollback response after a process restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-archive-operation-replay-"));
    const statePath = join(directory, "state.json");
    const uploadDir = join(directory, "uploads");
    let rollbackRequest: {
      method: "POST";
      url: string;
      headers: Record<string, string>;
      payload: { expectedUpdatedAt: string; confirmOperationId: string };
    } | undefined;
    let committedBody = "";

    try {
      const firstStore = new FileStateStore(statePath);
      const firstApp = await buildApp({ store: firstStore, uploadDir });
      try {
        const imported = await importArchive(firstApp, firstStore, changedArchive(firstStore, "Replay import", "act_replay_import"), "archive-operation-replay-import");
        expect(imported.statusCode).toBe(200);
        const operationId = imported.json().operation.id as string;
        const campaign = firstStore.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
        rollbackRequest = {
          method: "POST",
          url: `/api/v1/campaigns/camp_demo/archive-import-operations/${operationId}/rollback`,
          headers: { ...gmHeaders, "idempotency-key": "archive-operation-replay-rollback" },
          payload: { expectedUpdatedAt: campaign.updatedAt, confirmOperationId: operationId },
        };
        const committed = await firstApp.inject(rollbackRequest);
        expect(committed.statusCode).toBe(200);
        committedBody = committed.body;
      } finally {
        await firstApp.close();
        firstStore.close();
      }

      const restartedStore = new FileStateStore(statePath);
      const restartedApp = await buildApp({ store: restartedStore, uploadDir });
      try {
        const replay = await restartedApp.inject(rollbackRequest!);
        expect(replay.statusCode).toBe(200);
        expect(replay.headers["idempotency-replayed"]).toBe("true");
        expect(replay.body).toBe(committedBody);
      } finally {
        await restartedApp.close();
        restartedStore.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
