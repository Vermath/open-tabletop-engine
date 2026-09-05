import type { Actor, Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { applyDnd5eSrdStandardActionUse } from "./dnd-action-economy.js";
import { advanceDnd5eSrdCombatRules } from "./dnd-combat-progression.js";
import {
  dnd5eSrdWeaponMasteryPreflight,
  resolveDnd5eSrdWeaponMastery,
  type Dnd5eSrdWeaponMasteryTarget,
  type Dnd5eSrdWeaponMasteryUse
} from "./dnd-weapon-mastery.js";

const now = "2026-09-05T12:00:00.000Z";
type TurnCombat = Pick<Combat, "id" | "round" | "turnIndex" | "combatants">;
type Property = "nick" | "cleave";

function actor(id: string, data: Record<string, unknown> = {}): Actor {
  return {
    id, campaignId: "campaign", systemId: "dnd-5e-srd", type: "character", name: id,
    ownerUserId: "user", data: { hp: { current: 20, max: 20 }, ...data }, permissions: {},
    createdAt: now, updatedAt: now
  };
}

function combat(): TurnCombat {
  return {
    id: "combat", round: 1, turnIndex: 0,
    combatants: ["source", "target", "secondary"].map((id, index) => ({
      id: `${id}-combatant`, tokenId: `${id}-token`, actorId: id, name: id,
      initiative: 20 - index * 5, defeated: false, conditions: []
    }))
  };
}

function reindex(current: TurnCombat): TurnCombat {
  const [source, target, secondary] = current.combatants;
  return { ...current, turnIndex: 1, combatants: [target!, source!, secondary!] };
}

function masteryInput(property: Property, source: Actor, current: TurnCombat) {
  const item: Item = {
    id: `${property}-weapon`, campaignId: "campaign", systemId: "dnd-5e-srd", actorId: source.id,
    type: "item", name: `${property} weapon`, quantity: 1,
    data: { equipmentCategory: "weapon", weaponCategory: "martial", weaponKind: "melee", properties: ["light"], damage: "1d8", damageType: "slashing", mastery: property },
    createdAt: now, updatedAt: now
  } as Item;
  const targets: Dnd5eSrdWeaponMasteryTarget[] = ["target", "secondary"].map((id) => ({
    actor: actor(id), items: [], armorClass: 15, rollTotal: 18, naturalD20: 12
  }));
  const options: Dnd5eSrdWeaponMasteryUse = property === "nick"
    ? { use: true, nickExtraAttack: true }
    : { use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true };
  return {
    actor: source, data: source.data, item,
    roll: { id: `item-${item.id}-attack`, label: `${item.name} Attack`, metadata: { attackType: "weapon", mastery: property, ability: "strength" } },
    targets, combat: current, now, abilityModifier: 3, proficiencyBonus: 3, options
  };
}

function takeAttack(source: Actor, current: TurnCombat): Actor {
  const result = applyDnd5eSrdStandardActionUse(source.data, source.id, "item-vex-weapon-attack", current, now);
  expect(result.blocked).toBeUndefined();
  return { ...source, data: result.data };
}

describe("Weapon Mastery turn identity", () => {
  it("retains Nick's Attack action prerequisite when the active combatant is reindexed", () => {
    const initial = combat();
    const source = takeAttack(actor("source"), initial);
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput("nick", source, initial))).toBeUndefined();

    const reordered = reindex(initial);
    expect(reordered.combatants[reordered.turnIndex]?.id).toBe(initial.combatants[initial.turnIndex]?.id);
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput("nick", source, reordered))).toBeUndefined();
    expect(resolveDnd5eSrdWeaponMastery(masteryInput("nick", source, reordered)).resolution).toMatchObject({ property: "nick", status: "applied" });
  });

  it.each(["nick", "cleave"] as const)("does not grant a second %s use after a roster reorder", (property) => {
    const initial = combat();
    const source = takeAttack(actor("source"), initial);
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, source, initial))).toBeUndefined();
    const used = resolveDnd5eSrdWeaponMastery(masteryInput(property, source, initial));
    expect(used.resolution).toMatchObject({ property, status: "applied" });

    const sourceAfterUse = { ...source, data: used.data };
    const expectedBlock = `weapon_mastery_${property}_already_used`;
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, sourceAfterUse, initial))?.code).toBe(expectedBlock);
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, sourceAfterUse, reindex(initial)))?.code).toBe(expectedBlock);
  });

  it.each(["nick", "cleave"] as const)("refreshes %s on a real same-round turn start for another combatant of the same actor", (property) => {
    const initial = combat();
    initial.combatants.push({ ...initial.combatants[0]!, id: "source-second-combatant", tokenId: "source-second-token", initiative: 1 });
    const source = takeAttack(actor("source"), initial);
    const used = resolveDnd5eSrdWeaponMastery(masteryInput(property, source, initial));
    expect(used.resolution?.status).toBe("applied");
    const sourceAfterUse = { ...source, data: used.data };

    const ended = advanceDnd5eSrdCombatRules({ actors: [sourceAfterUse], combat: initial, phase: "end_turn", now });
    expect(ended.canApply).toBe(true);
    const sourceAfterEnd = { ...sourceAfterUse, data: ended.actorDataPatches.find((patch) => patch.actorId === source.id)?.data ?? sourceAfterUse.data };
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, sourceAfterEnd, initial))?.code).toBe(`weapon_mastery_${property}_already_used`);

    const nextTurn = { ...initial, turnIndex: 3 };
    const started = advanceDnd5eSrdCombatRules({ actors: [sourceAfterEnd], combat: nextTurn, phase: "start_turn", now });
    expect(started.canApply).toBe(true);
    const sourceAtTurnStart = { ...sourceAfterEnd, data: started.actorDataPatches.find((patch) => patch.actorId === source.id)?.data ?? sourceAfterEnd.data };
    if (property === "nick") {
      expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, sourceAtTurnStart, nextTurn))?.code).toBe("weapon_mastery_nick_attack_action_required");
    }
    const sourceAfterAttack = takeAttack(sourceAtTurnStart, nextTurn);
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, sourceAfterAttack, nextTurn))).toBeUndefined();
    const reused = resolveDnd5eSrdWeaponMastery(masteryInput(property, sourceAfterAttack, nextTurn));
    expect(reused.resolution).toMatchObject({ property, status: "applied" });
    expect(dnd5eSrdWeaponMasteryPreflight(masteryInput(property, { ...sourceAfterAttack, data: reused.data }, nextTurn))?.code).toBe(`weapon_mastery_${property}_already_used`);
  });
});
