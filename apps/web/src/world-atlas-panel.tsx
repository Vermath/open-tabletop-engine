import type { Scene, WorldRecord, WorldRelation } from "@open-tabletop/core";
import { Globe2, MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiPatch, apiPost } from "./api.js";
import { errorMessage, formatNumber } from "./sheet-format.js";
import { isStaleWriteError, sharedMutationIdempotencyKey, staleDraftPreservedMessage } from "./shared-mutation.js";
import { WorldGraphPanel } from "./world-graph-panel.js";

export interface WorldAtlasWorld {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export function worldDraftFromWorld(world?: WorldAtlasWorld) {
  return { id: world?.id, expectedUpdatedAt: world?.updatedAt, name: world?.name ?? "", description: world?.description ?? "" };
}

export type WorldAtlasFilter = "all" | "unfiled" | string;
export type LoreCollectionLoadState = "idle" | "loading" | "ready" | "error";

type SceneWithWorld = Scene & { worldId?: string };

export function sceneWorldId(scene: Scene): string {
  return (scene as SceneWithWorld).worldId ?? "";
}

export function worldFilterMatchesScene(scene: Scene, filter: WorldAtlasFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unfiled") return !sceneWorldId(scene);
  return sceneWorldId(scene) === filter;
}

export function selectedSceneForWorldFilter(scenes: Scene[], selectedSceneId: string, filter: WorldAtlasFilter): Scene | undefined {
  const matchingScenes = scenes.filter((scene) => worldFilterMatchesScene(scene, filter));
  return matchingScenes.find((scene) => scene.id === selectedSceneId)
    ?? matchingScenes.find((scene) => scene.active)
    ?? matchingScenes[0];
}

export function canonicalSceneIdForWorldFilter(scenes: Scene[], selectedSceneId: string, filter: WorldAtlasFilter): string {
  return selectedSceneForWorldFilter(scenes, selectedSceneId, filter)?.id ?? "";
}

export function filterWorldAtlas(worlds: WorldAtlasWorld[], query: string): WorldAtlasWorld[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return worlds;
  return worlds.filter((world) => [world.name, world.description].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function createWorldAtlasWorld(campaignId: string, input: { name: string; description: string; expectedUpdatedAt: string }): Promise<WorldAtlasWorld> {
  return apiPost<WorldAtlasWorld>(`/api/v1/campaigns/${campaignId}/worlds`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world:create:${campaignId}`, input.expectedUpdatedAt, input)
  });
}

export function updateWorldAtlasWorld(worldId: string, input: { name: string; description: string; expectedUpdatedAt: string }): Promise<WorldAtlasWorld> {
  return apiPatch<WorldAtlasWorld>(`/api/v1/worlds/${worldId}`, input, {
    idempotencyKey: sharedMutationIdempotencyKey(`world:update:${worldId}`, input.expectedUpdatedAt, input)
  });
}

export function deleteWorldAtlasWorld(worldId: string, expectedUpdatedAt: string): Promise<unknown> {
  return apiDelete<unknown>(`/api/v1/worlds/${worldId}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, {
    idempotencyKey: sharedMutationIdempotencyKey(`world:delete:${worldId}`, expectedUpdatedAt, {})
  });
}

export function assignSceneToWorld(sceneId: string, worldId: string, expectedUpdatedAt: string): Promise<Scene> {
  const payload = { worldId: worldId || null, expectedUpdatedAt };
  return apiPatch<Scene>(`/api/v1/scenes/${sceneId}`, payload, {
    idempotencyKey: sharedMutationIdempotencyKey(`scene:world:${sceneId}`, expectedUpdatedAt, payload)
  });
}

export function WorldAtlasPanel(props: {
  campaignId: string;
  campaignUpdatedAt: string;
  worlds: WorldAtlasWorld[];
  worldRecords: WorldRecord[];
  worldRelations: WorldRelation[];
  scenes: Scene[];
  selectedWorldId: WorldAtlasFilter;
  canCreate: boolean;
  canUpdateWorld: boolean;
  canAssignScenes: boolean;
  canDelete: boolean;
  loadState?: LoreCollectionLoadState;
  loadError?: string;
  onRetryLoad?(): void;
  onWorldsChange(worlds: WorldAtlasWorld[]): void;
  onWorldRecordsChange(records: WorldRecord[]): void;
  onWorldRelationsChange(relations: WorldRelation[]): void;
  onSelectWorld(worldId: WorldAtlasFilter): void;
  onSceneUpdated(scene: Scene): void;
  onRefreshSharedState(): Promise<void>;
  onStatus(message: string): void;
}) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const selectedWorld = props.worlds.find((world) => world.id === props.selectedWorldId);
  const [worldDraft, setWorldDraft] = useState(() => worldDraftFromWorld(selectedWorld));
  const [worldBaseline, setWorldBaseline] = useState(worldDraft);
  const worldDirty = JSON.stringify(worldDraft) !== JSON.stringify(worldBaseline);
  const worldStale = Boolean(selectedWorld && (selectedWorld.id !== worldDraft.id || selectedWorld.updatedAt !== worldDraft.expectedUpdatedAt));
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const filteredWorlds = useMemo(() => filterWorldAtlas(props.worlds, query), [props.worlds, query]);
  const visibleScenes = props.scenes.filter((scene) => worldFilterMatchesScene(scene, props.selectedWorldId));
  const worldsRef = useRef(props.worlds);
  worldsRef.current = props.worlds;

  function replaceWorld(updated: WorldAtlasWorld, created = false): WorldAtlasWorld {
    const current = worldsRef.current;
    const existing = current.find((world) => world.id === updated.id);
    const newest = existing && existing.updatedAt > updated.updatedAt ? existing : updated;
    const next = (existing ? current.map((world) => world.id === updated.id ? newest : world) : created ? [...current, newest] : [...current])
      .sort((left, right) => left.name.localeCompare(right.name));
    worldsRef.current = next;
    props.onWorldsChange(next);
    return newest;
  }

  useEffect(() => {
    if (selectedWorld?.id === worldDraft.id && (worldDirty || selectedWorld?.updatedAt === worldBaseline.expectedUpdatedAt)) return;
    const latest = worldDraftFromWorld(selectedWorld);
    setWorldDraft(latest);
    setWorldBaseline(latest);
    setDeleteArmed(false);
  }, [selectedWorld, worldDraft.id, worldDirty, worldBaseline.expectedUpdatedAt]);

  function reloadWorldDraft() {
    if (busy) return;
    const latest = worldDraftFromWorld(selectedWorld);
    setWorldDraft(latest);
    setWorldBaseline(latest);
  }

  async function handleMutationError(prefix: string, error: unknown) {
    if (isStaleWriteError(error)) {
      await props.onRefreshSharedState();
      props.onStatus(`${prefix}: ${staleDraftPreservedMessage}`);
      return;
    }
    props.onStatus(`${prefix}: ${errorMessage(error)}`);
  }

  async function createWorld() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const world = await createWorldAtlasWorld(props.campaignId, {
        name,
        description: newDescription.trim(),
        expectedUpdatedAt: props.campaignUpdatedAt
      });
      replaceWorld(world, true);
      props.onSelectWorld(world.id);
      setNewName("");
      setNewDescription("");
      props.onStatus(`${world.name} added to the atlas`);
      await props.onRefreshSharedState();
    } catch (error) {
      await handleMutationError("World creation failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function saveWorld() {
    if (!selectedWorld || !worldDraft.name.trim() || busy || worldStale || !worldDraft.expectedUpdatedAt || !props.canUpdateWorld) return;
    setBusy(true);
    try {
      const world = await updateWorldAtlasWorld(selectedWorld.id, {
        name: worldDraft.name.trim(),
        description: worldDraft.description.trim(),
        expectedUpdatedAt: worldDraft.expectedUpdatedAt
      });
      const newest = replaceWorld(world);
      const savedDraft = worldDraftFromWorld(newest);
      setWorldDraft(savedDraft);
      setWorldBaseline(savedDraft);
      props.onStatus(`${world.name} updated`);
    } catch (error) {
      await handleMutationError("World update failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorld() {
    if (!selectedWorld || busy) return;
    setBusy(true);
    try {
      await deleteWorldAtlasWorld(selectedWorld.id, selectedWorld.updatedAt);
      const remaining = worldsRef.current.filter((item) => item.id !== selectedWorld.id);
      worldsRef.current = remaining;
      props.onWorldsChange(remaining);
      props.onSelectWorld("all");
      props.onStatus(`${selectedWorld.name} removed; its scenes are now unfiled`);
      await props.onRefreshSharedState();
    } catch (error) {
      await handleMutationError("World deletion failed", error);
    } finally {
      setBusy(false);
      setDeleteArmed(false);
    }
  }

  async function assignScene(scene: Scene, worldId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await assignSceneToWorld(scene.id, worldId, scene.updatedAt);
      props.onSceneUpdated(updated);
      props.onStatus(`${scene.name} moved to ${props.worlds.find((world) => world.id === worldId)?.name ?? "Unfiled"}`);
    } catch (error) {
      await handleMutationError("Scene assignment failed", error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-stack lore-panel world-atlas-panel" aria-label="World Atlas">
      <div className="lore-page-intro">
        <div className="lore-panel-heading">
          <div>
            <div className="section-title">World Atlas</div>
            <h2>Your worlds &amp; scenes</h2>
          </div>
          <Globe2 size={20} aria-hidden="true" />
        </div>
        <p className="account-summary">Group scenes by world, then build out the people, places, and connections in your campaign.</p>
      </div>

      {props.loadState === "loading" && <div className="lore-load-state" role="status">Loading worlds…</div>}
      {props.loadState === "error" && (
        <div className="lore-load-state error" role="alert">
          <span>{props.loadError || "Worlds could not be loaded."}</span>
          {props.onRetryLoad && <button className="ghost-button small" type="button" onClick={props.onRetryLoad}>Retry</button>}
        </div>
      )}

      <div className="atlas-search">
        <label className="lore-search-field">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search worlds</span>
          <input aria-label="Search worlds" value={query} placeholder="Search the atlas" onChange={(event) => setQuery(event.target.value)} />
        </label>

        <div className="atlas-filter-strip" role="group" aria-label="Filter prep scenes by world">
          <button className={props.selectedWorldId === "all" ? "atlas-filter active" : "atlas-filter"} type="button" aria-pressed={props.selectedWorldId === "all"} onClick={() => props.onSelectWorld("all")}>
            All <span>{formatNumber(props.scenes.length)}</span>
          </button>
          <button className={props.selectedWorldId === "unfiled" ? "atlas-filter active" : "atlas-filter"} type="button" aria-pressed={props.selectedWorldId === "unfiled"} onClick={() => props.onSelectWorld("unfiled")}>
            Unfiled <span>{formatNumber(props.scenes.filter((scene) => !sceneWorldId(scene)).length)}</span>
          </button>
          {filteredWorlds.map((world) => (
            <button className={props.selectedWorldId === world.id ? "atlas-filter active" : "atlas-filter"} type="button" aria-pressed={props.selectedWorldId === world.id} key={world.id} onClick={() => props.onSelectWorld(world.id)}>
              {world.name} <span>{formatNumber(props.scenes.filter((scene) => sceneWorldId(scene) === world.id).length)}</span>
            </button>
          ))}
        </div>
        {query.trim() && filteredWorlds.length === 0 && (
          <div className="empty-state compact lore-empty-state">
            <Search size={24} aria-hidden="true" />
            <strong>No worlds match this search</strong>
            <p>Try another name or description to find a world.</p>
            <button className="ghost-button small" type="button" onClick={() => setQuery("")}>Clear search</button>
          </div>
        )}
      </div>

      {selectedWorld && (
        <form className="lore-editor" aria-label={`Edit world ${selectedWorld.name}`} onSubmit={(event) => { event.preventDefault(); void saveWorld(); }}>
          {worldStale && worldDirty && (
            <div className="lore-load-state error editor-conflict" role="alert">
              <span>This world changed elsewhere. Your draft is preserved; review the latest saved content before saving.</span>
              <details><summary>Review latest saved world</summary><p><strong>{selectedWorld.name}</strong></p><p>{selectedWorld.description || "No description"}</p></details>
              <button className="ghost-button small" type="button" disabled={busy} onClick={reloadWorldDraft}>Discard draft and load latest</button>
            </div>
          )}
          <label>
            <span>World name</span>
            <input aria-label="World name" value={worldDraft.name} readOnly={!props.canUpdateWorld} disabled={busy} required onChange={(event) => setWorldDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>Description</span>
            <textarea aria-label="World description" value={worldDraft.description} readOnly={!props.canUpdateWorld} disabled={busy} rows={3} placeholder="Tone, region, era, or campaign thread" onChange={(event) => setWorldDraft((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <div className="button-row wrap">
            <button className="ghost-button" type="submit" disabled={!props.canUpdateWorld || busy || worldStale || !worldDraft.name.trim()}><Save size={14} /> Save world</button>
            {props.canDelete && (deleteArmed ? (
              <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteWorld()}><Trash2 size={14} /> Confirm delete</button>
            ) : (
              <button className="ghost-button" type="button" disabled={busy} onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete</button>
            ))}
          </div>
        </form>
      )}

      {props.canCreate && (
        <details className="lore-create-drawer atlas-create-world" open={props.worlds.length === 0}>
          <summary><Plus size={14} aria-hidden="true" /> Add a world</summary>
          <p className="account-summary">{props.worlds.length === 0 ? "Create your first world to organize its scenes and campaign lore." : "Add another setting, region, or plane to your campaign."}</p>
          <form onSubmit={(event) => { event.preventDefault(); void createWorld(); }}>
            <label>
              <span>Name</span>
              <input aria-label="New world name" value={newName} required placeholder="The Ashen Coast" onChange={(event) => setNewName(event.target.value)} />
            </label>
            <label>
              <span>Description</span>
              <textarea aria-label="New world description" value={newDescription} rows={3} placeholder="A short atlas note" onChange={(event) => setNewDescription(event.target.value)} />
            </label>
            <button className="primary-button" type="submit" disabled={busy || !newName.trim()}><Plus size={14} /> Create world</button>
          </form>
        </details>
      )}

      <section className="atlas-scene-list" aria-label="World scenes">
        <div className="lore-list-heading">
          <span>{props.selectedWorldId === "all" ? "All prep scenes" : props.selectedWorldId === "unfiled" ? "Unfiled scenes" : selectedWorld?.name ?? "World"}</span>
          <strong>{formatNumber(visibleScenes.length)}</strong>
        </div>
        {visibleScenes.length === 0 ? (
          <div className="empty-state compact lore-empty-state">
            <MapPin size={26} aria-hidden="true" />
            <strong>{props.scenes.length === 0 ? "No campaign scenes yet" : "No scenes in this view"}</strong>
            <p>{props.scenes.length === 0 ? "Scenes added to this campaign will appear here." : props.canAssignScenes ? "Open all scenes and use a scene's world menu to move it here." : "Scenes assigned to this world will appear here."}</p>
            {props.scenes.length > 0 && <button className="ghost-button small" type="button" onClick={() => props.onSelectWorld("all")}>Show all scenes</button>}
          </div>
        ) : visibleScenes.map((scene) => (
          <article className="atlas-scene-row" key={scene.id}>
            <div>
              <strong><MapPin size={13} aria-hidden="true" /> {scene.name}</strong>
              <span>{scene.folder || "Unfiled"}{scene.active ? " · live" : " · prep"}</span>
            </div>
            <label>
              <span className="sr-only">World for {scene.name}</span>
              <select aria-label={`World for ${scene.name}`} value={sceneWorldId(scene)} disabled={!props.canAssignScenes || busy} onChange={(event) => void assignScene(scene, event.target.value)}>
                <option value="">Unfiled</option>
                {props.worlds.map((world) => <option key={world.id} value={world.id}>{world.name}</option>)}
              </select>
            </label>
          </article>
        ))}
      </section>

      <WorldGraphPanel
        campaignId={props.campaignId}
        campaignUpdatedAt={props.campaignUpdatedAt}
        selectedWorldId={props.selectedWorldId}
        records={props.worldRecords}
        relations={props.worldRelations}
        canCreate={props.canCreate}
        canUpdate={props.canUpdateWorld}
        canDelete={props.canDelete}
        onRecordsChange={props.onWorldRecordsChange}
        onRelationsChange={props.onWorldRelationsChange}
        onRefreshSharedState={props.onRefreshSharedState}
        onStatus={props.onStatus}
      />
    </section>
  );
}
