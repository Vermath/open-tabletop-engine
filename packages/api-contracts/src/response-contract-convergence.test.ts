import { describe, expect, it } from "vitest";

import { openApiSpec } from "./index.js";

describe("non-AI runtime response contract convergence", () => {
  it("accepts the critical remediation severity emitted by system operations", () => {
    expect(openApiSpec.components.schemas.AdminOperationRemediation.properties.severity).toEqual({
      type: "string",
      enum: ["warning", "error", "critical"],
    });
  });

  it("allows identity-only users and generic archived-campaign conflicts", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.PublicUser.required).toEqual([
      "id",
      "displayName",
      "createdAt",
      "updatedAt",
    ]);
    for (const operation of [
      openApiSpec.paths["/api/v1/actors/{actorId}"]?.patch,
      openApiSpec.paths["/api/v1/items/{itemId}"]?.patch,
    ]) {
      expect(operation?.responses["409"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              anyOf: expect.arrayContaining([
                { $ref: "#/components/schemas/ErrorResponse" },
              ]),
            },
          },
        },
      });
    }
  });

  it("documents revision and MFA inputs consumed by shared mutation handlers", () => {
    const schemas = openApiSpec.components.schemas;
    const dateTime = { type: "string", format: "date-time" };

    expect(schemas.OrganizationMemberCreateRequest.properties.expectedOrganizationUpdatedAt).toEqual(dateTime);
    expect(schemas.OrganizationInviteCreateRequest).toMatchObject({
      required: expect.arrayContaining(["campaignId", "expectedCampaignUpdatedAt"]),
      properties: { expectedCampaignUpdatedAt: dateTime },
    });
    expect(schemas.CampaignInviteCreateRequest.properties.expectedUpdatedAt).toEqual(dateTime);
    expect(schemas.InviteAcceptRequest.properties).toMatchObject({
      expectedUpdatedAt: dateTime,
      mfaCode: { type: "string" },
      recoveryCode: { type: "string" },
    });
    expect(schemas.FogPresetCreateRequest.properties.expectedUpdatedAt).toEqual(dateTime);
    expect(schemas.ProposalCreateRequest.properties.expectedUpdatedAt).toEqual(dateTime);
    expect(schemas.PluginStorageSetRequest.properties).toMatchObject({
      expectedUpdatedAt: dateTime,
      expectedCampaignUpdatedAt: dateTime,
    });
  });

  it("models invite acceptance independently from login membership lists", () => {
    const schemas = openApiSpec.components.schemas;
    const schema = schemas.InviteAcceptResponse;

    expect(schema).not.toHaveProperty("allOf");
    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["token", "session", "user", "serverAdmin", "invite", "membership", "campaign"],
      properties: {
        token: { type: "string", pattern: "^ots_" },
        session: { $ref: "#/components/schemas/UserSession" },
        user: { $ref: "#/components/schemas/PublicUser" },
        serverAdmin: { type: "boolean" },
        invite: { $ref: "#/components/schemas/CampaignInvite" },
        membership: { $ref: "#/components/schemas/CampaignMember" },
        campaign: { $ref: "#/components/schemas/Campaign" },
      },
    });
    expect(schema.required).not.toContain("memberships");

    expect(schemas.OrganizationInvite).not.toHaveProperty("allOf");
    expect(schemas.OrganizationInvite).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining(["id", "campaignId", "role", "campaign"]),
      properties: {
        campaignId: { type: "string", minLength: 1 },
        campaign: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name"],
        },
      },
    });
  });

  it("matches password-reset pruning and email batch retry summaries", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.AdminPasswordResetPruneResult).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(["activeRemaining", "expiredRemaining", "usedRemaining"]),
      properties: {
        activeRemaining: { type: "integer", minimum: 0 },
      },
    });
    expect(schemas.AdminPasswordResetPruneResult.required).toEqual(expect.arrayContaining(["generatedAt", "targetSetHash"]));
    expect(schemas.AdminEmailOutboxRetryAllResult).toMatchObject({
      additionalProperties: false,
      required: expect.arrayContaining(["planned", "messages"]),
      properties: {
        planned: { type: "integer", minimum: 0 },
        messages: {
          type: "array",
          items: { $ref: "#/components/schemas/AdminEmailOutboxRetryAllMessage" },
        },
      },
    });
    expect(schemas.AdminEmailOutboxRetryAllResult.required).toEqual(expect.arrayContaining(["generatedAt", "targetSetHash", "deduplicated"]));
    expect(schemas.AdminEmailOutboxRetryAllMessage.required).toEqual([
      "id",
      "to",
      "subject",
      "before",
      "after",
      "provider",
    ]);
    expect(schemas.AdminSessionRiskRevokeResult.properties.sessions).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/AdminSessionRiskRevokeItem" },
    });
    expect(schemas.AdminSessionRiskRevokeItem).toMatchObject({
      additionalProperties: false,
      required: ["session", "user", "reasons"],
    });
  });

  it("types D&D ritual preparation and prepared roll summaries", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.Dnd5eSrdSpellPreparationCapacity.properties).toMatchObject({
      source: { enum: ["stored", "class-progression", "level-one-class"] },
      classes: { type: "array" },
    });
    for (const schema of [
      schemas.Dnd5eSrdSpellPreparationPlan,
      schemas.Dnd5eSrdSpellPreparationPreviewResponse,
    ]) {
      expect(schema.properties.ritualCastableSpellIds).toEqual({
        type: "array",
        items: { type: "string", minLength: 1 },
      });
    }
    expect(schemas.SystemPreparedRollResult).toMatchObject({
      additionalProperties: false,
      required: ["formula", "total", "terms"],
      properties: {
        targetActorId: { type: "string", minLength: 1 },
        terms: {
          type: "array",
          items: { $ref: "#/components/schemas/DiceRollTerm" },
        },
      },
    });
    expect(schemas.SystemRollResponse.properties.rolls).toEqual({
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/DiceRoll" },
          { $ref: "#/components/schemas/SystemPreparedRollResult" },
        ],
      },
    });
    expect(
      openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll"]?.post?.responses["409"],
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            anyOf: [
              { $ref: "#/components/schemas/StaleWriteConflictResponse" },
              { $ref: "#/components/schemas/ErrorResponse" },
            ],
          },
        },
      },
    });
  });

  it("documents health readiness, legacy-compatible scenes, and extended organization entries", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.HealthStatus.properties).toMatchObject({
      apiCompatibility: expect.objectContaining({ type: "string" }),
      buildFingerprint: expect.objectContaining({ type: "string" }),
      dependencies: { $ref: "#/components/schemas/HealthDependencies" },
      aiPolicy: { $ref: "#/components/schemas/HealthAiPolicyStatus" },
    });
    expect(schemas.HealthStatus.required).toContain("apiCompatibility");
    expect(schemas.HealthStatus.required).toContain("buildFingerprint");
    expect(schemas.HealthDependencies).toMatchObject({
      additionalProperties: false,
      required: ["state", "assets", "assetSigning"],
    });

    expect(schemas.Scene.required).not.toContain("difficultTerrain");
    expect(schemas.Scene.required).not.toContain("coverOverrides");
    expect(schemas.Scene.required).not.toContain("annotations");
    expect(schemas.Scene.properties).toMatchObject({
      annotations: { type: "array", items: { $ref: "#/components/schemas/SceneAnnotation" } },
      difficultTerrain: { type: "array" },
      coverOverrides: { type: "array" },
    });

    expect(schemas.AdminSystemOperations.properties.productionGapCounts).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/AdminSystemProductionGap" },
    });
    expect(schemas.AdminSystemProductionGap).toMatchObject({
      additionalProperties: false,
      required: ["code", "count", "systems", "severity", "message", "remediation"],
      properties: {
        severity: { enum: ["warning", "critical"] },
        systems: {
          type: "array",
          items: { $ref: "#/components/schemas/AdminSystemProductionGapSystem" },
        },
      },
    });

    expect(schemas.OrganizationWorkspaceInfo).not.toHaveProperty("allOf");
    expect(schemas.OrganizationWorkspaceInfo).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining(["id", "role", "memberCount", "campaignCount"]),
      properties: {
        role: { enum: ["owner", "admin", "member"] },
        memberCount: { type: "integer", minimum: 0 },
        campaignCount: { type: "integer", minimum: 0 },
      },
    });
  });

  it("separates public and admin plugin projections while typing campaign compatibility", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.PluginRuntimeInfo.properties.compatibleCore).toEqual({
      oneOf: [
        { type: "string" },
        { $ref: "#/components/schemas/PluginCoreCompatibility" },
      ],
    });
    expect(schemas.PluginCampaignInfo.allOf[1]).toMatchObject({
      required: ["compatibleCore"],
      properties: {
        compatibleCore: { $ref: "#/components/schemas/PluginCoreCompatibility" },
      },
    });

    expect(schemas.AdminPluginRegistrySyncResponse.properties.plugins).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/AdminPluginRegistrySyncPlugin" },
    });
    expect(schemas.AdminPluginRegistrySyncPlugin.properties.source).toMatchObject({
      additionalProperties: false,
      required: ["type", "packageId", "manifestPath", "manifestChecksum", "sandbox"],
      properties: {
        manifestPath: { type: "string" },
        clientEntrypoint: { type: "string" },
        serverEntrypoint: { type: "string" },
        registryUrl: { type: "string" },
        packageUrl: { type: "string" },
      },
    });
    expect(schemas.PluginRuntimeInfo.properties.source.properties).not.toHaveProperty("manifestPath");
  });

  it("documents SCIM domain errors alongside boundary errors", () => {
    const response = openApiSpec.paths["/api/v1/scim/v2/Users"]?.post?.responses["400"];

    expect(response?.content?.["application/json"]).toEqual({
      schema: {
        oneOf: [
          { $ref: "#/components/schemas/ScimError" },
          { $ref: "#/components/schemas/ErrorResponse" },
        ],
      },
    });
  });

  it("flattens backup results and types rendition warnings", () => {
    const schemas = openApiSpec.components.schemas;

    expect(schemas.StorageBackupResult).not.toHaveProperty("allOf");
    expect(schemas.StorageBackupResult).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["status", "fileName", "sizeBytes", "createdAt", "recoveryPoint"],
      properties: {
        status: { enum: ["created"] },
        recoveryPoint: { $ref: "#/components/schemas/StorageRecoveryPointSummary" },
      },
    });
    expect(schemas.StorageRestoreResult).not.toHaveProperty("allOf");
    expect(schemas.StorageRestoreResult).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["status", "checkedAt", "actionRequired", "actionReasons"],
      properties: {
        status: { enum: ["passed", "failed"] },
        backup: { $ref: "#/components/schemas/StorageBackupSummary" },
        actionRequired: { type: "boolean" },
        actionReasons: { type: "array" },
        restoredAt: { type: "string", format: "date-time" },
        reason: { type: "string", maxLength: 160 },
      },
    });
    expect(schemas.AdminStorageOperations.properties.backups).toMatchObject({
      additionalProperties: false,
      required: ["directoryName", "count", "retentionCount"],
      properties: {
        count: { type: "integer", minimum: 0 },
        retentionCount: { type: "integer", minimum: 0 },
      },
    });
    expect(schemas.AssetUploadResponse.properties.renditionWarnings).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/AssetRenditionWarning" },
    });
    expect(schemas.AssetRenditionWarning).toMatchObject({
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { enum: ["unsupported_mime", "invalid_image", "rendition_failed"] },
        message: { type: "string" },
      },
    });
  });
});
