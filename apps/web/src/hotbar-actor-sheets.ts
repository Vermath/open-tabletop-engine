import type { Actor, DeclarativeActorSheet, Item } from "@open-tabletop/core";
import { useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import type { ActorSheetQuickRoll } from "./actor-sheet-data.js";

export type HotbarSheet = DeclarativeActorSheet | { kind?: undefined; quickRolls: ActorSheetQuickRoll[] };
type SheetResult = { revision: string; sheet?: HotbarSheet; error?: string };

/** Only request the actors needed for assigned slots and the open picker. */
export function useHotbarSheets(actors: Actor[], items: Item[], requestedIds: Set<string>) {
  const requests = actors.filter((actor) => requestedIds.has(actor.id)).map((actor) => ({
    id: actor.id,
    path: `/api/v1/campaigns/${encodeURIComponent(actor.campaignId)}/systems/${encodeURIComponent(actor.systemId)}/actors/${encodeURIComponent(actor.id)}/sheet`,
    revision: JSON.stringify([actor.systemId, actor.updatedAt, items.filter((item) => item.actorId === actor.id).map((item) => [item.id, item.updatedAt])])
  }));
  const requestKey = JSON.stringify(requests);
  const cache = useRef(new Map<string, SheetResult>());
  const [, refresh] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const ids = new Set(requests.map((request) => request.id));
    for (const id of cache.current.keys()) if (!ids.has(id)) cache.current.delete(id);
    for (const request of requests) {
      const cached = cache.current.get(request.id);
      if (cached?.revision === request.revision && cached.sheet) continue;
      const finish = (result: SheetResult) => {
        if (controller.signal.aborted) return;
        cache.current.set(request.id, result);
        refresh((n) => n + 1);
      };
      apiGet<HotbarSheet>(request.path, { signal: controller.signal })
        .then((sheet) => finish({ revision: request.revision, sheet }))
        .catch((error) => finish({ revision: request.revision, error: error instanceof Error ? error.message : String(error) }));
    }
    return () => controller.abort();
  }, [requestKey, attempt]);

  function resultFor(actorId: string | undefined) {
    const request = requests.find((entry) => entry.id === actorId);
    if (!request) return;
    const result = cache.current.get(request.id);
    return result?.revision === request.revision ? result : undefined;
  }
  return { resultFor, retry: () => setAttempt((n) => n + 1) };
}
