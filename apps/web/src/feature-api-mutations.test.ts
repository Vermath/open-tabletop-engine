import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCampaignMemory,
  deleteCampaignMemory,
  transitionCampaignMemory,
  updateCampaignMemory,
  type MemoryDraft
} from "./campaign-memory-panel.js";
import {
  deleteLibraryHandout,
  markHandoutRead,
  persistHandout,
  type HandoutDraft
} from "./handout-library-panel.js";
import {
  completeCampaignSession,
  deleteCampaignSession,
  persistCampaignSession,
  startCampaignSession,
  type SessionDraft
} from "./session-desk-panel.js";
import {
  assignSceneToWorld,
  createWorldAtlasWorld,
  deleteWorldAtlasWorld,
  updateWorldAtlasWorld
} from "./world-atlas-panel.js";

interface CapturedRequest {
  path: string;
  init: RequestInit;
}

describe("feature-surface API mutations", () => {
  let requests: CapturedRequest[];

  beforeEach(() => {
    requests = [];
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => key === "otte:sessionToken" ? "ots_test/token" : key === "otte:sessionTokenUser" || key === "otte:userId" ? "usr_demo_gm" : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 3
    } satisfies Storage);
    vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL, init: RequestInit = {}) => {
      requests.push({ path: String(path), init });
      return jsonResponse({ id: "returned", title: "Returned", name: "Returned" });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires world create, update, assignment, and delete to their REST resources", async () => {
    await createWorldAtlasWorld("camp-1", { name: " Astral Sea ", description: "Wildspace" });
    await updateWorldAtlasWorld("world-1", { name: "Astral Sea", description: "Crystal spheres" });
    await assignSceneToWorld("scene-1", "world-1");
    await assignSceneToWorld("scene-2", "");
    await deleteWorldAtlasWorld("world-1");

    expect(requestSummary(requests)).toEqual([
      ["POST", "/api/v1/campaigns/camp-1/worlds"],
      ["PATCH", "/api/v1/worlds/world-1"],
      ["PATCH", "/api/v1/scenes/scene-1"],
      ["PATCH", "/api/v1/scenes/scene-2"],
      ["DELETE", "/api/v1/worlds/world-1"]
    ]);
    expect(requestBody(requests[2]!)).toEqual({ worldId: "world-1" });
    expect(requestBody(requests[3]!)).toEqual({ worldId: null });
  });

  it("wires handout create, update, read receipt, and delete with normalized targeting", async () => {
    const draft: HandoutDraft = {
      worldId: "world-1",
      title: " Vault Warning ",
      body: " Do not wake it. ",
      visibility: "specific_players",
      visibleToUserIds: ["usr-1"],
      visibleToActorIds: ["actor-hidden"],
      assetIds: ["asset-1"],
      tags: "vault, clue, vault"
    };
    await persistHandout("camp-1", draft);
    await persistHandout("camp-1", { ...draft, id: "handout-1", worldId: "", visibility: "public" });
    await markHandoutRead("handout-1");
    await deleteLibraryHandout("handout-1");

    expect(requestSummary(requests)).toEqual([
      ["POST", "/api/v1/campaigns/camp-1/handouts"],
      ["PATCH", "/api/v1/handouts/handout-1"],
      ["POST", "/api/v1/handouts/handout-1/read"],
      ["DELETE", "/api/v1/handouts/handout-1"]
    ]);
    expect(requestBody(requests[0]!)).toMatchObject({ title: "Vault Warning", body: "Do not wake it.", visibleToUserIds: ["usr-1"], visibleToActorIds: [], tags: ["vault", "clue"] });
    expect(requestBody(requests[1]!)).toMatchObject({ worldId: null, visibleToUserIds: [], visibleToActorIds: [] });
  });

  it("wires memory candidates through create, edit, review, and delete lifecycle routes", async () => {
    const draft: MemoryDraft = {
      text: " The bridge is trapped. ",
      type: "location_profile",
      subject: " Old Bridge ",
      visibility: "gm_only",
      confidence: "1.5",
      source: " Session 4 "
    };
    await createCampaignMemory("camp-1", draft);
    await updateCampaignMemory("memory-1", draft);
    await transitionCampaignMemory("memory-1", "approve");
    await transitionCampaignMemory("memory-2", "reject");
    await deleteCampaignMemory("memory-1");

    expect(requestSummary(requests)).toEqual([
      ["POST", "/api/v1/campaigns/camp-1/ai/memory"],
      ["PATCH", "/api/v1/ai/memory/memory-1"],
      ["POST", "/api/v1/ai/memory/memory-1/approve"],
      ["POST", "/api/v1/ai/memory/memory-2/reject"],
      ["DELETE", "/api/v1/ai/memory/memory-1"]
    ]);
    expect(requestBody(requests[0]!)).toMatchObject({ text: "The bridge is trapped.", subject: "Old Bridge", confidence: 1, source: { type: "manual", label: "Session 4" } });
  });

  it("wires session planning, start, completion, and deletion to the campaign-session lifecycle", async () => {
    const draft: SessionDraft = {
      title: " Session 12 ",
      agenda: "Enter the vault",
      notes: "",
      scheduledFor: "",
      sceneIds: ["scene-1"],
      encounterIds: ["encounter-1"]
    };
    await persistCampaignSession("camp-1", draft);
    await persistCampaignSession("camp-1", { ...draft, id: "session-1" });
    await startCampaignSession("session-1", "scene-1");
    await completeCampaignSession("session-1", "Vault cleared");
    await deleteCampaignSession("session-1");

    expect(requestSummary(requests)).toEqual([
      ["POST", "/api/v1/campaigns/camp-1/sessions"],
      ["PATCH", "/api/v1/campaign-sessions/session-1"],
      ["POST", "/api/v1/campaign-sessions/session-1/start"],
      ["POST", "/api/v1/campaign-sessions/session-1/complete"],
      ["DELETE", "/api/v1/campaign-sessions/session-1"]
    ]);
    expect(requestBody(requests[0]!)).toEqual({ title: "Session 12", agenda: "Enter the vault", notes: "", scheduledFor: null, sceneIds: ["scene-1"], encounterIds: ["encounter-1"] });
    expect(requestBody(requests[2]!)).toEqual({ activateSceneId: "scene-1" });
    expect(requestBody(requests[3]!)).toEqual({ notes: "Vault cleared" });
  });
});

function requestSummary(requests: CapturedRequest[]): Array<[string, string]> {
  return requests.map(({ path, init }) => [String(init.method ?? "GET"), path]);
}

function requestBody(request: CapturedRequest): unknown {
  return request.init.body ? JSON.parse(String(request.init.body)) : undefined;
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
