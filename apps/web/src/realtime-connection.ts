export const realtimeReconnectInitialDelayMs = 1_000;
export const realtimeReconnectMaxDelayMs = 30_000;
export const realtimePresenceHeartbeatIntervalMs = 15_000;

export type RealtimeUiState = "idle" | "connecting" | "connected" | "reconnecting" | "syncing";

export function realtimeUiLabel(state: RealtimeUiState): "Ready" | "Connecting" | "Connected" | "Reconnecting" | "Syncing" {
  if (state === "connecting") return "Connecting";
  if (state === "connected") return "Connected";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "syncing") return "Syncing";
  return "Ready";
}

export interface RealtimeOpenContext {
  /** True whenever this socket was created after the connection's first socket attempt. */
  reconnected: boolean;
}

export interface RealtimeConnectionIdentityInput {
  blankCanvasDemoOpen: boolean;
  campaignId: string;
  sessionToken: string;
  sceneId?: string;
}

export interface RealtimeSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
}

type RealtimeTimerId = ReturnType<typeof globalThis.setTimeout>;

export interface StartRealtimeConnectionOptions {
  apiBase: string;
  origin: string;
  campaignId: string;
  sessionToken: string;
  socketFactory?: (url: string, protocols: string[]) => RealtimeSocketLike;
  scheduleTimeout?: (callback: () => void, delayMs: number) => RealtimeTimerId;
  clearScheduledTimeout?: (timerId: RealtimeTimerId) => void;
  activeSceneId?: () => string | undefined;
  heartbeatIntervalMs?: number;
  onMessage: (data: unknown) => void;
  onOpen?: (context: RealtimeOpenContext) => void;
  onUnavailable?: () => void;
  onReconnectScheduled?: (delayMs: number) => void;
}

export function realtimeConnectionIdentity(input: RealtimeConnectionIdentityInput): string | null {
  if (input.blankCanvasDemoOpen || !input.campaignId || !input.sessionToken) return null;
  return `${input.campaignId}:${input.sessionToken}`;
}

export function realtimeReconnectDelayMs(attempt: number): number {
  return Math.min(realtimeReconnectMaxDelayMs, realtimeReconnectInitialDelayMs * 2 ** Math.max(0, attempt));
}

export function realtimeWebSocketUrl(input: { apiBase: string; origin: string; campaignId: string }): string {
  const base = (input.apiBase || input.origin).replace(/\/$/, "");
  return `${base.replace(/^http/, "ws")}/api/v1/realtime?campaignId=${encodeURIComponent(input.campaignId)}`;
}

export function startRealtimeConnection(options: StartRealtimeConnectionOptions): () => void {
  const socketFactory = options.socketFactory ?? ((url, protocols) => new WebSocket(url, protocols) as unknown as RealtimeSocketLike);
  const scheduleTimeout = options.scheduleTimeout ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearScheduledTimeout = options.clearScheduledTimeout ?? ((timerId) => globalThis.clearTimeout(timerId));
  let stopped = false;
  let socket: RealtimeSocketLike | null = null;
  let reconnectTimer: RealtimeTimerId | null = null;
  let heartbeatTimer: RealtimeTimerId | null = null;
  let reconnectAttempt = 0;
  let socketAttempt = 0;

  function clearReconnectTimer() {
    if (reconnectTimer === null) return;
    clearScheduledTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearHeartbeatTimer() {
    if (heartbeatTimer === null) return;
    clearScheduledTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer !== null) return;
    const delayMs = realtimeReconnectDelayMs(reconnectAttempt);
    reconnectAttempt += 1;
    options.onReconnectScheduled?.(delayMs);
    reconnectTimer = scheduleTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function connect() {
    if (stopped) return;
    const reconnected = socketAttempt > 0;
    socketAttempt += 1;
    const url = realtimeWebSocketUrl({ apiBase: options.apiBase, origin: options.origin, campaignId: options.campaignId });
    const protocols = ["otte.v1", `otte.auth.${options.sessionToken}`];
    try {
      socket = socketFactory(url, protocols);
    } catch {
      options.onUnavailable?.();
      scheduleReconnect();
      return;
    }

    const currentSocket = socket;
    let reconnectScheduledForSocket = false;
    const scheduleReconnectForCurrentSocket = () => {
      if (stopped || reconnectScheduledForSocket) return;
      reconnectScheduledForSocket = true;
      clearHeartbeatTimer();
      if (socket === currentSocket) socket = null;
      options.onUnavailable?.();
      scheduleReconnect();
    };
    const sendPresenceHeartbeat = () => {
      if (stopped || socket !== currentSocket || reconnectScheduledForSocket) return;
      try {
        const sceneId = options.activeSceneId?.();
        currentSocket.send(JSON.stringify({ type: "presence.heartbeat", ...(sceneId ? { sceneId } : {}) }));
      } catch {
        scheduleReconnectForCurrentSocket();
        currentSocket.close();
        return;
      }
      heartbeatTimer = scheduleTimeout(sendPresenceHeartbeat, options.heartbeatIntervalMs ?? realtimePresenceHeartbeatIntervalMs);
    };

    currentSocket.onopen = () => {
      // A failed socket can still dispatch a late open in some runtimes. Never
      // let that stale transport supersede the current connection attempt.
      if (stopped || socket !== currentSocket || reconnectScheduledForSocket) return;
      reconnectAttempt = 0;
      clearHeartbeatTimer();
      sendPresenceHeartbeat();
      options.onOpen?.({ reconnected });
    };
    currentSocket.onmessage = (event) => {
      // Error/close can be followed by queued messages from that transport.
      // Only the socket that still owns the active attempt may update state.
      if (stopped || socket !== currentSocket || reconnectScheduledForSocket) return;
      options.onMessage(event.data);
    };
    currentSocket.onerror = () => {
      scheduleReconnectForCurrentSocket();
      currentSocket.close();
    };
    currentSocket.onclose = () => {
      scheduleReconnectForCurrentSocket();
    };
  }

  connect();

  return () => {
    stopped = true;
    clearReconnectTimer();
    clearHeartbeatTimer();
    const activeSocket = socket;
    socket = null;
    if (!activeSocket) return;
    activeSocket.onopen = null;
    activeSocket.onmessage = null;
    activeSocket.onerror = null;
    activeSocket.onclose = null;
    activeSocket.close();
  };
}
