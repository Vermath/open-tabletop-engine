export type ID = string;

export type Visibility = "gm_only" | "public" | "specific_players" | "specific_characters";
export type UserRole = "owner" | "gm" | "assistant_gm" | "player" | "observer" | "plugin" | "ai_assistant";
export type ScimAssignableRole = Extract<UserRole, "gm" | "assistant_gm" | "player" | "observer">;
export type GridType = "square" | "gridless";
export type ProposalStatus = "draft" | "pending" | "approved" | "rejected" | "applied" | "reverted";
export type MessageType = "plain" | "emote" | "whisper" | "roll" | "system" | "gm" | "ooc" | "ai" | "plugin";

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface User extends Timestamps {
  id: ID;
  displayName: string;
  email?: string;
  passwordHash?: string;
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

export interface Campaign extends Timestamps {
  id: ID;
  ownerUserId: ID;
  name: string;
  description: string;
  defaultSystemId: ID;
  visibility: "private" | "invite_only" | "public";
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
  name: string;
  width: number;
  height: number;
  gridType: GridType;
  gridSize: number;
  backgroundAssetId?: ID;
  active: boolean;
  sortOrder: number;
  fog: FogRegion[];
  walls: Wall[];
  lights: LightSource[];
  metadata: Record<string, unknown>;
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
  color: string;
  intensity?: number;
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

export interface MapAsset extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  checksum?: string;
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
  hidden: boolean;
  locked: boolean;
  visionEnabled: boolean;
  visionRadius: number;
  disposition: "friendly" | "neutral" | "hostile";
  imageAssetId?: ID;
  metadata: Record<string, unknown>;
}

export interface Actor extends Timestamps {
  id: ID;
  campaignId: ID;
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
  systemId: ID;
  actorId?: ID;
  type: string;
  name: string;
  data: Record<string, unknown>;
}

export interface JournalEntry extends Timestamps {
  id: ID;
  campaignId: ID;
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
  title: string;
  body: string;
  visibility: Visibility;
  assetIds: ID[];
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
}

export interface DiceRollTerm {
  type: "die" | "modifier" | "binding";
  sides?: number;
  count?: number;
  results?: number[];
  kept?: number[];
  exploded?: number[];
  value?: number;
  path?: string;
}

export interface Encounter extends Timestamps {
  id: ID;
  campaignId: ID;
  name: string;
  summary: string;
  tokenIds: ID[];
  difficulty?: string;
}

export interface Combat extends Timestamps {
  id: ID;
  campaignId: ID;
  encounterId?: ID;
  active: boolean;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
}

export interface Combatant {
  id: ID;
  tokenId: ID;
  actorId?: ID;
  name: string;
  initiative: number;
  defeated: boolean;
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
}

export interface ProposalChange {
  entity: "campaign" | "scene" | "token" | "actor" | "item" | "journal" | "chat" | "encounter" | "combat";
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
}

export interface AiMemoryFact extends Timestamps {
  id: ID;
  campaignId: ID;
  text: string;
  visibility: Visibility;
  sourceIds: ID[];
  approvedByUserId?: ID;
}

export interface AiToolCall extends Timestamps {
  id: ID;
  threadId: ID;
  toolName: string;
  input: unknown;
  output: unknown;
  status: "started" | "completed" | "failed";
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

export interface PermissionGrant extends Timestamps {
  id: ID;
  subjectType: "user" | "role" | "plugin" | "ai_assistant";
  subjectId: ID;
  campaignId: ID;
  permissions: PermissionName[];
  expiresAt?: string;
}

export interface CampaignArchive {
  format: "ottx";
  version: "0.1.0";
  exportedAt: string;
  manifest: {
    campaignId: ID;
    name: string;
    schemaVersion: string;
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
  encounters: Encounter[];
  combats: Combat[];
  compendia: CompendiumPack[];
  proposals: Proposal[];
  aiThreads: AiThread[];
  aiMemory: AiMemoryFact[];
  aiToolCalls: AiToolCall[];
  auditLogs: AuditLog[];
  permissionGrants: PermissionGrant[];
}
