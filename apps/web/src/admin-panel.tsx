import type { Campaign, EmailOutboxMessage, OrganizationMemberRole, OrganizationWorkspace, ScimAssignableRole, UserRole } from "@open-tabletop/core";
import { Activity, Check, Download, KeyRound, Mail, RefreshCw, RotateCcw, Send, Shield, Timer, Trash2, Upload, UserCog, UserPlus, UserX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, type AdminAssetSnapshotIdentity, type AdminAuthConnectionTestResult, type AdminJob, type AdminJobAlertResult, type AdminOperationalRetentionPlan, type AdminOperationalRetentionRecordClass, type AdminPluginReviewInfo, type AdminScimGroupRoleMapping, type AdminScimGroupRoleMappingInput, type AdminSessionInfo, type AdminSnapshot, type AdminStorageBackupResult, type AdminStorageRestoreDrillResult, type AdminStorageRestoreResult, type AdminUserInfo, type OrganizationMemberInfo, type PluginReviewStatus, type SystemRuntimeInfo } from "./api.js";
import { campaignPermissionTemplates, identityProviderSetupGuides, type CampaignPermissionTemplateId } from "./admin-data.js";
import { aiToolCallErrorCode, scimMappingLabel } from "./admin-panel-utils.js";
import { MetricTile } from "./metric-tile.js";
import { downloadJson, errorMessage, formatAdminList, formatCost, formatDateTime, formatDuration, formatDurationSeconds, formatNumber, formatPercent, formatStorageBytes, jobStatusClass, readinessStatusClass, recordValue, registryHostLabel, stringValue, titleCaseLabel } from "./sheet-format.js";

interface AdminWorkspaceRequest {
  epoch: number;
  controller: AbortController;
}


export function AdminPanel(props: { admin?: AdminSnapshot; campaigns: Campaign[]; systems: SystemRuntimeInfo[]; workspaceDefaults?: OrganizationWorkspace; organizationMembers: OrganizationMemberInfo[]; currentUserId: string; workspaceKey: string; status: string; onRefresh(): Promise<void>; onDisableUser(user: AdminUserInfo): Promise<void>; onEnableUser(user: AdminUserInfo): Promise<void>; onRequireReset(user: AdminUserInfo): Promise<void>; onIssueReset(user: AdminUserInfo): Promise<void>; onRevokeUserSessions(user: AdminUserInfo): Promise<void>; onRevokeSession(session: AdminSessionInfo): Promise<void>; onRevokeRiskSessions(): Promise<void>; onPruneExpiredPasswordResets(): Promise<void>; onRetryEmail(email: EmailOutboxMessage): Promise<void>; onRetryAllEmails(): Promise<void>; onRetryAiToolCall(toolCallId: string, toolName: string): Promise<void>; onFailStaleAiThreads(): Promise<void>; onFailStaleAiToolCalls(): Promise<void>; onRejectStaleAiProposals(includeApproved?: boolean): Promise<void>; onCleanupStoredAssetBytes(): Promise<void>; onMigrateStoredAssetBytes(): Promise<void>; onQuarantineAssetIntegrityFailures(): Promise<void>; onPurgeAssetCdnCache(assetId: string, assetName: string, assetUpdatedAt: string): Promise<void>; onUpdatePluginReview(review: AdminPluginReviewInfo, status: PluginReviewStatus): Promise<void>; onSyncPluginRegistries(): Promise<void>; onUpdateWorkspaceDefaults(input: Partial<OrganizationWorkspace>): Promise<void>; onAddOrganizationMember(input: { email: string; role: Exclude<OrganizationMemberRole, "owner"> }): Promise<void>; onUpdateOrganizationMember(member: OrganizationMemberInfo, role: Exclude<OrganizationMemberRole, "owner">): Promise<void>; onRemoveOrganizationMember(member: OrganizationMemberInfo): Promise<void>; onCreateScimMapping(input: AdminScimGroupRoleMappingInput): Promise<void>; onDeleteScimMapping(mapping: AdminScimGroupRoleMapping): Promise<void> }) {
  const users = props.admin?.users ?? [];
  const sessions = props.admin?.sessions ?? [];
  const emails = props.admin?.emailOutbox.slice().reverse() ?? [];
  const auditLogs = props.admin?.audit.auditLogs ?? [];
  const jobs = props.admin?.jobs ?? [];
  const jobOperations = props.admin?.jobOperations;
  const authOperations = props.admin?.authOperations;
  const storageOperations = props.admin?.storageOperations;
  const operationsMetrics = props.admin?.operationsMetrics;
  const retentionOperations = props.admin?.retentionOperations;
  const assetStorage = props.admin?.assetStorage;
  const assetIntegrity = props.admin?.assetIntegrity;
  const renderingOperations = props.admin?.renderingOperations;
  const systemOperations = props.admin?.systemOperations;
  const aiOperations = props.admin?.aiOperations;
  const pluginReviews = props.admin?.pluginReviews;
  const pluginOperations = props.admin?.pluginOperations;
  const scimMappings = props.admin?.scimGroupRoleMappings ?? [];
  const organizationMembers = props.organizationMembers;
  const disabledAdminUserCount = users.filter((user) => user.disabled).length;
  const resetRequiredAdminUserCount = users.filter((user) => user.passwordResetRequired).length;
  const sessionBearingAdminUserCount = users.filter((user) => user.sessionCount > 0).length;
  const identityLinkedAdminUserCount = users.filter((user) => user.identityCount > 0).length;
  const sessionExpirySoonMs = Date.now() + 24 * 60 * 60 * 1000;
  const expiringSoonSessionCount = sessions.filter((session) => Date.parse(session.expiresAt) <= sessionExpirySoonMs).length;
  const oldestSessionLastSeenAt = sessions.reduce<string | undefined>((oldest, session) => (!oldest || Date.parse(session.lastSeenAt) < Date.parse(oldest) ? session.lastSeenAt : oldest), undefined);
  const newestSessionLastSeenAt = sessions.reduce<string | undefined>((newest, session) => (!newest || Date.parse(session.lastSeenAt) > Date.parse(newest) ? session.lastSeenAt : newest), undefined);
  const newestEmailCreatedAt = emails.reduce<string | undefined>((newest, email) => (!newest || Date.parse(email.createdAt) > Date.parse(newest) ? email.createdAt : newest), undefined);
  const queuedJobCount = jobOperations?.totals.byStatus.queued ?? jobs.filter((job) => job.status === "queued").length;
  const runningJobCount = jobOperations?.totals.byStatus.running ?? jobs.filter((job) => job.status === "running").length;
  const failedJobCount = jobOperations?.totals.byStatus.failed ?? jobs.filter((job) => job.status === "failed").length;
  const cancelledJobCount = jobOperations?.totals.byStatus.cancelled ?? jobs.filter((job) => job.status === "cancelled").length;
  const retryableJobCount = jobOperations?.totals.retryableCount ?? jobs.filter((job) => (job.status === "failed" || job.status === "cancelled") && job.attempts < job.maxAttempts).length;
  const newestJobUpdatedAt = jobOperations?.throughput.newestCompletedAt ?? jobs.reduce<string | undefined>((newest, job) => (!newest || Date.parse(job.updatedAt) > Date.parse(newest) ? job.updatedAt : newest), undefined);
  const jobLedgerSummary = !jobOperations
    ? jobs.length === 0 ? "no recent jobs" : `${formatNumber(jobs.length)} recent jobs`
    : jobOperations.totals.totalCount === 0 ? "no recent jobs" : jobOperations.actionRequired ? "action required" : "healthy";
  const matchedScimMappingCount = scimMappings.filter((mapping) => mapping.group).length;
  const scimMappedMemberCount = scimMappings.reduce((total, mapping) => total + (mapping.group?.memberUserIds.length ?? 0), 0);
  const organizationAdminCount = organizationMembers.filter((member) => member.role === "owner" || member.role === "admin").length;
  const organizationCurrentUser = organizationMembers.find((member) => member.userId === props.currentUserId);
  const oidcRequiredConfiguredCount = authOperations
    ? [
        authOperations.runtime.oidc.issuerConfigured,
        authOperations.runtime.oidc.clientIdConfigured,
        authOperations.runtime.oidc.clientSecretConfigured,
        authOperations.runtime.oidc.redirectUriConfigured
      ].filter(Boolean).length
    : 0;
  const pluginReviewSourceCount = new Set(pluginReviews?.plugins.map((review) => review.source.type) ?? []).size;
  const pluginReviewTrustStatusCount = new Set(pluginReviews?.plugins.map((review) => review.trust.status) ?? []).size;
  const assetCampaignProviderSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.providerCounts)) ?? []).size;
  const assetCampaignLifecycleSpread = new Set(assetStorage?.campaigns.flatMap((campaign) => Object.keys(campaign.lifecycleCounts)) ?? []).size;
  const assetCampaignLargestSampleCount = assetStorage?.campaigns.reduce((total, campaign) => total + campaign.largestAssets.length, 0) ?? 0;
  const renderingFeatureSampleCount = renderingOperations?.featureCoverage.requiredFeatures.reduce((total, feature) => total + feature.samples.length, 0) ?? 0;
  const renderingCoverageSampleCount = Object.values(renderingOperations?.featureCoverage.samples ?? {}).reduce((total, samples) => total + samples.length, 0);
  const primaryRulesCapabilityEvidenceCount = systemOperations?.systems
    .find((system) => system.id === systemOperations.productionReadiness.primarySystemId)
    ?.productionCapability.capabilities.reduce((total, capability) => total + capability.evidenceCount, 0) ?? 0;
  const retryableAiToolCallIds = new Set(aiOperations?.risk.failedToolRetryPolicy?.recentRetryable.map((call) => call.id) ?? []);
  const systemsNeedingProductionDepth =
    systemOperations?.systems.filter((system) => systemOperations.productionReadiness.systemsNeedingProductionDepth.includes(system.id)) ?? [];
  const systemsWithProductionGaps = systemOperations?.systems.filter((system) => system.productionGaps.length > 0) ?? [];
  const productionGapTotal = systemOperations?.productionGapCounts.reduce((total, gap) => total + gap.count, 0) ?? 0;
  const promotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.blockerCount, 0) ?? 0;
  const criticalPromotionBlockerTotal = systemOperations?.promotionBlockers.reduce((total, system) => total + system.criticalBlockerCount, 0) ?? 0;
  const primaryRulesSystem = systemOperations?.systems.find((system) => system.id === systemOperations.productionReadiness.primarySystemId);
  const defaultScimCampaignId = props.campaigns[0]?.id ?? "";
  const workspaceDefaults = props.workspaceDefaults;
  const workspaceSystemOptions = [...new Set(["dnd-5e-srd", ...props.systems.map((system) => system.id), ...props.campaigns.map((campaign) => campaign.defaultSystemId), workspaceDefaults?.defaultSystemId].filter((systemId): systemId is string => Boolean(systemId)))];
  const [scimCampaignId, setScimCampaignId] = useState(defaultScimCampaignId);
  const [scimRole, setScimRole] = useState<ScimAssignableRole>("player");
  const [scimMatchType, setScimMatchType] = useState<"groupDisplayName" | "groupExternalId" | "groupId">("groupDisplayName");
  const [scimGroupValue, setScimGroupValue] = useState("");
  const [workspaceName, setWorkspaceName] = useState(workspaceDefaults?.name ?? "");
  const [workspaceSystemId, setWorkspaceSystemId] = useState(workspaceDefaults?.defaultSystemId ?? "dnd-5e-srd");
  const [workspaceVisibility, setWorkspaceVisibility] = useState<Campaign["visibility"]>(workspaceDefaults?.defaultCampaignVisibility ?? "private");
  const [workspaceTemplate, setWorkspaceTemplate] = useState<CampaignPermissionTemplateId>(workspaceDefaults?.defaultPermissionTemplate ?? "standard");
  const [workspaceInviteRole, setWorkspaceInviteRole] = useState<Exclude<UserRole, "owner" | "plugin" | "ai_assistant">>(workspaceDefaults?.defaultInviteRole ?? "player");
  const [workspaceSceneName, setWorkspaceSceneName] = useState(workspaceDefaults?.defaultSceneName ?? "Opening Scene");
  const [workspaceSceneFolder, setWorkspaceSceneFolder] = useState(workspaceDefaults?.defaultSceneFolder ?? "session-0");
  const [workspaceSceneWidth, setWorkspaceSceneWidth] = useState(workspaceDefaults?.defaultSceneWidth ?? 1200);
  const [workspaceSceneHeight, setWorkspaceSceneHeight] = useState(workspaceDefaults?.defaultSceneHeight ?? 800);
  const [workspaceSceneGridSize, setWorkspaceSceneGridSize] = useState(workspaceDefaults?.defaultSceneGridSize ?? 50);
  const [workspaceOnboardingTitle, setWorkspaceOnboardingTitle] = useState(workspaceDefaults?.onboardingTitle ?? "Welcome to the Table");
  const [workspaceOnboardingBody, setWorkspaceOnboardingBody] = useState(workspaceDefaults?.onboardingBody ?? "");
  const [workspaceDefaultsStatus, setWorkspaceDefaultsStatus] = useState("No workspace defaults saved this session");
  const [organizationMemberEmail, setOrganizationMemberEmail] = useState("");
  const [organizationMemberRole, setOrganizationMemberRole] = useState<Exclude<OrganizationMemberRole, "owner">>("member");
  const [organizationMemberStatus, setOrganizationMemberStatus] = useState("No organization member changes this session");
  const [authConnectionTest, setAuthConnectionTest] = useState<AdminAuthConnectionTestResult>();
  const [authConnectionTestStatus, setAuthConnectionTestStatus] = useState("No auth connection test run");
  const [storageBackupStatus, setStorageBackupStatus] = useState("No storage backup run");
  const [storageRestoreDrill, setStorageRestoreDrill] = useState<AdminStorageRestoreDrillResult>();
  const [storageRestoreConfirm, setStorageRestoreConfirm] = useState("");
  const [retentionClasses, setRetentionClasses] = useState<AdminOperationalRetentionRecordClass[]>(["delivered_emails", "delivered_webhooks", "maintenance_jobs"]);
  const [retentionDays, setRetentionDays] = useState("90");
  const [retentionReason, setRetentionReason] = useState("");
  const [retentionPlan, setRetentionPlan] = useState<AdminOperationalRetentionPlan>();
  const [retentionStatus, setRetentionStatus] = useState("No operational retention preview run");
  const [assetSnapshotId, setAssetSnapshotId] = useState("");
  const [assetSnapshotCreatedAt, setAssetSnapshotCreatedAt] = useState("");
  const [jobLedgerStatus, setJobLedgerStatus] = useState("No job action run");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditTargetTypeFilter, setAuditTargetTypeFilter] = useState("");
  const [auditActorTypeFilter, setAuditActorTypeFilter] = useState("");
  const [auditCampaignFilter, setAuditCampaignFilter] = useState("");
  const [auditExportLimit, setAuditExportLimit] = useState("100");
  const [auditExportStatus, setAuditExportStatus] = useState("No audit export run");
  const workspaceEpochRef = useRef(0);
  const workspaceControllersRef = useRef<Set<AbortController>>(new Set());
  const selectedScimCampaignId = scimCampaignId || defaultScimCampaignId;

  useEffect(() => {
    workspaceEpochRef.current += 1;
    for (const controller of workspaceControllersRef.current) controller.abort();
    workspaceControllersRef.current.clear();
    setScimCampaignId(defaultScimCampaignId);
    setScimGroupValue("");
    setWorkspaceDefaultsStatus("No workspace defaults saved this session");
    setOrganizationMemberEmail("");
    setOrganizationMemberStatus("No organization member changes this session");
    setAuthConnectionTest(undefined);
    setAuthConnectionTestStatus("No auth connection test run");
    setStorageBackupStatus("No storage backup run");
    setStorageRestoreDrill(undefined);
    setStorageRestoreConfirm("");
    setRetentionClasses(["delivered_emails", "delivered_webhooks", "maintenance_jobs"]);
    setRetentionDays("90");
    setRetentionReason("");
    setRetentionPlan(undefined);
    setRetentionStatus("No operational retention preview run");
    setAssetSnapshotId("");
    setAssetSnapshotCreatedAt("");
    setJobLedgerStatus("No job action run");
    setAuditActionFilter("");
    setAuditTargetTypeFilter("");
    setAuditActorTypeFilter("");
    setAuditCampaignFilter("");
    setAuditExportStatus("No audit export run");
    return () => {
      workspaceEpochRef.current += 1;
      for (const controller of workspaceControllersRef.current) controller.abort();
      workspaceControllersRef.current.clear();
    };
  }, [defaultScimCampaignId, props.workspaceKey]);

  function beginAdminWorkspaceRequest(): AdminWorkspaceRequest {
    const controller = new AbortController();
    workspaceControllersRef.current.add(controller);
    return { epoch: workspaceEpochRef.current, controller };
  }

  function adminWorkspaceRequestIsCurrent(request: AdminWorkspaceRequest): boolean {
    return !request.controller.signal.aborted && request.epoch === workspaceEpochRef.current;
  }

  async function runAdminWorkspaceRequest<T>(task: (request: AdminWorkspaceRequest) => Promise<T>, onCurrentResult: (result: T, request: AdminWorkspaceRequest) => void | Promise<void>) {
    const request = beginAdminWorkspaceRequest();
    try {
      const result = await task(request);
      if (!adminWorkspaceRequestIsCurrent(request)) return;
      await onCurrentResult(result, request);
    } catch (error) {
      if (adminWorkspaceRequestIsCurrent(request)) throw error;
    } finally {
      workspaceControllersRef.current.delete(request.controller);
    }
  }

  useEffect(() => {
    if (!workspaceDefaults) return;
    setWorkspaceName(workspaceDefaults.name);
    setWorkspaceSystemId(workspaceDefaults.defaultSystemId);
    setWorkspaceVisibility(workspaceDefaults.defaultCampaignVisibility);
    setWorkspaceTemplate(workspaceDefaults.defaultPermissionTemplate);
    setWorkspaceInviteRole(workspaceDefaults.defaultInviteRole);
    setWorkspaceSceneName(workspaceDefaults.defaultSceneName);
    setWorkspaceSceneFolder(workspaceDefaults.defaultSceneFolder);
    setWorkspaceSceneWidth(workspaceDefaults.defaultSceneWidth);
    setWorkspaceSceneHeight(workspaceDefaults.defaultSceneHeight);
    setWorkspaceSceneGridSize(workspaceDefaults.defaultSceneGridSize);
    setWorkspaceOnboardingTitle(workspaceDefaults.onboardingTitle);
    setWorkspaceOnboardingBody(workspaceDefaults.onboardingBody);
  }, [workspaceDefaults]);
  async function saveWorkspaceDefaults() {
    await runAdminWorkspaceRequest(
      () => props.onUpdateWorkspaceDefaults({
        name: workspaceName,
        defaultSystemId: workspaceSystemId,
        defaultCampaignVisibility: workspaceVisibility,
        defaultPermissionTemplate: workspaceTemplate,
        defaultInviteRole: workspaceInviteRole,
        defaultSceneName: workspaceSceneName,
        defaultSceneFolder: workspaceSceneFolder,
        defaultSceneWidth: workspaceSceneWidth,
        defaultSceneHeight: workspaceSceneHeight,
        defaultSceneGridSize: workspaceSceneGridSize,
        onboardingTitle: workspaceOnboardingTitle,
        onboardingBody: workspaceOnboardingBody
      }),
      () => setWorkspaceDefaultsStatus("Workspace defaults saved")
    );
  }
  async function submitOrganizationMember() {
    const email = organizationMemberEmail.trim();
    if (!email) return;
    const role = organizationMemberRole;
    await runAdminWorkspaceRequest(
      () => props.onAddOrganizationMember({ email, role }),
      () => {
        setOrganizationMemberEmail((current) => current.trim() === email ? "" : current);
        setOrganizationMemberStatus(`Organization member ${email} saved as ${role}`);
      }
    );
  }
  const readinessChecks: Array<{ label: string; status: "ready" | "action" | "missing"; detail: string; playbook: string; proof: string }> = [
    {
      label: "Auth operations",
      status: !authOperations ? "missing" : authOperations.actionRequired ? "action" : "ready",
      detail: !authOperations ? "not loaded" : authOperations.actionReasons.length > 0 ? authOperations.actionReasons.join(", ") : "sessions, identity, email, and enterprise setup loaded",
      playbook: "Run redacted OIDC and SCIM connection tests, then clear invalid auth config, stale sessions, and pending email remediations from the Auth Operations section.",
      proof: "Connection checks report ready or blocked with expected missing variables, and auth remediation queues are empty or assigned."
    },
    {
      label: "SQLite storage",
      status: !storageOperations ? "missing" : storageOperations.actionRequired ? "action" : "ready",
      detail: !storageOperations ? "not loaded" : storageOperations.actionReasons.length > 0 ? storageOperations.actionReasons.join(", ") : `${formatNumber(storageOperations.records?.total)} records checked`,
      playbook: "Create a backup, run a restore drill, confirm required indexes and integrity, and queue a storage backup or drill job when work should run through workers.",
      proof: "Latest backup is present, restore drill passes, integrity is ok, and any queued storage job appears in the Job Ledger."
    },
    {
      label: "Job ledger",
      status: !jobOperations ? "missing" : jobOperations.actionRequired ? "action" : "ready",
      detail: !jobOperations ? "not loaded" : jobOperations.actionReasons.length > 0 ? jobOperations.actionReasons.join(", ") : `${formatNumber(jobOperations.totals.totalCount)} jobs observed`,
      playbook: "Dry-run the job alert, inspect stale queued work, expired leases, stale heartbeats, and retry exhaustion, then retry or cancel affected jobs.",
      proof: "Job alert dry-run returns redacted output, no unassigned stale work remains, and retryable failures have an owner action."
    },
    {
      label: "Asset storage",
      status: !assetStorage ? "missing" : assetStorage.operations.actionRequired ? "action" : "ready",
      detail: !assetStorage ? "not loaded" : assetStorage.operations.actionReasons.length > 0 ? assetStorage.operations.actionReasons.join(", ") : `${formatNumber(assetStorage.assetCount)} assets tracked`,
      playbook: "Review quota pressure, delivery warnings, provider spread, and largest cleanup candidates before archiving or restoring campaign assets.",
      proof: "Delivery diagnostics expose no blocking action reasons and quota guidance names an acceptable next action."
    },
    {
      label: "Asset integrity",
      status: !assetIntegrity ? "missing" : assetIntegrity.actionRequired > 0 ? "action" : "ready",
      detail: !assetIntegrity ? "not loaded" : assetIntegrity.actionReasons.length > 0 ? assetIntegrity.actionReasons.join(", ") : `${formatNumber(assetIntegrity.verified)} verified`,
      playbook: "Run cleanup, migration, quarantine, or CDN purge actions for affected managed assets and preserve integrity failure samples for incident review.",
      proof: "Integrity remediation count drops to zero or every remaining failure is quarantined with an audit row."
    },
    {
      label: "Rendering readiness",
      status: !renderingOperations ? "missing" : renderingOperations.actionRequired ? "action" : "ready",
      detail: !renderingOperations ? "not loaded" : renderingOperations.actionReasons.length > 0 ? renderingOperations.actionReasons.join(", ") : `${formatNumber(renderingOperations.totals.sceneCount)} scenes checked`,
      playbook: "Inspect scenes missing background, grid, fog, wall, light, or annotation coverage and repair the active-session scenes first.",
      proof: "Rendering remediation queue is empty or only contains accepted demo-depth gaps."
    },
    {
      label: "Rules systems",
      status: !systemOperations ? "missing" : systemOperations.productionReadiness.actionRequired || productionGapTotal > 0 ? "action" : "ready",
      detail: !systemOperations ? "not loaded" : productionGapTotal > 0 ? `${formatNumber(productionGapTotal)} production gaps` : `${systemOperations.productionReadiness.primarySystemId} primary`,
      playbook: "Resolve primary-system production gaps, promotion blockers, and compendium depth warnings before enabling the system for a v1 table.",
      proof: "Primary system has no critical promotion blockers and production-gap counts are accepted or closed."
    },
    {
      label: "AI operations",
      status: !aiOperations ? "missing" : aiOperations.actionRequired ? "action" : "ready",
      detail: !aiOperations ? "not loaded" : aiOperations.actionReasons.length > 0 ? aiOperations.actionReasons.join(", ") : `${formatNumber(aiOperations.totals.threadCount)} threads observed`,
      playbook: "Replay failed provider threads, retry safe failed tool calls, reject stale proposals, and verify AI changes still enter as reviewable proposals.",
      proof: "No stale apply-ready or failed retryable AI work remains without a GM-visible recovery action."
    },
    {
      label: "Plugin marketplace",
      status: !pluginOperations ? "missing" : pluginOperations.actionRequired ? "action" : "ready",
      detail: !pluginOperations ? "not loaded" : pluginOperations.actionReasons.length > 0 ? pluginOperations.actionReasons.join(", ") : `${formatNumber(pluginOperations.totals.packageCount)} packages inventoried`,
      playbook: "Sync configured registries, review pending package versions, reject unsafe packages, and resolve permission or core-compatibility drift.",
      proof: "Marketplace review backlog is below policy threshold and blocked or tampered packages cannot install."
    },
    {
      label: "Audit export",
      status: !props.admin ? "missing" : props.admin.audit.summary.actionRequired ? "action" : "ready",
      detail: !props.admin ? "not loaded" : props.admin.audit.summary.actionReasons.length > 0 ? props.admin.audit.summary.actionReasons.join(", ") : `${formatNumber(props.admin.audit.count)} audit rows available`,
      playbook: "Filter audit rows for the target action or actor, export redacted JSON, and attach the export to upgrade, restore, or incident notes.",
      proof: "Redacted audit export succeeds and includes the relevant admin action without leaking secrets."
    }
  ];
  const readinessReadyCount = readinessChecks.filter((check) => check.status === "ready").length;
  const readinessActionCount = readinessChecks.filter((check) => check.status === "action").length;
  const readinessMissingCount = readinessChecks.filter((check) => check.status === "missing").length;
  const readinessStatus = readinessActionCount > 0 ? "action" : readinessMissingCount > 0 ? "missing" : "ready";

  useEffect(() => {
    if (!scimCampaignId && defaultScimCampaignId) setScimCampaignId(defaultScimCampaignId);
  }, [defaultScimCampaignId, scimCampaignId]);

  async function testAuthConnection(provider: AdminAuthConnectionTestResult["provider"]) {
    setAuthConnectionTestStatus(`Testing ${provider.toUpperCase()} connection`);
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminAuthConnectionTestResult>("/api/v1/admin/auth/test-connection", { provider }, { signal: request.controller.signal }),
        (result) => {
          setAuthConnectionTest(result);
          setAuthConnectionTestStatus(`${provider.toUpperCase()} ${result.status}`);
        }
      );
    } catch (error) {
      setAuthConnectionTest(undefined);
      setAuthConnectionTestStatus(errorMessage(error));
    }
  }

  async function createStorageBackup() {
    const activeProvider = assetStorage?.runtime.provider === "local" || assetStorage?.runtime.provider === "s3" ? assetStorage.runtime.provider : undefined;
    const snapshotInputStarted = Boolean(assetSnapshotId || assetSnapshotCreatedAt);
    if (snapshotInputStarted && (!activeProvider || !assetSnapshotId.trim() || !assetSnapshotCreatedAt.trim())) {
      setStorageBackupStatus("Enter both the provider snapshot ID and canonical ISO creation time, or clear both for a database-only backup");
      return;
    }
    const assetSnapshot: AdminAssetSnapshotIdentity | undefined = snapshotInputStarted && activeProvider
      ? { provider: activeProvider, snapshotId: assetSnapshotId.trim(), createdAt: assetSnapshotCreatedAt.trim() }
      : undefined;
    setStorageBackupStatus("Creating backup");
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminStorageBackupResult>("/api/v1/admin/storage/backup", {
          reason: "admin_ui_manual_backup",
          requireAssetSnapshot: Boolean(assetSnapshot),
          ...(assetSnapshot ? { assetSnapshot } : {})
        }, { signal: request.controller.signal, idempotencyKey: crypto.randomUUID() }),
        async (result) => {
          setStorageBackupStatus(result.recoveryPoint.paired
            ? `Paired recovery point created: ${result.fileName} (${formatStorageBytes(result.sizeBytes)})`
            : `Database-only backup created: ${result.fileName}; asset snapshot pairing is still required`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  function toggleRetentionClass(recordClass: AdminOperationalRetentionRecordClass) {
    setRetentionClasses((current) => current.includes(recordClass) ? current.filter((candidate) => candidate !== recordClass) : [...current, recordClass].sort());
    setRetentionPlan(undefined);
    setRetentionStatus("Retention scope changed; run a new preview");
  }

  async function previewOperationalRetention() {
    const olderThanDays = Number(retentionDays);
    if (!Number.isInteger(olderThanDays) || olderThanDays < 1 || olderThanDays > 3650) {
      setRetentionStatus("Retention age must be a whole number from 1 to 3650 days");
      return;
    }
    if (retentionClasses.length === 0) {
      setRetentionStatus("Select at least one terminal operational record class");
      return;
    }
    setRetentionStatus("Previewing exact operational retention targets");
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminOperationalRetentionPlan>("/api/v1/admin/retention/prune", { dryRun: true, olderThanDays, recordClasses: retentionClasses, batchSize: 100 }, { signal: request.controller.signal, idempotencyKey: crypto.randomUUID() }),
        (result) => {
          setRetentionPlan(result);
          setRetentionStatus(`Preview ready: ${formatNumber(result.selectedCount)} selected, ${formatNumber(result.remainingCount)} remain after this batch`);
        }
      );
    } catch (error) {
      setRetentionPlan(undefined);
      setRetentionStatus(errorMessage(error));
    }
  }

  async function executeOperationalRetention() {
    const plan = retentionPlan;
    const reason = retentionReason.trim();
    if (!plan || reason.length < 10) {
      setRetentionStatus("Run a current preview and enter a reason of at least 10 characters");
      return;
    }
    setRetentionStatus("Deleting the exact reviewed operational records");
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminOperationalRetentionPlan>("/api/v1/admin/retention/prune", { dryRun: false, olderThanDays: plan.olderThanDays, recordClasses: plan.recordClasses, batchSize: plan.batchSize, targetSetHash: plan.targetSetHash, reason }, { signal: request.controller.signal, idempotencyKey: crypto.randomUUID() }),
        async (result) => {
          setRetentionPlan(undefined);
          setRetentionReason("");
          setRetentionStatus(`Deleted ${formatNumber(result.deletedCount)} reviewed terminal records; preview again to continue`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setRetentionStatus(errorMessage(error));
    }
  }

  async function runStorageRestoreDrill() {
    setStorageBackupStatus("Running restore drill");
    const latest = storageOperations?.backups?.latest;
    const expectedAssetSnapshot = latest?.recoveryPoint.manifest?.assetSnapshot;
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminStorageRestoreDrillResult>("/api/v1/admin/storage/restore-drill", {
          ...(latest ? { backupFileName: latest.fileName } : {}),
          requireAssetSnapshot: Boolean(expectedAssetSnapshot),
          ...(expectedAssetSnapshot ? { expectedAssetSnapshot } : {})
        }, { signal: request.controller.signal }),
        async (result) => {
          setStorageRestoreDrill(result);
          setStorageBackupStatus(result.status === "passed"
            ? result.actionRequired
              ? `Database restore drill passed, but recovery point needs action: ${result.actionReasons.join(", ")}`
              : `Paired restore drill passed: ${formatNumber(result.recordCount)} records checked`
            : `Restore drill failed: ${result.error ?? "unknown error"}`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setStorageRestoreDrill(undefined);
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function queueStorageJob(type: "storage.backup" | "storage.restoreDrill") {
    setStorageBackupStatus(`Queueing ${type}`);
    const idempotencyKey = crypto.randomUUID();
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminJob>("/api/v1/admin/jobs", {
          type,
          payload: { reason: `admin_ui_${type.replace(".", "_")}` },
          maxAttempts: 3
        }, { signal: request.controller.signal, idempotencyKey }),
        async (job) => {
          setStorageBackupStatus(`${job.type} queued`);
          setJobLedgerStatus(`${job.type} queued`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function restoreStorageBackup(fileName: string) {
    setStorageBackupStatus("Restoring backup");
    try {
      const confirmFileName = storageRestoreConfirm;
      const expectedStateRevision = storageOperations?.restoreStateRevision;
      if (!expectedStateRevision) throw new Error("Refresh storage operations before confirming a destructive restore");
      const latest = storageOperations?.backups?.latest?.fileName === fileName ? storageOperations.backups.latest : undefined;
      const expectedAssetSnapshot = latest?.recoveryPoint.manifest?.assetSnapshot;
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminStorageRestoreResult>("/api/v1/admin/storage/restore", {
          backupFileName: fileName,
          confirmFileName,
          expectedStateRevision,
          reason: "admin_ui_destructive_restore",
          requireAssetSnapshot: Boolean(expectedAssetSnapshot),
          ...(expectedAssetSnapshot ? { expectedAssetSnapshot } : {})
        }, { signal: request.controller.signal, idempotencyKey: crypto.randomUUID() }),
        async (result) => {
          setStorageRestoreDrill(result);
          setStorageRestoreConfirm((current) => current === confirmFileName ? "" : current);
          setStorageBackupStatus(result.status === "passed" ? `Backup restored: ${result.backup?.fileName ?? fileName}` : `Restore failed: ${result.error ?? "unknown error"}`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setStorageBackupStatus(errorMessage(error));
    }
  }

  async function retryAdminJob(job: AdminJob) {
    setJobLedgerStatus(`Retrying ${job.type}`);
    const idempotencyKey = crypto.randomUUID();
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminJob>(`/api/v1/admin/jobs/${job.id}/retry`, { expectedUpdatedAt: job.updatedAt }, { signal: request.controller.signal, idempotencyKey }),
        async (result) => {
          setJobLedgerStatus(`${result.type} requeued with ${formatNumber(result.maxAttempts - result.attempts)} attempts remaining`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function cancelAdminJob(job: AdminJob) {
    setJobLedgerStatus(`Cancelling ${job.type}`);
    const idempotencyKey = crypto.randomUUID();
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminJob>(`/api/v1/admin/jobs/${job.id}/cancel`, { reason: "admin_ui_cancel", expectedUpdatedAt: job.updatedAt }, { signal: request.controller.signal, idempotencyKey }),
        async (result) => {
          setJobLedgerStatus(`${result.type} ${result.status}`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function deliverJobAlert(dryRun: boolean) {
    setJobLedgerStatus(dryRun ? "Dry-running job alert" : "Delivering job alert");
    const deliveryId = crypto.randomUUID();
    try {
      await runAdminWorkspaceRequest(
        (request) => apiPost<AdminJobAlertResult>("/api/v1/admin/jobs/alerts", { deliveryId, dryRun, force: dryRun, reason: dryRun ? "admin_ui_dry_run" : "admin_ui_delivery" }, { signal: request.controller.signal, idempotencyKey: deliveryId }),
        async (result) => {
          const target = result.configured ? `webhook ${result.webhookStatus ?? "configured"}` : "webhook not configured";
          setJobLedgerStatus(`${result.status}: ${formatNumber(result.remediationCount)} remediations - ${target}`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setJobLedgerStatus(errorMessage(error));
    }
  }

  async function exportAuditLogs() {
    setAuditExportStatus("Exporting redacted audit JSON");
    try {
      const params = new URLSearchParams();
      params.set("format", "json");
      params.set("limit", auditExportLimit || "100");
      if (auditActionFilter.trim()) params.set("action", auditActionFilter.trim());
      if (auditTargetTypeFilter.trim()) params.set("targetType", auditTargetTypeFilter.trim());
      if (auditActorTypeFilter.trim()) params.set("actorType", auditActorTypeFilter.trim());
      if (auditCampaignFilter.trim()) params.set("campaignId", auditCampaignFilter.trim());
      await runAdminWorkspaceRequest(
        (request) => apiGet<AdminSnapshot["audit"]>(`/api/v1/admin/audit-logs?${params.toString()}`, { signal: request.controller.signal }),
        async (exportBundle) => {
          downloadJson(`audit-${new Date(exportBundle.exportedAt).toISOString().slice(0, 10)}.json`, exportBundle);
          setAuditExportStatus(`Exported ${formatNumber(exportBundle.count)} redacted audit rows`);
          await props.onRefresh();
        }
      );
    } catch (error) {
      setAuditExportStatus(errorMessage(error));
    }
  }

  return (
    <div className="panel-stack admin-panel">
      <div className="panel-heading">
        <div className="section-title">Server Admin</div>
        <button className="icon-button" title="Refresh admin operations" aria-label="Refresh admin operations" onClick={() => props.onRefresh().catch(console.error)}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="admin-status">{props.status}</div>

      <section className="admin-section production-readiness" aria-label="Production readiness">
        <div className="operator-heading">
          <div>
            <div className="section-title">Production Readiness</div>
            <p>{formatNumber(readinessReadyCount)} ready - {formatNumber(readinessActionCount)} action - {formatNumber(readinessMissingCount)} missing</p>
          </div>
          <span className={readinessStatusClass(readinessStatus)}>{readinessStatus === "ready" ? "ready" : readinessStatus === "missing" ? "loading" : "action required"}</span>
        </div>
        <div className="metric-grid readiness-metrics">
          <MetricTile label="Ready Checks" value={formatNumber(readinessReadyCount)} />
          <MetricTile label="Action Checks" value={formatNumber(readinessActionCount)} />
          <MetricTile label="Missing Checks" value={formatNumber(readinessMissingCount)} />
          <MetricTile label="Total Checks" value={formatNumber(readinessChecks.length)} />
        </div>
        <div className="readiness-checklist" aria-label="Production readiness checklist">
          {readinessChecks.map((check) => (
            <article className="readiness-check" key={check.label}>
              <span className={readinessStatusClass(check.status)}>{check.status}</span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="readiness-checklist" aria-label="Production readiness remediation playbooks">
          {readinessChecks.map((check) => (
            <article className="readiness-check" key={`${check.label}-playbook`}>
              <span className={readinessStatusClass(check.status)}>{check.status}</span>
              <div>
                <strong>{check.label} playbook</strong>
                <p>{check.playbook}</p>
                <p>Proof: {check.proof}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section" aria-label="Auth operations">
        <div className="operator-heading">
          <div className="section-title">Auth Operations</div>
          <strong>{authOperations?.runtime.nodeEnv ?? "not loaded"}</strong>
        </div>
        {!authOperations ? (
          <div className="empty-state compact">No auth operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.actionRequired ? "failed" : "completed"}`}>{authOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{authOperations.runtime.legacyUserHeader.mode}</strong>
              </div>
              <p>{authOperations.emailOutbox.webhookConfigured ? "email webhook configured" : "email webhook not configured"} - {formatNumber(authOperations.identities.identityCount)} linked identities</p>
              <div className="admin-meta">
                <span>{authOperations.actionReasons.length > 0 ? authOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(authOperations.users.passwordUserCount)} password users</span>
                <span>{formatNumber(authOperations.users.mfaEnabledUserCount)} MFA enabled</span>
                <span>{formatPercent(authOperations.users.mfaCoverageRate)} MFA coverage</span>
                {authOperations.runtime.authUrls.invalidUrlConfig.length > 0 && <span>invalid auth URLs {authOperations.runtime.authUrls.invalidUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.insecureUrlConfig.length > 0 && <span>insecure auth URLs {authOperations.runtime.authUrls.insecureUrlConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.invalidNumericConfig.length > 0 && <span>invalid auth config {authOperations.runtime.authUrls.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.sessions.invalidNumericConfig.length > 0 && <span>invalid session config {authOperations.runtime.sessions.invalidNumericConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.invalidConfig.length > 0 && <span>invalid OIDC config {authOperations.runtime.oidc.invalidConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.insecureConfig.length > 0 && <span>insecure OIDC config {authOperations.runtime.oidc.insecureConfig.join(", ")}</span>}
                {authOperations.runtime.authUrls.passwordReset.linkMissingInProduction && <span>production reset link missing</span>}
                {authOperations.runtime.authUrls.emailWebhook.tokenMissingInProduction && <span>production webhook token missing</span>}
                {authOperations.runtime.oidc.missingInProduction && <span>production OIDC missing</span>}
                <span>{authOperations.runtime.oidc.configured ? "OIDC configured" : "OIDC not configured"}</span>
                {authOperations.runtime.serverAdmins.missingInProduction && <span>production server admins missing</span>}
                <span>{formatNumber(authOperations.runtime.serverAdmins.count)} server admins</span>
                <span>session TTL {formatNumber(authOperations.runtime.sessions.ttlDays)}d</span>
                <span>reset TTL {formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)}m</span>
                <span>{authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "webhook token configured" : "webhook token missing"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Users" value={formatNumber(authOperations.users.totalUserCount)} />
              <MetricTile label="Active Users" value={formatNumber(authOperations.users.activeUserCount)} />
              <MetricTile label="Auth Action" value={authOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Auth Reasons" value={formatNumber(authOperations.actionReasons.length)} />
              <MetricTile label="Auth Remediations" value={formatNumber(authOperations.remediationQueue.length)} />
              <MetricTile label="Auth Critical" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Auth Warnings" value={formatNumber(authOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Linked Identities" value={formatNumber(authOperations.identities.identityCount)} />
              <MetricTile label="Identity Providers" value={formatNumber(Object.keys(authOperations.identities.providerCounts).length)} />
              <MetricTile label="Server Admins" value={formatNumber(authOperations.runtime.serverAdmins.count)} />
              <MetricTile label="Admin Configured" value={authOperations.runtime.serverAdmins.configured ? "yes" : "no"} />
              <MetricTile label="Admin Prod Ready" value={authOperations.runtime.serverAdmins.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Config Errors" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length + authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Invalid Config" value={formatNumber(authOperations.runtime.oidc.invalidConfig.length)} />
              <MetricTile label="OIDC Insecure Config" value={formatNumber(authOperations.runtime.oidc.insecureConfig.length)} />
              <MetricTile label="OIDC Configured" value={authOperations.runtime.oidc.configured ? "yes" : "no"} />
              <MetricTile label="OIDC Prod Ready" value={authOperations.runtime.oidc.missingInProduction ? "no" : "yes"} />
              <MetricTile label="OIDC Complete" value={authOperations.runtime.oidc.issuerConfigured && authOperations.runtime.oidc.clientIdConfigured && authOperations.runtime.oidc.clientSecretConfigured && authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Issuer" value={authOperations.runtime.oidc.issuerConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Client ID" value={authOperations.runtime.oidc.clientIdConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Secret" value={authOperations.runtime.oidc.clientSecretConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Redirect" value={authOperations.runtime.oidc.redirectUriConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Return Origins" value={authOperations.runtime.oidc.allowedReturnOriginsConfigured ? "yes" : "no"} />
              <MetricTile label="OIDC Token Auth" value={authOperations.runtime.oidc.tokenAuth} />
              <MetricTile label="OIDC Insecure Issuer" value={authOperations.runtime.oidc.allowInsecureIssuer ? "yes" : "no"} />
              <MetricTile label="Auth URL Errors" value={formatNumber(authOperations.runtime.authUrls.invalidUrlConfig.length + authOperations.runtime.authUrls.insecureUrlConfig.length)} />
              <MetricTile label="Auth Config Errors" value={formatNumber(authOperations.runtime.authUrls.invalidNumericConfig.length)} />
              <MetricTile label="Session TTL" value={`${formatNumber(authOperations.runtime.sessions.ttlDays)} d`} />
              <MetricTile label="Stale Threshold" value={`${formatNumber(authOperations.sessions.staleDays)} d`} />
              <MetricTile label="Session Config Errors" value={formatNumber(authOperations.runtime.sessions.invalidNumericConfig.length)} />
              <MetricTile label="Disabled" value={formatNumber(authOperations.users.disabledUserCount)} />
              <MetricTile label="Disabled User Rate" value={formatPercent(authOperations.users.totalUserCount === 0 ? 0 : authOperations.users.disabledUserCount / authOperations.users.totalUserCount)} />
              <MetricTile label="Recent Disabled Users" value={formatNumber(authOperations.users.disabledUsers.length)} />
              <MetricTile label="Disabled User Sessions" value={formatNumber(authOperations.users.disabledUsers.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Sessions" value={formatNumber(authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Sessions" value={formatNumber(authOperations.sessions.totals.riskSessionCount)} />
              <MetricTile label="Risk Session Rate" value={formatPercent(authOperations.sessions.totals.sessionCount === 0 ? 0 : authOperations.sessions.totals.riskSessionCount / authOperations.sessions.totals.sessionCount)} />
              <MetricTile label="Risk Session Samples" value={formatNumber(authOperations.sessions.recentRiskSessions.length)} />
              <MetricTile label="Expired Sessions" value={formatNumber(authOperations.sessions.totals.expiredSessionCount)} />
              <MetricTile label="Stale Sessions" value={formatNumber(authOperations.sessions.totals.staleSessionCount)} />
              <MetricTile label="Disabled Sessions" value={formatNumber(authOperations.sessions.totals.disabledUserSessionCount)} />
              <MetricTile label="Unknown Sessions" value={formatNumber(authOperations.sessions.totals.unknownUserSessionCount)} />
              <MetricTile label="Risk Cleanup Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRunCount)} />
              <MetricTile label="Recent Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.length)} />
              <MetricTile label="Recent Risk Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.reduce((total, run) => total + run.revoked, 0))} />
              <MetricTile label="Latest Risk Cleanup" value={authOperations.sessions.cleanupOperations.latestRiskRevokeAt ? formatDateTime(authOperations.sessions.cleanupOperations.latestRiskRevokeAt) : "none"} />
              <MetricTile label="Risk Dry Runs" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeDryRunCount)} />
              <MetricTile label="Risk Matched" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMatchedCount)} />
              <MetricTile label="Risk Cleanup" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeMutationCount)} />
              <MetricTile label="Sessions Revoked" value={formatNumber(authOperations.sessions.cleanupOperations.riskRevokeRevokedCount)} />
              <MetricTile label="Direct Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.singleSessionRevocationCount)} />
              <MetricTile label="User Revokes" value={formatNumber(authOperations.sessions.cleanupOperations.userSessionRevocationRunCount)} />
              <MetricTile label="Reset Required" value={formatNumber(authOperations.users.passwordResetRequiredUserCount)} />
              <MetricTile label="Password Users" value={formatNumber(authOperations.users.passwordUserCount)} />
              <MetricTile label="MFA Enabled" value={formatNumber(authOperations.users.mfaEnabledUserCount)} />
              <MetricTile label="MFA Coverage" value={formatPercent(authOperations.users.mfaCoverageRate)} />
              <MetricTile label="No MFA" value={formatNumber(authOperations.users.activePasswordUserWithoutMfaCount)} />
              <MetricTile label="No MFA Rate" value={formatPercent(authOperations.users.passwordUserCount === 0 ? 0 : authOperations.users.activePasswordUserWithoutMfaCount / authOperations.users.passwordUserCount)} />
              <MetricTile label="No MFA Samples" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.length)} />
              <MetricTile label="No MFA Sessions" value={formatNumber(authOperations.users.activePasswordUsersWithoutMfa.reduce((total, user) => total + user.sessionCount, 0))} />
              <MetricTile label="Email Webhook" value={authOperations.emailOutbox.webhookConfigured ? "yes" : "no"} />
              <MetricTile label="Email Messages" value={formatNumber(authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Email Statuses" value={formatNumber(Object.keys(authOperations.emailOutbox.statusCounts).length)} />
              <MetricTile label="Email Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
              <MetricTile label="Pending Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.pending)} />
              <MetricTile label="Retry Emails" value={formatNumber(authOperations.emailOutbox.retryableCount)} />
              <MetricTile label="Retry Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : authOperations.emailOutbox.retryableCount / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Recent Retry Emails" value={formatNumber(authOperations.emailOutbox.recentRetryableMessages.length)} />
              <MetricTile label="Delivered Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.delivered)} />
              <MetricTile label="Email Delivery Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 1 : (authOperations.emailOutbox.statusCounts.delivered ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Failed Emails" value={formatNumber(authOperations.emailOutbox.statusCounts.failed)} />
              <MetricTile label="Failed Email Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : (authOperations.emailOutbox.statusCounts.failed ?? 0) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Undelivered Emails" value={formatNumber((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0))} />
              <MetricTile label="Undelivered Rate" value={formatPercent(authOperations.emailOutbox.messageCount === 0 ? 0 : ((authOperations.emailOutbox.statusCounts.pending ?? 0) + (authOperations.emailOutbox.statusCounts.failed ?? 0)) / authOperations.emailOutbox.messageCount)} />
              <MetricTile label="Oldest Retry Email" value={formatDurationSeconds(authOperations.emailOutbox.oldestRetryableAgeSeconds)} />
              <MetricTile label="Reset Tokens" value={formatNumber(authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Active Resets" value={formatNumber(authOperations.passwordResets.activeCount)} />
              <MetricTile label="Expired Resets" value={formatNumber(authOperations.passwordResets.expiredUnusedCount)} />
              <MetricTile label="Expired Reset Rate" value={formatPercent((authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount) === 0 ? 0 : authOperations.passwordResets.expiredUnusedCount / (authOperations.passwordResets.activeCount + authOperations.passwordResets.expiredUnusedCount))} />
              <MetricTile label="Reset URL" value={authOperations.runtime.authUrls.passwordReset.configured ? (authOperations.runtime.authUrls.passwordReset.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Reset URL Secure" value={authOperations.runtime.authUrls.passwordReset.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Reset TTL" value={`${formatNumber(authOperations.runtime.authUrls.passwordReset.ttlMinutes)} m`} />
              <MetricTile label="Web Origin" value={authOperations.runtime.authUrls.passwordReset.webOriginConfigured ? (authOperations.runtime.authUrls.passwordReset.webOriginValid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Web Origin Secure" value={authOperations.runtime.authUrls.passwordReset.webOriginInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook URL" value={authOperations.runtime.authUrls.emailWebhook.configured ? (authOperations.runtime.authUrls.emailWebhook.valid ? "valid" : "invalid") : "missing"} />
              <MetricTile label="Webhook Secure" value={authOperations.runtime.authUrls.emailWebhook.insecureInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Timeout" value={formatDuration(authOperations.runtime.authUrls.emailWebhook.timeoutMs)} />
              <MetricTile label="Reset Link Ready" value={authOperations.runtime.authUrls.passwordReset.linkMissingInProduction ? "no" : "yes"} />
              <MetricTile label="Webhook Token" value={authOperations.runtime.authUrls.emailWebhook.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Legacy Enabled" value={authOperations.runtime.legacyUserHeader.enabled ? "yes" : "no"} />
              <MetricTile label="Legacy Mode" value={authOperations.runtime.legacyUserHeader.mode} />
              <MetricTile label="Legacy Hard Fence" value={authOperations.runtime.legacyUserHeader.productionHardFence ? "yes" : "no"} />
              <MetricTile label="Legacy Compat Flag" value={authOperations.runtime.legacyUserHeader.compatibilityFlagSet ? "yes" : "no"} />
              <MetricTile label="Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.usageCount)} />
              <MetricTile label="Recent Legacy Auth" value={formatNumber(authOperations.legacyUserHeaderUsage.recentSamples.length)} />
              <MetricTile label="Legacy Users" value={formatNumber(authOperations.legacyUserHeaderUsage.distinctUserCount)} />
              <MetricTile label="Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedAttemptCount)} />
              <MetricTile label="Legacy Block Rate" value={formatPercent((authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount) === 0 ? 0 : authOperations.legacyUserHeaderUsage.blockedAttemptCount / (authOperations.legacyUserHeaderUsage.usageCount + authOperations.legacyUserHeaderUsage.blockedAttemptCount))} />
              <MetricTile label="Recent Blocked Legacy" value={formatNumber(authOperations.legacyUserHeaderUsage.blockedSamples.length)} />
              <MetricTile label="Legacy Last Seen" value={authOperations.legacyUserHeaderUsage.lastSeenAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastSeenAt) : "none"} />
              <MetricTile label="Legacy Last Blocked" value={authOperations.legacyUserHeaderUsage.lastBlockedAt ? formatDateTime(authOperations.legacyUserHeaderUsage.lastBlockedAt) : "none"} />
              <MetricTile label="Login Failures" value={formatNumber(authOperations.loginFailures.failureCount)} />
              <MetricTile label="Recent Login Failures" value={formatNumber(authOperations.loginFailures.recentFailures.length)} />
              <MetricTile label="Known Login Users" value={formatNumber(authOperations.loginFailures.distinctKnownUserCount)} />
              <MetricTile label="Unknown Logins" value={formatNumber(authOperations.loginFailures.unknownIdentityCount)} />
              <MetricTile label="Unknown Login Rate" value={formatPercent(authOperations.loginFailures.failureCount === 0 ? 0 : authOperations.loginFailures.unknownIdentityCount / authOperations.loginFailures.failureCount)} />
              <MetricTile label="Login Reasons" value={formatNumber(Object.keys(authOperations.loginFailures.reasonCounts).length)} />
              <MetricTile label="Login Statuses" value={formatNumber(Object.keys(authOperations.loginFailures.statusCounts).length)} />
            </div>
            <div className="admin-actions">
              <button className="ghost-button" title="Revoke expired, stale, disabled-user, and unknown-user sessions" onClick={() => props.onRevokeRiskSessions().catch(console.error)} disabled={authOperations.sessions.totals.riskSessionCount === 0}>
                <RefreshCw size={14} /> Revoke risk sessions
              </button>
              <button className="ghost-button" title="Prune expired password reset tokens" onClick={() => props.onPruneExpiredPasswordResets().catch(console.error)} disabled={authOperations.passwordResets.expiredUnusedCount === 0}>
                <RefreshCw size={14} /> Prune expired resets
              </button>
              <button className="ghost-button" title="Retry all pending and failed auth email deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={authOperations.emailOutbox.retryableCount === 0 || !authOperations.emailOutbox.webhookConfigured}>
                <Mail size={14} /> Retry emails
              </button>
            </div>
            {authOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`auth-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {authOperations.loginFailures.failureCount > 0 && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review</span>
                  <strong>{formatNumber(authOperations.loginFailures.failureCount)} failed</strong>
                </div>
                <h3>Login failures</h3>
                <p>{formatNumber(authOperations.loginFailures.unknownIdentityCount)} unknown identities - {formatNumber(authOperations.loginFailures.distinctKnownUserCount)} known users</p>
                <div className="admin-meta">
                  {Object.entries(authOperations.loginFailures.reasonCounts).map(([reason, count]) => (
                    <span key={`login-failure-reason-${reason}`}>{reason} {formatNumber(count)}</span>
                  ))}
                </div>
              </article>
            )}
            {authOperations.sessions.recentRiskSessions.slice(0, 3).map((riskSession) => (
              <div className="operator-row tool-call-row" key={riskSession.session.id}>
                <span>{riskSession.user.displayName}</span>
                <strong>{riskSession.reasons.join(", ")} - {riskSession.lastSeenAgeDays ?? 0}d seen - expires {formatDuration(Math.max(0, riskSession.expiresInMs))}</strong>
              </div>
            ))}
            {authOperations.sessions.cleanupOperations.recentRiskRevokeRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`risk-session-cleanup-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run risk cleanup" : "risk cleanup"}</span>
                <strong>{run.reasons.join(", ") || "all reasons"} - {formatNumber(run.revoked)} revoked / {formatNumber(run.matched)} matched - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {authOperations.users.disabledUsers.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`disabled-user-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.disabledAt ? formatDateTime(user.disabledAt) : "disabled"}</strong>
              </div>
            ))}
            {authOperations.users.activePasswordUsersWithoutMfa.slice(0, 3).map((user) => (
              <div className="operator-row tool-call-row" key={`no-mfa-${user.id}`}>
                <span>{user.displayName}</span>
                <strong>{user.email ?? user.id} - {formatNumber(user.sessionCount)} sessions - {user.passwordResetRequired ? "reset required" : "password active"}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.recentSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>{sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.legacyUserHeaderUsage.blockedSamples.slice(0, 3).map((sample) => (
              <div className="operator-row tool-call-row" key={`blocked-legacy-auth-${sample.auditLogId}`}>
                <span>{sample.userId}</span>
                <strong>blocked {sample.source} - {sample.mode} - {formatDateTime(sample.createdAt)}</strong>
              </div>
            ))}
            {authOperations.loginFailures.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`auth-login-failure-${failure.auditLogId}`}>
                <span>{failure.userId ?? "unknown identity"}</span>
                <strong>{failure.reason} - HTTP {failure.statusCode} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {authOperations.emailOutbox.recentRetryableMessages.slice(0, 3).map((message) => (
              <div className="operator-row tool-call-row" key={`retry-email-${message.id}`}>
                <span>{message.subject}</span>
                <strong>{message.to} - {message.status}{message.error ? ` - ${message.error}` : ""}</strong>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Measured operational retention">
        <div className="operator-heading">
          <div className="section-title">Measured Retention</div>
          <strong>{retentionOperations ? "preservation first" : "not loaded"}</strong>
        </div>
        {!retentionOperations ? (
          <div className="empty-state compact">No operational retention diagnostics loaded.</div>
        ) : (
          <>
            <p className="account-summary">Only old, terminal email, webhook, and maintenance-job ledgers are eligible. Canonical campaign state, audit logs, active idempotency protection, failed/retryable work, and archive-import recovery records are always exempt.</p>
            <div className="metric-grid">
              <MetricTile label="Delivered Emails" value={formatNumber(retentionOperations.counts.delivered_emails)} />
              <MetricTile label="Delivered Webhooks" value={formatNumber(retentionOperations.counts.delivered_webhooks)} />
              <MetricTile label="Maintenance Jobs" value={formatNumber(retentionOperations.counts.maintenance_jobs)} />
              <MetricTile label="Terminal Total" value={formatNumber(retentionOperations.totalEligibleTerminalRecords)} />
            </div>
            <fieldset className="operator-grid">
              <legend>Retention scope</legend>
              {(["delivered_emails", "delivered_webhooks", "maintenance_jobs"] as const).map((recordClass) => (
                <label key={recordClass}>
                  <input type="checkbox" checked={retentionClasses.includes(recordClass)} onChange={() => toggleRetentionClass(recordClass)} />
                  {recordClass.replaceAll("_", " ")}
                </label>
              ))}
              <label>
                Older than days
                <input type="number" min={1} max={3650} value={retentionDays} onChange={(event) => { setRetentionDays(event.target.value); setRetentionPlan(undefined); setRetentionStatus("Retention age changed; run a new preview"); }} />
              </label>
            </fieldset>
            <label>
              Operator reason
              <textarea value={retentionReason} maxLength={500} placeholder="Why these measured terminal records can be removed after recovery proof" onChange={(event) => setRetentionReason(event.target.value)} />
            </label>
            <p className="admin-status" role="status">{retentionStatus}</p>
            {retentionPlan && (
              <div className="operator-item admin-item" aria-label="Exact operational retention impact">
                <div className="operator-row"><span>Exact reviewed batch</span><strong>{formatNumber(retentionPlan.selectedCount)} of {formatNumber(retentionPlan.eligibleCount)}</strong></div>
                {retentionPlan.selected.map((candidate) => (
                  <div className="operator-row tool-call-row" key={`${candidate.recordClass}-${candidate.id}`}>
                    <span>{candidate.recordClass.replaceAll("_", " ")}</span>
                    <strong>{candidate.id} - {formatDateTime(candidate.completedAt)}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="admin-actions">
              <button className="ghost-button" type="button" onClick={() => previewOperationalRetention().catch(console.error)}><RefreshCw size={14} /> Preview exact impact</button>
              <button className="ghost-button" type="button" onClick={() => executeOperationalRetention().catch(console.error)} disabled={!retentionPlan || retentionPlan.selectedCount === 0 || retentionReason.trim().length < 10}><Trash2 size={14} /> Delete reviewed batch</button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Auth setup">
        <div className="operator-heading">
          <div className="section-title">Auth Setup</div>
          <strong>{authOperations ? (authOperations.runtime.oidc.configured || authOperations.runtime.scim.configured ? "enterprise ready" : "local accounts") : "not loaded"}</strong>
        </div>
        {!authOperations ? (
          <div className="empty-state compact">No auth setup data loaded.</div>
        ) : (
          <>
            <div className="metric-grid">
              <MetricTile label="OIDC Setup" value={authOperations.runtime.oidc.configured ? "ready" : "missing"} />
              <MetricTile label="OIDC Required Vars" value={formatNumber(oidcRequiredConfiguredCount)} />
              <MetricTile label="SCIM Setup" value={authOperations.runtime.scim.configured ? "ready" : "missing"} />
              <MetricTile label="SCIM Users" value={formatNumber(authOperations.runtime.scim.userCount)} />
              <MetricTile label="SCIM Groups" value={formatNumber(authOperations.runtime.scim.groupCount)} />
              <MetricTile label="SCIM Matched Maps" value={formatNumber(authOperations.runtime.scim.matchedMappingCount)} />
            </div>
            <div className="admin-actions">
              <button className="ghost-button" title="Run redacted OIDC discovery readiness check" onClick={() => testAuthConnection("oidc").catch(console.error)}>
                <Shield size={14} /> Test OIDC
              </button>
              <button className="ghost-button" title="Run redacted SCIM endpoint readiness check" onClick={() => testAuthConnection("scim").catch(console.error)}>
                <Shield size={14} /> Test SCIM
              </button>
            </div>
            <div className="import-status auth-test-status" role="status" aria-live="polite">
              <strong>Auth test</strong>
              <span>{authConnectionTestStatus}</span>
            </div>
            <div className="asset-pressure-list" aria-label="Identity provider setup guides">
              {identityProviderSetupGuides.map((guide) => (
                <div className="operator-row tool-call-row" key={guide.id}>
                  <span>{guide.name}</span>
                  <strong>{guide.oidc} {guide.scim}</strong>
                </div>
              ))}
            </div>
            {authConnectionTest && (
              <article className="operator-item admin-item" aria-label={`${authConnectionTest.provider.toUpperCase()} connection test result`}>
                <div className="operator-row">
                  <span className={`status-pill ${authConnectionTest.ok ? "completed" : authConnectionTest.status === "failed" ? "failed" : "running"}`}>{authConnectionTest.status}</span>
                  <strong>{authConnectionTest.provider.toUpperCase()} test</strong>
                </div>
                <p>{authConnectionTest.checks.filter((check) => check.ok).length} of {authConnectionTest.checks.length} checks passed - {formatDateTime(authConnectionTest.testedAt)}</p>
                <div className="admin-meta">
                  {authConnectionTest.checks.map((check) => (
                    <span key={`${authConnectionTest.provider}-${check.name}`}>{check.name} {check.ok ? "ok" : "blocked"}: {check.detail}</span>
                  ))}
                </div>
              </article>
            )}
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.runtime.oidc.configured && authOperations.runtime.oidc.invalidConfig.length === 0 ? "completed" : "running"}`}>OIDC</span>
                <strong>{authOperations.runtime.oidc.tokenAuth}</strong>
              </div>
              <h3>Single sign-on</h3>
              <p>{authOperations.runtime.oidc.configured ? "OIDC sign-in is available from the login screen." : "Set the OIDC environment variables, then refresh this panel to validate the setup posture."}</p>
              <div className="admin-meta">
                <span>OTTE_OIDC_ISSUER {authOperations.runtime.oidc.issuerConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_CLIENT_ID {authOperations.runtime.oidc.clientIdConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_CLIENT_SECRET {authOperations.runtime.oidc.clientSecretConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_REDIRECT_URI {authOperations.runtime.oidc.redirectUriConfigured ? "set" : "missing"}</span>
                <span>OTTE_OIDC_ALLOWED_RETURN_ORIGINS {authOperations.runtime.oidc.allowedReturnOriginsConfigured ? "set" : "optional"}</span>
                {authOperations.runtime.oidc.invalidConfig.length > 0 && <span>invalid {authOperations.runtime.oidc.invalidConfig.join(", ")}</span>}
                {authOperations.runtime.oidc.insecureConfig.length > 0 && <span>insecure {authOperations.runtime.oidc.insecureConfig.join(", ")}</span>}
              </div>
            </div>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${authOperations.runtime.scim.configured ? "completed" : "running"}`}>SCIM</span>
                <strong>{formatNumber(authOperations.runtime.scim.mappingCount)} mappings</strong>
              </div>
              <h3>Directory provisioning</h3>
              <p>{authOperations.runtime.scim.configured ? "SCIM bearer provisioning is enabled; map directory groups below to campaign roles." : "Set OTTE_SCIM_BEARER_TOKEN to enable SCIM v2 provisioning endpoints."}</p>
              <div className="admin-meta">
                <span>OTTE_SCIM_BEARER_TOKEN {authOperations.runtime.scim.bearerTokenConfigured ? "set" : "missing"}</span>
                <span>{authOperations.runtime.scim.serviceProviderConfigPath}</span>
                <span>{authOperations.runtime.scim.usersPath}</span>
                <span>{authOperations.runtime.scim.groupsPath}</span>
                <span>{formatNumber(authOperations.runtime.scim.groupCount)} groups</span>
                <span>{formatNumber(authOperations.runtime.scim.userCount)} users</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin users">
        <div className="operator-heading">
          <div className="section-title">Users</div>
          <strong>{users.length}</strong>
        </div>
        {users.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Admin Users" value={formatNumber(users.length)} />
            <MetricTile label="Disabled Users" value={formatNumber(disabledAdminUserCount)} />
            <MetricTile label="Reset Required Users" value={formatNumber(resetRequiredAdminUserCount)} />
            <MetricTile label="Users With Sessions" value={formatNumber(sessionBearingAdminUserCount)} />
            <MetricTile label="Linked Identity Users" value={formatNumber(identityLinkedAdminUserCount)} />
            <MetricTile label="User Sessions" value={formatNumber(users.reduce((total, user) => total + user.sessionCount, 0))} />
            <MetricTile label="User Memberships" value={formatNumber(users.reduce((total, user) => total + user.membershipCount, 0))} />
            <MetricTile label="User Identities" value={formatNumber(users.reduce((total, user) => total + user.identityCount, 0))} />
          </div>
        )}
        {users.length === 0 ? (
          <div className="empty-state compact">No admin user data loaded.</div>
        ) : (
          users.map((user) => (
            <article className="operator-item admin-item" key={user.id}>
              <div className="operator-row">
                <span className={`status-pill ${user.disabled ? "failed" : "completed"}`}>{user.disabled ? "disabled" : "active"}</span>
                <strong>{user.sessionCount} sessions</strong>
              </div>
              <h3>{user.displayName}</h3>
              <p>{user.email ?? "No email"} - {user.id}</p>
              <div className="admin-meta">
                <span>{user.membershipCount} memberships</span>
                <span>{user.identityCount} identities</span>
                <span>{user.passwordResetRequired ? "reset required" : "password current"}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Issue password reset email" onClick={() => props.onIssueReset(user).catch(console.error)} disabled={!user.email || user.disabled}>
                  <Mail size={14} /> Reset
                </button>
                <button className="ghost-button" title="Require password reset at next login" onClick={() => props.onRequireReset(user).catch(console.error)} disabled={user.disabled}>
                  <KeyRound size={14} /> Require
                </button>
                {user.disabled ? (
                  <button className="ghost-button" title="Enable account" onClick={() => props.onEnableUser(user).catch(console.error)}>
                    <Check size={14} /> Enable
                  </button>
                ) : (
                  <button className="ghost-button" title={user.id === props.currentUserId ? "Admins cannot disable their current account" : "Disable account"} onClick={() => props.onDisableUser(user).catch(console.error)} disabled={user.id === props.currentUserId}>
                    <UserX size={14} /> Disable
                  </button>
                )}
                <button className="ghost-button" title="Revoke all user sessions" onClick={() => props.onRevokeUserSessions(user).catch(console.error)} disabled={user.sessionCount === 0}>
                  <RefreshCw size={14} /> Revoke
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Organization workspace defaults">
        <div className="operator-heading">
          <div className="section-title">Workspace Defaults</div>
          <strong>{workspaceDefaults ? formatDateTime(workspaceDefaults.updatedAt) : "not loaded"}</strong>
        </div>
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveWorkspaceDefaults().catch((error) => setWorkspaceDefaultsStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="operator-row">
            <span>{workspaceDefaults?.id ?? "organization workspace"}</span>
            <strong>{workspaceVisibility}</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Name</span>
              <input aria-label="Workspace default name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </label>
            <label>
              <span>Rules system</span>
              <select aria-label="Workspace default rules system" value={workspaceSystemId} onChange={(event) => setWorkspaceSystemId(event.target.value)}>
                {workspaceSystemOptions.map((systemId) => (
                  <option key={systemId} value={systemId}>{systemId}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select aria-label="Workspace default campaign visibility" value={workspaceVisibility} onChange={(event) => setWorkspaceVisibility(event.target.value as Campaign["visibility"])}>
                <option value="private">Private</option>
                <option value="invite_only">Invite only</option>
                <option value="public">Public</option>
              </select>
            </label>
            <label>
              <span>Permission template</span>
              <select aria-label="Workspace default permission template" value={workspaceTemplate} onChange={(event) => setWorkspaceTemplate(event.target.value as CampaignPermissionTemplateId)}>
                {campaignPermissionTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Invite role</span>
              <select aria-label="Workspace default invite role" value={workspaceInviteRole} onChange={(event) => setWorkspaceInviteRole(event.target.value as Exclude<UserRole, "owner" | "plugin" | "ai_assistant">)}>
                <option value="player">Player</option>
                <option value="observer">Observer</option>
                <option value="assistant_gm">Assistant GM</option>
                <option value="gm">GM</option>
              </select>
            </label>
            <label>
              <span>Scene name</span>
              <input aria-label="Workspace default scene name" value={workspaceSceneName} onChange={(event) => setWorkspaceSceneName(event.target.value)} />
            </label>
            <label>
              <span>Scene folder</span>
              <input aria-label="Workspace default scene folder" value={workspaceSceneFolder} onChange={(event) => setWorkspaceSceneFolder(event.target.value)} />
            </label>
            <label>
              <span>Scene width</span>
              <input aria-label="Workspace default scene width" type="number" min={1} value={workspaceSceneWidth} onChange={(event) => setWorkspaceSceneWidth(Number(event.target.value))} />
            </label>
            <label>
              <span>Scene height</span>
              <input aria-label="Workspace default scene height" type="number" min={1} value={workspaceSceneHeight} onChange={(event) => setWorkspaceSceneHeight(Number(event.target.value))} />
            </label>
            <label>
              <span>Grid size</span>
              <input aria-label="Workspace default grid size" type="number" min={1} value={workspaceSceneGridSize} onChange={(event) => setWorkspaceSceneGridSize(Number(event.target.value))} />
            </label>
            <label>
              <span>Onboarding title</span>
              <input aria-label="Workspace default onboarding title" value={workspaceOnboardingTitle} onChange={(event) => setWorkspaceOnboardingTitle(event.target.value)} />
            </label>
            <label>
              <span>Onboarding body</span>
              <textarea aria-label="Workspace default onboarding body" value={workspaceOnboardingBody} onChange={(event) => setWorkspaceOnboardingBody(event.target.value)} />
            </label>
          </div>
          <p className="admin-status">{workspaceDefaultsStatus}</p>
          <button className="ghost-button wide" type="submit" disabled={!workspaceName.trim() || !workspaceSystemId.trim() || !workspaceSceneName.trim() || workspaceSceneWidth <= 0 || workspaceSceneHeight <= 0 || workspaceSceneGridSize <= 0}>
            <Check size={14} /> Save workspace defaults
          </button>
        </form>
      </section>

      <section className="admin-section" aria-label="Organization members">
        <div className="operator-heading">
          <div className="section-title">Organization Members</div>
          <strong>{organizationMembers.length} members</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Organization Members" value={formatNumber(organizationMembers.length)} />
          <MetricTile label="Organization Admins" value={formatNumber(organizationAdminCount)} />
          <MetricTile label="Current Role" value={organizationCurrentUser?.role ?? "none"} />
          <MetricTile label="Workspace Owner" value={workspaceDefaults?.ownerUserId === props.currentUserId ? "you" : workspaceDefaults?.ownerUserId ?? "unknown"} />
        </div>
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitOrganizationMember().catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
          }}
        >
          <div className="operator-row">
            <span>Existing user access</span>
            <strong>{workspaceDefaults?.id ?? "organization workspace"}</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>User email</span>
              <input aria-label="Organization member email" type="email" value={organizationMemberEmail} placeholder="player@example.com" onChange={(event) => setOrganizationMemberEmail(event.target.value)} />
            </label>
            <label>
              <span>Role</span>
              <select aria-label="Organization member role" value={organizationMemberRole} onChange={(event) => setOrganizationMemberRole(event.target.value as Exclude<OrganizationMemberRole, "owner">)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <p className="admin-status">{organizationMemberStatus}</p>
          <button className="ghost-button wide" type="submit" disabled={!organizationMemberEmail.trim()}>
            <UserPlus size={14} /> Add organization member
          </button>
        </form>
        {organizationMembers.length === 0 ? (
          <div className="empty-state compact">No organization members loaded.</div>
        ) : (
          organizationMembers.map((member) => (
            <article className="operator-item admin-item" key={member.id}>
              <div className="operator-row">
                <span className={`status-pill ${member.role === "member" ? "running" : "completed"}`}>{member.role}</span>
                <strong>{member.user.id === props.currentUserId ? "current user" : member.user.id}</strong>
              </div>
              <h3>{member.user.displayName}</h3>
              <p>{member.user.email ?? "No email"} - {member.organizationId}</p>
              <div className="admin-meta">
                <span>created {formatDateTime(member.createdAt)}</span>
                <span>updated {formatDateTime(member.updatedAt)}</span>
              </div>
              {member.role === "owner" ? (
                <div className="admin-meta">
                  <span>Owner role is protected</span>
                </div>
              ) : (
                <div className="admin-actions">
                  <select aria-label={`Organization member role for ${member.user.displayName}`} value={member.role} onChange={(event) => {
                    const role = event.target.value as Exclude<OrganizationMemberRole, "owner">;
                    props.onUpdateOrganizationMember(member, role)
                      .then(() => setOrganizationMemberStatus(`Organization member ${member.user.displayName} saved as ${role}`))
                      .catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
                  }}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="ghost-button danger-button" type="button" disabled={member.userId === props.currentUserId} onClick={() => {
                    props.onRemoveOrganizationMember(member)
                      .then(() => setOrganizationMemberStatus(`Organization member ${member.user.displayName} removed`))
                      .catch((error) => setOrganizationMemberStatus(error instanceof Error ? error.message : String(error)));
                  }} title={member.userId === props.currentUserId ? "Current user cannot be removed from this panel" : "Remove organization member"}>
                    <UserX size={14} /> Remove member
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Organization access">
        <div className="operator-heading">
          <div className="section-title">Organization Access</div>
          <strong>{scimMappings.length} mappings</strong>
        </div>
        {scimMappings.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="SCIM Mappings" value={formatNumber(scimMappings.length)} />
            <MetricTile label="Matched Groups" value={formatNumber(matchedScimMappingCount)} />
            <MetricTile label="Pending Groups" value={formatNumber(scimMappings.length - matchedScimMappingCount)} />
            <MetricTile label="Mapped Members" value={formatNumber(scimMappedMemberCount)} />
            <MetricTile label="Mapped Campaigns" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.campaignId)).size)} />
            <MetricTile label="Mapped Roles" value={formatNumber(new Set(scimMappings.map((mapping) => mapping.role)).size)} />
          </div>
        )}
        <form
          className="operator-item admin-item admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            const groupValue = scimGroupValue.trim();
            if (!selectedScimCampaignId || !groupValue) return;
            const input: AdminScimGroupRoleMappingInput = { campaignId: selectedScimCampaignId, role: scimRole };
            input[scimMatchType] = groupValue;
            props.onCreateScimMapping(input).then(() => setScimGroupValue("")).catch(console.error);
          }}
        >
          <div className="operator-row">
            <span>SCIM group mapping</span>
            <strong>{props.campaigns.length} campaigns</strong>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Campaign</span>
              <select aria-label="Mapping campaign" value={selectedScimCampaignId} onChange={(event) => setScimCampaignId(event.target.value)}>
                {props.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Role</span>
              <select aria-label="Mapping role" value={scimRole} onChange={(event) => setScimRole(event.target.value as ScimAssignableRole)}>
                <option value="player">Player</option>
                <option value="observer">Observer</option>
                <option value="assistant_gm">Assistant GM</option>
                <option value="gm">GM</option>
              </select>
            </label>
            <label>
              <span>Match</span>
              <select aria-label="SCIM group match" value={scimMatchType} onChange={(event) => setScimMatchType(event.target.value as "groupDisplayName" | "groupExternalId" | "groupId")}>
                <option value="groupDisplayName">Display name</option>
                <option value="groupExternalId">External id</option>
                <option value="groupId">Group id</option>
              </select>
            </label>
            <label>
              <span>Group</span>
              <input aria-label="SCIM group identifier" value={scimGroupValue} placeholder={scimMatchType === "groupId" ? "scimg_..." : "External group name"} onChange={(event) => setScimGroupValue(event.target.value)} />
            </label>
          </div>
          <button className="ghost-button wide" type="submit" disabled={!selectedScimCampaignId || !scimGroupValue.trim()}>
            <UserPlus size={14} /> Add mapping
          </button>
        </form>
        {!props.admin ? (
          <div className="empty-state compact">No organization data loaded.</div>
        ) : scimMappings.length === 0 ? (
          <div className="empty-state compact">No SCIM group role mappings.</div>
        ) : (
          scimMappings.slice(0, 8).map((mapping) => (
            <article className="operator-item admin-item" key={mapping.id}>
              <div className="operator-row">
                <span className={`status-pill ${mapping.group ? "completed" : "running"}`}>{mapping.group ? "matched" : "pending"}</span>
                <strong>{mapping.role}</strong>
              </div>
              <h3>{scimMappingLabel(mapping)}</h3>
              <p>{campaignName(props.campaigns, mapping.campaignId)} - {mapping.id}</p>
              <div className="admin-meta">
                <span>{mapping.group?.memberUserIds.length ?? 0} SCIM members</span>
                <span>{scimMappingIdentity(mapping)}</span>
                <span>{formatDateTime(mapping.updatedAt)}</span>
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Delete SCIM group role mapping" onClick={() => props.onDeleteScimMapping(mapping).catch(console.error)}>
                  <UserX size={14} /> Delete mapping
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Hosted operations metrics">
        <div className="operator-heading">
          <div className="section-title">Hosted Operations</div>
          <strong>{operationsMetrics?.enabled ? "metrics active" : operationsMetrics ? "metrics disabled" : "not loaded"}</strong>
        </div>
        {!operationsMetrics ? (
          <div className="empty-state compact">No hosted operations metrics loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${operationsMetrics.enabled ? "completed" : "failed"}`}>{operationsMetrics.enabled ? "bounded metrics" : "disabled"}</span>
                <strong>{operationsMetrics.privacy.boundedDimensions && !operationsMetrics.privacy.containsCampaignIds && !operationsMetrics.privacy.containsUserIds && !operationsMetrics.privacy.containsCredentials && !operationsMetrics.privacy.containsPrivateContent ? "privacy-safe dimensions" : "review required"}</strong>
              </div>
              <p>Process-local counters since {formatDateTime(operationsMetrics.startedAt)}. No campaign IDs, user IDs, credentials, or private tabletop content are recorded.</p>
            </div>
            <div className="metric-grid">
              <MetricTile label="HTTP Requests" value={formatNumber(operationsMetrics.http.requests)} />
              <MetricTile label="HTTP 5xx" value={formatNumber(operationsMetrics.http.errorResponses)} />
              <MetricTile label="HTTP Max Latency" value={`${formatNumber(operationsMetrics.http.latencyMs.maxMs)} ms`} />
              <MetricTile label="Stale Conflicts" value={formatNumber(operationsMetrics.http.staleWriteConflicts)} />
              <MetricTile label="Realtime Active" value={formatNumber(operationsMetrics.realtime.activeConnections)} />
              <MetricTile label="Realtime Disconnects" value={formatNumber(operationsMetrics.realtime.disconnections)} />
              <MetricTile label="Realtime Send Failures" value={formatNumber(operationsMetrics.realtime.sendFailures)} />
              <MetricTile label="Realtime Max Heartbeat Gap" value={`${formatNumber(operationsMetrics.realtime.heartbeatGapMs.maxMs)} ms`} />
              <MetricTile label="Write Failures" value={formatNumber(operationsMetrics.persistence.failed)} />
              <MetricTile label="Write Max Latency" value={`${formatNumber(operationsMetrics.persistence.latencyMs.maxMs)} ms`} />
              <MetricTile label="Backup Failures" value={formatNumber(operationsMetrics.recovery.backup.failed)} />
              <MetricTile label="Drill Failures" value={formatNumber(operationsMetrics.recovery.restore_drill.failed)} />
              <MetricTile label="Restore Failures" value={formatNumber(operationsMetrics.recovery.restore.failed)} />
            </div>
            {operationsMetrics.persistence.failed > 0 && <div className="empty-state compact">Durable writes failed. Follow the persistence incident steps in the hosted operations runbook before restarting the API.</div>}
            {(operationsMetrics.recovery.backup.failed > 0 || operationsMetrics.recovery.restore_drill.failed > 0 || operationsMetrics.recovery.restore.failed > 0) && <div className="empty-state compact">Recovery work failed. Run the exact backup and restore drill steps in the hosted operations runbook.</div>}
            {operationsMetrics.realtime.sendFailures > 0 && <div className="empty-state compact">Realtime delivery dropped a connection. Inspect proxy and socket health, then verify reconnect behavior.</div>}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="SQLite storage operations">
        <div className="operator-heading">
          <div className="section-title">SQLite Storage</div>
          <strong>{storageOperations?.provider ?? "not loaded"}</strong>
        </div>
        {!storageOperations ? (
          <div className="empty-state compact">No storage operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${storageOperations.actionRequired ? "failed" : "completed"}`}>{storageOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{storageOperations.supported ? "admin operable" : "unsupported store"}</strong>
              </div>
              <p>{storageOperations.database?.fileName ?? "database unavailable"} - {storageOperations.database?.jsonRecordModel ? "JSON record model" : "store model unknown"}</p>
              <div className="admin-meta">
                <span>{storageOperations.actionReasons.length > 0 ? storageOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{storageOperations.integrity?.ok ? "integrity ok" : storageOperations.integrity ? "integrity failed" : "integrity not checked"}</span>
                <span>{storageOperations.backups?.latest ? `latest backup ${formatDateTime(storageOperations.backups.latest.createdAt)}` : "no backup"}</span>
                <span>{storageOperations.backups?.latest?.recoveryPoint?.paired ? "asset snapshot paired" : "database-only or unpaired recovery point"}</span>
                <span>{storageOperations.scheduledBackups?.enabled ? "scheduled backups enabled" : "scheduled backups off"}</span>
                <span>{storageOperations.indexes?.missing.length ? `missing indexes ${storageOperations.indexes.missing.join(", ")}` : "required indexes present"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Storage Action" value={storageOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Storage Reasons" value={formatNumber(storageOperations.actionReasons.length)} />
              <MetricTile label="Records" value={formatNumber(storageOperations.records?.total)} />
              <MetricTile label="Collections" value={formatNumber(storageOperations.records?.collections.length)} />
              <MetricTile label="Database Size" value={formatStorageBytes(storageOperations.database?.sizeBytes)} />
              <MetricTile label="JSON Records" value={storageOperations.database?.jsonRecordModel ? "yes" : "no"} />
              <MetricTile label="Latest Migration" value={formatNumber(storageOperations.migrations?.latestAppliedVersion)} />
              <MetricTile label="Missing Migrations" value={formatNumber(storageOperations.migrations?.missingVersions.length)} />
              <MetricTile label="Applied Migrations" value={formatNumber(storageOperations.migrations?.applied.length)} />
              <MetricTile label="Integrity" value={storageOperations.integrity?.ok ? "ok" : "check"} />
              <MetricTile label="Indexes Missing" value={formatNumber(storageOperations.indexes?.missing.length)} />
              <MetricTile label="Latest Backup" value={storageOperations.backups?.latest ? formatStorageBytes(storageOperations.backups.latest.sizeBytes) : "missing"} />
              <MetricTile label="Recovery Pair" value={storageOperations.backups?.latest?.recoveryPoint?.paired ? "paired" : "unpaired"} />
              <MetricTile label="Recovery Manifest" value={storageOperations.backups?.latest?.recoveryPoint?.manifestStatus ?? "missing"} />
              <MetricTile label="Asset Inventory" value={formatNumber(storageOperations.backups?.latest?.recoveryPoint?.manifest?.assetInventory.assetCount)} />
              <MetricTile label="Backup Schedule" value={storageOperations.scheduledBackups?.enabled ? "enabled" : "off"} />
              <MetricTile label="Backup Interval" value={storageOperations.scheduledBackups?.intervalSeconds ? formatDurationSeconds(storageOperations.scheduledBackups.intervalSeconds) : "manual"} />
              <MetricTile label="Backup Startup" value={storageOperations.scheduledBackups?.runOnStart ? "yes" : "no"} />
              <MetricTile label="Scheduled Running" value={storageOperations.scheduledBackups?.running ? "yes" : "no"} />
              <MetricTile label="Scheduled Result" value={storageOperations.scheduledBackups?.lastRun?.status ?? "none"} />
              <MetricTile label="Restore Drill" value={storageRestoreDrill?.status ?? "not run"} />
              <MetricTile label="Drill Records" value={formatNumber(storageRestoreDrill?.recordCount)} />
              <MetricTile label="Drill Campaigns" value={formatNumber(storageRestoreDrill?.campaignCount)} />
              <MetricTile label="Backup Directory" value={storageOperations.backups?.directoryName ?? "n/a"} />
            </div>
            <p className="admin-status">{storageBackupStatus}</p>
            {storageOperations.records?.collections.slice(0, 6).map((collection) => (
              <div className="operator-row tool-call-row" key={`storage-collection-${collection.collection}`}>
                <span>{collection.collection}</span>
                <strong>{formatNumber(collection.count)} records</strong>
              </div>
            ))}
            {storageOperations.migrations?.missingVersions.slice(0, 4).map((version) => (
              <div className="operator-row tool-call-row" key={`storage-missing-migration-${version}`}>
                <span>Missing migration</span>
                <strong>v{formatNumber(version)}</strong>
              </div>
            ))}
            {storageOperations.scheduledBackups?.lastRun && (
              <div className="operator-row tool-call-row">
                <span>Scheduled backup {storageOperations.scheduledBackups.lastRun.trigger}</span>
                <strong>{storageOperations.scheduledBackups.lastRun.status} - {storageOperations.scheduledBackups.lastRun.error ?? storageOperations.scheduledBackups.lastRun.fileName ?? "no file"}</strong>
              </div>
            )}
            {storageRestoreDrill && (
              <div className="operator-row tool-call-row">
                <span>{storageRestoreDrill.status === "passed" ? "Restore drill passed" : "Restore drill failed"}</span>
                <strong>{storageRestoreDrill.error ?? `${formatNumber(storageRestoreDrill.recordCount)} records - ${storageRestoreDrill.backup?.fileName ?? "latest backup"}`}</strong>
              </div>
            )}
            {storageOperations.backups?.latest?.recoveryPoint?.manifest?.assetSnapshot && (
              <div className="operator-row tool-call-row">
                <span>Paired asset snapshot</span>
                <strong>{storageOperations.backups.latest.recoveryPoint.manifest.assetSnapshot.provider}:{storageOperations.backups.latest.recoveryPoint.manifest.assetSnapshot.snapshotId} at {formatDateTime(storageOperations.backups.latest.recoveryPoint.manifest.assetSnapshot.createdAt)}</strong>
              </div>
            )}
            <div className="operator-grid" aria-label="Asset snapshot recovery pairing">
              <label>
                Asset snapshot ID
                <input value={assetSnapshotId} maxLength={200} placeholder="Provider snapshot or version ID" onChange={(event) => setAssetSnapshotId(event.target.value)} />
              </label>
              <label>
                Asset snapshot created at
                <input value={assetSnapshotCreatedAt} maxLength={40} placeholder="2026-07-13T18:30:00.000Z" onChange={(event) => setAssetSnapshotCreatedAt(event.target.value)} />
              </label>
              <p className="account-summary">Create the asset snapshot with the active {assetStorage?.runtime.provider ?? "asset"} provider first, then enter its exact non-secret identity. The API records and validates the pair; it never creates provider snapshots.</p>
            </div>
            {storageOperations.backups?.latest && (
              <div className="danger-zone" aria-label="Destructive storage restore">
                <p className="account-summary">Restores the live SQLite store from the latest verified backup. Paired recovery points also require the exact recorded asset snapshot identity. Restore that provider snapshot separately, then type the backup filename exactly.</p>
                <input aria-label="Confirm storage restore backup filename" value={storageRestoreConfirm} placeholder={storageOperations.backups.latest.fileName} onChange={(event) => setStorageRestoreConfirm(event.target.value)} />
                <button className="ghost-button wide" type="button" onClick={() => restoreStorageBackup(storageOperations.backups!.latest!.fileName).catch(console.error)} disabled={!storageOperations.supported || storageRestoreConfirm !== storageOperations.backups.latest.fileName}>
                  <RotateCcw size={14} /> Restore Backup
                </button>
              </div>
            )}
            <div className="admin-actions">
              <button className="ghost-button" title="Create a timestamped SQLite backup and pair it when an operator-created asset snapshot identity is supplied" onClick={() => createStorageBackup().catch(console.error)} disabled={!storageOperations.supported}>
                <Download size={14} /> Create Backup
              </button>
              <button className="ghost-button" title="Copy the latest SQLite backup and verify it can be opened" onClick={() => runStorageRestoreDrill().catch(console.error)} disabled={!storageOperations.supported || !storageOperations.backups?.latest}>
                <RefreshCw size={14} /> Run Restore Drill
              </button>
              <button className="ghost-button" title="Queue a storage backup worker job" onClick={() => queueStorageJob("storage.backup").catch(console.error)} disabled={!storageOperations.supported}>
                <Timer size={14} /> Queue Backup Job
              </button>
              <button className="ghost-button" title="Queue a storage restore-drill worker job" onClick={() => queueStorageJob("storage.restoreDrill").catch(console.error)} disabled={!storageOperations.supported}>
                <Timer size={14} /> Queue Drill Job
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Job ledger">
        <div className="operator-heading">
          <div className="section-title">Job Ledger</div>
          <strong>{jobLedgerSummary}</strong>
        </div>
        <div className="metric-grid">
          <MetricTile label="Total Jobs" value={formatNumber(jobOperations?.totals.totalCount ?? jobs.length)} />
          <MetricTile label="Queued Jobs" value={formatNumber(queuedJobCount)} />
          <MetricTile label="Running Jobs" value={formatNumber(runningJobCount)} />
          <MetricTile label="Failed Jobs" value={formatNumber(failedJobCount)} />
          <MetricTile label="Cancelled Jobs" value={formatNumber(cancelledJobCount)} />
          <MetricTile label="Retryable Jobs" value={formatNumber(retryableJobCount)} />
          <MetricTile label="Retry Exhausted" value={formatNumber(jobOperations?.totals.exhaustedCount)} />
          <MetricTile label="Stale Queue" value={formatNumber(jobOperations?.queue.staleQueuedCount)} />
          <MetricTile label="Queue Age" value={jobOperations ? formatDurationSeconds(jobOperations.queue.maxQueueAgeSeconds) : "n/a"} />
          <MetricTile label="Expired Leases" value={formatNumber(jobOperations?.leases.expiredCount)} />
          <MetricTile label="Stale Heartbeats" value={formatNumber(jobOperations?.leases.staleHeartbeatCount)} />
          <MetricTile label="Workers" value={formatNumber(jobOperations?.leases.leasedWorkerCount)} />
          <MetricTile label="Job Remediations" value={formatNumber(jobOperations?.remediationQueue.length)} />
          <MetricTile label="Newest Job" value={newestJobUpdatedAt ? formatDateTime(newestJobUpdatedAt) : "none"} />
        </div>
        <p className="admin-status">{jobLedgerStatus}</p>
        {jobOperations?.remediationQueue.slice(0, 4).map((item) => (
          <div className="operator-row tool-call-row" key={`job-remediation-${item.code}`}>
            <span>{item.severity}: {item.code}</span>
            <strong>{formatNumber(item.affectedCount)} affected - {item.action}</strong>
          </div>
        ))}
        {jobOperations?.leases.workers.slice(0, 4).map((worker) => (
          <div className="operator-row tool-call-row" key={`job-worker-${worker.workerId}`}>
            <span>{worker.workerId}</span>
            <strong>{formatNumber(worker.runningCount)} running - {formatNumber(worker.expiredLeaseCount)} expired - heartbeat {worker.lastHeartbeatAt ? formatDateTime(worker.lastHeartbeatAt) : "missing"}</strong>
          </div>
        ))}
        <div className="operator-row tool-call-row" aria-label="Job alert delivery">
          <span>Alert delivery</span>
          <strong>{jobOperations ? (jobOperations.actionRequired ? `ready to send - ${jobOperations.actionReasons.join(", ") || "operator review"}` : "dry-run available - no delivery needed") : "not loaded"}; configure OTTE_JOB_ALERT_WEBHOOK_URL to deliver</strong>
        </div>
        <div className="admin-actions">
          <button className="ghost-button" title="Dry-run the job operations alert payload" onClick={() => deliverJobAlert(true).catch(console.error)} disabled={!jobOperations}>
            <Activity size={14} /> Dry Run Alert
          </button>
          <button className="ghost-button" title="Deliver the current job operations alert to the configured webhook" onClick={() => deliverJobAlert(false).catch(console.error)} disabled={!jobOperations || !jobOperations.actionRequired}>
            <Send size={14} /> Send Alert
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state compact">No server-admin jobs have been queued recently.</div>
        ) : (
          jobs.slice(0, 8).map((job) => (
            <article className="operator-item admin-item" key={job.id}>
              <div className="operator-row">
                <span className={jobStatusClass(job.status)}>{job.status}</span>
                <strong>{job.type}</strong>
              </div>
              <p>{job.progress?.message ?? job.error ?? `queued ${formatDateTime(job.queuedAt)}`}</p>
              <div className="admin-meta">
                <span>{formatNumber(job.attempts)} / {formatNumber(job.maxAttempts)} attempts</span>
                {job.progress?.percent !== undefined && <span>{formatNumber(job.progress.percent)}% complete</span>}
                {job.startedAt && <span>started {formatDateTime(job.startedAt)}</span>}
                {job.completedAt && <span>completed {formatDateTime(job.completedAt)}</span>}
                {job.logs.at(-1) && <span>last log {job.logs.at(-1)?.level}: {job.logs.at(-1)?.message}</span>}
              </div>
              <div className="admin-actions">
                <button className="ghost-button" title="Retry failed or cancelled job" onClick={() => retryAdminJob(job).catch(console.error)} disabled={(job.status !== "failed" && job.status !== "cancelled") || job.attempts >= job.maxAttempts}>
                  <RotateCcw size={14} /> Retry
                </button>
                <button className="ghost-button" title="Cancel queued or running job" onClick={() => cancelAdminJob(job).catch(console.error)} disabled={job.status !== "queued" && job.status !== "running"}>
                  <X size={14} /> Cancel
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Asset storage operations">
        <div className="operator-heading">
          <div className="section-title">Asset Storage</div>
          <strong>{assetStorage?.runtime.provider ?? "not loaded"}</strong>
        </div>
        {!assetStorage ? (
          <div className="empty-state compact">No asset storage data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetStorage.operations.actionRequired ? "failed" : "completed"}`}>{assetStorage.operations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{assetStorage.runtime.delivery.mode}</strong>
              </div>
              <p>{assetStorage.runtime.delivery.cdnConfigured ? "CDN configured" : "signed blob delivery"} - {assetStorage.runtime.trustScanner.externalConfigured ? "external scanner configured" : "built-in scanner only"}</p>
              <div className="admin-meta">
                <span>{assetStorage.operations.actionReasons.length > 0 ? assetStorage.operations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetStorage.runtime.delivery.purgeWebhookConfigured ? "purge webhook configured" : "purge webhook missing"}</span>
                <span>{assetStorage.runtime.cleanup.enabled ? "cleanup scheduled" : "cleanup manual"}</span>
                {assetStorage.runtime.invalidConfig.length > 0 && <span>invalid config {assetStorage.runtime.invalidConfig.join(", ")}</span>}
                {assetStorage.runtime.invalidUrlConfig.length > 0 && <span>invalid URLs {assetStorage.runtime.invalidUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.insecureUrlConfig.length > 0 && <span>insecure production URLs {assetStorage.runtime.insecureUrlConfig.join(", ")}</span>}
                {assetStorage.runtime.missingTokenConfig.length > 0 && <span>missing webhook tokens {assetStorage.runtime.missingTokenConfig.join(", ")}</span>}
                {assetStorage.runtime.cleanup.riskyConfig.length > 0 && <span>risky cleanup config {assetStorage.runtime.cleanup.riskyConfig.join(", ")}</span>}
                {assetStorage.runtime.quota.quotaPolicyMissingInProduction && <span>production quota policy missing</span>}
                {assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction && <span>production retention policy missing</span>}
                <span>{assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "purge token configured" : "purge token missing"}</span>
                <span>{assetStorage.runtime.trustScanner.tokenConfigured ? "scanner token configured" : "scanner token missing"}</span>
                {assetStorage.runtime.s3 && <span>S3 {assetStorage.runtime.s3.bucketConfigured ? "bucket configured" : "bucket missing"} / {assetStorage.runtime.s3.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "endpoint valid" : "endpoint invalid") : "AWS endpoint default"}</span>}
                {assetStorage.runtime.s3?.endpointInsecureInProduction && <span>S3 endpoint insecure in production</span>}
                {assetStorage.runtime.s3?.partialExplicitCredentials && <span>S3 credentials partial</span>}
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets" value={formatNumber(assetStorage.assetCount)} />
              <MetricTile label="Active" value={formatNumber(assetStorage.activeAssetCount)} />
              <MetricTile label="Asset Action" value={assetStorage.operations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Asset Reasons" value={formatNumber(assetStorage.operations.actionReasons.length)} />
              <MetricTile label="Asset Remediations" value={formatNumber(assetStorage.operations.remediationQueue.length)} />
              <MetricTile label="Asset Errors" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Asset Warnings" value={formatNumber(assetStorage.operations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Archived" value={formatNumber(assetStorage.lifecycleCounts.archived)} />
              <MetricTile label="Deleted" value={formatNumber(assetStorage.lifecycleCounts.deleted)} />
              <MetricTile label="Used" value={formatStorageBytes(assetStorage.usedBytes)} />
              <MetricTile label="Stored Bytes" value={formatStorageBytes(assetStorage.allBytes)} />
              <MetricTile label="Storage Provider" value={assetStorage.runtime.provider} />
              <MetricTile label="Storage Providers" value={formatNumber(Object.keys(assetStorage.providerCounts).length)} />
              <MetricTile label="S3 Active" value={assetStorage.runtime.s3?.active ? "yes" : "no"} />
              <MetricTile label="S3 Bucket" value={assetStorage.runtime.s3?.bucketConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Endpoint" value={assetStorage.runtime.s3?.endpointConfigured ? (assetStorage.runtime.s3.endpointValid ? "valid" : "invalid") : "default"} />
              <MetricTile label="S3 Region" value={assetStorage.runtime.s3?.regionConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Path Style" value={assetStorage.runtime.s3?.forcePathStyle ? "yes" : "no"} />
              <MetricTile label="S3 Explicit Creds" value={assetStorage.runtime.s3?.explicitCredentialsConfigured ? "yes" : "no"} />
              <MetricTile label="S3 Credentials" value={assetStorage.runtime.s3?.partialExplicitCredentials ? "partial" : "ready"} />
              <MetricTile label="Campaigns" value={formatNumber(assetStorage.campaigns.length)} />
              <MetricTile label="Asset Campaign Providers" value={formatNumber(assetCampaignProviderSpread)} />
              <MetricTile label="Asset Campaign Lifecycles" value={formatNumber(assetCampaignLifecycleSpread)} />
              <MetricTile label="Largest Asset Samples" value={formatNumber(assetCampaignLargestSampleCount)} />
              <MetricTile label="Quota Enabled" value={assetStorage.runtime.quota.enabled ? "yes" : "no"} />
              <MetricTile label="Quota Risk" value={formatNumber(assetStorage.operations.quota.atRiskCampaigns.length)} />
              <MetricTile label="Quota Risk Bytes" value={formatStorageBytes(assetStorage.operations.quota.atRiskCampaigns.reduce((total, campaign) => total + campaign.usedBytes, 0))} />
              <MetricTile label="Quota Limit" value={assetStorage.runtime.quota.quotaBytes === undefined ? "none" : formatStorageBytes(assetStorage.runtime.quota.quotaBytes)} />
              <MetricTile label="Quota Policy" value={assetStorage.runtime.quota.quotaPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Retention Enabled" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "no" : "yes"} />
              <MetricTile label="Retention Days" value={assetStorage.runtime.lifecycle.retentionDays === undefined ? "none" : formatNumber(assetStorage.runtime.lifecycle.retentionDays)} />
              <MetricTile label="Retention Policy" value={assetStorage.runtime.lifecycle.retentionPolicyMissingInProduction ? "missing" : "ready"} />
              <MetricTile label="Migration Target" value={assetStorage.runtime.migrationTargetProvider} />
              <MetricTile label="Migration" value={formatNumber(assetStorage.operations.migrationBacklog.assetCount)} />
              <MetricTile label="Migration Samples" value={formatNumber(assetStorage.operations.migrationBacklog.assets.length)} />
              <MetricTile label="Migration Providers" value={formatNumber(Object.keys(assetStorage.operations.migrationBacklog.providerCounts).length)} />
              <MetricTile label="Migration Bytes" value={formatStorageBytes(assetStorage.operations.migrationBacklog.bytes)} />
              <MetricTile label="Cleanup" value={formatNumber(assetStorage.operations.cleanupBacklog.assetCount)} />
              <MetricTile label="Cleanup Samples" value={formatNumber(assetStorage.operations.cleanupBacklog.assets.length)} />
              <MetricTile label="Cleanup Providers" value={formatNumber(new Set(assetStorage.operations.cleanupBacklog.assets.map((asset) => asset.provider)).size)} />
              <MetricTile label="Cleanup Bytes" value={formatStorageBytes(assetStorage.operations.cleanupBacklog.bytes)} />
              <MetricTile label="Oldest Cleanup" value={formatDurationSeconds(assetStorage.operations.cleanupBacklog.oldestEligibleAgeSeconds)} />
              <MetricTile label="Deleted Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.deletedAssetCount)} />
              <MetricTile label="Expired Backlog" value={formatNumber(assetStorage.operations.cleanupBacklog.expiredAssetCount)} />
              <MetricTile label="Cleanup Enabled" value={assetStorage.runtime.cleanup.enabled ? "yes" : "no"} />
              <MetricTile label="Cleanup Running" value={assetStorage.runtime.cleanup.running ? "yes" : "no"} />
              <MetricTile label="Cleanup Interval" value={assetStorage.runtime.cleanup.enabled ? formatDurationSeconds(assetStorage.runtime.cleanup.intervalSeconds) : "manual"} />
              <MetricTile label="Cleanup Grace" value={assetStorage.runtime.cleanup.graceDays === undefined ? "none" : `${formatNumber(assetStorage.runtime.cleanup.graceDays)} d`} />
              <MetricTile label="Cleanup Dry Run" value={assetStorage.runtime.cleanup.dryRun ? "yes" : "no"} />
              <MetricTile label="Cleanup Startup" value={assetStorage.runtime.cleanup.runOnStart ? "yes" : "no"} />
              <MetricTile label="Cleanup Targets" value={`${assetStorage.runtime.cleanup.includeDeleted ? "D" : "-"}${assetStorage.runtime.cleanup.includeExpired ? "E" : "-"}`} />
              <MetricTile label="Cleanup Risk Config" value={formatNumber(assetStorage.runtime.cleanup.riskyConfig.length)} />
              <MetricTile label="Missing Refs" value={formatNumber(assetStorage.operations.hygiene.missingStorageRefs)} />
              <MetricTile label="Unscanned" value={formatNumber(assetStorage.operations.hygiene.unscannedAssets)} />
              <MetricTile label="Trust Warnings" value={formatNumber(assetStorage.operations.hygiene.trustWarningAssets)} />
              <MetricTile label="Trust Warning Samples" value={formatNumber(assetStorage.operations.hygiene.trustWarningSamples.length)} />
              <MetricTile label="Built-in Scanner" value={assetStorage.runtime.trustScanner.builtinEnabled ? "yes" : "no"} />
              <MetricTile label="External Scanner" value={assetStorage.runtime.trustScanner.externalConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Token" value={assetStorage.runtime.trustScanner.tokenConfigured ? "yes" : "no"} />
              <MetricTile label="Scanner Fail Closed" value={assetStorage.runtime.trustScanner.failClosed ? "yes" : "no"} />
              <MetricTile label="Scanner Timeout" value={formatDuration(assetStorage.runtime.trustScanner.timeoutMs)} />
              <MetricTile label="Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.totalRunCount)} />
              <MetricTile label="Recent Maintenance Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.recentRuns.length)} />
              <MetricTile label="Latest Maintenance" value={assetStorage.operations.maintenanceOperations.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.latestRunAt) : "none"} />
              <MetricTile label="Maintenance Dry Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.dryRunCount)} />
              <MetricTile label="Maintenance Mutations" value={formatNumber(assetStorage.operations.maintenanceOperations.mutationRunCount)} />
              <MetricTile label="Maintenance Changed" value={formatNumber(assetStorage.operations.maintenanceOperations.changedRunCount)} />
              <MetricTile label="Maintenance Failed" value={formatNumber(assetStorage.operations.maintenanceOperations.failedRunCount)} />
              <MetricTile label="Maintenance Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.assetCount + assetStorage.operations.maintenanceOperations.cleanup.assetCount + assetStorage.operations.maintenanceOperations.quarantine.assetCount)} />
              <MetricTile label="Maintenance Matched" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.matched + assetStorage.operations.maintenanceOperations.cleanup.matched + assetStorage.operations.maintenanceOperations.quarantine.matched)} />
              <MetricTile label="Maintenance Planned" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.planned + assetStorage.operations.maintenanceOperations.cleanup.planned + assetStorage.operations.maintenanceOperations.quarantine.planned)} />
              <MetricTile label="Maintenance Skipped" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.skipped + assetStorage.operations.maintenanceOperations.cleanup.skipped + assetStorage.operations.maintenanceOperations.quarantine.skipped)} />
              <MetricTile label="Maintenance Failed Assets" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.failed + assetStorage.operations.maintenanceOperations.cleanup.failed + assetStorage.operations.maintenanceOperations.quarantine.failed)} />
              <MetricTile label="Migration Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.migration.runCount)} />
              <MetricTile label="Latest Migration" value={assetStorage.operations.maintenanceOperations.migration.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.migration.latestRunAt) : "none"} />
              <MetricTile label="Cleanup Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.cleanup.runCount)} />
              <MetricTile label="Latest Cleanup" value={assetStorage.operations.maintenanceOperations.cleanup.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.cleanup.latestRunAt) : "none"} />
              <MetricTile label="Quarantine Runs" value={formatNumber(assetStorage.operations.maintenanceOperations.quarantine.runCount)} />
              <MetricTile label="Latest Quarantine" value={assetStorage.operations.maintenanceOperations.quarantine.latestRunAt ? formatDateTime(assetStorage.operations.maintenanceOperations.quarantine.latestRunAt) : "none"} />
              <MetricTile label="Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.length)} />
              <MetricTile label="Delivery Error Warnings" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "error").length)} />
              <MetricTile label="Delivery Warning Notices" value={formatNumber(assetStorage.operations.delivery.warnings.filter((warning) => warning.severity === "warning").length)} />
              <MetricTile label="Managed Assets" value={formatNumber(assetStorage.operations.delivery.posture.activeManagedAssetCount)} />
              <MetricTile label="Deliverable" value={formatNumber(assetStorage.operations.delivery.posture.deliverableActiveAssetCount)} />
              <MetricTile label="Deliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.deliverableActiveBytes)} />
              <MetricTile label="Delivery Coverage" value={formatPercent(assetStorage.operations.delivery.posture.deliverableCoverageRate)} />
              <MetricTile label="Deliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.deliverableSamples.length)} />
              <MetricTile label="Undeliverable" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableActiveAssetCount)} />
              <MetricTile label="Undeliverable Samples" value={formatNumber(assetStorage.operations.delivery.posture.undeliverableSamples.length)} />
              <MetricTile label="Undeliverable Bytes" value={formatStorageBytes(assetStorage.operations.delivery.posture.undeliverableActiveBytes)} />
              <MetricTile label="Expired Active" value={formatNumber(assetStorage.operations.delivery.posture.expiredActiveAssetCount)} />
              <MetricTile label="Delivery Mode" value={assetStorage.runtime.delivery.mode} />
              <MetricTile label="CDN Configured" value={assetStorage.runtime.delivery.cdnConfigured ? "yes" : "no"} />
              <MetricTile label="CDN Eligible" value={formatNumber(assetStorage.operations.delivery.posture.cdnEligibleAssetCount)} />
              <MetricTile label="Signed Eligible" value={formatNumber(assetStorage.operations.delivery.posture.signedUrlEligibleAssetCount)} />
              <MetricTile label="Signing Required" value={assetStorage.runtime.delivery.signingSecretRequired ? "yes" : "no"} />
              <MetricTile label="Signing Secret" value={assetStorage.runtime.delivery.signingSecretConfigured ? "yes" : "no"} />
              <MetricTile label="Public URL" value={assetStorage.runtime.delivery.publicUrlConfigured ? "yes" : "no"} />
              <MetricTile label="Default URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.defaultTtlSeconds)} />
              <MetricTile label="Max URL TTL" value={formatDurationSeconds(assetStorage.runtime.delivery.maxTtlSeconds)} />
              <MetricTile label="Purge Webhook" value={assetStorage.runtime.delivery.purgeWebhookConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Token" value={assetStorage.runtime.delivery.purgeWebhookTokenConfigured ? "yes" : "no"} />
              <MetricTile label="Purge Timeout" value={formatDuration(assetStorage.runtime.delivery.purgeTimeoutMs)} />
              <MetricTile label="Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Events" value={formatNumber(assetStorage.operations.delivery.runtime.recent.length)} />
              <MetricTile label="Assets Served" value={formatNumber(assetStorage.operations.delivery.runtime.servedCount)} />
              <MetricTile label="Unavailable Assets" value={formatNumber(assetStorage.operations.delivery.runtime.unavailableCount)} />
              <MetricTile label="Unavailable Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.unavailableCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Recent Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.recentFailures.length)} />
              <MetricTile label="Failure Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.runtime.recentFailures.map((event) => event.campaignId ?? "unknown")).size)} />
              <MetricTile label="Delivery Statuses" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.statusCounts).length)} />
              <MetricTile label="Access Modes" value={formatNumber(Object.keys(assetStorage.operations.delivery.runtime.accessModeCounts).length)} />
              <MetricTile label="Signed Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.signed)} />
              <MetricTile label="Session Delivery" value={formatNumber(assetStorage.operations.delivery.runtime.accessModeCounts.session)} />
              <MetricTile label="Delivery Failures" value={formatNumber(assetStorage.operations.delivery.runtime.failureCount)} />
              <MetricTile label="Delivery Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.failureCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Delivery Denied" value={formatNumber(assetStorage.operations.delivery.runtime.deniedCount)} />
              <MetricTile label="Delivery Denied Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.deniedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Missing Bytes" value={formatNumber(assetStorage.operations.delivery.runtime.missingBytesCount)} />
              <MetricTile label="Signing Failures" value={formatNumber(assetStorage.operations.delivery.runtime.signingFailedCount)} />
              <MetricTile label="Signing Failure Rate" value={formatPercent(assetStorage.operations.delivery.runtime.totalCount === 0 ? 0 : assetStorage.operations.delivery.runtime.signingFailedCount / assetStorage.operations.delivery.runtime.totalCount)} />
              <MetricTile label="Served Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.servedBytes)} />
              <MetricTile label="Failed Bytes" value={formatStorageBytes(assetStorage.operations.delivery.runtime.failedBytes)} />
              <MetricTile label="CDN Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Recent Purges" value={formatNumber(assetStorage.operations.delivery.purgeOperations.recent.length)} />
              <MetricTile label="Recent Purge Campaigns" value={formatNumber(new Set(assetStorage.operations.delivery.purgeOperations.recent.map((purge) => purge.campaignId ?? "unknown")).size)} />
              <MetricTile label="Purged" value={formatNumber(assetStorage.operations.delivery.purgeOperations.purgedCount)} />
              <MetricTile label="Purge Success" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 1 : assetStorage.operations.delivery.purgeOperations.purgedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Failures" value={formatNumber(assetStorage.operations.delivery.purgeOperations.failedCount)} />
              <MetricTile label="Purge Failure Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.failedCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
              <MetricTile label="Purge Not Configured" value={formatNumber(assetStorage.operations.delivery.purgeOperations.notConfiguredCount)} />
              <MetricTile label="Purge Config Gap Rate" value={formatPercent(assetStorage.operations.delivery.purgeOperations.totalCount === 0 ? 0 : assetStorage.operations.delivery.purgeOperations.notConfiguredCount / assetStorage.operations.delivery.purgeOperations.totalCount)} />
            </div>
            {assetStorage.operations.quota.enabled && (
              <p className="admin-status">{assetStorage.operations.quota.atRiskCampaigns.length} quota-risk campaigns out of {formatStorageBytes(assetStorage.operations.quota.quotaBytes)}</p>
            )}
            {assetStorage.operations.delivery.warnings.slice(0, 3).map((warning) => (
              <div className="operator-row tool-call-row" key={warning.code}>
                <span>{warning.message}</span>
                <strong>{warning.severity}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.posture.undeliverableSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`undeliverable-asset-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.runtime.recentFailures.slice(0, 3).map((event) => (
              <div className="operator-row tool-call-row" key={`asset-delivery-failure-${event.id}`}>
                <span>{event.assetId ?? "unknown asset"}</span>
                <strong>{event.status} - {event.accessMode} - {event.reason ?? formatDateTime(event.createdAt)}</strong>
              </div>
            ))}
            {assetStorage.operations.hygiene.trustWarningSamples.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`asset-trust-warning-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.highestSeverity} - {asset.findingCodes.join(", ") || "trust finding"} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.maintenanceOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`asset-maintenance-${run.id}`}>
                <span>{run.operation}{run.dryRun ? " dry run" : ""}</span>
                <strong>
                  {formatNumber(run.assetCount)} assets - {run.failed > 0 ? `${formatNumber(run.failed)} failed` : run.changed ? "changed" : "no change"} - {formatDateTime(run.createdAt)}
                </strong>
              </div>
            ))}
            {assetStorage.operations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected{item.bytes !== undefined ? ` - ${formatStorageBytes(item.bytes)}` : ""}</strong>
                </div>
                <h3>{item.code}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {assetStorage.operations.quota.atRiskCampaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={campaign.campaignId}>
                <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                <strong>{formatPercent(campaign.usageRatio)} used - {formatStorageBytes(campaign.remainingBytes)} left</strong>
              </div>
            ))}
            {assetStorage.campaigns.slice(0, 3).map((campaign) => {
              const largestAsset = campaign.largestAssets[0];
              return (
                <div className="operator-row tool-call-row" key={`asset-campaign-${campaign.campaignId}`}>
                  <span>{campaignName(props.campaigns, campaign.campaignId)}</span>
                  <strong>
                    {formatStorageBytes(campaign.usedBytes)} used across {formatNumber(campaign.assetCount)} assets
                    {largestAsset ? ` - largest ${largestAsset.name} ${formatStorageBytes(largestAsset.sizeBytes)}` : ""}
                  </strong>
                </div>
              );
            })}
            {assetStorage.operations.cleanupBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`cleanup-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.reason} - {formatStorageBytes(asset.sizeBytes)} - eligible {formatDurationSeconds(asset.eligibleAgeSeconds)}</strong>
              </div>
            ))}
            {assetStorage.operations.migrationBacklog.assets.slice(0, 3).map((asset) => (
              <div className="operator-row tool-call-row" key={`migration-${asset.assetId}`}>
                <span>{asset.name}</span>
                <strong>{asset.fromProvider} to {asset.toProvider} - {formatStorageBytes(asset.sizeBytes)}</strong>
              </div>
            ))}
            {assetStorage.operations.delivery.purgeOperations.recent.slice(0, 3).map((purge) => (
              <div className="operator-row tool-call-row" key={`asset-purge-${purge.id}`}>
                <span>{purge.assetId ?? "unknown asset"}</span>
                <strong>{purge.status} - {purge.error ?? purge.reason ?? formatDateTime(purge.createdAt)}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Migrate uploaded asset bytes to the active storage provider" onClick={() => props.onMigrateStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.migrationBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Migrate assets
              </button>
              <button className="ghost-button" title="Delete stored bytes for eligible deleted or expired assets" onClick={() => props.onCleanupStoredAssetBytes().catch(console.error)} disabled={assetStorage.operations.cleanupBacklog.assetCount === 0}>
                <RefreshCw size={14} /> Run cleanup
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Asset integrity operations">
        <div className="operator-heading">
          <div className="section-title">Asset Integrity</div>
          <strong>{assetIntegrity?.provider ?? "not loaded"}</strong>
        </div>
        {!assetIntegrity ? (
          <div className="empty-state compact">No asset integrity data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${assetIntegrity.actionRequired > 0 ? "failed" : "completed"}`}>{assetIntegrity.actionRequired > 0 ? "action required" : "healthy"}</span>
                <strong>{formatNumber(assetIntegrity.actionRequired)} actionable</strong>
              </div>
              <p>{formatNumber(assetIntegrity.verified)} verified - {formatNumber(assetIntegrity.assetCount)} assets scanned</p>
              <div className="admin-meta">
                <span>{assetIntegrity.actionReasons.length > 0 ? assetIntegrity.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{assetIntegrity.healthy ? "byte checks healthy" : "byte checks need attention"}</span>
                <span>{formatNumber(assetIntegrity.skipped)} skipped</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Assets Scanned" value={formatNumber(assetIntegrity.assetCount)} />
              <MetricTile label="Integrity Provider" value={assetIntegrity.provider} />
              <MetricTile label="Actionable" value={formatNumber(assetIntegrity.actionRequired)} />
              <MetricTile label="Integrity Healthy" value={assetIntegrity.healthy ? "yes" : "no"} />
              <MetricTile label="Integrity Reasons" value={formatNumber(assetIntegrity.actionReasons.length)} />
              <MetricTile label="Integrity Remediations" value={formatNumber(assetIntegrity.remediationQueue.length)} />
              <MetricTile label="Integrity Errors" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Integrity Warnings" value={formatNumber(assetIntegrity.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Integrity Statuses" value={formatNumber(new Set(assetIntegrity.results.map((asset) => asset.status)).size)} />
              <MetricTile label="Integrity Result Rows" value={formatNumber(assetIntegrity.results.filter((asset) => asset.status !== "verified").length)} />
              <MetricTile label="Verified Coverage" value={formatPercent(assetIntegrity.assetCount === 0 ? 1 : assetIntegrity.verified / assetIntegrity.assetCount)} />
              <MetricTile label="Missing" value={formatNumber(assetIntegrity.missing)} />
              <MetricTile label="Mismatched" value={formatNumber(assetIntegrity.mismatched)} />
              <MetricTile label="Cleanup Eligible" value={formatNumber(assetIntegrity.cleanupEligible)} />
              <MetricTile label="Failed Scans" value={formatNumber(assetIntegrity.failed)} />
              <MetricTile label="Verified" value={formatNumber(assetIntegrity.verified)} />
              <MetricTile label="Skipped" value={formatNumber(assetIntegrity.skipped)} />
            </div>
            {assetIntegrity.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`asset-integrity-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Archive active assets whose bytes are missing or mismatched" onClick={() => props.onQuarantineAssetIntegrityFailures().catch(console.error)} disabled={assetIntegrity.missing + assetIntegrity.mismatched === 0}>
                <RefreshCw size={14} /> Archive broken assets
              </button>
            </div>
            {assetIntegrity.results.filter((asset) => asset.status !== "verified").slice(0, 4).map((asset) => (
              <article className="operator-item admin-item" key={asset.assetId}>
                <div className="operator-row">
                  <span className={`status-pill ${asset.status === "skipped" ? "running" : "failed"}`}>{asset.status}</span>
                  <strong>{asset.provider}</strong>
                </div>
                <h3>{asset.name}</h3>
                <p>{asset.reason ?? asset.assetId}</p>
                {(asset.expectedSizeBytes !== undefined || asset.actualSizeBytes !== undefined) && (
                  <div className="admin-meta">
                    <span>expected {formatStorageBytes(asset.expectedSizeBytes)}</span>
                    <span>actual {formatStorageBytes(asset.actualSizeBytes)}</span>
                  </div>
                )}
                <div className="admin-actions">
                  <button className="ghost-button" title="Purge this asset from the configured CDN cache" onClick={() => props.onPurgeAssetCdnCache(asset.assetId, asset.name, asset.updatedAt).catch(console.error)} disabled={!assetStorage?.runtime.delivery.purgeWebhookConfigured}>
                    <RefreshCw size={14} /> Purge CDN
                  </button>
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rendering operations">
        <div className="operator-heading">
          <div className="section-title">Rendering Operations</div>
          <strong>{renderingOperations ? `${renderingOperations.totals.sceneCount} scenes` : "not loaded"}</strong>
        </div>
        {!renderingOperations ? (
          <div className="empty-state compact">No rendering operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.actionRequired ? "failed" : "completed"}`}>{renderingOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(renderingOperations.totals.issueCount)} issues</strong>
              </div>
              <p>{formatNumber(renderingOperations.totals.maxPolygonVertexCount)} / {formatNumber(renderingOperations.budget.maxPolygonVertexBudget)} max polygon vertices - {formatNumber(renderingOperations.totals.terrainWallCount)} terrain walls - {formatNumber(renderingOperations.totals.degenerateWallCount)} degenerate walls</p>
              <div className="admin-meta">
                <span>{renderingOperations.actionReasons.length > 0 ? renderingOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.error)} errors</span>
                <span>{formatNumber(renderingOperations.issueSeverityCounts.warning)} warnings</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Scenes" value={formatNumber(renderingOperations.totals.sceneCount)} />
              <MetricTile label="Render Campaigns" value={formatNumber(renderingOperations.totals.campaignCount)} />
              <MetricTile label="Render Issues" value={formatNumber(renderingOperations.totals.issueCount)} />
              <MetricTile label="Render Action" value={renderingOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rendering Reasons" value={formatNumber(renderingOperations.actionReasons.length)} />
              <MetricTile label="Rendering Remediations" value={formatNumber(renderingOperations.remediationQueue.length)} />
              <MetricTile label="Rendering Errors" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="Rendering Warnings" value={formatNumber(renderingOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Fog" value={formatNumber(renderingOperations.totals.fogRegionCount)} />
              <MetricTile label="Walls" value={formatNumber(renderingOperations.totals.wallCount)} />
              <MetricTile label="Terrain Walls" value={formatNumber(renderingOperations.totals.terrainWallCount)} />
              <MetricTile label="Degenerate Walls" value={formatNumber(renderingOperations.totals.degenerateWallCount)} />
              <MetricTile label="Lights" value={formatNumber(renderingOperations.totals.lightCount)} />
              <MetricTile label="Vision" value={formatNumber(renderingOperations.totals.tokenVisionSourceCount)} />
              <MetricTile label="Render Errors" value={formatNumber(renderingOperations.issueSeverityCounts.error)} />
              <MetricTile label="Render Warnings" value={formatNumber(renderingOperations.issueSeverityCounts.warning)} />
              <MetricTile label="Render Error Rate" value={formatPercent(renderingOperations.totals.issueCount === 0 ? 0 : (renderingOperations.issueSeverityCounts.error ?? 0) / renderingOperations.totals.issueCount)} />
              <MetricTile label="Top Issue Samples" value={formatNumber(renderingOperations.topIssues.length)} />
              <MetricTile label="Issue Codes" value={formatNumber(Object.keys(renderingOperations.issueCodeCounts).length)} />
              <MetricTile label="Vertices" value={formatNumber(renderingOperations.totals.polygonVertexCount)} />
              <MetricTile label="Vertex Budget Limit" value={formatNumber(renderingOperations.budget.totalPolygonVertexBudget)} />
              <MetricTile label="Max Vertex Usage" value={`${formatPercent(renderingOperations.budget.maxPolygonUsageRatio)} used`} />
              <MetricTile label="Vertex Budget" value={`${formatPercent(renderingOperations.budget.totalPolygonUsageRatio)} used`} />
              <MetricTile label="Max Budget Exceeded" value={renderingOperations.budget.maxPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Total Budget Exceeded" value={renderingOperations.budget.totalPolygonExceeded ? "yes" : "no"} />
              <MetricTile label="Scenes Flagged" value={formatNumber(renderingOperations.totals.sceneActionRequiredCount)} />
              <MetricTile label="Flagged Scene Samples" value={formatNumber(renderingOperations.scenesRequiringAction.length)} />
              <MetricTile label="Max Budget" value={formatNumber(renderingOperations.budget.scenesExceedingMaxPolygonBudget)} />
              <MetricTile label="Total Budget" value={formatNumber(renderingOperations.budget.scenesExceedingTotalPolygonBudget)} />
              <MetricTile label="Feature Coverage Scenes" value={formatNumber(renderingOperations.featureCoverage.sceneCount)} />
              <MetricTile label="Feature Scenes" value={formatNumber(renderingOperations.featureCoverage.productionFeatureSceneCount)} />
              <MetricTile label="Featureless Scenes" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.productionFeatureSceneCount))} />
              <MetricTile label="Required Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.length)} />
              <MetricTile label="Present Features" value={formatNumber(renderingOperations.featureCoverage.requiredFeatures.filter((feature) => feature.present).length)} />
              <MetricTile label="Missing Features" value={formatNumber(renderingOperations.featureCoverage.missingRequiredFeatureCodes.length)} />
              <MetricTile label="Feature Samples" value={formatNumber(renderingFeatureSampleCount)} />
              <MetricTile label="Coverage Samples" value={formatNumber(renderingCoverageSampleCount)} />
              <MetricTile label="Feature Checklist" value={renderingOperations.featureCoverage.complete ? "complete" : "incomplete"} />
              <MetricTile label="Polygon Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithPolygonFogCount)} />
              <MetricTile label="Polygon Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithPolygonFogCount))} />
              <MetricTile label="Polygon Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} />
              <MetricTile label="Smooth Fog" value={formatNumber(renderingOperations.featureCoverage.scenesWithSmoothFogCount)} />
              <MetricTile label="Smooth Fog Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithSmoothFogCount))} />
              <MetricTile label="Smooth Fog Coverage" value={formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} />
              <MetricTile label="Colored Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithColoredLightsCount)} />
              <MetricTile label="Colored Light Coverage" value={formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} />
              <MetricTile label="Dimmed Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDimmedLightsCount)} />
              <MetricTile label="Dimmed Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} />
              <MetricTile label="Dual-Zone Lights" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneLightsCount)} />
              <MetricTile label="Dual-Light Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithDualZoneLightsCount))} />
              <MetricTile label="Dual-Light Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} />
              <MetricTile label="Token Vision Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTokenVisionCount)} />
              <MetricTile label="Token Vision Gaps" value={formatNumber(Math.max(0, renderingOperations.featureCoverage.sceneCount - renderingOperations.featureCoverage.scenesWithTokenVisionCount))} />
              <MetricTile label="Token Vision Coverage" value={formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} />
              <MetricTile label="Dual-Zone Vision" value={formatNumber(renderingOperations.featureCoverage.scenesWithDualZoneTokenVisionCount)} />
              <MetricTile label="Dual-Zone Coverage" value={formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} />
              <MetricTile label="Terrain Scenes" value={formatNumber(renderingOperations.featureCoverage.scenesWithTerrainWallsCount)} />
              <MetricTile label="Terrain Coverage" value={formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} />
              <MetricTile label="Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.totalCount)} />
              <MetricTile label="Recent Rendering Changes" value={formatNumber(renderingOperations.authoringOperations.recent.length)} />
              <MetricTile label="Changed Scenes" value={formatNumber(renderingOperations.authoringOperations.sceneCount)} />
              <MetricTile label="Changed Scene Samples" value={formatNumber(renderingOperations.authoringOperations.scenes.length)} />
              <MetricTile label="Changed Campaigns" value={formatNumber(new Set(renderingOperations.authoringOperations.scenes.map((scene) => scene.campaignId ?? "unknown")).size)} />
              <MetricTile label="Authoring Actions" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actionCounts).length)} />
              <MetricTile label="Authoring Targets" value={formatNumber(Object.keys(renderingOperations.authoringOperations.targetTypeCounts).length)} />
              <MetricTile label="Rendering Authors" value={formatNumber(Object.keys(renderingOperations.authoringOperations.actorUserCounts).length)} />
              <MetricTile label="Fog Changes" value={formatNumber(renderingOperations.authoringOperations.fogOperationCount)} />
              <MetricTile label="Wall Changes" value={formatNumber(renderingOperations.authoringOperations.wallOperationCount)} />
              <MetricTile label="Light Changes" value={formatNumber(renderingOperations.authoringOperations.lightOperationCount)} />
              <MetricTile label="Failed Authoring Action" value={renderingOperations.failedAuthoringOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} />
              <MetricTile label="Recent Failed Changes" value={formatNumber(renderingOperations.failedAuthoringOperations.recentFailures.length)} />
              <MetricTile label="Failed Change Scenes" value={formatNumber(new Set(renderingOperations.failedAuthoringOperations.recentFailures.map((failure) => failure.sceneId ?? "unknown")).size)} />
              <MetricTile label="Failure Actions" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byAction).length)} />
              <MetricTile label="Failure Reasons" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byReason).length)} />
              <MetricTile label="Failure Targets" value={formatNumber(Object.keys(renderingOperations.failedAuthoringOperations.byTargetType).length)} />
              <MetricTile label="Stale Issue Scenes" value={formatNumber(renderingOperations.staleIssueOperations.sceneCount)} />
              <MetricTile label="Stale Issue Samples" value={formatNumber(renderingOperations.staleIssueOperations.scenes.length)} />
              <MetricTile label="Stale Issues" value={formatNumber(renderingOperations.staleIssueOperations.issueCount)} />
              <MetricTile label="Stale Issue Action" value={renderingOperations.staleIssueOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Stale Issue Reasons" value={formatNumber(new Set(renderingOperations.staleIssueOperations.scenes.flatMap((scene) => scene.actionReasons)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${renderingOperations.featureCoverage.complete ? "completed" : "running"}`}>feature coverage</span>
                <strong>{formatPercent(renderingOperations.featureCoverage.tokenVisionCoverageRate)} token vision</strong>
              </div>
              <p>{formatPercent(renderingOperations.featureCoverage.polygonFogCoverageRate)} polygon fog - {formatPercent(renderingOperations.featureCoverage.smoothFogCoverageRate)} smooth fog - {formatPercent(renderingOperations.featureCoverage.coloredLightCoverageRate)} colored lights - {formatPercent(renderingOperations.featureCoverage.dimmedLightCoverageRate)} dimmed lights - {formatPercent(renderingOperations.featureCoverage.dualZoneLightCoverageRate)} dual-zone lights - {formatPercent(renderingOperations.featureCoverage.dualZoneTokenVisionCoverageRate)} dual-zone vision - {formatPercent(renderingOperations.featureCoverage.terrainWallCoverageRate)} terrain walls</p>
              <div className="admin-meta">
                {renderingOperations.featureCoverage.missingRequiredFeatureCodes.length > 0 ? <span>missing {renderingOperations.featureCoverage.missingRequiredFeatureCodes.join(", ")}</span> : <span>all production features evidenced</span>}
              </div>
            </article>
            {renderingOperations.featureCoverage.requiredFeatures.map((feature) => {
              const sample = feature.samples[0];
              return (
                <article className="operator-item admin-item" key={`rendering-feature-${feature.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${feature.present ? "completed" : "running"}`}>{feature.present ? "present" : "missing"}</span>
                    <strong>{feature.label}</strong>
                  </div>
                  <p>{formatNumber(feature.sceneCount)} scenes - {formatPercent(feature.coverageRate)} coverage{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{feature.code}</span>
                    <span>{sample ? `${formatNumber(sample.polygonFogCount)} polygon fog` : "no scene sample"}</span>
                    <span>{sample ? `${formatNumber(sample.smoothFogCount)} smooth fog` : "no smooth sample"}</span>
                    <span>{sample ? `${formatNumber(sample.terrainWallCount)} terrain walls` : "no terrain sample"}</span>
                    <span>{sample ? `${formatNumber(sample.coloredLightCount)} colored lights` : "no colored sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dimmedLightCount)} dimmed lights` : "no dimmed sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneLightCount)} dual-zone lights` : "no dual-zone sample"}</span>
                    <span>{sample ? `${formatNumber(sample.dualZoneTokenVisionCount)} dual-zone vision` : "no dual-zone vision sample"}</span>
                    <span>{sample ? `${formatNumber(sample.tokenVisionSourceCount)} token vision` : "no vision sample"}</span>
                  </div>
                </article>
              );
            })}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className="status-pill completed">authoring activity</span>
                <strong>{formatNumber(renderingOperations.authoringOperations.sceneCount)} scenes changed</strong>
              </div>
              <p>{formatNumber(renderingOperations.authoringOperations.fogOperationCount)} fog edits - {formatNumber(renderingOperations.authoringOperations.wallOperationCount)} wall edits - {formatNumber(renderingOperations.authoringOperations.lightOperationCount)} light edits</p>
              <div className="admin-meta">
                {renderingOperations.authoringOperations.recent.slice(0, 4).map((event) => (
                  <span key={event.id}>{event.action} {event.sceneName ?? event.sceneId ?? "unknown scene"}</span>
                ))}
                {renderingOperations.authoringOperations.recent.length === 0 ? <span>no recent rendering edits</span> : null}
              </div>
            </article>
            {renderingOperations.failedAuthoringOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">failed authoring</span>
                  <strong>{formatNumber(renderingOperations.failedAuthoringOperations.failureCount)} failed</strong>
                </div>
                <p>{Object.entries(renderingOperations.failedAuthoringOperations.byReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {renderingOperations.failedAuthoringOperations.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`rendering-authoring-failure-${failure.id}`}>
                <span>{failure.attemptedAction}</span>
                <strong>{failure.sceneName ?? failure.sceneId ?? "unknown scene"} - {failure.reason}</strong>
              </div>
            ))}
            {Object.entries(renderingOperations.issueCodeCounts)
              .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
              .slice(0, 4)
              .map(([code, count]) => (
                <div className="operator-row tool-call-row" key={code}>
                  <span>{code}</span>
                  <strong>{formatNumber(count)} issues</strong>
                </div>
              ))}
            {renderingOperations.staleIssueOperations.scenes.slice(0, 3).map((scene) => (
              <div className="operator-row tool-call-row" key={`stale-rendering-scene-${scene.sceneId}`}>
                <span>{scene.sceneName}</span>
                <strong>{formatNumber(scene.issueCount)} issues - no recent rendering edits</strong>
              </div>
            ))}
            {renderingOperations.remediationQueue.slice(0, 4).map((item) => {
              const sample = item.sampleScenes[0];
              return (
                <article className="operator-item admin-item" key={`rendering-remediation-${item.code}`}>
                  <div className="operator-row">
                    <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                    <strong>{formatNumber(item.issueCount)} issues</strong>
                  </div>
                  <h3>{item.action}</h3>
                  <p>{formatNumber(item.affectedSceneCount)} scenes affected{sample ? ` - ${sample.sceneName} in ${sample.campaignName}` : ""}</p>
                  <div className="admin-meta">
                    <span>{item.code}</span>
                    <span>{sample?.topTarget ? `${sample.topTarget.targetType}:${sample.topTarget.targetId}` : "no sample target"}</span>
                  </div>
                </article>
              );
            })}
            {renderingOperations.topIssues.slice(0, 4).map((issue) => (
              <div className="operator-row tool-call-row" key={`rendering-issue-${issue.sceneId}-${issue.targetType}-${issue.targetId}-${issue.code}`}>
                <span>{issue.message}</span>
                <strong>{issue.sceneName ?? issue.sceneId ?? "scene"} - {issue.targetType}:{issue.targetId}</strong>
              </div>
            ))}
            {renderingOperations.scenesRequiringAction.slice(0, 3).map((scene) => {
              const firstIssue = scene.topIssues[0];
              return (
                <article className="operator-item admin-item" key={scene.sceneId}>
                  <div className="operator-row">
                    <span>{scene.sceneName}</span>
                    <strong>{formatNumber(scene.counts.issueCount)} issues</strong>
                  </div>
                  <p>{scene.campaignName} - {scene.actionReasons.join(", ")} - {formatPercent(scene.budget.totalPolygonUsageRatio)} vertex budget</p>
                  <div className="admin-meta">
                    <span>{formatNumber(scene.counts.fogRegionCount)} fog regions</span>
                    <span>{formatNumber(scene.counts.lightCount)} lights</span>
                    <span>{formatNumber(scene.counts.polygonVertexCount)} total vertices</span>
                    <span>{formatNumber(scene.counts.maxPolygonVertexCount)} max polygon vertices</span>
                    <span>{formatNumber(scene.counts.terrainWallCount)} terrain walls</span>
                    <span>{formatNumber(scene.counts.degenerateWallCount)} degenerate walls</span>
                    <span>{scene.topIssueCodes.length > 0 ? scene.topIssueCodes.map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") : "no issue codes"}</span>
                    <span>{firstIssue ? `${firstIssue.targetType}:${firstIssue.targetId}` : "no issue samples"}</span>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Rules operations">
        <div className="operator-heading">
          <div className="section-title">Rules Operations</div>
          <strong>{systemOperations?.productionReadiness.primarySystemId ?? "not loaded"}</strong>
        </div>
        {!systemOperations ? (
          <div className="empty-state compact">No rules operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${systemOperations.actionRequired ? "failed" : "completed"}`}>{systemOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{formatNumber(systemOperations.totals.installedSystemCount)} systems</strong>
              </div>
              <p>{formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} production ready - {formatNumber(systemOperations.productionReadiness.demoSystemCount)} demo runtimes</p>
              <div className="admin-meta">
                <span>{systemOperations.actionReasons.length > 0 ? systemOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} need depth</span>
                <span>{formatNumber(systemOperations.totals.issueCount)} content issues</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Installed Systems" value={formatNumber(systemOperations.totals.installedSystemCount)} />
              <MetricTile label="System Rows" value={formatNumber(systemOperations.systems.length)} />
              <MetricTile label="Production Systems" value={formatNumber(systemOperations.productionReadiness.productionReadySystemCount)} />
              <MetricTile label="Production System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.productionReadySystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Systems" value={formatNumber(systemOperations.productionReadiness.demoSystemCount)} />
              <MetricTile label="Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.demoSystemCount / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Rules Action" value={systemOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Rules Reasons" value={formatNumber(systemOperations.actionReasons.length)} />
              <MetricTile label="Rules Remediations" value={formatNumber(systemOperations.remediationQueue.length)} />
              <MetricTile label="Rules Critical" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "critical").length)} />
              <MetricTile label="Rules Warnings" value={formatNumber(systemOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Systems Need Depth" value={formatNumber(systemOperations.productionReadiness.systemsNeedingProductionDepth.length)} />
              <MetricTile label="Depth Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.productionReadiness.systemsNeedingProductionDepth.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Active Systems" value={formatNumber(Object.keys(systemOperations.activeSystemCounts).length)} />
              <MetricTile label="Systems With Actors" value={formatNumber(systemOperations.totals.systemsWithActors)} />
              <MetricTile label="Actor System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithActors / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Actor Systems" value={formatNumber(Object.keys(systemOperations.actorSystemCounts).length)} />
              <MetricTile label="Item Systems" value={formatNumber(Object.keys(systemOperations.itemSystemCounts).length)} />
              <MetricTile label="Campaigns" value={formatNumber(systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Actors" value={formatNumber(systemOperations.totals.actorCount)} />
              <MetricTile label="Items" value={formatNumber(systemOperations.totals.itemCount)} />
              <MetricTile label="Non-primary Campaigns" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Non-primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActiveCampaignCount / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Non-primary Actors" value={formatNumber(systemOperations.productionReadiness.nonPrimaryActorCount)} />
              <MetricTile label="Non-primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryActorCount / systemOperations.totals.actorCount)} />
              <MetricTile label="Non-primary Items" value={formatNumber(systemOperations.productionReadiness.nonPrimaryItemCount)} />
              <MetricTile label="Non-primary Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : systemOperations.productionReadiness.nonPrimaryItemCount / systemOperations.totals.itemCount)} />
              <MetricTile label="Rules Activity" value={formatNumber(systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rules Activity" value={formatNumber(systemOperations.activityOperations.recentActivity.length)} />
              <MetricTile label="Recent Rules Activity Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : systemOperations.activityOperations.recentActivity.length / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Recent Rule Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Rule Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Rules Rolls" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.roll"])} />
              <MetricTile label="Rules Roll Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Rests" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.rest"])} />
              <MetricTile label="Rules Rest Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Rules Advances" value={formatNumber(systemOperations.activityOperations.actionCounts["system.actor.advance"])} />
              <MetricTile label="Rules Advance Rate" value={formatPercent(systemOperations.activityOperations.activityCount === 0 ? 0 : (systemOperations.activityOperations.actionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.activityCount)} />
              <MetricTile label="Active Rule Systems" value={formatNumber(systemOperations.activityOperations.systemsWithRecentActivity.length)} />
              <MetricTile label="Active Rule System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.activityOperations.systemsWithRecentActivity.length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Demo Activity" value={formatNumber(systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Activity" value={formatNumber(systemOperations.activityOperations.recentNonPrimaryActivity.length)} />
              <MetricTile label="Recent Demo Activity Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : systemOperations.activityOperations.recentNonPrimaryActivity.length / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Recent Demo Campaigns" value={formatNumber(new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size)} />
              <MetricTile label="Recent Demo Campaign Rate" value={formatPercent(systemOperations.productionReadiness.nonPrimaryActiveCampaignCount === 0 ? 0 : new Set(systemOperations.activityOperations.recentNonPrimaryActivity.map((activity) => activity.campaignId ?? "unknown")).size / systemOperations.productionReadiness.nonPrimaryActiveCampaignCount)} />
              <MetricTile label="Demo Rolls" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"])} />
              <MetricTile label="Demo Roll Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.roll"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Rests" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"])} />
              <MetricTile label="Demo Rest Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.rest"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Demo Advances" value={formatNumber(systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"])} />
              <MetricTile label="Demo Advance Rate" value={formatPercent(systemOperations.activityOperations.nonPrimaryActivityCount === 0 ? 0 : (systemOperations.activityOperations.nonPrimaryActionCounts["system.actor.advance"] ?? 0) / systemOperations.activityOperations.nonPrimaryActivityCount)} />
              <MetricTile label="Active Demo Systems" value={formatNumber(Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length)} />
              <MetricTile label="Active Demo System Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : Object.keys(systemOperations.activityOperations.nonPrimarySystemCounts).length / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Systems With Issues" value={formatNumber(systemOperations.totals.systemsWithContentIssues)} />
              <MetricTile label="Content Issue Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : systemOperations.totals.systemsWithContentIssues / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Readiness Action" value={systemOperations.productionReadiness.actionRequired ? "yes" : "no"} />
              <MetricTile label="Production Gaps" value={formatNumber(productionGapTotal)} />
              <MetricTile label="Production Gap Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : productionGapTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Gap Categories" value={formatNumber(systemOperations.productionGapCounts.length)} />
              <MetricTile label="Promotion Blockers" value={formatNumber(promotionBlockerTotal)} />
              <MetricTile label="Promotion Blocker Rate" value={formatPercent(systemOperations.totals.installedSystemCount === 0 ? 0 : promotionBlockerTotal / systemOperations.totals.installedSystemCount)} />
              <MetricTile label="Critical Blockers" value={formatNumber(criticalPromotionBlockerTotal)} />
              <MetricTile label="Critical Blocker Rate" value={formatPercent(promotionBlockerTotal === 0 ? 0 : criticalPromotionBlockerTotal / promotionBlockerTotal)} />
              <MetricTile label="Primary Capability" value={formatPercent(primaryRulesSystem?.productionCapability.coverageRate ?? 0)} />
              <MetricTile label="Primary Campaigns" value={formatNumber(primaryRulesSystem?.usage.activeCampaignCount)} />
              <MetricTile label="Primary Campaign Rate" value={formatPercent(systemOperations.totals.activeCampaignCount === 0 ? 0 : (primaryRulesSystem?.usage.activeCampaignCount ?? 0) / systemOperations.totals.activeCampaignCount)} />
              <MetricTile label="Primary Actors" value={formatNumber(primaryRulesSystem?.usage.actorCount)} />
              <MetricTile label="Primary Actor Rate" value={formatPercent(systemOperations.totals.actorCount === 0 ? 0 : (primaryRulesSystem?.usage.actorCount ?? 0) / systemOperations.totals.actorCount)} />
              <MetricTile label="Primary System Items" value={formatNumber(primaryRulesSystem?.usage.itemCount)} />
              <MetricTile label="Primary System Item Rate" value={formatPercent(systemOperations.totals.itemCount === 0 ? 0 : (primaryRulesSystem?.usage.itemCount ?? 0) / systemOperations.totals.itemCount)} />
              <MetricTile label="Primary Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.supportedCapabilityCount)} />
              <MetricTile label="Primary Capability Total" value={formatNumber(primaryRulesSystem?.productionCapability.capabilityCount)} />
              <MetricTile label="Missing Capabilities" value={formatNumber(primaryRulesSystem?.productionCapability.missingCapabilities.length)} />
              <MetricTile label="Missing Capability Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilityCount ?? 0) === 0 ? 0 : primaryRulesSystem!.productionCapability.missingCapabilities.length / primaryRulesSystem!.productionCapability.capabilityCount)} />
              <MetricTile label="Primary Issues" value={formatNumber(primaryRulesSystem?.issues.length)} />
              <MetricTile label="Primary Issue Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.issues.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Gaps" value={formatNumber(primaryRulesSystem?.productionGaps.length)} />
              <MetricTile label="Primary Gap Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : (primaryRulesSystem?.productionGaps.length ?? 0) / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Capability Rows" value={formatNumber(primaryRulesSystem?.productionCapability.capabilities.length)} />
              <MetricTile label="Capability Evidence" value={formatNumber(primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Capability Evidence Rate" value={formatPercent((primaryRulesSystem?.productionCapability.capabilities.length ?? 0) === 0 ? 0 : primaryRulesCapabilityEvidenceCount / (primaryRulesSystem?.productionCapability.capabilities.length ?? 0))} />
              <MetricTile label="Primary Compendium" value={formatNumber(primaryRulesSystem?.coverage.compendiumEntryCount)} />
              <MetricTile label="Primary Templates" value={formatNumber(primaryRulesSystem?.coverage.characterTemplateCount)} />
              <MetricTile label="Primary Template Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.characterTemplateCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Conditions" value={formatNumber(primaryRulesSystem?.coverage.conditionEntryCount)} />
              <MetricTile label="Primary Condition Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.conditionEntryCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Actor Types" value={formatNumber(Object.keys(primaryRulesSystem?.usage.actorTypeCounts ?? {}).length)} />
              <MetricTile label="Primary Client Entry" value={primaryRulesSystem?.manifest.hasClientEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Server Entry" value={primaryRulesSystem?.manifest.hasServerEntrypoint ? "yes" : "no"} />
              <MetricTile label="Primary Actor Schema" value={primaryRulesSystem?.manifest.hasActorSchema ? "yes" : "no"} />
              <MetricTile label="Primary Item Schema" value={primaryRulesSystem?.manifest.hasItemSchema ? "yes" : "no"} />
              <MetricTile label="Primary Manifest Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.manifest.hasClientEntrypoint, primaryRulesSystem.manifest.hasServerEntrypoint, primaryRulesSystem.manifest.hasActorSchema, primaryRulesSystem.manifest.hasItemSchema].filter(Boolean).length / 4 : 0)} />
              <MetricTile label="Primary Permissions" value={formatNumber(primaryRulesSystem?.manifest.permissionCount)} />
              <MetricTile label="Primary Spells" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.spell)} />
              <MetricTile label="Primary Spell Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.spell ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Items" value={formatNumber(primaryRulesSystem?.coverage.compendiumTypeCounts.item)} />
              <MetricTile label="Primary Item Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.compendiumTypeCounts.item ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Primary Threats" value={formatNumber(primaryRulesSystem?.coverage.encounterThreatCount)} />
              <MetricTile label="Primary Threat Rate" value={formatPercent((primaryRulesSystem?.coverage.compendiumEntryCount ?? 0) === 0 ? 0 : (primaryRulesSystem?.coverage.encounterThreatCount ?? 0) / (primaryRulesSystem?.coverage.compendiumEntryCount ?? 0))} />
              <MetricTile label="Compendium Support" value={primaryRulesSystem?.coverage.supportsCompendium ? "yes" : "no"} />
              <MetricTile label="Origin Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.origins.count)} />
              <MetricTile label="Origin Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.origins.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Monster Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count)} />
              <MetricTile label="Monster Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.monsterCreation.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Purchase Evidence" value={formatNumber(primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count)} />
              <MetricTile label="Purchase Evidence Rate" value={formatPercent(primaryRulesCapabilityEvidenceCount === 0 ? 0 : (primaryRulesSystem?.coverage.capabilityEvidence.equipmentPurchase.count ?? 0) / primaryRulesCapabilityEvidenceCount)} />
              <MetricTile label="Primary Import" value={primaryRulesSystem?.coverage.supportsCharacterImport ? "yes" : "no"} />
              <MetricTile label="Primary Advancement" value={primaryRulesSystem?.coverage.supportsAdvancement ? "yes" : "no"} />
              <MetricTile label="Primary Rest" value={primaryRulesSystem?.coverage.supportsRest ? "yes" : "no"} />
              <MetricTile label="Primary Origins" value={primaryRulesSystem?.coverage.supportsOrigins ? "yes" : "no"} />
              <MetricTile label="Primary Monsters" value={primaryRulesSystem?.coverage.supportsMonsterCreation ? "yes" : "no"} />
              <MetricTile label="Primary Purchase" value={primaryRulesSystem?.coverage.supportsEquipmentPurchase ? "yes" : "no"} />
              <MetricTile label="Primary Encounters" value={primaryRulesSystem?.coverage.supportsEncounterPlanning ? "yes" : "no"} />
              <MetricTile label="Primary Automation Coverage" value={formatPercent(primaryRulesSystem ? [primaryRulesSystem.coverage.supportsCharacterImport, primaryRulesSystem.coverage.supportsAdvancement, primaryRulesSystem.coverage.supportsRest, primaryRulesSystem.coverage.supportsOrigins, primaryRulesSystem.coverage.supportsMonsterCreation, primaryRulesSystem.coverage.supportsEquipmentPurchase, primaryRulesSystem.coverage.supportsEncounterPlanning].filter(Boolean).length / 7 : 0)} />
            </div>
            {systemOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`rules-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "critical" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} systems</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
                <div className="admin-meta">
                  <span>{item.message}</span>
                  <span>{item.samples.map((system) => system.name).join(", ")}</span>
                </div>
              </article>
            ))}
            {systemOperations.productionGapCounts.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.productionGapCounts.slice(0, 4).map((gap) => (
                  <article className="operator-item admin-item" key={gap.code}>
                    <div className="operator-row">
                      <span className="status-pill failed">production gap</span>
                      <strong>{formatNumber(gap.count)} systems</strong>
                    </div>
                    <h3>{gap.code}</h3>
                    <p>{gap.message}</p>
                    <div className="admin-meta">
                      <span>{gap.severity}</span>
                      <span>{gap.remediation}</span>
                      <span>{gap.systems.map((system) => system.name).join(", ")}</span>
                      {gap.systems.map((system) => (
                        <span key={system.id}>
                          {system.id}: {formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.promotionBlockers.length > 0 && (
              <div className="operator-list compact-list">
                {systemOperations.promotionBlockers.slice(0, 3).map((system) => (
                  <article className="operator-item admin-item" key={`rules-promotion-${system.systemId}`}>
                    <div className="operator-row">
                      <span className={`status-pill ${system.criticalBlockerCount > 0 ? "failed" : "running"}`}>promotion blockers</span>
                      <strong>{formatNumber(system.blockerCount)} blockers</strong>
                    </div>
                    <h3>{system.name}</h3>
                    <p>{system.blockers[0]?.message ?? "Runtime needs production hardening before promotion."}</p>
                    <div className="admin-meta">
                      <span>{system.systemId}</span>
                      <span>{formatNumber(system.activeCampaignCount)} campaigns, {formatNumber(system.actorCount)} actors, {formatNumber(system.itemCount)} items</span>
                      {system.blockers.slice(0, 3).map((blocker) => (
                        <span key={`${system.systemId}-${blocker.code}`}>{blocker.code}: {blocker.remediation}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {systemOperations.activityOperations.recentNonPrimaryActivity.slice(0, 3).map((activity) => (
              <div className="operator-row tool-call-row" key={`rules-activity-${activity.auditLogId}`}>
                <span>{activity.systemName ?? activity.systemId ?? "Unknown system"}</span>
                <strong>{activity.action.replace("system.actor.", "")} - {activity.label ?? activity.restType ?? activity.optionId ?? activity.actorId ?? "activity"} - {formatDateTime(activity.createdAt)}</strong>
              </div>
            ))}
            {systemsNeedingProductionDepth.length > 0 && (
              <div className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">needs production depth</span>
                  <strong>{formatNumber(systemsNeedingProductionDepth.length)} runtimes</strong>
                </div>
                <p>{systemsNeedingProductionDepth.map((system) => system.name).join(", ")}</p>
                <div className="admin-meta">
                  {systemsNeedingProductionDepth.map((system) => (
                    <span key={system.id}>
                      {system.id}: {formatNumber(system.usage.activeCampaignCount)} campaigns, {formatNumber(system.usage.actorCount)} actors, {formatNumber(system.usage.itemCount)} items
                    </span>
                  ))}
                </div>
              </div>
            )}
            {systemOperations.systems.slice(0, 4).map((system) => (
              <article className="operator-item admin-item" key={system.id}>
                <div className="operator-row">
                  <span className={`status-pill ${system.readiness.actionRequired || system.issues.length > 0 ? "failed" : "completed"}`}>{system.readiness.tier}</span>
                  <strong>{formatNumber(system.productionGaps.length)} production gaps</strong>
                </div>
                <h3>{system.name}</h3>
                <p>{formatNumber(system.coverage.characterTemplateCount)} templates - {formatNumber(system.coverage.conditionEntryCount)} conditions - {formatNumber(system.coverage.encounterThreatCount)} threats - {formatPercent(system.productionCapability.coverageRate)} capability</p>
                <div className="admin-meta">
                  <span>{formatNumber(system.usage.activeCampaignCount)} campaigns</span>
                  <span>{formatNumber(system.usage.actorCount)} actors</span>
                  <span>{formatNumber(system.productionCapability.supportedCapabilityCount)} / {formatNumber(system.productionCapability.capabilityCount)} capabilities</span>
                  <span>{system.issues.length > 0 ? system.issues.join(", ") : "manifest/content clear"}</span>
                  <span>{system.productionGaps.length > 0 ? formatAdminList(system.productionGaps, 3) : "production posture clear"}</span>
                  <span>{system.productionCapability.missingCapabilities.length > 0 ? `missing ${formatAdminList(system.productionCapability.missingCapabilities.map((capability) => capability.label), 3)}` : "capability matrix complete"}</span>
                  {system.coverage.capabilityEvidence.origins.samples.length > 0 && <span>origins {formatAdminList(system.coverage.capabilityEvidence.origins.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.monsterCreation.samples.length > 0 && <span>monsters {formatAdminList(system.coverage.capabilityEvidence.monsterCreation.samples, 2)}</span>}
                  {system.coverage.capabilityEvidence.equipmentPurchase.samples.length > 0 && <span>purchase {formatAdminList(system.coverage.capabilityEvidence.equipmentPurchase.samples, 2)}</span>}
                </div>
              </article>
            ))}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Admin AI operations">
        <div className="operator-heading">
          <div className="section-title">AI Operations</div>
          <strong>{aiOperations?.provider.id ?? "not loaded"}</strong>
        </div>
        {!aiOperations ? (
          <div className="empty-state compact">No AI operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.actionRequired ? "failed" : "completed"}`}>{aiOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{aiOperations.runtime.selectedProvider}</strong>
              </div>
              <p>{aiOperations.provider.label} - active {aiOperations.runtime.activeProvider} - retry budget {aiOperations.runtime.retryAttempts}</p>
              <div className="admin-meta">
                <span>{aiOperations.actionReasons.length > 0 ? aiOperations.actionReasons.join(", ") : "no action reasons"}</span>
                {aiOperations.runtime.codex && <span>{aiOperations.runtime.codex.transport} Codex transport</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.apiKeyConfigured ? "OpenAI key configured" : "OpenAI key missing"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.timeoutMs > 0 ? `timeout ${aiOperations.runtime.openai.timeoutMs}ms` : "timeout disabled"}</span>}
                {aiOperations.runtime.openai && <span>{aiOperations.runtime.openai.baseUrlValid ? `${aiOperations.runtime.openai.baseUrlInsecureInProduction ? "insecure production base" : "base"} ${aiOperations.runtime.openai.baseUrl}` : `invalid base ${aiOperations.runtime.openai.baseUrlIssue ?? aiOperations.runtime.openai.baseUrl}`}</span>}
                <span>{aiOperations.runtime.costRatesComplete ? (aiOperations.runtime.costRatesConfigured.inputTokens ? "cost rates configured" : "cost rates not configured") : "cost rates partial"}</span>
                {aiOperations.runtime.invalidCostConfig.length > 0 && <span>invalid cost config {aiOperations.runtime.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidProviderThresholdConfig.length > 0 && <span>invalid provider thresholds {aiOperations.runtime.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtime.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime controls {aiOperations.runtime.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtime.costBudgetUsd !== undefined ? `budget ${formatCost(aiOperations.runtime.costBudgetUsd)}` : "cost budget not configured"}</span>
              </div>
              <div className="button-row">
                <button className="ghost-button" title="Mark stale running AI threads as failed" onClick={() => props.onFailStaleAiThreads().catch(console.error)} disabled={aiOperations.risk.staleRunningThreadCount === 0}>
                  <RefreshCw size={14} /> Fail stale threads
                </button>
                <button className="ghost-button" title="Mark stale started AI tool calls as failed" onClick={() => props.onFailStaleAiToolCalls().catch(console.error)} disabled={aiOperations.risk.staleStartedToolCallCount === 0}>
                  <RefreshCw size={14} /> Fail stale tools
                </button>
                <button className="ghost-button" title="Reject stale pending AI proposals" onClick={() => props.onRejectStaleAiProposals(false).catch(console.error)} disabled={aiOperations.proposalReview.stalePendingCount === 0}>
                  <RefreshCw size={14} /> Reject stale pending
                </button>
                <button className="ghost-button" title="Reject stale approved AI proposals without applying them" onClick={() => props.onRejectStaleAiProposals(true).catch(console.error)} disabled={aiOperations.proposalReview.staleApprovedCount === 0}>
                  <RefreshCw size={14} /> Reject stale approved
                </button>
              </div>
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.runtimePosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.runtimePosture.actionRequired ? "runtime config" : "runtime ready"}</span>
                <strong>{aiOperations.runtimePosture.selectedProvider}</strong>
              </div>
              <p>{aiOperations.runtimePosture.remediation}</p>
              <div className="admin-meta">
                <span>retry budget {formatNumber(aiOperations.runtimePosture.retryAttempts)}</span>
                <span>{aiOperations.runtimePosture.costRatesComplete ? "cost rate posture complete" : "cost rate posture partial"}</span>
                {aiOperations.runtimePosture.invalidCostConfig.length > 0 && <span>invalid cost env {aiOperations.runtimePosture.invalidCostConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidProviderThresholdConfig.length > 0 && <span>invalid threshold env {aiOperations.runtimePosture.invalidProviderThresholdConfig.join(", ")}</span>}
                {aiOperations.runtimePosture.invalidRuntimeControlConfig.length > 0 && <span>invalid runtime control env {aiOperations.runtimePosture.invalidRuntimeControlConfig.join(", ")}</span>}
                <span>{aiOperations.runtimePosture.actionReasons.length > 0 ? aiOperations.runtimePosture.actionReasons.join(", ") : "no runtime posture warnings"}</span>
                {aiOperations.runtimePosture.providerMismatch && <span>active provider {aiOperations.runtimePosture.activeProvider}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.timeoutMs > 0 ? `OpenAI timeout ${aiOperations.runtimePosture.openai.timeoutMs}ms` : "OpenAI timeout disabled"}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.modelConfigured ? `OpenAI model ${aiOperations.runtimePosture.openai.model}` : `OpenAI model default ${aiOperations.runtimePosture.openai.model}`}</span>}
                {aiOperations.runtimePosture.openai && <span>{aiOperations.runtimePosture.openai.baseUrlValid ? `${aiOperations.runtimePosture.openai.baseUrlInsecureInProduction ? "OpenAI base insecure in production" : "OpenAI base"} ${aiOperations.runtimePosture.openai.baseUrl}` : `OpenAI base invalid: ${aiOperations.runtimePosture.openai.baseUrlIssue ?? aiOperations.runtimePosture.openai.baseUrl}`}</span>}
              </div>
            </article>
            <div className="metric-grid">
              <MetricTile label="Selected Provider" value={aiOperations.runtimePosture.selectedProvider} />
              <MetricTile label="Active Provider" value={aiOperations.runtimePosture.activeProvider} />
              <MetricTile label="Retry Budget" value={formatNumber(aiOperations.runtimePosture.retryAttempts)} />
              <MetricTile label="AI Action" value={aiOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="AI Reasons" value={formatNumber(aiOperations.actionReasons.length)} />
              <MetricTile label="AI Remediations" value={formatNumber(aiOperations.remediationQueue.length)} />
              <MetricTile label="AI Errors" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "error").length)} />
              <MetricTile label="AI Warnings" value={formatNumber(aiOperations.remediationQueue.filter((item) => item.severity === "warning").length)} />
              <MetricTile label="Provider Mismatch" value={aiOperations.runtimePosture.providerMismatch ? "yes" : "no"} />
              <MetricTile label="OpenAI Key" value={aiOperations.runtimePosture.openai?.apiKeyConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Model" value={aiOperations.runtimePosture.openai?.modelConfigured ? "custom" : "default"} />
              <MetricTile label="OpenAI Model Name" value={aiOperations.runtimePosture.openai?.model ?? "n/a"} />
              <MetricTile label="OpenAI Base URL" value={aiOperations.runtimePosture.openai?.baseUrlValid ? "valid" : "invalid"} />
              <MetricTile label="OpenAI Base Secure" value={aiOperations.runtimePosture.openai?.baseUrlInsecureInProduction ? "no" : "yes"} />
              <MetricTile label="OpenAI Timeout" value={aiOperations.runtimePosture.openai ? formatDuration(aiOperations.runtimePosture.openai.timeoutMs) : "n/a"} />
              <MetricTile label="OpenAI Org" value={aiOperations.runtime.openai?.organizationConfigured ? "yes" : "no"} />
              <MetricTile label="OpenAI Project" value={aiOperations.runtime.openai?.projectConfigured ? "yes" : "no"} />
              <MetricTile label="Codex Adapter" value={aiOperations.runtimePosture.codex?.adapter ?? "n/a"} />
              <MetricTile label="Codex Transport" value={aiOperations.runtimePosture.codex?.transport ?? "n/a"} />
              <MetricTile label="Codex Approval" value={aiOperations.runtimePosture.codex?.approvalMode ?? "n/a"} />
              <MetricTile label="Runtime Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidRuntimeControlConfig.length)} />
              <MetricTile label="Provider Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidProviderThresholdConfig.length)} />
              <MetricTile label="Cost Rates" value={aiOperations.runtimePosture.costRatesComplete ? "complete" : "partial"} />
              <MetricTile label="Input Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.inputTokens ? "yes" : "no"} />
              <MetricTile label="Output Cost Rate" value={aiOperations.runtimePosture.costRatesConfigured.outputTokens ? "yes" : "no"} />
              <MetricTile label="Cost Config Errors" value={formatNumber(aiOperations.runtimePosture.invalidCostConfig.length)} />
              <MetricTile label="Threads" value={formatNumber(aiOperations.totals.threadCount)} />
              <MetricTile label="Recent Threads" value={formatNumber(aiOperations.recentThreads.length)} />
              <MetricTile label="Failures" value={formatNumber(aiOperations.totals.failedThreadCount)} />
              <MetricTile label="Retries" value={formatNumber(aiOperations.totals.retryAttempts)} />
              <MetricTile label="Tokens" value={formatNumber(aiOperations.totals.usage.totalTokens)} />
              <MetricTile label="Cost" value={formatCost(aiOperations.totals.usage.estimatedCostUsd)} />
              <MetricTile label="Cost Budget" value={aiOperations.runtime.costBudgetUsd === undefined ? "n/a" : formatCost(aiOperations.runtime.costBudgetUsd)} />
              <MetricTile label="Budget Configured" value={aiOperations.runtime.costBudgetUsd === undefined ? "no" : "yes"} />
              <MetricTile label="Budget left" value={aiOperations.risk.costBudget?.remainingUsd === undefined ? "n/a" : formatCost(aiOperations.risk.costBudget.remainingUsd)} />
              <MetricTile label="Budget Used" value={aiOperations.risk.costBudget?.usageRatio === undefined ? "n/a" : formatPercent(aiOperations.risk.costBudget.usageRatio)} />
              <MetricTile label="Budget Exceeded" value={aiOperations.risk.costBudget?.exceeded ? "yes" : "no"} />
              <MetricTile label="Provider Count" value={formatNumber(aiOperations.providerHealth.length)} />
              <MetricTile label="Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.actionRequired).length)} />
              <MetricTile label="Degraded Provider Rate" value={formatPercent(aiOperations.providerHealth.length === 0 ? 0 : aiOperations.providerHealth.filter((provider) => provider.actionRequired).length / aiOperations.providerHealth.length)} />
              <MetricTile label="Failure-Rate Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.failureRateDegraded).length)} />
              <MetricTile label="P95-Degraded Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.p95DurationDegraded).length)} />
              <MetricTile label="Running-Pressure Providers" value={formatNumber(aiOperations.providerHealth.filter((provider) => provider.runningThreadPressure).length)} />
              <MetricTile label="Provider Health Reasons" value={formatNumber(new Set(aiOperations.providerHealth.flatMap((provider) => provider.actionReasons)).size)} />
              <MetricTile label="Provider Error Messages" value={formatNumber(aiOperations.providerHealth.reduce((total, provider) => total + provider.recentErrorMessages.length, 0))} />
              <MetricTile label="Provider Error Groups" value={formatNumber(aiOperations.risk.providerErrors.length)} />
              <MetricTile label="Provider Errors" value={formatNumber(aiOperations.risk.providerErrors.reduce((total, error) => total + error.count, 0))} />
              <MetricTile label="Tools" value={formatNumber(aiOperations.totals.toolCallCount)} />
              <MetricTile label="Recent Tools" value={formatNumber(aiOperations.recentToolCalls.length)} />
              <MetricTile label="AI Risk Action" value={aiOperations.risk.actionRequired ? "yes" : "no"} />
              <MetricTile label="Running Threads" value={formatNumber(aiOperations.risk.runningThreadCount)} />
              <MetricTile label="Failed Tool Calls" value={formatNumber(aiOperations.risk.failedToolCallCount)} />
              <MetricTile label="Risk Failed Evals" value={formatNumber(aiOperations.risk.failedEvaluationCount)} />
              <MetricTile label="Failing Tools" value={formatNumber(aiOperations.risk.failedTools.length)} />
              <MetricTile label="Tool Retries" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.retryableCount)} />
              <MetricTile label="Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Non-Retryable Tools" value={formatNumber(aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount)} />
              <MetricTile label="Non-Retryable Tool Rate" value={formatPercent(((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)) === 0 ? 0 : (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0) / ((aiOperations.risk.failedToolRetryPolicy?.retryableCount ?? 0) + (aiOperations.risk.failedToolRetryPolicy?.nonRetryableCount ?? 0)))} />
              <MetricTile label="Replay Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.length)} />
              <MetricTile label="Replay Dry Runs" value={formatNumber(aiOperations.replayOperations.recentRuns.filter((run) => run.dryRun).length)} />
              <MetricTile label="Recent Replayed Tools" value={formatNumber(aiOperations.replayOperations.recentRetried.length)} />
              <MetricTile label="Replayed Tools" value={formatNumber(aiOperations.replayOperations.replayedToolCallCount)} />
              <MetricTile label="Replay Completed" value={formatNumber(aiOperations.replayOperations.completedReplayCount)} />
              <MetricTile label="Replay Failed" value={formatNumber(aiOperations.replayOperations.failedReplayCount)} />
              <MetricTile label="Replay Failure Rate" value={formatPercent((aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount) === 0 ? 0 : aiOperations.replayOperations.failedReplayCount / (aiOperations.replayOperations.completedReplayCount + aiOperations.replayOperations.failedReplayCount))} />
              <MetricTile label="Replay Action" value={aiOperations.replayOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Latest Replay" value={aiOperations.replayOperations.latestReplayAt ? formatDateTime(aiOperations.replayOperations.latestReplayAt) : "none"} />
              <MetricTile label="Stale Threads" value={formatNumber(aiOperations.risk.staleRunningThreadCount)} />
              <MetricTile label="Stale Tools" value={formatNumber(aiOperations.risk.staleStartedToolCallCount)} />
              <MetricTile label="Thread Completion" value={formatPercent(aiOperations.serviceLevels.threads.completionRate)} />
              <MetricTile label="Thread Fail Rate" value={formatPercent(aiOperations.serviceLevels.threads.failureRate)} />
              <MetricTile label="Tool Fail Rate" value={formatPercent(aiOperations.serviceLevels.tools.failureRate)} />
              <MetricTile label="Eval Coverage" value={formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} />
              <MetricTile label="Eval Thread Scope" value={formatNumber(aiOperations.evaluationCoverage.threadCount)} />
              <MetricTile label="Evaluations" value={formatNumber(aiOperations.evaluations.evaluationCount)} />
              <MetricTile label="Recent Evaluations" value={formatNumber(aiOperations.recentEvaluations.length)} />
              <MetricTile label="Evaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} />
              <MetricTile label="Unevaluated Threads" value={formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} />
              <MetricTile label="Unevaluated Samples" value={formatNumber(aiOperations.evaluationCoverage.recentUnevaluatedThreads.length)} />
              <MetricTile label="Failed Eval Threads" value={formatNumber(aiOperations.evaluationCoverage.failedEvaluationThreadCount)} />
              <MetricTile label="Eval Campaigns" value={formatNumber(aiOperations.evaluationCoverage.campaigns.length)} />
              <MetricTile label="Recurring Failed Checks" value={formatNumber(aiOperations.evaluationCoverage.recurringFailedChecks.length)} />
              <MetricTile label="Eval Pass Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.passRate)} />
              <MetricTile label="Eval Avg Score" value={formatPercent(aiOperations.evaluations.averageScore)} />
              <MetricTile label="Eval Fail Rate" value={formatPercent(aiOperations.serviceLevels.evaluations.failureRate)} />
              <MetricTile label="Passed Evals" value={formatNumber(aiOperations.evaluations.passedEvaluationCount)} />
              <MetricTile label="Failed Evals" value={formatNumber(aiOperations.evaluations.failedEvaluationCount)} />
              <MetricTile label="Failed Eval Checks" value={formatNumber(aiOperations.evaluations.failedChecks.length)} />
              <MetricTile label="Safety Checks" value={formatNumber(aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Safety Coverage" value={formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} />
              <MetricTile label="Safety Eval Runs" value={formatNumber(aiOperations.safetyPosture.evaluationWithSafetyCheckCount)} />
              <MetricTile label="Safety Eval Gaps" value={formatNumber(Math.max(0, aiOperations.safetyPosture.evaluationCount - aiOperations.safetyPosture.evaluationWithSafetyCheckCount))} />
              <MetricTile label="Safety Eval Threads" value={formatNumber(aiOperations.safetyPosture.evaluatedThreadWithSafetyCheckCount)} />
              <MetricTile label="Safety Failures" value={formatNumber(aiOperations.safetyPosture.failedSafetyCheckCount)} />
              <MetricTile label="Safety Failure Rate" value={formatPercent(aiOperations.safetyPosture.safetyCheckCount === 0 ? 0 : aiOperations.safetyPosture.failedSafetyCheckCount / aiOperations.safetyPosture.safetyCheckCount)} />
              <MetricTile label="Recent Safety Failures" value={formatNumber(aiOperations.safetyPosture.recentFailures.length)} />
              <MetricTile label="Recurring Safety Failures" value={formatNumber(aiOperations.safetyPosture.recurringFailures.length)} />
              <MetricTile label="Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.categoryCounts).length)} />
              <MetricTile label="Failed Safety Categories" value={formatNumber(Object.keys(aiOperations.safetyPosture.failedCategoryCounts).length)} />
              <MetricTile label="Safety Action" value={aiOperations.safetyPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Thread P95" value={formatDuration(aiOperations.serviceLevels.threads.durationMs.p95)} />
              <MetricTile label="Tool P95" value={formatDuration(aiOperations.serviceLevels.tools.durationMs.p95)} />
              <MetricTile label="Pending Proposals" value={formatNumber(aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Pending Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.pendingCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Pending Proposals" value={formatNumber(aiOperations.proposalReview.recentPending.length)} />
              <MetricTile label="Total Proposals" value={formatNumber(aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Approved Proposals" value={formatNumber(aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Approved Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Approved Proposals" value={formatNumber(aiOperations.proposalReview.recentApproved.length)} />
              <MetricTile label="Applied Proposals" value={formatNumber(aiOperations.proposalReview.appliedCount)} />
              <MetricTile label="Applied Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.appliedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Applied Proposals" value={formatNumber(aiOperations.proposalReview.recentApplied.length)} />
              <MetricTile label="Rejected Proposals" value={formatNumber(aiOperations.proposalReview.rejectedCount)} />
              <MetricTile label="Rejected Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.rejectedCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Recent Rejected Proposals" value={formatNumber(aiOperations.proposalReview.recentRejected.length)} />
              <MetricTile label="Approval Required" value={formatNumber(aiOperations.proposalReview.approvalRequiredCount)} />
              <MetricTile label="Approval Required Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.approvalRequiredCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Apply Ready" value={formatNumber(aiOperations.proposalReview.applyReadyCount)} />
              <MetricTile label="Apply Ready Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : aiOperations.proposalReview.applyReadyCount / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Stale Pending" value={formatNumber(aiOperations.proposalReview.stalePendingCount)} />
              <MetricTile label="Stale Pending Rate" value={formatPercent(aiOperations.proposalReview.pendingCount === 0 ? 0 : aiOperations.proposalReview.stalePendingCount / aiOperations.proposalReview.pendingCount)} />
              <MetricTile label="Stale Approved" value={formatNumber(aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Approved Rate" value={formatPercent(aiOperations.proposalReview.approvedCount === 0 ? 0 : aiOperations.proposalReview.staleApprovedCount / aiOperations.proposalReview.approvedCount)} />
              <MetricTile label="Stale Proposals" value={formatNumber(aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount)} />
              <MetricTile label="Stale Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.stalePendingCount + aiOperations.proposalReview.staleApprovedCount) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Oldest Pending" value={formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)} />
              <MetricTile label="Oldest Approved" value={formatDuration(aiOperations.proposalReview.oldestApprovedAgeMs)} />
              <MetricTile label="Apply Failures" value={formatNumber(aiOperations.proposalReview.applyFailureCount)} />
              <MetricTile label="Apply Failure Rate" value={formatPercent((aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount) === 0 ? 0 : aiOperations.proposalReview.applyFailureCount / (aiOperations.proposalReview.appliedCount + aiOperations.proposalReview.applyFailureCount))} />
              <MetricTile label="Recent Apply Failures" value={formatNumber(aiOperations.proposalReview.recentApplyFailures.length)} />
              <MetricTile label="Tool Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.tool_or_thread)} />
              <MetricTile label="Tool Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.tool_or_thread ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Manual Proposals" value={formatNumber(aiOperations.proposalReview.sourceCounts.manual)} />
              <MetricTile label="Manual Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.sourceCounts.manual ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Scene Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.scene)} />
              <MetricTile label="Scene Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.scene ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Token Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.token)} />
              <MetricTile label="Token Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.token ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="Actor Proposals" value={formatNumber(aiOperations.proposalReview.entityCounts.actor)} />
              <MetricTile label="Actor Proposal Rate" value={formatPercent(aiOperations.proposalReview.proposalCount === 0 ? 0 : (aiOperations.proposalReview.entityCounts.actor ?? 0) / aiOperations.proposalReview.proposalCount)} />
              <MetricTile label="AI Tools" value={formatNumber(aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Catalog Action" value={aiOperations.toolCatalog.actionRequired ? "yes" : "no"} />
              <MetricTile label="Tool Catalog Reasons" value={formatNumber(aiOperations.toolCatalog.actionReasons.length)} />
              <MetricTile label="Safe Tools" value={formatNumber(aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Safe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.permissionSafeToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Unsafe Tools" value={formatNumber(aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount)} />
              <MetricTile label="Unsafe Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : (aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.permissionSafeToolCount) / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Proposal-Gated Tools" value={formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} />
              <MetricTile label="Proposal-Gated Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.proposalGatedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Tools" value={formatNumber(aiOperations.toolCatalog.failClosedToolCount)} />
              <MetricTile label="Fail-Closed Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.failClosedToolCount / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Fail-Closed Gaps" value={formatNumber(Math.max(0, aiOperations.toolCatalog.toolCount - aiOperations.toolCatalog.failClosedToolCount))} />
              <MetricTile label="Strict Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Strict Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Loose Schema Tools" value={formatNumber(aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length)} />
              <MetricTile label="Loose Schema Tool Rate" value={formatPercent(aiOperations.toolCatalog.toolCount === 0 ? 0 : aiOperations.toolCatalog.tools.filter((tool) => !tool.rejectsAdditionalProperties).length / aiOperations.toolCatalog.toolCount)} />
              <MetricTile label="Tool Schema Types" value={formatNumber(new Set(aiOperations.toolCatalog.tools.map((tool) => tool.parameterSchemaType)).size)} />
            </div>
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.toolCatalog.actionRequired ? "failed" : "completed"}`}>{aiOperations.toolCatalog.actionRequired ? "tool review" : "tool policy"}</span>
                <strong>{formatNumber(aiOperations.toolCatalog.proposalGatedToolCount)} proposal gated</strong>
              </div>
              <p>{aiOperations.toolCatalog.remediation}</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.toolCatalog.failClosedToolCount)} fail-closed tools</span>
                <span>safe allowlist: {aiOperations.toolCatalog.permissionSafeAllowlist.join(", ")}</span>
              </div>
            </article>
            {aiOperations.toolCatalog.tools.filter((tool) => tool.failClosed || tool.permissionSafe).slice(0, 4).map((tool) => (
              <div className="operator-row tool-call-row" key={`ai-tool-catalog-${tool.name}`}>
                <span>{tool.name}</span>
                <strong>{tool.permissionSafe ? "permission-safe" : tool.failClosed ? "fail-closed" : "proposal-gated"} - {tool.requiredPermissions.join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${aiOperations.safetyPosture.actionRequired ? "failed" : "completed"}`}>{aiOperations.safetyPosture.actionRequired ? "eval failures" : "eval telemetry"}</span>
                <strong>{formatPercent(aiOperations.evaluationCoverage.evaluationCoverageRate)} covered</strong>
              </div>
              <p>{formatNumber(aiOperations.evaluationCoverage.evaluatedThreadCount)} evaluated / {formatNumber(aiOperations.evaluationCoverage.threadCount)} threads - {formatNumber(aiOperations.evaluationCoverage.unevaluatedThreadCount)} unevaluated</p>
              <div className="admin-meta">
                <span>{formatNumber(aiOperations.evaluations.evaluationCount)} evaluations</span>
                <span>{formatNumber(aiOperations.evaluations.failedEvaluationCount)} failed</span>
                <span>avg score {formatPercent(aiOperations.evaluations.averageScore)}</span>
                <span>{formatNumber(aiOperations.safetyPosture.safetyCheckCount)} safety checks</span>
                <span>{formatPercent(aiOperations.safetyPosture.safetyCheckCoverageRate)} safety coverage</span>
                <span>{Object.entries(aiOperations.safetyPosture.failedCategoryCounts).map(([category, count]) => `${category} (${formatNumber(count)})`).join(", ") || "no failed safety categories"}</span>
              </div>
            </article>
            {aiOperations.evaluationCoverage.recurringFailedChecks.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-eval-failed-check-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{formatNumber(failure.count)} failed checks</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-eval-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.evaluatedThreadCount)} evaluated / {formatNumber(campaign.threadCount)} threads - {formatNumber(campaign.failedEvaluationCount)} failed evals</strong>
              </div>
            ))}
            {aiOperations.safetyPosture.recentFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`ai-safety-failure-${failure.evaluationId}-${failure.name}`}>
                <span>{failure.name}</span>
                <strong>{failure.category ?? "evaluation"} - {failure.evaluationName} - {failure.provider}</strong>
              </div>
            ))}
            {aiOperations.evaluationCoverage.recentUnevaluatedThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`ai-unevaluated-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "unknown"} - {thread.provider} - {formatDateTime(thread.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.remediationQueue.slice(0, 4).map((item) => (
              <article className="operator-item admin-item" key={`ai-remediation-${item.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${item.severity === "error" ? "failed" : "running"}`}>{item.severity}</span>
                  <strong>{formatNumber(item.affectedCount)} affected</strong>
                </div>
                <h3>{item.code.replaceAll("_", " ")}</h3>
                <p>{item.action}</p>
              </article>
            ))}
            {aiOperations.proposalReview.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">proposal review</span>
                  <strong>{formatNumber(aiOperations.proposalReview.pendingCount)} pending</strong>
                </div>
                <p>{aiOperations.proposalReview.actionReasons.join(", ")} - oldest pending {formatDuration(aiOperations.proposalReview.oldestPendingAgeMs)}</p>
                <div className="admin-meta">
                  <span>{formatNumber(aiOperations.proposalReview.approvedCount)} approved</span>
                  <span>{formatNumber(aiOperations.proposalReview.appliedCount)} applied</span>
                  <span>stale after {formatDuration(aiOperations.proposalReview.staleReviewThresholdMs)}</span>
                  <span>{Object.entries(aiOperations.proposalReview.entityCounts).slice(0, 3).map(([entity, count]) => `${entity} (${formatNumber(count)})`).join(", ") || "no entities"}</span>
                </div>
              </article>
            )}
            {aiOperations.proposalReview.stalePending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - pending since {formatDateTime(proposal.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.staleApproved.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`stale-approved-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - approved since {formatDateTime(proposal.updatedAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplyFailures.slice(0, 3).map((failure) => (
              <div className="operator-row tool-call-row" key={`failed-ai-proposal-apply-${failure.auditLogId}`}>
                <span>{failure.proposalId ?? "proposal apply failed"}</span>
                <strong>{failure.campaignName ?? failure.campaignId ?? "unknown campaign"} - {failure.reason} - {formatDateTime(failure.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.campaigns.slice(0, 3).map((campaign) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-campaign-${campaign.campaignId}`}>
                <span>{campaign.campaignName}</span>
                <strong>{formatNumber(campaign.pendingCount)} pending - oldest {formatDuration(campaign.oldestPendingAgeMs)}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentPending.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - {formatNumber(proposal.changeCount)} changes - {proposal.entities.join(", ") || "no entities"}</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentRejected.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`rejected-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - rejected {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.proposalReview.recentApplied.slice(0, 3).map((proposal) => (
              <div className="operator-row tool-call-row" key={`applied-ai-proposal-${proposal.id}`}>
                <span>{proposal.title}</span>
                <strong>{proposal.campaignName ?? proposal.campaignId} - applied {formatDateTime(proposal.updatedAt)} - {formatNumber(proposal.changeCount)} changes</strong>
              </div>
            ))}
            {aiOperations.campaigns.slice(0, 4).map((campaign) => (
              <article className="operator-item admin-item" key={campaign.campaignId}>
                <div className="operator-row">
                  <span>{campaign.campaignName}</span>
                  <strong>{formatNumber(campaign.threadCount)} threads</strong>
                </div>
                <p>{formatNumber(campaign.failedThreadCount)} failures - {formatNumber(campaign.toolCallCount)} tool calls - {formatDuration(campaign.durationMs)}</p>
              </article>
            ))}
            {aiOperations.providerHealth.slice(0, 4).map((provider) => (
              <article className="operator-item admin-item" key={`provider-health-${provider.provider}`}>
                <div className="operator-row">
                  <span className={`status-pill ${provider.actionRequired ? "failed" : "completed"}`}>{provider.provider}</span>
                  <strong>{formatPercent(provider.failureRate)} fail rate</strong>
                </div>
                <p>{provider.actionReasons.length > 0 ? provider.actionReasons.join(", ") : "healthy"} - {provider.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(provider.threadCount)} threads</span>
                  <span>{formatNumber(provider.providerErrorCount)} provider errors</span>
                  <span>{provider.failureRateDegraded ? `above ${formatPercent(provider.failureRateThreshold)} threshold` : `threshold ${formatPercent(provider.failureRateThreshold)}`}</span>
                  <span>p95 {formatDuration(provider.durationMsSummary.p95)}</span>
                  <span>{provider.p95DurationThresholdMs ? (provider.p95DurationDegraded ? `p95 above ${formatDuration(provider.p95DurationThresholdMs)}` : `p95 threshold ${formatDuration(provider.p95DurationThresholdMs)}`) : "no p95 threshold"}</span>
                  <span>{formatPercent(provider.completionRate)} completion</span>
                  <span>{formatNumber(provider.staleRunningThreadCount)} stale running</span>
                  <span>{provider.runningThreadPressure ? `${formatNumber(provider.runningThreadCount)} running above threshold` : `running threshold ${formatNumber(provider.runningThreadThreshold)}`}</span>
                  <span>{formatCost(provider.usage.estimatedCostUsd)} estimated cost</span>
                  <span>{provider.recentErrorMessages[0] ?? "no recent provider errors"}</span>
                </div>
              </article>
            ))}
            {aiOperations.risk.providerErrors.slice(0, 3).map((error) => (
              <div className="operator-row tool-call-row" key={error.message}>
                <span>{error.message}</span>
                <strong>{formatNumber(error.count)} provider failures{error.recentThreads[0] ? ` - ${error.recentThreads[0].campaignName ?? error.recentThreads[0].campaignId}` : ""}</strong>
              </div>
            ))}
            {aiOperations.risk.providerErrors.flatMap((error) => error.recentThreads.slice(0, 2).map((thread) => ({ error, thread }))).slice(0, 3).map(({ error, thread }) => (
              <div className="operator-row tool-call-row" key={`provider-error-thread-${error.message}-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - {thread.failedAt ? formatDateTime(thread.failedAt) : thread.status} - retries {formatNumber(thread.retryAttempts)}</strong>
              </div>
            ))}
            {aiOperations.risk.failedTools.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={tool.toolName}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.count)} failed - {tool.errors[0]?.error ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.byTool.slice(0, 3).map((tool) => (
              <div className="operator-row tool-call-row" key={`retry-policy-${tool.toolName}`}>
                <span>{tool.toolName}</span>
                <strong>{formatNumber(tool.retryable)} retryable / {formatNumber(tool.nonRetryable)} blocked - {tool.reasons[0]?.reason ?? "unknown"}</strong>
              </div>
            ))}
            {aiOperations.risk.failedToolRetryPolicy?.recentRetryable.slice(0, 5).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`retryable-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.threadTitle ?? toolCall.threadId} - {toolCall.campaignName ?? "unknown"} - {toolCall.retryReason}</strong>
                <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                  <RefreshCw size={14} /> Retry tool
                </button>
              </div>
            ))}
            {aiOperations.replayOperations.recentRetried.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`replayed-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.resultStatus ?? "unknown"}{toolCall.resultError ? ` - ${toolCall.resultError}` : ""} - {toolCall.campaignName ?? "unknown"} - {toolCall.retriedAt ? formatDateTime(toolCall.retriedAt) : "retry time unknown"}</strong>
              </div>
            ))}
            {aiOperations.replayOperations.recentRuns.slice(0, 3).map((run) => (
              <div className="operator-row tool-call-row" key={`ai-replay-run-${run.auditLogId}`}>
                <span>{run.dryRun ? "dry-run replay" : "tool replay"}</span>
                <strong>{formatNumber(run.retried)} retried - {formatNumber(run.completed)} completed - {formatNumber(run.failed)} failed - {formatDateTime(run.createdAt)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleRunningThreads.slice(0, 3).map((thread) => (
              <div className="operator-row tool-call-row" key={`stale-thread-${thread.id}`}>
                <span>{thread.title}</span>
                <strong>{thread.provider} - stale {formatDuration(thread.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.risk.recentStaleStartedToolCalls.slice(0, 3).map((toolCall) => (
              <div className="operator-row tool-call-row" key={`stale-tool-${toolCall.id}`}>
                <span>{toolCall.toolName}</span>
                <strong>{toolCall.provider ?? "unknown"} - stale {formatDuration(toolCall.ageMs)}</strong>
              </div>
            ))}
            {aiOperations.recentThreads.slice(0, 5).map((thread) => (
              <div className="operator-row tool-call-row" key={thread.id}>
                <span>{thread.title}</span>
                <strong>{thread.status ?? "running"} - {thread.provider} - {formatDuration(thread.durationMs)}</strong>
              </div>
            ))}
            {aiOperations.recentToolCalls.slice(0, 5).map((toolCall) => {
              const retryable = retryableAiToolCallIds.has(toolCall.id);
              const errorCode = aiToolCallErrorCode(toolCall.output);
              return (
                <div className="operator-row tool-call-row" key={toolCall.id}>
                  <span>{toolCall.toolName}</span>
                  <strong>{toolCall.status}{errorCode ? ` - ${errorCode}` : ""} - {toolCall.campaignName ?? "unknown"}</strong>
                  {retryable && (
                    <button className="ghost-button" title="Replay retryable failed AI tool call" onClick={() => props.onRetryAiToolCall(toolCall.id, toolCall.toolName).catch(console.error)}>
                      <RefreshCw size={14} /> Retry tool
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin operations">
        <div className="operator-heading">
          <div className="section-title">Plugin Operations</div>
          <strong>{pluginOperations?.policy.review ?? "not loaded"}</strong>
        </div>
        {!pluginOperations ? (
          <div className="empty-state compact">No plugin operations loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.actionRequired ? "failed" : "completed"}`}>{pluginOperations.actionRequired ? "action required" : "healthy"}</span>
                <strong>{pluginOperations.policy.trust}</strong>
              </div>
              <p>{formatNumber(pluginOperations.totals.packageCount)} packages - {formatNumber(pluginOperations.totals.installedGrantCount)} installs</p>
              <div className="admin-meta">
                <span>{pluginOperations.actionReasons.length > 0 ? pluginOperations.actionReasons.join(", ") : "no action reasons"}</span>
                <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending reviews</span>
                <span>{formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} registries</span>
                <span>core {pluginOperations.compatibilityOperations.coreVersion}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Catalog Plugins" value={formatNumber(pluginOperations.totals.catalogPluginCount)} />
              <MetricTile label="Registry Generation" value={pluginOperations.registryRevision.slice(0, 12)} />
              <MetricTile label="Packages" value={formatNumber(pluginOperations.totals.packageCount)} />
              <MetricTile label="Plugin Review Policy" value={pluginOperations.policy.review} />
              <MetricTile label="Plugin Action" value={pluginOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Plugin Reasons" value={formatNumber(pluginOperations.actionReasons.length)} />
              <MetricTile label="Plugin Remediations" value={formatNumber(pluginOperations.remediationQueue.length)} />
              <MetricTile label="Plugin Errors" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "error").length)} />
              <MetricTile label="Plugin Warnings" value={formatNumber(pluginOperations.remediationQueue.filter((remediation) => remediation.severity === "warning").length)} />
              <MetricTile label="Healthy" value={formatNumber(pluginOperations.totals.healthyInstalledCount)} />
              <MetricTile label="Blocked" value={formatNumber(pluginOperations.totals.blockedInstalledCount)} />
              <MetricTile label="Missing" value={formatNumber(pluginOperations.totals.missingInstalledCount)} />
              <MetricTile label="Drift" value={formatNumber(pluginOperations.totals.permissionDriftCount)} />
              <MetricTile label="Drift Samples" value={formatNumber(pluginOperations.permissionDrift.length)} />
              <MetricTile label="Compat Action" value={pluginOperations.compatibilityOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Core Version" value={pluginOperations.compatibilityOperations.coreVersion} />
              <MetricTile label="Core Drift" value={formatNumber(pluginOperations.totals.incompatibleInstalledCount)} />
              <MetricTile label="Incompat Packages" value={formatNumber(pluginOperations.totals.incompatiblePackageCount)} />
              <MetricTile label="Storage" value={formatNumber(pluginOperations.storage.entryCount)} />
              <MetricTile label="Storage Plugins" value={formatNumber(Object.keys(pluginOperations.storage.byPlugin).length)} />
              <MetricTile label="Storage Campaigns" value={formatNumber(Object.keys(pluginOperations.storage.byCampaign).length)} />
              <MetricTile label="Storage Value Limit" value={formatStorageBytes(pluginOperations.storage.maxValueBytes)} />
              <MetricTile label="Storage Near Limit" value={formatNumber(pluginOperations.storage.nearLimitEntries.length)} />
              <MetricTile label="Storage Near-Limit Rate" value={formatPercent(pluginOperations.storage.entryCount === 0 ? 0 : pluginOperations.storage.nearLimitEntries.length / pluginOperations.storage.entryCount)} />
              <MetricTile label="Largest Storage Entries" value={formatNumber(pluginOperations.storage.largestEntries.length)} />
              <MetricTile label="Near Limit Bytes" value={formatStorageBytes(pluginOperations.storage.nearLimitBytes)} />
              <MetricTile label="Commands" value={formatNumber(pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Commands" value={formatNumber(pluginOperations.commandOperations.recentCommandCount)} />
              <MetricTile label="Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.byPlugin).length)} />
              <MetricTile label="Command Campaigns" value={formatNumber(Object.keys(pluginOperations.commandOperations.byCampaign).length)} />
              <MetricTile label="Command Action" value={pluginOperations.commandOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Command Failures" value={formatNumber(pluginOperations.commandOperations.failedCommandCount)} />
              <MetricTile label="Command Failure Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.failedCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Recent Command Failures" value={formatNumber(pluginOperations.commandOperations.recentFailureCount)} />
              <MetricTile label="Failed Command Plugins" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByPlugin).length)} />
              <MetricTile label="Command Failure Reasons" value={formatNumber(Object.keys(pluginOperations.commandOperations.failedByReason).length)} />
              <MetricTile label="Storage Mutations" value={formatNumber(pluginOperations.commandOperations.storageMutatingCommandCount)} />
              <MetricTile label="Storage Mutation Rate" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 0 : pluginOperations.commandOperations.storageMutatingCommandCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Storage Ops" value={formatNumber(pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Recent Storage Ops" value={formatNumber(pluginOperations.storageOperations.recentOperations.length)} />
              <MetricTile label="Storage Op Plugins" value={formatNumber(Object.keys(pluginOperations.storageOperations.byPlugin).length)} />
              <MetricTile label="Storage Op Campaigns" value={formatNumber(Object.keys(pluginOperations.storageOperations.byCampaign).length)} />
              <MetricTile label="Direct Storage Sets" value={formatNumber(pluginOperations.storageOperations.directSetCount)} />
              <MetricTile label="Direct Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directSetCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Direct Storage Deletes" value={formatNumber(pluginOperations.storageOperations.directDeleteCount)} />
              <MetricTile label="Direct Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.directDeleteCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Command Storage Ops" value={formatNumber(pluginOperations.storageOperations.commandMutationCount)} />
              <MetricTile label="Command Storage Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.commandMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Sets" value={formatNumber(pluginOperations.storageOperations.setMutationCount)} />
              <MetricTile label="Storage Set Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.setMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Storage Deletes" value={formatNumber(pluginOperations.storageOperations.deleteMutationCount)} />
              <MetricTile label="Storage Delete Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deleteMutationCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Deleted Storage Entries" value={formatNumber(pluginOperations.storageOperations.deletedEntryCount)} />
              <MetricTile label="Deleted Entry Rate" value={formatPercent(pluginOperations.storageOperations.operationCount === 0 ? 0 : pluginOperations.storageOperations.deletedEntryCount / pluginOperations.storageOperations.operationCount)} />
              <MetricTile label="Installs" value={formatNumber(pluginOperations.installOperations.installCount)} />
              <MetricTile label="Recent Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Recent Upgrades" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "upgrade").length)} />
              <MetricTile label="Recent Rollbacks" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "rollback").length)} />
              <MetricTile label="Recent Permission Reviews" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.operation === "permission_review").length)} />
              <MetricTile label="Installed Grants" value={formatNumber(pluginOperations.totals.installedGrantCount)} />
              <MetricTile label="Install Campaigns" value={formatNumber(Object.keys(pluginOperations.installOperations.byCampaign).length)} />
              <MetricTile label="Installed Plugins" value={formatNumber(Object.keys(pluginOperations.installOperations.byPlugin).length)} />
              <MetricTile label="Install Sandboxes" value={formatNumber(new Set(pluginOperations.installOperations.recentInstalls.map((install) => install.sandbox ?? "unknown")).size)} />
              <MetricTile label="Install Permission Gaps" value={formatNumber(pluginOperations.installOperations.recentInstalls.reduce((total, install) => total + install.missingPermissionCount, 0))} />
              <MetricTile label="Install Gap Installs" value={formatNumber(pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length)} />
              <MetricTile label="Install Gap Rate" value={formatPercent(pluginOperations.installOperations.recentInstalls.length === 0 ? 0 : pluginOperations.installOperations.recentInstalls.filter((install) => install.missingPermissionCount > 0).length / pluginOperations.installOperations.recentInstalls.length)} />
              <MetricTile label="Version Changes" value={formatNumber(pluginOperations.installOperations.versionChangeCount)} />
              <MetricTile label="Version Change Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.versionChangeCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Rollbacks" value={formatNumber(pluginOperations.installOperations.rollbackCount)} />
              <MetricTile label="Rollback Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.rollbackCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Permission Reviews" value={formatNumber(pluginOperations.installOperations.permissionReviewCount)} />
              <MetricTile label="Permission Review Rate" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 0 : pluginOperations.installOperations.permissionReviewCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Command Audits" value={formatNumber(pluginOperations.totals.commandAuditCount)} />
              <MetricTile label="Command Audit Coverage" value={formatPercent(pluginOperations.commandOperations.commandCount === 0 ? 1 : pluginOperations.totals.commandAuditCount / pluginOperations.commandOperations.commandCount)} />
              <MetricTile label="Install Audits" value={formatNumber(pluginOperations.totals.installAuditCount)} />
              <MetricTile label="Install Audit Coverage" value={formatPercent(pluginOperations.installOperations.installCount === 0 ? 1 : pluginOperations.totals.installAuditCount / pluginOperations.installOperations.installCount)} />
              <MetricTile label="Load Errors" value={formatNumber(pluginOperations.totals.loadErrorCount)} />
              <MetricTile label="Load Error Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.totals.loadErrorCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Load Error Samples" value={formatNumber(pluginOperations.loadErrors.length)} />
              <MetricTile label="Configured Registries" value={formatNumber(pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Synced Packages" value={formatNumber(pluginOperations.registryOperations.syncedPackageCount)} />
              <MetricTile label="Synced Registries" value={formatNumber(Object.keys(pluginOperations.registryOperations.packageCountByRegistry).length)} />
              <MetricTile label="Oldest Registry Sync" value={formatDurationSeconds(pluginOperations.registryOperations.oldestSyncAgeSeconds)} />
              <MetricTile label="Registry Stale Threshold" value={formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)} />
              <MetricTile label="Registry Action" value={pluginOperations.registryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Registry Reasons" value={formatNumber(pluginOperations.registryOperations.actionReasons.length)} />
              <MetricTile label="Review Coverage" value={formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} />
              <MetricTile label="Review Action" value={pluginOperations.reviewOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Review Reasons" value={formatNumber(pluginOperations.reviewOperations.actionReasons.length)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedCount)} />
              <MetricTile label="Approved Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.approvedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Approved Reviews" value={formatNumber(pluginOperations.reviewOperations.approvedSamples.length)} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginOperations.reviewOperations.pendingCount)} />
              <MetricTile label="Pending Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.pendingCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Pending Review Samples" value={formatNumber(pluginOperations.reviewOperations.pendingSamples.length)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedCount)} />
              <MetricTile label="Rejected Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.rejectedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Recent Rejected Reviews" value={formatNumber(pluginOperations.reviewOperations.rejectedSamples.length)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginOperations.reviewOperations.blockedCount)} />
              <MetricTile label="Blocked Review Rate" value={formatPercent((pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount) === 0 ? 0 : pluginOperations.reviewOperations.blockedCount / (pluginOperations.reviewOperations.approvedCount + pluginOperations.reviewOperations.pendingCount + pluginOperations.reviewOperations.rejectedCount + pluginOperations.reviewOperations.blockedCount))} />
              <MetricTile label="Blocked Review Samples" value={formatNumber(pluginOperations.reviewOperations.blockedSamples.length)} />
              <MetricTile label="Oldest Review" value={`${formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} d`} />
              <MetricTile label="Local Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.local)} />
              <MetricTile label="Registry Packages" value={formatNumber(pluginOperations.reviewOperations.sourceCounts.registry)} />
              <MetricTile label="Registry Drift" value={formatNumber(pluginOperations.registryOperations.unconfiguredRegistryPackageCount)} />
              <MetricTile label="Registry Drift Samples" value={formatNumber(pluginOperations.registryOperations.unconfiguredPackages.length)} />
              <MetricTile label="Stale Registries" value={formatNumber(pluginOperations.registryOperations.staleConfiguredRegistryCount)} />
              <MetricTile label="Registry Entries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Valid Registries" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} />
              <MetricTile label="Valid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 1 : pluginOperations.registryOperations.runtimeConfig.validConfiguredCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Unsynced Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length)} />
              <MetricTile label="Unsynced Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "never_synced").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Failed Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length)} />
              <MetricTile label="Failed Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.configured.filter((registry) => registry.status === "failed").length / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Registry Imports" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastImported.length, 0))} />
              <MetricTile label="Registry Error Messages" value={formatNumber(pluginOperations.registryOperations.configured.reduce((total, registry) => total + registry.lastErrors.length, 0))} />
              <MetricTile label="Registry Error Registries" value={formatNumber(pluginOperations.registryOperations.configured.filter((registry) => registry.lastErrors.length > 0).length)} />
              <MetricTile label="Stale Registry Rate" value={formatPercent(pluginOperations.registryOperations.configuredRegistryCount === 0 ? 0 : pluginOperations.registryOperations.staleConfiguredRegistryCount / pluginOperations.registryOperations.configuredRegistryCount)} />
              <MetricTile label="Invalid Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} />
              <MetricTile label="Invalid Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.invalidUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Insecure Registry URLs" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} />
              <MetricTile label="Insecure Registry Rate" value={formatPercent(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount === 0 ? 0 : pluginOperations.registryOperations.runtimeConfig.insecureUrlCount / pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} />
              <MetricTile label="Registry Config Errors" value={formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} />
              <MetricTile label="Inventory Action" value={pluginOperations.inventoryOperations.actionRequired ? "yes" : "no"} />
              <MetricTile label="Inventory Reasons" value={formatNumber(pluginOperations.inventoryOperations.actionReasons.length)} />
              <MetricTile label="Duplicate Versions" value={formatNumber(pluginOperations.inventoryOperations.duplicateVersionCount)} />
              <MetricTile label="Duplicate Version Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicateVersionCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Duplicate Packages" value={formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} />
              <MetricTile label="Duplicate Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.inventoryOperations.duplicatePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Trusted Packages" value={formatNumber(pluginOperations.securityPosture.trustedPackageCount)} />
              <MetricTile label="Trusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 1 : pluginOperations.securityPosture.trustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Security Action" value={pluginOperations.securityPosture.actionRequired ? "yes" : "no"} />
              <MetricTile label="Security Reasons" value={formatNumber(pluginOperations.securityPosture.actionReasons.length)} />
              <MetricTile label="Unsigned" value={formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} />
              <MetricTile label="Unsigned Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.unsignedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Unsigned Samples" value={formatNumber(pluginOperations.securityPosture.unsignedSamples.length)} />
              <MetricTile label="Untrusted" value={formatNumber(pluginOperations.securityPosture.untrustedPackageCount)} />
              <MetricTile label="Untrusted Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.untrustedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Untrusted Samples" value={formatNumber(pluginOperations.securityPosture.untrustedSamples.length)} />
              <MetricTile label="Trust Blocked" value={formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} />
              <MetricTile label="Trust Blocked Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.trustBlockedPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Command Packages" value={formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Command Package Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.commandCapablePackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Manifest-Only Packages" value={formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} />
              <MetricTile label="Manifest-Only Rate" value={formatPercent(pluginOperations.totals.packageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyPackageCount / pluginOperations.totals.packageCount)} />
              <MetricTile label="Non-VM Commands" value={formatNumber(pluginOperations.securityPosture.manifestOnlyCommandPackageCount)} />
              <MetricTile label="Non-VM Command Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : pluginOperations.securityPosture.manifestOnlyCommandPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Non-VM Command Samples" value={formatNumber(pluginOperations.securityPosture.nonVmCommandSamples.length)} />
              <MetricTile label="Trust Policy" value={pluginOperations.securityPosture.runtimeConfig.trustPolicy} />
              <MetricTile label="Trust Keys" value={formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} />
              <MetricTile label="Trust Keys Ready" value={pluginOperations.securityPosture.runtimeConfig.trustKeysConfigured ? "yes" : "no"} />
              <MetricTile label="Unsigned Prod" value={pluginOperations.securityPosture.runtimeConfig.allowUnsignedInProduction ? "yes" : "no"} />
              <MetricTile label="Trusted No Keys" value={pluginOperations.securityPosture.runtimeConfig.trustedModeWithoutKeys ? "yes" : "no"} />
              <MetricTile label="VM Sandbox" value={formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} />
              <MetricTile label="VM Sandbox Coverage" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 1 : pluginOperations.securityPosture.vmSandboxPackageCount / pluginOperations.securityPosture.commandCapablePackageCount)} />
              <MetricTile label="Sandbox Gap" value={formatNumber(Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount))} />
              <MetricTile label="Sandbox Gap Rate" value={formatPercent(pluginOperations.securityPosture.commandCapablePackageCount === 0 ? 0 : Math.max(0, pluginOperations.securityPosture.commandCapablePackageCount - pluginOperations.securityPosture.vmSandboxPackageCount) / pluginOperations.securityPosture.commandCapablePackageCount)} />
            </div>
            {pluginOperations.registryOperations.actionRequired && (
              <p className="admin-status">{pluginOperations.registryOperations.actionReasons.join(", ")}</p>
            )}
            {(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.insecureUrlCount > 0 || pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length > 0) && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">registry config</span>
                  <strong>{formatNumber(pluginOperations.registryOperations.runtimeConfig.validConfiguredCount)} valid / {formatNumber(pluginOperations.registryOperations.runtimeConfig.configuredEntryCount)} configured</strong>
                </div>
                <p>
                  {pluginOperations.registryOperations.runtimeConfig.invalidUrlConfig.concat(pluginOperations.registryOperations.runtimeConfig.insecureUrlConfig, pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig).join(", ")}
                </p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidUrlCount)} invalid URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.insecureUrlCount)} production HTTP URLs</span>
                  <span>{formatNumber(pluginOperations.registryOperations.runtimeConfig.invalidNumericConfig.length)} numeric config errors</span>
                </div>
              </article>
            )}
            {pluginOperations.inventoryOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">inventory hygiene</span>
                  <strong>{formatNumber(pluginOperations.inventoryOperations.duplicatePackageCount)} duplicate packages</strong>
                </div>
                <p>{pluginOperations.inventoryOperations.actionReasons.join(", ")}</p>
              </article>
            )}
            {pluginOperations.inventoryOperations.duplicateVersions.slice(0, 3).map((duplicate) => (
              <div className="operator-row tool-call-row" key={`plugin-inventory-${duplicate.pluginId}-${duplicate.version}`}>
                <span>{duplicate.name} v{duplicate.version}</span>
                <strong>{formatNumber(duplicate.packageCount)} packages - {duplicate.packageIds.slice(0, 3).join(", ")}</strong>
              </div>
            ))}
            <article className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${pluginOperations.securityPosture.actionRequired ? "failed" : "completed"}`}>{pluginOperations.securityPosture.actionRequired ? "security review" : "security posture"}</span>
                <strong>{formatNumber(pluginOperations.securityPosture.commandCapablePackageCount)} command packages</strong>
              </div>
              <p>{pluginOperations.securityPosture.remediation}</p>
              <div className="admin-meta">
                <span>{pluginOperations.securityPosture.runtimeConfig.trustPolicy}</span>
                <span>{formatNumber(pluginOperations.securityPosture.runtimeConfig.trustKeyCount)} trust keys</span>
                <span>{formatNumber(pluginOperations.securityPosture.vmSandboxPackageCount)} VM sandbox</span>
                <span>{formatNumber(pluginOperations.securityPosture.manifestOnlyPackageCount)} manifest-only</span>
                <span>{formatNumber(pluginOperations.securityPosture.unsignedPackageCount)} unsigned</span>
                <span>{formatNumber(pluginOperations.securityPosture.trustBlockedPackageCount)} trust-blocked</span>
              </div>
            </article>
            {[...pluginOperations.securityPosture.nonVmCommandSamples, ...pluginOperations.securityPosture.untrustedSamples, ...pluginOperations.securityPosture.unsignedSamples].slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`plugin-security-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.sandbox} - {plugin.trustStatus} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.commandOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill failed">command failures</span>
                  <strong>{formatNumber(pluginOperations.commandOperations.failedCommandCount)} failed</strong>
                </div>
                <p>{Object.entries(pluginOperations.commandOperations.failedByReason).map(([reason, count]) => `${reason} (${formatNumber(count)})`).join(", ")}</p>
              </article>
            )}
            {pluginOperations.remediationQueue.slice(0, 4).map((remediation) => (
              <article className="operator-item admin-item" key={`plugin-remediation-${remediation.code}`}>
                <div className="operator-row">
                  <span className={`status-pill ${remediation.severity === "error" ? "failed" : "running"}`}>{remediation.severity}</span>
                  <strong>{formatNumber(remediation.affectedCount)} affected</strong>
                </div>
                <h3>{remediation.code.replaceAll("_", " ")}</h3>
                <p>{remediation.action}</p>
              </article>
            ))}
            {pluginOperations.reviewOperations.actionRequired && (
              <article className="operator-item admin-item">
                <div className="operator-row">
                  <span className="status-pill running">review queue</span>
                  <strong>{formatPercent(pluginOperations.reviewOperations.approvalCoverageRate)} approved</strong>
                </div>
                <h3>{pluginOperations.reviewOperations.actionReasons.join(", ")}</h3>
                <p>{pluginOperations.reviewOperations.remediation}</p>
                <div className="admin-meta">
                  <span>{formatNumber(pluginOperations.reviewOperations.pendingCount)} pending</span>
                  <span>{formatNumber(pluginOperations.reviewOperations.blockedCount)} blocked</span>
                  <span>oldest {formatNumber(pluginOperations.reviewOperations.oldestPendingAgeDays)} days</span>
                </div>
              </article>
            )}
            {pluginOperations.reviewOperations.pendingSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-pending-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - pending {formatNumber(review.ageDays)} days - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.approvedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-approved-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - approved {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.rejectedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-rejected-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.sourceType} - rejected {formatNumber(review.ageDays)} days ago - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.reviewOperations.blockedSamples.slice(0, 3).map((review) => (
              <div className="operator-row tool-call-row" key={`plugin-review-blocked-${review.reviewKey}`}>
                <span>{review.name} v{review.version}</span>
                <strong>{review.installBlock ?? `${review.status} review`} - {review.packageId}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.configured.slice(0, 3).map((registry) => (
              <article className="operator-item admin-item" key={registry.registryUrl}>
                <div className="operator-row">
                  <span className={`status-pill ${registry.status === "failed" ? "failed" : registry.stale ? "running" : registry.status === "synced" ? "completed" : "running"}`}>{registry.stale ? "stale" : registry.status}</span>
                  <strong>{formatNumber(registry.syncedPackageCount)} packages</strong>
                </div>
                <h3>{registryHostLabel(registry.registryUrl)}</h3>
                <p>{registry.lastErrors.length > 0 ? registry.lastErrors.join(", ") : registry.lastSyncAt ? `Last sync ${formatDateTime(registry.lastSyncAt)} - age ${formatDurationSeconds(registry.syncAgeSeconds)}` : "No sync recorded"}</p>
              </article>
            ))}
            {pluginOperations.registryOperations.staleConfiguredRegistries.slice(0, 3).map((registry) => (
              <div className="operator-row tool-call-row" key={`plugin-registry-stale-${registry.registryUrl}`}>
                <span>{registryHostLabel(registry.registryUrl)}</span>
                <strong>stale {formatDurationSeconds(registry.syncAgeSeconds)} - threshold {formatDurationSeconds(pluginOperations.registryOperations.staleThresholdSeconds)}</strong>
              </div>
            ))}
            {pluginOperations.registryOperations.unconfiguredPackages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={`${plugin.registryUrl}-${plugin.packageId}`}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{registryHostLabel(plugin.registryUrl)} - {plugin.packageId}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.packages.slice(0, 3).map((plugin) => (
              <div className="operator-row tool-call-row" key={plugin.packageId}>
                <span>{plugin.name} v{plugin.version}</span>
                <strong>{plugin.compatibleCore} - {plugin.sourceType}</strong>
              </div>
            ))}
            {pluginOperations.compatibilityOperations.installed.slice(0, 3).map((grant) => (
              <div className="operator-row tool-call-row" key={`${grant.campaignId}-${grant.pluginId}`}>
                <span>{grant.pluginId}</span>
                <strong>{campaignName(props.campaigns, grant.campaignId)} - {grant.installedVersion ?? "unknown version"}</strong>
              </div>
            ))}
            {pluginOperations.permissionDrift.slice(0, 3).map((drift) => (
              <div className="operator-row tool-call-row" key={`${drift.campaignId}-${drift.pluginId}-permission-drift`}>
                <span>{drift.name}</span>
                <strong>{campaignName(props.campaigns, drift.campaignId)} - missing {drift.missingPermissions.slice(0, 2).join(", ")}</strong>
              </div>
            ))}
            {pluginOperations.storage.nearLimitEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-near-limit-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{campaignName(props.campaigns, entry.campaignId)} - {formatStorageBytes(entry.sizeBytes)} / {formatStorageBytes(pluginOperations.storage.maxValueBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storage.largestEntries.slice(0, 3).map((entry) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-largest-${entry.id}`}>
                <span>{entry.pluginId}:{entry.key}</span>
                <strong>{entry.updatedByType} - {formatStorageBytes(entry.sizeBytes)}</strong>
              </div>
            ))}
            {pluginOperations.storageOperations.recentOperations.slice(0, 5).map((operation) => (
              <div className="operator-row tool-call-row" key={`plugin-storage-operation-${operation.id}`}>
                <span>{operation.pluginId ?? "unknown plugin"} {operation.key ?? operation.operation.replace("_", " ")}</span>
                <strong>
                  {operation.campaignId ? campaignName(props.campaigns, operation.campaignId) : "unknown campaign"} - {formatNumber(operation.setCount)} set / {formatNumber(operation.deleteCount)} deleted
                  {typeof operation.sizeBytes === "number" ? ` - ${formatStorageBytes(operation.sizeBytes)}` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.recentCommands.slice(0, 5).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>
                  {command.campaignId ? campaignName(props.campaigns, command.campaignId) : "unknown campaign"} - {formatDateTime(command.createdAt)}
                  {(command.storageMutation.set > 0 || command.storageMutation.deleted > 0) ? ` - storage ${formatNumber(command.storageMutation.set)} set / ${formatNumber(command.storageMutation.deleted)} deleted` : ""}
                </strong>
              </div>
            ))}
            {pluginOperations.installOperations.recentInstalls.slice(0, 5).map((install) => (
              <div className="operator-row tool-call-row" key={`plugin-install-${install.id}`}>
                <span>{install.pluginId ?? install.packageId ?? "unknown plugin"} {install.operation.replace("_", " ")}</span>
                <strong>
                  {install.campaignId ? campaignName(props.campaigns, install.campaignId) : "unknown campaign"} - v{install.version ?? "unknown"} - {formatNumber(install.grantedPermissionCount)} / {formatNumber(install.requestedPermissionCount)} permissions
                </strong>
              </div>
            ))}
            {pluginOperations.commandOperations.recentFailures.slice(0, 3).map((command) => (
              <div className="operator-row tool-call-row" key={`plugin-command-failure-${command.id}`}>
                <span>{command.pluginId ?? command.packageId ?? "unknown plugin"} {command.command ?? "command"}</span>
                <strong>{command.reason ?? "failed"} - {command.message ?? "no failure message"}</strong>
              </div>
            ))}
            <div className="admin-actions">
              <button className="ghost-button" title="Sync configured plugin registries" onClick={() => props.onSyncPluginRegistries().catch(console.error)} disabled={pluginOperations.registryOperations.configuredRegistryCount === 0}>
                <RefreshCw size={14} /> Sync registries
              </button>
            </div>
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Plugin marketplace reviews">
        <div className="operator-heading">
          <div className="section-title">Plugin Reviews</div>
          <strong>{pluginReviews ? `${pluginReviews.totals.pending} pending` : "not loaded"}</strong>
        </div>
        {!pluginReviews ? (
          <div className="empty-state compact">No plugin review data loaded.</div>
        ) : (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span>Policy</span>
                <strong>{pluginReviews.policy.mode}</strong>
              </div>
              <div className="admin-meta">
                <span>{pluginReviews.totals.approved} approved</span>
                <span>{pluginReviews.totals.rejected} rejected</span>
                <span>{pluginReviews.totals.blocked} blocked</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Review Packages" value={formatNumber(pluginReviews.plugins.length)} />
              <MetricTile label="Review Generation" value={pluginReviews.registryRevision.slice(0, 12)} />
              <MetricTile label="Review Policy" value={pluginReviews.policy.mode} />
              <MetricTile label="Pending Reviews" value={formatNumber(pluginReviews.totals.pending)} />
              <MetricTile label="Approved Reviews" value={formatNumber(pluginReviews.totals.approved)} />
              <MetricTile label="Rejected Reviews" value={formatNumber(pluginReviews.totals.rejected)} />
              <MetricTile label="Blocked Reviews" value={formatNumber(pluginReviews.totals.blocked)} />
              <MetricTile label="Review Sources" value={formatNumber(pluginReviewSourceCount)} />
              <MetricTile label="Review Trust States" value={formatNumber(pluginReviewTrustStatusCount)} />
              <MetricTile label="Installable Reviews" value={formatNumber(pluginReviews.plugins.filter((review) => review.installable).length)} />
              <MetricTile label="Blocked Installs" value={formatNumber(pluginReviews.plugins.filter((review) => review.installBlock).length)} />
            </div>
            {pluginReviews.plugins.length === 0 ? (
              <div className="empty-state compact">No plugin packages found.</div>
            ) : (
              pluginReviews.plugins.slice(0, 8).map((review) => (
                <article className="operator-item admin-item" key={review.review.reviewKey}>
                  <div className="operator-row">
                    <span className={`status-pill ${review.review.status === "approved" ? "completed" : review.review.status === "rejected" ? "failed" : "running"}`}>{review.review.status}</span>
                    <strong>{review.source.type} - {review.trust.status}</strong>
                  </div>
                  <h3>{review.plugin.name} v{review.plugin.version}</h3>
                  <p>{review.source.packageId} - {review.review.checksum.slice(0, 19)}</p>
                  <div className="admin-meta">
                    <span>{review.plugin.permissions.length} permissions</span>
                    <span>{review.distribution.availableVersions.length} versions</span>
                    <span>{review.installable ? "installable" : "blocked"}</span>
                  </div>
                  {review.installBlock && <p>{review.installBlock}</p>}
                  <div className="admin-actions">
                    <button className="ghost-button" title="Approve plugin package" onClick={() => props.onUpdatePluginReview(review, "approved").catch(console.error)} disabled={review.review.status === "approved"}>
                      <Check size={14} /> Approve
                    </button>
                    <button className="ghost-button" title="Reject plugin package" onClick={() => props.onUpdatePluginReview(review, "rejected").catch(console.error)} disabled={review.review.status === "rejected"}>
                      <UserX size={14} /> Reject
                    </button>
                    <button className="ghost-button" title="Reset plugin package review" onClick={() => props.onUpdatePluginReview(review, "pending").catch(console.error)} disabled={review.review.status === "pending"}>
                      <RefreshCw size={14} /> Reset
                    </button>
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </section>

      <section className="admin-section" aria-label="Active sessions">
        <div className="operator-heading">
          <div className="section-title">Sessions</div>
          <strong>{sessions.length}</strong>
        </div>
        {sessions.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Sessions" value={formatNumber(sessions.length)} />
            <MetricTile label="Session Users" value={formatNumber(new Set(sessions.map((session) => session.user.id)).size)} />
            <MetricTile label="Expiring Soon" value={formatNumber(expiringSoonSessionCount)} />
            <MetricTile label="Oldest Activity" value={oldestSessionLastSeenAt ? formatDateTime(oldestSessionLastSeenAt) : "none"} />
            <MetricTile label="Newest Activity" value={newestSessionLastSeenAt ? formatDateTime(newestSessionLastSeenAt) : "none"} />
          </div>
        )}
        {sessions.length === 0 ? (
          <div className="empty-state compact">No active sessions.</div>
        ) : (
          sessions.slice(0, 8).map((session) => (
            <article className="operator-item admin-item" key={session.id}>
              <div className="operator-row">
                <span>{session.user.displayName}</span>
                <strong>{formatDateTime(session.lastSeenAt)}</strong>
              </div>
              <p>{session.id} - expires {formatDateTime(session.expiresAt)}</p>
              <button className="ghost-button" title="Revoke session" onClick={() => props.onRevokeSession(session).catch(console.error)}>
                <UserX size={14} /> Revoke session
              </button>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Email outbox">
        <div className="operator-heading">
          <div className="section-title">Email Outbox</div>
          <strong>{emails.length}</strong>
        </div>
        {emails.length > 0 && (
          <div className="metric-grid">
            <MetricTile label="Loaded Emails" value={formatNumber(emails.length)} />
            <MetricTile label="Outbox Statuses" value={formatNumber(new Set(emails.map((email) => email.status)).size)} />
            <MetricTile label="Outbox Providers" value={formatNumber(new Set(emails.map((email) => email.provider ?? "unknown")).size)} />
            <MetricTile label="Loaded Pending" value={formatNumber(emails.filter((email) => email.status === "pending").length)} />
            <MetricTile label="Loaded Failed" value={formatNumber(emails.filter((email) => email.status === "failed").length)} />
            <MetricTile label="Loaded Delivered" value={formatNumber(emails.filter((email) => email.status === "delivered").length)} />
            <MetricTile label="Retryable Total" value={formatNumber(authOperations?.emailOutbox.retryableCount)} />
            <MetricTile label="Newest Email" value={newestEmailCreatedAt ? formatDateTime(newestEmailCreatedAt) : "none"} />
          </div>
        )}
        <div className="admin-actions">
          <button className="ghost-button" title="Retry all pending and failed email webhook deliveries" onClick={() => props.onRetryAllEmails().catch(console.error)} disabled={!authOperations?.emailOutbox.retryableCount || !authOperations.emailOutbox.webhookConfigured}>
            <RefreshCw size={14} /> Retry all
          </button>
        </div>
        {emails.length === 0 ? (
          <div className="empty-state compact">No queued emails.</div>
        ) : (
          emails.slice(0, 5).map((email) => (
            <article className="operator-item admin-item" key={email.id}>
              <div className="operator-row">
                <span className={`status-pill ${email.status === "failed" ? "failed" : email.status === "delivered" ? "completed" : "running"}`}>{email.status}</span>
                <strong>{email.provider}</strong>
              </div>
              <h3>{email.subject}</h3>
              <p>{email.to} - {formatDateTime(email.createdAt)}</p>
              <div className="admin-actions">
                <button className="ghost-button" title="Retry email webhook delivery" onClick={() => props.onRetryEmail(email).catch(console.error)} disabled={email.status === "delivered" || !authOperations?.emailOutbox.webhookConfigured}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="admin-section" aria-label="Audit log">
        <div className="operator-heading">
          <div className="section-title">Audit</div>
          <strong>{props.admin?.audit.count ?? 0}</strong>
        </div>
        {props.admin?.audit.summary && (
          <>
            <div className="operator-item admin-item">
              <div className="operator-row">
                <span className={`status-pill ${props.admin.audit.summary.actionRequired ? "running" : "completed"}`}>{props.admin.audit.summary.truncated ? "limited" : "complete sample"}</span>
                <strong>{formatNumber(props.admin.audit.summary.adminActionCount)} admin actions</strong>
              </div>
              <p>{props.admin.audit.summary.byAction.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no action rollups"}</p>
              <div className="admin-meta">
                <span>{props.admin.audit.summary.byTargetType.slice(0, 3).map((item) => `${item.code} (${formatNumber(item.count)})`).join(", ") || "no target rollups"}</span>
                <span>{props.admin.audit.summary.oldestReturnedAt ? `oldest ${formatDateTime(props.admin.audit.summary.oldestReturnedAt)}` : "no oldest timestamp"}</span>
              </div>
            </div>
            <div className="metric-grid">
              <MetricTile label="Audit Rows" value={formatNumber(props.admin.audit.count)} />
              <MetricTile label="Audit Action" value={props.admin.audit.summary.actionRequired ? "yes" : "no"} />
              <MetricTile label="Audit Truncated" value={props.admin.audit.summary.truncated ? "yes" : "no"} />
              <MetricTile label="Audit Remediations" value={formatNumber(props.admin.audit.summary.remediationQueue.length)} />
              <MetricTile label="Admin Actions" value={formatNumber(props.admin.audit.summary.adminActionCount)} />
              <MetricTile label="Audit Actions" value={formatNumber(props.admin.audit.summary.byAction.length)} />
              <MetricTile label="Audit Targets" value={formatNumber(props.admin.audit.summary.byTargetType.length)} />
              <MetricTile label="Audit Actors" value={formatNumber(props.admin.audit.summary.byActorType.length)} />
              <MetricTile label="Audit Campaigns" value={formatNumber(props.admin.audit.summary.byCampaign.length)} />
              <MetricTile label="Newest Audit" value={props.admin.audit.summary.newestReturnedAt ? formatDateTime(props.admin.audit.summary.newestReturnedAt) : "none"} />
            </div>
          </>
        )}
        <div className="admin-form-grid" aria-label="Audit export filters">
          <label>
            Action
            <input aria-label="Audit action filter" value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} placeholder="admin.storage.backup" />
          </label>
          <label>
            Target
            <input aria-label="Audit target filter" value={auditTargetTypeFilter} onChange={(event) => setAuditTargetTypeFilter(event.target.value)} placeholder="storage_backup" />
          </label>
          <label>
            Actor
            <select aria-label="Audit actor filter" value={auditActorTypeFilter} onChange={(event) => setAuditActorTypeFilter(event.target.value)}>
              <option value="">Any actor</option>
              <option value="user">User</option>
              <option value="system">System</option>
              <option value="plugin">Plugin</option>
            </select>
          </label>
          <label>
            Campaign
            <select aria-label="Audit campaign filter" value={auditCampaignFilter} onChange={(event) => setAuditCampaignFilter(event.target.value)}>
              <option value="">Any campaign</option>
              {props.campaigns.map((campaign) => (
                <option value={campaign.id} key={`audit-filter-${campaign.id}`}>{campaign.name}</option>
              ))}
            </select>
          </label>
          <label>
            Limit
            <input aria-label="Audit export limit" type="number" min="1" max="500" value={auditExportLimit} onChange={(event) => setAuditExportLimit(event.target.value)} />
          </label>
        </div>
        <div className="admin-actions">
          <button className="ghost-button" title="Export redacted audit logs using the selected filters" onClick={() => exportAuditLogs().catch(console.error)}>
            <Download size={14} /> Export Redacted JSON
          </button>
        </div>
        <p className="admin-status">{auditExportStatus}</p>
        {props.admin?.audit.summary.remediationQueue.slice(0, 2).map((item) => (
          <article className="operator-item admin-item" key={`audit-remediation-${item.code}`}>
            <div className="operator-row">
              <span className="status-pill running">{item.severity}</span>
              <strong>{formatNumber(item.affectedCount)} returned</strong>
            </div>
            <h3>{item.code.replaceAll("_", " ")}</h3>
            <p>{item.action}</p>
          </article>
        ))}
        {auditLogs.length === 0 ? (
          <div className="empty-state compact">No audit entries loaded.</div>
        ) : (
          auditLogs.slice(0, 6).map((entry) => (
            <article className="operator-item admin-item" key={entry.id}>
              <div className="operator-row">
                <span>{entry.action}</span>
                <strong>{formatDateTime(entry.createdAt)}</strong>
              </div>
              <p>{entry.actorUserId ?? entry.actorType} - {entry.targetType}{entry.targetId ? `/${entry.targetId}` : ""}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}


export function campaignName(campaigns: Campaign[], campaignId: string): string {
  return campaigns.find((campaign) => campaign.id === campaignId)?.name ?? campaignId;
}


export function scimMappingIdentity(mapping: AdminScimGroupRoleMapping): string {
  if (mapping.groupId) return `group id ${mapping.groupId}`;
  if (mapping.groupExternalId) return `external id ${mapping.groupExternalId}`;
  return `display name ${mapping.groupDisplayName ?? "unknown"}`;
}


export { aiToolCallErrorCode, scimMappingLabel } from "./admin-panel-utils.js";
