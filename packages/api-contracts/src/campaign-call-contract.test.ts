import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("campaign call contract", () => {
  it("provides the encoded route and a response that is either off or a complete room", () => {
    expect(routes.campaignCall("camp/one")).toBe("/api/v1/campaigns/camp%2Fone/call");
    const operation = openApiSpec.paths["/api/v1/campaigns/{campaignId}/call"]?.get;
    expect(operation?.description).toContain("Requires campaign.read");
    expect(operation?.description).toContain("OTTE_CALL_EMBED_URL");
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(["200", "403", "404"]));
    const schema = openApiSpec.components.schemas.CampaignCallResponse;
    expect(schema).toEqual(expect.objectContaining({ additionalProperties: false, required: ["enabled"] }));
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["enabled", "origin", "provider", "url"]);
  });

  it("is a read: the room lookup has no mutating method", () => {
    expect(Object.keys(openApiSpec.paths["/api/v1/campaigns/{campaignId}/call"] ?? {})).toEqual(["get"]);
  });
});
