import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import type { AssetStorageRef, MapAsset } from "@open-tabletop/core";
import {
  assetStorageKey,
  createAssetStorageForProvider,
  type AssetStorage,
} from "./asset-storage.js";
import {
  assetMetadataInventoryForAssets,
  type AssetSnapshotIdentity,
  type SqliteAssetMetadataInventory,
} from "./sqlite-store.js";

const snapshotKind = "open-tabletop-managed-asset-snapshot" as const;
const snapshotVersion = 1 as const;
const snapshotIdPattern = /^sha256:([a-f0-9]{64})$/;
const maxManifestBytes = 16 * 1024 * 1024;
const maxManifestEntries = 200_000;
export const managedAssetSnapshotLimits = { maxManifestBytes, maxManifestEntries } as const;

export interface ManagedAssetSnapshotEntry {
  assetId: string;
  campaignId: string;
  object: "primary" | `rendition:${string}`;
  present: boolean;
  storage: AssetStorageRef;
  mimeType: string;
  recordedSizeBytes: number;
  recordedChecksum?: string;
  relativePath?: string;
  sizeBytes?: number;
  checksum?: string;
}

export interface ManagedAssetSnapshotManifest {
  kind: typeof snapshotKind;
  version: typeof snapshotVersion;
  createdAt: string;
  provider: AssetStorage["provider"];
  assetCount: number;
  objectCount: number;
  storedObjectCount: number;
  sizeBytes: number;
  assetInventory: SqliteAssetMetadataInventory;
  entriesChecksumAlgorithm: "sha256";
  entriesChecksum: string;
  entries: ManagedAssetSnapshotEntry[];
}

export interface ManagedAssetSnapshotStorageOptions {
  /** Required when a retained object still belongs to a non-active provider. */
  uploadDir?: string;
  /** Provider adapters supplied by tests or a host with multiple configured backends. */
  storageByProvider?: Partial<Record<AssetStorage["provider"], AssetStorage>>;
  /** Known destination objects that must not survive unless present in the snapshot. */
  removeAssets?: readonly MapAsset[];
}

interface ManagedAssetSnapshotEnvelope {
  schemaVersion: 1;
  checksumAlgorithm: "sha256";
  manifestChecksum: string;
  snapshot: ManagedAssetSnapshotManifest;
}

export interface ManagedAssetSnapshotResult {
  identity: AssetSnapshotIdentity;
  directory: string;
  manifestFileName: "manifest.json";
  assetCount: number;
  objectCount: number;
  storedObjectCount: number;
  sizeBytes: number;
}

export interface ManagedAssetSnapshotVerification extends ManagedAssetSnapshotResult {
  manifest: ManagedAssetSnapshotManifest;
}

interface SnapshotObject {
  asset: MapAsset;
  object: ManagedAssetSnapshotEntry["object"];
  storage: AssetStorageRef;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  expectedPresent: boolean;
}

/**
 * Copies every recoverable asset object into the SQLite backup volume and
 * returns a content-addressed identity that can be bound into the database
 * recovery sidecar. Objects are read sequentially to keep memory bounded.
 */
export async function createManagedAssetSnapshot(
  assets: readonly MapAsset[],
  storage: AssetStorage,
  backupArtifactDirectory: string,
  options: ManagedAssetSnapshotStorageOptions = {},
): Promise<ManagedAssetSnapshotResult> {
  const createdAt = new Date().toISOString();
  const snapshotRoot = managedAssetSnapshotRoot(backupArtifactDirectory);
  mkdirSync(snapshotRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(snapshotRoot, ".creating-"));
  const objectsDirectory = join(temporaryDirectory, "objects");
  mkdirSync(objectsDirectory, { recursive: true });

  try {
    const objects = snapshotObjects(assets, storage.provider);
    assertManagedAssetSnapshotPublishable(objects.length);
    const storages = new Map<AssetStorage["provider"], AssetStorage>([[storage.provider, storage]]);
    const entries: ManagedAssetSnapshotEntry[] = [];
    let storedObjectCount = 0;
    let sizeBytes = 0;
    for (const item of objects) {
      const base: ManagedAssetSnapshotEntry = {
        assetId: item.asset.id,
        campaignId: item.asset.campaignId,
        object: item.object,
        present: item.expectedPresent,
        // Keep storage-ref property order canonical because the content-addressed
        // manifest is verified after strict parsing reconstructs this shape.
        storage: { provider: item.storage.provider, key: item.storage.key, ...(item.storage.bucket ? { bucket: item.storage.bucket } : {}) },
        mimeType: item.mimeType,
        recordedSizeBytes: item.sizeBytes,
        ...(item.checksum ? { recordedChecksum: item.checksum } : {}),
      };
      if (!item.expectedPresent) {
        entries.push(base);
        continue;
      }
      const sourceStorage = storageForRef(item.storage, storage, options, storages);
      const body = await sourceStorage.read(assetView(item));
      if (!body) throw new Error(`Asset snapshot source object is missing: ${item.asset.id}/${item.object}`);
      const checksum = checksumBuffer(body);
      if (body.byteLength !== item.sizeBytes) {
        throw new Error(`Asset snapshot source size does not match metadata: ${item.asset.id}/${item.object}`);
      }
      if (item.checksum && snapshotIdPattern.test(item.checksum) && item.checksum !== checksum) {
        throw new Error(`Asset snapshot source checksum does not match metadata: ${item.asset.id}/${item.object}`);
      }
      const relativePath = `objects/${String(entries.length).padStart(8, "0")}.bin`;
      writeFileSync(join(temporaryDirectory, ...relativePath.split("/")), body, { flag: "wx", mode: 0o600 });
      entries.push({ ...base, relativePath, sizeBytes: body.byteLength, checksum });
      storedObjectCount += 1;
      sizeBytes += body.byteLength;
    }

    const entriesChecksum = checksumText(JSON.stringify(entries));
    const snapshot: ManagedAssetSnapshotManifest = {
      kind: snapshotKind,
      version: snapshotVersion,
      createdAt,
      provider: storage.provider,
      assetCount: assets.length,
      objectCount: entries.length,
      storedObjectCount,
      sizeBytes,
      assetInventory: assetMetadataInventoryForAssets(assets, storage.provider),
      entriesChecksumAlgorithm: "sha256",
      entriesChecksum,
      entries,
    };
    const manifestChecksum = checksumText(JSON.stringify(snapshot));
    const identity: AssetSnapshotIdentity = {
      provider: storage.provider,
      snapshotId: manifestChecksum,
      createdAt,
    };
    const envelope: ManagedAssetSnapshotEnvelope = {
      schemaVersion: 1,
      checksumAlgorithm: "sha256",
      manifestChecksum,
      snapshot,
    };
    const serializedEnvelope = `${JSON.stringify(envelope, null, 2)}\n`;
    assertManagedAssetSnapshotPublishable(objects.length, Buffer.byteLength(serializedEnvelope, "utf8"));
    writeFileSync(join(temporaryDirectory, "manifest.json"), serializedEnvelope, { flag: "wx", mode: 0o600 });
    const directory = managedAssetSnapshotDirectory(backupArtifactDirectory, identity.snapshotId);
    if (existsSync(directory)) throw new Error(`Managed asset snapshot already exists: ${identity.snapshotId}`);
    renameSync(temporaryDirectory, directory);
    return snapshotResult(identity, directory, snapshot);
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function assertManagedAssetSnapshotPublishable(entryCount: number, manifestBytes = 0): void {
  if (entryCount > maxManifestEntries) throw new Error(`Managed asset snapshot exceeds the ${maxManifestEntries} entry limit`);
  if (manifestBytes > maxManifestBytes) throw new Error(`Managed asset snapshot manifest exceeds the ${maxManifestBytes} byte limit`);
}

/** Validates the manifest checksum plus every captured object's size and SHA-256. */
export function verifyManagedAssetSnapshot(
  backupArtifactDirectory: string,
  identity: AssetSnapshotIdentity,
): ManagedAssetSnapshotVerification {
  if (!snapshotIdPattern.test(identity.snapshotId)) throw new Error("Managed asset snapshot ID is invalid");
  const directory = managedAssetSnapshotDirectory(backupArtifactDirectory, identity.snapshotId);
  const manifestPath = join(directory, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("Managed asset snapshot manifest is missing");
  if (statSync(manifestPath).size > maxManifestBytes) throw new Error("Managed asset snapshot manifest exceeds the size limit");
  const envelope = parseEnvelope(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
  if (!envelope) throw new Error("Managed asset snapshot manifest is invalid");
  if (envelope.manifestChecksum !== identity.snapshotId || checksumText(JSON.stringify(envelope.snapshot)) !== envelope.manifestChecksum) {
    throw new Error("Managed asset snapshot manifest checksum does not match its identity");
  }
  if (envelope.snapshot.provider !== identity.provider || envelope.snapshot.createdAt !== identity.createdAt) {
    throw new Error("Managed asset snapshot identity does not match its manifest");
  }
  if (checksumText(JSON.stringify(envelope.snapshot.entries)) !== envelope.snapshot.entriesChecksum) {
    throw new Error("Managed asset snapshot entry checksum is invalid");
  }

  let storedObjectCount = 0;
  let sizeBytes = 0;
  for (const entry of envelope.snapshot.entries) {
    if (!entry.present) continue;
    const objectPath = safeSnapshotObjectPath(directory, entry.relativePath!);
    if (!existsSync(objectPath)) throw new Error(`Managed asset snapshot object is missing: ${entry.assetId}/${entry.object}`);
    const body = readFileSync(objectPath);
    if (body.byteLength !== entry.sizeBytes || checksumBuffer(body) !== entry.checksum) {
      throw new Error(`Managed asset snapshot object checksum is invalid: ${entry.assetId}/${entry.object}`);
    }
    storedObjectCount += 1;
    sizeBytes += body.byteLength;
  }
  if (storedObjectCount !== envelope.snapshot.storedObjectCount || sizeBytes !== envelope.snapshot.sizeBytes) {
    throw new Error("Managed asset snapshot totals do not match captured objects");
  }
  return { ...snapshotResult(identity, directory, envelope.snapshot), manifest: envelope.snapshot };
}

/** Restores a verified snapshot into an empty/isolated provider and reads every object back. */
export async function restoreManagedAssetSnapshot(
  backupArtifactDirectory: string,
  identity: AssetSnapshotIdentity,
  assets: readonly MapAsset[],
  storage: AssetStorage,
  options: ManagedAssetSnapshotStorageOptions = {},
): Promise<ManagedAssetSnapshotResult> {
  if (storage.provider !== identity.provider) throw new Error("Managed asset snapshot provider does not match the restore target");
  const verified = verifyManagedAssetSnapshot(backupArtifactDirectory, identity);
  const restoredInventory = assetMetadataInventoryForAssets(assets, identity.provider);
  if (!sameAssetInventory(restoredInventory, verified.manifest.assetInventory)) {
    throw new Error("Managed asset snapshot inventory does not match the restored SQLite asset inventory");
  }
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const storages = new Map<AssetStorage["provider"], AssetStorage>([[storage.provider, storage]]);
  for (const entry of verified.manifest.entries) {
    if (!entry.present) continue;
    const asset = assetsById.get(entry.assetId);
    if (!asset || asset.campaignId !== entry.campaignId) throw new Error(`Managed asset snapshot record is missing: ${entry.assetId}`);
    const view = entryAssetView(asset, entry);
    const body = readFileSync(safeSnapshotObjectPath(verified.directory, entry.relativePath!));
    const targetStorage = storageForRef(entry.storage, storage, options, storages);
    const restoredRef = await targetStorage.put(view, body, { operationId: `restore-${identity.snapshotId.slice(-16)}` });
    if (!sameStorageRef(restoredRef, entry.storage)) throw new Error(`Managed asset snapshot target identity changed: ${entry.assetId}/${entry.object}`);
    const restoredBody = await targetStorage.read(view);
    if (!restoredBody || restoredBody.byteLength !== entry.sizeBytes || checksumBuffer(restoredBody) !== entry.checksum) {
      throw new Error(`Managed asset snapshot restore verification failed: ${entry.assetId}/${entry.object}`);
    }
  }
  await deleteObjectsOutsideSnapshot(
    options.removeAssets ?? [],
    verified.manifest.entries,
    storage,
    options,
    storages,
  );
  return snapshotResult(identity, verified.directory, verified.manifest);
}

export function removeManagedAssetSnapshot(backupArtifactDirectory: string, snapshotId: string): void {
  if (!snapshotIdPattern.test(snapshotId)) return;
  rmSync(managedAssetSnapshotDirectory(backupArtifactDirectory, snapshotId), { recursive: true, force: true });
}

/** Removes only app-managed snapshots no longer referenced by a retained SQLite recovery sidecar. */
export function pruneUnreferencedManagedAssetSnapshots(backupArtifactDirectory: string): string[] {
  const referenced = referencedSnapshotIds(backupArtifactDirectory);
  const root = managedAssetSnapshotRoot(backupArtifactDirectory);
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = /^sha256-([a-f0-9]{64})$/.exec(entry.name);
    if (!match) continue;
    const snapshotId = `sha256:${match[1]}`;
    if (referenced.has(snapshotId)) continue;
    rmSync(join(root, entry.name), { recursive: true, force: true });
    removed.push(snapshotId);
  }
  return removed.sort();
}

export function managedAssetSnapshotRoot(backupArtifactDirectory: string): string {
  return resolve(backupArtifactDirectory, "asset-snapshots");
}

function snapshotObjects(assets: readonly MapAsset[], provider: AssetStorage["provider"]): SnapshotObject[] {
  return [...assets]
    .sort((left, right) => left.campaignId.localeCompare(right.campaignId) || left.id.localeCompare(right.id))
    .flatMap((asset) => {
      const lifecyclePresent = asset.lifecycle?.status !== "deleted" && !asset.lifecycle?.storageDeletedAt;
      const primaryStorage = asset.storage ?? { provider, key: assetStorageKey(asset) };
      return [
        { asset, object: "primary" as const, storage: primaryStorage, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, checksum: asset.checksum, expectedPresent: lifecyclePresent && Boolean(asset.storage) },
        ...[...(asset.renditions ?? [])]
          .sort((left, right) => left.kind.localeCompare(right.kind))
          .map((rendition) => ({ asset, object: `rendition:${rendition.kind}` as const, storage: rendition.storage, mimeType: rendition.mimeType, sizeBytes: rendition.sizeBytes, checksum: rendition.checksum, expectedPresent: lifecyclePresent })),
      ];
    });
}

function assetView(item: SnapshotObject): MapAsset {
  return { ...item.asset, storage: { ...item.storage }, mimeType: item.mimeType, sizeBytes: item.sizeBytes, checksum: item.checksum, renditions: [] };
}

function entryAssetView(asset: MapAsset, entry: ManagedAssetSnapshotEntry): MapAsset {
  return { ...asset, storage: { ...entry.storage }, mimeType: entry.mimeType, sizeBytes: entry.recordedSizeBytes, checksum: entry.recordedChecksum, renditions: [] };
}

function storageForRef(
  ref: AssetStorageRef,
  activeStorage: AssetStorage,
  options: ManagedAssetSnapshotStorageOptions,
  storages: Map<AssetStorage["provider"], AssetStorage>,
): AssetStorage {
  const existing = storages.get(ref.provider);
  if (existing) return existing;
  const provided = options.storageByProvider?.[ref.provider];
  if (provided) {
    storages.set(ref.provider, provided);
    return provided;
  }
  if (!options.uploadDir) {
    throw new Error(`Managed asset snapshot requires uploadDir to access retained ${ref.provider} objects`);
  }
  const storage = createAssetStorageForProvider(ref.provider, { uploadDir: options.uploadDir });
  storages.set(ref.provider, storage);
  return storage;
}

async function deleteObjectsOutsideSnapshot(
  removeAssets: readonly MapAsset[],
  entries: readonly ManagedAssetSnapshotEntry[],
  activeStorage: AssetStorage,
  options: ManagedAssetSnapshotStorageOptions,
  storages: Map<AssetStorage["provider"], AssetStorage>,
): Promise<void> {
  const retained = new Set(entries.filter((entry) => entry.present).map((entry) => storageRefIdentity(entry.storage)));
  const deleted = new Set<string>();
  for (const item of snapshotObjects(removeAssets, activeStorage.provider)) {
    if (item.object === "primary" && !item.asset.storage) continue;
    const identity = storageRefIdentity(item.storage);
    if (retained.has(identity) || deleted.has(identity)) continue;
    const objectStorage = storageForRef(item.storage, activeStorage, options, storages);
    await objectStorage.delete(assetView(item));
    deleted.add(identity);
  }
}

function storageRefIdentity(ref: AssetStorageRef): string {
  return `${ref.provider}\n${ref.bucket ?? ""}\n${ref.key}`;
}

export function sameAssetInventory(
  left: SqliteAssetMetadataInventory,
  right: SqliteAssetMetadataInventory,
): boolean {
  return left.provider === right.provider &&
    left.assetCount === right.assetCount &&
    left.objectCount === right.objectCount &&
    left.sizeBytes === right.sizeBytes &&
    left.digestAlgorithm === right.digestAlgorithm &&
    left.digest === right.digest;
}

function snapshotResult(identity: AssetSnapshotIdentity, directory: string, snapshot: ManagedAssetSnapshotManifest): ManagedAssetSnapshotResult {
  return {
    identity: { ...identity },
    directory,
    manifestFileName: "manifest.json",
    assetCount: snapshot.assetCount,
    objectCount: snapshot.objectCount,
    storedObjectCount: snapshot.storedObjectCount,
    sizeBytes: snapshot.sizeBytes,
  };
}

function managedAssetSnapshotDirectory(backupArtifactDirectory: string, snapshotId: string): string {
  const match = snapshotIdPattern.exec(snapshotId);
  if (!match) throw new Error("Managed asset snapshot ID is invalid");
  return join(managedAssetSnapshotRoot(backupArtifactDirectory), `sha256-${match[1]}`);
}

function safeSnapshotObjectPath(directory: string, relativePath: string): string {
  if (!/^objects\/\d{8}\.bin$/.test(relativePath)) throw new Error("Managed asset snapshot object path is invalid");
  const path = resolve(directory, ...relativePath.split("/"));
  const root = resolve(directory);
  if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("Managed asset snapshot object path escapes its root");
  return path;
}

function parseEnvelope(value: unknown): ManagedAssetSnapshotEnvelope | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.checksumAlgorithm !== "sha256" || typeof value.manifestChecksum !== "string" || !snapshotIdPattern.test(value.manifestChecksum)) return undefined;
  const snapshot = value.snapshot;
  if (!record(snapshot) || snapshot.kind !== snapshotKind || snapshot.version !== snapshotVersion || typeof snapshot.createdAt !== "string" || (snapshot.provider !== "local" && snapshot.provider !== "s3") || !Array.isArray(snapshot.entries) || snapshot.entries.length > maxManifestEntries) return undefined;
  if (!safeCount(snapshot.assetCount) || !safeCount(snapshot.objectCount) || !safeCount(snapshot.storedObjectCount) || !safeCount(snapshot.sizeBytes) || snapshot.objectCount !== snapshot.entries.length || snapshot.entriesChecksumAlgorithm !== "sha256" || typeof snapshot.entriesChecksum !== "string" || !snapshotIdPattern.test(snapshot.entriesChecksum)) return undefined;
  const assetInventory = parseAssetInventory(snapshot.assetInventory);
  if (!assetInventory || assetInventory.provider !== snapshot.provider || assetInventory.assetCount !== snapshot.assetCount || assetInventory.objectCount !== snapshot.objectCount) return undefined;
  const entries: ManagedAssetSnapshotEntry[] = [];
  for (const candidate of snapshot.entries) {
    const parsed = parseEntry(candidate);
    if (!parsed) return undefined;
    entries.push(parsed);
  }
  return { schemaVersion: 1, checksumAlgorithm: "sha256", manifestChecksum: value.manifestChecksum, snapshot: { kind: snapshotKind, version: snapshotVersion, createdAt: snapshot.createdAt, provider: snapshot.provider, assetCount: snapshot.assetCount, objectCount: snapshot.objectCount, storedObjectCount: snapshot.storedObjectCount, sizeBytes: snapshot.sizeBytes, assetInventory, entriesChecksumAlgorithm: "sha256", entriesChecksum: snapshot.entriesChecksum, entries } };
}

function parseAssetInventory(value: unknown): SqliteAssetMetadataInventory | undefined {
  if (!record(value) || (value.provider !== "local" && value.provider !== "s3" && value.provider !== "unknown")) return undefined;
  if (!safeCount(value.assetCount) || !safeCount(value.objectCount) || !safeCount(value.sizeBytes)) return undefined;
  if (value.digestAlgorithm !== "sha256" || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)) return undefined;
  return { provider: value.provider, assetCount: value.assetCount, objectCount: value.objectCount, sizeBytes: value.sizeBytes, digestAlgorithm: "sha256", digest: value.digest };
}

function parseEntry(value: unknown): ManagedAssetSnapshotEntry | undefined {
  if (!record(value) || typeof value.assetId !== "string" || !value.assetId || typeof value.campaignId !== "string" || !value.campaignId || typeof value.object !== "string" || (value.object !== "primary" && !value.object.startsWith("rendition:")) || typeof value.present !== "boolean" || typeof value.mimeType !== "string" || !safeCount(value.recordedSizeBytes)) return undefined;
  const storage = parseStorageRef(value.storage);
  if (!storage) return undefined;
  const base: ManagedAssetSnapshotEntry = { assetId: value.assetId, campaignId: value.campaignId, object: value.object as ManagedAssetSnapshotEntry["object"], present: value.present, storage, mimeType: value.mimeType, recordedSizeBytes: value.recordedSizeBytes, ...(typeof value.recordedChecksum === "string" ? { recordedChecksum: value.recordedChecksum } : {}) };
  if (!value.present) return value.relativePath === undefined && value.sizeBytes === undefined && value.checksum === undefined ? base : undefined;
  if (typeof value.relativePath !== "string" || !safeCount(value.sizeBytes) || typeof value.checksum !== "string" || !snapshotIdPattern.test(value.checksum)) return undefined;
  return { ...base, relativePath: value.relativePath, sizeBytes: value.sizeBytes, checksum: value.checksum };
}

function parseStorageRef(value: unknown): AssetStorageRef | undefined {
  if (!record(value) || (value.provider !== "local" && value.provider !== "s3") || typeof value.key !== "string" || !value.key) return undefined;
  if (value.bucket !== undefined && typeof value.bucket !== "string") return undefined;
  return { provider: value.provider, key: value.key, ...(value.bucket ? { bucket: value.bucket } : {}) };
}

function referencedSnapshotIds(backupArtifactDirectory: string): Set<string> {
  const result = new Set<string>();
  if (!existsSync(backupArtifactDirectory)) return result;
  for (const fileName of readdirSync(backupArtifactDirectory)) {
    if (!fileName.endsWith(".sqlite.recovery.json")) continue;
    try {
      const value = JSON.parse(readFileSync(join(backupArtifactDirectory, fileName), "utf8")) as unknown;
      if (!record(value) || !record(value.recoveryPoint) || !record(value.recoveryPoint.assetSnapshot)) continue;
      const snapshotId = value.recoveryPoint.assetSnapshot.snapshotId;
      if (typeof snapshotId === "string" && snapshotIdPattern.test(snapshotId)) result.add(snapshotId);
    } catch {
      // Invalid SQLite recovery manifests are surfaced by the SQLite drill; never trust them for retention.
    }
  }
  return result;
}

function sameStorageRef(left: AssetStorageRef, right: AssetStorageRef): boolean {
  return left.provider === right.provider && left.key === right.key && (left.bucket ?? "") === (right.bucket ?? "");
}

function checksumBuffer(value: Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function checksumText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
