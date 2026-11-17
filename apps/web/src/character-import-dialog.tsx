import { Check, FileJson, ShieldCheck, Upload, UserPlus, X } from "lucide-react";
import { useState } from "react";
import type { Actor } from "@open-tabletop/core";
import type { Snapshot } from "./api.js";
import { characterImportHasDuplicateName, parseCharacterImportJson, type CharacterImportPayload, type CharacterImportReview } from "./character-import.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, formatNumber } from "./sheet-format.js";

const maxCharacterImportBytes = 2 * 1024 * 1024;

export interface CharacterImportOutcome {
  actor: Actor;
  warnings: string[];
  importedItemCount: number;
}

export function CharacterImportDialog(props: {
  systemId: string;
  systemName: string;
  members: Snapshot["members"];
  actorNames: string[];
  currentUserId: string;
  onClose(): void;
  onImport(input: CharacterImportPayload & { ownerUserId: string }): Promise<CharacterImportOutcome>;
}) {
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState("");
  const [review, setReview] = useState<CharacterImportReview>();
  const [ownerUserId, setOwnerUserId] = useState(props.currentUserId);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [lawfulContentConfirmed, setLawfulContentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<CharacterImportOutcome>();
  const closeDialog = () => { if (!busy) props.onClose(); };
  const dialogRef = useModalAccessibility<HTMLDivElement>(closeDialog);
  const duplicateName = review ? characterImportHasDuplicateName(review.payload.name, props.actorNames) : false;

  function replaceJson(nextText: string, nextFileName = "") {
    setJsonText(nextText);
    setFileName(nextFileName);
    setReview(undefined);
    setDuplicateConfirmed(false);
    setError("");
  }

  function reviewJson() {
    setError("");
    if (new TextEncoder().encode(jsonText).byteLength > maxCharacterImportBytes) {
      setReview(undefined);
      setError("Character JSON must be 2 MB or smaller.");
      return;
    }
    try {
      setReview(parseCharacterImportJson(jsonText));
      setDuplicateConfirmed(false);
    } catch (reviewError) {
      setReview(undefined);
      setError(errorMessage(reviewError));
    }
  }

  async function loadFile(file: File) {
    if (file.size > maxCharacterImportBytes) {
      setError("Character JSON must be 2 MB or smaller.");
      setReview(undefined);
      return;
    }
    try {
      replaceJson(await file.text(), file.name);
    } catch (fileError) {
      setError(`Could not read ${file.name}: ${errorMessage(fileError)}`);
    }
  }

  async function submitImport() {
    if (!review || busy || !lawfulContentConfirmed || (duplicateName && !duplicateConfirmed)) return;
    setBusy(true);
    setError("");
    try {
      setOutcome(await props.onImport({ ...review.payload, ownerUserId }));
      setBusy(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div ref={dialogRef} className="modal-dialog character-importer" role="dialog" aria-modal="true" aria-labelledby="character-import-title" aria-describedby="character-import-guidance" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <h2 id="character-import-title">Import a character</h2>
            <p id="character-import-guidance">{props.systemName} · JSON review before creation</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close character import" disabled={busy} onClick={closeDialog}><X size={16} /></button>
        </header>

        <div className="creator-body character-import-body">
          {!outcome && <section className="character-import-source" aria-label="Character JSON source">
            <label className="character-import-file">
              <span><Upload size={14} /> Choose JSON file</span>
              <input
                aria-label="Choose character JSON file"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void loadFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label>
              <span>Paste character JSON</span>
              <textarea
                aria-label="Character import JSON"
                value={jsonText}
                rows={11}
                spellCheck={false}
                disabled={busy}
                placeholder={'{\n  "name": "Character name",\n  "data": { "level": 1 },\n  "items": [],\n  "conditions": []\n}'}
                onChange={(event) => replaceJson(event.target.value)}
              />
            </label>
            {fileName && <p className="character-import-file-name"><FileJson size={14} /> {fileName}</p>}
            <button className="ghost-button" type="button" disabled={busy || !jsonText.trim()} onClick={reviewJson}><Check size={14} /> Review JSON</button>
          </section>}

          {!outcome && review && (
            <section className="character-import-review" aria-label="Character import review" aria-live="polite">
              <div className="operator-heading">
                <div>
                  <div className="section-title">Ready for review</div>
                  <h3>{review.payload.name}</h3>
                </div>
                <span className="status-pill completed">validated</span>
              </div>
              <div className="metric-grid">
                <div className="metric-tile"><span>Data fields</span><strong>{formatNumber(review.dataFieldCount)}</strong></div>
                <div className="metric-tile"><span>Items</span><strong>{formatNumber(review.itemCount)}</strong></div>
                <div className="metric-tile"><span>Conditions</span><strong>{formatNumber(review.conditionCount)}</strong></div>
              </div>
              <label>
                <span>Character owner</span>
                <select aria-label="Imported character owner" value={ownerUserId} disabled={busy} onChange={(event) => setOwnerUserId(event.target.value)}>
                  {props.members.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName || member.user.email} · {member.role}</option>)}
                </select>
              </label>
              {review.ignoredFields.length > 0 && <p className="character-import-note">Server-owned fields ignored: {review.ignoredFields.join(", ")}.</p>}
              {review.unsupportedFields.length > 0 && <p className="character-import-note">Unsupported wrapper fields ignored: {review.unsupportedFields.join(", ")}.</p>}
              {review.normalizedFields.length > 0 && <p className="character-import-note">Flattened fields moved into character data: {review.normalizedFields.join(", ")}.</p>}
              <p className="character-import-note">Unsupported item or condition identifiers may be skipped by the active rules system and reported after import.</p>
              {duplicateName && (
                <label className="inline-check character-import-warning">
                  <input aria-label="Confirm duplicate character name" type="checkbox" checked={duplicateConfirmed} disabled={busy} onChange={(event) => setDuplicateConfirmed(event.target.checked)} />
                  <span>A character named {review.payload.name} already exists. Import another copy.</span>
                </label>
              )}
            </section>
          )}

          {!outcome && <label className="inline-check character-import-license">
            <input aria-label="Confirm lawful character content" type="checkbox" checked={lawfulContentConfirmed} disabled={busy} onChange={(event) => setLawfulContentConfirmed(event.target.checked)} />
            <span><ShieldCheck size={15} /> I have permission to use this data, and it contains only content I can lawfully import.</span>
          </label>}
          {outcome && (
            <section className="character-import-review character-import-complete" aria-label="Character import result" role="status">
              <div className="operator-heading">
                <div>
                  <div className="section-title">Import complete</div>
                  <h3>{outcome.actor.name}</h3>
                </div>
                <span className="status-pill completed">created</span>
              </div>
              <p className="character-import-note">{formatNumber(outcome.importedItemCount)} normalized item{outcome.importedItemCount === 1 ? "" : "s"} added.</p>
              {outcome.warnings.length > 0 ? (
                <div className="character-import-result-warnings">
                  <strong>{formatNumber(outcome.warnings.length)} normalization warning{outcome.warnings.length === 1 ? "" : "s"}</strong>
                  <ul>{outcome.warnings.map((warning, index) => <li key={`${index}:${warning}`}>{warning}</li>)}</ul>
                </div>
              ) : <p className="character-import-note">No rules-system normalization warnings.</p>}
            </section>
          )}
          {error && <p className="creator-error" role="alert">{error}</p>}
        </div>

        <footer className="creator-footer">
          {outcome ? (
            <button className="primary-button wide" type="button" onClick={closeDialog}><Check size={15} /> Done</button>
          ) : (
            <>
              <button className="ghost-button" type="button" disabled={busy} onClick={closeDialog}>Cancel</button>
              <button className="primary-button" type="button" disabled={!review || busy || !lawfulContentConfirmed || (duplicateName && !duplicateConfirmed)} onClick={() => void submitImport()}>
                <UserPlus size={15} /> {busy ? "Importing…" : "Import reviewed character"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
