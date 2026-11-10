import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

const schemas = openApiSpec.components.schemas;
const bindingPath = "/api/v1/campaigns/{campaignId}/systems/{systemId}/binding";
const rollPath = "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll";

describe("declarative system API contracts", () => {
  it("preserves structured resource, state, and archive dependency failures as 422 responses", () => {
    for (const [path, method] of [
      ["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet", "get"],
      [rollPath, "post"],
    ] as const) {
      expect(openApiSpec.paths[path]?.[method]?.responses["422"]).toMatchObject({ content: { "application/json": { schema: { anyOf: [
        { $ref: "#/components/schemas/UnsupportedSystemCapabilityResponse" },
        { $ref: "#/components/schemas/DeclarativeRuntimeErrorResponse" },
        { $ref: "#/components/schemas/DeclarativeSystemStateErrorResponse" },
      ] } } } });
    }
    expect(schemas.DeclarativeRuntimeErrorResponse).toMatchObject({ additionalProperties: false, required: ["error", "message", "issues"], properties: { error: { enum: expect.arrayContaining(["roll_unavailable", "unknown_roll"]) } } });
    expect(schemas.DeclarativeSystemStateErrorResponse.properties.issues.items).toMatchObject({ additionalProperties: false, required: ["path", "code", "message", "collection", "recordId"] });
    expect(openApiSpec.paths["/api/v1/import/campaign"]?.post?.responses["422"]).toMatchObject({ content: { "application/json": { schema: { anyOf: expect.arrayContaining([{ $ref: "#/components/schemas/DeclarativeArchiveDependencyErrorResponse" }]) } } } });
  });

  it("keeps executable manifest schemas finite for the API runtime dereferencer", () => {
    const components = schemas as unknown as Record<string, unknown>;
    const walk = (value: unknown, ancestors: string[] = []): void => {
      if (Array.isArray(value)) { value.forEach((entry) => walk(entry, ancestors)); return; }
      if (!value || typeof value !== "object") return;
      const schema = value as Record<string, unknown>;
      if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/components/schemas/")) {
        const name = schema.$ref.slice("#/components/schemas/".length);
        expect(ancestors, `Component cycle ending in ${name}`).not.toContain(name);
        expect(components).toHaveProperty(name);
        walk(components[name], [...ancestors, name]);
      } else Object.values(schema).forEach((entry) => walk(entry, ancestors));
    };
    for (const name of ["SystemInstallRequest", "SystemRuntimeInfo", "SystemActorRollRequest", "SystemActorRollResponse"]) walk(components[name], [name]);
    expect(schemas.DeclarativeSystemObjectSchemaLevel4.properties.properties.additionalProperties).toEqual({ $ref: "#/components/schemas/DeclarativeScalarSchema" });
  });

  it("publishes a GM binding route with exact current and previous identities", () => {
    expect(routes.campaignSystemBinding("campaign/one", "system?one")).toBe("/api/v1/campaigns/campaign%2Fone/systems/system%3Fone/binding");
    const operation = openApiSpec.paths[bindingPath]?.post;
    expect(operation?.description).toContain("GM with campaign.update");
    expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    expect(operation?.requestBody).toMatchObject({ content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignSystemBindingRequest" } } } });
    expect(operation?.responses).toHaveProperty("403");
    expect(operation?.responses).toHaveProperty("409");
    expect(schemas.CampaignSystemBindingRequest).toMatchObject({
      additionalProperties: false,
      required: ["expectedUpdatedAt", "system", "expectedBinding"],
      properties: {
        expectedUpdatedAt: { type: "string", format: "date-time" },
        system: { $ref: "#/components/schemas/SystemManifestIdentity" },
        expectedBinding: { anyOf: [{ $ref: "#/components/schemas/SystemManifestIdentity" }, { type: "null" }] },
      },
    });
    expect(schemas.CampaignSystemBindingResponse).toMatchObject({ additionalProperties: false, required: ["campaign", "binding"] });
    expect(schemas.SystemManifestIdentity).toMatchObject({ additionalProperties: false, required: ["systemId", "version", "checksum"], properties: { checksum: { pattern: "^[a-f0-9]{64}$" } } });
    expect(schemas.Campaign.properties.systemBindings).toEqual({ type: "array", items: { $ref: "#/components/schemas/SystemManifestIdentity" } });
  });

  it("preserves legacy string schemas and publishes bounded inline definitions", () => {
    for (const manifest of [schemas.SystemInstallRequest.properties.manifest, schemas.SystemRuntimeInfo]) {
      expect(manifest.additionalProperties).toBe(false);
      expect(manifest.properties.schemas).toEqual({ $ref: "#/components/schemas/SystemManifestSchemas" });
      expect(manifest.properties.definition).toEqual({ $ref: "#/components/schemas/DeclarativeSystemDefinition" });
    }
    expect(schemas.SystemManifestSchemas.anyOf).toEqual([
      expect.objectContaining({ properties: { actor: { type: "string" }, item: { type: "string" } } }),
      expect.objectContaining({ properties: { actor: { $ref: "#/components/schemas/DeclarativeSystemObjectSchema" }, item: { $ref: "#/components/schemas/DeclarativeSystemObjectSchema" } } }),
    ]);
    expect(schemas.DeclarativeSystemObjectSchema).toMatchObject({ additionalProperties: false, required: ["type", "properties", "required", "additionalProperties"], properties: { properties: { maxProperties: 64 }, additionalProperties: { enum: [false] } } });
    expect(schemas.DeclarativeSystemDefinition).toMatchObject({ additionalProperties: false, properties: { kind: { enum: ["declarative-v1"] }, sheet: { properties: { fields: { maxItems: 32 } } }, quickRolls: { maxItems: 32 } } });
    expect(schemas.SystemRuntimeInfo.properties.installedVersions).toEqual({ type: "array", items: { $ref: "#/components/schemas/SystemManifestIdentity" } });
    expect(schemas.SystemRuntimeInfo.properties.binding).toEqual({ $ref: "#/components/schemas/SystemManifestIdentity" });
  });

  it("makes declarative sheets and rolls strict while retaining the existing D&D action shape", () => {
    expect(schemas.DeclarativeActorSheet).toMatchObject({ additionalProperties: false, required: ["kind", "actorId", "actorUpdatedAt", "system", "fields", "quickRolls"] });
    expect(schemas.SystemActorSheet.anyOf).toContainEqual({ $ref: "#/components/schemas/DeclarativeActorSheet" });
    expect(schemas.SystemActorSheet.anyOf[0]).toMatchObject({ properties: { kind: { not: { enum: ["declarative-v1"] } } } });
    expect(schemas.DeclarativeActionRequest).toMatchObject({ additionalProperties: false, required: ["rollId", "expectedActorUpdatedAt", "expectedSystem"] });
    expect(Object.keys(schemas.DeclarativeActionRequest.properties)).toEqual(["rollId", "expectedActorUpdatedAt", "expectedSystem"]);
    expect(schemas.SystemActorRollRequest.anyOf).toEqual([
      { allOf: [{ $ref: "#/components/schemas/SystemActorActionRequest" }, { type: "object", not: { required: ["expectedSystem"] } }] },
      { $ref: "#/components/schemas/DeclarativeActionRequest" },
    ]);
    expect(schemas.SystemActorActionRequest.properties).toHaveProperty("preparedPreviewKey");
    expect(schemas.DeclarativeActionResult).toMatchObject({ additionalProperties: false, required: ["roll", "chat", "actor", "sheet", "quickRoll"], properties: { cost: { $ref: "#/components/schemas/DeclarativeResourceCost" } } });
    const operation = openApiSpec.paths[rollPath]?.post;
    expect(operation?.requestBody).toMatchObject({ content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorRollRequest" } } } });
    expect(operation?.responses["200"]).toMatchObject({ content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorRollResponse" } } } });
    expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", description: expect.stringContaining("declarative system rolls") }));
  });
});
