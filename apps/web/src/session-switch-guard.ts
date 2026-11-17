export interface SessionSwitchSequence {
  current: number;
}

export function beginSessionSwitch(sequence: SessionSwitchSequence, currentUserId: string, requestedUserId: string): number | undefined {
  const requestId = ++sequence.current;
  return requestedUserId === currentUserId ? undefined : requestId;
}

export function sessionSwitchIsCurrent(sequence: SessionSwitchSequence, requestId: number): boolean {
  return sequence.current === requestId;
}
