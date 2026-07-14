import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildAssetImageRenditions } from "./asset-renditions.js";

describe("asset image renditions", () => {
  it("creates a bounded thumbnail and a smaller optimized rendition for a large image", async () => {
    const source = await sharp({
      create: { width: 3_000, height: 1_800, channels: 4, background: { r: 120, g: 80, b: 40, alpha: 1 } }
    }).png({ compressionLevel: 0 }).toBuffer();

    const result = await buildAssetImageRenditions({ name: "Large map", mimeType: "image/png" }, source);

    expect(result.warnings).toEqual([]);
    expect(result.image).toEqual({ width: 3_000, height: 1_800 });
    expect(result.renditions.map((rendition) => rendition.kind)).toEqual(["thumbnail", "optimized"]);
    expect(result.renditions[0]).toMatchObject({ mimeType: "image/webp", width: 320, height: 192 });
    expect(result.renditions[1]).toMatchObject({ mimeType: "image/webp", width: 2_048, height: 1_229 });
    expect(result.renditions[1]!.sizeBytes).toBeLessThan(source.length);
    expect(result.renditions.every((rendition) => /^sha256:[a-f0-9]{64}$/.test(rendition.checksum))).toBe(true);
  });

  it("does not upscale small images or create fake compression savings", async () => {
    const source = await sharp({
      create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } }
    }).webp().toBuffer();

    const result = await buildAssetImageRenditions({ name: "Token", mimeType: "image/webp" }, source);

    expect(result.image).toEqual({ width: 64, height: 48 });
    expect(result.renditions).toHaveLength(1);
    expect(result.renditions[0]).toMatchObject({ kind: "thumbnail", width: 64, height: 48 });
  });

  it("fails safely for malformed image bytes", async () => {
    const result = await buildAssetImageRenditions({ name: "Broken map", mimeType: "image/png" }, Buffer.from("not an image"));

    expect(result.image).toBeUndefined();
    expect(result.renditions).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "rendition_failed" })]);
  });

  it("skips non-image assets without attempting to decode them", async () => {
    const result = await buildAssetImageRenditions({ name: "Music", mimeType: "audio/ogg" }, Buffer.from("audio"));

    expect(result.renditions).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "unsupported_mime" })]);
  });
});
