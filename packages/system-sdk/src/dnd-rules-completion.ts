import type { Actor } from "@open-tabletop/core";

export type Dnd5eSrdFeatGrant = "general" | "epic-boon";

export interface Dnd5eSrdSubclassOption {
  id: string;
  className: string;
  name: string;
  selectionLevel: number;
  summary?: string;
  alwaysPreparedSpells?: readonly string[];
  features: ReadonlyArray<{ level: number; names: readonly string[] }>;
}

const DEFAULT_FEAT_LEVELS = new Set([4, 8, 12, 16]);
const FIGHTER_FEAT_LEVELS = new Set([4, 6, 8, 12, 14, 16]);
const ROGUE_FEAT_LEVELS = new Set([4, 8, 10, 12, 16]);

/** The 2024/SRD 5.2.1 class-level feat schedule. */
export function dnd5eSrdFeatGrantAtClassLevel(className: string, classLevel: number): Dnd5eSrdFeatGrant | undefined {
  const level = Math.max(1, Math.min(20, Math.floor(classLevel)));
  if (level === 19) return "epic-boon";
  const normalized = className.trim().toLowerCase();
  const levels = normalized === "fighter" ? FIGHTER_FEAT_LEVELS : normalized === "rogue" ? ROGUE_FEAT_LEVELS : DEFAULT_FEAT_LEVELS;
  return levels.has(level) ? "general" : undefined;
}

export const DND_5E_SRD_SUBCLASS_OPTIONS: readonly Dnd5eSrdSubclassOption[] = [
  { id: "path-of-the-berserker", className: "Barbarian", name: "Path of the Berserker", selectionLevel: 3, features: [
    { level: 3, names: ["Frenzy"] }, { level: 6, names: ["Mindless Rage"] }, { level: 10, names: ["Retaliation"] }, { level: 14, names: ["Intimidating Presence"] }
  ] },
  { id: "college-of-lore", className: "Bard", name: "College of Lore", selectionLevel: 3, features: [
    { level: 3, names: ["Bonus Proficiencies", "Cutting Words"] }, { level: 6, names: ["Magical Discoveries"] }, { level: 14, names: ["Peerless Skill"] }
  ] },
  { id: "life-domain", className: "Cleric", name: "Life Domain", selectionLevel: 3, features: [
    { level: 3, names: ["Disciple of Life", "Life Domain Spells", "Preserve Life"] }, { level: 6, names: ["Blessed Healer"] }, { level: 17, names: ["Supreme Healing"] }
  ] },
  { id: "circle-of-the-land", className: "Druid", name: "Circle of the Land", selectionLevel: 3, features: [
    { level: 3, names: ["Circle of the Land Spells", "Land's Aid"] }, { level: 6, names: ["Natural Recovery"] }, { level: 10, names: ["Nature's Ward"] }, { level: 14, names: ["Nature's Sanctuary"] }
  ] },
  { id: "champion", className: "Fighter", name: "Champion", selectionLevel: 3, features: [
    { level: 3, names: ["Improved Critical", "Remarkable Athlete"] }, { level: 7, names: ["Additional Fighting Style"] }, { level: 10, names: ["Heroic Warrior"] }, { level: 15, names: ["Superior Critical"] }, { level: 18, names: ["Survivor"] }
  ] },
  { id: "warrior-of-the-open-hand", className: "Monk", name: "Warrior of the Open Hand", selectionLevel: 3, features: [
    { level: 3, names: ["Open Hand Technique"] }, { level: 6, names: ["Wholeness of Body"] }, { level: 11, names: ["Fleet Step"] }, { level: 17, names: ["Quivering Palm"] }
  ] },
  { id: "oath-of-devotion", className: "Paladin", name: "Oath of Devotion", selectionLevel: 3, features: [
    { level: 3, names: ["Oath of Devotion Spells", "Sacred Weapon"] }, { level: 7, names: ["Aura of Devotion"] }, { level: 15, names: ["Smite of Protection"] }, { level: 20, names: ["Holy Nimbus"] }
  ] },
  { id: "hunter", className: "Ranger", name: "Hunter", selectionLevel: 3, features: [
    { level: 3, names: ["Hunter's Lore", "Hunter's Prey"] }, { level: 7, names: ["Defensive Tactics"] }, { level: 11, names: ["Superior Hunter's Prey"] }, { level: 15, names: ["Superior Hunter's Defense"] }
  ] },
  { id: "thief", className: "Rogue", name: "Thief", selectionLevel: 3, features: [
    { level: 3, names: ["Fast Hands", "Second-Story Work"] }, { level: 9, names: ["Supreme Sneak"] }, { level: 13, names: ["Use Magic Device"] }, { level: 17, names: ["Thief's Reflexes"] }
  ] },
  { id: "draconic-sorcery", className: "Sorcerer", name: "Draconic Sorcery", selectionLevel: 3, features: [
    { level: 3, names: ["Draconic Resilience", "Draconic Spells"] }, { level: 6, names: ["Elemental Affinity"] }, { level: 14, names: ["Dragon Wings"] }, { level: 18, names: ["Dragon Companion"] }
  ] },
  { id: "fiend-patron", className: "Warlock", name: "Fiend Patron", selectionLevel: 3, features: [
    { level: 3, names: ["Dark One's Blessing", "Fiend Spells"] }, { level: 6, names: ["Dark One's Own Luck"] }, { level: 10, names: ["Fiendish Resilience"] }, { level: 14, names: ["Hurl Through Hell"] }
  ] },
  { id: "evoker", className: "Wizard", name: "Evoker", selectionLevel: 3, features: [
    { level: 3, names: ["Evocation Savant", "Potent Cantrip"] }, { level: 6, names: ["Sculpt Spells"] }, { level: 10, names: ["Empowered Evocation"] }, { level: 14, names: ["Overchannel"] }
  ] }
];

export function dnd5eSrdSubclassOption(className: string, selection: string): Dnd5eSrdSubclassOption | undefined {
  const normalizedClass = className.trim().toLowerCase();
  const normalizedSelection = selection.trim().toLowerCase();
  return DND_5E_SRD_SUBCLASS_OPTIONS.find((option) =>
    option.className.toLowerCase() === normalizedClass &&
    (option.id === normalizedSelection || option.name.toLowerCase() === normalizedSelection)
  );
}

export function dnd5eSrdSubclassFeatures(option: Dnd5eSrdSubclassOption, classLevel: number): string[] {
  return [option.name, ...option.features.filter((entry) => entry.level <= classLevel).flatMap((entry) => entry.names)];
}

export interface Dnd5eSrdDamageComponent {
  amount: number;
  damageType: string;
}

export interface Dnd5eSrdDamageDefenses {
  resistance?: readonly string[];
  immunity?: readonly string[];
  vulnerability?: readonly string[];
}

export interface Dnd5eSrdResolvedDamageComponent extends Dnd5eSrdDamageComponent {
  adjustedAmount: number;
  defense: "normal" | "resistance" | "immunity" | "vulnerability" | "resistance-and-vulnerability";
}

export interface Dnd5eSrdDamageLifecycle {
  state: "conscious" | "unconscious" | "stable" | "dead" | "defeated";
  conditionIds: string[];
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  massiveDamage: boolean;
}

export interface Dnd5eSrdDamageResolution {
  components: Dnd5eSrdResolvedDamageComponent[];
  totalDamage: number;
  temporaryHitPointsBefore: number;
  temporaryHitPointsAfter: number;
  absorbedByTemporaryHitPoints: number;
  hitPointsBefore: number;
  hitPointsAfter: number;
  lifecycle: Dnd5eSrdDamageLifecycle;
}

function normalizedSet(values: readonly string[] | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function boundedDeathSaves(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.floor(value))) : 0;
}

/**
 * SRD 5.2.1 default: a monster dies when it drops to 0 HP. A GM can mark an
 * individual creature to be knocked unconscious instead by setting
 * `actor.data.zeroHpBehavior` to "knockout" (or "unconscious") before damage
 * is applied. The choice is per-instance and auditable through the normal
 * actor mutation path; there is no hidden global preference.
 */
export function dnd5eSrdMonsterZeroHpKnockout(data: Record<string, unknown> | undefined): boolean {
  const value = data?.zeroHpBehavior;
  return typeof value === "string" && ["knockout", "unconscious", "nonlethal", "non-lethal"].includes(value.trim().toLowerCase());
}

/** Resolves every typed component independently before applying the combined result to temporary HP and HP. */
export function resolveDnd5eSrdDamageComponents(input: {
  actor: Pick<Actor, "type"> & { data?: Record<string, unknown> };
  hitPoints: { current: number; max: number };
  temporaryHitPoints?: number;
  components: readonly Dnd5eSrdDamageComponent[];
  defenses?: Dnd5eSrdDamageDefenses;
  deathSaves?: { successes?: number; failures?: number };
  criticalHit?: boolean;
}): Dnd5eSrdDamageResolution {
  const resistance = normalizedSet(input.defenses?.resistance);
  const immunity = normalizedSet(input.defenses?.immunity);
  const vulnerability = normalizedSet(input.defenses?.vulnerability);
  const components = input.components.map((component) => {
    if (!Number.isInteger(component.amount) || component.amount < 0) throw new Error("Damage components must use non-negative whole-number amounts");
    const damageType = component.damageType.trim().toLowerCase();
    if (!damageType) throw new Error("Every damage component requires a damage type");
    if (immunity.has(damageType)) return { ...component, damageType, adjustedAmount: 0, defense: "immunity" as const };
    // SRD 5.2.1 damage order: Resistance halves first, then Vulnerability doubles the halved result.
    const resistant = resistance.has(damageType);
    const vulnerable = vulnerability.has(damageType);
    let adjustedAmount = component.amount;
    if (resistant) adjustedAmount = Math.floor(adjustedAmount / 2);
    if (vulnerable) adjustedAmount = adjustedAmount * 2;
    const defense = resistant && vulnerable
      ? ("resistance-and-vulnerability" as const)
      : resistant
        ? ("resistance" as const)
        : vulnerable
          ? ("vulnerability" as const)
          : ("normal" as const);
    return { ...component, damageType, adjustedAmount, defense };
  });
  const totalDamage = components.reduce((sum, component) => sum + component.adjustedAmount, 0);
  const temporaryHitPointsBefore = Math.max(0, Math.floor(input.temporaryHitPoints ?? 0));
  const absorbedByTemporaryHitPoints = Math.min(temporaryHitPointsBefore, totalDamage);
  const temporaryHitPointsAfter = temporaryHitPointsBefore - absorbedByTemporaryHitPoints;
  const hpDamage = totalDamage - absorbedByTemporaryHitPoints;
  const hitPointsBefore = Math.max(0, Math.min(input.hitPoints.max, Math.floor(input.hitPoints.current)));
  const hitPointsAfter = Math.max(0, hitPointsBefore - hpDamage);
  const priorSuccesses = boundedDeathSaves(input.deathSaves?.successes);
  const priorFailures = boundedDeathSaves(input.deathSaves?.failures);
  const character = input.actor.type.toLowerCase() === "character";
  const massiveDamage = character && hitPointsAfter === 0 && hpDamage - hitPointsBefore >= input.hitPoints.max;
  let lifecycle: Dnd5eSrdDamageLifecycle;
  if (hitPointsAfter > 0) {
    lifecycle = { state: "conscious", conditionIds: [], deathSaveSuccesses: 0, deathSaveFailures: 0, massiveDamage: false };
  } else if (!character) {
    // Monsters die at 0 HP by default; the explicit per-instance knockout flag opts into unconsciousness.
    lifecycle = dnd5eSrdMonsterZeroHpKnockout(input.actor.data)
      ? { state: "defeated", conditionIds: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0, massiveDamage: false }
      : { state: "defeated", conditionIds: ["dead"], deathSaveSuccesses: 0, deathSaveFailures: 0, massiveDamage: false };
  } else if (massiveDamage) {
    lifecycle = { state: "dead", conditionIds: ["dead"], deathSaveSuccesses: 0, deathSaveFailures: 3, massiveDamage: true };
  } else if (hitPointsBefore === 0 && hpDamage > 0) {
    const failures = Math.min(3, priorFailures + (input.criticalHit ? 2 : 1));
    lifecycle = failures >= 3
      ? { state: "dead", conditionIds: ["dead"], deathSaveSuccesses: priorSuccesses, deathSaveFailures: 3, massiveDamage: false }
      : { state: "unconscious", conditionIds: ["unconscious"], deathSaveSuccesses: priorSuccesses, deathSaveFailures: failures, massiveDamage: false };
  } else {
    lifecycle = { state: "unconscious", conditionIds: ["unconscious"], deathSaveSuccesses: 0, deathSaveFailures: 0, massiveDamage: false };
  }
  return { components, totalDamage, temporaryHitPointsBefore, temporaryHitPointsAfter, absorbedByTemporaryHitPoints, hitPointsBefore, hitPointsAfter, lifecycle };
}

export function stabilizeDnd5eSrdActor(actor: Actor): Record<string, unknown> {
  const hp = actor.data.hp && typeof actor.data.hp === "object" && !Array.isArray(actor.data.hp) ? actor.data.hp as Record<string, unknown> : {};
  const current = typeof hp.current === "number" ? hp.current : 0;
  if (current > 0) throw new Error("Only a creature at 0 Hit Points can be stabilized");
  const conditions = (Array.isArray(actor.data.conditions) ? actor.data.conditions : [])
    .filter((condition) => (typeof condition === "string" ? condition : (condition as { id?: unknown }).id) !== "dead");
  if (!conditions.some((condition) => (typeof condition === "string" ? condition : (condition as { id?: unknown }).id) === "unconscious")) conditions.push({ id: "unconscious" });
  return { ...actor.data, conditions, deathSaves: { successes: 0, failures: 0 }, lifeState: "stable" };
}

export function healDnd5eSrdActorFromZero(actor: Actor, amount: number): Record<string, unknown> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Healing must be a positive whole number");
  const hp = actor.data.hp && typeof actor.data.hp === "object" && !Array.isArray(actor.data.hp) ? actor.data.hp as Record<string, unknown> : {};
  const current = typeof hp.current === "number" ? hp.current : 0;
  const max = typeof hp.max === "number" ? hp.max : 0;
  const next = Math.min(max, current + amount);
  const conditions = (Array.isArray(actor.data.conditions) ? actor.data.conditions : []).filter((condition) => {
    const id = typeof condition === "string" ? condition : (condition as { id?: unknown }).id;
    return id !== "unconscious" && id !== "stable";
  });
  return { ...actor.data, hp: { ...hp, current: next }, conditions, deathSaves: { successes: 0, failures: 0 }, lifeState: next > 0 ? "conscious" : actor.data.lifeState };
}

export interface Dnd5eSrdOpportunityAttackInput {
  moverActorId: string;
  observerActorId: string;
  distanceBeforeFt: number;
  distanceAfterFt: number;
  observerReachFt?: number;
  observerCanSeeMover: boolean;
  observerHasReaction: boolean;
  moverDisengaged?: boolean;
  teleport?: boolean;
  forcedMovement?: boolean;
}

export function dnd5eSrdOpportunityAttackAvailable(input: Dnd5eSrdOpportunityAttackInput): { available: boolean; reason: string } {
  const reach = Math.max(0, input.observerReachFt ?? 5);
  if (!input.observerHasReaction) return { available: false, reason: "The observer has already used its Reaction." };
  if (!input.observerCanSeeMover) return { available: false, reason: "The observer cannot see the moving creature." };
  if (input.moverDisengaged) return { available: false, reason: "Disengage prevents Opportunity Attacks for this movement." };
  if (input.teleport || input.forcedMovement) return { available: false, reason: "Teleportation and movement without the creature's action, Bonus Action, or Reaction do not provoke." };
  if (input.distanceBeforeFt > reach || input.distanceAfterFt <= reach) return { available: false, reason: "The creature did not leave the observer's reach." };
  return { available: true, reason: "The visible creature left the observer's reach and may trigger an Opportunity Attack." };
}

export interface Dnd5eSrdMovementSegment {
  distanceFt: number;
  difficultTerrain?: boolean;
  crawl?: boolean;
  climb?: boolean;
  swim?: boolean;
  hasMatchingSpeed?: boolean;
}

export function dnd5eSrdMovementCost(segments: readonly Dnd5eSrdMovementSegment[]): { distanceFt: number; movementCostFt: number } {
  let distanceFt = 0;
  let movementCostFt = 0;
  for (const segment of segments) {
    if (!Number.isFinite(segment.distanceFt) || segment.distanceFt < 0) throw new Error("Movement distance must be non-negative");
    distanceFt += segment.distanceFt;
    const difficultMultiplier = segment.difficultTerrain ? 2 : 1;
    const modeMultiplier = (segment.crawl || ((segment.climb || segment.swim) && !segment.hasMatchingSpeed)) ? 2 : 1;
    // Multiple extra-cost rules are not cumulative; each foot costs at most one extra foot.
    movementCostFt += segment.distanceFt * Math.max(difficultMultiplier, modeMultiplier);
  }
  return { distanceFt, movementCostFt };
}

export function dnd5eSrdInitiativeMode(input: { surprised: boolean; advantage?: boolean; disadvantage?: boolean }): "normal" | "advantage" | "disadvantage" {
  const advantage = input.advantage === true;
  const disadvantage = input.disadvantage === true || input.surprised;
  if (advantage === disadvantage) return "normal";
  return advantage ? "advantage" : "disadvantage";
}

export interface Dnd5eSrdHeroicInspirationGrant {
  actorData: Record<string, unknown>;
  recipientData?: Record<string, unknown>;
  awardedTo: "actor" | "recipient" | "none";
}

/**
 * Awards the one-point Heroic Inspiration state. If the gaining actor already
 * has it, an explicitly supplied recipient can receive the overflow award.
 */
export function grantDnd5eSrdHeroicInspiration(actor: Actor, recipient?: Actor): Dnd5eSrdHeroicInspirationGrant {
  if (actor.data.heroicInspiration !== true) {
    return { actorData: { ...actor.data, heroicInspiration: true }, awardedTo: "actor" };
  }
  if (recipient && recipient.data.heroicInspiration !== true) {
    return {
      actorData: { ...actor.data },
      recipientData: { ...recipient.data, heroicInspiration: true },
      awardedTo: "recipient"
    };
  }
  return { actorData: { ...actor.data }, ...(recipient ? { recipientData: { ...recipient.data } } : {}), awardedTo: "none" };
}

/** Spends Heroic Inspiration for its reroll; callers remain responsible for rerolling the die. */
export function spendDnd5eSrdHeroicInspiration(actor: Actor): Record<string, unknown> {
  if (actor.data.heroicInspiration !== true) throw new Error(`${actor.name} has no Heroic Inspiration to spend`);
  return { ...actor.data, heroicInspiration: false };
}

/** Doubles every damage die in a complete critical-hit damage formula, but never doubles flat modifiers. */
export function dnd5eSrdCriticalDamageFormula(formula: string): string {
  const normalized = formula.trim();
  if (!normalized) throw new Error("Critical damage requires a damage formula");
  let diceFound = false;
  let totalDice = 0;
  const doubled = normalized.replace(/(^|[^A-Za-z0-9_])(\d*)d(\d+)(?=(?:kh|kl|dh|dl)\d*|r\d+|!|$|[^A-Za-z0-9_])/gi, (_match, prefix: string, rawCount: string, faces: string) => {
    diceFound = true;
    const count = rawCount ? Number(rawCount) : 1;
    const sides = Number(faces);
    const criticalCount = count * 2;
    if (!Number.isInteger(count) || count < 1 || criticalCount > 1_000) throw new Error("Critical damage dice count must be between 1 and 1000 per term");
    if (!Number.isInteger(sides) || sides < 2) throw new Error("Critical damage die sides must be at least 2");
    totalDice += criticalCount;
    if (totalDice > 10_000) throw new Error("Critical damage formula cannot exceed 10000 dice");
    return `${prefix}${criticalCount}d${faces}`;
  });
  if (!diceFound) return normalized;
  if (doubled.length > 4_096) throw new Error("Critical damage formula cannot exceed 4096 characters");
  return doubled;
}

export type Dnd5eSrdLightLevel = "bright" | "dim" | "darkness";

export interface Dnd5eSrdVisionResult {
  canSee: boolean;
  senseUsed: "normal" | "darkvision" | "blindsight" | "truesight" | "none";
  visibility: "clear" | "lightly-obscured" | "heavily-obscured";
  sightPerception: "normal" | "disadvantage" | "impossible";
  colorVision: boolean;
  reason: string;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizedIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function actorSenseRange(actor: Actor, sense: "darkvision" | "blindsight" | "truesight"): number {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  const sources = [actor.data.senses, statBlock.senses];
  let range = 0;
  for (const source of sources) {
    const sourceRecord = recordValue(source);
    const recordSense = sourceRecord[sense];
    if (typeof recordSense === "number" && Number.isFinite(recordSense)) range = Math.max(range, recordSense);
    const nestedRange = recordValue(recordSense).range;
    if (typeof nestedRange === "number" && Number.isFinite(nestedRange)) range = Math.max(range, nestedRange);
    const strings = Array.isArray(source) ? source.filter((entry): entry is string => typeof entry === "string") : typeof source === "string" ? [source] : [];
    for (const entry of strings) {
      const match = new RegExp(`${sense}[^0-9]*(\\d+)`, "i").exec(entry);
      if (match) range = Math.max(range, Number(match[1]));
    }
  }
  return range;
}

/** Applies ordinary light, Darkvision, Blindsight, Truesight, and magical-darkness consequences. */
export function dnd5eSrdEvaluateVision(actor: Actor, input: { light: Dnd5eSrdLightLevel; distanceFt: number; magicalDarkness?: boolean }): Dnd5eSrdVisionResult {
  if (!Number.isFinite(input.distanceFt) || input.distanceFt < 0) throw new Error("Vision distance must be non-negative");
  if (input.light === "bright") return { canSee: true, senseUsed: "normal", visibility: "clear", sightPerception: "normal", colorVision: true, reason: "Bright Light provides normal vision." };
  const truesight = actorSenseRange(actor, "truesight");
  if (truesight >= input.distanceFt && truesight > 0) return { canSee: true, senseUsed: "truesight", visibility: "clear", sightPerception: "normal", colorVision: true, reason: "Truesight perceives through darkness within range." };
  const blindsight = actorSenseRange(actor, "blindsight");
  if (blindsight >= input.distanceFt && blindsight > 0) return { canSee: true, senseUsed: "blindsight", visibility: "clear", sightPerception: "normal", colorVision: false, reason: "Blindsight perceives the area without relying on sight." };
  const darkvision = actorSenseRange(actor, "darkvision");
  if (input.light === "dim") {
    if (darkvision >= input.distanceFt && darkvision > 0) return { canSee: true, senseUsed: "darkvision", visibility: "clear", sightPerception: "normal", colorVision: true, reason: "Darkvision treats Dim Light as Bright Light within range." };
    return { canSee: true, senseUsed: "normal", visibility: "lightly-obscured", sightPerception: "disadvantage", colorVision: true, reason: "Dim Light is Lightly Obscured for sight-based Wisdom (Perception) checks." };
  }
  if (!input.magicalDarkness && darkvision >= input.distanceFt && darkvision > 0) {
    return { canSee: true, senseUsed: "darkvision", visibility: "lightly-obscured", sightPerception: "disadvantage", colorVision: false, reason: "Darkvision treats nonmagical Darkness as Dim Light and shows only shades of gray." };
  }
  return { canSee: false, senseUsed: "none", visibility: "heavily-obscured", sightPerception: "impossible", colorVision: false, reason: input.magicalDarkness ? "Darkvision does not penetrate magical Darkness." : "Darkness is Heavily Obscured without an applicable special sense." };
}

/** Normalized languages understood by an actor, including structured origin provenance. */
export function dnd5eSrdActorLanguages(actor: Actor): string[] {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  const values: string[] = [];
  const add = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) add(entry);
      return;
    }
    if (typeof value === "string") {
      values.push(...value.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean));
      return;
    }
    for (const nested of Object.values(recordValue(value))) add(nested);
  };
  add(actor.data.languages);
  add(actor.data.languageProficiencies);
  add(statBlock.languages);
  return [...new Set(values.map((value) => value.replace(/\([^)]*\)/g, "").trim()).filter((value) => value && value !== "—" && !/^telepathy\b/i.test(value)).map(normalizedIdentifier))];
}

export function dnd5eSrdCommunicationCompatibility(source: Actor, target: Actor, options: { telepathyActive?: boolean } = {}): { canCommunicate: boolean; sharedLanguages: string[]; method: "shared-language" | "telepathy" | "none" } {
  if (options.telepathyActive) return { canCommunicate: true, sharedLanguages: [], method: "telepathy" };
  const targetLanguages = new Set(dnd5eSrdActorLanguages(target));
  const sharedLanguages = dnd5eSrdActorLanguages(source).filter((language) => targetLanguages.has(language));
  return { canCommunicate: sharedLanguages.length > 0, sharedLanguages, method: sharedLanguages.length > 0 ? "shared-language" : "none" };
}

const DND_5E_SRD_SIZE_ORDER = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;

export function dnd5eSrdSizeRank(size: unknown): number | undefined {
  if (typeof size !== "string") return undefined;
  const index = DND_5E_SRD_SIZE_ORDER.indexOf(size.trim().toLowerCase() as typeof DND_5E_SRD_SIZE_ORDER[number]);
  return index >= 0 ? index : undefined;
}

/** Grapple and Shove targets can be no more than one size larger than the attacker. */
export function dnd5eSrdCanGrappleOrShove(attacker: Actor, target: Actor): { eligible: boolean; reason: string; attackerSize?: string; targetSize?: string } {
  const attackerSize = typeof attacker.data.size === "string" ? attacker.data.size : "Medium";
  const targetSize = typeof target.data.size === "string" ? target.data.size : undefined;
  const attackerRank = dnd5eSrdSizeRank(attackerSize);
  const targetRank = dnd5eSrdSizeRank(targetSize);
  if (attackerRank === undefined || targetRank === undefined) return { eligible: false, reason: "Both creatures require a supported explicit size before resolving Grapple or Shove.", attackerSize, ...(targetSize ? { targetSize } : {}) };
  const eligible = targetRank <= attackerRank + 1;
  return { eligible, reason: eligible ? "The target is no more than one size larger than the attacker." : "The target is more than one size larger than the attacker.", attackerSize, targetSize };
}

export function dnd5eSrdCreatureType(actor: Actor): string | undefined {
  const statBlock = recordValue(recordValue(actor.data.monster).statBlock);
  const raw = typeof actor.data.creatureType === "string" ? actor.data.creatureType : typeof statBlock.creatureType === "string" ? statBlock.creatureType : typeof statBlock.type === "string" ? statBlock.type : undefined;
  return raw ? normalizedIdentifier(raw) : undefined;
}

/** Deterministic target filter for effects restricted to one or more creature types. */
export function dnd5eSrdCreatureTypeMatches(actor: Actor, allowedTypes: readonly string[]): boolean {
  const actorType = dnd5eSrdCreatureType(actor);
  return Boolean(actorType && allowedTypes.map(normalizedIdentifier).includes(actorType));
}
