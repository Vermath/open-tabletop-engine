import { describe, expect, it } from "vitest";

import { openApiSpec } from "./index.js";

type Schema = {
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, Schema>;
  pattern?: string;
};

type SchemaContent = Record<string, { schema?: { $ref?: string } }>;

type Operation = {
  parameters?: unknown[];
  requestBody?: { content?: SchemaContent };
  responses?: Record<string, { content?: SchemaContent }>;
};

const paths = openApiSpec.paths as unknown as Record<
  string,
  Partial<Record<"post" | "patch", Operation>>
>;
const schemas = openApiSpec.components.schemas as unknown as Record<
  string,
  Schema
>;

function operation(method: "post" | "patch", path: string) {
  const result = paths[path]?.[method];
  if (!result) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return result;
}

function requestSchema(method: "post" | "patch", path: string): Schema {
  const reference = operation(method, path).requestBody?.content?.[
    "application/json"
  ]?.schema;
  const name = reference?.$ref?.split("/").at(-1);
  if (!name) throw new Error(`Missing request schema for ${method} ${path}`);
  return schemas[name]!;
}

function responseSchema(method: "post" | "patch", path: string): Schema {
  const reference = operation(method, path).responses?.["200"]?.content?.[
    "application/json"
  ]?.schema;
  const name = reference?.$ref?.split("/").at(-1);
  if (!name) throw new Error(`Missing response schema for ${method} ${path}`);
  return schemas[name]!;
}

describe("plugin and system operator OpenAPI contract", () => {
  it("requires an Idempotency-Key on every privileged package/registry/system mutation", () => {
    for (const [method, path] of [
      ["post", "/api/v1/plugins/install"],
      ["post", "/api/v1/plugins/registry/sync"],
      ["post", "/api/v1/admin/plugins/registry/sync"],
      ["patch", "/api/v1/admin/plugins/reviews/{reviewKey}"],
      ["post", "/api/v1/systems/install"],
    ] as const) {
      expect(
        operation(method, path).parameters,
        `${method.toUpperCase()} ${path}`,
      ).toContainEqual(
        expect.objectContaining({
          name: "Idempotency-Key",
          in: "header",
          required: true,
        }),
      );
    }
  });

  it("models exact plugin revisions and strict registry result generations", () => {
    const review = requestSchema(
      "patch",
      "/api/v1/admin/plugins/reviews/{reviewKey}",
    );
    expect(review.additionalProperties).toBe(false);
    expect(review.required).toEqual(
      expect.arrayContaining(["status", "expectedUpdatedAt"]),
    );

    for (const path of [
      "/api/v1/plugins/registry/sync",
      "/api/v1/admin/plugins/registry/sync",
    ]) {
      const request = requestSchema("post", path);
      expect(request.additionalProperties).toBe(false);
      expect(request.required).toContain("expectedRegistryRevision");
      expect(request.properties?.expectedRegistryRevision?.pattern).toBe(
        "^sha256:[a-f0-9]{64}$",
      );

      const response = responseSchema("post", path);
      expect(response.additionalProperties).toBe(false);
      expect(response.required).toEqual(
        expect.arrayContaining([
          "syncedAt",
          "previousRegistryRevision",
          "registryRevision",
          "registries",
          "plugins",
        ]),
      );
    }

    for (const schemaName of [
      "AdminPluginReviewSnapshot",
      "AdminPluginOperations",
    ]) {
      const schema = schemas[schemaName]!;
      expect(schema.required).toContain("registryRevision");
      expect(schema.properties?.registryRevision?.pattern).toBe(
        "^sha256:[a-f0-9]{64}$",
      );
    }
  });
});
