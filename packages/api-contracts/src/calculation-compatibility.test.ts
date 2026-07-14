import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("calculation and compatibility contracts", () => {
  it("encodes identifiers and exposes typed read-only response schemas", () => {
    expect(routes.campaignCompatibility("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/compatibility");
    expect(routes.systemActorCalculationExplanation("campaign/one", "dnd/5.5e", "actor/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%2Fone/calculation-explanation",
    );

    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/compatibility"]?.get?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/CampaignCompatibilityReport" } } },
    });
    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/calculation-explanation"]?.get?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/ActorCalculationExplanation" } } },
    });
    expect(openApiSpec.components.schemas.CalculationFieldExplanation.required).toEqual([
      "id", "group", "label", "result", "terms", "flags",
    ]);
    expect(openApiSpec.components.schemas.CalculationFlags.required).toEqual([
      "manual", "override", "unsupported", "ambiguous", "reasons",
    ]);
    expect(openApiSpec.components.schemas.CampaignCompatibilityReport.required).toEqual(expect.arrayContaining([
      "readOnly", "systems", "validation", "compendium", "calculationFlags", "issues",
    ]));
    expect(openApiSpec.components.schemas.CampaignCompatibilityReport.properties.validation.properties.repairPreview.properties.automaticChanges).toEqual({
      type: "integer",
      minimum: 0,
    });
    expect(openApiSpec.components.schemas.CampaignCompatibilityReport.properties.validation.properties.repairPreview.properties.candidates).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/CampaignCompatibilityRepairCandidate" },
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdRulesValidationResponse.required).toContain("repairPreview");
    expect(openApiSpec.components.schemas.Dnd5eSrdRepairCandidate.required).toEqual(expect.arrayContaining(["inverse", "source", "application"]));
  });
});
