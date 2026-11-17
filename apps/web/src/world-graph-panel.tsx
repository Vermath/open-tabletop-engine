import type { Visibility, WorldRecord, WorldRecordKind, WorldRecordLifecycle, WorldRelation, WorldRelationType } from "@open-tabletop/core";
import { Eye, Link2, Network, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiPatch, apiPost } from "./api.js";
import { errorMessage, formatNumber, titleCaseLabel } from "./sheet-format.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";

const worldRecordKinds: WorldRecordKind[] = ["npc", "location", "quest", "faction"];
const worldRecordLifecycles: WorldRecordLifecycle[] = ["draft", "active", "inactive", "resolved", "archived"];
const worldRelationTypes: WorldRelationType[] = ["located_in", "member_of", "allied_with", "opposed_to", "serves", "leads", "involved_in", "related_to"];

export interface WorldRecordWriteInput {
  worldId?: string;
  kind: WorldRecordKind;
  name: string;
  summary: string;
  description: string;
  lifecycle?: WorldRecordLifecycle;
  visibility: Visibility;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface WorldRelationWriteInput {
  worldId?: string;
  sourceRecordId: string;
  targetRecordId: string;
  type: WorldRelationType;
  label?: string;
  notes?: string;
  visibility: Visibility;
}

export function createWorldRecord(campaignId: string, input: WorldRecordWriteInput & { expectedCampaignUpdatedAt: string }): Promise<WorldRecord> {
  return apiPost<WorldRecord>(`/api/v1/campaigns/${campaignId}/world-records`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-record:create:${campaignId}`, input.expectedCampaignUpdatedAt, input)
  });
}

export function updateWorldRecord(recordId: string, input: Partial<WorldRecordWriteInput> & { expectedUpdatedAt: string }): Promise<WorldRecord> {
  return apiPatch<WorldRecord>(`/api/v1/world-records/${recordId}`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-record:update:${recordId}`, input.expectedUpdatedAt, input)
  });
}

export function changeWorldRecordLifecycle(recordId: string, lifecycle: WorldRecordLifecycle, expectedUpdatedAt: string): Promise<WorldRecord> {
  const input = { lifecycle, expectedUpdatedAt };
  return apiPost<WorldRecord>(`/api/v1/world-records/${recordId}/lifecycle`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-record:lifecycle:${recordId}`, expectedUpdatedAt, input)
  });
}

export function deleteWorldRecord(recordId: string, expectedUpdatedAt: string): Promise<{ record: WorldRecord; deletedRelationIds: string[] }> {
  return apiDelete<{ record: WorldRecord; deletedRelationIds: string[] }>(`/api/v1/world-records/${recordId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-record:delete:${recordId}`, expectedUpdatedAt, {})
  });
}

export function createWorldRelation(campaignId: string, input: WorldRelationWriteInput & { expectedCampaignUpdatedAt: string }): Promise<WorldRelation> {
  return apiPost<WorldRelation>(`/api/v1/campaigns/${campaignId}/world-relations`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-relation:create:${campaignId}`, input.expectedCampaignUpdatedAt, input)
  });
}

export function updateWorldRelation(relationId: string, input: Partial<WorldRelationWriteInput> & { expectedUpdatedAt: string }): Promise<WorldRelation> {
  return apiPatch<WorldRelation>(`/api/v1/world-relations/${relationId}`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-relation:update:${relationId}`, input.expectedUpdatedAt, input)
  });
}

export function deleteWorldRelation(relationId: string, expectedUpdatedAt: string): Promise<WorldRelation> {
  return apiDelete<WorldRelation>(`/api/v1/world-relations/${relationId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, {
    idempotencyKey: sharedMutationIdempotencyKey(`world-relation:delete:${relationId}`, expectedUpdatedAt, {})
  });
}

export function readableWorldGraph(records: WorldRecord[], relations: WorldRelation[], canManage: boolean): { records: WorldRecord[]; relations: WorldRelation[] } {
  const readableRecords = canManage ? records : records.filter((record) => record.visibility === "public");
  const readableIds = new Set(readableRecords.map((record) => record.id));
  return {
    records: readableRecords,
    relations: relations.filter((relation) => (canManage || relation.visibility === "public") && readableIds.has(relation.sourceRecordId) && readableIds.has(relation.targetRecordId))
  };
}

function graphMatchesWorld(worldId: string | undefined, selectedWorldId: string): boolean {
  if (selectedWorldId === "all") return true;
  if (selectedWorldId === "unfiled") return !worldId;
  return worldId === selectedWorldId;
}

function tagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

export function WorldGraphPanel(props: {
  campaignId: string;
  campaignUpdatedAt: string;
  selectedWorldId: string;
  records: WorldRecord[];
  relations: WorldRelation[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onRecordsChange(records: WorldRecord[]): void;
  onRelationsChange(relations: WorldRelation[]): void;
  onRefreshSharedState(): Promise<void>;
  onStatus(message: string): void;
}) {
  const [busyAction, setBusyAction] = useState("");
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [newKind, setNewKind] = useState<WorldRecordKind>("npc");
  const [newName, setNewName] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newVisibility, setNewVisibility] = useState<Visibility>("gm_only");
  const [newTags, setNewTags] = useState("");
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<WorldRecordKind>("npc");
  const [editSummary, setEditSummary] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<Visibility>("gm_only");
  const [editTags, setEditTags] = useState("");
  const [deleteRecordArmed, setDeleteRecordArmed] = useState(false);
  const [relationSourceId, setRelationSourceId] = useState("");
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState<WorldRelationType>("related_to");
  const [relationLabel, setRelationLabel] = useState("");
  const [relationNotes, setRelationNotes] = useState("");
  const [relationVisibility, setRelationVisibility] = useState<Visibility>("gm_only");
  const [selectedRelationId, setSelectedRelationId] = useState("");
  const [editRelationType, setEditRelationType] = useState<WorldRelationType>("related_to");
  const [editRelationLabel, setEditRelationLabel] = useState("");
  const [editRelationNotes, setEditRelationNotes] = useState("");
  const [editRelationVisibility, setEditRelationVisibility] = useState<Visibility>("gm_only");

  const graph = useMemo(() => readableWorldGraph(props.records, props.relations, props.canUpdate), [props.canUpdate, props.records, props.relations]);
  const records = graph.records.filter((record) => graphMatchesWorld(record.worldId, props.selectedWorldId));
  const recordIds = new Set(records.map((record) => record.id));
  const relations = graph.relations.filter((relation) => recordIds.has(relation.sourceRecordId) || recordIds.has(relation.targetRecordId));
  const selectedRecord = props.records.find((record) => record.id === selectedRecordId);
  const selectedRelation = props.relations.find((relation) => relation.id === selectedRelationId);
  const recordName = (recordId: string) => graph.records.find((record) => record.id === recordId)?.name ?? "Unavailable record";
  const createWorldId = props.selectedWorldId === "all" || props.selectedWorldId === "unfiled" ? undefined : props.selectedWorldId;

  useEffect(() => {
    if (selectedRecordId && !graph.records.some((record) => record.id === selectedRecordId)) setSelectedRecordId("");
  }, [graph.records, selectedRecordId]);

  useEffect(() => {
    if (!selectedRecord) return;
    setEditName(selectedRecord.name);
    setEditKind(selectedRecord.kind);
    setEditSummary(selectedRecord.summary);
    setEditDescription(selectedRecord.description);
    setEditVisibility(selectedRecord.visibility);
    setEditTags(selectedRecord.tags.join(", "));
    setDeleteRecordArmed(false);
  }, [selectedRecord?.id]);

  useEffect(() => {
    const first = records[0]?.id ?? "";
    if (!relationSourceId || !graph.records.some((record) => record.id === relationSourceId)) setRelationSourceId(first);
    const alternate = graph.records.find((record) => record.id !== (relationSourceId || first))?.id ?? "";
    if (!relationTargetId || !graph.records.some((record) => record.id === relationTargetId) || relationTargetId === relationSourceId) setRelationTargetId(alternate);
  }, [graph.records, records, relationSourceId, relationTargetId]);

  useEffect(() => {
    if (!selectedRelation) return;
    setEditRelationType(selectedRelation.type);
    setEditRelationLabel(selectedRelation.label ?? "");
    setEditRelationNotes(selectedRelation.notes ?? "");
    setEditRelationVisibility(selectedRelation.visibility);
  }, [selectedRelation?.id]);

  async function handleMutationError(label: string, error: unknown) {
    if (isStaleWriteError(error)) {
      await props.onRefreshSharedState();
      props.onStatus(`${label}: ${staleDraftPreservedMessage}`);
      return;
    }
    props.onStatus(`${label}: ${errorMessage(error)}`);
  }

  async function createRecord() {
    if (!newName.trim() || busyAction) return;
    setBusyAction("record-create");
    try {
      const record = await createWorldRecord(props.campaignId, {
        worldId: createWorldId,
        kind: newKind,
        name: newName.trim(),
        summary: newSummary.trim(),
        description: newDescription.trim(),
        lifecycle: "draft",
        visibility: newVisibility,
        tags: tagsFromInput(newTags),
        metadata: {},
        expectedCampaignUpdatedAt: props.campaignUpdatedAt
      });
      props.onRecordsChange([...props.records, record]);
      setSelectedRecordId(record.id);
      setNewName("");
      setNewSummary("");
      setNewDescription("");
      setNewTags("");
      props.onStatus(`${record.name} added to the world graph`);
      await props.onRefreshSharedState();
    } catch (error) {
      await handleMutationError("World record creation failed", error);
    } finally {
      setBusyAction("");
    }
  }

  async function saveRecord() {
    if (!selectedRecord || !editName.trim() || busyAction) return;
    setBusyAction("record-save");
    try {
      const updated = await updateWorldRecord(selectedRecord.id, {
        kind: editKind,
        name: editName.trim(),
        summary: editSummary.trim(),
        description: editDescription.trim(),
        visibility: editVisibility,
        tags: tagsFromInput(editTags),
        expectedUpdatedAt: selectedRecord.updatedAt
      });
      props.onRecordsChange(props.records.map((record) => record.id === updated.id ? updated : record));
      props.onStatus(`${updated.name} updated`);
    } catch (error) {
      await handleMutationError("World record update failed", error);
    } finally {
      setBusyAction("");
    }
  }

  async function setLifecycle(lifecycle: WorldRecordLifecycle) {
    if (!selectedRecord || busyAction || lifecycle === selectedRecord.lifecycle) return;
    setBusyAction("record-lifecycle");
    try {
      const updated = await changeWorldRecordLifecycle(selectedRecord.id, lifecycle, selectedRecord.updatedAt);
      props.onRecordsChange(props.records.map((record) => record.id === updated.id ? updated : record));
      props.onStatus(`${updated.name} marked ${titleCaseLabel(updated.lifecycle)}`);
    } catch (error) {
      await handleMutationError("World record lifecycle change failed", error);
    } finally {
      setBusyAction("");
    }
  }

  async function removeRecord() {
    if (!selectedRecord || busyAction) return;
    setBusyAction("record-delete");
    try {
      const deleted = await deleteWorldRecord(selectedRecord.id, selectedRecord.updatedAt);
      props.onRecordsChange(props.records.filter((record) => record.id !== deleted.record.id));
      props.onRelationsChange(props.relations.filter((relation) => !deleted.deletedRelationIds.includes(relation.id)));
      setSelectedRecordId("");
      props.onStatus(`${deleted.record.name} and ${formatNumber(deleted.deletedRelationIds.length)} attached relations removed`);
    } catch (error) {
      await handleMutationError("World record deletion failed", error);
    } finally {
      setDeleteRecordArmed(false);
      setBusyAction("");
    }
  }

  async function createRelation() {
    if (!relationSourceId || !relationTargetId || relationSourceId === relationTargetId || busyAction) return;
    setBusyAction("relation-create");
    try {
      const relation = await createWorldRelation(props.campaignId, {
        worldId: createWorldId,
        sourceRecordId: relationSourceId,
        targetRecordId: relationTargetId,
        type: relationType,
        label: relationLabel.trim() || undefined,
        notes: relationNotes.trim() || undefined,
        visibility: relationVisibility,
        expectedCampaignUpdatedAt: props.campaignUpdatedAt
      });
      props.onRelationsChange([...props.relations, relation]);
      setSelectedRelationId(relation.id);
      setRelationLabel("");
      setRelationNotes("");
      props.onStatus(`Relation added: ${recordName(relation.sourceRecordId)} ${titleCaseLabel(relation.type)} ${recordName(relation.targetRecordId)}`);
      await props.onRefreshSharedState();
    } catch (error) {
      await handleMutationError("World relation creation failed", error);
    } finally {
      setBusyAction("");
    }
  }

  async function saveRelation() {
    if (!selectedRelation || busyAction) return;
    setBusyAction("relation-save");
    try {
      const updated = await updateWorldRelation(selectedRelation.id, {
        type: editRelationType,
        label: editRelationLabel.trim() || undefined,
        notes: editRelationNotes.trim() || undefined,
        visibility: editRelationVisibility,
        expectedUpdatedAt: selectedRelation.updatedAt
      });
      props.onRelationsChange(props.relations.map((relation) => relation.id === updated.id ? updated : relation));
      props.onStatus("World relation updated");
    } catch (error) {
      await handleMutationError("World relation update failed", error);
    } finally {
      setBusyAction("");
    }
  }

  async function removeRelation(relation: WorldRelation) {
    if (busyAction) return;
    setBusyAction(`relation-delete:${relation.id}`);
    try {
      const deleted = await deleteWorldRelation(relation.id, relation.updatedAt);
      props.onRelationsChange(props.relations.filter((candidate) => candidate.id !== deleted.id));
      if (selectedRelationId === deleted.id) setSelectedRelationId("");
      props.onStatus("World relation removed");
    } catch (error) {
      await handleMutationError("World relation deletion failed", error);
    } finally {
      setBusyAction("");
    }
  }

  return (
    <section className="world-graph-panel" aria-label="Typed world graph">
      <div className="lore-panel-heading">
        <div><span className="section-title">World graph</span><h3>People, places, quests &amp; factions</h3></div>
        <Network size={19} aria-hidden="true" />
      </div>
      <p className="account-summary">First-class campaign records with explicit lifecycle, visibility, and typed connections.</p>

      <div className="world-record-grid" aria-label="World records">
        {records.length === 0 ? <div className="empty-state compact">No graph records in this atlas view.</div> : records.map((record) => (
          <button className={selectedRecordId === record.id ? "world-record-card active" : "world-record-card"} type="button" key={record.id} aria-pressed={selectedRecordId === record.id} onClick={() => setSelectedRecordId(record.id)}>
            <span>{titleCaseLabel(record.kind)}</span>
            <strong>{record.name}</strong>
            <small>{titleCaseLabel(record.lifecycle)} · {record.visibility === "public" ? "Players" : "GM only"}</small>
            {record.summary && <p>{record.summary}</p>}
          </button>
        ))}
      </div>

      {selectedRecord && (
        <form className="world-graph-editor" aria-label={`Edit world record ${selectedRecord.name}`} onSubmit={(event) => { event.preventDefault(); void saveRecord(); }}>
          <div className="world-graph-editor-row">
            <label><span>Kind</span><select value={editKind} disabled={!props.canUpdate || Boolean(busyAction)} onChange={(event) => setEditKind(event.target.value as WorldRecordKind)}>{worldRecordKinds.map((kind) => <option key={kind} value={kind}>{titleCaseLabel(kind)}</option>)}</select></label>
            <label><span>Lifecycle</span><select value={selectedRecord.lifecycle} disabled={!props.canUpdate || Boolean(busyAction)} onChange={(event) => void setLifecycle(event.target.value as WorldRecordLifecycle)}>{worldRecordLifecycles.map((lifecycle) => <option key={lifecycle} value={lifecycle}>{titleCaseLabel(lifecycle)}</option>)}</select></label>
            <label><span>Visibility</span><select value={editVisibility} disabled={!props.canUpdate || Boolean(busyAction)} onChange={(event) => setEditVisibility(event.target.value as Visibility)}><option value="gm_only">GM only</option><option value="public">Players</option></select></label>
          </div>
          <label><span>Name</span><input value={editName} readOnly={!props.canUpdate} required onChange={(event) => setEditName(event.target.value)} /></label>
          <label><span>Summary</span><input value={editSummary} readOnly={!props.canUpdate} maxLength={500} onChange={(event) => setEditSummary(event.target.value)} /></label>
          <label><span>Description</span><textarea value={editDescription} readOnly={!props.canUpdate} rows={4} onChange={(event) => setEditDescription(event.target.value)} /></label>
          <label><span>Tags</span><input value={editTags} readOnly={!props.canUpdate} placeholder="ally, harbor, chapter 2" onChange={(event) => setEditTags(event.target.value)} /></label>
          {props.canUpdate && <div className="button-row wrap"><button className="ghost-button" type="submit" disabled={Boolean(busyAction) || !editName.trim()}><Save size={14} /> Save record</button>{props.canDelete && (deleteRecordArmed ? <button className="danger-button" type="button" disabled={Boolean(busyAction)} onClick={() => void removeRecord()}><Trash2 size={14} /> Confirm delete</button> : <button className="ghost-button" type="button" disabled={Boolean(busyAction)} onClick={() => setDeleteRecordArmed(true)}><Trash2 size={14} /> Delete record</button>)}</div>}
        </form>
      )}

      {props.canCreate && (
        <details className="lore-create-drawer">
          <summary><Plus size={14} aria-hidden="true" /> Add graph record</summary>
          <form onSubmit={(event) => { event.preventDefault(); void createRecord(); }}>
            <div className="world-graph-editor-row">
              <label><span>Kind</span><select value={newKind} onChange={(event) => setNewKind(event.target.value as WorldRecordKind)}>{worldRecordKinds.map((kind) => <option key={kind} value={kind}>{titleCaseLabel(kind)}</option>)}</select></label>
              <label><span>Visibility</span><select value={newVisibility} onChange={(event) => setNewVisibility(event.target.value as Visibility)}><option value="gm_only">GM only</option><option value="public">Players</option></select></label>
            </div>
            <label><span>Name</span><input value={newName} required maxLength={160} onChange={(event) => setNewName(event.target.value)} /></label>
            <label><span>Summary</span><input value={newSummary} maxLength={500} onChange={(event) => setNewSummary(event.target.value)} /></label>
            <label><span>Description</span><textarea value={newDescription} rows={3} onChange={(event) => setNewDescription(event.target.value)} /></label>
            <label><span>Tags</span><input value={newTags} placeholder="comma-separated" onChange={(event) => setNewTags(event.target.value)} /></label>
            <button className="primary-button" type="submit" disabled={Boolean(busyAction) || !newName.trim()}><Plus size={14} /> Create record</button>
          </form>
        </details>
      )}

      <section className="world-relations" aria-label="Typed world relations">
        <div className="lore-list-heading"><span><Link2 size={14} aria-hidden="true" /> Typed relations</span><strong>{formatNumber(relations.length)}</strong></div>
        {relations.length === 0 ? <div className="empty-state compact">No typed relations in this view.</div> : relations.map((relation) => (
          <article className={selectedRelationId === relation.id ? "world-relation-row active" : "world-relation-row"} key={relation.id}>
            <button type="button" onClick={() => setSelectedRelationId(relation.id)}>
              <strong>{recordName(relation.sourceRecordId)}</strong><span>{relation.label || titleCaseLabel(relation.type)}</span><strong>{recordName(relation.targetRecordId)}</strong>
              <small><Eye size={12} aria-hidden="true" /> {relation.visibility === "public" ? "Players" : "GM only"}</small>
            </button>
            {props.canUpdate && <button className="icon-button" type="button" aria-label={`Delete relation from ${recordName(relation.sourceRecordId)} to ${recordName(relation.targetRecordId)}`} disabled={Boolean(busyAction)} onClick={() => void removeRelation(relation)}><Trash2 size={14} /></button>}
          </article>
        ))}
      </section>

      {selectedRelation && props.canUpdate && (
        <form className="world-graph-editor" aria-label="Edit selected world relation" onSubmit={(event) => { event.preventDefault(); void saveRelation(); }}>
          <div className="world-graph-editor-row">
            <label><span>Type</span><select value={editRelationType} onChange={(event) => setEditRelationType(event.target.value as WorldRelationType)}>{worldRelationTypes.map((type) => <option key={type} value={type}>{titleCaseLabel(type)}</option>)}</select></label>
            <label><span>Visibility</span><select value={editRelationVisibility} onChange={(event) => setEditRelationVisibility(event.target.value as Visibility)}><option value="gm_only">GM only</option><option value="public">Players</option></select></label>
          </div>
          <label><span>Label</span><input value={editRelationLabel} maxLength={160} onChange={(event) => setEditRelationLabel(event.target.value)} /></label>
          <label><span>Notes</span><textarea value={editRelationNotes} rows={3} maxLength={2000} onChange={(event) => setEditRelationNotes(event.target.value)} /></label>
          <button className="ghost-button" type="submit" disabled={Boolean(busyAction)}><Save size={14} /> Save relation</button>
        </form>
      )}

      {props.canUpdate && graph.records.length >= 2 && (
        <details className="lore-create-drawer">
          <summary><Link2 size={14} aria-hidden="true" /> Connect records</summary>
          <form onSubmit={(event) => { event.preventDefault(); void createRelation(); }}>
            <div className="world-graph-editor-row">
              <label><span>From</span><select value={relationSourceId} onChange={(event) => setRelationSourceId(event.target.value)}>{graph.records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
              <label><span>Relation</span><select value={relationType} onChange={(event) => setRelationType(event.target.value as WorldRelationType)}>{worldRelationTypes.map((type) => <option key={type} value={type}>{titleCaseLabel(type)}</option>)}</select></label>
              <label><span>To</span><select value={relationTargetId} onChange={(event) => setRelationTargetId(event.target.value)}>{graph.records.filter((record) => record.id !== relationSourceId).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
            </div>
            <label><span>Label</span><input value={relationLabel} maxLength={160} placeholder="Optional display label" onChange={(event) => setRelationLabel(event.target.value)} /></label>
            <label><span>Notes</span><textarea value={relationNotes} rows={2} maxLength={2000} onChange={(event) => setRelationNotes(event.target.value)} /></label>
            <label><span>Visibility</span><select value={relationVisibility} onChange={(event) => setRelationVisibility(event.target.value as Visibility)}><option value="gm_only">GM only</option><option value="public">Players</option></select></label>
            <button className="primary-button" type="submit" disabled={Boolean(busyAction) || !relationSourceId || !relationTargetId || relationSourceId === relationTargetId}><Link2 size={14} /> Create relation</button>
          </form>
        </details>
      )}
    </section>
  );
}
