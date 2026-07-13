import type { Actor, Encounter, Scene } from "@open-tabletop/core";
import { FilePlus2, Minus, Plus, Save, Search, Swords, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, type EncounterPlanInfo } from "./api.js";
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

export interface EncounterCompositionInput {
  campaignId: string;
  systemId: string;
  encounterId?: string;
  name: string;
  summary: string;
  difficulty?: string;
  partyActorIds: string[];
  threats: Array<{ id: string; count: number }>;
}

export interface EncounterPartyEligibility {
  eligibleActors: Actor[];
  excludedActors: Actor[];
}

/**
 * Mirrors the encounter API's party contract so the builder never submits
 * actors that its active rules system cannot use for encounter math.
 */
export function encounterPartyEligibility(
  actors: Actor[],
  campaignId: string,
  systemId: string
): EncounterPartyEligibility {
  const eligibleActors: Actor[] = [];
  const excludedActors: Actor[] = [];
  for (const actor of actors) {
    if (actor.campaignId === campaignId && actor.systemId === systemId && actor.type === "character") eligibleActors.push(actor);
    else excludedActors.push(actor);
  }
  return { eligibleActors, excludedActors };
}

export function savedEncountersForSystem(encounters: Encounter[], systemId: string): Encounter[] {
  return encounters
    .filter((encounter) => encounter.systemId === systemId || encounter.systemId === undefined)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function encounterThreatCounts(encounter: Pick<Encounter, "threats">): Record<string, number> {
  return Object.fromEntries((encounter.threats ?? []).map((threat) => [threat.id, threat.count]));
}

export function encounterThreatFingerprint(threats: Array<{ id: string; count: number }> | undefined): string {
  return [...(threats ?? [])]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((threat) => `${threat.id}:${threat.count}`)
    .join("|");
}

export async function persistEncounterComposition(input: EncounterCompositionInput): Promise<Encounter> {
  const payload = {
    name: input.name.trim() || "New Encounter",
    summary: input.summary,
    difficulty: input.difficulty,
    systemId: input.systemId,
    partyActorIds: input.partyActorIds,
    threats: input.threats
  };
  if (input.encounterId) return apiPatch<Encounter>(`/api/v1/encounters/${input.encounterId}`, payload);
  const result = await apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${input.campaignId}/systems/${input.systemId}/encounter-plan`, {
    partyActorIds: input.partyActorIds,
    threats: input.threats,
    createEncounter: true,
    name: payload.name
  });
  if (!result.encounter) throw new Error("The encounter plan was created but no saved encounter was returned.");
  return result.encounter;
}

export function deleteSavedEncounter(encounterId: string): Promise<Encounter> {
  return apiDelete<Encounter>(`/api/v1/encounters/${encounterId}`);
}

export function EncounterBuilderDialog(props: {
  campaignId: string;
  systemId: string;
  systemName?: string;
  partyActors: Actor[];
  savedEncounters: Encounter[];
  activeScene?: Scene;
  canSave: boolean;
  canSpawn: boolean;
  onClose(): void;
  onPlan(plan?: EncounterPlanInfo): void;
  onEncounterSaved(encounter: Encounter): void;
  onEncounterDeleted(encounter: Encounter): void;
  onSpawnThreats(threats: EncounterBuilderThreatSelection[], signal: AbortSignal): Promise<void>;
  onStatus(message: string): void;
}) {
  const partyEligibility = encounterPartyEligibility(props.partyActors, props.campaignId, props.systemId);
  const eligiblePartyActors = partyEligibility.eligibleActors;
  const excludedPartyActors = partyEligibility.excludedActors;
  const [threats, setThreats] = useState<EncounterThreatInfo[]>([]);
  const [loadingThreats, setLoadingThreats] = useState(true);
  const [filter, setFilter] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [partyActorIds, setPartyActorIds] = useState<Set<string>>(() => new Set(eligiblePartyActors.map((actor) => actor.id)));
  const [plan, setPlan] = useState<EncounterPlanInfo | undefined>();
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState("");
  const [name, setName] = useState("New Encounter");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedEncounter, setSavedEncounter] = useState<Encounter | undefined>();
  const [savedThreatFingerprint, setSavedThreatFingerprint] = useState("");
  const spawnAbortRef = useRef<AbortController | null>(null);
  const closeDialog = () => {
    spawnAbortRef.current?.abort();
    props.onClose();
  };
  const dialogRef = useModalAccessibility<HTMLDivElement>(closeDialog);

  const filterTerm = filter.trim().toLowerCase();
  const partyActorKey = eligiblePartyActors.map((actor) => actor.id).join("|");
  const visibleThreats = useMemo(() => {
    if (!filterTerm) return threats;
    return threats.filter((threat) => [threat.name, threat.summary, threat.role, String(threat.challengeRating ?? "")].some((value) => value.toLowerCase().includes(filterTerm)));
  }, [filterTerm, threats]);
  const availableSavedEncounters = useMemo(() => savedEncountersForSystem(props.savedEncounters, props.systemId), [props.savedEncounters, props.systemId]);
  const composition = useMemo(() => threats
    .map((threat) => ({ threat, count: counts[threat.id] ?? 0 }))
    .filter((item) => item.count > 0), [counts, threats]);
  const compositionKey = useMemo(() => composition.map(({ threat, count }) => `${threat.id}:${count}`).join("|"), [composition]);
  const selectedPartyIds = useMemo(() => [...partyActorIds].filter((id) => eligiblePartyActors.some((actor) => actor.id === id)).sort(), [partyActorIds, partyActorKey]);
  const partyKey = selectedPartyIds.join("|");
  const canPlan = composition.length > 0;
  const canSave = props.canSave && canPlan && Boolean(plan) && !planning && !saving && !deleting;
  const canPlace = props.canSpawn && Boolean(savedEncounter) && composition.length > 0 && savedThreatFingerprint === encounterThreatFingerprint(composition.map(({ threat, count }) => ({ id: threat.id, count }))) && !spawning;

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

  useEffect(() => () => spawnAbortRef.current?.abort(), []);

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

  function beginNewEncounter() {
    setSavedEncounter(undefined);
    setSavedThreatFingerprint("");
    setDeleteConfirmationId("");
    setName("New Encounter");
    setCounts({});
    setPartyActorIds(new Set(eligiblePartyActors.map((actor) => actor.id)));
    setPlan(undefined);
    props.onPlan(undefined);
    setError("");
    setNotice("");
  }

  function reopenEncounter(encounter: Encounter) {
    const reopenable = encounter.systemId === props.systemId && encounter.threats !== undefined;
    setSavedEncounter(encounter);
    setDeleteConfirmationId("");
    setName(encounter.name);
    setCounts(encounterThreatCounts(encounter));
    setPartyActorIds(new Set(encounter.partyActorIds ?? eligiblePartyActors.map((actor) => actor.id)));
    setSavedThreatFingerprint(reopenable ? encounterThreatFingerprint(encounter.threats) : "");
    setError("");
    setNotice(reopenable ? `${encounter.name} reopened for editing.` : "This legacy save has no stored composition. Add threats and save to upgrade it.");
  }

  async function saveEncounter() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const selectedThreats = composition.map(({ threat, count }) => ({ id: threat.id, count }));
      const encounter = await persistEncounterComposition({
        campaignId: props.campaignId,
        systemId: props.systemId,
        encounterId: savedEncounter?.id,
        name,
        summary: plan?.summary ?? savedEncounter?.summary ?? "",
        difficulty: plan?.difficulty,
        partyActorIds: selectedPartyIds,
        threats: selectedThreats
      });
      setSavedEncounter(encounter);
      setSavedThreatFingerprint(encounterThreatFingerprint(encounter.threats));
      setDeleteConfirmationId("");
      setName(encounter.name);
      setNotice(`${encounter.name} saved. You can reopen it from this builder later.`);
      props.onEncounterSaved(encounter);
      props.onStatus(`${encounter.name} saved`);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEncounter() {
    if (!props.canSave || !savedEncounter || deleting) return;
    if (deleteConfirmationId !== savedEncounter.id) {
      setDeleteConfirmationId(savedEncounter.id);
      setNotice(`Select delete again to permanently remove ${savedEncounter.name}.`);
      return;
    }
    setDeleting(true);
    setError("");
    try {
      const deleted = await deleteSavedEncounter(savedEncounter.id);
      props.onEncounterDeleted(deleted);
      props.onStatus(`${deleted.name} deleted`);
      beginNewEncounter();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  async function placeMonsters() {
    if (!canPlace) return;
    const controller = new AbortController();
    spawnAbortRef.current = controller;
    setSpawning(true);
    setError("");
    try {
      await props.onSpawnThreats(composition.map(({ threat, count }) => ({ id: threat.id, name: threat.name, count })), controller.signal);
    } catch (spawnError) {
      if (!controller.signal.aborted) setError(errorMessage(spawnError));
    } finally {
      if (spawnAbortRef.current === controller) {
        spawnAbortRef.current = null;
        setSpawning(false);
      }
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div ref={dialogRef} className="modal-dialog encounter-builder" role="dialog" aria-modal="true" aria-label="Encounter builder" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <h2>Encounter Builder</h2>
            <p>{props.systemName ?? props.systemId} threat catalog</p>
          </div>
          <button className="icon-button" type="button" aria-label={spawning ? "Cancel monster placement and close encounter builder" : "Close encounter builder"} onClick={closeDialog}><X size={16} /></button>
        </header>

        <section className="encounter-saved-library" aria-label="Saved encounters">
          <div className="encounter-saved-heading">
            <div>
              <div className="section-title">Saved Encounters</div>
              <p>Reopen a composition to adjust the party or threats.</p>
            </div>
            <button className="ghost-button small" type="button" disabled={saving || deleting} onClick={beginNewEncounter}>
              <FilePlus2 size={14} /> New encounter
            </button>
          </div>
          <div className="encounter-saved-list">
            {availableSavedEncounters.length === 0 ? <div className="empty-state compact">No saved encounters yet.</div> : availableSavedEncounters.map((encounter) => {
              const compositionAvailable = encounter.systemId === props.systemId && encounter.threats !== undefined;
              return (
                <button
                  className={savedEncounter?.id === encounter.id ? "encounter-saved-card selected" : "encounter-saved-card"}
                  type="button"
                  key={encounter.id}
                  aria-pressed={savedEncounter?.id === encounter.id}
                  disabled={saving || deleting}
                  onClick={() => reopenEncounter(encounter)}
                >
                  <strong>{encounter.name}</strong>
                  <span>{compositionAvailable ? `${encounter.threats?.reduce((total, threat) => total + threat.count, 0) ?? 0} threats · ${titleCaseLabel(encounter.difficulty ?? "unrated")}` : "Legacy save · add composition to upgrade"}</span>
                </button>
              );
            })}
          </div>
        </section>

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
                    <ThreatStepper count={count} disabled={saving || deleting} onDecrease={() => setThreatCount(threat.id, count - 1)} onIncrease={() => setThreatCount(threat.id, count + 1)} />
                  </article>
                );
              })}
            </div>
          </section>

          <section className="encounter-compose" aria-label="Encounter composition">
            <label>
              <span>Encounter name</span>
              <input aria-label="Encounter name" value={name} disabled={saving || deleting} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="encounter-party" aria-label="Party members">
              <div className="section-title">Party</div>
              {eligiblePartyActors.length === 0 ? (
                <p>No {props.systemName ?? props.systemId} character actors are available. Difficulty preview uses the system baseline until you create or import a compatible character.</p>
              ) : eligiblePartyActors.map((actor) => (
                <label className="inline-check" key={actor.id}>
                  <input type="checkbox" checked={partyActorIds.has(actor.id)} disabled={saving || deleting} onChange={(event) => togglePartyActor(actor.id, event.target.checked)} />
                  <span>{actor.name}</span>
                </label>
              ))}
              {excludedPartyActors.length > 0 ? (
                <p className="encounter-party-exclusion" role="status">
                  {excludedPartyActors.map((actor) => `${actor.name} (${actor.systemId})`).join(", ")} {excludedPartyActors.length === 1 ? "is" : "are"} not included. Encounter math only uses character actors created for {props.systemName ?? props.systemId}.
                </p>
              ) : null}
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
                    <ThreatStepper count={count} disabled={saving || deleting} onDecrease={() => setThreatCount(threat.id, count - 1)} onIncrease={() => setThreatCount(threat.id, count + 1)} />
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
            {notice && !error && <p className="encounter-notice" role="status">{notice}</p>}
          </section>
        </div>

        <footer className="creator-footer encounter-builder-footer">
          <div className="button-row">
            <button className="ghost-button" type="button" onClick={props.onClose}>Close</button>
            {savedEncounter && props.canSave ? (
              <button className={deleteConfirmationId === savedEncounter.id ? "danger-button" : "ghost-button"} type="button" disabled={deleting || saving} onClick={() => void deleteEncounter()}>
                <Trash2 size={14} /> {deleting ? "Deleting..." : deleteConfirmationId === savedEncounter.id ? "Confirm delete" : "Delete"}
              </button>
            ) : null}
          </div>
          <div className="button-row">
            {savedEncounter && (
              <button className="ghost-button" type="button" disabled={!canPlace} onClick={() => void placeMonsters()} title={props.activeScene ? `Place on ${props.activeScene.name}` : "Select a scene first"}>
                <Swords size={14} /> {spawning ? "Placing..." : "Place monsters on scene"}
              </button>
            )}
            <button className="primary-button" type="button" disabled={!canSave} onClick={() => void saveEncounter()} title={props.canSave ? undefined : "You need combat management permission to save encounters"}>
              <Save size={14} /> {saving ? "Saving..." : savedEncounter ? "Update encounter" : "Save encounter"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ThreatStepper(props: { count: number; disabled?: boolean; onDecrease(): void; onIncrease(): void }) {
  return (
    <div className="encounter-threat-stepper" aria-label="Threat count controls">
      {props.count > 0 ? (
        <button className="icon-button" type="button" aria-label="Decrease threat count" disabled={props.disabled} onClick={props.onDecrease}><Minus size={14} /></button>
      ) : null}
      {props.count > 0 ? <span>{formatNumber(props.count)}</span> : null}
      <button className="ghost-button small" type="button" disabled={props.disabled} onClick={props.onIncrease}>
        {props.count > 0 ? <Plus size={14} /> : "Add"}
      </button>
    </div>
  );
}
