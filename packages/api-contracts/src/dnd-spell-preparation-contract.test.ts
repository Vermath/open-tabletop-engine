import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

const root = "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/spell-preparation";

describe("D&D spell-preparation API contract", () => {
  it("encodes preview and apply routes", () => {
    expect(routes.systemActorSpellPreparationPreview("campaign/one", "dnd/5.5e", "actor?one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%3Fone/spell-preparation/preview",
    );
    expect(routes.systemActorSpellPreparationApply("campaign/one", "dnd/5.5e", "actor?one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/dnd%2F5.5e/actors/actor%3Fone/spell-preparation/apply",
    );
  });

  it("documents rules blockers, revisions, and replay-safe preview/apply", () => {
    expect(openApiSpec.components.schemas.Dnd5eSrdSpellPreparationPreviewRequest.required).toEqual([
      "selectedSpellIds",
      "timing",
      "expectedActorUpdatedAt",
      "expectedItemUpdatedAt",
    ]);
    expect(openApiSpec.components.schemas.Dnd5eSrdSpellPreparationBlocker.properties.code.enum).toContain("later_level_spell_acquisition_manual");
    expect(openApiSpec.components.schemas.Dnd5eSrdSpellPreparationBlocker.properties.code.enum).toContain("wizard_spellbook_unverified");
    expect(openApiSpec.components.schemas.Dnd5eSrdSpellPreparationPreviewResponse).toEqual(expect.objectContaining({
      type: "object",
      additionalProperties: false,
      required: expect.arrayContaining(["status", "preparedPreviewKey", "actorUpdatedAt", "itemUpdatedAt"]),
    }));
    expect(openApiSpec.components.schemas.Dnd5eSrdSpellPreparationPreviewResponse).not.toHaveProperty("allOf");
    for (const operation of [
      openApiSpec.paths[`${root}/preview`]?.post,
      openApiSpec.paths[`${root}/apply`]?.post,
    ]) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({
        name: "Idempotency-Key",
        in: "header",
        required: true,
      }));
      expect(operation?.responses["409"]).toEqual(expect.any(Object));
    }
  });
});
