import { describe, expect, it } from "vitest";

import { openApiSpec } from "./index.js";

const assetSetPaths = [
  "/api/v1/admin/assets/integrity/quarantine",
  "/api/v1/admin/assets/migrate",
  "/api/v1/admin/assets/cleanup",
] as const;

describe("admin asset operator contract", () => {
  it("requires retry identity for every asset mutation", () => {
    for (const path of [
      ...assetSetPaths,
      "/api/v1/admin/assets/{assetId}/purge-cache",
    ]) {
      expect(openApiSpec.paths[path]?.post?.parameters).toContainEqual(
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
        }),
      );
    }
  });

  it("documents prepared target-set execution and stable per-object identities", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.AdminAssetOperationRequest.properties).toMatchObject({
      expectedTargetSetHash: {
        type: "string",
        pattern: "^sha256:[a-f0-9]{64}$",
      },
    });
    expect(schemas.AdminAssetOperationResult.required).toEqual(
      expect.arrayContaining(["targetSetHash", "results"]),
    );
    expect(schemas.AdminAssetOperationResult.properties.results).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/AdminAssetOperationItem" },
    });
    expect(schemas.AdminAssetOperationItem.required).toEqual(
      expect.arrayContaining([
        "operationId",
        "assetId",
        "campaignId",
        "status",
      ]),
    );
  });

  it("requires the exact asset revision and downstream delivery identity for CDN purge", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.AdminAssetCdnPurgeRequest.required).toEqual(
      expect.arrayContaining(["expectedUpdatedAt", "deliveryId"]),
    );
    expect(schemas.AdminAssetCdnPurgeResult.required).toEqual(
      expect.arrayContaining(["deliveryId"]),
    );
  });
});
