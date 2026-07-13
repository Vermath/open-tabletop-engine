import type { MapAsset } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInviteSession, apiDelete, apiGet, apiPatch, apiPost, assetBlobUrl, loadSnapshot, loginSession, logoutSession } from "./api.js";

describe("abortable API requests", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards AbortSignal through GET, PATCH, and DELETE requests", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/api/v1/test", { signal: controller.signal });
    await apiPatch("/api/v1/test", { value: 1 }, { signal: controller.signal });
    await apiDelete("/api/v1/test", { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal).toBe(controller.signal);
  });

  it("forwards idempotency keys on authenticated mutations", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/v1/test", { value: 1 }, { idempotencyKey: "setup-step-1" });
    await apiPatch("/api/v1/test", { value: 2 }, { idempotencyKey: "setup-step-2" });
    await apiDelete("/api/v1/test", { idempotencyKey: "setup-step-3" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) expect(new Headers(init?.headers).get("idempotency-key")).toMatch(/^setup-step-/);
  });
});

describe("logoutSession", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("clears the local session when the logout request cannot reach the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    await expect(logoutSession()).rejects.toThrow("offline");
    expect(localStorage.removeItem).toHaveBeenCalledWith("otte:sessionToken");
    expect(localStorage.removeItem).toHaveBeenCalledWith("otte:sessionTokenUser");
  });
});

describe("loginSession", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can defer persistence so only the latest UI session switch stores credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      token: "token-player",
      user: { id: "usr_demo_player", displayName: "Demo Player" },
      session: { id: "session-player", userId: "usr_demo_player" },
      memberships: []
    })));

    const login = await loginSession("usr_demo_player", { persist: false });

    expect(login.user.id).toBe("usr_demo_player");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("acceptInviteSession", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the structured MFA challenge for the invite flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "mfa_required",
      message: "MFA code required",
      mfaRequired: true,
      userId: "usr_existing"
    }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(acceptInviteSession({ token: "oti_test", email: "player@example.test", password: "password1" })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      body: expect.objectContaining({ mfaRequired: true })
    });
  });

  it("sends an MFA code while keeping display name optional for existing users", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      token: "token-invite",
      user: { id: "usr_existing", displayName: "Existing Player" },
      session: { id: "session-invite", userId: "usr_existing" },
      memberships: [],
      campaign: { id: "camp_invited", name: "Invited Campaign" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await acceptInviteSession({ token: "oti_test", email: "player@example.test", password: "password1", mfaCode: "123456" });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      token: "oti_test",
      email: "player@example.test",
      password: "password1",
      mfaCode: "123456"
    });
  });

  it("supports recovery codes and lets callers guard session persistence", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      token: "token-invite",
      user: { id: "usr_existing", displayName: "Existing Player" },
      session: { id: "session-invite", userId: "usr_existing" },
      memberships: [],
      campaign: { id: "camp_invited", name: "Invited Campaign" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await acceptInviteSession(
      { token: "oti_test", email: "player@example.test", password: "password1", recoveryCode: "otte-recovery-code" },
      { persist: false, signal: controller.signal }
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ recoveryCode: "otte-recovery-code" });
    expect(init?.signal).toBe(controller.signal);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("assetBlobUrl", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not expose the active session token in managed asset blob URLs", () => {
    const asset = assetFixture({
      id: "asset_generated_map",
      url: "/api/v1/assets/asset_generated_map/blob"
    });

    expect(assetBlobUrl(asset)).toBe("/api/v1/assets/asset_generated_map/blob");
  });

  it("prefers signed delivery URLs over session-bearing managed asset URLs", () => {
    const asset = assetFixture({
      id: "asset_signed_map",
      url: "/api/v1/assets/asset_signed_map/blob",
      deliveryUrl: "https://assets.example.test/api/v1/assets/asset_signed_map/blob?expiresAt=2026-05-24T16%3A00%3A00.000Z&signature=sig"
    });

    expect(assetBlobUrl(asset)).toBe("https://assets.example.test/api/v1/assets/asset_signed_map/blob?expiresAt=2026-05-24T16%3A00%3A00.000Z&signature=sig");
  });

  it("normalizes trailing API base URLs for managed asset blob URLs without query tokens", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/");
    vi.resetModules();
    const { assetBlobUrl: assetBlobUrlWithBase } = await import("./api.js");
    const asset = assetFixture({
      id: "asset_railway_map",
      url: "/api/v1/assets/asset_railway_map/blob"
    });

    expect(assetBlobUrlWithBase(asset)).toBe("https://api.example.test/api/v1/assets/asset_railway_map/blob");
  });
});


describe("loadSnapshot", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("falls back to side-resource requests when the campaign snapshot has no bundle", async () => {
    const { requests } = mockLoadSnapshotFetch({ bundled: undefined });

    const snapshot = await loadSnapshot("camp_demo");

    expect(snapshot.audioTracks).toEqual([{ id: "aud_1", campaignId: "camp_demo", name: "Fallback Audio" }]);
    expect(snapshot.systems).toEqual([expect.objectContaining({ id: "dnd-5e-srd", active: true, runtimeCapabilities: expect.arrayContaining(["character-templates"]) })]);
    expect(snapshot.characterTemplates).toEqual([{ id: "template_fallback", systemId: "dnd-5e-srd", name: "Fallback Template" }]);
    expect(requests).toHaveLength(16);
    expect(requests).toEqual(
      expect.arrayContaining([
        "/api/v1/campaigns/camp_demo/assets/storage",
        "/api/v1/campaigns/camp_demo/audio",
        "/api/v1/campaigns/camp_demo/content-imports",
        "/api/v1/campaigns/camp_demo/ai/threads",
        "/api/v1/campaigns/camp_demo/ai/usage",
        "/api/v1/campaigns/camp_demo/ai/tool-calls",
        "/api/v1/campaigns/camp_demo/plugins",
        "/api/v1/campaigns/camp_demo/systems",
        "/api/v1/combats/cmb_1/audit",
        "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-templates"
      ])
    );
  });

  it("does not request character templates from a data-only external system", async () => {
    const { requests } = mockLoadSnapshotFetch({
      bundled: undefined,
      systems: [{ id: "data-driven-test", active: true, source: "api", dataDriven: true, runtimeCapabilities: ["data-model"] }]
    });

    const snapshot = await loadSnapshot("camp_demo");

    expect(snapshot.systems).toEqual([expect.objectContaining({ id: "data-driven-test", runtimeCapabilities: ["data-model"] })]);
    expect(snapshot.characterTemplates).toEqual([]);
    expect(requests).not.toContain("/api/v1/campaigns/camp_demo/systems/data-driven-test/character-templates");
  });

  it("uses bundled side resources from the campaign snapshot without fan-out", async () => {
    const bundled = bundledSnapshotResources();
    const { requests } = mockLoadSnapshotFetch({ bundled });

    const snapshot = await loadSnapshot("camp_demo");

    expect(snapshot.assetStorage).toEqual(bundled.assetStorage);
    expect(snapshot.audioTracks).toEqual(bundled.audioTracks);
    expect(snapshot.contentImports).toEqual(bundled.contentImports);
    expect(snapshot.aiThreads).toEqual(bundled.aiThreads);
    expect(snapshot.aiUsage).toEqual(bundled.aiUsage);
    expect(snapshot.aiToolCalls).toEqual(bundled.aiToolCalls);
    expect(snapshot.plugins).toEqual(bundled.plugins);
    expect(snapshot.systems).toEqual(bundled.systems);
    expect(snapshot.combatAudit).toEqual(bundled.combatAudit);
    expect(snapshot.characterTemplates).toEqual(bundled.characterTemplates);
    expect(requests).toEqual([
      "/api/v1/auth/session",
      "/api/v1/campaigns",
      "/api/v1/organization/workspace-defaults",
      "/api/v1/organization/members",
      "/api/v1/organization/invites",
      "/api/v1/campaigns/camp_demo/snapshot"
    ]);
  });

  it("does not fan out to permissioned side routes when the current snapshot intentionally omits them", async () => {
    const { assetStorage: _assetStorage, characterTemplates: _characterTemplates, ...restrictedBundle } = bundledSnapshotResources();
    const { requests } = mockLoadSnapshotFetch({ bundled: restrictedBundle, permissions: ["campaign.read"] });

    const snapshot = await loadSnapshot("camp_demo");

    expect(snapshot.assetStorage).toBeUndefined();
    expect(snapshot.characterTemplates).toEqual([]);
    expect(requests).not.toContain("/api/v1/campaigns/camp_demo/assets/storage");
    expect(requests).not.toContain("/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-templates");
  });

  it("adds signed delivery URLs to managed audio tracks", async () => {
    const bundled = {
      ...bundledSnapshotResources(),
      audioTracks: [
        {
          id: "aud_managed",
          campaignId: "camp_demo",
          createdBy: "usr_demo_gm",
          name: "Managed Audio",
          url: "/api/v1/assets/asset_audio/blob",
          kind: "ambient",
          loop: true,
          playing: true,
          volume: 1,
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z"
        }
      ]
    };
    const { requests } = mockLoadSnapshotFetch({ bundled });

    const snapshot = await loadSnapshot("camp_demo");

    expect(snapshot.audioTracks[0]).toEqual(
      expect.objectContaining({
        id: "aud_managed",
        deliveryUrl: "https://assets.example.test/api/v1/assets/asset_audio/blob?expiresAt=2026-07-04T00%3A05%3A00.000Z&signature=sig"
      })
    );
    expect(requests).toContain("/api/v1/assets/asset_audio/delivery-url");
  });
});
function assetFixture(overrides: Partial<MapAsset> & { deliveryUrl?: string } = {}): MapAsset & { deliveryUrl?: string } {
  return {
    id: "asset_fixture",
    campaignId: "camp_demo",
    name: "Fixture Map",
    url: "/api/v1/assets/asset_fixture/blob",
    mimeType: "image/png",
    sizeBytes: 68,
    checksum: "sha256:test",
    createdAt: "2026-05-24T10:00:00.000Z",
    updatedAt: "2026-05-24T10:00:00.000Z",
    ...overrides
  };
}

function stubSessionStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => {
      if (key === "otte:sessionToken") return "ots_test/token";
      if (key === "otte:sessionTokenUser" || key === "otte:userId") return "usr_demo_gm";
      return null;
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 3
  } satisfies Storage);
}
type BundledSnapshotResources = ReturnType<typeof bundledSnapshotResources>;

function mockLoadSnapshotFetch(input: { bundled?: Partial<BundledSnapshotResources>; systems?: unknown[]; permissions?: string[] }) {
  const requests: string[] = [];
  const routes = new Map<string, unknown>([
    ["/api/v1/auth/session", sessionFixture()],
    ["/api/v1/campaigns", [campaignFixture()]],
    ["/api/v1/organization/workspace-defaults", { id: "org_demo", name: "Demo Workspace" }],
    ["/api/v1/organization/members", []],
    ["/api/v1/organization/invites", []],
    ["/api/v1/campaigns/camp_demo/snapshot", campaignSnapshotFixture(input.bundled, input.permissions)],
    ["/api/v1/campaigns/camp_demo/assets/storage", { campaignId: "camp_demo", assetCount: 1 }],
    ["/api/v1/campaigns/camp_demo/audio", [{ id: "aud_1", campaignId: "camp_demo", name: "Fallback Audio" }]],
    ["/api/v1/campaigns/camp_demo/content-imports", [{ id: "imp_1", campaignId: "camp_demo" }]],
    ["/api/v1/campaigns/camp_demo/ai/threads", [{ id: "thr_1", campaignId: "camp_demo" }]],
    ["/api/v1/campaigns/camp_demo/ai/usage", { campaignId: "camp_demo", threadCount: 1 }],
    ["/api/v1/campaigns/camp_demo/ai/tool-calls", [{ id: "tool_1", threadId: "thr_1" }]],
    ["/api/v1/campaigns/camp_demo/plugins", [{ id: "plugin_1", installed: false }]],
    ["/api/v1/campaigns/camp_demo/systems", input.systems ?? [{ id: "dnd-5e-srd", active: true, runtimeCapabilities: ["data-model", "character-templates"] }]],
    ["/api/v1/combats/cmb_1/audit", [{ id: "audit_1", targetId: "cmb_1" }]],
    ["/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-templates", [{ id: "template_fallback", systemId: "dnd-5e-srd", name: "Fallback Template" }]],
    ["/api/v1/assets/asset_audio/delivery-url", { url: "https://assets.example.test/api/v1/assets/asset_audio/blob?expiresAt=2026-07-04T00%3A05%3A00.000Z&signature=sig", expiresAt: "2026-07-04T00:05:00.000Z" }]
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: RequestInfo | URL) => {
      const key = String(path);
      requests.push(key);
      if (!routes.has(key)) throw new Error(`Unhandled request: ${key}`);
      return jsonResponse(routes.get(key));
    })
  );
  return { requests };
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

function sessionFixture() {
  return {
    user: { id: "usr_demo_gm", displayName: "Demo GM" },
    organization: { id: "org_demo" },
    organizations: [{ id: "org_demo", role: "owner", memberCount: 1, campaignCount: 1 }]
  };
}

function campaignFixture() {
  return { id: "camp_demo", name: "Demo Campaign", defaultSystemId: "dnd-5e-srd" };
}

function campaignSnapshotFixture(bundled?: Partial<BundledSnapshotResources>, permissions = ["campaign.update", "scene.read", "actor.read", "ai.proposeChanges"]) {
  return {
    generatedAt: "2026-07-04T00:00:00.000Z",
    campaign: campaignFixture(),
    members: [
      {
        userId: "usr_demo_gm",
        role: "owner",
        user: { id: "usr_demo_gm", displayName: "Demo GM" },
        permissions
      }
    ],
    scenes: [],
    tokens: [],
    fogPresets: [],
    assets: [],
    actors: [],
    items: [],
    journals: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    encounters: [],
    combats: [{ id: "cmb_1", campaignId: "camp_demo", active: true }],
    proposals: [],
    memory: [],
    ...(bundled !== undefined ? { bundled } : {})
  };
}

function bundledSnapshotResources() {
  return {
    assetStorage: { campaignId: "camp_demo", assetCount: 2 },
    audioTracks: [{ id: "aud_bundle", campaignId: "camp_demo", name: "Bundled Audio" }],
    plugins: [{ id: "plugin_bundle", installed: true }],
    systems: [{ id: "dnd-5e-srd", active: true }],
    characterTemplates: [{ id: "template_bundle", systemId: "dnd-5e-srd", name: "Bundled Template" }],
    contentImports: [{ id: "imp_bundle", campaignId: "camp_demo" }],
    aiThreads: [{ id: "thr_bundle", campaignId: "camp_demo" }],
    aiUsage: { campaignId: "camp_demo", threadCount: 1 },
    aiToolCalls: [{ id: "tool_bundle", threadId: "thr_bundle" }],
    combatAudit: [{ id: "audit_bundle", targetId: "cmb_1" }]
  };
}
