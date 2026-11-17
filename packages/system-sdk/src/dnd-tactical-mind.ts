type JsonRecord = Record<string, unknown>;

export interface Dnd5eSrdTacticalMindCheck {
  /** Server-owned DiceRoll id for the failed ability check being augmented. */
  failedCheckRollId: string;
  /** Authoritative total persisted on the referenced ability check. */
  total: number;
  /** Reviewed DC for the check. DiceRoll records do not currently persist DCs. */
  dc: number;
}

export interface Dnd5eSrdTacticalMindOutcome {
  failedCheckRollId: string;
  failedCheckTotal: number;
  dc: number;
  bonus: number;
  finalTotal: number;
  success: boolean;
  resourceSpent: boolean;
}

export interface Dnd5eSrdTacticalMindResult {
  data: JsonRecord;
  consumed: Array<{ type: "resource"; key: "secondWind"; label: "Second Wind"; amount: 1; remaining: number }>;
  auditEvents: Array<{ code: string; actorId: string; rollId: string; message: string; data: JsonRecord }>;
  outcome?: Dnd5eSrdTacticalMindOutcome;
  blocked?: { code: string; reason: string };
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Resolves Tactical Mind in two phases. With no bonus this is a mutation-free
 * preflight; with the authoritative d10 result it records the one-shot attempt
 * and spends Second Wind only when the augmented check reaches the reviewed DC.
 */
export function resolveDnd5eSrdTacticalMind(input: {
  actor: { id: string; name: string; data: JsonRecord };
  rollId: string;
  consumeResources: boolean;
  check?: Dnd5eSrdTacticalMindCheck;
  bonus?: number;
}): Dnd5eSrdTacticalMindResult {
  const base = { data: input.actor.data, consumed: [], auditEvents: [] } satisfies Dnd5eSrdTacticalMindResult;
  if (!input.consumeResources) return { ...base, blocked: { code: "tactical_mind_resource_required", reason: "Tactical Mind must be rolled as a reviewed Second Wind resource use." } };
  const check = input.check;
  if (!check || !check.failedCheckRollId.trim() || integer(check.total) === undefined || integer(check.dc) === undefined) {
    return { ...base, blocked: { code: "tactical_mind_check_required", reason: "Tactical Mind requires a server-owned failed ability check and reviewed DC." } };
  }
  if (check.total >= check.dc) return { ...base, blocked: { code: "tactical_mind_check_not_failed", reason: "Tactical Mind can augment only a failed ability check." } };
  const rules = record(input.actor.data.rulesEngine);
  const attempts = record(rules.tacticalMindAttempts);
  if (record(attempts[check.failedCheckRollId]).failedCheckRollId === check.failedCheckRollId) {
    return { ...base, blocked: { code: "tactical_mind_already_attempted", reason: "Tactical Mind was already attempted for this failed ability check." } };
  }
  const resources = record(input.actor.data.resources);
  const secondWind = record(resources.secondWind);
  const current = integer(secondWind.current) ?? 0;
  if (current < 1) return { ...base, blocked: { code: "resource_unavailable", reason: "Insufficient second wind" } };
  if (input.bonus === undefined) return base;
  const bonus = integer(input.bonus);
  if (bonus === undefined || bonus < 1 || bonus > 10) return { ...base, blocked: { code: "tactical_mind_bonus_invalid", reason: "Tactical Mind requires an authoritative 1d10 result." } };
  const finalTotal = check.total + bonus;
  const success = finalTotal >= check.dc;
  const outcome: Dnd5eSrdTacticalMindOutcome = { failedCheckRollId: check.failedCheckRollId, failedCheckTotal: check.total, dc: check.dc, bonus, finalTotal, success, resourceSpent: success };
  const nextAttempts = Object.fromEntries([...Object.entries(attempts), [check.failedCheckRollId, { ...outcome, featureRollId: input.rollId }]].slice(-64));
  const nextRules = { ...rules, tacticalMindAttempts: nextAttempts };
  const nextResources = success ? { ...resources, secondWind: { ...secondWind, current: current - 1 } } : resources;
  const consumed = success ? [{ type: "resource" as const, key: "secondWind" as const, label: "Second Wind" as const, amount: 1 as const, remaining: current - 1 }] : [];
  return {
    data: { ...input.actor.data, resources: nextResources, rulesEngine: nextRules },
    consumed,
    outcome,
    auditEvents: [{
      code: success ? "tactical-mind.succeeded" : "tactical-mind.failed-refund",
      actorId: input.actor.id,
      rollId: input.rollId,
      message: success ? `${input.actor.name} used Tactical Mind and expended Second Wind.` : `${input.actor.name} used Tactical Mind; the check still failed, so Second Wind was not expended.`,
      data: { ...outcome }
    }]
  };
}
