import { createTimestamped, type Actor } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import {
  dnd5eSrdDeathSaveChatSuffix,
  dnd5eSrdDeathSaveEligibility,
  dnd5eSrdNaturalD20FromRollTerms,
  resolveDnd5eSrdDeathSavingThrowRoll
} from "./dnd-combat-progression.js";
import { healDnd5eSrdActorFromZero } from "./dnd-rules-completion.js";
import { resolveDnd5eSrdAction, dnd5eSrdDeathSavingThrow } from "./index.js";

function actor(data: Record<string, unknown>, type = "character"): Actor {
  return createTimestamped("act", {
    id: "act_dying", campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type, name: "Dying Hero", data, permissions: {},
  });
}

function dyingActor(overrides: Record<string, unknown> = {}): Actor {
  return actor({ hp: { current: 0, max: 12 }, conditions: [{ id: "unconscious" }], lifeState: "unconscious", deathSaves: { successes: 0, failures: 0 }, ...overrides });
}

describe("Death Saving Throw eligibility", () => {
  it("permits only a character at 0 HP that is neither dead nor Stable", () => {
    expect(dnd5eSrdDeathSaveEligibility(dyingActor())).toEqual({ eligible: true });
    // Raw 0-HP data without lifecycle normalization (for example the HP steppers) is still eligible.
    expect(dnd5eSrdDeathSaveEligibility(actor({ hp: { current: 0, max: 7 } }))).toEqual({ eligible: true });
  });

  it("rejects monsters, healthy creatures, missing HP, the dead, and the Stable with clear reasons", () => {
    const monster = dnd5eSrdDeathSaveEligibility(actor({ hp: { current: 0, max: 10 } }, "monster"));
    expect(monster).toMatchObject({ eligible: false, code: "death_save_not_applicable" });
    expect((monster as { reason: string }).reason).toContain("monsters die at 0 Hit Points");
    expect(dnd5eSrdDeathSaveEligibility(actor({ hp: { current: 5, max: 12 } }))).toMatchObject({ eligible: false, reason: expect.stringContaining("has 5 HP") });
    expect(dnd5eSrdDeathSaveEligibility(actor({}))).toMatchObject({ eligible: false, reason: expect.stringContaining("no tracked Hit Points") });
    expect(dnd5eSrdDeathSaveEligibility(dyingActor({ lifeState: "dead", conditions: [{ id: "dead" }] }))).toMatchObject({ eligible: false, reason: expect.stringContaining("is dead") });
    expect(dnd5eSrdDeathSaveEligibility(dyingActor({ lifeState: "stable", conditions: [{ id: "unconscious" }, { id: "stable" }] }))).toMatchObject({ eligible: false, reason: expect.stringContaining("Stable") });
    // A dead condition wins even when HP was later edited above zero.
    expect(dnd5eSrdDeathSaveEligibility(actor({ hp: { current: 4, max: 12 }, conditions: [{ id: "dead" }] }))).toMatchObject({ eligible: false, reason: expect.stringContaining("is dead") });
  });
});

describe("Death Saving Throw resolution", () => {
  it("counts a 10+ as a success and below 10 as a failure", () => {
    const success = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 10, naturalD20: 10 });
    expect(success.deathSave).toEqual({ outcome: "success", successes: 1, failures: 0 });
    expect(success.data).toMatchObject({ deathSaves: { successes: 1, failures: 0 }, lifeState: "unconscious", defeated: false });

    const failure = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 9, naturalD20: 9 });
    expect(failure.deathSave).toEqual({ outcome: "failure", successes: 0, failures: 1 });
    expect(failure.data).toMatchObject({ deathSaves: { successes: 0, failures: 1 }, lifeState: "unconscious" });
  });

  it("uses the modified total for the threshold, not the natural die", () => {
    // Exhaustion -2 can turn a natural 11 into a 9: that is a failure.
    const penalized = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 9, naturalD20: 11 });
    expect(penalized.deathSave.outcome).toBe("failure");
    // A blessed +1d4 can turn a natural 8 into a 10: that is a success.
    const blessed = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 10, naturalD20: 8 });
    expect(blessed.deathSave.outcome).toBe("success");
  });

  it("treats a natural 1 as two failures", () => {
    const result = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 6, naturalD20: 1 });
    expect(result.deathSave).toEqual({ outcome: "critical-failure", successes: 0, failures: 2 });
    expect(result.data).toMatchObject({ deathSaves: { successes: 0, failures: 2 }, lifeState: "unconscious" });
  });

  it("restores 1 HP, consciousness, and reset counters on a natural 20", () => {
    const result = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor({ deathSaves: { successes: 2, failures: 2 } }), { total: 20, naturalD20: 20 });
    expect(result.deathSave).toEqual({ outcome: "critical-success", successes: 0, failures: 0, result: "revived", hitPointsRestored: 1 });
    expect(result.data).toMatchObject({ hp: { current: 1, max: 12 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious", defeated: false });
    expect(result.data.conditions).toEqual([]);
  });

  it("stabilizes on the third success", () => {
    const result = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor({ deathSaves: { successes: 2, failures: 1 } }), { total: 15, naturalD20: 15 });
    // The terminal summary preserves what the roll did for chat/audit.
    expect(result.deathSave).toEqual({ outcome: "success", successes: 3, failures: 1, result: "stable" });
    // Persisted Stable state resets both counters.
    expect(result.data).toMatchObject({ lifeState: "stable", deathSaves: { successes: 0, failures: 0 }, defeated: false });
    expect(result.data.conditions).toEqual([{ id: "unconscious" }, { id: "stable" }]);
  });

  it("dies on the third failure, including a natural 1 from one prior failure", () => {
    const third = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor({ deathSaves: { successes: 1, failures: 2 } }), { total: 4, naturalD20: 4 });
    expect(third.deathSave).toEqual({ outcome: "failure", successes: 1, failures: 3, result: "dead" });
    expect(third.data).toMatchObject({ lifeState: "dead", defeated: true, deathSaves: { successes: 1, failures: 3 } });
    expect(third.data.conditions).toEqual([{ id: "dead" }]);

    const critical = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor({ deathSaves: { successes: 0, failures: 1 } }), { total: 8, naturalD20: 1 });
    expect(critical.deathSave).toEqual({ outcome: "critical-failure", successes: 0, failures: 3, result: "dead" });
    expect(critical.data).toMatchObject({ lifeState: "dead", defeated: true });
  });

  it("throws for ineligible actors and non-finite totals", () => {
    expect(() => resolveDnd5eSrdDeathSavingThrowRoll(actor({ hp: { current: 5, max: 12 } }), { total: 12 })).toThrow(/0 Hit Points/);
    expect(() => resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: Number.NaN })).toThrow(/rolled total/);
  });

  it("resets counters when healing brings the creature above 0 HP", () => {
    const failed = resolveDnd5eSrdDeathSavingThrowRoll(dyingActor(), { total: 3, naturalD20: 3 });
    const healed = healDnd5eSrdActorFromZero({ ...dyingActor(), data: failed.data }, 4);
    expect(healed).toMatchObject({ hp: { current: 4, max: 12 }, deathSaves: { successes: 0, failures: 0 }, lifeState: "conscious" });
  });
});

describe("natural d20 extraction", () => {
  it("reads the kept die of the first d20 term", () => {
    expect(dnd5eSrdNaturalD20FromRollTerms([{ type: "die", sides: 20, count: 1, results: [14], kept: [14] }])).toBe(14);
    expect(dnd5eSrdNaturalD20FromRollTerms([
      { type: "die", sides: 20, count: 2, results: [3, 18], kept: [18], keep: "highest", keepCount: 1 },
      { type: "modifier", value: 2 }
    ])).toBe(18);
    expect(dnd5eSrdNaturalD20FromRollTerms([
      { type: "die", sides: 20, count: 1, results: [20], kept: [20] },
      { type: "die", sides: 4, count: 1, results: [2], kept: [2] }
    ])).toBe(20);
  });

  it("returns undefined without exactly one kept d20", () => {
    expect(dnd5eSrdNaturalD20FromRollTerms([{ type: "die", sides: 6, count: 1, results: [4], kept: [4] }])).toBeUndefined();
    expect(dnd5eSrdNaturalD20FromRollTerms([{ type: "die", sides: 20, count: 2, results: [4, 9], kept: [4, 9] }])).toBeUndefined();
    expect(dnd5eSrdNaturalD20FromRollTerms([{ type: "modifier", value: 3 }])).toBeUndefined();
    expect(dnd5eSrdNaturalD20FromRollTerms([])).toBeUndefined();
  });
});

describe("death-save chat suffix", () => {
  it("summarizes ordinary and terminal outcomes", () => {
    expect(dnd5eSrdDeathSaveChatSuffix({ outcome: "success", successes: 1, failures: 0 })).toBe("success (1/3 successes, 0/3 failures)");
    expect(dnd5eSrdDeathSaveChatSuffix({ outcome: "critical-failure", successes: 0, failures: 2 })).toBe("natural 1: two failures (0/3 successes, 2/3 failures)");
    expect(dnd5eSrdDeathSaveChatSuffix({ outcome: "critical-success", successes: 0, failures: 0, result: "revived", hitPointsRestored: 1 })).toBe("natural 20: regains 1 Hit Point and is conscious");
    expect(dnd5eSrdDeathSaveChatSuffix({ outcome: "success", successes: 3, failures: 1, result: "stable" })).toBe("third success: Stable (3/3 successes, 1/3 failures)");
    expect(dnd5eSrdDeathSaveChatSuffix({ outcome: "failure", successes: 0, failures: 3, result: "dead" })).toBe("third failure: dead (0/3 successes, 3/3 failures)");
  });
});

describe("death saves inside resolveDnd5eSrdAction", () => {
  it("is not blocked by the Unconscious action gate and applies the rolled transition on commit", () => {
    const source = dyingActor();
    const roll = dnd5eSrdDeathSavingThrow(source);
    const resolution = resolveDnd5eSrdAction({
      actor: source,
      roll,
      options: { commit: true, selfRollResult: { total: 14, naturalD20: 14 } }
    });
    expect(resolution.blocked).toBeUndefined();
    expect(resolution.deathSave).toEqual({ outcome: "success", successes: 1, failures: 0 });
    expect(resolution.actorUpdates).toHaveLength(1);
    expect(resolution.actorUpdates[0]!.after).toMatchObject({ deathSaves: { successes: 1, failures: 0 }, lifeState: "unconscious" });
    expect(resolution.auditEvents).toContainEqual(expect.objectContaining({ code: "death-save", actorId: source.id }));
  });

  it("blocks an ineligible commit before any state change and stays quiet in preview", () => {
    const healthy = actor({ hp: { current: 9, max: 12 }, conditions: [] });
    const roll = dnd5eSrdDeathSavingThrow(healthy);
    const commit = resolveDnd5eSrdAction({ actor: healthy, roll, options: { commit: true } });
    expect(commit.blocked).toMatchObject({ code: "death_save_not_applicable" });
    expect(commit.actorUpdates).toHaveLength(0);

    const preview = resolveDnd5eSrdAction({ actor: healthy, roll, options: { commit: false } });
    expect(preview.commitMode).toBe("preview");
    expect(preview.actorUpdates).toHaveLength(0);
  });

  it("reports the healing effect for a natural 20", () => {
    const source = dyingActor({ deathSaves: { successes: 1, failures: 2 } });
    const resolution = resolveDnd5eSrdAction({
      actor: source,
      roll: dnd5eSrdDeathSavingThrow(source),
      options: { commit: true, selfRollResult: { total: 20, naturalD20: 20 } }
    });
    expect(resolution.deathSave).toMatchObject({ result: "revived", hitPointsRestored: 1 });
    expect(resolution.effects).toContainEqual(expect.objectContaining({ type: "healing", targetActorId: source.id, amount: 1 }));
    expect(resolution.actorUpdates[0]!.after).toMatchObject({ hp: { current: 1, max: 12 }, lifeState: "conscious" });
  });

  it("makes no transition on commit when the server has not supplied the rolled result", () => {
    const source = dyingActor();
    const resolution = resolveDnd5eSrdAction({ actor: source, roll: dnd5eSrdDeathSavingThrow(source), options: { commit: true } });
    expect(resolution.blocked).toBeUndefined();
    expect(resolution.deathSave).toBeUndefined();
    expect(resolution.actorUpdates).toHaveLength(0);
  });
});
