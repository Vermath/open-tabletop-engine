import { describe, expect, it } from "vitest";
import { openApiSpec } from "./index.js";

describe("SCIM operator concurrency contract", () => {
  it("documents the read-only mapping preparation and exact create/delete guards", () => {
    const preview = openApiSpec.paths["/api/v1/admin/scim/group-role-mappings/preview"]?.get;
    expect(preview).toBeDefined();
    expect(requiredParameterNames(preview)).toEqual(expect.arrayContaining(["campaignId", "role"]));
    expect(jsonResponseSchema(preview)).toEqual({ $ref: "#/components/schemas/AdminScimGroupRoleMappingPreview" });

    const create = openApiSpec.paths["/api/v1/admin/scim/group-role-mappings"]?.post;
    expect(requiredParameterNames(create)).toContain("Idempotency-Key");
    expect(resolvedJsonRequestRequired(create)).toEqual(expect.arrayContaining(["campaignId", "role", "preparedTargetSetHash"]));

    const remove = openApiSpec.paths["/api/v1/admin/scim/group-role-mappings/{mappingId}"]?.delete;
    expect(requiredParameterNames(remove)).toContain("Idempotency-Key");
    expect(resolvedJsonRequestRequired(remove)).toEqual(expect.arrayContaining(["expectedUpdatedAt", "preparedTargetSetHash"]));

    const mapping = openApiSpec.components.schemas.AdminScimGroupRoleMapping as Record<string, unknown>;
    expect(mapping.required).toEqual(expect.arrayContaining(["targetSetHash"]));
  });

  it("requires retry identities and strong validators for every SCIM resource mutation", () => {
    for (const collectionPath of ["/api/v1/scim/v2/Users", "/api/v1/scim/v2/Groups"] as const) {
      expect(requiredParameterNames(openApiSpec.paths[collectionPath]?.post)).toContain("Idempotency-Key");
      expect(openApiSpec.paths[collectionPath]?.post?.responses["201"]?.headers).toHaveProperty("ETag");
    }

    for (const resourcePath of ["/api/v1/scim/v2/Users/{userId}", "/api/v1/scim/v2/Groups/{groupId}"] as const) {
      for (const method of ["put", "patch", "delete"] as const) {
        const operation = openApiSpec.paths[resourcePath]?.[method];
        expect(requiredParameterNames(operation), `${method.toUpperCase()} ${resourcePath}`).toEqual(expect.arrayContaining(["Idempotency-Key", "If-Match"]));
        const ifMatch = operation?.parameters?.find((parameter) => parameter.name === "If-Match");
        expect(ifMatch?.schema.pattern).toBe('^"scim-sha256-[a-f0-9]{64}"$');
        expect(operation?.responses["412"]).toBeDefined();
        expect(operation?.responses["428"]).toBeDefined();
      }
      expect(openApiSpec.paths[resourcePath]?.get?.responses["200"]?.headers).toHaveProperty("ETag");
    }

    const meta = openApiSpec.components.schemas.ScimMeta as Record<string, unknown>;
    expect(meta.required).toEqual(expect.arrayContaining(["version"]));
    expect((meta.properties as Record<string, Record<string, unknown>>).version?.pattern).toBe('^"scim-sha256-[a-f0-9]{64}"$');
  });
});

type Operation = NonNullable<(typeof openApiSpec.paths)[string]["get"]>;

function requiredParameterNames(operation: Operation | undefined): string[] {
  return (operation?.parameters ?? []).filter((parameter) => parameter.required).map((parameter) => parameter.name);
}

function resolvedJsonRequestRequired(operation: Operation | undefined): string[] {
  const json = operation?.requestBody?.content?.["application/json"] as { schema?: Record<string, unknown> } | undefined;
  const schema = json?.schema;
  const ref = typeof schema?.$ref === "string" ? schema.$ref : undefined;
  const resolved = ref?.startsWith("#/components/schemas/")
    ? (openApiSpec.components.schemas as Record<string, Record<string, unknown>>)[ref.slice("#/components/schemas/".length)]
    : schema;
  return Array.isArray(resolved?.required) ? resolved.required.filter((value): value is string => typeof value === "string") : [];
}

function jsonResponseSchema(operation: Operation | undefined): unknown {
  const json = operation?.responses["200"]?.content?.["application/json"] as { schema?: unknown } | undefined;
  return json?.schema;
}
