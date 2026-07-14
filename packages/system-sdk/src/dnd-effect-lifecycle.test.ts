import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdEffectLifecycle, endDnd5eSrdConcentration } from "./dnd-effect-lifecycle.js";

function actor(id: string, data: Record<string, unknown>): Actor {
  return createTimestamped("act", {
    id,
    campaignId: "camp_lifecycle",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_gm",
    type: "character" as const,
    name: id,
    data,
    permissions: {}
  });
}

function combat(round: number, conditions: string[] = [], turnIndex = 0): Pick<Combat, "round" | "turnIndex" | "combatants"> {
  return {
    round,
    turnIndex,
    combatants: [
      { id: "cmbt_source", tokenId: "tok_source", actorId: "act_source", name: "Source", initiative: 20, defeated: false, conditions },
      { id: "cmbt_target", tokenId: "tok_target", actorId: "act_target", name: "Target", initiative: 10, defeated: false, conditions: ["frightened:1"] }
    ]
  };
}

function linkedActors(): Actor[] {
  const startedAt = "2026-07-13T00:00:00.000Z";
  return [
    actor("act_source", {
      conditions: [{ id: "concentration" }],
      rulesEngine: {
        concentration: {
          rollId: "spell-fear",
          sourceActorId: "act_source",
          targetActorIds: ["act_target"],
          startedAt,
          startedAtRound: 1,
          durationRounds: 2,
          expiresAtRound: 3
        },
        activeEffects: [
          { id: "source-fear", rollId: "spell-fear", sourceActorId: "act_source", startedAt, concentration: true, startedAtRound: 1, durationRounds: 2, expiresAtRound: 3 }
        ]
      }
    }),
    actor("act_target", {
      conditions: [{ id: "frightened" }, { id: "prone" }],
      rulesEngine: {
        activeEffects: [
          {
            id: "target-fear",
            rollId: "spell-fear",
            sourceActorId: "act_source",
            targetActorId: "act_target",
            startedAt,
            concentration: true,
            ownedConditionIds: ["frightened"],
            conditionIds: ["frightened"],
            expiresAtRound: 3
          },
          { id: "unrelated", rollId: "trip", sourceActorId: "act_other", ownedConditionIds: ["prone"], conditionIds: ["prone"] }
        ]
      }
    })
  ];
}

describe("D&D effect lifecycle", () => {
  it("expires source and linked target effects at the authoritative combat round without leaving owned conditions", () => {
    const actors = linkedActors();
    expect(advanceDnd5eSrdEffectLifecycle(actors, combat(2), { phase: "start_round" }).actorUpdates).toEqual([]);

    const result = advanceDnd5eSrdEffectLifecycle(actors, combat(3), { phase: "start_round" });
    const updates = new Map(result.actorUpdates.map((update) => [update.actorId, update.after]));
    expect(result.concentrationCleanups).toEqual([
      expect.objectContaining({ sourceActorId: "act_source", rollId: "spell-fear", targetActorIds: ["act_target"], reason: "expired" })
    ]);
    expect(updates.get("act_source")?.conditions).toEqual([]);
    expect((updates.get("act_source")?.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
    expect((updates.get("act_source")?.rulesEngine as { activeEffects: unknown[] }).activeEffects).toEqual([]);
    expect(updates.get("act_target")?.conditions).toEqual([{ id: "prone" }]);
    expect((updates.get("act_target")?.rulesEngine as { activeEffects: Array<{ id: string }> }).activeEffects).toEqual([expect.objectContaining({ id: "unrelated" })]);
  });

  it("breaks concentration on incapacitation and cleans linked actors before the duration expires", () => {
    const actors = linkedActors();
    const result = advanceDnd5eSrdEffectLifecycle(actors, combat(2, ["incapacitated"]), { phase: "start_turn" });
    const updates = new Map(result.actorUpdates.map((update) => [update.actorId, update.after]));
    expect(result.concentrationCleanups).toEqual([expect.objectContaining({ reason: "incapacitated" })]);
    expect((updates.get("act_source")?.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
    expect(updates.get("act_target")?.conditions).toEqual([{ id: "prone" }]);
  });

  it("does not expire an end-of-turn effect at the start of its expiration round or on another actor's turn", () => {
    const scheduled = [actor("act_source", {
      rulesEngine: {
        activeEffects: [{
          id: "end-source-turn",
          expiresAtRound: 3,
          ownedConditionIds: ["frightened"],
          schedule: { timing: "end_turn", anchorActorId: "act_source", expiresAtRound: 3 }
        }]
      },
      conditions: [{ id: "frightened" }]
    })];

    expect(advanceDnd5eSrdEffectLifecycle(scheduled, combat(3), { phase: "start_round" }).actorUpdates).toEqual([]);
    expect(advanceDnd5eSrdEffectLifecycle(scheduled, combat(3, [], 1), { phase: "end_turn" }).actorUpdates).toEqual([]);
    const expired = advanceDnd5eSrdEffectLifecycle(scheduled, combat(3, [], 0), { phase: "end_turn" });
    expect(expired.actorUpdates).toHaveLength(1);
    expect(expired.actorUpdates[0]?.after.conditions).toEqual([]);
  });

  it("ends concentration voluntarily as one pure source-and-target update set", () => {
    const result = endDnd5eSrdConcentration(linkedActors(), "act_source");
    expect(result.ended).toBe(true);
    expect(result.actorUpdates.map((update) => update.actorId).sort()).toEqual(["act_source", "act_target"]);
    expect(result.concentrationCleanups).toEqual([expect.objectContaining({ reason: "ended" })]);
    expect(endDnd5eSrdConcentration(linkedActors(), "missing").ended).toBe(false);
  });
});
