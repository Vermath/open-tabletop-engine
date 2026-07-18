export interface ActionPreviewFingerprintInput {
  campaignId: string;
  actorId: string;
  actorUpdatedAt: string;
  systemId: string;
  rollId: string;
  targetActorId: string;
  targetActorUpdatedAt?: string;
  applyEffect: boolean;
  consumeResources: boolean;
  saveOutcomes?: Readonly<Record<string, string>>;
  effectChoice?: string;
  continuationId?: string;
  weaponMastery?: unknown;
  actorRevisions?: ReadonlyArray<{ id: string; updatedAt: string }>;
  itemRevisions?: ReadonlyArray<{ id: string; updatedAt: string }>;
  combat?: {
    id: string;
    updatedAt: string;
    round: number;
    turnIndex: number;
    activeCombatantId?: string;
  };
}

export type ActionPreviewPhase = "idle" | "stale" | "loading" | "ready" | "error";

export interface ActionPreviewState<TPreview> {
  phase: ActionPreviewPhase;
  requestId: number;
  refreshToken: number;
  fingerprint?: string;
  preview?: TPreview;
  message: string;
}

export type ActionPreviewStateAction<TPreview> =
  | { type: "reset" }
  | { type: "invalidate"; message?: string }
  | { type: "request"; requestId: number; fingerprint: string }
  | { type: "resolve"; requestId: number; fingerprint: string; preview: TPreview }
  | { type: "reject"; requestId: number; fingerprint: string; message: string };

export interface ActionPreviewCriticalOutcome {
  targetActorId: string;
  naturalD20?: number;
  criticalMinimum: number;
  outcome: "miss" | "hit" | "critical-hit" | "unresolved";
  criticalNegated: boolean;
  finalCritical: boolean;
}

export interface ActionPreviewContinuationMetadata {
  continuationId?: string;
  criticalOutcomes: ActionPreviewCriticalOutcome[];
  criticalHitTargetActorIds: string[];
}

export interface ActionPreviewContinuationTicket extends ActionPreviewContinuationMetadata {
  continuationId: string;
  sourceRollId?: string;
  targetActorIds: string[];
  armedAt?: string;
}

export interface ActorActionDraftScope {
  campaignId: string;
  actorId: string;
  sceneId?: string;
  combatId?: string;
}

export interface ActorActionDraftState {
  scopeKey: string;
  targetActorId: string;
  applyEffect: boolean;
  consumeResources: boolean;
}

export interface ActorActionTargetToken {
  actorId?: string;
  sceneId: string;
}

/**
 * Action controls are intentionally scoped to one source actor on one board and
 * combat. A new scope must never inherit a destructive target or effect toggle.
 */
export function actorActionDraftScopeKey(scope: ActorActionDraftScope): string {
  return [scope.campaignId, scope.actorId, scope.sceneId ?? "no-scene", scope.combatId ?? "no-combat"].join(":");
}

export function initialActorActionDraft(scopeKey: string, actorId: string): ActorActionDraftState {
  return { scopeKey, targetActorId: actorId, applyEffect: false, consumeResources: true };
}

/** Returns safe defaults synchronously, before the scope-reset effect runs. */
export function actorActionDraftForScope(state: ActorActionDraftState, scopeKey: string, actorId: string): ActorActionDraftState {
  return state.scopeKey === scopeKey ? state : initialActorActionDraft(scopeKey, actorId);
}

/**
 * Targets follow the visible scene when one is selected. Combatants are a
 * fallback only when there is no scene; without either context only the source
 * actor is valid. This prevents actors left on old maps from leaking into a new
 * encounter's target picker.
 */
export function scopedActorActionTargetIds(input: {
  actorIds: ReadonlyArray<string>;
  tokens: ReadonlyArray<ActorActionTargetToken>;
  sourceActorId: string;
  sceneId?: string;
  combatActorIds?: ReadonlyArray<string>;
}): string[] {
  const allowed = new Set<string>([input.sourceActorId]);
  if (input.sceneId) {
    for (const token of input.tokens) {
      if (token.sceneId === input.sceneId && token.actorId) allowed.add(token.actorId);
    }
  } else if (input.combatActorIds?.length) {
    for (const actorId of input.combatActorIds) allowed.add(actorId);
  }
  return input.actorIds.filter((actorId) => allowed.has(actorId));
}

export function actorActionTargetLabel(actor: { id: string; name: string }, actors: ReadonlyArray<{ id: string; name: string }>, context?: string): string {
  const normalizedName = actor.name.trim().toLocaleLowerCase();
  const duplicateName = actors.some((candidate) => candidate.id !== actor.id && candidate.name.trim().toLocaleLowerCase() === normalizedName);
  return duplicateName ? `${actor.name} (${context?.trim() || actor.id})` : actor.name;
}

export function createActionPreviewFingerprint(input: ActionPreviewFingerprintInput): string {
  return JSON.stringify(stableValue(input));
}

export function initialActionPreviewState<TPreview>(): ActionPreviewState<TPreview> {
  return { phase: "idle", requestId: 0, refreshToken: 0, message: "" };
}

export function reduceActionPreviewState<TPreview>(
  state: ActionPreviewState<TPreview>,
  action: ActionPreviewStateAction<TPreview>
): ActionPreviewState<TPreview> {
  switch (action.type) {
    case "reset":
      if (state.phase === "idle" && !state.fingerprint && !state.preview && !state.message) return state;
      return { phase: "idle", requestId: state.requestId, refreshToken: state.refreshToken, message: "" };
    case "invalidate":
      return {
        phase: "stale",
        requestId: state.requestId,
        refreshToken: state.refreshToken + 1,
        message: action.message ?? "Preview changed; refreshing"
      };
    case "request":
      return {
        phase: "loading",
        requestId: action.requestId,
        refreshToken: state.refreshToken,
        fingerprint: action.fingerprint,
        message: "Previewing"
      };
    case "resolve":
      if (state.phase !== "loading" || state.requestId !== action.requestId || state.fingerprint !== action.fingerprint) return state;
      return {
        phase: "ready",
        requestId: action.requestId,
        refreshToken: state.refreshToken,
        fingerprint: action.fingerprint,
        preview: action.preview,
        message: "Preview ready"
      };
    case "reject":
      if (state.phase !== "loading" || state.requestId !== action.requestId || state.fingerprint !== action.fingerprint) return state;
      return {
        phase: "error",
        requestId: action.requestId,
        refreshToken: state.refreshToken,
        fingerprint: action.fingerprint,
        message: action.message
      };
  }
}

export function actionPreviewForFingerprint<TPreview>(state: ActionPreviewState<TPreview>, fingerprint: string | undefined): TPreview | undefined {
  return state.phase === "ready" && fingerprint !== undefined && state.fingerprint === fingerprint ? state.preview : undefined;
}

export function actionPreviewIsReady<TPreview>(state: ActionPreviewState<TPreview>, fingerprint: string | undefined): boolean {
  return actionPreviewForFingerprint(state, fingerprint) !== undefined;
}

export function actionPreviewStatusMessage<TPreview>(state: ActionPreviewState<TPreview>, fingerprint: string | undefined): string {
  if (!fingerprint) return "";
  if (state.fingerprint && state.fingerprint !== fingerprint) return "Preview changed; refreshing";
  return state.message;
}

export function actionPreviewContinuationMetadata(preview: unknown): ActionPreviewContinuationMetadata {
  const root = record(preview);
  const metadata = record(record(root.action).metadata);
  const continuationId = nonEmptyString(metadata.continuationId);
  const criticalHitTargetActorIds = stringList(metadata.criticalHitTargetActorIds);
  const criticalOutcomes = Array.isArray(metadata.criticalOutcomes)
    ? metadata.criticalOutcomes.flatMap((value): ActionPreviewCriticalOutcome[] => {
        const outcome = record(value);
        const targetActorId = nonEmptyString(outcome.targetActorId);
        const criticalMinimum = finiteInteger(outcome.criticalMinimum);
        const result = outcome.outcome;
        if (!targetActorId || criticalMinimum === undefined || (result !== "miss" && result !== "hit" && result !== "critical-hit" && result !== "unresolved")) return [];
        const naturalD20 = finiteInteger(outcome.naturalD20);
        return [{
          targetActorId,
          ...(naturalD20 !== undefined ? { naturalD20 } : {}),
          criticalMinimum,
          outcome: result,
          criticalNegated: outcome.criticalNegated === true,
          finalCritical: outcome.finalCritical === true
        }];
      })
    : [];
  return {
    ...(continuationId ? { continuationId } : {}),
    criticalOutcomes,
    criticalHitTargetActorIds
  };
}

/**
 * Reads only still-armed, same-turn continuation tickets that can authorize the
 * selected follow-up. The server remains authoritative when the ticket is used;
 * this mirror exists so the player can bind a preview to one exact predecessor.
 */
export function actionPreviewContinuationTickets(
  actorData: unknown,
  actorId: string,
  combat: { id: string; round: number; turnIndex: number } | undefined,
  rollId: string,
  targetActorIds: ReadonlyArray<string>
): ActionPreviewContinuationTicket[] {
  if (!combat || !actorId || !rollId) return [];
  const actionEconomy = record(record(actorData).rulesEngine).actionEconomy;
  const ledger = record(record(record(actionEconomy).continuations)[combat.id]);
  if (finiteInteger(ledger.round) !== combat.round || finiteInteger(ledger.turnIndex) !== combat.turnIndex || nonEmptyString(ledger.actorId) !== actorId) return [];
  const requestedTargets = [...new Set(targetActorIds.filter((targetId) => Boolean(targetId.trim())))];
  if (!Array.isArray(ledger.tickets)) return [];
  return ledger.tickets.flatMap((value): ActionPreviewContinuationTicket[] => {
    const ticket = record(value);
    const continuationId = nonEmptyString(ticket.continuationId);
    const allowances = Array.isArray(ticket.allowances) ? ticket.allowances.map(record) : [];
    const storedTargets = stringList(ticket.targetActorIds);
    const targetMatches = storedTargets.length === 0
      ? requestedTargets.length === 0
      : requestedTargets.length > 0 && requestedTargets.every((targetId) => storedTargets.includes(targetId));
    if (!continuationId || !targetMatches || !allowances.some((allowance) => nonEmptyString(allowance.rollId) === rollId)) return [];
    const metadata = actionPreviewContinuationMetadata({ action: { metadata: ticket } });
    const requestedTargetSet = new Set(requestedTargets);
    return [{
      continuationId,
      ...(nonEmptyString(ticket.sourceRollId) ? { sourceRollId: nonEmptyString(ticket.sourceRollId) } : {}),
      targetActorIds: storedTargets,
      ...(nonEmptyString(ticket.armedAt) ? { armedAt: nonEmptyString(ticket.armedAt) } : {}),
      criticalOutcomes: metadata.criticalOutcomes.filter((outcome) => requestedTargetSet.size === 0 || requestedTargetSet.has(outcome.targetActorId)),
      criticalHitTargetActorIds: metadata.criticalHitTargetActorIds.filter((targetId) => requestedTargetSet.size === 0 || requestedTargetSet.has(targetId))
    }];
  });
}

export function actionPreviewContinuationSelection(
  tickets: ReadonlyArray<ActionPreviewContinuationTicket>,
  preferredContinuationId: string | undefined
): ActionPreviewContinuationTicket | undefined {
  return tickets.find((ticket) => ticket.continuationId === preferredContinuationId)
    ?? (tickets.length === 1 ? tickets[0] : undefined);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)])
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())))] : [];
}
