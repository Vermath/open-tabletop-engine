import type { Actor, Encounter, Scene } from "@open-tabletop/core";
import { Minus, Plus, Save, Search, Swords, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, type EncounterPlanInfo } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, formatNumber, titleCaseLabel } from "./sheet-format.js";

export interface EncounterThreatInfo {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  role: string;
  budget: number;
  challengeRating?: string | number;
}

export interface EncounterBuilderThreatSelection {
  id: string;
  name: string;
  count: number;
}

export function EncounterBuilderDialog(props: {
  campaignId: string;
  systemId: string;
  systemName?: string;
  partyActors: Actor[];
  activeScene?: Scene;
  canSave: boolean;
  canSpawn: boolean;
  onClose(): void;
  onPlan(plan?: EncounterPlanInfo): void;
  onEncounterSaved(encounter: Encounter): void;
  onSpawnThreats(threats: EncounterBuilderThreatSelection[]): Promise<void>;
  onStatus(message: string): void;
}) {
  const [threats, setThreats] = useState<EncounterThreatInfo[]>([]);
  const [loadingThreats, setLoadingThreats] = useState(true);
  const [filter, setFilter] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [partyActorIds, setPartyActorIds] = useState<Set<string>>(() => new Set(props.partyActors.map((actor) => actor.id)));
  const [plan, setPlan] = useState<EncounterPlanInfo | undefined>();
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [name, setName] = useState("New Encounter");
  const [error, setError] = useState("");
  const [savedEncounter, setSavedEncounter] = useState<Encounter | undefined>();
  const dialogRef = useModalAccessibility<HTMLDivElement>(props.onClose);

  const filterTerm = filter.trim().toLowerCase();
  const partyActorKey = props.partyActors.map((actor) => actor.id).join("|");
  const visibleThreats = useMemo(() => {
    if (!filterTerm) return threats;
    return threats.filter((threat) => [threat.name, threat.summary, threat.role, String(threat.challengeRating ?? "")].some((value) => value.toLowerCase().includes(filterTerm)));
  }, [filterTerm, threats]);
  const composition = useMemo(() => threats
    .map((threat) => ({ threat, count: counts[threat.id] ?? 0 }))
    .filter((item) => item.count > 0), [counts, threats]);
  const compositionKey = useMemo(() => composition.map(({ threat, count }) => `${threat.id}:${count}`).join("|"), [composition]);
  const selectedPartyIds = useMemo(() => [...partyActorIds].filter((id) => props.partyActors.some((actor) => actor.id === id)).sort(), [partyActorIds, partyActorKey]);
  const partyKey = selectedPartyIds.join("|");
  const canPlan = composition.length > 0;
  const canSave = props.canSave && canPlan && !saving;
  const canPlace = props.canSpawn && Boolean(savedEncounter) && composition.length > 0 && !spawning;

  useEffect(() => {
    let cancelled = false;
    setLoadingThreats(true);
    setError("");
    apiGet<EncounterThreatInfo[]>(`/api/v1/campaigns/${props.campaignId}/systems/${props.systemId}/encounter-threats`)
      .then((catalog) => {
        if (cancelled) return;
        setThreats(catalog);
        setLoadingThreats(false);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(errorMessage(loadError));
        setLoadingThreats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.campaignId, props.systemId]);

  useEffect(() => {
    setSavedEncounter(undefined);
  }, [compositionKey]);

  useEffect(() => {
    if (!canPlan) {
      setPlan(undefined);
      props.onPlan(undefined);
      setPlanning(false);
      return;
    }
    const controller = new AbortController();
    setPlanning(true);
    setError("");
    const timer = window.setTimeout(() => {
      apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${props.campaignId}/systems/${props.systemId}/encounter-plan`, {
        partyActorIds: selectedPartyIds,
        threats: composition.map(({ threat, count }) => ({ id: threat.id, count }))
      }, { signal: controller.signal })
        .then((result) => {
          setPlan(result.plan);
          props.onPlan(result.plan);
          setPlanning(false);
        })
        .catch((planError) => {
          if (controller.signal.aborted) return;
          setError(errorMessage(planError));
          setPlan(undefined);
          props.onPlan(undefined);
          setPlanning(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canPlan, composition, compositionKey, partyKey, props.campaignId, props.systemId, props.onPlan, selectedPartyIds]);

  function setThreatCount(threatId: string, nextCount: number) {
    setCounts((current) => {
      const count = Math.max(0, Math.min(99, Math.floor(nextCount)));
      const next = { ...current };
      if (count === 0) delete next[threatId];
      else next[threatId] = count;
      return next;
    });
  }

  function togglePartyActor(actorId: string, checked: boolean) {
    setPartyActorIds((current) => {
      const next = new Set(current);
      if (checked) next.add(actorId);
      else next.delete(actorId);
      return next;
    });
  }

  async function saveEncounter() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${props.campaignId}/systems/${props.systemId}/encounter-plan`, {
        partyActorIds: selectedPartyIds,
        threats: composition.map(({ threat, count }) => ({ id: threat.id, count })),
        createEncounter: true,
        name: name.trim() || "New Encounter"
      });
      setPlan(result.plan);
      props.onPlan(result.plan);
      if (result.encounter) {
        setSavedEncounter(result.encounter);
        props.onEncounterSaved(result.encounter);
        props.onStatus(`${result.encounter.name} saved`);
      } else {
        props.onStatus(`${titleCaseLabel(result.plan.difficulty)} encounter planned`);
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function placeMonsters() {
    if (!canPlace) return;
    setSpawning(true);
    setError("");
    try {
      await props.onSpawnThreats(composition.map(({ threat, count }) => ({ id: threat.id, name: threat.name, count })));
    } catch (spawnError) {
      setError(errorMessage(spawnError));
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div ref={dialogRef} className="modal-dialog encounter-builder" role="dialog" aria-modal="true" aria-label="Encounter builder" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <h2>Encounter Builder</h2>
            <p>{props.systemName ?? props.systemId} threat catalog</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close encounter builder" onClick={props.onClose}><X size={16} /></button>
        </header>

        <div className="encounter-builder-layout">
          <section className="encounter-catalog" aria-label="Threat catalog">
            <label className="encounter-search">
              <span><Search size={14} /> Search threats</span>
              <input aria-label="Search encounter threats" value={filter} onChange={(event) => setFilter(event.target.value)} />
            </label>
            <div className="encounter-threat-list">
              {loadingThreats ? <div className="empty-state compact">Loading threats...</div> : null}
              {!loadingThreats && visibleThreats.length === 0 ? <div className="empty-state compact">No threats match this search.</div> : null}
              {visibleThreats.map((threat) => {
                const count = counts[threat.id] ?? 0;
                return (
                  <article className={count > 0 ? "encounter-threat selected" : "encounter-threat"} key={threat.id}>
                    <div>
                      <strong>{threat.name}</strong>
                      <p>{threat.summary}</p>
                      <div className="admin-meta">
                        <span>{titleCaseLabel(threat.role)}</span>
                        {threat.challengeRating !== undefined && <span>CR {String(threat.challengeRating)}</span>}
                        <span>{formatNumber(threat.budget)} XP</span>
                      </div>
                    </div>
                    <ThreatStepper count={count} onDecrease={() => setThreatCount(threat.id, count - 1)} onIncrease={() => setThreatCount(threat.id, count + 1)} />
                  </article>
                );
              })}
            </div>
          </section>

          <section className="encounter-compose" aria-label="Encounter composition">
            <label>
              <span>Encounter name</span>
              <input aria-label="Encounter name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="encounter-party" aria-label="Party members">
              <div className="section-title">Party</div>
              {props.partyActors.length === 0 ? <p>No party actors found.</p> : props.partyActors.map((actor) => (
                <label className="inline-check" key={actor.id}>
                  <input type="checkbox" checked={partyActorIds.has(actor.id)} onChange={(event) => togglePartyActor(actor.id, event.target.checked)} />
                  <span>{actor.name}</span>
                </label>
              ))}
            </div>
            <div className="encounter-composition-list">
              <div className="section-title">Composition</div>
              {composition.length === 0 ? <div className="empty-state compact">Add threats from the catalog.</div> : composition.map(({ threat, count }) => {
                const plannedThreat = plan?.threats.find((item) => item.id === threat.id);
                const total = plannedThreat?.budgetTotal ?? threat.budget * count;
                return (
                  <div className="encounter-composition-row" key={threat.id}>
                    <span>{threat.name}</span>
                    <strong>x{formatNumber(count)}</strong>
                    <small>{formatNumber(total)} XP</small>
                    <ThreatStepper count={count} onDecrease={() => setThreatCount(threat.id, count - 1)} onIncrease={() => setThreatCount(threat.id, count + 1)} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="encounter-live-plan" aria-label="Live encounter plan">
            <div className="operator-heading">
              <div>
                <div className="section-title">Live Plan</div>
                <p>{planning ? "Calculating difficulty..." : plan ? plan.summary : "Add threats to calculate difficulty."}</p>
              </div>
              <Swords size={16} />
            </div>
            {plan ? (
              <>
                <span className={`encounter-difficulty ${plan.difficulty}`}>{titleCaseLabel(plan.difficulty)}</span>
                <div className="metric-grid">
                  <div className="metric-tile"><span>Party</span><strong>{formatNumber(plan.partyRating)}</strong></div>
                  <div className="metric-tile"><span>Threat</span><strong>{formatNumber(plan.threatBudget)}</strong></div>
                </div>
                <div className="encounter-plan-threats">
                  {plan.threats.map((threat) => (
                    <span key={threat.id}>{threat.name} x{formatNumber(threat.count)} ({formatNumber(threat.budgetTotal)} XP)</span>
                  ))}
                </div>
              </>
            ) : null}
            {error && <p className="creator-error" role="alert">{error}</p>}
          </section>
        </div>

        <footer className="creator-footer encounter-builder-footer">
          <button className="ghost-button" type="button" onClick={props.onClose}>Cancel</button>
          <div className="button-row">
            {savedEncounter && (
              <button className="ghost-button" type="button" disabled={!canPlace} onClick={() => void placeMonsters()} title={props.activeScene ? `Place on ${props.activeScene.name}` : "Select a scene first"}>
                <Swords size={14} /> {spawning ? "Placing..." : "Place monsters on scene"}
              </button>
            )}
            <button className="primary-button" type="button" disabled={!canSave} onClick={() => void saveEncounter()}>
              <Save size={14} /> {saving ? "Saving..." : "Save encounter"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ThreatStepper(props: { count: number; onDecrease(): void; onIncrease(): void }) {
  return (
    <div className="encounter-threat-stepper" aria-label="Threat count controls">
      {props.count > 0 ? (
        <button className="icon-button" type="button" aria-label="Decrease threat count" onClick={props.onDecrease}><Minus size={14} /></button>
      ) : null}
      {props.count > 0 ? <span>{formatNumber(props.count)}</span> : null}
      <button className="ghost-button small" type="button" onClick={props.onIncrease}>
        {props.count > 0 ? <Plus size={14} /> : "Add"}
      </button>
    </div>
  );
}
