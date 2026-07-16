import type { Actor, Combat, Item, RulesEffectSchedule } from "@open-tabletop/core";
import { dnd5eSrdClassLevel } from "./dnd-class-levels.js";
import type { Dnd5eSrdConcentrationCleanup } from "./dnd-resolution-types.js";
import {
  DND_5E_SRD_CONCENTRATION_ROLL_ID,
  DND_5E_SRD_RAGE_DAMAGE_ROLL_ID,
  DND_5E_SRD_RAGE_END_ROLL_ID,
  DND_5E_SRD_RAGE_EXTEND_ROLL_ID,
  DND_5E_SRD_RAGE_ROLL_ID,
  DND_5E_SRD_UNARMED_STRIKE_ROLL_ID,
} from "./dnd-roll-identifiers.js";

type JsonRecord = Record<string, unknown>;

export const DND_5E_SRD_RAGE_EFFECT_KIND = "rage";
export const DND_5E_SRD_RAGE_EFFECT_VERSION = 1;
export const DND_5E_SRD_RAGE_RESISTANCES = ["bludgeoning", "piercing", "slashing"] as const;
export const DND_5E_SRD_RAGE_MAXIMUM_ROUNDS = 100;

export type Dnd5eSrdRageExtensionTrigger = "attack-roll" | "forced-saving-throw" | "bonus-action";
export type Dnd5eSrdRageEndReason = "voluntary" | "expired" | "incapacitated" | "heavy-armor" | "rest" | "removed";

export interface Dnd5eSrdRageEffect extends JsonRecord {
  id: string;
  kind: typeof DND_5E_SRD_RAGE_EFFECT_KIND;
  lifecycleVersion: typeof DND_5E_SRD_RAGE_EFFECT_VERSION;
  rollId: typeof DND_5E_SRD_RAGE_ROLL_ID;
  label: "Rage";
  sourceActorId: string;
  startedAt: string;
  startedAtRound?: number;
  startedAtTurnIndex?: number;
  expiresAt?: string;
  expiresAtRound?: number;
  maximumExpiresAt?: string;
  maximumExpiresAtRound?: number;
  lastExtendedAt?: string;
  lastExtendedAtRound?: number;
  lastExtensionTrigger?: Dnd5eSrdRageExtensionTrigger;
  damageBonus: number;
  resistance: string[];
  advantage: { abilityChecks: ["strength"]; savingThrows: ["strength"] };
  restrictions: { spellcasting: false; concentration: false };
  source: { kind: "class-feature"; className: "Barbarian"; classLevel: number; name: "Rage" };
  schedule: RulesEffectSchedule;
  endsOnShortRest: true;
  endsOnLongRest: true;
}

export interface Dnd5eSrdRageStartResult {
  data: JsonRecord;
  effect: Dnd5eSrdRageEffect;
  concentrationCleanup?: Dnd5eSrdConcentrationCleanup;
  concentrationLabel?: string;
  removedConditionIds: string[];
}

export interface Dnd5eSrdRageEndResult {
  ended: boolean;
  data: JsonRecord;
  removedEffectIds: string[];
  reason: Dnd5eSrdRageEndReason;
}

export interface Dnd5eSrdRageExtensionResult {
  extended: boolean;
  data: JsonRecord;
  effect?: Dnd5eSrdRageEffect;
  blocked?: { code: "rage_inactive" | "rage_extension_requires_combat" | "rage_maximum_duration"; reason: string };
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clone(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizedId(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : text(record(value).id);
  return raw?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function rulesState(data: JsonRecord): JsonRecord {
  return clone(record(data.rulesEngine));
}

function dataWithRules(data: JsonRecord, rules: JsonRecord): JsonRecord {
  return { ...clone(data), rulesEngine: rules };
}

function actorData(value: Actor | JsonRecord): JsonRecord {
  const candidate = value as Partial<Actor>;
  return typeof candidate.id === "string" && typeof candidate.systemId === "string" && candidate.data && typeof candidate.data === "object"
    ? candidate.data as JsonRecord
    : value as JsonRecord;
}

function activeEffects(rules: JsonRecord): JsonRecord[] {
  return Array.isArray(rules.activeEffects) ? rules.activeEffects.map((effect) => clone(record(effect))) : [];
}

export function isDnd5eSrdRageEffect(value: unknown): value is Dnd5eSrdRageEffect {
  const effect = record(value);
  return effect.kind === DND_5E_SRD_RAGE_EFFECT_KIND
    && effect.lifecycleVersion === DND_5E_SRD_RAGE_EFFECT_VERSION
    && effect.rollId === DND_5E_SRD_RAGE_ROLL_ID
    && typeof effect.id === "string";
}

export function dnd5eSrdActiveRageEffect(actorOrData: Actor | JsonRecord): Dnd5eSrdRageEffect | undefined {
  const data = actorData(actorOrData);
  const effect = activeEffects(record(data.rulesEngine)).find(isDnd5eSrdRageEffect);
  return effect ? effect as Dnd5eSrdRageEffect : undefined;
}

export function dnd5eSrdRageDamageBonus(actor: Actor): number {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Barbarian"));
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}

export function dnd5eSrdRageFeatureMetadata(actor: Actor): JsonRecord {
  return {
    action: "Bonus Action",
    resource: "rage",
    damageBonus: dnd5eSrdRageDamageBonus(actor),
    damageBonusRollId: DND_5E_SRD_RAGE_DAMAGE_ROLL_ID,
    resistances: ["Bludgeoning", "Piercing", "Slashing"],
    advantage: ["Strength checks", "Strength saving throws"],
    restrictions: ["Cannot maintain Concentration", "Cannot cast spells"],
    duration: { initial: "until the end of your next turn", maximum: "10 minutes" },
    extension: ["Make an attack roll against an enemy", "Force an enemy to make a saving throw", "Take a Bonus Action to extend your Rage"],
  };
}

export function dnd5eSrdRageFeatureRolls(actor: Actor): Array<{ id: string; label: string; formula: string; metadata: JsonRecord }> {
  const damageBonus = dnd5eSrdRageDamageBonus(actor);
  const rolls = [
    { id: DND_5E_SRD_RAGE_ROLL_ID, label: "Rage", formula: "0", metadata: dnd5eSrdRageFeatureMetadata(actor) },
    { id: DND_5E_SRD_RAGE_DAMAGE_ROLL_ID, label: "Rage Damage Bonus", formula: String(damageBonus), metadata: { trigger: "Strength-based weapon or Unarmed Strike damage while raging", damageType: "Weapon", bonusDamage: damageBonus } },
  ];
  if (!dnd5eSrdActiveRageEffect(actor)) return rolls;
  return [...rolls,
    { id: DND_5E_SRD_RAGE_EXTEND_ROLL_ID, label: "Extend Rage", formula: "0", metadata: { action: "Bonus Action", rageLifecycle: "extend", duration: "until the end of your next turn", maximum: "10 minutes" } },
    { id: DND_5E_SRD_RAGE_END_ROLL_ID, label: "End Rage", formula: "0", metadata: { rageLifecycle: "end", effectType: "utility" } },
  ];
}

function itemBelongsToActor(actor: Actor, item: Item): boolean {
  return item.actorId === actor.id && item.campaignId === actor.campaignId && item.systemId === actor.systemId;
}

function positiveQuantity(data: JsonRecord): boolean {
  const quantity = typeof data.quantity === "number" && Number.isFinite(data.quantity) ? data.quantity : 1;
  return quantity > 0;
}

export function dnd5eSrdHeavyArmorItemIds(actor: Actor, items: readonly Item[]): string[] {
  return items.filter((item) => itemBelongsToActor(actor, item)).filter((item) => {
    const data = record(item.data);
    return data.equipped !== false && positiveQuantity(data) && text(data.armorType)?.toLowerCase() === "heavy";
  }).map((item) => item.id);
}

export function dnd5eSrdRageStartEligibility(
  actor: Actor,
  items: readonly Item[] = [],
): { eligible: true } | { eligible: false; code: "rage_unavailable" | "rage_already_active" | "rage_heavy_armor"; reason: string } {
  const features = stringArray(actor.data.features).map((feature) => feature.toLowerCase());
  const resources = record(actor.data.resources);
  if (dnd5eSrdClassLevel(actor, "Barbarian") < 1 && !features.includes("rage") && !("rage" in resources)) {
    return { eligible: false, code: "rage_unavailable", reason: "This actor does not have the Rage feature." };
  }
  if (dnd5eSrdActiveRageEffect(actor)) {
    return { eligible: false, code: "rage_already_active", reason: "Rage is already active. Extend or end the current Rage instead of spending another use." };
  }
  const heavyArmorItemIds = dnd5eSrdHeavyArmorItemIds(actor, items);
  if (heavyArmorItemIds.length > 0) {
    return { eligible: false, code: "rage_heavy_armor", reason: "Rage cannot start while wearing Heavy armor. Unequip the Heavy armor and review the action again." };
  }
  return { eligible: true };
}

function concentrationCleanup(actor: Actor, concentration: JsonRecord): Dnd5eSrdConcentrationCleanup | undefined {
  const rollId = text(concentration.rollId);
  if (!rollId) return undefined;
  return {
    sourceActorId: text(concentration.sourceActorId) ?? actor.id,
    rollId,
    ...(text(concentration.startedAt) ? { startedAt: text(concentration.startedAt) } : {}),
    targetActorIds: [...new Set(stringArray(concentration.targetActorIds))],
    reason: "ended",
  };
}

function maximumExpiry(now: string): string | undefined {
  const startedAt = Date.parse(now);
  return Number.isFinite(startedAt) ? new Date(startedAt + 10 * 60 * 1000).toISOString() : undefined;
}

/**
 * Starts Rage as one sourced active effect. Any current Concentration is
 * represented as an explicit cleanup in the reviewed transaction; callers
 * apply that linked cleanup atomically before persisting this actor update.
 */
export function startDnd5eSrdRage(input: {
  actor: Actor;
  items?: readonly Item[];
  combat?: Pick<Combat, "round" | "turnIndex">;
  now: string;
}): Dnd5eSrdRageStartResult {
  const eligibility = dnd5eSrdRageStartEligibility(input.actor, input.items ?? []);
  if (!eligibility.eligible) throw new Error(eligibility.reason);

  const data = clone(input.actor.data);
  const rules = rulesState(data);
  const concentration = clone(record(rules.concentration));
  const cleanup = concentrationCleanup(input.actor, concentration);
  const concentrationLabel = text(concentration.label);
  if (Object.keys(concentration).length > 0) delete rules.concentration;

  const removedConditionIds: string[] = [];
  if (Object.keys(concentration).length > 0 && Array.isArray(data.conditions)) {
    data.conditions = data.conditions.filter((condition) => {
      const id = normalizedId(condition);
      if (id !== "concentration" && id !== "concentrating") return true;
      removedConditionIds.push(id);
      return false;
    });
  }

  const startedAtRound = input.combat?.round;
  const maximumExpiresAtRound = startedAtRound !== undefined ? startedAtRound + DND_5E_SRD_RAGE_MAXIMUM_ROUNDS : undefined;
  const expiresAtRound = startedAtRound !== undefined ? startedAtRound + 1 : undefined;
  const maximumExpiresAt = maximumExpiry(input.now);
  const expiresAt = input.combat ? undefined : maximumExpiresAt;
  const schedule: RulesEffectSchedule = input.combat
    ? { timing: "end_turn", anchorActorId: input.actor.id, expiresAtRound }
    : { timing: "time", ...(expiresAt ? { expiresAt } : {}) };
  const classLevel = Math.max(1, dnd5eSrdClassLevel(input.actor, "Barbarian"));
  const effect: Dnd5eSrdRageEffect = {
    id: `rage:${input.actor.id}:${input.now}`,
    kind: DND_5E_SRD_RAGE_EFFECT_KIND,
    lifecycleVersion: DND_5E_SRD_RAGE_EFFECT_VERSION,
    rollId: DND_5E_SRD_RAGE_ROLL_ID,
    label: "Rage",
    sourceActorId: input.actor.id,
    startedAt: input.now,
    ...(startedAtRound !== undefined ? { startedAtRound } : {}),
    ...(input.combat ? { startedAtTurnIndex: input.combat.turnIndex } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(expiresAtRound !== undefined ? { expiresAtRound } : {}),
    ...(maximumExpiresAt ? { maximumExpiresAt } : {}),
    ...(maximumExpiresAtRound !== undefined ? { maximumExpiresAtRound } : {}),
    damageBonus: dnd5eSrdRageDamageBonus(input.actor),
    resistance: [...DND_5E_SRD_RAGE_RESISTANCES],
    advantage: { abilityChecks: ["strength"], savingThrows: ["strength"] },
    restrictions: { spellcasting: false, concentration: false },
    source: { kind: "class-feature", className: "Barbarian", classLevel, name: "Rage" },
    schedule,
    endsOnShortRest: true,
    endsOnLongRest: true,
  };
  rules.activeEffects = [
    ...activeEffects(rules).filter((candidate) => !isDnd5eSrdRageEffect(candidate) && !(cleanup && candidate.concentration === true)),
    effect,
  ];
  return {
    data: dataWithRules(data, rules),
    effect,
    ...(cleanup ? { concentrationCleanup: cleanup } : {}),
    ...(concentrationLabel ? { concentrationLabel } : {}),
    removedConditionIds: [...new Set(removedConditionIds)],
  };
}

export function endDnd5eSrdRage(actorOrData: Actor | JsonRecord, reason: Dnd5eSrdRageEndReason): Dnd5eSrdRageEndResult {
  const sourceData = actorData(actorOrData);
  const data = clone(sourceData);
  const rules = rulesState(data);
  const effects = activeEffects(rules);
  const removed = effects.filter(isDnd5eSrdRageEffect);
  if (removed.length === 0) return { ended: false, data, removedEffectIds: [], reason };
  rules.activeEffects = effects.filter((effect) => !isDnd5eSrdRageEffect(effect));
  return { ended: true, data: dataWithRules(data, rules), removedEffectIds: removed.map((effect) => String(effect.id)), reason };
}

export function extendDnd5eSrdRage(input: {
  actor: Actor;
  combat?: Pick<Combat, "round" | "turnIndex">;
  now: string;
  trigger: Dnd5eSrdRageExtensionTrigger;
}): Dnd5eSrdRageExtensionResult {
  const current = dnd5eSrdActiveRageEffect(input.actor);
  if (!current) return { extended: false, data: clone(input.actor.data), blocked: { code: "rage_inactive", reason: "Rage is not active." } };
  if (!input.combat) return { extended: false, data: clone(input.actor.data), blocked: { code: "rage_extension_requires_combat", reason: "Round-by-round Rage extension is available only during combat." } };
  const maximumExpiresAtRound = integer(current.maximumExpiresAtRound) ?? (integer(current.startedAtRound) ?? input.combat.round) + DND_5E_SRD_RAGE_MAXIMUM_ROUNDS;
  if (input.combat.round >= maximumExpiresAtRound) {
    return { extended: false, data: clone(input.actor.data), blocked: { code: "rage_maximum_duration", reason: "Rage has reached its 10-minute maximum duration." } };
  }
  const nextExpiresAtRound = Math.min(maximumExpiresAtRound, Math.max(integer(current.expiresAtRound) ?? 0, input.combat.round + 1));
  const data = clone(input.actor.data);
  const rules = rulesState(data);
  const effects = activeEffects(rules);
  const index = effects.findIndex(isDnd5eSrdRageEffect);
  const effect: Dnd5eSrdRageEffect = {
    ...current,
    expiresAtRound: nextExpiresAtRound,
    maximumExpiresAtRound,
    lastExtendedAt: input.now,
    lastExtendedAtRound: input.combat.round,
    lastExtensionTrigger: input.trigger,
    schedule: { ...record(current.schedule), timing: "end_turn", anchorActorId: input.actor.id, expiresAtRound: nextExpiresAtRound } as unknown as RulesEffectSchedule,
  };
  effects[index] = effect;
  rules.activeEffects = effects;
  return { extended: true, data: dataWithRules(data, rules), effect };
}

export function dnd5eSrdRageExtensionTriggerForAction(
  actor: Actor,
  roll: { id: string; metadata?: JsonRecord },
  targetActorIds: readonly string[],
): Dnd5eSrdRageExtensionTrigger | undefined {
  if (!dnd5eSrdActiveRageEffect(actor)) return undefined;
  if (roll.id === DND_5E_SRD_RAGE_EXTEND_ROLL_ID) return "bonus-action";
  const hostileTarget = targetActorIds.some((actorId) => actorId !== actor.id);
  if (!hostileTarget) return undefined;
  const metadata = record(roll.metadata);
  if (roll.id.endsWith("-attack") || text(metadata.attackType)) return "attack-roll";
  if (text(record(metadata.save).ability)) return "forced-saving-throw";
  return undefined;
}

export function dnd5eSrdRageDamageBonusForRoll(actor: Actor, items: readonly Item[], rollId: string): number {
  const effect = dnd5eSrdActiveRageEffect(actor);
  if (!effect) return 0;
  if (rollId === DND_5E_SRD_UNARMED_STRIKE_ROLL_ID) return effect.damageBonus;
  const item = items.find((candidate) => itemBelongsToActor(actor, candidate) && (
    rollId === `item-${candidate.id}-damage` || rollId === `item-${candidate.id}-versatile-damage`
  ));
  if (!item) return 0;
  const data = record(item.data);
  const weapon = text(data.category)?.toLowerCase() === "weapon" || text(data.equipmentCategory)?.toLowerCase() === "weapon";
  const ability = (text(data.ability) ?? "strength").toLowerCase();
  return weapon && ability === "strength" ? effect.damageBonus : 0;
}

export function dnd5eSrdRageActionBlock(
  actor: Actor,
  requestedItem: Item | undefined,
  roll: { id: string; metadata?: JsonRecord },
): { code: "rage_spellcasting_blocked" | "rage_concentration_blocked"; reason: string } | undefined {
  if (!dnd5eSrdActiveRageEffect(actor)) return undefined;
  if (requestedItem?.type === "spell" || roll.id.startsWith("spell-")) {
    return { code: "rage_spellcasting_blocked", reason: "Rage is active, so this actor cannot cast spells. End Rage before reviewing this spell action." };
  }
  if (roll.id === DND_5E_SRD_CONCENTRATION_ROLL_ID || record(roll.metadata).concentration === true) {
    return { code: "rage_concentration_blocked", reason: "Rage is active, so this actor cannot maintain Concentration. End Rage before reviewing this concentration action." };
  }
  return undefined;
}

export function dnd5eSrdRagePreflight(input: {
  actor: Actor;
  items: readonly Item[];
  requestedItem?: Item;
  roll: { id: string; metadata?: JsonRecord };
  consumeResources: boolean;
}): { code: string; reason: string } | undefined {
  if ((input.roll.id === DND_5E_SRD_RAGE_ROLL_ID || input.roll.id === DND_5E_SRD_RAGE_END_ROLL_ID) && !input.consumeResources) {
    return { code: "rage_lifecycle_requires_review", reason: "Starting or ending Rage changes active defenses and must use the reviewed consequential-action flow." };
  }
  if (input.roll.id === DND_5E_SRD_RAGE_ROLL_ID) {
    const eligibility = dnd5eSrdRageStartEligibility(input.actor, input.items);
    if (!eligibility.eligible) return { code: eligibility.code, reason: eligibility.reason };
  }
  if ((input.roll.id === DND_5E_SRD_RAGE_EXTEND_ROLL_ID || input.roll.id === DND_5E_SRD_RAGE_END_ROLL_ID) && !dnd5eSrdActiveRageEffect(input.actor)) {
    return { code: "rage_inactive", reason: "Rage is not active." };
  }
  return dnd5eSrdRageActionBlock(input.actor, input.requestedItem, input.roll);
}

export interface Dnd5eSrdRageActionResolution {
  data: JsonRecord;
  blocked?: { code: string; reason: string };
  effects: Array<{ type: "utility"; targetActorId: string; targetActorName: string; duration?: string; resistance?: string[] }>;
  conditions: Array<{ actorId: string; operation: "breakConcentration"; conditionId: "concentration"; conditionName: "Concentration"; reason: string }>;
  warnings: string[];
  auditEvents: Array<{ code: string; actorId: string; rollId: string; message: string; data?: JsonRecord }>;
  concentrationCleanups: Dnd5eSrdConcentrationCleanup[];
}

/** Applies start, end, or qualifying extension consequences after action/resource gates succeed. */
export function resolveDnd5eSrdRageLifecycle(input: {
  actor: Actor;
  items: readonly Item[];
  roll: { id: string; metadata?: JsonRecord };
  targetActorIds: readonly string[];
  combat?: Pick<Combat, "round" | "turnIndex">;
  now: string;
}): Dnd5eSrdRageActionResolution {
  const result: Dnd5eSrdRageActionResolution = { data: clone(input.actor.data), effects: [], conditions: [], warnings: [], auditEvents: [], concentrationCleanups: [] };
  if (input.roll.id === DND_5E_SRD_RAGE_ROLL_ID) {
    const rage = startDnd5eSrdRage({ actor: input.actor, items: input.items, combat: input.combat, now: input.now });
    result.data = rage.data;
    if (rage.concentrationCleanup) {
      result.concentrationCleanups.push(rage.concentrationCleanup);
      const suffix = rage.concentrationLabel ? ` on ${rage.concentrationLabel}` : "";
      result.conditions.push({ actorId: input.actor.id, operation: "breakConcentration", conditionId: "concentration", conditionName: "Concentration", reason: `Starting Rage ends Concentration${suffix}.` });
      result.warnings.push(`Starting Rage ends Concentration${suffix}.`);
    }
    result.effects.push({ type: "utility", targetActorId: input.actor.id, targetActorName: input.actor.name, duration: input.combat ? "until the end of your next turn; extendable up to 10 minutes" : "up to 10 minutes", resistance: [...rage.effect.resistance] });
    result.auditEvents.push({ code: "rage.started", actorId: input.actor.id, rollId: input.roll.id, message: `${input.actor.name} started Rage`, data: { effectId: rage.effect.id, damageBonus: rage.effect.damageBonus, resistance: rage.effect.resistance, concentrationEnded: Boolean(rage.concentrationCleanup), expiresAtRound: rage.effect.expiresAtRound, maximumExpiresAtRound: rage.effect.maximumExpiresAtRound } });
    return result;
  }
  if (input.roll.id === DND_5E_SRD_RAGE_END_ROLL_ID) {
    const ended = endDnd5eSrdRage(input.actor, "voluntary");
    result.data = ended.data;
    result.auditEvents.push({ code: "rage.ended", actorId: input.actor.id, rollId: input.roll.id, message: `${input.actor.name} ended Rage`, data: { reason: ended.reason, removedEffectIds: ended.removedEffectIds } });
    return result;
  }
  const trigger = dnd5eSrdRageExtensionTriggerForAction(input.actor, input.roll, input.targetActorIds);
  if (!trigger) return result;
  const extension = extendDnd5eSrdRage({ actor: input.actor, combat: input.combat, now: input.now, trigger });
  if (extension.extended && extension.effect) {
    result.data = extension.data;
    result.auditEvents.push({ code: "rage.extended", actorId: input.actor.id, rollId: input.roll.id, message: `${input.actor.name} extended Rage`, data: { trigger, expiresAtRound: extension.effect.expiresAtRound, maximumExpiresAtRound: extension.effect.maximumExpiresAtRound } });
  } else if (input.roll.id === DND_5E_SRD_RAGE_EXTEND_ROLL_ID && extension.blocked) result.blocked = extension.blocked;
  else if (extension.blocked?.code === "rage_maximum_duration") result.warnings.push(extension.blocked.reason);
  return result;
}

export function dnd5eSrdRageBreakReason(actor: Actor, items: readonly Item[] = []): "incapacitated" | "heavy-armor" | undefined {
  const breaking = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "dead"]);
  const conditions = Array.isArray(actor.data.conditions) ? actor.data.conditions.map(normalizedId).filter((id): id is string => Boolean(id)) : [];
  if (conditions.some((id) => breaking.has(id)) || actor.data.lifeState === "dead" || actor.data.defeated === true) return "incapacitated";
  return dnd5eSrdHeavyArmorItemIds(actor, items).length > 0 ? "heavy-armor" : undefined;
}
