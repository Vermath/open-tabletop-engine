export interface AppendMutationAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

export function appendMutationFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function appendMutationAttemptForIntent(
  current: AppendMutationAttempt | undefined,
  scope: string,
  fingerprint: string,
  createKey: () => string,
): AppendMutationAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, idempotencyKey: `append:${scope}:${createKey()}` };
}
