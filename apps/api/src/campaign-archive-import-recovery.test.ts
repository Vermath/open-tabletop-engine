import { createHash } from "node:crypto";
import { emptyState, makeArchive, seedState, type AssetStorageRef, type CampaignArchive, type EngineState, type MapAsset } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import type { AssetStorage } from "./asset-storage.js";
import { validateCampaignArchiveShape } from "./archive-validation.js";
import {
  createCampaignArchiveImportOperation,
  prepareCampaignArchiveImportAssetSteps,
  previewCampaignArchiveImportRollback,
  rollbackCampaignArchiveImportOperation,
} from "./campaign-archive-import-recovery.js";
import { MemoryStateStore } from "./store.js";

class FakeAssetStorage implements AssetStorage {
  readonly provider = "local" as const;
  readonly bodies = new Map<string, Buffer>();

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const storage = asset.storage ?? { provider: "local" as const, key: asset.id };
    this.bodies.set(storage.key, Buffer.from(body));
    return storage;
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    const body = this.bodies.get(asset.storage?.key ?? asset.id);
    return body ? Buffer.from(body) : undefined;
  }

  async delete(asset: MapAsset): Promise<boolean> {
    return this.bodies.delete(asset.storage?.key ?? asset.id);
  }
}

class OneShotReplaceFailureStore extends MemoryStateStore {
  private shouldFail = true;

  override replace(state: EngineState, options: { flush?: boolean } = {}): void {
    if (this.shouldFail) {
      this.shouldFail = false;
      this.state = state;
      throw new Error("simulated persistence failure");
    }
    super.replace(state, options);
  }
}

function archiveWithActors(...actors: ReturnType<typeof seedState>["actors"]): CampaignArchive {
  const state = emptyState();
  state.actors = structuredClone(actors);
  return {
    format: "ottx",
    version: "0.2.0",
    exportedAt: "2026-07-15T12:00:00.000Z",
    manifest: { campaignId: "camp_demo", name: "Demo", schemaVersion: "0.2.0", assetCount: 0 },
    data: state,
  };
}

describe("campaign archive import recovery", () => {
  it("rejects operational recovery rows carried in an OTTX payload", () => {
    const archive = makeArchive(seedState(), "camp_demo");
    archive.data.campaignArchiveImportOperations.push({
      id: "arcimp_forged",
      campaignIds: ["camp_demo"],
      createdByUserId: "usr_demo_gm",
      status: "applied",
      mode: "upsert",
      scope: "all",
      collections: [],
      campaignRevisions: {},
      recordSteps: [],
      assetSteps: [],
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
    });
    expect(validateCampaignArchiveShape(archive, { maxAssetBytes: 1024 })).toEqual({ ok: false, error: "Campaign archive operational recovery data is not portable" });
  });

  it("rolls back A after non-overlapping B while preserving B", async () => {
    const before = seedState();
    const original = before.actors.find((actor) => actor.id === "act_valen")!;
    const imported = { ...original, name: "Imported A", updatedAt: "2026-07-15T12:01:00.000Z" };
    const addedA = { ...original, id: "act_import_a", name: "Added A", updatedAt: "2026-07-15T12:01:00.000Z" };
    const afterA = structuredClone(before);
    afterA.actors = afterA.actors.filter((actor) => actor.id !== original.id).concat(imported, addedA);
    const operation = createCampaignArchiveImportOperation({
      id: "arcimp_a",
      stateBefore: before,
      stateAfter: afterA,
      archive: archiveWithActors(imported, addedA),
      campaignIds: ["camp_demo"],
      createdByUserId: "usr_demo_gm",
      mode: "upsert",
      scope: "all",
      collections: ["actors"],
      assetSteps: [],
    });
    const afterB = structuredClone(afterA);
    afterB.actors.push({ ...original, id: "act_import_b", name: "Added B", updatedAt: "2026-07-15T12:02:00.000Z" });
    afterB.campaignArchiveImportOperations.push(operation);
    const store = new MemoryStateStore(afterB);

    const result = await rollbackCampaignArchiveImportOperation({ store, assetStorage: new FakeAssetStorage(), operationId: operation.id, campaignId: "camp_demo", userId: "usr_demo_gm" });

    expect(result.conflicts).toEqual([]);
    expect(store.state.actors.find((actor) => actor.id === original.id)?.name).toBe(original.name);
    expect(store.state.actors.some((actor) => actor.id === addedA.id)).toBe(false);
    expect(store.state.actors.some((actor) => actor.id === "act_import_b")).toBe(true);
    expect(result.operation.status).toBe("rolled_back");
  });

  it("preserves exact overlapping rows and reports them while reverting safe rows", async () => {
    const before = seedState();
    const original = before.actors.find((actor) => actor.id === "act_valen")!;
    const imported = { ...original, name: "Imported A", updatedAt: "2026-07-15T12:01:00.000Z" };
    const addedA = { ...original, id: "act_import_a", name: "Added A", updatedAt: "2026-07-15T12:01:00.000Z" };
    const afterA = structuredClone(before);
    afterA.actors = afterA.actors.filter((actor) => actor.id !== original.id).concat(imported, addedA);
    const operation = createCampaignArchiveImportOperation({ id: "arcimp_overlap", stateBefore: before, stateAfter: afterA, archive: archiveWithActors(imported, addedA), campaignIds: ["camp_demo"], createdByUserId: "usr_demo_gm", mode: "upsert", scope: "all", collections: ["actors"], assetSteps: [] });
    const afterB = structuredClone(afterA);
    afterB.actors = afterB.actors.map((actor) => actor.id === original.id ? { ...actor, name: "Changed by B", updatedAt: "2026-07-15T12:02:00.000Z" } : actor);
    afterB.campaignArchiveImportOperations.push(operation);
    const store = new MemoryStateStore(afterB);

    const result = await rollbackCampaignArchiveImportOperation({ store, assetStorage: new FakeAssetStorage(), operationId: operation.id, campaignId: "camp_demo", userId: "usr_demo_gm" });

    expect(result.conflicts).toContainEqual({ collection: "actors", id: original.id, reason: "record_changed" });
    expect(store.state.actors.find((actor) => actor.id === original.id)?.name).toBe("Changed by B");
    expect(store.state.actors.some((actor) => actor.id === addedA.id)).toBe(false);
    expect(result.operation.status).toBe("partially_rolled_back");
  });

  it("keeps a newly referenced imported row and reports a reference conflict", async () => {
    const before = seedState();
    const base = before.actors[0]!;
    const added = { ...base, id: "act_import_referenced", name: "Referenced", updatedAt: "2026-07-15T12:01:00.000Z" };
    const after = structuredClone(before);
    after.actors.push(added);
    const operation = createCampaignArchiveImportOperation({ id: "arcimp_reference", stateBefore: before, stateAfter: after, archive: archiveWithActors(added), campaignIds: ["camp_demo"], createdByUserId: "usr_demo_gm", mode: "upsert", scope: "all", collections: ["actors"], assetSteps: [] });
    after.items.push({ id: "itm_b", campaignId: "camp_demo", systemId: added.systemId, actorId: added.id, type: "loot", name: "B reference", data: {}, createdAt: "2026-07-15T12:02:00.000Z", updatedAt: "2026-07-15T12:02:00.000Z" });
    after.campaignArchiveImportOperations.push(operation);
    const store = new MemoryStateStore(after);

    const preview = await previewCampaignArchiveImportRollback(store.state, new FakeAssetStorage(), operation);
    expect(preview.conflicts).toContainEqual({ collection: "actors", id: added.id, reason: "reference_conflict" });
  });

  it("persists exact pre-import bytes through the inverse reference", async () => {
    const storage = new FakeAssetStorage();
    const before = seedState();
    const at = "2026-07-15T12:00:00.000Z";
    const asset: MapAsset = { id: "asset_map", campaignId: "camp_demo", name: "Map", url: "/api/v1/assets/asset_map/blob", mimeType: "image/png", sizeBytes: 3, checksum: "sha256:old", createdAt: at, updatedAt: at };
    before.assets.push(asset);
    storage.bodies.set(asset.id, Buffer.from("old"));
    const incoming = { ...asset, sizeBytes: 3, checksum: "sha256:11507a0e2f5e69d5dfa40a62a1bd7b6ee57e6bcd85c67c9b8431b36fff21c437", updatedAt: "2026-07-15T12:01:00.000Z" };
    const archive = {
      ...archiveWithActors(),
      data: { ...emptyState(), assets: [incoming] },
      files: [{ assetId: asset.id, name: asset.name, mimeType: asset.mimeType, sizeBytes: 3, checksum: incoming.checksum!, encoding: "base64" as const, data: Buffer.from("new").toString("base64") }],
    };
    const steps = await prepareCampaignArchiveImportAssetSteps(storage, before, archive, "arcimp_asset");
    expect(steps[0]?.inverseAsset && await storage.read(steps[0].inverseAsset)).toEqual(Buffer.from("old"));
  });

  it("compensates state and object writes when persistence fails", async () => {
    const storage = new FakeAssetStorage();
    const before = seedState();
    const body = Buffer.from("new-imported-object");
    const at = "2026-07-15T12:00:00.000Z";
    const asset: MapAsset = {
      id: "asset_atomic_import",
      campaignId: "camp_demo",
      name: "Atomic import",
      url: "/api/v1/assets/asset_atomic_import/blob",
      mimeType: "image/png",
      sizeBytes: body.length,
      checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
      createdAt: at,
      updatedAt: at,
    };
    const after = structuredClone(before);
    after.assets.push(asset);
    const archive = { ...archiveWithActors(), data: { ...emptyState(), assets: [asset] } };
    const operation = createCampaignArchiveImportOperation({
      id: "arcimp_atomic_failure",
      stateBefore: before,
      stateAfter: after,
      archive,
      campaignIds: ["camp_demo"],
      createdByUserId: "usr_demo_gm",
      mode: "upsert",
      scope: "all",
      collections: ["assets"],
      assetSteps: [{ assetId: asset.id, action: "delete", targetAsset: asset, expectedChecksum: asset.checksum }],
    });
    after.campaignArchiveImportOperations.push(operation);
    storage.bodies.set(asset.id, body);
    const store = new OneShotReplaceFailureStore(after);
    const originalRevision = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt;

    await expect(rollbackCampaignArchiveImportOperation({
      store,
      assetStorage: storage,
      operationId: operation.id,
      campaignId: "camp_demo",
      userId: "usr_demo_gm",
    })).rejects.toThrow("simulated persistence failure");

    expect(store.state.campaigns.find((campaign) => campaign.id === "camp_demo")?.updatedAt).toBe(originalRevision);
    expect(store.state.assets.some((candidate) => candidate.id === asset.id)).toBe(true);
    expect(store.state.campaignArchiveImportOperations.find((candidate) => candidate.id === operation.id)?.status).toBe("applied");
    expect(await storage.read(asset)).toEqual(body);
  });
});
