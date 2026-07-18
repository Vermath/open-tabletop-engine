import type { JournalEntry } from "@open-tabletop/core";
import { apiPost, type CampaignSessionInfo } from "./api.js";

export const SESSION_REPORT_REQUIRED_PERMISSIONS = ["campaign.update", "journal.create", "journal.readSecret"] as const;

export type SessionReportPermission = (typeof SESSION_REPORT_REQUIRED_PERMISSIONS)[number];

export interface SessionReportJournalPayload {
  kind: "entry";
  title: string;
  body: string;
  visibility: "gm_only";
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  tags: string[];
  links: [];
}

export interface SessionReportAttempt {
  idempotencyKey: string;
  run(): Promise<JournalEntry>;
}

export function sessionReportAllowed(hasPermission: (permission: SessionReportPermission) => boolean): boolean {
  return SESSION_REPORT_REQUIRED_PERMISSIONS.every((permission) => hasPermission(permission));
}

export function sessionReportJournalPayload(session: CampaignSessionInfo): SessionReportJournalPayload {
  const observations = {
    schema: "otte.session-report/v1",
    session_id: session.id,
    session_number: session.number,
    session_status: session.status,
    breakage: "not_recorded",
    corrections: "not_recorded",
    recovery: "not_recorded",
    privacy: "not_recorded",
    manual_rulings: "not_recorded"
  };

  return {
    kind: "entry",
    title: `Session report - ${session.number} - ${session.title}`,
    body: [
      "Update the structured observations as play continues. Keep sensitive player details out of the report.",
      "",
      "```json",
      JSON.stringify(observations, null, 2),
      "```"
    ].join("\n"),
    visibility: "gm_only",
    visibleToUserIds: [],
    visibleToActorIds: [],
    tags: ["session-report", "dogfood:x01", `session:${session.id}`],
    links: []
  };
}

export function sessionReportMutationKey(sessionId: string): string {
  return `session-report:${sessionId}:${globalThis.crypto.randomUUID()}`;
}

export function prepareSessionReportAttempt(
  campaignId: string,
  session: CampaignSessionInfo,
  idempotencyKey = sessionReportMutationKey(session.id)
): SessionReportAttempt {
  return {
    idempotencyKey,
    run: () => apiPost<JournalEntry>(
      `/api/v1/campaigns/${encodeURIComponent(campaignId)}/journal`,
      sessionReportJournalPayload(session),
      { idempotencyKey }
    )
  };
}
