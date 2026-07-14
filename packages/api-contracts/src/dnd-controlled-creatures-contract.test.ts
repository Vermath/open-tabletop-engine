import { describe, expect, it } from "vitest";

import { openApiSpec, routes } from "./index.js";

const root = "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures";

describe("D&D controlled-creature API contract", () => {
  it("encodes collection, preview, command, cleanup, and concentration routes", () => {
    expect(routes.systemControlledCreatures("campaign/one", "dnd/5.5e")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures");
    expect(routes.systemControlledCreaturesPreview("campaign/one", "dnd/5.5e")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/preview");
    expect(routes.systemControlledCreatureCommand("campaign/one", "dnd/5.5e", "actor/one")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/actor%2Fone/command");
    expect(routes.systemControlledCreatureEnd("campaign/one", "dnd/5.5e", "actor/one")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/actor%2Fone/end");
    expect(routes.systemControlledCreatureConcentrationEnd("campaign/one", "dnd/5.5e")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/controlled-creatures/concentration/end");
  });

  it("documents preview/confirm revision roots and replay-safe lifecycle writes", () => {
    expect(openApiSpec.components.schemas.DndControlledCreatureCreateRequest.required).toEqual(expect.arrayContaining(["kind", "source", "controllerUserId", "actor", "duration", "initiative", "command"]));
    expect(openApiSpec.components.schemas.DndControlledCreaturePreview.required).toEqual(expect.arrayContaining(["previewToken", "ready", "manualReview", "requiredRevisions", "affected"]));
    expect(openApiSpec.components.schemas.DndControlledCreatureRevisionSet.required).toEqual(["actors", "items", "tokens", "combats", "scenes", "encounters"]);

    const mutations = [
      openApiSpec.paths[root]?.post,
      openApiSpec.paths[`${root}/{actorId}/command`]?.post,
      openApiSpec.paths[`${root}/{actorId}/end`]?.post,
      openApiSpec.paths[`${root}/concentration/end`]?.post,
    ];
    for (const operation of mutations) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
      expect(operation?.responses["409"]).toEqual(expect.any(Object));
    }
    expect(openApiSpec.paths[`${root}/preview`]?.post?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: false }));
  });
});
