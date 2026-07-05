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

  it("documents proposal revision history entries", () => {
    const proposalHistoryEntry = openApiSpec.components.schemas.ProposalHistoryEntry;
    expect(proposalHistoryEntry.properties.action.enum).toContain("revised");
  });
});
