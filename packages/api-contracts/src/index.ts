export const apiVersion = "v1";
export const apiVersionHeader = "OpenTabletop-API-Version";
export const campaignArchiveStreamContentType = "application/vnd.open-tabletop.ottx-stream";

/** Stable generic-roll identifiers for the reviewed D&D Rage lifecycle. */
export const dnd5eSrdRageActionRollIds = {
  start: "feature-rage",
  extend: "feature-rage-extend",
  end: "feature-rage-end",
} as const;
export type Dnd5eSrdRageActionKind = keyof typeof dnd5eSrdRageActionRollIds;

function pathPart(value: string): string {
  return encodeURIComponent(value);
}

export const routes = {
  health: "/api/v1/health",
  bootstrap: "/api/v1/auth/bootstrap",
  session: "/api/v1/auth/session",
  profile: "/api/v1/auth/profile",
  register: "/api/v1/auth/register",
  login: "/api/v1/auth/login",
  logout: "/api/v1/auth/logout",
  passwordResetRequest: "/api/v1/auth/password-reset/request",
  passwordResetConfirm: "/api/v1/auth/password-reset/confirm",
  passwordChange: "/api/v1/auth/password/change",
  mfaStatus: "/api/v1/auth/mfa",
  mfaTotpEnroll: "/api/v1/auth/mfa/totp/enroll",
  mfaTotpConfirm: "/api/v1/auth/mfa/totp/confirm",
  mfaTotpDisable: "/api/v1/auth/mfa/totp",
  authSessions: "/api/v1/auth/sessions",
  authSession: (sessionId: string) =>
    `/api/v1/auth/sessions/${pathPart(sessionId)}`,
  oidcConfig: "/api/v1/auth/oidc/config",
  oidcStart: "/api/v1/auth/oidc/start",
  oidcCallback: "/api/v1/auth/oidc/callback",
  organizations: "/api/v1/organizations",
  organizationSession: "/api/v1/organization/session",
  organizationWorkspaceDefaults: "/api/v1/organization/workspace-defaults",
  organizationMembers: "/api/v1/organization/members",
  organizationMember: (memberId: string) =>
    `/api/v1/organization/members/${pathPart(memberId)}`,
  organizationInvites: "/api/v1/organization/invites",
  adminUsers: "/api/v1/admin/users",
  adminUser: (userId: string) => `/api/v1/admin/users/${pathPart(userId)}`,
  adminUserPasswordReset: (userId: string) =>
    `/api/v1/admin/users/${pathPart(userId)}/password-reset`,
  adminUserSessions: (userId: string) =>
    `/api/v1/admin/users/${pathPart(userId)}/sessions`,
  adminUserSessionsRevocationPlan: (userId: string) =>
    `/api/v1/admin/users/${pathPart(userId)}/sessions/revocation-plan`,
  adminSessions: "/api/v1/admin/sessions",
  adminSession: (sessionId: string) =>
    `/api/v1/admin/sessions/${pathPart(sessionId)}`,
  adminEmailOutbox: "/api/v1/admin/email-outbox",
  adminPluginReviews: "/api/v1/admin/plugins/reviews",
  adminPluginReview: (reviewKey: string) =>
    `/api/v1/admin/plugins/reviews/${pathPart(reviewKey)}`,
  adminScimGroupRoleMappings: "/api/v1/admin/scim/group-role-mappings",
  adminScimGroupRoleMappingPreview: "/api/v1/admin/scim/group-role-mappings/preview",
  adminScimGroupRoleMapping: (mappingId: string) =>
    `/api/v1/admin/scim/group-role-mappings/${pathPart(mappingId)}`,
  scimServiceProviderConfig: "/api/v1/scim/v2/ServiceProviderConfig",
  scimUsers: "/api/v1/scim/v2/Users",
  scimUser: (userId: string) => `/api/v1/scim/v2/Users/${pathPart(userId)}`,
  scimGroups: "/api/v1/scim/v2/Groups",
  scimGroup: (groupId: string) => `/api/v1/scim/v2/Groups/${pathPart(groupId)}`,
  adminAssetStorage: "/api/v1/admin/assets/storage",
  adminAssetMigration: "/api/v1/admin/assets/migrate",
  adminAssetCleanup: "/api/v1/admin/assets/cleanup",
  adminStorageOperations: "/api/v1/admin/storage/operations",
  adminOperationsMetrics: "/api/v1/admin/operations/metrics",
  adminRetentionOperations: "/api/v1/admin/retention/operations",
  adminRetentionPrune: "/api/v1/admin/retention/prune",
  adminStorageBackup: "/api/v1/admin/storage/backup",
  adminStorageRestoreDrill: "/api/v1/admin/storage/restore-drill",
  adminStorageRestore: "/api/v1/admin/storage/restore",
  adminJobs: "/api/v1/admin/jobs",
  adminJobOperations: "/api/v1/admin/jobs/operations",
  adminJobMetrics: "/api/v1/admin/jobs/metrics",
  adminJobAlerts: "/api/v1/admin/jobs/alerts",
  adminJob: (jobId: string) => `/api/v1/admin/jobs/${pathPart(jobId)}`,
  adminJobRetry: (jobId: string) =>
    `/api/v1/admin/jobs/${pathPart(jobId)}/retry`,
  adminJobCancel: (jobId: string) =>
    `/api/v1/admin/jobs/${pathPart(jobId)}/cancel`,
  adminAiPolicy: "/api/v1/admin/ai/policy",
  campaigns: "/api/v1/campaigns",
  campaign: (campaignId: string) => `/api/v1/campaigns/${pathPart(campaignId)}`,
  campaignMembers: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/members`,
  campaignPresence: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/presence`,
  campaignMember: (campaignId: string, memberId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/members/${pathPart(memberId)}`,
  campaignOwnershipTransfer: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ownership-transfer`,
  campaignDuplicate: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/duplicate`,
  characterTransfers: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/character-transfers`,
  characterTransferCreate: (campaignId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/actors/${pathPart(actorId)}/transfers`,
  characterTransferAccept: (campaignId: string, transferId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/character-transfers/${pathPart(transferId)}/accept`,
  characterTransferDecline: (campaignId: string, transferId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/character-transfers/${pathPart(transferId)}/decline`,
  characterTransferCancel: (campaignId: string, transferId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/character-transfers/${pathPart(transferId)}/cancel`,
  campaignWebhooks: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks`,
  campaignWebhook: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}`,
  campaignWebhookDisable: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/disable`,
  campaignWebhookRotateSecret: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/rotate-secret`,
  campaignWebhookDeliveries: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/deliveries`,
  campaignWebhookTest: (campaignId: string, webhookId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/test`,
  campaignWebhookRetry: (campaignId: string, webhookId: string, deliveryId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/deliveries/${pathPart(deliveryId)}/retry`,
  campaignWebhookDeliveryRetry: (campaignId: string, webhookId: string, deliveryId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/webhooks/${pathPart(webhookId)}/deliveries/${pathPart(deliveryId)}/retry`,
  campaignSessions: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/sessions`,
  campaignSearch: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/search`,
  campaignSession: (sessionId: string) =>
    `/api/v1/campaign-sessions/${pathPart(sessionId)}`,
  campaignSessionStart: (sessionId: string) =>
    `/api/v1/campaign-sessions/${pathPart(sessionId)}/start`,
  campaignSessionComplete: (sessionId: string) =>
    `/api/v1/campaign-sessions/${pathPart(sessionId)}/complete`,
  campaignArchive: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/archive`,
  campaignRestore: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/restore`,
  campaignInvites: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/invites`,
  acceptInvite: "/api/v1/invites/accept",
  invitePreview: "/api/v1/invites/preview",
  revokeInvite: (inviteId: string) =>
    `/api/v1/invites/${pathPart(inviteId)}/revoke`,
  worlds: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/worlds`,
  world: (worldId: string) => `/api/v1/worlds/${pathPart(worldId)}`,
  worldRecords: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/world-records`,
  worldRecord: (recordId: string) =>
    `/api/v1/world-records/${pathPart(recordId)}`,
  worldRecordLifecycle: (recordId: string) =>
    `/api/v1/world-records/${pathPart(recordId)}/lifecycle`,
  worldRelations: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/world-relations`,
  worldRelation: (relationId: string) =>
    `/api/v1/world-relations/${pathPart(relationId)}`,
  scenes: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/scenes`,
  sceneDuplications: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/scene-duplications`,
  fogPresets: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/fog-presets`,
  fogPreset: (campaignId: string, presetId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/fog-presets/${pathPart(presetId)}`,
  assets: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/assets`,
  assetStorage: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/assets/storage`,
  uploadAsset: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/assets/upload`,
  asset: (assetId: string) => `/api/v1/assets/${pathPart(assetId)}`,
  assetBlob: (assetId: string) => `/api/v1/assets/${pathPart(assetId)}/blob`,
  assetDeliveryUrl: (assetId: string) =>
    `/api/v1/assets/${pathPart(assetId)}/delivery-url`,
  assetLifecycle: (assetId: string) =>
    `/api/v1/assets/${pathPart(assetId)}/lifecycle`,
  scene: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}`,
  sceneDelegations: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/delegations`,
  sceneDelegation: (sceneId: string, userId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/delegations/${pathPart(userId)}`,
  sceneVision: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/vision`,
  sceneVisionSample: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/vision/sample`,
  scenePathMeasurement: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/path-measurement`,
  sceneDifficultTerrain: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/difficult-terrain`,
  sceneDifficultTerrainRegion: (sceneId: string, regionId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/difficult-terrain/${pathPart(regionId)}`,
  sceneCoverOverrides: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/cover-overrides`,
  sceneCoverOverride: (sceneId: string, overrideId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/cover-overrides/${pathPart(overrideId)}`,
  sceneRenderingDiagnostics: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/rendering/diagnostics`,
  sceneAiEditsApply: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/ai-edits/apply-to-target`,
  sceneFog: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}/fog`,
  sceneFogHistory: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/fog/history`,
  sceneFogUndo: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/fog/undo`,
  sceneEdits: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}/edits`,
  sceneUndo: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}/undo`,
  sceneFogApplyPreset: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/fog/apply-preset`,
  sceneFogRegion: (sceneId: string, fogId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/fog/${pathPart(fogId)}`,
  sceneWalls: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}/walls`,
  sceneWall: (sceneId: string, wallId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/walls/${pathPart(wallId)}`,
  sceneLights: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/lights`,
  sceneLight: (sceneId: string, lightId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/lights/${pathPart(lightId)}`,
  sceneAnnotations: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/annotations`,
  sceneAnnotation: (sceneId: string, annotationId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/annotations/${pathPart(annotationId)}`,
  encounterMonsterPlacements: (sceneId: string) =>
    `/api/v1/scenes/${pathPart(sceneId)}/encounter-monster-placements`,
  tokens: (sceneId: string) => `/api/v1/scenes/${pathPart(sceneId)}/tokens`,
  token: (tokenId: string) => `/api/v1/tokens/${pathPart(tokenId)}`,
  tokenTarget: (tokenId: string) =>
    `/api/v1/tokens/${pathPart(tokenId)}/target`,
  actors: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/actors`,
  actor: (actorId: string) => `/api/v1/actors/${pathPart(actorId)}`,
  actorCalculationOverrides: (campaignId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/actors/${pathPart(actorId)}/calculation-overrides`,
  calculationOverrideClear: (overrideId: string) =>
    `/api/v1/calculation-overrides/${pathPart(overrideId)}/clear`,
  actorConcentrationEnd: (actorId: string) =>
    `/api/v1/actors/${pathPart(actorId)}/concentration/end`,
  items: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/items`,
  item: (itemId: string) => `/api/v1/items/${pathPart(itemId)}`,
  journals: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/journal`,
  journal: (entryId: string) => `/api/v1/journal/${pathPart(entryId)}`,
  journalBacklinks: (entryId: string) =>
    `/api/v1/journal/${pathPart(entryId)}/backlinks`,
  journalHistory: (entryId: string) =>
    `/api/v1/journal/${pathPart(entryId)}/history`,
  journalCanonReview: (entryId: string) =>
    `/api/v1/journal/${pathPart(entryId)}/canon-review`,
  handouts: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/handouts`,
  handout: (handoutId: string) => `/api/v1/handouts/${pathPart(handoutId)}`,
  handoutRead: (handoutId: string) =>
    `/api/v1/handouts/${pathPart(handoutId)}/read`,
  chat: "/api/v1/chat/messages",
  chatMessage: (messageId: string) =>
    `/api/v1/chat/messages/${pathPart(messageId)}`,
  chatMessageModeration: (messageId: string) =>
    `/api/v1/chat/messages/${pathPart(messageId)}/moderation`,
  chatExport: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/chat/export`,
  dice: "/api/v1/dice/roll",
  diceMacros: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dice-macros`,
  campaignAudio: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/audio`,
  audioTrack: (trackId: string) => `/api/v1/audio/${pathPart(trackId)}`,
  diceMacro: (macroId: string) => `/api/v1/dice-macros/${pathPart(macroId)}`,
  encounters: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/encounters`,
  encounter: (encounterId: string) =>
    `/api/v1/encounters/${pathPart(encounterId)}`,
  combats: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/combats`,
  combatStart: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/combats/start`,
  combat: (combatId: string) => `/api/v1/combats/${pathPart(combatId)}`,
  combatant: (combatId: string, combatantId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/combatants/${pathPart(combatantId)}`,
  combatAudit: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/audit`,
  combatRewards: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/rewards`,
  combatEnvironmentMechanics: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/environment-mechanics`,
  combatEnvironmentMechanic: (combatId: string, mechanicId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/environment-mechanics/${pathPart(mechanicId)}`,
  combatEnvironmentMechanicTrigger: (combatId: string, mechanicId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/environment-mechanics/${pathPart(mechanicId)}/trigger`,
  combatEffectSchedulePreview: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/effects/preview`,
  combatEffectScheduleAdvance: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/effects/advance`,
  dnd5eSpellHelperPreview: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/spell-helper/preview`,
  combatActionConfirm: (combatId: string, actionId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/actions/${pathPart(actionId)}/confirm`,
  combatActionReject: (combatId: string, actionId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/actions/${pathPart(actionId)}/reject`,
  proposals: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/proposals`,
  proposal: (proposalId: string) => `/api/v1/proposals/${pathPart(proposalId)}`,
  proposalApprove: (proposalId: string) =>
    `/api/v1/proposals/${pathPart(proposalId)}/approve`,
  proposalReject: (proposalId: string) =>
    `/api/v1/proposals/${pathPart(proposalId)}/reject`,
  proposalApply: (proposalId: string) =>
    `/api/v1/proposals/${pathPart(proposalId)}/apply`,
  proposalRevert: (proposalId: string) =>
    `/api/v1/proposals/${pathPart(proposalId)}/revert`,
  aiThreads: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/threads`,
  aiPolicy: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/policy`,
  aiPrivacyPreview: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/privacy/preview`,
  aiPrivacyPrune: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/privacy/prune`,
  aiUsage: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/usage`,
  aiEvaluations: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/evaluations`,
  aiMemory: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/memory`,
  aiMemoryExtract: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/memory/extract`,
  aiMemoryFact: (factId: string) => `/api/v1/ai/memory/${pathPart(factId)}`,
  aiMemoryApprove: (factId: string) =>
    `/api/v1/ai/memory/${pathPart(factId)}/approve`,
  aiMemoryReject: (factId: string) =>
    `/api/v1/ai/memory/${pathPart(factId)}/reject`,
  aiToolCalls: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/tool-calls`,
  aiToolCallRetry: (campaignId: string, toolCallId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/tool-calls/${pathPart(toolCallId)}/retry`,
  aiSessionRecap: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/session-recap`,
  aiEncounterDesign: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/encounter-design`,
  aiGenerateMapAsset: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/generate-map-asset`,
  aiGenerateTokenAsset: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/ai/generate-token-asset`,
  mcp: "/api/v1/mcp",
  agentBoardCapture: (captureId: string) =>
    `/api/v1/agent/board-captures/${pathPart(captureId)}`,
  agentBoardCaptureSubmit: (requestId: string) =>
    `/api/v1/agent/board-captures/${pathPart(requestId)}`,
  systems: "/api/v1/systems",
  campaignSystems: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems`,
  campaignCompatibility: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/compatibility`,
  campaignSystem: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}`,
  systemCharacterTemplates: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/character-templates`,
  systemCharacterOrigins: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/character-origins`,
  systemCharacters: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/characters`,
  systemMonsters: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/monsters`,
  systemCharacterImport: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/characters/import`,
  systemEncounterThreats: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/encounter-threats`,
  systemEncounterPlan: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/encounter-plan`,
  systemCompendium: (campaignId: string, systemId: string, query: { q?: string; type?: string; types?: string[] } = {}) => {
    const path = `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/compendium`;
    const params = new URLSearchParams();
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.type?.trim()) params.set("type", query.type.trim());
    const types = query.types?.map((type) => type.trim()).filter(Boolean) ?? [];
    if (types.length > 0) params.set("types", types.join(","));
    const suffix = params.toString();
    return suffix ? `${path}?${suffix}` : path;
  },
  dndCustomContent: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/custom-content`,
  dndCustomContentPreview: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/custom-content/preview`,
  dndCustomContentItem: (campaignId: string, itemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/custom-content/${pathPart(itemId)}`,
  dndMonsterTemplates: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-templates`,
  dndMonsterTemplatesPreview: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-templates/preview`,
  dndMonsterTemplate: (campaignId: string, templateId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-templates/${pathPart(templateId)}`,
  dndMonsterBases: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-bases`,
  dndMonsterVariants: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-variants`,
  dndMonsterVariantsPreview: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/monster-variants/preview`,
  dndCharacterReviews: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/character-reviews`,
  dndCharacterReviewPolicy: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/character-review-policy`,
  dndCharacterReviewSubmit: (campaignId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/character-reviews/${pathPart(actorId)}/submit`,
  dndCharacterReviewDecision: (campaignId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/character-reviews/${pathPart(actorId)}/decision`,
  dndInventory: (campaignId: string, actorId?: string) => {
    const path = `/api/v1/campaigns/${pathPart(campaignId)}/dnd/inventory`;
    return actorId ? `${path}?actorId=${pathPart(actorId)}` : path;
  },
  dndPartyStash: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/party-stash`,
  dndMerchants: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/merchants`,
  dndMerchant: (campaignId: string, merchantId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/merchants/${pathPart(merchantId)}`,
  dndMerchantBuy: (campaignId: string, merchantId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/merchants/${pathPart(merchantId)}/buy`,
  dndMerchantSell: (campaignId: string, merchantId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/merchants/${pathPart(merchantId)}/sell`,
  dndInventoryItem: (campaignId: string, itemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/inventory/items/${pathPart(itemId)}`,
  dndInventoryTransfer: (campaignId: string, itemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/inventory/items/${pathPart(itemId)}/transfer`,
  dndInventoryConsumeAmmunition: (campaignId: string, weaponItemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/inventory/items/${pathPart(weaponItemId)}/consume-ammunition`,
  dndCombatLoot: (combatId: string) =>
    `/api/v1/combats/${pathPart(combatId)}/dnd/loot`,
  dndLootClaim: (campaignId: string, itemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/loot/${pathPart(itemId)}/claim`,
  dndLootAssignment: (campaignId: string, itemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/loot/${pathPart(itemId)}/assignment`,
  systemActorCompendium: (
    campaignId: string,
    systemId: string,
    actorId: string,
  ) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/compendium`,
  systemActorPurchase: (
    campaignId: string,
    systemId: string,
    actorId: string,
  ) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/purchase`,
  systemActorConditions: (
    campaignId: string,
    systemId: string,
    actorId: string,
  ) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/conditions`,
  systemActorCondition: (
    campaignId: string,
    systemId: string,
    actorId: string,
    conditionId: string,
  ) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/conditions/${pathPart(conditionId)}`,
  systemActorAdvancement: (
    campaignId: string,
    systemId: string,
    actorId: string,
  ) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/advancement`,
  systemActorRulesValidation: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/rules-validation`,
  systemActorCalculationExplanation: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/calculation-explanation`,
  systemControlledCreatures: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/controlled-creatures`,
  systemControlledCreaturesPreview: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/controlled-creatures/preview`,
  systemControlledCreatureCommand: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/controlled-creatures/${pathPart(actorId)}/command`,
  systemControlledCreatureEnd: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/controlled-creatures/${pathPart(actorId)}/end`,
  systemControlledCreatureConcentrationEnd: (campaignId: string, systemId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/controlled-creatures/concentration/end`,
  systemActorRulesPreview: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/rules-preview`,
  systemActorTypedDamageApply: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/typed-damage/apply`,
  systemActorPendingAdvancement: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/advancement/pending`,
  dndRulesMutationUndo: (campaignId: string, mutationId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dnd/rules-mutations/${pathPart(mutationId)}/undo`,
  systemActorSpellPreparationPreview: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/spell-preparation/preview`,
  systemActorSpellPreparationApply: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/spell-preparation/apply`,
  systemActorAttunement: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/attunement`,
  systemActorAdvance: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/advance`,
  systemActorRest: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/rest`,
  systemActorSheet: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/sheet`,
  systemActorHeroicInspirationGrant: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/heroic-inspiration/grant`,
  systemActorHeroicInspirationReroll: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/heroic-inspiration/reroll`,
  systemActorRoll: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/systems/${pathPart(systemId)}/actors/${pathPart(actorId)}/roll`,
  plugins: "/api/v1/plugins",
  pluginRegistrySync: "/api/v1/plugins/registry/sync",
  campaignPlugins: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/plugins`,
  campaignPlugin: (campaignId: string, pluginId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/plugins/${pathPart(pluginId)}`,
  pluginStorage: (campaignId: string, pluginId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/plugins/${pathPart(pluginId)}/storage`,
  pluginStorageEntry: (campaignId: string, pluginId: string, key: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/plugins/${pathPart(pluginId)}/storage/${pathPart(key)}`,
  pluginChatCommand: (campaignId: string, pluginId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/plugins/${pathPart(pluginId)}/chat-command`,
  exportCampaign: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/export`,
  exportCampaignStream: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/export/stream`,
  dogfoodReportBundle: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/dogfood-report-bundle`,
  campaignArchiveImportOperations: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/archive-import-operations`,
  campaignArchiveImportOperationPreview: (campaignId: string, operationId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/archive-import-operations/${pathPart(operationId)}/preview`,
  campaignArchiveImportOperationRollback: (campaignId: string, operationId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/archive-import-operations/${pathPart(operationId)}/rollback`,
  importCampaign: "/api/v1/import/campaign",
  importCampaignStream: "/api/v1/import/campaign/stream",
  campaignRolls: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/rolls`,
  campaignRollVerify: (campaignId: string, rollId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/rolls/${pathPart(rollId)}/verify`,
  campaignSnapshot: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/snapshot`,
  contentImports: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/content-imports`,
  contentImportPreview: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/content-imports/preview`,
  contentImportPdfAi: (campaignId: string) =>
    `/api/v1/campaigns/${pathPart(campaignId)}/content-imports/pdf/ai`,
  contentImport: (importId: string) =>
    `/api/v1/content-imports/${pathPart(importId)}`,
  contentImportApply: (importId: string) =>
    `/api/v1/content-imports/${pathPart(importId)}/apply`,
  contentImportRollback: (importId: string) =>
    `/api/v1/content-imports/${pathPart(importId)}/rollback`,
  contentImportDelete: (importId: string) =>
    `/api/v1/content-imports/${pathPart(importId)}`,
  openApi: "/api/v1/openapi.json",
} as const;

export const apiContractPolicy = {
  versioning: {
    current: apiVersion,
    basePath: "/api/v1",
    compatibility:
      "v1 routes are additive within the major version; incompatible response or request semantics require a new /api/v{n} base path.",
    deprecation:
      "Deprecated v1 fields and routes must remain documented until the next major API base path is available.",
  },
  auth: {
    scheme: "BearerAuth",
    header: "Authorization",
    bearerFormat: "opaque ots_ session token",
    queryTokenExceptions: [
      "asset blob delivery",
      "realtime websocket connection",
    ],
  },
  errors: {
    schema: "ErrorResponse",
    fields: ["error", "message", "code", "details", "requestId"],
    semantics: {
      400: "invalid request shape or unsupported parameter",
      401: "missing, expired, or insufficiently completed authentication",
      403: "authenticated caller lacks the explicit permission for the route",
      404: "target resource is absent or not visible to the caller",
      409: "state conflict, duplicate, stale, or not-ready transition",
      422: "well-formed request failed domain validation",
      429: "rate limit exceeded when deployment throttles are enabled",
      500: "unexpected server failure",
    },
  },
  idempotency: {
    header: "Idempotency-Key",
    appliesTo: ["POST", "PUT", "PATCH", "DELETE"],
    excludes: [
      "authentication and credential lifecycle",
      "invite issuance and acceptance",
      "signed asset delivery",
      "secret-bearing responses",
      "anonymous callers",
    ],
    guarantee:
      "Authenticated clients may send a stable key for eligible non-secret mutations. The v1 runtime persists successful JSON responses only when they contain no credentials or capability URLs, and replays matching method/path/user/body requests with Idempotency-Replayed: true; reusing a key for a different request returns 409.",
  },
  pagination: {
    cursorParameter: "cursor",
    limitParameter: "limit",
    offsetParameter: "offset",
    defaultLimit: 50,
    maxLimit: 200,
  },
  rateLimits: {
    statusCode: 429,
    headers: [
      "Retry-After",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    enforcement:
      "The API runtime enforces a fixed-window per-route caller limit when OTTE_RATE_LIMIT_ENABLED=true and enables it by default in production. OTTE_RATE_LIMIT_WINDOW_SECONDS and OTTE_RATE_LIMIT_MAX_REQUESTS tune the window and ceiling.",
  },
  chat: {
    messageBodyMaxLength: 4096,
  },
} as const;

const endpointSpecs = [
  ["GET", routes.health],
  ["GET", routes.openApi],
  ["POST", routes.mcp],
  ["GET", "/api/v1/agent/board-captures/{captureHandle}"],
  ["POST", "/api/v1/agent/board-captures/{captureHandle}"],
  ["GET", routes.bootstrap],
  ["POST", routes.bootstrap],
  ["POST", routes.register],
  ["POST", routes.login],
  ["POST", routes.logout],
  ["POST", routes.passwordResetRequest],
  ["POST", routes.passwordResetConfirm],
  ["POST", routes.passwordChange],
  ["GET", routes.mfaStatus],
  ["POST", routes.mfaTotpEnroll],
  ["POST", routes.mfaTotpConfirm],
  ["DELETE", routes.mfaTotpDisable],
  ["GET", routes.session],
  ["GET", routes.profile],
  ["PATCH", routes.profile],
  ["GET", routes.authSessions],
  ["DELETE", "/api/v1/auth/sessions/{sessionId}"],
  ["GET", routes.oidcConfig],
  ["GET", routes.oidcStart],
  ["POST", routes.oidcStart],
  ["GET", routes.oidcCallback],
  ["GET", routes.organizations],
  ["POST", routes.organizations],
  ["PATCH", routes.organizationSession],
  ["GET", routes.organizationWorkspaceDefaults],
  ["PATCH", routes.organizationWorkspaceDefaults],
  ["GET", routes.organizationMembers],
  ["POST", routes.organizationMembers],
  ["PATCH", "/api/v1/organization/members/{memberId}"],
  ["DELETE", "/api/v1/organization/members/{memberId}"],
  ["GET", routes.organizationInvites],
  ["POST", routes.organizationInvites],
  ["GET", routes.adminUsers],
  ["PATCH", "/api/v1/admin/users/{userId}"],
  ["POST", "/api/v1/admin/users/{userId}/password-reset"],
  ["POST", "/api/v1/admin/password-resets/prune"],
  ["GET", "/api/v1/admin/users/{userId}/sessions/revocation-plan"],
  ["DELETE", "/api/v1/admin/users/{userId}/sessions"],
  ["GET", routes.adminSessions],
  ["POST", "/api/v1/admin/sessions/prune"],
  ["GET", "/api/v1/admin/sessions/risk"],
  ["POST", "/api/v1/admin/sessions/risk/revoke"],
  ["DELETE", "/api/v1/admin/sessions/{sessionId}"],
  ["GET", "/api/v1/admin/auth/config"],
  ["GET", "/api/v1/admin/auth/operations"],
  ["POST", "/api/v1/admin/auth/test-connection"],
  ["GET", routes.adminEmailOutbox],
  ["POST", "/api/v1/admin/email-outbox/retry-all"],
  ["POST", "/api/v1/admin/email-outbox/{messageId}/retry"],
  ["GET", "/api/v1/admin/audit-logs"],
  ["GET", routes.adminJobs],
  ["POST", routes.adminJobs],
  ["POST", "/api/v1/admin/jobs/lease"],
  ["GET", routes.adminJobOperations],
  ["GET", routes.adminJobMetrics],
  ["POST", routes.adminJobAlerts],
  ["GET", "/api/v1/admin/jobs/{jobId}"],
  ["PATCH", "/api/v1/admin/jobs/{jobId}"],
  ["POST", "/api/v1/admin/jobs/{jobId}/heartbeat"],
  ["POST", "/api/v1/admin/jobs/{jobId}/retry"],
  ["POST", "/api/v1/admin/jobs/{jobId}/cancel"],
  ["GET", "/api/v1/admin/ai/operations"],
  ["POST", "/api/v1/admin/ai/proposals/stale/reject"],
  ["POST", "/api/v1/admin/ai/threads/stale/fail"],
  ["POST", "/api/v1/admin/ai/tool-calls/stale/fail"],
  ["POST", "/api/v1/admin/ai/tool-calls/retry"],
  ["GET", "/api/v1/admin/ai/evaluations"],
  ["GET", routes.adminAiPolicy],
  ["GET", routes.adminPluginReviews],
  ["PATCH", "/api/v1/admin/plugins/reviews/{reviewKey}"],
  ["POST", "/api/v1/admin/plugins/registry/sync"],
  ["GET", "/api/v1/admin/plugins/operations"],
  ["GET", "/api/v1/admin/systems/operations"],
  ["GET", "/api/v1/admin/rendering/operations"],
  ["GET", routes.adminScimGroupRoleMappings],
  ["GET", routes.adminScimGroupRoleMappingPreview],
  ["POST", routes.adminScimGroupRoleMappings],
  ["DELETE", "/api/v1/admin/scim/group-role-mappings/{mappingId}"],
  ["GET", routes.scimServiceProviderConfig],
  ["GET", routes.scimUsers],
  ["POST", routes.scimUsers],
  ["GET", "/api/v1/scim/v2/Users/{userId}"],
  ["PUT", "/api/v1/scim/v2/Users/{userId}"],
  ["PATCH", "/api/v1/scim/v2/Users/{userId}"],
  ["DELETE", "/api/v1/scim/v2/Users/{userId}"],
  ["GET", routes.scimGroups],
  ["POST", routes.scimGroups],
  ["GET", "/api/v1/scim/v2/Groups/{groupId}"],
  ["PUT", "/api/v1/scim/v2/Groups/{groupId}"],
  ["PATCH", "/api/v1/scim/v2/Groups/{groupId}"],
  ["DELETE", "/api/v1/scim/v2/Groups/{groupId}"],
  ["GET", routes.adminAssetStorage],
  ["GET", "/api/v1/admin/assets/integrity"],
  ["POST", "/api/v1/admin/assets/integrity/quarantine"],
  ["POST", routes.adminAssetMigration],
  ["POST", routes.adminAssetCleanup],
  ["POST", "/api/v1/admin/assets/{assetId}/purge-cache"],
  ["GET", routes.adminStorageOperations],
  ["GET", routes.adminOperationsMetrics],
  ["GET", routes.adminRetentionOperations],
  ["POST", routes.adminRetentionPrune],
  ["POST", routes.adminStorageBackup],
  ["POST", routes.adminStorageRestoreDrill],
  ["POST", routes.adminStorageRestore],
  ["GET", routes.campaigns],
  ["POST", routes.campaigns],
  ["GET", "/api/v1/campaigns/{campaignId}"],
  ["PATCH", "/api/v1/campaigns/{campaignId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/members"],
  ["GET", "/api/v1/campaigns/{campaignId}/presence"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/members/{memberId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/members/{memberId}"],
  ["POST", "/api/v1/campaigns/{campaignId}/ownership-transfer"],
  ["POST", "/api/v1/campaigns/{campaignId}/duplicate"],
  ["GET", "/api/v1/campaigns/{campaignId}/character-transfers"],
  ["POST", "/api/v1/campaigns/{campaignId}/actors/{actorId}/transfers"],
  ["POST", "/api/v1/campaigns/{campaignId}/character-transfers/{transferId}/accept"],
  ["POST", "/api/v1/campaigns/{campaignId}/character-transfers/{transferId}/decline"],
  ["POST", "/api/v1/campaigns/{campaignId}/character-transfers/{transferId}/cancel"],
  ["GET", "/api/v1/campaigns/{campaignId}/webhooks"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/disable"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret"],
  ["GET", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test"],
  ["POST", "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry"],
  ["GET", "/api/v1/campaigns/{campaignId}/sessions"],
  ["POST", "/api/v1/campaigns/{campaignId}/sessions"],
  ["GET", "/api/v1/campaigns/{campaignId}/search"],
  ["GET", "/api/v1/campaign-sessions/{sessionId}"],
  ["PATCH", "/api/v1/campaign-sessions/{sessionId}"],
  ["DELETE", "/api/v1/campaign-sessions/{sessionId}"],
  ["POST", "/api/v1/campaign-sessions/{sessionId}/start"],
  ["POST", "/api/v1/campaign-sessions/{sessionId}/complete"],
  ["POST", "/api/v1/campaigns/{campaignId}/archive"],
  ["POST", "/api/v1/campaigns/{campaignId}/restore"],
  ["GET", "/api/v1/campaigns/{campaignId}/invites"],
  ["POST", "/api/v1/campaigns/{campaignId}/invites"],
  ["POST", routes.acceptInvite],
  ["GET", routes.invitePreview],
  ["POST", "/api/v1/invites/{inviteId}/revoke"],
  ["GET", "/api/v1/campaigns/{campaignId}/worlds"],
  ["POST", "/api/v1/campaigns/{campaignId}/worlds"],
  ["GET", "/api/v1/worlds/{worldId}"],
  ["PATCH", "/api/v1/worlds/{worldId}"],
  ["DELETE", "/api/v1/worlds/{worldId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/world-records"],
  ["POST", "/api/v1/campaigns/{campaignId}/world-records"],
  ["PATCH", "/api/v1/world-records/{recordId}"],
  ["POST", "/api/v1/world-records/{recordId}/lifecycle"],
  ["DELETE", "/api/v1/world-records/{recordId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/world-relations"],
  ["POST", "/api/v1/campaigns/{campaignId}/world-relations"],
  ["PATCH", "/api/v1/world-relations/{relationId}"],
  ["DELETE", "/api/v1/world-relations/{relationId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/scenes"],
  ["POST", "/api/v1/campaigns/{campaignId}/scenes"],
  ["POST", "/api/v1/campaigns/{campaignId}/scene-duplications"],
  ["GET", "/api/v1/campaigns/{campaignId}/fog-presets"],
  ["POST", "/api/v1/campaigns/{campaignId}/fog-presets"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/fog-presets/{presetId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/assets"],
  ["GET", "/api/v1/campaigns/{campaignId}/assets/storage"],
  ["POST", "/api/v1/campaigns/{campaignId}/assets"],
  ["POST", "/api/v1/campaigns/{campaignId}/assets/upload"],
  ["PATCH", "/api/v1/assets/{assetId}"],
  ["GET", "/api/v1/assets/{assetId}/blob"],
  ["POST", "/api/v1/assets/{assetId}/delivery-url"],
  ["PATCH", "/api/v1/assets/{assetId}/lifecycle"],
  ["GET", "/api/v1/scenes/{sceneId}"],
  ["GET", "/api/v1/scenes/{sceneId}/delegations"],
  ["PATCH", "/api/v1/scenes/{sceneId}/delegations/{userId}"],
  ["PATCH", "/api/v1/scenes/{sceneId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}"],
  ["POST", "/api/v1/scenes/{sceneId}/ai-edits/apply-to-target"],
  ["GET", "/api/v1/scenes/{sceneId}/vision"],
  ["GET", "/api/v1/scenes/{sceneId}/vision/sample"],
  ["POST", "/api/v1/scenes/{sceneId}/path-measurement"],
  ["POST", "/api/v1/scenes/{sceneId}/difficult-terrain"],
  ["PATCH", "/api/v1/scenes/{sceneId}/difficult-terrain/{regionId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}/difficult-terrain/{regionId}"],
  ["POST", "/api/v1/scenes/{sceneId}/cover-overrides"],
  ["DELETE", "/api/v1/scenes/{sceneId}/cover-overrides/{overrideId}"],
  ["GET", "/api/v1/scenes/{sceneId}/rendering/diagnostics"],
  ["POST", "/api/v1/scenes/{sceneId}/fog"],
  ["GET", "/api/v1/scenes/{sceneId}/fog/history"],
  ["POST", "/api/v1/scenes/{sceneId}/fog/undo"],
  ["GET", "/api/v1/scenes/{sceneId}/edits"],
  ["POST", "/api/v1/scenes/{sceneId}/undo"],
  ["POST", "/api/v1/scenes/{sceneId}/fog/apply-preset"],
  ["PATCH", "/api/v1/scenes/{sceneId}/fog/{fogId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}/fog/{fogId}"],
  ["POST", "/api/v1/scenes/{sceneId}/walls"],
  ["PATCH", "/api/v1/scenes/{sceneId}/walls/{wallId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}/walls/{wallId}"],
  ["POST", "/api/v1/scenes/{sceneId}/lights"],
  ["PATCH", "/api/v1/scenes/{sceneId}/lights/{lightId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}/lights/{lightId}"],
  ["POST", "/api/v1/scenes/{sceneId}/annotations"],
  ["PATCH", "/api/v1/scenes/{sceneId}/annotations/{annotationId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}/annotations/{annotationId}"],
  ["GET", "/api/v1/scenes/{sceneId}/tokens"],
  ["POST", "/api/v1/scenes/{sceneId}/tokens"],
  ["POST", "/api/v1/scenes/{sceneId}/encounter-monster-placements"],
  ["POST", "/api/v1/tokens/{tokenId}/target"],
  ["PATCH", "/api/v1/tokens/{tokenId}"],
  ["DELETE", "/api/v1/tokens/{tokenId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/actors"],
  ["POST", "/api/v1/campaigns/{campaignId}/actors"],
  ["GET", "/api/v1/actors/{actorId}"],
  ["PATCH", "/api/v1/actors/{actorId}"],
  ["POST", "/api/v1/actors/{actorId}/concentration/end"],
  ["DELETE", "/api/v1/actors/{actorId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/actors/{actorId}/calculation-overrides"],
  ["POST", "/api/v1/campaigns/{campaignId}/actors/{actorId}/calculation-overrides"],
  ["POST", "/api/v1/calculation-overrides/{overrideId}/clear"],
  ["GET", "/api/v1/campaigns/{campaignId}/items"],
  ["POST", "/api/v1/campaigns/{campaignId}/items"],
  ["GET", "/api/v1/items/{itemId}"],
  ["PATCH", "/api/v1/items/{itemId}"],
  ["DELETE", "/api/v1/items/{itemId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/journal"],
  ["POST", "/api/v1/campaigns/{campaignId}/journal"],
  ["GET", "/api/v1/journal/{entryId}"],
  ["PATCH", "/api/v1/journal/{entryId}"],
  ["DELETE", "/api/v1/journal/{entryId}"],
  ["GET", "/api/v1/journal/{entryId}/backlinks"],
  ["GET", "/api/v1/journal/{entryId}/history"],
  ["POST", "/api/v1/journal/{entryId}/canon-review"],
  ["GET", "/api/v1/campaigns/{campaignId}/handouts"],
  ["POST", "/api/v1/campaigns/{campaignId}/handouts"],
  ["GET", "/api/v1/handouts/{handoutId}"],
  ["PATCH", "/api/v1/handouts/{handoutId}"],
  ["DELETE", "/api/v1/handouts/{handoutId}"],
  ["POST", "/api/v1/handouts/{handoutId}/read"],
  ["POST", routes.dice],
  ["POST", routes.chat],
  ["GET", routes.chat],
  ["PATCH", "/api/v1/chat/messages/{messageId}"],
  ["PATCH", "/api/v1/chat/messages/{messageId}/moderation"],
  ["DELETE", "/api/v1/chat/messages/{messageId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/rolls"],
  ["GET", "/api/v1/campaigns/{campaignId}/rolls/{rollId}/verify"],
  ["GET", "/api/v1/campaigns/{campaignId}/snapshot"],
  ["GET", "/api/v1/campaigns/{campaignId}/chat/export"],
  ["GET", "/api/v1/campaigns/{campaignId}/dice-macros"],
  ["POST", "/api/v1/campaigns/{campaignId}/dice-macros"],
  ["GET", "/api/v1/campaigns/{campaignId}/audio"],
  ["POST", "/api/v1/campaigns/{campaignId}/audio"],
  ["PATCH", "/api/v1/audio/{trackId}"],
  ["DELETE", "/api/v1/audio/{trackId}"],
  ["PATCH", "/api/v1/dice-macros/{macroId}"],
  ["DELETE", "/api/v1/dice-macros/{macroId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/combats"],
  ["POST", "/api/v1/campaigns/{campaignId}/combats"],
  ["POST", "/api/v1/campaigns/{campaignId}/combats/start"],
  ["GET", "/api/v1/campaigns/{campaignId}/encounters"],
  ["POST", "/api/v1/campaigns/{campaignId}/encounters"],
  ["GET", "/api/v1/encounters/{encounterId}"],
  ["PATCH", "/api/v1/encounters/{encounterId}"],
  ["DELETE", "/api/v1/encounters/{encounterId}"],
  ["GET", "/api/v1/combats/{combatId}/audit"],
  ["POST", "/api/v1/combats/{combatId}/rewards"],
  ["POST", "/api/v1/combats/{combatId}/environment-mechanics"],
  ["PATCH", "/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}"],
  ["DELETE", "/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}"],
  ["POST", "/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}/trigger"],
  ["POST", "/api/v1/combats/{combatId}/effects/preview"],
  ["POST", "/api/v1/combats/{combatId}/effects/advance"],
  ["POST", "/api/v1/combats/{combatId}/actions/{actionId}/confirm"],
  ["POST", "/api/v1/combats/{combatId}/actions/{actionId}/reject"],
  ["POST", "/api/v1/combats/{combatId}/initiative/roll-npcs"],
  ["PATCH", "/api/v1/combats/{combatId}"],
  ["PATCH", "/api/v1/combats/{combatId}/combatants/{combatantId}"],
  ["DELETE", "/api/v1/combats/{combatId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/proposals"],
  ["POST", "/api/v1/campaigns/{campaignId}/proposals"],
  ["POST", "/api/v1/proposals/{proposalId}/approve"],
  ["POST", "/api/v1/proposals/{proposalId}/reject"],
  ["POST", "/api/v1/proposals/{proposalId}/apply"],
  ["POST", "/api/v1/proposals/{proposalId}/revert"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/threads"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/threads"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/policy"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/ai/policy"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/privacy/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/privacy/prune"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/usage"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/evaluations"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/evaluations"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/memory"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/memory"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/memory/extract"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/tool-calls"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/tool-calls/{toolCallId}/retry"],
  ["DELETE", "/api/v1/ai/memory/{factId}"],
  ["GET", "/api/v1/ai/memory/{factId}"],
  ["PATCH", "/api/v1/ai/memory/{factId}"],
  ["POST", "/api/v1/ai/memory/{factId}/approve"],
  ["POST", "/api/v1/ai/memory/{factId}/reject"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/session-recap"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/encounter-design"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/generate-map-asset"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/generate-token-asset"],
  ["GET", routes.plugins],
  ["POST", "/api/v1/plugins/install"],
  ["POST", routes.pluginRegistrySync],
  ["GET", "/api/v1/campaigns/{campaignId}/plugins"],
  ["POST", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/install"],
  ["GET", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage"],
  ["GET", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}"],
  ["PUT", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}"],
  ["POST", "/api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command"],
  ["GET", routes.systems],
  ["POST", "/api/v1/systems/install"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems"],
  ["GET", "/api/v1/campaigns/{campaignId}/compatibility"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/install"],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins",
  ],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/monsters"],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats",
  ],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/compendium"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/spell-helper/preview"],
  ["GET", "/api/v1/campaigns/{campaignId}/dnd/custom-content"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/custom-content/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/custom-content"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/dnd/custom-content/{itemId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/dnd/custom-content/{itemId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/dnd/monster-templates"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/monster-templates/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/monster-templates"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/dnd/monster-templates/{templateId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/dnd/monster-templates/{templateId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/dnd/monster-bases"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/monster-variants/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/monster-variants"],
  ["GET", "/api/v1/campaigns/{campaignId}/dnd/character-reviews"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/dnd/character-review-policy"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/character-reviews/{actorId}/submit"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/character-reviews/{actorId}/decision"],
  ["GET", "/api/v1/campaigns/{campaignId}/dnd/inventory"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/party-stash"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/merchants"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}"],
  ["PATCH", "/api/v1/campaigns/{campaignId}/dnd/inventory/items/{itemId}"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/inventory/items/{itemId}/transfer"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/inventory/items/{weaponItemId}/consume-ammunition"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}/buy"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}/sell"],
  ["POST", "/api/v1/combats/{combatId}/dnd/loot"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/loot/{itemId}/claim"],
  ["POST", "/api/v1/campaigns/{campaignId}/dnd/loot/{itemId}/assignment"],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions",
  ],
  [
    "DELETE",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/attunement",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement",
  ],
  [
    "DELETE",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement/pending",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-validation",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/calculation-explanation",
  ],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/command"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/concentration/end"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/end"],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-preview",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/typed-damage/apply",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/dnd/rules-mutations/{mutationId}/undo",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/spell-preparation/preview",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/spell-preparation/apply",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest",
  ],
  [
    "GET",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/heroic-inspiration/grant",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/heroic-inspiration/reroll",
  ],
  [
    "POST",
    "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll",
  ],
  ["GET", "/api/v1/campaigns/{campaignId}/export"],
  ["GET", "/api/v1/campaigns/{campaignId}/export/stream"],
  ["GET", "/api/v1/campaigns/{campaignId}/dogfood-report-bundle"],
  ["GET", "/api/v1/campaigns/{campaignId}/archive-import-operations"],
  ["GET", "/api/v1/campaigns/{campaignId}/archive-import-operations/{operationId}/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/archive-import-operations/{operationId}/rollback"],
  ["POST", routes.importCampaign],
  ["POST", routes.importCampaignStream],
  ["GET", "/api/v1/campaigns/{campaignId}/content-imports"],
  ["POST", "/api/v1/campaigns/{campaignId}/content-imports/preview"],
  ["POST", "/api/v1/campaigns/{campaignId}/content-imports/pdf/ai"],
  ["GET", "/api/v1/content-imports/{importId}"],
  ["POST", "/api/v1/content-imports/{importId}/apply"],
  ["POST", "/api/v1/content-imports/{importId}/rollback"],
  ["DELETE", "/api/v1/content-imports/{importId}"],
] as const;

type EndpointSpec = (typeof endpointSpecs)[number];
type HttpMethod = EndpointSpec[0];
type OpenApiParameter = {
  name: string;
  in: "header" | "path" | "query";
  required?: boolean;
  description?: string;
  schema: Record<string, unknown>;
};
type OpenApiResponse = {
  description: string;
  headers?: Record<string, unknown>;
  content?: Record<string, unknown>;
};
type OpenApiRequestBody = {
  required?: boolean;
  description?: string;
  content: Record<string, unknown>;
};
type OpenApiOperation = {
  operationId: string;
  summary: string;
  description: string;
  security?: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
};
type OpenApiPathItem = Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>;

const errorContent = {
  "application/json": {
    schema: {
      $ref: "#/components/schemas/ErrorResponse",
    },
  },
};

const idempotencyKeyParameter: OpenApiParameter = {
  name: apiContractPolicy.idempotency.header,
  in: "header",
  required: false,
  description:
    "Stable client-generated key for retrying one logical mutation without duplicating side effects once route-level replay storage is enabled.",
  schema: {
    type: "string",
    minLength: 8,
    maxLength: 160,
  },
};

const requiredWebhookIdempotencyKeyParameter: OpenApiParameter = {
  ...idempotencyKeyParameter,
  required: true,
  description:
    "Stable opaque key reused only when retrying the same human-confirmed webhook mutation.",
};

const requiredOperatorIdempotencyKeyParameter: OpenApiParameter = {
  ...idempotencyKeyParameter,
  required: true,
  description:
    "Stable caller-generated retry identity for one logical privileged operator mutation.",
};

const paginationParameters: OpenApiParameter[] = [
  {
    name: apiContractPolicy.pagination.limitParameter,
    in: "query",
    required: false,
    description: `Maximum records to return. Defaults to ${apiContractPolicy.pagination.defaultLimit}; production list routes should not exceed ${apiContractPolicy.pagination.maxLimit}.`,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: apiContractPolicy.pagination.maxLimit,
    },
  },
  {
    name: apiContractPolicy.pagination.cursorParameter,
    in: "query",
    required: false,
    description: "Opaque cursor returned by a previous list response.",
    schema: {
      type: "string",
    },
  },
  {
    name: apiContractPolicy.pagination.offsetParameter,
    in: "query",
    required: false,
    description:
      "Zero-based result offset for list routes that support offset pagination. Do not combine with cursor.",
    schema: {
      type: "integer",
      minimum: 0,
    },
  },
];

function errorResponse(description: string): OpenApiResponse {
  return {
    description,
    content: errorContent,
  };
}

const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

const arrayOf = (items: Record<string, unknown>) => ({
  type: "array",
  items,
});

const paginatedObjectOf = (items: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: ["items", "pagination"],
  properties: {
    items: arrayOf(items),
    pagination: schemaRef("PaginationMeta"),
  },
});

function jsonContent(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    "application/json": {
      schema,
    },
  };
}

function jsonResponse(
  description: string,
  schema: Record<string, unknown>,
): OpenApiResponse {
  return {
    description,
    content: jsonContent(schema),
  };
}

function scimCompatibleErrorResponse(description: string): OpenApiResponse {
  return jsonResponse(description, {
    oneOf: [schemaRef("ScimError"), schemaRef("ErrorResponse")],
  });
}

const unsupportedSystemCapabilityResponse = jsonResponse(
  "The requested rules-system runtime does not implement this capability",
  schemaRef("UnsupportedSystemCapabilityResponse"),
);

function textResponse(description: string): OpenApiResponse {
  return {
    description,
    content: {
      "text/plain": {
        schema: { type: "string" },
      },
    },
  };
}

function jsonRequestBody(
  schema: Record<string, unknown>,
  description?: string,
): OpenApiRequestBody {
  return {
    required: true,
    ...(description ? { description } : {}),
    content: jsonContent(schema),
  };
}

function optionalJsonRequestBody(
  schema: Record<string, unknown>,
  description?: string,
): OpenApiRequestBody {
  return {
    required: false,
    ...(description ? { description } : {}),
    content: jsonContent(schema),
  };
}

function binaryRequestBody(
  contentType: string,
  description: string,
): OpenApiRequestBody {
  return {
    required: true,
    description,
    content: {
      [contentType]: {
        schema: {
          type: "string",
          format: "binary",
        },
      },
    },
  };
}

const stringSchema = {
  type: "string",
};

const nullableStringSchema = {
  anyOf: [stringSchema, { type: "null" }],
};

const dateTimeSchema = {
  type: "string",
  format: "date-time",
};

const operatorTargetSetHashSchema = {
  type: "string",
  pattern: "^sha256:[a-f0-9]{64}$",
};

const scimStrongEtagSchema = {
  type: "string",
  pattern: '^"scim-sha256-[a-f0-9]{64}"$',
};

const requiredScimIdempotencyKeyParameter: OpenApiParameter = {
  ...idempotencyKeyParameter,
  required: true,
  description: "Stable credential-scoped retry identity for one logical SCIM mutation.",
};

const requiredScimIfMatchParameter: OpenApiParameter = {
  name: "If-Match",
  in: "header",
  required: true,
  description: "The single strong ETag returned by the latest read of this exact SCIM resource.",
  schema: scimStrongEtagSchema,
};

const scimEtagResponseHeaders = {
  ETag: {
    description: "Deterministic strong validator, identical to the resource meta.version value.",
    schema: scimStrongEtagSchema,
  },
};

function scimVersionedJsonResponse(description: string, schema: Record<string, unknown>): OpenApiResponse {
  return { ...jsonResponse(description, schema), headers: scimEtagResponseHeaders };
}

const scimPreconditionResponses = {
  "412": scimCompatibleErrorResponse("The supplied strong SCIM validator is stale"),
  "428": scimCompatibleErrorResponse("A strong If-Match validator is required"),
};

const chatMessageBodySchema = {
  type: "string",
  minLength: 1,
  maxLength: apiContractPolicy.chat.messageBodyMaxLength,
  pattern: "\\S",
};

const idSchema = {
  type: "string",
  minLength: 1,
};

const timestampProperties = {
  createdAt: {
    type: "string",
    format: "date-time",
  },
  updatedAt: {
    type: "string",
    format: "date-time",
  },
};

const idTimestampProperties = {
  id: idSchema,
  ...timestampProperties,
};

const looseObjectSchema = {
  type: "object",
  additionalProperties: true,
};

const organizationWorkspaceRequired = [
  "id",
  "name",
  "ownerUserId",
  "defaultSystemId",
  "defaultCampaignVisibility",
  "defaultPermissionTemplate",
  "defaultInviteRole",
  "defaultSceneName",
  "defaultSceneFolder",
  "defaultSceneWidth",
  "defaultSceneHeight",
  "defaultSceneGridSize",
  "onboardingTitle",
  "onboardingBody",
  "createdAt",
  "updatedAt",
];

const organizationWorkspaceProperties = {
  ...idTimestampProperties,
  name: stringSchema,
  ownerUserId: idSchema,
  defaultSystemId: idSchema,
  defaultCampaignVisibility: {
    type: "string",
    enum: ["private", "invite_only", "public"],
  },
  defaultPermissionTemplate: {
    type: "string",
    enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"],
  },
  defaultInviteRole: {
    type: "string",
    enum: ["gm", "assistant_gm", "player", "observer"],
  },
  defaultSceneName: stringSchema,
  defaultSceneFolder: stringSchema,
  defaultSceneWidth: { type: "integer", minimum: 1 },
  defaultSceneHeight: { type: "integer", minimum: 1 },
  defaultSceneGridSize: { type: "integer", minimum: 1 },
  onboardingTitle: stringSchema,
  onboardingBody: stringSchema,
};

const positiveLimitSchema = {
  anyOf: [
    { type: "integer", minimum: 1, maximum: 500 },
    { type: "string", minLength: 1 },
  ],
};

const systemCapabilityValues = [
  "data-model",
  "actor-sheet",
  "quick-rolls",
  "actions",
  "conditions",
  "advancement",
  "rest",
  "compendium",
  "character-templates",
  "character-import",
  "character-origins",
  "encounter-builder",
  "monster-builder",
] as const;

/**
 * Stable outbound event names accepted by the campaign webhook API. Sensitive,
 * unbounded user-authored surfaces such as chat, dice, AI, and imported content
 * are intentionally absent from the v1 webhook contract.
 */
export const campaignWebhookEventTypeValues = [
  "campaign.updated",
  "campaign.session.created",
  "campaign.session.updated",
  "campaign.session.started",
  "campaign.session.completed",
  "campaign.session.deleted",
  "world.created",
  "world.updated",
  "world.deleted",
  "scene.created",
  "scene.updated",
  "scene.deleted",
  "scene.activated",
  "token.created",
  "token.updated",
  "token.moved",
  "token.deleted",
  "actor.created",
  "actor.updated",
  "actor.deleted",
  "item.created",
  "item.updated",
  "item.deleted",
  "journal.created",
  "journal.updated",
  "journal.deleted",
  "handout.created",
  "handout.updated",
  "handout.deleted",
  "asset.created",
  "asset.updated",
  "asset.deleted",
  "audio.updated",
  "audio.deleted",
  "combat.started",
  "combat.roundAdvanced",
  "combat.turnChanged",
  "combat.ended",
  "encounter.created",
  "encounter.updated",
  "encounter.deleted",
  "proposal.created",
  "proposal.updated",
  "proposal.approved",
  "proposal.rejected",
  "proposal.applied",
  "proposal.reverted",
] as const;

const campaignWebhookEnvelopeEventTypeValues = [
  ...campaignWebhookEventTypeValues,
  "webhook.test",
] as const;

const componentSchemas = {
  ErrorResponse: {
    type: "object",
    additionalProperties: true,
    required: ["error"],
    properties: {
      error: {
        type: "string",
        description: "Stable machine-readable error identifier.",
      },
      message: {
        type: "string",
        description:
          "Human-readable error summary safe to show to an operator or caller.",
      },
      code: {
        type: "string",
        description:
          "Optional finer-grained machine-readable code for domain failures.",
      },
      details: {
        description:
          "Optional structured route-specific validation or conflict details.",
      },
      requestId: {
        type: "string",
        description:
          "Optional request correlation identifier when the deployment provides one.",
      },
    },
  },
  StaleWriteConflictResponse: {
    type: "object",
    additionalProperties: true,
    required: ["error", "message"],
    properties: {
      error: { type: "string", enum: ["conflict"] },
      code: stringSchema,
      message: stringSchema,
      resourceType: stringSchema,
      resourceId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      currentUpdatedAt: { type: "string", format: "date-time" },
      current: { type: "object", additionalProperties: true },
    },
  },
  RulesManagedPatchConflictResponse: {
    type: "object",
    additionalProperties: false,
    required: ["error", "code", "message", "resourceType", "resourceId", "managedRoots"],
    properties: {
      error: { type: "string", enum: ["conflict"] },
      code: {
        type: "string",
        enum: ["character_review_route_required", "rules_managed_patch_requires_review"],
      },
      message: stringSchema,
      resourceType: { type: "string", enum: ["actor", "item"] },
      resourceId: idSchema,
      managedRoots: { type: "array", minItems: 1, uniqueItems: true, items: stringSchema },
    },
  },
  UnsupportedSystemCapabilityResponse: {
    type: "object",
    additionalProperties: false,
    required: ["error", "systemId", "capability", "message"],
    properties: {
      error: {
        type: "string",
        enum: ["unsupported_system_capability"],
      },
      systemId: idSchema,
      capability: {
        type: "string",
        enum: systemCapabilityValues,
      },
      message: {
        type: "string",
        minLength: 1,
      },
    },
  },
  PaginationMeta: {
    type: "object",
    additionalProperties: false,
    required: ["limit", "offset", "totalCount"],
    properties: {
      nextCursor: {
        type: "string",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: apiContractPolicy.pagination.maxLimit,
      },
      offset: {
        type: "integer",
        minimum: 0,
      },
      totalCount: {
        type: "integer",
        minimum: 0,
      },
    },
  },
  HealthStatus: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "version", "service"],
    properties: {
      ok: { type: "boolean" },
      version: stringSchema,
      service: stringSchema,
      error: stringSchema,
      workerPrincipals: schemaRef("WorkerPrincipalPosture"),
      dependencies: schemaRef("HealthDependencies"),
      aiPolicy: schemaRef("HealthAiPolicyStatus"),
    },
  },
  HealthDependencyStatus: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
      reason: stringSchema,
    },
  },
  HealthDependencies: {
    type: "object",
    additionalProperties: false,
    required: ["state", "assets", "assetSigning"],
    properties: {
      state: schemaRef("HealthDependencyStatus"),
      assets: schemaRef("HealthDependencyStatus"),
      assetSigning: schemaRef("HealthDependencyStatus"),
    },
  },
  HealthAiPolicyStatus: {
    type: "object",
    additionalProperties: false,
    required: ["enabled", "status", "contextScopes", "retentionDays"],
    properties: {
      enabled: { type: "boolean" },
      status: stringSchema,
      contextScopes: arrayOf(stringSchema),
      retentionDays: { type: "integer", minimum: 0 },
    },
  },
  WorkerPrincipalPosture: {
    type: "object",
    additionalProperties: false,
    required: [
      "profileEnabled",
      "configured",
      "ready",
      "identityCount",
      "tokenHashCount",
      "invalidEntryCount",
      "missingInProduction",
      "invalidInProduction",
    ],
    properties: {
      profileEnabled: { type: "boolean" },
      configured: { type: "boolean" },
      ready: { type: "boolean" },
      identityCount: { type: "integer", minimum: 0 },
      tokenHashCount: { type: "integer", minimum: 0 },
      invalidEntryCount: { type: "integer", minimum: 0 },
      missingInProduction: { type: "boolean" },
      invalidInProduction: { type: "boolean" },
    },
  },
  ServerAdminPosture: {
    type: "object",
    additionalProperties: true,
    properties: {
      configured: { type: "boolean" },
      count: { type: "integer", minimum: 0 },
    },
  },
  BootstrapStatus: {
    type: "object",
    additionalProperties: true,
    required: [
      "required",
      "userCount",
      "campaignCount",
      "publicRegistration",
      "serverAdmins",
    ],
    properties: {
      required: { type: "boolean" },
      userCount: { type: "integer", minimum: 0 },
      campaignCount: { type: "integer", minimum: 0 },
      publicRegistration: { type: "boolean" },
      serverAdmins: schemaRef("ServerAdminPosture"),
    },
  },
  BootstrapOwnerRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email", "displayName", "password"],
    properties: {
      email: { type: "string", format: "email" },
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      password: { type: "string", minLength: 8 },
      campaignName: stringSchema,
      campaignDescription: stringSchema,
      defaultSystemId: idSchema,
    },
  },
  LoginRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: idSchema,
      email: { type: "string", format: "email" },
      password: stringSchema,
      mfaCode: stringSchema,
      recoveryCode: stringSchema,
    },
    anyOf: [{ required: ["userId"] }, { required: ["email"] }],
  },
  RegisterRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email", "displayName", "password"],
    properties: {
      email: { type: "string", format: "email" },
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      password: { type: "string", minLength: 8 },
    },
  },
  PasswordResetRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
      returnTo: stringSchema,
    },
  },
  PasswordResetConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["token", "password"],
    properties: {
      token: stringSchema,
      password: { type: "string", minLength: 8 },
    },
  },
  PasswordChangeRequest: {
    type: "object",
    additionalProperties: false,
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: stringSchema,
      newPassword: { type: "string", minLength: 8 },
    },
  },
  OkResponse: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" },
    },
  },
  PublicUser: {
    type: "object",
    additionalProperties: true,
    required: ["id", "displayName", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      displayName: stringSchema,
      email: { type: "string", format: "email" },
      serverAdmin: { type: "boolean" },
      disabledAt: { type: "string", format: "date-time" },
      mfa: {
        $ref: "#/components/schemas/PublicMfaInfo",
      },
      preferences: schemaRef("UserPreferences"),
    },
  },
  UserPreferences: {
    type: "object",
    additionalProperties: false,
    required: ["theme", "dice3dEnabled", "reducedMotion", "chatNotifications"],
    properties: {
      theme: { type: "string", enum: ["midnight", "ember"] },
      dice3dEnabled: { type: "boolean" },
      reducedMotion: { type: "boolean" },
      chatNotifications: { type: "string", enum: ["all", "mentions", "none"] },
    },
  },
  UserProfileResponse: {
    type: "object",
    additionalProperties: false,
    required: ["user"],
    properties: { user: schemaRef("PublicUser") },
  },
  UserProfilePatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      displayName: { type: "string", minLength: 1, maxLength: 100 },
      preferences: {
        type: "object",
        additionalProperties: false,
        properties: {
          theme: { type: "string", enum: ["midnight", "ember"] },
          dice3dEnabled: { type: "boolean" },
          reducedMotion: { type: "boolean" },
          chatNotifications: { type: "string", enum: ["all", "mentions", "none"] },
        },
      },
    },
  },
  PublicMfaInfo: {
    type: "object",
    additionalProperties: false,
    required: ["totpEnabled", "totpPending", "recoveryCodeCount"],
    properties: {
      totpEnabled: { type: "boolean" },
      totpPending: { type: "boolean" },
      recoveryCodeCount: { type: "integer", minimum: 0 },
      enabledAt: { type: "string", format: "date-time" },
      lastVerifiedAt: { type: "string", format: "date-time" },
    },
  },
  UserSession: {
    type: "object",
    additionalProperties: true,
    required: ["id", "userId", "expiresAt", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      userId: idSchema,
      activeOrganizationId: idSchema,
      expiresAt: { type: "string", format: "date-time" },
      lastSeenAt: { type: "string", format: "date-time" },
    },
  },
  MfaTotpEnrollRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      currentPassword: stringSchema,
    },
  },
  MfaTotpEnrollResponse: {
    type: "object",
    additionalProperties: false,
    required: ["secret", "otpauthUrl", "mfa"],
    properties: {
      secret: stringSchema,
      otpauthUrl: stringSchema,
      mfa: schemaRef("PublicMfaInfo"),
    },
  },
  MfaTotpConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["code"],
    properties: {
      code: stringSchema,
    },
  },
  MfaTotpConfirmResponse: {
    type: "object",
    additionalProperties: false,
    required: ["recoveryCodes", "mfa", "user"],
    properties: {
      recoveryCodes: arrayOf(stringSchema),
      mfa: schemaRef("PublicMfaInfo"),
      user: schemaRef("PublicUser"),
    },
  },
  MfaTotpDisableRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      currentPassword: stringSchema,
      mfaCode: stringSchema,
      recoveryCode: stringSchema,
    },
  },
  MfaTotpDisableResponse: {
    type: "object",
    additionalProperties: false,
    required: ["mfa", "user"],
    properties: {
      mfa: schemaRef("PublicMfaInfo"),
      user: schemaRef("PublicUser"),
    },
  },
  OidcPublicConfig: {
    type: "object",
    additionalProperties: false,
    required: ["enabled"],
    properties: {
      enabled: { type: "boolean" },
      issuer: stringSchema,
      clientId: stringSchema,
      scope: stringSchema,
      displayName: stringSchema,
      redirectUri: stringSchema,
    },
  },
  OidcStartRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      returnTo: stringSchema,
    },
  },
  OidcStartResponse: {
    type: "object",
    additionalProperties: true,
    required: ["authorizationUrl", "expiresAt", "provider"],
    properties: {
      authorizationUrl: stringSchema,
      expiresAt: { type: "string", format: "date-time" },
      provider: {
        type: "object",
        additionalProperties: false,
        required: ["issuer", "clientId", "scope", "displayName", "redirectUri"],
        properties: {
          issuer: stringSchema,
          clientId: stringSchema,
          scope: stringSchema,
          displayName: stringSchema,
          redirectUri: stringSchema,
        },
      },
    },
  },
  AuthIdentity: {
    type: "object",
    additionalProperties: true,
    required: ["id", "userId", "provider", "issuer", "subject"],
    properties: {
      id: idSchema,
      userId: idSchema,
      provider: { type: "string", enum: ["oidc"] },
      issuer: stringSchema,
      subject: stringSchema,
      email: { type: "string", format: "email" },
    },
  },
  OidcCallbackResponse: {
    allOf: [
      schemaRef("LoginResponse"),
      {
        type: "object",
        additionalProperties: true,
        properties: {
          identity: schemaRef("AuthIdentity"),
        },
      },
    ],
  },
  CampaignMember: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "userId", "role", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      role: {
        type: "string",
        enum: [
          "owner",
          "gm",
          "assistant_gm",
          "player",
          "observer",
          "plugin",
          "ai_assistant",
        ],
      },
      user: schemaRef("CampaignMemberUser"),
      active: { type: "boolean" },
      permissions: arrayOf(stringSchema),
    },
  },
  CampaignMemberUser: {
    type: "object",
    additionalProperties: false,
    required: ["id", "displayName"],
    properties: {
      id: idSchema,
      displayName: stringSchema,
      email: { type: "string", format: "email" },
    },
  },
  CampaignMemberSnapshot: {
    allOf: [
      schemaRef("CampaignMember"),
      {
        type: "object",
        additionalProperties: true,
        required: ["user", "active", "permissions"],
        properties: {
          user: schemaRef("CampaignMemberUser"),
          active: { type: "boolean" },
          permissions: arrayOf(stringSchema),
        },
      },
    ],
  },
  CampaignInvite: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "role",
      "invitedByUserId",
      "expiresAt",
      "createdAt",
      "updatedAt",
      "status",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      email: { type: "string", format: "email" },
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      invitedByUserId: idSchema,
      acceptedByUserId: idSchema,
      acceptedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      revokedAt: { type: "string", format: "date-time" },
      status: {
        type: "string",
        enum: ["pending", "accepted", "expired", "revoked"],
      },
    },
  },
  OrganizationInvite: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "role",
      "invitedByUserId",
      "expiresAt",
      "createdAt",
      "updatedAt",
      "status",
      "campaign",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      email: { type: "string", format: "email" },
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      invitedByUserId: idSchema,
      acceptedByUserId: idSchema,
      acceptedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      revokedAt: { type: "string", format: "date-time" },
      status: {
        type: "string",
        enum: ["pending", "accepted", "expired", "revoked"],
      },
      campaign: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name"],
        properties: {
          id: idSchema,
          name: stringSchema,
        },
      },
    },
  },
  CampaignInviteCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      expiresInDays: { type: "integer", minimum: 1, maximum: 30 },
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  OrganizationInviteCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "expectedCampaignUpdatedAt"],
    properties: {
      campaignId: idSchema,
      email: { type: "string", format: "email" },
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      expiresInDays: { type: "integer", minimum: 1, maximum: 30 },
      expectedCampaignUpdatedAt: dateTimeSchema,
    },
  },
  CampaignInviteCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["invite", "token", "acceptUrl"],
    properties: {
      invite: schemaRef("CampaignInvite"),
      token: { type: "string", pattern: "^oti_" },
      acceptUrl: stringSchema,
    },
  },
  InviteAcceptRequest: {
    type: "object",
    additionalProperties: false,
    required: ["token"],
    properties: {
      token: { type: "string", pattern: "^oti_" },
      userId: idSchema,
      email: { type: "string", format: "email" },
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      password: { type: "string", minLength: 8 },
      expectedUpdatedAt: dateTimeSchema,
      mfaCode: stringSchema,
      recoveryCode: stringSchema,
    },
  },
  InviteAcceptResponse: {
    type: "object",
    additionalProperties: false,
    required: ["token", "session", "user", "serverAdmin", "invite", "membership", "campaign"],
    properties: {
      token: { type: "string", pattern: "^ots_" },
      session: schemaRef("UserSession"),
      user: schemaRef("PublicUser"),
      serverAdmin: { type: "boolean" },
      invite: schemaRef("CampaignInvite"),
      membership: schemaRef("CampaignMember"),
      campaign: schemaRef("Campaign"),
    },
  },
  InvitePreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["invite", "campaign", "expectedUpdatedAt"],
    properties: {
      invite: schemaRef("CampaignInvite"),
      campaign: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description"],
        properties: { id: idSchema, name: stringSchema, description: stringSchema },
      },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  ScimMeta: {
    type: "object",
    additionalProperties: false,
    required: ["resourceType", "created", "lastModified", "version", "location"],
    properties: {
      resourceType: { type: "string", enum: ["User", "Group"] },
      created: { type: "string", format: "date-time" },
      lastModified: { type: "string", format: "date-time" },
      version: scimStrongEtagSchema,
      location: stringSchema,
    },
  },
  ScimEmail: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: {
      value: { type: "string", format: "email" },
      primary: { type: "boolean" },
      type: stringSchema,
    },
  },
  ScimUserName: {
    type: "object",
    additionalProperties: false,
    properties: {
      formatted: nullableStringSchema,
      givenName: nullableStringSchema,
      familyName: nullableStringSchema,
    },
  },
  ScimUser: {
    type: "object",
    additionalProperties: true,
    required: [
      "schemas",
      "id",
      "userName",
      "displayName",
      "active",
      "emails",
      "meta",
    ],
    properties: {
      schemas: arrayOf(stringSchema),
      id: idSchema,
      externalId: stringSchema,
      userName: stringSchema,
      displayName: stringSchema,
      name: schemaRef("ScimUserName"),
      active: { type: "boolean" },
      emails: arrayOf(schemaRef("ScimEmail")),
      meta: schemaRef("ScimMeta"),
    },
  },
  ScimUserInput: {
    type: "object",
    additionalProperties: true,
    properties: {
      userName: nullableStringSchema,
      externalId: nullableStringSchema,
      displayName: nullableStringSchema,
      name: { anyOf: [schemaRef("ScimUserName"), { type: "null" }] },
      emails: arrayOf(schemaRef("ScimEmail")),
      active: { type: "boolean" },
    },
  },
  ScimMember: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: {
      value: idSchema,
      $ref: stringSchema,
      display: stringSchema,
    },
  },
  ScimGroup: {
    type: "object",
    additionalProperties: true,
    required: ["schemas", "id", "displayName", "members", "meta"],
    properties: {
      schemas: arrayOf(stringSchema),
      id: idSchema,
      externalId: stringSchema,
      displayName: stringSchema,
      members: arrayOf(schemaRef("ScimMember")),
      meta: schemaRef("ScimMeta"),
    },
  },
  ScimGroupInput: {
    type: "object",
    additionalProperties: true,
    properties: {
      displayName: stringSchema,
      externalId: stringSchema,
      members: arrayOf(schemaRef("ScimMember")),
    },
  },
  ScimPatchOperation: {
    type: "object",
    additionalProperties: true,
    required: ["op"],
    properties: {
      op: {
        type: "string",
        enum: ["add", "replace", "remove", "Add", "Replace", "Remove"],
      },
      path: stringSchema,
      value: {},
    },
  },
  ScimPatchRequest: {
    type: "object",
    additionalProperties: true,
    required: ["Operations"],
    properties: {
      schemas: arrayOf(stringSchema),
      Operations: arrayOf(schemaRef("ScimPatchOperation")),
    },
  },
  ScimUserListResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "schemas",
      "totalResults",
      "startIndex",
      "itemsPerPage",
      "Resources",
    ],
    properties: {
      schemas: arrayOf(stringSchema),
      totalResults: { type: "integer", minimum: 0 },
      startIndex: { type: "integer", minimum: 1 },
      itemsPerPage: { type: "integer", minimum: 0 },
      Resources: arrayOf(schemaRef("ScimUser")),
    },
  },
  ScimGroupListResponse: {
    type: "object",
    additionalProperties: false,
    required: [
      "schemas",
      "totalResults",
      "startIndex",
      "itemsPerPage",
      "Resources",
    ],
    properties: {
      schemas: arrayOf(stringSchema),
      totalResults: { type: "integer", minimum: 0 },
      startIndex: { type: "integer", minimum: 1 },
      itemsPerPage: { type: "integer", minimum: 0 },
      Resources: arrayOf(schemaRef("ScimGroup")),
    },
  },
  ScimServiceProviderConfig: {
    type: "object",
    additionalProperties: true,
    required: [
      "schemas",
      "patch",
      "bulk",
      "filter",
      "changePassword",
      "sort",
      "etag",
      "authenticationSchemes",
    ],
    properties: {
      schemas: arrayOf(stringSchema),
      patch: {
        type: "object",
        additionalProperties: false,
        required: ["supported"],
        properties: { supported: { type: "boolean" } },
      },
      bulk: {
        type: "object",
        additionalProperties: false,
        required: ["supported", "maxOperations", "maxPayloadSize"],
        properties: {
          supported: { type: "boolean" },
          maxOperations: { type: "integer", minimum: 0 },
          maxPayloadSize: { type: "integer", minimum: 0 },
        },
      },
      filter: {
        type: "object",
        additionalProperties: false,
        required: ["supported", "maxResults"],
        properties: {
          supported: { type: "boolean" },
          maxResults: { type: "integer", minimum: 0 },
        },
      },
      changePassword: {
        type: "object",
        additionalProperties: false,
        required: ["supported"],
        properties: { supported: { type: "boolean" } },
      },
      sort: {
        type: "object",
        additionalProperties: false,
        required: ["supported"],
        properties: { supported: { type: "boolean" } },
      },
      etag: {
        type: "object",
        additionalProperties: false,
        required: ["supported"],
        properties: { supported: { type: "boolean", const: true } },
      },
      authenticationSchemes: arrayOf({
        type: "object",
        additionalProperties: true,
        required: ["type", "name"],
        properties: {
          type: stringSchema,
          name: stringSchema,
          primary: { type: "boolean" },
        },
      }),
    },
  },
  ScimError: {
    type: "object",
    additionalProperties: false,
    required: ["schemas", "status", "detail"],
    properties: {
      schemas: arrayOf(stringSchema),
      status: stringSchema,
      detail: stringSchema,
    },
  },
  AdminScimGroupSnapshot: {
    type: "object",
    additionalProperties: false,
    required: ["id", "displayName", "memberUserIds", "updatedAt"],
    properties: {
      id: idSchema,
      displayName: stringSchema,
      externalId: stringSchema,
      memberUserIds: arrayOf(idSchema),
      updatedAt: dateTimeSchema,
    },
  },
  AdminScimGroupRoleMapping: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "role", "createdAt", "updatedAt", "targetSetHash"],
    properties: {
      ...idTimestampProperties,
      groupId: idSchema,
      groupExternalId: stringSchema,
      groupDisplayName: stringSchema,
      campaignId: idSchema,
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      group: schemaRef("AdminScimGroupSnapshot"),
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminScimGroupRoleMappingInput: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "role", "preparedTargetSetHash"],
    properties: {
      groupId: idSchema,
      groupExternalId: stringSchema,
      groupDisplayName: stringSchema,
      campaignId: idSchema,
      role: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      preparedTargetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminScimGroupRoleMappingSelection: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "role"],
    properties: {
      groupId: idSchema,
      groupExternalId: stringSchema,
      groupDisplayName: stringSchema,
      campaignId: idSchema,
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
    },
  },
  AdminScimGroupRoleMappingPreview: {
    type: "object",
    additionalProperties: false,
    required: ["selection", "memberCount", "affectedCampaignMembershipCount", "targetSetHash"],
    properties: {
      selection: schemaRef("AdminScimGroupRoleMappingSelection"),
      group: schemaRef("AdminScimGroupSnapshot"),
      memberCount: { type: "integer", minimum: 0 },
      affectedCampaignMembershipCount: { type: "integer", minimum: 0 },
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminScimGroupRoleMappingDeleteRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "preparedTargetSetHash"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
      preparedTargetSetHash: operatorTargetSetHashSchema,
    },
  },
  ScimGroupRoleSyncResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "matchedGroups",
      "createdMemberships",
      "updatedMemberships",
      "removedMemberships",
      "preservedManualMemberships",
    ],
    properties: {
      matchedGroups: { type: "integer", minimum: 0 },
      createdMemberships: { type: "integer", minimum: 0 },
      updatedMemberships: { type: "integer", minimum: 0 },
      removedMemberships: { type: "integer", minimum: 0 },
      preservedManualMemberships: { type: "integer", minimum: 0 },
    },
  },
  AdminScimGroupRoleMappingCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["mapping", "sync"],
    properties: {
      mapping: schemaRef("AdminScimGroupRoleMapping"),
      sync: schemaRef("ScimGroupRoleSyncResult"),
    },
  },
  AdminScimGroupRoleMappingDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["removedMemberships"],
    properties: {
      removedMemberships: { type: "integer", minimum: 0 },
    },
  },
  AdminUser: {
    allOf: [
      schemaRef("PublicUser"),
      {
        type: "object",
        additionalProperties: true,
        required: [
          "disabled",
          "membershipCount",
          "identityCount",
          "sessionCount",
        ],
        properties: {
          disabled: { type: "boolean" },
          disabledReason: stringSchema,
          disabledAt: { type: "string", format: "date-time" },
          disabledByUserId: idSchema,
          passwordResetRequired: { type: "boolean" },
          membershipCount: { type: "integer", minimum: 0 },
          identityCount: { type: "integer", minimum: 0 },
          sessionCount: { type: "integer", minimum: 0 },
        },
      },
    ],
  },
  AdminUserPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      email: { anyOf: [{ type: "string", format: "email" }, { type: "null" }] },
      disabled: { type: "boolean" },
      disabledReason: stringSchema,
      passwordResetRequired: { type: "boolean" },
    },
  },
  PublicPasswordResetToken: {
    type: "object",
    additionalProperties: false,
    required: ["id", "userId", "email", "expiresAt", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      userId: idSchema,
      email: { type: "string", format: "email" },
      expiresAt: { type: "string", format: "date-time" },
      usedAt: { type: "string", format: "date-time" },
      requestedByUserId: idSchema,
    },
  },
  EmailOutboxMessage: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "to",
      "subject",
      "text",
      "status",
      "provider",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
      deliveryAttempts: { type: "integer", minimum: 0 },
      lastDeliveryAttemptAt: dateTimeSchema,
      to: { type: "string", format: "email" },
      subject: stringSchema,
      text: stringSchema,
      html: stringSchema,
      status: { type: "string", enum: ["pending", "delivered", "failed"] },
      provider: { type: "string", enum: ["outbox", "webhook"] },
      sentAt: { type: "string", format: "date-time" },
      error: stringSchema,
      metadata: { type: "object", additionalProperties: { type: "string" } },
    },
  },
  AdminUserPasswordResetRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
      returnTo: stringSchema,
    },
  },
  AdminUserPasswordResetResponse: {
    type: "object",
    additionalProperties: false,
    required: ["reset", "email"],
    properties: {
      reset: schemaRef("PublicPasswordResetToken"),
      email: schemaRef("EmailOutboxMessage"),
    },
  },
  AdminPasswordResetPruneRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      includeExpired: { type: "boolean" },
      includeUsed: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminPasswordResetPruneResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "generatedAt",
      "dryRun",
      "targetSetHash",
      "includeExpired",
      "includeUsed",
      "matched",
      "pruned",
      "activeRemaining",
      "expiredRemaining",
      "usedRemaining",
      "resets",
    ],
    properties: {
      generatedAt: dateTimeSchema,
      dryRun: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
      includeExpired: { type: "boolean" },
      includeUsed: { type: "boolean" },
      matched: { type: "integer", minimum: 0 },
      pruned: { type: "integer", minimum: 0 },
      activeRemaining: { type: "integer", minimum: 0 },
      expiredRemaining: { type: "integer", minimum: 0 },
      usedRemaining: { type: "integer", minimum: 0 },
      resets: arrayOf(schemaRef("PublicPasswordResetToken")),
    },
  },
  AdminSession: {
    allOf: [
      schemaRef("UserSession"),
      {
        type: "object",
        additionalProperties: true,
        required: ["user"],
        properties: {
          user: schemaRef("PublicUser"),
        },
      },
    ],
  },
  AdminSessionRevokeResponse: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "userId", "targetSetHash", "revoked", "sessions"],
    properties: {
      generatedAt: dateTimeSchema,
      userId: idSchema,
      targetSetHash: operatorTargetSetHashSchema,
      revoked: { type: "integer", minimum: 0 },
      sessions: arrayOf(schemaRef("UserSession")),
    },
  },
  AdminUserSessionRevocationPlan: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "userId", "targetSetHash", "matched", "sessions"],
    properties: {
      generatedAt: dateTimeSchema,
      userId: idSchema,
      targetSetHash: operatorTargetSetHashSchema,
      matched: { type: "integer", minimum: 0 },
      sessions: arrayOf(schemaRef("UserSession")),
    },
  },
  AdminUserSessionRevokeRequest: {
    type: "object",
    additionalProperties: false,
    required: ["targetSetHash"],
    properties: {
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminSessionPruneRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminSessionRevokeRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  AdminSessionPruneResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "generatedAt",
      "dryRun",
      "targetSetHash",
      "matched",
      "pruned",
      "activeRemaining",
      "expiredRemaining",
      "sessions",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      dryRun: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
      matched: { type: "integer", minimum: 0 },
      pruned: { type: "integer", minimum: 0 },
      activeRemaining: { type: "integer", minimum: 0 },
      expiredRemaining: { type: "integer", minimum: 0 },
      sessions: arrayOf(schemaRef("UserSession")),
    },
  },
  AdminSessionRiskReason: {
    type: "string",
    enum: ["expired", "stale", "disabled_user", "unknown_user"],
  },
  AdminSessionRiskItem: {
    type: "object",
    additionalProperties: false,
    required: ["session", "user", "reasons", "expiresInMs"],
    properties: {
      session: schemaRef("UserSession"),
      user: {
        anyOf: [
          schemaRef("PublicUser"),
          {
            type: "object",
            additionalProperties: true,
            required: ["id", "displayName"],
            properties: {
              id: idSchema,
              displayName: stringSchema,
            },
          },
        ],
      },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
      lastSeenAgeDays: { type: "integer", minimum: 0 },
      expiresInMs: { type: "integer" },
    },
  },
  AdminSessionRiskReport: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "staleDays", "totals", "sessions"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      staleDays: { type: "integer", minimum: 1, maximum: 365 },
      totals: {
        type: "object",
        additionalProperties: false,
        required: [
          "totalSessionCount",
          "activeSessionCount",
          "expiredSessionCount",
          "staleSessionCount",
          "disabledUserSessionCount",
          "unknownUserSessionCount",
          "riskSessionCount",
        ],
        properties: {
          totalSessionCount: { type: "integer", minimum: 0 },
          activeSessionCount: { type: "integer", minimum: 0 },
          expiredSessionCount: { type: "integer", minimum: 0 },
          staleSessionCount: { type: "integer", minimum: 0 },
          disabledUserSessionCount: { type: "integer", minimum: 0 },
          unknownUserSessionCount: { type: "integer", minimum: 0 },
          riskSessionCount: { type: "integer", minimum: 0 },
        },
      },
      sessions: arrayOf(schemaRef("AdminSessionRiskItem")),
    },
  },
  AdminSessionRiskRevokeRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      staleDays: { type: "integer", minimum: 1, maximum: 365 },
      dryRun: { type: "boolean" },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminSessionRiskRevokeItem: {
    type: "object",
    additionalProperties: false,
    required: ["session", "user", "reasons"],
    properties: {
      session: schemaRef("UserSession"),
      user: {
        anyOf: [
          schemaRef("PublicUser"),
          {
            type: "object",
            additionalProperties: true,
            required: ["id", "displayName"],
            properties: {
              id: idSchema,
              displayName: stringSchema,
            },
          },
        ],
      },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
    },
  },
  AdminSessionRiskRevokeResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "generatedAt",
      "staleDays",
      "dryRun",
      "targetSetHash",
      "reasons",
      "matched",
      "revoked",
      "remainingRiskSessionCount",
      "sessions",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      staleDays: { type: "integer", minimum: 1, maximum: 365 },
      dryRun: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
      matched: { type: "integer", minimum: 0 },
      revoked: { type: "integer", minimum: 0 },
      remainingRiskSessionCount: { type: "integer", minimum: 0 },
      sessions: arrayOf(schemaRef("AdminSessionRiskRevokeItem")),
    },
  },
  AdminAuthRuntimeConfig: {
    type: "object",
    additionalProperties: true,
    required: [
      "nodeEnv",
      "legacyUserHeader",
      "authUrls",
      "sessions",
      "oidc",
      "scim",
      "serverAdmins",
      "workerPrincipals",
    ],
    properties: {
      nodeEnv: stringSchema,
      legacyUserHeader: { type: "object", additionalProperties: true },
      authUrls: { type: "object", additionalProperties: true },
      sessions: { type: "object", additionalProperties: true },
      oidc: { type: "object", additionalProperties: true },
      scim: { type: "object", additionalProperties: true },
      serverAdmins: { type: "object", additionalProperties: true },
      workerPrincipals: schemaRef("WorkerPrincipalPosture"),
    },
  },
  AdminAuthOperations: {
    type: "object",
    additionalProperties: true,
    required: [
      "generatedAt",
      "actionRequired",
      "actionReasons",
      "remediationQueue",
      "runtime",
      "users",
      "sessions",
      "passwordResets",
      "emailOutbox",
      "identities",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediationQueue: arrayOf({ type: "object", additionalProperties: true }),
      runtime: schemaRef("AdminAuthRuntimeConfig"),
      legacyUserHeaderUsage: { type: "object", additionalProperties: true },
      loginFailures: { type: "object", additionalProperties: true },
      users: { type: "object", additionalProperties: true },
      sessions: {
        type: "object",
        additionalProperties: true,
        properties: {
          staleDays: { type: "integer", minimum: 1, maximum: 365 },
          totals: { type: "object", additionalProperties: true },
          recentRiskSessions: arrayOf(schemaRef("AdminSessionRiskItem")),
          cleanupOperations: { type: "object", additionalProperties: true },
        },
      },
      passwordResets: { type: "object", additionalProperties: true },
      emailOutbox: { type: "object", additionalProperties: true },
      identities: { type: "object", additionalProperties: true },
    },
  },
  AdminAuthTestConnectionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["provider"],
    properties: {
      provider: { type: "string", enum: ["oidc", "scim"] },
    },
  },
  AdminAuthConnectionTestResult: {
    type: "object",
    additionalProperties: true,
    required: ["provider", "ok", "status", "checks"],
    properties: {
      provider: { type: "string", enum: ["oidc", "scim"] },
      ok: { type: "boolean" },
      status: stringSchema,
      checkedAt: { type: "string", format: "date-time" },
      checks: arrayOf({
        type: "object",
        additionalProperties: true,
        required: ["name", "ok"],
        properties: {
          name: stringSchema,
          ok: { type: "boolean" },
          status: stringSchema,
          message: stringSchema,
        },
      }),
    },
  },
  AdminEmailOutboxRetryAllRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      status: { type: "string", enum: ["pending", "failed", "retryable"] },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
      targetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminEmailOutboxRetryAllMessage: {
    type: "object",
    additionalProperties: false,
    required: ["id", "to", "subject", "before", "after", "provider"],
    properties: {
      id: idSchema,
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
      to: { type: "string", format: "email" },
      subject: stringSchema,
      before: { type: "string", enum: ["pending", "delivered", "failed"] },
      after: { type: "string", enum: ["pending", "delivered", "failed"] },
      provider: { type: "string", enum: ["outbox", "webhook"] },
      error: stringSchema,
    },
  },
  AdminEmailOutboxRetryAllResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "generatedAt",
      "dryRun",
      "deduplicated",
      "targetSetHash",
      "statuses",
      "limit",
      "matched",
      "retried",
      "planned",
      "delivered",
      "failed",
      "skipped",
      "messages",
    ],
    properties: {
      generatedAt: dateTimeSchema,
      dryRun: { type: "boolean" },
      deduplicated: { type: "boolean" },
      batchDeliveryId: { type: "string", minLength: 1, maxLength: 160 },
      targetSetHash: operatorTargetSetHashSchema,
      statuses: arrayOf({ type: "string", enum: ["pending", "failed"] }),
      limit: { type: "integer", minimum: 1 },
      matched: { type: "integer", minimum: 0 },
      retried: { type: "integer", minimum: 0 },
      planned: { type: "integer", minimum: 0 },
      delivered: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      skipped: { type: "integer", minimum: 0 },
      messages: arrayOf(schemaRef("AdminEmailOutboxRetryAllMessage")),
    },
  },
  AdminEmailOutboxRetryRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  AdminAuditLogExport: {
    type: "object",
    additionalProperties: false,
    required: ["exportedAt", "count", "filters", "summary", "auditLogs"],
    properties: {
      exportedAt: { type: "string", format: "date-time" },
      count: { type: "integer", minimum: 0 },
      filters: { type: "object", additionalProperties: true },
      summary: { type: "object", additionalProperties: true },
      auditLogs: arrayOf(schemaRef("AuditLog")),
    },
  },
  AdminJobProgress: {
    type: "object",
    additionalProperties: false,
    properties: {
      current: { type: "number", minimum: 0 },
      total: { type: "number", minimum: 0 },
      percent: { type: "number", minimum: 0, maximum: 100 },
      message: { type: "string", maxLength: 240 },
    },
  },
  AdminJobLogEntry: {
    type: "object",
    additionalProperties: false,
    required: ["at", "level", "message"],
    properties: {
      at: { type: "string", format: "date-time" },
      level: { type: "string", enum: ["info", "warning", "error"] },
      message: stringSchema,
      details: looseObjectSchema,
    },
  },
  AdminJob: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "type",
      "status",
      "payload",
      "attempts",
      "maxAttempts",
      "queuedAt",
      "logs",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      type: {
        type: "string",
        enum: [
          "campaign.export",
          "campaign.import",
          "asset.storage.migrate",
          "asset.storage.cleanup",
          "storage.backup",
          "storage.restoreDrill",
          "ai.memory.extract",
          "ai.session.recap",
          "report.bundle",
        ],
      },
      status: {
        type: "string",
        enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      },
      payload: looseObjectSchema,
      output: looseObjectSchema,
      error: stringSchema,
      progress: schemaRef("AdminJobProgress"),
      attempts: { type: "integer", minimum: 0 },
      maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
      queuedAt: { type: "string", format: "date-time" },
      startedAt: { type: "string", format: "date-time" },
      completedAt: { type: "string", format: "date-time" },
      cancelledAt: { type: "string", format: "date-time" },
      cancelledByUserId: idSchema,
      leasedBy: stringSchema,
      leaseRequestId: { type: "string", minLength: 1, maxLength: 160 },
      leaseRevision: { type: "integer", minimum: 1 },
      leaseExpiresAt: { type: "string", format: "date-time" },
      lastHeartbeatAt: { type: "string", format: "date-time" },
      dispatchStartedAt: { type: "string", format: "date-time" },
      createdByUserId: idSchema,
      updatedByUserId: idSchema,
      logs: arrayOf(schemaRef("AdminJobLogEntry")),
    },
  },
  AdminJobCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["type"],
    allOf: [
      {
        if: {
          required: ["type"],
          properties: { type: { const: "campaign.import" } },
        },
        then: {
          required: ["payload"],
          properties: { payload: schemaRef("AdminCampaignImportJobPayload") },
        },
      },
    ],
    properties: {
      type: {
        type: "string",
        enum: [
          "campaign.export",
          "campaign.import",
          "asset.storage.migrate",
          "asset.storage.cleanup",
          "storage.backup",
          "storage.restoreDrill",
          "ai.memory.extract",
          "ai.session.recap",
          "report.bundle",
        ],
      },
      payload: looseObjectSchema,
      maxAttempts: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  AdminCampaignImportJobPayload: {
    type: "object",
    additionalProperties: false,
    required: ["archive", "expectedUpdatedAt"],
    properties: {
      archive: looseObjectSchema,
      mode: { type: "string", enum: ["upsert", "reject_conflicts"] },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  AdminJobLeaseRequest: {
    type: "object",
    additionalProperties: false,
    required: ["leaseRequestId"],
    properties: {
      leaseRequestId: { type: "string", minLength: 1, maxLength: 160 },
      workerId: { type: "string", maxLength: 120 },
      leaseSeconds: { type: "integer", minimum: 1, maximum: 3600 },
      types: arrayOf({
        type: "string",
        enum: [
          "campaign.export",
          "campaign.import",
          "asset.storage.migrate",
          "asset.storage.cleanup",
          "storage.backup",
          "storage.restoreDrill",
          "ai.memory.extract",
          "ai.session.recap",
          "report.bundle",
        ],
      }),
    },
  },
  AdminJobPatchRequest: {
    type: "object",
    additionalProperties: false,
    anyOf: [{ required: ["expectedUpdatedAt"] }, { required: ["leaseRevision"] }],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      leaseRevision: { type: "integer", minimum: 1 },
      status: {
        type: "string",
        enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      },
      progress: schemaRef("AdminJobProgress"),
      output: looseObjectSchema,
      error: stringSchema,
      log: {
        type: "object",
        additionalProperties: false,
        required: ["level", "message"],
        properties: {
          level: { type: "string", enum: ["info", "warning", "error"] },
          message: stringSchema,
          details: looseObjectSchema,
        },
      },
    },
  },
  AdminJobHeartbeatRequest: {
    type: "object",
    additionalProperties: false,
    anyOf: [{ required: ["expectedUpdatedAt"] }, { required: ["leaseRevision"] }],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      leaseRevision: { type: "integer", minimum: 1 },
      workerId: { type: "string", maxLength: 120 },
      leaseSeconds: { type: "integer", minimum: 1, maximum: 3600 },
      progress: schemaRef("AdminJobProgress"),
      log: {
        type: "object",
        additionalProperties: false,
        required: ["level", "message"],
        properties: {
          level: { type: "string", enum: ["info", "warning", "error"] },
          message: stringSchema,
          details: looseObjectSchema,
        },
      },
    },
  },
  AdminJobCancelRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      reason: { type: "string", maxLength: 240 },
    },
  },
  AdminJobRetryRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  AdminJobOperationSample: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "type",
      "status",
      "attempts",
      "maxAttempts",
      "queuedAt",
      "updatedAt",
    ],
    properties: {
      id: idSchema,
      type: {
        type: "string",
        enum: [
          "campaign.export",
          "campaign.import",
          "asset.storage.migrate",
          "asset.storage.cleanup",
          "storage.backup",
          "storage.restoreDrill",
          "ai.memory.extract",
          "ai.session.recap",
          "report.bundle",
        ],
      },
      status: {
        type: "string",
        enum: ["queued", "running", "succeeded", "failed", "cancelled"],
      },
      attempts: { type: "integer", minimum: 0 },
      maxAttempts: { type: "integer", minimum: 1 },
      queuedAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      leasedBy: stringSchema,
      leaseRequestId: { type: "string", minLength: 1, maxLength: 160 },
      leaseRevision: { type: "integer", minimum: 1 },
      leaseExpiresAt: { type: "string", format: "date-time" },
      lastHeartbeatAt: { type: "string", format: "date-time" },
      error: stringSchema,
    },
  },
  AdminJobOperations: {
    type: "object",
    additionalProperties: false,
    required: [
      "generatedAt",
      "actionRequired",
      "actionReasons",
      "thresholds",
      "totals",
      "queue",
      "leases",
      "failures",
      "throughput",
      "remediationQueue",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      thresholds: {
        type: "object",
        additionalProperties: false,
        required: ["staleHeartbeatSeconds", "staleQueuedSeconds"],
        properties: {
          staleHeartbeatSeconds: { type: "integer", minimum: 1 },
          staleQueuedSeconds: { type: "integer", minimum: 1 },
        },
      },
      totals: {
        type: "object",
        additionalProperties: false,
        required: [
          "totalCount",
          "byStatus",
          "byType",
          "retryableCount",
          "exhaustedCount",
        ],
        properties: {
          totalCount: { type: "integer", minimum: 0 },
          byStatus: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 0 },
          },
          byType: {
            type: "object",
            additionalProperties: { type: "integer", minimum: 0 },
          },
          retryableCount: { type: "integer", minimum: 0 },
          exhaustedCount: { type: "integer", minimum: 0 },
        },
      },
      queue: {
        type: "object",
        additionalProperties: false,
        required: ["maxQueueAgeSeconds", "staleQueuedCount", "recentQueued"],
        properties: {
          oldestQueuedAt: { type: "string", format: "date-time" },
          maxQueueAgeSeconds: { type: "integer", minimum: 0 },
          staleQueuedCount: { type: "integer", minimum: 0 },
          recentQueued: arrayOf(schemaRef("AdminJobOperationSample")),
        },
      },
      leases: {
        type: "object",
        additionalProperties: false,
        required: [
          "runningCount",
          "leasedWorkerCount",
          "expiredCount",
          "staleHeartbeatCount",
          "workers",
          "expired",
          "staleHeartbeats",
        ],
        properties: {
          runningCount: { type: "integer", minimum: 0 },
          leasedWorkerCount: { type: "integer", minimum: 0 },
          expiredCount: { type: "integer", minimum: 0 },
          staleHeartbeatCount: { type: "integer", minimum: 0 },
          workers: arrayOf({
            type: "object",
            additionalProperties: false,
            required: [
              "workerId",
              "runningCount",
              "expiredLeaseCount",
              "staleHeartbeatCount",
            ],
            properties: {
              workerId: stringSchema,
              runningCount: { type: "integer", minimum: 0 },
              lastHeartbeatAt: { type: "string", format: "date-time" },
              expiredLeaseCount: { type: "integer", minimum: 0 },
              staleHeartbeatCount: { type: "integer", minimum: 0 },
            },
          }),
          expired: arrayOf(schemaRef("AdminJobOperationSample")),
          staleHeartbeats: arrayOf(schemaRef("AdminJobOperationSample")),
        },
      },
      failures: {
        type: "object",
        additionalProperties: false,
        required: [
          "failedCount",
          "retryableCount",
          "exhaustedCount",
          "recentFailed",
        ],
        properties: {
          failedCount: { type: "integer", minimum: 0 },
          retryableCount: { type: "integer", minimum: 0 },
          exhaustedCount: { type: "integer", minimum: 0 },
          recentFailed: arrayOf(schemaRef("AdminJobOperationSample")),
        },
      },
      throughput: {
        type: "object",
        additionalProperties: false,
        required: ["succeededCount", "cancelledCount"],
        properties: {
          succeededCount: { type: "integer", minimum: 0 },
          cancelledCount: { type: "integer", minimum: 0 },
          newestCompletedAt: { type: "string", format: "date-time" },
        },
      },
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
    },
  },
  AdminJobAlertRequest: {
    type: "object",
    additionalProperties: false,
    required: ["deliveryId"],
    properties: {
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
      dryRun: { type: "boolean" },
      force: { type: "boolean" },
      reason: { type: "string", maxLength: 240 },
    },
  },
  AdminJobAlertResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "deliveryId",
      "configured",
      "actionRequired",
      "actionReasons",
      "remediationCount",
      "generatedAt",
    ],
    properties: {
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
      status: {
        type: "string",
        enum: ["dry_run", "delivered", "skipped", "failed"],
      },
      configured: { type: "boolean" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediationCount: { type: "integer", minimum: 0 },
      generatedAt: { type: "string", format: "date-time" },
      deliveredAt: { type: "string", format: "date-time" },
      webhookStatus: { type: "integer", minimum: 100, maximum: 599 },
      reason: stringSchema,
      error: stringSchema,
    },
  },
  OpenApiDocument: {
    type: "object",
    additionalProperties: true,
    required: ["openapi", "info", "paths", "components"],
    properties: {
      openapi: stringSchema,
      info: looseObjectSchema,
      paths: looseObjectSchema,
      components: looseObjectSchema,
    },
  },
  AdminOperationRemediation: {
    type: "object",
    additionalProperties: true,
    required: ["code", "severity", "action"],
    properties: {
      code: stringSchema,
      severity: { type: "string", enum: ["warning", "error", "critical"] },
      action: stringSchema,
      affectedCount: { type: "integer", minimum: 0 },
      samples: arrayOf(looseObjectSchema),
    },
  },
  AdminAiOperations: {
    type: "object",
    additionalProperties: true,
    required: [
      "provider",
      "actionRequired",
      "actionReasons",
      "runtime",
      "totals",
      "risk",
      "campaigns",
    ],
    properties: {
      provider: looseObjectSchema,
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      runtime: looseObjectSchema,
      runtimePosture: looseObjectSchema,
      totals: looseObjectSchema,
      evaluations: looseObjectSchema,
      evaluationCoverage: looseObjectSchema,
      serviceLevels: looseObjectSchema,
      providerHealth: arrayOf(looseObjectSchema),
      toolCatalog: looseObjectSchema,
      replayOperations: looseObjectSchema,
      proposalReview: looseObjectSchema,
      safetyPosture: looseObjectSchema,
      risk: looseObjectSchema,
      campaigns: arrayOf(looseObjectSchema),
      recentEvaluations: arrayOf(schemaRef("AiEvaluationRun")),
      recentThreads: arrayOf(schemaRef("AiThread")),
      recentToolCalls: arrayOf(looseObjectSchema),
    },
  },
  AdminAiStaleProposalRejectRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 },
      includeApproved: { type: "boolean" },
    },
  },
  AdminAiStaleProposalRejectResult: {
    type: "object",
    additionalProperties: true,
    required: [
      "dryRun",
      "includeApproved",
      "limit",
      "reason",
      "staleReviewThresholdMs",
      "matched",
      "updated",
      "proposals",
    ],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      includeApproved: { type: "boolean" },
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleReviewThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      proposals: arrayOf(looseObjectSchema),
    },
  },
  AdminAiStaleThreadFailRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 },
    },
  },
  AdminAiStaleThreadFailResult: {
    type: "object",
    additionalProperties: true,
    required: [
      "dryRun",
      "limit",
      "reason",
      "staleRunningThresholdMs",
      "matched",
      "updated",
      "threads",
    ],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleRunningThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      threads: arrayOf(looseObjectSchema),
    },
  },
  AdminAiStaleToolCallFailRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 },
    },
  },
  AdminAiStaleToolCallFailResult: {
    type: "object",
    additionalProperties: true,
    required: [
      "dryRun",
      "limit",
      "reason",
      "staleStartedToolCallThresholdMs",
      "matched",
      "updated",
      "toolCalls",
    ],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleStartedToolCallThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      toolCalls: arrayOf(looseObjectSchema),
    },
  },
  AdminAiToolCallRetryRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      toolCallId: idSchema,
      limit: positiveLimitSchema,
    },
  },
  AdminAiToolCallRetryResult: {
    type: "object",
    additionalProperties: true,
    required: [
      "dryRun",
      "limit",
      "matched",
      "retried",
      "skipped",
      "completed",
      "failed",
      "toolCalls",
    ],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      toolCallId: idSchema,
      limit: { type: "integer", minimum: 1 },
      matched: { type: "integer", minimum: 0 },
      retried: { type: "integer", minimum: 0 },
      skipped: { type: "integer", minimum: 0 },
      completed: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      toolCalls: arrayOf(looseObjectSchema),
    },
  },
  AdminAiEvaluationExport: {
    type: "object",
    additionalProperties: true,
    required: ["exportedAt", "format", "filters", "evaluations"],
    properties: {
      exportedAt: { type: "string", format: "date-time" },
      format: { type: "string", enum: ["json", "ndjson"] },
      filters: looseObjectSchema,
      evaluations: arrayOf(looseObjectSchema),
    },
  },
  AdminPluginReviewInfo: {
    type: "object",
    additionalProperties: true,
    required: [
      "review",
      "plugin",
      "source",
      "distribution",
      "trust",
      "installable",
    ],
    properties: {
      review: {
        type: "object",
        additionalProperties: true,
        required: [
          "id",
          "reviewKey",
          "pluginId",
          "packageId",
          "version",
          "checksum",
          "sourceType",
          "status",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          ...idTimestampProperties,
          reviewKey: stringSchema,
          pluginId: idSchema,
          packageId: idSchema,
          version: stringSchema,
          checksum: stringSchema,
          sourceType: { type: "string", enum: ["local", "registry"] },
          registryUrl: stringSchema,
          packageUrl: stringSchema,
          status: { type: "string", enum: ["pending", "approved", "rejected"] },
          notes: stringSchema,
          reviewedByUserId: idSchema,
          reviewedAt: { type: "string", format: "date-time" },
        },
      },
      plugin: looseObjectSchema,
      source: looseObjectSchema,
      distribution: looseObjectSchema,
      trust: looseObjectSchema,
      installable: { type: "boolean" },
      installBlock: stringSchema,
    },
  },
  AdminPluginReviewSnapshot: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "registryRevision", "policy", "totals", "plugins"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      registryRevision: operatorTargetSetHashSchema,
      policy: looseObjectSchema,
      totals: looseObjectSchema,
      plugins: arrayOf(schemaRef("AdminPluginReviewInfo")),
    },
  },
  AdminPluginReviewPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["status", "expectedUpdatedAt"],
    properties: {
      status: { type: "string", enum: ["pending", "approved", "rejected"] },
      notes: { type: "string", maxLength: 500 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  AdminPluginRegistrySyncRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedRegistryRevision"],
    properties: {
      registryUrl: stringSchema,
      expectedRegistryRevision: operatorTargetSetHashSchema,
    },
  },
  AdminPluginRegistrySyncPlugin: {
    type: "object",
    additionalProperties: true,
    required: ["id", "name", "version", "compatibleCore", "source"],
    properties: {
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      compatibleCore: stringSchema,
      source: {
        type: "object",
        additionalProperties: false,
        required: ["type", "packageId", "manifestPath", "manifestChecksum", "sandbox"],
        properties: {
          type: { type: "string", enum: ["local", "registry"] },
          packageId: stringSchema,
          manifestPath: stringSchema,
          manifestChecksum: stringSchema,
          clientEntrypoint: stringSchema,
          serverEntrypoint: stringSchema,
          sandbox: { type: "string", enum: ["vm", "manifest-only"] },
          checksum: stringSchema,
          registryUrl: stringSchema,
          packageUrl: stringSchema,
          packageChecksum: stringSchema,
          syncedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  AdminPluginRegistrySyncResponse: {
    type: "object",
    additionalProperties: false,
    required: ["syncedAt", "previousRegistryRevision", "registryRevision", "registries", "plugins"],
    properties: {
      syncedAt: { type: "string", format: "date-time" },
      previousRegistryRevision: operatorTargetSetHashSchema,
      registryRevision: operatorTargetSetHashSchema,
      registries: arrayOf(looseObjectSchema),
      plugins: arrayOf(schemaRef("AdminPluginRegistrySyncPlugin")),
    },
  },
  AdminPluginOperations: {
    type: "object",
    additionalProperties: true,
    required: [
      "generatedAt",
      "registryRevision",
      "actionRequired",
      "actionReasons",
      "policy",
      "totals",
      "reviews",
      "remediationQueue",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      registryRevision: operatorTargetSetHashSchema,
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      policy: looseObjectSchema,
      totals: looseObjectSchema,
      reviews: looseObjectSchema,
      reviewOperations: looseObjectSchema,
      securityPosture: looseObjectSchema,
      registryOperations: looseObjectSchema,
      compatibilityOperations: looseObjectSchema,
      installOperations: looseObjectSchema,
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      permissionDrift: arrayOf(looseObjectSchema),
      loadErrors: arrayOf(looseObjectSchema),
      installed: arrayOf(looseObjectSchema),
      storage: looseObjectSchema,
      storageOperations: looseObjectSchema,
      commandOperations: looseObjectSchema,
      inventoryOperations: looseObjectSchema,
      recentCommands: arrayOf(looseObjectSchema),
    },
  },
  AdminSystemOperations: {
    type: "object",
    additionalProperties: true,
    required: [
      "generatedAt",
      "actionRequired",
      "actionReasons",
      "totals",
      "systems",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      totals: looseObjectSchema,
      productionReadiness: looseObjectSchema,
      activeSystemCounts: looseObjectSchema,
      actorSystemCounts: looseObjectSchema,
      itemSystemCounts: looseObjectSchema,
      activityOperations: looseObjectSchema,
      productionGapCounts: arrayOf(schemaRef("AdminSystemProductionGap")),
      promotionBlockers: arrayOf(looseObjectSchema),
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      systems: arrayOf(looseObjectSchema),
    },
  },
  AdminSystemProductionGapSystem: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "activeCampaignCount", "actorCount", "itemCount"],
    properties: {
      id: idSchema,
      name: stringSchema,
      activeCampaignCount: { type: "integer", minimum: 0 },
      actorCount: { type: "integer", minimum: 0 },
      itemCount: { type: "integer", minimum: 0 },
    },
  },
  AdminSystemProductionGap: {
    type: "object",
    additionalProperties: false,
    required: ["code", "count", "systems", "severity", "message", "remediation"],
    properties: {
      code: stringSchema,
      count: { type: "integer", minimum: 1 },
      systems: arrayOf(schemaRef("AdminSystemProductionGapSystem")),
      severity: { type: "string", enum: ["warning", "critical"] },
      message: stringSchema,
      remediation: stringSchema,
    },
  },
  AdminRenderingOperations: {
    type: "object",
    additionalProperties: true,
    required: [
      "generatedAt",
      "budget",
      "featureCoverage",
      "authoringOperations",
      "totals",
      "actionRequired",
      "actionReasons",
      "scenes",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      budget: looseObjectSchema,
      featureCoverage: looseObjectSchema,
      authoringOperations: looseObjectSchema,
      failedAuthoringOperations: looseObjectSchema,
      staleIssueOperations: looseObjectSchema,
      totals: looseObjectSchema,
      issueSeverityCounts: looseObjectSchema,
      issueCodeCounts: looseObjectSchema,
      topIssues: arrayOf(looseObjectSchema),
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      scenesRequiringAction: arrayOf(looseObjectSchema),
      scenes: arrayOf(looseObjectSchema),
    },
  },
  AdminAssetStorageInfo: {
    type: "object",
    additionalProperties: true,
    required: [
      "assetCount",
      "activeAssetCount",
      "usedBytes",
      "allBytes",
      "runtime",
      "operations",
      "campaigns",
    ],
    properties: {
      assetCount: { type: "integer", minimum: 0 },
      activeAssetCount: { type: "integer", minimum: 0 },
      usedBytes: { type: "integer", minimum: 0 },
      allBytes: { type: "integer", minimum: 0 },
      providerCounts: looseObjectSchema,
      lifecycleCounts: looseObjectSchema,
      runtime: looseObjectSchema,
      operations: looseObjectSchema,
      cleanupScheduler: looseObjectSchema,
      campaigns: arrayOf(looseObjectSchema),
    },
  },
  AdminAssetOperationRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      assetIds: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        uniqueItems: true,
        items: { ...idSchema, maxLength: 160 },
      },
      expectedTargetSetHash: operatorTargetSetHashSchema,
      includeDeleted: { type: "boolean" },
      includeExpired: { type: "boolean" },
      overwrite: { type: "boolean" },
      graceDays: { type: "integer", minimum: 0, maximum: 3650 },
      reason: { type: "string", maxLength: 160 },
    },
  },
  AdminAssetOperationItem: {
    type: "object",
    additionalProperties: false,
    required: [
      "operationId",
      "assetId",
      "campaignId",
      "name",
      "fromProvider",
      "toProvider",
      "status",
    ],
    properties: {
      operationId: {
        type: "string",
        pattern: "^assetop_[a-f0-9]{32}$",
      },
      assetId: idSchema,
      campaignId: idSchema,
      name: stringSchema,
      fromProvider: stringSchema,
      toProvider: stringSchema,
      status: {
        type: "string",
        enum: [
          "migrated",
          "deleted",
          "planned",
          "skipped",
          "failed",
          "missing_marked",
          "archived",
        ],
      },
      reason: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      storage: looseObjectSchema,
    },
  },
  AdminAssetOperationResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "dryRun",
      "targetSetHash",
      "assetCount",
      "planned",
      "skipped",
      "failed",
      "changed",
      "results",
    ],
    properties: {
      dryRun: { type: "boolean" },
      targetSetHash: operatorTargetSetHashSchema,
      targetProvider: stringSchema,
      graceDays: { type: "integer", minimum: 0 },
      assetCount: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      migrated: { type: "integer", minimum: 0 },
      archived: { type: "integer", minimum: 0 },
      deleted: { type: "integer", minimum: 0 },
      missingMarked: { type: "integer", minimum: 0 },
      planned: { type: "integer", minimum: 0 },
      skipped: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      changed: { type: "boolean" },
      reason: stringSchema,
      results: arrayOf(schemaRef("AdminAssetOperationItem")),
    },
  },
  AdminAssetTargetSetConflictResponse: {
    type: "object",
    additionalProperties: false,
    required: ["error", "message", "currentTargetSetHash"],
    properties: {
      error: { type: "string", enum: ["stale_target_set"] },
      message: stringSchema,
      currentTargetSetHash: operatorTargetSetHashSchema,
    },
  },
  AdminAssetIntegrityReport: {
    type: "object",
    additionalProperties: true,
    required: [
      "provider",
      "assetCount",
      "verified",
      "missing",
      "mismatched",
      "cleanupEligible",
      "skipped",
      "failed",
      "actionRequired",
      "actionReasons",
      "remediationQueue",
      "healthy",
      "results",
    ],
    properties: {
      provider: stringSchema,
      assetCount: { type: "integer", minimum: 0 },
      verified: { type: "integer", minimum: 0 },
      missing: { type: "integer", minimum: 0 },
      mismatched: { type: "integer", minimum: 0 },
      cleanupEligible: { type: "integer", minimum: 0 },
      skipped: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      actionRequired: { type: "integer", minimum: 0 },
      actionReasons: arrayOf(stringSchema),
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      healthy: { type: "boolean" },
      results: arrayOf(looseObjectSchema),
    },
  },
  AdminAssetCdnPurgeRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "deliveryId"],
    properties: {
      reason: { type: "string", maxLength: 160 },
      expectedUpdatedAt: dateTimeSchema,
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
    },
  },
  AdminAssetCdnPurgeResult: {
    type: "object",
    additionalProperties: false,
    required: [
      "assetId",
      "campaignId",
      "name",
      "deliveryId",
      "status",
    ],
    properties: {
      assetId: idSchema,
      campaignId: idSchema,
      name: stringSchema,
      cdnUrl: stringSchema,
      reason: stringSchema,
      deliveryId: { type: "string", minLength: 1, maxLength: 160 },
      status: { type: "string", enum: ["purged", "failed", "not_configured"] },
      purgedAt: { type: "string", format: "date-time" },
      error: stringSchema,
    },
  },
  StorageRecordCollectionCount: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "count"],
    properties: {
      collection: stringSchema,
      count: { type: "integer", minimum: 0 },
    },
  },
  StorageAssetSnapshotIdentity: {
    type: "object",
    additionalProperties: false,
    required: ["provider", "snapshotId", "createdAt"],
    properties: {
      provider: { type: "string", enum: ["local", "s3"] },
      snapshotId: { type: "string", minLength: 1, maxLength: 200 },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  StorageAssetMetadataInventory: {
    type: "object",
    additionalProperties: false,
    required: ["provider", "assetCount", "objectCount", "sizeBytes", "digestAlgorithm", "digest"],
    properties: {
      provider: { type: "string", enum: ["local", "s3", "unknown"] },
      assetCount: { type: "integer", minimum: 0 },
      objectCount: { type: "integer", minimum: 0 },
      sizeBytes: { type: "integer", minimum: 0 },
      digestAlgorithm: { type: "string", enum: ["sha256"] },
      digest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    },
  },
  StorageRecoveryPointManifest: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "version", "createdAt", "database", "assetInventory"],
    properties: {
      kind: { type: "string", enum: ["open-tabletop-recovery-point"] },
      version: { type: "integer", enum: [1] },
      createdAt: { type: "string", format: "date-time" },
      database: {
        type: "object",
        additionalProperties: false,
        required: ["fileName", "sizeBytes", "checksumAlgorithm", "checksum"],
        properties: {
          fileName: { type: "string", maxLength: 255 },
          sizeBytes: { type: "integer", minimum: 0 },
          checksumAlgorithm: { type: "string", enum: ["sha256"] },
          checksum: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
      assetInventory: schemaRef("StorageAssetMetadataInventory"),
      assetSnapshot: schemaRef("StorageAssetSnapshotIdentity"),
    },
  },
  StorageRecoveryPointSummary: {
    type: "object",
    additionalProperties: false,
    required: ["manifestFileName", "manifestStatus", "paired", "actionRequired", "actionReasons"],
    properties: {
      manifestFileName: { type: "string", maxLength: 280 },
      manifestStatus: { type: "string", enum: ["present", "missing", "invalid"] },
      paired: { type: "boolean" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      manifest: schemaRef("StorageRecoveryPointManifest"),
    },
  },
  StorageBackupSummary: {
    type: "object",
    additionalProperties: false,
    required: ["fileName", "sizeBytes", "createdAt", "recoveryPoint"],
    properties: {
      fileName: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      createdAt: { type: "string", format: "date-time" },
      recoveryPoint: schemaRef("StorageRecoveryPointSummary"),
    },
  },
  StorageBackupRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 160 },
      requireAssetSnapshot: { type: "boolean" },
      assetSnapshot: schemaRef("StorageAssetSnapshotIdentity"),
    },
  },
  StorageBackupResult: {
    type: "object",
    additionalProperties: false,
    required: ["status", "fileName", "sizeBytes", "createdAt", "recoveryPoint"],
    properties: {
      status: { type: "string", enum: ["created"] },
      fileName: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      createdAt: { type: "string", format: "date-time" },
      recoveryPoint: schemaRef("StorageRecoveryPointSummary"),
      reason: { type: "string", maxLength: 160 },
      prunedFileNames: arrayOf(stringSchema),
    },
  },
  StorageIntegrityCheck: {
    type: "object",
    additionalProperties: false,
    required: ["checkedAt", "ok", "result"],
    properties: {
      checkedAt: { type: "string", format: "date-time" },
      ok: { type: "boolean" },
      result: stringSchema,
    },
  },
  StorageScheduledBackupStatus: {
    type: "object",
    additionalProperties: true,
    required: ["enabled", "runOnStart", "running"],
    properties: {
      enabled: { type: "boolean" },
      runOnStart: { type: "boolean" },
      running: { type: "boolean" },
      intervalSeconds: { type: "integer", minimum: 1 },
      reason: stringSchema,
      lastRun: {
        type: "object",
        additionalProperties: true,
        properties: {
          trigger: { type: "string", enum: ["startup", "interval", "manual"] },
          status: { type: "string", enum: ["succeeded", "failed"] },
          reason: stringSchema,
          fileName: stringSchema,
          sizeBytes: { type: "integer", minimum: 0 },
          startedAt: { type: "string", format: "date-time" },
          finishedAt: { type: "string", format: "date-time" },
          error: stringSchema,
        },
      },
    },
  },
  OperationsLatencyMetrics: {
    type: "object",
    additionalProperties: false,
    required: ["count", "totalMs", "maxMs", "buckets"],
    properties: {
      count: { type: "integer", minimum: 0 },
      totalMs: { type: "number", minimum: 0 },
      maxMs: { type: "number", minimum: 0 },
      buckets: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["le", "count"],
          properties: { le: { oneOf: [{ type: "number" }, { type: "string", enum: ["infinity"] }] }, count: { type: "integer", minimum: 0 } },
        },
      },
    },
  },
  OperationsOutcomeMetrics: {
    type: "object",
    additionalProperties: false,
    required: ["attempts", "succeeded", "failed", "latencyMs"],
    properties: {
      attempts: { type: "integer", minimum: 0 },
      succeeded: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      latencyMs: schemaRef("OperationsLatencyMetrics"),
    },
  },
  AdminOperationsMetrics: {
    type: "object",
    additionalProperties: false,
    required: ["version", "enabled", "startedAt", "generatedAt", "privacy", "http", "realtime", "persistence", "recovery"],
    properties: {
      version: { type: "integer", enum: [1] },
      enabled: { type: "boolean" },
      startedAt: dateTimeSchema,
      generatedAt: dateTimeSchema,
      privacy: {
        type: "object",
        additionalProperties: false,
        required: ["boundedDimensions", "containsCampaignIds", "containsUserIds", "containsCredentials", "containsPrivateContent"],
        properties: {
          boundedDimensions: { type: "boolean", enum: [true] },
          containsCampaignIds: { type: "boolean", enum: [false] },
          containsUserIds: { type: "boolean", enum: [false] },
          containsCredentials: { type: "boolean", enum: [false] },
          containsPrivateContent: { type: "boolean", enum: [false] },
        },
      },
      http: {
        type: "object",
        additionalProperties: false,
        required: ["requests", "errorResponses", "staleWriteConflicts", "methods", "statusClasses", "latencyMs"],
        properties: {
          requests: { type: "integer", minimum: 0 },
          errorResponses: { type: "integer", minimum: 0 },
          staleWriteConflicts: { type: "integer", minimum: 0 },
          methods: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          statusClasses: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          latencyMs: schemaRef("OperationsLatencyMetrics"),
        },
      },
      realtime: {
        type: "object",
        additionalProperties: false,
        required: ["connectionsOpened", "disconnections", "revokedConnections", "sendFailures", "activeConnections", "heartbeatGapMs"],
        properties: {
          connectionsOpened: { type: "integer", minimum: 0 },
          disconnections: { type: "integer", minimum: 0 },
          revokedConnections: { type: "integer", minimum: 0 },
          sendFailures: { type: "integer", minimum: 0 },
          activeConnections: { type: "integer", minimum: 0 },
          heartbeatGapMs: schemaRef("OperationsLatencyMetrics"),
        },
      },
      persistence: schemaRef("OperationsOutcomeMetrics"),
      recovery: {
        type: "object",
        additionalProperties: false,
        required: ["backup", "restore_drill", "restore"],
        properties: { backup: schemaRef("OperationsOutcomeMetrics"), restore_drill: schemaRef("OperationsOutcomeMetrics"), restore: schemaRef("OperationsOutcomeMetrics") },
      },
    },
  },
  OperationalRetentionCandidate: {
    type: "object",
    additionalProperties: false,
    required: ["recordClass", "id", "completedAt"],
    properties: {
      recordClass: { type: "string", enum: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] },
      id: stringSchema,
      completedAt: dateTimeSchema,
    },
  },
  OperationalRetentionDiagnostics: {
    type: "object",
    additionalProperties: false,
    required: ["policyVersion", "generatedAt", "preservationDefault", "supportedRecordClasses", "counts", "totalEligibleTerminalRecords", "exemptions"],
    properties: {
      policyVersion: { type: "integer", enum: [1] },
      generatedAt: dateTimeSchema,
      preservationDefault: { type: "boolean", enum: [true] },
      supportedRecordClasses: arrayOf({ type: "string", enum: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] }),
      counts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      totalEligibleTerminalRecords: { type: "integer", minimum: 0 },
      exemptions: arrayOf({ type: "string", enum: ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"] }),
    },
  },
  OperationalRetentionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["recordClasses", "olderThanDays"],
    properties: {
      recordClasses: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] } },
      olderThanDays: { type: "integer", minimum: 1, maximum: 3650 },
      batchSize: { type: "integer", minimum: 1, maximum: 1000 },
      dryRun: { type: "boolean" },
      targetSetHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      reason: { type: "string", minLength: 10, maxLength: 500 },
    },
  },
  OperationalRetentionPlan: {
    type: "object",
    additionalProperties: false,
    required: ["policyVersion", "preservationDefault", "dryRun", "cutoffAt", "olderThanDays", "recordClasses", "batchSize", "eligibleCount", "selectedCount", "remainingCount", "targetSetHash", "selected", "counts", "exemptions"],
    properties: {
      policyVersion: { type: "integer", enum: [1] },
      preservationDefault: { type: "boolean", enum: [true] },
      dryRun: { type: "boolean" },
      cutoffAt: dateTimeSchema,
      olderThanDays: { type: "integer", minimum: 1, maximum: 3650 },
      recordClasses: arrayOf({ type: "string", enum: ["delivered_emails", "delivered_webhooks", "maintenance_jobs"] }),
      batchSize: { type: "integer", minimum: 1, maximum: 1000 },
      eligibleCount: { type: "integer", minimum: 0 },
      selectedCount: { type: "integer", minimum: 0 },
      remainingCount: { type: "integer", minimum: 0 },
      targetSetHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      selected: arrayOf(schemaRef("OperationalRetentionCandidate")),
      counts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      exemptions: arrayOf({ type: "string", enum: ["canonical_campaign_state", "audit_logs", "active_idempotency", "failed_or_retryable_operations", "archive_import_recovery"] }),
      deletedCount: { type: "integer", minimum: 0 },
      reason: { type: "string", minLength: 10, maxLength: 500 },
    },
  },
  AdminStorageOperations: {
    type: "object",
    additionalProperties: true,
    required: ["provider", "supported", "actionRequired", "actionReasons"],
    properties: {
      provider: stringSchema,
      supported: { type: "boolean" },
      database: {
        type: "object",
        additionalProperties: false,
        required: ["fileName", "sizeBytes", "jsonRecordModel"],
        properties: {
          fileName: stringSchema,
          sizeBytes: { type: "integer", minimum: 0 },
          jsonRecordModel: { type: "boolean" },
        },
      },
      migrations: {
        type: "object",
        additionalProperties: false,
        required: [
          "expectedVersions",
          "applied",
          "latestAppliedVersion",
          "missingVersions",
        ],
        properties: {
          expectedVersions: arrayOf({ type: "integer", minimum: 0 }),
          applied: arrayOf({
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "appliedAt"],
            properties: {
              version: { type: "integer", minimum: 0 },
              name: stringSchema,
              appliedAt: { type: "string", format: "date-time" },
            },
          }),
          latestAppliedVersion: { type: "integer", minimum: 0 },
          missingVersions: arrayOf({ type: "integer", minimum: 0 }),
        },
      },
      integrity: schemaRef("StorageIntegrityCheck"),
      records: {
        type: "object",
        additionalProperties: false,
        required: ["total", "collections"],
        properties: {
          total: { type: "integer", minimum: 0 },
          collections: arrayOf(schemaRef("StorageRecordCollectionCount")),
        },
      },
      indexes: {
        type: "object",
        additionalProperties: false,
        required: ["required", "present", "missing"],
        properties: {
          required: arrayOf(stringSchema),
          present: arrayOf(stringSchema),
          missing: arrayOf(stringSchema),
        },
      },
      backups: {
        type: "object",
        additionalProperties: false,
        required: ["directoryName", "count", "retentionCount"],
        properties: {
          directoryName: stringSchema,
          count: { type: "integer", minimum: 0 },
          retentionCount: { type: "integer", minimum: 0 },
          latest: schemaRef("StorageBackupSummary"),
        },
      },
      scheduledBackups: schemaRef("StorageScheduledBackupStatus"),
      restoreStateRevision: {
        type: "string",
        pattern: "^sha256:[a-f0-9]{64}$",
      },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediation: stringSchema,
    },
  },
  StorageRestoreDrillRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      backupFileName: stringSchema,
      requireAssetSnapshot: { type: "boolean" },
      expectedAssetSnapshot: schemaRef("StorageAssetSnapshotIdentity"),
    },
  },
  StorageRestoreDrillResult: {
    type: "object",
    additionalProperties: false,
    required: ["status", "checkedAt", "actionRequired", "actionReasons"],
    properties: {
      status: { type: "string", enum: ["passed", "failed"] },
      backup: schemaRef("StorageBackupSummary"),
      checkedAt: { type: "string", format: "date-time" },
      recoveryPoint: schemaRef("StorageRecoveryPointSummary"),
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      integrity: schemaRef("StorageIntegrityCheck"),
      campaignCount: { type: "integer", minimum: 0 },
      recordCount: { type: "integer", minimum: 0 },
      collections: arrayOf(schemaRef("StorageRecordCollectionCount")),
      error: stringSchema,
    },
  },
  StorageRestoreRequest: {
    type: "object",
    additionalProperties: false,
    required: ["backupFileName", "confirmFileName", "expectedStateRevision"],
    properties: {
      backupFileName: stringSchema,
      confirmFileName: stringSchema,
      expectedStateRevision: {
        type: "string",
        pattern: "^sha256:[a-f0-9]{64}$",
      },
      reason: { type: "string", maxLength: 160 },
      requireAssetSnapshot: { type: "boolean" },
      expectedAssetSnapshot: schemaRef("StorageAssetSnapshotIdentity"),
    },
  },
  StorageRestoreResult: {
    type: "object",
    additionalProperties: false,
    required: ["status", "checkedAt", "actionRequired", "actionReasons"],
    properties: {
      status: { type: "string", enum: ["passed", "failed"] },
      backup: schemaRef("StorageBackupSummary"),
      checkedAt: { type: "string", format: "date-time" },
      recoveryPoint: schemaRef("StorageRecoveryPointSummary"),
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      integrity: schemaRef("StorageIntegrityCheck"),
      campaignCount: { type: "integer", minimum: 0 },
      recordCount: { type: "integer", minimum: 0 },
      collections: arrayOf(schemaRef("StorageRecordCollectionCount")),
      reconciliation: schemaRef("StorageRestoreReconciliation"),
      error: stringSchema,
      restoredAt: { type: "string", format: "date-time" },
      reason: { type: "string", maxLength: 160 },
    },
  },
  StorageRestoreReconciliation: {
    type: "object",
    additionalProperties: false,
    required: [
      "policy",
      "usersPreserved",
      "sessionsPreserved",
      "oauthStatesCleared",
      "passwordResetTokensCleared",
      "invitesPreserved",
      "pendingEmailsQuarantined",
      "webhooksDisabled",
      "pendingWebhookDeliveriesQuarantined",
      "jobsCancelled",
      "idempotencyRecordsCleared",
      "backupOnlyCampaignsAssignedToRecoveryAdmin",
    ],
    properties: {
      policy: { type: "string", enum: ["preserve-live-security-plane"] },
      usersPreserved: { type: "integer", minimum: 0 },
      sessionsPreserved: { type: "integer", minimum: 0 },
      oauthStatesCleared: { type: "integer", minimum: 0 },
      passwordResetTokensCleared: { type: "integer", minimum: 0 },
      invitesPreserved: { type: "integer", minimum: 0 },
      pendingEmailsQuarantined: { type: "integer", minimum: 0 },
      webhooksDisabled: { type: "integer", minimum: 0 },
      pendingWebhookDeliveriesQuarantined: { type: "integer", minimum: 0 },
      jobsCancelled: { type: "integer", minimum: 0 },
      idempotencyRecordsCleared: { type: "integer", minimum: 0 },
      backupOnlyCampaignsAssignedToRecoveryAdmin: {
        type: "integer",
        minimum: 0,
      },
    },
  },
  LoginResponse: {
    type: "object",
    additionalProperties: true,
    required: ["token", "session", "user", "memberships", "serverAdmin"],
    properties: {
      token: { type: "string", pattern: "^ots_" },
      session: schemaRef("UserSession"),
      user: schemaRef("PublicUser"),
      memberships: arrayOf(schemaRef("CampaignMember")),
      serverAdmin: { type: "boolean" },
      serverAdmins: schemaRef("ServerAdminPosture"),
      organization: schemaRef("OrganizationWorkspace"),
      organizations: arrayOf(schemaRef("OrganizationWorkspaceInfo")),
      campaign: schemaRef("Campaign"),
      scene: schemaRef("Scene"),
    },
  },
  SessionInfo: {
    type: "object",
    additionalProperties: true,
    required: ["user", "memberships", "serverAdmin"],
    properties: {
      user: schemaRef("PublicUser"),
      session: schemaRef("UserSession"),
      memberships: arrayOf(schemaRef("CampaignMember")),
      serverAdmin: { type: "boolean" },
      serverAdmins: schemaRef("ServerAdminPosture"),
      organization: schemaRef("OrganizationWorkspace"),
      organizations: arrayOf(schemaRef("OrganizationWorkspaceInfo")),
    },
  },
  OrganizationWorkspace: {
    type: "object",
    additionalProperties: false,
    required: organizationWorkspaceRequired,
    properties: organizationWorkspaceProperties,
  },
  OrganizationWorkspaceInfo: {
    type: "object",
    additionalProperties: false,
    required: [...organizationWorkspaceRequired, "role", "memberCount", "campaignCount"],
    properties: {
      ...organizationWorkspaceProperties,
      role: { type: "string", enum: ["owner", "admin", "member"] },
      memberCount: { type: "integer", minimum: 0 },
      campaignCount: { type: "integer", minimum: 0 },
    },
  },
  OrganizationSwitchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["organizationId"],
    properties: {
      organizationId: idSchema,
    },
  },
  OrganizationCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: stringSchema,
      defaultSystemId: idSchema,
      defaultCampaignVisibility: {
        type: "string",
        enum: ["private", "invite_only", "public"],
      },
      defaultPermissionTemplate: {
        type: "string",
        enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"],
      },
      defaultInviteRole: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      defaultSceneName: stringSchema,
      defaultSceneFolder: stringSchema,
      defaultSceneWidth: { type: "integer", minimum: 1 },
      defaultSceneHeight: { type: "integer", minimum: 1 },
      defaultSceneGridSize: { type: "integer", minimum: 1 },
      onboardingTitle: stringSchema,
      onboardingBody: stringSchema,
    },
  },
  OrganizationSwitchResponse: {
    type: "object",
    additionalProperties: false,
    required: ["organization", "session", "organizations"],
    properties: {
      organization: schemaRef("OrganizationWorkspace"),
      session: schemaRef("UserSession"),
      organizations: arrayOf(schemaRef("OrganizationWorkspaceInfo")),
    },
  },
  OrganizationWorkspaceDefaultsPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      name: stringSchema,
      defaultSystemId: idSchema,
      defaultCampaignVisibility: {
        type: "string",
        enum: ["private", "invite_only", "public"],
      },
      defaultPermissionTemplate: {
        type: "string",
        enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"],
      },
      defaultInviteRole: {
        type: "string",
        enum: ["gm", "assistant_gm", "player", "observer"],
      },
      defaultSceneName: stringSchema,
      defaultSceneFolder: stringSchema,
      defaultSceneWidth: { type: "integer", minimum: 1 },
      defaultSceneHeight: { type: "integer", minimum: 1 },
      defaultSceneGridSize: { type: "integer", minimum: 1 },
      onboardingTitle: stringSchema,
      onboardingBody: stringSchema,
    },
  },
  OrganizationMember: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "organizationId",
      "userId",
      "role",
      "user",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      organizationId: idSchema,
      userId: idSchema,
      role: { type: "string", enum: ["owner", "admin", "member"] },
      user: {
        type: "object",
        additionalProperties: false,
        required: ["id", "displayName"],
        properties: {
          id: idSchema,
          displayName: stringSchema,
          email: stringSchema,
        },
      },
    },
  },
  OrganizationMemberCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: idSchema,
      email: stringSchema,
      role: { type: "string", enum: ["admin", "member"] },
      expectedOrganizationUpdatedAt: dateTimeSchema,
    },
  },
  OrganizationMemberUpdateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["role", "expectedUpdatedAt"],
    properties: {
      role: { type: "string", enum: ["admin", "member"] },
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  OrganizationMemberDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["removed", "memberId", "userId", "removedCampaignMemberships"],
    properties: {
      removed: { type: "boolean" },
      memberId: idSchema,
      userId: idSchema,
      removedCampaignMemberships: { type: "integer", minimum: 0 },
    },
  },
  Campaign: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "ownerUserId",
      "name",
      "description",
      "defaultSystemId",
      "visibility",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      organizationId: idSchema,
      ownerUserId: idSchema,
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: {
        type: "string",
        enum: ["private", "invite_only", "public"],
      },
      eventSequence: { type: "integer", minimum: 0 },
      aiPolicy: schemaRef("AiCampaignPolicy"),
      rulesProfile: schemaRef("CampaignRulesProfile"),
      archivedAt: { type: "string", format: "date-time" },
      archivedByUserId: idSchema,
      restoredAt: { type: "string", format: "date-time" },
      restoredByUserId: idSchema,
    },
  },
  CampaignRulesProfile: {
    type: "object",
    additionalProperties: false,
    required: ["profileId", "rulesVersion", "toggles"],
    properties: {
      profileId: { type: "string", minLength: 1, maxLength: 100 },
      rulesVersion: { type: "string", minLength: 1, maxLength: 100 },
      toggles: { type: "object", maxProperties: 100, additionalProperties: { type: "boolean" } },
    },
  },
  CampaignCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: {
        type: "string",
        enum: ["private", "invite_only", "public"],
      },
      permissionTemplate: {
        type: "string",
        enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"],
      },
      starterContent: { type: "boolean" },
    },
  },
  CampaignSnapshotBundled: {
    type: "object",
    additionalProperties: false,
    properties: {
      assetStorage: { type: "object", additionalProperties: true },
      audioTracks: arrayOf(schemaRef("AudioTrack")),
      plugins: arrayOf(schemaRef("PluginCampaignInfo")),
      systems: arrayOf(schemaRef("SystemRuntimeInfo")),
      characterTemplates: arrayOf({ type: "object", additionalProperties: true }),
      contentImports: arrayOf(schemaRef("ContentImportBatch")),
      aiThreads: arrayOf(schemaRef("AiThread")),
      aiUsage: { type: "object", additionalProperties: true },
      aiToolCalls: arrayOf(schemaRef("AiToolCall")),
      combatAudit: arrayOf(schemaRef("AuditLog")),
    },
  },
  CampaignPresence: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "userId", "displayName", "role", "connectionCount", "connectedAt", "lastSeenAt", "activeSceneIds"],
    properties: {
      campaignId: idSchema,
      userId: idSchema,
      displayName: stringSchema,
      role: stringSchema,
      connectionCount: { type: "integer", minimum: 1 },
      connectedAt: { type: "string", format: "date-time" },
      lastSeenAt: { type: "string", format: "date-time" },
      activeSceneIds: arrayOf(idSchema),
    },
  },
  SnapshotHistoryCollectionMeta: {
    type: "object",
    additionalProperties: false,
    required: ["total", "returned", "truncated"],
    properties: {
      total: { type: "integer", minimum: 0 },
      returned: { type: "integer", minimum: 0 },
      truncated: { type: "boolean" },
    },
  },
  SnapshotHistoryMeta: {
    type: "object",
    additionalProperties: false,
    required: ["limit", "collections"],
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 200 },
      collections: {
        type: "object",
        additionalProperties: schemaRef("SnapshotHistoryCollectionMeta"),
      },
    },
  },
  CampaignSnapshot: {
    type: "object",
    additionalProperties: true,
    required: [
      "generatedAt",
      "eventSequence",
      "realtimeRecovery",
      "user",
      "campaign",
      "members",
      "presences",
      "campaignSessions",
      "worlds",
      "worldRecords",
      "worldRelations",
      "scenes",
      "tokens",
      "fogPresets",
      "assets",
      "actors",
      "calculationOverrides",
      "characterTransfers",
      "items",
      "journals",
      "handouts",
      "chat",
      "rolls",
      "diceMacros",
      "encounters",
      "combats",
      "proposals",
      "memory",
      "bundled",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      eventSequence: { type: "integer", minimum: 0 },
      realtimeRecovery: { type: "string", enum: ["refetch_snapshot_on_gap"] },
      history: schemaRef("SnapshotHistoryMeta"),
      user: schemaRef("PublicUser"),
      campaign: schemaRef("Campaign"),
      members: arrayOf(schemaRef("CampaignMember")),
      presences: arrayOf(schemaRef("CampaignPresence")),
      campaignSessions: arrayOf(schemaRef("CampaignSession")),
      worlds: arrayOf(schemaRef("World")),
      worldRecords: arrayOf(schemaRef("WorldRecord")),
      worldRelations: arrayOf(schemaRef("WorldRelation")),
      scenes: arrayOf(schemaRef("Scene")),
      selectedSceneId: idSchema,
      activeSceneId: idSchema,
      vision: schemaRef("VisionSnapshot"),
      tokens: arrayOf(schemaRef("Token")),
      fogPresets: arrayOf(schemaRef("FogPreset")),
      assets: arrayOf(schemaRef("MapAsset")),
      actors: arrayOf(schemaRef("Actor")),
      calculationOverrides: arrayOf(schemaRef("CalculationOverride")),
      characterTransfers: arrayOf(schemaRef("CharacterTransfer")),
      items: arrayOf(schemaRef("Item")),
      journals: arrayOf(schemaRef("JournalEntry")),
      handouts: arrayOf(schemaRef("Handout")),
      chat: arrayOf(schemaRef("ChatMessage")),
      rolls: arrayOf(schemaRef("DiceRoll")),
      diceMacros: arrayOf(schemaRef("DiceMacro")),
      encounters: arrayOf(schemaRef("Encounter")),
      combats: arrayOf(schemaRef("Combat")),
      proposals: arrayOf(schemaRef("Proposal")),
      memory: arrayOf(schemaRef("AiMemoryFact")),
      bundled: schemaRef("CampaignSnapshotBundled"),
    },
  },
  CampaignPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: {
        type: "string",
        enum: ["private", "invite_only", "public"],
      },
      rulesProfile: schemaRef("CampaignRulesProfile"),
    },
  },
  CharacterTransfer: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "actorId", "toUserId", "initiatedByUserId", "actorUpdatedAt", "status", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      actorId: idSchema,
      fromUserId: idSchema,
      toUserId: idSchema,
      initiatedByUserId: idSchema,
      actorUpdatedAt: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["pending", "accepted", "declined", "cancelled"] },
      resolvedAt: { type: "string", format: "date-time" },
      resolvedByUserId: idSchema,
    },
  },
  CharacterTransferCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["toUserId", "expectedUpdatedAt"],
    properties: {
      toUserId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CharacterTransferCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["transfer"],
    properties: { transfer: schemaRef("CharacterTransfer") },
  },
  CharacterTransferResolutionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: { expectedUpdatedAt: { type: "string", format: "date-time" } },
  },
  CharacterTransferResolutionResponse: {
    type: "object",
    additionalProperties: false,
    required: ["transfer"],
    properties: { transfer: schemaRef("CharacterTransfer"), actor: schemaRef("Actor") },
  },
  CampaignOwnershipTransferRequest: {
    type: "object",
    additionalProperties: false,
    required: ["targetUserId", "expectedUpdatedAt"],
    properties: {
      targetUserId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      reason: { type: "string", maxLength: 160 },
    },
  },
  CampaignOwnershipTransferResponse: {
    type: "object",
    additionalProperties: false,
    required: ["campaign", "previousOwner", "newOwner"],
    properties: {
      campaign: schemaRef("Campaign"),
      previousOwner: schemaRef("CampaignMemberSnapshot"),
      newOwner: schemaRef("CampaignMemberSnapshot"),
    },
  },
  CampaignDuplicateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      name: { type: "string", minLength: 1, maxLength: 160 },
    },
  },
  CampaignDuplicateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["campaign", "counts", "assetFiles"],
    properties: {
      campaign: schemaRef("Campaign"),
      counts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      assetFiles: { type: "integer", minimum: 0 },
    },
  },
  CampaignWebhookEventType: {
    type: "string",
    enum: campaignWebhookEventTypeValues,
    description:
      "A bounded metadata event that may be delivered to an outbound campaign webhook.",
  },
  CampaignWebhookEnvelopeEventType: {
    type: "string",
    enum: campaignWebhookEnvelopeEventTypeValues,
  },
  CampaignWebhookDelivery: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "webhookId",
      "eventId",
      "eventType",
      "occurredAt",
      "attempt",
      "status",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      webhookId: idSchema,
      eventId: idSchema,
      eventType: schemaRef("CampaignWebhookEnvelopeEventType"),
      occurredAt: { type: "string", format: "date-time" },
      resourceType: { type: "string", minLength: 1, maxLength: 80 },
      resourceId: idSchema,
      attempt: { type: "integer", minimum: 1 },
      status: {
        type: "string",
        enum: ["queued", "delivered", "failed"],
      },
      responseStatus: { type: "integer", minimum: 100, maximum: 599 },
      responseBytes: { type: "integer", minimum: 0 },
      durationMs: { type: "integer", minimum: 0 },
      deliveredAt: { type: "string", format: "date-time" },
      failedAt: { type: "string", format: "date-time" },
      errorCode: { type: "string", minLength: 1, maxLength: 120 },
      retryOfDeliveryId: idSchema,
      initiatedByUserId: idSchema,
    },
    description:
      "Metadata-only outbound delivery ledger entry. Request bodies, response bodies, signing headers, and secrets are never returned.",
  },
  CampaignWebhook: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "name",
      "url",
      "eventTypes",
      "enabled",
      "secretConfigured",
      "secretHint",
      "createdByUserId",
      "updatedByUserId",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: { type: "string", minLength: 1, maxLength: 80 },
      url: { type: "string", format: "uri", minLength: 1, maxLength: 2048 },
      eventTypes: {
        type: "array",
        minItems: 1,
        maxItems: campaignWebhookEventTypeValues.length,
        uniqueItems: true,
        items: schemaRef("CampaignWebhookEventType"),
      },
      enabled: { type: "boolean" },
      secretConfigured: { type: "boolean" },
      secretHint: { type: "string", minLength: 1, maxLength: 32 },
      createdByUserId: idSchema,
      updatedByUserId: idSchema,
      latestDelivery: schemaRef("CampaignWebhookDelivery"),
    },
    description:
      "Public webhook configuration. The signing secret and internal idempotency hashes are never included.",
  },
  CampaignWebhookEnvelopeV1: {
    type: "object",
    additionalProperties: false,
    required: ["version", "eventId", "eventType", "occurredAt", "campaignId"],
    properties: {
      version: { type: "string", enum: ["1.0"] },
      eventId: idSchema,
      eventType: schemaRef("CampaignWebhookEnvelopeEventType"),
      occurredAt: { type: "string", format: "date-time" },
      campaignId: idSchema,
      resource: {
        type: "object",
        additionalProperties: false,
        required: ["type", "id"],
        properties: {
          type: { type: "string", minLength: 1, maxLength: 80 },
          id: idSchema,
        },
      },
    },
    description:
      "Stable metadata-only webhook envelope. It contains no arbitrary campaign, chat, journal, AI, or imported-content payload.",
  },
  CampaignWebhookListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["items", "supportedEventTypes"],
    properties: {
      items: arrayOf(schemaRef("CampaignWebhook")),
      supportedEventTypes: {
        type: "array",
        items: schemaRef("CampaignWebhookEventType"),
        minItems: 1,
        uniqueItems: true,
      },
    },
  },
  CampaignWebhookCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["name", "url", "eventTypes", "expectedCampaignUpdatedAt"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      url: { type: "string", format: "uri", minLength: 1, maxLength: 2048 },
      eventTypes: {
        type: "array",
        minItems: 1,
        maxItems: campaignWebhookEventTypeValues.length,
        uniqueItems: true,
        items: schemaRef("CampaignWebhookEventType"),
      },
      enabled: { type: "boolean", default: true },
      expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CampaignWebhookUpdateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    anyOf: [
      { required: ["name"] },
      { required: ["url"] },
      { required: ["eventTypes"] },
      { required: ["enabled"] },
    ],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      url: { type: "string", format: "uri", minLength: 1, maxLength: 2048 },
      eventTypes: {
        type: "array",
        minItems: 1,
        maxItems: campaignWebhookEventTypeValues.length,
        uniqueItems: true,
        items: schemaRef("CampaignWebhookEventType"),
      },
      enabled: { type: "boolean" },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CampaignWebhookMutationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CampaignWebhookCreateResponse: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["webhook", "signingSecret", "campaignUpdatedAt"],
        properties: {
          webhook: schemaRef("CampaignWebhook"),
          signingSecret: {
            type: "string",
            minLength: 32,
            description:
              "One-time plaintext secret. Store it immediately; it cannot be listed or recovered.",
          },
          campaignUpdatedAt: { type: "string", format: "date-time" },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["webhook", "signingSecretAlreadyShown"],
        properties: {
          webhook: schemaRef("CampaignWebhook"),
          signingSecretAlreadyShown: { type: "boolean", enum: [true] },
        },
      },
    ],
  },
  CampaignWebhookRotateSecretResponse: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["webhook", "signingSecret"],
        properties: {
          webhook: schemaRef("CampaignWebhook"),
          signingSecret: {
            type: "string",
            minLength: 32,
            description:
              "One-time replacement secret. Rotation invalidates the previous secret immediately.",
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["webhook", "signingSecretAlreadyShown"],
        properties: {
          webhook: schemaRef("CampaignWebhook"),
          signingSecretAlreadyShown: { type: "boolean", enum: [true] },
        },
      },
    ],
  },
  CampaignWebhookDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["webhook", "deleted"],
    properties: {
      webhook: schemaRef("CampaignWebhook"),
      deleted: { type: "boolean", enum: [true] },
    },
  },
  World: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "name",
      "description",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      description: stringSchema,
    },
  },
  WorldWriteRequest: {
    type: "object",
    additionalProperties: false,
    properties: { name: stringSchema, description: stringSchema },
  },
  WorldRecord: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "kind", "name", "summary", "description", "lifecycle", "visibility", "tags", "metadata", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      kind: { type: "string", enum: ["npc", "location", "quest", "faction"] },
      name: { type: "string", minLength: 1, maxLength: 160 },
      summary: { type: "string", maxLength: 500 },
      description: { type: "string", maxLength: 20000 },
      lifecycle: { type: "string", enum: ["draft", "active", "inactive", "resolved", "archived"] },
      visibility: { type: "string", enum: ["gm_only", "public"] },
      tags: { type: "array", maxItems: 50, items: { type: "string", maxLength: 40 } },
      metadata: { type: "object", maxProperties: 256, additionalProperties: true },
      createdByUserId: idSchema,
      updatedByUserId: idSchema,
      resolvedAt: { type: "string", format: "date-time" },
      archivedAt: { type: "string", format: "date-time" },
    },
  },
  WorldRecordWriteRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { oneOf: [idSchema, { type: "null" }] },
      kind: { type: "string", enum: ["npc", "location", "quest", "faction"] },
      name: { type: "string", minLength: 1, maxLength: 160 },
      summary: { type: "string", maxLength: 500 },
      description: { type: "string", maxLength: 20000 },
      lifecycle: { type: "string", enum: ["draft", "active", "inactive", "resolved", "archived"] },
      visibility: { type: "string", enum: ["gm_only", "public"] },
      tags: { type: "array", maxItems: 50, items: { type: "string", maxLength: 40 } },
      metadata: { type: "object", maxProperties: 256, additionalProperties: true },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  WorldRecordCreateRequest: {
    allOf: [
      schemaRef("WorldRecordWriteRequest"),
      { type: "object", required: ["kind", "name", "expectedCampaignUpdatedAt"] },
    ],
  },
  WorldRecordLifecycleRequest: {
    type: "object",
    additionalProperties: false,
    required: ["lifecycle", "expectedUpdatedAt"],
    properties: {
      lifecycle: { type: "string", enum: ["draft", "active", "inactive", "resolved", "archived"] },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  WorldRecordDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["record", "deletedRelationIds"],
    properties: { record: schemaRef("WorldRecord"), deletedRelationIds: arrayOf(idSchema) },
  },
  WorldRelation: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "sourceRecordId", "targetRecordId", "type", "visibility", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      sourceRecordId: idSchema,
      targetRecordId: idSchema,
      type: { type: "string", enum: ["located_in", "member_of", "allied_with", "opposed_to", "serves", "leads", "involved_in", "related_to"] },
      label: { type: "string", maxLength: 160 },
      notes: { type: "string", maxLength: 2000 },
      visibility: { type: "string", enum: ["gm_only", "public"] },
      createdByUserId: idSchema,
      updatedByUserId: idSchema,
    },
  },
  WorldRelationWriteRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { oneOf: [idSchema, { type: "null" }] },
      sourceRecordId: idSchema,
      targetRecordId: idSchema,
      type: { type: "string", enum: ["located_in", "member_of", "allied_with", "opposed_to", "serves", "leads", "involved_in", "related_to"] },
      label: { type: "string", maxLength: 160 },
      notes: { type: "string", maxLength: 2000 },
      visibility: { type: "string", enum: ["gm_only", "public"] },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  WorldRelationCreateRequest: {
    allOf: [
      schemaRef("WorldRelationWriteRequest"),
      { type: "object", required: ["sourceRecordId", "targetRecordId", "type", "expectedCampaignUpdatedAt"] },
    ],
  },
  CampaignSession: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "status",
      "title",
      "number",
      "agenda",
      "notes",
      "sceneIds",
      "encounterIds",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      status: { type: "string", enum: ["planned", "live", "completed"] },
      title: stringSchema,
      number: { type: "integer", minimum: 1 },
      agenda: stringSchema,
      notes: stringSchema,
      scheduledFor: { type: "string", format: "date-time" },
      startedAt: { type: "string", format: "date-time" },
      endedAt: { type: "string", format: "date-time" },
      sceneIds: arrayOf(idSchema),
      encounterIds: arrayOf(idSchema),
      recapProposalId: idSchema,
      recapJournalId: idSchema,
      createdBy: idSchema,
      updatedBy: idSchema,
    },
  },
  CampaignSessionWriteRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: stringSchema,
      agenda: stringSchema,
      notes: stringSchema,
      scheduledFor: {
        oneOf: [{ type: "string", format: "date-time" }, { type: "null" }],
      },
      sceneIds: arrayOf(idSchema),
      encounterIds: arrayOf(idSchema),
    },
  },
  CampaignSessionMutationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      title: stringSchema,
      agenda: stringSchema,
      notes: stringSchema,
      scheduledFor: { oneOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      sceneIds: arrayOf(idSchema),
      encounterIds: arrayOf(idSchema),
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CampaignSearchResult: {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "title", "snippet", "updatedAt", "score", "matchKind", "target"],
    properties: {
      type: {
        type: "string",
        enum: [
          "world",
          "scene",
          "actor",
          "item",
          "journal",
          "handout",
          "encounter",
          "memory",
          "chat",
          "roll",
          "compendium",
        ],
      },
      id: idSchema,
      title: stringSchema,
      snippet: stringSchema,
      updatedAt: { type: "string", format: "date-time" },
      worldId: idSchema,
      visibility: {
        type: "string",
        enum: [
          "gm_only",
          "public",
          "specific_players",
          "specific_characters",
          "whisper",
        ],
      },
      score: { type: "number" },
      matchKind: { type: "string", enum: ["exact_id", "exact_name", "normalized_name", "prefix", "title", "body", "fuzzy"] },
      target: { $ref: "#/components/schemas/CampaignSearchTarget" },
    },
  },
  CampaignSearchTarget: {
    type: "object",
    additionalProperties: false,
    required: ["type", "id", "sourceKind"],
    properties: {
      type: { type: "string", enum: ["world", "scene", "actor", "item", "journal", "handout", "encounter", "memory", "chat", "roll", "compendium"] },
      id: idSchema,
      worldId: idSchema,
      actorId: idSchema,
      systemId: idSchema,
      sourceKind: { type: "string", enum: ["campaign", "actor_instance", "srd", "bundled", "homebrew"] },
    },
  },
  Scene: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "name",
      "width",
      "height",
      "gridType",
      "gridSize",
      "active",
      "sortOrder",
      "fog",
      "walls",
      "lights",
      "metadata",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      name: stringSchema,
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      gridType: { type: "string", enum: ["square", "gridless"] },
      gridSize: { type: "number", minimum: 1 },
      backgroundAssetId: idSchema,
      folder: stringSchema,
      active: { type: "boolean" },
      sortOrder: { type: "number" },
      fog: arrayOf(schemaRef("FogRegion")),
      fogHistory: arrayOf({ type: "object", additionalProperties: true }),
      activationHistory: arrayOf(schemaRef("SceneActivationHistoryEntry")),
      annotationHistory: arrayOf(schemaRef("SceneAnnotationHistoryEntry")),
      walls: arrayOf(schemaRef("Wall")),
      lights: arrayOf(schemaRef("LightSource")),
      annotations: arrayOf(schemaRef("SceneAnnotation")),
      difficultTerrain: arrayOf(schemaRef("DifficultTerrainRegion")),
      coverOverrides: arrayOf(schemaRef("SceneCoverOverride")),
      metadata: { type: "object", additionalProperties: true },
      permissions: {
        type: "object",
        additionalProperties: { type: "array", items: { type: "string", enum: ["scene.read", "scene.update"] }, uniqueItems: true }
      },
    },
  },
  SceneActivationHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: ["id", "sceneId", "activatedAt", "deactivatedSceneIds", "source"],
    properties: {
      id: idSchema,
      sceneId: idSchema,
      activatedAt: { type: "string", format: "date-time" },
      activatedByUserId: idSchema,
      previousActiveSceneId: idSchema,
      deactivatedSceneIds: arrayOf(idSchema),
      source: { type: "string", enum: ["create", "activate"] },
    },
  },
  SceneCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: idSchema,
      name: stringSchema,
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      gridType: { type: "string", enum: ["square", "gridless"] },
      gridSize: { type: "number", minimum: 1 },
      backgroundAssetId: idSchema,
      folder: stringSchema,
      active: { type: "boolean" },
      sortOrder: { type: "number" },
      fog: arrayOf(schemaRef("FogRegion")),
      walls: arrayOf(schemaRef("Wall")),
      lights: arrayOf(schemaRef("LightSource")),
      annotations: arrayOf(schemaRef("SceneAnnotation")),
      difficultTerrain: arrayOf(schemaRef("DifficultTerrainRegion")),
      coverOverrides: arrayOf(schemaRef("SceneCoverOverride")),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  SceneDuplicationSource: {
    type: "object",
    additionalProperties: false,
    required: ["sceneId", "expectedUpdatedAt"],
    properties: {
      sceneId: idSchema,
      expectedUpdatedAt: dateTimeSchema,
      name: { type: "string", minLength: 1, maxLength: 160 },
    },
  },
  SceneDuplicationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["operationId", "expectedUpdatedAt", "sources"],
    properties: {
      operationId: { type: "string", pattern: "^[A-Za-z0-9:_-]{1,160}$" },
      expectedUpdatedAt: dateTimeSchema,
      sources: { type: "array", minItems: 1, maxItems: 100, items: schemaRef("SceneDuplicationSource") },
      dryRun: { type: "boolean" },
    },
  },
  SceneDuplicationCopy: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "sourceId", "targetId"],
    properties: {
      collection: { type: "string", enum: ["scenes", "tokens", "actors", "items", "calculationOverrides", "encounters"] },
      sourceId: idSchema,
      targetId: idSchema,
      sourceName: stringSchema,
      targetName: stringSchema,
    },
  },
  SceneDuplicationSkippedReference: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "id", "reason"],
    properties: {
      collection: { type: "string", enum: ["encounters", "combats", "campaignSessions", "fogPresets"] },
      id: idSchema,
      reason: { type: "string", enum: ["partial_encounter", "combat_history", "session_reference", "fog_preset_reference"] },
    },
  },
  SceneDuplicationSharedReference: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "id", "referencedBy"],
    properties: {
      collection: { type: "string", enum: ["assets", "worlds", "actors"] },
      id: idSchema,
      referencedBy: arrayOf(idSchema),
    },
  },
  SceneDuplicationPlan: {
    type: "object",
    additionalProperties: false,
    required: ["operationId", "campaignId", "copies", "skippedReferences", "sharedReferences", "counts"],
    properties: {
      operationId: idSchema,
      campaignId: idSchema,
      copies: arrayOf(schemaRef("SceneDuplicationCopy")),
      skippedReferences: arrayOf(schemaRef("SceneDuplicationSkippedReference")),
      sharedReferences: arrayOf(schemaRef("SceneDuplicationSharedReference")),
      counts: {
        type: "object",
        additionalProperties: false,
        required: ["scenes", "tokens", "actors", "items", "calculationOverrides", "encounters"],
        properties: {
          scenes: { type: "integer", minimum: 0 },
          tokens: { type: "integer", minimum: 0 },
          actors: { type: "integer", minimum: 0 },
          items: { type: "integer", minimum: 0 },
          calculationOverrides: { type: "integer", minimum: 0 },
          encounters: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  SceneDuplicationResult: {
    type: "object",
    additionalProperties: false,
    required: ["dryRun", "plan", "scenes", "tokens", "actors", "items", "calculationOverrides", "encounters"],
    properties: {
      dryRun: { type: "boolean" },
      plan: schemaRef("SceneDuplicationPlan"),
      scenes: arrayOf(schemaRef("Scene")),
      tokens: arrayOf(schemaRef("Token")),
      actors: arrayOf(schemaRef("Actor")),
      items: arrayOf(schemaRef("Item")),
      calculationOverrides: arrayOf(schemaRef("CalculationOverride")),
      encounters: arrayOf(schemaRef("Encounter")),
      campaign: schemaRef("Campaign"),
    },
  },
  ScenePatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { anyOf: [idSchema, { type: "null" }] },
      name: stringSchema,
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      gridType: { type: "string", enum: ["square", "gridless"] },
      gridSize: { type: "number", minimum: 1 },
      backgroundAssetId: { anyOf: [idSchema, { type: "null" }] },
      folder: { anyOf: [stringSchema, { type: "null" }] },
      active: { type: "boolean" },
      sortOrder: { type: "number" },
      fog: arrayOf(schemaRef("FogRegion")),
      walls: arrayOf(schemaRef("Wall")),
      lights: arrayOf(schemaRef("LightSource")),
      annotations: arrayOf(schemaRef("SceneAnnotation")),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  FogRegion: {
    type: "object",
    additionalProperties: false,
    required: ["id", "x", "y", "radius", "hidden"],
    properties: {
      id: idSchema,
      x: { type: "number" },
      y: { type: "number" },
      radius: { type: "number", minimum: 0 },
      hidden: { type: "boolean" },
      shape: { type: "string", enum: ["circle", "polygon"] },
      mode: { type: "string", enum: ["reveal", "hide"] },
      points: arrayOf(schemaRef("VisionPoint")),
    },
  },
  FogRegionInput: {
    type: "object",
    additionalProperties: false,
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      radius: { type: "number", minimum: 0 },
      brushRadius: { type: "number", minimum: 0 },
      hidden: { type: "boolean" },
      shape: { type: "string", enum: ["circle", "polygon", "brush"] },
      mode: { type: "string", enum: ["reveal", "hide"] },
      points: arrayOf(schemaRef("VisionPoint")),
    },
  },
  FogPreset: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "name",
      "regions",
      "metadata",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      description: stringSchema,
      sourceSceneId: idSchema,
      regions: arrayOf(schemaRef("FogPresetRegion")),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  FogPresetRegion: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y", "radius", "hidden"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      radius: { type: "number", minimum: 0 },
      hidden: { type: "boolean" },
      shape: { type: "string", enum: ["circle", "polygon"] },
      mode: { type: "string", enum: ["reveal", "hide"] },
      points: arrayOf(schemaRef("VisionPoint")),
    },
  },
  FogPresetCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedSceneUpdatedAt"],
    properties: {
      name: stringSchema,
      description: stringSchema,
      sceneId: idSchema,
      expectedSceneUpdatedAt: dateTimeSchema,
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  FogPresetApplyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      presetId: idSchema,
      mode: { type: "string", enum: ["append", "replace"] },
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  FogHistoryEntry: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "sceneId",
      "action",
      "fogId",
      "actorUserId",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      action: { type: "string", enum: ["create", "delete", "undo"] },
      fogId: idSchema,
      actorUserId: idSchema,
      region: schemaRef("FogRegion"),
      targetHistoryId: idSchema,
    },
  },
  SceneEditHistory: {
    type: "object",
    additionalProperties: false,
    required: ["sceneId", "limit", "entries"],
    properties: {
      sceneId: idSchema,
      limit: { type: "integer", minimum: 0 },
      entries: arrayOf(schemaRef("SceneEditHistoryEntry")),
    },
  },
  SceneEditHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: ["id", "at", "kind"],
    properties: {
      id: idSchema,
      at: { type: "string", format: "date-time" },
      byUserId: idSchema,
      kind: stringSchema,
    },
  },
  VisionPoint: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y"],
    properties: {
      x: { type: "number" },
      y: { type: "number" },
    },
  },
  DifficultTerrainRegion: {
    type: "object",
    additionalProperties: false,
    required: ["id", "sceneId", "label", "points", "createdByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      label: { type: "string", minLength: 1, maxLength: 80 },
      points: { type: "array", minItems: 3, maxItems: 64, items: schemaRef("VisionPoint") },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      createdByUserId: idSchema,
    },
  },
  DifficultTerrainCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["points", "expectedUpdatedAt"],
    properties: {
      label: { type: "string", minLength: 1, maxLength: 80 },
      points: { type: "array", minItems: 3, maxItems: 64, items: schemaRef("VisionPoint") },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DifficultTerrainPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      label: { type: "string", minLength: 1, maxLength: 80 },
      points: { type: "array", minItems: 3, maxItems: 64, items: schemaRef("VisionPoint") },
      color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  SceneCoverOverride: {
    type: "object",
    additionalProperties: false,
    required: ["id", "sceneId", "sourceTokenId", "targetTokenId", "level", "createdByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      sourceTokenId: idSchema,
      targetTokenId: idSchema,
      level: { type: "string", enum: ["none", "half", "three_quarters", "total"] },
      note: { type: "string", maxLength: 500 },
      createdByUserId: idSchema,
    },
  },
  SceneCoverOverrideRequest: {
    type: "object",
    additionalProperties: false,
    required: ["sourceTokenId", "targetTokenId", "level", "expectedUpdatedAt"],
    properties: {
      sourceTokenId: idSchema,
      targetTokenId: idSchema,
      level: { type: "string", enum: ["none", "half", "three_quarters", "total"] },
      note: { type: "string", maxLength: 500 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  ScenePathMeasurementRequest: {
    type: "object",
    additionalProperties: false,
    required: ["points"],
    properties: {
      points: { type: "array", minItems: 2, maxItems: 64, items: schemaRef("VisionPoint") },
    },
  },
  ScenePathMeasurement: {
    type: "object",
    additionalProperties: false,
    required: ["sceneId", "points", "normalDistance", "difficultTerrainDistance", "totalDistance", "movementCostDistance", "unit"],
    properties: {
      sceneId: idSchema,
      points: { type: "array", minItems: 2, maxItems: 64, items: schemaRef("VisionPoint") },
      normalDistance: { type: "number", minimum: 0 },
      difficultTerrainDistance: { type: "number", minimum: 0 },
      totalDistance: { type: "number", minimum: 0 },
      movementCostDistance: { type: "number", minimum: 0 },
      unit: { type: "string", enum: ["scene", "feet"] },
    },
  },
  VisionPolygon: {
    type: "object",
    additionalProperties: true,
    required: ["id", "source", "sourceId", "points"],
    properties: {
      id: idSchema,
      source: { type: "string", enum: ["token", "fog", "light"] },
      sourceId: idSchema,
      points: arrayOf(schemaRef("VisionPoint")),
      radius: { type: "number", minimum: 0 },
      lightLevel: { type: "string", enum: ["bright", "dim"] },
      color: stringSchema,
      opacity: { type: "number", minimum: 0 },
      mode: { type: "string", enum: ["reveal", "hide"] },
      senseType: { type: "string", enum: ["normal", "darkvision", "blindsight", "tremorsense", "truesight"] },
      lightingEffect: { type: "string", enum: ["light", "darkness"] },
      magical: { type: "boolean" },
    },
  },
  VisionSnapshot: {
    type: "object",
    additionalProperties: true,
    required: ["sceneId", "userId", "fogActive", "polygons"],
    properties: {
      sceneId: idSchema,
      userId: idSchema,
      fogActive: { type: "boolean" },
      polygons: arrayOf(schemaRef("VisionPolygon")),
    },
  },
  VisionPointSample: {
    type: "object",
    additionalProperties: true,
    required: [
      "sceneId",
      "userId",
      "point",
      "fogActive",
      "visible",
      "revealedBy",
      "hiddenBy",
      "illuminatedBy",
      "blockedBy",
    ],
    properties: {
      sceneId: idSchema,
      userId: idSchema,
      point: schemaRef("VisionPoint"),
      fogActive: { type: "boolean" },
      visible: { type: "boolean" },
      revealedBy: arrayOf({ type: "object", additionalProperties: true }),
      hiddenBy: arrayOf({ type: "object", additionalProperties: true }),
      illuminatedBy: arrayOf({ type: "object", additionalProperties: true }),
      blockedBy: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  Wall: {
    type: "object",
    additionalProperties: false,
    required: ["id", "x1", "y1", "x2", "y2", "blocksVision"],
    properties: {
      id: idSchema,
      x1: { type: "number" },
      y1: { type: "number" },
      x2: { type: "number" },
      y2: { type: "number" },
      blocksVision: { type: "boolean" },
      blocksMovement: { type: "boolean" },
      kind: { type: "string", enum: ["wall", "terrain", "door", "window"] },
      open: { type: "boolean" },
    },
  },
  WallInput: {
    type: "object",
    additionalProperties: false,
    properties: {
      x1: { type: "number" },
      y1: { type: "number" },
      x2: { type: "number" },
      y2: { type: "number" },
      blocksVision: { type: "boolean" },
      blocksMovement: { type: "boolean" },
      kind: { type: "string", enum: ["wall", "terrain", "door", "window"] },
      open: { type: "boolean" },
    },
  },
  LightSource: {
    type: "object",
    additionalProperties: false,
    required: ["id", "x", "y", "radius", "color"],
    properties: {
      id: idSchema,
      x: { type: "number" },
      y: { type: "number" },
      radius: { type: "number", minimum: 0 },
      brightRadius: { type: "number", minimum: 0 },
      dimRadius: { type: "number", minimum: 0 },
      color: stringSchema,
      intensity: { type: "number", minimum: 0 },
      kind: { type: "string", enum: ["light", "darkness"] },
      magical: { type: "boolean" },
    },
  },
  LightSourceInput: {
    type: "object",
    additionalProperties: false,
    properties: {
      x: { type: "number" },
      y: { type: "number" },
      radius: { type: "number", minimum: 0 },
      brightRadius: { type: "number", minimum: 0 },
      dimRadius: { type: "number", minimum: 0 },
      color: stringSchema,
      intensity: { type: "number", minimum: 0 },
      kind: { type: "string", enum: ["light", "darkness"] },
      magical: { type: "boolean" },
    },
  },
  SceneAnnotation: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "sceneId",
      "kind",
      "createdByUserId",
      "color",
      "points",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      createdByUserId: idSchema,
      label: stringSchema,
      layer: {
        type: "string",
        enum: ["measurement", "effects", "drawings", "notes"],
      },
      groupId: idSchema,
      groupLabel: stringSchema,
      sortOrder: { type: "number" },
      templateShape: { type: "string", enum: ["circle", "line", "cone"] },
      templateSaveAbility: stringSchema,
      templateSaveDc: { type: "integer", minimum: 1 },
      templateDamageFormula: stringSchema,
      templateDamageType: stringSchema,
      snapToGrid: { type: "boolean" },
      affectedTokenIds: arrayOf(idSchema),
      rulesSystemId: idSchema,
      effectHint: stringSchema,
      color: stringSchema,
      points: arrayOf(schemaRef("VisionPoint")),
      radius: { type: "number", minimum: 0 },
      expiresAt: { type: "string", format: "date-time" },
    },
  },
  SceneAnnotationHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "sceneId",
      "annotationId",
      "action",
      "kind",
      "actorUserId",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      annotationId: idSchema,
      action: { type: "string", enum: ["create", "update", "delete"] },
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      layer: {
        type: "string",
        enum: ["measurement", "effects", "drawings", "notes"],
      },
      groupId: idSchema,
      groupLabel: stringSchema,
      templateShape: { type: "string", enum: ["circle", "line", "cone"] },
      templateSaveAbility: stringSchema,
      templateSaveDc: { type: "integer", minimum: 1 },
      templateDamageFormula: stringSchema,
      templateDamageType: stringSchema,
      affectedTokenIds: arrayOf(idSchema),
      rulesSystemId: idSchema,
      actorUserId: idSchema,
    },
  },
  SceneAnnotationCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      label: stringSchema,
      color: stringSchema,
      layer: {
        type: "string",
        enum: ["measurement", "effects", "drawings", "notes"],
      },
      groupId: idSchema,
      groupLabel: stringSchema,
      sortOrder: { type: "number" },
      templateShape: { type: "string", enum: ["circle", "line", "cone"] },
      templateSaveAbility: stringSchema,
      templateSaveDc: { type: "integer", minimum: 1 },
      templateDamageFormula: stringSchema,
      templateDamageType: stringSchema,
      snapToGrid: { type: "boolean" },
      points: arrayOf(schemaRef("VisionPoint")),
      radius: { type: "number", minimum: 0 },
      expiresInSeconds: { type: "integer", minimum: 1 },
    },
  },
  SceneAnnotationUpdateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: stringSchema,
      color: stringSchema,
      layer: {
        type: "string",
        enum: ["measurement", "effects", "drawings", "notes"],
      },
      groupId: idSchema,
      groupLabel: stringSchema,
      sortOrder: { type: "number" },
      templateSaveAbility: stringSchema,
      templateSaveDc: { type: "integer", minimum: 1 },
      templateDamageFormula: stringSchema,
      templateDamageType: stringSchema,
      snapToGrid: { type: "boolean" },
      points: arrayOf(schemaRef("VisionPoint")),
      radius: { type: "number", minimum: 0 },
      expiresInSeconds: { type: "integer", minimum: 1 },
    },
  },
  SceneRenderingDiagnostics: {
    type: "object",
    additionalProperties: true,
    properties: {
      sceneId: idSchema,
      sceneName: stringSchema,
      warnings: arrayOf(stringSchema),
      metrics: { type: "object", additionalProperties: true },
    },
  },
  TokenTargetRequest: {
    type: "object",
    additionalProperties: false,
    required: ["targeted"],
    properties: {
      targeted: { type: "boolean" },
    },
  },
  TokenSense: {
    type: "object",
    additionalProperties: false,
    required: ["type", "range"],
    properties: {
      type: { type: "string", enum: ["normal", "darkvision", "blindsight", "tremorsense", "truesight"] },
      range: { type: "number", exclusiveMinimum: 0, maximum: 1000000 },
    },
  },
  Token: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "sceneId",
      "name",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "hidden",
      "locked",
      "visionEnabled",
      "visionRadius",
      "disposition",
      "metadata",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      actorId: idSchema,
      name: stringSchema,
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 0 },
      height: { type: "number", minimum: 0 },
      rotation: { type: "number" },
      elevation: { type: "number", minimum: -1000000, maximum: 1000000, description: "Vertical position in game-world feet." },
      layer: { type: "string", enum: ["map", "player", "gm"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      visionEnabled: { type: "boolean" },
      visionRadius: { type: "number", minimum: 0 },
      brightVisionRadius: { type: "number", minimum: 0 },
      dimVisionRadius: { type: "number", minimum: 0 },
      senses: arrayOf(schemaRef("TokenSense")),
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      imageAssetId: idSchema,
      ownerUserIds: arrayOf(idSchema),
      notes: stringSchema,
      conditions: arrayOf({ type: "object", additionalProperties: true }),
      auras: arrayOf({ type: "object", additionalProperties: true }),
      targetedByUserIds: arrayOf(idSchema),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  TokenCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: idSchema,
      actorId: idSchema,
      name: stringSchema,
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 0 },
      height: { type: "number", minimum: 0 },
      rotation: { type: "number" },
      elevation: { type: "number", minimum: -1000000, maximum: 1000000, description: "Vertical position in game-world feet." },
      layer: { type: "string", enum: ["map", "player", "gm"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      visionEnabled: { type: "boolean" },
      visionRadius: { type: "number", minimum: 0 },
      brightVisionRadius: { type: "number", minimum: 0 },
      dimVisionRadius: { type: "number", minimum: 0 },
      senses: arrayOf(schemaRef("TokenSense")),
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      imageAssetId: idSchema,
      ownerUserIds: arrayOf(idSchema),
      notes: stringSchema,
      conditions: arrayOf({ type: "object", additionalProperties: true }),
      auras: arrayOf({ type: "object", additionalProperties: true }),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  TokenPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      actorId: idSchema,
      name: stringSchema,
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", minimum: 0 },
      height: { type: "number", minimum: 0 },
      rotation: { type: "number" },
      elevation: { type: "number", minimum: -1000000, maximum: 1000000, description: "Vertical position in game-world feet." },
      layer: { type: "string", enum: ["map", "player", "gm"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      visionEnabled: { type: "boolean" },
      visionRadius: { type: "number", minimum: 0 },
      brightVisionRadius: { type: ["number", "null"], minimum: 0 },
      dimVisionRadius: { type: ["number", "null"], minimum: 0 },
      senses: arrayOf(schemaRef("TokenSense")),
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      imageAssetId: idSchema,
      ownerUserIds: arrayOf(idSchema),
      notes: stringSchema,
      conditions: arrayOf({ type: "object", additionalProperties: true }),
      auras: arrayOf({ type: "object", additionalProperties: true }),
      targetedByUserIds: arrayOf(idSchema),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  ChatMessage: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "userId",
      "type",
      "body",
      "visibility",
      "recipientUserIds",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      sceneId: idSchema,
      userId: idSchema,
      type: {
        type: "string",
        enum: [
          "plain",
          "emote",
          "whisper",
          "roll",
          "system",
          "gm",
          "ooc",
          "ai",
          "plugin",
        ],
      },
      body: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      recipientUserIds: arrayOf(idSchema),
      rollId: idSchema,
      replyToMessageId: idSchema,
      moderationStatus: {
        type: "string",
        enum: ["open", "follow_up", "reviewed"],
      },
      moderatedByUserId: idSchema,
      moderatedAt: { type: "string", format: "date-time" },
      editedByUserId: idSchema,
      editedAt: { type: "string", format: "date-time" },
    },
  },
  ChatMessagePage: paginatedObjectOf(schemaRef("ChatMessage")),
  ChatMessageCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "body"],
    properties: {
      campaignId: idSchema,
      sceneId: idSchema,
      type: {
        type: "string",
        enum: [
          "plain",
          "emote",
          "whisper",
          "roll",
          "system",
          "gm",
          "ooc",
          "ai",
          "plugin",
        ],
      },
      body: chatMessageBodySchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      recipientUserIds: arrayOf(idSchema),
      rollId: idSchema,
      replyToMessageId: idSchema,
    },
  },
  ChatModerationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["moderationStatus"],
    properties: {
      moderationStatus: {
        type: "string",
        enum: ["open", "follow_up", "reviewed"],
      },
    },
  },
  ChatMessageEditRequest: {
    type: "object",
    additionalProperties: false,
    required: ["body"],
    properties: {
      body: chatMessageBodySchema,
    },
  },
  DiceRoll: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "userId",
      "formula",
      "visibility",
      "terms",
      "total",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      formula: stringSchema,
      label: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      terms: arrayOf(schemaRef("DiceRollTerm")),
      total: { type: "number" },
      fairness: schemaRef("DiceRollFairness"),
    },
  },
  DiceRollFairness: {
    type: "object",
    description: "Legacy-named deterministic replay metadata. The server seed, its hash, and the result are recorded together, so this verifies replay consistency but is not a witnessed pre-roll commitment or proof of host seed fairness.",
    additionalProperties: false,
    required: ["algorithm", "serverSeed", "serverSeedHash"],
    properties: {
      algorithm: { type: "string", enum: ["xmur3-mulberry32"] },
      serverSeed: stringSchema,
      serverSeedHash: { type: "string", description: "Hash of the recorded server seed. It is stored with the seed and result, not published as a pre-roll commitment." },
      clientSeed: stringSchema,
    },
  },
  DiceRollVerification: {
    type: "object",
    additionalProperties: false,
    required: ["rollId", "formula", "verified", "expected"],
    properties: {
      rollId: idSchema,
      formula: stringSchema,
      verified: { type: "boolean" },
      reason: {
        type: "string",
        enum: [
          "fairness_unavailable",
          "unsupported_algorithm",
          "seed_hash_mismatch",
          "formula_unparseable",
          "source_roll_unavailable",
          "reroll_link_mismatch",
          "result_mismatch",
        ],
      },
      fairness: schemaRef("DiceRollFairness"),
      expected: {
        type: "object",
        additionalProperties: false,
        required: ["total"],
        properties: { total: { type: "number" } },
      },
      recomputed: {
        type: "object",
        additionalProperties: false,
        required: ["total"],
        properties: { total: { type: "number" } },
      },
    },
  },
  DiceRollPage: paginatedObjectOf(schemaRef("DiceRoll")),
  DiceRollTerm: {
    type: "object",
    additionalProperties: true,
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["die", "modifier", "binding"] },
      sign: { type: "integer", enum: [-1] },
      sides: { type: "integer", minimum: 1 },
      count: { type: "integer", minimum: 1 },
      results: arrayOf({ type: "integer" }),
      kept: arrayOf({ type: "integer" }),
      exploded: arrayOf({ type: "integer" }),
      keep: { type: "string", enum: ["highest", "lowest"] },
      keepCount: { type: "integer", minimum: 0 },
      drop: { type: "string", enum: ["highest", "lowest"] },
      dropCount: { type: "integer", minimum: 0 },
      reroll: { type: "integer", minimum: 1 },
      rerolled: arrayOf({ type: "integer" }),
      value: { type: "number" },
      path: stringSchema,
    },
  },
  DiceRollRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "formula"],
    properties: {
      campaignId: idSchema,
      formula: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      label: stringSchema,
      clientSeed: stringSchema,
    },
  },
  MapAsset: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "name",
      "url",
      "mimeType",
      "sizeBytes",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      url: stringSchema,
      mimeType: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      checksum: stringSchema,
      folder: stringSchema,
      tags: arrayOf(stringSchema),
      storage: schemaRef("AssetStorageRef"),
      lifecycle: schemaRef("AssetLifecycle"),
      security: schemaRef("AssetSecurityScan"),
      image: schemaRef("AssetImageMetadata"),
      renditions: arrayOf(schemaRef("AssetRendition")),
    },
  },
  AssetImageMetadata: {
    type: "object",
    additionalProperties: false,
    required: ["width", "height"],
    properties: {
      width: { type: "integer", minimum: 1 },
      height: { type: "integer", minimum: 1 },
      animated: { type: "boolean" },
    },
  },
  AssetRendition: {
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "mimeType",
      "sizeBytes",
      "checksum",
      "width",
      "height",
      "storage",
      "createdAt",
    ],
    properties: {
      kind: { type: "string", enum: ["thumbnail", "optimized"] },
      mimeType: { type: "string", enum: ["image/webp"] },
      sizeBytes: { type: "integer", minimum: 0 },
      checksum: stringSchema,
      width: { type: "integer", minimum: 1 },
      height: { type: "integer", minimum: 1 },
      storage: schemaRef("AssetStorageRef"),
      createdAt: { type: "string", format: "date-time" },
    },
  },
  AssetStorageRef: {
    type: "object",
    additionalProperties: false,
    required: ["provider", "key"],
    properties: {
      provider: { type: "string", enum: ["local", "s3"] },
      key: stringSchema,
      bucket: stringSchema,
    },
  },
  AssetLifecycle: {
    type: "object",
    additionalProperties: true,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["active", "archived", "deleted"] },
      expiresAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      updatedByUserId: idSchema,
      reason: stringSchema,
      storageDeletedAt: { type: "string", format: "date-time" },
      cleanupReason: stringSchema,
    },
  },
  AssetSecurityScan: {
    type: "object",
    additionalProperties: true,
    required: ["status", "scanner", "scannedAt", "findings"],
    properties: {
      status: { type: "string", enum: ["clean"] },
      scanner: stringSchema,
      scannedAt: { type: "string", format: "date-time" },
      findings: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  MapAssetCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["sizeBytes"],
    properties: {
      name: stringSchema,
      url: stringSchema,
      mimeType: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      checksum: stringSchema,
      folder: stringSchema,
      tags: arrayOf(stringSchema),
    },
  },
  MapAssetPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      folder: { anyOf: [stringSchema, { type: "null" }] },
      tags: { anyOf: [arrayOf(stringSchema), stringSchema] },
    },
  },
  AssetUploadResponse: {
    type: "object",
    additionalProperties: false,
    required: ["asset"],
    properties: {
      asset: schemaRef("MapAsset"),
      scene: schemaRef("Scene"),
      deduplicated: { type: "boolean" },
      renditionWarnings: arrayOf(schemaRef("AssetRenditionWarning")),
    },
  },
  AssetRenditionWarning: {
    type: "object",
    additionalProperties: false,
    required: ["code", "message"],
    properties: {
      code: {
        type: "string",
        enum: ["unsupported_mime", "invalid_image", "rendition_failed"],
      },
      message: stringSchema,
    },
  },
  AssetDeliveryUrlRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      expiresInSeconds: { type: "integer", minimum: 1 },
      disposition: { type: "string", enum: ["inline", "attachment"] },
    },
  },
  AssetDeliveryUrlResponse: {
    type: "object",
    additionalProperties: true,
    required: ["url", "expiresAt"],
    properties: {
      url: stringSchema,
      expiresAt: { type: "string", format: "date-time" },
      disposition: { type: "string", enum: ["inline", "attachment"] },
    },
  },
  AssetLifecyclePatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["active", "archived", "deleted"] },
      expiresAt: {
        anyOf: [{ type: "string", format: "date-time" }, { type: "null" }],
      },
      reason: stringSchema,
    },
  },
  CampaignAssetStorageInfo: {
    type: "object",
    additionalProperties: true,
    required: [
      "campaignId",
      "assetCount",
      "activeAssetCount",
      "usedBytes",
      "allBytes",
      "lifecycleCounts",
      "providerCounts",
      "delivery",
      "largestAssets",
    ],
    properties: {
      campaignId: idSchema,
      assetCount: { type: "integer", minimum: 0 },
      activeAssetCount: { type: "integer", minimum: 0 },
      usedBytes: { type: "integer", minimum: 0 },
      allBytes: { type: "integer", minimum: 0 },
      quotaBytes: { type: "integer", minimum: 0 },
      remainingBytes: { type: "integer", minimum: 0 },
      lifecycleCounts: looseObjectSchema,
      providerCounts: looseObjectSchema,
      delivery: {
        type: "object",
        additionalProperties: true,
        required: [
          "mode",
          "cdnConfigured",
          "publicUrlConfigured",
          "signingSecretConfigured",
          "signingSecretRequired",
          "defaultTtlSeconds",
          "maxTtlSeconds",
          "purgeWebhookConfigured",
          "purgeWebhookTokenConfigured",
          "purgeTimeoutMs",
          "actionRequired",
          "actionReasons",
          "warnings",
          "posture",
        ],
        properties: {
          mode: stringSchema,
          cdnConfigured: { type: "boolean" },
          publicUrlConfigured: { type: "boolean" },
          signingSecretConfigured: { type: "boolean" },
          signingSecretRequired: { type: "boolean" },
          defaultTtlSeconds: { type: "integer", minimum: 1 },
          maxTtlSeconds: { type: "integer", minimum: 1 },
          purgeWebhookConfigured: { type: "boolean" },
          purgeWebhookTokenConfigured: { type: "boolean" },
          purgeTimeoutMs: { type: "integer", minimum: 0 },
          actionRequired: { type: "boolean" },
          actionReasons: arrayOf(stringSchema),
          warnings: arrayOf(looseObjectSchema),
          posture: looseObjectSchema,
        },
      },
      largestAssets: arrayOf(looseObjectSchema),
    },
  },
  Actor: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "systemId",
      "type",
      "name",
      "data",
      "permissions",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      systemId: idSchema,
      ownerUserId: idSchema,
      type: stringSchema,
      name: stringSchema,
      imageAssetId: idSchema,
      data: { type: "object", additionalProperties: true },
      permissions: {
        type: "object",
        additionalProperties: arrayOf(stringSchema),
      },
    },
  },
  ActorCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: idSchema,
      systemId: idSchema,
      ownerUserId: idSchema,
      type: stringSchema,
      name: stringSchema,
      imageAssetId: idSchema,
      data: { type: "object", additionalProperties: true },
      permissions: {
        type: "object",
        additionalProperties: arrayOf(stringSchema),
      },
    },
  },
  ActorPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      manualOverrideReason: { type: "string", maxLength: 500 },
      worldId: idSchema,
      systemId: idSchema,
      ownerUserId: idSchema,
      type: stringSchema,
      name: stringSchema,
      imageAssetId: idSchema,
      data: { type: "object", additionalProperties: true },
      permissions: {
        type: "object",
        additionalProperties: arrayOf(stringSchema),
      },
    },
  },
  Dnd5eSrdConcentrationEndRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      prepare: { type: "boolean" },
      preparedPreviewKey: stringSchema,
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedCombatUpdatedAt: schemaRef("DndRulesRevisionMap"),
      reason: { type: "string", maxLength: 500 },
    },
  },
  Dnd5eSrdConcentrationEndResponse: {
    type: "object",
    additionalProperties: false,
    required: ["actor", "concentrationEnded"],
    properties: {
      actor: schemaRef("Actor"),
      concentrationEnded: { type: "boolean", enum: [true] },
      status: { type: "string", enum: ["ready"] },
      review: { type: "object", additionalProperties: true },
      preparation: {
        type: "object",
        additionalProperties: false,
        required: ["preparedPreviewKey", "actorId", "request", "revisions", "resolutionHash"],
        properties: {
          preparedPreviewKey: stringSchema,
          actorId: idSchema,
          request: { type: "object", additionalProperties: true },
          revisions: {
            type: "object",
            additionalProperties: false,
            required: ["actorUpdatedAt", "combatUpdatedAt"],
            properties: {
              actorUpdatedAt: schemaRef("DndRulesRevisionMap"),
              combatUpdatedAt: schemaRef("DndRulesRevisionMap"),
            },
          },
          resolutionHash: stringSchema,
        },
      },
      updatedActors: arrayOf(schemaRef("Actor")),
      updatedCombats: arrayOf(schemaRef("Combat")),
      rulesMutationId: idSchema,
      undo: schemaRef("DndRulesMutationUndoDescriptor"),
    },
  },
  Item: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "systemId",
      "type",
      "name",
      "data",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      systemId: idSchema,
      actorId: idSchema,
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  ItemCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: idSchema,
      systemId: idSchema,
      actorId: idSchema,
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  ItemPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      manualOverrideReason: { type: "string", maxLength: 500 },
      worldId: { anyOf: [idSchema, { type: "null" }] },
      actorId: { anyOf: [idSchema, { type: "null" }] },
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  JournalEntityLink: {
    type: "object",
    additionalProperties: false,
    required: ["id", "targetType", "targetId"],
    properties: {
      id: idSchema,
      targetType: {
        type: "string",
        enum: ["actor", "scene", "item", "journal", "handout", "encounter"],
      },
      targetId: idSchema,
      label: { type: "string", maxLength: 120 },
    },
  },
  JournalEntityLinkInput: {
    type: "object",
    additionalProperties: false,
    required: ["targetType", "targetId"],
    properties: {
      id: idSchema,
      targetType: {
        type: "string",
        enum: ["actor", "scene", "item", "journal", "handout", "encounter"],
      },
      targetId: idSchema,
      label: { type: "string", maxLength: 120 },
    },
  },
  JournalEntryRevision: {
    type: "object",
    additionalProperties: false,
    required: ["id", "revision", "kind", "title", "body", "visibility", "visibleToUserIds", "visibleToActorIds", "tags", "links", "canonStatus", "changedBy", "createdAt"],
    properties: {
      id: idSchema,
      revision: { type: "integer", minimum: 1 },
      kind: { type: "string", enum: ["folder", "entry"] },
      parentId: idSchema,
      title: stringSchema,
      body: stringSchema,
      visibility: { type: "string", enum: ["gm_only", "public", "specific_players", "specific_characters"] },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      links: arrayOf(schemaRef("JournalEntityLink")),
      canonStatus: { type: "string", enum: ["draft", "in_review", "canonical", "rejected"] },
      changedBy: idSchema,
      createdAt: { type: "string", format: "date-time" },
    },
  },
  JournalBacklink: {
    type: "object",
    additionalProperties: false,
    required: ["sourceEntryId", "sourceTitle", "link"],
    properties: {
      sourceEntryId: idSchema,
      sourceTitle: stringSchema,
      link: schemaRef("JournalEntityLink"),
    },
  },
  JournalBacklinksResponse: {
    type: "object",
    additionalProperties: false,
    required: ["entryId", "backlinks"],
    properties: {
      entryId: idSchema,
      backlinks: arrayOf(schemaRef("JournalBacklink")),
    },
  },
  JournalHistoryResponse: {
    type: "object",
    additionalProperties: false,
    required: ["entryId", "currentRevision", "revisions"],
    properties: {
      entryId: idSchema,
      currentRevision: { type: "integer", minimum: 1 },
      revisions: arrayOf(schemaRef("JournalEntryRevision")),
    },
  },
  JournalCanonReviewRequest: {
    type: "object",
    additionalProperties: false,
    required: ["status", "expectedUpdatedAt"],
    properties: {
      status: { type: "string", enum: ["draft", "in_review", "canonical", "rejected"] },
      note: { type: "string", maxLength: 500 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  JournalEntry: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "kind",
      "title",
      "body",
      "visibility",
      "visibleToUserIds",
      "visibleToActorIds",
      "tags",
      "links",
      "revision",
      "canonStatus",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      parentId: idSchema,
      kind: { type: "string", enum: ["folder", "entry"] },
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      links: arrayOf(schemaRef("JournalEntityLink")),
      revision: { type: "integer", minimum: 1 },
      canonStatus: { type: "string", enum: ["draft", "in_review", "canonical", "rejected"] },
      canonReviewedBy: idSchema,
      canonReviewedAt: { type: "string", format: "date-time" },
      canonReviewNote: { type: "string", maxLength: 500 },
      createdBy: idSchema,
      updatedBy: idSchema,
    },
  },
  JournalEntryCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { anyOf: [idSchema, { type: "null" }] },
      parentId: { anyOf: [idSchema, { type: "null" }] },
      kind: { type: "string", enum: ["folder", "entry"] },
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      links: { type: "array", maxItems: 100, items: schemaRef("JournalEntityLinkInput") },
    },
  },
  JournalEntryPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      worldId: { anyOf: [idSchema, { type: "null" }] },
      parentId: { anyOf: [idSchema, { type: "null" }] },
      kind: { type: "string", enum: ["folder", "entry"] },
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      links: { type: "array", maxItems: 100, items: schemaRef("JournalEntityLinkInput") },
    },
  },
  Handout: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "title",
      "body",
      "visibility",
      "visibleToUserIds",
      "visibleToActorIds",
      "assetIds",
      "tags",
      "readByUserIds",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      assetIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      readByUserIds: arrayOf(idSchema),
      createdBy: idSchema,
      updatedBy: idSchema,
    },
  },
  HandoutWriteRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { anyOf: [idSchema, { type: "null" }] },
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      assetIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      readByUserIds: arrayOf(idSchema),
    },
  },
  HandoutPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      worldId: { anyOf: [idSchema, { type: "null" }] },
      title: stringSchema,
      body: stringSchema,
      visibility: {
        type: "string",
        enum: ["gm_only", "public", "specific_players", "specific_characters"],
      },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      assetIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      readByUserIds: arrayOf(idSchema),
    },
  },
  CombatEnvironmentMechanicSchedule: {
    type: "object",
    additionalProperties: false,
    required: ["timing", "startsAtRound", "intervalRounds"],
    properties: {
      timing: { type: "string", enum: ["initiative_count", "round_start", "round_end", "manual"] },
      initiativeCount: { type: "number", minimum: -1000, maximum: 1000 },
      startsAtRound: { type: "integer", minimum: 1, maximum: 1_000_000 },
      intervalRounds: { type: "integer", minimum: 1, maximum: 1_000_000 },
    },
  },
  CombatEnvironmentMechanicOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "description"],
    properties: {
      id: idSchema,
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 1_000 },
    },
  },
  CombatEnvironmentMechanic: {
    type: "object",
    additionalProperties: false,
    required: ["id", "kind", "name", "description", "visibility", "enabled", "schedule", "options", "triggerCount", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      kind: { type: "string", enum: ["lair_action", "regional_effect"] },
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 2_000 },
      visibility: { type: "string", enum: ["public", "gm_only"] },
      enabled: { type: "boolean" },
      schedule: schemaRef("CombatEnvironmentMechanicSchedule"),
      options: { type: "array", maxItems: 20, items: schemaRef("CombatEnvironmentMechanicOption") },
      triggerCount: { type: "integer", minimum: 0 },
      lastTriggeredRound: { type: "integer", minimum: 1 },
      lastTriggeredAt: { type: "string", format: "date-time" },
      lastOptionId: idSchema,
    },
  },
  CombatEnvironmentMechanicTrigger: {
    type: "object",
    additionalProperties: false,
    required: ["id", "mechanicId", "mechanicKind", "mechanicName", "round", "turnIndex", "summary", "visibility", "triggeredByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      mechanicId: idSchema,
      mechanicKind: { type: "string", enum: ["lair_action", "regional_effect"] },
      mechanicName: { type: "string", minLength: 1, maxLength: 120 },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      optionId: idSchema,
      optionName: { type: "string", minLength: 1, maxLength: 120 },
      summary: { type: "string", minLength: 1, maxLength: 1_000 },
      visibility: { type: "string", enum: ["public", "gm_only"] },
      triggeredByUserId: idSchema,
    },
  },
  RulesEffectScheduleEvent: {
    type: "object",
    additionalProperties: false,
    required: ["id", "effectId", "actorId", "label", "phase", "round", "turnIndex", "status", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      effectId: idSchema,
      actorId: idSchema,
      label: stringSchema,
      phase: { type: "string", enum: ["start_turn", "end_turn", "start_round", "end_round", "initiative_count", "time", "manual"] },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      status: { type: "string", enum: ["triggered", "save_required", "save_succeeded", "save_failed", "expired"] },
      saveAbility: stringSchema,
      saveDc: { type: "number" },
      outcome: { type: "string", enum: ["success", "failure"] },
    },
  },
  CombatEnvironmentMechanicMutationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      kind: { type: "string", enum: ["lair_action", "regional_effect"] },
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 2_000 },
      visibility: { type: "string", enum: ["public", "gm_only"] },
      enabled: { type: "boolean" },
      schedule: schemaRef("CombatEnvironmentMechanicSchedule"),
      options: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description"],
          properties: {
            id: idSchema,
            name: { type: "string", minLength: 1, maxLength: 120 },
            description: { type: "string", minLength: 1, maxLength: 1_000 },
          },
        },
      },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CombatEnvironmentMechanicTriggerRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      optionId: idSchema,
      summary: { type: "string", minLength: 1, maxLength: 1_000 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CombatEffectScheduleRequest: {
    type: "object",
    additionalProperties: false,
    required: ["phase"],
    properties: {
      phase: { type: "string", enum: ["start_turn", "end_turn", "start_round", "end_round", "initiative_count", "time", "manual"] },
      now: { type: "string", format: "date-time" },
      saveOutcomes: {
        type: "object",
        maxProperties: 100,
        additionalProperties: { type: "string", enum: ["success", "failure"] },
      },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      prepare: { type: "boolean" },
    },
  },
  CombatEffectScheduleAdvanceRequest: {
    type: "object",
    additionalProperties: false,
    required: ["preparedPreviewKey", "expectedUpdatedAt"],
    properties: {
      preparedPreviewKey: stringSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CombatEffectScheduleEvaluation: {
    type: "object",
    additionalProperties: false,
    required: ["phase", "round", "turnIndex", "events", "actorChanges", "unresolvedEventIds", "canApply", "combatUpdatedAt"],
    properties: {
      phase: { type: "string", enum: ["start_turn", "end_turn", "start_round", "end_round", "initiative_count", "time", "manual"] },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      events: arrayOf(schemaRef("RulesEffectScheduleEvent")),
      actorChanges: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["actorId", "reason"],
        properties: { actorId: idSchema, reason: stringSchema },
      }),
      unresolvedEventIds: arrayOf(idSchema),
      canApply: { type: "boolean" },
      combatUpdatedAt: { type: "string", format: "date-time" },
      preparedPreviewKey: stringSchema,
      preparation: {
        type: "object",
        additionalProperties: false,
        required: ["preparedPreviewKey", "combatId", "request", "revisions", "resolutionHash"],
        properties: {
          preparedPreviewKey: stringSchema,
          combatId: idSchema,
          request: { type: "object", additionalProperties: true },
          revisions: {
            type: "object",
            additionalProperties: false,
            required: ["combatUpdatedAt", "actorUpdatedAt"],
            properties: {
              combatUpdatedAt: { type: "string", format: "date-time" },
              actorUpdatedAt: schemaRef("DndRulesRevisionMap"),
            },
          },
          resolutionHash: stringSchema,
        },
      },
    },
  },
  CombatEffectScheduleAdvanceResponse: {
    type: "object",
    additionalProperties: false,
    required: ["combat", "evaluation", "rulesMutationId", "undo"],
    properties: {
      combat: schemaRef("Combat"),
      evaluation: schemaRef("CombatEffectScheduleEvaluation"),
      rulesMutationId: idSchema,
      undo: schemaRef("DndRulesMutationUndoDescriptor"),
    },
  },
  Dnd5eSpellHelperPreviewRequest: {
    type: "object",
    additionalProperties: false,
    required: ["casterActorId", "spellId", "targetActorIds", "slotLevel"],
    properties: {
      casterActorId: idSchema,
      spellId: idSchema,
      targetActorIds: { type: "array", maxItems: 100, uniqueItems: true, items: idSchema },
      slotLevel: { type: "integer", minimum: 1, maximum: 9 },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          roundsHeld: { type: "integer", minimum: 0, maximum: 10 },
          dartAssignments: { type: "object", maxProperties: 100, additionalProperties: { type: "integer", minimum: 0, maximum: 100 } },
        },
      },
    },
  },
  Dnd5eSpellHelperRoll: {
    type: "object",
    additionalProperties: false,
    required: ["label", "formula"],
    properties: {
      label: stringSchema,
      formula: stringSchema,
      targetActorId: idSchema,
      save: {
        type: "object",
        additionalProperties: false,
        required: ["ability"],
        properties: { ability: stringSchema, success: stringSchema },
      },
    },
  },
  Dnd5eSpellHelperPreview: {
    type: "object",
    additionalProperties: false,
    required: ["spellId", "spellName", "supported", "automation", "summary", "rolls", "scheduleTemplates", "manualSteps", "warnings"],
    properties: {
      spellId: idSchema,
      spellName: stringSchema,
      supported: { type: "boolean" },
      automation: { type: "string", enum: ["preview_only", "schedule_template", "manual"] },
      summary: stringSchema,
      targetLimit: { type: "integer", minimum: 0 },
      rolls: arrayOf(schemaRef("Dnd5eSpellHelperRoll")),
      scheduleTemplates: arrayOf({ type: "object", additionalProperties: true }),
      manualSteps: arrayOf(stringSchema),
      warnings: arrayOf(stringSchema),
    },
  },
  Dnd5eSpellHelperPreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["preview", "source"],
    properties: {
      preview: schemaRef("Dnd5eSpellHelperPreview"),
      source: {
        type: "object",
        additionalProperties: false,
        required: ["id", "provenance"],
        properties: { id: idSchema, provenance: { type: "object", additionalProperties: true } },
      },
    },
  },
  Combat: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "active",
      "round",
      "turnIndex",
      "combatants",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      encounterId: idSchema,
      active: { type: "boolean" },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      manualTurnOrder: { type: "boolean" },
      combatants: arrayOf(schemaRef("Combatant")),
      actions: arrayOf(schemaRef("CombatAction")),
      rewards: arrayOf(schemaRef("CombatReward")),
      environmentMechanics: arrayOf(schemaRef("CombatEnvironmentMechanic")),
      environmentMechanicTriggers: arrayOf(schemaRef("CombatEnvironmentMechanicTrigger")),
      effectScheduleEvents: arrayOf(schemaRef("RulesEffectScheduleEvent")),
    },
  },
  CombatReward: {
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "combatId",
      "awardedByUserId",
      "recipientActorIds",
      "totalXp",
      "xpPerActor",
      "unallocatedXp",
      "totalGp",
      "gpPerActor",
      "unallocatedGp",
      "loot",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      combatId: idSchema,
      awardedByUserId: idSchema,
      recipientActorIds: arrayOf(idSchema),
      totalXp: { type: "integer", minimum: 0 },
      xpPerActor: { type: "integer", minimum: 0 },
      unallocatedXp: { type: "integer", minimum: 0 },
      totalGp: { type: "integer", minimum: 0 },
      gpPerActor: { type: "integer", minimum: 0 },
      unallocatedGp: { type: "integer", minimum: 0 },
      loot: arrayOf(stringSchema),
      lootItemIds: arrayOf(idSchema),
      note: stringSchema,
    },
  },
  Combatant: {
    type: "object",
    additionalProperties: true,
    required: ["id", "tokenId", "name", "initiative", "defeated"],
    properties: {
      id: idSchema,
      tokenId: idSchema,
      actorId: idSchema,
      hidden: { type: "boolean" },
      surprised: { type: "boolean" },
      name: stringSchema,
      initiative: { type: "number" },
      defeated: { type: "boolean" },
      readiness: { type: "string", enum: ["normal", "ready", "delayed"] },
      conditions: arrayOf(stringSchema),
      deathSaveSuccesses: { type: "integer", minimum: 0, maximum: 3 },
      deathSaveFailures: { type: "integer", minimum: 0, maximum: 3 },
      deathSaveOutcome: { type: "string", enum: ["stable", "dead"] },
      resourceKey: stringSchema,
      resourceLabel: stringSchema,
      resourceUsed: { type: "boolean" },
      resourceSpent: { type: "boolean" },
    },
  },
  CombatAction: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "combatId",
      "actorId",
      "actorName",
      "requestedByUserId",
      "status",
      "rollId",
      "actionLabel",
      "targetActorIds",
      "applyEffect",
      "consumeResources",
      "rolls",
      "actorUpdates",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      combatId: idSchema,
      actorId: idSchema,
      actorName: stringSchema,
      requestedByUserId: idSchema,
      status: {
        type: "string",
        enum: ["pending_gm", "confirmed", "rejected", "failed"],
      },
      rollId: stringSchema,
      actionLabel: stringSchema,
      targetActorIds: arrayOf(idSchema),
      applyEffect: { type: "boolean" },
      consumeResources: { type: "boolean" },
      preparedPreviewKey: stringSchema,
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedItemUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedCombatUpdatedAt: { type: "string", format: "date-time" },
      resolution: { type: "object", additionalProperties: true },
      rolls: arrayOf(schemaRef("CombatActionRoll")),
      actorUpdates: arrayOf(schemaRef("CombatActionActorUpdate")),
      itemUpdates: arrayOf(schemaRef("CombatActionItemUpdate")),
      effects: arrayOf(schemaRef("CombatActionEffect")),
      resultSummary: stringSchema,
      confirmedByUserId: idSchema,
      confirmedAt: { type: "string", format: "date-time" },
      rejectedByUserId: idSchema,
      rejectedAt: { type: "string", format: "date-time" },
      rejectionReason: stringSchema,
      failureReason: stringSchema,
    },
  },
  CombatActionRoll: {
    type: "object",
    additionalProperties: true,
    required: ["label", "formula", "terms", "total", "visibility"],
    properties: {
      label: stringSchema,
      formula: stringSchema,
      terms: arrayOf({ type: "object", additionalProperties: true }),
      total: { type: "number" },
      fairness: schemaRef("DiceRollFairness"),
      targetActorId: idSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
    },
  },
  CombatActionActorUpdate: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "before", "after"],
    properties: {
      actorId: idSchema,
      before: { type: "object", additionalProperties: true },
      after: { type: "object", additionalProperties: true },
    },
  },
  CombatActionItemUpdate: {
    type: "object",
    additionalProperties: false,
    required: ["itemId", "before", "after"],
    properties: {
      itemId: idSchema,
      before: { type: "object", additionalProperties: true },
      after: { type: "object", additionalProperties: true },
    },
  },
  CombatActionEffect: {
    type: "object",
    additionalProperties: true,
    required: ["type", "targetActorId"],
    properties: {
      type: stringSchema,
      targetActorId: idSchema,
      amount: { type: "number" },
    },
  },
  CombatActionMutationResponse: {
    type: "object",
    additionalProperties: true,
    required: ["combat", "combatAction"],
    properties: {
      combat: schemaRef("Combat"),
      combatAction: schemaRef("CombatAction"),
      updatedActors: arrayOf(schemaRef("Actor")),
      rolls: arrayOf(schemaRef("DiceRoll")),
      chatMessages: arrayOf(schemaRef("ChatMessage")),
      rulesMutationId: idSchema,
      undo: schemaRef("DndRulesMutationUndoDescriptor"),
    },
  },
  CombatActionConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedItemUpdatedAt: schemaRef("DndRulesRevisionMap"),
    },
  },
  CombatInitiativeRollNpcsResponse: {
    type: "object",
    additionalProperties: false,
    required: ["combat", "rolls", "chatMessages"],
    properties: {
      combat: schemaRef("Combat"),
      rolls: arrayOf(schemaRef("DiceRoll")),
      chatMessages: arrayOf(schemaRef("ChatMessage")),
    },
  },
  CombatActionRejectRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: stringSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CombatRewardCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      recipientActorIds: { type: "array", maxItems: 100, uniqueItems: true, items: idSchema },
      totalXp: { type: "integer", minimum: 0, maximum: 1_000_000_000 },
      totalGp: { type: "integer", minimum: 0, maximum: 1_000_000_000 },
      loot: { type: "array", maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } },
      note: { type: "string", maxLength: 1_000 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: {
        type: "object",
        maxProperties: 100,
        additionalProperties: { type: "string", format: "date-time" },
      },
    },
  },
  CombatRewardMutationResponse: {
    type: "object",
    additionalProperties: false,
    required: ["combat", "actors", "reward"],
    properties: {
      combat: schemaRef("Combat"),
      actors: arrayOf(schemaRef("Actor")),
      reward: schemaRef("CombatReward"),
    },
  },
  DndInventoryOwnerRef: {
    oneOf: [
      { type: "object", additionalProperties: false, required: ["kind", "actorId"], properties: { kind: { type: "string", enum: ["actor"] }, actorId: idSchema } },
      { type: "object", additionalProperties: false, required: ["kind", "stashId"], properties: { kind: { type: "string", enum: ["party_stash"] }, stashId: idSchema } },
    ],
  },
  DndInventoryOverviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "campaignUpdatedAt", "actorItems", "partyStashItems", "merchants", "lootItems", "warnings"],
    properties: {
      campaignId: idSchema,
      campaignUpdatedAt: { type: "string", format: "date-time" },
      actor: schemaRef("Actor"),
      actorItems: arrayOf(schemaRef("Item")),
      actorSummary: { type: "object", additionalProperties: true },
      partyStash: schemaRef("Item"),
      partyStashItems: arrayOf(schemaRef("Item")),
      partyStashSummary: { type: "object", additionalProperties: true },
      merchants: arrayOf(schemaRef("Item")),
      lootItems: arrayOf(schemaRef("Item")),
      warnings: arrayOf(stringSchema),
    },
  },
  DndPartyStashCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedCampaignUpdatedAt"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      capacityLb: { type: "number", exclusiveMinimum: 0, maximum: 10_000_000 },
      currency: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndMerchantCatalogEntry: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: idSchema,
      name: { type: "string", minLength: 1, maxLength: 160 },
      type: { type: "string", minLength: 1, maxLength: 80 },
      unitPriceGp: { type: "number", minimum: 0, maximum: 10_000_000 },
      sellPriceGp: { type: "number", minimum: 0, maximum: 10_000_000 },
      availableQuantity: { type: "integer", minimum: 0, maximum: 999_999 },
      compendiumEntryId: idSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  DndMerchantMutationRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", maxLength: 1_000 },
      buybackRate: { type: "number", minimum: 0, maximum: 1 },
      currency: { anyOf: [{ type: "object", additionalProperties: { type: "integer", minimum: 0 } }, { type: "null" }] },
      catalog: { type: "array", maxItems: 200, items: schemaRef("DndMerchantCatalogEntry") },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndInventoryItemPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "expectedOwnerUpdatedAt"],
    properties: {
      quantity: { type: "integer", minimum: 0, maximum: 999_999 },
      weightLb: { type: "number", minimum: 0, maximum: 1_000_000 },
      parentItemId: { anyOf: [idSchema, { type: "null" }] },
      containerCapacityLb: { anyOf: [{ type: "number", exclusiveMinimum: 0, maximum: 1_000_000 }, { type: "null" }] },
      extradimensional: { type: "boolean" },
      ammunitionSourceItemId: { anyOf: [idSchema, { type: "null" }] },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedOwnerUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndInventoryTransferRequest: {
    type: "object",
    additionalProperties: false,
    required: ["quantity", "destination", "expectedUpdatedAt", "expectedSourceUpdatedAt", "expectedDestinationUpdatedAt"],
    properties: {
      quantity: { type: "integer", minimum: 1, maximum: 999_999 },
      destination: schemaRef("DndInventoryOwnerRef"),
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedSourceUpdatedAt: { type: "string", format: "date-time" },
      expectedDestinationUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndInventoryAmmunitionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "expectedAmmunitionUpdatedAt", "expectedActorUpdatedAt"],
    properties: {
      ammunitionItemId: idSchema,
      amount: { type: "integer", minimum: 1, maximum: 999_999 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedAmmunitionUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndMerchantCommerceRequest: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "quantity", "expectedActorUpdatedAt", "expectedMerchantUpdatedAt"],
    properties: {
      actorId: idSchema,
      catalogEntryId: idSchema,
      itemId: idSchema,
      quantity: { type: "integer", minimum: 1, maximum: 999_999 },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
      expectedMerchantUpdatedAt: { type: "string", format: "date-time" },
      expectedItemUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndCombatLootCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["stashId", "items", "expectedUpdatedAt", "expectedStashUpdatedAt"],
    properties: {
      stashId: idSchema,
      items: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true } },
      note: { type: "string", maxLength: 500 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedStashUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndLootClaimRequest: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "expectedUpdatedAt", "expectedStashUpdatedAt", "expectedActorUpdatedAt"],
    properties: {
      actorId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedStashUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndLootAssignmentRequest: {
    type: "object",
    additionalProperties: false,
    required: ["action", "expectedUpdatedAt", "expectedStashUpdatedAt", "expectedActorUpdatedAt"],
    properties: {
      action: { type: "string", enum: ["assign", "release"] },
      actorId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedStashUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CombatCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      encounterId: idSchema,
      manualTurnOrder: { type: "boolean" },
      combatants: arrayOf(schemaRef("Combatant")),
    },
  },
  CombatStartParticipantRequest: {
    type: "object",
    additionalProperties: false,
    required: ["tokenId", "initiativeMode"],
    properties: {
      tokenId: idSchema,
      initiativeMode: { type: "string", enum: ["manual", "server"] },
      initiative: { type: "number" },
      surprised: { type: "boolean" },
    },
  },
  CombatStartRequest: {
    type: "object",
    additionalProperties: false,
    required: ["sceneId", "participants"],
    properties: {
      sceneId: idSchema,
      participants: arrayOf(schemaRef("CombatStartParticipantRequest")),
      manualTurnOrder: { type: "boolean" },
    },
  },
  CombatStartResponse: {
    type: "object",
    additionalProperties: false,
    required: ["combat", "rolls", "chatMessages"],
    properties: {
      combat: schemaRef("Combat"),
      rolls: arrayOf(schemaRef("DiceRoll")),
      chatMessages: arrayOf(schemaRef("ChatMessage")),
    },
  },
  CombatPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      active: { type: "boolean" },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      manualTurnOrder: { type: "boolean" },
      combatants: arrayOf(schemaRef("Combatant")),
      saveOutcomes: {
        type: "object",
        additionalProperties: { type: "string", enum: ["success", "failure"] },
      },
    },
  },
  CombatantPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: idSchema,
      tokenId: idSchema,
      actorId: idSchema,
      hidden: { type: "boolean" },
      surprised: { type: "boolean" },
      name: stringSchema,
      initiative: { type: "number" },
      defeated: { type: "boolean" },
      readiness: { type: "string", enum: ["normal", "ready", "delayed"] },
      conditions: arrayOf(stringSchema),
      deathSaveSuccesses: { type: "integer", minimum: 0, maximum: 3 },
      deathSaveFailures: { type: "integer", minimum: 0, maximum: 3 },
      deathSaveOutcome: { type: "string", enum: ["stable", "dead"] },
      resourceKey: stringSchema,
      resourceLabel: stringSchema,
      resourceUsed: { type: "boolean" },
      resourceSpent: { type: "boolean" },
      syncActorSheet: { type: "boolean" },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  AuditLog: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "actorType",
      "action",
      "targetType",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      actorUserId: idSchema,
      actorType: { type: "string", enum: ["user", "ai", "plugin", "system"] },
      action: stringSchema,
      targetType: stringSchema,
      targetId: idSchema,
      before: {},
      after: {},
    },
  },
  AuditLogPage: paginatedObjectOf(schemaRef("AuditLog")),
  Proposal: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "createdByType",
      "title",
      "summary",
      "status",
      "changesJson",
      "diffJson",
      "approvalRequired",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      createdByUserId: idSchema,
      createdByType: { type: "string", enum: ["user", "ai", "plugin"] },
      sourceId: idSchema,
      title: stringSchema,
      summary: stringSchema,
      status: {
        type: "string",
        enum: [
          "draft",
          "pending",
          "approved",
          "rejected",
          "applied",
          "reverted",
        ],
      },
      changesJson: arrayOf(schemaRef("ProposalChange")),
      diffJson: { type: "object", additionalProperties: true },
      approvalRequired: { type: "boolean" },
      approvedByUserId: idSchema,
      appliedByUserId: idSchema,
      appliedAt: { type: "string", format: "date-time" },
      revertedByUserId: idSchema,
      revertedAt: { type: "string", format: "date-time" },
      inverseChangesJson: arrayOf(schemaRef("ProposalInverseChange")),
      revertGuardsJson: arrayOf(schemaRef("ProposalRevertGuard")),
      history: arrayOf(schemaRef("ProposalHistoryEntry")),
    },
  },
  ProposalHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: ["action", "status", "at", "actorType"],
    properties: {
      action: {
        type: "string",
        enum: [
          "created",
          "approved",
          "rejected",
          "applied",
          "reverted",
          "revised",
        ],
      },
      status: {
        type: "string",
        enum: [
          "draft",
          "pending",
          "approved",
          "rejected",
          "applied",
          "reverted",
        ],
      },
      previousStatus: {
        type: "string",
        enum: [
          "draft",
          "pending",
          "approved",
          "rejected",
          "applied",
          "reverted",
        ],
      },
      at: stringSchema,
      actorUserId: idSchema,
      actorType: {
        type: "string",
        enum: ["user", "ai", "plugin", "server_admin", "system"],
      },
      auditAction: stringSchema,
      note: stringSchema,
    },
  },
  ProposalChange: {
    type: "object",
    additionalProperties: false,
    required: ["entity", "action", "data"],
    properties: {
      entity: {
        type: "string",
        enum: [
          "campaign",
          "world",
          "scene",
          "token",
          "actor",
          "item",
          "journal",
          "handout",
          "chat",
          "roll",
          "diceMacro",
          "encounter",
          "combat",
          "asset",
          "fogPreset",
          "pluginStorage",
        ],
      },
      action: { type: "string", enum: ["create", "update", "delete"] },
      id: idSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  ProposalInverseChange: {
    type: "object",
    additionalProperties: false,
    required: ["entity", "action", "data"],
    properties: {
      entity: {
        type: "string",
        enum: [
          "campaign",
          "world",
          "scene",
          "token",
          "actor",
          "item",
          "journal",
          "handout",
          "chat",
          "roll",
          "diceMacro",
          "encounter",
          "combat",
          "asset",
          "fogPreset",
          "pluginStorage",
          "campaignSession",
          "aiMemory",
        ],
      },
      action: { type: "string", enum: ["create", "update", "delete"] },
      id: idSchema,
      data: { type: "object", additionalProperties: true },
    },
  },
  ProposalRevertGuard: {
    type: "object",
    additionalProperties: false,
    required: ["entity", "id", "expected"],
    properties: {
      entity: {
        type: "string",
        enum: [
          "campaign",
          "world",
          "scene",
          "token",
          "actor",
          "item",
          "journal",
          "handout",
          "chat",
          "roll",
          "diceMacro",
          "encounter",
          "combat",
          "asset",
          "fogPreset",
          "pluginStorage",
          "campaignSession",
          "aiMemory",
        ],
      },
      id: idSchema,
      expected: {
        anyOf: [
          { type: "object", additionalProperties: true },
          { type: "null" },
        ],
      },
    },
  },
  ProposalCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: stringSchema,
      summary: stringSchema,
      changesJson: arrayOf(schemaRef("ProposalChange")),
      diffJson: { type: "object", additionalProperties: true },
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  EncounterThreatSelection: {
    type: "object",
    additionalProperties: false,
    required: ["id", "count"],
    properties: {
      id: idSchema,
      count: { type: "integer", minimum: 1, maximum: 99 },
    },
  },
  Encounter: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "name",
      "summary",
      "tokenIds",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      systemId: idSchema,
      name: stringSchema,
      summary: stringSchema,
      tokenIds: arrayOf(idSchema),
      difficulty: stringSchema,
      partyActorIds: { ...arrayOf(idSchema), maxItems: 100, uniqueItems: true },
      threats: { ...arrayOf(schemaRef("EncounterThreatSelection")), maxItems: 100 },
    },
  },
  EncounterCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      worldId: { anyOf: [idSchema, { type: "null" }] },
      systemId: idSchema,
      name: stringSchema,
      summary: stringSchema,
      tokenIds: arrayOf(idSchema),
      difficulty: stringSchema,
      partyActorIds: { ...arrayOf(idSchema), maxItems: 100, uniqueItems: true },
      threats: { ...arrayOf(schemaRef("EncounterThreatSelection")), maxItems: 100 },
    },
  },
  EncounterPatchRequest: {
    $ref: "#/components/schemas/EncounterCreateRequest",
  },
  ChatExport: {
    type: "object",
    additionalProperties: true,
    required: ["campaignId", "exportedAt", "count", "messages"],
    properties: {
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" },
      count: { type: "integer", minimum: 0 },
      visibilityCounts: {
        type: "object",
        additionalProperties: { type: "integer", minimum: 0 },
      },
      typeCounts: {
        type: "object",
        additionalProperties: { type: "integer", minimum: 0 },
      },
      messages: arrayOf(schemaRef("ChatMessage")),
    },
  },
  DiceMacro: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "name", "formula", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      formula: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
      createdByUserId: idSchema,
    },
  },
  DiceMacroRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      formula: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
    },
  },
  AudioTrack: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "createdBy",
      "name",
      "url",
      "kind",
      "loop",
      "playing",
      "volume",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      createdBy: idSchema,
      name: stringSchema,
      url: stringSchema,
      kind: { type: "string", enum: ["music", "ambient", "sfx"] },
      loop: { type: "boolean" },
      playing: { type: "boolean" },
      volume: { type: "number", minimum: 0, maximum: 1 },
      startedAt: { type: "string", format: "date-time" },
    },
  },
  AudioTrackRequest: {
    type: "object",
    additionalProperties: false,
    required: ["name", "url"],
    properties: {
      name: stringSchema,
      url: stringSchema,
      kind: { type: "string", enum: ["music", "ambient", "sfx"] },
      loop: { type: "boolean" },
      volume: { type: "number", minimum: 0, maximum: 1 },
    },
  },
  AudioTrackPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      url: stringSchema,
      kind: { type: "string", enum: ["music", "ambient", "sfx"] },
      loop: { type: "boolean" },
      volume: { type: "number", minimum: 0, maximum: 1 },
      playing: { type: "boolean" },
    },
  },
  AiSourceReference: {
    type: "object",
    additionalProperties: false,
    required: ["id", "kind", "title", "visibility", "trust"],
    properties: {
      id: idSchema,
      kind: {
        type: "string",
        enum: ["official_open_rules", "campaign_canon", "campaign_note", "chat", "roll", "scene", "actor", "item", "generated_model"],
      },
      title: stringSchema,
      locator: stringSchema,
      provenance: {
        type: "object",
        additionalProperties: false,
        required: ["sourceName"],
        properties: {
          sourceName: stringSchema,
          sourceVersion: stringSchema,
          contentVersion: stringSchema,
          license: stringSchema,
        },
      },
      visibility: { type: "string", enum: ["public", "gm_private"] },
      trust: { type: "string", enum: ["authoritative_open_rules", "reviewed_canon", "untrusted_campaign_content", "model_generated"] },
    },
  },
  AiCitation: {
    type: "object",
    additionalProperties: false,
    required: ["sourceId", "status"],
    properties: {
      sourceId: idSchema,
      locator: stringSchema,
      status: { type: "string", enum: ["verified", "unsupported"] },
      reason: { type: "string", enum: ["unknown_source", "locator_mismatch"] },
      source: schemaRef("AiSourceReference"),
    },
  },
  AiCitationWarning: {
    type: "object",
    additionalProperties: false,
    required: ["code", "message"],
    properties: {
      code: { type: "string", enum: ["rules_answer_without_verified_open_rules_citation", "unsupported_citation"] },
      message: stringSchema,
    },
  },
  AiCampaignPolicy: {
    type: "object",
    additionalProperties: false,
    required: ["enabled", "status", "contextScopes", "providerTransmissionDisclosure", "retentionDays", "revision"],
    properties: {
      enabled: { type: "boolean" },
      status: { type: "string", enum: ["enabled", "disabled"] },
      contextScopes: arrayOf({ type: "string", enum: ["public", "gm_private"] }),
      providerTransmissionDisclosure: stringSchema,
      retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
      revision: { type: "integer", minimum: 0 },
      updatedByUserId: idSchema,
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  AiEffectivePolicy: {
    type: "object",
    additionalProperties: true,
    required: ["enabled", "status", "contextScopes", "retentionDays", "campaign", "installation"],
    properties: {
      enabled: { type: "boolean" },
      status: { type: "string", enum: ["enabled", "disabled", "unsafe_configuration"] },
      contextScopes: arrayOf({ type: "string", enum: ["public", "gm_private"] }),
      retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
      legacyDefault: { type: "boolean" },
      readinessIssues: arrayOf(stringSchema),
      campaign: schemaRef("AiCampaignPolicy"),
      installation: { type: "object", additionalProperties: true },
    },
  },
  AiPolicyUpdateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedRevision", "enabled", "contextScopes", "providerTransmissionDisclosure", "retentionDays"],
    properties: {
      expectedRevision: { type: "integer", minimum: 0 },
      enabled: { type: "boolean" },
      contextScopes: arrayOf({ type: "string", enum: ["public", "gm_private"] }),
      providerTransmissionDisclosure: stringSchema,
      retentionDays: { type: "integer", minimum: 1, maximum: 3650 },
    },
  },
  AiPrivacyRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      mode: { type: "string", enum: ["expired", "all"] },
      before: { type: "string", format: "date-time" },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
      dryRun: { type: "boolean" },
      confirmation: stringSchema,
    },
  },
  AiPrivacyResult: {
    type: "object",
    additionalProperties: true,
    required: ["localOperationalHistoryOnly", "providerDeletion", "dryRun", "categories", "preserved"],
    properties: {
      localOperationalHistoryOnly: { type: "boolean" },
      providerDeletion: { type: "string", enum: ["not_requested_or_verified"] },
      dryRun: { type: "boolean" },
      categories: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      preserved: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
    },
  },
  AiThread: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "userId",
      "provider",
      "title",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      provider: stringSchema,
      title: stringSchema,
      prompt: stringSchema,
      status: {
        type: "string",
        enum: ["running", "completed", "failed", "cancelled"],
      },
      assistantMessage: stringSchema,
      providerError: stringSchema,
      sources: arrayOf(schemaRef("AiSourceReference")),
      citations: arrayOf(schemaRef("AiCitation")),
      citationWarnings: arrayOf(schemaRef("AiCitationWarning")),
      contextScopes: arrayOf({ type: "string", enum: ["public", "gm_private"] }),
      policyRevision: { type: "integer", minimum: 0 },
      retentionExpiresAt: { type: "string", format: "date-time" },
      usage: schemaRef("AiThreadUsageMetrics"),
      advertisedTools: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  AiThreadUsageMetrics: {
    type: "object",
    additionalProperties: false,
    properties: {
      promptCharacters: { type: "integer", minimum: 0 },
      contextCharacters: { type: "integer", minimum: 0 },
      responseCharacters: { type: "integer", minimum: 0 },
      inputTokens: { type: "integer", minimum: 0 },
      outputTokens: { type: "integer", minimum: 0 },
      totalTokens: { type: "integer", minimum: 0 },
      estimatedCostUsd: { type: "number", minimum: 0 },
    },
  },
  AiUsageMetrics: {
    type: "object",
    additionalProperties: true,
    required: ["campaignId"],
    properties: {
      campaignId: idSchema,
      threadCount: { type: "integer", minimum: 0 },
      promptTokens: { type: "integer", minimum: 0 },
      completionTokens: { type: "integer", minimum: 0 },
      totalTokens: { type: "integer", minimum: 0 },
      estimatedCostUsd: { type: "number", minimum: 0 },
    },
  },
  AiEvaluationRun: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "threadId",
      "status",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      threadId: idSchema,
      requestedByUserId: idSchema,
      status: stringSchema,
      score: { type: "number" },
      checks: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  AiEvaluationInput: {
    type: "object",
    additionalProperties: true,
    required: ["threadId"],
    properties: {
      threadId: idSchema,
      notes: stringSchema,
      expectedOutcome: stringSchema,
    },
  },
  AiEvaluationSnapshot: {
    type: "object",
    additionalProperties: true,
    properties: {
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" },
      evaluations: arrayOf(schemaRef("AiEvaluationRun")),
    },
  },
  AiThreadMessage: {
    type: "object",
    additionalProperties: false,
    required: ["role", "content"],
    properties: {
      role: { type: "string", enum: ["user", "assistant"] },
      content: stringSchema,
    },
  },
  AiThreadCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["prompt"],
    properties: {
      prompt: stringSchema,
      surface: { type: "string", enum: ["agent_panel", "ai_studio"] },
      approvalMode: { type: "string", enum: ["manual", "auto"] },
      model: stringSchema,
      reasoningEffort: {
        type: "string",
        enum: ["none", "minimal", "low", "medium", "high", "xhigh"],
      },
      contextScopes: arrayOf({ type: "string", enum: ["public", "gm_private"] }),
      selectedSceneId: idSchema,
      selectedAssetId: idSchema,
      selectedTokenIds: arrayOf(idSchema),
      messages: arrayOf(schemaRef("AiThreadMessage")),
    },
  },
  McpJsonRpcRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      jsonrpc: stringSchema,
      id: { oneOf: [stringSchema, { type: "number" }, { type: "null" }] },
      method: stringSchema,
      params: looseObjectSchema,
    },
  },
  McpJsonRpcResponse: {
    type: "object",
    additionalProperties: true,
    required: ["jsonrpc", "id"],
    properties: {
      jsonrpc: stringSchema,
      id: { oneOf: [stringSchema, { type: "number" }, { type: "null" }] },
      result: looseObjectSchema,
      error: looseObjectSchema,
    },
  },
  BoardCaptureSubmitRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dataUrl: stringSchema,
      sceneId: idSchema,
      width: { type: "number" },
      height: { type: "number" },
      error: stringSchema,
    },
  },
  BoardCaptureResult: {
    type: "object",
    additionalProperties: true,
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["captured", "board_capture_unavailable", "failed"],
      },
      captureId: idSchema,
      imageUrl: stringSchema,
      expiresAt: { type: "string", format: "date-time" },
      sceneId: idSchema,
      width: { type: "number" },
      height: { type: "number" },
      mimeType: { type: "string", enum: ["image/png"] },
      reason: stringSchema,
    },
  },
  AiEditLayerApplyResult: {
    type: "object",
    additionalProperties: true,
    required: [
      "aiEditSceneId",
      "targetSceneId",
      "copiedTokenCount",
      "replacedTokenCount",
    ],
    properties: {
      aiEditSceneId: idSchema,
      targetSceneId: idSchema,
      backgroundAssetId: idSchema,
      copiedTokenCount: { type: "integer", minimum: 0 },
      replacedTokenCount: { type: "integer", minimum: 0 },
    },
  },
  AiToolCallRetryRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
    },
  },
  AiProviderEvent: {
    type: "object",
    additionalProperties: true,
    required: ["type"],
    properties: {
      type: stringSchema,
    },
  },
  CodexAuthStart: {
    type: "object",
    additionalProperties: false,
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["chatgpt", "chatgptDeviceCode"] },
      loginId: stringSchema,
      authUrl: stringSchema,
      verificationUrl: stringSchema,
      userCode: stringSchema,
    },
  },
  AiThreadResponse: {
    type: "object",
    additionalProperties: true,
    required: ["thread", "assistantMessage", "events"],
    properties: {
      thread: schemaRef("AiThread"),
      assistantMessage: stringSchema,
      events: arrayOf(schemaRef("AiProviderEvent")),
    },
  },
  AiThreadAuthRequiredResponse: {
    type: "object",
    additionalProperties: true,
    required: ["error", "message", "codexAuth", "thread", "events"],
    properties: {
      error: { type: "string", enum: ["codex_auth_required"] },
      message: stringSchema,
      codexAuth: schemaRef("CodexAuthStart"),
      thread: schemaRef("AiThread"),
      events: arrayOf(schemaRef("AiProviderEvent")),
    },
  },
  AiMemoryFact: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "text",
      "type",
      "visibility",
      "status",
      "sourceIds",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      worldId: idSchema,
      text: stringSchema,
      type: {
        type: "string",
        enum: [
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
          "ai_suggestion",
        ],
      },
      subject: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
      status: {
        type: "string",
        enum: ["candidate", "approved", "rejected", "retconned"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      sourceIds: arrayOf(idSchema),
      source: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: { type: stringSchema, id: idSchema, label: stringSchema },
      },
      createdBy: { type: "string", enum: ["user", "ai", "plugin", "system"] },
      approvedByUserId: idSchema,
      approvedAt: { type: "string", format: "date-time" },
      rejectedByUserId: idSchema,
      rejectedAt: { type: "string", format: "date-time" },
      retconnedByUserId: idSchema,
      retconnedAt: { type: "string", format: "date-time" },
    },
  },
  AiMemoryCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: stringSchema,
      worldId: { anyOf: [idSchema, { type: "null" }] },
      type: {
        type: "string",
        enum: [
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
          "ai_suggestion",
        ],
      },
      subject: { anyOf: [stringSchema, { type: "null" }] },
      visibility: { type: "string", enum: ["public", "gm_only"] },
      confidence: {
        anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }],
      },
      sourceIds: arrayOf(idSchema),
      source: { type: "object", additionalProperties: true },
      createdBy: { type: "string", enum: ["user", "ai", "plugin", "system"] },
    },
  },
  AiMemoryPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      text: stringSchema,
      worldId: { anyOf: [idSchema, { type: "null" }] },
      type: {
        type: "string",
        enum: [
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
          "ai_suggestion",
        ],
      },
      subject: { anyOf: [stringSchema, { type: "null" }] },
      visibility: { type: "string", enum: ["public", "gm_only"] },
      confidence: {
        anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }],
      },
      sourceIds: arrayOf(idSchema),
      source: { type: "object", additionalProperties: true },
      createdBy: { type: "string", enum: ["user", "ai", "plugin", "system"] },
      status: { type: "string", enum: ["candidate", "retconned"] },
    },
  },
  AiMemoryExtractRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      sourceText: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
    },
  },
  AiMemoryExtractResponse: {
    type: "object",
    additionalProperties: true,
    required: ["thread", "memory", "providerOutput", "events"],
    properties: {
      thread: schemaRef("AiThread"),
      memory: schemaRef("AiMemoryFact"),
      providerOutput: stringSchema,
      events: arrayOf(schemaRef("AiProviderEvent")),
    },
  },
  AiToolCall: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "threadId",
      "toolName",
      "status",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      threadId: idSchema,
      toolName: stringSchema,
      status: { type: "string", enum: ["started", "completed", "failed"] },
      input: {},
      output: {},
      durationMs: { type: "number", minimum: 0 },
    },
  },
  AiSessionRecapRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      transcript: stringSchema,
    },
  },
  AiSessionRecapResponse: {
    type: "object",
    additionalProperties: true,
    required: ["proposal", "memory"],
    properties: {
      proposal: schemaRef("Proposal"),
      memory: schemaRef("AiMemoryFact"),
    },
  },
  AiEncounterDesignRequest: {
    type: "object",
    additionalProperties: false,
    required: ["prompt"],
    properties: {
      prompt: stringSchema,
      difficulty: stringSchema,
    },
  },
  AiEncounterDesignResponse: {
    type: "object",
    additionalProperties: true,
    required: ["proposal", "encounter"],
    properties: {
      proposal: schemaRef("Proposal"),
      encounter: schemaRef("Encounter"),
    },
  },
  PluginCoreCompatibility: {
    type: "object",
    additionalProperties: false,
    required: ["range", "coreVersion", "satisfied"],
    properties: {
      range: stringSchema,
      coreVersion: stringSchema,
      satisfied: { type: "boolean" },
    },
  },
  PluginRuntimeInfo: {
    type: "object",
    additionalProperties: true,
    required: ["id", "name", "version"],
    properties: {
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      compatibleCore: {
        oneOf: [stringSchema, schemaRef("PluginCoreCompatibility")],
      },
      package: {
        type: "object",
        additionalProperties: false,
        properties: {
          publisher: stringSchema,
          license: stringSchema,
        },
      },
      runtime: {
        type: "object",
        additionalProperties: false,
        properties: {
          apiVersion: stringSchema,
          sandbox: stringSchema,
        },
      },
      permissions: arrayOf(stringSchema),
      chatCommands: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["command", "description"],
        properties: { command: stringSchema, description: stringSchema },
      }),
      eventSubscriptions: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: { type: stringSchema, description: stringSchema },
      }),
      trust: {
        type: "object",
        additionalProperties: false,
        required: ["status", "policy", "required", "installable", "errors"],
        properties: {
          status: { type: "string", enum: ["trusted", "unsigned", "untrusted"] },
          policy: { type: "string", enum: ["allow_unsigned", "require_trusted"] },
          required: { type: "boolean" },
          installable: { type: "boolean" },
          errors: arrayOf(stringSchema),
          signature: {
            type: "object",
            additionalProperties: false,
            required: ["verified"],
            properties: {
              keyId: stringSchema,
              algorithm: stringSchema,
              verified: { type: "boolean" },
            },
          },
        },
      },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["type", "packageId", "manifestChecksum", "sandbox"],
        properties: {
          type: { type: "string", enum: ["local", "registry"] },
          packageId: stringSchema,
          manifestChecksum: stringSchema,
          sandbox: { type: "string", enum: ["vm", "manifest-only"] },
          checksum: stringSchema,
          packageChecksum: stringSchema,
          syncedAt: { type: "string", format: "date-time" },
        },
      },
      distribution: {
        type: "object",
        additionalProperties: false,
        required: ["availableVersions", "latestVersion"],
        properties: {
          availableVersions: arrayOf(stringSchema),
          latestVersion: stringSchema,
        },
      },
      permissionReview: {
        type: "object",
        additionalProperties: false,
        required: ["requestedPermissions", "grantRequired"],
        properties: {
          requestedPermissions: arrayOf(stringSchema),
          grantRequired: { type: "boolean" },
        },
      },
    },
  },
  PluginCampaignInfo: {
    allOf: [
      schemaRef("PluginRuntimeInfo"),
      {
        type: "object",
        additionalProperties: true,
        required: ["compatibleCore"],
        properties: {
          compatibleCore: schemaRef("PluginCoreCompatibility"),
          installed: { type: "boolean" },
          grantedPermissions: arrayOf(stringSchema),
          missingPermissions: arrayOf(stringSchema),
          versionCompatibility: arrayOf({
            type: "object",
            additionalProperties: true,
            required: ["version", "compatibleCore", "permissions", "permissionReview", "trust", "source"],
            properties: {
              version: stringSchema,
              compatibleCore: schemaRef("PluginCoreCompatibility"),
              compatibilityBlock: stringSchema,
              permissions: arrayOf(stringSchema),
              permissionReview: {
                type: "object",
                additionalProperties: false,
                required: ["requestedPermissions", "grantRequired"],
                properties: {
                  requestedPermissions: arrayOf(stringSchema),
                  grantRequired: { type: "boolean" },
                },
              },
              trust: looseObjectSchema,
              source: looseObjectSchema,
              marketplaceReview: looseObjectSchema,
            },
          }),
          audit: {
            type: "object",
            additionalProperties: false,
            required: ["installCount", "versions"],
            properties: {
              installCount: { type: "integer", minimum: 0 },
              lastInstallAt: { type: "string", format: "date-time" },
              versions: arrayOf(stringSchema),
            },
          },
        },
      },
    ],
  },
  PluginInstallRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      permissions: arrayOf(stringSchema),
      version: stringSchema,
    },
  },
  PermissionGrant: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "subjectType",
      "subjectId",
      "campaignId",
      "permissions",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      subjectType: stringSchema,
      subjectId: idSchema,
      campaignId: idSchema,
      permissions: arrayOf(stringSchema),
      metadata: { type: "object", additionalProperties: true },
    },
  },
  PluginInstallResponse: {
    type: "object",
    additionalProperties: true,
    required: ["plugin", "grant", "permissionReview"],
    properties: {
      plugin: schemaRef("PluginCampaignInfo"),
      grant: schemaRef("PermissionGrant"),
      permissionReview: { type: "object", additionalProperties: true },
    },
  },
  PluginStorageEntry: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "pluginId",
      "key",
      "value",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      pluginId: idSchema,
      key: stringSchema,
      value: {},
      updatedByType: stringSchema,
      updatedById: idSchema,
    },
  },
  PluginStorageSetRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      value: {},
      expectedUpdatedAt: dateTimeSchema,
      expectedCampaignUpdatedAt: dateTimeSchema,
    },
  },
  PluginStorageDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["deleted", "key"],
    properties: {
      deleted: { type: "boolean" },
      key: stringSchema,
    },
  },
  PluginChatCommandRequest: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: stringSchema,
      args: stringSchema,
    },
  },
  PluginChatCommandResponse: {
    type: "object",
    additionalProperties: true,
    required: [
      "pluginId",
      "command",
      "proposal",
      "proposals",
      "chat",
      "storageMutation",
      "approvalRequired",
    ],
    properties: {
      pluginId: idSchema,
      command: stringSchema,
      proposal: schemaRef("Proposal"),
      proposals: arrayOf(schemaRef("Proposal")),
      bridgeReceipts: { type: "object", additionalProperties: stringSchema },
      chat: schemaRef("ChatMessage"),
      storageMutation: { type: "object", additionalProperties: true },
      approvalRequired: { type: "boolean", enum: [true] },
    },
  },
  PluginPackageInstallRequest: {
    type: "object",
    additionalProperties: false,
    required: ["packagePath"],
    properties: {
      campaignId: idSchema,
      packagePath: stringSchema,
    },
  },
  PluginRegistrySyncRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedRegistryRevision"],
    properties: {
      campaignId: idSchema,
      registryUrl: stringSchema,
      expectedRegistryRevision: operatorTargetSetHashSchema,
    },
  },
  PluginRegistrySyncResponse: {
    type: "object",
    additionalProperties: false,
    required: ["syncedAt", "previousRegistryRevision", "registryRevision", "registries", "plugins"],
    properties: {
      syncedAt: { type: "string", format: "date-time" },
      previousRegistryRevision: operatorTargetSetHashSchema,
      registryRevision: operatorTargetSetHashSchema,
      registries: arrayOf({ type: "object", additionalProperties: true }),
      plugins: arrayOf(schemaRef("AdminPluginRegistrySyncPlugin")),
    },
  },
  SystemRuntimeInfo: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "version", "compatibleCore", "entrypoints", "schemas", "permissions", "capabilities", "active", "source", "dataDriven", "runtimeCapabilities", "unsupportedCapabilities"],
    properties: {
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      compatibleCore: stringSchema,
      entrypoints: {
        type: "object",
        additionalProperties: false,
        properties: { client: stringSchema, server: stringSchema },
      },
      schemas: {
        type: "object",
        additionalProperties: false,
        required: ["actor", "item"],
        properties: { actor: stringSchema, item: stringSchema },
      },
      permissions: arrayOf(stringSchema),
      capabilities: arrayOf(stringSchema),
      active: { type: "boolean" },
      source: { type: "string", enum: ["bundled", "api"] },
      dataDriven: { type: "boolean" },
      runtimeCapabilities: arrayOf(stringSchema),
      unsupportedCapabilities: arrayOf(stringSchema),
      installedAt: { type: "string", format: "date-time" },
    },
  },
  CalculationSource: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "name"],
    properties: {
      kind: { type: "string", enum: ["actor", "system", "class", "feature", "item", "condition", "override", "manual"] },
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      url: { type: "string", format: "uri" },
    },
  },
  CalculationTerm: {
    type: "object",
    additionalProperties: false,
    required: ["label", "source"],
    properties: {
      label: stringSchema,
      signedValue: { type: "number" },
      formula: stringSchema,
      source: schemaRef("CalculationSource"),
    },
  },
  CalculationFlags: {
    type: "object",
    additionalProperties: false,
    required: ["manual", "override", "unsupported", "ambiguous", "reasons"],
    properties: {
      manual: { type: "boolean" },
      override: { type: "boolean" },
      unsupported: { type: "boolean" },
      ambiguous: { type: "boolean" },
      reasons: arrayOf(stringSchema),
    },
  },
  CalculationFieldExplanation: {
    type: "object",
    additionalProperties: false,
    required: ["id", "group", "label", "result", "terms", "flags"],
    properties: {
      id: idSchema,
      group: { type: "string", enum: ["abilities", "defenses", "vitality", "checks", "skills", "magic", "actions"] },
      label: stringSchema,
      result: { oneOf: [{ type: "number" }, { type: "string" }] },
      unit: stringSchema,
      terms: arrayOf(schemaRef("CalculationTerm")),
      flags: schemaRef("CalculationFlags"),
    },
  },
  ActorCalculationExplanation: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "systemId", "systemVersion", "rulesVersion", "source", "fields"],
    properties: {
      actorId: idSchema,
      systemId: idSchema,
      systemVersion: stringSchema,
      rulesVersion: stringSchema,
      source: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version", "license"],
        properties: {
          name: stringSchema,
          version: stringSchema,
          license: schemaRef("CompendiumLicense"),
        },
      },
      fields: arrayOf(schemaRef("CalculationFieldExplanation")),
    },
  },
  CalculationOverride: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "actorId", "fieldId", "source", "baseValue", "effectiveValue", "reason", "createdByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      actorId: idSchema,
      systemId: idSchema,
      rulesVersion: stringSchema,
      fieldId: { type: "string", minLength: 1, maxLength: 200 },
      source: { type: "string", enum: ["gm_manual", "house_rule", "migration", "plugin"] },
      baseValue: { oneOf: [{ type: "number" }, { type: "string" }] },
      effectiveValue: { oneOf: [{ type: "number" }, { type: "string", minLength: 1, maxLength: 500 }] },
      reason: { type: "string", minLength: 1, maxLength: 500 },
      createdByUserId: idSchema,
      clearedAt: { type: "string", format: "date-time" },
      clearedByUserId: idSchema,
      clearReason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  CalculationOverrideCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["fieldId", "source", "effectiveValue", "reason", "expectedActorUpdatedAt"],
    properties: {
      fieldId: { type: "string", minLength: 1, maxLength: 200 },
      source: { type: "string", enum: ["gm_manual", "house_rule"] },
      effectiveValue: { oneOf: [{ type: "number" }, { type: "string", minLength: 1, maxLength: 500 }] },
      reason: { type: "string", minLength: 1, maxLength: 500 },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  CalculationOverrideClearRequest: {
    type: "object",
    additionalProperties: false,
    required: ["reason", "expectedUpdatedAt", "expectedActorUpdatedAt"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 500 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndControlledCreatureRevisionSet: {
    type: "object",
    additionalProperties: false,
    required: ["actors", "items", "tokens", "combats", "scenes", "encounters"],
    properties: {
      actors: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      items: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      tokens: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      combats: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      scenes: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      encounters: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    },
  },
  DndControlledCreatureOriginatingAction: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "rollId", "label", "preparedPreviewKey", "resolutionHash"],
    properties: { actorId: idSchema, rollId: stringSchema, label: stringSchema, preparedPreviewKey: stringSchema, resolutionHash: stringSchema },
  },
  DndControlledCreatureTokenTemplate: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y", "width", "height", "disposition"],
    properties: { name: stringSchema, x: { type: "number" }, y: { type: "number" }, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 }, rotation: { type: "number" }, hidden: { type: "boolean" }, disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] }, imageAssetId: idSchema },
  },
  DndControlledCreatureActionHandoff: {
    type: "object",
    additionalProperties: false,
    required: ["version", "status", "action", "prefill", "sourcedFields", "manualChoices"],
    properties: {
      version: { type: "integer", enum: [1] },
      status: { type: "string", enum: ["supported", "manual_required"] },
      action: { type: "object", additionalProperties: false, required: ["actorId", "rollId", "label"], properties: { actorId: idSchema, rollId: stringSchema, label: stringSchema, preparedPreviewKey: stringSchema, resolutionHash: stringSchema } },
      prefill: schemaRef("DndControlledCreatureCreatePrefill"),
      sourcedFields: arrayOf(stringSchema),
      manualChoices: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["field", "reason"],
        properties: {
          field: { type: "string", enum: ["actor.name", "actor.type", "actor.statBlock", "actor.hitPoints", "sceneId", "token", "duration", "concentration", "initiative", "command", "transformation.form", "transformation.equipmentCarryover"] },
          reason: stringSchema,
        },
      }),
    },
  },
  DndControlledCreatureCreatePrefill: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "source", "controllerActorId"],
    properties: {
      kind: { type: "string", enum: ["summon", "transformation", "persistent_companion"] },
      source: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "actorId", "name", "systemId", "rulesVersion"],
        properties: {
          kind: { type: "string", enum: ["spell", "feature"] },
          actorId: idSchema,
          itemId: idSchema,
          name: stringSchema,
          systemId: { type: "string", enum: ["dnd-5e-srd"] },
          rulesVersion: stringSchema,
        },
      },
      originatingAction: schemaRef("DndControlledCreatureOriginatingAction"),
      controllerUserId: idSchema,
      controllerActorId: idSchema,
      ownerUserId: idSchema,
      sceneId: idSchema,
      combatId: idSchema,
      targetActorId: idSchema,
      actor: { type: "object", additionalProperties: false, properties: { name: stringSchema, type: stringSchema, imageAssetId: idSchema, data: { type: "object", additionalProperties: true } } },
      token: { type: "object", additionalProperties: false, properties: { name: stringSchema, x: { type: "number" }, y: { type: "number" }, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 }, rotation: { type: "number" }, hidden: { type: "boolean" }, disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] }, imageAssetId: idSchema } },
      duration: { type: "object", additionalProperties: true, required: ["mode"], properties: { mode: { type: "string", enum: ["rounds", "until_time", "until_dismissed", "persistent"] } } },
      concentration: { type: "object", additionalProperties: false, required: ["sourceActorId", "groupId"], properties: { sourceActorId: idSchema, groupId: stringSchema } },
      initiative: { type: "object", additionalProperties: true, required: ["mode"], properties: { mode: { type: "string", enum: ["shared", "independent"] } } },
      command: { type: "object", additionalProperties: false, required: ["required", "action"], properties: { required: { type: "boolean" }, action: { type: "string", enum: ["action", "bonus_action", "reaction", "free", "none"] }, note: stringSchema } },
      transformation: { type: "object", additionalProperties: false, properties: { hpCarryover: { type: "string", enum: ["preserve", "replace"] }, equipmentCarryover: { type: "string", enum: ["preserve", "suppress"] } } },
    },
  },
  DndControlledCreatureCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "source", "controllerUserId", "controllerActorId", "ownerUserId", "actor", "duration", "initiative", "command"],
    properties: {
      kind: { type: "string", enum: ["summon", "transformation", "persistent_companion"] },
      sceneId: idSchema,
      combatId: idSchema,
      targetActorId: idSchema,
      source: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "actorId", "name", "systemId", "rulesVersion"],
        properties: {
          kind: { type: "string", enum: ["spell", "feature"] },
          actorId: idSchema,
          itemId: idSchema,
          name: stringSchema,
          systemId: { type: "string", enum: ["dnd-5e-srd"] },
          rulesVersion: stringSchema,
        },
      },
      originatingAction: schemaRef("DndControlledCreatureOriginatingAction"),
      controllerUserId: idSchema,
      controllerActorId: idSchema,
      ownerUserId: idSchema,
      actor: { type: "object", additionalProperties: true, required: ["name", "type", "data"], properties: { name: stringSchema, type: stringSchema, imageAssetId: idSchema, data: { type: "object", additionalProperties: true } } },
      token: schemaRef("DndControlledCreatureTokenTemplate"),
      duration: { type: "object", additionalProperties: true, required: ["mode"], properties: { mode: { type: "string", enum: ["rounds", "until_time", "until_dismissed", "persistent"] } } },
      concentration: { type: "object", additionalProperties: false, required: ["sourceActorId", "groupId"], properties: { sourceActorId: idSchema, groupId: stringSchema } },
      initiative: { type: "object", additionalProperties: true, required: ["mode"], properties: { mode: { type: "string", enum: ["shared", "independent"] } } },
      command: { type: "object", additionalProperties: false, required: ["required", "action"], properties: { required: { type: "boolean" }, action: { type: "string", enum: ["action", "bonus_action", "reaction", "free", "none"] }, note: stringSchema } },
      transformation: { type: "object", additionalProperties: false, properties: { hpCarryover: { type: "string", enum: ["preserve", "replace"] }, equipmentCarryover: { type: "string", enum: ["preserve", "suppress"] } } },
      manualReviewConfirmed: { type: "boolean" },
    },
  },
  DndControlledCreaturePreview: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "systemId", "previewToken", "ready", "summary", "errors", "manualReview", "warnings", "requiredRevisions", "affected"],
    properties: {
      campaignId: idSchema,
      systemId: { type: "string", enum: ["dnd-5e-srd"] },
      previewToken: stringSchema,
      ready: { type: "boolean" },
      summary: stringSchema,
      errors: arrayOf(stringSchema),
      manualReview: arrayOf({ type: "object", additionalProperties: true }),
      warnings: arrayOf(stringSchema),
      requiredRevisions: schemaRef("DndControlledCreatureRevisionSet"),
      affected: { type: "object", additionalProperties: true },
    },
  },
  DndControlledCreatureConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["request", "previewToken", "expectedUpdatedAt"],
    properties: { request: schemaRef("DndControlledCreatureCreateRequest"), previewToken: stringSchema, expectedUpdatedAt: schemaRef("DndControlledCreatureRevisionSet") },
  },
  DndControlledCreatureMutationResult: {
    type: "object",
    additionalProperties: false,
    required: ["action", "records", "actors", "tokens", "combats", "removedActorIds", "removedTokenIds"],
    properties: {
      action: { type: "string", enum: ["created", "transformed", "commanded", "dismissed", "expired", "concentration_ended", "reverted"] },
      records: arrayOf({ type: "object", additionalProperties: true }),
      actors: arrayOf(schemaRef("Actor")),
      tokens: arrayOf(schemaRef("Token")),
      combats: arrayOf(schemaRef("Combat")),
      removedActorIds: arrayOf(idSchema),
      removedTokenIds: arrayOf(idSchema),
    },
  },
  CampaignCompatibilityIssue: {
    type: "object",
    additionalProperties: false,
    required: ["id", "group", "severity", "code", "title", "detail", "action"],
    properties: {
      id: idSchema,
      group: { type: "string", enum: ["core", "archive", "system", "reference", "validation", "compendium", "manual"] },
      severity: { type: "string", enum: ["warning", "blocking"] },
      code: stringSchema,
      title: stringSchema,
      detail: stringSchema,
      action: stringSchema,
      entityType: { type: "string", enum: ["campaign", "system", "actor", "item", "condition"] },
      entityId: idSchema,
    },
  },
  CampaignSystemCoverage: {
    type: "object",
    additionalProperties: false,
    required: ["systemId", "coreCompatible", "bundled", "default", "actorCount", "itemCount", "actorRulesVersions", "itemContentVersions"],
    properties: {
      systemId: idSchema,
      name: stringSchema,
      installedVersion: stringSchema,
      compatibleCore: stringSchema,
      coreCompatible: { type: "boolean" },
      bundled: { type: "boolean" },
      default: { type: "boolean" },
      actorCount: { type: "integer", minimum: 0 },
      itemCount: { type: "integer", minimum: 0 },
      actorRulesVersions: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      itemContentVersions: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
    },
  },
  CampaignCompatibilityRepairCandidate: {
    type: "object",
    additionalProperties: false,
    required: ["id", "entityKind", "entityId", "path", "operation", "after", "issue", "rationale", "inverse"],
    properties: {
      id: stringSchema,
      entityKind: { type: "string", enum: ["actor", "item"] },
      entityId: idSchema,
      path: { type: "string" },
      operation: { type: "string", enum: ["add", "remove", "replace"] },
      before: {},
      after: {},
      issue: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "code", "message"],
        properties: {
          severity: { type: "string", enum: ["error", "warning"] },
          code: stringSchema,
          message: stringSchema,
        },
      },
      rationale: stringSchema,
      inverse: schemaRef("Dnd5eSrdRepairPatch"),
    },
  },
  CampaignCompatibilityReport: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "readOnly", "status", "summary", "platform", "systems", "validation", "compendium", "calculationFlags", "issues"],
    properties: {
      campaignId: idSchema,
      readOnly: { type: "boolean", enum: [true] },
      status: { type: "string", enum: ["compatible", "warning", "blocking"] },
      summary: {
        type: "object",
        additionalProperties: false,
        required: ["compatible", "warning", "blocking", "totalIssues"],
        properties: {
          compatible: { type: "integer", minimum: 0 },
          warning: { type: "integer", minimum: 0 },
          blocking: { type: "integer", minimum: 0 },
          totalIssues: { type: "integer", minimum: 0 },
        },
      },
      platform: {
        type: "object",
        additionalProperties: false,
        required: ["coreVersion", "currentArchiveVersion", "supportedArchiveVersions", "dndRulesVersion", "dndActorSchemaVersion", "dndItemSchemaVersion"],
        properties: {
          coreVersion: stringSchema,
          currentArchiveVersion: { type: "string", enum: ["0.2.0"] },
          supportedArchiveVersions: arrayOf({ type: "string", enum: ["0.1.0", "0.2.0"] }),
          dndRulesVersion: stringSchema,
          dndActorSchemaVersion: stringSchema,
          dndItemSchemaVersion: stringSchema,
        },
      },
      systems: arrayOf(schemaRef("CampaignSystemCoverage")),
      validation: {
        type: "object",
        additionalProperties: false,
        required: ["actorReports", "itemReports", "errors", "warnings", "repairPreview"],
        properties: {
          actorReports: { type: "integer", minimum: 0 },
          itemReports: { type: "integer", minimum: 0 },
          errors: { type: "integer", minimum: 0 },
          warnings: { type: "integer", minimum: 0 },
          repairPreview: {
            type: "object",
            additionalProperties: false,
            required: ["automaticChanges", "manualIssues", "note", "candidates"],
            properties: {
              automaticChanges: { type: "integer", minimum: 0 },
              manualIssues: { type: "integer", minimum: 0 },
              note: stringSchema,
              candidates: arrayOf(schemaRef("CampaignCompatibilityRepairCandidate")),
            },
          },
        },
      },
      compendium: {
        type: "object",
        additionalProperties: false,
        required: ["trackedEntries", "currentEntries", "driftedEntries", "missingProvenance", "unknownEntries"],
        properties: {
          trackedEntries: { type: "integer", minimum: 0 },
          currentEntries: { type: "integer", minimum: 0 },
          driftedEntries: { type: "integer", minimum: 0 },
          missingProvenance: { type: "integer", minimum: 0 },
          unknownEntries: { type: "integer", minimum: 0 },
        },
      },
      calculationFlags: {
        type: "object",
        additionalProperties: false,
        required: ["manualFields", "overrideFields", "unsupportedFields", "ambiguousFields"],
        properties: {
          manualFields: { type: "integer", minimum: 0 },
          overrideFields: { type: "integer", minimum: 0 },
          unsupportedFields: { type: "integer", minimum: 0 },
          ambiguousFields: { type: "integer", minimum: 0 },
        },
      },
      issues: arrayOf(schemaRef("CampaignCompatibilityIssue")),
    },
  },
  SystemInstallResponse: {
    type: "object",
    additionalProperties: true,
    required: ["system", "campaign"],
    properties: {
      system: schemaRef("SystemRuntimeInfo"),
      campaign: schemaRef("Campaign"),
    },
  },
  SystemInstallRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "manifest"],
    properties: {
      campaignId: idSchema,
      manifest: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "version", "compatibleCore", "entrypoints", "schemas", "permissions", "capabilities"],
        properties: {
          id: idSchema,
          name: stringSchema,
          version: stringSchema,
          compatibleCore: stringSchema,
          entrypoints: {
            type: "object",
            additionalProperties: false,
            properties: { client: stringSchema, server: stringSchema },
          },
          schemas: {
            type: "object",
            additionalProperties: false,
            required: ["actor", "item"],
            properties: { actor: stringSchema, item: stringSchema },
          },
          permissions: arrayOf(stringSchema),
          capabilities: arrayOf(stringSchema),
        },
      },
    },
  },
  SystemCharacterTemplateItem: {
    type: "object",
    additionalProperties: false,
    required: ["entryId"],
    properties: {
      entryId: idSchema,
      quantity: { type: "integer", minimum: 0 },
      data: { type: "object", additionalProperties: true },
    },
  },
  SystemCharacterTemplate: {
    type: "object",
    additionalProperties: false,
    required: ["id", "systemId", "name", "summary", "actorType", "data", "items"],
    properties: {
      id: idSchema,
      systemId: idSchema,
      name: stringSchema,
      summary: stringSchema,
      actorType: stringSchema,
      data: { type: "object", additionalProperties: true },
      items: arrayOf(schemaRef("SystemCharacterTemplateItem")),
    },
  },
  SystemCharacterCreateRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      creationMode: { type: "string", enum: ["level-one-srd"] },
      templateId: idSchema,
      name: stringSchema,
      ownerUserId: idSchema,
      backgroundId: idSchema,
      speciesId: idSchema,
      abilityScoreIncreases: {
        type: "object",
        additionalProperties: { type: "integer", minimum: 1, maximum: 2 },
      },
      classSkillProficiencies: arrayOf(idSchema),
      originLanguageChoices: arrayOf(idSchema),
      classLanguageChoices: arrayOf(idSchema),
      draconicAncestry: idSchema,
      giantAncestry: idSchema,
      skillProficiency: idSchema,
      originFeat: stringSchema,
      elfLineage: idSchema,
      elfCantrip: idSchema,
      gnomeLineage: idSchema,
      tieflingLegacy: idSchema,
      speciesSpellcastingAbility: idSchema,
      classEquipmentPackageId: idSchema,
      backgroundEquipmentPackageId: idSchema,
      classEquipmentChoices: { type: "object", additionalProperties: idSchema },
      backgroundEquipmentChoices: { type: "object", additionalProperties: idSchema },
      classToolProficiencyChoices: arrayOf(idSchema),
      backgroundToolProficiencyChoice: idSchema,
      weaponMasteryChoices: arrayOf(idSchema),
      classCantripChoices: arrayOf(idSchema),
      classPreparedSpellChoices: arrayOf(idSchema),
      wizardSpellbookChoices: arrayOf(idSchema),
      backgroundMagicInitiateCantrips: arrayOf(idSchema),
      backgroundMagicInitiateSpell: idSchema,
      backgroundMagicInitiateAbility: idSchema,
      originFeatMagicInitiateCantrips: arrayOf(idSchema),
      originFeatMagicInitiateSpell: idSchema,
      originFeatMagicInitiateAbility: idSchema,
      skilledProficiencyChoices: arrayOf(idSchema),
      fightingStyle: idSchema,
      divineOrder: idSchema,
      primalOrder: idSchema,
      rogueExpertiseChoices: arrayOf(idSchema),
      eldritchInvocation: idSchema,
      pactTomeCantripChoices: arrayOf(idSchema),
      pactTomeRitualChoices: arrayOf(idSchema),
    },
  },
  SystemCharacterCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["template", "actor", "items"],
    properties: {
      template: schemaRef("SystemCharacterTemplate"),
      origins: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      items: arrayOf(schemaRef("Item")),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  Dnd5eSrdClassSkillChoice: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "className", "count", "skillIds", "source"],
    properties: {
      templateId: idSchema,
      className: stringSchema,
      count: { type: "integer", minimum: 1 },
      skillIds: arrayOf(idSchema),
      source: stringSchema,
    },
  },
  Dnd5eSrdLanguageOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "category", "source"],
    properties: {
      id: idSchema,
      label: stringSchema,
      category: { type: "string", enum: ["standard", "rare"] },
      source: stringSchema,
    },
  },
  Dnd5eSrdOriginLanguageChoice: {
    type: "object",
    additionalProperties: false,
    required: ["count", "fixedLanguageIds", "languageIds", "source"],
    properties: {
      count: { type: "integer", minimum: 1 },
      fixedLanguageIds: arrayOf(idSchema),
      languageIds: arrayOf(idSchema),
      source: stringSchema,
    },
  },
  Dnd5eSrdClassLanguageChoice: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "className", "count", "fixedLanguageIds", "languageIds", "source"],
    properties: {
      templateId: idSchema,
      className: stringSchema,
      count: { type: "integer", minimum: 0 },
      fixedLanguageIds: arrayOf(idSchema),
      languageIds: arrayOf(idSchema),
      source: stringSchema,
    },
  },
  Dnd5eSrdDraconicAncestor: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "damageType", "source"],
    properties: {
      id: idSchema,
      name: stringSchema,
      damageType: { type: "string", enum: ["acid", "cold", "fire", "lightning", "poison"] },
      source: stringSchema,
    },
  },
  Dnd5eSrdGiantAncestryChoice: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "giantType", "activation", "summary", "source"],
    properties: {
      id: idSchema,
      name: stringSchema,
      giantType: stringSchema,
      activation: { type: "string", enum: ["bonus-action", "on-hit", "reaction"] },
      summary: stringSchema,
      teleportRangeFt: { type: "integer", minimum: 0 },
      damageFormula: stringSchema,
      damageType: { type: "string", enum: ["cold", "fire", "thunder"] },
      speedReductionFt: { type: "integer", minimum: 0 },
      condition: { type: "string", enum: ["Prone"] },
      targetMaxSize: { type: "string", enum: ["Large"] },
      damageReductionFormula: stringSchema,
      damageReductionAbility: { type: "string", enum: ["constitution"] },
      triggerRangeFt: { type: "integer", minimum: 0 },
      source: stringSchema,
    },
  },
  Dnd5eSrdEquipmentGrant: {
    type: "object",
    additionalProperties: false,
    required: ["entryId"],
    properties: {
      entryId: idSchema,
      quantity: { type: "integer", minimum: 1 },
      data: { type: "object", additionalProperties: true },
    },
  },
  Dnd5eSrdEquipmentChoice: {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "count", "optionIds"],
    properties: {
      id: idSchema,
      label: stringSchema,
      count: { type: "integer", enum: [1] },
      optionIds: arrayOf(idSchema),
      matchSelection: { type: "string", enum: ["class-tool-proficiency", "background-tool-proficiency"] },
    },
  },
  Dnd5eSrdStartingEquipmentPackage: {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "gp", "grants", "choices"],
    properties: {
      id: idSchema,
      label: stringSchema,
      gp: { type: "number", minimum: 0 },
      grants: arrayOf(schemaRef("Dnd5eSrdEquipmentGrant")),
      choices: arrayOf(schemaRef("Dnd5eSrdEquipmentChoice")),
    },
  },
  Dnd5eSrdToolProficiencyChoice: {
    type: "object",
    additionalProperties: false,
    required: ["count", "optionIds"],
    properties: {
      count: { type: "integer", minimum: 0 },
      optionIds: arrayOf(idSchema),
    },
  },
  Dnd5eSrdClassStartingEquipment: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "className", "packages", "toolProficiencyChoice", "fixedToolProficiencyIds", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      templateId: idSchema,
      className: stringSchema,
      packages: arrayOf(schemaRef("Dnd5eSrdStartingEquipmentPackage")),
      toolProficiencyChoice: schemaRef("Dnd5eSrdToolProficiencyChoice"),
      fixedToolProficiencyIds: arrayOf(idSchema),
      source: stringSchema,
      sourcePage: { type: "integer", minimum: 1 },
      sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdBackgroundStartingEquipment: {
    type: "object",
    additionalProperties: false,
    required: ["backgroundId", "backgroundName", "packages", "toolProficiencyChoice", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      backgroundId: idSchema,
      backgroundName: stringSchema,
      packages: arrayOf(schemaRef("Dnd5eSrdStartingEquipmentPackage")),
      toolProficiencyChoice: schemaRef("Dnd5eSrdToolProficiencyChoice"),
      source: stringSchema,
      sourcePage: { type: "integer", minimum: 1 },
      sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdWeaponMasteryOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "weaponCategory", "weaponKind", "properties", "mastery", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      id: idSchema,
      name: stringSchema,
      weaponCategory: { type: "string", enum: ["simple", "martial"] },
      weaponKind: { type: "string", enum: ["melee", "ranged"] },
      properties: arrayOf(stringSchema),
      mastery: idSchema,
      source: stringSchema,
      sourcePage: { type: "integer", minimum: 1 },
      sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdClassWeaponMasteryChoice: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "className", "count", "weaponIds", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      templateId: idSchema,
      className: stringSchema,
      count: { type: "integer", minimum: 0 },
      weaponIds: arrayOf(idSchema),
      source: stringSchema,
      sourcePage: { type: "integer", minimum: 0 },
      sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdSpellChoiceOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "level", "classes", "ritual", "source"],
    properties: { id: idSchema, name: stringSchema, level: { type: "integer", enum: [0, 1] }, classes: arrayOf(idSchema), ritual: { type: "boolean" }, source: stringSchema },
  },
  Dnd5eSrdClassSpellChoice: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "className", "cantripCount", "preparedSpellCount", "spellbookSpellCount", "cantripIds", "levelOneSpellIds", "alwaysPreparedSpellIds", "slotPool", "slotCount", "slotRecovery", "changeTiming", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      templateId: idSchema, className: stringSchema, spellcastingAbility: idSchema,
      cantripCount: { type: "integer", minimum: 0 }, preparedSpellCount: { type: "integer", minimum: 0 }, spellbookSpellCount: { type: "integer", minimum: 0 },
      cantripIds: arrayOf(idSchema), levelOneSpellIds: arrayOf(idSchema), alwaysPreparedSpellIds: arrayOf(idSchema),
      slotPool: { type: "string", enum: ["none", "spellcasting", "pact-magic"] }, slotCount: { type: "integer", minimum: 0 }, slotRecovery: { type: "string", enum: ["none", "long", "short"] }, changeTiming: { type: "string", enum: ["none", "long-rest", "class-level"] },
      source: stringSchema, sourcePage: { type: "integer", minimum: 1 }, sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdLevelOneClassFeatureChoice: {
    type: "object",
    additionalProperties: false,
    required: ["templateId", "field", "count", "optionIds", "source", "sourcePage", "sourcePdfPage"],
    properties: { templateId: idSchema, field: idSchema, count: { type: "integer", minimum: 1 }, optionIds: arrayOf(idSchema), source: stringSchema, sourcePage: { type: "integer", minimum: 1 }, sourcePdfPage: { type: "integer", minimum: 0 } },
  },
  Dnd5eSrdManualLevelOneOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "summary", "automation", "source", "sourcePage", "sourcePdfPage"],
    properties: {
      id: idSchema,
      name: stringSchema,
      summary: stringSchema,
      automation: { type: "string", enum: ["manual"] },
      source: stringSchema,
      sourcePage: { type: "integer", minimum: 1 },
      sourcePdfPage: { type: "integer", minimum: 0 },
    },
  },
  Dnd5eSrdEldritchInvocationOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "minimumWarlockLevel", "summary", "automation", "source", "sourcePage", "sourcePdfPage"],
    properties: { id: idSchema, name: stringSchema, minimumWarlockLevel: { type: "integer", minimum: 1 }, grantedSpellId: idSchema, pactTomeCantripCount: { type: "integer", minimum: 0 }, pactTomeRitualCount: { type: "integer", minimum: 0 }, summary: stringSchema, automation: { type: "string", enum: ["item", "manual"] }, source: stringSchema, sourcePage: { type: "integer", minimum: 1 }, sourcePdfPage: { type: "integer", minimum: 0 } },
  },
  Dnd5eSrdOriginFeatOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "source", "sourcePage", "sourcePdfPage"],
    properties: { id: stringSchema, name: stringSchema, magicInitiateClass: idSchema, cantripCount: { type: "integer", minimum: 0 }, levelOneSpellCount: { type: "integer", minimum: 0 }, skilledProficiencyCount: { type: "integer", minimum: 0 }, source: stringSchema, sourcePage: { type: "integer", minimum: 1 }, sourcePdfPage: { type: "integer", minimum: 0 } },
  },
  Dnd5eSrdSkilledProficiencyOption: {
    type: "object",
    additionalProperties: false,
    required: ["id", "label", "category", "source"],
    properties: { id: idSchema, label: stringSchema, category: { type: "string", enum: ["skill", "tool"] }, source: stringSchema },
  },
  Dnd5eSrdCharacterOrigins: {
    type: "object",
    additionalProperties: true,
    required: ["draconicAncestors", "giantAncestries", "classSkillChoices", "languages", "originLanguageChoice", "classLanguageChoices", "classStartingEquipment", "backgroundStartingEquipment", "weaponMasteryOptions", "classWeaponMasteryChoices", "spellOptions", "classSpellChoices", "levelOneClassFeatureChoices", "fightingStyles", "divineOrders", "primalOrders", "eldritchInvocations", "originFeatOptions", "skilledProficiencyOptions"],
    properties: {
      draconicAncestors: arrayOf(schemaRef("Dnd5eSrdDraconicAncestor")),
      giantAncestries: arrayOf(schemaRef("Dnd5eSrdGiantAncestryChoice")),
      classSkillChoices: arrayOf(schemaRef("Dnd5eSrdClassSkillChoice")),
      languages: arrayOf(schemaRef("Dnd5eSrdLanguageOption")),
      originLanguageChoice: schemaRef("Dnd5eSrdOriginLanguageChoice"),
      classLanguageChoices: arrayOf(schemaRef("Dnd5eSrdClassLanguageChoice")),
      classStartingEquipment: arrayOf(schemaRef("Dnd5eSrdClassStartingEquipment")),
      backgroundStartingEquipment: arrayOf(schemaRef("Dnd5eSrdBackgroundStartingEquipment")),
      weaponMasteryOptions: arrayOf(schemaRef("Dnd5eSrdWeaponMasteryOption")),
      classWeaponMasteryChoices: arrayOf(schemaRef("Dnd5eSrdClassWeaponMasteryChoice")),
      spellOptions: arrayOf(schemaRef("Dnd5eSrdSpellChoiceOption")),
      classSpellChoices: arrayOf(schemaRef("Dnd5eSrdClassSpellChoice")),
      levelOneClassFeatureChoices: arrayOf(schemaRef("Dnd5eSrdLevelOneClassFeatureChoice")),
      fightingStyles: arrayOf(schemaRef("Dnd5eSrdManualLevelOneOption")),
      divineOrders: arrayOf(schemaRef("Dnd5eSrdManualLevelOneOption")),
      primalOrders: arrayOf(schemaRef("Dnd5eSrdManualLevelOneOption")),
      eldritchInvocations: arrayOf(schemaRef("Dnd5eSrdEldritchInvocationOption")),
      originFeatOptions: arrayOf(schemaRef("Dnd5eSrdOriginFeatOption")),
      skilledProficiencyOptions: arrayOf(schemaRef("Dnd5eSrdSkilledProficiencyOption")),
    },
  },
  SystemMonsterCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      threatId: idSchema,
      customMonsterItemId: idSchema,
      name: stringSchema,
      ownerUserId: idSchema,
    },
  },
  EncounterMonsterPlacementDraft: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y", "width", "height"],
    properties: {
      threatId: idSchema,
      customMonsterItemId: idSchema,
      name: { type: "string", maxLength: 160 },
      ownerUserId: idSchema,
      x: { type: "number" },
      y: { type: "number" },
      width: { type: "number", exclusiveMinimum: 0 },
      height: { type: "number", exclusiveMinimum: 0 },
      layer: { type: "string", enum: ["map", "player", "gm"] },
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
    },
  },
  EncounterMonsterPlacementBatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["systemId", "expectedUpdatedAt", "placements"],
    properties: {
      systemId: idSchema,
      expectedUpdatedAt: dateTimeSchema,
      placements: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: schemaRef("EncounterMonsterPlacementDraft"),
      },
    },
  },
  SystemCharacterImportRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      ownerUserId: idSchema,
    },
  },
  Dnd5eSrdWeaponMasteryUse: {
    type: "object",
    additionalProperties: false,
    required: ["use"],
    properties: {
      use: { type: "boolean" },
      damageDealt: { type: "boolean", description: "Required true for Vex or Slow automation when the ordinary weapon hit deals damage." },
      nickExtraAttack: { type: "boolean", description: "Declares the Light extra attack folded into the current Attack action by Nick." },
      secondaryTargetActorId: idSchema,
      geometryConfirmed: { type: "boolean", description: "Explicit user review for Cleave reach/adjacency; never inferred from token geometry." },
      pushDistanceFeet: { type: "integer", minimum: 0, maximum: 10 },
    },
  },
  SystemActorActionRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      expectedUpdatedAt: { type: "string", format: "date-time" },
      preparedPreviewKey: stringSchema,
      entryId: idSchema,
      conditionId: idSchema,
      optionId: idSchema,
      quantity: { type: "number" },
      restType: { type: "string", enum: ["short", "long"] },
      rollId: {
        ...idSchema,
        description: "System roll identifier. D&D Rage lifecycle actions use feature-rage, feature-rage-extend, and feature-rage-end through the prepared-action protocol.",
      },
      ability: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      targetActorId: idSchema,
      targetActorIds: arrayOf(idSchema),
      consumeResources: { type: "boolean" },
      applyEffect: { type: "boolean" },
      spellSlotLevel: { type: "number" },
      resourceAmount: { type: "number" },
      useFreeResource: { type: "boolean" },
      effectChoice: stringSchema,
      saveOutcomes: {
        type: "object",
        additionalProperties: { type: "string", enum: ["success", "failure"] },
      },
      weaponMastery: schemaRef("Dnd5eSrdWeaponMasteryUse"),
      reactionUse: { type: "boolean" },
      rechargeCheck: { type: "number" },
      commit: { type: "boolean" },
      preview: { type: "boolean" },
      prepare: { type: "boolean" },
      controlledCreature: {
        type: "object",
        additionalProperties: false,
        properties: {
          sceneId: idSchema,
          token: { type: "object", additionalProperties: false, properties: { name: stringSchema, x: { type: "number" }, y: { type: "number" }, width: { type: "number", exclusiveMinimum: 0 }, height: { type: "number", exclusiveMinimum: 0 }, rotation: { type: "number" }, hidden: { type: "boolean" }, disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] }, imageAssetId: idSchema } },
        },
      },
    },
  },
  SystemActorAdvanceRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      optionId: idSchema,
      featId: idSchema,
      abilityChoices: {
        type: "object",
        additionalProperties: { type: "number" },
      },
      multiclassInto: stringSchema,
      hitPointMode: { type: "string", enum: ["fixed", "roll"] },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      preparedPreviewKey: stringSchema,
    },
  },
  SystemActorAdvanceResponse: {
    type: "object",
    additionalProperties: false,
    required: ["advancement", "actor"],
    properties: {
      advancement: { type: "object", additionalProperties: true },
      advancementRoll: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  SystemActorRestRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      restType: { type: "string", enum: ["short", "long"] },
      arcaneRecovery: {
        type: "object",
        additionalProperties: { type: "number" },
      },
      hitDice: arrayOf({
        type: "object",
        additionalProperties: false,
        properties: { className: stringSchema },
      }),
      expectedUpdatedAt: { type: "string", format: "date-time" },
      preparedPreviewKey: stringSchema,
    },
  },
  SystemActorRestResponse: {
    type: "object",
    additionalProperties: false,
    required: ["rest", "actor"],
    properties: {
      rest: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  DndRulesRevisionMap: {
    type: "object",
    maxProperties: 500,
    additionalProperties: { type: "string", format: "date-time" },
  },
  DndRulesMutationUndoDescriptor: {
    type: "object",
    additionalProperties: false,
    required: ["mutationId", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      mutationId: idSchema,
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedItemUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedCombatUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndRulesMutationUndoRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedItemUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedCombatUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndRulesMutation: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "kind", "preparedPreviewKey", "committedByUserId", "status", "roots", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      kind: { type: "string", enum: ["typed_damage", "action", "effect_schedule", "concentration"] },
      preparedPreviewKey: stringSchema,
      committedByUserId: idSchema,
      status: { type: "string", enum: ["applied", "undone"] },
      roots: { type: "object", additionalProperties: true },
      undoneAt: { type: "string", format: "date-time" },
      undoneByUserId: idSchema,
    },
  },
  DndRulesMutationUndoResult: {
    type: "object",
    additionalProperties: false,
    required: ["undone", "mutation", "actors", "items"],
    properties: {
      undone: { type: "boolean", enum: [true] },
      mutation: schemaRef("DndRulesMutation"),
      actors: arrayOf(schemaRef("Actor")),
      items: arrayOf(schemaRef("Item")),
      combat: schemaRef("Combat"),
    },
  },
  Dnd5eSrdPendingAdvancement: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "actorId", "systemId", "status", "request", "actorUpdatedAt", "createdByUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      actorId: idSchema,
      systemId: { type: "string", enum: ["dnd-5e-srd"] },
      status: { type: "string", enum: ["draft", "ready"] },
      request: { type: "object", additionalProperties: true },
      preparedPreviewKey: stringSchema,
      actorUpdatedAt: { type: "string", format: "date-time" },
      createdByUserId: idSchema,
    },
  },
  Dnd5eSrdPendingAdvancementCancelRequest: {
    type: "object",
    additionalProperties: false,
    required: ["pendingAdvancementId", "expectedUpdatedAt"],
    properties: {
      pendingAdvancementId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  Dnd5eSrdPendingAdvancementCancelResult: {
    type: "object",
    additionalProperties: false,
    required: ["cancelled", "actorId", "pendingAdvancementId"],
    properties: {
      cancelled: { type: "boolean", enum: [true] },
      actorId: idSchema,
      pendingAdvancementId: idSchema,
    },
  },
  Dnd5eSrdTypedDamageApplyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["preparedPreviewKey", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      preparedPreviewKey: stringSchema,
      expectedActorUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedItemUpdatedAt: schemaRef("DndRulesRevisionMap"),
      expectedCombatUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  Dnd5eSrdTypedDamageApplyResult: {
    type: "object",
    additionalProperties: false,
    required: ["applied", "actor", "actors", "previews", "rulesMutationId", "undo"],
    properties: {
      applied: { type: "boolean", enum: [true] },
      actor: schemaRef("Actor"),
      actors: arrayOf(schemaRef("Actor")),
      combat: schemaRef("Combat"),
      previews: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["actorId", "actorName", "preview"],
        properties: {
          actorId: idSchema,
          actorName: stringSchema,
          preview: { type: "object", additionalProperties: true },
        },
      }),
      rulesMutationId: idSchema,
      undo: schemaRef("DndRulesMutationUndoDescriptor"),
    },
  },
  Dnd5eSrdRulesPreviewRequest: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["operation"],
        properties: {
          operation: { type: "string", enum: ["advancement"] },
          prepare: { type: "boolean" },
          optionId: idSchema,
          className: stringSchema,
          subclassId: idSchema,
          weaponMasteryChoices: {
            type: "array",
            maxItems: 10,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 80 },
          },
          featId: idSchema,
          hitPointMode: { type: "string", enum: ["fixed", "roll"] },
          hitPointRoll: { type: "number" },
          abilityChoices: {
            type: "object",
            additionalProperties: { type: "number" },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["operation", "restType"],
        properties: {
          operation: { type: "string", enum: ["rest"] },
          prepare: { type: "boolean" },
          restType: { type: "string", enum: ["short", "long"] },
          hitDice: arrayOf({
            type: "object",
            additionalProperties: false,
            properties: {
              className: stringSchema,
              roll: { type: "number" },
            },
          }),
          arcaneRecovery: {
            type: "object",
            additionalProperties: { type: "number" },
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["operation", "damageType"],
        properties: {
          operation: { type: "string", enum: ["typed-damage"] },
          prepare: { type: "boolean" },
          criticalHit: { type: "boolean" },
          amount: { type: "number", minimum: 0 },
          formula: stringSchema,
          components: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["amount", "damageType"],
              properties: {
                amount: { type: "number", minimum: 0 },
                damageType: { type: "string", minLength: 1, maxLength: 80 },
              },
            },
          },
          targetActorIds: { ...arrayOf(idSchema), maxItems: 50, uniqueItems: true },
          targetDamages: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["actorId", "amount"],
              properties: {
                actorId: idSchema,
                amount: { type: "number", minimum: 0 },
                damageType: { anyOf: [stringSchema, arrayOf(stringSchema)] },
              },
            },
          },
          damageType: {
            anyOf: [stringSchema, arrayOf(stringSchema)],
          },
        },
      },
    ],
  },
  Dnd5eSrdSpellPreparationBlocker: {
    type: "object",
    additionalProperties: false,
    required: ["code", "message"],
    properties: {
      code: {
        type: "string",
        enum: [
          "unsupported_actor",
          "manual_legacy_spellcasting",
          "capacity_unverified",
          "later_level_spell_acquisition_manual",
          "timing_mismatch",
          "always_prepared_excluded",
          "spell_not_owned",
          "class_spell_unverified",
          "wizard_spellbook_unverified",
          "capacity_exceeded",
          "duplicate_selection",
        ],
      },
      message: stringSchema,
      itemId: idSchema,
    },
  },
  Dnd5eSrdSpellPreparationCapacity: {
    type: "object",
    additionalProperties: false,
    required: ["className", "limit", "selected", "alwaysPrepared", "source"],
    properties: {
      className: stringSchema,
      limit: { type: "integer", minimum: 0 },
      selected: { type: "integer", minimum: 0 },
      alwaysPrepared: { type: "integer", minimum: 0 },
      source: { type: "string", enum: ["stored", "class-progression", "level-one-class"] },
      classes: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["className", "limit", "selected"],
        properties: {
          className: stringSchema,
          limit: { type: "integer", minimum: 0 },
          selected: { type: "integer", minimum: 0 },
        },
      }),
    },
  },
  Dnd5eSrdSpellPreparationChange: {
    type: "object",
    additionalProperties: false,
    required: ["itemId", "name", "compendiumEntryId", "fromPrepared", "toPrepared"],
    properties: {
      itemId: idSchema,
      name: stringSchema,
      compendiumEntryId: idSchema,
      fromPrepared: { type: "boolean" },
      toPrepared: { type: "boolean" },
    },
  },
  Dnd5eSrdSpellPreparationPlan: {
    type: "object",
    additionalProperties: false,
    required: ["status", "actorId", "timing", "selectedSpellIds", "eligibleSpellIds", "alwaysPreparedSpellIds", "changes", "blockers", "warnings"],
    properties: {
      status: { type: "string", enum: ["ready", "blocked"] },
      actorId: idSchema,
      className: stringSchema,
      timing: { type: "string", enum: ["long-rest", "class-level"] },
      requiredTiming: { type: "string", enum: ["long-rest", "class-level"] },
      capacity: schemaRef("Dnd5eSrdSpellPreparationCapacity"),
      selectedSpellIds: arrayOf(idSchema),
      eligibleSpellIds: arrayOf(idSchema),
      alwaysPreparedSpellIds: arrayOf(idSchema),
      ritualCastableSpellIds: arrayOf(idSchema),
      changes: arrayOf(schemaRef("Dnd5eSrdSpellPreparationChange")),
      blockers: arrayOf(schemaRef("Dnd5eSrdSpellPreparationBlocker")),
      warnings: arrayOf(stringSchema),
    },
  },
  Dnd5eSrdSpellPreparationPreviewRequest: {
    type: "object",
    additionalProperties: false,
    required: ["selectedSpellIds", "timing", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      selectedSpellIds: arrayOf(idSchema),
      timing: { type: "string", enum: ["long-rest", "class-level"] },
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
      expectedItemUpdatedAt: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    },
  },
  Dnd5eSrdSpellPreparationPreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["status", "actorId", "timing", "selectedSpellIds", "eligibleSpellIds", "alwaysPreparedSpellIds", "changes", "blockers", "warnings", "preparedPreviewKey", "actorUpdatedAt", "itemUpdatedAt"],
    properties: {
      status: { type: "string", enum: ["ready", "blocked"] },
      actorId: idSchema,
      className: stringSchema,
      timing: { type: "string", enum: ["long-rest", "class-level"] },
      requiredTiming: { type: "string", enum: ["long-rest", "class-level"] },
      capacity: schemaRef("Dnd5eSrdSpellPreparationCapacity"),
      selectedSpellIds: arrayOf(idSchema),
      eligibleSpellIds: arrayOf(idSchema),
      alwaysPreparedSpellIds: arrayOf(idSchema),
      ritualCastableSpellIds: arrayOf(idSchema),
      changes: arrayOf(schemaRef("Dnd5eSrdSpellPreparationChange")),
      blockers: arrayOf(schemaRef("Dnd5eSrdSpellPreparationBlocker")),
      warnings: arrayOf(stringSchema),
      preparedPreviewKey: stringSchema,
      actorUpdatedAt: { type: "string", format: "date-time" },
      itemUpdatedAt: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    },
  },
  Dnd5eSrdSpellPreparationApplyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["preparedPreviewKey", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      preparedPreviewKey: stringSchema,
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
      expectedItemUpdatedAt: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    },
  },
  Dnd5eSrdSpellPreparationMutationResult: {
    type: "object",
    additionalProperties: false,
    required: ["applied", "actor", "items", "plan"],
    properties: {
      applied: { type: "boolean", enum: [true] },
      actor: schemaRef("Actor"),
      items: arrayOf(schemaRef("Item")),
      plan: schemaRef("Dnd5eSrdSpellPreparationPlan"),
    },
  },
  Dnd5eSrdValidationIssue: {
    type: "object",
    additionalProperties: false,
    required: ["path", "severity", "code", "message"],
    properties: {
      path: { type: "string" },
      severity: { type: "string", enum: ["error", "warning"] },
      code: stringSchema,
      message: stringSchema,
    },
  },
  Dnd5eSrdRepairPatch: {
    type: "object",
    additionalProperties: false,
    required: ["operation", "path"],
    properties: {
      operation: { type: "string", enum: ["add", "remove", "replace"] },
      path: { type: "string" },
      before: {},
      after: {},
    },
  },
  Dnd5eSrdRepairCandidate: {
    type: "object",
    additionalProperties: false,
    required: ["id", "entityKind", "entityId", "confidence", "application", "operation", "path", "after", "issue", "rationale", "inverse", "source"],
    properties: {
      id: stringSchema,
      entityKind: { type: "string", enum: ["actor", "item"] },
      entityId: idSchema,
      confidence: { type: "string", enum: ["deterministic"] },
      application: { type: "string", enum: ["confirmation_required"] },
      operation: { type: "string", enum: ["add", "replace"] },
      path: { type: "string" },
      before: {},
      after: {},
      issue: schemaRef("Dnd5eSrdValidationIssue"),
      rationale: stringSchema,
      inverse: schemaRef("Dnd5eSrdRepairPatch"),
      source: {
        type: "object",
        additionalProperties: false,
        required: ["systemId", "rulesVersion", "schemaVersion", "previewVersion"],
        properties: {
          systemId: idSchema,
          rulesVersion: stringSchema,
          schemaVersion: stringSchema,
          previewVersion: stringSchema,
        },
      },
    },
  },
  Dnd5eSrdRepairPreview: {
    type: "object",
    additionalProperties: false,
    required: ["previewVersion", "entityKind", "entityId", "status", "readOnly", "candidates", "manualIssues"],
    properties: {
      previewVersion: stringSchema,
      entityKind: { type: "string", enum: ["actor", "item"] },
      entityId: idSchema,
      status: { type: "string", enum: ["no_changes", "changes_available"] },
      readOnly: { type: "boolean", enum: [true] },
      candidates: arrayOf(schemaRef("Dnd5eSrdRepairCandidate")),
      manualIssues: arrayOf(schemaRef("Dnd5eSrdValidationIssue")),
      proposedEntity: { type: "object", additionalProperties: true },
    },
  },
  Dnd5eSrdValidationReport: {
    type: "object",
    additionalProperties: false,
    required: ["entityKind", "entityId", "systemId", "rulesVersion", "schemaVersion", "valid", "issues"],
    properties: {
      entityKind: { type: "string", enum: ["actor", "item"] },
      entityId: idSchema,
      systemId: idSchema,
      rulesVersion: stringSchema,
      schemaVersion: stringSchema,
      valid: { type: "boolean" },
      issues: arrayOf(schemaRef("Dnd5eSrdValidationIssue")),
    },
  },
  Dnd5eSrdRulesValidationResponse: {
    type: "object",
    additionalProperties: false,
    required: ["actor", "items", "repairPreview"],
    properties: {
      actor: schemaRef("Dnd5eSrdValidationReport"),
      items: arrayOf(schemaRef("Dnd5eSrdValidationReport")),
      repairPreview: {
        type: "object",
        additionalProperties: false,
        required: ["actor", "items"],
        properties: {
          actor: schemaRef("Dnd5eSrdRepairPreview"),
          items: arrayOf(schemaRef("Dnd5eSrdRepairPreview")),
        },
      },
    },
  },
  Dnd5eSrdRulesPreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["previewVersion", "rulesVersion", "actorSchemaVersion", "itemSchemaVersion", "operation", "actorId", "status", "blockers", "serverRolls", "validation", "changes"],
    properties: {
      previewVersion: stringSchema,
      rulesVersion: stringSchema,
      actorSchemaVersion: stringSchema,
      itemSchemaVersion: stringSchema,
      operation: { type: "string", enum: ["advancement", "rest", "typed-damage"] },
      actorId: idSchema,
      status: { type: "string", enum: ["ready", "blocked"] },
      blockers: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["path", "code", "message"],
        properties: { path: { type: "string" }, code: stringSchema, message: stringSchema },
      }),
      serverRolls: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["id", "path", "formula", "reason"],
        properties: { id: idSchema, path: { type: "string" }, formula: stringSchema, reason: stringSchema },
      }),
      validation: {
        type: "object",
        additionalProperties: false,
        required: ["actor", "items"],
        properties: {
          actor: schemaRef("Dnd5eSrdValidationReport"),
          items: arrayOf(schemaRef("Dnd5eSrdValidationReport")),
        },
      },
      changes: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["path", "operation", "source"],
        properties: {
          path: { type: "string" },
          operation: { type: "string", enum: ["add", "remove", "replace"] },
          before: {},
          after: {},
          source: {
            type: "object",
            additionalProperties: false,
            required: ["systemId", "rulesVersion", "schemaVersion", "rule"],
            properties: {
              systemId: idSchema,
              rulesVersion: stringSchema,
              schemaVersion: stringSchema,
              rule: { type: "string", enum: ["advancement", "rest", "typed-damage"] },
            },
          },
        },
      }),
      proposedData: { type: "object", additionalProperties: true },
      details: { type: "object", additionalProperties: true },
      batch: {
        type: "object",
        additionalProperties: false,
        required: ["targets"],
        properties: {
          targets: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["actorId", "actorName", "preview"],
              properties: {
                actorId: idSchema,
                actorName: stringSchema,
                preview: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
      draft: {
        type: "object",
        additionalProperties: false,
        required: ["pendingAdvancement"],
        properties: { pendingAdvancement: schemaRef("Dnd5eSrdPendingAdvancement") },
      },
      preparation: {
        type: "object",
        additionalProperties: false,
        required: ["preparedPreviewKey", "actorUpdatedAt", "request"],
        properties: {
          preparedPreviewKey: stringSchema,
          idempotencyKey: stringSchema,
          actorUpdatedAt: {
            oneOf: [
              { type: "string", format: "date-time" },
              schemaRef("DndRulesRevisionMap"),
            ],
          },
          itemUpdatedAt: schemaRef("DndRulesRevisionMap"),
          combatId: idSchema,
          combatUpdatedAt: { type: "string", format: "date-time" },
          request: { type: "object", additionalProperties: true },
          pendingAdvancement: schemaRef("Dnd5eSrdPendingAdvancement"),
          advancementRoll: { type: "object", additionalProperties: true },
          damageRoll: { type: "object", additionalProperties: true },
          resolutionHash: stringSchema,
        },
      },
    },
  },
  SystemActorConditionApplyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["conditionId", "expectedUpdatedAt"],
    properties: {
      conditionId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      level: { type: "integer", minimum: 1, maximum: 6 },
      overrideReason: stringSchema,
    },
  },
  SystemActorConditionResponse: {
    type: "object",
    additionalProperties: true,
    required: ["actor"],
    properties: {
      entry: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  SystemMonsterCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["threat", "actor"],
    properties: {
      threat: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  EncounterMonsterPlacementResult: {
    type: "object",
    additionalProperties: false,
    required: ["threat", "actor", "sceneToken"],
    properties: {
      threat: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      sceneToken: schemaRef("Token"),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  EncounterMonsterPlacementBatchResponse: {
    type: "object",
    additionalProperties: false,
    required: ["placements", "scene"],
    properties: {
      placements: arrayOf(schemaRef("EncounterMonsterPlacementResult")),
      scene: schemaRef("Scene"),
    },
  },
  SystemCharacterImportResponse: {
    type: "object",
    additionalProperties: false,
    required: ["import", "actor", "items"],
    properties: {
      import: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      items: arrayOf(schemaRef("Item")),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  SystemActorCompendiumRequest: {
    type: "object",
    additionalProperties: false,
    required: ["entryId", "expectedUpdatedAt"],
    properties: {
      entryId: idSchema,
      expectedUpdatedAt: { type: "string", format: "date-time" },
      conflictChoice: { type: "string", enum: ["keep_existing", "replace_existing", "merge_existing"] },
    },
  },
  SystemActorCompendiumResponse: {
    type: "object",
    additionalProperties: false,
    required: ["entry", "actor", "resolution"],
    properties: {
      entry: schemaRef("CompendiumCatalogEntry"),
      actor: schemaRef("Actor"),
      item: schemaRef("Item"),
      sheet: { type: "object", additionalProperties: true },
      resolution: { type: "string", enum: ["added", "kept_existing", "replaced_existing"] },
    },
  },
  SystemEquipmentPurchaseRequest: {
    type: "object",
    additionalProperties: false,
    required: ["entryId", "expectedUpdatedAt"],
    properties: {
      entryId: idSchema,
      quantity: { type: "integer", minimum: 1 },
      expectedUpdatedAt: { type: "string", format: "date-time" },
      conflictChoice: { type: "string", enum: ["keep_existing", "replace_existing", "merge_existing"] },
    },
  },
  SystemEquipmentPurchaseResponse: {
    type: "object",
    additionalProperties: false,
    required: ["entry", "purchase", "actor", "item", "resolution"],
    properties: {
      entry: schemaRef("CompendiumCatalogEntry"),
      purchase: { type: "object", additionalProperties: true },
      actor: schemaRef("Actor"),
      item: schemaRef("Item"),
      sheet: { type: "object", additionalProperties: true },
      resolution: { type: "string", enum: ["purchased", "kept_existing", "merged_existing", "replaced_existing"] },
    },
  },
  SystemActorResponse: {
    type: "object",
    additionalProperties: true,
    required: ["actor"],
    properties: {
      actor: schemaRef("Actor"),
      item: schemaRef("Item"),
      items: arrayOf(schemaRef("Item")),
      sheet: { type: "object", additionalProperties: true },
    },
  },
  SystemPreparedRollResult: {
    type: "object",
    additionalProperties: false,
    required: ["formula", "total", "terms"],
    properties: {
      formula: stringSchema,
      targetActorId: idSchema,
      total: { type: "number" },
      terms: arrayOf(schemaRef("DiceRollTerm")),
    },
  },
  SystemRollResponse: {
    type: "object",
    additionalProperties: true,
    required: ["actor", "sheet"],
    properties: {
      roll: schemaRef("DiceRoll"),
      rolls: arrayOf({
        anyOf: [
          schemaRef("DiceRoll"),
          schemaRef("SystemPreparedRollResult"),
        ],
      }),
      chat: schemaRef("ChatMessage"),
      chatMessages: arrayOf(schemaRef("ChatMessage")),
      actor: schemaRef("Actor"),
      updatedActors: arrayOf(schemaRef("Actor")),
      sheet: { type: "object", additionalProperties: true },
      quickRoll: { type: "object", additionalProperties: true },
      usage: { type: "object", additionalProperties: true },
      effect: { type: "object", additionalProperties: true },
      effects: arrayOf({ type: "object", additionalProperties: true }),
      resolution: { type: "object", additionalProperties: true },
      controlledCreatureHandoff: schemaRef("DndControlledCreatureActionHandoff"),
      status: { type: "string", enum: ["ready"] },
      preparation: {
        type: "object",
        additionalProperties: true,
        required: ["preparedPreviewKey", "sourceActorId", "preparedAt", "request", "revisions", "rolledResults", "resolutionHash"],
        properties: {
          preparedPreviewKey: stringSchema,
          sourceActorId: idSchema,
          preparedAt: { type: "string", format: "date-time" },
          request: { type: "object", additionalProperties: true },
          revisions: { type: "object", additionalProperties: true },
          rolledResults: { type: "array", items: { type: "object", additionalProperties: true } },
          resolutionHash: stringSchema,
        },
      },
      rulesMutationId: idSchema,
      undo: schemaRef("DndRulesMutationUndoDescriptor"),
    },
  },
  SystemEncounterPlanRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      partyActorIds: { ...arrayOf(idSchema), maxItems: 100, uniqueItems: true },
      threats: { ...arrayOf(schemaRef("EncounterThreatSelection")), maxItems: 100 },
      createEncounter: { type: "boolean" },
      name: stringSchema,
      expectedUpdatedAt: dateTimeSchema,
    },
    allOf: [{
      if: { required: ["createEncounter"], properties: { createEncounter: { const: true } } },
      then: { required: ["expectedUpdatedAt"] },
    }],
  },
  SystemEncounterPlanResponse: {
    type: "object",
    additionalProperties: true,
    required: ["plan"],
    properties: {
      plan: { type: "object", additionalProperties: true },
      encounter: schemaRef("Encounter"),
    },
  },
  CompendiumLicense: {
    type: "object",
    additionalProperties: false,
    required: ["name", "usage"],
    properties: {
      name: stringSchema,
      url: { type: "string", format: "uri" },
      usage: { type: "string", enum: ["srd", "open", "user_provided", "private_home_game"] },
      attribution: stringSchema,
    },
  },
  CompendiumProvenance: {
    type: "object",
    additionalProperties: false,
    required: ["sourceKind", "sourceName", "sourceVersion", "contentVersion", "systemId", "systemVersion", "rulesVersion", "license"],
    properties: {
      sourceKind: { type: "string", enum: ["srd", "bundled", "user"] },
      sourceName: stringSchema,
      sourceVersion: stringSchema,
      contentVersion: stringSchema,
      systemId: idSchema,
      systemVersion: stringSchema,
      rulesVersion: stringSchema,
      license: schemaRef("CompendiumLicense"),
    },
  },
  CompendiumCatalogEntry: {
    type: "object",
    additionalProperties: false,
    required: ["id", "type", "name", "summary", "data", "provenance"],
    properties: {
      id: idSchema,
      type: stringSchema,
      name: stringSchema,
      summary: { type: "string" },
      data: { type: "object", additionalProperties: true },
      provenance: schemaRef("CompendiumProvenance"),
    },
  },
  CompendiumProvenanceSummary: {
    type: "object",
    additionalProperties: false,
    required: ["totalEntries", "filteredEntries", "types", "sources"],
    properties: {
      totalEntries: { type: "integer", minimum: 0 },
      filteredEntries: { type: "integer", minimum: 0 },
      types: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      sources: arrayOf({
        type: "object",
        additionalProperties: false,
        required: ["sourceKind", "sourceName", "sourceVersion", "contentVersion", "license", "entryCount"],
        properties: {
          sourceKind: { type: "string", enum: ["srd", "bundled", "user"] },
          sourceName: stringSchema,
          sourceVersion: stringSchema,
          contentVersion: stringSchema,
          license: schemaRef("CompendiumLicense"),
          entryCount: { type: "integer", minimum: 0 },
        },
      }),
    },
  },
  CompendiumConflict: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "entryId", "requestedVersion", "choices"],
    properties: {
      kind: { type: "string", enum: ["exact_duplicate", "version_conflict"] },
      entryId: idSchema,
      requestedVersion: stringSchema,
      existingVersion: stringSchema,
      existingItemId: idSchema,
      choices: arrayOf({ type: "string", enum: ["keep_existing", "replace_existing", "merge_existing"] }),
    },
  },
  CompendiumConflictResponse: {
    type: "object",
    additionalProperties: false,
    required: ["error", "code", "message", "conflict", "entry"],
    properties: {
      error: { type: "string", enum: ["conflict"] },
      code: { type: "string", enum: ["compendium_conflict"] },
      message: stringSchema,
      conflict: schemaRef("CompendiumConflict"),
      entry: schemaRef("CompendiumCatalogEntry"),
    },
  },
  SystemCompendium: {
    type: "object",
    additionalProperties: false,
    required: ["systemId", "entries", "provenanceSummary", "filters"],
    properties: {
      systemId: idSchema,
      entries: arrayOf(schemaRef("CompendiumCatalogEntry")),
      provenanceSummary: schemaRef("CompendiumProvenanceSummary"),
      filters: {
        type: "object",
        additionalProperties: false,
        required: ["q", "types"],
        properties: {
          q: { type: "string" },
          types: arrayOf(stringSchema),
        },
      },
    },
  },
  DndCharacterReviewValidationIssue: {
    type: "object",
    additionalProperties: false,
    required: ["entityKind", "entityId", "path", "severity", "code", "message"],
    properties: {
      entityKind: { type: "string", enum: ["actor", "item"] },
      entityId: idSchema,
      path: stringSchema,
      severity: { type: "string", enum: ["error", "warning"] },
      code: stringSchema,
      message: stringSchema,
    },
  },
  DndCharacterReviewValidationSnapshot: {
    type: "object",
    additionalProperties: false,
    required: ["systemId", "rulesVersion", "actorSchemaVersion", "itemSchemaVersion", "errors", "warnings", "issues"],
    properties: {
      systemId: { type: "string", enum: ["dnd-5e-srd"] },
      rulesVersion: stringSchema,
      actorSchemaVersion: stringSchema,
      itemSchemaVersion: stringSchema,
      errors: { type: "integer", minimum: 0 },
      warnings: { type: "integer", minimum: 0 },
      issues: arrayOf(schemaRef("DndCharacterReviewValidationIssue")),
    },
  },
  DndCharacterReviewDecision: {
    type: "object",
    additionalProperties: false,
    required: ["status", "decidedAt", "decidedByUserId", "overrideValidation"],
    properties: {
      status: { type: "string", enum: ["approved", "changes_requested"] },
      decidedAt: { type: "string", format: "date-time" },
      decidedByUserId: idSchema,
      reason: stringSchema,
      overrideValidation: { type: "boolean" },
    },
  },
  DndCharacterReviewState: {
    type: "object",
    additionalProperties: false,
    required: ["version", "id", "status", "fingerprint", "submittedAt", "submittedByUserId", "validation"],
    properties: {
      version: { type: "integer", enum: [1] },
      id: idSchema,
      status: { type: "string", enum: ["submitted", "approved", "changes_requested"] },
      fingerprint: { type: "string", pattern: "^sha256:" },
      submittedAt: { type: "string", format: "date-time" },
      submittedByUserId: idSchema,
      validation: schemaRef("DndCharacterReviewValidationSnapshot"),
      decision: schemaRef("DndCharacterReviewDecision"),
    },
  },
  DndCharacterReviewEntry: {
    type: "object",
    additionalProperties: false,
    required: ["actor", "effectiveStatus", "stale", "currentFingerprint", "currentValidation", "expectedActorUpdatedAt", "expectedItemUpdatedAt"],
    properties: {
      actor: schemaRef("Actor"),
      review: schemaRef("DndCharacterReviewState"),
      effectiveStatus: { type: "string", enum: ["not_submitted", "submitted", "approved", "changes_requested", "stale"] },
      stale: { type: "boolean" },
      currentFingerprint: stringSchema,
      currentValidation: schemaRef("DndCharacterReviewValidationSnapshot"),
      expectedActorUpdatedAt: { type: "string", format: "date-time" },
      expectedItemUpdatedAt: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    },
  },
  DndCharacterReviewListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["policy", "campaignUpdatedAt", "entries"],
    properties: {
      policy: { type: "object", additionalProperties: false, required: ["mode", "configured"], properties: { mode: { type: "string", enum: ["optional", "required"] }, configured: { type: "boolean" } } },
      campaignUpdatedAt: { type: "string", format: "date-time" },
      entries: arrayOf(schemaRef("DndCharacterReviewEntry")),
    },
  },
  DndCustomContentDraft: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "name", "summary", "sourceName", "sourceVersion", "contentVersion", "license", "data"],
    properties: {
      kind: { type: "string", enum: ["monster", "spell", "item", "feat", "species", "background", "subclass", "condition"] },
      name: { type: "string", minLength: 1, maxLength: 120 },
      summary: { type: "string", minLength: 1, maxLength: 600 },
      sourceName: { type: "string", minLength: 1, maxLength: 160 },
      sourceVersion: { type: "string", minLength: 1, maxLength: 64 },
      contentVersion: { type: "string", minLength: 1, maxLength: 64 },
      license: {
        allOf: [schemaRef("CompendiumLicense")],
        description: "Custom content may be open, user-provided, or private home-game content; the SRD usage label is rejected by the runtime.",
      },
      data: {
        type: "object",
        additionalProperties: true,
        description: "D&D-specific fields validated by the selected builder kind; this is not a universal rules DSL.",
      },
      expectedUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndCustomContentIssue: {
    type: "object",
    additionalProperties: false,
    required: ["path", "code", "message"],
    properties: {
      path: stringSchema,
      code: stringSchema,
      message: stringSchema,
    },
  },
  DndCustomContentMutationRequest: {
    allOf: [
      schemaRef("DndCustomContentDraft"),
      {
        type: "object",
        required: ["expectedUpdatedAt"],
        properties: { expectedUpdatedAt: { type: "string", format: "date-time" } },
      },
    ],
  },
  DndCustomContentResponse: {
    type: "object",
    additionalProperties: true,
    required: ["item", "entry", "draft"],
    properties: {
      item: schemaRef("Item"),
      entry: schemaRef("CompendiumCatalogEntry"),
      draft: schemaRef("DndCustomContentDraft"),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
      campaignUpdatedAt: { type: "string", format: "date-time" },
    },
  },
  DndCustomContentPreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["preview", "entry", "warnings"],
    properties: {
      preview: { type: "boolean", enum: [true] },
      entry: schemaRef("CompendiumCatalogEntry"),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
    },
  },
  DndCustomContentInvalidResponse: {
    type: "object",
    additionalProperties: false,
    required: ["error", "issues", "warnings"],
    properties: {
      error: { type: "string", enum: ["custom_content_invalid", "monster_template_invalid", "monster_variant_invalid"] },
      issues: arrayOf(schemaRef("DndCustomContentIssue")),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
    },
  },
  DndMonsterNamedFeature: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 4_000 },
    },
  },
  DndMonsterActionOverride: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 4_000 },
      kind: { type: "string", enum: ["action", "bonusAction", "reaction"] },
      attackBonus: { type: "integer", minimum: -20, maximum: 40 },
      range: { type: "string", maxLength: 160 },
      damageFormula: { type: "string", maxLength: 160 },
      damageType: { type: "string", maxLength: 80 },
      save: {
        type: "object",
        additionalProperties: false,
        required: ["ability", "dc"],
        properties: {
          ability: { type: "string", enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] },
          dc: { type: "integer", minimum: 1, maximum: 40 },
          success: { type: "string", maxLength: 160 },
        },
      },
      condition: { type: "string", maxLength: 160 },
      effects: arrayOf({ type: "string", maxLength: 500 }),
      recharge: { type: "string", maxLength: 80 },
    },
  },
  DndMonsterOverrides: {
    type: "object",
    additionalProperties: false,
    description: "Typed campaign monster replacements. Combat-bearing changes must explicitly include both challengeRating and xp; the runtime never infers either value.",
    properties: {
      size: { type: "string", enum: ["tiny", "small", "medium", "large", "huge", "gargantuan"] },
      creatureType: { type: "string", minLength: 1, maxLength: 80 },
      alignment: { type: "string", maxLength: 80 },
      armorClass: { type: "integer", minimum: 1, maximum: 40 },
      initiative: { type: "integer", minimum: -20, maximum: 30 },
      hitPoints: { type: "integer", minimum: 1, maximum: 1_000_000 },
      hitDice: { type: "string", minLength: 1, maxLength: 80 },
      challengeRating: { type: "string", minLength: 1, maxLength: 16 },
      xp: { type: "integer", minimum: 0, maximum: 100_000_000 },
      proficiencyBonus: { type: "integer", minimum: 2, maximum: 9 },
      speed: { type: "object", additionalProperties: { type: "integer", minimum: 0, maximum: 1_000 } },
      abilities: { type: "object", additionalProperties: { type: "integer", minimum: 1, maximum: 30 } },
      actions: arrayOf(schemaRef("DndMonsterActionOverride")),
      savingThrows: { type: "object", additionalProperties: { type: "number", minimum: -20, maximum: 30 } },
      skills: { type: "object", additionalProperties: { type: "number", minimum: -20, maximum: 30 } },
      senses: arrayOf({ type: "string", maxLength: 120 }),
      languages: arrayOf({ type: "string", maxLength: 80 }),
      gear: arrayOf({ type: "string", maxLength: 160 }),
      traits: arrayOf(schemaRef("DndMonsterNamedFeature")),
      reactions: arrayOf(schemaRef("DndMonsterNamedFeature")),
      legendaryActions: arrayOf(schemaRef("DndMonsterNamedFeature")),
      manualAdjudication: { type: "string", maxLength: 2_000 },
    },
  },
  DndMonsterTemplateDraft: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description", "overrides"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 600 },
      overrides: schemaRef("DndMonsterOverrides"),
      expectedCampaignUpdatedAt: dateTimeSchema,
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  DndMonsterTemplateRecord: {
    type: "object",
    additionalProperties: false,
    required: ["id", "version", "name", "description", "overrides"],
    properties: {
      id: idSchema,
      version: stringSchema,
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 600 },
      overrides: schemaRef("DndMonsterOverrides"),
    },
  },
  DndMonsterTemplateResponse: {
    type: "object",
    additionalProperties: true,
    required: ["item", "template"],
    properties: {
      item: schemaRef("Item"),
      template: schemaRef("DndMonsterTemplateRecord"),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
      campaignUpdatedAt: dateTimeSchema,
    },
  },
  DndMonsterTemplatePreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["preview", "template", "warnings"],
    properties: {
      preview: { type: "boolean", enum: [true] },
      template: schemaRef("DndMonsterTemplateRecord"),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
    },
  },
  DndMonsterBaseReference: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "version", "name", "provenance"],
    properties: {
      kind: { type: "string", enum: ["bundled", "campaign"] },
      id: idSchema,
      version: stringSchema,
      name: stringSchema,
      provenance: schemaRef("CompendiumProvenance"),
    },
  },
  DndMonsterBase: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "version", "name", "provenance", "data"],
    properties: {
      kind: { type: "string", enum: ["bundled", "campaign"] },
      id: idSchema,
      version: stringSchema,
      name: stringSchema,
      provenance: schemaRef("CompendiumProvenance"),
      data: { type: "object", additionalProperties: true },
    },
  },
  DndMonsterVariantDraft: {
    type: "object",
    additionalProperties: false,
    required: ["name", "summary", "sourceName", "sourceVersion", "contentVersion", "license", "base", "overrides"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      summary: { type: "string", minLength: 1, maxLength: 600 },
      sourceName: { type: "string", minLength: 1, maxLength: 160 },
      sourceVersion: { type: "string", minLength: 1, maxLength: 64 },
      contentVersion: { type: "string", minLength: 1, maxLength: 64 },
      license: schemaRef("CompendiumLicense"),
      base: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "id", "version"],
        properties: { kind: { type: "string", enum: ["bundled", "campaign"] }, id: idSchema, version: stringSchema },
      },
      template: {
        type: "object",
        additionalProperties: false,
        required: ["id", "version"],
        properties: { id: idSchema, version: stringSchema },
      },
      overrides: schemaRef("DndMonsterOverrides"),
      expectedCampaignUpdatedAt: dateTimeSchema,
    },
  },
  DndMonsterVariantMetadata: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "base", "overrides", "appliedOverrides"],
    properties: {
      schemaVersion: { type: "string", enum: ["1.0.0"] },
      base: schemaRef("DndMonsterBaseReference"),
      template: {
        type: "object",
        additionalProperties: false,
        required: ["id", "version", "name", "overrides"],
        properties: { id: idSchema, version: stringSchema, name: stringSchema, overrides: schemaRef("DndMonsterOverrides") },
      },
      overrides: schemaRef("DndMonsterOverrides"),
      appliedOverrides: schemaRef("DndMonsterOverrides"),
    },
  },
  DndMonsterVariantDiffEntry: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: { path: stringSchema, before: {}, after: {} },
  },
  DndMonsterVariantPreviewResponse: {
    type: "object",
    additionalProperties: false,
    required: ["preview", "entry", "variant", "diff", "warnings"],
    properties: {
      preview: { type: "boolean", enum: [true] },
      entry: schemaRef("CompendiumCatalogEntry"),
      variant: schemaRef("DndMonsterVariantMetadata"),
      diff: arrayOf(schemaRef("DndMonsterVariantDiffEntry")),
      warnings: arrayOf(schemaRef("DndCustomContentIssue")),
    },
  },
  DndMonsterVariantResponse: {
    allOf: [
      schemaRef("DndCustomContentResponse"),
      {
        type: "object",
        required: ["variant", "diff", "warnings"],
        properties: {
          variant: schemaRef("DndMonsterVariantMetadata"),
          diff: arrayOf(schemaRef("DndMonsterVariantDiffEntry")),
          warnings: arrayOf(schemaRef("DndCustomContentIssue")),
        },
      },
    ],
  },
  ContentImportSource: {
    type: "object",
    additionalProperties: true,
    properties: {
      sourceType: stringSchema,
      adapterId: idSchema,
      name: stringSchema,
      license: { type: "object", additionalProperties: true },
    },
  },
  ContentImportEntity: {
    type: "object",
    additionalProperties: true,
    required: ["id", "kind", "name"],
    properties: {
      id: idSchema,
      kind: stringSchema,
      name: stringSchema,
      selectedByDefault: { type: "boolean" },
      data: { type: "object", additionalProperties: true },
    },
  },
  ContentImportEntityDraft: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "name"],
    properties: {
      id: idSchema,
      kind: stringSchema,
      name: stringSchema,
      selectedByDefault: { type: "boolean" },
      data: { type: "object", additionalProperties: true },
    },
  },
  ContentImportBatch: {
    type: "object",
    additionalProperties: true,
    required: [
      "id",
      "campaignId",
      "status",
      "source",
      "entities",
      "selectedEntityIds",
      "appliedRecords",
      "createdAt",
      "updatedAt",
    ],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      status: {
        type: "string",
        enum: ["previewed", "applied", "rolled_back", "deleted"],
      },
      source: schemaRef("ContentImportSource"),
      entities: arrayOf(schemaRef("ContentImportEntity")),
      selectedEntityIds: arrayOf(idSchema),
      appliedRecords: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  ContentImportPreviewRequest: {
    type: "object",
    additionalProperties: false,
    required: ["entities"],
    properties: {
      source: schemaRef("ContentImportSource"),
      entities: arrayOf(schemaRef("ContentImportEntityDraft")),
    },
  },
  ContentImportApplyRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      selectedEntityIds: arrayOf(idSchema),
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  ContentImportRollbackRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt"],
    properties: {
      expectedUpdatedAt: dateTimeSchema,
    },
  },
  CampaignArchive: {
    type: "object",
    additionalProperties: true,
    required: ["format", "version", "exportedAt", "manifest", "data"],
    properties: {
      format: stringSchema,
      version: stringSchema,
      exportedAt: { type: "string", format: "date-time" },
      manifest: {
        type: "object",
        additionalProperties: true,
        properties: {
          campaignId: idSchema,
          name: stringSchema,
          schemaVersion: stringSchema,
          exportScope: {
            type: "string",
            enum: ["campaign", "world", "selected_collections"],
          },
          exportScopeId: idSchema,
          exportCollections: { type: "array", items: { type: "string" } },
          dependencyWarnings: arrayOf(stringSchema),
          redactionMode: { type: "string", enum: ["portable"] },
          compatibilityNotes: arrayOf(stringSchema),
          assetCount: { type: "integer", minimum: 0 },
          assetFileCount: { type: "integer", minimum: 0 },
        },
      },
      data: { type: "object", additionalProperties: true },
      files: arrayOf({ type: "object", additionalProperties: true }),
    },
  },
  CampaignImportRequest: {
    anyOf: [
      schemaRef("CampaignArchive"),
      {
        type: "object",
        additionalProperties: false,
        required: ["archive"],
        properties: {
          archive: schemaRef("CampaignArchive"),
          mode: {
            type: "string",
            enum: ["upsert", "reject_conflicts", "skip_conflicts", "dry_run"],
          },
          scope: {
            type: "string",
            enum: ["all", "assets_only", "selected_collections"],
          },
          collections: { type: "array", items: { type: "string" } },
          regenerateIds: { type: "boolean" },
          expectedUpdatedAt: dateTimeSchema,
        },
      },
    ],
  },
  CampaignImportResponse: {
    type: "object",
    additionalProperties: true,
    required: ["importedCampaignIds", "counts", "conflicts", "assetFiles"],
    properties: {
      importedCampaignIds: arrayOf(idSchema),
      counts: {
        type: "object",
        additionalProperties: { type: "integer", minimum: 0 },
      },
      conflicts: arrayOf({ type: "object", additionalProperties: true }),
      skippedConflicts: arrayOf({ type: "object", additionalProperties: true }),
      assetFiles: { type: "integer", minimum: 0 },
      dryRun: { type: "boolean" },
      importScope: {
        type: "string",
        enum: ["all", "assets_only", "selected_collections"],
      },
      importCollections: { type: "array", items: { type: "string" } },
      importWarnings: { type: "array", items: { type: "string" } },
      operation: schemaRef("CampaignArchiveImportOperationSummary"),
    },
  },
  CampaignArchiveImportRollbackConflict: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "id", "reason"],
    properties: {
      collection: stringSchema,
      id: idSchema,
      reason: { type: "string", enum: ["record_changed", "asset_bytes_changed", "reference_conflict"] },
    },
  },
  CampaignArchiveImportOperationSummary: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignIds", "status", "mode", "scope", "collections", "createdAt", "updatedAt", "recordCount", "assetFileCount", "remainingRecordCount", "remainingAssetFileCount", "lastRollbackConflicts"],
    properties: {
      id: idSchema,
      campaignIds: arrayOf(idSchema),
      status: { type: "string", enum: ["applied", "partially_rolled_back", "rolled_back"] },
      mode: { type: "string", enum: ["upsert", "reject_conflicts", "skip_conflicts"] },
      scope: { type: "string", enum: ["all", "assets_only", "selected_collections"] },
      collections: arrayOf(stringSchema),
      createdAt: dateTimeSchema,
      updatedAt: dateTimeSchema,
      recordCount: { type: "integer", minimum: 0 },
      assetFileCount: { type: "integer", minimum: 0 },
      remainingRecordCount: { type: "integer", minimum: 0 },
      remainingAssetFileCount: { type: "integer", minimum: 0 },
      lastRollbackAt: dateTimeSchema,
      lastRollbackConflicts: arrayOf(schemaRef("CampaignArchiveImportRollbackConflict")),
    },
  },
  CampaignArchiveImportOperationList: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: { items: arrayOf(schemaRef("CampaignArchiveImportOperationSummary")) },
  },
  CampaignArchiveImportRollbackPreview: {
    allOf: [
      schemaRef("CampaignArchiveImportOperationSummary"),
      {
        type: "object",
        additionalProperties: true,
        required: ["impact", "conflicts"],
        properties: {
          impact: {
            type: "object",
            additionalProperties: false,
            required: ["restoreRecords", "deleteRecords", "restoreAssetFiles", "deleteAssetFiles"],
            properties: {
              restoreRecords: { type: "integer", minimum: 0 },
              deleteRecords: { type: "integer", minimum: 0 },
              restoreAssetFiles: { type: "integer", minimum: 0 },
              deleteAssetFiles: { type: "integer", minimum: 0 },
            },
          },
          conflicts: arrayOf(schemaRef("CampaignArchiveImportRollbackConflict")),
        },
      },
    ],
  },
  CampaignArchiveImportRollbackRequest: {
    type: "object",
    additionalProperties: false,
    required: ["expectedUpdatedAt", "confirmOperationId"],
    properties: { expectedUpdatedAt: dateTimeSchema, confirmOperationId: idSchema },
  },
  CampaignArchiveImportRollbackResponse: {
    type: "object",
    additionalProperties: false,
    required: ["operation", "rolledBackRecords", "rolledBackAssetFiles", "conflicts"],
    properties: {
      operation: schemaRef("CampaignArchiveImportOperationSummary"),
      rolledBackRecords: { type: "integer", minimum: 0 },
      rolledBackAssetFiles: { type: "integer", minimum: 0 },
      conflicts: arrayOf(schemaRef("CampaignArchiveImportRollbackConflict")),
      campaignUpdatedAt: dateTimeSchema,
    },
  },
  CampaignDogfoodReportBundle: {
    type: "object",
    additionalProperties: true,
    properties: {
      format: stringSchema,
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" },
    },
  },
} as const;

const routeOperationOverrides: Record<string, Partial<OpenApiOperation>> = {
  "GET /api/v1/openapi.json": {
    responses: {
      "200": jsonResponse(
        "Generated OpenAPI 3.1 contract document",
        schemaRef("OpenApiDocument"),
      ),
    },
  },
  "GET /api/v1/health": {
    responses: {
      "200": jsonResponse("API health status", schemaRef("HealthStatus")),
      "503": jsonResponse("API readiness configuration is incomplete", schemaRef("HealthStatus")),
    },
  },
  "POST /api/v1/mcp": {
    requestBody: jsonRequestBody(schemaRef("McpJsonRpcRequest")),
    responses: {
      "200": jsonResponse(
        "MCP JSON-RPC response",
        schemaRef("McpJsonRpcResponse"),
      ),
    },
  },
  "GET /api/v1/agent/board-captures/{captureHandle}": {
    parameters: [
      {
        name: "token",
        in: "query",
        required: true,
        schema: { type: "string" },
        description: "Short-lived capture token",
      },
    ],
    responses: {
      "200": {
        description: "Short-lived board screenshot PNG",
        content: {
          "image/png": { schema: { type: "string", format: "binary" } },
        },
      },
      "404": jsonResponse("Capture not found", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/agent/board-captures/{captureHandle}": {
    requestBody: jsonRequestBody(schemaRef("BoardCaptureSubmitRequest")),
    responses: {
      "200": jsonResponse(
        "Board capture result",
        schemaRef("BoardCaptureResult"),
      ),
      "404": jsonResponse(
        "Capture request not found",
        schemaRef("ErrorResponse"),
      ),
    },
  },
  "GET /api/v1/auth/bootstrap": {
    responses: {
      "200": jsonResponse(
        "First-run owner bootstrap posture",
        schemaRef("BootstrapStatus"),
      ),
    },
  },
  "POST /api/v1/auth/bootstrap": {
    requestBody: jsonRequestBody(schemaRef("BootstrapOwnerRequest")),
    responses: {
      "200": jsonResponse(
        "Created first owner, starter campaign, scene, and authenticated session",
        schemaRef("LoginResponse"),
      ),
    },
  },
  "POST /api/v1/auth/login": {
    requestBody: jsonRequestBody(schemaRef("LoginRequest")),
    responses: {
      "200": jsonResponse(
        "Authenticated session and user memberships",
        schemaRef("LoginResponse"),
      ),
    },
  },
  "POST /api/v1/auth/register": {
    requestBody: jsonRequestBody(schemaRef("RegisterRequest")),
    responses: {
      "200": jsonResponse(
        "Registered password user and authenticated session",
        schemaRef("LoginResponse"),
      ),
    },
  },
  "POST /api/v1/auth/logout": {
    responses: {
      "200": jsonResponse(
        "Revoked the current bearer session",
        schemaRef("OkResponse"),
      ),
    },
  },
  "POST /api/v1/auth/password-reset/request": {
    requestBody: jsonRequestBody(schemaRef("PasswordResetRequest")),
    responses: {
      "200": jsonResponse(
        "Accepted password reset request without account enumeration",
        schemaRef("OkResponse"),
      ),
    },
  },
  "POST /api/v1/auth/password-reset/confirm": {
    requestBody: jsonRequestBody(schemaRef("PasswordResetConfirmRequest")),
    responses: {
      "200": jsonResponse(
        "Confirmed password reset and created authenticated session",
        schemaRef("LoginResponse"),
      ),
    },
  },
  "POST /api/v1/auth/password/change": {
    requestBody: jsonRequestBody(schemaRef("PasswordChangeRequest")),
    responses: {
      "200": jsonResponse(
        "Changed password and rotated authenticated session",
        schemaRef("LoginResponse"),
      ),
    },
  },
  "GET /api/v1/auth/mfa": {
    responses: {
      "200": jsonResponse(
        "Current user MFA posture",
        schemaRef("PublicMfaInfo"),
      ),
    },
  },
  "POST /api/v1/auth/mfa/totp/enroll": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpEnrollRequest")),
    responses: {
      "200": jsonResponse(
        "Created pending TOTP enrollment secret",
        schemaRef("MfaTotpEnrollResponse"),
      ),
    },
  },
  "POST /api/v1/auth/mfa/totp/confirm": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpConfirmRequest")),
    responses: {
      "200": jsonResponse(
        "Confirmed TOTP enrollment and returned recovery codes",
        schemaRef("MfaTotpConfirmResponse"),
      ),
    },
  },
  "DELETE /api/v1/auth/mfa/totp": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpDisableRequest")),
    responses: {
      "200": jsonResponse(
        "Disabled TOTP MFA for the current user",
        schemaRef("MfaTotpDisableResponse"),
      ),
    },
  },
  "GET /api/v1/auth/sessions": {
    responses: {
      "200": jsonResponse(
        "Current user's active sessions",
        arrayOf(schemaRef("UserSession")),
      ),
    },
  },
  "DELETE /api/v1/auth/sessions/{sessionId}": {
    responses: {
      "200": jsonResponse(
        "Revoked one current-user session",
        schemaRef("OkResponse"),
      ),
    },
  },
  "GET /api/v1/auth/oidc/config": {
    responses: {
      "200": jsonResponse(
        "Public OIDC sign-in configuration",
        schemaRef("OidcPublicConfig"),
      ),
    },
  },
  "POST /api/v1/auth/oidc/start": {
    requestBody: jsonRequestBody(schemaRef("OidcStartRequest")),
    responses: {
      "200": jsonResponse(
        "Created OIDC authorization request",
        schemaRef("OidcStartResponse"),
      ),
    },
  },
  "GET /api/v1/auth/oidc/start": {
    parameters: [
      {
        name: "returnTo",
        in: "query",
        required: false,
        description:
          "Optional relative path to restore after the OIDC callback.",
        schema: stringSchema,
      },
    ],
    responses: {
      "302": {
        description:
          "Redirects the browser to the configured OIDC authorization endpoint.",
      },
    },
  },
  "GET /api/v1/auth/oidc/callback": {
    parameters: [
      {
        name: "code",
        in: "query",
        required: false,
        description: "Authorization code returned by the OIDC provider.",
        schema: stringSchema,
      },
      {
        name: "state",
        in: "query",
        required: false,
        description: "Opaque state token created by the OIDC start route.",
        schema: stringSchema,
      },
      {
        name: "error",
        in: "query",
        required: false,
        description: "Provider error code when authorization fails.",
        schema: stringSchema,
      },
      {
        name: "error_description",
        in: "query",
        required: false,
        description: "Provider error description when authorization fails.",
        schema: stringSchema,
      },
    ],
    responses: {
      "200": jsonResponse(
        "Authenticated OIDC callback result when no browser redirect is requested",
        schemaRef("OidcCallbackResponse"),
      ),
    },
  },
  "GET /api/v1/auth/session": {
    responses: {
      "200": jsonResponse(
        "Current authenticated user session",
        schemaRef("SessionInfo"),
      ),
    },
  },
  "GET /api/v1/auth/profile": {
    responses: { "200": jsonResponse("Authenticated user's persisted profile and preferences", schemaRef("UserProfileResponse")) },
  },
  "PATCH /api/v1/auth/profile": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("UserProfilePatchRequest")),
    responses: {
      "200": jsonResponse("Updated authenticated user's profile", schemaRef("UserProfileResponse")),
      "409": jsonResponse("Profile revision conflict", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/organizations": {
    responses: {
      "200": jsonResponse(
        "Organization workspaces accessible to the current user",
        arrayOf(schemaRef("OrganizationWorkspaceInfo")),
      ),
    },
  },
  "POST /api/v1/organizations": {
    requestBody: jsonRequestBody(schemaRef("OrganizationCreateRequest")),
    responses: {
      "201": jsonResponse(
        "Created organization workspace and selected it for the current bearer session",
        schemaRef("OrganizationSwitchResponse"),
      ),
    },
  },
  "PATCH /api/v1/organization/session": {
    requestBody: jsonRequestBody(schemaRef("OrganizationSwitchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated active organization for the current bearer session",
        schemaRef("OrganizationSwitchResponse"),
      ),
    },
  },
  "GET /api/v1/organization/workspace-defaults": {
    responses: {
      "200": jsonResponse(
        "Organization-wide campaign setup defaults for the current workspace",
        schemaRef("OrganizationWorkspace"),
      ),
    },
  },
  "PATCH /api/v1/organization/workspace-defaults": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(
      schemaRef("OrganizationWorkspaceDefaultsPatchRequest"),
    ),
    responses: {
      "200": jsonResponse(
        "Updated organization-wide campaign setup defaults",
        schemaRef("OrganizationWorkspace"),
      ),
    },
  },
  "GET /api/v1/organization/members": {
    responses: {
      "200": jsonResponse(
        "Current workspace organization members",
        arrayOf(schemaRef("OrganizationMember")),
      ),
    },
  },
  "POST /api/v1/organization/members": {
    requestBody: jsonRequestBody(schemaRef("OrganizationMemberCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Updated existing organization member",
        schemaRef("OrganizationMember"),
      ),
      "201": jsonResponse(
        "Added organization member",
        schemaRef("OrganizationMember"),
      ),
    },
  },
  "PATCH /api/v1/organization/members/{memberId}": {
    requestBody: jsonRequestBody(schemaRef("OrganizationMemberUpdateRequest")),
    responses: {
      "200": jsonResponse(
        "Updated organization member role",
        schemaRef("OrganizationMember"),
      ),
    },
  },
  "DELETE /api/v1/organization/members/{memberId}": {
    parameters: [
      { name: "expectedUpdatedAt", in: "query", required: true, schema: dateTimeSchema },
    ],
    responses: {
      "200": jsonResponse(
        "Removed organization member and campaign access",
        schemaRef("OrganizationMemberDeleteResponse"),
      ),
    },
  },
  "GET /api/v1/organization/invites": {
    responses: {
      "200": jsonResponse(
        "Current active organization invite roster",
        arrayOf(schemaRef("OrganizationInvite")),
      ),
    },
  },
  "POST /api/v1/organization/invites": {
    requestBody: jsonRequestBody(schemaRef("OrganizationInviteCreateRequest")),
    responses: {
      "201": jsonResponse(
        "Created invite metadata plus the one-time plaintext token for an active-organization campaign",
        schemaRef("CampaignInviteCreateResponse"),
      ),
    },
  },
  "GET /api/v1/admin/users": {
    responses: {
      "200": jsonResponse(
        "Server-admin user roster with redacted auth state and counts",
        arrayOf(schemaRef("AdminUser")),
      ),
    },
  },
  "PATCH /api/v1/admin/users/{userId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminUserPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated server-admin user record",
        schemaRef("AdminUser"),
      ),
    },
  },
  "POST /api/v1/admin/users/{userId}/password-reset": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminUserPasswordResetRequest")),
    responses: {
      "200": jsonResponse(
        "Created password reset token and queued reset email",
        schemaRef("AdminUserPasswordResetResponse"),
      ),
    },
  },
  "POST /api/v1/admin/password-resets/prune": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminPasswordResetPruneRequest")),
    responses: {
      "200": jsonResponse(
        "Password reset pruning dry-run or mutation result",
        schemaRef("AdminPasswordResetPruneResult"),
      ),
    },
  },
  "GET /api/v1/admin/users/{userId}/sessions/revocation-plan": {
    responses: {
      "200": jsonResponse(
        "Prepared the exact current session target set for an all-user revocation",
        schemaRef("AdminUserSessionRevocationPlan"),
      ),
    },
  },
  "DELETE /api/v1/admin/users/{userId}/sessions": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminUserSessionRevokeRequest")),
    responses: {
      "200": jsonResponse(
        "Revoked all sessions for a user",
        schemaRef("AdminSessionRevokeResponse"),
      ),
    },
  },
  "GET /api/v1/admin/sessions": {
    responses: {
      "200": jsonResponse(
        "Server-admin session roster with redacted user details",
        arrayOf(schemaRef("AdminSession")),
      ),
    },
  },
  "POST /api/v1/admin/sessions/prune": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminSessionPruneRequest")),
    responses: {
      "200": jsonResponse(
        "Session pruning dry-run or mutation result",
        schemaRef("AdminSessionPruneResult"),
      ),
    },
  },
  "GET /api/v1/admin/sessions/risk": {
    parameters: [
      {
        name: "staleDays",
        in: "query",
        required: false,
        description:
          "Number of idle days before an active session is considered stale.",
        schema: { type: "integer", minimum: 1, maximum: 365 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Session risk report for stale, expired, disabled-user, and unknown-user sessions",
        schemaRef("AdminSessionRiskReport"),
      ),
    },
  },
  "POST /api/v1/admin/sessions/risk/revoke": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminSessionRiskRevokeRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or revoke result for matching risk sessions",
        schemaRef("AdminSessionRiskRevokeResult"),
      ),
    },
  },
  "DELETE /api/v1/admin/sessions/{sessionId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminSessionRevokeRequest")),
    responses: {
      "200": jsonResponse(
        "Revoked one server-admin selected session",
        schemaRef("OkResponse"),
      ),
    },
  },
  "GET /api/v1/admin/auth/config": {
    responses: {
      "200": jsonResponse(
        "Redacted auth runtime configuration posture",
        schemaRef("AdminAuthRuntimeConfig"),
      ),
    },
  },
  "GET /api/v1/admin/auth/operations": {
    parameters: [
      {
        name: "staleDays",
        in: "query",
        required: false,
        description:
          "Number of idle days before an active session is considered stale in auth operations posture.",
        schema: { type: "integer", minimum: 1, maximum: 365 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Auth operations posture and remediation queue",
        schemaRef("AdminAuthOperations"),
      ),
    },
  },
  "POST /api/v1/admin/auth/test-connection": {
    requestBody: jsonRequestBody(schemaRef("AdminAuthTestConnectionRequest")),
    responses: {
      "200": jsonResponse(
        "Redacted OIDC or SCIM connection test result",
        schemaRef("AdminAuthConnectionTestResult"),
      ),
    },
  },
  "GET /api/v1/admin/email-outbox": {
    responses: {
      "200": jsonResponse(
        "Recent email outbox messages visible to server admins",
        arrayOf(schemaRef("EmailOutboxMessage")),
      ),
    },
  },
  "POST /api/v1/admin/email-outbox/retry-all": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminEmailOutboxRetryAllRequest")),
    responses: {
      "200": jsonResponse(
        "Bulk email outbox retry dry-run or mutation result",
        schemaRef("AdminEmailOutboxRetryAllResult"),
      ),
    },
  },
  "POST /api/v1/admin/email-outbox/{messageId}/retry": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("AdminEmailOutboxRetryRequest")),
    responses: {
      "200": jsonResponse(
        "Retried email outbox message",
        schemaRef("EmailOutboxMessage"),
      ),
    },
  },
  "GET /api/v1/admin/audit-logs": {
    parameters: [
      {
        name: "campaignId",
        in: "query",
        required: false,
        description: "Filter by campaign id.",
        schema: stringSchema,
      },
      {
        name: "actorUserId",
        in: "query",
        required: false,
        description: "Filter by actor user id.",
        schema: stringSchema,
      },
      {
        name: "actorType",
        in: "query",
        required: false,
        description: "Filter by audit actor type.",
        schema: { type: "string", enum: ["user", "ai", "plugin", "system"] },
      },
      {
        name: "action",
        in: "query",
        required: false,
        description: "Filter by exact audit action.",
        schema: stringSchema,
      },
      {
        name: "targetType",
        in: "query",
        required: false,
        description: "Filter by target type.",
        schema: stringSchema,
      },
      {
        name: "targetId",
        in: "query",
        required: false,
        description: "Filter by target id.",
        schema: stringSchema,
      },
      {
        name: "since",
        in: "query",
        required: false,
        description:
          "Return audit entries created at or after this ISO timestamp.",
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "until",
        in: "query",
        required: false,
        description:
          "Return audit entries created at or before this ISO timestamp.",
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Maximum audit entries to return.",
        schema: { type: "integer", minimum: 1, maximum: 10000 },
      },
      {
        name: "format",
        in: "query",
        required: false,
        description:
          "Use ndjson for a newline-delimited export; json returns the typed export envelope.",
        schema: { type: "string", enum: ["json", "ndjson"] },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Filtered server-admin audit export envelope for JSON format",
        schemaRef("AdminAuditLogExport"),
      ),
    },
  },
  "GET /api/v1/admin/jobs": {
    parameters: [
      {
        name: "type",
        in: "query",
        required: false,
        description: "Filter by queued job type.",
        schema: {
          type: "string",
          enum: [
            "campaign.export",
            "campaign.import",
            "asset.storage.migrate",
            "asset.storage.cleanup",
            "storage.backup",
            "storage.restoreDrill",
            "ai.memory.extract",
            "ai.session.recap",
            "report.bundle",
          ],
        },
      },
      {
        name: "status",
        in: "query",
        required: false,
        description: "Filter by job status.",
        schema: {
          type: "string",
          enum: ["queued", "running", "succeeded", "failed", "cancelled"],
        },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Maximum jobs to return.",
        schema: { type: "integer", minimum: 1, maximum: 500 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Recent server-admin job ledger entries with redacted payloads and outputs",
        arrayOf(schemaRef("AdminJob")),
      ),
    },
  },
  "POST /api/v1/admin/jobs": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobCreateRequest")),
    responses: {
      "201": jsonResponse(
        "Created a queued server-admin job ledger entry",
        schemaRef("AdminJob"),
      ),
    },
  },
  "POST /api/v1/admin/jobs/lease": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobLeaseRequest")),
    responses: {
      "200": jsonResponse(
        "Leased the next queued or expired server-admin job",
        schemaRef("AdminJob"),
      ),
      "204": {
        description: "No matching queued or expired job is available to lease",
      },
    },
  },
  "GET /api/v1/admin/jobs/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin job queue, lease, heartbeat, retry, and remediation posture",
        schemaRef("AdminJobOperations"),
      ),
    },
  },
  "GET /api/v1/admin/jobs/metrics": {
    responses: {
      "200": textResponse(
        "Prometheus text exposition for server-admin job queue, lease, heartbeat, retry, and remediation gauges",
      ),
    },
  },
  "POST /api/v1/admin/jobs/alerts": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobAlertRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run, skipped, or delivered job operations alert result",
        schemaRef("AdminJobAlertResult"),
      ),
      "502": jsonResponse(
        "Job operations alert webhook delivery failed",
        schemaRef("AdminJobAlertResult"),
      ),
    },
  },
  "GET /api/v1/admin/jobs/{jobId}": {
    responses: {
      "200": jsonResponse(
        "Server-admin job ledger entry with redacted payload and output",
        schemaRef("AdminJob"),
      ),
    },
  },
  "PATCH /api/v1/admin/jobs/{jobId}": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated server-admin job status, progress, output, error, or log",
        schemaRef("AdminJob"),
      ),
    },
  },
  "POST /api/v1/admin/jobs/{jobId}/heartbeat": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobHeartbeatRequest")),
    responses: {
      "200": jsonResponse(
        "Extended the lease and optionally updated progress or logs for a running job",
        schemaRef("AdminJob"),
      ),
    },
  },
  "POST /api/v1/admin/jobs/{jobId}/retry": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobRetryRequest")),
    responses: {
      "200": jsonResponse(
        "Requeued a failed or cancelled server-admin job",
        schemaRef("AdminJob"),
      ),
    },
  },
  "POST /api/v1/admin/jobs/{jobId}/cancel": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("AdminJobCancelRequest")),
    responses: {
      "200": jsonResponse(
        "Cancelled a queued or running server-admin job",
        schemaRef("AdminJob"),
      ),
    },
  },
  "GET /api/v1/admin/ai/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin AI runtime, safety, evaluation, tool, and proposal operations posture",
        schemaRef("AdminAiOperations"),
      ),
    },
  },
  "GET /api/v1/admin/ai/policy": {
    responses: {
      "200": jsonResponse("Redacted installation AI policy and production readiness", { type: "object", additionalProperties: true }),
    },
  },
  "POST /api/v1/admin/ai/proposals/stale/reject": {
    requestBody: jsonRequestBody(
      schemaRef("AdminAiStaleProposalRejectRequest"),
    ),
    responses: {
      "200": jsonResponse(
        "Dry-run or reject stale pending or approved AI proposals",
        schemaRef("AdminAiStaleProposalRejectResult"),
      ),
    },
  },
  "POST /api/v1/admin/ai/threads/stale/fail": {
    requestBody: jsonRequestBody(schemaRef("AdminAiStaleThreadFailRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or fail stale running AI threads",
        schemaRef("AdminAiStaleThreadFailResult"),
      ),
    },
  },
  "POST /api/v1/admin/ai/tool-calls/stale/fail": {
    requestBody: jsonRequestBody(schemaRef("AdminAiStaleToolCallFailRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or fail stale started AI tool calls",
        schemaRef("AdminAiStaleToolCallFailResult"),
      ),
    },
  },
  "POST /api/v1/admin/ai/tool-calls/retry": {
    requestBody: jsonRequestBody(schemaRef("AdminAiToolCallRetryRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or replay retryable failed AI tool calls through the proposal-safe tool executor",
        schemaRef("AdminAiToolCallRetryResult"),
      ),
    },
  },
  "GET /api/v1/admin/ai/evaluations": {
    parameters: [
      {
        name: "campaignId",
        in: "query",
        required: false,
        description: "Filter evaluations by campaign id.",
        schema: stringSchema,
      },
      {
        name: "status",
        in: "query",
        required: false,
        description: "Filter by evaluation status.",
        schema: { type: "string", enum: ["passed", "failed"] },
      },
      {
        name: "limit",
        in: "query",
        required: false,
        description: "Maximum evaluations to export.",
        schema: { type: "integer", minimum: 1, maximum: 500 },
      },
      {
        name: "format",
        in: "query",
        required: false,
        description:
          "Use ndjson for a newline-delimited export; json returns the typed export envelope.",
        schema: { type: "string", enum: ["json", "ndjson"] },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Filtered AI evaluation export envelope for JSON format",
        schemaRef("AdminAiEvaluationExport"),
      ),
    },
  },
  "GET /api/v1/admin/plugins/reviews": {
    responses: {
      "200": jsonResponse(
        "Marketplace plugin review snapshot",
        schemaRef("AdminPluginReviewSnapshot"),
      ),
    },
  },
  "PATCH /api/v1/admin/plugins/reviews/{reviewKey}": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminPluginReviewPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated marketplace plugin review state",
        schemaRef("AdminPluginReviewInfo"),
      ),
      "400": jsonResponse("Missing retry identity or exact review revision", schemaRef("ErrorResponse")),
      "409": jsonResponse("Plugin review revision is stale", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/admin/plugins/registry/sync": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminPluginRegistrySyncRequest")),
    responses: {
      "200": jsonResponse(
        "Synchronized configured plugin registries",
        schemaRef("AdminPluginRegistrySyncResponse"),
      ),
      "400": jsonResponse("Missing retry identity or registry generation", schemaRef("ErrorResponse")),
      "409": jsonResponse("Plugin registry generation is stale", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/admin/plugins/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin plugin operations posture and remediation queue",
        schemaRef("AdminPluginOperations"),
      ),
    },
  },
  "GET /api/v1/admin/systems/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin rules-system operations posture and remediation queue",
        schemaRef("AdminSystemOperations"),
      ),
    },
  },
  "GET /api/v1/admin/rendering/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin rendering diagnostics, authoring operations, and remediation queue",
        schemaRef("AdminRenderingOperations"),
      ),
    },
  },
  "GET /api/v1/admin/scim/group-role-mappings": {
    responses: {
      "200": jsonResponse(
        "SCIM group-to-campaign role mappings with matched group snapshots",
        arrayOf(schemaRef("AdminScimGroupRoleMapping")),
      ),
    },
  },
  "GET /api/v1/admin/scim/group-role-mappings/preview": {
    parameters: [
      { name: "campaignId", in: "query", required: true, schema: idSchema },
      { name: "role", in: "query", required: true, schema: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] } },
      { name: "groupId", in: "query", required: false, schema: idSchema },
      { name: "groupExternalId", in: "query", required: false, schema: stringSchema },
      { name: "groupDisplayName", in: "query", required: false, schema: stringSchema },
    ],
    responses: {
      "200": jsonResponse("Prepared SCIM group and affected campaign membership target set", schemaRef("AdminScimGroupRoleMappingPreview")),
    },
  },
  "POST /api/v1/admin/scim/group-role-mappings": {
    parameters: [requiredScimIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminScimGroupRoleMappingInput")),
    responses: {
      "200": jsonResponse(
        "Created SCIM group role mapping and membership sync summary",
        schemaRef("AdminScimGroupRoleMappingCreateResponse"),
      ),
      "201": jsonResponse(
        "Created SCIM group role mapping and membership sync summary",
        schemaRef("AdminScimGroupRoleMappingCreateResponse"),
      ),
    },
  },
  "DELETE /api/v1/admin/scim/group-role-mappings/{mappingId}": {
    parameters: [requiredScimIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminScimGroupRoleMappingDeleteRequest")),
    responses: {
      "200": jsonResponse(
        "Deleted SCIM group role mapping cleanup summary",
        schemaRef("AdminScimGroupRoleMappingDeleteResponse"),
      ),
    },
  },
  "GET /api/v1/scim/v2/ServiceProviderConfig": {
    responses: {
      "200": jsonResponse(
        "SCIM v2 service provider capability document",
        schemaRef("ScimServiceProviderConfig"),
      ),
    },
  },
  "GET /api/v1/scim/v2/Users": {
    parameters: [
      {
        name: "startIndex",
        in: "query",
        required: false,
        description: "SCIM 1-based result offset.",
        schema: { type: "integer", minimum: 1 },
      },
      {
        name: "count",
        in: "query",
        required: false,
        description: "SCIM page size, capped at 200.",
        schema: { type: "integer", minimum: 0, maximum: 200 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "SCIM user list response",
        schemaRef("ScimUserListResponse"),
      ),
    },
  },
  "POST /api/v1/scim/v2/Users": {
    parameters: [requiredScimIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("ScimUserInput")),
    responses: {
      "200": scimVersionedJsonResponse("Created SCIM user resource", schemaRef("ScimUser")),
      "201": scimVersionedJsonResponse("Created SCIM user resource", schemaRef("ScimUser")),
    },
  },
  "GET /api/v1/scim/v2/Users/{userId}": {
    responses: {
      "200": scimVersionedJsonResponse("SCIM user resource", schemaRef("ScimUser")),
    },
  },
  "PUT /api/v1/scim/v2/Users/{userId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    requestBody: jsonRequestBody(schemaRef("ScimUserInput")),
    responses: {
      "200": scimVersionedJsonResponse("Replaced SCIM user resource", schemaRef("ScimUser")),
      ...scimPreconditionResponses,
    },
  },
  "PATCH /api/v1/scim/v2/Users/{userId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    requestBody: jsonRequestBody(schemaRef("ScimPatchRequest")),
    responses: {
      "200": scimVersionedJsonResponse("Patched SCIM user resource", schemaRef("ScimUser")),
      ...scimPreconditionResponses,
    },
  },
  "DELETE /api/v1/scim/v2/Users/{userId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    responses: {
      "204": {
        description: "SCIM user deactivated and active sessions revoked",
      },
      ...scimPreconditionResponses,
    },
  },
  "GET /api/v1/scim/v2/Groups": {
    parameters: [
      {
        name: "startIndex",
        in: "query",
        required: false,
        description: "SCIM 1-based result offset.",
        schema: { type: "integer", minimum: 1 },
      },
      {
        name: "count",
        in: "query",
        required: false,
        description: "SCIM page size, capped at 200.",
        schema: { type: "integer", minimum: 0, maximum: 200 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "SCIM group list response",
        schemaRef("ScimGroupListResponse"),
      ),
    },
  },
  "POST /api/v1/scim/v2/Groups": {
    parameters: [requiredScimIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("ScimGroupInput")),
    responses: {
      "200": scimVersionedJsonResponse(
        "Created SCIM group resource",
        schemaRef("ScimGroup"),
      ),
      "201": scimVersionedJsonResponse(
        "Created SCIM group resource",
        schemaRef("ScimGroup"),
      ),
    },
  },
  "GET /api/v1/scim/v2/Groups/{groupId}": {
    responses: {
      "200": scimVersionedJsonResponse("SCIM group resource", schemaRef("ScimGroup")),
    },
  },
  "PUT /api/v1/scim/v2/Groups/{groupId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    requestBody: jsonRequestBody(schemaRef("ScimGroupInput")),
    responses: {
      "200": scimVersionedJsonResponse(
        "Replaced SCIM group resource",
        schemaRef("ScimGroup"),
      ),
      ...scimPreconditionResponses,
    },
  },
  "PATCH /api/v1/scim/v2/Groups/{groupId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    requestBody: jsonRequestBody(schemaRef("ScimPatchRequest")),
    responses: {
      "200": scimVersionedJsonResponse(
        "Patched SCIM group resource and synchronized mapped memberships",
        schemaRef("ScimGroup"),
      ),
      ...scimPreconditionResponses,
    },
  },
  "DELETE /api/v1/scim/v2/Groups/{groupId}": {
    parameters: [requiredScimIdempotencyKeyParameter, requiredScimIfMatchParameter],
    responses: {
      "204": {
        description: "SCIM group deleted and mapped memberships cleaned up",
      },
      ...scimPreconditionResponses,
    },
  },
  "GET /api/v1/admin/storage/operations": {
    responses: {
      "200": jsonResponse(
        "Server-admin storage posture, backup state, and restore readiness",
        schemaRef("AdminStorageOperations"),
      ),
    },
  },
  "GET /api/v1/admin/operations/metrics": {
    responses: {
      "200": jsonResponse(
        "Bounded privacy-safe HTTP, conflict, realtime, persistence, and recovery metrics",
        schemaRef("AdminOperationsMetrics"),
      ),
    },
  },
  "GET /api/v1/admin/retention/operations": {
    responses: {
      "200": jsonResponse("Preservation-first operational retention diagnostics", schemaRef("OperationalRetentionDiagnostics")),
    },
  },
  "POST /api/v1/admin/retention/prune": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("OperationalRetentionRequest")),
    responses: {
      "200": jsonResponse("Exact dry-run plan or bounded audited operational retention result", schemaRef("OperationalRetentionPlan")),
      "409": jsonResponse("The eligible target set changed after preview", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/admin/storage/backup": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("StorageBackupRequest")),
    responses: {
      "200": jsonResponse(
        "Created SQLite backup summary",
        schemaRef("StorageBackupResult"),
      ),
    },
  },
  "POST /api/v1/admin/storage/restore-drill": {
    requestBody: optionalJsonRequestBody(schemaRef("StorageRestoreDrillRequest")),
    responses: {
      "200": jsonResponse(
        "Restore drill passed against a copied SQLite backup",
        schemaRef("StorageRestoreDrillResult"),
      ),
      "409": jsonResponse(
        "Restore drill failed against the requested or latest SQLite backup",
        schemaRef("StorageRestoreDrillResult"),
      ),
    },
  },
  "POST /api/v1/admin/storage/restore": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("StorageRestoreRequest")),
    responses: {
      "200": jsonResponse(
        "Restored the live SQLite store from a confirmed backup file",
        schemaRef("StorageRestoreResult"),
      ),
      "409": jsonResponse(
        "Destructive restore failed against the confirmed SQLite backup",
        schemaRef("StorageRestoreResult"),
      ),
    },
  },
  "GET /api/v1/admin/assets/storage": {
    responses: {
      "200": jsonResponse(
        "Server-admin global asset storage runtime and operations posture",
        schemaRef("AdminAssetStorageInfo"),
      ),
    },
  },
  "GET /api/v1/admin/assets/integrity": {
    parameters: [
      {
        name: "campaignId",
        in: "query",
        required: false,
        description: "Filter integrity audit to one campaign.",
        schema: stringSchema,
      },
      {
        name: "includeDeleted",
        in: "query",
        required: false,
        description: "Include deleted asset rows in the audit.",
        schema: { type: "boolean" },
      },
      {
        name: "includeExpired",
        in: "query",
        required: false,
        description: "Include expired asset rows in the audit.",
        schema: { type: "boolean" },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Asset byte integrity audit and remediation queue",
        schemaRef("AdminAssetIntegrityReport"),
      ),
    },
  },
  "POST /api/v1/admin/assets/integrity/quarantine": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or archive assets with integrity failures",
        schemaRef("AdminAssetOperationResult"),
      ),
      "400": jsonResponse(
        "The request is malformed or execution lacks a prepared target set",
        schemaRef("ErrorResponse"),
      ),
      "409": jsonResponse(
        "Asset revisions or integrity evidence changed after preparation",
        schemaRef("AdminAssetTargetSetConflictResponse"),
      ),
    },
  },
  "POST /api/v1/admin/assets/migrate": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or migrate stored asset bytes to the active provider",
        schemaRef("AdminAssetOperationResult"),
      ),
      "400": jsonResponse(
        "The request is malformed or execution lacks a prepared target set",
        schemaRef("ErrorResponse"),
      ),
      "409": jsonResponse(
        "Asset revisions or migration inputs changed after preparation",
        schemaRef("AdminAssetTargetSetConflictResponse"),
      ),
    },
  },
  "POST /api/v1/admin/assets/cleanup": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse(
        "Dry-run or delete stored bytes for deleted or expired assets",
        schemaRef("AdminAssetOperationResult"),
      ),
      "400": jsonResponse(
        "The request is malformed or execution lacks a prepared target set",
        schemaRef("ErrorResponse"),
      ),
      "409": jsonResponse(
        "Asset revisions or cleanup eligibility changed after preparation",
        schemaRef("AdminAssetTargetSetConflictResponse"),
      ),
    },
  },
  "POST /api/v1/admin/assets/{assetId}/purge-cache": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("AdminAssetCdnPurgeRequest")),
    responses: {
      "200": jsonResponse(
        "Requested CDN cache purge for one asset",
        schemaRef("AdminAssetCdnPurgeResult"),
      ),
      "400": jsonResponse("Invalid purge input or unconfigured CDN purge", {
        anyOf: [
          schemaRef("ErrorResponse"),
          schemaRef("AdminAssetCdnPurgeResult"),
        ],
      }),
      "404": jsonResponse("Asset not found", schemaRef("ErrorResponse")),
      "409": jsonResponse(
        "The asset revision changed after it was loaded",
        schemaRef("ErrorResponse"),
      ),
      "502": jsonResponse(
        "The downstream CDN purge delivery failed",
        schemaRef("AdminAssetCdnPurgeResult"),
      ),
    },
  },
  "GET /api/v1/campaigns": {
    responses: {
      "200": jsonResponse(
        "Campaigns visible to the caller",
        arrayOf(schemaRef("Campaign")),
      ),
    },
  },
  "POST /api/v1/campaigns": {
    requestBody: jsonRequestBody(schemaRef("CampaignCreateRequest")),
    responses: {
      "200": jsonResponse("Created campaign", schemaRef("Campaign")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}": {
    responses: {
      "200": jsonResponse("Requested campaign", schemaRef("Campaign")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CampaignPatchRequest")),
    responses: {
      "200": jsonResponse("Updated campaign", schemaRef("Campaign")),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}": {
    responses: {
      "200": jsonResponse("Deleted campaign snapshot", schemaRef("Campaign")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/archive": {
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedUpdatedAt"],
      properties: { reason: { type: "string", maxLength: 500 }, expectedUpdatedAt: dateTimeSchema },
    }),
    responses: {
      "200": jsonResponse(
        "Archived campaign with lifecycle metadata",
        schemaRef("Campaign"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/restore": {
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedUpdatedAt"],
      properties: { reason: { type: "string", maxLength: 500 }, expectedUpdatedAt: dateTimeSchema },
    }),
    responses: {
      "200": jsonResponse(
        "Restored campaign with lifecycle metadata",
        schemaRef("Campaign"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/members": {
    responses: {
      "200": jsonResponse(
        "Campaign members with public user and permission details",
        arrayOf(schemaRef("CampaignMember")),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/presence": {
    responses: {
      "200": jsonResponse("Ephemeral campaign presence", {
        type: "object",
        additionalProperties: false,
        required: ["campaignId", "generatedAt", "presences"],
        properties: {
          campaignId: stringSchema,
          generatedAt: dateTimeSchema,
          presences: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["campaignId", "userId", "displayName", "role", "connectionCount", "connectedAt", "lastSeenAt", "activeSceneIds"],
              properties: {
                campaignId: stringSchema,
                userId: stringSchema,
                displayName: stringSchema,
                role: stringSchema,
                connectionCount: { type: "integer", minimum: 1 },
                connectedAt: dateTimeSchema,
                lastSeenAt: dateTimeSchema,
                activeSceneIds: arrayOf(stringSchema)
              }
            }
          }
        }
      })
    }
  },
  "PATCH /api/v1/campaigns/{campaignId}/members/{memberId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["role", "expectedUpdatedAt"],
      properties: {
        role: {
          type: "string",
          enum: ["gm", "assistant_gm", "player", "observer"],
        },
        expectedUpdatedAt: dateTimeSchema,
      },
    }),
    responses: {
      "200": jsonResponse(
        "Updated campaign member",
        schemaRef("CampaignMember"),
      ),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/members/{memberId}": {
    parameters: [
      { ...idempotencyKeyParameter, required: true },
      { name: "expectedUpdatedAt", in: "query", required: true, schema: dateTimeSchema, description: "Exact campaign-member revision reviewed by the caller." },
    ],
    responses: {
      "200": jsonResponse(
        "Removed campaign member",
        schemaRef("CampaignMember"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ownership-transfer": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying the same ownership transfer.",
      },
    ],
    requestBody: jsonRequestBody(
      schemaRef("CampaignOwnershipTransferRequest"),
    ),
    responses: {
      "200": jsonResponse(
        "Transferred campaign ownership and demoted the previous owner to GM",
        schemaRef("CampaignOwnershipTransferResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/duplicate": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CampaignDuplicateRequest")),
    responses: {
      "201": jsonResponse("Atomically duplicated campaign content and embedded asset objects", schemaRef("CampaignDuplicateResponse")),
      "409": jsonResponse("Source campaign revision conflict", schemaRef("ErrorResponse")),
      "413": jsonResponse("Campaign assets exceed the configured duplication limit", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/character-transfers": {
    responses: { "200": jsonResponse("Visible pending and resolved character transfers", arrayOf(schemaRef("CharacterTransfer"))) },
  },
  "POST /api/v1/campaigns/{campaignId}/actors/{actorId}/transfers": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CharacterTransferCreateRequest")),
    responses: {
      "201": jsonResponse("Created a recipient-confirmed character transfer request", schemaRef("CharacterTransferCreateResponse")),
      "409": jsonResponse("Actor revision or pending-transfer conflict", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/character-transfers/{transferId}/accept": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CharacterTransferResolutionRequest")),
    responses: {
      "200": jsonResponse("Accepted character transfer and changed actor ownership", schemaRef("CharacterTransferResolutionResponse")),
      "409": jsonResponse("Actor revision or transfer status conflict", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/character-transfers/{transferId}/decline": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CharacterTransferResolutionRequest")),
    responses: {
      "200": jsonResponse("Declined character transfer", schemaRef("CharacterTransferResolutionResponse")),
      "409": jsonResponse("Transfer revision or status conflict", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/character-transfers/{transferId}/cancel": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CharacterTransferResolutionRequest")),
    responses: {
      "200": jsonResponse("Cancelled a pending character transfer", schemaRef("CharacterTransferResolutionResponse")),
      "409": jsonResponse("Transfer revision or status conflict", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/webhooks": {
    summary: "List outbound campaign webhooks",
    description:
      "Lists public webhook configuration and the supported bounded metadata event types. Requires campaign.update and never returns a signing secret.",
    responses: {
      "200": jsonResponse(
        "Public webhook configurations and supported event types",
        schemaRef("CampaignWebhookListResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/webhooks": {
    summary: "Create an outbound campaign webhook",
    description:
      "Creates one campaign webhook after human confirmation. The plaintext signing secret is returned once on the fresh 201 response; an idempotent replay reports that the secret was already shown.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Idempotent replay; the one-time secret is not returned again",
        schemaRef("CampaignWebhookCreateResponse"),
      ),
      "201": jsonResponse(
        "Created webhook with one-time plaintext signing secret",
        schemaRef("CampaignWebhookCreateResponse"),
      ),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/webhooks/{webhookId}": {
    summary: "Update an outbound campaign webhook",
    description:
      "Updates explicit webhook fields with the exact public webhook revision. The server revalidates the outbound target before saving.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookUpdateRequest")),
    responses: {
      "200": jsonResponse("Updated public webhook configuration", schemaRef("CampaignWebhook")),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/webhooks/{webhookId}": {
    summary: "Delete an outbound campaign webhook",
    description:
      "Deletes a webhook after an exact-revision, human-confirmed request. Existing metadata-only delivery ledger rows remain available only according to server retention policy.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookMutationRequest")),
    responses: {
      "200": jsonResponse("Deleted webhook confirmation", schemaRef("CampaignWebhookDeleteResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/webhooks/{webhookId}/disable": {
    summary: "Disable an outbound campaign webhook",
    description:
      "Stops future delivery attempts with an exact-revision, replay-safe mutation.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookMutationRequest")),
    responses: {
      "200": jsonResponse("Disabled public webhook configuration", schemaRef("CampaignWebhook")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret": {
    summary: "Rotate an outbound campaign webhook secret",
    description:
      "Immediately invalidates the previous secret. A fresh response returns the replacement once; an idempotent replay reports that it was already shown and never re-exposes it.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookMutationRequest")),
    responses: {
      "200": jsonResponse(
        "Rotated webhook or safe replay result",
        schemaRef("CampaignWebhookRotateSecretResponse"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries": {
    summary: "List outbound webhook delivery metadata",
    description:
      "Returns a bounded newest-first ledger with status and transport metadata only. It excludes request/response bodies, headers, and secrets.",
    parameters: [
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Metadata-only outbound delivery ledger",
        arrayOf(schemaRef("CampaignWebhookDelivery")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/webhooks/{webhookId}/test": {
    summary: "Queue a test webhook delivery",
    description:
      "Queues a signed metadata-only webhook.test envelope after exact-revision, human confirmation.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookMutationRequest")),
    responses: {
      "202": jsonResponse("Queued test delivery metadata", schemaRef("CampaignWebhookDelivery")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/webhooks/{webhookId}/deliveries/{deliveryId}/retry": {
    summary: "Retry one failed webhook delivery",
    description:
      "Queues a new delivery linked to one failed ledger row. Delivered or queued rows cannot be retried.",
    parameters: [requiredWebhookIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("CampaignWebhookMutationRequest")),
    responses: {
      "202": jsonResponse("Queued retry delivery metadata", schemaRef("CampaignWebhookDelivery")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/sessions": {
    responses: {
      "200": jsonResponse(
        "Campaign session-preparation records",
        arrayOf(schemaRef("CampaignSession")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/sessions": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CampaignSessionWriteRequest")),
    responses: {
      "200": jsonResponse(
        "Created campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/search": {
    parameters: [
      { name: "q", in: "query", required: true, schema: stringSchema },
      { name: "types", in: "query", required: false, schema: stringSchema },
      { name: "worldId", in: "query", required: false, schema: idSchema },
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 100 },
      },
      {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, maximum: 10000 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Permission-filtered campaign search results",
        arrayOf(schemaRef("CampaignSearchResult")),
      ),
    },
  },
  "GET /api/v1/campaign-sessions/{sessionId}": {
    responses: {
      "200": jsonResponse(
        "Requested campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "PATCH /api/v1/campaign-sessions/{sessionId}": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("CampaignSessionMutationRequest")),
    responses: {
      "200": jsonResponse(
        "Updated campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "DELETE /api/v1/campaign-sessions/{sessionId}": {
    parameters: [
      { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } },
      { name: "expectedUpdatedAt", in: "query", required: true, schema: { type: "string", format: "date-time" } },
    ],
    responses: {
      "200": jsonResponse(
        "Deleted planned campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "POST /api/v1/campaign-sessions/{sessionId}/start": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedUpdatedAt"],
      properties: { activateSceneId: idSchema, expectedUpdatedAt: { type: "string", format: "date-time" } },
    }),
    responses: {
      "200": jsonResponse(
        "Started campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "POST /api/v1/campaign-sessions/{sessionId}/complete": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedUpdatedAt"],
      properties: { notes: stringSchema, expectedUpdatedAt: { type: "string", format: "date-time" } },
    }),
    responses: {
      "200": jsonResponse(
        "Completed campaign session",
        schemaRef("CampaignSession"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/invites": {
    responses: {
      "200": jsonResponse(
        "Campaign invite metadata without one-time token hashes",
        arrayOf(schemaRef("CampaignInvite")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/invites": {
    requestBody: jsonRequestBody(schemaRef("CampaignInviteCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Created invite metadata plus the one-time plaintext token",
        schemaRef("CampaignInviteCreateResponse"),
      ),
    },
  },
  "POST /api/v1/invites/accept": {
    requestBody: jsonRequestBody(schemaRef("InviteAcceptRequest")),
    responses: {
      "200": jsonResponse(
        "Accepted invite and created an authenticated session for the campaign member",
        schemaRef("InviteAcceptResponse"),
      ),
    },
  },
  "GET /api/v1/invites/preview": {
    parameters: [{ name: "token", in: "query", required: true, schema: { type: "string", minLength: 1 } }],
    responses: {
      "200": jsonResponse("Public invite and campaign preview with the exact invite revision", schemaRef("InvitePreviewResponse")),
      "401": errorResponse("Invite token is invalid"),
    },
  },
  "POST /api/v1/invites/{inviteId}/revoke": {
    responses: {
      "200": jsonResponse(
        "Revoked invite metadata without the token hash",
        schemaRef("CampaignInvite"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/scenes": {
    responses: {
      "200": jsonResponse(
        "Scenes in display order",
        arrayOf(schemaRef("Scene")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/scenes": {
    requestBody: jsonRequestBody(schemaRef("SceneCreateRequest")),
    responses: {
      "200": jsonResponse("Created scene", schemaRef("Scene")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/scene-duplications": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("SceneDuplicationRequest")),
    responses: {
      "200": jsonResponse("Previewed the exact scene graph duplication", schemaRef("SceneDuplicationResult")),
      "201": jsonResponse("Atomically duplicated the selected scene graph", schemaRef("SceneDuplicationResult")),
      "400": errorResponse("Invalid or unsupported scene graph"),
      "403": errorResponse("Insufficient permissions for the graph being duplicated"),
      "409": errorResponse("A source revision changed or a deterministic target already exists"),
    },
  },
  "GET /api/v1/scenes/{sceneId}": {
    responses: {
      "200": jsonResponse("Requested scene", schemaRef("Scene")),
    },
  },
  "GET /api/v1/scenes/{sceneId}/delegations": {
    responses: {
      "200": jsonResponse("Scene-scoped member delegations", {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "updatedAt", "delegations"],
        properties: {
          sceneId: stringSchema,
          updatedAt: dateTimeSchema,
          delegations: arrayOf({
            type: "object",
            additionalProperties: false,
            required: ["userId", "permissions"],
            properties: {
              userId: stringSchema,
              permissions: { type: "array", items: { type: "string", enum: ["scene.read", "scene.update"] }, uniqueItems: true }
            }
          })
        }
      })
    }
  },
  "PATCH /api/v1/scenes/{sceneId}/delegations/{userId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["permissions", "expectedUpdatedAt"],
      properties: {
        permissions: { type: "array", items: { type: "string", enum: ["scene.read", "scene.update"] }, uniqueItems: true },
        expectedUpdatedAt: dateTimeSchema
      }
    }),
    responses: {
      "200": jsonResponse("Updated scene delegation", {
        type: "object",
        additionalProperties: false,
        required: ["sceneId", "userId", "permissions", "updatedAt"],
        properties: {
          sceneId: stringSchema,
          userId: stringSchema,
          permissions: { type: "array", items: { type: "string", enum: ["scene.read", "scene.update"] }, uniqueItems: true },
          updatedAt: dateTimeSchema
        }
      })
    }
  },
  "PATCH /api/v1/scenes/{sceneId}": {
    requestBody: jsonRequestBody(schemaRef("ScenePatchRequest")),
    responses: {
      "200": jsonResponse("Updated scene", schemaRef("Scene")),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}": {
    responses: {
      "200": jsonResponse("Deleted scene snapshot", schemaRef("Scene")),
    },
  },
  "POST /api/v1/scenes/{sceneId}/ai-edits/apply-to-target": {
    responses: {
      "200": jsonResponse(
        "Applied AI edit layer to its target scene",
        schemaRef("AiEditLayerApplyResult"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/fog-presets": {
    responses: {
      "200": jsonResponse(
        "Campaign fog presets",
        arrayOf(schemaRef("FogPreset")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/fog-presets": {
    requestBody: jsonRequestBody(schemaRef("FogPresetCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Created fog preset from a source scene",
        schemaRef("FogPreset"),
      ),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/fog-presets/{presetId}": {
    parameters: [
      { name: "expectedUpdatedAt", in: "query", required: true, schema: dateTimeSchema },
    ],
    responses: {
      "200": jsonResponse(
        "Deleted fog preset snapshot",
        schemaRef("FogPreset"),
      ),
    },
  },
  "GET /api/v1/scenes/{sceneId}/vision": {
    parameters: [
      {
        name: "previewUserId",
        in: "query",
        required: false,
        description: "Campaign member whose permission-filtered vision to preview. Requires scene.update when different from the caller.",
        schema: idSchema,
      },
    ],
    responses: {
      "200": jsonResponse(
        "Permission-filtered scene vision snapshot",
        schemaRef("VisionSnapshot"),
      ),
    },
  },
  "GET /api/v1/scenes/{sceneId}/vision/sample": {
    parameters: [
      {
        name: "x",
        in: "query",
        required: true,
        description: "Scene-space x coordinate to sample.",
        schema: { type: "number" },
      },
      {
        name: "y",
        in: "query",
        required: true,
        description: "Scene-space y coordinate to sample.",
        schema: { type: "number" },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Visibility, fog, lighting, and wall sample for one scene point",
        schemaRef("VisionPointSample"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/path-measurement": {
    requestBody: jsonRequestBody(schemaRef("ScenePathMeasurementRequest")),
    responses: {
      "200": jsonResponse("Advisory normal and difficult-terrain path distances without moving a token", schemaRef("ScenePathMeasurement")),
    },
  },
  "POST /api/v1/scenes/{sceneId}/difficult-terrain": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("DifficultTerrainCreateRequest")),
    responses: {
      "200": jsonResponse("Updated scene with an authored difficult-terrain region", schemaRef("Scene")),
    },
  },
  "PATCH /api/v1/scenes/{sceneId}/difficult-terrain/{regionId}": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("DifficultTerrainPatchRequest")),
    responses: {
      "200": jsonResponse("Updated scene with difficult-terrain changes", schemaRef("Scene")),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/difficult-terrain/{regionId}": {
    parameters: [
      { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } },
      { name: "expectedUpdatedAt", in: "query", required: true, schema: { type: "string", format: "date-time" } },
    ],
    responses: {
      "200": jsonResponse("Updated scene with difficult terrain removed", schemaRef("Scene")),
    },
  },
  "POST /api/v1/scenes/{sceneId}/cover-overrides": {
    parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } }],
    requestBody: jsonRequestBody(schemaRef("SceneCoverOverrideRequest")),
    responses: {
      "200": jsonResponse("Updated scene with an explicit source-target cover ruling", schemaRef("Scene")),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/cover-overrides/{overrideId}": {
    parameters: [
      { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 160 } },
      { name: "expectedUpdatedAt", in: "query", required: true, schema: { type: "string", format: "date-time" } },
    ],
    responses: {
      "200": jsonResponse("Updated scene with the cover ruling removed", schemaRef("Scene")),
    },
  },
  "GET /api/v1/scenes/{sceneId}/rendering/diagnostics": {
    responses: {
      "200": jsonResponse(
        "Scene rendering diagnostics",
        schemaRef("SceneRenderingDiagnostics"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/annotations": {
    requestBody: jsonRequestBody(schemaRef("SceneAnnotationCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Updated scene with created annotation",
        schemaRef("Scene"),
      ),
    },
  },
  "PATCH /api/v1/scenes/{sceneId}/annotations/{annotationId}": {
    requestBody: jsonRequestBody(schemaRef("SceneAnnotationUpdateRequest")),
    responses: {
      "200": jsonResponse(
        "Updated scene with annotation changes",
        schemaRef("Scene"),
      ),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/annotations/{annotationId}": {
    responses: {
      "200": jsonResponse(
        "Updated scene with annotation removed",
        schemaRef("Scene"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/fog": {
    requestBody: jsonRequestBody(schemaRef("FogRegionInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with created fog region",
        schemaRef("Scene"),
      ),
    },
  },
  "GET /api/v1/scenes/{sceneId}/fog/history": {
    responses: {
      "200": jsonResponse(
        "Scene fog edit history",
        arrayOf(schemaRef("FogHistoryEntry")),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/fog/undo": {
    responses: {
      "200": jsonResponse(
        "Updated scene after undoing the latest fog edit",
        schemaRef("Scene"),
      ),
    },
  },
  "GET /api/v1/scenes/{sceneId}/edits": {
    responses: {
      "200": jsonResponse(
        "Scene edit undo history (geometry, lighting, and annotation changes)",
        schemaRef("SceneEditHistory"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/undo": {
    responses: {
      "200": jsonResponse(
        "Updated scene after undoing the latest scene edit",
        schemaRef("Scene"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/fog/apply-preset": {
    requestBody: jsonRequestBody(schemaRef("FogPresetApplyRequest")),
    responses: {
      "200": jsonResponse(
        "Updated scene after applying a fog preset",
        schemaRef("Scene"),
      ),
    },
  },
  "PATCH /api/v1/scenes/{sceneId}/fog/{fogId}": {
    requestBody: jsonRequestBody(schemaRef("FogRegionInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with patched fog region",
        schemaRef("Scene"),
      ),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/fog/{fogId}": {
    responses: {
      "200": jsonResponse(
        "Updated scene with fog region removed",
        schemaRef("Scene"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/walls": {
    requestBody: jsonRequestBody(schemaRef("WallInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with created wall",
        schemaRef("Scene"),
      ),
    },
  },
  "PATCH /api/v1/scenes/{sceneId}/walls/{wallId}": {
    requestBody: jsonRequestBody(schemaRef("WallInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with patched wall",
        schemaRef("Scene"),
      ),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/walls/{wallId}": {
    responses: {
      "200": jsonResponse(
        "Updated scene with wall removed",
        schemaRef("Scene"),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/lights": {
    requestBody: jsonRequestBody(schemaRef("LightSourceInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with created light source",
        schemaRef("Scene"),
      ),
    },
  },
  "PATCH /api/v1/scenes/{sceneId}/lights/{lightId}": {
    requestBody: jsonRequestBody(schemaRef("LightSourceInput")),
    responses: {
      "200": jsonResponse(
        "Updated scene with patched light source",
        schemaRef("Scene"),
      ),
    },
  },
  "DELETE /api/v1/scenes/{sceneId}/lights/{lightId}": {
    responses: {
      "200": jsonResponse(
        "Updated scene with light source removed",
        schemaRef("Scene"),
      ),
    },
  },
  "GET /api/v1/scenes/{sceneId}/tokens": {
    responses: {
      "200": jsonResponse(
        "Visible tokens in the scene",
        arrayOf(schemaRef("Token")),
      ),
    },
  },
  "POST /api/v1/scenes/{sceneId}/tokens": {
    requestBody: jsonRequestBody(schemaRef("TokenCreateRequest")),
    responses: {
      "200": jsonResponse("Created token", schemaRef("Token")),
    },
  },
  "POST /api/v1/scenes/{sceneId}/encounter-monster-placements": {
    parameters: [{
      ...idempotencyKeyParameter,
      required: true,
      description: "Stable key reused only when retrying the same whole encounter placement batch.",
    }],
    requestBody: jsonRequestBody(schemaRef("EncounterMonsterPlacementBatchRequest")),
    responses: {
      "200": jsonResponse(
        "Atomically created every encounter monster actor and token",
        schemaRef("EncounterMonsterPlacementBatchResponse"),
      ),
      "400": jsonResponse("Invalid encounter monster placement batch", schemaRef("ErrorResponse")),
      "403": jsonResponse("Missing actor.create or token.create permission", schemaRef("ErrorResponse")),
      "409": jsonResponse("Scene revision conflict", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/tokens/{tokenId}/target": {
    requestBody: jsonRequestBody(schemaRef("TokenTargetRequest")),
    responses: {
      "200": jsonResponse("Updated token targeting state", schemaRef("Token")),
    },
  },
  "PATCH /api/v1/tokens/{tokenId}": {
    requestBody: jsonRequestBody(schemaRef("TokenPatchRequest")),
    responses: {
      "200": jsonResponse("Updated token", schemaRef("Token")),
    },
  },
  "DELETE /api/v1/tokens/{tokenId}": {
    responses: {
      "200": jsonResponse("Deleted token snapshot", schemaRef("Token")),
    },
  },
  "GET /api/v1/chat/messages": {
    parameters: [
      {
        name: "campaignId",
        in: "query",
        required: false,
        description:
          "Restrict messages to one campaign before visibility filtering.",
        schema: idSchema,
      },
    ],
    responses: {
      "200": jsonResponse("Chat messages visible to the caller", {
        oneOf: [
          arrayOf(schemaRef("ChatMessage")),
          schemaRef("ChatMessagePage"),
        ],
      }),
    },
  },
  "POST /api/v1/chat/messages": {
    requestBody: jsonRequestBody(schemaRef("ChatMessageCreateRequest")),
    responses: {
      "200": jsonResponse("Created chat message", schemaRef("ChatMessage")),
    },
  },
  "PATCH /api/v1/chat/messages/{messageId}": {
    requestBody: jsonRequestBody(schemaRef("ChatMessageEditRequest")),
    responses: {
      "200": jsonResponse("Edited chat message", schemaRef("ChatMessage")),
    },
  },
  "PATCH /api/v1/chat/messages/{messageId}/moderation": {
    requestBody: jsonRequestBody(schemaRef("ChatModerationRequest")),
    responses: {
      "200": jsonResponse(
        "Updated chat moderation state",
        schemaRef("ChatMessage"),
      ),
    },
  },
  "DELETE /api/v1/chat/messages/{messageId}": {
    responses: {
      "200": jsonResponse(
        "Deleted chat message snapshot",
        schemaRef("ChatMessage"),
      ),
    },
  },
  "POST /api/v1/dice/roll": {
    requestBody: jsonRequestBody(schemaRef("DiceRollRequest")),
    responses: {
      "200": jsonResponse("Created dice roll", schemaRef("DiceRoll")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/rolls": {
    responses: {
      "200": jsonResponse("Dice rolls visible to the caller", {
        oneOf: [arrayOf(schemaRef("DiceRoll")), schemaRef("DiceRollPage")],
      }),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/rolls/{rollId}/verify": {
    responses: {
      "200": jsonResponse(
        "Deterministic replay verification of a recorded dice roll; this checks stored formula, seed and result consistency and does not claim a pre-roll host commitment",
        schemaRef("DiceRollVerification"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/snapshot": {
    parameters: [
      {
        name: "historyLimit",
        in: "query",
        required: false,
        description: "Maximum newest records returned from each append-only history collection (default and maximum 200).",
        schema: { type: "integer", minimum: 1, maximum: 200, default: 200 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Permission-filtered campaign state composed into a single payload",
        schemaRef("CampaignSnapshot"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/assets": {
    responses: {
      "200": jsonResponse(
        "Campaign assets visible to the caller",
        arrayOf(schemaRef("MapAsset")),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/assets/storage": {
    responses: {
      "200": jsonResponse(
        "Campaign asset storage posture",
        schemaRef("CampaignAssetStorageInfo"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/assets": {
    requestBody: jsonRequestBody(schemaRef("MapAssetCreateRequest")),
    responses: {
      "200": jsonResponse("Created map asset metadata", schemaRef("MapAsset")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/assets/upload": {
    parameters: [
      {
        name: "sceneId",
        in: "query",
        required: false,
        description: "Scene to update when setAsBackground is enabled.",
        schema: idSchema,
      },
      {
        name: "setAsBackground",
        in: "query",
        required: false,
        description: "Set the uploaded asset as the selected scene background when 1, true, or yes.",
        schema: { type: "string", enum: ["1", "true", "yes"] },
      },
      {
        name: "expectedSceneUpdatedAt",
        in: "query",
        required: false,
        description: "Required exact scene revision when setAsBackground is enabled.",
        schema: dateTimeSchema,
      },
    ],
    requestBody: {
      required: true,
      description:
        "Raw asset bytes. The runtime reads asset name, folder, and tags from x-asset-* headers.",
      content: {
        "application/octet-stream": {
          schema: {
            type: "string",
            format: "binary",
          },
        },
      },
    },
    responses: {
      "200": jsonResponse(
        "Uploaded asset and optional updated scene",
        schemaRef("AssetUploadResponse"),
      ),
    },
  },
  "PATCH /api/v1/assets/{assetId}": {
    requestBody: jsonRequestBody(schemaRef("MapAssetPatchRequest")),
    responses: {
      "200": jsonResponse("Updated asset metadata", schemaRef("MapAsset")),
    },
  },
  "GET /api/v1/assets/{assetId}/blob": {
    parameters: [
      {
        name: "userId",
        in: "query",
        required: false,
        description: "Compatibility user id for legacy local clients.",
        schema: stringSchema,
      },
      {
        name: "sessionToken",
        in: "query",
        required: false,
        description:
          "Session token for browser media elements that cannot send authorization headers.",
        schema: stringSchema,
      },
      {
        name: "expiresAt",
        in: "query",
        required: false,
        description: "Signed delivery expiration timestamp.",
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "signature",
        in: "query",
        required: false,
        description: "Signed delivery HMAC.",
        schema: stringSchema,
      },
      {
        name: "disposition",
        in: "query",
        required: false,
        description: "Requested content disposition.",
        schema: { type: "string", enum: ["inline", "attachment"] },
      },
      {
        name: "variant",
        in: "query",
        required: false,
        description:
          "Optional rebuildable image rendition. Missing renditions safely fall back to original bytes.",
        schema: { type: "string", enum: ["thumbnail", "optimized"] },
      },
    ],
    responses: {
      "200": {
        description: "Raw stored asset bytes.",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
            },
          },
        },
      },
    },
  },
  "POST /api/v1/assets/{assetId}/delivery-url": {
    requestBody: jsonRequestBody(schemaRef("AssetDeliveryUrlRequest")),
    responses: {
      "200": jsonResponse(
        "Signed asset delivery URL",
        schemaRef("AssetDeliveryUrlResponse"),
      ),
    },
  },
  "PATCH /api/v1/assets/{assetId}/lifecycle": {
    requestBody: jsonRequestBody(schemaRef("AssetLifecyclePatchRequest")),
    responses: {
      "200": jsonResponse("Updated asset lifecycle", schemaRef("MapAsset")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/actors": {
    responses: {
      "200": jsonResponse(
        "Campaign actors visible to the caller",
        arrayOf(schemaRef("Actor")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/actors": {
    requestBody: jsonRequestBody(schemaRef("ActorCreateRequest")),
    responses: {
      "200": jsonResponse("Created actor", schemaRef("Actor")),
    },
  },
  "GET /api/v1/actors/{actorId}": {
    responses: {
      "200": jsonResponse(
        "Requested actor visible to the caller",
        schemaRef("Actor"),
      ),
    },
  },
  "PATCH /api/v1/actors/{actorId}": {
    requestBody: jsonRequestBody(schemaRef("ActorPatchRequest")),
    responses: {
      "200": jsonResponse("Updated actor", schemaRef("Actor")),
      "409": jsonResponse("Actor revision conflict or rules-managed raw patch rejection", {
        anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("RulesManagedPatchConflictResponse"), schemaRef("ErrorResponse")],
      }),
    },
  },
  "POST /api/v1/actors/{actorId}/concentration/end": {
    description: "Prepares or commits exact D&D concentration cleanup. Set prepare=true to review every actor/combat consequence; commit with the returned key and exact revision maps.",
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one concentration preview or commit",
    }],
    requestBody: jsonRequestBody(schemaRef("Dnd5eSrdConcentrationEndRequest")),
    responses: {
      "200": jsonResponse("Ended actor concentration and cleaned linked effects", schemaRef("Dnd5eSrdConcentrationEndResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/items": {
    responses: {
      "200": jsonResponse(
        "Campaign items visible to the caller",
        arrayOf(schemaRef("Item")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/items": {
    requestBody: jsonRequestBody(schemaRef("ItemCreateRequest")),
    responses: {
      "200": jsonResponse("Created item", schemaRef("Item")),
    },
  },
  "GET /api/v1/items/{itemId}": {
    responses: {
      "200": jsonResponse(
        "Requested item visible to the caller",
        schemaRef("Item"),
      ),
    },
  },
  "PATCH /api/v1/items/{itemId}": {
    requestBody: jsonRequestBody(schemaRef("ItemPatchRequest")),
    responses: {
      "200": jsonResponse("Updated item", schemaRef("Item")),
      "409": jsonResponse("Item revision conflict or rules-managed raw patch rejection", {
        anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("RulesManagedPatchConflictResponse"), schemaRef("ErrorResponse")],
      }),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/journal": {
    responses: {
      "200": jsonResponse(
        "Journal entries visible to the caller",
        arrayOf(schemaRef("JournalEntry")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/journal": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying the same journal creation",
      },
    ],
    requestBody: jsonRequestBody(schemaRef("JournalEntryCreateRequest")),
    responses: {
      "200": jsonResponse("Created journal entry", schemaRef("JournalEntry")),
    },
  },
  "GET /api/v1/journal/{entryId}": {
    responses: {
      "200": jsonResponse(
        "Requested journal entry visible to the caller",
        schemaRef("JournalEntry"),
      ),
    },
  },
  "PATCH /api/v1/journal/{entryId}": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying the same reviewed edit",
      },
    ],
    requestBody: jsonRequestBody(schemaRef("JournalEntryPatchRequest")),
    responses: {
      "200": jsonResponse("Updated journal entry", schemaRef("JournalEntry")),
      "409": jsonResponse("Journal entry changed after the editor loaded it", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/journal/{entryId}/backlinks": {
    responses: {
      "200": jsonResponse("Visible journal entries linking to this entry", schemaRef("JournalBacklinksResponse")),
    },
  },
  "GET /api/v1/journal/{entryId}/history": {
    responses: {
      "200": jsonResponse("GM-visible immutable journal revision history", schemaRef("JournalHistoryResponse")),
    },
  },
  "POST /api/v1/journal/{entryId}/canon-review": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying the same canon review action",
      },
    ],
    requestBody: jsonRequestBody(schemaRef("JournalCanonReviewRequest")),
    responses: {
      "200": jsonResponse("Journal entry after explicit DM canon review", schemaRef("JournalEntry")),
      "409": jsonResponse("Journal entry changed after review opened", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/combats": {
    responses: {
      "200": jsonResponse("Campaign combats", arrayOf(schemaRef("Combat"))),
    },
  },
  "GET /api/v1/combats/{combatId}/audit": {
    responses: {
      "200": jsonResponse("Redacted combat audit entries", {
        oneOf: [arrayOf(schemaRef("AuditLog")), schemaRef("AuditLogPage")],
      }),
    },
  },
  "POST /api/v1/combats/{combatId}/rewards": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying the same reward distribution",
      },
    ],
    requestBody: jsonRequestBody(schemaRef("CombatRewardCreateRequest")),
    responses: {
      "200": jsonResponse("Atomically awarded combat XP, GP, and loot history", schemaRef("CombatRewardMutationResponse")),
      "409": jsonResponse("Combat or recipient actor changed after reward review", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/environment-mechanics": {
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying the same environment-mechanic creation",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatEnvironmentMechanicMutationRequest")),
    responses: {
      "200": jsonResponse("Combat with the GM-authored environment mechanic added", schemaRef("Combat")),
      "409": jsonResponse("Combat changed after the mechanic was reviewed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "PATCH /api/v1/combats/{combatId}/environment-mechanics/{mechanicId}": {
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying the same environment-mechanic edit",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatEnvironmentMechanicMutationRequest")),
    responses: {
      "200": jsonResponse("Combat with the environment mechanic updated", schemaRef("Combat")),
      "409": jsonResponse("Combat changed after the mechanic was reviewed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "DELETE /api/v1/combats/{combatId}/environment-mechanics/{mechanicId}": {
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying the same environment-mechanic deletion",
    }],
    requestBody: jsonRequestBody({
      type: "object", additionalProperties: false, required: ["expectedUpdatedAt"],
      properties: { expectedUpdatedAt: { type: "string", format: "date-time" } },
    }),
    responses: {
      "200": jsonResponse("Combat with the environment mechanic removed", schemaRef("Combat")),
      "409": jsonResponse("Combat changed after the mechanic was reviewed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/environment-mechanics/{mechanicId}/trigger": {
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one explicit GM trigger",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatEnvironmentMechanicTriggerRequest")),
    responses: {
      "200": jsonResponse("Combat with a server-authored mechanic trigger record", schemaRef("Combat")),
      "409": jsonResponse("Combat changed or the mechanic is disabled", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/effects/preview": {
    description: "Deterministically previews one explicit scheduled-effect phase without mutating actors or combat. Set prepare=true with an Idempotency-Key to persist the exact reviewed result for commit.",
    parameters: [{
      ...idempotencyKeyParameter,
      required: false,
      description: "Required when prepare=true; this becomes the preparedPreviewKey for the exact reviewed schedule.",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatEffectScheduleRequest")),
    responses: {
      "200": jsonResponse("Scheduled-effect evaluation preview", schemaRef("CombatEffectScheduleEvaluation")),
    },
  },
  "POST /api/v1/combats/{combatId}/effects/advance": {
    description: "Commits a stored reviewed schedule by preparedPreviewKey and exact combat revision. It applies only deterministic expiry, repeat-save, and rescheduling outcomes; it never infers damage, movement, or targets.",
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one reviewed effect-schedule advancement",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatEffectScheduleAdvanceRequest")),
    responses: {
      "200": jsonResponse("Combat and applied scheduled-effect evaluation", schemaRef("CombatEffectScheduleAdvanceResponse")),
      "409": jsonResponse("Combat changed after the effect outcomes were reviewed", schemaRef("StaleWriteConflictResponse")),
      "422": jsonResponse("One or more due repeat saves still need an explicit outcome", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/spell-helper/preview": {
    description: "Returns source-backed, preview-only helpers for selected D&D 5e SRD spells. Unsupported or geometry-dependent steps remain explicit manual work.",
    requestBody: jsonRequestBody(schemaRef("Dnd5eSpellHelperPreviewRequest")),
    responses: {
      "200": jsonResponse("Specialized D&D spell preview with SRD provenance", schemaRef("Dnd5eSpellHelperPreviewResponse")),
      "400": jsonResponse("Unsupported system or invalid spell-helper input", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/actions/{actionId}/confirm": {
    parameters: [{
      name: "Idempotency-Key", in: "header", required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one reviewed pending-action confirmation",
    }],
    requestBody: jsonRequestBody(schemaRef("CombatActionConfirmRequest")),
    responses: {
      "200": jsonResponse(
        "Confirmed combat action",
        schemaRef("CombatActionMutationResponse"),
      ),
      "409": jsonResponse("Combat changed after the action was reviewed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/actions/{actionId}/reject": {
    requestBody: jsonRequestBody(schemaRef("CombatActionRejectRequest")),
    responses: {
      "200": jsonResponse(
        "Rejected combat action",
        schemaRef("CombatActionMutationResponse"),
      ),
      "409": jsonResponse("Combat changed after the action was reviewed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/initiative/roll-npcs": {
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
    }),
    responses: {
      "200": jsonResponse(
        "Rolled initiative for linked NPC combatants",
        schemaRef("CombatInitiativeRollNpcsResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/combats": {
    requestBody: jsonRequestBody(schemaRef("CombatCreateRequest")),
    responses: {
      "200": jsonResponse("Started combat", schemaRef("Combat")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/combats/start": {
    requestBody: jsonRequestBody(schemaRef("CombatStartRequest")),
    responses: {
      "200": jsonResponse("Atomically started reviewed combat", schemaRef("CombatStartResponse")),
      "400": jsonResponse("Invalid scene, participant, or initiative selection", schemaRef("ErrorResponse")),
      "409": jsonResponse("A combat is already active or the idempotency key conflicts", schemaRef("ErrorResponse")),
    },
  },
  "PATCH /api/v1/combats/{combatId}": {
    requestBody: jsonRequestBody(schemaRef("CombatPatchRequest")),
    responses: {
      "200": jsonResponse("Updated combat", schemaRef("Combat")),
      "409": jsonResponse("Combat changed after the mutation was prepared", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "PATCH /api/v1/combats/{combatId}/combatants/{combatantId}": {
    requestBody: jsonRequestBody(schemaRef("CombatantPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated combatant within combat",
        schemaRef("Combat"),
      ),
      "409": jsonResponse("Combat changed after the combatant mutation was prepared", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "DELETE /api/v1/combats/{combatId}": {
    responses: {
      "200": jsonResponse("Ended combat", schemaRef("Combat")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/proposals": {
    responses: {
      "200": jsonResponse("Campaign proposals", arrayOf(schemaRef("Proposal"))),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/proposals": {
    requestBody: jsonRequestBody(schemaRef("ProposalCreateRequest")),
    responses: {
      "200": jsonResponse("Created proposal", schemaRef("Proposal")),
    },
  },
  "POST /api/v1/proposals/{proposalId}/approve": {
    responses: {
      "200": jsonResponse("Approved proposal", schemaRef("Proposal")),
    },
  },
  "POST /api/v1/proposals/{proposalId}/reject": {
    responses: {
      "200": jsonResponse("Rejected proposal", schemaRef("Proposal")),
    },
  },
  "POST /api/v1/proposals/{proposalId}/apply": {
    responses: {
      "200": jsonResponse("Applied proposal", schemaRef("Proposal")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/chat/export": {
    parameters: [
      {
        name: "format",
        in: "query",
        required: false,
        description:
          "Return JSON metadata or newline-delimited JSON chat messages.",
        schema: { type: "string", enum: ["json", "ndjson"] },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Visible campaign chat export",
        schemaRef("ChatExport"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dice-macros": {
    responses: {
      "200": jsonResponse(
        "Campaign dice macros",
        arrayOf(schemaRef("DiceMacro")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dice-macros": {
    requestBody: jsonRequestBody(schemaRef("DiceMacroRequest")),
    responses: {
      "200": jsonResponse("Created dice macro", schemaRef("DiceMacro")),
    },
  },
  "PATCH /api/v1/dice-macros/{macroId}": {
    requestBody: jsonRequestBody(schemaRef("DiceMacroRequest")),
    responses: {
      "200": jsonResponse("Updated dice macro", schemaRef("DiceMacro")),
    },
  },
  "DELETE /api/v1/dice-macros/{macroId}": {
    responses: {
      "200": jsonResponse(
        "Deleted dice macro snapshot",
        schemaRef("DiceMacro"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/audio": {
    responses: {
      "200": jsonResponse(
        "Campaign soundboard tracks and their synced playback state",
        arrayOf(schemaRef("AudioTrack")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/audio": {
    requestBody: jsonRequestBody(schemaRef("AudioTrackRequest")),
    responses: {
      "200": jsonResponse("Created audio track", schemaRef("AudioTrack")),
    },
  },
  "PATCH /api/v1/audio/{trackId}": {
    requestBody: jsonRequestBody(schemaRef("AudioTrackPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated audio track with synced playback state",
        schemaRef("AudioTrack"),
      ),
    },
  },
  "DELETE /api/v1/audio/{trackId}": {
    responses: {
      "200": jsonResponse(
        "Deleted audio track snapshot",
        schemaRef("AudioTrack"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/encounters": {
    responses: {
      "200": jsonResponse(
        "Campaign encounters",
        arrayOf(schemaRef("Encounter")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/encounters": {
    requestBody: jsonRequestBody(schemaRef("EncounterCreateRequest")),
    responses: {
      "200": jsonResponse("Created encounter", schemaRef("Encounter")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/policy": {
    responses: {
      "200": jsonResponse("Effective installation and campaign AI policy", schemaRef("AiEffectivePolicy")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/ai/policy": {
    requestBody: jsonRequestBody(schemaRef("AiPolicyUpdateRequest")),
    responses: {
      "200": jsonResponse("Updated effective campaign AI policy", schemaRef("AiEffectivePolicy")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/privacy/preview": {
    requestBody: jsonRequestBody(schemaRef("AiPrivacyRequest")),
    responses: {
      "200": jsonResponse("Exact local AI operational-history category counts without hidden content", schemaRef("AiPrivacyResult")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/privacy/prune": {
    requestBody: jsonRequestBody(schemaRef("AiPrivacyRequest")),
    responses: {
      "200": jsonResponse("Dry-run or bounded local AI operational-history pruning result", schemaRef("AiPrivacyResult")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/threads": {
    responses: {
      "200": jsonResponse(
        "Campaign AI threads",
        arrayOf(schemaRef("AiThread")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/threads": {
    requestBody: jsonRequestBody(schemaRef("AiThreadCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Completed AI thread response",
        schemaRef("AiThreadResponse"),
      ),
      "428": jsonResponse(
        "Codex app-server ChatGPT sign-in required",
        schemaRef("AiThreadAuthRequiredResponse"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/usage": {
    responses: {
      "200": jsonResponse(
        "Campaign AI usage summary",
        schemaRef("AiUsageMetrics"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/evaluations": {
    responses: {
      "200": jsonResponse(
        "AI evaluation snapshot",
        schemaRef("AiEvaluationSnapshot"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/evaluations": {
    requestBody: jsonRequestBody(schemaRef("AiEvaluationInput")),
    responses: {
      "200": jsonResponse(
        "Created AI evaluation run",
        schemaRef("AiEvaluationRun"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/memory": {
    responses: {
      "200": jsonResponse(
        "Visible campaign AI memory facts",
        arrayOf(schemaRef("AiMemoryFact")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/memory": {
    requestBody: jsonRequestBody(schemaRef("AiMemoryCreateRequest")),
    responses: {
      "200": jsonResponse("Created AI memory fact", schemaRef("AiMemoryFact")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/memory/extract": {
    requestBody: jsonRequestBody(schemaRef("AiMemoryExtractRequest")),
    responses: {
      "200": jsonResponse(
        "Extracted memory through the configured AI provider",
        schemaRef("AiMemoryExtractResponse"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/ai/tool-calls": {
    responses: {
      "200": jsonResponse(
        "Campaign AI tool calls",
        arrayOf(schemaRef("AiToolCall")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/tool-calls/{toolCallId}/retry": {
    requestBody: jsonRequestBody(schemaRef("AiToolCallRetryRequest")),
    responses: {
      "200": jsonResponse(
        "Campaign-scoped replay of a retryable failed AI tool call through the proposal-safe tool executor",
        schemaRef("AdminAiToolCallRetryResult"),
      ),
    },
  },
  "POST /api/v1/ai/memory/{factId}/approve": {
    responses: {
      "200": jsonResponse("Approved AI memory fact", schemaRef("AiMemoryFact")),
    },
  },
  "DELETE /api/v1/ai/memory/{factId}": {
    responses: {
      "200": jsonResponse("Deleted AI memory fact", schemaRef("AiMemoryFact")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/session-recap": {
    requestBody: jsonRequestBody(schemaRef("AiSessionRecapRequest")),
    responses: {
      "200": jsonResponse(
        "Created session recap proposal and memory",
        schemaRef("AiSessionRecapResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/ai/encounter-design": {
    requestBody: jsonRequestBody(schemaRef("AiEncounterDesignRequest")),
    responses: {
      "200": jsonResponse(
        "Created encounter design proposal",
        schemaRef("AiEncounterDesignResponse"),
      ),
    },
  },
  "GET /api/v1/plugins": {
    responses: {
      "200": jsonResponse(
        "Installed plugin catalog",
        arrayOf(schemaRef("PluginRuntimeInfo")),
      ),
    },
  },
  "POST /api/v1/plugins/install": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("PluginPackageInstallRequest")),
    responses: {
      "200": jsonResponse(
        "Registered plugin package",
        schemaRef("PluginRuntimeInfo"),
      ),
      "400": jsonResponse("Invalid package request or missing retry identity", schemaRef("ErrorResponse")),
      "403": jsonResponse("Campaign or server-admin permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Idempotency identity was reused for another package request", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/plugins/registry/sync": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("PluginRegistrySyncRequest")),
    responses: {
      "200": jsonResponse(
        "Plugin registry sync result",
        schemaRef("PluginRegistrySyncResponse"),
      ),
      "400": jsonResponse("Missing retry identity or registry generation", schemaRef("ErrorResponse")),
      "403": jsonResponse("Campaign or server-admin permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Plugin registry generation is stale", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/plugins": {
    responses: {
      "200": jsonResponse(
        "Plugin catalog with campaign installation posture",
        arrayOf(schemaRef("PluginCampaignInfo")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/install": {
    requestBody: jsonRequestBody(schemaRef("PluginInstallRequest")),
    responses: {
      "200": jsonResponse(
        "Installed plugin grant and permission review",
        schemaRef("PluginInstallResponse"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage": {
    responses: {
      "200": jsonResponse(
        "Plugin storage entries visible to the caller",
        arrayOf(schemaRef("PluginStorageEntry")),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    responses: {
      "200": jsonResponse(
        "Plugin storage entry",
        schemaRef("PluginStorageEntry"),
      ),
    },
  },
  "PUT /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    requestBody: jsonRequestBody(schemaRef("PluginStorageSetRequest")),
    responses: {
      "200": jsonResponse(
        "Updated plugin storage entry",
        schemaRef("PluginStorageEntry"),
      ),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    responses: {
      "200": jsonResponse(
        "Deleted plugin storage key result",
        schemaRef("PluginStorageDeleteResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command": {
    requestBody: jsonRequestBody(schemaRef("PluginChatCommandRequest")),
    responses: {
      "200": jsonResponse(
        "Staged plugin command output as reviewable proposals",
        schemaRef("PluginChatCommandResponse"),
      ),
    },
  },
  "GET /api/v1/systems": {
    responses: {
      "200": jsonResponse(
        "Installed rules-system catalog",
        arrayOf(schemaRef("SystemRuntimeInfo")),
      ),
    },
  },
  "POST /api/v1/systems/install": {
    parameters: [requiredOperatorIdempotencyKeyParameter],
    requestBody: jsonRequestBody(schemaRef("SystemInstallRequest")),
    responses: {
      "200": jsonResponse(
        "Registered rules system",
        schemaRef("SystemRuntimeInfo"),
      ),
      "400": jsonResponse("Invalid system manifest", schemaRef("ErrorResponse")),
      "403": jsonResponse("Campaign or server-admin permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("System id, name, or entrypoint conflict", schemaRef("ErrorResponse")),
      "422": jsonResponse("Requested runtime capabilities are unsupported", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems": {
    responses: {
      "200": jsonResponse(
        "Rules-system catalog with active campaign marker",
        arrayOf(schemaRef("SystemRuntimeInfo")),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/compatibility": {
    responses: {
      "200": jsonResponse(
        "Read-only campaign rules, schema, reference, compendium, and manual-calculation compatibility report",
        schemaRef("CampaignCompatibilityReport"),
      ),
      "403": jsonResponse("Campaign update permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install": {
    responses: {
      "200": jsonResponse(
        "Activated rules system for campaign",
        schemaRef("SystemInstallResponse"),
      ),
      "403": jsonResponse("Campaign permission denied", schemaRef("ErrorResponse")),
      "404": jsonResponse("System or campaign not found", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates": {
    responses: {
      "200": jsonResponse(
        "System character templates",
        arrayOf(schemaRef("SystemCharacterTemplate")),
      ),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins": {
    responses: {
      "200": jsonResponse("System character origins", schemaRef("Dnd5eSrdCharacterOrigins")),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters": {
    requestBody: jsonRequestBody(schemaRef("SystemCharacterCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Created system character actor and starter items",
        schemaRef("SystemCharacterCreateResponse"),
      ),
      "400": jsonResponse("Invalid or incomplete guided character choices", schemaRef("ErrorResponse")),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/monsters": {
    requestBody: jsonRequestBody(schemaRef("SystemMonsterCreateRequest")),
    responses: {
      "200": jsonResponse(
        "Created system monster actor",
        schemaRef("SystemMonsterCreateResponse"),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import": {
    requestBody: jsonRequestBody(schemaRef("SystemCharacterImportRequest")),
    responses: {
      "200": jsonResponse(
        "Imported system character actor and items",
        schemaRef("SystemCharacterImportResponse"),
      ),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats": {
    responses: {
      "200": jsonResponse(
        "System encounter threat catalog",
        arrayOf({ type: "object", additionalProperties: true }),
      ),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan": {
    requestBody: jsonRequestBody(schemaRef("SystemEncounterPlanRequest")),
    responses: {
      "200": jsonResponse(
        "System encounter plan and optional encounter",
        schemaRef("SystemEncounterPlanResponse"),
      ),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/compendium": {
    parameters: [
      { name: "q", in: "query", required: false, schema: { type: "string", maxLength: 160 }, description: "Case-insensitive search across name, summary, type, and source" },
      { name: "type", in: "query", required: false, schema: { type: "string" }, description: "Single compendium entry type" },
      { name: "types", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated compendium entry types" },
    ],
    responses: {
      "200": jsonResponse(
        "System compendium entries",
        schemaRef("SystemCompendium"),
      ),
      "422": unsupportedSystemCapabilityResponse,
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dnd/custom-content": {
    responses: {
      "200": jsonResponse("Campaign D&D custom content editable by a GM or campaign editor", arrayOf(schemaRef("DndCustomContentResponse"))),
      "403": jsonResponse("Campaign update permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/custom-content/preview": {
    requestBody: jsonRequestBody(schemaRef("DndCustomContentDraft")),
    responses: {
      "200": jsonResponse("Validated D&D custom content preview without a state mutation", schemaRef("DndCustomContentPreviewResponse")),
      "403": jsonResponse("Campaign update permission denied", schemaRef("ErrorResponse")),
      "422": jsonResponse("D&D custom content validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/custom-content": {
    parameters: [{
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one reviewed custom-content creation",
    }],
    requestBody: jsonRequestBody(schemaRef("DndCustomContentMutationRequest")),
    responses: {
      "201": jsonResponse("Created a provenance-bearing D&D custom compendium entry", schemaRef("DndCustomContentResponse")),
      "409": jsonResponse("Campaign revision changed after preview", schemaRef("StaleWriteConflictResponse")),
      "422": jsonResponse("D&D custom content validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/dnd/custom-content/{itemId}": {
    parameters: [{
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 160 },
      description: "Stable key reused when retrying one reviewed custom-content update",
    }],
    requestBody: jsonRequestBody(schemaRef("DndCustomContentMutationRequest")),
    responses: {
      "200": jsonResponse("Updated D&D custom content", schemaRef("DndCustomContentResponse")),
      "404": jsonResponse("Custom content not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Custom content revision changed after preview", schemaRef("StaleWriteConflictResponse")),
      "422": jsonResponse("D&D custom content validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/dnd/custom-content/{itemId}": {
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
        description: "Stable key reused when retrying one reviewed custom-content deletion",
      },
      {
        name: "expectedUpdatedAt",
        in: "query",
        required: false,
        schema: { type: "string", format: "date-time" },
        description: "Exact custom-content revision expected by clients that cannot send a DELETE request body",
      },
    ],
    requestBody: optionalJsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedUpdatedAt"],
      properties: { expectedUpdatedAt: { type: "string", format: "date-time" } },
    }),
    responses: {
      "200": jsonResponse("Deleted D&D custom content", { type: "object", additionalProperties: true }),
      "404": jsonResponse("Custom content not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Custom content revision changed before deletion", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dnd/monster-templates": {
    responses: {
      "200": jsonResponse("Campaign-scoped reusable typed monster override templates", arrayOf(schemaRef("DndMonsterTemplateResponse"))),
      "403": jsonResponse("Campaign update permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/monster-templates/preview": {
    description: "Validates a typed monster override template without mutating campaign state.",
    requestBody: jsonRequestBody(schemaRef("DndMonsterTemplateDraft")),
    responses: {
      "200": jsonResponse("Validated monster template preview", schemaRef("DndMonsterTemplatePreviewResponse")),
      "422": jsonResponse("Monster template validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/monster-templates": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      allOf: [
        schemaRef("DndMonsterTemplateDraft"),
        { type: "object", required: ["expectedCampaignUpdatedAt"], properties: { expectedCampaignUpdatedAt: dateTimeSchema } },
      ],
    }),
    responses: {
      "201": jsonResponse("Created a replay-safe campaign monster template", schemaRef("DndMonsterTemplateResponse")),
      "409": jsonResponse("Campaign revision changed after review", schemaRef("StaleWriteConflictResponse")),
      "422": jsonResponse("Monster template validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/dnd/monster-templates/{templateId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      allOf: [
        schemaRef("DndMonsterTemplateDraft"),
        { type: "object", required: ["expectedUpdatedAt"], properties: { expectedUpdatedAt: dateTimeSchema } },
      ],
    }),
    responses: {
      "200": jsonResponse("Updated a revision-guarded monster template", schemaRef("DndMonsterTemplateResponse")),
      "404": jsonResponse("Monster template not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Monster template revision changed after review", schemaRef("StaleWriteConflictResponse")),
      "422": jsonResponse("Monster template validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "DELETE /api/v1/campaigns/{campaignId}/dnd/monster-templates/{templateId}": {
    parameters: [
      { ...idempotencyKeyParameter, required: true },
      { name: "expectedUpdatedAt", in: "query", required: false, schema: dateTimeSchema, description: "Exact template revision for clients that cannot send a DELETE body" },
    ],
    requestBody: optionalJsonRequestBody({ type: "object", additionalProperties: false, required: ["expectedUpdatedAt"], properties: { expectedUpdatedAt: dateTimeSchema } }),
    responses: {
      "200": jsonResponse("Deleted a revision-guarded monster template", { type: "object", additionalProperties: true }),
      "404": jsonResponse("Monster template not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Monster template revision changed before deletion", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dnd/monster-bases": {
    responses: {
      "200": jsonResponse("Immutable bundled and campaign custom monster bases available to the editor", arrayOf(schemaRef("DndMonsterBase"))),
      "403": jsonResponse("Campaign update permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/monster-variants/preview": {
    description: "Resolves an immutable base plus optional template, returns an exact base-to-result diff, and performs no mutation.",
    requestBody: jsonRequestBody(schemaRef("DndMonsterVariantDraft")),
    responses: {
      "200": jsonResponse("Reviewed monster variant preview", schemaRef("DndMonsterVariantPreviewResponse")),
      "404": jsonResponse("Monster base or template not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Monster base or template version changed after review", schemaRef("ErrorResponse")),
      "422": jsonResponse("Monster variant validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/monster-variants": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      allOf: [
        schemaRef("DndMonsterVariantDraft"),
        { type: "object", required: ["expectedCampaignUpdatedAt"], properties: { expectedCampaignUpdatedAt: dateTimeSchema } },
      ],
    }),
    responses: {
      "201": jsonResponse("Created an immutable provenance-bearing campaign monster variant", schemaRef("DndMonsterVariantResponse")),
      "404": jsonResponse("Monster base or template not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Campaign, base, or template revision changed after review", schemaRef("ErrorResponse")),
      "422": jsonResponse("Monster variant validation failed", schemaRef("DndCustomContentInvalidResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dnd/character-reviews": {
    responses: {
      "200": jsonResponse("Permission-filtered D&D character review queue and validation previews", schemaRef("DndCharacterReviewListResponse")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/dnd/character-review-policy": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["mode", "expectedCampaignUpdatedAt"],
      properties: {
        mode: { type: "string", enum: ["optional", "required"] },
        expectedCampaignUpdatedAt: { type: "string", format: "date-time" },
      },
    }),
    responses: {
      "200": jsonResponse("Updated the explicit campaign character approval policy", {
        type: "object",
        additionalProperties: false,
        required: ["policy", "campaignUpdatedAt"],
        properties: {
          policy: { type: "object", additionalProperties: false, required: ["mode", "configured"], properties: { mode: { type: "string", enum: ["optional", "required"] }, configured: { type: "boolean" } } },
          campaignUpdatedAt: { type: "string", format: "date-time" },
        },
      }),
      "409": jsonResponse("Campaign revision changed before policy update", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/character-reviews/{actorId}/submit": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedActorUpdatedAt", "expectedItemUpdatedAt"],
      properties: {
        expectedActorUpdatedAt: { type: "string", format: "date-time" },
        expectedItemUpdatedAt: { type: "object", additionalProperties: { type: "string", format: "date-time" } },
      },
    }),
    responses: {
      "200": jsonResponse("Submitted or resubmitted a character with a validation snapshot", schemaRef("DndCharacterReviewEntry")),
      "404": jsonResponse("D&D character not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Actor or owned item revision changed before submission", { type: "object", additionalProperties: true }),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/character-reviews/{actorId}/decision": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["action", "expectedActorUpdatedAt", "expectedFingerprint"],
      properties: {
        action: { type: "string", enum: ["approve", "request_changes"] },
        expectedActorUpdatedAt: { type: "string", format: "date-time" },
        expectedFingerprint: { type: "string", pattern: "^sha256:" },
        reason: stringSchema,
        overrideValidation: { type: "boolean" },
      },
    }),
    responses: {
      "200": jsonResponse("Approved a character or requested changes with an auditable reason", schemaRef("DndCharacterReviewEntry")),
      "404": jsonResponse("D&D character not found", schemaRef("ErrorResponse")),
      "409": jsonResponse("Submission is missing, stale, changed, or blocked by validation", { type: "object", additionalProperties: true }),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dnd/inventory": {
    parameters: [{ name: "actorId", in: "query", required: false, schema: idSchema, description: "Optional D&D actor whose private inventory should be included" }],
    responses: {
      "200": jsonResponse("Permission-safe D&D inventory, carrying, stash, merchant, and loot overview", schemaRef("DndInventoryOverviewResponse")),
      "403": jsonResponse("Actor private-data permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/party-stash": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndPartyStashCreateRequest")),
    responses: {
      "201": jsonResponse("Created the campaign party stash", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Campaign revision changed or a party stash already exists", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/merchants": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndMerchantMutationRequest")),
    responses: {
      "201": jsonResponse("Created a D&D merchant with an optional tracked cash balance", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Campaign revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndMerchantMutationRequest")),
    responses: {
      "200": jsonResponse("Updated a D&D merchant", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Campaign or merchant revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "PATCH /api/v1/campaigns/{campaignId}/dnd/inventory/items/{itemId}": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndInventoryItemPatchRequest")),
    responses: {
      "200": jsonResponse("Updated quantity, weight, container, extradimensional, or ammunition metadata", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Item or owner inventory revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/inventory/items/{itemId}/transfer": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndInventoryTransferRequest")),
    responses: {
      "200": jsonResponse("Atomically transferred a stack or full container subtree", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Item, source, or destination revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/inventory/items/{weaponItemId}/consume-ammunition": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndInventoryAmmunitionRequest")),
    responses: {
      "200": jsonResponse("Consumed linked ammunition and returned the remaining quantity", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Weapon, ammunition, or actor revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}/buy": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndMerchantCommerceRequest")),
    responses: {
      "200": jsonResponse("Purchased merchant inventory with copper-exact accounting", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Revision, stock, or currency conflict", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/merchants/{merchantId}/sell": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndMerchantCommerceRequest")),
    responses: {
      "200": jsonResponse("Sold actor inventory with copper-exact accounting", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Revision or tracked merchant liquidity conflict", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/combats/{combatId}/dnd/loot": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndCombatLootCreateRequest")),
    responses: {
      "201": jsonResponse("Recorded typed combat loot in the campaign party stash", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Combat or stash revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/loot/{itemId}/claim": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndLootClaimRequest")),
    responses: {
      "200": jsonResponse("Claimed available loot for an owned actor", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Loot, stash, or actor revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/loot/{itemId}/assignment": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndLootAssignmentRequest")),
    responses: {
      "200": jsonResponse("Assigned claimed loot or released it back to the party stash", { type: "object", additionalProperties: true }),
      "409": jsonResponse("Loot, stash, or actor revision changed", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium":
    {
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 160 },
          description: "Stable key reused when retrying the same compendium import",
        },
      ],
      requestBody: jsonRequestBody(schemaRef("SystemActorCompendiumRequest")),
      responses: {
        "200": jsonResponse(
          "Applied compendium entry to actor",
          schemaRef("SystemActorCompendiumResponse"),
        ),
        "409": jsonResponse("Actor revision or compendium entry conflict", {
          anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("CompendiumConflictResponse"), schemaRef("ErrorResponse")],
        }),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase":
    {
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 160 },
          description: "Stable key reused when retrying the same equipment purchase",
        },
      ],
      requestBody: jsonRequestBody(schemaRef("SystemEquipmentPurchaseRequest")),
      responses: {
        "200": jsonResponse(
          "Purchased compendium equipment for actor",
          schemaRef("SystemEquipmentPurchaseResponse"),
        ),
        "409": jsonResponse("Actor revision, compendium entry, or currency conflict", {
          anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("CompendiumConflictResponse"), schemaRef("ErrorResponse")],
        }),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions":
    {
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 1, maxLength: 160 },
          description: "Stable key reused when retrying the same condition application",
        },
      ],
      requestBody: jsonRequestBody(schemaRef("SystemActorConditionApplyRequest")),
      responses: {
        "200": jsonResponse(
          "Applied system condition to actor",
          schemaRef("SystemActorConditionResponse"),
        ),
        "409": jsonResponse("Actor changed after condition application was prepared", schemaRef("StaleWriteConflictResponse")),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "DELETE /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}":
    {
      parameters: [
        {
          name: "expectedUpdatedAt",
          in: "query",
          required: true,
          schema: { type: "string", format: "date-time" },
          description: "Actor revision observed before removing the condition",
        },
      ],
      responses: {
        "200": jsonResponse(
          "Removed system condition from actor",
          schemaRef("SystemActorConditionResponse"),
        ),
        "409": jsonResponse("Actor changed after condition removal was prepared", schemaRef("StaleWriteConflictResponse")),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/attunement":
    {
      requestBody: jsonRequestBody({
        type: "object",
        additionalProperties: false,
        required: ["itemId", "attuned", "expectedUpdatedAt"],
        properties: {
          itemId: idSchema,
          attuned: { type: "boolean" },
          expectedUpdatedAt: { type: "string", format: "date-time" },
          overrideReason: stringSchema,
          breakCurse: { type: "boolean" },
        },
      }),
      responses: {
        "200": jsonResponse("Changed D&D actor item attunement", {
          type: "object",
          additionalProperties: true,
          required: ["actor", "item"],
          properties: {
            actor: schemaRef("Actor"),
            item: schemaRef("Item"),
            attunement: { type: "object", additionalProperties: true },
            prerequisite: { type: "object", additionalProperties: true },
            sheet: { type: "object", additionalProperties: true },
          },
        }),
        "409": jsonResponse("Actor revision conflict", schemaRef("StaleWriteConflictResponse")),
      },
    },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement":
    {
      responses: {
        "200": jsonResponse("System actor advancement options", {
          type: "object",
          additionalProperties: true,
          properties: { pendingAdvancement: schemaRef("Dnd5eSrdPendingAdvancement") },
        }),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "DELETE /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement/pending": {
    description: "Cancels the exact durable D&D advancement draft or ready preview without changing the actor.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("Dnd5eSrdPendingAdvancementCancelRequest")),
    responses: {
      "200": jsonResponse("Pending advancement cancelled", schemaRef("Dnd5eSrdPendingAdvancementCancelResult")),
      "403": jsonResponse("Actor update permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Pending advancement or actor revision is stale", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-validation":
    {
      responses: {
        "200": jsonResponse("Read-only D&D actor and item validation report", schemaRef("Dnd5eSrdRulesValidationResponse")),
      },
    },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/calculation-explanation":
    {
      responses: {
        "200": jsonResponse("Ordered authoritative D&D calculation terms with explicit review flags and provenance", schemaRef("ActorCalculationExplanation")),
        "400": jsonResponse("Calculation explanations are unavailable for this system", schemaRef("ErrorResponse")),
        "403": jsonResponse("Actor private-data permission denied", schemaRef("ErrorResponse")),
      },
    },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures": {
    responses: {
      "200": jsonResponse("Visible D&D controlled-creature lifecycle records", { type: "object", additionalProperties: true, required: ["records"], properties: { records: arrayOf({ type: "object", additionalProperties: true }) } }),
      "400": jsonResponse("Controlled creatures are unavailable for this system", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/preview": {
    requestBody: jsonRequestBody(schemaRef("DndControlledCreatureCreateRequest")),
    responses: {
      "200": jsonResponse("Side-effect-free D&D controlled-creature preview with manual-review fallbacks", schemaRef("DndControlledCreaturePreview")),
      "403": jsonResponse("Controlled-creature preparation permission denied", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndControlledCreatureConfirmRequest")),
    responses: {
      "200": jsonResponse("Confirmed atomic D&D controlled-creature lifecycle", schemaRef("DndControlledCreatureMutationResult")),
      "409": jsonResponse("Preview, manual review, or root revision is stale", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/command": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({ type: "object", additionalProperties: false, required: ["expectedUpdatedAt"], properties: { expectedUpdatedAt: schemaRef("DndControlledCreatureRevisionSet"), note: { type: "string", maxLength: 500 }, combatId: idSchema, round: { type: "integer", minimum: 1 } } }),
    responses: { "200": jsonResponse("Recorded a reviewed command and its D&D action cost", schemaRef("DndControlledCreatureMutationResult")), "409": jsonResponse("Controlled-creature revision is stale", schemaRef("ErrorResponse")) },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/concentration/end": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({ type: "object", additionalProperties: false, required: ["sourceActorId", "groupId", "expectedUpdatedAt"], properties: { sourceActorId: idSchema, groupId: stringSchema, reason: { type: "string", maxLength: 500 }, expectedUpdatedAt: schemaRef("DndControlledCreatureRevisionSet") } }),
    responses: { "200": jsonResponse("Ended concentration and cleaned every linked controlled creature atomically", schemaRef("DndControlledCreatureMutationResult")), "409": jsonResponse("Concentration group or a changed root is stale", schemaRef("ErrorResponse")) },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/end": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({ type: "object", additionalProperties: false, required: ["reason", "expectedUpdatedAt"], properties: { reason: { type: "string", enum: ["dismissed", "expired"] }, expectedUpdatedAt: schemaRef("DndControlledCreatureRevisionSet") } }),
    responses: { "200": jsonResponse("Atomically dismissed, expired, or reverted a controlled creature", schemaRef("DndControlledCreatureMutationResult")), "409": jsonResponse("Lifecycle is not ready or a root revision is stale", schemaRef("ErrorResponse")) },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rules-preview":
    {
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 160 },
          description: "Required when prepare is true so the exact server-owned preview can be committed or safely replayed.",
        },
      ],
      requestBody: jsonRequestBody(schemaRef("Dnd5eSrdRulesPreviewRequest")),
      responses: {
        "200": jsonResponse("Side-effect-free D&D rules preview envelope", schemaRef("Dnd5eSrdRulesPreviewResponse")),
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/typed-damage/apply": {
    description: "Atomically applies a stored reviewed D&D typed-damage preview to every target using exact actor, item, and relevant active-combat revisions.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("Dnd5eSrdTypedDamageApplyRequest")),
    responses: {
      "200": jsonResponse("Reviewed typed damage applied atomically", schemaRef("Dnd5eSrdTypedDamageApplyResult")),
      "403": jsonResponse("One or more target actors cannot be updated", schemaRef("ErrorResponse")),
      "409": jsonResponse("Prepared typed damage or one of its exact roots is stale", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/dnd/rules-mutations/{mutationId}/undo": {
    description: "Restores the exact pre-commit actor, item, and optional combat roots for one current D&D rules mutation.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("DndRulesMutationUndoRequest")),
    responses: {
      "200": jsonResponse("D&D rules mutation undone", schemaRef("DndRulesMutationUndoResult")),
      "403": jsonResponse("One or more exact roots cannot be updated", schemaRef("ErrorResponse")),
      "409": jsonResponse("Mutation was already undone or one of its exact roots is stale", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/spell-preparation/preview": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("Dnd5eSrdSpellPreparationPreviewRequest")),
    responses: {
      "200": jsonResponse("Rules-aware prepared-spell capacity, timing, blockers, and exact proposed changes", schemaRef("Dnd5eSrdSpellPreparationPreviewResponse")),
      "400": jsonResponse("Invalid spell-preparation selection or revision envelope", schemaRef("ErrorResponse")),
      "403": jsonResponse("Actor update permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Actor or spell item revision is stale", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/spell-preparation/apply": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("Dnd5eSrdSpellPreparationApplyRequest")),
    responses: {
      "200": jsonResponse("Atomically applied a reviewed spell-preparation plan", schemaRef("Dnd5eSrdSpellPreparationMutationResult")),
      "400": jsonResponse("Invalid prepared-preview or revision envelope", schemaRef("ErrorResponse")),
      "403": jsonResponse("Actor update permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Reviewed preview or an actor/item revision is stale", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance":
    {
      description: "Advances a system actor. D&D 5e SRD requires a stored preparedPreviewKey, the exact actor revision, and a separate commit Idempotency-Key.",
      parameters: [{
        ...idempotencyKeyParameter,
        required: false,
        description: "Required for D&D 5e SRD commits; use a key distinct from the preview key.",
      }],
      requestBody: jsonRequestBody(schemaRef("SystemActorAdvanceRequest")),
      responses: {
        "200": jsonResponse(
          "Advanced system actor",
          schemaRef("SystemActorAdvanceResponse"),
        ),
        "409": jsonResponse("Actor changed after advancement was prepared", schemaRef("StaleWriteConflictResponse")),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest":
    {
      description: "Applies a system rest. D&D 5e SRD requires a stored preparedPreviewKey, the exact actor revision, and a separate commit Idempotency-Key.",
      parameters: [{
        ...idempotencyKeyParameter,
        required: false,
        description: "Required for D&D 5e SRD commits; use a key distinct from the preview key.",
      }],
      requestBody: jsonRequestBody(schemaRef("SystemActorRestRequest")),
      responses: {
        "200": jsonResponse(
          "Applied system rest to actor",
          schemaRef("SystemActorRestResponse"),
        ),
        "409": jsonResponse("Actor changed after rest was prepared", schemaRef("StaleWriteConflictResponse")),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet":
    {
      responses: {
        "200": jsonResponse("System actor sheet", {
          type: "object",
          additionalProperties: true,
        }),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/heroic-inspiration/grant": {
    description: "Grants one Heroic Inspiration to a D&D actor, or transfers an overflow grant to an explicit eligible recipient when the source actor already holds it.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["expectedActorUpdatedAt"],
      properties: {
        expectedActorUpdatedAt: dateTimeSchema,
        recipientActorId: idSchema,
        expectedRecipientUpdatedAt: dateTimeSchema,
      },
    }),
    responses: {
      "200": jsonResponse("Granted or transferred Heroic Inspiration", { type: "object", additionalProperties: true }),
      "403": jsonResponse("Only an authorized GM can grant Heroic Inspiration", schemaRef("ErrorResponse")),
      "409": jsonResponse("Actor revision is stale or no recipient is eligible", { anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("ErrorResponse")] }),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/heroic-inspiration/reroll": {
    description: "Spends one Heroic Inspiration immediately after an actor d20 roll, replaces exactly the selected normal/Advantage/Disadvantage die, and links the mandatory new result to the original roll.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody({
      type: "object",
      additionalProperties: false,
      required: ["originalRollId", "selectedTermIndex", "selectedResultIndex", "expectedActorUpdatedAt"],
      properties: {
        originalRollId: idSchema,
        selectedTermIndex: { type: "integer", minimum: 0 },
        selectedResultIndex: { type: "integer", minimum: 0 },
        expectedActorUpdatedAt: dateTimeSchema,
      },
    }),
    responses: {
      "200": jsonResponse("Spent Heroic Inspiration and recorded the required linked reroll", { type: "object", additionalProperties: true }),
      "403": jsonResponse("Actor update or private-data permission denied", schemaRef("ErrorResponse")),
      "409": jsonResponse("Actor revision is stale, Inspiration was spent, or the roll is no longer immediate", { anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("ErrorResponse")] }),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll":
    {
      description: "Previews or executes a system roll. D&D actions that consume resources or apply effects must first be stored with prepare=true, then committed by preparedPreviewKey, exact revisions, and a separate Idempotency-Key.",
      parameters: [{
        ...idempotencyKeyParameter,
        required: false,
        description: "Required for D&D prepared consequence previews and commits.",
      }],
      requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
      responses: {
        "200": jsonResponse(
          "Executed system actor roll",
          schemaRef("SystemRollResponse"),
        ),
        "409": jsonResponse("Actor changed or the requested action has a domain conflict", {
          anyOf: [schemaRef("StaleWriteConflictResponse"), schemaRef("ErrorResponse")],
        }),
        "422": unsupportedSystemCapabilityResponse,
      },
    },
  "GET /api/v1/campaigns/{campaignId}/export": {
    parameters: [
      {
        name: "scope",
        in: "query",
        required: false,
        description:
          "Archive export scope: the full campaign, one dependency-closed world, or selected record collections.",
        schema: {
          type: "string",
          enum: ["campaign", "world", "selected_collections"],
        },
      },
      {
        name: "scopeId",
        in: "query",
        required: false,
        description: "Required world id when scope is world.",
        schema: { type: "string" },
      },
      {
        name: "collections",
        in: "query",
        required: false,
        description:
          "Comma-separated portable collection names when scope is selected_collections.",
        schema: { type: "string" },
      },
      {
        name: "version",
        in: "query",
        required: false,
        description: "Archive compatibility version to emit.",
        schema: { type: "string", enum: ["0.2.0"] },
      },
      {
        name: "redaction",
        in: "query",
        required: false,
        description:
          "Portable archive redaction mode. It strips account/auth/server operational secrets while preserving playable campaign content.",
        schema: { type: "string", enum: ["portable"] },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Campaign archive export",
        schemaRef("CampaignArchive"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/export/stream": {
    description: "Backpressured campaign archive export with JSON metadata and raw checksum-framed asset bytes. This avoids whole-archive base64 materialization while preserving the same archive scope and redaction semantics.",
    parameters: [
      {
        name: "scope",
        in: "query",
        required: false,
        schema: { type: "string", enum: ["campaign", "world", "selected_collections"] },
      },
      { name: "scopeId", in: "query", required: false, schema: { type: "string" } },
      { name: "collections", in: "query", required: false, schema: { type: "string" } },
      { name: "version", in: "query", required: false, schema: { type: "string", enum: ["0.2.0"] } },
      { name: "redaction", in: "query", required: false, schema: { type: "string", enum: ["portable"] } },
    ],
    responses: {
      "200": {
        description: "Framed OTTX campaign archive stream",
        content: {
          [campaignArchiveStreamContentType]: {
            schema: { type: "string", format: "binary" },
          },
        },
      },
      "413": jsonResponse("Campaign archive exceeds the configured streaming envelope", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/dogfood-report-bundle": {
    responses: {
      "200": jsonResponse(
        "Campaign dogfood report bundle",
        schemaRef("CampaignDogfoodReportBundle"),
      ),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/archive-import-operations": {
    parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["applied", "partially_rolled_back", "rolled_back"] } }],
    responses: { "200": jsonResponse("Campaign archive import recovery operations", schemaRef("CampaignArchiveImportOperationList")) },
  },
  "GET /api/v1/campaigns/{campaignId}/archive-import-operations/{operationId}/preview": {
    responses: {
      "200": jsonResponse("Current exact-row rollback impact and conflicts", schemaRef("CampaignArchiveImportRollbackPreview")),
      "404": jsonResponse("Archive import operation not found in this campaign", schemaRef("ErrorResponse")),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/archive-import-operations/{operationId}/rollback": {
    description: "Idempotently applies the still-safe exact inverse rows and asset bytes for one campaign-scoped archive import operation. Changed or newly referenced rows are preserved and returned as conflicts.",
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("CampaignArchiveImportRollbackRequest")),
    responses: {
      "200": jsonResponse("Campaign archive import rollback result", schemaRef("CampaignArchiveImportRollbackResponse")),
      "404": jsonResponse("Archive import operation not found in this campaign", schemaRef("ErrorResponse")),
      "409": jsonResponse("Campaign revision changed after rollback review", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "POST /api/v1/import/campaign": {
    parameters: [{ ...idempotencyKeyParameter, required: true }],
    requestBody: jsonRequestBody(schemaRef("CampaignImportRequest")),
    responses: {
      "200": jsonResponse(
        "Campaign import result",
        schemaRef("CampaignImportResponse"),
      ),
    },
  },
  "POST /api/v1/import/campaign/stream": {
    description: "Stages and validates a framed OTTX stream before applying the same permission, reference, conflict, atomic-state, and compensating object rollback rules as JSON campaign import.",
    parameters: [
      { ...idempotencyKeyParameter, required: true },
      { name: "mode", in: "query", required: false, schema: { type: "string", enum: ["upsert", "reject_conflicts", "skip_conflicts", "dry_run"] } },
      { name: "scope", in: "query", required: false, schema: { type: "string", enum: ["all", "assets_only", "selected_collections"] } },
      { name: "collections", in: "query", required: false, schema: { type: "string" } },
      { name: "regenerateIds", in: "query", required: false, schema: { type: "boolean" } },
      { name: "expectedUpdatedAt", in: "query", required: false, schema: dateTimeSchema, description: "Required for a non-dry-run import that targets an existing campaign; must equal that campaign's current revision." },
    ],
    requestBody: binaryRequestBody(
      campaignArchiveStreamContentType,
      "Framed OTTX campaign archive stream returned by the streaming export route.",
    ),
    responses: {
      "200": jsonResponse("Campaign stream import result", schemaRef("CampaignImportResponse")),
      "400": jsonResponse("Invalid framing, archive metadata, checksum, references, or import options", schemaRef("ErrorResponse")),
      "409": jsonResponse("Archive import conflict or stale existing-campaign revision", schemaRef("ErrorResponse")),
      "413": jsonResponse("Campaign archive stream exceeds configured limits", schemaRef("ErrorResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/content-imports": {
    responses: {
      "200": jsonResponse(
        "Campaign content import batches",
        arrayOf(schemaRef("ContentImportBatch")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/content-imports/preview": {
    requestBody: jsonRequestBody(schemaRef("ContentImportPreviewRequest")),
    responses: {
      "200": jsonResponse(
        "Previewed content import batch",
        schemaRef("ContentImportBatch"),
      ),
    },
  },
  "POST /api/v1/ai/memory/{factId}/reject": {
    responses: {
      "200": jsonResponse(
        "Rejected AI memory candidate",
        schemaRef("AiMemoryFact"),
      ),
    },
  },
  "GET /api/v1/ai/memory/{factId}": {
    responses: {
      "200": jsonResponse(
        "Requested AI memory fact visible to the caller",
        schemaRef("AiMemoryFact"),
      ),
    },
  },
  "PATCH /api/v1/ai/memory/{factId}": {
    requestBody: jsonRequestBody(schemaRef("AiMemoryPatchRequest")),
    responses: {
      "200": jsonResponse(
        "Updated AI memory fact lifecycle or metadata",
        schemaRef("AiMemoryFact"),
      ),
    },
  },
  "POST /api/v1/proposals/{proposalId}/revert": {
    responses: {
      "200": jsonResponse(
        "Reverted an applied proposal with captured inverse changes",
        schemaRef("Proposal"),
      ),
    },
  },
  "GET /api/v1/encounters/{encounterId}": {
    responses: {
      "200": jsonResponse(
        "Requested encounter visible to the caller",
        schemaRef("Encounter"),
      ),
    },
  },
  "PATCH /api/v1/encounters/{encounterId}": {
    requestBody: jsonRequestBody(schemaRef("EncounterPatchRequest")),
    responses: {
      "200": jsonResponse("Updated encounter", schemaRef("Encounter")),
    },
  },
  "DELETE /api/v1/encounters/{encounterId}": {
    responses: {
      "200": jsonResponse("Deleted encounter snapshot", schemaRef("Encounter")),
    },
  },
  "DELETE /api/v1/journal/{entryId}": {
    parameters: [
      {
        name: "expectedUpdatedAt",
        in: "query",
        required: true,
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 160 },
      },
    ],
    responses: {
      "200": jsonResponse(
        "Deleted journal entry snapshot",
        schemaRef("JournalEntry"),
      ),
      "409": jsonResponse("Journal entry changed after delete was prepared", schemaRef("StaleWriteConflictResponse")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/handouts": {
    responses: {
      "200": jsonResponse(
        "Campaign handouts visible to the caller",
        arrayOf(schemaRef("Handout")),
      ),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/handouts": {
    requestBody: jsonRequestBody(schemaRef("HandoutWriteRequest")),
    responses: { "200": jsonResponse("Created handout", schemaRef("Handout")) },
  },
  "GET /api/v1/handouts/{handoutId}": {
    responses: {
      "200": jsonResponse(
        "Requested handout visible to the caller",
        schemaRef("Handout"),
      ),
    },
  },
  "PATCH /api/v1/handouts/{handoutId}": {
    requestBody: jsonRequestBody(schemaRef("HandoutPatchRequest")),
    responses: {
      "200": jsonResponse("Updated handout", schemaRef("Handout")),
      "409": jsonResponse("Handout changed after the editor loaded it", schemaRef("ErrorResponse")),
    },
  },
  "DELETE /api/v1/handouts/{handoutId}": {
    responses: {
      "200": jsonResponse("Deleted handout snapshot", schemaRef("Handout")),
    },
  },
  "POST /api/v1/handouts/{handoutId}/read": {
    responses: {
      "200": jsonResponse(
        "Marked handout read for the caller",
        schemaRef("Handout"),
      ),
    },
  },
  "DELETE /api/v1/items/{itemId}": {
    responses: {
      "200": jsonResponse("Deleted item snapshot", schemaRef("Item")),
    },
  },
  "DELETE /api/v1/actors/{actorId}": {
    responses: {
      "200": jsonResponse("Deleted actor snapshot", schemaRef("Actor")),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/worlds": {
    responses: {
      "200": jsonResponse("Campaign worlds", arrayOf(schemaRef("World"))),
    },
  },
  "POST /api/v1/campaigns/{campaignId}/worlds": {
    requestBody: jsonRequestBody(schemaRef("WorldWriteRequest")),
    responses: { "200": jsonResponse("Created world", schemaRef("World")) },
  },
  "GET /api/v1/worlds/{worldId}": {
    responses: { "200": jsonResponse("Requested world", schemaRef("World")) },
  },
  "PATCH /api/v1/worlds/{worldId}": {
    requestBody: jsonRequestBody(schemaRef("WorldWriteRequest")),
    responses: { "200": jsonResponse("Updated world", schemaRef("World")) },
  },
  "DELETE /api/v1/worlds/{worldId}": {
    responses: {
      "200": jsonResponse("Deleted world and detached record counts", {
        type: "object",
        additionalProperties: true,
      }),
    },
  },
  "GET /api/v1/campaigns/{campaignId}/world-records": {
    parameters: [
      { name: "worldId", in: "query", schema: idSchema },
      { name: "kind", in: "query", schema: { type: "string", enum: ["npc", "location", "quest", "faction"] } },
      { name: "lifecycle", in: "query", schema: { type: "string", enum: ["draft", "active", "inactive", "resolved", "archived"] } },
    ],
    responses: { "200": jsonResponse("Permission-filtered typed campaign world records", arrayOf(schemaRef("WorldRecord"))) },
  },
  "POST /api/v1/campaigns/{campaignId}/world-records": {
    requestBody: jsonRequestBody(schemaRef("WorldRecordCreateRequest")),
    responses: { "201": jsonResponse("Created typed world record with server-owned provenance", schemaRef("WorldRecord")) },
  },
  "PATCH /api/v1/world-records/{recordId}": {
    requestBody: jsonRequestBody(schemaRef("WorldRecordWriteRequest")),
    responses: { "200": jsonResponse("Updated typed world record", schemaRef("WorldRecord")) },
  },
  "POST /api/v1/world-records/{recordId}/lifecycle": {
    requestBody: jsonRequestBody(schemaRef("WorldRecordLifecycleRequest")),
    responses: { "200": jsonResponse("Updated typed world-record lifecycle", schemaRef("WorldRecord")) },
  },
  "DELETE /api/v1/world-records/{recordId}": {
    parameters: [{ name: "expectedUpdatedAt", in: "query", required: true, schema: { type: "string", format: "date-time" } }],
    responses: { "200": jsonResponse("Deleted world record and its typed relations", schemaRef("WorldRecordDeleteResponse")) },
  },
  "GET /api/v1/campaigns/{campaignId}/world-relations": {
    parameters: [
      { name: "recordId", in: "query", schema: idSchema },
      { name: "worldId", in: "query", schema: idSchema },
    ],
    responses: { "200": jsonResponse("Permission- and endpoint-filtered typed world relations", arrayOf(schemaRef("WorldRelation"))) },
  },
  "POST /api/v1/campaigns/{campaignId}/world-relations": {
    requestBody: jsonRequestBody(schemaRef("WorldRelationCreateRequest")),
    responses: { "201": jsonResponse("Created typed world relation with server-owned provenance", schemaRef("WorldRelation")) },
  },
  "PATCH /api/v1/world-relations/{relationId}": {
    requestBody: jsonRequestBody(schemaRef("WorldRelationWriteRequest")),
    responses: { "200": jsonResponse("Updated typed world relation", schemaRef("WorldRelation")) },
  },
  "DELETE /api/v1/world-relations/{relationId}": {
    parameters: [{ name: "expectedUpdatedAt", in: "query", required: true, schema: { type: "string", format: "date-time" } }],
    responses: { "200": jsonResponse("Deleted typed world relation", schemaRef("WorldRelation")) },
  },
  "GET /api/v1/campaigns/{campaignId}/actors/{actorId}/calculation-overrides": {
    responses: { "200": jsonResponse("Active and cleared calculation override history", arrayOf(schemaRef("CalculationOverride"))) },
  },
  "POST /api/v1/campaigns/{campaignId}/actors/{actorId}/calculation-overrides": {
    requestBody: jsonRequestBody(schemaRef("CalculationOverrideCreateRequest")),
    responses: { "201": jsonResponse("Created calculation override with server-derived base value and author", schemaRef("CalculationOverride")) },
  },
  "POST /api/v1/calculation-overrides/{overrideId}/clear": {
    requestBody: jsonRequestBody(schemaRef("CalculationOverrideClearRequest")),
    responses: { "200": jsonResponse("Cleared calculation override retained as immutable history", schemaRef("CalculationOverride")) },
  },
  "POST /api/v1/campaigns/{campaignId}/content-imports/pdf/ai": {
    requestBody: binaryRequestBody(
      "application/pdf",
      "PDF file to analyze with the configured AI provider",
    ),
    responses: {
      "200": jsonResponse(
        "AI-generated PDF content import preview batch",
        schemaRef("ContentImportBatch"),
      ),
      "422": jsonResponse("AI analysis did not return importable content", {
        type: "object",
        additionalProperties: true,
      }),
    },
  },
  "GET /api/v1/content-imports/{importId}": {
    responses: {
      "200": jsonResponse(
        "Content import batch",
        schemaRef("ContentImportBatch"),
      ),
    },
  },
  "POST /api/v1/content-imports/{importId}/apply": {
    requestBody: jsonRequestBody(schemaRef("ContentImportApplyRequest")),
    responses: {
      "200": jsonResponse(
        "Applied content import batch",
        schemaRef("ContentImportBatch"),
      ),
    },
  },
  "POST /api/v1/content-imports/{importId}/rollback": {
    requestBody: jsonRequestBody(schemaRef("ContentImportRollbackRequest")),
    responses: {
      "200": jsonResponse(
        "Rolled back content import batch",
        schemaRef("ContentImportBatch"),
      ),
    },
  },
  "DELETE /api/v1/content-imports/{importId}": {
    parameters: [
      { name: "expectedUpdatedAt", in: "query", required: true, schema: dateTimeSchema },
    ],
    responses: {
      "200": jsonResponse(
        "Deleted content import batch snapshot",
        schemaRef("ContentImportBatch"),
      ),
    },
  },
};

function isMutatingMethod(method: HttpMethod): boolean {
  return method !== "GET";
}

const publicOperations = new Set([
  `GET ${routes.health}`,
  `GET ${routes.openApi}`,
  "GET /api/v1/agent/board-captures/{captureHandle}",
  `GET ${routes.bootstrap}`,
  `POST ${routes.bootstrap}`,
  `POST ${routes.register}`,
  `POST ${routes.login}`,
  `POST ${routes.passwordResetRequest}`,
  `POST ${routes.passwordResetConfirm}`,
  `GET ${routes.oidcConfig}`,
  `GET ${routes.oidcStart}`,
  `POST ${routes.oidcStart}`,
  `GET ${routes.oidcCallback}`,
]);

function operationSecurity(
  method: HttpMethod,
  path: string,
): Array<Record<string, string[]>> | undefined {
  if (publicOperations.has(`${method} ${path}`)) return [];
  if (
    method === "POST" &&
    (path === routes.mcp || path === routes.acceptInvite)
  )
    return [{}, { BearerAuth: [] }];
  return undefined;
}

const paginatedListOperations = new Set([
  `GET ${routes.chat}`,
  "GET /api/v1/campaigns/{campaignId}/rolls",
  "GET /api/v1/combats/{combatId}/audit",
]);

function isListRoute(method: HttpMethod, path: string): boolean {
  return paginatedListOperations.has(`${method} ${path}`);
}

function operationId(method: HttpMethod, path: string): string {
  const suffix = path
    .replace(/^\/api\/v1\//, "")
    .replace(/[{}]/g, "")
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
  return `${method.toLowerCase()}${suffix}`;
}

function pathParameters(path: string): OpenApiParameter[] {
  return Array.from(path.matchAll(/\{([^}]+)\}/g), (match) => match[1])
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
    }));
}

function openApiParameterKey(parameter: OpenApiParameter): string {
  const name = parameter.in === "header" ? parameter.name.toLowerCase() : parameter.name;
  return `${parameter.in}:${name}`;
}

const sharedRevisionRoutePatterns: ReadonlyArray<{ methods: ReadonlySet<HttpMethod>; pattern: RegExp }> = [
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/(?:worlds|scenes|scene-duplications|actors|items|handouts|encounters|combats(?:\/start)?)$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/scenes\/[^/]+\/(?:tokens|encounter-monster-placements)$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/campaigns\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/(?:archive|restore)$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/archive-import-operations\/[^/]+\/rollback$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/worlds\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/scenes\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/scenes\/[^/]+\/(?:undo|fog\/undo|fog\/apply-preset)$/ },
  { methods: new Set(["POST", "PATCH", "DELETE"]), pattern: /^\/api\/v1\/scenes\/[^/]+\/(?:annotations|fog|walls|lights|difficult-terrain|cover-overrides|delegations)(?:\/[^/]+)?$/ },
  { methods: new Set(["POST", "PATCH", "DELETE"]), pattern: /^\/api\/v1\/tokens\/[^/]+(?:\/target)?$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/actors\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/items\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/handouts\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/encounters\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/combats\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/combats\/[^/]+\/initiative\/roll-npcs$/ },
  { methods: new Set(["PATCH"]), pattern: /^\/api\/v1\/combats\/[^/]+\/combatants\/[^/]+$/ },
  { methods: new Set(["POST", "PATCH", "DELETE"]), pattern: /^\/api\/v1\/combats\/[^/]+\/environment-mechanics(?:\/[^/]+(?:\/trigger)?)?$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/combats\/[^/]+\/effects\/advance$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/combats\/[^/]+\/actions\/[^/]+\/reject$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/members\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/invites\/[^/]+\/revoke$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/webhooks\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/webhooks\/[^/]+\/(?:disable|test)$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/webhooks\/[^/]+\/deliveries\/[^/]+\/retry$/ },
  { methods: new Set(["POST", "DELETE"]), pattern: /^\/api\/v1\/content-imports\/[^/]+(?:\/(?:apply|rollback))?$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/plugins\/[^/]+\/install$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/systems\/[^/]+\/install$/ },
  { methods: new Set(["DELETE"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/systems\/[^/]+\/actors\/[^/]+\/conditions\/[^/]+$/ },
  { methods: new Set(["POST"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/systems\/[^/]+\/actors\/[^/]+\/attunement$/ },
  { methods: new Set(["DELETE"]), pattern: /^\/api\/v1\/campaigns\/[^/]+\/fog-presets\/[^/]+$/ },
  { methods: new Set(["PATCH"]), pattern: /^\/api\/v1\/assets\/[^/]+(?:\/lifecycle)?$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/dice-macros\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/audio\/[^/]+$/ },
  { methods: new Set(["PATCH", "DELETE"]), pattern: /^\/api\/v1\/chat\/messages\/[^/]+(?:\/moderation)?$/ },
];

function sharedRevisionRoute(method: HttpMethod, path: string): boolean {
  return sharedRevisionRoutePatterns.some((entry) => entry.methods.has(method) && entry.pattern.test(path));
}

function revisionedOperation(method: HttpMethod, path: string, operation: OpenApiOperation): OpenApiOperation {
  if (!sharedRevisionRoute(method, path)) return operation;
  if (method === "DELETE") {
    const expectedRevision: OpenApiParameter = {
      name: "expectedUpdatedAt",
      in: "query",
      required: true,
      schema: dateTimeSchema,
    };
    const parameters = operation.parameters ?? [];
    const { requestBody: _legacyDeleteBody, ...deleteOperation } = operation;
    return {
      ...deleteOperation,
      parameters: parameters.some((parameter) => openApiParameterKey(parameter) === openApiParameterKey(expectedRevision))
        ? parameters.map((parameter) => openApiParameterKey(parameter) === openApiParameterKey(expectedRevision) ? expectedRevision : parameter)
        : [...parameters, expectedRevision],
    };
  }

  const jsonBody = operation.requestBody?.content?.["application/json"] as { schema?: Record<string, unknown> } | undefined;
  const schema = jsonBody?.schema;
  const revisionedSchema = requireRevisionProperty(schema ?? {
    type: "object",
    additionalProperties: false,
    properties: {},
  });
  return {
    ...operation,
    requestBody: {
      ...(operation.requestBody ?? { required: true }),
      required: true,
      content: {
        ...(operation.requestBody?.content ?? {}),
        "application/json": { ...(jsonBody ?? {}), schema: revisionedSchema },
      },
    },
  };
}

function requireRevisionProperty(schema: Record<string, unknown>, seen = new Set<string>()): Record<string, unknown> {
  const ref = typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (ref?.startsWith("#/components/schemas/")) {
    const name = ref.slice("#/components/schemas/".length);
    if (seen.has(name)) throw new Error(`Recursive request schema cannot be revision-augmented: ${name}`);
    const component = (componentSchemas as Record<string, Record<string, unknown>>)[name];
    if (!component) throw new Error(`Missing request schema component: ${name}`);
    return requireRevisionProperty(component, new Set([...seen, name]));
  }
  const branches = ["allOf", "oneOf", "anyOf"] as const;
  for (const branch of branches) {
    if (Array.isArray(schema[branch])) {
      return {
        ...schema,
        [branch]: (schema[branch] as Record<string, unknown>[]).map((candidate) => requireRevisionProperty(candidate, new Set(seen))),
      };
    }
  }
  const required = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [];
  const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {};
  return {
    ...schema,
    type: schema.type ?? "object",
    required: Array.from(new Set([...required, "expectedUpdatedAt"])),
    properties: { ...properties, expectedUpdatedAt: dateTimeSchema },
  };
}

function buildOperation(method: HttpMethod, path: string): OpenApiOperation {
  const parameters = [...pathParameters(path)];
  if (isListRoute(method, path)) parameters.push(...paginationParameters);
  if (isMutatingMethod(method) && idempotencyPathIsEligible(path))
    parameters.push(idempotencyKeyParameter);
  const override = routeOperationOverrides[`${method} ${path}`] ?? {};
  const overrideParameterKeys = new Set(
    (override.parameters ?? []).map(openApiParameterKey),
  );
  const mergedParameters = override.parameters
    ? [
        ...parameters.filter(
          (parameter) => !overrideParameterKeys.has(openApiParameterKey(parameter)),
        ),
        ...override.parameters,
      ]
    : parameters;
  const overrideResponseStatuses = Object.keys(override.responses ?? {});
  const includeDefaultOkResponse =
    overrideResponseStatuses.length === 0 ||
    overrideResponseStatuses.includes("200");
  const security = operationSecurity(method, path);
  const sharedErrorResponse = path.startsWith("/api/v1/scim/v2/")
    ? scimCompatibleErrorResponse
    : errorResponse;

  const operation: OpenApiOperation = {
    operationId: operationId(method, path),
    summary: `${method} ${path}`,
    description: `${method} ${path}. See top-level x-otte-* policy extensions for auth, error, pagination, idempotency, rate-limit, and compatibility semantics shared by v1 routes.`,
    ...(security ? { security } : {}),
    ...(mergedParameters.length > 0 ? { parameters: mergedParameters } : {}),
    responses: {
      ...(includeDefaultOkResponse ? { "200": { description: "OK" } } : {}),
      "400": sharedErrorResponse("Bad request"),
      "401": sharedErrorResponse("Unauthenticated"),
      "403": sharedErrorResponse("Forbidden"),
      "404": sharedErrorResponse("Not found"),
      "409": sharedErrorResponse("Conflict"),
      "422": sharedErrorResponse("Domain validation failed"),
      "429": {
        ...sharedErrorResponse("Rate limit exceeded"),
        headers: {
          "Retry-After": {
            schema: {
              type: "string",
            },
          },
          "X-RateLimit-Limit": {
            schema: {
              type: "integer",
            },
          },
          "X-RateLimit-Remaining": {
            schema: {
              type: "integer",
            },
          },
          "X-RateLimit-Reset": {
            schema: {
              type: "string",
            },
          },
        },
      },
      "500": sharedErrorResponse("Unexpected server error"),
    },
  };

  return revisionedOperation(method, path, {
    ...operation,
    ...override,
    operationId: override.operationId ?? operation.operationId,
    summary: override.summary ?? operation.summary,
    description: override.description ?? operation.description,
    ...(mergedParameters.length > 0 ? { parameters: mergedParameters } : {}),
    responses: {
      ...operation.responses,
      ...(override.responses ?? {}),
    },
  });
}

function idempotencyPathIsEligible(path: string): boolean {
  if (path === "/api/v1/auth" || path.startsWith("/api/v1/auth/")) return false;
  if (
    path === "/api/v1/invites/accept" ||
    path === "/api/v1/organization/invites"
  )
    return false;
  if (
    path === "/api/v1/campaigns/{campaignId}/invites" ||
    path === "/api/v1/assets/{assetId}/delivery-url" ||
    path === "/api/v1/campaigns/{campaignId}/webhooks" ||
    path === "/api/v1/campaigns/{campaignId}/webhooks/{webhookId}/rotate-secret"
  )
    return false;
  if (path === "/api/v1/admin/users/{userId}/password-reset") return false;
  if (
    path === "/api/v1/campaigns/{campaignId}/dnd/custom-content/preview" ||
    path === "/api/v1/campaigns/{campaignId}/dnd/monster-templates/preview" ||
    path === "/api/v1/campaigns/{campaignId}/dnd/monster-variants/preview"
  ) return false;
  if (
    path === "/api/v1/admin/email-outbox/retry-all" ||
    path === "/api/v1/admin/email-outbox/{messageId}/retry"
  )
    return false;
  return true;
}

const paths = endpointSpecs.reduce<Record<string, OpenApiPathItem>>(
  (items, [method, path]) => {
    const pathItem = items[path] ?? {};
    const methodKey = method.toLowerCase() as Lowercase<HttpMethod>;
    pathItem[methodKey] = buildOperation(method, path);
    items[path] = pathItem;
    return items;
  },
  {},
);

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OpenTabletop Engine API",
    version: "0.3.0",
    description:
      "Public v1 REST contract seed for the OpenTabletop Engine runtime. This document defines the shared compatibility, auth, error, idempotency, pagination, and rate-limit policy while route-specific request and response schemas continue to be hardened toward v1.",
  },
  servers: [
    {
      url: "/",
      description: "API origin; v1 paths include the /api/v1 prefix",
    },
  ],
  security: [
    {
      BearerAuth: [],
    },
  ],
  tags: [
    {
      name: "auth",
      description:
        "Authentication, sessions, first-run owner bootstrap, and enterprise auth setup.",
    },
    {
      name: "campaigns",
      description:
        "Campaign, scene, asset, actor, journal, chat, dice, combat, import, and export APIs.",
    },
    {
      name: "runtime",
      description: "AI, plugin, and rules-system runtime APIs.",
    },
    {
      name: "admin",
      description: "Server-admin operational posture and recovery APIs.",
    },
  ],
  paths,
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: apiContractPolicy.auth.bearerFormat,
      },
    },
    schemas: {
      ...componentSchemas,
    },
  },
  "x-otte-version-policy": apiContractPolicy.versioning,
  "x-otte-auth-policy": apiContractPolicy.auth,
  "x-otte-error-policy": apiContractPolicy.errors,
  "x-otte-idempotency-policy": apiContractPolicy.idempotency,
  "x-otte-pagination-policy": apiContractPolicy.pagination,
  "x-otte-rate-limit-policy": apiContractPolicy.rateLimits,
} as const;
