import type { Actor, Combat, Item, RulesEffectScheduleTiming } from "@open-tabletop/core";
import type { Dnd5eSrdConcentrationCleanup, RulesResolutionActorUpdate } from "./dnd-resolution-types.js";
import { dnd5eSrdHeavyArmorItemIds, isDnd5eSrdRageEffect } from "./dnd-rage-lifecycle.js";

type JsonRecord = Record<string, unknown>;

export type Dnd5eSrdEffectLifecycleReason = "expired" | "incapacitated" | "heavy-armor" | "ended" | "linked-cleanup";

export interface Dnd5eSrdEffectLifecycleChange {
  actorId: string;
  reason: Dnd5eSrdEffectLifecycleReason;
  removedEffectIds: string[];
  removedConditionIds: string[];
}

export interface Dnd5eSrdEffectLifecycleResult {
  actorUpdates: RulesResolutionActorUpdate[];
  concentrationCleanups: Dnd5eSrdConcentrationCleanup[];
  changes: Dnd5eSrdEffectLifecycleChange[];
}

export interface Dnd5eSrdConcentrationEndResult extends Dnd5eSrdEffectLifecycleResult {
  ended: boolean;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

// JSON round-trip, not structuredClone: also canonicalizes (drops undefined members)
// so actor data persisted to state stays JSON-canonical for stableJson diffing.
function cloneRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function conditionId(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : stringValue(recordValue(value).id);
  return raw?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function effectId(effect: JsonRecord): string | undefined {
  return stringValue(effect.id);
}

function effectExpirationRound(effect: JsonRecord): number | undefined {
  const explicit = finiteInteger(effect.expiresAtRound);
  if (explicit !== undefined) return explicit;
  const startedAtRound = finiteInteger(effect.startedAtRound);
  const durationRounds = finiteInteger(effect.durationRounds);
  return startedAtRound !== undefined && durationRounds !== undefined ? startedAtRound + durationRounds : undefined;
}

function expirationDue(
  effect: JsonRecord,
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">,
  phase: RulesEffectScheduleTiming,
  now?: string
): boolean {
  const expiresAt = stringValue(effect.expiresAt) ?? stringValue(recordValue(effect.schedule).expiresAt);
  if (expiresAt && now) {
    const expiryMs = Date.parse(expiresAt);
    const nowMs = Date.parse(now);
    if (Number.isFinite(expiryMs) && Number.isFinite(nowMs) && expiryMs <= nowMs) return true;
  }
  const expiresAtRound = effectExpirationRound(effect) ?? finiteInteger(recordValue(effect.schedule).expiresAtRound);
  if (expiresAtRound === undefined || combat.round < expiresAtRound) return false;
  if (combat.round > expiresAtRound) return true;
  const schedule = recordValue(effect.schedule);
  const timing = stringValue(effect.expiresAtTiming) ?? stringValue(effect.expiresAtPhase) ?? stringValue(schedule.timing) ?? "start_round";
  if (timing !== phase) return false;
  if ((phase === "start_turn" || phase === "end_turn") && stringValue(schedule.anchorActorId)) {
    if (combat.combatants[combat.turnIndex]?.actorId !== stringValue(schedule.anchorActorId)) return false;
  }
  if (phase === "initiative_count") {
    const initiativeCount = finiteInteger(schedule.initiativeCount);
    const current = combat.combatants[combat.turnIndex];
    const previous = combat.turnIndex > 0 ? combat.combatants[combat.turnIndex - 1] : undefined;
    if (initiativeCount === undefined || !current || current.initiative > initiativeCount || (previous && previous.initiative <= initiativeCount)) return false;
  }
  return true;
}

function dataWithRules(data: JsonRecord, rules: JsonRecord): JsonRecord {
  return { ...data, rulesEngine: rules };
}

function removeEffects(dataInput: JsonRecord, predicate: (effect: JsonRecord) => boolean): {
  data: JsonRecord;
  removedEffects: JsonRecord[];
  removedEffectIds: string[];
  removedConditionIds: string[];
} {
  const data = cloneRecord(dataInput);
  const rules = cloneRecord(recordValue(data.rulesEngine));
  const activeEffects = Array.isArray(rules.activeEffects) ? rules.activeEffects.map((effect) => cloneRecord(recordValue(effect))) : [];
  const removedEffects = activeEffects.filter(predicate);
  if (removedEffects.length === 0) return { data, removedEffects: [], removedEffectIds: [], removedConditionIds: [] };
  const remainingEffects = activeEffects.filter((effect) => !removedEffects.includes(effect));
  rules.activeEffects = remainingEffects;

  const removedOwnedConditionIds = unique(removedEffects.flatMap((effect) => stringArray(effect.ownedConditionIds)));
  const remainingOwnedConditionIds = new Set(remainingEffects.flatMap((effect) => stringArray(effect.ownedConditionIds)));
  const removedConditionIds = removedOwnedConditionIds.filter((id) => !remainingOwnedConditionIds.has(id));
  if (removedConditionIds.length > 0 && Array.isArray(data.conditions)) {
    data.conditions = data.conditions.filter((condition) => {
      const id = conditionId(condition);
      return !id || !removedConditionIds.includes(id);
    });
  }
  return {
    data: dataWithRules(data, rules),
    removedEffects,
    removedEffectIds: removedEffects.map(effectId).filter((id): id is string => Boolean(id)),
    removedConditionIds
  };
}

function concentrationCleanup(
  actor: Actor,
  concentration: JsonRecord,
  reason: Dnd5eSrdConcentrationCleanup["reason"]
): Dnd5eSrdConcentrationCleanup | undefined {
  const rollId = stringValue(concentration.rollId);
  if (!rollId) return undefined;
  return {
    sourceActorId: stringValue(concentration.sourceActorId) ?? actor.id,
    rollId,
    ...(stringValue(concentration.startedAt) ? { startedAt: stringValue(concentration.startedAt) } : {}),
    targetActorIds: unique(stringArray(concentration.targetActorIds)),
    reason
  };
}

function removeSourceConcentration(dataInput: JsonRecord): {
  data: JsonRecord;
  concentration: JsonRecord;
  removedEffectIds: string[];
  removedConditionIds: string[];
} {
  const data = cloneRecord(dataInput);
  const rules = cloneRecord(recordValue(data.rulesEngine));
  const concentration = cloneRecord(recordValue(rules.concentration));
  delete rules.concentration;
  const withoutConcentration = removeEffects(dataWithRules(data, rules), (effect) => effect.concentration === true);
  const concentrationConditionIds = ["concentration", "concentrating"];
  const removedConditionIds = [...withoutConcentration.removedConditionIds];
  if (Array.isArray(withoutConcentration.data.conditions)) {
    const before = withoutConcentration.data.conditions;
    withoutConcentration.data.conditions = before.filter((condition) => {
      const id = conditionId(condition);
      if (!id || !concentrationConditionIds.includes(id)) return true;
      removedConditionIds.push(id);
      return false;
    });
  }
  return {
    data: withoutConcentration.data,
    concentration,
    removedEffectIds: withoutConcentration.removedEffectIds,
    removedConditionIds: unique(removedConditionIds)
  };
}

function applyLinkedCleanup(dataInput: JsonRecord, cleanup: Dnd5eSrdConcentrationCleanup): {
  data: JsonRecord;
  removedEffectIds: string[];
  removedConditionIds: string[];
} {
  const result = removeEffects(dataInput, (effect) =>
    stringValue(effect.sourceActorId) === cleanup.sourceActorId &&
    stringValue(effect.rollId) === cleanup.rollId &&
    (!cleanup.startedAt || stringValue(effect.startedAt) === cleanup.startedAt)
  );
  return { data: result.data, removedEffectIds: result.removedEffectIds, removedConditionIds: result.removedConditionIds };
}

function actorConditionIds(actor: Actor, combat: Pick<Combat, "combatants">): string[] {
  const sheetConditions = Array.isArray(actor.data.conditions) ? actor.data.conditions.map(conditionId).filter((id): id is string => Boolean(id)) : [];
  const combatant = combat.combatants.find((candidate) => candidate.actorId === actor.id);
  const combatConditions = (combatant?.conditions ?? []).map((condition) => conditionId(condition.split(":")[0])).filter((id): id is string => Boolean(id));
  if (combatant?.defeated || combatant?.deathSaveOutcome === "dead") combatConditions.push("dead");
  return unique([...sheetConditions, ...combatConditions]);
}

function actorBreaksConcentration(actor: Actor, combat: Pick<Combat, "combatants">): boolean {
  const breaking = new Set(["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "dead"]);
  return actorConditionIds(actor, combat).some((id) => breaking.has(id));
}

function finalizeLifecycle(
  actors: Actor[],
  workingData: Map<string, JsonRecord>,
  cleanups: Dnd5eSrdConcentrationCleanup[],
  changes: Dnd5eSrdEffectLifecycleChange[]
): Dnd5eSrdEffectLifecycleResult {
  for (const cleanup of cleanups) {
    for (const targetActorId of cleanup.targetActorIds) {
      const actor = actors.find((candidate) => candidate.id === targetActorId);
      if (!actor) continue;
      const result = applyLinkedCleanup(workingData.get(actor.id) ?? actor.data, cleanup);
      if (result.removedEffectIds.length === 0 && result.removedConditionIds.length === 0) continue;
      workingData.set(actor.id, result.data);
      changes.push({
        actorId: actor.id,
        reason: "linked-cleanup",
        removedEffectIds: result.removedEffectIds,
        removedConditionIds: result.removedConditionIds
      });
    }
  }

  const actorUpdates: RulesResolutionActorUpdate[] = [];
  for (const actor of actors) {
    const after = workingData.get(actor.id);
    if (!after || JSON.stringify(after) === JSON.stringify(actor.data)) continue;
    const actorReasons = unique(changes.filter((change) => change.actorId === actor.id).map((change) => change.reason));
    actorUpdates.push({
      actorId: actor.id,
      before: cloneRecord(actor.data),
      after,
      reason: `effect-lifecycle:${actorReasons.join(",")}`
    });
  }
  return { actorUpdates, concentrationCleanups: cleanups, changes };
}

/**
 * Purely advances D&D active effects to the supplied authoritative combat round.
 * Effects without an absolute round (or a start round plus duration) are retained.
 */
export function advanceDnd5eSrdEffectLifecycle(
  actors: Actor[],
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">,
  timing: { phase: RulesEffectScheduleTiming; now?: string },
  items: Item[] = []
): Dnd5eSrdEffectLifecycleResult {
  const workingData = new Map<string, JsonRecord>();
  const cleanups: Dnd5eSrdConcentrationCleanup[] = [];
  const changes: Dnd5eSrdEffectLifecycleChange[] = [];

  for (const actor of actors) {
    const rageIncapacitated = actorBreaksConcentration(actor, combat);
    const rageHeavyArmor = dnd5eSrdHeavyArmorItemIds(actor, items).length > 0;
    const expired = removeEffects(actor.data, (effect) => {
      return expirationDue(effect, combat, timing.phase, timing.now)
        || (isDnd5eSrdRageEffect(effect) && (rageIncapacitated || rageHeavyArmor));
    });
    if (expired.removedEffectIds.length > 0 || expired.removedConditionIds.length > 0) {
      workingData.set(actor.id, expired.data);
      changes.push({
        actorId: actor.id,
        reason: rageIncapacitated ? "incapacitated" : rageHeavyArmor ? "heavy-armor" : "expired",
        removedEffectIds: expired.removedEffectIds,
        removedConditionIds: expired.removedConditionIds
      });
    }

    const currentData = workingData.get(actor.id) ?? actor.data;
    const rules = recordValue(currentData.rulesEngine);
    const concentration = recordValue(rules.concentration);
    if (Object.keys(concentration).length === 0) continue;
    const expiredConcentration = expirationDue(concentration, combat, timing.phase, timing.now);
    const incapacitated = actorBreaksConcentration({ ...actor, data: currentData }, combat);
    if (!expiredConcentration && !incapacitated) continue;

    const removed = removeSourceConcentration(currentData);
    workingData.set(actor.id, removed.data);
    changes.push({
      actorId: actor.id,
      reason: incapacitated ? "incapacitated" : "expired",
      removedEffectIds: removed.removedEffectIds,
      removedConditionIds: removed.removedConditionIds
    });
    const cleanup = concentrationCleanup(actor, concentration, incapacitated ? "incapacitated" : "expired");
    if (cleanup) cleanups.push(cleanup);
  }

  return finalizeLifecycle(actors, workingData, cleanups, changes);
}

/** Pure transaction preview for voluntarily ending one actor's concentration. */
export function endDnd5eSrdConcentration(actors: Actor[], sourceActorId: string): Dnd5eSrdConcentrationEndResult {
  const source = actors.find((actor) => actor.id === sourceActorId);
  if (!source) return { ended: false, actorUpdates: [], concentrationCleanups: [], changes: [] };
  const concentration = cloneRecord(recordValue(recordValue(source.data.rulesEngine).concentration));
  if (Object.keys(concentration).length === 0) return { ended: false, actorUpdates: [], concentrationCleanups: [], changes: [] };

  const removed = removeSourceConcentration(source.data);
  const workingData = new Map<string, JsonRecord>([[source.id, removed.data]]);
  const cleanup = concentrationCleanup(source, concentration, "ended");
  const changes: Dnd5eSrdEffectLifecycleChange[] = [{
    actorId: source.id,
    reason: "ended",
    removedEffectIds: removed.removedEffectIds,
    removedConditionIds: removed.removedConditionIds
  }];
  const result = finalizeLifecycle(actors, workingData, cleanup ? [cleanup] : [], changes);
  return { ended: true, ...result };
}
