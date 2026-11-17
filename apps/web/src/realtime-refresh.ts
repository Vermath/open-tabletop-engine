export const realtimeRefreshDebounceMs = 250;

export type RealtimeReconcileScope = "vision" | "lore" | "snapshot";
export type RealtimeApplyResult = "applied" | "ignored" | RealtimeReconcileScope;

export interface WorkspaceSelectionIdentity {
  campaignId: string;
  userId: string;
}

export function workspaceSelectionMatches(request: WorkspaceSelectionIdentity, current: WorkspaceSelectionIdentity): boolean {
  return request.campaignId === current.campaignId && request.userId === current.userId;
}

type StatusUpdater = string | ((current: string) => string);

export interface BoardCaptureRequestDecision {
  handled: boolean;
  requestId?: string;
  sceneId?: string;
  error?: string;
}

interface RealtimeHandlersInput {
  refresh: () => Promise<unknown>;
  handleBoardCaptureEvent: (data: unknown) => boolean;
  applyRealtimeEvent?: (data: unknown) => RealtimeApplyResult;
  reconcile?: (scopes: RealtimeReconcileScope[]) => Promise<unknown>;
  setStatus: (next: StatusUpdater) => void;
  onRefreshError: () => void;
}

interface RealtimeHandlers {
  onOpen: (reconnected?: boolean) => Promise<void>;
  onMessage: (data: unknown) => void;
  onError: () => void;
  dispose: () => void;
}

export function createRealtimeHandlers(input: RealtimeHandlersInput): RealtimeHandlers {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingReconcileScopes = new Set<RealtimeReconcileScope>();

  const clearRefreshTimer = () => {
    if (refreshTimer === undefined) return;
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
    pendingReconcileScopes.clear();
  };

  const scheduleReconcile = (scope: RealtimeReconcileScope) => {
    if (scope === "snapshot") {
      pendingReconcileScopes.clear();
      pendingReconcileScopes.add("snapshot");
    } else if (!pendingReconcileScopes.has("snapshot")) {
      pendingReconcileScopes.add(scope);
    }
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      const scopes = pendingReconcileScopes.has("snapshot")
        ? (["snapshot"] satisfies RealtimeReconcileScope[])
        : [...pendingReconcileScopes];
      pendingReconcileScopes.clear();
      const task = input.reconcile ? input.reconcile(scopes) : input.refresh();
      task.catch(input.onRefreshError);
    }, realtimeRefreshDebounceMs);
  };

  return {
    onOpen: async (reconnected = false) => {
      clearRefreshTimer();
      if (reconnected) {
        // A reconnect has no event cursor or replay contract. The only safe
        // boundary is a new permission-filtered campaign snapshot.
        await input.refresh();
        return;
      }
      input.setStatus((current) => (current === "Loading campaign" || current.toLowerCase().includes("realtime") || current.startsWith("API offline") ? "Realtime connected" : current));
    },
    onMessage: (data) => {
      if (input.handleBoardCaptureEvent(data)) return;
      const result = input.applyRealtimeEvent?.(data) ?? "snapshot";
      if (result === "vision" || result === "lore" || result === "snapshot") scheduleReconcile(result);
    },
    onError: () => input.setStatus("Realtime unavailable"),
    dispose: clearRefreshTimer
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parsedRealtimeData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

export function boardCaptureRequestDecision(data: unknown, currentSceneId?: string, nowMs = Date.now()): BoardCaptureRequestDecision {
  const event = recordValue(parsedRealtimeData(data));
  if (event?.type !== "agent.boardCaptureRequested") return { handled: false };
  const payload = recordValue(event.payload);
  const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
  if (!requestId) return { handled: false };
  const requestedSceneId = typeof payload?.sceneId === "string" && payload.sceneId.trim() ? payload.sceneId : undefined;
  const expiresAt = typeof payload?.expiresAt === "string" ? payload.expiresAt : undefined;
  if (expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      return {
        handled: true,
        requestId,
        sceneId: currentSceneId,
        error: "Board capture request expired before this web client could process it."
      };
    }
  }
  if (requestedSceneId && requestedSceneId !== currentSceneId) {
    return {
      handled: true,
      requestId,
      sceneId: currentSceneId,
      error: "Requested board scene is not open in this web client."
    };
  }
  return { handled: true, requestId, sceneId: requestedSceneId ?? currentSceneId };
}
