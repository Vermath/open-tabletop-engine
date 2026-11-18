import type { CompendiumCatalogEntry } from "@open-tabletop/core";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";
import { setTokenDropPreview, writeTokenDropData } from "./token-drag.js";

export function isPlaceableMonster(entry: CompendiumCatalogEntry): boolean {
  return entry.type === "monster" && entry.provenance.systemId === "dnd-5e-srd" &&
    (entry.id.startsWith("srd-monster:") || (entry.id.startsWith("campaign-item:") && entry.data.customContentKind === "monster" && entry.data.builderSchemaVersion === "1.0.0"));
}

export function MonsterPlacementButton({ entry, sceneId, onPlace }: {
  entry: CompendiumCatalogEntry; sceneId?: string; onPlace?(entryId: string, attemptId: string): Promise<void>;
}) {
  const action = useRetryableAction(sceneId);
  const enabled = Boolean(sceneId && onPlace && action.operation?.kind !== "pending");
  return <>
    <button type="button" className="ghost-button" disabled={!enabled} draggable={enabled}
      aria-label={`Place ${entry.name} on map`}
      title={enabled ? "Place at the center of the map, or drag to a map position" : "Select a scene with actor and token creation permission"}
      onClick={() => {
        if (!enabled) return;
        const attemptId = crypto.randomUUID();
        void action.runAction("Place " + entry.name, () => onPlace!(entry.id, attemptId));
      }}
      onDragStart={(event) => {
        if (!enabled) return;
        writeTokenDropData(event.dataTransfer, { type: "monster", id: entry.id, name: entry.name, attemptId: crypto.randomUUID() });
        setTokenDropPreview(event.dataTransfer, entry.name);
      }}>Place on map</button>
    <RetryableActionNotice operation={action.operation} onRetry={action.retryAction} onDismiss={action.clearAction} />
  </>;
}
