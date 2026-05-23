import { createId, nowIso } from "./ids.js";
import type { ID } from "./types.js";

export type EngineEventType =
  | "campaign.updated"
  | "campaign.member.joined"
  | "campaign.member.left"
  | "scene.created"
  | "scene.updated"
  | "scene.deleted"
  | "scene.activated"
  | "token.created"
  | "token.updated"
  | "token.moved"
  | "token.deleted"
  | "actor.created"
  | "actor.updated"
  | "actor.deleted"
  | "journal.created"
  | "journal.updated"
  | "journal.deleted"
  | "chat.message.created"
  | "chat.message.deleted"
  | "dice.roll.created"
  | "combat.started"
  | "combat.roundAdvanced"
  | "combat.turnChanged"
  | "combat.ended"
  | "proposal.created"
  | "proposal.updated"
  | "proposal.approved"
  | "proposal.rejected"
  | "proposal.applied"
  | "contentImport.previewed"
  | "contentImport.applied"
  | "contentImport.rolledBack"
  | "contentImport.deleted"
  | "ai.thread.started"
  | "ai.message.delta"
  | "ai.message.completed"
  | "ai.tool.started"
  | "ai.tool.completed"
  | "ai.proposal.created"
  | "agent.boardCaptureRequested";

export interface EngineEvent<TPayload = unknown> {
  id: ID;
  campaignId: ID;
  type: EngineEventType;
  actorUserId?: ID;
  targetId?: ID;
  timestamp: string;
  payload: TPayload;
  causationId?: ID;
  correlationId?: ID;
}

export function createEvent<TPayload>(input: Omit<EngineEvent<TPayload>, "id" | "timestamp">): EngineEvent<TPayload> {
  return {
    ...input,
    id: createId("evt"),
    timestamp: nowIso()
  };
}
