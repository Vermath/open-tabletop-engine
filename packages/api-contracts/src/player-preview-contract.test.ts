import { describe, expect, it } from "vitest";
import { openApiSpec, routes } from "./index.js";
describe("read-only player preview contract", () => {
  it("provides the encoded route and exact player identity response", () => {
    expect(routes.scenePlayerPreview("scene/one")).toBe("/api/v1/scenes/scene%2Fone/player-preview");
    const operation = openApiSpec.paths["/api/v1/scenes/{sceneId}/player-preview"]?.get;
    expect(operation?.parameters).toContainEqual(expect.objectContaining({ name: "userId", in: "query", required: true }));
    expect(operation?.description).toContain("Private player conversations");
    expect(openApiSpec.components.schemas.PlayerPreviewResponse).toEqual(expect.objectContaining({ required: ["readOnly", "player", "snapshot"] }));
    expect(openApiSpec.components.schemas.PlayerPreviewResponse.properties?.snapshot).toEqual({ $ref: "#/components/schemas/PlayerPreviewSnapshot" });
  });
});
