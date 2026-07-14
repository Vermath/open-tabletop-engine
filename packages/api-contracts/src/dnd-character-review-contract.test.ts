import { describe, expect, it } from "vitest";

import { openApiSpec, routes } from "./index.js";

const reviews = "/api/v1/campaigns/{campaignId}/dnd/character-reviews";

describe("D&D character review API contract", () => {
  it("encodes queue, policy, submission, and decision routes", () => {
    expect(routes.dndCharacterReviews("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/character-reviews");
    expect(routes.dndCharacterReviewPolicy("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/character-review-policy");
    expect(routes.dndCharacterReviewSubmit("campaign/one", "actor/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/character-reviews/actor%2Fone/submit");
    expect(routes.dndCharacterReviewDecision("campaign/one", "actor/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/character-reviews/actor%2Fone/decision");
  });

  it("documents portable evidence, stale-write inputs, and replay-safe mutations", () => {
    expect(openApiSpec.components.schemas.DndCharacterReviewState.required).toEqual(expect.arrayContaining([
      "fingerprint",
      "submittedAt",
      "submittedByUserId",
      "validation",
    ]));
    expect(openApiSpec.components.schemas.DndCharacterReviewEntry.required).toEqual(expect.arrayContaining([
      "effectiveStatus",
      "currentFingerprint",
      "currentValidation",
      "expectedActorUpdatedAt",
      "expectedItemUpdatedAt",
    ]));
    expect(openApiSpec.paths[reviews]?.get?.responses["200"]).toEqual(expect.any(Object));

    const mutations = [
      openApiSpec.paths["/api/v1/campaigns/{campaignId}/dnd/character-review-policy"]?.patch,
      openApiSpec.paths[`${reviews}/{actorId}/submit`]?.post,
      openApiSpec.paths[`${reviews}/{actorId}/decision`]?.post,
    ];
    for (const operation of mutations) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
      expect(operation?.responses["409"]).toEqual(expect.any(Object));
    }
  });
});
