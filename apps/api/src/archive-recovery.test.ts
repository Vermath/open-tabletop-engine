import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState, type AssetStorageRef, type CampaignArchive, type EngineState, type MapAsset } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { ArchiveAssetRestoreAbortedError, restoreArchivedAssetFiles, type ArchiveAssetRestoreTransaction } from "./archive-asset-restore.js";
import { assetStorageKey, type AssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

const authHeaders = { "x-user-id": "usr_demo_gm" };

describe("campaign archive recovery", () => {
  it("round-trips an asset-bearing archive just below the configured embedded-byte limit", async () => {
    const previousEmbeddedLimit = process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES;
    process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES = String(2 * 1024 * 1024);
    const sourceUploadDir = mkdtempSync(join(tmpdir(), "otte-large-archive-source-"));
    const targetUploadDir = mkdtempSync(join(tmpdir(), "otte-large-archive-target-"));
    const sourceApp = await buildApp({ store: new MemoryStateStore(), uploadDir: sourceUploadDir });
    // Non-multiple-of-three size exercises base64 carry/padding at 99.99% of
    // the configured aggregate limit without requiring a production-sized fixture.
    const assetBytes = Buffer.alloc(2 * 1024 * 1024 - 2, 0x61);

    try {
      const uploaded = await sourceApp.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: {
          ...authHeaders,
          "idempotency-key": "near-limit-archive-asset-upload",
          "content-type": "image/png",
          "x-asset-name": encodeURIComponent("Large Recovery Map.png")
        },
        payload: assetBytes
      });
      expect(uploaded.statusCode).toBe(200);
      const asset = uploaded.json().asset as MapAsset;

      const exported = await sourceApp.inject({
        method: "GET",
        url: "/api/v1/campaigns/camp_demo/export",
        headers: authHeaders
      });
      expect(exported.statusCode).toBe(200);
      expect(Buffer.byteLength(exported.body, "utf8")).toBeGreaterThan(1024 * 1024);

      const targetState: EngineState = emptyState();
      targetState.users.push({
        id: "usr_demo_gm",
        displayName: "Recovery GM",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z"
      });
      const targetStore = new MemoryStateStore(targetState);
      const targetApp = await buildApp({ store: targetStore, uploadDir: targetUploadDir });
      try {
        const imported = await targetApp.inject({
          method: "POST",
          url: "/api/v1/import/campaign",
          headers: authHeaders,
          payload: exported.json()
        });
        expect(imported.statusCode).toBe(200);
        expect(imported.json()).toMatchObject({ assetFiles: 1, importedCampaignIds: ["camp_demo"] });
        expect(targetStore.state.assets.find((candidate) => candidate.id === asset.id)).toEqual(
          expect.objectContaining({ id: asset.id, sizeBytes: assetBytes.length })
        );
        expect(readFileSync(join(targetUploadDir, "camp_demo", `${asset.id}.png`))).toEqual(assetBytes);
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

  it.each([
    ["campaign", "campaigns", { id: "camp_malformed" }],
    ["actor", "actors", { id: "act_malformed", createdAt: "2026-07-12T00:00:00.000Z", updatedAt: "2026-07-12T00:00:00.000Z" }]
  ])("rejects an id-only or structurally incomplete %s record before state or object mutation", async (_label, collection, malformedRecord) => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-malformed-archive-"));
    const store = new MemoryStateStore();
    const app = await buildApp({ store, uploadDir });
    const beforeState = structuredClone(store.state);
    const assetBytes = Buffer.from("must-not-be-restored");
    const assetId = "asset_malformed_archive_guard";
    const checksum = `sha256:${createHash("sha256").update(assetBytes).digest("hex")}`;
    const data = emptyState() as unknown as Record<string, unknown[]>;
    data.assets = [{
      id: assetId,
      campaignId: "camp_demo",
      name: "Mutation guard",
      url: `/api/v1/assets/${assetId}/blob`,
      mimeType: "image/png",
      sizeBytes: assetBytes.length,
      checksum,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    }];
    data[collection] = [malformedRecord];
    const archive = {
      format: "ottx",
      version: "0.2.0",
      exportedAt: "2026-07-12T00:00:00.000Z",
      manifest: {
        campaignId: collection === "campaigns" ? "camp_malformed" : "camp_demo",
        name: "Malformed archive",
        schemaVersion: "0.2.0",
        assetCount: 1,
        assetFileCount: 1
      },
      data,
      files: [{
        assetId,
        name: "Mutation guard.png",
        mimeType: "image/png",
        sizeBytes: assetBytes.length,
        checksum,
        encoding: "base64",
        data: assetBytes.toString("base64")
      }]
    } as unknown as CampaignArchive;

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: authHeaders,
        payload: archive
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain(`Campaign archive ${collection} record`);
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(existsSync(join(uploadDir, "camp_demo", `${assetId}.png`))).toBe(false);
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("rejects checksum-mismatched embedded bytes before state or object mutation", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-checksum-archive-"));
    const store = new MemoryStateStore();
    const app = await buildApp({ store, uploadDir });
    const beforeState = structuredClone(store.state);
    const expectedBytes = Buffer.from("expected-archive-bytes");
    const corruptedBytes = Buffer.from("corrupt!-archive-bytes");
    const assetId = "asset_checksum_archive_guard";
    const checksum = `sha256:${createHash("sha256").update(expectedBytes).digest("hex")}`;
    const data = emptyState();
    data.assets.push({
      id: assetId,
      campaignId: "camp_demo",
      name: "Checksum mutation guard",
      url: `/api/v1/assets/${assetId}/blob`,
      mimeType: "image/png",
      sizeBytes: expectedBytes.length,
      checksum,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    });
    const archive: CampaignArchive = {
      format: "ottx",
      version: "0.2.0",
      exportedAt: "2026-07-12T00:00:00.000Z",
      manifest: { campaignId: "camp_demo", name: "Checksum guard", schemaVersion: "0.2.0", assetCount: 1, assetFileCount: 1 },
      data,
      files: [{
        assetId,
        name: "Checksum mutation guard.png",
        mimeType: "image/png",
        sizeBytes: expectedBytes.length,
        checksum,
        encoding: "base64",
        data: corruptedBytes.toString("base64")
      }]
    };

    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: authHeaders, payload: archive });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain(`Archive file checksum mismatch: ${assetId}`);
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(existsSync(join(uploadDir, "camp_demo", `${assetId}.png`))).toBe(false);

      const assetChecksumMismatch = structuredClone(archive);
      assetChecksumMismatch.files![0]!.checksum = `sha256:${createHash("sha256").update(corruptedBytes).digest("hex")}`;
      const metadataResponse = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: authHeaders,
        payload: assetChecksumMismatch
      });
      expect(metadataResponse.statusCode).toBe(400);
      expect(metadataResponse.json().message).toContain(`Asset metadata checksum mismatch: ${assetId}`);
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(existsSync(join(uploadDir, "camp_demo", `${assetId}.png`))).toBe(false);
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("rejects unresolved full-archive references before restoring embedded objects", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "otte-reference-archive-"));
    const store = new MemoryStateStore();
    const app = await buildApp({ store, uploadDir });
    const beforeState = structuredClone(store.state);
    const data = emptyState();
    const restorableBytes = Buffer.from("reference-validation-must-run-first");
    const restorableAssetId = "asset_reference_validation_guard";
    const restorableChecksum = `sha256:${createHash("sha256").update(restorableBytes).digest("hex")}`;
    data.assets.push({
      id: restorableAssetId,
      campaignId: "camp_demo",
      name: "Reference validation guard",
      url: `/api/v1/assets/${restorableAssetId}/blob`,
      mimeType: "image/png",
      sizeBytes: restorableBytes.length,
      checksum: restorableChecksum,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    });
    data.actors.push({
      id: "act_missing_asset_reference",
      campaignId: "camp_demo",
      systemId: "generic-fantasy",
      type: "character",
      name: "Broken portrait reference",
      imageAssetId: "asset_missing_from_archive",
      data: {},
      permissions: {},
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z"
    });
    const archive: CampaignArchive = {
      format: "ottx",
      version: "0.2.0",
      exportedAt: "2026-07-12T00:00:00.000Z",
      manifest: { campaignId: "camp_demo", name: "Broken references", schemaVersion: "0.2.0", assetCount: 1, assetFileCount: 1 },
      data,
      files: [{
        assetId: restorableAssetId,
        name: "Reference validation guard.png",
        mimeType: "image/png",
        sizeBytes: restorableBytes.length,
        checksum: restorableChecksum,
        encoding: "base64",
        data: restorableBytes.toString("base64")
      }]
    };

    try {
      const response = await app.inject({ method: "POST", url: "/api/v1/import/campaign", headers: authHeaders, payload: archive });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Actor act_missing_asset_reference references missing assets record asset_missing_from_archive");
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(existsSync(join(uploadDir, "camp_demo", `${restorableAssetId}.png`))).toBe(false);
    } finally {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("rolls back near-limit staged objects when the second provider write fails", async () => {
    const previousEmbeddedLimit = process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES;
    process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES = String(2 * 1024 * 1024);
    const store = new MemoryStateStore();
    const storage = new FaultInjectingAssetStorage();
    const fixture = archiveAtomicityFixture(store, 1024 * 1024 - 7);
    storage.seed(fixture.existingAsset, fixture.existingBytes);
    storage.failAfterPut(2);
    const app = await buildApp({ store, assetStorage: storage });
    const beforeState = structuredClone(store.state);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { ...authHeaders, "idempotency-key": "archive-atomic-provider-write-failure" },
        payload: {
          archive: fixture.archive,
          expectedUpdatedAt: beforeState.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt
        }
      });

      expect(response.statusCode).toBe(500);
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(store.state.actors.some((actor) => actor.id === fixture.importedActorId)).toBe(false);
      expect(storage.readSeeded(fixture.existingAsset)).toEqual(fixture.existingBytes);
      expect(storage.readSeeded(fixture.newAsset)).toBeUndefined();
      expect(storage.objectCount).toBe(1);
      expect(storage.putAttempts).toBe(3);
    } finally {
      await app.close();
      if (previousEmbeddedLimit === undefined) delete process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES;
      else process.env.OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES = previousEmbeddedLimit;
    }
  }, 20_000);

  it("rolls object storage and campaign state back when the durable state flush fails", async () => {
    const store = new OneShotFlushFailureStore();
    const storage = new FaultInjectingAssetStorage();
    const fixture = archiveAtomicityFixture(store);
    storage.seed(fixture.existingAsset, fixture.existingBytes);
    const app = await buildApp({ store, assetStorage: storage });
    const beforeState = structuredClone(store.state);
    // The handler's state commit succeeds. Fail the later response-time flush
    // that persists the idempotency record to prove the object journal remains
    // live until every successful-response mutation is durable.
    store.failOnFlush(2);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/import/campaign",
        headers: { ...authHeaders, "idempotency-key": "archive-atomic-flush-failure" },
        payload: {
          archive: fixture.archive,
          expectedUpdatedAt: beforeState.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt
        }
      });

      expect(response.statusCode).toBe(500);
      expect({ ...store.state, auditLogs: [] }).toEqual({ ...beforeState, auditLogs: [] });
      expect(store.state.actors.some((actor) => actor.id === fixture.importedActorId)).toBe(false);
      expect(storage.readSeeded(fixture.existingAsset)).toEqual(fixture.existingBytes);
      expect(storage.readSeeded(fixture.newAsset)).toBeUndefined();
      expect(storage.objectCount).toBe(1);
      expect(storage.putAttempts).toBe(3);
    } finally {
      await app.close();
    }
  });

  it("exposes the object journal before writes and compensates an abort that lands during a put", async () => {
    const store = new MemoryStateStore();
    const storage = new FaultInjectingAssetStorage();
    const fixture = archiveAtomicityFixture(store);
    const controller = new AbortController();
    let exposedTransaction: ArchiveAssetRestoreTransaction | undefined;
    storage.seed(fixture.existingAsset, fixture.existingBytes);
    storage.abortAfterPut(2, () => controller.abort(new Error("simulated client disconnect")));

    await expect(
      restoreArchivedAssetFiles(storage, fixture.archive, {
        signal: controller.signal,
        onTransaction: (transaction) => {
          exposedTransaction = transaction;
        }
      })
    ).rejects.toBeInstanceOf(ArchiveAssetRestoreAbortedError);

    expect(exposedTransaction).toBeDefined();
    expect(storage.readSeeded(fixture.existingAsset)).toEqual(fixture.existingBytes);
    expect(storage.readSeeded(fixture.newAsset)).toBeUndefined();
    expect(storage.objectCount).toBe(1);
  });
});

class FaultInjectingAssetStorage implements AssetStorage {
  readonly provider = "local" as const;
  readonly objects = new Map<string, Buffer>();
  putAttempts = 0;
  private failingPutAttempt?: number;
  private abortingPutAttempt?: number;
  private abortPut?: () => void;

  get objectCount(): number {
    return this.objects.size;
  }

  seed(asset: MapAsset, body: Buffer): void {
    this.objects.set(this.keyFor(asset), Buffer.from(body));
  }

  readSeeded(asset: MapAsset): Buffer | undefined {
    const body = this.objects.get(this.keyFor(asset));
    return body === undefined ? undefined : Buffer.from(body);
  }

  failAfterPut(attempt: number): void {
    this.failingPutAttempt = attempt;
  }

  abortAfterPut(attempt: number, abort: () => void): void {
    this.abortingPutAttempt = attempt;
    this.abortPut = abort;
  }

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    const key = this.keyFor(asset);
    this.putAttempts += 1;
    // Simulate the difficult provider failure: the write reached object
    // storage, but the request failed before the caller received its ref.
    this.objects.set(key, Buffer.from(body));
    if (this.putAttempts === this.abortingPutAttempt) this.abortPut?.();
    if (this.putAttempts === this.failingPutAttempt) throw new Error("injected object put failure");
    return { provider: "local", key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    return this.readSeeded(asset);
  }

  async delete(asset: MapAsset): Promise<boolean> {
    return this.objects.delete(this.keyFor(asset));
  }

  private keyFor(asset: MapAsset): string {
    return asset.storage?.provider === "local" ? asset.storage.key : assetStorageKey(asset);
  }
}

class OneShotFlushFailureStore extends MemoryStateStore {
  private failingFlushAttempt?: number;
  private flushAttempts = 0;

  failOnFlush(attempt: number): void {
    this.failingFlushAttempt = attempt;
  }

  override flush(): void {
    this.flushAttempts += 1;
    if (this.flushAttempts !== this.failingFlushAttempt) return;
    this.failingFlushAttempt = undefined;
    throw new Error("injected state flush failure");
  }

  override replace(state: EngineState, options: { flush?: boolean } = {}): void {
    super.replace(state, options);
    if (options.flush !== false) this.flush();
  }
}

function archiveAtomicityFixture(store: MemoryStateStore, stagedAssetSizeBytes?: number): {
  archive: CampaignArchive;
  existingAsset: MapAsset;
  newAsset: MapAsset;
  existingBytes: Buffer;
  importedActorId: string;
} {
  const existingBytes = Buffer.from("pre-import-object-bytes");
  const replacementBytes = stagedAssetSizeBytes === undefined ? Buffer.from("replacement-object-bytes") : Buffer.alloc(stagedAssetSizeBytes, 0x62);
  const newBytes = stagedAssetSizeBytes === undefined ? Buffer.from("new-object-bytes") : Buffer.alloc(stagedAssetSizeBytes, 0x63);
  const existingAsset = archiveAsset("asset_atomic_existing", existingBytes, "Existing archive object");
  existingAsset.storage = { provider: "local", key: assetStorageKey(existingAsset) };
  store.state.assets.push(existingAsset);
  const replacementAsset = archiveAsset(existingAsset.id, replacementBytes, "Replacement archive object");
  const newAsset = archiveAsset("asset_atomic_new", newBytes, "New archive object");
  const importedActorId = "act_atomic_import_guard";
  const data = emptyState();
  data.assets.push(replacementAsset, newAsset);
  data.actors.push({
    id: importedActorId,
    campaignId: "camp_demo",
    systemId: "generic-fantasy",
    type: "character",
    name: "Must not be partially imported",
    imageAssetId: newAsset.id,
    data: {},
    permissions: {},
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  });
  const files = [
    archiveFile(replacementAsset, replacementBytes),
    archiveFile(newAsset, newBytes)
  ];
  return {
    existingAsset,
    newAsset,
    existingBytes,
    importedActorId,
    archive: {
      format: "ottx",
      version: "0.2.0",
      exportedAt: "2026-07-12T00:00:00.000Z",
      manifest: {
        campaignId: "camp_demo",
        name: "Atomic import fixture",
        schemaVersion: "0.2.0",
        assetCount: 2,
        assetFileCount: 2
      },
      data,
      files
    }
  };
}

function archiveAsset(id: string, body: Buffer, name: string): MapAsset {
  return {
    id,
    campaignId: "camp_demo",
    name,
    url: `/api/v1/assets/${id}/blob`,
    mimeType: "image/png",
    sizeBytes: body.length,
    checksum: checksum(body),
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  };
}

function archiveFile(asset: MapAsset, body: Buffer): NonNullable<CampaignArchive["files"]>[number] {
  return {
    assetId: asset.id,
    name: `${asset.name}.png`,
    mimeType: asset.mimeType,
    sizeBytes: body.length,
    checksum: checksum(body),
    encoding: "base64",
    data: body.toString("base64")
  };
}

function checksum(body: Buffer): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}
