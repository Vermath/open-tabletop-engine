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
  | "token.deleted"
  | "actor.created"
  | "actor.updated"
  | "actor.deleted"
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
  | "ai.message.delta"
  | "ai.message.completed"
  | "ai.reasoning.delta"
  | "ai.reasoning.completed"
  | "ai.activity.reported"
  | "ai.tool.started"
  | "ai.tool.completed"
  | "ai.proposal.created"
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
