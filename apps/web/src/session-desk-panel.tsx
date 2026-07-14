import type { Encounter, Scene } from "@open-tabletop/core";
import { CalendarDays, CheckCircle2, Clock3, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, type CampaignSessionInfo } from "./api.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";

function toggleId(values: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, id])] : values.filter((value) => value !== id);
}

function localDateTimeValue(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function campaignSessionSort(sessions: CampaignSessionInfo[]): CampaignSessionInfo[] {
  const rank = { live: 0, planned: 1, completed: 2 } as const;
  return [...sessions].sort((left, right) => rank[left.status] - rank[right.status] || right.number - left.number);
}

export interface SessionDraft {
  id?: string;
  title: string;
  agenda: string;
  notes: string;
  scheduledFor: string;
  sceneIds: string[];
  encounterIds: string[];
}

export function sessionDraftPayload(input: SessionDraft) {
  return {
    title: input.title.trim(),
    agenda: input.agenda.trim(),
    notes: input.notes.trim(),
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor).toISOString() : null,
    sceneIds: input.sceneIds,
    encounterIds: input.encounterIds
  };
}

export function campaignSessionMutationKey(operation: string, sessionId = "new"): string {
  return `campaign-session:${operation}:${sessionId}:${globalThis.crypto.randomUUID()}`;
}

export function persistCampaignSession(campaignId: string, input: SessionDraft, expectedUpdatedAt?: string, idempotencyKey = campaignSessionMutationKey(input.id ? "update" : "create", input.id)): Promise<CampaignSessionInfo> {
  const payload = sessionDraftPayload(input);
  return input.id
    ? apiPatch<CampaignSessionInfo>(`/api/v1/campaign-sessions/${input.id}`, { ...payload, expectedUpdatedAt }, { idempotencyKey })
    : apiPost<CampaignSessionInfo>(`/api/v1/campaigns/${campaignId}/sessions`, payload, { idempotencyKey });
}

export function startCampaignSession(sessionId: string, activateSceneId: string, expectedUpdatedAt: string, idempotencyKey = campaignSessionMutationKey("start", sessionId)): Promise<CampaignSessionInfo> {
  return apiPost<CampaignSessionInfo>(`/api/v1/campaign-sessions/${sessionId}/start`, { expectedUpdatedAt, ...(activateSceneId ? { activateSceneId } : {}) }, { idempotencyKey });
}

export function completeCampaignSession(sessionId: string, notes: string, expectedUpdatedAt: string, idempotencyKey = campaignSessionMutationKey("complete", sessionId)): Promise<CampaignSessionInfo> {
  return apiPost<CampaignSessionInfo>(`/api/v1/campaign-sessions/${sessionId}/complete`, { notes, expectedUpdatedAt }, { idempotencyKey });
}

export function deleteCampaignSession(sessionId: string, expectedUpdatedAt: string, idempotencyKey = campaignSessionMutationKey("delete", sessionId)): Promise<unknown> {
  return apiDelete<unknown>(`/api/v1/campaign-sessions/${sessionId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, { idempotencyKey });
}

export function staleCampaignSession(error: unknown): CampaignSessionInfo | undefined {
  if (!(error instanceof ApiError) || error.status !== 409 || typeof error.body !== "object" || error.body === null) return undefined;
  const current = (error.body as { current?: unknown }).current;
  if (typeof current !== "object" || current === null) return undefined;
  const candidate = current as Partial<CampaignSessionInfo>;
  return typeof candidate.id === "string" && typeof candidate.updatedAt === "string" && typeof candidate.title === "string" ? candidate as CampaignSessionInfo : undefined;
}

async function refreshStaleCampaignSession(error: unknown, sessionId: string): Promise<CampaignSessionInfo | undefined> {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  try {
    return await apiGet<CampaignSessionInfo>(`/api/v1/campaign-sessions/${sessionId}`);
  } catch {
    return staleCampaignSession(error);
  }
}

export function LiveSessionBanner(props: { session: CampaignSessionInfo; sceneName?: string; canComplete: boolean; onOpen(): void; onComplete(): void }) {
  const [completeArmed, setCompleteArmed] = useState(false);
  return (
    <section className="live-session-banner" aria-label={`Live session ${props.session.title}`}>
      <span className="live-session-pulse" aria-hidden="true" />
      <div>
        <strong>Session {formatNumber(props.session.number)} · {props.session.title}</strong>
        <span>{props.sceneName ? `${props.sceneName} is live` : "Table session in progress"}{props.session.startedAt ? ` · started ${formatDateTime(props.session.startedAt)}` : ""}</span>
      </div>
      <button className="ghost-button small" type="button" onClick={props.onOpen}>Open desk</button>
      {props.canComplete && <button className="primary-button small" type="button" onClick={() => { if (completeArmed) props.onComplete(); else setCompleteArmed(true); }}><CheckCircle2 size={13} /> {completeArmed ? "Confirm complete" : "Complete"}</button>}
    </section>
  );
}

export function SessionDeskPanel(props: {
  campaignId: string;
  sessions: CampaignSessionInfo[];
  scenes: Scene[];
  encounters: Encounter[];
  canManage: boolean;
  canStart: boolean;
  onSessionsChange(sessions: CampaignSessionInfo[]): void;
  onSceneActivated(sceneId: string): void;
  onStatus(message: string): void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryAction, setRetryAction] = useState<{ label: string; run(): Promise<void> }>();
  const selected = props.sessions.find((session) => session.id === selectedId);
  const sessions = campaignSessionSort(props.sessions);

  useEffect(() => {
    if (selectedId && !props.sessions.some((session) => session.id === selectedId)) setSelectedId("");
  }, [props.sessions, selectedId]);

  function replaceSession(updated: CampaignSessionInfo) {
    props.onSessionsChange(props.sessions.some((session) => session.id === updated.id) ? props.sessions.map((session) => session.id === updated.id ? updated : session) : [...props.sessions, updated]);
  }

  async function saveSession(input: SessionDraft, expectedUpdatedAt = selected?.updatedAt, idempotencyKey = campaignSessionMutationKey(input.id ? "update" : "create", input.id)) {
    if (!input.title.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await persistCampaignSession(props.campaignId, input, expectedUpdatedAt, idempotencyKey);
      replaceSession(updated);
      setSelectedId(updated.id);
      setCreating(false);
      setRetryAction(undefined);
      props.onStatus(`${updated.title} ${input.id ? "updated" : "planned"}`);
    } catch (error) {
      const latest = input.id ? await refreshStaleCampaignSession(error, input.id) : undefined;
      if (latest) replaceSession(latest);
      const retryExpected = latest?.updatedAt ?? expectedUpdatedAt;
      const retryKey = latest ? campaignSessionMutationKey("update", input.id) : idempotencyKey;
      setRetryAction({ label: "Retry session save", run: () => saveSession(input, retryExpected, retryKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session save failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function startSession(session: CampaignSessionInfo, activateSceneId: string, expectedUpdatedAt = session.updatedAt, idempotencyKey = campaignSessionMutationKey("start", session.id)) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await startCampaignSession(session.id, activateSceneId, expectedUpdatedAt, idempotencyKey);
      replaceSession(updated);
      if (activateSceneId) props.onSceneActivated(activateSceneId);
      setRetryAction(undefined);
      props.onStatus(`${updated.title} is live`);
    } catch (error) {
      const latest = await refreshStaleCampaignSession(error, session.id);
      if (latest) replaceSession(latest);
      setRetryAction({ label: "Retry session start", run: () => startSession(latest ?? session, activateSceneId, latest?.updatedAt ?? expectedUpdatedAt, latest ? campaignSessionMutationKey("start", session.id) : idempotencyKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session start failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function completeSession(session: CampaignSessionInfo, notes: string, expectedUpdatedAt = session.updatedAt, idempotencyKey = campaignSessionMutationKey("complete", session.id)) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await completeCampaignSession(session.id, notes, expectedUpdatedAt, idempotencyKey);
      replaceSession(updated);
      setRetryAction(undefined);
      props.onStatus(`${updated.title} completed`);
    } catch (error) {
      const latest = await refreshStaleCampaignSession(error, session.id);
      if (latest) replaceSession(latest);
      setRetryAction({ label: "Retry session completion", run: () => completeSession(latest ?? session, notes, latest?.updatedAt ?? expectedUpdatedAt, latest ? campaignSessionMutationKey("complete", session.id) : idempotencyKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session completion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(session: CampaignSessionInfo, expectedUpdatedAt = session.updatedAt, idempotencyKey = campaignSessionMutationKey("delete", session.id)) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCampaignSession(session.id, expectedUpdatedAt, idempotencyKey);
      props.onSessionsChange(props.sessions.filter((item) => item.id !== session.id));
      setSelectedId("");
      setRetryAction(undefined);
      props.onStatus(`${session.title} deleted`);
    } catch (error) {
      const latest = await refreshStaleCampaignSession(error, session.id);
      if (latest) replaceSession(latest);
      setRetryAction({ label: "Retry session deletion", run: () => deleteSession(latest ?? session, latest?.updatedAt ?? expectedUpdatedAt, latest ? campaignSessionMutationKey("delete", session.id) : idempotencyKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session deletion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-stack lore-panel session-desk-panel" aria-label="Session Desk">
      <div className="lore-panel-heading">
        <div>
          <div className="section-title">Session Desk</div>
          <h2>Plan, run, remember</h2>
        </div>
        <CalendarDays size={20} aria-hidden="true" />
      </div>
      <p className="account-summary">Link the scenes and encounters you expect to use, then start the session when the table gathers.</p>
      {retryAction && <div className="lore-load-state error" role="alert"><span>The last session action was not confirmed.</span><button className="ghost-button small" type="button" disabled={busy} onClick={() => void retryAction.run()}>{retryAction.label}</button></div>}
      <div className="lore-list-heading">
        <span>Campaign sessions</span>
        <div><strong>{formatNumber(sessions.length)}</strong>{props.canManage && <button className="icon-button" type="button" aria-label="Plan session" title="Plan session" onClick={() => { setCreating(true); setSelectedId(""); }}><Plus size={14} /></button>}</div>
      </div>
      <div className="session-desk-list" role="list" aria-label="Campaign sessions">
        {sessions.length === 0 ? <div className="empty-state compact">No sessions planned yet.</div> : sessions.map((session) => (
          <div role="listitem" key={session.id}>
            <button className={selectedId === session.id ? `session-desk-row status-${session.status} active` : `session-desk-row status-${session.status}`} type="button" onClick={() => { setSelectedId(session.id); setCreating(false); }}>
              <span className="session-number">{session.number}</span>
              <span><strong>{session.title}</strong><small>{session.scheduledFor ? formatDateTime(session.scheduledFor) : "Unscheduled"} · {session.status}</small></span>
              {session.status === "live" ? <Play size={14} aria-label="Live" /> : <Clock3 size={14} aria-hidden="true" />}
            </button>
          </div>
        ))}
      </div>
      {(creating || selected) && (
        <SessionEditor
          key={selected?.id ?? "new-session"}
          session={selected}
          nextNumber={Math.max(0, ...props.sessions.map((session) => session.number)) + 1}
          scenes={props.scenes}
          encounters={props.encounters}
          canManage={props.canManage}
          canStart={props.canStart}
          busy={busy}
          onSave={saveSession}
          onStart={(sceneId) => selected && startSession(selected, sceneId)}
          onComplete={(notes) => selected && completeSession(selected, notes)}
          onDelete={() => selected && deleteSession(selected)}
          onCancel={() => { setCreating(false); if (!selected) setSelectedId(""); }}
        />
      )}
    </section>
  );
}

function SessionEditor(props: { session?: CampaignSessionInfo; nextNumber: number; scenes: Scene[]; encounters: Encounter[]; canManage: boolean; canStart: boolean; busy: boolean; onSave(input: SessionDraft): Promise<void>; onStart(sceneId: string): Promise<void> | false | undefined; onComplete(notes: string): Promise<void> | false | undefined; onDelete(): Promise<void> | false | undefined; onCancel(): void }) {
  const [draft, setDraft] = useState<SessionDraft>(() => ({
    id: props.session?.id,
    title: props.session?.title ?? `Session ${props.nextNumber}`,
    agenda: props.session?.agenda ?? "",
    notes: props.session?.notes ?? "",
    scheduledFor: localDateTimeValue(props.session?.scheduledFor),
    sceneIds: props.session?.sceneIds ?? [],
    encounterIds: props.session?.encounterIds ?? []
  }));
  const [activateSceneId, setActivateSceneId] = useState(props.session?.sceneIds[0] ?? "");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [completeArmed, setCompleteArmed] = useState(false);
  return (
    <form className="lore-editor session-editor" aria-label={props.session ? `Edit session ${props.session.title}` : "Plan campaign session"} onSubmit={(event) => { event.preventDefault(); void props.onSave(draft); }}>
      <div className="lore-editor-title"><strong>{props.session ? `Session ${props.session.number}` : `Session ${props.nextNumber}`}</strong>{props.session && <span className={`session-status status-${props.session.status}`}>{props.session.status}</span>}</div>
      <label><span>Title</span><input aria-label="Session title" value={draft.title} required disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>Scheduled for</span><input aria-label="Session scheduled time" type="datetime-local" value={draft.scheduledFor} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, scheduledFor: event.target.value }))} /></label>
      <label><span>Agenda</span><textarea aria-label="Session agenda" value={draft.agenda} rows={4} disabled={!props.canManage} placeholder="Opening beat, scenes, encounters, close" onChange={(event) => setDraft((current) => ({ ...current, agenda: event.target.value }))} /></label>
      <label><span>Notes</span><textarea aria-label="Session notes" value={draft.notes} rows={4} disabled={!props.canManage} placeholder="Live notes and follow-ups" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
      <details className="lore-link-drawer" open={!props.session}>
        <summary>Linked scenes <span>{formatNumber(draft.sceneIds.length)}</span></summary>
        <div className="lore-target-grid">
          {props.scenes.length === 0 ? <span className="account-summary">No prep scenes yet.</span> : props.scenes.map((scene) => <label key={scene.id}><input type="checkbox" checked={draft.sceneIds.includes(scene.id)} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, sceneIds: toggleId(current.sceneIds, scene.id, event.target.checked) }))} /><span>{scene.name}</span></label>)}
        </div>
      </details>
      <details className="lore-link-drawer">
        <summary>Linked encounters <span>{formatNumber(draft.encounterIds.length)}</span></summary>
        <div className="lore-target-grid">
          {props.encounters.length === 0 ? <span className="account-summary">No saved encounters.</span> : props.encounters.map((encounter) => <label key={encounter.id}><input type="checkbox" checked={draft.encounterIds.includes(encounter.id)} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, encounterIds: toggleId(current.encounterIds, encounter.id, event.target.checked) }))} /><span>{encounter.name}</span></label>)}
        </div>
      </details>
      {props.session?.status === "planned" && props.canStart && (
        <div className="session-start-row">
          <label><span>Activate on start</span><select aria-label="Scene to activate when session starts" value={activateSceneId} onChange={(event) => setActivateSceneId(event.target.value)}><option value="">Keep current scene</option>{draft.sceneIds.map((id) => { const scene = props.scenes.find((item) => item.id === id); return scene ? <option key={scene.id} value={scene.id}>{scene.name}</option> : null; })}</select></label>
          <button className="primary-button" type="button" disabled={props.busy} onClick={() => void props.onStart(activateSceneId)}><Play size={14} /> Start session</button>
        </div>
      )}
      {props.session?.status === "live" && props.canManage && <button className="primary-button" type="button" disabled={props.busy} onClick={() => { if (completeArmed) void props.onComplete(draft.notes); else setCompleteArmed(true); }}><CheckCircle2 size={14} /> {completeArmed ? "Confirm complete session" : "Complete session"}</button>}
      {props.canManage && <div className="button-row wrap"><button className="ghost-button" type="submit" disabled={props.busy || !draft.title.trim()}><Save size={14} /> Save</button>{!props.session && <button className="ghost-button" type="button" onClick={props.onCancel}><X size={14} /> Cancel</button>}{props.session?.status === "planned" && (deleteArmed ? <button className="danger-button" type="button" disabled={props.busy} onClick={() => void props.onDelete()}><Trash2 size={14} /> Confirm delete</button> : <button className="ghost-button" type="button" onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete</button>)}</div>}
    </form>
  );
}
