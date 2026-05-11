import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AssetStorageRef, MapAsset } from "@open-tabletop/core";

export interface AssetStorage {
  readonly provider: AssetStorageRef["provider"];
  put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef>;
  read(asset: MapAsset): Promise<Buffer | undefined>;
  stream?(asset: MapAsset): Promise<NodeJS.ReadableStream | undefined>;
  delete(asset: MapAsset): Promise<boolean>;
}

export interface AssetStorageOptions {
  uploadDir: string;
}

export function createAssetStorage(options: AssetStorageOptions): AssetStorage {
  const provider = (process.env.OTTE_ASSET_STORAGE ?? "local").toLowerCase();
  return createAssetStorageForProvider(provider, options);
}

export function createAssetStorageForProvider(provider: string, options: AssetStorageOptions): AssetStorage {
  if (provider === "s3" || provider === "minio") {
    return new S3AssetStorage({
      bucket: requiredEnv("OTTE_S3_BUCKET"),
      endpoint: process.env.OTTE_S3_ENDPOINT,
      region: process.env.OTTE_S3_REGION ?? "us-east-1",
      accessKeyId: process.env.OTTE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.OTTE_S3_SECRET_ACCESS_KEY,
      forcePathStyle: booleanEnv("OTTE_S3_FORCE_PATH_STYLE", Boolean(process.env.OTTE_S3_ENDPOINT))
    });
  }
  if (provider !== "local") throw new Error(`Unsupported OTTE_ASSET_STORAGE provider: ${provider}`);
  return new LocalAssetStorage(options.uploadDir);
}

export class LocalAssetStorage implements AssetStorage {
  readonly provider = "local" as const;

  constructor(private readonly uploadDir: string) {}

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const key = asset.storage?.provider === "local" ? asset.storage.key : assetStorageKey(asset);
    const filePath = this.filePathForKey(key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, body);
    return { provider: "local", key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    const filePath = this.filePathForKey(asset.storage?.provider === "local" ? asset.storage.key : assetStorageKey(asset));
    if (!existsSync(filePath)) return undefined;
    return readFileSync(filePath);
  }

  async stream(asset: MapAsset): Promise<NodeJS.ReadableStream | undefined> {
    const filePath = this.filePathForKey(asset.storage?.provider === "local" ? asset.storage.key : assetStorageKey(asset));
    if (!existsSync(filePath)) return undefined;
    return createReadStream(filePath);
  }

  async delete(asset: MapAsset): Promise<boolean> {
    const filePath = this.filePathForKey(asset.storage?.provider === "local" ? asset.storage.key : assetStorageKey(asset));
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  private filePathForKey(key: string): string {
    const root = resolve(this.uploadDir);
    const filePath = resolve(root, key);
    if (!isWithinPath(root, filePath)) throw new Error("Invalid asset storage path");
    return filePath;
  }
}

export interface S3AssetStorageOptions {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

export class S3AssetStorage implements AssetStorage {
  readonly provider = "s3" as const;
  private readonly client: S3Client;
  private ready?: Promise<void>;

  constructor(private readonly options: S3AssetStorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey
            }
          : undefined
    });
  }

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    await this.ensureBucket();
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: asset.mimeType,
        Metadata: {
          assetId: asset.id,
          campaignId: asset.campaignId
        }
      })
    );
    return { provider: "s3", bucket: this.options.bucket, key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    await this.ensureBucket();
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: asset.storage?.bucket ?? this.options.bucket,
          Key: key
        })
      );
      if (!object.Body) return undefined;
      return bodyToBuffer(object.Body);
    } catch (error) {
      if (isS3NotFound(error)) return undefined;
      throw error;
    }
  }

  async delete(asset: MapAsset): Promise<boolean> {
    await this.ensureBucket();
    const key = asset.storage?.provider === "s3" ? asset.storage.key : assetStorageKey(asset);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: asset.storage?.bucket ?? this.options.bucket,
        Key: key
      })
    );
    return true;
  }

  private ensureBucket(): Promise<void> {
    this.ready ??= this.createBucketIfMissing();
    return this.ready;
  }

  private async createBucketIfMissing(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    } catch (error) {
      if (!isS3NotFound(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));
    }
  }
}

export function assetStorageKey(asset: MapAsset): string {
  return `${assetStorageKeyPart(asset.campaignId)}/${assetStorageKeyPart(asset.id)}${extensionForMimeType(asset.mimeType)}`;
}

function assetStorageKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "unknown";
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".bin";
  }
}

function isWithinPath(parent: string, child: string): boolean {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when OTTE_ASSET_STORAGE=s3`);
  return value;
}

function booleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (isTransformableBody(body)) return Buffer.from(await body.transformToByteArray());
  throw new Error("Unsupported S3 body stream");
}

function isTransformableBody(body: unknown): body is { transformToByteArray(): Promise<Uint8Array> } {
  return Boolean(body && typeof body === "object" && "transformToByteArray" in body);
}

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.name === "NoSuchBucket" || candidate.$metadata?.httpStatusCode === 404;
}
