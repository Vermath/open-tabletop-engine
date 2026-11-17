import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { CampaignArchive, MapAsset } from "@open-tabletop/core";
import type { ClaimedCampaignArchiveStreamFiles } from "./archive-stream.js";
import type { AssetStorage } from "./asset-storage.js";

interface RestoreEntry {
  archiveAsset: MapAsset;
  targetAsset: MapAsset;
  writtenAsset?: MapAsset;
  bodyPath: string;
  previousBodyPath?: string;
  previousBodyExisted: boolean;
  attempted: boolean;
}

export interface ArchiveAssetRestoreTransaction {
  readonly restoredFiles: number;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class ArchiveAssetRestoreError extends Error {}
export class ArchiveAssetRestoreAbortedError extends ArchiveAssetRestoreError {}

export interface ArchiveAssetRestoreOptions {
  dryRun?: boolean;
  signal?: AbortSignal;
  onTransaction?: (transaction: ArchiveAssetRestoreTransaction) => void;
}

/**
 * Validate and restore embedded archive objects with a compensating journal.
 * Every destination is snapshotted before the first write. A failed put rolls
 * back all attempted destinations, including a provider that writes and then
 * throws. The caller keeps the returned journal active until state persistence
 * succeeds, then commits it; state failures can therefore roll object storage
 * back to the exact pre-import bytes.
 */
export async function restoreArchivedAssetFiles(
  assetStorage: AssetStorage,
  archive: CampaignArchive,
  options: ArchiveAssetRestoreOptions = {}
): Promise<ArchiveAssetRestoreTransaction> {
  throwIfArchiveRestoreAborted(options.signal);
  const files = archive.files ?? [];
  const assetsById = new Map(archive.data.assets.map((asset) => [asset.id, asset]));
  const entries: RestoreEntry[] = [];
  const stagingDirectory = await mkdtemp(join(tmpdir(), "otte-archive-restore-"));

  try {
    for (const [index, file] of files.entries()) {
      throwIfArchiveRestoreAborted(options.signal);
      const archiveAsset = assetsById.get(file.assetId);
      if (!archiveAsset) throw new ArchiveAssetRestoreError(`Archive file does not match an asset: ${file.assetId}`);
      if (file.encoding !== "base64") throw new ArchiveAssetRestoreError(`Unsupported archive file encoding: ${file.encoding}`);
      const bodyPath = join(stagingDirectory, `archive-${index}.bin`);
      const decoded = await decodeBase64File(file.data, bodyPath, file.sizeBytes, options.signal);
      const checksum = decoded.checksum;
      if (decoded.sizeBytes !== file.sizeBytes) throw new ArchiveAssetRestoreError(`Archive file size mismatch: ${file.assetId}`);
      if (checksum !== file.checksum) throw new ArchiveAssetRestoreError(`Archive file checksum mismatch: ${file.assetId}`);
      if (archiveAsset.checksum && checksum !== archiveAsset.checksum) throw new ArchiveAssetRestoreError(`Asset metadata checksum mismatch: ${file.assetId}`);
      entries.push({
        archiveAsset,
        targetAsset: {
          ...archiveAsset,
          url: `/api/v1/assets/${archiveAsset.id}/blob`,
          storage: undefined
        },
        bodyPath,
        previousBodyExisted: false,
        attempted: false
      });
    }
  } catch (error) {
    await removeStagingDirectory(stagingDirectory);
    throw error;
  }

  return restorePreparedArchiveAssetFiles(assetStorage, entries, stagingDirectory, options);
}

/**
 * Restore files already length- and checksum-validated by the framed archive
 * parser. `file.data` is an internal staging token that survives archive scope,
 * conflict, and id-regeneration transforms; client-provided values never reach
 * this function without first being replaced by the parser.
 */
export async function restoreStagedArchivedAssetFiles(
  assetStorage: AssetStorage,
  archive: CampaignArchive,
  staged: ClaimedCampaignArchiveStreamFiles,
  options: ArchiveAssetRestoreOptions = {},
): Promise<ArchiveAssetRestoreTransaction> {
  const assetsById = new Map(archive.data.assets.map((asset) => [asset.id, asset]));
  const stagedByToken = new Map(staged.files.map((file) => [file.token, file]));
  const entries: RestoreEntry[] = [];
  try {
    for (const file of archive.files ?? []) {
      throwIfArchiveRestoreAborted(options.signal);
      const source = stagedByToken.get(file.data);
      if (!source) throw new ArchiveAssetRestoreError(`Archive stream staging token was not found: ${file.assetId}`);
      if (source.sizeBytes !== file.sizeBytes) throw new ArchiveAssetRestoreError(`Archive stream staged size mismatch: ${file.assetId}`);
      if (source.checksum !== file.checksum) throw new ArchiveAssetRestoreError(`Archive stream staged checksum mismatch: ${file.assetId}`);
      const archiveAsset = assetsById.get(file.assetId);
      if (!archiveAsset) throw new ArchiveAssetRestoreError(`Archive file does not match an asset: ${file.assetId}`);
      if (archiveAsset.sizeBytes !== file.sizeBytes) throw new ArchiveAssetRestoreError(`Archive file size mismatch: ${file.assetId}`);
      if (archiveAsset.checksum && archiveAsset.checksum !== file.checksum) throw new ArchiveAssetRestoreError(`Asset metadata checksum mismatch: ${file.assetId}`);
      entries.push({
        archiveAsset,
        targetAsset: {
          ...archiveAsset,
          url: `/api/v1/assets/${archiveAsset.id}/blob`,
          storage: undefined,
        },
        bodyPath: source.bodyPath,
        previousBodyExisted: false,
        attempted: false,
      });
    }
  } catch (error) {
    await removeStagingDirectory(staged.stagingDirectory);
    throw error;
  }

  return restorePreparedArchiveAssetFiles(assetStorage, entries, staged.stagingDirectory, options);
}

async function restorePreparedArchiveAssetFiles(
  assetStorage: AssetStorage,
  entries: RestoreEntry[],
  stagingDirectory: string,
  options: ArchiveAssetRestoreOptions,
): Promise<ArchiveAssetRestoreTransaction> {

  if (options.dryRun) {
    await removeStagingDirectory(stagingDirectory);
    return new CompensatingArchiveAssetRestore(assetStorage, entries, stagingDirectory, false);
  }

  // Resolve every previous destination before the first write. A storage read
  // failure therefore cannot leave a partially applied archive.
  try {
    for (const [index, entry] of entries.entries()) {
      throwIfArchiveRestoreAborted(options.signal);
      const previousBodyPath = join(stagingDirectory, `previous-${index}.bin`);
      const previousStream = await assetStorage.stream?.(entry.targetAsset);
      throwIfArchiveRestoreAborted(options.signal);
      if (previousStream) {
        await pipeline(previousStream, createWriteStream(previousBodyPath, { flags: "wx" }), { signal: options.signal });
        entry.previousBodyPath = previousBodyPath;
        entry.previousBodyExisted = true;
      } else {
        const previousBody = await assetStorage.read(entry.targetAsset);
        throwIfArchiveRestoreAborted(options.signal);
        if (previousBody !== undefined) {
          entry.previousBodyPath = previousBodyPath;
          entry.previousBodyExisted = true;
          await writeFile(previousBodyPath, previousBody, { flag: "wx" });
        }
      }
    }
  } catch (error) {
    await removeStagingDirectory(stagingDirectory);
    throw error;
  }

  const transaction = new CompensatingArchiveAssetRestore(assetStorage, entries, stagingDirectory, true);
  options.onTransaction?.(transaction);
  try {
    for (const entry of entries) {
      throwIfArchiveRestoreAborted(options.signal);
      entry.attempted = true;
      const storage = await putStagedAsset(assetStorage, entry.targetAsset, entry.bodyPath, entry.archiveAsset.sizeBytes);
      entry.writtenAsset = { ...entry.targetAsset, storage };
      entry.archiveAsset.url = entry.targetAsset.url;
      entry.archiveAsset.storage = storage;
      throwIfArchiveRestoreAborted(options.signal);
    }
    return transaction;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      throw archiveRestoreRollbackFailure(error, rollbackError);
    }
    throw error;
  }
}

class CompensatingArchiveAssetRestore implements ArchiveAssetRestoreTransaction {
  private active: boolean;
  private rollbackPromise?: Promise<void>;

  constructor(
    private readonly assetStorage: AssetStorage,
    private readonly entries: RestoreEntry[],
    private readonly stagingDirectory: string,
    active: boolean
  ) {
    this.active = active;
  }

  get restoredFiles(): number {
    return this.entries.length;
  }

  async commit(): Promise<void> {
    this.active = false;
    for (const entry of this.entries) entry.previousBodyPath = undefined;
    await removeStagingDirectory(this.stagingDirectory);
  }

  async rollback(): Promise<void> {
    if (!this.active) return;
    if (this.rollbackPromise) return this.rollbackPromise;
    this.rollbackPromise = this.performRollback();
    try {
      await this.rollbackPromise;
    } finally {
      this.rollbackPromise = undefined;
    }
  }

  private async performRollback(): Promise<void> {
    if (!this.active) return;
    const failures: Error[] = [];
    for (const entry of [...this.entries].reverse()) {
      if (!entry.attempted) continue;
      const entryFailures: Error[] = [];
      const writtenAsset = entry.writtenAsset ?? entry.targetAsset;
      try {
        // A provider may choose a key different from its default key. Remove
        // the exact returned destination when available; for a put that threw
        // after writing, the default target is the only recoverable location.
        await this.assetStorage.delete(writtenAsset);
      } catch (error) {
        entryFailures.push(normalizeError(error));
      }
      try {
        if (entry.previousBodyExisted && entry.previousBodyPath) await putStagedAsset(this.assetStorage, entry.targetAsset, entry.previousBodyPath);
        else if (entry.writtenAsset) await this.assetStorage.delete(entry.targetAsset);
      } catch (error) {
        entryFailures.push(normalizeError(error));
      }
      if (entryFailures.length === 0) {
        entry.attempted = false;
        entry.writtenAsset = undefined;
        entry.previousBodyPath = undefined;
      }
      failures.push(...entryFailures);
    }
    if (failures.length > 0) {
      throw new Error(`Archive asset rollback failed for ${failures.length} object(s): ${failures.map((failure) => failure.message).join("; ")}`);
    }
    this.active = false;
    await removeStagingDirectory(this.stagingDirectory);
  }
}

async function removeStagingDirectory(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Staging cleanup is best-effort after the durable object transaction has
    // completed. It never changes the archive commit/rollback outcome.
  }
}

function throwIfArchiveRestoreAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const failure = new ArchiveAssetRestoreAbortedError("Campaign archive asset restore was cancelled");
  failure.cause = signal.reason;
  throw failure;
}

function archiveRestoreRollbackFailure(originalError: unknown, rollbackError: unknown): Error {
  const original = normalizeError(originalError);
  const rollback = normalizeError(rollbackError);
  const failure = new Error(`Archive asset restore failed and rollback was incomplete: ${original.message}; ${rollback.message}`);
  failure.cause = original;
  return failure;
}

async function decodeBase64File(data: string, path: string, expectedSizeBytes: number, signal?: AbortSignal): Promise<{ sizeBytes: number; checksum: string }> {
  if (!canonicalBase64Shape(data, expectedSizeBytes)) throw new ArchiveAssetRestoreError("Archive file contains invalid base64 data");
  const handle = await open(path, "wx");
  const hash = createHash("sha256");
  let sizeBytes = 0;
  try {
    const chunkCharacters = 64 * 1024;
    for (let offset = 0; offset < data.length; offset += chunkCharacters) {
      throwIfArchiveRestoreAborted(signal);
      const chunk = Buffer.from(data.slice(offset, Math.min(data.length, offset + chunkCharacters)), "base64");
      sizeBytes += chunk.length;
      if (sizeBytes > expectedSizeBytes) throw new ArchiveAssetRestoreError("Archive file decoded size exceeds its declared size");
      hash.update(chunk);
      let written = 0;
      while (written < chunk.length) {
        const result = await handle.write(chunk, written, chunk.length - written);
        written += result.bytesWritten;
      }
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { sizeBytes, checksum: `sha256:${hash.digest("hex")}` };
}

function canonicalBase64Shape(data: string, expectedSizeBytes: number): boolean {
  if (data.length !== Math.ceil(expectedSizeBytes / 3) * 4) return false;
  const padding = expectedSizeBytes % 3 === 0 ? 0 : 3 - (expectedSizeBytes % 3);
  const contentLength = data.length - padding;
  for (let index = 0; index < data.length; index += 1) {
    const code = data.charCodeAt(index);
    if (index >= contentLength) {
      if (code !== 61) return false;
      continue;
    }
    if (
      !(
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        (code >= 48 && code <= 57) ||
        code === 43 ||
        code === 47
      )
    ) return false;
  }
  return true;
}

async function putStagedAsset(assetStorage: AssetStorage, asset: MapAsset, path: string, sizeBytes?: number) {
  if (assetStorage.putStream) return assetStorage.putStream(asset, createReadStream(path), sizeBytes);
  return assetStorage.put(asset, await readFile(path));
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
