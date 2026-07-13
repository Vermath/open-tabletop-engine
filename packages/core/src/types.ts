export type ID = string;

export type Visibility = "gm_only" | "public" | "specific_players" | "specific_characters";
export type UserRole = "owner" | "gm" | "assistant_gm" | "player" | "observer" | "plugin" | "ai_assistant";
export type ScimAssignableRole = Extract<UserRole, "gm" | "assistant_gm" | "player" | "observer">;
export type OrganizationMemberRole = "owner" | "admin" | "member";
export type GridType = "square" | "gridless";
export type ProposalStatus = "draft" | "pending" | "approved" | "rejected" | "applied" | "reverted";
export type MessageType = "plain" | "emote" | "whisper" | "roll" | "system" | "gm" | "ooc" | "ai" | "plugin";
export type ChatModerationStatus = "open" | "follow_up" | "reviewed";

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface User extends Timestamps {
  id: ID;
  displayName: string;
  email?: string;
  passwordHash?: string;
  serverAdmin?: boolean;
  mfa?: UserMfaSettings;
  scim?: UserScimProfile;
  disabledAt?: string;
  disabledByUserId?: ID;
  disabledReason?: string;
  passwordUpdatedAt?: string;
  passwordResetRequired?: boolean;
}

export interface UserMfaSettings {
  totpSecret?: string;
  totpPendingAt?: string;
  totpEnabledAt?: string;
  recoveryCodeHashes?: string[];
  recoveryCodesUpdatedAt?: string;
  lastVerifiedAt?: string;
}

export interface UserScimProfile {
  userName?: string;
  externalId?: string;
  syncedAt?: string;
}

export interface ScimGroup extends Timestamps {
  id: ID;
  displayName: string;
  externalId?: string;
  memberUserIds: ID[];
}

export interface ScimGroupRoleMapping extends Timestamps {
  id: ID;
  groupId?: ID;
  groupExternalId?: string;
  groupDisplayName?: string;
  campaignId: ID;
  role: ScimAssignableRole;
}

export interface UserSession extends Timestamps {
  id: ID;
  userId: ID;
  tokenHash: string;
  activeOrganizationId?: ID;
  expiresAt: string;
  lastSeenAt: string;
}

export interface AuthIdentity extends Timestamps {
  id: ID;
  userId: ID;
  provider: "oidc";
  issuer: string;
  subject: string;
  email?: string;
}

export interface OAuthLoginState extends Timestamps {
  id: ID;
  provider: "oidc";
  issuer: string;
  stateHash: string;
  codeVerifier: string;
  nonceHash: string;
  redirectUri: string;
  returnTo?: string;
  expiresAt: string;
}

export interface PasswordResetToken extends Timestamps {
  id: ID;
  userId: ID;
  email: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  requestedByUserId?: ID;
}

export interface EmailOutboxMessage extends Timestamps {
  id: ID;
  to: string;
  subject: string;
  text: string;
  html?: string;
  status: "pending" | "delivered" | "failed";
  provider: "outbox" | "webhook";
  sentAt?: string;
  error?: string;
  metadata?: Record<string, string>;
}

export interface OrganizationWorkspace extends Timestamps {
  id: ID;
  name: string;
  ownerUserId: ID;
  defaultSystemId: ID;
  defaultCampaignVisibility: "private" | "invite_only" | "public";
  defaultPermissionTemplate: "standard" | "player_authoring" | "ai_assisted" | "assistant_ops";
  defaultInviteRole: Exclude<UserRole, "owner" | "plugin" | "ai_assistant">;
  defaultSceneName: string;
  defaultSceneFolder: string;
  defaultSceneWidth: number;
  defaultSceneHeight: number;
  defaultSceneGridSize: number;
  onboardingTitle: string;
  onboardingBody: string;
}

export interface OrganizationMember extends Timestamps {
  id: ID;
  organizationId: ID;
  userId: ID;
  role: OrganizationMemberRole;
}

export interface Campaign extends Timestamps {
  id: ID;
  organizationId?: ID;
  ownerUserId: ID;
  name: string;
  description: string;
  defaultSystemId: ID;
  visibility: "private" | "invite_only" | "public";
  archivedAt?: string;
  archivedByUserId?: ID;
  restoredAt?: string;
  restoredByUserId?: ID;
}

export interface CampaignMember extends Timestamps {
  id: ID;
  campaignId: ID;
  userId: ID;
  role: UserRole;
  source?: CampaignMemberSource;
}

export type CampaignMemberSource = CampaignMemberScimSource;

export interface CampaignMemberScimSource {
  type: "scim_group";
  groupId: ID;
  mappingId: ID;
}

export interface CampaignInvite extends Timestamps {
  id: ID;
  campaignId: ID;
  tokenHash: string;
  email?: string;
  role: UserRole;
  invitedByUserId: ID;
  acceptedByUserId?: ID;
  acceptedAt?: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface World extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  description: string;
}

export interface Scene extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  gridSize: number;
  backgroundAssetId?: ID;
  folder?: string;
  active: boolean;
  sortOrder: number;
  fog: FogRegion[];
  fogHistory?: FogHistoryEntry[];
  activationHistory?: SceneActivationHistoryEntry[];
  annotationHistory?: SceneAnnotationHistoryEntry[];
  walls: Wall[];
  lights: LightSource[];
  annotations: SceneAnnotation[];
  metadata: Record<string, unknown>;
  sceneEditHistory?: SceneEditSnapshot[];
}

/** The editable geometry/layout fields a scene-edit undo restores. */
export interface SceneEditableState {
  worldId?: ID;
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  gridSize: number;
  backgroundAssetId?: ID;
  folder?: string;
  fog: FogRegion[];
  walls: Wall[];
  lights: LightSource[];
  annotations: SceneAnnotation[];
  metadata: Record<string, unknown>;
}

/** A pre-mutation snapshot pushed before a scene edit so a GM can undo the last N changes. */
export interface SceneEditSnapshot {
  id: ID;
  at: string;
  byUserId?: ID;
  kind: string;
  state: SceneEditableState;
}

export interface SceneActivationHistoryEntry {
  id: ID;
  sceneId: ID;
  activatedAt: string;
  activatedByUserId?: ID;
  previousActiveSceneId?: ID;
  deactivatedSceneIds: ID[];
  source: "create" | "activate";
}

export interface FogRegion {
  id: ID;
  x: number;
  y: number;
  radius: number;
  hidden: boolean;
  shape?: FogShape;
  mode?: FogMode;
  points?: VisionPoint[];
}

export type FogShape = "circle" | "polygon";
export type FogMode = "reveal" | "hide";

export interface FogPreset extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  description?: string;
  sourceSceneId?: ID;
  regions: FogPresetRegion[];
  metadata: Record<string, unknown>;
}

export type FogPresetRegion = Omit<FogRegion, "id">;

export interface FogHistoryEntry extends Timestamps {
  id: ID;
  sceneId: ID;
  action: FogHistoryAction;
  fogId: ID;
  actorUserId: ID;
  region?: FogRegion;
  targetHistoryId?: ID;
}

export type FogHistoryAction = "create" | "delete" | "undo";

export type WallKind = "wall" | "terrain";

export interface Wall {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  blocksVision: boolean;
  blocksMovement?: boolean;
  kind?: WallKind;
}

export interface LightSource {
  id: ID;
  x: number;
  y: number;
  radius: number;
  brightRadius?: number;
  dimRadius?: number;
  color: string;
  intensity?: number;
}

export type SceneAnnotationKind = "ping" | "ruler" | "template" | "drawing";
export type SceneAnnotationLayer = "measurement" | "effects" | "drawings" | "notes";
export type SceneTemplateShape = "circle" | "line" | "cone";

export interface SceneAnnotation extends Timestamps {
  id: ID;
  sceneId: ID;
  kind: SceneAnnotationKind;
  createdByUserId: ID;
  label?: string;
  layer?: SceneAnnotationLayer;
  groupId?: ID;
  groupLabel?: string;
  sortOrder?: number;
  templateShape?: SceneTemplateShape;
  templateSaveAbility?: string;
  templateSaveDc?: number;
  templateDamageFormula?: string;
  templateDamageType?: string;
  snapToGrid?: boolean;
  affectedTokenIds?: ID[];
  rulesSystemId?: ID;
  effectHint?: string;
  color: string;
  points: VisionPoint[];
  radius?: number;
  expiresAt?: string;
}

export interface SceneAnnotationHistoryEntry extends Timestamps {
  id: ID;
  sceneId: ID;
  annotationId: ID;
  action: "create" | "update" | "delete";
  kind: SceneAnnotationKind;
  layer?: SceneAnnotationLayer;
  groupId?: ID;
  groupLabel?: string;
  templateShape?: SceneTemplateShape;
  templateSaveAbility?: string;
  templateSaveDc?: number;
  templateDamageFormula?: string;
  templateDamageType?: string;
  affectedTokenIds?: ID[];
  rulesSystemId?: ID;
  actorUserId: ID;
}

export interface VisionPoint {
  x: number;
  y: number;
}

export type VisionPolygonSource = "token" | "fog" | "light";

export interface VisionPolygon {
  id: ID;
  source: VisionPolygonSource;
  sourceId: ID;
  points: VisionPoint[];
  radius?: number;
  lightLevel?: "bright" | "dim";
  color?: string;
  opacity?: number;
  mode?: FogMode;
}

export interface VisionSnapshot {
  sceneId: ID;
  userId: ID;
  fogActive: boolean;
  polygons: VisionPolygon[];
}

export interface VisionPointSample {
  sceneId: ID;
  userId: ID;
  point: VisionPoint;
  fogActive: boolean;
  visible: boolean;
  revealedBy: VisionPointSamplePolygon[];
  hiddenBy: VisionPointSamplePolygon[];
  illuminatedBy: VisionPointSamplePolygon[];
  blockedBy: VisionPointSampleWall[];
}

export interface VisionPointSamplePolygon {
  polygonId: ID;
  source: VisionPolygonSource;
  sourceId: ID;
  mode?: FogMode;
  radius?: number;
  lightLevel?: "bright" | "dim";
  color?: string;
  opacity?: number;
}

export interface VisionPointSampleWall {
  wallId: ID;
  kind?: WallKind;
  blocksMovement?: boolean;
  source: VisionPolygonSource;
  sourceId: ID;
  intersection?: VisionPoint;
  distanceFromSource?: number;
  distanceToPoint?: number;
}

export interface MapAsset extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
  folder?: string;
  tags?: string[];
  storage?: AssetStorageRef;
  lifecycle?: AssetLifecycle;
  security?: AssetSecurityScan;
}

export interface AssetStorageRef {
  provider: "local" | "s3";
  key: string;
  bucket?: string;
}

export interface AssetLifecycle {
  status: "active" | "archived" | "deleted";
  expiresAt?: string;
  updatedAt?: string;
  updatedByUserId?: ID;
  reason?: string;
  storageDeletedAt?: string;
  cleanupReason?: string;
}

export interface AssetSecurityScan {
  status: "clean";
  scanner: string;
  scannedAt: string;
  findings: AssetSecurityFinding[];
}

export interface AssetSecurityFinding {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
}

export type TokenLayer = "map" | "player" | "gm";

export interface Token extends Timestamps {
  id: ID;
  sceneId: ID;
  actorId?: ID;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  layer?: TokenLayer;
  hidden: boolean;
  locked: boolean;
  visionEnabled: boolean;
  visionRadius: number;
  brightVisionRadius?: number;
  dimVisionRadius?: number;
  disposition: "friendly" | "neutral" | "hostile";
  imageAssetId?: ID;
  ownerUserIds?: ID[];
  notes?: string;
  conditions?: TokenCondition[];
  auras?: TokenAura[];
  targetedByUserIds?: ID[];
  metadata: Record<string, unknown>;
}

export interface TokenCondition {
  id: ID;
  name: string;
}

export interface TokenAura {
  id: ID;
  name: string;
  radius: number;
  color?: string;
}

export interface Actor extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  systemId: ID;
  ownerUserId?: ID;
  type: string;
  name: string;
  imageAssetId?: ID;
  data: Record<string, unknown>;
  permissions: Record<ID, PermissionName[]>;
}

export interface Item extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  systemId: ID;
  actorId?: ID;
  type: string;
  name: string;
  data: Record<string, unknown>;
}

export interface JournalEntry extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  parentId?: ID;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: ID[];
  visibleToActorIds: ID[];
  tags: string[];
  createdBy: ID;
  updatedBy: ID;
}

export interface Handout extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  title: string;
  body: string;
  visibility: Visibility;
  assetIds: ID[];
  /** Added after the original archive schema; omitted values normalize to empty arrays. */
  visibleToUserIds?: ID[];
  visibleToActorIds?: ID[];
  tags?: string[];
  readByUserIds?: ID[];
  createdBy?: ID;
  updatedBy?: ID;
}

export interface ChatMessage extends Timestamps {
  id: ID;
  campaignId: ID;
  sceneId?: ID;
  userId: ID;
  type: MessageType;
  body: string;
  visibility: "public" | "gm_only" | "whisper";
  recipientUserIds: ID[];
  rollId?: ID;
  replyToMessageId?: ID;
  moderationStatus?: ChatModerationStatus;
  moderatedByUserId?: ID;
  moderatedAt?: string;
  editedByUserId?: ID;
  editedAt?: string;
}

export interface DiceRoll extends Timestamps {
  id: ID;
  campaignId: ID;
  userId: ID;
  formula: string;
  label?: string;
  visibility: "public" | "gm_only" | "whisper";
  terms: DiceRollTerm[];
  total: number;
  fairness?: DiceRollFairness;
}

/**
 * Provably-fair metadata for a server-authoritative roll. `serverSeedHash` is the
 * commitment (publishable before the result is trusted); `serverSeed` is the
 * reveal, letting anyone recompute the roll and confirm it was not altered.
 */
export interface DiceRollFairness {
  algorithm: "xmur3-mulberry32";
  serverSeed: string;
  serverSeedHash: string;
  clientSeed?: string;
}

export interface DiceMacro extends Timestamps {
  id: ID;
  campaignId: ID;
  createdBy: ID;
  name: string;
  formula: string;
  visibility: "public" | "gm_only";
}

export type AudioTrackKind = "music" | "ambient" | "sfx";

/**
 * A GM-curated soundboard entry. `playing`/`volume`/`loop` are synced to every
 * connected client so ambient beds and sound effects play in unison.
 */
export interface AudioTrack extends Timestamps {
  id: ID;
  campaignId: ID;
  createdBy: ID;
  name: string;
  url: string;
  kind: AudioTrackKind;
  loop: boolean;
  playing: boolean;
  volume: number;
  startedAt?: string;
}

export interface DiceRollTerm {
  type: "die" | "modifier" | "binding";
  sign?: -1;
  sides?: number;
  count?: number;
  results?: number[];
  kept?: number[];
  exploded?: number[];
  keep?: "highest" | "lowest";
  keepCount?: number;
  drop?: "highest" | "lowest";
  dropCount?: number;
  reroll?: number;
  rerolled?: number[];
  value?: number;
  path?: string;
}

export interface Encounter extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  /** Rules package used to build this encounter. Omitted on legacy/freeform encounters. */
  systemId?: ID;
  name: string;
  summary: string;
  tokenIds: ID[];
  difficulty?: string;
  /** Exact party snapshot used for difficulty planning. */
  partyActorIds?: ID[];
  /** Reopenable threat composition from the system encounter builder. */
  threats?: Array<{ id: ID; count: number }>;
}

export type CampaignSessionStatus = "planned" | "live" | "completed";

export interface CampaignSession extends Timestamps {
  id: ID;
  campaignId: ID;
  status: CampaignSessionStatus;
  title: string;
  number: number;
  agenda: string;
  notes: string;
  scheduledFor?: string;
  startedAt?: string;
  endedAt?: string;
  sceneIds: ID[];
  encounterIds: ID[];
  recapProposalId?: ID;
  recapJournalId?: ID;
  createdBy: ID;
  updatedBy: ID;
}

export interface Combat extends Timestamps {
  id: ID;
  campaignId: ID;
  encounterId?: ID;
  active: boolean;
  round: number;
  turnIndex: number;
  manualTurnOrder?: boolean;
  combatants: Combatant[];
  actions?: CombatAction[];
}

export interface Combatant {
  id: ID;
  tokenId: ID;
  actorId?: ID;
  name: string;
  initiative: number;
  defeated: boolean;
  readiness?: "normal" | "ready" | "delayed";
  conditions?: string[];
  deathSaveSuccesses?: number;
  deathSaveFailures?: number;
  deathSaveOutcome?: "stable" | "dead";
  resourceKey?: string;
  resourceLabel?: string;
  resourceUsed?: boolean;
  resourceSpent?: boolean;
}

export interface CombatAction extends Timestamps {
  id: ID;
  campaignId: ID;
  combatId: ID;
  actorId: ID;
  actorName: string;
  requestedByUserId: ID;
  status: "pending_gm" | "confirmed" | "rejected" | "failed";
  rollId: string;
  actionLabel: string;
  targetActorIds: ID[];
  applyEffect: boolean;
  consumeResources: boolean;
  resolution?: unknown;
  rolls: CombatActionRoll[];
  actorUpdates: CombatActionActorUpdate[];
  itemUpdates?: CombatActionItemUpdate[];
  effects?: CombatActionEffect[];
  resultSummary?: string;
  confirmedByUserId?: ID;
  confirmedAt?: string;
  rejectedByUserId?: ID;
  rejectedAt?: string;
  rejectionReason?: string;
  failureReason?: string;
}

export interface CombatActionRoll {
  label: string;
  formula: string;
  terms: DiceRollTerm[];
  total: number;
  targetActorId?: ID;
  visibility: "public" | "gm_only" | "whisper";
}

export interface CombatActionActorUpdate {
  actorId: ID;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface CombatActionItemUpdate {
  itemId: ID;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface CombatActionEffect {
  type: string;
  targetActorId: ID;
  amount?: number;
}

export interface CompendiumPack extends Timestamps {
  id: ID;
  systemId: ID;
  name: string;
  entries: CompendiumEntry[];
}

export interface CompendiumEntry {
  id: ID;
  type: "actor" | "item" | "journal" | "scene";
  name: string;
  data: unknown;
}

export interface Proposal extends Timestamps {
  id: ID;
  campaignId: ID;
  createdByUserId?: ID;
  createdByType: "user" | "ai" | "plugin";
  sourceId?: ID;
  title: string;
  summary: string;
  status: ProposalStatus;
  changesJson: ProposalChange[];
  diffJson: Record<string, unknown>;
  approvalRequired: boolean;
  approvedByUserId?: ID;
  appliedByUserId?: ID;
  appliedAt?: string;
  revertedByUserId?: ID;
  revertedAt?: string;
  /** Reverse-ordered, domain-aware changes captured at apply time. */
  inverseChangesJson?: ProposalChange[];
  /**
   * Post-apply entity snapshots used to reject a revert after any affected
   * record has changed. A null expected value means the entity must remain
   * absent until the proposal is reverted.
   */
  revertGuardsJson?: ProposalRevertGuard[];
  history?: ProposalHistoryEntry[];
}

export interface ProposalRevertGuard {
  entity: ProposalChange["entity"];
  id: ID;
  expected: Record<string, unknown> | null;
}

export interface ProposalHistoryEntry {
  action: "created" | "approved" | "rejected" | "applied" | "reverted" | "revised";
  status: ProposalStatus;
  previousStatus?: ProposalStatus;
  at: string;
  actorUserId?: ID;
  actorType: "user" | "ai" | "plugin" | "server_admin" | "system";
  auditAction?: string;
  note?: string;
}

export interface ProposalChange {
  entity:
    | "campaign"
    | "world"
    | "scene"
    | "token"
    | "actor"
    | "item"
    | "journal"
    | "handout"
    | "chat"
    | "roll"
    | "diceMacro"
    | "encounter"
    | "combat"
    | "asset"
    | "fogPreset"
    | "pluginStorage"
    /** Internal inverse-change entities used to restore lifecycle associations. */
    | "campaignSession"
    | "aiMemory";
  action: "create" | "update" | "delete";
  id?: ID;
  data: Record<string, unknown>;
}

export interface AiThread extends Timestamps {
  id: ID;
  campaignId: ID;
  userId: ID;
  provider: string;
  title: string;
  prompt?: string;
  status?: "running" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  durationMs?: number;
  retryAttempts?: number;
  eventCount?: number;
  toolCallCount?: number;
  advertisedToolNames?: string[];
  advertisedTools?: AiThreadAdvertisedTool[];
  providerError?: string;
  assistantMessage?: string;
  usage?: AiUsageMetrics;
}

export interface AiThreadAdvertisedTool {
  name: string;
  requiredPermissions: string[];
  permissionSafe?: boolean;
}

export interface AiEvaluationRun extends Timestamps {
  id: ID;
  campaignId: ID;
  userId: ID;
  threadId: ID;
  provider: string;
  name: string;
  status: "passed" | "failed";
  score: number;
  summary: string;
  checks: AiEvaluationCheck[];
}

export interface AiEvaluationCheck {
  name: string;
  status: "passed" | "failed";
  expected: unknown;
  actual: unknown;
}

export interface AiUsageMetrics {
  promptCharacters?: number;
  contextCharacters?: number;
  responseCharacters?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

export type AiMemoryFactType =
  | "canon_fact"
  | "rumor"
  | "secret"
  | "npc_profile"
  | "location_profile"
  | "faction_profile"
  | "quest_hook"
  | "unresolved_thread"
  | "character_goal"
  | "session_summary"
  | "timeline_event"
  | "retconned_fact"
  | "ai_suggestion";

export type AiMemoryFactStatus = "candidate" | "approved" | "rejected" | "retconned";

export interface AiMemoryFactSource {
  type: string;
  id?: ID;
  label?: string;
}

export interface AiMemoryFact extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  text: string;
  visibility: Visibility;
  sourceIds: ID[];
  /** Optional on legacy rows; API and persistence normalization infer a value. */
  type?: AiMemoryFactType;
  subject?: string;
  status?: AiMemoryFactStatus;
  confidence?: number;
  source?: AiMemoryFactSource;
  createdBy?: "user" | "ai" | "plugin" | "system";
  approvedByUserId?: ID;
  approvedAt?: string;
  rejectedByUserId?: ID;
  rejectedAt?: string;
  retconnedByUserId?: ID;
  retconnedAt?: string;
}

export interface AiToolCall extends Timestamps {
  id: ID;
  threadId: ID;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  retry?: {
    retriedAt: string;
    startedCallId: ID;
    resultCallId: ID;
    resultStatus: "completed" | "failed";
  };
}

export interface AuditLog extends Timestamps {
  id: ID;
  campaignId?: ID;
  actorUserId?: ID;
  actorType: "user" | "ai" | "plugin" | "system";
  action: string;
  targetType: string;
  targetId?: ID;
  before?: unknown;
  after?: unknown;
}

export type PermissionName =
  | "campaign.read"
  | "campaign.update"
  | "campaign.delete"
  | "world.read"
  | "world.create"
  | "world.update"
  | "world.delete"
  | "scene.read"
  | "scene.create"
  | "scene.update"
  | "scene.delete"
  | "scene.activate"
  | "token.read"
  | "token.create"
  | "token.update"
  | "token.move"
  | "token.delete"
  | "token.reveal"
  | "actor.read"
  | "actor.create"
  | "actor.update"
  | "actor.delete"
  | "actor.readPrivate"
  | "actor.updateOwned"
  | "journal.read"
  | "journal.readSecret"
  | "journal.create"
  | "journal.update"
  | "journal.delete"
  | "handout.read"
  | "handout.readSecret"
  | "handout.create"
  | "handout.update"
  | "handout.delete"
  | "chat.read"
  | "chat.write"
  | "chat.moderate"
  | "combat.manage"
  | "plugin.install"
  | "plugin.configure"
  | "dice.roll"
  | "ai.use"
  | "ai.readPublicMemory"
  | "ai.readGmMemory"
  | "ai.proposeChanges"
  | "ai.applyChanges";

export type SystemCapability =
  | "data-model"
  | "actor-sheet"
  | "quick-rolls"
  | "actions"
  | "conditions"
  | "advancement"
  | "rest"
  | "compendium"
  | "character-templates"
  | "character-import"
  | "character-origins"
  | "encounter-builder"
  | "monster-builder";

/** Serializable system package metadata. Runtime code remains server-controlled. */
export interface SystemManifestData {
  id: string;
  name: string;
  version: string;
  compatibleCore: string;
  entrypoints: {
    client?: string;
    server?: string;
  };
  schemas: {
    actor: string;
    item: string;
  };
  permissions: PermissionName[];
  capabilities: SystemCapability[];
}

/** Durable record of an administrator-approved system registration. */
export interface SystemInstallation extends Timestamps {
  id: ID;
  manifest: SystemManifestData;
  installedByUserId: ID;
  authorizedByCampaignId: ID;
  source: "api";
}

export interface PermissionGrant extends Timestamps {
  id: ID;
  subjectType: "user" | "role" | "plugin" | "ai_assistant";
  subjectId: ID;
  campaignId: ID;
  permissions: PermissionName[];
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PluginStorageEntry extends Timestamps {
  id: ID;
  campaignId: ID;
  pluginId: ID;
  key: string;
  value: unknown;
  updatedByType: "user" | "plugin";
  updatedById: ID;
}

export type PluginReviewStatus = "pending" | "approved" | "rejected";

export interface PluginReview extends Timestamps {
  id: ID;
  reviewKey: string;
  pluginId: ID;
  packageId: ID;
  version: string;
  checksum: string;
  sourceType: "local" | "registry";
  registryUrl?: string;
  packageUrl?: string;
  status: PluginReviewStatus;
  notes?: string;
  reviewedByUserId?: ID;
  reviewedAt?: string;
}

export type ContentImportStatus = "previewed" | "applied" | "rolled_back" | "deleted";

export type ContentImportEntityKind = "actor" | "item" | "journal" | "handout" | "encounter";

export interface ContentImportSourceAdapter {
  id: ID;
  name: string;
  version: string;
  inputMimeTypes: string[];
  outputKinds: ContentImportEntityKind[];
  provenanceRequired: true;
}

export interface ContentImportSource {
  sourceType: "user_upload" | "adapter" | "manual";
  adapterId?: ID;
  sourceName: string;
  sourceUrl?: string;
  submittedByUserId: ID;
  submittedAt: string;
  license: ContentImportLicense;
  notes?: string;
}

export interface ContentImportLicense {
  name: string;
  url?: string;
  usage: "srd" | "open" | "user_provided" | "private_home_game";
  attribution?: string;
}

export interface ContentImportEntity {
  id: ID;
  kind: ContentImportEntityKind;
  name: string;
  selectedByDefault: boolean;
  provenance: ContentImportSource;
  data: Record<string, unknown>;
  warnings: string[];
}

export interface ContentImportAppliedRecord {
  collection: "actors" | "items" | "journals" | "handouts" | "encounters";
  id: ID;
  entityId: ID;
}

export interface ContentImportBatch extends Timestamps {
  id: ID;
  campaignId: ID;
  status: ContentImportStatus;
  source: ContentImportSource;
  entities: ContentImportEntity[];
  selectedEntityIds: ID[];
  appliedRecords: ContentImportAppliedRecord[];
  appliedAt?: string;
  appliedByUserId?: ID;
  rolledBackAt?: string;
  rolledBackByUserId?: ID;
  deletedAt?: string;
  deletedByUserId?: ID;
}

export type CampaignArchiveVersion = "0.1.0" | "0.2.0";

export interface CampaignArchive {
  format: "ottx";
  version: CampaignArchiveVersion;
  exportedAt: string;
  manifest: {
    campaignId: ID;
    name: string;
    schemaVersion: string;
    exportScope?: "campaign" | "world" | "selected_collections";
    exportScopeId?: ID;
    exportCollections?: Array<keyof EngineState>;
    dependencyWarnings?: string[];
    redactionMode?: "portable";
    compatibilityNotes?: string[];
    systemRequirements?: Array<Pick<SystemManifestData, "id" | "name" | "version" | "compatibleCore" | "capabilities">>;
    assetCount: number;
    assetFileCount?: number;
  };
  data: EngineState;
  files?: CampaignArchiveFile[];
}

export interface CampaignArchiveFile {
  assetId: ID;
  name: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  encoding: "base64";
  data: string;
}

export interface EngineState {
  users: User[];
  sessions: UserSession[];
  identities: AuthIdentity[];
  oauthStates: OAuthLoginState[];
  passwordResetTokens: PasswordResetToken[];
  emailOutbox: EmailOutboxMessage[];
  scimGroups: ScimGroup[];
  scimGroupRoleMappings: ScimGroupRoleMapping[];
  organizations: OrganizationWorkspace[];
  organizationMembers: OrganizationMember[];
  invites: CampaignInvite[];
  campaigns: Campaign[];
  members: CampaignMember[];
  worlds: World[];
  scenes: Scene[];
  assets: MapAsset[];
  tokens: Token[];
  actors: Actor[];
  items: Item[];
  journals: JournalEntry[];
  handouts: Handout[];
  chat: ChatMessage[];
  rolls: DiceRoll[];
  diceMacros: DiceMacro[];
  audioTracks: AudioTrack[];
  encounters: Encounter[];
  campaignSessions: CampaignSession[];
  combats: Combat[];
  compendia: CompendiumPack[];
  proposals: Proposal[];
  aiThreads: AiThread[];
  aiEvaluations: AiEvaluationRun[];
  aiMemory: AiMemoryFact[];
  aiToolCalls: AiToolCall[];
  auditLogs: AuditLog[];
  permissionGrants: PermissionGrant[];
  systemInstallations: SystemInstallation[];
  pluginStorage: PluginStorageEntry[];
  pluginReviews: PluginReview[];
  contentImports: ContentImportBatch[];
  fogPresets: FogPreset[];
  idempotencyRecords: IdempotencyRecord[];
  jobs: WorkerJobRecord[];
}

export interface IdempotencyRecord extends Timestamps {
  key: string;
  method: string;
  path: string;
  userId?: ID;
  requestHash: string;
  authorizationHash: string;
  statusCode: number;
  contentType?: string;
  responseBody: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type JobType =
  | "campaign.export"
  | "campaign.import"
  | "asset.storage.migrate"
  | "asset.storage.cleanup"
  | "storage.backup"
  | "storage.restoreDrill"
  | "ai.memory.extract"
  | "ai.session.recap"
  | "report.bundle";

export interface JobProgress {
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
}

export interface JobLogEntry {
  at: string;
  level: "info" | "warning" | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface WorkerJobRecord extends Timestamps {
  id: ID;
  type: JobType;
  status: JobStatus;
  payload: unknown;
  output?: unknown;
  error?: string;
  progress?: JobProgress;
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledByUserId?: ID;
  leasedBy?: string;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  createdByUserId?: ID;
  updatedByUserId?: ID;
  logs: JobLogEntry[];
}
