import { describe, expect, it } from "vitest";
import { openApiSpec } from "./index.js";

type Operation = { parameters?: Array<Record<string, unknown>>; requestBody?: { content?: Record<string, { schema?: unknown }> } };

function operation(method: string, path: string): Operation {
  const item = openApiSpec.paths[path] as Record<string, unknown> | undefined;
  const found = item?.[method.toLowerCase()] as Operation | undefined;
  if (!found) throw new Error(`Missing ${method} ${path}`);
  return found;
}

function requestSchema(method: string, path: string): unknown {
  return operation(method, path).requestBody?.content?.["application/json"]?.schema;
}

describe("identity operator OpenAPI contracts", () => {
  it("requires Idempotency-Key on every identity/session/reset/email operator mutation", () => {
    const routes = [
      ["PATCH", "/api/v1/admin/users/{userId}"],
      ["POST", "/api/v1/admin/users/{userId}/password-reset"],
      ["POST", "/api/v1/admin/password-resets/prune"],
      ["DELETE", "/api/v1/admin/users/{userId}/sessions"],
      ["POST", "/api/v1/admin/sessions/prune"],
      ["POST", "/api/v1/admin/sessions/risk/revoke"],
      ["DELETE", "/api/v1/admin/sessions/{sessionId}"],
      ["POST", "/api/v1/admin/email-outbox/retry-all"],
      ["POST", "/api/v1/admin/email-outbox/{messageId}/retry"],
    ] as const;

    for (const [method, path] of routes) {
      expect(operation(method, path).parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }),
      ]));
    }
  });

  it("publishes exact revision and prepared-target request schemas", () => {
    expect(requestSchema("PATCH", "/api/v1/admin/users/{userId}")).toEqual({ $ref: "#/components/schemas/AdminUserPatchRequest" });
    expect(requestSchema("POST", "/api/v1/admin/users/{userId}/password-reset")).toEqual({ $ref: "#/components/schemas/AdminUserPasswordResetRequest" });
    expect(requestSchema("DELETE", "/api/v1/admin/users/{userId}/sessions")).toEqual({ $ref: "#/components/schemas/AdminUserSessionRevokeRequest" });
    expect(requestSchema("DELETE", "/api/v1/admin/sessions/{sessionId}")).toEqual({ $ref: "#/components/schemas/AdminSessionRevokeRequest" });
    expect(requestSchema("POST", "/api/v1/admin/email-outbox/{messageId}/retry")).toEqual({ $ref: "#/components/schemas/AdminEmailOutboxRetryRequest" });
    expect(openApiSpec.paths["/api/v1/admin/users/{userId}/sessions/revocation-plan"]?.get).toBeDefined();

    const schemas = openApiSpec.components.schemas as unknown as Record<string, { required?: readonly string[]; properties?: Record<string, unknown> }>;
    expect(schemas.AdminUserPatchRequest?.required).toContain("expectedUpdatedAt");
    expect(schemas.AdminUserPasswordResetRequest?.required).toContain("expectedUpdatedAt");
    expect(schemas.AdminSessionRevokeRequest?.required).toContain("expectedUpdatedAt");
    expect(schemas.AdminEmailOutboxRetryRequest?.required).toContain("expectedUpdatedAt");
    for (const name of ["AdminPasswordResetPruneRequest", "AdminSessionPruneRequest", "AdminSessionRiskRevokeRequest", "AdminEmailOutboxRetryAllRequest"]) {
      expect(schemas[name]?.properties).toHaveProperty("targetSetHash");
    }
  });

  it("documents stable delivery identities and prepared target hashes in responses", () => {
    const schemas = openApiSpec.components.schemas as unknown as Record<string, { required?: readonly string[]; properties?: Record<string, unknown> }>;
    expect(schemas.EmailOutboxMessage?.properties).toMatchObject({
      deliveryId: expect.any(Object),
      deliveryAttempts: expect.any(Object),
      lastDeliveryAttemptAt: expect.any(Object),
    });
    for (const name of ["AdminPasswordResetPruneResult", "AdminSessionPruneResult", "AdminSessionRiskRevokeResult", "AdminSessionRevokeResponse", "AdminEmailOutboxRetryAllResult"]) {
      expect(schemas[name]?.required).toContain("targetSetHash");
      expect(schemas[name]?.properties).toHaveProperty("targetSetHash");
    }
  });
});
