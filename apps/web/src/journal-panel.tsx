import type { JournalEntry, Visibility } from "@open-tabletop/core";
import { Plus, ScrollText } from "lucide-react";
import { formatNumber } from "./sheet-format.js";


export function JournalPanel(props: { journals: JournalEntry[]; title: string; setTitle(value: string): void; body: string; setBody(value: string): void; visibility: Visibility; setVisibility(value: Visibility): void; tags: string; setTags(value: string): void; onCreate(): void; onGenerateRecap(): void; canCreate: boolean }) {
  const publicCount = props.journals.filter((journal) => journal.visibility === "public").length;
  const gmOnlyCount = props.journals.filter((journal) => journal.visibility === "gm_only").length;
  const taggedCount = props.journals.filter((journal) => journal.tags.length > 0).length;
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
      <details className="create-drawer">
        <summary><Plus size={15} /> New entry</summary>
      <form
        className="operator-section content-import-form create-drawer-form"
        onSubmit={(event) => {
          event.preventDefault();
          props.onCreate();
        }}
      >
        <label>
          <span>Title</span>
          <input aria-label="Journal title" value={props.title} placeholder="Session note" onChange={(event) => props.setTitle(event.target.value)} />
        </label>
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
        <button className="primary-button wide" type="submit" disabled={!props.canCreate || !props.title.trim()}>
          <Plus size={16} /> Create Entry
        </button>
      </form>
      </details>
      <section className="journal-list" aria-label="Journal entries">
        {props.journals.length === 0 ? (
          <div className="empty-state compact">
            <span>No journal entries yet.</span>
            <span className="journal-empty-hint">Recap is ready after play.</span>
          </div>
        ) : (
          props.journals.map((journal) => (
            <article className="journal-entry" key={journal.id}>
              <div className="operator-heading">
                <span>{journal.visibility}</span>
                {journal.tags.length > 0 && <strong>{journal.tags.slice(0, 2).join(", ")}</strong>}
              </div>
              <h3>{journal.title}</h3>
              <p>{journal.body}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
