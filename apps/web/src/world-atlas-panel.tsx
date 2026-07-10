import type { Scene } from "@open-tabletop/core";
import { Globe2, MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiPatch, apiPost } from "./api.js";
import { errorMessage, formatNumber } from "./sheet-format.js";

export interface WorldAtlasWorld {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
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

export function filterWorldAtlas(worlds: WorldAtlasWorld[], query: string): WorldAtlasWorld[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return worlds;
  return worlds.filter((world) => [world.name, world.description].some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function createWorldAtlasWorld(campaignId: string, input: { name: string; description: string }): Promise<WorldAtlasWorld> {
  return apiPost<WorldAtlasWorld>(`/api/v1/campaigns/${campaignId}/worlds`, input);
}

export function updateWorldAtlasWorld(worldId: string, input: { name: string; description: string }): Promise<WorldAtlasWorld> {
  return apiPatch<WorldAtlasWorld>(`/api/v1/worlds/${worldId}`, input);
}

export function deleteWorldAtlasWorld(worldId: string): Promise<unknown> {
  return apiDelete<unknown>(`/api/v1/worlds/${worldId}`);
}

export function assignSceneToWorld(sceneId: string, worldId: string): Promise<Scene> {
  return apiPatch<Scene>(`/api/v1/scenes/${sceneId}`, { worldId: worldId || null });
}

export function WorldAtlasPanel(props: {
  campaignId: string;
  worlds: WorldAtlasWorld[];
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
  onSelectWorld(worldId: WorldAtlasFilter): void;
  onSceneUpdated(scene: Scene): void;
  onStatus(message: string): void;
}) {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const selectedWorld = props.worlds.find((world) => world.id === props.selectedWorldId);
  const filteredWorlds = useMemo(() => filterWorldAtlas(props.worlds, query), [props.worlds, query]);
  const visibleScenes = props.scenes.filter((scene) => worldFilterMatchesScene(scene, props.selectedWorldId));

  useEffect(() => {
    setEditName(selectedWorld?.name ?? "");
    setEditDescription(selectedWorld?.description ?? "");
    setDeleteArmed(false);
  }, [selectedWorld?.description, selectedWorld?.id, selectedWorld?.name]);

  async function createWorld() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const world = await createWorldAtlasWorld(props.campaignId, {
        name,
        description: newDescription.trim()
      });
      props.onWorldsChange([...props.worlds, world].sort((left, right) => left.name.localeCompare(right.name)));
      props.onSelectWorld(world.id);
      setNewName("");
      setNewDescription("");
      props.onStatus(`${world.name} added to the atlas`);
    } catch (error) {
      props.onStatus(`World creation failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveWorld() {
    if (!selectedWorld || !editName.trim() || busy) return;
    setBusy(true);
    try {
      const world = await updateWorldAtlasWorld(selectedWorld.id, {
        name: editName.trim(),
        description: editDescription.trim()
      });
      props.onWorldsChange(props.worlds.map((item) => (item.id === world.id ? world : item)).sort((left, right) => left.name.localeCompare(right.name)));
      props.onStatus(`${world.name} updated`);
    } catch (error) {
      props.onStatus(`World update failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorld() {
    if (!selectedWorld || busy) return;
    setBusy(true);
    try {
      await deleteWorldAtlasWorld(selectedWorld.id);
      const detachedAt = new Date().toISOString();
      for (const scene of props.scenes.filter((item) => sceneWorldId(item) === selectedWorld.id)) {
        props.onSceneUpdated({ ...scene, worldId: undefined, updatedAt: detachedAt } as SceneWithWorld);
      }
      props.onWorldsChange(props.worlds.filter((item) => item.id !== selectedWorld.id));
      props.onSelectWorld("all");
      props.onStatus(`${selectedWorld.name} removed; its scenes are now unfiled`);
    } catch (error) {
      props.onStatus(`World deletion failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setDeleteArmed(false);
    }
  }

  async function assignScene(scene: Scene, worldId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await assignSceneToWorld(scene.id, worldId);
      props.onSceneUpdated(updated);
      props.onStatus(`${scene.name} moved to ${props.worlds.find((world) => world.id === worldId)?.name ?? "Unfiled"}`);
    } catch (error) {
      props.onStatus(`Scene assignment failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-stack lore-panel world-atlas-panel" aria-label="World Atlas">
      <div className="lore-panel-heading">
        <div>
          <div className="section-title">World Atlas</div>
          <h2>Places &amp; prep scenes</h2>
        </div>
        <Globe2 size={20} aria-hidden="true" />
      </div>
      <p className="account-summary">Organize prep by world without changing which scene is live for players.</p>

      {props.loadState === "loading" && <div className="lore-load-state" role="status">Loading worlds…</div>}
      {props.loadState === "error" && (
        <div className="lore-load-state error" role="alert">
          <span>{props.loadError || "Worlds could not be loaded."}</span>
          {props.onRetryLoad && <button className="ghost-button small" type="button" onClick={props.onRetryLoad}>Retry</button>}
        </div>
      )}

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

      {selectedWorld && (
        <form className="lore-editor" aria-label={`Edit world ${selectedWorld.name}`} onSubmit={(event) => { event.preventDefault(); void saveWorld(); }}>
          <label>
            <span>World name</span>
            <input aria-label="World name" value={editName} readOnly={!props.canUpdateWorld} required onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label>
            <span>Description</span>
            <textarea aria-label="World description" value={editDescription} readOnly={!props.canUpdateWorld} rows={3} placeholder="Tone, region, era, or campaign thread" onChange={(event) => setEditDescription(event.target.value)} />
          </label>
          <div className="button-row wrap">
            <button className="ghost-button" type="submit" disabled={!props.canUpdateWorld || busy || !editName.trim()}><Save size={14} /> Save world</button>
            {props.canDelete && (deleteArmed ? (
              <button className="danger-button" type="button" disabled={busy} onClick={() => void deleteWorld()}><Trash2 size={14} /> Confirm delete</button>
            ) : (
              <button className="ghost-button" type="button" disabled={busy} onClick={() => setDeleteArmed(true)}><Trash2 size={14} /> Delete</button>
            ))}
          </div>
        </form>
      )}

      <section className="atlas-scene-list" aria-label="World scenes">
        <div className="lore-list-heading">
          <span>{props.selectedWorldId === "all" ? "All prep scenes" : props.selectedWorldId === "unfiled" ? "Unfiled scenes" : selectedWorld?.name ?? "World"}</span>
          <strong>{formatNumber(visibleScenes.length)}</strong>
        </div>
        {visibleScenes.length === 0 ? (
          <div className="empty-state compact">No scenes in this view.</div>
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

      {props.canCreate && (
        <details className="lore-create-drawer" open={props.worlds.length === 0}>
          <summary><Plus size={14} aria-hidden="true" /> Add a world</summary>
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
    </section>
  );
}
