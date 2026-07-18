import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JournalEntry } from "@open-tabletop/core";
import { SessionDeskPanel } from "./session-desk-panel.js";
import {
  SESSION_REPORT_REQUIRED_PERMISSIONS,
  prepareSessionReportAttempt,
  sessionReportAllowed,
  sessionReportJournalPayload
} from "./session-report.js";
import type { CampaignSessionInfo } from "./api.js";

const session: CampaignSessionInfo = {
  id: "session/vault-12",
  campaignId: "camp-1",
  status: "live",
  title: "The Broken Vault",
  number: 12,
  agenda: "Open the vault",
  notes: "",
  sceneIds: [],
  encounterIds: [],
  createdBy: "usr-gm",
  updatedBy: "usr-gm",
  createdAt: "2026-07-17T01:00:00.000Z",
  updatedAt: "2026-07-17T01:00:00.000Z"
};

describe("GM session reports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires every GM journal capability and never renders the action for a reader", () => {
    const allPermissions = new Set(SESSION_REPORT_REQUIRED_PERMISSIONS);
    expect(sessionReportAllowed((permission) => allPermissions.has(permission))).toBe(true);
    for (const omitted of SESSION_REPORT_REQUIRED_PERMISSIONS) {
      expect(sessionReportAllowed((permission) => permission !== omitted)).toBe(false);
    }

    const common = {
      campaignId: "camp-1",
      sessions: [session],
      scenes: [],
      encounters: [],
      canManage: false,
      canStart: false,
      onSessionsChange: vi.fn(),
      onSceneActivated: vi.fn(),
      onStatus: vi.fn()
    };
    const reader = renderToStaticMarkup(<SessionDeskPanel {...common} canCreateReport onJournalCreated={vi.fn()} />);
    const gm = renderToStaticMarkup(<SessionDeskPanel {...common} canManage canCreateReport onJournalCreated={vi.fn()} />);

    expect(reader).not.toContain("Session report");
    expect(reader).not.toContain("Create GM-only session report");
    expect(gm).toMatch(/<button[^>]*type="button"[^>]*aria-label="Create GM-only session report for The Broken Vault"/);
    expect(gm).toContain("Session report");
  });

  it("builds a tagged GM-only journal template with every structured evidence field", () => {
    const payload = sessionReportJournalPayload(session);
    const jsonBlock = payload.body.match(/```json\n([\s\S]+)\n```/)?.[1];

    expect(payload).toMatchObject({
      kind: "entry",
      title: "Session report - 12 - The Broken Vault",
      visibility: "gm_only",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["session-report", "dogfood:x01", "session:session/vault-12"],
      links: []
    });
    expect(jsonBlock).toBeTruthy();
    expect(JSON.parse(jsonBlock!)).toEqual({
      schema: "otte.session-report/v1",
      session_id: "session/vault-12",
      session_number: 12,
      session_status: "live",
      breakage: "not_recorded",
      corrections: "not_recorded",
      recovery: "not_recorded",
      privacy: "not_recorded",
      manual_rulings: "not_recorded"
    });
  });

  it("reuses the exact persistence request and idempotency key after a transient error", async () => {
    stubSessionStorage();
    const returned: JournalEntry = {
      id: "jnl-session-report",
      campaignId: "campaign/one",
      kind: "entry",
      title: "Session report - 12 - The Broken Vault",
      body: sessionReportJournalPayload(session).body,
      visibility: "gm_only",
      visibleToUserIds: [],
      visibleToActorIds: [],
      tags: ["session-report", "dogfood:x01", "session:session/vault-12"],
      links: [],
      createdBy: "usr-gm",
      updatedBy: "usr-gm",
      createdAt: "2026-07-17T01:01:00.000Z",
      updatedAt: "2026-07-17T01:01:00.000Z"
    };
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => fetchMock.mock.calls.length === 1
      ? response({ error: "unavailable", message: "temporary outage" }, 503)
      : response(returned));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = prepareSessionReportAttempt("campaign/one", session, "session-report-retry-1");

    await expect(attempt.run()).rejects.toThrow("temporary outage");
    await expect(attempt.run()).resolves.toEqual(returned);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [path, init] of fetchMock.mock.calls) {
      expect(path).toBe("/api/v1/campaigns/campaign%2Fone/journal");
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(attempt.idempotencyKey);
      expect(JSON.parse(String(init?.body))).toEqual(sessionReportJournalPayload(session));
    }
  });
});

function stubSessionStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => key === "otte:sessionTransport" ? "cookie" : key === "otte:userId" ? "usr-gm" : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 3
  } satisfies Storage);
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Service Unavailable",
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}
