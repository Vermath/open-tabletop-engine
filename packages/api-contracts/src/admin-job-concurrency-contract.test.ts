import { describe, expect, it } from "vitest";
import { openApiSpec } from "./index.js";

const mutationOperations = [
  ["/api/v1/admin/jobs", "post"],
  ["/api/v1/admin/jobs/lease", "post"],
  ["/api/v1/admin/jobs/alerts", "post"],
  ["/api/v1/admin/jobs/{jobId}", "patch"],
  ["/api/v1/admin/jobs/{jobId}/heartbeat", "post"],
  ["/api/v1/admin/jobs/{jobId}/retry", "post"],
  ["/api/v1/admin/jobs/{jobId}/cancel", "post"]
] as const;

describe("admin job concurrency contracts", () => {
  it("requires retry identity on every job mutation operation", () => {
    for (const [path, method] of mutationOperations) {
      const operation = openApiSpec.paths[path]?.[method];
      expect(operation?.parameters, `${method.toUpperCase()} ${path}`).toContainEqual(
        expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })
      );
    }
  });

  it("documents durable lease identity, monotonic epochs, and exact state fences", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.AdminJob).toMatchObject({
      additionalProperties: false,
      properties: {
        leaseRequestId: { minLength: 1, maxLength: 160 },
        leaseRevision: { type: "integer", minimum: 1 }
      }
    });
    expect(schemas.AdminJobLeaseRequest).toMatchObject({
      additionalProperties: false,
      required: ["leaseRequestId"]
    });
    expect(schemas.AdminJobPatchRequest).toMatchObject({
      additionalProperties: false,
      anyOf: [{ required: ["expectedUpdatedAt"] }, { required: ["leaseRevision"] }]
    });
    expect(schemas.AdminJobHeartbeatRequest).toMatchObject({
      additionalProperties: false,
      anyOf: [{ required: ["expectedUpdatedAt"] }, { required: ["leaseRevision"] }]
    });
    expect(schemas.AdminJobRetryRequest).toMatchObject({ required: ["expectedUpdatedAt"] });
    expect(schemas.AdminJobCancelRequest).toMatchObject({ required: ["expectedUpdatedAt"] });
    expect(schemas.AdminJobCreateRequest).toMatchObject({
      allOf: [
        {
          if: { properties: { type: { const: "campaign.import" } } },
          then: {
            required: ["payload"],
            properties: {
              payload: { $ref: "#/components/schemas/AdminCampaignImportJobPayload" },
            },
          },
        },
      ],
    });
    expect(schemas.AdminCampaignImportJobPayload).toMatchObject({
      additionalProperties: false,
      required: ["archive", "expectedUpdatedAt"],
      properties: {
        mode: { enum: ["upsert", "reject_conflicts"] },
        expectedUpdatedAt: { type: "string", format: "date-time" },
      },
    });
  });

  it("requires and returns the stable downstream alert delivery identity", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.AdminJobAlertRequest).toMatchObject({ required: ["deliveryId"] });
    expect(schemas.AdminJobAlertResult).toMatchObject({
      required: expect.arrayContaining(["deliveryId"]),
      properties: { deliveryId: { minLength: 1, maxLength: 160 } }
    });
  });
});
