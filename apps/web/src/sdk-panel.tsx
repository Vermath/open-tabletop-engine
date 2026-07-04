import type { Actor } from "@open-tabletop/core";
import { ChevronLeft, ChevronRight, Eye, Plus, RefreshCw, RotateCcw, Shield, Swords, Upload, UserPlus, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { dnd5eSrdArcaneRecoverySelection } from "./actor-sheet-data.js";
import type { CharacterTemplateInfo, PluginRuntimeInfo, SystemRuntimeInfo } from "./api.js";
import { formatDateTime, formatNumber, registryHostLabel } from "./sheet-format.js";
import { systemAdvancementLabel, systemRollLabel, type AdvancementOptionInfo } from "./system-actions.js";


export function SdkPanel(props: { plugins: PluginRuntimeInfo[]; systems: SystemRuntimeInfo[]; characterTemplates: CharacterTemplateInfo[]; actor?: Actor; advancementOptions: AdvancementOptionInfo[]; advancementGrantsFeat: boolean; advancementFeats: Array<{ id: string; name: string; category: string; summary: string }>; multiclassOptions: Array<{ className: string; eligible: boolean; reasons: string[] }>; importedActor?: Actor; createdMonster?: Actor; onSyncPluginRegistries(): void; onInstallPlugin(plugin: PluginRuntimeInfo, version?: string): void; onInstallSystem(system: SystemRuntimeInfo): void; onCreateCharacter(template: CharacterTemplateInfo): void; onOpenCharacterCreator(): void; onImportCharacter(): void; onCreateMonster(): void; onAdvanceActor(optionId?: string, choices?: { featId?: string; abilityChoices?: Record<string, number>; multiclassInto?: string }): void; onRestActor(restType: "short" | "long", options?: { arcaneRecovery?: Record<string, number> }): void; onRunCommand(plugin: PluginRuntimeInfo, command: string): void; onSystemRoll(): void; canInstall: boolean; canInstallSystem: boolean; canCreateActor: boolean; canImportActor: boolean; canAdvanceActor: boolean; canRestActor: boolean; canRollSystem: boolean }) {
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginSourceFilter, setPluginSourceFilter] = useState<"all" | "local" | "registry">("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<"all" | "installed" | "available" | "upgrade">("all");
  const [pluginCoreFilter, setPluginCoreFilter] = useState<"all" | "compatible" | "incompatible">("all");
  const [advancementOptionId, setAdvancementOptionId] = useState("");
  const [advancementStep, setAdvancementStep] = useState<"choose" | "review">("choose");
  const [advancementConfirmed, setAdvancementConfirmed] = useState(false);
  const [advancementMode, setAdvancementMode] = useState<"level" | "multiclass">("level");
  const [selectedFeatId, setSelectedFeatId] = useState("");
  const [selectedMulticlass, setSelectedMulticlass] = useState("");
  const activeSystem = props.systems.find((system) => system.active) ?? props.systems[0];
  const rollLabel = systemRollLabel(props.actor?.systemId);
  const advancementLabel = systemAdvancementLabel(props.actor?.systemId);
  const selectedAdvancementOption = props.advancementOptions.find((option) => option.id === advancementOptionId) ?? props.advancementOptions[0];
  const arcaneRecovery = props.actor ? dnd5eSrdArcaneRecoverySelection(props.actor) : undefined;
  const systemEntrypointLabel = (system: SystemRuntimeInfo) => {
    const entrypoints = [system.entrypoints?.client ? "client" : undefined, system.entrypoints?.server ? "server" : undefined].filter(Boolean);
    return entrypoints.length > 0 ? entrypoints.join("/") : "none";
  };
  const systemSchemaLabel = (system: SystemRuntimeInfo) => {
    const schemas = [system.schemas?.actor ? "actor" : undefined, system.schemas?.item ? "item" : undefined].filter(Boolean);
    return schemas.length > 0 ? schemas.join("/") : "none";
  };
  const registryPlugins = props.plugins.filter((plugin) => plugin.source?.type === "registry");
  const installedPlugins = props.plugins.filter((plugin) => plugin.installed);
  const incompatiblePlugins = props.plugins.filter((plugin) => plugin.compatibleCore?.satisfied === false);
  const trustBlockedPlugins = props.plugins.filter((plugin) => !plugin.trust.installable);
  const reviewBlockedPlugins = props.plugins.filter((plugin) => plugin.marketplaceReview?.installable === false);
  const signatureWarningPlugins = props.plugins.filter((plugin) => !plugin.trust.signature?.verified);
  const marketplaceRiskSamples = props.plugins
    .filter((plugin) => !plugin.trust.installable || plugin.marketplaceReview?.installable === false || plugin.compatibleCore?.satisfied === false || !plugin.trust.signature?.verified || plugin.trust.errors.length > 0)
    .slice(0, 4);
  const registryHistory = Array.from(registryPlugins.reduce((entries, plugin) => {
    const registryUrl = plugin.source?.registryUrl ?? "untracked registry";
    const existing = entries.get(registryUrl) ?? { registryUrl, packageCount: 0, installedCount: 0, warningCount: 0, latestSyncedAt: undefined as string | undefined };
    const hasWarning = !plugin.trust.installable || plugin.marketplaceReview?.installable === false || plugin.compatibleCore?.satisfied === false || !plugin.trust.signature?.verified || plugin.trust.errors.length > 0;
    const syncedAt = plugin.source?.syncedAt;
    entries.set(registryUrl, {
      registryUrl,
      packageCount: existing.packageCount + 1,
      installedCount: existing.installedCount + (plugin.installed ? 1 : 0),
      warningCount: existing.warningCount + (hasWarning ? 1 : 0),
      latestSyncedAt: syncedAt && (!existing.latestSyncedAt || Date.parse(syncedAt) > Date.parse(existing.latestSyncedAt)) ? syncedAt : existing.latestSyncedAt
    });
    return entries;
  }, new Map<string, { registryUrl: string; packageCount: number; installedCount: number; warningCount: number; latestSyncedAt?: string }>()).values()).sort((left, right) => registryHostLabel(left.registryUrl).localeCompare(registryHostLabel(right.registryUrl)));
  const commandCount = props.plugins.reduce((total, plugin) => total + (plugin.chatCommands?.length ?? 0), 0);
  const normalizedPluginSearch = pluginSearch.trim().toLocaleLowerCase();
  const filteredPlugins = props.plugins.filter((plugin) => {
    const sourceType = plugin.source?.type === "registry" ? "registry" : "local";
    if (pluginSourceFilter !== "all" && sourceType !== pluginSourceFilter) return false;
    if (pluginStatusFilter === "installed" && !plugin.installed) return false;
    if (pluginStatusFilter === "available" && plugin.installed) return false;
    if (pluginStatusFilter === "upgrade" && !plugin.updateAvailable) return false;
    if (pluginCoreFilter === "compatible" && plugin.compatibleCore?.satisfied === false) return false;
    if (pluginCoreFilter === "incompatible" && plugin.compatibleCore?.satisfied !== false) return false;
    if (!normalizedPluginSearch) return true;
    return [
      plugin.name,
      plugin.id,
      plugin.version,
      plugin.source?.packageId ?? "",
      plugin.source?.registryUrl ?? "",
      plugin.compatibleCore?.range ?? "",
      plugin.compatibleCore?.coreVersion ?? "",
      plugin.compatibleCore?.satisfied === false ? "incompatible core blocked" : "compatible core",
      plugin.marketplaceReview?.review.status ?? "",
      ...plugin.permissions
    ].some((value) => value.toLocaleLowerCase().includes(normalizedPluginSearch));
  });
  useEffect(() => {
    if (props.advancementOptions.length === 0) {
      if (advancementOptionId) setAdvancementOptionId("");
      setAdvancementStep("choose");
      setAdvancementConfirmed(false);
      return;
    }
    if (!props.advancementOptions.some((option) => option.id === advancementOptionId)) setAdvancementOptionId(props.advancementOptions[0]!.id);
  }, [props.advancementOptions, advancementOptionId]);
  useEffect(() => {
    setAdvancementStep("choose");
    setAdvancementConfirmed(false);
  }, [selectedAdvancementOption?.id, props.actor?.id]);
  return (
    <div className="panel-stack">
      <div className="section-title">Runtime SDK</div>
      <div className="metric-row">
        <span>Plugin Marketplace</span>
        <strong>{formatNumber(props.plugins.length)} packages</strong>
      </div>
      <div className="metric-row">
        <span>Registry Browser</span>
        <strong>{formatNumber(registryPlugins.length)} registry packages</strong>
      </div>
      <div className="admin-meta">
        <span>{formatNumber(installedPlugins.length)} installed</span>
        <span>{formatNumber(commandCount)} commands</span>
        <span>{formatNumber(props.plugins.filter((plugin) => plugin.updateAvailable).length)} upgrades</span>
        <span>{formatNumber(incompatiblePlugins.length)} incompatible</span>
      </div>
      <button className="ghost-button wide" type="button" onClick={props.onSyncPluginRegistries} disabled={!props.canInstall}>
        <RefreshCw size={16} /> Sync marketplace registries
      </button>
      <details className="create-drawer diagnostics-drawer" aria-label="Plugin marketplace risk review">
        <summary><Shield size={15} /> Marketplace risk review <strong>{formatNumber(marketplaceRiskSamples.length)} flagged</strong></summary>
        <p className="panel-status-line">
          <span>{formatNumber(trustBlockedPlugins.length)} trust blocked</span>
          <span>{formatNumber(reviewBlockedPlugins.length)} review blocked</span>
          <span>{formatNumber(incompatiblePlugins.length)} core blocked</span>
          <span>{formatNumber(signatureWarningPlugins.length)} signature warnings</span>
        </p>
        {marketplaceRiskSamples.length === 0 ? (
          <div className="empty-state compact">No marketplace trust, review, core, or signature warnings in the current catalog.</div>
        ) : (
          <div className="asset-pressure-list">
            {marketplaceRiskSamples.map((plugin) => (
              <div className="operator-row tool-call-row" key={`marketplace-risk-${plugin.id}`}>
                <span>{plugin.name}</span>
                <strong>{[
                  !plugin.trust.installable ? "trust blocked" : undefined,
                  plugin.marketplaceReview?.installable === false ? "review blocked" : undefined,
                  plugin.compatibleCore?.satisfied === false ? "core blocked" : undefined,
                  !plugin.trust.signature?.verified ? "signature warning" : undefined,
                  ...plugin.trust.errors
                ].filter(Boolean).join(", ")}</strong>
              </div>
            ))}
          </div>
        )}
      </details>
      <details className="create-drawer diagnostics-drawer" aria-label="Plugin registry history">
        <summary><RefreshCw size={15} /> Registry history <strong>{formatNumber(registryHistory.length)} sources</strong></summary>
        <p className="panel-status-line">
          <span>{formatNumber(registryPlugins.length)} registry packages</span>
          <span>{formatNumber(registryPlugins.filter((plugin) => plugin.installed).length)} installed</span>
          <span>{formatNumber(registryHistory.reduce((total, registry) => total + registry.warningCount, 0))} warnings</span>
        </p>
        {registryHistory.length === 0 ? (
          <div className="empty-state compact">No registry package history is present in the current catalog; last sync is unknown.</div>
        ) : (
          <div className="asset-pressure-list">
            {registryHistory.map((registry) => (
              <div className="operator-row tool-call-row" key={`marketplace-registry-${registry.registryUrl}`}>
                <span>{registryHostLabel(registry.registryUrl)}</span>
                <strong>{formatNumber(registry.packageCount)} packages - {formatNumber(registry.installedCount)} installed - {formatNumber(registry.warningCount)} warnings - last sync {registry.latestSyncedAt ? formatDateTime(registry.latestSyncedAt) : "unknown"}</strong>
              </div>
            ))}
          </div>
        )}
      </details>
      <section className="operator-section content-import-form" aria-label="Plugin marketplace filters">
        <div className="admin-form-grid">
          <label>
            <span>Search</span>
            <input aria-label="Plugin marketplace search" value={pluginSearch} placeholder="Plugin, package, permission" onChange={(event) => setPluginSearch(event.target.value)} />
          </label>
          <label>
            <span>Source</span>
            <select aria-label="Plugin marketplace source filter" value={pluginSourceFilter} onChange={(event) => setPluginSourceFilter(event.target.value as typeof pluginSourceFilter)}>
              <option value="all">All sources</option>
              <option value="local">Local packages</option>
              <option value="registry">Registry packages</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select aria-label="Plugin marketplace status filter" value={pluginStatusFilter} onChange={(event) => setPluginStatusFilter(event.target.value as typeof pluginStatusFilter)}>
              <option value="all">All packages</option>
              <option value="installed">Installed</option>
              <option value="available">Available</option>
              <option value="upgrade">Upgrade ready</option>
            </select>
          </label>
          <label>
            <span>Core</span>
            <select aria-label="Plugin marketplace core filter" value={pluginCoreFilter} onChange={(event) => setPluginCoreFilter(event.target.value as typeof pluginCoreFilter)}>
              <option value="all">All core ranges</option>
              <option value="compatible">Compatible core</option>
              <option value="incompatible">Incompatible core</option>
            </select>
          </label>
        </div>
        <p className="panel-subtitle">{formatNumber(filteredPlugins.length)} of {formatNumber(props.plugins.length)} packages shown</p>
      </section>
      {filteredPlugins.map((plugin) => {
        const compatibilityBlock = plugin.compatibilityBlock ?? (plugin.compatibleCore?.satisfied === false ? `Plugin requires core ${plugin.compatibleCore.range}; server core is ${plugin.compatibleCore.coreVersion}` : undefined);
        const pluginActionBaseEnabled = props.canInstall && plugin.trust.installable && plugin.marketplaceReview?.installable !== false;
        const pluginCommandBlock = !plugin.trust.installable || plugin.marketplaceReview?.installable === false || Boolean(compatibilityBlock);
        const versionCompatibility = plugin.versionCompatibility ?? [];
        const compatibleVersionCount = versionCompatibility.length > 0 ? versionCompatibility.filter((version) => version.compatibleCore.satisfied).length : plugin.distribution.availableVersions.length;
        const blockedVersionCount = versionCompatibility.filter((version) => !version.compatibleCore.satisfied).length;
        const targetVersionBlock = (version: string): string | undefined => {
          const versionInfo = versionCompatibility.find((candidate) => candidate.version === version);
          if (!versionInfo) return undefined;
          return versionInfo.compatibilityBlock ?? (versionInfo.compatibleCore.satisfied ? undefined : `Plugin requires core ${versionInfo.compatibleCore.range}; server core is ${versionInfo.compatibleCore.coreVersion}`);
        };
        const canInstallVersion = (version: string) => pluginActionBaseEnabled && !targetVersionBlock(version);
        return (
          <article className="proposal" key={plugin.id}>
            <span>{plugin.installed ? "installed plugin" : "available plugin"}</span>
            <h3>{plugin.name}</h3>
            <p>{plugin.source ? `${plugin.source.packageId} - ${plugin.source.sandbox} sandbox - v${plugin.version}` : `local package - v${plugin.version}`}</p>
            <div className="admin-meta">
              <span>Source: {plugin.source?.type ?? "local"}</span>
              <span>Package: {plugin.source?.packageId ?? plugin.id}</span>
              <span>Synced: {plugin.source?.syncedAt ? formatDateTime(plugin.source.syncedAt) : "bundled"}</span>
            </div>
            {(plugin.source?.registryUrl || plugin.source?.packageUrl) && (
              <p>{[plugin.source.registryUrl ? `Registry ${plugin.source.registryUrl}` : undefined, plugin.source.packageUrl ? `Package ${plugin.source.packageUrl}` : undefined].filter(Boolean).join(" - ")}</p>
            )}
            <div className="admin-meta">
              <span>Trust: {plugin.trust.status}</span>
              <span>Policy: {plugin.trust.policy}</span>
              <span>Review: {plugin.marketplaceReview?.review.status ?? "not required"}</span>
            </div>
            <div className="admin-meta">
              <span>Signature: {plugin.trust.signature ? `${plugin.trust.signature.verified ? "verified" : "unverified"}${plugin.trust.signature.keyId ? ` ${plugin.trust.signature.keyId}` : ""}` : "not signed"}</span>
              <span>Checksum: {plugin.source?.checksum?.slice(0, 12) ?? plugin.source?.manifestChecksum?.slice(0, 12) ?? "unavailable"}</span>
              <span>Sandbox: {plugin.source?.sandbox ?? "manifest"}</span>
            </div>
            <p>Permission review: {(plugin.permissionReview?.requestedPermissions ?? plugin.permissions).join(", ") || "none requested"}</p>
            <div className="admin-meta">
              <span>{formatNumber(plugin.grantedPermissions.length)} granted</span>
              <span>{formatNumber(plugin.missingPermissions.length)} missing</span>
              <span>{plugin.permissionReview?.grantRequired ? "grant required" : "grant current"}</span>
            </div>
            <p>Audit history: {formatNumber(plugin.audit?.installCount ?? 0)} plugin.install rows{plugin.audit?.lastInstallAt ? `; latest ${formatDateTime(plugin.audit.lastInstallAt)}` : ""}{plugin.audit?.versions.length ? `; versions ${plugin.audit.versions.join(", ")}` : ""}</p>
            <p>Compatibility: latest {plugin.distribution.latestVersion}; {plugin.updateAvailable ? "upgrade available" : "current version"}; rollback {plugin.rollbackVersions.length > 0 ? plugin.rollbackVersions.join(", ") : "none"}</p>
            <div className="admin-meta">
              <span>Core: {plugin.compatibleCore?.range ?? "unspecified"} on {plugin.compatibleCore?.coreVersion ?? "current"}</span>
              <span className={`status-pill ${plugin.compatibleCore?.satisfied === false ? "failed" : "completed"}`}>{plugin.compatibleCore?.satisfied === false ? "core incompatible" : "core compatible"}</span>
              <span>Versions: {formatNumber(compatibleVersionCount)} compatible, {formatNumber(blockedVersionCount)} blocked</span>
            </div>
            {compatibilityBlock && <p>{compatibilityBlock}</p>}
            {plugin.trust.errors.length > 0 && <p>{plugin.trust.errors.join(", ")}</p>}
            {!plugin.installed ? (
              <div className="admin-actions">
                <button className="ghost-button" onClick={() => props.onInstallPlugin(plugin)} disabled={!canInstallVersion(plugin.distribution.latestVersion)}>
                  <Plus size={15} /> Review and install
                </button>
                {plugin.distribution.availableVersions.filter((version) => version !== plugin.distribution.latestVersion).map((version) => (
                  <button className="ghost-button" type="button" key={`${plugin.id}-install-${version}`} onClick={() => props.onInstallPlugin(plugin, version)} disabled={!canInstallVersion(version)}>
                    <Plus size={15} /> Install {version}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="admin-meta">
                  <span>Installed v{plugin.installedVersion ?? plugin.version}</span>
                  <span>{plugin.updateAvailable ? "upgrade ready" : "no upgrade"}</span>
                  <span>{plugin.rollbackVersions.length > 0 ? "rollback ready" : "no rollback"}</span>
                </div>
                <div className="admin-actions">
                  <button className="ghost-button" type="button" onClick={() => props.onInstallPlugin(plugin, plugin.distribution.latestVersion)} disabled={!canInstallVersion(plugin.distribution.latestVersion) || !plugin.updateAvailable}>
                    <RefreshCw size={15} /> Upgrade to {plugin.distribution.latestVersion}
                  </button>
                  {plugin.rollbackVersions.map((version) => (
                    <button className="ghost-button" type="button" key={`${plugin.id}-rollback-${version}`} onClick={() => props.onInstallPlugin(plugin, version)} disabled={!canInstallVersion(version)}>
                      <RotateCcw size={15} /> Roll back to {version}
                    </button>
                  ))}
                </div>
                {plugin.chatCommands?.map((command) => (
                  <button className="ghost-button" key={command.command} onClick={() => props.onRunCommand(plugin, command.command)} disabled={pluginCommandBlock}>
                    <WandSparkles size={15} /> {command.command}
                  </button>
                ))}
              </>
            )}
          </article>
        );
      })}
      <div className="metric-row">
        <span>Active System</span>
        <strong>{activeSystem?.name ?? "No system"}</strong>
      </div>
      <div className="section-title">System Registry</div>
      {props.systems.map((system) => (
        <article className="proposal" key={system.id}>
          <span>{system.active ? "active system" : "available system"}</span>
          <h3>{system.name}</h3>
          <p>Manifest validation: bundled and loadable - v{system.version}</p>
          <div className="admin-meta">
            <span>Compendium: {system.id.includes("dnd") ? "SRD entries" : "starter entries"}</span>
            <span>Core: {system.compatibleCore ?? "unspecified"}</span>
            <span>Entrypoints: {systemEntrypointLabel(system)}</span>
            <span>Schemas: {systemSchemaLabel(system)}</span>
            <span>Permissions: {formatNumber(system.permissions?.length ?? 0)}</span>
            <span>Migration: no campaign migration required</span>
            <span>Activation impact: campaign default rules system</span>
          </div>
          {!system.active && (
            <button className="ghost-button" onClick={() => props.onInstallSystem(system)} disabled={!props.canInstallSystem}>
              <Plus size={15} /> Activate
            </button>
          )}
        </article>
      ))}
      <button className="ghost-button wide" type="button" onClick={() => props.onOpenCharacterCreator()} disabled={!props.canCreateActor}>
        <UserPlus size={15} /> Open character creator
      </button>
      {props.characterTemplates.map((template) => (
        <article className="proposal" key={template.id}>
          <span>character template</span>
          <h3>{template.name}</h3>
          <p>{template.summary}</p>
          <button className="ghost-button" onClick={() => props.onCreateCharacter(template)} disabled={!props.canCreateActor}>
            <Plus size={15} /> Quick create
          </button>
        </article>
      ))}
      <div className="metric-row">
        <span>Sheet Actor</span>
        <strong>{props.actor?.name ?? "No actor"}</strong>
      </div>
      <section className="operator-section content-import-form" aria-label="Actor advancement choices">
        <div className="operator-heading">
          <div className="section-title">Advancement</div>
          <strong>{formatNumber(props.advancementOptions.length)} choices</strong>
        </div>
        {props.advancementOptions.length === 0 ? (
          <div className="empty-state compact">No advancement choices are available for this actor.</div>
        ) : (
          <>
            <label>
              <span>Choice</span>
              <select aria-label="Advancement option" value={selectedAdvancementOption?.id ?? ""} disabled={!props.canAdvanceActor} onChange={(event) => setAdvancementOptionId(event.target.value)}>
                {props.advancementOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="admin-meta">
              <span>{selectedAdvancementOption?.summary ?? "No advancement selected"}</span>
              {selectedAdvancementOption && <span>next {formatNumber(selectedAdvancementOption.nextValue)}</span>}
            </div>
            {props.multiclassOptions.length > 0 && (
              <div className="segmented-control" role="group" aria-label="Advancement type">
                <button className={advancementMode === "level" ? "active" : ""} type="button" onClick={() => setAdvancementMode("level")}>Level up class</button>
                <button className={advancementMode === "multiclass" ? "active" : ""} type="button" onClick={() => setAdvancementMode("multiclass")}>Multiclass</button>
              </div>
            )}
            {advancementMode === "level" && props.advancementGrantsFeat && props.advancementFeats.length > 0 && (
              <label>
                <span>Feat or Ability Score Improvement</span>
                <select aria-label="Advancement feat" value={selectedFeatId} disabled={!props.canAdvanceActor} onChange={(event) => setSelectedFeatId(event.target.value)}>
                  <option value="">Choose later</option>
                  {props.advancementFeats.map((feat) => (
                    <option key={feat.id} value={feat.id}>{feat.name}</option>
                  ))}
                </select>
              </label>
            )}
            {advancementMode === "multiclass" && (
              <label>
                <span>Add a level in</span>
                <select aria-label="Multiclass into" value={selectedMulticlass} disabled={!props.canAdvanceActor} onChange={(event) => setSelectedMulticlass(event.target.value)}>
                  <option value="">Select a class</option>
                  {props.multiclassOptions.map((option) => (
                    <option key={option.className} value={option.className} disabled={!option.eligible}>
                      {option.className}{option.eligible ? "" : " (ineligible)"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {advancementMode === "multiclass" && selectedMulticlass && (
              <div className="admin-meta">
                <span>{props.multiclassOptions.find((option) => option.className === selectedMulticlass)?.eligible ? `Adds a level of ${selectedMulticlass} using the shared multiclass spell-slot table.` : props.multiclassOptions.find((option) => option.className === selectedMulticlass)?.reasons[0] ?? "Ineligible"}</span>
              </div>
            )}
            <div className="button-row">
              <button className="ghost-button" type="button" disabled={!props.actor || !props.canAdvanceActor || !selectedAdvancementOption || (advancementMode === "multiclass" && !selectedMulticlass)} onClick={() => setAdvancementStep("review")}>
                <Eye size={14} /> Review advancement
              </button>
              {advancementStep === "review" && (
                <button className="ghost-button" type="button" onClick={() => setAdvancementStep("choose")}>
                  <ChevronLeft size={14} /> Back to choice
                </button>
              )}
            </div>
            {advancementStep === "review" && selectedAdvancementOption && (
              <div className="asset-pressure-list" role="region" aria-label="Advancement review step">
                <div className="operator-row tool-call-row">
                  <span>Actor</span>
                  <strong>{props.actor?.name ?? "No actor"}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Advancement</span>
                  <strong>{selectedAdvancementOption.name}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Next value</span>
                  <strong>{formatNumber(selectedAdvancementOption.nextValue)}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Review</span>
                  <strong>{selectedAdvancementOption.summary}</strong>
                </div>
                <label className="inline-check">
                  <input aria-label="Confirm advancement review" type="checkbox" checked={advancementConfirmed} onChange={(event) => setAdvancementConfirmed(event.target.checked)} />
                  <span>Reviewed advancement changes</span>
                </label>
              </div>
            )}
          </>
        )}
      </section>
      <button className="ghost-button wide" onClick={props.onImportCharacter} disabled={!activeSystem || !props.canImportActor}>
        <Upload size={16} /> Import Character
      </button>
      {props.importedActor && (
        <div className="metric-row">
          <span>Imported Character</span>
          <strong>{props.importedActor.name}</strong>
        </div>
      )}
      <button className="ghost-button wide" onClick={props.onCreateMonster} disabled={!activeSystem || activeSystem.id !== "dnd-5e-srd" || !props.canCreateActor}>
        <Swords size={16} /> Create Monster
      </button>
      {props.createdMonster && (
        <div className="metric-row">
          <span>Created Monster</span>
          <strong>{props.createdMonster.name}</strong>
        </div>
      )}
      <button className="ghost-button wide" onClick={() => {
        props.onAdvanceActor(selectedAdvancementOption?.id, advancementMode === "multiclass"
          ? { multiclassInto: selectedMulticlass }
          : selectedFeatId ? { featId: selectedFeatId } : {});
        setAdvancementStep("choose");
        setAdvancementConfirmed(false);
        setSelectedFeatId("");
        setSelectedMulticlass("");
      }} disabled={!props.actor || !props.canAdvanceActor || props.advancementOptions.length === 0 || advancementStep !== "review" || !advancementConfirmed || (advancementMode === "multiclass" && !selectedMulticlass)}>
        <RefreshCw size={16} /> {advancementMode === "multiclass" ? "Multiclass" : advancementLabel}
      </button>
      <button className="ghost-button wide" onClick={() => props.onRestActor("short")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Short Rest
      </button>
      {arcaneRecovery && (
        <button className="ghost-button wide" onClick={() => props.onRestActor("short", { arcaneRecovery })} disabled={!props.actor || !props.canRestActor}>
          <RefreshCw size={16} /> Arcane Recovery
        </button>
      )}
      <button className="ghost-button wide" onClick={() => props.onRestActor("long")} disabled={!props.actor || !props.canRestActor}>
        <RefreshCw size={16} /> Long Rest
      </button>
      <button className="primary-button wide" onClick={props.onSystemRoll} disabled={!props.actor || !props.canRollSystem}>
        <ChevronRight size={16} /> {rollLabel}
      </button>
    </div>
  );
}
