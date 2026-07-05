import type { MapAsset } from "@open-tabletop/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assetBlobUrl, loadSnapshot } from "./api.js";

describe("assetBlobUrl", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("adds the active session token to managed asset blob URLs when no signed delivery URL is present", () => {
    const asset = assetFixture({
      id: "asset_generated_map",
      url: "/api/v1/assets/asset_generated_map/blob"
    });

    expect(assetBlobUrl(asset)).toBe("/api/v1/assets/asset_generated_map/blob?sessionToken=ots_test%2Ftoken");
  });

  it("prefers the active session URL over signed delivery URLs for managed in-app images", () => {
    const asset = assetFixture({
      id: "asset_signed_map",
      url: "/api/v1/assets/asset_signed_map/blob",
      deliveryUrl: "https://assets.example.test/api/v1/assets/asset_signed_map/blob?expiresAt=2026-05-24T16%3A00%3A00.000Z&signature=sig"
    });

    expect(assetBlobUrl(asset)).toBe("/api/v1/assets/asset_signed_map/blob?sessionToken=ots_test%2Ftoken");
  });

  it("normalizes trailing API base URLs for authenticated managed asset blob URLs", async () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.test/");
    vi.resetModules();
    const { assetBlobUrl: assetBlobUrlWithBase } = await import("./api.js");
    const asset = assetFixture({
      id: "asset_railway_map",
      url: "/api/v1/assets/asset_railway_map/blob"
    });

    expect(assetBlobUrlWithBase(asset)).toBe("https://api.example.test/api/v1/assets/asset_railway_map/blob?sessionToken=ots_test%2Ftoken");
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
    expect(snapshot.systems).toEqual([{ id: "dnd-5e-srd", active: true }]);
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

function mockLoadSnapshotFetch(input: { bundled?: BundledSnapshotResources }) {
  const requests: string[] = [];
  const routes = new Map<string, unknown>([
    ["/api/v1/auth/session", sessionFixture()],
    ["/api/v1/campaigns", [campaignFixture()]],
    ["/api/v1/organization/workspace-defaults", { id: "org_demo", name: "Demo Workspace" }],
    ["/api/v1/organization/members", []],
    ["/api/v1/organization/invites", []],
    ["/api/v1/campaigns/camp_demo/snapshot", campaignSnapshotFixture(input.bundled)],
    ["/api/v1/campaigns/camp_demo/assets/storage", { campaignId: "camp_demo", assetCount: 1 }],
    ["/api/v1/campaigns/camp_demo/audio", [{ id: "aud_1", campaignId: "camp_demo", name: "Fallback Audio" }]],
    ["/api/v1/campaigns/camp_demo/content-imports", [{ id: "imp_1", campaignId: "camp_demo" }]],
    ["/api/v1/campaigns/camp_demo/ai/threads", [{ id: "thr_1", campaignId: "camp_demo" }]],
    ["/api/v1/campaigns/camp_demo/ai/usage", { campaignId: "camp_demo", threadCount: 1 }],
    ["/api/v1/campaigns/camp_demo/ai/tool-calls", [{ id: "tool_1", threadId: "thr_1" }]],
    ["/api/v1/campaigns/camp_demo/plugins", [{ id: "plugin_1", installed: false }]],
    ["/api/v1/campaigns/camp_demo/systems", [{ id: "dnd-5e-srd", active: true }]],
    ["/api/v1/combats/cmb_1/audit", [{ id: "audit_1", targetId: "cmb_1" }]],
    ["/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/character-templates", [{ id: "template_fallback", systemId: "dnd-5e-srd", name: "Fallback Template" }]]
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

function campaignSnapshotFixture(bundled?: BundledSnapshotResources) {
  return {
    generatedAt: "2026-07-04T00:00:00.000Z",
    campaign: campaignFixture(),
    members: [
      {
        userId: "usr_demo_gm",
        role: "owner",
        user: { id: "usr_demo_gm", displayName: "Demo GM" },
        permissions: ["campaign.update", "ai.proposeChanges"]
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
