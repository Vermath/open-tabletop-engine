import { parseUniversalVtt, UNIVERSAL_VTT_LIMITS, type UniversalVttPlan } from "@open-tabletop/core";
import { applyAuthoritativeScene } from "./active-scene-state.js";
import type { Snapshot, UniversalVttImportResult } from "./api.js";

export interface UniversalVttReview {
  sourceFileName: string;
  document: string;
  plan: UniversalVttPlan;
  previewUrl: string;
}

export interface UniversalVttImageDimensions {
  width: number;
  height: number;
}

type ImageDecoder = (source: string, signal: AbortSignal) => Promise<UniversalVttImageDimensions>;

export function universalVttSceneName(fileName: string): string {
  return fileName.replace(/\.(?:uvtt|dd2vtt|df2vtt)$/i, "").trim().slice(0, 160) || "Imported map";
}

export function decodeUniversalVttImage(source: string, signal: AbortSignal): Promise<UniversalVttImageDimensions> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      image.src = "";
      reject(signal.reason ?? new DOMException("Map review cancelled", "AbortError"));
    };
    image.onload = () => {
      cleanup();
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("The embedded map image could not be opened. Export the map again with a PNG or WebP image."));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.src = source;
  });
}

export async function reviewUniversalVttFile(
  file: Pick<File, "name" | "size" | "text">,
  signal: AbortSignal,
  decodeImage: ImageDecoder = decodeUniversalVttImage
): Promise<UniversalVttReview> {
  signal.throwIfAborted();
  if (!/\.(?:uvtt|dd2vtt|df2vtt)$/i.test(file.name)) {
    throw new Error("Choose a .uvtt, .dd2vtt, or .df2vtt file exported by your map editor.");
  }
  if (file.name.length > 255) throw new Error("The file name must be 255 characters or shorter.");
  if (file.size > UNIVERSAL_VTT_LIMITS.documentBytes) throw new Error("Universal VTT files must be 8 MiB or smaller.");
  if (file.size === 0) throw new Error("This file is empty. Choose an exported Universal VTT map.");
  const document = await file.text();
  signal.throwIfAborted();
  if (new TextEncoder().encode(document).byteLength > UNIVERSAL_VTT_LIMITS.documentBytes) {
    throw new Error("Universal VTT files must be 8 MiB or smaller.");
  }
  const plan = parseUniversalVtt(document);
  const previewUrl = `data:${plan.image.contentType};base64,${plan.image.dataBase64}`;
  const decoded = await decodeImage(previewUrl, signal);
  signal.throwIfAborted();
  if (decoded.width !== plan.width || decoded.height !== plan.height) {
    throw new Error("The embedded map image dimensions do not match the map resolution. Export the map again before importing.");
  }
  return { sourceFileName: file.name, document, plan, previewUrl };
}

/**
 * Folds a completed import into the loaded snapshot without overwriting any
 * campaign, scene or asset revision that is already newer than the result.
 */
export function mergeUniversalVttImportResult(current: Pick<Snapshot, "campaigns" | "scenes" | "assets">, result: UniversalVttImportResult): Pick<Snapshot, "campaigns" | "scenes" | "assets"> {
  return {
    campaigns: current.campaigns.map((campaign) => campaign.id === result.scene.campaignId && campaign.updatedAt < result.campaignUpdatedAt
      ? { ...campaign, updatedAt: result.campaignUpdatedAt } : campaign),
    scenes: current.scenes.some((scene) => scene.id === result.scene.id && scene.updatedAt > result.scene.updatedAt)
      ? current.scenes : applyAuthoritativeScene(current.scenes, result.scene),
    assets: current.assets.some((asset) => asset.id === result.asset.id)
      ? current.assets.map((asset) => asset.id === result.asset.id && asset.updatedAt <= result.asset.updatedAt ? result.asset : asset)
      : [...current.assets, result.asset]
  };
}
