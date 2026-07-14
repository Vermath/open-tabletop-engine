import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("api contracts", () => {
  it("keeps per-thread usage distinct from campaign usage summaries", () => {
    expect(openApiSpec.components.schemas.AiThread.properties.usage).toEqual({
      $ref: "#/components/schemas/AiThreadUsageMetrics",
    });
    expect(openApiSpec.components.schemas.AiThreadUsageMetrics).toMatchObject({
      additionalProperties: false,
      properties: {
        promptCharacters: { type: "integer", minimum: 0 },
        contextCharacters: { type: "integer", minimum: 0 },
        responseCharacters: { type: "integer", minimum: 0 },
        inputTokens: { type: "integer", minimum: 0 },
        outputTokens: { type: "integer", minimum: 0 },
        totalTokens: { type: "integer", minimum: 0 },
        estimatedCostUsd: { type: "number", minimum: 0 },
      },
    });
    expect("required" in openApiSpec.components.schemas.AiThreadUsageMetrics).toBe(false);
    expect(openApiSpec.components.schemas.AiUsageMetrics.required).toEqual(["campaignId"]);
    expect(
      openApiSpec.paths["/api/v1/campaigns/{campaignId}/ai/usage"]?.get?.responses["200"],
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/AiUsageMetrics" },
        },
      },
    });
  });

  it("keeps content-import drafts distinct from persisted entities", () => {
    expect(openApiSpec.components.schemas.ContentImportPreviewRequest.properties.entities).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/ContentImportEntityDraft" },
    });
    expect(openApiSpec.components.schemas.ContentImportEntityDraft.required).toEqual(["kind", "name"]);
    expect(openApiSpec.components.schemas.ContentImportEntityDraft.properties).toHaveProperty("id");
    expect(openApiSpec.components.schemas.ContentImportEntityDraft.required).not.toContain("id");
    expect(openApiSpec.components.schemas.ContentImportEntity.required).toEqual(
      expect.arrayContaining(["id", "kind", "name"]),
    );
    expect(openApiSpec.components.schemas.ContentImportBatch.properties.entities).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/ContentImportEntity" },
    });
  });

  it("publishes the exact existing-campaign revision for wrapped archive imports", () => {
    expect(openApiSpec.components.schemas.CampaignImportRequest.anyOf[1]).toMatchObject({
      required: ["archive"],
      properties: {
        archive: { $ref: "#/components/schemas/CampaignArchive" },
        expectedUpdatedAt: { type: "string", format: "date-time" },
      },
    });
    expect(openApiSpec.paths["/api/v1/import/campaign/stream"]?.post?.parameters).toContainEqual(
      expect.objectContaining({
        name: "expectedUpdatedAt",
        in: "query",
        required: false,
        schema: { type: "string", format: "date-time" },
      }),
    );
  });

  it("requires exact revisions and documents audited manual overrides for raw actor and item patches", () => {
    for (const schema of [
      openApiSpec.components.schemas.ActorPatchRequest,
      openApiSpec.components.schemas.ItemPatchRequest,
    ]) {
      expect(schema).toEqual(expect.objectContaining({
        additionalProperties: false,
        required: ["expectedUpdatedAt"],
        properties: expect.objectContaining({
          expectedUpdatedAt: { type: "string", format: "date-time" },
          manualOverrideReason: { type: "string", maxLength: 500 },
        }),
      }));
    }
    expect(openApiSpec.components.schemas.StaleWriteConflictResponse).toMatchObject({
      required: ["error", "message"],
      properties: {
        resourceType: { type: "string" },
        current: { type: "object", additionalProperties: true },
      },
    });
    expect(openApiSpec.components.schemas.RulesManagedPatchConflictResponse).toMatchObject({
      required: ["error", "code", "message", "resourceType", "resourceId", "managedRoots"],
      properties: {
        code: { enum: ["character_review_route_required", "rules_managed_patch_requires_review"] },
        resourceType: { enum: ["actor", "item"] },
      },
    });
    for (const route of [
      openApiSpec.paths["/api/v1/actors/{actorId}"]?.patch,
      openApiSpec.paths["/api/v1/items/{itemId}"]?.patch,
    ]) {
      expect(route?.responses["409"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              anyOf: [
                { $ref: "#/components/schemas/StaleWriteConflictResponse" },
                { $ref: "#/components/schemas/RulesManagedPatchConflictResponse" },
                { $ref: "#/components/schemas/ErrorResponse" },
              ],
            },
          },
        },
      });
    }
  });

  it("documents journal hierarchy, typed knowledge links, revisions, canon review, and replay safety", () => {
    expect(routes.journalBacklinks("journal/one")).toBe("/api/v1/journal/journal%2Fone/backlinks");
    expect(routes.journalHistory("journal/one")).toBe("/api/v1/journal/journal%2Fone/history");
    expect(routes.journalCanonReview("journal/one")).toBe("/api/v1/journal/journal%2Fone/canon-review");
    expect(openApiSpec.components.schemas.JournalEntry.required).toEqual(expect.arrayContaining(["kind", "links", "revision", "canonStatus"]));
    expect(openApiSpec.components.schemas.JournalEntityLink.properties.targetType.enum).toEqual(["actor", "scene", "item", "journal", "handout", "encounter"]);
    for (const route of [
      openApiSpec.paths["/api/v1/campaigns/{campaignId}/journal"]?.post,
      openApiSpec.paths["/api/v1/journal/{entryId}"]?.patch,
      openApiSpec.paths["/api/v1/journal/{entryId}/canon-review"]?.post,
    ] as const) {
      expect(route?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    }
    expect(openApiSpec.paths["/api/v1/journal/{entryId}/history"]?.get?.responses["200"]).toEqual(expect.any(Object));
    expect(openApiSpec.paths["/api/v1/journal/{entryId}/backlinks"]?.get?.responses["200"]).toEqual(expect.any(Object));
    expect(openApiSpec.paths["/api/v1/journal/{entryId}"]?.delete?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "expectedUpdatedAt", in: "query", required: true }),
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }),
    ]));
  });

  it("documents guided class skill and language selections as typed lists", () => {
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.classSkillProficiencies).toEqual({
      type: "array",
      items: expect.objectContaining({ type: "string" })
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdClassSkillChoice).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["templateId", "className", "count", "skillIds", "source"],
      properties: expect.objectContaining({
        count: expect.objectContaining({ type: "integer", minimum: 1 }),
        skillIds: expect.objectContaining({ type: "array" })
      })
    }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.originLanguageChoices).toEqual({
      type: "array",
      items: expect.objectContaining({ type: "string" })
    });
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.classLanguageChoices).toEqual({
      type: "array",
      items: expect.objectContaining({ type: "string" })
    });
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.draconicAncestry).toEqual(expect.objectContaining({ type: "string" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.giantAncestry).toEqual(expect.objectContaining({ type: "string" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.classEquipmentPackageId).toEqual(expect.objectContaining({ type: "string" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.backgroundEquipmentPackageId).toEqual(expect.objectContaining({ type: "string" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.classEquipmentChoices).toEqual(expect.objectContaining({ type: "object" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.backgroundEquipmentChoices).toEqual(expect.objectContaining({ type: "object" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.classToolProficiencyChoices).toEqual(expect.objectContaining({ type: "array" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.backgroundToolProficiencyChoice).toEqual(expect.objectContaining({ type: "string" }));
    expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties.weaponMasteryChoices).toEqual(expect.objectContaining({ type: "array" }));
    for (const field of [
      "classCantripChoices",
      "classPreparedSpellChoices",
      "wizardSpellbookChoices",
      "backgroundMagicInitiateCantrips",
      "originFeatMagicInitiateCantrips",
      "skilledProficiencyChoices",
      "rogueExpertiseChoices",
      "pactTomeCantripChoices",
      "pactTomeRitualChoices"
    ] as const) {
      expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties[field]).toEqual(expect.objectContaining({ type: "array" }));
    }
    for (const field of [
      "backgroundMagicInitiateSpell",
      "backgroundMagicInitiateAbility",
      "originFeatMagicInitiateSpell",
      "originFeatMagicInitiateAbility",
      "fightingStyle",
      "divineOrder",
      "primalOrder",
      "eldritchInvocation"
    ] as const) {
      expect(openApiSpec.components.schemas.SystemCharacterCreateRequest.properties[field]).toEqual(expect.objectContaining({ type: "string" }));
    }
    expect(openApiSpec.components.schemas.Dnd5eSrdOriginLanguageChoice).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["count", "fixedLanguageIds", "languageIds", "source"],
      properties: expect.objectContaining({
        count: expect.objectContaining({ type: "integer", minimum: 1 }),
        fixedLanguageIds: expect.objectContaining({ type: "array" }),
        languageIds: expect.objectContaining({ type: "array" })
      })
    }));
    expect(openApiSpec.components.schemas.Dnd5eSrdClassLanguageChoice).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["templateId", "className", "count", "fixedLanguageIds", "languageIds", "source"],
      properties: expect.objectContaining({
        count: expect.objectContaining({ type: "integer", minimum: 0 }),
        fixedLanguageIds: expect.objectContaining({ type: "array" }),
        languageIds: expect.objectContaining({ type: "array" })
      })
    }));
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.required).toEqual(expect.arrayContaining([
      "draconicAncestors",
      "giantAncestries",
      "languages",
      "originLanguageChoice",
      "classLanguageChoices",
      "classStartingEquipment",
      "backgroundStartingEquipment",
      "weaponMasteryOptions",
      "classWeaponMasteryChoices",
      "spellOptions",
      "classSpellChoices",
      "levelOneClassFeatureChoices",
      "fightingStyles",
      "divineOrders",
      "primalOrders",
      "eldritchInvocations",
      "originFeatOptions",
      "skilledProficiencyOptions"
    ]));
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.classStartingEquipment).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdClassStartingEquipment" } });
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.backgroundStartingEquipment).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdBackgroundStartingEquipment" } });
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.weaponMasteryOptions).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdWeaponMasteryOption" } });
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.classSpellChoices).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdClassSpellChoice" } });
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.eldritchInvocations).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdEldritchInvocationOption" } });
    expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties.originFeatOptions).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdOriginFeatOption" } });
    for (const field of ["fightingStyles", "divineOrders", "primalOrders"] as const) {
      expect(openApiSpec.components.schemas.Dnd5eSrdCharacterOrigins.properties[field]).toEqual({ type: "array", items: { $ref: "#/components/schemas/Dnd5eSrdManualLevelOneOption" } });
    }
    expect(openApiSpec.components.schemas.Dnd5eSrdClassSpellChoice.properties.slotPool.enum).toEqual(["none", "spellcasting", "pact-magic"]);
    expect(openApiSpec.components.schemas.Dnd5eSrdClassSpellChoice.properties.slotRecovery.enum).toEqual(["none", "long", "short"]);
    expect(openApiSpec.components.schemas.Dnd5eSrdManualLevelOneOption.properties.automation.enum).toEqual(["manual"]);
    expect(openApiSpec.components.schemas.Dnd5eSrdDraconicAncestor).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["id", "name", "damageType", "source"],
      properties: expect.objectContaining({ damageType: expect.objectContaining({ enum: ["acid", "cold", "fire", "lightning", "poison"] }) })
    }));
    expect(openApiSpec.components.schemas.Dnd5eSrdGiantAncestryChoice).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["id", "name", "giantType", "activation", "summary", "source"],
      properties: expect.objectContaining({
        activation: expect.objectContaining({ enum: ["bonus-action", "on-hit", "reaction"] }),
        damageReductionAbility: expect.objectContaining({ enum: ["constitution"] })
      })
    }));
    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins"]?.get?.responses["200"]).toEqual(expect.objectContaining({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/Dnd5eSrdCharacterOrigins" }
        }
      }
    }));
  });

  it("documents token rotation and elevation on persisted and create payloads", () => {
    expect(openApiSpec.components.schemas.Token.properties).toEqual(
      expect.objectContaining({
        rotation: expect.objectContaining({ type: "number" }),
        elevation: expect.objectContaining({ type: "number", minimum: -1000000, maximum: 1000000 })
      })
    );
    expect(openApiSpec.components.schemas.TokenCreateRequest.properties).toEqual(
      expect.objectContaining({
        rotation: expect.objectContaining({ type: "number" }),
        elevation: expect.objectContaining({ type: "number", minimum: -1000000, maximum: 1000000 })
      })
    );
    expect(openApiSpec.components.schemas.TokenPatchRequest.properties).toEqual(
      expect.objectContaining({
        brightVisionRadius: expect.objectContaining({ type: ["number", "null"] }),
        dimVisionRadius: expect.objectContaining({ type: ["number", "null"] }),
      }),
    );
    expect(openApiSpec.components.schemas.TokenPatchRequest.properties).not.toHaveProperty("id");
    expect(openApiSpec.components.schemas.TokenPatchRequest.properties).not.toHaveProperty("sceneId");
    expect(openApiSpec.components.schemas.TokenPatchRequest.properties).not.toHaveProperty("createdAt");
    expect(openApiSpec.components.schemas.TokenPatchRequest.properties).not.toHaveProperty("updatedAt");
  });

  it("documents typed portals, senses, darkness, and cross-user vision preview", () => {
    expect(openApiSpec.components.schemas.Wall.properties).toEqual(expect.objectContaining({
      kind: expect.objectContaining({ enum: ["wall", "terrain", "door", "window"] }),
      open: { type: "boolean" }
    }));
    expect(openApiSpec.components.schemas.LightSource.properties).toEqual(expect.objectContaining({
      kind: expect.objectContaining({ enum: ["light", "darkness"] }),
      magical: { type: "boolean" }
    }));
    expect(openApiSpec.components.schemas.Token.properties.senses).toEqual({ type: "array", items: { $ref: "#/components/schemas/TokenSense" } });
    expect(openApiSpec.paths["/api/v1/scenes/{sceneId}/vision"]?.get?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "previewUserId", in: "query" })
    ]));
    expect(openApiSpec.paths["/api/v1/scenes/{sceneId}/vision/sample"]?.get?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "x", in: "query", required: true }),
      expect.objectContaining({ name: "y", in: "query", required: true })
    ]));
  });

  it("documents atomic combat rewards and their durable ledger shape", () => {
    expect(routes.combatRewards("combat/one")).toBe("/api/v1/combats/combat%2Fone/rewards");
    expect(openApiSpec.components.schemas.Combat.properties.rewards).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/CombatReward" }
    });
    expect(openApiSpec.paths["/api/v1/combats/{combatId}/rewards"]?.post?.requestBody).toEqual(expect.any(Object));
    expect(openApiSpec.paths["/api/v1/combats/{combatId}/rewards"]?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true })
    );
    expect(openApiSpec.components.schemas.CombatRewardCreateRequest.properties).toEqual(
      expect.objectContaining({
        recipientActorIds: expect.objectContaining({ type: "array", maxItems: 100 }),
        totalXp: expect.objectContaining({ type: "integer", minimum: 0 }),
        totalGp: expect.objectContaining({ type: "integer", minimum: 0 }),
        loot: expect.objectContaining({ type: "array", maxItems: 100 }),
        expectedActorUpdatedAt: expect.objectContaining({ type: "object", maxProperties: 100 })
      })
    );
  });

  it("documents replay-safe environment mechanics, effect scheduling, and specialized spell previews", () => {
    expect(routes.combatEnvironmentMechanics("combat/one")).toBe("/api/v1/combats/combat%2Fone/environment-mechanics");
    expect(routes.combatEnvironmentMechanic("combat/one", "mechanic?one")).toBe("/api/v1/combats/combat%2Fone/environment-mechanics/mechanic%3Fone");
    expect(routes.combatEffectScheduleAdvance("combat/one")).toBe("/api/v1/combats/combat%2Fone/effects/advance");
    expect(routes.dnd5eSpellHelperPreview("campaign/one", "dnd-5e-srd")).toBe("/api/v1/campaigns/campaign%2Fone/systems/dnd-5e-srd/spell-helper/preview");

    expect(openApiSpec.components.schemas.Combat.properties).toEqual(expect.objectContaining({
      environmentMechanics: { type: "array", items: { $ref: "#/components/schemas/CombatEnvironmentMechanic" } },
      environmentMechanicTriggers: { type: "array", items: { $ref: "#/components/schemas/CombatEnvironmentMechanicTrigger" } },
      effectScheduleEvents: { type: "array", items: { $ref: "#/components/schemas/RulesEffectScheduleEvent" } },
    }));
    expect(openApiSpec.components.schemas.CombatEnvironmentMechanicSchedule.properties.timing.enum).toEqual([
      "initiative_count", "round_start", "round_end", "manual",
    ]);
    expect(openApiSpec.components.schemas.CombatEffectScheduleRequest.properties.phase.enum).toEqual([
      "start_turn", "end_turn", "start_round", "end_round", "initiative_count", "time", "manual",
    ]);

    for (const operation of [
      openApiSpec.paths["/api/v1/combats/{combatId}/environment-mechanics"]?.post,
      openApiSpec.paths["/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}"]?.patch,
      openApiSpec.paths["/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}"]?.delete,
      openApiSpec.paths["/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}/trigger"]?.post,
      openApiSpec.paths["/api/v1/combats/{combatId}/effects/advance"]?.post,
    ]) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    }
    expect(openApiSpec.paths["/api/v1/combats/{combatId}/effects/preview"]?.post?.requestBody).toEqual(expect.any(Object));
    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/spell-helper/preview"]?.post?.responses["200"]).toEqual(expect.any(Object));
  });

  it("documents optimistic and replay-safe system condition mutations", () => {
    const applyOperation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions"]?.post;
    const removeOperation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}"]?.delete;

    expect(openApiSpec.components.schemas.SystemActorConditionApplyRequest).toEqual(expect.objectContaining({
      additionalProperties: false,
      required: ["conditionId", "expectedUpdatedAt"],
      properties: expect.objectContaining({
        conditionId: expect.objectContaining({ type: "string" }),
        expectedUpdatedAt: { type: "string", format: "date-time" },
        overrideReason: expect.objectContaining({ type: "string" })
      })
    }));
    expect(applyOperation?.parameters).toContainEqual(expect.objectContaining({
      name: "Idempotency-Key",
      in: "header",
      required: true
    }));
    expect(applyOperation?.responses["409"]).toEqual(expect.any(Object));
    expect(removeOperation?.parameters).toContainEqual(expect.objectContaining({
      name: "expectedUpdatedAt",
      in: "query",
      required: true
    }));
    expect(removeOperation?.responses["409"]).toEqual(expect.any(Object));
  });

  it("documents provenance-filtered compendium reads and explicit conflict-safe mutations", () => {
    const readOperation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/compendium"]?.get;
    const addOperation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium"]?.post;
    const purchaseOperation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase"]?.post;

    expect(routes.systemCompendium("campaign/one", "system two", { q: "healing word", types: ["spell", "item"] })).toBe(
      "/api/v1/campaigns/campaign%2Fone/systems/system%20two/compendium?q=healing+word&types=spell%2Citem"
    );
    expect(readOperation?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "q", in: "query" }),
      expect.objectContaining({ name: "type", in: "query" }),
      expect.objectContaining({ name: "types", in: "query" })
    ]));
    expect(openApiSpec.components.schemas.CompendiumCatalogEntry.required).toEqual(
      expect.arrayContaining(["id", "type", "name", "summary", "data", "provenance"])
    );
    expect(openApiSpec.components.schemas.CompendiumProvenance.required).toEqual(
      expect.arrayContaining(["sourceKind", "sourceName", "sourceVersion", "contentVersion", "systemId", "systemVersion", "rulesVersion", "license"])
    );
    expect(openApiSpec.components.schemas.SystemCompendium.required).toEqual(
      expect.arrayContaining(["entries", "provenanceSummary", "filters"])
    );
    expect(openApiSpec.components.schemas.SystemActorCompendiumRequest.required).toEqual(["entryId", "expectedUpdatedAt"]);
    expect(openApiSpec.components.schemas.SystemEquipmentPurchaseRequest.required).toEqual(["entryId", "expectedUpdatedAt"]);
    expect(openApiSpec.components.schemas.CompendiumConflict.properties.choices).toEqual(expect.objectContaining({ type: "array" }));
    for (const operation of [addOperation, purchaseOperation]) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
      expect(operation?.responses["409"]).toEqual(expect.any(Object));
    }
  });

  it("documents stale attunement conflicts and conditional prepared-preview replay", () => {
    const attunement = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/attunement"]?.post;
    const rulesPreview = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-preview"]?.post;

    expect(attunement?.requestBody).toMatchObject({
      content: { "application/json": { schema: { properties: { breakCurse: { type: "boolean" }, overrideReason: expect.objectContaining({ type: "string" }) } } } }
    });

    expect(attunement?.responses["409"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/StaleWriteConflictResponse" },
        },
      },
    });
    expect(rulesPreview?.parameters).toContainEqual(expect.objectContaining({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      description: expect.stringContaining("Required when prepare is true"),
    }));
  });

  it("publishes route-specific creator, preview, advancement, and rest envelopes", () => {
    const characterTemplates = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates"]?.get;
    const createCharacter = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/characters"]?.post;
    const rulesPreview = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-preview"]?.post;
    const advancement = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance"]?.post;
    const rest = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest"]?.post;

    expect(characterTemplates?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { items: { $ref: "#/components/schemas/SystemCharacterTemplate" } } } },
    });
    expect(createCharacter?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SystemCharacterCreateResponse" } } },
    });
    expect(rulesPreview?.requestBody).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/Dnd5eSrdRulesPreviewRequest" } } },
    });
    expect(rulesPreview?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/Dnd5eSrdRulesPreviewResponse" } } },
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdRulesPreviewRequest.oneOf).toHaveLength(3);
    expect(openApiSpec.components.schemas.Dnd5eSrdRulesPreviewRequest.oneOf[2]).toMatchObject({
      properties: { criticalHit: { type: "boolean" } },
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdRulesPreviewResponse.properties.preparation.properties).toMatchObject({
      combatId: { type: "string" },
      combatUpdatedAt: { type: "string", format: "date-time" },
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdTypedDamageApplyRequest.properties).toMatchObject({
      expectedCombatUpdatedAt: { type: "string", format: "date-time" },
    });
    expect(openApiSpec.components.schemas.Dnd5eSrdTypedDamageApplyResult.properties.combat).toEqual({ $ref: "#/components/schemas/Combat" });
    expect(openApiSpec.components.schemas.Dnd5eSrdRulesPreviewResponse.required).toEqual(expect.arrayContaining([
      "previewVersion",
      "rulesVersion",
      "blockers",
      "serverRolls",
      "validation",
      "changes",
    ]));
    expect(advancement?.requestBody).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorAdvanceRequest" } } },
    });
    expect(advancement?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorAdvanceResponse" } } },
    });
    expect(rest?.requestBody).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorRestRequest" } } },
    });
    expect(rest?.responses["200"]).toMatchObject({
      content: { "application/json": { schema: { $ref: "#/components/schemas/SystemActorRestResponse" } } },
    });
  });

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
    expect(routes.combatStart("campaign/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/combats/start",
    );
    expect(routes.campaignOwnershipTransfer("campaign/one")).toBe(
      "/api/v1/campaigns/campaign%2Fone/ownership-transfer",
    );
    expect(routes.adminPluginReview("pkg/name#sha")).toBe(
      "/api/v1/admin/plugins/reviews/pkg%2Fname%23sha",
    );
    expect(
      routes.systemActorSheet("camp/one", "system two", "actor/three"),
    ).toBe(
      "/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/sheet",
    );
    expect(
      routes.systemActorRulesPreview("camp/one", "system two", "actor/three"),
    ).toBe(
      "/api/v1/campaigns/camp%2Fone/systems/system%20two/actors/actor%2Fthree/rules-preview",
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

  it("advertises idempotency for authenticated mutations while keeping anonymous secret flows out of replay", () => {
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
    expect(
      hasIdempotencyKey(
        "post",
        "/api/v1/campaigns/{campaignId}/ownership-transfer",
      ),
    ).toBe(true);
    expect(
      hasIdempotencyKey(
        "post",
        "/api/v1/campaigns/{campaignId}/combats/start",
      ),
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
    ).toBe(true);
  });

  it("keeps operation parameters unique with route-specific overrides winning", () => {
    const duplicates: string[] = [];
    for (const [path, pathItem] of Object.entries(openApiSpec.paths)) {
      for (const [method, operation] of Object.entries(pathItem ?? {})) {
        if (!operation || typeof operation !== "object" || !("parameters" in operation)) continue;
        const seen = new Set<string>();
        for (const parameter of operation.parameters ?? []) {
          const name = parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name;
          const key = `${parameter.in}:${name}`;
          if (seen.has(key)) duplicates.push(`${method.toUpperCase()} ${path} ${key}`);
          seen.add(key);
        }
      }
    }
    expect(duplicates).toEqual([]);

    const rewardHeaders = openApiSpec.paths["/api/v1/combats/{combatId}/rewards"]?.post?.parameters
      ?.filter((parameter) => parameter.in === "header" && parameter.name.toLowerCase() === "idempotency-key");
    const conditionHeaders = openApiSpec.paths["/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions"]?.post?.parameters
      ?.filter((parameter) => parameter.in === "header" && parameter.name.toLowerCase() === "idempotency-key");
    expect(rewardHeaders).toEqual([expect.objectContaining({ required: true })]);
    expect(conditionHeaders).toEqual([expect.objectContaining({ required: true })]);
  });

  it("does not publish dangling internal schema references", () => {
    const schemaNames = new Set(Object.keys(openApiSpec.components.schemas));
    const dangling: string[] = [];
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, `${path}/${index}`));
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        const nextPath = `${path}/${key}`;
        if (key === "$ref" && typeof entry === "string" && entry.startsWith("#/components/schemas/")) {
          const name = entry.slice("#/components/schemas/".length);
          if (!schemaNames.has(name)) dangling.push(`${nextPath} -> ${entry}`);
        } else {
          visit(entry, nextPath);
        }
      }
    };
    visit(openApiSpec, "#");
    expect(dangling).toEqual([]);
  });

  it("documents proposal revision history entries", () => {
    const proposalHistoryEntry =
      openApiSpec.components.schemas.ProposalHistoryEntry;
    expect(proposalHistoryEntry.properties.action.enum).toContain("revised");
  });

  it("documents revision-safe campaign ownership transfer", () => {
    const request =
      openApiSpec.components.schemas.CampaignOwnershipTransferRequest;
    const response =
      openApiSpec.components.schemas.CampaignOwnershipTransferResponse;

    expect(request).toMatchObject({
      additionalProperties: false,
      required: ["targetUserId", "expectedUpdatedAt"],
      properties: {
        targetUserId: { type: "string", minLength: 1 },
        expectedUpdatedAt: { type: "string", format: "date-time" },
        reason: { type: "string", maxLength: 160 },
      },
    });
    expect(response.required).toEqual([
      "campaign",
      "previousOwner",
      "newOwner",
    ]);
    expect(response.properties.previousOwner).toEqual({
      $ref: "#/components/schemas/CampaignMemberSnapshot",
    });
    expect(response.properties.newOwner).toEqual({
      $ref: "#/components/schemas/CampaignMemberSnapshot",
    });
    expect(openApiSpec.components.schemas.CampaignMemberSnapshot.allOf[1].required).toEqual([
      "user",
      "active",
      "permissions",
    ]);
    expect(openApiSpec.components.schemas.CampaignMember.properties.active).toEqual({
      type: "boolean",
    });
    expect(
      openApiSpec.paths[
        "/api/v1/campaigns/{campaignId}/ownership-transfer"
      ]?.post?.requestBody,
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/CampaignOwnershipTransferRequest",
          },
        },
      },
    });
    expect(
      openApiSpec.paths[
        "/api/v1/campaigns/{campaignId}/ownership-transfer"
      ]?.post?.parameters,
    ).toContainEqual(expect.objectContaining({
      name: "Idempotency-Key",
      in: "header",
      required: true,
    }));
  });

  it("documents campaign creation options and the bundled snapshot payload", () => {
    const createRequest = openApiSpec.components.schemas.CampaignCreateRequest;
    const snapshot = openApiSpec.components.schemas.CampaignSnapshot;
    const bundled = openApiSpec.components.schemas.CampaignSnapshotBundled;
    const searchResult = openApiSpec.components.schemas.CampaignSearchResult;

    expect(createRequest.properties.starterContent).toEqual({ type: "boolean" });
    expect(createRequest.properties.permissionTemplate.enum).toEqual([
      "standard",
      "player_authoring",
      "ai_assisted",
      "assistant_ops",
    ]);
    expect(snapshot.required).toContain("bundled");
    expect(snapshot.required).toContain("presences");
    expect(snapshot.properties.presences).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/CampaignPresence" },
    });
    expect(snapshot.properties.bundled).toEqual({
      $ref: "#/components/schemas/CampaignSnapshotBundled",
    });
    expect(snapshot.properties.history).toEqual({
      $ref: "#/components/schemas/SnapshotHistoryMeta",
    });
    expect(openApiSpec.components.schemas.SnapshotHistoryMeta.properties.collections).toEqual({
      type: "object",
      additionalProperties: { $ref: "#/components/schemas/SnapshotHistoryCollectionMeta" },
    });
    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/snapshot"]?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: "historyLimit", in: "query", required: false }),
    );
    expect(openApiSpec.components.schemas.CampaignPatchRequest.properties).not.toHaveProperty("archivedAt");
    expect(openApiSpec.components.schemas.CampaignPatchRequest.properties).not.toHaveProperty("archivedByUserId");
    expect(openApiSpec.components.schemas.CampaignPatchRequest.properties).not.toHaveProperty("restoredAt");
    expect(openApiSpec.components.schemas.CampaignPatchRequest.properties).not.toHaveProperty("restoredByUserId");
    expect(bundled.properties).toEqual(
      expect.objectContaining({
        assetStorage: expect.any(Object),
        audioTracks: expect.any(Object),
        plugins: expect.any(Object),
        systems: expect.any(Object),
        characterTemplates: expect.any(Object),
        contentImports: expect.any(Object),
        aiThreads: expect.any(Object),
        aiUsage: expect.any(Object),
        aiToolCalls: expect.any(Object),
        combatAudit: expect.any(Object),
      }),
    );
    expect(searchResult.properties.type.enum).toContain("roll");
  });

  it("documents reopenable saved encounter compositions", () => {
    const encounter = openApiSpec.components.schemas.Encounter;
    const createRequest = openApiSpec.components.schemas.EncounterCreateRequest;
    const planRequest = openApiSpec.components.schemas.SystemEncounterPlanRequest;
    const selection = openApiSpec.components.schemas.EncounterThreatSelection;

    expect(encounter.properties).toEqual(expect.objectContaining({
      systemId: { type: "string", minLength: 1 },
      partyActorIds: expect.objectContaining({ type: "array", maxItems: 100, uniqueItems: true }),
      threats: expect.objectContaining({ type: "array", maxItems: 100 })
    }));
    expect(createRequest.properties).toEqual(expect.objectContaining({
      systemId: { type: "string", minLength: 1 },
      partyActorIds: expect.any(Object),
      threats: expect.any(Object)
    }));
    expect(planRequest.properties.threats.items).toEqual({ $ref: "#/components/schemas/EncounterThreatSelection" });
    expect(selection).toMatchObject({
      additionalProperties: false,
      required: ["id", "count"],
      properties: { count: { type: "integer", minimum: 1, maximum: 99 } }
    });
  });

  it("documents the current reviewable plugin command and event bridge output", () => {
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
    expect(openApiSpec.components.schemas.PluginCampaignInfo.allOf[1].properties.versionCompatibility.items.required).toEqual(
      expect.arrayContaining(["version", "permissions", "permissionReview", "trust", "source"]),
    );
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
