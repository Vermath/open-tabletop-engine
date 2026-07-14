import { createId, nowIso } from "./ids.js";
import type { Actor, AiCampaignPolicy, AiMemoryFact, AiMemoryFactStatus, AiMemoryFactType, Campaign, CampaignArchive, CampaignMember, DiceMacro, EngineState, Handout, JournalEntry, OrganizationMember, Scene, Token, User } from "./types.js";

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
    worldRecords: [],
    worldRelations: [],
    scenes: [],
    assets: [],
    tokens: [],
    actors: [],
    calculationOverrides: [],
    characterTransfers: [],
    items: [],
    dndRulesMutations: [],
    pendingAdvancements: [],
    journals: [],
    handouts: [],
    chat: [],
    rolls: [],
    diceMacros: [],
    audioTracks: [],
    encounters: [],
    campaignSessions: [],
    combats: [],
    compendia: [],
    proposals: [],
    aiThreads: [],
    aiEvaluations: [],
    aiMemory: [],
    aiToolCalls: [],
    auditLogs: [],
    permissionGrants: [],
    systemInstallations: [],
    pluginStorage: [],
    pluginReviews: [],
    contentImports: [],
    fogPresets: [],
    campaignWebhooks: [],
    campaignWebhookDeliveries: [],
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
    difficultTerrain: [],
    coverOverrides: [],
    metadata: {},
    createdAt: now,
    updatedAt: now
  };
  const actor: Actor = {
    id: "act_valen",
    campaignId: campaign.id,
    systemId: campaign.defaultSystemId,
    ownerUserId: player.id,
    type: "character",
    name: "Valen Ash",
    data: {
      ruleset: "SRD 5.2.1",
      level: 1,
      class: "Fighter",
      species: "Human",
      background: "Soldier",
      proficiencyBonus: 2,
      attributes: {
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 11,
        wisdom: 10,
        charisma: 15
      },
      hp: { current: 18, max: 22 },
      hitDice: { current: 1, max: 1, size: "d10" },
      saveProficiencies: ["strength", "constitution"],
      skillProficiencies: ["athletics", "intimidation"],
      toolProficiencies: ["gaming-set"],
      currency: { gp: 50, sp: 0, cp: 0 },
      resources: { focus: 3, secondWind: { current: 2, max: 2, recovery: "short" } },
      spellSlots: {},
      conditions: [],
      features: ["Fighting Style", "Second Wind", "Weapon Mastery"],
      feats: ["Savage Attacker"]
    },
    permissions: {},
    createdAt: now,
    updatedAt: now
  };
  const genericActor: Actor = {
    id: "act_generic_demo",
    campaignId: campaign.id,
    systemId: "generic-fantasy",
    ownerUserId: player.id,
    type: "character",
    name: "Mira Vale",
    data: {
      attributes: { strength: 14, dexterity: 12, constitution: 13, intelligence: 11, wisdom: 10, charisma: 15 },
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
  state.actors.push(actor, genericActor);
  state.tokens.push(token);
  state.journals.push(journal);
  state.diceMacros.push(macro);
  return state;
}

export function makeArchive(state: EngineState, campaignId: string): CampaignArchive {
  state = normalizeEngineState(state);
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
    worldRecords: state.worldRecords.filter((item) => item.campaignId === campaignId),
    worldRelations: state.worldRelations.filter((item) => item.campaignId === campaignId),
    scenes: archivedScenes.map(({ sceneEditHistory: _sceneEditHistory, ...scene }) => scene),
    assets: state.assets.filter((item) => item.campaignId === campaignId),
    tokens: state.tokens.filter((item) => archivedSceneIds.has(item.sceneId)),
    actors: state.actors.filter((item) => item.campaignId === campaignId),
    calculationOverrides: state.calculationOverrides.filter((item) => item.campaignId === campaignId),
    characterTransfers: state.characterTransfers.filter((item) => item.campaignId === campaignId),
    items: state.items.filter((item) => item.campaignId === campaignId),
    dndRulesMutations: state.dndRulesMutations.filter((item) => item.campaignId === campaignId),
    pendingAdvancements: state.pendingAdvancements.filter((item) => item.campaignId === campaignId),
    journals: state.journals.filter((item) => item.campaignId === campaignId),
    handouts: state.handouts.filter((item) => item.campaignId === campaignId),
    chat: state.chat.filter((item) => item.campaignId === campaignId),
    rolls: state.rolls.filter((item) => item.campaignId === campaignId),
    diceMacros: state.diceMacros.filter((item) => item.campaignId === campaignId),
    audioTracks: state.audioTracks.filter((item) => item.campaignId === campaignId),
    encounters: state.encounters.filter((item) => item.campaignId === campaignId),
    campaignSessions: state.campaignSessions.filter((item) => item.campaignId === campaignId),
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
    // Outbound webhook targets, signing material, and operational delivery
    // history are installation-local and never enter portable campaign files.
    campaignWebhooks: [],
    campaignWebhookDeliveries: [],
    idempotencyRecords: [],
    jobs: []
  };
  // Filtering gives the archive its own collection arrays, but the selected
  // records (and their nested data) still belong to the live engine state.
  // Detach one collection at a time so the portable snapshot is dependency
  // closed without allocating a second full EngineState clone at peak.
  for (const collection of Object.keys(campaignData) as Array<keyof EngineState>) {
    campaignData[collection] = structuredClone(campaignData[collection]) as never;
  }
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
    // Every exported collection is detached above. Avoid a second full-state
    // clone here: large campaigns are encoded under explicit archive bounds.
    data: campaignData
  };
}

const aiMemoryFactTypes = new Set<AiMemoryFactType>([
  "canon_fact",
  "rumor",
  "secret",
  "npc_profile",
  "location_profile",
  "faction_profile",
  "quest_hook",
  "unresolved_thread",
  "character_goal",
  "session_summary",
  "timeline_event",
  "retconned_fact",
  "ai_suggestion"
]);

const aiMemoryFactStatuses = new Set<AiMemoryFactStatus>(["candidate", "approved", "rejected", "retconned"]);

/** Resolve legacy approval fields into the explicit memory lifecycle. */
export function aiMemoryFactStatus(fact: AiMemoryFact): AiMemoryFactStatus {
  if (fact.status && aiMemoryFactStatuses.has(fact.status)) return fact.status;
  if (fact.retconnedAt || fact.retconnedByUserId) return "retconned";
  if (fact.rejectedAt || fact.rejectedByUserId) return "rejected";
  if (fact.approvedAt || fact.approvedByUserId) return "approved";
  return "candidate";
}

export function normalizeAiMemoryFact(fact: AiMemoryFact): AiMemoryFact {
  const status = aiMemoryFactStatus(fact);
  const confidence = typeof fact.confidence === "number" && Number.isFinite(fact.confidence) ? Math.max(0, Math.min(1, fact.confidence)) : undefined;
  const type = fact.type && aiMemoryFactTypes.has(fact.type) ? fact.type : status === "retconned" ? "retconned_fact" : "canon_fact";
  return {
    ...fact,
    type,
    status,
    sourceIds: Array.isArray(fact.sourceIds) ? [...fact.sourceIds] : [],
    ...(confidence === undefined ? {} : { confidence })
  };
}

export function normalizeHandout(
  handout: Handout,
  fallbackUserId = "system"
): Handout & Required<Pick<Handout, "visibleToUserIds" | "visibleToActorIds" | "tags" | "readByUserIds" | "createdBy" | "updatedBy">> {
  return {
    ...handout,
    assetIds: Array.isArray(handout.assetIds) ? [...handout.assetIds] : [],
    visibleToUserIds: Array.isArray(handout.visibleToUserIds) ? [...handout.visibleToUserIds] : [],
    visibleToActorIds: Array.isArray(handout.visibleToActorIds) ? [...handout.visibleToActorIds] : [],
    tags: Array.isArray(handout.tags) ? [...handout.tags] : [],
    readByUserIds: Array.isArray(handout.readByUserIds) ? [...handout.readByUserIds] : [],
    createdBy: handout.createdBy ?? fallbackUserId,
    updatedBy: handout.updatedBy ?? handout.createdBy ?? fallbackUserId
  };
}

const journalKinds = new Set(["folder", "entry"]);
const journalCanonStatuses = new Set(["draft", "in_review", "canonical", "rejected"]);
const journalEntityTypes = new Set(["actor", "scene", "item", "journal", "handout", "encounter"]);

/** Additive journal normalization for legacy persistence and archive imports. */
export function normalizeJournalEntry(entry: JournalEntry, fallbackUserId = "system"): JournalEntry {
  const links = Array.isArray(entry.links)
    ? entry.links
        .filter((link) => Boolean(link) && typeof link.id === "string" && typeof link.targetId === "string" && journalEntityTypes.has(link.targetType))
        .map((link) => ({ ...link }))
    : [];
  const revisions = Array.isArray(entry.revisions)
    ? entry.revisions
        .filter((revision) => Boolean(revision) && typeof revision.id === "string" && Number.isInteger(revision.revision) && revision.revision > 0)
        .map((revision) => ({
          ...revision,
          kind: journalKinds.has(revision.kind) ? revision.kind : "entry",
          visibleToUserIds: Array.isArray(revision.visibleToUserIds) ? [...revision.visibleToUserIds] : [],
          visibleToActorIds: Array.isArray(revision.visibleToActorIds) ? [...revision.visibleToActorIds] : [],
          tags: Array.isArray(revision.tags) ? [...revision.tags] : [],
          links: Array.isArray(revision.links) ? revision.links.map((link) => ({ ...link })) : [],
          canonStatus: journalCanonStatuses.has(revision.canonStatus) ? revision.canonStatus : "draft"
        }))
    : [];
  return {
    ...entry,
    kind: journalKinds.has(entry.kind ?? "") ? entry.kind : "entry",
    visibleToUserIds: Array.isArray(entry.visibleToUserIds) ? [...entry.visibleToUserIds] : [],
    visibleToActorIds: Array.isArray(entry.visibleToActorIds) ? [...entry.visibleToActorIds] : [],
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    links,
    revision: Number.isInteger(entry.revision) && (entry.revision ?? 0) > 0 ? entry.revision : 1,
    revisions,
    canonStatus: journalCanonStatuses.has(entry.canonStatus ?? "") ? entry.canonStatus : "draft",
    createdBy: entry.createdBy ?? fallbackUserId,
    updatedBy: entry.updatedBy ?? entry.createdBy ?? fallbackUserId
  };
}

function normalizedWorldRecordMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return {};
  }
  if (new TextEncoder().encode(serialized).byteLength > 16 * 1024) return {};
  let keys = 0;
  const valid = (candidate: unknown, depth: number): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (depth > 8) return false;
    if (Array.isArray(candidate)) return candidate.length <= 256 && candidate.every((entry) => valid(entry, depth + 1));
    if (!candidate || typeof candidate !== "object") return false;
    const entries = Object.entries(candidate as Record<string, unknown>);
    keys += entries.length;
    return keys <= 256 && entries.every(([key, entry]) => key.length <= 128 && valid(entry, depth + 1));
  };
  return valid(value, 1) ? structuredClone(value as Record<string, unknown>) : {};
}

/** Additive normalization used by persistence and archive imports. */
export function normalizeEngineState(input: Partial<EngineState>): EngineState {
  const state = { ...emptyState(), ...input } as EngineState;
  for (const key of Object.keys(emptyState()) as Array<keyof EngineState>) {
    if (!Array.isArray(state[key])) (state[key] as unknown[]) = [];
  }
  const ownerByCampaign = new Map(state.campaigns.map((campaign) => [campaign.id, campaign.ownerUserId]));
  state.campaigns = state.campaigns.map((campaign) => {
    const aiPolicy = normalizeStoredAiCampaignPolicy(campaign.aiPolicy);
    const eventSequence = Number.isSafeInteger(campaign.eventSequence) && (campaign.eventSequence ?? 0) >= 0 ? campaign.eventSequence : 0;
    return aiPolicy ? { ...campaign, aiPolicy, eventSequence } : { ...campaign, aiPolicy: undefined, eventSequence };
  });
  // Preserve the existing scene collection when every row is already current.
  // Besides avoiding an unnecessary allocation, archive callers intentionally
  // collect the campaign's scenes once and reuse that collection for token
  // membership. Legacy rows still receive additive tactical defaults.
  if (state.scenes.some((scene) => !Array.isArray(scene.difficultTerrain) || !Array.isArray(scene.coverOverrides))) {
    state.scenes = state.scenes.map((scene) => ({
      ...scene,
      difficultTerrain: Array.isArray(scene.difficultTerrain) ? scene.difficultTerrain : [],
      coverOverrides: Array.isArray(scene.coverOverrides) ? scene.coverOverrides : []
    }));
  }
  if (state.scenes.some((scene) => scene.permissions && Object.values(scene.permissions).some((permissions) => !Array.isArray(permissions) || permissions.some((permission) => permission !== "scene.read" && permission !== "scene.update")))) {
    state.scenes = state.scenes.map((scene) => {
      if (!scene.permissions) return scene;
      const permissions = Object.fromEntries(
        Object.entries(scene.permissions)
          .map(([userId, grants]) => [userId, Array.isArray(grants) ? [...new Set(grants.filter((grant) => grant === "scene.read" || grant === "scene.update"))] : []])
          .filter(([, grants]) => (grants as unknown[]).length > 0)
      );
      return { ...scene, permissions: Object.keys(permissions).length > 0 ? permissions : undefined };
    });
  }
  state.journals = state.journals.map((journal) => normalizeJournalEntry(journal, ownerByCampaign.get(journal.campaignId)));
  state.handouts = state.handouts.map((handout) => normalizeHandout(handout, ownerByCampaign.get(handout.campaignId)));
  const worldRecordKinds = new Set<string>(["npc", "location", "quest", "faction"]);
  const worldRecordLifecycles = new Set<string>(["draft", "active", "inactive", "resolved", "archived"]);
  const worldRelationTypes = new Set<string>(["located_in", "member_of", "allied_with", "opposed_to", "serves", "leads", "involved_in", "related_to"]);
  const campaignIds = new Set(state.campaigns.map((campaign) => campaign.id));
  const worldCampaignById = new Map(state.worlds.map((world) => [world.id, world.campaignId]));
  state.worldRecords = state.worldRecords
    .filter((record) => campaignIds.has(record.campaignId) && worldRecordKinds.has(record.kind))
    .map((record) => ({
      ...record,
      worldId: record.worldId && worldCampaignById.get(record.worldId) === record.campaignId ? record.worldId : undefined,
      lifecycle: worldRecordLifecycles.has(record.lifecycle) ? record.lifecycle : "draft",
      visibility: record.visibility === "public" || record.visibility === "gm_only" ? record.visibility : "gm_only",
      tags: Array.isArray(record.tags) ? [...new Set(record.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))].slice(0, 50) : [],
      metadata: normalizedWorldRecordMetadata(record.metadata)
    }));
  const worldRecordById = new Map(state.worldRecords.map((record) => [record.id, record]));
  const relationKeys = new Set<string>();
  state.worldRelations = state.worldRelations
    .filter((relation) => {
      const source = worldRecordById.get(relation.sourceRecordId);
      const target = worldRecordById.get(relation.targetRecordId);
      if (!source || !target || source.id === target.id || source.campaignId !== relation.campaignId || target.campaignId !== relation.campaignId || !worldRelationTypes.has(relation.type)) return false;
      const key = `${relation.campaignId}\u0000${source.id}\u0000${target.id}\u0000${relation.type}`;
      if (relationKeys.has(key)) return false;
      relationKeys.add(key);
      return true;
    })
    .map((relation) => ({
      ...relation,
      worldId: relation.worldId && worldCampaignById.get(relation.worldId) === relation.campaignId ? relation.worldId : undefined,
      visibility: relation.visibility === "public" || relation.visibility === "gm_only" ? relation.visibility : "gm_only",
    }));
  const actorCampaignById = new Map(state.actors.map((actor) => [actor.id, actor.campaignId]));
  const overrideSources = new Set<string>(["gm_manual", "house_rule", "migration", "plugin"]);
  state.calculationOverrides = state.calculationOverrides
    .filter((override) => {
      const hasAnyClearField = override.clearedAt !== undefined || override.clearedByUserId !== undefined || override.clearReason !== undefined;
      const hasCompleteClearAttribution = typeof override.clearedAt === "string" && Number.isFinite(Date.parse(override.clearedAt)) && typeof override.clearedByUserId === "string" && override.clearedByUserId.length > 0 && typeof override.clearReason === "string" && override.clearReason.trim().length > 0 && override.clearReason.length <= 500;
      return actorCampaignById.get(override.actorId) === override.campaignId &&
        overrideSources.has(override.source) &&
        typeof override.fieldId === "string" && override.fieldId.trim().length > 0 && override.fieldId.length <= 200 &&
        typeof override.reason === "string" && override.reason.trim().length > 0 && override.reason.length <= 500 &&
        (typeof override.baseValue === "string" || (typeof override.baseValue === "number" && Number.isFinite(override.baseValue))) &&
        (typeof override.effectiveValue === "string" || (typeof override.effectiveValue === "number" && Number.isFinite(override.effectiveValue))) &&
        typeof override.createdByUserId === "string" && override.createdByUserId.length > 0 &&
        (!hasAnyClearField || hasCompleteClearAttribution);
    })
    .map((override) => {
      const cleared = typeof override.clearedAt === "string" && Number.isFinite(Date.parse(override.clearedAt)) && typeof override.clearedByUserId === "string" && override.clearedByUserId.length > 0 && typeof override.clearReason === "string" && override.clearReason.trim().length > 0 && override.clearReason.length <= 500;
      return {
        ...override,
        fieldId: override.fieldId.trim(),
        reason: override.reason.trim(),
        ...(cleared
          ? { clearedAt: override.clearedAt, clearedByUserId: override.clearedByUserId, clearReason: override.clearReason!.trim() }
          : { clearedAt: undefined, clearedByUserId: undefined, clearReason: undefined })
      };
    });
  state.aiMemory = state.aiMemory.map(normalizeAiMemoryFact);
  return state;
}

function normalizeStoredAiCampaignPolicy(policy: AiCampaignPolicy | undefined): AiCampaignPolicy | undefined {
  if (!policy || typeof policy.enabled !== "boolean") return undefined;
  const contextScopes = Array.isArray(policy.contextScopes)
    ? [...new Set(policy.contextScopes.filter((scope) => scope === "public" || scope === "gm_private"))]
    : [];
  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > 3650) return undefined;
  if (!Number.isInteger(policy.revision) || policy.revision < 1) return undefined;
  if (typeof policy.providerTransmissionDisclosure !== "string" || !policy.providerTransmissionDisclosure.trim()) return undefined;
  return {
    ...policy,
    status: policy.enabled ? "enabled" : "disabled",
    contextScopes,
    providerTransmissionDisclosure: policy.providerTransmissionDisclosure.trim().slice(0, 1000)
  };
}

export function createTimestamped<T extends object>(prefix: string, data: T): T & { id: string; createdAt: string; updatedAt: string } {
  const now = nowIso();
  return { id: createId(prefix), createdAt: now, updatedAt: now, ...data };
}
