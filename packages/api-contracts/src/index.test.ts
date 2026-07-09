import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("api contracts", () => {
  it("encodes plugin and system route path parameters", () => {
    expect(routes.pluginStorageEntry("camp/one", "plugin two", "settings:ui")).toBe(
      "/api/v1/campaigns/camp%2Fone/plugins/plugin%20two/storage/settings%3Aui"
    );
    expect(routes.systemActorCondition("camp/one", "system two", "actor/three", "condition four")).toBe(
      "/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/conditions/condition%20four"
    );
  });

  it("encodes every dynamic route segment instead of allowing path confusion", () => {
    expect(routes.sceneWall("scene/one", "wall two")).toBe("/api/v1/scenes/scene%2Fone/walls/wall%20two");
    expect(routes.combatActionConfirm("combat/one", "action?two")).toBe("/api/v1/combats/combat%2Fone/actions/action%3Ftwo/confirm");
    expect(routes.adminPluginReview("pkg/name#sha")).toBe("/api/v1/admin/plugins/reviews/pkg%2Fname%23sha");
    expect(routes.systemActorSheet("camp/one", "system two", "actor/three")).toBe("/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/sheet");

    for (const value of Object.values(routes)) {
      if (typeof value !== "function") continue;
      const built = (value as (...parts: string[]) => string)("first/part", "second/part", "third/part", "fourth/part");
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
    expect(openApiSpec.paths["/api/v1/invites/accept"]?.post?.security).toEqual([{}, { BearerAuth: [] }]);
    expect(openApiSpec.paths["/api/v1/mcp"]?.post?.security).toEqual([{}, { BearerAuth: [] }]);
    expect(openApiSpec.paths["/api/v1/auth/session"]?.get?.security).toBeUndefined();
  });

  it("only advertises pagination on endpoints that implement it", () => {
    const parameterNames = (path: string) => openApiSpec.paths[path]?.get?.parameters?.map((parameter) => parameter.name) ?? [];

    expect(parameterNames("/api/v1/campaigns/{campaignId}/rolls")).toEqual(["campaignId", "limit", "cursor", "offset"]);
    expect(parameterNames("/api/v1/chat/messages")).toEqual(["limit", "cursor", "offset", "campaignId"]);
    expect(parameterNames("/api/v1/combats/{combatId}/audit")).toEqual(["combatId", "limit", "cursor", "offset"]);
    expect(parameterNames("/api/v1/auth/session")).toEqual([]);
    expect(parameterNames("/api/v1/campaigns/{campaignId}")).toEqual(["campaignId"]);
  });

  it("documents proposal revision history entries", () => {
    const proposalHistoryEntry = openApiSpec.components.schemas.ProposalHistoryEntry;
    expect(proposalHistoryEntry.properties.action.enum).toContain("revised");
  });
});
