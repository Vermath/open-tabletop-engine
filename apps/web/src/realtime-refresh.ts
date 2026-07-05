export const realtimeRefreshDebounceMs = 250;

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
  applyRealtimeEvent?: (data: unknown) => void;
  setStatus: (next: StatusUpdater) => void;
  onRefreshError: () => void;
}

interface RealtimeHandlers {
  onOpen: () => void;
  onMessage: (data: unknown) => void;
  onError: () => void;
  dispose: () => void;
}

export function createRealtimeHandlers(input: RealtimeHandlersInput): RealtimeHandlers {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const clearRefreshTimer = () => {
    if (refreshTimer === undefined) return;
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  };

  return {
    onOpen: () => {
      input.setStatus((current) => (current === "Loading campaign" || current.toLowerCase().includes("realtime") || current.startsWith("API offline") ? "Realtime connected" : current));
    },
    onMessage: (data) => {
      if (input.handleBoardCaptureEvent(data)) return;
      input.applyRealtimeEvent?.(data);
      clearRefreshTimer();
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        input.refresh().catch(input.onRefreshError);
      }, realtimeRefreshDebounceMs);
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
