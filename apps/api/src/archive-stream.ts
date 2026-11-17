import { createHash } from "node:crypto";
import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { campaignArchiveStreamContentType } from "@open-tabletop/api-contracts";
import type { CampaignArchive, CampaignArchiveFile, MapAsset } from "@open-tabletop/core";
import type { AssetStorage } from "./asset-storage.js";

export const CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE = campaignArchiveStreamContentType;

const ARCHIVE_STREAM_MAGIC = Buffer.from("OTTXSTRM1\n", "ascii");
const ARCHIVE_STREAM_DIGEST_BYTES = 32;
const ARCHIVE_STREAM_MAX_ASSET_HEADER_BYTES = 64 * 1024;
const ARCHIVE_STREAM_OUTPUT_CHUNK_BYTES = 64 * 1024;

export class CampaignArchiveStreamError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, options: { statusCode?: number; code?: string } = {}) {
    super(message);
    this.name = "CampaignArchiveStreamError";
    this.statusCode = options.statusCode ?? 400;
    this.code = options.code ?? "invalid_campaign_archive_stream";
  }
}

export interface CampaignArchiveStreamMetrics {
  metadataBytes: number;
  assetFiles: number;
  assetBytes: number;
  maxAssetChunkBytes: number;
  maxInputChunkBytes: number;
  maxParserBufferedBytes: number;
}

export function emptyCampaignArchiveStreamMetrics(): CampaignArchiveStreamMetrics {
  return {
    metadataBytes: 0,
    assetFiles: 0,
    assetBytes: 0,
    maxAssetChunkBytes: 0,
    maxInputChunkBytes: 0,
    maxParserBufferedBytes: 0,
  };
}

export interface CampaignArchiveStreamLimits {
  maxMetadataBytes: number;
  maxAssetBytes: number;
  maxEmbeddedAssetBytes: number;
  maxAssetFiles: number;
}

export interface StagedCampaignArchiveFile {
  token: string;
  bodyPath: string;
  originalAssetId: string;
  sizeBytes: number;
  checksum: string;
}

export interface ClaimedCampaignArchiveStreamFiles {
  stagingDirectory: string;
  files: StagedCampaignArchiveFile[];
}

interface CampaignArchiveStreamAssetHeader {
  assetId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Reject an oversized stream before response bytes are committed. The framed
 * transport still checks actual streamed lengths and hashes; this preflight is
 * the deterministic HTTP 413 boundary based on durable asset metadata.
 */
export function assertCampaignArchiveStreamExportSize(
  archive: CampaignArchive,
  limits: Pick<CampaignArchiveStreamLimits, "maxAssetBytes" | "maxEmbeddedAssetBytes" | "maxAssetFiles">,
): void {
  let embeddedBytes = 0;
  let embeddedFiles = 0;
  for (const asset of archive.data.assets) {
    if (!archiveAssetIsEmbeddable(asset)) continue;
    embeddedFiles += 1;
    if (embeddedFiles > limits.maxAssetFiles) {
      throw new CampaignArchiveStreamError("Campaign archive contains more embedded asset files than the configured limit", {
        statusCode: 413,
        code: "campaign_archive_too_large",
      });
    }
    if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0) {
      throw new CampaignArchiveStreamError(`Campaign archive asset has an invalid size: ${asset.id}`);
    }
    if (asset.sizeBytes > limits.maxAssetBytes) {
      throw new CampaignArchiveStreamError(`Campaign archive asset exceeds the per-file limit: ${asset.id}`, {
        statusCode: 413,
        code: "campaign_archive_too_large",
      });
    }
    embeddedBytes += asset.sizeBytes;
    if (embeddedBytes > limits.maxEmbeddedAssetBytes) {
      throw new CampaignArchiveStreamError("Campaign archive embedded assets exceed the configured aggregate limit", {
        statusCode: 413,
        code: "campaign_archive_too_large",
      });
    }
  }
}

/**
 * Produce a backpressured OTTX stream. Asset bytes are never base64 encoded or
 * accumulated: each raw chunk is emitted once, followed by its binary SHA-256
 * digest. The JSON metadata header remains the same CampaignArchive shape with
 * `files` omitted, preserving the existing archive semantics.
 */
export function createCampaignArchiveStream(
  archive: CampaignArchive,
  assetStorage: AssetStorage,
  limits: CampaignArchiveStreamLimits,
  metrics: CampaignArchiveStreamMetrics = emptyCampaignArchiveStreamMetrics(),
): Readable {
  return Readable.from(encodeCampaignArchiveStream(archive, assetStorage, limits, metrics));
}

export async function* encodeCampaignArchiveStream(
  archive: CampaignArchive,
  assetStorage: AssetStorage,
  limits: CampaignArchiveStreamLimits,
  metrics: CampaignArchiveStreamMetrics = emptyCampaignArchiveStreamMetrics(),
): AsyncGenerator<Buffer> {
  assertCampaignArchiveStreamExportSize(archive, limits);
  if (!assetStorage.stream) {
    throw new CampaignArchiveStreamError("The configured asset provider does not support bounded campaign archive streaming", {
      statusCode: 503,
      code: "campaign_archive_streaming_unavailable",
    });
  }

  const metadataArchive: CampaignArchive = {
    ...archive,
    manifest: { ...archive.manifest, assetFileCount: undefined },
    files: undefined,
  };
  const metadata = Buffer.from(JSON.stringify(metadataArchive), "utf8");
  if (metadata.length > limits.maxMetadataBytes) {
    throw new CampaignArchiveStreamError("Campaign archive metadata exceeds the configured stream limit", {
      statusCode: 413,
      code: "campaign_archive_too_large",
    });
  }
  metrics.metadataBytes = metadata.length;

  yield ARCHIVE_STREAM_MAGIC;
  yield uint32Frame(metadata.length);
  yield metadata;

  let aggregateBytes = 0;
  for (const asset of archive.data.assets) {
    if (!archiveAssetIsEmbeddable(asset)) continue;
    const source = await assetStorage.stream(asset);
    if (!source) continue;

    const header: CampaignArchiveStreamAssetHeader = {
      assetId: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
    const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
    if (headerBytes.length > ARCHIVE_STREAM_MAX_ASSET_HEADER_BYTES) {
      throw new CampaignArchiveStreamError(`Campaign archive asset header is too large: ${asset.id}`);
    }
    yield uint32Frame(headerBytes.length);
    yield headerBytes;

    const hash = createHash("sha256");
    let assetBytes = 0;
    try {
      for await (const value of source as AsyncIterable<Buffer | Uint8Array | string>) {
        const chunk = typeof value === "string" ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        if (assetBytes + chunk.length > asset.sizeBytes) {
          throw new CampaignArchiveStreamError(`Stored asset is larger than its declared size: ${asset.id}`);
        }
        hash.update(chunk);
        assetBytes += chunk.length;
        aggregateBytes += chunk.length;
        if (aggregateBytes > limits.maxEmbeddedAssetBytes) {
          throw new CampaignArchiveStreamError("Campaign archive embedded assets exceed the configured aggregate limit", {
            statusCode: 413,
            code: "campaign_archive_too_large",
          });
        }
        for (let offset = 0; offset < chunk.length; offset += ARCHIVE_STREAM_OUTPUT_CHUNK_BYTES) {
          const output = chunk.subarray(offset, Math.min(chunk.length, offset + ARCHIVE_STREAM_OUTPUT_CHUNK_BYTES));
          metrics.maxAssetChunkBytes = Math.max(metrics.maxAssetChunkBytes, output.length);
          yield output;
        }
      }
    } finally {
      const destroyable = source as unknown as { destroy?: () => void };
      if (typeof destroyable.destroy === "function") destroyable.destroy();
    }
    if (assetBytes !== asset.sizeBytes) {
      throw new CampaignArchiveStreamError(`Stored asset size does not match archive metadata: ${asset.id}`);
    }
    const digest = hash.digest();
    const checksum = `sha256:${digest.toString("hex")}`;
    if (asset.checksum && checksum !== asset.checksum) {
      throw new CampaignArchiveStreamError(`Stored asset checksum does not match archive metadata: ${asset.id}`);
    }
    yield digest;
    metrics.assetFiles += 1;
    metrics.assetBytes += assetBytes;
  }

  yield uint32Frame(0);
}

export class ParsedCampaignArchiveStream {
  readonly requestDigest!: string;
  private readonly archiveValue!: CampaignArchive;
  private readonly stagedValue!: ClaimedCampaignArchiveStreamFiles;
  private claimed = false;

  constructor(archive: CampaignArchive, staged: ClaimedCampaignArchiveStreamFiles, requestDigest: string) {
    // Only the stable digest participates in the generic idempotency request
    // hash. Archive data and random staging paths are intentionally hidden.
    Object.defineProperties(this, {
      requestDigest: { value: requestDigest, enumerable: true },
      archiveValue: { value: archive, enumerable: false },
      stagedValue: { value: staged, enumerable: false },
    });
  }

  get archive(): CampaignArchive {
    return this.archiveValue;
  }

  archiveWithStagedFilePlaceholders(): CampaignArchive {
    const assetsById = new Map(this.archiveValue.data.assets.map((asset) => [asset.id, asset]));
    const files: CampaignArchiveFile[] = this.stagedValue.files.map((file) => {
      const asset = assetsById.get(file.originalAssetId);
      if (!asset) throw new CampaignArchiveStreamError(`Archive stream file does not match an asset: ${file.originalAssetId}`);
      return {
        assetId: file.originalAssetId,
        name: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        encoding: "base64",
        // This is an internal opaque staging token, never decoded as base64.
        // Archive transforms preserve it while remapping/filtering asset ids.
        data: file.token,
      };
    });
    return {
      ...this.archiveValue,
      manifest: { ...this.archiveValue.manifest, assetFileCount: files.length },
      files,
    };
  }

  claimStagedFiles(): ClaimedCampaignArchiveStreamFiles {
    this.claimed = true;
    return this.stagedValue;
  }

  async cleanup(): Promise<void> {
    if (this.claimed) return;
    await removeStagingDirectory(this.stagedValue.stagingDirectory);
  }
}

export function isParsedCampaignArchiveStream(value: unknown): value is ParsedCampaignArchiveStream {
  return value instanceof ParsedCampaignArchiveStream;
}

/**
 * Parse and validate framing into temporary files. No asset-provider or engine
 * state mutation occurs here. Every raw file is length- and checksum-verified
 * before the route can proceed to permission/reference validation and commit.
 */
export async function parseCampaignArchiveStream(
  source: NodeJS.ReadableStream,
  limits: CampaignArchiveStreamLimits,
  metrics: CampaignArchiveStreamMetrics = emptyCampaignArchiveStreamMetrics(),
): Promise<ParsedCampaignArchiveStream> {
  const stagingDirectory = await mkdtemp(join(tmpdir(), "otte-archive-stream-"));
  const cursor = new ArchiveStreamCursor(source, metrics);
  const stagedFiles: StagedCampaignArchiveFile[] = [];
  try {
    const magic = await cursor.readExactly(ARCHIVE_STREAM_MAGIC.length);
    if (!magic.equals(ARCHIVE_STREAM_MAGIC)) throw new CampaignArchiveStreamError("Campaign archive stream has an invalid magic header");
    const metadataLength = await cursor.readUint32();
    if (metadataLength === 0 || metadataLength > limits.maxMetadataBytes) {
      throw new CampaignArchiveStreamError("Campaign archive stream metadata length is invalid", {
        statusCode: metadataLength > limits.maxMetadataBytes ? 413 : 400,
        code: metadataLength > limits.maxMetadataBytes ? "campaign_archive_too_large" : "invalid_campaign_archive_stream",
      });
    }
    metrics.metadataBytes = metadataLength;
    const metadataBytes = await cursor.readExactly(metadataLength);
    let archive: CampaignArchive;
    try {
      archive = JSON.parse(metadataBytes.toString("utf8")) as CampaignArchive;
    } catch {
      throw new CampaignArchiveStreamError("Campaign archive stream metadata is not valid JSON");
    }
    if (!archive || typeof archive !== "object" || Array.isArray(archive)) {
      throw new CampaignArchiveStreamError("Campaign archive stream metadata must be an object");
    }
    if (Array.isArray(archive.files) && archive.files.length > 0) {
      throw new CampaignArchiveStreamError("Campaign archive stream metadata must not contain embedded base64 files");
    }
    archive.files = undefined;

    const assets = Array.isArray(archive.data?.assets) ? archive.data.assets : [];
    const assetsById = new Map<string, MapAsset>();
    for (const asset of assets) {
      if (asset && typeof asset === "object" && typeof asset.id === "string") assetsById.set(asset.id, asset);
    }
    const seenAssetIds = new Set<string>();
    let aggregateBytes = 0;
    let index = 0;

    while (true) {
      const headerLength = await cursor.readUint32();
      if (headerLength === 0) break;
      if (headerLength > ARCHIVE_STREAM_MAX_ASSET_HEADER_BYTES) {
        throw new CampaignArchiveStreamError("Campaign archive stream asset header is too large");
      }
      const header = parseAssetHeader(await cursor.readExactly(headerLength));
      if (seenAssetIds.has(header.assetId)) throw new CampaignArchiveStreamError(`Campaign archive stream contains duplicate asset bytes: ${header.assetId}`);
      if (index >= limits.maxAssetFiles) {
        throw new CampaignArchiveStreamError("Campaign archive contains more embedded asset files than the configured limit", {
          statusCode: 413,
          code: "campaign_archive_too_large",
        });
      }
      const asset = assetsById.get(header.assetId);
      if (!asset) throw new CampaignArchiveStreamError(`Campaign archive stream file does not match an asset: ${header.assetId}`);
      if (!archiveAssetIsEmbeddable(asset)) throw new CampaignArchiveStreamError(`Campaign archive stream cannot embed an external asset URL: ${header.assetId}`);
      if (header.name !== asset.name || header.mimeType !== asset.mimeType || header.sizeBytes !== asset.sizeBytes) {
        throw new CampaignArchiveStreamError(`Campaign archive stream asset metadata mismatch: ${header.assetId}`);
      }
      if (header.sizeBytes > limits.maxAssetBytes) {
        throw new CampaignArchiveStreamError(`Campaign archive stream asset exceeds the per-file limit: ${header.assetId}`, {
          statusCode: 413,
          code: "campaign_archive_too_large",
        });
      }
      aggregateBytes += header.sizeBytes;
      if (aggregateBytes > limits.maxEmbeddedAssetBytes) {
        throw new CampaignArchiveStreamError("Campaign archive embedded assets exceed the configured aggregate limit", {
          statusCode: 413,
          code: "campaign_archive_too_large",
        });
      }

      const bodyPath = join(stagingDirectory, `archive-${index}.bin`);
      const handle = await open(bodyPath, "wx");
      const hash = createHash("sha256");
      try {
        await cursor.consumeExactly(header.sizeBytes, async (chunk) => {
          hash.update(chunk);
          let written = 0;
          while (written < chunk.length) {
            const result = await handle.write(chunk, written, chunk.length - written);
            written += result.bytesWritten;
          }
          metrics.maxAssetChunkBytes = Math.max(metrics.maxAssetChunkBytes, chunk.length);
        });
      } finally {
        await handle.close();
      }
      const expectedDigest = await cursor.readExactly(ARCHIVE_STREAM_DIGEST_BYTES);
      const actualDigest = hash.digest();
      if (!actualDigest.equals(expectedDigest)) throw new CampaignArchiveStreamError(`Campaign archive stream checksum mismatch: ${header.assetId}`);
      const checksum = `sha256:${actualDigest.toString("hex")}`;
      if (asset.checksum && checksum !== asset.checksum) throw new CampaignArchiveStreamError(`Asset metadata checksum mismatch: ${header.assetId}`);

      const token = `otte-archive-stream-file:${index}`;
      stagedFiles.push({ token, bodyPath, originalAssetId: header.assetId, sizeBytes: header.sizeBytes, checksum });
      seenAssetIds.add(header.assetId);
      metrics.assetFiles += 1;
      metrics.assetBytes += header.sizeBytes;
      index += 1;
    }

    await cursor.assertEnd();
    const requestDigest = cursor.digest();
    return new ParsedCampaignArchiveStream(archive, { stagingDirectory, files: stagedFiles }, requestDigest);
  } catch (error) {
    await removeStagingDirectory(stagingDirectory);
    throw error;
  }
}

class ArchiveStreamCursor {
  private readonly iterator: AsyncIterator<Buffer | Uint8Array | string>;
  private pending: Buffer = Buffer.alloc(0);
  private pendingOffset = 0;
  private ended = false;
  private readonly requestHash = createHash("sha256");
  private digested = false;

  constructor(source: NodeJS.ReadableStream, private readonly metrics: CampaignArchiveStreamMetrics) {
    this.iterator = (source as unknown as AsyncIterable<Buffer | Uint8Array | string>)[Symbol.asyncIterator]();
  }

  async readUint32(): Promise<number> {
    return (await this.readExactly(4)).readUInt32BE(0);
  }

  async readExactly(length: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    await this.consumeExactly(length, (chunk) => {
      chunks.push(chunk);
    });
    return chunks.length === 1 ? Buffer.from(chunks[0]!) : Buffer.concat(chunks, length);
  }

  async consumeExactly(length: number, consume: (chunk: Buffer) => void | Promise<void>): Promise<void> {
    let remaining = length;
    while (remaining > 0) {
      if (this.pendingOffset >= this.pending.length) await this.pull();
      if (this.ended) throw new CampaignArchiveStreamError("Campaign archive stream ended before the declared frame length");
      const available = this.pending.length - this.pendingOffset;
      const take = Math.min(remaining, available, ARCHIVE_STREAM_OUTPUT_CHUNK_BYTES);
      const chunk = this.pending.subarray(this.pendingOffset, this.pendingOffset + take);
      this.pendingOffset += take;
      remaining -= take;
      this.metrics.maxParserBufferedBytes = Math.max(this.metrics.maxParserBufferedBytes, this.pending.length - this.pendingOffset);
      await consume(chunk);
    }
  }

  async assertEnd(): Promise<void> {
    if (this.pendingOffset < this.pending.length) throw new CampaignArchiveStreamError("Campaign archive stream contains trailing bytes");
    await this.pull();
    if (!this.ended) throw new CampaignArchiveStreamError("Campaign archive stream contains trailing bytes");
  }

  digest(): string {
    if (this.digested) throw new CampaignArchiveStreamError("Campaign archive stream digest was already finalized");
    this.digested = true;
    return `sha256:${this.requestHash.digest("hex")}`;
  }

  private async pull(): Promise<void> {
    if (this.ended) return;
    const next = await this.iterator.next();
    if (next.done) {
      this.pending = Buffer.alloc(0);
      this.pendingOffset = 0;
      this.ended = true;
      return;
    }
    const value = next.value;
    const chunk = typeof value === "string" ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    if (chunk.length === 0) return this.pull();
    this.requestHash.update(chunk);
    this.pending = chunk;
    this.pendingOffset = 0;
    this.metrics.maxInputChunkBytes = Math.max(this.metrics.maxInputChunkBytes, chunk.length);
    this.metrics.maxParserBufferedBytes = Math.max(this.metrics.maxParserBufferedBytes, chunk.length);
  }
}

function parseAssetHeader(value: Buffer): CampaignArchiveStreamAssetHeader {
  let input: unknown;
  try {
    input = JSON.parse(value.toString("utf8"));
  } catch {
    throw new CampaignArchiveStreamError("Campaign archive stream asset header is not valid JSON");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CampaignArchiveStreamError("Campaign archive stream asset header must be an object");
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "assetId,mimeType,name,sizeBytes") throw new CampaignArchiveStreamError("Campaign archive stream asset header contains unsupported fields");
  const assetId = boundedText(record.assetId, "assetId", 256);
  if (assetId.includes("/") || assetId.includes("\\") || assetId.includes("\0")) {
    throw new CampaignArchiveStreamError("Campaign archive stream assetId must not contain path separators");
  }
  const name = boundedText(record.name, "name", 512);
  const mimeType = boundedText(record.mimeType, "mimeType", 255);
  const sizeBytes = record.sizeBytes;
  if (!Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0) throw new CampaignArchiveStreamError("Campaign archive stream asset size must be a non-negative safe integer");
  return { assetId, name, mimeType, sizeBytes: sizeBytes as number };
}

function boundedText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new CampaignArchiveStreamError(`Campaign archive stream asset ${label} must be 1-${maxLength} characters`);
  }
  return value;
}

function archiveAssetIsEmbeddable(asset: MapAsset): boolean {
  return asset.url.startsWith("/api/v1/assets/");
}

function uint32Frame(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new CampaignArchiveStreamError("Campaign archive stream frame length is invalid");
  }
  const frame = Buffer.allocUnsafe(4);
  frame.writeUInt32BE(value, 0);
  return frame;
}

async function removeStagingDirectory(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch {
    // Cleanup is best-effort after validation or transaction completion.
  }
}
