export const realtimeRefreshDebounceMs = 250;

type StatusUpdater = string | ((current: string) => string);

interface RealtimeHandlersInput {
  refresh: () => Promise<unknown>;
  handleBoardCaptureEvent: (data: unknown) => boolean;
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
