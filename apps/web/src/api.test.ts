import type { MapAsset } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInviteSession, apiDelete, apiGet, apiPatch, apiPost, apiUploadAsset, assetBlobUrl, assetThumbnailUrl, consumeSsoRedirect, loadSnapshot, loginPasswordSession, loginSession, logoutSession, removeCampaignMember, transferCampaignOwnership, updateCampaignMember, type CampaignMemberInfo } from "./api.js";

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

  it("submits ownership transfer revision and retry identity separately", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      campaign: { id: "camp_1" },
      previousOwner: { userId: "usr_owner" },
      newOwner: { userId: "usr_player" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await transferCampaignOwnership("camp/1", {
      targetUserId: "usr_player",
      expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      reason: "New season"
    }, "campaign-transfer-attempt-1", { signal: controller.signal });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/campaigns/camp%2F1/ownership-transfer");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("campaign-transfer-attempt-1");
    expect(init?.signal).toBe(controller.signal);
    expect(JSON.parse(String(init?.body))).toEqual({
      targetUserId: "usr_player",
      expectedUpdatedAt: "2026-07-13T00:00:00.000Z",
      reason: "New season"
    });
  });

  it("uses exact campaign-member revisions and idempotency identities", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ id: "mem/1" }));
    vi.stubGlobal("fetch", fetchMock);
    const member = { id: "mem/1", updatedAt: "2026-07-15T00:00:00.000Z" } as CampaignMemberInfo;

    await updateCampaignMember("camp/1", member, "observer", { idempotencyKey: "member-role-1" });
    await removeCampaignMember("camp/1", member, { idempotencyKey: "member-remove-1" });

    const [updatePath, updateInit] = fetchMock.mock.calls[0] ?? [];
    expect(updatePath).toBe("/api/v1/campaigns/camp%2F1/members/mem%2F1");
    expect(new Headers(updateInit?.headers).get("idempotency-key")).toBe("member-role-1");
    expect(JSON.parse(String(updateInit?.body))).toEqual({ role: "observer", expectedUpdatedAt: member.updatedAt });
    const [removePath, removeInit] = fetchMock.mock.calls[1] ?? [];
    expect(removePath).toBe("/api/v1/campaigns/camp%2F1/members/mem%2F1?expectedUpdatedAt=2026-07-15T00%3A00%3A00.000Z");
    expect(new Headers(removeInit?.headers).get("idempotency-key")).toBe("member-remove-1");
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

  it("confirms an accepted browser cookie before storing transport state", async () => {
    const login = {
      token: "token-owner",
      user: { id: "usr_owner", displayName: "Owner" },
      session: { id: "session-owner", userId: "usr_owner" },
      memberships: []
    };
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => String(path).endsWith("/api/v1/auth/login")
      ? jsonResponse(login)
      : jsonResponse({ user: login.user, session: login.session }));
    vi.stubGlobal("fetch", fetchMock);

    await loginPasswordSession({ email: "owner@example.test", password: "correct-password" });

    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual(["/api/v1/auth/login", "/api/v1/auth/session"]);
    expect(localStorage.setItem).toHaveBeenCalledWith("otte:sessionTransport", "cookie");
    expect(localStorage.removeItem).toHaveBeenCalledWith("otte:sessionToken");
  });

  it("rejects an unconfirmed cookie, clears it remotely, and preserves local transport state", async () => {
    const login = {
      token: "token-owner",
      user: { id: "usr_owner", displayName: "Owner" },
      session: { id: "session-owner", userId: "usr_owner" },
      memberships: []
    };
    const fetchMock = vi.fn(async (path: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(path);
      if (url.endsWith("/api/v1/auth/login")) return jsonResponse(login);
      if (url.endsWith("/api/v1/auth/session")) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginPasswordSession({ email: "owner@example.test", password: "correct-password" })).rejects.toMatchObject({ status: 401 });

    expect(fetchMock.mock.calls.map(([path]) => String(path))).toEqual(["/api/v1/auth/login", "/api/v1/auth/session", "/api/v1/auth/logout"]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === "include")).toBe(true);
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
    vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL) => String(path).includes("/invites/preview")
      ? jsonResponse({ expectedUpdatedAt: "2026-07-13T00:00:00.000Z" })
      : new Response(JSON.stringify({
          error: "mfa_required",
          message: "MFA code required",
          mfaRequired: true,
          userId: "usr_existing"
        }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(acceptInviteSession({ token: "oti_test", email: "player@example.test", password: "password1" }, { idempotencyKey: "invite-accept-mfa-test" })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      body: expect.objectContaining({ mfaRequired: true })
    });
  });

  it("sends an MFA code while keeping display name optional for existing users", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, _init?: RequestInit) => String(path).includes("/invites/preview")
      ? jsonResponse({ expectedUpdatedAt: "2026-07-13T00:00:00.000Z" })
      : jsonResponse({
          token: "token-invite",
          user: { id: "usr_existing", displayName: "Existing Player" },
          session: { id: "session-invite", userId: "usr_existing" },
          memberships: [],
          campaign: { id: "camp_invited", name: "Invited Campaign" }
        }));
    vi.stubGlobal("fetch", fetchMock);

    await acceptInviteSession({ token: "oti_test", email: "player@example.test", password: "password1", mfaCode: "123456" }, { idempotencyKey: "invite-accept-code-test" });

    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      token: "oti_test",
      email: "player@example.test",
      password: "password1",
      mfaCode: "123456",
      expectedUpdatedAt: "2026-07-13T00:00:00.000Z"
    });
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("invite-accept-code-test");
  });

  it("supports recovery codes and lets callers guard session persistence", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, _init?: RequestInit) => String(path).includes("/invites/preview")
      ? jsonResponse({ expectedUpdatedAt: "2026-07-13T00:00:00.000Z" })
      : jsonResponse({
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
      { persist: false, signal: controller.signal, idempotencyKey: "invite-accept-recovery-test" }
    );

    const [, init] = fetchMock.mock.calls[1] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ recoveryCode: "otte-recovery-code" });
    expect(init?.signal).toBe(controller.signal);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});

describe("consumeSsoRedirect", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("derives the SSO identity from the authenticated cookie session, not the URL fragment", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#ssoToken=otte-cookie-session&ssoUserId=usr_attacker", pathname: "/table", search: "?join=1" },
      history: { replaceState },
    });
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ user: { id: "usr_authenticated" }, session: { userId: "usr_authenticated" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(consumeSsoRedirect()).resolves.toBe("usr_authenticated");

    expect(localStorage.setItem).toHaveBeenCalledWith("otte:userId", "usr_authenticated");
    expect(localStorage.setItem).not.toHaveBeenCalledWith("otte:userId", "usr_attacker");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/table?join=1");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("keeps the callback marker until a transient session-verification failure can be retried", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#ssoToken=otte-cookie-session", pathname: "/table", search: "?join=1" },
      history: { replaceState },
    });
    let verificationAttempts = 0;
    const fetchMock = vi.fn(async () => {
      verificationAttempts += 1;
      if (verificationAttempts === 1) throw new Error("temporary network failure");
      return jsonResponse({ user: { id: "usr_authenticated" }, session: { userId: "usr_authenticated" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(consumeSsoRedirect()).rejects.toThrow("temporary network failure");
    expect(replaceState).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();

    await expect(consumeSsoRedirect()).resolves.toBe("usr_authenticated");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/table?join=1");
  });
});

describe("legacy session migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("binds both upgrade phases to the expected user and removes the raw bearer only after cookie authentication", async () => {
    const values = new Map<string, string>([
      ["otte:sessionToken", "ots_legacy"],
      ["otte:sessionTokenUser", "usr_legacy"],
      ["otte:userId", "usr_legacy"],
    ]);
    stubMutableSessionStorage(values);
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      const url = String(path);
      const callNumber = fetchMock.mock.calls.length;
      if (url.endsWith("/upgrade-cookie/confirm") && callNumber === 1) return new Response("unauthorized", { status: 401 });
      if (url.endsWith("/upgrade-cookie")) return jsonResponse({ session: { userId: "usr_legacy" } });
      if (url.endsWith("/upgrade-cookie/confirm")) return jsonResponse({ upgradeConfirmed: true, session: { userId: "usr_legacy" } }, { "x-otte-session-transport": "cookie" });
      if (url.endsWith("/auth/session")) return jsonResponse({ user: { id: "usr_legacy" }, session: { userId: "usr_legacy" } });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { apiGet: migratedApiGet } = await import("./api.js");

    await migratedApiGet("/api/v1/test");

    expect(values.has("otte:sessionToken")).toBe(false);
    expect(values.has("otte:sessionTokenUser")).toBe(false);
    expect(values.get("otte:sessionTransport")).toBe("cookie");
    const upgradeBodies = fetchMock.mock.calls
      .filter(([path]) => String(path).includes("upgrade-cookie"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(upgradeBodies).toEqual([
      { expectedUserId: "usr_legacy" },
      { expectedUserId: "usr_legacy" },
      { expectedUserId: "usr_legacy" },
    ]);
    expect(fetchMock.mock.calls.map(([path]) => String(path))).toContain("/api/v1/auth/session");
  });

  it("retries confirmation with the promoted cookie when the first confirmation response is lost", async () => {
    const values = new Map<string, string>([
      ["otte:sessionToken", "ots_legacy"],
      ["otte:sessionTokenUser", "usr_legacy"],
      ["otte:userId", "usr_legacy"],
    ]);
    stubMutableSessionStorage(values);
    let confirmationAttempts = 0;
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => {
      const url = String(path);
      if (url.endsWith("/upgrade-cookie/confirm")) {
        confirmationAttempts += 1;
        if (confirmationAttempts === 1) return new Response("unauthorized", { status: 401 });
        if (confirmationAttempts === 2) throw new Error("confirmation response lost");
        return jsonResponse({ upgradeConfirmed: true, session: { userId: "usr_legacy" } }, { "x-otte-session-transport": "cookie" });
      }
      if (url.endsWith("/upgrade-cookie")) return jsonResponse({ session: { userId: "usr_legacy" } });
      if (url.endsWith("/auth/session")) return jsonResponse({ user: { id: "usr_legacy" }, session: { userId: "usr_legacy" } });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { apiGet: migratedApiGet } = await import("./api.js");

    await expect(migratedApiGet("/api/v1/test")).rejects.toThrow("confirmation response lost");
    expect(values.get("otte:sessionToken")).toBe("ots_legacy");
    expect(values.get("otte:sessionTokenUser")).toBe("usr_legacy");

    await expect(migratedApiGet("/api/v1/test")).resolves.toEqual({ ok: true });
    expect(confirmationAttempts).toBe(3);
    expect(fetchMock.mock.calls.filter(([path]) => String(path).endsWith("/upgrade-cookie"))).toHaveLength(1);
    expect(values.has("otte:sessionToken")).toBe(false);
    expect(values.has("otte:sessionTokenUser")).toBe(false);
    expect(values.get("otte:sessionTransport")).toBe("cookie");
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

  it("selects persisted thumbnail and optimized variants without changing authorization", () => {
    const asset = assetFixture({
      id: "asset_renditions",
      url: "/api/v1/assets/asset_renditions/blob",
      deliveryUrl: "https://assets.example.test/api/v1/assets/asset_renditions/blob?expiresAt=1&signature=sig",
      renditions: [
        { kind: "thumbnail", mimeType: "image/webp", sizeBytes: 100, checksum: "sha256:thumb", width: 320, height: 180, storage: { provider: "local", key: "thumb" }, createdAt: "2026-07-13T00:00:00.000Z" },
        { kind: "optimized", mimeType: "image/webp", sizeBytes: 500, checksum: "sha256:optimized", width: 2048, height: 1152, storage: { provider: "local", key: "optimized" }, createdAt: "2026-07-13T00:00:00.000Z" }
      ]
    });

    expect(assetThumbnailUrl(asset)).toBe("https://assets.example.test/api/v1/assets/asset_renditions/blob?expiresAt=1&signature=sig&variant=thumbnail");
    expect(assetThumbnailUrl(assetFixture({ id: "asset_original", url: "/api/v1/assets/asset_original/blob" }))).toBe("/api/v1/assets/asset_original/blob");
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

describe("apiUploadAsset mutation guards", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a stable key and the exact scene revision for background uploads", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ asset: { id: "asset-one" }, scene: { id: "scene-one" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = { name: "vault.png", type: "image/png", size: 123, lastModified: 1 } as File;

    await apiUploadAsset({ campaignId: "camp-one", sceneId: "scene-one", expectedSceneUpdatedAt: "2026-07-13T00:00:00.000Z", setAsBackground: true, file }, { idempotencyKey: "asset-upload-attempt", signal: new AbortController().signal });

    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(path)).toContain("sceneId=scene-one&setAsBackground=true&expectedSceneUpdatedAt=2026-07-13T00%3A00%3A00.000Z");
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("asset-upload-attempt");
    expect(init?.body).toBe(file);
  });

  it("refuses a background upload without a reviewed scene revision", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const file = { name: "vault.png", type: "image/png", size: 123, lastModified: 1 } as File;
    await expect(apiUploadAsset({ campaignId: "camp-one", sceneId: "scene-one", setAsBackground: true, file }, { idempotencyKey: "asset-upload-attempt" })).rejects.toThrow("current scene revision");
    expect(fetch).not.toHaveBeenCalled();
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

    expect(snapshot.presences).toEqual([expect.objectContaining({ userId: "usr_demo_gm", displayName: "Demo GM" })]);
    expect(snapshot.eventSequence).toBe(7);
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
      if (key === "otte:userId") return "usr_demo_gm";
      if (key === "otte:sessionTransport") return "cookie";
      return null;
    }),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 2
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

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
}

function stubMutableSessionStorage(values: Map<string, string>): void {
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size; },
  } satisfies Storage);
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
    eventSequence: 7,
    realtimeRecovery: "refetch_snapshot_on_gap",
    campaign: campaignFixture(),
    members: [
      {
        userId: "usr_demo_gm",
        role: "owner",
        user: { id: "usr_demo_gm", displayName: "Demo GM" },
        permissions
      }
    ],
    presences: [{ campaignId: "camp_demo", userId: "usr_demo_gm", displayName: "Demo GM", role: "owner", connectionCount: 1, connectedAt: "2026-07-04T00:00:00.000Z", lastSeenAt: "2026-07-04T00:00:01.000Z", activeSceneIds: [] }],
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
