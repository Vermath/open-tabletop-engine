import type {
  Actor,
  ActorCalculationExplanation,
  CalculationOverride,
  CalculationFieldExplanation,
  CalculationFlags,
  CalculationTerm,
} from "@open-tabletop/core";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import { errorMessage, formatDateTime } from "./sheet-format.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";
import { RulesSupportBoundaryNotice, rulesBoundaryFromCalculation } from "./rules-support-boundary.js";

interface CalculationExplanationPanelProps {
  campaignId: string;
  actor: Actor;
  canManageOverrides?: boolean;
}

const calculationGroups: Array<CalculationFieldExplanation["group"]> = [
  "abilities",
  "defenses",
  "vitality",
  "checks",
  "skills",
  "magic",
  "actions",
];

const calculationGroupLabels: Record<CalculationFieldExplanation["group"], string> = {
  abilities: "Abilities",
  defenses: "Defenses and movement",
  vitality: "Hit points",
  checks: "Checks and saves",
  skills: "Skills and senses",
  magic: "Spellcasting",
  actions: "Actions",
};

export function calculationExplanationPath(campaignId: string, systemId: string, actorId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${encodeURIComponent(systemId)}/actors/${encodeURIComponent(actorId)}/calculation-explanation`;
}

export function calculationOverridesPath(campaignId: string, actorId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/actors/${encodeURIComponent(actorId)}/calculation-overrides`;
}

export function createCalculationOverride(
  campaignId: string,
  actorId: string,
  input: { fieldId: string; source: "gm_manual" | "house_rule"; effectiveValue: number | string; reason: string; expectedActorUpdatedAt: string },
): Promise<CalculationOverride> {
  return apiPost<CalculationOverride>(calculationOverridesPath(campaignId, actorId), input, {
    idempotencyKey: sharedMutationIdempotencyKey(`calculation-override:create:${actorId}:${input.fieldId}`, input.expectedActorUpdatedAt, input),
  });
}

export function clearCalculationOverride(
  overrideId: string,
  input: { reason: string; expectedUpdatedAt: string; expectedActorUpdatedAt: string },
): Promise<CalculationOverride> {
  return apiPost<CalculationOverride>(`/api/v1/calculation-overrides/${encodeURIComponent(overrideId)}/clear`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`calculation-override:clear:${overrideId}`, input.expectedUpdatedAt, input),
  });
}

export function calculationFlagLabels(flags: CalculationFlags): string[] {
  return [
    ...(flags.manual ? ["Manual"] : []),
    ...(flags.override ? ["Override"] : []),
    ...(flags.unsupported ? ["Unsupported"] : []),
    ...(flags.ambiguous ? ["Ambiguous"] : []),
  ];
}

export function calculationTermText(term: CalculationTerm): string {
  if (term.signedValue !== undefined) return `${term.signedValue >= 0 ? "+" : ""}${term.signedValue}`;
  return term.formula ?? "Review source";
}

export function calculationOverrideLedger(fields: CalculationFieldExplanation[]): CalculationFieldExplanation[] {
  return fields.filter((field) => field.flags.manual || field.flags.override);
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The calculation sources could not be loaded.";
}

export function CalculationExplanationPanel({ campaignId, actor, canManageOverrides = false }: CalculationExplanationPanelProps) {
  const [explanation, setExplanation] = useState<ActorCalculationExplanation>();
  const [overrides, setOverrides] = useState<CalculationOverride[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [actorRevision, setActorRevision] = useState(actor.updatedAt);
  const [overrideFieldId, setOverrideFieldId] = useState("");
  const [overrideSource, setOverrideSource] = useState<"gm_manual" | "house_rule">("gm_manual");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [clearReasons, setClearReasons] = useState<Record<string, string>>({});
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationStatus, setMutationStatus] = useState("");

  useEffect(() => setActorRevision(actor.updatedAt), [actor.id, actor.updatedAt]);

  useEffect(() => {
    if (actor.systemId !== "dnd-5e-srd") {
      setExplanation(undefined);
      setLoadState("ready");
      return;
    }
    const controller = new AbortController();
    setExplanation(undefined);
    setLoadError("");
    setLoadState("loading");
    void Promise.all([
      apiGet<ActorCalculationExplanation>(calculationExplanationPath(campaignId, actor.systemId, actor.id), { signal: controller.signal }),
      apiGet<CalculationOverride[]>(calculationOverridesPath(campaignId, actor.id), { signal: controller.signal }),
    ])
      .then(([response, history]) => {
        if (controller.signal.aborted) return;
        setExplanation(response);
        setOverrides(history);
        const activeFieldIds = new Set(history.filter((entry) => !entry.clearedAt).map((entry) => entry.fieldId));
        setOverrideFieldId((current) => current && response.fields.some((field) => field.id === current && !activeFieldIds.has(field.id))
          ? current
          : response.fields.find((field) => !activeFieldIds.has(field.id))?.id ?? "");
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorText(error));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [actor.id, actor.systemId, actor.updatedAt, campaignId, reloadVersion]);

  const groupedFields = useMemo(() => calculationGroups.map((group) => ({
    group,
    fields: explanation?.fields.filter((field) => field.group === group) ?? [],
  })).filter((entry) => entry.fields.length > 0), [explanation]);
  const overrideLedger = useMemo(() => calculationOverrideLedger(explanation?.fields ?? []), [explanation]);
  const activeOverrideFieldIds = useMemo(() => new Set(overrides.filter((entry) => !entry.clearedAt).map((entry) => entry.fieldId)), [overrides]);
  const availableOverrideFields = explanation?.fields.filter((field) => !activeOverrideFieldIds.has(field.id)) ?? [];
  const fieldById = useMemo(() => new Map((explanation?.fields ?? []).map((field) => [field.id, field])), [explanation]);

  async function refreshLedgerAfterStale() {
    setReloadVersion((version) => version + 1);
    setMutationStatus(staleDraftPreservedMessage);
  }

  async function submitOverride() {
    if (!overrideFieldId || !overrideValue.trim() || !overrideReason.trim() || mutationBusy) return;
    setMutationBusy(true);
    setMutationStatus("");
    try {
      const numericValue = Number(overrideValue);
      const effectiveValue = Number.isFinite(numericValue) && overrideValue.trim() !== "" ? numericValue : overrideValue.trim();
      const created = await createCalculationOverride(campaignId, actor.id, {
        fieldId: overrideFieldId,
        source: overrideSource,
        effectiveValue,
        reason: overrideReason.trim(),
        expectedActorUpdatedAt: actorRevision,
      });
      setOverrides((current) => [created, ...current]);
      setActorRevision(created.updatedAt);
      setOverrideValue("");
      setOverrideReason("");
      setMutationStatus(`Override recorded for ${fieldById.get(created.fieldId)?.label ?? created.fieldId}.`);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      if (isStaleWriteError(error)) await refreshLedgerAfterStale();
      else setMutationStatus(`Override failed: ${errorMessage(error)}`);
    } finally {
      setMutationBusy(false);
    }
  }

  async function clearOverride(entry: CalculationOverride) {
    const reason = clearReasons[entry.id]?.trim();
    if (!reason || mutationBusy) return;
    setMutationBusy(true);
    setMutationStatus("");
    try {
      const cleared = await clearCalculationOverride(entry.id, {
        reason,
        expectedUpdatedAt: entry.updatedAt,
        expectedActorUpdatedAt: actorRevision,
      });
      setOverrides((current) => current.map((candidate) => candidate.id === cleared.id ? cleared : candidate));
      setActorRevision(cleared.updatedAt);
      setClearReasons((current) => ({ ...current, [entry.id]: "" }));
      setMutationStatus(`Override cleared for ${fieldById.get(cleared.fieldId)?.label ?? cleared.fieldId}.`);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      if (isStaleWriteError(error)) await refreshLedgerAfterStale();
      else setMutationStatus(`Clear failed: ${errorMessage(error)}`);
    } finally {
      setMutationBusy(false);
    }
  }

  if (actor.systemId !== "dnd-5e-srd") return null;

  return (
    <section className="calculation-explanation" aria-labelledby={`calculation-explanation-title-${actor.id}`}>
      <div className="calculation-explanation-heading">
        <div>
          <span className="section-title">Rules trace</span>
          <h3 id={`calculation-explanation-title-${actor.id}`}>How the numbers work</h3>
        </div>
        {loadState === "ready" && explanation && (
          <button className="ghost-button small" type="button" onClick={() => setReloadVersion((version) => version + 1)}>
            Refresh
          </button>
        )}
      </div>
      <p className="calculation-explanation-intro">
        Server-computed results, ordered terms, and source provenance. Flags call out values that still need a human ruling.
      </p>

      {mutationStatus && <p className={/failed/i.test(mutationStatus) ? "panel-status error" : "panel-status"} role="status">{mutationStatus}</p>}
      {loadState === "loading" && <p className="panel-status" role="status">Loading calculation sources...</p>}
      {loadState === "error" && (
        <div className="inline-error" role="alert">
          <strong>Calculation explanation unavailable.</strong>
          <span>{loadError}</span>
          <button className="ghost-button small" type="button" onClick={() => setReloadVersion((version) => version + 1)}>
            Retry explanation
          </button>
        </div>
      )}
      {loadState === "ready" && explanation && (
        <>
          <p className="calculation-source-note">
            {explanation.source.name} {explanation.source.version} · rules {explanation.rulesVersion}
          </p>
          <section className="calculation-override-ledger" aria-label="Manual and override ledger">
            <div className="operator-heading">
              <div>
                <span className="section-title">Override ledger</span>
                <h4>Manual and overridden values</h4>
              </div>
              <strong>{overrideLedger.length}</strong>
            </div>
            {overrideLedger.length === 0 ? <p>No manual or override fields are active.</p> : (
              <ol>
                {overrideLedger.map((field) => (
                  <li key={field.id}>
                    <div><strong>{field.label}</strong><span>{field.result}{field.unit ? ` ${field.unit}` : ""}</span></div>
                    <span>{calculationFlagLabels(field.flags).filter((label) => label === "Manual" || label === "Override").join(" + ")}</span>
                    <small>{field.flags.reasons.join(" ") || field.terms.map((term) => term.source.name).filter((name, index, names) => names.indexOf(name) === index).join(", ")}</small>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="calculation-override-history" aria-label="Durable calculation override history">
            <div className="operator-heading">
              <div><span className="section-title">Durable ledger</span><h4>Override history</h4></div>
              <strong>{overrides.length}</strong>
            </div>
            {overrides.length === 0 ? <p>No documented overrides have been recorded.</p> : (
              <ol>
                {overrides.map((entry) => (
                  <li key={entry.id} className={entry.clearedAt ? "cleared" : "active"}>
                    <div>
                      <strong>{fieldById.get(entry.fieldId)?.label ?? entry.fieldId}</strong>
                      <span>{String(entry.baseValue)} → {String(entry.effectiveValue)}</span>
                    </div>
                    <small>{entry.source === "house_rule" ? "House rule" : entry.source === "gm_manual" ? "GM manual" : entry.source} · {formatDateTime(entry.createdAt)} · {entry.clearedAt ? "cleared" : "active"}</small>
                    <p>{entry.reason}</p>
                    {entry.clearedAt && <p className="calculation-clear-reason">Cleared: {entry.clearReason || "No reason supplied"}</p>}
                    {!entry.clearedAt && canManageOverrides && (
                      <div className="calculation-override-clear">
                        <input aria-label={`Reason to clear ${fieldById.get(entry.fieldId)?.label ?? entry.fieldId} override`} value={clearReasons[entry.id] ?? ""} maxLength={500} placeholder="Why is this override no longer needed?" onChange={(event) => setClearReasons((current) => ({ ...current, [entry.id]: event.target.value }))} />
                        <button className="ghost-button small" type="button" disabled={mutationBusy || !(clearReasons[entry.id] ?? "").trim()} onClick={() => void clearOverride(entry)}>Clear override</button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
          {canManageOverrides && (
            <form className="calculation-override-create" aria-label="Create calculation override" onSubmit={(event) => { event.preventDefault(); void submitOverride(); }}>
              <div className="operator-heading"><div><span className="section-title">Document a ruling</span><h4>Create override</h4></div></div>
              {availableOverrideFields.length === 0 ? <p>Every current field with a supported explanation already has an active override.</p> : (
                <>
                  <label><span>Field</span><select value={overrideFieldId} onChange={(event) => setOverrideFieldId(event.target.value)}>{availableOverrideFields.map((field) => <option key={field.id} value={field.id}>{field.label} · current {String(field.result)}</option>)}</select></label>
                  <label><span>Source</span><select value={overrideSource} onChange={(event) => setOverrideSource(event.target.value as "gm_manual" | "house_rule")}><option value="gm_manual">GM manual ruling</option><option value="house_rule">House rule</option></select></label>
                  <label><span>Effective value</span><input value={overrideValue} maxLength={500} required onChange={(event) => setOverrideValue(event.target.value)} /></label>
                  <label><span>Reason</span><textarea value={overrideReason} rows={3} maxLength={500} required placeholder="Document the ruling and source for future sessions" onChange={(event) => setOverrideReason(event.target.value)} /></label>
                  <button className="primary-button" type="submit" disabled={mutationBusy || !overrideFieldId || !overrideValue.trim() || !overrideReason.trim()}>Record override</button>
                </>
              )}
            </form>
          )}
          <div className="calculation-groups">
            {groupedFields.map(({ group, fields }) => (
              <details className="calculation-group" key={group} open={group === "defenses" || group === "checks"}>
                <summary>
                  <span>{calculationGroupLabels[group]}</span>
                  <span>{fields.length}</span>
                </summary>
                <div className="calculation-fields">
                  {fields.map((field) => {
                    const flagLabels = calculationFlagLabels(field.flags);
                    return (
                      <article className="calculation-field" key={field.id}>
                        <div className="calculation-field-result">
                          <strong>{field.label}</strong>
                          <span>{field.result}{field.unit ? ` ${field.unit}` : ""}</span>
                        </div>
                        <RulesSupportBoundaryNotice boundary={rulesBoundaryFromCalculation(field)} />
                        {flagLabels.length > 0 && (
                          <div className="calculation-flags" aria-label={`Review flags for ${field.label}`}>
                            {flagLabels.map((label) => <span key={label}>{label}</span>)}
                          </div>
                        )}
                        <ol className="calculation-terms" aria-label={`Ordered terms for ${field.label}`}>
                          {field.terms.map((term) => (
                            <li key={`${field.id}:${term.label}:${term.source.kind}:${term.source.id}:${term.formula ?? term.signedValue ?? "review"}`}>
                              <span className="calculation-term-value">{calculationTermText(term)}</span>
                              <span>
                                <strong>{term.label}</strong>
                                {term.source.url ? (
                                  <a href={term.source.url} target="_blank" rel="noreferrer">{term.source.name}{term.source.version ? ` ${term.source.version}` : ""}</a>
                                ) : (
                                  <small>{term.source.name}{term.source.version ? ` ${term.source.version}` : ""}</small>
                                )}
                              </span>
                            </li>
                          ))}
                        </ol>
                        {field.flags.reasons.length > 0 && (
                          <ul className="calculation-reasons">
                            {field.flags.reasons.map((reason) => <li key={`${field.id}:${reason}`}>{reason}</li>)}
                          </ul>
                        )}
                      </article>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
