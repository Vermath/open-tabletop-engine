import type { Actor, Combat, Item } from "@open-tabletop/core";
import type { Dnd5eSrdConcentrationCleanup } from "./dnd-resolution-types.js";

type JsonRecord = Record<string, unknown>;

export const DND_5E_SRD_WEAPON_MASTERY_SOURCE = {
  source: "SRD 5.2.1",
  sourcePage: 91,
  sourcePdfPage: 90,
  sourceUrl: "https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.pdf"
} as const;

export type Dnd5eSrdWeaponMasteryProperty = "cleave" | "graze" | "nick" | "push" | "sap" | "slow" | "topple" | "vex";
export type Dnd5eSrdWeaponMasteryCapability = "automatic" | "choice" | "manual";
export type Dnd5eSrdWeaponMasteryAttackOutcome = "critical-hit" | "hit" | "miss";

export interface Dnd5eSrdWeaponMasteryRule {
  property: Dnd5eSrdWeaponMasteryProperty;
  capability: Dnd5eSrdWeaponMasteryCapability;
  trigger: "hit" | "hit-and-damage" | "miss" | "light-extra-attack";
  oncePerTurn: boolean;
  requiresSave: boolean;
  requiresSecondaryTarget: boolean;
  requiresGeometry: boolean;
  summary: string;
  source: typeof DND_5E_SRD_WEAPON_MASTERY_SOURCE.source;
  sourcePage: typeof DND_5E_SRD_WEAPON_MASTERY_SOURCE.sourcePage;
  sourcePdfPage: typeof DND_5E_SRD_WEAPON_MASTERY_SOURCE.sourcePdfPage;
  sourceUrl: typeof DND_5E_SRD_WEAPON_MASTERY_SOURCE.sourceUrl;
}

const rule = (
  property: Dnd5eSrdWeaponMasteryProperty,
  capability: Dnd5eSrdWeaponMasteryCapability,
  trigger: Dnd5eSrdWeaponMasteryRule["trigger"],
  summary: string,
  options: Partial<Pick<Dnd5eSrdWeaponMasteryRule, "oncePerTurn" | "requiresSave" | "requiresSecondaryTarget" | "requiresGeometry">> = {}
): Dnd5eSrdWeaponMasteryRule => ({
  property,
  capability,
  trigger,
  oncePerTurn: false,
  requiresSave: false,
  requiresSecondaryTarget: false,
  requiresGeometry: false,
  summary,
  ...options,
  ...DND_5E_SRD_WEAPON_MASTERY_SOURCE
});

/** Authoritative automation boundary for every SRD 5.2.1 mastery property. */
export const DND_5E_SRD_WEAPON_MASTERY_RULES: Readonly<Record<Dnd5eSrdWeaponMasteryProperty, Dnd5eSrdWeaponMasteryRule>> = {
  cleave: rule("cleave", "choice", "hit", "Review a second creature and make the Cleave attack once per turn; the engine never infers reach or 5-foot geometry.", { oncePerTurn: true, requiresSecondaryTarget: true, requiresGeometry: true }),
  graze: rule("graze", "automatic", "miss", "On a miss, deal the attack ability modifier as the weapon's damage type; no other modifier increases it."),
  nick: rule("nick", "automatic", "light-extra-attack", "Make the Light property's extra attack as part of the Attack action once per turn.", { oncePerTurn: true }),
  push: rule("push", "manual", "hit", "Declare up to 10 feet straight away against a Large or smaller target; token geometry remains a reviewed GM step.", { requiresGeometry: true }),
  sap: rule("sap", "automatic", "hit", "The target has Disadvantage on its next attack roll before the start of your next turn."),
  slow: rule("slow", "automatic", "hit-and-damage", "Reduce the target's Speed by 10 feet until the start of your next turn; multiple Slow hits never exceed 10 feet."),
  topple: rule("topple", "choice", "hit", "The target makes a Constitution save against 8 + attack ability modifier + Proficiency Bonus or gains Prone.", { requiresSave: true }),
  vex: rule("vex", "automatic", "hit-and-damage", "Gain Advantage on your next attack against the target before the end of your next turn.")
};

export interface Dnd5eSrdWeaponMasteryUse {
  use: boolean;
  /** Required declaration for Vex and Slow because the ordinary attack and damage buttons are separate transactions. */
  damageDealt?: boolean;
  /** Marks this attack as the Light property's extra attack folded into the current Attack action by Nick. */
  nickExtraAttack?: boolean;
  /** Explicit Cleave target; it is never inferred from the primary target or map. */
  secondaryTargetActorId?: string;
  /** User-reviewed statement that the Cleave target is within 5 feet of the first target and within weapon reach. */
  geometryConfirmed?: boolean;
  /** Push declaration only. Omission means "up to 10 feet" and still never mutates token geometry. */
  pushDistanceFeet?: number;
}

export interface Dnd5eSrdWeaponMasteryResolution {
  property: string;
  capability: Dnd5eSrdWeaponMasteryCapability;
  status: "awaiting-roll" | "applied" | "not-triggered" | "choice-required" | "manual-step";
  trigger: string;
  message: string;
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
  sourceUrl: string;
  targetActorId?: string;
  secondaryTargetActorId?: string;
  attackOutcome?: Dnd5eSrdWeaponMasteryAttackOutcome;
  save?: { ability: "constitution"; dc: number; outcome?: "success" | "failure" };
  secondaryAttack?: {
    targetActorId: string;
    attackOutcome?: Dnd5eSrdWeaponMasteryAttackOutcome;
    damageFormula: string;
    geometryConfirmed: true;
  };
  geometry?: { inferred: false; confirmedByUser: boolean; instruction: string; distanceFeet?: number };
}

export interface Dnd5eSrdWeaponMasteryBlocked {
  code: string;
  reason: string;
  supportStatus?: "automated" | "manual" | "unsupported";
}

export interface Dnd5eSrdWeaponMasteryTarget {
  actor: Actor;
  items?: Item[];
  rollTotal?: number;
  naturalD20?: number;
  armorClass?: number;
  saveOutcome?: "success" | "failure";
  proneImmune?: boolean;
}

export interface Dnd5eSrdWeaponMasteryEffect {
  type: "damage" | "healing" | "condition" | "utility";
  targetActorId: string;
  targetActorName: string;
  pool?: string;
  amount?: number;
  before?: number | string[];
  after?: number | string[];
  max?: number;
  damageType?: string;
  resistance?: string[];
  immunity?: string[];
  vulnerability?: string[];
  duration?: string;
  conditionId?: string;
  conditionName?: string;
  alreadyPresent?: boolean;
}

export interface Dnd5eSrdWeaponMasteryConditionChange {
  actorId: string;
  operation: "apply" | "remove" | "startConcentration" | "replaceConcentration" | "breakConcentration" | "expire";
  conditionId?: string;
  conditionName?: string;
  duration?: string;
  durationRounds?: number;
  expiresAtRound?: number;
  repeatSave?: string;
  reason: string;
}

export interface Dnd5eSrdWeaponMasteryPendingSave {
  actorId: string;
  ability: string;
  dc?: number;
  reason: string;
  success?: unknown;
  requiredForCommit?: boolean;
  recurring?: boolean;
  timing?: string;
  conditionIds?: string[];
}

export interface Dnd5eSrdWeaponMasteryAuditEvent {
  code: string;
  actorId: string;
  targetActorId?: string;
  rollId: string;
  message: string;
  data?: JsonRecord;
}

export interface Dnd5eSrdWeaponMasteryDamageApplication {
  data: JsonRecord;
  effect: Dnd5eSrdWeaponMasteryEffect;
  pendingSave?: Dnd5eSrdWeaponMasteryPendingSave;
  condition?: Dnd5eSrdWeaponMasteryConditionChange;
  auditEvent?: Dnd5eSrdWeaponMasteryAuditEvent;
  cleanup?: Dnd5eSrdConcentrationCleanup;
}

export interface Dnd5eSrdWeaponMasteryLifecycleResult {
  data: JsonRecord;
  targetData: Array<{ actorId: string; data: JsonRecord }>;
  effects: Dnd5eSrdWeaponMasteryEffect[];
  conditions: Dnd5eSrdWeaponMasteryConditionChange[];
  pendingSaves: Dnd5eSrdWeaponMasteryPendingSave[];
  auditEvents: Dnd5eSrdWeaponMasteryAuditEvent[];
  concentrationCleanups: Dnd5eSrdConcentrationCleanup[];
  warnings: string[];
  actionLedger?: {
    round: number;
    turnIndex: number;
    actorId: string;
    actionsUsed: number;
    actionSurgeGrants: number;
    uses: Array<{ rollId: string; usedAt: string }>;
    actionSurgeUsedAt?: string;
  };
  blocked?: Dnd5eSrdWeaponMasteryBlocked;
  resolution?: Dnd5eSrdWeaponMasteryResolution;
}

interface MasteryTurnUse {
  property: "cleave" | "nick";
  rollId: string;
  usedAt: string;
}

interface MasteryTurnLedger {
  round: number;
  turnIndex: number;
  actorId: string;
  uses: MasteryTurnUse[];
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

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function masteryProperty(metadata: JsonRecord): string | undefined {
  return text(metadata.mastery)?.toLowerCase();
}

function masteryRule(property: string | undefined): Dnd5eSrdWeaponMasteryRule | undefined {
  return property && property in DND_5E_SRD_WEAPON_MASTERY_RULES
    ? DND_5E_SRD_WEAPON_MASTERY_RULES[property as Dnd5eSrdWeaponMasteryProperty]
    : undefined;
}

function masteryResolution(
  property: string,
  capability: Dnd5eSrdWeaponMasteryCapability,
  status: Dnd5eSrdWeaponMasteryResolution["status"],
  trigger: string,
  message: string,
  details: Partial<Omit<Dnd5eSrdWeaponMasteryResolution, "property" | "capability" | "status" | "trigger" | "message" | keyof typeof DND_5E_SRD_WEAPON_MASTERY_SOURCE>> = {}
): Dnd5eSrdWeaponMasteryResolution {
  return { property, capability, status, trigger, message, ...DND_5E_SRD_WEAPON_MASTERY_SOURCE, ...details };
}

function activeEffects(data: JsonRecord): JsonRecord[] {
  const raw = record(data.rulesEngine).activeEffects;
  return Array.isArray(raw) ? raw.map((effect) => clone(record(effect))) : [];
}

function withActiveEffects(data: JsonRecord, effects: JsonRecord[]): JsonRecord {
  const rules = clone(record(data.rulesEngine));
  rules.activeEffects = effects;
  return { ...data, rulesEngine: rules };
}

function isMasteryEffect(effect: JsonRecord, property?: string): boolean {
  return text(effect.kind) === "weaponMastery" && (!property || text(effect.property) === property);
}

function effectSourceLabel(effect: JsonRecord): string {
  const property = text(effect.property) ?? "weapon";
  return `Weapon Mastery: ${property.charAt(0).toUpperCase()}${property.slice(1)}`;
}

/** Selected-weapon check shared by compendium weapons and stable homebrew weapon ids/names. */
export function dnd5eSrdActorHasWeaponMastery(actor: Actor, item: Item, itemData: JsonRecord): boolean {
  const candidateIds = new Set([
    text(itemData.compendiumId),
    text(itemData.weaponId),
    item.id,
    slug(item.name)
  ].filter((value): value is string => Boolean(value)));
  const masteries = Array.isArray(actor.data.weaponMasteries) ? actor.data.weaponMasteries : [];
  return masteries.some((raw) => {
    const weaponId = text(record(raw).weaponId);
    return Boolean(weaponId && candidateIds.has(weaponId));
  });
}

export function dnd5eSrdWeaponMasteryRule(property: string): Dnd5eSrdWeaponMasteryRule | undefined {
  const found = masteryRule(property.trim().toLowerCase());
  return found ? { ...found } : undefined;
}

/** Number of simultaneously selected Weapon Mastery weapons at a class level. */
export function dnd5eSrdWeaponMasteryChoiceCount(className: string, classLevel: number): number {
  const normalizedClass = className.trim().toLowerCase();
  const level = Math.max(0, Math.min(20, Math.floor(classLevel)));
  if (normalizedClass === "fighter") return level >= 16 ? 6 : level >= 10 ? 5 : level >= 4 ? 4 : level >= 1 ? 3 : 0;
  if (normalizedClass === "barbarian") return level >= 10 ? 4 : level >= 4 ? 3 : level >= 1 ? 2 : 0;
  return level >= 1 && ["paladin", "ranger", "rogue"].includes(normalizedClass) ? 2 : 0;
}

/** Target-aware roll-mode sources from unexpired mastery effects. Lifecycle expiry remains combat-authoritative. */
export function dnd5eSrdWeaponMasteryRollModeSources(actor: Actor, target?: Actor): { advantageSources: string[]; disadvantageSources: string[] } {
  const advantageSources = target
    ? activeEffects(actor.data)
        .filter((effect) => isMasteryEffect(effect, "vex") && text(effect.targetActorId) === target.id)
        .map(effectSourceLabel)
    : [];
  const disadvantageSources = activeEffects(actor.data)
    .filter((effect) => isMasteryEffect(effect, "sap"))
    .map(effectSourceLabel);
  return { advantageSources: [...new Set(advantageSources)], disadvantageSources: [...new Set(disadvantageSources)] };
}

/** Slow never stacks above a 10-foot reduction, regardless of how many sourced effects are present. */
export function dnd5eSrdWeaponMasterySpeedPenalty(actor: Actor): number {
  return activeEffects(actor.data).some((effect) => isMasteryEffect(effect, "slow")) ? -10 : 0;
}

function attackOutcome(target: Dnd5eSrdWeaponMasteryTarget, criticalHitOn: number[]): Dnd5eSrdWeaponMasteryAttackOutcome | undefined {
  if (!Number.isFinite(target.rollTotal) || !Number.isFinite(target.armorClass)) return undefined;
  if (target.naturalD20 === 1) return "miss";
  if (target.naturalD20 === 20 || (target.naturalD20 !== undefined && criticalHitOn.includes(target.naturalD20))) return "critical-hit";
  return target.rollTotal! >= target.armorClass! ? "hit" : "miss";
}

function currentActorId(combat: Pick<Combat, "turnIndex" | "combatants">): string | undefined {
  return combat.combatants[combat.turnIndex]?.actorId;
}

function turnLedger(data: JsonRecord, actorId: string, combat: Pick<Combat, "id" | "round" | "turnIndex">): MasteryTurnLedger {
  const stored = record(record(record(data.rulesEngine).weaponMastery).turnUses)[combat.id];
  const value = record(stored);
  const sameTurn = integer(value.round, -1) === combat.round && integer(value.turnIndex, -1) === combat.turnIndex && text(value.actorId) === actorId;
  if (!sameTurn) return { round: combat.round, turnIndex: combat.turnIndex, actorId, uses: [] };
  const uses = Array.isArray(value.uses) ? value.uses.flatMap((raw) => {
    const entry = record(raw);
    const property = text(entry.property);
    const rollId = text(entry.rollId);
    const usedAt = text(entry.usedAt);
    return (property === "cleave" || property === "nick") && rollId && usedAt ? [{ property, rollId, usedAt } satisfies MasteryTurnUse] : [];
  }) : [];
  return { round: combat.round, turnIndex: combat.turnIndex, actorId, uses };
}

function withTurnUse(data: JsonRecord, actorId: string, combat: Pick<Combat, "id" | "round" | "turnIndex">, property: "cleave" | "nick", rollId: string, now: string): JsonRecord {
  const rules = clone(record(data.rulesEngine));
  const mastery = clone(record(rules.weaponMastery));
  const turnUses = clone(record(mastery.turnUses));
  const ledger = turnLedger(data, actorId, combat);
  turnUses[combat.id] = { ...ledger, uses: [...ledger.uses, { property, rollId, usedAt: now }] } satisfies MasteryTurnLedger;
  mastery.turnUses = turnUses;
  rules.weaponMastery = mastery;
  return { ...data, rulesEngine: rules };
}

function standardActionLedger(data: JsonRecord, actorId: string, combat: Pick<Combat, "id" | "round" | "turnIndex">): JsonRecord | undefined {
  const stored = record(record(record(data.rulesEngine).actionEconomy).standardActions)[combat.id];
  const value = record(stored);
  return integer(value.round, -1) === combat.round && integer(value.turnIndex, -1) === combat.turnIndex && text(value.actorId) === actorId ? value : undefined;
}

function nextTurnRound(combat: Pick<Combat, "round" | "turnIndex" | "combatants">, actorId: string): number {
  const actorIndex = combat.combatants.findIndex((combatant) => combatant.actorId === actorId);
  return combat.round + (actorIndex < 0 || actorIndex <= combat.turnIndex ? 1 : 0);
}

function sourcedEffect(
  property: "vex" | "sap" | "slow",
  sourceActor: Actor,
  target: Actor,
  rollId: string,
  now: string,
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">,
  timing: "start_turn" | "end_turn"
): JsonRecord {
  const expiresAtRound = nextTurnRound(combat, sourceActor.id);
  return {
    id: `weapon-mastery:${property}:${sourceActor.id}:${target.id}:${now}`,
    kind: "weaponMastery",
    property,
    label: `Weapon Mastery: ${property.charAt(0).toUpperCase()}${property.slice(1)}`,
    rollId,
    sourceActorId: sourceActor.id,
    targetActorId: target.id,
    startedAt: now,
    expiresAtRound,
    schedule: { timing, anchorActorId: sourceActor.id, expiresAtRound },
    ...DND_5E_SRD_WEAPON_MASTERY_SOURCE
  };
}

function replaceMasteryEffect(data: JsonRecord, effect: JsonRecord, predicate: (candidate: JsonRecord) => boolean): JsonRecord {
  return withActiveEffects(data, [...activeEffects(data).filter((candidate) => !predicate(candidate)), effect]);
}

function consumeAttackEffects(data: JsonRecord, actor: Actor, targetIds: string[], rollId: string): { data: JsonRecord; auditEvents: Dnd5eSrdWeaponMasteryAuditEvent[] } {
  const removed = activeEffects(data).filter((effect) =>
    isMasteryEffect(effect, "sap") || (isMasteryEffect(effect, "vex") && targetIds.includes(text(effect.targetActorId) ?? ""))
  );
  if (removed.length === 0) return { data, auditEvents: [] };
  const removedIds = new Set(removed.map((effect) => text(effect.id)).filter((id): id is string => Boolean(id)));
  return {
    data: withActiveEffects(data, activeEffects(data).filter((effect) => !removedIds.has(text(effect.id) ?? ""))),
    auditEvents: removed.map((effect) => ({
      code: `weapon-mastery.${text(effect.property)}.consumed`,
      actorId: actor.id,
      ...(text(effect.targetActorId) ? { targetActorId: text(effect.targetActorId) } : {}),
      rollId,
      message: `${effectSourceLabel(effect)} was consumed by this attack roll.`,
      data: { effectId: text(effect.id), sourceActorId: text(effect.sourceActorId), targetActorId: text(effect.targetActorId), ...DND_5E_SRD_WEAPON_MASTERY_SOURCE }
    }))
  };
}

function criticalHitNumbers(metadata: JsonRecord): number[] {
  const direct = Array.isArray(metadata.criticalHitOn) ? metadata.criticalHitOn : [];
  return direct.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20);
}

function cleaveDamageFormula(item: Item | undefined, abilityModifier: number): string {
  const data = record(item?.data);
  const base = text(data.damage) ?? "weapon damage";
  const itemBonus = integer(data.damageBonus, 0) + integer(data.magicBonus, 0);
  const retainedAbilityModifier = Math.min(0, abilityModifier);
  const total = itemBonus + retainedAbilityModifier;
  return total === 0 || base === "weapon damage" ? base : `${base}${total > 0 ? "+" : ""}${total}`;
}

function actorSize(actor: Actor): string | undefined {
  return text(actor.data.size)?.toLowerCase() ?? text(record(record(actor.data.monster).statBlock).size)?.toLowerCase();
}

function pushSizeEligible(actor: Actor): boolean | undefined {
  const size = actorSize(actor);
  if (!size) return undefined;
  if (["tiny", "small", "medium", "large"].includes(size)) return true;
  if (["huge", "gargantuan"].includes(size)) return false;
  return undefined;
}

/**
 * Preflight runs before Action consumption. Nick is the only property that
 * changes ordinary Action accounting, so it must prove the current Attack
 * action and its own once-per-turn ledger before the resolver skips T23.
 */
export function dnd5eSrdWeaponMasteryPreflight(input: {
  actor: Actor;
  data: JsonRecord;
  item?: Item;
  roll: { id: string; metadata?: JsonRecord };
  targets: Dnd5eSrdWeaponMasteryTarget[];
  combat?: Pick<Combat, "id" | "round" | "turnIndex" | "combatants">;
  options?: Dnd5eSrdWeaponMasteryUse;
}): Dnd5eSrdWeaponMasteryBlocked | undefined {
  const use = input.options;
  if (!use?.use && !use?.nickExtraAttack) return undefined;
  const metadata = record(input.roll.metadata);
  const property = masteryProperty(metadata);
  if (!property) return { code: "weapon_mastery_unavailable", reason: "This weapon is not one of the actor's selected eligible Weapon Mastery weapons." };
  const supported = masteryRule(property);
  if (!supported) return undefined;
  if (!input.roll.id.endsWith("-attack") || text(metadata.attackType) !== "weapon") return { code: "weapon_mastery_attack_required", reason: `${property} can be used only through the selected weapon's ordinary attack action.` };
  if (property !== "nick" && use.nickExtraAttack) return { code: "weapon_mastery_nick_unavailable", reason: "Nick extra-attack mode requires a selected Nick weapon." };
  if (property === "nick") {
    if (!use.nickExtraAttack) return { code: "weapon_mastery_nick_choice_required", reason: "Declare this roll as Nick's Light extra attack, or roll it as an ordinary Attack action." };
    const properties = stringArray(record(input.item?.data).properties).map((value) => value.toLowerCase());
    if (!properties.includes("light")) return { code: "weapon_mastery_nick_light_required", reason: "Nick requires a weapon with the Light property." };
    if (!input.combat) return { code: "weapon_mastery_nick_combat_required", reason: "Nick's once-per-turn Attack-action integration requires an active combat turn.", supportStatus: "manual" };
    if (currentActorId(input.combat) !== input.actor.id) return { code: "weapon_mastery_nick_out_of_turn", reason: "Nick's extra attack can be made only during this actor's turn." };
    const action = standardActionLedger(input.data, input.actor.id, input.combat);
    const actionUses = Array.isArray(action?.uses) ? action!.uses.map(record) : [];
    if (!action || !actionUses.some((entry) => text(entry.rollId)?.endsWith("-attack"))) return { code: "weapon_mastery_nick_attack_action_required", reason: "Use an ordinary weapon Attack action before making Nick's Light extra attack." };
    if (turnLedger(input.data, input.actor.id, input.combat).uses.some((entry) => entry.property === "nick")) return { code: "weapon_mastery_nick_already_used", reason: "Nick's Light extra attack was already used on this turn." };
  }
  if (property === "cleave" && input.combat && turnLedger(input.data, input.actor.id, input.combat).uses.some((entry) => entry.property === "cleave")) {
    return { code: "weapon_mastery_cleave_already_used", reason: "Cleave was already used on this turn." };
  }
  return undefined;
}

export function dnd5eSrdNickExtraAttackRequested(metadata: JsonRecord, options?: Dnd5eSrdWeaponMasteryUse): boolean {
  return masteryProperty(metadata) === "nick" && options?.use === true && options.nickExtraAttack === true;
}

/** Resolve one ordinary weapon attack and every mastery lifecycle consequence it owns. */
export function resolveDnd5eSrdWeaponMastery(input: {
  actor: Actor;
  data: JsonRecord;
  item?: Item;
  roll: { id: string; label: string; metadata?: JsonRecord };
  targets: Dnd5eSrdWeaponMasteryTarget[];
  combat?: Pick<Combat, "id" | "round" | "turnIndex" | "combatants">;
  now: string;
  abilityModifier: number;
  proficiencyBonus: number;
  options?: Dnd5eSrdWeaponMasteryUse;
  applyGrazeDamage?: (target: Dnd5eSrdWeaponMasteryTarget, amount: number, damageType: string) => Dnd5eSrdWeaponMasteryDamageApplication | undefined;
}): Dnd5eSrdWeaponMasteryLifecycleResult {
  const result: Dnd5eSrdWeaponMasteryLifecycleResult = { data: input.data, targetData: [], effects: [], conditions: [], pendingSaves: [], auditEvents: [], concentrationCleanups: [], warnings: [] };
  const setTargetData = (actorId: string, data: JsonRecord) => { if (actorId === input.actor.id) result.data = data; else result.targetData.push({ actorId, data }); };
  const metadata = record(input.roll.metadata);
  const isWeaponAttack = input.roll.id.endsWith("-attack") && text(metadata.attackType) === "weapon";
  if (!isWeaponAttack) return result;

  const primary = input.targets[0];
  const targetIds = input.targets.map((target) => target.actor.id);
  const consumed = consumeAttackEffects(result.data, input.actor, targetIds, input.roll.id);
  result.data = consumed.data;
  result.auditEvents.push(...consumed.auditEvents);

  if (!input.options?.use) return result;
  const property = masteryProperty(metadata);
  if (!property) {
    result.blocked = { code: "weapon_mastery_unavailable", reason: "This weapon is not one of the actor's selected eligible Weapon Mastery weapons." };
    return result;
  }
  const supported = masteryRule(property);
  if (!supported) {
    result.resolution = masteryResolution(property, "manual", "manual-step", "unsupported", `${property} is not an authoritative SRD 5.2.1 mastery implementation. The declaration is recorded, and the engine mutated no target or geometry.`);
    result.warnings.push(result.resolution.message);
    result.auditEvents.push({ code: "weapon-mastery.manual.declared", actorId: input.actor.id, rollId: input.roll.id, message: result.resolution.message, data: { property, supportStatus: "unsupported" } });
    return result;
  }
  if (!primary) {
    result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, `${property} requires an explicit primary target.`);
    return result;
  }
  if ((property === "vex" || property === "slow") && input.options.damageDealt === undefined) {
    result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, `${property.charAt(0).toUpperCase()}${property.slice(1)} requires an explicit declaration of whether an eventual hit deals weapon damage.`, { targetActorId: primary.actor.id });
    return result;
  }
  if (property === "cleave") {
    const secondaryId = text(input.options.secondaryTargetActorId);
    const secondary = secondaryId ? input.targets.find((target) => target.actor.id === secondaryId) : undefined;
    if (!secondary || secondary.actor.id === primary.actor.id) {
      result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, "Cleave requires an explicit second creature different from the first target; no target was inferred.", { targetActorId: primary.actor.id });
      return result;
    }
    if (input.options.geometryConfirmed !== true) {
      result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, "Confirm that the Cleave target is within 5 feet of the first target and within the weapon's reach; the engine does not infer geometry.", { targetActorId: primary.actor.id, secondaryTargetActorId: secondary.actor.id, geometry: { inferred: false, confirmedByUser: false, instruction: "Verify within 5 feet of the first target and within weapon reach." } });
      return result;
    }
  }

  const outcome = attackOutcome(primary, criticalHitNumbers(metadata));
  const baseDetails = { targetActorId: primary.actor.id, ...(outcome ? { attackOutcome: outcome } : {}) };
  if (!outcome && property !== "nick") {
    if (property === "topple" && !primary.saveOutcome) {
      const dc = 8 + input.abilityModifier + input.proficiencyBonus;
      result.pendingSaves.push({ actorId: primary.actor.id, ability: "constitution", dc, reason: `${input.roll.label} may trigger Topple on a hit`, success: "avoids Prone", requiredForCommit: true });
      result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, `Record ${primary.actor.name}'s Constitution save before rolling; it is used only if the attack hits.`, { ...baseDetails, save: { ability: "constitution", dc } });
    } else {
      const save = property === "topple" ? { ability: "constitution" as const, dc: 8 + input.abilityModifier + input.proficiencyBonus, outcome: primary.saveOutcome } : undefined;
      result.resolution = masteryResolution(property, supported.capability, "awaiting-roll", supported.trigger, `${supported.summary} Awaiting the reviewed attack roll.`, { ...baseDetails, ...(save ? { save } : {}) });
    }
    return result;
  }

  const hit = outcome === "hit" || outcome === "critical-hit";
  const notTriggered = (message: string): Dnd5eSrdWeaponMasteryLifecycleResult => {
    result.resolution = masteryResolution(property, supported.capability, "not-triggered", supported.trigger, message, baseDetails);
    return result;
  };
  const applied = (message: string, details: Partial<Dnd5eSrdWeaponMasteryResolution> = {}): void => {
    result.resolution = masteryResolution(property, supported.capability, "applied", supported.trigger, message, { ...baseDetails, ...details });
    result.auditEvents.push({ code: `weapon-mastery.${property}.applied`, actorId: input.actor.id, targetActorId: primary.actor.id, rollId: input.roll.id, message, data: { property, outcome, ...DND_5E_SRD_WEAPON_MASTERY_SOURCE } });
  };

  if (property === "graze") {
    if (hit) return notTriggered(`Graze does not trigger because the attack ${outcome === "critical-hit" ? "critically hit" : "hit"}.`);
    const amount = Math.max(0, input.abilityModifier);
    if (amount === 0) return notTriggered("Graze triggered on the miss, but the attack ability modifier deals 0 damage.");
    const damageType = text(record(input.item?.data).damageType)?.toLowerCase() ?? "untyped";
    const damage = input.applyGrazeDamage?.(primary, amount, damageType);
    if (!damage) return notTriggered("Graze triggered, but the target has no authoritative Hit Point pool for automatic damage.");
    setTargetData(primary.actor.id, damage.data);
    result.effects.push(damage.effect);
    if (damage.pendingSave) result.pendingSaves.push(damage.pendingSave);
    if (damage.condition) result.conditions.push(damage.condition);
    if (damage.auditEvent) result.auditEvents.push(damage.auditEvent);
    if (damage.cleanup) result.concentrationCleanups.push(damage.cleanup);
    applied(`Graze dealt ${damage.effect.amount ?? amount} ${damageType} damage to ${primary.actor.name} after the miss.`);
    return result;
  }

  if (property === "nick") {
    if (!input.combat) return notTriggered("Nick requires an active combat turn for exact once-per-turn accounting.");
    const action = standardActionLedger(result.data, input.actor.id, input.combat)!;
    result.actionLedger = {
      round: input.combat.round,
      turnIndex: input.combat.turnIndex,
      actorId: input.actor.id,
      actionsUsed: integer(action.actionsUsed),
      actionSurgeGrants: integer(action.actionSurgeGrants),
      uses: Array.isArray(action.uses) ? action.uses.flatMap((raw) => { const value = record(raw); const rollId = text(value.rollId); const usedAt = text(value.usedAt); return rollId && usedAt ? [{ rollId, usedAt }] : []; }) : [],
      ...(text(action.actionSurgeUsedAt) ? { actionSurgeUsedAt: text(action.actionSurgeUsedAt) } : {})
    };
    result.data = withTurnUse(result.data, input.actor.id, input.combat, "nick", input.roll.id, input.now);
    applied("Nick folded this Light extra attack into the current Attack action without consuming another Action or Bonus Action.");
    return result;
  }

  if (!hit) return notTriggered(`${property.charAt(0).toUpperCase()}${property.slice(1)} does not trigger because the attack missed.`);

  if ((property === "vex" || property === "slow") && input.options.damageDealt !== true) return notTriggered(`${property.charAt(0).toUpperCase()}${property.slice(1)} does not trigger because the hit was declared to deal no weapon damage.`);

  if (property === "vex") {
    if (!input.combat) {
      result.resolution = masteryResolution(property, "manual", "manual-step", supported.trigger, "Vex was declared, but no active combat turn exists to expire or consume it authoritatively; resolve the advantage manually.", baseDetails);
      result.warnings.push(result.resolution.message);
      return result;
    }
    const effect = sourcedEffect("vex", input.actor, primary.actor, input.roll.id, input.now, input.combat, "end_turn");
    result.data = replaceMasteryEffect(result.data, effect, (candidate) => isMasteryEffect(candidate, "vex") && text(candidate.targetActorId) === primary.actor.id);
    result.effects.push({ type: "utility", targetActorId: primary.actor.id, targetActorName: primary.actor.name, duration: "before the end of the source actor's next turn" });
    applied(`Vex grants Advantage on ${input.actor.name}'s next attack against ${primary.actor.name} before the end of ${input.actor.name}'s next turn.`);
    return result;
  }

  if (property === "sap" || property === "slow") {
    if (!input.combat) {
      result.resolution = masteryResolution(property, "manual", "manual-step", supported.trigger, `${property.charAt(0).toUpperCase()}${property.slice(1)} was declared, but no active combat turn exists to expire it authoritatively; resolve it manually.`, baseDetails);
      result.warnings.push(result.resolution.message);
      return result;
    }
    const effect = sourcedEffect(property, input.actor, primary.actor, input.roll.id, input.now, input.combat, "start_turn");
    const targetData = replaceMasteryEffect(primary.actor.data, effect, (candidate) => isMasteryEffect(candidate, property) && (property === "slow" || text(candidate.sourceActorId) === input.actor.id));
    setTargetData(primary.actor.id, targetData);
    result.effects.push({ type: "utility", targetActorId: primary.actor.id, targetActorName: primary.actor.name, duration: "until the start of the source actor's next turn" });
    applied(property === "sap"
      ? `Sap gives ${primary.actor.name} Disadvantage on its next attack roll before the start of ${input.actor.name}'s next turn.`
      : `Slow reduces ${primary.actor.name}'s Speed by 10 feet until the start of ${input.actor.name}'s next turn; the reduction is capped at 10 feet.`);
    return result;
  }

  if (property === "topple") {
    const dc = 8 + input.abilityModifier + input.proficiencyBonus;
    const saveOutcome = primary.saveOutcome;
    if (!saveOutcome) {
      result.pendingSaves.push({ actorId: primary.actor.id, ability: "constitution", dc, reason: `${input.roll.label} triggered Topple`, success: "avoids Prone", requiredForCommit: true });
      result.resolution = masteryResolution(property, supported.capability, "choice-required", supported.trigger, `${primary.actor.name} must resolve a DC ${dc} Constitution save before Topple can commit.`, { ...baseDetails, save: { ability: "constitution", dc } });
      return result;
    }
    if (saveOutcome === "success") {
      result.resolution = masteryResolution(property, supported.capability, "not-triggered", supported.trigger, `${primary.actor.name} succeeded on the DC ${dc} Constitution save and avoided Prone.`, { ...baseDetails, save: { ability: "constitution", dc, outcome: saveOutcome } });
      return result;
    }
    if (primary.proneImmune) return notTriggered(`${primary.actor.name} failed the DC ${dc} Constitution save but is immune to Prone.`);
    const before = normalizeConditions(primary.actor.data.conditions);
    const alreadyPresent = before.some((condition) => text(condition.id) === "prone");
    const after = alreadyPresent ? before : [...before, { id: "prone", appliedAt: input.now }];
    setTargetData(primary.actor.id, { ...primary.actor.data, conditions: after });
    result.conditions.push({ actorId: primary.actor.id, operation: "apply", conditionId: "prone", conditionName: "Prone", reason: `Topple: failed DC ${dc} Constitution save` });
    result.effects.push({ type: "condition", targetActorId: primary.actor.id, targetActorName: primary.actor.name, conditionId: "prone", conditionName: "Prone", before: before.map((condition) => text(condition.id) ?? "").filter(Boolean), after: after.map((condition) => text(condition.id) ?? "").filter(Boolean), alreadyPresent });
    applied(`Topple applied Prone to ${primary.actor.name} after a failed DC ${dc} Constitution save.`, { save: { ability: "constitution", dc, outcome: saveOutcome } });
    return result;
  }

  if (property === "push") {
    const eligible = pushSizeEligible(primary.actor);
    if (eligible === false) return notTriggered(`Push cannot affect ${primary.actor.name} because it is larger than Large.`);
    const distanceFeet = input.options.pushDistanceFeet;
    const sizeStep = eligible === undefined ? " Verify that the target is Large or smaller." : "";
    const instruction = `Move ${primary.actor.name} ${distanceFeet === undefined ? "up to 10" : distanceFeet} feet straight away from ${input.actor.name}.${sizeStep}`;
    result.resolution = masteryResolution(property, "manual", "manual-step", supported.trigger, `${instruction} No token coordinates were inferred or mutated.`, {
      ...baseDetails,
      geometry: { inferred: false, confirmedByUser: input.options.geometryConfirmed === true, instruction, ...(distanceFeet !== undefined ? { distanceFeet } : {}) }
    });
    result.auditEvents.push({ code: "weapon-mastery.push.declared", actorId: input.actor.id, targetActorId: primary.actor.id, rollId: input.roll.id, message: result.resolution.message, data: { property, sizeEligibility: eligible ?? "unknown", distanceFeet: distanceFeet ?? "up-to-10", geometryInferred: false, ...DND_5E_SRD_WEAPON_MASTERY_SOURCE } });
    return result;
  }

  if (property === "cleave") {
    if (!input.combat) {
      result.resolution = masteryResolution(property, "manual", "manual-step", supported.trigger, "Cleave was declared, but exact once-per-turn accounting requires an active combat turn. No secondary attack or geometry was inferred.", baseDetails);
      result.warnings.push(result.resolution.message);
      return result;
    }
    const secondaryId = text(input.options.secondaryTargetActorId);
    const secondary = secondaryId ? input.targets.find((target) => target.actor.id === secondaryId) : undefined;
    if (!secondary || secondary.actor.id === primary.actor.id) return result;
    const secondaryOutcome = attackOutcome(secondary, criticalHitNumbers(metadata));
    result.data = withTurnUse(result.data, input.actor.id, input.combat, "cleave", input.roll.id, input.now);
    const damageFormula = cleaveDamageFormula(input.item, input.abilityModifier);
    applied(`Cleave made its reviewed once-per-turn secondary attack against ${secondary.actor.name}; apply ${damageFormula} on a hit without a positive attack ability modifier.`, {
      secondaryTargetActorId: secondary.actor.id,
      secondaryAttack: { targetActorId: secondary.actor.id, ...(secondaryOutcome ? { attackOutcome: secondaryOutcome } : {}), damageFormula, geometryConfirmed: true },
      geometry: { inferred: false, confirmedByUser: true, instruction: "User confirmed within 5 feet of the first target and within weapon reach." }
    });
    return result;
  }

  return result;
}

function normalizeConditions(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw === "string" && raw.trim()) return [{ id: slug(raw) }];
    const entry = clone(record(raw));
    const id = text(entry.id);
    return id ? [{ ...entry, id: slug(id) }] : [];
  });
}
