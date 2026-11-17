import type { Actor, Combat, DndRulesMutationUndoDescriptor } from "@open-tabletop/core";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiPost } from "./api.js";
import { errorMessage, formatNumber } from "./sheet-format.js";

interface TypedDamagePreviewChange {
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after?: unknown;
}

interface TypedDamageTargetPreview {
  actorId: string;
  actorName: string;
  preview: {
    status: "ready" | "blocked";
    blockers: Array<{ code: string; message: string }>;
    changes: TypedDamagePreviewChange[];
    details?: Record<string, unknown>;
  };
}

interface TypedDamagePreviewEnvelope {
  status: "ready" | "blocked";
  blockers: Array<{ code: string; message: string }>;
  batch: { targets: TypedDamageTargetPreview[] };
  preparation?: {
    preparedPreviewKey: string;
    actorUpdatedAt: Record<string, string>;
    itemUpdatedAt: Record<string, string>;
    combatId?: string;
    combatUpdatedAt?: string;
    damageRoll?: { formula: string; total: number };
  };
}

export interface TypedDamageApplyResult {
  applied: true;
  actor: Actor;
  actors: Actor[];
  combat?: Combat;
  previews: TypedDamageTargetPreview[];
  rulesMutationId: string;
  undo: DndRulesMutationUndoDescriptor;
}

interface MixedDamageDraftComponent {
  id: string;
  amount: string;
  damageType: string;
}

interface ResolvedMixedDamageComponent {
  amount: number;
  damageType: string;
  adjustedAmount: number;
  defense: "normal" | "resistance" | "immunity" | "vulnerability" | "resistance-and-vulnerability";
}

export function normalizedMixedDamageComponents(components: MixedDamageDraftComponent[]): Array<{ amount: number; damageType: string }> | undefined {
  if (components.length === 0 || components.length > 8) return undefined;
  if (components.some((component) => !component.amount.trim())) return undefined;
  const normalized = components.map((component) => ({ amount: Number(component.amount), damageType: component.damageType.trim().toLowerCase() }));
  if (normalized.some((component) => !Number.isInteger(component.amount) || component.amount < 0 || !component.damageType)) return undefined;
  return normalized;
}

export function resolvedMixedDamageComponents(details: unknown): ResolvedMixedDamageComponent[] {
  if (!isRecord(details) || !Array.isArray(details.components)) return [];
  return details.components.flatMap((value) => {
    if (!isRecord(value) || !Number.isInteger(value.amount) || !Number.isInteger(value.adjustedAmount) || typeof value.damageType !== "string") return [];
    if (!(["normal", "resistance", "immunity", "vulnerability", "resistance-and-vulnerability"] as const).includes(value.defense as ResolvedMixedDamageComponent["defense"])) return [];
    return [{ amount: value.amount as number, damageType: value.damageType, adjustedAmount: value.adjustedAmount as number, defense: value.defense as ResolvedMixedDamageComponent["defense"] }];
  });
}

export function typedDamagePreviewValue(value: unknown): string {
  if (value === undefined) return "not set";
  if (value === null) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "structured value";
  }
}

export function TypedDamageCard(props: {
  campaignId: string;
  actor: Actor;
  actors: Actor[];
  canApply: boolean;
  onApplied(result: TypedDamageApplyResult): void;
}) {
  const [inputMode, setInputMode] = useState<"amount" | "formula" | "components">("amount");
  const [amount, setAmount] = useState("1");
  const [formula, setFormula] = useState("1d6");
  const [damageType, setDamageType] = useState("fire");
  const [criticalHit, setCriticalHit] = useState(false);
  const [components, setComponents] = useState<MixedDamageDraftComponent[]>([
    { id: "component-1", amount: "1", damageType: "slashing" },
    { id: "component-2", amount: "1", damageType: "fire" }
  ]);
  const [targetActorIds, setTargetActorIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<TypedDamagePreviewEnvelope>();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "apply" | "">("");
  const [error, setError] = useState("");
  const previewKeyRef = useRef("");
  const commitKeyRef = useRef("");
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | undefined>(undefined);
  const otherActors = props.actors.filter((actor) => actor.id !== props.actor.id && actor.systemId === "dnd-5e-srd");
  const validMixedComponents = normalizedMixedDamageComponents(components);

  useEffect(() => {
    requestGenerationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = undefined;
    setTargetActorIds([]);
    setPreview(undefined);
    setConfirmed(false);
    setError("");
    previewKeyRef.current = "";
    commitKeyRef.current = "";
    return () => {
      requestGenerationRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = undefined;
    };
  }, [props.actor.id, props.campaignId]);

  const resetReview = () => {
    setPreview(undefined);
    setConfirmed(false);
    setError("");
    previewKeyRef.current = "";
    commitKeyRef.current = "";
  };

  const previewDamage = async () => {
    if (pending || !props.canApply || (inputMode !== "components" && !damageType.trim())) return;
    const numericAmount = Number(amount);
    const mixedComponents = normalizedMixedDamageComponents(components);
    if (inputMode === "amount" && (!Number.isFinite(numericAmount) || numericAmount < 0)) {
      setError("Damage must be zero or greater.");
      return;
    }
    if (inputMode === "formula" && !formula.trim()) {
      setError("Enter a damage formula.");
      return;
    }
    if (inputMode === "components" && !mixedComponents) {
      setError("Every mixed-damage component needs a non-negative whole amount and a damage type.");
      return;
    }
    setPending("preview");
    setError("");
    setConfirmed(false);
    const previewKey = previewKeyRef.current || `typed-damage-preview:${globalThis.crypto.randomUUID()}`;
    previewKeyRef.current = previewKey;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    try {
      const result = await apiPost<TypedDamagePreviewEnvelope>(`/api/v1/campaigns/${props.campaignId}/systems/dnd-5e-srd/actors/${props.actor.id}/rules-preview`, {
        operation: "typed-damage",
        prepare: true,
        ...(criticalHit ? { criticalHit: true } : {}),
        targetActorIds,
        ...(inputMode === "components"
          ? { components: mixedComponents }
          : { damageType: damageType.trim(), ...(inputMode === "amount" ? { amount: numericAmount } : { formula: formula.trim() }) })
      }, { idempotencyKey: previewKey, signal: controller.signal });
      if (generation !== requestGenerationRef.current) return;
      setPreview(result);
      if (result.status !== "ready") setError(result.blockers[0]?.message ?? "Typed damage is not ready to apply.");
    } catch (caught) {
      if (generation !== requestGenerationRef.current || controller.signal.aborted) return;
      setError(errorMessage(caught));
    } finally {
      if (generation === requestGenerationRef.current) {
        if (requestControllerRef.current === controller) requestControllerRef.current = undefined;
        setPending("");
      }
    }
  };

  const applyDamage = async () => {
    if (pending || !confirmed || preview?.status !== "ready" || !preview.preparation) return;
    setPending("apply");
    setError("");
    const commitKey = commitKeyRef.current || `typed-damage-commit:${globalThis.crypto.randomUUID()}`;
    commitKeyRef.current = commitKey;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    try {
      const result = await apiPost<TypedDamageApplyResult>(`/api/v1/campaigns/${props.campaignId}/systems/dnd-5e-srd/actors/${props.actor.id}/typed-damage/apply`, {
        preparedPreviewKey: preview.preparation.preparedPreviewKey,
        expectedActorUpdatedAt: preview.preparation.actorUpdatedAt,
        expectedItemUpdatedAt: preview.preparation.itemUpdatedAt,
        ...(preview.preparation.combatUpdatedAt ? { expectedCombatUpdatedAt: preview.preparation.combatUpdatedAt } : {})
      }, { idempotencyKey: commitKey, signal: controller.signal });
      if (generation !== requestGenerationRef.current) return;
      props.onApplied(result);
      resetReview();
    } catch (caught) {
      if (generation !== requestGenerationRef.current || controller.signal.aborted) return;
      setError(errorMessage(caught));
    } finally {
      if (generation === requestGenerationRef.current) {
        if (requestControllerRef.current === controller) requestControllerRef.current = undefined;
        setPending("");
      }
    }
  };

  return (
    <details className="actor-rest-card" aria-label="Typed damage">
      <summary><span><ShieldAlert size={14} aria-hidden="true" /> Typed damage</span><strong>{props.actor.name}</strong></summary>
      <div className="actor-rest-card-body">
        {!preview && (
          <>
            <div className="rest-choice-grid">
              <label><span>Input</span><select aria-label="Typed damage input" value={inputMode} onChange={(event) => { setInputMode(event.target.value as "amount" | "formula" | "components"); resetReview(); }}><option value="amount">Fixed amount</option><option value="formula">Server roll formula</option><option value="components">Mixed damage components</option></select></label>
              {inputMode === "amount" ? <label><span>Amount</span><input aria-label="Typed damage amount" type="number" min={0} value={amount} onChange={(event) => { setAmount(event.target.value); resetReview(); }} /></label> : inputMode === "formula" ? <label><span>Formula</span><input aria-label="Typed damage formula" value={formula} onChange={(event) => { setFormula(event.target.value); resetReview(); }} /></label> : null}
              {inputMode !== "components" && <label><span>Damage type</span><input aria-label="Typed damage type" value={damageType} onChange={(event) => { setDamageType(event.target.value); resetReview(); }} /></label>}
            </div>
            {inputMode === "components" && (
              <div className="mixed-damage-components" aria-label="Mixed damage components">
                <p className="account-summary">Each component is resolved separately against every target's immunity, resistance, and vulnerability.</p>
                {components.map((component, index) => (
                  <div className={!component.amount.trim() || !Number.isInteger(Number(component.amount)) || Number(component.amount) < 0 || !component.damageType.trim() ? "mixed-damage-row invalid" : "mixed-damage-row"} key={component.id}>
                    <label><span>Component {formatNumber(index + 1)} amount</span><input aria-label={`Mixed damage component ${index + 1} amount`} aria-invalid={!component.amount.trim() || !Number.isInteger(Number(component.amount)) || Number(component.amount) < 0} type="number" min={0} step={1} value={component.amount} onChange={(event) => { setComponents((current) => current.map((candidate) => candidate.id === component.id ? { ...candidate, amount: event.target.value } : candidate)); resetReview(); }} /></label>
                    <label><span>Damage type</span><input aria-label={`Mixed damage component ${index + 1} type`} aria-invalid={!component.damageType.trim()} value={component.damageType} onChange={(event) => { setComponents((current) => current.map((candidate) => candidate.id === component.id ? { ...candidate, damageType: event.target.value } : candidate)); resetReview(); }} /></label>
                    <button className="icon-button" type="button" aria-label={`Remove mixed damage component ${index + 1}`} disabled={components.length <= 1} onClick={() => { setComponents((current) => current.filter((candidate) => candidate.id !== component.id)); resetReview(); }}><Trash2 size={14} /></button>
                  </div>
                ))}
                {!validMixedComponents && <p className="advancement-choice-status" role="alert">Every row needs a non-negative whole amount and a damage type before review.</p>}
                <button className="ghost-button small" type="button" disabled={components.length >= 8} onClick={() => { setComponents((current) => [...current, { id: `component-${globalThis.crypto.randomUUID()}`, amount: "1", damageType: "" }]); resetReview(); }}><Plus size={14} /> Add damage component</button>
              </div>
            )}
            <label className="inline-check"><input aria-label="Critical hit" type="checkbox" checked={criticalHit} onChange={(event) => { setCriticalHit(event.target.checked); resetReview(); }} /><span>Critical hit (two failed Death Saves when the target is already at 0 HP)</span></label>
            {otherActors.length > 0 && <label><span>Additional targets</span><select multiple aria-label="Additional typed damage targets" value={targetActorIds} onChange={(event) => { setTargetActorIds(Array.from(event.target.selectedOptions, (option) => option.value)); resetReview(); }}>{otherActors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>}
            <p className="account-summary">The selected actor is always included. Every target is checked before any hit points change.</p>
            <button className="ghost-button" type="button" disabled={!props.canApply || Boolean(pending) || (inputMode === "components" && !validMixedComponents)} onClick={() => void previewDamage()}>{pending === "preview" ? "Preparing damage..." : "Review typed damage"}</button>
          </>
        )}
        {preview && (
          <div className="advancement-review" aria-label="Exact typed damage review">
            {criticalHit && <div className="operator-row tool-call-row"><span>Critical hit</span><strong>Yes</strong></div>}
            {inputMode === "components" && <div className="operator-row tool-call-row"><span>Mixed damage</span><strong>{normalizedMixedDamageComponents(components)?.map((component) => `${component.amount} ${component.damageType}`).join(" + ")}</strong></div>}
            {preview.preparation?.damageRoll && <div className="operator-row tool-call-row"><span>Server damage roll</span><strong>{preview.preparation.damageRoll.formula} = {formatNumber(preview.preparation.damageRoll.total)}</strong></div>}
            {preview.batch.targets.map((target) => (
              <article className="operator-item admin-item" key={target.actorId}>
                <strong>{target.actorName}</strong>
                <MixedDamageTargetBreakdown details={target.preview.details} />
                {target.preview.changes.map((change) => <div className="operator-row tool-call-row" key={`${target.actorId}:${change.path}`}><span>{change.path}</span><strong>{typedDamagePreviewValue(change.before)} to {typedDamagePreviewValue(change.after)}</strong></div>)}
                {target.preview.blockers.map((blocker) => <p className="advancement-choice-status" key={blocker.code}>{blocker.message}</p>)}
              </article>
            ))}
            <label className="inline-check"><input aria-label="Confirm exact typed damage review" type="checkbox" checked={confirmed} disabled={preview.status !== "ready"} onChange={(event) => setConfirmed(event.target.checked)} /><span>Reviewed every target and exact hit point change</span></label>
            <div className="rest-choice-grid" role="group" aria-label="Apply typed damage">
              <button className="ghost-button" type="button" disabled={Boolean(pending)} onClick={resetReview}>Edit damage</button>
              <button className="ghost-button" type="button" disabled={!confirmed || preview.status !== "ready" || !preview.preparation || Boolean(pending)} onClick={() => void applyDamage()}>{pending === "apply" ? "Applying damage..." : "Apply typed damage"}</button>
            </div>
          </div>
        )}
        {error && <div className="lore-load-state error" role="alert">{error}</div>}
      </div>
    </details>
  );
}

function MixedDamageTargetBreakdown({ details }: { details?: Record<string, unknown> }) {
  const components = resolvedMixedDamageComponents(details);
  if (components.length === 0) return null;
  const total = isRecord(details) && typeof details.totalDamage === "number" ? details.totalDamage : components.reduce((sum, component) => sum + component.adjustedAmount, 0);
  return (
    <div className="mixed-damage-resolution" aria-label="Resolved damage components">
      {components.map((component, index) => (
        <div className="operator-row tool-call-row" key={`${component.damageType}:${index}`}>
          <span>{formatNumber(component.amount)} {component.damageType} · {component.defense.replace(/-/g, " ")}</span>
          <strong>{formatNumber(component.adjustedAmount)}</strong>
        </div>
      ))}
      <div className="operator-row tool-call-row"><span>Combined after defenses</span><strong>{formatNumber(total)}</strong></div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
