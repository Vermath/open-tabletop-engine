import { describe, expect, it } from "vitest";

import { openApiSpec, routes } from "./index.js";

describe("D&D custom content API contract", () => {
  it("provides encoded route helpers for preview, collection, and entries", () => {
    expect(routes.dndCustomContent("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/custom-content");
    expect(routes.dndCustomContentPreview("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/custom-content/preview");
    expect(routes.dndCustomContentItem("campaign/one", "item/two")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/custom-content/item%2Ftwo");
    expect(routes.dndMonsterTemplates("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-templates");
    expect(routes.dndMonsterTemplatesPreview("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-templates/preview");
    expect(routes.dndMonsterTemplate("campaign/one", "template/two")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-templates/template%2Ftwo");
    expect(routes.dndMonsterBases("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-bases");
    expect(routes.dndMonsterVariants("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-variants");
    expect(routes.dndMonsterVariantsPreview("campaign/one")).toBe("/api/v1/campaigns/campaign%2Fone/dnd/monster-variants/preview");
  });

  it("documents typed reusable monster templates, immutable bases, explicit scaling, and exact diffs", () => {
    const overrides = openApiSpec.components.schemas.DndMonsterOverrides;
    expect(overrides.additionalProperties).toBe(false);
    expect(Object.keys(overrides.properties)).toEqual(expect.arrayContaining([
      "armorClass",
      "hitPoints",
      "challengeRating",
      "xp",
      "speed",
      "abilities",
      "actions",
      "traits",
    ]));
    expect(overrides.description).toContain("never infers");
    expect(openApiSpec.components.schemas.DndMonsterBaseReference.required).toEqual(["kind", "id", "version", "name", "provenance"]);
    expect(openApiSpec.components.schemas.DndMonsterVariantDraft.required).toEqual(expect.arrayContaining(["base", "overrides", "license"]));
    expect(openApiSpec.components.schemas.DndMonsterVariantMetadata.required).toEqual(expect.arrayContaining(["base", "overrides", "appliedOverrides"]));
    expect(openApiSpec.components.schemas.DndMonsterVariantPreviewResponse.required).toEqual(expect.arrayContaining(["variant", "diff", "warnings"]));
  });

  it("keeps template and variant previews read-only while writes are replay-safe and revisioned", () => {
    const root = "/api/v1/campaigns/{campaignId}/dnd";
    const templateCollection = openApiSpec.paths[`${root}/monster-templates`];
    const templateItem = openApiSpec.paths[`${root}/monster-templates/{templateId}`];
    const templatePreview = openApiSpec.paths[`${root}/monster-templates/preview`]?.post;
    const variantPreview = openApiSpec.paths[`${root}/monster-variants/preview`]?.post;
    const variantCreate = openApiSpec.paths[`${root}/monster-variants`]?.post;

    expect(templatePreview?.parameters ?? []).not.toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: true }));
    expect(variantPreview?.parameters ?? []).not.toContainEqual(expect.objectContaining({ name: "Idempotency-Key", required: true }));
    for (const operation of [templateCollection?.post, templateItem?.patch, templateItem?.delete, variantCreate]) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    }
    expect(templateCollection?.post?.requestBody).toEqual(expect.any(Object));
    expect(templateItem?.patch?.requestBody).toEqual(expect.any(Object));
    expect(templateItem?.delete?.parameters).toContainEqual(expect.objectContaining({ name: "expectedUpdatedAt", in: "query", required: false }));
    expect(templateItem?.delete?.requestBody).toEqual(expect.objectContaining({ required: false }));
    expect(variantCreate?.requestBody).toEqual(expect.any(Object));
  });

  it("documents the eight D&D-specific builders and provenance declaration", () => {
    const draft = openApiSpec.components.schemas.DndCustomContentDraft;
    expect(draft.required).toEqual(expect.arrayContaining([
      "kind",
      "name",
      "summary",
      "sourceName",
      "sourceVersion",
      "contentVersion",
      "license",
      "data"
    ]));
    expect(draft.properties.kind.enum).toEqual([
      "monster",
      "spell",
      "item",
      "feat",
      "species",
      "background",
      "subclass",
      "condition"
    ]);
    expect(draft.properties.data.description).toContain("not a universal rules DSL");
  });

  it("requires replay keys and supports reviewed delete revisions in a body or query", () => {
    const collection = openApiSpec.paths["/api/v1/campaigns/{campaignId}/dnd/custom-content"];
    const entry = openApiSpec.paths["/api/v1/campaigns/{campaignId}/dnd/custom-content/{itemId}"];
    for (const operation of [collection?.post, entry?.patch, entry?.delete]) {
      expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }));
    }
    expect(collection?.post?.requestBody).toEqual(expect.any(Object));
    expect(entry?.patch?.requestBody).toEqual(expect.any(Object));
    expect(entry?.delete?.requestBody).toEqual(expect.objectContaining({ required: false }));
    expect(entry?.delete?.parameters).toContainEqual(expect.objectContaining({
      name: "expectedUpdatedAt",
      in: "query",
      required: false,
      schema: { type: "string", format: "date-time" },
    }));
    expect(openApiSpec.paths["/api/v1/campaigns/{campaignId}/dnd/custom-content/preview"]?.post?.responses["422"]).toEqual(expect.any(Object));
  });
});
