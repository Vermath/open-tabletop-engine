import type { EngineEvent, EngineState, Scene, SceneMapPin } from "@open-tabletop/core";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const pinFields = new Set(["id", "label", "targetType", "targetId", "audience", "x", "y"]);
const pinLimit = 500;

export function validMapPin(value: unknown): value is SceneMapPin {
  return record(value) && Object.keys(value).every((field) => pinFields.has(field))
    && typeof value.id === "string" && /^[\w:-]{1,160}$/.test(value.id)
    && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 40
    && (value.targetType === "journal" || value.targetType === "handout")
    && typeof value.targetId === "string" && value.targetId.length > 0 && value.targetId.length <= 200
    && (value.audience === "gm" || value.audience === "readers")
    && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0
    && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0;
}

export function validMapPinCollection(value: unknown): value is SceneMapPin[] {
  return Array.isArray(value) && value.length <= pinLimit && value.every(validMapPin)
    && new Set(value.map((pin) => pin.id)).size === value.length;
}

export function editMapPin(scene: Scene, command: unknown, canReadTarget: (pin: SceneMapPin) => boolean): string | undefined {
  const pins = scene.mapPins ?? [];
  if (record(command) && Object.keys(command).length === 1 && typeof command.remove === "string") {
    const index = pins.findIndex((pin) => pin.id === command.remove && canReadTarget(pin));
    if (index < 0) return "Map pin is unavailable";
    scene.mapPins = pins.filter((_, i) => i !== index);
    return;
  }
  if (!validMapPin(command)) return "Provide a pin ID, label, linked entry, audience and coordinates";
  if (command.x > scene.width || command.y > scene.height) return "Map pin must be inside the scene";
  if (!canReadTarget(command)) return "Linked entry is unavailable";
  const existing = pins.find((pin) => pin.id === command.id);
  if (existing && !canReadTarget(existing)) return "Map pin is unavailable";
  if (!existing && pins.length >= pinLimit) return "Scene has reached its map pin limit";
  scene.mapPins = existing ? pins.map((pin) => pin.id === command.id ? command : pin) : [...pins, command];
}

// Use the current authoritative record even for historical/replayed scene payloads.
// Previously shared positions and labels can themselves be secrets.
export function projectMapPins(scene: Scene, current: Scene | undefined, canReadGmPins: boolean, canReadTarget: (pin: SceneMapPin) => boolean): Scene {
  if (scene.mapPins === undefined) return scene;
  const requested = new Set(Array.isArray(scene.mapPins) ? scene.mapPins.filter(validMapPin).map((pin) => pin.id) : []);
  const mapPins = (Array.isArray(current?.mapPins) ? current.mapPins : []).filter((pin) => requested.has(pin.id) && validMapPin(pin)
    && (pin.audience === "readers" || canReadGmPins) && canReadTarget(pin));
  return { ...scene, mapPins };
}

export function mapPinAccessMayChange(state: EngineState, event: EngineEvent): boolean {
  if (!["journal.updated", "handout.updated", "actor.updated", "actor.deleted"].includes(event.type)) return false;
  // A deletion can already have removed the actor from character audiences.
  if (event.type === "actor.deleted") return state.scenes.some((scene) => scene.campaignId === event.campaignId && scene.mapPins?.some((pin) => pin.audience === "readers"));
  const affected = event.type.startsWith("actor.")
    ? new Set([...state.journals, ...state.handouts].filter((entry) => entry.campaignId === event.campaignId && event.targetId && entry.visibleToActorIds?.includes(event.targetId)).map((entry) => entry.id))
    : new Set([event.targetId]);
  return state.scenes.some((scene) => scene.campaignId === event.campaignId && scene.mapPins?.some((pin) => affected.has(pin.targetId)));
}

export function detachMapPins(state: EngineState, campaignId: string, type: SceneMapPin["targetType"], id: string, nextRevision: (previous: string) => string): Scene[] {
  const changed: Scene[] = [];
  for (const scene of state.scenes) {
    if (scene.campaignId !== campaignId || !scene.mapPins?.some((pin) => pin.targetType === type && pin.targetId === id)) continue;
    scene.mapPins = scene.mapPins.filter((pin) => pin.targetType !== type || pin.targetId !== id);
    scene.updatedAt = nextRevision(scene.updatedAt);
    changed.push(scene);
  }
  return changed;
}
