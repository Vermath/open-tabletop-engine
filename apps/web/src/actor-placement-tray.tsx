import type { Actor } from "@open-tabletop/core";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "./sheet-format.js";
import { setTokenDropPreview, writeTokenDropData } from "./token-drag.js";

export function filterActorPlacementActors(actors: Actor[], search: string): Actor[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return actors.filter((actor) => !normalizedSearch || actor.name.toLocaleLowerCase().includes(normalizedSearch));
}

export function ActorPlacementTray({
  actors,
  search,
  canCreateToken,
  onSearchChange,
  onPlaceActor,
}: {
  actors: Actor[];
  search: string;
  canCreateToken: boolean;
  onSearchChange(value: string): void;
  onPlaceActor(actor: Actor): void;
}) {
  const [open, setOpen] = useState(Boolean(search.trim()));
  useEffect(() => {
    if (search.trim()) setOpen(true);
  }, [search]);
  const placeableActors = filterActorPlacementActors(actors, search);
  return (
    <details className="operator-section placement-tray placement-tray-disclosure" aria-label="Actor placement tray" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span><Users size={14} aria-hidden="true" /> Place actors</span>
        <span className="placement-tray-count">{formatNumber(actors.length)}</span>
      </summary>
      <div className="placement-tray-body">
      <label>
        <span>Search actors</span>
        <input aria-label="Search actors to place" value={search} placeholder="Character or NPC" onChange={(event) => onSearchChange(event.target.value)} />
      </label>
      <p className="admin-status" role="status">Showing {formatNumber(placeableActors.length)} of {formatNumber(actors.length)} actors.</p>
      <div className="placement-list">
        {placeableActors.length === 0 && <span className="empty-state compact">No actors match this search.</span>}
        {placeableActors.map((actor) => (
          <button
            className="placement-chip"
            key={actor.id}
            type="button"
            draggable={canCreateToken}
            aria-label={`Place ${actor.name} actor on scene`}
            title={canCreateToken ? "Click to place in the party staging area, or drag to an exact board position" : "Requires token.create"}
            disabled={!canCreateToken}
            onClick={() => onPlaceActor(actor)}
            onDragStart={(event) => {
              writeTokenDropData(event.dataTransfer, { type: "actor", id: actor.id, actorId: actor.id, name: actor.name, disposition: "friendly" });
              setTokenDropPreview(event.dataTransfer, actor.name);
            }}
          >
            <Users size={14} />
            <span>{actor.name}</span>
          </button>
        ))}
      </div>
      </div>
    </details>
  );
}
