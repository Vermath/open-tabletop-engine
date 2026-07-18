import type { Actor, Combat, CombatLegendaryActionPrompt } from "@open-tabletop/core";
import type { Dnd5eSrdLegendaryActions } from "./dnd-monster-stat-blocks.js";
import type { RulesResolutionActorUpdate } from "./dnd-resolution-types.js";

type JsonRecord = Record<string, unknown>;

export interface Dnd5eSrdLegendaryActionLedger {
  maximumUses: number;
  remainingUses: number;
  resetRound: number;
  resetTurnIndex: number;
  spent: Array<{ optionName: string; cost: number; round: number; afterTurnIndex: number; usedAt: string }>;
}

export interface Dnd5eSrdLegendaryActionProgression {
  actorUpdates: RulesResolutionActorUpdate[];
  prompts: CombatLegendaryActionPrompt[];
}

export type Dnd5eSrdLegendaryActionSpendOutcome =
  | { ok: true; data: JsonRecord; remainingUses: number; maximumUses: number }
  | { ok: false; code: "legendary_actions_unavailable" | "legendary_action_incapacitated" | "legendary_action_invalid_cost" | "legendary_action_exhausted"; reason: string };

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function clone(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function conditionId(value: unknown): string | undefined {
  const raw = typeof value === "string" ? value : text(record(value).id);
  return raw?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function incapacitated(actor: Actor): boolean {
  return (Array.isArray(actor.data.conditions) ? actor.data.conditions : []).some((condition) => ["incapacitated", "unconscious", "paralyzed", "petrified", "stunned", "dead"].includes(conditionId(condition) ?? ""));
}

/** Returns only fully structured source metadata; arbitrary prose is never executed. */
export function dnd5eSrdLegendaryActionsForActor(actor: Actor): Dnd5eSrdLegendaryActions | undefined {
  const raw = record(record(record(actor.data.monster).statBlock).legendaryActions);
  const uses = integer(raw.uses, 0);
  if (uses < 1) return undefined;
  const inLairUses = integer(raw.inLairUses, 0);
  const options = Array.isArray(raw.options) ? raw.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim()) : [];
  return {
    uses,
    ...(inLairUses > 0 ? { inLairUses } : {}),
    options,
    resolution: "reviewed-manual"
  };
}

function maximumUses(actor: Actor, profile: Dnd5eSrdLegendaryActions): number {
  const monster = record(actor.data.monster);
  return monster.inLair === true && profile.inLairUses ? profile.inLairUses : profile.uses;
}

function storedLedger(data: JsonRecord, combatId: string, maximum: number): Dnd5eSrdLegendaryActionLedger | undefined {
  const stored = record(record(record(data.rulesEngine).legendaryActions)[combatId]);
  if (Object.keys(stored).length === 0) return undefined;
  return {
    maximumUses: Math.max(1, integer(stored.maximumUses, maximum)),
    remainingUses: Math.max(0, Math.min(maximum, integer(stored.remainingUses, maximum))),
    resetRound: Math.max(0, integer(stored.resetRound, 0)),
    resetTurnIndex: Math.max(0, integer(stored.resetTurnIndex, 0)),
    spent: Array.isArray(stored.spent) ? stored.spent.flatMap((raw) => {
      const use = record(raw);
      const optionName = text(use.optionName);
      const cost = integer(use.cost, 0);
      const usedAt = text(use.usedAt);
      return optionName && cost > 0 && usedAt ? [{ optionName, cost, round: Math.max(0, integer(use.round, 0)), afterTurnIndex: Math.max(0, integer(use.afterTurnIndex, 0)), usedAt }] : [];
    }).slice(-100) : []
  };
}

function withLedger(data: JsonRecord, combatId: string, ledger: Dnd5eSrdLegendaryActionLedger): JsonRecord {
  const next = clone(data);
  const rulesEngine = { ...record(next.rulesEngine) };
  rulesEngine.legendaryActions = { ...record(rulesEngine.legendaryActions), [combatId]: ledger };
  next.rulesEngine = rulesEngine;
  return next;
}

function ensuredLedger(actor: Actor, combat: Pick<Combat, "id" | "round" | "turnIndex">, reset: boolean): Dnd5eSrdLegendaryActionLedger | undefined {
  const profile = dnd5eSrdLegendaryActionsForActor(actor);
  if (!profile) return undefined;
  const maximum = maximumUses(actor, profile);
  const current = storedLedger(actor.data, combat.id, maximum);
  if (!current || reset) return { maximumUses: maximum, remainingUses: maximum, resetRound: combat.round, resetTurnIndex: combat.turnIndex, spent: current?.spent ?? [] };
  return { ...current, maximumUses: maximum, remainingUses: Math.min(maximum, current.remainingUses) };
}

function promptFor(actor: Actor, combatantId: string, combat: Pick<Combat, "id" | "round" | "turnIndex">, ledger: Dnd5eSrdLegendaryActionLedger, now: string): CombatLegendaryActionPrompt {
  const profile = dnd5eSrdLegendaryActionsForActor(actor)!;
  return {
    id: `legendary:${combat.id}:${combat.round}:${combat.turnIndex}:${actor.id}`,
    actorId: actor.id,
    combatantId,
    actorName: actor.name,
    round: combat.round,
    afterTurnIndex: combat.turnIndex,
    remainingUses: ledger.remainingUses,
    maximumUses: ledger.maximumUses,
    options: [...profile.options],
    resolution: "reviewed-manual",
    createdAt: now,
    updatedAt: now
  };
}

/** Resets on the legendary creature's own turn and emits prompts only at another creature's end-turn boundary. */
export function advanceDnd5eSrdLegendaryActions(
  actors: Actor[],
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants">,
  phase: "start_turn" | "end_turn",
  now: string
): Dnd5eSrdLegendaryActionProgression {
  const activeActorId = combat.combatants[combat.turnIndex]?.actorId;
  const actorUpdates: RulesResolutionActorUpdate[] = [];
  const prompts: CombatLegendaryActionPrompt[] = [];
  for (const actor of actors) {
    const combatant = combat.combatants.find((candidate) => candidate.actorId === actor.id);
    if (!combatant || combatant.defeated) continue;
    const profile = dnd5eSrdLegendaryActionsForActor(actor);
    if (!profile) continue;
    const reset = phase === "start_turn" && activeActorId === actor.id;
    const shouldOffer = phase === "end_turn" && activeActorId !== actor.id && !incapacitated(actor);
    if (!reset && !shouldOffer) continue;
    const ledger = ensuredLedger(actor, combat, reset);
    if (!ledger) continue;
    const after = withLedger(actor.data, combat.id, ledger);
    if (JSON.stringify(actor.data) !== JSON.stringify(after)) actorUpdates.push({ actorId: actor.id, before: clone(actor.data), after, reason: reset ? "legendary-actions-reset" : "legendary-actions-initialized" });
    if (shouldOffer && ledger.remainingUses > 0) prompts.push(promptFor(actor, combatant.id, combat, ledger, now));
  }
  return { actorUpdates, prompts };
}

/** Pure reviewed spend; selection/targeting/effects are intentionally not auto-resolved. */
export function spendDnd5eSrdLegendaryAction(
  actor: Actor,
  combat: Pick<Combat, "id" | "round" | "turnIndex">,
  input: { optionName: string; cost: number; usedAt: string }
): Dnd5eSrdLegendaryActionSpendOutcome {
  const profile = dnd5eSrdLegendaryActionsForActor(actor);
  if (!profile) return { ok: false, code: "legendary_actions_unavailable", reason: `${actor.name} has no structured legendary-action economy.` };
  if (incapacitated(actor)) return { ok: false, code: "legendary_action_incapacitated", reason: `${actor.name} cannot use legendary actions while incapacitated.` };
  const maximum = maximumUses(actor, profile);
  const ledger = storedLedger(actor.data, combat.id, maximum);
  if (!ledger) return { ok: false, code: "legendary_actions_unavailable", reason: "Legendary actions have not been initialized for this combat." };
  if (!Number.isInteger(input.cost) || input.cost < 1 || input.cost > maximum) return { ok: false, code: "legendary_action_invalid_cost", reason: `Legendary-action cost must be an integer from 1 to ${maximum}.` };
  if (ledger.remainingUses < input.cost) return { ok: false, code: "legendary_action_exhausted", reason: `${actor.name} has ${ledger.remainingUses} legendary action use${ledger.remainingUses === 1 ? "" : "s"} remaining.` };
  const optionName = input.optionName.trim();
  if (!optionName || optionName.length > 120) return { ok: false, code: "legendary_actions_unavailable", reason: "A reviewed legendary-action option name is required." };
  const remainingUses = ledger.remainingUses - input.cost;
  const nextLedger = {
    ...ledger,
    remainingUses,
    spent: [...ledger.spent, { optionName, cost: input.cost, round: combat.round, afterTurnIndex: combat.turnIndex, usedAt: input.usedAt }].slice(-100)
  };
  return { ok: true, data: withLedger(actor.data, combat.id, nextLedger), remainingUses, maximumUses: ledger.maximumUses };
}
