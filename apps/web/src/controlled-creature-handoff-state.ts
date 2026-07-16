import type { DndControlledCreatureActionHandoff } from "@open-tabletop/core";

import type { LifecycleDraft } from "./controlled-creatures-panel.js";

export const controlledCreatureHandoffStateVersion = 1;
export const controlledCreatureHandoffLifetimeMs = 24 * 60 * 60 * 1_000;
const controlledCreatureHandoffPrefix = "otte:controlled-creature-handoff";

export interface ControlledCreatureHandoffScope {
  campaignId: string;
  userId: string;
}

export interface ControlledCreatureHandoffState {
  handoff: DndControlledCreatureActionHandoff;
  draft: LifecycleDraft;
  savedAt: number;
}

interface StoredControlledCreatureHandoffState extends ControlledCreatureHandoffState {
  version: typeof controlledCreatureHandoffStateVersion;
  scope: ControlledCreatureHandoffScope;
  expiresAt: number;
}

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function controlledCreatureHandoffStorageKey(scope: ControlledCreatureHandoffScope): string {
  return `${controlledCreatureHandoffPrefix}:v${controlledCreatureHandoffStateVersion}:${encodeURIComponent(scope.campaignId)}:${encodeURIComponent(scope.userId)}`;
}

export function sameControlledCreatureHandoff(first: DndControlledCreatureActionHandoff, second: DndControlledCreatureActionHandoff): boolean {
  return first.action.actorId === second.action.actorId
    && first.action.rollId === second.action.rollId
    && first.action.preparedPreviewKey === second.action.preparedPreviewKey
    && first.action.resolutionHash === second.action.resolutionHash;
}

export function saveControlledCreatureHandoff(
  storage: Pick<HandoffStorage, "setItem" | "removeItem">,
  scope: ControlledCreatureHandoffScope,
  handoff: DndControlledCreatureActionHandoff,
  draft: LifecycleDraft,
  now = Date.now(),
): void {
  if (!isRestorableHandoff(handoff) || !isLifecycleDraft(draft)) {
    clearControlledCreatureHandoff(storage, scope);
    return;
  }
  const stored: StoredControlledCreatureHandoffState = {
    version: controlledCreatureHandoffStateVersion,
    scope,
    savedAt: now,
    expiresAt: now + controlledCreatureHandoffLifetimeMs,
    handoff,
    draft: persistedDraft(draft),
  };
  try {
    storage.setItem(controlledCreatureHandoffStorageKey(scope), JSON.stringify(stored, (key, value) => key === "previewToken" ? undefined : value));
  } catch {
    clearControlledCreatureHandoff(storage, scope);
  }
}

export function loadControlledCreatureHandoff(
  storage: Pick<HandoffStorage, "getItem" | "removeItem">,
  scope: ControlledCreatureHandoffScope,
  now = Date.now(),
): ControlledCreatureHandoffState | undefined {
  const key = controlledCreatureHandoffStorageKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Partial<StoredControlledCreatureHandoffState>;
    const validEnvelope = stored.version === controlledCreatureHandoffStateVersion
      && sameScope(stored.scope, scope)
      && finite(stored.savedAt)
      && finite(stored.expiresAt)
      && stored.expiresAt - stored.savedAt === controlledCreatureHandoffLifetimeMs
      && stored.expiresAt > now;
    if (!validEnvelope || !isRestorableHandoff(stored.handoff) || !isLifecycleDraft(stored.draft)) {
      storage.removeItem(key);
      return undefined;
    }
    return { handoff: stored.handoff, draft: persistedDraft(stored.draft), savedAt: stored.savedAt! };
  } catch {
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return undefined;
  }
}

export function clearControlledCreatureHandoff(storage: Pick<HandoffStorage, "removeItem">, scope: ControlledCreatureHandoffScope): void {
  try { storage.removeItem(controlledCreatureHandoffStorageKey(scope)); } catch { /* Storage may be unavailable. */ }
}

function sameScope(value: unknown, scope: ControlledCreatureHandoffScope): boolean {
  return record(value) && value.campaignId === scope.campaignId && value.userId === scope.userId;
}

function isRestorableHandoff(value: unknown): value is DndControlledCreatureActionHandoff {
  if (!record(value) || value.version !== 1 || (value.status !== "supported" && value.status !== "manual_required") || !record(value.action) || !record(value.prefill)) return false;
  const action = value.action;
  const prefill = value.prefill;
  const origin = prefill.originatingAction;
  return strings(action.actorId, action.rollId, action.label, action.preparedPreviewKey, action.resolutionHash)
    && controlledCreatureKinds.has(prefill.kind as string)
    && source(prefill.source)
    && prefill.source.actorId === action.actorId
    && strings(prefill.controllerActorId)
    && optionalStrings(prefill.controllerUserId, prefill.ownerUserId, prefill.sceneId, prefill.combatId, prefill.targetActorId)
    && originatingAction(origin)
    && origin.actorId === action.actorId
    && origin.rollId === action.rollId
    && origin.label === action.label
    && origin.preparedPreviewKey === action.preparedPreviewKey
    && origin.resolutionHash === action.resolutionHash
    && optionalActor(prefill.actor)
    && optionalToken(prefill.token)
    && optionalDuration(prefill.duration)
    && optionalConcentration(prefill.concentration)
    && optionalInitiative(prefill.initiative)
    && optionalCommand(prefill.command)
    && optionalTransformation(prefill.transformation)
    && Array.isArray(value.sourcedFields) && value.sourcedFields.every((field) => typeof field === "string")
    && Array.isArray(value.manualChoices) && value.manualChoices.every((choice) => record(choice) && handoffFields.has(choice.field as string) && typeof choice.reason === "string");
}

function isLifecycleDraft(value: unknown): value is LifecycleDraft {
  if (!record(value)) return false;
  const draft = value as Partial<LifecycleDraft>;
  return controlledCreatureKinds.has(draft.kind as string)
    && [draft.sourceActorId, draft.sourceItemId, draft.targetActorId, draft.sceneId, draft.combatId, draft.name, draft.actorType, draft.rulesVersion, draft.expiresAt, draft.concentrationGroupId].every((item) => typeof item === "string")
    && [draft.hpCurrent, draft.hpMax, draft.tokenX, draft.tokenY, draft.tokenSize, draft.expiresAtRound, draft.initiativeValue].every(finite)
    && record(draft.actorData)
    && (draft.disposition === "friendly" || draft.disposition === "neutral" || draft.disposition === "hostile")
    && durationModes.has(draft.durationMode as string)
    && (draft.initiativeMode === "shared" || draft.initiativeMode === "independent")
    && typeof draft.commandRequired === "boolean"
    && commandActions.has(draft.commandAction as string)
    && (draft.hpCarryover === "preserve" || draft.hpCarryover === "replace")
    && (draft.equipmentCarryover === "preserve" || draft.equipmentCarryover === "suppress");
}

function persistedDraft(draft: LifecycleDraft): LifecycleDraft {
  return {
    kind: draft.kind, sourceActorId: draft.sourceActorId, sourceItemId: draft.sourceItemId, targetActorId: draft.targetActorId, sceneId: draft.sceneId, combatId: draft.combatId,
    name: draft.name, actorType: draft.actorType, rulesVersion: draft.rulesVersion, hpCurrent: draft.hpCurrent, hpMax: draft.hpMax, actorData: draft.actorData,
    tokenX: draft.tokenX, tokenY: draft.tokenY, tokenSize: draft.tokenSize, disposition: draft.disposition, durationMode: draft.durationMode, expiresAtRound: draft.expiresAtRound,
    expiresAt: draft.expiresAt, concentrationGroupId: draft.concentrationGroupId, initiativeMode: draft.initiativeMode, initiativeValue: draft.initiativeValue,
    commandRequired: draft.commandRequired, commandAction: draft.commandAction, hpCarryover: draft.hpCarryover, equipmentCarryover: draft.equipmentCarryover,
  };
}

function originatingAction(value: unknown): value is NonNullable<DndControlledCreatureActionHandoff["prefill"]["originatingAction"]> {
  return record(value) && strings(value.actorId, value.rollId, value.label, value.preparedPreviewKey, value.resolutionHash);
}

function source(value: unknown): value is DndControlledCreatureActionHandoff["prefill"]["source"] {
  return record(value) && (value.kind === "spell" || value.kind === "feature") && strings(value.actorId, value.name, value.systemId, value.rulesVersion) && value.systemId === "dnd-5e-srd" && optionalStrings(value.itemId);
}

function optionalActor(value: unknown): boolean {
  return value === undefined || (record(value) && optionalStrings(value.name, value.type, value.imageAssetId) && (value.data === undefined || record(value.data)));
}

function optionalToken(value: unknown): boolean {
  return value === undefined || (record(value)
    && optionalStrings(value.name, value.imageAssetId)
    && [value.x, value.y, value.width, value.height, value.rotation].every(optionalFinite)
    && (value.hidden === undefined || typeof value.hidden === "boolean")
    && (value.disposition === undefined || value.disposition === "friendly" || value.disposition === "neutral" || value.disposition === "hostile"));
}

function optionalDuration(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  if (value.mode === "rounds") return typeof value.combatId === "string" && finite(value.expiresAtRound);
  if (value.mode === "until_time") return typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt));
  return value.mode === "until_dismissed" || value.mode === "persistent";
}

function optionalConcentration(value: unknown): boolean {
  return value === undefined || (record(value) && strings(value.sourceActorId, value.groupId));
}

function optionalInitiative(value: unknown): boolean {
  return value === undefined || (record(value) && ((value.mode === "shared" && typeof value.sourceActorId === "string") || (value.mode === "independent" && optionalFinite(value.value))));
}

function optionalCommand(value: unknown): boolean {
  return value === undefined || (record(value) && typeof value.required === "boolean" && commandActions.has(value.action as string) && optionalStrings(value.note));
}

function optionalTransformation(value: unknown): boolean {
  return value === undefined || (record(value)
    && (value.hpCarryover === undefined || value.hpCarryover === "preserve" || value.hpCarryover === "replace")
    && (value.equipmentCarryover === undefined || value.equipmentCarryover === "preserve" || value.equipmentCarryover === "suppress"));
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strings(...values: unknown[]): boolean {
  return values.every((value) => typeof value === "string" && value.length > 0);
}

function optionalStrings(...values: unknown[]): boolean {
  return values.every((value) => value === undefined || typeof value === "string");
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalFinite(value: unknown): boolean {
  return value === undefined || finite(value);
}

const controlledCreatureKinds = new Set(["summon", "transformation", "persistent_companion"]);
const durationModes = new Set(["rounds", "until_time", "until_dismissed", "persistent"]);
const commandActions = new Set(["action", "bonus_action", "reaction", "free", "none"]);
const handoffFields = new Set(["actor.name", "actor.type", "actor.statBlock", "actor.hitPoints", "sceneId", "token", "duration", "concentration", "initiative", "command", "transformation.form", "transformation.equipmentCarryover"]);
