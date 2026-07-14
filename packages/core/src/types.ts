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
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: "midnight" | "ember";
  dice3dEnabled: boolean;
  reducedMotion: boolean;
  chatNotifications: "all" | "mentions" | "none";
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
  /** Stable logical delivery identity reused across transport retries. */
  deliveryId?: ID;
  /** Monotonic local attempt counter for transport diagnostics. */
  deliveryAttempts?: number;
  lastDeliveryAttemptAt?: string;
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
  /** Last committed authoritative realtime event cursor. Legacy campaigns start at zero. */
  eventSequence?: number;
  /** Campaign-scoped AI transmission and local-retention policy. Legacy rows use the conservative API defaults. */
  aiPolicy?: AiCampaignPolicy;
  /** Undefined preserves the legacy optional character-review workflow. */
  characterReviewPolicy?: DndCharacterReviewPolicy;
  /** Versioned campaign-level rules choices. Unknown toggle keys are preserved for installed systems. */
  rulesProfile?: CampaignRulesProfile;
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

export type WorldRecordKind = "npc" | "location" | "quest" | "faction";
export type WorldRecordLifecycle = "draft" | "active" | "inactive" | "resolved" | "archived";

/** Typed campaign knowledge independent of free-form journal prose. */
export interface WorldRecord extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  kind: WorldRecordKind;
  name: string;
  summary: string;
  description: string;
  lifecycle: WorldRecordLifecycle;
  visibility: Visibility;
  tags: string[];
  metadata: Record<string, unknown>;
  createdByUserId: ID;
  updatedByUserId: ID;
  resolvedAt?: string;
  archivedAt?: string;
}

export type WorldRelationType =
  | "located_in"
  | "member_of"
  | "allied_with"
  | "opposed_to"
  | "serves"
  | "leads"
  | "involved_in"
  | "related_to";

/** A typed, revisioned edge between two world records. */
export interface WorldRelation extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  sourceRecordId: ID;
  targetRecordId: ID;
  type: WorldRelationType;
  label?: string;
  notes?: string;
  visibility: Visibility;
  createdByUserId: ID;
  updatedByUserId: ID;
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
  /** Explicitly authored movement-cost areas. Missing on legacy scenes. */
  difficultTerrain?: DifficultTerrainRegion[];
  /** GM-authored cover rulings between a source and target token. Missing on legacy scenes. */
  coverOverrides?: SceneCoverOverride[];
  metadata: Record<string, unknown>;
  /** Optional member-specific delegation scoped to this scene only. */
  permissions?: Record<ID, PermissionName[]>;
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
  difficultTerrain?: DifficultTerrainRegion[];
  coverOverrides?: SceneCoverOverride[];
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

export type WallKind = "wall" | "terrain" | "door" | "window";

export interface Wall {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  blocksVision: boolean;
  blocksMovement?: boolean;
  kind?: WallKind;
  /** Open doors and windows do not block vision or movement. */
  open?: boolean;
}

export interface CampaignRulesProfile {
  profileId: string;
  rulesVersion: string;
  toggles: Record<string, boolean>;
}

export type LightSourceKind = "light" | "darkness";

export interface LightSource {
  id: ID;
  x: number;
  y: number;
  radius: number;
  brightRadius?: number;
  dimRadius?: number;
  color: string;
  intensity?: number;
  /** Defaults to light for records created before typed lighting. */
  kind?: LightSourceKind;
  /** Distinguishes effects such as magical darkness from mundane darkness. */
  magical?: boolean;
}

export interface DifficultTerrainRegion extends Timestamps {
  id: ID;
  sceneId: ID;
  label: string;
  /** Polygon vertices in scene-space coordinates. */
  points: VisionPoint[];
  color?: string;
  createdByUserId: ID;
}

export type CoverLevel = "none" | "half" | "three_quarters" | "total";

export interface SceneCoverOverride extends Timestamps {
  id: ID;
  sceneId: ID;
  sourceTokenId: ID;
  targetTokenId: ID;
  level: CoverLevel;
  note?: string;
  createdByUserId: ID;
}

export interface ScenePathMeasurement {
  sceneId: ID;
  points: VisionPoint[];
  /** Physical distance outside authored difficult-terrain regions. */
  normalDistance: number;
  /** Physical distance inside one or more authored difficult-terrain regions. */
  difficultTerrainDistance: number;
  /** Physical path length before terrain cost is applied. */
  totalDistance: number;
  /** Movement cost with difficult-terrain distance counted twice. */
  movementCostDistance: number;
  unit: "scene" | "feet";
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
  senseType?: TokenSenseType;
  lightingEffect?: LightSourceKind;
  magical?: boolean;
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
  senseType?: TokenSenseType;
  lightingEffect?: LightSourceKind;
  magical?: boolean;
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
  /** Optional, rebuildable image derivatives. Original bytes remain authoritative. */
  renditions?: AssetRendition[];
  image?: AssetImageMetadata;
}

export type AssetRenditionKind = "thumbnail" | "optimized";

export interface AssetImageMetadata {
  width: number;
  height: number;
  animated?: boolean;
}

export interface AssetRendition {
  kind: AssetRenditionKind;
  mimeType: "image/webp";
  sizeBytes: number;
  checksum: string;
  width: number;
  height: number;
  storage: AssetStorageRef;
  createdAt: string;
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

export type TokenSenseType = "normal" | "darkvision" | "blindsight" | "tremorsense" | "truesight";

export interface TokenSense {
  type: TokenSenseType;
  /** Range in scene-space units, matching the existing token vision radii. */
  range: number;
}

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
  /** Vertical position in game-world feet; zero is ground level. */
  elevation?: number;
  layer?: TokenLayer;
  hidden: boolean;
  locked: boolean;
  visionEnabled: boolean;
  visionRadius: number;
  brightVisionRadius?: number;
  dimVisionRadius?: number;
  /** Optional typed senses layered on top of legacy bright/dim vision. */
  senses?: TokenSense[];
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

export type CharacterTransferStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface CharacterTransfer extends Timestamps {
  id: ID;
  campaignId: ID;
  actorId: ID;
  fromUserId?: ID;
  toUserId: ID;
  initiatedByUserId: ID;
  actorUpdatedAt: string;
  status: CharacterTransferStatus;
  resolvedAt?: string;
  resolvedByUserId?: ID;
}

/** Prepared D&D commit families whose exact state roots can be undone. */
export type DndRulesMutationKind = "typed_damage" | "action" | "effect_schedule" | "concentration";

export type DndRulesMutationStatus = "applied" | "undone";

/**
 * Exact pre-commit actor root plus the revision written by the commit.
 * Undo must require the current Actor.updatedAt to equal `afterRevision`.
 */
export interface DndRulesMutationActorRoot {
  actorId: ID;
  before: {
    data: Record<string, unknown>;
    revision: string;
  };
  afterRevision: string;
}

/**
 * Exact pre-commit item root plus the revision written by the commit.
 * Undo must require the current Item.updatedAt to equal `afterRevision`.
 */
export interface DndRulesMutationItemRoot {
  itemId: ID;
  before: {
    data: Record<string, unknown>;
    revision: string;
  };
  afterRevision: string;
}

/**
 * Combat mutations retain the full pre-commit row because scheduled effects
 * can change combatants, history, and schedule events in one atomic commit.
 */
export interface DndRulesMutationCombatRoot {
  combatId: ID;
  before: Combat;
  afterRevision: string;
}

export interface DndRulesMutationRoots {
  actors: DndRulesMutationActorRoot[];
  items: DndRulesMutationItemRoot[];
  combat?: DndRulesMutationCombatRoot;
}

/**
 * Durable, server-authored undo ledger for prepared D&D rules commits.
 * Root snapshots must be captured before mutation and stored as detached data.
 */
export interface DndRulesMutation extends Timestamps {
  id: ID;
  campaignId: ID;
  kind: DndRulesMutationKind;
  preparedPreviewKey: string;
  committedByUserId: ID;
  status: DndRulesMutationStatus;
  roots: DndRulesMutationRoots;
  undoneAt?: string;
  undoneByUserId?: ID;
}

export interface DndRulesMutationUndoDescriptor {
  mutationId: ID;
  expectedActorUpdatedAt: Record<ID, string>;
  expectedItemUpdatedAt: Record<ID, string>;
  expectedCombatUpdatedAt?: string;
}

export type DndRulesMutationUndoRequest = Omit<DndRulesMutationUndoDescriptor, "mutationId">;

export interface DndRulesMutationUndoResult {
  undone: true;
  mutation: DndRulesMutation;
  actors: Actor[];
  items: Item[];
  combat?: Combat;
}

export interface Dnd5eSrdPreparedActionCommitRequest {
  preparedPreviewKey: string;
  expectedUpdatedAt: string;
}

export interface Dnd5eSrdTypedDamageApplyRequest {
  preparedPreviewKey: string;
  expectedActorUpdatedAt: Record<ID, string>;
  expectedItemUpdatedAt: Record<ID, string>;
  /** Required when the reviewed targets participate in an active combat. */
  expectedCombatUpdatedAt?: string;
}

export interface Dnd5eSrdTypedDamageApplyResult {
  applied: true;
  actor: Actor;
  actors: Actor[];
  /** Present when applying damage synchronized an active combatant lifecycle. */
  combat?: Combat;
  previews: Array<{ actorId: ID; actorName: string; preview: Record<string, unknown> }>;
  rulesMutationId: ID;
  undo: DndRulesMutationUndoDescriptor;
}

export interface Dnd5eSrdPendingAdvancementCancelRequest {
  pendingAdvancementId: ID;
  expectedUpdatedAt: string;
}

export interface Dnd5eSrdPendingAdvancementCancelResult {
  cancelled: true;
  actorId: ID;
  pendingAdvancementId: ID;
}

/** Durable lifecycle for a rules-previewed actor advancement awaiting confirmation. */
export type Dnd5eSrdPendingAdvancementStatus = "draft" | "ready";

/**
 * Server-authored advancement state. `preparedPreviewKey` binds the stored
 * request to the preview that was prepared against `actorUpdatedAt`.
 */
export interface Dnd5eSrdPendingAdvancement extends Timestamps {
  id: ID;
  campaignId: ID;
  actorId: ID;
  systemId: "dnd-5e-srd";
  status: Dnd5eSrdPendingAdvancementStatus;
  request: Record<string, unknown>;
  preparedPreviewKey?: string;
  actorUpdatedAt: string;
  createdByUserId: ID;
}

export type Dnd5eSrdSpellPreparationTiming = "long-rest" | "class-level";

export type Dnd5eSrdSpellPreparationBlockerCode =
  | "unsupported_actor"
  | "manual_legacy_spellcasting"
  | "capacity_unverified"
  | "later_level_spell_acquisition_manual"
  | "timing_mismatch"
  | "always_prepared_excluded"
  | "spell_not_owned"
  | "class_spell_unverified"
  | "class_source_ambiguous"
  | "spell_level_unavailable"
  | "wizard_spellbook_unverified"
  | "capacity_exceeded"
  | "change_limit_exceeded"
  | "duplicate_selection";

export interface Dnd5eSrdSpellPreparationBlocker {
  code: Dnd5eSrdSpellPreparationBlockerCode;
  message: string;
  itemId?: ID;
}

export interface Dnd5eSrdSpellPreparationCapacity {
  className: string;
  limit: number;
  selected: number;
  alwaysPrepared: number;
  source: "stored" | "class-progression" | "level-one-class";
  classes?: Array<{ className: string; limit: number; selected: number }>;
}

export interface Dnd5eSrdSpellPreparationChange {
  itemId: ID;
  name: string;
  compendiumEntryId: string;
  fromPrepared: boolean;
  toPrepared: boolean;
}

export interface Dnd5eSrdSpellPreparationPlan {
  status: "ready" | "blocked";
  actorId: ID;
  className?: string;
  timing: Dnd5eSrdSpellPreparationTiming;
  requiredTiming?: Dnd5eSrdSpellPreparationTiming;
  capacity?: Dnd5eSrdSpellPreparationCapacity;
  selectedSpellIds: ID[];
  eligibleSpellIds: ID[];
  alwaysPreparedSpellIds: ID[];
  ritualCastableSpellIds?: ID[];
  changes: Dnd5eSrdSpellPreparationChange[];
  blockers: Dnd5eSrdSpellPreparationBlocker[];
  warnings: string[];
}

export interface Dnd5eSrdSpellPreparationPreviewRequest {
  selectedSpellIds: ID[];
  timing: Dnd5eSrdSpellPreparationTiming;
  expectedActorUpdatedAt: string;
  expectedItemUpdatedAt: Record<ID, string>;
}

export interface Dnd5eSrdSpellPreparationPreviewResponse extends Dnd5eSrdSpellPreparationPlan {
  preparedPreviewKey: string;
  actorUpdatedAt: string;
  itemUpdatedAt: Record<ID, string>;
}

export interface Dnd5eSrdSpellPreparationApplyRequest {
  preparedPreviewKey: string;
  expectedActorUpdatedAt: string;
  expectedItemUpdatedAt: Record<ID, string>;
}

export interface Dnd5eSrdSpellPreparationMutationResult {
  applied: true;
  actor: Actor;
  items: Item[];
  plan: Dnd5eSrdSpellPreparationPlan;
}

export type DndControlledCreatureKind = "summon" | "transformation" | "persistent_companion";

export interface DndControlledCreatureSource {
  kind: "spell" | "feature";
  /** Actor that cast the spell or used the feature. */
  actorId: ID;
  /** Actor-owned spell or feature Item. */
  itemId: ID;
  name: string;
  systemId: "dnd-5e-srd";
  rulesVersion: string;
}

export type DndControlledCreatureDuration =
  | { mode: "rounds"; combatId: ID; expiresAtRound: number }
  | { mode: "until_time"; expiresAt: string }
  | { mode: "until_dismissed" }
  | { mode: "persistent" };

export interface DndControlledCreatureConcentration {
  sourceActorId: ID;
  groupId: string;
}

export type DndControlledCreatureInitiative =
  | { mode: "shared"; sourceActorId: ID }
  | { mode: "independent"; value?: number };

export interface DndControlledCreatureCommandRequirement {
  required: boolean;
  action: "action" | "bonus_action" | "reaction" | "free" | "none";
  note?: string;
}

export interface DndControlledCreatureLastCommand {
  commandedAt: string;
  commandedByUserId: ID;
  action: DndControlledCreatureCommandRequirement["action"];
  note?: string;
  combatId?: ID;
  round?: number;
}

export interface DndControlledCreatureTransformationSnapshot {
  actor: {
    name: string;
    type: string;
    imageAssetId?: ID;
    data: Record<string, unknown>;
  };
  /** Only items changed by the transformation are captured. */
  items: Array<{
    id: ID;
    actorId?: ID;
    data: Record<string, unknown>;
  }>;
  combatants: Array<{
    combatId: ID;
    combatantId: ID;
    initiative: number;
  }>;
}

/** Typed metadata stored at Actor.data.dnd5eControlledCreature. */
export interface DndControlledCreatureRecord extends Timestamps {
  version: 1;
  id: ID;
  campaignId: ID;
  kind: DndControlledCreatureKind;
  status: "active" | "dismissed" | "expired" | "concentration_ended" | "reverted";
  source: DndControlledCreatureSource;
  controllerUserId: ID;
  controllerActorId: ID;
  ownerUserId: ID;
  linkedActorId: ID;
  linkedTokenIds: ID[];
  duration: DndControlledCreatureDuration;
  concentration?: DndControlledCreatureConcentration;
  initiative: DndControlledCreatureInitiative;
  command: DndControlledCreatureCommandRequirement;
  lastCommand?: DndControlledCreatureLastCommand;
  transformation?: {
    hpCarryover: "preserve" | "replace";
    equipmentCarryover: "preserve" | "suppress";
    snapshot: DndControlledCreatureTransformationSnapshot;
  };
}

export interface DndControlledCreatureActorTemplate {
  name: string;
  type: string;
  imageAssetId?: ID;
  data: Record<string, unknown>;
}

export interface DndControlledCreatureTokenTemplate {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  hidden?: boolean;
  disposition: "friendly" | "neutral" | "hostile";
  imageAssetId?: ID;
}

export interface DndControlledCreatureCreateRequest {
  kind: DndControlledCreatureKind;
  sceneId?: ID;
  combatId?: ID;
  targetActorId?: ID;
  source: DndControlledCreatureSource;
  controllerUserId: ID;
  controllerActorId: ID;
  ownerUserId: ID;
  actor: DndControlledCreatureActorTemplate;
  token?: DndControlledCreatureTokenTemplate;
  duration: DndControlledCreatureDuration;
  concentration?: DndControlledCreatureConcentration;
  initiative: DndControlledCreatureInitiative;
  command: DndControlledCreatureCommandRequirement;
  transformation?: {
    hpCarryover?: "preserve" | "replace";
    equipmentCarryover?: "preserve" | "suppress";
  };
  /** A human confirmed every warning returned by the immediately preceding preview. */
  manualReviewConfirmed?: boolean;
}

export type DndControlledCreatureManualReviewCategory = "stat_block" | "hit_points" | "equipment" | "concentration" | "initiative";

export interface DndControlledCreatureManualReview {
  id: string;
  category: DndControlledCreatureManualReviewCategory;
  message: string;
  resolution: string;
}

export interface DndControlledCreatureRevisionSet {
  actors: Record<ID, string>;
  items: Record<ID, string>;
  tokens: Record<ID, string>;
  combats: Record<ID, string>;
  scenes: Record<ID, string>;
  encounters: Record<ID, string>;
}

export interface DndControlledCreaturePreview {
  campaignId: ID;
  systemId: "dnd-5e-srd";
  previewToken: string;
  ready: boolean;
  summary: string;
  errors: string[];
  manualReview: DndControlledCreatureManualReview[];
  warnings: string[];
  requiredRevisions: DndControlledCreatureRevisionSet;
  affected: {
    actorIds: ID[];
    itemIds: ID[];
    tokenIds: ID[];
    combatIds: ID[];
    sceneIds: ID[];
  };
}

export interface DndControlledCreatureConfirmRequest {
  request: DndControlledCreatureCreateRequest;
  previewToken: string;
  expectedUpdatedAt: DndControlledCreatureRevisionSet;
}

export interface DndControlledCreatureEndRequest {
  reason: "dismissed" | "expired";
  expectedUpdatedAt: DndControlledCreatureRevisionSet;
}

export interface DndControlledCreatureCommandRequest {
  expectedUpdatedAt: DndControlledCreatureRevisionSet;
  note?: string;
  combatId?: ID;
  round?: number;
}

export interface DndControlledCreatureConcentrationEndRequest {
  sourceActorId: ID;
  groupId: string;
  reason?: string;
  expectedUpdatedAt: DndControlledCreatureRevisionSet;
}

export interface DndControlledCreatureMutationResult {
  action: "created" | "transformed" | "commanded" | "dismissed" | "expired" | "concentration_ended" | "reverted";
  records: DndControlledCreatureRecord[];
  actors: Actor[];
  tokens: Token[];
  combats: Combat[];
  removedActorIds: ID[];
  removedTokenIds: ID[];
}

export interface DndCharacterReviewPolicy {
  mode: "optional" | "required";
  updatedAt: string;
  updatedByUserId: ID;
}

/**
 * Portable provenance for characters created through the strict bundled
 * level-one workflow. Imported, homebrew, and legacy actors intentionally do
 * not need this marker.
 */
export interface Dnd5eLevelOneCharacterCreationProvenance {
  version: 1;
  mode: "level-one-srd";
  templateId: string;
  options: Record<string, unknown>;
}

export interface DndCharacterReviewValidationIssue {
  entityKind: "actor" | "item";
  entityId: ID;
  path: string;
  severity: "error" | "warning";
  code: string;
  message: string;
}

/** Portable validation evidence captured at submission time. */
export interface DndCharacterReviewValidationSnapshot {
  systemId: "dnd-5e-srd";
  rulesVersion: string;
  actorSchemaVersion: string;
  itemSchemaVersion: string;
  errors: number;
  warnings: number;
  issues: DndCharacterReviewValidationIssue[];
}

export interface DndCharacterReviewDecision {
  status: "approved" | "changes_requested";
  decidedAt: string;
  decidedByUserId: ID;
  /** Required for changes_requested and for approval that overrides validation errors. */
  reason?: string;
  overrideValidation: boolean;
}

/** Typed metadata stored at Actor.data.dnd5eCharacterReview. */
export interface DndCharacterReviewState {
  version: 1;
  id: ID;
  status: "submitted" | "approved" | "changes_requested";
  fingerprint: string;
  submittedAt: string;
  submittedByUserId: ID;
  validation: DndCharacterReviewValidationSnapshot;
  decision?: DndCharacterReviewDecision;
}

export type DndCharacterReviewEffectiveStatus = "not_submitted" | "submitted" | "approved" | "changes_requested" | "stale";

export interface DndCharacterReviewEntry {
  actor: Actor;
  review?: DndCharacterReviewState;
  effectiveStatus: DndCharacterReviewEffectiveStatus;
  stale: boolean;
  currentFingerprint: string;
  currentValidation: DndCharacterReviewValidationSnapshot;
  expectedActorUpdatedAt: string;
  expectedItemUpdatedAt: Record<ID, string>;
}

export interface DndCharacterReviewListResponse {
  policy: { mode: DndCharacterReviewPolicy["mode"]; configured: boolean };
  campaignUpdatedAt: string;
  entries: DndCharacterReviewEntry[];
}

export interface DndCharacterReviewSubmitRequest {
  expectedActorUpdatedAt: string;
  expectedItemUpdatedAt: Record<ID, string>;
}

export interface DndCharacterReviewDecisionRequest {
  action: "approve" | "request_changes";
  expectedActorUpdatedAt: string;
  expectedFingerprint: string;
  reason?: string;
  overrideValidation?: boolean;
}

export interface DndCharacterReviewPolicyUpdateRequest {
  mode: DndCharacterReviewPolicy["mode"];
  expectedCampaignUpdatedAt: string;
}

/** D&D inventory ownership is explicit for actorless party-stash items. Actor-bound items continue to use Item.actorId. */
export type Dnd5eInventoryOwnerRef =
  | { kind: "actor"; actorId: ID }
  | { kind: "party_stash"; stashId: ID };

/** Typed metadata stored under Item.data.dnd5eInventory by the strict inventory routes. */
export interface Dnd5eInventoryMetadata {
  version: 1;
  quantity: number;
  weightLb: number;
  storage?: { kind: "party_stash"; stashId: ID };
  parentItemId?: ID;
  container?: {
    capacityLb: number;
    extradimensional?: boolean;
  };
  /** Selected ammunition stack for a weapon. The stack must share the same owner and match the weapon's ammunition kind. */
  ammunitionSourceItemId?: ID;
}

export interface Dnd5eContainerSummary {
  itemId: ID;
  name: string;
  capacityLb: number;
  contentsWeightLb: number;
  remainingCapacityLb: number;
  overCapacityByLb: number;
  depth: number;
  extradimensional: boolean;
}

export interface Dnd5eCarryingSummary {
  owner: Dnd5eInventoryOwnerRef;
  itemCount: number;
  totalQuantity: number;
  carriedWeightLb: number;
  capacityLb?: number;
  remainingCapacityLb?: number;
  overCapacityByLb: number;
  status: "within_capacity" | "over_capacity" | "manual_review";
  containers: Dnd5eContainerSummary[];
  warnings: string[];
}

/** Campaign-scoped Item.data.dnd5ePartyStash payload. */
export interface Dnd5ePartyStashData {
  version: 1;
  name: string;
  capacityLb?: number;
  currency: Record<string, number>;
}

export interface Dnd5eMerchantCatalogEntry {
  id: ID;
  name: string;
  type: string;
  unitPriceGp: number;
  sellPriceGp?: number;
  /** Undefined means the merchant does not track stock for this entry. */
  availableQuantity?: number;
  compendiumEntryId?: ID;
  data: Record<string, unknown>;
}

/** Campaign-scoped Item.data.dnd5eMerchant payload. */
export interface Dnd5eMerchantData {
  version: 1;
  name: string;
  description: string;
  buybackRate: number;
  /** Undefined means merchant liquidity is resolved manually by the GM. */
  currency?: Record<string, number>;
  catalog: Dnd5eMerchantCatalogEntry[];
}

/** Typed combat-loot lifecycle stored under Item.data.dnd5eLoot. */
export interface Dnd5eLootData {
  version: 1;
  combatId: ID;
  rewardId: ID;
  status: "available" | "claimed" | "assigned";
  claimedByUserId?: ID;
  claimedForActorId?: ID;
  assignedByUserId?: ID;
  assignedToActorId?: ID;
  assignedAt?: string;
}

export interface Dnd5eInventoryOverview {
  campaignId: ID;
  campaignUpdatedAt: string;
  actor?: Actor;
  actorItems: Item[];
  actorSummary?: Dnd5eCarryingSummary;
  partyStash?: Item;
  partyStashItems: Item[];
  partyStashSummary?: Dnd5eCarryingSummary;
  merchants: Item[];
  lootItems: Item[];
  warnings: string[];
}

export type JournalEntryKind = "folder" | "entry";

export type JournalEntityType =
  | "actor"
  | "scene"
  | "item"
  | "journal"
  | "handout"
  | "encounter";

/** A deliberate knowledge-graph edge authored on a journal entry. */
export interface JournalEntityLink {
  id: ID;
  targetType: JournalEntityType;
  targetId: ID;
  label?: string;
}

export type JournalCanonStatus = "draft" | "in_review" | "canonical" | "rejected";

/** Immutable content snapshot captured before each journal mutation. */
export interface JournalEntryRevision {
  id: ID;
  revision: number;
  kind: JournalEntryKind;
  parentId?: ID;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: ID[];
  visibleToActorIds: ID[];
  tags: string[];
  links: JournalEntityLink[];
  canonStatus: JournalCanonStatus;
  changedBy: ID;
  createdAt: string;
}

export interface JournalBacklink {
  sourceEntryId: ID;
  sourceTitle: string;
  link: JournalEntityLink;
}

export interface JournalEntry extends Timestamps {
  id: ID;
  campaignId: ID;
  worldId?: ID;
  parentId?: ID;
  /** Legacy entries normalize to `entry`. */
  kind?: JournalEntryKind;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: ID[];
  visibleToActorIds: ID[];
  tags: string[];
  /** Legacy entries normalize to an empty list. API payloads filter inaccessible targets. */
  links?: JournalEntityLink[];
  /** Monotonic content revision; legacy entries normalize to 1. */
  revision?: number;
  /** Internal immutable history. Normal journal reads omit this field. */
  revisions?: JournalEntryRevision[];
  /** AI- or player-authored content is never canonical without an explicit DM review action. */
  canonStatus?: JournalCanonStatus;
  canonReviewedBy?: ID;
  canonReviewedAt?: string;
  canonReviewNote?: string;
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
  /** Immutable, server-authored encounter reward distributions. */
  rewards?: CombatReward[];
  /** GM-authored lair actions and regional effects. These remain prompts, not an executable rules DSL. */
  environmentMechanics?: CombatEnvironmentMechanic[];
  /** Bounded, server-authored history of explicit environment-mechanic triggers. */
  environmentMechanicTriggers?: CombatEnvironmentMechanicTrigger[];
  /** Bounded, server-authored history of deterministic scheduled-effect evaluations. */
  effectScheduleEvents?: RulesEffectScheduleEvent[];
}

export type CombatEnvironmentMechanicKind = "lair_action" | "regional_effect";
export type CombatEnvironmentMechanicTiming = "initiative_count" | "round_start" | "round_end" | "manual";

export interface CombatEnvironmentMechanicSchedule {
  timing: CombatEnvironmentMechanicTiming;
  /** Required only for initiative-count scheduling. */
  initiativeCount?: number;
  startsAtRound: number;
  intervalRounds: number;
}

export interface CombatEnvironmentMechanicOption {
  id: ID;
  name: string;
  description: string;
}

export interface CombatEnvironmentMechanic extends Timestamps {
  id: ID;
  kind: CombatEnvironmentMechanicKind;
  name: string;
  description: string;
  visibility: "public" | "gm_only";
  enabled: boolean;
  schedule: CombatEnvironmentMechanicSchedule;
  options: CombatEnvironmentMechanicOption[];
  triggerCount: number;
  lastTriggeredRound?: number;
  lastTriggeredAt?: string;
  lastOptionId?: ID;
}

export interface CombatEnvironmentMechanicTrigger extends Timestamps {
  id: ID;
  mechanicId: ID;
  mechanicKind: CombatEnvironmentMechanicKind;
  mechanicName: string;
  round: number;
  turnIndex: number;
  optionId?: ID;
  optionName?: string;
  summary: string;
  visibility: "public" | "gm_only";
  triggeredByUserId: ID;
}

export type RulesEffectScheduleTiming =
  | "start_turn"
  | "end_turn"
  | "start_round"
  | "end_round"
  | "initiative_count"
  | "time"
  | "manual";

export interface RulesEffectRepeatSave {
  ability: string;
  dc?: number;
  endsOn: "success" | "failure";
}

/** Optional shape embedded in actor rulesEngine.activeEffects records. */
export interface RulesEffectSchedule {
  timing: RulesEffectScheduleTiming;
  anchorActorId?: ID;
  initiativeCount?: number;
  nextRound?: number;
  intervalRounds?: number;
  remainingTriggers?: number;
  expiresAtRound?: number;
  expiresAt?: string;
  repeatSave?: RulesEffectRepeatSave;
}

export interface RulesEffectScheduleEvent extends Timestamps {
  id: ID;
  effectId: ID;
  actorId: ID;
  label: string;
  phase: RulesEffectScheduleTiming;
  round: number;
  turnIndex: number;
  status: "triggered" | "save_required" | "save_succeeded" | "save_failed" | "expired";
  saveAbility?: string;
  saveDc?: number;
  outcome?: "success" | "failure";
}

export interface CombatReward extends Timestamps {
  id: ID;
  campaignId: ID;
  combatId: ID;
  awardedByUserId: ID;
  recipientActorIds: ID[];
  totalXp: number;
  xpPerActor: number;
  unallocatedXp: number;
  totalGp: number;
  gpPerActor: number;
  unallocatedGp: number;
  loot: string[];
  /** Durable Item records created by the strict D&D loot workflow. */
  lootItemIds?: ID[];
  note?: string;
}

export interface Combatant {
  id: ID;
  tokenId: ID;
  actorId?: ID;
  /** GM-reviewed hidden participants are omitted from non-manager combat payloads until revealed. */
  hidden?: boolean;
  /** Surprise is reviewed at combat start and imposes disadvantage on D&D initiative. */
  surprised?: boolean;
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
  /** Prepared preview that authored this consequential action. */
  preparedPreviewKey?: string;
  /** Exact mutable roots required when a GM confirms the pending action. */
  expectedActorUpdatedAt?: Record<ID, string>;
  expectedItemUpdatedAt?: Record<ID, string>;
  expectedCombatUpdatedAt?: string;
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

export type CompendiumSourceKind = "srd" | "bundled" | "user";

/** Portable content identity kept beside every compendium entry and imported actor item. */
export interface CompendiumProvenance {
  sourceKind: CompendiumSourceKind;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  systemId: ID;
  systemVersion: string;
  rulesVersion: string;
  license: ContentImportLicense;
}

export interface CompendiumCatalogEntry {
  id: ID;
  type: string;
  name: string;
  summary: string;
  data: Record<string, unknown>;
  provenance: CompendiumProvenance;
}

export interface CompendiumProvenanceSummary {
  totalEntries: number;
  filteredEntries: number;
  types: Record<string, number>;
  sources: Array<{
    sourceKind: CompendiumSourceKind;
    sourceName: string;
    sourceVersion: string;
    contentVersion: string;
    license: ContentImportLicense;
    entryCount: number;
  }>;
}

export type CompendiumConflictKind = "exact_duplicate" | "version_conflict";
export type CompendiumConflictChoice = "keep_existing" | "replace_existing" | "merge_existing";

export interface CompendiumConflict {
  kind: CompendiumConflictKind;
  entryId: ID;
  requestedVersion: string;
  existingVersion?: string;
  existingItemId?: ID;
  choices: CompendiumConflictChoice[];
}

export type CalculationSourceKind = "actor" | "system" | "class" | "feature" | "item" | "condition" | "override" | "manual";

export interface CalculationSource {
  kind: CalculationSourceKind;
  id: ID;
  name: string;
  version?: string;
  url?: string;
}

export interface CalculationTerm {
  label: string;
  /** Numeric contribution. Negative values are penalties. */
  signedValue?: number;
  /** Dice, multiplication, cap, or other non-additive contribution. */
  formula?: string;
  source: CalculationSource;
}

export interface CalculationFlags {
  manual: boolean;
  override: boolean;
  unsupported: boolean;
  ambiguous: boolean;
  reasons: string[];
}

export interface CalculationFieldExplanation {
  id: ID;
  group: "abilities" | "defenses" | "vitality" | "checks" | "skills" | "magic" | "actions";
  label: string;
  result: number | string;
  unit?: string;
  /** Terms are intentionally ordered in evaluation/display order. */
  terms: CalculationTerm[];
  flags: CalculationFlags;
}

export interface ActorCalculationExplanation {
  actorId: ID;
  systemId: ID;
  systemVersion: string;
  rulesVersion: string;
  source: {
    name: string;
    version: string;
    license: ContentImportLicense;
  };
  fields: CalculationFieldExplanation[];
}

export type CalculationOverrideSource = "gm_manual" | "house_rule" | "migration" | "plugin";

/** Durable, reasoned per-field override ledger entry. Cleared rows remain as history. */
export interface CalculationOverride extends Timestamps {
  id: ID;
  campaignId: ID;
  actorId: ID;
  fieldId: ID;
  source: CalculationOverrideSource;
  baseValue: number | string;
  effectiveValue: number | string;
  reason: string;
  createdByUserId: ID;
  clearedAt?: string;
  clearedByUserId?: ID;
  clearReason?: string;
}

export type CampaignCompatibilityStatus = "compatible" | "warning" | "blocking";
export type CampaignCompatibilityIssueSeverity = Exclude<CampaignCompatibilityStatus, "compatible">;
export type CampaignCompatibilityIssueGroup = "core" | "archive" | "system" | "reference" | "validation" | "compendium" | "manual";

export interface CampaignCompatibilityIssue {
  id: ID;
  group: CampaignCompatibilityIssueGroup;
  severity: CampaignCompatibilityIssueSeverity;
  code: string;
  title: string;
  detail: string;
  action: string;
  entityType?: "campaign" | "system" | "actor" | "item" | "condition";
  entityId?: ID;
}

export interface CampaignSystemCoverage {
  systemId: ID;
  name?: string;
  installedVersion?: string;
  compatibleCore?: string;
  coreCompatible: boolean;
  bundled: boolean;
  default: boolean;
  actorCount: number;
  itemCount: number;
  actorRulesVersions: Record<string, number>;
  itemContentVersions: Record<string, number>;
}

export interface CampaignCompatibilityRepairCandidate {
  id: ID;
  entityKind: "actor" | "item";
  entityId: ID;
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after: unknown;
  issue: {
    severity: "error" | "warning";
    code: string;
    message: string;
  };
  rationale: string;
  inverse: {
    operation: "add" | "remove" | "replace";
    path: string;
    before?: unknown;
    after?: unknown;
  };
}

export interface CampaignCompatibilityReport {
  campaignId: ID;
  readOnly: true;
  status: CampaignCompatibilityStatus;
  summary: {
    compatible: number;
    warning: number;
    blocking: number;
    totalIssues: number;
  };
  platform: {
    coreVersion: string;
    currentArchiveVersion: CampaignArchiveVersion;
    supportedArchiveVersions: CampaignArchiveVersion[];
    dndRulesVersion: string;
    dndActorSchemaVersion: string;
    dndItemSchemaVersion: string;
  };
  systems: CampaignSystemCoverage[];
  validation: {
    actorReports: number;
    itemReports: number;
    errors: number;
    warnings: number;
    repairPreview: {
      /** Deterministic candidates only; the read-only report never applies them. */
      automaticChanges: number;
      manualIssues: number;
      note: string;
      candidates: CampaignCompatibilityRepairCandidate[];
    };
  };
  compendium: {
    trackedEntries: number;
    currentEntries: number;
    driftedEntries: number;
    missingProvenance: number;
    unknownEntries: number;
  };
  calculationFlags: {
    manualFields: number;
    overrideFields: number;
    unsupportedFields: number;
    ambiguousFields: number;
  };
  issues: CampaignCompatibilityIssue[];
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
  provenance?: CompendiumProvenance;
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
  /** Permission-filtered source registry advertised to the provider for this turn. */
  sources?: AiSourceReference[];
  /** Structured claims validated against `sources`; unsupported claims are retained for review, never promoted. */
  citations?: AiCitation[];
  citationWarnings?: AiCitationWarning[];
  contextScopes?: AiContextScope[];
  policyRevision?: number;
  /** Local operational-retention deadline. This does not assert deletion by an upstream provider. */
  retentionExpiresAt?: string;
  usage?: AiUsageMetrics;
}

export type AiSourceKind =
  | "official_open_rules"
  | "campaign_canon"
  | "campaign_note"
  | "chat"
  | "roll"
  | "scene"
  | "actor"
  | "item"
  | "generated_model";

export type AiSourceTrust =
  | "authoritative_open_rules"
  | "reviewed_canon"
  | "untrusted_campaign_content"
  | "model_generated";

export type AiContextScope = "public" | "gm_private";

export interface AiSourceProvenance {
  sourceName: string;
  sourceVersion?: string;
  contentVersion?: string;
  license?: string;
}

export interface AiSourceReference {
  id: ID;
  kind: AiSourceKind;
  title: string;
  locator?: string;
  provenance?: AiSourceProvenance;
  visibility: AiContextScope;
  trust: AiSourceTrust;
}

export interface AiCitationClaim {
  sourceId: ID;
  locator?: string;
}

export interface AiCitation extends AiCitationClaim {
  status: "verified" | "unsupported";
  reason?: "unknown_source" | "locator_mismatch";
  source?: AiSourceReference;
}

export interface AiCitationWarning {
  code: "rules_answer_without_verified_open_rules_citation" | "unsupported_citation";
  message: string;
}

export interface AiCampaignPolicy {
  enabled: boolean;
  status: "enabled" | "disabled";
  contextScopes: AiContextScope[];
  providerTransmissionDisclosure: string;
  retentionDays: number;
  revision: number;
  updatedByUserId?: ID;
  updatedAt?: string;
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

/**
 * Explicitly supported outbound campaign webhook events. Chat, dice, member,
 * content-import, AI, and agent events are intentionally absent because their
 * payloads may contain private or unbounded user-authored content.
 */
export type CampaignWebhookEventType =
  | "campaign.updated"
  | "campaign.session.created"
  | "campaign.session.updated"
  | "campaign.session.started"
  | "campaign.session.completed"
  | "campaign.session.deleted"
  | "world.created"
  | "world.updated"
  | "world.deleted"
  | "scene.created"
  | "scene.updated"
  | "scene.deleted"
  | "scene.activated"
  | "token.created"
  | "token.updated"
  | "token.moved"
  | "token.deleted"
  | "actor.created"
  | "actor.updated"
  | "actor.deleted"
  | "item.created"
  | "item.updated"
  | "item.deleted"
  | "journal.created"
  | "journal.updated"
  | "journal.deleted"
  | "handout.created"
  | "handout.updated"
  | "handout.deleted"
  | "asset.created"
  | "asset.updated"
  | "asset.deleted"
  | "audio.updated"
  | "audio.deleted"
  | "combat.started"
  | "combat.roundAdvanced"
  | "combat.turnChanged"
  | "combat.ended"
  | "encounter.created"
  | "encounter.updated"
  | "encounter.deleted"
  | "proposal.created"
  | "proposal.updated"
  | "proposal.approved"
  | "proposal.rejected"
  | "proposal.applied"
  | "proposal.reverted";

export type CampaignWebhookEnvelopeEventType = CampaignWebhookEventType | "webhook.test";

/** Internal replay metadata. Raw idempotency keys and signing secrets are never stored here. */
export interface CampaignWebhookRotationIdempotencyRecord {
  keyHash: string;
  requestHash: string;
  userId: ID;
  createdAt: string;
}

/** Stored server-side. `signingSecret` must be removed from every public DTO. */
export interface CampaignWebhookSubscription extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  url: string;
  eventTypes: CampaignWebhookEventType[];
  enabled: boolean;
  signingSecret: string;
  secretHint: string;
  createdByUserId: ID;
  updatedByUserId: ID;
  creationIdempotencyKeyHash?: string;
  creationRequestHash?: string;
  rotationIdempotencyRecords?: CampaignWebhookRotationIdempotencyRecord[];
  /** @deprecated Retained only to recognize replay metadata written by early builds. */
  lastRotationIdempotencyKeyHash?: string;
}

export type CampaignWebhookDeliveryStatus = "queued" | "delivered" | "failed";

/**
 * A metadata-only delivery ledger. Request/response bodies and signing headers
 * are deliberately not persisted.
 */
export interface CampaignWebhookDelivery extends Timestamps {
  id: ID;
  campaignId: ID;
  webhookId: ID;
  eventId: ID;
  eventType: CampaignWebhookEnvelopeEventType;
  occurredAt: string;
  resourceType?: string;
  resourceId?: ID;
  attempt: number;
  status: CampaignWebhookDeliveryStatus;
  responseStatus?: number;
  responseBytes?: number;
  durationMs?: number;
  deliveredAt?: string;
  failedAt?: string;
  errorCode?: string;
  retryOfDeliveryId?: ID;
  initiatedByUserId?: ID;
}

/** Stable v1 metadata envelope. It intentionally has no arbitrary payload. */
export interface CampaignWebhookEnvelopeV1 {
  version: "1.0";
  eventId: ID;
  eventType: CampaignWebhookEnvelopeEventType;
  occurredAt: string;
  campaignId: ID;
  resource?: {
    type: string;
    id: ID;
  };
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
  worldRecords: WorldRecord[];
  worldRelations: WorldRelation[];
  scenes: Scene[];
  assets: MapAsset[];
  tokens: Token[];
  actors: Actor[];
  calculationOverrides: CalculationOverride[];
  characterTransfers: CharacterTransfer[];
  items: Item[];
  dndRulesMutations: DndRulesMutation[];
  pendingAdvancements: Dnd5eSrdPendingAdvancement[];
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
  campaignWebhooks: CampaignWebhookSubscription[];
  campaignWebhookDeliveries: CampaignWebhookDelivery[];
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
  /** Caller-supplied durable identity for the state transition that acquired the current/last lease. */
  leaseRequestId?: string;
  /** Stable request fingerprint used to distinguish an exact lease replay from token reuse. */
  leaseRequestHash?: string;
  /** Monotonic lease epoch. Every fresh or reclaimed lease increments this value. */
  leaseRevision?: number;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  dispatchStartedAt?: string;
  createdByUserId?: ID;
  updatedByUserId?: ID;
  logs: JobLogEntry[];
}
