import { describe, expect, it } from "vitest";

import { openApiSpec } from "./index.js";

describe("asset rendition API contract", () => {
  it("documents rebuildable image metadata and upload deduplication", () => {
    expect(openApiSpec.components.schemas.MapAsset.properties).toMatchObject({
      image: { $ref: "#/components/schemas/AssetImageMetadata" },
      renditions: { type: "array", items: { $ref: "#/components/schemas/AssetRendition" } }
    });
    expect(openApiSpec.components.schemas.AssetRendition.required).toEqual(expect.arrayContaining([
      "kind",
      "mimeType",
      "sizeBytes",
      "checksum",
      "width",
      "height",
      "storage",
      "createdAt"
    ]));
    expect(openApiSpec.components.schemas.AssetUploadResponse.properties).toMatchObject({
      deduplicated: { type: "boolean" },
      renditionWarnings: { type: "array" }
    });
  });

  it("exposes only the supported blob variants", () => {
    const operation = openApiSpec.paths["/api/v1/assets/{assetId}/blob"]?.get;
    expect(operation?.parameters).toContainEqual(expect.objectContaining({
      name: "variant",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["thumbnail", "optimized"] }
    }));
  });
});
