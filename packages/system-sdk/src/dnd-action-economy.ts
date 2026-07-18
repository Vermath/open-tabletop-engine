import type { Combat, Dnd5eSrdAttackOutcome, Dnd5eSrdCriticalOutcome } from "@open-tabletop/core";
export type { Dnd5eSrdAttackOutcome, Dnd5eSrdCriticalOutcome } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export type Dnd5eSrdActionKind = "action" | "bonusAction" | "reaction" | "free";

export interface Dnd5eSrdActionClassificationIssue {
  field: "action" | "activation" | "actionEconomy" | "classification";
  value: string;
}

function supportedActionEconomyValue(field: Dnd5eSrdActionClassificationIssue["field"], value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (field === "activation") return ["free", "no-action", "on-hit", "follow-up", "bonus", "bonus-action", "reaction"].includes(normalized);
  if (field === "actionEconomy") return ["action", "bonus action", "bonusaction", "reaction", "free"].includes(normalized);
  if (field !== "action") return false;
  if (["action", "magic", "magic action", "hide", "utilize", "study", "search", "action or ritual", "part of the attack action", "replace one attack from the attack action", "no action required"].includes(normalized)) return true;
  if (normalized.includes("bonus") || normalized.includes("reaction")) return true;
  return /^\d+ (?:minute|minutes|hour|hours)(?: or ritual| rite)?$/.test(normalized);
}

/** Strict audit companion to the fail-closed runtime classifier. */
export function dnd5eSrdActionClassificationIssues(roll: { id: string; formula: string; metadata?: Record<string, unknown> }): Dnd5eSrdActionClassificationIssue[] {
  const metadata = record(roll.metadata);
  const fields = ["action", "activation", "actionEconomy"] as const;
  const explicit = fields.flatMap((field) => text(metadata[field]) ? [{ field, value: text(metadata[field])! }] : []);
  const unsupported = explicit.filter(({ field, value }) => !supportedActionEconomyValue(field, value));
  if (unsupported.length > 0) return unsupported;
  if (explicit.length > 0 || metadata.reaction === true || roll.formula === "0" || roll.id.endsWith("-attack") || roll.id === "death-save" || roll.id === "concentration" || roll.id === "initiative" || /^(?:ability|save|skill|tool)-/.test(roll.id)) return [];
  return [{ field: "classification", value: "missing" }];
}

/** Classifies only the economy used by the authoritative resolver. */
export function dnd5eSrdActionKind(roll: { id: string; formula: string; metadata?: Record<string, unknown> }): Dnd5eSrdActionKind {
  if (roll.id === "death-save" || roll.id === "concentration" || roll.id === "initiative" || /^(?:ability|save|skill|tool)-/.test(roll.id)) return "free";
  const metadata = record(roll.metadata);
  const activations = [metadata.action, metadata.activation, metadata.actionEconomy]
    .map((value) => text(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value));
  const explicitActivation = text(metadata.activation)?.toLowerCase();
  if (explicitActivation === "free" || explicitActivation === "no-action" || explicitActivation === "on-hit" || explicitActivation === "follow-up") return "free";
  if (metadata.reaction === true || activations.some((activation) => activation.includes("reaction")) || roll.id.includes("retaliation") || roll.id.includes("cutting-words")) return "reaction";
  if (activations.some((activation) => activation.includes("bonus"))) return "bonusAction";
  if (activations.some((activation) => activation === "free" || activation === "no action required" || activation === "no-action" || activation === "on-hit" || activation === "follow-up")) return "free";
  if (roll.formula === "0" && activations.length === 0) return "free";
  return "action";
}

export interface Dnd5eSrdTurnActionUse {
  rollId: string;
  usedAt: string;
}

/** Persisted per-combat, per-turn standard-Action ledger. */
export interface Dnd5eSrdTurnActionLedger {
  round: number;
  turnIndex: number;
  actorId: string;
  actionsUsed: number;
  actionSurgeGrants: number;
  uses: Dnd5eSrdTurnActionUse[];
  actionSurgeUsedAt?: string;
}

export interface Dnd5eSrdActionEconomyBlocked {
  code: "action_out_of_turn" | "action_already_used" | "action_surge_out_of_turn" | "action_surge_already_used";
  reason: string;
}

export interface Dnd5eSrdActionEconomyAuditEvent {
  code: "action.used" | "action-surge.granted" | "continuation.armed" | "continuation.consumed";
  actorId: string;
  rollId: string;
  message: string;
  data: Record<string, unknown>;
}

export interface Dnd5eSrdActionEconomyResult {
  data: JsonRecord;
  ledger?: Dnd5eSrdTurnActionLedger;
  blocked?: Dnd5eSrdActionEconomyBlocked;
  auditEvents: Dnd5eSrdActionEconomyAuditEvent[];
}

export interface Dnd5eSrdContinuationAllowance {
  rollId: string;
  exclusiveGroup?: string;
  spellSlotLevel?: number;
  oncePerTurn?: boolean;
}

export interface Dnd5eSrdContinuationGrant {
  sourceRollId: string;
  allowances: Dnd5eSrdContinuationAllowance[];
  targetActorIds: string[];
  criticalOutcomes?: Dnd5eSrdCriticalOutcome[];
  /** Targets for which the source attack was an un-negated critical hit. */
  criticalHitTargetActorIds?: string[];
  sourceDamageType?: string;
}

export interface Dnd5eSrdContinuationResult {
  data: JsonRecord;
  blocked?: { code: "continuation_missing" | "continuation_out_of_turn" | "continuation_ambiguous"; reason: string };
  continuationId?: string;
  criticalOutcomes?: Dnd5eSrdCriticalOutcome[];
  /** Targets whose follow-up damage must use the critical-hit formula. */
  criticalHitTargetActorIds?: string[];
  sourceDamageType?: string;
  auditEvents: Dnd5eSrdActionEconomyAuditEvent[];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parsedCriticalOutcomes(value: unknown, targetActorIds?: string[]): Dnd5eSrdCriticalOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const outcome = record(raw);
    const targetActorId = text(outcome.targetActorId);
    const criticalMinimum = typeof outcome.criticalMinimum === "number" && Number.isInteger(outcome.criticalMinimum) && outcome.criticalMinimum >= 1 && outcome.criticalMinimum <= 20
      ? outcome.criticalMinimum
      : undefined;
    const attackOutcome = text(outcome.outcome);
    if (!targetActorId || targetActorIds && !targetActorIds.includes(targetActorId) || criticalMinimum === undefined || !["miss", "hit", "critical-hit", "unresolved"].includes(attackOutcome ?? "")) return [];
    const naturalD20 = typeof outcome.naturalD20 === "number" && Number.isInteger(outcome.naturalD20) && outcome.naturalD20 >= 1 && outcome.naturalD20 <= 20
      ? outcome.naturalD20
      : undefined;
    return [{
      targetActorId,
      ...(naturalD20 !== undefined ? { naturalD20 } : {}),
      criticalMinimum,
      outcome: attackOutcome as Dnd5eSrdAttackOutcome,
      criticalNegated: outcome.criticalNegated === true,
      finalCritical: outcome.finalCritical === true
    }];
  });
}

function currentActorId(combat: Pick<Combat, "turnIndex" | "combatants">): string | undefined {
  return combat.combatants[combat.turnIndex]?.actorId;
}

function storedLedger(data: JsonRecord, combat: Pick<Combat, "id" | "round" | "turnIndex">, actorId: string): Dnd5eSrdTurnActionLedger {
  const rules = record(data.rulesEngine);
  const economy = record(rules.actionEconomy);
  const actions = record(economy.standardActions);
  const stored = record(actions[combat.id]);
  const sameTurn = finiteInteger(stored.round, -1) === combat.round
    && finiteInteger(stored.turnIndex, -1) === combat.turnIndex
    && text(stored.actorId) === actorId;
  if (!sameTurn) {
    return { round: combat.round, turnIndex: combat.turnIndex, actorId, actionsUsed: 0, actionSurgeGrants: 0, uses: [] };
  }
  const uses = Array.isArray(stored.uses)
    ? stored.uses.flatMap((entry) => {
        const value = record(entry);
        const rollId = text(value.rollId);
        const usedAt = text(value.usedAt);
        return rollId && usedAt ? [{ rollId, usedAt }] : [];
      })
    : [];
  return {
    round: combat.round,
    turnIndex: combat.turnIndex,
    actorId,
    actionsUsed: finiteInteger(stored.actionsUsed),
    actionSurgeGrants: Math.min(1, finiteInteger(stored.actionSurgeGrants)),
    uses,
    ...(text(stored.actionSurgeUsedAt) ? { actionSurgeUsedAt: text(stored.actionSurgeUsedAt) } : {})
  };
}

function withLedger(data: JsonRecord, combatId: string, ledger: Dnd5eSrdTurnActionLedger): JsonRecord {
  const rules = { ...record(data.rulesEngine) };
  const economy = { ...record(rules.actionEconomy) };
  const standardActions = { ...record(economy.standardActions), [combatId]: ledger };
  economy.standardActions = standardActions;
  rules.actionEconomy = economy;
  return { ...data, rulesEngine: rules };
}

function continuationLedger(data: JsonRecord, combat: Pick<Combat, "id" | "round" | "turnIndex">, actorId: string): JsonRecord {
  const stored = record(record(record(record(data.rulesEngine).actionEconomy).continuations)[combat.id]);
  return finiteInteger(stored.round, -1) === combat.round && finiteInteger(stored.turnIndex, -1) === combat.turnIndex && text(stored.actorId) === actorId
    ? stored
    : { round: combat.round, turnIndex: combat.turnIndex, actorId, tickets: [] };
}

function withContinuationLedger(data: JsonRecord, combatId: string, ledger: JsonRecord): JsonRecord {
  const rules = { ...record(data.rulesEngine) };
  const economy = { ...record(rules.actionEconomy) };
  economy.continuations = { ...record(economy.continuations), [combatId]: ledger };
  rules.actionEconomy = economy;
  return { ...data, rulesEngine: rules };
}

/** Arms the exact, same-turn continuations produced by a committed attack or primary damage roll. */
export function grantDnd5eSrdContinuations(
  data: JsonRecord,
  actorId: string,
  grant: Dnd5eSrdContinuationGrant,
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants"> | undefined,
  now: string
): Dnd5eSrdContinuationResult {
  if (!combat || grant.allowances.length === 0 || currentActorId(combat) !== actorId) return { data, auditEvents: [] };
  const ledger = continuationLedger(data, combat, actorId);
  const consumedRollIds = Array.isArray(ledger.consumedRollIds) ? ledger.consumedRollIds.filter((value): value is string => typeof value === "string") : [];
  const availableAllowances = grant.allowances.filter((allowance) => !allowance.oncePerTurn || !consumedRollIds.includes(allowance.rollId));
  if (availableAllowances.length === 0) return { data, auditEvents: [] };
  const tickets = Array.isArray(ledger.tickets) ? ledger.tickets.map(record) : [];
  const sequence = Math.max(0, finiteInteger(ledger.nextSequence, 0)) + 1;
  const continuationId = `${combat.id}:${combat.round}:${combat.turnIndex}:${actorId}:${sequence}`;
  const ticket = {
    continuationId,
    sourceRollId: grant.sourceRollId,
    allowances: availableAllowances.map((allowance) => ({ ...allowance })),
    targetActorIds: [...new Set(grant.targetActorIds)],
    ...(grant.criticalHitTargetActorIds?.length ? { criticalHitTargetActorIds: [...new Set(grant.criticalHitTargetActorIds)] } : {}),
    ...(grant.criticalOutcomes?.length ? { criticalOutcomes: grant.criticalOutcomes.map((outcome) => ({ ...outcome })) } : {}),
    ...(grant.sourceDamageType ? { sourceDamageType: grant.sourceDamageType } : {}),
    armedAt: now
  };
  return {
    data: withContinuationLedger(data, combat.id, { ...ledger, nextSequence: sequence, tickets: [...tickets, ticket] }),
    continuationId,
    ...(grant.criticalOutcomes?.length ? { criticalOutcomes: grant.criticalOutcomes.map((outcome) => ({ ...outcome })) } : {}),
    auditEvents: [{ code: "continuation.armed", actorId, rollId: grant.sourceRollId, message: "Action continuation armed", data: { combatId: combat.id, continuationId, allowedRollIds: availableAllowances.map((allowance) => allowance.rollId), targetActorIds: ticket.targetActorIds, criticalOutcomes: grant.criticalOutcomes?.map((outcome) => ({ ...outcome })) ?? [] } }]
  };
}

/** Requires and atomically consumes one matching same-turn continuation allowance. */
export function consumeDnd5eSrdContinuation(
  data: JsonRecord,
  actorId: string,
  rollId: string,
  targetActorIds: string[],
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants"> | undefined,
  spellSlotLevel?: number,
  continuationId?: string
): Dnd5eSrdContinuationResult {
  if (!combat) return { data, blocked: { code: "continuation_missing", reason: `${rollId} requires a matching committed predecessor.` }, auditEvents: [] };
  if (currentActorId(combat) !== actorId) return { data, blocked: { code: "continuation_out_of_turn", reason: `${rollId} can be continued only on this actor's turn.` }, auditEvents: [] };
  const ledger = continuationLedger(data, combat, actorId);
  const tickets = Array.isArray(ledger.tickets) ? ledger.tickets.map(record) : [];
  const requestedTargets = [...new Set(targetActorIds)];
  const matchingTicketIndexes: number[] = [];
  for (let index = tickets.length - 1; index >= 0; index -= 1) {
    const ticket = tickets[index]!;
    if (continuationId && text(ticket.continuationId) !== continuationId) continue;
    const storedTargets = Array.isArray(ticket.targetActorIds) ? ticket.targetActorIds.filter((value): value is string => typeof value === "string") : [];
    const allowances = Array.isArray(ticket.allowances) ? ticket.allowances.map(record) : [];
    if (allowances.some((allowance) => text(allowance.rollId) === rollId && (typeof allowance.spellSlotLevel !== "number" ? true : allowance.spellSlotLevel === spellSlotLevel))
      && (storedTargets.length === 0 ? requestedTargets.length === 0 : requestedTargets.length > 0 && requestedTargets.every((targetId) => storedTargets.includes(targetId)))) matchingTicketIndexes.push(index);
  }
  if (!continuationId && matchingTicketIndexes.length > 1) return { data, blocked: { code: "continuation_ambiguous", reason: `${rollId} matches more than one predecessor; choose the exact continuation.` }, auditEvents: [] };
  const ticketIndex = matchingTicketIndexes[0] ?? -1;
  if (ticketIndex < 0) return { data, blocked: { code: "continuation_missing", reason: `${rollId} requires an unused matching predecessor from this turn and target.` }, auditEvents: [] };
  const ticket = tickets[ticketIndex]!;
  const matchedContinuationId = text(ticket.continuationId);
  const allowances = Array.isArray(ticket.allowances) ? ticket.allowances.map(record) : [];
  const matched = allowances.find((allowance) => text(allowance.rollId) === rollId && (typeof allowance.spellSlotLevel !== "number" ? true : allowance.spellSlotLevel === spellSlotLevel))!;
  const exclusiveGroup = text(matched.exclusiveGroup);
  const remaining = allowances.filter((allowance) => exclusiveGroup ? text(allowance.exclusiveGroup) !== exclusiveGroup : text(allowance.rollId) !== rollId);
  if (remaining.length > 0) tickets[ticketIndex] = { ...ticket, allowances: remaining };
  else tickets.splice(ticketIndex, 1);
  if (matched.oncePerTurn === true) {
    for (let index = tickets.length - 1; index >= 0; index -= 1) {
      const currentTicket = tickets[index]!;
      const ticketAllowances = Array.isArray(currentTicket.allowances) ? currentTicket.allowances.map(record).filter((allowance) => text(allowance.rollId) !== rollId) : [];
      if (ticketAllowances.length > 0) tickets[index] = { ...currentTicket, allowances: ticketAllowances };
      else tickets.splice(index, 1);
    }
  }
  return {
    data: withContinuationLedger(data, combat.id, { ...ledger, tickets, consumedRollIds: matched.oncePerTurn === true ? [...new Set([...(Array.isArray(ledger.consumedRollIds) ? ledger.consumedRollIds.filter((value): value is string => typeof value === "string") : []), rollId])] : ledger.consumedRollIds ?? [] }),
    ...(matchedContinuationId ? { continuationId: matchedContinuationId } : {}),
    ...(Array.isArray(ticket.criticalOutcomes) ? { criticalOutcomes: parsedCriticalOutcomes(ticket.criticalOutcomes, requestedTargets) } : {}),
    ...(Array.isArray(ticket.criticalHitTargetActorIds) ? { criticalHitTargetActorIds: ticket.criticalHitTargetActorIds.filter((value): value is string => typeof value === "string" && requestedTargets.includes(value)) } : {}),
    ...(text(ticket.sourceDamageType) ? { sourceDamageType: text(ticket.sourceDamageType) } : {}),
    auditEvents: [{ code: "continuation.consumed", actorId, rollId, message: "Action continuation consumed", data: { combatId: combat.id, continuationId: matchedContinuationId, sourceRollId: text(ticket.sourceRollId), targetActorIds: requestedTargets, criticalOutcomes: parsedCriticalOutcomes(ticket.criticalOutcomes, requestedTargets) } }]
  };
}

/** Consume one standard Action. Multiple rolls/targets inside this resolver transaction still consume only this one entry. */
export function applyDnd5eSrdStandardActionUse(
  data: JsonRecord,
  actorId: string,
  rollId: string,
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants"> | undefined,
  now: string
): Dnd5eSrdActionEconomyResult {
  if (!combat) return { data, auditEvents: [] };
  if (currentActorId(combat) !== actorId) {
    return { data, blocked: { code: "action_out_of_turn", reason: "A standard Action can be taken only on this actor's turn." }, auditEvents: [] };
  }
  const ledger = storedLedger(data, combat, actorId);
  const maximumActions = 1 + ledger.actionSurgeGrants;
  if (ledger.actionsUsed >= maximumActions) {
    return { data, ledger, blocked: { code: "action_already_used", reason: "Standard Action already used on this turn." }, auditEvents: [] };
  }
  const nextLedger: Dnd5eSrdTurnActionLedger = {
    ...ledger,
    actionsUsed: ledger.actionsUsed + 1,
    uses: [...ledger.uses, { rollId, usedAt: now }]
  };
  return {
    data: withLedger(data, combat.id, nextLedger),
    ledger: nextLedger,
    auditEvents: [{
      code: "action.used",
      actorId,
      rollId,
      message: "Standard Action used",
      data: { combatId: combat.id, round: combat.round, turnIndex: combat.turnIndex, actionsUsed: nextLedger.actionsUsed, maximumActions }
    }]
  };
}

/** Grant the one additional Action supplied by a successfully spent Action Surge on this turn. */
export function grantDnd5eSrdActionSurge(
  data: JsonRecord,
  actorId: string,
  rollId: string,
  combat: Pick<Combat, "id" | "round" | "turnIndex" | "combatants"> | undefined,
  now: string
): Dnd5eSrdActionEconomyResult {
  if (!combat) return { data, auditEvents: [] };
  if (currentActorId(combat) !== actorId) {
    return { data, blocked: { code: "action_surge_out_of_turn", reason: "Action Surge can be used only on this actor's turn." }, auditEvents: [] };
  }
  const ledger = storedLedger(data, combat, actorId);
  if (ledger.actionSurgeGrants >= 1) {
    return { data, ledger, blocked: { code: "action_surge_already_used", reason: "Action Surge already granted an additional Action on this turn." }, auditEvents: [] };
  }
  const nextLedger: Dnd5eSrdTurnActionLedger = { ...ledger, actionSurgeGrants: 1, actionSurgeUsedAt: now };
  return {
    data: withLedger(data, combat.id, nextLedger),
    ledger: nextLedger,
    auditEvents: [{
      code: "action-surge.granted",
      actorId,
      rollId,
      message: "Action Surge granted one additional Action",
      data: { combatId: combat.id, round: combat.round, turnIndex: combat.turnIndex, maximumActions: 2 }
    }]
  };
}
