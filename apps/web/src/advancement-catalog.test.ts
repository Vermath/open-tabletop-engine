import { describe, expect, it } from "vitest";
import { shouldPreserveAdvancementCatalog } from "./advancement-catalog.js";

describe("advancement catalog recovery", () => {
  it("keeps the last good catalog only while retrying the same actor", () => {
    expect(shouldPreserveAdvancementCatalog("actor-1", "actor-1")).toBe(true);
    expect(shouldPreserveAdvancementCatalog("actor-1", "actor-2")).toBe(false);
    expect(shouldPreserveAdvancementCatalog("", "actor-1")).toBe(false);
  });
});
