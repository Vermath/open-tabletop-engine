import type { CampaignPresence, RealtimePresenceEnvelope } from "@open-tabletop/core";

type RealtimeRecord = Record<string, unknown>;

export type RealtimeSequenceDecision =
  | { kind: "presence"; envelope: RealtimePresenceEnvelope }
  | { kind: "legacy"; event: unknown }
  | { kind: "duplicate"; event: unknown; sequence: number }
  | { kind: "contiguous"; event: unknown; sequence: number }
  | { kind: "gap"; event: unknown; expectedSequence: number; sequence: number };

function recordValue(value: unknown): RealtimeRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RealtimeRecord : undefined;
}

export function parseRealtimePayload(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

export function isRealtimePresenceEnvelope(value: unknown): value is RealtimePresenceEnvelope {
  const record = recordValue(value);
  if (record?.channel !== "presence" || typeof record.campaignId !== "string" || typeof record.timestamp !== "string") return false;
  return record.type === "presence.snapshot" || record.type === "presence.joined" || record.type === "presence.updated" || record.type === "presence.left";
}

export function realtimeSequenceDecision(data: unknown, lastSequence: number): RealtimeSequenceDecision {
  const event = parseRealtimePayload(data);
  if (isRealtimePresenceEnvelope(event)) return { kind: "presence", envelope: event };
  const record = recordValue(event);
  const sequence = record?.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0) return { kind: "legacy", event };
  if (sequence <= lastSequence) return { kind: "duplicate", event, sequence };
  const expectedSequence = lastSequence + 1;
  if (sequence === expectedSequence) return { kind: "contiguous", event, sequence };
  return { kind: "gap", event, expectedSequence, sequence };
}

function presenceForEnvelope(envelope: RealtimePresenceEnvelope): CampaignPresence | undefined {
  return envelope.presence?.campaignId === envelope.campaignId ? envelope.presence : undefined;
}

export function applyPresenceEnvelope(current: readonly CampaignPresence[], envelope: RealtimePresenceEnvelope): CampaignPresence[] {
  if (envelope.type === "presence.snapshot") {
    return [...(envelope.presences ?? [])]
      .filter((presence) => presence.campaignId === envelope.campaignId)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.userId.localeCompare(right.userId));
  }
  const presence = presenceForEnvelope(envelope);
  if (!presence) return [...current];
  if (envelope.type === "presence.left") return current.filter((candidate) => candidate.userId !== presence.userId);
  const next = current.filter((candidate) => candidate.userId !== presence.userId);
  next.push(presence);
  return next.sort((left, right) => left.displayName.localeCompare(right.displayName) || left.userId.localeCompare(right.userId));
}
