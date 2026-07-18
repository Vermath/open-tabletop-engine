import type { Actor, Combat } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdLegendaryActions, dnd5eSrdMonsterActorData, spendDnd5eSrdLegendaryAction } from "./index.js";
import {
  DND_5E_SRD_MONSTER_STAT_BLOCKS,
  migrateDnd5eSrdLegacyLegendaryActions,
  type Dnd5eSrdMonsterStatBlock
} from "./dnd-monster-stat-blocks.js";

const now = "2026-07-17T12:00:00.000Z";

function legendaryActor(threatId = "aboleth", extra: Record<string, unknown> = {}): Actor {
  const data = dnd5eSrdMonsterActorData(threatId);
  if (!data) throw new Error(`Missing ${threatId}`);
  return {
    id: "act_legendary",
    campaignId: "camp_legendary",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_gm",
    type: "monster",
    name: "Legendary Monster",
    data: { ...data, ...extra },
    permissions: {},
    createdAt: now,
    updatedAt: now
  };
}

function combat(turnIndex: number, round = 1): Combat {
  return {
    id: "cmb_legendary",
    campaignId: "camp_legendary",
    active: true,
    round,
    turnIndex,
    combatants: [
      { id: "cmbt_legendary", tokenId: "tok_legendary", actorId: "act_legendary", name: "Legendary Monster", initiative: 20, defeated: false },
      { id: "cmbt_other", tokenId: "tok_other", actorId: "act_other", name: "Other", initiative: 10, defeated: false }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function withUpdate(actor: Actor, updates: Array<{ actorId: string; after: Record<string, unknown> }>): Actor {
  const update = updates.find((candidate) => candidate.actorId === actor.id);
  return update ? { ...actor, data: update.after } : actor;
}

describe("D&D legendary-action economy", () => {
  it("uses explicit typed economy metadata for every legendary source block without removing its prose", () => {
    const entries = Object.entries(DND_5E_SRD_MONSTER_STAT_BLOCKS);
    const markerIds = entries.filter(([, block]) => block.actions.some((action) => action.name === "Legendary Actions")).map(([id]) => id).sort();
    const profileIds = entries.filter(([, block]) => block.legendaryActions).map(([id]) => id).sort();
    expect(markerIds).toHaveLength(27);
    expect(profileIds).toEqual(markerIds);
    for (const id of markerIds) {
      const block = DND_5E_SRD_MONSTER_STAT_BLOCKS[id]!;
      expect(block.legendaryActions).toEqual(expect.objectContaining({ uses: 3, resolution: "reviewed-manual" }));
      expect(block.legendaryActions!.options.length).toBeGreaterThan(0);
      expect(block.actions.some((action) => action.name === "Legendary Actions")).toBe(true);
    }

    expect(DND_5E_SRD_MONSTER_STAT_BLOCKS["adult-bronze-dragon"]!.legendaryActions).toEqual({
      uses: 3,
      inLairUses: 4,
      options: ["Guiding Light", "Pounce", "Thunderclap"],
      resolution: "reviewed-manual"
    });
  });

  it("keeps prose migration additive and never overwrites an explicit profile", () => {
    const aboleth = DND_5E_SRD_MONSTER_STAT_BLOCKS.aboleth!;
    const explicit: Dnd5eSrdMonsterStatBlock = {
      ...aboleth,
      actions: [{ name: "Legendary Actions", kind: "action", summary: "Has 99 Legendary Action uses, including Wrong Option." }],
      legendaryActions: { uses: 2, options: ["Reviewed Option"], resolution: "reviewed-manual" }
    };
    expect(migrateDnd5eSrdLegacyLegendaryActions(explicit)).toBe(explicit);

    const legacy = { ...aboleth };
    delete legacy.legendaryActions;
    expect(migrateDnd5eSrdLegacyLegendaryActions(legacy)).toMatchObject({
      legendaryActions: { uses: 3, options: ["Lash", "Psychic Drain"], resolution: "reviewed-manual" }
    });

    const bronzeLegacy = { ...DND_5E_SRD_MONSTER_STAT_BLOCKS["adult-bronze-dragon"]! };
    delete bronzeLegacy.legendaryActions;
    expect(migrateDnd5eSrdLegacyLegendaryActions(bronzeLegacy).legendaryActions?.options).toEqual(["Guiding Light", "Pounce", "Thunderclap"]);

    const nonLegendary = DND_5E_SRD_MONSTER_STAT_BLOCKS["animated-armor"]!;
    expect(migrateDnd5eSrdLegacyLegendaryActions(nonLegendary)).toBe(nonLegendary);
  });

  it("prompts only after another creature's turn, spends a bounded pool, and resets at its own turn start", () => {
    const actor = legendaryActor();
    const afterOther = advanceDnd5eSrdLegendaryActions([actor], combat(1), "end_turn", now);
    expect(afterOther.prompts).toEqual([expect.objectContaining({ actorId: actor.id, remainingUses: 3, maximumUses: 3, afterTurnIndex: 1, resolution: "reviewed-manual" })]);
    const initialized = withUpdate(actor, afterOther.actorUpdates);
    const spent = spendDnd5eSrdLegendaryAction(initialized, combat(1), { optionName: "Psychic Drain", cost: 2, usedAt: now });
    expect(spent).toMatchObject({ ok: true, remainingUses: 1, maximumUses: 3 });
    if (!spent.ok) throw new Error(spent.reason);
    const afterSpend = { ...initialized, data: spent.data };
    const nextPrompt = advanceDnd5eSrdLegendaryActions([afterSpend], combat(1), "end_turn", now);
    expect(nextPrompt.prompts[0]).toMatchObject({ remainingUses: 1, maximumUses: 3 });
    expect(advanceDnd5eSrdLegendaryActions([afterSpend], combat(0), "end_turn", now).prompts).toEqual([]);

    const reset = advanceDnd5eSrdLegendaryActions([afterSpend], combat(0, 2), "start_turn", now);
    expect(reset.prompts).toEqual([]);
    const resetActor = withUpdate(afterSpend, reset.actorUpdates);
    const afterResetPrompt = advanceDnd5eSrdLegendaryActions([resetActor], combat(1, 2), "end_turn", now);
    expect(afterResetPrompt.prompts[0]).toMatchObject({ remainingUses: 3, maximumUses: 3 });
  });

  it("uses the explicit in-lair maximum and rejects invalid, exhausted, or incapacitated spends", () => {
    const actor = legendaryActor("adult-gold-dragon", { ...dnd5eSrdMonsterActorData("adult-gold-dragon"), monster: { ...(dnd5eSrdMonsterActorData("adult-gold-dragon")!.monster as Record<string, unknown>), inLair: true } });
    const initialized = withUpdate(actor, advanceDnd5eSrdLegendaryActions([actor], combat(1), "end_turn", now).actorUpdates);
    expect(advanceDnd5eSrdLegendaryActions([initialized], combat(1), "end_turn", now).prompts[0]).toMatchObject({ remainingUses: 4, maximumUses: 4 });
    expect(spendDnd5eSrdLegendaryAction(initialized, combat(1), { optionName: "Pounce", cost: 0, usedAt: now })).toMatchObject({ ok: false, code: "legendary_action_invalid_cost" });
    const all = spendDnd5eSrdLegendaryAction(initialized, combat(1), { optionName: "Pounce", cost: 4, usedAt: now });
    if (!all.ok) throw new Error(all.reason);
    expect(spendDnd5eSrdLegendaryAction({ ...initialized, data: all.data }, combat(1), { optionName: "Pounce", cost: 1, usedAt: now })).toMatchObject({ ok: false, code: "legendary_action_exhausted" });

    const incapacitated = legendaryActor("aboleth", { conditions: [{ id: "incapacitated" }] });
    expect(advanceDnd5eSrdLegendaryActions([incapacitated], combat(1), "end_turn", now).prompts).toEqual([]);
  });

  it("does not initialize, prompt, or spend for a representative non-legendary stat block", () => {
    const actor = legendaryActor("animated-armor");
    expect(advanceDnd5eSrdLegendaryActions([actor], combat(1), "end_turn", now)).toEqual({ actorUpdates: [], prompts: [] });
    expect(spendDnd5eSrdLegendaryAction(actor, combat(1), { optionName: "Slam", cost: 1, usedAt: now })).toMatchObject({
      ok: false,
      code: "legendary_actions_unavailable"
    });
  });
});
