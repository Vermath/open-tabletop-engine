import type {
  Actor,
  Combat,
  Combatant,
  Item,
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
import { advanceDnd5eSrdLegendaryActions } from "./dnd-legendary-actions.js";
import { dnd5eSrdMonsterZeroHpKnockout, grantDnd5eSrdHeroicInspiration, healDnd5eSrdActorFromZero } from "./dnd-rules-completion.js";
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

export type Dnd5eSrdCombatantActorSynchronization =
  | { ok: true; actorData: JsonRecord; combatant: Combatant }
  | { ok: false; error: string };

export interface Dnd5eSrdCombatRulesProgressionInput extends Dnd5eSrdEffectScheduleEvaluationInput {
  actors: Actor[];
  items?: Item[];
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants">;
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
  /** Non-executable DM opportunities emitted only after another creature's turn. */
  legendaryActionPrompts: NonNullable<Combat["legendaryActionPrompts"]>;
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

function normalizedCombatantConditionId(value: string): string | undefined {
  return normalizedConditionId(value.split(":")[0]);
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
    // Monsters die at 0 HP by default; the explicit per-instance knockout flag opts into unconsciousness.
    lifecycleConditions = dnd5eSrdMonsterZeroHpKnockout(actor.data) ? ["unconscious"] : ["dead"];
  } else if (storedState === "dead" || failures >= 3 || combatant?.deathSaveOutcome === "dead") {
    lifeState = "dead";
    failures = 3;
    lifecycleConditions = ["dead"];
  } else if (storedState === "stable" || successes >= 3 || (combatant?.deathSaveOutcome === "stable" && storedState !== "unconscious")) {
    lifeState = "stable";
    // SRD 5.2.1 resets both counters when a creature becomes Stable. The
    // terminal roll summary retains the just-resolved 3rd success for audit
    // and chat, while persisted actor and combatant state stays canonical.
    successes = 0;
    failures = 0;
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

/**
 * Applies a combatant-originated D&D lifecycle edit to its linked actor, then
 * projects the canonical actor state back to the combatant. Impossible states
 * (for example Stable at positive HP) are rejected instead of being persisted.
 */
export function synchronizeDnd5eSrdCombatantActorState(
  actorInput: Actor,
  combatantInput: Combatant,
  syncedAt: string,
  previousCombatant?: Combatant
): Dnd5eSrdCombatantActorSynchronization {
  const hp = recordValue(actorInput.data.hp);
  if (typeof hp.current !== "number" || !Number.isFinite(hp.current)) {
    return { ok: false, error: "Linked D&D actor must track finite Hit Points before combat lifecycle state can be synchronized" };
  }
  const currentHp = Math.max(0, Math.floor(hp.current));
  const character = actorInput.type.trim().toLowerCase() === "character";
  const successes = boundedCounter(combatantInput.deathSaveSuccesses);
  const failures = boundedCounter(combatantInput.deathSaveFailures);
  const lifecycleConditionIds = new Set(["unconscious", "stable", "dead"]);
  const conditionIds = (combatantInput.conditions ?? []).map(normalizedCombatantConditionId).filter((id): id is string => Boolean(id));
  const lifecycleIds = new Set(conditionIds.filter((id) => lifecycleConditionIds.has(id)));
  const outcome = combatantInput.deathSaveOutcome;
  const actorLifeState = String(actorInput.data.lifeState ?? "").trim().toLowerCase();
  const actorIsDead = actorLifeState === "dead" || actorLifeState === "defeated" || (Array.isArray(actorInput.data.conditions) && actorInput.data.conditions.some((condition) => normalizedConditionId(condition) === "dead"));
  const incomingDead = outcome === "dead" || failures >= 3 || lifecycleIds.has("dead") || combatantInput.defeated;

  if (currentHp > 0 && (combatantInput.defeated || successes > 0 || failures > 0 || outcome !== undefined || lifecycleIds.size > 0)) {
    return { ok: false, error: "A positive-HP actor cannot be Unconscious, Stable, Dead, defeated, or retain Death Saving Throw state" };
  }
  if (actorIsDead && !incomingDead) return { ok: false, error: "A dead actor can only be revived through an explicitly authorized revival effect" };
  if (!character && (successes > 0 || failures > 0 || outcome === "stable" || lifecycleIds.has("stable"))) {
    return { ok: false, error: "Non-character combatants do not make Death Saving Throws or become Stable" };
  }

  let lifeState: "conscious" | "unconscious" | "stable" | "dead" | "defeated";
  if (currentHp > 0) lifeState = "conscious";
  else if (!character) lifeState = "defeated";
  else if (incomingDead) lifeState = "dead";
  else if (outcome === "stable" || successes >= 3 || lifecycleIds.has("stable")) lifeState = "stable";
  else lifeState = "unconscious";

  const previousConditionIds = new Set((previousCombatant?.conditions ?? [])
    .map(normalizedCombatantConditionId)
    .filter((id): id is string => id !== undefined && !lifecycleConditionIds.has(id)));
  const incomingConditionIds = new Set(conditionIds.filter((id) => !lifecycleConditionIds.has(id)));
  const stagedData = cloneRecord(actorInput.data);
  const stagedConditions = (Array.isArray(stagedData.conditions) ? stagedData.conditions : []).filter((condition) => {
    const id = normalizedConditionId(condition);
    if (!id) return true;
    if (lifecycleConditionIds.has(id)) return false;
    return !previousConditionIds.has(id) || incomingConditionIds.has(id);
  });
  const stagedConditionIds = new Set(stagedConditions.map(normalizedConditionId).filter((id): id is string => Boolean(id)));
  for (const id of incomingConditionIds) {
    if (stagedConditionIds.has(id)) continue;
    stagedConditions.push({ id, appliedAt: syncedAt });
    stagedConditionIds.add(id);
  }
  if (lifeState === "unconscious") stagedConditions.push({ id: "unconscious", appliedAt: syncedAt });
  if (lifeState === "stable") stagedConditions.push({ id: "unconscious", appliedAt: syncedAt }, { id: "stable", appliedAt: syncedAt });
  if (lifeState === "dead" || lifeState === "defeated") stagedConditions.push({ id: "dead", appliedAt: syncedAt });

  const staged: Actor = {
    ...actorInput,
    data: {
      ...stagedData,
      conditions: stagedConditions,
      deathSaves: lifeState === "stable" || currentHp > 0 ? { successes: 0, failures: 0 } : { successes, failures },
      lifeState,
      defeated: lifeState === "dead" || lifeState === "defeated"
    }
  };
  const synchronized = synchronizeDnd5eSrdActorCombatState(staged, combatantInput);
  return {
    ok: true,
    actorData: synchronized.actorDataPatch?.data ?? staged.data,
    combatant: synchronized.combatantUpdate?.after ?? combatantInput
  };
}

export type Dnd5eSrdDeathSaveEligibility =
  | { eligible: true }
  | { eligible: false; code: "death_save_not_applicable"; reason: string };

export interface Dnd5eSrdDeathSaveSummary {
  outcome: "success" | "failure" | "critical-success" | "critical-failure";
  /** Counters immediately after the roll, before a Stable result resets persisted counters. */
  successes: number;
  failures: number;
  /** Terminal lifecycle reached by this roll, when one was reached. */
  result?: "revived" | "stable" | "dead";
  hitPointsRestored?: number;
}

/**
 * SRD 5.2.1: only a character at 0 Hit Points that is neither dead nor Stable
 * makes Death Saving Throws. Monsters die at 0 HP by default (see
 * `dnd5eSrdMonsterZeroHpKnockout`); a spared monster is simply Unconscious and
 * never rolls Death Saving Throws.
 */
export function dnd5eSrdDeathSaveEligibility(actor: Pick<Actor, "type" | "name"> & { data: JsonRecord }): Dnd5eSrdDeathSaveEligibility {
  const notApplicable = (reason: string): Dnd5eSrdDeathSaveEligibility => ({ eligible: false, code: "death_save_not_applicable", reason });
  if (actor.type.toLocaleLowerCase() !== "character") {
    return notApplicable(`${actor.name} does not make Death Saving Throws; monsters die at 0 Hit Points unless individually spared`);
  }
  const conditionIds = new Set((Array.isArray(actor.data.conditions) ? actor.data.conditions : []).map(normalizedConditionId).filter((id): id is string => Boolean(id)));
  const lifeState = typeof actor.data.lifeState === "string" ? actor.data.lifeState.trim().toLocaleLowerCase() : "";
  if (lifeState === "dead" || conditionIds.has("dead")) {
    return notApplicable(`${actor.name} is dead; an authorized manual correction is required to change that state`);
  }
  const hp = recordValue(actor.data.hp);
  if (typeof hp.current !== "number" || !Number.isFinite(hp.current)) {
    return notApplicable(`${actor.name} has no tracked Hit Points, so Death Saving Throws cannot resolve`);
  }
  if (hp.current > 0) {
    return notApplicable(`Only a creature at 0 Hit Points makes Death Saving Throws; ${actor.name} has ${Math.floor(hp.current)} HP`);
  }
  if (lifeState === "stable" || conditionIds.has("stable")) {
    return notApplicable(`${actor.name} is Stable and no longer makes Death Saving Throws`);
  }
  return { eligible: true };
}

/**
 * Reads the natural die of the first d20 term from authoritative rolled dice
 * terms (structural match for the dice-engine `RollTerm` shape). Advantage and
 * Disadvantage keep exactly one die, so a single kept value is the natural
 * roll; anything else has no single natural d20.
 */
export function dnd5eSrdNaturalD20FromRollTerms(terms: ReadonlyArray<unknown>): number | undefined {
  for (const term of terms) {
    const record = recordValue(term);
    if (record.type !== "die" || record.sides !== 20) continue;
    const kept = Array.isArray(record.kept) ? record.kept.filter((value): value is number => typeof value === "number") : [];
    if (kept.length === 1) return kept[0];
    const results = Array.isArray(record.results) ? record.results.filter((value): value is number => typeof value === "number") : [];
    return results.length === 1 ? results[0] : undefined;
  }
  return undefined;
}

/**
 * Applies one authoritative Death Saving Throw result as a pure actor-data
 * transition (SRD 5.2.1): 10+ is a success and the third success makes the
 * character Stable; below 10 is a failure and the third failure is death; a
 * natural 1 counts as two failures; a natural 20 restores 1 Hit Point. The
 * result is normalized through `synchronizeDnd5eSrdActorCombatState`, so
 * lifecycle conditions, `lifeState`, `defeated`, and counters stay canonical
 * and healing back above 0 HP resets the saved counters.
 */
export function resolveDnd5eSrdDeathSavingThrowRoll(
  actor: Actor,
  rolled: { total: number; naturalD20?: number }
): { data: JsonRecord; deathSave: Dnd5eSrdDeathSaveSummary } {
  const eligibility = dnd5eSrdDeathSaveEligibility(actor);
  if (!eligibility.eligible) throw new Error(eligibility.reason);
  if (!Number.isFinite(rolled.total)) throw new Error("A Death Saving Throw requires a rolled total");
  const priorSaves = recordValue(actor.data.deathSaves);
  const prior = { successes: boundedCounter(priorSaves.successes), failures: boundedCounter(priorSaves.failures) };
  if (rolled.naturalD20 === 20) {
    const staged: Actor = { ...actor, data: healDnd5eSrdActorFromZero(actor, 1) };
    const synchronized = synchronizeDnd5eSrdActorCombatState(staged);
    return {
      data: synchronized.actorUpdate?.after ?? staged.data,
      deathSave: { outcome: "critical-success", successes: 0, failures: 0, result: "revived", hitPointsRestored: 1 }
    };
  }
  const outcome: Dnd5eSrdDeathSaveSummary["outcome"] = rolled.naturalD20 === 1 ? "critical-failure" : rolled.total >= 10 ? "success" : "failure";
  const successes = Math.min(3, prior.successes + (outcome === "success" ? 1 : 0));
  const failures = Math.min(3, prior.failures + (outcome === "failure" ? 1 : outcome === "critical-failure" ? 2 : 0));
  const staged: Actor = { ...actor, data: { ...cloneRecord(actor.data), deathSaves: { successes, failures } } };
  const synchronized = synchronizeDnd5eSrdActorCombatState(staged);
  const result = failures >= 3 ? ("dead" as const) : successes >= 3 ? ("stable" as const) : undefined;
  return {
    data: synchronized.actorUpdate?.after ?? staged.data,
    deathSave: { outcome, successes, failures, ...(result ? { result } : {}) }
  };
}

/**
 * Action-resolution entry: checks eligibility, then applies the rolled
 * transition when the authoritative rolled result is available (commit path).
 * Without a rolled result it only reports eligibility, so a preview or the
 * pre-roll commit pass never mutates state.
 */
export function applyDnd5eSrdDeathSaveRoll(
  actor: Actor,
  rolled?: { total: number; naturalD20?: number }
): { blocked?: { code: string; reason: string }; resolved?: { data: JsonRecord; deathSave: Dnd5eSrdDeathSaveSummary } } {
  const eligibility = dnd5eSrdDeathSaveEligibility(actor);
  if (!eligibility.eligible) return { blocked: { code: eligibility.code, reason: eligibility.reason } };
  if (!rolled) return {};
  return { resolved: resolveDnd5eSrdDeathSavingThrowRoll(actor, rolled) };
}

/** Compact chat/status suffix for a resolved Death Saving Throw. */
export function dnd5eSrdDeathSaveChatSuffix(save: Dnd5eSrdDeathSaveSummary): string {
  if (save.result === "revived") return "natural 20: regains 1 Hit Point and is conscious";
  if (save.result === "dead") return `third failure: dead (${save.successes}/3 successes, ${save.failures}/3 failures)`;
  if (save.result === "stable") return `third success: Stable (${save.successes}/3 successes, ${save.failures}/3 failures)`;
  const label = save.outcome === "critical-failure" ? "natural 1: two failures" : save.outcome;
  return `${label} (${save.successes}/3 successes, ${save.failures}/3 failures)`;
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
        if (Object.keys(reactions).length > 0 || Object.keys(recordValue(actionEconomy.bonusActions)).length > 0 || Object.keys(recordValue(actionEconomy.standardActions)).length > 0 || Object.keys(recordValue(actionEconomy.continuations)).length > 0) {
          data = {
            ...data,
            rulesEngine: {
              ...rulesEngine,
              reactions: {},
              actionEconomy: { ...actionEconomy, bonusActions: {}, standardActions: {}, continuations: {} }
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

  const lifecycle = advanceDnd5eSrdEffectLifecycle(workingActors, input.combat, { phase: input.phase, now: input.now }, input.items ?? []);
  noteReasons(lifecycle.actorUpdates);
  workingActors = actorsAfterUpdates(workingActors, lifecycle.actorUpdates);

  const legendaryActions = input.phase === "start_turn" || input.phase === "end_turn"
    ? advanceDnd5eSrdLegendaryActions(workingActors, input.combat, input.phase, input.now)
    : { actorUpdates: [], prompts: [] };
  noteReasons(legendaryActions.actorUpdates);
  workingActors = actorsAfterUpdates(workingActors, legendaryActions.actorUpdates);

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
    lifecycleChanges: lifecycle.changes,
    legendaryActionPrompts: legendaryActions.prompts
  };
}
