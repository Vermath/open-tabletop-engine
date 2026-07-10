import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("api contracts", () => {
  it("encodes plugin and system route path parameters", () => {
    expect(
      routes.pluginStorageEntry("camp/one", "plugin two", "settings:ui"),
    ).toBe(
      "/api/v1/campaigns/camp%2Fone/plugins/plugin%20two/storage/settings%3Aui",
    );
    expect(
      routes.systemActorCondition(
        "camp/one",
        "system two",
        "actor/three",
        "condition four",
      ),
    ).toBe(
      "/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/conditions/condition%20four",
    );
  });

  it("encodes every dynamic route segment instead of allowing path confusion", () => {
    expect(routes.sceneWall("scene/one", "wall two")).toBe(
      "/api/v1/scenes/scene%2Fone/walls/wall%20two",
    );
    expect(routes.combatActionConfirm("combat/one", "action?two")).toBe(
      "/api/v1/combats/combat%2Fone/actions/action%3Ftwo/confirm",
    );
    expect(routes.adminPluginReview("pkg/name#sha")).toBe(
      "/api/v1/admin/plugins/reviews/pkg%2Fname%23sha",
    );
    expect(
      routes.systemActorSheet("camp/one", "system two", "actor/three"),
    ).toBe(
      "/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/sheet",
    );

    for (const value of Object.values(routes)) {
      if (typeof value !== "function") continue;
      const built = (value as (...parts: string[]) => string)(
        "first/part",
        "second/part",
        "third/part",
        "fourth/part",
      );
      expect(built).not.toContain("first/part");
      expect(built).not.toContain("second/part");
      expect(built).not.toContain("third/part");
      expect(built).not.toContain("fourth/part");
    }
  });

  it("does not duplicate the version prefix when OpenAPI clients combine servers and paths", () => {
    expect(openApiSpec.servers[0].url).toBe("/");
    expect(Object.keys(openApiSpec.paths)).toContain("/api/v1/campaigns");
  });

  it("overrides bearer authentication for public and optionally authenticated operations", () => {
    expect(openApiSpec.paths["/api/v1/health"]?.get?.security).toEqual([]);
    expect(openApiSpec.paths["/api/v1/auth/login"]?.post?.security).toEqual([]);
    expect(openApiSpec.paths["/api/v1/invites/accept"]?.post?.security).toEqual(
      [{}, { BearerAuth: [] }],
    );
    expect(openApiSpec.paths["/api/v1/mcp"]?.post?.security).toEqual([
      {},
      { BearerAuth: [] },
    ]);
    expect(
      openApiSpec.paths["/api/v1/auth/session"]?.get?.security,
    ).toBeUndefined();
  });

  it("only advertises pagination on endpoints that implement it", () => {
    const parameterNames = (path: string) =>
      openApiSpec.paths[path]?.get?.parameters?.map(
        (parameter) => parameter.name,
      ) ?? [];

    expect(parameterNames("/api/v1/campaigns/{campaignId}/rolls")).toEqual([
      "campaignId",
      "limit",
      "cursor",
      "offset",
    ]);
    expect(parameterNames("/api/v1/chat/messages")).toEqual([
      "limit",
      "cursor",
      "offset",
      "campaignId",
    ]);
    expect(parameterNames("/api/v1/combats/{combatId}/audit")).toEqual([
      "combatId",
      "limit",
      "cursor",
      "offset",
    ]);
    expect(parameterNames("/api/v1/auth/session")).toEqual([]);
    expect(parameterNames("/api/v1/campaigns/{campaignId}")).toEqual([
      "campaignId",
    ]);
  });

  it("advertises idempotency only for authenticated non-secret mutations", () => {
    const hasIdempotencyKey = (
      method: "post" | "put" | "patch" | "delete",
      path: string,
    ) =>
      openApiSpec.paths[path]?.[method]?.parameters?.some(
        (parameter) => parameter.name === "Idempotency-Key",
      ) ?? false;

    expect(
      hasIdempotencyKey("post", "/api/v1/campaigns/{campaignId}/scenes"),
    ).toBe(true);
    expect(hasIdempotencyKey("post", "/api/v1/auth/login")).toBe(false);
    expect(hasIdempotencyKey("post", "/api/v1/auth/register")).toBe(false);
    expect(hasIdempotencyKey("post", "/api/v1/invites/accept")).toBe(false);
    expect(hasIdempotencyKey("post", "/api/v1/organization/invites")).toBe(
      false,
    );
    expect(
      hasIdempotencyKey("post", "/api/v1/campaigns/{campaignId}/invites"),
    ).toBe(false);
    expect(
      hasIdempotencyKey("post", "/api/v1/assets/{assetId}/delivery-url"),
    ).toBe(false);
    expect(
      hasIdempotencyKey("post", "/api/v1/admin/users/{userId}/password-reset"),
    ).toBe(false);
  });

  it("documents proposal revision history entries", () => {
    const proposalHistoryEntry =
      openApiSpec.components.schemas.ProposalHistoryEntry;
    expect(proposalHistoryEntry.properties.action.enum).toContain("revised");
  });

  it("documents plugin commands and event bridges as proposal-only output", () => {
    const plugin = openApiSpec.components.schemas.PluginRuntimeInfo;
    const commandResponse =
      openApiSpec.components.schemas.PluginChatCommandResponse;

    expect(plugin.properties.eventSubscriptions).toBeDefined();
    expect(commandResponse.required).toEqual(
      expect.arrayContaining(["proposal", "proposals", "approvalRequired"]),
    );
    expect(commandResponse.properties.proposal).toEqual({
      $ref: "#/components/schemas/Proposal",
    });
    expect(commandResponse.properties.approvalRequired).toEqual({
      type: "boolean",
      enum: [true],
    });
    expect(plugin.properties.source.additionalProperties).toBe(false);
    expect(plugin.properties.source.properties).not.toHaveProperty("manifestPath");
    expect(plugin.properties.source.properties).not.toHaveProperty("clientEntrypoint");
    expect(plugin.properties.source.properties).not.toHaveProperty("serverEntrypoint");
    expect(plugin.properties.source.properties).not.toHaveProperty("registryUrl");
    expect(plugin.properties.source.properties).not.toHaveProperty("packageUrl");
    expect(plugin.properties.trust.properties.signature.properties).not.toHaveProperty("signaturePath");
    expect(openApiSpec.components.schemas.PluginCampaignInfo.allOf[1].properties.audit.properties).not.toHaveProperty("lastActorUserId");
  });

  it("defines the structured unsupported system capability response", () => {
    const schema =
      openApiSpec.components.schemas.UnsupportedSystemCapabilityResponse;

    expect(schema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["error", "systemId", "capability", "message"],
      properties: {
        error: {
          type: "string",
          enum: ["unsupported_system_capability"],
        },
        systemId: { type: "string", minLength: 1 },
        capability: {
          type: "string",
          enum: [
            "data-model",
            "actor-sheet",
            "quick-rolls",
            "actions",
            "conditions",
            "advancement",
            "rest",
            "compendium",
            "character-templates",
            "character-import",
            "character-origins",
            "encounter-builder",
            "monster-builder",
          ],
        },
        message: { type: "string", minLength: 1 },
      },
    });
  });

  it("documents the shared 422 response on every capability-gated system operation", () => {
    const expectedOperations = [
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates"],
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import"],
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan"],
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/compendium"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions"],
      ["delete", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}"],
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest"],
      ["get", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet"],
      ["post", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll"],
    ] as const;
    const expectedResponse = {
      description:
        "The requested rules-system runtime does not implement this capability",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/UnsupportedSystemCapabilityResponse",
          },
        },
      },
    };

    for (const [method, path] of expectedOperations) {
      expect(openApiSpec.paths[path]?.[method]?.responses["422"]).toEqual(
        expectedResponse,
      );
    }

    const documentedOperations: string[] = [];
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      for (const method of ["get", "post", "put", "patch", "delete"] as const) {
        const response = pathItem[method]?.responses["422"];
        const content = response?.content?.["application/json"] as
          | { schema?: { $ref?: string } }
          | undefined;
        if (
          content?.schema?.$ref ===
          "#/components/schemas/UnsupportedSystemCapabilityResponse"
        ) {
          documentedOperations.push(`${method} ${path}`);
        }
      }
    }

    expect(documentedOperations.sort()).toEqual(
      expectedOperations.map(([method, path]) => `${method} ${path}`).sort(),
    );
  });
});
