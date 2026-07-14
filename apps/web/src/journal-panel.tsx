import type {
  Actor,
  JournalBacklink,
  JournalCanonStatus,
  JournalEntityLink,
  JournalEntityType,
  JournalEntry,
  JournalEntryRevision,
  Visibility,
} from "@open-tabletop/core";
import { BookOpenCheck, Folder, History, Link2, PencilLine, Plus, Save, ScrollText, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, type Snapshot } from "./api.js";
import { campaignSearchAnchorId } from "./campaign-search-panel.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";

export interface JournalLinkTargetOption {
  type: JournalEntityType;
  id: string;
  label: string;
}

export interface JournalDraft {
  expectedUpdatedAt?: string;
  kind: "folder" | "entry";
  parentId?: string;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  tags: string;
  links: JournalEntityLink[];
}

export interface JournalCreateOptions {
  kind: "folder" | "entry";
  parentId?: string;
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  links: JournalEntityLink[];
  idempotencyKey: string;
}

interface JournalBacklinksResponse {
  entryId: string;
  backlinks: JournalBacklink[];
}

interface JournalHistoryResponse {
  entryId: string;
  currentRevision: number;
  revisions: JournalEntryRevision[];
}

export function journalVisibilityHasTargets(visibility: Visibility, visibleToUserIds: readonly string[], visibleToActorIds: readonly string[]): boolean {
  if (visibility === "specific_players") return visibleToUserIds.length > 0;
  if (visibility === "specific_characters") return visibleToActorIds.length > 0;
  return true;
}

export function journalDraftPayload(input: JournalDraft) {
  return {
    ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}),
    kind: input.kind,
    parentId: input.parentId ?? null,
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    visibleToUserIds: input.visibility === "specific_players" ? [...new Set(input.visibleToUserIds)] : [],
    visibleToActorIds: input.visibility === "specific_characters" ? [...new Set(input.visibleToActorIds)] : [],
    tags: [...new Set(input.tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
    links: input.links.map((link) => ({ ...link })),
  };
}

function opaqueJournalPayloadFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function journalUpdateIdempotencyKey(entryId: string, input: JournalDraft): string {
  const expectedUpdatedAt = input.expectedUpdatedAt;
  if (!expectedUpdatedAt) throw new Error("Reload the journal entry before saving changes.");
  return `journal-update:${entryId}:${expectedUpdatedAt}:${opaqueJournalPayloadFingerprint(journalDraftPayload(input))}`;
}

export function journalRevisionStateKey(journal: Pick<JournalEntry, "canonStatus" | "updatedAt">): string {
  return `${journal.updatedAt}:${journal.canonStatus ?? "draft"}`;
}

export function journalLinkDisplay(link: JournalEntityLink, targets: readonly JournalLinkTargetOption[]): { type: JournalEntityType; target: string; relationship?: string } {
  const target = targets.find((candidate) => candidate.type === link.targetType && candidate.id === link.targetId);
  return { type: link.targetType, target: target?.label ?? link.targetId, ...(link.label ? { relationship: link.label } : {}) };
}

export function updateJournalEntry(entryId: string, input: JournalDraft): Promise<JournalEntry> {
  const expectedUpdatedAt = input.expectedUpdatedAt;
  if (!expectedUpdatedAt) return Promise.reject(new Error("Reload the journal entry before saving changes."));
  return apiPatch<JournalEntry>(`/api/v1/journal/${entryId}`, journalDraftPayload(input), {
    idempotencyKey: journalUpdateIdempotencyKey(entryId, input),
  });
}

export function deleteJournalEntry(entryId: string, expectedUpdatedAt: string, idempotencyKey: string): Promise<JournalEntry> {
  return apiDelete<JournalEntry>(`/api/v1/journal/${entryId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, { idempotencyKey });
}

export function journalHierarchyRows(journals: readonly JournalEntry[]): Array<{ journal: JournalEntry; depth: number }> {
  const byParent = new Map<string | undefined, JournalEntry[]>();
  const ids = new Set(journals.map((journal) => journal.id));
  for (const journal of journals) {
    const parentId = journal.parentId && ids.has(journal.parentId) ? journal.parentId : undefined;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), journal]);
  }
  for (const children of byParent.values()) {
    children.sort((left, right) => {
      const kindOrder = (left.kind ?? "entry") === (right.kind ?? "entry") ? 0 : (left.kind ?? "entry") === "folder" ? -1 : 1;
      return kindOrder || left.title.localeCompare(right.title);
    });
  }
  const rows: Array<{ journal: JournalEntry; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (parentId: string | undefined, depth: number) => {
    for (const journal of byParent.get(parentId) ?? []) {
      if (visited.has(journal.id)) continue;
      visited.add(journal.id);
      rows.push({ journal, depth });
      visit(journal.id, depth + 1);
    }
  };
  visit(undefined, 0);
  for (const journal of journals) if (!visited.has(journal.id)) rows.push({ journal, depth: 0 });
  return rows;
}

function requestKey(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${randomId}`;
}

function toggleTarget(values: string[], value: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, value])] : values.filter((candidate) => candidate !== value);
}

interface JournalPanelProps {
  journals: JournalEntry[];
  members: Snapshot["members"];
  actors: Actor[];
  linkTargets: JournalLinkTargetOption[];
  title: string;
  setTitle(value: string): void;
  body: string;
  setBody(value: string): void;
  visibility: Visibility;
  setVisibility(value: Visibility): void;
  tags: string;
  setTags(value: string): void;
  onCreate(options: JournalCreateOptions): Promise<void>;
  onUpdate(journal: JournalEntry, input: JournalDraft): Promise<void>;
  onDelete(journal: JournalEntry, idempotencyKey: string): Promise<void>;
  onGenerateRecap(idempotencyKey: string): Promise<void>;
  onCanonReview(journal: JournalEntry, status: JournalCanonStatus, note: string, idempotencyKey: string): Promise<void>;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canReadHistory: boolean;
  canCanonReview: boolean;
}

export function JournalPanel(props: JournalPanelProps) {
  const publicCount = props.journals.filter((journal) => journal.visibility === "public").length;
  const gmOnlyCount = props.journals.filter((journal) => journal.visibility === "gm_only").length;
  const folderCount = props.journals.filter((journal) => (journal.kind ?? "entry") === "folder").length;
  const folders = props.journals.filter((journal) => (journal.kind ?? "entry") === "folder");
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([]);
  const [visibleToActorIds, setVisibleToActorIds] = useState<string[]>([]);
  const [kind, setKind] = useState<"folder" | "entry">("entry");
  const [parentId, setParentId] = useState("");
  const [links, setLinks] = useState<JournalEntityLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapError, setRecapError] = useState("");
  const createAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const recapAttemptRef = useRef<string | null>(null);
  const targetsValid = journalVisibilityHasTargets(props.visibility, visibleToUserIds, visibleToActorIds);

  async function createEntry() {
    if (creating || !targetsValid) return;
    const fingerprint = JSON.stringify({ kind, parentId, title: props.title.trim(), body: props.body.trim(), visibility: props.visibility, visibleToUserIds, visibleToActorIds, tags: props.tags, links });
    if (createAttemptRef.current?.fingerprint !== fingerprint) {
      createAttemptRef.current = { fingerprint, key: requestKey("journal-create") };
    }
    setCreating(true);
    setCreateError("");
    setCreateStatus("");
    try {
      await props.onCreate({
        kind,
        parentId: parentId || undefined,
        visibleToUserIds: props.visibility === "specific_players" ? visibleToUserIds : [],
        visibleToActorIds: props.visibility === "specific_characters" ? visibleToActorIds : [],
        links,
        idempotencyKey: createAttemptRef.current.key,
      });
      createAttemptRef.current = null;
      setVisibleToUserIds([]);
      setVisibleToActorIds([]);
      setLinks([]);
      setCreateStatus(kind === "folder" ? "Folder created." : "Entry created and queued for canon review.");
    } catch (createFailure) {
      setCreateError(errorMessage(createFailure));
    } finally {
      setCreating(false);
    }
  }

  async function generateRecap() {
    if (recapBusy) return;
    recapAttemptRef.current ??= requestKey("journal-recap");
    setRecapBusy(true);
    setRecapError("");
    try {
      await props.onGenerateRecap(recapAttemptRef.current);
      recapAttemptRef.current = null;
    } catch (failure) {
      setRecapError(errorMessage(failure));
    } finally {
      setRecapBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <header className="panel-hero">
        <div><div className="section-title">Journal</div><h2>Campaign Knowledge</h2></div>
      </header>
      {props.canCreate && (
        <button className="ghost-button" type="button" disabled={recapBusy} onClick={() => void generateRecap()}>
          <ScrollText size={15} /> {recapBusy ? "Generating recap..." : "Generate session recap"}
        </button>
      )}
      {recapError && <p className="creator-error" role="alert">Recap failed: {recapError}</p>}
      <p className="panel-status-line" aria-label="Journal summary">
        <span>{formatNumber(props.journals.length)} records</span>
        <span>{formatNumber(folderCount)} folders</span>
        <span>{formatNumber(publicCount)} public</span>
        <span>{formatNumber(gmOnlyCount)} GM only</span>
      </p>
      {props.canCreate && (
        <details className="create-drawer">
          <summary><Plus size={15} /> New journal record</summary>
          <form className="operator-section content-import-form create-drawer-form" onSubmit={(event) => { event.preventDefault(); void createEntry(); }}>
            <label><span>Type</span><select aria-label="Journal record type" value={kind} onChange={(event) => setKind(event.target.value as "folder" | "entry")}><option value="entry">Entry</option><option value="folder">Folder</option></select></label>
            <label><span>Parent folder</span><select aria-label="Journal parent folder" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Top level</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>
            <label><span>Title</span><input aria-label="Journal title" value={props.title} placeholder={kind === "folder" ? "Lore" : "Session note"} onChange={(event) => props.setTitle(event.target.value)} /></label>
            <label><span>Visibility</span><select aria-label="Journal visibility" value={props.visibility} onChange={(event) => props.setVisibility(event.target.value as Visibility)}><option value="gm_only">GM only</option><option value="public">Public</option><option value="specific_players">Specific players</option><option value="specific_characters">Specific characters</option></select></label>
            <JournalAudienceFields visibility={props.visibility} members={props.members} actors={props.actors} visibleToUserIds={visibleToUserIds} visibleToActorIds={visibleToActorIds} setVisibleToUserIds={setVisibleToUserIds} setVisibleToActorIds={setVisibleToActorIds} />
            <label><span>Tags</span><input aria-label="Journal tags" value={props.tags} placeholder="prep, clue" onChange={(event) => props.setTags(event.target.value)} /></label>
            <label><span>Body</span><textarea aria-label="Journal body" value={props.body} onChange={(event) => props.setBody(event.target.value)} /></label>
            <JournalLinksEditor links={links} setLinks={setLinks} targets={props.linkTargets} />
            {createError && <p className="creator-error" role="alert">Journal creation failed: {createError}</p>}
            {createStatus && <p className="panel-success" role="status">{createStatus}</p>}
            <button className="primary-button wide" type="submit" disabled={!props.title.trim() || !targetsValid || creating}><Plus size={16} /> {creating ? "Creating..." : `Create ${kind}`}</button>
          </form>
        </details>
      )}
      <section className="journal-list" aria-label="Journal hierarchy">
        {props.journals.length === 0 ? <div className="empty-state compact"><span>No journal records yet.</span><span className="journal-empty-hint">Recap is ready after play.</span></div> : journalHierarchyRows(props.journals).map(({ journal, depth }) => (
          <JournalEntryCard
            key={journal.id}
            journal={journal}
            depth={depth}
            folders={folders}
            members={props.members}
            actors={props.actors}
            linkTargets={props.linkTargets}
            canUpdate={props.canUpdate}
            canDelete={props.canDelete}
            canReadHistory={props.canReadHistory}
            canCanonReview={props.canCanonReview}
            onUpdate={(input) => props.onUpdate(journal, input)}
            onDelete={(key) => props.onDelete(journal, key)}
            onCanonReview={(status, note, key) => props.onCanonReview(journal, status, note, key)}
          />
        ))}
      </section>
    </div>
  );
}

interface JournalAudienceFieldsProps {
  visibility: Visibility;
  members: Snapshot["members"];
  actors: Actor[];
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  setVisibleToUserIds(value: string[]): void;
  setVisibleToActorIds(value: string[]): void;
}

function JournalAudienceFields({ visibility, members, actors, visibleToUserIds, visibleToActorIds, setVisibleToUserIds, setVisibleToActorIds }: JournalAudienceFieldsProps) {
  if (visibility === "specific_players") return <fieldset className="inline-options"><legend>Visible players</legend>{members.map((member) => <label className="inline-check" key={member.user.id}><input type="checkbox" checked={visibleToUserIds.includes(member.user.id)} onChange={(event) => setVisibleToUserIds(toggleTarget(visibleToUserIds, member.user.id, event.target.checked))} /><span>{member.user.displayName || member.user.email || member.role}</span></label>)}</fieldset>;
  if (visibility === "specific_characters") return <fieldset className="inline-options"><legend>Visible characters</legend>{actors.map((actor) => <label className="inline-check" key={actor.id}><input type="checkbox" checked={visibleToActorIds.includes(actor.id)} onChange={(event) => setVisibleToActorIds(toggleTarget(visibleToActorIds, actor.id, event.target.checked))} /><span>{actor.name}</span></label>)}</fieldset>;
  return null;
}

interface JournalLinksEditorProps {
  links: JournalEntityLink[];
  setLinks(value: JournalEntityLink[]): void;
  targets: JournalLinkTargetOption[];
}

function JournalLinksEditor({ links, setLinks, targets }: JournalLinksEditorProps) {
  const [targetValue, setTargetValue] = useState("");
  const [label, setLabel] = useState("");
  const available = targets.filter((target) => !links.some((link) => link.targetType === target.type && link.targetId === target.id));
  function addLink() {
    const target = available.find((candidate) => `${candidate.type}:${candidate.id}` === targetValue);
    if (!target) return;
    setLinks([...links, { id: requestKey("journal-link"), targetType: target.type, targetId: target.id, ...(label.trim() ? { label: label.trim() } : {}) }]);
    setTargetValue("");
    setLabel("");
  }
  return (
    <fieldset className="operator-section journal-links-editor">
      <legend>Typed entity links</legend>
      {links.length > 0 && <ul className="plain-list">{links.map((link) => <li key={link.id}><span>{link.label || `${link.targetType}: ${link.targetId}`}</span><button className="ghost-button" type="button" aria-label={`Remove link ${link.label || link.targetId}`} onClick={() => setLinks(links.filter((candidate) => candidate.id !== link.id))}><X size={13} /> Remove</button></li>)}</ul>}
      <label><span>Linked record</span><select aria-label="Linked journal entity" value={targetValue} onChange={(event) => setTargetValue(event.target.value)}><option value="">Select a visible campaign record</option>{available.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.type}: {target.label}</option>)}</select></label>
      <label><span>Link label</span><input aria-label="Journal link label" value={label} maxLength={120} placeholder="Optional relationship" onChange={(event) => setLabel(event.target.value)} /></label>
      <button className="ghost-button" type="button" disabled={!targetValue} onClick={addLink}><Link2 size={14} /> Add link</button>
    </fieldset>
  );
}

interface JournalEntryCardProps {
  journal: JournalEntry;
  depth: number;
  folders: JournalEntry[];
  members: Snapshot["members"];
  actors: Actor[];
  linkTargets: JournalLinkTargetOption[];
  canUpdate: boolean;
  canDelete: boolean;
  canReadHistory: boolean;
  canCanonReview: boolean;
  onUpdate(input: JournalDraft): Promise<void>;
  onDelete(idempotencyKey: string): Promise<void>;
  onCanonReview(status: JournalCanonStatus, note: string, idempotencyKey: string): Promise<void>;
}

function JournalEntryCard(props: JournalEntryCardProps) {
  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [backlinks, setBacklinks] = useState<JournalBacklink[] | null>(null);
  const [history, setHistory] = useState<JournalEntryRevision[] | null>(null);
  const [reviewStatus, setReviewStatus] = useState<JournalCanonStatus>(props.journal.canonStatus ?? "draft");
  const [reviewNote, setReviewNote] = useState("");
  const deleteKeyRef = useRef<string | null>(null);
  const reviewAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const kind = props.journal.kind ?? "entry";
  const revisionStateKey = journalRevisionStateKey(props.journal);
  const availableLinkTargets = props.linkTargets.filter((target) => !(target.type === "journal" && target.id === props.journal.id));
  const outgoingLinks = (props.journal.links ?? []).map((link) => ({ link, display: journalLinkDisplay(link, props.linkTargets) }));

  useEffect(() => {
    setReviewStatus(props.journal.canonStatus ?? "draft");
    setReviewNote("");
    setBacklinks(null);
    setHistory(null);
    setError("");
    setSuccess("");
    deleteKeyRef.current = null;
    reviewAttemptRef.current = null;
  }, [revisionStateKey]);

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(successMessage);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function save(input: JournalDraft) {
    await run(async () => { await props.onUpdate(input); setEditing(false); }, "Journal changes saved and queued for canon review.");
  }

  async function remove() {
    deleteKeyRef.current ??= requestKey("journal-delete");
    await run(() => props.onDelete(deleteKeyRef.current!), "Journal record deleted.");
  }

  async function loadBacklinks() {
    await run(async () => {
      const result = await apiGet<JournalBacklinksResponse>(`/api/v1/journal/${props.journal.id}/backlinks`);
      setBacklinks(result.backlinks);
    }, "Backlinks loaded.");
  }

  async function loadHistory() {
    await run(async () => {
      const result = await apiGet<JournalHistoryResponse>(`/api/v1/journal/${props.journal.id}/history`);
      setHistory(result.revisions);
    }, "Revision history loaded.");
  }

  async function reviewCanon() {
    const fingerprint = JSON.stringify({ updatedAt: props.journal.updatedAt, status: reviewStatus, note: reviewNote.trim() });
    if (reviewAttemptRef.current?.fingerprint !== fingerprint) reviewAttemptRef.current = { fingerprint, key: requestKey("journal-canon-review") };
    await run(async () => {
      await props.onCanonReview(reviewStatus, reviewNote, reviewAttemptRef.current!.key);
      reviewAttemptRef.current = null;
    }, `Canon review set to ${reviewStatus.replace("_", " ")}.`);
  }

  return (
    <article id={campaignSearchAnchorId("journal", props.journal.id)} className="journal-entry" data-depth={Math.min(props.depth, 6)} aria-label={`Journal ${kind} ${props.journal.title}`} tabIndex={-1}>
      <div className="operator-heading"><span>{kind === "folder" ? <><Folder size={14} /> Folder</> : props.journal.visibility}</span><strong>{(props.journal.canonStatus ?? "draft").replace("_", " ")}</strong></div>
      <h3>{props.journal.title}</h3>
      {props.journal.body && <p>{props.journal.body}</p>}
      {outgoingLinks.length > 0 && (
        <section className="journal-knowledge-graph" aria-label={`Knowledge graph links from ${props.journal.title}`}>
          <h4>Knowledge graph</h4>
          <ul className="plain-list" aria-label="Outgoing journal links">
            {outgoingLinks.map(({ link, display }) => <li key={link.id}><Link2 size={13} /><span className="journal-entity-type">{display.type}</span><strong>{display.target}</strong>{display.relationship && <span>{display.relationship}</span>}</li>)}
          </ul>
        </section>
      )}
      <p className="muted-copy">Revision {formatNumber(props.journal.revision ?? 1)} · Updated {formatDateTime(props.journal.updatedAt)}</p>
      <div className="button-row wrap journal-entry-actions">
        <button className="ghost-button" type="button" disabled={busy} aria-expanded={backlinks !== null} onClick={() => backlinks === null ? void loadBacklinks() : setBacklinks(null)}><Link2 size={14} /> {backlinks === null ? "Backlinks" : "Hide backlinks"}</button>
        {props.canReadHistory && <button className="ghost-button" type="button" disabled={busy} aria-expanded={history !== null} onClick={() => history === null ? void loadHistory() : setHistory(null)}><History size={14} /> {history === null ? "History" : "Hide history"}</button>}
        {props.canUpdate && <button className="ghost-button" type="button" disabled={busy} onClick={() => { setEditing((open) => !open); setDeleteArmed(false); }}><PencilLine size={14} /> {editing ? "Close edit" : "Edit"}</button>}
        {props.canDelete && (deleteArmed ? <button className="danger-button" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={14} /> Confirm delete</button> : <button className="ghost-button" type="button" disabled={busy} onClick={() => { setDeleteArmed(true); setEditing(false); }}><Trash2 size={14} /> Delete</button>)}
      </div>
      {backlinks !== null && <section className="operator-section journal-knowledge-graph" aria-label={`Backlinks for ${props.journal.title}`}><h4>Incoming graph links</h4>{backlinks.length === 0 ? <p>No visible journal entries link here.</p> : <ul className="plain-list">{backlinks.map((backlink) => <li key={`${backlink.sourceEntryId}:${backlink.link.id}`}><Link2 size={13} /><span className="journal-entity-type">journal</span><strong>{backlink.sourceTitle}</strong></li>)}</ul>}</section>}
      {history !== null && <section className="operator-section" aria-label={`Revision history for ${props.journal.title}`}><h4>Revision history</h4><ol className="plain-list">{history.map((revision) => <li key={revision.id}><strong>Revision {revision.revision}</strong> · {formatDateTime(revision.createdAt)} · {revision.canonStatus.replace("_", " ")}<p>{revision.body || "No body."}</p></li>)}</ol></section>}
      {props.canCanonReview && kind === "entry" && <fieldset className="operator-section"><legend><BookOpenCheck size={14} /> Campaign canon review</legend><label><span>Review state</span><select aria-label={`Canon status for ${props.journal.title}`} value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as JournalCanonStatus)}><option value="draft">Draft</option><option value="in_review">In review</option><option value="canonical">Canonical</option><option value="rejected">Rejected</option></select></label><label><span>Review note</span><input aria-label={`Canon review note for ${props.journal.title}`} value={reviewNote} maxLength={500} onChange={(event) => setReviewNote(event.target.value)} /></label><button className="primary-button" type="button" disabled={busy} onClick={() => void reviewCanon()}><BookOpenCheck size={14} /> Apply review</button></fieldset>}
      {error && <p className="creator-error" role="alert">{error}</p>}
      {success && <p className="panel-success" role="status">{success}</p>}
      {editing && <JournalEntryEditor key={revisionStateKey} journal={props.journal} folders={props.folders} members={props.members} actors={props.actors} linkTargets={availableLinkTargets} busy={busy} onSave={save} onCancel={() => setEditing(false)} />}
    </article>
  );
}

interface JournalEntryEditorProps {
  journal: JournalEntry;
  folders: JournalEntry[];
  members: Snapshot["members"];
  actors: Actor[];
  linkTargets: JournalLinkTargetOption[];
  busy: boolean;
  onSave(input: JournalDraft): Promise<void>;
  onCancel(): void;
}

function JournalEntryEditor({ journal, folders, members, actors, linkTargets, busy, onSave, onCancel }: JournalEntryEditorProps) {
  const [draft, setDraft] = useState<JournalDraft>(() => ({
    expectedUpdatedAt: journal.updatedAt,
    kind: journal.kind ?? "entry",
    parentId: journal.parentId,
    title: journal.title,
    body: journal.body,
    visibility: journal.visibility,
    visibleToUserIds: journal.visibility === "specific_players" ? journal.visibleToUserIds : [],
    visibleToActorIds: journal.visibility === "specific_characters" ? journal.visibleToActorIds : [],
    tags: journal.tags.join(", "),
    links: (journal.links ?? []).map((link) => ({ ...link })),
  }));
  const targetsValid = journalVisibilityHasTargets(draft.visibility, draft.visibleToUserIds, draft.visibleToActorIds);
  return (
    <form className="operator-section content-import-form journal-edit-form" aria-label={`Edit journal ${journal.title}`} onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
      <label><span>Type</span><select aria-label="Edit journal record type" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as "folder" | "entry" }))}><option value="entry">Entry</option><option value="folder">Folder</option></select></label>
      <label><span>Parent folder</span><select aria-label="Edit journal parent folder" value={draft.parentId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value || undefined }))}><option value="">Top level</option>{folders.filter((folder) => folder.id !== journal.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label>
      <label><span>Title</span><input aria-label="Edit journal title" value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>Visibility</span><select aria-label="Edit journal visibility" value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as Visibility }))}><option value="gm_only">GM only</option><option value="public">Public</option><option value="specific_players">Specific players</option><option value="specific_characters">Specific characters</option></select></label>
      <JournalAudienceFields visibility={draft.visibility} members={members} actors={actors} visibleToUserIds={draft.visibleToUserIds} visibleToActorIds={draft.visibleToActorIds} setVisibleToUserIds={(value) => setDraft((current) => ({ ...current, visibleToUserIds: value }))} setVisibleToActorIds={(value) => setDraft((current) => ({ ...current, visibleToActorIds: value }))} />
      <label><span>Tags</span><input aria-label="Edit journal tags" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /></label>
      <label><span>Body</span><textarea aria-label="Edit journal body" value={draft.body} rows={5} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
      <JournalLinksEditor links={draft.links} setLinks={(links) => setDraft((current) => ({ ...current, links }))} targets={linkTargets} />
      <div className="button-row wrap"><button className="primary-button" type="submit" disabled={busy || !draft.title.trim() || !targetsValid}><Save size={14} /> Save changes</button><button className="ghost-button" type="button" disabled={busy} onClick={onCancel}><X size={14} /> Cancel</button></div>
    </form>
  );
}
