import { describe, expect, it, vi } from "vitest";
import {
  campaignSessionScheduleMatchesDraft,
  completeCampaignSessionOnce,
  sessionDraftPayload,
  sessionScheduledForIso,
  type SessionDraft
} from "./session-desk-panel.js";

const scheduledDraft: SessionDraft = {
  title: "The Ember Bell",
  agenda: "Cross the bridge",
  notes: "",
  scheduledFor: "2026-08-14T19:30",
  sceneIds: ["scene-bridge"],
  encounterIds: ["encounter-bell"]
};

describe("session desk lifecycle", () => {
  it("normalizes a planned local time and only confirms the matching persisted schedule", () => {
    const expected = new Date(scheduledDraft.scheduledFor).toISOString();

    expect(sessionScheduledForIso(scheduledDraft.scheduledFor)).toBe(expected);
    expect(sessionDraftPayload(scheduledDraft).scheduledFor).toBe(expected);
    expect(campaignSessionScheduleMatchesDraft(scheduledDraft, { scheduledFor: expected })).toBe(true);
    expect(campaignSessionScheduleMatchesDraft(scheduledDraft, {})).toBe(false);
    expect(campaignSessionScheduleMatchesDraft(scheduledDraft, { scheduledFor: "2026-08-15T00:00:00.000Z" })).toBe(false);
  });

  it("confirms an explicitly cleared schedule and rejects invalid date input", () => {
    expect(campaignSessionScheduleMatchesDraft({ scheduledFor: "" }, {})).toBe(true);
    expect(campaignSessionScheduleMatchesDraft({ scheduledFor: "" }, { scheduledFor: "2026-08-15T00:30:00.000Z" })).toBe(false);
    expect(() => sessionScheduledForIso("not-a-date")).toThrow("Choose a valid date and time");
  });

  it("keeps one completion request in flight across rerenders and suppresses duplicate submits", async () => {
    const inFlightSessionIds = new Set<string>();
    const session = { id: "session-3", title: "The Ember Bell" };
    const confirm = vi.fn(() => true);
    let finishRequest!: () => void;
    const firstRequest = vi.fn(() => new Promise<void>((resolve) => { finishRequest = resolve; }));
    const rerenderedRequest = vi.fn(async () => undefined);

    const first = completeCampaignSessionOnce(inFlightSessionIds, session, firstRequest, confirm);
    const duplicate = await completeCampaignSessionOnce(inFlightSessionIds, session, rerenderedRequest, confirm);

    expect(duplicate).toBe("in_flight");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(firstRequest).toHaveBeenCalledTimes(1);
    expect(rerenderedRequest).not.toHaveBeenCalled();
    expect(inFlightSessionIds).toEqual(new Set([session.id]));

    finishRequest();
    await expect(first).resolves.toBe("completed");
    expect(inFlightSessionIds.size).toBe(0);
  });

  it("does not submit completion when the GM cancels confirmation", async () => {
    const complete = vi.fn(async () => undefined);
    const result = await completeCampaignSessionOnce(
      new Set<string>(),
      { id: "session-3", title: "The Ember Bell" },
      complete,
      () => false
    );

    expect(result).toBe("cancelled");
    expect(complete).not.toHaveBeenCalled();
  });
});
