import type { CampaignPresence, EngineEvent } from "@open-tabletop/api-contracts";

export type {
  EngineEventType,
  EngineEvent,
  CampaignPresence,
} from "@open-tabletop/api-contracts";
import { createId, nowIso } from "./ids.js";
import type { ID } from "./types.js";

export type RealtimePresenceEventType = "presence.snapshot" | "presence.joined" | "presence.updated" | "presence.left";

export interface RealtimePresenceEnvelope {
  channel: "presence";
  type: RealtimePresenceEventType;
  campaignId: ID;
  timestamp: string;
  presence?: CampaignPresence;
  presences?: CampaignPresence[];
}

/** A live, recipient-only message, never recorded in the campaign event log. */
export interface RealtimePresentation {
  channel: "presentation";
  campaignId: ID;
  id: ID;
  expiresAt: number;
  title: string;
  body: string;
  images: { assetId: ID; name: string }[];
}

export function createEvent<TPayload>(input: Omit<EngineEvent<TPayload>, "id" | "timestamp">): EngineEvent<TPayload> {
  return {
    ...input,
    id: createId("evt"),
    timestamp: nowIso()
  };
}
