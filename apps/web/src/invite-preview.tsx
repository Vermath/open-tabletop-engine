import { useEffect, useState } from "react";
import { loadInvitePreview, type InvitePreviewInfo } from "./api.js";
const inviteRoleLabels = { owner: "Owner", gm: "GM", assistant_gm: "Assistant GM", player: "Player", observer: "Observer", plugin: "Plugin", ai_assistant: "AI Assistant" };

export interface InvitePreviewState {
  token: string;
  preview?: InvitePreviewInfo;
  error?: string;
}

export function startInvitePreviewLoad(
  token: string,
  onChange: (state: InvitePreviewState) => void,
  load: typeof loadInvitePreview = loadInvitePreview
): () => void {
  const controller = new AbortController();
  if (token) {
    onChange({ token });
    void load(token, { signal: controller.signal }).then(
      (preview) => {
        if (!controller.signal.aborted) onChange({ token, preview });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) onChange({ token, error: error instanceof Error ? error.message : String(error) });
      }
    );
  }
  return () => controller.abort();
}

export function InvitePreview({ token }: { token: string }) {
  const normalizedToken = token.trim();
  const [state, setState] = useState<InvitePreviewState>();
  useEffect(() => startInvitePreviewLoad(normalizedToken, setState), [normalizedToken]);
  if (!normalizedToken) return null;
  // Hide the old token's result during render, before the effect cleanup runs.
  const current = state?.token === normalizedToken ? state : undefined;
  return (
    <section className="account-summary" aria-label="Invitation details" aria-live="polite" aria-busy={!current?.preview && !current?.error}>
      {current?.preview ? (
        <>
          <strong>{current.preview.campaign.name}</strong>
          <span>Invited as {inviteRoleLabels[current.preview.invite.role]}</span>
          {current.preview.invite.email && <span>For {current.preview.invite.email}</span>}
          {current.preview.invite.status !== "pending" && <span>Invitation {current.preview.invite.status}. {current.preview.invite.status === "accepted" ? "Sign in with the account that joined." : "Ask the GM for a new invitation."}</span>}
        </>
      ) : current?.error ? (
        <span role="alert">Could not load invitation: {current.error}</span>
      ) : (
        <span>Checking invitation...</span>
      )}
    </section>
  );
}
