import type { RealtimePresentation } from "@open-tabletop/core";
import { useEffect, useRef, useState } from "react";
import { apiPost, baseUrl, type Snapshot } from "./api.js";
import { MarkdownDocument } from "./markdown-document.js";
import type { PinTarget } from "./scene-pin-drag.js";
import { errorMessage } from "./sheet-format.js";

export type PresentationTarget = PinTarget & { expectedUpdatedAt: string; sceneId?: string; pinId?: string };

export function PresentToPlayers({ campaignId, target, members }: { campaignId: string; target: PresentationTarget; members: Snapshot["members"] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const players = members.filter((member) => member.role === "player" && member.active !== false);
  const recipientUserIds = players.filter((member) => selected.includes(member.user.id)).map((member) => member.user.id);
  async function present() {
    setBusy(true);
    setStatus("");
    try {
      const result = await apiPost<{ deliveredUserIds: string[] }>(`/api/v1/campaigns/${campaignId}/presentations`, { ...target, recipientUserIds });
      const delivered = result.deliveredUserIds.length;
      setStatus(`Reached ${delivered} of ${recipientUserIds.length} selected players.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return <details className="lore-link-drawer">
    <summary>Show to players</summary>
    <p>Show the saved text and uploaded images to connected players for five minutes. The saved audience stays the same.</p>
    <fieldset className="lore-target-grid" disabled={busy}>
      <legend>Recipients</legend>
      {players.length === 0 && <p>No player seats in this campaign.</p>}
      {players.map(({ user }) => <label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={(event) => {
        setSelected(event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id));
        setStatus("");
      }} />{user.displayName}</label>)}
    </fieldset>
    <button type="button" className="primary-button" disabled={busy || !recipientUserIds.length} onClick={() => void present()}>Show selected players</button>
    {status && <p role="status">{status}</p>}
  </details>;
}

export function isPresentation(value: unknown): value is RealtimePresentation {
  if (typeof value !== "object" || !value) return false;
  const message = value as Partial<RealtimePresentation>;
  return message.channel === "presentation" && typeof message.id === "string" && typeof message.campaignId === "string"
    && typeof message.title === "string" && typeof message.body === "string" && typeof message.expiresAt === "number"
    && Array.isArray(message.images) && message.images.every((image) => image && typeof image.assetId === "string" && typeof image.name === "string");
}

export function PresentedContent({ content, onDismiss }: { content: RealtimePresentation; onDismiss(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const timeout = window.setTimeout(() => dismiss.current(), Math.max(0, content.expiresAt - Date.now()));
    return () => { window.clearTimeout(timeout); element?.close(); };
  }, [content.id, content.expiresAt]);
  return <dialog ref={dialog} className="scene-pin-dialog presented-content" aria-label="Shared by the GM" onCancel={onDismiss}>
    <div className="lore-editor-title"><h2>{content.title}</h2><button type="button" className="ghost-button" onClick={onDismiss}>Dismiss</button></div>
    <MarkdownDocument source={content.body} label={content.title} />
    {content.images.map(({ assetId, name }) => <img key={assetId} alt={name} crossOrigin="use-credentials"
      src={`${baseUrl}/api/v1/assets/${encodeURIComponent(assetId)}/blob?presentationId=${encodeURIComponent(content.id)}&variant=optimized`} />)}
  </dialog>;
}
