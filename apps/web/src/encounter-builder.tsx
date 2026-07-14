import type { Actor, Encounter, Scene, Token } from "@open-tabletop/core";
import { FilePlus2, Minus, Plus, Save, Search, Swords, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, type EncounterPlanInfo } from "./api.js";
import { useModalAccessibility } from "./modal-accessibility.js";
import { errorMessage, formatNumber, titleCaseLabel } from "./sheet-format.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";

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
  expectedUpdatedAt: string;
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

export interface EncounterPartyReadinessItem {
  actor: Actor;
  token?: Token;
  status: "placed" | "missing";
}

export const ENCOUNTER_CATALOG_WINDOW_SIZE = 40;

export interface EncounterCatalogWindow<T> {
  items: T[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
}

/**
 * Keeps the threat catalog DOM bounded even when a system exposes thousands
 * of entries. The complete filtered collection remains available for search
 * and encounter composition; only one keyboard-navigable page is mounted.
 */
export function encounterCatalogWindow<T>(items: T[], requestedPage: number, windowSize = ENCOUNTER_CATALOG_WINDOW_SIZE): EncounterCatalogWindow<T> {
  const safeWindowSize = Math.max(1, Math.floor(windowSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safeWindowSize));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(requestedPage)));
  const start = page * safeWindowSize;
  const end = Math.min(items.length, start + safeWindowSize);
  return { items: items.slice(start, end), page, pageCount, start, end };
}

export function encounterPartyReadiness(
  actors: Actor[],
  selectedActorIds: string[],
  activeScene: Scene | undefined,
  sceneTokens: Token[]
): EncounterPartyReadinessItem[] {
  const selectedIds = new Set(selectedActorIds);
  return actors
    .filter((actor) => selectedIds.has(actor.id))
    .map((actor) => {
      const token = activeScene
        ? sceneTokens.find((candidate) => candidate.sceneId === activeScene.id && candidate.actorId === actor.id && candidate.layer !== "map")
        : undefined;
      return { actor, token, status: token ? "placed" as const : "missing" as const };
    });
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
    threats: input.threats,
    expectedUpdatedAt: input.expectedUpdatedAt
  };
  if (input.encounterId) return apiPatch<Encounter>(`/api/v1/encounters/${input.encounterId}`, payload, {
    idempotencyKey: sharedMutationIdempotencyKey(`encounter:update:${input.encounterId}`, input.expectedUpdatedAt, payload)
  });
  const createPayload = {
    partyActorIds: input.partyActorIds,
    threats: input.threats,
    createEncounter: true,
    name: payload.name,
    expectedUpdatedAt: input.expectedUpdatedAt
  };
  const result = await apiPost<{ plan: EncounterPlanInfo; encounter?: Encounter }>(`/api/v1/campaigns/${input.campaignId}/systems/${input.systemId}/encounter-plan`, createPayload, {
    idempotencyKey: sharedMutationIdempotencyKey(`encounter:create:${input.campaignId}`, input.expectedUpdatedAt, createPayload)
  });
  if (!result.encounter) throw new Error("The encounter plan was created but no saved encounter was returned.");
  return result.encounter;
}

export function deleteSavedEncounter(encounterId: string, expectedUpdatedAt: string): Promise<Encounter> {
  return apiDelete<Encounter>(`/api/v1/encounters/${encounterId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, {
    idempotencyKey: sharedMutationIdempotencyKey(`encounter:delete:${encounterId}`, expectedUpdatedAt, {})
  });
}

export function EncounterBuilderDialog(props: {
  campaignId: string;
  campaignUpdatedAt: string;
  systemId: string;
  systemName?: string;
  partyActors: Actor[];
  sceneTokens: Token[];
  savedEncounters: Encounter[];
  activeScene?: Scene;
  canSave: boolean;
  canSpawn: boolean;
  canLaunch: boolean;
  onClose(): void;
  onPlan(plan?: EncounterPlanInfo): void;
  onEncounterSaved(encounter: Encounter): void;
  onEncounterDeleted(encounter: Encounter): void;
  onRefreshSharedState(): Promise<void>;
  onSpawnThreats(threats: EncounterBuilderThreatSelection[], signal: AbortSignal, attemptId: string): Promise<void>;
  onPlacePartyActor(actor: Actor): Promise<void>;
  onLaunchThreats(threats: EncounterBuilderThreatSelection[], partyActorIds: string[], signal: AbortSignal, attemptId: string): Promise<void>;
  onStatus(message: string): void;
}) {
  const partyEligibility = encounterPartyEligibility(props.partyActors, props.campaignId, props.systemId);
  const eligiblePartyActors = partyEligibility.eligibleActors;
  const excludedPartyActors = partyEligibility.excludedActors;
  const [threats, setThreats] = useState<EncounterThreatInfo[]>([]);
  const [loadingThreats, setLoadingThreats] = useState(true);
  const [filter, setFilter] = useState("");
  const [threatCatalogPage, setThreatCatalogPage] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [partyActorIds, setPartyActorIds] = useState<Set<string>>(() => new Set(eligiblePartyActors.map((actor) => actor.id)));
  const [plan, setPlan] = useState<EncounterPlanInfo | undefined>();
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [placingPartyActorId, setPlacingPartyActorId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState("");
  const [name, setName] = useState("New Encounter");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedEncounter, setSavedEncounter] = useState<Encounter | undefined>();
  const [savedThreatFingerprint, setSavedThreatFingerprint] = useState("");
  const spawnAbortRef = useRef<AbortController | null>(null);
  const placeAttemptIdRef = useRef<string | undefined>(undefined);
  const launchAttemptIdRef = useRef<string | undefined>(undefined);
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
  const threatWindow = useMemo(() => encounterCatalogWindow(visibleThreats, threatCatalogPage), [threatCatalogPage, visibleThreats]);
  const renderedThreats = threatWindow.items;
  const availableSavedEncounters = useMemo(() => savedEncountersForSystem(props.savedEncounters, props.systemId), [props.savedEncounters, props.systemId]);
  const composition = useMemo(() => threats
    .map((threat) => ({ threat, count: counts[threat.id] ?? 0 }))
    .filter((item) => item.count > 0), [counts, threats]);
  const compositionKey = useMemo(() => composition.map(({ threat, count }) => `${threat.id}:${count}`).join("|"), [composition]);
  const selectedPartyIds = useMemo(() => [...partyActorIds].filter((id) => eligiblePartyActors.some((actor) => actor.id === id)).sort(), [partyActorIds, partyActorKey]);
  const partyReadiness = useMemo(
    () => encounterPartyReadiness(eligiblePartyActors, selectedPartyIds, props.activeScene, props.sceneTokens),
    [eligiblePartyActors, props.activeScene, props.sceneTokens, selectedPartyIds]
  );
  const missingPartyActors = partyReadiness.filter((item) => item.status === "missing").map((item) => item.actor);
  const partyKey = selectedPartyIds.join("|");
  const canPlan = composition.length > 0;
  const canSave = props.canSave && canPlan && Boolean(plan) && !planning && !saving && !deleting;
  const savedCompositionIsCurrent = Boolean(savedEncounter) && composition.length > 0 && savedThreatFingerprint === encounterThreatFingerprint(composition.map(({ threat, count }) => ({ id: threat.id, count })));
  const canPlace = props.canSpawn && savedCompositionIsCurrent && !spawning && !launching;
  const canLaunch = props.canLaunch && savedCompositionIsCurrent && missingPartyActors.length === 0 && !spawning && !launching && !placingPartyActorId;
  const launchTitle = !props.activeScene
    ? "Select a scene first"
    : missingPartyActors.length > 0
      ? `Place selected party tokens first: ${missingPartyActors.map((actor) => actor.name).join(", ")}`
      : `Place monsters on ${props.activeScene.name} and review every participant's initiative`;

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
    setThreatCatalogPage(0);
  }, [filterTerm, props.campaignId, props.systemId]);

  useEffect(() => {
    placeAttemptIdRef.current = undefined;
    launchAttemptIdRef.current = undefined;
  }, [compositionKey, savedEncounter?.id]);

  useEffect(() => {
    if (!savedEncounter) return;
    const latest = props.savedEncounters.find((encounter) => encounter.id === savedEncounter.id);
    if (!latest || latest.updatedAt === savedEncounter.updatedAt) return;
    // Refresh the authoritative revision without overwriting the open name,
    // party, or threat draft. The next explicit save is a reviewed retry.
    setSavedEncounter(latest);
  }, [props.savedEncounters, savedEncounter]);

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

  async function placePartyActor(actor: Actor) {
    if (!props.activeScene || placingPartyActorId) return;
    setPlacingPartyActorId(actor.id);
    setError("");
    try {
      await props.onPlacePartyActor(actor);
      setNotice(`${actor.name} is ready on ${props.activeScene.name}.`);
    } catch (placeError) {
      setError(errorMessage(placeError));
    } finally {
      setPlacingPartyActorId("");
    }
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
        expectedUpdatedAt: savedEncounter?.updatedAt ?? props.campaignUpdatedAt,
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
      if (!savedEncounter) await props.onRefreshSharedState();
    } catch (saveError) {
      if (isStaleWriteError(saveError)) {
        await props.onRefreshSharedState();
        setError(staleDraftPreservedMessage);
      } else {
        setError(errorMessage(saveError));
      }
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
      const deleted = await deleteSavedEncounter(savedEncounter.id, savedEncounter.updatedAt);
      props.onEncounterDeleted(deleted);
      props.onStatus(`${deleted.name} deleted`);
      beginNewEncounter();
    } catch (deleteError) {
      if (isStaleWriteError(deleteError)) {
        await props.onRefreshSharedState();
        setError(staleDraftPreservedMessage);
      } else {
        setError(errorMessage(deleteError));
      }
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
    const attemptId = placeAttemptIdRef.current ?? globalThis.crypto.randomUUID();
    placeAttemptIdRef.current = attemptId;
    try {
      await props.onSpawnThreats(composition.map(({ threat, count }) => ({ id: threat.id, name: threat.name, count })), controller.signal, attemptId);
      placeAttemptIdRef.current = undefined;
    } catch (spawnError) {
      if (!controller.signal.aborted) setError(errorMessage(spawnError));
    } finally {
      if (spawnAbortRef.current === controller) {
        spawnAbortRef.current = null;
        setSpawning(false);
      }
    }
  }

  async function launchCombat() {
    if (!canLaunch) return;
    if (missingPartyActors.length > 0) {
      setError(`Place selected party tokens first: ${missingPartyActors.map((actor) => actor.name).join(", ")}.`);
      return;
    }
    const controller = new AbortController();
    spawnAbortRef.current = controller;
    setLaunching(true);
    setError("");
    const attemptId = launchAttemptIdRef.current ?? globalThis.crypto.randomUUID();
    launchAttemptIdRef.current = attemptId;
    try {
      await props.onLaunchThreats(composition.map(({ threat, count }) => ({ id: threat.id, name: threat.name, count })), selectedPartyIds, controller.signal, attemptId);
      launchAttemptIdRef.current = undefined;
    } catch (launchError) {
      if (!controller.signal.aborted) setError(errorMessage(launchError));
    } finally {
      if (spawnAbortRef.current === controller) {
        spawnAbortRef.current = null;
        setLaunching(false);
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
          <button className="icon-button" type="button" aria-label={spawning || launching ? "Cancel monster placement and close encounter builder" : "Close encounter builder"} onClick={closeDialog}><X size={16} /></button>
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
            <div className="encounter-threat-list" data-catalog-window-size={ENCOUNTER_CATALOG_WINDOW_SIZE}>
              {loadingThreats ? <div className="empty-state compact">Loading threats...</div> : null}
              {!loadingThreats && visibleThreats.length === 0 ? <div className="empty-state compact">No threats match this search.</div> : null}
              {renderedThreats.map((threat) => {
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
              {!loadingThreats && visibleThreats.length > ENCOUNTER_CATALOG_WINDOW_SIZE ? (
                <nav className="encounter-catalog-more" aria-label="Threat catalog pages">
                  <span>
                    Showing {formatNumber(threatWindow.start + 1)}-{formatNumber(threatWindow.end)} of {formatNumber(visibleThreats.length)} threats
                  </span>
                  <div className="button-row compact">
                    <button className="ghost-button small" type="button" disabled={threatWindow.page === 0} onClick={() => setThreatCatalogPage((current) => Math.max(0, current - 1))}>Previous 40</button>
                    <span aria-live="polite">Page {formatNumber(threatWindow.page + 1)} of {formatNumber(threatWindow.pageCount)}</span>
                    <button className="ghost-button small" type="button" disabled={threatWindow.page + 1 >= threatWindow.pageCount} onClick={() => setThreatCatalogPage((current) => current + 1)}>Next 40</button>
                  </div>
                </nav>
              ) : null}
            </div>
          </section>

          <section className="encounter-compose" aria-label="Encounter composition">
            <label>
              <span>Encounter name</span>
              <input aria-label="Encounter name" value={name} disabled={saving || deleting} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="encounter-party" aria-label="Party members">
              <div className="encounter-party-heading">
                <div className="section-title">Party</div>
                {eligiblePartyActors.length > 0 ? (
                  <div className="button-row compact">
                    <button className="ghost-button small" type="button" disabled={saving || deleting || launching || selectedPartyIds.length === eligiblePartyActors.length} onClick={() => setPartyActorIds(new Set(eligiblePartyActors.map((actor) => actor.id)))}>Select all</button>
                    <button className="ghost-button small" type="button" disabled={saving || deleting || launching || selectedPartyIds.length === 0} onClick={() => setPartyActorIds(new Set())}>Clear party</button>
                  </div>
                ) : null}
              </div>
              <div className="encounter-party-roster">
                {eligiblePartyActors.length === 0 ? (
                  <p>No {props.systemName ?? props.systemId} character actors are available. Difficulty preview uses the system baseline until you create or import a compatible character.</p>
                ) : eligiblePartyActors.map((actor) => {
                  const readiness = partyReadiness.find((item) => item.actor.id === actor.id);
                  const selected = partyActorIds.has(actor.id);
                  return (
                    <div className="encounter-party-row" key={actor.id}>
                      <label className="inline-check">
                        <input type="checkbox" checked={selected} disabled={saving || deleting || launching} onChange={(event) => togglePartyActor(actor.id, event.target.checked)} />
                        <span>{actor.name}</span>
                      </label>
                      {selected ? (
                        readiness?.status === "placed" ? (
                          <span className="status-pill success">On scene</span>
                        ) : (
                          <button
                            className="ghost-button small"
                            type="button"
                            disabled={!props.activeScene || Boolean(placingPartyActorId) || !props.canSpawn}
                            onClick={() => void placePartyActor(actor)}
                            title={props.activeScene ? `Place ${actor.name} near the party staging area on ${props.activeScene.name}` : "Select a scene first"}
                          >
                            <Plus size={14} /> {placingPartyActorId === actor.id ? "Placing..." : "Place on scene"}
                          </button>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {selectedPartyIds.length > 0 && (
                <p className={missingPartyActors.length > 0 ? "encounter-party-readiness needs-placement" : "encounter-party-readiness ready"} role="status">
                  {missingPartyActors.length > 0
                    ? `${missingPartyActors.length} selected ${missingPartyActors.length === 1 ? "character needs" : "characters need"} a token before combat review.`
                    : `All ${selectedPartyIds.length} selected ${selectedPartyIds.length === 1 ? "character is" : "characters are"} on the scene.`}
                </p>
              )}
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
            <button className="ghost-button" type="button" onClick={closeDialog}>Close</button>
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
            {savedEncounter && (
              <button className="primary-button" type="button" disabled={!canLaunch} onClick={() => void launchCombat()} title={launchTitle}>
                <Swords size={14} /> {launching ? "Preparing combat..." : "Place & review combat"}
              </button>
            )}
            <button className="primary-button" type="button" disabled={!canSave || launching} onClick={() => void saveEncounter()} title={props.canSave ? undefined : "You need combat management permission to save encounters"}>
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
