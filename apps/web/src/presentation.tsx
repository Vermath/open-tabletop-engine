import type { PresentationTarget, PresentationReceipt } from "@open-tabletop/api-contracts";
import { PRESENTATION_TTL_MS, type RealtimePresentation } from "@open-tabletop/core";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, baseUrl, type Snapshot } from "./api.js";
import { MarkdownDocument } from "./markdown-document.js";
import { errorMessage } from "./sheet-format.js";

export function presentationSeatAccess(scope: Snapshot["membershipScope"], campaignId: string, userId: string, sessionEpoch: number, members: Snapshot["members"], recipientSeat?: RealtimePresentation["recipientSeat"]): "pending" | "allowed" | "denied" {
  if (!scope || scope.campaignId !== campaignId || scope.userId !== userId || scope.sessionEpoch !== sessionEpoch) return "pending";
  const member = members.find((row) => row.campaignId === campaignId && row.user.id === userId);
  if (!member || member.active === false || (recipientSeat && (recipientSeat.id !== member.id || recipientSeat.userId !== userId))) return "denied";
  if (member.role === "player") return "allowed";
  // A newer server-validated grant can arrive after a scene update discarded the promotion snapshot.
  return recipientSeat && Date.parse(recipientSeat.updatedAt) > Date.parse(member.updatedAt) ? "allowed" : "denied";
}

export function PresentToPlayers({ campaignId, target, members }: { campaignId: string; target: PresentationTarget; members: Snapshot["members"] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [roster, setRoster] = useState<{ campaignId: string; snapshot: Snapshot["members"]; rows: Snapshot["members"] }>();
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    apiGet<Snapshot["members"]>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/members`, { signal: controller.signal })
      .then((rows) => {
        if (!controller.signal.aborted) setRoster({ campaignId, snapshot: members, rows });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus(`Could not load recipients. Reopen the list to retry. ${errorMessage(error)}`);
      });
    return () => controller.abort();
  }, [expanded, campaignId, members]);
  const currentRoster = roster?.campaignId === campaignId && roster.snapshot === members ? roster.rows : undefined;
  const players = (currentRoster ?? members).filter((member) => member.role === "player" && member.active !== false);
  const recipientUserIds = players.filter((member) => selected.includes(member.user.id)).map((member) => member.user.id);
  async function present() {
    setBusy(true);
    setStatus("");
    try {
      const result = await apiPost<PresentationReceipt>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/presentations`, { ...target, recipientUserIds });
      const delivered = result.deliveredUserIds.length;
      setStatus(`Reached ${delivered} of ${recipientUserIds.length} selected players.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return <details className="lore-link-drawer" onToggle={(event) => {
    setExpanded(event.currentTarget.open);
    if (!event.currentTarget.open) { setRoster(undefined); setStatus(""); }
  }}>
    <summary>Show to players</summary>
    <p>Show the saved text and uploaded images to connected players for five minutes. The saved audience stays the same.</p>
    <fieldset className="lore-target-grid" disabled={busy || (expanded && !currentRoster)}>
      <legend>Recipients</legend>
      {players.length === 0 && <p>No player seats in this campaign.</p>}
      {players.map(({ user }) => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={(event) => {
        setSelected(event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id));
        setStatus("");
      }} />{user.displayName}</label>)}
    </fieldset>
    <button type="button" className="primary-button" disabled={busy || !currentRoster || !recipientUserIds.length} onClick={() => void present()}>Show selected players</button>
    {status && <p role="status">{status}</p>}
  </details>;
}

export function isPresentation(value: unknown): value is RealtimePresentation {
  if (typeof value !== "object" || !value) return false;
  const message = value as Partial<RealtimePresentation>;
  return message.channel === "presentation" && typeof message.id === "string" && typeof message.campaignId === "string"
    && typeof message.title === "string" && typeof message.body === "string" && typeof message.expiresAt === "number"
    && (message.recipientSeat === undefined || Boolean(message.recipientSeat && typeof message.recipientSeat.id === "string"
      && typeof message.recipientSeat.userId === "string" && typeof message.recipientSeat.updatedAt === "string" && Number.isFinite(Date.parse(message.recipientSeat.updatedAt))))
    && Array.isArray(message.images) && message.images.every((image) => image && typeof image.assetId === "string" && typeof image.name === "string");
}

export function usePlayerPresentation(snapshot: Pick<Snapshot, "members" | "membershipScope">, campaignId: string, userId: string, sessionEpoch: number, connectionKey: string | null) {
  const [presentation, setPresentation] = useState<{ connectionKey: string; content: RealtimePresentation }>();
  const sendDismiss = useRef<((id: string) => void) | undefined>(undefined);
  const revokedIds = useRef(new Map<string, number>());
  const content = presentation?.connectionKey === connectionKey ? presentation?.content : undefined;
  const access = presentationSeatAccess(snapshot.membershipScope, campaignId, userId, sessionEpoch, snapshot.members, content?.recipientSeat);

  function dismiss(id: string) {
    sendDismiss.current?.(id);
    setPresentation((current) => current?.content.id === id ? undefined : current);
  }
  useEffect(() => {
    if (!content) return;
    const remaining = content.expiresAt - Date.now();
    if (access === "denied" || remaining <= 0) { dismiss(content.id); return; }
    const timer = window.setTimeout(() => dismiss(content.id), remaining);
    return () => window.clearTimeout(timer);
  }, [content, access]);

  return {
    connect(send: (id: string) => void) { sendDismiss.current = send; },
    disconnect() { sendDismiss.current = undefined; revokedIds.current.clear(); setPresentation(undefined); },
    receive(message: unknown): boolean {
      if (message && typeof message === "object" && "channel" in message && message.channel === "presentation.revoked") {
        if ("campaignId" in message && message.campaignId === campaignId && "id" in message && typeof message.id === "string") {
          const now = Date.now();
          for (const [id, until] of revokedIds.current) if (until <= now) revokedIds.current.delete(id);
          revokedIds.current.set(message.id, now + PRESENTATION_TTL_MS);
          setPresentation((current) => current?.content.id === message.id ? undefined : current);
        }
        return true;
      }
      if (!isPresentation(message)) return false;
      if (connectionKey && message.campaignId === campaignId && message.expiresAt > Date.now() && !revokedIds.current.has(message.id)) setPresentation({ connectionKey, content: message });
      return true;
    },
    dialog: access === "allowed" && content && content.expiresAt > Date.now()
      ? <PresentedContent content={content} onDismiss={() => dismiss(content.id)} /> : null,
  };
}

function PresentedContent({ content, onDismiss }: { content: RealtimePresentation; onDismiss(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [content.id]);
  return <dialog ref={dialog} className="scene-pin-dialog presented-content" aria-label="Shared by the GM" onCancel={onDismiss}>
    <div className="lore-editor-title"><h2>{content.title}</h2><button type="button" className="ghost-button" onClick={onDismiss}>Dismiss</button></div>
    <MarkdownDocument source={content.body} label={content.title} />
    {content.images.map(({ assetId, name }) => <img key={assetId} alt={name} crossOrigin="use-credentials"
      src={`${baseUrl}/api/v1/assets/${encodeURIComponent(assetId)}/blob?presentationId=${encodeURIComponent(content.id)}&variant=optimized`} />)}
  </dialog>;
}
