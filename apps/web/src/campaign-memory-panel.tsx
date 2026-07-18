import type { AiMemoryFact, AiMemoryFactStatus, AiMemoryFactType, Visibility } from "@open-tabletop/core";
import { Brain, Check, History, Plus, RefreshCw, Save, Search, Shield, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiPatch, apiPost } from "./api.js";
import { campaignSearchAnchorId } from "./campaign-search-panel.js";
import { errorMessage, formatDateTime, formatNumber } from "./sheet-format.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

export type CampaignMemoryStatus = AiMemoryFactStatus;
export type CampaignMemoryView = "canon" | "review";

export type CampaignMemoryFact = AiMemoryFact;

export interface MemoryDraft {
  text: string;
  type: AiMemoryFactType;
  subject: string;
  visibility: Extract<Visibility, "public" | "gm_only">;
  confidence: string;
  source: string;
}

export function memoryFactStatus(fact: CampaignMemoryFact): CampaignMemoryStatus {
  return fact.status ?? (fact.approvedByUserId ? "approved" : "candidate");
}

export function filterCampaignMemory(facts: CampaignMemoryFact[], input: { view: CampaignMemoryView; query: string; type: string; subject: string; status: string; visibility: string }): CampaignMemoryFact[] {
  const query = input.query.trim().toLocaleLowerCase();
  const subject = input.subject.trim().toLocaleLowerCase();
  return facts
    .filter((fact) => input.view === "review" || memoryFactStatus(fact) === "approved")
    .filter((fact) => !input.type || (fact.type ?? "fact") === input.type)
    .filter((fact) => !input.status || memoryFactStatus(fact) === input.status)
    .filter((fact) => !input.visibility || fact.visibility === input.visibility)
    .filter((fact) => !subject || (fact.subject ?? "").toLocaleLowerCase().includes(subject))
    .filter((fact) => !query || [fact.text, fact.subject ?? "", fact.type ?? "", memorySourceLabel(fact)].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

const memoryTypes: Array<{ id: AiMemoryFactType; label: string }> = [
  { id: "canon_fact", label: "Canon fact" },
  { id: "rumor", label: "Rumor" },
  { id: "secret", label: "Secret" },
  { id: "npc_profile", label: "NPC profile" },
  { id: "location_profile", label: "Location" },
  { id: "faction_profile", label: "Faction" },
  { id: "quest_hook", label: "Quest hook" },
  { id: "unresolved_thread", label: "Unresolved thread" },
  { id: "character_goal", label: "Character goal" },
  { id: "session_summary", label: "Session summary" },
  { id: "timeline_event", label: "Timeline event" },
  { id: "retconned_fact", label: "Retconned fact" },
  { id: "ai_suggestion", label: "AI suggestion" }
];

export function createCampaignMemory(campaignId: string, expectedUpdatedAt: string, input: MemoryDraft): Promise<CampaignMemoryFact> {
  const payload = { ...memoryDraftPayload(input), expectedUpdatedAt };
  return apiPost<CampaignMemoryFact>(`/api/v1/campaigns/${campaignId}/ai/memory`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:create:${campaignId}`, expectedUpdatedAt, payload) });
}

export function updateCampaignMemory(factId: string, expectedUpdatedAt: string, input: MemoryDraft): Promise<CampaignMemoryFact> {
  const editableFields = memoryDraftPayload(input);
  const payload = {
    text: editableFields.text,
    type: editableFields.type,
    subject: editableFields.subject,
    visibility: editableFields.visibility,
    confidence: editableFields.confidence,
    expectedUpdatedAt
  };
  return apiPatch<CampaignMemoryFact>(`/api/v1/ai/memory/${factId}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:update:${factId}`, expectedUpdatedAt, payload) });
}

export function transitionCampaignMemory(factId: string, expectedUpdatedAt: string, action: "approve" | "reject"): Promise<CampaignMemoryFact> {
  const payload = { expectedUpdatedAt };
  return apiPost<CampaignMemoryFact>(`/api/v1/ai/memory/${factId}/${action}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:${action}:${factId}`, expectedUpdatedAt, payload) });
}

export function retconCampaignMemory(factId: string, expectedUpdatedAt: string): Promise<CampaignMemoryFact> {
  const payload = { status: "retconned", expectedUpdatedAt };
  return apiPatch<CampaignMemoryFact>(`/api/v1/ai/memory/${factId}`, payload, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:retcon:${factId}`, expectedUpdatedAt, payload) });
}

export function deleteCampaignMemory(factId: string, expectedUpdatedAt: string): Promise<unknown> {
  return apiDelete<unknown>(`/api/v1/ai/memory/${factId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, { idempotencyKey: sharedMutationIdempotencyKey(`ai-memory:delete:${factId}`, expectedUpdatedAt, {}) });
}

function memorySourceLabel(fact?: CampaignMemoryFact): string {
  return fact?.source?.label ?? fact?.source?.type ?? "";
}

export function CampaignMemoryPanel(props: {
  campaignId: string;
  campaignUpdatedAt: string;
  facts: CampaignMemoryFact[];
  canCreate: boolean;
  canReview: boolean;
  onFactsChange(facts: CampaignMemoryFact[]): void;
  onExtract(): void;
  onStatus(message: string): void;
}) {
  const [view, setView] = useState<CampaignMemoryView>(props.canReview ? "review" : "canon");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(props.canReview ? "candidate" : "");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const filtered = useMemo(() => filterCampaignMemory(props.facts, { view, query, type: typeFilter, subject: subjectFilter, status: statusFilter, visibility: visibilityFilter }), [props.facts, query, statusFilter, subjectFilter, typeFilter, view, visibilityFilter]);
  const candidateCount = props.facts.filter((fact) => memoryFactStatus(fact) === "candidate").length;
  const canonCount = props.facts.filter((fact) => memoryFactStatus(fact) === "approved").length;

  useEffect(() => {
    if (props.canReview) return;
    setView("canon");
    setStatusFilter("");
  }, [props.canReview]);

  function replaceFact(updated: CampaignMemoryFact) {
    props.onFactsChange(props.facts.some((fact) => fact.id === updated.id) ? props.facts.map((fact) => (fact.id === updated.id ? updated : fact)) : [updated, ...props.facts]);
  }

  async function createFact(input: MemoryDraft) {
    if (!input.text.trim()) return;
    setBusyId("new");
    try {
      const created = await createCampaignMemory(props.campaignId, props.campaignUpdatedAt, input);
      replaceFact(created);
      setCreating(false);
      setView("review");
      setStatusFilter("candidate");
      props.onStatus("Memory candidate added for review");
    } catch (error) {
      props.onStatus(`Memory creation failed: ${errorMessage(error)}`);
    } finally {
      setBusyId("");
    }
  }

  async function updateFact(fact: CampaignMemoryFact, input: MemoryDraft) {
    setBusyId(fact.id);
    try {
      const updated = await updateCampaignMemory(fact.id, fact.updatedAt, input);
      replaceFact(updated);
      props.onStatus("Memory details updated");
    } catch (error) {
      props.onStatus(`Memory update failed: ${errorMessage(error)}`);
    } finally {
      setBusyId("");
    }
  }

  async function transitionFact(fact: CampaignMemoryFact, action: "approve" | "reject") {
    setBusyId(fact.id);
    try {
      const updated = await transitionCampaignMemory(fact.id, fact.updatedAt, action);
      replaceFact(updated);
      props.onStatus(action === "approve" ? "Memory approved into canon" : "Memory candidate rejected");
    } catch (error) {
      props.onStatus(`Memory ${action} failed: ${errorMessage(error)}`);
    } finally {
      setBusyId("");
    }
  }

  async function retconFact(fact: CampaignMemoryFact) {
    setBusyId(fact.id);
    try {
      const updated = await retconCampaignMemory(fact.id, fact.updatedAt);
      replaceFact(updated);
      props.onStatus("Memory moved out of canon; add a replacement candidate if the fact changed");
    } catch (error) {
      props.onStatus(`Memory retcon failed: ${errorMessage(error)}`);
    } finally {
      setBusyId("");
    }
  }

  async function deleteFact(fact: CampaignMemoryFact) {
    setBusyId(fact.id);
    try {
      await deleteCampaignMemory(fact.id, fact.updatedAt);
      props.onFactsChange(props.facts.filter((item) => item.id !== fact.id));
      props.onStatus("Memory deleted");
    } catch (error) {
      props.onStatus(`Memory deletion failed: ${errorMessage(error)}`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel-stack lore-panel campaign-memory-panel" aria-label="Campaign Memory">
      <div className="lore-panel-heading">
        <div>
          <div className="section-title">Campaign Memory</div>
          <h2>Review facts. Search canon.</h2>
        </div>
        <Brain size={20} aria-hidden="true" />
      </div>

      <div className="memory-view-switch" role="tablist" aria-label="Campaign memory view">
        <button className={view === "canon" ? "tab active" : "tab"} type="button" role="tab" aria-selected={view === "canon"} onClick={() => { setView("canon"); setStatusFilter(""); }}><Search size={14} /> Canon <span>{formatNumber(canonCount)}</span></button>
        {props.canReview && <button className={view === "review" ? "tab active" : "tab"} type="button" role="tab" aria-selected={view === "review"} onClick={() => { setView("review"); setStatusFilter("candidate"); }}><Shield size={14} /> Review <span>{formatNumber(candidateCount)}</span></button>}
      </div>

      <div className="lore-filter-grid memory-filter-grid">
        <label className="lore-search-field span-full">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search campaign memory</span>
          <input aria-label="Search campaign memory" value={query} placeholder={view === "canon" ? "Search established canon" : "Search candidates and history"} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          <span>Category</span>
          <select aria-label="Filter memory category" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All</option>
            {memoryTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label>
          <span>Subject</span>
          <input aria-label="Filter memory subject" value={subjectFilter} placeholder="Person or place" onChange={(event) => setSubjectFilter(event.target.value)} />
        </label>
        {view === "review" && (
          <label>
            <span>Status</span>
            <select aria-label="Filter memory status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="candidate">Candidate</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="retconned">Retconned</option>
            </select>
          </label>
        )}
        <label>
          <span>Visibility</span>
          <select aria-label="Filter memory visibility" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
            <option value="">All</option>
            <option value="public">Players</option>
            <option value="gm_only">GM only</option>
          </select>
        </label>
      </div>

      {props.canCreate && (
        <div className="button-row wrap memory-actions">
          <button className="ghost-button" type="button" onClick={() => setCreating((open) => !open)}><Plus size={14} /> Add fact</button>
          <button className="ghost-button" type="button" onClick={props.onExtract}><RefreshCw size={14} /> Extract candidates</button>
        </div>
      )}
      {creating && <MemoryEditor busy={busyId === "new"} onSave={createFact} onCancel={() => setCreating(false)} />}

      <div className="memory-results" role="list" aria-label={view === "canon" ? "Canon search results" : "Memory review results"}>
        {filtered.length === 0 ? <div className="empty-state compact">{view === "canon" ? "No established facts match this search." : "No memory candidates match these filters."}</div> : filtered.map((fact) => (
          <MemoryCard
            key={fact.id}
            fact={fact}
            busy={busyId === fact.id}
            canReview={props.canReview}
            onUpdate={(input) => updateFact(fact, input)}
            onApprove={() => transitionFact(fact, "approve")}
            onReject={() => transitionFact(fact, "reject")}
            onRetcon={() => retconFact(fact)}
            onDelete={() => deleteFact(fact)}
          />
        ))}
      </div>
    </section>
  );
}

export function memoryDraftPayload(input: MemoryDraft) {
  const confidence = input.confidence.trim() ? Number(input.confidence) : undefined;
  return {
    text: input.text.trim(),
    type: input.type,
    subject: input.subject.trim() || null,
    visibility: input.visibility,
    ...(typeof confidence === "number" && Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(1, confidence)) } : { confidence: null }),
    source: input.source.trim() ? { type: "manual", label: input.source.trim() } : undefined
  };
}

function MemoryEditor(props: { fact?: CampaignMemoryFact; busy: boolean; onSave(input: MemoryDraft): Promise<void>; onCancel?(): void }) {
  const [draft, setDraft] = useState<MemoryDraft>(() => ({
    text: props.fact?.text ?? "",
    type: props.fact?.type ?? "canon_fact",
    subject: props.fact?.subject ?? "",
    visibility: props.fact?.visibility === "public" ? "public" : "gm_only",
    confidence: props.fact?.confidence === undefined ? "" : String(props.fact.confidence),
    source: memorySourceLabel(props.fact) || "manual"
  }));
  return (
    <form className="lore-editor memory-editor" aria-label={props.fact ? `Edit memory ${props.fact.id}` : "Add campaign memory"} onSubmit={(event) => { event.preventDefault(); void props.onSave(draft); }}>
      <label>
        <span>Fact</span>
        <textarea aria-label="Memory fact" value={draft.text} rows={4} required onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} />
      </label>
      <div className="lore-filter-grid">
        <label>
          <span>Category</span>
          <select aria-label="Memory category" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as AiMemoryFactType }))}>{memoryTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
        </label>
        <label>
          <span>Subject</span>
          <input aria-label="Memory subject" value={draft.subject} placeholder="Optional" onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} />
        </label>
        <label>
          <span>Visibility</span>
          <select aria-label="Memory visibility" value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as MemoryDraft["visibility"] }))}><option value="gm_only">GM only</option><option value="public">Players</option></select>
        </label>
        <label>
          <span>Confidence</span>
          <input aria-label="Memory confidence" type="number" min={0} max={1} step={0.05} value={draft.confidence} placeholder="0–1" onChange={(event) => setDraft((current) => ({ ...current, confidence: event.target.value }))} />
        </label>
      </div>
      <label>
        <span>{props.fact ? "Original source" : "Source note"}</span>
        <input aria-label="Memory source" value={draft.source} readOnly={Boolean(props.fact)} placeholder="Session notes, chat, manual" onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} />
      </label>
      <div className="button-row wrap">
        <button className="primary-button" type="submit" disabled={props.busy || !draft.text.trim()}><Save size={14} /> Save candidate</button>
        {props.onCancel && <button className="ghost-button" type="button" onClick={props.onCancel}><X size={14} /> Cancel</button>}
      </div>
    </form>
  );
}

function MemoryCard(props: { fact: CampaignMemoryFact; busy: boolean; canReview: boolean; onUpdate(input: MemoryDraft): Promise<void>; onApprove(): Promise<void>; onReject(): Promise<void>; onRetcon(): Promise<void>; onDelete(): Promise<void> }) {
  const status = memoryFactStatus(props.fact);
  const [editing, setEditing] = useState(false);
  const [retconArmed, setRetconArmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  return (
    <article id={campaignSearchAnchorId("memory", props.fact.id)} className={`memory-fact-card status-${status}`} role="listitem" tabIndex={-1}>
      <header>
        <div className="memory-fact-taxonomy">
          <span>{props.fact.type ?? "fact"}</span>
          {props.fact.subject && <strong>{props.fact.subject}</strong>}
        </div>
        <span className={`memory-status status-${status}`}>{status}</span>
      </header>
      <p>{props.fact.text}</p>
      <footer>
        <span>{props.fact.visibility === "public" ? "Players" : "GM only"} · {formatDateTime(props.fact.updatedAt)}</span>
        {props.fact.confidence !== undefined && <span>{Math.round(props.fact.confidence * 100)}% confidence</span>}
      </footer>
      {props.canReview && (
        <div className="button-row wrap memory-card-actions">
          {status === "candidate" && <button className="ghost-button" type="button" disabled={props.busy} onClick={() => void props.onApprove()}><Check size={14} /> Approve</button>}
          {status === "candidate" && <button className="ghost-button" type="button" disabled={props.busy} onClick={() => void props.onReject()}><X size={14} /> Reject</button>}
          {status === "candidate" && <button className="ghost-button" type="button" disabled={props.busy} onClick={() => setEditing((open) => !open)}><History size={14} /> {editing ? "Close edit" : "Edit"}</button>}
          {status === "approved" && (retconArmed
            ? <button className="danger-button" type="button" disabled={props.busy} onClick={() => void props.onRetcon()}><History size={14} /> Confirm retcon</button>
            : <button className="ghost-button" type="button" disabled={props.busy} onClick={() => setRetconArmed(true)}><History size={14} /> Retcon</button>)}
          {deleteArmed ? <button className="danger-button" type="button" disabled={props.busy} onClick={() => void props.onDelete()}><Trash2 size={14} /> Confirm</button> : <button className="ghost-button" type="button" disabled={props.busy} onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete</button>}
        </div>
      )}
      {editing && status === "candidate" && <MemoryEditor fact={props.fact} busy={props.busy} onSave={async (input) => { await props.onUpdate(input); setEditing(false); }} onCancel={() => setEditing(false)} />}
    </article>
  );
}
