import type { Actor, DeclarativeActorSheet as Sheet } from "@open-tabletop/core";
import { Dices } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { declarativeFieldKey, prepareDeclarativeActorSave, prepareDeclarativeRoll, rollDeclarativeActor, saveDeclarativeActor, type DeclarativeFieldInput, type DeclarativeFieldInputs } from "./declarative-system-client.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";

interface SheetDraft { actor: Actor; sheet: Sheet; inputs: DeclarativeFieldInputs }

export function DeclarativeActorSheet(props: {
  campaignId: string;
  currentUserId: string;
  actor: Actor;
  sheet: Sheet;
  canEdit: boolean;
  canRoll: boolean;
  onUpdated(actor: Actor, sheet?: Sheet): void;
  onRefresh(): void;
}) {
  const scopeKey = JSON.stringify([props.campaignId, props.currentUserId, props.actor.id, props.actor.systemId]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const mountedRef = useRef(true);
  const controllers = useRef(new Set<AbortController>());
  const action = useRetryableAction(scopeKey);
  const [draft, setDraft] = useState<SheetDraft>();
  const [status, setStatus] = useState("");
  useEffect(() => {
    mountedRef.current = true;
    setDraft(undefined);
    setStatus("");
    return () => {
      mountedRef.current = false;
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
  }, [scopeKey]);
  const pending = action.operation?.kind === "pending";
  const fresh = props.sheet.actorUpdatedAt === props.actor.updatedAt && props.sheet.actorId === props.actor.id && props.sheet.system.systemId === props.actor.systemId;
  const draftStale = Boolean(draft && (draft.actor.updatedAt !== props.actor.updatedAt || draft.sheet.system.checksum !== props.sheet.system.checksum));

  function changeField(path: string[], input: DeclarativeFieldInput) {
    if (!props.canEdit || !fresh || pending || draftStale) return;
    setDraft((current) => ({
      actor: current?.actor ?? structuredClone(props.actor),
      sheet: current?.sheet ?? structuredClone(props.sheet),
      inputs: { ...current?.inputs, [declarativeFieldKey(path)]: input }
    }));
    setStatus("");
  }

  async function runScoped<T>(task: (signal: AbortSignal) => Promise<T>, onResult: (result: T) => void) {
    if (!mountedRef.current || scopeRef.current !== scopeKey) return;
    const controller = new AbortController();
    controllers.current.add(controller);
    const isCurrent = () => mountedRef.current && scopeRef.current === scopeKey && !controller.signal.aborted;
    try {
      const result = await task(controller.signal);
      if (isCurrent()) onResult(result);
    } catch (error) {
      if (isCurrent()) throw error;
    } finally {
      controllers.current.delete(controller);
    }
  }

  function save() {
    if (!draft || !props.canEdit || pending || draftStale) return;
    const captured = draft;
    // The captured actor, sheet, payload and key stay fixed through retries.
    let request: ReturnType<typeof prepareDeclarativeActorSave> | undefined;
    void action.runAction("Save character fields", async () => {
      request ??= prepareDeclarativeActorSave(captured.actor, captured.sheet, captured.inputs);
      await runScoped((signal) => saveDeclarativeActor(request!, signal), (actor) => {
        setDraft((current) => current === captured ? undefined : current);
        setStatus("Character fields saved.");
        props.onUpdated(actor);
      });
    });
  }

  function roll(rollId: string) {
    if (!props.canRoll || !fresh || pending || draft) return;
    const request = prepareDeclarativeRoll(props.campaignId, props.sheet, rollId, globalThis.crypto.randomUUID());
    void action.runAction("Roll character action", () => runScoped((signal) => rollDeclarativeActor(request, signal), (result) => {
      setStatus(`${result.quickRoll.label}: ${result.roll.total}${result.cost ? `; ${result.cost.path.join(".")} ${result.cost.before} → ${result.cost.after}` : ""}.`);
      props.onUpdated(result.actor, result.sheet);
    }));
  }

  return (
    <section className="operator-section" aria-label="Custom character sheet">
      <div className="operator-heading"><div><div className="section-title">Character sheet</div><p>Rules version {props.sheet.system.version}</p></div><button className="ghost-button small" type="button" disabled={pending} onClick={props.onRefresh}>Refresh sheet</button></div>
      <RetryableActionNotice operation={action.operation} onRetry={action.retryAction ? () => void action.retryAction?.() : undefined} onDismiss={action.clearAction} />
      {!fresh && <p className="admin-status" role="status">Refreshing the character revision. Fields and rolls will be available when the sheet matches.</p>}
      {draftStale && <p className="admin-status" role="alert">This character or its rules changed. Your draft is preserved; discard it to load the current fields.</p>}
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        {props.sheet.fields.map((field) => {
          const key = declarativeFieldKey(field.path);
          const value = draft && Object.hasOwn(draft.inputs, key) ? draft.inputs[key]! : field.value;
          const disabled = !props.canEdit || !field.editable || !field.present || !fresh || pending || draftStale;
          return (
            <label className="sheet-row" key={key}>
              <span>{field.label}{field.required ? " *" : ""}</span>
              {field.schema.type === "boolean" ? (
                <input aria-label={field.label} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => changeField(field.path, event.currentTarget.checked)} />
              ) : field.schema.enum ? (
                <select aria-label={field.label} value={value === undefined ? "" : String(value)} disabled={disabled} onChange={(event) => changeField(field.path, event.currentTarget.value)}>
                  {!field.present && <option value="">Missing value</option>}
                  {field.schema.enum.map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
                </select>
              ) : (
                <input aria-label={field.label} type={field.schema.type === "string" ? "text" : "number"} value={value === undefined ? "" : String(value)} disabled={disabled} maxLength={field.schema.type === "string" ? field.schema.maxLength : undefined} min={field.schema.type === "string" ? undefined : field.schema.minimum} max={field.schema.type === "string" ? undefined : field.schema.maximum} step={field.schema.type === "integer" ? 1 : "any"} onChange={(event) => changeField(field.path, event.currentTarget.value)} />
              )}
              {!field.present && <span className="admin-status">Missing value</span>}
            </label>
          );
        })}
        {props.canEdit && <div className="button-row">
          <button className="ghost-button" type="submit" disabled={!draft || pending || draftStale}>Save fields</button>
          {draft && <button className="ghost-button" type="button" disabled={pending} onClick={() => { setDraft(undefined); action.clearAction(); props.onRefresh(); }}>Discard draft and refresh</button>}
        </div>}
      </form>
      <div className="actor-sheet-subheading"><span>Quick rolls</span></div>
      {draft && <p className="admin-status">Save or discard your field changes before rolling.</p>}
      {props.sheet.quickRolls.length === 0 && <div className="empty-state compact">No quick rolls are defined.</div>}
      {props.sheet.quickRolls.map((quickRoll) => <article className="operator-item" key={quickRoll.id}>
        <div className="metric-row"><span>{quickRoll.label}</span><strong>{quickRoll.formula ?? "Formula unavailable"}</strong></div>
        {quickRoll.cost && <p>Cost: {quickRoll.cost.amount} {quickRoll.cost.path.join(".")} ({quickRoll.cost.before} → {quickRoll.cost.after})</p>}
        {quickRoll.issues.map((issue, index) => <p className="admin-status" key={`${issue.code}:${index}`}>{issue.message}</p>)}
        {!quickRoll.available && quickRoll.issues.length === 0 && <p className="admin-status">This roll is currently unavailable.</p>}
        <button className="ghost-button small" type="button" aria-label={`Roll ${quickRoll.label}`} disabled={!props.canRoll || !quickRoll.available || !fresh || pending || Boolean(draft)} onClick={() => roll(quickRoll.id)}><Dices size={14} /> Roll</button>
      </article>)}
      {status && <p className="admin-status" role="status">{status}</p>}
    </section>
  );
}
