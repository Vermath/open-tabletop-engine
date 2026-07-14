import { describe, expect, it } from "vitest";
import {
  campaignWebhookEventTypeValues,
  openApiSpec,
  routes,
} from "./index.js";

const webhookOperations = [
  ["GET", "/api/v1/campaigns/{campaignId}/webhooks"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/disable"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret"],
  ["GET", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry"],
] as const;

describe("campaign webhook REST contract", () => {
  it("encodes every route segment and registers all nine operations", () => {
    expect(routes.campaignWebhooks("campaign/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/webhooks",
    );
    expect(routes.campaignWebhook("campaign/one", "hook?one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/webhooks/hook%3Fone",
    );
    expect(routes.campaignWebhookDisable("campaign/one", "hook?one").endsWith("/hook%3Fone/disable")).toBe(true);
    expect(routes.campaignWebhookRotateSecret("campaign/one", "hook?one").endsWith("/hook%3Fone/rotate-secret")).toBe(true);
    expect(routes.campaignWebhookDeliveries("campaign/one", "hook?one").endsWith("/hook%3Fone/deliveries")).toBe(true);
    expect(routes.campaignWebhookTest("campaign/one", "hook?one").endsWith("/hook%3Fone/test")).toBe(true);
    expect(routes.campaignWebhookRetry("campaign/one", "hook?one", "delivery#one").endsWith("/hook%3Fone/deliveries/delivery%23one/retry")).toBe(true);
    for (const [method, path] of webhookOperations) {
      expect(openApiSpec.paths[path]?.[method.toLowerCase() as "get" | "post" | "patch" | "delete"]).toEqual(expect.any(Object));
    }
  });

  it("publishes bounded metadata-only DTOs without exposing stored secrets", () => {
    const schemas = openApiSpec.components.schemas;
    expect(schemas.CampaignWebhookEventType.enum).toEqual(campaignWebhookEventTypeValues);
    expect(schemas.CampaignWebhookEnvelopeEventType.enum).toEqual([
      ...campaignWebhookEventTypeValues,
      "webhook.test",
    ]);
    expect(schemas.CampaignWebhook.required).toContain("secretHint");
    expect(schemas.CampaignWebhook.properties).not.toHaveProperty("signingSecret");
    expect(schemas.CampaignWebhook.properties).not.toHaveProperty("creationIdempotencyKeyHash");
    expect(schemas.CampaignWebhookDelivery.properties).not.toHaveProperty("requestBody");
    expect(schemas.CampaignWebhookDelivery.properties).not.toHaveProperty("responseBody");
    expect(schemas.CampaignWebhookDelivery.properties).not.toHaveProperty("headers");
    expect(schemas.CampaignWebhookEnvelopeV1.additionalProperties).toBe(false);
    expect(schemas.CampaignWebhookEnvelopeV1.properties).not.toHaveProperty("payload");
  });

  it("requires revisions and replay keys on every human-confirmed mutation", () => {
    const paths = openApiSpec.paths;
    const bodyMutationOperations = [
      paths["/api/v1/campaigns/{campaignId}/webhooks"]?.post,
      paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"]?.patch,
      paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/disable"]?.post,
      paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret"]?.post,
      paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test"]?.post,
      paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry"]?.post,
    ];
    const deleteOperation = paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"]?.delete;
    for (const operation of [...bodyMutationOperations, deleteOperation]) {
      expect(operation?.parameters).toContainEqual(
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
        }),
      );
    }
    for (const operation of bodyMutationOperations) {
      expect(operation?.requestBody).toEqual(expect.any(Object));
    }
    expect(deleteOperation?.requestBody).toBeUndefined();
    expect(deleteOperation?.parameters).toContainEqual(
      expect.objectContaining({
        name: "expectedUpdatedAt",
        in: "query",
        required: true,
        schema: { type: "string", format: "date-time" },
      }),
    );
    expect(schemasRequired("CampaignWebhookCreateRequest")).toContain(
      "expectedCampaignUpdatedAt",
    );
    expect(schemasRequired("CampaignWebhookUpdateRequest")).toContain("expectedUpdatedAt");
    expect(schemasRequired("CampaignWebhookMutationRequest")).toContain("expectedUpdatedAt");
  });

  it("models one-time secrets, async queue responses, and the bounded ledger", () => {
    const paths = openApiSpec.paths;
    expect(paths["/api/v1/campaigns/{campaignId}/webhooks"]?.post?.responses).toEqual(
      expect.objectContaining({ "200": expect.any(Object), "201": expect.any(Object) }),
    );
    expect(openApiSpec.components.schemas.CampaignWebhookCreateResponse.oneOf).toHaveLength(2);
    expect(openApiSpec.components.schemas.CampaignWebhookRotateSecretResponse.oneOf).toHaveLength(2);
    expect(paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test"]?.post?.responses["202"]).toEqual(
      expect.any(Object),
    );
    expect(paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry"]?.post?.responses["202"]).toEqual(
      expect.any(Object),
    );
    expect(paths["/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries"]?.get?.parameters).toContainEqual(
      expect.objectContaining({
        name: "limit",
        in: "query",
        schema: expect.objectContaining({ minimum: 1, maximum: 100, default: 50 }),
      }),
    );
  });
});

function schemasRequired(name: "CampaignWebhookCreateRequest" | "CampaignWebhookUpdateRequest" | "CampaignWebhookMutationRequest") {
  return openApiSpec.components.schemas[name].required;
}
