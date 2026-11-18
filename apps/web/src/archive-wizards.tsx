import { Download, RefreshCw, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { summarizeImport, type ArchiveImportCollection, type ArchiveImportScope, type CampaignImportResult } from "./content-import-data.js";
import { formatNumber } from "./sheet-format.js";
import { archiveExportCollectionOptions, archiveExportMinimumRecordCount, type ArchiveExportCollection, type ArchiveExportEstimateInput, type ArchiveExportScope } from "./archive-export-estimate.js";
import type { ArchiveExportVersion, ArchiveImportMode, ArchiveRedactionMode, FailedArchiveImport } from "./workspace-types.js";

const archiveImportCollectionOptions: Array<{ id: ArchiveImportCollection; label: string }> = [
  { id: "assets", label: "Assets" },
  { id: "scenes", label: "Scenes" },
  { id: "tokens", label: "Tokens" },
  { id: "actors", label: "Actors" },
  { id: "items", label: "Items" },
  { id: "journals", label: "Journals" },
  { id: "handouts", label: "Handouts" },
  { id: "chat", label: "Chat" },
  { id: "rolls", label: "Rolls" },
  { id: "diceMacros", label: "Dice macros" },
  { id: "rollableTables", label: "Rollable tables" },
  { id: "encounters", label: "Encounters" },
  { id: "combats", label: "Combats" },
  { id: "contentImports", label: "Import batches" },
  { id: "fogPresets", label: "Fog presets" }
];

interface ArchiveImportWizardProps {
  mode: ArchiveImportMode;
  scope: ArchiveImportScope;
  collections: ArchiveImportCollection[];
  importing: boolean;
  transferBusy: boolean;
  report?: CampaignImportResult;
  reportFileName: string;
  status: string;
  failure?: FailedArchiveImport;
  onModeChange(mode: ArchiveImportMode): void;
  onScopeChange(scope: ArchiveImportScope): void;
  onCollectionChange(collection: ArchiveImportCollection, checked: boolean): void;
  onImport(file: File, input: HTMLInputElement): Promise<void>;
  onRetry(): void;
  onDismissFailure(): void;
  children: ReactNode;
}

export function ArchiveImportWizard({
  mode, scope, collections, importing, transferBusy, report, reportFileName, status, failure,
  onModeChange, onScopeChange, onCollectionChange, onImport, onRetry, onDismissFailure, children,
}: ArchiveImportWizardProps) {
  return (
    <>
      <section className="account-box" aria-label="Archive import wizard">
        <div className="section-title">Archive Import</div>
        <select aria-label="Archive import mode" value={mode} onChange={(event) => onModeChange(event.target.value as ArchiveImportMode)}>
          <option value="upsert">Apply archive</option>
          <option value="reject_conflicts">Reject conflicts</option>
          <option value="skip_conflicts">Skip conflicts</option>
          <option value="dry_run">Dry run validation</option>
        </select>
        <select aria-label="Archive import scope" value={scope} onChange={(event) => onScopeChange(event.target.value as ArchiveImportScope)}>
          <option value="all">All records</option>
          <option value="assets_only">Assets only</option>
          <option value="selected_collections">Selected records</option>
        </select>
        {scope === "selected_collections" && (
          <div className="asset-pressure-list" aria-label="Archive import collection selection">
            {archiveImportCollectionOptions.map((option) => (
              <label className="operator-row tool-call-row" key={option.id}>
                <span>{option.label}</span>
                <input
                  type="checkbox"
                  aria-label={`Import ${option.label}`}
                  checked={collections.includes(option.id)}
                  onChange={(event) => onCollectionChange(option.id, event.target.checked)}
                />
              </label>
            ))}
          </div>
        )}
        <button className="ghost-button wide" type="button" onClick={() => document.getElementById("import-file")?.click()} disabled={importing || transferBusy} aria-describedby="import-status" title="Import a streamed .ottx archive or legacy .ottx.json archive">
          {importing ? <RefreshCw size={16} /> : <Upload size={16} />} {mode === "dry_run" ? "Validate Archive" : "Import Archive"}
        </button>
        {report && (
          <div className="asset-pressure-list" aria-label="Archive import validation">
            <div className="operator-row tool-call-row">
              <span>{reportFileName || "Archive"}</span>
              <strong>{report.dryRun ? "dry run" : "applied"}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>Scope</span>
              <strong>{report.importScope === "assets_only" ? "assets only" : report.importScope === "selected_collections" ? "selected records" : "all records"}</strong>
            </div>
            {report.importCollections && report.importScope === "selected_collections" && (
              <div className="operator-row tool-call-row">
                <span>Collections</span>
                <strong>{report.importCollections.join(", ")}</strong>
              </div>
            )}
            <div className="operator-row tool-call-row">
              <span>Records</span>
              <strong>{summarizeImport(report)}</strong>
            </div>
            <div className="operator-row tool-call-row">
              <span>Conflicts</span>
              <strong>{formatNumber(report.conflicts.length)}</strong>
            </div>
            {report.importWarnings && report.importWarnings.length > 0 && (
              <div className="operator-row tool-call-row">
                <span>Dependency warnings</span>
                <strong>{formatNumber(report.importWarnings.length)}</strong>
              </div>
            )}
            {report.importWarnings?.slice(0, 3).map((warning) => (
              <div className="operator-row tool-call-row" key={warning}>
                <span>Warning</span>
                <strong>{warning}</strong>
              </div>
            ))}
            {report.skippedConflicts && (
              <div className="operator-row tool-call-row">
                <span>Skipped</span>
                <strong>{formatNumber(report.skippedConflicts.length)}</strong>
              </div>
            )}
            {report.conflicts.slice(0, 4).map((conflict) => (
              <div className="operator-row tool-call-row" key={`${conflict.collection}:${conflict.id}`}>
                <span>{conflict.collection}</span>
                <strong>{conflict.id}</strong>
              </div>
            ))}
          </div>
        )}
        {children}
      </section>
      <input
        id="import-file"
        type="file"
        accept=".ottx,.ottx.json,application/vnd.open-tabletop.ottx-stream,application/json"
        aria-label="Import campaign archive"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await onImport(file, event.currentTarget);
        }}
      />
      <div id="import-status" className="import-status" role="status" aria-live="polite">
        <strong>Import</strong>
        <span>{status}</span>
      </div>
      {failure && (
        <div className="operator-row tool-call-row" aria-label="Archive import recovery">
          <span>{failure.file.name} failed: {failure.message}</span>
          <div className="admin-actions">
            <button className="ghost-button" type="button" disabled={importing || transferBusy} onClick={onRetry}>
              <RefreshCw size={16} /> Retry import
            </button>
            <button className="ghost-button" type="button" onClick={onDismissFailure}>
              <X size={16} /> Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface ArchiveExportWizardProps extends ArchiveExportEstimateInput {
  version: ArchiveExportVersion;
  redaction: ArchiveRedactionMode;
  status: string;
  busy: boolean;
  onScopeChange(scope: ArchiveExportScope): void;
  onWorldChange(worldId: string): void;
  onCollectionChange(collection: ArchiveExportCollection, checked: boolean): void;
  onVersionChange(version: ArchiveExportVersion): void;
  onRedactionChange(redaction: ArchiveRedactionMode): void;
  onStreamExport(): void;
  onJsonExport(): void;
}

export function ArchiveExportWizard(props: ArchiveExportWizardProps) {
  const { scope, worldId, worlds, collections, version, redaction, status, busy,
    onScopeChange, onWorldChange, onCollectionChange, onVersionChange, onRedactionChange, onStreamExport, onJsonExport } = props;
  const recordCount = archiveExportMinimumRecordCount(props);
  const exportDisabled = busy || (scope === "world" && !worldId);
  const notes = [
    scope === "campaign"
      ? "Exports the selected campaign and all related portable tabletop records."
      : scope === "world"
        ? "Exports one world with dependency-closed scenes, actors, content, assets, sessions, and audit records."
        : "Exports the campaign identity shell plus the selected record collections and referenced dependency records; dependency warnings are embedded in the archive.",
    "The displayed count is a conservative minimum because the server can include dependencies and history unavailable in the browser snapshot.",
    "Archive 0.2.0 is accepted by the current v0.3/v1-compatible importer.",
    "Portable redaction strips account secrets, sessions, MFA, SCIM sources, plugin reviews, idempotency records, jobs, and organization records while preserving playable content."
  ];

  function changeScope(nextScope: ArchiveExportScope) {
    onScopeChange(nextScope);
    if (nextScope === "world" && !worldId) onWorldChange(worlds[0]?.id ?? "");
  }

  return (
    <section className="account-box" aria-label="Archive export wizard">
      <div className="section-title">Archive Export</div>
      <select aria-label="Archive export scope" value={scope} onChange={(event) => changeScope(event.target.value as ArchiveExportScope)}>
        <option value="campaign">Current campaign</option>
        <option value="world">One world</option>
        <option value="selected_collections">Selected record collections</option>
      </select>
      {scope === "world" && (
        <label>
          <span>World</span>
          <select aria-label="Archive export world" value={worldId} onChange={(event) => onWorldChange(event.target.value)}>
            <option value="">Select a world</option>
            {worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
          </select>
        </label>
      )}
      {scope === "selected_collections" && (
        <div className="asset-pressure-list archive-export-collections" aria-label="Archive export collection selection">
          {archiveExportCollectionOptions.map((option) => (
            <label className="operator-row tool-call-row" key={option.id}>
              <span>{option.label}</span>
              <input
                type="checkbox"
                aria-label={`Export ${option.label}`}
                checked={collections.includes(option.id)}
                onChange={(event) => onCollectionChange(option.id, event.target.checked)}
              />
            </label>
          ))}
        </div>
      )}
      <select aria-label="Archive export version" value={version} onChange={(event) => onVersionChange(event.target.value as ArchiveExportVersion)}>
        <option value="0.2.0">Archive 0.2.0</option>
      </select>
      <select aria-label="Archive redaction mode" value={redaction} onChange={(event) => onRedactionChange(event.target.value as ArchiveRedactionMode)}>
        <option value="portable">Portable table archive</option>
      </select>
      <div className="asset-pressure-list" aria-label="Archive compatibility notes">
        <div className="operator-row tool-call-row">
          <span>Scope</span>
          <strong>{recordCount === undefined ? "Select a world to estimate" : `At least ${formatNumber(recordCount)} records`}</strong>
        </div>
        {notes.map((note) => (
          <div className="operator-row tool-call-row" key={note}>
            <span>Note</span>
            <strong>{note}</strong>
          </div>
        ))}
      </div>
      <p className="account-summary">{status}</p>
      <button className="ghost-button wide" type="button" disabled={exportDisabled} onClick={onStreamExport} title="Stream a large .ottx archive directly to disk">
        <Download size={16} /> Export Large Archive (.ottx)
      </button>
      <button className="ghost-button wide" type="button" disabled={exportDisabled} onClick={onJsonExport} title="Materialize a legacy JSON archive for small campaigns and older tooling">
        <Download size={16} /> Export JSON (small archives)
      </button>
    </section>
  );
}
