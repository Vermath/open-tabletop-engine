import type { Combat } from "@open-tabletop/core";

type JsonRecord = Record<string, unknown>;

export type Dnd5eSrdActionKind = "action" | "bonusAction" | "reaction" | "free";

/** Classifies only the economy used by the authoritative resolver. */
export function dnd5eSrdActionKind(roll: { id: string; formula: string; metadata?: Record<string, unknown> }): Dnd5eSrdActionKind {
  if (roll.id === "death-save" || roll.id === "concentration" || roll.id === "initiative" || /^(?:ability|save|skill|tool)-/.test(roll.id)) return "free";
  const metadata = record(roll.metadata);
  const action = (text(metadata.action) ?? text(metadata.activation) ?? "").toLowerCase();
  if (action.includes("reaction") || roll.id.includes("retaliation") || roll.id.includes("cutting-words")) return "reaction";
  if (action.includes("bonus")) return "bonusAction";
  if (roll.formula === "0" && !text(metadata.action) && !text(metadata.activation)) return "free";
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
  code: "action.used" | "action-surge.granted";
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

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
