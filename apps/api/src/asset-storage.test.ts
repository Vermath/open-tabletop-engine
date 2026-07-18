import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MapAsset } from "@open-tabletop/core";
import { describe, expect, it, vi } from "vitest";
import {
  assetStorageKey,
  LocalAssetStorage,
  S3AssetStorage,
} from "./asset-storage.js";

describe("S3AssetStorage", () => {
  it("creates a missing bucket during readiness and repairs later deletion", async () => {
    const storage = new S3AssetStorage({
      bucket: "fresh-compose-assets",
      region: "us-east-1",
      forcePathStyle: true,
    });
    const commands: unknown[] = [];
    let bucketExists = false;
    const send = vi.fn(async (command: unknown) => {
      commands.push(command);
      if (command instanceof HeadBucketCommand && !bucketExists) {
        throw Object.assign(new Error("missing bucket"), { name: "NoSuchBucket" });
      }
      if (command instanceof CreateBucketCommand) bucketExists = true;
      return {};
    });
    Reflect.set(storage, "client", { send });

    await expect(storage.healthCheck()).resolves.toEqual({ ok: true });
    bucketExists = false;
    await expect(storage.healthCheck()).resolves.toEqual({ ok: true });

    expect(commands).toHaveLength(7);
    expect(commands[0]).toBeInstanceOf(HeadBucketCommand);
    expect(commands[1]).toBeInstanceOf(CreateBucketCommand);
    expect(commands[2]).toBeInstanceOf(HeadBucketCommand);
    expect(commands[3]).toBeInstanceOf(HeadBucketCommand);
    expect(commands[4]).toBeInstanceOf(HeadBucketCommand);
    expect(commands[5]).toBeInstanceOf(CreateBucketCommand);
    expect(commands[6]).toBeInstanceOf(HeadBucketCommand);
  });

  it("retries bucket readiness after a transient failure", async () => {
    const storage = new S3AssetStorage({
      bucket: "configured-assets",
      region: "us-east-1",
      forcePathStyle: false,
    });
    let headAttempts = 0;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadBucketCommand && ++headAttempts === 1)
        throw new Error("temporary MinIO startup failure");
      return {};
    });
    Reflect.set(storage, "client", { send });
    const asset: MapAsset = {
      id: "asset_retry",
      campaignId: "camp_test",
      name: "Retry upload",
      url: "",
      mimeType: "image/png",
      sizeBytes: 3,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    };

    await expect(storage.put(asset, Buffer.from([1, 2, 3]))).rejects.toThrow(
      "temporary MinIO startup failure",
    );
    await expect(
      storage.put(asset, Buffer.from([1, 2, 3]), {
        operationId: "assetop_stable_object_01",
      }),
    ).resolves.toMatchObject({ provider: "s3", bucket: "configured-assets" });

    expect(headAttempts).toBe(2);
    expect(
      send.mock.calls.some(([command]) => command instanceof PutObjectCommand),
    ).toBe(true);
    const put = send.mock.calls.find(
      ([command]) => command instanceof PutObjectCommand,
    )?.[0] as PutObjectCommand | undefined;
    expect(put?.input.Metadata).toMatchObject({
      assetId: "asset_retry",
      campaignId: "camp_test",
      operationId: "assetop_stable_object_01",
    });
  });

  it("fails closed instead of reinterpreting a foreign-bucket key in the configured bucket", async () => {
    const storage = new S3AssetStorage({
      bucket: "configured-assets",
      region: "us-east-1",
      forcePathStyle: false,
    });
    const commands: unknown[] = [];
    const send = vi.fn(async (command: unknown) => {
      commands.push(command);
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        };
      }
      return {};
    });
    Reflect.set(storage, "client", { send });
    const asset: MapAsset = {
      id: "asset_foreign_bucket",
      campaignId: "camp_test",
      name: "Foreign reference",
      url: "/api/v1/assets/asset_foreign_bucket/blob",
      mimeType: "image/png",
      sizeBytes: 3,
      storage: {
        provider: "s3",
        bucket: "foreign-assets",
        key: "foreign/secret.png",
      },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    };

    await expect(storage.read(asset)).resolves.toBeUndefined();
    await expect(storage.delete(asset)).resolves.toBe(false);
    for (const bucket of [undefined, ""]) {
      const missingBucketAsset = {
        ...asset,
        storage: { provider: "s3" as const, bucket, key: "foreign/secret.png" },
      };
      await expect(storage.read(missingBucketAsset)).resolves.toBeUndefined();
      await expect(storage.delete(missingBucketAsset)).resolves.toBe(false);
    }

    expect(
      commands.some((command) => command instanceof GetObjectCommand),
    ).toBe(false);
    expect(
      commands.some((command) => command instanceof DeleteObjectCommand),
    ).toBe(false);
  });
});

describe("asset storage keys", () => {
  it("keeps archive-controlled identifiers collision-resistant", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-asset-key-"));
    const storage = new LocalAssetStorage(directory);
    const asset = (campaignId: string, id: string): MapAsset => ({
      id,
      campaignId,
      name: id,
      url: "",
      mimeType: "image/png",
      sizeBytes: 1,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    const unsafe = asset("camp?demo", "asset?map");
    const canonical = asset("camp_demo", "asset_map");
    try {
      expect(assetStorageKey(unsafe)).not.toBe(assetStorageKey(canonical));
      await storage.put(unsafe, Buffer.from("unsafe"));
      await storage.put(canonical, Buffer.from("canonical"));
      await expect(storage.read(unsafe)).resolves.toEqual(
        Buffer.from("unsafe"),
      );
      await expect(storage.read(canonical)).resolves.toEqual(
        Buffer.from("canonical"),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
