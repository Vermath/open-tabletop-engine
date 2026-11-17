import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { actorSelectionAfterDelete } from "./actor-lifecycle-client.js";

const timestamp = "2026-07-18T00:00:00.000Z";
const actor = (id: string, type: Actor["type"]): Actor => ({ id, campaignId: "campaign-1", systemId: "generic-fantasy", name: id, type, permissions: {}, data: {}, createdAt: timestamp, updatedAt: timestamp });

describe("actor lifecycle client", () => {
  it("keeps selection on the same actor type when possible", () => {
    const deleted = actor("deleted", "character");
    expect(actorSelectionAfterDelete([deleted, actor("npc", "npc"), actor("character", "character")], deleted)).toBe("character");
  });

  it("falls back to another actor and then no selection", () => {
    const deleted = actor("deleted", "character");
    expect(actorSelectionAfterDelete([deleted, actor("npc", "npc")], deleted)).toBe("npc");
    expect(actorSelectionAfterDelete([deleted], deleted)).toBe("");
  });
});
