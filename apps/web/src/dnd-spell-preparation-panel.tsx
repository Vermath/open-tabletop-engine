import type {
  Actor,
  Dnd5eSrdSpellPreparationMutationResult,
  Dnd5eSrdSpellPreparationPreviewResponse,
  Dnd5eSrdSpellPreparationTiming,
  Item,
} from "@open-tabletop/core";
import { AlertTriangle, Check, Eye, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiPost } from "./api.js";
import { errorMessage, recordValue } from "./sheet-format.js";

export interface DndSpellPreparationPanelProps {
  campaignId: string;
  actor: Actor;
  items: Item[];
  canUpdateActor: boolean;
  onApplied(result: Dnd5eSrdSpellPreparationMutationResult): void;
}

interface MutationAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

type PendingOperation = "preview" | "apply";

export function initialPreparedSpellIds(actor: Actor, items: Item[]): string[] {
  return items
    .filter((item) =>
      item.actorId === actor.id &&
      item.type === "spell" &&
      item.data.prepared === true &&
      item.data.alwaysPrepared !== true &&
      item.data.cantrip !== true
    )
    .map((item) => item.id)
    .sort();
}

export function spellItemRevisionMap(actor: Actor, items: Item[]): Record<string, string> {
  return Object.fromEntries(
    items
      .filter((item) => item.actorId === actor.id && item.type === "spell")
      .map((item) => [item.id, item.updatedAt])
  );
}

function storedPreparationTiming(actor: Actor): Dnd5eSrdSpellPreparationTiming {
  const timing = recordValue(actor.data.spellcasting).changeTiming;
  return timing === "class-level" ? "class-level" : "long-rest";
}

function preparationIdempotencyKey(scope: "preview" | "apply"): string {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `spell-preparation-${scope}:${nonce}`;
}

function encodedSpellPreparationPath(campaignId: string, systemId: string, actorId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${encodeURIComponent(systemId)}/actors/${encodeURIComponent(actorId)}/spell-preparation`;
}

export function DndSpellPreparationPanel({
  campaignId,
  actor,
  items,
  canUpdateActor,
  onApplied,
}: DndSpellPreparationPanelProps) {
  const actorSpells = items.filter((item) => item.actorId === actor.id && item.type === "spell");
  const normalSpells = actorSpells.filter((item) => item.data.alwaysPrepared !== true && item.data.cantrip !== true);
  const alwaysAvailableSpells = actorSpells.filter((item) => item.data.alwaysPrepared === true || item.data.cantrip === true);
  const revisionMap = spellItemRevisionMap(actor, items);
  const revisionFingerprint = JSON.stringify(revisionMap);
  const [selectedSpellIds, setSelectedSpellIds] = useState(() => initialPreparedSpellIds(actor, items));
  const [timing, setTiming] = useState<Dnd5eSrdSpellPreparationTiming>(() => storedPreparationTiming(actor));
  const [preview, setPreview] = useState<Dnd5eSrdSpellPreparationPreviewResponse>();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<PendingOperation>();
  const [failure, setFailure] = useState("");
  const previewAttemptRef = useRef<MutationAttempt | null>(null);
  const applyAttemptRef = useRef<MutationAttempt | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);
  const activeActorIdRef = useRef(actor.id);

  useEffect(() => {
    activeActorIdRef.current = actor.id;
    previewControllerRef.current?.abort();
    setSelectedSpellIds(initialPreparedSpellIds(actor, items));
    setTiming(storedPreparationTiming(actor));
    setPreview(undefined);
    setConfirmed(false);
    setPending(undefined);
    setFailure("");
    previewAttemptRef.current = null;
    applyAttemptRef.current = null;
    return () => previewControllerRef.current?.abort();
  }, [actor.id, actor.updatedAt, revisionFingerprint]);

  function invalidatePreview(): void {
    previewControllerRef.current?.abort();
    setPreview(undefined);
    setConfirmed(false);
    setFailure("");
    previewAttemptRef.current = null;
    applyAttemptRef.current = null;
  }

  function setSpellSelected(itemId: string, selected: boolean): void {
    invalidatePreview();
    setSelectedSpellIds((current) => {
      const next = selected
        ? [...new Set([...current, itemId])]
        : current.filter((candidate) => candidate !== itemId);
      return next.sort();
    });
  }

  async function previewPreparation(): Promise<void> {
    const selected = [...selectedSpellIds].sort();
    const fingerprint = JSON.stringify({
      actorUpdatedAt: actor.updatedAt,
      itemUpdatedAt: revisionMap,
      selectedSpellIds: selected,
      timing,
    });
    const attempt = previewAttemptRef.current?.fingerprint === fingerprint
      ? previewAttemptRef.current
      : { fingerprint, idempotencyKey: preparationIdempotencyKey("preview") };
    previewAttemptRef.current = attempt;
    previewControllerRef.current?.abort();
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setPending("preview");
    setFailure("");
    setConfirmed(false);
    try {
      const result = await apiPost<Dnd5eSrdSpellPreparationPreviewResponse>(
        `${encodedSpellPreparationPath(campaignId, actor.systemId, actor.id)}/preview`,
        {
          selectedSpellIds: selected,
          timing,
          expectedActorUpdatedAt: actor.updatedAt,
          expectedItemUpdatedAt: revisionMap,
        },
        { idempotencyKey: attempt.idempotencyKey, signal: controller.signal }
      );
      if (previewControllerRef.current !== controller) return;
      setPreview(result);
      applyAttemptRef.current = null;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      if (previewControllerRef.current !== controller) return;
      setFailure(errorMessage(error));
    } finally {
      if (previewControllerRef.current === controller) setPending(undefined);
    }
  }

  async function applyPreparation(): Promise<void> {
    if (!preview || preview.status !== "ready" || !confirmed) return;
    const operationActorId = actor.id;
    const fingerprint = JSON.stringify({ preparedPreviewKey: preview.preparedPreviewKey, actorUpdatedAt: preview.actorUpdatedAt, itemUpdatedAt: preview.itemUpdatedAt });
    const attempt = applyAttemptRef.current?.fingerprint === fingerprint
      ? applyAttemptRef.current
      : { fingerprint, idempotencyKey: preparationIdempotencyKey("apply") };
    applyAttemptRef.current = attempt;
    setPending("apply");
    setFailure("");
    try {
      const result = await apiPost<Dnd5eSrdSpellPreparationMutationResult>(
        `${encodedSpellPreparationPath(campaignId, actor.systemId, actor.id)}/apply`,
        {
          preparedPreviewKey: preview.preparedPreviewKey,
          expectedActorUpdatedAt: preview.actorUpdatedAt,
          expectedItemUpdatedAt: preview.itemUpdatedAt,
        },
        { idempotencyKey: attempt.idempotencyKey }
      );
      onApplied(result);
    } catch (error) {
      if (activeActorIdRef.current === operationActorId) setFailure(errorMessage(error));
    } finally {
      if (activeActorIdRef.current === operationActorId) setPending(undefined);
    }
  }

  return (
    <section className="operator-section" aria-label="D&D spell preparation" aria-busy={pending !== undefined}>
      <div className="operator-heading">
        <div className="section-title"><WandSparkles size={15} aria-hidden="true" /> Prepare spells</div>
        <strong>{normalSpells.length} selectable</strong>
      </div>
      <p className="admin-meta">
        Review a server-calculated plan before changing prepared class spells. Legacy, homebrew, and later-level acquisition stay manual when legality cannot be proven.
      </p>
      <fieldset disabled={!canUpdateActor || pending !== undefined}>
        <legend>Allowed change timing</legend>
        <label className="inline-check">
          <input
            type="radio"
            name={`spell-preparation-timing-${actor.id}`}
            value="long-rest"
            checked={timing === "long-rest"}
            onChange={() => { invalidatePreview(); setTiming("long-rest"); }}
          />
          <span>Finished a Long Rest</span>
        </label>
        <label className="inline-check">
          <input
            type="radio"
            name={`spell-preparation-timing-${actor.id}`}
            value="class-level"
            checked={timing === "class-level"}
            onChange={() => { invalidatePreview(); setTiming("class-level"); }}
          />
          <span>Gained a class level</span>
        </label>
      </fieldset>
      <fieldset disabled={!canUpdateActor || pending !== undefined}>
        <legend>Normal prepared spells</legend>
        {normalSpells.length === 0 ? (
          <div className="empty-state compact">No normal class spells are attached to this actor.</div>
        ) : normalSpells.map((item) => (
          <label className="inline-check" key={item.id}>
            <input
              type="checkbox"
              checked={selectedSpellIds.includes(item.id)}
              onChange={(event) => setSpellSelected(item.id, event.currentTarget.checked)}
            />
            <span>{item.name}</span>
          </label>
        ))}
      </fieldset>
      {alwaysAvailableSpells.length > 0 && (
        <fieldset disabled>
          <legend>Always available - excluded from capacity</legend>
          {alwaysAvailableSpells.map((item) => (
            <label className="inline-check" key={item.id}>
              <input type="checkbox" checked readOnly />
              <span>{item.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="button-row">
        <button className="ghost-button" type="button" disabled={!canUpdateActor || pending !== undefined} onClick={() => void previewPreparation()}>
          <Eye size={14} aria-hidden="true" /> {pending === "preview" ? "Previewing..." : "Preview preparation"}
        </button>
      </div>
      {failure && <div className="import-status" role="alert"><strong>Spell preparation failed</strong><span>{failure}</span></div>}
      {preview && (
        <div className="asset-pressure-list" aria-label="Spell preparation review">
          <div className="admin-meta">
            <span>Timing: {preview.requiredTiming === "long-rest" ? "Long Rest" : preview.requiredTiming === "class-level" ? "class level" : "manual review"}</span>
            {preview.capacity && <span>Capacity: {preview.capacity.selected} / {preview.capacity.limit}</span>}
            {preview.capacity && <span>Always available: {preview.capacity.alwaysPrepared}</span>}
          </div>
          {preview.blockers.length > 0 && (
            <div className="import-status" role="alert">
              <strong><AlertTriangle size={14} aria-hidden="true" /> Blockers</strong>
              <ul>{preview.blockers.map((blocker, index) => <li key={`${blocker.code}:${blocker.itemId ?? index}`}>{blocker.message}</li>)}</ul>
            </div>
          )}
          <div>
            <strong>Exact changes</strong>
            {preview.changes.length === 0 ? (
              <div className="admin-meta">No item preparation flags will change.</div>
            ) : (
              <ul>
                {preview.changes.map((change) => (
                  <li key={change.itemId}>{change.toPrepared ? "Prepare" : "Unprepare"} {change.name}</li>
                ))}
              </ul>
            )}
          </div>
          {preview.warnings.map((warning) => <div className="admin-meta" key={warning}>{warning}</div>)}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={preview.status !== "ready" || pending !== undefined}
              onChange={(event) => setConfirmed(event.currentTarget.checked)}
            />
            <span>I reviewed the timing, capacity, blockers, and exact changes.</span>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!canUpdateActor || preview.status !== "ready" || !confirmed || pending !== undefined}
            onClick={() => void applyPreparation()}
          >
            <Check size={14} aria-hidden="true" /> {pending === "apply" ? "Applying..." : "Apply prepared spells"}
          </button>
        </div>
      )}
    </section>
  );
}
