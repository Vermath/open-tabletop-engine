import type {
  Actor,
  Combat,
  Combatant,
  RulesEffectScheduleEvent,
  RulesEffectScheduleTiming
} from "@open-tabletop/core";
import {
  evaluateDnd5eSrdEffectSchedules,
  type Dnd5eSrdEffectScheduleEvaluationInput
} from "./dnd-advanced-mechanics.js";
import {
  advanceDnd5eSrdEffectLifecycle,
  type Dnd5eSrdEffectLifecycleChange
} from "./dnd-effect-lifecycle.js";
import { grantDnd5eSrdHeroicInspiration } from "./dnd-rules-completion.js";
import type { Dnd5eSrdConcentrationCleanup, RulesResolutionActorUpdate } from "./dnd-resolution-types.js";

type JsonRecord = Record<string, unknown>;

export interface Dnd5eSrdActorDataPatch {
  actorId: string;
  /** Complete replacement for `actor.data`; callers do not need to reconstruct nested patches. */
  data: JsonRecord;
  reason: string;
}

export interface Dnd5eSrdCombatantStateUpdate {
  combatantId: string;
  actorId: string;
  before: Combatant;
  /** Complete replacement combatant with lifecycle fields synchronized from actor data. */
  after: Combatant;
  reason: "hit-point-lifecycle";
}

export interface Dnd5eSrdActorCombatStateSynchronization {
  actorUpdate?: RulesResolutionActorUpdate;
  actorDataPatch?: Dnd5eSrdActorDataPatch;
  combatantUpdate?: Dnd5eSrdCombatantStateUpdate;
}

export interface Dnd5eSrdCombatRulesProgressionInput extends Dnd5eSrdEffectScheduleEvaluationInput {
  actors: Actor[];
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">;
}

export interface Dnd5eSrdCombatRulesProgressionResult {
  phase: RulesEffectScheduleTiming;
  round: number;
  turnIndex: number;
  events: RulesEffectScheduleEvent[];
  unresolvedEventIds: string[];
  canApply: boolean;
  /** Merged, one-per-actor before/after updates relative to the supplied actors. */
  actorUpdates: RulesResolutionActorUpdate[];
  /** Store-ready complete actor-data replacements derived from `actorUpdates`. */
  actorDataPatches: Dnd5eSrdActorDataPatch[];
  /** Store-ready complete combatant replacements for HP/death/stability synchronization. */
  combatantUpdates: Dnd5eSrdCombatantStateUpdate[];
  concentrationCleanups: Dnd5eSrdConcentrationCleanup[];
  lifecycleChanges: Dnd5eSrdEffectLifecycleChange[];
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

// JSON round-trip, not structuredClone: also canonicalizes (drops undefined members)
// so actor data persisted to state stays JSON-canonical for stableJson diffing.
function cloneRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function cloneActor(actor: Actor): Actor {
  return { ...actor, data: cloneRecord(actor.data) };
}

function boundedCounter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(3, Math.floor(value))) : 0;
}

function normalizedConditionId(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : typeof recordValue(value).id === "string" ? String(recordValue(value).id) : undefined;
  return raw?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function synchronizeLifecycleConditions(data: JsonRecord, wanted: readonly string[]): JsonRecord {
  const lifecycleIds = new Set(["unconscious", "stable", "dead"]);
  const conditions = (Array.isArray(data.conditions) ? data.conditions : []).filter((condition) => {
    const id = normalizedConditionId(condition);
    return !id || !lifecycleIds.has(id);
  });
  for (const id of wanted) conditions.push({ id });
  return { ...data, conditions };
}

function combatantWithLifecycle(
  combatant: Combatant,
  actor: Actor,
  lifeState: string,
  successes: number,
  failures: number
): Combatant {
  const lifecycleIds = new Set(["unconscious", "stable", "dead"]);
  const actorLifecycleConditions = (Array.isArray(actor.data.conditions) ? actor.data.conditions : [])
    .map(normalizedConditionId)
    .filter((id): id is string => Boolean(id) && lifecycleIds.has(id!));
  const conditions = [
    ...(combatant.conditions ?? []).filter((condition) => {
      const id = normalizedConditionId(condition.split(":")[0]);
      return !id || !lifecycleIds.has(id);
    }),
    ...actorLifecycleConditions
  ];
  const { deathSaveSuccesses: _successes, deathSaveFailures: _failures, deathSaveOutcome: _outcome, ...base } = combatant;
  const defeated = lifeState === "dead" || lifeState === "defeated" || actor.data.defeated === true;
  const after: Combatant = { ...base, defeated, conditions: [...new Set(conditions)] };
  if (actor.type.toLocaleLowerCase() === "character" && lifeState !== "conscious") {
    after.deathSaveSuccesses = successes;
    after.deathSaveFailures = failures;
    if (lifeState === "stable") after.deathSaveOutcome = "stable";
    if (lifeState === "dead") after.deathSaveOutcome = "dead";
  }
  return after;
}

/**
 * Normalizes one actor's zero-HP/death/stability state and returns complete
 * actor-data and combatant replacements. This is pure and safe to preview.
 */
export function synchronizeDnd5eSrdActorCombatState(
  actorInput: Actor,
  combatant?: Combatant
): Dnd5eSrdActorCombatStateSynchronization {
  const actor = cloneActor(actorInput);
  const hp = recordValue(actor.data.hp);
  if (typeof hp.current !== "number" || !Number.isFinite(hp.current)) return {};
  const currentHp = Math.max(0, Math.floor(hp.current));
  const character = actor.type.toLocaleLowerCase() === "character";
  const actorDeathSaves = recordValue(actor.data.deathSaves);
  let successes = Math.max(boundedCounter(actorDeathSaves.successes), boundedCounter(combatant?.deathSaveSuccesses));
  let failures = Math.max(boundedCounter(actorDeathSaves.failures), boundedCounter(combatant?.deathSaveFailures));
  const storedState = typeof actor.data.lifeState === "string" ? actor.data.lifeState.trim().toLocaleLowerCase() : "";
  let lifeState: "conscious" | "unconscious" | "stable" | "dead" | "defeated";
  let lifecycleConditions: string[];

  if (currentHp > 0 && storedState === "dead") {
    lifeState = "dead";
    failures = 3;
    lifecycleConditions = ["dead"];
  } else if (currentHp > 0) {
    lifeState = "conscious";
    successes = 0;
    failures = 0;
    lifecycleConditions = [];
  } else if (!character) {
    lifeState = "defeated";
    successes = 0;
    failures = 0;
    lifecycleConditions = ["unconscious"];
  } else if (storedState === "dead" || failures >= 3 || combatant?.deathSaveOutcome === "dead") {
    lifeState = "dead";
    failures = 3;
    lifecycleConditions = ["dead"];
  } else if (storedState === "stable" || successes >= 3 || combatant?.deathSaveOutcome === "stable") {
    lifeState = "stable";
    successes = 3;
    lifecycleConditions = ["unconscious", "stable"];
  } else {
    lifeState = "unconscious";
    lifecycleConditions = ["unconscious"];
  }

  let data = synchronizeLifecycleConditions(actor.data, lifecycleConditions);
  data = {
    ...data,
    hp: { ...hp, current: currentHp },
    deathSaves: { successes, failures },
    lifeState,
    defeated: lifeState === "dead" || lifeState === "defeated"
  };
  actor.data = data;
  const reason = "hit-point-lifecycle";
  const actorChanged = JSON.stringify(actorInput.data) !== JSON.stringify(data);
  const afterCombatant = combatant ? combatantWithLifecycle(combatant, actor, lifeState, successes, failures) : undefined;
  const combatantChanged = Boolean(combatant && afterCombatant && JSON.stringify(combatant) !== JSON.stringify(afterCombatant));
  return {
    ...(actorChanged ? {
      actorUpdate: { actorId: actor.id, before: cloneRecord(actorInput.data), after: data, reason },
      actorDataPatch: { actorId: actor.id, data, reason }
    } : {}),
    ...(combatantChanged && combatant && afterCombatant ? {
      combatantUpdate: { combatantId: combatant.id, actorId: actor.id, before: { ...combatant }, after: afterCombatant, reason }
    } : {})
  };
}

function actorsAfterUpdates(actors: Actor[], updates: RulesResolutionActorUpdate[]): Actor[] {
  const byId = new Map(updates.map((update) => [update.actorId, update.after]));
  return actors.map((actor) => ({ ...actor, data: cloneRecord(byId.get(actor.id) ?? actor.data) }));
}

function mergeActorUpdates(originalActors: Actor[], finalActors: Actor[], reasons: Map<string, string[]>): RulesResolutionActorUpdate[] {
  const finalById = new Map(finalActors.map((actor) => [actor.id, actor]));
  return originalActors.flatMap((actor) => {
    const after = finalById.get(actor.id)?.data;
    if (!after || JSON.stringify(actor.data) === JSON.stringify(after)) return [];
    const actorReasons = [...new Set(reasons.get(actor.id) ?? ["combat-rules-progression"])];
    return [{ actorId: actor.id, before: cloneRecord(actor.data), after: cloneRecord(after), reason: actorReasons.join("+") }];
  });
}

/**
 * Advances one authoritative combat timing phase as a single pure transaction:
 * schedules, zero-HP normalization, concentration/expiry cleanup, linked target
 * cleanup, and combatant death-state synchronization.
 */
export function advanceDnd5eSrdCombatRules(
  input: Dnd5eSrdCombatRulesProgressionInput
): Dnd5eSrdCombatRulesProgressionResult {
  const reasons = new Map<string, string[]>();
  const noteReasons = (updates: RulesResolutionActorUpdate[]): void => {
    for (const update of updates) reasons.set(update.actorId, [...(reasons.get(update.actorId) ?? []), update.reason]);
  };

  const schedule = evaluateDnd5eSrdEffectSchedules(input.actors, input.combat, {
    phase: input.phase,
    now: input.now,
    ...(input.saveOutcomes ? { saveOutcomes: input.saveOutcomes } : {})
  });
  noteReasons(schedule.actorUpdates);
  let workingActors = actorsAfterUpdates(input.actors, schedule.actorUpdates);

  if (input.phase === "start_turn") {
    const activeActorId = input.combat.combatants[input.combat.turnIndex]?.actorId;
    if (activeActorId) {
      workingActors = workingActors.map((actor) => {
        if (actor.id !== activeActorId) return actor;
        let data = actor.data;
        const rulesEngine = recordValue(data.rulesEngine);
        const reactions = recordValue(rulesEngine.reactions);
        const actionEconomy = recordValue(rulesEngine.actionEconomy);
        if (Object.keys(reactions).length > 0 || Object.keys(recordValue(actionEconomy.bonusActions)).length > 0) {
          data = {
            ...data,
            rulesEngine: {
              ...rulesEngine,
              reactions: {},
              actionEconomy: { ...actionEconomy, bonusActions: {} }
            }
          };
          reasons.set(actor.id, [...(reasons.get(actor.id) ?? []), "turn-action-economy-refresh"]);
        }
        const actorAtTurnStart = { ...actor, data };
        if (data.heroicInspiration === true) return actorAtTurnStart;
        const features = Array.isArray(actor.data.features) ? actor.data.features.filter((feature): feature is string => typeof feature === "string") : [];
        if (!features.includes("Heroic Warrior")) return actorAtTurnStart;
        reasons.set(actor.id, [...(reasons.get(actor.id) ?? []), "heroic-warrior"]);
        return { ...actor, data: grantDnd5eSrdHeroicInspiration(actorAtTurnStart).actorData };
      });
    }
  }

  const initialCombatantUpdates = new Map<string, Dnd5eSrdCombatantStateUpdate>();
  const normalizedActors = workingActors.map((actor) => {
    const synchronization = synchronizeDnd5eSrdActorCombatState(actor, input.combat.combatants.find((combatant) => combatant.actorId === actor.id));
    if (synchronization.actorUpdate) {
      noteReasons([synchronization.actorUpdate]);
      return { ...actor, data: synchronization.actorUpdate.after };
    }
    if (synchronization.combatantUpdate) initialCombatantUpdates.set(actor.id, synchronization.combatantUpdate);
    return actor;
  });
  // Synchronization may return both updates; collect combatant replacements in a
  // separate pass so an actor-data change never hides the corresponding patch.
  for (const actor of normalizedActors) {
    const originalCombatant = input.combat.combatants.find((combatant) => combatant.actorId === actor.id);
    if (!originalCombatant) continue;
    const synchronization = synchronizeDnd5eSrdActorCombatState(actor, originalCombatant);
    if (synchronization.combatantUpdate) initialCombatantUpdates.set(actor.id, synchronization.combatantUpdate);
  }
  workingActors = normalizedActors;

  const lifecycle = advanceDnd5eSrdEffectLifecycle(workingActors, input.combat, { phase: input.phase, now: input.now });
  noteReasons(lifecycle.actorUpdates);
  workingActors = actorsAfterUpdates(workingActors, lifecycle.actorUpdates);

  const actorUpdates = mergeActorUpdates(input.actors, workingActors, reasons);
  const actorDataPatches = actorUpdates.map((update) => ({ actorId: update.actorId, data: cloneRecord(update.after), reason: update.reason }));
  const combatantUpdates = new Map(initialCombatantUpdates);
  for (const actor of workingActors) {
    const combatant = input.combat.combatants.find((candidate) => candidate.actorId === actor.id);
    if (!combatant) continue;
    const synchronization = synchronizeDnd5eSrdActorCombatState(actor, combatant);
    if (synchronization.combatantUpdate) combatantUpdates.set(actor.id, synchronization.combatantUpdate);
  }

  return {
    phase: input.phase,
    round: input.combat.round,
    turnIndex: input.combat.turnIndex,
    events: schedule.events,
    unresolvedEventIds: schedule.unresolvedEventIds,
    canApply: schedule.canApply,
    actorUpdates,
    actorDataPatches,
    combatantUpdates: [...combatantUpdates.values()],
    concentrationCleanups: lifecycle.concentrationCleanups,
    lifecycleChanges: lifecycle.changes
  };
}
