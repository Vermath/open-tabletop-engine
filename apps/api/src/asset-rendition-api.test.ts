import type { AssetStorageRef, MapAsset } from "@open-tabletop/core";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildApp } from "./fixtures/legacy-build-app.js";
import type { AssetStorage } from "./asset-storage.js";
import { MemoryStateStore } from "./store.js";

class MemoryAssetStorage implements AssetStorage {
  readonly provider = "local" as const;
  readonly bodies = new Map<string, Buffer>();
  putCalls = 0;

  async put(asset: MapAsset, body: Buffer): Promise<AssetStorageRef> {
    this.putCalls += 1;
    const key = `${asset.campaignId}/${asset.id}`;
    this.bodies.set(key, Buffer.from(body));
    return { provider: "local", key };
  }

  async read(asset: MapAsset): Promise<Buffer | undefined> {
    const body = asset.storage ? this.bodies.get(asset.storage.key) : undefined;
    return body ? Buffer.from(body) : undefined;
  }

  async delete(asset: MapAsset): Promise<boolean> {
    return asset.storage ? this.bodies.delete(asset.storage.key) : false;
  }
}

const headers = { "x-user-id": "usr_demo_gm", "content-type": "image/png", "x-asset-name": "Large Map.png" };

describe("asset thumbnail, compression, and deduplication API", () => {
  // Sharp rendition work contends for CPU during the full-suite shared-process run.
  it("persists bounded renditions, serves them permission-safely, and reuses exact uploads", async () => {
    const source = await sharp({
      create: { width: 2_200, height: 1_320, channels: 4, background: { r: 90, g: 40, b: 10, alpha: 1 } }
    }).png({ compressionLevel: 0 }).toBuffer();
    const storage = new MemoryAssetStorage();
    const store = new MemoryStateStore();
    const app = await buildApp({ store, assetStorage: storage });
    try {
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: { ...headers, "idempotency-key": "asset-rendition-upload-original" },
        payload: source
      });
      expect(uploaded.statusCode).toBe(200);
      expect(uploaded.json()).toMatchObject({
        deduplicated: false,
        renditionWarnings: [],
        asset: {
          image: { width: 2_200, height: 1_320 },
          renditions: [
            { kind: "thumbnail", mimeType: "image/webp", width: 320, height: 192 },
            { kind: "optimized", mimeType: "image/webp", width: 2_048, height: 1_229 }
          ]
        }
      });
      const asset = store.state.assets.find((candidate) => candidate.id === uploaded.json().asset.id)!;
      expect(storage.putCalls).toBe(3);

      const thumbnail = await app.inject({
        method: "GET",
        url: `/api/v1/assets/${asset.id}/blob?variant=thumbnail`,
        headers: { "x-user-id": "usr_demo_gm" }
      });
      expect(thumbnail.statusCode).toBe(200);
      expect(thumbnail.headers["content-type"]).toContain("image/webp");
      expect(await sharp(thumbnail.rawPayload).metadata()).toMatchObject({ width: 320, height: 192 });

      const second = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true&expectedSceneUpdatedAt=${encodeURIComponent(store.state.scenes.find((scene) => scene.id === "scn_vault_entry")!.updatedAt)}`,
        headers: { ...headers, "idempotency-key": "asset-rendition-upload-deduplicated" },
        payload: source
      });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ deduplicated: true, asset: { id: asset.id }, scene: { backgroundAssetId: asset.id } });
      expect(storage.putCalls).toBe(3);
      expect(store.state.assets.filter((candidate) => candidate.checksum === asset.checksum)).toHaveLength(1);
      expect(store.state.auditLogs.map((log) => log.action)).toContain("asset.uploadDeduplicated");

      const storageInfo = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/assets/storage", headers: { "x-user-id": "usr_demo_gm" } });
      expect(storageInfo.statusCode).toBe(200);
      const expectedStoredBytes = asset.sizeBytes + asset.renditions!.reduce((total, rendition) => total + rendition.sizeBytes, 0);
      expect(storageInfo.json()).toMatchObject({ usedBytes: expectedStoredBytes, allBytes: expectedStoredBytes });
    } finally {
      await app.close();
    }
  }, 60_000);

  it("falls back to the authoritative original when a rebuildable rendition is missing", async () => {
    const source = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#224466" } }).png().toBuffer();
    const storage = new MemoryAssetStorage();
    const store = new MemoryStateStore();
    const app = await buildApp({ store, assetStorage: storage });
    try {
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/assets/upload",
        headers: { ...headers, "idempotency-key": "asset-rendition-upload-fallback" },
        payload: source
      });
      const asset = store.state.assets.find((candidate) => candidate.id === uploaded.json().asset.id)!;
      const thumbnail = asset.renditions!.find((rendition) => rendition.kind === "thumbnail")!;
      storage.bodies.delete(thumbnail.storage.key);

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/assets/${asset.id}/blob?variant=thumbnail`,
        headers: { "x-user-id": "usr_demo_gm" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-otte-rendition-fallback"]).toBe("original");
      expect(response.headers["content-type"]).toContain("image/png");
      expect(response.rawPayload).toEqual(source);
    } finally {
      await app.close();
    }
  });
});
