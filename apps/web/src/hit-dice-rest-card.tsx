import type { Actor } from "@open-tabletop/core";
import { HeartPulse, Moon, Sunrise } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { errorMessage, formatNumber, numericValue, recordValue, stringValue } from "./sheet-format.js";

export interface HitDicePoolInfo {
  className: string;
  size: string;
  current: number;
  max: number;
}

export interface ActorRestOptions {
  hitDice?: Array<{ className?: string }>;
  arcaneRecovery?: Record<string, number>;
  /** Durable server-side preview selected by the player. */
  preparedPreviewKey?: string;
  idempotencyKey?: string;
}

export interface RestPreviewChange {
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after?: unknown;
  source: { systemId: string; rulesVersion: string; schemaVersion: string; rule: string };
}

export interface RestPreviewEnvelope {
  actorId: string;
  status: "ready" | "blocked";
  blockers: Array<{ path: string; code: string; message: string }>;
  serverRolls: Array<{ id: string; path: string; formula: string; reason: string }>;
  changes: RestPreviewChange[];
  validation: { actor: { issues: Array<{ path: string; severity: "error" | "warning"; code: string; message: string }> } };
  details?: { restType?: "short" | "long"; recovered?: Record<string, unknown>; removedConditions?: unknown[] };
  preparation?: {
    preparedPreviewKey?: string;
    idempotencyKey?: string;
    actorUpdatedAt: string;
    request: { restType?: "short" | "long"; hitDice?: Array<{ className?: string; roll?: number }> };
  };
}

export function actorHitDicePools(actor: Actor): HitDicePoolInfo[] {
  if (!Array.isArray(actor.data.hitDicePools)) return [];
  return actor.data.hitDicePools.flatMap((value) => {
    const pool = recordValue(value);
    const className = stringValue(pool.className);
    const size = stringValue(pool.size);
    if (!className || !size) return [];
    const max = Math.max(0, Math.floor(numericValue(pool.max, 0)));
    const current = Math.max(0, Math.min(max, Math.floor(numericValue(pool.current, max))));
    return [{ className, size, current, max }];
  });
}

export function actorAggregateHitDice(actor: Actor): { current: number; max: number; size: string } | undefined {
  const hitDice = recordValue(actor.data.hitDice);
  const max = Math.max(0, Math.floor(numericValue(hitDice.max, 0)));
  const size = stringValue(hitDice.size);
  if (!size && max === 0) return undefined;
  return { current: Math.max(0, Math.min(max, Math.floor(numericValue(hitDice.current, max)))), max, size: size ?? "d8" };
}

export function selectedShortRestHitDice(pools: HitDicePoolInfo[], selections: Record<string, number>, aggregateCount = 0): Array<{ className?: string }> {
  if (pools.length === 0) {
    return Array.from({ length: Math.max(0, Math.floor(aggregateCount)) }, () => ({}));
  }
  return pools.flatMap((pool) => {
    const count = Math.max(0, Math.min(pool.current, Math.floor(selections[pool.className] ?? 0)));
    return Array.from({ length: count }, () => ({ className: pool.className }));
  });
}

export function selectNextShortRestHitDie(pools: HitDicePoolInfo[], className: string, selected: boolean): Record<string, number> {
  if (!selected) return {};
  const pool = pools.find((candidate) => candidate.className === className);
  return pool && pool.current > 0 ? { [className]: 1 } : {};
}

export function preparedRestHitDieRolls(preview: Pick<RestPreviewEnvelope, "preparation">): Array<{ className?: string; roll: number }> {
  return (preview.preparation?.request.hitDice ?? []).flatMap((selection) =>
    typeof selection.roll === "number" && Number.isFinite(selection.roll)
      ? [{ ...(selection.className ? { className: selection.className } : {}), roll: selection.roll }]
      : []
  );
}

export function HitDiceRestCard(props: {
  actor: Actor;
  canRest: boolean;
  onPreviewRest?(restType: "short" | "long", options: ActorRestOptions, idempotencyKey: string): Promise<RestPreviewEnvelope>;
  onRest(restType: "short" | "long", options?: ActorRestOptions): void | Promise<void>;
}) {
  const pools = actorHitDicePools(props.actor);
  const aggregate = actorAggregateHitDice(props.actor);
  const [poolSelections, setPoolSelections] = useState<Record<string, number>>({});
  const [aggregateSelection, setAggregateSelection] = useState(0);
  const [resting, setResting] = useState<"short" | "long" | "">("");
  const [previewing, setPreviewing] = useState<"short" | "long" | "">("");
  const [restError, setRestError] = useState("");
  const [restReview, setRestReview] = useState<{ restType: "short" | "long"; preview: RestPreviewEnvelope }>();
  const [restConfirmed, setRestConfirmed] = useState(false);
  const shortRestPreviewKeyRef = useRef<string | undefined>(undefined);
  const longRestPreviewKeyRef = useRef<string | undefined>(undefined);
  const shortRestRetryKeyRef = useRef<string | undefined>(undefined);
  const longRestRetryKeyRef = useRef<string | undefined>(undefined);
  const requestGenerationRef = useRef(0);
  const selectedDice = selectedShortRestHitDice(pools, poolSelections, aggregateSelection);
  const currentHitDice = pools.length > 0 ? pools.reduce((total, pool) => total + pool.current, 0) : aggregate?.current ?? 0;
  const maxHitDice = pools.length > 0 ? pools.reduce((total, pool) => total + pool.max, 0) : aggregate?.max ?? 0;

  useEffect(() => {
    requestGenerationRef.current += 1;
    setPoolSelections({});
    setAggregateSelection(0);
    setResting("");
    setPreviewing("");
    setRestError("");
    setRestReview(undefined);
    setRestConfirmed(false);
    shortRestPreviewKeyRef.current = undefined;
    longRestPreviewKeyRef.current = undefined;
    shortRestRetryKeyRef.current = undefined;
    longRestRetryKeyRef.current = undefined;
  }, [props.actor.id]);

  if (!aggregate && pools.length === 0) return null;

  const resetShortRestAttempt = () => {
    setRestReview(undefined);
    setRestConfirmed(false);
    setRestError("");
    shortRestPreviewKeyRef.current = undefined;
    shortRestRetryKeyRef.current = undefined;
  };

  const previewRest = async (restType: "short" | "long") => {
    if (previewing || resting || !props.onPreviewRest) return;
    setPreviewing(restType);
    setRestError("");
    setRestConfirmed(false);
    const previewKeyRef = restType === "short" ? shortRestPreviewKeyRef : longRestPreviewKeyRef;
    const idempotencyKey = previewKeyRef.current ?? `${restType}-rest-preview:${globalThis.crypto.randomUUID()}`;
    previewKeyRef.current = idempotencyKey;
    const generation = requestGenerationRef.current;
    try {
      const preview = await props.onPreviewRest(restType, restType === "short" ? { hitDice: selectedDice } : {}, idempotencyKey);
      if (generation !== requestGenerationRef.current) return;
      setRestReview({ restType, preview });
      if (preview.status !== "ready") setRestError(preview.blockers[0]?.message ?? preview.serverRolls[0]?.reason ?? "Rest is not ready to commit.");
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setRestError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) setPreviewing("");
    }
  };

  const takeDirectShortRest = async () => {
    if (resting) return;
    setResting("short");
    setRestError("");
    const idempotencyKey = shortRestRetryKeyRef.current ?? `short-rest:${globalThis.crypto.randomUUID()}`;
    shortRestRetryKeyRef.current = idempotencyKey;
    const generation = requestGenerationRef.current;
    try {
      await props.onRest("short", { hitDice: selectedDice, idempotencyKey });
      if (generation !== requestGenerationRef.current) return;
      shortRestRetryKeyRef.current = undefined;
      setPoolSelections({});
      setAggregateSelection(0);
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setRestError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) setResting("");
    }
  };

  const takeDirectLongRest = async () => {
    if (resting) return;
    setResting("long");
    setRestError("");
    const idempotencyKey = longRestRetryKeyRef.current ?? `long-rest:${globalThis.crypto.randomUUID()}`;
    longRestRetryKeyRef.current = idempotencyKey;
    const generation = requestGenerationRef.current;
    try {
      await props.onRest("long", { idempotencyKey });
      if (generation !== requestGenerationRef.current) return;
      longRestRetryKeyRef.current = undefined;
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setRestError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) setResting("");
    }
  };

  const beginRest = (restType: "short" | "long") => {
    if (props.actor.systemId === "dnd-5e-srd" && props.onPreviewRest) {
      void previewRest(restType);
      return;
    }
    if (restType === "short") void takeDirectShortRest();
    else void takeDirectLongRest();
  };

  const commitPreparedRest = async () => {
    if (!restReview || resting || restReview.preview.status !== "ready" || !restReview.preview.preparation || !restConfirmed) return;
    const preparedPreviewKey = restReview.preview.preparation.preparedPreviewKey ?? restReview.preview.preparation.idempotencyKey;
    if (!preparedPreviewKey) {
      setRestError("The reviewed rest is missing its prepared preview key. Review it again.");
      return;
    }
    const restType = restReview.restType;
    const retryKeyRef = restType === "short" ? shortRestRetryKeyRef : longRestRetryKeyRef;
    const idempotencyKey = retryKeyRef.current ?? `${restType}-rest:${globalThis.crypto.randomUUID()}`;
    retryKeyRef.current = idempotencyKey;
    setResting(restType);
    setRestError("");
    const generation = requestGenerationRef.current;
    try {
      await props.onRest(restType, {
        preparedPreviewKey,
        idempotencyKey
      });
      if (generation !== requestGenerationRef.current) return;
      shortRestPreviewKeyRef.current = undefined;
      longRestPreviewKeyRef.current = undefined;
      shortRestRetryKeyRef.current = undefined;
      longRestRetryKeyRef.current = undefined;
      setRestReview(undefined);
      setRestConfirmed(false);
      // Each prepared transaction spends at most the one die selected by the
      // card, so the player can inspect the new HP total before choosing again.
      // A Long Rest also invalidates any short-rest selection made beforehand.
      setPoolSelections({});
      setAggregateSelection(0);
    } catch (error) {
      if (generation !== requestGenerationRef.current) return;
      setRestError(errorMessage(error));
    } finally {
      if (generation === requestGenerationRef.current) setResting("");
    }
  };

  const busy = Boolean(resting || previewing);

  return (
    <details className="actor-rest-card">
      <summary>
        <span><HeartPulse size={14} aria-hidden="true" /> Recovery</span>
        <strong>{formatNumber(currentHitDice)}/{formatNumber(maxHitDice)} hit dice</strong>
      </summary>
      <div className="actor-rest-card-body">
        {pools.length > 0 ? (
          <div className="hit-dice-pools" aria-label="Hit dice by class">
            {pools.map((pool) => (
              <div className={pool.current > 0 ? "hit-die-pool" : "hit-die-pool empty"} key={pool.className}>
                <span>{pool.className}</span>
                <strong>{formatNumber(pool.current)}/{formatNumber(pool.max)}{pool.size}</strong>
                <div className="hit-die-meter" role="meter" aria-label={`${pool.className} ${pool.size} hit dice`} aria-valuemin={0} aria-valuemax={pool.max} aria-valuenow={pool.current}>
                  <span style={{ width: `${pool.max > 0 ? Math.round((pool.current / pool.max) * 100) : 0}%` }} />
                </div>
                <label className="hit-die-spend-choice">
                  <span>Next short-rest die</span>
                  <select aria-label={`${pool.className} hit dice to spend`} value={poolSelections[pool.className] ?? 0} disabled={!props.canRest || busy || Boolean(restReview) || pool.current === 0} onChange={(event) => {
                    resetShortRestAttempt();
                    setPoolSelections(selectNextShortRestHitDie(pools, pool.className, event.target.value === "1"));
                  }}>
                    <option value={0}>Do not roll</option>
                    <option value={1}>Roll 1{pool.size}</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
        ) : aggregate ? (
          <div className="hit-die-pool">
            <span>Hit dice</span>
            <strong>{formatNumber(aggregate.current)}/{formatNumber(aggregate.max)}{aggregate.size}</strong>
            <div className="hit-die-meter" role="meter" aria-label={`${aggregate.size} hit dice`} aria-valuemin={0} aria-valuemax={aggregate.max} aria-valuenow={aggregate.current}>
              <span style={{ width: `${aggregate.max > 0 ? Math.round((aggregate.current / aggregate.max) * 100) : 0}%` }} />
            </div>
            <label className="hit-die-spend-choice">
              <span>Next short-rest die</span>
              <select aria-label="Hit dice to spend" value={aggregateSelection} disabled={!props.canRest || busy || Boolean(restReview) || aggregate.current === 0} onChange={(event) => {
                resetShortRestAttempt();
                setAggregateSelection(event.target.value === "1" ? 1 : 0);
              }}>
                <option value={0}>Do not roll</option>
                <option value={1}>Roll 1{aggregate.size}</option>
              </select>
            </label>
          </div>
        ) : null}
        <p className="account-summary">
          {selectedDice.length === 0
            ? "Finish without another hit die; a zero-die short rest still restores eligible short-rest resources."
            : `Roll one ${pools.find((pool) => pool.className === selectedDice[0]?.className)?.size ?? aggregate?.size ?? "hit die"}, review the healing, then choose whether to roll again.`}
        </p>
        {restReview && (
          <div className="advancement-review" role="region" aria-label={`Exact ${restReview.restType} rest review`}>
            {preparedRestHitDieRolls(restReview.preview).map((selection, index) => (
              <div className="operator-row tool-call-row" key={`${selection.className ?? "hit-die"}:${index}`}>
                <span>Server Hit Die roll{selection.className ? ` (${selection.className})` : ""}</span>
                <strong>{selection.roll ?? "pending"}</strong>
              </div>
            ))}
            {restReview.preview.changes.length === 0 ? (
              <p className="account-summary">The reviewed rest does not change any actor fields.</p>
            ) : (
              <div className="advancement-preview-diff" aria-label="Proposed rest changes">
                {restReview.preview.changes.map((change) => (
                  <div className="operator-row tool-call-row" key={`${change.path}:${change.operation}`}>
                    <span>{restPreviewPath(change.path)}</span>
                    <strong>{restPreviewValue(change.before)} to {restPreviewValue(change.after)}</strong>
                    <small>{change.source.rulesVersion} · {change.source.rule}</small>
                  </div>
                ))}
              </div>
            )}
            {restReview.preview.validation.actor.issues.filter((issue) => issue.severity === "warning").map((issue) => (
              <p className="advancement-choice-status" key={`${issue.path}:${issue.code}`}>{issue.message}</p>
            ))}
            {restReview.preview.blockers.map((blocker) => (
              <p className="advancement-choice-status" key={`${blocker.path}:${blocker.code}`}>{blocker.message}</p>
            ))}
            <label className="inline-check">
              <input aria-label="Confirm exact rest review" type="checkbox" checked={restConfirmed} disabled={restReview.preview.status !== "ready"} onChange={(event) => setRestConfirmed(event.target.checked)} />
              <span>Reviewed the exact proposed rest changes</span>
            </label>
            <div className="rest-choice-grid" role="group" aria-label={`Apply ${restReview.restType} rest`}>
              <button className="ghost-button" type="button" disabled={busy} onClick={() => {
                setRestReview(undefined);
                setRestConfirmed(false);
                setRestError("");
                if (restReview.restType === "short") {
                  shortRestPreviewKeyRef.current = undefined;
                  shortRestRetryKeyRef.current = undefined;
                } else {
                  longRestPreviewKeyRef.current = undefined;
                  longRestRetryKeyRef.current = undefined;
                }
              }}>Edit choice</button>
              <button className="ghost-button" type="button" disabled={!props.canRest || busy || !restConfirmed || restReview.preview.status !== "ready" || !restReview.preview.preparation} onClick={() => void commitPreparedRest()}>
                {restReview.restType === "short" ? <Sunrise size={14} /> : <Moon size={14} />} {resting ? "Applying..." : `Apply ${restReview.restType} rest`}
              </button>
            </div>
          </div>
        )}
        {restError && <div className="lore-load-state error" role="alert">{restError}</div>}
        {!restReview && (
          <div className="rest-choice-grid" role="group" aria-label={`Rest ${props.actor.name}`}>
            <button className="ghost-button" type="button" disabled={!props.canRest || busy} onClick={() => beginRest("short")}><Sunrise size={14} /> {previewing === "short" ? "Preparing..." : resting === "short" ? "Resting..." : props.actor.systemId === "dnd-5e-srd" && props.onPreviewRest ? selectedDice.length === 0 ? "Review short rest" : "Review selected hit die" : selectedDice.length === 0 ? "Finish short rest" : "Roll selected hit die"}</button>
            <button className="ghost-button" type="button" disabled={!props.canRest || busy} onClick={() => beginRest("long")}><Moon size={14} /> {previewing === "long" ? "Preparing..." : resting === "long" ? "Resting..." : props.actor.systemId === "dnd-5e-srd" && props.onPreviewRest ? "Review long rest" : "Long rest"}</button>
          </div>
        )}
      </div>
    </details>
  );
}

export function restPreviewPath(path: string): string {
  const label = path.split("/").filter(Boolean).map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~")).map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ")).map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(" · ");
  return label || "Actor data";
}

export function restPreviewValue(value: unknown): string {
  if (value === undefined) return "not set";
  if (value === null) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "structured value";
  }
}
