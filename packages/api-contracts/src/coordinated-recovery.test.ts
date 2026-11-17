import { describe, expect, it } from "vitest";
import { openApiSpec } from "./index.js";

describe("coordinated database and asset recovery contracts", () => {
  it("documents a versioned checksummed recovery manifest and exact asset snapshot identity", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.StorageAssetSnapshotIdentity).toMatchObject({
      additionalProperties: false,
      required: ["provider", "snapshotId", "createdAt"],
      properties: {
        provider: { enum: ["local", "s3"] },
        snapshotId: { minLength: 1, maxLength: 200 },
        createdAt: { format: "date-time" },
      },
    });
    expect(schemas.StorageRecoveryPointManifest).toMatchObject({
      required: ["kind", "version", "createdAt", "database", "assetInventory"],
      properties: {
        version: { enum: [1] },
        database: { properties: { checksumAlgorithm: { enum: ["sha256"] } } },
        assetInventory: { $ref: "#/components/schemas/StorageAssetMetadataInventory" },
        assetSnapshot: { $ref: "#/components/schemas/StorageAssetSnapshotIdentity" },
      },
    });
    expect(schemas.StorageRecoveryPointSummary).toMatchObject({
      required: ["manifestFileName", "manifestStatus", "paired", "actionRequired", "actionReasons"],
      properties: { manifestStatus: { enum: ["present", "missing", "invalid"] } },
    });
  });

  it("requires an exact live-state fence and provider snapshot for destructive restore", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.StorageBackupRequest).toMatchObject({
      additionalProperties: false,
      properties: {
        requireAssetSnapshot: { type: "boolean" },
        assetSnapshot: { $ref: "#/components/schemas/StorageAssetSnapshotIdentity" },
      },
    });
    expect(schemas.StorageRestoreDrillRequest).toMatchObject({
      additionalProperties: false,
      properties: {
        requireAssetSnapshot: { type: "boolean" },
        expectedAssetSnapshot: { $ref: "#/components/schemas/StorageAssetSnapshotIdentity" },
      },
    });
    expect(schemas.StorageRestoreRequest).toMatchObject({
      required: ["backupFileName", "confirmFileName", "expectedStateRevision", "requireAssetSnapshot", "expectedAssetSnapshot"],
      properties: {
        expectedStateRevision: { pattern: "^sha256:[a-f0-9]{64}$" },
        requireAssetSnapshot: { type: "boolean" },
        expectedAssetSnapshot: { $ref: "#/components/schemas/StorageAssetSnapshotIdentity" },
      },
    });
    expect(schemas.StorageRestoreDrillResult).toMatchObject({
      required: ["status", "checkedAt", "actionRequired", "actionReasons"],
      properties: {
        recoveryPoint: { $ref: "#/components/schemas/StorageRecoveryPointSummary" },
        actionRequired: { type: "boolean" },
      },
    });
    expect(schemas.AdminStorageOperations).toMatchObject({
      properties: {
        restoreStateRevision: { pattern: "^sha256:[a-f0-9]{64}$" },
      },
    });
    expect(schemas.StorageRestoreResult).toMatchObject({
      properties: {
        reconciliation: { $ref: "#/components/schemas/StorageRestoreReconciliation" },
      },
    });
    expect(openApiSpec.paths["/api/v1/admin/storage/restore"]?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }),
    );
  });
});
