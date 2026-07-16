import type { Actor, Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  advanceDnd5eSrdEffectLifecycle,
  applyDnd5eSrdRest,
  dnd5eSrdActionFormula,
  dnd5eSrdActiveRageEffect,
  dnd5eSrdAbilityCheck,
  dnd5eSrdQuickRolls,
  dnd5eSrdRageDamageBonus,
  dnd5eSrdResolveDamageComponents,
  dnd5eSrdSavingThrow,
  endDnd5eSrdRage,
  extendDnd5eSrdRage,
  resolveDnd5eSrdAction,
  startDnd5eSrdRage,
} from "./index.js";

const now = "2026-07-15T20:00:00.000Z";

function barbarian(level = 5, data: Record<string, unknown> = {}): Actor {
  return {
    id: "act_rage",
    campaignId: "camp_rage",
    systemId: "dnd-5e-srd",
    ownerUserId: "usr_player",
    type: "character",
    name: "Kara",
    data: {
      class: "Barbarian",
      level,
      attributes: { strength: 18, dexterity: 14, constitution: 16, intelligence: 8, wisdom: 12, charisma: 10 },
      hp: { current: 40, max: 40 },
      resources: { rage: { current: 3, max: 3, recovery: "short" } },
      features: ["Rage"],
      conditions: [],
      ...data,
    },
    permissions: {},
    createdAt: now,
    updatedAt: now,
  };
}

function combat(round = 1, turnIndex = 0): Combat {
  return {
    id: "cmb_rage",
    campaignId: "camp_rage",
    active: true,
    round,
    turnIndex,
    combatants: [
      { id: "cmbt_rage", tokenId: "tok_rage", actorId: "act_rage", name: "Kara", initiative: 20, defeated: false },
      { id: "cmbt_enemy", tokenId: "tok_enemy", actorId: "act_enemy", name: "Enemy", initiative: 10, defeated: false },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function item(actor: Actor, id: string, name: string, data: Record<string, unknown>, type: Item["type"] = "item"): Item {
  return { id, campaignId: actor.campaignId, systemId: actor.systemId, actorId: actor.id, type, name, data, createdAt: now, updatedAt: now };
}

function sourceAfter(actor: Actor, resolution: ReturnType<typeof resolveDnd5eSrdAction>): Actor {
  const update = resolution.actorUpdates.find((candidate) => candidate.actorId === actor.id);
  return update ? { ...actor, data: update.after } : actor;
}

function activeBarbarian(level = 5): Actor {
  const actor = barbarian(level);
  return { ...actor, data: startDnd5eSrdRage({ actor, combat: combat(), now }).data };
}

describe("D&D Rage lifecycle", () => {
  it("scales from Barbarian class level and starts exactly one sourced effect with one use and one Bonus Action", () => {
    expect(dnd5eSrdRageDamageBonus(barbarian(1))).toBe(2);
    expect(dnd5eSrdRageDamageBonus(barbarian(9))).toBe(3);
    expect(dnd5eSrdRageDamageBonus(barbarian(16))).toBe(4);

    const actor = barbarian();
    const rageRoll = dnd5eSrdQuickRolls(actor).find((roll) => roll.id === "feature-rage")!;
    const started = resolveDnd5eSrdAction({ actor, roll: rageRoll, combat: combat(), options: { consumeResources: true }, now });
    expect(started.blocked).toBeUndefined();
    expect(started.action.kind).toBe("bonusAction");
    expect(started.resourceConsumption).toEqual([expect.objectContaining({ key: "rage", amount: 1, remaining: 2 })]);
    expect(started.auditEvents).toEqual(expect.arrayContaining([expect.objectContaining({ code: "bonus_action.used" }), expect.objectContaining({ code: "rage.started" })]));
    const after = sourceAfter(actor, started);
    expect((after.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toHaveLength(1);
    expect(dnd5eSrdActiveRageEffect(after)).toMatchObject({
      kind: "rage",
      damageBonus: 2,
      resistance: ["bludgeoning", "piercing", "slashing"],
      restrictions: { spellcasting: false, concentration: false },
      source: { className: "Barbarian", classLevel: 5 },
      expiresAtRound: 2,
      maximumExpiresAtRound: 101,
    });

    const duplicate = resolveDnd5eSrdAction({ actor: after, roll: rageRoll, combat: combat(2), options: { consumeResources: true }, now: "2026-07-15T20:00:06.000Z" });
    expect(duplicate.blocked).toMatchObject({ code: "rage_already_active" });
    expect(duplicate.actorUpdates).toEqual([]);
    expect(duplicate.resourceConsumption).toEqual([]);
  });

  it("rejects Heavy armor and explicitly ends current Concentration in the reviewed start result", () => {
    const actor = barbarian();
    const plate = item(actor, "itm_plate", "Plate", { category: "armor", armorType: "heavy", armorBase: 18, equipped: true });
    const rageRoll = dnd5eSrdQuickRolls(actor, [plate]).find((roll) => roll.id === "feature-rage")!;
    const armored = resolveDnd5eSrdAction({ actor, items: [plate], roll: rageRoll, combat: combat(), options: { consumeResources: true }, now });
    expect(armored.blocked).toMatchObject({ code: "rage_heavy_armor" });
    expect(armored.actorUpdates).toEqual([]);

    const concentrating = barbarian(5, {
      conditions: [{ id: "concentration" }],
      rulesEngine: {
        concentration: { rollId: "spell-bless-effect", label: "Bless", sourceActorId: "act_rage", startedAt: now, targetActorIds: ["act_ally"] },
        activeEffects: [{ id: "spell-bless-effect:act_rage", rollId: "spell-bless-effect", concentration: true, sourceActorId: "act_rage", startedAt: now }],
      },
    });
    const start = resolveDnd5eSrdAction({ actor: concentrating, roll: dnd5eSrdQuickRolls(concentrating).find((roll) => roll.id === "feature-rage")!, combat: combat(), options: { consumeResources: true }, now });
    expect(start.blocked).toBeUndefined();
    expect(start.concentrationCleanups).toEqual([expect.objectContaining({ rollId: "spell-bless-effect", targetActorIds: ["act_ally"], reason: "ended" })]);
    expect(start.conditions).toContainEqual(expect.objectContaining({ operation: "breakConcentration", reason: expect.stringContaining("Starting Rage ends Concentration on Bless") }));
    expect(start.warnings).toContain("Starting Rage ends Concentration on Bless.");
    const after = sourceAfter(concentrating, start);
    expect((after.data.rulesEngine as Record<string, unknown>).concentration).toBeUndefined();
    expect((after.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toHaveLength(1);
  });

  it("applies Strength check/save Advantage, physical resistance, and Rage damage only to eligible Strength weapon or Unarmed damage", () => {
    const actor = activeBarbarian();
    expect(dnd5eSrdAbilityCheck(actor, "strength")).toMatchObject({ formula: "2d20kh1+4", metadata: { advantage: true, advantageSources: ["Rage"] } });
    expect(dnd5eSrdSavingThrow(actor, "strength")).toMatchObject({ formula: "2d20kh1+7", metadata: { advantage: true, advantageSources: ["Rage"] } });
    expect(dnd5eSrdAbilityCheck(actor, "dexterity").formula).toBe("1d20+2");

    const greataxe = item(actor, "itm_axe", "Greataxe", { category: "weapon", equipmentCategory: "weapon", damage: "1d12", damageType: "slashing", ability: "strength", equipped: true });
    const longbow = item(actor, "itm_bow", "Longbow", { category: "weapon", equipmentCategory: "weapon", damage: "1d8", damageType: "piercing", ability: "dexterity", equipped: true });
    expect(dnd5eSrdActionFormula(actor, [greataxe], "item-itm_axe-damage")).toBe("1d12+4+2");
    expect(dnd5eSrdActionFormula(actor, [longbow], "item-itm_bow-damage")).toBe("1d8+2");
    expect(dnd5eSrdActionFormula(actor, [], "unarmed-strike")).toBe("7+2");

    const damage = dnd5eSrdResolveDamageComponents(actor, [], [{ amount: 9, damageType: "slashing" }]);
    expect(damage).toMatchObject({ totalDamage: 4, components: [{ amount: 9, adjustedAmount: 4, damageType: "slashing", defense: "resistance" }] });
  });

  it("blocks spellcasting and new Concentration while Rage is active with actionable copy", () => {
    const actor = activeBarbarian();
    const spell = item(actor, "itm_burning_hands", "Burning Hands", { prepared: true, level: 1, damageFormula: "3d6", damageType: "fire", action: "Magic Action" }, "spell");
    const spellRoll = dnd5eSrdQuickRolls(actor, [spell]).find((roll) => roll.id === "spell-itm_burning_hands-damage")!;
    expect(resolveDnd5eSrdAction({ actor, items: [spell], roll: spellRoll }).blocked).toMatchObject({ code: "rage_spellcasting_blocked", reason: expect.stringContaining("End Rage") });
    const concentrationRoll = dnd5eSrdQuickRolls(actor).find((roll) => roll.id === "concentration-check")!;
    expect(resolveDnd5eSrdAction({ actor, roll: concentrationRoll }).blocked).toMatchObject({ code: "rage_concentration_blocked", reason: expect.stringContaining("End Rage") });
  });

  it("extends to the next turn from supported triggers, expires deterministically, and supports explicit end", () => {
    const actor = activeBarbarian();
    const extended = extendDnd5eSrdRage({ actor, combat: combat(2), now: "2026-07-15T20:00:06.000Z", trigger: "attack-roll" });
    expect(extended).toMatchObject({ extended: true, effect: { expiresAtRound: 3, lastExtensionTrigger: "attack-roll", lastExtendedAtRound: 2 } });
    const extendedActor = { ...actor, data: extended.data };
    expect(advanceDnd5eSrdEffectLifecycle([extendedActor], combat(2), { phase: "end_turn" }).actorUpdates).toEqual([]);
    expect(advanceDnd5eSrdEffectLifecycle([extendedActor], combat(3), { phase: "end_turn" }).changes).toEqual([expect.objectContaining({ actorId: actor.id, reason: "expired" })]);

    const ended = endDnd5eSrdRage(extendedActor, "voluntary");
    expect(ended).toMatchObject({ ended: true, reason: "voluntary" });
    expect(dnd5eSrdActiveRageEffect(ended.data)).toBeUndefined();
  });

  it("cleans Rage on rest, Incapacitation/death, and equipped Heavy armor without changing defense order", () => {
    const actor = activeBarbarian();
    expect(applyDnd5eSrdRest(actor, "short")).toMatchObject({ recovered: { rageEnded: true } });
    expect(dnd5eSrdActiveRageEffect(applyDnd5eSrdRest(actor, "short").data)).toBeUndefined();

    const incapacitated = { ...actor, data: { ...actor.data, conditions: [{ id: "incapacitated" }] } };
    expect(advanceDnd5eSrdEffectLifecycle([incapacitated], combat(), { phase: "start_turn" }).changes).toEqual([expect.objectContaining({ reason: "incapacitated" })]);

    const plate = item(actor, "itm_plate_active", "Plate", { category: "armor", armorType: "heavy", armorBase: 18, equipped: true });
    expect(advanceDnd5eSrdEffectLifecycle([actor], combat(), { phase: "start_turn" }, [plate]).changes).toEqual([expect.objectContaining({ reason: "heavy-armor" })]);
  });
});
