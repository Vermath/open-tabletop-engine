import { createId, nowIso } from "./ids.js";
import type { Actor, Campaign, CampaignArchive, CampaignMember, EngineState, JournalEntry, Scene, Token, User } from "./types.js";

export function emptyState(): EngineState {
  return {
    users: [],
    sessions: [],
    identities: [],
    oauthStates: [],
    passwordResetTokens: [],
    emailOutbox: [],
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
    encounters: [],
    combats: [],
    compendia: [],
    proposals: [],
    aiThreads: [],
    aiMemory: [],
    aiToolCalls: [],
    auditLogs: [],
    permissionGrants: []
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
    ownerUserId: user.id,
    name: "The Ember Vault",
    description: "A sample fantasy campaign for local development.",
    defaultSystemId: "generic-fantasy",
    visibility: "private",
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
    hidden: false,
    locked: false,
    visionEnabled: true,
    visionRadius: 180,
    disposition: "friendly",
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

  state.users.push(user, player);
  state.campaigns.push(campaign);
  state.members.push(member, playerMember);
  state.scenes.push(scene);
  state.actors.push(actor);
  state.tokens.push(token);
  state.journals.push(journal);
  return state;
}

export function makeArchive(state: EngineState, campaignId: string): CampaignArchive {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
  const memberUserIds = new Set(state.members.filter((item) => item.campaignId === campaignId).map((item) => item.userId));
  const campaignData: EngineState = {
    ...emptyState(),
    users: state.users.filter((item) => memberUserIds.has(item.id)).map(({ passwordHash: _passwordHash, mfa: _mfa, ...user }) => user),
    sessions: [],
    identities: [],
    oauthStates: [],
    passwordResetTokens: [],
    emailOutbox: [],
    invites: [],
    campaigns: state.campaigns.filter((item) => item.id === campaignId),
    members: state.members.filter((item) => item.campaignId === campaignId),
    worlds: state.worlds.filter((item) => item.campaignId === campaignId),
    scenes: state.scenes.filter((item) => item.campaignId === campaignId),
    assets: state.assets.filter((item) => item.campaignId === campaignId),
    tokens: state.tokens.filter((item) => campaignDataSceneIds(state, campaignId).includes(item.sceneId)),
    actors: state.actors.filter((item) => item.campaignId === campaignId),
    items: state.items.filter((item) => item.campaignId === campaignId),
    journals: state.journals.filter((item) => item.campaignId === campaignId),
    handouts: state.handouts.filter((item) => item.campaignId === campaignId),
    chat: state.chat.filter((item) => item.campaignId === campaignId),
    rolls: state.rolls.filter((item) => item.campaignId === campaignId),
    encounters: state.encounters.filter((item) => item.campaignId === campaignId),
    combats: state.combats.filter((item) => item.campaignId === campaignId),
    compendia: state.compendia,
    proposals: state.proposals.filter((item) => item.campaignId === campaignId),
    aiThreads: state.aiThreads.filter((item) => item.campaignId === campaignId),
    aiMemory: state.aiMemory.filter((item) => item.campaignId === campaignId),
    aiToolCalls: state.aiToolCalls,
    auditLogs: state.auditLogs.filter((item) => item.campaignId === campaignId),
    permissionGrants: state.permissionGrants.filter((item) => item.campaignId === campaignId)
  };
  return {
    format: "ottx",
    version: "0.1.0",
    exportedAt: nowIso(),
    manifest: {
      campaignId,
      name: campaign.name,
      schemaVersion: "0.1.0",
      assetCount: campaignData.assets.length
    },
    data: campaignData
  };
}

export function createTimestamped<T extends object>(prefix: string, data: T): T & { id: string; createdAt: string; updatedAt: string } {
  const now = nowIso();
  return { id: createId(prefix), createdAt: now, updatedAt: now, ...data };
}

function campaignDataSceneIds(state: EngineState, campaignId: string): string[] {
  return state.scenes.filter((scene) => scene.campaignId === campaignId).map((scene) => scene.id);
}
