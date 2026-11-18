import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";

describe("rollable table contracts", () => {
  it("encodes stable campaign/table IDs and reserves table attribution for server responses", () => {
    expect(routes.drawRollableTable("camp/a", "tbl/b")).toBe("/api/v1/campaigns/camp%2Fa/rollable-tables/tbl%2Fb/draw");
    const { schemas } = openApiSpec.components;
    expect(schemas.ChatMessage.properties).toHaveProperty("rollableTableId");
    expect(schemas.ChatMessageCreateRequest.properties).not.toHaveProperty("rollableTableId");
    const draw = openApiSpec.paths["/api/v1/campaigns/{campaignId}/rollable-tables/{tableId}/draw"]?.post;
    expect(draw?.parameters).toContainEqual(expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true }));
    expect(draw?.responses["200"]).toMatchObject({ content: { "application/json": { schema: { $ref: "#/components/schemas/ChatMessage" } } } });
  });
});
