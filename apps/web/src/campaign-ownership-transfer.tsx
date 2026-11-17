import type { Campaign } from "@open-tabletop/core";
import { ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type CampaignMemberInfo } from "./api.js";

export interface CampaignOwnershipTransferInput {
  targetUserId: string;
  expectedUpdatedAt: string;
  reason?: string;
}

export function eligibleCampaignOwnershipTargets(
  members: CampaignMemberInfo[],
  currentUserId: string
): CampaignMemberInfo[] {
  return members.filter((member) => member.userId !== currentUserId && member.active && !member.source);
}

export function campaignOwnershipConfirmationPhrase(campaignName: string): string {
  return `TRANSFER ${campaignName}`;
}

export function campaignOwnershipTransferErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error);
  const body = typeof error.body === "object" && error.body !== null ? error.body as Record<string, unknown> : {};
  if (body.code === "stale_write") return "Campaign settings changed after you reviewed this transfer. Review the refreshed campaign and confirm again.";
  if (body.code === "campaign_read_only" || body.error === "campaign_archived") return "This campaign is archived. Restore it before transferring ownership.";
  if (error.status === 403) return "Only the current campaign owner can transfer ownership. Your account state may have changed.";
  if (error.status === 409) return error.message || "Ownership could not be transferred because the campaign state conflicts with this request.";
  return error.message;
}

export function CampaignOwnershipTransfer(props: {
  campaign: Campaign;
  members: CampaignMemberInfo[];
  currentUserId: string;
  onTransfer(input: CampaignOwnershipTransferInput, idempotencyKey: string): Promise<void>;
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [inlineError, setInlineError] = useState("");
  const [busy, setBusy] = useState(false);
  const attemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const candidates = useMemo(
    () => eligibleCampaignOwnershipTargets(props.members, props.currentUserId),
    [props.currentUserId, props.members]
  );
  const target = candidates.find((member) => member.userId === targetUserId);
  const confirmationPhrase = campaignOwnershipConfirmationPhrase(props.campaign.name);
  const archived = Boolean(props.campaign.archivedAt);

  useEffect(() => {
    setConfirmation("");
    attemptRef.current = null;
  }, [props.campaign.id, props.campaign.updatedAt]);

  if (props.campaign.ownerUserId !== props.currentUserId) return null;

  async function submitTransfer() {
    if (!target || confirmation !== confirmationPhrase || archived || busy) return;
    const trimmedReason = reason.trim();
    const fingerprint = JSON.stringify([
      props.campaign.id,
      props.campaign.updatedAt,
      target.userId,
      trimmedReason
    ]);
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = {
        fingerprint,
        idempotencyKey: `campaign-owner-transfer:${window.crypto.randomUUID()}`
      };
    }
    setBusy(true);
    setInlineError("");
    try {
      await props.onTransfer({
        targetUserId: target.userId,
        expectedUpdatedAt: props.campaign.updatedAt,
        ...(trimmedReason ? { reason: trimmedReason } : {})
      }, attemptRef.current.idempotencyKey);
    } catch (error) {
      setInlineError(campaignOwnershipTransferErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-box" aria-labelledby="campaign-ownership-transfer-title">
      <div className="section-title" id="campaign-ownership-transfer-title">Campaign Ownership</div>
      <p className="account-summary">
        Ownership grants permanent control of campaign administration. You will remain a GM after the transfer.
      </p>
      <div className="danger-zone">
        <label>
          <span>New owner</span>
          <select
            aria-label="New campaign owner"
            value={targetUserId}
            disabled={busy || archived || candidates.length === 0}
            onChange={(event) => {
              setTargetUserId(event.target.value);
              setConfirmation("");
              setInlineError("");
            }}
          >
            <option value="">Select an active member</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.userId}>
                {member.user.displayName} - {member.role}
              </option>
            ))}
          </select>
        </label>
        {candidates.length === 0 && <p className="account-summary">Invite or activate a direct campaign member before transferring ownership.</p>}
        {archived && <p className="admin-status" role="alert">This campaign is archived. Restore it before transferring ownership.</p>}
        {target && (
          <>
            <label>
              <span>Reason (optional)</span>
              <textarea aria-label="Campaign ownership transfer reason" maxLength={160} value={reason} disabled={busy} onChange={(event) => { setReason(event.target.value); setInlineError(""); }} />
            </label>
            <p className="account-summary">
              To transfer ownership to <strong>{target.user.displayName}</strong>, type <strong>{confirmationPhrase}</strong> exactly.
            </p>
            <input
              aria-label="Confirm campaign ownership transfer"
              autoComplete="off"
              value={confirmation}
              disabled={busy || archived}
              onChange={(event) => { setConfirmation(event.target.value); setInlineError(""); }}
            />
          </>
        )}
        {inlineError && <p className="admin-status" role="alert" aria-live="assertive">{inlineError}</p>}
        <button
          className="ghost-button wide danger-button"
          type="button"
          disabled={!target || confirmation !== confirmationPhrase || archived || busy}
          onClick={() => void submitTransfer()}
        >
          <ShieldAlert size={16} /> {busy ? "Transferring Ownership..." : "Transfer Ownership"}
        </button>
      </div>
    </section>
  );
}
