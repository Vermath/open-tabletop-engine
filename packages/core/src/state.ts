import { createId, nowIso } from "./ids.js";
import type { Actor, Campaign, CampaignArchive, CampaignMember, DiceMacro, EngineState, JournalEntry, OrganizationMember, Scene, Token, User } from "./types.js";

export function emptyState(): EngineState {
  return {
    users: [],
    sessions: [],
    identities: [],
    oauthStates: [],
    passwordResetTokens: [],
    emailOutbox: [],
    scimGroups: [],
    scimGroupRoleMappings: [],
    organizations: [],
    organizationMembers: [],
    invites: [],
    campaigns: [],
    members: [],
    worlds: [],
    scenes: [],
    assets: [],
    tokens: [],
    actors: [],
    items: [],
    journals: [],
    handouts: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    encounters: [],
    combats: [],
    compendia: [],
    proposals: [],
    aiThreads: [],
    aiEvaluations: [],
    aiMemory: [],
    aiToolCalls: [],
    auditLogs: [],
    permissionGrants: [],
    pluginStorage: [],
    pluginReviews: [],
    contentImports: [],
    fogPresets: [],
    idempotencyRecords: [],
    jobs: []
  };
}

export function seedState(): EngineState {
  const state = emptyState();
  const now = nowIso();
  const user: User = {
    id: "usr_demo_gm",
    displayName: "Demo GM",
    email: "gm@example.test",
    createdAt: now,
    updatedAt: now
  };
  const player: User = {
    id: "usr_demo_player",
    displayName: "Demo Player",
    email: "player@example.test",
    createdAt: now,
    updatedAt: now
  };
  const campaign: Campaign = {
    id: "camp_demo",
    organizationId: "org_demo",
    ownerUserId: user.id,
    name: "The Ember Vault",
    description: "A sample fantasy campaign for local development.",
    defaultSystemId: "dnd-5e-srd",
    visibility: "private",
    createdAt: now,
    updatedAt: now
  };
  state.organizations.push({
    id: "org_demo",
    name: "Demo Workspace",
    ownerUserId: user.id,
    defaultSystemId: campaign.defaultSystemId,
    defaultCampaignVisibility: "private",
    defaultPermissionTemplate: "standard",
    defaultInviteRole: "player",
    defaultSceneName: "Opening Scene",
    defaultSceneFolder: "session-0",
    defaultSceneWidth: 1200,
    defaultSceneHeight: 800,
    defaultSceneGridSize: 50,
    onboardingTitle: "Welcome to the Table",
    onboardingBody: "",
    createdAt: now,
    updatedAt: now
  });
  const organizationMember: OrganizationMember = {
    id: "orgmem_demo_gm",
    organizationId: "org_demo",
    userId: user.id,
    role: "owner",
    createdAt: now,
    updatedAt: now
  };
  const playerOrganizationMember: OrganizationMember = {
    id: "orgmem_demo_player",
    organizationId: "org_demo",
    userId: player.id,
    role: "member",
    createdAt: now,
    updatedAt: now
  };
  const member: CampaignMember = {
    id: "mem_demo_gm",
    campaignId: campaign.id,
    userId: user.id,
    role: "owner",
    createdAt: now,
    updatedAt: now
  };
  const playerMember: CampaignMember = {
    id: "mem_demo_player",
    campaignId: campaign.id,
    userId: player.id,
    role: "player",
    createdAt: now,
    updatedAt: now
  };
  const scene: Scene = {
    id: "scn_vault_entry",
    campaignId: campaign.id,
    name: "Vault Entry",
    width: 1200,
    height: 800,
    gridType: "square",
    gridSize: 50,
    active: true,
    sortOrder: 1,
    fog: [{ id: "fog_center", x: 540, y: 360, radius: 190, hidden: false }],
    fogHistory: [],
    activationHistory: [{ id: "sact_vault_entry", sceneId: "scn_vault_entry", activatedAt: now, activatedByUserId: user.id, deactivatedSceneIds: [], source: "create" }],
    annotationHistory: [],
    walls: [
      {
        id: "wall_north",
        x1: 250,
        y1: 180,
        x2: 920,
        y2: 180,
        blocksVision: true,
        blocksMovement: true,
        kind: "wall"
      }
    ],
    lights: [{ id: "light_brazier", x: 320, y: 320, radius: 180, color: "#f59e0b", intensity: 0.24 }],
    annotations: [],
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
  const actor: Actor = {
    id: "act_valen",
    campaignId: campaign.id,
    systemId: "generic-fantasy",
    ownerUserId: player.id,
    type: "character",
    name: "Valen Ash",
    data: {
      attributes: {
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 11,
        wisdom: 10,
        charisma: 15
      },
      hp: { current: 18, max: 22 },
      resources: { focus: 3 }
    },
    permissions: {},
    createdAt: now,
    updatedAt: now
  };
  const token: Token = {
    id: "tok_valen",
    sceneId: scene.id,
    actorId: actor.id,
    name: actor.name,
    x: 300,
    y: 350,
    width: 50,
    height: 50,
    rotation: 0,
    layer: "player",
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 180,
    disposition: "friendly",
    notes: "",
    conditions: [],
    auras: [],
    targetedByUserIds: [],
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
  const journal: JournalEntry = {
    id: "jnl_hook",
    campaignId: campaign.id,
    title: "Session Hook",
    body: "The vault door opens only when the party lights both braziers and speaks the founder's oath.",
    visibility: "gm_only",
    visibleToUserIds: [],
    visibleToActorIds: [],
    tags: ["prep", "secret"],
    createdBy: user.id,
    updatedBy: user.id,
    createdAt: now,
    updatedAt: now
  };
  const macro: DiceMacro = {
    id: "mac_demo_attack",
    campaignId: campaign.id,
    createdBy: user.id,
    name: "Attack Check",
    formula: "1d20+5",
    visibility: "public",
    createdAt: now,
    updatedAt: now
  };

  state.users.push(user, player);
  state.organizationMembers.push(organizationMember, playerOrganizationMember);
  state.campaigns.push(campaign);
  state.members.push(member, playerMember);
  state.scenes.push(scene);
  state.actors.push(actor);
  state.tokens.push(token);
  state.journals.push(journal);
  state.diceMacros.push(macro);
  return state;
}

export function makeArchive(state: EngineState, campaignId: string): CampaignArchive {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
  const memberUserIds = new Set(state.members.filter((item) => item.campaignId === campaignId).map((item) => item.userId));
  const aiThreadIds = new Set(state.aiThreads.filter((item) => item.campaignId === campaignId).map((item) => item.id));
  const archivedScenes = state.scenes.filter((item) => item.campaignId === campaignId);
  const archivedSceneIds = new Set(archivedScenes.map((item) => item.id));
  const campaignData: EngineState = {
    ...emptyState(),
    users: state.users.filter((item) => memberUserIds.has(item.id)).map(({ passwordHash: _passwordHash, mfa: _mfa, scim: _scim, serverAdmin: _serverAdmin, ...user }) => user),
    sessions: [],
    identities: [],
    oauthStates: [],
    passwordResetTokens: [],
    emailOutbox: [],
    scimGroups: [],
    scimGroupRoleMappings: [],
    organizations: [],
    organizationMembers: [],
    invites: [],
    campaigns: state.campaigns.filter((item) => item.id === campaignId),
    members: state.members.filter((item) => item.campaignId === campaignId).map(({ source: _source, ...member }) => member),
    worlds: state.worlds.filter((item) => item.campaignId === campaignId),
    scenes: archivedScenes,
    assets: state.assets.filter((item) => item.campaignId === campaignId),
    tokens: state.tokens.filter((item) => archivedSceneIds.has(item.sceneId)),
    actors: state.actors.filter((item) => item.campaignId === campaignId),
    items: state.items.filter((item) => item.campaignId === campaignId),
    journals: state.journals.filter((item) => item.campaignId === campaignId),
    handouts: state.handouts.filter((item) => item.campaignId === campaignId),
    chat: state.chat.filter((item) => item.campaignId === campaignId),
    rolls: state.rolls.filter((item) => item.campaignId === campaignId),
    diceMacros: state.diceMacros.filter((item) => item.campaignId === campaignId),
    encounters: state.encounters.filter((item) => item.campaignId === campaignId),
    combats: state.combats.filter((item) => item.campaignId === campaignId),
    compendia: state.compendia,
    proposals: state.proposals.filter((item) => item.campaignId === campaignId),
    aiThreads: state.aiThreads.filter((item) => item.campaignId === campaignId),
    aiEvaluations: state.aiEvaluations.filter((item) => item.campaignId === campaignId),
    aiMemory: state.aiMemory.filter((item) => item.campaignId === campaignId),
    aiToolCalls: state.aiToolCalls.filter((item) => aiThreadIds.has(item.threadId)),
    auditLogs: state.auditLogs.filter((item) => item.campaignId === campaignId),
    permissionGrants: state.permissionGrants.filter((item) => item.campaignId === campaignId),
    pluginStorage: state.pluginStorage.filter((item) => item.campaignId === campaignId),
    pluginReviews: [],
    contentImports: state.contentImports.filter((item) => item.campaignId === campaignId && item.status !== "deleted"),
    fogPresets: state.fogPresets.filter((item) => item.campaignId === campaignId),
    idempotencyRecords: [],
    jobs: []
  };
  return {
    format: "ottx",
    version: "0.2.0",
    exportedAt: nowIso(),
    manifest: {
      campaignId,
      name: campaign.name,
      schemaVersion: "0.2.0",
      assetCount: campaignData.assets.length
    },
    data: campaignData
  };
}

export function createTimestamped<T extends object>(prefix: string, data: T): T & { id: string; createdAt: string; updatedAt: string } {
  const now = nowIso();
  return { id: createId(prefix), createdAt: now, updatedAt: now, ...data };
}
