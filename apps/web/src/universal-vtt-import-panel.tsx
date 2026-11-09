import { AlertTriangle, Check, FileJson, LoaderCircle, MapPlus, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiImportUniversalVtt, getSessionTransportEpoch, type UniversalVttImportInput, type UniversalVttImportResult } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, formatNumber } from "./sheet-format.js";
import { reviewUniversalVttFile, universalVttSceneName, type UniversalVttReview } from "./universal-vtt-import.js";
import "./universal-vtt-import.css";

interface ImportAttempt {
  campaignId: string;
  contextKey: string;
  input: UniversalVttImportInput;
  idempotencyKey: string;
}

interface ImportOperation {
  controller: AbortController;
  contextKey: string;
}

export interface UniversalVttImportPanelProps {
  campaignId: string;
  campaignName?: string;
  campaignUpdatedAt: string;
  canImport: boolean;
  onClose(): void;
  onImported(result: UniversalVttImportResult): void;
}

export function UniversalVttImportPanel(props: UniversalVttImportPanelProps) {
  const [review, setReview] = useState<UniversalVttReview>();
  const [reviewContextKey, setReviewContextKey] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [sceneName, setSceneName] = useState("");
  const [phase, setPhase] = useState<"idle" | "reviewing" | "importing">("idle");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const operationRef = useRef<ImportOperation | undefined>(undefined);
  const attemptRef = useRef<ImportAttempt | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const contextKey = `${props.campaignId}:${getSessionTransportEpoch()}`;
  const contextRef = useRef({ key: contextKey, canImport: props.canImport });
  contextRef.current = { key: contextKey, canImport: props.canImport };
  const busy = phase !== "idle";
  const currentReview = review && reviewContextKey === contextKey ? review : undefined;

  function closeDialog() {
    if (phase === "importing") return;
    operationRef.current?.controller.abort();
    operationRef.current = undefined;
    props.onClose();
  }

  const dialogRef = useModalAccessibility<HTMLDivElement>(closeDialog, { initialFocusRef: fileInputRef });

  useEffect(() => {
    setReview(undefined);
    setReviewContextKey("");
    setSourceFileName("");
    setSceneName("");
    setPhase("idle");
    setError("");
    setRetry(false);
    attemptRef.current = undefined;
    return () => {
      operationRef.current?.controller.abort();
      operationRef.current = undefined;
    };
  }, [contextKey, props.canImport]);

  useEffect(() => {
    if (currentReview) nameInputRef.current?.focus();
  }, [currentReview]);

  function isCurrent(operation: ImportOperation): boolean {
    return operationRef.current === operation
      && !operation.controller.signal.aborted
      && contextRef.current.canImport
      && contextRef.current.key === operation.contextKey
      && operation.contextKey === `${props.campaignId}:${getSessionTransportEpoch()}`;
  }

  async function chooseFile(file: File) {
    if (!props.canImport || busy || operationRef.current) return;
    operationRef.current?.controller.abort();
    const operation = { controller: new AbortController(), contextKey };
    operationRef.current = operation;
    attemptRef.current = undefined;
    setSourceFileName(file.name);
    setReview(undefined);
    setSceneName("");
    setRetry(false);
    setError("");
    setPhase("reviewing");
    try {
      const nextReview = await reviewUniversalVttFile(file, operation.controller.signal);
      if (!isCurrent(operation)) return;
      setReview(nextReview);
      setReviewContextKey(contextKey);
      setSceneName(universalVttSceneName(file.name));
    } catch (fileError) {
      if (isCurrent(operation)) setError(errorMessage(fileError));
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = undefined;
        setPhase("idle");
      }
    }
  }

  function cancelRequest() {
    const operation = operationRef.current;
    if (!operation) return;
    operationRef.current = undefined;
    operation.controller.abort();
    setPhase("idle");
    if (phase === "importing") {
      setRetry(true);
      setError("Request stopped. Retry to check whether the scene was created; the same import will not create a duplicate.");
    } else {
      setError("Map review cancelled. Choose a file when you are ready.");
    }
  }

  async function importScene() {
    if (!props.canImport || busy || operationRef.current || !currentReview || !sceneName.trim()) return;
    const existingAttempt = attemptRef.current;
    const attempt = existingAttempt && existingAttempt.contextKey === contextKey
      ? existingAttempt
      : {
        campaignId: props.campaignId,
        contextKey,
        input: {
          name: sceneName.trim(),
          sourceFileName: currentReview.sourceFileName,
          document: currentReview.document,
          expectedCampaignUpdatedAt: props.campaignUpdatedAt
        },
        idempotencyKey: `universal-vtt:${globalThis.crypto.randomUUID()}`
      };
    attemptRef.current = attempt;
    const operation = { controller: new AbortController(), contextKey };
    operationRef.current = operation;
    setError("");
    setPhase("importing");
    try {
      const result = await apiImportUniversalVtt(attempt.campaignId, attempt.input, {
        idempotencyKey: attempt.idempotencyKey,
        signal: operation.controller.signal
      });
      if (!isCurrent(operation)) return;
      if (result.scene.campaignId !== attempt.campaignId || result.asset.campaignId !== attempt.campaignId) {
        throw new Error("The import response did not match this campaign. Refresh the campaign before trying again.");
      }
      operationRef.current = undefined;
      setPhase("idle");
      props.onImported(result);
    } catch (importError) {
      if (!isCurrent(operation)) return;
      setError(errorMessage(importError));
      setRetry(true);
      if (importError instanceof ApiError && [400, 403, 404, 409, 413, 415, 422].includes(importError.status)) {
        // A definitive validation or permission rejection did not import a scene.
        // Allow corrected input or the next campaign revision from the parent.
        attemptRef.current = undefined;
      }
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = undefined;
        setPhase("idle");
      }
    }
  }

  const doors = currentReview?.plan.walls.filter((wall) => wall.kind === "door").length ?? 0;
  const walls = (currentReview?.plan.walls.length ?? 0) - doors;
  const pendingRetry = retry && Boolean(attemptRef.current);

  return (
    <div className="modal-backdrop universal-vtt-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div ref={dialogRef} className="modal-dialog universal-vtt-import" role="dialog" aria-modal="true" aria-labelledby="universal-vtt-title" aria-describedby="universal-vtt-guidance" tabIndex={-1}>
        <header className="universal-vtt-header">
          <div>
            <div className="section-title">Map import</div>
            <h2 id="universal-vtt-title">Bring your map to the table</h2>
            <p id="universal-vtt-guidance">Import a Universal VTT export as a new scene{props.campaignName ? ` in ${props.campaignName}` : ""}.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close map import" disabled={phase === "importing"} onClick={closeDialog}><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="universal-vtt-body">
          {!props.canImport ? (
            <p role="status">You need permission to create scenes and upload map assets in this campaign.</p>
          ) : (
            <>
              <label className="universal-vtt-file">
                <span><Upload size={17} aria-hidden="true" /> {currentReview ? "Choose a different map" : "Choose your map file"}</span>
                <input ref={fileInputRef} type="file" accept=".uvtt,.dd2vtt,.df2vtt" aria-label="Universal VTT map file" disabled={busy || pendingRetry} onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void chooseFile(file);
                }} />
                <small>.uvtt, .dd2vtt, or .df2vtt · up to 8 MiB · embedded PNG or WebP</small>
              </label>
              {sourceFileName && <p className="universal-vtt-source"><FileJson size={14} aria-hidden="true" /><span>{sourceFileName}</span></p>}
              {review && !currentReview && <p className="universal-vtt-error" role="alert">The campaign changed. Choose the map file again to review it for this campaign.</p>}
              {phase === "reviewing" && <p className="universal-vtt-progress" role="status"><LoaderCircle size={16} aria-hidden="true" /> Checking the map image, grid, walls, doors, and lights…</p>}

              {currentReview && (
                <section className="universal-vtt-review" aria-label="Map import review">
                  <figure className="universal-vtt-preview">
                    <img src={currentReview.previewUrl} alt={`Map preview from ${currentReview.sourceFileName}`} />
                    <figcaption>{formatNumber(currentReview.plan.width)} × {formatNumber(currentReview.plan.height)} pixels</figcaption>
                  </figure>
                  <div className="universal-vtt-details">
                    <label>
                      <span>Scene name</span>
                      <input ref={nameInputRef} aria-label="Imported scene name" value={sceneName} maxLength={160} required disabled={busy || pendingRetry} onChange={(event) => {
                        setSceneName(event.target.value);
                        attemptRef.current = undefined;
                        setRetry(false);
                        setError("");
                      }} />
                    </label>
                    <dl className="universal-vtt-metrics">
                      <div><dt>Grid size</dt><dd>{formatNumber(currentReview.plan.gridSize)} px</dd></div>
                      <div><dt>Walls</dt><dd>{formatNumber(walls)}</dd></div>
                      <div><dt>Doors</dt><dd>{formatNumber(doors)}</dd></div>
                      <div><dt>Lights</dt><dd>{formatNumber(currentReview.plan.lights.length)}</dd></div>
                    </dl>
                    <p className="universal-vtt-ready"><Check size={16} aria-hidden="true" /> Map image and geometry checked</p>
                    <p>The imported scene stays in preparation until you activate it for players.</p>
                    {currentReview.plan.provenance.software && <p className="universal-vtt-provenance">Exported from {currentReview.plan.provenance.software}</p>}
                  </div>
                  {currentReview.plan.warnings.length > 0 && (
                    <div className="universal-vtt-warnings">
                      <strong><AlertTriangle size={16} aria-hidden="true" /> Review these import notes</strong>
                      <ul>{currentReview.plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
                    </div>
                  )}
                </section>
              )}

              {phase === "importing" && <p className="universal-vtt-progress" role="status"><LoaderCircle size={16} aria-hidden="true" /> Creating your new scene…</p>}
              {error && <p className="universal-vtt-error" role="alert">{error}</p>}
            </>
          )}
        </div>

        <footer className="universal-vtt-footer">
          {busy ? <button className="ghost-button" type="button" onClick={cancelRequest}>Cancel request</button> : <button className="ghost-button" type="button" onClick={closeDialog}>Cancel</button>}
          {props.canImport && <button className="primary-button" type="button" disabled={busy || !currentReview || !sceneName.trim()} onClick={() => void importScene()}>
            <MapPlus size={17} aria-hidden="true" /> {phase === "importing" ? "Importing…" : retry ? "Retry import" : "Import as new scene"}
          </button>}
        </footer>
      </div>
    </div>
  );
}
