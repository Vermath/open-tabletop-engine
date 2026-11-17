import type {
  Actor,
  DndCharacterReviewDecisionRequest,
  DndCharacterReviewEffectiveStatus,
  DndCharacterReviewEntry,
  DndCharacterReviewListResponse,
} from "@open-tabletop/core";
import { useEffect, useId, useState } from "react";

import { ApiError, apiGet, apiPatch, apiPost } from "./api.js";

interface DndCharacterReviewPanelProps {
  campaignId: string;
  currentUserId: string;
  canManage: boolean;
  canSubmit(actor: Actor): boolean;
  onChanged(): void;
  onStatus(message: string): void;
}

export function dndCharacterReviewsPath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/character-reviews`;
}

export function dndCharacterReviewStatusLabel(status: DndCharacterReviewEffectiveStatus): string {
  if (status === "not_submitted") return "Not submitted";
  if (status === "changes_requested") return "Changes requested";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function DndCharacterReviewPanel({ campaignId, currentUserId, canManage, canSubmit, onChanged, onStatus }: DndCharacterReviewPanelProps) {
  const headingId = useId();
  const [queue, setQueue] = useState<DndCharacterReviewListResponse>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [pending, setPending] = useState("");
  const [policyDraft, setPolicyDraft] = useState<"optional" | "required">("optional");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    void apiGet<DndCharacterReviewListResponse>(dndCharacterReviewsPath(campaignId), { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setQueue(response);
        setPolicyDraft(response.policy.mode);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setLoadError(reviewErrorMessage(error, "Character reviews could not be loaded."));
      });
    return () => controller.abort();
  }, [campaignId, reloadVersion]);

  function replaceEntry(entry: DndCharacterReviewEntry): void {
    setQueue((current) => current ? {
      ...current,
      entries: current.entries.some((candidate) => candidate.actor.id === entry.actor.id)
        ? current.entries.map((candidate) => candidate.actor.id === entry.actor.id ? entry : candidate)
        : [...current.entries, entry].sort((left, right) => left.actor.name.localeCompare(right.actor.name)),
    } : current);
  }

  function handleMutationError(error: unknown, fallback: string): void {
    const message = reviewErrorMessage(error, fallback);
    const stale = error instanceof ApiError && error.status === 409;
    setFormError(stale ? `${message} The queue was refreshed; review the current character and try again.` : message);
    if (stale) setReloadVersion((value) => value + 1);
    onStatus(message);
  }

  async function savePolicy(): Promise<void> {
    if (!queue || !canManage) return;
    setPending("policy");
    setFormError("");
    try {
      const response = await apiPatch<Pick<DndCharacterReviewListResponse, "policy" | "campaignUpdatedAt">>(
        `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/character-review-policy`,
        { mode: policyDraft, expectedCampaignUpdatedAt: queue.campaignUpdatedAt },
        { idempotencyKey: characterReviewIdempotencyKey("policy") },
      );
      setQueue((current) => current ? { ...current, ...response } : current);
      onStatus(`Character approval is now ${response.policy.mode} for this campaign.`);
      onChanged();
    } catch (error) {
      handleMutationError(error, "Character approval policy could not be updated.");
    } finally {
      setPending("");
    }
  }

  async function submit(entry: DndCharacterReviewEntry): Promise<void> {
    setPending(`submit:${entry.actor.id}`);
    setFormError("");
    try {
      const response = await apiPost<DndCharacterReviewEntry>(
        `${dndCharacterReviewsPath(campaignId)}/${encodeURIComponent(entry.actor.id)}/submit`,
        { expectedActorUpdatedAt: entry.expectedActorUpdatedAt, expectedItemUpdatedAt: entry.expectedItemUpdatedAt },
        { idempotencyKey: characterReviewIdempotencyKey(`submit-${entry.actor.id}`) },
      );
      replaceEntry(response);
      setOverrides((current) => ({ ...current, [entry.actor.id]: false }));
      onStatus(`${entry.actor.name} was submitted for DM review.`);
      onChanged();
    } catch (error) {
      handleMutationError(error, `${entry.actor.name} could not be submitted for review.`);
    } finally {
      setPending("");
    }
  }

  async function decide(entry: DndCharacterReviewEntry, action: DndCharacterReviewDecisionRequest["action"]): Promise<void> {
    const review = entry.review;
    if (!review || entry.effectiveStatus !== "submitted") return;
    const reason = reasons[entry.actor.id]?.trim() ?? "";
    const overrideValidation = action === "approve" && entry.currentValidation.errors > 0 && overrides[entry.actor.id] === true;
    setPending(`${action}:${entry.actor.id}`);
    setFormError("");
    try {
      const response = await apiPost<DndCharacterReviewEntry>(
        `${dndCharacterReviewsPath(campaignId)}/${encodeURIComponent(entry.actor.id)}/decision`,
        {
          action,
          expectedActorUpdatedAt: entry.expectedActorUpdatedAt,
          expectedFingerprint: review.fingerprint,
          ...(reason ? { reason } : {}),
          ...(overrideValidation ? { overrideValidation: true } : {}),
        } satisfies DndCharacterReviewDecisionRequest,
        { idempotencyKey: characterReviewIdempotencyKey(`${action}-${entry.actor.id}`) },
      );
      replaceEntry(response);
      setReasons((current) => ({ ...current, [entry.actor.id]: "" }));
      setOverrides((current) => ({ ...current, [entry.actor.id]: false }));
      onStatus(action === "approve" ? `${entry.actor.name} was approved for play.` : `Changes were requested for ${entry.actor.name}.`);
      onChanged();
    } catch (error) {
      handleMutationError(error, `The decision for ${entry.actor.name} could not be recorded.`);
    } finally {
      setPending("");
    }
  }

  return (
    <section className="operator-section dnd-character-review" aria-labelledby={headingId}>
      <div className="operator-heading">
        <div>
          <div className="section-title">D&amp;D character review</div>
          <h3 id={headingId}>Validation and DM approval</h3>
          <p>Players submit a fingerprinted build; DMs review validation details and record approval, requested changes, or a reasoned exception.</p>
        </div>
        <button className="ghost-button small" type="button" disabled={loadState === "loading"} onClick={() => setReloadVersion((value) => value + 1)}>Refresh</button>
      </div>

      {loadState === "loading" && <p role="status">Loading character review queue...</p>}
      {loadState === "error" && <div className="inline-error" role="alert"><p>{loadError}</p><button className="ghost-button small" type="button" onClick={() => setReloadVersion((value) => value + 1)}>Retry queue</button></div>}
      {formError && <div className="inline-error" role="alert">{formError}</div>}

      {queue && (
        <>
          <div className="character-review-policy" aria-label="Character approval policy">
            <div>
              <strong>Approval gate: {queue.policy.mode === "required" ? "Required" : "Optional"}</strong>
              <p>{queue.policy.configured ? "This campaign has an explicit review policy." : "Legacy default: optional. Existing campaigns are unchanged until a DM explicitly enables the gate."}</p>
            </div>
            {canManage && (
              <div className="character-review-policy-actions">
                <label className="compact-field"><span>Campaign policy</span><select aria-label="Character approval policy mode" value={policyDraft} disabled={Boolean(pending)} onChange={(event) => setPolicyDraft(event.target.value as "optional" | "required")}><option value="optional">Optional review</option><option value="required">Require approval for tokens and combat</option></select></label>
                <button className="ghost-button small" type="button" disabled={Boolean(pending) || policyDraft === queue.policy.mode} onClick={() => void savePolicy()}>{pending === "policy" ? "Saving..." : "Save policy"}</button>
              </div>
            )}
          </div>

          {queue.entries.length === 0 ? <p className="empty-state compact">No visible D&amp;D characters are available for review.</p> : (
            <div className="character-review-list" role="list" aria-label="D&D character review queue">
              {queue.entries.map((entry) => {
                const actorPending = pending.endsWith(`:${entry.actor.id}`);
                const submitted = entry.effectiveStatus === "submitted";
                const reason = reasons[entry.actor.id]?.trim() ?? "";
                const hasErrors = entry.currentValidation.errors > 0;
                const override = overrides[entry.actor.id] === true;
                const canApprove = submitted && (!hasErrors || (override && Boolean(reason)));
                return (
                  <article className="character-review-card" role="listitem" key={entry.actor.id}>
                    <div className="character-review-summary">
                      <div>
                        <strong>{entry.actor.name}</strong>
                        <p>{entry.actor.ownerUserId === currentUserId ? "Your character" : `Owner ${entry.actor.ownerUserId ?? "unassigned"}`} · {entry.actor.systemId}</p>
                      </div>
                      <span className={`character-review-status ${entry.effectiveStatus}`}>{dndCharacterReviewStatusLabel(entry.effectiveStatus)}</span>
                    </div>

                    <p className={hasErrors ? "character-review-validation warning" : "character-review-validation"}>
                      Current validation: {entry.currentValidation.errors} {entry.currentValidation.errors === 1 ? "error" : "errors"}, {entry.currentValidation.warnings} {entry.currentValidation.warnings === 1 ? "warning" : "warnings"}.
                    </p>
                    {entry.stale && <p className="character-review-stale" role="status">The build changed after submission. It must be submitted again before a DM can decide.</p>}
                    {entry.review && <p className="character-review-history">Submitted {formatReviewDate(entry.review.submittedAt)} by {entry.review.submittedByUserId}.{entry.review.decision ? ` ${dndCharacterReviewStatusLabel(entry.review.decision.status)} ${formatReviewDate(entry.review.decision.decidedAt)} by ${entry.review.decision.decidedByUserId}.` : ""}</p>}
                    {entry.review?.decision?.reason && <blockquote>{entry.review.decision.reason}{entry.review.decision.overrideValidation ? " (validation exception)" : ""}</blockquote>}

                    <details className="character-review-issues">
                      <summary>Validation details ({entry.currentValidation.issues.length})</summary>
                      {entry.currentValidation.issues.length === 0 ? <p>No validation issues found.</p> : <ul>{entry.currentValidation.issues.map((issue, index) => <li key={`${issue.entityId}:${issue.path}:${issue.code}:${index}`}><strong>{issue.severity === "error" ? "Error" : "Warning"}:</strong> {issue.message}<small>{issue.entityKind} · {issue.path} · {issue.code}</small></li>)}</ul>}
                    </details>

                    <div className="row-actions">
                      {canSubmit(entry.actor) && <button className="ghost-button small" type="button" disabled={Boolean(pending)} onClick={() => void submit(entry)}>{actorPending && pending.startsWith("submit:") ? "Submitting..." : entry.review ? "Resubmit current build" : "Submit for DM review"}</button>}
                    </div>

                    {canManage && (
                      <fieldset className="character-review-decision" disabled={Boolean(pending) || !submitted}>
                        <legend>DM decision</legend>
                        <label className="compact-field"><span>Decision reason {hasErrors || submitted ? "(required for changes or exceptions)" : ""}</span><textarea value={reasons[entry.actor.id] ?? ""} maxLength={1000} rows={2} onChange={(event) => setReasons((current) => ({ ...current, [entry.actor.id]: event.target.value }))} /></label>
                        {hasErrors && <label className="character-review-override"><input type="checkbox" checked={override} onChange={(event) => setOverrides((current) => ({ ...current, [entry.actor.id]: event.target.checked }))} /> Approve with a documented validation exception.</label>}
                        <div className="row-actions">
                          <button className="ghost-button small" type="button" disabled={!submitted || !reason || Boolean(pending)} onClick={() => void decide(entry, "request_changes")}>{actorPending && pending.startsWith("request_changes:") ? "Recording..." : "Request changes"}</button>
                          <button className="primary-button small" type="button" disabled={!canApprove || Boolean(pending)} onClick={() => void decide(entry, "approve")}>{actorPending && pending.startsWith("approve:") ? "Approving..." : override ? "Approve with exception" : "Approve for play"}</button>
                        </div>
                        {!submitted && <small>Submit a current build before recording a decision.</small>}
                      </fieldset>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function characterReviewIdempotencyKey(action: string): string {
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `character-review-${action}-${id}`;
}

function reviewErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatReviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
