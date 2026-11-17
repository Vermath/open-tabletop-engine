import type { Encounter, JournalEntry, Scene } from "@open-tabletop/core";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, type CampaignSessionInfo } from "./api.js";
import { prepareSessionReportAttempt, type SessionReportAttempt } from "./session-report.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";

export { sessionReportAllowed } from "./session-report.js";

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

export function sessionScheduledForIso(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error("Choose a valid date and time for this session.");
  return new Date(timestamp).toISOString();
}

export function campaignSessionScheduleMatchesDraft(input: Pick<SessionDraft, "scheduledFor">, session: Pick<CampaignSessionInfo, "scheduledFor">): boolean {
  const requested = sessionScheduledForIso(input.scheduledFor);
  if (requested === null) return !session.scheduledFor;
  return typeof session.scheduledFor === "string" && Date.parse(session.scheduledFor) === Date.parse(requested);
}

export type CampaignSessionCompletionResult = "completed" | "cancelled" | "in_flight";

export async function completeCampaignSessionOnce(
  inFlightSessionIds: Set<string>,
  session: Pick<CampaignSessionInfo, "id" | "title">,
  complete: () => Promise<void>,
  confirm: (message: string) => boolean = (message) => window.confirm(message)
): Promise<CampaignSessionCompletionResult> {
  if (inFlightSessionIds.has(session.id)) return "in_flight";
  if (!confirm(`Complete ${session.title}? This closes the live session and cannot be undone.`)) return "cancelled";
  inFlightSessionIds.add(session.id);
  try {
    await complete();
    return "completed";
  } finally {
    inFlightSessionIds.delete(session.id);
  }
}

export function campaignSessionSort(sessions: CampaignSessionInfo[]): CampaignSessionInfo[] {
  const rank = { live: 0, planned: 1, completed: 2 } as const;
  return [...sessions].sort((left, right) => rank[left.status] - rank[right.status] || right.number - left.number);
}

export interface SessionDraft {
  id?: string;
  expectedUpdatedAt?: string;
  title: string;
  agenda: string;
  notes: string;
  scheduledFor: string;
  sceneIds: string[];
  encounterIds: string[];
}

export function sessionDraftFromSession(session?: CampaignSessionInfo, nextNumber = 1): SessionDraft {
  return {
    id: session?.id,
    expectedUpdatedAt: session?.updatedAt,
    title: session?.title ?? `Session ${nextNumber}`,
    agenda: session?.agenda ?? "",
    notes: session?.notes ?? "",
    scheduledFor: localDateTimeValue(session?.scheduledFor),
    sceneIds: session?.sceneIds ?? [],
    encounterIds: session?.encounterIds ?? []
  };
}

export function sessionDraftPayload(input: SessionDraft) {
  return {
    title: input.title.trim(),
    agenda: input.agenda.trim(),
    notes: input.notes.trim(),
    scheduledFor: sessionScheduledForIso(input.scheduledFor),
    sceneIds: input.sceneIds,
    encounterIds: input.encounterIds
  };
}

export function campaignSessionMutationKey(operation: string, sessionId = "new"): string {
  return `campaign-session:${operation}:${sessionId}:${globalThis.crypto.randomUUID()}`;
}

export function persistCampaignSession(campaignId: string, input: SessionDraft, expectedUpdatedAt = input.expectedUpdatedAt, idempotencyKey = campaignSessionMutationKey(input.id ? "update" : "create", input.id)): Promise<CampaignSessionInfo> {
  if (input.id && !expectedUpdatedAt) return Promise.reject(new Error("The session revision is unavailable. Reload the latest session before saving."));
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

export function LiveSessionBanner(props: { session: CampaignSessionInfo; sceneName?: string; canComplete: boolean; onOpen(): void; onComplete(): void | Promise<void> }) {
  const completionRequestsRef = useRef(new Set<string>());
  return (
    <section className="live-session-banner" aria-label={`Live session ${props.session.title}`}>
      <span className="live-session-pulse" aria-hidden="true" />
      <div>
        <strong>Session {formatNumber(props.session.number)} · {props.session.title}</strong>
        <span>{props.sceneName ? `${props.sceneName} is live` : "Table session in progress"}{props.session.startedAt ? ` · started ${formatDateTime(props.session.startedAt)}` : ""}</span>
      </div>
      <button className="ghost-button small" type="button" onClick={props.onOpen}>Open desk</button>
      {props.canComplete && <button className="primary-button small" type="button" onClick={() => { void completeCampaignSessionOnce(completionRequestsRef.current, props.session, async () => { await props.onComplete(); }); }}><CheckCircle2 size={13} /> Complete</button>}
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
  canCreateReport?: boolean;
  onSessionsChange(sessions: CampaignSessionInfo[]): void;
  onSceneActivated(sceneId: string): void;
  onJournalCreated?(journal: JournalEntry): void;
  onStatus(message: string): void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryAction, setRetryAction] = useState<{ label: string; run(): Promise<void> }>();
  const completionRequestsRef = useRef(new Set<string>());
  const editorRef = useRef<HTMLDivElement>(null);
  const selected = props.sessions.find((session) => session.id === selectedId);
  const sessions = campaignSessionSort(props.sessions);
  const sessionsRef = useRef(props.sessions);
  sessionsRef.current = props.sessions;

  useEffect(() => {
    if (selectedId && !props.sessions.some((session) => session.id === selectedId)) setSelectedId("");
  }, [props.sessions, selectedId]);

  useEffect(() => {
    if (!creating && !selectedId) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.scrollIntoView({ block: "nearest" });
    const title = editor.querySelector<HTMLInputElement>('input[aria-label="Session title"]');
    if (title && !title.disabled) title.focus();
    else editor.focus();
  }, [creating, selectedId]);

  function replaceSession(updated: CampaignSessionInfo, created = false): CampaignSessionInfo {
    const current = sessionsRef.current;
    const existing = current.find((session) => session.id === updated.id);
    const newest = existing && existing.updatedAt > updated.updatedAt ? existing : updated;
    const next = existing ? current.map((session) => session.id === updated.id ? newest : session) : created ? [...current, newest] : current;
    sessionsRef.current = next;
    props.onSessionsChange(next);
    return newest;
  }

  async function saveSession(input: SessionDraft, expectedUpdatedAt = input.expectedUpdatedAt, idempotencyKey = campaignSessionMutationKey(input.id ? "update" : "create", input.id)) {
    if (!input.title.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await persistCampaignSession(props.campaignId, input, expectedUpdatedAt, idempotencyKey);
      const newest = replaceSession(updated, !input.id);
      setSelectedId(updated.id);
      setCreating(false);
      if (!campaignSessionScheduleMatchesDraft(input, updated)) {
        setRetryAction(undefined);
        props.onStatus(`${updated.title} saved, but its requested schedule (${input.scheduledFor ? formatDateTime(sessionScheduledForIso(input.scheduledFor)!) : "unscheduled"}) was not confirmed. Review the latest saved session before editing again.`);
        return;
      }
      setRetryAction(undefined);
      props.onStatus(`${updated.title} ${input.id ? "updated" : "planned"}${updated.scheduledFor ? ` for ${formatDateTime(updated.scheduledFor)}` : " as unscheduled"}`);
      return newest;
    } catch (error) {
      const latest = input.id ? await refreshStaleCampaignSession(error, input.id) : undefined;
      if (latest) replaceSession(latest);
      const conflict = error instanceof ApiError && error.status === 409;
      setRetryAction(conflict ? undefined : { label: "Retry session save", run: async () => { await saveSession(input, expectedUpdatedAt, idempotencyKey); } });
      props.onStatus(conflict ? "Session changed elsewhere. Your draft is preserved. Review the latest saved session before editing again." : `Session save failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function startSession(session: CampaignSessionInfo, activateSceneId: string, expectedUpdatedAt = session.updatedAt, idempotencyKey = campaignSessionMutationKey("start", session.id)) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await startCampaignSession(session.id, activateSceneId, expectedUpdatedAt, idempotencyKey);
      if (activateSceneId) props.onSceneActivated(activateSceneId);
      replaceSession(updated);
      setRetryAction(undefined);
      props.onStatus(`${updated.title} is live`);
    } catch (error) {
      const latest = await refreshStaleCampaignSession(error, session.id);
      if (latest) replaceSession(latest);
      setRetryAction(error instanceof ApiError && error.status === 409 ? undefined : { label: "Retry session start", run: () => startSession(session, activateSceneId, expectedUpdatedAt, idempotencyKey) });
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
      setRetryAction(error instanceof ApiError && error.status === 409 ? undefined : { label: "Retry session completion", run: () => completeSession(session, notes, expectedUpdatedAt, idempotencyKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session completion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function requestSessionCompletion(session: CampaignSessionInfo, notes: string) {
    await completeCampaignSessionOnce(
      completionRequestsRef.current,
      session,
      () => completeSession(session, notes)
    );
  }

  async function deleteSession(session: CampaignSessionInfo, expectedUpdatedAt = session.updatedAt, idempotencyKey = campaignSessionMutationKey("delete", session.id)) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteCampaignSession(session.id, expectedUpdatedAt, idempotencyKey);
      const remaining = sessionsRef.current.filter((item) => item.id !== session.id);
      sessionsRef.current = remaining;
      props.onSessionsChange(remaining);
      setSelectedId("");
      setRetryAction(undefined);
      props.onStatus(`${session.title} deleted`);
    } catch (error) {
      const latest = await refreshStaleCampaignSession(error, session.id);
      if (latest) replaceSession(latest);
      setRetryAction(error instanceof ApiError && error.status === 409 ? undefined : { label: "Retry session deletion", run: () => deleteSession(session, expectedUpdatedAt, idempotencyKey) });
      props.onStatus(latest ? "Session changed elsewhere. The latest revision is loaded; review and retry." : `Session deletion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reportSession(session: CampaignSessionInfo, attempt: SessionReportAttempt = prepareSessionReportAttempt(props.campaignId, session)) {
    if (busy || !props.canManage || !props.canCreateReport || !props.onJournalCreated) return;
    setBusy(true);
    try {
      const journal = await attempt.run();
      props.onJournalCreated(journal);
      setRetryAction(undefined);
      props.onStatus(`GM-only session report created for ${session.title}`);
    } catch (error) {
      setRetryAction({ label: "Retry session report", run: () => reportSession(session, attempt) });
      props.onStatus(`Session report failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-stack lore-panel session-desk-panel" aria-label="Session Desk">
      <div className="lore-page-intro">
        <div className="lore-panel-heading">
          <div>
            <div className="section-title">Session Desk</div>
            <h2>Your campaign sessions</h2>
          </div>
          {props.canManage && <button className="primary-button" type="button" aria-label="Plan session" title="Plan session" onClick={() => { setCreating(true); setSelectedId(""); }}><Plus size={15} aria-hidden="true" /> Plan session</button>}
        </div>
        <p className="account-summary">Prepare an agenda, link scenes and encounters, and keep your session notes together.</p>
      </div>
      {retryAction && <div className="lore-load-state error" role="alert"><span>The last session action was not confirmed.</span><button className="ghost-button small" type="button" disabled={busy} onClick={() => void retryAction.run()}>{retryAction.label}</button></div>}
      <div className="session-workspace">
        <div className="session-navigation">
          <div className="lore-list-heading">
            <span>Campaign sessions</span>
            <strong>{formatNumber(sessions.length)}</strong>
          </div>
          <div className="session-desk-list" role="list" aria-label="Campaign sessions">
            {sessions.length === 0 ? (
              <div className="empty-state compact lore-empty-state">
                <CalendarDays size={26} aria-hidden="true" />
                <strong>{props.canManage ? "Plan your first session" : "No sessions planned yet"}</strong>
                <p>{props.canManage ? "Choose Plan session to add an agenda and the scenes you want to run. You can set a date later." : "Sessions will appear here when your game master plans the next gathering."}</p>
              </div>
            ) : sessions.map((session) => (
              <div role="listitem" key={session.id}>
                <button className={selectedId === session.id ? `session-desk-row status-${session.status} active` : `session-desk-row status-${session.status}`} type="button" onClick={() => { setSelectedId(session.id); setCreating(false); }}>
                  <span className="session-number">{session.number}</span>
                  <span><strong>{session.title}</strong><small>{session.scheduledFor ? formatDateTime(session.scheduledFor) : "Unscheduled"} · {session.status}</small></span>
                  {session.status === "live" ? <Play size={14} aria-label="Live" /> : <Clock3 size={14} aria-hidden="true" />}
                </button>
                {props.canManage && props.canCreateReport && props.onJournalCreated && (
                  <button className="ghost-button small session-report-button" type="button" disabled={busy} aria-label={`Create GM-only session report for ${session.title}`} title="Create a GM-only session report" onClick={() => void reportSession(session)}>
                    <ClipboardList size={14} aria-hidden="true" /> Session report
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {(creating || selected) && (
          <div className="session-content" ref={editorRef} tabIndex={-1}>
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
              onComplete={(notes) => selected && requestSessionCompletion(selected, notes)}
              onDelete={() => selected && deleteSession(selected)}
              onCancel={() => { setCreating(false); if (!selected) setSelectedId(""); }}
            />
          </div>
        )}
        {!creating && !selected && sessions.length > 0 && (
          <div className="session-content empty-state compact lore-empty-state">
            <CalendarDays size={26} aria-hidden="true" />
            <strong>Choose a session to open its plan</strong>
            <p>Review the agenda, linked scenes, and notes in one place.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function SessionEditor(props: { session?: CampaignSessionInfo; nextNumber: number; scenes: Scene[]; encounters: Encounter[]; canManage: boolean; canStart: boolean; busy: boolean; onSave(input: SessionDraft): Promise<CampaignSessionInfo | void>; onStart(sceneId: string): Promise<void> | false | undefined; onComplete(notes: string): Promise<void> | false | undefined; onDelete(): Promise<void> | false | undefined; onCancel(): void }) {
  const [draft, setDraft] = useState<SessionDraft>(() => sessionDraftFromSession(props.session, props.nextNumber));
  const [baseline, setBaseline] = useState(draft);
  const [activateSceneId, setActivateSceneId] = useState(props.session?.sceneIds[0] ?? "");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const stale = Boolean(props.session && props.session.updatedAt !== draft.expectedUpdatedAt);
  const persistedScenes = props.scenes.filter((scene) => props.session?.sceneIds.includes(scene.id));
  const validActivateSceneId = persistedScenes.some((scene) => scene.id === activateSceneId) ? activateSceneId : "";

  useEffect(() => {
    if (!props.session || props.session.updatedAt === baseline.expectedUpdatedAt) return;
    const latest = sessionDraftFromSession(props.session, props.nextNumber);
    if (dirty) {
      // A retry from the desk can confirm this exact draft without going through
      // saveDraft. Only acknowledge it when every submitted field matches.
      try {
        if (JSON.stringify(sessionDraftPayload(draft)) !== JSON.stringify(sessionDraftPayload(latest))) return;
      } catch {
        return;
      }
    }
    setDraft(latest);
    setBaseline(latest);
  }, [dirty, draft, props.session, props.nextNumber, baseline.expectedUpdatedAt]);
  useEffect(() => {
    if (activateSceneId !== validActivateSceneId) setActivateSceneId(validActivateSceneId);
  }, [activateSceneId, validActivateSceneId]);

  async function saveDraft() {
    if (props.busy || stale || !props.canManage) return;
    const saved = await props.onSave(draft);
    if (!saved) return;
    const latest = sessionDraftFromSession(saved, props.nextNumber);
    setDraft(latest);
    setBaseline(latest);
  }

  function reloadDraft() {
    if (props.busy) return;
    const latest = sessionDraftFromSession(props.session, props.nextNumber);
    setDraft(latest);
    setBaseline(latest);
  }
  return (
    <form className="lore-editor session-editor" aria-label={props.session ? `Edit session ${props.session.title}` : "Plan campaign session"} onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
      <div className="lore-editor-title"><strong>{props.session ? `Session ${props.session.number}` : `Session ${props.nextNumber}`}</strong>{props.session && <span className={`session-status status-${props.session.status}`}>{props.session.status}</span>}</div>
      {stale && dirty && props.session && (
        <div className="lore-load-state error editor-conflict" role="alert">
          <span>This session changed elsewhere. Your draft is preserved; review the latest saved content before saving.</span>
          <details>
            <summary>Review latest saved session</summary>
            <p><strong>{props.session.title}</strong></p>
            <p>Scheduled: {props.session.scheduledFor ? formatDateTime(props.session.scheduledFor) : "Unscheduled"}</p>
            <p>Agenda: {props.session.agenda || "None"}</p>
            <p>Notes: {props.session.notes || "None"}</p>
            <p>Scenes: {persistedScenes.map((scene) => scene.name).join(", ") || "None"}</p>
            <p>Encounters: {props.encounters.filter((encounter) => props.session?.encounterIds.includes(encounter.id)).map((encounter) => encounter.name).join(", ") || "None"}</p>
          </details>
          <button className="ghost-button small" type="button" disabled={props.busy} onClick={reloadDraft}>Discard draft and load latest</button>
        </div>
      )}
      <label><span>Title</span><input aria-label="Session title" value={draft.title} required disabled={!props.canManage || props.busy} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>Scheduled for</span><input aria-label="Session scheduled time" type="datetime-local" value={draft.scheduledFor} disabled={!props.canManage || props.busy} onChange={(event) => setDraft((current) => ({ ...current, scheduledFor: event.target.value }))} /></label>
      <label><span>Agenda</span><textarea aria-label="Session agenda" value={draft.agenda} rows={4} disabled={!props.canManage || props.busy} placeholder="Opening beat, scenes, encounters, close" onChange={(event) => setDraft((current) => ({ ...current, agenda: event.target.value }))} /></label>
      <label><span>Notes</span><textarea aria-label="Session notes" value={draft.notes} rows={4} disabled={!props.canManage || props.busy} placeholder="Live notes and follow-ups" onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
      <details className="lore-link-drawer" open={!props.session}>
        <summary>Linked scenes <span>{formatNumber(draft.sceneIds.length)}</span></summary>
        <div className="lore-target-grid">
          {props.scenes.length === 0 ? <span className="account-summary">No prep scenes yet.</span> : props.scenes.map((scene) => <label key={scene.id}><input type="checkbox" checked={draft.sceneIds.includes(scene.id)} disabled={!props.canManage || props.busy} onChange={(event) => setDraft((current) => ({ ...current, sceneIds: toggleId(current.sceneIds, scene.id, event.target.checked) }))} /><span>{scene.name}</span></label>)}
        </div>
      </details>
      <details className="lore-link-drawer" open={!props.session || (props.session.encounterIds.length === 0 && props.encounters.length > 0)}>
        <summary>Linked encounters <span>{formatNumber(draft.encounterIds.length)} selected · {formatNumber(props.encounters.length)} available</span></summary>
        <div className="lore-target-grid">
          {props.encounters.length === 0 ? <span className="account-summary">No saved encounters.</span> : props.encounters.map((encounter) => <label key={encounter.id}><input type="checkbox" checked={draft.encounterIds.includes(encounter.id)} disabled={!props.canManage || props.busy} onChange={(event) => setDraft((current) => ({ ...current, encounterIds: toggleId(current.encounterIds, encounter.id, event.target.checked) }))} /><span>{encounter.name}</span></label>)}
        </div>
      </details>
      {props.session?.status === "planned" && props.canStart && (
        <div className="session-start-row">
          <label><span>Activate on start</span><select aria-label="Scene to activate when session starts" value={validActivateSceneId} disabled={props.busy || dirty || stale} onChange={(event) => setActivateSceneId(event.target.value)}><option value="">Keep current scene</option>{persistedScenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label>
          <button className="primary-button" type="button" disabled={props.busy || dirty || stale} onClick={() => { if (!dirty && !stale && !props.busy) void props.onStart(validActivateSceneId); }}><Play size={14} /> Start session</button>
        </div>
      )}
      {dirty && props.session?.status !== "completed" && <p className="account-summary">Save your changes before starting or completing this session.</p>}
      {props.session?.status === "live" && props.canManage && <button className="primary-button" type="button" disabled={props.busy || dirty || stale} onClick={() => { if (!dirty && !stale && !props.busy) void props.onComplete(draft.notes); }}><CheckCircle2 size={14} /> Complete session</button>}
      {props.canManage && <div className="button-row wrap"><button className="ghost-button" type="submit" disabled={props.busy || stale || !draft.title.trim()}><Save size={14} /> Save</button>{!props.session && <button className="ghost-button" type="button" onClick={props.onCancel}><X size={14} /> Cancel</button>}{props.session?.status === "planned" && (deleteArmed ? <button className="danger-button" type="button" disabled={props.busy} onClick={() => void props.onDelete()}><Trash2 size={14} /> Confirm delete</button> : <button className="ghost-button" type="button" onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete</button>)}</div>}
    </form>
  );
}
