import type { Actor, JournalEntry, Visibility } from "@open-tabletop/core";
import { PencilLine, Plus, Save, ScrollText, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { apiDelete, apiPatch, type Snapshot } from "./api.js";
import { campaignSearchAnchorId } from "./campaign-search-panel.js";
import { errorMessage, formatNumber } from "./sheet-format.js";


export function journalVisibilityHasTargets(visibility: Visibility, visibleToUserIds: readonly string[], visibleToActorIds: readonly string[]): boolean {
  if (visibility === "specific_players") return visibleToUserIds.length > 0;
  if (visibility === "specific_characters") return visibleToActorIds.length > 0;
  return true;
}

export interface JournalDraft {
  expectedUpdatedAt?: string;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  tags: string;
}

export function journalDraftPayload(input: JournalDraft) {
  return {
    ...(input.expectedUpdatedAt ? { expectedUpdatedAt: input.expectedUpdatedAt } : {}),
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    visibleToUserIds: input.visibility === "specific_players" ? [...new Set(input.visibleToUserIds)] : [],
    visibleToActorIds: input.visibility === "specific_characters" ? [...new Set(input.visibleToActorIds)] : [],
    tags: [...new Set(input.tags.split(",").map((tag) => tag.trim()).filter(Boolean))]
  };
}

export function updateJournalEntry(entryId: string, input: JournalDraft): Promise<JournalEntry> {
  return apiPatch<JournalEntry>(`/api/v1/journal/${entryId}`, journalDraftPayload(input));
}

export function deleteJournalEntry(entryId: string): Promise<JournalEntry> {
  return apiDelete<JournalEntry>(`/api/v1/journal/${entryId}`);
}

export function JournalPanel(props: { journals: JournalEntry[]; members: Snapshot["members"]; actors: Actor[]; title: string; setTitle(value: string): void; body: string; setBody(value: string): void; visibility: Visibility; setVisibility(value: Visibility): void; tags: string; setTags(value: string): void; onCreate(targets: { visibleToUserIds: string[]; visibleToActorIds: string[] }): Promise<void>; onUpdate(journal: JournalEntry, input: JournalDraft): Promise<void>; onDelete(journal: JournalEntry): Promise<void>; onGenerateRecap(): void; canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const publicCount = props.journals.filter((journal) => journal.visibility === "public").length;
  const gmOnlyCount = props.journals.filter((journal) => journal.visibility === "gm_only").length;
  const taggedCount = props.journals.filter((journal) => journal.tags.length > 0).length;
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([]);
  const [visibleToActorIds, setVisibleToActorIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const creatingRef = useRef(false);
  const targetsValid = journalVisibilityHasTargets(props.visibility, visibleToUserIds, visibleToActorIds);
  const toggleTarget = (values: string[], value: string, checked: boolean): string[] => checked ? [...new Set([...values, value])] : values.filter((candidate) => candidate !== value);
  const createEntry = async () => {
    if (creatingRef.current || !targetsValid) return;
    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    try {
      await props.onCreate({
        visibleToUserIds: props.visibility === "specific_players" ? visibleToUserIds : [],
        visibleToActorIds: props.visibility === "specific_characters" ? visibleToActorIds : []
      });
      setVisibleToUserIds([]);
      setVisibleToActorIds([]);
    } catch (createFailure) {
      setCreateError(errorMessage(createFailure));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  return (
    <div className="panel-stack">
      <header className="panel-hero">
        <div>
          <div className="section-title">Journal</div>
          <h2>Campaign Notes</h2>
        </div>
      </header>
      {props.canCreate && (
        <button className="ghost-button" type="button" aria-label="Generate session recap" onClick={() => props.onGenerateRecap()}>
          <ScrollText size={15} /> Generate session recap
        </button>
      )}
      <p className="panel-status-line" aria-label="Journal summary">
        <span>{formatNumber(props.journals.length)} entries</span>
        <span>{formatNumber(publicCount)} public</span>
        <span>{formatNumber(gmOnlyCount)} GM only</span>
        <span>{formatNumber(taggedCount)} tagged</span>
      </p>
      {props.canCreate && <details className="create-drawer">
        <summary><Plus size={15} /> New entry</summary>
      <form
        className="operator-section content-import-form create-drawer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createEntry();
        }}
      >
        <label>
          <span>Title</span>
          <input aria-label="Journal title" value={props.title} placeholder="Session note" onChange={(event) => props.setTitle(event.target.value)} />
        </label>
        {props.visibility === "specific_players" && (
          <fieldset className="inline-options" aria-label="Journal visible players">
            <legend>Visible players</legend>
            {props.members.map((member) => (
              <label className="inline-check" key={member.user.id}>
                <input type="checkbox" checked={visibleToUserIds.includes(member.user.id)} onChange={(event) => setVisibleToUserIds((current) => toggleTarget(current, member.user.id, event.target.checked))} />
                <span>{member.user.displayName || member.user.email || member.role}</span>
              </label>
            ))}
            {props.members.length === 0 && <span>No campaign members are available.</span>}
          </fieldset>
        )}
        {props.visibility === "specific_characters" && (
          <fieldset className="inline-options" aria-label="Journal visible characters">
            <legend>Visible characters</legend>
            {props.actors.map((actor) => (
              <label className="inline-check" key={actor.id}>
                <input type="checkbox" checked={visibleToActorIds.includes(actor.id)} onChange={(event) => setVisibleToActorIds((current) => toggleTarget(current, actor.id, event.target.checked))} />
                <span>{actor.name}</span>
              </label>
            ))}
            {props.actors.length === 0 && <span>No player characters are available.</span>}
          </fieldset>
        )}
        <label>
          <span>Visibility</span>
          <select aria-label="Journal visibility" value={props.visibility} onChange={(event) => props.setVisibility(event.target.value as Visibility)}>
            <option value="gm_only">GM only</option>
            <option value="public">Public</option>
            <option value="specific_players">Specific players</option>
            <option value="specific_characters">Specific characters</option>
          </select>
        </label>
        <label>
          <span>Tags</span>
          <input aria-label="Journal tags" value={props.tags} placeholder="prep, clue" onChange={(event) => props.setTags(event.target.value)} />
        </label>
        <label>
          <span>Body</span>
          <textarea aria-label="Journal body" value={props.body} onChange={(event) => props.setBody(event.target.value)} />
        </label>
        {createError && <p className="creator-error" role="alert">Journal creation failed: {createError}</p>}
        <button className="primary-button wide" type="submit" disabled={!props.title.trim() || !targetsValid || creating}>
          <Plus size={16} /> {creating ? "Creating..." : "Create Entry"}
        </button>
      </form>
      </details>}
      <section className="journal-list" aria-label="Journal entries">
        {props.journals.length === 0 ? (
          <div className="empty-state compact">
            <span>No journal entries yet.</span>
            <span className="journal-empty-hint">Recap is ready after play.</span>
          </div>
        ) : (
          props.journals.map((journal) => <JournalEntryCard key={journal.id} journal={journal} members={props.members} actors={props.actors} canUpdate={props.canUpdate} canDelete={props.canDelete} onUpdate={(input) => props.onUpdate(journal, input)} onDelete={() => props.onDelete(journal)} />)
        )}
      </section>
    </div>
  );
}

function JournalEntryCard(props: { journal: JournalEntry; members: Snapshot["members"]; actors: Actor[]; canUpdate: boolean; canDelete: boolean; onUpdate(input: JournalDraft): Promise<void>; onDelete(): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(input: JournalDraft) {
    setBusy(true);
    setError("");
    try {
      await props.onUpdate(input);
      setEditing(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await props.onDelete();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article id={campaignSearchAnchorId("journal", props.journal.id)} className="journal-entry" aria-label={`Journal entry ${props.journal.title}`} tabIndex={-1}>
      <div className="operator-heading">
        <span>{props.journal.visibility}</span>
        {props.journal.tags.length > 0 && <strong>{props.journal.tags.slice(0, 2).join(", ")}</strong>}
      </div>
      <h3>{props.journal.title}</h3>
      <p>{props.journal.body}</p>
      {(props.canUpdate || props.canDelete) && (
        <div className="button-row wrap journal-entry-actions">
          {props.canUpdate && <button className="ghost-button" type="button" disabled={busy} onClick={() => { setEditing((open) => !open); setDeleteArmed(false); }}><PencilLine size={14} /> {editing ? "Close edit" : "Edit"}</button>}
          {props.canDelete && (deleteArmed
            ? <button className="danger-button" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={14} /> Confirm delete</button>
            : <button className="ghost-button" type="button" disabled={busy} onClick={() => { setDeleteArmed(true); setEditing(false); }}><Trash2 size={14} /> Delete</button>)}
        </div>
      )}
      {error && <p className="creator-error" role="alert">{error}</p>}
      {editing && <JournalEntryEditor journal={props.journal} members={props.members} actors={props.actors} busy={busy} onSave={save} onCancel={() => setEditing(false)} />}
    </article>
  );
}

function JournalEntryEditor(props: { journal: JournalEntry; members: Snapshot["members"]; actors: Actor[]; busy: boolean; onSave(input: JournalDraft): Promise<void>; onCancel(): void }) {
  const [draft, setDraft] = useState<JournalDraft>(() => ({
    expectedUpdatedAt: props.journal.updatedAt,
    title: props.journal.title,
    body: props.journal.body,
    visibility: props.journal.visibility,
    visibleToUserIds: props.journal.visibility === "specific_players" ? props.journal.visibleToUserIds : [],
    visibleToActorIds: props.journal.visibility === "specific_characters" ? props.journal.visibleToActorIds : [],
    tags: props.journal.tags.join(", ")
  }));
  const targetsValid = journalVisibilityHasTargets(draft.visibility, draft.visibleToUserIds, draft.visibleToActorIds);
  const toggleTarget = (values: string[], value: string, checked: boolean): string[] => checked ? [...new Set([...values, value])] : values.filter((candidate) => candidate !== value);

  return (
    <form className="operator-section content-import-form journal-edit-form" aria-label={`Edit journal ${props.journal.title}`} onSubmit={(event) => { event.preventDefault(); void props.onSave(draft); }}>
      <label><span>Title</span><input aria-label="Edit journal title" value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
      <label><span>Visibility</span><select aria-label="Edit journal visibility" value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as Visibility }))}><option value="gm_only">GM only</option><option value="public">Public</option><option value="specific_players">Specific players</option><option value="specific_characters">Specific characters</option></select></label>
      {draft.visibility === "specific_players" && <fieldset className="inline-options" aria-label="Edit journal visible players"><legend>Visible players</legend>{props.members.map((member) => <label className="inline-check" key={member.user.id}><input type="checkbox" checked={draft.visibleToUserIds.includes(member.user.id)} onChange={(event) => setDraft((current) => ({ ...current, visibleToUserIds: toggleTarget(current.visibleToUserIds, member.user.id, event.target.checked) }))} /><span>{member.user.displayName || member.user.email || member.role}</span></label>)}</fieldset>}
      {draft.visibility === "specific_characters" && <fieldset className="inline-options" aria-label="Edit journal visible characters"><legend>Visible characters</legend>{props.actors.map((actor) => <label className="inline-check" key={actor.id}><input type="checkbox" checked={draft.visibleToActorIds.includes(actor.id)} onChange={(event) => setDraft((current) => ({ ...current, visibleToActorIds: toggleTarget(current.visibleToActorIds, actor.id, event.target.checked) }))} /><span>{actor.name}</span></label>)}</fieldset>}
      <label><span>Tags</span><input aria-label="Edit journal tags" value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /></label>
      <label><span>Body</span><textarea aria-label="Edit journal body" value={draft.body} rows={5} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
      <div className="button-row wrap"><button className="primary-button" type="submit" disabled={props.busy || !draft.title.trim() || !targetsValid}><Save size={14} /> Save changes</button><button className="ghost-button" type="button" disabled={props.busy} onClick={props.onCancel}><X size={14} /> Cancel</button></div>
    </form>
  );
}
