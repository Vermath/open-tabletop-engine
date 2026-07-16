import { useEffect, useState } from "react";
import type { ArchiveImportOperationSummary, ArchiveImportRollbackPreview } from "./content-import-data.js";

export interface ArchiveImportRecoveryProps {
  operations: ArchiveImportOperationSummary[];
  selectedOperationId: string;
  preview?: ArchiveImportRollbackPreview;
  busy: boolean;
  onSelect(operationId: string): void;
  onPreview(operationId: string): void;
  onRollback(operationId: string): void;
}

export function archiveImportRollbackConfirmationReady(operationId: string, confirmation: string): boolean {
  return Boolean(operationId) && confirmation.trim() === operationId;
}

export function ArchiveImportRecovery({ operations, selectedOperationId, preview, busy, onSelect, onPreview, onRollback }: ArchiveImportRecoveryProps) {
  const [confirmation, setConfirmation] = useState("");
  const selected = operations.find((operation) => operation.id === selectedOperationId);
  const selectedPreview = preview?.id === selectedOperationId ? preview : undefined;

  useEffect(() => setConfirmation(""), [selectedOperationId]);

  if (operations.length === 0) return null;
  return (
    <section className="operator-card" aria-label="Archive import rollback operations">
      <h4>Import rollback history</h4>
      <label>
        Import operation
        <select value={selectedOperationId} onChange={(event) => onSelect(event.currentTarget.value)} disabled={busy}>
          <option value="">Select an import</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.id} · {operation.status} · {operation.remainingRecordCount} records
            </option>
          ))}
        </select>
      </label>
      <button className="ghost-button small" type="button" disabled={!selected || busy} onClick={() => selected && onPreview(selected.id)}>
        Review rollback impact
      </button>
      {selectedPreview && (
        <div className="operator-stack" aria-label="Archive rollback impact confirmation">
          <p>
            Restore {selectedPreview.impact.restoreRecords} and delete {selectedPreview.impact.deleteRecords} records;
            restore {selectedPreview.impact.restoreAssetFiles} and delete {selectedPreview.impact.deleteAssetFiles} asset files.
          </p>
          <p>{selectedPreview.conflicts.length} changed or referenced records will be preserved.</p>
          {selectedPreview.conflicts.slice(0, 8).map((conflict) => (
            <div className="operator-row tool-call-row" key={`${conflict.collection}:${conflict.id}`}>
              <span>{conflict.collection}</span>
              <strong>{conflict.id} · {conflict.reason}</strong>
            </div>
          ))}
          {selectedPreview.status !== "rolled_back" && (
            <>
              <label>
                Type operation id to confirm rollback
                <input value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} placeholder={selectedPreview.id} />
              </label>
              <button className="danger-button" type="button" disabled={busy || !archiveImportRollbackConfirmationReady(selectedPreview.id, confirmation)} onClick={() => onRollback(selectedPreview.id)}>
                Roll back this import
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
