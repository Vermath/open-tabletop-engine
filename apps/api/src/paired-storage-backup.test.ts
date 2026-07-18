import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AssetStorageRef, MapAsset } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { createStorageBackupScheduler } from "./asset-operations.js";
import { assetStorageKey, LocalAssetStorage, type AssetStorage } from "./asset-storage.js";
import {
  assertManagedAssetSnapshotPublishable,
  createManagedAssetSnapshot,
  managedAssetSnapshotLimits,
  restoreManagedAssetSnapshot,
  verifyManagedAssetSnapshot,
} from "./paired-storage-backup.js";
import { SqliteStateStore, type AssetSnapshotIdentity } from "./sqlite-store.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("paired storage backup", () => {
  it("schedules a checksum-proven SQLite and asset pair and restores it into isolated volumes", async () => {
    const root = temporaryRoot();
    const databasePath = join(root, "source", "opentabletop.sqlite");
    const sourceUploads = join(root, "source", "uploads");
    const sourceStore = new SqliteStateStore(databasePath, { seedDemo: true });
    const sourceStorage = new LocalAssetStorage(sourceUploads);
    const body = Buffer.from("paired-map-bytes");
    const campaign = sourceStore.state.campaigns[0]!;
    const asset = mapAsset(body, campaign.id);
    asset.storage = await sourceStorage.put(asset, body);
    sourceStore.state.assets.push(asset);
    sourceStore.save();
    sourceStore.flush();

    const scheduler = createStorageBackupScheduler(
      sourceStore,
      sourceStorage,
      { runExclusive: async (operation) => await operation() },
    );
    await scheduler.runNow("startup");

    const status = scheduler.status();
    expect(status.lastRun).toMatchObject({
      status: "succeeded",
      trigger: "startup",
      paired: true,
      assetObjectCount: 1,
      assetSizeBytes: body.byteLength,
      restoreDrillStatus: "passed",
    });
    const backupFileName = status.lastRun!.fileName!;
    const backupDirectory = sourceStore.backupArtifactDirectory();
    const recoveryEnvelope = JSON.parse(readFileSync(join(backupDirectory, `${backupFileName}.recovery.json`), "utf8")) as {
      recoveryPoint: { assetSnapshot: AssetSnapshotIdentity };
    };
    const identity = recoveryEnvelope.recoveryPoint.assetSnapshot;
    expect(identity.snapshotId).toBe(status.lastRun!.assetSnapshotId);
    expect(verifyManagedAssetSnapshot(backupDirectory, identity)).toMatchObject({
      storedObjectCount: 1,
      sizeBytes: body.byteLength,
    });

    // An isolated restore starts from only the selected SQLite backup and an
    // empty asset volume, then opens with the current schema (the upgrade step).
    const isolatedDatabase = join(root, "isolated", "opentabletop.sqlite");
    mkdirSync(join(root, "isolated"), { recursive: true });
    copyFileSync(join(backupDirectory, backupFileName), isolatedDatabase);
    const isolatedStore = new SqliteStateStore(isolatedDatabase, { seedDemo: false });
    const isolatedStorage = new LocalAssetStorage(join(root, "isolated", "uploads"));
    await restoreManagedAssetSnapshot(backupDirectory, identity, isolatedStore.state.assets, isolatedStorage);
    expect(isolatedStore.state.campaigns.some((item) => item.id === campaign.id)).toBe(true);
    expect(isolatedStore.state.scenes.some((item) => item.campaignId === campaign.id)).toBe(true);
    expect(isolatedStore.state.members.some((item) => item.campaignId === campaign.id)).toBe(true);
    expect(await isolatedStorage.read(isolatedStore.state.assets.find((item) => item.id === asset.id)!)).toEqual(body);
    expect(isolatedStore.storageOperations()).toMatchObject({
      integrity: { ok: true },
      migrations: { missingVersions: [] },
    });
    isolatedStore.close();

    const reopened = new SqliteStateStore(isolatedDatabase, { seedDemo: false });
    expect(reopened.state.assets.some((item) => item.id === asset.id)).toBe(true);
    expect(await isolatedStorage.read(reopened.state.assets.find((item) => item.id === asset.id)!)).toEqual(body);
    reopened.close();
    sourceStore.close();
  });

  it("fails verification when a captured asset object changes", async () => {
    const root = temporaryRoot();
    const store = new SqliteStateStore(join(root, "opentabletop.sqlite"), { seedDemo: false });
    const storage = new LocalAssetStorage(join(root, "uploads"));
    const body = Buffer.from("checksum-source");
    const asset = mapAsset(body);
    asset.storage = await storage.put(asset, body);
    store.state.assets.push(asset);
    store.save();
    store.flush();
    const scheduler = createStorageBackupScheduler(store, storage, { runExclusive: async (operation) => await operation() });
    await scheduler.runNow();
    const lastRun = scheduler.status().lastRun!;
    const envelope = JSON.parse(readFileSync(join(store.backupArtifactDirectory(), `${lastRun.fileName}.recovery.json`), "utf8")) as {
      recoveryPoint: { assetSnapshot: AssetSnapshotIdentity };
    };
    const verified = verifyManagedAssetSnapshot(store.backupArtifactDirectory(), envelope.recoveryPoint.assetSnapshot);
    writeFileSync(join(verified.directory, "objects", "00000000.bin"), "tampered");
    expect(() => verifyManagedAssetSnapshot(store.backupArtifactDirectory(), envelope.recoveryPoint.assetSnapshot)).toThrow(/checksum is invalid/);
    store.close();
  });

  it("creates and drills a checksum-bound local recovery pair with an empty asset inventory", async () => {
    const root = temporaryRoot();
    const store = new SqliteStateStore(join(root, "opentabletop.sqlite"), { seedDemo: false });
    const storage = new LocalAssetStorage(join(root, "uploads"));
    const snapshot = await createManagedAssetSnapshot([], storage, store.backupArtifactDirectory());
    const verified = verifyManagedAssetSnapshot(store.backupArtifactDirectory(), snapshot.identity);

    expect(verified.manifest).toMatchObject({
      provider: "local",
      assetCount: 0,
      objectCount: 0,
      storedObjectCount: 0,
      assetInventory: {
        provider: "local",
        assetCount: 0,
        objectCount: 0,
        sizeBytes: 0,
        digestAlgorithm: "sha256",
        digest: createHash("sha256").update("[]").digest("hex"),
      },
      entries: [],
    });

    const backup = store.createBackup({ assetProvider: "local", requireAssetSnapshot: true, assetSnapshot: snapshot.identity });
    expect(store.runRestoreDrill({
      backupFileName: backup.fileName,
      requireAssetSnapshot: true,
      expectedAssetSnapshot: snapshot.identity,
      expectedAssetInventory: verified.manifest.assetInventory,
    })).toMatchObject({ status: "passed", actionRequired: false, actionReasons: [] });
    store.close();
  });

  it("backs up mixed-provider renditions and restores an exact object inventory", async () => {
    const root = temporaryRoot();
    const sourceS3 = new MemoryAssetStorage("s3", "paired-assets");
    const sourceLocal = new MemoryAssetStorage("local");
    const primary = Buffer.from("primary-on-s3");
    const thumbnail = Buffer.from("thumbnail-on-local");
    const asset = mapAsset(primary);
    asset.storage = await sourceS3.put(asset, primary);
    const renditionAsset = renditionView(asset, "thumbnail", thumbnail);
    const renditionStorage = await sourceLocal.put(renditionAsset, thumbnail);
    renditionAsset.storage = renditionStorage;
    asset.renditions = [{
      kind: "thumbnail",
      mimeType: "image/webp",
      sizeBytes: thumbnail.byteLength,
      checksum: checksum(thumbnail),
      width: 64,
      height: 64,
      storage: renditionStorage,
      createdAt: "2026-07-17T00:00:00.000Z",
    }];

    const snapshot = await createManagedAssetSnapshot([asset], sourceS3, root, {
      storageByProvider: { local: sourceLocal },
    });
    expect(verifyManagedAssetSnapshot(root, snapshot.identity)).toMatchObject({ storedObjectCount: 2 });

    const targetS3 = new MemoryAssetStorage("s3", "paired-assets");
    const targetLocal = new MemoryAssetStorage("local");
    const extra = mapAsset(Buffer.from("extra"));
    extra.id = "asset-extra";
    extra.storage = await targetS3.put(extra, Buffer.from("extra"));
    await restoreManagedAssetSnapshot(root, snapshot.identity, [asset], targetS3, {
      storageByProvider: { local: targetLocal },
      removeAssets: [extra],
    });

    expect(await targetS3.read(asset)).toEqual(primary);
    expect(await targetLocal.read(renditionAsset)).toEqual(thumbnail);
    expect(await targetS3.read(extra)).toBeUndefined();
  });

  it("rejects a snapshot whose inventory no longer matches restored SQLite metadata before writing bytes", async () => {
    const root = temporaryRoot();
    const source = new MemoryAssetStorage("local");
    const body = Buffer.from("inventory-bound");
    const asset = mapAsset(body);
    asset.storage = await source.put(asset, body);
    const snapshot = await createManagedAssetSnapshot([asset], source, root);
    const staleAsset = structuredClone(asset);
    staleAsset.url = "/api/v1/assets/different/blob";
    const target = new MemoryAssetStorage("local");

    await expect(restoreManagedAssetSnapshot(root, snapshot.identity, [staleAsset], target)).rejects.toThrow(/inventory does not match/i);
    expect(target.objects.size).toBe(0);
  });

  it("enforces creation limits before publishing a snapshot manifest", () => {
    expect(() => assertManagedAssetSnapshotPublishable(managedAssetSnapshotLimits.maxManifestEntries + 1)).toThrow(/entry limit/);
    expect(() => assertManagedAssetSnapshotPublishable(0, managedAssetSnapshotLimits.maxManifestBytes + 1)).toThrow(/byte limit/);
  });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "otte-paired-backup-"));
  temporaryRoots.push(root);
  return root;
}

function mapAsset(body: Buffer, campaignId = "campaign-paired"): MapAsset {
  const timestamp = "2026-07-17T00:00:00.000Z";
  return {
    id: "asset-paired-map",
    campaignId,
    name: "Paired map.png",
    url: "/api/v1/assets/asset-paired-map/blob",
    mimeType: "image/png",
    sizeBytes: body.byteLength,
    checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    lifecycle: { status: "active" },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function renditionView(asset: MapAsset, kind: "thumbnail" | "optimized", body: Buffer): MapAsset {
  return {
    ...asset,
    id: `${asset.id}_${kind}`,
    name: `${asset.name} (${kind})`,
    mimeType: "image/webp",
    sizeBytes: body.byteLength,
    checksum: checksum(body),
    storage: undefined,
    renditions: undefined,
  };
}

function checksum(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

class MemoryAssetStorage implements AssetStorage {
  readonly objects = new Map<string, Buffer>();

  constructor(readonly provider: AssetStorageRef["provider"], private readonly bucket?: string) {}

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const ref = asset.storage?.provider === this.provider
      ? asset.storage
      : { provider: this.provider, key: assetStorageKey(asset), ...(this.provider === "s3" && this.bucket ? { bucket: this.bucket } : {}) };
    if (ref.provider === "s3" && ref.bucket !== this.bucket) throw new Error("bucket mismatch");
    this.objects.set(ref.key, Buffer.from(body));
    return { ...ref };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    if (asset.storage?.provider !== this.provider) return undefined;
    if (this.provider === "s3" && asset.storage.bucket !== this.bucket) return undefined;
    const body = this.objects.get(asset.storage.key);
    return body ? Buffer.from(body) : undefined;
  }

  async delete(asset: MapAsset): Promise<boolean> {
    if (asset.storage?.provider !== this.provider) return false;
    return this.objects.delete(asset.storage.key);
  }
}
