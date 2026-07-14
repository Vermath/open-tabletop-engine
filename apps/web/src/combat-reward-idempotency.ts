export interface CombatRewardAttempt<TRequest> {
  fingerprint: string;
  idempotencyKey: string;
  request: TRequest;
}

export interface CombatRewardIntent {
  combatId: string;
  recipientActorIds: string[];
  totalXp?: number;
  totalGp?: number;
  loot?: string[];
  note?: string;
}

export function combatRewardIntentFingerprint(intent: CombatRewardIntent): string {
  return JSON.stringify({
    combatId: intent.combatId,
    recipientActorIds: [...intent.recipientActorIds].sort((left, right) => left.localeCompare(right)),
    totalXp: intent.totalXp ?? 0,
    totalGp: intent.totalGp ?? 0,
    loot: intent.loot ?? [],
    note: intent.note ?? ""
  });
}

export function combatRewardAttemptForIntent<TRequest>(
  current: CombatRewardAttempt<TRequest> | null,
  fingerprint: string,
  createKey: () => string,
  createRequest: () => TRequest
): CombatRewardAttempt<TRequest> {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, idempotencyKey: `combat-reward:${createKey()}`, request: createRequest() };
}
