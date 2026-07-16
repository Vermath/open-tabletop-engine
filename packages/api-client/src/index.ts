import {
  apiVersion,
  apiVersionHeader,
  campaignArchiveStreamContentType,
  dnd5eSrdRageActionRollIds,
  routes,
} from "@open-tabletop/api-contracts";
import type { Dnd5eSrdRageActionKind } from "@open-tabletop/api-contracts";
import type {
  Actor,
  ActorCalculationExplanation,
  AiCampaignPolicy,
  AiContextScope,
  AiEvaluationRun,
  AiMemoryFact,
  AiThread,
  AiToolCall,
  AudioTrack,
  AuditLog,
  Campaign,
  CampaignArchive,
  CampaignCompatibilityReport,
  CampaignPresence,
  CampaignMember,
  CampaignSession,
  CharacterTransfer,
  CampaignWebhookDeliveryStatus,
  CampaignWebhookEnvelopeEventType,
  CampaignWebhookEventType,
  CalculationOverride,
  ChatMessage,
  Combat,
  CombatAction,
  CombatEnvironmentMechanic,
  CombatReward,
  CompendiumCatalogEntry,
  CompendiumConflict,
  CompendiumConflictChoice,
  CompendiumProvenanceSummary,
  ContentImportBatch,
  ContentImportLicense,
  CoverLevel,
  Dnd5eInventoryOverview,
  Dnd5eInventoryOwnerRef,
  Dnd5eLootData,
  Dnd5eMerchantCatalogEntry,
  Dnd5eSrdPendingAdvancement,
  Dnd5eSrdPendingAdvancementCancelRequest,
  Dnd5eSrdPendingAdvancementCancelResult,
  Dnd5eSrdPreparedActionCommitRequest,
  Dnd5eSrdSpellPreparationApplyRequest,
  Dnd5eSrdSpellPreparationMutationResult,
  Dnd5eSrdSpellPreparationPreviewRequest,
  Dnd5eSrdSpellPreparationPreviewResponse,
  Dnd5eSrdTypedDamageApplyRequest,
  Dnd5eSrdTypedDamageApplyResult,
  DndControlledCreatureCommandRequest,
  DndControlledCreatureConcentrationEndRequest,
  DndControlledCreatureConfirmRequest,
  DndControlledCreatureActionHandoff,
  DndControlledCreatureCreatePrefill,
  DndControlledCreatureCreateRequest,
  DndControlledCreatureEndRequest,
  DndControlledCreatureMutationResult,
  DndControlledCreaturePreview,
  DndControlledCreatureRecord,
  DndControlledCreatureRevisionSet,
  DndCharacterReviewDecisionRequest,
  DndCharacterReviewEntry,
  DndCharacterReviewListResponse,
  DndCharacterReviewPolicyUpdateRequest,
  DndCharacterReviewSubmitRequest,
  DndRulesMutationUndoDescriptor,
  DndRulesMutationUndoRequest,
  DndRulesMutationUndoResult,
  DiceMacro,
  DiceRoll,
  DiceRollFairness,
  Encounter,
  EncounterMonsterPlacementBatchInput,
  EncounterMonsterPlacementBatchResult,
  EngineEvent,
  FogPreset,
  FogRegion,
  DifficultTerrainRegion,
  Handout,
  Item,
  JournalBacklink,
  JournalCanonStatus,
  JournalEntityLink,
  JournalEntry,
  JournalEntryRevision,
  LightSource,
  MapAsset,
  OrganizationMember,
  OrganizationWorkspace,
  PermissionGrant,
  PermissionName,
  Proposal,
  RulesEffectSchedule,
  RulesEffectScheduleEvent,
  RulesEffectScheduleTiming,
  Scene,
  SceneAnnotation,
  SceneAnnotationKind,
  SceneDuplicationRequest,
  SceneDuplicationResult,
  ScenePathMeasurement,
  SystemCapability,
  SystemManifestData,
  Token,
  User,
  UserPreferences,
  UserSession,
  VisionPoint,
  VisionPointSample,
  VisionSnapshot,
  Wall,
  World,
  WorldRecord,
  WorldRelation,
} from "@open-tabletop/core";

export { campaignArchiveStreamContentType };

export interface OpenTabletopClientOptions {
  token?: string;
  userId?: string;
  fetch?: typeof fetch;
}

export interface MutationRequestOptions {
  /** Stable opaque key reused for retries of one logical mutation. */
  idempotencyKey?: string;
}

/** Required retry identity for a prepared mutation commit. */
export interface PreparedMutationRequestOptions extends MutationRequestOptions {
  idempotencyKey: string;
}

export type OperationalRetentionRecordClass = "delivered_emails" | "delivered_webhooks" | "maintenance_jobs";

export interface OperationalRetentionDiagnostics {
  policyVersion: 1;
  generatedAt: string;
  preservationDefault: true;
  supportedRecordClasses: OperationalRetentionRecordClass[];
  counts: Record<OperationalRetentionRecordClass, number>;
  totalEligibleTerminalRecords: number;
  exemptions: string[];
}

export interface OperationalRetentionPlan {
  policyVersion: 1;
  preservationDefault: true;
  dryRun: boolean;
  cutoffAt: string;
  olderThanDays: number;
  recordClasses: OperationalRetentionRecordClass[];
  batchSize: number;
  eligibleCount: number;
  selectedCount: number;
  remainingCount: number;
  targetSetHash: string;
  selected: Array<{ recordClass: OperationalRetentionRecordClass; id: string; completedAt: string }>;
  counts: Record<OperationalRetentionRecordClass, number>;
  exemptions: string[];
  deletedCount?: number;
  reason?: string;
}

export interface OperationalRetentionRequest {
  recordClasses: OperationalRetentionRecordClass[];
  olderThanDays: number;
  batchSize?: number;
  dryRun?: boolean;
  targetSetHash?: string;
  reason?: string;
}

const preparedRoutePart = (value: string): string => encodeURIComponent(value);

const preparedMutationRoutes = {
  typedDamageApply: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${preparedRoutePart(campaignId)}/systems/${preparedRoutePart(systemId)}/actors/${preparedRoutePart(actorId)}/typed-damage/apply`,
  pendingAdvancement: (campaignId: string, systemId: string, actorId: string) =>
    `/api/v1/campaigns/${preparedRoutePart(campaignId)}/systems/${preparedRoutePart(systemId)}/actors/${preparedRoutePart(actorId)}/advancement/pending`,
  rulesMutationUndo: (campaignId: string, mutationId: string) =>
    `/api/v1/campaigns/${preparedRoutePart(campaignId)}/dnd/rules-mutations/${preparedRoutePart(mutationId)}/undo`,
} as const;

export interface JournalWriteInput {
  worldId?: string | null;
  parentId?: string | null;
  kind?: "folder" | "entry";
  title?: string;
  body?: string;
  visibility?: JournalEntry["visibility"];
  visibleToUserIds?: string[];
  visibleToActorIds?: string[];
  tags?: string[];
  links?: Array<Omit<JournalEntityLink, "id"> & { id?: string }>;
}

export interface JournalHistoryResponse {
  entryId: string;
  currentRevision: number;
  revisions: JournalEntryRevision[];
}

export interface JournalBacklinksResponse {
  entryId: string;
  backlinks: JournalBacklink[];
}

export type RealtimeWebSocketConstructor = new (
  url: string | URL,
  protocols?: string | string[],
) => WebSocket;

export interface OpenTabletopRealtimeOptions {
  token?: string;
  WebSocket?: RealtimeWebSocketConstructor;
  protocols?: string | string[];
}

export const openTabletopRealtimePath = "/api/v1/realtime";

export interface CampaignInviteInfo {
  id: string;
  campaignId: string;
  email?: string;
  role: string;
  expiresAt: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInviteCreateResult {
  invite: CampaignInviteInfo;
  token: string;
  acceptUrl: string;
}

export interface CampaignInvitePreviewResult {
  invite: CampaignInviteInfo;
  campaign: Pick<Campaign, "id" | "name" | "description">;
  expectedUpdatedAt: string;
}

export interface CampaignWebhookDeliveryInfo {
  id: string;
  campaignId: string;
  webhookId: string;
  eventId: string;
  eventType: CampaignWebhookEnvelopeEventType;
  occurredAt: string;
  resourceType?: string;
  resourceId?: string;
  attempt: number;
  status: CampaignWebhookDeliveryStatus;
  responseStatus?: number;
  responseBytes?: number;
  durationMs?: number;
  deliveredAt?: string;
  failedAt?: string;
  errorCode?: string;
  retryOfDeliveryId?: string;
  initiatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignWebhookInfo {
  id: string;
  campaignId: string;
  name: string;
  url: string;
  eventTypes: CampaignWebhookEventType[];
  enabled: boolean;
  secretConfigured: boolean;
  secretHint: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  latestDelivery?: CampaignWebhookDeliveryInfo;
}

export interface CampaignWebhookListResult {
  items: CampaignWebhookInfo[];
  supportedEventTypes: CampaignWebhookEventType[];
}

export interface CampaignWebhookSecretResult {
  webhook: CampaignWebhookInfo;
  signingSecret?: string;
  signingSecretAlreadyShown?: boolean;
  campaignUpdatedAt?: string;
}

export interface OrganizationInviteInfo extends CampaignInviteInfo {
  campaign: Pick<Campaign, "id" | "name">;
}

export interface CampaignArchiveImportResult {
  importedCampaignIds: string[];
  counts: Record<string, number>;
  conflicts: Array<{ collection: string; id: string }>;
  skippedConflicts?: Array<{ collection: string; id: string }>;
  assetFiles: number;
  dryRun?: boolean;
  importScope?: "all" | "assets_only" | "selected_collections";
  importCollections?: string[];
  importWarnings?: string[];
  operation?: CampaignArchiveImportOperationSummary;
}

export interface CampaignArchiveImportRollbackConflict {
  collection: string;
  id: string;
  reason: "record_changed" | "asset_bytes_changed" | "reference_conflict";
}

export interface CampaignArchiveImportOperationSummary {
  id: string;
  campaignIds: string[];
  status: "applied" | "partially_rolled_back" | "rolled_back";
  mode: "upsert" | "reject_conflicts" | "skip_conflicts";
  scope: "all" | "assets_only" | "selected_collections";
  collections: string[];
  createdAt: string;
  updatedAt: string;
  recordCount: number;
  assetFileCount: number;
  remainingRecordCount: number;
  remainingAssetFileCount: number;
  lastRollbackAt?: string;
  lastRollbackConflicts: CampaignArchiveImportRollbackConflict[];
}

export interface CampaignArchiveImportRollbackPreview extends CampaignArchiveImportOperationSummary {
  impact: {
    restoreRecords: number;
    deleteRecords: number;
    restoreAssetFiles: number;
    deleteAssetFiles: number;
  };
  conflicts: CampaignArchiveImportRollbackConflict[];
}

export interface CampaignArchiveImportRollbackResult {
  operation: CampaignArchiveImportOperationSummary;
  rolledBackRecords: number;
  rolledBackAssetFiles: number;
  conflicts: CampaignArchiveImportRollbackConflict[];
  campaignUpdatedAt?: string;
}

export interface DiceRollVerification {
  rollId: string;
  formula: string;
  verified: boolean;
  reason?:
    | "fairness_unavailable"
    | "unsupported_algorithm"
    | "seed_hash_mismatch"
    | "formula_unparseable"
    | "result_mismatch";
  fairness?: DiceRollFairness;
  expected: { total: number };
  recomputed?: { total: number };
}

export interface SceneEditHistoryEntry {
  id: string;
  at: string;
  byUserId?: string;
  kind: string;
}

export interface SceneEditHistory {
  sceneId: string;
  limit: number;
  entries: SceneEditHistoryEntry[];
}

export interface SceneVisionOptions {
  /** Campaign member to preview. The server requires scene.update for cross-user previews. */
  previewUserId?: string;
}

export type TokenPatchInput = Partial<
  Pick<
    Token,
    | "actorId"
    | "name"
    | "x"
    | "y"
    | "width"
    | "height"
    | "rotation"
    | "elevation"
    | "layer"
    | "hidden"
    | "locked"
    | "visionEnabled"
    | "visionRadius"
    | "senses"
    | "disposition"
    | "imageAssetId"
    | "ownerUserIds"
    | "notes"
    | "conditions"
    | "auras"
    | "targetedByUserIds"
    | "metadata"
  >
> & {
  /** Null restores the runtime-derived bright radius. */
  brightVisionRadius?: number | null;
  /** Null restores the runtime-derived dim radius. */
  dimVisionRadius?: number | null;
};

export interface CampaignSnapshotMember extends CampaignMember {
  user: Pick<User, "id" | "displayName" | "email">;
  active: boolean;
  permissions: PermissionName[];
}

export type CampaignPermissionTemplateId =
  "standard" | "player_authoring" | "ai_assisted" | "assistant_ops";

export interface CampaignCreateInput extends Partial<
  Pick<Campaign, "name" | "description" | "defaultSystemId" | "visibility">
> {
  permissionTemplate?: CampaignPermissionTemplateId;
  starterContent?: boolean;
}

export type CampaignUpdateInput = Partial<
  Pick<
    Campaign,
    "name" | "description" | "defaultSystemId" | "visibility" | "rulesProfile"
  >
> & { expectedUpdatedAt: string };

export interface UserProfilePatchInput {
  expectedUpdatedAt: string;
  displayName?: string;
  preferences?: Partial<UserPreferences>;
}

export interface CharacterTransferCreateInput {
  toUserId: string;
  expectedUpdatedAt: string;
}

export interface CharacterTransferResolutionInput {
  expectedUpdatedAt: string;
}

export interface CharacterTransferResolutionResult {
  transfer: CharacterTransfer;
  actor?: Actor;
}

export interface CampaignOwnershipTransferInput {
  targetUserId: string;
  expectedUpdatedAt: string;
  reason?: string;
}

export interface CampaignOwnershipTransferResult {
  campaign: Campaign;
  previousOwner: CampaignSnapshotMember;
  newOwner: CampaignSnapshotMember;
}

export type WorldRecordWritableFields = Omit<
  Partial<
    Pick<
      WorldRecord,
      | "worldId"
      | "kind"
      | "name"
      | "summary"
      | "description"
      | "lifecycle"
      | "visibility"
      | "tags"
      | "metadata"
    >
  >,
  "worldId"
> & { worldId?: string | null };

export type WorldRecordCreateInput = WorldRecordWritableFields &
  Pick<WorldRecord, "kind" | "name"> & {
    expectedCampaignUpdatedAt: string;
  };

export type WorldRecordUpdateInput = WorldRecordWritableFields & {
  expectedUpdatedAt: string;
};

export interface WorldRecordDeleteResult {
  record: WorldRecord;
  deletedRelationIds: string[];
}

export type WorldRelationWritableFields = Omit<
  Partial<
    Pick<
      WorldRelation,
      | "worldId"
      | "sourceRecordId"
      | "targetRecordId"
      | "type"
      | "label"
      | "notes"
      | "visibility"
    >
  >,
  "worldId"
> & { worldId?: string | null };

export type WorldRelationCreateInput = WorldRelationWritableFields &
  Pick<WorldRelation, "sourceRecordId" | "targetRecordId" | "type"> & {
    expectedCampaignUpdatedAt: string;
  };

export type WorldRelationUpdateInput = WorldRelationWritableFields & {
  expectedUpdatedAt: string;
};

export interface CalculationOverrideCreateInput {
  fieldId: string;
  source: Extract<CalculationOverride["source"], "gm_manual" | "house_rule">;
  effectiveValue: number | string;
  reason: string;
  expectedActorUpdatedAt: string;
}

export interface CalculationOverrideClearInput {
  reason: string;
  expectedUpdatedAt: string;
  expectedActorUpdatedAt: string;
}

export type EncounterCreateInput = Partial<
  Pick<
    Encounter,
    | "name"
    | "summary"
    | "tokenIds"
    | "difficulty"
    | "systemId"
    | "partyActorIds"
    | "threats"
  >
> & { worldId?: string | null };

export type EncounterUpdateInput = EncounterCreateInput;

export interface SystemEncounterPlanInput {
  partyActorIds?: string[];
  threats?: Array<{ id: string; count: number }>;
  createEncounter?: boolean;
  name?: string;
  expectedUpdatedAt?: string;
}

export interface SystemEncounterPlanResult {
  plan: Record<string, unknown>;
  encounter?: Encounter;
}

export interface CampaignSnapshotBundled {
  assetStorage?: Record<string, unknown>;
  audioTracks?: AudioTrack[];
  plugins?: PluginCampaignInfo[];
  systems?: SystemRuntimeInfo[];
  characterTemplates?: Array<Record<string, unknown>>;
  contentImports?: ContentImportBatch[];
  aiThreads?: AiThread[];
  aiUsage?: Record<string, unknown>;
  aiToolCalls?: AiToolCall[];
  combatAudit?: AuditLog[];
}

export interface SnapshotHistoryMeta {
  limit: number;
  collections: Record<
    string,
    { total: number; returned: number; truncated: boolean }
  >;
}

export interface CampaignSnapshot {
  generatedAt: string;
  eventSequence: number;
  realtimeRecovery: "refetch_snapshot_on_gap";
  history?: SnapshotHistoryMeta;
  user: User;
  campaign: Campaign;
  members: CampaignSnapshotMember[];
  presences: CampaignPresence[];
  campaignSessions: CampaignSession[];
  worlds: World[];
  worldRecords: WorldRecord[];
  worldRelations: WorldRelation[];
  scenes: Scene[];
  selectedSceneId?: string;
  activeSceneId?: string;
  vision?: VisionSnapshot;
  tokens: Token[];
  fogPresets: FogPreset[];
  assets: MapAsset[];
  actors: Actor[];
  calculationOverrides: CalculationOverride[];
  characterTransfers: CharacterTransfer[];
  items: Item[];
  journals: JournalEntry[];
  handouts: Handout[];
  chat: ChatMessage[];
  rolls: DiceRoll[];
  diceMacros: DiceMacro[];
  encounters: Encounter[];
  combats: Combat[];
  proposals: Proposal[];
  memory: AiMemoryFact[];
  bundled: CampaignSnapshotBundled;
}

export interface CampaignPresenceResult {
  campaignId: string;
  generatedAt: string;
  presences: CampaignPresence[];
}

export interface SceneDelegation {
  userId: string;
  permissions: Array<"scene.read" | "scene.update">;
}

export interface SceneDelegationListResult {
  sceneId: string;
  updatedAt: string;
  delegations: SceneDelegation[];
}

export interface CampaignArchiveImportOptions {
  mode?: "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
  scope?: "all" | "assets_only" | "selected_collections";
  collections?: string[];
  regenerateIds?: boolean;
  expectedUpdatedAt?: string;
}

export interface CampaignArchiveExportOptions {
  scope?: "campaign" | "world" | "selected_collections";
  scopeId?: string;
  collections?: string[];
  version?: "0.2.0";
  redaction?: "portable";
}

export interface AssetUploadResponse {
  asset: MapAsset;
  scene?: Scene;
}

export interface AiEditLayerApplyResult {
  aiEditSceneId: string;
  targetSceneId: string;
  backgroundAssetId?: string;
  copiedTokenCount: number;
  replacedTokenCount: number;
}

export type AiReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AiThreadMessageInput {
  role?: string;
  content?: string;
}

export interface AiThreadCreateInput {
  prompt: string;
  surface?: "agent_panel" | "ai_studio";
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  contextScopes?: AiContextScope[];
  selectedSceneId?: string;
  selectedAssetId?: string;
  selectedTokenIds?: string[];
  messages?: AiThreadMessageInput[];
}

export interface AiEffectivePolicy {
  installation: {
    enabled: boolean;
    status: "enabled" | "disabled" | "unsafe_configuration";
    contextScopes: AiContextScope[];
    providerTransmissionDisclosure: string;
    retentionDays: number;
    explicitlyConfigured: boolean;
    readinessIssues: string[];
  };
  campaign: AiCampaignPolicy;
  enabled: boolean;
  status: "enabled" | "disabled" | "unsafe_configuration";
  contextScopes: AiContextScope[];
  retentionDays: number;
  legacyDefault: boolean;
  readinessIssues: string[];
}

export interface AiPolicyUpdateInput {
  expectedRevision: number;
  enabled: boolean;
  contextScopes: AiContextScope[];
  providerTransmissionDisclosure: string;
  retentionDays: number;
}

export interface AiPrivacyRequest {
  mode?: "expired" | "all";
  before?: string;
  limit?: number;
  dryRun?: boolean;
  confirmation?: "CLEAR_AI_OPERATIONAL_HISTORY";
}

export interface AiPrivacyResult {
  localOperationalHistoryOnly: true;
  providerDeletion: "not_requested_or_verified";
  mode: "expired" | "all";
  before: string;
  limit: number;
  dryRun: boolean;
  categories: { aiThreads: number; aiToolCalls: number; aiEvaluations: number };
  preserved: {
    approvedCanonMemory: number;
    candidateMemory: number;
    proposals: number;
    auditLogs: number;
  };
}

export interface McpJsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BoardCaptureSubmitInput {
  dataUrl?: string;
  sceneId?: string;
  width?: number;
  height?: number;
  error?: string;
}

export type BoardCaptureResult =
  | {
      status: "captured";
      captureId: string;
      imageUrl: string;
      expiresAt: string;
      sceneId?: string;
      width?: number;
      height?: number;
      mimeType: "image/png";
    }
  | {
      status: "board_capture_unavailable" | "failed";
      reason: string;
      sceneId?: string;
    };

export interface PluginRuntimeInfo {
  id: string;
  name: string;
  version: string;
  compatibleCore?: string;
  permissions: PermissionName[];
}

export interface PluginCampaignInfo extends PluginRuntimeInfo {
  installed: boolean;
  grantedPermissions: PermissionName[];
  missingPermissions: PermissionName[];
  updateAvailable?: boolean;
  versionCompatibility?: Array<{
    version: string;
    compatibleCore: { range: string; coreVersion: string; satisfied: boolean };
    compatibilityBlock?: string;
    permissions: PermissionName[];
    permissionReview: {
      requestedPermissions: PermissionName[];
      grantRequired: boolean;
    };
    trust: {
      status: "trusted" | "unsigned" | "untrusted";
      policy: "allow_unsigned" | "require_trusted";
      required: boolean;
      installable: boolean;
      errors: string[];
    };
    source: {
      type: "local" | "registry";
      packageId: string;
      sandbox: "vm" | "manifest-only";
    };
    marketplaceReview?: { installable?: boolean };
  }>;
  audit?: {
    installCount: number;
    lastInstallAt?: string;
    versions: string[];
  };
}

export interface PluginInstallResult {
  plugin: PluginCampaignInfo;
  grant: PermissionGrant;
  permissionReview: {
    requestedPermissions: PermissionName[];
    grantedPermissions: PermissionName[];
    missingPermissions: PermissionName[];
  };
}

export interface PluginRegistrySyncResult {
  syncedAt: string;
  previousRegistryRevision: string;
  registryRevision: string;
  registries: Array<{
    registryUrl: string;
    imported: PluginRuntimeInfo[];
    errors: Array<{ packagePath: string; errors: string[] }>;
  }>;
  plugins: PluginRuntimeInfo[];
}

export interface PluginStorageEntryInfo {
  id: string;
  campaignId: string;
  pluginId: string;
  key: string;
  value: unknown;
  updatedByType?: string;
  updatedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemRuntimeInfo extends SystemManifestData {
  active: boolean;
  source: "bundled" | "api";
  dataDriven: boolean;
  runtimeCapabilities: SystemCapability[];
  unsupportedCapabilities: SystemCapability[];
  installedAt?: string;
}

export interface SystemActivationResult {
  system: SystemRuntimeInfo;
  campaign: Campaign;
}

export interface PublicSession extends Pick<
  UserSession,
  "id" | "userId" | "expiresAt" | "lastSeenAt" | "createdAt" | "updatedAt"
> {}

export interface SessionInfo {
  user: Omit<User, "passwordHash" | "mfa" | "scim">;
  session?: PublicSession;
  memberships: CampaignMember[];
  serverAdmin?: boolean;
  serverAdmins?: {
    configured: boolean;
    count: number;
    missingInProduction: boolean;
  };
}

export interface SessionLoginInfo extends SessionInfo {
  token: string;
  session: PublicSession;
}

export interface BootstrapStatus {
  required: boolean;
  userCount: number;
  campaignCount: number;
  publicRegistration: boolean;
  serverAdmins: NonNullable<SessionInfo["serverAdmins"]>;
}

export interface BootstrapOwnerInfo extends SessionLoginInfo {
  campaign: Campaign;
  scene: Scene;
}

export interface CombatActionMutationResult {
  combat: Combat;
  combatAction: CombatAction;
  updatedActors?: Actor[];
  rulesMutationId?: string;
  undo?: DndRulesMutationUndoDescriptor;
}

export interface CombatActionConfirmInput {
  expectedUpdatedAt: string;
  expectedActorUpdatedAt: Record<string, string>;
  expectedItemUpdatedAt: Record<string, string>;
}

export interface CombatRewardCreateInput {
  recipientActorIds?: string[];
  totalXp?: number;
  totalGp?: number;
  loot?: string[];
  note?: string;
  expectedUpdatedAt?: string;
  expectedActorUpdatedAt?: Record<string, string>;
}

export interface CombatRewardMutationResult {
  combat: Combat;
  actors: Actor[];
  reward: CombatReward;
}

export interface CombatEnvironmentMechanicWriteInput {
  kind?: CombatEnvironmentMechanic["kind"];
  name?: string;
  description?: string;
  visibility?: CombatEnvironmentMechanic["visibility"];
  enabled?: boolean;
  schedule?: CombatEnvironmentMechanic["schedule"];
  options?: Array<{ id?: string; name: string; description: string }>;
  expectedUpdatedAt: string;
}

export interface CombatEffectSchedulePreviewInput {
  phase: RulesEffectScheduleTiming;
  now?: string;
  saveOutcomes?: Record<string, "success" | "failure">;
  prepare?: boolean;
}

/** @deprecated Use CombatEffectSchedulePreviewInput for previews. */
export type CombatEffectScheduleInput = CombatEffectSchedulePreviewInput & {
  expectedUpdatedAt?: string;
  preparedPreviewKey?: string;
};

export interface CombatEffectScheduleAdvanceInput {
  preparedPreviewKey: string;
  expectedUpdatedAt: string;
}

export interface CombatEffectSchedulePreparationInfo {
  preparedPreviewKey: string;
  combatId: string;
  request: Omit<CombatEffectSchedulePreviewInput, "prepare">;
  revisions: {
    combatUpdatedAt: string;
    actorUpdatedAt: Record<string, string>;
  };
  resolutionHash: string;
}

export interface CombatEffectScheduleEvaluationInfo {
  phase: RulesEffectScheduleTiming;
  round: number;
  turnIndex: number;
  events: RulesEffectScheduleEvent[];
  actorChanges: Array<{ actorId: string; reason: string }>;
  unresolvedEventIds: string[];
  canApply: boolean;
  combatUpdatedAt: string;
  preparedPreviewKey?: string;
  preparation?: CombatEffectSchedulePreparationInfo;
}

export interface CombatEffectScheduleAdvanceResult {
  combat: Combat;
  evaluation: CombatEffectScheduleEvaluationInfo;
  rulesMutationId: string;
  undo: DndRulesMutationUndoDescriptor;
}

export interface Dnd5eSpellHelperPreviewInput {
  casterActorId: string;
  spellId: string;
  targetActorIds: string[];
  slotLevel: number;
  options?: {
    dartAssignments?: Record<string, number>;
    roundsHeld?: number;
  };
}

export interface Dnd5eSpellHelperPreviewInfo {
  spellId: string;
  spellName: string;
  supported: boolean;
  automation: "preview_only" | "schedule_template" | "manual";
  summary: string;
  targetLimit?: number;
  rolls: Array<{
    label: string;
    formula: string;
    targetActorId?: string;
    save?: { ability: string; success?: string };
  }>;
  scheduleTemplates: Array<{
    targetActorId: string;
    label: string;
    schedule: RulesEffectSchedule;
    conditionIds?: string[];
  }>;
  manualSteps: string[];
  warnings: string[];
}

export interface Dnd5eSpellHelperPreviewResult {
  preview: Dnd5eSpellHelperPreviewInfo;
  source: { id: string; provenance: Record<string, unknown> };
}

export interface CombatInitiativeRollNpcsResult {
  combat: Combat;
  rolls: DiceRoll[];
  chatMessages: ChatMessage[];
}

export type ReviewedCombatParticipantInput =
  | { tokenId: string; initiativeMode: "server" }
  | { tokenId: string; initiativeMode: "manual"; initiative: number };

export interface ReviewedCombatStartInput {
  sceneId: string;
  participants: ReviewedCombatParticipantInput[];
  manualTurnOrder?: boolean;
}

export type ReviewedCombatStartResult = CombatInitiativeRollNpcsResult;

export interface SystemCharacterTemplateItem {
  entryId: string;
  quantity?: number;
  data?: Record<string, unknown>;
}

export interface SystemCharacterTemplateInfo {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  actorType: string;
  data: Record<string, unknown>;
  items: SystemCharacterTemplateItem[];
}

export interface Dnd5eSrdEquipmentGrantInfo {
  entryId: string;
  quantity?: number;
  data?: Record<string, unknown>;
}

export interface Dnd5eSrdEquipmentChoiceInfo {
  id: string;
  label: string;
  count: 1;
  optionIds: string[];
  matchSelection?: "class-tool-proficiency" | "background-tool-proficiency";
}

export interface Dnd5eSrdStartingEquipmentPackageInfo {
  id: string;
  label: string;
  gp: number;
  grants: Dnd5eSrdEquipmentGrantInfo[];
  choices: Dnd5eSrdEquipmentChoiceInfo[];
}

export interface Dnd5eSrdClassStartingEquipmentInfo {
  templateId: string;
  className: string;
  packages: Dnd5eSrdStartingEquipmentPackageInfo[];
  toolProficiencyChoice: { count: number; optionIds: string[] };
  fixedToolProficiencyIds: string[];
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdBackgroundStartingEquipmentInfo {
  backgroundId: string;
  backgroundName: string;
  packages: Dnd5eSrdStartingEquipmentPackageInfo[];
  toolProficiencyChoice: { count: number; optionIds: string[] };
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdWeaponMasteryOptionInfo {
  id: string;
  name: string;
  weaponCategory: "simple" | "martial";
  weaponKind: "melee" | "ranged";
  properties: string[];
  mastery: string;
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdClassWeaponMasteryChoiceInfo {
  templateId: string;
  className: string;
  count: number;
  weaponIds: string[];
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdSpellChoiceOptionInfo {
  id: string;
  name: string;
  level: 0 | 1;
  classes: string[];
  ritual: boolean;
  source: string;
}

export interface Dnd5eSrdClassSpellChoiceInfo {
  templateId: string;
  className: string;
  spellcastingAbility?: "intelligence" | "wisdom" | "charisma";
  cantripCount: number;
  preparedSpellCount: number;
  spellbookSpellCount: number;
  cantripIds: string[];
  levelOneSpellIds: string[];
  alwaysPreparedSpellIds: string[];
  slotPool: "none" | "spellcasting" | "pact-magic";
  slotCount: number;
  slotRecovery: "none" | "long" | "short";
  changeTiming: "none" | "long-rest" | "class-level";
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdEldritchInvocationOptionInfo {
  id: string;
  name: string;
  minimumWarlockLevel: number;
  grantedSpellId?: string;
  pactTomeCantripCount?: number;
  pactTomeRitualCount?: number;
  summary: string;
  automation: "item" | "manual";
  source: string;
  sourcePage: number;
  sourcePdfPage: number;
}

export interface Dnd5eSrdCharacterOriginsInfo {
  backgrounds: Array<{
    id: string;
    name: string;
    abilityScores: string[];
    feat: string;
    skillProficiencies: string[];
    toolProficiencies: string[];
    startingGp: number;
    source: string;
  }>;
  species: Array<{
    id: string;
    name: string;
    creatureType: "Humanoid";
    size: string;
    speed: number;
    traits: string[];
    senses?: string[];
    source: string;
  }>;
  draconicAncestors: Array<{
    id: string;
    name: string;
    damageType: "acid" | "cold" | "fire" | "lightning" | "poison";
    source: string;
  }>;
  giantAncestries: Array<{
    id: string;
    name: string;
    giantType: string;
    activation: "bonus-action" | "on-hit" | "reaction";
    summary: string;
    teleportRangeFt?: number;
    damageFormula?: string;
    damageType?: "cold" | "fire" | "thunder";
    speedReductionFt?: number;
    condition?: "Prone";
    targetMaxSize?: "Large";
    damageReductionFormula?: string;
    damageReductionAbility?: "constitution";
    triggerRangeFt?: number;
    source: string;
  }>;
  classSkillChoices: Array<{
    templateId: string;
    className: string;
    count: number;
    skillIds: string[];
    source: string;
  }>;
  languages: Array<{
    id: string;
    label: string;
    category: "standard" | "rare";
    source: string;
  }>;
  originLanguageChoice: {
    count: number;
    fixedLanguageIds: string[];
    languageIds: string[];
    source: string;
  };
  classLanguageChoices: Array<{
    templateId: string;
    className: string;
    count: number;
    fixedLanguageIds: string[];
    languageIds: string[];
    source: string;
  }>;
  classStartingEquipment: Dnd5eSrdClassStartingEquipmentInfo[];
  backgroundStartingEquipment: Dnd5eSrdBackgroundStartingEquipmentInfo[];
  weaponMasteryOptions: Dnd5eSrdWeaponMasteryOptionInfo[];
  classWeaponMasteryChoices: Dnd5eSrdClassWeaponMasteryChoiceInfo[];
  spellOptions: Dnd5eSrdSpellChoiceOptionInfo[];
  classSpellChoices: Dnd5eSrdClassSpellChoiceInfo[];
  levelOneClassFeatureChoices: Array<{
    templateId: string;
    field: string;
    count: number;
    optionIds: string[];
    source: string;
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  fightingStyles: Array<{
    id: string;
    name: string;
    summary: string;
    automation: "manual";
    source: string;
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  divineOrders: Array<{
    id: string;
    name: string;
    summary: string;
    automation: "manual";
    source: string;
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  primalOrders: Array<{
    id: string;
    name: string;
    summary: string;
    automation: "manual";
    source: string;
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  eldritchInvocations: Dnd5eSrdEldritchInvocationOptionInfo[];
  originFeatOptions: Array<{
    id: string;
    name: string;
    magicInitiateClass?: "cleric" | "druid" | "wizard";
    cantripCount?: 2;
    levelOneSpellCount?: 1;
    skilledProficiencyCount?: 3;
    source: string;
    sourcePage: number;
    sourcePdfPage: number;
  }>;
  skilledProficiencyOptions: Array<{
    id: string;
    label: string;
    category: "skill" | "tool";
    source: string;
  }>;
  elfLineages: Array<{
    id: string;
    name: string;
    cantrip: string;
    level3Spell: string;
    level5Spell: string;
  }>;
  gnomeLineages: Array<{ id: string; name: string }>;
  tieflingLegacies: Array<{
    id: string;
    name: string;
    resistance: string;
  }>;
  highElfCantrips: string[];
  skills: Array<{ id: string; label: string; ability: string }>;
  originFeats: string[];
  spellcastingAbilities: string[];
  /** Forward-compatible metadata for strict creator choices added by a rules runtime. */
  [key: string]: unknown;
}

export interface SystemCharacterCreateInput {
  creationMode?: "level-one-srd";
  templateId?: string;
  name?: string;
  ownerUserId?: string;
  backgroundId?: string;
  speciesId?: string;
  abilityScoreIncreases?: Record<string, number>;
  classSkillProficiencies?: string[];
  originLanguageChoices?: string[];
  classLanguageChoices?: string[];
  draconicAncestry?: string;
  giantAncestry?: string;
  skillProficiency?: string;
  originFeat?: string;
  elfLineage?: string;
  elfCantrip?: string;
  gnomeLineage?: string;
  tieflingLegacy?: string;
  speciesSpellcastingAbility?: string;
  classEquipmentPackageId?: string;
  backgroundEquipmentPackageId?: string;
  classEquipmentChoices?: Record<string, string>;
  backgroundEquipmentChoices?: Record<string, string>;
  classToolProficiencyChoices?: string[];
  backgroundToolProficiencyChoice?: string;
  weaponMasteryChoices?: string[];
  classCantripChoices?: string[];
  classPreparedSpellChoices?: string[];
  wizardSpellbookChoices?: string[];
  backgroundMagicInitiateCantrips?: string[];
  backgroundMagicInitiateSpell?: string;
  backgroundMagicInitiateAbility?: string;
  originFeatMagicInitiateCantrips?: string[];
  originFeatMagicInitiateSpell?: string;
  originFeatMagicInitiateAbility?: string;
  skilledProficiencyChoices?: string[];
  fightingStyle?: string;
  divineOrder?: string;
  primalOrder?: string;
  rogueExpertiseChoices?: string[];
  eldritchInvocation?: string;
  pactTomeCantripChoices?: string[];
  pactTomeRitualChoices?: string[];
  /** Forward-compatible strict creator choices published by character-origins. */
  [key: string]: unknown;
}

export interface SystemCharacterCreateResult {
  template: SystemCharacterTemplateInfo;
  origins?: Record<string, unknown>;
  actor: Actor;
  items: Item[];
  sheet?: Record<string, unknown>;
}

export interface SystemMonsterCreateInput {
  threatId?: string;
  customMonsterItemId?: string;
  name?: string;
  ownerUserId?: string;
}

export interface SystemMonsterCreateResult {
  threat: Record<string, unknown>;
  actor: Actor;
  sheet?: Record<string, unknown>;
}

export interface SystemCharacterImportInput {
  ownerUserId?: string;
  [key: string]: unknown;
}

export interface SystemCharacterImportResult {
  import: Record<string, unknown>;
  actor: Actor;
  items: Item[];
  sheet?: Record<string, unknown>;
}

export interface SystemCompendiumResult {
  systemId: string;
  entries: CompendiumCatalogEntry[];
  provenanceSummary: CompendiumProvenanceSummary;
  filters: { q: string; types: string[] };
}

export interface SystemCompendiumQuery {
  q?: string;
  type?: string;
  types?: string[];
}

export type DndCustomContentKind =
  | "monster"
  | "spell"
  | "item"
  | "feat"
  | "species"
  | "background"
  | "subclass"
  | "condition";

export interface DndCustomContentDraft {
  kind: DndCustomContentKind;
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
  data: Record<string, unknown>;
}

export interface DndCustomContentIssue {
  path: string;
  code: string;
  message: string;
}

export interface DndCustomContentResult {
  item: Item;
  entry: CompendiumCatalogEntry;
  draft: DndCustomContentDraft;
  warnings?: DndCustomContentIssue[];
  campaignUpdatedAt?: string;
}

export interface DndCustomContentPreviewResult {
  preview: true;
  entry: CompendiumCatalogEntry;
  warnings: DndCustomContentIssue[];
}

export interface DndMonsterNamedFeature {
  name: string;
  description: string;
}

export interface DndMonsterActionOverride extends DndMonsterNamedFeature {
  kind?: "action" | "bonusAction" | "reaction";
  attackBonus?: number;
  range?: string;
  damageFormula?: string;
  damageType?: string;
  save?: { ability: string; dc: number; success?: string };
  condition?: string;
  effects?: string[];
  recharge?: string;
}

export interface DndMonsterOverrides {
  size?: string;
  creatureType?: string;
  alignment?: string;
  armorClass?: number;
  initiative?: number;
  hitPoints?: number;
  hitDice?: string;
  challengeRating?: string;
  xp?: number;
  proficiencyBonus?: number;
  speed?: Record<string, number>;
  abilities?: Record<string, number>;
  actions?: DndMonsterActionOverride[];
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  senses?: string[];
  languages?: string[];
  gear?: string[];
  traits?: DndMonsterNamedFeature[];
  reactions?: DndMonsterNamedFeature[];
  legendaryActions?: DndMonsterNamedFeature[];
  manualAdjudication?: string;
}

export interface DndMonsterTemplateDraft {
  name: string;
  description: string;
  overrides: DndMonsterOverrides;
}

export interface DndMonsterTemplateRecord extends DndMonsterTemplateDraft {
  id: string;
  version: string;
}

export interface DndMonsterTemplateResult {
  item: Item;
  template: DndMonsterTemplateRecord;
  warnings?: DndCustomContentIssue[];
  campaignUpdatedAt?: string;
}

export interface DndMonsterBaseReference {
  kind: "bundled" | "campaign";
  id: string;
  version: string;
  name: string;
  provenance: CompendiumCatalogEntry["provenance"];
}

export interface DndMonsterBase extends DndMonsterBaseReference {
  data: Record<string, unknown>;
}

export interface DndMonsterVariantDraft extends Omit<
  DndCustomContentDraft,
  "kind" | "data"
> {
  base: Pick<DndMonsterBaseReference, "kind" | "id" | "version">;
  template?: { id: string; version: string };
  overrides: DndMonsterOverrides;
}

export interface DndMonsterVariantMetadata {
  schemaVersion: "1.0.0";
  base: DndMonsterBaseReference;
  template?: {
    id: string;
    version: string;
    name: string;
    overrides: DndMonsterOverrides;
  };
  overrides: DndMonsterOverrides;
  appliedOverrides: DndMonsterOverrides;
}

export interface DndMonsterVariantDiffEntry {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface DndMonsterVariantPreviewResult {
  preview: true;
  entry: CompendiumCatalogEntry;
  variant: DndMonsterVariantMetadata;
  diff: DndMonsterVariantDiffEntry[];
  warnings: DndCustomContentIssue[];
}

export interface DndMonsterVariantResult extends DndCustomContentResult {
  variant: DndMonsterVariantMetadata;
  diff: DndMonsterVariantDiffEntry[];
  warnings: DndCustomContentIssue[];
}

export interface DndPartyStashCreateInput {
  name?: string;
  capacityLb?: number;
  currency?: Record<string, number>;
  expectedCampaignUpdatedAt: string;
}

export interface DndMerchantMutationInput {
  name?: string;
  description?: string;
  buybackRate?: number;
  currency?: Record<string, number> | null;
  catalog?: Dnd5eMerchantCatalogEntry[];
  expectedUpdatedAt?: string;
  expectedCampaignUpdatedAt: string;
}

export interface DndInventoryItemPatchInput {
  quantity?: number;
  weightLb?: number;
  parentItemId?: string | null;
  containerCapacityLb?: number | null;
  extradimensional?: boolean;
  ammunitionSourceItemId?: string | null;
  expectedUpdatedAt: string;
  expectedOwnerUpdatedAt: string;
}

export interface DndInventoryTransferInput {
  quantity: number;
  destination: Dnd5eInventoryOwnerRef;
  expectedUpdatedAt: string;
  expectedSourceUpdatedAt: string;
  expectedDestinationUpdatedAt: string;
}

export interface DndInventoryAmmunitionInput {
  ammunitionItemId?: string;
  amount?: number;
  expectedUpdatedAt: string;
  expectedAmmunitionUpdatedAt: string;
  expectedActorUpdatedAt: string;
}

export interface DndMerchantBuyInput {
  actorId: string;
  catalogEntryId: string;
  quantity: number;
  expectedActorUpdatedAt: string;
  expectedMerchantUpdatedAt: string;
}

export interface DndMerchantSellInput {
  actorId: string;
  itemId: string;
  quantity: number;
  expectedActorUpdatedAt: string;
  expectedMerchantUpdatedAt: string;
  expectedItemUpdatedAt: string;
}

export interface DndCombatLootInput {
  stashId: string;
  items: Array<{
    name: string;
    type: string;
    quantity: number;
    weightLb: number;
    containerCapacityLb?: number;
    data?: Record<string, unknown>;
  }>;
  note?: string;
  expectedUpdatedAt: string;
  expectedStashUpdatedAt: string;
}

export interface DndLootClaimInput {
  actorId: string;
  expectedUpdatedAt: string;
  expectedStashUpdatedAt: string;
  expectedActorUpdatedAt: string;
}

export interface DndLootAssignmentInput extends DndLootClaimInput {
  action: "assign" | "release";
}

export interface DndMerchantMutationResult {
  merchant: Item;
  warnings: string[];
}

export interface DndMerchantCommerceResult {
  actor: Actor;
  merchant: Item;
  item: Item;
  purchase?: {
    quantity: number;
    unitPriceGp: number;
    totalPriceGp: number;
    currency: Record<string, number>;
  };
  sale?: {
    quantity: number;
    unitPriceGp: number;
    totalPriceGp: number;
    currency: Record<string, number>;
  };
  warnings: string[];
}

export interface DndLootClaimResult {
  item: Item;
  partyStash: Item;
  actor: Actor;
  claim: Dnd5eLootData;
}

export interface DndLootAssignmentResult {
  item: Item;
  partyStash: Item;
  actor: Actor;
  loot: Dnd5eLootData;
}

export interface SystemActorCompendiumMutationInput {
  entryId: string;
  expectedUpdatedAt: string;
  conflictChoice?: CompendiumConflictChoice;
}

export interface SystemActorCompendiumMutationResult {
  entry: CompendiumCatalogEntry;
  resolution: "added" | "kept_existing" | "replaced_existing";
  actor: Actor;
  item?: Item;
  sheet?: Record<string, unknown>;
}

export interface SystemEquipmentPurchaseInput extends SystemActorCompendiumMutationInput {
  quantity?: number;
}

export interface SystemEquipmentPurchaseResult {
  entry: CompendiumCatalogEntry;
  purchase: Record<string, unknown>;
  actor: Actor;
  item: Item;
  resolution:
    "purchased" | "kept_existing" | "merged_existing" | "replaced_existing";
  sheet?: Record<string, unknown>;
}

export interface CompendiumConflictResponse {
  error: "conflict";
  code: "compendium_conflict";
  message: string;
  conflict: CompendiumConflict;
  entry: CompendiumCatalogEntry;
}

export interface SystemActorAdvanceInput {
  optionId?: string;
  featId?: string;
  abilityChoices?: Record<string, number>;
  multiclassInto?: string;
  subclassId?: string;
  weaponMasteryChoices?: string[];
  hitPointMode?: "fixed" | "roll";
  expectedUpdatedAt?: string;
  preparedPreviewKey?: string;
}

export interface SystemActorAdvanceResult {
  advancement: Record<string, unknown>;
  advancementRoll?: Record<string, unknown>;
  actor: Actor;
  sheet?: Record<string, unknown>;
}

export type Dnd5eSrdAdvancementCommitInput = SystemActorAdvanceInput & {
  preparedPreviewKey: string;
  expectedUpdatedAt: string;
};

export interface SystemActorRestInput {
  restType?: "short" | "long";
  arcaneRecovery?: Record<string, number>;
  hitDice?: Array<{ className?: string }>;
  expectedUpdatedAt?: string;
  preparedPreviewKey?: string;
}

export interface SystemActorRestResult {
  rest: Record<string, unknown>;
  actor: Actor;
  sheet?: Record<string, unknown>;
}

export type Dnd5eSrdRestCommitInput = SystemActorRestInput & {
  preparedPreviewKey: string;
  expectedUpdatedAt: string;
};

export interface SystemActorAdvancementInfo {
  actorId: string;
  options: unknown[];
  pendingAdvancement?: Dnd5eSrdPendingAdvancement;
  xp?: Record<string, unknown>;
  advancementClassName?: string;
  nextClassLevel?: number;
  grantsFeat?: boolean;
  feats?: Array<Record<string, unknown>>;
  weaponMastery?: SystemActorAdvancementWeaponMasteryInfo;
  multiclassOptions?: Array<Record<string, unknown> & { weaponMastery?: SystemActorAdvancementWeaponMasteryInfo }>;
}

export interface SystemActorAdvancementWeaponMasteryInfo {
  className: string;
  nextClassLevel: number;
  requiredCount: number;
  requiresSelection: boolean;
  selectedWeaponIds: string[];
  options: Array<{ id: string; name: string; mastery: string }>;
}

export interface SystemActorRollInput {
  [key: string]: unknown;
  rollId?: string;
  actionId?: string;
  ability?: string;
  visibility?: "public" | "gm_only" | "whisper";
  consumeResources?: boolean;
  applyEffect?: boolean;
  targetActorId?: string;
  targetActorIds?: string[];
  spellSlotLevel?: number;
  resourceAmount?: number;
  useFreeResource?: boolean;
  effectChoice?: string;
  saveOutcomes?: Record<string, "success" | "failure">;
  weaponMastery?: Dnd5eSrdWeaponMasteryUseInput;
  reactionUse?: boolean;
  rechargeCheck?: number;
  commit?: boolean;
  preview?: boolean;
  prepare?: boolean;
  preparedPreviewKey?: string;
  expectedUpdatedAt?: string;
  controlledCreature?: DndControlledCreatureActionContext;
}

export interface DndControlledCreatureActionContext {
  sceneId?: string;
  token?: DndControlledCreatureCreatePrefill["token"];
}

export interface Dnd5eSrdWeaponMasteryUseInput {
  use: boolean;
  damageDealt?: boolean;
  nickExtraAttack?: boolean;
  secondaryTargetActorId?: string;
  geometryConfirmed?: boolean;
  pushDistanceFeet?: number;
}

export type Dnd5eSrdActionCommitInput = Dnd5eSrdPreparedActionCommitRequest;

export type { Dnd5eSrdRageActionKind };

export interface Dnd5eSrdRageActionPreviewInput {
  kind: Dnd5eSrdRageActionKind;
  expectedUpdatedAt: string;
}

export type Dnd5eSrdPreparedActionPreviewInput = SystemActorRollInput &
  ({ consumeResources: true } | { applyEffect: true } | { weaponMastery: Dnd5eSrdWeaponMasteryUseInput & { use: true } } | { controlledCreature: DndControlledCreatureActionContext }) & {
    prepare: true;
    preparedPreviewKey?: never;
  };

export interface Dnd5eSrdPreparedActionInfo {
  preparedPreviewKey: string;
  sourceActorId: string;
  preparedAt: string;
  request: SystemActorRollInput & {
    commit: true;
    preview: false;
    expectedUpdatedAt: string;
  };
  revisions: {
    actorUpdatedAt: Record<string, string>;
    itemUpdatedAt: Record<string, string>;
    combatUpdatedAt?: string;
  };
  rolledResults: unknown[];
  resolutionHash: string;
}

export interface SystemActorRollResult {
  status?: "ready";
  roll?: DiceRoll;
  rolls?: DiceRoll[] | Array<Record<string, unknown>>;
  chat?: ChatMessage;
  chatMessages?: ChatMessage[];
  quickRoll?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  effect?: Record<string, unknown>;
  effects?: Array<Record<string, unknown>>;
  resolution?: Record<string, unknown>;
  controlledCreatureHandoff?: DndControlledCreatureActionHandoff;
  actor: Actor;
  updatedActors?: Actor[];
  sheet?: Record<string, unknown>;
  combatAction?: CombatAction;
  preparation?: Dnd5eSrdPreparedActionInfo;
  rulesMutationId?: string;
  undo?: DndRulesMutationUndoDescriptor;
}

export interface Dnd5eSrdHeroicInspirationGrantInput {
  expectedActorUpdatedAt: string;
  recipientActorId?: string;
  expectedRecipientUpdatedAt?: string;
}

export interface Dnd5eSrdHeroicInspirationGrantResult {
  awardedTo: "actor" | "recipient";
  actor: Actor;
  recipient?: Actor;
}

export interface Dnd5eSrdHeroicInspirationRerollInput {
  originalRollId: string;
  selectedTermIndex: number;
  selectedResultIndex: number;
  expectedActorUpdatedAt: string;
}

export interface Dnd5eSrdHeroicInspirationRerollResult {
  actor: Actor;
  originalRoll: DiceRoll;
  reroll: DiceRoll;
  chat: ChatMessage;
  mustUseNewRoll: true;
}

export interface SystemActorConditionApplyInput {
  conditionId: string;
  expectedUpdatedAt: string;
  level?: number;
  overrideReason?: string;
}

export interface SystemActorConditionRemoveInput {
  expectedUpdatedAt: string;
}

export interface SystemActorConditionMutationResult {
  actor: Actor;
  entry?: Record<string, unknown>;
  sheet?: Record<string, unknown>;
}

export interface Dnd5eSrdAttunementInput {
  itemId: string;
  attuned: boolean;
  expectedUpdatedAt: string;
  overrideReason?: string;
  breakCurse?: boolean;
}

export interface Dnd5eSrdAttunementResult {
  actor: Actor;
  item: Item;
  attunement?: Record<string, unknown>;
  prerequisite?: Record<string, unknown>;
  sheet?: Record<string, unknown>;
}

export type Dnd5eSrdConcentrationEndInput =
  | { prepare: true; reason?: string }
  | {
      preparedPreviewKey: string;
      expectedActorUpdatedAt: Record<string, string>;
      expectedCombatUpdatedAt: Record<string, string>;
      reason?: string;
    };

export interface Dnd5eSrdConcentrationEndResult {
  actor: Actor;
  concentrationEnded: true;
  status?: "ready";
  review?: Record<string, unknown>;
  preparation?: {
    preparedPreviewKey: string;
    actorId: string;
    request: { reason: string };
    revisions: {
      actorUpdatedAt: Record<string, string>;
      combatUpdatedAt: Record<string, string>;
    };
    resolutionHash: string;
  };
  updatedActors?: Actor[];
  updatedCombats?: Combat[];
  rulesMutationId?: string;
  undo?: DndRulesMutationUndoDescriptor;
}

type Dnd5eSrdAdvancementPreviewInput = {
  operation: "advancement";
  optionId?: string;
  className?: string;
  subclassId?: string;
  weaponMasteryChoices?: string[];
  featId?: string;
  hitPointMode?: "fixed" | "roll";
  hitPointRoll?: number;
  abilityChoices?: Record<string, number>;
};

type Dnd5eSrdRestRulesPreviewInput = {
  operation: "rest";
  restType: "short" | "long";
  hitDice?: Array<{ className?: string; roll?: number }>;
  arcaneRecovery?: Record<string, number>;
};

export interface Dnd5eSrdTypedDamageRulesPreviewInput {
  operation: "typed-damage";
  amount?: number;
  formula?: string;
  damageType: string | string[];
  /** Marks the reviewed damage as a critical hit for the 0-HP Death Save rule. */
  criticalHit?: boolean;
  /** Additional targets; the actor in the route is always included. */
  targetActorIds?: string[];
  /** Optional per-target reviewed amounts, used for save-for-half and similar all-or-none batches. */
  targetDamages?: Array<{
    actorId: string;
    amount: number;
    damageType?: string | string[];
  }>;
}

export type Dnd5eSrdUnpreparedRulesPreviewInput =
  | (Dnd5eSrdAdvancementPreviewInput & { prepare?: false })
  | (Dnd5eSrdRestRulesPreviewInput & { prepare?: false })
  | (Dnd5eSrdTypedDamageRulesPreviewInput & { prepare?: false });

export type Dnd5eSrdPreparedRulesPreviewInput =
  | (Dnd5eSrdAdvancementPreviewInput & { prepare: true })
  | (Dnd5eSrdRestRulesPreviewInput & { prepare: true })
  | (Dnd5eSrdTypedDamageRulesPreviewInput & { prepare: true });

export type Dnd5eSrdRulesPreviewInput =
  Dnd5eSrdUnpreparedRulesPreviewInput | Dnd5eSrdPreparedRulesPreviewInput;

export interface Dnd5eSrdValidationReportInfo {
  entityKind: "actor" | "item";
  entityId: string;
  systemId: string;
  rulesVersion: string;
  schemaVersion: string;
  valid: boolean;
  issues: Array<{
    path: string;
    severity: "error" | "warning";
    code: string;
    message: string;
  }>;
}

export interface Dnd5eSrdRepairPatchInfo {
  operation: "add" | "remove" | "replace";
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface Dnd5eSrdRepairCandidateInfo extends Dnd5eSrdRepairPatchInfo {
  id: string;
  entityKind: "actor" | "item";
  entityId: string;
  confidence: "deterministic";
  application: "confirmation_required";
  issue: Dnd5eSrdValidationReportInfo["issues"][number];
  rationale: string;
  inverse: Dnd5eSrdRepairPatchInfo;
  source: {
    systemId: string;
    rulesVersion: string;
    schemaVersion: string;
    previewVersion: string;
  };
}

export interface Dnd5eSrdRepairPreviewInfo {
  previewVersion: string;
  entityKind: "actor" | "item";
  entityId: string;
  status: "no_changes" | "changes_available";
  readOnly: true;
  candidates: Dnd5eSrdRepairCandidateInfo[];
  manualIssues: Dnd5eSrdValidationReportInfo["issues"];
  proposedEntity?: Record<string, unknown>;
}

export interface Dnd5eSrdRulesValidationResult {
  actor: Dnd5eSrdValidationReportInfo;
  items: Dnd5eSrdValidationReportInfo[];
  repairPreview: {
    actor: Dnd5eSrdRepairPreviewInfo;
    items: Dnd5eSrdRepairPreviewInfo[];
  };
}

export interface Dnd5eSrdRulesPreviewResult {
  previewVersion: string;
  rulesVersion: string;
  actorSchemaVersion: string;
  itemSchemaVersion: string;
  operation: "advancement" | "rest" | "typed-damage";
  actorId: string;
  status: "ready" | "blocked";
  blockers: Array<{ path: string; code: string; message: string }>;
  serverRolls: Array<{
    id: string;
    path: string;
    formula: string;
    reason: string;
  }>;
  validation: {
    actor: Dnd5eSrdValidationReportInfo;
    items: Dnd5eSrdValidationReportInfo[];
  };
  changes: Array<{
    path: string;
    operation: "add" | "remove" | "replace";
    before?: unknown;
    after?: unknown;
    source: {
      systemId: string;
      rulesVersion: string;
      schemaVersion: string;
      rule: "advancement" | "rest" | "typed-damage";
    };
  }>;
  proposedData?: Record<string, unknown>;
  details?: Record<string, unknown>;
  batch?: {
    targets: Array<{
      actorId: string;
      actorName: string;
      preview: Omit<
        Dnd5eSrdRulesPreviewResult,
        "batch" | "draft" | "preparation"
      >;
    }>;
  };
  draft?: {
    pendingAdvancement: Dnd5eSrdPendingAdvancement;
  };
  preparation?: {
    preparedPreviewKey: string;
    /** Deprecated server alias retained while older consumers migrate. */
    idempotencyKey?: string;
    actorUpdatedAt: string | Record<string, string>;
    itemUpdatedAt?: Record<string, string>;
    combatId?: string;
    combatUpdatedAt?: string;
    request: Record<string, unknown>;
    pendingAdvancement?: Dnd5eSrdPendingAdvancement;
    advancementRoll?: Record<string, unknown>;
    damageRoll?: Record<string, unknown>;
    resolutionHash?: string;
  };
}

export type OrganizationMemberInfo = OrganizationMember & {
  user: Pick<User, "id" | "displayName" | "email">;
};
export type OrganizationWorkspaceInfo = OrganizationWorkspace & {
  role: "owner" | "admin" | "member";
  memberCount: number;
  campaignCount: number;
};

export type ApiClientRouteStatus = "supported" | "excluded";

export interface ApiClientRouteConformanceEntry {
  method: string;
  path: string;
  status: ApiClientRouteStatus;
  clientMethod?: string;
  reason?: string;
}

export const apiClientExcludedRoutePatterns = [
  {
    prefix: "/api/v1/admin/",
    reason:
      "server-admin operations are intentionally excluded from the reusable public client surface",
  },
  {
    prefix: "/api/v1/scim/",
    reason:
      "SCIM provisioning is an identity-provider integration surface, not reusable campaign client API",
  },
  {
    path: routes.openApi,
    reason:
      "OpenAPI contract discovery is consumed at build/test time rather than wrapped as domain behavior",
  },
  {
    path: openTabletopRealtimePath,
    reason: "Realtime uses websocket helpers instead of REST fetch wrappers",
  },
  {
    path: "/api/v1/assets/{assetId}/blob",
    reason:
      "Binary asset delivery is intentionally fetched directly from signed URLs or browser media elements",
  },
  {
    path: "/api/v1/agent/board-captures/{captureHandle}",
    reason:
      "Short-lived PNG board captures are fetched directly from signed URLs or browser image elements",
  },
] as const;

export class OpenTabletopClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly options: OpenTabletopClientOptions = {},
  ) {
    this.baseUrl = normalizeClientBaseUrl(baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async health(): Promise<{ ok: boolean; version: string; service: string }> {
    return this.get(routes.health);
  }

  async operationalRetentionDiagnostics(): Promise<OperationalRetentionDiagnostics> {
    return this.get(routes.adminRetentionOperations);
  }

  async previewOperationalRetention(input: Omit<OperationalRetentionRequest, "dryRun" | "targetSetHash" | "reason">, idempotencyKey: string): Promise<OperationalRetentionPlan> {
    return this.post(routes.adminRetentionPrune, { ...input, dryRun: true }, { "Idempotency-Key": idempotencyKey });
  }

  async pruneOperationalRetention(input: OperationalRetentionRequest & { targetSetHash: string; reason: string }, idempotencyKey: string): Promise<OperationalRetentionPlan> {
    return this.post(routes.adminRetentionPrune, { ...input, dryRun: false }, { "Idempotency-Key": idempotencyKey });
  }

  async login(input: {
    userId?: string;
    email?: string;
    password?: string;
    mfaCode?: string;
    recoveryCode?: string;
  }): Promise<SessionLoginInfo> {
    return this.post(routes.login, input);
  }

  async register(input: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<SessionLoginInfo> {
    return this.post(routes.register, input);
  }

  async logout(): Promise<{ ok: true }> {
    return this.post(routes.logout, {});
  }

  async session(): Promise<SessionInfo> {
    return this.get(routes.session);
  }

  async profile(): Promise<{ user: User }> {
    return this.get(routes.profile);
  }

  async updateProfile(
    input: UserProfilePatchInput,
    idempotencyKey: string,
  ): Promise<{ user: User }> {
    return this.patch(routes.profile, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async requestPasswordReset(input: {
    email: string;
    returnTo?: string;
  }): Promise<{ ok: true; resetToken?: string }> {
    return this.post(routes.passwordResetRequest, input);
  }

  async confirmPasswordReset(input: {
    token: string;
    password: string;
  }): Promise<SessionLoginInfo> {
    return this.post(routes.passwordResetConfirm, input);
  }

  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<SessionLoginInfo> {
    return this.post(routes.passwordChange, input);
  }

  async mfaStatus(): Promise<unknown> {
    return this.get(routes.mfaStatus);
  }

  async enrollTotpMfa(input: { currentPassword: string }): Promise<unknown> {
    return this.post(routes.mfaTotpEnroll, input);
  }

  async confirmTotpMfa(input: { code: string }): Promise<unknown> {
    return this.post(routes.mfaTotpConfirm, input);
  }

  async disableTotpMfa(input: {
    currentPassword?: string;
    mfaCode?: string;
    recoveryCode?: string;
  }): Promise<unknown> {
    return this.delete(routes.mfaTotpDisable, input);
  }

  async sessions(): Promise<PublicSession[]> {
    return this.get(routes.authSessions);
  }

  async deleteSession(sessionId: string): Promise<UserSession> {
    return this.delete(routes.authSession(sessionId));
  }

  async oidcConfig(): Promise<unknown> {
    return this.get(routes.oidcConfig);
  }

  async startOidc(input: { returnTo?: string } = {}): Promise<unknown> {
    return this.post(routes.oidcStart, input);
  }

  async startOidcRedirect(returnTo?: string): Promise<unknown> {
    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return this.get(`${routes.oidcStart}${query}`);
  }

  async bootstrapStatus(): Promise<BootstrapStatus> {
    return this.get(routes.bootstrap);
  }

  async bootstrapOwner(input: {
    email: string;
    displayName: string;
    password: string;
    campaignName: string;
    campaignDescription?: string;
    defaultSystemId?: string;
  }): Promise<BootstrapOwnerInfo> {
    return this.post(routes.bootstrap, input);
  }

  realtimeUrl(
    campaignId: string,
    options: Pick<OpenTabletopRealtimeOptions, "token"> = {},
  ): string {
    const url = new URL(`${this.baseUrl}${openTabletopRealtimePath}`);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    url.searchParams.set("campaignId", campaignId);
    return url.toString();
  }

  connectRealtime(
    campaignId: string,
    options: OpenTabletopRealtimeOptions = {},
  ): WebSocket {
    const WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
    if (!WebSocketCtor)
      throw new Error(
        "WebSocket is not available; pass a WebSocket constructor in OpenTabletopRealtimeOptions.",
      );
    return new WebSocketCtor(
      this.realtimeUrl(campaignId, options),
      realtimeProtocols(options.protocols, options.token ?? this.options.token),
    );
  }

  parseRealtimeMessage<TEvent extends EngineEvent = EngineEvent>(
    message: string | MessageEvent<string>,
  ): TEvent {
    const data = typeof message === "string" ? message : message.data;
    return JSON.parse(data) as TEvent;
  }

  async organizations(): Promise<OrganizationWorkspaceInfo[]> {
    return this.get(routes.organizations);
  }

  async createOrganization(
    input: Partial<OrganizationWorkspace> & { name: string },
    idempotencyKey: string,
  ): Promise<{
    organization: OrganizationWorkspace;
    session: PublicSession;
    organizations: OrganizationWorkspaceInfo[];
  }> {
    return this.post(routes.organizations, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async switchOrganization(organizationId: string): Promise<{
    organization: OrganizationWorkspace;
    session: PublicSession;
    organizations: OrganizationWorkspaceInfo[];
  }> {
    return this.patch(routes.organizationSession, { organizationId });
  }

  async workspaceDefaults(): Promise<OrganizationWorkspace> {
    return this.get(routes.organizationWorkspaceDefaults);
  }

  async updateWorkspaceDefaults(
    input: Partial<OrganizationWorkspace> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<OrganizationWorkspace> {
    return this.patch(routes.organizationWorkspaceDefaults, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async organizationMembers(): Promise<OrganizationMemberInfo[]> {
    return this.get(routes.organizationMembers);
  }

  async addOrganizationMember(
    input: {
      userId?: string;
      email?: string;
      role: "admin" | "member";
      expectedOrganizationUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<OrganizationMemberInfo> {
    return this.post(routes.organizationMembers, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateOrganizationMember(
    memberId: string,
    input: { role: "admin" | "member"; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<OrganizationMemberInfo> {
    return this.patch(routes.organizationMember(memberId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async removeOrganizationMember(
    memberId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<{
    removed: boolean;
    memberId: string;
    userId: string;
    removedCampaignMemberships: number;
  }> {
    return this.delete(
      `${routes.organizationMember(memberId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async organizationInvites(): Promise<OrganizationInviteInfo[]> {
    return this.get(routes.organizationInvites);
  }

  async createOrganizationInvite(
    input: {
      campaignId: string;
      email?: string;
      role?: string;
      expiresInDays?: number;
      expectedCampaignUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<CampaignInviteCreateResult> {
    return this.post(routes.organizationInvites, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async campaigns(): Promise<Campaign[]> {
    return this.get(routes.campaigns);
  }

  async createCampaign(
    input: CampaignCreateInput,
    idempotencyKey: string,
  ): Promise<Campaign> {
    return this.post(routes.campaigns, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async campaign(campaignId: string): Promise<Campaign> {
    return this.get(routes.campaign(campaignId));
  }

  async updateCampaign(
    campaignId: string,
    input: CampaignUpdateInput,
    idempotencyKey: string,
  ): Promise<Campaign> {
    return this.patch(routes.campaign(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async characterTransfers(campaignId: string): Promise<CharacterTransfer[]> {
    return this.get(routes.characterTransfers(campaignId));
  }

  async createCharacterTransfer(
    campaignId: string,
    actorId: string,
    input: CharacterTransferCreateInput,
    idempotencyKey: string,
  ): Promise<{ transfer: CharacterTransfer }> {
    return this.post(
      routes.characterTransferCreate(campaignId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async acceptCharacterTransfer(
    campaignId: string,
    transferId: string,
    input: CharacterTransferResolutionInput,
    idempotencyKey: string,
  ): Promise<CharacterTransferResolutionResult> {
    return this.post(
      routes.characterTransferAccept(campaignId, transferId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async declineCharacterTransfer(
    campaignId: string,
    transferId: string,
    input: CharacterTransferResolutionInput,
    idempotencyKey: string,
  ): Promise<CharacterTransferResolutionResult> {
    return this.post(
      routes.characterTransferDecline(campaignId, transferId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async cancelCharacterTransfer(
    campaignId: string,
    transferId: string,
    input: CharacterTransferResolutionInput,
    idempotencyKey: string,
  ): Promise<CharacterTransferResolutionResult> {
    return this.post(
      routes.characterTransferCancel(campaignId, transferId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async archiveCampaign(
    campaignId: string,
    input: { reason?: string; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Campaign> {
    return this.post(routes.campaignArchive(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async restoreCampaign(
    campaignId: string,
    input: { reason?: string; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Campaign> {
    return this.post(routes.campaignRestore(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async transferCampaignOwnership(
    campaignId: string,
    input: CampaignOwnershipTransferInput,
    idempotencyKey: string,
  ): Promise<CampaignOwnershipTransferResult> {
    return this.post(routes.campaignOwnershipTransfer(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async duplicateCampaign(
    campaignId: string,
    input: { expectedUpdatedAt: string; name?: string },
    idempotencyKey: string,
  ): Promise<{
    campaign: Campaign;
    counts: Record<string, number>;
    assetFiles: number;
  }> {
    return this.post(routes.campaignDuplicate(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteCampaign(
    campaignId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Campaign> {
    return this.delete(
      `${routes.campaign(campaignId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async campaignInvites(campaignId: string): Promise<CampaignInviteInfo[]> {
    return this.get(routes.campaignInvites(campaignId));
  }

  async campaignMembers(campaignId: string): Promise<CampaignSnapshotMember[]> {
    return this.get(routes.campaignMembers(campaignId));
  }

  async campaignPresence(campaignId: string): Promise<CampaignPresenceResult> {
    return this.get(routes.campaignPresence(campaignId));
  }

  async campaignWebhooks(
    campaignId: string,
  ): Promise<CampaignWebhookListResult> {
    return this.get(routes.campaignWebhooks(campaignId));
  }

  async createCampaignWebhook(
    campaignId: string,
    input: {
      name: string;
      url: string;
      eventTypes: CampaignWebhookEventType[];
      enabled?: boolean;
      expectedCampaignUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<CampaignWebhookSecretResult> {
    return this.post(routes.campaignWebhooks(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateCampaignWebhook(
    campaignId: string,
    webhookId: string,
    input: Partial<
      Pick<CampaignWebhookInfo, "name" | "url" | "eventTypes" | "enabled">
    > & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<CampaignWebhookInfo> {
    return this.patch(routes.campaignWebhook(campaignId, webhookId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async disableCampaignWebhook(
    campaignId: string,
    webhookId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignWebhookInfo> {
    return this.post(
      routes.campaignWebhookDisable(campaignId, webhookId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteCampaignWebhook(
    campaignId: string,
    webhookId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<{ webhook: CampaignWebhookInfo; deleted: true }> {
    return this.delete(
      routes.campaignWebhook(campaignId, webhookId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async rotateCampaignWebhookSecret(
    campaignId: string,
    webhookId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignWebhookSecretResult> {
    return this.post(
      routes.campaignWebhookRotateSecret(campaignId, webhookId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async campaignWebhookDeliveries(
    campaignId: string,
    webhookId: string,
    limit = 50,
  ): Promise<CampaignWebhookDeliveryInfo[]> {
    return this.get(
      `${routes.campaignWebhookDeliveries(campaignId, webhookId)}?limit=${encodeURIComponent(String(limit))}`,
    );
  }

  async testCampaignWebhook(
    campaignId: string,
    webhookId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignWebhookDeliveryInfo> {
    return this.post(
      routes.campaignWebhookTest(campaignId, webhookId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async retryCampaignWebhookDelivery(
    campaignId: string,
    webhookId: string,
    deliveryId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignWebhookDeliveryInfo> {
    return this.post(
      routes.campaignWebhookRetry(campaignId, webhookId, deliveryId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async updateCampaignMember(
    campaignId: string,
    memberId: string,
    input: {
      role: "gm" | "assistant_gm" | "player" | "observer";
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<CampaignSnapshotMember> {
    return this.patch(routes.campaignMember(campaignId, memberId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async removeCampaignMember(
    campaignId: string,
    memberId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignSnapshotMember> {
    return this.delete(
      `${routes.campaignMember(campaignId, memberId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async campaignSessions(campaignId: string): Promise<CampaignSession[]> {
    return this.get(routes.campaignSessions(campaignId));
  }

  async createCampaignSession(
    campaignId: string,
    input: Partial<
      Pick<
        CampaignSession,
        | "title"
        | "agenda"
        | "notes"
        | "scheduledFor"
        | "sceneIds"
        | "encounterIds"
      >
    >,
    idempotencyKey: string,
  ): Promise<CampaignSession> {
    return this.post(routes.campaignSessions(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async campaignSession(sessionId: string): Promise<CampaignSession> {
    return this.get(routes.campaignSession(sessionId));
  }

  async updateCampaignSession(
    sessionId: string,
    input: Partial<
      Pick<
        CampaignSession,
        | "title"
        | "agenda"
        | "notes"
        | "scheduledFor"
        | "sceneIds"
        | "encounterIds"
      >
    > & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<CampaignSession> {
    return this.patch(routes.campaignSession(sessionId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async startCampaignSession(
    sessionId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
    activateSceneId?: string,
  ): Promise<CampaignSession> {
    return this.post(
      routes.campaignSessionStart(sessionId),
      { expectedUpdatedAt, ...(activateSceneId ? { activateSceneId } : {}) },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async completeCampaignSession(
    sessionId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
    notes?: string,
  ): Promise<CampaignSession> {
    return this.post(
      routes.campaignSessionComplete(sessionId),
      { expectedUpdatedAt, ...(notes === undefined ? {} : { notes }) },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteCampaignSession(
    sessionId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignSession> {
    return this.delete(
      `${routes.campaignSession(sessionId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async searchCampaign(
    campaignId: string,
    query: { q: string; types?: string[]; worldId?: string; limit?: number },
  ): Promise<CampaignSearchResult[]> {
    const params = new URLSearchParams({ q: query.q });
    if (query.types?.length) params.set("types", query.types.join(","));
    if (query.worldId) params.set("worldId", query.worldId);
    if (query.limit) params.set("limit", String(query.limit));
    return this.get(
      `${routes.campaignSearch(campaignId)}?${params.toString()}`,
    );
  }

  async createCampaignInvite(
    campaignId: string,
    input: { email?: string; role?: string; expiresInDays?: number },
    idempotencyKey: string,
  ): Promise<CampaignInviteCreateResult> {
    return this.post(routes.campaignInvites(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async revokeCampaignInvite(
    inviteId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignInviteInfo> {
    return this.post(
      routes.revokeInvite(inviteId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async acceptInvite(
    input: {
      token: string;
      userId?: string;
      email?: string;
      displayName?: string;
      password?: string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.post(routes.acceptInvite, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async previewInvite(token: string): Promise<CampaignInvitePreviewResult> {
    return this.get(
      `${routes.invitePreview}?${new URLSearchParams({ token })}`,
    );
  }

  async scenes(campaignId: string): Promise<Scene[]> {
    return this.get(routes.scenes(campaignId));
  }

  async createScene(
    campaignId: string,
    input: Partial<Scene> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.scenes(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async duplicateScenes(
    campaignId: string,
    input: SceneDuplicationRequest,
    idempotencyKey: string,
  ): Promise<SceneDuplicationResult> {
    return this.post(routes.sceneDuplications(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async scene(sceneId: string): Promise<Scene> {
    return this.get(routes.scene(sceneId));
  }

  async sceneDelegations(sceneId: string): Promise<SceneDelegationListResult> {
    return this.get(routes.sceneDelegations(sceneId));
  }

  async updateSceneDelegation(
    sceneId: string,
    userId: string,
    permissions: Array<"scene.read" | "scene.update">,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<SceneDelegation & { sceneId: string; updatedAt: string }> {
    return this.patch(
      routes.sceneDelegation(sceneId, userId),
      { permissions, expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async sceneVision(
    sceneId: string,
    options: SceneVisionOptions = {},
  ): Promise<VisionSnapshot> {
    const path = routes.sceneVision(sceneId);
    return this.get(
      options.previewUserId
        ? `${path}?previewUserId=${encodeURIComponent(options.previewUserId)}`
        : path,
    );
  }

  async sampleSceneVision(
    sceneId: string,
    point: { x: number; y: number },
  ): Promise<VisionPointSample> {
    return this.get(
      `${routes.sceneVisionSample(sceneId)}?x=${encodeURIComponent(String(point.x))}&y=${encodeURIComponent(String(point.y))}`,
    );
  }

  async measureScenePath(
    sceneId: string,
    points: VisionPoint[],
  ): Promise<ScenePathMeasurement> {
    return this.post(routes.scenePathMeasurement(sceneId), { points });
  }

  async createDifficultTerrain(
    sceneId: string,
    input: Pick<DifficultTerrainRegion, "points"> &
      Partial<Pick<DifficultTerrainRegion, "label" | "color">> & {
        expectedUpdatedAt: string;
      },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneDifficultTerrain(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDifficultTerrain(
    sceneId: string,
    regionId: string,
    input: Partial<
      Pick<DifficultTerrainRegion, "label" | "points" | "color">
    > & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(
      routes.sceneDifficultTerrainRegion(sceneId, regionId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteDifficultTerrain(
    sceneId: string,
    regionId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    const query = new URLSearchParams({ expectedUpdatedAt });
    return this.delete(
      `${routes.sceneDifficultTerrainRegion(sceneId, regionId)}?${query.toString()}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async setSceneCoverOverride(
    sceneId: string,
    input: {
      sourceTokenId: string;
      targetTokenId: string;
      level: CoverLevel;
      note?: string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneCoverOverrides(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteSceneCoverOverride(
    sceneId: string,
    overrideId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    const query = new URLSearchParams({ expectedUpdatedAt });
    return this.delete(
      `${routes.sceneCoverOverride(sceneId, overrideId)}?${query.toString()}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async sceneRenderingDiagnostics(sceneId: string): Promise<unknown> {
    return this.get(routes.sceneRenderingDiagnostics(sceneId));
  }

  async updateScene(
    sceneId: string,
    input: Omit<Partial<Scene>, "worldId"> & {
      worldId?: string | null;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(routes.scene(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteScene(
    sceneId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.delete(
      `${routes.scene(sceneId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async createSceneAnnotation(
    sceneId: string,
    input: {
      kind: SceneAnnotationKind;
      points: VisionPoint[];
      label?: string;
      color?: string;
      radius?: number;
      expiresInSeconds?: number;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneAnnotations(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateSceneAnnotation(
    sceneId: string,
    annotationId: string,
    input: Partial<
      Pick<
        SceneAnnotation,
        | "label"
        | "color"
        | "layer"
        | "groupId"
        | "groupLabel"
        | "sortOrder"
        | "templateShape"
        | "templateSaveAbility"
        | "templateSaveDc"
        | "templateDamageFormula"
        | "templateDamageType"
        | "snapToGrid"
        | "points"
        | "radius"
      >
    > & { expiresInSeconds?: number; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(routes.sceneAnnotation(sceneId, annotationId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteSceneAnnotation(
    sceneId: string,
    annotationId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.delete(
      `${routes.sceneAnnotation(sceneId, annotationId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async fogPresets(campaignId: string): Promise<FogPreset[]> {
    return this.get(routes.fogPresets(campaignId));
  }

  async createFogPreset(
    campaignId: string,
    input: {
      name?: string;
      description?: string;
      sceneId: string;
      expectedSceneUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<FogPreset> {
    return this.post(routes.fogPresets(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteFogPreset(
    campaignId: string,
    presetId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<FogPreset> {
    return this.delete(
      `${routes.fogPreset(campaignId, presetId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async applyFogPreset(
    sceneId: string,
    input: {
      presetId: string;
      mode?: "append" | "replace";
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneFogApplyPreset(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async createFogRegion(
    sceneId: string,
    input: Partial<FogRegion> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneFog(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateFogRegion(
    sceneId: string,
    fogId: string,
    input: Partial<FogRegion> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(routes.sceneFogRegion(sceneId, fogId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteFogRegion(
    sceneId: string,
    fogId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.delete(
      `${routes.sceneFogRegion(sceneId, fogId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async fogHistory(sceneId: string): Promise<unknown> {
    return this.get(routes.sceneFogHistory(sceneId));
  }

  async undoFog(
    sceneId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(
      routes.sceneFogUndo(sceneId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async sceneEdits(sceneId: string): Promise<SceneEditHistory> {
    return this.get(routes.sceneEdits(sceneId));
  }

  async undoScene(
    sceneId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(
      routes.sceneUndo(sceneId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async createWall(
    sceneId: string,
    input: Partial<Wall> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneWalls(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateWall(
    sceneId: string,
    wallId: string,
    input: Partial<Wall> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(routes.sceneWall(sceneId, wallId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteWall(
    sceneId: string,
    wallId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.delete(
      `${routes.sceneWall(sceneId, wallId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async createLight(
    sceneId: string,
    input: Partial<LightSource> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.post(routes.sceneLights(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateLight(
    sceneId: string,
    lightId: string,
    input: Partial<LightSource> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.patch(routes.sceneLight(sceneId, lightId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteLight(
    sceneId: string,
    lightId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Scene> {
    return this.delete(
      `${routes.sceneLight(sceneId, lightId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async applyAiEditLayerToTarget(
    sceneId: string,
  ): Promise<AiEditLayerApplyResult> {
    return this.post(routes.sceneAiEditsApply(sceneId), {});
  }

  async assets(campaignId: string): Promise<MapAsset[]> {
    return this.get(routes.assets(campaignId));
  }

  async assetStorage(campaignId: string): Promise<unknown> {
    return this.get(routes.assetStorage(campaignId));
  }

  async createAsset(
    campaignId: string,
    input: Partial<MapAsset>,
    idempotencyKey: string,
  ): Promise<MapAsset> {
    return this.post(routes.assets(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async uploadAsset(
    campaignId: string,
    body: BodyInit,
    options: {
      contentType: string;
      fileName?: string;
      folder?: string;
      tags?: string[];
      idempotencyKey: string;
      sceneId?: string;
      setAsBackground?: boolean;
      expectedSceneUpdatedAt?: string;
    },
  ): Promise<AssetUploadResponse> {
    const headers: Record<string, string> = {
      "content-type": options.contentType,
    };
    if (options.fileName) headers["x-asset-name"] = options.fileName;
    if (options.folder) headers["x-asset-folder"] = options.folder;
    if (options.tags?.length) headers["x-asset-tags"] = options.tags.join(",");
    if (
      options.setAsBackground &&
      (!options.sceneId || !options.expectedSceneUpdatedAt)
    )
      throw new Error(
        "Background asset uploads require sceneId and expectedSceneUpdatedAt",
      );
    headers["Idempotency-Key"] = options.idempotencyKey;
    const query = new URLSearchParams();
    if (options.sceneId) query.set("sceneId", options.sceneId);
    if (options.setAsBackground) query.set("setAsBackground", "true");
    if (options.expectedSceneUpdatedAt)
      query.set("expectedSceneUpdatedAt", options.expectedSceneUpdatedAt);
    const path = `${routes.uploadAsset(campaignId)}${query.size > 0 ? `?${query}` : ""}`;
    return this.requestRaw("POST", path, body, headers);
  }

  async updateAsset(
    assetId: string,
    input: {
      name?: string;
      folder?: string | null;
      tags?: string[] | string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<MapAsset> {
    return this.patch(routes.asset(assetId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateAssetLifecycle(
    assetId: string,
    input: {
      status: "active" | "archived" | "deleted";
      expiresAt?: string | null;
      reason?: string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<MapAsset> {
    return this.patch(routes.assetLifecycle(assetId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async assetDeliveryUrl(
    assetId: string,
    input: {
      expiresInSeconds?: number;
      disposition?: "inline" | "attachment";
    } = {},
  ): Promise<{ url: string; expiresAt: string }> {
    return this.post(routes.assetDeliveryUrl(assetId), input);
  }

  async tokens(sceneId: string): Promise<Token[]> {
    return this.get(routes.tokens(sceneId));
  }

  async createToken(
    sceneId: string,
    input: Partial<Token> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Token> {
    return this.post(routes.tokens(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateToken(
    tokenId: string,
    input: TokenPatchInput & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Token> {
    return this.patch(routes.token(tokenId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async targetToken(
    tokenId: string,
    targeted: boolean,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Token> {
    return this.post(
      routes.tokenTarget(tokenId),
      { targeted, expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteToken(
    tokenId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Token> {
    return this.delete(
      `${routes.token(tokenId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async actors(campaignId: string): Promise<Actor[]> {
    return this.get(routes.actors(campaignId));
  }

  async createActor(
    campaignId: string,
    input: Partial<Actor> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Actor> {
    return this.post(routes.actors(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async actor(actorId: string): Promise<Actor> {
    return this.get(routes.actor(actorId));
  }

  async updateActor(
    actorId: string,
    input: Omit<Partial<Actor>, "worldId"> & {
      worldId?: string | null;
      expectedUpdatedAt: string;
      manualOverrideReason?: string;
    },
    idempotencyKey: string,
  ): Promise<Actor> {
    return this.patch(routes.actor(actorId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteActor(
    actorId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Actor> {
    return this.delete(
      `${routes.actor(actorId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async items(campaignId: string): Promise<Item[]> {
    return this.get(routes.items(campaignId));
  }

  async createItem(
    campaignId: string,
    input: Record<string, unknown> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Item> {
    return this.post(routes.items(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async item(itemId: string): Promise<Item> {
    return this.get(routes.item(itemId));
  }

  async updateItem(
    itemId: string,
    input: Omit<Partial<Item>, "worldId" | "actorId"> & {
      worldId?: string | null;
      actorId?: string | null;
      expectedUpdatedAt: string;
      manualOverrideReason?: string;
    },
    idempotencyKey: string,
  ): Promise<Item> {
    return this.patch(routes.item(itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteItem(
    itemId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Item> {
    return this.delete(
      `${routes.item(itemId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async journals(campaignId: string): Promise<JournalEntry[]> {
    return this.get(routes.journals(campaignId));
  }

  async createJournal(
    campaignId: string,
    input: JournalWriteInput,
    options: { idempotencyKey: string },
  ): Promise<JournalEntry> {
    return this.post(routes.journals(campaignId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async journal(entryId: string): Promise<JournalEntry> {
    return this.get(routes.journal(entryId));
  }

  async updateJournal(
    entryId: string,
    input: JournalWriteInput & { expectedUpdatedAt: string },
    options: { idempotencyKey: string },
  ): Promise<JournalEntry> {
    return this.patch(routes.journal(entryId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async journalBacklinks(entryId: string): Promise<JournalBacklinksResponse> {
    return this.get(routes.journalBacklinks(entryId));
  }

  async journalHistory(entryId: string): Promise<JournalHistoryResponse> {
    return this.get(routes.journalHistory(entryId));
  }

  async reviewJournalCanon(
    entryId: string,
    input: {
      status: JournalCanonStatus;
      note?: string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<JournalEntry> {
    return this.post(routes.journalCanonReview(entryId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteJournal(
    entryId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<JournalEntry> {
    const query = new URLSearchParams({ expectedUpdatedAt });
    return this.delete(
      `${routes.journal(entryId)}?${query.toString()}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async handouts(campaignId: string): Promise<Handout[]> {
    return this.get(routes.handouts(campaignId));
  }

  async createHandout(
    campaignId: string,
    input: Partial<Handout> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Handout> {
    return this.post(routes.handouts(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async handout(handoutId: string): Promise<Handout> {
    return this.get(routes.handout(handoutId));
  }

  async updateHandout(
    handoutId: string,
    input: Omit<Partial<Handout>, "worldId"> & {
      worldId?: string | null;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Handout> {
    return this.patch(routes.handout(handoutId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async markHandoutRead(handoutId: string): Promise<Handout> {
    return this.post(routes.handoutRead(handoutId), {});
  }

  async deleteHandout(
    handoutId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Handout> {
    return this.delete(
      `${routes.handout(handoutId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async chat(campaignId: string): Promise<ChatMessage[]> {
    return this.get(
      `${routes.chat}?campaignId=${encodeURIComponent(campaignId)}`,
    );
  }

  async sendChat(
    input: {
      campaignId: string;
      body: string;
      type?: ChatMessage["type"];
      visibility?: ChatMessage["visibility"];
      recipientUserIds?: string[];
      replyToMessageId?: string;
    },
    idempotencyKey: string,
  ): Promise<ChatMessage> {
    return this.post(routes.chat, input, { "Idempotency-Key": idempotencyKey });
  }

  async editChat(
    messageId: string,
    body: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<ChatMessage> {
    return this.patch(
      routes.chatMessage(messageId),
      { body, expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async moderateChat(
    messageId: string,
    moderationStatus: NonNullable<ChatMessage["moderationStatus"]>,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<ChatMessage> {
    return this.patch(
      routes.chatMessageModeration(messageId),
      {
        moderationStatus,
        expectedUpdatedAt,
      },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteChat(
    messageId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<ChatMessage> {
    return this.delete(
      `${routes.chatMessage(messageId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async exportChat(
    campaignId: string,
    options: { format?: "json" } = {},
  ): Promise<{
    campaignId: string;
    exportedAt: string;
    count: number;
    visibilityCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    messages: ChatMessage[];
  }> {
    const query = options.format
      ? `?format=${encodeURIComponent(options.format)}`
      : "";
    return this.get(`${routes.chatExport(campaignId)}${query}`);
  }

  async exportChatNdjson(campaignId: string): Promise<string> {
    return this.getText(`${routes.chatExport(campaignId)}?format=ndjson`);
  }

  async roll(
    input: {
      campaignId: string;
      formula: string;
      visibility?: DiceRoll["visibility"];
      label?: string;
      clientSeed?: string;
    },
    idempotencyKey: string,
  ): Promise<DiceRoll> {
    return this.post(routes.dice, input, { "Idempotency-Key": idempotencyKey });
  }

  async rolls(campaignId: string): Promise<DiceRoll[]> {
    return this.get(routes.campaignRolls(campaignId));
  }

  async verifyRoll(
    campaignId: string,
    rollId: string,
  ): Promise<DiceRollVerification> {
    return this.get(routes.campaignRollVerify(campaignId, rollId));
  }

  async campaignSnapshot(
    campaignId: string,
    sceneId?: string,
    historyLimit?: number,
  ): Promise<CampaignSnapshot> {
    const parameters = new URLSearchParams();
    if (sceneId) parameters.set("sceneId", sceneId);
    if (historyLimit !== undefined)
      parameters.set("historyLimit", String(historyLimit));
    const query = parameters.size > 0 ? `?${parameters.toString()}` : "";
    return this.get(`${routes.campaignSnapshot(campaignId)}${query}`);
  }

  async diceMacros(campaignId: string): Promise<DiceMacro[]> {
    return this.get(routes.diceMacros(campaignId));
  }

  async createDiceMacro(
    campaignId: string,
    input: {
      name: string;
      formula: string;
      visibility?: DiceMacro["visibility"];
    },
    idempotencyKey: string,
  ): Promise<DiceMacro> {
    return this.post(routes.diceMacros(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDiceMacro(
    macroId: string,
    input: Partial<Pick<DiceMacro, "name" | "formula" | "visibility">> & {
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<DiceMacro> {
    return this.patch(routes.diceMacro(macroId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteDiceMacro(
    macroId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<DiceMacro> {
    return this.delete(
      `${routes.diceMacro(macroId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async audioTracks(campaignId: string): Promise<AudioTrack[]> {
    return this.get(routes.campaignAudio(campaignId));
  }

  async createAudioTrack(
    campaignId: string,
    input: {
      name: string;
      url: string;
      kind?: AudioTrack["kind"];
      loop?: boolean;
      volume?: number;
    },
    idempotencyKey: string,
  ): Promise<AudioTrack> {
    return this.post(routes.campaignAudio(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateAudioTrack(
    trackId: string,
    input: Partial<
      Pick<AudioTrack, "name" | "url" | "kind" | "loop" | "volume" | "playing">
    > & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<AudioTrack> {
    return this.patch(routes.audioTrack(trackId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteAudioTrack(
    trackId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<AudioTrack> {
    return this.delete(
      `${routes.audioTrack(trackId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async combats(campaignId: string): Promise<Combat[]> {
    return this.get(routes.combats(campaignId));
  }

  async combatAudit(combatId: string): Promise<AuditLog[]> {
    return this.get(routes.combatAudit(combatId));
  }

  async awardCombatRewards(
    combatId: string,
    input: CombatRewardCreateInput,
    idempotencyKey: string,
  ): Promise<CombatRewardMutationResult> {
    return this.post(routes.combatRewards(combatId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async createCombatEnvironmentMechanic(
    combatId: string,
    input: CombatEnvironmentMechanicWriteInput,
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.post(routes.combatEnvironmentMechanics(combatId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateCombatEnvironmentMechanic(
    combatId: string,
    mechanicId: string,
    input: CombatEnvironmentMechanicWriteInput,
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.patch(
      routes.combatEnvironmentMechanic(combatId, mechanicId),
      input,
      {
        "Idempotency-Key": idempotencyKey,
      },
    );
  }

  async deleteCombatEnvironmentMechanic(
    combatId: string,
    mechanicId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.delete(
      routes.combatEnvironmentMechanic(combatId, mechanicId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async triggerCombatEnvironmentMechanic(
    combatId: string,
    mechanicId: string,
    input: { expectedUpdatedAt: string; optionId?: string; summary?: string },
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.post(
      routes.combatEnvironmentMechanicTrigger(combatId, mechanicId),
      input,
      {
        "Idempotency-Key": idempotencyKey,
      },
    );
  }

  async previewCombatEffectSchedule(
    combatId: string,
    input: CombatEffectSchedulePreviewInput,
    options: MutationRequestOptions = {},
  ): Promise<CombatEffectScheduleEvaluationInfo> {
    if (input.prepare === true && !options.idempotencyKey?.trim()) {
      throw new Error(
        "Prepared scheduled-effect previews require an Idempotency-Key",
      );
    }
    return this.post(
      routes.combatEffectSchedulePreview(combatId),
      input,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    );
  }

  async advanceCombatEffectSchedule(
    combatId: string,
    input: CombatEffectScheduleAdvanceInput,
    options: PreparedMutationRequestOptions | string,
  ): Promise<CombatEffectScheduleAdvanceResult> {
    const idempotencyKey =
      typeof options === "string" ? options : options.idempotencyKey;
    if (!idempotencyKey.trim())
      throw new Error("Applying scheduled effects requires an Idempotency-Key");
    return this.post(routes.combatEffectScheduleAdvance(combatId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async previewDnd5eSpellHelper(
    campaignId: string,
    systemId: string,
    input: Dnd5eSpellHelperPreviewInput,
  ): Promise<Dnd5eSpellHelperPreviewResult> {
    return this.post(
      routes.dnd5eSpellHelperPreview(campaignId, systemId),
      input,
    );
  }

  async startCombat(
    campaignId: string,
    input: Partial<Combat> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.post(routes.combats(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async startReviewedCombat(
    campaignId: string,
    input: ReviewedCombatStartInput & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<ReviewedCombatStartResult> {
    return this.post(routes.combatStart(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateCombat(
    combatId: string,
    input: Partial<Combat> & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.patch(routes.combat(combatId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async rollNpcInitiative(
    combatId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CombatInitiativeRollNpcsResult> {
    return this.post(
      `/api/v1/combats/${encodeURIComponent(combatId)}/initiative/roll-npcs`,
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async updateCombatant(
    combatId: string,
    combatantId: string,
    input: Partial<Combat["combatants"][number]> & {
      syncActorSheet?: boolean;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.patch(routes.combatant(combatId, combatantId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async confirmCombatAction(
    combatId: string,
    actionId: string,
    input: CombatActionConfirmInput,
    options: MutationRequestOptions = {},
  ): Promise<CombatActionMutationResult> {
    if (!input.expectedUpdatedAt?.trim())
      throw new Error(
        "Confirming a prepared combat action requires the reviewed combat revision",
      );
    if (!options.idempotencyKey?.trim())
      throw new Error(
        "Confirming a prepared combat action requires an Idempotency-Key",
      );
    return this.post(routes.combatActionConfirm(combatId, actionId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async rejectCombatAction(
    combatId: string,
    actionId: string,
    input: { reason?: string; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<CombatActionMutationResult> {
    return this.post(routes.combatActionReject(combatId, actionId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async endCombat(
    combatId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Combat> {
    return this.delete(
      `${routes.combat(combatId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async encounters(campaignId: string): Promise<Encounter[]> {
    return this.get(routes.encounters(campaignId));
  }

  async createEncounter(
    campaignId: string,
    input: EncounterCreateInput & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Encounter> {
    return this.post(routes.encounters(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async encounter(encounterId: string): Promise<Encounter> {
    return this.get(routes.encounter(encounterId));
  }

  async updateEncounter(
    encounterId: string,
    input: EncounterUpdateInput & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<Encounter> {
    return this.patch(routes.encounter(encounterId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteEncounter(
    encounterId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<Encounter> {
    return this.delete(
      `${routes.encounter(encounterId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async proposals(campaignId: string): Promise<Proposal[]> {
    return this.get(routes.proposals(campaignId));
  }

  async createProposal(
    campaignId: string,
    input: Partial<
      Pick<Proposal, "title" | "summary" | "changesJson" | "diffJson">
    >,
  ): Promise<Proposal> {
    return this.post(routes.proposals(campaignId), input);
  }

  async approveProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalApprove(proposalId), {});
  }

  async applyProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalApply(proposalId), {});
  }

  async revertProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalRevert(proposalId), {});
  }

  async rejectProposal(proposalId: string): Promise<Proposal> {
    return this.post(routes.proposalReject(proposalId), {});
  }

  async aiPolicy(campaignId: string): Promise<AiEffectivePolicy> {
    return this.get(routes.aiPolicy(campaignId));
  }

  async updateAiPolicy(
    campaignId: string,
    input: AiPolicyUpdateInput,
    options: MutationRequestOptions = {},
  ): Promise<AiEffectivePolicy> {
    if (!options.idempotencyKey)
      throw new Error("AI policy updates require an Idempotency-Key");
    return this.patch(routes.aiPolicy(campaignId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async previewAiPrivacy(
    campaignId: string,
    input: AiPrivacyRequest = {},
  ): Promise<AiPrivacyResult> {
    return this.post(routes.aiPrivacyPreview(campaignId), input);
  }

  async pruneAiPrivacy(
    campaignId: string,
    input: AiPrivacyRequest,
    options: MutationRequestOptions = {},
  ): Promise<AiPrivacyResult> {
    if (!options.idempotencyKey)
      throw new Error("AI privacy pruning requires an Idempotency-Key");
    return this.post(routes.aiPrivacyPrune(campaignId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async aiThreads(campaignId: string): Promise<AiThread[]> {
    return this.get(routes.aiThreads(campaignId));
  }

  async createAiThread(
    campaignId: string,
    input: AiThreadCreateInput,
  ): Promise<AiThread> {
    return this.post(routes.aiThreads(campaignId), input);
  }

  async mcp(input: McpJsonRpcRequest): Promise<McpJsonRpcResponse> {
    return this.post(routes.mcp, input);
  }

  async submitBoardCapture(
    requestId: string,
    input: BoardCaptureSubmitInput,
  ): Promise<BoardCaptureResult> {
    return this.post(routes.agentBoardCaptureSubmit(requestId), input);
  }

  async aiUsage(campaignId: string): Promise<unknown> {
    return this.get(routes.aiUsage(campaignId));
  }

  async aiEvaluations(campaignId: string): Promise<AiEvaluationRun[]> {
    return this.get(routes.aiEvaluations(campaignId));
  }

  async createAiEvaluation(
    campaignId: string,
    input: unknown,
  ): Promise<AiEvaluationRun> {
    return this.post(routes.aiEvaluations(campaignId), input);
  }

  async aiMemory(campaignId: string): Promise<AiMemoryFact[]> {
    return this.get(routes.aiMemory(campaignId));
  }

  async createAiMemory(
    campaignId: string,
    input: Partial<AiMemoryFact>,
  ): Promise<AiMemoryFact> {
    return this.post(routes.aiMemory(campaignId), input);
  }

  async extractAiMemory(
    campaignId: string,
    input: { transcript: string },
  ): Promise<unknown> {
    return this.post(routes.aiMemoryExtract(campaignId), input);
  }

  async approveAiMemory(factId: string): Promise<AiMemoryFact> {
    return this.post(routes.aiMemoryApprove(factId), {});
  }

  async aiMemoryFact(factId: string): Promise<AiMemoryFact> {
    return this.get(routes.aiMemoryFact(factId));
  }

  async updateAiMemory(
    factId: string,
    input: Omit<Partial<AiMemoryFact>, "worldId" | "subject" | "confidence"> & {
      worldId?: string | null;
      subject?: string | null;
      confidence?: number | null;
    },
  ): Promise<AiMemoryFact> {
    return this.patch(routes.aiMemoryFact(factId), input);
  }

  async rejectAiMemory(factId: string): Promise<AiMemoryFact> {
    return this.post(routes.aiMemoryReject(factId), {});
  }

  async deleteAiMemory(factId: string): Promise<AiMemoryFact> {
    return this.delete(routes.aiMemoryFact(factId));
  }

  async aiToolCalls(campaignId: string): Promise<AiToolCall[]> {
    return this.get(routes.aiToolCalls(campaignId));
  }

  async retryAiToolCall(
    campaignId: string,
    toolCallId: string,
    input: { dryRun?: boolean } = {},
  ): Promise<unknown> {
    return this.post(routes.aiToolCallRetry(campaignId, toolCallId), input);
  }

  async aiSessionRecap(
    campaignId: string,
    input: { transcript?: string },
  ): Promise<unknown> {
    return this.post(routes.aiSessionRecap(campaignId), input);
  }

  async aiEncounterDesign(
    campaignId: string,
    input: unknown,
  ): Promise<Proposal> {
    return this.post(routes.aiEncounterDesign(campaignId), input);
  }

  async aiGenerateMapAsset(
    campaignId: string,
    input: {
      prompt: string;
      name?: string;
      sceneId?: string;
      size?: string;
      quality?: string;
      outputFormat?: "png" | "jpeg" | "webp";
    },
  ): Promise<unknown> {
    return this.post(routes.aiGenerateMapAsset(campaignId), input);
  }

  async aiGenerateTokenAsset(
    campaignId: string,
    input: {
      prompt: string;
      name?: string;
      tokenId?: string;
      size?: string;
      quality?: string;
      outputFormat?: "png" | "jpeg" | "webp";
    },
  ): Promise<unknown> {
    return this.post(routes.aiGenerateTokenAsset(campaignId), input);
  }

  async plugins(): Promise<PluginRuntimeInfo[]>;
  async plugins(campaignId: string): Promise<PluginCampaignInfo[]>;
  async plugins(
    campaignId?: string,
  ): Promise<PluginRuntimeInfo[] | PluginCampaignInfo[]> {
    return this.get(
      campaignId ? routes.campaignPlugins(campaignId) : routes.plugins,
    );
  }

  async installPlugin(
    campaignId: string,
    pluginId: string,
    input: {
      permissions?: PermissionName[];
      version?: string;
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<PluginInstallResult> {
    return this.post(
      `${routes.campaignPlugin(campaignId, pluginId)}/install`,
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async registerPlugin(
    input: {
      campaignId?: string;
      packagePath: string;
    },
    idempotencyKey: string,
  ): Promise<PluginRuntimeInfo> {
    return this.post("/api/v1/plugins/install", input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async syncPluginRegistry(
    input: {
      campaignId?: string;
      registryUrl?: string;
      expectedRegistryRevision: string;
    },
    idempotencyKey: string,
  ): Promise<PluginRegistrySyncResult> {
    return this.post(routes.pluginRegistrySync, input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async pluginStorage(
    campaignId: string,
    pluginId: string,
  ): Promise<PluginStorageEntryInfo[]> {
    return this.get(routes.pluginStorage(campaignId, pluginId));
  }

  async pluginStorageEntry(
    campaignId: string,
    pluginId: string,
    key: string,
  ): Promise<PluginStorageEntryInfo> {
    return this.get(routes.pluginStorageEntry(campaignId, pluginId, key));
  }

  async setPluginStorageEntry(
    campaignId: string,
    pluginId: string,
    key: string,
    value: unknown,
    revision:
      { expectedUpdatedAt: string } | { expectedCampaignUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<PluginStorageEntryInfo> {
    return this.put(
      routes.pluginStorageEntry(campaignId, pluginId, key),
      {
        value,
        ...revision,
      },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deletePluginStorageEntry(
    campaignId: string,
    pluginId: string,
    key: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<{ deleted: boolean; key: string }> {
    return this.delete(
      `${routes.pluginStorageEntry(campaignId, pluginId, key)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async runPluginChatCommand(
    campaignId: string,
    pluginId: string,
    input: {
      command: string;
      args?: string;
      sceneId?: string;
      actorId?: string;
      tokenId?: string;
    },
    idempotencyKey: string,
  ): Promise<unknown> {
    return this.post(routes.pluginChatCommand(campaignId, pluginId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async systems(campaignId?: string): Promise<SystemRuntimeInfo[]> {
    return this.get(
      campaignId ? routes.campaignSystems(campaignId) : routes.systems,
    );
  }

  async campaignCompatibility(
    campaignId: string,
  ): Promise<CampaignCompatibilityReport> {
    return this.get(routes.campaignCompatibility(campaignId));
  }

  async installSystem(
    campaignId: string,
    systemId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<SystemActivationResult> {
    return this.post(
      `${routes.campaignSystem(campaignId, systemId)}/install`,
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async registerSystem(
    campaignId: string,
    manifest: SystemManifestData,
    idempotencyKey: string,
  ): Promise<SystemRuntimeInfo> {
    return this.post(
      "/api/v1/systems/install",
      { campaignId, manifest },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async systemCharacterTemplates(
    campaignId: string,
    systemId: string,
  ): Promise<SystemCharacterTemplateInfo[]> {
    return this.get(routes.systemCharacterTemplates(campaignId, systemId));
  }

  async systemCharacterOrigins(
    campaignId: string,
    systemId: string,
  ): Promise<Dnd5eSrdCharacterOriginsInfo> {
    return this.get(routes.systemCharacterOrigins(campaignId, systemId));
  }

  async createSystemCharacter(
    campaignId: string,
    systemId: string,
    input: SystemCharacterCreateInput,
    idempotencyKey: string,
  ): Promise<SystemCharacterCreateResult> {
    return this.post(routes.systemCharacters(campaignId, systemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async createSystemMonster(
    campaignId: string,
    systemId: string,
    input: SystemMonsterCreateInput,
    idempotencyKey: string,
  ): Promise<SystemMonsterCreateResult> {
    return this.post(routes.systemMonsters(campaignId, systemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async placeEncounterMonsters(
    sceneId: string,
    input: EncounterMonsterPlacementBatchInput,
    idempotencyKey: string,
  ): Promise<EncounterMonsterPlacementBatchResult> {
    return this.post(routes.encounterMonsterPlacements(sceneId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async importSystemCharacter(
    campaignId: string,
    systemId: string,
    input: SystemCharacterImportInput,
    idempotencyKey: string,
  ): Promise<SystemCharacterImportResult> {
    return this.post(
      routes.systemCharacterImport(campaignId, systemId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async systemEncounterThreats(
    campaignId: string,
    systemId: string,
  ): Promise<unknown> {
    return this.get(routes.systemEncounterThreats(campaignId, systemId));
  }

  async systemEncounterPlan(
    campaignId: string,
    systemId: string,
    input: SystemEncounterPlanInput,
    options: MutationRequestOptions = {},
  ): Promise<SystemEncounterPlanResult> {
    if (input.createEncounter === true) {
      if (!input.expectedUpdatedAt?.trim())
        throw new Error(
          "Saving an encounter plan requires the reviewed campaign revision",
        );
      if (!options.idempotencyKey?.trim())
        throw new Error("Saving an encounter plan requires an Idempotency-Key");
    }
    return this.post(
      routes.systemEncounterPlan(campaignId, systemId),
      input,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    );
  }

  async systemCompendium(
    campaignId: string,
    systemId: string,
    query: SystemCompendiumQuery = {},
  ): Promise<SystemCompendiumResult> {
    return this.get(routes.systemCompendium(campaignId, systemId, query));
  }

  async dndCustomContent(
    campaignId: string,
  ): Promise<DndCustomContentResult[]> {
    return this.get(routes.dndCustomContent(campaignId));
  }

  async previewDndCustomContent(
    campaignId: string,
    input: DndCustomContentDraft,
  ): Promise<DndCustomContentPreviewResult> {
    return this.post(routes.dndCustomContentPreview(campaignId), input);
  }

  async createDndCustomContent(
    campaignId: string,
    input: DndCustomContentDraft & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<DndCustomContentResult> {
    return this.post(routes.dndCustomContent(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDndCustomContent(
    campaignId: string,
    itemId: string,
    input: DndCustomContentDraft & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<DndCustomContentResult> {
    return this.patch(routes.dndCustomContentItem(campaignId, itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteDndCustomContent(
    campaignId: string,
    itemId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<{ deleted: true; itemId: string; campaignUpdatedAt?: string }> {
    return this.delete(
      routes.dndCustomContentItem(campaignId, itemId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async dndMonsterTemplates(
    campaignId: string,
  ): Promise<DndMonsterTemplateResult[]> {
    return this.get(routes.dndMonsterTemplates(campaignId));
  }

  async previewDndMonsterTemplate(
    campaignId: string,
    input: DndMonsterTemplateDraft,
  ): Promise<{
    preview: true;
    template: DndMonsterTemplateRecord;
    warnings: DndCustomContentIssue[];
  }> {
    return this.post(routes.dndMonsterTemplatesPreview(campaignId), input);
  }

  async createDndMonsterTemplate(
    campaignId: string,
    input: DndMonsterTemplateDraft & { expectedCampaignUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<DndMonsterTemplateResult> {
    return this.post(routes.dndMonsterTemplates(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDndMonsterTemplate(
    campaignId: string,
    templateId: string,
    input: DndMonsterTemplateDraft & { expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<DndMonsterTemplateResult> {
    return this.patch(
      routes.dndMonsterTemplate(campaignId, templateId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteDndMonsterTemplate(
    campaignId: string,
    templateId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<{
    deleted: true;
    templateId: string;
    campaignUpdatedAt?: string;
  }> {
    return this.delete(
      routes.dndMonsterTemplate(campaignId, templateId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async dndMonsterBases(campaignId: string): Promise<DndMonsterBase[]> {
    return this.get(routes.dndMonsterBases(campaignId));
  }

  async previewDndMonsterVariant(
    campaignId: string,
    input: DndMonsterVariantDraft,
  ): Promise<DndMonsterVariantPreviewResult> {
    return this.post(routes.dndMonsterVariantsPreview(campaignId), input);
  }

  async createDndMonsterVariant(
    campaignId: string,
    input: DndMonsterVariantDraft & { expectedCampaignUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<DndMonsterVariantResult> {
    return this.post(routes.dndMonsterVariants(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async dndCharacterReviews(
    campaignId: string,
  ): Promise<DndCharacterReviewListResponse> {
    return this.get(routes.dndCharacterReviews(campaignId));
  }

  async updateDndCharacterReviewPolicy(
    campaignId: string,
    input: DndCharacterReviewPolicyUpdateRequest,
    idempotencyKey: string,
  ): Promise<
    Pick<DndCharacterReviewListResponse, "policy" | "campaignUpdatedAt">
  > {
    return this.patch(routes.dndCharacterReviewPolicy(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async submitDndCharacterReview(
    campaignId: string,
    actorId: string,
    input: DndCharacterReviewSubmitRequest,
    idempotencyKey: string,
  ): Promise<DndCharacterReviewEntry> {
    return this.post(
      routes.dndCharacterReviewSubmit(campaignId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async decideDndCharacterReview(
    campaignId: string,
    actorId: string,
    input: DndCharacterReviewDecisionRequest,
    idempotencyKey: string,
  ): Promise<DndCharacterReviewEntry> {
    return this.post(
      routes.dndCharacterReviewDecision(campaignId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async dndInventory(
    campaignId: string,
    actorId?: string,
  ): Promise<Dnd5eInventoryOverview> {
    return this.get(routes.dndInventory(campaignId, actorId));
  }

  async createDndPartyStash(
    campaignId: string,
    input: DndPartyStashCreateInput,
    idempotencyKey: string,
  ): Promise<{ partyStash: Item; summary: Record<string, unknown> }> {
    return this.post(routes.dndPartyStash(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async createDndMerchant(
    campaignId: string,
    input: DndMerchantMutationInput,
    idempotencyKey: string,
  ): Promise<DndMerchantMutationResult> {
    return this.post(routes.dndMerchants(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDndMerchant(
    campaignId: string,
    merchantId: string,
    input: DndMerchantMutationInput,
    idempotencyKey: string,
  ): Promise<DndMerchantMutationResult> {
    return this.patch(routes.dndMerchant(campaignId, merchantId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateDndInventoryItem(
    campaignId: string,
    itemId: string,
    input: DndInventoryItemPatchInput,
    idempotencyKey: string,
  ): Promise<{
    item: Item;
    owner: Actor | Item;
    summary: Record<string, unknown>;
  }> {
    return this.patch(routes.dndInventoryItem(campaignId, itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async transferDndInventoryItem(
    campaignId: string,
    itemId: string,
    input: DndInventoryTransferInput,
    idempotencyKey: string,
  ): Promise<{
    sourceOwner: Dnd5eInventoryOwnerRef;
    destinationOwner: Dnd5eInventoryOwnerRef;
    movedItems: Item[];
    source: Actor | Item;
    destination: Actor | Item;
  }> {
    return this.post(routes.dndInventoryTransfer(campaignId, itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async consumeDndAmmunition(
    campaignId: string,
    weaponItemId: string,
    input: DndInventoryAmmunitionInput,
    idempotencyKey: string,
  ): Promise<{
    actor: Actor;
    weapon: Item;
    ammunition: Item;
    consumed: number;
    remaining: number;
  }> {
    return this.post(
      routes.dndInventoryConsumeAmmunition(campaignId, weaponItemId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async buyFromDndMerchant(
    campaignId: string,
    merchantId: string,
    input: DndMerchantBuyInput,
    idempotencyKey: string,
  ): Promise<DndMerchantCommerceResult> {
    return this.post(routes.dndMerchantBuy(campaignId, merchantId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async sellToDndMerchant(
    campaignId: string,
    merchantId: string,
    input: DndMerchantSellInput,
    idempotencyKey: string,
  ): Promise<DndMerchantCommerceResult> {
    return this.post(routes.dndMerchantSell(campaignId, merchantId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async recordDndCombatLoot(
    combatId: string,
    input: DndCombatLootInput,
    idempotencyKey: string,
  ): Promise<{
    combat: Combat;
    partyStash: Item;
    reward: CombatReward;
    lootItems: Item[];
  }> {
    return this.post(routes.dndCombatLoot(combatId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async claimDndLoot(
    campaignId: string,
    itemId: string,
    input: DndLootClaimInput,
    idempotencyKey: string,
  ): Promise<DndLootClaimResult> {
    return this.post(routes.dndLootClaim(campaignId, itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async assignDndLoot(
    campaignId: string,
    itemId: string,
    input: DndLootAssignmentInput,
    idempotencyKey: string,
  ): Promise<DndLootAssignmentResult> {
    return this.post(routes.dndLootAssignment(campaignId, itemId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async addSystemCompendiumToActor(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemActorCompendiumMutationInput,
    idempotencyKey: string,
  ): Promise<SystemActorCompendiumMutationResult> {
    return this.post(
      routes.systemActorCompendium(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async purchaseSystemEquipment(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemEquipmentPurchaseInput,
    idempotencyKey: string,
  ): Promise<SystemEquipmentPurchaseResult> {
    return this.post(
      routes.systemActorPurchase(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async addSystemActorCondition(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemActorConditionApplyInput,
    idempotencyKey: string,
  ): Promise<SystemActorConditionMutationResult> {
    return this.post(
      routes.systemActorConditions(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async removeSystemActorCondition(
    campaignId: string,
    systemId: string,
    actorId: string,
    conditionId: string,
    input: SystemActorConditionRemoveInput,
    idempotencyKey: string,
  ): Promise<SystemActorConditionMutationResult> {
    const query = new URLSearchParams({
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    return this.delete(
      `${routes.systemActorCondition(campaignId, systemId, actorId, conditionId)}?${query.toString()}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async systemActorAdvancement(
    campaignId: string,
    systemId: string,
    actorId: string,
  ): Promise<SystemActorAdvancementInfo> {
    return this.get(
      routes.systemActorAdvancement(campaignId, systemId, actorId),
    );
  }

  async cancelDnd5eSrdPendingAdvancement(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdPendingAdvancementCancelRequest,
    options: PreparedMutationRequestOptions,
  ): Promise<Dnd5eSrdPendingAdvancementCancelResult> {
    if (!options.idempotencyKey.trim()) {
      throw new Error(
        "Cancelling a pending advancement requires an Idempotency-Key",
      );
    }
    return this.delete(
      preparedMutationRoutes.pendingAdvancement(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async systemActorRulesValidation(
    campaignId: string,
    systemId: string,
    actorId: string,
  ): Promise<Dnd5eSrdRulesValidationResult> {
    return this.get(
      routes.systemActorRulesValidation(campaignId, systemId, actorId),
    );
  }

  async systemActorCalculationExplanation(
    campaignId: string,
    systemId: string,
    actorId: string,
  ): Promise<ActorCalculationExplanation> {
    return this.get(
      routes.systemActorCalculationExplanation(campaignId, systemId, actorId),
    );
  }

  async calculationOverrides(
    campaignId: string,
    actorId: string,
  ): Promise<CalculationOverride[]> {
    return this.get(routes.actorCalculationOverrides(campaignId, actorId));
  }

  async createCalculationOverride(
    campaignId: string,
    actorId: string,
    input: CalculationOverrideCreateInput,
    idempotencyKey: string,
  ): Promise<CalculationOverride> {
    if (!idempotencyKey.trim())
      throw new Error(
        "Creating a calculation override requires an Idempotency-Key",
      );
    return this.post(
      routes.actorCalculationOverrides(campaignId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async clearCalculationOverride(
    overrideId: string,
    input: CalculationOverrideClearInput,
    idempotencyKey: string,
  ): Promise<CalculationOverride> {
    if (!idempotencyKey.trim())
      throw new Error(
        "Clearing a calculation override requires an Idempotency-Key",
      );
    return this.post(routes.calculationOverrideClear(overrideId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async systemControlledCreatures(
    campaignId: string,
    systemId: string,
  ): Promise<{
    records: Array<{
      actor: Actor;
      record: DndControlledCreatureRecord;
      requiredRevisions: DndControlledCreatureRevisionSet;
    }>;
  }> {
    return this.get(routes.systemControlledCreatures(campaignId, systemId));
  }

  async previewSystemControlledCreature(
    campaignId: string,
    systemId: string,
    input: DndControlledCreatureCreateRequest,
  ): Promise<DndControlledCreaturePreview> {
    return this.post(
      routes.systemControlledCreaturesPreview(campaignId, systemId),
      input,
    );
  }

  async confirmSystemControlledCreature(
    campaignId: string,
    systemId: string,
    input: DndControlledCreatureConfirmRequest,
    idempotencyKey: string,
  ): Promise<DndControlledCreatureMutationResult> {
    return this.post(
      routes.systemControlledCreatures(campaignId, systemId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async commandSystemControlledCreature(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: DndControlledCreatureCommandRequest,
    idempotencyKey: string,
  ): Promise<DndControlledCreatureMutationResult> {
    return this.post(
      routes.systemControlledCreatureCommand(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async endSystemControlledCreature(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: DndControlledCreatureEndRequest,
    idempotencyKey: string,
  ): Promise<DndControlledCreatureMutationResult> {
    return this.post(
      routes.systemControlledCreatureEnd(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async endSystemControlledCreatureConcentration(
    campaignId: string,
    systemId: string,
    input: DndControlledCreatureConcentrationEndRequest,
    idempotencyKey: string,
  ): Promise<DndControlledCreatureMutationResult> {
    return this.post(
      routes.systemControlledCreatureConcentrationEnd(campaignId, systemId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async systemActorRulesPreview(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdPreparedRulesPreviewInput,
    idempotencyKey: string,
  ): Promise<Dnd5eSrdRulesPreviewResult>;

  async systemActorRulesPreview(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdUnpreparedRulesPreviewInput,
    idempotencyKey?: string,
  ): Promise<Dnd5eSrdRulesPreviewResult>;

  async systemActorRulesPreview(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdRulesPreviewInput,
    idempotencyKey?: string,
  ): Promise<Dnd5eSrdRulesPreviewResult> {
    if (input.prepare === true && !idempotencyKey?.trim()) {
      throw new Error("Prepared D&D rules previews require an Idempotency-Key");
    }
    return this.post(
      routes.systemActorRulesPreview(campaignId, systemId, actorId),
      input,
      idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    );
  }

  async applyDnd5eSrdTypedDamage(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdTypedDamageApplyRequest,
    options: PreparedMutationRequestOptions,
  ): Promise<Dnd5eSrdTypedDamageApplyResult> {
    if (!options.idempotencyKey.trim()) {
      throw new Error(
        "Applying prepared typed damage requires an Idempotency-Key",
      );
    }
    return this.post(
      preparedMutationRoutes.typedDamageApply(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async undoDndRulesMutation(
    campaignId: string,
    mutationId: string,
    input: DndRulesMutationUndoRequest,
    options: PreparedMutationRequestOptions,
  ): Promise<DndRulesMutationUndoResult> {
    if (!options.idempotencyKey.trim()) {
      throw new Error(
        "Undoing a D&D rules mutation requires an Idempotency-Key",
      );
    }
    return this.post(
      preparedMutationRoutes.rulesMutationUndo(campaignId, mutationId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async previewDnd5eSrdSpellPreparation(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdSpellPreparationPreviewRequest,
    idempotencyKey: string,
  ): Promise<Dnd5eSrdSpellPreparationPreviewResponse> {
    return this.post(
      routes.systemActorSpellPreparationPreview(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async applyDnd5eSrdSpellPreparation(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdSpellPreparationApplyRequest,
    idempotencyKey: string,
  ): Promise<Dnd5eSrdSpellPreparationMutationResult> {
    return this.post(
      routes.systemActorSpellPreparationApply(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async changeSystemActorAttunement(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: Dnd5eSrdAttunementInput,
    options: PreparedMutationRequestOptions,
  ): Promise<Dnd5eSrdAttunementResult> {
    if (!input.expectedUpdatedAt.trim())
      throw new Error("Attunement changes require the reviewed actor revision");
    if (!options.idempotencyKey.trim())
      throw new Error("Attunement changes require an Idempotency-Key");
    return this.post(
      routes.systemActorAttunement(campaignId, systemId, actorId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async endDnd5eSrdConcentration(
    actorId: string,
    input: Dnd5eSrdConcentrationEndInput,
    options: MutationRequestOptions = {},
  ): Promise<Dnd5eSrdConcentrationEndResult> {
    if (!options.idempotencyKey?.trim())
      throw new Error(
        "Concentration preview and commit require an Idempotency-Key",
      );
    if ("prepare" in input && input.prepare !== true)
      throw new Error("Concentration previews require prepare=true");
    if (
      !("prepare" in input) &&
      (!input.preparedPreviewKey?.trim() ||
        !input.expectedActorUpdatedAt ||
        !input.expectedCombatUpdatedAt)
    ) {
      throw new Error(
        "Concentration commits require preparedPreviewKey and exact actor/combat revisions",
      );
    }
    return this.post(routes.actorConcentrationEnd(actorId), input, {
      "Idempotency-Key": options.idempotencyKey,
    });
  }

  async advanceSystemActor(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemActorAdvanceInput,
    options: MutationRequestOptions = {},
  ): Promise<SystemActorAdvanceResult> {
    if (systemId === "dnd-5e-srd") {
      if (
        !input.preparedPreviewKey?.trim() ||
        !input.expectedUpdatedAt?.trim()
      ) {
        throw new Error(
          "D&D advancement commits require preparedPreviewKey and expectedUpdatedAt",
        );
      }
      if (!options.idempotencyKey?.trim()) {
        throw new Error("D&D advancement commits require an Idempotency-Key");
      }
    }
    return this.post(
      routes.systemActorAdvance(campaignId, systemId, actorId),
      input,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    );
  }

  async commitDnd5eSrdAdvancement(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdAdvancementCommitInput,
    options: PreparedMutationRequestOptions,
  ): Promise<SystemActorAdvanceResult> {
    return this.advanceSystemActor(
      campaignId,
      "dnd-5e-srd",
      actorId,
      input,
      options,
    );
  }

  async restSystemActor(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemActorRestInput,
    options: MutationRequestOptions = {},
  ): Promise<SystemActorRestResult> {
    if (systemId === "dnd-5e-srd") {
      if (
        !input.preparedPreviewKey?.trim() ||
        !input.expectedUpdatedAt?.trim()
      ) {
        throw new Error(
          "D&D rest commits require preparedPreviewKey and expectedUpdatedAt",
        );
      }
      if (!options.idempotencyKey?.trim()) {
        throw new Error("D&D rest commits require an Idempotency-Key");
      }
    }
    return this.post(
      routes.systemActorRest(campaignId, systemId, actorId),
      input,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    );
  }

  async commitDnd5eSrdRest(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdRestCommitInput,
    options: PreparedMutationRequestOptions,
  ): Promise<SystemActorRestResult> {
    return this.restSystemActor(
      campaignId,
      "dnd-5e-srd",
      actorId,
      input,
      options,
    );
  }

  async systemActorSheet(
    campaignId: string,
    systemId: string,
    actorId: string,
  ): Promise<unknown> {
    return this.get(routes.systemActorSheet(campaignId, systemId, actorId));
  }

  async grantDnd5eSrdHeroicInspiration(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdHeroicInspirationGrantInput,
    options: PreparedMutationRequestOptions,
  ): Promise<Dnd5eSrdHeroicInspirationGrantResult> {
    if (!input.expectedActorUpdatedAt.trim()) throw new Error("Heroic Inspiration grants require the exact actor revision");
    if (input.recipientActorId && !input.expectedRecipientUpdatedAt?.trim()) throw new Error("Heroic Inspiration transfers require the exact recipient revision");
    if (!options.idempotencyKey.trim()) throw new Error("Heroic Inspiration grants require an Idempotency-Key");
    return this.post(
      routes.systemActorHeroicInspirationGrant(campaignId, "dnd-5e-srd", actorId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async rerollDnd5eSrdHeroicInspiration(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdHeroicInspirationRerollInput,
    options: PreparedMutationRequestOptions,
  ): Promise<Dnd5eSrdHeroicInspirationRerollResult> {
    if (!input.originalRollId.trim() || !input.expectedActorUpdatedAt.trim()) throw new Error("Heroic Inspiration rerolls require the original roll and exact actor revision");
    if (!Number.isInteger(input.selectedTermIndex) || input.selectedTermIndex < 0 || !Number.isInteger(input.selectedResultIndex) || input.selectedResultIndex < 0) throw new Error("Heroic Inspiration rerolls require one selected d20 result");
    if (!options.idempotencyKey.trim()) throw new Error("Heroic Inspiration rerolls require an Idempotency-Key");
    return this.post(
      routes.systemActorHeroicInspirationReroll(campaignId, "dnd-5e-srd", actorId),
      input,
      { "Idempotency-Key": options.idempotencyKey },
    );
  }

  async rollSystemActor(
    campaignId: string,
    systemId: string,
    actorId: string,
    input: SystemActorRollInput,
    options: MutationRequestOptions = {},
  ): Promise<SystemActorRollResult> {
    if (systemId === "dnd-5e-srd") {
      const preparedCommit = Boolean(input.preparedPreviewKey);
      const consequential =
        input.consumeResources === true || input.applyEffect === true || input.weaponMastery?.use === true || input.controlledCreature !== undefined;
      if (input.prepare === true && !options.idempotencyKey?.trim()) {
        throw new Error(
          "Prepared D&D action previews require an Idempotency-Key",
        );
      }
      if (input.prepare === true && !consequential) {
        throw new Error(
          "Only consequential D&D actions require a prepared preview",
        );
      }
      if (preparedCommit) {
        if (
          !input.preparedPreviewKey?.trim() ||
          !input.expectedUpdatedAt?.trim()
        ) {
          throw new Error(
            "D&D action commits require preparedPreviewKey and expectedUpdatedAt",
          );
        }
        if (!options.idempotencyKey?.trim()) {
          throw new Error("D&D action commits require an Idempotency-Key");
        }
      } else if (
        consequential &&
        input.prepare !== true &&
        input.preview !== true &&
        input.commit !== false
      ) {
        throw new Error(
          "Consequential D&D actions must be prepared before commit",
        );
      }
    }
    return this.post(
      routes.systemActorRoll(campaignId, systemId, actorId),
      input,
      options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {},
    );
  }

  async prepareDnd5eSrdAction(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdPreparedActionPreviewInput,
    options: PreparedMutationRequestOptions,
  ): Promise<SystemActorRollResult> {
    return this.rollSystemActor(
      campaignId,
      "dnd-5e-srd",
      actorId,
      input,
      options,
    );
  }

  /** Prepares a Rage start, extension, or voluntary end with exact revision and retry identity. */
  async prepareDnd5eSrdRageAction(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdRageActionPreviewInput,
    options: PreparedMutationRequestOptions,
  ): Promise<SystemActorRollResult> {
    return this.prepareDnd5eSrdAction(campaignId, actorId, {
      rollId: dnd5eSrdRageActionRollIds[input.kind],
      expectedUpdatedAt: input.expectedUpdatedAt,
      consumeResources: true,
      prepare: true,
      commit: false,
    }, options);
  }

  async commitDnd5eSrdAction(
    campaignId: string,
    actorId: string,
    input: Dnd5eSrdActionCommitInput,
    options: PreparedMutationRequestOptions,
  ): Promise<SystemActorRollResult> {
    return this.rollSystemActor(
      campaignId,
      "dnd-5e-srd",
      actorId,
      { ...input },
      options,
    );
  }

  async contentImports(campaignId: string): Promise<ContentImportBatch[]> {
    return this.get(routes.contentImports(campaignId));
  }

  async previewContentImport(
    campaignId: string,
    input: unknown,
    idempotencyKey: string,
  ): Promise<ContentImportBatch> {
    return this.post(routes.contentImportPreview(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async worlds(campaignId: string): Promise<World[]> {
    return this.get(routes.worlds(campaignId));
  }

  async createWorld(
    campaignId: string,
    input: Partial<Pick<World, "name" | "description">> & {
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<World> {
    return this.post(routes.worlds(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async world(worldId: string): Promise<World> {
    return this.get(routes.world(worldId));
  }

  async updateWorld(
    worldId: string,
    input: Partial<Pick<World, "name" | "description">> & {
      expectedUpdatedAt: string;
    },
    idempotencyKey: string,
  ): Promise<World> {
    return this.patch(routes.world(worldId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteWorld(
    worldId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<World & { detachedRecords?: Record<string, number> }> {
    return this.delete(
      `${routes.world(worldId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async worldRecords(
    campaignId: string,
    filters: {
      worldId?: string;
      kind?: WorldRecord["kind"];
      lifecycle?: WorldRecord["lifecycle"];
    } = {},
  ): Promise<WorldRecord[]> {
    const query = new URLSearchParams();
    if (filters.worldId) query.set("worldId", filters.worldId);
    if (filters.kind) query.set("kind", filters.kind);
    if (filters.lifecycle) query.set("lifecycle", filters.lifecycle);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.get(`${routes.worldRecords(campaignId)}${suffix}`);
  }

  async createWorldRecord(
    campaignId: string,
    input: WorldRecordCreateInput,
    idempotencyKey: string,
  ): Promise<WorldRecord> {
    if (!idempotencyKey.trim())
      throw new Error("Creating a world record requires an Idempotency-Key");
    return this.post(routes.worldRecords(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateWorldRecord(
    recordId: string,
    input: WorldRecordUpdateInput,
    idempotencyKey: string,
  ): Promise<WorldRecord> {
    if (!idempotencyKey.trim())
      throw new Error("Updating a world record requires an Idempotency-Key");
    return this.patch(routes.worldRecord(recordId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateWorldRecordLifecycle(
    recordId: string,
    lifecycle: WorldRecord["lifecycle"],
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<WorldRecord> {
    if (!idempotencyKey.trim())
      throw new Error(
        "Changing a world record lifecycle requires an Idempotency-Key",
      );
    return this.post(
      routes.worldRecordLifecycle(recordId),
      { lifecycle, expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async setWorldRecordLifecycle(
    recordId: string,
    lifecycle: WorldRecord["lifecycle"],
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<WorldRecord> {
    return this.updateWorldRecordLifecycle(
      recordId,
      lifecycle,
      expectedUpdatedAt,
      idempotencyKey,
    );
  }

  async deleteWorldRecord(
    recordId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<WorldRecordDeleteResult> {
    if (!idempotencyKey.trim())
      throw new Error("Deleting a world record requires an Idempotency-Key");
    return this.delete(
      `${routes.worldRecord(recordId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async worldRelations(
    campaignId: string,
    filters: { recordId?: string; worldId?: string } = {},
  ): Promise<WorldRelation[]> {
    const query = new URLSearchParams();
    if (filters.recordId) query.set("recordId", filters.recordId);
    if (filters.worldId) query.set("worldId", filters.worldId);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.get(`${routes.worldRelations(campaignId)}${suffix}`);
  }

  async createWorldRelation(
    campaignId: string,
    input: WorldRelationCreateInput,
    idempotencyKey: string,
  ): Promise<WorldRelation> {
    if (!idempotencyKey.trim())
      throw new Error("Creating a world relation requires an Idempotency-Key");
    return this.post(routes.worldRelations(campaignId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async updateWorldRelation(
    relationId: string,
    input: WorldRelationUpdateInput,
    idempotencyKey: string,
  ): Promise<WorldRelation> {
    if (!idempotencyKey.trim())
      throw new Error("Updating a world relation requires an Idempotency-Key");
    return this.patch(routes.worldRelation(relationId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async deleteWorldRelation(
    relationId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<WorldRelation> {
    if (!idempotencyKey.trim())
      throw new Error("Deleting a world relation requires an Idempotency-Key");
    return this.delete(
      `${routes.worldRelation(relationId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async analyzePdfContentImport(
    campaignId: string,
    body: BodyInit,
    options: { sourceName?: string; idempotencyKey: string },
  ): Promise<ContentImportBatch> {
    const headers: Record<string, string> = {
      "content-type": "application/pdf",
    };
    if (options.sourceName) headers["x-source-name"] = options.sourceName;
    headers["Idempotency-Key"] = options.idempotencyKey;
    return this.requestRaw(
      "POST",
      routes.contentImportPdfAi(campaignId),
      body,
      headers,
    );
  }

  async contentImport(importId: string): Promise<ContentImportBatch> {
    return this.get(routes.contentImport(importId));
  }

  async applyContentImport(
    importId: string,
    input: { selectedEntityIds?: string[]; expectedUpdatedAt: string },
    idempotencyKey: string,
  ): Promise<ContentImportBatch> {
    return this.post(routes.contentImportApply(importId), input, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  async rollbackContentImport(
    importId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<ContentImportBatch> {
    return this.post(
      routes.contentImportRollback(importId),
      { expectedUpdatedAt },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async deleteContentImport(
    importId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<ContentImportBatch> {
    return this.delete(
      `${routes.contentImportDelete(importId)}?${new URLSearchParams({ expectedUpdatedAt })}`,
      undefined,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async exportCampaign(
    campaignId: string,
    options: CampaignArchiveExportOptions = {},
  ): Promise<CampaignArchive> {
    const query = campaignArchiveExportQuery(options);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.get(`${routes.exportCampaign(campaignId)}${suffix}`);
  }

  /**
   * Returns a response whose body can be piped directly to disk or forwarded
   * to `importCampaignStream`. Unlike JSON export, asset bytes are raw framed
   * chunks and are never materialized as one base64 string by the server.
   */
  async exportCampaignStream(
    campaignId: string,
    options: CampaignArchiveExportOptions = {},
  ): Promise<Response> {
    const query = campaignArchiveExportQuery(options);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.requestResponse(
      "GET",
      `${routes.exportCampaignStream(campaignId)}${suffix}`,
    );
  }

  async dogfoodReportBundle(campaignId: string): Promise<unknown> {
    return this.get(routes.dogfoodReportBundle(campaignId));
  }

  async campaignArchiveImportOperations(
    campaignId: string,
    status?: CampaignArchiveImportOperationSummary["status"],
  ): Promise<{ items: CampaignArchiveImportOperationSummary[] }> {
    const query = status ? `?${new URLSearchParams({ status }).toString()}` : "";
    return this.get(`${routes.campaignArchiveImportOperations(campaignId)}${query}`);
  }

  async previewCampaignArchiveImportRollback(
    campaignId: string,
    operationId: string,
  ): Promise<CampaignArchiveImportRollbackPreview> {
    return this.get(routes.campaignArchiveImportOperationPreview(campaignId, operationId));
  }

  async rollbackCampaignArchiveImport(
    campaignId: string,
    operationId: string,
    expectedUpdatedAt: string,
    idempotencyKey: string,
  ): Promise<CampaignArchiveImportRollbackResult> {
    return this.post(
      routes.campaignArchiveImportOperationRollback(campaignId, operationId),
      { expectedUpdatedAt, confirmOperationId: operationId },
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async importCampaign(
    archive: unknown,
    idempotencyKey: string,
    options: CampaignArchiveImportOptions = {},
  ): Promise<CampaignArchiveImportResult> {
    const hasOptions =
      options.mode !== undefined ||
      options.scope !== undefined ||
      options.collections !== undefined ||
      options.regenerateIds !== undefined ||
      options.expectedUpdatedAt !== undefined;
    return this.post(
      routes.importCampaign,
      hasOptions ? { archive, ...options } : archive,
      { "Idempotency-Key": idempotencyKey },
    );
  }

  async importCampaignStream(
    archiveStream: BodyInit,
    idempotencyKey: string,
    options: CampaignArchiveImportOptions = {},
  ): Promise<CampaignArchiveImportResult> {
    const query = new URLSearchParams();
    if (options.mode) query.set("mode", options.mode);
    if (options.scope) query.set("scope", options.scope);
    if (options.collections?.length)
      query.set("collections", options.collections.join(","));
    if (options.regenerateIds !== undefined)
      query.set("regenerateIds", String(options.regenerateIds));
    if (options.expectedUpdatedAt)
      query.set("expectedUpdatedAt", options.expectedUpdatedAt);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const response = await this.requestResponse(
      "POST",
      `${routes.importCampaignStream}${suffix}`,
      archiveStream,
      {
        "content-type": campaignArchiveStreamContentType,
        "Idempotency-Key": idempotencyKey,
      },
    );
    return response.json() as Promise<CampaignArchiveImportResult>;
  }

  private async get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private async requestResponse(
    method: string,
    path: string,
    body?: BodyInit,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      [apiVersionHeader]: apiVersion,
      ...extraHeaders,
    };
    if (this.options.token)
      headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) headers["x-user-id"] = this.options.userId;
    const init: RequestInit & { duplex?: "half" } = { method, headers, body };
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
      init.duplex = "half";
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!response.ok) throw new Error(await response.text());
    return response;
  }

  private async post<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.request("POST", path, body, headers);
  }

  private async patch<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.request("PATCH", path, body, headers);
  }

  private async put<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.request("PUT", path, body, headers);
  }

  private async delete<T>(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.request("DELETE", path, body, headers);
  }

  private async requestRaw<T>(
    method: string,
    path: string,
    body: BodyInit,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const requestHeaders: Record<string, string> = {
      [apiVersionHeader]: apiVersion,
      ...headers,
    };
    if (this.options.token)
      requestHeaders.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) requestHeaders["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }

  private async getText(path: string): Promise<string> {
    const headers: Record<string, string> = { [apiVersionHeader]: apiVersion };
    if (this.options.token)
      headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) headers["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.text();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      [apiVersionHeader]: apiVersion,
      ...extraHeaders,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.options.token)
      headers.authorization = `Bearer ${this.options.token}`;
    if (this.options.userId) headers["x-user-id"] = this.options.userId;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
}

export interface CampaignSearchResult {
  type:
    | "world"
    | "scene"
    | "actor"
    | "item"
    | "journal"
    | "handout"
    | "encounter"
    | "memory"
    | "chat"
    | "roll";
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  worldId?: string;
  visibility?: string;
  score: number;
}

function normalizeClientBaseUrl(value: string): string {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function campaignArchiveExportQuery(
  options: CampaignArchiveExportOptions,
): URLSearchParams {
  const query = new URLSearchParams();
  if (options.scope) query.set("scope", options.scope);
  if (options.scopeId) query.set("scopeId", options.scopeId);
  if (options.collections?.length)
    query.set("collections", options.collections.join(","));
  if (options.version) query.set("version", options.version);
  if (options.redaction) query.set("redaction", options.redaction);
  return query;
}

function realtimeProtocols(
  protocols: string | string[] | undefined,
  token: string | undefined,
): string[] | undefined {
  const list =
    protocols === undefined
      ? ["otte.v1"]
      : Array.isArray(protocols)
        ? [...protocols]
        : [protocols];
  if (token) list.push(`otte.auth.${token}`);
  return list.length > 0 ? [...new Set(list)] : undefined;
}
