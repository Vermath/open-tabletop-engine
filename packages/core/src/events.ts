import { createId, nowIso } from "./ids.js";
import type { ID } from "./types.js";

export type EngineEventType =
  | "campaign.updated"
  | "campaign.member.joined"
  | "campaign.member.updated"
  | "campaign.member.left"
  | "campaign.session.created"
  | "campaign.session.updated"
  | "campaign.session.started"
  | "campaign.session.completed"
  | "campaign.session.deleted"
  | "world.created"
  | "world.updated"
  | "world.deleted"
  | "scene.created"
  | "scene.updated"
  | "scene.deleted"
  | "scene.activated"
  | "token.created"
  | "token.updated"
  | "token.moved"
  | "token.moved.batch"
  | "token.deleted"
  | "actor.created"
  | "actor.updated"
  | "actor.deleted"
  | "character.transfer.created"
  | "character.transfer.resolved"
  | "item.created"
  | "item.updated"
  | "item.deleted"
  | "journal.created"
  | "journal.updated"
  | "journal.deleted"
  | "handout.created"
  | "handout.updated"
  | "handout.deleted"
  | "asset.created"
  | "asset.updated"
  | "asset.deleted"
  | "chat.message.created"
  | "chat.message.updated"
  | "chat.message.deleted"
  | "dice.roll.created"
  | "dice.macro.created"
  | "dice.macro.updated"
  | "dice.macro.deleted"
  | "audio.updated"
  | "audio.deleted"
  | "combat.started"
  | "combat.roundAdvanced"
  | "combat.turnChanged"
  | "combat.ended"
  | "encounter.created"
  | "encounter.updated"
  | "encounter.deleted"
  | "proposal.created"
  | "proposal.updated"
  | "proposal.approved"
  | "proposal.rejected"
  | "proposal.applied"
  | "proposal.reverted"
  | "contentImport.previewed"
  | "contentImport.applied"
  | "contentImport.rolledBack"
  | "contentImport.deleted"
  | "ai.thread.started"
  | "ai.thread.updated"
  | "ai.evaluation.created"
  | "ai.message.delta"
  | "ai.message.completed"
  | "ai.reasoning.delta"
  | "ai.reasoning.completed"
  | "ai.activity.reported"
  | "ai.tool.started"
  | "ai.tool.completed"
  | "ai.tool.updated"
  | "ai.proposal.created"
  | "ai.policy.updated"
  | "ai.privacy.pruned"
  | "ai.memory.created"
  | "ai.memory.updated"
  | "ai.memory.approved"
  | "ai.memory.rejected"
  | "ai.memory.deleted"
  | "agent.boardCaptureRequested";

export interface EngineEvent<TPayload = unknown> {
  id: ID;
  campaignId: ID;
  type: EngineEventType;
  actorUserId?: ID;
  targetId?: ID;
  timestamp: string;
  /** Monotonic per-campaign cursor for authoritative persisted state events. */
  sequence?: number;
  payload: TPayload;
  causationId?: ID;
  correlationId?: ID;
}

/** Ephemeral online state. Presence never consumes the authoritative event sequence. */
export interface CampaignPresence {
  campaignId: ID;
  userId: ID;
  displayName: string;
  role: string;
  connectionCount: number;
  connectedAt: string;
  lastSeenAt: string;
  activeSceneIds: ID[];
}

export type RealtimePresenceEventType = "presence.snapshot" | "presence.joined" | "presence.updated" | "presence.left";

export interface RealtimePresenceEnvelope {
  channel: "presence";
  type: RealtimePresenceEventType;
  campaignId: ID;
  timestamp: string;
  presence?: CampaignPresence;
  presences?: CampaignPresence[];
}

export function createEvent<TPayload>(input: Omit<EngineEvent<TPayload>, "id" | "timestamp">): EngineEvent<TPayload> {
  return {
    ...input,
    id: createId("evt"),
    timestamp: nowIso()
  };
}
