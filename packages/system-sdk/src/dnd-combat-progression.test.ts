import { createTimestamped, type Actor, type Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { advanceDnd5eSrdCombatRules, synchronizeDnd5eSrdActorCombatState } from "./dnd-combat-progression.js";

const now = "2026-07-13T12:00:00.000Z";

function actor(id: string, type: string, data: Record<string, unknown>): Actor {
  return createTimestamped("act", {
    id, campaignId: "camp", systemId: "dnd-5e-srd", ownerUserId: "user", type, name: id, data, permissions: {},
  });
}

function combat(actors: Actor[], round = 3): Pick<Combat, "round" | "turnIndex" | "combatants"> {
  return {
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
        actionEconomy: { bonusActions: { cmb: { rollId: "old-bonus", round: 2, turnIndex: 0 } } }
      }
    });
    const result = advanceDnd5eSrdCombatRules({ actors: [ready], combat: combat([ready]), phase: "start_turn", now });
    expect(result.actorDataPatches[0]).toMatchObject({ actorId: "ready", reason: expect.stringContaining("turn-action-economy-refresh"), data: { rulesEngine: { reactions: {}, actionEconomy: { bonusActions: {} } } } });
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

    const monster = actor("monster", "monster", { hp: { current: 0, max: 30 }, conditions: [] });
    const defeated = advanceDnd5eSrdCombatRules({ actors: [monster], combat: combat([monster]), phase: "start_turn", now });
    expect(defeated.actorDataPatches[0]?.data).toMatchObject({ lifeState: "defeated", defeated: true, conditions: [{ id: "unconscious" }] });
    expect(defeated.combatantUpdates[0]?.after).toMatchObject({ defeated: true, conditions: ["unconscious"] });
  });
});
