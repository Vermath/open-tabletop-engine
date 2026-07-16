import type { Actor, CompendiumCatalogEntry, Item, Token, VisionPoint } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";
import { dnd5eSrdActorClassLevels, dnd5eSrdCharacterLevel, dnd5eSrdClassLevel } from "./dnd-class-levels.js";
import { numericValue, recordValue, slugId, stringValue, titleCaseLabel } from "./sheet-format.js";

function tokenLayer(token?: Pick<Token, "layer">): Token["layer"] {
  return token?.layer === "map" || token?.layer === "gm" || token?.layer === "player" ? token.layer : "player";
}


export type RulesCompendiumEntry = CompendiumCatalogEntry;


export type TokenVisionPatch = Partial<Pick<Token, "visionEnabled" | "visionRadius">> & {
  brightVisionRadius?: number | null;
  dimVisionRadius?: number | null;
};


export const actorActionFormulaPattern = /\b\d{0,3}d\d{1,4}(?:\s*[+-]\s*(?:\d{0,3}d\d{1,4}|\d{1,5}))*\b/i;


export function actorActionDiceFormula(action: ActorActionOption): string | undefined {
  return action.description.match(actorActionFormulaPattern)?.[0];
}


export const quickActorConditionIds = ["prone", "poisoned", "stunned", "restrained", "frightened", "marked"];


export function actorHitPoints(actor?: Actor): { current: number; max: number } | undefined {
  const hp = recordValue(actor?.data.hp);
  const current = Number(hp.current);
  const max = Number(hp.max ?? hp.current);
  return Number.isFinite(current) && Number.isFinite(max) ? { current, max } : undefined;
}


/** Display-only view of the authoritative concentration state persisted by the rules resolver. */
export function actorConcentrationLabel(actor?: Actor): string | undefined {
  if (!actor || actor.systemId !== "dnd-5e-srd") return undefined;
  return stringValue(recordValue(recordValue(actor.data.rulesEngine).concentration).label);
}


export interface ActorRageStatus {
  label: string;
  damageBonus: number;
  resistances: string[];
  expiresAtRound?: number;
  maximumExpiresAtRound?: number;
}


/** Display-only view of the authoritative Rage effect persisted by the rules resolver. */
export function actorRageStatus(actor?: Actor): ActorRageStatus | undefined {
  if (!actor || actor.systemId !== "dnd-5e-srd") return undefined;
  const effects = recordValue(actor.data.rulesEngine).activeEffects;
  if (!Array.isArray(effects)) return undefined;
  const effect = effects.map(recordValue).find((candidate) => candidate.kind === "rage" && candidate.lifecycleVersion === 1 && candidate.rollId === "feature-rage");
  if (!effect) return undefined;
  const damageBonus = Math.max(0, numericValue(effect.damageBonus, dnd5eSrdRageDamageBonus(actor)));
  const resistances = damageTraitValues(effect.resistance);
  const expiresAtRound = numericValue(effect.expiresAtRound, Number.NaN);
  const maximumExpiresAtRound = numericValue(effect.maximumExpiresAtRound, Number.NaN);
  return {
    label: `Raging (+${damageBonus} damage; B/P/S resistance)`,
    damageBonus,
    resistances,
    ...(Number.isFinite(expiresAtRound) ? { expiresAtRound } : {}),
    ...(Number.isFinite(maximumExpiresAtRound) ? { maximumExpiresAtRound } : {})
  };
}


export function damageTraitValues(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((item) => item.trim().toLocaleLowerCase()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => damageTraitValues(item));
  const record = recordValue(value);
  return Object.entries(record)
    .filter(([, enabled]) => enabled === true || enabled === "true")
    .map(([key]) => key.toLocaleLowerCase());
}


export function actorDamageTraitValues(actor: Actor | undefined, keys: string[]): string[] {
  if (!actor) return [];
  const stored = keys.flatMap((key) => damageTraitValues(actor.data[key]));
  const includesResistance = keys.some((key) => ["resistances", "damageresistances", "damageresistance"].includes(key.toLocaleLowerCase()));
  const active = includesResistance ? actorRageStatus(actor)?.resistances ?? [] : [];
  return [...new Set([...stored, ...active])];
}


export function damageTraitMatches(values: string[], damageType: string): boolean {
  return values.some((value) => value === damageType || value === "all" || value === "all damage");
}


export function targetConditionLabels(actor: Actor | undefined, token: Token): string[] {
  return [...(token.conditions?.map((condition) => condition.name) ?? []), ...(actor ? actorConditionLabels(actor) : [])].map((condition) => condition.toLocaleLowerCase());
}


export function conditionMentionsDamageTrait(labels: string[], trait: "resistant" | "immune" | "vulnerable", damageType: string): boolean {
  return labels.some((label) => label.includes(`${trait} ${damageType}`) || label.includes(`${damageType} ${trait}`));
}


export function hasConcentrationCue(labels: string[]): boolean {
  return labels.some((label) => label === "concentration" || label === "concentrating" || label.includes(" concentration"));
}


export function adjustedTemplateDamage(actor: Actor | undefined, token: Token, amount: number, damageType: string | undefined): { amount: number; notes: string[] } {
  const type = damageType?.trim().toLocaleLowerCase();
  const labels = targetConditionLabels(actor, token);
  let adjusted = Math.max(0, amount);
  const notes: string[] = [];
  if (type) {
    const immune =
      damageTraitMatches(actorDamageTraitValues(actor, ["immunities", "damageImmunities", "damageImmunity"]), type) ||
      conditionMentionsDamageTrait(labels, "immune", type);
    const resistant =
      damageTraitMatches(actorDamageTraitValues(actor, ["resistances", "damageResistances", "damageResistance"]), type) ||
      conditionMentionsDamageTrait(labels, "resistant", type);
    const vulnerable =
      damageTraitMatches(actorDamageTraitValues(actor, ["vulnerabilities", "damageVulnerabilities", "damageVulnerability"]), type) ||
      conditionMentionsDamageTrait(labels, "vulnerable", type);
    if (immune) {
      adjusted = 0;
      notes.push("immune");
    } else {
      if (resistant) {
        adjusted = Math.floor(adjusted / 2);
        notes.push("resisted");
      }
      if (vulnerable) {
        adjusted *= 2;
        notes.push("vulnerable");
      }
    }
  }
  if (adjusted > 0 && hasConcentrationCue(labels)) notes.push(`concentration DC ${Math.max(10, Math.floor(adjusted / 2))}`);
  return { amount: adjusted, notes };
}


export function appendActorCondition(actor: Actor, condition: string): unknown[] {
  const existing = Array.isArray(actor.data.conditions) ? actor.data.conditions : [];
  const id = slugId(condition);
  if (existing.some((item) => (typeof item === "string" ? item === id || item === condition : recordValue(item).id === id))) return existing;
  return [...existing, { id, appliedAt: new Date().toISOString() }];
}


export function actorSaveFormula(actor: Actor | undefined, ability: string): string {
  const attributes = recordValue(actor?.data.attributes);
  const score = Number(attributes[ability]);
  const modifier = Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
  if (modifier === 0) return "1d20";
  return `1d20${modifier > 0 ? "+" : ""}${modifier}`;
}


export interface ActorSheetQuickRoll {
  id: string;
  label: string;
  formula: string;
  metadata?: Record<string, unknown>;
}

export interface ActorCoreStatisticRoll {
  rollId: string;
  formula: string;
  d20Mode?: "normal" | "advantage" | "disadvantage";
  advantageSources?: string[];
  disadvantageSources?: string[];
}

export interface ActorCoreAbilityRow {
  key: string;
  label: string;
  score?: number;
  modifier?: number;
  check?: ActorCoreStatisticRoll;
  save?: ActorCoreStatisticRoll;
}

export interface ActorCoreDeathSave {
  rollId: string;
  formula: string;
  successes: number;
  failures: number;
  /** Terminal lifecycle already reached; when set, no further rolls are made. */
  state?: "stable" | "dead";
}

export interface ActorCoreArmorClass {
  value: number;
  label?: string;
  calculationOverride?: boolean;
  overrideReason?: string;
  baseValue?: number;
  requiresReview?: boolean;
  legacyStoredValue?: number;
  reviewReason?: string;
}

export interface ActorCoreStatistics {
  abilities: ActorCoreAbilityRow[];
  initiative?: ActorCoreStatisticRoll;
  armorClass?: ActorCoreArmorClass;
  speed?: number;
  passives: Array<{ id: string; label: string; value: number }>;
  skills: Array<{ rollId: string; label: string; formula: string }>;
  /** Present only for a character at 0 Hit Points. */
  deathSave?: ActorCoreDeathSave;
}

export interface ActorDeathSaveOutcome {
  outcome: "success" | "failure" | "critical-success" | "critical-failure";
  successes: number;
  failures: number;
  result?: "revived" | "stable" | "dead";
  hitPointsRestored?: number;
}

/** Compact status-line text for a committed Death Saving Throw outcome. */
export function deathSaveStatusText(save: ActorDeathSaveOutcome): string {
  if (save.result === "revived") return "natural 20 — regains 1 HP and is conscious";
  if (save.result === "dead") return "third failure — dead";
  if (save.result === "stable") return "third success — Stable";
  const label = save.outcome === "critical-failure" ? "natural 1 (two failures)" : save.outcome;
  return `${label} — ${save.successes}/3 successes, ${save.failures}/3 failures`;
}

/**
 * Reads the flat numeric modifier out of a server-computed roll formula such
 * as "1d20+5", "2d20kh1-1", or "1d20+3+1d4". This is display-only parsing of
 * an authoritative formula; the client never constructs roll math itself.
 */
export function rollFormulaModifier(formula: string): number | undefined {
  if (!/\dd\d/i.test(formula)) return undefined;
  const terms = formula.replace(/\s+/g, "").match(/[+-]\d+(?=$|[+-])/g);
  if (!terms) return 0;
  return terms.reduce((sum, term) => sum + Number(term), 0);
}

const passiveSkillIds = [
  { skillRollId: "skill-perception", id: "passive-perception", label: "Passive Perception" },
  { skillRollId: "skill-insight", id: "passive-insight", label: "Passive Insight" },
  { skillRollId: "skill-investigation", id: "passive-investigation", label: "Passive Investigation" }
];

function actorCoreStatisticRoll(roll: ActorSheetQuickRoll): ActorCoreStatisticRoll {
  const metadata = recordValue(roll.metadata);
  const d20Mode = metadata.d20Mode === "normal" || metadata.d20Mode === "advantage" || metadata.d20Mode === "disadvantage" ? metadata.d20Mode : undefined;
  const sources = (key: "advantageSources" | "disadvantageSources") => Array.isArray(metadata[key])
    ? metadata[key].filter((source): source is string => typeof source === "string" && source.trim().length > 0)
    : [];
  const advantageSources = sources("advantageSources");
  const disadvantageSources = sources("disadvantageSources");
  return {
    rollId: roll.id,
    formula: roll.formula,
    ...(d20Mode ? { d20Mode } : {}),
    ...(advantageSources.length > 0 ? { advantageSources } : {}),
    ...(disadvantageSources.length > 0 ? { disadvantageSources } : {}),
  };
}

/**
 * Derives the session-sheet core statistics view model from an authoritative
 * `GET .../actors/:actorId/sheet` payload. Every formula and roll id comes
 * from the server quick-roll list, so proficiency, expertise, condition, and
 * item effects are already applied.
 */
export function actorCoreStatistics(sheet: { quickRolls?: ActorSheetQuickRoll[]; data?: Record<string, unknown> }, context?: { actorType?: string }): ActorCoreStatistics {
  const quickRolls = Array.isArray(sheet.quickRolls) ? sheet.quickRolls : [];
  const data = recordValue(sheet.data);
  const attributes = recordValue(data.attributes);
  const abilities = quickRolls
    .filter((roll) => roll.id.startsWith("ability-"))
    .map((roll) => {
      const key = roll.id.slice("ability-".length);
      const save = quickRolls.find((candidate) => candidate.id === `save-${key}`);
      const score = numericValue(attributes[key], Number.NaN);
      const modifier = rollFormulaModifier(roll.formula);
      return {
        key,
        label: titleCaseLabel(key),
        ...(Number.isFinite(score) ? { score } : {}),
        ...(modifier !== undefined ? { modifier } : {}),
        check: actorCoreStatisticRoll(roll),
        ...(save ? { save: actorCoreStatisticRoll(save) } : {})
      };
    });
  const initiative = quickRolls.find((roll) => roll.id === "initiative");
  const armorClassValue = numericValue(data.armorClass, Number.NaN);
  const armorClassDetails = recordValue(data.armorClassDetails);
  const armorName = stringValue(armorClassDetails.armorName);
  const calculationOverride = armorClassDetails.calculationOverride === true;
  const overrideReason = stringValue(armorClassDetails.calculationOverrideReason);
  const baseValue = numericValue(armorClassDetails.calculationOverrideBaseValue, Number.NaN);
  const requiresReview = armorClassDetails.requiresReview === true;
  const legacyStoredValue = numericValue(armorClassDetails.legacyStoredValue, Number.NaN);
  const reviewReason = stringValue(armorClassDetails.reviewReason);
  const armorClassLabel = calculationOverride
    ? `${armorName ?? "Derived Armor Class"}; override${Number.isFinite(baseValue) ? ` ${baseValue} -> ${armorClassValue}` : ""}${overrideReason ? `: ${overrideReason}` : ""}`
    : requiresReview
      ? `${armorName ?? "Derived Armor Class"}; legacy AC${Number.isFinite(legacyStoredValue) ? ` ${legacyStoredValue}` : ""} requires review${reviewReason ? `: ${reviewReason}` : ""}`
      : armorName;
  const armorClass = Number.isFinite(armorClassValue)
    ? {
        value: armorClassValue,
        ...(armorClassLabel ? { label: armorClassLabel } : {}),
        ...(calculationOverride ? { calculationOverride: true } : {}),
        ...(overrideReason ? { overrideReason } : {}),
        ...(Number.isFinite(baseValue) ? { baseValue } : {}),
        ...(requiresReview ? { requiresReview: true } : {}),
        ...(Number.isFinite(legacyStoredValue) ? { legacyStoredValue } : {}),
        ...(reviewReason ? { reviewReason } : {}),
      }
    : undefined;
  const speed = numericValue(data.effectiveSpeed ?? data.speed, Number.NaN);
  const skills = quickRolls
    .filter((roll) => roll.id.startsWith("skill-"))
    .map((roll) => ({ rollId: roll.id, label: roll.label.replace(/ Check$/i, ""), formula: roll.formula }));
  const passives = passiveSkillIds.flatMap((passive) => {
    const skill = quickRolls.find((roll) => roll.id === passive.skillRollId);
    const modifier = skill ? rollFormulaModifier(skill.formula) : undefined;
    return skill && modifier !== undefined ? [{ id: passive.id, label: passive.label, value: 10 + modifier }] : [];
  });
  // The server "death-save" quick roll is exposed only while it can matter: a
  // character at 0 HP that is not already dead. Counters and the terminal
  // state come from the same authoritative sheet payload.
  const deathSaveRoll = quickRolls.find((roll) => roll.id === "death-save");
  const hpCurrent = numericValue(recordValue(data.hp).current, Number.NaN);
  const lifeState = typeof data.lifeState === "string" ? data.lifeState.trim().toLowerCase() : "";
  const deathSaves = recordValue(data.deathSaves);
  const boundedSaveCounter = (value: unknown): number => Math.max(0, Math.min(3, Math.floor(numericValue(value, 0))));
  const character = (context?.actorType ?? "character").trim().toLowerCase() === "character";
  const deathSave = deathSaveRoll && character && Number.isFinite(hpCurrent) && hpCurrent <= 0
    ? {
        rollId: deathSaveRoll.id,
        formula: deathSaveRoll.formula,
        successes: boundedSaveCounter(deathSaves.successes),
        failures: boundedSaveCounter(deathSaves.failures),
        ...(lifeState === "stable" ? { state: "stable" as const } : lifeState === "dead" ? { state: "dead" as const } : {})
      }
    : undefined;
  return {
    abilities,
    ...(initiative ? { initiative: actorCoreStatisticRoll(initiative) } : {}),
    ...(armorClass ? { armorClass } : {}),
    ...(Number.isFinite(speed) ? { speed } : {}),
    passives,
    skills,
    ...(deathSave ? { deathSave } : {})
  };
}


export function tokenPlayerOwnerIds(members: Snapshot["members"]): string[] {
  return members.filter((member) => member.role === "player").map((member) => member.userId).sort();
}


export function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}


export function tokenPermissionPresetLabel(token: Token, playerOwnerIds: string[]): string {
  if (tokenLayer(token) === "gm") return "GM layer";
  if (tokenLayer(token) === "map") return "Map layer";
  const tokenOwnerIds = token.ownerUserIds ?? [];
  if (token.hidden && token.locked && tokenOwnerIds.length === 0) return "Hidden GM hold";
  if (!token.hidden && token.locked && tokenOwnerIds.length === 0) return "GM locked";
  if (!token.hidden && !token.locked && tokenOwnerIds.length === 0) return "Target only";
  if (!token.hidden && !token.locked && sameStringSet(tokenOwnerIds, playerOwnerIds)) return "Party controlled";
  return "Custom";
}


export function isPointInsidePoints(point: VisionPoint, points: VisionPoint[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    const crosses = currentPoint.y > point.y !== previousPoint.y > point.y;
    const xAtY = ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y || 1) + currentPoint.x;
    if (crosses && point.x < xAtY) inside = !inside;
  }
  return inside;
}


export function actorConditionLabels(actor: Actor): string[] {
  const names: Record<string, string> = {
    blessed: "Blessed",
    poisoned: "Poisoned",
    restrained: "Restrained",
    "locked-in": "Locked In",
    jammed: "Jammed",
    "vacuum-exposed": "Vacuum Exposed",
    focused: "Focused",
    shaken: "Shaken",
    marked: "Marked"
  };
  const value = actor.data.conditions;
  if (!Array.isArray(value)) return [];
  return value
    .map((condition) => {
      if (typeof condition === "string") return names[condition] ?? titleCaseLabel(condition);
      if (condition && typeof condition === "object" && "id" in condition && typeof condition.id === "string") return names[condition.id] ?? titleCaseLabel(condition.id);
      return undefined;
    })
    .filter((condition): condition is string => Boolean(condition));
}


export function actorResourceLabels(actor: Actor): string[] {
  return Object.entries(recordValue(actor.data.resources)).flatMap(([key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) return `${titleCaseLabel(key)} ${value}`;
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    const max = numericValue(pool.max, NaN);
    if (!Number.isFinite(current) || !Number.isFinite(max)) return [];
    return `${titleCaseLabel(key)} ${current}/${max}`;
  });
}


export function formatActorConditions(actor: Actor): string {
  const value = actor.data.conditions;
  if (!Array.isArray(value)) return "";
  return value
    .map((condition) => {
      if (typeof condition === "string") return condition;
      if (condition && typeof condition === "object" && "id" in condition && typeof condition.id === "string") return condition.id;
      return undefined;
    })
    .filter((condition): condition is string => Boolean(condition))
    .join(", ");
}


export function parseActorConditions(value: string): string[] {
  return [...new Set(value.split(",").map((condition) => condition.trim()).filter(Boolean))].slice(0, 20);
}


export function actorResourceControls(actor: Actor): { key: string; label: string; current: number }[] {
  return Object.entries(recordValue(actor.data.resources)).flatMap(([key, value]) => {
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    if (Number.isFinite(current)) return [{ key, label: titleCaseLabel(key), current }];
    if (typeof value === "number" && Number.isFinite(value)) return [{ key, label: titleCaseLabel(key), current: value }];
    return [];
  });
}


export function actorResourceUpdate(actor: Actor, key: string, current: number): Record<string, unknown> {
  const resources = { ...recordValue(actor.data.resources) };
  const nextCurrent = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  const existing = resources[key];
  const pool = recordValue(existing);
  resources[key] = Object.keys(pool).length > 0 ? { ...pool, current: nextCurrent } : nextCurrent;
  return resources;
}


export function actorCombatResource(actor: Actor): { key: string; label: string } | undefined {
  for (const [key, value] of Object.entries(recordValue(actor.data.resources))) {
    const pool = recordValue(value);
    const current = numericValue(pool.current, NaN);
    const max = numericValue(pool.max, NaN);
    if (Number.isFinite(current) && Number.isFinite(max)) return { key, label: `${titleCaseLabel(key)} ${current}/${max}` };
    if (typeof value === "number" && Number.isFinite(value)) return { key, label: `${titleCaseLabel(key)} ${value}` };
  }
  return undefined;
}


export function actorCombatStateLabels(actor: Actor): string[] {
  const labels: string[] = [];
  const deathSaves = recordValue(actor.data.deathSaves);
  const successes = numericValue(deathSaves.successes, NaN);
  const failures = numericValue(deathSaves.failures, NaN);
  if (Number.isFinite(successes) || Number.isFinite(failures)) {
    labels.push(`Death saves ${Number.isFinite(successes) ? successes : 0}/3 successes, ${Number.isFinite(failures) ? failures : 0}/3 failures`);
  }
  const combatState = recordValue(actor.data.combatState);
  if (combatState.deathSaveOutcome === "stable") labels.push("Stable");
  if (combatState.deathSaveOutcome === "dead") labels.push("Dead");
  const readiness = typeof combatState.readiness === "string" && combatState.readiness !== "normal" ? combatState.readiness : undefined;
  if (readiness) labels.push(titleCaseLabel(readiness));
  if (combatState.defeated === true) labels.push("Defeated");
  if (combatState.resourceUsed === true) labels.push(`${typeof combatState.resourceLabel === "string" ? combatState.resourceLabel : "Resource"} used${combatState.resourceSpent === true ? " and depleted" : ""}`);
  return labels;
}


export function itemDisplayLabel(item: Item): string {
  const quantity = numericValue(recordValue(item.data).quantity, NaN);
  return Number.isFinite(quantity) ? `${item.name} x${quantity}` : item.name;
}


export function itemPreparedLabel(item: Item): string {
  if (item.type !== "spell" && item.type !== "ritual" && item.type !== "talent") return "preparation n/a";
  if (recordValue(item.data).alwaysPrepared === true) return "always prepared";
  return recordValue(item.data).prepared === false ? "unprepared" : "prepared";
}


export function itemEquippedLabel(item: Item): string {
  if (item.type === "spell" || item.type === "ritual" || item.type === "talent" || item.type === "clue") return "equipment n/a";
  return recordValue(item.data).equipped === false ? "unequipped" : "equipped";
}


export function actorArmorClass(actor: Actor, items: Item[]): { value: number; label?: string } | undefined {
  const storedArmorClass = numericValue(actor.data.armorClass, NaN);
  if (Number.isFinite(storedArmorClass)) return { value: storedArmorClass };
  if (actor.systemId !== "dnd-5e-srd") return undefined;
  const dexModifier = genericFantasyAttributeModifier(actor, "dexterity");
  const actorItems = items.filter((item) => item.actorId === actor.id && itemQuantity(recordValue(item.data)) > 0);
  const armorOptions = [
    { value: 10 + dexModifier, label: "Unarmored" },
    ...actorItems.flatMap((item) => {
      const data = recordValue(item.data);
      if (data.equipped === false) return [];
      const armorBase = numericValue(data.armorBase, NaN);
      if (!Number.isFinite(armorBase)) return [];
      const dexContribution = data.dexBonus === false ? 0 : Math.min(dexModifier, numericValue(data.dexCap, dexModifier));
      return [{ value: armorBase + dexContribution, label: item.name }];
    })
  ];
  const armor = armorOptions.sort((left, right) => right.value - left.value)[0]!;
  const shieldBonus = actorItems.reduce((max, item) => {
    const data = recordValue(item.data);
    if (data.equipped === false) return max;
    return Math.max(max, numericValue(data.armorBonus, 0));
  }, 0);
  return { value: armor.value + shieldBonus, label: shieldBonus > 0 ? `${armor.label} + Shield` : armor.label };
}


export function itemQuantity(data: Record<string, unknown>): number {
  return Math.max(0, numericValue(data.quantity, 1));
}


export function isPurchasableCompendiumEntry(actor: Actor, entry: RulesCompendiumEntry): boolean {
  return actor.systemId === "dnd-5e-srd" && entry.type !== "condition" && Number.isFinite(numericValue(entry.data.costGp, NaN));
}


export type ActorActionOption = { rollId: string; label: string; description: string; resolutionNote?: string };

export function unmodeledMixedDamageRiderNote(data: Record<string, unknown>): string | undefined {
  const secondaryFormula = stringValue(data.secondaryDamageFormula);
  const secondaryType = stringValue(data.secondaryDamageType);
  const damageTypes = [stringValue(data.damageType), stringValue(data.damageTypes)]
    .flatMap((value) => (value ?? "").split(/[\/,]/).map((part) => part.trim()).filter(Boolean));
  const breakdownEntries = Object.entries(recordValue(data.damageBreakdown));
  const hasAuthoritativeBreakdown = breakdownEntries.length > 1 && breakdownEntries.every(([, amount]) => typeof amount === "number" && Number.isInteger(amount) && amount >= 0);
  if (!secondaryFormula && !secondaryType && damageTypes.length <= 1 && (breakdownEntries.length <= 1 || hasAuthoritativeBreakdown)) return undefined;
  return "Mixed rider is not combined into this roll; resolve each component with Reviewed typed damage.";
}


export function actorActionSupportsEffect(action: ActorActionOption | undefined): boolean {
  if (!action) return false;
  if (action.rollId === "feature-stunning-strike") return true;
  const effectText = `${action.rollId} ${action.label} ${action.description}`.toLowerCase();
  return action.rollId.endsWith("-healing") || action.rollId.endsWith("-damage") || /\b(healing|damage|condition|effect)\b/.test(effectText);
}


export function actorActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  if (actor.systemId === "stellar-frontiers") return stellarFrontiersActionOptions(actor, items);
  if (actor.systemId === "mystic-noir") return mysticNoirActionOptions(actor, items);
  if (actor.systemId === "dnd-5e-srd") return dnd5eSrdActionOptions(actor, items);
  return genericFantasyActionOptions(actor, items);
}


export function dnd5eSrdActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return [...dnd5eSrdClassFeatureActionOptions(actor), ...dnd5eSrdSpeciesTraitActionOptions(actor), ...dnd5eSrdMonsterActionOptions(actor), ...dnd5eSrdItemActionOptions(actor, items)];
}


export function dnd5eSrdMonsterActionOptions(actor: Actor): ActorActionOption[] {
  const monster = recordValue(actor.data.monster);
  const statBlock = recordValue(monster.statBlock);
  const actions = Array.isArray(statBlock.actions) ? statBlock.actions.map(recordValue) : [];
  return actions.flatMap((action) => {
    const name = stringValue(action.name);
    if (!name) return [];
    const id = slugId(name);
    const options: ActorActionOption[] = [];
    if (Number.isFinite(numericValue(action.attackBonus, Number.NaN))) {
      options.push({ rollId: `monster-${id}-attack`, label: `${name} Attack`, description: `${name} Attack` });
    }
    const damageFormula = stringValue(action.damageFormula);
    if (damageFormula) {
      const resolutionNote = unmodeledMixedDamageRiderNote(action);
      options.push({ rollId: `monster-${id}-damage`, label: `${name} Damage`, description: `${name} Damage: ${damageFormula}`, ...(resolutionNote ? { resolutionNote } : {}) });
    }
    if (stringValue(action.condition) || stringValue(action.summary) || Object.keys(recordValue(action.save)).length > 0) {
      options.push({ rollId: `monster-${id}-effect`, label: `${name} Effect`, description: `${name} Effect: ${dnd5eSrdMonsterActionEffectSummary(action)}` });
    }
    return options;
  });
}


export function dnd5eSrdMonsterActionEffectSummary(action: Record<string, unknown>): string {
  const parts = [stringValue(action.condition), stringValue(action.recharge) ? `Recharge ${stringValue(action.recharge)}` : undefined, stringValue(action.summary)].filter((value): value is string => Boolean(value));
  return parts.join("; ") || "effect";
}


export function dnd5eSrdClassFeatureActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasSecondWind(actor)) {
    const tacticalShift = dnd5eSrdHasTacticalShift(actor) ? `; Tactical Shift ${dnd5eSrdTacticalShiftMovement(actor)} ft without opportunity attacks` : "";
    options.push({
      rollId: "feature-second-wind-healing",
      label: "Second Wind",
      description: `Second Wind Healing: ${dnd5eSrdSecondWindFormula(actor)}${tacticalShift}`
    });
  }
  if (dnd5eSrdHasActionSurge(actor)) {
    options.push({ rollId: "feature-action-surge", label: "Action Surge", description: "Action Surge: spend one use and grant exactly one additional Action this turn" });
  }
  if (dnd5eSrdHasTacticalMind(actor)) {
    options.push({ rollId: "feature-tactical-mind-bonus", label: "Tactical Mind", description: "Tactical Mind Bonus: 1d10; spends Second Wind" });
  }
  if (dnd5eSrdHasChampionCritical(actor)) {
    options.push({ rollId: "feature-champion-critical-range", label: dnd5eSrdChampionCriticalLabel(actor), description: `${dnd5eSrdChampionCriticalLabel(actor)}: weapon and Unarmed Strike attacks score Critical Hits on ${dnd5eSrdChampionCriticalRange(actor)}` });
  }
  if (dnd5eSrdHasChampionRemarkableAthlete(actor)) {
    options.push({ rollId: "feature-champion-remarkable-athlete", label: "Remarkable Athlete", description: `Remarkable Athlete: advantage on Initiative and Athletics; critical hit movement ${dnd5eSrdTacticalShiftMovement(actor)} ft` });
  }
  if (dnd5eSrdHasChampionHeroicWarrior(actor)) {
    options.push({ rollId: "feature-champion-heroic-warrior", label: "Heroic Warrior", description: "Heroic Warrior: gain Heroic Inspiration at the start of combat turns without it" });
  }
  if (dnd5eSrdHasChampionSurvivor(actor)) {
    options.push({ rollId: "feature-champion-survivor", label: "Survivor", description: `Survivor Rally: regain ${dnd5eSrdChampionSurvivorFormula(actor)} HP at turn start when Bloodied` });
  }
  if (dnd5eSrdHasRage(actor)) {
    const rageDamageBonus = dnd5eSrdRageDamageBonus(actor);
    const rage = actorRageStatus(actor);
    if (rage) {
      options.push(
        { rollId: "feature-rage-extend", label: "Extend Rage", description: "Extend Rage (Bonus Action): continue until the end of your next turn, up to 10 minutes" },
        { rollId: "feature-rage-end", label: "End Rage", description: "End Rage: voluntarily end the active Rage" },
        { rollId: "feature-rage-damage-bonus", label: "Rage Damage", description: `Rage Damage Bonus: ${rage.damageBonus}; automatic on eligible Strength weapon and Unarmed Strike damage` }
      );
    } else {
      options.push({ rollId: "feature-rage", label: "Rage", description: `Rage (Bonus Action): spends one use, ends Concentration, grants Strength Advantage, +${rageDamageBonus} eligible damage, and physical resistance` });
    }
  }
  if (dnd5eSrdHasRecklessAttack(actor)) {
    options.push({ rollId: "feature-reckless-attack", label: "Reckless Attack", description: "Reckless Attack: Strength attacks gain advantage; attacks against you gain advantage" });
  }
  if (dnd5eSrdHasBerserkerFrenzy(actor)) {
    options.push({ rollId: "feature-berserker-frenzy-damage", label: "Frenzy", description: `Berserker Frenzy Damage: ${dnd5eSrdBerserkerFrenzyFormula(actor)} after Reckless Attack while raging` });
  }
  if (dnd5eSrdHasBerserkerMindlessRage(actor)) {
    options.push({ rollId: "feature-berserker-mindless-rage", label: "Mindless Rage", description: "Mindless Rage: immune to Charmed and Frightened while raging" });
  }
  if (dnd5eSrdHasBerserkerRetaliation(actor)) {
    options.push({ rollId: "feature-berserker-retaliation", label: "Retaliation", description: "Retaliation: reaction melee attack after nearby damage" });
  }
  if (dnd5eSrdHasBerserkerIntimidatingPresence(actor)) {
    options.push({ rollId: "feature-berserker-intimidating-presence", label: "Intimidating Presence", description: `Intimidating Presence: DC ${dnd5eSrdBerserkerSaveDc(actor)} Wisdom; 30 ft emanation` });
  }
  if (dnd5eSrdHasBardicInspiration(actor)) {
    options.push({ rollId: "feature-bardic-inspiration", label: "Bardic Inspiration", description: `Bardic Inspiration: ${dnd5eSrdBardicInspirationFormula(actor)}; spends one use` });
  }
  if (dnd5eSrdHasFontOfInspiration(actor)) {
    options.push({ rollId: "feature-font-of-inspiration", label: "Font of Inspiration", description: "Font of Inspiration: spend a spell slot to regain one Bardic Inspiration use" });
  }
  if (dnd5eSrdHasLoreCuttingWords(actor)) {
    options.push({ rollId: "feature-lore-cutting-words", label: "Cutting Words", description: `Cutting Words: subtract ${dnd5eSrdBardicInspirationFormula(actor)} from a visible creature's roll; spends one use` });
  }
  if (dnd5eSrdHasLoreMagicalDiscoveries(actor)) {
    options.push({ rollId: "feature-lore-magical-discoveries", label: "Magical Discoveries", description: "Magical Discoveries: prepare two Cleric, Druid, or Wizard spells" });
  }
  if (dnd5eSrdHasLorePeerlessSkill(actor)) {
    options.push({ rollId: "feature-lore-peerless-skill", label: "Peerless Skill", description: `Peerless Skill: add ${dnd5eSrdBardicInspirationFormula(actor)} after failing an ability check or attack roll` });
  }
  if (dnd5eSrdHasLayOnHands(actor)) {
    options.push({ rollId: "feature-lay-on-hands-healing", label: "Lay On Hands", description: `Lay On Hands Healing: ${dnd5eSrdLayOnHandsFormula(actor)}; spends healing pool points` });
  }
  if (dnd5eSrdHasPaladinsSmite(actor)) {
    options.push({ rollId: "feature-divine-smite-damage", label: "Divine Smite", description: `Divine Smite Damage: ${dnd5eSrdDivineSmiteFormula(actor)} radiant; can spend a spell slot or Paladin's Smite` });
  }
  if (dnd5eSrdHasFaithfulSteed(actor)) {
    options.push({ rollId: "feature-faithful-steed", label: "Faithful Steed", description: "Faithful Steed: free Find Steed casting; recovers on Long Rest" });
  }
  if (dnd5eSrdHasDevotionSacredWeapon(actor)) {
    options.push({ rollId: "feature-devotion-sacred-weapon", label: "Sacred Weapon", description: `Sacred Weapon: add +${dnd5eSrdDevotionSacredWeaponBonus(actor)} to a melee weapon attack; spends Channel Divinity` });
  }
  if (dnd5eSrdHasDevotionAura(actor)) {
    options.push({ rollId: "feature-devotion-aura", label: "Aura of Devotion", description: "Aura of Devotion: allies in Aura of Protection are immune to Charmed" });
  }
  if (dnd5eSrdHasDevotionSmiteProtection(actor)) {
    options.push({ rollId: "feature-devotion-smite-of-protection", label: "Smite Protection", description: "Smite of Protection: Divine Smite grants Half Cover in your aura" });
  }
  if (dnd5eSrdHasDevotionHolyNimbus(actor)) {
    options.push({ rollId: "feature-devotion-holy-nimbus-damage", label: "Holy Nimbus", description: `Holy Nimbus Radiant Damage: ${dnd5eSrdDevotionHolyNimbusFormula(actor)} in your aura` });
  }
  if (dnd5eSrdHasHuntersMark(actor)) {
    options.push({ rollId: "feature-hunters-mark-damage", label: "Hunter's Mark", description: `Hunter's Mark Damage: ${dnd5eSrdHuntersMarkFormula(actor)} force; spends a spell slot or Favored Enemy` });
  }
  if (dnd5eSrdHasHunterLore(actor)) {
    options.push({ rollId: "feature-hunter-lore", label: "Hunter Lore", description: "Hunter's Lore: reveal immunities, resistances, and vulnerabilities on a Hunter's Mark target" });
  }
  if (dnd5eSrdHasHunterPrey(actor)) {
    options.push({ rollId: "feature-hunter-prey", label: "Hunter Prey", description: "Hunter's Prey: 1d8 Colossus Slayer damage or Horde Breaker extra attack option" });
  }
  if (dnd5eSrdHasHunterDefensiveTactics(actor)) {
    options.push({ rollId: "feature-hunter-defensive-tactics", label: "Defensive Tactics", description: "Defensive Tactics: Escape the Horde or Multiattack Defense option" });
  }
  if (dnd5eSrdHasHunterSuperiorPrey(actor)) {
    options.push({ rollId: "feature-hunter-superior-prey", label: "Superior Prey", description: `Superior Hunter's Prey: ${dnd5eSrdHuntersMarkFormula(actor)} force to a second target within 30 feet` });
  }
  if (dnd5eSrdHasHunterSuperiorDefense(actor)) {
    options.push({ rollId: "feature-hunter-superior-defense", label: "Superior Defense", description: "Superior Hunter's Defense: Reaction for Resistance to incoming damage type" });
  }
  if (dnd5eSrdHasMartialArts(actor)) {
    options.push({ rollId: "feature-martial-arts-damage", label: "Martial Arts", description: `Martial Arts Damage: ${dnd5eSrdMartialArtsFormula(actor)} bludgeoning` });
  }
  if (dnd5eSrdHasMonkFocus(actor)) {
    options.push(
      { rollId: "feature-flurry-of-blows", label: "Flurry", description: `Flurry of Blows: spend 1 Focus for ${dnd5eSrdClassLevel(actor, "Monk") >= 10 ? 3 : 2} Unarmed Strikes` },
      { rollId: "feature-patient-defense", label: "Patient Defense", description: "Patient Defense: spend 1 Focus for Disengage and Dodge" },
      { rollId: "feature-step-of-the-wind", label: "Step of the Wind", description: "Step of the Wind: spend 1 Focus for Disengage, Dash, and doubled jump distance" },
      { rollId: "feature-uncanny-metabolism-healing", label: "Metabolism", description: `Uncanny Metabolism Healing: ${dnd5eSrdUncannyMetabolismFormula(actor)}; restores Focus on Initiative` }
    );
  }
  if (dnd5eSrdHasDeflectAttacks(actor)) {
    options.push({ rollId: "feature-deflect-attacks-damage", label: "Deflect", description: `Deflect Attacks Reaction Damage: ${dnd5eSrdDeflectAttacksDamageFormula(actor)} after reducing damage to 0` });
  }
  if (dnd5eSrdHasStunningStrike(actor)) {
    options.push({ rollId: "feature-stunning-strike", label: "Stunning Strike", description: `Stunning Strike: spend 1 Focus; DC ${dnd5eSrdMonkSaveDc(actor)} Constitution` });
  }
  if (dnd5eSrdHasOpenHandTechnique(actor)) {
    options.push({ rollId: "feature-open-hand-technique", label: "Open Hand", description: `Open Hand Technique: Flurry rider; Addle, Push DC ${dnd5eSrdMonkSaveDc(actor)} Strength, or Topple DC ${dnd5eSrdMonkSaveDc(actor)} Dexterity` });
  }
  if (dnd5eSrdHasOpenHandWholeness(actor)) {
    options.push({ rollId: "feature-open-hand-wholeness-of-body", label: "Wholeness", description: `Wholeness of Body: ${dnd5eSrdOpenHandWholenessFormula(actor)} healing; spend one Long Rest use` });
  }
  if (dnd5eSrdHasOpenHandFleetStep(actor)) {
    options.push({ rollId: "feature-open-hand-fleet-step", label: "Fleet Step", description: "Fleet Step: use Step of the Wind after another Bonus Action" });
  }
  if (dnd5eSrdHasOpenHandQuiveringPalm(actor)) {
    options.push({ rollId: "feature-open-hand-quivering-palm-damage", label: "Quivering Palm", description: `Quivering Palm: spend 4 Focus; 10d12 force, DC ${dnd5eSrdMonkSaveDc(actor)} Constitution half` });
  }
  if (dnd5eSrdHasInnateSorcery(actor)) {
    options.push({ rollId: "feature-innate-sorcery", label: "Innate Sorcery", description: `Innate Sorcery: spend one use for +1 spell DC (${dnd5eSrdSpellSaveDc(actor) + 1}) and spell attack advantage` });
  }
  if (dnd5eSrdHasFontOfMagic(actor)) {
    options.push(
      { rollId: "feature-convert-spell-slot-to-sorcery-points", label: "Convert Slot", description: "Font of Magic: convert a spell slot into Sorcery Points equal to its level" },
      { rollId: "feature-create-spell-slot", label: "Create Slot", description: "Font of Magic: spend Sorcery Points to restore a spell slot" }
    );
  }
  if (dnd5eSrdHasMetamagic(actor)) {
    options.push(
      { rollId: "feature-metamagic-empowered-spell", label: "Empowered Spell", description: `Metamagic: spend 1 Sorcery Point to reroll up to ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma"))} damage dice` },
      { rollId: "feature-metamagic-quickened-spell", label: "Quickened Spell", description: "Metamagic: spend 2 Sorcery Points to cast an action spell as a Bonus Action" }
    );
  }
  if (dnd5eSrdHasDraconicResilience(actor)) {
    options.push({ rollId: "feature-draconic-resilience", label: "Draconic Resilience", description: `Draconic Resilience: AC ${10 + genericFantasyAttributeModifier(actor, "dexterity") + genericFantasyAttributeModifier(actor, "charisma")} while unarmored` });
  }
  if (dnd5eSrdHasDraconicElementalAffinity(actor)) {
    options.push({ rollId: "feature-draconic-elemental-affinity", label: "Elemental Affinity", description: `Elemental Affinity: +${genericFantasyAttributeModifier(actor, "charisma")} damage and resistance for a chosen dragon damage type` });
  }
  if (dnd5eSrdHasDraconicWings(actor)) {
    options.push({ rollId: "feature-draconic-wings", label: "Dragon Wings", description: "Dragon Wings: Bonus Action, fly speed 60 ft for 1 hour; spend 3 Sorcery Points to restore a use" });
  }
  if (dnd5eSrdHasDraconicCompanion(actor)) {
    options.push({ rollId: "feature-draconic-companion", label: "Dragon Companion", description: "Dragon Companion: cast Summon Dragon without material components; one free cast per Long Rest" });
  }
  if (dnd5eSrdHasEvokerPotentCantrip(actor)) {
    options.push({ rollId: "feature-evoker-potent-cantrip", label: "Potent Cantrip", description: `Potent Cantrip: save cantrips use DC ${dnd5eSrdSpellSaveDc(actor)} and deal half damage when a target would avoid damage` });
  }
  if (dnd5eSrdHasEvokerSculptSpells(actor)) {
    options.push({ rollId: "feature-evoker-sculpt-spells", label: "Sculpt Spells", description: "Sculpt Spells: protect 1 + spell level creatures from your Evocation spell damage" });
  }
  if (dnd5eSrdHasEvokerEmpoweredEvocation(actor)) {
    options.push({ rollId: "feature-evoker-empowered-evocation", label: "Empowered Evocation", description: `Empowered Evocation: add +${dnd5eSrdEvokerEmpoweredEvocationBonus(actor)} to one Wizard Evocation spell damage roll` });
  }
  if (dnd5eSrdHasEvokerOverchannel(actor)) {
    options.push({ rollId: "feature-evoker-overchannel", label: "Overchannel", description: "Overchannel: spend one long-rest use to maximize a level 1-5 Wizard damage spell" });
  }
  if (dnd5eSrdHasEldritchInvocations(actor)) {
    options.push({ rollId: "feature-eldritch-invocations", label: "Invocations", description: `Eldritch Invocations: ${dnd5eSrdEldritchInvocationsKnown(actor)} known; includes pact options such as Blade, Chain, and Tome` });
  }
  if (dnd5eSrdHasMagicalCunning(actor)) {
    options.push({ rollId: "feature-magical-cunning", label: "Magical Cunning", description: `Magical Cunning: spend one use to regain ${dnd5eSrdMagicalCunningLimit(actor)} Pact Magic slot` });
  }
  if (dnd5eSrdHasFiendDarkBlessing(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-blessing", label: "Dark Blessing", description: `Dark One's Blessing: ${Math.max(1, genericFantasyAttributeModifier(actor, "charisma") + dnd5eSrdClassLevel(actor, "Warlock"))} temp HP when an enemy drops nearby` });
  }
  if (dnd5eSrdHasFiendDarkLuck(actor)) {
    options.push({ rollId: "feature-fiend-dark-ones-own-luck", label: "Dark Luck", description: "Dark One's Own Luck: spend one use to add 1d10 to an ability check or saving throw" });
  }
  if (dnd5eSrdHasFiendResilience(actor)) {
    options.push({ rollId: "feature-fiendish-resilience", label: "Fiendish Resilience", description: "Fiendish Resilience: choose a non-Force damage resistance after a Short or Long Rest" });
  }
  if (dnd5eSrdHasFiendHurlThroughHell(actor)) {
    options.push({ rollId: "feature-fiend-hurl-through-hell-damage", label: "Hurl Through Hell", description: `Hurl Through Hell: 8d10 psychic; DC ${dnd5eSrdSpellSaveDc(actor)} Charisma` });
  }
  if (dnd5eSrdHasWildShape(actor)) {
    options.push({ rollId: "feature-wild-shape", label: "Wild Shape", description: `Wild Shape: spend one use; ${dnd5eSrdWildShapeDurationHours(actor)} hour form; regain one use on Short Rest` });
  }
  if (dnd5eSrdHasWildCompanion(actor)) {
    options.push({ rollId: "feature-wild-companion", label: "Wild Companion", description: "Wild Companion: cast Find Familiar by spending a spell slot or Wild Shape" });
  }
  if (dnd5eSrdHasWildResurgence(actor)) {
    options.push(
      { rollId: "feature-wild-resurgence-wild-shape", label: "Wild Resurgence", description: "Wild Resurgence: spend a spell slot to regain one Wild Shape use when none remain" },
      { rollId: "feature-wild-resurgence-spell-slot", label: "Wild Slot", description: "Wild Resurgence: spend Wild Shape to regain a level 1 spell slot once per Long Rest" }
    );
  }
  if (dnd5eSrdHasMoonCircleForms(actor)) {
    options.push({ rollId: "feature-moon-circle-forms", label: "Circle Forms", description: `Circle Forms: CR ${dnd5eSrdMoonWildShapeMaxChallengeRating(actor)}, AC floor ${13 + genericFantasyAttributeModifier(actor, "wisdom")}, ${dnd5eSrdClassLevel(actor, "Druid") * 3} temp HP` });
  }
  if (dnd5eSrdHasMoonImprovedCircleForms(actor)) {
    options.push({ rollId: "feature-moon-improved-circle-forms", label: "Improved Forms", description: "Improved Circle Forms: Radiant Wild Shape damage option and Wisdom bonus to Concentration saves" });
  }
  if (dnd5eSrdHasMoonlightStep(actor)) {
    options.push({ rollId: "feature-moon-moonlight-step", label: "Moonlight Step", description: "Moonlight Step: Bonus Action teleport 30 ft and gain Advantage on your next attack this turn" });
  }
  if (dnd5eSrdHasMoonLunarForm(actor)) {
    options.push({ rollId: "feature-moon-lunar-form-damage", label: "Lunar Form", description: "Lunar Form Radiant Damage: 2d10 once per turn with a Wild Shape form attack" });
  }
  if (dnd5eSrdHasClericChannelDivinity(actor)) {
    const saveDc = dnd5eSrdSpellSaveDc(actor);
    const searUndead = dnd5eSrdHasSearUndead(actor) ? `; Sear ${dnd5eSrdSearUndeadFormula(actor)} radiant` : "";
    options.push(
      { rollId: "feature-divine-spark-healing", label: "Divine Spark Healing", description: `Divine Spark Healing: ${dnd5eSrdDivineSparkFormula(actor)}; spends Channel Divinity` },
      { rollId: "feature-divine-spark-damage", label: "Divine Spark Damage", description: `Divine Spark Damage: ${dnd5eSrdDivineSparkFormula(actor)}; DC ${saveDc} Constitution; spends Channel Divinity` },
      { rollId: "feature-turn-undead", label: "Turn Undead", description: `Turn Undead: DC ${saveDc} Wisdom; 30 ft; spends Channel Divinity${searUndead}` }
    );
  }
  if (dnd5eSrdHasSearUndead(actor)) {
    options.push({ rollId: "feature-sear-undead-damage", label: "Sear Undead", description: `Sear Undead Damage: ${dnd5eSrdSearUndeadFormula(actor)} radiant` });
  }
  if (dnd5eSrdHasLifeDisciple(actor)) {
    options.push({ rollId: "feature-life-disciple-of-life", label: "Disciple of Life", description: "Disciple of Life: healing spells add 2 + spell slot level" });
  }
  if (dnd5eSrdHasLifePreserveLife(actor)) {
    options.push({ rollId: "feature-life-preserve-life", label: "Preserve Life", description: `Preserve Life: restore ${dnd5eSrdPreserveLifeFormula(actor)} HP among Bloodied creatures; spends Channel Divinity` });
  }
  if (dnd5eSrdHasLifeBlessedHealer(actor)) {
    options.push({ rollId: "feature-life-blessed-healer", label: "Blessed Healer", description: "Blessed Healer: heal yourself for 2 + spell slot level after healing another creature with a spell slot" });
  }
  if (dnd5eSrdHasLifeSupremeHealing(actor)) {
    options.push({ rollId: "feature-life-supreme-healing", label: "Supreme Healing", description: "Supreme Healing: use the highest possible number for each healing die" });
  }
  if (dnd5eSrdHasSneakAttack(actor)) {
    const cunningStrike = dnd5eSrdHasCunningStrike(actor) ? `; Cunning Strike DC ${dnd5eSrdRogueSaveDc(actor)}` : "";
    options.push({ rollId: "feature-sneak-attack-damage", label: "Sneak Attack", description: `Sneak Attack Damage: ${dnd5eSrdSneakAttackFormula(actor)}${cunningStrike}` });
  }
  if (dnd5eSrdHasCunningStrike(actor)) {
    options.push({ rollId: "feature-cunning-strike", label: "Cunning Strike", description: `Cunning Strike: spend Sneak Attack dice for Poison, Trip, or Withdraw; DC ${dnd5eSrdRogueSaveDc(actor)}` });
  }
  if (dnd5eSrdHasThiefFastHands(actor)) {
    options.push({ rollId: "feature-thief-fast-hands", label: "Fast Hands", description: "Fast Hands: use Cunning Action for Sleight of Hand, Thieves' Tools, or Utilize" });
  }
  if (dnd5eSrdHasThiefSecondStoryWork(actor)) {
    options.push({ rollId: "feature-thief-second-story-work", label: "Second-Story Work", description: `Second-Story Work: climb ${numericValue(actor.data.speed, 30)} ft; jump +${Math.max(0, genericFantasyAttributeModifier(actor, "dexterity"))} ft` });
  }
  if (dnd5eSrdHasThiefSupremeSneak(actor)) {
    options.push({ rollId: "feature-thief-supreme-sneak", label: "Supreme Sneak", description: `Supreme Sneak: advantage on Stealth after moving ${Math.floor(numericValue(actor.data.speed, 30) / 2)} ft or less` });
  }
  if (dnd5eSrdHasThiefUseMagicDevice(actor)) {
    options.push({ rollId: "feature-thief-use-magic-device", label: "Use Magic Device", description: "Use Magic Device: 1d6 charge check; 6 spends no charges; four attunements; Int scroll checks" });
  }
  if (dnd5eSrdHasThiefReflexes(actor)) {
    options.push({ rollId: "feature-thief-reflexes", label: "Thief's Reflexes", description: "Thief's Reflexes: two turns in first combat round at Initiative and Initiative - 10" });
  }
  return options;
}


export function dnd5eSrdSpeciesTraitActionOptions(actor: Actor): ActorActionOption[] {
  const options: ActorActionOption[] = [];
  if (dnd5eSrdHasDragonbornBreathWeapon(actor)) {
    const dc = 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "constitution");
    options.push({ rollId: "species-dragonborn-breath-weapon", label: "Breath Weapon", description: `Breath Weapon: ${dnd5eSrdDragonbornBreathWeaponFormula(actor)}; DC ${dc} Dexterity; spends one use` });
  }
  if (dnd5eSrdHasDraconicFlight(actor)) {
    options.push({ rollId: "species-draconic-flight", label: "Draconic Flight", description: `Draconic Flight: spend one use for ${numericValue(actor.data.speed, 30)} ft fly speed for 10 minutes` });
  }
  if (dnd5eSrdHasDwarfStonecunning(actor)) {
    options.push({ rollId: "species-dwarf-stonecunning", label: "Stonecunning", description: "Stonecunning: spend one use for 60 ft Tremorsense for 10 minutes on stone" });
  }
  if (dnd5eSrdHasGoliathGiantAncestry(actor)) {
    options.push({ rollId: "species-goliath-giant-ancestry", label: "Giant Ancestry", description: "Giant Ancestry: spend one use for your chosen Giant boon" });
  }
  if (dnd5eSrdHasGoliathLargeForm(actor)) {
    options.push({ rollId: "species-goliath-large-form", label: "Large Form", description: `Large Form: spend one use to become Large, gain Strength check advantage, and move ${numericValue(actor.data.speed, 35) + 10} ft` });
  }
  if (dnd5eSrdHasHumanResourceful(actor)) {
    options.push({ rollId: "species-human-resourceful", label: "Resourceful", description: "Resourceful: gain Heroic Inspiration when you finish a Long Rest" });
  }
  if (dnd5eSrdHasHumanSkillful(actor)) {
    const skill = stringValue(recordValue(actor.data.origin).humanSkillProficiency) ?? "chosen skill";
    options.push({ rollId: "species-human-skillful", label: "Skillful", description: `Skillful: proficiency in ${skill}` });
  }
  if (dnd5eSrdHasHumanVersatile(actor)) {
    const feat = stringValue(recordValue(actor.data.origin).humanOriginFeat) ?? "Skilled";
    options.push({ rollId: "species-human-versatile", label: "Versatile", description: `Versatile: origin feat ${feat}` });
  }
  if (dnd5eSrdHasElfElvenLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.elfLineageName) ?? stringValue(origin.elfLineage) ?? "Elven";
    options.push({ rollId: "species-elf-elven-lineage", label: "Elven Lineage", description: `${lineage}: lineage cantrip and level-gated Long Rest spells` });
  }
  if (dnd5eSrdHasElfFeyAncestry(actor)) {
    options.push({ rollId: "species-elf-fey-ancestry", label: "Fey Ancestry", description: "Fey Ancestry: advantage on saves to avoid or end Charmed" });
  }
  if (dnd5eSrdHasElfTrance(actor)) {
    options.push({ rollId: "species-elf-trance", label: "Trance", description: "Trance: finish a Long Rest in 4 hours while remaining conscious" });
  }
  if (dnd5eSrdHasGnomeGnomishCunning(actor)) {
    options.push({ rollId: "species-gnome-gnomish-cunning", label: "Gnomish Cunning", description: "Gnomish Cunning: advantage on Intelligence, Wisdom, and Charisma saves" });
  }
  if (dnd5eSrdHasGnomeLineage(actor)) {
    const origin = recordValue(actor.data.origin);
    const lineage = stringValue(origin.gnomeLineageName) ?? stringValue(origin.gnomeLineage) ?? "Gnomish";
    options.push({ rollId: "species-gnome-lineage", label: "Gnomish Lineage", description: `${lineage}: lineage cantrips and feature spells/devices` });
  }
  if (dnd5eSrdHasHalflingLuck(actor)) {
    options.push({ rollId: "species-halfling-luck", label: "Luck", description: "Luck: reroll a 1 on a D20 Test" });
  }
  if (dnd5eSrdHasHalflingBrave(actor)) {
    options.push({ rollId: "species-halfling-brave", label: "Brave", description: "Brave: advantage on saves to avoid or end Frightened" });
  }
  if (dnd5eSrdHasHalflingNimbleness(actor)) {
    options.push({ rollId: "species-halfling-nimbleness", label: "Nimbleness", description: "Halfling Nimbleness: move through a larger creature's space" });
  }
  if (dnd5eSrdHasHalflingNaturallyStealthy(actor)) {
    options.push({ rollId: "species-halfling-naturally-stealthy", label: "Naturally Stealthy", description: "Naturally Stealthy: Hide while obscured by a Medium or larger creature" });
  }
  if (dnd5eSrdHasTieflingFiendishLegacy(actor)) {
    const origin = recordValue(actor.data.origin);
    const legacy = stringValue(origin.tieflingLegacyName) ?? stringValue(origin.tieflingLegacy) ?? "Fiendish";
    const resistance = stringValue(origin.tieflingResistance) ?? "chosen";
    options.push({ rollId: "species-tiefling-fiendish-legacy", label: "Fiendish Legacy", description: `${legacy} Legacy: ${resistance} resistance and lineage spells` });
  }
  if (dnd5eSrdHasTieflingOtherworldlyPresence(actor)) {
    options.push({ rollId: "species-tiefling-otherworldly-presence", label: "Presence", description: "Otherworldly Presence: Thaumaturgy uses your Fiendish Legacy spellcasting ability" });
  }
  if (dnd5eSrdHasOrcAdrenalineRush(actor)) {
    options.push({ rollId: "species-orc-adrenaline-rush", label: "Adrenaline Rush", description: `Adrenaline Rush: Dash as a Bonus Action and gain ${dnd5eSrdAdrenalineRushFormula(actor)} temp HP` });
  }
  if (dnd5eSrdHasOrcRelentlessEndurance(actor)) {
    options.push({ rollId: "species-orc-relentless-endurance", label: "Relentless", description: "Relentless Endurance: spend one use to drop to 1 HP instead of 0" });
  }
  return options;
}


export function dnd5eSrdHasSpeciesFeature(actor: Actor, featureName: string, resourceKey?: string): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return features.includes(featureName) || Boolean(resourceKey && resourceKey in recordValue(actor.data.resources));
}


export function dnd5eSrdHasDragonbornBreathWeapon(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Breath Weapon", "breathWeapon");
}


export function dnd5eSrdHasDraconicFlight(actor: Actor): boolean {
  return dnd5eSrdCharacterLevel(actor) >= 5 && (stringValue(actor.data.species) === "Dragonborn" || dnd5eSrdHasSpeciesFeature(actor, "Draconic Flight", "draconicFlight"));
}


export function dnd5eSrdHasDwarfStonecunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Dwarf" || dnd5eSrdHasSpeciesFeature(actor, "Stonecunning", "stonecunning");
}


export function dnd5eSrdHasGoliathGiantAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Giant Ancestry", "giantAncestry");
}


export function dnd5eSrdHasGoliathLargeForm(actor: Actor): boolean {
  return dnd5eSrdCharacterLevel(actor) >= 5 && (stringValue(actor.data.species) === "Goliath" || dnd5eSrdHasSpeciesFeature(actor, "Large Form", "largeForm"));
}


export function dnd5eSrdHasHumanResourceful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Resourceful");
}


export function dnd5eSrdHasHumanSkillful(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Skillful");
}


export function dnd5eSrdHasHumanVersatile(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Human" || dnd5eSrdHasSpeciesFeature(actor, "Versatile");
}


export function dnd5eSrdHasElfElvenLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Elven Lineage");
}


export function dnd5eSrdHasElfFeyAncestry(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Fey Ancestry");
}


export function dnd5eSrdHasElfTrance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Elf" || dnd5eSrdHasSpeciesFeature(actor, "Trance");
}


export function dnd5eSrdHasGnomeGnomishCunning(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Cunning");
}


export function dnd5eSrdHasGnomeLineage(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Gnome" || dnd5eSrdHasSpeciesFeature(actor, "Gnomish Lineage");
}


export function dnd5eSrdHasHalflingLuck(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Luck");
}


export function dnd5eSrdHasHalflingBrave(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Brave");
}


export function dnd5eSrdHasHalflingNimbleness(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Halfling Nimbleness");
}


export function dnd5eSrdHasHalflingNaturallyStealthy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Halfling" || dnd5eSrdHasSpeciesFeature(actor, "Naturally Stealthy");
}


export function dnd5eSrdHasTieflingFiendishLegacy(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Fiendish Legacy");
}


export function dnd5eSrdHasTieflingOtherworldlyPresence(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Tiefling" || dnd5eSrdHasSpeciesFeature(actor, "Otherworldly Presence");
}


export function dnd5eSrdHasOrcAdrenalineRush(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Adrenaline Rush", "adrenalineRush");
}


export function dnd5eSrdHasOrcRelentlessEndurance(actor: Actor): boolean {
  return stringValue(actor.data.species) === "Orc" || dnd5eSrdHasSpeciesFeature(actor, "Relentless Endurance", "relentlessEndurance");
}


export function dnd5eSrdHasSecondWind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 1 || features.includes("Second Wind") || "secondWind" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasActionSurge(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 2 || features.includes("Action Surge") || "actionSurge" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasTacticalMind(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 2 || features.includes("Tactical Mind");
}


export function dnd5eSrdHasTacticalShift(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 5 || features.includes("Tactical Shift");
}


export function dnd5eSrdHasChampionCritical(actor: Actor): boolean {
  return dnd5eSrdHasChampionImprovedCritical(actor) || dnd5eSrdHasChampionSuperiorCritical(actor);
}


export function dnd5eSrdHasChampionImprovedCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 3 || features.includes("Improved Critical");
}


export function dnd5eSrdHasChampionRemarkableAthlete(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 3 || features.includes("Remarkable Athlete");
}


export function dnd5eSrdHasChampionHeroicWarrior(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 10 || features.includes("Heroic Warrior");
}


export function dnd5eSrdHasChampionSuperiorCritical(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 15 || features.includes("Superior Critical");
}


export function dnd5eSrdHasChampionSurvivor(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Fighter") >= 18 || features.includes("Survivor");
}


export function dnd5eSrdHasClericChannelDivinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 2 || features.includes("Divine Spark") || features.includes("Turn Undead") || features.includes("Sear Undead");
}


export function dnd5eSrdHasSearUndead(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 5 || features.includes("Sear Undead");
}


export function dnd5eSrdHasLifeDisciple(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 3 || features.includes("Disciple of Life");
}


export function dnd5eSrdHasLifePreserveLife(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 3 || features.includes("Preserve Life");
}


export function dnd5eSrdHasLifeBlessedHealer(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 6 || features.includes("Blessed Healer");
}


export function dnd5eSrdHasLifeSupremeHealing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Cleric") >= 17 || features.includes("Supreme Healing");
}


export function dnd5eSrdHasBardicInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Bard") >= 1 || features.includes("Bardic Inspiration") || "bardicInspiration" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasFontOfInspiration(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Bard") >= 5 || features.includes("Font of Inspiration");
}


export function dnd5eSrdHasLoreCuttingWords(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Bard") >= 3 || features.includes("College of Lore") || features.includes("Cutting Words");
}


export function dnd5eSrdHasLoreMagicalDiscoveries(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Bard") >= 6 || features.includes("Magical Discoveries");
}


export function dnd5eSrdHasLorePeerlessSkill(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Bard") >= 14 || features.includes("Peerless Skill");
}


export function dnd5eSrdHasLayOnHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 1 || features.includes("Lay On Hands") || "layOnHands" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasPaladinsSmite(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 2 || features.includes("Paladin's Smite") || "paladinsSmite" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasFaithfulSteed(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 5 || features.includes("Faithful Steed") || "faithfulSteed" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasDevotionSacredWeapon(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 3 || features.includes("Oath of Devotion") || features.includes("Sacred Weapon");
}


export function dnd5eSrdHasDevotionAura(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 7 || features.includes("Aura of Devotion");
}


export function dnd5eSrdHasDevotionSmiteProtection(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 15 || features.includes("Smite of Protection");
}


export function dnd5eSrdHasDevotionHolyNimbus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Paladin") >= 20 || features.includes("Holy Nimbus") || "holyNimbus" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasHuntersMark(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 1 || features.includes("Favored Enemy") || features.includes("Hunter's Mark") || "favoredEnemy" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasHunterLore(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 3 || features.includes("Hunter") || features.includes("Hunter's Lore");
}


export function dnd5eSrdHasHunterPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 3 || features.includes("Hunter's Prey");
}


export function dnd5eSrdHasHunterDefensiveTactics(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 7 || features.includes("Defensive Tactics");
}


export function dnd5eSrdHasHunterSuperiorPrey(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 11 || features.includes("Superior Hunter's Prey");
}


export function dnd5eSrdHasHunterSuperiorDefense(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Ranger") >= 15 || features.includes("Superior Hunter's Defense");
}


export function dnd5eSrdHasMartialArts(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 1 || features.includes("Martial Arts");
}


export function dnd5eSrdHasMonkFocus(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 2 || features.includes("Monk's Focus") || "focus" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasDeflectAttacks(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 3 || features.includes("Deflect Attacks");
}


export function dnd5eSrdHasStunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 5 || features.includes("Stunning Strike");
}


export function dnd5eSrdHasOpenHandTechnique(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 3 || features.includes("Warrior of the Open Hand") || features.includes("Open Hand Technique");
}


export function dnd5eSrdHasOpenHandWholeness(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 6 || features.includes("Wholeness of Body") || "wholenessOfBody" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasOpenHandFleetStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 11 || features.includes("Fleet Step");
}


export function dnd5eSrdHasOpenHandQuiveringPalm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Monk") >= 17 || features.includes("Quivering Palm");
}


export function dnd5eSrdHasInnateSorcery(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 1 || features.includes("Innate Sorcery") || "innateSorcery" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasFontOfMagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 2 || features.includes("Font of Magic") || "sorceryPoints" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasMetamagic(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 2 || features.includes("Metamagic");
}


export function dnd5eSrdHasDraconicResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 3 || features.includes("Draconic Sorcery") || features.includes("Draconic Resilience");
}


export function dnd5eSrdHasDraconicElementalAffinity(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 6 || features.includes("Elemental Affinity");
}


export function dnd5eSrdHasDraconicWings(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 14 || features.includes("Dragon Wings") || "dragonWings" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasDraconicCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Sorcerer") >= 18 || features.includes("Dragon Companion") || "dragonCompanion" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasEvokerPotentCantrip(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Wizard") >= 3 || features.includes("Evoker") || features.includes("Potent Cantrip");
}


export function dnd5eSrdHasEvokerSculptSpells(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Wizard") >= 6 || features.includes("Sculpt Spells");
}


export function dnd5eSrdHasEvokerEmpoweredEvocation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Wizard") >= 10 || features.includes("Empowered Evocation");
}


export function dnd5eSrdHasEvokerOverchannel(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Wizard") >= 14 || features.includes("Overchannel") || "overchannel" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasEldritchInvocations(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 1 || features.includes("Eldritch Invocations");
}


export function dnd5eSrdHasMagicalCunning(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 2 || features.includes("Magical Cunning") || "magicalCunning" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasFiendDarkBlessing(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 3 || features.includes("Fiend Patron") || features.includes("Dark One's Blessing");
}


export function dnd5eSrdHasFiendDarkLuck(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 6 || features.includes("Dark One's Own Luck") || "fiendLuck" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasFiendResilience(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 10 || features.includes("Fiendish Resilience");
}


export function dnd5eSrdHasFiendHurlThroughHell(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Warlock") >= 14 || features.includes("Hurl Through Hell") || "hurlThroughHell" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasWildShape(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 2 || features.includes("Wild Shape") || "wildShape" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasWildCompanion(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 2 || features.includes("Wild Companion");
}


export function dnd5eSrdHasWildResurgence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 5 || features.includes("Wild Resurgence") || "wildResurgence" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasMoonCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 3 || features.includes("Circle of the Moon") || features.includes("Circle Forms");
}


export function dnd5eSrdHasMoonImprovedCircleForms(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 6 || features.includes("Improved Circle Forms");
}


export function dnd5eSrdHasMoonlightStep(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 10 || features.includes("Moonlight Step") || "moonlightStep" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasMoonLunarForm(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Druid") >= 14 || features.includes("Lunar Form");
}


export function dnd5eSrdHasSneakAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 1 || features.includes("Sneak Attack");
}


export function dnd5eSrdHasCunningStrike(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 5 || features.includes("Cunning Strike");
}


export function dnd5eSrdHasThiefFastHands(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 3 || features.includes("Fast Hands");
}


export function dnd5eSrdHasThiefSecondStoryWork(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 3 || features.includes("Second-Story Work");
}


export function dnd5eSrdHasThiefSupremeSneak(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 9 || features.includes("Supreme Sneak");
}


export function dnd5eSrdHasThiefUseMagicDevice(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 13 || features.includes("Use Magic Device");
}


export function dnd5eSrdHasThiefReflexes(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Rogue") >= 17 || features.includes("Thief's Reflexes");
}


export function dnd5eSrdHasRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 1 || features.includes("Rage") || "rage" in recordValue(actor.data.resources);
}


export function dnd5eSrdHasRecklessAttack(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 2 || features.includes("Reckless Attack");
}


export function dnd5eSrdHasBerserkerFrenzy(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 3 || features.includes("Frenzy");
}


export function dnd5eSrdHasBerserkerMindlessRage(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 6 || features.includes("Mindless Rage");
}


export function dnd5eSrdHasBerserkerRetaliation(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 10 || features.includes("Retaliation");
}


export function dnd5eSrdHasBerserkerIntimidatingPresence(actor: Actor): boolean {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdClassLevel(actor, "Barbarian") >= 14 || features.includes("Intimidating Presence");
}


export function dnd5eSrdSecondWindFormula(actor: Actor): string {
  const fighterLevel = Math.max(1, dnd5eSrdClassLevel(actor, "Fighter"));
  return `1d10+${fighterLevel}`;
}


export function dnd5eSrdDivineSparkFormula(actor: Actor): string {
  return appendActionFormulaBonus(`${dnd5eSrdDivineSparkDice(actor)}d8`, genericFantasyAttributeModifier(actor, "wisdom"));
}


export function dnd5eSrdDivineSparkDice(actor: Actor): number {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Cleric"));
  if (level >= 18) return 4;
  if (level >= 13) return 3;
  if (level >= 7) return 2;
  return 1;
}


export function dnd5eSrdSearUndeadFormula(actor: Actor): string {
  return `${Math.max(1, genericFantasyAttributeModifier(actor, "wisdom"))}d8`;
}


export function dnd5eSrdPreserveLifeFormula(actor: Actor): string {
  return String(Math.max(1, dnd5eSrdClassLevel(actor, "Cleric")) * 5);
}


export function dnd5eSrdRageDamageBonus(actor: Actor): number {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Barbarian"));
  if (level >= 16) return 4;
  if (level >= 9) return 3;
  return 2;
}


export function dnd5eSrdBerserkerFrenzyFormula(actor: Actor): string {
  return `${dnd5eSrdRageDamageBonus(actor)}d6`;
}


export function dnd5eSrdBerserkerSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "strength");
}


export function dnd5eSrdEvokerEmpoweredEvocationBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "intelligence"));
}


export function dnd5eSrdBardicInspirationFormula(actor: Actor): string {
  return `1${dnd5eSrdBardicInspirationDie(actor)}`;
}


export function dnd5eSrdBardicInspirationDie(actor: Actor): string {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Bard"));
  if (level >= 15) return "d12";
  if (level >= 10) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}


export function dnd5eSrdLayOnHandsFormula(actor: Actor): string {
  const layOnHands = recordValue(recordValue(actor.data.resources).layOnHands);
  return String(Math.max(1, Math.min(5, numericValue(layOnHands.current, dnd5eSrdLayOnHandsMax(actor)))));
}


export function dnd5eSrdLayOnHandsMax(actor: Actor): number {
  return Math.max(1, dnd5eSrdClassLevel(actor, "Paladin")) * 5;
}


export function dnd5eSrdDivineSmiteFormula(actor: Actor): string {
  const slots = recordValue(actor.data.spellSlots);
  const slotLevel = Object.keys(slots).some((key) => key === "level2" && numericValue(recordValue(slots[key]).current, 0) > 0) ? 2 : 1;
  return `${slotLevel + 1}d8`;
}


export function dnd5eSrdHuntersMarkFormula(actor: Actor): string {
  return dnd5eSrdClassLevel(actor, "Ranger") >= 20 ? "1d10" : "1d6";
}


export function dnd5eSrdMartialArtsFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}


export function dnd5eSrdMartialArtsDie(actor: Actor): string {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Monk"));
  if (level >= 17) return "d12";
  if (level >= 11) return "d10";
  if (level >= 5) return "d8";
  return "d6";
}


export function dnd5eSrdUncannyMetabolismFormula(actor: Actor): string {
  return `1${dnd5eSrdMartialArtsDie(actor)}+${Math.max(1, dnd5eSrdClassLevel(actor, "Monk"))}`;
}


export function dnd5eSrdOpenHandWholenessFormula(actor: Actor): string {
  return appendActionFormulaBonus(`1${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "wisdom"));
}


export function dnd5eSrdDeflectAttacksDamageFormula(actor: Actor): string {
  return appendActionFormulaBonus(`2${dnd5eSrdMartialArtsDie(actor)}`, genericFantasyAttributeModifier(actor, "dexterity"));
}


export function dnd5eSrdMonkSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "wisdom");
}


export function dnd5eSrdDevotionSacredWeaponBonus(actor: Actor): number {
  return Math.max(1, genericFantasyAttributeModifier(actor, "charisma"));
}


export function dnd5eSrdDevotionHolyNimbusFormula(actor: Actor): string {
  return String(Math.max(0, genericFantasyAttributeModifier(actor, "charisma")) + dnd5eSrdProficiencyBonus(actor));
}


export function dnd5eSrdWildShapeDurationHours(actor: Actor): number {
  return Math.max(1, Math.floor(Math.max(1, dnd5eSrdClassLevel(actor, "Druid")) / 2));
}


export function dnd5eSrdMoonWildShapeMaxChallengeRating(actor: Actor): string {
  return String(Math.max(1, Math.floor(Math.max(1, dnd5eSrdClassLevel(actor, "Druid")) / 3)));
}


export function dnd5eSrdEldritchInvocationsKnown(actor: Actor): number {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Warlock"));
  if (level >= 18) return 10;
  if (level >= 15) return 9;
  if (level >= 12) return 8;
  if (level >= 9) return 7;
  if (level >= 7) return 6;
  if (level >= 5) return 5;
  if (level >= 2) return 3;
  return 1;
}


export function dnd5eSrdMagicalCunningLimit(actor: Actor): number {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Warlock"));
  const maxSlots = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
  return level >= 20 ? maxSlots : Math.ceil(maxSlots / 2);
}


export function dnd5eSrdDragonbornBreathWeaponFormula(actor: Actor): string {
  const level = dnd5eSrdCharacterLevel(actor);
  const dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return `${dice}d10`;
}


export function dnd5eSrdAdrenalineRushFormula(actor: Actor): string {
  return String(dnd5eSrdProficiencyBonus(actor));
}


export function dnd5eSrdSneakAttackFormula(actor: Actor): string {
  const level = Math.max(1, dnd5eSrdClassLevel(actor, "Rogue"));
  return `${Math.ceil(level / 2)}d6`;
}


export function dnd5eSrdRogueSaveDc(actor: Actor): number {
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, "dexterity");
}


export function dnd5eSrdArcaneRecoverySelection(actor: Actor): Record<string, number> | undefined {
  if (actor.systemId !== "dnd-5e-srd" || dnd5eSrdClassLevel(actor, "Wizard") < 1) return undefined;
  const arcaneRecovery = recordValue(recordValue(actor.data.resources).arcaneRecovery);
  if (numericValue(arcaneRecovery.current, 0) <= 0) return undefined;
  const slots = recordValue(actor.data.spellSlots);
  let remaining = Math.ceil(Math.max(1, dnd5eSrdClassLevel(actor, "Wizard")) / 2);
  const selection: Record<string, number> = {};
  for (let slotLevel = 1; slotLevel <= 5 && remaining > 0; slotLevel += 1) {
    const key = `level${slotLevel}`;
    const slot = recordValue(slots[key]);
    const expended = Math.max(0, numericValue(slot.max, 0) - numericValue(slot.current, 0));
    const recoverable = Math.min(expended, Math.floor(remaining / slotLevel));
    if (recoverable > 0) {
      selection[key] = recoverable;
      remaining -= recoverable * slotLevel;
    }
  }
  return Object.keys(selection).length > 0 ? selection : undefined;
}


export function dnd5eSrdSpellSaveDc(actor: Actor): number {
  const className = stringValue(actor.data.class) ?? "Fighter";
  return 8 + dnd5eSrdProficiencyBonus(actor) + genericFantasyAttributeModifier(actor, dnd5eSrdPrimaryAbility(className));
}


export function dnd5eSrdProficiencyBonus(actor: Actor): number {
  const level = dnd5eSrdCharacterLevel(actor);
  return Math.max(2, Math.floor(numericValue(actor.data.proficiencyBonus, 2 + Math.floor((level - 1) / 4))));
}


export function dnd5eSrdPrimaryAbility(className: string): string {
  if (className === "Bard") return "charisma";
  if (className === "Cleric") return "wisdom";
  if (className === "Druid") return "wisdom";
  if (className === "Paladin") return "charisma";
  if (className === "Ranger") return "wisdom";
  if (className === "Monk") return "dexterity";
  if (className === "Sorcerer") return "charisma";
  if (className === "Warlock") return "charisma";
  if (className === "Wizard") return "intelligence";
  if (className === "Rogue") return "dexterity";
  return "strength";
}


export function dnd5eSrdTacticalShiftMovement(actor: Actor): number {
  return Math.floor(numericValue(actor.data.speed, 30) / 2);
}


export function dnd5eSrdChampionCriticalLabel(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "Superior Critical" : "Improved Critical";
}


export function dnd5eSrdChampionCriticalRange(actor: Actor): string {
  return dnd5eSrdHasChampionSuperiorCritical(actor) ? "18-20" : "19-20";
}


export function dnd5eSrdChampionSurvivorFormula(actor: Actor): string {
  return String(5 + genericFantasyAttributeModifier(actor, "constitution"));
}


export function dnd5eSrdAttacksPerAction(actor: Actor): number {
  const features = Array.isArray(actor.data.features) ? actor.data.features : [];
  return dnd5eSrdActorClassLevels(actor).reduce((best, entry) => {
    const className = entry.className.toLowerCase();
    const attacks = className === "fighter" ? entry.level >= 20 ? 4 : entry.level >= 11 ? 3 : entry.level >= 5 ? 2 : 1
      : ["barbarian", "paladin", "ranger", "monk"].includes(className) && entry.level >= 5 ? 2 : 1;
    return Math.max(best, attacks);
  }, features.includes("Extra Attack") ? 2 : 1);
}


export function dnd5eSrdItemActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  const attacksPerAction = dnd5eSrdAttacksPerAction(actor);
  return genericFantasyActionOptions(actor, items.filter((item) => dnd5eSrdItemActionIsAvailable(actor, item))).map((option) => {
    const martialArtsFormula = dnd5eSrdMonkWeaponDamageFormulaForRoll(actor, items, option.rollId);
    const martialArtsOption = martialArtsFormula ? { ...option, description: `${option.label}: ${martialArtsFormula}` } : option;
    const rageDamageBonus = dnd5eSrdRageDamageBonusForItemRoll(actor, items, option.rollId);
    const nextOption = rageDamageBonus > 0 ? { ...martialArtsOption, description: actorActionDescriptionWithBonus(martialArtsOption.description, rageDamageBonus) } : martialArtsOption;
    if (attacksPerAction <= 1 || !dnd5eSrdIsWeaponDamageOption(actor, items, option.rollId)) return nextOption;
    return { ...nextOption, description: `${nextOption.description}; ${attacksPerAction} attacks/action` };
  });
}


export function dnd5eSrdRageDamageBonusForItemRoll(actor: Actor, items: Item[], rollId: string): number {
  const rage = actorRageStatus(actor);
  if (!rage) return 0;
  const item = items.filter((candidate) => candidate.actorId === actor.id).find((candidate) => rollId === `item-${candidate.id}-damage` || rollId === `item-${candidate.id}-versatile-damage`);
  if (!item) return 0;
  const data = recordValue(item.data);
  return dnd5eSrdIsWeaponData(data) && dnd5eSrdWeaponAttackAbility(actor, data) === "strength" ? rage.damageBonus : 0;
}


export function actorActionDescriptionWithBonus(description: string, bonus: number): string {
  const formula = description.match(actorActionFormulaPattern)?.[0];
  return formula ? description.replace(formula, appendActionFormulaBonus(formula, bonus)) : `${description}; Rage +${bonus}`;
}


export function dnd5eSrdItemActionIsAvailable(actor: Actor, item: Item): boolean {
  if (item.actorId !== actor.id || item.campaignId !== actor.campaignId || item.systemId !== actor.systemId) return false;
  const data = recordValue(item.data);
  if (item.type === "spell" && data.prepared === false) return false;
  const requiresAttunement = data.requiresAttunement === true || Boolean(stringValue(data.attunementRequirement));
  if (!requiresAttunement) return true;
  const attunement = recordValue(actor.data.attunement);
  const activeIds = [
    ...(Array.isArray(actor.data.attunedItemIds) ? actor.data.attunedItemIds.map(String) : []),
    ...(Array.isArray(attunement.activeAttunedItemIds) ? attunement.activeAttunedItemIds.map(String) : [])
  ];
  return activeIds.includes(item.id);
}


export function dnd5eSrdWeaponAttackFormula(actor: Actor, items: Item[], item: Item): string | undefined {
  const data = recordValue(item.data);
  if (!dnd5eSrdIsWeaponData(data) || !stringValue(data.damage)) return undefined;
  const ability = dnd5eSrdWeaponAttackAbility(actor, data);
  const abilityBonus = genericFantasyAttributeModifier(actor, ability);
  const proficiencyBonus = dnd5eSrdProficiencyBonus(actor) * dnd5eSrdWeaponProficiencyMultiplier(actor, items, data);
  return appendActionFormulaBonus("1d20", abilityBonus + proficiencyBonus + numericValue(data.attackBonus, 0));
}


export function dnd5eSrdWeaponAttackAbility(actor: Actor, data: Record<string, unknown>): string {
  const ability = stringValue(data.ability) || "strength";
  const properties = Array.isArray(data.properties) ? data.properties.map(String).map((property) => property.toLowerCase()) : [];
  const canUseDexterity = properties.includes("finesse") || (dnd5eSrdHasMartialArts(actor) && dnd5eSrdIsMonkWeapon(data));
  return canUseDexterity && genericFantasyAttributeModifier(actor, "dexterity") > genericFantasyAttributeModifier(actor, ability) ? "dexterity" : ability;
}


export function dnd5eSrdWeaponProficiencyMultiplier(actor: Actor, items: Item[], data: Record<string, unknown>): number {
  if (data.proficient === false) return 0;
  if (data.proficient === true) return 1;
  const explicitProficiencies = [
    ...(Array.isArray(actor.data.weaponProficiencies) ? actor.data.weaponProficiencies.map(String) : []),
    ...items
      .filter((item) => item.actorId === actor.id && itemQuantity(recordValue(item.data)) > 0)
      .flatMap((item) => Array.isArray(recordValue(item.data).weaponProficiencies) ? (recordValue(item.data).weaponProficiencies as unknown[]).map(String) : [])
  ];
  if (explicitProficiencies.some((proficiency) => dnd5eSrdWeaponMatchesProficiency(proficiency, data))) return 1;
  const weaponCategory = (stringValue(data.weaponCategory) || "simple").toLowerCase();
  if (weaponCategory === "simple") return 1;
  const className = (stringValue(actor.data.class) ?? "").toLowerCase();
  if (["barbarian", "fighter", "paladin", "ranger"].includes(className)) return 1;
  if (className === "rogue") {
    const properties = Array.isArray(data.properties) ? data.properties.map(String).map((property) => property.toLowerCase()) : [];
    return properties.includes("finesse") || properties.includes("light") ? 1 : 0;
  }
  return 0;
}


export function dnd5eSrdWeaponMatchesProficiency(proficiency: string, data: Record<string, unknown>): boolean {
  const normalized = slugId(proficiency);
  return [
    stringValue(data.compendiumId),
    stringValue(data.weaponCategory),
    stringValue(data.weaponCategory) ? `${stringValue(data.weaponCategory)}-weapon` : undefined,
    stringValue(data.weaponCategory) ? `${stringValue(data.weaponCategory)}-weapons` : undefined,
    stringValue(data.weaponKind),
    stringValue(data.weaponKind) ? `${stringValue(data.weaponKind)}-weapon` : undefined,
    stringValue(data.weaponKind) ? `${stringValue(data.weaponKind)}-weapons` : undefined
  ]
    .filter((value): value is string => Boolean(value))
    .map(slugId)
    .includes(normalized);
}


export function dnd5eSrdIsWeaponData(data: Record<string, unknown>): boolean {
  return stringValue(data.category) === "weapon" || stringValue(data.equipmentCategory) === "weapon";
}


export function dnd5eSrdIsWeaponDamageOption(actor: Actor, items: Item[], rollId: string): boolean {
  return items.filter((item) => item.actorId === actor.id).some((item) => {
    const data = recordValue(item.data);
    if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
    return rollId === `item-${item.id}-damage` || rollId === `item-${item.id}-versatile-damage`;
  });
}


export function dnd5eSrdMonkWeaponDamageFormulaForRoll(actor: Actor, items: Item[], rollId: string): string | undefined {
  if (!dnd5eSrdHasMartialArts(actor)) return undefined;
  const item = items.filter((candidate) => candidate.actorId === actor.id).find((candidate) => rollId.startsWith(`item-${candidate.id}-`));
  if (!item) return undefined;
  const data = recordValue(item.data);
  if (!dnd5eSrdIsMonkWeapon(data)) return undefined;
  const weaponDamage = rollId === `item-${item.id}-versatile-damage` ? stringValue(data.versatileDamage) : stringValue(data.damage);
  const damageDie = dnd5eSrdLargerDamageDie(weaponDamage, `1${dnd5eSrdMartialArtsDie(actor)}`);
  return appendActionFormulaBonus(damageDie, genericFantasyAttributeModifier(actor, "dexterity"));
}


export function dnd5eSrdIsMonkWeapon(data: Record<string, unknown>): boolean {
  if (stringValue(data.category) !== "weapon" && stringValue(data.equipmentCategory) !== "weapon") return false;
  const properties = Array.isArray(data.properties) ? data.properties.map(String).map((property) => property.toLowerCase()) : [];
  return properties.includes("light") || properties.includes("thrown") || properties.includes("versatile") || stringValue(data.compendiumId) === "spear";
}


export function dnd5eSrdLargerDamageDie(left: string | undefined, right: string): string {
  const leftSides = dnd5eSrdDamageDieSides(left);
  const rightSides = dnd5eSrdDamageDieSides(right);
  if (!left || rightSides > leftSides) return right;
  return left;
}


export function dnd5eSrdDamageDieSides(value: string | undefined): number {
  const match = /^1d(\d+)$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : 0;
}


export function genericFantasyActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "spell" ? "spell" : "item";
    const ability = stringValue(data.ability);
    const damage = stringValue(data.damage);
    const mixedDamageResolutionNote = unmodeledMixedDamageRiderNote(data);
    if (actor.systemId === "dnd-5e-srd" && prefix === "item") {
      const attackFormula = dnd5eSrdWeaponAttackFormula(actor, items, item);
      if (attackFormula) {
        options.push({
          rollId: `item-${item.id}-attack`,
          label: `${item.name} Attack`,
          description: `${item.name} Attack: ${attackFormula}; server verifies ability, proficiency, item, and condition modifiers`
        });
      }
    }
    if (damage && ability) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${appendActionFormulaBonus(damage, genericFantasyAttributeModifier(actor, ability))}`, ...(mixedDamageResolutionNote ? { resolutionNote: mixedDamageResolutionNote } : {}) });
    const damageFormula = stringValue(data.damageFormula);
    if (damageFormula) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${resolveGenericFantasyActionFormula(damageFormula, actor)}`, ...(mixedDamageResolutionNote ? { resolutionNote: mixedDamageResolutionNote } : {}) });
    const secondaryDamageFormula = stringValue(data.secondaryDamageFormula);
    if (secondaryDamageFormula) options.push({ rollId: `${prefix}-${item.id}-secondary-damage`, label: `${item.name} Secondary Damage`, description: `${item.name} Secondary Damage: ${resolveGenericFantasyActionFormula(secondaryDamageFormula, actor)}`, resolutionNote: "This is a separate rider roll; use Reviewed typed damage to combine components against defenses." });
    const versatileDamage = stringValue(data.versatileDamage);
    if (versatileDamage && ability) options.push({ rollId: `${prefix}-${item.id}-versatile-damage`, label: `${item.name} Versatile`, description: `${item.name} Versatile: ${appendActionFormulaBonus(versatileDamage, genericFantasyAttributeModifier(actor, ability))}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${resolveGenericFantasyActionFormula(healingFormula, actor)}` });
    const effectFormula = stringValue(data.effectFormula);
    const effectAbility = stringValue(data.saveDcAbility);
    const concentrationOnlyEffect = actor.systemId === "dnd-5e-srd" && item.type === "spell" && data.concentration === true && !damageFormula && !healingFormula;
    if (effectFormula || concentrationOnlyEffect) options.push({ rollId: `${prefix}-${item.id}-effect`, label: `${item.name} Effect`, description: `${item.name} Effect: ${effectFormula ? (effectAbility ? appendActionFormulaBonus(effectFormula, genericFantasyAttributeModifier(actor, effectAbility)) : effectFormula) : "concentration"}` });
    return options;
  });
}


export function stellarFrontiersActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "talent" ? "talent" : "gear";
    const aptitude = stringValue(data.aptitude);
    const damage = stringValue(data.damage);
    if (damage) options.push({ rollId: `${prefix}-${item.id}-damage`, label: `${item.name} Damage`, description: `${item.name} Damage: ${aptitude ? appendActionFormulaBonus(damage, stellarFrontiersAptitudeModifier(actor, aptitude)) : damage}` });
    const healingFormula = stringValue(data.healingFormula);
    if (healingFormula) options.push({ rollId: `${prefix}-${item.id}-healing`, label: `${item.name} Healing`, description: `${item.name} Healing: ${healingFormula}` });
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-boost`, label: `${item.name} Boost`, description: `${item.name} Boost: ${aptitude ? appendActionFormulaBonus(bonusFormula, stellarFrontiersAptitudeModifier(actor, aptitude)) : bonusFormula}` });
    return options;
  });
}


export function mysticNoirActionOptions(actor: Actor, items: Item[]): ActorActionOption[] {
  return items.filter((item) => item.actorId === actor.id).flatMap((item) => {
    const data = recordValue(item.data);
    const options: ActorActionOption[] = [];
    const prefix = item.type === "ritual" ? "ritual" : "clue";
    const skill = stringValue(data.skill);
    const bonusFormula = stringValue(data.bonusFormula);
    if (bonusFormula) options.push({ rollId: `${prefix}-${item.id}-insight`, label: `${item.name} Insight`, description: `${item.name} Insight: ${skill ? appendActionFormulaBonus(bonusFormula, mysticNoirSkillModifier(actor, skill)) : bonusFormula}` });
    const protectionFormula = stringValue(data.protectionFormula);
    if (protectionFormula) options.push({ rollId: `${prefix}-${item.id}-ward`, label: `${item.name} Ward`, description: `${item.name} Ward: ${skill ? appendActionFormulaBonus(protectionFormula, mysticNoirSkillModifier(actor, skill)) : protectionFormula}` });
    return options;
  });
}


export function genericFantasyAttributeModifier(actor: Actor, ability: string): number {
  const attributes = recordValue(actor.data.attributes);
  return Math.floor((numericValue(attributes[ability], 10) - 10) / 2);
}


export function stellarFrontiersAptitudeModifier(actor: Actor, aptitude: string): number {
  const aptitudes = recordValue(actor.data.aptitudes);
  return numericValue(aptitudes[aptitude], 0);
}


export function mysticNoirSkillModifier(actor: Actor, skill: string): number {
  const skills = recordValue(actor.data.skills);
  return numericValue(skills[skill], 1);
}


export function resolveGenericFantasyActionFormula(formula: string, actor: Actor): string {
  return formula.replace(/([+-]?)@attributes\.([A-Za-z0-9_-]+)/g, (_match, operator: string, ability: string) => {
    const modifier = genericFantasyAttributeModifier(actor, ability);
    const signedModifier = operator === "-" ? -modifier : modifier;
    return operator ? formatSignedActionNumber(signedModifier) : String(signedModifier);
  });
}


export function appendActionFormulaBonus(formula: string, bonus: number): string {
  return `${formula}${formatSignedActionNumber(bonus)}`;
}


export function formatSignedActionNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}


export function tokenBrightVisionPatch(value: string): TokenVisionPatch | undefined {
  if (!value.trim()) return { brightVisionRadius: null };
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius < 0) return undefined;
  return radius > 0 ? { brightVisionRadius: radius } : { brightVisionRadius: null };
}


export function tokenDimVisionPatch(value: string): TokenVisionPatch | undefined {
  const radius = value.trim() ? Number(value) : 0;
  if (!Number.isFinite(radius) || radius < 0) return undefined;
  return { visionRadius: radius, dimVisionRadius: radius > 0 ? radius : null };
}


export function formatTokenSenses(token?: Pick<Token, "senses">): string {
  return (token?.senses ?? []).map((sense) => `${sense.type}:${sense.range}`).join(", ");
}


export function parseTokenSenses(value: string): Token["senses"] | undefined {
  if (!value.trim()) return [];
  const allowed = new Set(["normal", "darkvision", "blindsight", "tremorsense", "truesight"] as const);
  const senses: NonNullable<Token["senses"]> = [];
  for (const entry of value.split(",")) {
    const match = entry.trim().toLowerCase().match(/^([a-z]+)\s*(?::|\s)\s*(\d+(?:\.\d+)?)$/);
    if (!match) return undefined;
    const type = match[1] as NonNullable<Token["senses"]>[number]["type"];
    const range = Number(match[2]);
    if (!allowed.has(type) || !Number.isFinite(range) || range <= 0 || senses.some((sense) => sense.type === type)) return undefined;
    senses.push({ type, range });
  }
  return senses;
}
