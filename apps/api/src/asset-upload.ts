import { randomUUID } from "node:crypto";
import { createTimestamped, nowIso, type MapAsset } from "@open-tabletop/core";
import { checksumForBuffer } from "./archive-operations.js";
import { assetQuotaExceeded, defaultAssetLifecycle, isAssetDeliverable, scanUploadedAsset } from "./asset-operations.js";
import { buildAssetImageRenditions, type AssetRenditionBuildWarning } from "./asset-renditions.js";
import type { AssetStorage } from "./asset-storage.js";
import type { CampaignWebhookTransport } from "./campaign-webhooks.js";
import type { StateStore } from "./store.js";

export class AssetUploadError extends Error {
  constructor(readonly statusCode: number, readonly payload: { error: string; message: string; [key: string]: unknown }) {
    super(payload.message);
  }
}

/** Uses the normal upload security, decoding, deduplication, and quota services. */
export async function prepareUploadedAsset(input: {
  store: StateStore;
  storage: AssetStorage;
  maxAssetBytes: number;
  scannerTransport?: CampaignWebhookTransport;
  campaignId: string;
  name: string;
  mimeType: string;
  body: Buffer;
  requiredImageDimensions: { width: number; height: number };
  beforeObjectWrite(asset: MapAsset): void;
}): Promise<{ asset: MapAsset; deduplicated: boolean; renditionWarnings: AssetRenditionBuildWarning[] }> {
  const { store, storage, campaignId, name, mimeType, body } = input;
  if (!body.length) throw new AssetUploadError(400, { error: "empty_upload", message: "Asset upload body is empty" });
  if (body.length > input.maxAssetBytes) throw new AssetUploadError(413, { error: "asset_too_large", message: `Asset exceeds ${input.maxAssetBytes} bytes` });
  const scan = await scanUploadedAsset(body, mimeType, name, { externalTransport: input.scannerTransport });
  if (scan.blocked) throw new AssetUploadError(422, { error: "asset_security_blocked", message: "Asset upload failed security scan", scanner: scan.scanner, findings: scan.findings });
  const checksum = checksumForBuffer(body);
  const duplicate = store.state.assets.find((asset) => asset.campaignId === campaignId && asset.checksum === checksum && asset.sizeBytes === body.length && asset.mimeType === mimeType && asset.lifecycle?.status !== "archived" && asset.lifecycle?.status !== "deleted" && asset.security?.status === "clean" && Boolean(asset.storage) && isAssetDeliverable(asset) && asset.image?.width === input.requiredImageDimensions.width && asset.image?.height === input.requiredImageDimensions.height);
  if (duplicate) {
    const original = await storage.read(duplicate);
    if (original?.equals(body)) return { asset: duplicate, deduplicated: true, renditionWarnings: [] };
  }
  const built = await buildAssetImageRenditions({ mimeType, name }, body);
  if (!built.image || !built.renditions.length || built.image.animated || built.image.width !== input.requiredImageDimensions.width || built.image.height !== input.requiredImageDimensions.height) {
    throw new AssetUploadError(400, { error: "invalid_universal_vtt_image", message: "Embedded map image must decode successfully and match the imported scene dimensions." });
  }
  const quota = assetQuotaExceeded(store, campaignId, body.length + built.renditions.reduce((total, rendition) => total + rendition.sizeBytes, 0));
  if (quota) throw new AssetUploadError(413, quota);
  const asset: MapAsset = { ...createTimestamped("asset", { campaignId, name, url: "", mimeType, sizeBytes: body.length, checksum, tags: [], lifecycle: defaultAssetLifecycle(), security: scan.security, image: built.image }), id: `asset_${randomUUID()}` };
  const renditions = built.renditions.map((rendition) => ({ rendition, asset: { ...asset, id: `${asset.id}_${rendition.kind}`, name: `${asset.name} (${rendition.kind})`, mimeType: rendition.mimeType, sizeBytes: rendition.sizeBytes, checksum: rendition.checksum, image: { width: rendition.width, height: rendition.height } } satisfies MapAsset }));
  // Check every destination before the first write. Reused IDs or orphaned
  // provider objects must never be overwritten by a new map import.
  for (const target of [asset, ...renditions.map((entry) => entry.asset)]) {
    if (store.state.assets.some((existing) => existing.id === target.id) || await storage.read(target) !== undefined) {
      throw new AssetUploadError(409, { error: "asset_destination_collision", message: "A generated map asset destination already exists. Retry the import." });
    }
  }
  input.beforeObjectWrite(asset);
  asset.storage = await storage.put(asset, body);
  asset.renditions = [];
  for (const entry of renditions) {
    input.beforeObjectWrite(entry.asset);
    entry.asset.storage = await storage.put(entry.asset, entry.rendition.body);
    asset.renditions.push({ kind: entry.rendition.kind, mimeType: entry.rendition.mimeType, sizeBytes: entry.rendition.sizeBytes, checksum: entry.rendition.checksum, width: entry.rendition.width, height: entry.rendition.height, storage: entry.asset.storage, createdAt: nowIso() });
  }
  asset.url = `/api/v1/assets/${asset.id}/blob`;
  return { asset, deduplicated: false, renditionWarnings: built.warnings };
}
