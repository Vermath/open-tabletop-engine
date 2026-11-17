import type { CampaignSession } from "@open-tabletop/core";

export type LiveCampaignSessionResolution =
  | { ok: true; session?: CampaignSession }
  | { ok: false; message: string };

/**
 * Encounter activity may be attributed automatically only when the campaign
 * has one unambiguous live session. Planned sessions stay explicitly linked
 * by the GM instead of being guessed from scene or schedule proximity.
 */
export function resolveSingleLiveCampaignSession(
  sessions: CampaignSession[],
  campaignId: string,
): LiveCampaignSessionResolution {
  const live = sessions.filter((session) => session.campaignId === campaignId && session.status === "live");
  if (live.length > 1) {
    return {
      ok: false,
      message: "This campaign has multiple live sessions. Resolve the session state before saving or placing an encounter.",
    };
  }
  return { ok: true, session: live[0] };
}

export function linkEncounterToLiveSession(
  session: CampaignSession | undefined,
  encounterId: string,
  userId: string,
  updatedAt: string,
): CampaignSession | undefined {
  if (!session || session.encounterIds.includes(encounterId)) return undefined;
  session.encounterIds = [...session.encounterIds, encounterId];
  session.updatedBy = userId;
  session.updatedAt = updatedAt;
  return session;
}
