import type { ContentImportBatch, ContentImportEntityKind, ContentImportSource, MapAsset, Scene } from "@open-tabletop/core";
import { Boxes, Check, ChevronDown, ChevronRight, Download, Eye, FileText, Image as ImageIcon, MapPin, Plus, RefreshCw, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { assetFolderBreadcrumbsFor, assetFolderPathOptions, assetMatchesFolderFilter, childAssetFolderOptions, contentImportAdapterEntities, contentImportAdapterPresets, contentImportPreviewSource, type AssetLifecycleStatus, type ContentImportAdapterPresetId, type ContentImportDraftEntity, type ContentImportPreviewSource, type FailedAssetUpload } from "./content-import-data.js";
import { assetBlobUrl, type CampaignAssetStorageInfo } from "./api.js";
import { formatPercent, formatStorageBytes, contentImportStatusClass, formatDateTime, formatNumber, titleCaseLabel } from "./sheet-format.js";
import { setTokenDropPreview, writeTokenDropData } from "./token-drag.js";


export function ContentImportPanel(props: {
  assets: MapAsset[];
  assetStorage?: CampaignAssetStorageInfo;
  selectedScene?: Scene;
  assetSearch: string;
  setAssetSearch(value: string): void;
  assetFolder: string;
  setAssetFolder(value: string): void;
  assetTags: string;
  setAssetTags(value: string): void;
  assetStatus: string;
  failedAssetUpload?: FailedAssetUpload;
  onRetryFailedAssetUpload(): Promise<void>;
  onDismissFailedAssetUpload(): void;
  lifecycleReason: string;
  setLifecycleReason(value: string): void;
  onUploadAsset(file: File, setAsBackground: boolean): Promise<void>;
  onSetSceneBackground(asset: MapAsset): Promise<void>;
  onPlaceAssetToken(asset: MapAsset): Promise<void>;
  onUpdateAssetMetadata(asset: MapAsset, input: { name: string; folder: string; tags: string }): Promise<void>;
  onUpdateAssetLifecycle(asset: MapAsset, status: AssetLifecycleStatus): Promise<void>;
  onCreateAssetDeliveryUrl(asset: MapAsset): Promise<void>;
  imports: ContentImportBatch[];
  kind: ContentImportEntityKind;
  setKind(kind: ContentImportEntityKind): void;
  name: string;
  setName(value: string): void;
  body: string;
  setBody(value: string): void;
  status: string;
  onPreview(entities?: ContentImportDraftEntity[], source?: ContentImportPreviewSource): Promise<void>;
  onAnalyzePdf(file: File): Promise<void>;
  onApply(batch: ContentImportBatch, selectedEntityIds?: string[]): Promise<void>;
  onRollback(batch: ContentImportBatch): Promise<void>;
  onDelete(batch: ContentImportBatch): Promise<void>;
  canManage: boolean;
  canCreateAsset: boolean;
  canUpdateScene: boolean;
  canCreateToken: boolean;
}) {
  const kinds: ContentImportEntityKind[] = ["journal", "handout", "actor", "item", "encounter"];
  const [assetFolderFilter, setAssetFolderFilter] = useState("all");
  const [assetLifecycleFilter, setAssetLifecycleFilter] = useState<AssetLifecycleStatus | "all">("all");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [importSelections, setImportSelections] = useState<Record<string, string[]>>({});
  const [draftEntities, setDraftEntities] = useState<ContentImportDraftEntity[]>([]);
  const [adapterPresetId, setAdapterPresetId] = useState<ContentImportAdapterPresetId>("manual");
  const [adapterSourceName, setAdapterSourceName] = useState("");
  const [adapterSourceUrl, setAdapterSourceUrl] = useState("");
  const [adapterConfig, setAdapterConfig] = useState("columns=name,body;delimiter=,;kind=item");
  const [pdfFile, setPdfFile] = useState<File | undefined>();
  const assetFolderOptions = useMemo(
    () => [...new Set(props.assets.flatMap((asset) => assetFolderPathOptions(asset.folder)))].sort((left, right) => left.localeCompare(right)),
    [props.assets]
  );
  const assetFolderChildren = useMemo(() => childAssetFolderOptions(assetFolderOptions, assetFolderFilter, props.assets), [assetFolderOptions, assetFolderFilter, props.assets]);
  const assetFolderBreadcrumbs = useMemo(() => assetFolderBreadcrumbsFor(assetFolderFilter), [assetFolderFilter]);
  useEffect(() => {
    if (assetFolderFilter !== "all" && !assetFolderOptions.includes(assetFolderFilter)) setAssetFolderFilter("all");
  }, [assetFolderFilter, assetFolderOptions]);
  useEffect(() => {
    const currentAssetIds = new Set(props.assets.map((asset) => asset.id));
    setSelectedAssetIds((current) => current.filter((assetId) => currentAssetIds.has(assetId)));
  }, [props.assets]);
  useEffect(() => {
    setImportSelections((current) => {
      const next: Record<string, string[]> = {};
      for (const batch of props.imports) {
        next[batch.id] = current[batch.id] ?? (batch.selectedEntityIds.length > 0 ? batch.selectedEntityIds : batch.entities.filter((entity) => entity.selectedByDefault).map((entity) => entity.id));
      }
      return next;
    });
  }, [props.imports]);
  const normalizedSearch = props.assetSearch.trim().toLocaleLowerCase();
  const archivedAssets = props.assets.filter((asset) => asset.lifecycle?.status === "archived");
  const deletedAssets = props.assets.filter((asset) => asset.lifecycle?.status === "deleted");
  const recoverableAssets = [...archivedAssets, ...deletedAssets].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const filteredAssets = props.assets.filter((asset) => {
    if (!assetMatchesFolderFilter(asset, assetFolderFilter)) return false;
    const lifecycle = asset.lifecycle?.status ?? "active";
    if (assetLifecycleFilter !== "all" && lifecycle !== assetLifecycleFilter) return false;
    if (!normalizedSearch) return true;
    const scan = asset.security?.status ?? "unscanned";
    return [asset.name, asset.mimeType, lifecycle, scan, asset.folder ?? "", ...(asset.tags ?? [])].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
  });
  const visibleAssetIds = filteredAssets.map((asset) => asset.id);
  const selectedAssets = props.assets.filter((asset) => selectedAssetIds.includes(asset.id));
  const allVisibleAssetsSelected = visibleAssetIds.length > 0 && visibleAssetIds.every((assetId) => selectedAssetIds.includes(assetId));
  const activeAssetCount = props.assets.filter((asset) => asset.lifecycle?.status !== "deleted").length;
  const totalAssetBytes = props.assets.reduce((total, asset) => total + asset.sizeBytes, 0);
  const storageUsedBytes = props.assetStorage?.usedBytes ?? totalAssetBytes;
  const quotaBytes = props.assetStorage?.quotaBytes;
  const quotaRemainingBytes = quotaBytes === undefined ? undefined : Math.max(0, quotaBytes - storageUsedBytes);
  const quotaRatio = quotaBytes && quotaBytes > 0 ? Math.min(1, storageUsedBytes / quotaBytes) : 0;
  const quotaPercent = quotaBytes && quotaBytes > 0 ? formatPercent(quotaRatio) : "n/a";
  const quotaRiskLabel = quotaBytes === undefined ? "not configured" : quotaRatio >= 1 ? "blocked" : quotaRatio >= 0.9 ? "critical" : quotaRatio >= 0.75 ? "watch" : "healthy";
  const quotaRecommendedAction = quotaBytes === undefined
    ? "Set OTTE_ASSET_STORAGE_QUOTA_BYTES before hosting shared campaigns."
    : quotaRatio >= 0.9
      ? "Archive or delete large inactive assets before more uploads."
      : quotaRatio >= 0.75
        ? "Review largest assets and stale archived content before the next map upload."
        : "No quota cleanup needed for current campaign usage.";
  const largestAssets = props.assetStorage?.largestAssets ?? [];
  const largestAsset = largestAssets[0];
  const lifecycleEntries = Object.entries(props.assetStorage?.lifecycleCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const providerEntries = Object.entries(props.assetStorage?.providerCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const delivery = props.assetStorage?.delivery;
  const visibleImageAssetCount = filteredAssets.filter((asset) => asset.mimeType.startsWith("image/") && asset.lifecycle?.status !== "deleted").length;
  const storageSummary = quotaBytes === undefined ? `${formatStorageBytes(storageUsedBytes)} stored` : `${formatStorageBytes(storageUsedBytes)} / ${formatStorageBytes(quotaBytes)}`;
  const deliveryStatusLabel = delivery?.actionRequired ? "Needs attention" : delivery ? "Ready" : "Unknown";
  const hasRecoverableAssets = recoverableAssets.length > 0;
  const hasAssetDiagnostics = largestAssets.length > 0 || Boolean(delivery) || lifecycleEntries.length > 0 || providerEntries.length > 0;
  const hasAssetActivityStatus = props.assetStatus !== "No asset action this session";
  const isFilteringAssets = Boolean(normalizedSearch) || assetFolderFilter !== "all" || assetLifecycleFilter !== "all";
  const uploadInputId = "asset-library-upload";
  const backgroundInputId = "asset-library-background-upload";
  const pdfInputId = "content-import-pdf-upload";
  const currentDraftEntity = { kind: props.kind, name: props.name.trim(), body: props.body };
  const selectedAdapterPreset = contentImportAdapterPresets.find((preset) => preset.id === adapterPresetId) ?? contentImportAdapterPresets[0]!;
  const adapterEntities = contentImportAdapterEntities(adapterPresetId, props.body, currentDraftEntity, adapterConfig);
  const previewEntities = adapterPresetId === "manual" ? (currentDraftEntity.name ? [...draftEntities, currentDraftEntity] : draftEntities) : adapterEntities;
  const previewSource = contentImportPreviewSource(selectedAdapterPreset, adapterSourceName, adapterSourceUrl, adapterConfig);
  useEffect(() => {
    const preset = contentImportAdapterPresets.find((candidate) => candidate.id === adapterPresetId) ?? contentImportAdapterPresets[0]!;
    setAdapterSourceName(preset.sourceName);
    setAdapterConfig(preset.id === "csv_items" ? "columns=name,body;delimiter=,;kind=item" : preset.id === "srd_json" ? "entries[].name,entries[].summary" : "");
  }, [adapterPresetId]);
  function addDraftEntity() {
    if (!currentDraftEntity.name) return;
    setDraftEntities((current) => [...current, currentDraftEntity]);
    props.setName("");
    props.setBody("");
  }
  function setAssetSelected(assetId: string, selected: boolean) {
    setSelectedAssetIds((current) => {
      if (selected) return current.includes(assetId) ? current : [...current, assetId];
      return current.filter((currentAssetId) => currentAssetId !== assetId);
    });
  }
  function setVisibleAssetsSelected(selected: boolean) {
    setSelectedAssetIds((current) => {
      const visible = new Set(visibleAssetIds);
      if (!selected) return current.filter((assetId) => !visible.has(assetId));
      return [...new Set([...current, ...visibleAssetIds])];
    });
  }
  async function updateSelectedAssetLifecycle(status: AssetLifecycleStatus) {
    for (const asset of selectedAssets) {
      await props.onUpdateAssetLifecycle(asset, status);
    }
    setSelectedAssetIds([]);
  }
  return (
    <div className="panel-stack content-manager">
      <section className="operator-section asset-library asset-library-clean" aria-label="Asset library">
        <div className="asset-library-header">
          <div>
            <div className="section-title">Assets</div>
            <h2>Asset manager</h2>
          </div>
          <div className="asset-primary-actions">
            <button className="primary-button" type="button" aria-label="Upload Asset" disabled={!props.canCreateAsset} title={props.canCreateAsset ? "Upload an asset" : "Requires scene.create"} onClick={() => document.getElementById(uploadInputId)?.click()}>
              <Upload size={16} /> Upload
            </button>
            <button className="ghost-button" type="button" aria-label="Upload Background" disabled={!props.canCreateAsset || !props.canUpdateScene || !props.selectedScene} title={props.selectedScene ? "Upload and set as current scene background" : "Select a scene first"} onClick={() => document.getElementById(backgroundInputId)?.click()}>
              <ImageIcon size={16} /> Background
            </button>
          </div>
        </div>
        <p className="panel-status-line" aria-label="Asset library summary">
          <span>{formatNumber(filteredAssets.length)} of {formatNumber(props.assets.length)} shown</span>
          <span>{formatNumber(activeAssetCount)} active</span>
          <span>{formatNumber(visibleImageAssetCount)} images</span>
          <span>{storageSummary}</span>
          {delivery?.actionRequired && <span className="attention">Delivery needs attention</span>}
        </p>
        <div className="asset-quota asset-quota-compact" aria-label="Asset quota usage">
          <div className="asset-quota-track">
            <div className={`asset-quota-fill ${quotaRatio >= 0.9 ? "danger" : quotaRatio >= 0.75 ? "warning" : ""}`} style={{ width: `${Math.round(quotaRatio * 100)}%` }} />
          </div>
          <div className="admin-meta">
            <span>{quotaBytes === undefined ? "No quota configured" : `${quotaPercent} used`}</span>
            {quotaRemainingBytes !== undefined && <span>{formatStorageBytes(quotaRemainingBytes)} remaining</span>}
            <span>{quotaRiskLabel}</span>
          </div>
        </div>
        <div className="asset-toolbar" aria-label="Asset filters and batch actions">
          <label className="asset-search-field">
            <span>Search</span>
            <input aria-label="Asset search" value={props.assetSearch} placeholder="Name, folder, tag" onChange={(event) => props.setAssetSearch(event.target.value)} />
          </label>
          <label>
            <span>Folder</span>
            <select aria-label="Asset folder filter" value={assetFolderFilter} onChange={(event) => setAssetFolderFilter(event.target.value)}>
              <option value="all">All folders</option>
              {assetFolderOptions.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select aria-label="Asset lifecycle filter" value={assetLifecycleFilter} onChange={(event) => setAssetLifecycleFilter(event.target.value as AssetLifecycleStatus | "all")}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deleted">Deleted</option>
            </select>
          </label>
          {visibleAssetIds.length > 0 && (
            <div className="asset-selection-actions">
              <label className="inline-check">
                <input aria-label="Select visible assets" type="checkbox" checked={allVisibleAssetsSelected} onChange={(event) => setVisibleAssetsSelected(event.target.checked)} />
                <span>{formatNumber(selectedAssetIds.length)} selected</span>
              </label>
              {selectedAssets.length > 0 && (
                <>
                  <button className="ghost-button" type="button" aria-label="Batch archive assets" disabled={!props.canUpdateScene} onClick={() => updateSelectedAssetLifecycle("archived").catch(console.error)}>
                    <RotateCcw size={15} /> Archive
                  </button>
                  <button className="ghost-button" type="button" aria-label="Batch restore assets" disabled={!props.canUpdateScene} onClick={() => updateSelectedAssetLifecycle("active").catch(console.error)}>
                    <Check size={15} /> Restore
                  </button>
                  <button className="ghost-button" type="button" aria-label="Batch delete assets" disabled={!props.canUpdateScene} onClick={() => updateSelectedAssetLifecycle("deleted").catch(console.error)}>
                    <X size={15} /> Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {hasRecoverableAssets && (
          <details className="asset-maintenance-drawer" role="region" aria-label="Asset restore recovery">
            <summary>
              <span>Recovery</span>
              <strong>{formatNumber(recoverableAssets.length)} recoverable</strong>
            </summary>
            <div className="asset-maintenance-body">
              <div className="button-row">
                <button className="ghost-button" type="button" onClick={() => setAssetLifecycleFilter("archived")}>
                  <Boxes size={14} /> Show archived
                </button>
                <button className="ghost-button" type="button" onClick={() => setAssetLifecycleFilter("deleted")}>
                  <X size={14} /> Show deleted
                </button>
                <button className="ghost-button" type="button" disabled={!props.canUpdateScene} onClick={() => { setAssetLifecycleFilter("all"); setSelectedAssetIds(recoverableAssets.map((asset) => asset.id)); }}>
                  <Check size={14} /> Select recoverable
                </button>
              </div>
              <div className="operator-list">
                {recoverableAssets.slice(0, 4).map((asset) => (
                  <div className="operator-row tool-call-row" key={`recoverable-${asset.id}`}>
                    <span>{asset.name}</span>
                    <strong>{asset.lifecycle?.status ?? "active"} - {formatDateTime(asset.updatedAt)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
        {hasAssetDiagnostics && (
          <details className="asset-maintenance-drawer">
            <summary>
              <span>Storage and delivery details</span>
              <strong>{deliveryStatusLabel}</strong>
            </summary>
            <div className="asset-maintenance-body">
              <label>
                <span>Lifecycle reason</span>
                <input aria-label="Asset lifecycle reason" value={props.lifecycleReason} onChange={(event) => props.setLifecycleReason(event.target.value)} />
              </label>
              <div className="asset-pressure-list" aria-label="Asset quota management">
                <div className="operator-row tool-call-row">
                  <span>Quota policy</span>
                  <strong>{quotaBytes === undefined ? "No campaign quota configured" : `${formatStorageBytes(storageUsedBytes)} of ${formatStorageBytes(quotaBytes)} used`}</strong>
                </div>
                <div className="operator-row tool-call-row">
                  <span>Recommended action</span>
                  <strong>{quotaRecommendedAction}</strong>
                </div>
                {largestAsset && (
                  <div className="operator-row tool-call-row">
                    <span>Largest cleanup candidate</span>
                    <strong>{largestAsset.name} - {formatStorageBytes(largestAsset.sizeBytes)} - {largestAsset.lifecycleStatus}</strong>
                  </div>
                )}
              </div>
              {largestAssets.length > 0 && (
                <div className="asset-pressure-list" aria-label="Largest assets">
                  {largestAssets.slice(0, 3).map((asset) => (
                    <div className="operator-row tool-call-row" key={`largest-${asset.id}`}>
                      <span>{asset.name}</span>
                      <strong>{formatStorageBytes(asset.sizeBytes)} - {asset.provider} - {asset.lifecycleStatus}</strong>
                    </div>
                  ))}
                </div>
              )}
              {delivery && (
                <div className="asset-pressure-list" aria-label="Asset delivery diagnostics">
                  <div className="operator-row tool-call-row">
                    <span>{delivery.actionRequired ? "Delivery action required" : "Delivery ready"}</span>
                    <strong>{delivery.actionReasons.length > 0 ? delivery.actionReasons.join(", ") : `${delivery.mode} delivery`}</strong>
                  </div>
                  <div className="operator-row tool-call-row">
                    <span>{formatNumber(delivery.posture.deliverableActiveAssetCount)} deliverable / {formatNumber(delivery.posture.activeManagedAssetCount)} managed</span>
                    <strong>{formatNumber(delivery.posture.undeliverableActiveAssetCount)} undeliverable - {formatNumber(delivery.posture.cdnEligibleAssetCount)} CDN eligible</strong>
                  </div>
                  {delivery.warnings.slice(0, 3).map((warning) => (
                    <div className="operator-row tool-call-row" key={`asset-delivery-warning-${warning.code}`}>
                      <span>{warning.message}</span>
                      <strong>{warning.env.length > 0 ? warning.env.join(", ") : warning.severity}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
        <details className="asset-maintenance-drawer asset-upload-defaults">
          <summary>
            <span>Upload defaults</span>
            <strong>{props.assetFolder || "No folder"}</strong>
          </summary>
          <div className="asset-maintenance-body">
            <div className="asset-upload-settings" aria-label="Asset upload defaults">
              <label>
                <span>Upload folder</span>
                <input aria-label="Asset upload folder" value={props.assetFolder} placeholder="maps" onChange={(event) => props.setAssetFolder(event.target.value)} />
              </label>
              <label>
                <span>Upload tags</span>
                <input aria-label="Asset upload tags" value={props.assetTags} placeholder="map, dungeon" onChange={(event) => props.setAssetTags(event.target.value)} />
              </label>
            </div>
          </div>
        </details>
        {(assetFolderBreadcrumbs.length > 0 || assetFolderChildren.length > 0) && (
          <section className="asset-folder-browser" aria-label="Asset folder navigation">
            <div className="asset-folder-breadcrumbs">
              <button type="button" className={assetFolderFilter === "all" ? "ghost-button active" : "ghost-button"} onClick={() => setAssetFolderFilter("all")} aria-pressed={assetFolderFilter === "all"}>
                All assets
              </button>
              {assetFolderBreadcrumbs.map((folder) => (
                <button key={folder.path} type="button" className={assetFolderFilter === folder.path ? "ghost-button active" : "ghost-button"} onClick={() => setAssetFolderFilter(folder.path)} aria-label={`Open asset folder ${folder.path}`} aria-pressed={assetFolderFilter === folder.path}>
                  {folder.label}
                </button>
              ))}
            </div>
            {assetFolderChildren.length > 0 && (
              <div className="asset-folder-children" aria-label="Child asset folders">
                {assetFolderChildren.map((folder) => (
                  <button key={folder.path} type="button" className="ghost-button" onClick={() => setAssetFolderFilter(folder.path)} aria-label={`Open asset folder ${folder.path}`}>
                    <Boxes size={15} />
                    <span>{folder.label}</span>
                    <small>{formatNumber(folder.count)}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        <input
          id={uploadInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,application/json"
          hidden
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            await props.onUploadAsset(file, false);
            input.value = "";
          }}
        />
        <input
          id={backgroundInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          hidden
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            await props.onUploadAsset(file, true);
            input.value = "";
          }}
        />
        {hasAssetActivityStatus && <div className="admin-status asset-activity-status" role="status" aria-live="polite">{props.assetStatus}</div>}
        {props.failedAssetUpload && (
          <div className="operator-row tool-call-row" aria-label="Asset upload recovery">
            <span>{props.failedAssetUpload.file.name} failed: {props.failedAssetUpload.message}</span>
            <div className="admin-actions">
              <button className="ghost-button" type="button" onClick={() => props.onRetryFailedAssetUpload().catch(console.error)}>
                <RefreshCw size={16} /> Retry upload
              </button>
              <button className="ghost-button" type="button" onClick={props.onDismissFailedAssetUpload}>
                <X size={16} /> Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="asset-list asset-list-clean">
          {filteredAssets.length === 0 ? (
            <div className="empty-state compact asset-empty-state">
              <strong>{props.assets.length === 0 ? "No assets yet." : "No assets match this view."}</strong>
              <span>{props.assets.length === 0 ? "Upload campaign art, maps, handouts, or PDFs to start the library." : isFilteringAssets ? "Try clearing search or filters." : "Upload an asset to add it here."}</span>
            </div>
          ) : (
            filteredAssets.map((asset) => {
              const lifecycle = asset.lifecycle?.status ?? "active";
              const isDeleted = lifecycle === "deleted";
              const isImage = asset.mimeType.startsWith("image/");
              const selected = selectedAssetIds.includes(asset.id);
              const assetKind = isImage ? "Image" : asset.mimeType.includes("pdf") ? "PDF" : "File";
              const folderLabel = asset.folder || "Unfiled";
              const tagPreview = (asset.tags ?? []).slice(0, 3);
              const hiddenTagCount = Math.max(0, (asset.tags?.length ?? 0) - tagPreview.length);
              return (
                <article className={selected ? "asset-card asset-card-clean selected" : "asset-card asset-card-clean"} key={asset.id}>
                  <div className="asset-thumb">{isImage && !isDeleted ? <img src={assetBlobUrl(asset)} alt="" /> : <FileText size={24} />}</div>
                  <div className="asset-detail">
                    <div className="asset-card-main">
                      <div>
                        <label className="asset-select-toggle">
                          <input aria-label={`Select ${asset.name} asset`} type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={(event) => setAssetSelected(asset.id, event.target.checked)} />
                          <span>{selected ? "Selected" : "Select"}</span>
                        </label>
                        <h3>{asset.name}</h3>
                        <p>{assetKind} - {formatStorageBytes(asset.sizeBytes)} - {folderLabel}</p>
                      </div>
                      <span className={`status-pill ${lifecycle === "active" ? "completed" : lifecycle === "deleted" ? "failed" : "running"}`}>{titleCaseLabel(lifecycle)}</span>
                    </div>
                    <div className="asset-chip-row" aria-label={`${asset.name} quick details`}>
                      {tagPreview.map((tag) => (
                        <span className="asset-chip" key={`${asset.id}-${tag}`}>{tag}</span>
                      ))}
                      {hiddenTagCount > 0 && <span className="asset-chip muted">+{formatNumber(hiddenTagCount)}</span>}
                      {!isImage && <span className="asset-chip muted">{asset.mimeType}</span>}
                      {asset.security && asset.security.findings.length > 0 && <span className="asset-chip warning">{formatNumber(asset.security.findings.length)} findings</span>}
                      {asset.lifecycle?.expiresAt && <span className="asset-chip muted">expires {formatDateTime(asset.lifecycle.expiresAt)}</span>}
                    </div>
                    <div className="asset-card-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        draggable={props.canCreateToken && !isDeleted && isImage}
                        aria-label={`Place ${asset.name} asset on scene`}
                        title={props.canCreateToken && !isDeleted && isImage ? "Drag asset to the scene" : "Requires token.create and an active image asset"}
                        disabled={!props.canCreateToken || isDeleted || !isImage}
                        onClick={() => props.onPlaceAssetToken(asset).catch(console.error)}
                        onDragStart={(event) => {
                          writeTokenDropData(event.dataTransfer, { type: "asset", id: asset.id, imageAssetId: asset.id, name: asset.name, layer: "map", disposition: "neutral" });
                          setTokenDropPreview(event.dataTransfer, asset.name, assetBlobUrl(asset));
                        }}
                      >
                        <MapPin size={16} /> Place
                      </button>
                      <button className="ghost-button" type="button" disabled={!props.canUpdateScene || !props.selectedScene || isDeleted || !isImage} onClick={() => props.onSetSceneBackground(asset).catch(console.error)}>
                        <Eye size={16} /> Background
                      </button>
                      {lifecycle === "active" ? (
                        <button className="ghost-button" type="button" disabled={!props.canUpdateScene} onClick={() => props.onUpdateAssetLifecycle(asset, "archived").catch(console.error)}>
                          <RotateCcw size={16} /> Archive
                        </button>
                      ) : (
                        <button className="ghost-button" type="button" disabled={!props.canUpdateScene} onClick={() => props.onUpdateAssetLifecycle(asset, "active").catch(console.error)}>
                          <Check size={16} /> Restore
                        </button>
                      )}
                    </div>
                    <details className="asset-card-details">
                      <summary>Edit details and delivery</summary>
                      <form
                        className="mini-form asset-edit-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          props.onUpdateAssetMetadata(asset, {
                            name: String(form.get("name") ?? asset.name),
                            folder: String(form.get("folder") ?? asset.folder ?? ""),
                            tags: String(form.get("tags") ?? (asset.tags ?? []).join(", "))
                          }).catch(console.error);
                        }}
                      >
                        <input name="name" aria-label={`${asset.name} asset name`} defaultValue={asset.name} />
                        <input name="folder" aria-label={`${asset.name} asset folder`} defaultValue={asset.folder ?? ""} placeholder="folder" />
                        <input name="tags" aria-label={`${asset.name} asset tags`} defaultValue={(asset.tags ?? []).join(", ")} placeholder="tags" />
                        <button className="ghost-button" type="submit" aria-label="Save Metadata" disabled={!props.canUpdateScene}>
                          <Check size={16} /> Save
                        </button>
                      </form>
                      <div className="admin-meta">
                        <span>{asset.storage?.provider ?? "external"}</span>
                        <span>{asset.security?.status ?? "unscanned"}</span>
                        {asset.lifecycle?.expiresAt && <span>expires {formatDateTime(asset.lifecycle.expiresAt)}</span>}
                      </div>
                      <div className="admin-actions">
                        <button className="ghost-button" type="button" disabled={isDeleted} onClick={() => props.onCreateAssetDeliveryUrl(asset).catch(console.error)}>
                          <Download size={16} /> Signed URL
                        </button>
                        <button className="ghost-button" type="button" disabled={!props.canUpdateScene || lifecycle === "archived"} onClick={() => props.onUpdateAssetLifecycle(asset, "archived").catch(console.error)}>
                          <RotateCcw size={16} /> Archive
                        </button>
                        <button className="ghost-button" type="button" disabled={!props.canUpdateScene || lifecycle === "active"} onClick={() => props.onUpdateAssetLifecycle(asset, "active").catch(console.error)}>
                          <Check size={16} /> Restore
                        </button>
                        <button className="ghost-button" type="button" disabled={!props.canUpdateScene || isDeleted} onClick={() => props.onUpdateAssetLifecycle(asset, "deleted").catch(console.error)}>
                          <X size={16} /> Delete
                        </button>
                      </div>
                    </details>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <details className="content-import-drawer">
        <summary>
          <span>
            <strong>Content import</strong>
            <small>Adapters, previews, apply, and rollback tools</small>
          </span>
          <span>{formatNumber(props.imports.length)} batches</span>
        </summary>
        <div className="content-import-drawer-body">
          <form
            className="operator-section content-import-form content-import-form-clean"
            onSubmit={(event) => {
              event.preventDefault();
              props.onPreview(previewEntities, previewSource).then(() => setDraftEntities([])).catch(console.error);
            }}
          >
        <section className="operator-section compact" aria-label="Content import adapter setup">
          <div className="operator-heading">
            <div>
              <div className="section-title">Adapter</div>
              <p>{selectedAdapterPreset.description}</p>
            </div>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Adapter</span>
              <select aria-label="Content import adapter" value={adapterPresetId} onChange={(event) => setAdapterPresetId(event.target.value as ContentImportAdapterPresetId)}>
                {contentImportAdapterPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Source name</span>
              <input aria-label="Adapter source name" value={adapterSourceName} placeholder={selectedAdapterPreset.sourceName} onChange={(event) => setAdapterSourceName(event.target.value)} />
            </label>
            <label>
              <span>Source URL</span>
              <input aria-label="Adapter source URL" value={adapterSourceUrl} placeholder="https://example.com/source" onChange={(event) => setAdapterSourceUrl(event.target.value)} />
            </label>
            <label>
              <span>Config</span>
              <input aria-label="Adapter configuration" value={adapterConfig} placeholder="columns=name,body;delimiter=,;kind=item" onChange={(event) => setAdapterConfig(event.target.value)} />
            </label>
          </div>
          <div className="admin-meta" aria-label="Adapter preview summary">
            <span>{selectedAdapterPreset.sourceType === "adapter" ? `Adapter: ${selectedAdapterPreset.adapterId}` : "Manual source"}</span>
            <span>License: {selectedAdapterPreset.license.name}</span>
            <span>Usage: {titleCaseLabel(selectedAdapterPreset.license.usage)}</span>
            <span>{formatNumber(previewEntities.length)} generated entities</span>
          </div>
          <div className="admin-actions">
            <input
              id={pdfInputId}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setPdfFile(file);
                event.currentTarget.value = "";
              }}
            />
            <button className="ghost-button" type="button" disabled={!props.canManage} title={props.canManage ? "Choose a PDF for Codex analysis" : "Requires campaign.update"} onClick={() => document.getElementById(pdfInputId)?.click()}>
              <FileText size={16} /> Codex PDF
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={!props.canManage || !pdfFile}
              title={pdfFile ? `Analyze ${pdfFile.name}` : "Choose a PDF first"}
              onClick={() => {
                if (!pdfFile) return;
                props.onAnalyzePdf(pdfFile).then(() => setPdfFile(undefined)).catch(console.error);
              }}
            >
              <Upload size={16} /> Analyze PDF
            </button>
            {pdfFile && <span className="admin-inline-status">{pdfFile.name}</span>}
          </div>
        </section>
        <div className="admin-form-grid">
          <label>
            <span>Kind</span>
            <select aria-label="Content import kind" value={props.kind} onChange={(event) => props.setKind(event.target.value as ContentImportEntityKind)}>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {titleCaseLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Name</span>
            <input aria-label="Content import name" value={props.name} placeholder="Imported note" onChange={(event) => props.setName(event.target.value)} />
          </label>
        </div>
        <label>
          <span>{props.kind === "actor" || props.kind === "item" ? "Notes" : "Body"}</span>
          <textarea aria-label="Content import body" value={props.body} placeholder="Content body" onChange={(event) => props.setBody(event.target.value)} />
        </label>
        <div className="admin-actions">
          <button className="ghost-button" type="button" disabled={!props.canManage || adapterPresetId !== "manual" || !currentDraftEntity.name} onClick={addDraftEntity} title={adapterPresetId === "manual" ? (props.canManage ? "Add this entity to the pending import batch" : "Requires campaign.update") : "Manual batches only"}>
            <Plus size={16} /> Add Entity
          </button>
          <button className="primary-button" type="submit" disabled={!props.canManage || previewEntities.length === 0} title={props.canManage ? "Preview content import" : "Requires campaign.update"}>
            <Upload size={16} /> Preview Batch
          </button>
        </div>
        {draftEntities.length > 0 && (
          <div className="content-import-drafts" aria-label="Pending import entities">
            {draftEntities.map((entity, index) => (
              <div className="operator-row tool-call-row" key={`${entity.kind}-${entity.name}-${index}`}>
                <span>{titleCaseLabel(entity.kind)}: {entity.name}</span>
                <button className="ghost-button" type="button" onClick={() => setDraftEntities((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                  <X size={14} /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
          </form>
          <div className="admin-status" role="status" aria-live="polite">{props.status}</div>
          <div className="operator-list content-import-list">
        {props.imports.length === 0 ? (
          <div className="empty-state compact">No content imports for this campaign.</div>
        ) : (
          props.imports.map((batch) => {
            const selectedEntityIds = importSelections[batch.id] ?? batch.selectedEntityIds;
            const selectedCount = batch.entities.filter((entity) => selectedEntityIds.includes(entity.id)).length;
            const warningCount = batch.entities.reduce((total, entity) => total + entity.warnings.length, 0);
            const appliedByEntity = new Map(batch.appliedRecords.map((record) => [record.entityId, record]));
            return (
              <article className="operator-item content-import-report" key={batch.id} aria-label={`${batch.source.sourceName} validation report`}>
                <div className="operator-heading">
                  <div>
                    <h3>{batch.source.sourceName}</h3>
                    <p>{batch.status} - {batch.entities.length} {batch.entities.length === 1 ? "entity" : "entities"} - {batch.source.license.usage}</p>
                  </div>
                  <span className={contentImportStatusClass(batch.status)}>{titleCaseLabel(batch.status)}</span>
                </div>
                <div className="content-import-summary" aria-label="Validation report">
                  <div className="metric-row">
                    <span>Validation</span>
                    <strong>{warningCount === 0 ? "Ready" : `${warningCount} warning${warningCount === 1 ? "" : "s"}`}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Selected</span>
                    <strong>{selectedCount} of {batch.entities.length}</strong>
                  </div>
                  <div className="metric-row">
                    <span>Applied</span>
                    <strong>{batch.appliedRecords.length}</strong>
                  </div>
                </div>
                <div className="admin-meta" aria-label="Provenance and license">
                  <span>Source: {titleCaseLabel(batch.source.sourceType)}</span>
                  {batch.source.adapterId && <span>Adapter: {batch.source.adapterId}</span>}
                  <span>License: {batch.source.license.name}</span>
                  <span>Usage: {titleCaseLabel(batch.source.license.usage)}</span>
                  {batch.source.license.attribution && <span>Attribution: {batch.source.license.attribution}</span>}
                  {batch.source.sourceUrl && <span>{batch.source.sourceUrl}</span>}
                  <span>Submitted: {formatDateTime(batch.source.submittedAt)}</span>
                </div>
                <div className="content-import-entities" aria-label="Import entity selection">
                  {batch.entities.map((entity) => {
                    const selected = selectedEntityIds.includes(entity.id);
                    const applied = appliedByEntity.get(entity.id);
                    return (
                      <label className="import-entity-row" key={entity.id}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${entity.name}`}
                          checked={selected}
                          disabled={!props.canManage || batch.status !== "previewed"}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setImportSelections((current) => {
                              const existing = current[batch.id] ?? batch.selectedEntityIds;
                              const next = checked ? [...new Set([...existing, entity.id])] : existing.filter((id) => id !== entity.id);
                              return { ...current, [batch.id]: next };
                            });
                          }}
                        />
                        <div>
                          <strong>{titleCaseLabel(entity.kind)}: {entity.name}</strong>
                          <p>{selected ? "Selected" : "Excluded"}{applied ? ` - applied to ${applied.collection} ${applied.id}` : ""}</p>
                          {entity.warnings.length > 0 && <p>{entity.warnings.join(", ")}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {(batch.appliedAt || batch.rolledBackAt) && (
                  <div className="admin-meta" aria-label="Import history">
                    {batch.appliedAt && <span>Applied: {formatDateTime(batch.appliedAt)}</span>}
                    {batch.rolledBackAt && <span>Rolled back: {formatDateTime(batch.rolledBackAt)}</span>}
                  </div>
                )}
                <div className="admin-actions">
                  <button className="ghost-button" onClick={() => props.onApply(batch, selectedEntityIds).catch(console.error)} disabled={!props.canManage || batch.status === "applied" || batch.status === "rolled_back" || selectedCount === 0} title={props.canManage ? "Apply selected import entities" : "Requires campaign.update"}>
                    <Check size={16} /> Apply Selected
                  </button>
                  <button className="ghost-button" onClick={() => props.onRollback(batch).catch(console.error)} disabled={!props.canManage || batch.status !== "applied"} title={props.canManage ? "Rollback applied records" : "Requires campaign.update"}>
                    <RotateCcw size={16} /> Rollback
                  </button>
                  <button className="ghost-button" onClick={() => props.onDelete(batch).catch(console.error)} disabled={!props.canManage || batch.status === "applied"} title={props.canManage ? "Delete import preview" : "Requires campaign.update"}>
                    <X size={16} /> Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
          </div>
        </div>
      </details>
    </div>
  );
}
