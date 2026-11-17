import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTimestamped, type MapAsset } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { LocalAssetStorage } from "./asset-storage.js";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { SqliteStateStore } from "./sqlite-store.js";

describe("campaign duplication durability", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("reopens an atomic copy with embedded assets and isolated owner permissions", async () => {
    const directory = mkdtempSync(join(tmpdir(), "otte-campaign-copy-"));
    directories.push(directory);
    const databasePath = join(directory, "state.sqlite");
    const uploadDirectory = join(directory, "uploads");
    const assetStorage = new LocalAssetStorage(uploadDirectory);
    const store = new SqliteStateStore(databasePath, { seedDemo: true });
    const source = store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!;
    const sourceAsset: MapAsset = createTimestamped("asset", {
      campaignId: source.id,
      name: "Copy source map",
      url: "",
      mimeType: "image/png",
      sizeBytes: 0,
      checksum: "",
      createdByUserId: "usr_demo_gm",
    });
    store.state.assets.push(sourceAsset);
    const body = Buffer.from("durable-campaign-copy-asset", "utf8");
    sourceAsset.url = `/api/v1/assets/${sourceAsset.id}/blob`;
    sourceAsset.sizeBytes = body.length;
    sourceAsset.checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    sourceAsset.storage = await assetStorage.put(sourceAsset, body);
    store.save();
    store.flush();

    const app = await buildApp({ store, assetStorage, uploadDir: uploadDirectory });
    let copiedCampaignId = "";
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/campaigns/${source.id}/duplicate`,
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "durable-campaign-copy" },
        payload: { name: "Durable Ember Vault Copy", expectedUpdatedAt: source.updatedAt },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ campaign: { name: "Durable Ember Vault Copy", ownerUserId: "usr_demo_gm" }, assetFiles: 1 });
      copiedCampaignId = response.json().campaign.id;

      const ownerSnapshot = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/${copiedCampaignId}/snapshot`,
        headers: { "x-user-id": "usr_demo_gm" },
      });
      expect(ownerSnapshot.statusCode).toBe(200);
      expect(ownerSnapshot.json().members).toEqual([
        expect.objectContaining({ userId: "usr_demo_gm", role: "owner" }),
      ]);
      expect(ownerSnapshot.json().actors.every((actor: { ownerUserId?: string }) => actor.ownerUserId === "usr_demo_gm")).toBe(true);

      const formerPlayer = await app.inject({
        method: "GET",
        url: `/api/v1/campaigns/${copiedCampaignId}/snapshot`,
        headers: { "x-user-id": "usr_demo_player" },
      });
      expect(formerPlayer.statusCode).toBe(403);
    } finally {
      await app.close();
      store.close();
    }

    const reopened = new SqliteStateStore(databasePath, { seedDemo: false });
    try {
      expect(reopened.state.campaigns).toContainEqual(expect.objectContaining({ id: copiedCampaignId, name: "Durable Ember Vault Copy" }));
      expect(reopened.state.members.filter((member) => member.campaignId === copiedCampaignId)).toEqual([
        expect.objectContaining({ userId: "usr_demo_gm", role: "owner" }),
      ]);
      expect(reopened.state.permissionGrants.filter((grant) => grant.campaignId === copiedCampaignId && grant.subjectType === "user")).toEqual([]);
      const copiedAsset = reopened.state.assets.find((asset) => asset.campaignId === copiedCampaignId)!;
      expect(await assetStorage.read(copiedAsset)).toEqual(body);
    } finally {
      reopened.close();
    }
  });
});
