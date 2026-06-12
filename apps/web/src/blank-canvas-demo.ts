import { permissionsForRole } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";

export const blankCanvasDemoUserId = "usr_blank_canvas_demo";
export const blankCanvasDemoOrganizationId = "org_blank_canvas_demo";
export const blankCanvasDemoCampaignId = "camp_blank_canvas_demo";
export const blankCanvasDemoSceneId = "scn_blank_canvas_demo";
export const blankCanvasDemoSystemId = "generic-fantasy";
export const blankCanvasDemoNotice = "Demo mode: changes are local to this tab and reset when you leave or refresh.";

const blankCanvasDemoPermissions = permissionsForRole("gm");

export function createBlankCanvasDemoSnapshot(timestamp = new Date().toISOString()): Snapshot {
  const workspace: Snapshot["organizations"][number] = {
    id: blankCanvasDemoOrganizationId,
    name: "Blank Canvas Demo",
    ownerUserId: blankCanvasDemoUserId,
    defaultSystemId: blankCanvasDemoSystemId,
    defaultCampaignVisibility: "private",
    defaultPermissionTemplate: "standard",
    defaultInviteRole: "player",
    defaultSceneName: "Blank Canvas",
    defaultSceneFolder: "Demo",
    defaultSceneWidth: 1200,
    defaultSceneHeight: 800,
    defaultSceneGridSize: 50,
    onboardingTitle: "",
    onboardingBody: "",
    role: "owner",
    memberCount: 1,
    campaignCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    session: {
      user: {
        id: blankCanvasDemoUserId,
        displayName: "Demo GM",
        email: "demo@example.test",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      session: {
        id: "sess_blank_canvas_demo",
        userId: blankCanvasDemoUserId,
        activeOrganizationId: blankCanvasDemoOrganizationId,
        expiresAt: timestamp,
        lastSeenAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      memberships: [
        {
          id: "mem_blank_canvas_demo",
          campaignId: blankCanvasDemoCampaignId,
          userId: blankCanvasDemoUserId,
          role: "gm",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      organization: workspace,
      organizations: [workspace]
    },
    workspaceDefaults: workspace,
    organizations: [workspace],
    organizationMembers: [
      {
        id: "orgmem_blank_canvas_demo",
        organizationId: blankCanvasDemoOrganizationId,
        userId: blankCanvasDemoUserId,
        role: "owner",
        user: {
          id: blankCanvasDemoUserId,
          displayName: "Demo GM",
          email: "demo@example.test"
        },
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    organizationInvites: [],
    campaigns: [
      {
        id: blankCanvasDemoCampaignId,
        organizationId: blankCanvasDemoOrganizationId,
        ownerUserId: blankCanvasDemoUserId,
        name: "Blank Canvas Demo",
        description: "A local-only tabletop workspace for trying the engine.",
        defaultSystemId: blankCanvasDemoSystemId,
        visibility: "private",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    members: [
      {
        id: "mem_blank_canvas_demo",
        campaignId: blankCanvasDemoCampaignId,
        userId: blankCanvasDemoUserId,
        role: "gm",
        user: {
          id: blankCanvasDemoUserId,
          displayName: "Demo GM",
          email: "demo@example.test"
        },
        permissions: blankCanvasDemoPermissions,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    scenes: [
      {
        id: blankCanvasDemoSceneId,
        campaignId: blankCanvasDemoCampaignId,
        name: "Blank Canvas",
        width: 1200,
        height: 800,
        gridType: "square",
        gridSize: 50,
        folder: "Demo",
        active: true,
        sortOrder: 1,
        fog: [],
        walls: [],
        lights: [],
        annotations: [],
        metadata: {},
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    fogPresets: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    vision: {
      sceneId: blankCanvasDemoSceneId,
      userId: blankCanvasDemoUserId,
      fogActive: false,
      polygons: []
    },
    journals: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    audioTracks: [],
    encounters: [],
    combats: [],
    combatAudit: [],
    proposals: [],
    contentImports: [],
    memory: [],
    aiThreads: [],
    aiUsage: {
      campaignId: blankCanvasDemoCampaignId,
      threadCount: 0,
      completedThreadCount: 0,
      failedThreadCount: 0,
      runningThreadCount: 0,
      retryAttempts: 0,
      eventCount: 0,
      toolCallCount: 0,
      durationMs: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0
      },
      providers: []
    },
    aiToolCalls: [],
    plugins: [],
    systems: [],
    characterTemplates: []
  };
}
