import type { Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { actorActionConsequenceReview } from "./actor-action-review.js";
import { actorActionOptions } from "./actor-sheet-data.js";

const fighter: Actor = {
  id: "actor-fighter",
  campaignId: "campaign-1",
  systemId: "dnd-5e-srd",
  type: "pc",
  name: "Ari",
  permissions: {},
  data: { class: "Fighter", level: 2, resources: { actionSurge: { current: 1, max: 1 } } },
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

describe("D&D standard Action economy UI", () => {
  it("states the exact Action Surge consequence", () => {
    expect(actorActionOptions(fighter, []).find((action) => action.rollId === "feature-action-surge")?.description)
      .toBe("Action Surge: spend one use and grant exactly one additional Action this turn");
  });

  it("keeps the authoritative Action ledger in the exact prepared-action review", () => {
    const review = actorActionConsequenceReview("Ari", {
      resolution: {
        commitMode: "preview",
        action: { label: "Longsword", kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } }
      }
    });

    expect(review.sections.find((section) => section.id === "action")?.items).toContainEqual({ label: "Turn ledger", value: "1 used; 0 Action Surge grants" });
    expect(review.source).toBe("D&D 5e SRD server resolver");
  });
});
