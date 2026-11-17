import type { CampaignWebhookEnvelopeEventType, ContentImportEntityKind, ID, Token, Visibility } from "@open-tabletop/api-contracts";

export type {
  ID,
  Visibility,
  UserRole,
  ScimAssignableRole,
  OrganizationMemberRole,
  GridType,
  ProposalStatus,
  MessageType,
  ChatModerationStatus,
  Timestamps,
  User,
  UserPreferences,
  UserMfaSettings,
  UserScimProfile,
  ScimGroup,
  ScimGroupRoleMapping,
  UserSession,
  AuthIdentity,
  OAuthLoginState,
  PasswordResetToken,
  EmailOutboxMessage,
  OrganizationWorkspace,
  OrganizationMember,
  Campaign,
  CampaignMember,
  CampaignMemberSource,
  CampaignMemberScimSource,
  CampaignInvite,
  World,
  WorldRecordKind,
  WorldRecordLifecycle,
  WorldRecord,
  WorldRelationType,
  WorldRelation,
  Scene,
  SceneDuplicationSource,
  SceneDuplicationRequest,
  SceneDuplicationCopyCollection,
  SceneDuplicationCopy,
  SceneDuplicationSkippedReference,
  SceneDuplicationSharedReference,
  SceneDuplicationPlan,
  SceneDuplicationResult,
  SceneEditableState,
  SceneEditSnapshot,
  SceneActivationHistoryEntry,
  FogRegion,
  FogShape,
  FogMode,
  FogPreset,
  FogPresetRegion,
  FogHistoryEntry,
  FogHistoryAction,
  WallKind,
  Wall,
  CampaignRulesProfile,
  LightSourceKind,
  LightSource,
  DifficultTerrainRegion,
  CoverLevel,
  SceneCoverOverride,
  ScenePathMeasurement,
  SceneAnnotationKind,
  SceneAnnotationLayer,
  SceneTemplateShape,
  SceneAnnotation,
  SceneAnnotationHistoryEntry,
  VisionPoint,
  VisionPolygonSource,
  VisionPolygon,
  VisionSnapshot,
  VisionPointSample,
  VisionPointSamplePolygon,
  VisionPointSampleWall,
  MapAsset,
  AssetRenditionKind,
  AssetImageMetadata,
  AssetRendition,
  AssetStorageRef,
  AssetLifecycle,
  AssetSecurityScan,
  AssetSecurityFinding,
  TokenLayer,
  TokenSenseType,
  TokenSense,
  Token,
  TokenMoveBatchEntry,
  TokenMoveBatchRequest,
  TokenMoveBatchResult,
  TokenCondition,
  TokenAura,
  Actor,
  Item,
  CharacterTransferStatus,
  CharacterTransfer,
  DndRulesMutationKind,
  DndRulesMutationStatus,
  DndRulesMutationActorRoot,
  DndRulesMutationItemRoot,
  DndRulesMutationCombatRoot,
  DndRulesMutationRoots,
  DndRulesMutation,
  DndRulesMutationUndoDescriptor,
  DndRulesMutationUndoRequest,
  DndRulesMutationUndoResult,
  Dnd5eSrdPreparedActionCommitRequest,
  Dnd5eSrdTypedDamageApplyRequest,
  Dnd5eSrdTypedDamageApplyResult,
  Dnd5eSrdCombatVitalsKind,
  Dnd5eSrdCombatVitalsRequest,
  Dnd5eSrdCombatVitalsAdjustmentResult,
  Dnd5eSrdCombatVitalsMutationResult,
  Dnd5eSrdCombatantSyncMutationResult,
  Dnd5eSrdPendingAdvancementCancelRequest,
  Dnd5eSrdPendingAdvancementCancelResult,
  Dnd5eSrdPendingAdvancementStatus,
  Dnd5eSrdPendingAdvancement,
  Dnd5eSrdSpellPreparationTiming,
  Dnd5eSrdSpellPreparationBlockerCode,
  Dnd5eSrdSpellPreparationBlocker,
  Dnd5eSrdSpellPreparationCapacity,
  Dnd5eSrdSpellPreparationChange,
  Dnd5eSrdSpellPreparationPlan,
  Dnd5eSrdSpellPreparationPreviewRequest,
  Dnd5eSrdSpellPreparationPreviewResponse,
  Dnd5eSrdSpellPreparationApplyRequest,
  Dnd5eSrdSpellPreparationMutationResult,
  DndControlledCreatureKind,
  DndControlledCreatureSource,
  DndControlledCreatureOriginatingAction,
  DndControlledCreatureDuration,
  DndControlledCreatureConcentration,
  DndControlledCreatureInitiative,
  DndControlledCreatureCommandRequirement,
  DndControlledCreatureLastCommand,
  DndControlledCreatureTransformationSnapshot,
  DndControlledCreatureRecord,
  DndControlledCreatureActorTemplate,
  DndControlledCreatureTokenTemplate,
  DndControlledCreatureCreateRequest,
  DndControlledCreatureHandoffManualField,
  DndControlledCreatureHandoffManualChoice,
  DndControlledCreatureCreatePrefill,
  DndControlledCreatureActionHandoff,
  DndControlledCreatureManualReviewCategory,
  DndControlledCreatureManualReview,
  DndControlledCreatureRevisionSet,
  DndControlledCreaturePreview,
  DndControlledCreatureConfirmRequest,
  DndControlledCreatureEndRequest,
  DndControlledCreatureCommandRequest,
  DndControlledCreatureConcentrationEndRequest,
  DndControlledCreatureMutationResult,
  DndCharacterReviewPolicy,
  Dnd5eAbility,
  Dnd5eAbilityScoreMethod,
  Dnd5eStandardArrayAssignment,
  DndCharacterReviewValidationIssue,
  DndCharacterReviewValidationSnapshot,
  DndCharacterReviewDecision,
  DndCharacterReviewState,
  DndCharacterReviewEffectiveStatus,
  DndCharacterReviewEntry,
  DndCharacterReviewListResponse,
  DndCharacterReviewSubmitRequest,
  DndCharacterReviewDecisionRequest,
  DndCharacterReviewPolicyUpdateRequest,
  Dnd5eInventoryOwnerRef,
  Dnd5eInventoryMetadata,
  Dnd5eContainerSummary,
  Dnd5eCarryingSummary,
  Dnd5ePartyStashData,
  Dnd5eMerchantCatalogEntry,
  Dnd5eMerchantData,
  Dnd5eLootData,
  Dnd5eInventoryOverview,
  JournalEntryKind,
  JournalEntityType,
  JournalEntityLink,
  JournalCanonStatus,
  JournalEntryRevision,
  JournalBacklink,
  JournalEntry,
  Handout,
  ChatMessage,
  DiceRoll,
  DiceRollHeroicInspirationLink,
  DiceRollFairness,
  DiceMacro,
  AudioTrackKind,
  AudioTrack,
  DiceRollTerm,
  Encounter,
  EncounterMonsterPlacementDraft,
  EncounterMonsterPlacementBatchInput,
  EncounterMonsterPlacementResult,
  EncounterMonsterPlacementBatchResult,
  CampaignSessionStatus,
  CampaignSession,
  Combat,
  CombatLegendaryActionPrompt,
  Dnd5eSrdLegendaryActionSpendRequest,
  Dnd5eSrdLegendaryActionUse,
  Dnd5eSrdLegendaryActionSpendResult,
  CombatEnvironmentMechanicKind,
  CombatEnvironmentMechanicTiming,
  CombatEnvironmentMechanicSchedule,
  CombatEnvironmentMechanicOption,
  CombatEnvironmentMechanic,
  CombatEnvironmentMechanicTrigger,
  RulesEffectScheduleTiming,
  RulesEffectRepeatSave,
  RulesEffectSchedule,
  RulesEffectScheduleEvent,
  CombatReward,
  Combatant,
  CombatAction,
  Dnd5eSrdAttackOutcome,
  Dnd5eSrdCriticalOutcome,
  CombatActionRoll,
  CombatActionActorUpdate,
  CombatActionItemUpdate,
  CombatActionEffect,
  CompendiumSourceKind,
  CompendiumProvenance,
  CompendiumCatalogEntry,
  CompendiumProvenanceSummary,
  CompendiumConflictKind,
  CompendiumConflictChoice,
  CompendiumConflict,
  CalculationSourceKind,
  CalculationSource,
  CalculationTerm,
  CalculationFlags,
  CalculationFieldExplanation,
  ActorCalculationExplanation,
  CalculationOverrideSource,
  CalculationOverride,
  CampaignCompatibilityStatus,
  CampaignCompatibilityIssueSeverity,
  CampaignCompatibilityIssueGroup,
  CampaignCompatibilityIssue,
  CampaignSystemCoverage,
  CampaignCompatibilityRepairCandidate,
  CampaignCompatibilityReport,
  CompendiumPack,
  CompendiumEntry,
  Proposal,
  ProposalRevertGuard,
  ProposalHistoryEntry,
  ProposalChange,
  AiThread,
  AiSourceKind,
  AiSourceTrust,
  AiContextScope,
  AiSourceProvenance,
  AiSourceReference,
  AiCitationClaim,
  AiCitation,
  AiCitationWarning,
  AiCampaignPolicy,
  AiThreadAdvertisedTool,
  AiEvaluationRun,
  AiEvaluationCheck,
  AiUsageMetrics,
  AiMemoryFactType,
  AiMemoryFactStatus,
  AiMemoryFactSource,
  AiMemoryFact,
  AiToolCall,
  AuditLog,
  PermissionName,
  SystemCapability,
  SystemManifestIdentity,
  DeclarativeSystemSchema,
  DeclarativeSystemObjectSchema,
  DeclarativeSystemPath,
  DeclarativeSystemField,
  DeclarativeSystemRoll,
  DeclarativeSystemDefinition,
  SystemManifestSchemas,
  DeclarativeSystemManifest,
  CampaignArchiveSystemRequirement,
  DeclarativeValidationIssue,
  DeclarativeScalarSchema,
  DeclarativeSheetField,
  DeclarativeResourceCost,
  DeclarativeQuickRoll,
  DeclarativeActorSheet,
  DeclarativeActionRequest,
  SystemManifestData,
  SystemInstallation,
  PermissionGrant,
  PluginStorageEntry,
  PluginReviewStatus,
  PluginReview,
  ContentImportStatus,
  ContentImportEntityKind,
  ContentImportSource,
  ContentImportLicense,
  ContentImportEntity,
  ContentImportAppliedRecord,
  ContentImportBatch,
  CampaignArchiveVersion,
  CampaignArchive,
  CampaignArchiveFile,
  CampaignArchiveImportOperationStatus,
  CampaignArchiveImportRollbackConflictReason,
  CampaignArchiveImportRollbackConflict,
  CampaignArchiveImportRecordInverseStep,
  CampaignArchiveImportAssetInverseStep,
  CampaignArchiveImportOperation,
  CampaignWebhookEventType,
  CampaignWebhookEnvelopeEventType,
  CampaignWebhookRotationIdempotencyRecord,
  CampaignWebhookSubscription,
  CampaignWebhookDeliveryStatus,
  CampaignWebhookDelivery,
  EngineState,
  IdempotencyRecord,
  JobStatus,
  JobType,
  JobProgress,
  JobLogEntry,
  WorkerJobRecord,
} from "@open-tabletop/api-contracts";


/** One ordered realtime payload lets remote clients apply the whole move at once. */
export interface TokenMoveBatchEventPayload {
  sceneId: ID;
  tokens: Token[];
  movedAt: string;
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

export type CampaignSearchResultType =
  | "world"
  | "scene"
  | "actor"
  | "item"
  | "journal"
  | "handout"
  | "encounter"
  | "memory"
  | "chat"
  | "roll"
  | "compendium";

export type CampaignSearchMatchKind = "exact_id" | "exact_name" | "normalized_name" | "prefix" | "title" | "body" | "fuzzy";
export type CampaignSearchSourceKind = "campaign" | "actor_instance" | "srd" | "bundled" | "homebrew";

/** A stable, typed destination returned by permission-filtered campaign search. */
export interface CampaignSearchTarget {
  type: CampaignSearchResultType;
  id: ID;
  worldId?: ID;
  actorId?: ID;
  systemId?: ID;
  sourceKind: CampaignSearchSourceKind;
}

export interface CampaignSearchResult {
  type: CampaignSearchResultType;
  id: ID;
  title: string;
  snippet: string;
  updatedAt: string;
  worldId?: ID;
  visibility?: Visibility | "whisper";
  score: number;
  matchKind: CampaignSearchMatchKind;
  target: CampaignSearchTarget;
}

/** Shared presentation contract for truthful rules-automation boundaries. */
export interface RulesSupportBoundary {
  status: "automated" | "manual" | "unsupported";
  label: "Automated" | "DM decision" | "Unsupported";
  explanation: string;
  nextAction?: string;
  sources: string[];
}

export interface ContentImportSourceAdapter {
  id: ID;
  name: string;
  version: string;
  inputMimeTypes: string[];
  outputKinds: ContentImportEntityKind[];
  provenanceRequired: true;
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
