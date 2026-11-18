import type { PartyRollChoice, PartyRollRequest } from "@open-tabletop/api-contracts";
import { Dices, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { errorMessage } from "./sheet-format.js";
import "./party-roll-panel.css";

export function PartyRollPanel({ campaignId, currentUserId, canManage, requests, onRefresh }: {
  campaignId: string;
  currentUserId: string;
  canManage: boolean;
  requests: PartyRollRequest[];
  onRefresh(): Promise<unknown>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<PartyRollChoice[]>();
  const [check, setCheck] = useState("skill-perception");
  const [actorIds, setActorIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const requestPath = `/api/v1/campaigns/${encodeURIComponent(campaignId)}/party-roll-requests`;
  const storageKey = `otte:party-roll-attempt:${campaignId}:${currentUserId}`;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);

  useEffect(() => {
    if (!open || !canManage) return;
    const controller = new AbortController();
    setChoices(undefined);
    apiGet<PartyRollChoice[]>(`${requestPath}/choices`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setChoices(next);
        setCheck((id) => next.some((choice) => choice.rolls.some((roll) => roll.id === id)) ? id : next[0]?.rolls[0]?.id ?? "");
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => controller.abort();
  }, [open, requestPath, canManage]);

  const checks = Array.from(new Map(choices?.flatMap((choice) => choice.rolls.map((roll) => [roll.id, roll] as const))).values());
  const eligible = choices?.filter((choice) => choice.rolls.some((roll) => roll.id === check)) ?? [];
  const selected = eligible.filter((choice) => actorIds.includes(choice.actorId)).map((choice) => choice.actorId);
  const newest = [...requests].reverse();
  const pending = newest.flatMap((entry) => entry.recipients.filter((row) => !row.result && !row.unavailable).map((row) => ({ entry, row })));

  async function mutate(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await onRefresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function sendRequest() {
    const input = { rollId: check, actorIds: [...selected].sort() };
    const fingerprint = JSON.stringify(input);
    const last = sessionStorage.getItem(storageKey);
    const id = last?.startsWith(fingerprint + "\n") ? last.slice(fingerprint.length + 1) : crypto.randomUUID();
    sessionStorage.setItem(storageKey, fingerprint + "\n" + id);
    await apiPost(requestPath, input, { idempotencyKey: id });
    sessionStorage.removeItem(storageKey);
    setActorIds([]);
  }

  function answer(requestId: string, actorId: string) {
    return mutate(async () => { await apiPost(`${requestPath}/${encodeURIComponent(requestId)}/actors/${encodeURIComponent(actorId)}/roll`, {}); });
  }

  if (!canManage && !requests.length) return null;
  const first = pending[0];
  return <div className="party-roll-control">
    {!canManage && first && <button type="button" className="primary-button" disabled={busy}
      onClick={() => void answer(first.entry.id, first.row.actorId)}>Roll {first.entry.label} · {first.row.actorName}</button>}
    <button type="button" className="ghost-button" aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}>
      <Dices size={16} aria-hidden="true" /> {canManage ? "Party rolls" : "My rolls"}
      {pending.length > 0 && <span aria-label={`${pending.length} pending`}>{pending.length}</span>}
    </button>
    {!open && error && <span role="alert">{error}</span>}
    {open && <dialog ref={dialog} className="party-roll-dialog" aria-label={canManage ? "Party rolls" : "My rolls"}
      onCancel={() => setOpen(false)}>
      <header><h2>{canManage ? "Party rolls" : "My rolls"}</h2><button type="button" className="icon-button" aria-label="Close party rolls" onClick={() => setOpen(false)}><X size={18} /></button></header>
      {canManage && <form onSubmit={(event) => { event.preventDefault(); if (selected.length) void mutate(sendRequest); }}>
        <label>Skill check or save<select value={check} onChange={(event) => { setCheck(event.target.value); }}>
          {checks.map((roll) => <option key={roll.id} value={roll.id}>{roll.label}</option>)}
        </select></label>
        <fieldset><legend>Player characters</legend>
          {eligible.map((choice) => <label className="inline-check" key={choice.actorId}><input type="checkbox"
            checked={actorIds.includes(choice.actorId)} onChange={(event) => setActorIds((ids) => event.target.checked
              ? [...ids, choice.actorId] : ids.filter((id) => id !== choice.actorId))} /> {choice.actorName}</label>)}
          {!choices && !error && <span>Loading characters…</span>}
          {choices && !eligible.length && <span>No player characters have an available check.</span>}
        </fieldset>
        <button type="submit" className="primary-button" disabled={busy || !selected.length}>Request roll</button>
      </form>}
      {error && <p role="alert">{error}</p>}
      <div aria-live="polite">{newest.map((entry) => <section className="party-roll-roster" key={entry.id} aria-label={entry.label}>
        <h3>{entry.label}</h3>
        <ul>{entry.recipients.map((row) => <li key={row.actorId}><span>{row.actorName}</span>
          {row.result ? <strong>{row.result.formula} = {row.result.total}</strong>
            : canManage ? <span>{row.unavailable ? "Unavailable" : "Pending"}</span>
            : <button type="button" className="ghost-button" disabled={busy} onClick={() => void answer(entry.id, row.actorId)}>Roll {entry.label}</button>}
        </li>)}</ul>
      </section>)}</div>
    </dialog>}
  </div>;
}
