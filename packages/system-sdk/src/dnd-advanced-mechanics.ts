import type {
  Actor,
  Combat,
  CombatEnvironmentMechanic,
  RulesEffectSchedule,
  RulesEffectScheduleEvent,
  RulesEffectScheduleTiming
} from "@open-tabletop/core";
import type { RulesResolutionActorUpdate } from "./dnd-resolution-types.js";

type JsonRecord = Record<string, unknown>;

export interface Dnd5eSrdEffectScheduleEvaluationInput {
  phase: RulesEffectScheduleTiming;
  now: string;
  saveOutcomes?: Record<string, "success" | "failure">;
}

export interface Dnd5eSrdEffectScheduleEvaluation {
  phase: RulesEffectScheduleTiming;
  round: number;
  turnIndex: number;
  events: RulesEffectScheduleEvent[];
  actorUpdates: RulesResolutionActorUpdate[];
  unresolvedEventIds: string[];
  canApply: boolean;
}

export interface Dnd5eSrdSpellHelperPreviewInput {
  spell: { id: string; name: string; data: JsonRecord };
  casterActorId: string;
  targetActorIds: string[];
  slotLevel: number;
  currentRound?: number;
  options?: {
    dartAssignments?: Record<string, number>;
    roundsHeld?: number;
  };
}

export interface Dnd5eSrdSpellHelperRoll {
  label: string;
  formula: string;
  targetActorId?: string;
  save?: { ability: string; success?: string };
}

export interface Dnd5eSrdSpellHelperScheduleTemplate {
  targetActorId: string;
  label: string;
  schedule: RulesEffectSchedule;
  conditionIds?: string[];
}

export interface Dnd5eSrdSpellHelperPreview {
  spellId: string;
  spellName: string;
  supported: boolean;
  automation: "preview_only" | "schedule_template" | "manual";
  summary: string;
  targetLimit?: number;
  rolls: Dnd5eSrdSpellHelperRoll[];
  scheduleTemplates: Dnd5eSrdSpellHelperScheduleTemplate[];
  manualSteps: string[];
  warnings: string[];
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function cloneRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, Math.floor(numberValue(value) ?? fallback));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function conditionId(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : stringValue(recordValue(value).id);
  return raw?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function scheduleForEffect(effect: JsonRecord): RulesEffectSchedule | undefined {
  const raw = recordValue(effect.schedule);
  const timing = stringValue(raw.timing);
  if (!timing || !["start_turn", "end_turn", "start_round", "end_round", "initiative_count", "time", "manual"].includes(timing)) return undefined;
  return {
    timing: timing as RulesEffectScheduleTiming,
    ...(stringValue(raw.anchorActorId) ? { anchorActorId: stringValue(raw.anchorActorId) } : {}),
    ...(numberValue(raw.initiativeCount) !== undefined ? { initiativeCount: numberValue(raw.initiativeCount) } : {}),
    ...(numberValue(raw.nextRound) !== undefined ? { nextRound: Math.max(1, Math.floor(numberValue(raw.nextRound)!)) } : {}),
    ...(numberValue(raw.intervalRounds) !== undefined ? { intervalRounds: positiveInteger(raw.intervalRounds, 1) } : {}),
    ...(numberValue(raw.remainingTriggers) !== undefined ? { remainingTriggers: Math.max(0, Math.floor(numberValue(raw.remainingTriggers)!)) } : {}),
    ...(numberValue(raw.expiresAtRound) !== undefined ? { expiresAtRound: Math.max(1, Math.floor(numberValue(raw.expiresAtRound)!)) } : {}),
    ...(stringValue(raw.expiresAt) ? { expiresAt: stringValue(raw.expiresAt) } : {}),
    ...(stringValue(recordValue(raw.repeatSave).ability)
      ? {
          repeatSave: {
            ability: stringValue(recordValue(raw.repeatSave).ability)!,
            ...(numberValue(recordValue(raw.repeatSave).dc) !== undefined ? { dc: numberValue(recordValue(raw.repeatSave).dc) } : {}),
            endsOn: recordValue(raw.repeatSave).endsOn === "failure" ? "failure" : "success"
          }
        }
      : {})
  };
}

function eventId(effectId: string, actorId: string, combat: Pick<Combat, "round" | "turnIndex">, phase: RulesEffectScheduleTiming): string {
  return `effect-event:${effectId}:${actorId}:${combat.round}:${combat.turnIndex}:${phase}`;
}

function phaseMatchesActor(schedule: RulesEffectSchedule, combat: Pick<Combat, "turnIndex" | "combatants">): boolean {
  if (schedule.timing !== "start_turn" && schedule.timing !== "end_turn") return true;
  if (!schedule.anchorActorId) return true;
  return combat.combatants[combat.turnIndex]?.actorId === schedule.anchorActorId;
}

function initiativeCountIsCurrent(schedule: RulesEffectSchedule, combat: Pick<Combat, "turnIndex" | "combatants">): boolean {
  if (schedule.timing !== "initiative_count") return true;
  if (schedule.initiativeCount === undefined) return false;
  const current = combat.combatants[combat.turnIndex];
  if (!current || current.initiative > schedule.initiativeCount) return false;
  const previous = combat.turnIndex > 0 ? combat.combatants[combat.turnIndex - 1] : undefined;
  return !previous || previous.initiative > schedule.initiativeCount;
}

function effectExpired(
  effect: JsonRecord,
  schedule: RulesEffectSchedule | undefined,
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">,
  phase: RulesEffectScheduleTiming,
  now: string
): boolean {
  const expiresAtRound = numberValue(effect.expiresAtRound) ?? schedule?.expiresAtRound;
  const expiresAt = stringValue(effect.expiresAt) ?? schedule?.expiresAt;
  if (expiresAt) {
    const expiryMs = Date.parse(expiresAt);
    const nowMs = Date.parse(now);
    if (Number.isFinite(expiryMs) && Number.isFinite(nowMs) && expiryMs <= nowMs) return true;
  }
  if (expiresAtRound === undefined || combat.round < expiresAtRound) return false;
  if (combat.round > expiresAtRound) return true;
  const explicitTiming = stringValue(effect.expiresAtTiming) ?? stringValue(effect.expiresAtPhase);
  const expiryTiming = (explicitTiming ?? schedule?.timing ?? "start_round") as RulesEffectScheduleTiming;
  if (phase !== expiryTiming) return false;
  if (schedule && !phaseMatchesActor(schedule, combat)) return false;
  if (schedule && !initiativeCountIsCurrent(schedule, combat)) return false;
  return true;
}

function removeOwnedConditions(data: JsonRecord, removed: JsonRecord, remaining: JsonRecord[]): JsonRecord {
  const owned = stringArray(removed.ownedConditionIds);
  if (owned.length === 0 || !Array.isArray(data.conditions)) return data;
  const remainingOwned = new Set(remaining.flatMap((effect) => stringArray(effect.ownedConditionIds)));
  const removable = new Set(owned.filter((id) => !remainingOwned.has(id)));
  data.conditions = data.conditions.filter((condition) => {
    const id = conditionId(condition);
    return !id || !removable.has(id);
  });
  return data;
}

function removeEffect(data: JsonRecord, effectId: string): JsonRecord {
  const next = cloneRecord(data);
  const rules = cloneRecord(recordValue(next.rulesEngine));
  const effects = Array.isArray(rules.activeEffects) ? rules.activeEffects.map((effect) => cloneRecord(recordValue(effect))) : [];
  const removed = effects.find((effect) => stringValue(effect.id) === effectId);
  if (!removed) return next;
  const remaining = effects.filter((effect) => stringValue(effect.id) !== effectId);
  rules.activeEffects = remaining;
  next.rulesEngine = rules;
  return removeOwnedConditions(next, removed, remaining);
}

/**
 * Evaluates one explicit timing phase. It only removes or reschedules typed effects;
 * ambiguous damage, movement, and targeting remain visible manual steps for the DM.
 */
export function evaluateDnd5eSrdEffectSchedules(
  actors: Actor[],
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">,
  input: Dnd5eSrdEffectScheduleEvaluationInput
): Dnd5eSrdEffectScheduleEvaluation {
  const now = new Date(input.now).toISOString();
  const events: RulesEffectScheduleEvent[] = [];
  const actorUpdates: RulesResolutionActorUpdate[] = [];
  const unresolvedEventIds: string[] = [];

  for (const actor of actors) {
    const before = cloneRecord(actor.data);
    let after = cloneRecord(actor.data);
    const rules = recordValue(after.rulesEngine);
    const effects = Array.isArray(rules.activeEffects) ? rules.activeEffects.map((effect) => cloneRecord(recordValue(effect))) : [];

    for (const originalEffect of effects) {
      const effectIdValue = stringValue(originalEffect.id);
      if (!effectIdValue) continue;
      const label = stringValue(originalEffect.label) ?? stringValue(originalEffect.name) ?? effectIdValue;
      const schedule = scheduleForEffect(originalEffect);
      const id = eventId(effectIdValue, actor.id, combat, input.phase);
      const baseEvent = {
        id,
        effectId: effectIdValue,
        actorId: actor.id,
        label,
        phase: input.phase,
        round: combat.round,
        turnIndex: combat.turnIndex,
        createdAt: now,
        updatedAt: now
      };

      if (effectExpired(originalEffect, schedule, combat, input.phase, now)) {
        after = removeEffect(after, effectIdValue);
        events.push({ ...baseEvent, status: "expired" });
        continue;
      }
      if (!schedule || schedule.timing !== input.phase) continue;
      if ((schedule.nextRound ?? combat.round) > combat.round || !phaseMatchesActor(schedule, combat) || !initiativeCountIsCurrent(schedule, combat)) continue;

      if (schedule.repeatSave) {
        const outcome = input.saveOutcomes?.[id];
        if (!outcome) {
          unresolvedEventIds.push(id);
          events.push({
            ...baseEvent,
            status: "save_required",
            saveAbility: schedule.repeatSave.ability,
            ...(schedule.repeatSave.dc !== undefined ? { saveDc: schedule.repeatSave.dc } : {})
          });
          continue;
        }
        const ends = outcome === schedule.repeatSave.endsOn;
        events.push({
          ...baseEvent,
          status: outcome === "success" ? "save_succeeded" : "save_failed",
          saveAbility: schedule.repeatSave.ability,
          ...(schedule.repeatSave.dc !== undefined ? { saveDc: schedule.repeatSave.dc } : {}),
          outcome
        });
        if (ends) {
          after = removeEffect(after, effectIdValue);
          continue;
        }
      } else {
        events.push({ ...baseEvent, status: "triggered" });
      }

      const afterRules = cloneRecord(recordValue(after.rulesEngine));
      const afterEffects = Array.isArray(afterRules.activeEffects) ? afterRules.activeEffects.map((effect) => cloneRecord(recordValue(effect))) : [];
      const effect = afterEffects.find((candidate) => stringValue(candidate.id) === effectIdValue);
      if (!effect) continue;
      const nextSchedule = { ...recordValue(effect.schedule) };
      if (schedule.remainingTriggers !== undefined) {
        const remaining = Math.max(0, schedule.remainingTriggers - 1);
        if (remaining === 0) {
          after = removeEffect(after, effectIdValue);
          continue;
        }
        nextSchedule.remainingTriggers = remaining;
      }
      nextSchedule.nextRound = combat.round + (schedule.intervalRounds ?? 1);
      effect.schedule = nextSchedule;
      afterRules.activeEffects = afterEffects;
      after.rulesEngine = afterRules;
    }

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      actorUpdates.push({ actorId: actor.id, before, after, reason: `effect-schedule:${input.phase}` });
    }
  }

  return {
    phase: input.phase,
    round: combat.round,
    turnIndex: combat.turnIndex,
    events,
    actorUpdates,
    unresolvedEventIds,
    canApply: unresolvedEventIds.length === 0
  };
}

export function combatEnvironmentMechanicDue(
  mechanic: CombatEnvironmentMechanic,
  combat: Pick<Combat, "round" | "turnIndex" | "combatants">
): boolean {
  if (!mechanic.enabled || mechanic.schedule.timing === "manual" || combat.round < mechanic.schedule.startsAtRound) return false;
  if ((combat.round - mechanic.schedule.startsAtRound) % mechanic.schedule.intervalRounds !== 0) return false;
  if (mechanic.lastTriggeredRound === combat.round) return false;
  if (mechanic.schedule.timing === "round_start") return combat.turnIndex === 0;
  if (mechanic.schedule.timing === "round_end") return combat.turnIndex === Math.max(0, combat.combatants.length - 1);
  if (mechanic.schedule.initiativeCount === undefined) return false;
  const current = combat.combatants[combat.turnIndex];
  if (!current || current.initiative > mechanic.schedule.initiativeCount) return false;
  const previous = combat.turnIndex > 0 ? combat.combatants[combat.turnIndex - 1] : undefined;
  return !previous || previous.initiative > mechanic.schedule.initiativeCount;
}

function addUpcastDice(baseFormula: string, upcastFormula: string | undefined, levels: number): string {
  if (!upcastFormula || levels <= 0) return baseFormula;
  return `${baseFormula}+${levels}${upcastFormula.replace(/^\d+/, "")}`;
}

export function previewDnd5eSrdSpellHelper(input: Dnd5eSrdSpellHelperPreviewInput): Dnd5eSrdSpellHelperPreview {
  const base = {
    spellId: input.spell.id,
    spellName: input.spell.name,
    rolls: [] as Dnd5eSrdSpellHelperRoll[],
    scheduleTemplates: [] as Dnd5eSrdSpellHelperScheduleTemplate[],
    manualSteps: [] as string[],
    warnings: [] as string[]
  };
  const spellLevel = positiveInteger(input.spell.data.level, 1);
  const slotLevel = Math.max(spellLevel, Math.floor(input.slotLevel));
  const currentRound = Math.max(1, Math.floor(input.currentRound ?? 1));

  if (input.spell.id === "magic-missile") {
    const dartCount = 3 + Math.max(0, slotLevel - 1);
    const assignments = input.options?.dartAssignments ?? {};
    const assigned = Object.values(assignments).reduce((total, count) => total + Math.max(0, Math.floor(count)), 0);
    const targetActorIds = [...new Set(input.targetActorIds)];
    if (targetActorIds.length === 0) base.warnings.push("Choose at least one visible target before using the allocation helper.");
    if (assigned !== 0 && assigned !== dartCount) base.warnings.push(`Dart assignments total ${assigned}; exactly ${dartCount} darts are available.`);
    const normalized = assigned === dartCount
      ? targetActorIds.map((targetActorId) => ({ targetActorId, count: Math.max(0, Math.floor(assignments[targetActorId] ?? 0)) })).filter((entry) => entry.count > 0)
      : targetActorIds.slice(0, dartCount).map((targetActorId, index) => ({ targetActorId, count: index === 0 ? dartCount - Math.max(0, targetActorIds.length - 1) : 1 }));
    return {
      ...base,
      supported: true,
      automation: "preview_only",
      summary: `${dartCount} darts allocated across ${normalized.length} target${normalized.length === 1 ? "" : "s"}.`,
      targetLimit: dartCount,
      rolls: normalized.map(({ targetActorId, count }) => ({ label: `${count} Magic Missile dart${count === 1 ? "" : "s"}`, formula: `${count}d4+${count}`, targetActorId })),
      manualSteps: ["Confirm every target is visible and in range.", "Apply each target's force damage simultaneously; Shield can negate the spell."]
    };
  }

  if (input.spell.id === "bless") {
    const targetLimit = 3 + Math.max(0, slotLevel - 1);
    if (input.targetActorIds.length > targetLimit) base.warnings.push(`Choose at most ${targetLimit} targets at slot level ${slotLevel}.`);
    return {
      ...base,
      supported: true,
      automation: "schedule_template",
      summary: `Bless up to ${targetLimit} targets with concentration for 10 rounds.`,
      targetLimit,
      scheduleTemplates: [...new Set(input.targetActorIds)].slice(0, targetLimit).map((targetActorId) => ({
        targetActorId,
        label: "Bless",
        conditionIds: ["blessed"],
        schedule: { timing: "manual", expiresAtRound: currentRound + 10 }
      })),
      manualSteps: ["Confirm targets are in range when cast.", "Link every target effect to the caster's concentration record."]
    };
  }

  if (input.spell.id === "moonbeam") {
    const baseFormula = stringValue(input.spell.data.damageFormula) ?? "2d10";
    const formula = addUpcastDice(baseFormula, stringValue(input.spell.data.upcastFormula), Math.max(0, slotLevel - spellLevel));
    const save = recordValue(input.spell.data.save);
    return {
      ...base,
      supported: true,
      automation: "schedule_template",
      summary: `${formula} radiant damage when a manually selected creature enters or starts its turn in the beam.`,
      rolls: [...new Set(input.targetActorIds)].map((targetActorId) => ({
        label: "Moonbeam damage",
        formula,
        targetActorId,
        save: { ability: stringValue(save.ability) ?? "constitution", success: stringValue(save.success) ?? "half" }
      })),
      scheduleTemplates: [...new Set(input.targetActorIds)].map((targetActorId) => ({
        targetActorId,
        label: "Moonbeam",
        schedule: { timing: "start_turn", anchorActorId: targetActorId, nextRound: currentRound, intervalRounds: 1, remainingTriggers: 10, expiresAtRound: currentRound + 10 }
      })),
      manualSteps: ["Select creatures only when they enter the beam or start their turn there.", "Move the beam manually; this helper does not infer geometry.", "Resolve the Constitution save before applying damage."],
      warnings: ["Once-per-turn entry tracking remains a DM adjudication because token movement can be interrupted or undone."]
    };
  }

  if (input.spell.id === "delayed-blast-fireball") {
    const roundsHeld = Math.max(0, Math.min(10, Math.floor(input.options?.roundsHeld ?? 0)));
    const baseFormula = stringValue(input.spell.data.damageFormula) ?? "12d6";
    const formula = roundsHeld > 0 ? `${baseFormula}+${roundsHeld}d6` : baseFormula;
    const save = recordValue(input.spell.data.save);
    return {
      ...base,
      supported: true,
      automation: "preview_only",
      summary: `${formula} fire damage after ${roundsHeld} completed caster turn${roundsHeld === 1 ? "" : "s"}.`,
      rolls: [{ label: "Delayed Blast Fireball damage", formula, save: { ability: stringValue(save.ability) ?? "dexterity", success: stringValue(save.success) ?? "half" } }],
      manualSteps: ["Confirm the bead remained undetonated through each counted caster turn.", "Select creatures in the final area manually, then resolve Dexterity saves."],
      warnings: ["This preview does not automate bead interaction, forced detonation, or map geometry."]
    };
  }

  return {
    ...base,
    supported: false,
    automation: "manual",
    summary: `No specialized helper is registered for ${input.spell.name}.`,
    manualSteps: ["Use the normal spell action preview and DM adjudication."],
    warnings: ["Unsupported spell helpers never infer or commit effects."]
  };
}
