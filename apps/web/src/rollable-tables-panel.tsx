import type { RollableTable, RollableTableInput } from "@open-tabletop/core";
import { useRef, useState } from "react";
import { errorMessage } from "./sheet-format.js";
import "./rollable-tables.css";

import type { TableMutation } from "./rollable-table-actions.js";

export interface RollableTablesPanelProps {
  tables: RollableTable[];
  canManage: boolean;
  canDraw: boolean;
  mutate(action: TableMutation): Promise<void>;
}

export function RollableTablesPanel({ tables, canManage, canDraw, mutate }: RollableTablesPanelProps) {
  const [selectedId, select] = useState("");
  const [draft, setDraft] = useState<RollableTableInput>();
  const [editing, setEditing] = useState<RollableTable>();
  const [confirmDelete, setConfirmDelete] = useState<RollableTable>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const table = tables.find((item) => item.id === selectedId) ?? tables[0];
  const reviewed = draft ? editing : confirmDelete;
  const latest = reviewed && tables.find((item) => item.id === reviewed.id);
  const changed = Boolean(reviewed && latest?.updatedAt !== reviewed.updatedAt);
  if (!canManage && (!canDraw || !tables.length)) return null;

  function edit(existing?: RollableTable) {
    setEditing(existing);
    setConfirmDelete(undefined);
    setError("");
    setDraft(existing ? { name: existing.name, category: existing.category, visibility: existing.visibility, entries: existing.entries } :
      { name: "", category: "loot", visibility: "gm_only", entries: [{ text: "", weight: 1 }] });
  }

  async function submit(action: TableMutation) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await mutate(action);
      setDraft(undefined);
      setConfirmDelete(undefined);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }

  return <details className="rollable-tables"><summary>Rollable tables</summary>
    <div className="rollable-table-controls">
      {table && <label>Campaign table<select value={table.id} disabled={busy || Boolean(draft)} onChange={(event) => { select(event.target.value); setConfirmDelete(undefined); setError(""); }}>
        {tables.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}
      </select></label>}
      {!draft && !confirmDelete && <div className="button-row">
        {table && canDraw && table.visibility === "public" && <button type="button" className="ghost-button" disabled={busy} onClick={() => void submit({ kind: "draw", tableId: table.id, visibility: "public" })}>Draw to chat</button>}
        {table && canDraw && canManage && <button type="button" className="ghost-button" disabled={busy} onClick={() => void submit({ kind: "draw", tableId: table.id, visibility: "gm_only" })}>Draw GM only</button>}
        {canManage && <>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => edit()}>New table</button>
          {table && <><button type="button" className="ghost-button" disabled={busy} onClick={() => edit(table)}>Edit table</button>
            <button type="button" className="ghost-button" disabled={busy} onClick={() => setConfirmDelete(table)}>Delete table</button></>}
        </>}
      </div>}
      {canManage && changed && <div role="status">
        {latest ? <><p>{latest.name} changed while you were reviewing it.</p>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => {
            if (draft) edit(latest);
            else { setConfirmDelete(latest); setError(""); }
          }}>{draft ? "Load latest table" : "Review latest deletion"}</button></> : <p>This table was removed.</p>}
      </div>}
      {canManage && confirmDelete && <div>
        <p>Delete {confirmDelete.name}? Previous draws stay in chat.</p>
        <button type="button" className="ghost-button" disabled={busy || changed} onClick={() => void submit({ kind: "delete", tableId: confirmDelete.id, expectedUpdatedAt: confirmDelete.updatedAt })}>Confirm delete</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => setConfirmDelete(undefined)}>Cancel</button>
      </div>}
      {canManage && draft && <form onSubmit={(event) => { event.preventDefault(); if (changed) return; void submit(editing ? { kind: "update", tableId: editing.id, expectedUpdatedAt: editing.updatedAt, input: draft } : { kind: "create", input: draft }); }}>
        <fieldset disabled={busy}>
          <label>Table name<input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as RollableTable["category"] })}>
            <option value="loot">Loot</option><option value="encounter">Encounters</option><option value="rumor">Rumors</option>
          </select></label>
          <label>Table visibility<select value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as RollableTable["visibility"] })}>
            <option value="gm_only">GM only</option><option value="public">Public</option>
          </select></label>
          {draft.entries.map((entry, index) => <div className="rollable-table-entry" key={index}>
            <label>Result {index + 1}<input required maxLength={500} value={entry.text} onChange={(event) => setDraft({ ...draft, entries: draft.entries.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} /></label>
            <label>Weight {index + 1}<input type="number" min={1} max={10000} step={1} required value={entry.weight || ""} onChange={(event) => setDraft({ ...draft, entries: draft.entries.map((item, i) => i === index ? { ...item, weight: Number(event.target.value) } : item) })} /></label>
            <button type="button" className="ghost-button" aria-label={`Remove result ${index + 1}`} disabled={draft.entries.length === 1} onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, i) => i !== index) })}>×</button>
          </div>)}
          <div className="button-row"><button type="button" className="ghost-button" disabled={draft.entries.length >= 100} onClick={() => setDraft({ ...draft, entries: [...draft.entries, { text: "", weight: 1 }] })}>Add result</button>
            <button type="submit" disabled={changed} className="primary-button">Save table</button><button type="button" className="ghost-button" onClick={() => setDraft(undefined)}>Cancel</button></div>
        </fieldset>
      </form>}
      {error && <p role="alert">{error}</p>}
    </div>
  </details>;
}
