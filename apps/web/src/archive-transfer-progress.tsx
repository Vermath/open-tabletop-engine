import { formatStorageBytes } from "./sheet-format.js";

export type ArchiveTransferDirection = "export" | "import";
export type ArchiveTransferPhase = "preparing" | "choosing" | "transferring" | "validating" | "complete" | "cancelled" | "failed";

export interface ArchiveTransferState {
  direction: ArchiveTransferDirection;
  phase: ArchiveTransferPhase;
  fileName: string;
  loadedBytes: number;
  totalBytes?: number;
  error?: string;
}

export function archiveTransferIsBusy(state: ArchiveTransferState | undefined): boolean {
  return state?.phase === "preparing" || state?.phase === "choosing" || state?.phase === "transferring" || state?.phase === "validating";
}

export function archiveTransferCanCancel(state: ArchiveTransferState): boolean {
  return state.phase === "transferring" || state.phase === "validating";
}

export function archiveTransferMessage(state: ArchiveTransferState): string {
  const direction = state.direction === "export" ? "Export" : "Import";
  if (state.phase === "preparing") return `${direction} is reading the bounded archive manifest.`;
  if (state.phase === "choosing") return "Choose a direct-to-disk destination. No archive bytes have been downloaded yet.";
  if (state.phase === "validating") return `Upload complete at ${formatStorageBytes(state.loadedBytes)}. The server is validating checksums and preparing the atomic import; cancelling asks it to roll back staged work.`;
  if (state.phase === "complete") return `${direction} complete: ${formatStorageBytes(state.loadedBytes)} transferred.`;
  if (state.phase === "cancelled") return state.direction === "export"
    ? "Export cancelled. The browser discarded the partial destination file; retry starts a new stream."
    : "Import cancelled. The server discards staged files and rolls back uncommitted state; retry restarts the upload with the same idempotency key.";
  if (state.phase === "failed") return `${direction} failed${state.error ? `: ${state.error}` : "."} Retry starts from the source file; byte-range resume is not supported.`;
  const transferred = formatStorageBytes(state.loadedBytes);
  return state.totalBytes && state.totalBytes > 0
    ? `${direction} transferring: ${transferred} of ${formatStorageBytes(state.totalBytes)}.`
    : `${direction} transferring: ${transferred}. Total size is not available.`;
}

export function ArchiveTransferProgress({ state, onCancel }: { state?: ArchiveTransferState; onCancel: () => void }) {
  if (!state) return null;
  const cancellable = archiveTransferCanCancel(state);
  const determinate = state.totalBytes !== undefined && state.totalBytes > 0;
  return (
    <div className="asset-pressure-list archive-transfer-progress" role="status" aria-live="polite" aria-atomic="true" aria-label="Archive transfer progress">
      <div className="operator-row tool-call-row">
        <span>{state.fileName}</span>
        <strong>{state.phase}</strong>
      </div>
      {(state.phase === "transferring" || state.phase === "validating") && (
        <progress
          aria-label={`${state.direction === "export" ? "Archive export" : "Archive import"} bytes transferred`}
          max={determinate ? state.totalBytes : undefined}
          value={determinate ? Math.min(state.loadedBytes, state.totalBytes!) : undefined}
        />
      )}
      <p className="account-summary">{archiveTransferMessage(state)}</p>
      {cancellable && (
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancel archive {state.direction}
        </button>
      )}
    </div>
  );
}
