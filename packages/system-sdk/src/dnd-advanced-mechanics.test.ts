import type { Actor, Combat, CombatEnvironmentMechanic } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  combatEnvironmentMechanicDue,
  evaluateDnd5eSrdEffectSchedules,
  previewDnd5eSrdSpellHelper
} from "./dnd-advanced-mechanics.js";

const timestamp = "2026-07-13T00:00:00.000Z";

function actorWithEffect(effect: Record<string, unknown>): Actor {
  return {
    id: "act_target",
    campaignId: "camp_demo",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_demo_gm",
    type: "character",
    name: "Target",
    data: {
      conditions: [{ id: "poisoned" }],
      rulesEngine: { activeEffects: [effect] }
    },
    permissions: {},
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const combat: Combat = {
  id: "cmb_advanced",
  campaignId: "camp_demo",
  active: true,
  round: 3,
  turnIndex: 1,
  combatants: [
    { id: "cmbt_fast", tokenId: "tok_fast", actorId: "act_fast", name: "Fast", initiative: 22, defeated: false },
    { id: "cmbt_target", tokenId: "tok_target", actorId: "act_target", name: "Target", initiative: 18, defeated: false }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("D&D advanced effect scheduling", () => {
  it("requires an explicit recurring-save outcome and removes owned conditions on success", () => {
    const actor = actorWithEffect({
      id: "effect_poison",
      label: "Persistent poison",
      ownedConditionIds: ["poisoned"],
      schedule: {
        timing: "end_turn",
        anchorActorId: actorWithEffect({}).id,
        nextRound: 3,
        intervalRounds: 1,
        repeatSave: { ability: "constitution", dc: 15, endsOn: "success" }
      }
    });
    const preview = evaluateDnd5eSrdEffectSchedules([actor], combat, { phase: "end_turn", now: timestamp });
    expect(preview).toMatchObject({ canApply: false, unresolvedEventIds: [expect.stringContaining("effect_poison")] });
    expect(preview.events).toEqual([expect.objectContaining({ status: "save_required", saveAbility: "constitution", saveDc: 15 })]);

    const eventId = preview.events[0]!.id;
    const resolved = evaluateDnd5eSrdEffectSchedules([actor], combat, {
      phase: "end_turn",
      now: timestamp,
      saveOutcomes: { [eventId]: "success" }
    });
    expect(resolved.canApply).toBe(true);
    expect(resolved.events).toEqual([expect.objectContaining({ status: "save_succeeded", outcome: "success" })]);
    expect(resolved.actorUpdates[0]?.after).toMatchObject({ conditions: [], rulesEngine: { activeEffects: [] } });
  });

  it("reschedules failed saves and expires absolute-time effects deterministically", () => {
    const actor = actorWithEffect({
      id: "effect_poison",
      label: "Persistent poison",
      ownedConditionIds: ["poisoned"],
      schedule: { timing: "end_turn", anchorActorId: "act_target", nextRound: 3, intervalRounds: 2, remainingTriggers: 2, repeatSave: { ability: "constitution", endsOn: "success" } }
    });
    const preview = evaluateDnd5eSrdEffectSchedules([actor], combat, { phase: "end_turn", now: timestamp });
    const failed = evaluateDnd5eSrdEffectSchedules([actor], combat, {
      phase: "end_turn",
      now: timestamp,
      saveOutcomes: { [preview.events[0]!.id]: "failure" }
    });
    expect(failed.actorUpdates[0]?.after).toMatchObject({
      rulesEngine: { activeEffects: [expect.objectContaining({ schedule: expect.objectContaining({ nextRound: 5, remainingTriggers: 1 }) })] }
    });

    const expiredActor = actorWithEffect({ id: "effect_clock", label: "Clock", ownedConditionIds: ["poisoned"], schedule: { timing: "time", expiresAt: "2026-07-12T23:59:59.000Z" } });
    const expired = evaluateDnd5eSrdEffectSchedules([expiredActor], combat, { phase: "time", now: timestamp });
    expect(expired.events).toEqual([expect.objectContaining({ status: "expired" })]);
    expect(expired.actorUpdates[0]?.after).toMatchObject({ conditions: [], rulesEngine: { activeEffects: [] } });
  });
});

describe("D&D regional, lair, and specialized spell helpers", () => {
  it("marks initiative-count lair prompts due once per scheduled round", () => {
    const mechanic: CombatEnvironmentMechanic = {
      id: "mech_lair",
      kind: "lair_action",
      name: "Lair pulse",
      description: "Choose an audited lair action.",
      visibility: "gm_only",
      enabled: true,
      schedule: { timing: "initiative_count", initiativeCount: 20, startsAtRound: 1, intervalRounds: 1 },
      options: [],
      triggerCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    expect(combatEnvironmentMechanicDue(mechanic, combat)).toBe(true);
    expect(combatEnvironmentMechanicDue({ ...mechanic, lastTriggeredRound: 3 }, combat)).toBe(false);
  });

  it("builds bounded SRD-backed previews without inferring map targets", () => {
    const missile = previewDnd5eSrdSpellHelper({
      spell: { id: "magic-missile", name: "Magic Missile", data: { level: 1 } },
      casterActorId: "act_caster",
      targetActorIds: ["act_a", "act_b"],
      slotLevel: 2,
      options: { dartAssignments: { act_a: 3, act_b: 1 } }
    });
    expect(missile).toMatchObject({ supported: true, targetLimit: 4, summary: "4 darts allocated across 2 targets." });
    expect(missile.rolls).toEqual([
      expect.objectContaining({ targetActorId: "act_a", formula: "3d4+3" }),
      expect.objectContaining({ targetActorId: "act_b", formula: "1d4+1" })
    ]);

    const moonbeam = previewDnd5eSrdSpellHelper({
      spell: { id: "moonbeam", name: "Moonbeam", data: { level: 2, damageFormula: "2d10", upcastFormula: "1d10", save: { ability: "constitution", success: "half" } } },
      casterActorId: "act_caster",
      targetActorIds: ["act_a"],
      slotLevel: 4,
      currentRound: 3
    });
    expect(moonbeam.rolls).toEqual([expect.objectContaining({ formula: "2d10+2d10", targetActorId: "act_a" })]);
    expect(moonbeam.scheduleTemplates[0]).toMatchObject({ schedule: { timing: "start_turn", nextRound: 3, expiresAtRound: 13 } });
    expect(moonbeam.warnings.join(" ")).toContain("DM adjudication");
  });
});
