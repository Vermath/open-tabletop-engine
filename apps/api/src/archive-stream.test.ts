import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { emptyState, type AssetStorageRef, type CampaignArchive, type EngineState, type MapAsset } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import {
  CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
  createCampaignArchiveStream,
  emptyCampaignArchiveStreamMetrics,
  parseCampaignArchiveStream,
} from "./archive-stream.js";
import type { AssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

describe("bounded campaign archive streams", () => {
  it("rejects unauthenticated stream imports before parsing or staging the body", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-stream-auth-"));
    const app = await buildApp({ uploadDir });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign/stream",
        headers: {
          "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
          "idempotency-key": "stream-unauthenticated-import",
        },
        payload: Buffer.from("not an archive stream"),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("unauthorized");
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("rejects an authenticated stream import without an idempotency key before parsing", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-stream-idempotency-"));
    const app = await buildApp({ uploadDir });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign/stream",
        headers: {
          ...authHeaders,
          "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
          // Preserve the explicit missing-precondition case through the legacy
          // integration adapter so the production pre-parse hook is exercised.
          "idempotency-key": "",
        },
        payload: Buffer.from("not an archive stream"),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe("Campaign import requires an Idempotency-Key header");
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("keeps encoder and parser-owned asset buffers bounded independently of asset size", async () => {
    const assetBytes = Buffer.alloc(4 * 1024 * 1024 + 17, 0x5a);
    const asset = archiveAsset("asset_stream_envelope", assetBytes);
    const archive = archiveWithAsset(asset);
    const storage = chunkedReadOnlyStorage(asset, assetBytes, 64 * 1024);
    const exportMetrics = emptyCampaignArchiveStreamMetrics();
    const importMetrics = emptyCampaignArchiveStreamMetrics();
    const limits = {
      maxMetadataBytes: 2 * 1024 * 1024,
      maxAssetBytes: 5 * 1024 * 1024,
      maxEmbeddedAssetBytes: 5 * 1024 * 1024,
    };

    const parsed = await parseCampaignArchiveStream(
      createCampaignArchiveStream(archive, storage, limits, exportMetrics),
      limits,
      importMetrics,
    );
    try {
      const placeholder = parsed.archiveWithStagedFilePlaceholders().files?.[0];
      expect(placeholder).toMatchObject({
        assetId: asset.id,
        sizeBytes: assetBytes.length,
        checksum: asset.checksum,
      });
      expect(placeholder?.data).toBe("otte-archive-stream-file:0");
      const staged = parsed.claimStagedFiles();
      expect(sha256(readFileSync(staged.files[0]!.bodyPath))).toBe(sha256(assetBytes));
      // The framed path has no encoded-asset accumulator. Both directions cap
      // owned chunks at 64 KiB while moving a fixture over sixty times larger.
      expect(exportMetrics.assetBytes).toBe(assetBytes.length);
      expect(importMetrics.assetBytes).toBe(assetBytes.length);
      expect(exportMetrics.maxAssetChunkBytes).toBe(64 * 1024);
      expect(importMetrics.maxAssetChunkBytes).toBe(64 * 1024);
      expect(importMetrics.maxInputChunkBytes).toBe(64 * 1024);
      expect(importMetrics.maxParserBufferedBytes).toBe(64 * 1024);
      expect(Math.max(exportMetrics.maxAssetChunkBytes, importMetrics.maxParserBufferedBytes)).toBeLessThan(assetBytes.length / 32);
      rmSync(staged.stagingDirectory, { recursive: true, force: true });
    } finally {
      await parsed.cleanup();
    }
  }, 20_000);

  it("round-trips a near-limit asset through the streaming API without base64 expansion", async () => {
    const previousEmbeddedLimit = process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES;
    process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES = String(2 * 1024 * 1024);
    const sourceUploadDir = mkdtempSync(join(tmpdir(), "otte-stream-source-"));
    const targetUploadDir = mkdtempSync(join(tmpdir(), "otte-stream-target-"));
    const sourceStore = new MemoryStateStore();
    const sourceApp = await buildApp({ store: sourceStore, uploadDir: sourceUploadDir });
    const assetBytes = Buffer.alloc(2 * 1024 * 1024 - 3, 0x61);

    try {
      const uploaded = await sourceApp.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "idempotency-key": "stream-near-limit-upload",
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Streaming Recovery Map.png"),
        },
        payload: assetBytes,
      });
      expect(uploaded.statusCode).toBe(200);
      const asset = uploaded.json().asset as MapAsset;

      const exported = await sourceApp.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export/stream",
        headers: authHeaders,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.headers["content-type"]).toContain(CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE);
      // Framing overhead is small and the raw payload remains materially below
      // the 4/3 base64 expansion of the legacy JSON representation.
      expect(exported.rawPayload.length).toBeLessThan(assetBytes.length * 1.1);

      const regenerated = await sourceApp.inject({
        method: "POST",
        url: "/api/v1/import/campaign/stream?regenerateIds=true",
        headers: {
          ...authHeaders,
          "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
          "idempotency-key": "stream-regenerate-import",
        },
        payload: exported.rawPayload,
      });
      expect(regenerated.statusCode).toBe(200);
      const regeneratedCampaignId = regenerated.json().importedCampaignIds[0] as string;
      expect(regeneratedCampaignId).not.toBe("camp_demo");
      const regeneratedAsset = sourceStore.state.assets.find((candidate) => candidate.campaignId === regeneratedCampaignId);
      expect(regeneratedAsset).toBeDefined();
      expect(sha256(readFileSync(join(sourceUploadDir, regeneratedCampaignId, `${regeneratedAsset!.id}.png`)))).toBe(sha256(assetBytes));

      const targetState: EngineState = emptyState();
      targetState.users.push({
        id: "usr_demo_gm",
        displayName: "Streaming Recovery GM",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      });
      const targetStore = new MemoryStateStore(targetState);
      const targetApp = await buildApp({ store: targetStore, uploadDir: targetUploadDir });
      try {
        const imported = await targetApp.inject({
          method: "POST",
          url: "/api/v1/import/campaign/stream",
          headers: {
            ...authHeaders,
            "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
            "idempotency-key": "stream-near-limit-import",
          },
          payload: exported.rawPayload,
        });
        expect(imported.statusCode).toBe(200);
        expect(imported.json()).toMatchObject({ assetFiles: 1, importedCampaignIds: ["camp_demo"] });
        expect(targetStore.state.assets.find((candidate) => candidate.id === asset.id)).toMatchObject({
          id: asset.id,
          sizeBytes: assetBytes.length,
          checksum: asset.checksum,
        });
        expect(sha256(readFileSync(join(targetUploadDir, "camp_demo", `${asset.id}.png`)))).toBe(sha256(assetBytes));

        const replayed = await targetApp.inject({
          method: "POST",
          url: "/api/v1/import/campaign/stream",
          headers: {
            ...authHeaders,
            "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
            "idempotency-key": "stream-near-limit-import",
          },
          payload: exported.rawPayload,
        });
        expect(replayed.statusCode).toBe(200);
        expect(replayed.headers["idempotency-replayed"]).toBe("true");
      } finally {
        await targetApp.close();
      }
    } finally {
      await sourceApp.close();
      rmSync(sourceUploadDir, { recursive: true, force: true });
      rmSync(targetUploadDir, { recursive: true, force: true });
      if (previousEmbeddedLimit === undefined) delete process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES;
      else process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES = previousEmbeddedLimit;
    }
  }, 20_000);

  it("requires, advances, and replays the exact existing-campaign revision for stream imports", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const exported = await app.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export/stream",
        headers: authHeaders,
      });
      expect(exported.statusCode).toBe(200);
      const campaign = store.state.campaigns.find((candidate) => candidate.id === "camp_demo")!;
      const expectedUpdatedAt = campaign.updatedAt;

      const missing = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign/stream",
        headers: streamImportHeaders("stream-import-missing-revision"),
        payload: exported.rawPayload,
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().message).toContain("Campaign import expectedUpdatedAt must be a valid date-time");
      expect(store.state.campaigns.find((candidate) => candidate.id === campaign.id)?.updatedAt).toBe(expectedUpdatedAt);

      const stale = await app.inject({
        method: "POST",
        url: `/api/v1/import/campaign/stream?expectedUpdatedAt=${encodeURIComponent("2000-01-01T00:00:00.000Z")}`,
        headers: streamImportHeaders("stream-import-stale-revision"),
        payload: exported.rawPayload,
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        code: "stale_write",
        resourceType: "campaign",
        resourceId: campaign.id,
        currentUpdatedAt: expectedUpdatedAt,
      });

      const importUrl = `/api/v1/import/campaign/stream?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`;
      const auditCount = store.state.auditLogs.filter((entry) => entry.action === "campaign.import").length;
      const imported = await app.inject({
        method: "POST",
        url: importUrl,
        headers: streamImportHeaders("stream-import-exact-revision"),
        payload: exported.rawPayload,
      });
      expect(imported.statusCode).toBe(200);
      const advancedUpdatedAt = store.state.campaigns.find((candidate) => candidate.id === campaign.id)!.updatedAt;
      expect(advancedUpdatedAt).not.toBe(expectedUpdatedAt);
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.import")).toHaveLength(auditCount + 1);

      const replayed = await app.inject({
        method: "POST",
        url: importUrl,
        headers: streamImportHeaders("stream-import-exact-revision"),
        payload: exported.rawPayload,
      });
      expect(replayed.statusCode).toBe(200);
      expect(replayed.headers["idempotency-replayed"]).toBe("true");
      expect(replayed.body).toBe(imported.body);
      expect(store.state.campaigns.find((candidate) => candidate.id === campaign.id)?.updatedAt).toBe(advancedUpdatedAt);
      expect(store.state.auditLogs.filter((entry) => entry.action === "campaign.import")).toHaveLength(auditCount + 1);
    } finally {
      await app.close();
    }
  });

  it("rejects a stream import spanning multiple existing campaigns before mutation", async () => {
    const store = new MemoryStateStore();
    const firstCampaign = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!;
    const secondCampaign = {
      ...structuredClone(firstCampaign),
      id: "camp_stream_second_existing",
      name: "Second existing stream campaign",
    };
    const firstMembership = store.state.members.find((member) => member.campaignId === firstCampaign.id && member.userId === "usr_demo_gm")!;
    store.state.campaigns.push(secondCampaign);
    store.state.members.push({
      ...structuredClone(firstMembership),
      id: "mem_stream_second_existing_gm",
      campaignId: secondCampaign.id,
    });
    const data = emptyState();
    data.campaigns.push(structuredClone(firstCampaign), structuredClone(secondCampaign));
    const archive: CampaignArchive = {
      format: "ottx",
      version: "0.2.0",
      exportedAt: "2026-07-13T00:00:00.000Z",
      manifest: {
        campaignId: firstCampaign.id,
        name: "Multiple existing campaigns",
        schemaVersion: "0.2.0",
        assetCount: 0,
        assetFileCount: 0,
      },
      data,
    };
    const payload = await encodedArchiveStream(archive);
    const app = await buildApp({ store });
    const before = structuredClone(store.state);
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/import/campaign/stream?expectedUpdatedAt=${encodeURIComponent(firstCampaign.updatedAt)}`,
        headers: streamImportHeaders("stream-import-multiple-existing"),
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Import one existing campaign at a time");
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...before, auditLogs: [] });
    } finally {
      await app.close();
    }
  });

  it("rejects a corrupted digest before state or object mutation", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-stream-corrupt-"));
    const sourceBytes = Buffer.from("framed checksum boundary");
    const sourceAsset = archiveAsset("asset_stream_corrupt", sourceBytes);
    const limits = { maxMetadataBytes: 1024 * 1024, maxAssetBytes: 1024 * 1024, maxEmbeddedAssetBytes: 1024 * 1024 };
    const encodedChunks: Buffer[] = [];
    for await (const chunk of createCampaignArchiveStream(archiveWithAsset(sourceAsset), chunkedReadOnlyStorage(sourceAsset, sourceBytes, 7), limits)) {
      encodedChunks.push(Buffer.from(chunk));
    }
    const corrupted = Buffer.concat(encodedChunks);
    const digestByteIndex = corrupted.length - 5;
    corrupted[digestByteIndex] = corrupted[digestByteIndex]! ^ 0xff;

    const state: EngineState = emptyState();
    state.users.push({ id: "usr_demo_gm", displayName: "GM", createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z" });
    const store = new MemoryStateStore(state);
    const app = await buildApp({ store, uploadDir });
    const before = structuredClone(store.state);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign/stream",
        headers: {
          ...authHeaders,
          "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
          "idempotency-key": "stream-corrupt-import",
        },
        payload: corrupted,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("checksum mismatch");
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...before, auditLogs: [] });
      expect(existsSync(join(uploadDir, "camp_stream", `${sourceAsset.id}.png`))).toBe(false);
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});

function archiveAsset(id: string, bytes: Buffer): MapAsset {
  return {
    id,
    campaignId: "camp_stream",
    name: `${id}.png`,
    url: `/api/v1/assets/${id}/blob`,
    mimeType: "image/png",
    sizeBytes: bytes.length,
    checksum: sha256(bytes),
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function streamImportHeaders(idempotencyKey: string): Record<string, string> {
  return {
    ...authHeaders,
    "content-type": CAMPAIGN_ARCHIVE_STREAM_CONTENT_TYPE,
    "idempotency-key": idempotencyKey,
  };
}

async function encodedArchiveStream(archive: CampaignArchive): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of createCampaignArchiveStream(archive, emptyArchiveStorage(), {
    maxMetadataBytes: 1024 * 1024,
    maxAssetBytes: 1024 * 1024,
    maxEmbeddedAssetBytes: 1024 * 1024,
  })) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function emptyArchiveStorage(): AssetStorage {
  return {
    provider: "local",
    async put(): Promise<AssetStorageRef> {
      throw new Error("asset-free archive must not write objects while encoding");
    },
    async read(): Promise<Buffer | undefined> {
      return undefined;
    },
    async stream(): Promise<NodeJS.ReadableStream | undefined> {
      return undefined;
    },
    async delete(): Promise<boolean> {
      return false;
    },
  };
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function archiveWithAsset(asset: MapAsset): CampaignArchive {
  const data = emptyState();
  data.assets.push(asset);
  return {
    format: "ottx",
    version: "0.2.0",
    exportedAt: "2026-07-13T00:00:00.000Z",
    manifest: {
      campaignId: asset.campaignId,
      name: "Streaming envelope",
      schemaVersion: "0.2.0",
      assetCount: 1,
    },
    data,
  };
}

function chunkedReadOnlyStorage(asset: MapAsset, bytes: Buffer, chunkBytes: number): AssetStorage {
  return {
    provider: "local",
    async put(): Promise<AssetStorageRef> {
      throw new Error("read-only test storage");
    },
    async read(): Promise<Buffer | undefined> {
      throw new Error("bounded stream export must not use whole-buffer reads");
    },
    async stream(candidate): Promise<NodeJS.ReadableStream | undefined> {
      if (candidate.id !== asset.id) return undefined;
      return Readable.from((async function* () {
        for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
          yield bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes));
        }
      })());
    },
    async delete(): Promise<boolean> {
      return false;
    },
  };
}
