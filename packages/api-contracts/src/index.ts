export const apiVersion = "v1";

export const routes = {
  health: "/api/v1/health",
  bootstrap: "/api/v1/auth/bootstrap",
  session: "/api/v1/auth/session",
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
  authSession: (sessionId: string) => `/api/v1/auth/sessions/${sessionId}`,
  oidcConfig: "/api/v1/auth/oidc/config",
  oidcStart: "/api/v1/auth/oidc/start",
  oidcCallback: "/api/v1/auth/oidc/callback",
  organizations: "/api/v1/organizations",
  organizationSession: "/api/v1/organization/session",
  organizationWorkspaceDefaults: "/api/v1/organization/workspace-defaults",
  organizationMembers: "/api/v1/organization/members",
  organizationMember: (memberId: string) => `/api/v1/organization/members/${memberId}`,
  organizationInvites: "/api/v1/organization/invites",
  adminUsers: "/api/v1/admin/users",
  adminUser: (userId: string) => `/api/v1/admin/users/${userId}`,
  adminUserPasswordReset: (userId: string) => `/api/v1/admin/users/${userId}/password-reset`,
  adminUserSessions: (userId: string) => `/api/v1/admin/users/${userId}/sessions`,
  adminSessions: "/api/v1/admin/sessions",
  adminSession: (sessionId: string) => `/api/v1/admin/sessions/${sessionId}`,
  adminEmailOutbox: "/api/v1/admin/email-outbox",
  adminPluginReviews: "/api/v1/admin/plugins/reviews",
  adminPluginReview: (reviewKey: string) => `/api/v1/admin/plugins/reviews/${reviewKey}`,
  adminScimGroupRoleMappings: "/api/v1/admin/scim/group-role-mappings",
  adminScimGroupRoleMapping: (mappingId: string) => `/api/v1/admin/scim/group-role-mappings/${mappingId}`,
  scimServiceProviderConfig: "/api/v1/scim/v2/ServiceProviderConfig",
  scimUsers: "/api/v1/scim/v2/Users",
  scimUser: (userId: string) => `/api/v1/scim/v2/Users/${userId}`,
  scimGroups: "/api/v1/scim/v2/Groups",
  scimGroup: (groupId: string) => `/api/v1/scim/v2/Groups/${groupId}`,
  adminAssetStorage: "/api/v1/admin/assets/storage",
  adminAssetMigration: "/api/v1/admin/assets/migrate",
  adminAssetCleanup: "/api/v1/admin/assets/cleanup",
  adminStorageOperations: "/api/v1/admin/storage/operations",
  adminStorageBackup: "/api/v1/admin/storage/backup",
  adminStorageRestoreDrill: "/api/v1/admin/storage/restore-drill",
  adminStorageRestore: "/api/v1/admin/storage/restore",
  adminJobs: "/api/v1/admin/jobs",
  adminJobOperations: "/api/v1/admin/jobs/operations",
  adminJobMetrics: "/api/v1/admin/jobs/metrics",
  adminJobAlerts: "/api/v1/admin/jobs/alerts",
  adminJob: (jobId: string) => `/api/v1/admin/jobs/${jobId}`,
  adminJobRetry: (jobId: string) => `/api/v1/admin/jobs/${jobId}/retry`,
  adminJobCancel: (jobId: string) => `/api/v1/admin/jobs/${jobId}/cancel`,
  campaigns: "/api/v1/campaigns",
  campaign: (campaignId: string) => `/api/v1/campaigns/${campaignId}`,
  campaignMembers: (campaignId: string) => `/api/v1/campaigns/${campaignId}/members`,
  campaignArchive: (campaignId: string) => `/api/v1/campaigns/${campaignId}/archive`,
  campaignRestore: (campaignId: string) => `/api/v1/campaigns/${campaignId}/restore`,
  campaignInvites: (campaignId: string) => `/api/v1/campaigns/${campaignId}/invites`,
  acceptInvite: "/api/v1/invites/accept",
  revokeInvite: (inviteId: string) => `/api/v1/invites/${inviteId}/revoke`,
  scenes: (campaignId: string) => `/api/v1/campaigns/${campaignId}/scenes`,
  fogPresets: (campaignId: string) => `/api/v1/campaigns/${campaignId}/fog-presets`,
  fogPreset: (campaignId: string, presetId: string) => `/api/v1/campaigns/${campaignId}/fog-presets/${presetId}`,
  assets: (campaignId: string) => `/api/v1/campaigns/${campaignId}/assets`,
  assetStorage: (campaignId: string) => `/api/v1/campaigns/${campaignId}/assets/storage`,
  uploadAsset: (campaignId: string) => `/api/v1/campaigns/${campaignId}/assets/upload`,
  asset: (assetId: string) => `/api/v1/assets/${assetId}`,
  assetBlob: (assetId: string) => `/api/v1/assets/${assetId}/blob`,
  assetDeliveryUrl: (assetId: string) => `/api/v1/assets/${assetId}/delivery-url`,
  assetLifecycle: (assetId: string) => `/api/v1/assets/${assetId}/lifecycle`,
  scene: (sceneId: string) => `/api/v1/scenes/${sceneId}`,
  sceneVision: (sceneId: string) => `/api/v1/scenes/${sceneId}/vision`,
  sceneVisionSample: (sceneId: string) => `/api/v1/scenes/${sceneId}/vision/sample`,
  sceneRenderingDiagnostics: (sceneId: string) => `/api/v1/scenes/${sceneId}/rendering/diagnostics`,
  sceneFog: (sceneId: string) => `/api/v1/scenes/${sceneId}/fog`,
  sceneFogHistory: (sceneId: string) => `/api/v1/scenes/${sceneId}/fog/history`,
  sceneFogUndo: (sceneId: string) => `/api/v1/scenes/${sceneId}/fog/undo`,
  sceneFogApplyPreset: (sceneId: string) => `/api/v1/scenes/${sceneId}/fog/apply-preset`,
  sceneFogRegion: (sceneId: string, fogId: string) => `/api/v1/scenes/${sceneId}/fog/${fogId}`,
  sceneWalls: (sceneId: string) => `/api/v1/scenes/${sceneId}/walls`,
  sceneWall: (sceneId: string, wallId: string) => `/api/v1/scenes/${sceneId}/walls/${wallId}`,
  sceneLights: (sceneId: string) => `/api/v1/scenes/${sceneId}/lights`,
  sceneLight: (sceneId: string, lightId: string) => `/api/v1/scenes/${sceneId}/lights/${lightId}`,
  sceneAnnotations: (sceneId: string) => `/api/v1/scenes/${sceneId}/annotations`,
  sceneAnnotation: (sceneId: string, annotationId: string) => `/api/v1/scenes/${sceneId}/annotations/${annotationId}`,
  tokens: (sceneId: string) => `/api/v1/scenes/${sceneId}/tokens`,
  token: (tokenId: string) => `/api/v1/tokens/${tokenId}`,
  tokenTarget: (tokenId: string) => `/api/v1/tokens/${tokenId}/target`,
  actors: (campaignId: string) => `/api/v1/campaigns/${campaignId}/actors`,
  actor: (actorId: string) => `/api/v1/actors/${actorId}`,
  items: (campaignId: string) => `/api/v1/campaigns/${campaignId}/items`,
  item: (itemId: string) => `/api/v1/items/${itemId}`,
  journals: (campaignId: string) => `/api/v1/campaigns/${campaignId}/journal`,
  journal: (entryId: string) => `/api/v1/journal/${entryId}`,
  chat: "/api/v1/chat/messages",
  chatMessage: (messageId: string) => `/api/v1/chat/messages/${messageId}`,
  chatMessageModeration: (messageId: string) => `/api/v1/chat/messages/${messageId}/moderation`,
  chatExport: (campaignId: string) => `/api/v1/campaigns/${campaignId}/chat/export`,
  dice: "/api/v1/dice/roll",
  diceMacros: (campaignId: string) => `/api/v1/campaigns/${campaignId}/dice-macros`,
  diceMacro: (macroId: string) => `/api/v1/dice-macros/${macroId}`,
  encounters: (campaignId: string) => `/api/v1/campaigns/${campaignId}/encounters`,
  combats: (campaignId: string) => `/api/v1/campaigns/${campaignId}/combats`,
  combat: (combatId: string) => `/api/v1/combats/${combatId}`,
  combatant: (combatId: string, combatantId: string) => `/api/v1/combats/${combatId}/combatants/${combatantId}`,
  combatAudit: (combatId: string) => `/api/v1/combats/${combatId}/audit`,
  combatActionConfirm: (combatId: string, actionId: string) => `/api/v1/combats/${combatId}/actions/${actionId}/confirm`,
  combatActionReject: (combatId: string, actionId: string) => `/api/v1/combats/${combatId}/actions/${actionId}/reject`,
  proposals: (campaignId: string) => `/api/v1/campaigns/${campaignId}/proposals`,
  proposal: (proposalId: string) => `/api/v1/proposals/${proposalId}`,
  proposalApprove: (proposalId: string) => `/api/v1/proposals/${proposalId}/approve`,
  proposalReject: (proposalId: string) => `/api/v1/proposals/${proposalId}/reject`,
  proposalApply: (proposalId: string) => `/api/v1/proposals/${proposalId}/apply`,
  aiThreads: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/threads`,
  aiUsage: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/usage`,
  aiEvaluations: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/evaluations`,
  aiMemory: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/memory`,
  aiMemoryExtract: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/memory/extract`,
  aiMemoryFact: (factId: string) => `/api/v1/ai/memory/${factId}`,
  aiMemoryApprove: (factId: string) => `/api/v1/ai/memory/${factId}/approve`,
  aiToolCalls: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/tool-calls`,
  aiToolCallRetry: (campaignId: string, toolCallId: string) => `/api/v1/campaigns/${campaignId}/ai/tool-calls/${toolCallId}/retry`,
  aiSessionRecap: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/session-recap`,
  aiEncounterDesign: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/encounter-design`,
  aiGenerateMapAsset: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/generate-map-asset`,
  aiGenerateTokenAsset: (campaignId: string) => `/api/v1/campaigns/${campaignId}/ai/generate-token-asset`,
  systems: "/api/v1/systems",
  campaignSystems: (campaignId: string) => `/api/v1/campaigns/${campaignId}/systems`,
  campaignSystem: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}`,
  systemCharacterTemplates: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/character-templates`,
  systemCharacterOrigins: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/character-origins`,
  systemCharacters: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/characters`,
  systemMonsters: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/monsters`,
  systemCharacterImport: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/characters/import`,
  systemEncounterThreats: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/encounter-threats`,
  systemEncounterPlan: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/encounter-plan`,
  systemCompendium: (campaignId: string, systemId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/compendium`,
  systemActorCompendium: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/compendium`,
  systemActorPurchase: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/purchase`,
  systemActorConditions: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/conditions`,
  systemActorCondition: (campaignId: string, systemId: string, actorId: string, conditionId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/conditions/${conditionId}`,
  systemActorAdvancement: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/advancement`,
  systemActorAdvance: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/advance`,
  systemActorRest: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/rest`,
  systemActorSheet: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/sheet`,
  systemActorRoll: (campaignId: string, systemId: string, actorId: string) => `/api/v1/campaigns/${campaignId}/systems/${systemId}/actors/${actorId}/roll`,
  plugins: "/api/v1/plugins",
  pluginRegistrySync: "/api/v1/plugins/registry/sync",
  campaignPlugins: (campaignId: string) => `/api/v1/campaigns/${campaignId}/plugins`,
  campaignPlugin: (campaignId: string, pluginId: string) => `/api/v1/campaigns/${campaignId}/plugins/${pluginId}`,
  pluginStorage: (campaignId: string, pluginId: string) => `/api/v1/campaigns/${campaignId}/plugins/${pluginId}/storage`,
  pluginStorageEntry: (campaignId: string, pluginId: string, key: string) => `/api/v1/campaigns/${campaignId}/plugins/${pluginId}/storage/${key}`,
  pluginChatCommand: (campaignId: string, pluginId: string) => `/api/v1/campaigns/${campaignId}/plugins/${pluginId}/chat-command`,
  exportCampaign: (campaignId: string) => `/api/v1/campaigns/${campaignId}/export`,
  dogfoodReportBundle: (campaignId: string) => `/api/v1/campaigns/${campaignId}/dogfood-report-bundle`,
  importCampaign: "/api/v1/import/campaign",
  campaignRolls: (campaignId: string) => `/api/v1/campaigns/${campaignId}/rolls`,
  contentImports: (campaignId: string) => `/api/v1/campaigns/${campaignId}/content-imports`,
  contentImportPreview: (campaignId: string) => `/api/v1/campaigns/${campaignId}/content-imports/preview`,
  contentImport: (importId: string) => `/api/v1/content-imports/${importId}`,
  contentImportApply: (importId: string) => `/api/v1/content-imports/${importId}/apply`,
  contentImportRollback: (importId: string) => `/api/v1/content-imports/${importId}/rollback`,
  contentImportDelete: (importId: string) => `/api/v1/content-imports/${importId}`,
  openApi: "/api/v1/openapi.json"
} as const;

export const apiContractPolicy = {
  versioning: {
    current: apiVersion,
    basePath: "/api/v1",
    compatibility: "v1 routes are additive within the major version; incompatible response or request semantics require a new /api/v{n} base path.",
    deprecation: "Deprecated v1 fields and routes must remain documented until the next major API base path is available."
  },
  auth: {
    scheme: "BearerAuth",
    header: "Authorization",
    bearerFormat: "opaque ots_ session token",
    queryTokenExceptions: ["asset blob delivery", "realtime websocket connection"]
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
      500: "unexpected server failure"
    }
  },
  idempotency: {
    header: "Idempotency-Key",
    appliesTo: ["POST", "PUT", "PATCH", "DELETE"],
    guarantee: "Mutating clients should send a stable key per logical action. The v1 runtime persists successful JSON mutation responses and replays matching method/path/user/body requests with Idempotency-Replayed: true; reusing a key for a different request returns 409."
  },
  pagination: {
    cursorParameter: "cursor",
    limitParameter: "limit",
    defaultLimit: 50,
    maxLimit: 200,
    sortingParameter: "sort",
    filteringParameter: "filter"
  },
  rateLimits: {
    statusCode: 429,
    headers: ["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    enforcement: "The API runtime enforces a fixed-window per-route caller limit when OTTE_RATE_LIMIT_ENABLED=true and enables it by default in production. OTTE_RATE_LIMIT_WINDOW_SECONDS and OTTE_RATE_LIMIT_MAX_REQUESTS tune the window and ceiling."
  }
} as const;

const endpointSpecs = [
  ["GET", routes.health],
  ["GET", routes.openApi],
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
  ["DELETE", "/api/v1/admin/users/{userId}/sessions"],
  ["GET", routes.adminSessions],
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
  ["GET", routes.adminPluginReviews],
  ["PATCH", "/api/v1/admin/plugins/reviews/{reviewKey}"],
  ["POST", "/api/v1/admin/plugins/registry/sync"],
  ["GET", "/api/v1/admin/plugins/operations"],
  ["GET", "/api/v1/admin/systems/operations"],
  ["GET", "/api/v1/admin/rendering/operations"],
  ["GET", routes.adminScimGroupRoleMappings],
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
  ["POST", routes.adminStorageBackup],
  ["POST", routes.adminStorageRestoreDrill],
  ["POST", routes.adminStorageRestore],
  ["GET", routes.campaigns],
  ["POST", routes.campaigns],
  ["GET", "/api/v1/campaigns/{campaignId}"],
  ["PATCH", "/api/v1/campaigns/{campaignId}"],
  ["DELETE", "/api/v1/campaigns/{campaignId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/members"],
  ["POST", "/api/v1/campaigns/{campaignId}/archive"],
  ["POST", "/api/v1/campaigns/{campaignId}/restore"],
  ["GET", "/api/v1/campaigns/{campaignId}/invites"],
  ["POST", "/api/v1/campaigns/{campaignId}/invites"],
  ["POST", routes.acceptInvite],
  ["POST", "/api/v1/invites/{inviteId}/revoke"],
  ["GET", "/api/v1/campaigns/{campaignId}/scenes"],
  ["POST", "/api/v1/campaigns/{campaignId}/scenes"],
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
  ["PATCH", "/api/v1/scenes/{sceneId}"],
  ["DELETE", "/api/v1/scenes/{sceneId}"],
  ["GET", "/api/v1/scenes/{sceneId}/vision"],
  ["GET", "/api/v1/scenes/{sceneId}/vision/sample"],
  ["GET", "/api/v1/scenes/{sceneId}/rendering/diagnostics"],
  ["POST", "/api/v1/scenes/{sceneId}/fog"],
  ["GET", "/api/v1/scenes/{sceneId}/fog/history"],
  ["POST", "/api/v1/scenes/{sceneId}/fog/undo"],
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
  ["POST", "/api/v1/tokens/{tokenId}/target"],
  ["PATCH", "/api/v1/tokens/{tokenId}"],
  ["DELETE", "/api/v1/tokens/{tokenId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/actors"],
  ["POST", "/api/v1/campaigns/{campaignId}/actors"],
  ["PATCH", "/api/v1/actors/{actorId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/items"],
  ["POST", "/api/v1/campaigns/{campaignId}/items"],
  ["PATCH", "/api/v1/items/{itemId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/journal"],
  ["POST", "/api/v1/campaigns/{campaignId}/journal"],
  ["PATCH", "/api/v1/journal/{entryId}"],
  ["POST", routes.dice],
  ["POST", routes.chat],
  ["GET", routes.chat],
  ["PATCH", "/api/v1/chat/messages/{messageId}/moderation"],
  ["DELETE", "/api/v1/chat/messages/{messageId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/rolls"],
  ["GET", "/api/v1/campaigns/{campaignId}/chat/export"],
  ["GET", "/api/v1/campaigns/{campaignId}/dice-macros"],
  ["POST", "/api/v1/campaigns/{campaignId}/dice-macros"],
  ["PATCH", "/api/v1/dice-macros/{macroId}"],
  ["DELETE", "/api/v1/dice-macros/{macroId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/combats"],
  ["POST", "/api/v1/campaigns/{campaignId}/combats"],
  ["GET", "/api/v1/campaigns/{campaignId}/encounters"],
  ["POST", "/api/v1/campaigns/{campaignId}/encounters"],
  ["GET", "/api/v1/combats/{combatId}/audit"],
  ["POST", "/api/v1/combats/{combatId}/actions/{actionId}/confirm"],
  ["POST", "/api/v1/combats/{combatId}/actions/{actionId}/reject"],
  ["PATCH", "/api/v1/combats/{combatId}"],
  ["PATCH", "/api/v1/combats/{combatId}/combatants/{combatantId}"],
  ["DELETE", "/api/v1/combats/{combatId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/proposals"],
  ["POST", "/api/v1/campaigns/{campaignId}/proposals"],
  ["POST", "/api/v1/proposals/{proposalId}/approve"],
  ["POST", "/api/v1/proposals/{proposalId}/reject"],
  ["POST", "/api/v1/proposals/{proposalId}/apply"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/threads"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/threads"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/usage"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/evaluations"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/evaluations"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/memory"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/memory"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/memory/extract"],
  ["GET", "/api/v1/campaigns/{campaignId}/ai/tool-calls"],
  ["POST", "/api/v1/campaigns/{campaignId}/ai/tool-calls/{toolCallId}/retry"],
  ["DELETE", "/api/v1/ai/memory/{factId}"],
  ["POST", "/api/v1/ai/memory/{factId}/approve"],
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
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/install"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/monsters"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/compendium"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions"],
  ["DELETE", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest"],
  ["GET", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet"],
  ["POST", "/api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll"],
  ["GET", "/api/v1/campaigns/{campaignId}/export"],
  ["GET", "/api/v1/campaigns/{campaignId}/dogfood-report-bundle"],
  ["POST", routes.importCampaign],
  ["GET", "/api/v1/campaigns/{campaignId}/content-imports"],
  ["POST", "/api/v1/campaigns/{campaignId}/content-imports/preview"],
  ["GET", "/api/v1/content-imports/{importId}"],
  ["POST", "/api/v1/content-imports/{importId}/apply"],
  ["POST", "/api/v1/content-imports/{importId}/rollback"],
  ["DELETE", "/api/v1/content-imports/{importId}"]
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
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses: Record<string, OpenApiResponse>;
};
type OpenApiPathItem = Partial<Record<Lowercase<HttpMethod>, OpenApiOperation>>;

const errorContent = {
  "application/json": {
    schema: {
      $ref: "#/components/schemas/ErrorResponse"
    }
  }
};

const idempotencyKeyParameter: OpenApiParameter = {
  name: apiContractPolicy.idempotency.header,
  in: "header",
  required: false,
  description: "Stable client-generated key for retrying one logical mutation without duplicating side effects once route-level replay storage is enabled.",
  schema: {
    type: "string",
    minLength: 8,
    maxLength: 128
  }
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
      maximum: apiContractPolicy.pagination.maxLimit
    }
  },
  {
    name: apiContractPolicy.pagination.cursorParameter,
    in: "query",
    required: false,
    description: "Opaque cursor returned by a previous list response.",
    schema: {
      type: "string"
    }
  },
  {
    name: apiContractPolicy.pagination.filteringParameter,
    in: "query",
    required: false,
    description: "Route-specific filter expression or search token.",
    schema: {
      type: "string"
    }
  },
  {
    name: apiContractPolicy.pagination.sortingParameter,
    in: "query",
    required: false,
    description: "Route-specific stable sort key, optionally prefixed with '-' for descending order.",
    schema: {
      type: "string"
    }
  }
];

function errorResponse(description: string): OpenApiResponse {
  return {
    description,
    content: errorContent
  };
}

const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`
});

const arrayOf = (items: Record<string, unknown>) => ({
  type: "array",
  items
});

function jsonContent(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    "application/json": {
      schema
    }
  };
}

function jsonResponse(description: string, schema: Record<string, unknown>): OpenApiResponse {
  return {
    description,
    content: jsonContent(schema)
  };
}

function textResponse(description: string): OpenApiResponse {
  return {
    description,
    content: {
      "text/plain": {
        schema: { type: "string" }
      }
    }
  };
}

function jsonRequestBody(schema: Record<string, unknown>, description?: string): OpenApiRequestBody {
  return {
    required: true,
    ...(description ? { description } : {}),
    content: jsonContent(schema)
  };
}

const stringSchema = {
  type: "string"
};

const idSchema = {
  type: "string",
  minLength: 1
};

const timestampProperties = {
  createdAt: {
    type: "string",
    format: "date-time"
  },
  updatedAt: {
    type: "string",
    format: "date-time"
  }
};

const idTimestampProperties = {
  id: idSchema,
  ...timestampProperties
};

const looseObjectSchema = {
  type: "object",
  additionalProperties: true
};

const positiveLimitSchema = {
  anyOf: [
    { type: "integer", minimum: 1, maximum: 500 },
    { type: "string", minLength: 1 }
  ]
};

const componentSchemas = {
  ErrorResponse: {
    type: "object",
    additionalProperties: true,
    required: ["error"],
    properties: {
      error: {
        type: "string",
        description: "Stable machine-readable error identifier."
      },
      message: {
        type: "string",
        description: "Human-readable error summary safe to show to an operator or caller."
      },
      code: {
        type: "string",
        description: "Optional finer-grained machine-readable code for domain failures."
      },
      details: {
        description: "Optional structured route-specific validation or conflict details."
      },
      requestId: {
        type: "string",
        description: "Optional request correlation identifier when the deployment provides one."
      }
    }
  },
  PaginationMeta: {
    type: "object",
    additionalProperties: false,
    properties: {
      nextCursor: {
        type: "string"
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: apiContractPolicy.pagination.maxLimit
      },
      totalCount: {
        type: "integer",
        minimum: 0
      }
    }
  },
  HealthStatus: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "version", "service"],
    properties: {
      ok: { type: "boolean" },
      version: stringSchema,
      service: stringSchema
    }
  },
  ServerAdminPosture: {
    type: "object",
    additionalProperties: true,
    properties: {
      configured: { type: "boolean" },
      count: { type: "integer", minimum: 0 }
    }
  },
  BootstrapStatus: {
    type: "object",
    additionalProperties: true,
    required: ["required", "userCount", "campaignCount", "serverAdmins"],
    properties: {
      required: { type: "boolean" },
      userCount: { type: "integer", minimum: 0 },
      campaignCount: { type: "integer", minimum: 0 },
      serverAdmins: schemaRef("ServerAdminPosture")
    }
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
      defaultSystemId: idSchema
    }
  },
  LoginRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: idSchema,
      email: { type: "string", format: "email" },
      password: stringSchema,
      mfaCode: stringSchema,
      recoveryCode: stringSchema
    },
    anyOf: [{ required: ["userId"] }, { required: ["email"] }]
  },
  RegisterRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email", "displayName", "password"],
    properties: {
      email: { type: "string", format: "email" },
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      password: { type: "string", minLength: 8 }
    }
  },
  PasswordResetRequest: {
    type: "object",
    additionalProperties: false,
    required: ["email"],
    properties: {
      email: { type: "string", format: "email" },
      returnTo: stringSchema
    }
  },
  PasswordResetConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["token", "password"],
    properties: {
      token: stringSchema,
      password: { type: "string", minLength: 8 }
    }
  },
  PasswordChangeRequest: {
    type: "object",
    additionalProperties: false,
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: stringSchema,
      newPassword: { type: "string", minLength: 8 }
    }
  },
  OkResponse: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" }
    }
  },
  PublicUser: {
    type: "object",
    additionalProperties: true,
    required: ["id", "displayName", "email", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      displayName: stringSchema,
      email: { type: "string", format: "email" },
      serverAdmin: { type: "boolean" },
      disabledAt: { type: "string", format: "date-time" },
      mfa: {
        $ref: "#/components/schemas/PublicMfaInfo"
      }
    }
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
      lastVerifiedAt: { type: "string", format: "date-time" }
    }
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
      lastSeenAt: { type: "string", format: "date-time" }
    }
  },
  MfaTotpEnrollRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      currentPassword: stringSchema
    }
  },
  MfaTotpEnrollResponse: {
    type: "object",
    additionalProperties: false,
    required: ["secret", "otpauthUrl", "mfa"],
    properties: {
      secret: stringSchema,
      otpauthUrl: stringSchema,
      mfa: schemaRef("PublicMfaInfo")
    }
  },
  MfaTotpConfirmRequest: {
    type: "object",
    additionalProperties: false,
    required: ["code"],
    properties: {
      code: stringSchema
    }
  },
  MfaTotpConfirmResponse: {
    type: "object",
    additionalProperties: false,
    required: ["recoveryCodes", "mfa", "user"],
    properties: {
      recoveryCodes: arrayOf(stringSchema),
      mfa: schemaRef("PublicMfaInfo"),
      user: schemaRef("PublicUser")
    }
  },
  MfaTotpDisableRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      currentPassword: stringSchema,
      mfaCode: stringSchema,
      recoveryCode: stringSchema
    }
  },
  MfaTotpDisableResponse: {
    type: "object",
    additionalProperties: false,
    required: ["mfa", "user"],
    properties: {
      mfa: schemaRef("PublicMfaInfo"),
      user: schemaRef("PublicUser")
    }
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
      redirectUri: stringSchema
    }
  },
  OidcStartRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      returnTo: stringSchema
    }
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
          redirectUri: stringSchema
        }
      }
    }
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
      email: { type: "string", format: "email" }
    }
  },
  OidcCallbackResponse: {
    allOf: [
      schemaRef("LoginResponse"),
      {
        type: "object",
        additionalProperties: true,
        properties: {
          identity: schemaRef("AuthIdentity")
        }
      }
    ]
  },
  CampaignMember: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "userId", "role", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      role: { type: "string", enum: ["owner", "gm", "assistant_gm", "player", "observer", "plugin", "ai_assistant"] },
      user: schemaRef("CampaignMemberUser"),
      permissions: arrayOf(stringSchema)
    }
  },
  CampaignMemberUser: {
    type: "object",
    additionalProperties: false,
    required: ["id", "displayName"],
    properties: {
      id: idSchema,
      displayName: stringSchema,
      email: { type: "string", format: "email" }
    }
  },
  CampaignInvite: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "role", "invitedByUserId", "expiresAt", "createdAt", "updatedAt", "status"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      email: { type: "string", format: "email" },
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      invitedByUserId: idSchema,
      acceptedByUserId: idSchema,
      acceptedAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      revokedAt: { type: "string", format: "date-time" },
      status: { type: "string", enum: ["pending", "accepted", "expired", "revoked"] }
    }
  },
  OrganizationInvite: {
    allOf: [
      schemaRef("CampaignInvite"),
      {
        type: "object",
        additionalProperties: false,
        required: ["campaign"],
        properties: {
          campaign: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name"],
            properties: {
              id: idSchema,
              name: stringSchema
            }
          }
        }
      }
    ]
  },
  CampaignInviteCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      expiresInDays: { type: "integer", minimum: 1, maximum: 30 }
    }
  },
  OrganizationInviteCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId"],
    properties: {
      campaignId: idSchema,
      email: { type: "string", format: "email" },
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      expiresInDays: { type: "integer", minimum: 1, maximum: 30 }
    }
  },
  CampaignInviteCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["invite", "token", "acceptUrl"],
    properties: {
      invite: schemaRef("CampaignInvite"),
      token: { type: "string", pattern: "^oti_" },
      acceptUrl: stringSchema
    }
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
      password: { type: "string", minLength: 8 }
    }
  },
  InviteAcceptResponse: {
    allOf: [
      schemaRef("LoginResponse"),
      {
        type: "object",
        additionalProperties: true,
        required: ["invite", "membership", "campaign"],
        properties: {
          invite: schemaRef("CampaignInvite"),
          membership: schemaRef("CampaignMember"),
          campaign: schemaRef("Campaign")
        }
      }
    ]
  },
  ScimMeta: {
    type: "object",
    additionalProperties: false,
    required: ["resourceType", "created", "lastModified", "location"],
    properties: {
      resourceType: { type: "string", enum: ["User", "Group"] },
      created: { type: "string", format: "date-time" },
      lastModified: { type: "string", format: "date-time" },
      location: stringSchema
    }
  },
  ScimEmail: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: {
      value: { type: "string", format: "email" },
      primary: { type: "boolean" },
      type: stringSchema
    }
  },
  ScimUserName: {
    type: "object",
    additionalProperties: false,
    properties: {
      formatted: stringSchema
    }
  },
  ScimUser: {
    type: "object",
    additionalProperties: true,
    required: ["schemas", "id", "userName", "displayName", "active", "emails", "meta"],
    properties: {
      schemas: arrayOf(stringSchema),
      id: idSchema,
      externalId: stringSchema,
      userName: stringSchema,
      displayName: stringSchema,
      name: schemaRef("ScimUserName"),
      active: { type: "boolean" },
      emails: arrayOf(schemaRef("ScimEmail")),
      meta: schemaRef("ScimMeta")
    }
  },
  ScimUserInput: {
    type: "object",
    additionalProperties: true,
    properties: {
      userName: stringSchema,
      externalId: stringSchema,
      displayName: stringSchema,
      name: schemaRef("ScimUserName"),
      emails: arrayOf(schemaRef("ScimEmail")),
      active: { type: "boolean" }
    }
  },
  ScimMember: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: {
      value: idSchema,
      $ref: stringSchema,
      display: stringSchema
    }
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
      meta: schemaRef("ScimMeta")
    }
  },
  ScimGroupInput: {
    type: "object",
    additionalProperties: true,
    properties: {
      displayName: stringSchema,
      externalId: stringSchema,
      members: arrayOf(schemaRef("ScimMember"))
    }
  },
  ScimPatchOperation: {
    type: "object",
    additionalProperties: true,
    required: ["op"],
    properties: {
      op: { type: "string", enum: ["add", "replace", "remove", "Add", "Replace", "Remove"] },
      path: stringSchema,
      value: {}
    }
  },
  ScimPatchRequest: {
    type: "object",
    additionalProperties: true,
    required: ["Operations"],
    properties: {
      schemas: arrayOf(stringSchema),
      Operations: arrayOf(schemaRef("ScimPatchOperation"))
    }
  },
  ScimUserListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["schemas", "totalResults", "startIndex", "itemsPerPage", "Resources"],
    properties: {
      schemas: arrayOf(stringSchema),
      totalResults: { type: "integer", minimum: 0 },
      startIndex: { type: "integer", minimum: 1 },
      itemsPerPage: { type: "integer", minimum: 0 },
      Resources: arrayOf(schemaRef("ScimUser"))
    }
  },
  ScimGroupListResponse: {
    type: "object",
    additionalProperties: false,
    required: ["schemas", "totalResults", "startIndex", "itemsPerPage", "Resources"],
    properties: {
      schemas: arrayOf(stringSchema),
      totalResults: { type: "integer", minimum: 0 },
      startIndex: { type: "integer", minimum: 1 },
      itemsPerPage: { type: "integer", minimum: 0 },
      Resources: arrayOf(schemaRef("ScimGroup"))
    }
  },
  ScimServiceProviderConfig: {
    type: "object",
    additionalProperties: true,
    required: ["schemas", "patch", "bulk", "filter", "changePassword", "sort", "etag", "authenticationSchemes"],
    properties: {
      schemas: arrayOf(stringSchema),
      patch: { type: "object", additionalProperties: false, required: ["supported"], properties: { supported: { type: "boolean" } } },
      bulk: {
        type: "object",
        additionalProperties: false,
        required: ["supported", "maxOperations", "maxPayloadSize"],
        properties: {
          supported: { type: "boolean" },
          maxOperations: { type: "integer", minimum: 0 },
          maxPayloadSize: { type: "integer", minimum: 0 }
        }
      },
      filter: {
        type: "object",
        additionalProperties: false,
        required: ["supported", "maxResults"],
        properties: {
          supported: { type: "boolean" },
          maxResults: { type: "integer", minimum: 0 }
        }
      },
      changePassword: { type: "object", additionalProperties: false, required: ["supported"], properties: { supported: { type: "boolean" } } },
      sort: { type: "object", additionalProperties: false, required: ["supported"], properties: { supported: { type: "boolean" } } },
      etag: { type: "object", additionalProperties: false, required: ["supported"], properties: { supported: { type: "boolean" } } },
      authenticationSchemes: arrayOf({
        type: "object",
        additionalProperties: true,
        required: ["type", "name"],
        properties: {
          type: stringSchema,
          name: stringSchema,
          primary: { type: "boolean" }
        }
      })
    }
  },
  ScimError: {
    type: "object",
    additionalProperties: false,
    required: ["schemas", "status", "detail"],
    properties: {
      schemas: arrayOf(stringSchema),
      status: stringSchema,
      detail: stringSchema
    }
  },
  AdminScimGroupSnapshot: {
    type: "object",
    additionalProperties: false,
    required: ["id", "displayName", "memberUserIds"],
    properties: {
      id: idSchema,
      displayName: stringSchema,
      externalId: stringSchema,
      memberUserIds: arrayOf(idSchema)
    }
  },
  AdminScimGroupRoleMapping: {
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "role", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      groupId: idSchema,
      groupExternalId: stringSchema,
      groupDisplayName: stringSchema,
      campaignId: idSchema,
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      group: schemaRef("AdminScimGroupSnapshot")
    }
  },
  AdminScimGroupRoleMappingInput: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "role"],
    properties: {
      groupId: idSchema,
      groupExternalId: stringSchema,
      groupDisplayName: stringSchema,
      campaignId: idSchema,
      role: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] }
    }
  },
  ScimGroupRoleSyncResult: {
    type: "object",
    additionalProperties: false,
    required: ["matchedGroups", "createdMemberships", "updatedMemberships", "removedMemberships", "preservedManualMemberships"],
    properties: {
      matchedGroups: { type: "integer", minimum: 0 },
      createdMemberships: { type: "integer", minimum: 0 },
      updatedMemberships: { type: "integer", minimum: 0 },
      removedMemberships: { type: "integer", minimum: 0 },
      preservedManualMemberships: { type: "integer", minimum: 0 }
    }
  },
  AdminScimGroupRoleMappingCreateResponse: {
    type: "object",
    additionalProperties: false,
    required: ["mapping", "sync"],
    properties: {
      mapping: schemaRef("AdminScimGroupRoleMapping"),
      sync: schemaRef("ScimGroupRoleSyncResult")
    }
  },
  AdminScimGroupRoleMappingDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["removedMemberships"],
    properties: {
      removedMemberships: { type: "integer", minimum: 0 }
    }
  },
  AdminUser: {
    allOf: [
      schemaRef("PublicUser"),
      {
        type: "object",
        additionalProperties: true,
        required: ["disabled", "membershipCount", "identityCount", "sessionCount"],
        properties: {
          disabled: { type: "boolean" },
          disabledReason: stringSchema,
          disabledAt: { type: "string", format: "date-time" },
          disabledByUserId: idSchema,
          passwordResetRequired: { type: "boolean" },
          membershipCount: { type: "integer", minimum: 0 },
          identityCount: { type: "integer", minimum: 0 },
          sessionCount: { type: "integer", minimum: 0 }
        }
      }
    ]
  },
  AdminUserPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      displayName: { type: "string", minLength: 1, maxLength: 80 },
      email: { anyOf: [{ type: "string", format: "email" }, { type: "null" }] },
      disabled: { type: "boolean" },
      disabledReason: stringSchema,
      passwordResetRequired: { type: "boolean" }
    }
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
      requestedByUserId: idSchema
    }
  },
  EmailOutboxMessage: {
    type: "object",
    additionalProperties: false,
    required: ["id", "to", "subject", "text", "status", "provider", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      to: { type: "string", format: "email" },
      subject: stringSchema,
      text: stringSchema,
      html: stringSchema,
      status: { type: "string", enum: ["pending", "delivered", "failed"] },
      provider: { type: "string", enum: ["outbox", "webhook"] },
      sentAt: { type: "string", format: "date-time" },
      error: stringSchema,
      metadata: { type: "object", additionalProperties: { type: "string" } }
    }
  },
  AdminUserPasswordResetRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      returnTo: stringSchema
    }
  },
  AdminUserPasswordResetResponse: {
    type: "object",
    additionalProperties: false,
    required: ["reset", "email"],
    properties: {
      reset: schemaRef("PublicPasswordResetToken"),
      email: schemaRef("EmailOutboxMessage")
    }
  },
  AdminPasswordResetPruneRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      includeExpired: { type: "boolean" },
      includeUsed: { type: "boolean" }
    }
  },
  AdminPasswordResetPruneResult: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "dryRun", "includeExpired", "includeUsed", "matched", "pruned", "expiredRemaining", "usedRemaining", "resets"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      dryRun: { type: "boolean" },
      includeExpired: { type: "boolean" },
      includeUsed: { type: "boolean" },
      matched: { type: "integer", minimum: 0 },
      pruned: { type: "integer", minimum: 0 },
      expiredRemaining: { type: "integer", minimum: 0 },
      usedRemaining: { type: "integer", minimum: 0 },
      resets: arrayOf(schemaRef("PublicPasswordResetToken"))
    }
  },
  AdminSession: {
    allOf: [
      schemaRef("UserSession"),
      {
        type: "object",
        additionalProperties: true,
        required: ["user"],
        properties: {
          user: schemaRef("PublicUser")
        }
      }
    ]
  },
  AdminSessionRevokeResponse: {
    type: "object",
    additionalProperties: false,
    required: ["revoked"],
    properties: {
      revoked: { type: "integer", minimum: 0 }
    }
  },
  AdminSessionRiskReason: {
    type: "string",
    enum: ["expired", "stale", "disabled_user", "unknown_user"]
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
              displayName: stringSchema
            }
          }
        ]
      },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
      lastSeenAgeDays: { type: "integer", minimum: 0 },
      expiresInMs: { type: "integer" }
    }
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
        required: ["totalSessionCount", "activeSessionCount", "expiredSessionCount", "staleSessionCount", "disabledUserSessionCount", "unknownUserSessionCount", "riskSessionCount"],
        properties: {
          totalSessionCount: { type: "integer", minimum: 0 },
          activeSessionCount: { type: "integer", minimum: 0 },
          expiredSessionCount: { type: "integer", minimum: 0 },
          staleSessionCount: { type: "integer", minimum: 0 },
          disabledUserSessionCount: { type: "integer", minimum: 0 },
          unknownUserSessionCount: { type: "integer", minimum: 0 },
          riskSessionCount: { type: "integer", minimum: 0 }
        }
      },
      sessions: arrayOf(schemaRef("AdminSessionRiskItem"))
    }
  },
  AdminSessionRiskRevokeRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      staleDays: { type: "integer", minimum: 1, maximum: 365 },
      dryRun: { type: "boolean" },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason"))
    }
  },
  AdminSessionRiskRevokeResult: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "staleDays", "dryRun", "reasons", "matched", "revoked", "remainingRiskSessionCount", "sessions"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      staleDays: { type: "integer", minimum: 1, maximum: 365 },
      dryRun: { type: "boolean" },
      reasons: arrayOf(schemaRef("AdminSessionRiskReason")),
      matched: { type: "integer", minimum: 0 },
      revoked: { type: "integer", minimum: 0 },
      remainingRiskSessionCount: { type: "integer", minimum: 0 },
      sessions: arrayOf(schemaRef("AdminSessionRiskItem"))
    }
  },
  AdminAuthRuntimeConfig: {
    type: "object",
    additionalProperties: true,
    required: ["nodeEnv", "legacyUserHeader", "authUrls", "sessions", "oidc", "scim", "serverAdmins"],
    properties: {
      nodeEnv: stringSchema,
      legacyUserHeader: { type: "object", additionalProperties: true },
      authUrls: { type: "object", additionalProperties: true },
      sessions: { type: "object", additionalProperties: true },
      oidc: { type: "object", additionalProperties: true },
      scim: { type: "object", additionalProperties: true },
      serverAdmins: { type: "object", additionalProperties: true }
    }
  },
  AdminAuthOperations: {
    type: "object",
    additionalProperties: true,
    required: ["generatedAt", "actionRequired", "actionReasons", "remediationQueue", "runtime", "users", "sessions", "passwordResets", "emailOutbox", "identities"],
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
          cleanupOperations: { type: "object", additionalProperties: true }
        }
      },
      passwordResets: { type: "object", additionalProperties: true },
      emailOutbox: { type: "object", additionalProperties: true },
      identities: { type: "object", additionalProperties: true }
    }
  },
  AdminAuthTestConnectionRequest: {
    type: "object",
    additionalProperties: false,
    required: ["provider"],
    properties: {
      provider: { type: "string", enum: ["oidc", "scim"] }
    }
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
          message: stringSchema
        }
      })
    }
  },
  AdminEmailOutboxRetryAllRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      status: { type: "string", enum: ["pending", "failed", "retryable"] },
      limit: { type: "integer", minimum: 1, maximum: 1000 }
    }
  },
  AdminEmailOutboxRetryAllResult: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "dryRun", "statuses", "limit", "matched", "retried", "delivered", "failed", "skipped", "messages"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      dryRun: { type: "boolean" },
      statuses: arrayOf({ type: "string", enum: ["pending", "failed"] }),
      limit: { type: "integer", minimum: 1 },
      matched: { type: "integer", minimum: 0 },
      retried: { type: "integer", minimum: 0 },
      delivered: { type: "integer", minimum: 0 },
      failed: { type: "integer", minimum: 0 },
      skipped: { type: "integer", minimum: 0 },
      messages: arrayOf(schemaRef("EmailOutboxMessage"))
    }
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
      auditLogs: arrayOf(schemaRef("AuditLog"))
    }
  },
  AdminJobProgress: {
    type: "object",
    additionalProperties: false,
    properties: {
      current: { type: "number", minimum: 0 },
      total: { type: "number", minimum: 0 },
      percent: { type: "number", minimum: 0, maximum: 100 },
      message: { type: "string", maxLength: 240 }
    }
  },
  AdminJobLogEntry: {
    type: "object",
    additionalProperties: false,
    required: ["at", "level", "message"],
    properties: {
      at: { type: "string", format: "date-time" },
      level: { type: "string", enum: ["info", "warning", "error"] },
      message: stringSchema,
      details: looseObjectSchema
    }
  },
  AdminJob: {
    type: "object",
    additionalProperties: true,
    required: ["id", "type", "status", "payload", "attempts", "maxAttempts", "queuedAt", "logs", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      type: {
        type: "string",
        enum: ["campaign.export", "campaign.import", "asset.storage.migrate", "asset.storage.cleanup", "storage.backup", "storage.restoreDrill", "ai.memory.extract", "ai.session.recap", "report.bundle"]
      },
      status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
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
      leaseExpiresAt: { type: "string", format: "date-time" },
      lastHeartbeatAt: { type: "string", format: "date-time" },
      createdByUserId: idSchema,
      updatedByUserId: idSchema,
      logs: arrayOf(schemaRef("AdminJobLogEntry"))
    }
  },
  AdminJobCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["type"],
    properties: {
      type: {
        type: "string",
        enum: ["campaign.export", "campaign.import", "asset.storage.migrate", "asset.storage.cleanup", "storage.backup", "storage.restoreDrill", "ai.memory.extract", "ai.session.recap", "report.bundle"]
      },
      payload: looseObjectSchema,
      maxAttempts: { type: "integer", minimum: 1, maximum: 10 }
    }
  },
  AdminJobLeaseRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      workerId: { type: "string", maxLength: 120 },
      leaseSeconds: { type: "integer", minimum: 1, maximum: 3600 },
      types: arrayOf({
        type: "string",
        enum: ["campaign.export", "campaign.import", "asset.storage.migrate", "asset.storage.cleanup", "storage.backup", "storage.restoreDrill", "ai.memory.extract", "ai.session.recap", "report.bundle"]
      })
    }
  },
  AdminJobPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
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
          details: looseObjectSchema
        }
      }
    }
  },
  AdminJobHeartbeatRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
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
          details: looseObjectSchema
        }
      }
    }
  },
  AdminJobCancelRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 240 }
    }
  },
  AdminJobOperationSample: {
    type: "object",
    additionalProperties: false,
    required: ["id", "type", "status", "attempts", "maxAttempts", "queuedAt", "updatedAt"],
    properties: {
      id: idSchema,
      type: {
        type: "string",
        enum: ["campaign.export", "campaign.import", "asset.storage.migrate", "asset.storage.cleanup", "storage.backup", "storage.restoreDrill", "ai.memory.extract", "ai.session.recap", "report.bundle"]
      },
      status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
      attempts: { type: "integer", minimum: 0 },
      maxAttempts: { type: "integer", minimum: 1 },
      queuedAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      leasedBy: stringSchema,
      leaseExpiresAt: { type: "string", format: "date-time" },
      lastHeartbeatAt: { type: "string", format: "date-time" },
      error: stringSchema
    }
  },
  AdminJobOperations: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "actionRequired", "actionReasons", "thresholds", "totals", "queue", "leases", "failures", "throughput", "remediationQueue"],
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
          staleQueuedSeconds: { type: "integer", minimum: 1 }
        }
      },
      totals: {
        type: "object",
        additionalProperties: false,
        required: ["totalCount", "byStatus", "byType", "retryableCount", "exhaustedCount"],
        properties: {
          totalCount: { type: "integer", minimum: 0 },
          byStatus: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          byType: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
          retryableCount: { type: "integer", minimum: 0 },
          exhaustedCount: { type: "integer", minimum: 0 }
        }
      },
      queue: {
        type: "object",
        additionalProperties: false,
        required: ["maxQueueAgeSeconds", "staleQueuedCount", "recentQueued"],
        properties: {
          oldestQueuedAt: { type: "string", format: "date-time" },
          maxQueueAgeSeconds: { type: "integer", minimum: 0 },
          staleQueuedCount: { type: "integer", minimum: 0 },
          recentQueued: arrayOf(schemaRef("AdminJobOperationSample"))
        }
      },
      leases: {
        type: "object",
        additionalProperties: false,
        required: ["runningCount", "leasedWorkerCount", "expiredCount", "staleHeartbeatCount", "workers", "expired", "staleHeartbeats"],
        properties: {
          runningCount: { type: "integer", minimum: 0 },
          leasedWorkerCount: { type: "integer", minimum: 0 },
          expiredCount: { type: "integer", minimum: 0 },
          staleHeartbeatCount: { type: "integer", minimum: 0 },
          workers: arrayOf({
            type: "object",
            additionalProperties: false,
            required: ["workerId", "runningCount", "expiredLeaseCount", "staleHeartbeatCount"],
            properties: {
              workerId: stringSchema,
              runningCount: { type: "integer", minimum: 0 },
              lastHeartbeatAt: { type: "string", format: "date-time" },
              expiredLeaseCount: { type: "integer", minimum: 0 },
              staleHeartbeatCount: { type: "integer", minimum: 0 }
            }
          }),
          expired: arrayOf(schemaRef("AdminJobOperationSample")),
          staleHeartbeats: arrayOf(schemaRef("AdminJobOperationSample"))
        }
      },
      failures: {
        type: "object",
        additionalProperties: false,
        required: ["failedCount", "retryableCount", "exhaustedCount", "recentFailed"],
        properties: {
          failedCount: { type: "integer", minimum: 0 },
          retryableCount: { type: "integer", minimum: 0 },
          exhaustedCount: { type: "integer", minimum: 0 },
          recentFailed: arrayOf(schemaRef("AdminJobOperationSample"))
        }
      },
      throughput: {
        type: "object",
        additionalProperties: false,
        required: ["succeededCount", "cancelledCount"],
        properties: {
          succeededCount: { type: "integer", minimum: 0 },
          cancelledCount: { type: "integer", minimum: 0 },
          newestCompletedAt: { type: "string", format: "date-time" }
        }
      },
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation"))
    }
  },
  AdminJobAlertRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      force: { type: "boolean" },
      reason: { type: "string", maxLength: 240 }
    }
  },
  AdminJobAlertResult: {
    type: "object",
    additionalProperties: false,
    required: ["status", "configured", "actionRequired", "actionReasons", "remediationCount", "generatedAt"],
    properties: {
      status: { type: "string", enum: ["dry_run", "delivered", "skipped", "failed"] },
      configured: { type: "boolean" },
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediationCount: { type: "integer", minimum: 0 },
      generatedAt: { type: "string", format: "date-time" },
      deliveredAt: { type: "string", format: "date-time" },
      webhookStatus: { type: "integer", minimum: 100, maximum: 599 },
      reason: stringSchema,
      error: stringSchema
    }
  },
  OpenApiDocument: {
    type: "object",
    additionalProperties: true,
    required: ["openapi", "info", "paths", "components"],
    properties: {
      openapi: stringSchema,
      info: looseObjectSchema,
      paths: looseObjectSchema,
      components: looseObjectSchema
    }
  },
  AdminOperationRemediation: {
    type: "object",
    additionalProperties: true,
    required: ["code", "severity", "action"],
    properties: {
      code: stringSchema,
      severity: { type: "string", enum: ["warning", "error"] },
      action: stringSchema,
      affectedCount: { type: "integer", minimum: 0 },
      samples: arrayOf(looseObjectSchema)
    }
  },
  AdminAiOperations: {
    type: "object",
    additionalProperties: true,
    required: ["provider", "actionRequired", "actionReasons", "runtime", "totals", "risk", "campaigns"],
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
      recentToolCalls: arrayOf(looseObjectSchema)
    }
  },
  AdminAiStaleProposalRejectRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 },
      includeApproved: { type: "boolean" }
    }
  },
  AdminAiStaleProposalRejectResult: {
    type: "object",
    additionalProperties: true,
    required: ["dryRun", "includeApproved", "limit", "reason", "staleReviewThresholdMs", "matched", "updated", "proposals"],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      includeApproved: { type: "boolean" },
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleReviewThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      proposals: arrayOf(looseObjectSchema)
    }
  },
  AdminAiStaleThreadFailRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 }
    }
  },
  AdminAiStaleThreadFailResult: {
    type: "object",
    additionalProperties: true,
    required: ["dryRun", "limit", "reason", "staleRunningThresholdMs", "matched", "updated", "threads"],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleRunningThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      threads: arrayOf(looseObjectSchema)
    }
  },
  AdminAiStaleToolCallFailRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      limit: positiveLimitSchema,
      reason: { type: "string", maxLength: 240 }
    }
  },
  AdminAiStaleToolCallFailResult: {
    type: "object",
    additionalProperties: true,
    required: ["dryRun", "limit", "reason", "staleStartedToolCallThresholdMs", "matched", "updated", "toolCalls"],
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      limit: { type: "integer", minimum: 1 },
      reason: stringSchema,
      staleStartedToolCallThresholdMs: { type: "integer", minimum: 0 },
      matched: { type: "integer", minimum: 0 },
      updated: { type: "integer", minimum: 0 },
      toolCalls: arrayOf(looseObjectSchema)
    }
  },
  AdminAiToolCallRetryRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      threadId: idSchema,
      toolCallId: idSchema,
      limit: positiveLimitSchema
    }
  },
  AdminAiToolCallRetryResult: {
    type: "object",
    additionalProperties: true,
    required: ["dryRun", "limit", "matched", "retried", "skipped", "completed", "failed", "toolCalls"],
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
      toolCalls: arrayOf(looseObjectSchema)
    }
  },
  AdminAiEvaluationExport: {
    type: "object",
    additionalProperties: true,
    required: ["exportedAt", "format", "filters", "evaluations"],
    properties: {
      exportedAt: { type: "string", format: "date-time" },
      format: { type: "string", enum: ["json", "ndjson"] },
      filters: looseObjectSchema,
      evaluations: arrayOf(looseObjectSchema)
    }
  },
  AdminPluginReviewInfo: {
    type: "object",
    additionalProperties: true,
    required: ["review", "plugin", "source", "distribution", "trust", "installable"],
    properties: {
      review: {
        type: "object",
        additionalProperties: true,
        required: ["id", "reviewKey", "pluginId", "packageId", "version", "checksum", "sourceType", "status", "createdAt", "updatedAt"],
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
          reviewedAt: { type: "string", format: "date-time" }
        }
      },
      plugin: looseObjectSchema,
      source: looseObjectSchema,
      distribution: looseObjectSchema,
      trust: looseObjectSchema,
      installable: { type: "boolean" },
      installBlock: stringSchema
    }
  },
  AdminPluginReviewSnapshot: {
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "policy", "totals", "plugins"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      policy: looseObjectSchema,
      totals: looseObjectSchema,
      plugins: arrayOf(schemaRef("AdminPluginReviewInfo"))
    }
  },
  AdminPluginReviewPatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["pending", "approved", "rejected"] },
      notes: { type: "string", maxLength: 500 }
    }
  },
  AdminPluginRegistrySyncRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      registryUrl: stringSchema
    }
  },
  AdminPluginRegistrySyncResponse: {
    type: "object",
    additionalProperties: true,
    required: ["syncedAt", "registries", "plugins"],
    properties: {
      syncedAt: { type: "string", format: "date-time" },
      registries: arrayOf(looseObjectSchema),
      plugins: arrayOf(schemaRef("PluginRuntimeInfo"))
    }
  },
  AdminPluginOperations: {
    type: "object",
    additionalProperties: true,
    required: ["generatedAt", "actionRequired", "actionReasons", "policy", "totals", "reviews", "remediationQueue"],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
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
      recentCommands: arrayOf(looseObjectSchema)
    }
  },
  AdminSystemOperations: {
    type: "object",
    additionalProperties: true,
    required: ["generatedAt", "actionRequired", "actionReasons", "totals", "systems"],
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
      productionGapCounts: looseObjectSchema,
      promotionBlockers: arrayOf(looseObjectSchema),
      remediationQueue: arrayOf(schemaRef("AdminOperationRemediation")),
      systems: arrayOf(looseObjectSchema)
    }
  },
  AdminRenderingOperations: {
    type: "object",
    additionalProperties: true,
    required: ["generatedAt", "budget", "featureCoverage", "authoringOperations", "totals", "actionRequired", "actionReasons", "scenes"],
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
      scenes: arrayOf(looseObjectSchema)
    }
  },
  AdminAssetStorageInfo: {
    type: "object",
    additionalProperties: true,
    required: ["assetCount", "activeAssetCount", "usedBytes", "allBytes", "runtime", "operations", "campaigns"],
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
      campaigns: arrayOf(looseObjectSchema)
    }
  },
  AdminAssetOperationRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" },
      campaignId: idSchema,
      assetIds: arrayOf(idSchema),
      includeDeleted: { type: "boolean" },
      includeExpired: { type: "boolean" },
      overwrite: { type: "boolean" },
      graceDays: { type: "integer", minimum: 0, maximum: 365 },
      reason: { type: "string", maxLength: 160 }
    }
  },
  AdminAssetOperationResult: {
    type: "object",
    additionalProperties: true,
    required: ["dryRun", "assetCount", "changed", "results"],
    properties: {
      dryRun: { type: "boolean" },
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
      results: arrayOf(looseObjectSchema)
    }
  },
  AdminAssetIntegrityReport: {
    type: "object",
    additionalProperties: true,
    required: ["provider", "assetCount", "verified", "missing", "mismatched", "cleanupEligible", "skipped", "failed", "actionRequired", "actionReasons", "remediationQueue", "healthy", "results"],
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
      results: arrayOf(looseObjectSchema)
    }
  },
  AdminAssetCdnPurgeRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 160 }
    }
  },
  AdminAssetCdnPurgeResult: {
    type: "object",
    additionalProperties: true,
    required: ["assetId", "campaignId", "name", "status"],
    properties: {
      assetId: idSchema,
      campaignId: idSchema,
      name: stringSchema,
      cdnUrl: stringSchema,
      reason: stringSchema,
      status: { type: "string", enum: ["purged", "failed", "not_configured"] },
      purgedAt: { type: "string", format: "date-time" },
      error: stringSchema
    }
  },
  StorageRecordCollectionCount: {
    type: "object",
    additionalProperties: false,
    required: ["collection", "count"],
    properties: {
      collection: stringSchema,
      count: { type: "integer", minimum: 0 }
    }
  },
  StorageBackupSummary: {
    type: "object",
    additionalProperties: false,
    required: ["fileName", "sizeBytes", "createdAt"],
    properties: {
      fileName: stringSchema,
      sizeBytes: { type: "integer", minimum: 0 },
      createdAt: { type: "string", format: "date-time" }
    }
  },
  StorageBackupRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", maxLength: 160 }
    }
  },
  StorageBackupResult: {
    allOf: [
      schemaRef("StorageBackupSummary"),
      {
        type: "object",
        additionalProperties: false,
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["created"] },
          reason: { type: "string", maxLength: 160 }
        }
      }
    ]
  },
  StorageIntegrityCheck: {
    type: "object",
    additionalProperties: false,
    required: ["checkedAt", "ok", "result"],
    properties: {
      checkedAt: { type: "string", format: "date-time" },
      ok: { type: "boolean" },
      result: stringSchema
    }
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
          error: stringSchema
        }
      }
    }
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
          jsonRecordModel: { type: "boolean" }
        }
      },
      migrations: {
        type: "object",
        additionalProperties: false,
        required: ["expectedVersions", "applied", "latestAppliedVersion", "missingVersions"],
        properties: {
          expectedVersions: arrayOf({ type: "integer", minimum: 0 }),
          applied: arrayOf({
            type: "object",
            additionalProperties: false,
            required: ["version", "name", "appliedAt"],
            properties: {
              version: { type: "integer", minimum: 0 },
              name: stringSchema,
              appliedAt: { type: "string", format: "date-time" }
            }
          }),
          latestAppliedVersion: { type: "integer", minimum: 0 },
          missingVersions: arrayOf({ type: "integer", minimum: 0 })
        }
      },
      integrity: schemaRef("StorageIntegrityCheck"),
      records: {
        type: "object",
        additionalProperties: false,
        required: ["total", "collections"],
        properties: {
          total: { type: "integer", minimum: 0 },
          collections: arrayOf(schemaRef("StorageRecordCollectionCount"))
        }
      },
      indexes: {
        type: "object",
        additionalProperties: false,
        required: ["required", "present", "missing"],
        properties: {
          required: arrayOf(stringSchema),
          present: arrayOf(stringSchema),
          missing: arrayOf(stringSchema)
        }
      },
      backups: {
        type: "object",
        additionalProperties: false,
        required: ["directoryName"],
        properties: {
          directoryName: stringSchema,
          latest: schemaRef("StorageBackupSummary")
        }
      },
      scheduledBackups: schemaRef("StorageScheduledBackupStatus"),
      actionRequired: { type: "boolean" },
      actionReasons: arrayOf(stringSchema),
      remediation: stringSchema
    }
  },
  StorageRestoreDrillRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      backupFileName: stringSchema
    }
  },
  StorageRestoreDrillResult: {
    type: "object",
    additionalProperties: false,
    required: ["status", "checkedAt"],
    properties: {
      status: { type: "string", enum: ["passed", "failed"] },
      backup: schemaRef("StorageBackupSummary"),
      checkedAt: { type: "string", format: "date-time" },
      integrity: schemaRef("StorageIntegrityCheck"),
      campaignCount: { type: "integer", minimum: 0 },
      recordCount: { type: "integer", minimum: 0 },
      collections: arrayOf(schemaRef("StorageRecordCollectionCount")),
      error: stringSchema
    }
  },
  StorageRestoreRequest: {
    type: "object",
    additionalProperties: false,
    required: ["backupFileName", "confirmFileName"],
    properties: {
      backupFileName: stringSchema,
      confirmFileName: stringSchema,
      reason: { type: "string", maxLength: 160 }
    }
  },
  StorageRestoreResult: {
    allOf: [
      schemaRef("StorageRestoreDrillResult"),
      {
        type: "object",
        additionalProperties: false,
        properties: {
          restoredAt: { type: "string", format: "date-time" },
          reason: { type: "string", maxLength: 160 }
        }
      }
    ]
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
      scene: schemaRef("Scene")
    }
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
      organizations: arrayOf(schemaRef("OrganizationWorkspaceInfo"))
    }
  },
  OrganizationWorkspace: {
    type: "object",
    additionalProperties: false,
    required: [
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
      "updatedAt"
    ],
    properties: {
      ...idTimestampProperties,
      name: stringSchema,
      ownerUserId: idSchema,
      defaultSystemId: idSchema,
      defaultCampaignVisibility: { type: "string", enum: ["private", "invite_only", "public"] },
      defaultPermissionTemplate: { type: "string", enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"] },
      defaultInviteRole: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      defaultSceneName: stringSchema,
      defaultSceneFolder: stringSchema,
      defaultSceneWidth: { type: "integer", minimum: 1 },
      defaultSceneHeight: { type: "integer", minimum: 1 },
      defaultSceneGridSize: { type: "integer", minimum: 1 },
      onboardingTitle: stringSchema,
      onboardingBody: stringSchema
    }
  },
  OrganizationWorkspaceInfo: {
    allOf: [
      schemaRef("OrganizationWorkspace"),
      {
        type: "object",
        additionalProperties: false,
        required: ["role", "memberCount", "campaignCount"],
        properties: {
          role: { type: "string", enum: ["owner", "admin", "member"] },
          memberCount: { type: "integer", minimum: 0 },
          campaignCount: { type: "integer", minimum: 0 }
        }
      }
    ]
  },
  OrganizationSwitchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["organizationId"],
    properties: {
      organizationId: idSchema
    }
  },
  OrganizationCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: stringSchema,
      defaultSystemId: idSchema,
      defaultCampaignVisibility: { type: "string", enum: ["private", "invite_only", "public"] },
      defaultPermissionTemplate: { type: "string", enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"] },
      defaultInviteRole: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      defaultSceneName: stringSchema,
      defaultSceneFolder: stringSchema,
      defaultSceneWidth: { type: "integer", minimum: 1 },
      defaultSceneHeight: { type: "integer", minimum: 1 },
      defaultSceneGridSize: { type: "integer", minimum: 1 },
      onboardingTitle: stringSchema,
      onboardingBody: stringSchema
    }
  },
  OrganizationSwitchResponse: {
    type: "object",
    additionalProperties: false,
    required: ["organization", "session", "organizations"],
    properties: {
      organization: schemaRef("OrganizationWorkspace"),
      session: schemaRef("UserSession"),
      organizations: arrayOf(schemaRef("OrganizationWorkspaceInfo"))
    }
  },
  OrganizationWorkspaceDefaultsPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      defaultSystemId: idSchema,
      defaultCampaignVisibility: { type: "string", enum: ["private", "invite_only", "public"] },
      defaultPermissionTemplate: { type: "string", enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"] },
      defaultInviteRole: { type: "string", enum: ["gm", "assistant_gm", "player", "observer"] },
      defaultSceneName: stringSchema,
      defaultSceneFolder: stringSchema,
      defaultSceneWidth: { type: "integer", minimum: 1 },
      defaultSceneHeight: { type: "integer", minimum: 1 },
      defaultSceneGridSize: { type: "integer", minimum: 1 },
      onboardingTitle: stringSchema,
      onboardingBody: stringSchema
    }
  },
  OrganizationMember: {
    type: "object",
    additionalProperties: false,
    required: ["id", "organizationId", "userId", "role", "user", "createdAt", "updatedAt"],
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
          email: stringSchema
        }
      }
    }
  },
  OrganizationMemberCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: idSchema,
      email: stringSchema,
      role: { type: "string", enum: ["admin", "member"] }
    }
  },
  OrganizationMemberUpdateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["role"],
    properties: {
      role: { type: "string", enum: ["admin", "member"] }
    }
  },
  OrganizationMemberDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["removed", "memberId", "userId", "removedCampaignMemberships"],
    properties: {
      removed: { type: "boolean" },
      memberId: idSchema,
      userId: idSchema,
      removedCampaignMemberships: { type: "integer", minimum: 0 }
    }
  },
  Campaign: {
    type: "object",
    additionalProperties: true,
    required: ["id", "ownerUserId", "name", "description", "defaultSystemId", "visibility", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      organizationId: idSchema,
      ownerUserId: idSchema,
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: { type: "string", enum: ["private", "invite_only", "public"] },
      archivedAt: { type: "string", format: "date-time" },
      archivedByUserId: idSchema,
      restoredAt: { type: "string", format: "date-time" },
      restoredByUserId: idSchema
    }
  },
  CampaignCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: { type: "string", enum: ["private", "invite_only", "public"] },
      permissionTemplate: { type: "string", enum: ["standard", "player_authoring", "ai_assisted", "assistant_ops"] }
    }
  },
  CampaignPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      description: stringSchema,
      defaultSystemId: idSchema,
      visibility: { type: "string", enum: ["private", "invite_only", "public"] },
      archivedAt: { type: "string", format: "date-time" },
      archivedByUserId: idSchema,
      restoredAt: { type: "string", format: "date-time" },
      restoredByUserId: idSchema
    }
  },
  Scene: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "name", "width", "height", "gridType", "gridSize", "active", "sortOrder", "fog", "walls", "lights", "annotations", "metadata", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
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
      metadata: { type: "object", additionalProperties: true }
    }
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
      source: { type: "string", enum: ["create", "activate"] }
    }
  },
  SceneCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
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
      metadata: { type: "object", additionalProperties: true }
    }
  },
  ScenePatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      width: { type: "number", minimum: 1 },
      height: { type: "number", minimum: 1 },
      gridType: { type: "string", enum: ["square", "gridless"] },
      gridSize: { type: "number", minimum: 1 },
      backgroundAssetId: idSchema,
      folder: { anyOf: [stringSchema, { type: "null" }] },
      active: { type: "boolean" },
      sortOrder: { type: "number" },
      fog: arrayOf(schemaRef("FogRegion")),
      walls: arrayOf(schemaRef("Wall")),
      lights: arrayOf(schemaRef("LightSource")),
      annotations: arrayOf(schemaRef("SceneAnnotation")),
      metadata: { type: "object", additionalProperties: true }
    }
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
      points: arrayOf(schemaRef("VisionPoint"))
    }
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
      points: arrayOf(schemaRef("VisionPoint"))
    }
  },
  FogPreset: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "name", "regions", "metadata", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      description: stringSchema,
      sourceSceneId: idSchema,
      regions: arrayOf(schemaRef("FogPresetRegion")),
      metadata: { type: "object", additionalProperties: true }
    }
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
      points: arrayOf(schemaRef("VisionPoint"))
    }
  },
  FogPresetCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      description: stringSchema,
      sceneId: idSchema
    }
  },
  FogPresetApplyRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      presetId: idSchema,
      mode: { type: "string", enum: ["append", "replace"] }
    }
  },
  FogHistoryEntry: {
    type: "object",
    additionalProperties: true,
    required: ["id", "sceneId", "action", "fogId", "actorUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      action: { type: "string", enum: ["create", "delete", "undo"] },
      fogId: idSchema,
      actorUserId: idSchema,
      region: schemaRef("FogRegion"),
      targetHistoryId: idSchema
    }
  },
  VisionPoint: {
    type: "object",
    additionalProperties: false,
    required: ["x", "y"],
    properties: {
      x: { type: "number" },
      y: { type: "number" }
    }
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
      mode: { type: "string", enum: ["reveal", "hide"] }
    }
  },
  VisionSnapshot: {
    type: "object",
    additionalProperties: true,
    required: ["sceneId", "userId", "fogActive", "polygons"],
    properties: {
      sceneId: idSchema,
      userId: idSchema,
      fogActive: { type: "boolean" },
      polygons: arrayOf(schemaRef("VisionPolygon"))
    }
  },
  VisionPointSample: {
    type: "object",
    additionalProperties: true,
    required: ["sceneId", "userId", "point", "fogActive", "visible", "revealedBy", "hiddenBy", "illuminatedBy", "blockedBy"],
    properties: {
      sceneId: idSchema,
      userId: idSchema,
      point: schemaRef("VisionPoint"),
      fogActive: { type: "boolean" },
      visible: { type: "boolean" },
      revealedBy: arrayOf({ type: "object", additionalProperties: true }),
      hiddenBy: arrayOf({ type: "object", additionalProperties: true }),
      illuminatedBy: arrayOf({ type: "object", additionalProperties: true }),
      blockedBy: arrayOf({ type: "object", additionalProperties: true })
    }
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
      kind: { type: "string", enum: ["wall", "terrain"] }
    }
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
      kind: { type: "string", enum: ["wall", "terrain"] }
    }
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
      intensity: { type: "number", minimum: 0 }
    }
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
      intensity: { type: "number", minimum: 0 }
    }
  },
  SceneAnnotation: {
    type: "object",
    additionalProperties: true,
    required: ["id", "sceneId", "kind", "createdByUserId", "color", "points", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      createdByUserId: idSchema,
      label: stringSchema,
      layer: { type: "string", enum: ["measurement", "effects", "drawings", "notes"] },
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
      expiresAt: { type: "string", format: "date-time" }
    }
  },
  SceneAnnotationHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: ["id", "sceneId", "annotationId", "action", "kind", "actorUserId", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      sceneId: idSchema,
      annotationId: idSchema,
      action: { type: "string", enum: ["create", "update", "delete"] },
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      layer: { type: "string", enum: ["measurement", "effects", "drawings", "notes"] },
      groupId: idSchema,
      groupLabel: stringSchema,
      templateShape: { type: "string", enum: ["circle", "line", "cone"] },
      templateSaveAbility: stringSchema,
      templateSaveDc: { type: "integer", minimum: 1 },
      templateDamageFormula: stringSchema,
      templateDamageType: stringSchema,
      affectedTokenIds: arrayOf(idSchema),
      rulesSystemId: idSchema,
      actorUserId: idSchema
    }
  },
  SceneAnnotationCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["ping", "ruler", "template", "drawing"] },
      label: stringSchema,
      color: stringSchema,
      layer: { type: "string", enum: ["measurement", "effects", "drawings", "notes"] },
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
      expiresInSeconds: { type: "integer", minimum: 1 }
    }
  },
  SceneAnnotationUpdateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: stringSchema,
      color: stringSchema,
      layer: { type: "string", enum: ["measurement", "effects", "drawings", "notes"] },
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
      expiresInSeconds: { type: "integer", minimum: 1 }
    }
  },
  SceneRenderingDiagnostics: {
    type: "object",
    additionalProperties: true,
    properties: {
      sceneId: idSchema,
      sceneName: stringSchema,
      warnings: arrayOf(stringSchema),
      metrics: { type: "object", additionalProperties: true }
    }
  },
  TokenTargetRequest: {
    type: "object",
    additionalProperties: false,
    required: ["targeted"],
    properties: {
      targeted: { type: "boolean" }
    }
  },
  Token: {
    type: "object",
    additionalProperties: true,
    required: ["id", "sceneId", "name", "x", "y", "width", "height", "rotation", "hidden", "locked", "visionEnabled", "visionRadius", "disposition", "metadata", "createdAt", "updatedAt"],
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
      layer: { type: "string", enum: ["map", "player", "gm"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      visionEnabled: { type: "boolean" },
      visionRadius: { type: "number", minimum: 0 },
      brightVisionRadius: { type: "number", minimum: 0 },
      dimVisionRadius: { type: "number", minimum: 0 },
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      imageAssetId: idSchema,
      ownerUserIds: arrayOf(idSchema),
      notes: stringSchema,
      conditions: arrayOf({ type: "object", additionalProperties: true }),
      auras: arrayOf({ type: "object", additionalProperties: true }),
      targetedByUserIds: arrayOf(idSchema),
      metadata: { type: "object", additionalProperties: true }
    }
  },
  TokenCreateRequest: {
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
      layer: { type: "string", enum: ["map", "player", "gm"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      visionEnabled: { type: "boolean" },
      visionRadius: { type: "number", minimum: 0 },
      brightVisionRadius: { type: "number", minimum: 0 },
      dimVisionRadius: { type: "number", minimum: 0 },
      disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      imageAssetId: idSchema,
      ownerUserIds: arrayOf(idSchema),
      notes: stringSchema,
      conditions: arrayOf({ type: "object", additionalProperties: true }),
      auras: arrayOf({ type: "object", additionalProperties: true }),
      metadata: { type: "object", additionalProperties: true }
    }
  },
  TokenPatchRequest: {
    $ref: "#/components/schemas/TokenCreateRequest"
  },
  ChatMessage: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "userId", "type", "body", "visibility", "recipientUserIds", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      sceneId: idSchema,
      userId: idSchema,
      type: { type: "string", enum: ["plain", "emote", "whisper", "roll", "system", "gm", "ooc", "ai", "plugin"] },
      body: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      recipientUserIds: arrayOf(idSchema),
      rollId: idSchema,
      replyToMessageId: idSchema,
      moderationStatus: { type: "string", enum: ["open", "follow_up", "reviewed"] },
      moderatedByUserId: idSchema,
      moderatedAt: { type: "string", format: "date-time" }
    }
  },
  ChatMessageCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "body"],
    properties: {
      campaignId: idSchema,
      sceneId: idSchema,
      type: { type: "string", enum: ["plain", "emote", "whisper", "roll", "system", "gm", "ooc", "ai", "plugin"] },
      body: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      recipientUserIds: arrayOf(idSchema),
      rollId: idSchema,
      replyToMessageId: idSchema
    }
  },
  ChatModerationRequest: {
    type: "object",
    additionalProperties: false,
    required: ["moderationStatus"],
    properties: {
      moderationStatus: { type: "string", enum: ["open", "follow_up", "reviewed"] }
    }
  },
  DiceRoll: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "userId", "formula", "visibility", "terms", "total", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      formula: stringSchema,
      label: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      terms: arrayOf(schemaRef("DiceRollTerm")),
      total: { type: "number" }
    }
  },
  DiceRollTerm: {
    type: "object",
    additionalProperties: true,
    required: ["type"],
    properties: {
      type: { type: "string", enum: ["die", "modifier", "binding"] },
      sides: { type: "integer", minimum: 1 },
      count: { type: "integer", minimum: 1 },
      results: arrayOf({ type: "integer" }),
      kept: arrayOf({ type: "integer" }),
      exploded: arrayOf({ type: "integer" }),
      value: { type: "number" },
      path: stringSchema
    }
  },
  DiceRollRequest: {
    type: "object",
    additionalProperties: false,
    required: ["campaignId", "formula"],
    properties: {
      campaignId: idSchema,
      formula: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] },
      label: stringSchema
    }
  },
  MapAsset: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "name", "url", "mimeType", "sizeBytes", "createdAt", "updatedAt"],
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
      security: schemaRef("AssetSecurityScan")
    }
  },
  AssetStorageRef: {
    type: "object",
    additionalProperties: false,
    required: ["provider", "key"],
    properties: {
      provider: { type: "string", enum: ["local", "s3"] },
      key: stringSchema,
      bucket: stringSchema
    }
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
      cleanupReason: stringSchema
    }
  },
  AssetSecurityScan: {
    type: "object",
    additionalProperties: true,
    required: ["status", "scanner", "scannedAt", "findings"],
    properties: {
      status: { type: "string", enum: ["clean"] },
      scanner: stringSchema,
      scannedAt: { type: "string", format: "date-time" },
      findings: arrayOf({ type: "object", additionalProperties: true })
    }
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
      tags: arrayOf(stringSchema)
    }
  },
  MapAssetPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      folder: { anyOf: [stringSchema, { type: "null" }] },
      tags: { anyOf: [arrayOf(stringSchema), stringSchema] }
    }
  },
  AssetUploadResponse: {
    type: "object",
    additionalProperties: false,
    required: ["asset"],
    properties: {
      asset: schemaRef("MapAsset"),
      scene: schemaRef("Scene")
    }
  },
  AssetDeliveryUrlRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      expiresInSeconds: { type: "integer", minimum: 1 },
      disposition: { type: "string", enum: ["inline", "attachment"] }
    }
  },
  AssetDeliveryUrlResponse: {
    type: "object",
    additionalProperties: true,
    required: ["url", "expiresAt"],
    properties: {
      url: stringSchema,
      expiresAt: { type: "string", format: "date-time" },
      disposition: { type: "string", enum: ["inline", "attachment"] }
    }
  },
  AssetLifecyclePatchRequest: {
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["active", "archived", "deleted"] },
      expiresAt: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
      reason: stringSchema
    }
  },
  CampaignAssetStorageInfo: {
    type: "object",
    additionalProperties: true,
    required: ["campaignId", "assetCount", "activeAssetCount", "usedBytes", "allBytes", "lifecycleCounts", "providerCounts", "delivery", "largestAssets"],
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
        required: ["mode", "cdnConfigured", "publicUrlConfigured", "signingSecretConfigured", "signingSecretRequired", "defaultTtlSeconds", "maxTtlSeconds", "purgeWebhookConfigured", "purgeWebhookTokenConfigured", "purgeTimeoutMs", "actionRequired", "actionReasons", "warnings", "posture"],
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
          posture: looseObjectSchema
        }
      },
      largestAssets: arrayOf(looseObjectSchema)
    }
  },
  Actor: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "systemId", "type", "name", "data", "permissions", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      systemId: idSchema,
      ownerUserId: idSchema,
      type: stringSchema,
      name: stringSchema,
      imageAssetId: idSchema,
      data: { type: "object", additionalProperties: true },
      permissions: { type: "object", additionalProperties: arrayOf(stringSchema) }
    }
  },
  ActorCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      systemId: idSchema,
      ownerUserId: idSchema,
      type: stringSchema,
      name: stringSchema,
      imageAssetId: idSchema,
      data: { type: "object", additionalProperties: true },
      permissions: { type: "object", additionalProperties: arrayOf(stringSchema) }
    }
  },
  ActorPatchRequest: {
    $ref: "#/components/schemas/ActorCreateRequest"
  },
  Item: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "systemId", "type", "name", "data", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      systemId: idSchema,
      actorId: idSchema,
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true }
    }
  },
  ItemCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      systemId: idSchema,
      actorId: idSchema,
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true }
    }
  },
  ItemPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: stringSchema,
      name: stringSchema,
      data: { type: "object", additionalProperties: true }
    }
  },
  JournalEntry: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "title", "body", "visibility", "visibleToUserIds", "visibleToActorIds", "tags", "createdBy", "updatedBy", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      parentId: idSchema,
      title: stringSchema,
      body: stringSchema,
      visibility: { type: "string", enum: ["gm_only", "public", "specific_players", "specific_characters"] },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema),
      createdBy: idSchema,
      updatedBy: idSchema
    }
  },
  JournalEntryCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      parentId: idSchema,
      title: stringSchema,
      body: stringSchema,
      visibility: { type: "string", enum: ["gm_only", "public", "specific_players", "specific_characters"] },
      visibleToUserIds: arrayOf(idSchema),
      visibleToActorIds: arrayOf(idSchema),
      tags: arrayOf(stringSchema)
    }
  },
  JournalEntryPatchRequest: {
    $ref: "#/components/schemas/JournalEntryCreateRequest"
  },
  Combat: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "active", "round", "turnIndex", "combatants", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      encounterId: idSchema,
      active: { type: "boolean" },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      combatants: arrayOf(schemaRef("Combatant")),
      actions: arrayOf(schemaRef("CombatAction"))
    }
  },
  Combatant: {
    type: "object",
    additionalProperties: true,
    required: ["id", "tokenId", "name", "initiative", "defeated"],
    properties: {
      id: idSchema,
      tokenId: idSchema,
      actorId: idSchema,
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
      resourceSpent: { type: "boolean" }
    }
  },
  CombatAction: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "combatId", "actorId", "actorName", "requestedByUserId", "status", "rollId", "actionLabel", "targetActorIds", "applyEffect", "consumeResources", "rolls", "actorUpdates", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      combatId: idSchema,
      actorId: idSchema,
      actorName: stringSchema,
      requestedByUserId: idSchema,
      status: { type: "string", enum: ["pending_gm", "confirmed", "rejected", "failed"] },
      rollId: stringSchema,
      actionLabel: stringSchema,
      targetActorIds: arrayOf(idSchema),
      applyEffect: { type: "boolean" },
      consumeResources: { type: "boolean" },
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
      failureReason: stringSchema
    }
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
      targetActorId: idSchema,
      visibility: { type: "string", enum: ["public", "gm_only", "whisper"] }
    }
  },
  CombatActionActorUpdate: {
    type: "object",
    additionalProperties: false,
    required: ["actorId", "before", "after"],
    properties: {
      actorId: idSchema,
      before: { type: "object", additionalProperties: true },
      after: { type: "object", additionalProperties: true }
    }
  },
  CombatActionItemUpdate: {
    type: "object",
    additionalProperties: false,
    required: ["itemId", "before", "after"],
    properties: {
      itemId: idSchema,
      before: { type: "object", additionalProperties: true },
      after: { type: "object", additionalProperties: true }
    }
  },
  CombatActionEffect: {
    type: "object",
    additionalProperties: true,
    required: ["type", "targetActorId"],
    properties: {
      type: stringSchema,
      targetActorId: idSchema,
      amount: { type: "number" }
    }
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
      chatMessages: arrayOf(schemaRef("ChatMessage"))
    }
  },
  CombatActionRejectRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: stringSchema
    }
  },
  CombatCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      encounterId: idSchema,
      combatants: arrayOf(schemaRef("Combatant"))
    }
  },
  CombatPatchRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      active: { type: "boolean" },
      round: { type: "integer", minimum: 1 },
      turnIndex: { type: "integer", minimum: 0 },
      combatants: arrayOf(schemaRef("Combatant"))
    }
  },
  CombatantPatchRequest: {
    allOf: [
      { $ref: "#/components/schemas/Combatant" },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          syncActorSheet: { type: "boolean" }
        }
      }
    ]
  },
  AuditLog: {
    type: "object",
    additionalProperties: true,
    required: ["id", "actorType", "action", "targetType", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      actorUserId: idSchema,
      actorType: { type: "string", enum: ["user", "ai", "plugin", "system"] },
      action: stringSchema,
      targetType: stringSchema,
      targetId: idSchema,
      before: {},
      after: {}
    }
  },
  Proposal: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "createdByType", "title", "summary", "status", "changesJson", "diffJson", "approvalRequired", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      createdByUserId: idSchema,
      createdByType: { type: "string", enum: ["user", "ai", "plugin"] },
      sourceId: idSchema,
      title: stringSchema,
      summary: stringSchema,
      status: { type: "string", enum: ["draft", "pending", "approved", "rejected", "applied", "reverted"] },
      changesJson: arrayOf(schemaRef("ProposalChange")),
      diffJson: { type: "object", additionalProperties: true },
      approvalRequired: { type: "boolean" },
      approvedByUserId: idSchema,
      history: arrayOf(schemaRef("ProposalHistoryEntry"))
    }
  },
  ProposalHistoryEntry: {
    type: "object",
    additionalProperties: false,
    required: ["action", "status", "at", "actorType"],
    properties: {
      action: { type: "string", enum: ["created", "approved", "rejected", "applied"] },
      status: { type: "string", enum: ["draft", "pending", "approved", "rejected", "applied", "reverted"] },
      previousStatus: { type: "string", enum: ["draft", "pending", "approved", "rejected", "applied", "reverted"] },
      at: stringSchema,
      actorUserId: idSchema,
      actorType: { type: "string", enum: ["user", "ai", "plugin", "server_admin", "system"] },
      auditAction: stringSchema,
      note: stringSchema
    }
  },
  ProposalChange: {
    type: "object",
    additionalProperties: false,
    required: ["entity", "action", "data"],
    properties: {
      entity: { type: "string", enum: ["campaign", "scene", "token", "actor", "item", "journal", "chat", "roll", "encounter", "combat", "asset"] },
      action: { type: "string", enum: ["create", "update", "delete"] },
      id: idSchema,
      data: { type: "object", additionalProperties: true }
    }
  },
  ProposalCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      createdByType: { type: "string", enum: ["user", "ai", "plugin"] },
      sourceId: idSchema,
      title: stringSchema,
      summary: stringSchema,
      changesJson: arrayOf(schemaRef("ProposalChange")),
      diffJson: { type: "object", additionalProperties: true }
    }
  },
  Encounter: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "name", "summary", "tokenIds", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      name: stringSchema,
      summary: stringSchema,
      tokenIds: arrayOf(idSchema),
      difficulty: stringSchema
    }
  },
  EncounterCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      summary: stringSchema,
      tokenIds: arrayOf(idSchema),
      difficulty: stringSchema
    }
  },
  ChatExport: {
    type: "object",
    additionalProperties: true,
    required: ["campaignId", "exportedAt", "count", "messages"],
    properties: {
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" },
      count: { type: "integer", minimum: 0 },
      visibilityCounts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      typeCounts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      messages: arrayOf(schemaRef("ChatMessage"))
    }
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
      createdByUserId: idSchema
    }
  },
  DiceMacroRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: stringSchema,
      formula: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] }
    }
  },
  AiThread: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "userId", "provider", "title", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      userId: idSchema,
      provider: stringSchema,
      title: stringSchema,
      prompt: stringSchema,
      status: { type: "string", enum: ["running", "completed", "failed"] },
      assistantMessage: stringSchema,
      providerError: stringSchema,
      usage: schemaRef("AiUsageMetrics"),
      advertisedTools: arrayOf({ type: "object", additionalProperties: true })
    }
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
      estimatedCostUsd: { type: "number", minimum: 0 }
    }
  },
  AiEvaluationRun: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "threadId", "status", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      threadId: idSchema,
      requestedByUserId: idSchema,
      status: stringSchema,
      score: { type: "number" },
      checks: arrayOf({ type: "object", additionalProperties: true })
    }
  },
  AiEvaluationInput: {
    type: "object",
    additionalProperties: true,
    required: ["threadId"],
    properties: {
      threadId: idSchema,
      notes: stringSchema,
      expectedOutcome: stringSchema
    }
  },
  AiEvaluationSnapshot: {
    type: "object",
    additionalProperties: true,
    properties: {
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" },
      evaluations: arrayOf(schemaRef("AiEvaluationRun"))
    }
  },
  AiThreadCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["prompt"],
    properties: {
      prompt: stringSchema
    }
  },
  AiToolCallRetryRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      dryRun: { type: "boolean" }
    }
  },
  AiProviderEvent: {
    type: "object",
    additionalProperties: true,
    required: ["type"],
    properties: {
      type: stringSchema
    }
  },
  AiThreadResponse: {
    type: "object",
    additionalProperties: true,
    required: ["thread", "assistantMessage", "events"],
    properties: {
      thread: schemaRef("AiThread"),
      assistantMessage: stringSchema,
      events: arrayOf(schemaRef("AiProviderEvent"))
    }
  },
  AiMemoryFact: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "text", "visibility", "sourceIds", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      text: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
      sourceIds: arrayOf(idSchema),
      approvedByUserId: idSchema
    }
  },
  AiMemoryCreateRequest: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: {
      text: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] },
      sourceIds: arrayOf(idSchema),
      approvedByUserId: idSchema
    }
  },
  AiMemoryExtractRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      sourceText: stringSchema,
      visibility: { type: "string", enum: ["public", "gm_only"] }
    }
  },
  AiMemoryExtractResponse: {
    type: "object",
    additionalProperties: true,
    required: ["thread", "memory", "providerOutput", "events"],
    properties: {
      thread: schemaRef("AiThread"),
      memory: schemaRef("AiMemoryFact"),
      providerOutput: stringSchema,
      events: arrayOf(schemaRef("AiProviderEvent"))
    }
  },
  AiToolCall: {
    type: "object",
    additionalProperties: true,
    required: ["id", "threadId", "toolName", "status", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      threadId: idSchema,
      toolName: stringSchema,
      status: { type: "string", enum: ["started", "completed", "failed"] },
      input: {},
      output: {},
      durationMs: { type: "number", minimum: 0 }
    }
  },
  AiSessionRecapRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      transcript: stringSchema
    }
  },
  AiSessionRecapResponse: {
    type: "object",
    additionalProperties: true,
    required: ["proposal", "memory"],
    properties: {
      proposal: schemaRef("Proposal"),
      memory: schemaRef("AiMemoryFact")
    }
  },
  AiEncounterDesignRequest: {
    type: "object",
    additionalProperties: false,
    required: ["prompt"],
    properties: {
      prompt: stringSchema,
      difficulty: stringSchema
    }
  },
  AiEncounterDesignResponse: {
    type: "object",
    additionalProperties: true,
    required: ["proposal", "encounter"],
    properties: {
      proposal: schemaRef("Proposal"),
      encounter: schemaRef("Encounter")
    }
  },
  PluginRuntimeInfo: {
    type: "object",
    additionalProperties: true,
    required: ["id", "name", "version"],
    properties: {
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      permissions: arrayOf(stringSchema),
      trust: { type: "object", additionalProperties: true },
      source: { type: "object", additionalProperties: true }
    }
  },
  PluginCampaignInfo: {
    allOf: [
      schemaRef("PluginRuntimeInfo"),
      {
        type: "object",
        additionalProperties: true,
        properties: {
          installed: { type: "boolean" },
          grantedPermissions: arrayOf(stringSchema),
          missingPermissions: arrayOf(stringSchema),
          audit: {
            type: "object",
            additionalProperties: false,
            required: ["installCount", "versions"],
            properties: {
              installCount: { type: "integer", minimum: 0 },
              lastInstallAt: { type: "string", format: "date-time" },
              lastActorUserId: stringSchema,
              versions: arrayOf(stringSchema)
            }
          }
        }
      }
    ]
  },
  PluginInstallRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      permissions: arrayOf(stringSchema),
      version: stringSchema
    }
  },
  PermissionGrant: {
    type: "object",
    additionalProperties: true,
    required: ["id", "subjectType", "subjectId", "campaignId", "permissions", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      subjectType: stringSchema,
      subjectId: idSchema,
      campaignId: idSchema,
      permissions: arrayOf(stringSchema),
      metadata: { type: "object", additionalProperties: true }
    }
  },
  PluginInstallResponse: {
    type: "object",
    additionalProperties: true,
    required: ["plugin", "grant", "permissionReview"],
    properties: {
      plugin: schemaRef("PluginCampaignInfo"),
      grant: schemaRef("PermissionGrant"),
      permissionReview: { type: "object", additionalProperties: true }
    }
  },
  PluginStorageEntry: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "pluginId", "key", "value", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      pluginId: idSchema,
      key: stringSchema,
      value: {},
      updatedByType: stringSchema,
      updatedById: idSchema
    }
  },
  PluginStorageSetRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      value: {}
    }
  },
  PluginStorageDeleteResponse: {
    type: "object",
    additionalProperties: false,
    required: ["deleted", "key"],
    properties: {
      deleted: { type: "boolean" },
      key: stringSchema
    }
  },
  PluginChatCommandRequest: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: stringSchema,
      args: stringSchema
    }
  },
  PluginChatCommandResponse: {
    type: "object",
    additionalProperties: true,
    required: ["pluginId", "command", "chat", "storageMutation"],
    properties: {
      pluginId: idSchema,
      command: stringSchema,
      chat: schemaRef("ChatMessage"),
      storageMutation: { type: "object", additionalProperties: true }
    }
  },
  PluginPackageInstallRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      campaignId: idSchema,
      packagePath: stringSchema
    }
  },
  PluginRegistrySyncRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      campaignId: idSchema,
      registryUrl: stringSchema
    }
  },
  PluginRegistrySyncResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      registries: arrayOf({ type: "object", additionalProperties: true })
    }
  },
  SystemRuntimeInfo: {
    type: "object",
    additionalProperties: true,
    required: ["id", "name", "version"],
    properties: {
      id: idSchema,
      name: stringSchema,
      version: stringSchema,
      active: { type: "boolean" },
      manifest: { type: "object", additionalProperties: true }
    }
  },
  SystemInstallResponse: {
    type: "object",
    additionalProperties: true,
    required: ["system", "campaign"],
    properties: {
      system: schemaRef("SystemRuntimeInfo"),
      campaign: schemaRef("Campaign")
    }
  },
  SystemInstallRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      campaignId: idSchema,
      id: idSchema,
      name: stringSchema,
      version: stringSchema
    }
  },
  SystemCharacterCreateRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      templateId: idSchema,
      name: stringSchema,
      ownerUserId: idSchema
    }
  },
  SystemMonsterCreateRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      threatId: idSchema,
      name: stringSchema,
      ownerUserId: idSchema
    }
  },
  SystemCharacterImportRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      ownerUserId: idSchema
    }
  },
  SystemActorActionRequest: {
    type: "object",
    additionalProperties: true,
    properties: {
      entryId: idSchema,
      conditionId: idSchema,
      optionId: idSchema,
      quantity: { type: "number" },
      restType: { type: "string", enum: ["short", "long"] },
      rollId: idSchema,
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
      saveOutcomes: { type: "object", additionalProperties: { type: "string", enum: ["success", "failure"] } },
      reactionUse: { type: "boolean" },
      rechargeCheck: { type: "number" },
      commit: { type: "boolean" },
      preview: { type: "boolean" }
    }
  },
  SystemActorResponse: {
    type: "object",
    additionalProperties: true,
    properties: {
      actor: schemaRef("Actor"),
      item: schemaRef("Item"),
      items: arrayOf(schemaRef("Item")),
      sheet: { type: "object", additionalProperties: true }
    }
  },
  SystemRollResponse: {
    type: "object",
    additionalProperties: true,
    required: ["actor", "sheet"],
    properties: {
      roll: schemaRef("DiceRoll"),
      rolls: arrayOf(schemaRef("DiceRoll")),
      chat: schemaRef("ChatMessage"),
      chatMessages: arrayOf(schemaRef("ChatMessage")),
      actor: schemaRef("Actor"),
      updatedActors: arrayOf(schemaRef("Actor")),
      sheet: { type: "object", additionalProperties: true },
      quickRoll: { type: "object", additionalProperties: true },
      usage: { type: "object", additionalProperties: true },
      effect: { type: "object", additionalProperties: true },
      effects: arrayOf({ type: "object", additionalProperties: true }),
      resolution: { type: "object", additionalProperties: true }
    }
  },
  SystemEncounterPlanRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      partyActorIds: arrayOf(idSchema),
      threats: arrayOf({ type: "object", additionalProperties: true }),
      createEncounter: { type: "boolean" },
      name: stringSchema
    }
  },
  SystemEncounterPlanResponse: {
    type: "object",
    additionalProperties: true,
    required: ["plan"],
    properties: {
      plan: { type: "object", additionalProperties: true },
      encounter: schemaRef("Encounter")
    }
  },
  SystemCompendium: {
    type: "object",
    additionalProperties: true,
    required: ["systemId", "entries"],
    properties: {
      systemId: idSchema,
      entries: arrayOf({ type: "object", additionalProperties: true })
    }
  },
  ContentImportSource: {
    type: "object",
    additionalProperties: true,
    properties: {
      sourceType: stringSchema,
      adapterId: idSchema,
      name: stringSchema,
      license: { type: "object", additionalProperties: true }
    }
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
      data: { type: "object", additionalProperties: true }
    }
  },
  ContentImportBatch: {
    type: "object",
    additionalProperties: true,
    required: ["id", "campaignId", "status", "source", "entities", "selectedEntityIds", "appliedRecords", "createdAt", "updatedAt"],
    properties: {
      ...idTimestampProperties,
      campaignId: idSchema,
      status: { type: "string", enum: ["previewed", "applied", "rolled_back", "deleted"] },
      source: schemaRef("ContentImportSource"),
      entities: arrayOf(schemaRef("ContentImportEntity")),
      selectedEntityIds: arrayOf(idSchema),
      appliedRecords: arrayOf({ type: "object", additionalProperties: true })
    }
  },
  ContentImportPreviewRequest: {
    type: "object",
    additionalProperties: false,
    required: ["entities"],
    properties: {
      source: schemaRef("ContentImportSource"),
      entities: arrayOf(schemaRef("ContentImportEntity"))
    }
  },
  ContentImportApplyRequest: {
    type: "object",
    additionalProperties: false,
    properties: {
      selectedEntityIds: arrayOf(idSchema)
    }
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
          exportScope: { type: "string", enum: ["campaign"] },
          redactionMode: { type: "string", enum: ["portable"] },
          compatibilityNotes: arrayOf(stringSchema),
          assetCount: { type: "integer", minimum: 0 },
          assetFileCount: { type: "integer", minimum: 0 }
        }
      },
      data: { type: "object", additionalProperties: true },
      files: arrayOf({ type: "object", additionalProperties: true })
    }
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
          mode: { type: "string", enum: ["upsert", "reject_conflicts", "skip_conflicts", "dry_run"] },
          scope: { type: "string", enum: ["all", "assets_only", "selected_collections"] },
          collections: { type: "array", items: { type: "string" } }
        }
      }
    ]
  },
  CampaignImportResponse: {
    type: "object",
    additionalProperties: true,
    required: ["importedCampaignIds", "counts", "conflicts", "assetFiles"],
    properties: {
      importedCampaignIds: arrayOf(idSchema),
      counts: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
      conflicts: arrayOf({ type: "object", additionalProperties: true }),
      skippedConflicts: arrayOf({ type: "object", additionalProperties: true }),
      assetFiles: { type: "integer", minimum: 0 },
      dryRun: { type: "boolean" },
      importScope: { type: "string", enum: ["all", "assets_only", "selected_collections"] },
      importCollections: { type: "array", items: { type: "string" } },
      importWarnings: { type: "array", items: { type: "string" } }
    }
  },
  CampaignDogfoodReportBundle: {
    type: "object",
    additionalProperties: true,
    properties: {
      format: stringSchema,
      campaignId: idSchema,
      exportedAt: { type: "string", format: "date-time" }
    }
  }
} as const;

const routeOperationOverrides: Record<string, Partial<OpenApiOperation>> = {
  "GET /api/v1/openapi.json": {
    responses: {
      "200": jsonResponse("Generated OpenAPI 3.1 contract document", schemaRef("OpenApiDocument"))
    }
  },
  "GET /api/v1/health": {
    responses: {
      "200": jsonResponse("API health status", schemaRef("HealthStatus"))
    }
  },
  "GET /api/v1/auth/bootstrap": {
    responses: {
      "200": jsonResponse("First-run owner bootstrap posture", schemaRef("BootstrapStatus"))
    }
  },
  "POST /api/v1/auth/bootstrap": {
    requestBody: jsonRequestBody(schemaRef("BootstrapOwnerRequest")),
    responses: {
      "200": jsonResponse("Created first owner, starter campaign, scene, and authenticated session", schemaRef("LoginResponse"))
    }
  },
  "POST /api/v1/auth/login": {
    requestBody: jsonRequestBody(schemaRef("LoginRequest")),
    responses: {
      "200": jsonResponse("Authenticated session and user memberships", schemaRef("LoginResponse"))
    }
  },
  "POST /api/v1/auth/register": {
    requestBody: jsonRequestBody(schemaRef("RegisterRequest")),
    responses: {
      "200": jsonResponse("Registered password user and authenticated session", schemaRef("LoginResponse"))
    }
  },
  "POST /api/v1/auth/logout": {
    responses: {
      "200": jsonResponse("Revoked the current bearer session", schemaRef("OkResponse"))
    }
  },
  "POST /api/v1/auth/password-reset/request": {
    requestBody: jsonRequestBody(schemaRef("PasswordResetRequest")),
    responses: {
      "200": jsonResponse("Accepted password reset request without account enumeration", schemaRef("OkResponse"))
    }
  },
  "POST /api/v1/auth/password-reset/confirm": {
    requestBody: jsonRequestBody(schemaRef("PasswordResetConfirmRequest")),
    responses: {
      "200": jsonResponse("Confirmed password reset and created authenticated session", schemaRef("LoginResponse"))
    }
  },
  "POST /api/v1/auth/password/change": {
    requestBody: jsonRequestBody(schemaRef("PasswordChangeRequest")),
    responses: {
      "200": jsonResponse("Changed password and rotated authenticated session", schemaRef("LoginResponse"))
    }
  },
  "GET /api/v1/auth/mfa": {
    responses: {
      "200": jsonResponse("Current user MFA posture", schemaRef("PublicMfaInfo"))
    }
  },
  "POST /api/v1/auth/mfa/totp/enroll": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpEnrollRequest")),
    responses: {
      "200": jsonResponse("Created pending TOTP enrollment secret", schemaRef("MfaTotpEnrollResponse"))
    }
  },
  "POST /api/v1/auth/mfa/totp/confirm": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpConfirmRequest")),
    responses: {
      "200": jsonResponse("Confirmed TOTP enrollment and returned recovery codes", schemaRef("MfaTotpConfirmResponse"))
    }
  },
  "DELETE /api/v1/auth/mfa/totp": {
    requestBody: jsonRequestBody(schemaRef("MfaTotpDisableRequest")),
    responses: {
      "200": jsonResponse("Disabled TOTP MFA for the current user", schemaRef("MfaTotpDisableResponse"))
    }
  },
  "GET /api/v1/auth/sessions": {
    responses: {
      "200": jsonResponse("Current user's active sessions", arrayOf(schemaRef("UserSession")))
    }
  },
  "DELETE /api/v1/auth/sessions/{sessionId}": {
    responses: {
      "200": jsonResponse("Revoked one current-user session", schemaRef("OkResponse"))
    }
  },
  "GET /api/v1/auth/oidc/config": {
    responses: {
      "200": jsonResponse("Public OIDC sign-in configuration", schemaRef("OidcPublicConfig"))
    }
  },
  "POST /api/v1/auth/oidc/start": {
    requestBody: jsonRequestBody(schemaRef("OidcStartRequest")),
    responses: {
      "200": jsonResponse("Created OIDC authorization request", schemaRef("OidcStartResponse"))
    }
  },
  "GET /api/v1/auth/oidc/start": {
    parameters: [
      {
        name: "returnTo",
        in: "query",
        required: false,
        description: "Optional relative path to restore after the OIDC callback.",
        schema: stringSchema
      }
    ],
    responses: {
      "302": {
        description: "Redirects the browser to the configured OIDC authorization endpoint."
      }
    }
  },
  "GET /api/v1/auth/oidc/callback": {
    parameters: [
      {
        name: "code",
        in: "query",
        required: false,
        description: "Authorization code returned by the OIDC provider.",
        schema: stringSchema
      },
      {
        name: "state",
        in: "query",
        required: false,
        description: "Opaque state token created by the OIDC start route.",
        schema: stringSchema
      },
      {
        name: "error",
        in: "query",
        required: false,
        description: "Provider error code when authorization fails.",
        schema: stringSchema
      },
      {
        name: "error_description",
        in: "query",
        required: false,
        description: "Provider error description when authorization fails.",
        schema: stringSchema
      }
    ],
    responses: {
      "200": jsonResponse("Authenticated OIDC callback result when no browser redirect is requested", schemaRef("OidcCallbackResponse"))
    }
  },
  "GET /api/v1/auth/session": {
    responses: {
      "200": jsonResponse("Current authenticated user session", schemaRef("SessionInfo"))
    }
  },
  "GET /api/v1/organizations": {
    responses: {
      "200": jsonResponse("Organization workspaces accessible to the current user", arrayOf(schemaRef("OrganizationWorkspaceInfo")))
    }
  },
  "POST /api/v1/organizations": {
    requestBody: jsonRequestBody(schemaRef("OrganizationCreateRequest")),
    responses: {
      "201": jsonResponse("Created organization workspace and selected it for the current bearer session", schemaRef("OrganizationSwitchResponse"))
    }
  },
  "PATCH /api/v1/organization/session": {
    requestBody: jsonRequestBody(schemaRef("OrganizationSwitchRequest")),
    responses: {
      "200": jsonResponse("Updated active organization for the current bearer session", schemaRef("OrganizationSwitchResponse"))
    }
  },
  "GET /api/v1/organization/workspace-defaults": {
    responses: {
      "200": jsonResponse("Organization-wide campaign setup defaults for the current workspace", schemaRef("OrganizationWorkspace"))
    }
  },
  "PATCH /api/v1/organization/workspace-defaults": {
    requestBody: jsonRequestBody(schemaRef("OrganizationWorkspaceDefaultsPatchRequest")),
    responses: {
      "200": jsonResponse("Updated organization-wide campaign setup defaults", schemaRef("OrganizationWorkspace"))
    }
  },
  "GET /api/v1/organization/members": {
    responses: {
      "200": jsonResponse("Current workspace organization members", arrayOf(schemaRef("OrganizationMember")))
    }
  },
  "POST /api/v1/organization/members": {
    requestBody: jsonRequestBody(schemaRef("OrganizationMemberCreateRequest")),
    responses: {
      "200": jsonResponse("Updated existing organization member", schemaRef("OrganizationMember")),
      "201": jsonResponse("Added organization member", schemaRef("OrganizationMember"))
    }
  },
  "PATCH /api/v1/organization/members/{memberId}": {
    requestBody: jsonRequestBody(schemaRef("OrganizationMemberUpdateRequest")),
    responses: {
      "200": jsonResponse("Updated organization member role", schemaRef("OrganizationMember"))
    }
  },
  "DELETE /api/v1/organization/members/{memberId}": {
    responses: {
      "200": jsonResponse("Removed organization member and campaign access", schemaRef("OrganizationMemberDeleteResponse"))
    }
  },
  "GET /api/v1/organization/invites": {
    responses: {
      "200": jsonResponse("Current active organization invite roster", arrayOf(schemaRef("OrganizationInvite")))
    }
  },
  "POST /api/v1/organization/invites": {
    requestBody: jsonRequestBody(schemaRef("OrganizationInviteCreateRequest")),
    responses: {
      "201": jsonResponse("Created invite metadata plus the one-time plaintext token for an active-organization campaign", schemaRef("CampaignInviteCreateResponse"))
    }
  },
  "GET /api/v1/admin/users": {
    responses: {
      "200": jsonResponse("Server-admin user roster with redacted auth state and counts", arrayOf(schemaRef("AdminUser")))
    }
  },
  "PATCH /api/v1/admin/users/{userId}": {
    requestBody: jsonRequestBody(schemaRef("AdminUserPatchRequest")),
    responses: {
      "200": jsonResponse("Updated server-admin user record", schemaRef("AdminUser"))
    }
  },
  "POST /api/v1/admin/users/{userId}/password-reset": {
    requestBody: jsonRequestBody(schemaRef("AdminUserPasswordResetRequest")),
    responses: {
      "200": jsonResponse("Created password reset token and queued reset email", schemaRef("AdminUserPasswordResetResponse"))
    }
  },
  "POST /api/v1/admin/password-resets/prune": {
    requestBody: jsonRequestBody(schemaRef("AdminPasswordResetPruneRequest")),
    responses: {
      "200": jsonResponse("Password reset pruning dry-run or mutation result", schemaRef("AdminPasswordResetPruneResult"))
    }
  },
  "DELETE /api/v1/admin/users/{userId}/sessions": {
    responses: {
      "200": jsonResponse("Revoked all sessions for a user", schemaRef("AdminSessionRevokeResponse"))
    }
  },
  "GET /api/v1/admin/sessions": {
    responses: {
      "200": jsonResponse("Server-admin session roster with redacted user details", arrayOf(schemaRef("AdminSession")))
    }
  },
  "GET /api/v1/admin/sessions/risk": {
    parameters: [
      {
        name: "staleDays",
        in: "query",
        required: false,
        description: "Number of idle days before an active session is considered stale.",
        schema: { type: "integer", minimum: 1, maximum: 365 }
      }
    ],
    responses: {
      "200": jsonResponse("Session risk report for stale, expired, disabled-user, and unknown-user sessions", schemaRef("AdminSessionRiskReport"))
    }
  },
  "POST /api/v1/admin/sessions/risk/revoke": {
    requestBody: jsonRequestBody(schemaRef("AdminSessionRiskRevokeRequest")),
    responses: {
      "200": jsonResponse("Dry-run or revoke result for matching risk sessions", schemaRef("AdminSessionRiskRevokeResult"))
    }
  },
  "DELETE /api/v1/admin/sessions/{sessionId}": {
    responses: {
      "200": jsonResponse("Revoked one server-admin selected session", schemaRef("OkResponse"))
    }
  },
  "GET /api/v1/admin/auth/config": {
    responses: {
      "200": jsonResponse("Redacted auth runtime configuration posture", schemaRef("AdminAuthRuntimeConfig"))
    }
  },
  "GET /api/v1/admin/auth/operations": {
    parameters: [
      {
        name: "staleDays",
        in: "query",
        required: false,
        description: "Number of idle days before an active session is considered stale in auth operations posture.",
        schema: { type: "integer", minimum: 1, maximum: 365 }
      }
    ],
    responses: {
      "200": jsonResponse("Auth operations posture and remediation queue", schemaRef("AdminAuthOperations"))
    }
  },
  "POST /api/v1/admin/auth/test-connection": {
    requestBody: jsonRequestBody(schemaRef("AdminAuthTestConnectionRequest")),
    responses: {
      "200": jsonResponse("Redacted OIDC or SCIM connection test result", schemaRef("AdminAuthConnectionTestResult"))
    }
  },
  "GET /api/v1/admin/email-outbox": {
    responses: {
      "200": jsonResponse("Recent email outbox messages visible to server admins", arrayOf(schemaRef("EmailOutboxMessage")))
    }
  },
  "POST /api/v1/admin/email-outbox/retry-all": {
    requestBody: jsonRequestBody(schemaRef("AdminEmailOutboxRetryAllRequest")),
    responses: {
      "200": jsonResponse("Bulk email outbox retry dry-run or mutation result", schemaRef("AdminEmailOutboxRetryAllResult"))
    }
  },
  "POST /api/v1/admin/email-outbox/{messageId}/retry": {
    responses: {
      "200": jsonResponse("Retried email outbox message", schemaRef("EmailOutboxMessage"))
    }
  },
  "GET /api/v1/admin/audit-logs": {
    parameters: [
      { name: "campaignId", in: "query", required: false, description: "Filter by campaign id.", schema: stringSchema },
      { name: "actorUserId", in: "query", required: false, description: "Filter by actor user id.", schema: stringSchema },
      { name: "actorType", in: "query", required: false, description: "Filter by audit actor type.", schema: { type: "string", enum: ["user", "ai", "plugin", "system"] } },
      { name: "action", in: "query", required: false, description: "Filter by exact audit action.", schema: stringSchema },
      { name: "targetType", in: "query", required: false, description: "Filter by target type.", schema: stringSchema },
      { name: "targetId", in: "query", required: false, description: "Filter by target id.", schema: stringSchema },
      { name: "since", in: "query", required: false, description: "Return audit entries created at or after this ISO timestamp.", schema: { type: "string", format: "date-time" } },
      { name: "until", in: "query", required: false, description: "Return audit entries created at or before this ISO timestamp.", schema: { type: "string", format: "date-time" } },
      { name: "limit", in: "query", required: false, description: "Maximum audit entries to return.", schema: { type: "integer", minimum: 1, maximum: 10000 } },
      { name: "format", in: "query", required: false, description: "Use ndjson for a newline-delimited export; json returns the typed export envelope.", schema: { type: "string", enum: ["json", "ndjson"] } }
    ],
    responses: {
      "200": jsonResponse("Filtered server-admin audit export envelope for JSON format", schemaRef("AdminAuditLogExport"))
    }
  },
  "GET /api/v1/admin/jobs": {
    parameters: [
      { name: "type", in: "query", required: false, description: "Filter by queued job type.", schema: { type: "string", enum: ["campaign.export", "campaign.import", "asset.storage.migrate", "asset.storage.cleanup", "storage.backup", "storage.restoreDrill", "ai.memory.extract", "ai.session.recap", "report.bundle"] } },
      { name: "status", in: "query", required: false, description: "Filter by job status.", schema: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] } },
      { name: "limit", in: "query", required: false, description: "Maximum jobs to return.", schema: { type: "integer", minimum: 1, maximum: 500 } }
    ],
    responses: {
      "200": jsonResponse("Recent server-admin job ledger entries with redacted payloads and outputs", arrayOf(schemaRef("AdminJob")))
    }
  },
  "POST /api/v1/admin/jobs": {
    requestBody: jsonRequestBody(schemaRef("AdminJobCreateRequest")),
    responses: {
      "201": jsonResponse("Created a queued server-admin job ledger entry", schemaRef("AdminJob"))
    }
  },
  "POST /api/v1/admin/jobs/lease": {
    requestBody: jsonRequestBody(schemaRef("AdminJobLeaseRequest")),
    responses: {
      "200": jsonResponse("Leased the next queued or expired server-admin job", schemaRef("AdminJob")),
      "204": { description: "No matching queued or expired job is available to lease" }
    }
  },
  "GET /api/v1/admin/jobs/operations": {
    responses: {
      "200": jsonResponse("Server-admin job queue, lease, heartbeat, retry, and remediation posture", schemaRef("AdminJobOperations"))
    }
  },
  "GET /api/v1/admin/jobs/metrics": {
    responses: {
      "200": textResponse("Prometheus text exposition for server-admin job queue, lease, heartbeat, retry, and remediation gauges")
    }
  },
  "POST /api/v1/admin/jobs/alerts": {
    requestBody: jsonRequestBody(schemaRef("AdminJobAlertRequest")),
    responses: {
      "200": jsonResponse("Dry-run, skipped, or delivered job operations alert result", schemaRef("AdminJobAlertResult")),
      "502": jsonResponse("Job operations alert webhook delivery failed", schemaRef("AdminJobAlertResult"))
    }
  },
  "GET /api/v1/admin/jobs/{jobId}": {
    responses: {
      "200": jsonResponse("Server-admin job ledger entry with redacted payload and output", schemaRef("AdminJob"))
    }
  },
  "PATCH /api/v1/admin/jobs/{jobId}": {
    requestBody: jsonRequestBody(schemaRef("AdminJobPatchRequest")),
    responses: {
      "200": jsonResponse("Updated server-admin job status, progress, output, error, or log", schemaRef("AdminJob"))
    }
  },
  "POST /api/v1/admin/jobs/{jobId}/heartbeat": {
    requestBody: jsonRequestBody(schemaRef("AdminJobHeartbeatRequest")),
    responses: {
      "200": jsonResponse("Extended the lease and optionally updated progress or logs for a running job", schemaRef("AdminJob"))
    }
  },
  "POST /api/v1/admin/jobs/{jobId}/retry": {
    responses: {
      "200": jsonResponse("Requeued a failed or cancelled server-admin job", schemaRef("AdminJob"))
    }
  },
  "POST /api/v1/admin/jobs/{jobId}/cancel": {
    requestBody: jsonRequestBody(schemaRef("AdminJobCancelRequest")),
    responses: {
      "200": jsonResponse("Cancelled a queued or running server-admin job", schemaRef("AdminJob"))
    }
  },
  "GET /api/v1/admin/ai/operations": {
    responses: {
      "200": jsonResponse("Server-admin AI runtime, safety, evaluation, tool, and proposal operations posture", schemaRef("AdminAiOperations"))
    }
  },
  "POST /api/v1/admin/ai/proposals/stale/reject": {
    requestBody: jsonRequestBody(schemaRef("AdminAiStaleProposalRejectRequest")),
    responses: {
      "200": jsonResponse("Dry-run or reject stale pending or approved AI proposals", schemaRef("AdminAiStaleProposalRejectResult"))
    }
  },
  "POST /api/v1/admin/ai/threads/stale/fail": {
    requestBody: jsonRequestBody(schemaRef("AdminAiStaleThreadFailRequest")),
    responses: {
      "200": jsonResponse("Dry-run or fail stale running AI threads", schemaRef("AdminAiStaleThreadFailResult"))
    }
  },
  "POST /api/v1/admin/ai/tool-calls/stale/fail": {
    requestBody: jsonRequestBody(schemaRef("AdminAiStaleToolCallFailRequest")),
    responses: {
      "200": jsonResponse("Dry-run or fail stale started AI tool calls", schemaRef("AdminAiStaleToolCallFailResult"))
    }
  },
  "POST /api/v1/admin/ai/tool-calls/retry": {
    requestBody: jsonRequestBody(schemaRef("AdminAiToolCallRetryRequest")),
    responses: {
      "200": jsonResponse("Dry-run or replay retryable failed AI tool calls through the proposal-safe tool executor", schemaRef("AdminAiToolCallRetryResult"))
    }
  },
  "GET /api/v1/admin/ai/evaluations": {
    parameters: [
      { name: "campaignId", in: "query", required: false, description: "Filter evaluations by campaign id.", schema: stringSchema },
      { name: "status", in: "query", required: false, description: "Filter by evaluation status.", schema: { type: "string", enum: ["passed", "failed"] } },
      { name: "limit", in: "query", required: false, description: "Maximum evaluations to export.", schema: { type: "integer", minimum: 1, maximum: 500 } },
      { name: "format", in: "query", required: false, description: "Use ndjson for a newline-delimited export; json returns the typed export envelope.", schema: { type: "string", enum: ["json", "ndjson"] } }
    ],
    responses: {
      "200": jsonResponse("Filtered AI evaluation export envelope for JSON format", schemaRef("AdminAiEvaluationExport"))
    }
  },
  "GET /api/v1/admin/plugins/reviews": {
    responses: {
      "200": jsonResponse("Marketplace plugin review snapshot", schemaRef("AdminPluginReviewSnapshot"))
    }
  },
  "PATCH /api/v1/admin/plugins/reviews/{reviewKey}": {
    requestBody: jsonRequestBody(schemaRef("AdminPluginReviewPatchRequest")),
    responses: {
      "200": jsonResponse("Updated marketplace plugin review state", schemaRef("AdminPluginReviewInfo"))
    }
  },
  "POST /api/v1/admin/plugins/registry/sync": {
    requestBody: jsonRequestBody(schemaRef("AdminPluginRegistrySyncRequest")),
    responses: {
      "200": jsonResponse("Synchronized configured plugin registries", schemaRef("AdminPluginRegistrySyncResponse"))
    }
  },
  "GET /api/v1/admin/plugins/operations": {
    responses: {
      "200": jsonResponse("Server-admin plugin operations posture and remediation queue", schemaRef("AdminPluginOperations"))
    }
  },
  "GET /api/v1/admin/systems/operations": {
    responses: {
      "200": jsonResponse("Server-admin rules-system operations posture and remediation queue", schemaRef("AdminSystemOperations"))
    }
  },
  "GET /api/v1/admin/rendering/operations": {
    responses: {
      "200": jsonResponse("Server-admin rendering diagnostics, authoring operations, and remediation queue", schemaRef("AdminRenderingOperations"))
    }
  },
  "GET /api/v1/admin/scim/group-role-mappings": {
    responses: {
      "200": jsonResponse("SCIM group-to-campaign role mappings with matched group snapshots", arrayOf(schemaRef("AdminScimGroupRoleMapping")))
    }
  },
  "POST /api/v1/admin/scim/group-role-mappings": {
    requestBody: jsonRequestBody(schemaRef("AdminScimGroupRoleMappingInput")),
    responses: {
      "200": jsonResponse("Created SCIM group role mapping and membership sync summary", schemaRef("AdminScimGroupRoleMappingCreateResponse")),
      "201": jsonResponse("Created SCIM group role mapping and membership sync summary", schemaRef("AdminScimGroupRoleMappingCreateResponse"))
    }
  },
  "DELETE /api/v1/admin/scim/group-role-mappings/{mappingId}": {
    responses: {
      "200": jsonResponse("Deleted SCIM group role mapping cleanup summary", schemaRef("AdminScimGroupRoleMappingDeleteResponse"))
    }
  },
  "GET /api/v1/scim/v2/ServiceProviderConfig": {
    responses: {
      "200": jsonResponse("SCIM v2 service provider capability document", schemaRef("ScimServiceProviderConfig"))
    }
  },
  "GET /api/v1/scim/v2/Users": {
    parameters: [
      {
        name: "startIndex",
        in: "query",
        required: false,
        description: "SCIM 1-based result offset.",
        schema: { type: "integer", minimum: 1 }
      },
      {
        name: "count",
        in: "query",
        required: false,
        description: "SCIM page size, capped at 200.",
        schema: { type: "integer", minimum: 0, maximum: 200 }
      }
    ],
    responses: {
      "200": jsonResponse("SCIM user list response", schemaRef("ScimUserListResponse"))
    }
  },
  "POST /api/v1/scim/v2/Users": {
    requestBody: jsonRequestBody(schemaRef("ScimUserInput")),
    responses: {
      "200": jsonResponse("Created SCIM user resource", schemaRef("ScimUser")),
      "201": jsonResponse("Created SCIM user resource", schemaRef("ScimUser"))
    }
  },
  "GET /api/v1/scim/v2/Users/{userId}": {
    responses: {
      "200": jsonResponse("SCIM user resource", schemaRef("ScimUser"))
    }
  },
  "PUT /api/v1/scim/v2/Users/{userId}": {
    requestBody: jsonRequestBody(schemaRef("ScimUserInput")),
    responses: {
      "200": jsonResponse("Replaced SCIM user resource", schemaRef("ScimUser"))
    }
  },
  "PATCH /api/v1/scim/v2/Users/{userId}": {
    requestBody: jsonRequestBody(schemaRef("ScimPatchRequest")),
    responses: {
      "200": jsonResponse("Patched SCIM user resource", schemaRef("ScimUser"))
    }
  },
  "DELETE /api/v1/scim/v2/Users/{userId}": {
    responses: {
      "204": { description: "SCIM user deactivated and active sessions revoked" }
    }
  },
  "GET /api/v1/scim/v2/Groups": {
    parameters: [
      {
        name: "startIndex",
        in: "query",
        required: false,
        description: "SCIM 1-based result offset.",
        schema: { type: "integer", minimum: 1 }
      },
      {
        name: "count",
        in: "query",
        required: false,
        description: "SCIM page size, capped at 200.",
        schema: { type: "integer", minimum: 0, maximum: 200 }
      }
    ],
    responses: {
      "200": jsonResponse("SCIM group list response", schemaRef("ScimGroupListResponse"))
    }
  },
  "POST /api/v1/scim/v2/Groups": {
    requestBody: jsonRequestBody(schemaRef("ScimGroupInput")),
    responses: {
      "200": jsonResponse("Created SCIM group resource", schemaRef("ScimGroup")),
      "201": jsonResponse("Created SCIM group resource", schemaRef("ScimGroup"))
    }
  },
  "GET /api/v1/scim/v2/Groups/{groupId}": {
    responses: {
      "200": jsonResponse("SCIM group resource", schemaRef("ScimGroup"))
    }
  },
  "PUT /api/v1/scim/v2/Groups/{groupId}": {
    requestBody: jsonRequestBody(schemaRef("ScimGroupInput")),
    responses: {
      "200": jsonResponse("Replaced SCIM group resource", schemaRef("ScimGroup"))
    }
  },
  "PATCH /api/v1/scim/v2/Groups/{groupId}": {
    requestBody: jsonRequestBody(schemaRef("ScimPatchRequest")),
    responses: {
      "200": jsonResponse("Patched SCIM group resource and synchronized mapped memberships", schemaRef("ScimGroup"))
    }
  },
  "DELETE /api/v1/scim/v2/Groups/{groupId}": {
    responses: {
      "204": { description: "SCIM group deleted and mapped memberships cleaned up" }
    }
  },
  "GET /api/v1/admin/storage/operations": {
    responses: {
      "200": jsonResponse("Server-admin storage posture, backup state, and restore readiness", schemaRef("AdminStorageOperations"))
    }
  },
  "POST /api/v1/admin/storage/backup": {
    requestBody: jsonRequestBody(schemaRef("StorageBackupRequest")),
    responses: {
      "200": jsonResponse("Created SQLite backup summary", schemaRef("StorageBackupResult"))
    }
  },
  "POST /api/v1/admin/storage/restore-drill": {
    requestBody: jsonRequestBody(schemaRef("StorageRestoreDrillRequest")),
    responses: {
      "200": jsonResponse("Restore drill passed against a copied SQLite backup", schemaRef("StorageRestoreDrillResult")),
      "409": jsonResponse("Restore drill failed against the requested or latest SQLite backup", schemaRef("StorageRestoreDrillResult"))
    }
  },
  "POST /api/v1/admin/storage/restore": {
    requestBody: jsonRequestBody(schemaRef("StorageRestoreRequest")),
    responses: {
      "200": jsonResponse("Restored the live SQLite store from a confirmed backup file", schemaRef("StorageRestoreResult")),
      "409": jsonResponse("Destructive restore failed against the confirmed SQLite backup", schemaRef("StorageRestoreResult"))
    }
  },
  "GET /api/v1/admin/assets/storage": {
    responses: {
      "200": jsonResponse("Server-admin global asset storage runtime and operations posture", schemaRef("AdminAssetStorageInfo"))
    }
  },
  "GET /api/v1/admin/assets/integrity": {
    parameters: [
      { name: "campaignId", in: "query", required: false, description: "Filter integrity audit to one campaign.", schema: stringSchema },
      { name: "includeDeleted", in: "query", required: false, description: "Include deleted asset rows in the audit.", schema: { type: "boolean" } },
      { name: "includeExpired", in: "query", required: false, description: "Include expired asset rows in the audit.", schema: { type: "boolean" } }
    ],
    responses: {
      "200": jsonResponse("Asset byte integrity audit and remediation queue", schemaRef("AdminAssetIntegrityReport"))
    }
  },
  "POST /api/v1/admin/assets/integrity/quarantine": {
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse("Dry-run or archive assets with integrity failures", schemaRef("AdminAssetOperationResult"))
    }
  },
  "POST /api/v1/admin/assets/migrate": {
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse("Dry-run or migrate stored asset bytes to the active provider", schemaRef("AdminAssetOperationResult"))
    }
  },
  "POST /api/v1/admin/assets/cleanup": {
    requestBody: jsonRequestBody(schemaRef("AdminAssetOperationRequest")),
    responses: {
      "200": jsonResponse("Dry-run or delete stored bytes for deleted or expired assets", schemaRef("AdminAssetOperationResult"))
    }
  },
  "POST /api/v1/admin/assets/{assetId}/purge-cache": {
    requestBody: jsonRequestBody(schemaRef("AdminAssetCdnPurgeRequest")),
    responses: {
      "200": jsonResponse("Requested CDN cache purge for one asset", schemaRef("AdminAssetCdnPurgeResult"))
    }
  },
  "GET /api/v1/campaigns": {
    responses: {
      "200": jsonResponse("Campaigns visible to the caller", arrayOf(schemaRef("Campaign")))
    }
  },
  "POST /api/v1/campaigns": {
    requestBody: jsonRequestBody(schemaRef("CampaignCreateRequest")),
    responses: {
      "200": jsonResponse("Created campaign", schemaRef("Campaign"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}": {
    responses: {
      "200": jsonResponse("Requested campaign", schemaRef("Campaign"))
    }
  },
  "PATCH /api/v1/campaigns/{campaignId}": {
    requestBody: jsonRequestBody(schemaRef("CampaignPatchRequest")),
    responses: {
      "200": jsonResponse("Updated campaign", schemaRef("Campaign"))
    }
  },
  "DELETE /api/v1/campaigns/{campaignId}": {
    responses: {
      "200": jsonResponse("Deleted campaign snapshot", schemaRef("Campaign"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/archive": {
    responses: {
      "200": jsonResponse("Archived campaign with lifecycle metadata", schemaRef("Campaign"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/restore": {
    responses: {
      "200": jsonResponse("Restored campaign with lifecycle metadata", schemaRef("Campaign"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/members": {
    responses: {
      "200": jsonResponse("Campaign members with public user and permission details", arrayOf(schemaRef("CampaignMember")))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/invites": {
    responses: {
      "200": jsonResponse("Campaign invite metadata without one-time token hashes", arrayOf(schemaRef("CampaignInvite")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/invites": {
    requestBody: jsonRequestBody(schemaRef("CampaignInviteCreateRequest")),
    responses: {
      "200": jsonResponse("Created invite metadata plus the one-time plaintext token", schemaRef("CampaignInviteCreateResponse"))
    }
  },
  "POST /api/v1/invites/accept": {
    requestBody: jsonRequestBody(schemaRef("InviteAcceptRequest")),
    responses: {
      "200": jsonResponse("Accepted invite and created an authenticated session for the campaign member", schemaRef("InviteAcceptResponse"))
    }
  },
  "POST /api/v1/invites/{inviteId}/revoke": {
    responses: {
      "200": jsonResponse("Revoked invite metadata without the token hash", schemaRef("CampaignInvite"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/scenes": {
    responses: {
      "200": jsonResponse("Scenes in display order", arrayOf(schemaRef("Scene")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/scenes": {
    requestBody: jsonRequestBody(schemaRef("SceneCreateRequest")),
    responses: {
      "200": jsonResponse("Created scene", schemaRef("Scene"))
    }
  },
  "GET /api/v1/scenes/{sceneId}": {
    responses: {
      "200": jsonResponse("Requested scene", schemaRef("Scene"))
    }
  },
  "PATCH /api/v1/scenes/{sceneId}": {
    requestBody: jsonRequestBody(schemaRef("ScenePatchRequest")),
    responses: {
      "200": jsonResponse("Updated scene", schemaRef("Scene"))
    }
  },
  "DELETE /api/v1/scenes/{sceneId}": {
    responses: {
      "200": jsonResponse("Deleted scene snapshot", schemaRef("Scene"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/fog-presets": {
    responses: {
      "200": jsonResponse("Campaign fog presets", arrayOf(schemaRef("FogPreset")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/fog-presets": {
    requestBody: jsonRequestBody(schemaRef("FogPresetCreateRequest")),
    responses: {
      "200": jsonResponse("Created fog preset from a source scene", schemaRef("FogPreset"))
    }
  },
  "DELETE /api/v1/campaigns/{campaignId}/fog-presets/{presetId}": {
    responses: {
      "200": jsonResponse("Deleted fog preset snapshot", schemaRef("FogPreset"))
    }
  },
  "GET /api/v1/scenes/{sceneId}/vision": {
    responses: {
      "200": jsonResponse("Permission-filtered scene vision snapshot", schemaRef("VisionSnapshot"))
    }
  },
  "GET /api/v1/scenes/{sceneId}/vision/sample": {
    parameters: [
      {
        name: "x",
        in: "query",
        required: false,
        description: "Scene-space x coordinate to sample.",
        schema: { type: "number" }
      },
      {
        name: "y",
        in: "query",
        required: false,
        description: "Scene-space y coordinate to sample.",
        schema: { type: "number" }
      }
    ],
    responses: {
      "200": jsonResponse("Visibility, fog, lighting, and wall sample for one scene point", schemaRef("VisionPointSample"))
    }
  },
  "GET /api/v1/scenes/{sceneId}/rendering/diagnostics": {
    responses: {
      "200": jsonResponse("Scene rendering diagnostics", schemaRef("SceneRenderingDiagnostics"))
    }
  },
  "POST /api/v1/scenes/{sceneId}/annotations": {
    requestBody: jsonRequestBody(schemaRef("SceneAnnotationCreateRequest")),
    responses: {
      "200": jsonResponse("Updated scene with created annotation", schemaRef("Scene"))
    }
  },
  "PATCH /api/v1/scenes/{sceneId}/annotations/{annotationId}": {
    requestBody: jsonRequestBody(schemaRef("SceneAnnotationUpdateRequest")),
    responses: {
      "200": jsonResponse("Updated scene with annotation changes", schemaRef("Scene"))
    }
  },
  "DELETE /api/v1/scenes/{sceneId}/annotations/{annotationId}": {
    responses: {
      "200": jsonResponse("Updated scene with annotation removed", schemaRef("Scene"))
    }
  },
  "POST /api/v1/scenes/{sceneId}/fog": {
    requestBody: jsonRequestBody(schemaRef("FogRegionInput")),
    responses: {
      "200": jsonResponse("Updated scene with created fog region", schemaRef("Scene"))
    }
  },
  "GET /api/v1/scenes/{sceneId}/fog/history": {
    responses: {
      "200": jsonResponse("Scene fog edit history", arrayOf(schemaRef("FogHistoryEntry")))
    }
  },
  "POST /api/v1/scenes/{sceneId}/fog/undo": {
    responses: {
      "200": jsonResponse("Updated scene after undoing the latest fog edit", schemaRef("Scene"))
    }
  },
  "POST /api/v1/scenes/{sceneId}/fog/apply-preset": {
    requestBody: jsonRequestBody(schemaRef("FogPresetApplyRequest")),
    responses: {
      "200": jsonResponse("Updated scene after applying a fog preset", schemaRef("Scene"))
    }
  },
  "PATCH /api/v1/scenes/{sceneId}/fog/{fogId}": {
    requestBody: jsonRequestBody(schemaRef("FogRegionInput")),
    responses: {
      "200": jsonResponse("Updated scene with patched fog region", schemaRef("Scene"))
    }
  },
  "DELETE /api/v1/scenes/{sceneId}/fog/{fogId}": {
    responses: {
      "200": jsonResponse("Updated scene with fog region removed", schemaRef("Scene"))
    }
  },
  "POST /api/v1/scenes/{sceneId}/walls": {
    requestBody: jsonRequestBody(schemaRef("WallInput")),
    responses: {
      "200": jsonResponse("Updated scene with created wall", schemaRef("Scene"))
    }
  },
  "PATCH /api/v1/scenes/{sceneId}/walls/{wallId}": {
    requestBody: jsonRequestBody(schemaRef("WallInput")),
    responses: {
      "200": jsonResponse("Updated scene with patched wall", schemaRef("Scene"))
    }
  },
  "DELETE /api/v1/scenes/{sceneId}/walls/{wallId}": {
    responses: {
      "200": jsonResponse("Updated scene with wall removed", schemaRef("Scene"))
    }
  },
  "POST /api/v1/scenes/{sceneId}/lights": {
    requestBody: jsonRequestBody(schemaRef("LightSourceInput")),
    responses: {
      "200": jsonResponse("Updated scene with created light source", schemaRef("Scene"))
    }
  },
  "PATCH /api/v1/scenes/{sceneId}/lights/{lightId}": {
    requestBody: jsonRequestBody(schemaRef("LightSourceInput")),
    responses: {
      "200": jsonResponse("Updated scene with patched light source", schemaRef("Scene"))
    }
  },
  "DELETE /api/v1/scenes/{sceneId}/lights/{lightId}": {
    responses: {
      "200": jsonResponse("Updated scene with light source removed", schemaRef("Scene"))
    }
  },
  "GET /api/v1/scenes/{sceneId}/tokens": {
    responses: {
      "200": jsonResponse("Visible tokens in the scene", arrayOf(schemaRef("Token")))
    }
  },
  "POST /api/v1/scenes/{sceneId}/tokens": {
    requestBody: jsonRequestBody(schemaRef("TokenCreateRequest")),
    responses: {
      "200": jsonResponse("Created token", schemaRef("Token"))
    }
  },
  "POST /api/v1/tokens/{tokenId}/target": {
    requestBody: jsonRequestBody(schemaRef("TokenTargetRequest")),
    responses: {
      "200": jsonResponse("Updated token targeting state", schemaRef("Token"))
    }
  },
  "PATCH /api/v1/tokens/{tokenId}": {
    requestBody: jsonRequestBody(schemaRef("TokenPatchRequest")),
    responses: {
      "200": jsonResponse("Updated token", schemaRef("Token"))
    }
  },
  "DELETE /api/v1/tokens/{tokenId}": {
    responses: {
      "200": jsonResponse("Deleted token snapshot", schemaRef("Token"))
    }
  },
  "GET /api/v1/chat/messages": {
    parameters: [
      {
        name: "campaignId",
        in: "query",
        required: false,
        description: "Restrict messages to one campaign before visibility filtering.",
        schema: idSchema
      }
    ],
    responses: {
      "200": jsonResponse("Chat messages visible to the caller", arrayOf(schemaRef("ChatMessage")))
    }
  },
  "POST /api/v1/chat/messages": {
    requestBody: jsonRequestBody(schemaRef("ChatMessageCreateRequest")),
    responses: {
      "200": jsonResponse("Created chat message", schemaRef("ChatMessage"))
    }
  },
  "PATCH /api/v1/chat/messages/{messageId}/moderation": {
    requestBody: jsonRequestBody(schemaRef("ChatModerationRequest")),
    responses: {
      "200": jsonResponse("Updated chat moderation state", schemaRef("ChatMessage"))
    }
  },
  "DELETE /api/v1/chat/messages/{messageId}": {
    responses: {
      "200": jsonResponse("Deleted chat message snapshot", schemaRef("ChatMessage"))
    }
  },
  "POST /api/v1/dice/roll": {
    requestBody: jsonRequestBody(schemaRef("DiceRollRequest")),
    responses: {
      "200": jsonResponse("Created dice roll", schemaRef("DiceRoll"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/rolls": {
    responses: {
      "200": jsonResponse("Dice rolls visible to the caller", arrayOf(schemaRef("DiceRoll")))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/assets": {
    responses: {
      "200": jsonResponse("Campaign assets visible to the caller", arrayOf(schemaRef("MapAsset")))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/assets/storage": {
    responses: {
      "200": jsonResponse("Campaign asset storage posture", schemaRef("CampaignAssetStorageInfo"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/assets": {
    requestBody: jsonRequestBody(schemaRef("MapAssetCreateRequest")),
    responses: {
      "200": jsonResponse("Created map asset metadata", schemaRef("MapAsset"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/assets/upload": {
    requestBody: {
      required: true,
      description: "Raw asset bytes. The runtime reads asset name, folder, and tags from x-asset-* headers.",
      content: {
        "application/octet-stream": {
          schema: {
            type: "string",
            format: "binary"
          }
        }
      }
    },
    responses: {
      "200": jsonResponse("Uploaded asset and optional updated scene", schemaRef("AssetUploadResponse"))
    }
  },
  "PATCH /api/v1/assets/{assetId}": {
    requestBody: jsonRequestBody(schemaRef("MapAssetPatchRequest")),
    responses: {
      "200": jsonResponse("Updated asset metadata", schemaRef("MapAsset"))
    }
  },
  "GET /api/v1/assets/{assetId}/blob": {
    parameters: [
      { name: "userId", in: "query", required: false, description: "Compatibility user id for legacy local clients.", schema: stringSchema },
      { name: "expiresAt", in: "query", required: false, description: "Signed delivery expiration timestamp.", schema: { type: "string", format: "date-time" } },
      { name: "signature", in: "query", required: false, description: "Signed delivery HMAC.", schema: stringSchema },
      { name: "disposition", in: "query", required: false, description: "Requested content disposition.", schema: { type: "string", enum: ["inline", "attachment"] } }
    ],
    responses: {
      "200": {
        description: "Raw stored asset bytes.",
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary"
            }
          }
        }
      }
    }
  },
  "POST /api/v1/assets/{assetId}/delivery-url": {
    requestBody: jsonRequestBody(schemaRef("AssetDeliveryUrlRequest")),
    responses: {
      "200": jsonResponse("Signed asset delivery URL", schemaRef("AssetDeliveryUrlResponse"))
    }
  },
  "PATCH /api/v1/assets/{assetId}/lifecycle": {
    requestBody: jsonRequestBody(schemaRef("AssetLifecyclePatchRequest")),
    responses: {
      "200": jsonResponse("Updated asset lifecycle", schemaRef("MapAsset"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/actors": {
    responses: {
      "200": jsonResponse("Campaign actors visible to the caller", arrayOf(schemaRef("Actor")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/actors": {
    requestBody: jsonRequestBody(schemaRef("ActorCreateRequest")),
    responses: {
      "200": jsonResponse("Created actor", schemaRef("Actor"))
    }
  },
  "PATCH /api/v1/actors/{actorId}": {
    requestBody: jsonRequestBody(schemaRef("ActorPatchRequest")),
    responses: {
      "200": jsonResponse("Updated actor", schemaRef("Actor"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/items": {
    responses: {
      "200": jsonResponse("Campaign items visible to the caller", arrayOf(schemaRef("Item")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/items": {
    requestBody: jsonRequestBody(schemaRef("ItemCreateRequest")),
    responses: {
      "200": jsonResponse("Created item", schemaRef("Item"))
    }
  },
  "PATCH /api/v1/items/{itemId}": {
    requestBody: jsonRequestBody(schemaRef("ItemPatchRequest")),
    responses: {
      "200": jsonResponse("Updated item", schemaRef("Item"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/journal": {
    responses: {
      "200": jsonResponse("Journal entries visible to the caller", arrayOf(schemaRef("JournalEntry")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/journal": {
    requestBody: jsonRequestBody(schemaRef("JournalEntryCreateRequest")),
    responses: {
      "200": jsonResponse("Created journal entry", schemaRef("JournalEntry"))
    }
  },
  "PATCH /api/v1/journal/{entryId}": {
    requestBody: jsonRequestBody(schemaRef("JournalEntryPatchRequest")),
    responses: {
      "200": jsonResponse("Updated journal entry", schemaRef("JournalEntry"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/combats": {
    responses: {
      "200": jsonResponse("Campaign combats", arrayOf(schemaRef("Combat")))
    }
  },
  "GET /api/v1/combats/{combatId}/audit": {
    responses: {
      "200": jsonResponse("Redacted combat audit entries", arrayOf(schemaRef("AuditLog")))
    }
  },
  "POST /api/v1/combats/{combatId}/actions/{actionId}/confirm": {
    requestBody: jsonRequestBody({ type: "object", additionalProperties: false }),
    responses: {
      "200": jsonResponse("Confirmed combat action", schemaRef("CombatActionMutationResponse"))
    }
  },
  "POST /api/v1/combats/{combatId}/actions/{actionId}/reject": {
    requestBody: jsonRequestBody(schemaRef("CombatActionRejectRequest")),
    responses: {
      "200": jsonResponse("Rejected combat action", schemaRef("CombatActionMutationResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/combats": {
    requestBody: jsonRequestBody(schemaRef("CombatCreateRequest")),
    responses: {
      "200": jsonResponse("Started combat", schemaRef("Combat"))
    }
  },
  "PATCH /api/v1/combats/{combatId}": {
    requestBody: jsonRequestBody(schemaRef("CombatPatchRequest")),
    responses: {
      "200": jsonResponse("Updated combat", schemaRef("Combat"))
    }
  },
  "PATCH /api/v1/combats/{combatId}/combatants/{combatantId}": {
    requestBody: jsonRequestBody(schemaRef("CombatantPatchRequest")),
    responses: {
      "200": jsonResponse("Updated combatant within combat", schemaRef("Combat"))
    }
  },
  "DELETE /api/v1/combats/{combatId}": {
    responses: {
      "200": jsonResponse("Ended combat", schemaRef("Combat"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/proposals": {
    responses: {
      "200": jsonResponse("Campaign proposals", arrayOf(schemaRef("Proposal")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/proposals": {
    requestBody: jsonRequestBody(schemaRef("ProposalCreateRequest")),
    responses: {
      "200": jsonResponse("Created proposal", schemaRef("Proposal"))
    }
  },
  "POST /api/v1/proposals/{proposalId}/approve": {
    responses: {
      "200": jsonResponse("Approved proposal", schemaRef("Proposal"))
    }
  },
  "POST /api/v1/proposals/{proposalId}/reject": {
    responses: {
      "200": jsonResponse("Rejected proposal", schemaRef("Proposal"))
    }
  },
  "POST /api/v1/proposals/{proposalId}/apply": {
    responses: {
      "200": jsonResponse("Applied proposal", schemaRef("Proposal"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/chat/export": {
    parameters: [
      {
        name: "format",
        in: "query",
        required: false,
        description: "Return JSON metadata or newline-delimited JSON chat messages.",
        schema: { type: "string", enum: ["json", "ndjson"] }
      }
    ],
    responses: {
      "200": jsonResponse("Visible campaign chat export", schemaRef("ChatExport"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/dice-macros": {
    responses: {
      "200": jsonResponse("Campaign dice macros", arrayOf(schemaRef("DiceMacro")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/dice-macros": {
    requestBody: jsonRequestBody(schemaRef("DiceMacroRequest")),
    responses: {
      "200": jsonResponse("Created dice macro", schemaRef("DiceMacro"))
    }
  },
  "PATCH /api/v1/dice-macros/{macroId}": {
    requestBody: jsonRequestBody(schemaRef("DiceMacroRequest")),
    responses: {
      "200": jsonResponse("Updated dice macro", schemaRef("DiceMacro"))
    }
  },
  "DELETE /api/v1/dice-macros/{macroId}": {
    responses: {
      "200": jsonResponse("Deleted dice macro snapshot", schemaRef("DiceMacro"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/encounters": {
    responses: {
      "200": jsonResponse("Campaign encounters", arrayOf(schemaRef("Encounter")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/encounters": {
    requestBody: jsonRequestBody(schemaRef("EncounterCreateRequest")),
    responses: {
      "200": jsonResponse("Created encounter", schemaRef("Encounter"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/ai/threads": {
    responses: {
      "200": jsonResponse("Campaign AI threads", arrayOf(schemaRef("AiThread")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/threads": {
    requestBody: jsonRequestBody(schemaRef("AiThreadCreateRequest")),
    responses: {
      "200": jsonResponse("Completed AI thread response", schemaRef("AiThreadResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/ai/usage": {
    responses: {
      "200": jsonResponse("Campaign AI usage summary", schemaRef("AiUsageMetrics"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/ai/evaluations": {
    responses: {
      "200": jsonResponse("AI evaluation snapshot", schemaRef("AiEvaluationSnapshot"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/evaluations": {
    requestBody: jsonRequestBody(schemaRef("AiEvaluationInput")),
    responses: {
      "200": jsonResponse("Created AI evaluation run", schemaRef("AiEvaluationRun"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/ai/memory": {
    responses: {
      "200": jsonResponse("Visible campaign AI memory facts", arrayOf(schemaRef("AiMemoryFact")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/memory": {
    requestBody: jsonRequestBody(schemaRef("AiMemoryCreateRequest")),
    responses: {
      "200": jsonResponse("Created AI memory fact", schemaRef("AiMemoryFact"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/memory/extract": {
    requestBody: jsonRequestBody(schemaRef("AiMemoryExtractRequest")),
    responses: {
      "200": jsonResponse("Extracted memory through the configured AI provider", schemaRef("AiMemoryExtractResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/ai/tool-calls": {
    responses: {
      "200": jsonResponse("Campaign AI tool calls", arrayOf(schemaRef("AiToolCall")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/tool-calls/{toolCallId}/retry": {
    requestBody: jsonRequestBody(schemaRef("AiToolCallRetryRequest")),
    responses: {
      "200": jsonResponse("Campaign-scoped replay of a retryable failed AI tool call through the proposal-safe tool executor", schemaRef("AdminAiToolCallRetryResult"))
    }
  },
  "POST /api/v1/ai/memory/{factId}/approve": {
    responses: {
      "200": jsonResponse("Approved AI memory fact", schemaRef("AiMemoryFact"))
    }
  },
  "DELETE /api/v1/ai/memory/{factId}": {
    responses: {
      "200": jsonResponse("Deleted AI memory fact", schemaRef("AiMemoryFact"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/session-recap": {
    requestBody: jsonRequestBody(schemaRef("AiSessionRecapRequest")),
    responses: {
      "200": jsonResponse("Created session recap proposal and memory", schemaRef("AiSessionRecapResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/ai/encounter-design": {
    requestBody: jsonRequestBody(schemaRef("AiEncounterDesignRequest")),
    responses: {
      "200": jsonResponse("Created encounter design proposal", schemaRef("AiEncounterDesignResponse"))
    }
  },
  "GET /api/v1/plugins": {
    responses: {
      "200": jsonResponse("Installed plugin catalog", arrayOf(schemaRef("PluginRuntimeInfo")))
    }
  },
  "POST /api/v1/plugins/install": {
    requestBody: jsonRequestBody(schemaRef("PluginPackageInstallRequest")),
    responses: {
      "200": jsonResponse("Registered plugin package", schemaRef("PluginRuntimeInfo"))
    }
  },
  "POST /api/v1/plugins/registry/sync": {
    requestBody: jsonRequestBody(schemaRef("PluginRegistrySyncRequest")),
    responses: {
      "200": jsonResponse("Plugin registry sync result", schemaRef("PluginRegistrySyncResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/plugins": {
    responses: {
      "200": jsonResponse("Plugin catalog with campaign installation posture", arrayOf(schemaRef("PluginCampaignInfo")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/install": {
    requestBody: jsonRequestBody(schemaRef("PluginInstallRequest")),
    responses: {
      "200": jsonResponse("Installed plugin grant and permission review", schemaRef("PluginInstallResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage": {
    responses: {
      "200": jsonResponse("Plugin storage entries visible to the caller", arrayOf(schemaRef("PluginStorageEntry")))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    responses: {
      "200": jsonResponse("Plugin storage entry", schemaRef("PluginStorageEntry"))
    }
  },
  "PUT /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    requestBody: jsonRequestBody(schemaRef("PluginStorageSetRequest")),
    responses: {
      "200": jsonResponse("Updated plugin storage entry", schemaRef("PluginStorageEntry"))
    }
  },
  "DELETE /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}": {
    responses: {
      "200": jsonResponse("Deleted plugin storage key result", schemaRef("PluginStorageDeleteResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command": {
    requestBody: jsonRequestBody(schemaRef("PluginChatCommandRequest")),
    responses: {
      "200": jsonResponse("Executed plugin chat command", schemaRef("PluginChatCommandResponse"))
    }
  },
  "GET /api/v1/systems": {
    responses: {
      "200": jsonResponse("Installed rules-system catalog", arrayOf(schemaRef("SystemRuntimeInfo")))
    }
  },
  "POST /api/v1/systems/install": {
    requestBody: jsonRequestBody(schemaRef("SystemInstallRequest")),
    responses: {
      "200": jsonResponse("Registered rules system", schemaRef("SystemRuntimeInfo"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems": {
    responses: {
      "200": jsonResponse("Rules-system catalog with active campaign marker", arrayOf(schemaRef("SystemRuntimeInfo")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install": {
    responses: {
      "200": jsonResponse("Activated rules system for campaign", schemaRef("SystemInstallResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates": {
    responses: {
      "200": jsonResponse("System character templates", arrayOf({ type: "object", additionalProperties: true }))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins": {
    responses: {
      "200": jsonResponse("System character origins", { type: "object", additionalProperties: true })
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters": {
    requestBody: jsonRequestBody(schemaRef("SystemCharacterCreateRequest")),
    responses: {
      "200": jsonResponse("Created system character actor and starter items", schemaRef("SystemActorResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/monsters": {
    requestBody: jsonRequestBody(schemaRef("SystemMonsterCreateRequest")),
    responses: {
      "200": jsonResponse("Created system monster actor", schemaRef("SystemActorResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import": {
    requestBody: jsonRequestBody(schemaRef("SystemCharacterImportRequest")),
    responses: {
      "200": jsonResponse("Imported system character actor and items", schemaRef("SystemActorResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats": {
    responses: {
      "200": jsonResponse("System encounter threat catalog", arrayOf({ type: "object", additionalProperties: true }))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan": {
    requestBody: jsonRequestBody(schemaRef("SystemEncounterPlanRequest")),
    responses: {
      "200": jsonResponse("System encounter plan and optional encounter", schemaRef("SystemEncounterPlanResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/compendium": {
    responses: {
      "200": jsonResponse("System compendium entries", schemaRef("SystemCompendium"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Applied compendium entry to actor", schemaRef("SystemActorResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Purchased compendium equipment for actor", schemaRef("SystemActorResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Applied system condition to actor", schemaRef("SystemActorResponse"))
    }
  },
  "DELETE /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}": {
    responses: {
      "200": jsonResponse("Removed system condition from actor", schemaRef("SystemActorResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement": {
    responses: {
      "200": jsonResponse("System actor advancement options", { type: "object", additionalProperties: true })
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Advanced system actor", schemaRef("SystemActorResponse"))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Applied system rest to actor", schemaRef("SystemActorResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet": {
    responses: {
      "200": jsonResponse("System actor sheet", { type: "object", additionalProperties: true })
    }
  },
  "POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll": {
    requestBody: jsonRequestBody(schemaRef("SystemActorActionRequest")),
    responses: {
      "200": jsonResponse("Executed system actor roll", schemaRef("SystemRollResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/export": {
    parameters: [
      {
        name: "scope",
        in: "query",
        required: false,
        description: "Archive export scope. The current v1-compatible export supports the selected campaign only.",
        schema: { type: "string", enum: ["campaign"] }
      },
      {
        name: "version",
        in: "query",
        required: false,
        description: "Archive compatibility version to emit.",
        schema: { type: "string", enum: ["0.2.0"] }
      },
      {
        name: "redaction",
        in: "query",
        required: false,
        description: "Portable archive redaction mode. It strips account/auth/server operational secrets while preserving playable campaign content.",
        schema: { type: "string", enum: ["portable"] }
      }
    ],
    responses: {
      "200": jsonResponse("Campaign archive export", schemaRef("CampaignArchive"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/dogfood-report-bundle": {
    responses: {
      "200": jsonResponse("Campaign dogfood report bundle", schemaRef("CampaignDogfoodReportBundle"))
    }
  },
  "POST /api/v1/import/campaign": {
    requestBody: jsonRequestBody(schemaRef("CampaignImportRequest")),
    responses: {
      "200": jsonResponse("Campaign import result", schemaRef("CampaignImportResponse"))
    }
  },
  "GET /api/v1/campaigns/{campaignId}/content-imports": {
    responses: {
      "200": jsonResponse("Campaign content import batches", arrayOf(schemaRef("ContentImportBatch")))
    }
  },
  "POST /api/v1/campaigns/{campaignId}/content-imports/preview": {
    requestBody: jsonRequestBody(schemaRef("ContentImportPreviewRequest")),
    responses: {
      "200": jsonResponse("Previewed content import batch", schemaRef("ContentImportBatch"))
    }
  },
  "GET /api/v1/content-imports/{importId}": {
    responses: {
      "200": jsonResponse("Content import batch", schemaRef("ContentImportBatch"))
    }
  },
  "POST /api/v1/content-imports/{importId}/apply": {
    requestBody: jsonRequestBody(schemaRef("ContentImportApplyRequest")),
    responses: {
      "200": jsonResponse("Applied content import batch", schemaRef("ContentImportBatch"))
    }
  },
  "POST /api/v1/content-imports/{importId}/rollback": {
    responses: {
      "200": jsonResponse("Rolled back content import batch", schemaRef("ContentImportBatch"))
    }
  },
  "DELETE /api/v1/content-imports/{importId}": {
    responses: {
      "200": jsonResponse("Deleted content import batch snapshot", schemaRef("ContentImportBatch"))
    }
  }
};

function isMutatingMethod(method: HttpMethod): boolean {
  return method !== "GET";
}

function isListRoute(method: HttpMethod, path: string): boolean {
  if (method !== "GET") return false;
  return !path.endsWith("/openapi.json") && !path.endsWith("/health") && !path.includes("/blob") && !path.includes("/export");
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
        type: "string"
      }
    }));
}

function buildOperation(method: HttpMethod, path: string): OpenApiOperation {
  const parameters = [...pathParameters(path)];
  if (isListRoute(method, path)) parameters.push(...paginationParameters);
  if (isMutatingMethod(method)) parameters.push(idempotencyKeyParameter);
  const override = routeOperationOverrides[`${method} ${path}`] ?? {};
  const mergedParameters = override.parameters ? [...parameters, ...override.parameters] : parameters;
  const overrideResponseStatuses = Object.keys(override.responses ?? {});
  const includeDefaultOkResponse = overrideResponseStatuses.length === 0 || overrideResponseStatuses.includes("200");

  const operation: OpenApiOperation = {
    operationId: operationId(method, path),
    summary: `${method} ${path}`,
    description: `${method} ${path}. See top-level x-otte-* policy extensions for auth, error, pagination, idempotency, rate-limit, and compatibility semantics shared by v1 routes.`,
    ...(mergedParameters.length > 0 ? { parameters: mergedParameters } : {}),
    responses: {
      ...(includeDefaultOkResponse ? { "200": { description: "OK" } } : {}),
      "400": errorResponse("Bad request"),
      "401": errorResponse("Unauthenticated"),
      "403": errorResponse("Forbidden"),
      "404": errorResponse("Not found"),
      "409": errorResponse("Conflict"),
      "422": errorResponse("Domain validation failed"),
      "429": {
        ...errorResponse("Rate limit exceeded"),
        headers: {
          "Retry-After": {
            schema: {
              type: "string"
            }
          },
          "X-RateLimit-Limit": {
            schema: {
              type: "integer"
            }
          },
          "X-RateLimit-Remaining": {
            schema: {
              type: "integer"
            }
          },
          "X-RateLimit-Reset": {
            schema: {
              type: "string"
            }
          }
        }
      },
      "500": errorResponse("Unexpected server error")
    }
  };

  return {
    ...operation,
    ...override,
    operationId: override.operationId ?? operation.operationId,
    summary: override.summary ?? operation.summary,
    description: override.description ?? operation.description,
    ...(mergedParameters.length > 0 ? { parameters: mergedParameters } : {}),
    responses: {
      ...operation.responses,
      ...(override.responses ?? {})
    }
  };
}

const paths = endpointSpecs.reduce<Record<string, OpenApiPathItem>>((items, [method, path]) => {
  const pathItem = items[path] ?? {};
  const methodKey = method.toLowerCase() as Lowercase<HttpMethod>;
  pathItem[methodKey] = buildOperation(method, path);
  items[path] = pathItem;
  return items;
}, {});

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OpenTabletop Engine API",
    version: "0.3.0",
    description: "Public v1 REST contract seed for the OpenTabletop Engine runtime. This document defines the shared compatibility, auth, error, idempotency, pagination, and rate-limit policy while route-specific request and response schemas continue to be hardened toward v1."
  },
  servers: [
    {
      url: "/api/v1",
      description: "Current v1 API base path"
    }
  ],
  security: [
    {
      BearerAuth: []
    }
  ],
  tags: [
    { name: "auth", description: "Authentication, sessions, first-run owner bootstrap, and enterprise auth setup." },
    { name: "campaigns", description: "Campaign, scene, asset, actor, journal, chat, dice, combat, import, and export APIs." },
    { name: "runtime", description: "AI, plugin, and rules-system runtime APIs." },
    { name: "admin", description: "Server-admin operational posture and recovery APIs." }
  ],
  paths,
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: apiContractPolicy.auth.bearerFormat
      }
    },
    schemas: {
      ...componentSchemas
    }
  },
  "x-otte-version-policy": apiContractPolicy.versioning,
  "x-otte-auth-policy": apiContractPolicy.auth,
  "x-otte-error-policy": apiContractPolicy.errors,
  "x-otte-idempotency-policy": apiContractPolicy.idempotency,
  "x-otte-pagination-policy": apiContractPolicy.pagination,
  "x-otte-rate-limit-policy": apiContractPolicy.rateLimits
} as const;
