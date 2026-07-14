import { createHash } from "node:crypto";

import type { AssetImageMetadata, AssetRenditionKind, MapAsset } from "@open-tabletop/core";
import sharp from "sharp";

export interface BuiltAssetRendition {
  kind: AssetRenditionKind;
  mimeType: "image/webp";
  sizeBytes: number;
  checksum: string;
  width: number;
  height: number;
  body: Buffer;
}

export interface AssetRenditionBuildWarning {
  code: "unsupported_mime" | "invalid_image" | "rendition_failed";
  message: string;
}

export interface AssetRenditionBuildResult {
  image?: AssetImageMetadata;
  renditions: BuiltAssetRendition[];
  warnings: AssetRenditionBuildWarning[];
}

const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const maxInputPixels = 40_000_000;
const thumbnailMaxPixels = 320;
const optimizedMaxPixels = 2_048;

/**
 * Builds bounded, rebuildable derivatives. Failure never changes the authoritative original upload.
 */
export async function buildAssetImageRenditions(
  source: Pick<MapAsset, "mimeType" | "name">,
  body: Buffer
): Promise<AssetRenditionBuildResult> {
  if (!supportedMimeTypes.has(source.mimeType)) {
    return { renditions: [], warnings: [{ code: "unsupported_mime", message: `${source.mimeType} does not use image renditions.` }] };
  }
  try {
    const metadata = await imagePipeline(body).metadata();
    if (!metadata.width || !metadata.height) {
      return { renditions: [], warnings: [{ code: "invalid_image", message: `${source.name} has no readable image dimensions.` }] };
    }
    const rotated = orientationSwapsDimensions(metadata.orientation);
    const image: AssetImageMetadata = {
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      ...(typeof metadata.pages === "number" && metadata.pages > 1 ? { animated: true } : {})
    };
    const thumbnail = await buildWebpRendition(body, "thumbnail", thumbnailMaxPixels, 78);
    const renditions: BuiltAssetRendition[] = [thumbnail];
    const shouldOptimize = image.width > optimizedMaxPixels || image.height > optimizedMaxPixels || body.length >= 512 * 1024;
    if (shouldOptimize) {
      const optimized = await buildWebpRendition(body, "optimized", optimizedMaxPixels, 82);
      // Keep compression honest: a cache that is not smaller than the source has no product value.
      if (optimized.sizeBytes + 4_096 < body.length && optimized.sizeBytes <= Math.floor(body.length * 0.95)) renditions.push(optimized);
    }
    return { image, renditions, warnings: [] };
  } catch (error) {
    return {
      renditions: [],
      warnings: [{
        code: error instanceof Error && /pixel limit/i.test(error.message) ? "invalid_image" : "rendition_failed",
        message: `Could not build bounded image renditions for ${source.name}. The original remains available.`
      }]
    };
  }
}

function imagePipeline(body: Buffer) {
  return sharp(body, { failOn: "warning", limitInputPixels: maxInputPixels, animated: false }).rotate();
}

async function buildWebpRendition(body: Buffer, kind: AssetRenditionKind, maxPixels: number, quality: number): Promise<BuiltAssetRendition> {
  const output = await imagePipeline(body)
    .resize({ width: maxPixels, height: maxPixels, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  return {
    kind,
    mimeType: "image/webp",
    sizeBytes: output.data.length,
    checksum: `sha256:${createHash("sha256").update(output.data).digest("hex")}`,
    width: output.info.width,
    height: output.info.height,
    body: output.data
  };
}

function orientationSwapsDimensions(orientation: number | undefined): boolean {
  return orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
}
