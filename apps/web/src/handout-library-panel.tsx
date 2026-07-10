import type { Actor, MapAsset, Visibility } from "@open-tabletop/core";
import { BookOpen, Check, Eye, FileText, Link2, Plus, Save, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiPatch, apiPost, type Snapshot } from "./api.js";
import { errorMessage, formatNumber } from "./sheet-format.js";
import type { LoreCollectionLoadState, WorldAtlasWorld } from "./world-atlas-panel.js";

export interface HandoutLibraryItem {
  id: string;
  campaignId: string;
  worldId?: string;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  assetIds: string[];
  tags: string[];
  readByUserIds: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type HandoutReadFilter = "all" | "unread" | "read";

export interface HandoutDraft {
  id?: string;
  worldId: string;
  title: string;
  body: string;
  visibility: Visibility;
  visibleToUserIds: string[];
  visibleToActorIds: string[];
  assetIds: string[];
  tags: string;
}

export function parseHandoutTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

export function filterHandoutLibrary(items: HandoutLibraryItem[], input: { query: string; worldId: string; read: HandoutReadFilter; userId: string }): HandoutLibraryItem[] {
  const query = input.query.trim().toLocaleLowerCase();
  return items
    .filter((item) => !input.worldId || (input.worldId === "unfiled" ? !item.worldId : item.worldId === input.worldId))
    .filter((item) => input.read === "all" || (input.read === "read") === item.readByUserIds.includes(input.userId))
    .filter((item) => !query || [item.title, item.body, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function markHandoutRead(handoutId: string): Promise<HandoutLibraryItem> {
  return apiPost<HandoutLibraryItem>(`/api/v1/handouts/${handoutId}/read`, {});
}

export function persistHandout(campaignId: string, input: HandoutDraft): Promise<HandoutLibraryItem> {
  const payload = handoutPayload(input);
  return input.id
    ? apiPatch<HandoutLibraryItem>(`/api/v1/handouts/${input.id}`, payload)
    : apiPost<HandoutLibraryItem>(`/api/v1/campaigns/${campaignId}/handouts`, payload);
}

export function deleteLibraryHandout(handoutId: string): Promise<unknown> {
  return apiDelete<unknown>(`/api/v1/handouts/${handoutId}`);
}

function toggleId(values: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, id])] : values.filter((value) => value !== id);
}

function visibilityLabel(visibility: Visibility): string {
  if (visibility === "gm_only") return "GM only";
  if (visibility === "specific_players") return "Selected players";
  if (visibility === "specific_characters") return "Character owners";
  return "Everyone";
}

export function HandoutLibraryPanel(props: {
  campaignId: string;
  currentUserId: string;
  handouts: HandoutLibraryItem[];
  worlds: WorldAtlasWorld[];
  members: Snapshot["members"];
  actors: Actor[];
  assets: MapAsset[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  loadState?: LoreCollectionLoadState;
  loadError?: string;
  onRetryLoad?(): void;
  onHandoutsChange(items: HandoutLibraryItem[]): void;
  onStatus(message: string): void;
}) {
  const [query, setQuery] = useState("");
  const [worldFilter, setWorldFilter] = useState("");
  const [readFilter, setReadFilter] = useState<HandoutReadFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const selected = props.handouts.find((item) => item.id === selectedId);
  const filtered = useMemo(() => filterHandoutLibrary(props.handouts, { query, worldId: worldFilter, read: readFilter, userId: props.currentUserId }), [props.handouts, props.currentUserId, query, readFilter, worldFilter]);

  useEffect(() => {
    if (!selectedId || props.handouts.some((item) => item.id === selectedId)) return;
    setSelectedId("");
  }, [props.handouts, selectedId]);

  async function openHandout(item: HandoutLibraryItem) {
    setSelectedId(item.id);
    setCreating(false);
    setDeleteArmed(false);
    if (item.readByUserIds.includes(props.currentUserId)) return;
    try {
      const updated = await markHandoutRead(item.id);
      props.onHandoutsChange(props.handouts.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch {
      // Reading remains available even when an older server does not support read receipts.
    }
  }

  async function saveHandout(input: HandoutDraft) {
    if (busy || !input.title.trim()) return;
    setBusy(true);
    try {
      const updated = await persistHandout(props.campaignId, input);
      const next = input.id
        ? props.handouts.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...props.handouts];
      props.onHandoutsChange(next);
      setSelectedId(updated.id);
      setCreating(false);
      props.onStatus(`${updated.title} ${input.id ? "updated" : "shared"}`);
    } catch (error) {
      props.onStatus(`Handout save failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteHandout() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await deleteLibraryHandout(selected.id);
      props.onHandoutsChange(props.handouts.filter((item) => item.id !== selected.id));
      setSelectedId("");
      setDeleteArmed(false);
      props.onStatus(`${selected.title} deleted`);
    } catch (error) {
      props.onStatus(`Handout deletion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-stack lore-panel handout-library-panel" aria-label="Handout Library">
      <div className="lore-panel-heading">
        <div>
          <div className="section-title">Handout Library</div>
          <h2>Shareable table documents</h2>
        </div>
        <BookOpen size={20} aria-hidden="true" />
      </div>

      {props.loadState === "loading" && <div className="lore-load-state" role="status">Loading handouts…</div>}
      {props.loadState === "error" && (
        <div className="lore-load-state error" role="alert">
          <span>{props.loadError || "Handouts could not be loaded."}</span>
          {props.onRetryLoad && <button className="ghost-button small" type="button" onClick={props.onRetryLoad}>Retry</button>}
        </div>
      )}

      <div className="lore-filter-grid">
        <label className="lore-search-field span-full">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search handouts</span>
          <input aria-label="Search handouts" value={query} placeholder="Search title, text, or tags" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          <span>World</span>
          <select aria-label="Filter handouts by world" value={worldFilter} onChange={(event) => setWorldFilter(event.target.value)}>
            <option value="">All worlds</option>
            <option value="unfiled">Unfiled</option>
            {props.worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
          </select>
        </label>
        <label>
          <span>Reading</span>
          <select aria-label="Filter handouts by read state" value={readFilter} onChange={(event) => setReadFilter(event.target.value as HandoutReadFilter)}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
      </div>

      <div className="lore-list-heading">
        <span>Library</span>
        <div>
          <strong>{formatNumber(filtered.length)}</strong>
          {props.canCreate && <button className="icon-button" type="button" aria-label="Create handout" title="Create handout" onClick={() => { setCreating(true); setSelectedId(""); }}><Plus size={14} /></button>}
        </div>
      </div>
      <div className="handout-list" role="list" aria-label="Handouts">
        {filtered.length === 0 ? <div className="empty-state compact">No handouts match this view.</div> : filtered.map((item) => {
          const unread = !item.readByUserIds.includes(props.currentUserId);
          return (
            <div role="listitem" key={item.id}>
              <button className={selectedId === item.id ? "handout-list-item active" : "handout-list-item"} type="button" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => void openHandout(item)}>
                <span className={unread ? "handout-read-dot unread" : "handout-read-dot"} aria-label={unread ? "Unread" : "Read"} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{visibilityLabel(item.visibility)} · {item.tags.slice(0, 2).join(" · ") || "untagged"}</small>
                </span>
                <FileText size={15} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {(selected || creating) && (
        <HandoutEditor
          key={selected?.id ?? "new"}
          item={selected}
          worlds={props.worlds}
          members={props.members}
          actors={props.actors}
          assets={props.assets}
          canManage={selected ? props.canUpdate : props.canCreate}
          busy={busy}
          onSave={saveHandout}
          onCancel={() => { setCreating(false); if (!selected) setSelectedId(""); }}
        />
      )}

      {selected && props.canDelete && (
        <div className="handout-danger-row">
          {deleteArmed ? (
            <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteHandout()}><Trash2 size={14} /> Confirm delete</button>
          ) : (
            <button className="ghost-button" type="button" disabled={busy} onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete handout</button>
          )}
        </div>
      )}
    </section>
  );
}

export function handoutPayload(input: HandoutDraft) {
  return {
    worldId: input.worldId || (input.id ? null : undefined),
    title: input.title.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    visibleToUserIds: input.visibility === "specific_players" ? input.visibleToUserIds : [],
    visibleToActorIds: input.visibility === "specific_characters" ? input.visibleToActorIds : [],
    assetIds: input.assetIds,
    tags: parseHandoutTags(input.tags)
  };
}

function HandoutEditor(props: {
  item?: HandoutLibraryItem;
  worlds: WorldAtlasWorld[];
  members: Snapshot["members"];
  actors: Actor[];
  assets: MapAsset[];
  canManage: boolean;
  busy: boolean;
  onSave(input: HandoutDraft): Promise<void>;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState<HandoutDraft>(() => ({
    id: props.item?.id,
    worldId: props.item?.worldId ?? "",
    title: props.item?.title ?? "",
    body: props.item?.body ?? "",
    visibility: props.item?.visibility ?? "public",
    visibleToUserIds: props.item?.visibleToUserIds ?? [],
    visibleToActorIds: props.item?.visibleToActorIds ?? [],
    assetIds: props.item?.assetIds ?? [],
    tags: props.item?.tags.join(", ") ?? ""
  }));
  const canSaveTargets = draft.visibility !== "specific_players" || draft.visibleToUserIds.length > 0;
  const canSaveCharacters = draft.visibility !== "specific_characters" || draft.visibleToActorIds.length > 0;
  const readCount = props.item?.readByUserIds.length ?? 0;

  return (
    <form className="lore-editor handout-editor" aria-label={props.item ? `Edit handout ${props.item.title}` : "Create handout"} onSubmit={(event) => { event.preventDefault(); void props.onSave(draft); }}>
      <div className="lore-editor-title">
        <strong>{props.item ? "Handout details" : "New handout"}</strong>
        {props.item && <span><Eye size={13} /> Read by {formatNumber(readCount)}</span>}
      </div>
      <label>
        <span>Title</span>
        <input aria-label="Handout title" value={draft.title} readOnly={!props.canManage} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
      </label>
      <label>
        <span>Body</span>
        <textarea aria-label="Handout body" value={draft.body} readOnly={!props.canManage} rows={9} placeholder="Markdown-friendly handout text" onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} />
      </label>
      <div className="lore-filter-grid">
        <label>
          <span>World</span>
          <select aria-label="Handout world" value={draft.worldId} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, worldId: event.target.value }))}>
            <option value="">Unfiled</option>
            {props.worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
          </select>
        </label>
        <label>
          <span>Audience</span>
          <select aria-label="Handout visibility" value={draft.visibility} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as Visibility }))}>
            <option value="public">Everyone</option>
            <option value="gm_only">GM only</option>
            <option value="specific_players">Selected players</option>
            <option value="specific_characters">Character owners</option>
          </select>
        </label>
      </div>
      <label>
        <span>Tags</span>
        <input aria-label="Handout tags" value={draft.tags} readOnly={!props.canManage} placeholder="lore, quest, session-3" onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} />
      </label>

      {draft.visibility === "specific_players" && (
        <fieldset className="lore-target-grid">
          <legend><Users size={13} /> Players who can read</legend>
          {props.members.map((member) => (
            <label key={member.user.id}>
              <input type="checkbox" checked={draft.visibleToUserIds.includes(member.user.id)} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, visibleToUserIds: toggleId(current.visibleToUserIds, member.user.id, event.target.checked) }))} />
              <span>{member.user.displayName}</span>
            </label>
          ))}
        </fieldset>
      )}
      {draft.visibility === "specific_characters" && (
        <fieldset className="lore-target-grid">
          <legend><Users size={13} /> Character owners who can read</legend>
          {props.actors.map((actor) => (
            <label key={actor.id}>
              <input type="checkbox" checked={draft.visibleToActorIds.includes(actor.id)} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, visibleToActorIds: toggleId(current.visibleToActorIds, actor.id, event.target.checked) }))} />
              <span>{actor.name}</span>
            </label>
          ))}
        </fieldset>
      )}

      <details className="lore-link-drawer">
        <summary><Link2 size={14} /> Linked assets <span>{formatNumber(draft.assetIds.length)}</span></summary>
        <div className="lore-target-grid">
          {props.assets.length === 0 ? <span className="account-summary">No campaign assets yet.</span> : props.assets.map((asset) => (
            <label key={asset.id}>
              <input type="checkbox" checked={draft.assetIds.includes(asset.id)} disabled={!props.canManage} onChange={(event) => setDraft((current) => ({ ...current, assetIds: toggleId(current.assetIds, asset.id, event.target.checked) }))} />
              <span>{asset.name}</span>
            </label>
          ))}
        </div>
      </details>

      {props.canManage && (
        <div className="button-row wrap">
          <button className="primary-button" type="submit" disabled={props.busy || !draft.title.trim() || !canSaveTargets || !canSaveCharacters}><Save size={14} /> {props.item ? "Save handout" : "Share handout"}</button>
          {!props.item && <button className="ghost-button" type="button" onClick={props.onCancel}><Check size={14} /> Cancel</button>}
        </div>
      )}
    </form>
  );
}
