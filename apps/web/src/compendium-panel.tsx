import type {
  Actor,
  CompendiumCatalogEntry,
  CompendiumConflict,
  CompendiumConflictChoice,
  CompendiumProvenance,
  CompendiumProvenanceSummary,
  Item
} from "@open-tabletop/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, apiPost, type SystemRuntimeInfo } from "./api.js";

interface CompendiumCatalogResponse {
  systemId: string;
  entries: CompendiumCatalogEntry[];
  provenanceSummary: CompendiumProvenanceSummary;
  filters: { q: string; types: string[] };
}

interface CompendiumMutationResponse {
  entry: CompendiumCatalogEntry;
  resolution: "added" | "kept_existing" | "replaced_existing";
  actor: Actor;
  item?: Item;
}

interface CompendiumPurchaseResponse {
  entry: CompendiumCatalogEntry;
  resolution: "purchased" | "kept_existing" | "merged_existing" | "replaced_existing";
  purchase: { totalCostGp?: number; quantity?: number };
  actor: Actor;
  item: Item;
}

interface CompendiumConflictBody {
  error: "conflict";
  code: "compendium_conflict";
  message: string;
  conflict: CompendiumConflict;
  entry: CompendiumCatalogEntry;
}

export type CompendiumActionKind = "import" | "purchase";

interface CompendiumMutationAttempt {
  kind: CompendiumActionKind;
  actorId: string;
  entry: CompendiumCatalogEntry;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  quantity: number;
  conflictChoice?: CompendiumConflictChoice;
}

interface VisibleCompendiumConflict {
  body: CompendiumConflictBody;
  attempt: CompendiumMutationAttempt;
}

export const COMPENDIUM_CATALOG_WINDOW_SIZE = 40;

export function compendiumEntryAnchorId(entryId: string): string {
  return `campaign-search-compendium-${encodeURIComponent(entryId)}`;
}

export function compendiumCatalogWindow<T>(entries: readonly T[], requestedPage: number, windowSize = COMPENDIUM_CATALOG_WINDOW_SIZE) {
  const safeWindowSize = Math.max(1, Math.floor(windowSize));
  const pageCount = Math.max(1, Math.ceil(entries.length / safeWindowSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), pageCount - 1);
  const start = page * safeWindowSize;
  const end = Math.min(entries.length, start + safeWindowSize);
  return { items: entries.slice(start, end), page, pageCount, start, end };
}

interface CompendiumPanelProps {
  campaignId: string;
  systems: SystemRuntimeInfo[];
  actors: Actor[];
  items: Item[];
  initialSystemId?: string;
  initialSearch?: string;
  initialEntryId?: string;
  canUpdateActor(actor: Actor): boolean;
  onMutation(result: { actor: Actor; item?: Item }): void;
  onStatus(message: string): void;
}

export function CompendiumPanel({
  campaignId,
  systems,
  actors,
  items,
  initialSystemId,
  initialSearch,
  initialEntryId,
  canUpdateActor,
  onMutation,
  onStatus
}: CompendiumPanelProps) {
  const searchId = useId();
  const typeId = useId();
  const systemIdField = useId();
  const actorIdField = useId();
  const preferredSystemId = initialSystemId && systems.some((system) => system.id === initialSystemId)
    ? initialSystemId
    : systems.find((system) => system.active)?.id ?? systems[0]?.id ?? "";
  const [systemId, setSystemId] = useState(preferredSystemId);
  const [actorId, setActorId] = useState("");
  const [search, setSearch] = useState(initialSearch ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [catalog, setCatalog] = useState<CompendiumCatalogResponse>();
  const [catalogPage, setCatalogPage] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [pendingEntryId, setPendingEntryId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [mutationMessage, setMutationMessage] = useState("Choose a system, then select an actor before importing or purchasing.");
  const [mutationError, setMutationError] = useState("");
  const [lastAttempt, setLastAttempt] = useState<CompendiumMutationAttempt>();
  const [visibleConflict, setVisibleConflict] = useState<VisibleCompendiumConflict>();
  const mutationControllerRef = useRef<AbortController | undefined>(undefined);
  const focusedEntryRef = useRef("");

  useEffect(() => {
    if (systems.some((system) => system.id === systemId)) return;
    setSystemId(preferredSystemId);
  }, [preferredSystemId, systemId, systems]);

  useEffect(() => {
    if (initialSystemId && systems.some((system) => system.id === initialSystemId)) setSystemId(initialSystemId);
    if (initialSearch !== undefined) setSearch(initialSearch);
    focusedEntryRef.current = "";
  }, [initialEntryId, initialSearch, initialSystemId, systems]);

  const systemActors = useMemo(
    () => actors.filter((actor) => actor.systemId === systemId).sort((left, right) => left.name.localeCompare(right.name)),
    [actors, systemId]
  );
  const selectedActor = systemActors.find((actor) => actor.id === actorId);

  useEffect(() => {
    if (!actorId || systemActors.some((actor) => actor.id === actorId)) return;
    setActorId("");
  }, [actorId, systemActors]);

  useEffect(() => {
    if (!campaignId || !systemId) {
      setCatalog(undefined);
      setLoadState("ready");
      return;
    }
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    const timer = window.setTimeout(() => {
      void apiGet<CompendiumCatalogResponse>(
        compendiumCatalogPath(campaignId, systemId, search, typeFilter),
        { signal: controller.signal }
      )
        .then((response) => {
          setCatalog(response);
          setCatalogPage(0);
          setLoadState("ready");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setLoadError(messageForError(error));
          setLoadState("error");
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [campaignId, reloadVersion, search, systemId, typeFilter]);

  useEffect(() => () => mutationControllerRef.current?.abort(), []);

  async function runMutation(attempt: CompendiumMutationAttempt): Promise<void> {
    const actor = actors.find((candidate) => candidate.id === attempt.actorId && candidate.systemId === attempt.entry.provenance.systemId);
    if (!actor) {
      setMutationError("The chosen actor is no longer available for this system.");
      return;
    }
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setPendingEntryId(attempt.entry.id);
    setMutationError("");
    setLastAttempt(undefined);
    setVisibleConflict(undefined);
    setMutationMessage(`${attempt.kind === "purchase" ? "Purchasing" : "Importing"} ${attempt.entry.name}...`);
    try {
      const path = `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${encodeURIComponent(attempt.entry.provenance.systemId)}/actors/${encodeURIComponent(actor.id)}/${attempt.kind === "purchase" ? "purchase" : "compendium"}`;
      const response = attempt.kind === "purchase"
        ? await apiPost<CompendiumPurchaseResponse>(path, {
            entryId: attempt.entry.id,
            quantity: attempt.quantity,
            expectedUpdatedAt: attempt.expectedUpdatedAt,
            ...(attempt.conflictChoice ? { conflictChoice: attempt.conflictChoice } : {})
          }, { idempotencyKey: attempt.idempotencyKey, signal: controller.signal })
        : await apiPost<CompendiumMutationResponse>(path, {
            entryId: attempt.entry.id,
            expectedUpdatedAt: attempt.expectedUpdatedAt,
            ...(attempt.conflictChoice ? { conflictChoice: attempt.conflictChoice } : {})
          }, { idempotencyKey: attempt.idempotencyKey, signal: controller.signal });
      onMutation({ actor: response.actor, item: response.item });
      const resultLabel = mutationResultLabel(response.resolution);
      setMutationMessage(`${response.entry.name}: ${resultLabel}.`);
      onStatus(`${response.entry.name}: ${resultLabel}`);
      setReloadVersion((version) => version + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      const conflictBody = compendiumConflictFromError(error);
      if (conflictBody) {
        setVisibleConflict({ body: conflictBody, attempt });
        setMutationMessage("Nothing changed. Choose an explicit conflict action below.");
        return;
      }
      const staleActor = staleActorFromError(error);
      if (staleActor) {
        onMutation({ actor: staleActor });
        setLastAttempt({
          ...attempt,
          expectedUpdatedAt: staleActor.updatedAt,
          idempotencyKey: newCompendiumMutationKey(attempt.kind, staleActor.id, attempt.entry.id)
        });
        setMutationError("The actor changed before this action completed. The latest revision is loaded; review and retry.");
      } else {
        setLastAttempt(attempt);
        setMutationError(messageForError(error));
      }
      setMutationMessage("No compendium change was confirmed.");
    } finally {
      if (mutationControllerRef.current === controller) {
        mutationControllerRef.current = undefined;
        setPendingEntryId("");
      }
    }
  }

  function beginMutation(kind: CompendiumActionKind, entry: CompendiumCatalogEntry): void {
    if (!selectedActor || !canUpdateActor(selectedActor)) return;
    const quantity = normalizedQuantity(quantities[entry.id]);
    void runMutation({
      kind,
      actorId: selectedActor.id,
      entry,
      expectedUpdatedAt: selectedActor.updatedAt,
      idempotencyKey: newCompendiumMutationKey(kind, selectedActor.id, entry.id),
      quantity
    });
  }

  function resolveConflict(choice: CompendiumConflictChoice): void {
    if (!visibleConflict) return;
    const actor = actors.find((candidate) => candidate.id === visibleConflict.attempt.actorId);
    if (!actor) return;
    void runMutation({
      ...visibleConflict.attempt,
      expectedUpdatedAt: actor.updatedAt,
      conflictChoice: choice,
      idempotencyKey: newCompendiumMutationKey(visibleConflict.attempt.kind, actor.id, visibleConflict.attempt.entry.id)
    });
  }

  const selectedSystem = systems.find((system) => system.id === systemId);
  const canMutateSelectedActor = Boolean(selectedActor && canUpdateActor(selectedActor));
  const typeOptions = Object.entries(catalog?.provenanceSummary.types ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const visibleCatalog = compendiumCatalogWindow(catalog?.entries ?? [], catalogPage);

  useEffect(() => {
    if (!initialEntryId || loadState !== "ready" || !catalog || focusedEntryRef.current === initialEntryId) return;
    const entryIndex = catalog.entries.findIndex((entry) => entry.id === initialEntryId);
    if (entryIndex < 0) return;
    const page = Math.floor(entryIndex / COMPENDIUM_CATALOG_WINDOW_SIZE);
    if (page !== catalogPage) {
      setCatalogPage(page);
      return;
    }
    focusedEntryRef.current = initialEntryId;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(compendiumEntryAnchorId(initialEntryId));
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [catalog, catalogPage, initialEntryId, loadState]);

  return (
    <section className="operator-section compendium-browser standalone-compendium" aria-labelledby={`${searchId}-heading`}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Campaign library</p>
          <h3 id={`${searchId}-heading`}>Compendium</h3>
          <p>Browse source-backed rules content without selecting a token or opening an actor sheet.</p>
        </div>
        <button className="ghost-button small" type="button" disabled={loadState === "loading"} onClick={() => setReloadVersion((version) => version + 1)}>
          Refresh
        </button>
      </div>

      <div className="compendium-controls">
        <label htmlFor={systemIdField}>
          System
          <select id={systemIdField} value={systemId} disabled={Boolean(pendingEntryId)} onChange={(event) => { setSystemId(event.target.value); setActorId(""); setTypeFilter(""); }}>
            {systems.map((system) => <option key={system.id} value={system.id}>{system.name} v{system.version}</option>)}
          </select>
        </label>
        <label htmlFor={actorIdField}>
          Actor for actions
          <select id={actorIdField} value={actorId} disabled={Boolean(pendingEntryId)} onChange={(event) => setActorId(event.target.value)}>
            <option value="">Choose an actor</option>
            {systemActors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
        </label>
        <label htmlFor={searchId}>
          Search
          <input id={searchId} type="search" value={search} placeholder="Name, summary, type, or source" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label htmlFor={typeId}>
          Type
          <select id={typeId} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {typeOptions.map(([type, count]) => <option key={type} value={type}>{type} ({count})</option>)}
          </select>
        </label>
      </div>

      <div className="admin-status" role="status" aria-live="polite">
        {mutationError || mutationMessage}
      </div>
      {mutationError && lastAttempt && (
        <div className="compendium-retry" role="alert">
          <span>{mutationError}</span>
          <button className="ghost-button small" type="button" disabled={Boolean(pendingEntryId)} onClick={() => void runMutation(lastAttempt)}>
            Retry same action
          </button>
        </div>
      )}

      {visibleConflict && (
        <section className="compendium-conflict" aria-labelledby={`${searchId}-conflict-heading`}>
          <h4 id={`${searchId}-conflict-heading`}>{visibleConflict.body.conflict.kind === "exact_duplicate" ? "Exact duplicate" : "Version conflict"}</h4>
          <p>{visibleConflict.body.message}</p>
          <p className="creator-note">
            Existing {visibleConflict.body.conflict.existingVersion ?? "legacy version"}; requested {visibleConflict.body.conflict.requestedVersion}. Nothing is charged, stacked, or replaced until you choose.
          </p>
          <div className="compendium-conflict-actions">
            {visibleConflict.body.conflict.choices.map((choice) => (
              <button className="ghost-button" type="button" key={choice} disabled={Boolean(pendingEntryId)} onClick={() => resolveConflict(choice)}>
                {conflictChoiceLabel(choice, visibleConflict.attempt.kind)}
              </button>
            ))}
          </div>
          <p className="creator-note">{conflictChoiceDetail(visibleConflict.body.conflict.choices, visibleConflict.attempt.kind)}</p>
        </section>
      )}

      {loadState === "loading" && <div className="empty-state compact" role="status">Loading compendium entries...</div>}
      {loadState === "error" && (
        <div className="empty-state compact" role="alert">
          <p>{loadError}</p>
          <button className="ghost-button small" type="button" onClick={() => setReloadVersion((version) => version + 1)}>Retry loading</button>
        </div>
      )}
      {loadState === "ready" && catalog && (
        <>
          <div className="compendium-summary" aria-label="Compendium provenance summary">
            <strong>{catalog.provenanceSummary.filteredEntries} of {catalog.provenanceSummary.totalEntries} entries</strong>
            <span>{selectedSystem?.name ?? catalog.systemId}</span>
            <details>
              <summary>Sources and licenses</summary>
              <ul>
                {catalog.provenanceSummary.sources.map((source) => (
                  <li key={`${source.sourceKind}:${source.sourceName}:${source.contentVersion}`}>
                    {source.sourceName} v{source.contentVersion} - {source.license.name} - {source.entryCount} entries
                  </li>
                ))}
              </ul>
            </details>
          </div>
          <nav className="catalog-window-controls" aria-label="Compendium result pages">
            <button className="ghost-button small" type="button" disabled={visibleCatalog.page === 0} onClick={() => setCatalogPage((page) => Math.max(0, page - 1))}>Previous 40</button>
            <span>{catalog.entries.length === 0 ? "No results" : `${formatCatalogRange(visibleCatalog.start, visibleCatalog.end)} of ${catalog.entries.length}`}</span>
            <button className="ghost-button small" type="button" disabled={visibleCatalog.page >= visibleCatalog.pageCount - 1} onClick={() => setCatalogPage((page) => Math.min(visibleCatalog.pageCount - 1, page + 1))}>Next 40</button>
          </nav>
          <div className="compendium-list" data-catalog-window-size={COMPENDIUM_CATALOG_WINDOW_SIZE}>
            {catalog.entries.length === 0 && <div className="empty-state compact">No entries match these filters.</div>}
            {visibleCatalog.items.map((entry) => {
              const quantity = normalizedQuantity(quantities[entry.id]);
              const purchaseCost = numericCost(entry.data.costGp) * quantity;
              const purchasable = systemId === "dnd-5e-srd" && entry.type !== "condition" && numericCost(entry.data.costGp) >= 0;
              const updateState = compendiumEntryUpdateState(selectedActor, items, entry);
              const pending = pendingEntryId === entry.id;
              return (
                <article id={compendiumEntryAnchorId(entry.id)} tabIndex={-1} className="compendium-entry" key={entry.id} aria-busy={pending}>
                  <div className="compendium-entry-heading">
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.type}</span>
                    </div>
                    <span className={`status-pill ${updateState.tone}`}>{updateState.label}</span>
                  </div>
                  <p>{entry.summary}</p>
                  <dl className="compendium-provenance">
                    <div><dt>Source</dt><dd>{sourceKindLabel(entry.provenance.sourceKind)} - {entry.provenance.sourceName} v{entry.provenance.sourceVersion}</dd></div>
                    <div><dt>Content</dt><dd>v{entry.provenance.contentVersion}</dd></div>
                    <div><dt>Rules</dt><dd>{entry.provenance.rulesVersion}; system v{entry.provenance.systemVersion}</dd></div>
                    <div>
                      <dt>License</dt>
                      <dd>
                        {entry.provenance.license.url
                          ? <a href={entry.provenance.license.url} target="_blank" rel="noreferrer">{entry.provenance.license.name}</a>
                          : entry.provenance.license.name}
                      </dd>
                    </div>
                    {entry.provenance.license.attribution && <div><dt>Attribution</dt><dd>{entry.provenance.license.attribution}</dd></div>}
                  </dl>
                  <div className="compendium-entry-actions">
                    {purchasable && (
                      <label>
                        Quantity
                        <input
                          aria-label={`${entry.name} purchase quantity`}
                          type="number"
                          min={1}
                          max={99}
                          value={quantity}
                          onChange={(event) => setQuantities((current) => ({ ...current, [entry.id]: normalizedQuantity(Number(event.target.value)) }))}
                        />
                      </label>
                    )}
                    <button className="ghost-button" type="button" disabled={!canMutateSelectedActor || pending} onClick={() => beginMutation("import", entry)}>
                      {pending ? "Working..." : selectedActor ? `Import to ${selectedActor.name}` : "Choose actor to import"}
                    </button>
                    {purchasable && (
                      <button className="ghost-button" type="button" disabled={!canMutateSelectedActor || pending} onClick={() => beginMutation("purchase", entry)}>
                        {pending ? "Working..." : selectedActor ? `Purchase for ${purchaseCost} gp` : "Choose actor to purchase"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function newCompendiumMutationKey(kind: CompendiumActionKind, actorId: string, entryId: string): string {
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `compendium-${kind}-${actorId}-${entryId}-${nonce}`.slice(0, 160);
}

function normalizedQuantity(value: unknown): number {
  const numeric = Math.floor(Number(value ?? 1));
  return Number.isFinite(numeric) ? Math.max(1, Math.min(99, numeric)) : 1;
}

function numericCost(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : -1;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compendiumConflictFromError(error: unknown): CompendiumConflictBody | undefined {
  if (!(error instanceof ApiError) || error.status !== 409 || !isRecord(error.body)) return undefined;
  if (error.body.code !== "compendium_conflict" || !isRecord(error.body.conflict) || !isRecord(error.body.entry)) return undefined;
  return error.body as unknown as CompendiumConflictBody;
}

function staleActorFromError(error: unknown): Actor | undefined {
  if (!(error instanceof ApiError) || error.status !== 409 || !isRecord(error.body) || error.body.code !== "stale_write" || !isRecord(error.body.current)) return undefined;
  const current = error.body.current;
  return typeof current.id === "string" && typeof current.systemId === "string" && typeof current.updatedAt === "string" ? current as unknown as Actor : undefined;
}

function mutationResultLabel(resolution: CompendiumMutationResponse["resolution"] | CompendiumPurchaseResponse["resolution"]): string {
  if (resolution === "kept_existing") return "kept existing with no changes";
  if (resolution === "replaced_existing") return "replaced in place";
  if (resolution === "merged_existing") return "merged quantity after confirmation";
  if (resolution === "purchased") return "purchased";
  return "imported";
}

export function conflictChoiceLabel(choice: CompendiumConflictChoice, kind: CompendiumActionKind): string {
  if (choice === "keep_existing") return "Keep existing (no changes)";
  if (choice === "merge_existing") return "Merge quantity and charge cost";
  return kind === "purchase" ? "Replace in place and reset quantity" : "Replace in place";
}

export function conflictChoiceDetail(choices: CompendiumConflictChoice[], kind: CompendiumActionKind): string {
  if (kind === "purchase" && choices.includes("merge_existing")) {
    return "Merge adds the requested mundane quantity to the existing item and charges only after confirmation. The item ID remains unchanged.";
  }
  if (kind === "purchase" && choices.includes("replace_existing")) {
    return "Replace updates the existing item and version under the same item ID, resetting quantity and purchase cost to this purchase. It does not stack.";
  }
  return "Replace updates the existing effect or item under the same identity. It never creates a second copy.";
}

export function compendiumEntryUpdateState(actor: Actor | undefined, items: Item[], entry: CompendiumCatalogEntry): { label: string; tone: string } {
  if (!actor) return { label: "Choose actor", tone: "neutral" };
  const existingProvenance = entry.type === "condition"
    ? actorConditionProvenance(actor, entry.id)
    : itemCompendiumProvenance(items.find((item) => item.actorId === actor.id && item.data.compendiumId === entry.id));
  const hasEntry = entry.type === "condition"
    ? actorHasCondition(actor, entry.id)
    : items.some((item) => item.actorId === actor.id && item.data.compendiumId === entry.id);
  if (!hasEntry) return { label: "Not imported", tone: "neutral" };
  if (!existingProvenance) return { label: "Legacy version - review", tone: "warning" };
  if (existingProvenance.contentVersion === entry.provenance.contentVersion) return { label: `Current v${entry.provenance.contentVersion}`, tone: "ready" };
  return { label: `Update ${existingProvenance.contentVersion} to ${entry.provenance.contentVersion}`, tone: "warning" };
}

function itemCompendiumProvenance(item: Item | undefined): CompendiumProvenance | undefined {
  return item ? provenanceFromValue(item.data.compendiumProvenance) : undefined;
}

function actorConditionProvenance(actor: Actor, conditionId: string): CompendiumProvenance | undefined {
  if (!isRecord(actor.data.compendiumConditionProvenance)) return undefined;
  return provenanceFromValue(actor.data.compendiumConditionProvenance[conditionId]);
}

function provenanceFromValue(value: unknown): CompendiumProvenance | undefined {
  if (!isRecord(value) || !isRecord(value.license)) return undefined;
  return typeof value.sourceKind === "string" && typeof value.sourceName === "string" && typeof value.sourceVersion === "string" &&
    typeof value.contentVersion === "string" && typeof value.systemId === "string" && typeof value.systemVersion === "string" &&
    typeof value.rulesVersion === "string" && typeof value.license.name === "string" && typeof value.license.usage === "string"
    ? value as unknown as CompendiumProvenance
    : undefined;
}

function actorHasCondition(actor: Actor, conditionId: string): boolean {
  return Array.isArray(actor.data.conditions) && actor.data.conditions.some((condition) => condition === conditionId || (isRecord(condition) && condition.id === conditionId));
}

function sourceKindLabel(sourceKind: CompendiumProvenance["sourceKind"]): string {
  if (sourceKind === "srd") return "SRD";
  if (sourceKind === "user") return "User supplied";
  return "Bundled open content";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compendiumCatalogPath(campaignId: string, systemId: string, search = "", type = ""): string {
  const query = new URLSearchParams();
  if (search.trim()) query.set("q", search.trim());
  if (type.trim()) query.set("type", type.trim());
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/systems/${encodeURIComponent(systemId)}/compendium${suffix}`;
}

function formatCatalogRange(start: number, end: number): string {
  return `${start + 1}-${end}`;
}
