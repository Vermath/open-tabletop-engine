import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSessionRecapBody, sessionRecapJournalPayload, sessionRecapNaturalTwentyCount, sessionRecapScope, sessionRecapWindowStart, type SessionRecapSnapshot } from "./session-recap.js";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const journalPanelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");

describe("session recap", () => {
  it("generates deterministic recap journal entries from the current snapshot", () => {
    const since = new Date("2026-07-17T12:00:00.000Z");
    const snapshot = {
      campaignSessions: [{ id: "session-12", campaignId: "campaign-1", status: "completed", title: "The Broken Vault", number: 12, agenda: "", notes: "", sceneIds: [], encounterIds: ["encounter-1"], createdBy: "gm", updatedBy: "gm", createdAt: "2026-07-17T11:50:00.000Z", updatedAt: "2026-07-17T12:20:00.000Z", startedAt: since.toISOString(), endedAt: "2026-07-17T12:20:00.000Z" }],
      journals: [],
      rolls: [{ id: "roll-1", formula: "1d20+5", total: 25, label: "Attack", terms: [{ sides: 20, results: [20] }], createdAt: "2026-07-17T12:01:00.000Z" }],
      combats: [{ id: "combat-1", encounterId: "encounter-1", active: false, round: 3, combatants: [{ id: "combatant-1", name: "Goblin", defeated: true }], createdAt: "2026-07-17T12:01:30.000Z", updatedAt: "2026-07-17T12:02:00.000Z" }],
      combatAudit: [{ id: "audit-1", action: "combat.action.confirmed", targetId: "combat-1", createdAt: "2026-07-17T12:02:30.000Z" }],
      actors: [{ id: "actor-1", name: "Valen", type: "character", data: { level: 3, hp: { current: 18, max: 24 }, xp: 900 } }],
      tokens: [],
      chat: [
        { id: "chat-1", body: "The vault is open.", visibility: "public", createdAt: "2026-07-17T12:03:00.000Z" },
        { id: "chat-2", body: "/gm hidden", visibility: "public", createdAt: "2026-07-17T12:04:00.000Z" }
      ]
    } as unknown as SessionRecapSnapshot;

    const body = generateSessionRecapBody(snapshot, since);
    expect(body).toContain("## Rolls");
    expect(body).toContain("Natural 20s: 1");
    expect(body).toContain("## Combat");
    expect(body).toContain("## Current party status");
    expect(body).toContain("not a historical actor snapshot");
    expect(body).toContain("Valen - Level 3, HP 18/24, XP 900");
    expect(body).toContain("The vault is open.");
    expect(body).not.toContain("/gm hidden");
    expect(sessionRecapNaturalTwentyCount(snapshot.rolls)).toBe(1);
    expect(sessionRecapJournalPayload(snapshot, "gm_only", new Date("2026-07-17T12:30:00.000Z"), "session-12")).toMatchObject({
      title: "Session 12: The Broken Vault - Recap",
      visibility: "gm_only",
      tags: ["recap", "session:session-12"],
      body: expect.stringContaining("## Rolls")
    });
  });

  it("uses one session's explicit time window and linked encounters instead of aggregating the campaign", () => {
    const snapshot = {
      campaignSessions: [
        { id: "session-1", status: "completed", title: "Old Road", number: 1, startedAt: "2026-07-17T10:00:00.000Z", endedAt: "2026-07-17T11:00:00.000Z", encounterIds: ["encounter-old"], createdAt: "2026-07-17T09:00:00.000Z" },
        { id: "session-2", status: "completed", title: "Broken Vault", number: 2, startedAt: "2026-07-17T12:00:00.000Z", endedAt: "2026-07-17T13:00:00.000Z", encounterIds: ["encounter-vault"], createdAt: "2026-07-17T11:30:00.000Z" }
      ],
      journals: [],
      rolls: [
        { id: "old-roll", formula: "1d20", total: 20, terms: [{ sides: 20, results: [20] }], createdAt: "2026-07-17T10:30:00.000Z" },
        { id: "vault-roll", formula: "1d20", total: 8, terms: [{ sides: 20, results: [8] }], createdAt: "2026-07-17T12:30:00.000Z" },
        { id: "later-roll", formula: "1d20", total: 19, terms: [{ sides: 20, results: [19] }], createdAt: "2026-07-17T13:30:00.000Z" }
      ],
      combats: [
        { id: "wrong-combat", encounterId: "encounter-old", active: false, round: 9, combatants: [], createdAt: "2026-07-17T12:10:00.000Z", updatedAt: "2026-07-17T12:20:00.000Z" },
        { id: "vault-combat", encounterId: "encounter-vault", active: false, round: 2, combatants: [], createdAt: "2026-07-17T12:10:00.000Z", updatedAt: "2026-07-17T12:20:00.000Z" },
        { id: "vault-combat-2", encounterId: "encounter-vault", active: false, round: 1, combatants: [], createdAt: "2026-07-17T12:25:00.000Z", updatedAt: "2026-07-17T12:35:00.000Z" }
      ],
      combatAudit: [
        { id: "audit-vault-pending", action: "combat.actionPending", targetType: "combat", targetId: "vault-combat", createdAt: "2026-07-17T12:15:00.000Z" },
        { id: "audit-vault-confirmed", action: "combat.actionConfirmed", targetType: "combat", targetId: "vault-combat", createdAt: "2026-07-17T12:16:00.000Z" },
        { id: "audit-vault-2-pending", action: "combat.actionPending", targetType: "combat", targetId: "vault-combat-2", createdAt: "2026-07-17T12:30:00.000Z" }
      ],
      actors: [],
      tokens: [],
      chat: [
        { id: "old-chat", body: "Old road", visibility: "public", createdAt: "2026-07-17T10:30:00.000Z" },
        { id: "vault-chat", body: "Vault open", visibility: "public", createdAt: "2026-07-17T12:30:00.000Z" },
        { id: "later-chat", body: "After party", visibility: "public", createdAt: "2026-07-17T13:30:00.000Z" }
      ]
    } as unknown as SessionRecapSnapshot;

    const scope = sessionRecapScope(snapshot, new Date("2026-07-17T14:00:00.000Z"), "session-2");
    const payload = sessionRecapJournalPayload(snapshot, "public", new Date("2026-07-17T14:00:00.000Z"), "session-2");
    const unselected = sessionRecapJournalPayload(snapshot, "public", new Date("2026-07-17T14:00:00.000Z"));

    expect(scope.session?.id).toBe("session-2");
    expect(payload.title).toBe("Session 2: Broken Vault - Recap");
    expect(payload.tags).toEqual(["recap", "session:session-2"]);
    expect(payload.body).toContain("Scope: Session 2 only");
    expect(payload.body).toContain("1 roll");
    expect(payload.body).toContain("Vault open");
    expect(payload.body).toContain("2 rounds");
    expect(payload.body).toMatch(/2 rounds;[^\n]+actions 1 pending \/ 1 confirmed/);
    expect(payload.body).toMatch(/1 rounds;[^\n]+actions 1 pending \/ 0 confirmed/);
    expect(payload.body).not.toContain("Old road");
    expect(payload.body).not.toContain("After party");
    expect(payload.body).not.toContain("9 rounds");
    expect(unselected.title).toContain("Campaign Activity Recap");
    expect(unselected.tags).toEqual(["recap", "campaign-recap"]);
  });

  it("starts after the newest prior recap and has a deterministic fallback", () => {
    const journals = [
      { tags: ["recap"], createdAt: "2026-07-17T10:00:00.000Z" },
      { tags: ["recap"], createdAt: "2026-07-17T11:00:00.000Z" },
      { tags: [], createdAt: "2026-07-17T12:00:00.000Z" }
    ] as SessionRecapSnapshot["journals"];
    expect(sessionRecapWindowStart(journals).toISOString()).toBe("2026-07-17T11:00:00.000Z");
    expect(sessionRecapWindowStart([], Date.parse("2026-07-17T12:00:00.000Z")).toISOString()).toBe("2026-07-17T00:00:00.000Z");
    const campaignFallback = sessionRecapJournalPayload({ campaignSessions: [], journals, rolls: [], combats: [], combatAudit: [], actors: [], tokens: [], chat: [] } as unknown as SessionRecapSnapshot, "gm_only", new Date("2026-07-17T12:30:00.000Z"));
    expect(campaignFallback.title).toContain("Campaign Activity Recap");
    expect(campaignFallback.tags).toEqual(["recap", "campaign-recap"]);
  });

  it("wires the journal panel button to the generator", () => {
    expect(journalPanelSource).toContain('aria-label="Recap scope"');
    expect(journalPanelSource).toContain("Generate campaign activity recap");
    expect(journalPanelSource).toContain("Generate Session ${recapSession.number} recap");
    expect(appSource).toContain("onGenerateRecap");
  });
});
