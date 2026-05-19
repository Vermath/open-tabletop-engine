# Graph Report - D:\open_tabletop_engine  (2026-05-05)

## Corpus Check
- 103 files · ~350,114 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1322 nodes · 3127 edges · 76 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 295 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 87|Community 87]]

## God Nodes (most connected - your core abstractions)
1. `numericValue()` - 140 edges
2. `stringValue()` - 123 edges
3. `recordValue()` - 67 edges
4. `dnd5eSrdClassFeatureRolls()` - 66 edges
5. `normalizeStringArray()` - 55 edges
6. `refresh()` - 41 edges
7. `nowIso()` - 38 edges
8. `genericFantasyAttributeModifier()` - 32 edges
9. `dnd5eSrdActionFormula()` - 23 edges
10. `fetch()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `dnd5eSrdHasMartialArts()` --calls--> `stringValue()`  [INFERRED]
  apps/web/src/App.tsx → packages/system-sdk/src/index.ts
- `dnd5eSrdHasEldritchInvocations()` --calls--> `stringValue()`  [INFERRED]
  apps/web/src/App.tsx → packages/system-sdk/src/index.ts
- `dnd5eSrdHasSneakAttack()` --calls--> `stringValue()`  [INFERRED]
  apps/web/src/App.tsx → packages/system-sdk/src/index.ts
- `dnd5eSrdSecondWindFormula()` --calls--> `numericValue()`  [INFERRED]
  apps/web/src/App.tsx → packages/system-sdk/src/index.ts
- `dnd5eSrdRageDamageBonus()` --calls--> `numericValue()`  [INFERRED]
  apps/web/src/App.tsx → packages/system-sdk/src/index.ts

## Hyperedges (group relationships)
- **API-first platform contract** — readme_api_first_vtt_platform, contributing_public_api_capability, prd_public_rest_api, prd_realtime_websocket_api [EXTRACTED 1.00]
- **Permissioned AI and plugin state changes** — readme_permissioned_ai_assistance, agents_ai_plugin_proposals, prd_proposal_model, security_ai_context_redaction, security_plugin_sandboxing [EXTRACTED 1.00]
- **Self-hosted runtime stack** — docker_compose_api_service, docker_compose_web_service, docker_compose_postgres, docker_compose_redis, docker_compose_minio [EXTRACTED 1.00]
- **API First Runtime Boundary** — architecture_overview_browser_client, architecture_overview_api_server, architecture_overview_shared_packages, rfc_001_core_architecture_public_api_event_model [EXTRACTED 1.00]
- **Proposal Gated AI And Plugin Mutations** — ai_overview_reviewable_proposal_wrapper, ai_overview_ai_tool_permission_enforcement, plugin_sdk_proposal_based_plugin_mutation, rest_proposal_approval_flow [INFERRED 0.90]
- **Self Hosted Asset Delivery Chain** — rest_asset_delivery_urls, asset_edge_asset_edge_worker, asset_edge_hmac_signed_url_validation, self_hosting_asset_storage_configuration [EXTRACTED 1.00]
- **Manual Asset Storage Validation Assets** — asset_monczy50mcm1qfq5_manual_edge_asset_payload, asset_mon462zexy80nc6u_manual_clean_svg_label, asset_monddc20nbx57hyo_manual_clean_asset_payload [INFERRED 0.80]
- **Archive Roundtrip Equivalence** — asset_momf20w7s3tv41hg_archive_roundtrip_asset_source, asset_momf20w7s3tv41hg_archive_roundtrip_asset_target [EXTRACTED 1.00]
- **Session Token Asset Pair** — asset_momevqs15c172gie_session_asset, asset_momewntpyovw4hl4_session_asset, camp_demo_campaign_asset_scope [INFERRED 0.80]
- **Manual Acceptance Map Visual Scene** — asset_momctectfpiqquoo_manual_acceptance_map, asset_momctectfpiqquoo_map_board_layout, camp_demo_campaign_asset_scope [EXTRACTED 1.00]
- **Admin Console Observability Surface** — admin_ai_operations_admin_panel, admin_console_user_management, admin_console_email_outbox, admin_console_audit_log, admin_ai_operations_ai_operations [EXTRACTED 1.00]
- **Permissioned AI Operator Workflow** — ai_operator_dashboard_gm_permissioned_ai, ai_operator_dashboard_gm_operator_signals, ai_operator_dashboard_player_restricted_ai, admin_ai_operations_ai_operations [INFERRED 0.84]
- **Fog and Vision Map System** — dynamic_fog_player_fog_of_war, dynamic_fog_player_token_vision, fog_brush_smoothing_fog_brush_tool, fog_brush_smoothing_map_authoring_toolbar, shared_grid_map_canvas [EXTRACTED 1.00]
- **Identity and Organization Access Flow** — auth_invite_joiner_invite_join_form, oidc_sso_gm_sso_button, oidc_sso_gm_session_controls, org_admin_scim_mapping_scim_group_mapping, org_admin_scim_mapping_org_access [INFERRED 0.87]
- **Shared VTT Application Layout** — admin_ai_operations_opentabletop_shell, shared_ember_vault_scene, shared_grid_map_canvas, shared_bottom_dice_chat_bar, auth_invite_joiner_selected_actor [EXTRACTED 1.00]
- **Shared OpenTabletop Three Pane Layout** — plugin-sandbox-gm_opentabletop_shell, rules-action-automation_actor_action_panel, rules-character-builder_system_builder_panel, vision-polygons-player_player_limited_toolbar [EXTRACTED 1.00]
- **Rules System Management Workflow** — rules-character-builder_system_builder_panel, rules-character-import_system_import_panel, rules-encounter-math_system_math_panel, rules-encounter-math_system_switching [INFERRED 0.85]
- **Character Action Resolution Workflow** — rules-action-automation_valen_ash_character, rules-action-automation_actor_action_panel, rules-action-automation_roll_log, stellar-frontiers-system_tech_check [INFERRED 0.85]
- **Map and Visibility Workflow** — vision-polygons-player_vision_polygons, vision-polygons-player_visible_actor_zone, manual-map_manual_acceptance_map, manual-map_rectangular_room, manual-map_green_circular_marker [INFERRED 0.80]
- **Plugin Sandbox Runtime Workflow** — plugin-sandbox-gm_runtime_sdk_panel, plugin-sandbox-gm_example_macro_plugin, plugin-sandbox-gm_spark_macro, plugin-sandbox-gm_limited_plugin_permissions [EXTRACTED 1.00]

## Communities (88 total, 11 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (34): assetRetentionExpiresAt(), base32Encode(), clampNumber(), combineScimGroupRoleSyncResults(), compactRecord(), createInitialAiUsage(), defaultAssetLifecycle(), displayNameFromHeader() (+26 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (77): dnd5eSrdArcaneRecoverySelection(), dnd5eSrdAttacksPerAction(), dnd5eSrdHasBardicInspiration(), dnd5eSrdHasChannelDivinity(), dnd5eSrdHasCunningStrike(), dnd5eSrdHasDeflectAttacks(), dnd5eSrdHasFaithfulSteed(), dnd5eSrdHasFontOfInspiration() (+69 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (46): writePluginSignature(), validatePluginManifest(), comparePluginsByVersion(), compareSemverDescending(), defaultPluginRoot(), evaluatePluginTrust(), fetchJson(), fetchText() (+38 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (46): dnd5eSrdSearUndeadFormula(), appendFormulaBonus(), dnd5eSrdAbilityCheck(), dnd5eSrdArmorClass(), dnd5eSrdConditionEffects(), dnd5eSrdD20Automation(), dnd5eSrdD20RollModeSources(), dnd5eSrdDeflectAttacksDamageFormula() (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (43): AI and plugin changes routed through proposals, Explicit and testable permission checks, Shared domain types from packages/core, /src/main.tsx module entrypoint, Web app root mount, Campaign data portability expectation, Public API exposes UI capabilities, OTTE_AI_PROVIDER configuration (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (34): async(), clearResetUrl(), dnd5eSrdAdrenalineRushFormula(), dnd5eSrdBardicInspirationDie(), dnd5eSrdBardicInspirationFormula(), dnd5eSrdDeflectAttacksDamageFormula(), dnd5eSrdDivineSmiteFormula(), dnd5eSrdDivineSparkDice() (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (33): campaignIdFromParams(), CodexAppServerProvider, compactPayload(), describeJob(), dispatchJob(), fetchJson(), hasTool(), importMode() (+25 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (38): advancementOptionsForActor(), systemQuickRolls(), systemSheet(), applyDnd5eSrdCondition(), dnd5eSrdAbilityKeys(), dnd5eSrdActionRolls(), dnd5eSrdActorConditions(), dnd5eSrdAdvancementOptions() (+30 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (38): applySystemAdvancement(), applySystemRest(), characterImportForSystem(), applyDnd5eSrdAdvancement(), applyGenericFantasyAdvancement(), applyGenericFantasyRest(), applyMysticNoirAdvancement(), applyMysticNoirRest() (+30 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (35): apiPost(), acceptInvite(), addLight(), addWall(), advanceSelectedActor(), applyFogPreset(), approveAndApply(), approveMemory() (+27 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (34): applyScimPatchToGroup(), applyScimPatchToUser(), applyScimUserInput(), applyScimUserPath(), assetCleanupSchedulerSuccess(), badRequest(), combinedAssetSecurityScanner(), fetchOidcUserInfo() (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (32): systemActionFormula(), useSystemAction(), actionItemForRoll(), appendFormulaTerm(), consumeResourcePool(), dnd5eSrdActionFormula(), dnd5eSrdDefaultLayOnHandsAmount(), dnd5eSrdDivineSmiteFormula() (+24 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (28): addAngle(), buildSmoothFogBrushPolygon(), candidateAngles(), castRay(), clampPoint(), compactPolygon(), compactStroke(), computeCirclePolygon() (+20 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (12): CapturingAiProvider, ExpandedToolProvider, FailingProvider, FlakyProvider, MalformedToolProvider, OperationsProvider, RestrictedEditProvider, testBase32Decode() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (15): broadcastActorUpdated(), memberSessionInfo(), createEvent(), createId(), assertPermission(), hasPermission(), permissionsForRole(), applyProposal() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (26): acceptInviteSession(), apiDelete(), apiGet(), apiPatch(), apiUploadAsset(), assetBlobUrl(), confirmPasswordResetSession(), consumeSsoRedirect() (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (26): adminUserInfo(), currentUserId(), findPluginGrant(), forbidden(), headerValue(), isActiveUserId(), isDisabledUser(), isServerAdminUserId() (+18 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (26): packages/ai-core Provider Abstraction, AI Gateway, AI Tool Permission Enforcement, Codex App Server Provider Bridge, OpenAI Responses API Adapter, Permission-Filtered AI Context, Evidence-First MVP Acceptance, MVP Acceptance Audit (+18 more)

### Community 18 - "Community 18"
Cohesion: 0.11
Nodes (25): appendFogHistoryEntry(), appendServerAuditLog(), appendSystemAuditLog(), base64Url(), cloneFogRegion(), completeOidcCallback(), confirmPasswordReset(), createOidcAuthorization() (+17 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (15): dnd5eSrdDamageDieSides(), dnd5eSrdEffectFormula(), dnd5eSrdEffectRoll(), dnd5eSrdEldritchInvocationsKnown(), dnd5eSrdEldritchInvocationsMetadata(), dnd5eSrdIsWeaponData(), dnd5eSrdLargerDamageDie(), dnd5eSrdMetamagicQuickenedMetadata() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (23): archiveAssetFile(), assetCleanupGraceDays(), assetCleanupReason(), assetOperationBase(), assetTrustFailClosed(), assetTrustWebhookTimeoutMs(), checksumForBuffer(), cleanupStoredAssets() (+15 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (22): applySystemCondition(), compendiumEntriesForSystem(), compendiumEntryForSystem(), removeSystemCondition(), applyGenericFantasyCondition(), applyMysticNoirCondition(), applyStellarFrontiersCondition(), dnd5eSrdAdventuringGearCompendiumEntries() (+14 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (21): adminAiOperations(), aggregateAiUsage(), aiProviderErrorMessage(), aiProviderRetryAttempts(), aiProviderRuntimeConfig(), aiProviderTimeoutMs(), assetCleanupIntervalSeconds(), completeAiThread() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (21): dnd5eSrdAdrenalineRushFormula(), dnd5eSrdAdrenalineRushMetadata(), dnd5eSrdCunningStrikeMetadata(), dnd5eSrdDraconicFlightMetadata(), dnd5eSrdDragonbornBreathWeaponMetadata(), dnd5eSrdHasDraconicFlight(), dnd5eSrdHasDragonbornBreathWeapon(), dnd5eSrdHasDwarfStonecunning() (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (21): applyDnd5eSrdRest(), cloneJsonRecord(), defaultDnd5eSrdResources(), defaultDnd5eSrdSpeciesResourcesForData(), dnd5eSrdApplyArcaneRecovery(), dnd5eSrdApplyCharacterOrigins(), dnd5eSrdApplyLongRestResourceLimits(), dnd5eSrdApplyPactMagicRecovery() (+13 more)

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (11): eventsFromOpenAiResponse(), instructionsFromContext(), isRecord(), normalizedTimeoutMs(), numberFromRecord(), openAiResponsesEndpoint(), OpenAiResponsesProvider, parseFunctionArguments() (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (17): applySystemConditionRollEffect(), applySystemRollEffect(), executeAiTool(), failedToolOutput(), isProposalChange(), isProposalToolOutput(), isRecord(), isToolErrorOutput() (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (9): bodyToBuffer(), booleanEnv(), createAssetStorage(), createAssetStorageForProvider(), extensionForMimeType(), isS3NotFound(), isTransformableBody(), requiredEnv() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.24
Nodes (13): base64UrlEncode(), constantTimeEqual(), createAssetEdgeSignature(), edgeAssetPath(), edgeAssetResponse(), edgeCacheKey(), edgeError(), edgeMaxTtlSeconds() (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (16): defaultDnd5eSrdClassResources(), dnd5eSrdActionSurgeMax(), dnd5eSrdAvailableSpellSlotLevels(), dnd5eSrdChannelDivinityMax(), dnd5eSrdConvertSpellSlotMetadata(), dnd5eSrdFavoredEnemyMax(), dnd5eSrdHuntersMarkMetadata(), dnd5eSrdMonkFocusMax() (+8 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (15): Server Admin Panel, AI Operations Telemetry, Admin Audit Log, Password Reset Email Outbox, Admin User Management, Operator Signals Metrics, GM Permissioned AI Controls, Player Restricted AI Dashboard (+7 more)

### Community 31 - "Community 31"
Cohesion: 0.24
Nodes (4): MemoryAssetStorage, assetStorageKey(), isWithinPath(), LocalAssetStorage

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (14): campaignIdForScene(), campaignIdForToken(), canCampaign(), canMoveToken(), canReadChatMessage(), canReadHiddenTokens(), canUpdateActorForUser(), filterRealtimeEvent() (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.24
Nodes (3): buildApp(), isStateCollection(), SqliteStateStore

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (13): adminPluginReviewSnapshot(), createPluginReview(), ensurePluginReview(), pluginCampaignInfo(), pluginReviewChecksum(), pluginReviewForDisplay(), pluginReviewInstallBlock(), pluginReviewInstallBlockForReview() (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (13): dnd5eSrdApplyClassFeatures(), dnd5eSrdBarbarianFeaturesForLevel(), dnd5eSrdBardFeaturesForLevel(), dnd5eSrdClericFeaturesForLevel(), dnd5eSrdDruidFeaturesForLevel(), dnd5eSrdFighterFeaturesForLevel(), dnd5eSrdMonkFeaturesForLevel(), dnd5eSrdPaladinFeaturesForLevel() (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.2
Nodes (11): Reviewable Proposal Wrapper, API-First Architecture, API Server, Browser Client, SQLite Record Store, Clean Checkout Runbook, Proposal-Based Plugin State Mutation, Proposal Approval Flow (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.2
Nodes (10): base32Decode(), consumeRecoveryCode(), isTotpEnabled(), markMfaVerified(), normalizeRecoveryCode(), publicMfaInfo(), publicUser(), totpCode() (+2 more)

### Community 39 - "Community 39"
Cohesion: 0.2
Nodes (10): createScimGroupRoleMapping(), deleteScimGroupRoleMapping(), disableAdminUser(), enableAdminUser(), issueAdminPasswordReset(), refreshAdmin(), requireAdminPasswordReset(), revokeAdminSession() (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (10): encounterPlanForSystem(), encounterThreatsForSystem(), buildEncounterPlan(), encounterDifficulty(), genericFantasyEncounterPlan(), genericFantasyEncounterThreats(), mysticNoirEncounterPlan(), mysticNoirEncounterThreats() (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.42
Nodes (5): keepResults(), parseFormula(), probabilityRange(), rollDie(), rollFormula()

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (9): characterTemplatesForSystem(), dnd5eSrdCharacterTemplate(), dnd5eSrdCharacterTemplates(), genericFantasyCharacterTemplate(), genericFantasyCharacterTemplates(), mysticNoirCharacterTemplate(), mysticNoirCharacterTemplates(), stellarFrontiersCharacterTemplate() (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (8): assetDeliveryBase(), assetSignaturePayload(), assetSigningSecret(), assetUrlTtlSeconds(), isValidAssetSignature(), signAssetUrl(), signedAssetCacheControl(), signedAssetDelivery()

### Community 44 - "Community 44"
Cohesion: 0.25
Nodes (8): applyPluginStorageMutation(), cloneJsonValue(), deletePluginStorageEntry(), normalizePluginStorageKey(), normalizePluginStorageValue(), pluginStorageValueSize(), publicPluginStorageEntry(), upsertPluginStorageEntry()

### Community 45 - "Community 45"
Cohesion: 0.32
Nodes (8): dnd5eSrdToolCheck(), dnd5eSrdToolDefinition(), dnd5eSrdToolProficiencies(), dnd5eSrdToolProficienciesForBackground(), dnd5eSrdToolProficienciesFromExplicit(), dnd5eSrdToolProficiencyMultiplier(), dnd5eSrdTools(), normalizeDnd5eSrdToolId()

### Community 46 - "Community 46"
Cohesion: 0.39
Nodes (8): dnd5eSrdApplyClassCombat(), dnd5eSrdAttacksPerAction(), dnd5eSrdBarbarianAttacksPerAction(), dnd5eSrdFighterAttacksPerAction(), dnd5eSrdMonkAttacksPerAction(), dnd5eSrdMonkUnarmoredMovementBonus(), dnd5eSrdPaladinAttacksPerAction(), dnd5eSrdRangerAttacksPerAction()

### Community 47 - "Community 47"
Cohesion: 0.32
Nodes (8): defaultDnd5eSrdFullCasterSpellSlots(), defaultDnd5eSrdHalfCasterSpellSlots(), defaultDnd5eSrdSpellSlots(), defaultDnd5eSrdWarlockPactMagicSlots(), dnd5eSrdMagicalCunningLimit(), dnd5eSrdMagicalCunningMetadata(), dnd5eSrdWarlockPactMagicSlotCount(), dnd5eSrdWarlockPactMagicSlotLevel()

### Community 48 - "Community 48"
Cohesion: 0.4
Nodes (6): assetQuotaBytes(), assetQuotaExceeded(), campaignAssetBytes(), campaignAssetStorageInfo(), countBy(), globalAssetStorageInfo()

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (6): Generic Fantasy System Card, Stellar Frontiers Character Templates, Rules System Character Builder Panel, Nova Quill Character, Stellar Frontiers Active Scene, Tech Check Action

### Community 50 - "Community 50"
Cohesion: 0.33
Nodes (6): Green Circular Map Marker, Manual Acceptance Map, Rectangular Bordered Room, Player Limited Toolbar, Visible Actor Zone, Vision and Occlusion Polygons

### Community 52 - "Community 52"
Cohesion: 0.4
Nodes (5): findGroupForScimGroupRoleMapping(), publicScimGroupRoleMapping(), removeScimGroupRoleMappingMemberships(), scimGroupRoleMappingMatchesGroup(), syncScimGroupRoleMapping()

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (5): isAllowedIssuerUrl(), isLocalhostUrl(), oidcProviderConfig(), oidcTokenAuthMethod(), requestBaseUrl()

### Community 54 - "Community 54"
Cohesion: 0.4
Nodes (5): abilityModifier(), dnd5eSrdBardicInspirationDie(), dnd5eSrdBardicInspirationFormula(), dnd5eSrdBardicInspirationMax(), dnd5eSrdBardicInspirationMetadata()

### Community 55 - "Community 55"
Cohesion: 0.6
Nodes (5): dnd5eSrdCurrency(), dnd5eSrdCurrencyFromCopper(), dnd5eSrdCurrencyToCopper(), dnd5eSrdEquipmentPurchase(), dnd5eSrdFormatGp()

### Community 56 - "Community 56"
Cohesion: 0.4
Nodes (5): Asset Edge Worker, HMAC Signed URL Validation, Origin Protection Cache Layer, Signed Asset Delivery URLs, Asset Storage Configuration

### Community 57 - "Community 57"
Cohesion: 0.5
Nodes (5): Manual Acceptance Map, Map Board Layout With Token Circle, Session Asset, Session Asset, Camp Demo Campaign Asset Scope

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (4): dnd5eSrdAvailableCreatableSorcererSlotLevels(), dnd5eSrdCreateSpellSlotCost(), dnd5eSrdCreateSpellSlotCosts(), dnd5eSrdCreateSpellSlotMetadata()

### Community 60 - "Community 60"
Cohesion: 0.5
Nodes (4): booleanValue(), conditionClearsOnRest(), dnd5eSrdMagicItemCraftingMetadata(), dnd5eSrdMagicItemEntry()

### Community 61 - "Community 61"
Cohesion: 0.5
Nodes (4): Manual Clean SVG Label, Security Upload Storage Context, Manual Clean Asset Payload, Trust Upload Storage Context

### Community 62 - "Community 62"
Cohesion: 0.5
Nodes (4): Invite Join Form, Selected Actor Valen Ash, GM Session and Invite Controls, OIDC SSO Entry Point

### Community 63 - "Community 63"
Cohesion: 0.5
Nodes (4): OpenTabletop VTT Shell, Map Authoring Toolbar, The Ember Vault Scene, Grid Map Canvas

### Community 64 - "Community 64"
Cohesion: 0.5
Nodes (4): Example Macro Plugin, Limited Plugin Permissions, Runtime SDK Plugin Panel, Spark Macro Command

### Community 65 - "Community 65"
Cohesion: 0.5
Nodes (4): OpenTabletop Application Shell, Actor Action Automation Panel, Roll Result Log, Valen Ash Character

### Community 66 - "Community 66"
Cohesion: 0.5
Nodes (4): Generic Fantasy Active System, Rules System Import Panel, Game Master Actor Sheet Panel, Blessed Condition

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (3): Respectful contributor collaboration, TypeScript monorepo, pnpm workspace packages apps packages plugins

## Knowledge Gaps
- **72 isolated node(s):** `DatabaseSync`, `Product Principles`, `apps/ai-gateway provider-agnostic AI gateway`, `apps/worker HTTP-backed worker runner`, `packages/system-sdk data-driven rules-system SDK` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `updatePluginReview()` connect `Community 39` to `Community 0`, `Community 9`, `Community 10`, `Community 5`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `fetch()` connect `Community 15` to `Community 2`, `Community 36`, `Community 9`, `Community 10`, `Community 18`, `Community 20`, `Community 28`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `numericValue()` connect `Community 1` to `Community 3`, `Community 5`, `Community 7`, `Community 8`, `Community 11`, `Community 46`, `Community 47`, `Community 19`, `Community 23`, `Community 54`, `Community 55`, `Community 24`, `Community 59`, `Community 29`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 37 inferred relationships involving `numericValue()` (e.g. with `dnd5eSrdHasSpeciesFeature()` and `dnd5eSrdHasTacticalMind()`) actually correct?**
  _`numericValue()` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 30 inferred relationships involving `stringValue()` (e.g. with `dnd5eSrdHasSpeciesFeature()` and `dnd5eSrdHasTacticalMind()`) actually correct?**
  _`stringValue()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `recordValue()` (e.g. with `dnd5eSrdHasSpeciesFeature()` and `dnd5eSrdHasChannelDivinity()`) actually correct?**
  _`recordValue()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DatabaseSync`, `Product Principles`, `apps/ai-gateway provider-agnostic AI gateway` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._