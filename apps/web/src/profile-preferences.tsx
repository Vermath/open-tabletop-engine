import type { User, UserPreferences } from "@open-tabletop/core";
import { Check, RefreshCw, UserCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiPatch } from "./api.js";
import { errorMessage } from "./sheet-format.js";

export const defaultUserPreferences: UserPreferences = {
  theme: "midnight",
  dice3dEnabled: true,
  reducedMotion: false,
  chatNotifications: "mentions"
};

export function resolvedUserPreferences(user: Pick<User, "preferences">): UserPreferences {
  return { ...defaultUserPreferences, ...user.preferences };
}

export function updateUserProfile(input: {
  user: User;
  displayName: string;
  preferences: UserPreferences;
  idempotencyKey: string;
}): Promise<{ user: User }> {
  return apiPatch<{ user: User }>("/api/v1/auth/profile", {
    expectedUpdatedAt: input.user.updatedAt,
    displayName: input.displayName.trim(),
    preferences: input.preferences
  }, { idempotencyKey: input.idempotencyKey });
}

export function ProfilePreferences(props: { user: User; onSaved(user: User): void }) {
  const [displayName, setDisplayName] = useState(props.user.displayName);
  const [preferences, setPreferences] = useState<UserPreferences>(() => resolvedUserPreferences(props.user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const attemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | undefined>(undefined);

  useEffect(() => {
    setDisplayName(props.user.displayName);
    setPreferences(resolvedUserPreferences(props.user));
    setError("");
    setSuccess("");
    attemptRef.current = undefined;
  }, [props.user.id, props.user.updatedAt]);

  async function save() {
    const fingerprint = JSON.stringify({ userUpdatedAt: props.user.updatedAt, displayName: displayName.trim(), preferences });
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, idempotencyKey: `profile-preferences:${props.user.id}:${globalThis.crypto.randomUUID()}` };
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await updateUserProfile({ user: props.user, displayName, preferences, idempotencyKey: attemptRef.current.idempotencyKey });
      attemptRef.current = undefined;
      props.onSaved(result.user);
      setSuccess("Profile and play preferences saved across devices.");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-box profile-preferences" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="operator-heading">
        <div><div className="section-title">Profile &amp; preferences</div><h2>Personal play setup</h2></div>
        <UserCog size={17} aria-hidden="true" />
      </div>
      <label><span>Display name</span><input aria-label="Profile display name" autoComplete="name" value={displayName} disabled={busy} onChange={(event) => { setDisplayName(event.target.value); setSuccess(""); }} /></label>
      <label><span>Theme</span><select aria-label="Persisted interface theme" value={preferences.theme} disabled={busy} onChange={(event) => setPreferences((current) => ({ ...current, theme: event.target.value as UserPreferences["theme"] }))}><option value="midnight">Midnight</option><option value="ember">Ember</option></select></label>
      <label className="inline-check"><input type="checkbox" checked={preferences.dice3dEnabled} disabled={busy} onChange={(event) => setPreferences((current) => ({ ...current, dice3dEnabled: event.target.checked }))} /><span>Show 3D dice</span></label>
      <label className="inline-check"><input type="checkbox" checked={preferences.reducedMotion} disabled={busy} onChange={(event) => setPreferences((current) => ({ ...current, reducedMotion: event.target.checked }))} /><span>Reduce interface motion on every device</span></label>
      <label><span>Chat notifications</span><select aria-label="Chat notification preference" value={preferences.chatNotifications} disabled={busy} onChange={(event) => setPreferences((current) => ({ ...current, chatNotifications: event.target.value as UserPreferences["chatNotifications"] }))}><option value="all">All new messages</option><option value="mentions">Mentions and whispers</option><option value="none">None</option></select></label>
      {error && <div className="inline-error" role="alert"><strong>Preferences were not saved.</strong><span>{error}</span><button className="ghost-button small" type="button" disabled={busy} onClick={() => void save()}><RefreshCw size={13} /> Retry</button></div>}
      {success && <p className="panel-success" role="status">{success}</p>}
      <button className="primary-button wide" type="submit" disabled={busy || !displayName.trim()}>{busy ? <RefreshCw className="spin" size={15} /> : <Check size={15} />} {busy ? "Saving..." : "Save profile & preferences"}</button>
    </form>
  );
}
