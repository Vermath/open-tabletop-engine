import type { Actor, JournalEntry, Visibility } from "@open-tabletop/core";
import { Plus, ScrollText } from "lucide-react";
import { useRef, useState } from "react";
import type { Snapshot } from "./api.js";
import { formatNumber } from "./sheet-format.js";


export function journalVisibilityHasTargets(visibility: Visibility, visibleToUserIds: readonly string[], visibleToActorIds: readonly string[]): boolean {
  if (visibility === "specific_players") return visibleToUserIds.length > 0;
  if (visibility === "specific_characters") return visibleToActorIds.length > 0;
  return true;
}

export function JournalPanel(props: { journals: JournalEntry[]; members: Snapshot["members"]; actors: Actor[]; title: string; setTitle(value: string): void; body: string; setBody(value: string): void; visibility: Visibility; setVisibility(value: Visibility): void; tags: string; setTags(value: string): void; onCreate(targets: { visibleToUserIds: string[]; visibleToActorIds: string[] }): Promise<void>; onGenerateRecap(): void; canCreate: boolean }) {
  const publicCount = props.journals.filter((journal) => journal.visibility === "public").length;
  const gmOnlyCount = props.journals.filter((journal) => journal.visibility === "gm_only").length;
  const taggedCount = props.journals.filter((journal) => journal.tags.length > 0).length;
  const [visibleToUserIds, setVisibleToUserIds] = useState<string[]>([]);
  const [visibleToActorIds, setVisibleToActorIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const targetsValid = journalVisibilityHasTargets(props.visibility, visibleToUserIds, visibleToActorIds);
  const toggleTarget = (values: string[], value: string, checked: boolean): string[] => checked ? [...new Set([...values, value])] : values.filter((candidate) => candidate !== value);
  const createEntry = async () => {
    if (creatingRef.current || !targetsValid) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await props.onCreate({
        visibleToUserIds: props.visibility === "specific_players" ? visibleToUserIds : [],
        visibleToActorIds: props.visibility === "specific_characters" ? visibleToActorIds : []
      });
      setVisibleToUserIds([]);
      setVisibleToActorIds([]);
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
      <details className="create-drawer">
        <summary><Plus size={15} /> New entry</summary>
      <form
        className="operator-section content-import-form create-drawer-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createEntry().catch(console.error);
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
        <button className="primary-button wide" type="submit" disabled={!props.canCreate || !props.title.trim() || !targetsValid || creating}>
          <Plus size={16} /> {creating ? "Creating..." : "Create Entry"}
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
