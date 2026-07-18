import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { advanceDnd5eSrdCombatRules, synchronizeDnd5eSrdActorCombatState, synchronizeDnd5eSrdCombatantActorState } from "./dnd-combat-progression.js";

const now = "2026-07-13T12:00:00.000Z";

function actor(id: string, type: string, data: Record<string, unknown>): Actor {
  return createTimestamped("act", {
    id, campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type, name: id, data, permissions: {},
  });
}

function combat(actors: Actor[], round = 3): Pick<Combat, "id" | "round" | "turnIndex" | "combatants"> {
  return {
    id: "cmb_progression",
    round,
    turnIndex: 0,
    combatants: actors.map((entry, index) => ({
      id: `cmbt_${entry.id}`, tokenId: `tok_${entry.id}`, actorId: entry.id, name: entry.name,
      initiative: 20 - index, defeated: false, conditions: [],
    })),
  };
}

describe("D&D combat rules progression", () => {
  it("grants Champion Heroic Warrior inspiration at the start of its turn", () => {
    const champion = actor("champion", "character", {
      hp: { current: 80, max: 80 },
      features: ["Improved Critical", "Heroic Warrior"],
      heroicInspiration: false,
      conditions: []
    });
    const result = advanceDnd5eSrdCombatRules({ actors: [champion], combat: combat([champion]), phase: "start_turn", now });
    expect(result.actorDataPatches).toEqual([expect.objectContaining({ actorId: "champion", reason: expect.stringContaining("heroic-warrior"), data: expect.objectContaining({ heroicInspiration: true }) })]);
  });

  it("refreshes the active actor's reaction and turn-action ledger at the start of its turn", () => {
    const ready = actor("ready", "character", {
      hp: { current: 10, max: 10 },
      conditions: [],
      rulesEngine: {
        reactions: { cmb: { rollId: "old-reaction", round: 2 } },
        actionEconomy: { bonusActions: { cmb: { rollId: "old-bonus", round: 2, turnIndex: 0 } }, standardActions: { cmb: { actorId: "ready", actionsUsed: 1, actionSurgeGrants: 1, round: 2, turnIndex: 0 } } }
      }
    });
    const result = advanceDnd5eSrdCombatRules({ actors: [ready], combat: combat([ready]), phase: "start_turn", now });
    expect(result.actorDataPatches[0]).toMatchObject({ actorId: "ready", reason: expect.stringContaining("turn-action-economy-refresh"), data: { rulesEngine: { reactions: {}, actionEconomy: { bonusActions: {}, standardActions: {} } } } });
  });

  it("blocks an unresolved recurring save while still returning complete preview patches", () => {
    const target = actor("target", "character", {
      hp: { current: 0, max: 20 },
      conditions: [{ id: "poisoned" }],
      rulesEngine: { activeEffects: [{
        id: "effect_poison", label: "Persistent poison", ownedConditionIds: ["poisoned"],
        schedule: { timing: "end_turn", anchorActorId: "target", nextRound: 3, intervalRounds: 1, repeatSave: { ability: "constitution", dc: 15, endsOn: "success" } },
      }] },
    });
    const currentCombat = combat([target]);
    const preview = advanceDnd5eSrdCombatRules({ actors: [target], combat: currentCombat, phase: "end_turn", now });

    expect(preview.canApply).toBe(false);
    expect(preview.unresolvedEventIds).toEqual([preview.events[0]!.id]);
    expect(preview.events[0]).toMatchObject({ status: "save_required", saveAbility: "constitution", saveDc: 15 });
    expect(preview.actorDataPatches).toEqual([expect.objectContaining({ actorId: "target", data: expect.objectContaining({ lifeState: "unconscious", deathSaves: { successes: 0, failures: 0 } }) })]);
    expect(preview.combatantUpdates[0]?.after).toEqual(expect.objectContaining({ conditions: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0, defeated: false }));

    const resolved = advanceDnd5eSrdCombatRules({
      actors: [target], combat: currentCombat, phase: "end_turn", now,
      saveOutcomes: { [preview.events[0]!.id]: "success" },
    });
    expect(resolved.canApply).toBe(true);
    expect(resolved.unresolvedEventIds).toEqual([]);
    expect(resolved.actorUpdates[0]?.after).toMatchObject({
      conditions: [{ id: "unconscious" }],
      rulesEngine: { activeEffects: [] },
      lifeState: "unconscious",
    });
  });

  it("breaks concentration at zero hit points and cleans linked target effects in the same transaction", () => {
    const source = actor("source", "character", {
      hp: { current: 0, max: 18 }, conditions: [{ id: "concentration" }],
      rulesEngine: {
        concentration: { rollId: "spell-hold", sourceActorId: "source", targetActorIds: ["target"] },
        activeEffects: [{ id: "source-hold", rollId: "spell-hold", sourceActorId: "source", concentration: true }],
      },
    });
    const target = actor("target", "character", {
      hp: { current: 12, max: 12 }, conditions: [{ id: "paralyzed" }],
      rulesEngine: { activeEffects: [{ id: "target-hold", rollId: "spell-hold", sourceActorId: "source", targetActorId: "target", concentration: true, ownedConditionIds: ["paralyzed"] }] },
    });
    const result = advanceDnd5eSrdCombatRules({ actors: [source, target], combat: combat([source, target]), phase: "start_turn", now });
    const updates = new Map(result.actorUpdates.map((update) => [update.actorId, update.after]));

    expect(result.canApply).toBe(true);
    expect(result.concentrationCleanups).toEqual([expect.objectContaining({ sourceActorId: "source", rollId: "spell-hold", reason: "incapacitated" })]);
    expect(updates.get("source")).toMatchObject({ lifeState: "unconscious", conditions: [{ id: "unconscious" }] });
    expect((updates.get("source")?.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
    expect(updates.get("target")).toMatchObject({ lifeState: "conscious", conditions: [] });
  });

  it("synchronizes healing and monster defeat into actor and combatant replacements", () => {
    const healed = actor("hero", "character", {
      hp: { current: 5, max: 20 }, lifeState: "stable", deathSaves: { successes: 3, failures: 1 },
      conditions: [{ id: "unconscious" }, { id: "stable" }, { id: "prone" }], defeated: true,
    });
    const healedCombatant = { id: "cmbt_hero", tokenId: "tok_hero", actorId: "hero", name: "Hero", initiative: 10, defeated: true, conditions: ["unconscious", "stable", "prone"], deathSaveSuccesses: 3, deathSaveFailures: 1 };
    const sync = synchronizeDnd5eSrdActorCombatState(healed, healedCombatant);
    expect(sync.actorDataPatch?.data).toMatchObject({ lifeState: "conscious", deathSaves: { successes: 0, failures: 0 }, defeated: false, conditions: [{ id: "prone" }] });
    expect(sync.combatantUpdate?.after).toEqual(expect.objectContaining({ defeated: false, conditions: ["prone"] }));
    expect(sync.combatantUpdate?.after).not.toHaveProperty("deathSaveSuccesses");

    // SRD 5.2.1 default: a monster at 0 HP dies rather than falling unconscious.
    const monster = actor("monster", "monster", { hp: { current: 0, max: 30 }, conditions: [] });
    const defeated = advanceDnd5eSrdCombatRules({ actors: [monster], combat: combat([monster]), phase: "start_turn", now });
    expect(defeated.actorDataPatches[0]?.data).toMatchObject({ lifeState: "defeated", defeated: true, conditions: [{ id: "dead" }] });
    expect(defeated.combatantUpdates[0]?.after).toMatchObject({ defeated: true, conditions: ["dead"] });

    // The explicit per-instance GM exception knocks the individual out instead.
    const spared = actor("spared", "monster", { hp: { current: 0, max: 30 }, conditions: [], zeroHpBehavior: "knockout" });
    const knockedOut = advanceDnd5eSrdCombatRules({ actors: [spared], combat: combat([spared]), phase: "start_turn", now });
    expect(knockedOut.actorDataPatches[0]?.data).toMatchObject({ lifeState: "defeated", defeated: true, conditions: [{ id: "unconscious" }] });
    expect(knockedOut.combatantUpdates[0]?.after).toMatchObject({ defeated: true, conditions: ["unconscious"] });
  });

  it("does not let a stale combatant Stable marker overwrite a new death-save failure", () => {
    const damaged = actor("hero", "character", {
      hp: { current: 0, max: 20 },
      lifeState: "unconscious",
      deathSaves: { successes: 0, failures: 1 },
      conditions: [{ id: "unconscious" }],
      defeated: false,
    });
    const staleStableCombatant = {
      id: "cmbt_hero",
      tokenId: "tok_hero",
      actorId: "hero",
      name: "Hero",
      initiative: 10,
      defeated: false,
      conditions: ["unconscious", "stable"],
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      deathSaveOutcome: "stable" as const,
    };

    const sync = synchronizeDnd5eSrdActorCombatState(damaged, staleStableCombatant);

    expect(sync.actorDataPatch).toBeUndefined();
    expect(sync.combatantUpdate?.after).toMatchObject({
      defeated: false,
      conditions: ["unconscious"],
      deathSaveSuccesses: 0,
      deathSaveFailures: 1,
    });
    expect(sync.combatantUpdate?.after).not.toHaveProperty("deathSaveOutcome");
  });

  it("rejects combatant lifecycle states that contradict positive Hit Points", () => {
    const living = actor("living", "character", { hp: { current: 18, max: 20 }, conditions: [], lifeState: "conscious", deathSaves: { successes: 0, failures: 0 } });
    const impossible = synchronizeDnd5eSrdCombatantActorState(living, {
      id: "cmbt_living", tokenId: "tok_living", actorId: living.id, name: living.name,
      initiative: 10, defeated: false, conditions: ["stable"], deathSaveOutcome: "stable"
    }, now);
    expect(impossible).toEqual({ ok: false, error: expect.stringContaining("positive-HP actor") });
  });

  it("does not let a combatant edit revive an actor that is already dead", () => {
    const dead = actor("dead", "character", { hp: { current: 0, max: 20 }, conditions: [{ id: "dead" }], lifeState: "dead", deathSaves: { successes: 0, failures: 3 }, defeated: true });
    const impossible = synchronizeDnd5eSrdCombatantActorState(dead, {
      id: "cmbt_dead", tokenId: "tok_dead", actorId: dead.id, name: dead.name,
      initiative: 10, defeated: false, conditions: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0
    }, now);
    expect(impossible).toEqual({ ok: false, error: expect.stringContaining("explicitly authorized revival") });
  });

  it("canonically pairs a legal zero-HP combatant transition with its actor", () => {
    const fallen = actor("fallen", "character", { hp: { current: 0, max: 20 }, conditions: [{ id: "unconscious" }], lifeState: "unconscious", deathSaves: { successes: 0, failures: 1 }, defeated: false });
    const stable = synchronizeDnd5eSrdCombatantActorState(fallen, {
      id: "cmbt_fallen", tokenId: "tok_fallen", actorId: fallen.id, name: fallen.name,
      initiative: 10, defeated: false, conditions: ["prone", "stable"], deathSaveOutcome: "stable",
      deathSaveSuccesses: 0, deathSaveFailures: 0
    }, now);
    expect(stable).toMatchObject({
      ok: true,
      actorData: { hp: { current: 0, max: 20 }, lifeState: "stable", defeated: false, deathSaves: { successes: 0, failures: 0 } },
      combatant: { defeated: false, conditions: expect.arrayContaining(["prone", "unconscious", "stable"]), deathSaveOutcome: "stable" }
    });
  });

  it("preserves actor-only condition records while reconciling qualified combat conditions by base id", () => {
    const frightened = { id: "frightened", appliedAt: "2026-07-12T12:00:00.000Z", sourceEffectId: "effect_fear", metadata: { saveDc: 15 } };
    const exhaustion = { id: "exhaustion", appliedAt: "2026-07-11T12:00:00.000Z", level: 2, source: "forced-march" };
    const conscious = actor("conditioned", "character", {
      hp: { current: 18, max: 20 },
      conditions: [frightened, { id: "prone", appliedAt: "2026-07-12T12:30:00.000Z" }, exhaustion],
      lifeState: "conscious",
      deathSaves: { successes: 0, failures: 0 },
      defeated: false,
    });
    const previousCombatant = {
      id: "cmbt_conditioned", tokenId: "tok_conditioned", actorId: conscious.id, name: conscious.name,
      initiative: 10, defeated: false, conditions: ["frightened:2", "prone"],
    };
    const incomingCombatant = { ...previousCombatant, conditions: ["frightened:1"] };

    const synchronization = synchronizeDnd5eSrdCombatantActorState(conscious, incomingCombatant, now, previousCombatant);

    expect(synchronization.ok).toBe(true);
    if (!synchronization.ok) return;
    expect(synchronization.actorData.conditions).toEqual([frightened, exhaustion]);
    expect(synchronization.actorData.conditions).not.toContainEqual(expect.objectContaining({ id: "frightened-1" }));
    expect(synchronization.combatant.conditions).toEqual(["frightened:1"]);
  });
});
