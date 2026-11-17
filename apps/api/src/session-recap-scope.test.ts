import type { AiProvider } from "@open-tabletop/ai-core";
import { createTimestamped, type CampaignSession, type ChatMessage, type Combat, type DiceRoll } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

const localFallbackProvider: AiProvider = {
  id: "unavailable-ai-provider",
  label: "Local structured fallback",
  async *stream() {}
};

describe("session recap scope", () => {
  it("bounds fallback evidence to the selected session and its linked encounters", async () => {
    const store = new MemoryStateStore();
    const session = createTimestamped("cses", {
      id: "cses-recap-one",
      campaignId: "camp_demo",
      status: "completed" as const,
      title: "First Bell",
      number: 1,
      agenda: "Clear the market",
      notes: "The first bell was secured.",
      startedAt: "2035-01-01T10:00:00.000Z",
      endedAt: "2035-01-01T12:00:00.000Z",
      sceneIds: [],
      encounterIds: ["encounter-first-bell"],
      createdBy: "usr_demo_gm",
      updatedBy: "usr_demo_gm",
      createdAt: "2035-01-01T09:00:00.000Z",
      updatedAt: "2035-01-01T12:00:00.000Z"
    }) satisfies CampaignSession;
    store.state.campaignSessions.push(session);
    store.state.chat.push(
      chat("msg-first-bell", "First-session-only highlight", "2035-01-01T10:30:00.000Z"),
      chat("msg-later-session", "Later-session content must stay out", "2035-01-01T13:30:00.000Z")
    );
    store.state.rolls.push(
      roll("roll-first-bell", 17, "2035-01-01T10:45:00.000Z"),
      roll("roll-later-session", 99, "2035-01-01T13:45:00.000Z")
    );
    store.state.combats.push(
      combat("combat-first-bell", "encounter-first-bell", "2035-01-01T10:15:00.000Z", "2035-01-01T11:15:00.000Z"),
      combat("combat-unlinked-same-window", "encounter-secret-side-fight", "2035-01-01T10:20:00.000Z", "2035-01-01T11:20:00.000Z"),
      combat("combat-later-session", "encounter-first-bell", "2035-01-01T13:15:00.000Z", "2035-01-01T14:15:00.000Z")
    );
    const app = await buildApp({ store, aiProvider: localFallbackProvider });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/ai/session-recap",
        headers: { "x-user-id": "usr_demo_gm", "idempotency-key": "session-recap-scope-one" },
        payload: {
          sessionId: session.id,
          expectedUpdatedAt: store.state.campaigns.find((campaign) => campaign.id === "camp_demo")!.updatedAt
        }
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ fallbackUsed: true, session: { id: session.id } });
      const recap = response.json().recap as { playerRecap: string; gmRecap: string; timelineEvents: Array<{ text: string }> };
      expect(recap.playerRecap).toContain("1 visible rolls were recorded; the highest total was 17.");
      expect(recap.playerRecap).toContain("1 combat reached round 2.");
      expect(recap.playerRecap).toContain("First-session-only highlight");
      expect(recap.playerRecap).not.toContain("Later-session content must stay out");
      expect(recap.gmRecap).toContain("1 public chat messages, 1 visible rolls, and 1 combat records");
      expect(recap.timelineEvents).toEqual([{ text: "First-session-only highlight", visibility: "public", confidence: 1 }]);

      const prompt = response.json().thread.prompt as string;
      expect(prompt).toContain("First-session-only highlight");
      expect(prompt).toContain("combat-first-bell");
      expect(prompt).not.toContain("Later-session content must stay out");
      expect(prompt).not.toContain("combat-unlinked-same-window");
      expect(prompt).not.toContain("combat-later-session");
      const source = response.json().thread.sources.find((candidate: { id: string }) => candidate.id === `session-recap:${session.id}`);
      expect(source).toMatchObject({ locator: `campaign-session:${session.id}`, visibility: "gm_private" });
    } finally {
      await app.close();
    }
  });
});

function chat(id: string, body: string, at: string): ChatMessage {
  return createTimestamped("msg", {
    id,
    campaignId: "camp_demo",
    userId: "usr_demo_player",
    type: "plain" as const,
    body,
    visibility: "public" as const,
    recipientUserIds: [],
    createdAt: at,
    updatedAt: at
  });
}

function roll(id: string, total: number, at: string): DiceRoll {
  return createTimestamped("roll", {
    id,
    campaignId: "camp_demo",
    userId: "usr_demo_player",
    formula: "1d20",
    label: "Session check",
    visibility: "public" as const,
    terms: [],
    total,
    createdAt: at,
    updatedAt: at
  });
}

function combat(id: string, encounterId: string, createdAt: string, updatedAt: string): Combat {
  return createTimestamped("cmb", {
    id,
    campaignId: "camp_demo",
    encounterId,
    active: false,
    round: 2,
    turnIndex: 0,
    combatants: [],
    createdAt,
    updatedAt
  });
}
