import type { Actor, Item } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export interface Dnd5eSrdArmorClassDetails {
  value: number;
  base: number;
  dexModifier: number;
  armorName: string;
  armorItemId?: string;
  shieldBonus: number;
  shieldItemIds: string[];
  armorClassBonus?: number;
  armorClassBonusItemIds?: string[];
  stealthDisadvantage: boolean;
  strengthRequirement?: number;
  speedPenalty: number;
}

export interface Dnd5eSrdSpeedDetails {
  value: number;
  base: number;
  classBonus: number;
  classSources: string[];
  armorPenalty: number;
  conditionPenalty: number;
  weaponMasteryPenalty?: number;
  conditionMultiplier: number;
  conditionSetTo?: number;
  conditionSources: string[];
}

export interface Dnd5eSrdDerivedStatsDependencies {
  classLevel(actor: Actor, className: string): number;
  hasDraconicResilience(actor: Actor): boolean;
  itemModifiersAreActive(actor: Actor, item: Item): boolean;
  monkUnarmoredMovementBonus(level: number): number;
  conditionState(actor: Actor): {
    effects: Array<{ sourceId: string; data: JsonRecord }>;
    exhaustionLevel: number;
  };
  weaponMasterySpeedPenalty(actor: Actor): number;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function itemQuantity(item: Item): number {
  return Math.max(0, numberValue(record(item.data).quantity, 1));
}

function attributeModifier(actor: Actor, ability: string): number {
  const score = numberValue(record(actor.data.attributes)[ability], 10);
  return Math.floor((score - 10) / 2);
}

function isArmorData(data: JsonRecord): boolean {
  return Number.isFinite(numberValue(data.armorBase, Number.NaN));
}

function isShieldData(data: JsonRecord): boolean {
  return Number.isFinite(numberValue(data.armorBonus, Number.NaN));
}

function isArmorOrShieldData(data: JsonRecord): boolean {
  return isArmorData(data) || isShieldData(data);
}

export function createDnd5eSrdDerivedStats(dependencies: Dnd5eSrdDerivedStatsDependencies) {
  const equippedItemNumericBonus = (
    actor: Actor,
    items: Item[],
    bonusKey: string,
    options: { hasEquippedArmorOrShield?: boolean } = {}
  ): { total: number; itemIds: string[] } => {
    const itemBonuses = items
      .filter((item) => item.actorId === actor.id && itemQuantity(item) > 0)
      .flatMap((item) => {
        const data = record(item.data);
        if (data.equipped === false || !dependencies.itemModifiersAreActive(actor, item)) return [];
        if (bonusKey === "spellAttackBonus" && data.consumable === true) return [];
        if (bonusKey === "armorClassBonus" && options.hasEquippedArmorOrShield && data.requiresNoArmorOrShield === true) return [];
        const bonus = numberValue(data[bonusKey], Number.NaN);
        return Number.isFinite(bonus) ? [{ itemId: item.id, bonus }] : [];
      });
    return {
      total: itemBonuses.reduce((sum, item) => sum + item.bonus, 0),
      itemIds: itemBonuses.map((item) => item.itemId)
    };
  };

  const criticalHitsBecomeNormalHits = (actor: Actor, items: Item[] = []): boolean => items
    .filter((item) => item.actorId === actor.id && itemQuantity(item) > 0)
    .filter((item) => record(item.data).equipped !== false)
    .filter((item) => dependencies.itemModifiersAreActive(actor, item))
    .some((item) => record(item.data).criticalHitsBecomeNormalHits === true);

  const armorClass = (actor: Actor, items: Item[] = []): Dnd5eSrdArmorClassDetails => {
    const dexModifier = attributeModifier(actor, "dexterity");
    const wisdomModifier = attributeModifier(actor, "wisdom");
    const constitutionModifier = attributeModifier(actor, "constitution");
    const strengthScore = numberValue(record(actor.data.attributes).strength, 10);
    const actorItems = items.filter((item) => item.actorId === actor.id && itemQuantity(item) > 0);
    const hasEquippedArmor = actorItems.some((item) => record(item.data).equipped !== false && isArmorData(record(item.data)));
    const hasEquippedShield = actorItems.some((item) => record(item.data).equipped !== false && isShieldData(record(item.data)));
    const armorCandidates: Dnd5eSrdArmorClassDetails[] = [{
      value: 10 + dexModifier,
      base: 10,
      dexModifier,
      armorName: "Unarmored",
      shieldBonus: 0,
      shieldItemIds: [],
      stealthDisadvantage: false,
      speedPenalty: 0
    }];
    if (dependencies.classLevel(actor, "Monk") >= 1 && !hasEquippedArmor && !hasEquippedShield) {
      armorCandidates.push({ value: 10 + dexModifier + wisdomModifier, base: 10, dexModifier, armorName: "Unarmored Defense", shieldBonus: 0, shieldItemIds: [], stealthDisadvantage: false, speedPenalty: 0 });
    }
    if (dependencies.classLevel(actor, "Barbarian") >= 1 && !hasEquippedArmor) {
      armorCandidates.push({ value: 10 + dexModifier + constitutionModifier, base: 10, dexModifier, armorName: "Unarmored Defense", shieldBonus: 0, shieldItemIds: [], stealthDisadvantage: false, speedPenalty: 0 });
    }
    if (dependencies.hasDraconicResilience(actor) && !hasEquippedArmor) {
      armorCandidates.push({ value: 10 + dexModifier + attributeModifier(actor, "charisma"), base: 10, dexModifier, armorName: "Draconic Resilience", shieldBonus: 0, shieldItemIds: [], stealthDisadvantage: false, speedPenalty: 0 });
    }
    for (const item of actorItems) {
      const data = record(item.data);
      if (data.equipped === false) continue;
      const armorBase = numberValue(data.armorBase, Number.NaN);
      if (!Number.isFinite(armorBase)) continue;
      const dexContribution = data.dexBonus === false ? 0 : Math.min(dexModifier, numberValue(data.dexCap, dexModifier));
      const strengthRequirement = numberValue(data.strengthRequirement, Number.NaN);
      const hasStrengthRequirement = Number.isFinite(strengthRequirement);
      armorCandidates.push({
        value: armorBase + dexContribution,
        base: armorBase,
        dexModifier: dexContribution,
        armorName: item.name,
        armorItemId: item.id,
        shieldBonus: 0,
        shieldItemIds: [],
        stealthDisadvantage: data.stealthDisadvantage === true,
        strengthRequirement: hasStrengthRequirement ? strengthRequirement : undefined,
        speedPenalty: hasStrengthRequirement && strengthScore < strengthRequirement ? -10 : 0
      });
    }
    const armor = armorCandidates.sort((left, right) => right.value - left.value)[0]!;
    const shieldItems = actorItems.filter((item) => record(item.data).equipped !== false && isShieldData(record(item.data)));
    const shieldBonus = shieldItems.reduce((max, item) => Math.max(max, numberValue(record(item.data).armorBonus, 0)), 0);
    const armorClassItemBonus = equippedItemNumericBonus(actor, actorItems, "armorClassBonus", { hasEquippedArmorOrShield: hasEquippedArmor || hasEquippedShield });
    return {
      ...armor,
      value: armor.value + shieldBonus + armorClassItemBonus.total,
      shieldBonus,
      shieldItemIds: shieldBonus > 0 ? shieldItems.filter((item) => numberValue(record(item.data).armorBonus, 0) === shieldBonus).map((item) => item.id) : [],
      ...(armorClassItemBonus.total > 0 ? { armorClassBonus: armorClassItemBonus.total, armorClassBonusItemIds: armorClassItemBonus.itemIds } : {})
    };
  };

  const speed = (actor: Actor, items: Item[] = []): Dnd5eSrdSpeedDetails => {
    const base = Math.max(0, numberValue(actor.data.speed, 30));
    const equipped = items.filter((item) => item.actorId === actor.id && itemQuantity(item) > 0).filter((item) => record(item.data).equipped !== false);
    const wearsHeavyArmor = equipped.some((item) => String(record(item.data).armorType ?? "").toLowerCase() === "heavy");
    const wearsArmorOrShield = equipped.some((item) => isArmorOrShieldData(record(item.data)));
    const barbarianFastMovement = dependencies.classLevel(actor, "Barbarian") >= 5 && !wearsHeavyArmor ? 10 : 0;
    const monkUnarmoredMovement = !wearsArmorOrShield ? dependencies.monkUnarmoredMovementBonus(dependencies.classLevel(actor, "Monk")) : 0;
    const classBonus = barbarianFastMovement + monkUnarmoredMovement;
    const classSources = [...(barbarianFastMovement ? ["barbarian-fast-movement"] : []), ...(monkUnarmoredMovement ? ["monk-unarmored-movement"] : [])];
    const armorPenalty = armorClass(actor, items).speedPenalty;
    const { effects, exhaustionLevel } = dependencies.conditionState(actor);
    const exhaustionPenalty = exhaustionLevel > 0 ? exhaustionLevel * -5 : 0;
    const weaponMasteryPenalty = dependencies.weaponMasterySpeedPenalty(actor);
    let conditionSetTo: number | undefined;
    let conditionMultiplier = 1;
    const conditionSources: string[] = [];
    for (const effect of effects) {
      const speedSetTo = numberValue(effect.data.speedSetTo, Number.NaN);
      if (Number.isFinite(speedSetTo)) {
        conditionSetTo = conditionSetTo === undefined ? speedSetTo : Math.min(conditionSetTo, speedSetTo);
        conditionSources.push(effect.sourceId);
      }
      const multiplier = numberValue(effect.data.speedMultiplier, Number.NaN);
      if (Number.isFinite(multiplier)) {
        conditionMultiplier = Math.min(conditionMultiplier, Math.max(0, multiplier));
        conditionSources.push(effect.sourceId);
      }
    }
    if (exhaustionLevel > 0) conditionSources.push("exhaustion");
    if (weaponMasteryPenalty) conditionSources.push("weapon-mastery-slow");
    const penalizedSpeed = Math.max(0, base + classBonus + armorPenalty + exhaustionPenalty + weaponMasteryPenalty);
    const multipliedSpeed = Math.floor(penalizedSpeed * conditionMultiplier);
    const value = Math.max(0, conditionSetTo === undefined ? multipliedSpeed : Math.min(conditionSetTo, multipliedSpeed));
    return {
      value,
      base,
      classBonus,
      classSources,
      armorPenalty,
      conditionPenalty: exhaustionPenalty,
      ...(weaponMasteryPenalty ? { weaponMasteryPenalty } : {}),
      conditionMultiplier,
      ...(conditionSetTo !== undefined ? { conditionSetTo } : {}),
      conditionSources: [...new Set(conditionSources)]
    };
  };

  return {
    dnd5eSrdEquippedItemNumericBonus: equippedItemNumericBonus,
    dnd5eSrdCriticalHitsBecomeNormalHits: criticalHitsBecomeNormalHits,
    dnd5eSrdArmorClass: armorClass,
    dnd5eSrdSpeed: speed
  };
}
