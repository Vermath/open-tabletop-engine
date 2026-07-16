import { describe, expect, it } from "vitest";
import { aiToolCallErrorCode, scimMappingLabel } from "./admin-panel-utils.js";

describe("admin panel utilities", () => {
  it("keeps SCIM and tool failure labels available without loading the admin workspace", () => {
    expect(scimMappingLabel({ id: "mapping-1", campaignId: "campaign-1", role: "player", groupId: "group-1", targetSetHash: "hash-1", createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z" })).toBe("group-1");
    expect(aiToolCallErrorCode({ error: " tool_failed " })).toBe("tool_failed");
    expect(aiToolCallErrorCode({ error: "" })).toBeUndefined();
  });
});
