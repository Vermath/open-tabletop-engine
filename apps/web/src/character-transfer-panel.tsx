import type { Actor, CharacterTransfer, PermissionName } from "@open-tabletop/core";
import { ArrowRightLeft, Check, Eye, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPatch, apiPost, type Snapshot } from "./api.js";
import { errorMessage, formatDateTime, titleCaseLabel } from "./sheet-format.js";

type TransferResolution = "accept" | "decline" | "cancel";

export function characterTransferError(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 403) return "This transfer action is no longer permitted for your account. The transfer was not changed.";
  if (failure instanceof ApiError && failure.status === 409) return `${failure.message} Reload the transfer inbox and review the current character state before retrying.`;
  return errorMessage(failure);
}

export function loadCharacterTransfers(campaignId: string): Promise<CharacterTransfer[]> {
  return apiGet<CharacterTransfer[]>(`/api/v1/campaigns/${campaignId}/character-transfers`);
}

export function requestCharacterTransfer(input: { campaignId: string; actor: Actor; toUserId: string; idempotencyKey: string }): Promise<{ transfer: CharacterTransfer }> {
  return apiPost<{ transfer: CharacterTransfer }>(`/api/v1/campaigns/${input.campaignId}/actors/${input.actor.id}/transfers`, {
    toUserId: input.toUserId,
    expectedUpdatedAt: input.actor.updatedAt
  }, { idempotencyKey: input.idempotencyKey });
}

export function resolveCharacterTransfer(input: { campaignId: string; transfer: CharacterTransfer; resolution: TransferResolution; idempotencyKey: string }): Promise<{ transfer: CharacterTransfer; actor?: Actor }> {
  return apiPost<{ transfer: CharacterTransfer; actor?: Actor }>(
    `/api/v1/campaigns/${input.campaignId}/character-transfers/${input.transfer.id}/${input.resolution}`,
    { expectedUpdatedAt: input.transfer.updatedAt },
    { idempotencyKey: input.idempotencyKey }
  );
}

export function shareCharacterPrivateDetails(input: { actor: Actor; userId: string; share: boolean; idempotencyKey: string }): Promise<Actor> {
  const current = input.actor.permissions[input.userId] ?? [];
  const next = new Set<PermissionName>(current);
  if (input.share) next.add("actor.readPrivate");
  else next.delete("actor.readPrivate");
  const permissions = { ...input.actor.permissions };
  if (next.size > 0) permissions[input.userId] = [...next];
  else delete permissions[input.userId];
  return apiPatch<Actor>(`/api/v1/actors/${input.actor.id}`, {
    permissions,
    expectedUpdatedAt: input.actor.updatedAt
  }, { idempotencyKey: input.idempotencyKey });
}

export function CharacterTransferPanel(props: {
  campaignId: string;
  currentUserId: string;
  actors: Actor[];
  members: Snapshot["members"];
  canTransferCharacters: boolean;
  canShareCharacters: boolean;
  refreshSignal: number;
  onActorUpdated(actor: Actor): void;
  onPendingCount?(count: number): void;
}) {
  const [transfers, setTransfers] = useState<CharacterTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [actorId, setActorId] = useState("");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [reviewRequest, setReviewRequest] = useState(false);
  const [reviewResolution, setReviewResolution] = useState<{ transferId: string; resolution: TransferResolution }>();
  const [shareActorId, setShareActorId] = useState("");
  const [shareUserId, setShareUserId] = useState("");
  const actionAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | undefined>(undefined);
  const retryRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const actors = useMemo(() => props.actors.filter((actor) => actor.campaignId === props.campaignId && actor.type === "character"), [props.actors, props.campaignId]);
  const transferableActors = props.canShareCharacters ? actors : actors.filter((actor) => actor.ownerUserId === props.currentUserId);
  const members = useMemo(() => props.members.filter((member) => member.active !== false && member.role !== "plugin" && member.role !== "ai_assistant"), [props.members]);
  const actorById = useMemo(() => new Map(actors.map((actor) => [actor.id, actor])), [actors]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.user.id, member])), [members]);
  const selectedActor = actorById.get(actorId);
  const selectedShareActor = actorById.get(shareActorId);
  const incoming = transfers.filter((transfer) => transfer.toUserId === props.currentUserId && transfer.status === "pending");
  const cancellable = transfers.filter((transfer) => transfer.status === "pending" && (transfer.initiatedByUserId === props.currentUserId || actorById.get(transfer.actorId)?.ownerUserId === props.currentUserId));
  const relevantHistory = transfers.filter((transfer) => transfer.status !== "pending" || transfer.toUserId === props.currentUserId || transfer.fromUserId === props.currentUserId || transfer.initiatedByUserId === props.currentUserId).slice(0, 12);

  const nextAttempt = (fingerprint: string) => {
    if (actionAttemptRef.current?.fingerprint !== fingerprint) {
      actionAttemptRef.current = { fingerprint, idempotencyKey: `character-transfer:${globalThis.crypto.randomUUID()}` };
    }
    return actionAttemptRef.current.idempotencyKey;
  };

  async function reload(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
    setFailure("");
    try {
      const next = await loadCharacterTransfers(props.campaignId);
      setTransfers(next);
      props.onPendingCount?.(next.filter((transfer) => transfer.toUserId === props.currentUserId && transfer.status === "pending").length);
      retryRef.current = undefined;
    } catch (error) {
      setFailure(characterTransferError(error));
      retryRef.current = () => reload();
    } finally {
      if (!options.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [props.campaignId, props.currentUserId, props.refreshSignal]);

  useEffect(() => {
    const onFocus = () => void reload({ quiet: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [props.campaignId, props.currentUserId]);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setFailure("");
    setNotice("");
    retryRef.current = action;
    try {
      await action();
      retryRef.current = undefined;
    } catch (error) {
      setFailure(characterTransferError(error));
    } finally {
      setBusyKey("");
    }
  }

  async function submitTransfer() {
    if (!selectedActor || !recipientUserId) return;
    if (!reviewRequest) {
      setReviewRequest(true);
      setFailure("");
      return;
    }
    const fingerprint = `request:${selectedActor.id}:${selectedActor.updatedAt}:${recipientUserId}`;
    await runAction("request", async () => {
      const result = await requestCharacterTransfer({ campaignId: props.campaignId, actor: selectedActor, toUserId: recipientUserId, idempotencyKey: nextAttempt(fingerprint) });
      actionAttemptRef.current = undefined;
      setTransfers((current) => [result.transfer, ...current.filter((transfer) => transfer.id !== result.transfer.id)]);
      setReviewRequest(false);
      setNotice(`Transfer sent to ${memberById.get(recipientUserId)?.user.displayName ?? recipientUserId}. They must accept before ownership changes.`);
    });
  }

  async function resolveTransfer(transfer: CharacterTransfer, resolution: TransferResolution) {
    if (reviewResolution?.transferId !== transfer.id || reviewResolution.resolution !== resolution) {
      setReviewResolution({ transferId: transfer.id, resolution });
      setFailure("");
      return;
    }
    const fingerprint = `${resolution}:${transfer.id}:${transfer.updatedAt}`;
    await runAction(`${resolution}:${transfer.id}`, async () => {
      const result = await resolveCharacterTransfer({ campaignId: props.campaignId, transfer, resolution, idempotencyKey: nextAttempt(fingerprint) });
      actionAttemptRef.current = undefined;
      setTransfers((current) => current.map((candidate) => candidate.id === result.transfer.id ? result.transfer : candidate));
      if (result.actor) props.onActorUpdated(result.actor);
      setReviewResolution(undefined);
      setNotice(resolution === "accept" ? "Character ownership accepted. The updated sheet is ready." : resolution === "decline" ? "Character transfer declined; ownership did not change." : "Character transfer cancelled.");
      props.onPendingCount?.(incoming.filter((candidate) => candidate.id !== transfer.id).length);
    });
  }

  async function updateSharing() {
    if (!selectedShareActor || !shareUserId) return;
    const shared = selectedShareActor.permissions[shareUserId]?.includes("actor.readPrivate") === true;
    const fingerprint = `share:${selectedShareActor.id}:${selectedShareActor.updatedAt}:${shareUserId}:${!shared}`;
    await runAction("share", async () => {
      const updated = await shareCharacterPrivateDetails({ actor: selectedShareActor, userId: shareUserId, share: !shared, idempotencyKey: nextAttempt(fingerprint) });
      actionAttemptRef.current = undefined;
      props.onActorUpdated(updated);
      setNotice(`${memberById.get(shareUserId)?.user.displayName ?? shareUserId} ${shared ? "no longer has" : "now has"} view access to ${updated.name}'s private sheet.`);
    });
  }

  return (
    <section className="account-box character-transfer-panel" aria-labelledby="character-transfer-title" aria-busy={loading || Boolean(busyKey)}>
      <div className="operator-heading">
        <div><div className="section-title">Characters</div><h2 id="character-transfer-title">Sharing &amp; ownership transfers</h2></div>
        <ArrowRightLeft size={18} aria-hidden="true" />
      </div>
      <p className="account-summary">Sharing gives read-only private-sheet access. A transfer changes the character owner only after the recipient explicitly accepts the exact reviewed revision.</p>

      {incoming.length > 0 && (
        <div className="character-transfer-inbox" aria-label="Pending character transfers">
          <strong>{incoming.length} transfer {incoming.length === 1 ? "needs" : "need"} your response</strong>
          {incoming.map((transfer) => {
            const actor = actorById.get(transfer.actorId);
            const reviewing = reviewResolution?.transferId === transfer.id ? reviewResolution.resolution : undefined;
            return (
              <article className="character-transfer-card incoming" key={transfer.id}>
                <div><strong>{actor?.name ?? "Character"}</strong><span>From {memberById.get(transfer.fromUserId ?? "")?.user.displayName ?? "the current owner"}</span><small>Requested {formatDateTime(transfer.createdAt)}</small></div>
                {reviewing ? (
                  <div className="character-transfer-confirm" role="alert">
                    <span>{reviewing === "accept" ? `Accept ownership of ${actor?.name ?? "this character"}? Future character writes become your responsibility.` : "Decline this transfer? Ownership will remain unchanged."}</span>
                    <button className={reviewing === "accept" ? "primary-button small" : "ghost-button small danger-button"} type="button" disabled={Boolean(busyKey)} onClick={() => void resolveTransfer(transfer, reviewing)}><Check size={13} /> Confirm {reviewing}</button>
                    <button className="ghost-button small" type="button" disabled={Boolean(busyKey)} onClick={() => setReviewResolution(undefined)}><X size={13} /> Keep pending</button>
                  </div>
                ) : (
                  <div className="button-row">
                    <button className="primary-button small" type="button" disabled={Boolean(busyKey)} onClick={() => void resolveTransfer(transfer, "accept")}><Check size={13} /> Review acceptance</button>
                    <button className="ghost-button small" type="button" disabled={Boolean(busyKey)} onClick={() => void resolveTransfer(transfer, "decline")}><X size={13} /> Review decline</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {cancellable.length > 0 && (
        <div className="character-transfer-inbox outgoing" aria-label="Outgoing character transfers">
          <strong>Awaiting recipient response</strong>
          {cancellable.map((transfer) => {
            const actor = actorById.get(transfer.actorId);
            const reviewing = reviewResolution?.transferId === transfer.id && reviewResolution.resolution === "cancel";
            return (
              <article className="character-transfer-card" key={transfer.id}>
                <div><strong>{actor?.name ?? "Character"}</strong><span>Sent to {memberById.get(transfer.toUserId)?.user.displayName ?? transfer.toUserId}</span><small>The request becomes stale if the character changes.</small></div>
                {reviewing ? <div className="character-transfer-confirm" role="alert"><span>Cancel this pending transfer? Ownership will remain unchanged.</span><button className="ghost-button small danger-button" type="button" disabled={Boolean(busyKey)} onClick={() => void resolveTransfer(transfer, "cancel")}><Check size={13} /> Confirm cancel</button><button className="ghost-button small" type="button" onClick={() => setReviewResolution(undefined)}>Keep pending</button></div> : <button className="ghost-button small" type="button" disabled={Boolean(busyKey)} onClick={() => void resolveTransfer(transfer, "cancel")}><X size={13} /> Review cancellation</button>}
              </article>
            );
          })}
        </div>
      )}

      {props.canTransferCharacters && (
        <>
          <form className="character-transfer-request" onSubmit={(event) => { event.preventDefault(); void submitTransfer(); }}>
            <div className="section-title">Transfer ownership</div>
            <select aria-label="Character to transfer" value={actorId} disabled={Boolean(busyKey)} onChange={(event) => { setActorId(event.target.value); setReviewRequest(false); }}><option value="">Select character</option>{transferableActors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name} - owner {memberById.get(actor.ownerUserId ?? "")?.user.displayName ?? "unassigned"}</option>)}</select>
            <select aria-label="Character transfer recipient" value={recipientUserId} disabled={Boolean(busyKey)} onChange={(event) => { setRecipientUserId(event.target.value); setReviewRequest(false); }}><option value="">Select recipient</option>{members.filter((member) => member.user.id !== selectedActor?.ownerUserId).map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName} - {titleCaseLabel(member.role)}</option>)}</select>
            {reviewRequest && selectedActor && recipientUserId && <div className="character-transfer-confirm" role="alert"><strong>Review ownership change</strong><span>{selectedActor.name} will remain with its current owner until {memberById.get(recipientUserId)?.user.displayName ?? recipientUserId} accepts. The request becomes stale if the character changes first.</span></div>}
            <button className={reviewRequest ? "primary-button wide" : "ghost-button wide"} type="submit" disabled={Boolean(busyKey) || !selectedActor || !recipientUserId}>{busyKey === "request" ? <RefreshCw className="spin" size={14} /> : <ArrowRightLeft size={14} />} {reviewRequest ? "Send reviewed transfer" : "Review transfer"}</button>
          </form>

          {props.canShareCharacters && <div className="character-share-form">
            <div className="section-title">Private sheet sharing</div>
            <select aria-label="Character to share" value={shareActorId} disabled={Boolean(busyKey)} onChange={(event) => setShareActorId(event.target.value)}><option value="">Select character</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select>
            <select aria-label="Character share recipient" value={shareUserId} disabled={Boolean(busyKey)} onChange={(event) => setShareUserId(event.target.value)}><option value="">Select member</option>{members.filter((member) => member.user.id !== selectedShareActor?.ownerUserId).map((member) => <option key={member.user.id} value={member.user.id}>{member.user.displayName}</option>)}</select>
            <button className="ghost-button wide" type="button" disabled={Boolean(busyKey) || !selectedShareActor || !shareUserId} onClick={() => void updateSharing()}><Eye size={14} /> {selectedShareActor?.permissions[shareUserId]?.includes("actor.readPrivate") ? "Remove private view access" : "Share private sheet view"}</button>
          </div>}
        </>
      )}

      <details className="character-transfer-history">
        <summary><ShieldCheck size={14} /> Transfer history ({relevantHistory.length})</summary>
        {relevantHistory.length === 0 ? <p className="account-summary">No resolved transfers visible to this account.</p> : relevantHistory.map((transfer) => <div className="operator-row" key={transfer.id}><span>{actorById.get(transfer.actorId)?.name ?? transfer.actorId} to {memberById.get(transfer.toUserId)?.user.displayName ?? transfer.toUserId}</span><strong>{titleCaseLabel(transfer.status)}</strong></div>)}
      </details>
      {loading && <p className="panel-status-line" role="status"><RefreshCw className="spin" size={13} /> Loading transfer inbox...</p>}
      {failure && <div className="inline-error" role="alert"><strong>Character transfer action failed.</strong><span>{failure}</span>{retryRef.current && <button className="ghost-button small" type="button" disabled={Boolean(busyKey)} onClick={() => void runAction("retry", retryRef.current!)}><RefreshCw size={13} /> Retry safely</button>}<button className="ghost-button small" type="button" onClick={() => setFailure("")}>Dismiss</button></div>}
      {notice && <p className="panel-success" role="status">{notice}</p>}
      <button className="ghost-button small" type="button" disabled={loading || Boolean(busyKey)} onClick={() => void reload()}><RefreshCw size={13} /> Refresh transfer inbox</button>
    </section>
  );
}
