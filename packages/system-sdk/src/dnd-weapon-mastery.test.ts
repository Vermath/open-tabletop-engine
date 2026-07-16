import type { Actor, Combat, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { advanceDnd5eSrdEffectLifecycle } from "./dnd-effect-lifecycle.js";
import {
  DND_5E_SRD_WEAPON_MASTERY_RULES,
  dnd5eSrdActorHasWeaponMastery,
  dnd5eSrdWeaponMasteryPreflight,
  dnd5eSrdWeaponMasteryRollModeSources,
  dnd5eSrdWeaponMasterySpeedPenalty,
  resolveDnd5eSrdWeaponMastery,
  type Dnd5eSrdWeaponMasteryProperty,
  type Dnd5eSrdWeaponMasteryTarget,
  type Dnd5eSrdWeaponMasteryUse
} from "./dnd-weapon-mastery.js";

const now = "2026-07-15T12:00:00.000Z";

function actor(id: string, data: Record<string, unknown> = {}): Actor {
  return {
    id,
    campaignId: "campaign",
    systemId: "dnd-5e-srd",
    type: "character",
    name: id,
    ownerUserId: "user",
    data: { hp: { current: 20, max: 20 }, size: "medium", ...data },
    permissions: {},
    createdAt: now,
    updatedAt: now
  };
}

function item(property: string, data: Record<string, unknown> = {}): Item {
  return {
    id: `${property}-weapon`,
    campaignId: "campaign",
    systemId: "dnd-5e-srd",
    actorId: "source",
    type: "item",
    name: `${property} weapon`,
    quantity: 1,
    data: { equipmentCategory: "weapon", weaponCategory: "martial", weaponKind: "melee", properties: ["light"], damage: "1d8", damageType: "slashing", mastery: property, ...data },
    createdAt: now,
    updatedAt: now
  } as Item;
}

function combat(round = 1, turnIndex = 0): Combat {
  return {
    id: "combat",
    campaignId: "campaign",
    active: true,
    round,
    turnIndex,
    combatants: [
      { id: "source-combatant", tokenId: "source-token", actorId: "source", initiative: 20, name: "source", defeated: false, conditions: [] },
      { id: "target-combatant", tokenId: "target-token", actorId: "target", initiative: 10, name: "target", defeated: false, conditions: [] },
      { id: "secondary-combatant", tokenId: "secondary-token", actorId: "secondary", initiative: 5, name: "secondary", defeated: false, conditions: [] }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function target(value: Actor, rollTotal?: number, naturalD20?: number): Dnd5eSrdWeaponMasteryTarget {
  return { actor: value, items: [], armorClass: 15, ...(rollTotal !== undefined ? { rollTotal } : {}), ...(naturalD20 !== undefined ? { naturalD20 } : {}) };
}

function resolve(property: Dnd5eSrdWeaponMasteryProperty, options: Partial<Dnd5eSrdWeaponMasteryUse> = {}, targets = [target(actor("target"), 18, 12)], sourceData: Record<string, unknown> = {}, weaponData: Record<string, unknown> = {}) {
  const source = actor("source", sourceData);
  const weapon = item(property, weaponData);
  return resolveDnd5eSrdWeaponMastery({
    actor: source,
    data: source.data,
    item: weapon,
    roll: { id: `item-${weapon.id}-attack`, label: `${weapon.name} Attack`, metadata: { attackType: "weapon", mastery: property, ability: "strength" } },
    targets,
    combat: combat(),
    now,
    abilityModifier: 3,
    proficiencyBonus: 3,
    options: { use: true, ...options }
  });
}

describe("SRD 5.2.1 Weapon Mastery", () => {
  it("declares all eight properties and their exact automation boundaries", () => {
    expect(Object.keys(DND_5E_SRD_WEAPON_MASTERY_RULES)).toEqual(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]);
    expect(DND_5E_SRD_WEAPON_MASTERY_RULES.push).toMatchObject({ capability: "manual", requiresGeometry: true, source: "SRD 5.2.1", sourcePage: 91, sourcePdfPage: 90 });
    expect(DND_5E_SRD_WEAPON_MASTERY_RULES.cleave).toMatchObject({ capability: "choice", oncePerTurn: true, requiresSecondaryTarget: true, requiresGeometry: true });
    expect(DND_5E_SRD_WEAPON_MASTERY_RULES.topple).toMatchObject({ capability: "choice", requiresSave: true });
  });

  it("matches selected compendium and stable homebrew weapon identities", () => {
    const selected = actor("source", { weaponMasteries: [{ weaponId: "longsword" }, { weaponId: "moon-blade" }] });
    expect(dnd5eSrdActorHasWeaponMastery(selected, { ...item("sap"), id: "inventory-copy", name: "Longsword", data: { ...item("sap").data, compendiumId: "longsword" } }, item("sap").data as Record<string, unknown>)).toBe(true);
    const homebrew = { ...item("vex"), id: "moon-blade", name: "Moon Blade" };
    expect(dnd5eSrdActorHasWeaponMastery(selected, homebrew, homebrew.data as Record<string, unknown>)).toBe(true);
    expect(dnd5eSrdActorHasWeaponMastery(actor("source"), homebrew, homebrew.data as Record<string, unknown>)).toBe(false);
  });

  it.each([
    ["sap", 18, 12, "applied"],
    ["sap", 30, 20, "applied"],
    ["sap", 30, 1, "not-triggered"],
    ["graze", 18, 12, "not-triggered"],
    ["graze", 30, 1, "not-triggered"]
  ] as const)("resolves %s hit/miss/critical trigger matrix", (property, total, natural, status) => {
    const result = resolve(property, {}, [target(actor("target"), total, natural)]);
    expect(result.resolution?.status).toBe(status);
    expect(result.resolution?.attackOutcome).toBe(natural === 1 ? "miss" : natural === 20 ? "critical-hit" : total >= 15 ? "hit" : "miss");
  });

  it("applies Graze damage only on a miss and only from the attack ability modifier", () => {
    const targetActor = actor("target");
    const source = actor("source");
    const weapon = item("graze", { damageType: "slashing", damageBonus: 5 });
    const result = resolveDnd5eSrdWeaponMastery({
      actor: source,
      data: source.data,
      item: weapon,
      roll: { id: `item-${weapon.id}-attack`, label: "Graze Attack", metadata: { attackType: "weapon", mastery: "graze", ability: "strength" } },
      targets: [target(targetActor, 30, 1)],
      combat: combat(),
      now,
      abilityModifier: 3,
      proficiencyBonus: 3,
      options: { use: true },
      applyGrazeDamage: (entry, amount, damageType) => ({ data: { ...entry.actor.data, hp: { current: 17, max: 20 } }, effect: { type: "damage", targetActorId: entry.actor.id, targetActorName: entry.actor.name, amount, damageType, before: 20, after: 17 } })
    });
    expect(result.resolution).toMatchObject({ property: "graze", status: "applied", attackOutcome: "miss" });
    expect(result.effects[0]).toMatchObject({ amount: 3, damageType: "slashing", before: 20, after: 17 });
  });

  it("applies, sources, consumes, and expires Vex exactly once", () => {
    const targetActor = actor("target");
    const applied = resolve("vex", { damageDealt: true }, [target(targetActor, 18, 12)]);
    const sourceWithVex = actor("source", applied.data);
    expect(applied.resolution?.status).toBe("applied");
    expect(dnd5eSrdWeaponMasteryRollModeSources(sourceWithVex, targetActor).advantageSources).toEqual(["Weapon Mastery: Vex"]);

    const consumed = resolveDnd5eSrdWeaponMastery({ actor: sourceWithVex, data: sourceWithVex.data, item: item("sap"), roll: { id: "item-sap-weapon-attack", label: "Attack", metadata: { attackType: "weapon" } }, targets: [target(targetActor, 11, 5)], combat: combat(), now, abilityModifier: 3, proficiencyBonus: 3 });
    expect(dnd5eSrdWeaponMasteryRollModeSources(actor("source", consumed.data), targetActor).advantageSources).toEqual([]);
    expect(consumed.auditEvents[0]?.code).toBe("weapon-mastery.vex.consumed");

    const expired = advanceDnd5eSrdEffectLifecycle([sourceWithVex], combat(2, 0), { phase: "end_turn", now });
    expect(expired.changes[0]).toMatchObject({ actorId: "source", reason: "expired" });
  });

  it("applies Sap to the next attack and removes every applicable Sap source after that roll", () => {
    const applied = resolve("sap");
    const targetWithSap = actor("target", applied.targetData[0]!.data);
    expect(dnd5eSrdWeaponMasteryRollModeSources(targetWithSap).disadvantageSources).toEqual(["Weapon Mastery: Sap"]);
    const consumed = resolveDnd5eSrdWeaponMastery({ actor: targetWithSap, data: targetWithSap.data, item: { ...item("vex"), actorId: "target" }, roll: { id: "item-vex-weapon-attack", label: "Attack", metadata: { attackType: "weapon" } }, targets: [target(actor("source"), 10, 5)], combat: { ...combat(), turnIndex: 1 }, now, abilityModifier: 2, proficiencyBonus: 3 });
    expect(dnd5eSrdWeaponMasteryRollModeSources(actor("target", consumed.data)).disadvantageSources).toEqual([]);
  });

  it("caps Slow at a single 10-foot penalty and refreshes its sourced lifecycle", () => {
    const first = resolve("slow", { damageDealt: true });
    const slowed = actor("target", first.targetData[0]!.data);
    expect(dnd5eSrdWeaponMasterySpeedPenalty(slowed)).toBe(-10);
    const second = resolve("slow", { damageDealt: true }, [target(slowed, 18, 12)]);
    const twiceSlowed = actor("target", second.targetData[0]!.data);
    expect(dnd5eSrdWeaponMasterySpeedPenalty(twiceSlowed)).toBe(-10);
    expect((twiceSlowed.data.rulesEngine as { activeEffects: unknown[] }).activeEffects).toHaveLength(1);
  });

  it("blocks Topple commit until the exact save exists, then applies Prone only on failure", () => {
    const pending = resolve("topple", {}, [target(actor("target"))]);
    expect(pending.resolution).toMatchObject({ status: "choice-required", save: { ability: "constitution", dc: 14 } });
    expect(pending.pendingSaves[0]).toMatchObject({ requiredForCommit: true, dc: 14 });

    const successTarget = { ...target(actor("target"), 18, 12), saveOutcome: "success" as const };
    expect(resolve("topple", {}, [successTarget]).resolution?.status).toBe("not-triggered");

    const failureTarget = { ...target(actor("target"), 18, 12), saveOutcome: "failure" as const };
    const failed = resolve("topple", {}, [failureTarget]);
    expect(failed.resolution).toMatchObject({ status: "applied", save: { dc: 14, outcome: "failure" } });
    expect(failed.conditions[0]).toMatchObject({ actorId: "target", conditionId: "prone", reason: "Topple: failed DC 14 Constitution save" });
    expect((failed.targetData[0]!.data.conditions as Array<{ id: string }>)[0]?.id).toBe("prone");
  });

  it("integrates Nick into an existing Attack action and enforces once per turn", () => {
    const sourceData = { rulesEngine: { actionEconomy: { standardActions: { combat: { round: 1, turnIndex: 0, actorId: "source", actionsUsed: 1, actionSurgeGrants: 0, uses: [{ rollId: "item-vex-weapon-attack", usedAt: now }] } } } } };
    const source = actor("source", sourceData);
    const weapon = item("nick");
    const options = { use: true, nickExtraAttack: true };
    expect(dnd5eSrdWeaponMasteryPreflight({ actor: source, data: source.data, item: weapon, roll: { id: `item-${weapon.id}-attack`, metadata: { attackType: "weapon", mastery: "nick" } }, targets: [target(actor("target"))], combat: combat(), options })).toBeUndefined();
    const first = resolve("nick", options, [target(actor("target"), 18, 12)], sourceData);
    expect(first.resolution).toMatchObject({ status: "applied", property: "nick" });
    expect(dnd5eSrdWeaponMasteryPreflight({ actor: source, data: first.data, item: weapon, roll: { id: `item-${weapon.id}-attack`, metadata: { attackType: "weapon", mastery: "nick" } }, targets: [target(actor("target"))], combat: combat(), options })?.code).toBe("weapon_mastery_nick_already_used");
  });

  it("requires a reviewed Cleave target and geometry, then records the once-per-turn secondary attack", () => {
    const primary = target(actor("target"), 18, 12);
    const secondary = target(actor("secondary"), 19, 20);
    const missing = resolve("cleave", {}, [primary, secondary]);
    expect(missing.resolution).toMatchObject({ status: "choice-required" });
    expect(missing.targetData).toEqual([]);

    const unconfirmed = resolve("cleave", { secondaryTargetActorId: "secondary" }, [primary, secondary]);
    expect(unconfirmed.resolution).toMatchObject({ status: "choice-required", geometry: { inferred: false, confirmedByUser: false } });

    const applied = resolve("cleave", { secondaryTargetActorId: "secondary", geometryConfirmed: true }, [primary, secondary]);
    expect(applied.resolution).toMatchObject({ status: "applied", secondaryTargetActorId: "secondary", secondaryAttack: { targetActorId: "secondary", attackOutcome: "critical-hit", damageFormula: "1d8", geometryConfirmed: true } });
    expect(applied.targetData).toEqual([]);
    expect(dnd5eSrdWeaponMasteryPreflight({ actor: actor("source"), data: applied.data, item: item("cleave"), roll: { id: "item-cleave-weapon-attack", metadata: { attackType: "weapon", mastery: "cleave" } }, targets: [primary, secondary], combat: combat(), options: { use: true, secondaryTargetActorId: "secondary", geometryConfirmed: true } })?.code).toBe("weapon_mastery_cleave_already_used");
  });

  it("declares Push as a manual geometry step and never mutates target data", () => {
    const result = resolve("push", { pushDistanceFeet: 10, geometryConfirmed: true });
    expect(result.resolution).toMatchObject({ capability: "manual", status: "manual-step", geometry: { inferred: false, confirmedByUser: true, distanceFeet: 10 } });
    expect(result.targetData).toEqual([]);
    expect(result.auditEvents.at(-1)?.code).toBe("weapon-mastery.push.declared");
  });

  it("surfaces unsupported homebrew mastery as reviewed manual status with no mutation", () => {
    const source = actor("source");
    const result = resolveDnd5eSrdWeaponMastery({ actor: source, data: source.data, item: item("entangle"), roll: { id: "item-entangle-weapon-attack", label: "Entangle Attack", metadata: { attackType: "weapon", mastery: "entangle" } }, targets: [target(actor("target"), 18, 12)], combat: combat(), now, abilityModifier: 3, proficiencyBonus: 3, options: { use: true } });
    expect(result.resolution).toMatchObject({ property: "entangle", capability: "manual", status: "manual-step" });
    expect(result.targetData).toEqual([]);
    expect(result.data).toEqual(source.data);
  });
});
