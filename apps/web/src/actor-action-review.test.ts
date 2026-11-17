import { describe, expect, it } from "vitest";
import { actorActionConsequenceReview, actorActionRequest, committedActionStatus, preparedActionIsRoutine, type ActorActionResolutionPreview, type PreparedActorActionResponse } from "./actor-action-review.js";

function prepared(overrides: Partial<ActorActionResolutionPreview> = {}): Pick<PreparedActorActionResponse, "rolls" | "resolution"> {
  return {
    rolls: [{ label: "Longsword attack", formula: "1d20+5", total: 17, targetActorId: "goblin" }],
    resolution: {
      commitMode: "preview",
      action: { label: "Longsword", kind: "action" },
      rolls: [{ rollId: "longsword", label: "Longsword attack", formula: "1d20+5", targetActorId: "goblin" }],
      effects: [{ type: "damage", targetActorId: "goblin", targetActorName: "Goblin", amount: 7, damageType: "slashing", before: 9, after: 2 }],
      ...overrides
    }
  };
}

const isRoutine = (value: Pick<PreparedActorActionResponse, "rolls" | "resolution">) =>
  preparedActionIsRoutine(value, actorActionConsequenceReview("Valen Ash", value, { applyEffect: true, supportsEffect: true }));

describe("preparedActionIsRoutine", () => {
  it("accepts an attack the server resolved completely", () => {
    expect(isRoutine(prepared())).toBe(true);
  });

  it.each<[string, Partial<ActorActionResolutionPreview>]>([
    ["a blocked action", { blocked: { reason: "No action left this turn", code: "action-spent" } }],
    ["a DM decision", { manualResolutionRequired: { reason: "Cover needs a ruling", supportStatus: "manual" } }],
    ["an unsupported effect", { manualResolutionRequired: { reason: "Outside the typed model", supportStatus: "unsupported" } }],
    ["a pending choice", { pendingChoice: { reason: "Choose a damage type", options: ["fire", "cold"] } }],
    ["a required save", { pendingSaves: [{ actorId: "goblin", ability: "dex", dc: 13, reason: "Dexterity save", requiredForCommit: true }] }],
    ["an optional save", { pendingSaves: [{ actorId: "goblin", ability: "dex", reason: "Dexterity save" }] }],
    ["a pending reaction", { pendingReactions: [{ actorId: "goblin", reason: "Shield is available" }] }],
    ["a warning", { warnings: ["Target is out of the weapon's normal range"] }],
    ["attunement over the limit", { attunement: { limit: 3, attunedItemIds: ["a", "b", "c", "d"], overLimitBy: 1 } }],
    ["a death save", { deathSave: { outcome: "failure", successes: 0, failures: 2 } }],
    ["a Weapon Mastery choice", { weaponMastery: { property: "push", capability: "choice", status: "choice-required", message: "Choose whether to push", source: "SRD", sourcePage: 1, sourceUrl: "" } }],
    ["a manual Weapon Mastery step", { weaponMastery: { property: "cleave", capability: "manual", status: "manual-step", message: "Pick the second target", source: "SRD", sourcePage: 1, sourceUrl: "" } }]
  ])("sends %s to the review instead", (_label, overrides) => {
    expect(isRoutine(prepared(overrides))).toBe(false);
  });

  it("is not routine when the effect cannot be applied by the typed model", () => {
    const value = prepared();
    expect(preparedActionIsRoutine(value, actorActionConsequenceReview("Valen Ash", value, { applyEffect: true, supportsEffect: false }))).toBe(false);
  });
});

describe("committedActionStatus", () => {
  it("reports spent resources and applied effects", () => {
    expect(committedActionStatus("Valen Ash", { usage: { consumed: [{ label: "Second Wind", remaining: 1 }] }, effect: { type: "healing", targetActorId: "valen" } }, () => "")).toBe("Valen Ash used action: Second Wind 1; healing applied");
    expect(committedActionStatus("Valen Ash", { effect: { type: "damage", targetActorId: "goblin" } }, () => "")).toBe("Valen Ash action posted; damage applied");
    expect(committedActionStatus("Valen Ash", {}, () => "")).toBe("Valen Ash action posted");
  });

  it("leads with a death save when there is one", () => {
    const deathSave = { outcome: "success" as const, successes: 1, failures: 0 };
    expect(committedActionStatus("Valen Ash", { resolution: { commitMode: "commit", deathSave } }, () => "1 success")).toBe("Valen Ash Death Saving Throw: 1 success");
  });
});

describe("actorActionRequest", () => {
  it("carries every commit option the resolver reads", () => {
    expect(actorActionRequest("longsword", "2026-01-01T00:00:00.000Z", { consumeResources: true, applyEffect: true, targetActorId: "goblin", saveOutcomes: { goblin: "failure" }, effectChoice: "fire", weaponMastery: { use: true }, continuationId: "cont_1" }, "public")).toEqual({
      rollId: "longsword", expectedUpdatedAt: "2026-01-01T00:00:00.000Z", consumeResources: true, applyEffect: true, targetActorId: "goblin", visibility: "public",
      saveOutcomes: { goblin: "failure" }, effectChoice: "fire", weaponMastery: { use: true }, continuationId: "cont_1"
    });
  });
});
